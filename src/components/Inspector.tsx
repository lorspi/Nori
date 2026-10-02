import React, { useState, useEffect, useRef } from 'react';
import {
  AlignBottom,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignTop,
  ArrowsInLineHorizontal,
  Columns,
  DropHalf,
  Rows,
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
  Path as PathIcon,
  SelectionSlash,
  ArrowElbowLeftUp,
  FolderSimple,
} from '@phosphor-icons/react';
import { BOOLEAN_LABELS, BOOLEAN_OPERATIONS } from '../utils/booleanGroups';
import { getLayer } from '../utils/layerTree';
import { BOOLEAN_ICONS } from './booleanIcons';
import { t } from '../i18n';
import { ColorSwatch, HexColorInput, isNoColor } from './ColorSwatch';
import { DEFAULT_SHAPE } from '../utils/pathGeometry';
import {
  Layer,
  Project,
  EasingConfig,
  AnimatableProperty,
  BooleanOperation,
  KeyframeRef,
  ShadowEffect,
  StrokeAlign,
} from '../types/animation';
import { AlignMode } from '../utils/alignment';
import { ScrubLabel } from './ScrubLabel';
import { NumberInput } from './NumberInput';
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
  // Removes the blur effect (and its animation) from the layers
  onRemoveBlur: (layerIds: string[]) => void;
  // Vertex editing (basic shapes are converted to a path first)
  vertexEditLayerId: string | null;
  onToggleVertexEdit: (layerId: string) => void;
  onUpdateKeyframesEasing: (refs: KeyframeRef[], easing: EasingConfig, recordUndo?: boolean) => void;
  // Start / length of the layer's animation (the blue bar in the timeline)
  onRetimeLayerAnimation: (layerId: string, timing: { start?: number; length?: number }, recordUndo?: boolean) => void;
  onUpdateProjectSettings: (settings: Partial<Project>, recordUndo?: boolean) => void;
  onDeleteLayer: (layerId: string) => void;
  onDuplicateLayer: (layerId: string) => void;
  // Align / distribute the selected layers (a single layer aligns to the canvas)
  onAlignLayers: (mode: AlignMode) => void;
  // Boolean groups: change the operation, flatten into a path, take the shapes out
  // What the boolean buttons can do with the selection (the same as in the context menu)
  booleanState: { canCombine: boolean; activeOp: BooleanOperation | null; canFlatten: boolean };
  onBooleanOperation: (op: BooleanOperation) => void;
  onFlattenBoolean: (layerId: string) => void;
  onUngroupBoolean: (layerId: string) => void;
  // Puts the selected layers in a plain group
  onGroupLayers: () => void;
  onSelectLayer: (layerId: string) => void;
  currentTime: number;
}

// Values of a newly added shadow
const DEFAULT_SHADOWS: Record<'dropShadow' | 'innerShadow', ShadowEffect> = {
  dropShadow: { enabled: true, color: '#000000', opacity: 0.25, x: 0, y: 4, blur: 8, spread: 0 },
  innerShadow: { enabled: true, color: '#000000', opacity: 0.25, x: 0, y: 2, blur: 4, spread: 0 },
};

const STROKE_ALIGN_OPTIONS: { value: StrokeAlign; label: string }[] = [
  { value: 'inside', label: 'Interior' },
  { value: 'center', label: 'Centro' },
  { value: 'outside', label: 'Exterior' },
];

const ALIGN_BUTTONS: { mode: AlignMode; icon: React.ElementType; label: string }[] = [
  { mode: 'left', icon: AlignLeft, label: 'Alinear a la izquierda' },
  { mode: 'center-x', icon: AlignCenterHorizontal, label: 'Centrar horizontalmente' },
  { mode: 'right', icon: AlignRight, label: 'Alinear a la derecha' },
  { mode: 'top', icon: AlignTop, label: 'Alinear arriba' },
  { mode: 'center-y', icon: AlignCenterVertical, label: 'Centrar verticalmente' },
  { mode: 'bottom', icon: AlignBottom, label: 'Alinear abajo' },
];

