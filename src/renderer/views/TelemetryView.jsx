import { useState, useEffect } from 'react'
import { C, Card, Label, Btn, TextInput, Toggle, TabBar, SectionHead } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useTelemetryShm } from '../hooks/useTelemetryShm'
import { WIDGET_CATALOG, WIDGET_CATEGORIES, SIZE_PRESETS } from '../components/telemetry/widgets'

const api = window.api

// ── Phase 13: multi-game badge + setup instructions ────────────────────────
const GAME_COLORS = {
  ac1: C.blue, acc: C.green, acevo: C.purple, acrally: C.orange,
  fh5: '#00A651', fh6: '#00A651', demo: C.muted,
  f125: '#E10600', ams2: '#FF6600',
}

const GAME_SETUP = [
  {
    id: 'ac1', label: 'AC1',
    body: (
      <>
        <div>Edit <code>cfg.ini</code>:</div>
        <pre style={{ margin: '6px 0', fontFamily: C.mono, fontSize: 11, color: C.blue }}>{'[LIVE_TELEMETRY]\nENABLE=1\nUDP_PORT=9996'}</pre>
      </>
    ),
  },
  {
    id: 'acc', label: 'ACC',
    body: <div>No extra config needed — shared memory is always on. Just start a session. Make sure ACC is running before clicking Start Telemetry.</div>,
  },
  {
    id: 'acevo', label: 'AC Evo',
    body: <div>No extra config — shared memory is on by default. The API is still in development; ShinRacer will update as Kunos finalises the format.</div>,
  },
  {
    id: 'acrally', label: 'AC Rally',
    body: <div>Same as AC1 — check if a <code>[LIVE_TELEMETRY]</code> section is needed. If no data appears, AC Rally may not yet expose this data — check back after future game updates.</div>,
  },
  {
    id: 'fh5', label: 'FH5',
    body: (
      <>
        <div>Settings → HUD and Gameplay → Data Out: <b>ON</b></div>
        <div>Data Out IP Address: <code>127.0.0.1</code></div>
        <div>Data Out IP Port: the Forza port set in Settings (default 5300)</div>
        <div style={{ marginTop: 4, color: C.orange }}>Forza only supports one Data Out destination.</div>
      </>
    ),
  },
  {
    id: 'fh6', label: 'FH6',
    body: <div>Same as FH5. FH6 adds extra vehicle class fields, shown in the status bar once detected.</div>,
  },
  {
    id: 'f125', label: 'F1 25',
    body: (
      <>
        <div>Game Options → Settings → UDP Telemetry Settings:</div>
        <ul style={{ margin: '4px 0 0 16px' }}>
          <li>UDP Telemetry: <b>On</b></li>
          <li>UDP Broadcast Mode: <b>Off</b></li>
          <li>UDP IP Address: <code>127.0.0.1</code></li>
          <li>UDP Send Rate: <b>20Hz</b></li>
          <li>UDP Format: <b>2025</b></li>
          <li>UDP Port: your configured port (default 20777, set in Settings → Telemetry)</li>
          <li>Your Telemetry: <b>Public</b> (needed for full data)</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ams2', label: 'AMS2',
    body: (
      <>
        <div>Enable: Options → System → Shared Memory → <b>Project CARS 2</b></div>
        <div style={{ marginTop: 4 }}>No other configuration needed — AMS2 broadcasts automatically once that's on.</div>
        <div style={{ marginTop: 4, color: C.orange }}>If no data appears, make sure you're in a driving session, not in menus.</div>
      </>
    ),
  },
]

function GameSetupInstructions() {
  const [openId, setOpenId] = useState(null)
  return (
    <div style={{ marginTop: 24, width: '100%', maxWidth: 480, textAlign: 'left' }}>
      <div style={{ fontFamily: C.head, fontSize: 14, letterSpacing: 1, color: C.muted, marginBottom: 8, textTransform: 'uppercase' }}>
        How to enable telemetry
      </div>
      {GAME_SETUP.map(g => (
        <div key={g.id} style={{ border: `1px solid ${C.border}`, marginBottom: 4 }}>
          <button onClick={() => setOpenId(openId === g.id ? null : g.id)}
            style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontFamily: C.body, fontSize: 12, color: C.textPrimary }}>
            {g.label}
            <span style={{ color: C.muted }}>{openId === g.id ? '−' : '+'}</span>
          </button>
          {openId === g.id && (
            <div style={{ padding: '0 12px 12px', fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{g.body}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Track 4: preset definitions — which widgets are active + their default
// size for each of the 5 quick-start layouts, shared by the Configure tab's
// "Load preset" strip and the Overlay tab's independent layout selector. ────
export const PRESETS = [
  {
    id: 'fullDash', label: 'Full Dash',
    widgets: [
      { id: 'gearDisplay', size: 'lg' },
      { id: 'rpmBar', size: 'lg' },
      { id: 'throttleBrakeBar', size: 'sm' },
      { id: 'speedGauge', size: 'md' },
      { id: 'lapTiming', size: 'md' },
      { id: 'tyreMap', size: 'lg' },
      { id: 'fuelBar', size: 'sm' },
      { id: 'statusBar', size: 'lg' },
    ],
  },
  {
    id: 'tyreMap', label: 'Tyre Map',
    widgets: [
      { id: 'tyreMap', size: 'lg' },
      { id: 'suspensionBars', size: 'md' },
      { id: 'speedGauge', size: 'sm' },
    ],
  },
  {
    id: 'corner', label: 'Corner',
    widgets: [
      { id: 'gearDisplay', size: 'lg' },
      { id: 'miniSpeed', size: 'sm' },
      { id: 'lapTiming', size: 'sm' },
      { id: 'throttleBrakeBar', size: 'sm' },
    ],
  },
  {
    id: 'timing', label: 'Timing',
    widgets: [
      { id: 'lapTiming', size: 'lg' },
      { id: 'statusBar', size: 'lg' },
      { id: 'fuelBar', size: 'sm' },
    ],
  },
  {
    id: 'minimal', label: 'Minimal',
    widgets: [
      { id: 'miniSpeed', size: 'sm' },
    ],
  },
]

// Overlay window dimensions per preset — independent of the in-app grid sizing.
export const PRESET_OVERLAY_DIMS = {
  fullDash: { width: 1920, height: 120 },
  tyreMap:  { width: 220, height: 200 },
  corner:   { width: 280, height: 160 },
  timing:   { width: 240, height: 140 },
  minimal:  { width: 320, height: 50 },
}

const CORNERS = [
  { id: 'topLeft', label: 'Top Left' },
  { id: 'topRight', label: 'Top Right' },
  { id: 'bottomLeft', label: 'Bottom Left' },
  { id: 'bottomRight', label: 'Bottom Right' },
  { id: 'centre', label: 'Centre' },
]

function computeCornerBounds(corner, width, height) {
  const sw = window.screen.width, sh = window.screen.height
  const margin = 12
  switch (corner) {
    case 'topLeft':     return { x: margin, y: margin, width, height }
    case 'topRight':    return { x: sw - width - margin, y: margin, width, height }
    case 'bottomLeft':  return { x: margin, y: sh - height - margin, width, height }
    case 'bottomRight': return { x: sw - width - margin, y: sh - height - margin, width, height }
    case 'centre':      return { x: Math.round((sw - width) / 2), y: Math.round((sh - height) / 2), width, height }
    default:            return { x: margin, y: margin, width, height }
  }
}

// ── Shared widget container (LIVE tab + reused for the preview blocks) ─────
export function WidgetContainer({ item, frame }) {
  const entry = WIDGET_CATALOG.find(w => w.id === item.id)
  if (!entry) return null
  const Component = entry.component
  const sizeInfo = SIZE_PRESETS[item.size] || SIZE_PRESETS.md
  return (
    <div style={{ gridColumn: `span ${sizeInfo.colSpan}`, border: `1px solid ${C.border}`, background: C.surface, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 16, background: C.border, display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0 }}>
        <span style={{ fontFamily: C.body, fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{entry.label}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, minHeight: sizeInfo.height }}>
        <Component frame={frame} config={item.config} />
      </div>
    </div>
  )
}

// ── LIVE tab ─────────────────────────────────────────────────────────────
function GameBadge({ game, gameDisplayName }) {
  const color = GAME_COLORS[game] || C.muted
  return (
    <span style={{ fontFamily: C.head, fontSize: 11, letterSpacing: 1, color,
      border: `1px solid ${color}`, padding: '2px 8px', textTransform: 'uppercase' }}>
      {(gameDisplayName || game || '').toUpperCase()}
    </span>
  )
}

function StatusHeader({ frame, isDemo }) {
  if (isDemo) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.blue }} />
          <span style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1 }}>
            <span style={{ color: C.blue }}>DEMO MODE</span>
          </span>
          <GameBadge game="demo" gameDisplayName="Demo" />
        </div>
        <div style={{ fontFamily: C.body, fontSize: 12, color: C.muted, marginTop: 2 }}>No game detected — showing simulated data</div>
      </div>
    )
  }
  if (!frame || frame.status === 'OFF') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.red }} />
          <span style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, color: C.muted }}>WAITING FOR GAME</span>
        </div>
        <div style={{ fontFamily: C.body, fontSize: 12, color: C.muted, marginTop: 2 }}>Start a session in a supported game to see live data</div>
      </div>
    )
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
        <span style={{ fontFamily: C.head, fontSize: 18, letterSpacing: 1, color: C.green }}>LIVE</span>
        <GameBadge game={frame.game} gameDisplayName={frame.gameDisplayName} />
      </div>
      <div style={{ fontFamily: C.body, fontSize: 12, color: C.muted, marginTop: 2 }}>{frame.carModel} · {frame.track}</div>
    </div>
  )
}

