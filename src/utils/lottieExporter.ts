import { Keyframe, Layer, LayerProperties, Project, PropertyTrack } from '../types/animation';
import { getEasingBezier, getLayerPropertiesAtTime, parseColor } from './interpolator';
import { getShapePathData, parsePath } from './pathGeometry';
import { resolveBooleanGroup } from './booleanOps';
import { getChildren } from './layerTree';
import { t } from '../i18n';

/**
 * Lottie (Bodymovin JSON) export. Every top-level layer becomes a shape layer with its transform;
 * the layers of a plain group become nested shape groups, so the group's transform and opacity
 * apply to all of them. Rectangles and ellipses keep their native shapes; polygons, stars, paths
 * and boolean groups are written as Bézier paths.
 *
 * Bézier easing curves (linear, ease, back…) are written as they are. Curves Lottie doesn't have
 * (spring, bounce) and values that depend on several tracks with different keyframes are sampled
 * once per frame.
 *
 * "Optimized" writes the same animation in a smaller file: fewer decimals, sampled keyframes that
 * a straight line between their neighbours reproduces are dropped, and default values and the
 * names of the shapes are left out.
 */

export interface LottieExportOptions {
  fps?: number;
  transparent?: boolean;
  backgroundColor?: string;
  optimized?: boolean;
}

export interface LottieExportResult {
  json: string;
  // What Lottie can't show the same way, once per kind
  warnings: string[];
}

type Vec = number[];
type LottieKeyframe = Record<string, unknown>;
type LottieValue = { a: 0; k: unknown } | { a: 1; k: LottieKeyframe[] };

interface ShapeData {
  v: number[][];
  i: number[][];
  o: number[][];
  c: boolean;
}

interface Ctx {
  project: Project;
  fps: number;
  totalFrames: number;
  optimized: boolean;
  warnings: Set<string>;
}

const EPS = 1e-6;

// ── Numbers ─────────────────────────────────────────────────────────────────

const roundTo = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};
const valueDecimals = (ctx: Ctx) => (ctx.optimized ? 2 : 3);
const easeDecimals = (ctx: Ctx) => (ctx.optimized ? 3 : 4);
const fmtVec = (ctx: Ctx, v: Vec) => v.map((n) => roundTo(n, valueDecimals(ctx)));
// Tolerance for dropping sampled keyframes in the optimized file (in Lottie units: px, %, °)
const REDUCE_TOLERANCE = 0.05;

const toFrame = (ctx: Ctx, time: number) => roundTo(time * ctx.fps, 3);

// ── Easing ──────────────────────────────────────────────────────────────────

// Bézier handles of a keyframe's curve, or null when Lottie can't express it (spring, bounce)
function easingHandles(k: Keyframe): { x1: number; y1: number; x2: number; y2: number } | null {
  if (k.easing.type === 'linear') return { x1: 0, y1: 0, x2: 1, y2: 1 };
  return getEasingBezier(k.easing);
}

const sameEasing = (a: Keyframe, b: Keyframe) => {
  const ha = easingHandles(a);
  const hb = easingHandles(b);
  if (!ha || !hb) return false;
  return Math.abs(ha.x1 - hb.x1) < EPS && Math.abs(ha.y1 - hb.y1) < EPS && Math.abs(ha.x2 - hb.x2) < EPS && Math.abs(ha.y2 - hb.y2) < EPS;
};

const animatedTracks = (tracks: (PropertyTrack | undefined)[]) =>
  tracks.filter((track): track is PropertyTrack => !!track && track.keyframes.length > 1);

/**
 * Keyframe times shared by every track, when they all have keyframes at the same times with the
 * same curves (then any affine mix of their values follows that curve too). Null otherwise.
 */
function alignedKeyframes(tracks: PropertyTrack[]): Keyframe[] | null {
  const first = tracks[0].keyframes;
  for (const track of tracks.slice(1)) {
    const kfs = track.keyframes;
    if (kfs.length !== first.length) return null;
    for (let i = 0; i < kfs.length; i++) {
      if (Math.abs(kfs[i].time - first[i].time) > EPS) return null;
      if (i < kfs.length - 1) {
        const a = easingHandles(first[i]);
        const b = easingHandles(kfs[i]);
        // Spring and bounce are sampled: they only need the same type and parameters
        if (!a || !b) {
          if (JSON.stringify(first[i].easing) !== JSON.stringify(kfs[i].easing)) return null;
        } else if (!sameEasing(first[i], kfs[i])) {
          return null;
        }
      }
    }
  }
  return first;
}

