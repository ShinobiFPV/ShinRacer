import { C } from '../../primitives'
import { glowShadow, isRuntime } from './shared'

export const DEFAULT_TRANSPORT_CONFIG = {
  showPrev: true, showNext: true, buttonColor: C.blue, glowColor: null,
  buttonSize: 'medium', activeSource: 'auto',
}

const SIZES = { small: 16, medium: 22, large: 30 }

// Play/pause/prev/next for the app's currently active Car Stereo source.
// `activeSource` in config is a display-only label ("what this widget was
// built for") — dispatch always targets whichever source is actually active
// in useStereo, since a Cluster overlay window shares one global player, not
// a per-widget one. Disclosed the same way Phase 11's ptt/mute widgets
// disclose their own "only while Comms is mounted" limitation.
export default function TransportWidget({ config = {}, mode, stereoState, onTransportAction }) {
  const cfg = { ...DEFAULT_TRANSPORT_CONFIG, ...config }
  const size = SIZES[cfg.buttonSize] || SIZES.medium
  const isPlaying = !!stereoState?.isPlaying
  const runtime = isRuntime(mode)

  const fire = (action) => { if (runtime) onTransportAction?.(action) }

  const btnStyle = (glow) => ({
    width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: 'none', color: cfg.buttonColor, fontSize: Math.round(size * 0.5),
    cursor: runtime ? 'pointer' : 'default', filter: glow ? `drop-shadow(0 0 4px ${cfg.glowColor})` : 'none',
  })

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      {cfg.showPrev && <button onClick={() => fire('prev')} style={btnStyle(false)}>⏮</button>}
      <button onClick={() => fire(isPlaying ? 'pause' : 'play')}
        style={{ ...btnStyle(isPlaying && cfg.glowColor), width: size * 1.4, height: size * 1.4, borderRadius: '50%',
          background: isPlaying ? cfg.buttonColor : 'transparent', border: `1px solid ${cfg.buttonColor}`,
          color: isPlaying ? C.whiteHot : cfg.buttonColor, boxShadow: isPlaying ? glowShadow(cfg.glowColor || cfg.buttonColor, 0.5) : 'none' }}>
        {isPlaying ? '❙❙' : '▶'}
      </button>
      {cfg.showNext && <button onClick={() => fire('next')} style={btnStyle(false)}>⏭</button>}
    </div>
  )
}
