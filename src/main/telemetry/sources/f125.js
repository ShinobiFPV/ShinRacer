// EA/Codemasters F1 25 telemetry source — UDP, not shared memory.
//
// Same "raw first, normalize second" split as forza.js: this class only owns
// the UDP socket lifecycle and per-packet routing by packetId; the actual
// byte-offset parsing into per-packet-type structs lives here (there's no
// single fixed-size buffer to hand off wholesale the way Forza's is, since
// six different packet types share one port), but normalizer.js's
// normalizeF125() is still what maps the accumulated structs onto the
// canonical frame — same division of labor as every other source.
//
// The 2025 UDP format's packet header and per-packet struct layouts are the
// official, publicly documented EA/Codemasters spec (stable since F1 2020,
// extended each season) — CarTelemetryData (60 bytes/car), CarStatusData (49
// bytes/car), and LapData (50 bytes/car) below were independently
// recomputed field-by-field from the struct definitions in this phase's own
// brief (which lists fields but not cumulative offsets) rather than assumed;
// the running byte totals matched the known real packet sizes for each
// struct, which is good corroborating evidence the field order/sizes here
// are right.
const dgram = require('dgram')

const HEADER_SIZE = 29
const DEFAULT_PORT = 20777

// Packet IDs this source actually parses. Session History, Car Setups,
// Participants, etc. are ignored — nothing in the canonical frame needs them.
const PACKET_ID = { MOTION: 0, SESSION: 1, LAP_DATA: 2, CAR_TELEMETRY: 6, CAR_STATUS: 7, CAR_DAMAGE: 10 }

const CAR_TELEMETRY_SIZE = 60
const CAR_STATUS_SIZE = 49
const LAP_DATA_SIZE = 50
const CAR_DAMAGE_SIZE = 40 // 4*(4+1+1) tyre wear/damage/brake + 15 scalar damage bytes — see parseCarDamage
const CAR_MOTION_SIZE = 60

function readHeader(buf) {
  return {
    packetFormat: buf.readUInt16LE(0),
    packetId: buf.readUInt8(6),
    playerCarIndex: buf.readUInt8(27),
  }
}

function parseCarTelemetry(buf, playerIdx) {
  const off = HEADER_SIZE + playerIdx * CAR_TELEMETRY_SIZE
  if (off + CAR_TELEMETRY_SIZE > buf.length) return null
  let p = off
  const speed = buf.readUInt16LE(p); p += 2
  const throttle = buf.readFloatLE(p); p += 4
  const steer = buf.readFloatLE(p); p += 4
  const brake = buf.readFloatLE(p); p += 4
  const clutch = buf.readUInt8(p); p += 1
  const gear = buf.readInt8(p); p += 1
  const engineRPM = buf.readUInt16LE(p); p += 2
  const drs = buf.readUInt8(p); p += 1
  const revLightsPercent = buf.readUInt8(p); p += 1
  p += 2 // revLightsBitValue — not surfaced in the canonical frame
  const brakesTemperature = [buf.readUInt16LE(p), buf.readUInt16LE(p + 2), buf.readUInt16LE(p + 4), buf.readUInt16LE(p + 6)]; p += 8
  const tyresSurfaceTemperature = [buf.readUInt8(p), buf.readUInt8(p + 1), buf.readUInt8(p + 2), buf.readUInt8(p + 3)]; p += 4
  const tyresInnerTemperature = [buf.readUInt8(p), buf.readUInt8(p + 1), buf.readUInt8(p + 2), buf.readUInt8(p + 3)]; p += 4
  p += 2 // engineTemperature — not surfaced
  const tyresPressure = [buf.readFloatLE(p), buf.readFloatLE(p + 4), buf.readFloatLE(p + 8), buf.readFloatLE(p + 12)]; p += 16
  return {
    speed, throttle, steer, brake, clutch, gear, engineRPM, drs, revLightsPercent,
    brakesTemperature, tyresSurfaceTemperature, tyresInnerTemperature, tyresPressure,
  }
}