// The start time plus every frame of the animation after it, before the end time: sampled
// values land on the frames players draw, so they are exact there
function frameTimes(ctx: Ctx, from: number, to: number): number[] {
  const times = [from];
  for (let frame = Math.floor(from * ctx.fps + EPS) + 1; frame / ctx.fps < to - EPS; frame++) times.push(frame / ctx.fps);
  return times;
}

const linearEase = (dims: number) => ({ o: { x: Array(dims).fill(0), y: Array(dims).fill(0) }, i: { x: Array(dims).fill(1), y: Array(dims).fill(1) } });

/** Drops sampled keyframes that a straight line between their neighbours reproduces */
function reduceLinear<P extends { time: number; value: Vec; linear: boolean }>(points: P[], tolerance: number): P[] {
  if (points.length < 3) return points;
  const keep = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = keep[keep.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!cur.linear || !prev.linear) {
      keep.push(cur);
      continue;
    }
    const f = (cur.time - prev.time) / (next.time - prev.time || 1);
    const fits = cur.value.every((v, d) => Math.abs(prev.value[d] + (next.value[d] - prev.value[d]) * f - v) <= tolerance);
    // A dropped point may still be needed for the next ones: compare against the kept one
    if (!fits) keep.push(cur);
  }
  keep.push(points[points.length - 1]);
  return keep;
}

/**
 * A Lottie property from Nori tracks. evaluate gives the Lottie value at a time (computed from
 * the layer's animated values); tracks are the ones it depends on. affine: the value is a sum or
 * scale of the track values (then aligned keyframes can be written as they are).
 */
function buildProperty(
  ctx: Ctx,
  tracks: (PropertyTrack | undefined)[],
  evaluate: (time: number) => Vec,
  options: { affine?: boolean; scalar?: boolean } = {}
): LottieValue {
  const { affine = true, scalar = false } = options;
  const out = (v: Vec) => (scalar ? fmtVec(ctx, v)[0] : fmtVec(ctx, v));
  const animated = animatedTracks(tracks);
  if (animated.length === 0) {
    const start = tracks.find((tr) => tr?.keyframes.length === 1)?.keyframes[0].time ?? 0;
    return { a: 0, k: out(evaluate(start)) };
  }

  const dims = evaluate(0).length;
  const points: { time: number; value: Vec; linear: boolean; ease?: ReturnType<typeof linearEase> }[] = [];
  const aligned = affine ? alignedKeyframes(animated) : null;

  if (aligned) {
    aligned.forEach((k, idx) => {
      const handles = idx < aligned.length - 1 ? easingHandles(k) : null;
      if (idx < aligned.length - 1 && !handles) {
        // Spring / bounce: one keyframe per frame along the segment
        for (const time of frameTimes(ctx, k.time, aligned[idx + 1].time)) {
          points.push({ time, value: evaluate(time), linear: true });
        }
        return;
      }
      const e = easeDecimals(ctx);
      points.push({
        time: k.time,
        value: evaluate(k.time),
        linear: false,
        ease: handles
          ? {
              o: { x: Array(dims).fill(roundTo(handles.x1, e)), y: Array(dims).fill(roundTo(handles.y1, e)) },
              i: { x: Array(dims).fill(roundTo(handles.x2, e)), y: Array(dims).fill(roundTo(handles.y2, e)) },
            }
          : undefined,
      });
    });
  } else {
    const start = Math.min(...animated.map((tr) => tr.keyframes[0].time));
    const end = Math.max(...animated.map((tr) => tr.keyframes[tr.keyframes.length - 1].time));
    for (const time of frameTimes(ctx, start, end)) points.push({ time, value: evaluate(time), linear: true });
    points.push({ time: end, value: evaluate(end), linear: true });
  }

  const reduced = ctx.optimized ? reduceLinear(points, REDUCE_TOLERANCE) : points;
  // Every value the same: a static property
  if (reduced.every((p) => fmtVec(ctx, p.value).every((v, d) => v === fmtVec(ctx, reduced[0].value)[d]))) {
    return { a: 0, k: out(reduced[0].value) };
  }
  const k: LottieKeyframe[] = reduced.map((p, idx) => {
    const kf: LottieKeyframe = { t: toFrame(ctx, p.time), s: fmtVec(ctx, p.value) };
    if (idx < reduced.length - 1) Object.assign(kf, p.ease ?? linearEase(dims));
    return kf;
  });
  return { a: 1, k };
}

