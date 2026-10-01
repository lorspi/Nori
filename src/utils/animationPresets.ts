import { AnimatableProperty, EasingPresetType, KeyframeRef, Layer } from '../types/animation';
import { createDefaultEasing, createKeyframe, createTrack, frameTolerance, snapToFrame, sortKeyframes } from './animationTracks';
import { applyEasingPreset } from './easingPresets';
import { getLayerPropertiesAtTime } from './interpolator';

/**
 * Predefined animations ("Animaciones predeterminadas"): entrances, exits, entrance + exit
 * pairs and in-place motions. Each preset describes its keyframes on a normalized time
 * (0 = start, 1 = end) relative to the layer's own values, so it works on any layer.
 */

export type PresetCategory = 'in' | 'out' | 'inOut' | 'emphasis';

export const PRESET_CATEGORIES: { id: PresetCategory; label: string; hint: string }[] = [
  { id: 'in', label: 'Entrada', hint: 'La capa aparece desde el cursor de tiempo' },
  { id: 'out', label: 'Salida', hint: 'La capa desaparece desde el cursor de tiempo' },
  { id: 'inOut', label: 'Entrada y salida', hint: 'Entra en el cursor de tiempo y sale al final de la línea del tiempo' },
  { id: 'emphasis', label: 'Movimiento', hint: 'La capa se mueve en su sitio y vuelve a su estado inicial' },
];

// Values of the layer the preset animates from or to
interface Rest {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blur: number;
}

interface PresetContext {
  r: Rest;
  d: number; // travel distance in px (slides, drops)
}

interface PresetKey {
  at: number; // 0..1
  value: number;
  easing?: EasingPresetType; // curve towards the next key
}

type PresetTracks = Partial<Record<AnimatableProperty, PresetKey[]>>;

export interface AnimationPreset {
  id: string;
  name: string;
  category: PresetCategory;
  build?: (c: PresetContext) => PresetTracks;
  pair?: { in: string; out: string };
}

// Scale used instead of 0 so the layer keeps a valid transform (selection, handles)
const ZERO = 0.01;

const key = (at: number, value: number, easing?: EasingPresetType): PresetKey => ({ at, value, easing });

// Same easing between every pair of keys
const seq = (ats: number[], values: number[], easing: EasingPresetType): PresetKey[] =>
  ats.map((at, i) => key(at, values[i], easing));

const scale = (r: Rest, ats: number[], factors: number[], easing: EasingPresetType): PresetTracks => ({
  scaleX: seq(ats, factors.map((f) => (f === 0 ? ZERO : r.scaleX * f)), easing),
  scaleY: seq(ats, factors.map((f) => (f === 0 ? ZERO : r.scaleY * f)), easing),
});

const fadeIn = (r: Rest, until = 1) => [key(0, 0, 'ease-out'), key(until, r.opacity)];
const fadeOut = (r: Rest, from = 0) => [key(from, r.opacity, 'ease-in'), key(1, 0)];

const move = (prop: 'x' | 'y', from: number, to: number, easing: EasingPresetType): PresetTracks => ({
  [prop]: [key(0, from, easing), key(1, to)],
});