function parseCarStatus(buf, playerIdx) {
  const off = HEADER_SIZE + playerIdx * CAR_STATUS_SIZE
  if (off + CAR_STATUS_SIZE > buf.length) return null
  let p = off
  p += 5 // tractionControl, antiLockBrakes, fuelMix, frontBrakeBias, pitLimiterStatus — not surfaced individually
  const fuelInTank = buf.readFloatLE(p); p += 4
  const fuelCapacity = buf.readFloatLE(p); p += 4
  p += 4 // fuelRemainingLaps
  const maxRPM = buf.readUInt16LE(p); p += 2
  p += 2 // idleRPM
  p += 2 // maxGears, drsAllowed
  p += 2 // drsActivationDistance
  const actualTyreCompound = buf.readUInt8(p); p += 1
  p += 2 // visualTyreCompound, tyresAgeLaps
  p += 1 // vehicleFiaFlags
  const enginePowerICE = buf.readUInt8(p); p += 1
  const enginePowerMGUK = buf.readUInt8(p); p += 1
  const ersStoreEnergy = buf.readFloatLE(p); p += 4
  const ersDeployMode = buf.readUInt8(p); p += 1
  return { fuelInTank, fuelCapacity, maxRPM, actualTyreCompound, enginePowerICE, enginePowerMGUK, ersStoreEnergy, ersDeployMode, pitLimiterStatus: buf.readUInt8(off + 4) }
}

function parseLapData(buf, playerIdx) {
  const off = HEADER_SIZE + playerIdx * LAP_DATA_SIZE
  if (off + LAP_DATA_SIZE > buf.length) return null
  return {
    lastLapTimeInMS: buf.readUInt32LE(off),
    currentLapTimeInMS: buf.readUInt32LE(off + 4),
    carPosition: buf.readUInt8(off + 30),
    currentLapNum: buf.readUInt8(off + 31),
    pitStatus: buf.readUInt8(off + 32),
    sector: buf.readUInt8(off + 34),
    currentLapInvalid: buf.readUInt8(off + 35),
  }
}

// CarDamageData per car: tyresWear[4](f32*4=16) + tyresDamage[4](4) +
// brakesDamage[4](4) + frontLeftWingDamage/frontRightWingDamage/rearWingDamage/
// floorDamage/diffuserDamage/sidepodDamage(6) + drsFault/ersFault(2) +
// gearBoxDamage/engineDamage(2) + 6 more engine-wear bytes = 40 bytes total.
function parseCarDamage(buf, playerIdx) {
  const off = HEADER_SIZE + playerIdx * CAR_DAMAGE_SIZE
  if (off + CAR_DAMAGE_SIZE > buf.length) return null
  const tyresWear = [buf.readFloatLE(off), buf.readFloatLE(off + 4), buf.readFloatLE(off + 8), buf.readFloatLE(off + 12)]
  let p = off + 16 + 4 + 4 // skip tyresWear, tyresDamage[4], brakesDamage[4]
  const frontLeftWingDamage = buf.readUInt8(p); p += 1
  const frontRightWingDamage = buf.readUInt8(p); p += 1
  const rearWingDamage = buf.readUInt8(p); p += 1
  const floorDamage = buf.readUInt8(p); p += 1
  p += 2 // diffuserDamage, sidepodDamage
  p += 2 // drsFault, ersFault
  p += 1 // gearBoxDamage
  const engineDamage = buf.readUInt8(p)
  return { tyresWear, frontLeftWingDamage, frontRightWingDamage, rearWingDamage, floorDamage, engineDamage }
}

function parseMotion(buf, playerIdx) {
  const off = HEADER_SIZE + playerIdx * CAR_MOTION_SIZE
  if (off + CAR_MOTION_SIZE > buf.length) return null
  return {
    worldPositionX: buf.readFloatLE(off),
    worldPositionY: buf.readFloatLE(off + 4),
    worldPositionZ: buf.readFloatLE(off + 8),
    gForceLateral: buf.readFloatLE(off + 44),
    gForceLongitudinal: buf.readFloatLE(off + 48),
    gForceVertical: buf.readFloatLE(off + 52),
  }
}

