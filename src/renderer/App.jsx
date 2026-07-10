import { useEffect, useState } from 'react'
import { AppStoreProvider, useStore } from './store/AppStore'
import { C, GLOBAL_CSS, StatusDot, Toast } from './components/primitives'
import { ErrorBoundary } from './components/ErrorBoundary'
import Tooltip, { TooltipProvider } from './components/Tooltip'
import Wizard from './components/Wizard'
import ServerWizard from './components/ServerWizard'
import { deployConfig, presetFromConfig } from './lib/deploy'
import api from './lib/api'
import DeployView  from './views/DeployView'
import BuildView   from './views/BuildView'
import GarageView  from './views/GarageView'
import TrafficView from './views/TrafficView'
import EventsView  from './views/EventsView'
import CommsView   from './views/CommsView'
import StatsView   from './views/StatsView'
import TelemetryView from './views/TelemetryView'
import ClusterView from './views/ClusterView'
import ReplayView  from './views/ReplayView'
import ModsView    from './views/ModsView'
import FpvView     from './views/FpvView'
import LinksView   from './views/LinksView'
import SettingsView from './views/SettingsView'
import AdminView   from './views/AdminView'
import OverlayApp  from './OverlayApp'
import ClusterOverlay from './ClusterOverlay'

// ── Sidebar nav ───────────────────────────────────────────────────────────────
// Signing in with Google is the security boundary for every feature except
// the ones explicitly tagged 'admin' — hosting a server, editing traffic,
// etc. don't need a special role, just a signed-in account. Only the Admin
// panel itself (crew/role management, system health) is actually
// admin-only. Tag new features 'admin' here when they need that split;
// everything else defaults to 'crew' (any signed-in user). See canAccess().
const NAV = [
  { id:'deploy',   icon:'🏁', label:'Live Servers',   role:'crew'  },
  { id:'build',    icon:'⚙️', label:'Build',           role:'crew'  },
  { id:'garage',   icon:'🚗', label:'Garage',          role:'crew'  },
  { id:'traffic',  icon:'🌆', label:'Traffic Manager', role:'crew'  },
  { id:'events',   icon:'📅', label:'Events',          role:'crew'  },
  { id:'comms',    icon:'🎙️', label:'Comms',           role:'crew'  },
  { id:'stats',    icon:'📊', label:'Stats',           role:'crew'  },
  { id:'telemetry',icon:'📡', label:'Telemetry',       role:'crew'  },
  { id:'cluster',  icon:'🎛️', label:'Cluster',         role:'crew'  },
  { id:'replays',  icon:'🎬', label:'Replays',         role:'crew'  },
  { id:'mods',     icon:'📦', label:'Mods',            role:'crew'  },
  { id:'fpv',      icon:'🚁', label:'FPV Drone',       role:'crew'  },
  { id:'links',    icon:'🔗', label:'Links',           role:'crew'  },
  { id:'settings', icon:'⚙',  label:'Settings',        role:'crew'  },
  { id:'admin',    icon:'🔐', label:'Admin',           role:'admin' },
]

function canAccess(requiredRole, userRole) {
  return requiredRole !== 'admin' || userRole === 'admin'
}

const ROLE_COLOR = { admin: C.red, host: C.blue, crew: C.muted }

