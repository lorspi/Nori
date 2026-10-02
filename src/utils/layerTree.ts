import { Layer, LayerProperties, PropertyTrack } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';
import { createKeyframe, createTrack } from './animationTracks';

/**
 * Layer hierarchy. Groups ('group') and boolean groups ('boolean') have children: a layer whose
 * parentId points to one of them lives in that group's coordinate space. project.layers keeps
 * every group right before its children (pre-order), back to front among siblings.
 */

// 2D affine matrix as in canvas / SVG: x' = a·x + c·y + e, y' = b·x + d·y + f
export type Affine = [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

// m · n: applies n first, then m
export function multiplyAffine(m: Affine, n: Affine): Affine {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invertAffine(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export const applyAffine = (m: Affine, x: number, y: number) => ({
  x: m[0] * x + m[2] * y + m[4],
  y: m[1] * x + m[3] * y + m[5],
});

// Average scale of the matrix (1 for a pure move or rotation)
export const affineScale = (m: Affine) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

export const isIdentity = (m: Affine) =>
  Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-9 && Math.abs(m[5]) < 1e-9;

/** Matrix of a layer's transform, as drawn by the renderer: position + anchor + R·S·(local − anchor) */
export function layerMatrix(
  p: Pick<LayerProperties, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'> & Partial<Pick<LayerProperties, 'anchorX' | 'anchorY'>>
): Affine {
  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;
  const rot = ((p.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const sx = p.scaleX ?? 1;
  const sy = p.scaleY ?? 1;
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  return [a, b, c, d, p.x + ax - (a * ax + c * ay), p.y + ay - (b * ax + d * ay)];
}

// ── Tree ──────────────────────────────────────────────────────────────────────

export const isBooleanLayer = (layer: Layer | null | undefined) => layer?.type === 'boolean';

// Plain group: its children are drawn one by one, each with its own style and animation
export const isGroupLayer = (layer: Layer | null | undefined) => layer?.type === 'group';

// Layers that hold other layers
export const isContainerLayer = (layer: Layer | null | undefined) => layer?.type === 'boolean' || layer?.type === 'group';

export const getLayer = (layers: Layer[], id: string | null | undefined) =>
  id ? layers.find((l) => l.id === id) : undefined;

export const getParent = (layers: Layer[], layer: Layer) => getLayer(layers, layer.parentId);

// Direct children of a group, back to front
export const getChildren = (layers: Layer[], id: string) => layers.filter((l) => l.parentId === id);

// Every layer inside the group (children, their children…), in stacking order
export function getDescendantIds(layers: Layer[], id: string): string[] {
  const result: string[] = [];
  const visit = (parentId: string) => {
    for (const l of layers) {
      if (l.parentId === parentId && !result.includes(l.id)) {
        result.push(l.id);
        visit(l.id);
      }
    }
  };
  visit(id);
  return result;
}

// Groups that hold the layer, nearest first
export function getAncestors(layers: Layer[], layer: Layer): Layer[] {
  const result: Layer[] = [];
  let current = getParent(layers, layer);
  while (current && !result.includes(current)) {
    result.push(current);
    current = getParent(layers, current);
  }
  return result;
}

export const getLayerDepth = (layers: Layer[], layer: Layer) => getAncestors(layers, layer).length;

// The given ids plus everything inside them, in stacking order
export function withDescendants(layers: Layer[], ids: string[]): string[] {
  const set = new Set(ids);
  for (const id of ids) getDescendantIds(layers, id).forEach((d) => set.add(d));
  return layers.filter((l) => set.has(l.id)).map((l) => l.id);
}

// The given ids without the ones already inside another of them
export function topLevelIds(layers: Layer[], ids: string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    const layer = getLayer(layers, id);
    return !!layer && !getAncestors(layers, layer).some((a) => set.has(a.id));
  });
}

/** Canvas matrix of the space the layer lives in (identity at the top level) */
export function getParentWorldMatrix(layers: Layer[], layer: Layer, time: number): Affine {
  let m: Affine = IDENTITY;
  for (const ancestor of getAncestors(layers, layer)) {
    m = multiplyAffine(layerMatrix(getLayerPropertiesAtTime(ancestor, time)), m);
  }
  return m;
}

/** Canvas matrix of the layer's own coordinates */
export const getLayerWorldMatrix = (layers: Layer[], layer: Layer, time: number, props?: LayerProperties) =>
  multiplyAffine(getParentWorldMatrix(layers, layer, time), layerMatrix(props ?? getLayerPropertiesAtTime(layer, time)));

const isOwnShown = (layer: Layer, time: number) => layer.visible && time >= layer.inTime && time <= layer.outTime;

// Drawn at this time: the layer and every group around it are visible and inside their time range
export const isLayerShown = (layers: Layer[], layer: Layer, time: number) =>
  isOwnShown(layer, time) && getAncestors(layers, layer).every((a) => isOwnShown(a, time));

// Locked by itself or by a group around it
export const isLayerLocked = (layers: Layer[], layer: Layer) =>
  layer.locked || getAncestors(layers, layer).some((a) => a.locked);

/**
 * Valid tree in stacking order: parentIds that don't point to a group (or form a loop)
 * are dropped, and each group is followed by its children. Siblings keep their relative order,
 * so a layer inserted between a group's children without a parent ends up after the group.
 * Returns the same array when nothing changes.
 */
export function normalizeLayerTree(layers: Layer[]): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]));
  const fixed = layers.map((layer) => {
    if (!layer.parentId) return layer;
    const seen = new Set([layer.id]);
    let parent = byId.get(layer.parentId);
    let valid = isContainerLayer(parent);
    while (valid && parent?.parentId) {
      if (seen.has(parent.id)) {
        valid = false;
        break;
      }
      seen.add(parent.id);
      parent = byId.get(parent.parentId);
      valid = isContainerLayer(parent);
    }
    if (valid) return layer;
    const { parentId: _dropped, ...rest } = layer;
    return rest as Layer;
  });

  const ordered: Layer[] = [];
  const emit = (parentId: string | undefined) => {
    for (const layer of fixed) {
      if (layer.parentId !== parentId) continue;
      ordered.push(layer);
      if (isContainerLayer(layer)) emit(layer.id);
    }
  };
  emit(undefined);

  const unchanged = ordered.length === layers.length && ordered.every((l, i) => l === layers[i]);
  return unchanged ? layers : ordered;
}

