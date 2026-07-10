// Automobilista 2 telemetry source — UDP (Project CARS 2 UDP protocol),
// preferred over raw shared memory per this phase's own brief: AMS2's SHM
// struct (SMS_SHM) is ~750KB with participant-array-dependent offsets, while
// the UDP feed is a much smaller, simpler set of fixed-layout packets.
//
// HONEST CAVEAT, unlike f125.js: the brief gives an explicit, confirmable
// byte-by-byte header layout (packetNumber/categoryPacketNumber/
// partialPacketIndex/partialPacketNumber/packetType/dataVersion — implemented
// below with confidence, same as every other field with a stated offset in
// this codebase), but it does NOT give byte offsets for the actual
// telemetry/game-state payload fields themselves — only field *names* (from
// the separate SHM struct list) with a note to "map to canonical frame."
// Unlike F1's UDP format (a stable, officially published spec I could
// reconstruct with confidence from the field list alone — see f125.js),
// Project CARS 2's UDP payload layout isn't something this pass could
// independently verify against a real packet capture or an official SDK
// header in this environment. Every payload field offset below is a
// best-effort sequential layout from the field list order, explicitly
// TODO-flagged — same honesty standard Phase 13 held AC Rally's five unknown
// fields to. If telemetry reads as garbage once tested against a real AMS2
// session, this file's offsets are the first thing to check, not
// gameDetector.js or normalizer.js.
const dgram = require('dgram')

const HEADER_SIZE = 8
const DEFAULT_PORT = 5606
const PACKET_TYPE = { TELEMETRY: 0, RACE: 1, TIMINGS: 2, GAME_STATE: 3, PARTICIPANT: 4, TIME_STAT: 5, VEHICLE_NAME: 6 }

function readHeader(buf) {
  return {
    packetNumber: buf.readUInt16LE(0),
    categoryPacketNumber: buf.readUInt16LE(2),
    partialPacketIndex: buf.readUInt8(4),
    partialPacketNumber: buf.readUInt8(5),
    packetType: buf.readUInt8(6),
    dataVersion: buf.readUInt8(7),
  }
}

// TODO: unverified offsets — see file header. Sequential layout of the
// telemetry-relevant SHM field list (scalars first, then per-wheel arrays in
// FL/FR/RL/RR order), starting right after the 8-byte header.
function parseTelemetry(buf) {
  const base = HEADER_SIZE
  if (buf.length < base + 4) return null
  let p = base
  const read = (fn, size) => { const v = buf[fn](p); p += size; return v }
  try {
    const out = {}
    out.mSpeed = read('readFloatLE', 4)
    out.mThrottle = read('readFloatLE', 4)
    out.mBrake = read('readFloatLE', 4)
    out.mClutch = read('readFloatLE', 4)
    out.mSteering = read('readFloatLE', 4)
    out.mGear = read('readUInt32LE', 4)
    out.mRpm = read('readUInt32LE', 4)
    out.mMaxRpm = read('readUInt32LE', 4)
    out.mFuelLevel = read('readFloatLE', 4)
    out.mFuelCapacity = read('readUInt32LE', 4)
    out.mLocalAcceleration = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mPitMode = read('readUInt32LE', 4)
    out.mAeroDamage = read('readFloatLE', 4)
    out.mEngineDamage = read('readFloatLE', 4)
    out.mBoostActive = read('readUInt32LE', 4)
    out.mBoostAmount = read('readFloatLE', 4)
    out.mAirPressure = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mTyreTemp = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mTyreInternalAirTemp = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mTyreWear = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mBrakeTempCelsius = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mSuspensionTravel = [read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4), read('readFloatLE', 4)]
    out.mBrakeDamage = [read('readUInt32LE', 4), read('readUInt32LE', 4), read('readUInt32LE', 4), read('readUInt32LE', 4)]
    out.mSuspensionDamage = [read('readUInt32LE', 4), read('readUInt32LE', 4), read('readUInt32LE', 4), read('readUInt32LE', 4)]
    return out
  } catch (e) {
    return null // truncated/short packet — caller keeps the last known-good telemetry
  }
}

// The brief's normalizeAMS2 spec wants mCurrentTime/mLastLapTime/mBestLapTime,
// but those are documented under the SHM struct's separate "Timing" section,
// not the "Car state" fields packetType 0 realistically carries — they most
// plausibly arrive on packetType 2 ("timings", per the header's own packetType
// enum) instead. TODO: unverified offset, sequential-layout best-effort, same
// caveat as every other AMS2 payload field in this file.
function parseTiming(buf) {
  const base = HEADER_SIZE
  if (buf.length < base + 12) return null
  try {
    const mCurrentTime = buf.readFloatLE(base)
    const mLastLapTime = buf.readFloatLE(base + 4)
    const mBestLapTime = buf.readFloatLE(base + 8)
    return { mCurrentTime, mLastLapTime, mBestLapTime }
  } catch (e) {
    return null
  }
}

