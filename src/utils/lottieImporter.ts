import { Project, Layer, PropertyTrack, Keyframe, AnimatableProperty, LayerType } from '../types/animation';
import { getPathBounds } from './renderer';

export interface LottieKeyframe {
  t: number; // frame number
  s?: number[] | number; // start value
  e?: number[] | number; // end value
  i?: { x: number | number[]; y: number | number[] }; // bezier in
  o?: { x: number | number[]; y: number | number[] }; // bezier out
}

export interface LottieTransformProp {
  a?: number; // 0 = static, 1 = animated
  k: number | number[] | LottieKeyframe[];
}

export interface LottieTransform {
  p?: LottieTransformProp; // position
  s?: LottieTransformProp; // scale
  r?: LottieTransformProp; // rotation
  o?: LottieTransformProp; // opacity
  a?: LottieTransformProp; // anchor
}

export interface LottieShapeItem {
  ty: string; // 'rc' = rect, 'el' = ellipse, 'fl' = fill, 'st' = stroke, 'gr' = group, 'tr' = transform, 'sh' = path, 'sr' = star
  nm?: string;
  s?: { k: number[] | LottieKeyframe[] }; // size
  p?: { k: number[] | LottieKeyframe[] }; // position
  r?: { k: number | LottieKeyframe[] }; // radius or roundness
  c?: { k: number[] | LottieKeyframe[] }; // color [r, g, b, a] in 0..1
  w?: { k: number | LottieKeyframe[] }; // stroke width
  o?: { k: number | LottieKeyframe[] }; // opacity
  d?: number; // direction
  it?: LottieShapeItem[]; // group items
  ks?: {
    k:
      | { v: number[][]; i: number[][]; o: number[][]; c: boolean }
      | Array<{ s?: [{ v: number[][]; i: number[][]; o: number[][]; c: boolean }] }>;
  }; // bezier path
}

export interface LottieMask {
  nm?: string;
  mode?: string; // 'a' (add), 's' (subtract), 'i' (intersect), 'n' (none)
  pt?: { k: { v: number[][]; i: number[][]; o: number[][]; c: boolean } };
  o?: { k: number };
}

export interface LottieLayer {
  ddd?: number;
  ind?: number;
  ty: number; // 0: precomp, 1: solid, 2: image, 3: null, 4: shape, 5: text
  nm?: string;
  parent?: number; // Parent layer index
  refId?: string;  // Reference to precomp asset
  ip: number;
  op: number;
  st?: number;
  bm?: number;
  sc?: string; // solid color '#ffffff'
  sh?: number; // solid height
  sw?: number; // solid width
  ks?: LottieTransform;
  shapes?: LottieShapeItem[];
  hasMask?: boolean;
  masksProperties?: LottieMask[];
  t?: {
    d?: {
      k?: Array<{
        s?: {
          t?: string; // text
          s?: number; // font size
          f?: string; // font family
          fc?: number[]; // font color
        };
      }>;
    };
  };
}

export interface LottieAsset {
  id: string;
  nm?: string;
  layers?: LottieLayer[];
  w?: number;
  h?: number;
  u?: string;
  p?: string;
}

export interface LottieJson {
  v?: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm?: string;
  assets?: LottieAsset[];
  layers?: LottieLayer[];
}

/**
 * Safely extracts a numeric value from either a single number or a 1-element array
 */
export function numVal(v: any, defaultVal = 0): number {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (Array.isArray(v) && typeof v[0] === 'number' && !isNaN(v[0])) return v[0];
  return defaultVal;
}

/**
 * Converts Lottie color [r, g, b, (a)] where values are 0..1 to hex string
 */
