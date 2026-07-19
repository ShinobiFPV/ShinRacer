const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'ac_companion.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT, type TEXT, date TEXT, time TEXT,
      track TEXT, car_restriction TEXT, notes TEXT,
      poster_path TEXT, proposed_by TEXT,
      status TEXT DEFAULT 'proposed',
      created_at TEXT,
      required_mods TEXT
    );

    CREATE TABLE IF NOT EXISTS event_acceptances (
      event_id TEXT, handle TEXT, accepted_at TEXT,
      PRIMARY KEY (event_id, handle)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, track TEXT, date TEXT,
      server_name TEXT, participants TEXT
    );

    CREATE TABLE IF NOT EXISTS laps (
      id TEXT PRIMARY KEY, session_id TEXT, handle TEXT,
      track TEXT, car TEXT, lap_time_ms INTEGER,
      s1_ms INTEGER, s2_ms INTEGER, s3_ms INTEGER,
      lap_number INTEGER, ts TEXT, valid INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, handle TEXT, color TEXT, text TEXT, ts TEXT
    );

    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      server_name TEXT, host TEXT, port INTEGER,
      password TEXT, track TEXT, cars TEXT,
      created_by TEXT, created_at TEXT, expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mod_installs (
      file_id TEXT, handle TEXT,
      installed_at TEXT, version_date TEXT,
      PRIMARY KEY (file_id, handle)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      handle TEXT,
      endpoint TEXT UNIQUE,
      p256dh TEXT,
      auth TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cluster_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      author TEXT NOT NULL,
      layout_json TEXT NOT NULL,
      is_public INTEGER DEFAULT 0,
      launch_count INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT, name TEXT, picture TEXT,
      role TEXT, last_seen TEXT, first_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS hosts (
      uid TEXT PRIMARY KEY,
      name TEXT,
      machine_name TEXT,
      last_seen TEXT,
      is_online INTEGER DEFAULT 0,
      ac_path TEXT,
      can_host INTEGER DEFAULT 1
    );
  `)
} catch (e) {
  console.error('Failed to initialize database schema:', e)
  throw e
}

// Migration: sessions.created_at (added in Phase 3 for "{track} — HH:MM" display names).
// ALTER TABLE has no IF NOT EXISTS guard in SQLite, so probe-and-ignore.
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN created_at TEXT`)
} catch (e) { /* column already exists */ }

// Migration: events.host_type/host_uid/host_name (Phase 12 — event proposal
// host selector). Each ALTER is its own try/catch since a partial failure
// (e.g. host_type already added from a previous run) shouldn't block the
// remaining columns from being added.
try { db.exec(`ALTER TABLE events ADD COLUMN host_type TEXT DEFAULT 'designated'`) } catch (e) { /* column already exists */ }
try { db.exec(`ALTER TABLE events ADD COLUMN host_uid TEXT`) } catch (e) { /* column already exists */ }
try { db.exec(`ALTER TABLE events ADD COLUMN host_name TEXT`) } catch (e) { /* column already exists */ }

// Migration: invites.http_port — a join link into Content Manager needs AC's
// HTTP API port specifically (the game TCP/UDP `port` alone isn't enough).
try { db.exec(`ALTER TABLE invites ADD COLUMN http_port INTEGER`) } catch (e) { /* column already exists */ }

