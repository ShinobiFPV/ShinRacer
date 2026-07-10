// Maps every game's raw telemetry shape into one canonical TelemetryFrame so
// the renderer (widgets, TelemetryView, the PWA's Cluster page) never needs
// to know which game is actually running. Fields a given game doesn't expose
// are set to `null`, never `0` — 0 is a valid real value for many of these
// (fuel, wear, boost, gap...) and widgets are expected to distinguish "no
// data" from "genuinely zero" by checking for null specifically (see
// CLAUDE.md's Phase 13 constraints).

// Raw gear is the AC-family's own convention (0=R, 1=N, 2=1st…), and Forza's
// Gear byte uses the identical encoding — shared here rather than duplicated
// per normalizer.
function niceGear(raw) {
  if (raw == null) return null
  if (raw === 0) return -1
  if (raw === 1) return 0
  return raw - 1
}

function formatMs(ms) {
  if (ms == null || !isFinite(ms)) return '-:--.---'
  const clamped = Math.max(0, ms)
  const m = Math.floor(clamped / 60000)
  const s = Math.floor((clamped % 60000) / 1000)
  const msec = Math.floor(clamped % 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(msec).padStart(3, '0')}`
}

// Every NEW-in-Phase-13 field, defaulted to null. Existing Phase 9 fields are
// NOT included here — each normalizeX() below still sets those directly, the
// same way buildTelemetryFrame always did, so nothing already working
// changes shape. Called fresh per frame (not a shared constant) since a
// couple of these are arrays/objects and must never be a shared reference
// two frames could both end up pointing at.
function nullExtendedFields() {
  return {
    rainIntensity: null, trackGripStatus: null, windSpeed: null, windDirection: null,
    brakeTemp: [null, null, null, null], padLife: [null, null, null, null], discLife: [null, null, null, null],
    ersRecoveryLevel: null, ersPowerLevel: null, ersIsCharging: null, kersCurrentKJ: null, kersMaxKJ: null,
    turboBoost: null,
    frontTyreCompound: null, rearTyreCompound: null,
    mfdTyreSet: null, mfdFuelToAdd: null,
    mfdTyrePressureFL: null, mfdTyrePressureFR: null, mfdTyrePressureRL: null, mfdTyrePressureRR: null,
    isValidLap: null,
    gapAhead: null, gapBehind: null, predictedLapTime: null,
    power: null, torque: null, boost: null, handbrake: null,
    carClass: null, carPerformanceIndex: null, drivetrainType: null,
    tireSlipAngle: [null, null, null, null], tireCombinedSlip: [null, null, null, null],
    worldPosition: { x: null, y: null, z: null },
    rallyStageTime: null, rallyPenaltyTime: null, distanceToFinish: null,
    parseError: false,
    // Phase 15 additions (F1 25 / AMS2) — null-defaulted here so every
    // existing normalizer keeps working unchanged and the two new ones don't
    // each have to null out fields the other game doesn't expose.
    ersDeployMode: null, enginePowerICE: null, enginePowerMGUK: null,
    weatherCondition: null, airTemp: null, trackTemp: null,
    boostActive: null, boostAmount: null,
  }
}

function normalizeAC1(p, g, s) {
  return {
    game: 'ac1', gameDisplayName: 'AC1',
    ...nullExtendedFields(),
    throttle: p.gas, brake: p.brake, clutch: 0,
    gear: niceGear(p.gear), rpm: p.rpms, maxRpm: s.maxRpm || 8000,
    speed: p.speedKmh, steerAngle: p.steerAngle,
    gLat: p.accG?.[0] ?? 0, gLon: p.accG?.[1] ?? 0, gVert: p.accG?.[2] ?? 0,
    fuel: p.fuel, maxFuel: s.maxFuel || 0, fuelPerLap: g.fuelXLap,
    brakeBias: p.brakeBias, tc: p.tc, abs: p.abs,
    pitLimiter: !!p.pitLimiterOn, drs: !!p.drs,
    tyrePressure: p.wheelsPressure, tyreTemp: p.tyreCoreTemp,
    tyreTempI: p.tyreTempI, tyreTempM: p.tyreTempM, tyreTempO: p.tyreTempO,
    tyreWear: p.tyreWear, tyreSlip: p.wheelSlip,
    suspensionTravel: p.suspensionTravel, wheelLoad: p.wheelLoad,
    carDamage: p.carDamage,
    status: g.status, session: g.session,
    currentLapMs: g.iCurrentTime, lastLapMs: g.iLastTime, bestLapMs: g.iBestTime,
    currentLapTime: g.currentTime, lastLapTime: g.lastTime, bestLapTime: g.bestTime,
    deltaMs: g.iBestTime > 0 ? g.iCurrentTime - g.iBestTime : 0,
    sector: g.currentSectorIndex, completedLaps: g.completedLaps, position: g.position,
    isInPit: !!g.isInPit, isInPitLane: !!g.isInPitLane, flag: g.flag,
    sessionTimeLeft: g.sessionTimeLeft,
    carModel: s.carModel, track: s.track, tyreCompound: g.tyreCompound,
    maxPower: s.maxPower, maxTorque: s.maxTorque, trackLength: s.trackSPlineLength,
  }
}

function normalizeACC(p, g, s) {
  const base = normalizeAC1(p, g, s)
  return {
    ...base,
    game: 'acc', gameDisplayName: 'ACC',
    drs: !!p.drsEnabled,
    trackGripStatus: g.trackGripStatus ?? null,
    windSpeed: g.windSpeed ?? null,
    windDirection: g.windDirection ?? null,
    brakeTemp: p.brakeTemp ?? [null, null, null, null],
    // Not present in the verified ACC reference struct — see acc.js's header
    // comment. Cross-referencing AC Evo's real struct suggests the spec
    // conflated the two games here.
    padLife: [null, null, null, null], discLife: [null, null, null, null],
    ersRecoveryLevel: p.ersRecoveryLevel ?? null,
    ersPowerLevel: p.ersPowerLevel ?? null,
    ersIsCharging: p.ersIsCharging != null ? !!p.ersIsCharging : null,
    kersCurrentKJ: p.kersCurrentKJ ?? null,
    kersMaxKJ: null, // not exposed by ACC's real struct either
    turboBoost: p.turboBoost ?? null,
    currentLapMs: g.iCurrentTime, lastLapMs: g.iLastTime, bestLapMs: g.iBestTime,
    deltaMs: g.iBestTime > 0 ? g.iCurrentTime - g.iBestTime : 0,
    sector: g.currentSectorIndex, completedLaps: g.completedLaps, position: g.position,
    isInPit: !!g.isInPit, isInPitLane: !!g.isInPitLane, flag: g.flag,
    sessionTimeLeft: g.sessionTimeLeft,
    tyreCompound: g.tyreCompound,
    // Not present in the verified reference — see acc.js.
    rainIntensity: null, isValidLap: null,
    mfdTyreSet: null, mfdFuelToAdd: null,
    mfdTyrePressureFL: null, mfdTyrePressureFR: null, mfdTyrePressureRL: null, mfdTyrePressureRR: null,
  }
}

function normalizeACRally(p, g, s) {
  const base = normalizeACC(p, g, s)
  return {
    ...base,
    game: 'acrally', gameDisplayName: 'AC Rally',
    // TODO: unconfirmed offsets (see acRally.js) — null until verified in-game.
    handbrake: p.handbrake ?? null,
    // Rally's own per-moment road-surface-condition reading, distinct from
    // ACC's session-wide SurfaceGrip (already mapped to trackGripStatus by
    // normalizeACC above) — there's no separate canonical slot for both, so
    // this overrides it when present since it's the more specific reading.
    trackGripStatus: p.surfaceGrip ?? base.trackGripStatus,
    rallyStageTime: p.rallyStageTime ?? null,
    rallyPenaltyTime: p.rallyPenaltyTime ?? null,
    distanceToFinish: p.distanceToFinish ?? null,
  }
}

function normalizeACEvo(p, g, s) {
  const currentLapMs = g.currentLapMs ?? null
  const bestLapMs = g.bestLapMs ?? null
  return {
    game: 'acevo', gameDisplayName: 'AC Evo',
    ...nullExtendedFields(),
    throttle: p.gas ?? 0, brake: p.brake ?? 0, clutch: p.clutch ?? 0,
    gear: niceGear(p.gear), rpm: p.rpms ?? 0, maxRpm: 8000, // not exposed anywhere in the real struct — see acEvo.js
    speed: p.speedKmh ?? 0, steerAngle: p.steerAngle ?? 0,
    gLat: p.accG?.[0] ?? 0, gLon: p.accG?.[1] ?? 0, gVert: p.accG?.[2] ?? 0,
    fuel: p.fuel ?? 0, maxFuel: g.maxFuel ?? 0, fuelPerLap: g.fuelPerLap ?? null,
    brakeBias: p.brakeBias ?? 0, tc: p.tc ?? 0, abs: p.abs ?? 0,
    pitLimiter: !!p.pitLimiterOn, drs: !!p.drs,
    tyrePressure: p.wheelsPressure ?? [null, null, null, null],
    tyreTemp: p.tyreCoreTemp ?? [null, null, null, null],
    tyreTempI: p.tyreTempI ?? [null, null, null, null],
    tyreTempM: p.tyreTempM ?? [null, null, null, null],
    tyreTempO: p.tyreTempO ?? [null, null, null, null],
    tyreWear: p.tyreWear ?? [null, null, null, null], tyreSlip: p.wheelSlip ?? [null, null, null, null],
    suspensionTravel: p.suspensionTravel ?? [null, null, null, null], wheelLoad: p.wheelLoad ?? [null, null, null, null],
    carDamage: p.carDamage ?? [null, null, null, null, null],
    status: (g.status ?? 0) === 2 ? 'LIVE' : (g.status === 1 ? 'REPLAY' : (g.status === 3 ? 'PAUSE' : 'OFF')),
    session: null, // ACEVO_SESSION_TYPE lives on the static struct, not surfaced in this pass
    currentLapMs, lastLapMs: g.lastLapMs ?? null, bestLapMs,
    currentLapTime: formatMs(currentLapMs), lastLapTime: formatMs(g.lastLapMs), bestLapTime: formatMs(bestLapMs),
    deltaMs: g.deltaTimeMs ?? (bestLapMs > 0 && currentLapMs != null ? currentLapMs - bestLapMs : 0),
    sector: null, // no sector-index field found in the real struct
    completedLaps: g.completedLaps ?? 0, position: g.position ?? 0,
    isInPit: !!g.isInPit, isInPitLane: !!g.isInPitLane, flag: g.flag ?? 0,
    sessionTimeLeft: g.sessionTimeLeftMs != null ? g.sessionTimeLeftMs / 1000 : null,
    carModel: g.carModel ?? s.track ?? null, track: s.track ?? null, tyreCompound: null,
    maxPower: null, maxTorque: null, trackLength: s.trackLength ?? null,
    // Phase 13 additions this game actually exposes:
    turboBoost: p.turboBoost ?? null,
    ersRecoveryLevel: p.ersRecoveryLevel ?? null, ersPowerLevel: p.ersPowerLevel ?? null,
    ersIsCharging: p.ersIsCharging != null ? !!p.ersIsCharging : null,
    kersCurrentKJ: p.kersCurrentKJ ?? null, kersMaxKJ: null,
    brakeTemp: p.brakeTemp ?? [null, null, null, null],
    padLife: p.padLife ?? [null, null, null, null], discLife: p.discLife ?? [null, null, null, null],
    isValidLap: g.isValidLap != null ? !!g.isValidLap : null,
    gapAhead: g.gapAhead ?? null, gapBehind: g.gapBehind ?? null,
    predictedLapTime: g.predictedLapTimeMs ?? null,
    // No rainIntensity field exists in the real struct (only `rain_lights`,
    // a physical light on the car) — left null rather than invented.
    rainIntensity: null,
    parseError: !!(p.parseError || g.parseError || s.parseError),
  }
}

// version: 'fh5' | 'fh6'. Both share bytes 0-231; FH6 inserts 12 bytes
// (CarGroup/SmashableVelDiff/SmashableMass) right after NumCylinders, so
// every field from PositionX onward is read at (its FH5 offset + shift).
function normalizeForza(buf, version) {
  const shift = version === 'fh6' ? 12 : 0
  const at = (fh5Offset) => fh5Offset + shift

  const isRaceOn = buf.readFloatLE(0) >= 1
  const accelX = buf.readFloatLE(20), accelY = buf.readFloatLE(24), accelZ = buf.readFloatLE(28)
  const gForce = 9.80665

  const gearRaw = buf.readUInt8(at(307))
  const currentLapS = buf.readFloatLE(at(292))
  const bestLapS = buf.readFloatLE(at(284))
  const lastLapS = buf.readFloatLE(at(288))
  const currentLapMs = Math.round(currentLapS * 1000)
  const bestLapMs = Math.round(bestLapS * 1000)
  const lastLapMs = Math.round(lastLapS * 1000)

  return {
    game: version, gameDisplayName: version === 'fh6' ? 'FH6' : 'FH5',
    ...nullExtendedFields(),
    throttle: buf.readUInt8(at(303)) / 255, brake: buf.readUInt8(at(304)) / 255,
    clutch: buf.readUInt8(at(305)) / 255, handbrake: buf.readUInt8(at(306)) / 255,
    gear: niceGear(gearRaw), rpm: buf.readFloatLE(16), maxRpm: buf.readFloatLE(8),
    // World-space m/s -> the km/h every widget assumes (SpeedGauge scales to 300).
    speed: buf.readFloatLE(at(244)) * 3.6,
    steerAngle: buf.readInt8(at(308)) / 127,
    // Forza's engine axes (X=right, Y=up, Z=forward — the commonly-cited
    // community convention for this packet, not independently re-derived)
    // mapped onto the same lateral/longitudinal/vertical G convention AC's
    // own accG uses, and converted from m/s² to G.
    gLat: accelX / gForce, gLon: accelZ / gForce, gVert: accelY / gForce,
    // Already a 0-1 fraction, not litres — see FuelBar's Forza-specific
    // handling in components/telemetry/widgets.jsx. maxFuel stays null since
    // Forza never gives an absolute tank size, only this fraction.
    fuel: buf.readFloatLE(276), maxFuel: null, fuelPerLap: null,
    brakeBias: null, tc: null, abs: null, pitLimiter: null, drs: null,
    tyrePressure: [null, null, null, null],
    tyreTemp: [buf.readFloatLE(at(256)), buf.readFloatLE(at(260)), buf.readFloatLE(at(264)), buf.readFloatLE(at(268))],
    tyreTempI: [null, null, null, null], tyreTempM: [null, null, null, null], tyreTempO: [null, null, null, null],
    tyreWear: [null, null, null, null],
    tyreSlip: [buf.readFloatLE(84), buf.readFloatLE(88), buf.readFloatLE(92), buf.readFloatLE(96)],
    suspensionTravel: [buf.readFloatLE(at(196)), buf.readFloatLE(at(200)), buf.readFloatLE(at(204)), buf.readFloatLE(at(208))],
    wheelLoad: [null, null, null, null], carDamage: [null, null, null, null, null],
    status: isRaceOn ? 'LIVE' : 'OFF', session: null,
    currentLapMs, lastLapMs, bestLapMs,
    currentLapTime: formatMs(currentLapMs), lastLapTime: formatMs(lastLapMs), bestLapTime: formatMs(bestLapMs),
    deltaMs: bestLapMs > 0 ? currentLapMs - bestLapMs : 0,
    sector: null,
    completedLaps: buf.readUInt16LE(at(300)), position: buf.readUInt8(at(302)),
    isInPit: null, isInPitLane: null, flag: null, sessionTimeLeft: null,
    carModel: null, track: null, tyreCompound: null,
    maxPower: null, maxTorque: null, trackLength: null,
    // Forza-specific additions:
    power: buf.readFloatLE(at(248)), torque: buf.readFloatLE(at(252)),
    boost: buf.readFloatLE(at(272)),
    carClass: buf.readInt32LE(216), carPerformanceIndex: buf.readInt32LE(220),
    drivetrainType: buf.readInt32LE(224),
    tireSlipAngle: [buf.readFloatLE(164), buf.readFloatLE(168), buf.readFloatLE(172), buf.readFloatLE(176)],
    tireCombinedSlip: [buf.readFloatLE(180), buf.readFloatLE(184), buf.readFloatLE(188), buf.readFloatLE(192)],
    worldPosition: { x: buf.readFloatLE(at(232)), y: buf.readFloatLE(at(236)), z: buf.readFloatLE(at(240)) },
  }
}

// ── F1 25 ────────────────────────────────────────────────────────────────
// Tyre compound IDs are the stable, publicly-documented EA/Codemasters
// actualTyreCompound enum (F1 modern compounds 16-20, F2's own 7-12 range).
// The F2 9-12 sub-range's exact Hard/Medium/Soft/Wet assignment isn't spelled
// out anywhere the brief cited — this is a reasonable best-effort ordering,
// not independently confirmed.
const F1_TYRE_COMPOUNDS = {
  16: 'Hard', 17: 'Medium', 18: 'Soft', 19: 'Inter', 20: 'Wet',
  7: 'Inter', 8: 'Wet', 9: 'Hard', 10: 'Medium', 11: 'Soft', 12: 'Wet',
}
function mapF1TyreCompound(id) {
  if (id == null) return null
  return F1_TYRE_COMPOUNDS[id] || `Compound ${id}`
}

// sessionType isn't in the brief's own field-by-field canonical-frame
// mapping, but StatusBar's existing "Session" readout expects a display
// string every other game already provides (session: 'RACE' etc. for AC1) —
// added so F1 25 doesn't regress that widget to a permanent "UNKNOWN".
const F1_SESSION_TYPES = {
  1: 'PRACTICE 1', 2: 'PRACTICE 2', 3: 'PRACTICE 3', 4: 'SHORT PRACTICE',
  5: 'QUALIFYING 1', 6: 'QUALIFYING 2', 7: 'QUALIFYING 3', 8: 'SHORT QUALIFYING', 9: 'ONE-SHOT QUALIFYING',
  10: 'RACE', 11: 'RACE 2', 12: 'RACE 3', 13: 'TIME TRIAL',
}
function mapF1SessionType(id) { return id == null ? null : (F1_SESSION_TYPES[id] || null) }

// Track IDs 0-32 — the stable, publicly-documented EA/Codemasters trackId
// enum, covering every circuit through the current F1 25 calendar (more than
// the brief's own "minimum 24" ask). -1 = unknown. TODO: extend if a future
// season adds a track ID beyond 32.
const F1_TRACKS = {
  0: 'Melbourne', 1: 'Paul Ricard', 2: 'Shanghai', 3: 'Sakhir (Bahrain)', 4: 'Catalunya',
  5: 'Monaco', 6: 'Montreal', 7: 'Silverstone', 8: 'Hockenheim', 9: 'Hungaroring',
  10: 'Spa', 11: 'Monza', 12: 'Singapore', 13: 'Suzuka', 14: 'Abu Dhabi',
  15: 'Texas (COTA)', 16: 'Brazil (Interlagos)', 17: 'Austria', 18: 'Sochi', 19: 'Mexico',
  20: 'Baku', 21: 'Sakhir Short', 22: 'Silverstone Short', 23: 'Texas Short', 24: 'Suzuka Short',
  25: 'Hanoi', 26: 'Zandvoort', 27: 'Imola', 28: 'Portimão', 29: 'Jeddah',
  30: 'Miami', 31: 'Las Vegas', 32: 'Losail (Qatar)',
}
function mapF1Track(id) {
  if (id == null || id < 0) return null
  return F1_TRACKS[id] || `Track ${id}`
}

function normalizeF125(motion, session, lapData, telemetry, status, damage) {
  const currentLapMs = lapData?.currentLapTimeInMS ?? null
  const lastLapMs = lapData?.lastLapTimeInMS ?? null
  return {
    game: 'f125', gameDisplayName: 'F1 25',
    ...nullExtendedFields(),
    throttle: telemetry?.throttle ?? null, brake: telemetry?.brake ?? null,
    clutch: telemetry ? telemetry.clutch / 100 : null,
    gear: telemetry?.gear ?? null, rpm: telemetry?.engineRPM ?? null, maxRpm: status?.maxRPM ?? null,
    speed: telemetry?.speed ?? null, steerAngle: telemetry?.steer ?? null,
    drs: telemetry ? telemetry.drs === 1 : null,
    pitLimiter: status ? status.pitLimiterStatus === 1 : null,
    fuel: status?.fuelInTank ?? null, maxFuel: status?.fuelCapacity ?? null, // kg, not litres
    tyrePressure: telemetry?.tyresPressure ?? [null, null, null, null],
    tyreTemp: telemetry?.tyresSurfaceTemperature ?? [null, null, null, null],
    tyreTempI: telemetry?.tyresInnerTemperature ?? [null, null, null, null],
    tyreWear: damage ? damage.tyresWear.map(w => w / 100) : [null, null, null, null],
    brakeTemp: telemetry?.brakesTemperature ?? [null, null, null, null],
    carDamage: damage ? [
      damage.frontLeftWingDamage / 100, damage.frontRightWingDamage / 100,
      damage.rearWingDamage / 100, damage.floorDamage / 100, damage.engineDamage / 100,
    ] : [null, null, null, null, null],
    gLat: motion?.gForceLateral ?? null, gLon: motion?.gForceLongitudinal ?? null, gVert: motion?.gForceVertical ?? null,
    worldPosition: motion ? { x: motion.worldPositionX, y: motion.worldPositionY, z: motion.worldPositionZ } : { x: null, y: null, z: null },
    currentLapMs, lastLapMs, bestLapMs: null, // not exposed directly via UDP
    currentLapTime: formatMs(currentLapMs), lastLapTime: formatMs(lastLapMs), bestLapTime: formatMs(null),
    deltaMs: null, // not directly available
    sector: lapData?.sector ?? null, completedLaps: lapData?.currentLapNum ?? null, position: lapData?.carPosition ?? null,
    isInPit: lapData ? lapData.pitStatus > 0 : null,
    isValidLap: lapData ? lapData.currentLapInvalid === 0 : null,
    sessionTimeLeft: session?.sessionTimeLeft ?? null,
    session: mapF1SessionType(session?.sessionType),
    carModel: null, track: mapF1Track(session?.trackId), trackLength: session?.trackLength ?? null,
    maxPower: null, maxTorque: null,
    ersStoreEnergy: status?.ersStoreEnergy ?? null,
    ersDeployMode: status?.ersDeployMode ?? null,
    enginePowerICE: status?.enginePowerICE ?? null,
    enginePowerMGUK: status?.enginePowerMGUK ?? null,
    weatherCondition: session?.weather ?? null,
    airTemp: session?.airTemperature ?? null, trackTemp: session?.trackTemperature ?? null,
    tyreCompound: status ? mapF1TyreCompound(status.actualTyreCompound) : null,
  }
}

// ── Automobilista 2 ──────────────────────────────────────────────────────
// See sources/ams2.js's header comment: unlike every other normalizer here,
// the raw field offsets feeding this one are unverified best-effort
// estimates, not confirmed against a real packet capture or SDK header.
function normalizeAMS2(telemetry, gameState, timing) {
  const currentLapMs = timing ? Math.round(timing.mCurrentTime * 1000) : null
  const lastLapMs = timing && timing.mLastLapTime > 0 ? Math.round(timing.mLastLapTime * 1000) : null
  const bestLapMs = timing && timing.mBestLapTime > 0 ? Math.round(timing.mBestLapTime * 1000) : null
  return {
    game: 'ams2', gameDisplayName: 'Automobilista 2',
    ...nullExtendedFields(),
    speed: telemetry ? telemetry.mSpeed * 3.6 : null, // m/s -> km/h
    throttle: telemetry?.mThrottle ?? null, brake: telemetry?.mBrake ?? null, clutch: telemetry?.mClutch ?? null,
    gear: telemetry ? telemetry.mGear - 1 : null, // AMS2: 0=R,1=N,2=1st -> -1/0/1
    rpm: telemetry?.mRpm ?? null, maxRpm: telemetry?.mMaxRpm ?? null, steerAngle: telemetry?.mSteering ?? null,
    gLat: telemetry ? telemetry.mLocalAcceleration[0] / 9.81 : null,
    gVert: telemetry ? telemetry.mLocalAcceleration[1] / 9.81 : null,
    gLon: telemetry ? telemetry.mLocalAcceleration[2] / 9.81 : null,
    fuel: telemetry ? telemetry.mFuelLevel * telemetry.mFuelCapacity : null, // litres
    maxFuel: telemetry?.mFuelCapacity ?? null,
    tyrePressure: telemetry?.mAirPressure ?? [null, null, null, null],
    tyreTemp: telemetry?.mTyreTemp ?? [null, null, null, null],
    tyreTempI: telemetry?.mTyreInternalAirTemp ?? [null, null, null, null],
    tyreWear: telemetry?.mTyreWear ?? [null, null, null, null],
    brakeTemp: telemetry?.mBrakeTempCelsius ?? [null, null, null, null],
    suspensionTravel: telemetry?.mSuspensionTravel ?? [null, null, null, null],
    carDamage: telemetry ? [
      telemetry.mAeroDamage, telemetry.mEngineDamage,
      (telemetry.mBrakeDamage?.[0] ?? 0) / 100, (telemetry.mSuspensionDamage?.[0] ?? 0) / 100, 0,
    ] : [null, null, null, null, null],
    isInPit: telemetry ? telemetry.mPitMode > 0 : null,
    carModel: null, track: gameState?.mTrackLocation ?? null, trackLength: gameState?.mTrackLength ?? null,
    maxPower: null, maxTorque: null,
    sessionTimeLeft: gameState?.mEventTimeRemaining ?? null,
    currentLapMs, lastLapMs, bestLapMs,
    currentLapTime: formatMs(currentLapMs), lastLapTime: formatMs(lastLapMs), bestLapTime: formatMs(bestLapMs),
    deltaMs: bestLapMs > 0 && currentLapMs != null ? currentLapMs - bestLapMs : null,
    rainIntensity: gameState?.mRainDensity != null ? Math.round(gameState.mRainDensity * 3) : null,
    windSpeed: gameState?.mWindSpeed ?? null,
    trackTemp: gameState?.mTrackTemperature ?? null, airTemp: gameState?.mAmbientTemperature ?? null,
    boostActive: telemetry ? telemetry.mBoostActive === 1 : null,
    boostAmount: telemetry?.mBoostAmount ?? null,
  }
}

module.exports = {
  normalizeAC1, normalizeACC, normalizeACEvo, normalizeACRally, normalizeForza,
  normalizeF125, normalizeAMS2, niceGear, formatMs,
}