// Session packet — only the fields listed through safetyCarStatus per the
// brief; marshalZones is a fixed-size 21*5=105-byte array regardless of
// numMarshalZones's actual value, so safetyCarStatus's offset doesn't depend
// on how many zones are actually in use this session.
function parseSession(buf) {
  const p = HEADER_SIZE
  if (p + 19 + 105 + 1 > buf.length) return null
  return {
    weather: buf.readUInt8(p),
    trackTemperature: buf.readInt8(p + 1),
    airTemperature: buf.readInt8(p + 2),
    totalLaps: buf.readUInt8(p + 3),
    trackLength: buf.readUInt16LE(p + 4),
    sessionType: buf.readUInt8(p + 6),
    trackId: buf.readInt8(p + 7),
    formula: buf.readUInt8(p + 8),
    sessionTimeLeft: buf.readUInt16LE(p + 9),
    sessionDuration: buf.readUInt16LE(p + 11),
    pitSpeedLimit: buf.readUInt8(p + 13),
    safetyCarStatus: buf.readUInt8(p + 19 + 105),
  }
}

class F125Source {
  constructor(port = DEFAULT_PORT) {
    this.port = port || DEFAULT_PORT
    this.socket = null
    this.active = false
    this._onFrame = null
    this._motion = null
    this._session = null
    this._lapData = null
    this._telemetry = null
    this._status = null
    this._damage = null
  }

  onFrame(cb) { this._onFrame = cb }

  _handleMessage(buf) {
    try {
      if (buf.length < HEADER_SIZE) return
      const { packetFormat, packetId, playerCarIndex } = readHeader(buf)
      if (packetFormat !== 2025) return // a different game/format sharing this port — ignore

      switch (packetId) {
        case PACKET_ID.MOTION: this._motion = parseMotion(buf, playerCarIndex) || this._motion; break
        case PACKET_ID.SESSION: this._session = parseSession(buf) || this._session; break
        case PACKET_ID.LAP_DATA: this._lapData = parseLapData(buf, playerCarIndex) || this._lapData; break
        case PACKET_ID.CAR_STATUS: this._status = parseCarStatus(buf, playerCarIndex) || this._status; break
        case PACKET_ID.CAR_DAMAGE: this._damage = parseCarDamage(buf, playerCarIndex) || this._damage; break
        case PACKET_ID.CAR_TELEMETRY:
          this._telemetry = parseCarTelemetry(buf, playerCarIndex) || this._telemetry
          // Car Telemetry is the most frequently-sent packet (every tick at
          // the configured send rate) — emitting a frame here, combining
          // whatever else has accumulated so far, keeps the canonical
          // frame's update rate matching the game's actual telemetry rate
          // rather than whichever packet type happened to arrive last.
          if (this._telemetry) {
            this._onFrame?.({
              motion: this._motion, session: this._session, lapData: this._lapData,
              telemetry: this._telemetry, status: this._status, damage: this._damage,
            })
          }
          break
        default: break
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
        this.socket = dgram.createSocket('udp4')
        this.socket.on('message', (buf) => this._handleMessage(buf))
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
    this._motion = this._session = this._lapData = this._telemetry = this._status = this._damage = null
  }

  setPort(port) {
    const restart = this.active
    if (restart) this.stop()
    this.port = port || DEFAULT_PORT
    if (restart) return this.start()
    return Promise.resolve({ ok: true })
  }

  // Briefly binds the port and waits for one real packet with
  // packetFormat === 2025 — same shape as ForzaSource.probe, used by
  // gameDetector.js and Settings' "Test telemetry" button.
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
      const timer = setTimeout(() => finish(false), timeoutMs)
      socket.on('message', (buf) => {
        try {
          if (buf.length >= HEADER_SIZE && buf.readUInt16LE(0) === 2025) {
            clearTimeout(timer)
            finish(true)
          }
        } catch (e) { /* ignore and keep waiting for the timeout */ }
      })
      socket.on('error', () => { clearTimeout(timer); finish(false) })
      try {
        socket.bind(port)
      } catch (e) {
        clearTimeout(timer)
        finish(false)
      }
    })
  }
}

module.exports = { F125Source, DEFAULT_PORT }
