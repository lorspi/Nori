import { AnimatableProperty, Keyframe, Layer, LayerProperties, LayerType, Project } from '../types/animation';
import { createDefaultEasing, createTrack } from './animationTracks';
import { parseColor } from './interpolator';
import { t } from '../i18n';

/**
 * SVG importer: converts an SVG document into a complete Nori project.
 *
 * The SVG is mounted (invisibly) in the document so the browser resolves CSS, inheritance,
 * nested transforms and viewBoxes. Animated SVGs (SMIL <animate>/<animateTransform>/
 * <animateMotion> or CSS @keyframes) are paused and sampled frame by frame; every animated
 * property becomes a track whose keyframes are simplified to the minimum needed to
 * reproduce the motion with linear interpolation.
 */

export interface SvgImportResult {
  layers: Layer[];
  width: number; // SVG canvas size (viewBox) in px
  height: number;
  animated: boolean;
  duration: number; // seconds of animation found (0 when static)
  skipped: number; // unsupported elements (images, <use>, …)
}

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text']);
// Content inside these elements is never painted directly
const NON_RENDERED_ANCESTORS = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter']);
const MAX_ANIMATION_SECONDS = 60;
const MAX_SAMPLES = 1800;

// Tolerances used when simplifying sampled curves
const TOLERANCE: Partial<Record<AnimatableProperty, number>> = {
  x: 0.25,
  y: 0.25,
  scaleX: 0.002,
  scaleY: 0.002,
  rotation: 0.1,
  opacity: 0.004,
  width: 0.25,
  height: 0.25,
  strokeWidth: 0.05,
};

export function isSvgText(text: string) {
  return /<svg[\s>]/i.test(text);
}

interface Sample {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  width?: number;
  height?: number;
}

interface ShapeInfo {
  el: SVGGraphicsElement;
  type: LayerType;
  name: string;
  pathData?: string;
  text?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  radius: number;
  samples: Sample[];
}

export function importSvg(svgText: string, fps: number): Promise<SvgImportResult> {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new Error(t('El archivo SVG no es válido'));
  }
  const parsedRoot = doc.documentElement;
  if (parsedRoot.nodeName.toLowerCase() !== 'svg') {
    throw new Error(t('El archivo no contiene un elemento <svg>'));
  }

  // Mount off-screen (rendered but invisible) so styles, layout and animations are resolved
  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;';
  const svg = document.importNode(parsedRoot, true) as unknown as SVGSVGElement;
  // Scripts from the file are never executed
  svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  host.appendChild(svg);
  document.body.appendChild(host);

  // The SMIL timeline of a freshly inserted SVG only starts on the next frame (until then
  // setCurrentTime() has no effect), so sampling runs synchronously inside that frame callback
  return new Promise<SvgImportResult>((resolve, reject) => {
    requestAnimationFrame(() => {
      try {
        resolve(sampleMountedSvg(svg, fps));
      } catch (err) {
        reject(err);
      } finally {
        cancelCssAnimations(svg);
        host.remove();
      }
    });
  });
}

