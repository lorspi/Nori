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
  layerLocalToWorld,
  worldToLayerLocal,
} from '../utils/transformHandles';
import {
  HandleSide,
  MirrorMode,
  PathSegment,
  addVertexCurves,
  getLinkedSegments,
  getPathVertices,
  getVertexMirroring,
  getVisibleHandles,
  moveHandle,
  moveVertices,
  parsePath,
  removeVertexCurves,
  serializePath,
  setVertexMirroring,
} from '../utils/pathGeometry';
import {
  Affine,
  affineScale,
  applyAffine,
  getLayer,
  getParentWorldMatrix,
  invertAffine,
  isLayerLocked,
  isLayerShown,
} from '../utils/layerTree';
import { hasBooleanLayers, useBooleanEngine } from '../utils/booleanOps';
import { ToolMode } from './TopBar';
import { X, Question, BezierCurve, LineSegment } from '@phosphor-icons/react';
import { t } from '../i18n';

// Icons of the mirroring options: a vertex with its two handles
const MirrorIcon: React.FC<{ mode: MirrorMode }> = ({ mode }) => {
  // Same handle on the left; the right one is bent, shorter or an exact reflection
  const a = { x: 2.5, y: 10.5 };
  const v = { x: 8, y: 8 };
  const b = mode === 'none' ? { x: 13.5, y: 11.5 } : mode === 'angle' ? { x: 10.75, y: 6.75 } : { x: 13.5, y: 5.5 };
  const diamond = (p: { x: number; y: number }) => `M${p.x} ${p.y - 1.8}L${p.x + 1.8} ${p.y}L${p.x} ${p.y + 1.8}L${p.x - 1.8} ${p.y}Z`;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1">
      <path d={`M${a.x} ${a.y}L${v.x} ${v.y}L${b.x} ${b.y}`} />
      <path d={diamond(a)} />
      <path d={diamond(b)} />
      <circle cx={v.x} cy={v.y} r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
};

const MIRROR_OPTIONS: { mode: MirrorMode; label: string }[] = [
  { mode: 'none', label: 'Sin reflejo' },
  { mode: 'angle', label: 'Reflejar ángulo' },
  { mode: 'angleLength', label: 'Reflejar ángulo y longitud' },
];

