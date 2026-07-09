// AC Evo (Assetto Corsa Evo) shared-memory telemetry source.
//
// Different segment names from AC1/ACC/AC Rally: Local\acevo_pmf_physics,
// Local\acevo_pmf_graphics, Local\acevo_pmf_static (confirmed against
// dSyncro/acevo-shared-memory's mapper.rs, a real working Rust crate — not
// guessed). Does NOT extend AC1Source (unrelated struct layout entirely),
// but reuses its buildShmReaderScript/probeShmSegment helpers, which are
// already parametrized by segment prefix for exactly this reason.
//
// Byte offsets below were computed field-by-field from
// dSyncro/acevo-shared-memory's bindgen source header (src/bindings/source/
// wrapper.hpp), which defines the real SPageFilePhysics/SPageFileGraphicEvo/
// SPageFileStaticEvo C++ structs under `#pragma pack(4)` — not the Phase 13
// spec's own "~offset, unverified" placeholders. The physics struct is
// homogeneous 4-byte fields throughout (no padding surprises); the graphics
// struct mixes bool/int8_t/short/uint64_t with floats/int32s, so offsets
// were computed programmatically (summing size+alignment per field in
// declared order) rather than by hand, to avoid a manual arithmetic slip
// cascading through 100+ fields. Even so: this is early-access telemetry
// Kunos can and does change between patches, which is exactly why every
// field read below is still individually wrapped in try/catch with a
// per-field last-known-good fallback, per the spec's explicit instruction —
// good current data doesn't make the defensiveness unnecessary.
//
// No rainIntensity field exists anywhere in this real struct (only
// `rain_lights`, which is the car's physical rain light being lit, not a
// weather amount) — left null rather than invented. Likewise no
// maxRpm/maxPower/maxTorque anywhere in physics, graphics, or static; only
// max_fuel and max_turbo_boost (both on the Graphics struct, not Static the
// way AC1 does it) were found.
const { buildShmReaderScript, probeShmSegment, readFloatArray } = require('./ac1')
const { spawn } = require('child_process')
const readline = require('readline')

// Wchar-less: AC Evo's strings are plain ASCII char[], not UTF-16LE like
// AC1/ACC's wchar_t[] fields — read as latin1 and trim at the first NUL.
function readCharStr(buf, offset, byteLen) {
  const raw = buf.toString('latin1', offset, offset + byteLen)
  const nullIdx = raw.indexOf('\0')
  return (nullIdx === -1 ? raw : raw.slice(0, nullIdx)).trim()
}

class ACEvoSource {
  constructor() {
    this.proc = null
    this.active = false
    this._onFrame = null
    this._onWarning = null
    this.shmPrefix = 'acevo_pmf'
    this.lastGoodPhysics = {}
    this.lastGoodGraphics = {}
    this.lastGoodStatic = {}
    this.lastSmVersion = null
  }

  onFrame(cb) { this._onFrame = cb }
  onWarning(cb) { this._onWarning = cb }

  parsePhysics(buf) {
    const out = {}
    let anyError = false
    const field = (name, fn) => {
      try {
        out[name] = fn()
      } catch (e) {
        out[name] = this.lastGoodPhysics[name] ?? null
        anyError = true
      }
    }
    field('gas', () => buf.readFloatLE(4))
    field('brake', () => buf.readFloatLE(8))
    field('fuel', () => buf.readFloatLE(12))
    field('gear', () => buf.readInt32LE(16))
    field('rpms', () => buf.readInt32LE(20))
    field('steerAngle', () => buf.readFloatLE(24))
    field('speedKmh', () => buf.readFloatLE(28))
    field('accG', () => readFloatArray(buf, 44, 3))
    field('wheelSlip', () => readFloatArray(buf, 56, 4))
    field('wheelLoad', () => readFloatArray(buf, 72, 4))
    field('wheelsPressure', () => readFloatArray(buf, 88, 4))
    field('tyreWear', () => readFloatArray(buf, 120, 4))
    field('tyreDirtyLevel', () => readFloatArray(buf, 136, 4))
    field('tyreCoreTemp', () => readFloatArray(buf, 152, 4))
    field('suspensionTravel', () => readFloatArray(buf, 184, 4))
    field('drs', () => buf.readFloatLE(200))
    field('tc', () => buf.readFloatLE(204))
    field('cgHeight', () => buf.readFloatLE(220))
    field('carDamage', () => readFloatArray(buf, 224, 5))
    field('pitLimiterOn', () => buf.readInt32LE(248))
    field('abs', () => buf.readFloatLE(252))
    field('turboBoost', () => buf.readFloatLE(276))
    field('ersRecoveryLevel', () => buf.readInt32LE(320))
    field('ersPowerLevel', () => buf.readInt32LE(324))
    field('ersHeatCharging', () => buf.readInt32LE(328))
    field('ersIsCharging', () => buf.readInt32LE(332))
    field('kersCurrentKJ', () => buf.readFloatLE(336))
    field('drsAvailable', () => buf.readInt32LE(340))
    field('drsEnabled', () => buf.readInt32LE(344))
    field('brakeTemp', () => readFloatArray(buf, 348, 4))
    field('clutch', () => buf.readFloatLE(364))
    field('tyreTempI', () => readFloatArray(buf, 368, 4))
    field('tyreTempM', () => readFloatArray(buf, 384, 4))
    field('tyreTempO', () => readFloatArray(buf, 400, 4))
    field('brakeBias', () => buf.readFloatLE(564))
    field('tyreTemp', () => readFloatArray(buf, 696, 4))
    field('waterTemp', () => buf.readFloatLE(712))
    field('frontBrakeCompound', () => buf.readInt32LE(732))
    field('rearBrakeCompound', () => buf.readInt32LE(736))
    field('padLife', () => readFloatArray(buf, 740, 4))
    field('discLife', () => readFloatArray(buf, 756, 4))

    this.lastGoodPhysics = { ...this.lastGoodPhysics, ...out }
    if (anyError) out.parseError = true
    return out
  }