// TODO: unverified offsets — see file header. mTrackLocation/mTrackVariation
// are fixed 64-byte null-terminated char arrays in the real SHM struct; kept
// the same size here since there's no evidence the UDP payload repacks them
// smaller, but that's an assumption, not a confirmed fact.
function parseGameState(buf) {
  const base = HEADER_SIZE
  if (buf.length < base + 64 + 64 + 16) return null
  try {
    let p = base
    const trackLocation = buf.toString('utf8', p, p + 64).replace(/\0.*$/s, ''); p += 64
    p += 64 // mTrackVariation — not surfaced in the canonical frame
    const trackLength = buf.readFloatLE(p); p += 4
    const eventTimeRemaining = buf.readFloatLE(p); p += 4
    const ambientTemperature = buf.readUInt32LE(p); p += 4
    const trackTemperature = buf.readUInt32LE(p); p += 4
    let rainDensity = null, windSpeed = null
    if (buf.length >= p + 8) { rainDensity = buf.readFloatLE(p); p += 4; windSpeed = buf.readFloatLE(p); p += 4 }
    return { mTrackLocation: trackLocation || null, mTrackLength: trackLength, mEventTimeRemaining: eventTimeRemaining, mAmbientTemperature: ambientTemperature, mTrackTemperature: trackTemperature, mRainDensity: rainDensity, mWindSpeed: windSpeed }
  } catch (e) {
    return null
  }
}

class AMS2Source {
  constructor(port = DEFAULT_PORT) {
    this.port = port || DEFAULT_PORT
    this.socket = null
    this.active = false
    this._onFrame = null
    this._telemetry = null
    this._gameState = null
    this._timing = null
  }

  onFrame(cb) { this._onFrame = cb }

  _handleMessage(buf) {
    try {
      if (buf.length < HEADER_SIZE) return
      const { packetType } = readHeader(buf)
      if (packetType === PACKET_TYPE.TELEMETRY) {
        const t = parseTelemetry(buf)
        if (t) {
          this._telemetry = t
          this._onFrame?.({ telemetry: this._telemetry, gameState: this._gameState, timing: this._timing })
        }
      } else if (packetType === PACKET_TYPE.GAME_STATE) {
        const g = parseGameState(buf)
        if (g) this._gameState = g
      } else if (packetType === PACKET_TYPE.TIMINGS) {
        const t = parseTiming(buf)
        if (t) this._timing = t
      }
    } catch (e) {
      // Malformed/truncated packet — never let a single bad UDP datagram
      // take down the main process.
    }
  }

  async start() {
    if (this.active) return { ok: true, alreadyRunning: true }
    return new Promise((resolve) => {
      try {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
        this.socket.on('message', (buf) => this._handleMessage(buf))
        this.socket.on('error', (e) => {
          this.active = false
          resolve({ ok: false, error: e.message })
        })
        // AMS2 broadcasts (doesn't unicast to a configured IP), so this binds
        // to all interfaces and enables broadcast reception rather than
        // configuring a destination the way F1's UDP telemetry needs.
        this.socket.bind(this.port, '0.0.0.0', () => {
          try { this.socket.setBroadcast(true) } catch (e) {}
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
    this._telemetry = null
    this._gameState = null
    this._timing = null
  }

  setPort(port) {
    const restart = this.active
    if (restart) this.stop()
    this.port = port || DEFAULT_PORT
    if (restart) return this.start()
    return Promise.resolve({ ok: true })
  }

  // Listens for 500ms and confirms at least one packet with a recognized
  // packetType (0-6 per the header spec) arrived — same probe shape as
  // ForzaSource/F125Source, used by gameDetector.js.
  static probe(port = DEFAULT_PORT, timeoutMs = 500) {
    return new Promise((resolve) => {
      let done = false
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      const finish = (result) => {
        if (done) return
        done = true
        try { socket.close() } catch (e) {}
        resolve(result)
      }
      const timer = setTimeout(() => finish(false), timeoutMs)
      socket.on('message', (buf) => {
        try {
          if (buf.length >= HEADER_SIZE) {
            const packetType = buf.readUInt8(6)
            if (packetType >= 0 && packetType <= 6) { clearTimeout(timer); finish(true) }
          }
        } catch (e) { /* keep waiting for the timeout */ }
      })
      socket.on('error', () => { clearTimeout(timer); finish(false) })
      try {
        socket.bind(port || DEFAULT_PORT, '0.0.0.0', () => { try { socket.setBroadcast(true) } catch (e) {} })
      } catch (e) {
        clearTimeout(timer)
        finish(false)
      }
    })
  }
}

module.exports = { AMS2Source, DEFAULT_PORT }