// ── Paths ───────────────────────────────────────────────────────────────────

type Pt = [number, number];

// Cubic Béziers of an SVG arc (SVG spec, appendix F.6)
function arcToCubics(x1: number, y1: number, values: number[]): number[][] {
  let [rx, ry] = values;
  const [, , angle, largeArc, sweep, x2, y2] = values;
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / (den || 1)));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const vecAngle = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = vecAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = vecAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (a: number): Pt => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
  const deriv = (a: number): Pt => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
  const curves: number[][] = [];
  for (let s = 0; s < parts; s++) {
    const a1 = theta1 + s * step;
    const a2 = a1 + step;
    const p1 = point(a1);
    const p2 = point(a2);
    const d1 = deriv(a1);
    const d2 = deriv(a2);
    curves.push([p1[0] + k * d1[0], p1[1] + k * d1[1], p2[0] - k * d2[0], p2[1] - k * d2[1], p2[0], p2[1]]);
  }
  return curves;
}

/** SVG path data as Lottie shapes (one per subpath): vertices with tangents relative to them */
export function pathToShapes(d: string): ShapeData[] {
  const shapes: ShapeData[] = [];
  let current: ShapeData | null = null;
  let x = 0;
  let y = 0;

  const finish = (closed: boolean) => {
    if (!current) return;
    if (current.v.length > 0) {
      current.c = closed;
      // A closing segment that ends on the first vertex: that vertex takes its in-tangent
      const n = current.v.length;
      if (closed && n > 1) {
        const [fx, fy] = current.v[0];
        const [lx, ly] = current.v[n - 1];
        if (Math.abs(fx - lx) < 1e-6 && Math.abs(fy - ly) < 1e-6) {
          current.i[0] = current.i[n - 1];
          current.v.pop();
          current.i.pop();
          current.o.pop();
        }
      }
      shapes.push(current);
    }
    current = null;
  };
  const cubicTo = (c1x: number, c1y: number, c2x: number, c2y: number, ex: number, ey: number) => {
    if (!current) current = { v: [[x, y]], i: [[0, 0]], o: [[0, 0]], c: false };
    const last = current.v.length - 1;
    current.o[last] = [c1x - x, c1y - y];
    current.v.push([ex, ey]);
    current.i.push([c2x - ex, c2y - ey]);
    current.o.push([0, 0]);
    x = ex;
    y = ey;
  };

  let startX = 0;
  let startY = 0;
  for (const seg of parsePath(d)) {
    const v = seg.values;
    switch (seg.cmd) {
      case 'M':
        finish(false);
        x = startX = v[0];
        y = startY = v[1];
        current = { v: [[x, y]], i: [[0, 0]], o: [[0, 0]], c: false };
        break;
      case 'L':
        cubicTo(x, y, v[0], v[1], v[0], v[1]);
        break;
      case 'C':
        cubicTo(v[0], v[1], v[2], v[3], v[4], v[5]);
        break;
      case 'Q': {
        const [qx, qy, ex, ey] = v;
        cubicTo(x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
        break;
      }
      case 'A':
        for (const c of arcToCubics(x, y, v)) cubicTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        break;
      case 'Z':
        finish(true);
        x = startX;
        y = startY;
        break;
    }
  }
  finish(false);
  return shapes;
}

const shapeTopology = (s: ShapeData) => `${s.v.length}${s.c ? 'c' : 'o'}`;
const EMPTY_SHAPE: ShapeData = { v: [[0, 0]], i: [[0, 0]], o: [[0, 0]], c: true };

/**
 * The same outline with count vertices: some vertices are repeated in place (the curve that
 * leaves them moves to the copy), spread along the outline. Players keep the vertex count of a
 * path's first keyframe, so every keyframe of a path gets the same count.
 */
function padShape(s: ShapeData, count: number): ShapeData {
  const n = s.v.length;
  const extra = count - n;
  if (extra <= 0 || n === 0) return s;
  const copies = new Array(n).fill(0);
  for (let k = 0; k < extra; k++) copies[Math.floor((k * n) / extra)]++;
  const out: ShapeData = { v: [], i: [], o: [], c: s.c };
  for (let j = 0; j < n; j++) {
    out.v.push(s.v[j]);
    out.i.push(s.i[j]);
    out.o.push(copies[j] > 0 ? [0, 0] : s.o[j]);
    for (let c = 0; c < copies[j]; c++) {
      out.v.push(s.v[j]);
      out.i.push([0, 0]);
      out.o.push(c === copies[j] - 1 ? s.o[j] : [0, 0]);
    }
  }
  return out;
}

const fmtShape = (ctx: Ctx, s: ShapeData) => ({
  i: s.i.map((p) => fmtVec(ctx, p)),
  o: s.o.map((p) => fmtVec(ctx, p)),
  v: s.v.map((p) => fmtVec(ctx, p)),
  c: s.c,
});

const flattenShape = (s: ShapeData) => [...s.v.flat(), ...s.i.flat(), ...s.o.flat()];

/**
 * Path items ('sh') for a shape that may change over time. samples: times and outlines; the
 * outline is the same between two samples with the same topology? It is interpolated linearly;
 * otherwise the first one is held. With one sample (or all equal) the path is static.
 */
function buildPathItems(
  ctx: Ctx,
  samples: { time: number; d: string; ease?: { x1: number; y1: number; x2: number; y2: number } | null }[]
): LottieShapeItem[] {
  const parsed = samples.map((s) => ({ ...s, shapes: pathToShapes(s.d) }));
  const count = Math.max(0, ...parsed.map((p) => p.shapes.length));
  const items: LottieShapeItem[] = [];
  for (let n = 0; n < count; n++) {
    let frames = parsed.map((p) => ({ time: p.time, shape: p.shapes[n] ?? EMPTY_SHAPE, ease: p.ease }));
    const vertices = Math.max(...frames.map((f) => f.shape.v.length));
    frames = frames.map((f) => ({ ...f, shape: padShape(f.shape, vertices) }));
    // Consecutive equal outlines only need their first keyframe (and the last one)
    const key = (s: ShapeData) => JSON.stringify(fmtShape(ctx, s));
    frames = frames.filter((f, i) => i === 0 || i === frames.length - 1 || key(f.shape) !== key(frames[i - 1].shape) || key(f.shape) !== key(frames[i + 1].shape));
    if (ctx.optimized && frames.length > 2) {
      // Drop sampled outlines that a straight morph between their neighbours reproduces
      const kept = [frames[0]];
      for (let i = 1; i < frames.length - 1; i++) {
        const prev = kept[kept.length - 1];
        const cur = frames[i];
        const next = frames[i + 1];
        const same = shapeTopology(prev.shape) === shapeTopology(cur.shape) && shapeTopology(cur.shape) === shapeTopology(next.shape);
        if (!same || cur.ease !== undefined || prev.ease !== undefined) {
          kept.push(cur);
          continue;
        }
        const f = (cur.time - prev.time) / (next.time - prev.time || 1);
        const a = flattenShape(prev.shape);
        const b = flattenShape(next.shape);
        const c = flattenShape(cur.shape);
        if (!c.every((v, d) => Math.abs(a[d] + (b[d] - a[d]) * f - v) <= REDUCE_TOLERANCE)) kept.push(cur);
      }
      kept.push(frames[frames.length - 1]);
      frames = kept;
    }

    const allSame = frames.every((f) => key(f.shape) === key(frames[0].shape));
    const ks: LottieValue = allSame
      ? { a: 0, k: fmtShape(ctx, frames[0].shape) }
      : {
          a: 1,
          k: frames.map((f, i) => {
            const kf: LottieKeyframe = { t: toFrame(ctx, f.time), s: [fmtShape(ctx, f.shape)] };
            if (i === frames.length - 1) return kf;
            const next = frames[i + 1];
            if (shapeTopology(f.shape) !== shapeTopology(next.shape)) {
              kf.h = 1;
            } else {
              const e = easeDecimals(ctx);
              const h = f.ease ?? { x1: 0, y1: 0, x2: 1, y2: 1 };
              kf.o = { x: [roundTo(h.x1, e)], y: [roundTo(h.y1, e)] };
              kf.i = { x: [roundTo(h.x2, e)], y: [roundTo(h.y2, e)] };
            }
            return kf;
          }),
        };
    items.push({ ty: 'sh', nm: `${t('Trazado')} ${n + 1}`, ks, d: 1 } as LottieShapeItem);
  }
  return items;
}

// ── Layers ──────────────────────────────────────────────────────────────────

type LottieShapeItem = Record<string, unknown> & { ty: string };

const trackOf = (layer: Layer, property: string) => layer.tracks.find((tr) => tr.property === property);

const props = (layer: Layer, time: number) => getLayerPropertiesAtTime(layer, time);

const colorVec = (color: string | undefined): Vec => {
  const c = parseColor(color || '#000000');
  return [c.r / 255, c.g / 255, c.b / 255, 1];
};

// Whether a color track ever uses "no color" or a translucent color (then the alpha moves into
// the opacity and both are sampled)
const hasTranslucentColor = (base: string | undefined, track: PropertyTrack | undefined) =>
  [base, ...(track?.keyframes.map((k) => String(k.value)) ?? [])].some((c) => !c || parseColor(c).a < 0.999);

const isNone = (c: unknown) => !c || c === 'transparent';

// Times a layer's whole range is sampled at (boolean groups, whose shapes may move at any time)
function layerFrameTimes(ctx: Ctx, layer: Layer) {
  const start = Math.max(0, layer.inTime);
  const end = Math.min(ctx.project.duration, layer.outTime);
  return [...frameTimes(ctx, start, end), end];
}

/**
 * Transform of a layer: a, p, s, r, o (as for a layer's ks or a group's tr). Layers split the
 * position into x and y (each keeps its own keyframes); shape groups can't (lottie-web's SVG
 * renderer drops the whole animation), so theirs is one [x, y] value.
 */
function buildTransform(ctx: Ctx, layer: Layer, opacityGate?: (time: number) => number, shapeGroup = false) {
  const x = trackOf(layer, 'x');
  const y = trackOf(layer, 'y');
  const ax = trackOf(layer, 'anchorX');
  const ay = trackOf(layer, 'anchorY');
  const sx = trackOf(layer, 'scaleX');
  const sy = trackOf(layer, 'scaleY');
  const rot = trackOf(layer, 'rotation');
  const op = trackOf(layer, 'opacity');
  const at = (time: number) => props(layer, time);

  // Lottie turns around its anchor point, placed at the position: position = Nori position + anchor
  const transform: Record<string, unknown> = {
    a: buildProperty(ctx, [ax, ay], (time) => [at(time).anchorX || 0, at(time).anchorY || 0, 0]),
    p: shapeGroup
      ? buildProperty(ctx, [x, y, ax, ay], (time) => [at(time).x + (at(time).anchorX || 0), at(time).y + (at(time).anchorY || 0)])
      : {
          s: true,
          x: buildProperty(ctx, [x, ax], (time) => [at(time).x + (at(time).anchorX || 0)], { scalar: true }),
          y: buildProperty(ctx, [y, ay], (time) => [at(time).y + (at(time).anchorY || 0)], { scalar: true }),
        },
    s: buildProperty(ctx, [sx, sy], (time) => [(at(time).scaleX ?? 1) * 100, (at(time).scaleY ?? 1) * 100, 100]),
    r: buildProperty(ctx, [rot], (time) => [at(time).rotation || 0], { scalar: true }),
    o: opacityGate
      ? buildGatedOpacity(ctx, layer, opacityGate)
      : buildProperty(ctx, [op], (time) => [Math.max(0, Math.min(1, at(time).opacity ?? 1)) * 100], { scalar: true }),
  };
  return transform;
}

// Opacity of a layer inside a group whose time range is shorter than the group's: sampled per
// frame, 0 outside its range
function buildGatedOpacity(ctx: Ctx, layer: Layer, gate: (time: number) => number): LottieValue {
  const times = [...frameTimes(ctx, 0, ctx.project.duration), ctx.project.duration];
  const points = times.map((time) => ({
    time,
    value: [gate(time) * Math.max(0, Math.min(1, props(layer, time).opacity ?? 1)) * 100],
    linear: true,
  }));
  const reduced = ctx.optimized ? reduceLinear(points, REDUCE_TOLERANCE) : points;
  if (reduced.every((p) => p.value[0] === reduced[0].value[0])) return { a: 0, k: roundTo(reduced[0].value[0], valueDecimals(ctx)) };
  return {
    a: 1,
    k: reduced.map((p, i) => {
      const kf: LottieKeyframe = { t: toFrame(ctx, p.time), s: fmtVec(ctx, p.value) };
      // Appearing and disappearing are instant
      if (i < reduced.length - 1) {
        const next = reduced[i + 1];
        if ((p.value[0] === 0) !== (next.value[0] === 0)) kf.h = 1;
        else Object.assign(kf, linearEase(1));
      }
      return kf;
    }),
  };
}

const shapeTransform = (ctx: Ctx, transform: Record<string, unknown>) => ({
  ty: 'tr',
  ...transform,
  ...(ctx.optimized ? {} : { sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 } }),
  nm: t('Transformar'),
});

