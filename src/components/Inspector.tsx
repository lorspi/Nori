import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Sliders,
  Lock,
  LockOpen as Unlock,
  Trash as Trash2,
  Copy,
  Crosshair,
  Diamond,
  Minus,
  Plus,
  PencilSimple,
  Polygon as PolygonIcon,
} from '@phosphor-icons/react';
import { ColorSwatch, isNoColor, useUndoSession } from './ColorSwatch';
import { DEFAULT_SHAPE } from '../utils/pathGeometry';
import { Layer, Project, EasingConfig, AnimatableProperty, KeyframeRef } from '../types/animation';
import { ScrubLabel } from './ScrubLabel';
import { getLayerPropertiesAtTime } from '../utils/interpolator';
import { CurveEditor } from './CurveEditor';
import { Dropdown } from './Dropdown';
import {
  PROPERTY_META,
  createDefaultEasing,
  frameTolerance,
  getLayerKeyframeRange,
  isAnimatableProperty,
  resolveKeyframeRefs,
  snapToFrame,
} from '../utils/animationTracks';

interface InspectorProps {
  project: Project;
  selectedLayer: Layer | null;
  selectedLayerIds: string[];
  selectedKeyframes: KeyframeRef[];
  onUpdateLayerProperty: (layerId: string | string[], property: string, value: any, recordUndo?: boolean) => void;
  onUpdateLayerProperties: (layerId: string | string[], properties: Partial<Layer['properties']>, recordUndo?: boolean) => void;
  onRenameLayer: (layerId: string, name: string) => void;
  // Records one undo step before a label drag (scrub) starts
  onStartScrub: () => void;
  onToggleAnimation: (layerId: string, properties: AnimatableProperty[]) => void;
  // Vertex editing (basic shapes are converted to a path first)
  vertexEditLayerId: string | null;
  onToggleVertexEdit: (layerId: string) => void;
  onUpdateKeyframesEasing: (refs: KeyframeRef[], easing: EasingConfig, recordUndo?: boolean) => void;
  onUpdateProjectSettings: (settings: Partial<Project>, recordUndo?: boolean) => void;
  onDeleteLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  currentTime: number;
}

// Layer name renamed in place, like the project title (click to edit, Enter to save, Esc to cancel)
const LayerNameInput: React.FC<{ name: string; onRename: (name: string) => void }> = ({ name, onRename }) => {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const commit = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(name);
    } else if (next !== name) {
      onRename(next);
    }
  };

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(name);
          // Blur after the reset so the original name is kept
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      maxLength={80}
      spellCheck={false}
      data-tooltip="Clic para renombrar la capa"
      aria-label="Nombre de la capa"
      className="w-full min-w-0 bg-transparent border-0 font-semibold text-foreground hover:bg-accent focus:bg-secondary px-1.5 py-0.5 -ml-1.5 rounded-md focus:outline-none transition-colors focus:ring-1 focus:ring-ring truncate"
    />
  );
};

