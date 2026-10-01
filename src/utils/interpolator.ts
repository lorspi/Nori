import { interpolatePath, isPathString } from './pathGeometry';
import { BounceConfig, CubicBezierConfig, EasingConfig, Keyframe, Layer, SpringConfig } from '../types/animation';

// Control points of the Bézier-based built-in curves
export const BEZIER_PRESETS = {
  'ease-in': { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  'ease-out': { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  'ease-in-out': { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  'back-in': { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
  'back-out': { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
} satisfies Record<string, CubicBezierConfig>;

export const DEFAULT_SPRING: SpringConfig = { stiffness: 270.18, damping: 13.2, mass: 1 };
// Same shape as the classic easeOutBounce (3 bounces, each half as fast as the previous one)
export const DEFAULT_BOUNCE: BounceConfig = { bounces: 3, restitution: 0.5 };

// Normalized progress 0..1 maps to this many seconds of spring simulation
export const SPRING_TIME_SCALE = 3.5;
// From this progress on, any oscillation left is faded out so the curve lands on 1 smoothly
const SPRING_FADE_START = 0.8;

/**
 * Solve cubic bezier curve x(t) for parameter t, then evaluate y(t) with guaranteed convergence
 */
export function solveCubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  let lower = 0;
  let upper = 1;
  let u = t;

  for (let i = 0; i < 12; i++) {
    const currentX = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    if (Math.abs(currentX - t) < 1e-5) break;

    if (currentX < t) {
      lower = u;
    } else {
      upper = u;
    }
    const slope =
      3 * (1 - u) * (1 - u) * x1 +
      6 * (1 - u) * u * (x2 - x1) +
      3 * u * u * (1 - x2);

    if (Math.abs(slope) > 1e-4) {
      const nextU = u - (currentX - t) / slope;
      if (nextU > lower && nextU < upper) {
        u = nextU;
        continue;
      }
    }
    u = (lower + upper) / 2;
  }

  // Calculate y from u
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

// Physical constants of a spring, clamped to safe ranges
export function getSpringPhysics({ stiffness, damping, mass }: SpringConfig) {
  const m = Math.max(0.01, mass);
  const k = Math.max(1, stiffness);
  const c = Math.max(0.1, damping);
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(m * k));
  return { m, k, c, w0, zeta };
}

/**
 * Damped harmonic oscillator simulation for Spring physics
 */
export function evaluateSpring(
  stiffness: number,
  damping: number,
  mass: number,
  t: number
): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const { w0, zeta } = getSpringPhysics({ stiffness, damping, mass });
  const scaledT = t * SPRING_TIME_SCALE;

  // Remaining distance to the target (1 - value)
  let offset: number;
  if (zeta < 1) {
    // Underdamped (springy overshoot)
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * scaledT);
    offset = decay * (Math.cos(wd * scaledT) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * scaledT));
  } else if (Math.abs(zeta - 1) < 1e-4) {
    // Critically damped
    offset = Math.exp(-w0 * scaledT) * (1 + w0 * scaledT);
  } else {
    // Overdamped
    const s1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const s2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c1 = s2 / (s2 - s1);
    const c2 = -s1 / (s2 - s1);
    offset = c1 * Math.exp(s1 * scaledT) + c2 * Math.exp(s2 * scaledT);
  }

  // Soft springs may still be moving at the end of the segment: fade the rest out
  // (cosine window, flat at both ends) instead of jumping to the target on the last frame
  if (t > SPRING_FADE_START) {
    const f = (t - SPRING_FADE_START) / (1 - SPRING_FADE_START);
    offset *= 0.5 * (1 + Math.cos(Math.PI * f));
  }
  return 1 - offset;
}

export interface BounceSegment {
  start: number;  // progress where the segment starts
  end: number;    // progress where it lands on the target
  height: number; // how far it rises back from the target (0..1); the first segment is the fall
}

/**
 * Bounce as a falling ball: a fall from 0 to 1 followed by `bounces` parabolic arches,
 * each keeping `restitution` of the previous speed. Every segment is an exact parabola,
 * so the graph can be drawn with quadratic curves.
 */
export function getBounceSegments({ bounces, restitution }: BounceConfig): BounceSegment[] {
  const n = Math.max(1, Math.min(8, Math.round(bounces)));
  const e = Math.max(0.05, Math.min(0.9, restitution));
  let total = 1;
  for (let i = 1; i <= n; i++) total += 2 * Math.pow(e, i);
  const fall = 1 / total;

  const segments: BounceSegment[] = [{ start: 0, end: fall, height: 1 }];
  let start = fall;
  for (let i = 1; i <= n; i++) {
    const duration = 2 * fall * Math.pow(e, i);
    segments.push({ start, end: i === n ? 1 : start + duration, height: Math.pow(e, 2 * i) });
    start += duration;
  }
  return segments;
}

export function evaluateBounce(config: BounceConfig, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const segments = getBounceSegments(config);
  const fall = segments[0];
  if (t < fall.end) return (t / fall.end) * (t / fall.end);
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (t < seg.end || i === segments.length - 1) {
      const s = (t - seg.start) / (seg.end - seg.start);
      return 1 - seg.height * 4 * s * (1 - s);
    }
  }
  return 1;
}

