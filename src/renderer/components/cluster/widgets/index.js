import MomentaryButton, { DEFAULT_MOMENTARY_CONFIG } from './MomentaryButton'
import ToggleButton, { DEFAULT_TOGGLE_CONFIG } from './ToggleButton'
import MomentarySwitch, { DEFAULT_SWITCH_CONFIG } from './MomentarySwitch'
import RotaryEncoder, { DEFAULT_ROTARY_CONFIG } from './RotaryEncoder'
import SliderWidget, { DEFAULT_SLIDER_CONFIG } from './SliderWidget'
import XYPad, { DEFAULT_XYPAD_CONFIG } from './XYPad'
import IndicatorLight, { DEFAULT_INDICATOR_CONFIG } from './IndicatorLight'
import GaugeWidget, { DEFAULT_GAUGE_CONFIG, GAUGE_COMPONENTS } from './GaugeWidget'
import TextReadout, { DEFAULT_TEXTREADOUT_CONFIG } from './TextReadout'
import ImagePanel, { DEFAULT_IMAGEPANEL_CONFIG } from './ImagePanel'
import LabelText, { DEFAULT_LABELTEXT_CONFIG } from './LabelText'

export { GAUGE_COMPONENTS }
export { readImageAsBase64 } from './ImagePanel'

// Single source of truth for the editor's widget palette, the config panel's
// default-config seeding, and every runtime renderer (ClusterRuntime,
// ClusterOverlay, the PWA's ClusterPage) — same pattern as Phase 9's
// telemetry WIDGET_CATALOG.
export const CLUSTER_WIDGET_CATALOG = [
  { type: 'momentaryButton', label: 'Momentary Button', category: 'INPUT', component: MomentaryButton, defaultConfig: DEFAULT_MOMENTARY_CONFIG, defaultSize: { width: 100, height: 100 } },
  { type: 'toggleButton', label: 'Toggle Button', category: 'INPUT', component: ToggleButton, defaultConfig: DEFAULT_TOGGLE_CONFIG, defaultSize: { width: 100, height: 100 } },
  { type: 'momentarySwitch', label: 'Momentary Switch', category: 'INPUT', component: MomentarySwitch, defaultConfig: DEFAULT_SWITCH_CONFIG, defaultSize: { width: 100, height: 60 } },
  { type: 'rotaryEncoder', label: 'Rotary Encoder', category: 'INPUT', component: RotaryEncoder, defaultConfig: DEFAULT_ROTARY_CONFIG, defaultSize: { width: 100, height: 120 } },
  { type: 'slider', label: 'Slider', category: 'INPUT', component: SliderWidget, defaultConfig: DEFAULT_SLIDER_CONFIG, defaultSize: { width: 80, height: 200 } },
  { type: 'xyPad', label: 'XY Pad', category: 'INPUT', component: XYPad, defaultConfig: DEFAULT_XYPAD_CONFIG, defaultSize: { width: 160, height: 160 } },
  { type: 'indicatorLight', label: 'Indicator Light', category: 'DISPLAY', component: IndicatorLight, defaultConfig: DEFAULT_INDICATOR_CONFIG, defaultSize: { width: 80, height: 80 } },
  { type: 'gauge', label: 'Gauge', category: 'DISPLAY', component: GaugeWidget, defaultConfig: DEFAULT_GAUGE_CONFIG, defaultSize: { width: 180, height: 180 } },
  { type: 'textReadout', label: 'Text Readout', category: 'DISPLAY', component: TextReadout, defaultConfig: DEFAULT_TEXTREADOUT_CONFIG, defaultSize: { width: 160, height: 60 } },
  { type: 'imagePanel', label: 'Image Panel', category: 'DISPLAY', component: ImagePanel, defaultConfig: DEFAULT_IMAGEPANEL_CONFIG, defaultSize: { width: 160, height: 120 } },
  { type: 'labelText', label: 'Label', category: 'DISPLAY', component: LabelText, defaultConfig: DEFAULT_LABELTEXT_CONFIG, defaultSize: { width: 120, height: 40 } },
]

export const CLUSTER_WIDGET_CATEGORIES = ['INPUT', 'DISPLAY']

export function getWidgetEntry(type) {
  return CLUSTER_WIDGET_CATALOG.find(w => w.type === type)
}

// Widget types whose runtime value lives in ClusterRuntime's state map
// (see its own comments) rather than purely in config or purely derived
// from telemetry — used to decide which widgets get an entry in that map.
export const STATEFUL_WIDGET_TYPES = ['toggleButton', 'rotaryEncoder', 'slider', 'xyPad']
