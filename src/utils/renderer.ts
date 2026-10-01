import { Layer, Project } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';
import {
  getGroupBox,
  getGroupHandles,
  getGroupOutline,
  getLayerWorldCorners,
  getSelectionHandles,
  getSelectionOutline,
  layerLocalToWorld,
} from './transformHandles';
import { getLinkedSegments, getPathVertices, getShapePathData, parsePath } from './pathGeometry';

export interface RenderOptions {
  scale?: number;
  transparent?: boolean;
  backgroundColor?: string;
  drawCheckerboard?: boolean;
  selectedLayerId?: string | null;
  // Multi-selection: when it has more than one layer a group box is drawn instead
  selectedLayerIds?: string[];
  showGuides?: boolean;
  zoom?: number;
  // Path layer whose vertices are being edited (draws its points instead of the selection box)
  vertexEditLayerId?: string | null;
  // Selected vertices and the one under the cursor (segment indices)
  selectedVertices?: number[];
  hoverVertex?: number | null;
}

/**
 * Draws a 16px checkerboard on canvas for transparent backgrounds
 */
export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  size: number = 16
) {
  const cols = Math.ceil(width / size);
  const rows = Math.ceil(height / size);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#1f222b' : '#171920';
      ctx.fillRect(c * size, r * size, size, size);
    }
  }
}

// Cache Path2D objects to eliminate garbage collection and path parsing overhead on every frame
const path2dCache = new Map<string, Path2D>();

export function getCachedPath2D(pathData: string): Path2D {
  let cached = path2dCache.get(pathData);
  if (!cached) {
    // Animated shapes create a new path on every frame: keep the cache bounded
    if (path2dCache.size > 500) path2dCache.clear();
    cached = new Path2D(pathData);
    path2dCache.set(pathData, cached);
  }
  return cached;
}

/**
 * Renders a single layer to canvas context at time t
 */
export function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  currentTime: number
) {
  if (!layer.visible) return;
  if (currentTime < layer.inTime || currentTime > layer.outTime) return;

  const p = getLayerPropertiesAtTime(layer, currentTime);

  ctx.save();

  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;

  // Position & transform relative to anchor point
  ctx.translate(p.x, p.y);
  if (ax !== 0 || ay !== 0) {
    ctx.translate(ax, ay);
    if (p.rotation) {
      ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
    }
    ctx.scale(p.scaleX ?? 1, p.scaleY ?? 1);
    ctx.translate(-ax, -ay);
  } else {
    if (p.rotation) {
      ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
    }
    ctx.scale(p.scaleX ?? 1, p.scaleY ?? 1);
  }
  ctx.globalAlpha = Math.max(0, Math.min(1, p.opacity ?? 1));

  // Gaussian blur, measured in layer units like in the SVG export (scales with the layer and zoom)
  const blur = Math.max(0, Number(p.blur) || 0);
  if (blur > 0) {
    const m = ctx.getTransform();
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    ctx.filter = `blur(${(blur * scale).toFixed(2)}px)`;
  }

  // Style ('transparent' means no fill / no stroke)
  const hasFill = !!p.fill && p.fill !== 'transparent';
  const hasStroke = !!p.stroke && p.stroke !== 'transparent' && p.strokeWidth > 0;
  ctx.fillStyle = p.fill || '#000000';
  ctx.strokeStyle = p.stroke || 'transparent';
  ctx.lineWidth = p.strokeWidth || 1;
  // Basic shapes keep sharp corners; imported paths and text use round joins (as in the SVG export)
  const roundJoins = layer.type === 'path' || layer.type === 'text';
  ctx.lineJoin = roundJoins ? 'round' : 'miter';
  ctx.lineCap = roundJoins ? 'round' : 'butt';

  const paint = (path?: Path2D, fillRule: CanvasFillRule = 'nonzero') => {
    if (path) {
      if (hasFill) ctx.fill(path, fillRule);
      if (hasStroke) ctx.stroke(path);
    } else {
      if (hasFill) ctx.fill(fillRule);
      if (hasStroke) ctx.stroke();
    }
  };

  const w = p.width;
  const h = p.height;
  const halfW = w / 2;
  const halfH = h / 2;

  switch (layer.type) {
    case 'rect':
    case 'capsule': {
      ctx.beginPath();
      const r = layer.type === 'capsule' ? Math.min(halfW, halfH) : Math.max(0, Math.min(p.radius || 0, halfW, halfH));
      if (r > 0) {
        ctx.roundRect(-halfW, -halfH, w, h, r);
      } else {
        ctx.rect(-halfW, -halfH, w, h);
      }
      paint();
      break;
    }

    case 'ellipse': {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.abs(halfW), Math.abs(halfH), 0, 0, Math.PI * 2);
      paint();
      break;
    }

    case 'polygon':
    case 'star': {
      const d = getShapePathData(layer.type, p);
      if (d) paint(getCachedPath2D(d));
      break;
    }

    case 'text': {
      const fontSize = p.fontSize || 32;
      const fontWeight = p.fontWeight || '700';
      const fontFamily = p.fontFamily || 'Sen, sans-serif';
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (hasFill) ctx.fillText(p.text || '', 0, 0);
      if (hasStroke) ctx.strokeText(p.text || '', 0, 0);
      break;
    }

    case 'path': {
      if (p.pathData) paint(getCachedPath2D(p.pathData), 'evenodd');
      break;
    }
  }

  ctx.restore();
}