// Control points of the curve when it is a cubic Bézier (null for linear, spring and bounce)
export function getEasingBezier(easing: EasingConfig): CubicBezierConfig | null {
  switch (easing.type) {
    case 'ease-in':
    case 'ease-out':
    case 'ease-in-out':
    case 'back-in':
    case 'back-out':
      return BEZIER_PRESETS[easing.type];
    case 'bezier':
      return easing.bezier;
    default:
      return null;
  }
}

/**
 * Given easing config and normalized progress [0..1], returns smoothed progress
 */
export function evaluateEasing(easing: EasingConfig, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  switch (easing.type) {
    case 'linear':
      return t;
    case 'spring':
    case 'custom-spring':
      return evaluateSpring(
        easing.spring.stiffness,
        easing.spring.damping,
        easing.spring.mass,
        t
      );
    case 'bounce':
      return evaluateBounce(DEFAULT_BOUNCE, t);
    case 'custom-bounce':
      return evaluateBounce(easing.bounce ?? DEFAULT_BOUNCE, t);
    default: {
      const b = getEasingBezier(easing);
      return b ? solveCubicBezier(b.x1, b.y1, b.x2, b.y2, t) : t;
    }
  }
}

// Color parsing and interpolation
interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(color: string): RGBA {
  if (!color || color === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // Hex format #rgb, #rrggbb, #rrggbbaa
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('') + 'ff';
    } else if (hex.length === 6) {
      hex += 'ff';
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 24) & 255,
      g: (num >> 16) & 255,
      b: (num >> 8) & 255,
      a: ((num & 255) / 255),
    };
  }

  // rgb/rgba format
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

const isColorString = (v: string) => v.startsWith('#') || v.startsWith('rgb') || v === 'transparent';

export function interpolateColor(color1: string, color2: string, progress: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  // Fading from / to "no color" keeps the visible color's tint instead of passing through black
  if (color1 === 'transparent' || !color1) Object.assign(c1, { r: c2.r, g: c2.g, b: c2.b });
  if (color2 === 'transparent' || !color2) Object.assign(c2, { r: c1.r, g: c1.g, b: c1.b });

  const r = Math.round(c1.r + (c2.r - c1.r) * progress);
  const g = Math.round(c1.g + (c2.g - c1.g) * progress);
  const b = Math.round(c1.b + (c2.b - c1.b) * progress);
  const a = Math.max(0, Math.min(1, c1.a + (c2.a - c1.a) * progress));

  if (a >= 0.999) {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

/**
 * Interpolates between keyframes on a property track at time t with zero allocation
 */
export function interpolateTrackValue(
  keyframes: Keyframe[],
  defaultValue: number | string,
  currentTime: number
): number | string {
  if (!keyframes || keyframes.length === 0) {
    return defaultValue;
  }

  const len = keyframes.length;
  if (len === 1) {
    return keyframes[0].value;
  }

  // Keyframes are stored in chronological order
  if (currentTime <= keyframes[0].time) {
    return keyframes[0].value;
  }

  if (currentTime >= keyframes[len - 1].time) {
    return keyframes[len - 1].value;
  }

  // Find surrounding keyframes
  for (let i = 0; i < len - 1; i++) {
    const k1 = keyframes[i];
    const k2 = keyframes[i + 1];

    if (currentTime >= k1.time && currentTime <= k2.time) {
      const duration = k2.time - k1.time;
      if (duration <= 0) return k1.value;

      const rawProgress = (currentTime - k1.time) / duration;
      const smoothProgress = evaluateEasing(k1.easing, rawProgress);

      if (typeof k1.value === 'number' && typeof k2.value === 'number') {
        return k1.value + (k2.value - k1.value) * smoothProgress;
      }

      if (typeof k1.value === 'string' && typeof k2.value === 'string') {
        if (isColorString(k1.value) && isColorString(k2.value)) {
          return interpolateColor(k1.value, k2.value, smoothProgress);
        }
        if (isPathString(k1.value) && isPathString(k2.value)) {
          return interpolatePath(k1.value, k2.value, smoothProgress);
        }
      }

      return rawProgress >= 0.5 ? k2.value : k1.value;
    }
  }

  return defaultValue;
}

/**
 * Computes all animated properties of a layer at given time t
 */
export function getLayerPropertiesAtTime(layer: Layer, currentTime: number) {
  const result = { ...layer.properties };
  // Older layers have no fill / stroke opacity: fully opaque
  result.fillOpacity ??= 1;
  result.strokeOpacity ??= 1;

  for (const track of layer.tracks) {
    const propName = track.property as keyof typeof result;
    // Optional properties (anchor, blur…) may have no base value yet
    const baseVal = (result as Record<string, unknown>)[propName] ?? 0;
    (result as Record<string, unknown>)[propName] = interpolateTrackValue(
      track.keyframes,
      baseVal as number | string,
      currentTime
    );
  }

  return result;
}
