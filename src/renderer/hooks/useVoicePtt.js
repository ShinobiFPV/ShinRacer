import { useCallback, useRef, useState } from 'react'

// Push-to-talk mic capture — hold to record, release to transcribe. No VAD,
// no wake word: every utterance is an explicit start()/stop() pair, matching
// what was asked for (imq2's voice pipeline supports wake-word/VAD auto-stop
// too, but this port deliberately only carries over the manual PTT path).
// Audio constraints mirror CommsView's existing getUserMedia call so mic
// behavior is consistent across the app.
export function useVoicePtt({ apiKey, model, language }) {
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false) // transcribing, after release
  const [error, setError] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  const start = useCallback(async () => {
    if (recorderRef.current) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
      })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch (e) {
      setError('Microphone access denied or unavailable.')
    }
  }, [])

  // Resolves with the transcript string, or null if recording/transcription failed.
  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return Promise.resolve(null)

    return new Promise((resolve) => {
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        recorderRef.current = null
        streamRef.current = null
        setRecording(false)

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size === 0) { resolve(null); return }

        setBusy(true)
        try {
          const dataUrl = await new Promise((res, rej) => {
            const reader = new FileReader()
            reader.onload = () => res(reader.result)
            reader.onerror = rej
            reader.readAsDataURL(blob)
          })
          const audioBase64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
          const res = await window.api.aiEngineer.transcribe({
            apiKey, model, language, audioBase64, mimeType: blob.type,
          })
          if (res.ok) {
            resolve(res.text)
          } else {
            setError(res.error)
            resolve(null)
          }
        } catch (e) {
          setError(e.message)
          resolve(null)
        } finally {
          setBusy(false)
        }
      }
      recorder.stop()
    })
  }, [apiKey, model, language])

  return { recording, busy, error, start, stop }
}