/** Geometry items of a shape layer */
function buildGeometry(ctx: Ctx, layer: Layer): LottieShapeItem[] {
  const w = trackOf(layer, 'width');
  const h = trackOf(layer, 'height');
  const radius = trackOf(layer, 'radius');
  const at = (time: number) => props(layer, time);

  if (layer.type === 'rect') {
    return [
      {
        ty: 'rc',
        nm: t('Rectángulo'),
        d: 1,
        p: { a: 0, k: [0, 0] },
        s: buildProperty(ctx, [w, h], (time) => [at(time).width, at(time).height]),
        // Nori never rounds a corner past half the shorter side
        r: buildProperty(
          ctx,
          [radius, w, h],
          (time) => [Math.max(0, Math.min(at(time).radius || 0, at(time).width / 2, at(time).height / 2))],
          { affine: false, scalar: true }
        ),
      },
    ];
  }
  if (layer.type === 'ellipse') {
    return [
      {
        ty: 'el',
        nm: t('Elipse'),
        d: 1,
        p: { a: 0, k: [0, 0] },
        s: buildProperty(ctx, [w, h], (time) => [at(time).width, at(time).height]),
      },
    ];
  }

  if (layer.type === 'boolean') {
    const samples = layerFrameTimes(ctx, layer).map((time) => ({ time, d: resolveBooleanGroup(ctx.project.layers, layer, time).d ?? '' }));
    if (samples.some((s) => !s.d)) ctx.warnings.add(t('Algún fotograma de un grupo booleano no se pudo calcular y quedó vacío.'));
    return buildPathItems(ctx, samples);
  }

  // Paths morph with their own keyframes when the outlines can be blended
  if (layer.type === 'path') {
    const morph = trackOf(layer, 'pathData');
    if (!morph || morph.keyframes.length < 2) {
      return buildPathItems(ctx, [{ time: 0, d: String(morph?.keyframes[0]?.value ?? layer.properties.pathData ?? '') }]);
    }
    const kfs = morph.keyframes;
    const topologies = kfs.map((k) => pathToShapes(String(k.value)).map(shapeTopology).join('|'));
    const blendable = topologies.every((tp) => tp === topologies[0]) && kfs.every((k, i) => i === kfs.length - 1 || easingHandles(k));
    if (blendable) {
      return buildPathItems(
        ctx,
        kfs.map((k, i) => ({ time: k.time, d: String(k.value), ease: i < kfs.length - 1 ? easingHandles(k) : undefined }))
      );
    }
    const start = kfs[0].time;
    const end = kfs[kfs.length - 1].time;
    return buildPathItems(ctx, [...frameTimes(ctx, start, end), end].map((time) => ({ time, d: at(time).pathData ?? '' })));
  }

  // Polygons, stars and capsules: their outline, sampled while their size or corners change
  const geometryTracks = animatedTracks([w, h, radius]);
  const d = (time: number) => getShapePathData(layer.type, at(time)) ?? '';
  if (geometryTracks.length === 0) return buildPathItems(ctx, [{ time: 0, d: d(0) }]);
  const start = Math.min(...geometryTracks.map((tr) => tr.keyframes[0].time));
  const end = Math.max(...geometryTracks.map((tr) => tr.keyframes[tr.keyframes.length - 1].time));
  return buildPathItems(ctx, [...frameTimes(ctx, start, end), end].map((time) => ({ time, d: d(time) })));
}

