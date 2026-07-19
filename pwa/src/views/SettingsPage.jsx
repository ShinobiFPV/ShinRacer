import { useState } from 'react'
import { C } from '../lib/colors'
import { Btn, Card, Label, TextInput, PageTitle, SectionHead } from '../components/primitives'
import api, { DEFAULT_BACKEND_URL, getBackendUrl, setBackendUrl } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { getIdentity, clearIdentity } from '../lib/auth'
import { getPermission, enablePush, sendTestPush } from '../lib/push'

export default function SettingsPage() {
  const { user, isLoggedIn, login, logout } = useAuth()
  const identity = getIdentity()
  const [backendUrl, setBackendUrlInput] = useState(getBackendUrl() || DEFAULT_BACKEND_URL)
  const [testResult, setTestResult] = useState(null)
  const [permission, setPermission] = useState(getPermission())
  const [pushError, setPushError] = useState(null)
  const [pushBusy, setPushBusy] = useState(false)

  async function testConnection() {
    setBackendUrl(backendUrl)
    try {
      const { data } = await api.get('/api/health', { timeout: 5000 })
      setTestResult(data.ok ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    }
  }

  async function handleEnablePush() {
    if (!identity?.handle) { setPushError('Sign in first — notifications are tied to your identity.'); return }
    setPushBusy(true)
    setPushError(null)
    try {
      await enablePush(identity.handle)
      setPermission(getPermission())
    } catch (e) {
      setPushError(e.message)
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 32, padding: '0 16px' }}>
      <PageTitle style={{ padding: '16px 0 16px' }}>Settings</PageTitle>

      <SectionHead>Identity</SectionHead>
      <Card style={{ marginBottom: 24, textAlign: 'center' }}>
        {user?.picture ? (
          <img src={user.picture} alt="" style={{ width: 64, height: 64, margin: '0 auto 10px', border: `2px solid ${C.blue}` }} />
        ) : (
          <div style={{ width: 64, height: 64, margin: '0 auto 10px', borderRadius: '50%', background: identity?.color || C.border }} />
        )}
        <div style={{ fontFamily: C.head, fontSize: 18 }}>{user?.name || identity?.handle || 'Guest'}</div>
        {user?.email && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{user.email}</div>}
        {isLoggedIn ? (
          <Btn variant="outline" onClick={() => { logout(); clearIdentity() }} style={{ marginTop: 12 }}>Sign out</Btn>
        ) : (
          <Btn onClick={() => login('/settings')} style={{ marginTop: 12 }}>Sign in with Google</Btn>
        )}
      </Card>

      <SectionHead>Backend</SectionHead>
      <Card style={{ marginBottom: 24 }}>
        <Label>URL</Label>
        <TextInput value={backendUrl} onChange={setBackendUrlInput} style={{ marginBottom: 10 }} />
        <Btn full onClick={testConnection}>Test connection</Btn>
        {testResult === 'ok' && <div style={{ color: C.green, fontSize: 13, marginTop: 8 }}>Connected.</div>}
        {testResult === 'fail' && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>Couldn't reach it.</div>}
      </Card>

      <SectionHead>Notifications</SectionHead>
      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
          Status: <span style={{ color: permission === 'granted' ? C.green : C.textSec }}>{permission}</span>
        </div>
        {permission !== 'granted' ? (
          <Btn full onClick={handleEnablePush} disabled={pushBusy}>{pushBusy ? 'Enabling…' : 'Enable notifications'}</Btn>
        ) : (
          <Btn full variant="outline" onClick={() => sendTestPush(identity?.handle)}>Test notification</Btn>
        )}
        {pushError && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{pushError}</div>}
      </Card>

      <SectionHead>About</SectionHead>
      <Card>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>ShinRacer PWA — v1.0.0</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>Built by ShinTech Electronics</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Powered by Claude</div>
        <a href="https://github.com/ShinobiFPV/ShinRacer" target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: C.blue, fontSize: 13, marginBottom: 6 }}>GitHub repo →</a>
        <a href="https://github.com/ShinobiFPV/ShinRacer/blob/main/docs/FRIEND_SETUP.md" target="_blank" rel="noopener noreferrer" style={{ display: 'block', color: C.blue, fontSize: 13 }}>Friend setup guide →</a>
      </Card>
    </div>
  )
}
