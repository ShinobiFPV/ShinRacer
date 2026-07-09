// Forza Horizon 5 / 6 telemetry source — UDP "Data Out", not shared memory.
//
// Deliberately thin: this class only owns the UDP socket lifecycle and
// per-packet version detection by byte length. The actual byte-offset
// parsing lives in normalizer.js's normalizeForza(buf, version), per the
// Phase 13 spec's own architecture (ForzaSource.onFrame hands back the raw
// buffer + detected version, same "raw first, normalize second" split every
// other source in this directory follows).
//
// Packet sizes: 311 bytes = FH5, 323 bytes = FH6 (FH6 inserts CarGroup/
// SmashableVelDiff/SmashableMass after NumCylinders, shifting everything
// from PositionX onward by +12 bytes — see normalizer.js). Note: the Phase
// 13 spec's FH5 section header says "232 bytes total" but its own field
// table goes all the way to byte 310 (311 bytes) and the FH6 section
// explicitly states "323 bytes (FH5: 311 bytes)" — 232 is very likely a
// stale label copied from Forza's older, shorter "Sled" packet format. 311
// is used here since it's both internally consistent with the rest of the
// spec and matches the real, public "Horizon Data Out" format.
//
// IMPORTANT PORT CONFLICT: Q2 (this crew's other app) uses UDP port 8000 for
// its own Forza race-engineer feature. This source must never default to
// 8000 — the configurable default here is 5300, and Forza only supports one
// Data Out destination at a time, so running both apps' Forza features
// simultaneously needs the user to explicitly pick one port and point Forza
// at it (see docs/TELEMETRY_SETUP.md).
const dgram = require('dgram')

const FH5_SIZE = 311
const FH6_SIZE = 323
const DEFAULT_PORT = 5300 // never 8000 — see header comment

class ForzaSource {
  constructor(port = DEFAULT_PORT) {
    this.port = port || DEFAULT_PORT
    this.socket = null
    this.active = false
    this._onFrame = null
  }

  onFrame(cb) { this._onFrame = cb }

  detectVersion(buf) {
    if (buf.length === FH6_SIZE) return 'fh6'
    if (buf.length === FH5_SIZE) return 'fh5'
    return null
  }

  async start() {
    if (this.active) return { ok: true, alreadyRunning: true }
    return new Promise((resolve) => {
      try {
        this.socket = dgram.createSocket('udp4')
        this.socket.on('message', (buf) => {
          const version = this.detectVersion(buf)
          if (!version) return // IsRaceOn=0 "in menu" packets and other sizes are silently ignored
          this._onFrame?.({ buf, version })
        })
        this.socket.on('error', (e) => {
          this.active = false
          resolve({ ok: false, error: e.message })
        })
        this.socket.bind(this.port, () => {
          this.active = true
          resolve({ ok: true })
        })
      } catch (e) {
        this.active = false
        resolve({ ok: false, error: e.message })
      }
    })
  }

  stop() {
    if (this.socket) {
      try { this.socket.close() } catch (e) {}
      this.socket = null
    }
    this.active = false
  }

  setPort(port) {
    const restart = this.active
    if (restart) this.stop()
    this.port = port || DEFAULT_PORT
    if (restart) return this.start()
    return Promise.resolve({ ok: true })
  }

  // Briefly binds the configured port and waits for one real packet, used by
  // gameDetector.js and Settings' "Test telemetry" button. Returns the
  // detected version string or null — never leaves a socket bound after
  // returning, so it doesn't fight with a real ForzaSource for the port.
  static probe(port = DEFAULT_PORT, timeoutMs = 2000) {
    return new Promise((resolve) => {
      let done = false
      const socket = dgram.createSocket('udp4')
      const finish = (result) => {
        if (done) return
        done = true
        try { socket.close() } catch (e) {}
        resolve(result)
      }
      const timer = setTimeout(() => finish(null), timeoutMs)
      socket.on('message', (buf) => {
        clearTimeout(timer)
        if (buf.length === FH6_SIZE) finish('fh6')
        else if (buf.length === FH5_SIZE) finish('fh5')
        else finish(null)
      })
      socket.on('error', () => { clearTimeout(timer); finish(null) })
      try {
        socket.bind(port)
      } catch (e) {
        clearTimeout(timer)
        finish(null)
      }
    })
  }
}

module.exports = { ForzaSource, FH5_SIZE, FH6_SIZE, DEFAULT_PORT }
