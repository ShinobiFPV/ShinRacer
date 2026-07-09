const fs = require('fs')
const path = require('path')

// Extracted into its own module rather than living in server.js as the spec's
// literal sketch suggested — server.js needs to require middleware/auth.js
// (to apply it to routes) and middleware/auth.js needs to read the current
// roles, so "roles.json loading lives in server.js" and "auth.js imports it
// from server.js" would be a circular require. This is the standard fix:
// a small shared module both sides depend on instead of depending on each
// other. Matches the existing lib/*.js pattern (drive.js, oauth.js, push.js).
const ROLES_PATH = path.join(__dirname, '..', 'config', 'roles.json')

let roles = { admins: [], hosts: [], crew: [] }

function loadRoles() {
  try {
    roles = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'))
  } catch (e) {
    console.warn('roles.json not found or invalid — all users are crew')
    roles = { admins: [], hosts: [], crew: [] }
  }
}

loadRoles()

// Watches the containing directory, not the file directly — editors that
// save via a temp-file-then-rename (vim, nano's default backup mode) replace
// the inode, and fs.watch on the old inode can silently stop firing after
// that. Filtering to the exact filename keeps this from reloading on
// unrelated config/ changes.
try {
  fs.watch(path.dirname(ROLES_PATH), (eventType, filename) => {
    if (filename === 'roles.json') loadRoles()
  })
} catch (e) {
  console.warn(`Could not watch ${ROLES_PATH} for changes: ${e.message}`)
}

// Shared by routes/auth.js's PATCH /roles-config and routes/admin.js's
// PATCH /users/:uid/role, so there's exactly one place that writes the file
// and reloads the in-memory copy afterward.
function saveRoles(next) {
  const shaped = { admins: next.admins || [], hosts: next.hosts || [], crew: [] }
  fs.writeFileSync(ROLES_PATH, JSON.stringify(shaped, null, 2))
  loadRoles() // fs.watch also picks this up, but there's no reason to wait a tick for it
  return shaped
}

module.exports = { getRoles: () => roles, reload: loadRoles, saveRoles }
