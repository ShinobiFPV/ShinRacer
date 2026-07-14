import { useState, useEffect, useCallback, useRef } from 'react'
import { C, Card, SectionHead, Label, Btn, TextInput, Tag, Slider, Toggle, TabBar } from '../components/primitives'
import Tooltip, { useTooltip } from '../components/Tooltip'
import { useStore } from '../store/AppStore'
import { generateTrafficConfigIni, generateSettingsJson, parseTrafficIni } from '../lib/iniUtils'

const api = window.api

// ── Default CSP config structure ──────────────────────────────────────────────
const DEFAULT_CSP = {
  TRAFFIC:  { ACTIVE: true, MAX_CARS: 50, VARIATION: 0.3 },
  BEHAVIOR: {
    MAX_SPEED_KMH: 80, MIN_SPEED_KMH: 30, SPEED_LIMIT_MULT: 1.0,
    AGGRESSION: 0.2, LANE_DISCIPLINE: 0.85, FOLLOWING_GAP: 2.5,
    STOPPING_GAP: 4.0, BRAKE_DISTANCE_MULT: 1.0, OVERTAKING: true,
    HORN_ON_OBSTRUCTION: false, LIGHTS_AT_NIGHT: true, RANDOM_STOP_CHANCE: 0.0,
  },
  SPAWNING: {
    DESPAWN_DISTANCE: 300, SPAWN_DISTANCE_MIN: 150, SPAWN_DISTANCE_MAX: 280,
    RESPAWN_COOLDOWN: 5.0, INITIAL_BURST: 20,
  },
}

const DEFAULT_SCHEDULE = [
  0.05,0.02,0.01,0.01,0.02,0.08,
  0.25,0.55,0.85,0.70,0.60,0.65,
  0.70,0.65,0.60,0.65,0.80,0.95,
  1.00,0.85,0.65,0.45,0.25,0.12,
]

const DEFAULT_ROSTER = [
  { id:'r1', model:'ks_toyota_ae86_drift',   skin:'', weight:15, maxCount:8,  enabled:true },
  { id:'r2', model:'ks_mazda_rx7',           skin:'', weight:12, maxCount:6,  enabled:true },
  { id:'r3', model:'ks_nissan_silvia_s15',   skin:'', weight:18, maxCount:10, enabled:true },
  { id:'r4', model:'ks_honda_civic_eg6',     skin:'', weight:20, maxCount:12, enabled:true },
  { id:'r5', model:'ks_mazda_mx5_nd',        skin:'', weight:14, maxCount:8,  enabled:true },
]

const BUILTIN_PROFILES = [
  { id:'rush',  name:'Rush Hour',   color:C.red,    description:'Dense commuter, moderate aggression' },
  { id:'night', name:'Quiet Night', color:C.blue,   description:'Low density, fast movers, long gaps' },
  { id:'drift', name:'Drift Night', color:C.orange, description:'Shutoko weekend — spirited evening traffic' },
]

function makeProfile(id, name, color=C.blue, description='') {
  return {
    id, name, color, description,
    csp: JSON.parse(JSON.stringify(DEFAULT_CSP)),
    schedule: [...DEFAULT_SCHEDULE],
    roster: DEFAULT_ROSTER.map(r => ({ ...r, id: `${r.id}_${id}` })),
  }
}

