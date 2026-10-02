import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Stop } from '@phosphor-icons/react';
import { EasingConfig } from '../types/animation';
import { ScrubLabel } from './ScrubLabel';
import { NumberInput } from './NumberInput';
import { Dropdown } from './Dropdown';
import { evaluateEasing, getBounceSegments, getEasingBezier } from '../utils/interpolator';
import {
  EASING_MENU,
  EasingMenuId,
  applyEasingPreset,
  getBounceConfig,
  getBounceHandle,
  getEasingMenuId,
  getEasingModel,
  getSpringHandle,
  getVisibleBezierHandles,
  moveBezierHandle,
  moveBounceHandle,
  moveSpringHandle,
  toCustomEasing,
} from '../utils/easingPresets';

interface CurveEditorProps {
  easing: EasingConfig;
  onChange: (easing: EasingConfig, recordUndo?: boolean) => void;
  // Records one undo step before a drag (handle or label scrub) starts
  onStartScrub: () => void;
  // Length in seconds of the animated segment, used by the Test preview
  previewDuration: number;
}

type HandleId = 'p1' | 'p2' | 'spring' | 'bounce';
interface ValueRange {
  min: number;
  max: number;
}

// Graph geometry (SVG user units; the SVG scales to the panel width)
const W = 240;
const H = 150;
const PAD_X = 16;
const PAD_Y = 14;
const GW = W - PAD_X * 2;
const GH = H - PAD_Y * 2;

const fmt = (v: number) => Number(v.toFixed(2)).toString();

// Vertical range that fits the curve and its handles (overshoot, anticipation)
function getValueRange(easing: EasingConfig, handles: { y: number }[]): ValueRange {
  let min = 0;
  let max = 1;
  for (let i = 0; i <= 120; i++) {
    const v = evaluateEasing(easing, i / 120);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  for (const h of handles) {
    if (h.y < min) min = h.y;
    if (h.y > max) max = h.y;
  }
  const margin = (max - min) * 0.1;
  return { min: min - margin, max: max + margin };
}

// Curve drawn exactly: Bézier as one cubic, bounce as parabolic arches, spring densely sampled
function buildCurvePath(easing: EasingConfig, px: (t: number) => number, py: (v: number) => number): string {
  const model = getEasingModel(easing);
  const pt = (t: number, v: number) => `${px(t).toFixed(2)},${py(v).toFixed(2)}`;

  if (model === 'linear') return `M ${pt(0, 0)} L ${pt(1, 1)}`;

  const bezier = getEasingBezier(easing);
  if (bezier) {
    return `M ${pt(0, 0)} C ${pt(bezier.x1, bezier.y1)} ${pt(bezier.x2, bezier.y2)} ${pt(1, 1)}`;
  }

  if (model === 'bounce') {
    const [fall, ...arches] = getBounceSegments(getBounceConfig(easing));
    // Fall: v = (t / end)², a parabola whose quadratic control point is (end / 2, 0)
    let d = `M ${pt(0, 0)} Q ${pt(fall.end / 2, 0)} ${pt(fall.end, 1)}`;
    for (const seg of arches) {
      // Arch peaking at 1 - height in the middle: control point at 1 - 2·height
      d += ` Q ${pt((seg.start + seg.end) / 2, 1 - 2 * seg.height)} ${pt(seg.end, 1)}`;
    }
    return d;
  }

  const samples = 240;
  let d = `M ${pt(0, 0)}`;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    d += ` L ${pt(t, evaluateEasing(easing, t))}`;
  }
  return d;
}