export const ANIMATION_PRESETS: AnimationPreset[] = [
  // ── Entrances ─────────────────────────────────────────────────────────────
  { id: 'fade-in', name: 'Aparecer', category: 'in', build: ({ r }) => ({ opacity: fadeIn(r) }) },
  {
    id: 'slide-in-left',
    name: 'Desde la izquierda',
    category: 'in',
    build: ({ r, d }) => ({ ...move('x', r.x - d, r.x, 'ease-out'), opacity: fadeIn(r, 0.6) }),
  },
  {
    id: 'slide-in-right',
    name: 'Desde la derecha',
    category: 'in',
    build: ({ r, d }) => ({ ...move('x', r.x + d, r.x, 'ease-out'), opacity: fadeIn(r, 0.6) }),
  },
  {
    id: 'slide-in-up',
    name: 'Desde abajo',
    category: 'in',
    build: ({ r, d }) => ({ ...move('y', r.y + d, r.y, 'ease-out'), opacity: fadeIn(r, 0.6) }),
  },
  {
    id: 'slide-in-down',
    name: 'Desde arriba',
    category: 'in',
    build: ({ r, d }) => ({ ...move('y', r.y - d, r.y, 'ease-out'), opacity: fadeIn(r, 0.6) }),
  },
  {
    id: 'zoom-in',
    name: 'Ampliar',
    category: 'in',
    build: ({ r }) => ({ ...scale(r, [0, 1], [0.3, 1], 'ease-out'), opacity: fadeIn(r, 0.6) }),
  },
  {
    id: 'shrink-in',
    name: 'Encoger',
    category: 'in',
    build: ({ r }) => ({ ...scale(r, [0, 1], [1.6, 1], 'ease-out'), opacity: fadeIn(r, 0.6) }),
  },
  {
    id: 'pop-in',
    name: 'Pop',
    category: 'in',
    build: ({ r }) => ({ ...scale(r, [0, 1], [0, 1], 'back-out'), opacity: fadeIn(r, 0.3) }),
  },
  {
    id: 'spring-in',
    name: 'Elástico',
    category: 'in',
    build: ({ r }) => ({ ...scale(r, [0, 1], [0, 1], 'spring'), opacity: fadeIn(r, 0.25) }),
  },
  {
    id: 'drop-in',
    name: 'Caer con rebote',
    category: 'in',
    build: ({ r, d }) => ({ ...move('y', r.y - d * 1.5, r.y, 'bounce'), opacity: fadeIn(r, 0.2) }),
  },
  {
    id: 'spin-in',
    name: 'Girar',
    category: 'in',
    build: ({ r }) => ({
      rotation: [key(0, r.rotation - 180, 'ease-out'), key(1, r.rotation)],
      ...scale(r, [0, 1], [0, 1], 'ease-out'),
      opacity: fadeIn(r, 0.5),
    }),
  },
  {
    id: 'blur-in',
    name: 'Enfocar',
    category: 'in',
    build: ({ r }) => ({ blur: [key(0, r.blur + 12, 'ease-out'), key(1, r.blur)], opacity: fadeIn(r, 0.7) }),
  },
  {
    id: 'unfold-in',
    name: 'Desplegar',
    category: 'in',
    build: ({ r }) => ({ scaleX: [key(0, ZERO, 'ease-out'), key(1, r.scaleX)], opacity: fadeIn(r, 0.3) }),
  },

  // ── Exits ─────────────────────────────────────────────────────────────────
  { id: 'fade-out', name: 'Desvanecer', category: 'out', build: ({ r }) => ({ opacity: fadeOut(r) }) },
  {
    id: 'slide-out-left',
    name: 'Hacia la izquierda',
    category: 'out',
    build: ({ r, d }) => ({ ...move('x', r.x, r.x - d, 'ease-in'), opacity: fadeOut(r, 0.4) }),
  },
  {
    id: 'slide-out-right',
    name: 'Hacia la derecha',
    category: 'out',
    build: ({ r, d }) => ({ ...move('x', r.x, r.x + d, 'ease-in'), opacity: fadeOut(r, 0.4) }),
  },
  {
    id: 'slide-out-up',
    name: 'Hacia arriba',
    category: 'out',
    build: ({ r, d }) => ({ ...move('y', r.y, r.y - d, 'ease-in'), opacity: fadeOut(r, 0.4) }),
  },
  {
    id: 'slide-out-down',
    name: 'Hacia abajo',
    category: 'out',
    build: ({ r, d }) => ({ ...move('y', r.y, r.y + d, 'ease-in'), opacity: fadeOut(r, 0.4) }),
  },
  {
    id: 'zoom-out',
    name: 'Reducir',
    category: 'out',
    build: ({ r }) => ({ ...scale(r, [0, 1], [1, 0.3], 'ease-in'), opacity: fadeOut(r, 0.4) }),
  },
  {
    id: 'grow-out',
    name: 'Ampliar y desvanecer',
    category: 'out',
    build: ({ r }) => ({ ...scale(r, [0, 1], [1, 1.6], 'ease-in'), opacity: fadeOut(r, 0.2) }),
  },
  {
    id: 'pop-out',
    name: 'Hundir',
    category: 'out',
    build: ({ r }) => ({ ...scale(r, [0, 1], [1, 0], 'back-in'), opacity: fadeOut(r, 0.7) }),
  },
  {
    id: 'fall-out',
    name: 'Caer',
    category: 'out',
    build: ({ r, d }) => ({ ...move('y', r.y, r.y + d * 1.5, 'ease-in'), opacity: fadeOut(r, 0.5) }),
  },
  {
    id: 'spin-out',
    name: 'Girar y salir',
    category: 'out',
    build: ({ r }) => ({
      rotation: [key(0, r.rotation, 'ease-in'), key(1, r.rotation + 180)],
      ...scale(r, [0, 1], [1, 0], 'ease-in'),
      opacity: fadeOut(r, 0.5),
    }),
  },
  {
    id: 'blur-out',
    name: 'Desenfocar',
    category: 'out',
    build: ({ r }) => ({ blur: [key(0, r.blur, 'ease-in'), key(1, r.blur + 12)], opacity: fadeOut(r, 0.3) }),
  },
  {
    id: 'fold-out',
    name: 'Plegar',
    category: 'out',
    build: ({ r }) => ({ scaleX: [key(0, r.scaleX, 'ease-in'), key(1, ZERO)], opacity: fadeOut(r, 0.7) }),
  },

  // ── Entrance + exit ───────────────────────────────────────────────────────
  { id: 'fade-in-out', name: 'Aparecer y desvanecer', category: 'inOut', pair: { in: 'fade-in', out: 'fade-out' } },
  { id: 'slide-left-right', name: 'De izquierda a derecha', category: 'inOut', pair: { in: 'slide-in-left', out: 'slide-out-right' } },
  { id: 'slide-right-left', name: 'De derecha a izquierda', category: 'inOut', pair: { in: 'slide-in-right', out: 'slide-out-left' } },
  { id: 'slide-bottom-top', name: 'De abajo hacia arriba', category: 'inOut', pair: { in: 'slide-in-up', out: 'slide-out-up' } },
  { id: 'slide-top-bottom', name: 'De arriba hacia abajo', category: 'inOut', pair: { in: 'slide-in-down', out: 'slide-out-down' } },
  { id: 'zoom-in-out', name: 'Ampliar y reducir', category: 'inOut', pair: { in: 'zoom-in', out: 'zoom-out' } },
  { id: 'pop-in-out', name: 'Pop', category: 'inOut', pair: { in: 'pop-in', out: 'pop-out' } },
  { id: 'spring-in-out', name: 'Elástico', category: 'inOut', pair: { in: 'spring-in', out: 'pop-out' } },
  { id: 'drop-fall', name: 'Caer con rebote', category: 'inOut', pair: { in: 'drop-in', out: 'fall-out' } },
  { id: 'spin-in-out', name: 'Girar', category: 'inOut', pair: { in: 'spin-in', out: 'spin-out' } },
  { id: 'blur-in-out', name: 'Enfocar y desenfocar', category: 'inOut', pair: { in: 'blur-in', out: 'blur-out' } },
  { id: 'unfold-fold', name: 'Desplegar y plegar', category: 'inOut', pair: { in: 'unfold-in', out: 'fold-out' } },

  // ── In-place motions (they end where they started) ─────────────────────────
  {
    id: 'pulse',
    name: 'Pulso',
    category: 'emphasis',
    build: ({ r }) => scale(r, [0, 0.5, 1], [1, 1.12, 1], 'ease-in-out'),
  },
  {
    id: 'heartbeat',
    name: 'Latido',
    category: 'emphasis',
    build: ({ r }) => scale(r, [0, 0.14, 0.28, 0.42, 0.7], [1, 1.22, 1, 1.22, 1], 'ease-in-out'),
  },
  {
    id: 'shake',
    name: 'Sacudir',
    category: 'emphasis',
    build: ({ r, d }) => {
      const s = Math.max(4, d * 0.08);
      return { x: seq([0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 7), [0, -1, 1, -1, 1, -1, 0.5, 0].map((f) => r.x + f * s), 'ease-in-out') };
    },
  },
  {
    id: 'wobble',
    name: 'Tambalear',
    category: 'emphasis',
    build: ({ r }) => ({
      rotation: seq([0, 0.15, 0.3, 0.45, 0.6, 0.75, 1], [0, -14, 11, -8, 5, -2, 0].map((a) => r.rotation + a), 'ease-in-out'),
    }),
  },
  {
    id: 'float',
    name: 'Flotar',
    category: 'emphasis',
    build: ({ r, d }) => ({ y: seq([0, 0.5, 1], [r.y, r.y - Math.max(6, d * 0.15), r.y], 'ease-in-out') }),
  },
  {
    id: 'hop',
    name: 'Saltar',
    category: 'emphasis',
    build: ({ r, d }) => ({ y: [key(0, r.y, 'ease-out'), key(0.35, r.y - d * 0.5, 'bounce'), key(1, r.y)] }),
  },
  {
    id: 'spin',
    name: 'Giro de 360°',
    category: 'emphasis',
    build: ({ r }) => ({ rotation: [key(0, r.rotation, 'ease-in-out'), key(1, r.rotation + 360)] }),
  },
  {
    id: 'blink',
    name: 'Parpadear',
    category: 'emphasis',
    build: ({ r }) => ({ opacity: seq([0, 0.25, 0.5, 0.75, 1], [r.opacity, 0, r.opacity, 0, r.opacity], 'ease-in-out') }),
  },
  {
    id: 'jello',
    name: 'Gelatina',
    category: 'emphasis',
    build: ({ r }) => {
      const ats = [0, 0.3, 0.4, 0.5, 0.65, 0.75, 1];
      return {
        scaleX: seq(ats, [1, 1.25, 0.75, 1.15, 0.95, 1.05, 1].map((f) => r.scaleX * f), 'ease-in-out'),
        scaleY: seq(ats, [1, 0.75, 1.25, 0.85, 1.05, 0.95, 1].map((f) => r.scaleY * f), 'ease-in-out'),
      };
    },
  },
  {
    id: 'tada',
    name: 'Tada',
    category: 'emphasis',
    build: ({ r }) => ({
      ...scale(r, [0, 0.1, 0.3, 0.8, 1], [1, 0.9, 1.1, 1.1, 1], 'ease-in-out'),
      rotation: seq([0, 0.1, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1], [0, -3, 3, -3, 3, -3, 3, -3, 0].map((a) => r.rotation + a), 'ease-in-out'),
    }),
  },
];

