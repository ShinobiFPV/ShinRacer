// AC1 (Assetto Corsa 1) shared-memory telemetry source — extracted from
// main.js's original inline Phase 9 implementation, moved here unchanged so
// Phase 13's multi-game refactor doesn't touch AC1's already-verified
// behavior. See CLAUDE.md's Phase 9 notes for the full reasoning behind the
// persistent-PowerShell-reader approach (no native addon has a prebuilt
// binary for this Node/win32 combination, same gap as better-sqlite3).
//
// Segment names: Local\acpmf_physics, Local\acpmf_graphics, Local\acpmf_static.
// ACC and AC Rally use these same segment names (see acc.js/acRally.js, both
// of which extend this class) — only AC Evo uses a different prefix
// (acevo_pmf_*, see acEvo.js, which does NOT extend this class since its
// struct layout is unrelated).
const { spawn, execFileSync } = require('child_process')
const readline = require('readline')

// Parametrized by segment prefix so acEvo.js's very different struct layout
// can still reuse this exact PowerShell reader shape (CreateViewAccessor(0,0)
// mapping the whole file regardless of exact struct size, base64-over-stdout
// framing) without duplicating it — only the three segment names differ.
function buildShmReaderScript(prefix, pollIntervalMs) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Core
function Read-Shm($name) {
  $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting($name)
  $acc = $mmf.CreateViewAccessor(0, 0)
  $size = $acc.Capacity
  $buf = New-Object byte[] $size
  $acc.ReadArray(0, $buf, 0, $size)
  $acc.Dispose()
  $mmf.Dispose()
  return [Convert]::ToBase64String($buf)
}
while ($true) {
  try {
    $p = Read-Shm "Local\\${prefix}_physics"
    $g = Read-Shm "Local\\${prefix}_graphics"
    $s = Read-Shm "Local\\${prefix}_static"
    Write-Output "FRAME:$p|$g|$s"
  } catch {
    Write-Output "NOFRAME"
  }
  Start-Sleep -Milliseconds ${pollIntervalMs}
}
`
}

// One-shot (non-persistent) probe — tries to open the given segment once and
// reports success/failure, used by gameDetector.js's polling loop. Spawning a
// short-lived PowerShell process for this (rather than keeping a second
// persistent reader just for probing) is cheap enough at a 5-30s cadence and
// reuses the exact same OpenExisting mechanic already verified in Phase 9.
function probeShmSegment(name, timeoutMs = 1500) {
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $mmf = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("${name}")
  $mmf.Dispose()
  Write-Output "OK"
} catch {
  Write-Output "FAIL"
}
`
  try {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true, timeout: timeoutMs, encoding: 'utf8',
    })
    // PowerShell can interleave progress-stream CLIXML noise into stdout
    // (observed with Add-Type on first use) ahead of our real output — check
    // line-by-line for an exact "OK" rather than requiring the whole trimmed
    // string to equal it, so that noise doesn't turn a real success into a
    // false negative.
    return out.split(/\r?\n/).some(line => line.trim() === 'OK')
  } catch (e) {
    return false
  }
}

// Wchar[N] fields are UTF-16LE, null-padded to N bytes — trim at the first NUL.
function readWChar(buf, offset, byteLen) {
  const raw = buf.toString('utf16le', offset, offset + byteLen)
  const nullIdx = raw.indexOf(String.fromCharCode(0))
  return (nullIdx === -1 ? raw : raw.slice(0, nullIdx)).trim()
}

function readFloatArray(buf, offset, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(buf.readFloatLE(offset + i * 4))
  return out
}

const GRAPHICS_STATUS = { 0: 'OFF', 1: 'REPLAY', 2: 'LIVE', 3: 'PAUSE' }
const GRAPHICS_SESSION = { 0: 'UNKNOWN', 1: 'PRACTICE', 2: 'QUALIFY', 3: 'RACE' }

class AC1Source {
  constructor() {
    this.proc = null
    this.active = false
    this._onFrame = null
    this.shmPrefix = 'acpmf'
  }

  onFrame(cb) { this._onFrame = cb }

  // Kept as instance methods (not module functions) specifically so
  // ACCSource/ACRallySource can override them via `extends` + `super.parseX()`
  // while sharing this class's start/stop/reader-process plumbing untouched.
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
      drs: buf.readInt32LE(200),
      tc: buf.readFloatLE(204),
      carDamage: readFloatArray(buf, 224, 5),
      pitLimiterOn: buf.readInt32LE(288),
      abs: buf.readFloatLE(292),
      tyreTempI: readFloatArray(buf, 296, 4),
      tyreTempM: readFloatArray(buf, 312, 4),
      tyreTempO: readFloatArray(buf, 328, 4),
      brakeBias: buf.readFloatLE(540),
    }
  }

  parseGraphics(buf) {
    return {
      status: GRAPHICS_STATUS[buf.readInt32LE(4)] || 'OFF',
      session: GRAPHICS_SESSION[buf.readInt32LE(8)] || 'UNKNOWN',
      currentTime: readWChar(buf, 12, 100),
      lastTime: readWChar(buf, 112, 100),
      bestTime: readWChar(buf, 212, 100),
      completedLaps: buf.readInt32LE(412),
      position: buf.readInt32LE(416),
      iCurrentTime: buf.readInt32LE(420),
      iLastTime: buf.readInt32LE(424),
      iBestTime: buf.readInt32LE(428),
      sessionTimeLeft: buf.readFloatLE(432),
      isInPit: buf.readInt32LE(440),
      currentSectorIndex: buf.readInt32LE(444),
      numberOfLaps: buf.readInt32LE(452),
      tyreCompound: readWChar(buf, 456, 100),
      flag: buf.readInt32LE(580),
      isInPitLane: buf.readInt32LE(588),
      fuelXLap: buf.readFloatLE(636),
    }
  }

  parseStaticInfo(buf) {
    return {
      carModel: readWChar(buf, 208, 100),
      track: readWChar(buf, 308, 100),
      maxTorque: buf.readFloatLE(712),
      maxPower: buf.readFloatLE(716),
      maxRpm: buf.readInt32LE(720),
      maxFuel: buf.readFloatLE(724),
      suspensionMaxTravel: readFloatArray(buf, 728, 4),
      trackSPlineLength: buf.readFloatLE(828),
    }
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
          this._onFrame?.({ physics, graphics, static: staticInfo })
        } catch (e) {
          // Malformed/partial frame this tick — skip it, next one arrives shortly
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
    return probeShmSegment('Local\\acpmf_physics')
  }
}

module.exports = { AC1Source, buildShmReaderScript, probeShmSegment, readWChar, readFloatArray, GRAPHICS_STATUS, GRAPHICS_SESSION }
