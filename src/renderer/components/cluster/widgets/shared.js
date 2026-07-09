import { C } from '../../primitives'

// Multi-layer box-shadow for an LED-bloom look — intensity (0-1) scales the spread.
export function glowShadow(color, intensity = 0.6) {
  if (!color || !intensity) return 'none'
  const spread = Math.max(2, Math.round(16 * intensity))
  return `0 0 ${Math.round(spread / 2)}px ${color}, 0 0 ${spread}px ${color}, 0 0 ${spread * 2}px ${color}44`
}

export const SHAPE_CLIP = {
  rectangle: 'none',
  circle: 'circle(50% at 50% 50%)',
  hexagon: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
}

// Every widget with a telemetryBind reads its value the same way — a plain
// property lookup on the frame shape from Phase 9's buildTelemetryFrame.
// Never throws on a missing/null frame (frame?.[bind] ?? fallback).
export function getTelemetryValue(frame, bind, fallback = 0) {
  if (!bind) return fallback
  const v = frame?.[bind]
  return v == null ? fallback : v
}

// Booleans in the frame (drs, pitLimiter) are already true/false; numeric
// fields (tc, abs, speed...) compare against an optional threshold.
export function telemetryIsOn(frame, bind, threshold) {
  const v = frame?.[bind]
  if (v == null) return false
  if (typeof v === 'boolean') return v
  return threshold != null ? v > threshold : v > 0
}

export const FONT_FAMILY = { bebas: C.head, mono: C.mono, barlow: C.body }

export function formatTelemetryValue(value, format, decimals = 0) {
  if (value == null) return '--'
  switch (format) {
    case 'time': {
      const ms = Number(value) || 0
      const m = Math.floor(ms / 60000)
      const s = ((ms % 60000) / 1000).toFixed(3)
      return `${m}:${s.padStart(6, '0')}`
    }
    case 'gear': {
      const g = Number(value)
      return g === -1 ? 'R' : g === 0 ? 'N' : String(g)
    }
    case 'percent':
      return `${(Number(value) * 100).toFixed(decimals)}%`
    case 'raw':
      return String(value)
    case 'number':
    default:
      return Number(value).toFixed(decimals)
  }
}

// Edit mode never wires real input handlers (no keystrokes/appFunctions fire
// from the editor canvas) — every widget below checks `mode === 'runtime'`
// before attaching press/drag handlers, so clicking a widget in the editor
// only ever selects it (handled by the canvas wrapper, not here).
export function isRuntime(mode) { return mode === 'runtime' }