function sampleMountedSvg(svg: SVGSVGElement, fps: number): SvgImportResult {
  const target = { fps };
  {
    const { vbX, vbY, vbW, vbH } = getViewBox(svg);
    if (!svg.getAttribute('width')) svg.setAttribute('width', String(vbW));
    if (!svg.getAttribute('height')) svg.setAttribute('height', String(vbH));

    // The project canvas is the SVG viewBox: 1 SVG unit = 1 px, origin at the viewBox corner
    const k = 1;
    const offsetX = -vbX;
    const offsetY = -vbY;

    // Animation timeline
    svg.pauseAnimations?.();
    const cssAnimations = getCssAnimations(svg);
    cssAnimations.forEach((a) => a.pause());
    const duration = Math.min(MAX_ANIMATION_SECONDS, Math.max(getSmilDuration(svg), getCssDuration(cssAnimations)));
    const animated = duration > 0;

    const sampleCount = animated ? Math.min(MAX_SAMPLES, Math.round(duration * target.fps)) + 1 : 1;
    const times = Array.from({ length: sampleCount }, (_, i) =>
      sampleCount === 1 ? 0 : Number(((i / (sampleCount - 1)) * duration).toFixed(4))
    );

    // Collect drawable shapes in paint order
    let skipped = 0;
    const shapes: ShapeInfo[] = [];
    const counters: Record<string, number> = {};
    svg.querySelectorAll('*').forEach((node) => {
      const tag = node.localName;
      if (!SHAPE_TAGS.has(tag)) {
        if (tag === 'image' || tag === 'use') skipped++;
        return;
      }
      if (hasNonRenderedAncestor(node, svg)) return;
      const info = createShapeInfo(node as SVGGraphicsElement, tag, counters);
      if (info) shapes.push(info);
    });

    const rootInverse = () => svg.getScreenCTM()!.inverse();

    // Sample every shape at every time
    for (const t of times) {
      setTime(svg, cssAnimations, t);
      const rootInv = rootInverse();
      for (const shape of shapes) {
        shape.samples.push(sampleShape(shape, rootInv, k, offsetX, offsetY));
      }
    }
    setTime(svg, cssAnimations, 0);

    const layers = shapes
      .filter((s) => s.samples.some((smp) => smp.opacity > 0))
      .map((s, i) => buildLayer(s, times, i, target));

    return {
      layers,
      width: Math.max(1, Math.round(vbW)),
      height: Math.max(1, Math.round(vbH)),
      animated,
      duration: animated ? duration : 0,
      skipped,
    };
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────

function getViewBox(svg: SVGSVGElement) {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { vbX: vb.x, vbY: vb.y, vbW: vb.width, vbH: vb.height };
  }
  const w = parseFloat(svg.getAttribute('width') || '') || 300;
  const h = parseFloat(svg.getAttribute('height') || '') || 150;
  return { vbX: 0, vbY: 0, vbW: w, vbH: h };
}

function hasNonRenderedAncestor(node: Element, root: Element) {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (NON_RENDERED_ANCESTORS.has(el.localName)) return true;
  }
  return false;
}

const num = (el: Element, attr: string) => parseFloat(el.getAttribute(attr) || '0') || 0;

function pointsToPath(points: string, close: boolean) {
  const nums = (points.match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g) || []).map(Number);
  if (nums.length < 4) return '';
  let d = `M${nums[0]} ${nums[1]}`;
  for (let i = 2; i + 1 < nums.length; i += 2) d += ` L${nums[i]} ${nums[i + 1]}`;
  return close ? `${d} Z` : d;
}

function createShapeInfo(el: SVGGraphicsElement, tag: string, counters: Record<string, number>): ShapeInfo | null {
  const labels: Record<string, string> = {
    rect: 'Rectángulo',
    circle: 'Círculo',
    ellipse: 'Elipse',
    line: 'Línea',
    polyline: 'Polilínea',
    polygon: 'Polígono',
    path: 'Trazado',
    text: 'Texto',
  };
  counters[tag] = (counters[tag] || 0) + 1;
  const name = el.id || el.getAttribute('inkscape:label') || `${t(labels[tag])} ${counters[tag]}`;
  const base = { el, name, radius: 0, samples: [] as Sample[] };

  switch (tag) {
    case 'rect':
      return { ...base, type: 'rect', radius: Math.max(num(el, 'rx'), num(el, 'ry')) };
    case 'circle':
    case 'ellipse':
      return { ...base, type: 'ellipse' };
    case 'line':
      return {
        ...base,
        type: 'path',
        pathData: `M${num(el, 'x1')} ${num(el, 'y1')} L${num(el, 'x2')} ${num(el, 'y2')}`,
      };
    case 'polyline':
    case 'polygon': {
      const d = pointsToPath(el.getAttribute('points') || '', tag === 'polygon');
      return d ? { ...base, type: 'path', pathData: d } : null;
    }
    case 'path': {
      const d = el.getAttribute('d');
      return d ? { ...base, type: 'path', pathData: d } : null;
    }
    case 'text': {
      const text = (el.textContent || '').trim();
      if (!text) return null;
      const cs = getComputedStyle(el);
      return {
        ...base,
        type: 'text',
        text,
        fontSize: parseFloat(cs.fontSize) || 16,
        fontWeight: cs.fontWeight || '400',
        fontFamily: cs.fontFamily || 'sans-serif',
      };
    }
  }
  return null;
}

