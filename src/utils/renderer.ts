import { Layer, LayerProperties, Project, ShadowEffect } from '../types/animation';
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
import { getLinkedSegments, getPathVertices, getShapePathData, getVisibleHandles, parsePath } from './pathGeometry';
import { getLastBooleanResult, resolveBooleanGroup } from './booleanOps';
import {
  affineScale,
  applyAffine,
  getChildren,
  getLayer,
  getLayerWorldMatrix,
  getParentWorldMatrix,
  isBooleanLayer,
  isContainerLayer,
  isGroupLayer,
  isLayerShown,
  layerMatrix,
  multiplyAffine,
} from './layerTree';

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
  // Bézier handle under the cursor or being dragged ("vertex:in" / "vertex:out")
  hoverHandle?: string | null;
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

// Layer outline in local coordinates (text has none: it is drawn with fillText)
function getLayerPath(layer: Layer, p: LayerProperties): { path: Path2D; fillRule: CanvasFillRule } | null {
  const w = p.width;
  const h = p.height;
  const halfW = w / 2;
  const halfH = h / 2;
  switch (layer.type) {
    case 'rect':
    case 'capsule': {
      const path = new Path2D();
      const r = layer.type === 'capsule' ? Math.min(halfW, halfH) : Math.max(0, Math.min(p.radius || 0, halfW, halfH));
      if (r > 0) path.roundRect(-halfW, -halfH, w, h, r);
      else path.rect(-halfW, -halfH, w, h);
      return { path, fillRule: 'nonzero' };
    }
    case 'ellipse': {
      const path = new Path2D();
      path.ellipse(0, 0, Math.abs(halfW), Math.abs(halfH), 0, 0, Math.PI * 2);
      return { path, fillRule: 'nonzero' };
    }
    case 'polygon':
    case 'star': {
      const d = getShapePathData(layer.type, p);
      return d ? { path: getCachedPath2D(d), fillRule: 'nonzero' } : null;
    }
    case 'path':
      return p.pathData ? { path: getCachedPath2D(p.pathData), fillRule: 'evenodd' } : null;
    case 'boolean':
      // pathData holds the group's result (set by renderLayer)
      return p.pathData ? { path: getCachedPath2D(p.pathData), fillRule: 'nonzero' } : null;
    default:
      return null;
  }
}

const clamp01 = (v: number | undefined, fallback = 1) => Math.max(0, Math.min(1, v ?? fallback));

// A shadow is only drawn when it is on and can be seen
const activeShadow = (s: ShadowEffect | undefined) => (s && s.enabled && s.opacity > 0 ? s : null);

const hasVisibleStroke = (p: LayerProperties) => !!p.stroke && p.stroke !== 'transparent' && p.strokeWidth > 0;

/**
 * Draws the layer's fill and stroke with the context's current transform. alpha multiplies
 * the fill and stroke opacity. Inside / outside strokes are drawn twice as wide and clipped
 * to the inside or the outside of the outline.
 */