function LiveTab({ frame, isDemo, warning, enabledWidgets, onPopOut }) {
  // Demo mode kicks in ~500ms after the last real frame (see
  // useTelemetryShm.js), so a bare "no game detected yet" waiting state is
  // only ever visible for a flash — practically, "demo mode" and "no game
  // detected" are the same state from the user's point of view. The setup
  // instructions below are shown whenever we're in that state, alongside
  // (not instead of) the widget grid — demo mode's whole point is letting
  // someone see what the dash looks like while they figure out how to get
  // it live.
  const noGameYet = isDemo || !frame || frame.status === 'OFF'
  const acEvoWarning = frame?.game === 'acevo' && (frame?.parseError || warning)
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <StatusHeader frame={frame} isDemo={isDemo} />
        <Tooltip text="Open the overlay window so you can position it over Assetto Corsa">
          <Btn variant="ghost" size="sm" onClick={onPopOut}>Pop out overlay →</Btn>
        </Tooltip>
      </div>
      {acEvoWarning && (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: C.orange }}>
          {warning || 'AC Evo telemetry parse error — data may be stale. ShinRacer will update when Kunos finalises the API.'}
        </div>
      )}
      {enabledWidgets.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 10 }}>
          <div style={{ fontFamily: C.head, fontSize: 24, letterSpacing: 1, textTransform: 'uppercase', color: C.muted }}>No widgets enabled</div>
          <div style={{ fontFamily: C.body, fontSize: 13, color: C.muted }}>Go to Configure to add telemetry widgets</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 12 }}>
          {enabledWidgets.map((item, idx) => <WidgetContainer key={`${item.id}_${idx}`} item={item} frame={frame} />)}
        </div>
      )}
      {noGameYet && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GameSetupInstructions />
        </div>
      )}
    </div>
  )
}

