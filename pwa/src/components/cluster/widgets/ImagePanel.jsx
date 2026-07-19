import { C } from '../../../lib/colors'

export const DEFAULT_IMAGEPANEL_CONFIG = {
  image: null, opacity: 1, fit: 'cover', borderColor: null, borderWidth: 0, cornerRadius: 0,
}

const FIT_STYLE = {
  cover: { backgroundSize: 'cover' },
  contain: { backgroundSize: 'contain', backgroundRepeat: 'no-repeat' },
  stretch: { backgroundSize: '100% 100%' },
  tile: { backgroundRepeat: 'repeat' },
}

// Runtime-only on the PWA — no click-to-upload (the mobile Cluster page has
// no editor at all; images come from presets built in the Electron app).
export default function ImagePanel({ config = {} }) {
  const cfg = { ...DEFAULT_IMAGEPANEL_CONFIG, ...config }
  return (
    <div style={{
      width: '100%', height: '100%',
      border: cfg.borderColor ? `${cfg.borderWidth}px solid ${cfg.borderColor}` : 'none',
      borderRadius: cfg.cornerRadius, overflow: 'hidden',
      backgroundImage: cfg.image ? `url(${cfg.image})` : 'none',
      backgroundPosition: 'center',
      ...(FIT_STYLE[cfg.fit] || FIT_STYLE.cover),
      opacity: cfg.opacity,
      background: cfg.image ? undefined : C.raised,
    }} />
  )
}
