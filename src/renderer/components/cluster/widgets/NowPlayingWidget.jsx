import { C } from '../../primitives'

export const DEFAULT_NOWPLAYING_CONFIG = {
  showArtwork: true, showArtist: true, showProgress: true,
  backgroundColor: C.surface, textColor: C.textPrimary, sizeVariant: 'medium',
}

const SIZES = { small: 12, medium: 15, large: 20 }

// Reads the shared Car Stereo state (see useStereo.jsx / ClusterRuntime's
// `stereoState` prop) — never the telemetry frame. Renders a "NO TRACK"
// placeholder rather than blank when nothing's playing, same convention the
// telemetry widgets use for missing data (shared.js's formatTelemetryValue).
export default function NowPlayingWidget({ config = {}, stereoState }) {
  const cfg = { ...DEFAULT_NOWPLAYING_CONFIG, ...config }
  const np = stereoState?.nowPlaying
  const titleSize = SIZES[cfg.sizeVariant] || SIZES.medium
  const progressPct = np?.durationMs ? Math.min(100, ((np.positionMs || 0) / np.durationMs) * 100) : 0

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 8,
      background: cfg.backgroundColor, overflow: 'hidden',
    }}>
      {cfg.showArtwork && (
        np?.artworkUrl
          ? <img src={np.artworkUrl} alt="" style={{ width: '100%', maxWidth: 56, aspectRatio: '1', objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 56, height: 56, background: C.raised, border: `1px solid ${C.border}`, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
        <div style={{ fontFamily: C.head, fontSize: titleSize, color: cfg.textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {np?.trackName || 'NO TRACK'}
        </div>
        {cfg.showArtist && (
          <div style={{ fontFamily: C.body, fontSize: Math.round(titleSize * 0.65), color: C.mutedHi, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {np?.artist || '—'}
          </div>
        )}
        {cfg.showProgress && (
          <div style={{ height: 2, background: C.border, marginTop: 2, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${progressPct}%`, background: C.blue }} />
          </div>
        )}
      </div>
    </div>
  )
}
