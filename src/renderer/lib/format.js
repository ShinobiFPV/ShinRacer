// Lap times display as M:SS.mmm throughout the app.
export function formatLapTime(ms) {
  if (ms == null) return '—'
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(3)
  return `${m}:${s.padStart(6, '0')}`
}
