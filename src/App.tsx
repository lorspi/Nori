import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Project,
  Layer,
  LayerType,
  AnimatableProperty,
  EasingConfig,
  PropertyTrack,
  KeyframeRef,
  TimelineClipboard,
} from './types/animation';
import { NORI_INTRO_PROJECT } from './utils/noriIntro';
import { loadLastProject, saveLastProject } from './utils/projectStorage';
import { TopBar, ToolMode, ShapeType } from './components/TopBar';
import { DEFAULT_SHAPE, getShapePathData, normalizePathData } from './utils/pathGeometry';
import { CanvasView } from './components/CanvasView';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/Timeline';
import { ExportModal } from './components/ExportModal';
import { ConfirmSwitchProjectModal } from './components/ConfirmSwitchProjectModal';
import { PasteSvgModal } from './components/PasteSvgModal';
import { isLottieJson, convertLottieToProject } from './utils/lottieImporter';
import { convertSvgToProject } from './utils/svgImporter';
import { getLayerPropertiesAtTime } from './utils/interpolator';
import {
  createKeyframe,
  createTrack,
  frameTolerance,
  getAdjacentKeyframeTime,
  getSiblingProperty,
  isSameKeyframeRef,
  resolveKeyframeRefs,
  snapToFrame,
  sortKeyframes,
} from './utils/animationTracks';
import AboutNori from './components/AboutNori';
import { useUI, ToastType } from './lib/ui';

