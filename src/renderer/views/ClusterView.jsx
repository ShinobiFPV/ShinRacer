import { useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { C, Btn, Card, Label, TextInput, Select, Toggle, Slider, SectionHead, Tag, TabBar } from '../components/primitives'
import ColorPicker from '../components/cluster/ColorPicker'
import ClusterRuntime from '../components/cluster/ClusterRuntime'
import ClusterThumbnail from '../components/cluster/ClusterThumbnail'
import { CLUSTER_WIDGET_CATALOG, CLUSTER_WIDGET_CATEGORIES, getWidgetEntry, GAUGE_COMPONENTS, readImageAsBase64 } from '../components/cluster/widgets'
import { useStore } from '../store/AppStore'
import { useStereo } from '../hooks/useStereo'
import api from '../lib/api'

const win = window.api
const MAX_HISTORY = 20
const MIN_WIDGET_SIZE = 40
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25]
const GRID_SIZES = [10, 15, 20, 25, 30]
const PUBLIC_LIMIT = 5

const APP_FUNCTIONS = [
  { value: 'ptt.start', label: 'PTT: start' },
  { value: 'ptt.stop', label: 'PTT: stop' },
  { value: 'mute.toggle', label: 'Mute: toggle' },
  { value: 'chat.sendPhrase', label: 'Chat: send quick phrase' },
  { value: 'lap.marker', label: 'Lap: mark current lap' },
  { value: 'server.launch', label: 'Server: launch preset' },
  { value: 'server.stop', label: 'Server: stop' },
  { value: 'telemetry.start', label: 'Telemetry: start' },
  { value: 'telemetry.stop', label: 'Telemetry: stop' },
  { value: 'overlay.toggle', label: 'Telemetry overlay: toggle' },
  { value: 'cluster.toggle', label: 'Cluster overlay: toggle' },
  { value: 'volume.up', label: 'Volume: up' },
  { value: 'volume.down', label: 'Volume: down' },
  { value: 'ac.openReplay', label: 'AC: open replay browser' },
  { value: 'ac.launchGame', label: 'AC: launch game' },
  { value: 'stereo.play', label: 'Car Stereo: play' },
  { value: 'stereo.pause', label: 'Car Stereo: pause' },
  { value: 'stereo.playPause', label: 'Car Stereo: play/pause toggle' },
  { value: 'stereo.next', label: 'Car Stereo: next track' },
  { value: 'stereo.prev', label: 'Car Stereo: previous track' },
]
// fnParam shape per function — the editor stores the fully-shaped object
// directly in the binding (e.g. { index: 3 }), so dispatch is ever only
// `api.cluster.callFn(action.fn, action.fnParam)` with no translation step.
const FN_PARAM_FIELD = {
  'chat.sendPhrase': { key: 'index', label: 'Phrase index (0-7)', type: 'number' },
  'server.launch':   { key: 'presetId', label: 'Server preset ID (from Garage)', type: 'text' },
  'server.stop':     { key: 'id', label: 'Running server ID', type: 'text' },
  'overlay.toggle':  { key: 'overlayId', label: 'Overlay ID (optional)', type: 'text' },
  'cluster.toggle':  { key: 'presetId', label: 'Cluster preset ID', type: 'text' },
}

const ACTION_KEYS = {
  action: 'Action', actionOn: 'Action (On)', actionOff: 'Action (Off)',
  actionCW: 'Action (Clockwise)', actionCCW: 'Action (Counter-clockwise)', actionPress: 'Action (Press)',
  actionOnChange: 'Action (On Change)', actionX: 'Action (X axis)', actionY: 'Action (Y axis)',
}

