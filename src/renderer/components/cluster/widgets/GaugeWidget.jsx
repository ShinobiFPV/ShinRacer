import { C } from '../../primitives'
import {
  SpeedGauge, RPMBar, TyreMap, LapTimingPanel, GForceCircle,
  FuelBar, DamagePanel, MiniSpeed, ThrottleBrakeBar, SuspensionBars,
} from '../../telemetry/widgets'

// Re-uses the Phase 9 telemetry gauges rather than reimplementing them — a
// ClusterWidget wrapper just picks which one to render and forwards config.
export const GAUGE_COMPONENTS = {
  speedGauge: SpeedGauge, rpmBar: RPMBar, tyreMap: TyreMap, lapTiming: LapTimingPanel,
  gForceCircle: GForceCircle, fuelBar: FuelBar, damagePanel: DamagePanel,
  miniSpeed: MiniSpeed, throttleBrakeBar: ThrottleBrakeBar, suspensionBars: SuspensionBars,
}

export const DEFAULT_GAUGE_CONFIG = { gaugeType: 'speedGauge' }

export default function GaugeWidget({ config = {}, mode, telemetryFrame }) {
  const cfg = { ...DEFAULT_GAUGE_CONFIG, ...config }
  const Gauge = GAUGE_COMPONENTS[cfg.gaugeType]

  if (mode !== 'runtime') {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px dashed ${C.border}`, color: C.muted, flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 20 }}>📡</span>
        <span style={{ fontFamily: C.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          {Gauge ? cfg.gaugeType : 'Unknown gauge'}
        </span>
      </div>
    )
  }

  if (!Gauge) return null
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Gauge frame={telemetryFrame} config={cfg} />
    </div>
  )
}
