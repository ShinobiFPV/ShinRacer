import { useRef } from 'react'
import { C } from '../../primitives'

export const DEFAULT_IMAGEPANEL_CONFIG = {
  image: null, opacity: 1, fit: 'cover', borderColor: null, borderWidth: 0, cornerRadius: 0,
}

const WARN_BYTES = 500 * 1024
const HARD_LIMIT_BYTES = 2 * 1024 * 1024

// Reads a File as a base64 data URL, rejecting anything over the hard limit
// and flagging (but not blocking) anything over the warn threshold — shared
// by this widget's own click-to-upload and ClusterView's config-panel upload
// button, so both paths enforce the same limits.
export function readImageAsBase64(file) {
  return new Promise((resolve, reject) => {
    if (file.size > HARD_LIMIT_BYTES) {
      reject(new Error(`Image is ${(file.size / 1024 / 1024).toFixed(1)}MB — 2MB hard limit. Compress it first.`))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve({ dataUrl: reader.result, warnLarge: file.size > WARN_BYTES, sizeBytes: file.size })
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

const FIT_STYLE = {
  cover: { backgroundSize: 'cover' },
  contain: { backgroundSize: 'contain', backgroundRepeat: 'no-repeat' },
  stretch: { backgroundSize: '100% 100%' },
  tile: { backgroundRepeat: 'repeat' },
}

// Static background panel, no input at runtime. In edit mode, clicking it
// opens a file picker directly (per the spec) — `onConfigChange` is a
// pragmatic addition beyond the widget's documented prop list, since nothing
// else in the contract lets a widget persist a config change it caused
// itself; ClusterView passes it through only in edit mode.
export default function ImagePanel({ config = {}, mode, onConfigChange, onUploadError }) {
  const cfg = { ...DEFAULT_IMAGEPANEL_CONFIG, ...config }
  const inputRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { dataUrl, warnLarge } = await readImageAsBase64(file)
      onConfigChange?.({ image: dataUrl })
      if (warnLarge) onUploadError?.('Image is over 500KB — large images bloat the preset JSON. Consider compressing it.')
    } catch (err) {
      onUploadError?.(err.message)
    }
  }

  return (
    <div
      onClick={() => mode !== 'runtime' && inputRef.current?.click()}
      style={{
        width: '100%', height: '100%', position: 'relative',
        border: cfg.borderColor ? `${cfg.borderWidth}px solid ${cfg.borderColor}` : 'none',
        borderRadius: cfg.cornerRadius, overflow: 'hidden',
        cursor: mode !== 'runtime' ? 'pointer' : 'default',
        backgroundImage: cfg.image ? `url(${cfg.image})` : 'none',
        backgroundPosition: 'center',
        ...(FIT_STYLE[cfg.fit] || FIT_STYLE.cover),
        opacity: cfg.opacity,
        background: cfg.image ? undefined : C.raised,
      }}
    >
      {!cfg.image && mode !== 'runtime' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.muted, fontSize: 11, textAlign: 'center', padding: 8 }}>
          Click to upload image
        </div>
      )}
      {mode !== 'runtime' && <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />}
    </div>
  )
}
