import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import httpApi from '../lib/api'
import { C, Card, SectionHead, Label, Btn, TextInput, Select, Toggle } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore, DEFAULT_QUICK_PHRASES } from '../store/AppStore'

const api = window.api

const IDENTITY_COLORS = [C.yellow, C.blue, C.green, C.red, C.orange, '#8E44AD', C.white, C.mutedHi]
const ROLE_COLOR = { admin: C.red, host: C.blue, crew: C.muted }
const HOST_PORT = 9600

function HostStatusSection({ settings, backendOnline, user }) {
  const [checks, setChecks] = useState({ acInstalled: null, acServerExe: null, portFree: null })
  const [hostRecord, setHostRecord] = useState(null) // null = not checked yet, false = 404/not registered
  const [registering, setRegistering] = useState(false)
  const [checking, setChecking] = useState(false)

  const runChecks = useCallback(async () => {
    setChecking(true)
    const acServerExe = settings.acServerExe ? await api.fs.exists(settings.acServerExe) : false
    const portFree = await api.net.checkPortAvailable(HOST_PORT)
    setChecks({ acInstalled: !!settings.acPath, acServerExe, portFree })
    try {
      const res = await httpApi.get(`/api/hosts/${user.uid}/status`)
      setHostRecord(res.data?.data || false)
    } catch (e) {
      setHostRecord(false)
    }
    setChecking(false)
  }, [settings.acPath, settings.acServerExe, user?.uid])

  useEffect(() => { if (user) runChecks() }, [user, runChecks])

  if (!user) return null

  const registered = !!hostRecord
  const ready = checks.acInstalled && checks.acServerExe && backendOnline && registered && checks.portFree

  const registerHost = async () => {
    setRegistering(true)
    try {
      const machineName = await api.system.hostname()
      await httpApi.post('/api/hosts/register', { machineName, acPath: settings.acPath || null })
      await runChecks()
    } catch (e) {
      // surfaced via the checklist re-run below (registered stays false)
    }
    setRegistering(false)
  }

  const Check = ({ label, ok }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
      <span style={{ width: 14, textAlign: 'center', color: ok ? C.green : C.red, fontFamily: C.head }}>{ok ? '✓' : '✕'}</span>
      <span style={{ fontSize: 13, color: C.textSec }}>{label}</span>
    </div>
  )

  return (
    <Card accent={ready ? C.green : C.borderHi}>
      <SectionHead children="Host status" sub="Readiness to run game servers for crew events" />
      <div style={{ marginBottom: 12 }}>
        <Check label="Assetto Corsa installed" ok={!!checks.acInstalled} />
        <Check label="acServer.exe found" ok={!!checks.acServerExe} />
        <Check label="Backend reachable" ok={!!backendOnline} />
        <Check label={`Port ${HOST_PORT} available`} ok={!!checks.portFree} />
        <Check label="Registered as available host" ok={registered} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
        <span style={{ fontFamily: C.head, fontSize: 16, letterSpacing: 1, color: ready ? C.green : C.orange }}>
          {ready ? 'READY TO HOST' : 'NOT READY'}
        </span>
        <Tooltip text="Re-run all readiness checks">
          <Btn size="sm" variant="ghost" onClick={runChecks} disabled={checking}>{checking ? 'Checking…' : 'Recheck'}</Btn>
        </Tooltip>
        <Tooltip text={registered ? 'Update this machine\'s host registration' : 'Register this machine as a host crew can select when proposing events'}>
          <Btn size="sm" onClick={registerHost} disabled={registering}>
            {registering ? 'Saving…' : registered ? 'Update host info' : 'Register as host'}
          </Btn>
        </Tooltip>
      </div>
    </Card>
  )
}

const GAME_OPTIONS = [
  { value: 'ac1', label: 'AC1' },
  { value: 'acc', label: 'ACC' },
  { value: 'acevo', label: 'AC Evo' },
  { value: 'acrally', label: 'AC Rally' },
  { value: 'fh5', label: 'FH5' },
  { value: 'fh6', label: 'FH6' },
  { value: 'f125', label: 'F1 25' },
  { value: 'ams2', label: 'AMS2' },
]
const GAME_LABELS = Object.fromEntries(GAME_OPTIONS.map(g => [g.value, g.label]))

