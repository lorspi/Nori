import { Layer, LayerProperties } from '../types/animation';
import { getLayerLocalBounds } from './renderer';

// Layer transform used by the renderer: world = position + anchor + R·S·(local − anchor)

type TransformProps = Pick<LayerProperties, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'> &
  Partial<Pick<LayerProperties, 'anchorX' | 'anchorY'>>;

export function layerLocalToWorld(p: TransformProps, lx: number, ly: number) {
  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;
  const rot = ((p.rotation || 0) * Math.PI) / 180;
  const dx = (lx - ax) * (p.scaleX ?? 1);
  const dy = (ly - ay) * (p.scaleY ?? 1);
  return {
    x: p.x + ax + dx * Math.cos(rot) - dy * Math.sin(rot),
    y: p.y + ay + dx * Math.sin(rot) + dy * Math.cos(rot),
  };
}

export function worldToLayerLocal(p: TransformProps, wx: number, wy: number) {
  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;
  const rot = ((p.rotation || 0) * Math.PI) / 180;
  const dx = wx - p.x - ax;
  const dy = wy - p.y - ay;
  const rx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
  const ry = dx * Math.sin(-rot) + dy * Math.cos(-rot);
  return {
    x: rx / ((p.scaleX ?? 1) || 1) + ax,
    y: ry / ((p.scaleY ?? 1) || 1) + ay,
  };
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionHandle {
  id: HandleId;
  isCorner: boolean;
  // Point on the layer bounds (local coordinates) used for the scaling math
  local: { x: number; y: number };
  // Point on the opposite side, which stays fixed while scaling
  opposite: { x: number; y: number };
  // Where the handle is drawn (padded selection box), in canvas coordinates
  world: { x: number; y: number };
}

// Screen-space padding (px) between the layer bounds and the selection box
const SELECTION_PADDING = 6;

/**
 * The 8 resize handles of the selection box (4 corners + 4 edge midpoints)
 */
export function getSelectionHandles(layer: Layer, p: LayerProperties, zoom: number): SelectionHandle[] {
  const b = getLayerLocalBounds(layer, p);
  const invZoom = 1 / Math.max(0.001, zoom);
  // Padding converted to local units so it has a constant size on screen
  const padX = (SELECTION_PADDING * invZoom) / Math.max(0.001, Math.abs(p.scaleX ?? 1));
  const padY = (SELECTION_PADDING * invZoom) / Math.max(0.001, Math.abs(p.scaleY ?? 1));
  const midX = (b.minX + b.maxX) / 2;
  const midY = (b.minY + b.maxY) / 2;

  // [id, ux, uy] where u ∈ {-1, 0, 1} picks min / mid / max on each axis
  const defs: [HandleId, number, number][] = [
    ['nw', -1, -1],
    ['n', 0, -1],
    ['ne', 1, -1],
    ['e', 1, 0],
    ['se', 1, 1],
    ['s', 0, 1],
    ['sw', -1, 1],
    ['w', -1, 0],
  ];
  const pick = (u: number, min: number, mid: number, max: number) => (u < 0 ? min : u > 0 ? max : mid);

  return defs.map(([id, ux, uy]) => {
    const local = { x: pick(ux, b.minX, midX, b.maxX), y: pick(uy, b.minY, midY, b.maxY) };
    const opposite = { x: pick(-ux, b.minX, midX, b.maxX), y: pick(-uy, b.minY, midY, b.maxY) };
    const padded = layerLocalToWorld(p, local.x + ux * padX, local.y + uy * padY);
    return { id, isCorner: ux !== 0 && uy !== 0, local, opposite, world: padded };
  });
}

// Corners of the padded selection box, in canvas coordinates (nw, ne, se, sw)
export function getSelectionOutline(layer: Layer, p: LayerProperties, zoom: number) {
  const handles = getSelectionHandles(layer, p, zoom);
  return ['nw', 'ne', 'se', 'sw'].map((id) => handles.find((h) => h.id === id)!.world);
}

export function hitTestHandle(handles: SelectionHandle[], x: number, y: number, zoom: number) {
  const radius = 7 / Math.max(0.001, zoom);
  let best: SelectionHandle | null = null;
  let bestDist = Infinity;
  for (const h of handles) {
    const d = Math.hypot(x - h.world.x, y - h.world.y);
    if (d <= radius && d < bestDist) {
      best = h;
      bestDist = d;
    }
  }
  return best;
}

// Resize cursor matching the handle direction on screen (accounts for rotation)
export function getHandleCursor(handle: SelectionHandle, p: LayerProperties): string {
  const center = layerLocalToWorld(p, (handle.local.x + handle.opposite.x) / 2, (handle.local.y + handle.opposite.y) / 2);
  const angle = (Math.atan2(handle.world.y - center.y, handle.world.x - center.x) * 180) / Math.PI;
  const a = ((angle % 180) + 180) % 180;
  if (a < 22.5 || a >= 157.5) return 'ew-resize';
  if (a < 67.5) return 'nwse-resize';
  if (a < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

const MIN_SCALE = 0.01;
const clampScale = (s: number) => (Math.abs(s) < MIN_SCALE ? (s < 0 ? -MIN_SCALE : MIN_SCALE) : s);

/**
 * New scale (and position) when dragging a handle to (mouseX, mouseY).
 * - Corners scale proportionally unless `free` is set; edges scale only their axis.
 * - By default the opposite side stays fixed (position compensates);
 *   with `fromAnchor` the layer scales around its anchor point and position is unchanged.
 */
export function computeHandleScale(
  start: LayerProperties,
  handle: SelectionHandle,
  mouseX: number,
  mouseY: number,
  options: { free: boolean; fromAnchor: boolean }
): { scaleX: number; scaleY: number; x: number; y: number } {
  const ax = start.anchorX || 0;
  const ay = start.anchorY || 0;
  const sx0 = start.scaleX ?? 1;
  const sy0 = start.scaleY ?? 1;
  const rot = ((start.rotation || 0) * Math.PI) / 180;

  // Reference point that stays in place: anchor or the opposite handle
  const ref = options.fromAnchor ? { x: ax, y: ay } : handle.opposite;
  const refWorld = layerLocalToWorld(start, ref.x, ref.y);

  // Mouse offset from the reference, in the layer's rotated (unscaled) frame
  const dx = mouseX - refWorld.x;
  const dy = mouseY - refWorld.y;
  const vx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
  const vy = dx * Math.sin(-rot) + dy * Math.cos(-rot);

  const hx = handle.local.x - ref.x;
  const hy = handle.local.y - ref.y;
  const movesX = handle.id.includes('e') || handle.id.includes('w');
  const movesY = handle.id.includes('n') || handle.id.includes('s');

  let scaleX = sx0;
  let scaleY = sy0;

  if (handle.isCorner && !options.free) {
    // Uniform factor: projection of the mouse vector onto the scaled handle vector
    const px = hx * sx0;
    const py = hy * sy0;
    const lenSq = px * px + py * py;
    if (lenSq > 1e-9) {
      const k = (vx * px + vy * py) / lenSq;
      scaleX = clampScale(sx0 * k);
      scaleY = clampScale(sy0 * k);
    }
  } else {
    if (movesX && Math.abs(hx) > 1e-6) scaleX = clampScale(vx / hx);
    if (movesY && Math.abs(hy) > 1e-6) scaleY = clampScale(vy / hy);
  }

  scaleX = Number(scaleX.toFixed(4));
  scaleY = Number(scaleY.toFixed(4));

  if (options.fromAnchor) {
    return { scaleX, scaleY, x: start.x, y: start.y };
  }

  // Keep the reference point fixed: solve position so it maps to the same canvas point
  const moved = layerLocalToWorld({ ...start, scaleX, scaleY }, ref.x, ref.y);
  return {
    scaleX,
    scaleY,
    x: Number((start.x + refWorld.x - moved.x).toFixed(2)),
    y: Number((start.y + refWorld.y - moved.y).toFixed(2)),
  };
}

// ── Rotation ────────────────────────────────────────────────────────────────

// Screen-space ring just outside each corner where dragging rotates (in px)
const ROTATE_INNER = 7;
const ROTATE_OUTER = 24;

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

// Point-in-convex-quad test (corners in order)
function isInsideQuad(quad: { x: number; y: number }[], x: number, y: number) {
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % quad.length];
    const c = cross(b.x - a.x, b.y - a.y, x - a.x, y - a.y);
    if (Math.abs(c) < 1e-9) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * True when (x, y) is in the rotation zone: close to a corner of the selection box but
 * outside of it and not on the corner handle itself.
 */
export function hitTestRotation(quad: { x: number; y: number }[], x: number, y: number, zoom: number) {
  const z = Math.max(0.001, zoom);
  if (isInsideQuad(quad, x, y)) return false;
  return quad.some((c) => {
    const d = Math.hypot(x - c.x, y - c.y) * z;
    return d > ROTATE_INNER && d <= ROTATE_OUTER;
  });
}

// Curved-arrow cursor shown over the rotation zones
const ROTATE_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
  '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M5 12a7 7 0 1 1 7 7" stroke="#fff" stroke-width="4"/>' +
  '<path d="M5 12a7 7 0 1 1 7 7" stroke="#111" stroke-width="1.8"/>' +
  '<path d="M2 9l3 3 3-3" stroke="#fff" stroke-width="4"/>' +
  '<path d="M2 9l3 3 3-3" stroke="#111" stroke-width="1.8"/>' +
  '</g></svg>';
export const ROTATE_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent(ROTATE_CURSOR_SVG) + '") 12 12, crosshair';

const snapAngle = (deg: number, step: number) => Math.round(deg / step) * step;
const angleDeg = (x: number, y: number, cx: number, cy: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

/** Rotation of a single layer around its anchor point (Shift snaps to 15°) */
export function computeRotation(
  start: LayerProperties,
  startMouse: { x: number; y: number },
  mouseX: number,
  mouseY: number,
  snap: boolean
) {
  const px = start.x + (start.anchorX || 0);
  const py = start.y + (start.anchorY || 0);
  const delta = angleDeg(mouseX, mouseY, px, py) - angleDeg(startMouse.x, startMouse.y, px, py);
  const rotation = (start.rotation || 0) + delta;
  return Number((snap ? snapAngle(rotation, 15) : rotation).toFixed(2));
}

// ── Multi-layer (group) transforms ─────────────────────────────────────────

export interface GroupMember {
  id: string;
  layer: Layer;
  start: LayerProperties;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// World-space corners of a layer's bounds (no padding)
export function getLayerWorldCorners(layer: Layer, p: LayerProperties) {
  const b = getLayerLocalBounds(layer, p);
  return [
    layerLocalToWorld(p, b.minX, b.minY),
    layerLocalToWorld(p, b.maxX, b.minY),
    layerLocalToWorld(p, b.maxX, b.maxY),
    layerLocalToWorld(p, b.minX, b.maxY),
  ];
}

export function getWorldBox(layer: Layer, p: LayerProperties): Box {
  const corners = getLayerWorldCorners(layer, p);
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

// Axis-aligned box enclosing every member
export function getGroupBox(members: { layer: Layer; props: LayerProperties }[]): Box {
  const boxes = members.map((m) => getWorldBox(m.layer, m.props));
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

export const boxesIntersect = (a: Box, b: Box) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** 8 handles of the group box (world coordinates; `local` and `opposite` are world points too) */
export function getGroupHandles(box: Box, zoom: number): SelectionHandle[] {
  const pad = SELECTION_PADDING / Math.max(0.001, zoom);
  const midX = (box.minX + box.maxX) / 2;
  const midY = (box.minY + box.maxY) / 2;
  const defs: [HandleId, number, number][] = [
    ['nw', -1, -1],
    ['n', 0, -1],
    ['ne', 1, -1],
    ['e', 1, 0],
    ['se', 1, 1],
    ['s', 0, 1],
    ['sw', -1, 1],
    ['w', -1, 0],
  ];
  const pick = (u: number, min: number, mid: number, max: number) => (u < 0 ? min : u > 0 ? max : mid);
  return defs.map(([id, ux, uy]) => {
    const local = { x: pick(ux, box.minX, midX, box.maxX), y: pick(uy, box.minY, midY, box.maxY) };
    const opposite = { x: pick(-ux, box.minX, midX, box.maxX), y: pick(-uy, box.minY, midY, box.maxY) };
    return {
      id,
      isCorner: ux !== 0 && uy !== 0,
      local,
      opposite,
      world: { x: local.x + ux * pad, y: local.y + uy * pad },
    };
  });
}

export function getGroupOutline(box: Box, zoom: number) {
  const pad = SELECTION_PADDING / Math.max(0.001, zoom);
  return [
    { x: box.minX - pad, y: box.minY - pad },
    { x: box.maxX + pad, y: box.minY - pad },
    { x: box.maxX + pad, y: box.maxY + pad },
    { x: box.minX - pad, y: box.maxY + pad },
  ];
}

// Resize cursor for an axis-aligned group handle
export function getGroupHandleCursor(handle: SelectionHandle) {
  if (handle.id === 'n' || handle.id === 's') return 'ns-resize';
  if (handle.id === 'e' || handle.id === 'w') return 'ew-resize';
  return handle.id === 'nw' || handle.id === 'se' ? 'nwse-resize' : 'nesw-resize';
}

type MemberChanges = { id: string; changes: Partial<LayerProperties> };

/**
 * Scale several layers together from a group-box handle: each layer's pivot is scaled
 * around the fixed point and its own scale is multiplied along its rotated axes.
 */
export function computeGroupScale(
  members: GroupMember[],
  box: Box,
  handle: SelectionHandle,
  mouseX: number,
  mouseY: number,
  options: { free: boolean; fromCenter: boolean }
): MemberChanges[] {
  const fixed = options.fromCenter
    ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
    : handle.opposite;
  const hx = handle.local.x - fixed.x;
  const hy = handle.local.y - fixed.y;
  const vx = mouseX - fixed.x;
  const vy = mouseY - fixed.y;
  const movesX = handle.id.includes('e') || handle.id.includes('w');
  const movesY = handle.id.includes('n') || handle.id.includes('s');

  let fx = 1;
  let fy = 1;
  if (handle.isCorner && !options.free) {
    const lenSq = hx * hx + hy * hy;
    const k = lenSq > 1e-9 ? (vx * hx + vy * hy) / lenSq : 1;
    fx = fy = k;
  } else {
    if (movesX && Math.abs(hx) > 1e-6) fx = vx / hx;
    if (movesY && Math.abs(hy) > 1e-6) fy = vy / hy;
  }
  // Groups don't flip: keep factors positive
  fx = Math.max(MIN_SCALE, fx);
  fy = Math.max(MIN_SCALE, fy);

  return members.map(({ id, start }) => {
    const ax = start.anchorX || 0;
    const ay = start.anchorY || 0;
    const wx = start.x + ax;
    const wy = start.y + ay;
    const rot = ((start.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    // Stretch of the layer's own x / y axes under the group scale
    const kx = Math.hypot(fx * cos, fy * sin);
    const ky = Math.hypot(fx * sin, fy * cos);
    return {
      id,
      changes: {
        x: Number((fixed.x + (wx - fixed.x) * fx - ax).toFixed(2)),
        y: Number((fixed.y + (wy - fixed.y) * fy - ay).toFixed(2)),
        scaleX: Number(((start.scaleX ?? 1) * kx).toFixed(4)),
        scaleY: Number(((start.scaleY ?? 1) * ky).toFixed(4)),
      },
    };
  });
}

/** Rotate several layers together around the group centre (Shift snaps the angle to 15°) */
export function computeGroupRotation(
  members: GroupMember[],
  box: Box,
  startMouse: { x: number; y: number },
  mouseX: number,
  mouseY: number,
  snap: boolean
): MemberChanges[] {
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  let delta = angleDeg(mouseX, mouseY, cx, cy) - angleDeg(startMouse.x, startMouse.y, cx, cy);
  if (snap) delta = snapAngle(delta, 15);
  const rad = (delta * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return members.map(({ id, start }) => {
    const ax = start.anchorX || 0;
    const ay = start.anchorY || 0;
    const dx = start.x + ax - cx;
    const dy = start.y + ay - cy;
    return {
      id,
      changes: {
        x: Number((cx + dx * cos - dy * sin - ax).toFixed(2)),
        y: Number((cy + dx * sin + dy * cos - ay).toFixed(2)),
        rotation: Number(((start.rotation || 0) + delta).toFixed(2)),
      },
    };
  });
}
