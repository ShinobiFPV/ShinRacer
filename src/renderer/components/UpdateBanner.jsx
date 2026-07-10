import { useState, useEffect } from 'react'
import { C } from './primitives'

const api = window.api

// Shown at the top of the app whenever an update is available or already
// downloaded — dismissible per session, but a *new* update (a fresh
// updater:status event) resets that dismissal so it can't be silently
// missed forever. 'up-to-date' and 'error' never render here; error surfaces
// in Settings' UpdateSection instead, per the Phase 16 spec.
export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null)
  const [progress, setProgress] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const unsubStatus = api.updater.onStatus(info => {
      setUpdateInfo(info)
      setDismissed(false)
    })
    const unsubProgress = api.updater.onProgress(p => setProgress(p))
    return () => { unsubStatus(); unsubProgress() }
  }, [])

  if (!updateInfo || dismissed) return null
  if (updateInfo.status === 'up-to-date' || updateInfo.status === 'error') return null

  const isDownloaded = updateInfo.status === 'downloaded'

  return (
    <div style={{
      background: isDownloaded ? `${C.green}18` : `${C.blue}18`,
      borderBottom: `1px solid ${isDownloaded ? C.green : C.blue}`,
      padding: '8px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: 0,
        background: isDownloaded ? C.green : C.blue,
        flexShrink: 0,
      }} />

      <div style={{ flex: 1, fontSize: 12, fontFamily: C.body }}>
        {isDownloaded ? (
          <span>
            <span style={{ color: C.green, fontFamily: C.head, fontWeight: 700 }}>
              SHINRACER {updateInfo.version} READY
            </span>
            <span style={{ color: C.mutedHi, marginLeft: 8 }}>
              — Downloaded and ready to install
            </span>
          </span>
        ) : (
          <span>
            <span style={{ color: C.blue, fontFamily: C.head, fontWeight: 700 }}>
              UPDATE AVAILABLE — {updateInfo.version}
            </span>
            {progress ? (
              <span style={{ color: C.mutedHi, marginLeft: 8 }}>
                — Downloading {progress.percent}%
              </span>
            ) : (
              <span style={{ color: C.mutedHi, marginLeft: 8 }}>
                — Downloading in background…
              </span>
            )}
          </span>
        )}
      </div>

      {progress && !isDownloaded && (
        <div style={{ width: 120, height: 3, background: C.border, flexShrink: 0 }}>
          <div style={{
            width: `${progress.percent}%`, height: '100%',
            background: C.blue, transition: 'width .3s',
          }} />
        </div>
      )}

      {isDownloaded && (
        <button onClick={() => api.updater.install()}
          style={{
            background: C.green, color: '#000', border: 'none',
            padding: '4px 14px', fontFamily: C.head, fontWeight: 700,
            fontSize: 12, letterSpacing: 0.5, cursor: 'pointer',
            borderRadius: 0,
          }}>
          RESTART &amp; INSTALL
        </button>
      )}

      <button onClick={() => setDismissed(true)}
        style={{
          background: 'none', border: 'none',
          color: C.muted, fontSize: 14, cursor: 'pointer',
          padding: '0 4px', lineHeight: 1,
        }}>
        ✕
      </button>
    </div>
  )
}