const getPreset = (id: string) => ANIMATION_PRESETS.find((p) => p.id === id);

// ── Timing ──────────────────────────────────────────────────────────────────

export interface PresetSpan {
  start: number;
  end: number;
}

export interface PresetSpans {
  in?: PresetSpan;
  out?: PresetSpan;
  main?: PresetSpan;
}

/**
 * Where the preset goes on the timeline. Entrances, exits and motions start at the playhead
 * (moved back if they wouldn't fit); entrance + exit enters at the playhead and leaves at the
 * end of the timeline.
 */
export function planPresetSpans(category: PresetCategory, playhead: number, length: number, total: number, fps: number): PresetSpans {
  const snap = (t: number) => snapToFrame(t, fps);
  if (category === 'inOut') {
    const l = Math.min(length, total / 2);
    const inStart = snap(Math.max(0, Math.min(total - 2 * l, playhead)));
    return {
      in: { start: inStart, end: snap(inStart + l) },
      out: { start: snap(total - l), end: snap(total) },
    };
  }
  const l = Math.min(length, total);
  const start = snap(Math.max(0, Math.min(total - l, playhead)));
  const span = { start, end: snap(start + l) };
  return category === 'in' ? { in: span } : category === 'out' ? { out: span } : { main: span };
}

// ── Applying ────────────────────────────────────────────────────────────────