export const Inspector: React.FC<InspectorProps> = ({
  project,
  selectedLayer,
  selectedLayerIds,
  selectedKeyframes,
  onUpdateLayerProperty,
  onUpdateLayerProperties,
  onRenameLayer,
  onStartScrub,
  onToggleAnimation,
  vertexEditLayerId,
  onToggleVertexEdit,
  onUpdateKeyframesEasing,
  onUpdateProjectSettings,
  onDeleteLayer,
  onDuplicateLayer,
  currentTime,
}) => {
  const [aspectLocked, setAspectLocked] = useState(true);
  // Last color of each removed fill / stroke, restored when it's added back
  const lastColors = useRef<Record<string, string>>({});
  // Typing a hex color is one undo step per visit to the field
  const typingSession = useUndoSession();

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

  const currentEasing: EasingConfig = primary?.keyframe.easing ?? createDefaultEasing();

  // Length of the animated segment that starts at the selected keyframe (for the Test preview)
  const nextKeyframe = primary?.track.keyframes.find((k) => k.time > primary.keyframe.time + 1e-6);
  const previewDuration = primary && nextKeyframe ? nextKeyframe.time - primary.keyframe.time : 1;

  const applyEasing = (easing: EasingConfig, recordUndo = true) => {
    if (selectionRefs.length === 0) return;
    onUpdateKeyframesEasing(selectionRefs, easing, recordUndo);
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
              className="w-full bg-secondary border border-border rounded-md px-2 h-7 text-foreground focus:outline-none focus:border-bento-blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <ScrubLabel
                value={project.width}
                min={1}
                onScrubStart={onStartScrub}
                onChange={(v) => onUpdateProjectSettings({ width: v }, false)}
                className="text-muted-foreground block w-fit mb-1"
              >
                Ancho (px)
              </ScrubLabel>
              <input
                type="number"
                value={project.width}
                onChange={(e) => onUpdateProjectSettings({ width: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
              />
            </div>
            <div>
              <ScrubLabel
                value={project.height}
                min={1}
                onScrubStart={onStartScrub}
                onChange={(v) => onUpdateProjectSettings({ height: v }, false)}
                className="text-muted-foreground block w-fit mb-1"
              >
                Alto (px)
              </ScrubLabel>
              <input
                type="number"
                value={project.height}
                onChange={(e) => onUpdateProjectSettings({ height: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <ScrubLabel
                value={project.duration}
                step={0.1}
                min={0.5}
                max={60}
                onScrubStart={onStartScrub}
                onChange={(v) => onUpdateProjectSettings({ duration: v }, false)}
                className="text-muted-foreground block w-fit mb-1"
              >
                Duración (s)
              </ScrubLabel>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="60"
                value={project.duration}
                onChange={(e) => onUpdateProjectSettings({ duration: Number(e.target.value) })}
                className="w-full bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
              />
            </div>
            <div>
              <label className="text-muted-foreground block mb-1">FPS</label>
              <Dropdown
                value={project.fps}
                options={[24, 30, 60].map((fps) => ({ value: fps, label: `${fps} fps` }))}
                onChange={(fps) => onUpdateProjectSettings({ fps })}
                align="left"
                size="sm"
                className="w-full font-mono"
                menuClassName="w-full"
                ariaLabel="FPS"
              />
            </div>
          </div>

          <div>
            <label className="text-muted-foreground block mb-1">Fondo del Lienzo</label>
            <div className="flex items-center gap-2">
              <ColorSwatch
                value={project.backgroundColor}
                onChange={(color, recordUndo) => onUpdateProjectSettings({ backgroundColor: color }, recordUndo)}
                title="Color de fondo"
              />
              <input
                type="text"
                value={project.backgroundColor}
                onFocus={typingSession.begin}
                onChange={(e) => onUpdateProjectSettings({ backgroundColor: e.target.value }, typingSession.take())}
                className="flex-1 bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
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

  // Scale fields are shown in %; with the aspect lock on, both axes change together
  const setScale = (axis: 'scaleX' | 'scaleY', percent: number, recordUndo = true) => {
    const val = percent / 100;
    onUpdateLayerProperties(layerId, aspectLocked ? { scaleX: val, scaleY: val } : { [axis]: val }, recordUndo);
  };

  // Color changes apply to every selected layer when the Inspector's layer is part of the selection
  const fillTargets = selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId];

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
        data-tooltip={isAnimated ? `Desactivar animación de ${label}` : `Activar animación de ${label}`}
      >
        <Diamond className="w-3 h-3" weight={isAnimated && hasKeyAtCurrent ? 'fill' : isAnimated ? 'bold' : 'regular'} />
      </button>
    );
  };

  // Color row: swatch, hex value and a button to remove or add the color back.
  // Changes apply to every selected layer when this layer is part of the selection.
  const renderPaintRow = (prop: 'fill' | 'stroke', defaultColor: string, emptyLabel: string) => {
    const value = p[prop];
    const none = isNoColor(value);
    const key = `${layerId}:${prop}`;
    const setColor = (color: string, recordUndo = true) => {
      const changes: Partial<Layer['properties']> = { [prop]: color };
      // A stroke that is added back needs a visible width
      if (prop === 'stroke' && !isNoColor(color) && !(p.strokeWidth > 0)) changes.strokeWidth = 2;
      onUpdateLayerProperties(fillTargets, changes, recordUndo);
    };
    return (
      <div className="flex items-center gap-1.5">
        <ColorSwatch value={value} onChange={setColor} title={prop === 'fill' ? 'Color de relleno' : 'Color del trazo'} />
        <input
          type="text"
          value={none ? '' : value}
          placeholder={emptyLabel}
          onFocus={typingSession.begin}
          onChange={(e) => setColor(e.target.value.trim() || 'transparent', typingSession.take())}
          className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => {
            if (none) {
              setColor(lastColors.current[key] ?? defaultColor);
            } else {
              lastColors.current[key] = value;
              setColor('transparent');
            }
          }}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
          data-tooltip={none ? (prop === 'fill' ? 'Añadir relleno' : 'Añadir trazo') : prop === 'fill' ? 'Quitar relleno' : 'Quitar trazo'}
        >
          {none ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        </button>
      </div>
    );
  };

  // Numeric field with a draggable label (Figma style)
  const renderNumberField = (
    prop: 'sides' | 'points' | 'innerRadius' | 'radius' | 'blur',
    label: string,
    shown: number,
    opts: {
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      round?: boolean;
      title?: string;
      toValue?: (v: number) => number;
    } = {}
  ) => {
    const { min, max, step = 1, unit, round, title, toValue = (v: number) => v } = opts;
    const toStored = (v: number) => {
      let next = round ? Math.round(v) : v;
      if (min !== undefined) next = Math.max(min, next);
      if (max !== undefined) next = Math.min(max, next);
      return toValue(next);
    };
    return (
      <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7" data-tooltip={title}>
        <ScrubLabel
          value={shown}
          step={step}
          min={min}
          max={max}
          onScrubStart={onStartScrub}
          onChange={(v) => onUpdateLayerProperty(layerId, prop, toStored(v), false)}
          className="text-muted-foreground text-[10px] whitespace-nowrap"
        >
          {label}
        </ScrubLabel>
        <input
          type="number"
          min={min}
          max={max}
          value={shown}
          onChange={(e) => {
            if (e.target.value === '') return;
            onUpdateLayerProperty(layerId, prop, toStored(Number(e.target.value)));
          }}
          className="w-full min-w-0 bg-transparent text-right font-mono text-foreground focus:outline-none"
          aria-label={label}
        />
        {unit && <span className="text-muted-foreground font-mono text-[10px]">{unit}</span>}
      </div>
    );
  };

  return (
    <aside className="w-72 shrink-0 bg-card border-l border-border p-3 text-xs overflow-y-auto select-none flex flex-col justify-between">
      <div className="space-y-3">
        {/* Layer Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex-1 min-w-0 mr-2">
            <LayerNameInput name={selectedLayer.name} onRename={(name) => onRenameLayer(selectedLayer.id, name)} />
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onDuplicateLayer(selectedLayer.id)}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
              data-tooltip="Duplicar capa"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteLayer(selectedLayer.id)}
              className="p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-accent"
              data-tooltip="Eliminar capa"
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
            <div className="bg-secondary border border-border rounded-md px-1.5 h-7 flex items-center justify-between">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3 text-bento-blue" />
                <span>Start</span>
              </div>
              <span className="font-mono text-foreground">
                {keyframeRange ? `${keyframeRange.start.toFixed(2)}s` : '—'}
              </span>
            </div>
            <div className="bg-secondary border border-border rounded-md px-1.5 h-7 flex items-center justify-between">
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
          <CurveEditor
            easing={currentEasing}
            onChange={applyEasing}
            onStartScrub={onStartScrub}
            previewDuration={previewDuration}
          />
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
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round(p.x)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'x', v, false)}
                  className="text-muted-foreground font-mono"
                >
                  X
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round(p.x)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'x', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip="Posición X"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round(p.y)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'y', v, false)}
                  className="text-muted-foreground font-mono"
                >
                  Y
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round(p.y)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'y', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip="Posición Y"
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
                  data-tooltip="Centrar punto de anclaje (0, 0)"
                >
                  Centrar (0, 0)
                </button>
                {renderAnimToggle(['anchorX', 'anchorY'], 'punto de anclaje')}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round(p.anchorX || 0)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'anchorX', v, false)}
                  className="text-muted-foreground font-mono text-[10px]"
                >
                  Ax
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round(p.anchorX || 0)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'anchorX', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip="Punto de anclaje X (horizontal)"
                />
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round(p.anchorY || 0)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'anchorY', v, false)}
                  className="text-muted-foreground font-mono text-[10px]"
                >
                  Ay
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round(p.anchorY || 0)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'anchorY', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip="Punto de anclaje Y (vertical)"
                />
              </div>
            </div>
          </div>

          {/* Scale X / Y & Link */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Escala</span>
              {renderAnimToggle(['scaleX', 'scaleY'], 'escala')}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 flex items-center gap-1 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round((p.scaleX ?? 1) * 100)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => setScale('scaleX', v, false)}
                  className="text-muted-foreground font-mono"
                >
                  W
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round((p.scaleX ?? 1) * 100)}
                  onChange={(e) => setScale('scaleX', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                />
                <span className="text-muted-foreground font-mono text-[10px]">%</span>
              </div>

              <button
                onClick={() => setAspectLocked(!aspectLocked)}
                className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-md border ${
                  aspectLocked
                    ? 'bg-bento-blue/10 border-bento-blue/40 text-bento-blue'
                    : 'bg-secondary border-border text-muted-foreground'
                }`}
                data-tooltip="Vincular proporción"
              >
                {aspectLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              </button>

              <div className="flex-1 flex items-center gap-1 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round((p.scaleY ?? 1) * 100)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => setScale('scaleY', v, false)}
                  className="text-muted-foreground font-mono"
                >
                  H
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round((p.scaleY ?? 1) * 100)}
                  onChange={(e) => setScale('scaleY', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                />
                <span className="text-muted-foreground font-mono text-[10px]">%</span>
              </div>
            </div>
          </div>

          {/* Rotation & Opacity */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Rotación</span>
                {renderAnimToggle(['rotation'], 'rotación')}
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round(p.rotation || 0)}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'rotation', v, false)}
                  className="text-muted-foreground font-mono"
                >
                  ∡
                </ScrubLabel>
                <input
                  type="number"
                  value={Math.round(p.rotation || 0)}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'rotation', Number(e.target.value))}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                />
                <span className="text-muted-foreground font-mono text-[10px]">°</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Opacidad</span>
                {renderAnimToggle(['opacity'], 'opacidad')}
              </div>
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
                <ScrubLabel
                  value={Math.round((p.opacity ?? 1) * 100)}
                  min={0}
                  max={100}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'opacity', v / 100, false)}
                  className="text-muted-foreground font-mono"
                >
                  Op
                </ScrubLabel>
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
        </div>

        {/* Shape geometry & vertices */}
        {selectedLayer.type !== 'text' && (
          <div className="pt-2 border-t border-border space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              Forma
            </span>

            {selectedLayer.type === 'polygon' &&
              renderNumberField('sides', 'Lados', p.sides ?? DEFAULT_SHAPE.sides, { min: 3, max: 12, step: 0.1, round: true })}
            {selectedLayer.type === 'star' && (
              <div className="grid grid-cols-2 gap-2">
                {renderNumberField('points', 'Puntas', p.points ?? DEFAULT_SHAPE.points, { min: 3, max: 12, step: 0.1, round: true })}
                {renderNumberField('innerRadius', 'Interior', Math.round((p.innerRadius ?? DEFAULT_SHAPE.innerRadius) * 100), {
                  min: 5,
                  max: 100,
                  unit: '%',
                  toValue: (v) => v / 100,
                  title: 'Radio interior respecto al exterior',
                })}
              </div>
            )}

            {['rect', 'polygon', 'star'].includes(selectedLayer.type) && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-medium">Esquinas redondeadas</span>
                  {renderAnimToggle(['radius'], 'radio de esquinas')}
                </div>
                {renderNumberField('radius', 'Radio', Math.round(p.radius || 0), { min: 0, max: 1000, unit: 'px' })}
              </div>
            )}

            {/* Vertex editing / shape animation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Vértices</span>
                {selectedLayer.type === 'path' && renderAnimToggle(['pathData'], 'forma')}
              </div>
              <button
                type="button"
                onClick={() => onToggleVertexEdit(layerId)}
                className={`w-full flex items-center justify-center gap-1.5 px-2 h-7 rounded-md border text-[11px] font-medium transition-colors ${
                  vertexEditLayerId === layerId
                    ? 'bg-bento-blue text-white border-bento-blue'
                    : 'bg-secondary border-border text-foreground hover:bg-accent'
                }`}
              >
                {selectedLayer.type === 'path' ? (
                  <PencilSimple className="w-3 h-3" />
                ) : (
                  <PolygonIcon className="w-3 h-3" />
                )}
                <span>
                  {selectedLayer.type !== 'path'
                    ? 'Convertir en trazado y editar vértices'
                    : vertexEditLayerId === layerId
                      ? 'Terminar edición'
                      : 'Editar vértices'}
                </span>
              </button>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {selectedLayer.type !== 'path'
                  ? 'La forma pasa a ser un trazado con vértices editables.'
                  : 'Arrastra los vértices en el lienzo (o haz doble clic en el trazado). Selecciona varios con un recuadro o Shift + clic, y muévelos con las flechas (Shift: 10 px). Doble clic en un vértice (o "Agregar curva") le añade tiradores Bézier; arrástralos para curvar los lados. Activa el rombo para animar la forma: cada fotograma clave guarda la posición de los vértices.'}
              </p>
            </div>
          </div>
        )}

        {/* Effects */}
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Efectos</span>
            {renderAnimToggle(['blur'], 'desenfoque')}
          </div>
          {renderNumberField('blur', 'Desenfoque', Number((p.blur || 0).toFixed(1)), {
            min: 0,
            max: 200,
            step: 0.5,
            unit: 'px',
            title: 'Desenfoque gaussiano',
          })}
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
              className="w-full bg-secondary border border-border rounded-md px-2 h-7 text-foreground"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <ScrubLabel
                  value={p.fontSize || 32}
                  min={1}
                  onScrubStart={onStartScrub}
                  onChange={(v) => onUpdateLayerProperty(layerId, 'fontSize', v, false)}
                  className="text-muted-foreground block w-fit mb-0.5 text-[10px]"
                >
                  Tamaño
                </ScrubLabel>
                <input
                  type="number"
                  value={p.fontSize || 32}
                  onChange={(e) => onUpdateLayerProperty(selectedLayer.id, 'fontSize', Number(e.target.value))}
                  className="w-full bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
                />
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5 text-[10px]">Grosor</span>
                <Dropdown
                  value={String(p.fontWeight || '700')}
                  options={[
                    { value: '400', label: 'Regular (400)' },
                    { value: '600', label: 'Semibold (600)' },
                    { value: '700', label: 'Bold (700)' },
                    { value: '800', label: 'Black (800)' },
                  ]}
                  onChange={(weight) => onUpdateLayerProperty(selectedLayer.id, 'fontWeight', weight)}
                  align="left"
                  size="sm"
                  className="w-full font-mono"
                  menuClassName="w-full"
                  ariaLabel="Grosor"
                />
              </div>
            </div>
          </div>
        )}

        {/* Fill & Stroke */}
        <div className="pt-2 border-t border-border space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Relleno y Trazo
          </span>

          {/* Fill */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Relleno</span>
              {renderAnimToggle(['fill'], 'relleno')}
            </div>
            {renderPaintRow('fill', '#0084ff', 'Sin relleno')}
          </div>

          {/* Stroke */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Trazo</span>
              {renderAnimToggle(['stroke', 'strokeWidth'], 'trazo')}
            </div>
            {renderPaintRow('stroke', '#1a1d23', 'Sin trazo')}
            <div
              className={`flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7 ${
                isNoColor(p.stroke) ? 'opacity-50' : ''
              }`}
            >
              <ScrubLabel
                value={p.strokeWidth || 0}
                step={0.5}
                min={0}
                max={200}
                onScrubStart={onStartScrub}
                onChange={(v) => onUpdateLayerProperty(fillTargets, 'strokeWidth', v, false)}
                className="text-muted-foreground text-[10px] whitespace-nowrap"
              >
                Grosor
              </ScrubLabel>
              <input
                type="number"
                min="0"
                step="0.5"
                value={Number((p.strokeWidth || 0).toFixed(2))}
                onChange={(e) => onUpdateLayerProperty(fillTargets, 'strokeWidth', Math.max(0, Number(e.target.value)))}
                className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                data-tooltip="Grosor del trazo"
              />
              <span className="text-muted-foreground font-mono text-[10px]">px</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