// Local (untransformed) box of the shape at the current animation time
function getLocalBox(shape: ShapeInfo) {
  const el = shape.el;
  if (el instanceof SVGRectElement) {
    return { x: el.x.animVal.value, y: el.y.animVal.value, w: el.width.animVal.value, h: el.height.animVal.value };
  }
  if (el instanceof SVGCircleElement) {
    const r = el.r.animVal.value;
    return { x: el.cx.animVal.value - r, y: el.cy.animVal.value - r, w: r * 2, h: r * 2 };
  }
  if (el instanceof SVGEllipseElement) {
    const rx = el.rx.animVal.value;
    const ry = el.ry.animVal.value;
    return { x: el.cx.animVal.value - rx, y: el.cy.animVal.value - ry, w: rx * 2, h: ry * 2 };
  }
  try {
    const b = el.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  } catch {
    return { x: 0, y: 0, w: 0, h: 0 };
  }
}

// ── Styles ──────────────────────────────────────────────────────────────────

function toColor(r: number, g: number, b: number, a: number) {
  if (a >= 0.999) {
    const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;
}

function resolvePaint(svg: SVGSVGElement, paint: string, paintOpacity: number): string {
  if (!paint || paint === 'none') return 'transparent';
  let color = paint;
  // Gradients / patterns: approximate with the first stop color
  const url = paint.match(/url\(["']?#([^"')]+)["']?\)/);
  if (url) {
    const stop = svg.querySelector(`[id="${CSS.escape(url[1])}"] stop`);
    if (!stop) return 'transparent';
    const cs = getComputedStyle(stop);
    color = cs.stopColor;
    paintOpacity *= parseFloat(cs.stopOpacity || '1');
  }
  const c = parseColor(color);
  const alpha = c.a * paintOpacity;
  return alpha <= 0 ? 'transparent' : toColor(c.r, c.g, c.b, alpha);
}

function effectiveOpacity(el: Element, root: Element) {
  let opacity = 1;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    opacity *= parseFloat(cs.opacity || '1');
    if (node === root) break;
  }
  return opacity;
}

// ── Sampling ────────────────────────────────────────────────────────────────

function sampleShape(shape: ShapeInfo, rootInv: DOMMatrix, k: number, ox: number, oy: number): Sample {
  const el = shape.el;
  const screen = el.getScreenCTM();
  // Element user space → root user space → canvas
  const m = new DOMMatrix([k, 0, 0, k, ox, oy]).multiply(rootInv.multiply(screen ?? new DOMMatrix()));

  const box = getLocalBox(shape);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const center = m.transformPoint(new DOMPoint(cx, cy));

  // Decompose into rotation + scale (skew is not representable and is dropped)
  const sx = Math.hypot(m.a, m.b) || 1e-6;
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  const sy = (m.a * m.d - m.b * m.c) / sx;

  const cs = getComputedStyle(el);
  const svgRoot = el.ownerSVGElement ?? (el as unknown as SVGSVGElement);
  const sample: Sample = {
    x: center.x,
    y: center.y,
    scaleX: sx,
    scaleY: sy,
    rotation,
    opacity: effectiveOpacity(el, svgRoot),
    fill: resolvePaint(svgRoot, cs.fill, parseFloat(cs.fillOpacity || '1')),
    stroke: resolvePaint(svgRoot, cs.stroke, parseFloat(cs.strokeOpacity || '1')),
    strokeWidth: parseFloat(cs.strokeWidth) || 0,
  };
  if (shape.type === 'rect' || shape.type === 'ellipse') {
    sample.width = box.w;
    sample.height = box.h;
  }
  // Store the path centre so the path data can be re-centred on the layer origin
  if (!shapeCenters.has(shape)) shapeCenters.set(shape, { cx, cy });
  return sample;
}

const shapeCenters = new WeakMap<ShapeInfo, { cx: number; cy: number }>();

// ── Timeline control ────────────────────────────────────────────────────────

function getCssAnimations(svg: SVGSVGElement): Animation[] {
  const all: Animation[] = [];
  [svg, ...Array.from(svg.querySelectorAll('*'))].forEach((el) => {
    if ('getAnimations' in el) all.push(...(el as Element).getAnimations());
  });
  return all;
}