function Sidebar({ view, onChange, liveCount, setupComplete, backendUrl, backendOnline, user, role }) {
  const visibleNav = NAV.filter(n => canAccess(n.role, role))
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

      {/* Current user + role badge */}
      {user && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:`1px solid ${C.border}` }}>
          {user.picture ? (
            <img src={user.picture} alt="" style={{ width:24, height:24, borderRadius:'50%', border:`2px solid ${C.blue}`, flexShrink:0 }} />
          ) : (
            <div style={{ width:24, height:24, borderRadius:'50%', border:`2px solid ${C.blue}`, background:C.raised, flexShrink:0 }} />
          )}
          <div style={{ minWidth:0, flex:1 }}>
            <div style={{ fontFamily:C.body, fontWeight:600, fontSize:12, color:C.textPrimary, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user.name}
            </div>
          </div>
          <span style={{ fontFamily:C.head, fontSize:10, letterSpacing:1, color:ROLE_COLOR[role] || C.muted,
            border:`1px solid ${ROLE_COLOR[role] || C.muted}`, padding:'1px 6px', flexShrink:0, textTransform:'uppercase' }}>
            {role}
          </span>
        </div>
      )}

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
      <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
        {visibleNav.map(n => {
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

// Shown instead of a view when the current `view` state somehow points at a
// route the signed-in role can't reach (nav filtering already prevents
// clicking into one — this is the defensive fallback for the other, rarer
// paths into `setView`, e.g. a deep link). Not an error state, just a clean gate.
function AccessRestricted() {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, textAlign:'center', padding:24 }}>
      <div style={{ fontFamily:C.head, fontSize:48, letterSpacing:1, color:C.red }}>ACCESS RESTRICTED</div>
      <div style={{ fontSize:14, color:C.textSec }}>This feature requires Host or Admin access.</div>
      <div style={{ fontSize:13, color:C.muted }}>Contact William to request elevated access.</div>
    </div>
  )
}