// ── Events ────────────────────────────────────────────────────────────────────
const events = {
  list() {
    const rows = db.prepare(`SELECT * FROM events ORDER BY date, time`).all()
    const acceptanceRows = db.prepare(`SELECT event_id, handle FROM event_acceptances`).all()
    return rows.map(row => ({
      ...row,
      required_mods: row.required_mods ? JSON.parse(row.required_mods) : [],
      acceptances: acceptanceRows.filter(a => a.event_id === row.id).map(a => a.handle),
    }))
  },
  get(id) {
    const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id)
    if (!row) return null
    const acceptanceRows = db.prepare(`SELECT handle FROM event_acceptances WHERE event_id = ?`).all(id)
    return { ...row, required_mods: row.required_mods ? JSON.parse(row.required_mods) : [], acceptances: acceptanceRows.map(a => a.handle) }
  },
  create(event) {
    db.prepare(`INSERT INTO events
      (id, name, type, date, time, track, car_restriction, notes, poster_path, proposed_by, status, created_at, required_mods, host_type, host_uid, host_name)
      VALUES (@id, @name, @type, @date, @time, @track, @car_restriction, @notes, @poster_path, @proposed_by, @status, @created_at, @required_mods, @host_type, @host_uid, @host_name)`
    ).run(event)
    return events.get(event.id)
  },
  // Updates every field except id/proposed_by/created_at. If date/track/time changed,
  // the event may no longer be valid for people who already accepted — reset to
  // 'proposed' and clear acceptances so everyone re-confirms.
  update(id, patch) {
    const existing = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id)
    if (!existing) return null
    const changed = ['date', 'track', 'time'].some(k => patch[k] !== undefined && patch[k] !== existing[k])
    const merged = { ...existing, ...patch, id, status: changed ? 'proposed' : existing.status }
    db.prepare(`UPDATE events SET
      name=@name, type=@type, date=@date, time=@time, track=@track,
      car_restriction=@car_restriction, notes=@notes, poster_path=@poster_path,
      status=@status, required_mods=@required_mods,
      host_type=@host_type, host_uid=@host_uid, host_name=@host_name
      WHERE id=@id`).run(merged)
    if (changed) db.prepare(`DELETE FROM event_acceptances WHERE event_id = ?`).run(id)
    return events.get(id)
  },
  accept(id, handle) {
    db.prepare(`INSERT OR REPLACE INTO event_acceptances (event_id, handle, accepted_at) VALUES (?, ?, ?)`)
      .run(id, handle, new Date().toISOString())
    const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id)
    if (!row) return null
    const acceptedHandles = db.prepare(`SELECT handle FROM event_acceptances WHERE event_id = ?`).all(id).map(a => a.handle)
    const otherAcceptors = acceptedHandles.filter(h => h !== row.proposed_by)
    if (row.status === 'proposed' && otherAcceptors.length >= 1) {
      db.prepare(`UPDATE events SET status = 'happening' WHERE id = ?`).run(id)
    }
    return events.get(id)
  },
  cancel(id) {
    db.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?`).run(id)
    return events.get(id)
  },
  deleteOne(id) {
    db.prepare(`DELETE FROM event_acceptances WHERE event_id = ?`).run(id)
    db.prepare(`DELETE FROM events WHERE id = ?`).run(id)
  },
  deleteAll() {
    db.prepare(`DELETE FROM event_acceptances`).run()
    db.prepare(`DELETE FROM events`).run()
  },
}

// ── Stats ─────────────────────────────────────────────────────────────────────
const stats = {
  upsertSession(session) {
    const existing = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(session.id)
    if (existing) {
      const participants = new Set([...JSON.parse(existing.participants || '[]'), session.handle].filter(Boolean))
      db.prepare(`UPDATE sessions SET participants = ? WHERE id = ?`)
        .run(JSON.stringify([...participants]), session.id)
    } else {
      db.prepare(`INSERT INTO sessions (id, track, date, server_name, participants, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(session.id, session.track, session.date, session.server_name || null,
          JSON.stringify(session.handle ? [session.handle] : []), new Date().toISOString())
    }
  },
  addLap(lap) {
    db.prepare(`INSERT INTO laps
      (id, session_id, handle, track, car, lap_time_ms, s1_ms, s2_ms, s3_ms, lap_number, ts, valid)
      VALUES (@id, @session_id, @handle, @track, @car, @lap_time_ms, @s1_ms, @s2_ms, @s3_ms, @lap_number, @ts, @valid)`
    ).run(lap)
    return db.prepare(`SELECT * FROM laps WHERE id = ?`).get(lap.id)
  },
  listSessions(track) {
    let sql = `SELECT * FROM sessions`
    const params = []
    if (track) { sql += ` WHERE track = ?`; params.push(track) }
    sql += ` ORDER BY date DESC`
    return db.prepare(sql).all(...params).map(s => ({ ...s, participants: JSON.parse(s.participants || '[]') }))
  },
  listLaps({ handle, track, sessionId } = {}) {
    let sql = `SELECT * FROM laps WHERE 1=1`
    const params = []
    if (handle)    { sql += ` AND handle = ?`; params.push(handle) }
    if (track)     { sql += ` AND track = ?`; params.push(track) }
    if (sessionId) { sql += ` AND session_id = ?`; params.push(sessionId) }
    sql += ` ORDER BY lap_time_ms ASC`
    return db.prepare(sql).all(...params)
  },
  // handle: single handle filter (used by the Personal Bests table, keeps car granularity).
  // track: optional additional filter, usable with or without `handle`.
  personalBests(handle, track) {
    const conditions = ['valid = 1']
    const params = []
    if (handle) { conditions.push('handle = ?'); params.push(handle) }
    if (track)  { conditions.push('track = ?'); params.push(track) }
    const sql = `SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY track, car ORDER BY lap_time_ms ASC) as rn
      FROM laps WHERE ${conditions.join(' AND ')}
    ) WHERE rn = 1 ORDER BY track`
    return db.prepare(sql).all(...params)
  },
  // Per-handle-per-track best (car-agnostic) — used by the friends comparison view.
  leaderboardByTrack() {
    return db.prepare(`SELECT track, handle, MIN(lap_time_ms) as best_ms FROM laps
      WHERE valid = 1 GROUP BY track, handle ORDER BY track, best_ms ASC`).all()
  },
}