/** Fill and stroke items (the stroke first: Lottie draws the items listed first on top) */
function buildPaint(ctx: Ctx, layer: Layer): LottieShapeItem[] {
  const base = layer.properties;
  const at = (time: number) => props(layer, time);
  const items: LottieShapeItem[] = [];
  const roundJoins = layer.type === 'path';

  const fillTrack = trackOf(layer, 'fill');
  const hasFill = !isNone(base.fill) || !!fillTrack?.keyframes.some((k) => !isNone(k.value));
  const strokeTrack = trackOf(layer, 'stroke');
  const hasStroke =
    (!isNone(base.stroke) || !!strokeTrack?.keyframes.some((k) => !isNone(k.value))) &&
    ((base.strokeWidth || 0) > 0 || !!trackOf(layer, 'strokeWidth'));

  // Color and opacity of a paint: the color's alpha ("no color" fades) goes into the opacity
  const paint = (color: 'fill' | 'stroke', opacityProp: 'fillOpacity' | 'strokeOpacity') => {
    const colorTrack = trackOf(layer, color);
    const opacityTrack = trackOf(layer, opacityProp);
    const translucent = hasTranslucentColor(base[color], colorTrack);
    const rgb = (time: number) => colorVec(at(time)[color]);
    const alpha = (time: number) => {
      const c = at(time)[color];
      return isNone(c) ? 0 : parseColor(c).a;
    };
    return {
      c: buildProperty(ctx, [colorTrack], (time) => rgb(time).map((v, i) => (i < 3 ? v : 1)), { affine: !translucent }),
      o: buildProperty(
        ctx,
        translucent ? [colorTrack, opacityTrack] : [opacityTrack],
        (time) => [Math.max(0, Math.min(1, at(time)[opacityProp] ?? 1)) * alpha(time) * 100],
        { affine: !translucent, scalar: true }
      ),
    };
  };

  if (hasStroke) {
    if ((base.strokeAlign ?? 'center') !== 'center') {
      ctx.warnings.add(t('Lottie no tiene trazos interiores ni exteriores: se exportan centrados.'));
    }
    items.push({
      ty: 'st',
      nm: t('Trazo'),
      ...paint('stroke', 'strokeOpacity'),
      w: buildProperty(ctx, [trackOf(layer, 'strokeWidth')], (time) => [at(time).strokeWidth || 0], { scalar: true }),
      lc: roundJoins ? 2 : 1,
      lj: roundJoins ? 2 : 1,
      ml: 4,
    });
  }
  if (hasFill) {
    items.push({
      ty: 'fl',
      nm: t('Relleno'),
      ...paint('fill', 'fillOpacity'),
      // Paths and boolean results keep their holes as in Nori
      r: layer.type === 'path' ? 2 : 1,
    });
  }
  return items;
}