  parseGraphics(buf) {
    const out = {}
    let anyError = false
    const field = (name, fn) => {
      try {
        out[name] = fn()
      } catch (e) {
        out[name] = this.lastGoodGraphics[name] ?? null
        anyError = true
      }
    }
    field('status', () => buf.readInt32LE(4)) // 0=AC_OFF per ACEVO_STATUS — mapped in normalizer.js
    field('deltaTimeMs', () => buf.readInt32LE(184))
    field('currentLapMs', () => buf.readInt32LE(188))
    field('predictedLapTimeMs', () => buf.readInt32LE(192))
    field('completedLaps', () => buf.readInt32LE(2384))
    field('position', () => buf.readInt32LE(2388))
    field('totalDrivers', () => buf.readInt32LE(2392))
    field('lastLapMs', () => buf.readInt32LE(2396))
    field('bestLapMs', () => buf.readInt32LE(2400))
    field('flag', () => buf.readInt32LE(2404))
    field('sessionTimeLeftMs', () => buf.readInt32LE(2524)) // SMEvoSessionState.time_left_ms (session_state @2476 + 48)
    field('driverName', () => readCharStr(buf, 3020, 33))
    field('carModel', () => readCharStr(buf, 3086, 33))
    field('isInPit', () => buf.readInt8(3119))
    field('isInPitLane', () => buf.readInt8(3120))
    field('isValidLap', () => buf.readInt8(3121))
    field('gapAhead', () => buf.readFloatLE(3844))
    field('gapBehind', () => buf.readFloatLE(3848))
    field('numberOfCars', () => buf.readUInt8(3852))
    field('fuelPerLap', () => buf.readFloatLE(3856))
    field('maxFuel', () => buf.readFloatLE(3928))

    this.lastGoodGraphics = { ...this.lastGoodGraphics, ...out }
    if (anyError) out.parseError = true
    return out
  }

  parseStaticInfo(buf) {
    const out = {}
    let anyError = false
    const field = (name, fn) => {
      try {
        out[name] = fn()
      } catch (e) {
        out[name] = this.lastGoodStatic[name] ?? null
        anyError = true
      }
    }
    field('smVersion', () => readCharStr(buf, 0, 15))
    field('track', () => readCharStr(buf, 136, 33))
    field('trackLength', () => buf.readFloatLE(204))

    this.lastGoodStatic = { ...this.lastGoodStatic, ...out }

    // Version-change detection — a changed smVersion means Kunos shipped a
    // struct layout update and every offset above may now be wrong until
    // this file is updated. We can't "re-probe" a byte layout automatically
    // (there's no self-describing schema in the shared memory itself), so
    // the honest response is surfacing a warning, not silently continuing
    // to parse what may now be garbage.
    if (out.smVersion && this.lastSmVersion && out.smVersion !== this.lastSmVersion) {
      this._onWarning?.(
        'AC Evo shared memory version changed — telemetry may be inaccurate until ShinRacer is updated.'
      )
    }
    if (out.smVersion) this.lastSmVersion = out.smVersion

    if (anyError) out.parseError = true
    return out
  }

  async start(pollIntervalMs = 60) {
    if (this.active) return { ok: true, alreadyRunning: true }
    try {
      const script = buildShmReaderScript(this.shmPrefix, pollIntervalMs)
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
        windowsHide: true,
      })
      this.active = true

      const rl = readline.createInterface({ input: this.proc.stdout })
      rl.on('line', (line) => {
        if (!line.startsWith('FRAME:')) return
        try {
          const [pB64, gB64, sB64] = line.slice(6).split('|')
          const physics = this.parsePhysics(Buffer.from(pB64, 'base64'))
          const graphics = this.parseGraphics(Buffer.from(gB64, 'base64'))
          const staticInfo = this.parseStaticInfo(Buffer.from(sB64, 'base64'))
          const parseError = !!(physics.parseError || graphics.parseError || staticInfo.parseError)
          this._onFrame?.({ physics, graphics, static: staticInfo, parseError })
        } catch (e) {
          // Whole-frame decode failure (malformed base64/split) — skip this
          // tick entirely; the reader keeps producing new frames every tick.
        }
      })
      this.proc.on('exit', () => { this.active = false; this.proc = null })
      this.proc.on('error', () => { this.active = false; this.proc = null })
      return { ok: true }
    } catch (e) {
      this.active = false
      this.proc = null
      return { ok: false, error: e.message }
    }
  }

  stop() {
    if (this.proc) {
      try { this.proc.kill() } catch (e) {}
      this.proc = null
    }
    this.active = false
  }

  static async probe() {
    return probeShmSegment('Local\\acevo_pmf_physics')
  }
}

module.exports = { ACEvoSource }