function getCssDuration(animations: Animation[]) {
  let end = 0;
  for (const a of animations) {
    const timing = a.effect?.getTiming();
    if (!timing) continue;
    const dur = typeof timing.duration === 'number' ? timing.duration : 0;
    const iterations = Number.isFinite(timing.iterations) ? (timing.iterations as number) : 1;
    end = Math.max(end, ((timing.delay || 0) + dur * iterations) / 1000);
  }
  return end;
}

function getSmilDuration(svg: SVGSVGElement) {
  let end = 0;
  svg.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((node) => {
    const anim = node as SVGAnimationElement;
    let start = 0;
    let dur = 0;
    try {
      start = anim.getStartTime();
    } catch {
      start = 0; // begin not resolved yet (e.g. triggered by a click)
    }
    try {
      dur = anim.getSimpleDuration();
    } catch {
      dur = 0; // indefinite
    }
    const repeat = anim.getAttribute('repeatCount');
    const count = repeat && repeat !== 'indefinite' ? parseFloat(repeat) || 1 : 1;
    end = Math.max(end, start + dur * count);
  });
  return end;
}

function setTime(svg: SVGSVGElement, animations: Animation[], t: number) {
  svg.setCurrentTime?.(t);
  for (const a of animations) a.currentTime = t * 1000;
}

function cancelCssAnimations(svg: SVGSVGElement) {
  try {
    getCssAnimations(svg).forEach((a) => a.cancel());
  } catch {
    // ignore
  }
}

// ── Layer building ──────────────────────────────────────────────────────────

// Keep rotation continuous between samples (avoid 179° → -179° jumps)
function unwrapAngles(values: number[]) {
  for (let i = 1; i < values.length; i++) {
    while (values[i] - values[i - 1] > 180) values[i] -= 360;
    while (values[i] - values[i - 1] < -180) values[i] += 360;
  }
  return values;
}

// Ramer–Douglas–Peucker over (time, value); returns the indices to keep
function simplify(times: number[], error: (a: number, b: number, i: number) => number, tolerance: number) {
  const keep = new Set<number>([0, times.length - 1]);
  const stack: [number, number][] = [[0, times.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxErr = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const e = error(a, b, i);
      if (e > maxErr) {
        maxErr = e;
        idx = i;
      }
    }
    if (idx !== -1 && maxErr > tolerance) {
      keep.add(idx);
      stack.push([a, idx], [idx, b]);
    }
  }
  return Array.from(keep).sort((x, y) => x - y);
}

const lerpAt = (times: number[], a: number, b: number, i: number) =>
  times[b] === times[a] ? 0 : (times[i] - times[a]) / (times[b] - times[a]);

function linearKeyframe(id: string, time: number, value: number | string): Keyframe {
  return { id, time, value, easing: { ...createDefaultEasing(), type: 'linear' } };
}

