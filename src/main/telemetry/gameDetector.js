// Detects which supported sim/game is currently running.
//
// This module only answers "what's running right now" — it's a stateless,
// one-shot `detect()`. The polling cadence (5s idle / 30s once a game is
// found), game:detected/game:lost emission, and demo-mode fallback all live
// in index.js's TelemetryManager, which is the thing that actually knows
// whether it's currently idle or has an active source — a cleaner split
// than putting scheduling inside the detector itself.
const { execSync } = require('child_process')
const { AC1Source } = require('./sources/ac1')
const { ACEvoSource } = require('./sources/acEvo')
const { ForzaSource } = require('./sources/forza')
const { F125Source } = require('./sources/f125')
const { AMS2Source } = require('./sources/ams2')

// Process names used for detection. These are best-effort assumptions the
// Phase 13 spec explicitly asked to be flagged as unverified — check the
// real process name in Task Manager's "Details" tab (Steam/Epic/Xbox builds
// of the same game can differ) and edit this object directly if a game
// isn't being detected. This is the one place process-name detection reads
// from.
const EXE_NAMES = {
  ac1: 'acs.exe',
  acc: 'AC2.exe',
  acevo: 'ACEvo.exe',
  acrally: 'ACRally.exe',
  fh5: 'ForzaHorizon5.exe',
  fh6: 'ForzaHorizon6.exe',
  f125: 'F1_25.exe', // TODO: exact exe name unconfirmed — check Task Manager's Details tab against a real install
  ams2: 'AMS2AVX.exe', // TODO: exact exe name unconfirmed — same caveat
}
// Alternate exe names some builds/storefronts may use — checked in addition
// to EXE_NAMES above, not instead of. Both are TODOs per the brief.
const ALT_EXE_NAMES = {
  f125: 'F125.exe',
  ams2: 'Automobilista2.exe',
}

// tasklist's CSV output is double-quoted per field: "Image Name","PID","Session Name",...
function getRunningProcessNames() {
  try {
    const out = execSync('tasklist /FI "STATUS eq RUNNING" /FO CSV /NH', {
      windowsHide: true, timeout: 5000, encoding: 'utf8',
    })
    const names = new Set()
    for (const line of out.split(/\r?\n/)) {
      const match = /^"([^"]+)"/.exec(line)
      if (match) names.add(match[1].toLowerCase())
    }
    return names
  } catch (e) {
    return new Set()
  }
}

function processRunning(names, exeKey) {
  if (names.has((EXE_NAMES[exeKey] || '').toLowerCase())) return true
  const alt = ALT_EXE_NAMES[exeKey]
  return !!alt && names.has(alt.toLowerCase())
}

// Order matters here: AC Evo's exe is checked before AC Rally/ACC/AC1 even
// though they'd never realistically run at once, and Forza/F1 25/AMS2 last
// since they're checked by process only (no UDP bind during detection — see
// forza.js's header comment on avoiding a port fight with an already-active
// source for that game).
async function detectByProcessList() {
  const names = getRunningProcessNames()
  if (processRunning(names, 'acevo')) return 'acevo'
  if (processRunning(names, 'acrally')) return 'acrally' // checked before acc/ac1 — spec: "if both somehow running, prefer ACRallySource"
  if (processRunning(names, 'acc')) return 'acc'
  if (processRunning(names, 'ac1')) return 'ac1'
  if (processRunning(names, 'fh6')) return 'fh6'
  if (processRunning(names, 'fh5')) return 'fh5'
  if (processRunning(names, 'f125')) return 'f125'
  if (processRunning(names, 'ams2')) return 'ams2'
  return null
}

// Fallback for when process-list detection finds nothing — covers a renamed
// exe or a process-name assumption above being stale. Tries the acevo_
// prefix first since it's structurally unique; Local\acpmf_* is shared by
// AC1/ACC/AC Rally, so a bare SHM probe can't tell those three apart on its
// own — re-checks the same process list snapshot to disambiguate, and only
// truly guesses (defaulting to 'ac1') if none of those three processes were
// found either.
async function detectByShmProbe() {
  const evoOpen = await ACEvoSource.probe()
  if (evoOpen) return 'acevo'

  const acpmfOpen = await AC1Source.probe()
  if (!acpmfOpen) return null

  const names = getRunningProcessNames()
  if (processRunning(names, 'acrally')) return 'acrally'
  if (processRunning(names, 'acc')) return 'acc'
  return 'ac1'
}

// Full detection pass: process list first (cheap, authoritative when the
// exe names match), shared-memory probe second (catches a renamed AC-family
// exe), then UDP activity for the three UDP-only games last (Forza, F1 25,
// AMS2 — each briefly binds its configured port and waits for one real
// packet; only worth trying if nothing else matched, since these are the
// slowest checks and the only ones that touch the network).
async function detect(forzaPort, f125Port, ams2Port) {
  const byProcess = await detectByProcessList()
  if (byProcess) return byProcess

  const byShm = await detectByShmProbe()
  if (byShm) return byShm

  const forzaVersion = await ForzaSource.probe(forzaPort, 1500)
  if (forzaVersion) return forzaVersion

  const isF125 = await F125Source.probe(f125Port, 1500)
  if (isF125) return 'f125'

  const isAMS2 = await AMS2Source.probe(ams2Port, 500)
  if (isAMS2) return 'ams2'

  return null
}

module.exports = { detect, detectByProcessList, detectByShmProbe, EXE_NAMES, getRunningProcessNames }
