import { AnimatableProperty, EasingConfig, Keyframe, KeyframeRef, Layer, Project, PropertyTrack } from '../types/animation';

// Display metadata for each animatable property (timeline labels & units)
export const PROPERTY_META: Record<AnimatableProperty, { label: string; unit: string }> = {
  x: { label: 'Posición X', unit: 'px' },
  y: { label: 'Posición Y', unit: 'px' },
  anchorX: { label: 'Anclaje X', unit: 'px' },
  anchorY: { label: 'Anclaje Y', unit: 'px' },
  scaleX: { label: 'Escala X', unit: '%' },
  scaleY: { label: 'Escala Y', unit: '%' },
  rotation: { label: 'Rotación', unit: '°' },
  opacity: { label: 'Opacidad', unit: '%' },
  fill: { label: 'Relleno', unit: '' },
  stroke: { label: 'Trazo', unit: '' },
  strokeWidth: { label: 'Grosor de trazo', unit: 'px' },
  radius: { label: 'Radio de esquinas', unit: 'px' },
  width: { label: 'Ancho', unit: 'px' },
  height: { label: 'Alto', unit: 'px' },
  blur: { label: 'Desenfoque', unit: 'px' },
  pathData: { label: 'Forma (vértices)', unit: '' },
};

export const ANIMATABLE_PROPERTIES = Object.keys(PROPERTY_META) as AnimatableProperty[];

export const isAnimatableProperty = (prop: string): prop is AnimatableProperty =>
  prop in PROPERTY_META;

export const createDefaultEasing = (): EasingConfig => ({
  type: 'linear',
  bezier: { x1: 0.25, y1: 1, x2: 0.5, y2: 1 },
  spring: { stiffness: 270.18, damping: 13.2, mass: 1 },
});

export const createKeyframe = (time: number, value: number | string): Keyframe => ({
  id: `kf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  time,
  value,
  easing: createDefaultEasing(),
});

export const createTrack = (property: AnimatableProperty, keyframes: Keyframe[]): PropertyTrack => ({
  property,
  label: PROPERTY_META[property].label,
  unit: PROPERTY_META[property].unit,
  keyframes,
});

// Snap a time in seconds to the nearest frame of the project
export const snapToFrame = (time: number, fps: number) =>
  Number((Math.round(time * fps) / fps).toFixed(4));

// Tolerance used to decide whether a keyframe sits on the current frame
export const frameTolerance = (fps: number) => 0.5 / fps;

export const sortKeyframes = (keyframes: Keyframe[]) =>
  [...keyframes].sort((a, b) => a.time - b.time);

/**
 * Time range covered by every keyframe of the layer (all animated properties).
 * Returns null when the layer has no keyframes.
 */
export function getLayerKeyframeRange(layer: Layer): { start: number; end: number } | null {
  let start = Infinity;
  let end = -Infinity;
  for (const track of layer.tracks) {
    for (const kf of track.keyframes) {
      if (kf.time < start) start = kf.time;
      if (kf.time > end) end = kf.time;
    }
  }
  return start === Infinity ? null : { start, end };
}

// Unique keyframe times across all tracks of the layer (for the collapsed summary)
export function getLayerKeyframeTimes(layer: Layer): number[] {
  const times = new Set<number>();
  for (const track of layer.tracks) {
    for (const kf of track.keyframes) times.add(kf.time);
  }
  return Array.from(times).sort((a, b) => a - b);
}

// Properties shown as a single parameter in the Inspector (e.g. Posición = X + Y)
const PROPERTY_SIBLINGS: Partial<Record<AnimatableProperty, AnimatableProperty>> = {
  x: 'y',
  y: 'x',
  anchorX: 'anchorY',
  anchorY: 'anchorX',
  scaleX: 'scaleY',
  scaleY: 'scaleX',
  stroke: 'strokeWidth',
  strokeWidth: 'stroke',
};

export const getSiblingProperty = (prop: string): AnimatableProperty | undefined =>
  isAnimatableProperty(prop) ? PROPERTY_SIBLINGS[prop] : undefined;

export const isSameKeyframeRef = (a: KeyframeRef, b: KeyframeRef) =>
  a.layerId === b.layerId && a.property === b.property && a.keyframeId === b.keyframeId;

// Resolves keyframe references against the project, dropping the ones that no longer exist
export function resolveKeyframeRefs(project: Project, refs: KeyframeRef[]) {
  const resolved: { ref: KeyframeRef; layer: Layer; track: PropertyTrack; keyframe: Keyframe }[] = [];
  for (const ref of refs) {
    const layer = project.layers.find((l) => l.id === ref.layerId);
    const track = layer?.tracks.find((t) => t.property === ref.property);
    const keyframe = track?.keyframes.find((k) => k.id === ref.keyframeId);
    if (layer && track && keyframe) resolved.push({ ref, layer, track, keyframe });
  }
  return resolved;
}

export const getLayerKeyframeRefs = (layer: Layer): KeyframeRef[] =>
  layer.tracks.flatMap((t) =>
    t.keyframes.map((k) => ({ layerId: layer.id, property: t.property, keyframeId: k.id }))
  );

// Nearest keyframe time before (-1) or after (1) the given time, across every layer.
// Returns null when there is none in that direction.
export function getAdjacentKeyframeTime(project: Project, time: number, direction: -1 | 1): number | null {
  const tolerance = frameTolerance(project.fps);
  let best: number | null = null;
  for (const layer of project.layers) {
    for (const track of layer.tracks) {
      for (const kf of track.keyframes) {
        const isAhead = direction === 1 ? kf.time > time + tolerance : kf.time < time - tolerance;
        if (!isAhead) continue;
        if (best === null || (direction === 1 ? kf.time < best : kf.time > best)) best = kf.time;
      }
    }
  }
  return best;
}