/**
 * Main project frame renderer
 */
export function renderProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  currentTime: number,
  options: RenderOptions = {}
) {
  const scale = options.scale || 1;
  const width = project.width * scale;
  const height = project.height * scale;

  ctx.save();
  ctx.scale(scale, scale);

  // Always clear first: filling with a transparent background color paints nothing, so the
  // previous frame would stay underneath (smearing when a layer moves)
  ctx.clearRect(0, 0, project.width, project.height);

  // Background handling
  if (options.drawCheckerboard) {
    drawCheckerboard(ctx, project.width, project.height, 16);
  } else if (!options.transparent) {
    ctx.fillStyle = options.backgroundColor || project.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, project.width, project.height);
  }

  // Render layers in forward order (back to front)
  for (const layer of project.layers) {
    renderLayer(ctx, layer, currentTime);
  }

  const isShown = (l: Layer) => l.visible && currentTime >= l.inTime && currentTime <= l.outTime;

  // Draw selection bounding box if in editor mode
  const multi = (options.selectedLayerIds ?? [])
    .map((id) => project.layers.find((l) => l.id === id))
    .filter((l): l is Layer => !!l && isShown(l));
  const vertexLayer = options.vertexEditLayerId
    ? project.layers.find((l) => l.id === options.vertexEditLayerId)
    : undefined;
  if (vertexLayer && isShown(vertexLayer)) {
    drawVertexEditor(ctx, vertexLayer, currentTime, options.zoom || 1, options.selectedVertices ?? [], options.hoverVertex ?? null);
  } else if (multi.length > 1) {
    drawGroupSelection(ctx, multi, currentTime, options.zoom || 1);
  } else if (options.selectedLayerId) {
    const selectedLayer = project.layers.find((l) => l.id === options.selectedLayerId);
    if (selectedLayer && selectedLayer.visible && currentTime >= selectedLayer.inTime && currentTime <= selectedLayer.outTime) {
      drawSelectionBounds(ctx, selectedLayer, currentTime, options.zoom || 1);
    }
  }

  ctx.restore();
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

const pathBoundsCache = new Map<string, BoundingBox>();

/**
 * Calculates the exact mathematical bounding box of an SVG path
 */
