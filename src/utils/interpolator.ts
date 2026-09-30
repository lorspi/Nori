import { EasingConfig, Keyframe, Layer, Project } from '../types/animation';

// Default Bezier presets
export const BEZIER_PRESETS = {
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  easeIn: { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  easeOut: { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  easeInOut: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  anticipate: { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
};

/**
 * Solve cubic bezier curve x(t) for parameter t, then evaluate y(t) with guaranteed convergence
 */
export function solveCubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  let lower = 0;
  let upper = 1;
  let u = t;

  for (let i = 0; i < 10; i++) {
    const currentX = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    if (Math.abs(currentX - t) < 1e-4) break;

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

/**
 * Damped harmonic oscillator simulation for Spring physics
 * Exactly what Nori uses for its spring curve editor!
 */
export function evaluateSpring(
  stiffness: number,
  damping: number,
  mass: number,
  t: number
): number {
  if (t <= 0) return 0;
  const m = Math.max(0.01, mass);
  const k = Math.max(1, stiffness);
  const c = Math.max(0.1, damping);

  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(m * k));

  // Time scaling so animation completes within ~1.0 normalized progress
  const timeScale = 3.5;
  const scaledT = t * timeScale;

  if (zeta < 1) {
    // Underdamped (springy overshoot)
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * scaledT);
    const envelope = Math.cos(wd * scaledT) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(wd * scaledT);
    return 1 - decay * envelope;
  } else if (Math.abs(zeta - 1) < 1e-4) {
    // Critically damped
    const decay = Math.exp(-w0 * scaledT);
    return 1 - decay * (1 + w0 * scaledT);
  } else {
    // Overdamped
    const s1 = -w0 * (zeta - Math.sqrt(zeta * zeta - 1));
    const s2 = -w0 * (zeta + Math.sqrt(zeta * zeta - 1));
    const c1 = s2 / (s2 - s1);
    const c2 = -s1 / (s2 - s1);
    return 1 - (c1 * Math.exp(s1 * scaledT) + c2 * Math.exp(s2 * scaledT));
  }
}

/**
 * Bounce easing
 */
function evaluateBounce(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
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
    case 'ease-in':
      return solveCubicBezier(0.42, 0, 1, 1, t);
    case 'ease-out':
      return solveCubicBezier(0, 0, 0.58, 1, t);
    case 'ease-in-out':
      return solveCubicBezier(0.42, 0, 0.58, 1, t);
    case 'bezier':
      return solveCubicBezier(
        easing.bezier.x1,
        easing.bezier.y1,
        easing.bezier.x2,
        easing.bezier.y2,
        t
      );
    case 'spring':
      return evaluateSpring(
        easing.spring.stiffness,
        easing.spring.damping,
        easing.spring.mass,
        t
      );
    case 'bounce':
      return evaluateBounce(t);
    default:
      return t;
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

export function interpolateColor(color1: string, color2: string, progress: number): string {
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);

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
        if (k1.value.startsWith('#') || k1.value.startsWith('rgb')) {
          return interpolateColor(k1.value, k2.value, smoothProgress);
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

  for (const track of layer.tracks) {
    const propName = track.property as keyof typeof result;
    const baseVal = (result as Record<string, unknown>)[propName];
    if (baseVal !== undefined) {
      (result as Record<string, unknown>)[propName] = interpolateTrackValue(
        track.keyframes,
        baseVal as number | string,
        currentTime
      );
    }
  }

  return result;
}