// ── Chat ──────────────────────────────────────────────────────────────────────
const chat = {
  addMessage(msg) {
    db.prepare(`INSERT INTO messages (id, handle, color, text, ts) VALUES (@id, @handle, @color, @text, @ts)`).run(msg)
    return msg
  },
  history(limit = 100) {
    return db.prepare(`SELECT * FROM messages ORDER BY ts DESC LIMIT ?`).all(limit).reverse()
  },
}

// ── Invites ───────────────────────────────────────────────────────────────────
const invites = {
  create(invite) {
    db.prepare(`INSERT INTO invites
      (code, server_name, host, port, http_port, password, track, cars, created_by, created_at, expires_at)
      VALUES (@code, @server_name, @host, @port, @http_port, @password, @track, @cars, @created_by, @created_at, @expires_at)`
    ).run(invite)
    return invites.get(invite.code)
  },
  // Expired rows are treated as not-found rather than deleted here — cleanup() (run
  // on server startup) is what actually prunes them, so a lookup stays a pure read.
  get(code) {
    const row = db.prepare(`SELECT * FROM invites WHERE code = ?`).get(code)
    if (!row) return null
    if (new Date(row.expires_at).getTime() < Date.now()) return null
    return { ...row, cars: row.cars ? JSON.parse(row.cars) : [] }
  },
  delete(code) {
    db.prepare(`DELETE FROM invites WHERE code = ?`).run(code)
  },
  cleanup() {
    db.prepare(`DELETE FROM invites WHERE expires_at < ?`).run(new Date().toISOString())
  },
}

// ── Mod installs ──────────────────────────────────────────────────────────────
const modInstalls = {
  list(handle) {
    return db.prepare(`SELECT * FROM mod_installs WHERE handle = ?`).all(handle)
  },
  upsert({ fileId, handle, installedAt, versionDate }) {
    db.prepare(`INSERT OR REPLACE INTO mod_installs (file_id, handle, installed_at, version_date) VALUES (?, ?, ?, ?)`)
      .run(fileId, handle, installedAt, versionDate)
  },
}

// ── Push subscriptions (PWA Web Push) ────────────────────────────────────────
const pushSubs = {
  // `endpoint` is UNIQUE, so re-subscribing the same browser (e.g. after a
  // service worker update rotates nothing but the caller retries) replaces
  // the row instead of accumulating duplicates.
  save({ id, handle, endpoint, p256dh, auth, created_at }) {
    db.prepare(`INSERT INTO push_subscriptions (id, handle, endpoint, p256dh, auth, created_at)
      VALUES (@id, @handle, @endpoint, @p256dh, @auth, @created_at)
      ON CONFLICT(endpoint) DO UPDATE SET handle=@handle, p256dh=@p256dh, auth=@auth`
    ).run({ id, handle, endpoint, p256dh, auth, created_at })
  },
  getAll() {
    return db.prepare(`SELECT * FROM push_subscriptions`).all()
  },
  getByHandle(handle) {
    return db.prepare(`SELECT * FROM push_subscriptions WHERE handle = ?`).all(handle)
  },
  delete(endpoint) {
    db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint)
  },
}

