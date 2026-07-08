const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.join(__dirname, 'data.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

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
`)

// ── Events ────────────────────────────────────────────────────────────────────
const events = {
  list() {
    const rows = db.prepare(`SELECT * FROM events ORDER BY date, time`).all()
    const acceptances = db.prepare(`SELECT event_id, handle, accepted_at FROM event_acceptances`).all()
    return rows.map(row => ({
      ...row,
      required_mods: row.required_mods ? JSON.parse(row.required_mods) : [],
      acceptances: acceptances.filter(a => a.event_id === row.id),
    }))
  },
  get(id) {
    const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id)
    if (!row) return null
    const acceptances = db.prepare(`SELECT handle, accepted_at FROM event_acceptances WHERE event_id = ?`).all(id)
    return { ...row, required_mods: row.required_mods ? JSON.parse(row.required_mods) : [], acceptances }
  },
  create(event) {
    db.prepare(`INSERT INTO events
      (id, name, type, date, time, track, car_restriction, notes, poster_path, proposed_by, status, created_at, required_mods)
      VALUES (@id, @name, @type, @date, @time, @track, @car_restriction, @notes, @poster_path, @proposed_by, @status, @created_at, @required_mods)`
    ).run(event)
    return events.get(event.id)
  },
  accept(id, handle) {
    db.prepare(`INSERT OR REPLACE INTO event_acceptances (event_id, handle, accepted_at) VALUES (?, ?, ?)`)
      .run(id, handle, new Date().toISOString())
    const evt = events.get(id)
    if (!evt) return null
    const otherAcceptors = evt.acceptances.filter(a => a.handle !== evt.proposed_by)
    if (evt.status === 'proposed' && otherAcceptors.length >= 1) {
      db.prepare(`UPDATE events SET status = 'happening' WHERE id = ?`).run(id)
    }
    return events.get(id)
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
      db.prepare(`INSERT INTO sessions (id, track, date, server_name, participants) VALUES (?, ?, ?, ?, ?)`)
        .run(session.id, session.track, session.date, session.server_name || null, JSON.stringify(session.handle ? [session.handle] : []))
    }
  },
  addLap(lap) {
    db.prepare(`INSERT INTO laps
      (id, session_id, handle, track, car, lap_time_ms, s1_ms, s2_ms, s3_ms, lap_number, ts, valid)
      VALUES (@id, @session_id, @handle, @track, @car, @lap_time_ms, @s1_ms, @s2_ms, @s3_ms, @lap_number, @ts, @valid)`
    ).run(lap)
    return db.prepare(`SELECT * FROM laps WHERE id = ?`).get(lap.id)
  },
  listSessions() {
    return db.prepare(`SELECT * FROM sessions ORDER BY date DESC`).all()
      .map(s => ({ ...s, participants: JSON.parse(s.participants || '[]') }))
  },
  listLaps({ handle, track, sessionId } = {}) {
    let sql = `SELECT * FROM laps WHERE 1=1`
    const params = []
    if (handle)    { sql += ` AND handle = ?`; params.push(handle) }
    if (track)     { sql += ` AND track = ?`; params.push(track) }
    if (sessionId) { sql += ` AND session_id = ?`; params.push(sessionId) }
    sql += ` ORDER BY ts ASC`
    return db.prepare(sql).all(...params)
  },
  personalBests(handle) {
    const sql = `SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY track, car ORDER BY lap_time_ms ASC) as rn
      FROM laps WHERE valid = 1 ${handle ? 'AND handle = ?' : ''}
    ) WHERE rn = 1 ORDER BY track`
    return db.prepare(sql).all(...(handle ? [handle] : []))
  },
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

module.exports = { db, events, stats, chat }
