import { CubicBezierConfig, EasingConfig, EasingPresetType } from '../types/animation';
import {
  DEFAULT_BOUNCE,
  DEFAULT_SPRING,
  SPRING_TIME_SCALE,
  getBounceSegments,
  getEasingBezier,
  getSpringPhysics,
} from './interpolator';

export type EasingMenuId = EasingPresetType | 'custom';

// Order of the curve dropdown: no easing and linear first, spring last, then the custom curve
export const EASING_MENU: { id: EasingMenuId; label: string; description: string }[] = [
  { id: 'hold', label: 'Sin suavizado', description: 'Cambio instantáneo, sin interpolar' },
  { id: 'linear', label: 'Linear', description: 'Velocidad constante' },
  { id: 'ease-in', label: 'Ease in', description: 'Arranca lento y acelera' },
  { id: 'ease-out', label: 'Ease out', description: 'Arranca rápido y frena' },
  { id: 'ease-in-out', label: 'Ease in-out', description: 'Acelera y frena suavemente' },
  { id: 'back-in', label: 'Back in', description: 'Toma impulso hacia atrás' },
  { id: 'back-out', label: 'Back out', description: 'Se pasa del final y regresa' },
  { id: 'bounce', label: 'Bounce', description: 'Rebota al llegar' },
  { id: 'spring', label: 'Spring', description: 'Resorte con rebote físico' },
  { id: 'custom', label: 'Personalizada', description: 'Parámetros editados' },
];

// How the curve is shaped and edited
export type EasingModel = 'hold' | 'linear' | 'bezier' | 'spring' | 'bounce';

export function getEasingModel(easing: EasingConfig): EasingModel {
  switch (easing.type) {
    case 'hold':
      return 'hold';
    case 'linear':
      return 'linear';
    case 'spring':
    case 'custom-spring':
      return 'spring';
    case 'bounce':
    case 'custom-bounce':
      return 'bounce';
    default:
      return 'bezier';
  }
}

const sameSpring = (a: EasingConfig['spring']) =>
  a.stiffness === DEFAULT_SPRING.stiffness && a.damping === DEFAULT_SPRING.damping && a.mass === DEFAULT_SPRING.mass;

// Dropdown entry for a curve. Older projects stored edited springs as 'spring', so a
// spring that differs from the default one is shown as custom too.
export function getEasingMenuId(easing: EasingConfig): EasingMenuId {
  if (easing.type === 'bezier' || easing.type === 'custom-spring' || easing.type === 'custom-bounce') return 'custom';
  if (easing.type === 'spring' && !sameSpring(easing.spring)) return 'custom';
  return easing.type;
}

export const isCustomEasing = (easing: EasingConfig) => getEasingMenuId(easing) === 'custom';

// Built-in curve with its default parameters (the custom parameters stored before are kept)
export function applyEasingPreset(easing: EasingConfig, type: EasingPresetType): EasingConfig {
  return type === 'spring' ? { ...easing, type, spring: { ...DEFAULT_SPRING } } : { ...easing, type };
}

// Editable copy of the current curve ("Personalizada")
export function toCustomEasing(easing: EasingConfig): EasingConfig {
  switch (getEasingModel(easing)) {
    case 'hold':
    case 'linear':
      // Handles on the diagonal: still linear, ready to be dragged
      return { ...easing, type: 'bezier', bezier: { x1: 0.33, y1: 0.33, x2: 0.67, y2: 0.67 } };
    case 'spring':
      return { ...easing, type: 'custom-spring', spring: { ...easing.spring } };
    case 'bounce':
      return {
        ...easing,
        type: 'custom-bounce',
        bounce: { ...(easing.type === 'custom-bounce' && easing.bounce ? easing.bounce : DEFAULT_BOUNCE) },
      };
    default:
      return { ...easing, type: 'bezier', bezier: { ...getEasingBezier(easing)! } };
  }
}

// Bézier handles shown on the graph: one for ease-in / ease-out (the other one sits on
// the end point), two for the rest of Bézier curves
export function getVisibleBezierHandles(easing: EasingConfig): ('p1' | 'p2')[] {
  if (getEasingModel(easing) !== 'bezier') return [];
  if (easing.type === 'ease-in') return ['p1'];
  if (easing.type === 'ease-out') return ['p2'];
  return ['p1', 'p2'];
}

const round = (v: number, decimals = 2) => Number(v.toFixed(decimals));
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Dragging a Bézier handle to (x, y) on the graph
export function moveBezierHandle(easing: EasingConfig, handle: 'p1' | 'p2', x: number, y: number): EasingConfig {
  const base: CubicBezierConfig = { ...(getEasingBezier(easing) ?? { x1: 0.33, y1: 0.33, x2: 0.67, y2: 0.67 }) };
  const px = round(clamp(x, 0, 1));
  const py = round(clamp(y, -1, 2));
  if (handle === 'p1') {
    base.x1 = px;
    base.y1 = py;
  } else {
    base.x2 = px;
    base.y2 = py;
  }
  return { ...easing, type: 'bezier', bezier: base };
}

// ── Spring handle: the first overshoot peak ─────────────────────────────────
// Its height sets the damping ratio and its position sets the oscillation speed.

const MAX_HANDLE_ZETA = 0.9;

export function getSpringHandle(easing: EasingConfig): { x: number; y: number } {
  const { w0, zeta } = getSpringPhysics(easing.spring);
  // Over/critically damped springs have no peak: keep the handle where the peak would start
  const z = Math.min(zeta, MAX_HANDLE_ZETA);
  const peakTime = Math.PI / (w0 * Math.sqrt(1 - z * z));
  const x = clamp(peakTime / SPRING_TIME_SCALE, 0, 1);
  const overshoot = zeta < 1 ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)) : 0;
  return { x, y: 1 + overshoot };
}

export function moveSpringHandle(easing: EasingConfig, x: number, y: number): EasingConfig {
  const overshoot = clamp(y - 1, 0.002, 0.95);
  const lnOs = Math.log(overshoot);
  const zeta = -lnOs / Math.sqrt(Math.PI * Math.PI + lnOs * lnOs);
  const peakTime = clamp(x, 0.04, 0.8) * SPRING_TIME_SCALE;
  const w0 = Math.PI / (peakTime * Math.sqrt(1 - zeta * zeta));
  const mass = Math.max(0.01, easing.spring.mass);
  return {
    ...easing,
    type: 'custom-spring',
    spring: { mass, stiffness: round(mass * w0 * w0), damping: round(2 * zeta * mass * w0) },
  };
}

// ── Bounce handle: the top of the first bounce ──────────────────────────────
// Its height sets the restitution and its position picks the number of bounces.

export const getBounceConfig = (easing: EasingConfig) =>
  easing.type === 'custom-bounce' && easing.bounce ? easing.bounce : DEFAULT_BOUNCE;

export function getBounceHandle(easing: EasingConfig): { x: number; y: number } {
  const seg = getBounceSegments(getBounceConfig(easing))[1];
  return { x: (seg.start + seg.end) / 2, y: 1 - seg.height };
}

export function moveBounceHandle(easing: EasingConfig, x: number, y: number): EasingConfig {
  const restitution = round(Math.sqrt(clamp(1 - y, 0.0025, 0.81)));
  let bounces = 1;
  let bestDistance = Infinity;
  for (let n = 1; n <= 8; n++) {
    const seg = getBounceSegments({ bounces: n, restitution })[1];
    const distance = Math.abs((seg.start + seg.end) / 2 - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      bounces = n;
    }
  }
  return { ...easing, type: 'custom-bounce', bounce: { bounces, restitution } };
}
