// TelemetryManager — ties gameDetector + the per-game sources + normalizer.js
// together behind one small interface main.js can drive: start()/stop(),
// plus onFrame/onGameDetected/onGameLost/onWarning callbacks it wires to
// whatever windows need the data (see main.js's startShmTelemetry, which is
// the one remaining piece of Phase 9's naming this refactor deliberately
// preserved — see that file for why).
const Store = require('electron-store')
const { AC1Source } = require('./sources/ac1')
const { ACCSource } = require('./sources/acc')
const { ACRallySource } = require('./sources/acRally')
const { ACEvoSource } = require('./sources/acEvo')
const { ForzaSource, DEFAULT_PORT } = require('./sources/forza')
const gameDetector = require('./gameDetector')
const {
  normalizeAC1, normalizeACC, normalizeACEvo, normalizeACRally, normalizeForza,
} = require('./normalizer')

const IDLE_POLL_MS = 5000    // no game detected — check again soon
const ACTIVE_POLL_MS = 30000 // a game is running — back off, just watching for it to exit or swap

class TelemetryManager {
  constructor({ onFrame, onGameDetected, onGameLost, onWarning, log } = {}) {
    this.onFrame = onFrame || (() => {})
    this.onGameDetected = onGameDetected || (() => {})
    this.onGameLost = onGameLost || (() => {})
    this.onWarning = onWarning || (() => {})
    this.log = log || (() => {})
    this.store = new Store()
    this.activeGame = null
    this.source = null
    this.pollTimer = null
    this.running = false
  }

  getForzaPort() { return this.store.get('forzaTelemetryPort', DEFAULT_PORT) }
  getAutoDetect() { return this.store.get('telemetryAutoDetect', true) }
  getManualGame() { return this.store.get('telemetryManualGame', 'ac1') }

  createSource(game) {
    switch (game) {
      case 'ac1': return new AC1Source()
      case 'acc': return new ACCSource()
      case 'acevo': return new ACEvoSource()
      case 'acrally': return new ACRallySource()
      case 'fh5':
      case 'fh6': return new ForzaSource(this.getForzaPort())
      default: return null
    }
  }

  normalize(raw, game) {
    switch (game) {
      case 'ac1': return normalizeAC1(raw.physics, raw.graphics, raw.static)
      case 'acc': return normalizeACC(raw.physics, raw.graphics, raw.static)
      case 'acevo': return normalizeACEvo(raw.physics, raw.graphics, raw.static)
      case 'acrally': return normalizeACRally(raw.physics, raw.graphics, raw.static)
      case 'fh5':
      case 'fh6': return normalizeForza(raw.buf, raw.version)
      default: return null
    }
  }

  async start() {
    if (this.running) return { ok: true, alreadyRunning: true }
    this.running = true
    await this.detectAndStart()
    return { ok: true }
  }

  stop() {
    this.running = false
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null }
    this._stopCurrentSource()
    this.activeGame = null
  }

  _stopCurrentSource() {
    if (this.source) {
      try { this.source.stop() } catch (e) {}
      this.source = null
    }
  }

  // Auto-detect mode re-runs this on a timer (see the reschedule at the
  // bottom) so a game closing or switching gets picked up without a manual
  // restart. Manual mode is a one-shot pin: it starts the selected source
  // once and doesn't poll for changes — flipping the Settings dropdown takes
  // effect on the next explicit (re)start, e.g. via "Test telemetry", not
  // live in the background. That's a deliberate simplification: the
  // 5s/30s backoff polling exists specifically to support auto-detection's
  // game-switching case, which manual mode opts out of by definition.
  async detectAndStart() {
    if (!this.running) return
    const autoDetect = this.getAutoDetect()
    let detected

    if (autoDetect) {
      detected = await gameDetector.detect(this.getForzaPort())
    } else {
      detected = this.getManualGame()
      if (this.activeGame === detected && this.source) return
    }

    if (detected !== this.activeGame) {
      const previousGame = this.activeGame
      this._stopCurrentSource()
      if (previousGame) this.onGameLost(previousGame)

      this.activeGame = detected
      if (detected) {
        const source = this.createSource(detected)
        if (source) {
          if (detected === 'acevo') source.onWarning?.(this.onWarning)
          source.onFrame((raw) => {
            const frame = this.normalize(raw, detected)
            if (frame) this.onFrame(frame)
          })
          const res = await source.start()
          if (!res?.ok) {
            this.log(`Telemetry source for ${detected} failed to start: ${res?.error}`)
            this.activeGame = null
          } else {
            this.source = source
            this.onGameDetected(detected)
          }
        }
      }
    }

    if (!autoDetect) return

    const nextInterval = this.activeGame ? ACTIVE_POLL_MS : IDLE_POLL_MS
    this.pollTimer = setTimeout(() => { this.detectAndStart() }, nextInterval)
  }

  async setForzaPort(port) {
    this.store.set('forzaTelemetryPort', port)
    if (this.source instanceof ForzaSource) {
      return this.source.setPort(port)
    }
    return { ok: true }
  }
}

module.exports = { TelemetryManager }
