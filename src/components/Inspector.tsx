import React, { useState, useEffect } from 'react';
import {
  Clock,
  Sliders,
  Play,
  Lock,
  LockOpen as Unlock,
  Trash as Trash2,
  Copy,
  Crosshair,
  Diamond,
} from '@phosphor-icons/react';
import { Layer, Project, EasingConfig, AnimatableProperty, KeyframeRef } from '../types/animation';
import { evaluateEasing, getLayerPropertiesAtTime } from '../utils/interpolator';
import {
  PROPERTY_META,
  frameTolerance,
  getLayerKeyframeRange,
  isAnimatableProperty,
  resolveKeyframeRefs,
  snapToFrame,
} from '../utils/animationTracks';

interface InspectorProps {
  project: Project;
  selectedLayer: Layer | null;
  selectedKeyframes: KeyframeRef[];
  onUpdateLayerProperty: (layerId: string, property: string, value: any) => void;
  onUpdateLayerProperties: (layerId: string, properties: Partial<Layer['properties']>) => void;
  onToggleAnimation: (layerId: string, properties: AnimatableProperty[]) => void;
  onUpdateKeyframesEasing: (refs: KeyframeRef[], easing: EasingConfig) => void;
  onUpdateProjectSettings: (settings: Partial<Project>) => void;
  onDeleteLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  currentTime: number;
}