function buildLayer(shape: ShapeInfo, times: number[], index: number, target: Pick<Project, 'fps'>): Layer {
  const s0 = shape.samples[0];
  const center = shapeCenters.get(shape) ?? { cx: 0, cy: 0 };
  const round = (v: number, d = 3) => Number(v.toFixed(d));

  const properties: LayerProperties = {
    x: round(s0.x, 2),
    y: round(s0.y, 2),
    anchorX: 0,
    anchorY: 0,
    width: round(s0.width ?? 0, 2),
    height: round(s0.height ?? 0, 2),
    scaleX: round(s0.scaleX, 4),
    scaleY: round(s0.scaleY, 4),
    rotation: round(s0.rotation, 2),
    opacity: round(s0.opacity, 3),
    fill: s0.fill,
    stroke: s0.stroke,
    strokeWidth: round(s0.strokeWidth, 2),
    radius: shape.radius,
  };
  if (shape.pathData) properties.pathData = translatePath(shape.pathData, -center.cx, -center.cy);
  if (shape.type === 'text') {
    properties.text = shape.text;
    properties.fontSize = shape.fontSize;
    properties.fontWeight = shape.fontWeight;
    properties.fontFamily = shape.fontFamily;
  }

  const tracks = [];
  const idBase = `svg_${Date.now()}_${index}`;

  if (shape.samples.length > 1) {
    const numeric: AnimatableProperty[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'strokeWidth'];
    if (shape.type === 'rect' || shape.type === 'ellipse') numeric.push('width', 'height');

    for (const prop of numeric) {
      let values = shape.samples.map((smp) => (smp as unknown as Record<string, number>)[prop] ?? 0);
      if (prop === 'rotation') values = unwrapAngles(values);
      const tol = TOLERANCE[prop] ?? 0.01;
      if (values.every((v) => Math.abs(v - values[0]) <= tol)) continue;

      const idx = simplify(times, (a, b, i) => {
        const f = lerpAt(times, a, b, i);
        return Math.abs(values[i] - (values[a] + (values[b] - values[a]) * f));
      }, tol);
      const decimals = prop === 'scaleX' || prop === 'scaleY' ? 4 : 3;
      tracks.push(
        createTrack(prop, idx.map((i) => linearKeyframe(`${idBase}_${prop}_${i}`, times[i], round(values[i], decimals))))
      );
    }

    for (const prop of ['fill', 'stroke'] as const) {
      const values = shape.samples.map((smp) => smp[prop]);
      if (values.every((v) => v === values[0])) continue;
      const rgba = values.map((v) => parseColor(v));
      const idx = simplify(times, (a, b, i) => {
        const f = lerpAt(times, a, b, i);
        const ch = (c: { r: number; g: number; b: number; a: number }, key: 'r' | 'g' | 'b' | 'a') =>
          key === 'a' ? c.a * 255 : c[key];
        return Math.max(
          ...(['r', 'g', 'b', 'a'] as const).map((key) =>
            Math.abs(ch(rgba[i], key) - (ch(rgba[a], key) + (ch(rgba[b], key) - ch(rgba[a], key)) * f))
          )
        );
      }, 2);
      tracks.push(createTrack(prop, idx.map((i) => linearKeyframe(`${idBase}_${prop}_${i}`, times[i], values[i]))));
    }
  }

  return {
    id: `layer_${idBase}`,
    name: shape.name,
    type: shape.type,
    visible: true,
    locked: false,
    inTime: 0,
    outTime: Math.max(times[times.length - 1], 1 / target.fps),
    expanded: false,
    properties,
    tracks,
  };
}

/**
 * Translates SVG path data by (dx, dy). Absolute commands are shifted; relative commands
 * are left as they are, except the initial moveto, which is always absolute.
 */
export function translatePath(d: string, dx: number, dy: number): string {
  const numRe = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  const out: string[] = [];
  const cmdRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match: RegExpExecArray | null;
  let first = true;
  const fmt = (n: number) => String(Number(n.toFixed(3)));

  while ((match = cmdRe.exec(d)) !== null) {
    const cmd = match[1];
    const args = (match[2].match(numRe) || []).map(Number);
    const upper = cmd.toUpperCase();
    const isAbs = cmd === upper;

    if (upper === 'Z') {
      out.push(cmd);
      first = false;
      continue;
    }

    const shifted = args.map((v, i) => {
      // Initial "m" behaves as absolute for its first coordinate pair
      const absolute = isAbs || (first && cmd === 'm' && i < 2);
      if (!absolute) return v;
      switch (upper) {
        case 'H':
          return v + dx;
        case 'V':
          return v + dy;
        case 'A': {
          const j = i % 7;
          return j === 5 ? v + dx : j === 6 ? v + dy : v;
        }
        default:
          return i % 2 === 0 ? v + dx : v + dy;
      }
    });
    out.push(cmd + shifted.map(fmt).join(' '));
    first = false;
  }
  return out.join(' ');
}

const DEFAULT_FPS = 30;
const DEFAULT_DURATION = 3;

/**
 * Loads an SVG as a complete project: the canvas takes the SVG size and, when animated,
 * the project lasts as long as the animation.
 */
export async function convertSvgToProject(
  svgText: string,
  title: string
): Promise<{ project: Project; result: SvgImportResult }> {
  const result = await importSvg(svgText, DEFAULT_FPS);
  const duration = result.animated ? Math.max(0.1, Math.ceil(result.duration * 10) / 10) : DEFAULT_DURATION;

  const project: Project = {
    id: `project_${Date.now()}`,
    title: title || 'svg_importado',
    width: result.width,
    height: result.height,
    fps: DEFAULT_FPS,
    duration,
    backgroundColor: 'transparent', // SVGs have no background of their own
    layers: result.layers.map((l) => ({ ...l, inTime: 0, outTime: duration })),
  };
  return { project, result };
}
