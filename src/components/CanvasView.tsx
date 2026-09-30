import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Project, Layer, LayerProperties } from '../types/animation';
import { renderProjectFrame, getLayerLocalBounds } from '../utils/renderer';
import { getLayerPropertiesAtTime } from '../utils/interpolator';
import {
  Box,
  GroupMember,
  ROTATE_CURSOR,
  SelectionHandle,
  boxesIntersect,
  computeGroupRotation,
  computeGroupScale,
  computeHandleScale,
  computeRotation,
  getGroupBox,
  getGroupHandleCursor,
  getGroupHandles,
  getGroupOutline,
  getHandleCursor,
  getSelectionHandles,
  getSelectionOutline,
  getWorldBox,
  hitTestHandle,
  hitTestRotation,
  worldToLayerLocal,
} from '../utils/transformHandles';
import { ToolMode } from './TopBar';

interface CanvasViewProps {
  project: Project;
  currentTime: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  // Replace the selection; primaryId is the layer shown in the Inspector
  onSelectLayers: (layerIds: string[], primaryId: string | null) => void;
  onUpdateLayerProperties: (layerId: string, properties: Partial<Layer['properties']>, recordUndo?: boolean) => void;
  onStartDragLayer?: () => void;
  activeTool: ToolMode;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  showCheckerboard: boolean;
}

type Point = { x: number; y: number };

// Every canvas interaction is one drag; its data is snapshotted at mouse down
type Drag =
  | { kind: 'pan'; startClient: Point; startPan: Point }
  | { kind: 'move'; startMouse: Point; members: { id: string; x: number; y: number }[] }
  | { kind: 'anchor'; layerId: string }
  | { kind: 'scale'; layerId: string; handle: SelectionHandle; start: LayerProperties }
  | { kind: 'rotate'; layerId: string; start: LayerProperties; startMouse: Point }
  | { kind: 'groupScale'; members: GroupMember[]; box: Box; handle: SelectionHandle }
  | { kind: 'groupRotate'; members: GroupMember[]; box: Box; startMouse: Point }
  | { kind: 'marquee'; start: Point; current: Point; base: string[] };

