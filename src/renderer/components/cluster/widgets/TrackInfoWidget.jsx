import { C } from '../../primitives'

export const DEFAULT_TRACKINFO_CONFIG = {
  fontSize: 14, textColor: C.textPrimary, backgroundColor: 'transparent', maxLines: 2,
}

// Text-only NowPlayingWidget — no artwork, no progress bar. Useful for tight
// cluster layouts where a full NowPlayingWidget doesn't fit.
export default function TrackInfoWidget({ config = {}, stereoState }) {
  const cfg = { ...DEFAULT_TRACKINFO_CONFIG, ...config }
  const np = stereoState?.nowPlaying

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 6, background: cfg.backgroundColor, overflow: 'hidden',
    }}>
      <div style={{ fontFamily: C.head, fontSize: cfg.fontSize, color: cfg.textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {np?.trackName || 'NO TRACK'}
      </div>
      {cfg.maxLines >= 2 && (
        <div style={{ fontFamily: C.body, fontSize: Math.round(cfg.fontSize * 0.7), color: C.mutedHi, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {np?.artist || '—'}
        </div>
      )}
    </div>
  )
}
