import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  CaretRight as ChevronRight,
  CaretLeft as ChevronLeft,
  CaretDown as ChevronDown,
  Eye,
  EyeSlash as EyeOff,
  Lock,
  LockOpen as Unlock,
  Diamond,
} from '@phosphor-icons/react';
import { Project, AnimatableProperty, KeyframeRef, TimelineClipboard } from '../types/animation';
import {
  PROPERTY_META,
  frameTolerance,
  getLayerKeyframeRange,
  getLayerKeyframeRefs,
  getLayerKeyframeTimes,
  isAnimatableProperty,
  resolveKeyframeRefs,
  snapToFrame,
} from '../utils/animationTracks';
import { ContextMenu, ContextMenuItem } from './ContextMenu';

interface TimelineProps {
  project: Project;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  onSelectLayer: (layerId: string | null) => void;
  onSelectLayers: (layerIds: string[], primaryId: string | null) => void;
  selectedKeyframes: KeyframeRef[];
  onSelectKeyframes: (refs: KeyframeRef[]) => void;
  onToggleLayerVisibility: (layerId: string) => void;
  onToggleLayerLock: (layerId: string) => void;
  onToggleLayerExpanded: (layerId: string) => void;
  onAddKeyframe: (layerId: string, property: AnimatableProperty, time: number) => void;
  onDeleteKeyframes: (refs: KeyframeRef[]) => void;
  onMoveKeyframes: (base: (KeyframeRef & { time: number })[], delta: number) => void;
  onSetKeyframeTimes: (items: (KeyframeRef & { time: number })[]) => void;
  onStartKeyframeDrag?: () => void;
  clipboardKind: TimelineClipboard['kind'] | null;
  onCopyKeyframes: (refs: KeyframeRef[]) => void;
  onCopyLayerAnimation: (layerId: string) => void;
  onPaste: (layerId: string) => void;
  onSeekKeyframe: (direction: -1 | 1) => void;
  onOpenAnimationPresets: (layerId: string) => void;
}

// Resizable timeline height (remembered per browser)
const HEIGHT_STORAGE_KEY = 'nori-timeline-height';
const DEFAULT_HEIGHT = 256;
const MIN_HEIGHT = 140;
const clampHeight = (h: number) =>
  Math.round(Math.max(MIN_HEIGHT, Math.min(Math.max(MIN_HEIGHT, window.innerHeight - 220), h)));

const readStoredHeight = () => {
  try {
    const stored = Number(localStorage.getItem(HEIGHT_STORAGE_KEY));
    return stored > 0 ? clampHeight(stored) : DEFAULT_HEIGHT;
  } catch {
    return DEFAULT_HEIGHT;
  }
};

const refKey = (r: KeyframeRef) => `${r.layerId}|${r.property}|${r.keyframeId}`;

// Keyframe drag (one or several keyframes, or a whole layer bar). Times are snapshotted at drag start.
interface KeyframeDrag {
  startClientX: number;
  base: (KeyframeRef & { time: number })[];
  minTime: number;
  maxTime: number;
  moved: boolean;
  // Plain click on an already-selected keyframe collapses the selection to it (if not dragged)
  collapseTo: KeyframeRef | null;
  // Plain click on a bar of a multi-selection collapses the selection to that layer (if not dragged)
  collapseToLayer?: string;
  // Dragging an end of a layer bar: that end (edge) moves and the other one (anchor) stays,
  // spreading the keyframes in between proportionally. With several bars, the anchor is the
  // far end of the whole group and extreme is the group's end on the dragged side.
  stretch?: { anchor: number; edge: number; extreme: number };
}

// Box selection in client coordinates
interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
  initial: KeyframeRef[];
}

interface MenuState {
  x: number;
  y: number;
  layerId: string;
  kind: 'keyframe' | 'bar' | 'row';
  refs: KeyframeRef[];
}