function drawLayerContent(ctx: CanvasRenderingContext2D, layer: Layer, p: LayerProperties, alpha: number) {
  const hasFill = !!p.fill && p.fill !== 'transparent';
  const hasStroke = hasVisibleStroke(p);
  if (!hasFill && !hasStroke) return;
  const fillAlpha = alpha * clamp01(p.fillOpacity);
  const strokeAlpha = alpha * clamp01(p.strokeOpacity);

  ctx.fillStyle = p.fill || '#000000';
  ctx.strokeStyle = p.stroke || 'transparent';
  ctx.lineWidth = p.strokeWidth || 1;
  // Basic shapes keep sharp corners; imported paths and text use round joins (as in the SVG export)
  const roundJoins = layer.type === 'path' || layer.type === 'text';
  ctx.lineJoin = roundJoins ? 'round' : 'miter';
  ctx.lineCap = roundJoins ? 'round' : 'butt';

  if (layer.type === 'text') {
    ctx.font = `${p.fontWeight || '700'} ${p.fontSize || 32}px ${p.fontFamily || 'Sen, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (hasFill) {
      ctx.globalAlpha = fillAlpha;
      ctx.fillText(p.text || '', 0, 0);
    }
    if (hasStroke) {
      ctx.globalAlpha = strokeAlpha;
      ctx.strokeText(p.text || '', 0, 0);
    }
    return;
  }

  const shape = getLayerPath(layer, p);
  if (!shape) return;
  if (hasFill && fillAlpha > 0) {
    ctx.globalAlpha = fillAlpha;
    ctx.fill(shape.path, shape.fillRule);
  }
  if (!hasStroke || strokeAlpha <= 0) return;
  ctx.globalAlpha = strokeAlpha;
  const align = p.strokeAlign ?? 'center';
  if (align === 'center') {
    ctx.stroke(shape.path);
    return;
  }
  ctx.save();
  ctx.lineWidth = p.strokeWidth * 2;
  if (align === 'inside') {
    ctx.clip(shape.path, shape.fillRule);
  } else {
    // Everything but the shape: a rectangle around it with the outline as a hole
    const b = getLayerLocalBounds(layer, p);
    const pad = p.strokeWidth * 12 + 10; // room for miter joins
    const outside = new Path2D();
    outside.rect(b.minX - pad, b.minY - pad, b.width + pad * 2, b.height + pad * 2);
    outside.addPath(shape.path);
    ctx.clip(outside, 'evenodd');
  }
  ctx.stroke(shape.path);
  ctx.restore();
}

// Reusable full-size canvases for layers with shadows (one per role)
const scratchCanvases: HTMLCanvasElement[] = [];
function getScratch(index: number, width: number, height: number): CanvasRenderingContext2D {
  let canvas = scratchCanvases[index];
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratchCanvases[index] = canvas;
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

// How far the visible stroke reaches past the outline
const strokeOutset = (p: LayerProperties) => {
  if (!hasVisibleStroke(p)) return 0;
  const align = p.strokeAlign ?? 'center';
  return align === 'outside' ? p.strokeWidth : align === 'center' ? p.strokeWidth / 2 : 0;
};

/**
 * Silhouette of the content for a shadow: the content's alpha, grown (spread > 0) or
 * shrunk (spread < 0) by stroking the outline. Drawn into target with the identity transform.
 */
function drawShadowSilhouette(
  target: CanvasRenderingContext2D,
  content: HTMLCanvasElement,
  layer: Layer,
  p: LayerProperties,
  m: DOMMatrix,
  spread: number
) {
  target.drawImage(content, 0, 0);
  const shape = spread !== 0 ? getLayerPath(layer, p) : null;
  if (!shape) return;
  target.save();
  target.setTransform(m);
  target.lineJoin = 'round';
  target.lineCap = 'round';
  target.strokeStyle = '#000000';
  target.fillStyle = '#000000';
  if (spread > 0) {
    target.lineWidth = (spread + strokeOutset(p)) * 2;
    target.stroke(shape.path);
    target.fill(shape.path, shape.fillRule);
  } else {
    target.globalCompositeOperation = 'destination-out';
    target.lineWidth = -spread * 2;
    target.stroke(shape.path);
  }
  target.restore();
}

/**
 * Layers with a drop or inner shadow are drawn on their own canvas first (in device pixels)
 * and then composited with the layer's opacity and blur: shadow, content, inner shadow on top.
 */
function renderLayerWithShadows(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  p: LayerProperties,
  drop: ShadowEffect | null,
  inner: ShadowEffect | null,
  opacity: number,
  blur: number
) {
  const m = ctx.getTransform();
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  // Offsets are in layer units: they turn and scale with the layer
  const offset = (s: ShadowEffect) => ({ x: m.a * s.x + m.c * s.y, y: m.b * s.x + m.d * s.y });
  const blurFilter = (s: ShadowEffect) => (s.blur > 0 ? `blur(${((s.blur / 2) * scale).toFixed(2)}px)` : 'none');

  const content = getScratch(0, W, H);
  content.setTransform(m);
  drawLayerContent(content, layer, p, 1);

  const group = getScratch(1, W, H);

  if (drop) {
    const sil = getScratch(2, W, H);
    drawShadowSilhouette(sil, content.canvas, layer, p, m, drop.spread);
    sil.globalCompositeOperation = 'source-in';
    sil.globalAlpha = clamp01(drop.opacity);
    sil.fillStyle = drop.color;
    sil.fillRect(0, 0, W, H);
    const o = offset(drop);
    group.filter = blurFilter(drop);
    group.drawImage(sil.canvas, o.x, o.y);
    group.filter = 'none';
  }

  group.drawImage(content.canvas, 0, 0);

  if (inner) {
    // Shadow color everywhere except the shifted, blurred silhouette, kept inside the content
    const sil = getScratch(2, W, H);
    drawShadowSilhouette(sil, content.canvas, layer, p, m, -inner.spread);
    const shade = getScratch(3, W, H);
    shade.globalAlpha = clamp01(inner.opacity);
    shade.fillStyle = inner.color;
    shade.fillRect(0, 0, W, H);
    shade.globalAlpha = 1;
    shade.globalCompositeOperation = 'destination-out';
    const o = offset(inner);
    shade.filter = blurFilter(inner);
    shade.drawImage(sil.canvas, o.x, o.y);
    shade.filter = 'none';
    shade.globalCompositeOperation = 'destination-in';
    shade.drawImage(content.canvas, 0, 0);
    group.drawImage(shade.canvas, 0, 0);
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  if (blur > 0) ctx.filter = `blur(${(blur * scale).toFixed(2)}px)`;
  ctx.drawImage(group.canvas, 0, 0);
  ctx.restore();
}

// Scratch canvases for the boolean fallback (one per nesting level, after the shadow ones)
const SILHOUETTE_SCRATCH = 4;

const COMPOSITE_FOR: Record<NonNullable<Layer['booleanOp']>, GlobalCompositeOperation> = {
  union: 'source-over',
  subtract: 'destination-out',
  intersect: 'destination-in',
  exclude: 'xor',
};

/**
 * Silhouette of a boolean group without its geometric result: each child is filled in black and
 * combined with the canvas composite operation of the group's operation. m is the device matrix of
 * the group's coordinates; the target is a device-sized scratch canvas.
 */
function drawBooleanSilhouette(
  target: CanvasRenderingContext2D,
  layers: Layer[],
  group: Layer,
  time: number,
  m: DOMMatrix,
  depth: number
) {
  const mode = COMPOSITE_FOR[group.booleanOp ?? 'union'];
  const { operands } = resolveBooleanGroup(layers, group, time);
  const W = target.canvas.width;
  const H = target.canvas.height;
  operands.forEach((o, i) => {
    const op = i === 0 ? 'source-over' : mode;
    const om = m.multiply(new DOMMatrix(o.matrix));
    target.save();
    if (o.d === null) {
      // Nested group whose result isn't ready either
      const nested = getScratch(SILHOUETTE_SCRATCH + depth + 1, W, H);
      drawBooleanSilhouette(nested, layers, o.layer, time, om, depth + 1);
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.globalCompositeOperation = op;
      target.drawImage(nested.canvas, 0, 0);
    } else if (o.d) {
      target.setTransform(om);
      target.globalCompositeOperation = op;
      target.fillStyle = '#000000';
      target.fill(getCachedPath2D(o.d), o.fillRule);
    } else if (op === 'destination-in') {
      // Intersecting with an empty shape leaves nothing
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, W, H);
    }
    target.restore();
  });
}

/** Boolean group drawn from its children's silhouettes, painted with the group's fill */
function renderBooleanFallback(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  group: Layer,
  p: LayerProperties,
  time: number,
  opacity: number,
  blur: number
) {
  if (!p.fill || p.fill === 'transparent' || opacity <= 0) return;
  const m = ctx.getTransform();
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const sil = getScratch(SILHOUETTE_SCRATCH, W, H);
  drawBooleanSilhouette(sil, layers, group, time, m, 0);
  sil.setTransform(1, 0, 0, 1, 0, 0);
  sil.globalCompositeOperation = 'source-in';
  sil.globalAlpha = clamp01(p.fillOpacity);
  sil.fillStyle = p.fill;
  sil.fillRect(0, 0, W, H);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  if (blur > 0) ctx.filter = `blur(${(blur * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))).toFixed(2)}px)`;
  ctx.drawImage(sil.canvas, 0, 0);
  ctx.restore();
}

// ── Plain groups ────────────────────────────────────────────────────────────

// Box around a plain group's content in its own coordinates, as last drawn (hit testing and the
// selection box use it between frames)
const groupBoundsCache = new Map<string, BoundingBox>();

/** Box around the layers shown inside a plain group at this time, in the group's coordinates */
export function getGroupContentBounds(layers: Layer[], group: Layer, time: number): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of getChildren(layers, group.id)) {
    if (!child.visible || time < child.inTime || time > child.outTime) continue;
    let p = getLayerPropertiesAtTime(child, time);
    let b: BoundingBox | null;
    if (child.type === 'group') {
      b = getGroupContentBounds(layers, child, time);
    } else {
      if (child.type === 'boolean') {
        const d = resolveBooleanGroup(layers, child, time).d;
        if (d) p = { ...p, pathData: d };
      }
      b = getLayerLocalBounds(child, p);
    }
    if (!b) continue;
    const m = layerMatrix(p);
    for (const [x, y] of [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ]) {
      const w = applyAffine(m, x, y);
      minX = Math.min(minX, w.x);
      minY = Math.min(minY, w.y);
      maxX = Math.max(maxX, w.x);
      maxY = Math.max(maxY, w.y);
    }
  }
  if (minX === Infinity) return null;
  const box = { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  if (groupBoundsCache.size > 500) groupBoundsCache.clear();
  groupBoundsCache.set(group.id, box);
  return box;
}

// Offscreen canvases for groups drawn with opacity or blur, one per nesting level
const groupScratch: HTMLCanvasElement[] = [];
let groupDepth = 0;

/**
 * Draws a plain group's layers one by one with the context's current transform (the group's).
 * With opacity or blur they are drawn together on an offscreen canvas first, so overlapping
 * layers fade as one image instead of showing through each other.
 */
function renderGroupContent(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  group: Layer,
  time: number,
  opacity: number,
  blur: number
) {
  const children = getChildren(layers, group.id);
  if (opacity >= 0.999 && blur <= 0) {
    for (const child of children) renderLayer(ctx, child, time, layers);
    return;
  }
  if (opacity <= 0) return;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  let canvas = groupScratch[groupDepth];
  if (!canvas) {
    canvas = document.createElement('canvas');
    groupScratch[groupDepth] = canvas;
  }
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const sctx = canvas.getContext('2d')!;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'source-over';
  sctx.filter = 'none';
  sctx.clearRect(0, 0, W, H);
  const m = ctx.getTransform();
  sctx.setTransform(m);

  groupDepth++;
  try {
    for (const child of children) renderLayer(sctx, child, time, layers);
  } finally {
    groupDepth--;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  if (blur > 0) ctx.filter = `blur(${(blur * Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))).toFixed(2)}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

