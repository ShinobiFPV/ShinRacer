// AC Rally shared-memory telemetry source.
//
// The Phase 13 spec assumed AC Rally's struct is "AC1-compatible with minor
// additions" and told this class to extend AC1Source. A targeted web search
// turned up a specific, more useful claim instead: AC Rally shares ACC's
// exact memory layout for physics and static info (both are the newer,
// post-AC1 Kunos engine — AC1 is the older codebase ACC/Rally/Evo all moved
// on from), not AC1's. That's a single search-result claim, not a struct
// dump the way ACC's and AC Evo's offsets below were verified against real
// reference source code — so it's a judgment call, not a certainty — but
// it's better-grounded than the spec's own unverified AC1-compatibility
// assumption, so this extends ACCSource instead. If rally-specific telemetry
// looks wrong in testing, reverting to AC1Source as the base is the first
// thing to try.
//
// The rally-specific additions (handbrake, surfaceGrip, rallyStageTime,
// rallyPenaltyTime, distanceToFinish) have no confirmed offsets anywhere —
// appended here immediately after ACC's own known physics struct end
// (712 bytes, see acc.js) as a best guess. TODO: verify all five in-game;
// these are placeholders until a real AC Rally session confirms or refutes them.
const { ACCSource } = require('./acc')

class ACRallySource extends ACCSource {
  parsePhysics(buf) {
    const base = super.parsePhysics(buf)
    return {
      ...base,
      // TODO: unconfirmed offsets — verify against a real AC Rally session.
      handbrake: buf.length > 715 ? buf.readFloatLE(712) : null,
      surfaceGrip: buf.length > 719 ? buf.readFloatLE(716) : null,
      rallyStageTime: buf.length > 723 ? buf.readFloatLE(720) : null,
      rallyPenaltyTime: buf.length > 727 ? buf.readFloatLE(724) : null,
      distanceToFinish: buf.length > 731 ? buf.readFloatLE(728) : null,
    }
  }

  static async probe() {
    return ACCSource.probe()
  }
}

module.exports = { ACRallySource }