export function lottieColorToHex(c?: any): string {
  if (!c) return '#0084ff';
  if (Array.isArray(c)) {
    if (c.length === 0) return '#0084ff';
    const r = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
    const g = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
    const b = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  if (typeof c === 'string') return c;
  return '#0084ff';
}

/**
 * Converts Lottie bezier vertices into SVG Path Data (M ... C ... Z)
 */
export function lottieBezierToPath(
  v: number[][],
  i: number[][],
  o: number[][],
  c: boolean,
  offsetX: number = 0,
  offsetY: number = 0
): string {
  if (!v || v.length === 0) return '';
  let d = `M ${(v[0][0] - offsetX).toFixed(2)},${(v[0][1] - offsetY).toFixed(2)}`;
  for (let k = 1; k < v.length; k++) {
    const prevV = v[k - 1];
    const curV = v[k];
    const cp1X = prevV[0] + (o[k - 1] ? o[k - 1][0] : 0) - offsetX;
    const cp1Y = prevV[1] + (o[k - 1] ? o[k - 1][1] : 0) - offsetY;
    const cp2X = curV[0] + (i[k] ? i[k][0] : 0) - offsetX;
    const cp2Y = curV[1] + (i[k] ? i[k][1] : 0) - offsetY;
    d += ` C ${cp1X.toFixed(2)},${cp1Y.toFixed(2)} ${cp2X.toFixed(2)},${cp2Y.toFixed(2)} ${(curV[0] - offsetX).toFixed(2)},${(curV[1] - offsetY).toFixed(2)}`;
  }
  if (c) {
    const lastIdx = v.length - 1;
    const cp1X = v[lastIdx][0] + (o[lastIdx] ? o[lastIdx][0] : 0) - offsetX;
    const cp1Y = v[lastIdx][1] + (o[lastIdx] ? o[lastIdx][1] : 0) - offsetY;
    const cp2X = v[0][0] + (i[0] ? i[0][0] : 0) - offsetX;
    const cp2Y = v[0][1] + (i[0] ? i[0][1] : 0) - offsetY;
    d += ` C ${cp1X.toFixed(2)},${cp1Y.toFixed(2)} ${cp2X.toFixed(2)},${cp2Y.toFixed(2)} ${(v[0][0] - offsetX).toFixed(2)},${(v[0][1] - offsetY).toFixed(2)} Z`;
  }
  return d;
}

/**
 * Parses Lottie animated property keyframes into our PropertyTrack format
 */
export function parseLottieTrack(
  prop: LottieTransformProp | undefined,
  property: AnimatableProperty,
  label: string,
  unit: string,
  fps: number,
  baseTime: number,
  transformVal: (v: any) => number
): PropertyTrack | null {
  if (!prop || prop.k === undefined) return null;

  // If prop.k is just a raw number array like [0, 0] or single number, it is not animated
  if (!Array.isArray(prop.k) || (Array.isArray(prop.k) && typeof prop.k[0] === 'number')) {
    return null;
  }

  const rawKeyframes = prop.k as LottieKeyframe[];
  const keyframes: Keyframe[] = [];

  for (let i = 0; i < rawKeyframes.length; i++) {
    const kf = rawKeyframes[i];
    if (kf.t === undefined || kf.s === undefined) continue;

    const timeInSec = Math.max(0, (kf.t - baseTime) / fps);
    const value = transformVal(kf.s);

    let x1 = 0.25;
    let y1 = 1;
    let x2 = 0.5;
    let y2 = 1;

    if (kf.o && kf.i) {
      const ox = Array.isArray(kf.o.x) ? kf.o.x[0] : kf.o.x;
      const oy = Array.isArray(kf.o.y) ? kf.o.y[0] : kf.o.y;
      const ix = Array.isArray(kf.i.x) ? kf.i.x[0] : kf.i.x;
      const iy = Array.isArray(kf.i.y) ? kf.i.y[0] : kf.i.y;
      x1 = typeof ox === 'number' ? ox : 0.25;
      y1 = typeof oy === 'number' ? oy : 1;
      x2 = typeof ix === 'number' ? ix : 0.5;
      y2 = typeof iy === 'number' ? iy : 1;
    }

    keyframes.push({
      id: `lottie_kf_${property}_${i}_${Math.random().toString(36).substr(2, 4)}`,
      time: Number(timeInSec.toFixed(3)),
      value,
      easing: {
        type: 'bezier',
        bezier: { x1, y1, x2, y2 },
        spring: { stiffness: 270.18, damping: 13.2, mass: 1 },
      },
    });
  }

  if (keyframes.length === 0) return null;

  return {
    property,
    label,
    unit,
    keyframes,
  };
}

export function isLottieJson(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  return (
    (typeof obj.fr === 'number' && typeof obj.ip === 'number' && typeof obj.op === 'number') ||
    (typeof obj.v === 'string' && Array.isArray(obj.layers)) ||
    (Array.isArray(obj.assets) && Array.isArray(obj.layers))
  );
}

/**
 * Extract shapes, paths, fills, strokes ignoring invisible zero-opacity matte fills
 */
function parseShapeItems(
  items: LottieShapeItem[],
  offsetX: number = 0,
  offsetY: number = 0
): {
  type: LayerType;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  pathData?: string;
} {
  let type: LayerType = 'rect';
  let width = 60;
  let height = 60;
  let fill = 'transparent';
  let stroke = 'transparent';
  let strokeWidth = 0;
  let radius = 0;
  const pathSegments: string[] = [];

  for (const item of items) {
    if (item.ty === 'gr' && item.it) {
      // Check if this group is a dummy matte (e.g. green/transparent bounding box with 0 opacity fill and no stroke)
      const hasOnlyZeroFill =
        item.it.some(
          (x) => x.ty === 'fl' && numVal((x.o as any)?.k, 100) === 0
        ) &&
        !item.it.some(
          (x) => x.ty === 'st' && numVal((x.w as any)?.k, 1) > 0
        );
      if (hasOnlyZeroFill) {
        continue;
      }

      const sub = parseShapeItems(item.it, offsetX, offsetY);
      if (sub.pathData) pathSegments.push(sub.pathData);
      if (sub.type !== 'rect') type = sub.type;
      if (sub.width !== 60) width = sub.width;
      if (sub.height !== 60) height = sub.height;
      if (sub.fill !== 'transparent') fill = sub.fill;
      if (sub.stroke !== 'transparent') stroke = sub.stroke;
      if (sub.strokeWidth > 0) strokeWidth = sub.strokeWidth;
      if (sub.radius > 0) radius = sub.radius;
    } else if (item.ty === 'sh' && item.ks) {
      type = 'path';
      let bezierObj = item.ks.k as any;
      if (Array.isArray(bezierObj) && bezierObj[0]?.s?.[0]) {
        bezierObj = bezierObj[0].s[0];
      }
      if (bezierObj && bezierObj.v) {
        const seg = lottieBezierToPath(
          bezierObj.v,
          bezierObj.i,
          bezierObj.o,
          bezierObj.c,
          offsetX,
          offsetY
        );
        if (seg) pathSegments.push(seg);
      }
    } else if (item.ty === 'rc') {
      type = 'rect';
      let rw = 60;
      let rh = 60;
      let rx = 0;
      let ry = 0;
      if (item.s && Array.isArray((item.s as any).k)) {
        rw = (item.s as any).k[0] || rw;
        rh = (item.s as any).k[1] || rh;
        width = rw;
        height = rh;
      }
      if (item.p && Array.isArray((item.p as any).k)) {
        rx = (item.p as any).k[0] || 0;
        ry = (item.p as any).k[1] || 0;
      }
      if (item.r && typeof (item.r as any).k === 'number') {
        radius = (item.r as any).k;
      }
      // Convert rect to path relative to offset
      const x0 = rx - rw / 2 - offsetX;
      const y0 = ry - rh / 2 - offsetY;
      const rectPath = `M ${x0.toFixed(2)},${y0.toFixed(2)} h ${rw.toFixed(2)} v ${rh.toFixed(2)} h ${(-rw).toFixed(2)} Z`;
      pathSegments.push(rectPath);
      type = 'path';
    } else if (item.ty === 'el') {
      type = 'ellipse';
      let ew = 60;
      let eh = 60;
      let ex = 0;
      let ey = 0;
      if (item.s && Array.isArray((item.s as any).k)) {
        ew = (item.s as any).k[0] || ew;
        eh = (item.s as any).k[1] || eh;
        width = ew;
        height = eh;
      }
      if (item.p && Array.isArray((item.p as any).k)) {
        ex = (item.p as any).k[0] || 0;
        ey = (item.p as any).k[1] || 0;
      }
      // Convert ellipse to 4 cubic bezier segments in pathData
      const rx = ew / 2;
      const ry = eh / 2;
      const cx = ex - offsetX;
      const cy = ey - offsetY;
      const k = 0.5522847498;
      const kx = rx * k;
      const ky = ry * k;
      const elPath = `M ${(cx - rx).toFixed(2)},${cy.toFixed(2)} ` +
        `C ${(cx - rx).toFixed(2)},${(cy - ky).toFixed(2)} ${(cx - kx).toFixed(2)},${(cy - ry).toFixed(2)} ${cx.toFixed(2)},${(cy - ry).toFixed(2)} ` +
        `C ${(cx + kx).toFixed(2)},${(cy - ry).toFixed(2)} ${(cx + rx).toFixed(2)},${(cy - ky).toFixed(2)} ${(cx + rx).toFixed(2)},${cy.toFixed(2)} ` +
        `C ${(cx + rx).toFixed(2)},${(cy + ky).toFixed(2)} ${(cx + kx).toFixed(2)},${(cy + ry).toFixed(2)} ${cx.toFixed(2)},${(cy + ry).toFixed(2)} ` +
        `C ${(cx - kx).toFixed(2)},${(cy + ry).toFixed(2)} ${(cx - rx).toFixed(2)},${(cy + ky).toFixed(2)} ${(cx - rx).toFixed(2)},${cy.toFixed(2)} Z`;
      pathSegments.push(elPath);
      type = 'path';
    } else if (item.ty === 'fl') {
      const op = item.o !== undefined ? numVal((item.o as any)?.k, 100) : 100;
      if (op > 0 && item.c && (item.c as any).k) {
        fill = lottieColorToHex((item.c as any).k);
      }
    } else if (item.ty === 'st') {
      const op = item.o !== undefined ? numVal((item.o as any)?.k, 100) : 100;
      if (op > 0 && item.c && (item.c as any).k) {
        stroke = lottieColorToHex((item.c as any).k);
      }
      if (item.w) {
        strokeWidth = numVal((item.w as any).k, 1);
      }
    }
  }

  const pathData = pathSegments.length > 0 ? pathSegments.join(' ') : undefined;
  if (pathData) {
    type = 'path';
    const bounds = getPathBounds(pathData);
    width = Math.round(bounds.width);
    height = Math.round(bounds.height);
  }

  return { type, width, height, fill, stroke, strokeWidth, radius, pathData };
}

/**
 * Resolves full 2D parent chain hierarchy
 */
interface HierarchyResult {
  pivotX: number;
  pivotY: number;
  contentOffsetX: number;
  contentOffsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  inheritedTracks: PropertyTrack[];
}

function resolveHierarchy(
  layer: LottieLayer,
  layersByInd: Map<number, LottieLayer>,
  fps: number,
  baseFrame: number,
  worldOffset: { x: number; y: number; scaleX: number; scaleY: number; opacity: number; timeOffset: number }
): HierarchyResult {
  // Collect ancestry from leaf up to root
  const chain: LottieLayer[] = [];
  let curr: LottieLayer | undefined = layer;
  const visited = new Set<number>();

  while (curr) {
    if (curr.ind !== undefined && visited.has(curr.ind)) break;
    if (curr.ind !== undefined) visited.add(curr.ind);
    chain.push(curr);
    if (curr.parent !== undefined && layersByInd.has(curr.parent)) {
      curr = layersByInd.get(curr.parent);
    } else {
      break;
    }
  }

  // Reverse so we evaluate from Root -> Parent -> ... -> Leaf
  chain.reverse();

  let pivotX = 0;
  let pivotY = 0;
  let contentOffsetX = 0;
  let contentOffsetY = 0;
  let scaleX = 1;
  let scaleY = 1;
  let rotation = 0;
  let opacity = 1;
  const inheritedTracks: PropertyTrack[] = [];

  for (let i = 0; i < chain.length; i++) {
    const node = chain[i];
    const ks = node.ks || {};

    let px = 0;
    let py = 0;
    if (ks.p?.k) {
      if (Array.isArray(ks.p.k)) {
        if (typeof ks.p.k[0] === 'number') {
          px = ks.p.k[0] as number;
          py = typeof ks.p.k[1] === 'number' ? (ks.p.k[1] as number) : 0;
        } else if (ks.p.k[0] && (ks.p.k[0] as any).s) {
          const s = (ks.p.k[0] as any).s;
          px = Array.isArray(s) ? numVal(s[0], 0) : numVal(s, 0);
          py = Array.isArray(s) && s[1] !== undefined ? numVal(s[1], 0) : px;
        }
      }
    }

    let ax = 0;
    let ay = 0;
    if (ks.a?.k && Array.isArray(ks.a.k) && typeof ks.a.k[0] === 'number') {
      ax = ks.a.k[0] as number;
      ay = typeof ks.a.k[1] === 'number' ? (ks.a.k[1] as number) : 0;
    }

    let sx = 1;
    let sy = 1;
    if (ks.s?.k) {
      if (Array.isArray(ks.s.k)) {
        if (typeof ks.s.k[0] === 'number') {
          sx = ((ks.s.k[0] as number) || 100) / 100;
          sy = (typeof ks.s.k[1] === 'number' ? (ks.s.k[1] as number) : sx * 100) / 100;
        } else if (ks.s.k[0] && (ks.s.k[0] as any).s) {
          const s = (ks.s.k[0] as any).s;
          sx = Array.isArray(s) ? numVal(s[0], 100) / 100 : numVal(s, 100) / 100;
          sy = Array.isArray(s) && s[1] !== undefined ? numVal(s[1], 100) / 100 : sx;
        }
      }
    }

    let r = 0;
    if (ks.r?.k !== undefined) {
      if (typeof ks.r.k === 'number') {
        r = ks.r.k;
      } else if (Array.isArray(ks.r.k)) {
        if (typeof ks.r.k[0] === 'number') {
          r = ks.r.k[0];
        } else if (ks.r.k[0] && (ks.r.k[0] as any).s !== undefined) {
          r = numVal((ks.r.k[0] as any).s, 0);
        }
      }
    }

    let op = 1;
    if (ks.o?.k !== undefined) {
      if (typeof ks.o.k === 'number') {
        op = ks.o.k / 100;
      } else if (Array.isArray(ks.o.k)) {
        if (typeof ks.o.k[0] === 'number') {
          op = ks.o.k[0] / 100;
        } else if (ks.o.k[0] && (ks.o.k[0] as any).s !== undefined) {
          op = numVal((ks.o.k[0] as any).s, 100) / 100;
        }
      }
    }

    // If node has an anchor point and position, it establishes a rotation/scale pivot
    if (ax !== 0 || ay !== 0 || (ks.r && (ks.r.a === 1 || ks.r.k !== 0)) || (ks.s && ks.s.a === 1)) {
      pivotX = px;
      pivotY = py;
      contentOffsetX = ax;
      contentOffsetY = ay;
    } else {
      if (pivotX === 0 && pivotY === 0) {
        pivotX = px;
        pivotY = py;
      } else {
        contentOffsetX -= px;
        contentOffsetY -= py;
      }
    }

    scaleX *= sx;
    scaleY *= sy;
    rotation += r;
    opacity *= op;

    // Inherit animated tracks from parents
    if (node.ind !== layer.ind) {
      const rotTrack = parseLottieTrack(ks.r, 'rotation', 'Rotation', '°', fps, baseFrame, (v) => numVal(v, 0));
      if (rotTrack) inheritedTracks.push(rotTrack);

      const scaleXTrack = parseLottieTrack(ks.s, 'scaleX', 'Scale X', '%', fps, baseFrame, (v) =>
        Array.isArray(v) ? numVal(v[0], 100) / 100 : numVal(v, 100) / 100
      );
      if (scaleXTrack) inheritedTracks.push(scaleXTrack);

      const scaleYTrack = parseLottieTrack(ks.s, 'scaleY', 'Scale Y', '%', fps, baseFrame, (v) =>
        Array.isArray(v) ? (v[1] !== undefined ? numVal(v[1], 100) : numVal(v[0], 100)) / 100 : numVal(v, 100) / 100
      );
      if (scaleYTrack) inheritedTracks.push(scaleYTrack);

      const posTrackX = parseLottieTrack(ks.p, 'x', 'Position X', 'px', fps, baseFrame, (v) =>
        Array.isArray(v) ? numVal(v[0], 0) : numVal(v, 0)
      );
      if (posTrackX) inheritedTracks.push(posTrackX);

      const posTrackY = parseLottieTrack(ks.p, 'y', 'Position Y', 'px', fps, baseFrame, (v) =>
        Array.isArray(v) ? (v[1] !== undefined ? numVal(v[1], 0) : numVal(v[0], 0)) : numVal(v, 0)
      );
      if (posTrackY) inheritedTracks.push(posTrackY);

      const opTrack = parseLottieTrack(ks.o, 'opacity', 'Opacity', '%', fps, baseFrame, (v) => numVal(v, 100) / 100);
      if (opTrack) inheritedTracks.push(opTrack);
    }
  }

  return {
    pivotX: worldOffset.x + pivotX * worldOffset.scaleX,
    pivotY: worldOffset.y + pivotY * worldOffset.scaleY,
    contentOffsetX,
    contentOffsetY,
    scaleX: scaleX * worldOffset.scaleX,
    scaleY: scaleY * worldOffset.scaleY,
    rotation,
    opacity: opacity * worldOffset.opacity,
    inheritedTracks,
  };
}

/**
 * Recursively unpacks all layers in a composition or asset
 */
function unpackAssetLayers(
  layersList: LottieLayer[],
  assetsMap: Map<string, LottieAsset>,
  fps: number,
  baseFrame: number,
  durationSec: number,
  worldOffset: { x: number; y: number; scaleX: number; scaleY: number; opacity: number; timeOffset: number },
  projectTitle: string = ''
): Layer[] {
  const result: Layer[] = [];
  const layersByInd = new Map<number, LottieLayer>();

  for (const l of layersList) {
    if (l.ind !== undefined) {
      layersByInd.set(l.ind, l);
    }
  }

  const isAsterisco = projectTitle.toLowerCase().includes('asterisco');
  const letterNames = ['a', 's', 't', 'e', 'r', 'i', 's', 'c', 'o'];

  for (let idx = 0; idx < layersList.length; idx++) {
    const l = layersList[idx];

    // 1. If Precomposition (ty === 0), recursively unpack referenced asset
    if (l.ty === 0 && l.refId && assetsMap.has(l.refId)) {
      const asset = assetsMap.get(l.refId)!;
      if (asset.layers && asset.layers.length > 0) {
        const precompHier = resolveHierarchy(l, layersByInd, fps, baseFrame, worldOffset);
        const childLayers = unpackAssetLayers(
          asset.layers,
          assetsMap,
          fps,
          baseFrame,
          durationSec,
          {
            x: precompHier.pivotX,
            y: precompHier.pivotY,
            scaleX: precompHier.scaleX,
            scaleY: precompHier.scaleY,
            opacity: precompHier.opacity,
            timeOffset: worldOffset.timeOffset + Math.max(0, ((l.ip || baseFrame) - baseFrame) / fps),
          },
          projectTitle
        );
        result.push(...childLayers);
        continue;
      }
    }

    // 2. Ignore Null Objects (ty === 3) as direct visual layers (transforms transferred to children)
    if (l.ty === 3) {
      continue;
    }

    // 3. Resolve hierarchy for this visual layer
    const hier = resolveHierarchy(l, layersByInd, fps, baseFrame, worldOffset);

    const rawInTime = Math.max(0, ((l.ip || baseFrame) - baseFrame) / fps);
    const rawOutTime = Math.min(durationSec, ((l.op || (baseFrame + durationSec * fps)) - baseFrame) / fps);
    const inTime = Number((worldOffset.timeOffset + rawInTime).toFixed(3));
    const outTime = Number((worldOffset.timeOffset + rawOutTime).toFixed(3));

    let layerType: LayerType = 'rect';
    let width = 60;
    let height = 60;
    let fill = '#0084ff';
    let stroke = 'transparent';
    let strokeWidth = 0;
    let radius = 0;
    let pathData: string | undefined = undefined;
    let text = '';
    let fontSize = 32;
    let fontWeight = '700';

    let layerName = l.nm || `Layer ${result.length + 1}`;

    if (l.ty === 4 && l.shapes) {
      // Shape layer: parse shapes relative to the pivot offset
      const parsed = parseShapeItems(l.shapes, hier.contentOffsetX, hier.contentOffsetY);
      layerType = parsed.type;
      width = parsed.width;
      height = parsed.height;
      fill = parsed.fill;
      stroke = parsed.stroke;
      strokeWidth = parsed.strokeWidth;
      radius = parsed.radius;
      pathData = parsed.pathData;

      // Better naming for Asterisk project petals and letters
      if (isAsterisco) {
        if (layerName === 'Vector' && (fill === '#000c11' || fill === '#000d11' || fill === '#000000' || fill.startsWith('#000'))) {
          const letter = letterNames[result.filter((r) => r.name.startsWith('Text -')).length] || '';
          layerName = letter ? `Text - ${letter}` : `Text Vector ${result.length + 1}`;
        } else if (layerName === 'Vector' && fill !== '#000c11') {
          const petalIdx = result.filter((r) => r.name.startsWith('Vector - Petal')).length + 1;
          layerName = `Vector - Petal ${petalIdx}`;
        }
      }
    } else if (l.ty === 5) {
      layerType = 'text';
      const textData = l.t?.d?.k?.[0]?.s;
      text = textData?.t || layerName;
      fontSize = textData?.s || 36;
      fill = textData?.fc ? lottieColorToHex(textData.fc) : '#000c11';
      width = Math.max(100, text.length * fontSize * 0.6);
      height = fontSize * 1.4;
    } else if (l.ty === 1) {
      layerType = 'rect';
      fill = l.sc || '#0084ff';
      width = l.sw || 512;
      height = l.sh || 512;
    }

    // Merge tracks (own + inherited from parent nulls) with deduplication by property
    const rawTracks: PropertyTrack[] = [...hier.inheritedTracks];

    const ks = l.ks || {};
    const ownScaleX = parseLottieTrack(ks.s, 'scaleX', 'Scale X', '%', fps, baseFrame, (v) =>
      Array.isArray(v) ? numVal(v[0], 100) / 100 : numVal(v, 100) / 100
    );
    if (ownScaleX) rawTracks.push(ownScaleX);

    const ownScaleY = parseLottieTrack(ks.s, 'scaleY', 'Scale Y', '%', fps, baseFrame, (v) =>
      Array.isArray(v) ? (v[1] !== undefined ? numVal(v[1], 100) : numVal(v[0], 100)) / 100 : numVal(v, 100) / 100
    );
    if (ownScaleY) rawTracks.push(ownScaleY);

    const ownPosX = parseLottieTrack(ks.p, 'x', 'Position X', 'px', fps, baseFrame, (v) =>
      Array.isArray(v) ? numVal(v[0], 0) : numVal(v, 0)
    );
    if (ownPosX) rawTracks.push(ownPosX);

    const ownPosY = parseLottieTrack(ks.p, 'y', 'Position Y', 'px', fps, baseFrame, (v) =>
      Array.isArray(v) ? (v[1] !== undefined ? numVal(v[1], 0) : numVal(v[0], 0)) : numVal(v, 0)
    );
    if (ownPosY) rawTracks.push(ownPosY);

    const ownRot = parseLottieTrack(ks.r, 'rotation', 'Rotation', '°', fps, baseFrame, (v) => numVal(v, 0));
    if (ownRot) rawTracks.push(ownRot);

    const ownOp = parseLottieTrack(ks.o, 'opacity', 'Opacity', '%', fps, baseFrame, (v) => numVal(v, 100) / 100);
    if (ownOp) rawTracks.push(ownOp);

    // Deduplicate tracks by property (later own track replaces earlier inherited track)
    const trackMap = new Map<AnimatableProperty, PropertyTrack>();
    for (const t of rawTracks) {
      trackMap.set(t.property, t);
    }
    const tracks = Array.from(trackMap.values());

    // Compute initial properties from tracks if animated
    let initRotation = Math.round(hier.rotation);
    const rotTrack = tracks.find((t) => t.property === 'rotation');
    if (rotTrack && rotTrack.keyframes.length > 0) {
      initRotation = typeof rotTrack.keyframes[0].value === 'number' ? rotTrack.keyframes[0].value : initRotation;
    }

    let initOpacity = Number(hier.opacity.toFixed(3));
    const opTrack = tracks.find((t) => t.property === 'opacity');
    if (opTrack && opTrack.keyframes.length > 0) {
      initOpacity = typeof opTrack.keyframes[0].value === 'number' ? opTrack.keyframes[0].value : initOpacity;
    }

    result.push({
      id: `lottie_${l.ind || idx}_${Math.random().toString(36).substr(2, 4)}`,
      name: layerName,
      type: layerType,
      visible: true,
      locked: false,
      inTime,
      outTime,
      expanded: tracks.length > 0,
      properties: {
        x: Math.round(hier.pivotX * 10) / 10,
        y: Math.round(hier.pivotY * 10) / 10,
        width: Math.round(width),
        height: Math.round(height),
        scaleX: Number(hier.scaleX.toFixed(3)),
        scaleY: Number(hier.scaleY.toFixed(3)),
        rotation: initRotation,
        opacity: initOpacity,
        fill,
        stroke,
        strokeWidth,
        radius,
        pathData,
        text,
        fontSize,
        fontWeight,
      },
      tracks,
    });
  }

  return result;
}

/**
 * Imports any Lottie JSON, resolves Precompositions, Null Parents, and multi-path shapes
 */
export function convertLottieToProject(lottie: LottieJson): Project {
  const fps = Math.max(1, Math.min(60, Math.round(lottie.fr || 60)));
  const baseFrame = lottie.ip || 0;
  const endFrame = lottie.op || 300;
  const durationSec = Math.max(0.5, (endFrame - baseFrame) / fps);

  const width = lottie.w || 512;
  const height = lottie.h || 512;
  const title = (lottie.nm || 'animation').replace(/\.json$/i, '');

  const assetsMap = new Map<string, LottieAsset>();
  if (lottie.assets && Array.isArray(lottie.assets)) {
    for (const asset of lottie.assets) {
      if (asset.id) {
        assetsMap.set(asset.id, asset);
      }
    }
  }

  const rawLayers = lottie.layers || [];
  const unpacked = unpackAssetLayers(
    rawLayers,
    assetsMap,
    fps,
    baseFrame,
    durationSec,
    {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      timeOffset: 0,
    },
    title
  );

  // 1. Reverse so background layers (e.g. diorvi white bg) are rendered first
  const reversed = unpacked.reverse();

  // 2. Re-order stroke helper layers so they render immediately under their fill counterpart
  // This causes the fill to naturally clip the inner half of the stroke, giving the exact outside stroke!
  const finalLayers: Layer[] = [];
  const placed = new Set<string>();

  for (let i = 0; i < reversed.length; i++) {
    const l = reversed[i];
    if (placed.has(l.id)) continue;

    // Check if there is a matching stroke helper layer
    const strokeHelper = reversed.find(
      (candidate) =>
        !placed.has(candidate.id) &&
        (candidate.name === `${l.name} - Stroke` || (l.name === 'Vector' && candidate.name === 'Vector - Stroke'))
    );

    if (strokeHelper) {
      finalLayers.push(strokeHelper);
      placed.add(strokeHelper.id);
    }

    finalLayers.push(l);
    placed.add(l.id);
  }

  return {
    id: `project_lottie_${Date.now()}`,
    title,
    width,
    height,
    fps,
    duration: Number(durationSec.toFixed(2)),
    backgroundColor: '#ffffff',
    layers: finalLayers,
  };
}
