import { useState } from 'react'
import axios from 'axios'
import { C, Card, SectionHead, Label, Btn, TextInput } from '../components/primitives'
import Tooltip from '../components/Tooltip'
import { useStore, DEFAULT_QUICK_PHRASES } from '../store/AppStore'

const api = window.api

const IDENTITY_COLORS = [C.yellow, C.blue, C.green, C.red, C.orange, '#8E44AD', C.white, C.mutedHi]

export default function SettingsView() {
  const { settings, saveSettings, identity, saveIdentity, backendUrl, saveBackendUrl,
    quickPhrases, saveQuickPhrases, acDetected, showToast } = useStore()
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
        <SectionHead children="Your identity" sub="Shown to friends in Events, Comms, and Stats — no login required" />
        <Label>Handle</Label>
        <div style={{ marginBottom: 16 }}>
          <TextInput value={identityLocal.handle} onChange={v => setIdentity('handle', v)} placeholder="e.g. shinobi" />
        </div>
        <Label>Color</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          {IDENTITY_COLORS.map(c => (
            <Tooltip key={c} text="Choose your crew color — shown next to your name in Events and Comms">
              <button onClick={() => setIdentity('color', c)}
                style={{ width: 24, height: 24, borderRadius: 0, background: c, cursor: 'pointer',
                  border: identityLocal.color === c ? `2px solid ${C.whiteHot}` : `2px solid transparent`,
                  boxShadow: identityLocal.color === c ? `0 0 0 2px ${c}` : 'none' }} />
            </Tooltip>
          ))}
        </div>
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