const hasShadow = (p: LayerProperties) => !!(p.dropShadow?.enabled || p.innerShadow?.enabled);

function noteEffects(ctx: Ctx, layer: Layer, nested: boolean) {
  const p = layer.properties;
  if (hasShadow(p)) ctx.warnings.add(t('Las sombras no se exportan a Lottie.'));
  const blurred = (p.blur ?? 0) > 0 || !!trackOf(layer, 'blur');
  if (blurred && nested) ctx.warnings.add(t('El desenfoque de las capas dentro de un grupo no se exporta a Lottie.'));
}

/** Content items of a layer (inside a shape layer or a shape group) */
function buildContent(ctx: Ctx, layer: Layer, nested: boolean): LottieShapeItem[] {
  noteEffects(ctx, layer, nested);
  if (layer.type === 'group') {
    const children = getChildren(ctx.project.layers, layer.id).filter((c) => c.visible);
    // Lottie lists the front-most item first
    return children.reverse().flatMap((child) => buildGroupItem(ctx, child, layer));
  }
  if (layer.type === 'text') {
    ctx.warnings.add(t('Los textos no se exportan a Lottie.'));
    return [];
  }
  return [...buildGeometry(ctx, layer), ...buildPaint(ctx, layer)];
}

// A layer inside a plain group, as a shape group with its own transform
function buildGroupItem(ctx: Ctx, layer: Layer, parent: Layer): LottieShapeItem[] {
  const content = buildContent(ctx, layer, true);
  if (content.length === 0) return [];
  // A layer that starts later or ends earlier than its group shows only in its own range
  const gated = layer.inTime > parent.inTime + EPS || layer.outTime < parent.outTime - EPS;
  const gate = gated ? (time: number) => (time >= layer.inTime && time <= layer.outTime ? 1 : 0) : undefined;
  return [
    {
      ty: 'gr',
      nm: layer.name,
      it: [...content, shapeTransform(ctx, buildTransform(ctx, layer, gate, true))],
      np: content.length,
    },
  ];
}