// Every other config key gets classified into a section + control here —
// data-driven so 11 widget types with overlapping field names don't need
// 11 near-duplicate hand-written forms.
const FIELD_META = {
  label: { section: 'LABEL', control: 'text' },
  sublabel: { section: 'LABEL', control: 'text' },
  toggleOnLabel: { section: 'LABEL', control: 'text', allowNull: true },
  text: { section: 'LABEL', control: 'textarea' },
  prefix: { section: 'LABEL', control: 'text' },
  suffix: { section: 'LABEL', control: 'text' },
  fontSize: { section: 'LABEL', control: 'number', min: 8, max: 96 },
  fontFamily: { section: 'LABEL', control: 'select', options: ['bebas', 'mono', 'barlow'] },
  labelColor: { section: 'LABEL', control: 'color' },
  color: { section: 'LABEL', control: 'color' },
  textAlign: { section: 'LABEL', control: 'select', options: ['left', 'center', 'right'] },
  labelPosition: { section: 'LABEL', control: 'select', options: ['above', 'below', 'none'] },
  letterSpacing: { section: 'LABEL', control: 'number', min: 0, max: 10 },
  decimals: { section: 'LABEL', control: 'number', min: 0, max: 6 },
  format: { section: 'LABEL', control: 'select', options: ['number', 'time', 'gear', 'percent', 'raw'] },

  shape: { section: 'APPEARANCE', control: 'select', options: ['rectangle', 'circle', 'hexagon', 'diamond'] },
  fillColor: { section: 'APPEARANCE', control: 'color' },
  borderColor: { section: 'APPEARANCE', control: 'color' },
  borderWidth: { section: 'APPEARANCE', control: 'number', min: 1, max: 8 },
  glowColor: { section: 'APPEARANCE', control: 'color', allowNull: true },
  glowIntensity: { section: 'APPEARANCE', control: 'number', min: 0, max: 1, step: 0.1 },
  image: { section: 'APPEARANCE', control: 'image' },
  imageOpacity: { section: 'APPEARANCE', control: 'number', min: 0, max: 1, step: 0.1 },
  opacity: { section: 'APPEARANCE', control: 'number', min: 0, max: 1, step: 0.1 },
  pressedFillColor: { section: 'APPEARANCE', control: 'color' },
  pressedGlowColor: { section: 'APPEARANCE', control: 'color', allowNull: true },
  toggleOnFillColor: { section: 'APPEARANCE', control: 'color' },
  toggleOnGlowColor: { section: 'APPEARANCE', control: 'color', allowNull: true },
  defaultState: { section: 'APPEARANCE', control: 'select', options: ['on', 'off'] },
  orientation: { section: 'APPEARANCE', control: 'select', options: ['horizontal', 'vertical'] },
  minValue: { section: 'APPEARANCE', control: 'number' },
  maxValue: { section: 'APPEARANCE', control: 'number' },
  defaultValue: { section: 'APPEARANCE', control: 'number' },
  steps: { section: 'APPEARANCE', control: 'number', min: 2, max: 100 },
  wrapAround: { section: 'APPEARANCE', control: 'boolean' },
  markerColor: { section: 'APPEARANCE', control: 'color' },
  showValue: { section: 'APPEARANCE', control: 'boolean' },
  trackColor: { section: 'APPEARANCE', control: 'color' },
  thumbColor: { section: 'APPEARANCE', control: 'color' },
  backgroundColor: { section: 'APPEARANCE', control: 'color' },
  crosshairColor: { section: 'APPEARANCE', control: 'color' },
  gridLines: { section: 'APPEARANCE', control: 'boolean' },
  size: { section: 'APPEARANCE', control: 'number', min: 8, max: 200 },
  onColor: { section: 'APPEARANCE', control: 'color' },
  offColor: { section: 'APPEARANCE', control: 'color' },
  glowOnColor: { section: 'APPEARANCE', control: 'color', allowNull: true },
  gaugeType: { section: 'APPEARANCE', control: 'select', options: Object.keys(GAUGE_COMPONENTS) },
  fit: { section: 'APPEARANCE', control: 'select', options: ['cover', 'contain', 'stretch', 'tile'] },

  telemetryBind: { section: 'TELEMETRY', control: 'text' },
  telemetryThreshold: { section: 'TELEMETRY', control: 'number', allowNull: true },

  // Car Stereo widgets (Phase 18) — reuse existing keys (backgroundColor,
  // glowColor, label, showValue, fontSize) where the concept already exists;
  // these are the ones genuinely new to this widget family.
  showArtwork: { section: 'APPEARANCE', control: 'boolean' },
  showArtist: { section: 'APPEARANCE', control: 'boolean' },
  showProgress: { section: 'APPEARANCE', control: 'boolean' },
  textColor: { section: 'APPEARANCE', control: 'color' },
  sizeVariant: { section: 'APPEARANCE', control: 'select', options: ['small', 'medium', 'large'] },
  showPrev: { section: 'APPEARANCE', control: 'boolean' },
  showNext: { section: 'APPEARANCE', control: 'boolean' },
  buttonColor: { section: 'APPEARANCE', control: 'color' },
  buttonSize: { section: 'APPEARANCE', control: 'select', options: ['small', 'medium', 'large'] },
  activeSource: { section: 'APPEARANCE', control: 'select', options: ['auto', 'spotify', 'ytm', 'apple', 'local'] },
  showMusic: { section: 'APPEARANCE', control: 'boolean' },
  showGame: { section: 'APPEARANCE', control: 'boolean' },
  showComms: { section: 'APPEARANCE', control: 'boolean' },
  showLabels: { section: 'APPEARANCE', control: 'boolean' },
  faderColor: { section: 'APPEARANCE', control: 'color' },
  channel: { section: 'APPEARANCE', control: 'select', options: ['music', 'game', 'comms', 'master'] },
  knobColor: { section: 'APPEARANCE', control: 'color' },
  maxLines: { section: 'APPEARANCE', control: 'select', options: [1, 2] },
}