// ── Inner app (has store access) ──────────────────────────────────────────────
function Inner() {
  const { liveServers, settings, profiles, saveProfiles, addLiveServer, toast, backendUrl, backendOnline, hydrated, showToast,
    saveSettings, saveBackendUrl, saveQuickPhrases,
    user, role, isSignedIn, authLoading } = useStore()
  const [view, setView]   = useState('deploy')
  const [buildCfg, setBuildCfg] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [clusterPresetId, setClusterPresetId] = useState(null)

  const goToBuild = (cfg) => { setBuildCfg(cfg || null); setView('build') }

  // The wizard's Google sign-in itself now happens through AppStore's
  // accomp://oauth listener — finishSetup only ever needs to persist the
  // non-auth pieces (AC path, backend URL, quick phrases) once the wizard's
  // done. Identity (handle/color) lives on googleAuth and is saved via
  // saveIdentity from within the wizard's own Identity step instead.
  const finishSetup = async ({ settings: s, backendUrl: bUrl, quickPhrases }) => {
    await saveSettings(s)
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

  // accomp://cluster/{id} deep link — hand off to ClusterView, which does
  // the actual backend fetch (see main.js's handleAccompUrl).
  useEffect(() => {
    const unsub = window.api.cluster.onLoadPreset(({ presetId }) => {
      setClusterPresetId(presetId)
      setView('cluster')
    })
    return unsub
  }, [])

  // The Cluster Fucker: appFunctions main.js can't handle itself (it needs
  // renderer-side app state — settings/profiles/current view/WebRTC mic
  // state) arrive here as a single 'cluster:invoke' event. Functions that
  // only need *this* top-level state (server.launch, ac.openReplay,
  // ac.launchGame, the two overlay toggles) are handled directly; anything
  // that needs a specific view's own local state (ptt/mute/volume/quick-phrase/
  // lap marker) is re-broadcast as a window CustomEvent for that view to pick
  // up *if it happens to be mounted* — a disclosed limitation, not a bug,
  // documented in CLAUDE.md's Phase 11 notes (lifting WebRTC state out of
  // CommsView into a global store would be a much larger refactor).
  useEffect(() => {
    const unsub = window.api.cluster.onInvoke(async ({ fn, param }) => {
      switch (fn) {
        case 'server.launch': {
          const preset = profiles.find(p => p.id === param?.presetId)
          if (preset) await wizardDeploy(preset)
          else showToast(`No saved server preset with id "${param?.presetId}"`, C.red)
          break
        }
        case 'ac.openReplay':
          setView('replays')
          break
        case 'ac.launchGame': {
          const res = await window.api.ac.launch()
          if (!res.ok) showToast(`✕ ${res.error}`, C.red)
          break
        }
        case 'overlay.toggle': {
          const status = await window.api.telemetry.overlayStatus()
          if (status.open) await window.api.telemetry.closeOverlay()
          else await window.api.telemetry.openOverlay({})
          break
        }
        case 'cluster.toggle': {
          const status = await window.api.cluster.overlayStatus()
          if (status.open) { await window.api.cluster.closeOverlay(); break }
          const presetId = param?.presetId
          if (!presetId) { showToast('cluster.toggle needs a preset ID', C.red); break }
          const localPresets = (await window.api.store.get('clusterPresets')) || []
          const local = localPresets.find(p => p.layout.id === presetId || p.backendId === presetId)
          if (local) { await window.api.cluster.openOverlay({ layout: local.layout, alwaysOnTop: true, opacity: 1 }); break }
          try {
            const { data } = await api.get(`/api/cluster/presets/${presetId}`)
            if (data.ok) await window.api.cluster.openOverlay({ layout: data.data.layout, alwaysOnTop: true, opacity: 1 })
            else showToast(data.error, C.red)
          } catch (e) {
            showToast('Could not load that cluster preset', C.red)
          }
          break
        }
        default:
          window.dispatchEvent(new CustomEvent(`cluster:${fn}`, { detail: param }))
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles])

  const currentNavItem = NAV.find(n => n.id === view)
  const restricted = currentNavItem && !canAccess(currentNavItem.role, role)

  // Wizard shows on first launch (setupComplete: false) OR whenever there's
  // no valid Google sign-in — either condition alone is enough to gate the
  // whole app, per Phase 12.
  const showWizard = !settings.setupComplete || !isSignedIn

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {!hydrated || authLoading ? null : showWizard ? (
        <Wizard onComplete={finishSetup} />
      ) : (
        <div style={{ display:'flex', height:'100vh', overflow:'auto' }}>
          <Sidebar view={view} onChange={setView} liveCount={liveServers.length} setupComplete={settings.setupComplete}
            backendUrl={backendUrl} backendOnline={backendOnline} user={user} role={role} />

          {/* Main area */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'auto' }}>
            {/* Page header bar */}
            <div style={{ height:48, display:'flex', alignItems:'center', padding:'0 24px',
              borderBottom:`1px solid ${C.border}`, flexShrink:0,
              WebkitAppRegion:'drag', background:C.bg }}>
              <span style={{ fontFamily:C.head, fontSize:20, letterSpacing:2, textTransform:'uppercase',
                color:C.textPrimary, WebkitAppRegion:'no-drag' }}>
                {currentNavItem?.label}
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
                {restricted ? <AccessRestricted /> : <>
                  {view==='deploy'  && <DeployView onBuild={() => goToBuild()} onOpenWizard={() => setWizardOpen(true)} />}
                  {view==='build'   && <BuildView initialCfg={buildCfg} onDeployed={() => setView('deploy')} onOpenWizard={() => setWizardOpen(true)} />}
                  {view==='garage'  && <GarageView onLoad={cfg => goToBuild(cfg)} onDeploy={cfg => goToBuild(cfg)} />}
                  {view==='traffic' && <TrafficView />}
                  {view==='events'  && <EventsView />}
                  {view==='comms'   && <CommsView />}
                  {view==='stats'   && <StatsView />}
                  {view==='telemetry' && <TelemetryView />}
                  {view==='cluster' && <ClusterView initialPresetId={clusterPresetId} />}
                  {view==='replays' && <ReplayView onGoSettings={() => setView('settings')} showToast={showToast} />}
                  {view==='mods'    && <ModsView />}
                  {view==='fpv'     && <FpvView onGoMods={() => setView('mods')} />}
                  {view==='links'   && <LinksView />}
                  {view==='settings'&& <SettingsView />}
                  {view==='admin'   && <AdminView />}
                </>}
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
  // Same pattern for the Cluster Fucker's runtime overlay window.
  if (window.location.hash === '#cluster-overlay') return <ClusterOverlay />

  return (
    <AppStoreProvider>
      <TooltipProvider>
        <Inner />
      </TooltipProvider>
    </AppStoreProvider>
  )
}