// Gaussian blur effect of a top-level layer (lottie-web's blurriness is about 3 times the deviation)
function buildBlurEffect(ctx: Ctx, layer: Layer) {
  const track = trackOf(layer, 'blur');
  if ((layer.properties.blur ?? 0) <= 0 && !track) return null;
  ctx.warnings.add(t('El desenfoque se exporta como efecto de Lottie: algunos reproductores (como los de iOS y Android) no lo muestran.'));
  return [
    {
      ty: 29,
      nm: 'Gaussian Blur',
      np: 5,
      en: 1,
      ef: [
        { ty: 0, nm: 'Blurriness', v: buildProperty(ctx, [track], (time) => [Math.max(0, Number(props(layer, time).blur) || 0) / 0.3], { scalar: true }) },
        { ty: 7, nm: 'Blur Dimensions', v: { a: 0, k: 1 } },
        { ty: 7, nm: 'Repeat Edge Pixels', v: { a: 0, k: 0 } },
      ],
    },
  ];
}

const layerFrames = (ctx: Ctx, layer: Layer) => ({
  ip: Math.max(0, Math.round(layer.inTime * ctx.fps)),
  op: layer.outTime >= ctx.project.duration - 1e-3 ? ctx.totalFrames : Math.min(ctx.totalFrames, Math.round(layer.outTime * ctx.fps)),
});

