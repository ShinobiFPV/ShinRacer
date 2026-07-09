import { useState } from 'react'
import { AppStoreProvider, useStore } from './store/AppStore'
import { C, GLOBAL_CSS, StatusDot, Toast } from './components/primitives'
import { ErrorBoundary } from './components/ErrorBoundary'
import Tooltip, { TooltipProvider } from './components/Tooltip'
import Wizard from './components/Wizard'
import ServerWizard from './components/ServerWizard'
import { deployConfig, presetFromConfig } from './lib/deploy'
import DeployView  from './views/DeployView'
import BuildView   from './views/BuildView'
import GarageView  from './views/GarageView'
import TrafficView from './views/TrafficView'
import EventsView  from './views/EventsView'
import CommsView   from './views/CommsView'
import StatsView   from './views/StatsView'
import TelemetryView from './views/TelemetryView'
import ReplayView  from './views/ReplayView'
import ModsView    from './views/ModsView'
import LinksView   from './views/LinksView'
import SettingsView from './views/SettingsView'
import OverlayApp  from './OverlayApp'

// ── Sidebar nav ───────────────────────────────────────────────────────────────
const NAV = [
  { id:'deploy',  icon:'🏁', label:'Live Servers' },
  { id:'build',   icon:'⚙️', label:'Build' },
  { id:'garage',  icon:'🚗', label:'Garage' },
  { id:'traffic', icon:'🌆', label:'Traffic Manager' },
  { id:'events',  icon:'📅', label:'Events' },
  { id:'comms',   icon:'🎙️', label:'Comms' },
  { id:'stats',   icon:'📊', label:'Stats' },
  { id:'telemetry', icon:'📡', label:'Telemetry' },
  { id:'replays', icon:'🎬', label:'Replays' },
  { id:'mods',    icon:'📦', label:'Mods' },
  { id:'links',   icon:'🔗', label:'Links' },
  { id:'settings',icon:'⚙',  label:'Settings' },
]

