import { useState } from 'react'
import axios from 'axios'
import { C, Card, SectionHead, Label, Btn, TextInput } from '../components/primitives'
import { useStore, DEFAULT_QUICK_PHRASES } from '../store/AppStore'

const api = window.api

const IDENTITY_COLORS = [C.yellow, C.blue, C.green, C.red, C.orange, C.purple, C.white, C.mutedHi]

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
        <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}60`, borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <div style={{ fontFamily: C.head, fontWeight: 700, color: C.green }}>Assetto Corsa detected</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>{acDetected.path}</div>
          </div>
        </div>
      )}
      {acDetected && !acDetected.found && (
        <div style={{ background: `${C.orange}18`, border: `1px solid ${C.orange}60`, borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontFamily: C.head, fontWeight: 700, color: C.orange }}>AC not auto-detected — set path manually below</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Checked default Steam library paths</div>
        </div>
      )}

      <Card>
        <SectionHead children="Assetto Corsa paths" sub="Required for launching servers and scanning tracks" />

        <Label>AC root folder</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TextInput value={local.acPath} onChange={v => set('acPath', v)} placeholder="C:\Program Files (x86)\Steam\steamapps\common\assettocorsa" mono />
          <Btn size="sm" variant="subtle" onClick={browseAcPath}>Browse</Btn>
          {local.acPath && <Btn size="sm" variant="subtle" onClick={openAcFolder}>Open</Btn>}
        </div>

        <Label>acServer.exe path</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <TextInput value={local.acServerExe} onChange={v => set('acServerExe', v)} placeholder="…\assettocorsa\server\acServer.exe" mono />
          <Btn size="sm" variant="subtle" onClick={browseExe}>Browse</Btn>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {local.acPath && <Btn size="sm" variant="subtle" onClick={openServerFolder}>Open server folder</Btn>}
        </div>
      </Card>

      <Card>
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

      <Card>
        <SectionHead children="Your identity" sub="Shown to friends in Events, Comms, and Stats — no login required" />
        <Label>Handle</Label>
        <div style={{ marginBottom: 16 }}>
          <TextInput value={identityLocal.handle} onChange={v => setIdentity('handle', v)} placeholder="e.g. shinobi" />
        </div>
        <Label>Color</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          {IDENTITY_COLORS.map(c => (
            <button key={c} onClick={() => setIdentity('color', c)}
              style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
                border: identityLocal.color === c ? `2px solid ${C.white}` : `2px solid transparent`,
                boxShadow: identityLocal.color === c ? `0 0 0 2px ${c}` : 'none' }} />
          ))}
        </div>
      </Card>

      <Card>
        <SectionHead children="Backend connection" sub="Events, chat, comms signaling, and lap stats all go through this server" />
        <Label>Backend URL</Label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <TextInput value={backendUrlLocal} onChange={v => { setBackendUrlLocal(v); setDirty(true); setTestResult(null) }}
            placeholder="http://192.168.1.203:3000" mono style={{ flex: 1 }} />
          <Btn size="sm" variant="subtle" onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Btn>
        </div>
        {testResult && (
          testResult.ok ? (
            <div style={{ fontSize: 12, color: C.green }}>✓ Reachable — uptime {Math.floor(testResult.uptime)}s</div>
          ) : (
            <div style={{ fontSize: 12, color: C.red }}>✕ {testResult.error || 'Unreachable'}</div>
          )
        )}
      </Card>

      <Card>
        <SectionHead children="Quick-phrase buttons" sub="Shown in the Comms text chat panel" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {quickPhrasesLocal.map((p, i) => (
            <TextInput key={i} value={p} onChange={v => setQuickPhrase(i, v)} />
          ))}
        </div>
        <Btn size="sm" variant="subtle" onClick={resetQuickPhrases}>Reset to defaults</Btn>
      </Card>

      <Card>
        <SectionHead children="Diagnostics" sub="Main-process logs — app start, server lifecycle, UDP lap events" />
        <Btn size="sm" variant="subtle" onClick={() => api.logs.openFolder()}>Open log folder</Btn>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn variant="ghost" onClick={revert} disabled={!dirty}>Revert</Btn>
        <Btn onClick={save} disabled={!dirty}>Save settings</Btn>
      </div>
    </div>
  )
}
