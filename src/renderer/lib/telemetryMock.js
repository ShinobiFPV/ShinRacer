// Generates realistic-feeling fake telemetry for when AC's shared memory isn't
// available (AC not running, or the SHM reader failed to start). Used by
// useTelemetryShm as its DEMO MODE fallback — never touches the network, never
// posts anywhere, purely local display data matching the live-frame shape.

const LAP_CYCLE_MS = 90000
const GEAR_SPEED_BRACKETS = [0, 40, 80, 120, 160, 200, 240] // km/h thresholds for gears 1-6
const WARMUP_MS = 180000 // ~2 laps to bring tyres up to temp

let startedAt = null

function formatMs(ms) {
  const clamped = Math.max(0, ms)
  const m = Math.floor(clamped / 60000)
  const s = Math.floor((clamped % 60000) / 1000)
  const msec = Math.floor(clamped % 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(msec).padStart(3, '0')}`
}

export function generateMockFrame(now = Date.now()) {
  if (startedAt == null) startedAt = now
  const elapsed = now - startedAt
  const lapT = elapsed % LAP_CYCLE_MS
  const lapProgress = lapT / LAP_CYCLE_MS

  // Speed follows a sine wave over the lap, clamped to 0-250 km/h.
  const speed = Math.max(0, 125 + 125 * Math.sin(lapProgress * Math.PI * 2 - Math.PI / 2))

  let gear = 1
  for (let i = 0; i < GEAR_SPEED_BRACKETS.length; i++) if (speed >= GEAR_SPEED_BRACKETS[i]) gear = i + 1
  gear = Math.min(gear, 6)

  // Three simulated braking zones per lap.
  const brakingZone = Math.sin(lapProgress * Math.PI * 2 * 3) < -0.75
  const throttle = brakingZone ? 0 : Math.min(1, speed / 220 + 0.25)
  const brake = brakingZone ? 0.75 + Math.random() * 0.2 : 0
  const rpm = 1200 + ((speed % 40) / 40) * 6800

  const warmFactor = Math.min(1, elapsed / WARMUP_MS)
  const baseTemp = 40 + warmFactor * 45 // 40°C cold -> ~85°C at temperature

  const lapMs = Math.round(lapT)
  const deltaMs = Math.round(Math.sin(now / 4000) * 1800) // gentle random walk ±1.8s

  return {
    game: 'demo', gameDisplayName: 'Demo',
    throttle, brake, clutch: 0,
    gear, rpm, maxRpm: 8000,
    speed, steerAngle: Math.sin(lapProgress * Math.PI * 2 * 3) * 0.6,
    gLat: Math.sin(lapProgress * Math.PI * 2 * 3) * 1.6,
    gLon: brakingZone ? -1.3 : throttle * 0.7,
    gVert: 0,
    fuel: Math.max(2, 60 - lapProgress * 1.5), maxFuel: 100, fuelPerLap: 2.8,
    brakeBias: 0.62, tc: brakingZone ? 0 : Math.random() * 0.08, abs: brakingZone ? Math.random() * 0.35 : 0,
    pitLimiter: false, drs: false,
    tyrePressure: [27.5, 27.5, 27.2, 27.2],
    tyreTemp: [baseTemp, baseTemp, baseTemp - 2, baseTemp - 2],
    tyreTempI: [baseTemp + 3, baseTemp + 3, baseTemp + 1, baseTemp + 1],
    tyreTempM: [baseTemp, baseTemp, baseTemp - 1, baseTemp - 1],
    tyreTempO: [baseTemp - 4, baseTemp - 4, baseTemp - 5, baseTemp - 5],
    tyreWear: [0.02, 0.02, 0.015, 0.015].map(w => w + warmFactor * 0.03),
    tyreSlip: [0.08, 0.08, 0.1, 0.1],
    suspensionTravel: [0.03, 0.03, 0.035, 0.035],
    wheelLoad: [3000, 3000, 2800, 2800],
    carDamage: [0, 0, 0, 0, 0],
    status: 'LIVE', session: 'PRACTICE',
    currentLapMs: lapMs, lastLapMs: 92450, bestLapMs: 91200,
    currentLapTime: formatMs(lapMs), lastLapTime: '1:32.450', bestLapTime: '1:31.200',
    deltaMs,
    sector: lapProgress < 0.33 ? 0 : lapProgress < 0.66 ? 1 : 2,
    completedLaps: Math.floor(elapsed / LAP_CYCLE_MS),
    position: 1, isInPit: false, isInPitLane: false, flag: 0,
    sessionTimeLeft: 1800,
    carModel: 'ks_toyota_ae86', track: 'shuto_revival_project_beta', tyreCompound: 'Street',
    maxPower: 130, maxTorque: 150, trackLength: 4200,
  }
}
