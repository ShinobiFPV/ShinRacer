// Same brand tokens as src/renderer/components/primitives.jsx (Phase 8 redesign).
// Kept as a separate literal copy rather than an import across the pwa/ ↔ src/
// boundary — the two apps are built and deployed completely independently
// (pwa/ has its own package.json, its own Vite root), so importing from `../../src`
// would couple two builds that should stay decoupled. If the brand tokens ever
// change, update both files.
export const C = {
  bg:        '#050507',
  surface:   '#0A0C12',
  raised:    '#0F1218',
  overlay:   '#141820',

  border:    '#1C2233',
  borderHi:  '#2A3A5C',
  borderAcc: '#1E3A6E',

  blue:      '#0066FF',
  blueDim:   '#003A99',
  blueGlow:  '#0044CC',

  white:     '#E8F0FF',
  whiteHot:  '#FFFFFF',

  green:     '#00CC44',
  greenDim:  '#007722',
  red:       '#FF1A1A',
  redDim:    '#990000',
  orange:    '#FF6600',
  yellow:    '#FFD700',

  textPrimary:  '#E8F0FF',
  textSec:      '#7A90B8',
  muted:        '#3A4A66',
  mutedHi:      '#5A70A0',

  head:  "'Rubik Mono One', 'Courier New', monospace",
  body:  "'Space Mono', 'Courier New', monospace",
  mono:  "'Space Mono', 'Cascadia Code', monospace",

  radius:   '0px',
  radiusSm: '2px',
}

// Deterministic handle -> color assignment for Google-signed-in users (the
// PWA has no manual color-swatch picker like the Electron app's Settings —
// see CLAUDE.md's Phase 10 notes for why).
export const IDENTITY_COLORS = [C.blue, C.green, C.orange, C.red, C.yellow, '#8E44AD', '#00BCD4', '#FF80AB']
export function hashToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  return IDENTITY_COLORS[hash % IDENTITY_COLORS.length]
}

export const GLOBAL_CSS = `
  :root {
    --shr-bg: ${C.bg}; --shr-surface: ${C.surface}; --shr-border: ${C.border};
    --shr-blue: ${C.blue}; --shr-text: ${C.textPrimary}; --shr-text-sec: ${C.textSec};
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body, #root { min-height: 100%; background: ${C.bg}; color: ${C.textPrimary}; font-family: ${C.body}; }
  body { overscroll-behavior-y: none; }
  ::selection { background: ${C.blue}44; color: ${C.whiteHot}; }
  ::-webkit-scrollbar { width: 3px; height: 3px; }
  ::-webkit-scrollbar-track { background: ${C.bg}; }
  ::-webkit-scrollbar-thumb { background: ${C.blueDim}; }
  *:focus { outline: none; }
  *:focus-visible { outline: 1px solid ${C.blue}; outline-offset: 2px; }
  input, select, textarea, button { font-family: ${C.body}; }
  input[type=range] { accent-color: ${C.blue}; }
  input[type=checkbox] { accent-color: ${C.blue}; width: 18px; height: 18px; }
  button { -webkit-appearance: none; appearance: none; background: none; border: none; color: inherit; font: inherit; cursor: pointer; }
  a { color: inherit; }
`