/**
 * Renders a single layer to canvas context at time t. layers is the whole project (needed by
 * groups, which are drawn from their children).
 */
export function renderLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  currentTime: number,
  layers: Layer[] = [layer]
) {
  if (!layer.visible) return;
  if (currentTime < layer.inTime || currentTime > layer.outTime) return;

  let p = getLayerPropertiesAtTime(layer, currentTime);
  const boolean = isBooleanLayer(layer) ? resolveBooleanGroup(layers, layer, currentTime) : null;
  if (boolean?.d) p = { ...p, pathData: boolean.d };

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
  const opacity = clamp01(p.opacity);
  // Gaussian blur, measured in layer units like in the SVG export (scales with the layer and zoom)
  const blur = Math.max(0, Number(p.blur) || 0);

  if (isGroupLayer(layer)) {
    getGroupContentBounds(layers, layer, currentTime);
    renderGroupContent(ctx, layers, layer, currentTime, opacity, blur);
    ctx.restore();
    return;
  }

  if (boolean && boolean.d === null) {
    renderBooleanFallback(ctx, layers, layer, p, currentTime, opacity, blur);
    ctx.restore();
    return;
  }

  const drop = activeShadow(p.dropShadow);
  const inner = layer.type === 'text' ? null : activeShadow(p.innerShadow);
  if ((drop || inner) && opacity > 0) {
    renderLayerWithShadows(ctx, layer, p, drop, inner, opacity, blur);
    ctx.restore();
    return;
  }

  if (blur > 0) {
    const m = ctx.getTransform();
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    ctx.filter = `blur(${(blur * scale).toFixed(2)}px)`;
  }
  drawLayerContent(ctx, layer, p, opacity);

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

  // Render layers in forward order (back to front); children are drawn by their group
  for (const layer of project.layers) {
    if (!layer.parentId) renderLayer(ctx, layer, currentTime, project.layers);
  }

  const layers = project.layers;
  const isShown = (l: Layer) => isLayerShown(layers, l, currentTime);
  const zoom = options.zoom || 1;

  // Selection visuals of a layer are drawn in the space it lives in (its group's coordinates),
  // with the zoom corrected so they keep their size on screen
  const inParentSpace = (layer: Layer, draw: (zoom: number) => void) => {
    const m = getParentWorldMatrix(layers, layer, currentTime);
    ctx.save();
    ctx.transform(...m);
    draw(zoom * affineScale(m));
    ctx.restore();
  };

  // Draw selection bounding box if in editor mode
  const multi = (options.selectedLayerIds ?? [])
    .map((id) => getLayer(layers, id))
    .filter((l): l is Layer => !!l && isShown(l));
  const vertexLayer = getLayer(layers, options.vertexEditLayerId);
  const selectedLayer = getLayer(layers, options.selectedLayerId);

  // The shapes that make the selected group (or the siblings of a selected child)
  const outlineGroup = isContainerLayer(selectedLayer) ? selectedLayer : getLayer(layers, selectedLayer?.parentId);
  if (outlineGroup && multi.length <= 1 && isShown(outlineGroup)) {
    if (isBooleanLayer(outlineGroup)) {
      drawBooleanOperandOutlines(ctx, layers, outlineGroup, currentTime, zoom, selectedLayer?.id ?? null);
    } else {
      for (const child of getChildren(layers, outlineGroup.id)) {
        if (child.id === selectedLayer?.id || !isShown(child)) continue;
        inParentSpace(child, (z) => drawLayerOutline(ctx, child, currentTime, z, 0.55));
      }
    }
  }

  if (vertexLayer && isShown(vertexLayer)) {
    inParentSpace(vertexLayer, (z) =>
      drawVertexEditor(
        ctx,
        vertexLayer,
        currentTime,
        z,
        options.selectedVertices ?? [],
        options.hoverVertex ?? null,
        options.hoverHandle ?? null
      )
    );
  } else if (multi.length > 1) {
    // Layers of one space share a box with handles; across groups each one is only outlined
    if (multi.every((l) => l.parentId === multi[0].parentId)) {
      inParentSpace(multi[0], (z) => drawGroupSelection(ctx, multi, currentTime, z));
    } else {
      for (const layer of multi) inParentSpace(layer, (z) => drawLayerOutline(ctx, layer, currentTime, z));
    }
  } else if (selectedLayer && isShown(selectedLayer)) {
    inParentSpace(selectedLayer, (z) => drawSelectionBounds(ctx, selectedLayer, currentTime, z));
  }

  ctx.restore();
}

