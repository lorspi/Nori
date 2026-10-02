import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Project,
  Layer,
  LayerType,
  AnimatableProperty,
  BooleanOperation,
  EasingConfig,
  PropertyTrack,
  KeyframeRef,
  TimelineClipboard,
} from './types/animation';
import { saveProject } from './utils/projectStorage';
import { downloadProjectJson } from './utils/projectFiles';
import { TopBar, ToolMode, ShapeType } from './components/TopBar';
import { DEFAULT_SHAPE, getShapePathData, normalizePathData } from './utils/pathGeometry';
import { CanvasView } from './components/CanvasView';
import { Inspector } from './components/Inspector';
import { isNoColor } from './components/ColorSwatch';
import { Timeline } from './components/Timeline';
import { ExportModal } from './components/ExportModal';
import { AnimationPresetsModal } from './components/AnimationPresetsModal';
import { ContextMenu, ContextMenuItem } from './components/ContextMenu';
import { importSvg } from './utils/svgImporter';
import {
  ClipboardContent,
  ClipboardProbe,
  LayersClipboard,
  classifyClipboardEvent,
  createLayersClipboard,
  instantiateClipboardLayers,
  placeSvgLayers,
  readClipboard,
  serializeClipboard,
  writeClipboardText,
} from './utils/clipboard';
import { AnimationPreset, applyAnimationPreset, getPresetDistance, planPresetSpans } from './utils/animationPresets';
import { getLayerPropertiesAtTime } from './utils/interpolator';
import { AlignMode, computeAlignMoves } from './utils/alignment';
import {
  createKeyframe,
  createTrack,
  frameTolerance,
  getAdjacentKeyframeTime,
  getLayerKeyframeRange,
  isSameKeyframeRef,
  PAIRED_PROPERTIES,
  resolveKeyframeRefs,
  snapToFrame,
  sortKeyframes,
} from './utils/animationTracks';
import { useUI, ToastType } from './lib/ui';
import { loadBooleanEngine } from './utils/booleanOps';
import { t } from './i18n';
import {
  BOOLEAN_LABELS,
  cloneLayerTree,
  createBooleanGroup,
  deleteLayerTrees,
  flattenBooleanGroup,
  getBooleanCandidates,
  getLayersForClipboard,
  LayerDropPosition,
  moveLayer,
  setBooleanOperation,
  ungroupGroup,
  createLayerGroup,
} from './utils/booleanGroups';
import {
  applyAffine,
  getLayer,
  getParentWorldMatrix,
  invertAffine,
  isLayerLocked,
  isLayerShown,
  fitLayersToDuration,
  normalizeLayerTree,
  repairLayerEnds,
  topLevelIds,
} from './utils/layerTree';

// Input types where Space types nothing, so it can still toggle playback
const NON_TEXT_INPUT_TYPES = new Set(['number', 'range', 'color']);

// Alt + Shift + key -> boolean operation (as in Figma)
const BOOLEAN_SHORTCUTS: Record<string, BooleanOperation> = {
  KeyU: 'union',
  KeyS: 'subtract',
  KeyI: 'intersect',
  KeyX: 'exclude',
};

// Arrow key -> canvas direction
const ARROW_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface EditorProps {
  /** Stored project to edit; every change is saved back to the browser */
  initialProject: Project;
  /** Start playing right away (the example project) */
  autoplay?: boolean;
  onGoHome: () => void;
  /** Folder that holds the project, shown in the breadcrumb of the top bar */
  folder: { id: string; name: string } | null;
  onOpenFolder: (id: string) => void;
}

