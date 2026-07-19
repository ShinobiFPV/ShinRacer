import { C } from '../../../lib/colors'
import {
  SpeedGauge, RPMBar, TyreMap, LapTimingPanel, GForceCircle,
  FuelBar, DamagePanel, MiniSpeed, ThrottleBrakeBar, SuspensionBars,
} from '../../telemetry/widgets'

export const GAUGE_COMPONENTS = {
  speedGauge: SpeedGauge, rpmBar: RPMBar, tyreMap: TyreMap, lapTiming: LapTimingPanel,
  gForceCircle: GForceCircle, fuelBar: FuelBar, damagePanel: DamagePanel,
  miniSpeed: MiniSpeed, throttleBrakeBar: ThrottleBrakeBar, suspensionBars: SuspensionBars,
}

export const DEFAULT_GAUGE_CONFIG = { gaugeType: 'speedGauge' }

// Runtime-only on the PWA (no edit-mode placeholder needed — mobile never
// runs the editor).
export default function GaugeWidget({ config = {}, telemetryFrame }) {
  const cfg = { ...DEFAULT_GAUGE_CONFIG, ...config }
  const Gauge = GAUGE_COMPONENTS[cfg.gaugeType]
  if (!Gauge) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 11 }}>
        Unknown gauge
      </div>
    )
  }
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Gauge frame={telemetryFrame} config={cfg} />
    </div>
  )
}