/**
 * New project duration: layers that lasted until the end keep lasting until the new end, and
 * none lasts past it (layers that end earlier, as in Lottie imports, keep their end).
 */
export function fitLayersToDuration(layers: Layer[], oldDuration: number, newDuration: number): Layer[] {
  if (Math.abs(oldDuration - newDuration) < 1e-9) return layers;
  return layers.map((l) => {
    const outTime = l.outTime >= oldDuration - 1e-3 ? newDuration : Math.min(l.outTime, newDuration);
    return outTime === l.outTime ? l : { ...l, outTime };
  });
}

/**
 * Repairs projects saved before durations moved the layers' end: when every layer ends before
 * the project does, the ones ending last were cut at an old duration and are extended.
 */
export function repairLayerEnds(layers: Layer[], duration: number): Layer[] {
  if (layers.length === 0) return layers;
  const lastEnd = Math.max(...layers.map((l) => l.outTime));
  if (lastEnd >= duration - 1e-3) return layers;
  return layers.map((l) => (l.outTime >= lastEnd - 1e-3 ? { ...l, outTime: duration } : l));
}

/**
 * Moves a layer (and its animation) by the matrix m, so it looks the same in a space where m is
 * applied on top: position keyframes map their pivot (position + anchor), rotation keyframes turn
 * by the matrix angle and scale keyframes stretch by its scale. Exact for moves, rotations and
 * uniform scales; a non-uniform scale on a rotated layer is approximated (layers can't skew).
 */
export function transformLayerPose(layer: Layer, m: Affine): Layer {
  if (isIdentity(m)) return layer;
  const rotation = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  const sx = Math.hypot(m[0], m[1]);
  const sy = (m[0] * m[3] - m[1] * m[2]) / (sx || 1);
  const round = (v: number, digits: number) => Number(v.toFixed(digits));

  const pivot = (p: LayerProperties) => {
    const ax = p.anchorX || 0;
    const ay = p.anchorY || 0;
    const w = applyAffine(m, p.x + ax, p.y + ay);
    return { x: round(w.x - ax, 2), y: round(w.y - ay, 2) };
  };

  const base = layer.properties;
  const moved = pivot(base);
  const properties: LayerProperties = {
    ...base,
    x: moved.x,
    y: moved.y,
    rotation: round((base.rotation || 0) + rotation, 2),
    scaleX: round((base.scaleX ?? 1) * sx, 4),
    scaleY: round((base.scaleY ?? 1) * sy, 4),
  };

  let tracks = layer.tracks.map((track) => {
    const map = (value: number | string, time: number): number | string => {
      if (typeof value !== 'number') return value;
      switch (track.property) {
        case 'x':
          return pivot(getLayerPropertiesAtTime(layer, time)).x;
        case 'y':
          return pivot(getLayerPropertiesAtTime(layer, time)).y;
        case 'rotation':
          return round(value + rotation, 2);
        case 'scaleX':
          return round(value * sx, 4);
        case 'scaleY':
          return round(value * sy, 4);
        default:
          return value;
      }
    };
    return { ...track, keyframes: track.keyframes.map((k) => ({ ...k, value: map(k.value, k.time) })) };
  });

  // A turned space mixes the axes: a move along X alone becomes a move along both. Both position
  // tracks then get a keyframe wherever either had one (exact when they share times and curves).
  const xTrack = layer.tracks.find((t) => t.property === 'x');
  const yTrack = layer.tracks.find((t) => t.property === 'y');
  const mixesAxes = Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9;
  if (mixesAxes && (xTrack || yTrack)) {
    const keyAt = (track: PropertyTrack | undefined, time: number) => track?.keyframes.find((k) => Math.abs(k.time - time) < 1e-6);
    const times = [...new Set([...(xTrack?.keyframes ?? []), ...(yTrack?.keyframes ?? [])].map((k) => k.time))].sort((a, b) => a - b);
    const positions = times.map((time) => ({ time, ...pivot(getLayerPropertiesAtTime(layer, time)) }));
    const rebuild = (property: 'x' | 'y', own: PropertyTrack | undefined, other: PropertyTrack | undefined): PropertyTrack => ({
      ...(own ?? createTrack(property, [])),
      keyframes: positions.map(({ time, x, y }) => {
        const existing = keyAt(own, time);
        const easing = (existing ?? keyAt(other, time))!.easing;
        return { ...(existing ?? createKeyframe(time, 0)), easing: JSON.parse(JSON.stringify(easing)), value: property === 'x' ? x : y };
      }),
    });
    const x = rebuild('x', xTrack, yTrack);
    const y = rebuild('y', yTrack, xTrack);
    tracks = tracks.map((t) => (t.property === 'x' ? x : t.property === 'y' ? y : t));
    if (!xTrack) tracks.push(x);
    if (!yTrack) tracks.push(y);
  }

  return { ...layer, properties, tracks };
}