// Arrow key -> canvas direction
const ARROW_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export default function App() {
  // Reopen the last project; the very first time, show the Nori intro animation playing
  const [restoredProject] = useState<Project | null>(loadLastProject);
  const [project, setProject] = useState<Project>(() => restoredProject ?? NORI_INTRO_PROJECT);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(() => !restoredProject);
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

  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);

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
  const [isPasteSvgOpen, setIsPasteSvgOpen] = useState<boolean>(false);

  const lastFrameTimeRef = useRef<number | null>(null);
  const projectRef = useRef<Project>(project);
  projectRef.current = project;

  const showToast = (msg: string, type: ToastType = 'info') => {
    toast(msg, type);
  };

  // Keep the open project in localStorage (debounced) so it reopens on the next visit
  const storageWarnedRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!saveLastProject(project) && !storageWarnedRef.current) {
        storageWarnedRef.current = true;
        showToast('No se pudo guardar el proyecto en el navegador (espacio insuficiente o almacenamiento bloqueado)', 'warning');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project]);

  // Flush pending changes when the page is closed
  useEffect(() => {
    const handleBeforeUnload = () => saveLastProject(projectRef.current);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
        showToast('No hay más acciones para deshacer');
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

  // Drag and Drop JSON directly onto window
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml') {
        const svgReader = new FileReader();
        svgReader.onload = (event) => handleImportSvg(event.target?.result as string, file.name);
        svgReader.readAsText(file);
        return;
      }

      if (!file.name.toLowerCase().endsWith('.json')) {
        showToast('Por favor arrastra un archivo .json o .svg', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (isLottieJson(parsed)) {
            const converted = convertLottieToProject(parsed);
            handleRequestOpenProject(
              converted,
              `¡Animación Lottie importada con éxito! (${converted.layers.length} capas, ${converted.duration}s)`
            );
          } else if (parsed.layers && Array.isArray(parsed.layers)) {
            const normalized: Project = {
              id: parsed.id || `project_${Date.now()}`,
              title: parsed.title || parsed.nm || file.name.replace(/\.json$/i, ''),
              width: parsed.width || parsed.w || 960,
              height: parsed.height || parsed.h || 540,
              fps: parsed.fps || parsed.fr || 30,
              duration: parsed.duration || 3,
              backgroundColor: parsed.backgroundColor || '#121316',
              layers: parsed.layers,
            };
            handleRequestOpenProject(normalized, `¡Proyecto cargado con éxito! (${normalized.title})`);
          } else {
            showToast('El archivo no parece tener un formato compatible de Lottie o Nori.', 'error');
          }
        } catch (err: any) {
          showToast(`Error al procesar JSON: ${err?.message}`, 'error');
        }
      };
      reader.readAsText(file);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [recordHistory]);

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
      // Editor shortcuts are paused while the About view is open
      if (isAboutOpen) return;

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

      // Save the project as JSON (also while typing, instead of the browser's "Save page")
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!e.repeat) handleSaveJson();
        return;
      }

      // Ignore if user is typing in an input
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      // Copy / paste keyframes
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (selectedKeyframes.length > 0) {
          e.preventDefault();
          handleCopyKeyframes(selectedKeyframes);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (clipboard && selectedLayerId) {
          e.preventDefault();
          handlePaste(selectedLayerId);
        }
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
          setCurrentTime(direction === 1 ? project.duration : 0);
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
        setIsPlaying((prev) => !prev);
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
        setSelectedLayerId(null);
        setSelectedKeyframes([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.fps, project.duration, selectedKeyframes, selectedLayerId, selectedLayerIds, clipboard, currentTime, project, handleUndo, handleRedo, isAboutOpen, vertexEditLayerId]);

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

  // Move layers on the canvas by an offset (arrow keys). Locked and hidden layers stay put.
  const handleNudgeLayers = (layerIds: string[], dx: number, dy: number, recordUndo: boolean) => {
    const movable = projectRef.current.layers.filter((l) => layerIds.includes(l.id) && l.visible && !l.locked);
    if (movable.length === 0) return;
    if (recordUndo) recordHistory(projectRef.current);
    for (const layer of movable) {
      const current = getLayerPropertiesAtTime(layer, currentTime);
      handleUpdateLayerProperties(layer.id, { x: current.x + dx, y: current.y + dy }, false);
    }
  };

  // Step one frame back (-1) or forward (1)
  const handleStepFrame = (direction: -1 | 1) => {
    setCurrentTime((prev) =>
      Math.max(0, Math.min(project.duration, Number((prev + direction / project.fps).toFixed(3))))
    );
  };

  // Jump to the previous / next keyframe of any layer
  const handleSeekKeyframe = (direction: -1 | 1) => {
    const time = getAdjacentKeyframeTime(project, currentTime, direction);
    if (time !== null) setCurrentTime(time);
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
  // and keeps its current value as the static base value
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
    return {
      properties: { ...layer.properties, [property]: current[property as keyof typeof current] },
      tracks: layer.tracks.filter((t) => t.property !== property),
    };
  };

  // Toggle animation for a group of properties (Inspector keyframe icon).
  // Enabling creates a keyframe at the current frame with the current value;
  // disabling removes the tracks and bakes the current value into the layer.
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

  // Apply one easing curve to every selected keyframe. Paired properties that the Inspector
  // shows as a single parameter (Posición X/Y, Escala X/Y, Anclaje X/Y) get the same curve
  // on their keyframe at the same time, so the motion stays in sync.
  const handleUpdateKeyframesEasing = (refs: KeyframeRef[], easing: EasingConfig, recordUndo: boolean = true) => {
    if (refs.length === 0) return;
    if (recordUndo) recordHistory(project);

    setProject((prev) => {
      const tolerance = frameTolerance(prev.fps);
      const targets = new Map<string, Set<string>>(); // `${layerId}:${property}` -> keyframe ids
      const addTarget = (layerId: string, property: string, keyframeId: string) => {
        const key = `${layerId}:${property}`;
        if (!targets.has(key)) targets.set(key, new Set());
        targets.get(key)!.add(keyframeId);
      };

      for (const { ref, layer, keyframe } of resolveKeyframeRefs(prev, refs)) {
        addTarget(ref.layerId, ref.property, ref.keyframeId);
        const sibling = getSiblingProperty(ref.property);
        const siblingKf = layer.tracks
          .find((t) => t.property === sibling)
          ?.keyframes.find((k) => Math.abs(k.time - keyframe.time) < tolerance);
        if (sibling && siblingKf) addTarget(ref.layerId, sibling, siblingKf.id);
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
    setClipboard({
      kind: 'keyframes',
      items: resolved.map(({ track, keyframe }) => ({
        property: track.property,
        time: keyframe.time,
        value: keyframe.value,
        easing: JSON.parse(JSON.stringify(keyframe.easing)),
      })),
    });
    showToast(
      resolved.length === 1 ? 'Fotograma clave copiado' : `${resolved.length} fotogramas clave copiados`,
      'success'
    );
  };

  // Copy every animation of a layer (its whole blue bar)
  const handleCopyLayerAnimation = (layerId: string) => {
    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer || layer.tracks.length === 0) return;
    setClipboard({ kind: 'layer', tracks: JSON.parse(JSON.stringify(layer.tracks)) });
    showToast(`Animación de "${layer.name}" copiada`, 'success');
  };

  // Paste the clipboard onto a layer.
  // Keyframes are pasted starting at the playhead; a layer animation keeps its original timing
  // and replaces the target's animation of the same properties.
  const handlePaste = (layerId: string) => {
    const target = project.layers.find((l) => l.id === layerId);
    if (!clipboard || !target) return;
    recordHistory(project);

    const tolerance = frameTolerance(project.fps);
    const pastedRefs: KeyframeRef[] = [];
    let tracks = [...target.tracks];

    if (clipboard.kind === 'keyframes') {
      const minTime = Math.min(...clipboard.items.map((i) => i.time));
      const maxTime = Math.max(...clipboard.items.map((i) => i.time));
      const offset = Math.max(
        -minTime,
        Math.min(project.duration - maxTime, snapToFrame(currentTime, project.fps) - minTime)
      );

      for (const item of clipboard.items) {
        const time = Number((item.time + offset).toFixed(4));
        const kf = { ...createKeyframe(time, item.value), easing: JSON.parse(JSON.stringify(item.easing)) };
        pastedRefs.push({ layerId, property: item.property, keyframeId: kf.id });

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
          ...createKeyframe(k.time, k.value),
          easing: JSON.parse(JSON.stringify(k.easing)),
        }));
        keyframes.forEach((k) => pastedRefs.push({ layerId, property: source.property, keyframeId: k.id }));
        tracks = [...tracks.filter((t) => t.property !== source.property), { ...source, keyframes }];
      }
    }

    setProject((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, tracks, expanded: true } : l)),
    }));
    setSelectedLayerId(layerId);
    setSelectedKeyframes(pastedRefs);
    showToast(
      clipboard.kind === 'layer' ? `Animación pegada en "${target.name}"` : 'Fotogramas clave pegados',
      'success'
    );
  };

  // Open an SVG as a complete project (animated SVGs bring their tracks to the timeline)
  const handleImportSvg = async (svgText: string, fileName: string) => {
    const title = fileName.replace(/\.svg$/i, '');
    let converted;
    try {
      converted = await convertSvgToProject(svgText, title);
    } catch (err: any) {
      showToast(`No se pudo importar el SVG: ${err?.message || 'formato no válido'}`, 'error');
      return;
    }
    const { project: svgProject, result } = converted;
    if (svgProject.layers.length === 0) {
      showToast('El SVG no contiene formas que se puedan importar', 'warning');
      return;
    }

    const skipped = result.skipped > 0 ? ` · ${result.skipped} elementos no compatibles omitidos` : '';
    handleRequestOpenProject(
      svgProject,
      result.animated
        ? `SVG animado importado: ${svgProject.layers.length} capas, ${svgProject.duration}s${skipped}`
        : `SVG importado: ${svgProject.layers.length} capas${skipped}`
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
      name: `${names[shape]} ${count}`,
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

  // Duplicate Layer
  const handleDuplicateLayer = (layerId: string) => {
    recordHistory(project);

    const layer = project.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const newLayer: Layer = {
      ...JSON.parse(JSON.stringify(layer)),
      id: `layer_${Date.now()}`,
      name: `${layer.name} Copia`,
      properties: {
        ...layer.properties,
        x: layer.properties.x + 20,
        y: layer.properties.y + 20,
      },
    };

    setProject((prev) => ({
      ...prev,
      layers: [...prev.layers, newLayer],
    }));
    setSelectedLayerId(newLayer.id);
  };

  // Delete Layer
  const handleDeleteLayers = (layerIds: string[]) => {
    if (layerIds.length === 0) return;
    recordHistory(project);

    setProject((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => !layerIds.includes(l.id)),
    }));
    const remaining = selectedLayerIds.filter((id) => !layerIds.includes(id));
    handleSelectLayers(remaining, remaining.includes(selectedLayerId ?? '') ? selectedLayerId : (remaining[0] ?? null));
    setSelectedKeyframes((prev) => prev.filter((r) => !layerIds.includes(r.layerId)));
    if (layerIds.length > 1) showToast(`${layerIds.length} capas eliminadas`, 'success');
  };
  const handleDeleteLayer = (layerId: string) => handleDeleteLayers([layerId]);

  // Save Project as JSON
  const handleSaveJson = () => {
    const jsonString = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.nori.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Proyecto descargado: ${a.download}`, 'success');
  };

  // Pending project to switch to (triggers unsaved changes confirmation modal)
  const [pendingProjectToOpen, setPendingProjectToOpen] = useState<{
    project: Project;
    message?: string;
    autoplay?: boolean;
  } | null>(null);

  // Directly apply project loading
  const handleApplyOpenProject = (newProject: Project, message?: string, autoplay = false) => {
    recordHistory(project);
    setProject(newProject);
    setCurrentTime(0);
    if (autoplay) setIsPlaying(true);
    setSelectedLayerId(newProject.layers[0]?.id || null);
    setSelectedKeyframes([]);
    setHistory([]);
    setFuture([]);
    showToast(message || `¡Proyecto cargado: ${newProject.title}!`, 'success');
  };

  // Request to open another project (intercepted with confirmation modal)
  const handleRequestOpenProject = (newProject: Project, message?: string, autoplay = false) => {
    setPendingProjectToOpen({ project: newProject, message, autoplay });
  };

  // Example project: the Nori logo animation shown on the first visit
  const handleOpenExampleProject = () => {
    handleRequestOpenProject(JSON.parse(JSON.stringify(NORI_INTRO_PROJECT)), 'Proyecto de ejemplo abierto', true);
  };

  const handleConfirmOpenWithoutSaving = () => {
    if (pendingProjectToOpen) {
      handleApplyOpenProject(pendingProjectToOpen.project, pendingProjectToOpen.message, pendingProjectToOpen.autoplay);
      setPendingProjectToOpen(null);
    }
  };

  const handleSaveAndConfirmOpen = () => {
    handleSaveJson();
    if (pendingProjectToOpen) {
      handleApplyOpenProject(pendingProjectToOpen.project, pendingProjectToOpen.message, pendingProjectToOpen.autoplay);
      setPendingProjectToOpen(null);
    }
  };

  const handleCancelOpenProject = () => {
    setPendingProjectToOpen(null);
  };

  // New Blank Project Request
  const handleNewBlankProject = () => {
    const blank: Project = {
      id: `project_${Date.now()}`,
      title: 'untitled_motion',
      width: 960,
      height: 540,
      fps: 30,
      duration: 3,
      backgroundColor: '#121316',
      layers: [],
    };
    handleRequestOpenProject(blank, 'Nuevo proyecto en blanco creado');
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
        onNewProject={handleNewBlankProject}
        onSaveJson={handleSaveJson}
        onLoadJson={handleRequestOpenProject}
        onImportSvg={handleImportSvg}
        onOpenPasteSvg={() => setIsPasteSvgOpen(true)}
        onOpenExample={handleOpenExampleProject}
        onRenameProject={(title) => {
          recordHistory(project);
          setProject((prev) => ({ ...prev, title }));
          showToast(`Proyecto renombrado a "${title}"`, 'success');
        }}
        onAddLayer={handleAddLayer}
        onShowToast={showToast}
        onOpenAbout={() => setIsAboutOpen(true)}
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
          vertexEditLayerId={vertexEditLayerId}
          onToggleVertexEdit={handleToggleVertexEdit}
          onExitVertexEdit={() => setVertexEditLayerId(null)}
          activeTool={activeTool}
          zoom={zoom}
          setZoom={setZoom}
          showCheckerboard={showCheckerboard}
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
          vertexEditLayerId={vertexEditLayerId}
          onToggleVertexEdit={handleToggleVertexEdit}
          onUpdateKeyframesEasing={handleUpdateKeyframesEasing}
          onUpdateProjectSettings={(settings, recordUndo = true) => {
            if (recordUndo) recordHistory(project);
            setProject((prev) => ({ ...prev, ...settings }));
          }}
          onDeleteLayer={handleDeleteLayer}
          onDuplicateLayer={handleDuplicateLayer}
          currentTime={currentTime}
        />
      </div>

      {/* 3. Bottom Timeline */}
      <Timeline
        project={project}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onSeek={setCurrentTime}
        selectedLayerId={selectedLayerId}
        selectedLayerIds={selectedLayerIds}
        onSelectLayer={setSelectedLayerId}
        onSelectLayers={handleSelectLayers}
        selectedKeyframes={selectedKeyframes}
        onSelectKeyframes={handleSelectKeyframes}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onToggleLayerLock={handleToggleLayerLock}
        onToggleLayerExpanded={handleToggleLayerExpanded}
        onAddKeyframe={handleAddKeyframe}
        onDeleteKeyframes={handleDeleteKeyframes}
        onMoveKeyframes={handleMoveKeyframes}
        clipboardKind={clipboard?.kind ?? null}
        onCopyKeyframes={handleCopyKeyframes}
        onCopyLayerAnimation={handleCopyLayerAnimation}
        onPaste={handlePaste}
        onStartKeyframeDrag={handleStartDrag}
        onSeekKeyframe={handleSeekKeyframe}
      />

      {/* Modals */}
      <ExportModal
        project={project}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />

      {/* About Nori (Acerca de + Changelog) */}
      <AboutNori isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      <PasteSvgModal
        isOpen={isPasteSvgOpen}
        onClose={() => setIsPasteSvgOpen(false)}
        onImport={(svgText) => handleImportSvg(svgText, 'svg_pegado')}
      />

      {/* Confirmation Modal when switching or opening another project */}
      <ConfirmSwitchProjectModal
        isOpen={pendingProjectToOpen !== null}
        currentProject={project}
        targetProject={pendingProjectToOpen?.project || null}
        onConfirmWithoutSaving={handleConfirmOpenWithoutSaving}
        onSaveAndConfirm={handleSaveAndConfirmOpen}
        onCancel={handleCancelOpenProject}
      />
    </div>
  );
}