function TelemetrySection() {
  const [autoDetect, setAutoDetect] = useState(true)
  const [manualGame, setManualGame] = useState('ac1')
  const [forzaPort, setForzaPort] = useState('5300')
  const [f125Port, setF125Port] = useState('20777')
  const [ams2Port, setAms2Port] = useState('5606')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // null | { ok, game? }

  useEffect(() => {
    api.store.get('telemetryAutoDetect').then(v => setAutoDetect(v ?? true))
    api.store.get('telemetryManualGame').then(v => setManualGame(v || 'ac1'))
    api.store.get('forzaTelemetryPort').then(v => setForzaPort(String(v || 5300)))
    api.store.get('f125TelemetryPort').then(v => setF125Port(String(v || 20777)))
    api.store.get('ams2TelemetryPort').then(v => setAms2Port(String(v || 5606)))
  }, [])

  const updateAutoDetect = (v) => { setAutoDetect(v); api.store.set('telemetryAutoDetect', v) }
  const updateManualGame = (v) => { setManualGame(v); api.store.set('telemetryManualGame', v) }
  const updateForzaPort = (v) => { setForzaPort(v); const n = Number(v); if (n > 0) api.telemetry.setForzaPort(n) }
  const updateF125Port = (v) => { setF125Port(v); const n = Number(v); if (n > 0) api.telemetry.setF125Port(n) }
  const updateAms2Port = (v) => { setAms2Port(v); const n = Number(v); if (n > 0) api.telemetry.setAMS2Port(n) }

  const testTelemetry = async () => {
    setTesting(true)
    setTestResult(null)
    await api.telemetry.shmStart()
    setTimeout(async () => {
      const game = await api.telemetry.getActiveGame()
      setTesting(false)
      setTestResult(game ? { ok: true, game } : { ok: false })
    }, 3000)
  }

  return (
    <Card accent={C.borderHi}>
      <SectionHead children="Telemetry" sub="Which game ShinRacer reads live telemetry from — Live Telemetry tab and The Cluster Fucker's gauge widgets" />

      <Tooltip text="Automatically figure out which supported game is currently running">
        <Toggle label="Auto-detect game" value={autoDetect} onChange={updateAutoDetect} />
      </Tooltip>

      {!autoDetect && (
        <div style={{ marginTop: 14 }}>
          <Label>Game</Label>
          <Select value={manualGame} onChange={updateManualGame} options={GAME_OPTIONS} style={{ width: 200 }} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Label>Forza Data Out port</Label>
        <div style={{ maxWidth: 200 }}>
          <TextInput mono value={forzaPort} onChange={updateForzaPort} placeholder="5300" />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          Set this port in Forza: Settings → HUD &amp; Gameplay → Data Out Port
        </div>
        <div style={{ fontSize: 11, color: C.orange, marginTop: 2 }}>
          ⚠️ Q2's race engineer uses port 8000 — use different ports if running both.
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Label>F1 25 UDP port</Label>
        <div style={{ maxWidth: 200 }}>
          <TextInput mono value={f125Port} onChange={updateF125Port} placeholder="20777" />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          Game Options → Settings → UDP Telemetry Settings → UDP Port
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          Set UDP Format to "2025" in-game
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Label>AMS2 UDP port</Label>
        <div style={{ maxWidth: 200 }}>
          <TextInput mono value={ams2Port} onChange={updateAms2Port} placeholder="5606" />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
          AMS2 broadcasts — just enable Shared Memory → Project CARS 2 in Options → System. No port configuration needed in-game.
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Tooltip text="Start telemetry and check whether a supported game is detected within 3 seconds">
          <Btn size="sm" variant="subtle" onClick={testTelemetry} disabled={testing}>{testing ? 'Testing…' : 'Test telemetry'}</Btn>
        </Tooltip>
        {testResult && (
          testResult.ok ? (
            <span style={{ fontSize: 12, color: C.green }}>✓ {GAME_LABELS[testResult.game] || testResult.game} detected</span>
          ) : (
            <span style={{ fontSize: 12, color: C.red }}>✗ No game detected</span>
          )
        )}
      </div>
    </Card>
  )
}

// ── Update section (Phase 16) — surfaced at the top of Settings since it's
// the most important status to show; the app version is always visible even
// before any updater:status event has arrived. ──────────────────────────────
function UpdateSection() {
  const [status, setStatus] = useState(null)
  const [version, setVersion] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    api.updater.getVersion().then(v => setVersion(v))
    const unsub = api.updater.onStatus(s => setStatus(s))
    return unsub
  }, [])

  const checkNow = async () => {
    setChecking(true)
    await api.updater.checkNow()
    setChecking(false)
  }

  return (
    <Card>
      <SectionHead children="ShinRacer" sub={`Version ${version || '...'}`} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: status?.releaseNotes ? 12 : 0 }}>
        <div style={{ flex: 1 }}>
          {!status && (
            <div style={{ fontSize: 12, color: C.muted }}>Checking for updates…</div>
          )}
          {status?.status === 'up-to-date' && (
            <div style={{ fontSize: 12, color: C.green, fontFamily: C.head, fontWeight: 700 }}>✓ UP TO DATE</div>
          )}
          {status?.status === 'available' && (
            <div style={{ fontSize: 12, color: C.blue }}>
              <span style={{ fontFamily: C.head, fontWeight: 700 }}>UPDATE AVAILABLE — {status.version}</span>
              <span style={{ color: C.muted, marginLeft: 8 }}>Downloading in background…</span>
            </div>
          )}
          {status?.status === 'downloaded' && (
            <div style={{ fontSize: 12, color: C.green }}>
              <span style={{ fontFamily: C.head, fontWeight: 700 }}>{status.version} READY TO INSTALL</span>
            </div>
          )}
          {status?.status === 'error' && (
            <div style={{ fontSize: 12, color: C.red }}>Update check failed: {status.error}</div>
          )}
        </div>

        {status?.status === 'downloaded' && (
          <Btn size="sm" onClick={() => api.updater.install()}>Restart &amp; Install</Btn>
        )}

        <Btn size="sm" variant="subtle" onClick={checkNow} disabled={checking}>{checking ? 'Checking…' : 'Check now'}</Btn>

        <Btn size="sm" variant="ghost" onClick={() => api.shell.openExternal('https://github.com/ShinobiFPV/ShinRacer/releases')}>Release notes</Btn>
      </div>

      {(status?.status === 'available' || status?.status === 'downloaded') && status?.releaseNotes && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: C.bg, border: `1px solid ${C.border}`,
          fontSize: 11, color: C.mutedHi, lineHeight: 1.7,
          maxHeight: 120, overflowY: 'auto', fontFamily: C.mono,
        }}>
          {typeof status.releaseNotes === 'string'
            ? status.releaseNotes.replace(/<[^>]+>/g, '')
            : JSON.stringify(status.releaseNotes)}
        </div>
      )}
    </Card>
  )
}