// Small curve preview used in the dropdown
const EasingThumb: React.FC<{ easing: EasingConfig }> = ({ easing }) => {
  const w = 22;
  const h = 14;
  const px = (t: number) => 1 + t * (w - 2);
  const py = (v: number) => h - 2 - ((v + 0.25) / 1.6) * (h - 4);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden>
      <path
        d={buildCurvePath(easing, px, py)}
        fill="none"
        className="stroke-current opacity-80"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const CurveEditor: React.FC<CurveEditorProps> = ({ easing, onChange, onStartScrub, previewDuration }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<HandleId | null>(null);
  const frozenRange = useRef<ValueRange | null>(null);
  const [previewRun, setPreviewRun] = useState(0); // incremented to (re)start the preview
  const [isPreviewRunning, setIsPreviewRunning] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);

  // Always call the latest handler while a handle drag is in progress
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const model = getEasingModel(easing);
  const menuId = getEasingMenuId(easing);
  const bezier = getEasingBezier(easing);
  const bezierHandles = getVisibleBezierHandles(easing);
  const pointHandle =
    model === 'spring' ? getSpringHandle(easing) : model === 'bounce' ? getBounceHandle(easing) : null;

  const handlePoints = [
    ...(bezier && bezierHandles.includes('p1') ? [{ y: bezier.y1 }] : []),
    ...(bezier && bezierHandles.includes('p2') ? [{ y: bezier.y2 }] : []),
    ...(pointHandle ? [pointHandle] : []),
  ];
  const autoRange = getValueRange(easing, handlePoints);
  // The scale stays fixed while dragging so the handle doesn't drift away from the cursor
  const range = (dragging && frozenRange.current) || autoRange;

  const px = (t: number) => PAD_X + t * GW;
  const py = (v: number) => PAD_Y + ((range.max - v) / (range.max - range.min)) * GH;

  const curvePath = buildCurvePath(easing, px, py);

  // ── Test preview: plays the curve at the real speed of the selected segment ──
  // Read through a ref so selecting another keyframe doesn't replay a finished preview
  const durationMsRef = useRef(1000);
  durationMsRef.current = Math.min(5, Math.max(0.2, previewDuration)) * 1000;
  useEffect(() => {
    if (previewRun === 0) return;
    let animId = 0;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let start: number | null = null;
    const durationMs = durationMsRef.current;
    setIsPreviewRunning(true);

    const loop = (timestamp: number) => {
      if (start === null) start = timestamp;
      const t = Math.min(1, (timestamp - start) / durationMs);
      setPreviewProgress(t);
      if (t < 1) {
        animId = requestAnimationFrame(loop);
      } else {
        // Hold the final state for a moment before resetting
        holdTimer = setTimeout(() => {
          setIsPreviewRunning(false);
          setPreviewProgress(0);
        }, 450);
      }
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [previewRun]);

  const stopPreview = () => {
    setPreviewRun(0);
    setIsPreviewRunning(false);
    setPreviewProgress(0);
  };

  const previewEased = evaluateEasing(easing, previewProgress);

  // ── Handle dragging ───────────────────────────────────────────────────────
  const startHandleDrag = (handle: HandleId) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !svgRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const svg = svgRef.current;
    const fixedRange = range;
    const startEasing = easing;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    frozenRange.current = fixedRange;
    setDragging(handle);
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';

    const handleMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - startX) < 2 && Math.abs(ev.clientY - startY) < 2) return;
        started = true;
        onStartScrub();
      }
      const rect = svg.getBoundingClientRect();
      const gx = ((ev.clientX - rect.left) / rect.width) * W;
      const gy = ((ev.clientY - rect.top) / rect.height) * H;
      const x = (gx - PAD_X) / GW;
      const y = fixedRange.max - ((gy - PAD_Y) / GH) * (fixedRange.max - fixedRange.min);

      const next =
        handle === 'spring'
          ? moveSpringHandle(startEasing, x, y)
          : handle === 'bounce'
            ? moveBounceHandle(startEasing, x, y)
            : moveBezierHandle(startEasing, handle, x, y);
      onChangeRef.current(next, false);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.body.style.cursor = previousCursor;
      frozenRange.current = null;
      setDragging(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  const renderHandle = (id: HandleId, x: number, y: number) => (
    <g key={id} onPointerDown={startHandleDrag(id)} className={dragging === id ? 'cursor-grabbing' : 'cursor-grab'}>
      {/* Larger invisible hit area */}
      <circle cx={px(x)} cy={py(y)} r="11" fill="transparent" />
      <circle
        cx={px(x)}
        cy={py(y)}
        r={dragging === id ? 5.5 : 4.5}
        className="fill-bento-blue stroke-card transition-[r]"
        strokeWidth="1.5"
      />
    </g>
  );

  // ── Dropdown ──────────────────────────────────────────────────────────────
  const menuOptions = useMemo(
    () =>
      EASING_MENU.map((item) => ({
        value: item.id,
        label: item.label,
        description: item.description,
        separatorBefore: item.id === 'custom',
        icon: (
          <EasingThumb
            easing={
              item.id === 'custom'
                ? menuId === 'custom'
                  ? easing
                  : toCustomEasing(easing)
                : applyEasingPreset(easing, item.id)
            }
          />
        ),
      })),
    [easing, menuId]
  );

  const handleMenuChange = (id: EasingMenuId) => {
    if (id === 'custom') {
      if (menuId !== 'custom') onChange(toCustomEasing(easing));
      return;
    }
    onChange(applyEasingPreset(easing, id));
  };

  // ── Parameter fields (editing any of them switches to "Personalizada") ─────
  const setBezierParam = (param: 'x1' | 'y1' | 'x2' | 'y2', val: number, recordUndo = true) => {
    if (!Number.isFinite(val)) return;
    const base = toCustomEasing(easing);
    const v = param === 'x1' || param === 'x2' ? Math.max(0, Math.min(1, val)) : Math.max(-1, Math.min(2, val));
    onChange({ ...base, bezier: { ...base.bezier, [param]: Number(v.toFixed(3)) } }, recordUndo);
  };

  const setSpringParam = (param: 'stiffness' | 'damping' | 'mass', val: number, recordUndo = true) => {
    if (!Number.isFinite(val)) return;
    const base = toCustomEasing(easing);
    onChange({ ...base, spring: { ...base.spring, [param]: Math.max(0.1, val) } }, recordUndo);
  };

  const setBounceParam = (param: 'bounces' | 'restitution', val: number, recordUndo = true) => {
    if (!Number.isFinite(val)) return;
    const base = toCustomEasing(easing);
    const v = param === 'bounces' ? Math.max(1, Math.min(8, Math.round(val))) : Math.max(0.05, Math.min(0.9, val));
    onChange({ ...base, bounce: { ...getBounceConfig(base), [param]: v } }, recordUndo);
  };

  const fieldClass = 'w-16 bg-card border border-border rounded-md px-1.5 py-0.5 text-right text-foreground';

  const renderBezierField = (param: 'x1' | 'y1' | 'x2' | 'y2', label: string) => (
    <div className="flex items-center justify-between gap-1">
      <ScrubLabel
        value={bezier![param]}
        step={0.01}
        min={param.startsWith('x') ? 0 : -1}
        max={param.startsWith('x') ? 1 : 2}
        onScrubStart={onStartScrub}
        onChange={(v) => setBezierParam(param, v, false)}
        className="text-muted-foreground"
      >
        {label}
      </ScrubLabel>
      <NumberInput
        step={0.05}
        value={bezier![param]}
        onChange={(v) => setBezierParam(param, v)}
        className="w-full min-w-0 bg-card border border-border rounded-md px-1 py-0.5 text-right text-foreground"
      />
    </div>
  );

  const graphHint =
    model === 'linear'
      ? null
      : model === 'spring'
        ? 'Arrastra el punto: altura = rebote, posición = velocidad'
        : model === 'bounce'
          ? 'Arrastra el punto: altura = elasticidad, posición = rebotes'
          : 'Arrastra los puntos para ajustar la curva';

  return (
    <div className="space-y-2">
      {/* Curve selector */}
      <Dropdown
        value={menuId}
        options={menuOptions}
        onChange={handleMenuChange}
        align="left"
        size="sm"
        className="w-full font-medium"
        menuClassName="w-full"
        optionClassName=""
        title="Curva de suavizado"
        ariaLabel="Curva de suavizado"
      />

      {/* The visual curve graph */}
      <div className="relative bg-secondary rounded-lg p-2 border border-border">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto overflow-visible touch-none"
          role="img"
          aria-label="Gráfica de la curva de suavizado"
        >
          {/* Frame: start (0%) and target (100%) values, start and end of the segment */}
          <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(0)} className="stroke-border" />
          <line x1={px(0)} y1={py(1)} x2={px(1)} y2={py(1)} className="stroke-muted-foreground/40" strokeDasharray="3,3" />
          <line x1={px(0)} y1={PAD_Y} x2={px(0)} y2={PAD_Y + GH} className="stroke-border" strokeDasharray="2,3" />
          <line x1={px(1)} y1={PAD_Y} x2={px(1)} y2={PAD_Y + GH} className="stroke-border" strokeDasharray="2,3" />

          {/* Bézier handle arms */}
          {bezier && bezierHandles.includes('p1') && (
            <line x1={px(0)} y1={py(0)} x2={px(bezier.x1)} y2={py(bezier.y1)} className="stroke-bento-blue/60" strokeWidth="1.2" />
          )}
          {bezier && bezierHandles.includes('p2') && (
            <line x1={px(1)} y1={py(1)} x2={px(bezier.x2)} y2={py(bezier.y2)} className="stroke-bento-blue/60" strokeWidth="1.2" />
          )}

          {/* Spring / bounce guide from the handle to the target line */}
          {pointHandle && (
            <line
              x1={px(pointHandle.x)}
              y1={py(pointHandle.y)}
              x2={px(pointHandle.x)}
              y2={py(1)}
              className="stroke-bento-blue/50"
              strokeDasharray="2,2"
            />
          )}

          {/* Curve */}
          <path
            d={curvePath}
            fill="none"
            className="stroke-foreground"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Start and end keyframes */}
          <rect
            x={px(0) - 4}
            y={py(0) - 4}
            width="8"
            height="8"
            className="fill-card stroke-bento-blue"
            strokeWidth="1.5"
            transform={`rotate(45 ${px(0)} ${py(0)})`}
          />
          <rect
            x={px(1) - 4}
            y={py(1) - 4}
            width="8"
            height="8"
            className="fill-card stroke-bento-blue"
            strokeWidth="1.5"
            transform={`rotate(45 ${px(1)} ${py(1)})`}
          />

          {/* Live preview playhead */}
          {isPreviewRunning && (
            <>
              <line
                x1={px(previewProgress)}
                y1={PAD_Y}
                x2={px(previewProgress)}
                y2={PAD_Y + GH}
                className="stroke-bento-green/50"
              />
              <circle
                cx={px(previewProgress)}
                cy={py(previewEased)}
                r="4.5"
                className="fill-bento-green stroke-card"
                strokeWidth="1.5"
              />
            </>
          )}

          {/* Draggable handles */}
          {bezier && bezierHandles.includes('p1') && renderHandle('p1', bezier.x1, bezier.y1)}
          {bezier && bezierHandles.includes('p2') && renderHandle('p2', bezier.x2, bezier.y2)}
          {pointHandle && renderHandle(model === 'spring' ? 'spring' : 'bounce', pointHandle.x, pointHandle.y)}
        </svg>

        {/* Live test button */}
        <button
          type="button"
          onClick={() => (isPreviewRunning ? stopPreview() : setPreviewRun((n) => n + 1))}
          className="absolute top-2 right-2 p-1 rounded-md bg-card border border-border hover:bg-accent text-foreground transition-colors flex items-center gap-1 text-[10px]"
          data-tooltip={`Previsualizar la animación (${previewDuration.toFixed(2)}s)`}
        >
          {isPreviewRunning ? (
            <Stop className="w-2.5 h-2.5 text-bento-green" weight="fill" />
          ) : (
            <Play className="w-2.5 h-2.5 text-bento-green" weight="fill" />
          )}
          <span>{isPreviewRunning ? 'Stop' : 'Test'}</span>
        </button>

        {/* Preview lane: an object moving at the pace of the curve */}
        <div className="relative h-6 mt-1 rounded-md bg-card border border-border overflow-hidden" aria-hidden>
          <div className="absolute top-1/2 left-[10%] right-[10%] border-t border-dashed border-border" />
          <div className="absolute top-1 bottom-1 left-[10%] w-px bg-border" />
          <div className="absolute top-1 bottom-1 right-[10%] w-px bg-muted-foreground/40" />
          <div
            className={`absolute top-1/2 w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ${
              isPreviewRunning ? 'bg-bento-green' : 'bg-muted-foreground/50'
            }`}
            style={{ left: `${10 + Math.max(-0.12, Math.min(1.12, previewEased)) * 80}%` }}
          />
        </div>

        {graphHint && <p className="mt-1 text-[10px] text-muted-foreground leading-snug">{graphHint}</p>}
      </div>

      {/* Bézier parameters */}
      {bezier && (
        <div className="font-mono text-[11px] bg-secondary border border-border rounded-md p-2 space-y-1.5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {renderBezierField('x1', 'X1')}
            {renderBezierField('y1', 'Y1')}
            {renderBezierField('x2', 'X2')}
            {renderBezierField('y2', 'Y2')}
          </div>
          <p className="text-[10px] text-muted-foreground truncate select-text" data-tooltip="Equivalente en CSS">
            cubic-bezier({fmt(bezier.x1)}, {fmt(bezier.y1)}, {fmt(bezier.x2)}, {fmt(bezier.y2)})
          </p>
        </div>
      )}

      {/* Spring physics parameters */}
      {model === 'spring' && (
        <div className="space-y-1.5 font-mono text-[11px] bg-secondary border border-border rounded-md p-2">
          <div className="flex items-center justify-between">
            <ScrubLabel
              value={easing.spring.stiffness}
              onScrubStart={onStartScrub}
              onChange={(v) => setSpringParam('stiffness', v, false)}
              className="text-muted-foreground"
            >
              Stiffness (Rigidez)
            </ScrubLabel>
            <NumberInput
              step={5}
              value={easing.spring.stiffness}
              onChange={(v) => setSpringParam('stiffness', v)}
              className={fieldClass}
            />
          </div>
          <div className="flex items-center justify-between">
            <ScrubLabel
              value={easing.spring.damping}
              step={0.1}
              onScrubStart={onStartScrub}
              onChange={(v) => setSpringParam('damping', v, false)}
              className="text-muted-foreground"
            >
              Damping (Fricción)
            </ScrubLabel>
            <NumberInput
              step={0.5}
              value={easing.spring.damping}
              onChange={(v) => setSpringParam('damping', v)}
              className={fieldClass}
            />
          </div>
          <div className="flex items-center justify-between">
            <ScrubLabel
              value={easing.spring.mass}
              step={0.01}
              min={0.1}
              onScrubStart={onStartScrub}
              onChange={(v) => setSpringParam('mass', v, false)}
              className="text-muted-foreground"
            >
              Mass (Masa)
            </ScrubLabel>
            <NumberInput
              step={0.1}
              min={0.1}
              value={easing.spring.mass}
              onChange={(v) => setSpringParam('mass', v)}
              className={fieldClass}
            />
          </div>
        </div>
      )}

      {/* Bounce parameters */}
      {model === 'bounce' && (
        <div className="space-y-1.5 font-mono text-[11px] bg-secondary border border-border rounded-md p-2">
          <div className="flex items-center justify-between">
            <ScrubLabel
              value={getBounceConfig(easing).bounces}
              step={0.05}
              min={1}
              max={8}
              onScrubStart={onStartScrub}
              onChange={(v) => setBounceParam('bounces', v, false)}
              className="text-muted-foreground"
            >
              Rebotes
            </ScrubLabel>
            <NumberInput
              step={1}
              min={1}
              max={8}
              value={getBounceConfig(easing).bounces}
              onChange={(v) => setBounceParam('bounces', v)}
              className={fieldClass}
            />
          </div>
          <div className="flex items-center justify-between">
            <ScrubLabel
              value={getBounceConfig(easing).restitution}
              step={0.01}
              min={0.05}
              max={0.9}
              onScrubStart={onStartScrub}
              onChange={(v) => setBounceParam('restitution', v, false)}
              className="text-muted-foreground"
            >
              Elasticidad
            </ScrubLabel>
            <NumberInput
              step={0.05}
              min={0.05}
              max={0.9}
              value={getBounceConfig(easing).restitution}
              onChange={(v) => setBounceParam('restitution', v)}
              className={fieldClass}
            />
          </div>
        </div>
      )}

      {model === 'linear' && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Velocidad constante, sin parámetros. Elige «Personalizada» para editar la curva con puntos.
        </p>
      )}
    </div>
  );
};