export default function Editor({ initialProject, autoplay = false, onGoHome, folder, onOpenFolder }: EditorProps) {
  // Projects saved by earlier versions may have layers cut at an older, shorter duration
  const [project, setProject] = useState<Project>(() => ({
    ...initialProject,
    layers: repairLayerEnds(initialProject.layers, initialProject.duration),
  }));
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(autoplay);
  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  // Path layer whose vertices are being edited on the canvas
  const [vertexEditLayerId, setVertexEditLayerId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [showCheckerboard, setShowCheckerboard] = useState<boolean>(false);

  // Undo / Redo History Stacks
  const [history, setHistory] = useState<Project[]>([]);
  const [future, setFuture] = useState<Project[]>([]);

  // Toast notifications (shared suite UIProvider)
  const { toast } = useUI();

  // Layer selection: selectedLayerIds holds every selected layer (canvas multi-selection);
  // selectedLayerId is the primary one, shown in the Inspector
  const [selectedLayerId, setPrimaryLayerId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const setSelectedLayerId = (layerId: string | null) => {
    setPrimaryLayerId(layerId);
    setSelectedLayerIds(layerId ? [layerId] : []);
  };
  const handleSelectLayers = useCallback((layerIds: string[], primaryId: string | null) => {
    setSelectedLayerIds(layerIds);
    setPrimaryLayerId(primaryId);
  }, []);
  // Keyframe multi-selection (timeline) and in-app timeline clipboard
  const [selectedKeyframes, setSelectedKeyframes] = useState<KeyframeRef[]>([]);
  const [clipboard, setClipboard] = useState<TimelineClipboard | null>(null);

  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  // Layers that receive a predefined animation (open modal)
  const [presetTargetIds, setPresetTargetIds] = useState<string[] | null>(null);

  // Copied layers (also written to the system clipboard as Nori JSON)
  const [layerClipboard, setLayerClipboard] = useState<LayersClipboard | null>(null);
  const lastCopiedRef = useRef<'layers' | 'timeline' | null>(null);
  // The last copy could not reach the system clipboard: pasting uses the in-app copy
  const clipboardWriteFailedRef = useRef(false);
  // Ctrl + Shift + V pastes without animation; the paste event doesn't carry the modifiers
  const pasteWithoutAnimationRef = useRef(false);
  const pasteFallbackTimerRef = useRef<number | null>(null);
  // Where the last click happened: Ctrl + C copies keyframes after clicking the timeline
  const lastClickRegionRef = useRef<'timeline' | 'other'>('other');
  // Canvas context menu; probe is the clipboard check ('checking' while it runs)
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; probe: ClipboardProbe | 'checking' } | null>(null);
  const canvasMenuTokenRef = useRef(0);

  const lastFrameTimeRef = useRef<number | null>(null);
  // Space: pressing it pauses, releasing it plays; holding it to drag the canvas does neither.
  // paused: this press paused playback · held: the canvas was dragged during the press
  const spacePressRef = useRef<{ held: boolean; paused: boolean } | null>(null);
  const projectRef = useRef<Project>(project);
  projectRef.current = project;

  const showToast = (msg: string, type: ToastType = 'info') => {
    toast(msg, type);
  };

  // Save every change to the browser's localStorage (debounced)
  const storageWarnedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!saveProject(project) && !storageWarnedRef.current) {
        storageWarnedRef.current = true;
        showToast(t('No se pudo guardar el proyecto en el navegador (espacio insuficiente o almacenamiento bloqueado)'), 'warning');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project]);

  // Flush pending changes when the page is closed or the editor goes back to Inicio
  useEffect(() => {
    const flush = () => saveProject(projectRef.current);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, []);

  // Browser tab title with the project name
  useEffect(() => {
    document.title = `${project.title} — Nori`;
    return () => {
      document.title = 'Nori';
    };
  }, [project.title]);

  // Helper to record history before mutating project (prevents duplicate snapshots)
  const recordHistory = useCallback((current: Project) => {
    setHistory((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        if (JSON.stringify(last) === JSON.stringify(current)) {
          return prev;
        }
      }
      return [...prev.slice(-30), JSON.parse(JSON.stringify(current))];
    });
    setFuture([]); // Clear redo future on new action
  }, []);

  // Undo. Undoing is silent; trying to undo with an empty history notifies once per session.
  const emptyHistoryNotifiedRef = useRef(false);
  const handleUndo = useCallback(() => {
    if (history.length === 0) {
      if (!emptyHistoryNotifiedRef.current) {
        emptyHistoryNotifiedRef.current = true;
        showToast(t('No hay más acciones para deshacer'));
      }
      return;
    }
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [JSON.parse(JSON.stringify(project)), ...prev]);
    setProject(previous);
  }, [history, project]);

  // Redo
  const handleRedo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setHistory((prev) => [...prev, JSON.parse(JSON.stringify(project))]);
    setProject(next);
  }, [future, project]);

  // Prevent browser page zoom globally on Ctrl+Wheel
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleGlobalWheel);
  }, []);

  // Playback Loop
  useEffect(() => {
    let animId: number;

    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }
      const deltaSec = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      setCurrentTime((prev) => {
        let next = prev + deltaSec;
        if (next >= project.duration) {
          next = 0; // Loop
        }
        return next;
      });

      animId = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      lastFrameTimeRef.current = null;
      animId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, project.duration]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Editor shortcuts are paused while a Nori dialog is open
      if (presetTargetIds) return;

      // Undo / Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Download the project as JSON (also while typing, instead of the browser's "Save page")
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!e.repeat) handleDownloadJson();
        return;
      }

      // Ignore if user is typing in an input. Space still toggles playback from fields
      // where it types nothing (numbers, sliders…), which keep the focus after editing.
      const target = e.target as HTMLElement;
      const isTextField =
        ['SELECT', 'TEXTAREA'].includes(target.tagName) ||
        (target instanceof HTMLInputElement &&
          !NON_TEXT_INPUT_TYPES.has(target.type) &&
          // Numeric fields (NumberInput): Space types nothing in them either
          target.dataset.numeric === undefined);
      if (isTextField || (target.tagName === 'INPUT' && e.code !== 'Space')) {
        return;
      }

      // Boolean operations: Alt + Shift + U / S / I / X (as in Figma); Ctrl + E flattens the group
      if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && BOOLEAN_SHORTCUTS[e.code]) {
        e.preventDefault();
        if (!e.repeat) handleBooleanOperation(BOOLEAN_SHORTCUTS[e.code]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyE') {
        e.preventDefault();
        if (!e.repeat) handleFlattenBoolean();
        return;
      }
      // Groups: Ctrl + Alt + G groups the selection, adding Shift ungroups (Ctrl + G alone goes to
      // the next keyframe)
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.code === 'KeyG') {
        e.preventDefault();
        if (!e.repeat) {
          if (e.shiftKey) handleUngroupBoolean();
          else handleGroupLayers();
        }
        return;
      }

      // Copy keyframes (after clicking the timeline, or with no layer selected) or layers
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const copyKeyframes =
          selectedKeyframes.length > 0 && (lastClickRegionRef.current === 'timeline' || selectedLayerIds.length === 0);
        if (copyKeyframes) {
          e.preventDefault();
          handleCopyKeyframes(selectedKeyframes);
        } else if (selectedLayerIds.length > 0) {
          e.preventDefault();
          handleCopyLayers(selectedLayerIds);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (selectedLayerIds.length > 0) {
          e.preventDefault();
          handleCutLayers(selectedLayerIds);
        }
        return;
      }

      // Paste is handled by the paste event, which reads the system clipboard without
      // permissions. If the browser doesn't fire it (no editable target), the in-app copy is used.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        pasteWithoutAnimationRef.current = e.shiftKey;
        if (pasteFallbackTimerRef.current) clearTimeout(pasteFallbackTimerRef.current);
        const withAnimation = !e.shiftKey;
        pasteFallbackTimerRef.current = window.setTimeout(() => {
          pasteFallbackTimerRef.current = null;
          pasteFromInAppClipboard(withAnimation);
        }, 150);
        return;
      }

      // Timeline navigation: F goes back, G goes forward.
      // Alone: one frame · Ctrl: previous / next keyframe · Shift: start / end
      if ((e.code === 'KeyF' || e.code === 'KeyG') && !e.altKey) {
        const direction = e.code === 'KeyG' ? 1 : -1;
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handleSeekKeyframe(direction);
        } else if (e.shiftKey) {
          e.preventDefault();
          handleSeek(direction === 1 ? project.duration : 0);
        } else {
          e.preventDefault();
          handleStepFrame(direction);
        }
        return;
      }

      // Arrow keys move the selected layers 1 px (Shift: 10 px)
      const arrow = ARROW_DIRECTIONS[e.code];
      if (arrow) {
        if (selectedLayerIds.length > 0 && !vertexEditLayerId && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          // Holding the key down is a single undo step
          handleNudgeLayers(selectedLayerIds, arrow[0] * step, arrow[1] * step, !e.repeat);
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        // Auto-repeat is ignored: its delay depends on the OS
        if (!e.repeat || !spacePressRef.current) {
          // Pressing Space pauses right away; playback starts on release (see the keyup
          // handler), so holding Space to pan the canvas doesn't start it
          spacePressRef.current = { held: false, paused: isPlaying };
          if (isPlaying) setIsPlaying(false);
        }
      } else if (e.code === 'KeyV') {
        setActiveTool('select');
      } else if (e.code === 'KeyH') {
        setActiveTool('hand');
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedKeyframes.length > 0) {
          handleDeleteKeyframes(selectedKeyframes);
        } else if (selectedLayerIds.length > 0) {
          handleDeleteLayers(selectedLayerIds);
        }
      } else if (e.code === 'Escape' || (e.code === 'Enter' && vertexEditLayerId)) {
        // Leaving vertex editing keeps the layer selected
        if (vertexEditLayerId) {
          setVertexEditLayerId(null);
          return;
        }
        // Inside a boolean group, Escape selects the group (as in Figma)
        const selected = selectedLayerIds.map((id) => getLayer(project.layers, id));
        const parentId = selected[0]?.parentId;
        if (e.code === 'Escape' && parentId && selected.every((l) => l?.parentId === parentId)) {
          setSelectedLayerId(parentId);
          setSelectedKeyframes([]);
          return;
        }
        setSelectedLayerId(null);
        setSelectedKeyframes([]);
      }
    };

    // Space released: start playback, unless the press paused it or was used to pan the canvas
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const press = spacePressRef.current;
      spacePressRef.current = null;
      if (!press) return;
      e.preventDefault();
      if (!press.held && !press.paused) setIsPlaying(true);
    };

    // Clicking while Space is down (to drag the canvas) means it is being held to pan:
    // playback goes on as it was
    const handlePointerDown = () => {
      const press = spacePressRef.current;
      if (!press || press.held) return;
      press.held = true;
      if (press.paused) setIsPlaying(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  });

  // Paste (Ctrl + V): Nori layers or keyframes, or SVG code as new layers
  useEffect(() => {
    const handlePasteEvent = (e: ClipboardEvent) => {
      if (pasteFallbackTimerRef.current) {
        clearTimeout(pasteFallbackTimerRef.current);
        pasteFallbackTimerRef.current = null;
      }
      if (presetTargetIds || isExportOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)) return;
      e.preventDefault();
      const withAnimation = !pasteWithoutAnimationRef.current;
      pasteWithoutAnimationRef.current = false;
      pasteClipboardContent(classifyClipboardEvent(e), withAnimation, true);
    };
    window.addEventListener('paste', handlePasteEvent);
    return () => window.removeEventListener('paste', handlePasteEvent);
  });

  // Remember whether the last click was on the timeline (decides what Ctrl + C copies)
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      lastClickRegionRef.current = (e.target as Element | null)?.closest?.('footer') ? 'timeline' : 'other';
    };
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => window.removeEventListener('mousedown', handleMouseDown, true);
  }, []);

  // Start an interactive drag action (records pre-drag snapshot once for complete undo)
  const handleStartDrag = useCallback(() => {
    recordHistory(projectRef.current);
  }, [recordHistory]);

  // Layer Properties Update (Supports atomic multi-property updates, several layers at once and undo control)
  const handleUpdateLayerProperties = useCallback((
    layerId: string | string[],
    properties: Partial<Layer['properties']>,
    recordUndo: boolean = true
  ) => {
    if (recordUndo) {
      recordHistory(project);
    }
    const layerIds = Array.isArray(layerId) ? layerId : [layerId];

    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => {
        if (!layerIds.includes(layer.id)) return layer;

        // Animated properties are written as keyframes at the current frame;
        // static properties change the layer's base value
        const updatedProps = { ...layer.properties };
        for (const [key, val] of Object.entries(properties)) {
          const isAnimated = layer.tracks.some((t) => t.property === key);
          if (!isAnimated) {
            (updatedProps as Record<string, unknown>)[key] = val;
          }
        }

        const frameTime = snapToFrame(currentTime, prev.fps);
        const tolerance = frameTolerance(prev.fps);
        const updatedTracks = layer.tracks.map((track) => {
          const propVal = properties[track.property];
          if (propVal === undefined) return track;
          const kfIndex = track.keyframes.findIndex(
            (k) => Math.abs(k.time - frameTime) < tolerance
          );
          if (kfIndex !== -1) {
            const nextKeyframes = [...track.keyframes];
            nextKeyframes[kfIndex] = {
              ...nextKeyframes[kfIndex],
              value: propVal,
            };
            return { ...track, keyframes: nextKeyframes };
          }
          return {
            ...track,
            keyframes: sortKeyframes([...track.keyframes, createKeyframe(frameTime, propVal)]),
          };
        });

        return {
          ...layer,
          properties: updatedProps,
          tracks: updatedTracks,
        };
      }),
    }));
  }, [project, recordHistory, currentTime]);

  // Single Layer Property Update helper
  const handleUpdateLayerProperty = useCallback((
    layerId: string | string[],
    property: string,
    value: any,
    recordUndo: boolean = true
  ) => {
    handleUpdateLayerProperties(layerId, { [property]: value }, recordUndo);
  }, [handleUpdateLayerProperties]);

  // A canvas offset seen from the space a layer lives in (its boolean group's coordinates)
  const toLayerSpaceOffset = (layer: Layer, dx: number, dy: number) => {
    const inverse = invertAffine(getParentWorldMatrix(projectRef.current.layers, layer, currentTime));
    const origin = applyAffine(inverse, 0, 0);
    const moved = applyAffine(inverse, dx, dy);
    return { dx: moved.x - origin.x, dy: moved.y - origin.y };
  };

  // Shown on the canvas and not locked (by itself or by a group around it)
  const isMovable = (layer: Layer) =>
    isLayerShown(projectRef.current.layers, layer, currentTime) && !isLayerLocked(projectRef.current.layers, layer);

  // Move layers on the canvas by an offset (arrow keys). Locked and hidden layers stay put.
  const handleNudgeLayers = (layerIds: string[], dx: number, dy: number, recordUndo: boolean) => {
    const movable = projectRef.current.layers.filter((l) => layerIds.includes(l.id) && isMovable(l));
    if (movable.length === 0) return;
    if (recordUndo) recordHistory(projectRef.current);
    for (const layer of movable) {
      const current = getLayerPropertiesAtTime(layer, currentTime);
      const offset = toLayerSpaceOffset(layer, dx, dy);
      handleUpdateLayerProperties(
        layer.id,
        { x: Number((current.x + offset.dx).toFixed(2)), y: Number((current.y + offset.dy).toFixed(2)) },
        false
      );
    }
  };

  // Align or distribute the selected layers (Inspector). One layer aligns to the canvas.
  // Locked and hidden layers stay put and don't count. One undo step.
  const handleAlignLayers = (mode: AlignMode) => {
    const current = projectRef.current;
    const ids = selectedLayerIds.length > 0 ? selectedLayerIds : selectedLayerId ? [selectedLayerId] : [];
    const members = current.layers
      .filter((l) => ids.includes(l.id) && isMovable(l))
      .map((layer) => ({
        layer,
        props: getLayerPropertiesAtTime(layer, currentTime),
        matrix: layer.parentId ? getParentWorldMatrix(current.layers, layer, currentTime) : undefined,
      }));
    const moves = computeAlignMoves(members, mode, current).filter(
      (m) => Math.abs(m.dx) > 1e-3 || Math.abs(m.dy) > 1e-3
    );
    if (moves.length === 0) return;
    recordHistory(current);
    for (const move of moves) {
      const member = members.find((m) => m.layer.id === move.layerId)!;
      const offset = toLayerSpaceOffset(member.layer, move.dx, move.dy);
      const changes: Partial<Layer['properties']> = {};
      if (Math.abs(offset.dx) > 1e-3) changes.x = Number((member.props.x + offset.dx).toFixed(2));
      if (Math.abs(offset.dy) > 1e-3) changes.y = Number((member.props.y + offset.dy).toFixed(2));
      handleUpdateLayerProperties(move.layerId, changes, false);
    }
  };

  // Moving the time cursor by hand stops playback
  const handleSeek = (time: number) => {
    setIsPlaying(false);
    setCurrentTime(time);
  };

  // Step one frame back (-1) or forward (1)
  const handleStepFrame = (direction: -1 | 1) => {
    setIsPlaying(false);
    setCurrentTime((prev) =>
      Math.max(0, Math.min(project.duration, Number((prev + direction / project.fps).toFixed(3))))
    );
  };

  // Jump to the previous / next keyframe of the selected layers (of any layer when none is selected)
  const handleSeekKeyframe = (direction: -1 | 1) => {
    const time = getAdjacentKeyframeTime(project, currentTime, direction, selectedLayerIds);
    if (time !== null) handleSeek(time);
  };

  // Add / remove a keyframe at the given time on an animated property (toggle)
  const handleAddKeyframe = (layerId: string, property: AnimatableProperty, time: number) => {
    recordHistory(project);

    setProject((prev) => {
      const frameTime = snapToFrame(time, prev.fps);
      const tolerance = frameTolerance(prev.fps);

      return {
        ...prev,
        layers: prev.layers.map((layer) => {
          if (layer.id !== layerId) return layer;

          const curVal = getLayerPropertiesAtTime(layer, frameTime)[property] ?? 0;
          const track = layer.tracks.find((t) => t.property === property);

          if (!track) {
            return {
              ...layer,
              tracks: [...layer.tracks, createTrack(property, [createKeyframe(frameTime, curVal)])],
              expanded: true,
            };
          }

          const existingIdx = track.keyframes.findIndex((k) => Math.abs(k.time - frameTime) < tolerance);
          const nextKeyframes =
            existingIdx !== -1
              ? track.keyframes.filter((_, idx) => idx !== existingIdx)
              : sortKeyframes([...track.keyframes, createKeyframe(frameTime, curVal)]);

          return { ...layer, ...replaceTrackKeyframes(layer, property, nextKeyframes, frameTime) };
        }),
      };
    });
  };

  // Replaces a track's keyframes; removing the last keyframe disables the property's animation
  // and keeps its current value as the static base value. In X / Y pairs (position, scale,
  // anchor) the emptied track stays in the timeline while the other axis is animated, so
  // keyframes can be added to it again; the pair goes away once both are empty.
  const replaceTrackKeyframes = (
    layer: Layer,
    property: string,
    keyframes: PropertyTrack['keyframes'],
    time: number
  ): Pick<Layer, 'tracks' | 'properties'> => {
    if (keyframes.length > 0) {
      return {
        properties: layer.properties,
        tracks: layer.tracks.map((t) => (t.property === property ? { ...t, keyframes } : t)),
      };
    }
    const current = getLayerPropertiesAtTime(layer, time);
    const properties = { ...layer.properties, [property]: current[property as keyof typeof current] };
    const partner = PAIRED_PROPERTIES[property as AnimatableProperty];
    const partnerTrack = partner ? layer.tracks.find((t) => t.property === partner) : undefined;
    if (partnerTrack && partnerTrack.keyframes.length > 0) {
      return {
        properties,
        tracks: layer.tracks.map((t) => (t.property === property ? { ...t, keyframes: [] } : t)),
      };
    }
    return {
      properties,
      tracks: layer.tracks.filter((t) => t.property !== property && t.property !== partner),
    };
  };

  // Toggle animation for a group of properties (Inspector keyframe icon).
  // Enabling creates a keyframe at the current frame with the current value;
  // disabling removes the tracks and bakes the current value into the layer.
  // Inspector: removes the blur effect from the layers, with its animation (one undo step)
  const handleRemoveBlur = (layerIds: string[]) => {
    recordHistory(projectRef.current);
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layerIds.includes(layer.id)
          ? {
              ...layer,
              properties: { ...layer.properties, blur: 0 },
              tracks: layer.tracks.filter((t) => t.property !== 'blur'),
            }
          : layer
      ),
    }));
    setSelectedKeyframes((prev) => prev.filter((r) => !layerIds.includes(r.layerId) || r.property !== 'blur'));
  };

  const handleToggleAnimation = (layerId: string, properties: AnimatableProperty[]) => {
    recordHistory(project);

    setProject((prev) => {
      const frameTime = snapToFrame(currentTime, prev.fps);

      return {
        ...prev,
        layers: prev.layers.map((layer) => {
          if (layer.id !== layerId) return layer;

          const current = getLayerPropertiesAtTime(layer, currentTime);
          const isAnimated = layer.tracks.some((t) => properties.includes(t.property));

          if (isAnimated) {
            const baked = { ...layer.properties };
            for (const prop of properties) {
              if (current[prop] !== undefined) {
                (baked as Record<string, unknown>)[prop] = current[prop];
              }
            }
            return {
              ...layer,
              properties: baked,
              tracks: layer.tracks.filter((t) => !properties.includes(t.property)),
            };
          }

          const newTracks = properties.map((prop) =>
            createTrack(prop, [createKeyframe(frameTime, current[prop] ?? 0)])
          );
          return { ...layer, tracks: [...layer.tracks, ...newTracks], expanded: true };
        }),
      };
    });

    setSelectedKeyframes((prev) =>
      prev.filter((r) => r.layerId !== layerId || !properties.includes(r.property as AnimatableProperty))
    );
  };

  // Move keyframes in time by a delta (dragging one or several selected keyframes, or a layer bar).
  // base holds each keyframe's time when the drag started.
  const handleMoveKeyframes = (base: (KeyframeRef & { time: number })[], delta: number) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => {
        const layerBase = base.filter((b) => b.layerId === layer.id);
        if (layerBase.length === 0) return layer;
        return {
          ...layer,
          tracks: layer.tracks.map((track) => {
            const trackBase = layerBase.filter((b) => b.property === track.property);
            if (trackBase.length === 0) return track;
            return {
              ...track,
              keyframes: sortKeyframes(
                track.keyframes.map((kf) => {
                  const b = trackBase.find((tb) => tb.keyframeId === kf.id);
                  return b ? { ...kf, time: Number((b.time + delta).toFixed(4)) } : kf;
                })
              ),
            };
          }),
        };
      }),
    }));
  };

  // Give keyframes new times (stretching a layer bar redistributes its keyframes)
  const handleSetKeyframeTimes = (items: (KeyframeRef & { time: number })[]) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => {
        const layerItems = items.filter((b) => b.layerId === layer.id);
        if (layerItems.length === 0) return layer;
        return {
          ...layer,
          tracks: layer.tracks.map((track) => {
            const trackItems = layerItems.filter((b) => b.property === track.property);
            if (trackItems.length === 0) return track;
            return {
              ...track,
              keyframes: sortKeyframes(
                track.keyframes.map((kf) => {
                  const b = trackItems.find((tb) => tb.keyframeId === kf.id);
                  return b ? { ...kf, time: Number(b.time.toFixed(4)) } : kf;
                })
              ),
            };
          }),
        };
      }),
    }));
  };

  // Delete one or several keyframes
  const handleDeleteKeyframes = (refs: KeyframeRef[]) => {
    if (refs.length === 0) return;
    recordHistory(project);

    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) => {
        const layerRefs = refs.filter((r) => r.layerId === layer.id);
        if (layerRefs.length === 0) return layer;

        let next = layer;
        for (const property of new Set(layerRefs.map((r) => r.property))) {
          const track = next.tracks.find((t) => t.property === property);
          if (!track) continue;
          const ids = new Set(layerRefs.filter((r) => r.property === property).map((r) => r.keyframeId));
          const lastRemoved = track.keyframes.find((k) => ids.has(k.id));
          next = {
            ...next,
            ...replaceTrackKeyframes(
              next,
              property,
              track.keyframes.filter((k) => !ids.has(k.id)),
              lastRemoved?.time ?? currentTime
            ),
          };
        }
        return next;
      }),
    }));
    setSelectedKeyframes((prev) => prev.filter((s) => !refs.some((r) => isSameKeyframeRef(r, s))));
  };

  // Apply one easing curve to every selected keyframe (each property keeps its own curve,
  // so Posición X and Y can ease differently even at the same time)
  const handleUpdateKeyframesEasing = (refs: KeyframeRef[], easing: EasingConfig, recordUndo: boolean = true) => {
    if (refs.length === 0) return;
    if (recordUndo) recordHistory(project);

    setProject((prev) => {
      const targets = new Map<string, Set<string>>(); // `${layerId}:${property}` -> keyframe ids
      for (const { ref } of resolveKeyframeRefs(prev, refs)) {
        const key = `${ref.layerId}:${ref.property}`;
        if (!targets.has(key)) targets.set(key, new Set());
        targets.get(key)!.add(ref.keyframeId);
      }

      return {
        ...prev,
        layers: prev.layers.map((layer) => ({
          ...layer,
          tracks: layer.tracks.map((track) => {
            const ids = targets.get(`${layer.id}:${track.property}`);
            if (!ids) return track;
            return {
              ...track,
              keyframes: track.keyframes.map((kf) => (ids.has(kf.id) ? { ...kf, easing } : kf)),
            };
          }),
        })),
      };
    });
  };

  // Set where a layer's animation starts and how long it lasts (Inspector fields of the layer bar).
  // The keyframes move and are spread proportionally from the start, like stretching the bar.
  const handleRetimeLayerAnimation = (
    layerId: string,
    timing: { start?: number; length?: number },
    recordUndo: boolean = true
  ) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || !getLayerKeyframeRange(layer)) return;
    if (recordUndo) recordHistory(project);

    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => {
        const range = l.id === layerId ? getLayerKeyframeRange(l) : null;
        if (!range) return l;
        const frame = 1 / prev.fps;
        const oldLength = range.end - range.start;
        // A single instant can only be moved, not stretched
        let length = oldLength > 0 && timing.length !== undefined ? timing.length : oldLength;
        length = oldLength > 0 ? Math.max(frame, Math.min(prev.duration, snapToFrame(length, prev.fps))) : 0;
        let start = snapToFrame(timing.start ?? range.start, prev.fps);
        start = Math.max(0, Math.min(prev.duration - length, start));
        const factor = oldLength > 0 ? length / oldLength : 1;
        return {
          ...l,
          tracks: l.tracks.map((track) => ({
            ...track,
            keyframes: sortKeyframes(
              track.keyframes.map((kf) => ({
                ...kf,
                time: Number((start + (kf.time - range.start) * factor).toFixed(4)),
              }))
            ),
          })),
        };
      }),
    }));
  };

  // Keyframe selection; keeps the Inspector on a layer that owns part of the selection
  const handleSelectKeyframes = (refs: KeyframeRef[]) => {
    setSelectedKeyframes(refs);
    if (refs.length > 0 && !refs.some((r) => r.layerId === selectedLayerId)) {
      setSelectedLayerId(refs[0].layerId);
    }
  };

  // Copy the given keyframes to the timeline clipboard
  const handleCopyKeyframes = (refs: KeyframeRef[]) => {
    const resolved = resolveKeyframeRefs(project, refs);
    if (resolved.length === 0) return;
    copyTimelineClipboard({
      kind: 'keyframes',
      items: resolved.map(({ track, keyframe }) => ({
        property: track.property,
        time: keyframe.time,
        value: keyframe.value,
        easing: JSON.parse(JSON.stringify(keyframe.easing)),
      })),
    });
    showToast(
      resolved.length === 1 ? t('Fotograma clave copiado') : t('{count} fotogramas clave copiados', { count: resolved.length }),
      'success'
    );
  };

  // Keyframes or a layer animation go to the timeline clipboard and to the system clipboard
  const copyTimelineClipboard = (data: TimelineClipboard) => {
    setClipboard(data);
    lastCopiedRef.current = 'timeline';
    writeClipboardText(serializeClipboard({ kind: 'timeline', clipboard: data })).then((ok) => {
      clipboardWriteFailedRef.current = !ok;
    });
  };

  // Copy every animation of a layer (its whole blue bar)
  const handleCopyLayerAnimation = (layerId: string) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || layer.tracks.length === 0) return;
    copyTimelineClipboard({ kind: 'layer', tracks: JSON.parse(JSON.stringify(layer.tracks)) });
    showToast(t('Animación de "{name}" copiada', { name: layer.name }), 'success');
  };

  // Paste the clipboard onto a layer, starting at the playhead (moved back if it wouldn't fit).
  // A layer animation keeps its spacing and is added to the target's animation (keyframes on
  // the same frames are replaced), so everything stays under the same layer bar.
  // With several layers selected (and the given layer among them), it's pasted on all of them.
  const handlePaste = (layerId: string, source: TimelineClipboard | null = clipboard) => {
    const clipboard = source;
    const targetIds = selectedLayerIds.length > 1 && selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId];
    const targets = project.layers.filter((l) => targetIds.includes(l.id));
    if (!clipboard || targets.length === 0) return;
    recordHistory(project);

    const tolerance = frameTolerance(project.fps);
    const pastedRefs: KeyframeRef[] = [];

    const times =
      clipboard.kind === 'keyframes'
        ? clipboard.items.map((i) => i.time)
        : clipboard.tracks.flatMap((t) => t.keyframes.map((k) => k.time));
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 0;
    const offset = Math.max(
      -minTime,
      Math.min(project.duration - maxTime, snapToFrame(currentTime, project.fps) - minTime)
    );
    const shift = (time: number) => Number((time + offset).toFixed(4));

    // Each target gets its own copy of the keyframes (new ids)
    const pasteInto = (target: Layer) => {
      const tracks = [...target.tracks];
      if (clipboard.kind === 'keyframes') {
        for (const item of clipboard.items) {
          const time = shift(item.time);
          const kf = { ...createKeyframe(time, item.value), easing: JSON.parse(JSON.stringify(item.easing)) };
          pastedRefs.push({ layerId: target.id, property: item.property, keyframeId: kf.id });

          const idx = tracks.findIndex((t) => t.property === item.property);
          if (idx === -1) {
            tracks.push(createTrack(item.property, [kf]));
          } else {
            const kept = tracks[idx].keyframes.filter((k) => Math.abs(k.time - time) >= tolerance);
            tracks[idx] = { ...tracks[idx], keyframes: sortKeyframes([...kept, kf]) };
          }
        }
      } else {
        for (const source of clipboard.tracks) {
          const keyframes = source.keyframes.map((k) => ({
            ...createKeyframe(shift(k.time), k.value),
            easing: JSON.parse(JSON.stringify(k.easing)),
          }));
          keyframes.forEach((k) => pastedRefs.push({ layerId: target.id, property: source.property, keyframeId: k.id }));
          const idx = tracks.findIndex((t) => t.property === source.property);
          if (idx === -1) {
            tracks.push({ ...source, keyframes });
          } else {
            // Added to the existing animation; only keyframes on the same frames are replaced
            const kept = tracks[idx].keyframes.filter((k) => keyframes.every((p) => Math.abs(k.time - p.time) >= tolerance));
            tracks[idx] = { ...tracks[idx], keyframes: sortKeyframes([...kept, ...keyframes]) };
          }
        }
      }
      return tracks;
    };
    const pasted = new Map(targets.map((t) => [t.id, pasteInto(t)]));

    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (pasted.has(l.id) ? { ...l, tracks: pasted.get(l.id)!, expanded: true } : l)),
    }));
    if (targets.length > 1) handleSelectLayers(targetIds, layerId);
    else setSelectedLayerId(layerId);
    setSelectedKeyframes(pastedRefs);
    const count = targets.length;
    showToast(
      clipboard.kind === 'layer'
        ? count > 1
          ? t('Animación pegada en {count} capas', { count })
          : t('Animación pegada en "{name}"', { name: targets[0].name })
        : count > 1
          ? t('Fotogramas clave pegados en {count} capas', { count })
          : t('Fotogramas clave pegados'),
      'success'
    );
  };

  // ── Layer clipboard ─────────────────────────────────────────────────────────

  // Copy layers (keeping their stacking order) to the in-app and the system clipboard
  const handleCopyLayers = (layerIds: string[], silent = false) => {
    const current = projectRef.current;
    // Boolean groups take their shapes along; shapes taken out of a group keep their canvas place
    const tops = topLevelIds(current.layers, layerIds).map((id) => getLayer(current.layers, id)!);
    if (tops.length === 0) return;
    const data = createLayersClipboard(getLayersForClipboard(current.layers, layerIds, currentTime), currentTime, current.duration);
    setLayerClipboard(data);
    lastCopiedRef.current = 'layers';
    writeClipboardText(serializeClipboard(data)).then((ok) => {
      clipboardWriteFailedRef.current = !ok;
    });
    if (!silent) showToast(tops.length === 1 ? t('Capa "{name}" copiada', { name: tops[0].name }) : t('{count} capas copiadas', { count: tops.length }), 'success');
  };

  const handleCutLayers = (layerIds: string[]) => {
    const count = topLevelIds(projectRef.current.layers, layerIds).length;
    if (count === 0) return;
    handleCopyLayers(layerIds, true);
    handleDeleteLayers(layerIds, true);
    showToast(count === 1 ? t('Capa cortada') : t('{count} capas cortadas', { count }), 'success');
  };

  // Add layers above the top-most selected layer (or on top of everything) and select them
  const insertLayers = (newLayers: Layer[], message: string) => {
    if (newLayers.length === 0) return;
    const current = projectRef.current;
    recordHistory(current);
    const indices = selectedLayerIds.map((id) => current.layers.findIndex((l) => l.id === id)).filter((i) => i >= 0);
    const at = indices.length > 0 ? Math.max(...indices) + 1 : current.layers.length;
    const layers = [...current.layers];
    layers.splice(at, 0, ...newLayers);
    // Pasted at the top level: inside a group's block they move after the group
    setProject({ ...current, layers: normalizeLayerTree(layers) });
    const roots = newLayers.filter((l) => !l.parentId);
    handleSelectLayers(
      roots.map((l) => l.id),
      roots[roots.length - 1]?.id ?? null
    );
    setSelectedKeyframes([]);
    setActiveTool('select');
    showToast(message, 'success');
  };

  const pasteLayersClipboard = (data: LayersClipboard, withAnimation: boolean) => {
    const layers = instantiateClipboardLayers(data, projectRef.current, withAnimation);
    const roots = layers.filter((l) => !l.parentId);
    const params = { name: roots[0]?.name ?? '', count: roots.length };
    const message =
      roots.length === 1
        ? withAnimation
          ? t('Capa "{name}" pegada', params)
          : t('Capa "{name}" pegada sin animación', params)
        : withAnimation
          ? t('{count} capas pegadas', params)
          : t('{count} capas pegadas sin animación', params);
    insertLayers(layers, message);
  };

  // SVG code from the clipboard becomes new layers, centred on the canvas
  const handlePasteSvgLayers = async (svgText: string, withAnimation: boolean) => {
    let result;
    try {
      result = await importSvg(svgText, projectRef.current.fps);
    } catch (err: any) {
      showToast(t('No se pudo pegar el SVG: {error}', { error: err?.message || t('formato no válido') }), 'error');
      return;
    }
    if (result.layers.length === 0) {
      showToast(t('El SVG no contiene formas que se puedan pegar'), 'warning');
      return;
    }
    const layers = placeSvgLayers(result.layers, result, projectRef.current, withAnimation);
    const count = layers.length === 1 ? t('1 capa') : t('{count} capas', { count: layers.length });
    const skipped =
      result.skipped > 0 ? t(' · {count} elementos no compatibles omitidos', { count: result.skipped }) : '';
    insertLayers(
      layers,
      result.animated && withAnimation
        ? t('SVG animado pegado: {layers}{skipped}', { layers: count, skipped })
        : t('SVG pegado: {layers}{skipped}', { layers: count, skipped })
    );
  };

  // Paste what the clipboard holds. Returns false when there was nothing to paste.
  // fromKeyboard: unrecognised content falls back to the in-app copy when the system clipboard
  // could not be written.
  const pasteClipboardContent = (content: ClipboardContent, withAnimation: boolean, fromKeyboard = false): boolean => {
    if (content?.type === 'nori') {
      const data = content.data;
      if (data.kind === 'layers') {
        pasteLayersClipboard(data, withAnimation);
        return true;
      }
      setClipboard(data.clipboard);
      if (selectedLayerId) handlePaste(selectedLayerId, data.clipboard);
      else showToast(t('Selecciona una capa para pegar los fotogramas clave'), 'info');
      return true;
    }
    if (content?.type === 'svg') {
      handlePasteSvgLayers(content.svg, withAnimation);
      return true;
    }
    if (content?.type === 'figma') {
      showToast(t('Figma copia en un formato propio: en Figma usa "Copiar como SVG" para pegarlo aquí'), 'info');
      return true;
    }
    if (fromKeyboard && clipboardWriteFailedRef.current) return pasteFromInAppClipboard(withAnimation);
    return false;
  };

  const pasteFromInAppClipboard = (withAnimation: boolean): boolean => {
    if (lastCopiedRef.current === 'layers' && layerClipboard) {
      pasteLayersClipboard(layerClipboard, withAnimation);
      return true;
    }
    if (lastCopiedRef.current === 'timeline' && clipboard && selectedLayerId) {
      handlePaste(selectedLayerId);
      return true;
    }
    return false;
  };

  // Paste from the canvas menu: uses the content found when the menu opened, or reads the
  // clipboard now if it couldn't be checked silently
  const handleMenuPaste = async (probe: ClipboardProbe, withAnimation: boolean) => {
    const read = probe.status === 'ok' ? probe : await readClipboard();
    const pasted =
      read.status === 'ok'
        ? pasteClipboardContent(read.content, withAnimation, true)
        : pasteFromInAppClipboard(withAnimation);
    if (!pasted) {
      showToast(
        read.status === 'ok'
          ? t('El portapapeles no contiene capas de Nori ni código SVG')
          : t('El navegador no deja leer el portapapeles: usa Ctrl + V'),
        'warning'
      );
    }
  };

  // Right click on the canvas: open the menu and check the clipboard to enable "Pegar"
  const handleOpenCanvasMenu = (x: number, y: number) => {
    const token = ++canvasMenuTokenRef.current;
    setCanvasMenu({ x, y, probe: 'checking' });
    readClipboard(true).then((probe) => {
      if (canvasMenuTokenRef.current === token) setCanvasMenu((m) => (m ? { ...m, probe } : m));
    });
  };

  const closeCanvasMenu = useCallback(() => {
    canvasMenuTokenRef.current++;
    setCanvasMenu(null);
  }, []);

  const buildCanvasMenuItems = (probe: ClipboardProbe | 'checking'): ContextMenuItem[] => {
    const hasSelection = selectedLayerIds.length > 0;
    let canPaste = false;
    if (probe !== 'checking') {
      if (probe.status === 'unknown') {
        canPaste = true; // Can't be checked without asking: decided when pasting
      } else {
        const c = probe.content;
        canPaste =
          c?.type === 'svg' ||
          (c?.type === 'nori' && c.data.kind === 'layers') ||
          (c === null && clipboardWriteFailedRef.current && lastCopiedRef.current === 'layers' && !!layerClipboard);
      }
    }
    const resolvedProbe: ClipboardProbe = probe === 'checking' ? { status: 'unknown' } : probe;
    return [
      { label: t('Copiar'), shortcut: 'Ctrl+C', disabled: !hasSelection, onSelect: () => handleCopyLayers(selectedLayerIds) },
      { label: t('Cortar'), shortcut: 'Ctrl+X', disabled: !hasSelection, onSelect: () => handleCutLayers(selectedLayerIds) },
      {
        label: probe === 'checking' ? t('Pegar (comprobando…)') : t('Pegar'),
        shortcut: 'Ctrl+V',
        disabled: !canPaste,
        onSelect: () => handleMenuPaste(resolvedProbe, true),
      },
      {
        label: t('Pegar sin animación'),
        shortcut: 'Ctrl+Shift+V',
        disabled: !canPaste,
        onSelect: () => handleMenuPaste(resolvedProbe, false),
      },
      'separator',
      {
        label: t('Animaciones predeterminadas…'),
        disabled: !hasSelection,
        onSelect: () => setPresetTargetIds(selectedLayerIds),
      },
      ...(hasSelection
        ? ([
            'separator',
            { label: t('Agrupar'), shortcut: 'Ctrl+Alt+G', onSelect: () => handleGroupLayers() },
            ...(selectedForBoolean?.type === 'group'
              ? [{ label: t('Desagrupar'), shortcut: 'Ctrl+Shift+Alt+G', onSelect: () => handleUngroupBoolean() }]
              : []),
          ] as ContextMenuItem[])
        : []),
      ...(booleanState.canCombine
        ? ([
            'separator',
            ...(['union', 'subtract', 'intersect', 'exclude'] as BooleanOperation[]).map((op) => ({
              label: booleanState.activeOp === op ? `${t(BOOLEAN_LABELS[op].action)} ✓` : t(BOOLEAN_LABELS[op].action),
              shortcut: BOOLEAN_LABELS[op].shortcut,
              onSelect: () => handleBooleanOperation(op),
            })),
          ] as ContextMenuItem[])
        : []),
      ...(booleanState.canFlatten
        ? ([
            { label: t('Aplanar en un trazado'), shortcut: 'Ctrl+E', onSelect: () => handleFlattenBoolean() },
            { label: t('Desagrupar'), onSelect: () => handleUngroupBoolean() },
          ] as ContextMenuItem[])
        : []),
      'separator',
      {
        label: selectedLayerIds.length > 1 ? t('Eliminar {count} capas', { count: selectedLayerIds.length }) : t('Eliminar'),
        shortcut: t('Supr'),
        danger: true,
        disabled: !hasSelection,
        onSelect: () => handleDeleteLayers(selectedLayerIds),
      },
    ];
  };

  // ── Predefined animations ───────────────────────────────────────────────────

  // From the timeline menu: the layer, or the whole selection when the layer is part of it
  const handleOpenAnimationPresets = (layerId: string) => {
    setPresetTargetIds(selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId]);
  };

  const handleApplyAnimationPreset = (preset: AnimationPreset, length: number) => {
    const ids = presetTargetIds ?? [];
    const current = projectRef.current;
    const targets = current.layers.filter((l) => ids.includes(l.id));
    if (targets.length === 0) {
      setPresetTargetIds(null);
      return;
    }
    const spans = planPresetSpans(preset.category, currentTime, length, current.duration, current.fps);
    const distance = getPresetDistance(current.width, current.height);
    recordHistory(current);
    const refs: KeyframeRef[] = [];
    const layers = current.layers.map((layer) => {
      if (!ids.includes(layer.id)) return layer;
      const applied = applyAnimationPreset(layer, preset, spans, current.fps, distance);
      refs.push(...applied.refs);
      return applied.layer;
    });
    setProject({ ...current, layers });
    setSelectedKeyframes(refs);
    setPresetTargetIds(null);
    showToast(
      targets.length === 1
        ? t('Animación "{preset}" añadida a "{name}"', { preset: t(preset.name), name: targets[0].name })
        : t('Animación "{preset}" añadida a {count} capas', { preset: t(preset.name), count: targets.length }),
      'success'
    );
  };

  // Rename a layer (edited in place from the Inspector header)
  const handleRenameLayer = (layerId: string, name: string) => {
    recordHistory(project);
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
    }));
  };

  // Toggle Layer Visibility
  const handleToggleLayerVisibility = (layerId: string) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === layerId ? { ...l, visible: !l.visible } : l
      ),
    }));
  };

  // Toggle Layer Lock
  const handleToggleLayerLock = (layerId: string) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === layerId ? { ...l, locked: !l.locked } : l
      ),
    }));
  };

  // Toggle Layer Expanded
  const handleToggleLayerExpanded = (layerId: string) => {
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id === layerId ? { ...l, expanded: !l.expanded } : l
      ),
    }));
  };

  // Add New Layer (basic shapes start with sharp corners, a fill and no stroke)
  const handleAddLayer = (shape: ShapeType) => {
    recordHistory(project);

    const id = `layer_${Date.now()}`;
    const type: LayerType = shape === 'triangle' ? 'polygon' : shape;
    const count = project.layers.length + 1;
    const names: Record<ShapeType, string> = {
      rect: 'Rectángulo',
      ellipse: 'Elipse',
      triangle: 'Triángulo',
      polygon: 'Polígono',
      star: 'Estrella',
    };

    const newLayer: Layer = {
      id,
      name: `${t(names[shape])} ${count}`,
      type,
      visible: true,
      locked: false,
      inTime: 0,
      outTime: project.duration,
      expanded: true,
      properties: {
        x: Math.round(project.width / 2),
        y: Math.round(project.height / 2),
        width: 120,
        height: 120,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        fill: '#0084ff',
        stroke: 'transparent',
        strokeWidth: 2,
        radius: 0,
        ...(type === 'polygon' ? { sides: shape === 'triangle' ? 3 : DEFAULT_SHAPE.sides } : {}),
        ...(type === 'star' ? { points: DEFAULT_SHAPE.points, innerRadius: DEFAULT_SHAPE.innerRadius } : {}),
      },
      tracks: [],
    };

    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
    }));
    setSelectedLayerId(id);
    setActiveTool('select');
  };

  // Turn a basic shape into an editable path (its look at the current frame is kept)
  const handleConvertToPath = (layerId: string) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || layer.type === 'path') return;
    const current = getLayerPropertiesAtTime(layer, currentTime);
    const d = getShapePathData(layer.type, current);
    if (!d) return;

    recordHistory(project);
    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) =>
        l.id !== layerId
          ? l
          : {
              ...l,
              type: 'path',
              properties: { ...l.properties, pathData: normalizePathData(d), radius: 0 },
              // The corner radius is now part of the outline
              tracks: l.tracks.filter((t) => t.property !== 'radius'),
            }
      ),
    }));
    setSelectedKeyframes((prev) => prev.filter((r) => r.layerId !== layerId || r.property !== 'radius'));
    setVertexEditLayerId(layerId);
  };

  const handleToggleVertexEdit = (layerId: string) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    if (layer.type !== 'path') {
      handleConvertToPath(layerId);
      return;
    }
    setVertexEditLayerId((prev) => (prev === layerId ? null : layerId));
  };

  // Duplicate Layer (a boolean group is copied with its shapes; the copy goes on top of its space)
  const handleDuplicateLayer = (layerId: string) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    recordHistory(project);

    const [root, ...inside] = cloneLayerTree(project.layers, layerId);
    const copy: Layer = {
      ...root,
      name: `${layer.name} ${t('Copia')}`,
      properties: {
        ...root.properties,
        x: layer.properties.x + 20,
        y: layer.properties.y + 20,
      },
    };

    setProject((prev) => ({
      ...prev,
      layers: normalizeLayerTree([...prev.layers, copy, ...inside]),
    }));
    setSelectedLayerId(copy.id);
  };

  // Alt + drag on the canvas: each layer gets a copy right above it, and the copies become the
  // selection that the drag moves. The canvas records the undo step before calling this.
  const handleDuplicateLayersForDrag = (layerIds: string[], primaryId: string): Record<string, string> => {
    const current = projectRef.current.layers;
    const tops = topLevelIds(current, layerIds);
    const copies: Record<string, string> = {};
    const layers: Layer[] = [];
    current.forEach((layer) => {
      layers.push(layer);
      if (!tops.includes(layer.id)) return;
      const [root, ...inside] = cloneLayerTree(current, layer.id);
      copies[layer.id] = root.id;
      layers.push({ ...root, name: `${layer.name} ${t('Copia')}` }, ...inside);
    });
    setProject((prev) => ({ ...prev, layers: normalizeLayerTree(layers) }));
    const ids = Object.values(copies);
    handleSelectLayers(ids, copies[primaryId] ?? ids[ids.length - 1] ?? null);
    setSelectedKeyframes([]);
    return copies;
  };

  // Delete Layer (with everything inside it; a boolean group left without shapes goes too)
  const handleDeleteLayers =(layerIds: string[], silent = false) => {
    if (layerIds.length === 0) return;
    recordHistory(project);

    const { layers, removed } = deleteLayerTrees(project.layers, layerIds);
    const count = topLevelIds(project.layers, layerIds).length;
    setProject((prev) => ({ ...prev, layers }));
    const remaining = selectedLayerIds.filter((id) => !removed.has(id));
    handleSelectLayers(remaining, remaining.includes(selectedLayerId ?? '') ? selectedLayerId : (remaining[0] ?? null));
    setSelectedKeyframes((prev) => prev.filter((r) => !removed.has(r.layerId)));
    if (count > 1 && !silent) showToast(t('{count} capas eliminadas', { count }), 'success');
  };

  // ── Boolean groups ──────────────────────────────────────────────────────────

  // With a boolean group selected, its operation changes; with several shapes, they are combined
  const handleBooleanOperation = (op: BooleanOperation) => {
    const current = projectRef.current;
    const selected = getLayer(current.layers, selectedLayerId);
    if (selected?.type === 'boolean' && selectedLayerIds.length <= 1) {
      if (selected.booleanOp === op) return;
      recordHistory(current);
      setProject({ ...current, layers: setBooleanOperation(current.layers, selected.id, op) });
      showToast(t('Operación cambiada a {operation}', { operation: t(BOOLEAN_LABELS[op].name) }), 'success');
      return;
    }
    const result = createBooleanGroup(current.layers, selectedLayerIds, op, currentTime);
    if ('error' in result) {
      showToast(result.error, 'info');
      return;
    }
    recordHistory(current);
    setProject({ ...current, layers: result.layers });
    setSelectedLayerId(result.selectId);
    setSelectedKeyframes([]);
    setVertexEditLayerId(null);
    loadBooleanEngine();
  };

  // Ctrl + E: the selected boolean group becomes one path (its shape at the current frame)
  const handleFlattenBoolean = async (layerId: string | null = selectedLayerId) => {
    const target = getLayer(projectRef.current.layers, layerId);
    if (target?.type !== 'boolean') {
      showToast(t('Selecciona un grupo booleano para aplanarlo'), 'info');
      return;
    }
    if (!(await loadBooleanEngine())) {
      showToast(t('No se pudo cargar el motor de operaciones booleanas. Revisa la conexión e inténtalo de nuevo.'), 'error');
      return;
    }
    const current = projectRef.current;
    const result = flattenBooleanGroup(current.layers, target.id, currentTime);
    if ('error' in result) {
      showToast(result.error, 'warning');
      return;
    }
    recordHistory(current);
    setProject({ ...current, layers: result.layers });
    setSelectedLayerId(result.selectId);
    setSelectedKeyframes((prev) => prev.filter((r) => result.layers.some((l) => l.id === r.layerId)));
    showToast(t('"{name}" aplanado en un trazado', { name: target.name }), 'success');
  };

  // Puts the selected layers in a plain group, to animate them together
  const handleGroupLayers = () => {
    const current = projectRef.current;
    const result = createLayerGroup(current.layers, selectedLayerIds, currentTime);
    if ('error' in result) {
      showToast(result.error, 'info');
      return;
    }
    recordHistory(current);
    setProject({ ...current, layers: result.layers });
    setSelectedLayerId(result.selectId);
    setSelectedKeyframes([]);
    setVertexEditLayerId(null);
  };

  // Takes the layers out of the group (plain or boolean), where they are on the canvas
  const handleUngroupBoolean = (layerId: string | null = selectedLayerId) => {
    const current = projectRef.current;
    const target = getLayer(current.layers, layerId);
    if (target?.type !== 'boolean' && target?.type !== 'group') {
      showToast(t('Selecciona un grupo para desagruparlo'), 'info');
      return;
    }
    const result = ungroupGroup(current.layers, target.id, currentTime);
    if ('error' in result) {
      showToast(result.error, 'info');
      return;
    }
    recordHistory(current);
    setProject({ ...current, layers: result.layers });
    handleSelectLayers(result.selectIds, result.selectIds[result.selectIds.length - 1] ?? null);
    setSelectedKeyframes((prev) => prev.filter((r) => r.layerId !== target.id));
    showToast(
      result.lostAnimation
        ? t('Grupo desagrupado. Las capas quedan como se ven ahora: la animación de posición, escala, rotación u opacidad del grupo no se conserva')
        : t('Grupo desagrupado'),
      result.lostAnimation ? 'warning' : 'success'
    );
  };

  // Timeline: a layer dragged to another place in the stacking order (or into / out of a group)
  const handleMoveLayer = (layerId: string, refId: string, position: LayerDropPosition) => {
    const current = projectRef.current;
    const result = moveLayer(current.layers, layerId, refId, position, currentTime);
    if (!result) return;
    if ('error' in result) {
      showToast(result.error, 'info');
      return;
    }
    recordHistory(current);
    setProject({ ...current, layers: result.layers });
    const kept = selectedLayerIds.filter((id) => result.layers.some((l) => l.id === id));
    handleSelectLayers(kept.length > 0 ? kept : [layerId], kept.includes(selectedLayerId ?? '') ? selectedLayerId : layerId);
  };

  // What the boolean controls (Inspector, context menu) can do with the current selection
  const selectedForBoolean = getLayer(project.layers, selectedLayerId);
  const booleanState = {
    canCombine:
      (selectedForBoolean?.type === 'boolean' && selectedLayerIds.length <= 1) ||
      getBooleanCandidates(project.layers, selectedLayerIds).length >= 2,
    activeOp: selectedForBoolean?.type === 'boolean' && selectedLayerIds.length <= 1 ? (selectedForBoolean.booleanOp ?? 'union') : null,
    canFlatten: selectedForBoolean?.type === 'boolean',
  };
  const handleDeleteLayer = (layerId: string) => handleDeleteLayers([layerId]);

  // Download the project as a Nori JSON file
  const handleDownloadJson = () => {
    const fileName = downloadProjectJson(projectRef.current);
    showToast(t('Proyecto descargado: {fileName}', { fileName }), 'success');
  };

  const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

  // Vertex editing ends when its layer is no longer the selected path
  useEffect(() => {
    if (!vertexEditLayerId) return;
    const layer = project.layers.find((l) => l.id === vertexEditLayerId);
    if (!layer || layer.type !== 'path' || selectedLayerId !== vertexEditLayerId) setVertexEditLayerId(null);
  }, [vertexEditLayerId, selectedLayerId, project.layers]);

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden select-none relative">
      {/* 1. Top Bar with Undo / Redo & Lottie JSON support */}
      <TopBar
        project={project}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        zoom={zoom}
        setZoom={setZoom}
        showCheckerboard={showCheckerboard}
        setShowCheckerboard={setShowCheckerboard}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenExport={() => setIsExportOpen(true)}
        onDownloadJson={handleDownloadJson}
        onGoHome={onGoHome}
        folder={folder}
        onOpenFolder={onOpenFolder}
        onRenameProject={(title) => {
          recordHistory(project);
          setProject((prev) => ({ ...prev, title }));
          showToast(t('Proyecto renombrado a "{title}"', { title }), 'success');
        }}
        onAddLayer={handleAddLayer}
      />

      {/* 2. Middle Workspace: Canvas + Inspector */}
      <div className="flex-1 flex overflow-hidden relative">
        <CanvasView
          project={project}
          currentTime={currentTime}
          selectedLayerId={selectedLayerId}
          selectedLayerIds={selectedLayerIds}
          onSelectLayers={handleSelectLayers}
          onUpdateLayerProperties={handleUpdateLayerProperties}
          onStartDragLayer={handleStartDrag}
          onDuplicateLayersForDrag={handleDuplicateLayersForDrag}
          vertexEditLayerId={vertexEditLayerId}
          onToggleVertexEdit={handleToggleVertexEdit}
          onExitVertexEdit={() => setVertexEditLayerId(null)}
          onOpenContextMenu={handleOpenCanvasMenu}
          activeTool={activeTool}
          zoom={zoom}
          setZoom={setZoom}
          // Without a background color the canvas is always transparent
          showCheckerboard={showCheckerboard || isNoColor(project.backgroundColor)}
        />

        <Inspector
          project={project}
          selectedLayer={selectedLayer}
          selectedLayerIds={selectedLayerIds}
          selectedKeyframes={selectedKeyframes}
          onUpdateLayerProperty={handleUpdateLayerProperty}
          onUpdateLayerProperties={handleUpdateLayerProperties}
          onRenameLayer={handleRenameLayer}
          onStartScrub={handleStartDrag}
          onToggleAnimation={handleToggleAnimation}
          onRemoveBlur={handleRemoveBlur}
          vertexEditLayerId={vertexEditLayerId}
          onToggleVertexEdit={handleToggleVertexEdit}
          onUpdateKeyframesEasing={handleUpdateKeyframesEasing}
          onRetimeLayerAnimation={handleRetimeLayerAnimation}
          onUpdateProjectSettings={(settings, recordUndo = true) => {
            if (recordUndo) recordHistory(project);
            setProject((prev) => ({
              ...prev,
              ...settings,
              // Layers that lasted until the end follow the new duration
              layers:
                settings.duration !== undefined
                  ? fitLayersToDuration(prev.layers, prev.duration, settings.duration)
                  : prev.layers,
            }));
          }}
          onDeleteLayer={handleDeleteLayer}
          onDuplicateLayer={handleDuplicateLayer}
          onAlignLayers={handleAlignLayers}
          booleanState={booleanState}
          onBooleanOperation={handleBooleanOperation}
          onFlattenBoolean={(id) => handleFlattenBoolean(id)}
          onUngroupBoolean={(id) => handleUngroupBoolean(id)}
          onGroupLayers={handleGroupLayers}
          onSelectLayer={setSelectedLayerId}
          currentTime={currentTime}
        />
      </div>

      {/* 3. Bottom Timeline */}
      <Timeline
        project={project}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onSeek={handleSeek}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        onSelectLayer={setSelectedLayerId}
        onSelectLayers={handleSelectLayers}
        selectedKeyframes={selectedKeyframes}
        onSelectKeyframes={handleSelectKeyframes}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onToggleLayerLock={handleToggleLayerLock}
        onToggleLayerExpanded={handleToggleLayerExpanded}
        onMoveLayer={handleMoveLayer}
        onAddKeyframe={handleAddKeyframe}
        onUpdateLayerProperty={handleUpdateLayerProperty}
        onStartScrub={handleStartDrag}
        onDeleteKeyframes={handleDeleteKeyframes}
        onMoveKeyframes={handleMoveKeyframes}
        onSetKeyframeTimes={handleSetKeyframeTimes}
        clipboardKind={clipboard?.kind ?? null}
        onCopyKeyframes={handleCopyKeyframes}
        onCopyLayerAnimation={handleCopyLayerAnimation}
        onPaste={handlePaste}
        onStartKeyframeDrag={handleStartDrag}
        onSeekKeyframe={handleSeekKeyframe}
        onOpenAnimationPresets={handleOpenAnimationPresets}
      />

      {canvasMenu && (
        <ContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          items={buildCanvasMenuItems(canvasMenu.probe)}
          onClose={closeCanvasMenu}
        />
      )}

      {/* Modals */}
      <ExportModal
        project={project}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      <AnimationPresetsModal
        isOpen={presetTargetIds !== null}
        targetNames={project.layers.filter((l) => presetTargetIds?.includes(l.id)).map((l) => l.name)}
        currentTime={currentTime}
        projectDuration={project.duration}
        fps={project.fps}
        onClose={() => setPresetTargetIds(null)}
        onApply={handleApplyAnimationPreset}
      />
    </div>
  );
}
