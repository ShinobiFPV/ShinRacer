const webpush = require('web-push')
const { pushSubs } = require('../db')

// Configured once at require-time from env — same pattern as lib/drive.js's
// module-level service-account client. If the VAPID vars are missing (fresh
// install before `docs/PWA_SETUP.md`'s key-generation step), web-push simply
// throws on the first actual send rather than at require time, so a backend
// with no PWA configured yet still boots fine.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:shinobi@shintech.local',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )
}

function toWebPushSubscription(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
}

// Sends to one subscription row, deleting it if the push service reports it's
// gone (410 Gone / 404 Not Found — browser unsubscribed, uninstalled, etc.)
// rather than leaving a dead row that fails forever on every future send.
async function sendToSubscription(row, payload) {
  try {
    await webpush.sendNotification(toWebPushSubscription(row), JSON.stringify(payload))
  } catch (e) {
    if (e.statusCode === 410 || e.statusCode === 404) {
      pushSubs.delete(row.endpoint)
    } else {
      console.error(`Push send failed for ${row.handle || row.endpoint}:`, e.message)
    }
  }
}

async function sendToAll(payload) {
  await Promise.all(pushSubs.getAll().map(row => sendToSubscription(row, payload)))
}

async function sendToHandle(handle, payload) {
  await Promise.all(pushSubs.getByHandle(handle).map(row => sendToSubscription(row, payload)))
}

module.exports = { sendToAll, sendToHandle }
