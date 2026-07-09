import api from './api'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function getPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
}

export async function enablePush(handle) {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Push notifications are not supported in this browser.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const { data: keyRes } = await api.get('/api/push/vapid-public-key')
  if (!keyRes.ok || !keyRes.data.publicKey) throw new Error('Push isn\'t configured on the backend yet.')

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey),
  })

  await api.post('/api/push/subscribe', { handle, subscription: subscription.toJSON() })
  return permission
}

export async function sendTestPush(handle) {
  await api.post('/api/push/test', { handle })
}
