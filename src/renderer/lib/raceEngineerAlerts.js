// AI Race Engineer — deterministic threshold alerts.
// Ported from imq2's tools/race_engineer.py / race_engineer_ac.py (sanitized:
// no William references, no Forza freeroam logic, no tool-calling framework —
// this just reads the already-normalized TelemetryFrame this app builds for
// every other telemetry widget). Every check is null-safe per normalizer.js's
// own convention (a field a game doesn't expose is null, never 0) so games
// with partial telemetry (no tyre wear on Forza, no flag on F1 25/AMS2) just
// silently skip the checks they can't support instead of false-alerting.

const AC_FLAG = {
  0: 'None', 1: 'Blue', 2: 'Yellow', 3: 'Black', 4: 'White',
  5: 'Checkered', 6: 'Penalty', 7: 'Green', 8: 'Orange',
}

function fuelPercent(frame) {
  const { fuel, maxFuel } = frame
  if (fuel == null) return null
  if (maxFuel != null && maxFuel > 0) return (fuel / maxFuel) * 100
  // Forza-style: fuel is already a 0-1 fraction, no absolute tank size given.
  if (fuel <= 1.5) return fuel * 100
  return null // absolute litres with no known tank size — can't judge a %
}

function every4(arr) {
  return Array.isArray(arr) && arr.length === 4 && arr.every((v) => v != null)
}

// Returns [{ id, severity, message }] — id is stable per alert *kind* so the
// caller (useRaceEngineer) can edge-trigger/cooldown per kind rather than per
// raw frame. severity is 'critical' | 'warning' | 'info'.
export function evaluateAlerts(frame) {
  if (!frame) return []
  const alerts = []
  const CORNERS = ['FL', 'FR', 'RL', 'RR']

  const fuelPct = fuelPercent(frame)
  if (fuelPct != null) {
    if (fuelPct < 10) {
      alerts.push({ id: 'fuel', severity: 'critical', message: `Fuel critical: ${fuelPct.toFixed(0)}% remaining.` })
    } else if (fuelPct < 25) {
      alerts.push({ id: 'fuel', severity: 'warning', message: `Fuel low: ${fuelPct.toFixed(0)}%.` })
    }
  }

  if (every4(frame.tyreTemp)) {
    const cold = CORNERS.filter((_, i) => frame.tyreTemp[i] < 60)
    const hot = CORNERS.filter((_, i) => frame.tyreTemp[i] > 110)
    if (cold.length) {
      alerts.push({ id: 'tyres-cold', severity: 'warning', message: `Tyres cold: ${cold.join(', ')}.` })
    }
    if (hot.length) {
      alerts.push({ id: 'tyres-hot', severity: 'warning', message: `Tyres overheating: ${hot.join(', ')}.` })
    }
  }

  if (every4(frame.tyreWear)) {
    const worn = CORNERS.filter((_, i) => frame.tyreWear[i] > 0.8)
    if (worn.length) {
      alerts.push({ id: 'tyres-worn', severity: 'warning', message: `Tyres worn: ${worn.join(', ')}.` })
    }
  }

  if (every4(frame.tyreSlip)) {
    const maxSlip = Math.max(...frame.tyreSlip.map((s) => Math.abs(s)))
    if (maxSlip > 0.8) {
      alerts.push({ id: 'slip', severity: 'warning', message: `High tyre slip: ${maxSlip.toFixed(2)} — losing grip.` })
    }
  }

  if (Array.isArray(frame.carDamage) && frame.carDamage.some((d) => d != null && d > 0)) {
    alerts.push({ id: 'damage', severity: 'warning', message: 'Damage sustained.' })
  }

  if (frame.flag != null && frame.flag !== 0) {
    const flagName = AC_FLAG[frame.flag]
    if (flagName && flagName !== 'None') {
      alerts.push({ id: 'flag', severity: 'info', message: `Flag: ${flagName}.` })
    }
  }

  return alerts
}