export function getPathBounds(pathData: string): BoundingBox {
  if (!pathData) {
    return { minX: -30, minY: -30, maxX: 30, maxY: 30, width: 60, height: 60 };
  }

  const cached = pathBoundsCache.get(pathData);
  if (cached) return cached;

  const numRegex = /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const cmdRegex = /([a-df-z])([^a-df-z]*)/gi;
  let match: RegExpExecArray | null;
  let currX = 0;
  let currY = 0;
  let subpathX = 0;
  let subpathY = 0;
  let hasPoints = false;

  while ((match = cmdRegex.exec(pathData)) !== null) {
    const cmd = match[1];
    const argsStr = match[2];
    const args: number[] = [];
    let n: RegExpExecArray | null;
    while ((n = numRegex.exec(argsStr)) !== null) {
      args.push(parseFloat(n[0]));
    }

    const isRel = cmd === cmd.toLowerCase();
    const type = cmd.toUpperCase();

    if (type === 'Z') {
      // Close path: the current point returns to the start of the subpath
      currX = subpathX;
      currY = subpathY;
    } else if (type === 'M' || type === 'L') {
      for (let i = 0; i < args.length; i += 2) {
        currX = isRel ? currX + args[i] : args[i];
        currY = isRel ? currY + args[i + 1] : args[i + 1];
        if (type === 'M' && i === 0) {
          subpathX = currX;
          subpathY = currY;
        }
        minX = Math.min(minX, currX);
        maxX = Math.max(maxX, currX);
        minY = Math.min(minY, currY);
        maxY = Math.max(maxY, currY);
        hasPoints = true;
      }
    } else if (type === 'H') {
      for (let i = 0; i < args.length; i++) {
        currX = isRel ? currX + args[i] : args[i];
        minX = Math.min(minX, currX);
        maxX = Math.max(maxX, currX);
        hasPoints = true;
      }
    } else if (type === 'V') {
      for (let i = 0; i < args.length; i++) {
        currY = isRel ? currY + args[i] : args[i];
        minY = Math.min(minY, currY);
        maxY = Math.max(maxY, currY);
        hasPoints = true;
      }
    } else if (type === 'C') {
      for (let i = 0; i < args.length; i += 6) {
        const cp1x = isRel ? currX + args[i] : args[i];
        const cp1y = isRel ? currY + args[i + 1] : args[i + 1];
        const cp2x = isRel ? currX + args[i + 2] : args[i + 2];
        const cp2y = isRel ? currY + args[i + 3] : args[i + 3];
        const endX = isRel ? currX + args[i + 4] : args[i + 4];
        const endY = isRel ? currY + args[i + 5] : args[i + 5];

        const getExtrema = (p0: number, p1: number, p2: number, p3: number) => {
          const vals = [p0, p3];
          const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
          const b = 6 * (p0 - 2 * p1 + p2);
          const c = 3 * (p1 - p0);
          if (Math.abs(a) < 1e-7) {
            if (Math.abs(b) > 1e-7) {
              const t = -c / b;
              if (t > 0 && t < 1) {
                vals.push((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3);
              }
            }
          } else {
            const disc = b * b - 4 * a * c;
            if (disc >= 0) {
              const sqrtDisc = Math.sqrt(disc);
              const t1 = (-b + sqrtDisc) / (2 * a);
              const t2 = (-b - sqrtDisc) / (2 * a);
              if (t1 > 0 && t1 < 1) {
                vals.push((1 - t1) ** 3 * p0 + 3 * (1 - t1) ** 2 * t1 * p1 + 3 * (1 - t1) * t1 ** 2 * p2 + t1 ** 3 * p3);
              }
              if (t2 > 0 && t2 < 1) {
                vals.push((1 - t2) ** 3 * p0 + 3 * (1 - t2) ** 2 * t2 * p1 + 3 * (1 - t2) * t2 ** 2 * p2 + t2 ** 3 * p3);
              }
            }
          }
          return vals;
        };

        const xExtrema = getExtrema(currX, cp1x, cp2x, endX);
        const yExtrema = getExtrema(currY, cp1y, cp2y, endY);
        for (const x of xExtrema) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
        for (const y of yExtrema) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        currX = endX;
        currY = endY;
        hasPoints = true;
      }
    } else if (type === 'S' || type === 'Q' || type === 'T' || type === 'A') {
      // Approximate with control and end points (relative to the segment start)
      const step = type === 'A' ? 7 : type === 'T' ? 2 : 4;
      for (let i = 0; i + step <= args.length; i += step) {
        const pts: [number, number][] =
          type === 'A'
            ? [[args[i + 5], args[i + 6]]]
            : type === 'T'
              ? [[args[i], args[i + 1]]]
              : [
                  [args[i], args[i + 1]],
                  [args[i + 2], args[i + 3]],
                ];
        const startX = currX;
        const startY = currY;
        for (const [px, py] of pts) {
          const x = isRel ? startX + px : px;
          const y = isRel ? startY + py : py;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          currX = x;
          currY = y;
        }
        hasPoints = true;
      }
    }
  }

  const result: BoundingBox = !hasPoints
    ? { minX: -30, minY: -30, maxX: 30, maxY: 30, width: 60, height: 60 }
    : {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };

  if (pathBoundsCache.size > 500) pathBoundsCache.clear();
  pathBoundsCache.set(pathData, result);
  return result;
}

/**
 * Returns the untransformed local bounding box of any layer type
 */
export function getLayerLocalBounds(layer: Layer, p: any): BoundingBox {
  if (layer.type === 'path' && p.pathData) {
    return getPathBounds(p.pathData);
  }
  const halfW = (p.width || 60) / 2;
  const halfH = (p.height || 60) / 2;
  return {
    minX: -halfW,
    minY: -halfH,
    maxX: halfW,
    maxY: halfH,
    width: p.width || 60,
    height: p.height || 60,
  };
}

/**
 * Multi-selection: thin outline around each layer plus one axis-aligned group box with handles
 */
function drawGroupSelection(ctx: CanvasRenderingContext2D, layers: Layer[], currentTime: number, zoom: number) {
  const invZoom = 1 / Math.max(0.001, zoom);
  const members = layers.map((layer) => ({ layer, props: getLayerPropertiesAtTime(layer, currentTime) }));

  ctx.save();
  ctx.strokeStyle = '#0084ff';
  ctx.lineWidth = 1 * invZoom;
  for (const m of members) {
    const corners = getLayerWorldCorners(m.layer, m.props);
    ctx.beginPath();
    corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
    ctx.closePath();
    ctx.stroke();
  }

  const box = getGroupBox(members);
  const outline = getGroupOutline(box, zoom);
  ctx.beginPath();
  outline.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.lineWidth = 1.5 * invZoom;
  ctx.setLineDash([4 * invZoom, 4 * invZoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#ffffff';
  for (const h of getGroupHandles(box, zoom)) {
    const half = (h.isCorner ? 3.5 : 3) * invZoom;
    ctx.fillRect(h.world.x - half, h.world.y - half, half * 2, half * 2);
    ctx.strokeRect(h.world.x - half, h.world.y - half, half * 2, half * 2);
  }
  ctx.restore();
}

/**
 * Draws active selection box, rotate handles, and center pivot
 * Bounding box stroke, corner handles, and anchor point maintain standard constant screen size regardless of canvas zoom
 */
function drawSelectionBounds(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  currentTime: number,
  zoom: number = 1
) {
  const p = getLayerPropertiesAtTime(layer, currentTime);

  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;

  // invZoom scales canvas units so selection visuals maintain a fixed screen pixel size
  const invZoom = 1 / Math.max(0.001, zoom);
  const handles = getSelectionHandles(layer, p, zoom);
  const outline = getSelectionOutline(layer, p, zoom);
  const rot = ((p.rotation || 0) * Math.PI) / 180;

  ctx.save();

  // 1. Blue dashed outline matching exact visual bounds (standard 1.5px screen width and 4px dash)
  ctx.beginPath();
  outline.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();

  ctx.strokeStyle = '#0084ff';
  ctx.lineWidth = 1.5 * invZoom;
  ctx.setLineDash([4 * invZoom, 4 * invZoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Resize handles: corners (proportional) and edge midpoints (one dimension),
  // standard 7x7 CSS pixels regardless of canvas zoom or layer scale
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0084ff';
  ctx.lineWidth = 1.5 * invZoom;

  for (const h of handles) {
    const half = (h.isCorner ? 3.5 : 3) * invZoom;
    ctx.save();
    ctx.translate(h.world.x, h.world.y);
    if (rot !== 0) {
      ctx.rotate(rot);
    }
    ctx.fillRect(-half, -half, half * 2, half * 2);
    ctx.strokeRect(-half, -half, half * 2, half * 2);
    ctx.restore();
  }

  // 3. Anchor point (Punto de Anclaje) gizmo at (p.x + ax, p.y + ay) (standard screen size)
  const worldAx = p.x + ax;
  const worldAy = p.y + ay;

  // Crosshair targeting guide
  const crossLen = 9 * invZoom;
  ctx.beginPath();
  ctx.moveTo(worldAx - crossLen, worldAy);
  ctx.lineTo(worldAx + crossLen, worldAy);
  ctx.moveTo(worldAx, worldAy - crossLen);
  ctx.lineTo(worldAx, worldAy + crossLen);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5 * invZoom;
  ctx.stroke();

  // Outer ring
  ctx.beginPath();
  ctx.arc(worldAx, worldAy, 6.5 * invZoom, 0, Math.PI * 2);
  ctx.strokeStyle = '#0084ff';
  ctx.lineWidth = 1.5 * invZoom;
  ctx.stroke();

  // Solid center dot (distinct blue circle)
  ctx.beginPath();
  ctx.arc(worldAx, worldAy, 3.5 * invZoom, 0, Math.PI * 2);
  ctx.fillStyle = '#0084ff';
  ctx.fill();

  ctx.restore();
}

/**
 * Vertex editing: thin outline of the path plus a square on every vertex
 */
function drawVertexEditor(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  currentTime: number,
  zoom: number,
  selectedVertices: number[],
  hoverVertex: number | null
) {
  const p = getLayerPropertiesAtTime(layer, currentTime);
  if (!p.pathData) return;
  const invZoom = 1 / Math.max(0.001, zoom);
  const segments = parsePath(p.pathData);
  // A vertex shared by the start and the end of a closed subpath counts as one
  const linked = (list: number[]) =>
    new Set(list.filter((i) => segments[i] && segments[i].cmd !== 'Z').flatMap((i) => getLinkedSegments(segments, i)));
  const selected = linked(selectedVertices);
  const hovered = linked(hoverVertex !== null ? [hoverVertex] : []);

  ctx.save();
  // Outline in layer space, with a constant on-screen width
  ctx.save();
  const det = (t: DOMMatrix) => Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
  const worldScale = det(ctx.getTransform());
  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;
  ctx.translate(p.x + ax, p.y + ay);
  ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
  ctx.scale(p.scaleX ?? 1, p.scaleY ?? 1);
  ctx.translate(-ax, -ay);
  const layerScale = det(ctx.getTransform()) / worldScale;
  ctx.strokeStyle = '#0084ff';
  ctx.lineWidth = (1.5 * invZoom) / layerScale;
  ctx.stroke(getCachedPath2D(p.pathData));
  ctx.restore();

  ctx.lineWidth = 1.5 * invZoom;
  ctx.strokeStyle = '#0084ff';
  for (const v of getPathVertices(segments)) {
    const w = layerLocalToWorld(p, v.x, v.y);
    const half = (hovered.has(v.segment) ? 4.5 : 3.5) * invZoom;
    ctx.fillStyle = selected.has(v.segment) ? '#0084ff' : '#ffffff';
    ctx.fillRect(w.x - half, w.y - half, half * 2, half * 2);
    ctx.strokeRect(w.x - half, w.y - half, half * 2, half * 2);
  }
  ctx.restore();
}