function buildShapeLayer(ctx: Ctx, layer: Layer, index: number) {
  const shapes = buildContent(ctx, layer, false);
  if (shapes.length === 0) return null;
  const effects = buildBlurEffect(ctx, layer);
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: layer.name,
    ...(ctx.optimized ? {} : { sr: 1, ao: 0, bm: 0 }),
    ks: buildTransform(ctx, layer),
    ...(effects ? { ef: effects } : {}),
    shapes,
    ...layerFrames(ctx, layer),
    st: 0,
  };
}

// ── Document ────────────────────────────────────────────────────────────────

export function exportToLottie(project: Project, options: LottieExportOptions = {}): LottieExportResult {
  const fps = options.fps || project.fps || 30;
  const ctx: Ctx = {
    project,
    fps,
    totalFrames: Math.max(1, Math.round(project.duration * fps)),
    optimized: !!options.optimized,
    warnings: new Set(),
  };

  // Lottie lists the front-most layer first
  const roots = project.layers.filter((l) => !l.parentId && l.visible).reverse();
  const layers: Record<string, unknown>[] = [];
  roots.forEach((layer) => {
    const built = buildShapeLayer(ctx, layer, layers.length + 1);
    if (built) layers.push(built);
  });

  if (!options.transparent) {
    const color = options.backgroundColor || project.backgroundColor;
    if (color && color !== 'transparent') {
      layers.push({
        ddd: 0,
        ind: layers.length + 1,
        ty: 1,
        nm: t('Fondo'),
        sc: color.slice(0, 7),
        sw: project.width,
        sh: project.height,
        ks: {
          a: { a: 0, k: [0, 0, 0] },
          p: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] },
          r: { a: 0, k: 0 },
          o: { a: 0, k: 100 },
        },
        ip: 0,
        op: ctx.totalFrames,
        st: 0,
      });
    }
  }

  const doc = {
    v: '5.7.4',
    fr: fps,
    ip: 0,
    op: ctx.totalFrames,
    w: project.width,
    h: project.height,
    nm: project.title,
    ddd: 0,
    assets: [],
    layers,
    ...(ctx.optimized ? {} : { markers: [], meta: { g: 'Nori' } }),
  };

  // The optimized file leaves out the names of shapes and transforms (layers keep theirs)
  const json = ctx.optimized
    ? JSON.stringify(doc, function (this: Record<string, unknown>, key, value) {
        if (key === 'nm' && typeof this.ty === 'string') return undefined;
        return value;
      })
    : JSON.stringify(doc);
  return { json, warnings: [...ctx.warnings] };
}
