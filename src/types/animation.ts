// Built-in curves keep their own fixed parameters ('spring' reads `spring` for older projects).
// The custom types ("Personalizada") hold the parameters edited by the user; 'bezier' is
// the custom cubic Bézier (name kept so projects and Lottie imports stay compatible).
export type EasingPresetType =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'back-in'
  | 'back-out'
  | 'bounce'
  | 'spring';

export type EasingType = EasingPresetType | 'bezier' | 'custom-spring' | 'custom-bounce';

export interface CubicBezierConfig {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SpringConfig {
  stiffness: number; // e.g. 270.18
  damping: number;   // e.g. 13.2
  mass: number;      // e.g. 1
}

export interface BounceConfig {
  bounces: number;     // number of bounces after the first impact (1–8)
  restitution: number; // height kept on each bounce, 0..1 (0.5 = classic ease-out bounce)
}

export interface EasingConfig {
  type: EasingType;
  bezier: CubicBezierConfig;
  spring: SpringConfig;
  bounce?: BounceConfig; // only stored by 'custom-bounce'
}

export type AnimatableProperty =
  | 'x'
  | 'y'
  | 'anchorX'
  | 'anchorY'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity'
  | 'fill'
  | 'fillOpacity'
  | 'stroke'
  | 'strokeOpacity'
  | 'strokeWidth'
  | 'radius'
  | 'width'
  | 'height'
  | 'blur'
  | 'pathData';

export interface Keyframe {
  id: string;
  time: number; // in seconds
  value: number | string;
  easing: EasingConfig;
}

export interface PropertyTrack {
  property: AnimatableProperty;
  label: string;
  unit: string;
  keyframes: Keyframe[];
}

// 'capsule' and 'text' can no longer be added, but older projects and SVG imports still use them
export type LayerType = 'rect' | 'ellipse' | 'polygon' | 'star' | 'path' | 'capsule' | 'text' | 'group';

// Where the stroke sits relative to the outline
export type StrokeAlign = 'center' | 'inside' | 'outside';

// Drop / inner shadow, in layer units (they move, rotate and scale with the layer)
export interface ShadowEffect {
  enabled: boolean;
  color: string;   // hex
  opacity: number; // 0..1
  x: number;       // offset
  y: number;
  blur: number;    // blur radius (like CSS box-shadow: the gaussian deviation is half of it)
  spread: number;  // grows (drop) or shrinks (inner) the shape before blurring
}

export interface LayerProperties {
  x: number;
  y: number;
  anchorX?: number; // Anchor point / pivot X
  anchorY?: number; // Anchor point / pivot Y
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  opacity: number;  // 0 to 1
  fill: string;   // 'transparent' = no fill
  stroke: string; // 'transparent' = no stroke
  fillOpacity?: number;   // 0..1, multiplies the fill color (1 when missing)
  strokeOpacity?: number; // 0..1, multiplies the stroke color (1 when missing)
  strokeWidth: number;
  strokeAlign?: StrokeAlign; // 'center' when missing
  radius: number; // corner radius (rect, polygon, star)
  sides?: number;       // polygon
  points?: number;      // star
  innerRadius?: number; // star: inner / outer radius (0..1)
  blur?: number;        // gaussian blur in px
  dropShadow?: ShadowEffect;
  innerShadow?: ShadowEffect;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  pathData?: string;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  parentId?: string;
  visible: boolean;
  locked: boolean;
  inTime: number;  // start time in seconds
  outTime: number; // end time in seconds
  properties: LayerProperties;
  tracks: PropertyTrack[];
  expanded?: boolean; // expanded in timeline
}

export interface Project {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // total duration in seconds
  backgroundColor: string; // hex or 'transparent'
  layers: Layer[];
}

export type ExportFormat = 'gif' | 'mp4' | 'webm' | 'svg';

export interface ExportSettings {
  format: ExportFormat;
  fps: number;
  scale: number;
  transparent: boolean;
  backgroundColor: string;
  loop: number; // 0 for infinite in GIF
  // Motion blur for video (MP4 / WebM): fraction of each frame the shutter stays open
  // (0 = off, 0.5 = 180°, 1 = 360°)
  motionBlur?: number;
}

// Reference to a single keyframe inside a layer's property track
export interface KeyframeRef {
  layerId: string;
  property: string;
  keyframeId: string;
}

// In-app clipboard for the timeline (copied keyframes or a whole layer animation)
export type TimelineClipboard =
  | {
      kind: 'keyframes';
      items: { property: AnimatableProperty; time: number; value: number | string; easing: EasingConfig }[];
    }
  | { kind: 'layer'; tracks: PropertyTrack[] };