export const getPresetDistance = (width: number, height: number) =>
  Math.round(Math.max(40, Math.min(width, height) * 0.25));

function getRest(layer: Layer, time: number): Rest {
  const p = getLayerPropertiesAtTime(layer, time);
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const opacity = num(p.opacity, 1);
  return {
    x: num(p.x, 0),
    y: num(p.y, 0),
    scaleX: num(p.scaleX, 1),
    scaleY: num(p.scaleY, 1),
    rotation: num(p.rotation, 0),
    // A fully transparent layer fades in to fully visible
    opacity: opacity > 0.01 ? opacity : 1,
    blur: num(p.blur, 0),
  };
}

const DECIMALS: Partial<Record<AnimatableProperty, number>> = { scaleX: 4, scaleY: 4, opacity: 3 };

// Writes the preset keys into the layer, replacing its keyframes of the same properties inside the span
function writeTracks(layer: Layer, tracks: PresetTracks, span: PresetSpan, fps: number, refs: KeyframeRef[]): Layer {
  const tolerance = frameTolerance(fps);
  let next = layer;
  for (const [prop, keys] of Object.entries(tracks) as [AnimatableProperty, PresetKey[]][]) {
    if (!keys?.length) continue;
    // Keys that land on the same frame (very short durations): the last one wins
    const byTime = new Map<number, PresetKey>();
    for (const k of keys) byTime.set(snapToFrame(span.start + k.at * (span.end - span.start), fps), k);
    const keyframes = [...byTime.entries()].map(([time, k]) => ({
      ...createKeyframe(time, Number(k.value.toFixed(DECIMALS[prop] ?? 2))),
      easing: k.easing ? applyEasingPreset(createDefaultEasing(), k.easing) : createDefaultEasing(),
    }));
    keyframes.forEach((k) => refs.push({ layerId: layer.id, property: prop, keyframeId: k.id }));

    const track = next.tracks.find((t) => t.property === prop);
    const tracksNext = track
      ? next.tracks.map((t) =>
          t.property !== prop
            ? t
            : {
                ...t,
                keyframes: sortKeyframes([
                  ...t.keyframes.filter((k) => k.time < span.start - tolerance || k.time > span.end + tolerance),
                  ...keyframes,
                ]),
              }
        )
      : [...next.tracks, createTrack(prop, sortKeyframes(keyframes))];
    next = { ...next, tracks: tracksNext };
  }
  return next;
}

