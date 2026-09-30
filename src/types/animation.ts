export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bezier' | 'spring' | 'bounce';

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

export interface EasingConfig {
  type: EasingType;
  bezier: CubicBezierConfig;
  spring: SpringConfig;
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
  | 'stroke'
  | 'strokeWidth'
  | 'radius'
  | 'width'
  | 'height';

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

export type LayerType = 'rect' | 'ellipse' | 'capsule' | 'text' | 'star' | 'path' | 'group';

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
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
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

export type ExportFormat = 'gif' | 'mp4' | 'webm' | 'svg' | 'json';

export interface ExportSettings {
  format: ExportFormat;
  fps: number;
  scale: number;
  transparent: boolean;
  backgroundColor: string;
  loop: number; // 0 for infinite in GIF
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
