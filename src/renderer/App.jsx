import { useState } from 'react'
import { AppStoreProvider, useStore } from './store/AppStore'
import { C, GLOBAL_CSS, StatusDot, Toast } from './components/primitives'
import { ErrorBoundary } from './components/ErrorBoundary'
import Wizard from './components/Wizard'
import DeployView  from './views/DeployView'
import BuildView   from './views/BuildView'
import GarageView  from './views/GarageView'
import TrafficView from './views/TrafficView'
import EventsView  from './views/EventsView'
import CommsView   from './views/CommsView'
import StatsView   from './views/StatsView'
import ReplayView  from './views/ReplayView'
import ModsView    from './views/ModsView'
import SettingsView from './views/SettingsView'

// ── Sidebar nav ───────────────────────────────────────────────────────────────
const NAV = [
  { id:'deploy',  icon:'🏁', label:'Live Servers' },
  { id:'build',   icon:'⚙️', label:'Build' },
  { id:'garage',  icon:'🚗', label:'Garage' },
  { id:'traffic', icon:'🌆', label:'Traffic Manager' },
  { id:'events',  icon:'📅', label:'Events' },
  { id:'comms',   icon:'🎙️', label:'Comms' },
  { id:'stats',   icon:'📊', label:'Stats' },
  { id:'replays', icon:'🎬', label:'Replays' },
  { id:'mods',    icon:'📦', label:'Mods' },
  { id:'settings',icon:'⚙',  label:'Settings' },
]

function Sidebar({ view, onChange, liveCount, setupComplete, backendUrl, backendOnline }) {
  return (
    <div style={{ width:196, background:C.surface, borderRight:`1px solid ${C.border}`,
      display:'flex', flexDirection:'column', flexShrink:0, userSelect:'none' }}>

      {/* Wordmark — sits in the titlebar drag region */}
      <div style={{ height:32, display:'flex', alignItems:'center', padding:'0 16px',
        borderBottom:`1px solid ${C.border}`, WebkitAppRegion:'drag', flexShrink:0 }}>
        <span style={{ fontFamily:C.head, fontWeight:700, fontSize:18, lineHeight:1 }}>
          <span style={{color:C.yellow}}>Shin</span>Racer
        </span>
      </div>

      {/* Live indicator */}
      {liveCount > 0 && (
        <div style={{ margin:'8px 10px 0', background:`${C.green}18`, border:`1px solid ${C.green}40`,
          borderRadius:5, padding:'5px 10px', display:'flex', alignItems:'center', gap:7 }}>
          <StatusDot online />
          <span style={{ fontSize:11, color:C.green, fontWeight:600 }}>
            {liveCount} server{liveCount!==1?'s':''} live
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex:1, padding:'8px 8px' }}>
        {NAV.map(n => {
          const active = view === n.id
          const warn = n.id==='settings' && !setupComplete
          return (
            <button key={n.id} onClick={() => onChange(n.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10,
                padding:'9px 12px', borderRadius:6, border:'none', cursor:'pointer',
                background: active ? `${C.yellow}18` : 'transparent',
                color: active ? C.yellow : warn ? C.orange : C.muted,
                fontFamily:C.head, fontWeight: active ? 700 : 500,
                fontSize:14, letterSpacing:0.2, textAlign:'left',
                transition:'background .12s, color .12s', marginBottom:2 }}>
              <span style={{fontSize:17}}>{n.icon}</span>
              {n.label}
              {warn && <span style={{marginLeft:'auto',fontSize:9,color:C.orange}}>●</span>}
            </button>
          )
        })}
      </nav>

      <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}`, fontSize:10, color:C.muted, lineHeight:1.6 }}>
        ShinTech Electronics<br/>
        acServer v1.16.x compat
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background: backendOnline ? C.green : C.red, flexShrink:0 }} />
          <span style={{ fontFamily:C.mono, fontSize:9, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {backendUrl}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Inner app (has store access) ──────────────────────────────────────────────
function Inner() {
  const { liveServers, settings, toast, backendUrl, backendOnline, hydrated, showToast,
    saveSettings, saveIdentity, saveBackendUrl, saveQuickPhrases } = useStore()
  const [view, setView]   = useState('deploy')
  const [buildCfg, setBuildCfg] = useState(null)

  const goToBuild = (cfg) => { setBuildCfg(cfg || null); setView('build') }

  const finishSetup = async ({ settings: s, identity, backendUrl: bUrl, quickPhrases }) => {
    await saveSettings(s)
    await saveIdentity(identity)
    await saveBackendUrl(bUrl)
    await saveQuickPhrases(quickPhrases)
  }

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {!hydrated ? null : !settings.setupComplete ? (
        <Wizard onComplete={finishSetup} />
      ) : (
        <div style={{ display:'flex', height:'100vh', overflow:'auto' }}>
          <Sidebar view={view} onChange={setView} liveCount={liveServers.length} setupComplete={settings.setupComplete}
            backendUrl={backendUrl} backendOnline={backendOnline} />

          {/* Main area */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'auto' }}>
            {/* Page header bar */}
            <div style={{ height:48, display:'flex', alignItems:'center', padding:'0 24px',
              borderBottom:`1px solid ${C.border}`, flexShrink:0,
              WebkitAppRegion:'drag', background:C.surface }}>
              <span style={{ fontFamily:C.head, fontWeight:700, fontSize:18, WebkitAppRegion:'no-drag' }}>
                {NAV.find(n=>n.id===view)?.label}
              </span>
              {view==='deploy' && (
                <button onClick={() => goToBuild()}
                  style={{ marginLeft:'auto', background:C.yellow, color:'#000', border:'none',
                    borderRadius:5, padding:'5px 16px', fontFamily:C.head, fontWeight:700,
                    fontSize:13, cursor:'pointer', WebkitAppRegion:'no-drag' }}>
                  + New server
                </button>
              )}
            </div>

            {/* View */}
            <div style={{ flex:1, overflow:'auto' }}>
              <ErrorBoundary key={view}>
                {view==='deploy'  && <DeployView onBuild={() => goToBuild()} />}
                {view==='build'   && <BuildView initialCfg={buildCfg} onDeployed={() => setView('deploy')} />}
                {view==='garage'  && <GarageView onLoad={cfg => goToBuild(cfg)} onDeploy={cfg => goToBuild(cfg)} />}
                {view==='traffic' && <TrafficView />}
                {view==='events'  && <EventsView />}
                {view==='comms'   && <CommsView />}
                {view==='stats'   && <StatsView />}
                {view==='replays' && <ReplayView onGoSettings={() => setView('settings')} showToast={showToast} />}
                {view==='mods'    && <ModsView />}
                {view==='settings'&& <SettingsView />}
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} key={toast.key} onDone={()=>{}} />}
    </>
  )
}

export default function App() {
  return (
    <AppStoreProvider>
      <Inner />
    </AppStoreProvider>
  )
}
