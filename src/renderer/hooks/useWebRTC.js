import { useEffect, useRef, useState } from 'react'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

// WebRTC mesh: one RTCPeerConnection per remote peer, signaled over the socket.
// `localStream` is owned by the caller (so it can pick a mic device / meter it) —
// this hook just attaches it to every peer connection and reacts to `muted`.
export function useWebRTC({ socket, presence, selfId, localStream, muted }) {
  const peersRef = useRef({}) // peerId -> RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({}) // peerId -> MediaStream

  useEffect(() => {
    if (!socket || !localStream) return

    function createPeerConnection(peerId) {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('rtc:ice', { to: peerId, payload: e.candidate })
      }
      pc.ontrack = (e) => {
        setRemoteStreams(prev => ({ ...prev, [peerId]: e.streams[0] }))
      }
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
      peersRef.current[peerId] = pc
      return pc
    }

    async function callPeer(peerId) {
      const pc = createPeerConnection(peerId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('rtc:offer', { to: peerId, payload: offer })
    }

    async function onOffer({ from, payload }) {
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

    return () => {
      socket.off('rtc:offer', onOffer)
      socket.off('rtc:answer', onAnswer)
      socket.off('rtc:ice', onIce)
    }
  }, [socket, presence, selfId, localStream])

  // Tear down connections for peers who've left.
  useEffect(() => {
    Object.keys(peersRef.current).forEach(id => {
      if (!presence.find(p => p.id === id)) {
        peersRef.current[id]?.close()
        delete peersRef.current[id]
        setRemoteStreams(prev => {
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
  }, [])

  return { remoteStreams }
}