export const CanvasView: React.FC<CanvasViewProps> = ({
  project,
  currentTime,
  selectedLayerId,
  selectedLayerIds,
  onSelectLayers,
  onUpdateLayerProperties,
  onStartDragLayer,
  activeTool,
  zoom,
  setZoom,
  showCheckerboard,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Refs to allow atomic, non-nested updates between parent zoom (App) and local pan (CanvasView)
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const hasRecordedDragRef = useRef(false);
  const lastMarqueeRef = useRef('');
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);

  // Render canvas whenever inputs change with full device pixel ratio
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use devicePixelRatio to achieve crystal-clear, razor-sharp rendering on Retina/4K displays
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const renderScale = zoom * dpr;

    // Only resize canvas buffer when dimensions or zoom actually change (avoids GPU reallocation on every frame!)
    const targetW = Math.round(project.width * renderScale);
    const targetH = Math.round(project.height * renderScale);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(renderScale, renderScale);

    renderProjectFrame(ctx, project, currentTime, {
      scale: 1,
      transparent: showCheckerboard,
      drawCheckerboard: showCheckerboard,
      backgroundColor: project.backgroundColor,
      selectedLayerId,
      selectedLayerIds,
      zoom,
    });

    ctx.restore();
  }, [project, currentTime, showCheckerboard, selectedLayerId, selectedLayerIds, zoom]);

  useEffect(() => {
    render();
  }, [render]);

  // Center canvas on project load or dimension change
  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth > 0 && clientHeight > 0) {
        const targetW = clientWidth * 0.7;
        const targetH = clientHeight * 0.7;
        const scaleX = targetW / project.width;
        const scaleY = targetH / project.height;
        // Optimal initial zoom for imported projects
        const initialZoom = Math.max(0.5, Math.min(2.5, Number(Math.min(scaleX, scaleY).toFixed(2))));
        if (Math.abs(zoomRef.current - initialZoom) > 0.01) {
          // Defer to next event cycle to prevent setState during child component render phase
          setTimeout(() => {
            setZoom(initialZoom);
          }, 0);
        }
        setPan({
          x: (clientWidth - project.width * initialZoom) / 2,
          y: (clientHeight - project.height * initialZoom) / 2,
        });
      }
    }
  }, [project.id, project.width, project.height, setZoom]);

  // Handle Wheel Zoom and Pan with non-passive listener to prevent browser page zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centered at mouse cursor position (like Figma)
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const nextZoom = Math.max(0.1, Math.min(6, Number((currentZoom * zoomFactor).toFixed(3))));

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const nextPanX = mouseX - (mouseX - currentPan.x) * (nextZoom / currentZoom);
        const nextPanY = mouseY - (mouseY - currentPan.y) * (nextZoom / currentZoom);

        // Update zoom (parent state) and pan (local state) separately, never nested
        setZoom(nextZoom);
        setPan({ x: nextPanX, y: nextPanY });
      } else {
        // Pan canvas
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleNativeWheel);
    };
  }, [setZoom]);

  // Convert client mouse coordinates to canvas coordinates
  const clientToCanvas = (clientX: number, clientY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * project.width,
      y: ((clientY - rect.top) / rect.height) * project.height,
    };
  };

  const [isSpacePressed, setIsSpacePressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ── Hit testing ──────────────────────────────────────────────────────────

  const isEditable = (layer: Layer) =>
    layer.visible && !layer.locked && currentTime >= layer.inTime && currentTime <= layer.outTime;

  // Selected layers that can be transformed right now, with their values at the current time
  const getSelectionMembers = (): GroupMember[] =>
    selectedLayerIds
      .map((id) => project.layers.find((l) => l.id === id))
      .filter((l): l is Layer => !!l && isEditable(l))
      .map((layer) => ({ id: layer.id, layer, start: getLayerPropertiesAtTime(layer, currentTime) }));

  // What a point on the canvas would grab on the current selection (handles, rotation, anchor)
  type SelectionHit =
    | { kind: 'scale'; handle: SelectionHandle; cursor: string }
    | { kind: 'rotate'; cursor: string }
    | { kind: 'anchor'; cursor: string };

  const hitTestSelection = (members: GroupMember[], pt: Point): SelectionHit | null => {
    if (members.length === 1) {
      const { layer, start: p } = members[0];
      const handle = hitTestHandle(getSelectionHandles(layer, p, zoom), pt.x, pt.y, zoom);
      if (handle) return { kind: 'scale', handle, cursor: getHandleCursor(handle, p) };
      if (hitTestRotation(getSelectionOutline(layer, p, zoom), pt.x, pt.y, zoom)) {
        return { kind: 'rotate', cursor: ROTATE_CURSOR };
      }
      const ax = p.x + (p.anchorX || 0);
      const ay = p.y + (p.anchorY || 0);
      if (Math.hypot(pt.x - ax, pt.y - ay) <= 12 / zoom) return { kind: 'anchor', cursor: 'crosshair' };
      return null;
    }
    if (members.length > 1) {
      const box = getGroupBox(members.map((m) => ({ layer: m.layer, props: m.start })));
      const handle = hitTestHandle(getGroupHandles(box, zoom), pt.x, pt.y, zoom);
      if (handle) return { kind: 'scale', handle, cursor: getGroupHandleCursor(handle) };
      if (hitTestRotation(getGroupOutline(box, zoom), pt.x, pt.y, zoom)) return { kind: 'rotate', cursor: ROTATE_CURSOR };
    }
    return null;
  };

  // Top-most layer under the point
  const hitTestLayer = (pt: Point): Layer | null => {
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const layer = project.layers[i];
      if (!isEditable(layer)) continue;

      const p = getLayerPropertiesAtTime(layer, currentTime);
      const bounds = getLayerLocalBounds(layer, p);
      // Transform mouse canvas coordinates into layer's local space (position, anchor, rotation, scale)
      const { x: lx, y: ly } = worldToLayerLocal(p, pt.x, pt.y);
      const sx = p.scaleX !== undefined ? p.scaleX : 1;
      const hitTolerance = 6 / (Math.abs(sx || 1) * zoom);
      if (
        lx >= bounds.minX - hitTolerance &&
        lx <= bounds.maxX + hitTolerance &&
        ly >= bounds.minY - hitTolerance &&
        ly <= bounds.maxY + hitTolerance
      ) {
        return layer;
      }
    }
    return null;
  };

  // ── Mouse down: decide which drag starts ────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click, space pressed, or hand tool triggers canvas pan
    if (e.button === 1 || activeTool === 'hand' || isSpacePressed) {
      setDrag({ kind: 'pan', startClient: { x: e.clientX, y: e.clientY }, startPan: pan });
      return;
    }
    if (e.button !== 0 || activeTool !== 'select') return;

    const pt = clientToCanvas(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    hasRecordedDragRef.current = false;

    // 1. Handles, rotation zone or anchor of the current selection
    const members = getSelectionMembers();
    const selectionHit = hitTestSelection(members, pt);
    if (selectionHit) {
      const box = members.length > 1 ? getGroupBox(members.map((m) => ({ layer: m.layer, props: m.start }))) : null;
      if (selectionHit.kind === 'scale') {
        setDrag(
          box
            ? { kind: 'groupScale', members, box, handle: selectionHit.handle }
            : { kind: 'scale', layerId: members[0].id, handle: selectionHit.handle, start: members[0].start }
        );
      } else if (selectionHit.kind === 'rotate') {
        setDrag(
          box
            ? { kind: 'groupRotate', members, box, startMouse: pt }
            : { kind: 'rotate', layerId: members[0].id, start: members[0].start, startMouse: pt }
        );
      } else {
        setDrag({ kind: 'anchor', layerId: members[0].id });
      }
      return;
    }

    // 2. Layers
    const hit = hitTestLayer(pt);
    if (hit) {
      const isSelected = selectedLayerIds.includes(hit.id);
      if (additive) {
        // Shift / Ctrl + click toggles the layer in the selection
        const ids = isSelected ? selectedLayerIds.filter((id) => id !== hit.id) : [...selectedLayerIds, hit.id];
        onSelectLayers(ids, isSelected ? (ids[0] ?? null) : hit.id);
        return;
      }

      const ids = isSelected ? selectedLayerIds : [hit.id];
      onSelectLayers(ids, hit.id);
      const moving = ids
        .map((id) => project.layers.find((l) => l.id === id))
        .filter((l): l is Layer => !!l && isEditable(l))
        .map((l) => {
          const p = getLayerPropertiesAtTime(l, currentTime);
          return { id: l.id, x: p.x, y: p.y };
        });
      setDrag({ kind: 'move', startMouse: pt, members: moving });
      return;
    }

    // 3. Empty canvas: box selection (Shift / Ctrl adds to the selection)
    const base = additive ? selectedLayerIds : [];
    if (!additive) onSelectLayers([], null);
    lastMarqueeRef.current = base.join('|');
    setDrag({ kind: 'marquee', start: pt, current: pt, base });
  };

  // ── Drag: global listeners keep it smooth even if the cursor leaves the canvas ──

  useEffect(() => {
    if (!drag) return;

    const recordOnce = () => {
      if (!hasRecordedDragRef.current) {
        hasRecordedDragRef.current = true;
        onStartDragLayer?.(); // One undo step for the whole drag
      }
    };

    const handleWindowMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      if (d.kind === 'pan') {
        setPan({ x: d.startPan.x + e.clientX - d.startClient.x, y: d.startPan.y + e.clientY - d.startClient.y });
        return;
      }

      const pt = clientToCanvas(e.clientX, e.clientY);

      switch (d.kind) {
        case 'move': {
          const dx = pt.x - d.startMouse.x;
          const dy = pt.y - d.startMouse.y;
          recordOnce();
          for (const m of d.members) {
            onUpdateLayerProperties(m.id, { x: Math.round(m.x + dx), y: Math.round(m.y + dy) }, false);
          }
          break;
        }
        case 'anchor': {
          const layer = project.layers.find((l) => l.id === d.layerId);
          if (!layer) break;
          const p = getLayerPropertiesAtTime(layer, currentTime);
          recordOnce();
          onUpdateLayerProperties(d.layerId, { anchorX: Math.round(pt.x - p.x), anchorY: Math.round(pt.y - p.y) }, false);
          break;
        }
        case 'scale': {
          const result = computeHandleScale(d.start, d.handle, pt.x, pt.y, { free: e.shiftKey, fromAnchor: e.altKey });
          const changes: Partial<LayerProperties> = { scaleX: result.scaleX, scaleY: result.scaleY };
          // Only touch position when it actually compensates, so it isn't keyframed needlessly
          if (result.x !== d.start.x || result.y !== d.start.y) {
            changes.x = result.x;
            changes.y = result.y;
          }
          recordOnce();
          onUpdateLayerProperties(d.layerId, changes, false);
          break;
        }
        case 'rotate': {
          recordOnce();
          onUpdateLayerProperties(d.layerId, { rotation: computeRotation(d.start, d.startMouse, pt.x, pt.y, e.shiftKey) }, false);
          break;
        }
        case 'groupScale': {
          recordOnce();
          const updates = computeGroupScale(d.members, d.box, d.handle, pt.x, pt.y, {
            free: e.shiftKey,
            fromCenter: e.altKey,
          });
          updates.forEach((u) => onUpdateLayerProperties(u.id, u.changes, false));
          break;
        }
        case 'groupRotate': {
          recordOnce();
          const updates = computeGroupRotation(d.members, d.box, d.startMouse, pt.x, pt.y, e.shiftKey);
          updates.forEach((u) => onUpdateLayerProperties(u.id, u.changes, false));
          break;
        }
        case 'marquee': {
          const rect: Box = {
            minX: Math.min(d.start.x, pt.x),
            minY: Math.min(d.start.y, pt.y),
            maxX: Math.max(d.start.x, pt.x),
            maxY: Math.max(d.start.y, pt.y),
          };
          const hits = project.layers
            .filter((l) => isEditable(l) && boxesIntersect(rect, getWorldBox(l, getLayerPropertiesAtTime(l, currentTime))))
            .map((l) => l.id);
          const ids = [...d.base, ...hits.filter((id) => !d.base.includes(id))];
          const key = ids.join('|');
          if (key !== lastMarqueeRef.current) {
            lastMarqueeRef.current = key;
            onSelectLayers(ids, ids[0] ?? null);
          }
          setDrag({ ...d, current: pt });
          break;
        }
      }
    };

    const handleWindowMouseUp = () => {
      setDrag(null);
      hasRecordedDragRef.current = false;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [drag?.kind, project, currentTime, zoom, onStartDragLayer, onUpdateLayerProperties, onSelectLayers]);

  // Hover feedback: resize / rotate / anchor cursors over the selection
  const handleMouseMove = (e: React.MouseEvent) => {
    if (drag || activeTool !== 'select' || isSpacePressed) {
      if (hoverCursor && !drag) setHoverCursor(null);
      return;
    }
    const hit = hitTestSelection(getSelectionMembers(), clientToCanvas(e.clientX, e.clientY));
    const next = hit?.cursor ?? null;
    if (next !== hoverCursor) setHoverCursor(next);
  };

  // Cursor while dragging or hovering
  const cursor = (() => {
    if (activeTool === 'hand' || isSpacePressed || drag?.kind === 'pan') return drag ? 'grabbing' : 'grab';
    switch (drag?.kind) {
      case 'scale':
        return getHandleCursor(drag.handle, drag.start);
      case 'groupScale':
        return getGroupHandleCursor(drag.handle);
      case 'rotate':
      case 'groupRotate':
        return ROTATE_CURSOR;
      case 'anchor':
        return 'crosshair';
      case 'move':
        return 'default';
    }
    return hoverCursor ?? 'default';
  })();

  // Box selection rectangle in container (screen) coordinates
  const marquee =
    drag?.kind === 'marquee'
      ? {
          left: pan.x + Math.min(drag.start.x, drag.current.x) * zoom,
          top: pan.y + Math.min(drag.start.y, drag.current.y) * zoom,
          width: Math.abs(drag.current.x - drag.start.x) * zoom,
          height: Math.abs(drag.current.y - drag.start.y) * zoom,
        }
      : null;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ cursor }}
      className="relative flex-1 h-full overflow-hidden bg-background select-none"
    >
      {/* Background canvas workspace pattern */}
      <div className="absolute inset-0 workspace-grid pointer-events-none" />

      {/* Canvas container with pan & zoom transform */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          position: 'absolute',
          left: 0,
          top: 0,
        }}
        className="origin-top-left shadow-card-hover transition-transform duration-75 ease-out"
      >
        {/* Dimension indicator badge */}
        <div className="absolute -top-6 left-0 text-[10px] font-mono text-muted-foreground flex items-center gap-2">
          <span>{project.width} × {project.height} px</span>
          <span>·</span>
          <span>{project.title}</span>
          {selectedLayerIds.length > 1 && (
            <>
              <span>·</span>
              <span className="text-bento-blue">{selectedLayerIds.length} capas seleccionadas</span>
            </>
          )}
        </div>

        {/* The Actual Render Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            width: project.width * zoom,
            height: project.height * zoom,
          }}
          className={`block border border-border rounded-sm transition-shadow ${
            showCheckerboard ? 'shadow-card' : 'shadow-card-hover'
          }`}
        />
      </div>

      {marquee && (
        <div
          style={marquee}
          className="absolute border border-bento-blue bg-bento-blue/10 rounded-sm pointer-events-none"
        />
      )}

      {/* Quick Navigation Overlay Help (Bottom-Left) */}
      <div className="absolute bottom-3 left-3 bg-card/90 border border-border rounded-lg px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm pointer-events-none flex items-center gap-2 font-mono">
        <span>Espacio + Arrastrar: Desplazar</span>
        <span>·</span>
        <span>Ctrl + Rueda: Zoom</span>
        <span>·</span>
        <span>Shift + Clic: Selección múltiple</span>
      </div>
    </div>
  );
};
