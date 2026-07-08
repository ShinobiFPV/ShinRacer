import { useState, useEffect } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Select, Slider, Toggle, Tag, TabBar } from '../components/primitives'
import { useStore } from '../store/AppStore'
import { generateServerCfg, generateEntryList } from '../lib/iniUtils'
import path from 'path'  // available via electron context

const api = window.api

const WEATHERS    = ['Clear','Partly Cloudy','Overcast','Light Rain','Heavy Rain','Foggy']
const TIMES       = ['Dawn (6:00)','Morning (9:00)','Midday (12:00)','Afternoon (15:00)','Dusk (18:00)','Night (21:00)']
const JUMP_START  = ['None','Pits','DT']

function defaultCfg(serverName) {
  return {
    name: serverName || 'ShinTech Race Server',
    trackId: '', layoutId: '', trackPath: '',
    cars: [], entrySlots: [],
    maxClients: 8, weather: 'Clear', time: 'Midday (12:00)',
    password: '', port: 9600, httpPort: 8081,
    allowances: { tc: true, abs: true, stability: false, autoclutch: false, tyreBlankets: false },
    sessionPractice: true, sessionQualify: true, sessionRace: true,
    raceLength: 20, qualifyMinutes: 15, jumpStart: 'DT',
  }
}

// ── Track Picker ──────────────────────────────────────────────────────────────
function TrackPicker({ acPath, value, onChange }) {
  const [tracks, setTracks]   = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter]   = useState('')

  useEffect(() => {
    if (!acPath) return
    setLoading(true)
    api.ac.scanTracks(acPath).then(res => {
      setTracks(res.tracks || [])
      setLoading(false)
    })
  }, [acPath])

  const filtered = tracks.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))

  if (!acPath) return (
    <div style={{ padding: 20, color: C.muted, fontSize: 13, textAlign: 'center' }}>
      Set your AC path in Settings to browse tracks
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <TextInput value={filter} onChange={setFilter} placeholder="Filter tracks…" />
      </div>
      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Scanning tracks folder…</div>}
      <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map(t => (
          <button key={t.name} onClick={() => onChange(t)}
            style={{ background: value?.name === t.name ? `${C.yellow}18` : C.bg,
              border: `1px solid ${value?.name === t.name ? C.yellow : C.border}`,
              borderRadius: 5, padding: '8px 12px', textAlign: 'left', color: C.white,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: C.mono, fontSize: 12 }}>{t.name}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {t.hasTraffic && <Tag color={C.green} size="xs">traffic</Tag>}
              {t.layouts.length > 1 && <Tag color={C.muted} size="xs">{t.layouts.length} layouts</Tag>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Car Picker ────────────────────────────────────────────────────────────────
function CarPicker({ acPath, selected, onChange }) {
  const [cars, setCars]     = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!acPath) return
    setLoading(true)
    const carsDir = `${acPath}\\content\\cars`
    api.fs.readDir(carsDir).then(res => {
      if (res.ok) setCars(res.files)
      setLoading(false)
    })
  }, [acPath])

  const toggle = (car) => {
    onChange(selected.includes(car) ? selected.filter(c => c !== car) : [...selected, car])
  }

  const filtered = cars.filter(c => c.toLowerCase().includes(filter.toLowerCase()))

  if (!acPath) return <div style={{ color: C.muted, fontSize: 13 }}>Set AC path in Settings to browse cars</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <TextInput value={filter} onChange={setFilter} placeholder="Filter cars…" style={{ flex: 1, marginRight: 8 }} />
        <Tag color={C.blue}>{selected.length} selected</Tag>
      </div>
      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Scanning cars…</div>}
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {filtered.map(car => (
          <label key={car} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
            borderRadius: 4, background: selected.includes(car) ? `${C.yellow}12` : 'transparent',
            border: `1px solid ${selected.includes(car) ? C.yellowDim : 'transparent'}`, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.includes(car)} onChange={() => toggle(car)} />
            <span style={{ fontFamily: C.mono, fontSize: 11 }}>{car}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {selected.map(c => (
            <button key={c} onClick={() => toggle(c)}
              style={{ background: C.raised, border: `1px solid ${C.border}`, borderRadius: 3,
                color: C.muted, fontSize: 10, padding: '2px 6px', fontFamily: C.mono }}>
              {c} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Build View ───────────────────────────────────────────────────────────
export default function BuildView({ initialCfg, onDeployed }) {
  const { settings, profiles, saveProfiles, addLiveServer, showToast } = useStore()
  const [cfg, setCfg]       = useState(initialCfg || defaultCfg(settings.serverName))
  const [tab, setTab]       = useState('track')
  const [deploying, setDeploying] = useState(false)
  const [previewTab, setPreviewTab] = useState('cfg')

  const set  = (k, v) => setCfg(prev => ({ ...prev, [k]: v }))
  const setA = (k, v) => setCfg(prev => ({ ...prev, allowances: { ...prev.allowances, [k]: v } }))

  const emptySlot = () => ({ car: '', skin: '', driverName: '', guid: '' })
  const entrySlots = Array.from({ length: cfg.maxClients }, (_, i) => cfg.entrySlots?.[i] || emptySlot())

  const updateSlot = (i, key, val) => {
    const next = Array.from({ length: cfg.maxClients }, (_, idx) => cfg.entrySlots?.[idx] || emptySlot())
    next[i] = { ...next[i], [key]: val }
    set('entrySlots', next)
  }

  const autoFillSlots = () => {
    const cars = [...new Set(cfg.cars)]
    if (!cars.length) return
    set('entrySlots', Array.from({ length: cfg.maxClients }, (_, i) => ({
      car: cars[i % cars.length], skin: '', driverName: '', guid: '',
    })))
  }

  const selectTrack = (t) => {
    set('trackId', t.name)
    set('trackPath', t.path)
    set('layoutId', t.layouts[0] || '')
  }

  // Generate preview INI content
  const iniPreview  = generateServerCfg(cfg, settings.adminPassword)
  const entryPreview = generateEntryList(cfg)

  const canDeploy = cfg.trackId && cfg.cars.length > 0 && settings.acServerExe

  const deploy = async () => {
    if (!canDeploy) return
    setDeploying(true)

    const id      = `srv_${Date.now()}`
    const cfgDir  = `${settings.acPath}\\server\\cfg`
    const cfgPath  = `${cfgDir}\\server_cfg.ini`
    const entryPath = `${cfgDir}\\entry_list.ini`

    // Write config files
    const iniResult   = await api.fs.writeFile(cfgPath, iniPreview)
    const entryResult = await api.fs.writeFile(entryPath, entryPreview)

    if (!iniResult.ok || !entryResult.ok) {
      showToast(`✕ Write failed: ${iniResult.error || entryResult.error}`, C.red)
      setDeploying(false)
      return
    }

    // Launch process
    const result = await api.server.launch({
      id, acServerPath: settings.acServerExe,
      serverCfgPath: cfgPath, entryListPath: entryPath,
    })

    if (!result.ok) {
      showToast(`✕ Launch failed: ${result.error}`, C.red)
      setDeploying(false)
      return
    }

    addLiveServer({ id, name: cfg.name, config: cfg, startedAt: Date.now(), pid: result.pid, logPath: result.logPath, players: 0 })
    showToast(`✓ ${cfg.name} is live on :${cfg.port}`)
    setDeploying(false)
    onDeployed?.()
  }

  const savePreset = async () => {
    const preset = { ...cfg, id: `preset_${Date.now()}`, savedAt: Date.now() }
    await saveProfiles([...profiles, preset])
    showToast('✓ Saved to Garage')
  }

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Left: config */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Server identity */}
        <Card>
          <SectionHead children="Server identity" />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <Label>Server name</Label>
              <TextInput value={cfg.name} onChange={v => set('name', v)} />
            </div>
            <div>
              <Label>TCP/UDP port</Label>
              <TextInput value={cfg.port} onChange={v => set('port', +v)} mono />
            </div>
            <div>
              <Label>HTTP port</Label>
              <TextInput value={cfg.httpPort} onChange={v => set('httpPort', +v)} mono />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <Label>Join password (blank = public)</Label>
              <TextInput value={cfg.password} onChange={v => set('password', v)} placeholder="optional" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <Slider label="Max clients" value={cfg.maxClients} min={1} max={24} step={1}
                format={v => v} onChange={v => set('maxClients', v)} />
            </div>
          </div>
        </Card>

        {/* Tabs: Track / Cars / Sessions / Aids */}
        <Card style={{ flex: 1 }}>
          <TabBar tabs={[
            { id: 'track', label: 'Track' },
            { id: 'cars',  label: 'Cars', badge: cfg.cars.length },
            { id: 'sessions', label: 'Sessions' },
            { id: 'aids', label: 'Aids & Rules' },
            { id: 'entrylist', label: 'Entry List', badge: entrySlots.filter(s => s.car).length },
          ]} active={tab} onChange={setTab} />

          {tab === 'track' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <Label>Weather</Label>
                  <Select value={cfg.weather} onChange={v => set('weather', v)} options={WEATHERS} />
                </div>
                <div>
                  <Label>Time of day</Label>
                  <Select value={cfg.time} onChange={v => set('time', v)} options={TIMES} />
                </div>
              </div>
              <Label>Track</Label>
              <TrackPicker acPath={settings.acPath} value={{ name: cfg.trackId }} onChange={selectTrack} />
              {cfg.trackId && (
                <div style={{ marginTop: 10 }}>
                  <Label>Layout</Label>
                  <TextInput value={cfg.layoutId} onChange={v => set('layoutId', v)} mono />
                </div>
              )}
            </div>
          )}

          {tab === 'cars' && (
            <CarPicker acPath={settings.acPath} selected={cfg.cars} onChange={v => set('cars', v)} />
          )}

          {tab === 'sessions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { key: 'sessionPractice', label: 'Practice (30 min)' },
                { key: 'sessionQualify',  label: 'Qualifying' },
                { key: 'sessionRace',     label: 'Race' },
              ].map(s => (
                <label key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={cfg[s.key]} onChange={e => set(s.key, e.target.checked)} />
                  {s.label}
                </label>
              ))}
              {cfg.sessionQualify && (
                <Slider label="Qualify duration" value={cfg.qualifyMinutes} min={5} max={60} step={5}
                  format={v => `${v} min`} onChange={v => set('qualifyMinutes', v)} />
              )}
              {cfg.sessionRace && (
                <Slider label="Race length" value={cfg.raceLength} min={1} max={100} step={1}
                  format={v => `${v} laps`} onChange={v => set('raceLength', v)} />
              )}
              <div>
                <Label>Jump start penalty</Label>
                <Select value={cfg.jumpStart} onChange={v => set('jumpStart', v)} options={JUMP_START} />
              </div>
            </div>
          )}

          {tab === 'aids' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                {[
                  { key: 'tc',           label: 'Traction control' },
                  { key: 'abs',          label: 'ABS' },
                  { key: 'stability',    label: 'Stability control' },
                  { key: 'autoclutch',   label: 'Auto clutch' },
                  { key: 'tyreBlankets', label: 'Tyre blankets' },
                ].map(a => (
                  <Toggle key={a.key} label={a.label} value={cfg.allowances[a.key]} onChange={v => setA(a.key, v)} />
                ))}
              </div>
            </div>
          )}

          {tab === 'entrylist' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {cfg.maxClients} slot{cfg.maxClients !== 1 ? 's' : ''} · {cfg.cars.length} car model{cfg.cars.length !== 1 ? 's' : ''} selected
                </div>
                <Btn size="sm" variant="subtle" onClick={autoFillSlots} disabled={!cfg.cars.length}>Auto-fill</Btn>
              </div>
              {!cfg.cars.length && (
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Select cars in the Cars tab to assign them to slots</div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '46px 2fr 1fr 1.2fr 1.4fr', gap: 8, padding: '0 10px', marginBottom: 6 }}>
                <Label muted>Slot</Label>
                <Label muted>Car</Label>
                <Label muted>Skin</Label>
                <Label muted>Driver</Label>
                <Label muted>GUID</Label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
                {entrySlots.map((slot, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '46px 2fr 1fr 1.2fr 1.4fr', gap: 8,
                    alignItems: 'center', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 10px' }}>
                    <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>{String(i).padStart(2, '0')}</span>
                    <Select value={slot.car} onChange={v => updateSlot(i, 'car', v)}
                      options={[{ value: '', label: '— none —' }, ...cfg.cars.map(c => ({ value: c, label: c }))]} />
                    <TextInput value={slot.skin} onChange={v => updateSlot(i, 'skin', v)} placeholder="random" mono />
                    <TextInput value={slot.driverName} onChange={v => updateSlot(i, 'driverName', v)} placeholder="optional" />
                    <TextInput value={slot.guid} onChange={v => updateSlot(i, 'guid', v)} placeholder="optional" mono />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Right: preview + deploy */}
      <div style={{ width: 360, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        {/* INI preview */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {['cfg', 'entry'].map(t => (
              <button key={t} onClick={() => setPreviewTab(t)}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: `1px solid ${previewTab === t ? C.yellow : C.border}`,
                  background: previewTab === t ? `${C.yellow}18` : 'transparent', color: previewTab === t ? C.yellow : C.muted,
                  fontFamily: C.mono }}>
                {t === 'cfg' ? 'server_cfg.ini' : 'entry_list.ini'}
              </button>
            ))}
          </div>
          <div style={{ background: C.bg, borderRadius: 6, padding: 12, fontFamily: C.mono, fontSize: 10,
            lineHeight: 1.8, color: C.mutedHi, maxHeight: 500, overflowY: 'auto' }}>
            {(previewTab === 'cfg' ? iniPreview : entryPreview).split('\n').map((line, i) => {
              const color = line.startsWith(';') ? C.muted
                : line.startsWith('[') ? C.yellow
                : line.includes('=') ? C.white : C.mutedHi
              if (line.includes('=') && !line.startsWith(';')) {
                const [k, ...rest] = line.split('=')
                return <div key={i}><span style={{ color: '#7EC8E3' }}>{k}</span><span style={{ color: C.muted }}>=</span><span style={{ color: '#A8E6A3' }}>{rest.join('=')}</span></div>
              }
              return <div key={i} style={{ color }}>{line || '\u00A0'}</div>
            })}
          </div>
        </div>

        {/* Deploy panel */}
        <div style={{ padding: 16, borderTop: `1px solid ${C.border}`, background: C.surface }}>
          {!settings.acServerExe && (
            <div style={{ fontSize: 11, color: C.orange, marginBottom: 10 }}>
              ⚠ Set acServer.exe path in Settings
            </div>
          )}
          {!cfg.trackId && (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Select a track to continue</div>
          )}
          {!cfg.cars.length && (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Select at least one car</div>
          )}
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            {cfg.trackId && <div>🏁 {cfg.trackId}{cfg.layoutId ? ` / ${cfg.layoutId}` : ''}</div>}
            {cfg.cars.length > 0 && <div>🚗 {cfg.cars.length} car model{cfg.cars.length !== 1 ? 's' : ''}</div>}
            <div>👥 {cfg.maxClients} slots · :{cfg.port}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="subtle" size="sm" onClick={savePreset}>Save to Garage</Btn>
            <Btn size="md" disabled={!canDeploy || deploying} onClick={deploy}
              style={{ flex: 1 }}>
              {deploying ? 'Launching…' : '▶ Launch Server'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
