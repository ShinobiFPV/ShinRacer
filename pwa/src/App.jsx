import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { C } from './lib/colors'
import BottomNav from './components/BottomNav'
import OnboardingPage from './views/OnboardingPage'
import EventsPage from './views/EventsPage'
import EventDetailPage from './views/EventDetailPage'
import CommsPage from './views/CommsPage'
import ModsPage from './views/ModsPage'
import StatsPage from './views/StatsPage'
import LinksPage from './views/LinksPage'
import SettingsPage from './views/SettingsPage'
import AuthCallbackPage from './views/AuthCallbackPage'
import ClusterPage from './views/ClusterPage'
import { isOnboarded } from './lib/auth'

// Routes that own the full screen — no bottom/side nav chrome around them.
const CHROMELESS = ['/onboarding', '/auth/callback']

export default function App() {
  const location = useLocation()
  const [onboarded, setOnboardedState] = useState(isOnboarded())

  // Onboarding sets 'shinracer_onboarded' then navigates away — recheck on
  // every route change so the gate lifts without a full page reload. Guests
  // complete onboarding with no identity at all, so this checks completion,
  // not identity presence.
  useEffect(() => { setOnboardedState(isOnboarded()) }, [location.pathname])

  if (!onboarded && !CHROMELESS.includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />
  }

  const chromeless = CHROMELESS.includes(location.pathname)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: chromeless ? 'column' : 'row' }}>
      {!chromeless && <BottomNav />}
      <main className={chromeless ? undefined : 'shr-main'} style={chromeless ? { flex: 1, minHeight: '100vh' } : undefined}>
        <Routes>
          <Route path="/" element={<Navigate to="/events" replace />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/comms" element={<CommsPage />} />
          <Route path="/mods" element={<ModsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/cluster" element={<ClusterPage />} />
          <Route path="/links" element={<LinksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<Navigate to="/events" replace />} />
        </Routes>
      </main>
    </div>
  )
}
