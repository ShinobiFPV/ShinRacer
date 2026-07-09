// ACC (Assetto Corsa Competizione) shared-memory telemetry source.
//
// Uses the SAME shared-memory segment names as AC1 (Local\acpmf_physics/
// graphics/static — see ac1.js), so this extends AC1Source purely for its
// start/stop/reader-process plumbing (same PowerShell reader, same segment
// prefix). parsePhysics/parseGraphics are fully overridden rather than
// extended, because ACC's real struct layout diverges from AC1's
// field-for-field, not just "AC1 fields plus some extra ones tacked on the
// end" the way the Phase 13 spec's own offset table assumed — verified
// against a real, actively-used reference implementation (see below), not
// guessed.
//
// Byte offsets below were computed by walking the field list from
// github.com/Dekadee/accshm (a working Go library that reads real ACC shared
// memory) in declared order, summing each field's size — not eyeballed, and
// not the spec's own "~offset, verify against SDK" placeholders. That source
// does NOT include several fields the spec expected ACC to have —
// waterTemp, frontBrakeCompound/rearBrakeCompound, padLife/discLife,
// rainIntensity, mfdTyreSet/mfdFuelToAdd/mfdTyrePressure*, isValidLap — and
// cross-referencing a second independent source (AC Evo's real bindgen C++
// header, see acEvo.js) shows those fields belong to AC Evo's struct, not
// ACC's. The spec's "ACC additions" list appears to have conflated the two
// games (they share engine lineage). Those fields are left `null` for ACC
// with that reasoning, rather than fabricated at invented offsets.
//
// Static struct (car/track names, max power/torque/rpm/fuel) offsets are
// reused as-is from AC1Source — no ACC-specific offsets were found in the
// same reference, and the spec itself didn't call out static-struct
// differences for ACC. Flagged here as an assumption, not a verified fact:
// if car/track names or max-power/rpm figures look wrong for ACC, this is
// the first place to check.
const { AC1Source, readWChar, readFloatArray } = require('./ac1')

const GRAPHICS_STATUS = { 0: 'OFF', 1: 'REPLAY', 2: 'LIVE', 3: 'PAUSE' }
const GRAPHICS_SESSION = { 0: 'UNKNOWN', 1: 'PRACTICE', 2: 'QUALIFY', 3: 'RACE' }

class ACCSource extends AC1Source {
  parsePhysics(buf) {
    return {
      gas: buf.readFloatLE(4),
      brake: buf.readFloatLE(8),
      fuel: buf.readFloatLE(12),
      gear: buf.readInt32LE(16),
      rpms: buf.readFloatLE(20),
      steerAngle: buf.readFloatLE(24),
      speedKmh: buf.readFloatLE(28),
      accG: readFloatArray(buf, 44, 3),
      wheelSlip: readFloatArray(buf, 56, 4),
      wheelLoad: readFloatArray(buf, 72, 4),
      wheelsPressure: readFloatArray(buf, 88, 4),
      tyreWear: readFloatArray(buf, 120, 4),
      tyreCoreTemp: readFloatArray(buf, 152, 4),
      suspensionTravel: readFloatArray(buf, 184, 4),
      drs: buf.readFloatLE(200),
      tc: buf.readFloatLE(204),
      carDamage: readFloatArray(buf, 224, 5),
      pitLimiterOn: buf.readInt32LE(248),
      abs: buf.readFloatLE(252),
      turboBoost: buf.readFloatLE(276),
      ersRecoveryLevel: buf.readInt32LE(320),
      ersPowerLevel: buf.readInt32LE(324),
      ersHeatCharging: buf.readInt32LE(328),
      ersIsCharging: buf.readInt32LE(332),
      kersCurrentKJ: buf.readFloatLE(336),
      drsAvailable: buf.readInt32LE(340),
      drsEnabled: buf.readInt32LE(344),
      brakeTemp: readFloatArray(buf, 348, 4),
      tyreTempI: readFloatArray(buf, 368, 4),
      tyreTempM: readFloatArray(buf, 384, 4),
      tyreTempO: readFloatArray(buf, 400, 4),
      brakeBias: buf.readFloatLE(564),
      // Not present in the verified accshm reference struct — see file header.
      waterTemp: null, kersMaxKJ: null, frontBrakeCompound: null, rearBrakeCompound: null,
      padLife: null, discLife: null,
    }
  }

  parseGraphics(buf) {
    return {
      status: GRAPHICS_STATUS[buf.readInt32LE(4)] || 'OFF',
      session: GRAPHICS_SESSION[buf.readInt32LE(8)] || 'UNKNOWN',
      // ACC's time-string fields are char[15] (30 bytes as UTF-16), not
      // AC1's char[100] — using the wrong length here would read past the
      // real field into whatever comes next.
      currentTime: readWChar(buf, 12, 30),
      lastTime: readWChar(buf, 42, 30),
      bestTime: readWChar(buf, 72, 30),
      completedLaps: buf.readInt32LE(132),
      position: buf.readInt32LE(136),
      iCurrentTime: buf.readInt32LE(140),
      iLastTime: buf.readInt32LE(144),
      iBestTime: buf.readInt32LE(148),
      sessionTimeLeft: buf.readFloatLE(152),
      isInPit: buf.readInt32LE(160),
      currentSectorIndex: buf.readInt32LE(164),
      lastSectorTime: buf.readInt32LE(168),
      numberOfLaps: buf.readInt32LE(172),
      tyreCompound: readWChar(buf, 176, 66),
      flag: buf.readInt32LE(1222),
      isInPitLane: buf.readInt32LE(1234),
      trackGripStatus: buf.readFloatLE(1238),
      windSpeed: buf.readFloatLE(1246),
      windDirection: buf.readFloatLE(1250),
      fuelXLap: buf.readInt32LE(1282),
      // Not present in the verified accshm reference struct — see file header.
      rainIntensity: null, isValidLap: null,
      mfdTyreSet: null, mfdFuelToAdd: null, mfdTyrePressure: null,
    }
  }

  static async probe() {
    return AC1Source.probe()
  }
}

module.exports = { ACCSource }