// Thin outline of a layer's bounds (multi-selection across groups, layers of a selected group)
function drawLayerOutline(ctx: CanvasRenderingContext2D, layer: Layer, currentTime: number, zoom: number, alpha = 1) {
  const corners = getLayerWorldCorners(layer, getLayerPropertiesAtTime(layer, currentTime));
  ctx.save();
  ctx.strokeStyle = alpha < 1 ? `rgba(0, 132, 255, ${alpha})` : '#0084ff';
  ctx.lineWidth = 1 / Math.max(0.001, zoom);
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Outlines of the shapes inside a boolean group, so they can be found while the group is
 * selected (as in Figma). The selected child, if any, is drawn stronger.
 */
function drawBooleanOperandOutlines(
  ctx: CanvasRenderingContext2D,
  layers: Layer[],
  group: Layer,
  currentTime: number,
  zoom: number,
  selectedId: string | null
) {
  const groupMatrix = getLayerWorldMatrix(layers, group, currentTime);
  const { operands } = resolveBooleanGroup(layers, group, currentTime);
  ctx.save();
  for (const o of operands) {
    if (!o.d) continue;
    const m = multiplyAffine(groupMatrix, o.matrix);
    const selected = o.layer.id === selectedId;
    ctx.save();
    ctx.transform(...m);
    ctx.strokeStyle = selected ? '#0084ff' : 'rgba(0, 132, 255, 0.7)';
    // Constant width on screen, whatever the scale of the group and the shape
    ctx.lineWidth = (selected ? 1.5 : 1) / Math.max(0.001, affineScale(m) * zoom);
    ctx.stroke(getCachedPath2D(o.d));
    ctx.restore();
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
  // Boolean groups: bounds of the last result drawn (or of their shapes while there is none)
  if (layer.type === 'boolean') {
    if (p.pathData) return getPathBounds(p.pathData);
    const last = getLastBooleanResult(layer.id);
    if (last) return last.bounds;
  }
  // Plain groups: box around their content as last drawn (the size they had when made until then)
  if (layer.type === 'group') {
    const cached = groupBoundsCache.get(layer.id);
    if (cached) return cached;
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
 * Vertex editing: thin outline of the path plus a square on every vertex. Selected
 * vertices show their Bézier handles (a line and a diamond for each).
 */
function drawVertexEditor(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  currentTime: number,
  zoom: number,
  selectedVertices: number[],
  hoverVertex: number | null,
  hoverHandle: string | null
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

  // Handles of the selected vertices (once per point, even when it closes a shape)
  const handleVertices = getPathVertices(segments).filter((v) => selected.has(v.segment));
  ctx.lineWidth = 1 * invZoom;
  ctx.strokeStyle = '#0084ff';
  for (const v of handleVertices) {
    const w = layerLocalToWorld(p, v.x, v.y);
    for (const h of getVisibleHandles(segments, v.segment)) {
      const hw = layerLocalToWorld(p, h.x, h.y);
      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(hw.x, hw.y);
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1.5 * invZoom;
  for (const v of handleVertices) {
    for (const h of getVisibleHandles(segments, v.segment)) {
      const hw = layerLocalToWorld(p, h.x, h.y);
      const isHovered = hoverHandle === `${v.segment}:${h.side}`;
      const half = (isHovered ? 4.5 : 3.5) * invZoom;
      ctx.beginPath();
      ctx.moveTo(hw.x, hw.y - half);
      ctx.lineTo(hw.x + half, hw.y);
      ctx.lineTo(hw.x, hw.y + half);
      ctx.lineTo(hw.x - half, hw.y);
      ctx.closePath();
      ctx.fillStyle = isHovered ? '#0084ff' : '#ffffff';
      ctx.fill();
      ctx.stroke();
    }
  }

  for (const v of getPathVertices(segments)) {
    const w = layerLocalToWorld(p, v.x, v.y);
    const half = (hovered.has(v.segment) ? 4.5 : 3.5) * invZoom;
    ctx.fillStyle = selected.has(v.segment) ? '#0084ff' : '#ffffff';
    ctx.fillRect(w.x - half, w.y - half, half * 2, half * 2);
    ctx.strokeRect(w.x - half, w.y - half, half * 2, half * 2);
  }
  ctx.restore();
}