export default function SettingsView() {
  const { settings, saveSettings, identity, saveIdentity, backendUrl, saveBackendUrl,
    quickPhrases, saveQuickPhrases, acDetected, showToast,
    user, role, signOut, backendOnline } = useStore()
  const [local, setLocal] = useState({ ...settings })
  const [identityLocal, setIdentityLocal] = useState({ ...identity })
  const [backendUrlLocal, setBackendUrlLocal] = useState(backendUrl)
  const [quickPhrasesLocal, setQuickPhrasesLocal] = useState([...quickPhrases])
  const [scanning, setScanning]   = useState(false)
  const [dirty, setDirty]         = useState(false)
  const [testing, setTesting]     = useState(false)
  const [testResult, setTestResult] = useState(null) // { ok, uptime? , error? }

  const set = (k, v) => { setLocal(prev => ({ ...prev, [k]: v })); setDirty(true) }
  const setIdentity = (k, v) => { setIdentityLocal(prev => ({ ...prev, [k]: v })); setDirty(true) }
  const setQuickPhrase = (i, v) => {
    setQuickPhrasesLocal(prev => prev.map((p, idx) => (idx === i ? v : p)))
    setDirty(true)
  }
  const resetQuickPhrases = () => { setQuickPhrasesLocal([...DEFAULT_QUICK_PHRASES]); setDirty(true) }

  const browseAcPath = async () => {
    const p = await api.dialog.openFolder({ title: 'Select Assetto Corsa root folder' })
    if (p) { set('acPath', p); set('acServerExe', `${p}\\server\\acServer.exe`) }
  }

  const browseExe = async () => {
    const p = await api.dialog.openFile({ title: 'Select acServer.exe', filters: [{ name: 'Executable', extensions: ['exe'] }] })
    if (p) set('acServerExe', p)
  }

  const save = async () => {
    await saveSettings({ ...local, setupComplete: true })
    await saveIdentity(identityLocal)
    await saveBackendUrl(backendUrlLocal)
    await saveQuickPhrases(quickPhrasesLocal)
    setDirty(false)
    showToast('✓ Settings saved')
  }

  const revert = () => {
    setLocal({ ...settings })
    setIdentityLocal({ ...identity })
    setBackendUrlLocal(backendUrl)
    setQuickPhrasesLocal([...quickPhrases])
    setTestResult(null)
    setDirty(false)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await axios.get(`${backendUrlLocal}/api/health`, { timeout: 5000 })
      setTestResult(res.data?.ok ? { ok: true, uptime: res.data.uptime } : { ok: false, error: 'Unexpected response' })
    } catch (e) {
      setTestResult({ ok: false, error: e.message })
    }
    setTesting(false)
  }

  const openAcFolder = () => local.acPath && api.shell.openPath(local.acPath)
  const openServerFolder = () => local.acPath && api.shell.openPath(`${local.acPath}\\server`)

  return (
    <div style={{ padding: 28, maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <UpdateSection />

      <Card accent={ROLE_COLOR[role] || C.borderHi}>
        <SectionHead children="Profile" sub="Google identity — handle and color are your display preferences on top of it" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
          {user?.picture ? (
            <img src={user.picture} alt="" style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${C.blue}` }} />
          ) : (
            <div style={{ width: 64, height: 64, borderRadius: '50%', border: `2px solid ${C.blue}`, background: C.raised }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: C.head, fontSize: 20, letterSpacing: 0.5, color: C.textPrimary }}>{user?.name || 'Not signed in'}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{user?.email || '—'}</div>
          </div>
          {role && (
            <span style={{ fontFamily: C.head, fontSize: 12, letterSpacing: 1, color: ROLE_COLOR[role] || C.muted,
              border: `1px solid ${ROLE_COLOR[role] || C.muted}`, padding: '3px 10px', textTransform: 'uppercase' }}>
              {role}
            </span>
          )}
        </div>

        <Label>Handle</Label>
        <div style={{ marginBottom: 16 }}>
          <TextInput value={identityLocal.handle} onChange={v => setIdentity('handle', v)} placeholder="e.g. shinobi" />
        </div>
        <Label>Color</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {IDENTITY_COLORS.map(c => (
            <Tooltip key={c} text="Choose your crew color — shown next to your name in Events and Comms">
              <button onClick={() => setIdentity('color', c)}
                style={{ width: 24, height: 24, borderRadius: 0, background: c, cursor: 'pointer',
                  border: identityLocal.color === c ? `2px solid ${C.whiteHot}` : `2px solid transparent`,
                  boxShadow: identityLocal.color === c ? `0 0 0 2px ${c}` : 'none' }} />
            </Tooltip>
          ))}
        </div>

        <Tooltip text="Sign out of Google — you'll need to sign back in to use ShinRacer">
          <Btn variant="danger" size="sm" onClick={signOut}>Sign out</Btn>
        </Tooltip>
      </Card>

      <HostStatusSection settings={local} backendOnline={backendOnline} user={user} />

      {/* AC detection banner */}
      {acDetected?.found && (
        <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}60`, borderRadius: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <div style={{ fontFamily: C.head, fontSize: 16, letterSpacing: 0.5, color: C.green }}>Assetto Corsa detected</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{acDetected.path}</div>
          </div>
        </div>
      )}
      {acDetected && !acDetected.found && (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 0, padding: '12px 16px' }}>
          <div style={{ fontFamily: C.head, fontSize: 16, letterSpacing: 0.5, color: C.orange }}>AC not auto-detected — set path manually below</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Checked default Steam library paths</div>
        </div>
      )}

      <Card accent={C.borderHi}>
        <SectionHead children="Assetto Corsa paths" sub="Required for launching servers and scanning tracks" />

        <Label>AC root folder</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TextInput value={local.acPath} onChange={v => set('acPath', v)} placeholder="C:\Program Files (x86)\Steam\steamapps\common\assettocorsa" mono />
          <Tooltip text="Find your Assetto Corsa installation folder">
            <Btn size="sm" variant="subtle" onClick={browseAcPath}>Browse</Btn>
          </Tooltip>
          {local.acPath && (
            <Tooltip text="Open this folder in Windows Explorer">
              <Btn size="sm" variant="subtle" onClick={openAcFolder}>Open</Btn>
            </Tooltip>
          )}
        </div>

        <Label>acServer.exe path</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TextInput value={local.acServerExe} onChange={v => set('acServerExe', v)} placeholder="…\assettocorsa\server\acServer.exe" mono />
          <Tooltip text="Locate acServer.exe — needed to host servers">
            <Btn size="sm" variant="subtle" onClick={browseExe}>Browse</Btn>
          </Tooltip>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {local.acPath && (
            <Tooltip text="Open the AC server directory in Windows Explorer">
              <Btn size="sm" variant="subtle" onClick={openServerFolder}>Open server folder</Btn>
            </Tooltip>
          )}
        </div>
      </Card>

      <TelemetrySection />

      <Card accent={C.borderHi}>
        <SectionHead children="Server defaults" sub="Used as starting values when creating a new server config" />

        <Label>Default server name</Label>
        <div style={{ marginBottom: 16 }}>
          <TextInput value={local.serverName} onChange={v => set('serverName', v)} placeholder="ShinTech AC Server" />
        </div>

        <Label>Default admin password</Label>
        <div style={{ marginBottom: 4 }}>
          <TextInput value={local.adminPassword} onChange={v => set('adminPassword', v)} placeholder="admin" />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 16 }}>Used for /admin command in-game</div>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Backend connection" sub="Events, chat, comms signaling, and lap stats all go through this server" />
        <Label>Backend URL</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <TextInput value={backendUrlLocal} onChange={v => { setBackendUrlLocal(v); setDirty(true); setTestResult(null) }}
            placeholder="http://192.168.1.203:3000" mono style={{ flex: 1 }} />
          <Tooltip text="Check if the ShinRacer backend on shinobi is reachable" disabled={testing}>
            <Btn size="sm" variant="subtle" onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Btn>
          </Tooltip>
        </div>
        {testResult && (
          testResult.ok ? (
            <div style={{ fontSize: 12, color: C.green, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: C.head, fontSize: 14, letterSpacing: 1 }}>REACHABLE</span>
              <span style={{ color: C.muted }}>uptime {Math.floor(testResult.uptime)}s</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.red, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: C.head, fontSize: 14, letterSpacing: 1 }}>UNREACHABLE</span>
              <span style={{ color: C.muted }}>{testResult.error}</span>
            </div>
          )
        )}
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Quick-phrase buttons" sub="Shown in the Comms text chat panel" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {quickPhrasesLocal.map((p, i) => (
            <Tooltip key={i} text="Edit the one-tap phrases shown in the Comms chat panel">
              <TextInput value={p} onChange={v => setQuickPhrase(i, v)} />
            </Tooltip>
          ))}
        </div>
        <Tooltip text="Restore the original quick phrases">
          <Btn size="sm" variant="subtle" onClick={resetQuickPhrases}>Reset to defaults</Btn>
        </Tooltip>
      </Card>

      <Card accent={C.borderHi}>
        <SectionHead children="Diagnostics" sub="Main-process logs — app start, server lifecycle, UDP lap events" />
        <Tooltip text="View ShinRacer application logs for troubleshooting">
          <Btn size="sm" variant="subtle" onClick={() => api.logs.openFolder()}>Open log folder</Btn>
        </Tooltip>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn variant="ghost" onClick={revert} disabled={!dirty}>Revert</Btn>
        <Btn onClick={save} disabled={!dirty}>Save settings</Btn>
      </div>
    </div>
  )
}
