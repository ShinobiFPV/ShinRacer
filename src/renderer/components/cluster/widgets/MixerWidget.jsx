import { C } from '../../primitives'
import { isRuntime } from './shared'

export const DEFAULT_MIXER_CONFIG = {
  showMusic: true, showGame: true, showComms: true,
  orientation: 'horizontal', showLabels: true, faderColor: C.blue,
}

const CHANNEL_LABEL = { music: 'M', game: 'G', comms: 'C' }

// Compact multi-channel mixer strip. Reads/writes stereoState.volumes via
// onVolumeChange(channel, value) — the same dispatch StereoView's own
// full-size ChannelStrip/Fader use, just rendered smaller for a cluster tile.
export default function MixerWidget({ config = {}, mode, width, height, stereoState, onVolumeChange }) {
  const cfg = { ...DEFAULT_MIXER_CONFIG, ...config }
  const channels = ['music', 'game', 'comms'].filter(c => cfg[`show${c[0].toUpperCase()}${c.slice(1)}`])
  const vertical = cfg.orientation === 'vertical'
  const volumes = stereoState?.volumes || { music: 0, game: 0, comms: 0 }
  const muted = stereoState?.muted || {}
  const runtime = isRuntime(mode)

  function onDrag(e, channel) {
    if (!runtime) return
    e.preventDefault()
    const track = e.currentTarget
    function move(ev) {
      const rect = track.getBoundingClientRect()
      const pct = vertical
        ? 1 - Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
        : Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      onVolumeChange?.(channel, Math.round(pct * 100))
    }
    move(e)
    function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: vertical ? 'row' : 'row',
      alignItems: 'stretch', justifyContent: 'space-around', padding: 6, gap: 6,
    }}>
      {channels.map(ch => {
        const value = muted[ch] ? 0 : (volumes[ch] ?? 0)
        return (
          <div key={ch} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div onMouseDown={e => onDrag(e, ch)}
              style={{
                flex: 1, width: vertical ? 6 : '100%', height: vertical ? '100%' : 6,
                background: C.border, position: 'relative', cursor: runtime ? 'pointer' : 'default', minHeight: vertical ? 30 : undefined,
              }}>
              <div style={{
                position: 'absolute', background: cfg.faderColor,
                ...(vertical ? { bottom: 0, left: 0, width: '100%', height: `${value}%` } : { top: 0, left: 0, height: '100%', width: `${value}%` }),
              }} />
            </div>
            {cfg.showLabels && <span style={{ fontFamily: C.mono, fontSize: 8, color: C.muted }}>{CHANNEL_LABEL[ch]}</span>}
          </div>
        )
      })}
    </div>
  )
}