const INITIAL_PROFILES = [
  { ...makeProfile('rush',  'Rush Hour',   C.red,    'Dense commuter, moderate aggression'),
    csp: { ...JSON.parse(JSON.stringify(DEFAULT_CSP)), TRAFFIC: { ACTIVE:true, MAX_CARS:80, VARIATION:0.3 },
           BEHAVIOR: { ...DEFAULT_CSP.BEHAVIOR, AGGRESSION:0.4, SPEED_LIMIT_MULT:1.1, FOLLOWING_GAP:1.8 } },
    schedule: DEFAULT_SCHEDULE.map((v,i) => (i>=7&&i<=9||i>=16&&i<=18) ? Math.min(1,v*1.5) : v),
  },
  { ...makeProfile('night', 'Quiet Night', C.blue, 'Low density, fast movers'),
    csp: { ...JSON.parse(JSON.stringify(DEFAULT_CSP)), TRAFFIC: { ACTIVE:true, MAX_CARS:20, VARIATION:0.4 },
           BEHAVIOR: { ...DEFAULT_CSP.BEHAVIOR, MAX_SPEED_KMH:120, AGGRESSION:0.5, FOLLOWING_GAP:4.0 } },
    schedule: DEFAULT_SCHEDULE.map(v => v*0.4),
  },
  { ...makeProfile('drift', 'Drift Night', C.orange, 'Shutoko weekend vibes'),
    csp: { ...JSON.parse(JSON.stringify(DEFAULT_CSP)), TRAFFIC: { ACTIVE:true, MAX_CARS:35, VARIATION:0.5 },
           BEHAVIOR: { ...DEFAULT_CSP.BEHAVIOR, MAX_SPEED_KMH:120, AGGRESSION:0.7, LANE_DISCIPLINE:0.5, OVERTAKING:true } },
    schedule: DEFAULT_SCHEDULE.map((v,i) => i>=20||i<=3 ? v*1.8 : v*0.3),
  },
]