// ── The Cluster Fucker: preset storage ───────────────────────────────────────
function parseClusterRow(row) {
  if (!row) return null
  return { ...row, is_public: !!row.is_public }
}
const cluster = {
  // List view intentionally omits layout_json (can be large with embedded
  // base64 images) — callers get widgetCount instead, parsed here once
  // rather than shipping the full JSON blob to every list request.
  list(author) {
    const rows = db.prepare(`SELECT * FROM cluster_presets WHERE author = ? ORDER BY updated_at DESC`).all(author)
    return rows.map(row => {
      let widgetCount = 0
      try { widgetCount = (JSON.parse(row.layout_json).widgets || []).length } catch (e) { /* malformed row — report 0 */ }
      const { layout_json, ...rest } = parseClusterRow(row)
      return { ...rest, widgetCount }
    })
  },
  listPublic() {
    const rows = db.prepare(`SELECT * FROM cluster_presets WHERE is_public = 1 ORDER BY launch_count DESC`).all()
    return rows.map(row => {
      let widgetCount = 0
      try { widgetCount = (JSON.parse(row.layout_json).widgets || []).length } catch (e) { /* malformed row — report 0 */ }
      const { layout_json, ...rest } = parseClusterRow(row)
      return { ...rest, widgetCount }
    })
  },
  get(id) {
    return parseClusterRow(db.prepare(`SELECT * FROM cluster_presets WHERE id = ?`).get(id))
  },
  create(preset) {
    db.prepare(`INSERT INTO cluster_presets
      (id, name, description, author, layout_json, is_public, launch_count, created_at, updated_at)
      VALUES (@id, @name, @description, @author, @layout_json, @is_public, 0, @created_at, @updated_at)`
    ).run(preset)
    return cluster.get(preset.id)
  },
  update(id, patch) {
    const existing = db.prepare(`SELECT * FROM cluster_presets WHERE id = ?`).get(id)
    if (!existing) return null
    const merged = { ...existing, ...patch, id }
    db.prepare(`UPDATE cluster_presets SET
      name=@name, description=@description, layout_json=@layout_json,
      is_public=@is_public, updated_at=@updated_at
      WHERE id=@id`).run(merged)
    return cluster.get(id)
  },
  delete(id) {
    db.prepare(`DELETE FROM cluster_presets WHERE id = ?`).run(id)
  },
  countPublic(author) {
    return db.prepare(`SELECT COUNT(*) as n FROM cluster_presets WHERE author = ? AND is_public = 1`).get(author).n
  },
  incrementLaunch(id) {
    db.prepare(`UPDATE cluster_presets SET launch_count = launch_count + 1 WHERE id = ?`).run(id)
  },
}

// ── Users (every Google account that has ever signed in) ─────────────────────
const users = {
  // Called on every successful POST /api/auth/google — `role` is passed in
  // rather than recomputed here so this stays a pure data-access function;
  // the caller (routes/auth.js) already has it from middleware/auth.js's
  // getRole().
  upsert({ uid, email, name, picture, role }) {
    const now = new Date().toISOString()
    const existing = db.prepare(`SELECT * FROM users WHERE uid = ?`).get(uid)
    if (existing) {
      db.prepare(`UPDATE users SET email=?, name=?, picture=?, role=?, last_seen=? WHERE uid=?`)
        .run(email, name, picture, role, now, uid)
    } else {
      db.prepare(`INSERT INTO users (uid, email, name, picture, role, last_seen, first_seen) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(uid, email, name, picture, role, now, now)
    }
  },
  list() {
    return db.prepare(`SELECT * FROM users ORDER BY last_seen DESC`).all()
  },
  get(uid) {
    return db.prepare(`SELECT * FROM users WHERE uid = ?`).get(uid)
  },
  setRole(uid, role) {
    db.prepare(`UPDATE users SET role = ? WHERE uid = ?`).run(role, uid)
  },
}

// ── Hosts (Electron machines available to run AC servers) ────────────────────
function parseHostRow(row) {
  if (!row) return null
  return { ...row, is_online: !!row.is_online, can_host: !!row.can_host }
}
const hosts = {
  register({ uid, name, machineName, acPath }) {
    const now = new Date().toISOString()
    const existing = db.prepare(`SELECT * FROM hosts WHERE uid = ?`).get(uid)
    if (existing) {
      db.prepare(`UPDATE hosts SET name=?, machine_name=?, ac_path=?, last_seen=? WHERE uid=?`)
        .run(name, machineName, acPath, now, uid)
    } else {
      db.prepare(`INSERT INTO hosts (uid, name, machine_name, last_seen, is_online, ac_path, can_host) VALUES (?, ?, ?, ?, 0, ?, 1)`)
        .run(uid, name, machineName, now, acPath)
    }
    return parseHostRow(db.prepare(`SELECT * FROM hosts WHERE uid = ?`).get(uid))
  },
  setOnline(uid, isOnline) {
    db.prepare(`UPDATE hosts SET is_online = ?, last_seen = ? WHERE uid = ?`).run(isOnline ? 1 : 0, new Date().toISOString(), uid)
  },
  setCanHost(uid, canHost) {
    db.prepare(`UPDATE hosts SET can_host = ? WHERE uid = ?`).run(canHost ? 1 : 0, uid)
  },
  available() {
    return db.prepare(`SELECT * FROM hosts WHERE is_online = 1 AND can_host = 1`).all().map(parseHostRow)
  },
  get(uid) {
    return parseHostRow(db.prepare(`SELECT * FROM hosts WHERE uid = ?`).get(uid))
  },
  list() {
    return db.prepare(`SELECT * FROM hosts`).all().map(parseHostRow)
  },
  remove(uid) {
    db.prepare(`DELETE FROM hosts WHERE uid = ?`).run(uid)
  },
}

module.exports = { db, events, stats, chat, invites, modInstalls, pushSubs, cluster, users, hosts }
