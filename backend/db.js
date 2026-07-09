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
      (id, name, type, date, time, track, car_restriction, notes, poster_path, proposed_by, status, created_at, required_mods)
      VALUES (@id, @name, @type, @date, @time, @track, @car_restriction, @notes, @poster_path, @proposed_by, @status, @created_at, @required_mods)`
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
      status=@status, required_mods=@required_mods
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
      (code, server_name, host, port, password, track, cars, created_by, created_at, expires_at)
      VALUES (@code, @server_name, @host, @port, @password, @track, @cars, @created_by, @created_at, @expires_at)`
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

module.exports = { db, events, stats, chat, invites, modInstalls, pushSubs }