function genId(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

function defaultLayout(author) {
  const now = new Date().toISOString()
  return {
    id: genId('local'), name: 'Untitled Cluster', description: '', author,
    canvasWidth: 800, canvasHeight: 480, backgroundColor: C.bg, backgroundImage: null, backgroundImageOpacity: 1,
    gridSize: 20, gridVisible: true, widgets: [], createdAt: now, updatedAt: now, isPublic: false, version: 1,
  }
}

function snap(value, gridSize, bypass) {
  if (bypass) return value
  return Math.round(value / gridSize) * gridSize
}

function cloneLayout(layout) { return JSON.parse(JSON.stringify(layout)) }

// ── Action binding editor — shared by every ACTION-section field ───────────
function ActionBindingEditor({ label, value, onChange }) {
  const binding = value || { type: 'none' }
  const paramField = FN_PARAM_FIELD[binding.fn]
  return (
    <div style={{ marginBottom: 14, padding: 10, border: `1px solid ${C.border}` }}>
      <Label>{label}</Label>
      <Select value={binding.type || 'none'}
        onChange={type => onChange({ type, key: binding.key || '', repeatOnHold: false, repeatInterval: 100, fn: binding.fn || '', fnParam: binding.fnParam })}
        options={['none', 'keystroke', 'appFunction']} />
      {binding.type === 'keystroke' && (
        <div style={{ marginTop: 8 }}>
          <TextInput value={binding.key || ''} onChange={key => onChange({ ...binding, key })} placeholder="F1, ctrl+shift+p, space..." />
          <div style={{ marginTop: 8 }}>
            <Toggle label="Repeat while held" value={!!binding.repeatOnHold} onChange={v => onChange({ ...binding, repeatOnHold: v })} />
          </div>
          {binding.repeatOnHold && (
            <Slider label="Repeat interval (ms)" value={binding.repeatInterval || 100} min={30} max={1000} step={10}
              onChange={v => onChange({ ...binding, repeatInterval: v })} />
          )}
        </div>
      )}
      {binding.type === 'appFunction' && (
        <div style={{ marginTop: 8 }}>
          <Select value={binding.fn || ''} onChange={fn => onChange({ ...binding, fn, fnParam: undefined })}
            options={[{ value: '', label: 'Choose a function…' }, ...APP_FUNCTIONS]} />
          {paramField && (
            <div style={{ marginTop: 8 }}>
              <Label muted>{paramField.label}</Label>
              <TextInput
                value={binding.fnParam?.[paramField.key] ?? ''}
                onChange={v => onChange({ ...binding, fnParam: { [paramField.key]: paramField.type === 'number' ? Number(v) : v } })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Config field renderer — data-driven from FIELD_META ────────────────────
function ConfigField({ widgetType, fieldKey, value, onChange, showToast }) {
  const meta = { ...FIELD_META[fieldKey] }
  if (fieldKey === 'shape' && widgetType === 'indicatorLight') meta.options = ['circle', 'square']
  const label = fieldKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())

  switch (meta.control) {
    case 'color':
      return <ColorPicker label={label} value={value} onChange={onChange} allowNull={meta.allowNull} />
    case 'select':
      return (
        <div style={{ marginBottom: 12 }}>
          <Label>{label}</Label>
          <Select value={value ?? meta.options[0]} onChange={onChange} options={meta.options} />
        </div>
      )
    case 'boolean':
      return <Toggle label={label} value={!!value} onChange={onChange} />
    case 'number':
      return (
        <Slider label={label} value={Number(value) || 0} min={meta.min ?? 0} max={meta.max ?? 100} step={meta.step ?? 1}
          onChange={onChange} />
      )
    case 'textarea':
      return (
        <div style={{ marginBottom: 12 }}>
          <Label>{label}</Label>
          <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} rows={2}
            style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.textPrimary, padding: 8, fontFamily: C.body, fontSize: 12 }} />
        </div>
      )
    case 'image':
      return (
        <div style={{ marginBottom: 12 }}>
          <Label>{label}</Label>
          <input type="file" accept="image/*" onChange={async e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const { dataUrl, warnLarge } = await readImageAsBase64(file)
              onChange(dataUrl)
              if (warnLarge) showToast?.('Image is over 500KB — consider compressing it', C.orange)
            } catch (err) { showToast?.(err.message, C.red) }
          }} style={{ color: C.textSec, fontSize: 11 }} />
          {value && <Btn size="xs" variant="ghost" style={{ marginTop: 6 }} onClick={() => onChange(null)}>Remove image</Btn>}
        </div>
      )
    default:
      return (
        <div style={{ marginBottom: 12 }}>
          <Label>{label}</Label>
          <TextInput value={value ?? ''} onChange={onChange} />
        </div>
      )
  }
}

function CollapsibleSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'none', border: 'none', padding: '8px 0', color: C.textSec, fontFamily: C.body,
        fontWeight: 700, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer',
      }}>
        {title}<span>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  )
}

// ── Widget config panel (left panel, when a single widget is selected) ─────
function WidgetConfigPanel({ widget, onChange, onDelete, onDuplicate, onToggleLock, showToast }) {
  const entry = getWidgetEntry(widget.type)
  const cfg = { ...entry.defaultConfig, ...widget.config }
  const keys = Object.keys(entry.defaultConfig)
  const labelKeys = keys.filter(k => FIELD_META[k]?.section === 'LABEL')
  const appearanceKeys = keys.filter(k => FIELD_META[k]?.section === 'APPEARANCE')
  const telemetryKeys = keys.filter(k => FIELD_META[k]?.section === 'TELEMETRY')
  const actionFields = keys.filter(k => ACTION_KEYS[k])

  function setConfig(key, value) { onChange({ ...widget, config: { ...cfg, [key]: value } }) }

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div style={{ fontFamily: C.head, fontSize: 16, letterSpacing: 1, marginBottom: 4 }}>{entry.label}</div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 14 }}>ID: {widget.id}</div>

      {appearanceKeys.length > 0 && (
        <CollapsibleSection title="Appearance">
          {appearanceKeys.map(k => <ConfigField key={k} widgetType={widget.type} fieldKey={k} value={cfg[k]} onChange={v => setConfig(k, v)} showToast={showToast} />)}
        </CollapsibleSection>
      )}
      {labelKeys.length > 0 && (
        <CollapsibleSection title="Label">
          {labelKeys.map(k => <ConfigField key={k} widgetType={widget.type} fieldKey={k} value={cfg[k]} onChange={v => setConfig(k, v)} showToast={showToast} />)}
        </CollapsibleSection>
      )}
      {actionFields.length > 0 && (
        <CollapsibleSection title="Action">
          {actionFields.map(k => <ActionBindingEditor key={k} label={ACTION_KEYS[k]} value={cfg[k]} onChange={v => setConfig(k, v)} />)}
        </CollapsibleSection>
      )}
      {telemetryKeys.length > 0 && (
        <CollapsibleSection title="Telemetry" defaultOpen={false}>
          {telemetryKeys.map(k => <ConfigField key={k} widgetType={widget.type} fieldKey={k} value={cfg[k]} onChange={v => setConfig(k, v)} showToast={showToast} />)}
        </CollapsibleSection>
      )}
      <CollapsibleSection title="Size & Position" defaultOpen={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div><Label muted>X</Label><TextInput value={widget.x} onChange={v => onChange({ ...widget, x: Number(v) || 0 })} /></div>
          <div><Label muted>Y</Label><TextInput value={widget.y} onChange={v => onChange({ ...widget, y: Number(v) || 0 })} /></div>
          <div><Label muted>Width</Label><TextInput value={widget.width} onChange={v => onChange({ ...widget, width: Math.max(MIN_WIDGET_SIZE, Number(v) || MIN_WIDGET_SIZE) })} /></div>
          <div><Label muted>Height</Label><TextInput value={widget.height} onChange={v => onChange({ ...widget, height: Math.max(MIN_WIDGET_SIZE, Number(v) || MIN_WIDGET_SIZE) })} /></div>
        </div>
      </CollapsibleSection>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Btn size="sm" variant="ghost" onClick={onDuplicate}>Duplicate</Btn>
        <Btn size="sm" variant="subtle" onClick={onToggleLock}>{widget.locked ? 'Unlock' : 'Lock'}</Btn>
      </div>
      <Btn size="sm" variant="danger" style={{ marginTop: 8, width: '100%' }} onClick={onDelete}>Delete widget</Btn>
    </div>
  )
}