// ── CONFIGURE tab ────────────────────────────────────────────────────────
function ConfigureTab({ enabledWidgets, setEnabledWidgets, activePresetId, applyPreset }) {
  const isEnabled = (id) => enabledWidgets.some(w => w.id === id)
  const currentFor = (id) => enabledWidgets.find(w => w.id === id)

  const toggle = (id) => {
    if (isEnabled(id)) {
      setEnabledWidgets(prev => prev.filter(w => w.id !== id))
    } else {
      const entry = WIDGET_CATALOG.find(w => w.id === id)
      setEnabledWidgets(prev => [...prev, { id, size: entry?.defaultSize || 'md' }])
    }
  }
  const setSize = (id, size) => setEnabledWidgets(prev => prev.map(w => (w.id === id ? { ...w, size } : w)))
  const reorder = (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return
    setEnabledWidgets(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }
  const resetLayout = () => { if (activePresetId) applyPreset(activePresetId) }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: 'auto', padding: 16 }}>
        <Label muted>Load preset</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
          {PRESETS.map(p => (
            <Tooltip key={p.id} text={`Clear the current layout and load the ${p.label} preset`}>
              <Btn size="xs" variant="ghost" onClick={() => applyPreset(p.id)}
                style={{ border: `1px solid ${activePresetId === p.id ? C.blue : C.border}`, color: activePresetId === p.id ? C.blue : C.textPrimary }}>
                {p.label.toUpperCase()}
              </Btn>
            </Tooltip>
          ))}
        </div>

        {WIDGET_CATEGORIES.map(cat => (
          <div key={cat} style={{ marginBottom: 22 }}>
            <Label muted>{cat}</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {WIDGET_CATALOG.filter(w => w.category === cat).map(w => {
                const enabled = isEnabled(w.id)
                const current = currentFor(w.id)
                return (
                  <div key={w.id}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: C.textPrimary, fontFamily: C.body }}>
                      <input type="checkbox" checked={enabled} onChange={() => toggle(w.id)} />
                      {w.label}
                    </label>
                    {enabled && (
                      <div style={{ display: 'flex', gap: 4, marginTop: 5, marginLeft: 22 }}>
                        {Object.entries(SIZE_PRESETS).map(([key, info]) => (
                          <button key={key} onClick={() => setSize(w.id, key)}
                            style={{ fontSize: 9, padding: '2px 8px', background: 'transparent', cursor: 'pointer', borderRadius: 0,
                              border: `1px solid ${current?.size === key ? C.blue : C.border}`, color: current?.size === key ? C.blue : C.muted,
                              fontFamily: C.body }}>
                            {info.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <SectionHead children="Layout preview" sub="Drag blocks to reorder — snaps to a 12-column grid" />
          <Tooltip text="Return to the active preset's default widget order">
            <Btn size="xs" variant="ghost" onClick={resetLayout} disabled={!activePresetId}>Reset layout</Btn>
          </Tooltip>
        </div>
        {enabledWidgets.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13 }}>No widgets enabled — check some on the left, or load a preset</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 8 }}>
            {enabledWidgets.map((item, idx) => {
              const entry = WIDGET_CATALOG.find(w => w.id === item.id)
              const sizeInfo = SIZE_PRESETS[item.size] || SIZE_PRESETS.md
              return (
                <div key={`${item.id}_${idx}`} draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); reorder(Number(e.dataTransfer.getData('text/plain')), idx) }}
                  style={{ gridColumn: `span ${sizeInfo.colSpan}`, height: 60, border: `1px solid ${C.border}`, background: C.raised,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab',
                    fontFamily: C.body, fontSize: 11, color: C.textSec, textAlign: 'center', padding: 4 }}>
                  {entry?.label || item.id}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── OVERLAY tab ──────────────────────────────────────────────────────────
function OverlayTab({ overlayOpen, overlayConfig, updateOverlayConfig, onOpen, onClose, overlayError }) {
  const activePreset = overlayConfig.presetId

  const applyPreset = (presetId) => {
    const dims = PRESET_OVERLAY_DIMS[presetId] || { width: 400, height: 200 }
    updateOverlayConfig({ presetId, width: dims.width, height: dims.height })
  }

  const snapTo = (corner) => {
    const dims = { width: overlayConfig.width || 400, height: overlayConfig.height || 200 }
    const bounds = computeCornerBounds(corner, dims.width, dims.height)
    updateOverlayConfig(bounds)
    if (overlayOpen) api.telemetry.setOverlayBounds(bounds)
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card accent={C.borderHi}>
        <SectionHead children="Overlay window" sub="A borderless, always-on-top window you position over Assetto Corsa" />
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip text="Open the overlay window with the settings below">
            <Btn onClick={onOpen} disabled={overlayOpen}>Launch overlay</Btn>
          </Tooltip>
          {overlayOpen && (
            <Tooltip text="Close the overlay window">
              <Btn variant="danger" onClick={onClose}>Close overlay</Btn>
            </Tooltip>
          )}
        </div>
        {overlayError && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>✕ {overlayError}</div>}
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Settings" />
        <Tooltip text="Keep the overlay above Assetto Corsa's window">
          <Toggle label="Always on top" hint="Keep overlay above Assetto Corsa" value={overlayConfig.alwaysOnTop ?? true}
            onChange={v => updateOverlayConfig({ alwaysOnTop: v }, true)} />
        </Tooltip>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <Label>Opacity</Label>
            <span style={{ fontFamily: C.mono, color: C.blue, fontSize: 13 }}>{Math.round((overlayConfig.opacity ?? 0.85) * 100)}%</span>
          </div>
          <Tooltip text="How transparent the overlay is — lower values see more of AC through it">
            <input type="range" min={0.3} max={1} step={0.05} value={overlayConfig.opacity ?? 0.85}
              onChange={e => updateOverlayConfig({ opacity: Number(e.target.value) }, true)}
              style={{ width: '100%', accentColor: C.blue }} />
          </Tooltip>
        </div>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Overlay layout" sub="Independent from the main app's Configure layout" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map(p => (
            <Tooltip key={p.id} text={`Show the ${p.label} widget set in the overlay window`}>
              <Btn size="sm" variant="ghost" onClick={() => applyPreset(p.id)}
                style={{ border: `1px solid ${activePreset === p.id ? C.blue : C.border}`, color: activePreset === p.id ? C.blue : C.textPrimary }}>
                {p.label.toUpperCase()}
              </Btn>
            </Tooltip>
          ))}
        </div>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Position & size" />
        <Label muted>Snap to corner</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {CORNERS.map(c => (
            <Tooltip key={c.id} text={`Move the overlay to the ${c.label.toLowerCase()} of your screen`}>
              <Btn size="xs" variant="ghost" onClick={() => snapTo(c.id)}>{c.label.toUpperCase()}</Btn>
            </Tooltip>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label muted>X</Label>
            <TextInput mono value={String(overlayConfig.x ?? 0)} onChange={v => updateOverlayConfig({ x: Number(v) || 0 }, true)} />
          </div>
          <div>
            <Label muted>Y</Label>
            <TextInput mono value={String(overlayConfig.y ?? 0)} onChange={v => updateOverlayConfig({ y: Number(v) || 0 }, true)} />
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────
export default function TelemetryView() {
  const { frame, isDemo, warning } = useTelemetryShm()
  const [tab, setTab] = useState('live')
  const [enabledWidgets, setEnabledWidgetsState] = useState([])
  const [activePresetId, setActivePresetId] = useState(null)
  const [overlayConfig, setOverlayConfigState] = useState({
    alwaysOnTop: true, opacity: 0.85, presetId: 'minimal', width: 320, height: 50, x: 100, y: 100,
  })
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [overlayError, setOverlayError] = useState(null)

  const persistLayout = (widgets, presetId) => {
    setEnabledWidgetsState(widgets)
    setActivePresetId(presetId ?? null)
    api.store.set('telemetryLayout', { widgets, presetId: presetId ?? null })
  }

  const applyPreset = (presetId) => {
    const preset = PRESETS.find(p => p.id === presetId)
    if (preset) persistLayout(preset.widgets, presetId)
  }

  useEffect(() => {
    api.store.get('telemetryLayout').then(saved => {
      if (saved?.widgets?.length) persistLayout(saved.widgets, saved.presetId)
      else applyPreset('fullDash')
    })
    api.store.get('overlayConfig').then(saved => { if (saved) setOverlayConfigState(prev => ({ ...prev, ...saved })) })
    api.telemetry.overlayStatus().then(s => setOverlayOpen(!!s?.open))
    const unsub = api.telemetry.onOverlayClosed(() => setOverlayOpen(false))
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setEnabledWidgets = (updater) => {
    setEnabledWidgetsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      api.store.set('telemetryLayout', { widgets: next, presetId: null })
      setActivePresetId(null)
      return next
    })
  }

  const updateOverlayConfig = (patch, live) => {
    setOverlayConfigState(prev => {
      const next = { ...prev, ...patch }
      api.store.set('overlayConfig', next)
      return next
    })
    if (live) {
      if ('alwaysOnTop' in patch) api.telemetry.setOverlayAlwaysOnTop(patch.alwaysOnTop)
      if ('opacity' in patch) api.telemetry.setOverlayOpacity(patch.opacity)
    }
  }

  const openOverlay = async () => {
    setTab('overlay')
    try {
      const res = await api.telemetry.openOverlay(overlayConfig)
      if (res?.ok) { setOverlayOpen(true); setOverlayError(null) }
      else setOverlayError(res?.error || 'Could not open the overlay window')
    } catch (e) {
      setOverlayError(e.message || 'Could not open the overlay window')
    }
  }
  const closeOverlay = async () => {
    await api.telemetry.closeOverlay()
    setOverlayOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 0', flexShrink: 0 }}>
        <TabBar tabs={[
          { id: 'live', label: 'Live' },
          { id: 'configure', label: 'Configure' },
          { id: 'overlay', label: 'Overlay' },
        ]} active={tab} onChange={setTab} />
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'live' && <LiveTab frame={frame} isDemo={isDemo} warning={warning} enabledWidgets={enabledWidgets} onPopOut={openOverlay} />}
        {tab === 'configure' && (
          <ConfigureTab enabledWidgets={enabledWidgets} setEnabledWidgets={setEnabledWidgets}
            activePresetId={activePresetId} applyPreset={applyPreset} />
        )}
        {tab === 'overlay' && (
          <OverlayTab overlayOpen={overlayOpen} overlayConfig={overlayConfig} overlayError={overlayError}
            updateOverlayConfig={updateOverlayConfig} onOpen={openOverlay} onClose={closeOverlay} />
        )}
      </div>
    </div>
  )
}
