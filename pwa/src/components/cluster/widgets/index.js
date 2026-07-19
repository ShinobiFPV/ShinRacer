import MomentaryButton, { DEFAULT_MOMENTARY_CONFIG } from './MomentaryButton'
import ToggleButton, { DEFAULT_TOGGLE_CONFIG } from './ToggleButton'
import MomentarySwitch, { DEFAULT_SWITCH_CONFIG } from './MomentarySwitch'
import RotaryEncoder, { DEFAULT_ROTARY_CONFIG } from './RotaryEncoder'
import SliderWidget, { DEFAULT_SLIDER_CONFIG } from './SliderWidget'
import XYPad, { DEFAULT_XYPAD_CONFIG } from './XYPad'
import IndicatorLight, { DEFAULT_INDICATOR_CONFIG } from './IndicatorLight'
import GaugeWidget, { DEFAULT_GAUGE_CONFIG } from './GaugeWidget'
import TextReadout, { DEFAULT_TEXTREADOUT_CONFIG } from './TextReadout'
import ImagePanel, { DEFAULT_IMAGEPANEL_CONFIG } from './ImagePanel'
import LabelText, { DEFAULT_LABELTEXT_CONFIG } from './LabelText'

// Runtime-only counterpart of the Electron app's widgets/index.js — no
// editor exists on the PWA, so this only needs to resolve a widget type to
// its runtime component, not carry defaultSize/category (those are
// editor-only concerns).
export const CLUSTER_WIDGET_CATALOG = [
  { type: 'momentaryButton', component: MomentaryButton, defaultConfig: DEFAULT_MOMENTARY_CONFIG },
  { type: 'toggleButton', component: ToggleButton, defaultConfig: DEFAULT_TOGGLE_CONFIG },
  { type: 'momentarySwitch', component: MomentarySwitch, defaultConfig: DEFAULT_SWITCH_CONFIG },
  { type: 'rotaryEncoder', component: RotaryEncoder, defaultConfig: DEFAULT_ROTARY_CONFIG },
  { type: 'slider', component: SliderWidget, defaultConfig: DEFAULT_SLIDER_CONFIG },
  { type: 'xyPad', component: XYPad, defaultConfig: DEFAULT_XYPAD_CONFIG },
  { type: 'indicatorLight', component: IndicatorLight, defaultConfig: DEFAULT_INDICATOR_CONFIG },
  { type: 'gauge', component: GaugeWidget, defaultConfig: DEFAULT_GAUGE_CONFIG },
  { type: 'textReadout', component: TextReadout, defaultConfig: DEFAULT_TEXTREADOUT_CONFIG },
  { type: 'imagePanel', component: ImagePanel, defaultConfig: DEFAULT_IMAGEPANEL_CONFIG },
  { type: 'labelText', component: LabelText, defaultConfig: DEFAULT_LABELTEXT_CONFIG },
]

export function getWidgetEntry(type) {
  return CLUSTER_WIDGET_CATALOG.find(w => w.type === type)
}
