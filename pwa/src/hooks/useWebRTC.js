import { useEffect, useRef, useState } from 'react'

// LAN fallback only — on a Tailscale network STUN isn't needed since Tailscale
// routes everything, but including a STUN server doesn't hurt.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

// WebRTC mesh: one RTCPeerConnection per remote peer, signaled over the socket.
// Identical logic to the Electron app's hook — RTCPeerConnection is a native
// browser API either way, so nothing here is Electron-specific.
// `localStream` is owned by the caller (so it can pick a mic device / meter it) —
// this hook just attaches it to every peer connection and reacts to `muted`.
export function useWebRTC({ socket, presence, selfId, localStream, muted }) {
  const peersRef = useRef({})     // peerId -> RTCPeerConnection
  const analysersRef = useRef({}) // peerId -> { ctx, analyser, data }
  const offererRef = useRef({})   // peerId -> true if we sent the original offer
  const reconnectRef = useRef(() => {})
  const [remoteStreams, setRemoteStreams] = useState({}) // peerId -> MediaStream
  const [speaking, setSpeaking] = useState({})           // peerId -> boolean
  const [connectionStates, setConnectionStates] = useState({}) // peerId -> RTCPeerConnection.connectionState

  useEffect(() => {
    if (!socket || !localStream) return

    function attachAnalyser(peerId, stream) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      analysersRef.current[peerId] = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) }
    }

    function cleanupPeer(peerId) {
      peersRef.current[peerId]?.close()
      delete peersRef.current[peerId]
      analysersRef.current[peerId]?.ctx.close()
      delete analysersRef.current[peerId]
      setRemoteStreams(prev => { const next = { ...prev }; delete next[peerId]; return next })
    }

    function createPeerConnection(peerId) {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('rtc:ice', { to: peerId, payload: e.candidate })
      }
      pc.ontrack = (e) => {
        setRemoteStreams(prev => ({ ...prev, [peerId]: e.streams[0] }))
        attachAnalyser(peerId, e.streams[0])
      }
      pc.onconnectionstatechange = () => {
        setConnectionStates(prev => ({ ...prev, [peerId]: pc.connectionState }))
        // Only the original offerer re-initiates on failure — avoids both sides
        // racing to re-offer at once ("glare").
        if (pc.connectionState === 'failed' && offererRef.current[peerId]) {
          cleanupPeer(peerId)
          callPeer(peerId)
        }
      }
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
      peersRef.current[peerId] = pc
      return pc
    }

    async function callPeer(peerId) {
      offererRef.current[peerId] = true
      const pc = createPeerConnection(peerId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('rtc:offer', { to: peerId, payload: offer })
    }

    async function onOffer({ from, payload }) {
      offererRef.current[from] = false
      const pc = peersRef.current[from] || createPeerConnection(from)
      await pc.setRemoteDescription(new RTCSessionDescription(payload))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('rtc:answer', { to: from, payload: answer })
    }

    async function onAnswer({ from, payload }) {
      const pc = peersRef.current[from]
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload))
    }

    async function onIce({ from, payload }) {
      const pc = peersRef.current[from]
      if (pc) { try { await pc.addIceCandidate(payload) } catch (e) { /* candidate arrived before remote description — safe to drop */ } }
    }

    socket.on('rtc:offer', onOffer)
    socket.on('rtc:answer', onAnswer)
    socket.on('rtc:ice', onIce)

    // Call every peer already present that we don't have a connection to yet.
    presence.filter(p => p.id !== selfId && !peersRef.current[p.id]).forEach(p => callPeer(p.id))

    // Exposed to consumers as a manual "Reconnect" action — always re-offers fresh,
    // regardless of who originally offered (a user-initiated retry, not auto-recovery).
    reconnectRef.current = (peerId) => {
      cleanupPeer(peerId)
      callPeer(peerId)
    }

    return () => {
      socket.off('rtc:offer', onOffer)
      socket.off('rtc:answer', onAnswer)
      socket.off('rtc:ice', onIce)
    }
  }, [socket, presence, selfId, localStream])

  // Poll each remote peer's audio level every 100ms and flip a speaking flag.
  useEffect(() => {
    const interval = setInterval(() => {
      setSpeaking(prev => {
        let changed = false
        const next = { ...prev }
        for (const [peerId, { analyser, data }] of Object.entries(analysersRef.current)) {
          analyser.getByteFrequencyData(data)
          const avg = data.reduce((a, b) => a + b, 0) / data.length
          const isSpeaking = avg > 12
          if (next[peerId] !== isSpeaking) { next[peerId] = isSpeaking; changed = true }
        }
        return changed ? next : prev
      })
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // Tear down connections + analysers for peers who've left.
  useEffect(() => {
    Object.keys(peersRef.current).forEach(id => {
      if (!presence.find(p => p.id === id)) {
        peersRef.current[id]?.close()
        delete peersRef.current[id]
        analysersRef.current[id]?.ctx.close()
        delete analysersRef.current[id]
        delete offererRef.current[id]
        setRemoteStreams(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        setSpeaking(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        setConnectionStates(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }
    })
  }, [presence])

  useEffect(() => {
    localStream?.getAudioTracks().forEach(t => { t.enabled = !muted })
  }, [localStream, muted])

  // Full teardown on unmount.
  useEffect(() => () => {
    Object.values(peersRef.current).forEach(pc => pc.close())
    peersRef.current = {}
    Object.values(analysersRef.current).forEach(({ ctx }) => ctx.close())
    analysersRef.current = {}
  }, [])

  const reconnect = (peerId) => reconnectRef.current?.(peerId)

  return { remoteStreams, speaking, connectionStates, reconnect }
}