// Whether the canvas shortcuts help is shown (remembered per browser)
const HELP_STORAGE_KEY = 'nori-canvas-help-open';
const readHelpOpen = () => {
  try {
    return localStorage.getItem(HELP_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
};

interface CanvasViewProps {
  project: Project;
  currentTime: number;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  // Replace the selection; primaryId is the layer shown in the Inspector
  onSelectLayers: (layerIds: string[], primaryId: string | null) => void;
  onUpdateLayerProperties: (layerId: string, properties: Partial<Layer['properties']>, recordUndo?: boolean) => void;
  onStartDragLayer?: () => void;
  // Alt + drag: copies the layers (above each original) and returns old id -> copy id;
  // the copies are selected and moved instead of the originals
  onDuplicateLayersForDrag?: (layerIds: string[], primaryId: string) => Record<string, string>;
  activeTool: ToolMode;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  showCheckerboard: boolean;
  // Vertex editing of a path layer
  vertexEditLayerId: string | null;
  onToggleVertexEdit: (layerId: string) => void;
  onExitVertexEdit: () => void;
  // Right click: the layer under the cursor is selected first (unless it already is)
  onOpenContextMenu?: (clientX: number, clientY: number) => void;
}

type Point = { x: number; y: number };

// Every canvas interaction is one drag; its data is snapshotted at mouse down
type Drag =
  | { kind: 'pan'; startClient: Point; startPan: Point }
  | {
      kind: 'move';
      startMouse: Point;
      // inverse: canvas → the space each layer lives in (its group's coordinates)
      members: { id: string; x: number; y: number; inverse: Affine }[];
      primaryId: string;
      // Alt was held: the layers are copied once the drag starts (duplicated: already done)
      duplicate: boolean;
      duplicated: boolean;
      // Past the click threshold: it's a drag, not a click
      moved: boolean;
      // Shift / Ctrl + click on a selected layer: the selection without it, applied if it was a click
      deselectOnClick: string[] | null;
    }
  | { kind: 'anchor'; layerId: string }
  | { kind: 'scale'; layerId: string; handle: SelectionHandle; start: LayerProperties }
  | { kind: 'rotate'; layerId: string; start: LayerProperties; startMouse: Point }
  // Several layers of one space: box, handle and mouse are in that space (inverse: canvas → space)
  | { kind: 'groupScale'; members: GroupMember[]; box: Box; handle: SelectionHandle; inverse: Affine }
  | { kind: 'groupRotate'; members: GroupMember[]; box: Box; startMouse: Point; inverse: Affine }
  | { kind: 'marquee'; start: Point; current: Point; base: string[] }
  | { kind: 'vertex'; layerId: string; segments: PathSegment[]; indices: number[]; start: LayerProperties; startLocal: Point }
  // Bézier handle of a vertex; brokeMirror = Alt was held, so the handles stop mirroring
  | {
      kind: 'handle';
      layerId: string;
      segments: PathSegment[];
      vertex: number;
      side: HandleSide;
      start: LayerProperties;
      mode: MirrorMode;
      brokeMirror: boolean;
    }
  // Box selection of vertices; onLayer = it started over the edited shape
  | { kind: 'vertexMarquee'; start: Point; current: Point; base: number[]; onLayer: boolean };

export const CanvasView: React.FC<CanvasViewProps> = ({
  project,
  currentTime,
  selectedLayerId,
  selectedLayerIds,
  onSelectLayers,
  onUpdateLayerProperties,
  onStartDragLayer,
  onDuplicateLayersForDrag,
  activeTool,
  zoom,
  setZoom,
  showCheckerboard,
  vertexEditLayerId,
  onToggleVertexEdit,
  onExitVertexEdit,
  onOpenContextMenu,
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
  // Vertex under the cursor and selected vertices (segment indices) while editing vertices
  const [hoverVertex, setHoverVertex] = useState<number | null>(null);
  const [selectedVertices, setSelectedVertices] = useState<number[]>([]);
  // Bézier handle under the cursor ("vertex:in" / "vertex:out")
  const [hoverHandle, setHoverHandle] = useState<string | null>(null);
  // Mirroring chosen for a vertex; without one it is read from how its handles sit
  const [mirrorOverrides, setMirrorOverrides] = useState<Record<number, MirrorMode>>({});

  // A new vertex editing session starts with nothing selected
  useEffect(() => {
    setSelectedVertices([]);
    setHoverVertex(null);
    setHoverHandle(null);
    setMirrorOverrides({});
  }, [vertexEditLayerId]);

  // Boolean groups are drawn with a stand-in until paper.js arrives; then the canvas redraws
  const booleanEngineReady = useBooleanEngine(hasBooleanLayers(project));

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
      vertexEditLayerId,
      selectedVertices,
      hoverVertex,
      hoverHandle: drag?.kind === 'handle' ? `${drag.vertex}:${drag.side}` : hoverHandle,
    });

    ctx.restore();
  }, [
    project,
    currentTime,
    showCheckerboard,
    selectedLayerId,
    selectedLayerIds,
    zoom,
    vertexEditLayerId,
    hoverVertex,
    selectedVertices,
    hoverHandle,
    drag,
    booleanEngineReady,
  ]);

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
  const [isHelpOpen, setIsHelpOpen] = useState(readHelpOpen);
  const toggleHelp = (open: boolean) => {
    setIsHelpOpen(open);
    try {
      localStorage.setItem(HELP_STORAGE_KEY, open ? '1' : '0');
    } catch {
      // Storage unavailable: the choice just isn't remembered
    }
  };

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

  const layers = project.layers;

  // Shown, and neither the layer nor a group around it is locked
  const isEditable = (layer: Layer) => isLayerShown(layers, layer, currentTime) && !isLayerLocked(layers, layer);

  // A layer is edited in the space it lives in: its group's coordinates (the canvas at the
  // top level). Points are taken there, and the zoom seen from there keeps handle sizes on screen.
  const parentMatrix = (layer: Layer) => getParentWorldMatrix(layers, layer, currentTime);
  const toParentSpace = (layer: Layer, pt: Point): Point => applyAffine(invertAffine(parentMatrix(layer)), pt.x, pt.y);
  const toCanvas = (layer: Layer, pt: Point): Point => applyAffine(parentMatrix(layer), pt.x, pt.y);
  const zoomFor = (layer: Layer) => zoom * affineScale(parentMatrix(layer));
  const inOneSpace = (members: { layer: Layer }[]) => members.every((m) => m.layer.parentId === members[0].layer.parentId);

  // Selected layers that can be transformed right now, with their values at the current time
  const getSelectionMembers = (): GroupMember[] =>
    selectedLayerIds
      .map((id) => getLayer(layers, id))
      .filter((l): l is Layer => !!l && isEditable(l))
      .map((layer) => ({ id: layer.id, layer, start: getLayerPropertiesAtTime(layer, currentTime) }));

  // What a point on the canvas would grab on the current selection (handles, rotation, anchor)
  type SelectionHit =
    | { kind: 'scale'; handle: SelectionHandle; cursor: string }
    | { kind: 'rotate'; cursor: string }
    | { kind: 'anchor'; cursor: string };

  const hitTestSelection = (members: GroupMember[], canvasPt: Point): SelectionHit | null => {
    if (members.length === 1) {
      const { layer, start: p } = members[0];
      const pt = toParentSpace(layer, canvasPt);
      const z = zoomFor(layer);
      const handle = hitTestHandle(getSelectionHandles(layer, p, z), pt.x, pt.y, z);
      if (handle) return { kind: 'scale', handle, cursor: getHandleCursor(handle, p) };
      if (hitTestRotation(getSelectionOutline(layer, p, z), pt.x, pt.y, z)) {
        return { kind: 'rotate', cursor: ROTATE_CURSOR };
      }
      const ax = p.x + (p.anchorX || 0);
      const ay = p.y + (p.anchorY || 0);
      if (Math.hypot(pt.x - ax, pt.y - ay) <= 12 / z) return { kind: 'anchor', cursor: 'crosshair' };
      return null;
    }
    // Several layers only share handles when they live in the same space
    if (members.length > 1 && inOneSpace(members)) {
      const pt = toParentSpace(members[0].layer, canvasPt);
      const z = zoomFor(members[0].layer);
      const box = getGroupBox(members.map((m) => ({ layer: m.layer, props: m.start })));
      const handle = hitTestHandle(getGroupHandles(box, z), pt.x, pt.y, z);
      if (handle) return { kind: 'scale', handle, cursor: getGroupHandleCursor(handle) };
      if (hitTestRotation(getGroupOutline(box, z), pt.x, pt.y, z)) return { kind: 'rotate', cursor: ROTATE_CURSOR };
    }
    return null;
  };

  // Top-most layer of one space (a group's children, or the top level when parentId is undefined)
  const hitTestIn = (parentId: string | undefined, canvasPt: Point): Layer | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.parentId !== parentId || !isEditable(layer)) continue;
      // A plain group is hit where one of its layers is
      if (layer.type === 'group') {
        if (hitTestIn(layer.id, canvasPt)) return layer;
        continue;
      }

      const p = getLayerPropertiesAtTime(layer, currentTime);
      const bounds = getLayerLocalBounds(layer, p);
      // Transform mouse canvas coordinates into layer's local space (position, anchor, rotation, scale)
      const pt = toParentSpace(layer, canvasPt);
      const { x: lx, y: ly } = worldToLayerLocal(p, pt.x, pt.y);
      const sx = p.scaleX !== undefined ? p.scaleX : 1;
      const hitTolerance = 6 / (Math.abs(sx || 1) * zoomFor(layer));
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

  // Top-most layer under the point. A group is picked as a whole; once one of its
  // children is selected, clicks pick among the children first and then the levels around them,
  // so clicking elsewhere leaves the group (as in Figma).
  const hitTestLayer = (pt: Point): Layer | null => {
    let scope = getLayer(layers, getLayer(layers, selectedLayerId)?.parentId);
    while (scope) {
      const hit = hitTestIn(scope.id, pt);
      if (hit) return hit;
      scope = getLayer(layers, scope.parentId);
    }
    return hitTestIn(undefined, pt);
  };

  // Layer being vertex-edited, if it can be edited right now
  const getVertexLayer = () => {
    const layer = getLayer(layers, vertexEditLayerId);
    return layer && layer.type === 'path' && isEditable(layer) ? layer : null;
  };

  // Canvas position of a point in the edited layer's own coordinates
  const vertexToCanvas = (layer: Layer, props: LayerProperties, x: number, y: number) =>
    toCanvas(layer, layerLocalToWorld(props, x, y));

  // Vertex of the edited path under the point (segment index)
  const hitTestVertex = (pt: Point): { layer: Layer; props: LayerProperties; segment: number } | null => {
    const layer = getVertexLayer();
    if (!layer) return null;
    const props = getLayerPropertiesAtTime(layer, currentTime);
    if (!props.pathData) return null;
    const radius = 7 / zoom;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const v of getPathVertices(parsePath(props.pathData))) {
      const w = vertexToCanvas(layer, props, v.x, v.y);
      const d = Math.hypot(pt.x - w.x, pt.y - w.y);
      if (d <= radius && d < bestDist) {
        best = v.segment;
        bestDist = d;
      }
    }
    return best === null ? null : { layer, props, segment: best };
  };

  // Vertices of the edited path inside a canvas rectangle
  const getVerticesInBox = (box: Box): number[] => {
    const layer = getVertexLayer();
    if (!layer) return [];
    const props = getLayerPropertiesAtTime(layer, currentTime);
    if (!props.pathData) return [];
    return getPathVertices(parsePath(props.pathData))
      .filter((v) => {
        const w = vertexToCanvas(layer, props, v.x, v.y);
        return w.x >= box.minX && w.x <= box.maxX && w.y >= box.minY && w.y <= box.maxY;
      })
      .map((v) => v.segment);
  };

  // Segments moved together with the selected vertices (closing points included)
  const getMovedSegments = (segments: PathSegment[], vertices: number[]) => [
    ...new Set(vertices.filter((i) => segments[i]).flatMap((i) => getLinkedSegments(segments, i))),
  ];

  // Selected vertex as listed on the canvas (a shape's closing point counts as its start)
  const isVertexSelected = (segments: PathSegment[], vertex: number) =>
    getLinkedSegments(segments, vertex).some((i) => selectedVertices.includes(i));

  // Bézier handle of a selected vertex under the point, with its distance
  const hitTestBezierHandle = (pt: Point) => {
    const layer = getVertexLayer();
    if (!layer || selectedVertices.length === 0) return null;
    const props = getLayerPropertiesAtTime(layer, currentTime);
    if (!props.pathData) return null;
    const segments = parsePath(props.pathData);
    const radius = 7 / zoom;
    let best: { layer: Layer; props: LayerProperties; vertex: number; side: HandleSide; dist: number } | null = null;
    for (const v of getPathVertices(segments)) {
      if (!isVertexSelected(segments, v.segment)) continue;
      for (const h of getVisibleHandles(segments, v.segment)) {
        const w = vertexToCanvas(layer, props, h.x, h.y);
        const d = Math.hypot(pt.x - w.x, pt.y - w.y);
        if (d <= radius && (!best || d < best.dist)) best = { layer, props, vertex: v.segment, side: h.side, dist: d };
      }
    }
    return best;
  };

  const getMirrorMode = (segments: PathSegment[], vertex: number): MirrorMode =>
    mirrorOverrides[vertex] ?? getVertexMirroring(segments, vertex);

  // Edits the path of the vertex-edited layer as one undo step
  const editVertexPath = (edit: (segments: PathSegment[]) => PathSegment[]) => {
    const layer = getVertexLayer();
    if (!layer) return;
    const props = getLayerPropertiesAtTime(layer, currentTime);
    if (!props.pathData) return;
    const next = serializePath(edit(parsePath(props.pathData)));
    if (next === props.pathData) return;
    onStartDragLayer?.();
    onUpdateLayerProperties(layer.id, { pathData: next }, false);
  };

  // Curves (smooth, mirrored handles) on the given vertices
  const addCurves = (vertices: number[]) => {
    if (vertices.length === 0) return;
    let remap = (i: number) => i;
    editVertexPath((segments) => {
      const result = addVertexCurves(segments, vertices);
      remap = result.remap;
      return result.segments;
    });
    // Writing out a shape's closing line can shift the indices of later segments
    setSelectedVertices((prev) => prev.map(remap));
    setMirrorOverrides((prev) => {
      const next: Record<number, MirrorMode> = {};
      Object.entries(prev).forEach(([k, mode]) => {
        if (!vertices.includes(Number(k))) next[remap(Number(k))] = mode;
      });
      return next;
    });
  };

  const removeCurves = (vertices: number[]) => {
    if (vertices.length === 0) return;
    editVertexPath((segments) => removeVertexCurves(segments, vertices));
    setMirrorOverrides((prev) => {
      const next = { ...prev };
      vertices.forEach((v) => delete next[v]);
      return next;
    });
  };

  const applyMirroring = (mode: MirrorMode) => {
    if (selectedVertices.length === 0) return;
    editVertexPath((segments) => setVertexMirroring(segments, selectedVertices, mode));
    setMirrorOverrides((prev) => {
      const next = { ...prev };
      selectedVertices.forEach((v) => (next[v] = mode));
      return next;
    });
  };

  // State of the vertex toolbar for the current selection
  const vertexToolbar = (() => {
    const layer = getVertexLayer();
    if (!layer) return null;
    const props = getLayerPropertiesAtTime(layer, currentTime);
    if (!props.pathData) return null;
    const segments = parsePath(props.pathData);
    const vertices = selectedVertices.filter((i) => segments[i] && segments[i].cmd !== 'Z');
    const modes = [...new Set(vertices.map((v) => getMirrorMode(segments, v)))];
    return {
      vertices,
      canAdd: vertices.length > 0 && serializePath(addVertexCurves(segments, vertices).segments) !== props.pathData,
      canRemove: vertices.some((v) => getVisibleHandles(segments, v).length > 0),
      mode: modes.length === 1 ? modes[0] : null,
    };
  })();

  // Arrow keys nudge the selected vertices 1 px (Shift: 10 px) on the canvas
  useEffect(() => {
    if (!vertexEditLayerId || selectedVertices.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const dir: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = dir[e.code];
      if (!d) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const layer = getVertexLayer();
      if (!layer) return;
      const props = getLayerPropertiesAtTime(layer, currentTime);
      if (!props.pathData) return;
      // Keep the timeline from stepping frames with the same keys
      e.preventDefault();
      e.stopPropagation();

      const step = e.shiftKey ? 10 : 1;
      // Canvas offset expressed in the layer's own (rotated / scaled) coordinates
      const o = toParentSpace(layer, { x: 0, y: 0 });
      const offset = toParentSpace(layer, { x: d[0] * step, y: d[1] * step });
      const origin = worldToLayerLocal(props, o.x, o.y);
      const target = worldToLayerLocal(props, offset.x, offset.y);
      const segments = parsePath(props.pathData);
      const moved = moveVertices(
        segments,
        getMovedSegments(segments, selectedVertices),
        target.x - origin.x,
        target.y - origin.y
      );
      onStartDragLayer?.(); // one undo step per key press
      onUpdateLayerProperties(layer.id, { pathData: serializePath(moved) }, false);
    };
    // Capture phase: runs before the app's global shortcuts
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  });

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

    // 0. Vertex editing: click a vertex to select it (Shift / Ctrl adds or removes it) and drag
    // to move every selected vertex; drag elsewhere to box-select. A click outside the shape
    // leaves the mode.
    if (vertexEditLayerId && getVertexLayer()) {
      const vertexHit = hitTestVertex(pt);
      // Handles of the selected vertices win over a vertex that is farther from the cursor
      const handleHit = hitTestBezierHandle(pt);
      if (handleHit) {
        const vertexPt = vertexHit
          ? getPathVertices(parsePath(vertexHit.props.pathData!)).find((v) => v.segment === vertexHit.segment)
          : null;
        const vertexWorld = vertexPt ? vertexToCanvas(vertexHit!.layer, vertexHit!.props, vertexPt.x, vertexPt.y) : null;
        const vertexDist = vertexWorld ? Math.hypot(pt.x - vertexWorld.x, pt.y - vertexWorld.y) : Infinity;
        if (handleHit.dist < vertexDist) {
          const segments = parsePath(handleHit.props.pathData!);
          // Alt drags the handle on its own and the vertex stops mirroring
          setDrag({
            kind: 'handle',
            layerId: handleHit.layer.id,
            segments,
            vertex: handleHit.vertex,
            side: handleHit.side,
            start: handleHit.props,
            mode: getMirrorMode(segments, handleHit.vertex),
            brokeMirror: false,
          });
          return;
        }
      }
      if (vertexHit) {
        const isSelected = selectedVertices.includes(vertexHit.segment);
        if (additive && isSelected) {
          setSelectedVertices(selectedVertices.filter((i) => i !== vertexHit.segment));
          return;
        }
        const selection = additive
          ? [...selectedVertices, vertexHit.segment]
          : isSelected
            ? selectedVertices
            : [vertexHit.segment];
        setSelectedVertices(selection);
        const segments = parsePath(vertexHit.props.pathData!);
        const startPt = toParentSpace(vertexHit.layer, pt);
        setDrag({
          kind: 'vertex',
          layerId: vertexHit.layer.id,
          segments,
          indices: getMovedSegments(segments, selection),
          start: vertexHit.props,
          startLocal: worldToLayerLocal(vertexHit.props, startPt.x, startPt.y),
        });
        return;
      }
      const base = additive ? selectedVertices : [];
      if (!additive) setSelectedVertices([]);
      setDrag({ kind: 'vertexMarquee', start: pt, current: pt, base, onLayer: hitTestLayer(pt)?.id === vertexEditLayerId });
      return;
    }
    if (vertexEditLayerId) onExitVertexEdit();

    // 1. Handles, rotation zone or anchor of the current selection
    const members = getSelectionMembers();
    const selectionHit = hitTestSelection(members, pt);
    if (selectionHit) {
      // Everything is computed in the space the selection lives in
      const inverse = invertAffine(parentMatrix(members[0].layer));
      const spacePt = applyAffine(inverse, pt.x, pt.y);
      const box = members.length > 1 ? getGroupBox(members.map((m) => ({ layer: m.layer, props: m.start }))) : null;
      if (selectionHit.kind === 'scale') {
        setDrag(
          box
            ? { kind: 'groupScale', members, box, handle: selectionHit.handle, inverse }
            : { kind: 'scale', layerId: members[0].id, handle: selectionHit.handle, start: members[0].start }
        );
      } else if (selectionHit.kind === 'rotate') {
        setDrag(
          box
            ? { kind: 'groupRotate', members, box, startMouse: spacePt, inverse }
            : { kind: 'rotate', layerId: members[0].id, start: members[0].start, startMouse: spacePt }
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
      // Shift / Ctrl + click toggles the layer in the selection. An unselected layer is added
      // right away; a selected one is removed on release, only if the mouse didn't move, since
      // Shift + drag moves the selection along one axis.
      const ids = isSelected ? selectedLayerIds : additive ? [...selectedLayerIds, hit.id] : [hit.id];
      onSelectLayers(ids, hit.id);
      const moving = ids
        .map((id) => getLayer(layers, id))
        .filter((l): l is Layer => !!l && isEditable(l))
        .map((l) => {
          const p = getLayerPropertiesAtTime(l, currentTime);
          return { id: l.id, x: p.x, y: p.y, inverse: invertAffine(parentMatrix(l)) };
        });
      setDrag({
        kind: 'move',
        startMouse: pt,
        members: moving,
        primaryId: hit.id,
        duplicate: e.altKey && !!onDuplicateLayersForDrag && moving.length > 0,
        duplicated: false,
        moved: false,
        deselectOnClick: additive && isSelected ? selectedLayerIds.filter((id) => id !== hit.id) : null,
      });
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
      // The mouse in the space of the dragged layer (its group's coordinates)
      const draggedLayer = 'layerId' in d ? getLayer(project.layers, d.layerId) : undefined;
      const spacePt = draggedLayer ? toParentSpace(draggedLayer, pt) : pt;

      switch (d.kind) {
        case 'vertex': {
          const local = worldToLayerLocal(d.start, spacePt.x, spacePt.y);
          const moved = moveVertices(d.segments, d.indices, local.x - d.startLocal.x, local.y - d.startLocal.y);
          recordOnce();
          onUpdateLayerProperties(d.layerId, { pathData: serializePath(moved) }, false);
          break;
        }
        case 'handle': {
          if (e.altKey) d.brokeMirror = true;
          const local = worldToLayerLocal(d.start, spacePt.x, spacePt.y);
          const moved = moveHandle(d.segments, d.vertex, d.side, local.x, local.y, d.brokeMirror ? 'none' : d.mode);
          recordOnce();
          onUpdateLayerProperties(d.layerId, { pathData: serializePath(moved) }, false);
          break;
        }
        case 'vertexMarquee': {
          const hits = getVerticesInBox({
            minX: Math.min(d.start.x, pt.x),
            minY: Math.min(d.start.y, pt.y),
            maxX: Math.max(d.start.x, pt.x),
            maxY: Math.max(d.start.y, pt.y),
          });
          setSelectedVertices([...d.base, ...hits.filter((i) => !d.base.includes(i))]);
          setDrag({ ...d, current: pt });
          break;
        }
        case 'move': {
          let dx = pt.x - d.startMouse.x;
          let dy = pt.y - d.startMouse.y;
          // Shift keeps the movement on the axis the cursor has moved the most along
          if (e.shiftKey) {
            if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          // A few pixels of slack so a click (Shift + click, Alt + click) doesn't move anything
          if (!d.moved) {
            if (Math.hypot(pt.x - d.startMouse.x, pt.y - d.startMouse.y) * zoom < 3) break;
            d.moved = true;
          }
          if (d.duplicate && !d.duplicated) {
            recordOnce();
            const copies = onDuplicateLayersForDrag!(d.members.map((m) => m.id), d.primaryId);
            d.members = d.members.map((m) => ({ ...m, id: copies[m.id] ?? m.id }));
            d.duplicated = true;
          }
          recordOnce();
          for (const m of d.members) {
            // The canvas offset, seen from the layer's group
            const from = applyAffine(m.inverse, d.startMouse.x, d.startMouse.y);
            const to = applyAffine(m.inverse, d.startMouse.x + dx, d.startMouse.y + dy);
            onUpdateLayerProperties(m.id, { x: Math.round(m.x + to.x - from.x), y: Math.round(m.y + to.y - from.y) }, false);
          }
          break;
        }
        case 'anchor': {
          if (!draggedLayer) break;
          const p = getLayerPropertiesAtTime(draggedLayer, currentTime);
          recordOnce();
          onUpdateLayerProperties(d.layerId, { anchorX: Math.round(spacePt.x - p.x), anchorY: Math.round(spacePt.y - p.y) }, false);
          break;
        }
        case 'scale': {
          const result = computeHandleScale(d.start, d.handle, spacePt.x, spacePt.y, { free: e.shiftKey, fromAnchor: e.altKey });
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
          onUpdateLayerProperties(d.layerId, { rotation: computeRotation(d.start, d.startMouse, spacePt.x, spacePt.y, e.shiftKey) }, false);
          break;
        }
        case 'groupScale': {
          recordOnce();
          const gp = applyAffine(d.inverse, pt.x, pt.y);
          const updates = computeGroupScale(d.members, d.box, d.handle, gp.x, gp.y, {
            free: e.shiftKey,
            fromCenter: e.altKey,
          });
          updates.forEach((u) => onUpdateLayerProperties(u.id, u.changes, false));
          break;
        }
        case 'groupRotate': {
          recordOnce();
          const gp = applyAffine(d.inverse, pt.x, pt.y);
          const updates = computeGroupRotation(d.members, d.box, d.startMouse, gp.x, gp.y, e.shiftKey);
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
          // Top-level layers only: a boolean group is boxed as a whole
          const hits = project.layers
            .filter(
              (l) =>
                !l.parentId && isEditable(l) && boxesIntersect(rect, getWorldBox(l, getLayerPropertiesAtTime(l, currentTime)))
            )
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
      const d = dragRef.current;
      // A plain click (no box) outside the edited shape leaves vertex editing
      if (
        d?.kind === 'vertexMarquee' &&
        !d.onLayer &&
        d.base.length === 0 &&
        Math.hypot(d.current.x - d.start.x, d.current.y - d.start.y) * zoom < 3
      ) {
        onExitVertexEdit();
      }
      if (d?.kind === 'move' && d.deselectOnClick && !d.moved) {
        onSelectLayers(d.deselectOnClick, d.deselectOnClick[0] ?? null);
      }
      if (d?.kind === 'handle' && d.brokeMirror) {
        setMirrorOverrides((prev) => ({ ...prev, [d.vertex]: 'none' }));
      }
      setDrag(null);
      hasRecordedDragRef.current = false;
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [drag?.kind, project, currentTime, zoom, onStartDragLayer, onUpdateLayerProperties, onSelectLayers, onExitVertexEdit, onDuplicateLayersForDrag]);

  // Hover feedback: resize / rotate / anchor cursors over the selection
  const handleMouseMove = (e: React.MouseEvent) => {
    if (drag || activeTool !== 'select' || isSpacePressed) {
      if (hoverCursor && !drag) setHoverCursor(null);
      return;
    }
    if (vertexEditLayerId) {
      const pt = clientToCanvas(e.clientX, e.clientY);
      const handle = hitTestBezierHandle(pt);
      const segment = handle ? null : (hitTestVertex(pt)?.segment ?? null);
      const handleKey = handle ? `${handle.vertex}:${handle.side}` : null;
      if (segment !== hoverVertex) setHoverVertex(segment);
      if (handleKey !== hoverHandle) setHoverHandle(handleKey);
      const next = segment !== null || handle ? 'move' : null;
      if (next !== hoverCursor) setHoverCursor(next);
      return;
    }
    if (hoverVertex !== null) setHoverVertex(null);
    if (hoverHandle !== null) setHoverHandle(null);
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
      case 'vertex':
      case 'handle':
        return 'move';
      case 'move':
        return drag.duplicate ? 'copy' : 'default';
    }
    return hoverCursor ?? 'default';
  })();

  // Box selection rectangle in container (screen) coordinates
  const marquee =
    drag?.kind === 'marquee' || drag?.kind === 'vertexMarquee'
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
      onDoubleClick={(e) => {
        // Double click on a path (or the edited one) toggles vertex editing; on a vertex it
        // turns it into a curve or back into a corner; on a group it selects the layer under the
        // cursor inside it
        if (activeTool !== 'select' || e.button !== 0) return;
        const pt = clientToCanvas(e.clientX, e.clientY);
        if (hitTestBezierHandle(pt)) return;
        const vertexHit = hitTestVertex(pt);
        if (vertexHit) {
          const segments = parsePath(vertexHit.props.pathData!);
          if (getVisibleHandles(segments, vertexHit.segment).length > 0) removeCurves([vertexHit.segment]);
          else addCurves([vertexHit.segment]);
          return;
        }
        const hit = hitTestLayer(pt);
        if (hit?.type === 'boolean' || hit?.type === 'group') {
          const child = hitTestIn(hit.id, pt);
          if (child) onSelectLayers([child.id], child.id);
          return;
        }
        if (hit?.type === 'path') onToggleVertexEdit(hit.id);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!onOpenContextMenu || drag) return;
        if (activeTool === 'select' && !vertexEditLayerId) {
          const hit = hitTestLayer(clientToCanvas(e.clientX, e.clientY));
          if (hit && !selectedLayerIds.includes(hit.id)) onSelectLayers([hit.id], hit.id);
        }
        onOpenContextMenu(e.clientX, e.clientY);
      }}
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
          {vertexEditLayerId && (
            <>
              <span>·</span>
              <span className="text-bento-blue">{t('Editando vértices (Esc o Enter para salir)')}</span>
            </>
          )}
          {selectedLayerIds.length > 1 && (
            <>
              <span>·</span>
              <span className="text-bento-blue">{t('{count} capas seleccionadas', { count: selectedLayerIds.length })}</span>
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

      {/* Vertex editing tools: Bézier curves and how their handles mirror */}
      {vertexToolbar && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/90 border border-border rounded-lg p-1 backdrop-blur-sm flex items-center gap-1 text-[11px] text-muted-foreground shadow-card animate-tooltip-in"
        >
          <button
            type="button"
            disabled={!vertexToolbar.canAdd}
            onClick={() => addCurves(vertexToolbar.vertices)}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
            data-tooltip={t('Añade tiradores Bézier a los vértices seleccionados\nTambién con doble clic en un vértice')}
          >
            <BezierCurve className="w-3.5 h-3.5" />
            <span>{t('Agregar curva')}</span>
          </button>
          <button
            type="button"
            disabled={!vertexToolbar.canRemove}
            onClick={() => removeCurves(vertexToolbar.vertices)}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent"
            data-tooltip={t('Quita los tiradores Bézier: los vértices vuelven a ser esquinas\nTambién con doble clic en un vértice curvo')}
          >
            <LineSegment className="w-3.5 h-3.5" />
            <span>{t('Quitar curva')}</span>
          </button>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="pl-1 pr-0.5">{t('Reflejo')}</span>
          <div className="flex items-center bg-secondary rounded-md p-0.5 gap-0.5">
            {MIRROR_OPTIONS.map((o) => (
              <button
                key={o.mode}
                type="button"
                disabled={vertexToolbar.vertices.length === 0}
                onClick={() => applyMirroring(o.mode)}
                className={`w-8 h-6 flex items-center justify-center rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default ${
                  vertexToolbar.mode === o.mode && vertexToolbar.vertices.length > 0
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                data-tooltip={o.mode === 'none' ? t('{label}\nAlt + arrastrar un tirador lo mueve por separado', { label: t(o.label) }) : t(o.label)}
                aria-label={t(o.label)}
              >
                <MirrorIcon mode={o.mode} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Navigation Overlay Help (Bottom-Left): closes with X, reopens with ? */}
      {isHelpOpen ? (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute bottom-3 left-3 bg-card/90 border border-border rounded-lg pl-2.5 pr-1 py-1 text-[10px] text-muted-foreground backdrop-blur-sm flex items-center gap-2 font-mono animate-tooltip-in"
        >
          <span>{t('Espacio + Arrastrar: Desplazar')}</span>
          <span>·</span>
          <span>{t('Ctrl + Rueda: Zoom')}</span>
          <span>·</span>
          <span>{t('Shift + Clic: Selección múltiple')}</span>
          <button
            type="button"
            onClick={() => toggleHelp(false)}
            className="p-0.5 rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            data-tooltip={t('Ocultar ayuda')}
            aria-label={t('Ocultar ayuda')}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => toggleHelp(true)}
          className="absolute bottom-3 left-3 w-6 h-6 rounded-lg bg-card/90 border border-border backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer animate-tooltip-in"
          data-tooltip={t('Mostrar atajos del lienzo')}
          aria-label={t('Mostrar atajos del lienzo')}
        >
          <Question className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