// ── Density Curve SVG Editor ───────────────────────────────────────────────────
function DensityCurve({ schedule, onChange }) {
  const [drag, setDrag] = useState(null)
  const svgRef = useRef(null)
  const { showTooltip, hideTooltip } = useTooltip()
  const W=680, H=130, PL=28, PR=8, PT=8, PB=24
  const iW=W-PL-PR, iH=H-PT-PB
  const xFor = i => PL + (i/23)*iW
  const yFor = v => PT + (1-v)*iH
  const vFromY = y => Math.max(0, Math.min(1, 1-(y-PT)/iH))

  const pathD = schedule.map((v,i) => `${i===0?'M':'L'} ${xFor(i)} ${yFor(v)}`).join(' ')

  const onMouseMove = useCallback(e => {
    if (drag===null) return
    const rect = svgRef.current.getBoundingClientRect()
    const y = (e.clientY - rect.top) * (H / rect.height)
    const next = [...schedule]; next[drag] = Math.round(vFromY(y)*100)/100
    onChange(next)
  }, [drag, schedule, onChange])

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <Label>24-hour density schedule</Label>
        <div style={{ display:'flex', gap:4 }}>
          {[
            ['Flat 50%',   () => onChange(Array(24).fill(0.5)), 'Set every hour to 50% density'],
            ['Rush peaks', () => onChange([...DEFAULT_SCHEDULE]), 'Pre-fill schedule with morning and evening rush hour peaks'],
            ['Night only', () => onChange(Array(24).fill(0).map((_,i) => i>=20||i<=4?0.9:0.05)), 'High density only between 8pm and 4am'],
            ['Max',        () => onChange(Array(24).fill(1)), 'Set every hour to maximum density'],
            ['Clear',      () => onChange(Array(24).fill(0)), 'Set every hour to zero density'],
          ].map(([label, fn, tip]) => (
            <Tooltip key={label} text={tip}>
              <button onClick={fn}
                style={{ fontSize:10, padding:'2px 8px', background:C.raised, border:`1px solid ${C.border}`,
                  borderRadius: 8, color:C.muted, cursor:'pointer', fontFamily:C.mono }}>
                {label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
      <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius: 8, overflow:'hidden', userSelect:'none' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', display:'block', cursor:drag!==null?'ns-resize':'default' }}
          onMouseMove={onMouseMove} onMouseUp={() => setDrag(null)} onMouseLeave={() => setDrag(null)}>
          {[0.25,0.5,0.75,1].map(g => (
            <g key={g}>
              <line x1={PL} x2={W-PR} y1={yFor(g)} y2={yFor(g)} stroke={C.border} strokeWidth={0.5} />
              <text x={PL-3} y={yFor(g)+3} textAnchor="end" fontSize={7} fill={C.muted}>{g*100}%</text>
            </g>
          ))}
          <path d={`${pathD} L ${xFor(23)} ${yFor(0)} L ${xFor(0)} ${yFor(0)} Z`} fill={`${C.blue}18`} />
          <path d={pathD} fill="none" stroke={C.blue} strokeWidth={1.8} strokeLinejoin="round" />
          {schedule.map((v,i) => (
            <circle key={i} cx={xFor(i)} cy={yFor(v)} r={drag===i?7:4.5}
              fill={drag===i?C.blue:C.surface} stroke={C.blue} strokeWidth={1.5}
              style={{ cursor:'ns-resize' }} onMouseDown={e => { e.preventDefault(); setDrag(i) }}
              onMouseEnter={e => showTooltip('Drag up/down to set traffic density for this hour', e.target.getBoundingClientRect(), 'top')}
              onMouseLeave={hideTooltip} />
          ))}
          {[0,3,6,9,12,15,18,21].map(h => (
            <text key={h} x={xFor(h)} y={H-6} textAnchor="middle" fontSize={7} fill={C.muted} fontFamily={C.mono}>
              {String(h).padStart(2,'0')}h
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ── Car Roster Editor ─────────────────────────────────────────────────────────
function CarRoster({ acPath, roster, onChange }) {
  const [knownCars, setKnownCars] = useState([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!acPath) return
    api.fs.readDir(`${acPath}\\content\\cars`).then(res => {
      if (res.ok) setKnownCars(res.files)
    })
  }, [acPath])

  const totalW = roster.filter(c=>c.enabled).reduce((s,c)=>s+c.weight,0)
  const update = (id,k,v) => onChange(roster.map(c => c.id===id ? {...c,[k]:v} : c))
  const remove = (id) => onChange(roster.filter(c=>c.id!==id))
  const add    = () => onChange([...roster, { id:`rc${Date.now()}`, model:'', skin:'', weight:10, maxCount:5, enabled:true }])

  const COLORS = [C.blue, C.green, C.orange, C.red, '#00BCD4', '#FF80AB', '#8E44AD', '#00CCAA']

  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
        {roster.map((car,idx) => {
          const pct = car.enabled && totalW > 0 ? ((car.weight/totalW)*100).toFixed(0) : 0
          return (
            <div key={car.id} style={{ background:C.bg, border:`1px solid ${car.enabled?C.border:C.border+'40'}`,
              borderRadius: 8, padding:'10px 12px', opacity:car.enabled?1:0.55 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: car.enabled ? 10 : 0 }}>
                <input type="checkbox" checked={car.enabled} onChange={e=>update(car.id,'enabled',e.target.checked)} />
                <span style={{ flex:1, fontFamily:C.mono, fontSize:11, color:C.mutedHi }}>{car.model||<span style={{color:C.muted}}>no model</span>}</span>
                {car.enabled && <Tag color={COLORS[idx%COLORS.length]} size="xs">~{pct}%</Tag>}
                <button onClick={()=>remove(car.id)} style={{ background:'none',border:'none',color:C.muted,fontSize:12 }}>✕</button>
              </div>
              {car.enabled && (
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:8 }}>
                  <div>
                    <Label muted>Model</Label>
                    {knownCars.length > 0 ? (
                      <select value={car.model} onChange={e=>update(car.id,'model',e.target.value)}
                        style={{ width:'100%', background:C.surface, border:`1px solid ${C.border}`, borderRadius: 8,
                          color:C.textPrimary, padding:'5px 8px', fontSize:11, fontFamily:C.mono, outline:'none' }}>
                        <option value="">— select —</option>
                        {knownCars.filter(c=>filter?c.includes(filter):true).map(c=><option key={c}>{c}</option>)}
                      </select>
                    ) : (
                      <TextInput value={car.model} onChange={v=>update(car.id,'model',v)} placeholder="ks_toyota_ae86" mono />
                    )}
                  </div>
                  <div>
                    <Label muted>Skin</Label>
                    <TextInput value={car.skin} onChange={v=>update(car.id,'skin',v)} placeholder="random" mono />
                  </div>
                  <div>
                    <Label muted>Weight</Label>
                    <Tooltip text="Relative spawn probability — higher weight = appears more often">
                      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                        <input type="range" min={1} max={100} value={car.weight} onChange={e=>update(car.id,'weight',+e.target.value)} style={{flex:1}} />
                        <span style={{ fontFamily:C.mono, fontSize:11, color:C.orange, minWidth:22 }}>{car.weight}</span>
                      </div>
                    </Tooltip>
                  </div>
                  <div>
                    <Label muted>Max on track</Label>
                    <Tooltip text="Hard cap on how many of this car can exist simultaneously">
                      <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                        <input type="range" min={1} max={30} value={car.maxCount} onChange={e=>update(car.id,'maxCount',+e.target.value)} style={{flex:1}} />
                        <span style={{ fontFamily:C.mono, fontSize:11, color:C.blue, minWidth:22 }}>{car.maxCount}</span>
                      </div>
                    </Tooltip>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Btn size="sm" variant="subtle" onClick={add}>+ Add car</Btn>
      {totalW > 0 && (
        <div style={{ marginTop:14 }}>
          <Label muted>Spawn distribution</Label>
          <div style={{ display:'flex', height:12, borderRadius: 8, overflow:'hidden', gap:1 }}>
            {roster.filter(c=>c.enabled&&c.weight>0).map((c,i) => (
              <div key={c.id} title={`${c.model}: ${((c.weight/totalW)*100).toFixed(1)}%`}
                style={{ flex:c.weight, background:COLORS[i%COLORS.length], transition:'flex .2s' }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Behavior Panel ────────────────────────────────────────────────────────────
function BehaviorPanel({ csp, onChange }) {
  const set  = (section, key, val) => onChange({ ...csp, [section]: { ...csp[section], [key]: val } })
  const b=csp.BEHAVIOR, t=csp.TRAFFIC, s=csp.SPAWNING
  const aggrColor = b.AGGRESSION<0.3?C.green:b.AGGRESSION<0.6?C.orange:C.red
  const aggrLabel = b.AGGRESSION<0.3?'Polite':b.AGGRESSION<0.6?'Normal':b.AGGRESSION<0.8?'Aggressive':'Dangerous'

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <Card>
          <SectionHead children="Traffic volume" sub="[TRAFFIC]" />
          <Toggle label="Active" value={t.ACTIVE} onChange={v=>set('TRAFFIC','ACTIVE',v)} />
          <Slider label="Max cars" value={t.MAX_CARS} min={1} max={150} step={1} format={v=>v} onChange={v=>set('TRAFFIC','MAX_CARS',v)} color={C.blue} />
          <Slider label="Variation" value={t.VARIATION} min={0} max={1} format={v=>`${(v*100).toFixed(0)}%`} onChange={v=>set('TRAFFIC','VARIATION',v)} />
        </Card>
        <Card>
          <SectionHead children="Speed & limits" sub="[BEHAVIOR]" />
          <Slider label="Max speed" value={b.MAX_SPEED_KMH} min={20} max={250} step={5} format={v=>`${v} km/h`} onChange={v=>set('BEHAVIOR','MAX_SPEED_KMH',v)} />
          <Slider label="Min speed" value={b.MIN_SPEED_KMH} min={5} max={80} step={5} format={v=>`${v} km/h`} onChange={v=>set('BEHAVIOR','MIN_SPEED_KMH',v)} color={C.muted} />
          <Slider label="Speed limit mult" value={b.SPEED_LIMIT_MULT} min={0.5} max={2.0} format={v=>`${v.toFixed(2)}×`} onChange={v=>set('BEHAVIOR','SPEED_LIMIT_MULT',v)} hint="1.0 = obey limits. 1.3 = 30% over" />
          <Slider label="Brake distance mult" value={b.BRAKE_DISTANCE_MULT} min={0.3} max={3.0} format={v=>`${v.toFixed(2)}×`} onChange={v=>set('BEHAVIOR','BRAKE_DISTANCE_MULT',v)} />
        </Card>
        <Card>
          <SectionHead children="Spawning" sub="[SPAWNING]" />
          <Tooltip text="How far ahead AI cars appear before they're visible">
            <Slider label="Spawn min distance" value={s.SPAWN_DISTANCE_MIN} min={50} max={400} step={10} format={v=>`${v}m`} onChange={v=>set('SPAWNING','SPAWN_DISTANCE_MIN',v)} color={C.muted} />
          </Tooltip>
          <Tooltip text="How far ahead AI cars appear and disappear at most">
            <Slider label="Spawn max distance" value={s.SPAWN_DISTANCE_MAX} min={100} max={600} step={10} format={v=>`${v}m`} onChange={v=>set('SPAWNING','SPAWN_DISTANCE_MAX',v)} />
          </Tooltip>
          <Tooltip text="How far behind you AI cars despawn">
            <Slider label="Despawn distance" value={s.DESPAWN_DISTANCE} min={100} max={800} step={10} format={v=>`${v}m`} onChange={v=>set('SPAWNING','DESPAWN_DISTANCE',v)} color={C.orange} />
          </Tooltip>
          <Slider label="Respawn cooldown" value={s.RESPAWN_COOLDOWN} min={0} max={30} step={0.5} format={v=>`${v.toFixed(1)}s`} onChange={v=>set('SPAWNING','RESPAWN_COOLDOWN',v)} color={C.muted} />
          <Tooltip text="Number of AI cars spawned immediately when the session starts">
            <Slider label="Initial burst" value={s.INITIAL_BURST} min={0} max={80} step={1} format={v=>v} onChange={v=>set('SPAWNING','INITIAL_BURST',v)} hint="Cars spawned immediately at session start" />
          </Tooltip>
        </Card>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <Card accent={`${aggrColor}60`}>
          <SectionHead children="Driver behaviour" sub="[BEHAVIOR]" />
          <Tooltip text="How aggressively AI cars change lanes and close gaps (0 = polite, 1 = dangerous)">
            <div style={{ marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <Label>Aggression</Label>
                <Tag color={aggrColor}>{aggrLabel}</Tag>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={b.AGGRESSION}
                onChange={e=>set('BEHAVIOR','AGGRESSION',+e.target.value)} style={{ width:'100%', accentColor:aggrColor }} />
            </div>
          </Tooltip>
          <Tooltip text="How strictly AI stays in its lane (1 = never crosses lines)">
            <Slider label="Lane discipline" value={b.LANE_DISCIPLINE} min={0} max={1} format={v=>`${(v*100).toFixed(0)}%`} onChange={v=>set('BEHAVIOR','LANE_DISCIPLINE',v)} color={C.blue} hint="1.0 = never crosses lines" />
          </Tooltip>
          <Tooltip text="Target time headway AI maintains behind the car ahead">
            <Slider label="Following gap" value={b.FOLLOWING_GAP} min={0.5} max={10} step={0.1} format={v=>`${v.toFixed(1)}s`} onChange={v=>set('BEHAVIOR','FOLLOWING_GAP',v)} />
          </Tooltip>
          <Slider label="Stopping gap" value={b.STOPPING_GAP} min={1} max={20} step={0.5} format={v=>`${v.toFixed(1)}m`} onChange={v=>set('BEHAVIOR','STOPPING_GAP',v)} color={C.muted} />
          <Slider label="Random stop chance" value={b.RANDOM_STOP_CHANCE} min={0} max={0.1} step={0.001}
            format={v=>v===0?'None':`${(v*100).toFixed(1)}%`} onChange={v=>set('BEHAVIOR','RANDOM_STOP_CHANCE',v)} color={C.orange}
            hint="Per-second chance AI pulls over — adds realism" />
        </Card>
        <Card>
          <SectionHead children="Toggles" />
          <Toggle label="Overtaking allowed" value={b.OVERTAKING} onChange={v=>set('BEHAVIOR','OVERTAKING',v)} hint="AI changes lanes to pass slower cars" />
          <Toggle label="Horn on obstruction" value={b.HORN_ON_OBSTRUCTION} onChange={v=>set('BEHAVIOR','HORN_ON_OBSTRUCTION',v)} />
          <Toggle label="Headlights at night" value={b.LIGHTS_AT_NIGHT} onChange={v=>set('BEHAVIOR','LIGHTS_AT_NIGHT',v)} hint="sol WeatherFX uses this for transitions" />
        </Card>
        <Card>
          <SectionHead children="Quick-set behaviours" />
          {[
            { label:'🚗 Sunday driver',  fn:()=>onChange({...csp,BEHAVIOR:{...b,MAX_SPEED_KMH:55,AGGRESSION:0.05,LANE_DISCIPLINE:0.95,FOLLOWING_GAP:4.5,OVERTAKING:false}}) },
            { label:'🏙 City commuter',  fn:()=>onChange({...csp,BEHAVIOR:{...b,MAX_SPEED_KMH:70,AGGRESSION:0.25,LANE_DISCIPLINE:0.8,FOLLOWING_GAP:2.0}}) },
            { label:'🌙 Midnight runner',fn:()=>onChange({...csp,BEHAVIOR:{...b,MAX_SPEED_KMH:130,AGGRESSION:0.65,LANE_DISCIPLINE:0.45,FOLLOWING_GAP:1.5,OVERTAKING:true}}) },
            { label:'🚨 Tactical chaos', fn:()=>onChange({...csp,BEHAVIOR:{...b,MAX_SPEED_KMH:180,AGGRESSION:0.95,LANE_DISCIPLINE:0.1,FOLLOWING_GAP:0.8,RANDOM_STOP_CHANCE:0.005}}) },
          ].map(p => (
            <button key={p.label} onClick={p.fn} style={{ width:'100%', background:C.bg, border:`1px solid ${C.border}`,
              borderLeft:`2px solid ${C.border}`, borderRadius: 8, padding:'8px 12px', textAlign:'left', color:C.textPrimary, marginBottom:6,
              fontFamily:C.head, fontSize:14 }}
              onMouseEnter={e=>e.currentTarget.style.borderLeftColor=C.blue}
              onMouseLeave={e=>e.currentTarget.style.borderLeftColor=C.border}>
              {p.label}
            </button>
          ))}
        </Card>
      </div>
    </div>
  )
}

// ── File Preview ──────────────────────────────────────────────────────────────
function FilePreview({ profile, mapName }) {
  const [tab, setTab] = useState('ini')
  const ini  = generateTrafficConfigIni(profile, mapName)
  const json = generateSettingsJson(profile)
  const [copied, setCopied] = useState(false)
  const content = tab==='ini' ? ini : json

  const hl = (text) => text.split('\n').map((line,i) => {
    if (line.startsWith(';')) return <div key={i} style={{color:C.muted, fontStyle:'italic'}}>{line||'\u00A0'}</div>
    if (line.startsWith('[')) return <div key={i} style={{color:C.whiteHot, textTransform:'uppercase'}}>{line}</div>
    if (line.includes('=')) {
      const ei = line.indexOf('=')
      return <div key={i}><span style={{color:C.textSec}}>{line.slice(0,ei)}</span><span style={{color:C.muted}}>=</span><span style={{color:C.blue}}>{line.slice(ei+1)}</span></div>
    }
    return <div key={i} style={{color:C.mutedHi}}>{line||'\u00A0'}</div>
  })

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
        {['ini','json'].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{ padding:'4px 14px', border:`1px solid ${tab===t?C.blue:C.border}`, borderRadius: 8,
              background:tab===t?`${C.blue}18`:'transparent', color:tab===t?C.blue:C.muted,
              fontFamily:C.mono, fontSize:11, cursor:'pointer' }}>
            {t==='ini'?'traffic_config.ini':'settings.json'}
          </button>
        ))}
        <span style={{ marginLeft:'auto', fontSize:11, color:C.muted }}>
          {tab==='ini'?'→ data/traffic/traffic_config.ini':'→ data/traffic/settings.json'}
        </span>
        <Btn size="sm" variant={copied?'subtle':'primary'} onClick={()=>{navigator.clipboard.writeText(content);setCopied(true);setTimeout(()=>setCopied(false),2000)}}>
          {copied?'✓ Copied':'Copy'}
        </Btn>
      </div>
      <div style={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius: 8, padding:'12px 14px',
        fontFamily:C.mono, fontSize:11, lineHeight:1.85, maxHeight:520, overflowY:'auto' }}>
        {hl(content)}
      </div>
    </div>
  )
}

// ── Traffic Manager Root ──────────────────────────────────────────────────────
export default function TrafficView() {
  const { settings, trafficProfiles, saveTrafficProfiles, showToast } = useStore()
  const [profiles, setProfiles] = useState(trafficProfiles.length ? trafficProfiles : INITIAL_PROFILES)
  const [activeId, setActiveId] = useState('drift')
  const [tab, setTab]           = useState('behavior')
  const [mapFolder, setMapFolder] = useState('')
  const [saving, setSaving]     = useState(false)

  const active = profiles.find(p=>p.id===activeId) || profiles[0]

  const updateActive = useCallback((patch) => {
    setProfiles(prev => prev.map(p => p.id===activeId ? {...p,...patch} : p))
  }, [activeId])

  const cloneActive = () => {
    const id = `custom_${Date.now()}`
    const clone = { ...JSON.parse(JSON.stringify(active)), id, name:`${active.name} (copy)`, color:C.blue }
    setProfiles(prev=>[...prev, clone])
    setActiveId(id)
    showToast(`Cloned "${active.name}"`)
  }

  const newProfile = () => {
    const id = `new_${Date.now()}`
    setProfiles(prev=>[...prev, makeProfile(id,'New Profile')])
    setActiveId(id)
  }

  const deleteActive = () => {
    const builtins = ['rush','night','drift']
    if (builtins.includes(activeId)) { showToast('Cannot delete built-in profile', C.red); return }
    setProfiles(prev=>prev.filter(p=>p.id!==activeId))
    setActiveId('drift')
  }

  const persistProfiles = async () => {
    await saveTrafficProfiles(profiles)
  }

  useEffect(() => { persistProfiles() }, [profiles])

  const browseMaps = async () => {
    const def = settings.acPath ? `${settings.acPath}\\content\\tracks` : undefined
    const p = await api.dialog.openFolder({ title:'Select track folder', defaultPath:def })
    if (p) setMapFolder(p)
  }

  const saveToMap = async () => {
    if (!mapFolder) { showToast('Select a track folder first', C.orange); return }
    setSaving(true)
    const res = await api.traffic.saveConfig({
      trackFolder: mapFolder,
      iniContent:  generateTrafficConfigIni(active, mapFolder.split('\\').pop()),
      jsonContent: generateSettingsJson(active),
    })
    setSaving(false)
    if (res.ok) showToast(`✓ Saved to ${mapFolder.split('\\').pop()}\\data\\traffic\\`)
    else        showToast(`✕ ${res.error}`, C.red)
  }

  const loadFromMap = async () => {
    if (!mapFolder) { showToast('Select a track folder first', C.orange); return }
    const res = await api.traffic.loadExisting(mapFolder)
    if (!res.hasTrafficDir) { showToast('No data/traffic folder found in this track', C.orange); return }
    if (!res.hasIni || !res.iniContent) { showToast('No traffic config found — starting fresh', C.orange); return }
    const parsed = parseTrafficIni(res.iniContent)
    updateActive(parsed)
    showToast(`✓ Loaded existing traffic_config.ini (${parsed.roster.length} car${parsed.roster.length!==1?'s':''})`)
  }

  const mapName = mapFolder ? mapFolder.split('\\').pop() : 'no map selected'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'16px 24px 0', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div>
            <div style={{ fontFamily:C.head, fontSize:26, letterSpacing:1, lineHeight:1, textTransform:'uppercase' }}>
              <span style={{color:C.blue}}>Traffic</span> Manager
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:3, fontFamily:C.mono }}>{mapName}</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <Tag color={C.blue}>CSP AI Traffic</Tag>
            <Tag color={C.orange}>sol WeatherFX</Tag>
          </div>
        </div>

        {/* Map selector */}
        <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
          <TextInput value={mapFolder} onChange={setMapFolder} placeholder="Path to track folder  (e.g. …\tracks\shuto_revival_project_beta)" mono style={{flex:1}} />
          <Btn size="sm" variant="subtle" onClick={browseMaps}>Browse</Btn>
          <Tooltip text="Read the traffic_config.ini that shipped with this track" disabled={!mapFolder}>
            <Btn size="sm" variant="subtle" onClick={loadFromMap} disabled={!mapFolder}>Load existing</Btn>
          </Tooltip>
          <Tooltip text="Write traffic_config.ini and settings.json — originals backed up automatically" disabled={!mapFolder||saving}>
            <Btn size="sm" disabled={!mapFolder||saving} onClick={saveToMap}>
              {saving ? 'Saving…' : 'Save to map'}
            </Btn>
          </Tooltip>
        </div>

        {/* Profile strip */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
          {profiles.map(p=>(
            <button key={p.id} onClick={()=>setActiveId(p.id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 14px', borderRadius: 8,
                border:`1px solid ${C.border}`, borderLeft:`3px solid ${p.id===activeId?p.color:C.border}`,
                background:p.id===activeId?`${p.color}18`:C.surface,
                color:p.id===activeId?p.color:C.muted,
                fontFamily:C.head, fontSize:14, cursor:'pointer', transition:'all .15s' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:p.color }} />
              {p.name}
            </button>
          ))}
          <Btn size="sm" variant="subtle" onClick={newProfile}>+ New</Btn>
          <Tooltip text="Duplicate this profile so you can edit it without losing the original">
            <Btn size="sm" variant="subtle" onClick={cloneActive}>Clone</Btn>
          </Tooltip>
          {!['rush','night','drift'].includes(activeId) && (
            <Btn size="sm" variant="danger" onClick={deleteActive}>Delete</Btn>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            <Tag color={C.muted}>{active.csp.TRAFFIC.MAX_CARS} max cars</Tag>
            <Tag color={active.csp.BEHAVIOR.AGGRESSION>0.6?C.red:C.green}>
              {active.csp.BEHAVIOR.AGGRESSION>0.6?'aggressive':active.csp.BEHAVIOR.AGGRESSION>0.3?'normal':'polite'}
            </Tag>
          </div>
        </div>

        <TabBar tabs={[
          { id:'behavior', label:'Behaviour & Spawning' },
          { id:'roster',   label:'Car Roster', badge:active.roster.filter(c=>c.enabled).length },
          { id:'schedule', label:'Density Schedule' },
          { id:'preview',  label:'File Preview' },
        ]} active={tab} onChange={setTab} />
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflow:'auto', padding:'0 24px 24px' }}>
        {tab==='behavior' && (
          <BehaviorPanel csp={active.csp} onChange={csp=>updateActive({csp})} />
        )}
        {tab==='roster' && (
          <Card>
            <SectionHead children="Car spawn list" sub="Matches CSP [CAR_XX] sections — weight sets relative spawn probability" />
            <CarRoster acPath={settings.acPath} roster={active.roster} onChange={roster=>updateActive({roster})} />
          </Card>
        )}
        {tab==='schedule' && (
          <Card>
            <DensityCurve schedule={active.schedule} onChange={schedule=>updateActive({schedule})} />
            <div style={{ marginTop:20, display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:4 }}>
              {active.schedule.map((v,i)=>(
                <div key={i} style={{ background:C.bg, borderRadius: 8, padding:'5px 8px',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontFamily:C.mono, fontSize:10, color:i<6||i>=21?C.blue:(i>=7&&i<=9||i>=16&&i<=18)?C.red:C.muted }}>
                    {String(i).padStart(2,'0')}h
                  </span>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:28, height:3, borderRadius: 8, background:C.border, overflow:'hidden' }}>
                      <div style={{ width:`${v*100}%`, height:'100%', background:v>0.7?C.red:v>0.4?C.orange:C.green }} />
                    </div>
                    <span style={{ fontFamily:C.mono, fontSize:9, color:C.mutedHi }}>{Math.round(v*100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {tab==='preview' && (
          <Card>
            <FilePreview profile={active} mapName={mapName} />
          </Card>
        )}
      </div>
    </div>
  )
}