/**
 * Adds the preset's keyframes to a layer. The layer's own values (position, scale, rotation,
 * opacity, blur) at the start or end of the animation are where it arrives or leaves from.
 */
export function applyAnimationPreset(
  layer: Layer,
  preset: AnimationPreset,
  spans: PresetSpans,
  fps: number,
  distance: number
): { layer: Layer; refs: KeyframeRef[] } {
  const refs: KeyframeRef[] = [];
  const parts: { preset: AnimationPreset; span: PresetSpan; rest: Rest }[] = [];

  if (preset.pair) {
    const inPreset = getPreset(preset.pair.in);
    const outPreset = getPreset(preset.pair.out);
    if (inPreset && spans.in) parts.push({ preset: inPreset, span: spans.in, rest: getRest(layer, spans.in.end) });
    if (outPreset && spans.out) parts.push({ preset: outPreset, span: spans.out, rest: getRest(layer, spans.out.start) });
  } else {
    const span = spans.in ?? spans.out ?? spans.main;
    if (span) parts.push({ preset, span, rest: getRest(layer, preset.category === 'in' ? span.end : span.start) });
  }

  // Rest values are read from the original layer, before any keyframe is written
  let next = layer;
  for (const part of parts) {
    if (!part.preset.build) continue;
    next = writeTracks(next, part.preset.build({ r: part.rest, d: distance }), part.span, fps, refs);
  }
  return { layer: { ...next, expanded: true }, refs };
}

// ── Preview ─────────────────────────────────────────────────────────────────

const PREVIEW_FPS = 60;

// Timeline of the hover preview: the animation plus a pause before it loops
const PREVIEW_TIMING: Record<PresetCategory, { spans: PresetSpans; total: number; restTime: number }> = {
  in: { spans: { in: { start: 0, end: 0.7 } }, total: 1.4, restTime: 1.4 },
  out: { spans: { out: { start: 0.35, end: 1.05 } }, total: 1.5, restTime: 0 },
  inOut: { spans: { in: { start: 0, end: 0.6 }, out: { start: 1.1, end: 1.7 } }, total: 2.1, restTime: 0.85 },
  emphasis: { spans: { main: { start: 0, end: 1.1 } }, total: 1.5, restTime: 0 },
};

export interface PresetPreview {
  layer: Layer;
  total: number; // loop length in seconds
  restTime: number; // time shown while not hovered
}

// A neutral layer centred at (0, 0) animated with the preset, for the thumbnails
export function buildPresetPreview(preset: AnimationPreset, distance: number): PresetPreview {
  const timing = PREVIEW_TIMING[preset.category];
  const base: Layer = {
    id: `preview_${preset.id}`,
    name: preset.name,
    type: 'rect',
    visible: true,
    locked: false,
    inTime: 0,
    outTime: timing.total,
    properties: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      fill: '#000000',
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 0,
      blur: 0,
    },
    tracks: [],
  };
  return {
    layer: applyAnimationPreset(base, preset, timing.spans, PREVIEW_FPS, distance).layer,
    total: timing.total,
    restTime: timing.restTime,
  };
}