const DISTRIBUTE_BUTTONS: { mode: AlignMode; icon: React.ElementType; label: string }[] = [
  { mode: 'distribute-x', icon: Columns, label: 'Distribuir horizontalmente' },
  { mode: 'distribute-y', icon: Rows, label: 'Distribuir verticalmente' },
];

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
      data-tooltip={t('Clic para renombrar la capa')}
      aria-label={t('Nombre de la capa')}
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
  onRemoveBlur,
  vertexEditLayerId,
  onToggleVertexEdit,
  onUpdateKeyframesEasing,
  onRetimeLayerAnimation,
  onUpdateProjectSettings,
  onDeleteLayer,
  onDuplicateLayer,
  onAlignLayers,
  booleanState,
  onBooleanOperation,
  onFlattenBoolean,
  onUngroupBoolean,
  onGroupLayers,
  onSelectLayer,
  currentTime,
}) => {
  const [aspectLocked, setAspectLocked] = useState(true);
  // Layers whose blur was just added: the field stays while its value is 0 (e.g. typing "0,5")
  const [blurAddedIds, setBlurAddedIds] = useState<string[]>([]);
  // Last color of each removed fill / stroke, restored when it's added back
  const lastColors = useRef<Record<string, string>>({});

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
      ? t('{count} fotogramas clave', { count: selection.length })
      : `${t(isAnimatableProperty(primary.track.property) ? PROPERTY_META[primary.track.property].label : primary.track.label)} · ${primary.keyframe.time.toFixed(2)}s`;

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
    // Last keyframe of the whole timeline: the duration that fits every animation
    const animationsEnd = project.layers.reduce((end, layer) => {
      const range = getLayerKeyframeRange(layer);
      return range ? Math.max(end, range.end) : end;
    }, 0);
    const fitDuration = Math.min(60, Math.max(0.5, Number(animationsEnd.toFixed(4))));
    const canFitDuration = animationsEnd > 0 && Math.abs(fitDuration - project.duration) > 1e-6;

    return (
      <aside className="w-72 shrink-0 bg-card border-l border-border p-3 text-xs overflow-y-auto select-none">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-border">
          <Sliders className="w-4 h-4 text-bento-blue" />
          <span className="font-semibold text-foreground">{t('Ajustes del Proyecto')}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-muted-foreground block mb-1">{t('Nombre')}</label>
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
                {t('Ancho (px)')}
              </ScrubLabel>
              <NumberInput
                value={project.width}
                min={1}
                commitOnBlur
                onChange={(v) => onUpdateProjectSettings({ width: Math.round(v) })}
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
                {t('Alto (px)')}
              </ScrubLabel>
              <NumberInput
                value={project.height}
                min={1}
                commitOnBlur
                onChange={(v) => onUpdateProjectSettings({ height: Math.round(v) })}
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
                {t('Duración (s)')}
              </ScrubLabel>
              <div className="flex items-center gap-1.5">
                <NumberInput
                  step={0.5}
                  min={0.5}
                  max={60}
                  commitOnBlur
                  value={project.duration}
                  onChange={(v) => onUpdateProjectSettings({ duration: v })}
                  className="w-full min-w-0 bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
                />
                <button
                  type="button"
                  disabled={!canFitDuration}
                  onClick={() => onUpdateProjectSettings({ duration: fitDuration })}
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                  data-tooltip={t('Ajustar la duración a las animaciones')}
                  aria-label={t('Ajustar la duración a las animaciones')}
                >
                  <ArrowsInLineHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
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
            <label className="text-muted-foreground block mb-1">{t('Fondo del Lienzo')}</label>
            <div className="flex items-center gap-2">
              <ColorSwatch
                value={project.backgroundColor}
                onChange={(color, recordUndo) => onUpdateProjectSettings({ backgroundColor: color }, recordUndo)}
                title={t('Color de fondo')}
              />
              <HexColorInput
                value={project.backgroundColor}
                onChange={(color, recordUndo) => onUpdateProjectSettings({ backgroundColor: color }, recordUndo)}
                emptyValue="transparent"
                placeholder={t('Sin fondo')}
                className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground placeholder:text-muted-foreground"
                ariaLabel={t('Color de fondo')}
              />
              {/* Without a background the canvas is transparent (checkerboard) */}
              <button
                type="button"
                onClick={() => {
                  if (isNoColor(project.backgroundColor)) {
                    onUpdateProjectSettings({ backgroundColor: lastColors.current.background ?? '#ffffff' });
                  } else {
                    lastColors.current.background = project.backgroundColor;
                    onUpdateProjectSettings({ backgroundColor: 'transparent' });
                  }
                }}
                className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                data-tooltip={isNoColor(project.backgroundColor) ? t('Añadir fondo') : t('Quitar fondo (lienzo transparente)')}
              >
                {isNoColor(project.backgroundColor) ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border text-muted-foreground text-[11px] leading-relaxed">
            <p>💡 {t('Selecciona cualquier capa en el lienzo o en la línea de tiempo para inspeccionar y editar sus propiedades y curvas de suavizado.')}</p>
          </div>
        </div>
      </aside>
    );
  }

  // Values shown are the animated values at the current time
  const p = getLayerPropertiesAtTime(selectedLayer, currentTime);
  const keyframeRange = getLayerKeyframeRange(selectedLayer);
  const layerId = selectedLayer.id;
  const isBooleanGroup = selectedLayer.type === 'boolean';
  // Plain group: only its transform, opacity and blur (its layers keep their own style)
  const isPlainGroup = selectedLayer.type === 'group';
  // Several layers selected: the boolean buttons combine them into a new group
  const combinesSelection = selectedLayerIds.length > 1 && selectedLayerIds.includes(layerId);
  // A shape inside a boolean group: it is drawn with the group's fill, stroke, opacity and effects
  const parentGroup = getLayer(project.layers, selectedLayer.parentId);
  const booleanParent = parentGroup?.type === 'boolean' ? parentGroup : undefined;
  // A layer inside a plain group keeps its own style; its position is relative to the group
  const plainParent = parentGroup?.type === 'group' ? parentGroup : undefined;

  // Scale fields are shown in %; with the aspect lock on, both axes change together
  const setScale = (axis: 'scaleX' | 'scaleY', percent: number, recordUndo = true) => {
    const val = percent / 100;
    onUpdateLayerProperties(layerId, aspectLocked ? { scaleX: val, scaleY: val } : { [axis]: val }, recordUndo);
  };

  // Color changes apply to every selected layer when the Inspector's layer is part of the selection
  const fillTargets = selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId];
  const alignCount = fillTargets.length;
  // The blur effect is shown once added (like the shadows): with a value, animated or just added
  const hasBlur =
    selectedLayer.tracks.some((t) => t.property === 'blur') || (p.blur ?? 0) > 0 || blurAddedIds.includes(layerId);

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
        data-tooltip={isAnimated ? t('Desactivar animación de {name}', { name: t(label) }) : t('Activar animación de {name}', { name: t(label) })}
      >
        <Diamond className="w-3 h-3" weight={isAnimated && hasKeyAtCurrent ? 'fill' : isAnimated ? 'bold' : 'regular'} />
      </button>
    );
  };

  // Small % field (fill, stroke and shadow opacity) with a draggable drop icon
  const renderOpacityField = (
    percent: number,
    onChange: (percent: number, recordUndo?: boolean) => void,
    label: string,
    dimmed = false
  ) => (
    <div
      className={`w-16 shrink-0 flex items-center gap-1 bg-secondary border border-border rounded-md px-1.5 h-7 ${dimmed ? 'opacity-50' : ''}`}
      data-tooltip={label}
    >
      <ScrubLabel
        value={percent}
        min={0}
        max={100}
        onScrubStart={onStartScrub}
        onChange={(v) => onChange(v, false)}
        className="text-muted-foreground shrink-0"
      >
        <DropHalf className="w-3 h-3" />
      </ScrubLabel>
      <NumberInput
        min={0}
        max={100}
        value={percent}
        onChange={(v) => onChange(v)}
        className="w-full min-w-0 bg-transparent text-right font-mono text-foreground focus:outline-none"
        aria-label={label}
      />
      <span className="text-muted-foreground font-mono text-[10px]">%</span>
    </div>
  );

  // Drop / inner shadow: header with add / remove, then color, opacity, offset, blur and spread.
  // Changes apply to every selected layer, like colors.
  const renderShadow = (key: 'dropShadow' | 'innerShadow', label: string) => {
    const shadow = p[key];
    const on = !!shadow?.enabled;
    const current = shadow ?? DEFAULT_SHADOWS[key];
    // Full sentences for each shadow, so every language can word them naturally
    const texts =
      key === 'dropShadow'
        ? {
            remove: t('Quitar sombra paralela'),
            add: t('Añadir sombra paralela'),
            color: t('Color de la sombra paralela'),
            opacity: t('Opacidad de la sombra paralela'),
          }
        : {
            remove: t('Quitar sombra interna'),
            add: t('Añadir sombra interna'),
            color: t('Color de la sombra interna'),
            opacity: t('Opacidad de la sombra interna'),
          };
    const update = (changes: Partial<ShadowEffect>, recordUndo = true) =>
      onUpdateLayerProperties(fillTargets, { [key]: { ...current, enabled: true, ...changes } }, recordUndo);
    const field = (prop: 'x' | 'y' | 'blur' | 'spread', fieldLabel: string, title: string, min?: number) => (
      <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7" data-tooltip={title}>
        <ScrubLabel
          value={current[prop]}
          step={0.5}
          min={min}
          onScrubStart={onStartScrub}
          onChange={(v) => update({ [prop]: Number(v.toFixed(1)) }, false)}
          className="text-muted-foreground text-[10px] whitespace-nowrap"
        >
          {fieldLabel}
        </ScrubLabel>
        <NumberInput
          min={min}
          step={0.5}
          value={Number(current[prop].toFixed(1))}
          onChange={(v) => update({ [prop]: min !== undefined ? Math.max(min, v) : v })}
          className="w-full min-w-0 bg-transparent text-right font-mono text-foreground focus:outline-none"
          aria-label={title}
        />
        <span className="text-muted-foreground font-mono text-[10px]">px</span>
      </div>
    );
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-medium">{t(label)}</span>
          <button
            type="button"
            onClick={() => onUpdateLayerProperties(fillTargets, { [key]: { ...current, enabled: !on } })}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground"
            data-tooltip={on ? texts.remove : texts.add}
          >
            {on ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          </button>
        </div>
        {on && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <ColorSwatch
                value={current.color}
                onChange={(color, recordUndo) => update({ color }, recordUndo)}
                title={texts.color}
              />
              <HexColorInput
                value={current.color}
                onChange={(color, recordUndo) => update({ color }, recordUndo)}
                className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
                ariaLabel={texts.color}
              />
              {renderOpacityField(
                Math.round(current.opacity * 100),
                (percent, recordUndo) => update({ opacity: Math.max(0, Math.min(100, percent)) / 100 }, recordUndo),
                texts.opacity
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {field('x', 'X', t('Desplazamiento horizontal'))}
              {field('y', 'Y', t('Desplazamiento vertical'))}
              {field('blur', t('Desenfoque'), t('Desenfoque de la sombra'), 0)}
              {field(
                'spread',
                t('Extensión'),
                key === 'dropShadow'
                  ? t('Agranda la sombra (o la encoge, con valores negativos)')
                  : t('Lleva la sombra más hacia dentro (o la acerca al borde, con valores negativos)')
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Color row: swatch, hex value and a button to remove or add the color back.
  // Changes apply to every selected layer when this layer is part of the selection.
  const renderPaintRow = (prop: 'fill' | 'stroke', defaultColor: string, emptyLabel: string) => {
    const value = p[prop];
    const opacityProp = prop === 'fill' ? 'fillOpacity' : 'strokeOpacity';
    const opacityLabel = prop === 'fill' ? t('Opacidad del relleno') : t('Opacidad del trazo');
    const setOpacity = (percent: number, recordUndo = true) =>
      onUpdateLayerProperty(fillTargets, opacityProp, Math.max(0, Math.min(100, percent)) / 100, recordUndo);
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
        <ColorSwatch value={value} onChange={setColor} title={prop === 'fill' ? t('Color de relleno') : t('Color del trazo')} />
        <HexColorInput
          value={value}
          onChange={setColor}
          emptyValue="transparent"
          placeholder={emptyLabel}
          className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground placeholder:text-muted-foreground"
          ariaLabel={prop === 'fill' ? t('Color de relleno') : t('Color del trazo')}
        />
        {renderOpacityField(Math.round((p[opacityProp] ?? 1) * 100), setOpacity, opacityLabel, none)}
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
          data-tooltip={none ? (prop === 'fill' ? t('Añadir relleno') : t('Añadir trazo')) : prop === 'fill' ? t('Quitar relleno') : t('Quitar trazo')}
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
        <NumberInput
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(v) => onUpdateLayerProperty(layerId, prop, toStored(v))}
          className="w-full min-w-0 bg-transparent text-right font-mono text-foreground focus:outline-none"
          aria-label={label}
        />
        {unit && <span className="text-muted-foreground font-mono text-[10px]">{unit}</span>}
      </div>
    );
  };

  // Start / Duración of the layer animation; Duración can't change when every keyframe is at one instant
  const renderTimingField = (field: 'start' | 'length', label: string, title: string) => {
    const length = keyframeRange ? keyframeRange.end - keyframeRange.start : 0;
    const shown = keyframeRange ? Number((field === 'start' ? keyframeRange.start : length).toFixed(2)) : 0;
    const disabled = !keyframeRange || (field === 'length' && length <= 0);
    const max = field === 'start' ? project.duration - length : project.duration - (keyframeRange?.start ?? 0);
    const min = field === 'start' ? 0 : 1 / project.fps;
    const apply = (v: number, recordUndo = true) => onRetimeLayerAnimation(layerId, { [field]: v }, recordUndo);
    return (
      <div
        className={`flex items-center gap-1 bg-secondary border border-border rounded-md px-1.5 h-7 ${disabled ? 'opacity-60' : ''}`}
        data-tooltip={keyframeRange ? title : t('La capa no tiene fotogramas clave')}
      >
        <Clock className="w-3 h-3 shrink-0 text-bento-blue" />
        {disabled ? (
          <span className="text-muted-foreground whitespace-nowrap">{label}</span>
        ) : (
          <ScrubLabel
            value={shown}
            step={0.01}
            min={min}
            max={max}
            onScrubStart={onStartScrub}
            onChange={(v) => apply(v, false)}
            className="text-muted-foreground whitespace-nowrap"
          >
            {label}
          </ScrubLabel>
        )}
        {keyframeRange ? (
          <NumberInput
            step={0.1}
            min={min}
            max={max}
            value={shown}
            disabled={disabled}
            // Applied on Enter / blur: a "0" typed on the way to "0,5" would squash the keyframes
            commitOnBlur
            onChange={(v) => apply(v)}
            className="w-full min-w-0 bg-transparent text-right font-mono text-foreground focus:outline-none disabled:cursor-default"
            aria-label={label}
          />
        ) : (
          <span className="flex-1 text-right font-mono text-foreground">—</span>
        )}
        {keyframeRange && <span className="text-muted-foreground font-mono text-[10px]">s</span>}
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
              data-tooltip={t('Duplicar capa')}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDeleteLayer(selectedLayer.id)}
              className="p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-accent"
              data-tooltip={t('Eliminar capa')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Align & distribute: to the canvas with one layer, to the selection with several */}
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            {alignCount > 1 ? t('Alinear {count} capas', { count: alignCount }) : t('Alinear al lienzo')}
          </span>
          <div className="flex items-center gap-1">
            {ALIGN_BUTTONS.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => onAlignLayers(mode)}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                data-tooltip={alignCount > 1 ? t('{action} de la selección', { action: t(label) }) : t('{action} del lienzo', { action: t(label) })}
                aria-label={t(label)}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
            <span className="w-px h-5 bg-border mx-0.5" />
            {DISTRIBUTE_BUTTONS.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                type="button"
                disabled={alignCount < 3}
                onClick={() => onAlignLayers(mode)}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                data-tooltip={t('{action}: mismo espacio entre las capas (selecciona 3 o más)', { action: t(label) })}
                aria-label={t(label)}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Boolean operation: combines the selected shapes, or changes the selected group's operation */}
        {(booleanState.activeOp || (combinesSelection && booleanState.canCombine)) && (
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              {combinesSelection ? t('Combinar {count} capas', { count: selectedLayerIds.length }) : t('Operación booleana')}
            </span>
            <div className="flex items-center bg-secondary border border-border rounded-md p-0.5 gap-0.5">
              {BOOLEAN_OPERATIONS.map((op) => {
                const Icon = BOOLEAN_ICONS[op];
                const active = booleanState.activeOp === op;
                return (
                  <button
                    key={op}
                    type="button"
                    onClick={() => onBooleanOperation(op)}
                    className={`flex-1 h-7 flex items-center justify-center rounded transition-colors ${
                      active ? 'bg-card text-bento-blue shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`}
                    data-tooltip={`${t(BOOLEAN_LABELS[op].name)}: ${t(BOOLEAN_LABELS[op].description).toLowerCase()}`}
                    data-shortcut={BOOLEAN_LABELS[op].shortcut}
                    aria-label={t(BOOLEAN_LABELS[op].name)}
                    aria-pressed={active}
                  >
                    <Icon className="w-4 h-4" weight={active ? 'fill' : 'regular'} />
                  </button>
                );
              })}
            </div>
            {combinesSelection && (
              <p className="text-[10px] text-muted-foreground leading-snug mt-1.5">
                {t('Combina las formas seleccionadas en un grupo booleano. Las formas siguen siendo editables y animables dentro del grupo.')}
              </p>
            )}
            {/* Boolean group: flatten and ungroup */}
            {isBooleanGroup && !combinesSelection && (
              <>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => onFlattenBoolean(layerId)}
                    className="flex items-center justify-center gap-1.5 px-2 h-7 rounded-md border bg-secondary border-border text-[11px] font-medium text-foreground hover:bg-accent"
                    data-tooltip={t('Convierte el grupo en un solo trazado con su forma en el fotograma actual')}
                    data-shortcut="Ctrl+E"
                  >
                    <PathIcon className="w-3 h-3" />
                    <span>{t('Aplanar')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUngroupBoolean(layerId)}
                    className="flex items-center justify-center gap-1.5 px-2 h-7 rounded-md border bg-secondary border-border text-[11px] font-medium text-foreground hover:bg-accent"
                    data-tooltip={t('Saca las formas del grupo, donde se ven ahora, y elimina el grupo')}
                  >
                    <SelectionSlash className="w-3 h-3" />
                    <span>{t('Desagrupar')}</span>
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug mt-1.5">
                  {t('Las formas del grupo siguen siendo editables y animables: haz doble clic en el lienzo para seleccionar una, o elígela en la línea del tiempo. El relleno, el trazo y los efectos son los del grupo.')}
                </p>
              </>
            )}
          </div>
        )}

        {/* Plain group: take its layers out */}
        {isPlainGroup && !combinesSelection && (
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              {t('Grupo')}
            </span>
            <button
              type="button"
              onClick={() => onUngroupBoolean(layerId)}
              className="w-full flex items-center justify-center gap-1.5 px-2 h-7 rounded-md border bg-secondary border-border text-[11px] font-medium text-foreground hover:bg-accent"
              data-tooltip={t('Saca las capas del grupo, donde se ven ahora, y elimina el grupo')}
              data-shortcut="Ctrl+Shift+Alt+G"
            >
              <SelectionSlash className="w-3 h-3" />
              <span>{t('Desagrupar')}</span>
            </button>
            <p className="text-[10px] text-muted-foreground leading-snug mt-1.5">
              {t('El grupo mueve, gira, escala y desvanece todas sus capas a la vez. Cada capa conserva su estilo y su animación: haz doble clic en el lienzo para seleccionar una, o elígela en la línea del tiempo.')}
            </p>
          </div>
        )}

        {/* Several layers: put them in a plain group */}
        {combinesSelection && (
          <div>
            <button
              type="button"
              onClick={() => onGroupLayers()}
              className="w-full flex items-center justify-center gap-1.5 px-2 h-7 rounded-md border bg-secondary border-border text-[11px] font-medium text-foreground hover:bg-accent"
              data-tooltip={t('Pone las capas seleccionadas en un grupo para animarlas juntas')}
              data-shortcut="Ctrl+Alt+G"
            >
              <FolderSimple className="w-3 h-3" />
              <span>{t('Agrupar {count} capas', { count: selectedLayerIds.length })}</span>
            </button>
          </div>
        )}

        {/* A layer inside a plain group */}
        {plainParent && (
          <div className="bg-secondary border border-border rounded-md p-2 text-[11px] text-muted-foreground leading-snug space-y-1.5">
            <p>
              {t('Esta capa está dentro de')} <span className="text-foreground font-medium">{plainParent.name}</span>.{' '}
              {t('Su posición, rotación y escala son relativas al grupo, que también puede animarse.')}
            </p>
            <button
              type="button"
              onClick={() => onSelectLayer(plainParent.id)}
              className="flex items-center gap-1 text-bento-blue hover:underline"
              data-tooltip={t('Seleccionar el grupo')}
              data-shortcut="Esc"
            >
              <ArrowElbowLeftUp className="w-3 h-3" />
              <span>{t('Seleccionar el grupo')}</span>
            </button>
          </div>
        )}

        {/* A shape inside a boolean group */}
        {booleanParent && (
          <div className="bg-secondary border border-border rounded-md p-2 text-[11px] text-muted-foreground leading-snug space-y-1.5">
            <p>
              {t('Esta forma está dentro de')} <span className="text-foreground font-medium">{booleanParent.name}</span>.{' '}
              {t('Su posición es relativa al grupo y se dibuja con el relleno, el trazo y los efectos del grupo.')}
            </p>
            <button
              type="button"
              onClick={() => onSelectLayer(booleanParent.id)}
              className="flex items-center gap-1 text-bento-blue hover:underline"
              data-tooltip={t('Seleccionar el grupo')}
              data-shortcut="Esc"
            >
              <ArrowElbowLeftUp className="w-3 h-3" />
              <span>{t('Seleccionar el grupo')}</span>
            </button>
          </div>
        )}

        {/* Timing Section: start and length of the layer bar (editable, retimes its keyframes) */}
        <div>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            {t('Animación')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {renderTimingField('start', t('Inicio##tiempo'), t('Momento en que empieza la animación de la capa'))}
            {renderTimingField('length', t('Duración'), t('Duración de la animación de la capa'))}
          </div>
        </div>

        {/* Value Curve Section  */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {t('Curva de Suavizado')}
            </span>
            <span className="text-[10px] font-mono text-bento-blue">
              {selectionLabel}
            </span>
          </div>

          {!primary ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed bg-secondary border border-border rounded-md p-2">
              {selectedLayer.tracks.length === 0 ? (
                <>
                  {t('Activa la animación de un parámetro con el icono')}{' '}
                  <Diamond className="inline w-2.5 h-2.5 -mt-0.5" /> {t('para crear fotogramas clave y editar su curva.')}
                </>
              ) : (
                <>
                  {t('Selecciona uno o varios fotogramas clave en la línea del tiempo (Shift/Ctrl + clic o arrastrando un recuadro) para editar su curva de suavizado.')}
                </>
              )}
            </p>
          ) : (
          <>
          {hasMixedEasing && (
            <p className="text-[10px] text-bento-orange mb-1.5">
              {t('Los fotogramas seleccionados tienen curvas distintas; al editar se aplicará esta a todos.')}
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
            {t('Transformación')}
          </span>

          {/* Position X / Y */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">{t('Posición')}</span>
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
                <NumberInput
                  value={Math.round(p.x)}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'x', v)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip={t('Posición X')}
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
                <NumberInput
                  value={Math.round(p.y)}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'y', v)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip={t('Posición Y')}
                />
              </div>
            </div>
          </div>

          {/* Anchor Point (Punto de Anclaje) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                <Crosshair className="w-3 h-3 text-bento-blue" />
                <span>{t('Punto de Anclaje')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateLayerProperties(layerId, { anchorX: 0, anchorY: 0 })}
                  className="text-[9px] text-bento-blue hover:text-bento-blue/80 font-mono hover:underline"
                  data-tooltip={t('Centrar punto de anclaje (0, 0)')}
                >
                  {t('Centrar (0, 0)')}
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
                <NumberInput
                  value={Math.round(p.anchorX || 0)}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'anchorX', v)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip={t('Punto de anclaje X (horizontal)')}
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
                <NumberInput
                  value={Math.round(p.anchorY || 0)}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'anchorY', v)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                  data-tooltip={t('Punto de anclaje Y (vertical)')}
                />
              </div>
            </div>
          </div>

          {/* Scale X / Y & Link */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">{t('Escala')}</span>
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
                <NumberInput
                  value={Math.round((p.scaleX ?? 1) * 100)}
                  onChange={(v) => setScale('scaleX', v)}
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
                data-tooltip={t('Vincular proporción')}
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
                <NumberInput
                  value={Math.round((p.scaleY ?? 1) * 100)}
                  onChange={(v) => setScale('scaleY', v)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                />
                <span className="text-muted-foreground font-mono text-[10px]">%</span>
              </div>
            </div>
          </div>

          {/* Rotation & Opacity (a shape inside a boolean group takes the group's opacity) */}
          <div className={`grid gap-2 ${booleanParent ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">{t('Rotación')}</span>
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
                <NumberInput
                  value={Math.round(p.rotation || 0)}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'rotation', v)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                />
                <span className="text-muted-foreground font-mono text-[10px]">°</span>
              </div>
            </div>
            {!booleanParent && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">{t('Opacidad')}</span>
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
                <NumberInput
                  min={0}
                  max={100}
                  value={Math.round((p.opacity ?? 1) * 100)}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'opacity', v / 100)}
                  className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                />
                <span className="text-muted-foreground font-mono text-[10px]">%</span>
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Shape geometry & vertices (a boolean group's shape comes from the shapes inside it) */}
        {selectedLayer.type !== 'text' && !isBooleanGroup && !isPlainGroup && (
          <div className="pt-2 border-t border-border space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('Forma')}
            </span>

            {selectedLayer.type === 'polygon' &&
              renderNumberField('sides', t('Lados'), p.sides ?? DEFAULT_SHAPE.sides, { min: 3, max: 12, step: 0.1, round: true })}
            {selectedLayer.type === 'star' && (
              <div className="grid grid-cols-2 gap-2">
                {renderNumberField('points', t('Puntas'), p.points ?? DEFAULT_SHAPE.points, { min: 3, max: 12, step: 0.1, round: true })}
                {renderNumberField('innerRadius', t('Radio interior'), Math.round((p.innerRadius ?? DEFAULT_SHAPE.innerRadius) * 100), {
                  min: 5,
                  max: 100,
                  unit: '%',
                  toValue: (v) => v / 100,
                  title: t('Radio interior respecto al exterior'),
                })}
              </div>
            )}

            {['rect', 'polygon', 'star'].includes(selectedLayer.type) && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-medium">{t('Esquinas redondeadas')}</span>
                  {renderAnimToggle(['radius'], 'radio de esquinas')}
                </div>
                {renderNumberField('radius', t('Radio'), Math.round(p.radius || 0), { min: 0, max: 1000, unit: 'px' })}
              </div>
            )}

            {/* Vertex editing / shape animation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">{t('Vértices')}</span>
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
                    ? t('Convertir en trazado y editar vértices')
                    : vertexEditLayerId === layerId
                      ? t('Terminar edición')
                      : t('Editar vértices')}
                </span>
              </button>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {selectedLayer.type !== 'path'
                  ? t('La forma pasa a ser un trazado con vértices editables.')
                  : t('Arrastra los vértices en el lienzo (o haz doble clic en el trazado). Selecciona varios con un recuadro o Shift + clic, y muévelos con las flechas (Shift: 10 px). Doble clic en un vértice (o "Agregar curva") le añade tiradores Bézier; arrástralos para curvar los lados. Activa el rombo para animar la forma: cada fotograma clave guarda la posición de los vértices.')}
              </p>
            </div>
          </div>
        )}

        {/* Effects (a shape inside a boolean group uses the group's) */}
        {!booleanParent && (
        <div className="pt-2 border-t border-border space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">{t('Efectos')}</span>
          {/* Blur: added and removed like the shadows */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">{t('Desenfoque')}</span>
              <div className="flex items-center gap-1">
                {hasBlur && renderAnimToggle(['blur'], 'desenfoque')}
                <button
                  type="button"
                  onClick={() => {
                    if (hasBlur) {
                      setBlurAddedIds((ids) => ids.filter((id) => !fillTargets.includes(id)));
                      onRemoveBlur(fillTargets);
                    } else {
                      setBlurAddedIds((ids) => [...ids, ...fillTargets]);
                      onUpdateLayerProperty(fillTargets, 'blur', 4);
                    }
                  }}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                  data-tooltip={hasBlur ? t('Quitar desenfoque') : t('Añadir desenfoque')}
                >
                  {hasBlur ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {hasBlur &&
              renderNumberField('blur', t('Radio'), Number((p.blur || 0).toFixed(1)), {
                min: 0,
                max: 200,
                step: 0.5,
                unit: 'px',
                title: t('Desenfoque gaussiano'),
              })}
          </div>
          {!isPlainGroup && renderShadow('dropShadow', 'Sombra paralela')}
          {selectedLayer.type !== 'text' && !isPlainGroup && renderShadow('innerShadow', 'Sombra interna')}
        </div>
        )}

        {/* Text Layer specific attributes */}
        {selectedLayer.type === 'text' && (
          <div className="pt-2 border-t border-border space-y-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
              {t('Contenido de Texto')}
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
                  {t('Tamaño')}
                </ScrubLabel>
                <NumberInput
                  value={p.fontSize || 32}
                  onChange={(v) => onUpdateLayerProperty(selectedLayer.id, 'fontSize', v)}
                  className="w-full bg-secondary border border-border rounded-md px-2 h-7 font-mono text-foreground"
                />
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5 text-[10px]">{t('Grosor')}</span>
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
                  ariaLabel={t('Grosor')}
                />
              </div>
            </div>
          </div>
        )}

        {/* Fill & Stroke (a shape inside a boolean group uses the group's; a plain group has none) */}
        {!booleanParent && !isPlainGroup && (
        <div className="pt-2 border-t border-border space-y-2">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
            {t('Relleno y Trazo')}
          </span>

          {/* Fill */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">{t('Relleno')}</span>
              {renderAnimToggle(['fill', 'fillOpacity'], 'relleno')}
            </div>
            {renderPaintRow('fill', '#0084ff', t('Sin relleno'))}
          </div>

          {/* Stroke */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">{t('Trazo')}</span>
              {renderAnimToggle(['stroke', 'strokeOpacity', 'strokeWidth'], 'trazo')}
            </div>
            {renderPaintRow('stroke', '#1a1d23', t('Sin trazo'))}
            {/* Width and position only make sense with a stroke */}
            {!isNoColor(p.stroke) && (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 bg-secondary border border-border rounded-md px-2 h-7">
              <ScrubLabel
                value={p.strokeWidth || 0}
                step={0.5}
                min={0}
                max={200}
                onScrubStart={onStartScrub}
                onChange={(v) => onUpdateLayerProperty(fillTargets, 'strokeWidth', v, false)}
                className="text-muted-foreground text-[10px] whitespace-nowrap"
              >
                {t('Grosor')}
              </ScrubLabel>
              <NumberInput
                min={0}
                step={0.5}
                value={Number((p.strokeWidth || 0).toFixed(2))}
                onChange={(v) => onUpdateLayerProperty(fillTargets, 'strokeWidth', Math.max(0, v))}
                className="w-full bg-transparent text-right font-mono text-foreground focus:outline-none"
                data-tooltip={t('Grosor del trazo')}
              />
              <span className="text-muted-foreground font-mono text-[10px]">px</span>
              </div>
              <Dropdown
                value={selectedLayer.type === 'text' ? 'center' : (p.strokeAlign ?? 'center')}
                options={STROKE_ALIGN_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
                onChange={(strokeAlign) => onUpdateLayerProperties(fillTargets, { strokeAlign })}
                align="left"
                size="sm"
                className="w-full"
                menuClassName="w-full"
                /* A stroke 0 px wide has nothing to position */
                disabled={selectedLayer.type === 'text' || !(p.strokeWidth > 0)}
                title={t('Posición del trazo respecto al borde de la forma')}
                ariaLabel={t('Posición del trazo')}
              />
            </div>
            )}
          </div>
        </div>
        )}
      </div>
    </aside>
  );
};