function Sidebar({ view, onChange, liveCount, setupComplete, backendUrl, backendOnline }) {
  return (
    <div style={{ width:180, background:C.bg, borderRight:`1px solid ${C.border}`,
      display:'flex', flexDirection:'column', flexShrink:0, userSelect:'none' }}>

      {/* Wordmark — sits in the titlebar drag region */}
      <div style={{ height:48, position:'relative', display:'flex', flexDirection:'column', justifyContent:'center',
        padding:'0 16px', borderBottom:`1px solid ${C.border}`, borderLeft:`3px solid ${C.blue}`,
        WebkitAppRegion:'drag', flexShrink:0 }}>
        <span style={{ fontFamily:C.head, fontSize:22, letterSpacing:3, lineHeight:1, color:C.whiteHot }}>
          SHINRACER
        </span>
        <span style={{ fontFamily:C.body, fontWeight:400, fontSize:10, letterSpacing:2, textTransform:'uppercase', color:C.muted, marginTop:2 }}>
          ShinTech
        </span>
      </div>

      {/* Live indicator */}
      {liveCount > 0 && (
        <div style={{ background:C.bg, borderBottom:`1px solid ${C.border}`, borderLeft:`3px solid ${C.green}`,
          padding:'8px 14px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:4, height:4, borderRadius:'50%', background:C.green, boxShadow:`0 0 6px ${C.green}`, flexShrink:0 }} />
          <span style={{ fontFamily:C.head, fontSize:14, letterSpacing:2, color:C.green }}>
            {liveCount} LIVE
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex:1, padding:'8px 0' }}>
        {NAV.map(n => {
          const active = view === n.id
          const warn = n.id==='settings' && !setupComplete
          return (
            <button key={n.id} onClick={() => onChange(n.id)}
              style={{ width:'100%', position:'relative', display:'flex', alignItems:'center', gap:10,
                height:36, paddingLeft:20, paddingRight:12, background:'transparent', border:'none', cursor:'pointer',
                color: active ? C.blue : warn ? C.orange : C.muted,
                fontFamily:C.body, fontWeight:600, textTransform:'uppercase',
                fontSize:13, letterSpacing:1.5, textAlign:'left', transition:'color .1s' }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.color = warn ? C.orange : C.textSec; e.currentTarget.firstElementChild.style.background = C.borderHi } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.color = warn ? C.orange : C.muted; e.currentTarget.firstElementChild.style.background = 'transparent' } }}>
              <span style={{ position:'absolute', left:0, top:'50%', transform:'translateY(-50%)',
                width:2, height:14, background: active ? C.blue : 'transparent', transition:'background .1s' }} />
              <span style={{ fontSize:14, opacity:0.6 }}>{n.icon}</span>
              {n.label}
              {warn && <span style={{marginLeft:'auto',fontSize:9,color:C.orange}}>●</span>}
            </button>
          )
        })}
      </nav>

      <div style={{ padding:'10px 14px', borderTop:`1px solid ${C.border}`, fontSize:10, color:C.muted, lineHeight:1.6 }}>
        <span style={{ fontFamily:C.body, letterSpacing:1, textTransform:'uppercase' }}>ShinTech Electronics</span><br/>
        <span style={{ fontFamily:C.head, letterSpacing:1 }}>acServer v1.16.x compat</span>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
          <span style={{ width:4, height:4, borderRadius:0, background: backendOnline ? C.green : C.red, flexShrink:0,
            boxShadow: backendOnline ? `0 0 4px ${C.green}` : 'none',
            animation: backendOnline ? 'none' : 'pulse 1s infinite' }} />
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
  const { liveServers, settings, profiles, saveProfiles, addLiveServer, toast, backendUrl, backendOnline, hydrated, showToast,
    saveSettings, saveIdentity, saveBackendUrl, saveQuickPhrases } = useStore()
  const [view, setView]   = useState('deploy')
  const [buildCfg, setBuildCfg] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const goToBuild = (cfg) => { setBuildCfg(cfg || null); setView('build') }

  const finishSetup = async ({ settings: s, identity, backendUrl: bUrl, quickPhrases }) => {
    await saveSettings(s)
    await saveIdentity(identity)
    await saveBackendUrl(bUrl)
    await saveQuickPhrases(quickPhrases)
  }

  // Shared with BuildView's own deploy/save flow via lib/deploy.js — the
  // wizard never re-implements INI generation or process spawning.
  const wizardDeploy = async (cfg) => {
    const res = await deployConfig(cfg, settings)
    if (res.ok) {
      addLiveServer(res.server)
      showToast(`✓ ${cfg.name} is live on :${cfg.port}`)
      setView('deploy')
    } else {
      showToast(`✕ ${res.error}`, C.red)
    }
    return res
  }
  const wizardSave = async (cfg) => {
    await saveProfiles([...profiles, presetFromConfig(cfg)])
    showToast('✓ Saved to Garage')
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
              WebkitAppRegion:'drag', background:C.bg }}>
              <span style={{ fontFamily:C.head, fontSize:20, letterSpacing:2, textTransform:'uppercase',
                color:C.textPrimary, WebkitAppRegion:'no-drag' }}>
                {NAV.find(n=>n.id===view)?.label}
              </span>
              {view==='deploy' && (
                <span style={{ marginLeft:'auto', WebkitAppRegion:'no-drag' }}>
                  <Tooltip text="Open the server builder to configure and launch a new server" position="left">
                    <button onClick={() => goToBuild()}
                      style={{ background:C.blue, color:C.whiteHot, border:`1px solid ${C.blueDim}`, borderLeft:'2px solid #0088FF',
                        borderRadius: 0, padding:'6px 18px', fontFamily:C.body, fontWeight:700, textTransform:'uppercase',
                        letterSpacing:1.5, fontSize:12, cursor:'pointer' }}>
                      + New server
                    </button>
                  </Tooltip>
                </span>
              )}
            </div>

            {/* View */}
            <div style={{ flex:1, overflow:'auto' }}>
              <ErrorBoundary key={view}>
                {view==='deploy'  && <DeployView onBuild={() => goToBuild()} onOpenWizard={() => setWizardOpen(true)} />}
                {view==='build'   && <BuildView initialCfg={buildCfg} onDeployed={() => setView('deploy')} onOpenWizard={() => setWizardOpen(true)} />}
                {view==='garage'  && <GarageView onLoad={cfg => goToBuild(cfg)} onDeploy={cfg => goToBuild(cfg)} />}
                {view==='traffic' && <TrafficView />}
                {view==='events'  && <EventsView />}
                {view==='comms'   && <CommsView />}
                {view==='stats'   && <StatsView />}
                {view==='telemetry' && <TelemetryView />}
                {view==='replays' && <ReplayView onGoSettings={() => setView('settings')} showToast={showToast} />}
                {view==='mods'    && <ModsView />}
                {view==='links'   && <LinksView />}
                {view==='settings'&& <SettingsView />}
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}

      {wizardOpen && (
        <ServerWizard onClose={() => setWizardOpen(false)} onDeploy={wizardDeploy} onSave={wizardSave}
          onGoSettings={() => { setWizardOpen(false); setView('settings') }} />
      )}

      {toast && <Toast msg={toast.msg} color={toast.color} key={toast.key} onDone={()=>{}} />}
    </>
  )
}

export default function App() {
  // The overlay window loads this same bundle with a #overlay hash instead
  // of a fresh route — it renders standalone, with no Sidebar/store/wizard,
  // since it only needs the telemetry IPC bridge and electron-store directly.
  if (window.location.hash === '#overlay') return <OverlayApp />

  return (
    <AppStoreProvider>
      <TooltipProvider>
        <Inner />
      </TooltipProvider>
    </AppStoreProvider>
  )
}