// ── Widget palette (left panel, nothing selected) ───────────────────────────
function WidgetPalette({ onAdd }) {
  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      {CLUSTER_WIDGET_CATEGORIES.map(cat => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted, marginBottom: 8 }}>{cat}</div>
          {CLUSTER_WIDGET_CATALOG.filter(w => w.category === cat).map(w => (
            <button key={w.type} onClick={() => onAdd(w.type)}
              draggable
              onDragStart={e => e.dataTransfer.setData('text/cluster-widget-type', w.type)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', marginBottom: 4,
                background: C.raised, border: `1px solid ${C.border}`, color: C.textPrimary, textAlign: 'left',
                fontFamily: C.body, fontSize: 12, cursor: 'grab',
              }}>
              <span>▸</span>{w.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Canvas (center) ──────────────────────────────────────────────────────────
function Canvas({ layout, selectedIds, setSelectedIds, onCommit, zoom, canvasRef }) {
  const dragRef = useRef(null) // { mode: 'move'|'resize'|'marquee', ... }
  const [marquee, setMarquee] = useState(null)

  function widgetsById(ids) { return layout.widgets.filter(w => ids.includes(w.id)) }

  function onWidgetMouseDown(e, widget) {
    e.stopPropagation()
    if (widget.locked) { setSelectedIds([widget.id]); return }
    const alreadySelected = selectedIds.includes(widget.id)
    const nextSelected = alreadySelected ? selectedIds : [widget.id]
    if (!alreadySelected) setSelectedIds(nextSelected)
    const targets = widgetsById(nextSelected).filter(w => !w.locked)
    dragRef.current = {
      mode: 'move', startX: e.clientX, startY: e.clientY,
      starts: Object.fromEntries(targets.map(w => [w.id, { x: w.x, y: w.y }])),
      bypassSnap: e.altKey,
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onResizeHandleDown(e, widget, handle) {
    e.stopPropagation()
    dragRef.current = {
      mode: 'resize', handle, startX: e.clientX, startY: e.clientY,
      start: { x: widget.x, y: widget.y, width: widget.width, height: widget.height }, widgetId: widget.id,
      bypassSnap: e.altKey,
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onCanvasMouseDown(e) {
    if (e.target !== canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const startX = (e.clientX - rect.left) / zoom
    const startY = (e.clientY - rect.top) / zoom
    dragRef.current = { mode: 'marquee', startX, startY }
    setMarquee({ x: startX, y: startY, w: 0, h: 0 })
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e) {
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'move') {
      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom
      const next = layout.widgets.map(w => {
        const start = d.starts[w.id]
        if (!start) return w
        return { ...w, x: Math.max(0, snap(start.x + dx, layout.gridSize, d.bypassSnap)), y: Math.max(0, snap(start.y + dy, layout.gridSize, d.bypassSnap)) }
      })
      onCommit({ ...layout, widgets: next }, false)
    } else if (d.mode === 'resize') {
      const dx = (e.clientX - d.startX) / zoom
      const dy = (e.clientY - d.startY) / zoom
      const next = layout.widgets.map(w => {
        if (w.id !== d.widgetId) return w
        let { x, y, width, height } = d.start
        if (d.handle.includes('e')) width = Math.max(MIN_WIDGET_SIZE, snap(d.start.width + dx, layout.gridSize, d.bypassSnap))
        if (d.handle.includes('s')) height = Math.max(MIN_WIDGET_SIZE, snap(d.start.height + dy, layout.gridSize, d.bypassSnap))
        if (d.handle.includes('w')) { width = Math.max(MIN_WIDGET_SIZE, snap(d.start.width - dx, layout.gridSize, d.bypassSnap)); x = d.start.x + (d.start.width - width) }
        if (d.handle.includes('n')) { height = Math.max(MIN_WIDGET_SIZE, snap(d.start.height - dy, layout.gridSize, d.bypassSnap)); y = d.start.y + (d.start.height - height) }
        return { ...w, x, y, width, height }
      })
      onCommit({ ...layout, widgets: next }, false)
    } else if (d.mode === 'marquee') {
      const rect = canvasRef.current.getBoundingClientRect()
      const curX = (e.clientX - rect.left) / zoom
      const curY = (e.clientY - rect.top) / zoom
      const x = Math.min(d.startX, curX), y = Math.min(d.startY, curY)
      const w = Math.abs(curX - d.startX), h = Math.abs(curY - d.startY)
      setMarquee({ x, y, w, h })
    }
  }

  function onMouseUp() {
    const d = dragRef.current
    if (d?.mode === 'marquee') {
      const rect = marquee
      const selected = layout.widgets.filter(w => rect && w.x < rect.x + rect.w && w.x + w.width > rect.x && w.y < rect.y + rect.h && w.y + w.height > rect.y)
      setSelectedIds(selected.map(w => w.id))
      setMarquee(null)
    } else if (d) {
      onCommit(layout, true) // commit final positions to history
    }
    dragRef.current = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length && document.activeElement === document.body) {
        onCommit({ ...layout, widgets: layout.widgets.filter(w => !selectedIds.includes(w.id)) }, true)
        setSelectedIds([])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, selectedIds])

  return (
    <div style={{ flex: 1, overflow: 'auto', background: '#000', padding: 40, display: 'flex', justifyContent: 'center' }}>
      <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', flexShrink: 0 }}>
        <div
          ref={canvasRef}
          onMouseDown={onCanvasMouseDown}
          style={{
            position: 'relative', width: layout.canvasWidth, height: layout.canvasHeight,
            background: layout.backgroundColor, backgroundImage: layout.backgroundImage ? `url(${layout.backgroundImage})` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center', boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
          }}>
          {layout.gridVisible && (
            <svg width={layout.canvasWidth} height={layout.canvasHeight} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              {Array.from({ length: Math.ceil(layout.canvasWidth / layout.gridSize) }, (_, i) => (
                <line key={`v${i}`} x1={i * layout.gridSize} y1={0} x2={i * layout.gridSize} y2={layout.canvasHeight} stroke={C.border} strokeWidth={0.5} opacity={0.3} />
              ))}
              {Array.from({ length: Math.ceil(layout.canvasHeight / layout.gridSize) }, (_, i) => (
                <line key={`h${i}`} x1={0} y1={i * layout.gridSize} x2={layout.canvasWidth} y2={i * layout.gridSize} stroke={C.border} strokeWidth={0.5} opacity={0.3} />
              ))}
            </svg>
          )}
          {[...layout.widgets].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(w => {
            const entry = getWidgetEntry(w.type)
            if (!entry) return null
            const Widget = entry.component
            const isSelected = selectedIds.includes(w.id)
            return (
              <div key={w.id}
                onMouseDown={e => onWidgetMouseDown(e, w)}
                style={{
                  position: 'absolute', left: w.x, top: w.y, width: w.width, height: w.height, zIndex: w.zIndex ?? 0,
                  outline: isSelected ? `2px solid ${C.blue}` : 'none', cursor: w.locked ? 'not-allowed' : 'move',
                }}>
                <Widget config={w.config} mode="edit" width={w.width} height={w.height} telemetryFrame={null} />
                {isSelected && !w.locked && ['nw', 'ne', 'sw', 'se'].map(h => (
                  <div key={h} onMouseDown={e => onResizeHandleDown(e, w, h)}
                    style={{
                      position: 'absolute', width: 8, height: 8, background: C.blue,
                      top: h.includes('n') ? -4 : undefined, bottom: h.includes('s') ? -4 : undefined,
                      left: h.includes('w') ? -4 : undefined, right: h.includes('e') ? -4 : undefined,
                      cursor: `${h}-resize`,
                    }} />
                ))}
              </div>
            )
          })}
          {marquee && (
            <div style={{ position: 'absolute', left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, border: `1px dashed ${C.blue}`, background: `${C.blue}18` }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Layout settings + save/export panel (right) ─────────────────────────────
function LayoutSettingsPanel({ layout, onChange, onSaveLocal, onPublish, onUnpublish, publicCount, isPublished, showToast }) {
  const [qrModal, setQrModal] = useState(null)

  function shareQr() {
    const json = JSON.stringify(layout)
    const bytes = new Blob([json]).size
    if (bytes > 50 * 1024) { showToast('Too large for QR — use Export JSON instead', C.orange); return }
    const qr = qrcode(0, 'M')
    qr.addData(json)
    qr.make()
    setQrModal(qr.createSvgTag(4))
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${layout.name.replace(/[^a-z0-9]/gi, '_')}.cluster.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <SectionHead>Canvas</SectionHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <div><Label muted>Width</Label><TextInput value={layout.canvasWidth} onChange={v => onChange({ ...layout, canvasWidth: Number(v) || 800 })} /></div>
        <div><Label muted>Height</Label><TextInput value={layout.canvasHeight} onChange={v => onChange({ ...layout, canvasHeight: Number(v) || 480 })} /></div>
      </div>
      <ColorPicker label="Background color" value={layout.backgroundColor} onChange={v => onChange({ ...layout, backgroundColor: v })} />
      <div style={{ marginBottom: 12 }}>
        <Label muted>Background image</Label>
        <input type="file" accept="image/*" onChange={async e => {
          const file = e.target.files?.[0]; e.target.value = ''
          if (!file) return
          try { const { dataUrl } = await readImageAsBase64(file); onChange({ ...layout, backgroundImage: dataUrl }) }
          catch (err) { showToast(err.message, C.red) }
        }} style={{ color: C.textSec, fontSize: 11 }} />
        {layout.backgroundImage && <Btn size="xs" variant="ghost" style={{ marginTop: 6 }} onClick={() => onChange({ ...layout, backgroundImage: null })}>Remove</Btn>}
      </div>
      {layout.backgroundImage && (
        <Slider label="Background image opacity" value={layout.backgroundImageOpacity ?? 1} min={0} max={1} step={0.05}
          onChange={v => onChange({ ...layout, backgroundImageOpacity: v })} />
      )}
      <div style={{ marginBottom: 20 }}>
        <Label muted>Grid size</Label>
        <Select value={layout.gridSize} onChange={v => onChange({ ...layout, gridSize: Number(v) })} options={GRID_SIZES.map(g => ({ value: g, label: `${g}px` }))} />
      </div>

      <SectionHead>Save</SectionHead>
      <TextInput value={layout.name} onChange={v => onChange({ ...layout, name: v })} placeholder="Preset name" style={{ marginBottom: 8 }} />
      <textarea value={layout.description} onChange={e => onChange({ ...layout, description: e.target.value })} rows={2} placeholder="Description"
        style={{ width: '100%', background: C.bg, border: `1px solid ${C.border}`, color: C.textPrimary, padding: 8, fontFamily: C.body, fontSize: 12, marginBottom: 10 }} />
      <Btn variant="primary" style={{ width: '100%', marginBottom: 8 }} onClick={onSaveLocal}>Save locally</Btn>
      {isPublished ? (
        <Btn variant="subtle" style={{ width: '100%' }} onClick={onUnpublish}>Unpublish</Btn>
      ) : (
        <Btn variant="ghost" style={{ width: '100%' }} disabled={publicCount >= PUBLIC_LIMIT}
          title={publicCount >= PUBLIC_LIMIT ? 'Delete a public preset to publish more' : ''} onClick={onPublish}>
          Publish to crew ({publicCount}/{PUBLIC_LIMIT} public presets used)
        </Btn>
      )}

      <SectionHead sub="Share this preset outside the app">Export</SectionHead>
      <Btn variant="ghost" style={{ width: '100%', marginBottom: 8 }} onClick={exportJson}>Export JSON</Btn>
      <Btn variant="ghost" style={{ width: '100%' }} onClick={shareQr}>Share QR code</Btn>

      {qrModal && (
        <div onClick={() => setQrModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.borderHi}`, padding: 24 }}>
            <div dangerouslySetInnerHTML={{ __html: qrModal }} style={{ background: C.whiteHot, padding: 12 }} />
            <Btn style={{ marginTop: 12, width: '100%' }} onClick={() => setQrModal(null)}>Close</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Editor sub-tab ───────────────────────────────────────────────────────────
function EditorTab({ layout, setLayout, identity, localPresets, saveLocalPresets, showToast }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [zoom, setZoom] = useState(1)
  const [history, setHistory] = useState([cloneLayout(layout)])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const [preview, setPreview] = useState(false)
  const canvasRef = useRef(null)
  const stereo = useStereo()

  const localRecord = localPresets.find(p => p.layout.id === layout.id)
  const publicCount = localPresets.filter(p => p.layout.author === identity?.handle && p.isPublic).length

  function commit(next, pushToHistory) {
    setLayout(next)
    if (pushToHistory) {
      setHistory(h => {
        const trimmed = h.slice(0, historyIndex + 1)
        const updated = [...trimmed, cloneLayout(next)].slice(-MAX_HISTORY)
        setHistoryIndex(updated.length - 1)
        return updated
      })
    }
  }

  function addWidget(type) {
    const entry = getWidgetEntry(type)
    const widget = {
      id: genId('w'), type, x: layout.canvasWidth / 2 - entry.defaultSize.width / 2, y: layout.canvasHeight / 2 - entry.defaultSize.height / 2,
      width: entry.defaultSize.width, height: entry.defaultSize.height, zIndex: layout.widgets.length,
      config: { ...entry.defaultConfig }, locked: false,
    }
    commit({ ...layout, widgets: [...layout.widgets, widget] }, true)
    setSelectedIds([widget.id])
  }

  function onDropWidget(e) {
    e.preventDefault()
    const type = e.dataTransfer.getData('text/cluster-widget-type')
    if (!type || !canvasRef.current) return
    const entry = getWidgetEntry(type)
    const rect = canvasRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / zoom - entry.defaultSize.width / 2
    const y = (e.clientY - rect.top) / zoom - entry.defaultSize.height / 2
    const widget = {
      id: genId('w'), type, x: Math.max(0, snap(x, layout.gridSize)), y: Math.max(0, snap(y, layout.gridSize)),
      width: entry.defaultSize.width, height: entry.defaultSize.height, zIndex: layout.widgets.length,
      config: { ...entry.defaultConfig }, locked: false,
    }
    commit({ ...layout, widgets: [...layout.widgets, widget] }, true)
    setSelectedIds([widget.id])
  }

  function undo() { if (historyIndex > 0) { setHistoryIndex(i => i - 1); setLayout(cloneLayout(history[historyIndex - 1])) } }
  function redo() { if (historyIndex < history.length - 1) { setHistoryIndex(i => i + 1); setLayout(cloneLayout(history[historyIndex + 1])) } }

  const selectedWidget = selectedIds.length === 1 ? layout.widgets.find(w => w.id === selectedIds[0]) : null

  function updateWidget(next) {
    commit({ ...layout, widgets: layout.widgets.map(w => w.id === next.id ? next : w) }, true)
  }

  // Returns the just-computed { nextLayout, nextPresets } rather than relying
  // on the enclosing `localPresets` closure — that state variable lags a
  // render behind saveLocalPresets()'s setState, so a caller like publish()
  // reading it immediately after calling saveLocal() would still see the
  // *old* array (missing a brand-new record) and could double-insert it.
  function saveLocal() {
    const now = new Date().toISOString()
    const nextLayout = { ...layout, author: identity?.handle || layout.author, updatedAt: now, version: (layout.version || 1) + 1 }
    setLayout(nextLayout)
    const existingIdx = localPresets.findIndex(p => p.layout.id === nextLayout.id)
    const nextPresets = existingIdx >= 0
      ? localPresets.map((p, i) => i === existingIdx ? { ...p, layout: nextLayout } : p)
      : [...localPresets, { layout: nextLayout, isPublic: false, backendId: null }]
    saveLocalPresets(nextPresets)
    showToast('Saved locally')
    // Keep a published preset's backend copy in sync.
    const record = nextPresets.find(p => p.layout.id === nextLayout.id)
    if (record?.backendId) {
      api.patch(`/api/cluster/presets/${record.backendId}`, { author: identity?.handle, name: nextLayout.name, description: nextLayout.description, layout: nextLayout })
        .catch(() => showToast('Saved locally, but syncing to the crew library failed', C.orange))
    }
    return { nextLayout, nextPresets }
  }

  async function publish() {
    if (publicCount >= PUBLIC_LIMIT) { showToast('Public preset limit reached (5/5)', C.red); return }
    const { nextLayout, nextPresets } = saveLocal()
    try {
      const { data } = await api.post('/api/cluster/presets', {
        name: nextLayout.name, description: nextLayout.description, author: identity?.handle, layout: nextLayout, isPublic: true,
      })
      if (!data.ok) { showToast(data.error, C.red); return }
      saveLocalPresets(nextPresets.map(p => p.layout.id === nextLayout.id ? { ...p, isPublic: true, backendId: data.data.id } : p))
      showToast('Published to crew library')
    } catch (e) {
      showToast(e.response?.data?.error || e.message, C.red)
    }
  }

  async function unpublish() {
    if (!localRecord?.backendId) return
    try {
      await api.patch(`/api/cluster/presets/${localRecord.backendId}`, { author: identity?.handle, isPublic: false })
      saveLocalPresets(localPresets.map(p => p.layout.id === layout.id ? { ...p, isPublic: false } : p))
      showToast('Unpublished')
    } catch (e) {
      showToast(e.response?.data?.error || e.message, C.red)
    }
  }

  function launchOverlay() {
    win.cluster.openOverlay({ layout, alwaysOnTop: true, opacity: 1 })
      .then(res => { if (!res?.ok) showToast(res?.error || 'Could not open the overlay window', C.red) })
      .catch(e => showToast(e.message || 'Could not open the overlay window', C.red))
  }

  if (preview) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Btn variant="ghost" onClick={() => setPreview(false)}>← Back to editor</Btn>
        {/* Preview runs inside the main renderer, same tree as <StereoProvider>,
            so Car Stereo widgets get the real live state/dispatch directly —
            no IPC bridge needed here (that's only for the separate overlay window). */}
        <ClusterRuntime layout={layout} telemetryFrame={null} onAction={() => {}}
          stereoState={{ activeSource: stereo.activeSource, nowPlaying: stereo.nowPlaying, isPlaying: stereo.isPlaying, volumes: stereo.volumes, muted: stereo.muted }}
          onStereoAction={(action) => stereo[action]?.()}
          onStereoVolumeChange={(channel, v) => stereo.setVolume(channel, v)} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 240, borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>
        {selectedWidget ? (
          <WidgetConfigPanel
            widget={selectedWidget}
            onChange={updateWidget}
            onDelete={() => { commit({ ...layout, widgets: layout.widgets.filter(w => w.id !== selectedWidget.id) }, true); setSelectedIds([]) }}
            onDuplicate={() => {
              const copy = { ...selectedWidget, id: genId('w'), x: selectedWidget.x + 20, y: selectedWidget.y + 20 }
              commit({ ...layout, widgets: [...layout.widgets, copy] }, true)
              setSelectedIds([copy.id])
            }}
            onToggleLock={() => updateWidget({ ...selectedWidget, locked: !selectedWidget.locked })}
            showToast={showToast}
          />
        ) : (
          <WidgetPalette onAdd={addWidget} />
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
          <Btn size="xs" variant={layout.gridVisible ? 'primary' : 'ghost'} onClick={() => setLayout({ ...layout, gridVisible: !layout.gridVisible })}>Grid</Btn>
          {ZOOM_LEVELS.map(z => (
            <Btn key={z} size="xs" variant={zoom === z ? 'primary' : 'ghost'} onClick={() => setZoom(z)}>{Math.round(z * 100)}%</Btn>
          ))}
          <Btn size="xs" variant="ghost" disabled={historyIndex <= 0} onClick={undo}>Undo</Btn>
          <Btn size="xs" variant="ghost" disabled={historyIndex >= history.length - 1} onClick={redo}>Redo</Btn>
          {!confirmClear ? (
            <Btn size="xs" variant="danger" onClick={() => setConfirmClear(true)}>Clear all</Btn>
          ) : (
            <>
              <Btn size="xs" variant="danger" onClick={() => { commit({ ...layout, widgets: [] }, true); setConfirmClear(false); setSelectedIds([]) }}>Confirm clear</Btn>
              <Btn size="xs" variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Btn>
            </>
          )}
          <span style={{ flex: 1 }} />
          <Btn size="xs" variant="ghost" onClick={() => setPreview(true)}>Preview</Btn>
          <Btn size="xs" variant="primary" onClick={launchOverlay}>Launch overlay</Btn>
        </div>
        <div onDragOver={e => e.preventDefault()} onDrop={onDropWidget} style={{ flex: 1, display: 'flex' }}>
          <Canvas layout={layout} selectedIds={selectedIds} setSelectedIds={setSelectedIds} onCommit={commit} zoom={zoom} canvasRef={canvasRef} />
        </div>
      </div>

      <div style={{ width: 280, borderLeft: `1px solid ${C.border}`, flexShrink: 0 }}>
        <LayoutSettingsPanel layout={layout} onChange={setLayout} onSaveLocal={saveLocal} onPublish={publish} onUnpublish={unpublish}
          publicCount={publicCount} isPublished={!!localRecord?.isPublic} showToast={showToast} />
      </div>
    </div>
  )
}

// ── My Clusters sub-tab ──────────────────────────────────────────────────────
function MyClustersTab({ localPresets, saveLocalPresets, onEdit, identity, showToast }) {
  const [importError, setImportError] = useState(null)

  function launch(layout) {
    win.cluster.openOverlay({ layout, alwaysOnTop: true, opacity: 1 })
      .then(res => { if (!res?.ok) showToast(res?.error || 'Could not open the overlay window', C.red) })
      .catch(e => showToast(e.message || 'Could not open the overlay window', C.red))
  }

  async function del(record) {
    if (record.backendId) {
      try { await api.delete(`/api/cluster/presets/${record.backendId}`, { data: { author: identity?.handle } }) } catch (e) { /* best-effort */ }
    }
    saveLocalPresets(localPresets.filter(p => p.layout.id !== record.layout.id))
  }

  function exportJson(layout) {
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${layout.name.replace(/[^a-z0-9]/gi, '_')}.cluster.json`; a.click()
    URL.revokeObjectURL(url)
  }

  function importJson(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const layout = JSON.parse(reader.result)
        if (!layout.widgets || !Array.isArray(layout.widgets) || !layout.canvasWidth) throw new Error('Not a valid cluster preset file')
        const imported = { ...layout, id: genId('local'), author: identity?.handle, isPublic: false }
        saveLocalPresets([...localPresets, { layout: imported, isPublic: false, backendId: null }])
        showToast('Imported')
      } catch (err) {
        setImportError(err.message)
      }
    }
    reader.readAsText(file)
  }

  if (localPresets.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <div style={{ fontFamily: C.head, fontSize: 22, marginBottom: 8 }}>NO CLUSTERS YET</div>
        <div style={{ color: C.muted, marginBottom: 16 }}>Build your first button box in the Editor</div>
        <label style={{ display: 'inline-block' }}>
          <input type="file" accept=".json" onChange={importJson} style={{ display: 'none' }} />
          <Btn variant="ghost">Import JSON</Btn>
        </label>
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <label>
          <input type="file" accept=".json" onChange={importJson} style={{ display: 'none' }} />
          <Btn variant="ghost" size="sm">Import JSON</Btn>
        </label>
      </div>
      {importError && <div style={{ color: C.red, marginBottom: 12 }}>{importError}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {localPresets.map(record => (
          <Card key={record.layout.id}>
            <ClusterThumbnail layout={record.layout} />
            <div style={{ fontFamily: C.head, fontSize: 16, marginTop: 10 }}>{record.layout.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{record.layout.widgets.length} widgets</div>
            {record.isPublic && <Tag color={C.blue}>Public</Tag>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <Btn size="xs" variant="ghost" onClick={() => onEdit(record.layout)}>Edit</Btn>
              <Btn size="xs" variant="ghost" onClick={() => launch(record.layout)}>Launch</Btn>
              <Btn size="xs" variant="ghost" onClick={() => exportJson(record.layout)}>Export JSON</Btn>
              <Btn size="xs" variant="danger" onClick={() => del(record)}>Delete</Btn>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Public Library sub-tab ───────────────────────────────────────────────────
function PublicLibraryTab({ identity, onEdit, localPresets, saveLocalPresets, showToast }) {
  const [presets, setPresets] = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data } = await api.get('/api/cluster/presets', { params: { author: identity?.handle } })
      if (data.ok) setPresets(data.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [identity?.handle])

  const filtered = presets
    .filter(p => filter === 'all' || p.author === identity?.handle)
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.author.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sort === 'popular' ? b.launch_count - a.launch_count : new Date(b.created_at) - new Date(a.created_at))

  async function loadIntoEditor(preset) {
    try {
      const { data } = await api.get(`/api/cluster/presets/${preset.id}`)
      if (!data.ok) { showToast(data.error, C.red); return }
      const imported = { ...data.data.layout, id: genId('local'), author: identity?.handle }
      saveLocalPresets([...localPresets, { layout: imported, isPublic: false, backendId: null }])
      onEdit(imported)
      showToast('Loaded into editor')
    } catch (e) {
      showToast(e.message, C.red)
    }
  }

  async function launch(preset) {
    try {
      const { data } = await api.get(`/api/cluster/presets/${preset.id}`)
      if (!data.ok) { showToast(data.error, C.red); return }
      const res = await win.cluster.openOverlay({ layout: data.data.layout, alwaysOnTop: true, opacity: 1 })
      if (!res?.ok) showToast(res?.error || 'Could not open the overlay window', C.red)
    } catch (e) {
      showToast(e.message, C.red)
    }
  }

  async function unpublish(preset) {
    try {
      await api.patch(`/api/cluster/presets/${preset.id}`, { author: identity?.handle, isPublic: false })
      load()
    } catch (e) { showToast(e.message, C.red) }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <TabBar tabs={[{ id: 'all', label: 'All' }, { id: 'mine', label: 'Mine' }]} active={filter} onChange={setFilter} />
        <TextInput value={search} onChange={setSearch} placeholder="Search name or author…" style={{ width: 220 }} />
        <Select value={sort} onChange={setSort} options={[{ value: 'newest', label: 'Newest' }, { value: 'popular', label: 'Popular' }]} style={{ width: 140 }} />
      </div>
      {loading && <div style={{ color: C.muted }}>Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {filtered.map(p => (
          <Card key={p.id}>
            <div style={{ height: 120, background: C.raised, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 11 }}>
              {p.widgetCount} widgets
            </div>
            <div style={{ fontFamily: C.head, fontSize: 16, marginTop: 10 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>by {p.author} · {p.launch_count} launches</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Btn size="xs" variant="ghost" onClick={() => loadIntoEditor(p)}>Load into editor</Btn>
              <Btn size="xs" variant="primary" onClick={() => launch(p)}>Launch</Btn>
              {p.author === identity?.handle && <Btn size="xs" variant="subtle" onClick={() => unpublish(p)}>Unpublish</Btn>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function ClusterView({ initialPresetId }) {
  const { identity, showToast } = useStore()
  const [tab, setTab] = useState('editor')
  const [layout, setLayout] = useState(() => defaultLayout(identity?.handle))
  const [localPresets, setLocalPresets] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    win.store.get('clusterPresets').then(saved => {
      setLocalPresets(saved || [])
      setLoaded(true)
    })
  }, [])

  function saveLocalPresets(next) {
    const resolved = typeof next === 'function' ? next(localPresets) : next
    setLocalPresets(resolved)
    win.store.set('clusterPresets', resolved)
  }

  // accomp://cluster/{id} deep link — loads the preset from the backend and
  // switches straight into the editor with it.
  useEffect(() => {
    if (!initialPresetId) return
    api.get(`/api/cluster/presets/${initialPresetId}`).then(({ data }) => {
      if (data.ok) { setLayout(data.data.layout); setTab('editor') }
    }).catch(() => {})
  }, [initialPresetId])

  if (!loaded) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ fontFamily: C.head, fontSize: 28, letterSpacing: 2, marginBottom: 10 }}>THE CLUSTER FUCKER</div>
        <TabBar tabs={[{ id: 'editor', label: 'Editor' }, { id: 'myclusters', label: 'My Clusters' }, { id: 'library', label: 'Public Library' }]}
          active={tab} onChange={setTab} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'editor' && (
          <EditorTab layout={layout} setLayout={setLayout} identity={identity} localPresets={localPresets} saveLocalPresets={saveLocalPresets} showToast={showToast} />
        )}
        {tab === 'myclusters' && (
          <MyClustersTab localPresets={localPresets} saveLocalPresets={saveLocalPresets} identity={identity} showToast={showToast}
            onEdit={l => { setLayout(l); setTab('editor') }} />
        )}
        {tab === 'library' && (
          <PublicLibraryTab identity={identity} localPresets={localPresets} saveLocalPresets={saveLocalPresets} showToast={showToast}
            onEdit={l => { setLayout(l); setTab('editor') }} />
        )}
      </div>
    </div>
  )
}