export const Timeline: React.FC<TimelineProps> = ({
  project,
  currentTime,
  isPlaying,
  onTogglePlay,
  onSeek,
  selectedLayerId,
  selectedLayerIds,
  onSelectLayer,
  onSelectLayers,
  selectedKeyframes,
  onSelectKeyframes,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onToggleLayerExpanded,
  onAddKeyframe,
  onDeleteKeyframes,
  onMoveKeyframes,
  onSetKeyframeTimes,
  onStartKeyframeDrag,
  clipboardKind,
  onCopyKeyframes,
  onCopyLayerAnimation,
  onPaste,
  onSeekKeyframe,
  onOpenAnimationPresets,
}) => {
  const timelineRootRef = useRef<HTMLElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const tracksContentRef = useRef<HTMLDivElement>(null);
  const layersContainerRef = useRef<HTMLDivElement>(null);
  const rulerContainerRef = useRef<HTMLDivElement>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(140);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const keyframeDragRef = useRef<KeyframeDrag | null>(null);
  const [isDraggingKeyframes, setIsDraggingKeyframes] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [height, setHeight] = useState(readStoredHeight);
  const [isResizing, setIsResizing] = useState(false);

  // Drag the top edge to change the timeline height
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;
    let latest = startHeight;
    setIsResizing(true);

    const handleMove = (ev: MouseEvent) => {
      latest = clampHeight(startHeight + (startY - ev.clientY));
      setHeight(latest);
    };
    const handleUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      try {
        localStorage.setItem(HEIGHT_STORAGE_KEY, String(latest));
      } catch {
        // Storage unavailable: the height just isn't remembered
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  // Keep the height valid when the window shrinks
  useEffect(() => {
    const handleResize = () => setHeight((h) => clampHeight(h));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const duration = project.duration;
  const totalWidth = duration * pixelsPerSecond;
  const selectedKeys = new Set(selectedKeyframes.map(refKey));

  // Frame stepping
  const stepFrame = (forward: boolean) => {
    const frameDuration = 1 / project.fps;
    const nextTime = forward
      ? Math.min(duration, currentTime + frameDuration)
      : Math.max(0, currentTime - frameDuration);
    onSeek(Number(nextTime.toFixed(3)));
  };

  // Time conversion
  const xToTime = (x: number) => {
    return Math.max(0, Math.min(duration, x / pixelsPerSecond));
  };

  const timeToX = (t: number) => {
    return t * pixelsPerSecond;
  };

  // Synchronized scroll handlers: the right container provides the single vertical scrollbar and horizontal scrollbar
  const handleTracksScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (layersContainerRef.current) {
      layersContainerRef.current.scrollTop = scrollTop;
    }
    if (rulerContainerRef.current) {
      rulerContainerRef.current.scrollLeft = scrollLeft;
    }
  };

  // When scrolling mouse wheel over the left layers list, delegate vertical delta to tracks container
  const handleLayersWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (tracksContainerRef.current) {
      tracksContainerRef.current.scrollTop += e.deltaY;
    }
  };

  // Playhead scrubber mouse events
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if (!rulerContainerRef.current || !tracksContainerRef.current) return;
    const rect = rulerContainerRef.current.getBoundingClientRect();
    const scrollLeft = tracksContainerRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const t = xToTime(clickX);
    onSeek(Number(t.toFixed(3)));
    setIsScrubbing(true);
  };

  // Begin dragging a set of keyframes
  const startKeyframeDrag = (clientX: number, refs: KeyframeRef[], collapseTo: KeyframeRef | null) => {
    const base = resolveKeyframeRefs(project, refs).map(({ ref, keyframe }) => ({ ...ref, time: keyframe.time }));
    if (base.length === 0) return;
    keyframeDragRef.current = {
      startClientX: clientX,
      base,
      minTime: Math.min(...base.map((b) => b.time)),
      maxTime: Math.max(...base.map((b) => b.time)),
      moved: false,
      collapseTo,
    };
    setIsDraggingKeyframes(true);
  };

  const handleKeyframeMouseDown = (e: React.MouseEvent, ref: KeyframeRef) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const isSelected = selectedKeys.has(refKey(ref));
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Toggle in the current selection
      onSelectKeyframes(
        isSelected ? selectedKeyframes.filter((r) => refKey(r) !== refKey(ref)) : [...selectedKeyframes, ref]
      );
      return;
    }

    if (isSelected) {
      startKeyframeDrag(e.clientX, selectedKeyframes, selectedKeyframes.length > 1 ? ref : null);
    } else {
      onSelectKeyframes([ref]);
      startKeyframeDrag(e.clientX, [ref], null);
    }
  };

  // Every keyframe of the given layers (the blue bars of a selection)
  const getLayersKeyframeRefs = (layerIds: string[]) =>
    project.layers.filter((l) => layerIds.includes(l.id)).flatMap((l) => getLayerKeyframeRefs(l));

  // Selected layers whose bar would move together with the given one ([layerId] if it isn't selected)
  const getBarGroup = (layerId: string) =>
    selectedLayerIds.length > 1 && selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId];

  // Selects layers together with all their keyframes (the primary layer goes last so it wins)
  const selectBars = (layerIds: string[], primaryId: string | null) => {
    onSelectKeyframes(getLayersKeyframeRefs(layerIds));
    onSelectLayers(layerIds, primaryId);
  };

  // Clicking a bar selects it; Shift / Ctrl + click adds it to (or removes it from) the selection.
  // Dragging a selected bar moves every selected bar.
  const handleLayerBarMouseDown = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const isSelected = selectedLayerIds.includes(layerId);
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (isSelected) {
        const ids = selectedLayerIds.filter((id) => id !== layerId);
        selectBars(ids, ids.includes(selectedLayerId ?? '') ? selectedLayerId : (ids[0] ?? null));
        return;
      }
      const ids = [...selectedLayerIds, layerId];
      selectBars(ids, layerId);
      startKeyframeDrag(e.clientX, getLayersKeyframeRefs(ids), null);
      return;
    }

    const group = getBarGroup(layerId);
    selectBars(group, layerId);
    startKeyframeDrag(e.clientX, getLayersKeyframeRefs(group), null);
    if (keyframeDragRef.current && group.length > 1) keyframeDragRef.current.collapseToLayer = layerId;
  };

  // An end of the layer bar: stretches or shrinks the layer's animation from the other end.
  // With several bars selected, all of them stretch together from the far end of the group.
  const handleBarEdgeMouseDown = (e: React.MouseEvent, layerId: string, side: 'start' | 'end') => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const layer = project.layers.find((l) => l.id === layerId);
    const range = layer ? getLayerKeyframeRange(layer) : null;
    if (!layer || !range || range.end - range.start <= 0) return;
    const group = getBarGroup(layerId);
    const ranges = project.layers
      .filter((l) => group.includes(l.id))
      .map((l) => getLayerKeyframeRange(l))
      .filter((r): r is NonNullable<typeof r> => !!r);
    const groupStart = Math.min(...ranges.map((r) => r.start));
    const groupEnd = Math.max(...ranges.map((r) => r.end));
    selectBars(group, layerId);
    startKeyframeDrag(e.clientX, getLayersKeyframeRefs(group), null);
    if (keyframeDragRef.current) {
      keyframeDragRef.current.stretch =
        side === 'end'
          ? { anchor: groupStart, edge: range.end, extreme: groupEnd }
          : { anchor: groupEnd, edge: range.start, extreme: groupStart };
    }
  };

  // Empty area of the tracks: start a box selection
  const handleTracksMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    setMarquee({
      x0: e.clientX,
      y0: e.clientY,
      x1: e.clientX,
      y1: e.clientY,
      additive,
      initial: additive ? selectedKeyframes : [],
    });
    if (!additive) onSelectKeyframes([]);
  };

  // Keyframes whose diamond centre lies inside the box selection
  const getKeyframesInMarquee = (m: Marquee): KeyframeRef[] => {
    const container = tracksContainerRef.current;
    if (!container) return [];
    const left = Math.min(m.x0, m.x1);
    const right = Math.max(m.x0, m.x1);
    const top = Math.min(m.y0, m.y1);
    const bottom = Math.max(m.y0, m.y1);
    const hits: KeyframeRef[] = [];
    container.querySelectorAll<HTMLElement>('[data-kf-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
        hits.push({
          layerId: el.dataset.layerId!,
          property: el.dataset.property!,
          keyframeId: el.dataset.kfId!,
        });
      }
    });
    return hits;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing && rulerContainerRef.current && tracksContainerRef.current) {
        const rect = rulerContainerRef.current.getBoundingClientRect();
        const scrollLeft = tracksContainerRef.current.scrollLeft;
        const clickX = e.clientX - rect.left + scrollLeft;
        const t = xToTime(clickX);
        onSeek(Number(t.toFixed(3)));
      }

      const drag = keyframeDragRef.current;
      if (isDraggingKeyframes && drag?.stretch) {
        const { anchor, edge, extreme } = drag.stretch;
        const rawEdge = edge + (e.clientX - drag.startClientX) / pixelsPerSecond;
        // The moving end stays inside the timeline and at least one frame away from the other
        const frame = 1 / project.fps;
        let nextEdge = Math.max(0, Math.min(duration, snapToFrame(rawEdge, project.fps)));
        nextEdge = edge > anchor ? Math.max(anchor + frame, nextEdge) : Math.min(anchor - frame, nextEdge);
        if (!drag.moved && Math.abs(nextEdge - edge) > 1e-6) {
          drag.moved = true;
          onStartKeyframeDrag?.(); // One undo step for the whole drag
        }
        if (drag.moved) {
          // The group's far end on the dragged side doesn't leave the timeline either
          const bound = edge > anchor ? duration : 0;
          const factor = Math.min((nextEdge - anchor) / (edge - anchor), (bound - anchor) / (extreme - anchor));
          onSetKeyframeTimes(drag.base.map((b) => ({ ...b, time: anchor + (b.time - anchor) * factor })));
        }
      } else if (isDraggingKeyframes && drag) {
        const rawDelta = (e.clientX - drag.startClientX) / pixelsPerSecond;
        const delta = Math.max(
          -drag.minTime,
          Math.min(duration - drag.maxTime, snapToFrame(rawDelta, project.fps))
        );
        if (!drag.moved && delta !== 0) {
          drag.moved = true;
          onStartKeyframeDrag?.(); // One undo step for the whole drag
        }
        if (drag.moved) onMoveKeyframes(drag.base, delta);
      }

      if (marquee) {
        const next = { ...marquee, x1: e.clientX, y1: e.clientY };
        setMarquee(next);
        const hits = getKeyframesInMarquee(next);
        const initialKeys = new Set(next.initial.map(refKey));
        onSelectKeyframes([...next.initial, ...hits.filter((h) => !initialKeys.has(refKey(h)))]);
      }
    };

    const handleMouseUp = () => {
      const drag = keyframeDragRef.current;
      if (drag && !drag.moved && drag.collapseTo) {
        onSelectKeyframes([drag.collapseTo]);
      }
      if (drag && !drag.moved && drag.collapseToLayer) {
        selectBars([drag.collapseToLayer], drag.collapseToLayer);
      }
      keyframeDragRef.current = null;
      setIsScrubbing(false);
      setIsDraggingKeyframes(false);
      setMarquee(null);
    };

    if (isScrubbing || isDraggingKeyframes || marquee) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  });

  // Ctrl + Wheel to zoom timeline while mouse is inside
  useEffect(() => {
    const el = timelineRootRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const zoomDelta = -e.deltaY;
        const factor = zoomDelta > 0 ? 1.15 : 0.87;

        setPixelsPerSecond((prev) => {
          const next = Math.min(600, Math.max(30, Math.round(prev * factor)));
          // Keep mouse position anchored in timeline tracks view
          if (tracksContainerRef.current) {
            const rect = tracksContainerRef.current.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            if (clientX >= 0 && clientX <= rect.width) {
              const currentScrollLeft = tracksContainerRef.current.scrollLeft;
              const contentX = clientX + currentScrollLeft;
              const newContentX = contentX * (next / prev);
              tracksContainerRef.current.scrollLeft = newContentX - clientX;
            }
          }
          return next;
        });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // ── Context menu ───────────────────────────────────────────────────────────
  const openMenu = (e: React.MouseEvent, layerId: string, kind: MenuState['kind'], refs: KeyframeRef[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, layerId, kind, refs });
  };

  const handleKeyframeContextMenu = (e: React.MouseEvent, ref: KeyframeRef) => {
    // Right-clicking outside the current selection selects only that keyframe
    const refs = selectedKeys.has(refKey(ref)) ? selectedKeyframes : [ref];
    onSelectKeyframes(refs);
    openMenu(e, ref.layerId, 'keyframe', refs);
  };

  const handleBarContextMenu = (e: React.MouseEvent, layerId: string) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    // Right-clicking a bar of a multi-selection keeps the selection (to paste on all of them)
    const group = getBarGroup(layerId);
    const refs = getLayersKeyframeRefs(group);
    selectBars(group, layerId);
    openMenu(e, layerId, 'bar', refs);
  };

  const handleRowContextMenu = (e: React.MouseEvent, layerId: string) => {
    if (!selectedLayerIds.includes(layerId)) onSelectLayer(layerId);
    openMenu(e, layerId, 'row', []);
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  const buildMenuItems = (m: MenuState): ContextMenuItem[] => {
    const layer = project.layers.find((l) => l.id === m.layerId);
    const hasAnimation = !!layer && layer.tracks.length > 0;
    const count = m.refs.length;
    const pasteCount = getBarGroup(m.layerId).length;
    const items: ContextMenuItem[] = [
      { label: 'Animaciones predeterminadas…', onSelect: () => onOpenAnimationPresets(m.layerId) },
      'separator',
    ];

    if (m.kind === 'keyframe') {
      items.push({
        label: count === 1 ? 'Copiar fotograma clave' : `Copiar ${count} fotogramas clave`,
        shortcut: 'Ctrl+C',
        onSelect: () => onCopyKeyframes(m.refs),
      });
    }
    if (m.kind !== 'keyframe') {
      items.push({
        label: 'Copiar animación de la capa',
        disabled: !hasAnimation,
        onSelect: () => onCopyLayerAnimation(m.layerId),
      });
    }
    if (m.kind === 'bar') {
      items.push({
        label: `Copiar ${count} fotogramas clave`,
        shortcut: 'Ctrl+C',
        onSelect: () => onCopyKeyframes(m.refs),
      });
    }

    items.push({
      label:
        clipboardKind === 'layer'
          ? pasteCount > 1
            ? `Pegar animación en ${pasteCount} capas`
            : 'Pegar animación en esta capa'
          : pasteCount > 1
            ? `Pegar fotogramas clave en ${pasteCount} capas`
            : 'Pegar fotogramas clave en el tiempo actual',
      shortcut: 'Ctrl+V',
      disabled: !clipboardKind,
      onSelect: () => onPaste(m.layerId),
    });

    if (count > 0) {
      items.push('separator', {
        label: count === 1 ? 'Eliminar fotograma clave' : `Eliminar ${count} fotogramas clave`,
        shortcut: 'Supr',
        danger: true,
        onSelect: () => onDeleteKeyframes(m.refs),
      });
    }
    return items;
  };

  // Generate ruler markers
  const renderRulerTicks = () => {
    const ticks = [];
    const step = 0.5; // Every 0.5 seconds
    const count = Math.ceil(duration / step);

    for (let i = 0; i <= count; i++) {
      const t = i * step;
      if (t > duration) break;
      const x = timeToX(t);
      const isWhole = Number.isInteger(t);

      ticks.push(
        <div
          key={t}
          style={{ left: `${x}px` }}
          className="absolute top-0 bottom-0 pointer-events-none"
        >
          <div
            className={`w-[1px] ${
              isWhole ? 'h-3 bg-muted-foreground/60' : 'h-2 bg-border'
            }`}
          />
          {isWhole && (
            <span className="absolute top-3 -translate-x-1/2 text-[10px] font-mono text-muted-foreground select-none">
              {t}s
            </span>
          )}
        </div>
      );
    }
    return ticks;
  };

  // Box selection rectangle, relative to the tracks content
  const renderMarquee = () => {
    if (!marquee || !tracksContentRef.current) return null;
    const origin = tracksContentRef.current.getBoundingClientRect();
    return (
      <div
        style={{
          left: Math.min(marquee.x0, marquee.x1) - origin.left,
          top: Math.min(marquee.y0, marquee.y1) - origin.top,
          width: Math.abs(marquee.x1 - marquee.x0),
          height: Math.abs(marquee.y1 - marquee.y0),
        }}
        className="absolute z-40 border border-bento-blue bg-bento-blue/10 rounded-sm pointer-events-none"
      />
    );
  };

  return (
    <footer
      ref={timelineRootRef}
      style={{ height }}
      className="relative shrink-0 border-t border-border bg-card flex flex-col select-none text-xs"
    >
      {/* Resize handle on the top edge */}
      <div
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={() => {
          setHeight(DEFAULT_HEIGHT);
          try {
            localStorage.setItem(HEIGHT_STORAGE_KEY, String(DEFAULT_HEIGHT));
          } catch {
            // ignore
          }
        }}
        data-tooltip={"Arrastra para cambiar la altura de la línea del tiempo\nDoble clic para restablecerla"}
        className={`absolute -top-1 left-0 right-0 h-2 z-40 cursor-row-resize transition-colors ${
          isResizing ? 'bg-bento-blue/50' : 'hover:bg-bento-blue/30'
        }`}
      />

      {/* Top Playback Toolbar */}
      <div className="h-9 px-3 border-b border-border bg-card flex items-center justify-between">
        {/* Playback Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSeek(0)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-tooltip="Ir al inicio"
            data-shortcut="Shift+F"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSeekKeyframe(-1)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center"
            data-tooltip="Ir al fotograma clave anterior"
            data-shortcut="Ctrl+F"
          >
            <ChevronLeft weight="bold" className="w-2.5 h-2.5 -mr-0.5" />
            <Diamond className="w-3 h-3" />
          </button>
          <button
            onClick={() => stepFrame(false)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-tooltip="Fotograma anterior"
            data-shortcut="F"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onTogglePlay}
            className="p-1.5 rounded-md bg-bento-blue text-white hover:bg-bento-blue/90 transition-colors shadow-sm"
            data-tooltip={isPlaying ? 'Pausar' : 'Reproducir'}
            data-shortcut="Espacio"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play weight="fill" className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => stepFrame(true)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-tooltip="Fotograma siguiente"
            data-shortcut="G"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onSeekKeyframe(1)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center"
            data-tooltip="Ir al fotograma clave siguiente"
            data-shortcut="Ctrl+G"
          >
            <Diamond className="w-3 h-3" />
            <ChevronRight weight="bold" className="w-2.5 h-2.5 -ml-0.5" />
          </button>
          <button
            onClick={() => onSeek(duration)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            data-tooltip="Ir al final"
            data-shortcut="Shift+G"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </button>

          {/* Time indicator badge  */}
          <div className="ml-3 px-2 py-0.5 rounded-md bg-bento-blue/15 border border-bento-blue/30 text-bento-blue font-mono font-medium text-xs">
            {currentTime.toFixed(2)} s
          </div>

          {selectedKeyframes.length > 1 && (
            <span className="ml-2 text-[10px] text-muted-foreground">
              {selectedKeyframes.length} fotogramas clave seleccionados
            </span>
          )}
        </div>

        {/* Timeline Zoom Slider with Ctrl+wheel hint */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="text-[10px]">Zoom</span>
          <input
            type="range"
            min="30"
            max="600"
            value={pixelsPerSecond}
            onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
            className="w-20 accent-bento-blue h-1 bg-muted rounded-md cursor-pointer"
            data-tooltip="Zoom de la línea del tiempo. También con la rueda del ratón y"
            data-shortcut="Ctrl"
          />
          <span className="text-[9px] font-mono text-muted-foreground w-8 text-right">
            {Math.round((pixelsPerSecond / 140) * 100)}%
          </span>
        </div>
      </div>

      {/* Timeline Header Row: Layer List Header + Time Ruler Bar */}
      <div className="h-7 shrink-0 border-b border-border bg-card flex items-center">
        {/* Left Column Header */}
        <div className="w-64 shrink-0 h-full border-r border-border bg-card px-3 flex items-center justify-between text-muted-foreground text-[10px] uppercase font-semibold">
          <span>Capas y Propiedades</span>
          <span>{project.layers.length}</span>
        </div>

        {/* Right Column Time Ruler (Horizontal scroll synchronized with tracks) */}
        <div
          ref={rulerContainerRef}
          onMouseDown={handleRulerMouseDown}
          className="flex-1 h-full overflow-hidden relative cursor-pointer"
        >
          <div
            style={{ width: `${Math.max(800, totalWidth + 100)}px` }}
            className="h-full relative"
          >
            <div
              style={{ left: `${totalWidth}px` }}
              className="absolute top-0 bottom-0 right-0 bg-muted/40 pointer-events-none timeline-past-end"
            />
            {renderRulerTicks()}
            {/* Top Scrubber Diamond Head */}
            <div
              style={{ left: `${timeToX(currentTime)}px` }}
              className="absolute top-0 bottom-0 pointer-events-none z-30"
            >
              <div className="w-3 h-3 bg-bento-blue rotate-45 -translate-x-[5px] translate-y-1 shadow-md shadow-bento-blue/40" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Timeline Viewport: Unified Vertical Scroll */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Column: Layer Hierarchy Tree (No independent vertical scroll; synchronized strictly with tracks) */}
        <div
          ref={layersContainerRef}
          onWheel={handleLayersWheel}
          className="w-64 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden select-none"
        >
          {/* Layers List */}
          <div className="divide-y divide-border">
            {project.layers.map((layer) => {
              const isSelected = selectedLayerIds.includes(layer.id);

              return (
                <div key={layer.id} className={isSelected ? 'bg-bento-blue-light' : ''}>
                  {/* Layer Main Row (Shift / Ctrl + click adds or removes it from the selection) */}
                  <div
                    onClick={(e) => {
                      if (e.shiftKey || e.ctrlKey || e.metaKey) {
                        const ids = isSelected
                          ? selectedLayerIds.filter((id) => id !== layer.id)
                          : [...selectedLayerIds, layer.id];
                        onSelectLayers(ids, isSelected ? (ids[0] ?? null) : layer.id);
                      } else {
                        onSelectLayer(layer.id);
                      }
                    }}
                    onContextMenu={(e) => handleRowContextMenu(e, layer.id)}
                    className={`h-8 px-2 flex items-center justify-between cursor-pointer hover:bg-accent transition-colors box-border ${
                      isSelected ? 'text-bento-blue font-medium' : 'text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerExpanded(layer.id);
                        }}
                        disabled={layer.tracks.length === 0}
                        className={`p-0.5 text-muted-foreground hover:text-foreground ${
                          layer.tracks.length === 0 ? 'invisible' : ''
                        }`}
                        data-tooltip="Mostrar parámetros animados"
                      >
                        {layer.expanded ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                      </button>

                      {/* Layer Visibility Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerVisibility(layer.id);
                        }}
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        {layer.visible ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3 text-muted-foreground/50" />
                        )}
                      </button>

                      {/* Layer Lock Toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLayerLock(layer.id);
                        }}
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        {layer.locked ? (
                          <Lock className="w-3 h-3 text-bento-orange" />
                        ) : (
                          <Unlock className="w-3 h-3 opacity-30 hover:opacity-100" />
                        )}
                      </button>

                      <span className="truncate text-xs">{layer.name}</span>
                    </div>
                  </div>

                  {/* Expanded animated parameters (only properties with animation enabled) */}
                  {layer.expanded && (
                    <div className="bg-secondary/40">
                      {layer.tracks.map((track) => {
                        const frameTime = snapToFrame(currentTime, project.fps);
                        const hasKeyframeAtCurrent = track.keyframes.some(
                          (k) => Math.abs(k.time - frameTime) < frameTolerance(project.fps)
                        );
                        const label = isAnimatableProperty(track.property)
                          ? PROPERTY_META[track.property].label
                          : track.label;

                        return (
                          <div
                            key={track.property}
                            onContextMenu={(e) => handleRowContextMenu(e, layer.id)}
                            className="h-7 pl-8 pr-2 flex items-center justify-between text-[11px] text-muted-foreground hover:bg-accent border-b border-border box-border"
                          >
                            <span className="truncate">{label}</span>

                            <div className="flex items-center gap-1.5">
                              {/* Add / Toggle Keyframe Diamond Button */}
                              <button
                                onClick={() =>
                                  onAddKeyframe(layer.id, track.property, currentTime)
                                }
                                className={`p-0.5 transition-colors ${
                                  hasKeyframeAtCurrent
                                    ? 'text-bento-blue'
                                    : 'text-muted-foreground/50 hover:text-foreground'
                                }`}
                                data-tooltip={
                                  hasKeyframeAtCurrent
                                    ? 'Quitar fotograma clave en el tiempo actual'
                                    : 'Añadir fotograma clave en el tiempo actual'
                                }
                              >
                                <Diamond
                                  className="w-2.5 h-2.5"
                                  weight={hasKeyframeAtCurrent ? 'fill' : 'regular'}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Keyframe Tracks (Single Vertical Scroll for the Timeline + Horizontal Scroll for Tracks) */}
        <div
          ref={tracksContainerRef}
          onScroll={handleTracksScroll}
          className="flex-1 overflow-x-auto overflow-y-auto relative bg-background"
        >
          <div
            ref={tracksContentRef}
            onMouseDown={handleTracksMouseDown}
            style={{ width: `${Math.max(800, totalWidth + 100)}px` }}
            className="min-h-full relative"
          >
            {/* Vertical Blue Scrubber Line across tracks */}
            <div
              style={{ left: `${timeToX(currentTime)}px` }}
              className="absolute top-0 bottom-0 w-[2px] bg-bento-blue z-30 pointer-events-none"
            />

            {renderMarquee()}

            {/* Past the end of the project: no track, so it doesn't look like keyframes fit there */}
            <div
              style={{ left: `${totalWidth}px` }}
              className="absolute top-0 bottom-0 right-0 border-l border-border bg-muted/40 pointer-events-none timeline-past-end"
            />

            {/* Tracks Content Area (ends where the project ends) */}
            <div style={{ width: `${totalWidth}px` }} className="divide-y divide-border border-b border-border">
              {project.layers.map((layer) => {
                const isSelected = selectedLayerIds.includes(layer.id);
                const range = getLayerKeyframeRange(layer);
                const barStartX = range ? timeToX(range.start) : 0;
                const barWidth = range ? timeToX(range.end - range.start) : 0;
                const barPadding = 7; // Leaves room around the first/last keyframe diamonds

                return (
                  <div key={layer.id} className={isSelected ? 'bg-bento-blue-light/40' : ''}>
                    {/* Layer bar: spans the layer's keyframes and moves all of them at once */}
                    <div
                      className="h-8 relative flex items-center box-border"
                      onContextMenu={(e) => handleRowContextMenu(e, layer.id)}
                    >
                      {range && (
                        <div
                          style={{
                            left: `${barStartX - barPadding}px`,
                            width: `${barWidth + barPadding * 2}px`,
                          }}
                          className={`group h-4.5 rounded-full absolute flex items-center cursor-grab active:cursor-grabbing transition-colors shadow-sm ${
                            isSelected
                              ? 'bg-bento-blue text-white'
                              : 'bg-bento-blue/40 hover:bg-bento-blue/60 text-foreground'
                          }`}
                          onMouseDown={(e) => handleLayerBarMouseDown(e, layer.id)}
                          onContextMenu={(e) => handleBarContextMenu(e, layer.id)}
                          data-tooltip={"Arrastra para mover todos los fotogramas clave de la capa\nArrastra un extremo para estirar o encoger la animación\nShift o Ctrl + clic para seleccionar varias barras\nClic derecho para copiar o pegar"}
                        >
                          {/* Ends: stretch the animation, spreading the keyframes proportionally */}
                          {range.end > range.start &&
                            (['start', 'end'] as const).map((side) => (
                              <div
                                key={side}
                                onMouseDown={(e) => handleBarEdgeMouseDown(e, layer.id, side)}
                                className={`absolute top-0 bottom-0 ${side === 'start' ? 'left-0' : 'right-0'} w-1.75 cursor-ew-resize flex items-center justify-center`}
                                data-tooltip={
                                  side === 'start'
                                    ? 'Arrastra para estirar la animación desde el principio'
                                    : 'Arrastra para estirar la animación desde el final'
                                }
                              >
                                <div
                                  className={`w-0.5 h-2.5 rounded-full opacity-0 group-hover:opacity-70 transition-opacity ${
                                    isSelected ? 'bg-white' : 'bg-bento-blue'
                                  }`}
                                />
                              </div>
                            ))}
                          {/* Keyframe summary marks */}
                          {getLayerKeyframeTimes(layer).map((t) => (
                            <div
                              key={t}
                              style={{ left: `${timeToX(t) - barStartX + barPadding}px` }}
                              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rotate-45 pointer-events-none ${
                                isSelected ? 'bg-white' : 'bg-bento-blue'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Subtracks for properties & keyframe diamonds */}
                    {layer.expanded &&
                      layer.tracks.map((track) => (
                        <div
                          key={track.property}
                          onContextMenu={(e) => handleRowContextMenu(e, layer.id)}
                          className="h-7 relative flex items-center bg-secondary/30 border-b border-border box-border"
                        >
                          {/* Interpolation connecting line between keyframes */}
                          {track.keyframes.length > 1 && (
                            <div
                              style={{
                                left: `${timeToX(track.keyframes[0].time)}px`,
                                width: `${timeToX(
                                  track.keyframes[track.keyframes.length - 1].time -
                                    track.keyframes[0].time
                                )}px`,
                              }}
                              className="h-[2px] bg-bento-blue/30 absolute top-1/2 -translate-y-1/2 pointer-events-none"
                            />
                          )}

                          {/* Keyframe Diamonds */}
                          {track.keyframes.map((kf) => {
                            const ref: KeyframeRef = {
                              layerId: layer.id,
                              property: track.property,
                              keyframeId: kf.id,
                            };
                            const isKfSelected = selectedKeys.has(refKey(ref));

                            return (
                              <div
                                key={kf.id}
                                data-kf-id={kf.id}
                                data-layer-id={layer.id}
                                data-property={track.property}
                                style={{
                                  left: `${timeToX(kf.time)}px`,
                                }}
                                onMouseDown={(e) => handleKeyframeMouseDown(e, ref)}
                                onContextMenu={(e) => handleKeyframeContextMenu(e, ref)}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteKeyframes([ref]);
                                }}
                                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rotate-45 cursor-ew-resize transition-transform hover:scale-125 z-10 ${
                                  isKfSelected
                                    ? 'bg-white border-2 border-bento-blue shadow-md shadow-bento-blue/50'
                                    : 'bg-bento-blue border border-white'
                                }`}
                                data-tooltip={`Tiempo: ${kf.time.toFixed(2)}s | Valor: ${String(kf.value).length > 32 ? `${String(kf.value).slice(0, 32)}…` : kf.value}\nArrastrar para mover · Shift o Ctrl + clic para selección múltiple · Doble clic para borrar`}
                              />
                            );
                          })}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={buildMenuItems(menu)} onClose={closeMenu} />}
    </footer>
  );
};