export const Inspector: React.FC<InspectorProps> = ({
  project,
  selectedLayer,
  selectedKeyframes,
  onUpdateLayerProperty,
  onUpdateLayerProperties,
  onToggleAnimation,
  onUpdateKeyframesEasing,
  onUpdateProjectSettings,
  onDeleteLayer,
  onDuplicateLayer,
  currentTime,
}) => {
  const [aspectLocked, setAspectLocked] = useState(true);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [isPreviewRunning, setIsPreviewRunning] = useState(false);

  // The curve editor works on the selected keyframes only (never on an implicit fallback),
  // showing the first one's curve and applying edits to all of them
  const selection = resolveKeyframeRefs(project, selectedKeyframes);
  const primary = selection[0];
  const selectionRefs = selection.map((sel) => sel.ref);
  const hasMixedEasing = selection.some(
    (sel) => JSON.stringify(sel.keyframe.easing) !== JSON.stringify(primary?.keyframe.easing)
  );
  const selectionLabel = !primary
    ? ''
    : selection.length > 1
      ? `${selection.length} fotogramas clave`
      : `${isAnimatableProperty(primary.track.property) ? PROPERTY_META[primary.track.property].label : primary.track.label} · ${primary.keyframe.time.toFixed(2)}s`;

  const currentEasing: EasingConfig = primary?.keyframe.easing || {
    type: 'spring',
    bezier: { x1: 0.25, y1: 1, x2: 0.5, y2: 1 },
    spring: { stiffness: 270.18, damping: 13.2, mass: 1 },
  };

  // Preview animation loop for testing value curve in real-time
  useEffect(() => {
    let animId: number;
    let startTime: number | null = null;
    const duration = 1200; // ms

    if (isPreviewRunning) {
      const loop = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const t = Math.min(1, elapsed / duration);
        setPreviewProgress(t);

        if (t < 1) {
          animId = requestAnimationFrame(loop);
        } else {
          setTimeout(() => {
            setIsPreviewRunning(false);
            setPreviewProgress(0);
          }, 300);
        }
      };
      animId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animId);
  }, [isPreviewRunning]);

  const applyEasing = (easing: EasingConfig) => {
    if (selectionRefs.length === 0) return;
    onUpdateKeyframesEasing(selectionRefs, easing);
  };

  const handleEasingTypeChange = (type: EasingConfig['type']) => {
    applyEasing({ ...currentEasing, type });
  };

  const handleSpringParamChange = (param: 'stiffness' | 'damping' | 'mass', val: number) => {
    applyEasing({
      ...currentEasing,
      type: 'spring',
      spring: {
        ...currentEasing.spring,
        [param]: Math.max(0.1, val),
      },
    });
  };

  const handleBezierParamChange = (param: 'x1' | 'y1' | 'x2' | 'y2', val: number) => {
    applyEasing({
      ...currentEasing,
      type: 'bezier',
      bezier: {
        ...currentEasing.bezier,
        [param]: val,
      },
    });
  };

  // Render SVG Path for the Value Curve Editor Graph (Nori value curve editor)
  const renderCurveGraph = () => {
    const width = 230;
    const height = 120;
    const padding = 16;
    const graphW = width - padding * 2;
    const graphH = height - padding * 2;

    const points: { x: number; y: number }[] = [];
    const samples = 40;

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const easedY = evaluateEasing(currentEasing, t);
      // Map x: [0, 1] -> [padding, padding + graphW]
      // Map y: [0, 1] -> [padding + graphH, padding] (inverted for SVG canvas, with headroom for overshoot)
      const x = padding + t * graphW;
      const y = padding + graphH - (easedY * (graphH * 0.75));
      points.push({ x, y });
    }

    const pathData = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, '');

    // Current position of preview test ball
    const previewEased = evaluateEasing(currentEasing, previewProgress);
    const ballX = padding + previewProgress * graphW;
    const ballY = padding + graphH - (previewEased * (graphH * 0.75));

    return (
      <div className="relative bg-secondary rounded-lg p-2 border border-border my-2">
        <svg width={width} height={height} className="w-full h-auto overflow-visible">
          {/* Subtle grid background */}
          <line
            x1={padding}
            y1={padding + graphH * 0.25}
            x2={padding + graphW}
            y2={padding + graphH * 0.25}
            className="stroke-border"
            strokeDasharray="2,3"
          />
          <line
            x1={padding}
            y1={padding + graphH}
            x2={padding + graphW}
            y2={padding + graphH}
            className="stroke-border"
          />

          {/* Reference baseline and target 100% line */}
          <line
            x1={padding}
            y1={padding + graphH - graphH * 0.75}
            x2={padding + graphW}
            y2={padding + graphH - graphH * 0.75}
            className="stroke-muted-foreground/40"
            strokeDasharray="3,3"
          />

          {/* Curve glow and line (Crisp white with overshoot) */}
          <path
            d={pathData}
            fill="none"
            className="stroke-foreground"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Start and End Keyframe Diamond Handles */}
          <rect
            x={padding - 4}
            y={padding + graphH - 4}
            width="8"
            height="8"
            className="fill-card stroke-bento-blue"
            strokeWidth="1.5"
            transform={`rotate(45 ${padding} ${padding + graphH})`}
          />
          <rect
            x={padding + graphW - 4}
            y={padding + graphH - graphH * 0.75 - 4}
            width="8"
            height="8"
            className="fill-card stroke-bento-blue"
            strokeWidth="1.5"
            transform={`rotate(45 ${padding + graphW} ${padding + graphH - graphH * 0.75})`}
          />

          {/* Dynamic Interactive Blue Handle Indicator */}
          <circle
            cx={padding + graphW * 0.35}
            cy={padding + graphH - graphH * 0.45}
            r="4"
            className="fill-bento-blue"
          />

          {/* Live Preview Test Ball */}
          {isPreviewRunning && (
            <circle
              cx={ballX}
              cy={ballY}
              r="5"
              className="fill-bento-green stroke-card transition-all"
              strokeWidth="1.5"
            />
          )}
        </svg>

        {/* Live Test Curve Button */}
        <button
          onClick={() => setIsPreviewRunning(true)}
          className="absolute top-2 right-2 p-1 rounded-md bg-card border border-border hover:bg-accent text-foreground transition-colors flex items-center gap-1 text-[10px]"
          title="Probar suavizado en vivo"
        >
          <Play className="w-2.5 h-2.5 text-bento-green" />
          <span>Test</span>
        </button>
      </div>
    );
  };

  // If no layer selected, show project settings
  if (!selectedLayer) {
    return (
      <aside className="w-72 shrink-0 bg-card border-l border-border p-3 text-xs overflow-y-auto select-none">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-border">
          <Sliders className="w-4 h-4 text-bento-blue" />
          <span className="font-semibold text-foreground">Ajustes del Proyecto</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-muted-foreground block mb-1">Nombre</label>
            <input
              type="text"
              value={project.title}
              onChange={(e) => onUpdateProjectSettings({ title: e.target.value })}
              className="w-full bg-secondary border border-border rounded-md px-2.5 py-1.5 text-foreground focus:outline-none focus:border-bento-blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-muted-foreground block mb-1">Ancho (px)</label>
              <input
                type="number"
                value={project.width}
                onChange={(e) => onUpdateProjectSettings({ width: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">Alto (px)</label>
              <input
                type="number"
                value={project.height}
                onChange={(e) => onUpdateProjectSettings({ height: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-muted-foreground block mb-1">Duración (s)</label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="60"
                value={project.duration}
                onChange={(e) => onUpdateProjectSettings({ duration: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">FPS</label>
              <select
                value={project.fps}
                onChange={(e) => onUpdateProjectSettings({ fps: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
              >
                <option value={24}>24 fps</option>
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-muted-foreground block mb-1">Fondo del Lienzo</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={project.backgroundColor.startsWith('#') ? project.backgroundColor : '#ffffff'}
                onChange={(e) => onUpdateProjectSettings({ backgroundColor: e.target.value })}
                className="w-7 h-7 rounded-md border border-border bg-transparent cursor-pointer"
              />
              <input
                type="text"
                value={project.backgroundColor}
                onChange={(e) => onUpdateProjectSettings({ backgroundColor: e.target.value })}
                className="flex-1 bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border text-muted-foreground text-[11px] leading-relaxed">
            <p>💡 Selecciona cualquier capa en el lienzo o en la línea de tiempo para inspeccionar y editar sus propiedades y curvas de suavizado.</p>
          </div>
        </div>
      </aside>
    );
  }

  // Values shown are the animated values at the current time
  const p = getLayerPropertiesAtTime(selectedLayer, currentTime);
  const keyframeRange = getLayerKeyframeRange(selectedLayer);
  const layerId = selectedLayer.id;

  // Keyframe icon: gray = not animated, blue = animated (filled when a keyframe sits on the current frame)
  const renderAnimToggle = (properties: AnimatableProperty[], label: string) => {
    const tracks = selectedLayer.tracks.filter((t) => properties.includes(t.property));
    const isAnimated = tracks.length > 0;
    const frameTime = snapToFrame(currentTime, project.fps);
    const hasKeyAtCurrent = tracks.some((t) =>
      t.keyframes.some((k) => Math.abs(k.time - frameTime) < frameTolerance(project.fps))
    );

    return (
      <button
        type="button"
        onClick={() => onToggleAnimation(layerId, properties)}
        className={`p-0.5 rounded transition-colors ${
          isAnimated ? 'text-bento-blue hover:text-bento-blue/80' : 'text-muted-foreground/50 hover:text-foreground'
        }`}
        title={isAnimated ? `Desactivar animación de ${label}` : `Activar animación de ${label}`}
      >
        <Diamond className="w-3 h-3" weight={isAnimated && hasKeyAtCurrent ? 'fill' : isAnimated ? 'bold' : 'regular'} />
      </button>
    );
  };

  return (
    <aside className="w-72 shrink-0 bg-card border-l border-border p-3 text-xs overflow-y-auto select-none flex flex-col justify-between">
      <div className="space-y-3">
        {/* Layer Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold text-foreground capitalize truncate">
              {selectedLayer.name}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onDuplicateLayer(selectedLayer.id)}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
              title="Duplicar capa"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteLayer(selectedLayer.id)}
              className="p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-accent"
              title="Eliminar capa"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Timing Section (Start & Duration) */}
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Animación
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-secondary border border-border rounded-md p-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3 text-bento-blue" />
                <span>Start</span>
              </div>
              <span className="font-mono text-foreground">
                {keyframeRange ? `${keyframeRange.start.toFixed(2)}s` : '—'}
              </span>
            </div>
            <div className="bg-secondary border border-border rounded-md p-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3 text-bento-blue" />
                <span>Duration</span>
              </div>
              <span className="font-mono text-foreground">
                {keyframeRange ? `${(keyframeRange.end - keyframeRange.start).toFixed(2)}s` : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Value Curve Section  */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Curva de Suavizado (Value Curve)
            </span>
            <span className="text-[10px] font-mono text-bento-blue">
              {selectionLabel}
            </span>
          </div>

          {!primary ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed bg-secondary border border-border rounded-md p-2">
              {selectedLayer.tracks.length === 0 ? (
                <>
                  Activa la animación de un parámetro con el icono{' '}
                  <Diamond className="inline w-2.5 h-2.5 -mt-0.5" /> para crear fotogramas clave y editar su curva.
                </>
              ) : (
                <>
                  Selecciona uno o varios fotogramas clave en la línea del tiempo (Shift/Ctrl + clic o
                  arrastrando un recuadro) para editar su curva de suavizado.
                </>
              )}
            </p>
          ) : (
          <>
          {hasMixedEasing && (
            <p className="text-[10px] text-bento-orange mb-1.5">
              Los fotogramas seleccionados tienen curvas distintas; al editar se aplicará esta a todos.
            </p>
          )}
          {/* Easing Type Selector */}
          <div className="flex items-center gap-1 p-0.5 bg-secondary border border-border rounded-md mb-2">
            {(['spring', 'bezier', 'ease-in-out', 'bounce', 'linear'] as const).map((type) => (
              <button
                key={type}
                onClick={() => handleEasingTypeChange(type)}
                className={`flex-1 py-1 text-[10px] font-medium rounded-md capitalize transition-colors ${
                  currentEasing.type === type
                    ? 'bg-bento-blue text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {type === 'bezier' ? 'Bézier' : type}
              </button>
            ))}
          </div>

          {/* The Visual Curve Graph */}
          {renderCurveGraph()}

          {/* Spring Physics Parameters (Stiffness, Damping, Mass) */}
          {currentEasing.type === 'spring' && (
            <div className="space-y-1.5 font-mono text-[11px] bg-secondary border border-border rounded-md p-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stiffness (Rigidez)</span>
                <input
                  type="number"
                  step="5"
                  value={currentEasing.spring.stiffness}
                  onChange={(e) => handleSpringParamChange('stiffness', Number(e.target.value))}
                  className="w-16 bg-card border border-border rounded-md px-1.5 py-0.5 text-right text-foreground"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Damping (Fricción)</span>
                <input
                  type="number"
                  step="0.5"
                  value={currentEasing.spring.damping}
                  onChange={(e) => handleSpringParamChange('damping', Number(e.target.value))}
                  className="w-16 bg-card border border-border rounded-md px-1.5 py-0.5 text-right text-foreground"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mass (Masa)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={currentEasing.spring.mass}
                  onChange={(e) => handleSpringParamChange('mass', Number(e.target.value))}
                  className="w-16 bg-card border border-border rounded-md px-1.5 py-0.5 text-right text-foreground"
                />
              </div>
            </div>
          )}

          {/* Cubic Bezier Handles if Bezier is selected */}
          {currentEasing.type === 'bezier' && (
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-secondary border border-border rounded-md p-2">
              <div>
                <span className="text-muted-foreground block mb-0.5">X1, Y1</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.05"
                    value={currentEasing.bezier.x1}
                    onChange={(e) => handleBezierParamChange('x1', Number(e.target.value))}
                    className="w-full bg-card border border-border rounded-md px-1 py-0.5 text-foreground"
                  />
                  <input
                    type="number"
                    step="0.05"
                    value={currentEasing.bezier.y1}
                    onChange={(e) => handleBezierParamChange('y1', Number(e.target.value))}
                    className="w-full bg-card border border-border rounded-md px-1 py-0.5 text-foreground"
                  />
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">X2, Y2</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.05"
                    value={currentEasing.bezier.x2}
                    onChange={(e) => handleBezierParamChange('x2', Number(e.target.value))}
                    className="w-full bg-card border border-border rounded-md px-1 py-0.5 text-foreground"
                  />
                  <input
                    type="number"
                    step="0.05"
                    value={currentEasing.bezier.y2}
                    onChange={(e) => handleBezierParamChange('y2', Number(e.target.value))}
                    className="w-full bg-card border border-border rounded-md px-1 py-0.5 text-foreground"
                  />
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Transform Properties */}
        <div className="pt-2 border-t border-border space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Transformación
          </span>

          {/* Position X / Y */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Posición</span>
              {renderAnimToggle(['x', 'y'], 'posición')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1">
                <span className="text-muted-foreground font-mono">X</span>
                <input
                  type="number"
                  value={Math.round(p.x)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'x', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  title="Posición X"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1">
                <span className="text-muted-foreground font-mono">Y</span>
                <input
                  type="number"
                  value={Math.round(p.y)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'y', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  title="Posición Y"
                />
              </div>
            </div>
          </div>

          {/* Anchor Point (Punto de Anclaje) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                <Crosshair className="w-3 h-3 text-bento-blue" />
                <span>Punto de Anclaje</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateLayerProperties(layerId, { anchorX: 0, anchorY: 0 })}
                  className="text-[9px] text-bento-blue hover:text-bento-blue/80 font-mono hover:underline"
                  title="Centrar punto de anclaje (0, 0)"
                >
                  Centrar (0, 0)
                </button>
                {renderAnimToggle(['anchorX', 'anchorY'], 'punto de anclaje')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1">
                <span className="text-muted-foreground font-mono text-[10px]">Ax</span>
                <input
                  type="number"
                  value={Math.round(p.anchorX || 0)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'anchorX', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  title="Punto de anclaje X (horizontal)"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1">
                <span className="text-muted-foreground font-mono text-[10px]">Ay</span>
                <input
                  type="number"
                  value={Math.round(p.anchorY || 0)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'anchorY', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  title="Punto de anclaje Y (vertical)"
                />
              </div>
            </div>
          </div>

          {/* Scale X / Y & Link */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-medium">Escala</span>
            {renderAnimToggle(['scaleX', 'scaleY'], 'escala')}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-1 bg-secondary border border-border rounded-md px-2 py-1">
              <span className="text-muted-foreground font-mono">W</span>
              <input
                type="number"
                value={Math.round((p.scaleX ?? 1) * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  onUpdateLayerProperties(layerId, aspectLocked ? { scaleX: val, scaleY: val } : { scaleX: val });
                }}
                className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
              />
              <span className="text-muted-foreground font-mono text-[10px]">%</span>
            </div>

            <button
              onClick={() => setAspectLocked(!aspectLocked)}
              className={`p-1.5 rounded-md border ${
                aspectLocked
                  ? 'bg-bento-blue/10 border-bento-blue/40 text-bento-blue'
                  : 'bg-secondary border-border text-muted-foreground'
              }`}
              title="Vincular proporción"
            >
              {aspectLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>

            <div className="flex-1 flex items-center gap-1 bg-secondary border border-border rounded-md px-2 py-1">
              <span className="text-muted-foreground font-mono">H</span>
              <input
                type="number"
                value={Math.round((p.scaleY ?? 1) * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  onUpdateLayerProperties(layerId, aspectLocked ? { scaleX: val, scaleY: val } : { scaleY: val });
                }}
                className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
              />
              <span className="text-muted-foreground font-mono text-[10px]">%</span>
            </div>
          </div>

          {/* Rotation & Opacity */}
          <div className="grid grid-cols-2 gap-2 -mb-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Rotación</span>
              {renderAnimToggle(['rotation'], 'rotación')}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Opacidad</span>
              {renderAnimToggle(['opacity'], 'opacidad')}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1">
              <span className="text-muted-foreground font-mono">∡</span>
              <input
                type="number"
                value={Math.round(p.rotation || 0)}
                onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'rotation', Number(e.target.value))}
                className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
              />
              <span className="text-muted-foreground font-mono text-[10px]">°</span>
            </div>
            <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 py-1">
              <span className="text-muted-foreground font-mono">Op</span>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round((p.opacity ?? 1) * 100)}
                onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'opacity', Number(e.target.value) / 100)}
                className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
              />
              <span className="text-muted-foreground font-mono text-[10px]">%</span>
            </div>
          </div>
        </div>

        {/* Text Layer specific attributes */}
        {selectedLayer.type === 'text' && (
          <div className="pt-2 border-t border-border space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Contenido de Texto
            </span>
            <input
              type="text"
              value={p.text || ''}
              onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'text', e.target.value)}
              className="w-full bg-secondary border border-border rounded-md px-2 py-1.5 text-foreground"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground block mb-0.5 text-[10px]">Tamaño</span>
                <input
                  type="number"
                  value={p.fontSize || 32}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'fontSize', Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
                />
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5 text-[10px]">Grosor</span>
                <select
                  value={p.fontWeight || '700'}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'fontWeight', e.target.value)}
                  className="w-full bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
                >
                  <option value="400">Regular (400)</option>
                  <option value="600">Semibold (600)</option>
                  <option value="700">Bold (700)</option>
                  <option value="800">Black (800)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Fill & Color Styling */}
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Relleno y Trazo
            </span>
            {renderAnimToggle(['fill'], 'relleno')}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={p.fill.startsWith('#') ? p.fill : '#0084ff'}
              onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'fill', e.target.value)}
              className="w-7 h-7 rounded-md border border-border bg-transparent cursor-pointer"
            />
            <input
              type="text"
              value={p.fill}
              onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'fill', e.target.value)}
              className="flex-1 bg-secondary border border-border rounded-md px-2 py-1 font-mono text-foreground"
            />
          </div>
        </div>
      </div>
    </aside>
  );
};
