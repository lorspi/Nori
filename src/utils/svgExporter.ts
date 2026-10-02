import { Layer, LayerProperties, Project, SvgBooleanMode } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';
import { getShapePathData } from './pathGeometry';
import { BoundingBox, getLayerLocalBounds, getPathBounds } from './renderer';
import { BooleanResult, canBeBooleanOperand, operandsBounds, resolveBooleanGroup } from './booleanOps';
import { getChildren } from './layerTree';

export interface SvgExportOptions {
  transparent?: boolean;
  backgroundColor?: string;
  fps?: number;
  // Boolean groups whose shapes move against each other (see SvgBooleanMode)
  booleanMode?: SvgBooleanMode;
}

interface ExportContext {
  project: Project;
  durationSec: number;
  // CSS keyframes per animation
  samples: number;
  fps: number;
  booleanMode: SvgBooleanMode;
  styles: string[];
  // Clip paths, masks and filters used by the layers
  defs: string[];
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, '_');

const hasVisibleStroke = (p: LayerProperties) => !!p.stroke && p.stroke !== 'transparent' && p.strokeWidth > 0;

const sampleTimes = (ctx: ExportContext, count = ctx.samples) =>
  Array.from({ length: count + 1 }, (_, s) => (s / count) * ctx.durationSec);

// Transform of a layer as drawn on the canvas: position + anchor + R·S·(local − anchor)
function transformCss(p: LayerProperties) {
  const ax = p.anchorX || 0;
  const ay = p.anchorY || 0;
  const sx = p.scaleX !== undefined ? p.scaleX : 1;
  const sy = p.scaleY !== undefined ? p.scaleY : 1;
  const rot = p.rotation || 0;
  const pivot = ax !== 0 || ay !== 0 ? ` translate(${(-ax).toFixed(1)}px, ${(-ay).toFixed(1)}px)` : '';
  return `translate(${(p.x + ax).toFixed(1)}px, ${(p.y + ay).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})${pivot}`;
}

/**
 * CSS animation of a layer's transform and opacity (and blur and vertex morphing when it uses
 * them). Shapes inside a boolean group (paint = false) only animate their transform and appear
 * or disappear with their time range: their opacity and blur don't apply.
 * Returns whether the path morphs (its class is `${animName}_d`).
 */
function addLayerAnimation(ctx: ExportContext, layer: Layer, animName: string, paint: boolean): boolean {
  // Blur and vertex animation are only written when the layer uses them
  const hasBlur = paint && ((layer.properties.blur ?? 0) > 0 || layer.tracks.some((t) => t.property === 'blur'));
  const morphs = layer.type === 'path' && layer.tracks.some((t) => t.property === 'pathData' && t.keyframes.length > 1);
  let keyframeCss = `@keyframes ${animName} {\n`;
  let morphCss = morphs ? `@keyframes ${animName}_d {\n` : '';

  for (const t of sampleTimes(ctx)) {
    const percentage = ((t / ctx.durationSec) * 100).toFixed(1);

    // Check inTime and outTime
    if (t < layer.inTime || t > layer.outTime) {
      keyframeCss += `  ${percentage}% { opacity: 0; transform: none; }\n`;
      continue;
    }

    const p = getLayerPropertiesAtTime(layer, t);
    const op = paint ? (p.opacity !== undefined ? p.opacity : 1) : 1;
    const blurCss = hasBlur ? `\n    filter: blur(${Math.max(0, Number(p.blur) || 0).toFixed(2)}px);` : '';
    keyframeCss += `  ${percentage}% {
    opacity: ${op.toFixed(3)};
    transform: ${transformCss(p)};${blurCss}
  }\n`;
    if (morphs && p.pathData) morphCss += `  ${percentage}% { d: path("${p.pathData}"); }\n`;
  }

  keyframeCss += `}\n`;
  ctx.styles.push(keyframeCss);
  if (morphs) {
    ctx.styles.push(`${morphCss}}\n.${animName}_d { animation: ${animName}_d ${ctx.durationSec}s infinite linear; }\n`);
  }

  // Layer class styling - transform-origin: 0px 0px perfectly preserves translation and pivot
  ctx.styles.push(`
      .${animName} {
        animation: ${animName} ${ctx.durationSec}s infinite linear;
        transform-origin: 0px 0px;
      }
    `);
  return morphs;
}

// The geometry of a shape layer at its first frame, with the given paint attributes
function shapeMarkup(layer: Layer, p0: LayerProperties, attrs: string, morphClass?: string): string {
  if (layer.type === 'rect' || layer.type === 'capsule') {
    const r = layer.type === 'capsule'
      ? Math.min(p0.width, p0.height) / 2
      : Math.max(0, Math.min(p0.radius || 0, p0.width / 2, p0.height / 2));
    return `<rect x="${-p0.width / 2}" y="${-p0.height / 2}" width="${p0.width}" height="${p0.height}"${r > 0 ? ` rx="${r}"` : ''} ${attrs} />`;
  }
  if (layer.type === 'ellipse') {
    return `<ellipse cx="0" cy="0" rx="${p0.width / 2}" ry="${p0.height / 2}" ${attrs} />`;
  }
  if (layer.type === 'polygon' || layer.type === 'star') {
    return `<path d="${getShapePathData(layer.type, p0)}" ${attrs} />`;
  }
  if (layer.type === 'text') {
    return `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" ${attrs} font-size="${p0.fontSize || 32}" font-weight="${p0.fontWeight || 'bold'}" font-family="${p0.fontFamily || 'Sen, sans-serif'}">${p0.text || ''}</text>`;
  }
  if (layer.type === 'path' && p0.pathData) {
    return `<path d="${p0.pathData}"${morphClass ? ` class="${morphClass}"` : ''} fill-rule="evenodd" clip-rule="evenodd" ${attrs} />`;
  }
  return '';
}

/**
 * Fill and stroke of a layer: shape(attrs) draws its geometry. Inside / outside strokes are twice
 * as wide, clipped to the inside or masked to the outside.
 */
function paintContent(
  ctx: ExportContext,
  layer: Layer,
  p0: LayerProperties,
  uid: string,
  shape: (attrs: string) => string,
  bounds: BoundingBox
): string {
  const hasFill = !!p0.fill && p0.fill !== 'transparent';
  const hasStroke = hasVisibleStroke(p0);
  const roundJoins = layer.type === 'path' || layer.type === 'text';
  const fillOpacity = Math.max(0, Math.min(1, p0.fillOpacity ?? 1));
  const strokeOpacity = Math.max(0, Math.min(1, p0.strokeOpacity ?? 1));
  const align = layer.type === 'text' ? 'center' : (p0.strokeAlign ?? 'center');
  const strokeAttr = (width: number) =>
    `stroke="${p0.stroke}" stroke-width="${width}"${strokeOpacity < 1 ? ` stroke-opacity="${strokeOpacity}"` : ''}${
      roundJoins ? ' stroke-linecap="round" stroke-linejoin="round"' : ''
    }`;
  const fillAttr = hasFill
    ? `fill="${p0.fill}"${fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : ''}`
    : 'fill="none"';

  if (!hasStroke || align === 'center') {
    return shape(`${fillAttr} ${layer.type === 'text' || !hasStroke ? '' : strokeAttr(p0.strokeWidth)}`);
  }
  let content = hasFill ? shape(fillAttr) : '';
  if (align === 'inside') {
    ctx.defs.push(`<clipPath id="clip_${uid}">${shape('')}</clipPath>`);
    content += shape(`fill="none" ${strokeAttr(p0.strokeWidth * 2)} clip-path="url(#clip_${uid})"`);
  } else {
    const pad = p0.strokeWidth * 12 + 10;
    const box = `x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}"`;
    ctx.defs.push(
      `<mask id="mask_${uid}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#ffffff" />${shape('fill="#000000"')}</mask>`
    );
    content += shape(`fill="none" ${strokeAttr(p0.strokeWidth * 2)} mask="url(#mask_${uid})"`);
  }
  return content;
}

/**
 * Drop and inner shadows as an SVG filter around the content (same model as the canvas
 * renderer). extraPad: room for shapes that leave their first-frame bounds.
 */
function wrapShadows(
  ctx: ExportContext,
  layer: Layer,
  p0: LayerProperties,
  uid: string,
  content: string,
  bounds: BoundingBox,
  extraPad: number
): string {
  const drop = p0.dropShadow?.enabled && p0.dropShadow.opacity > 0 ? p0.dropShadow : null;
  const inner = layer.type !== 'text' && p0.innerShadow?.enabled && p0.innerShadow.opacity > 0 ? p0.innerShadow : null;
  if (!content || (!drop && !inner)) return content;
  const reach = Math.max(
    ...[drop, inner].filter((s) => !!s).map((s) => Math.abs(s!.x) + Math.abs(s!.y) + Math.abs(s!.spread) + s!.blur * 1.5)
  );
  const pad = reach + p0.strokeWidth * 2 + 10 + extraPad;
  let primitives = '';
  const merge: string[] = [];
  if (drop) {
    let src = 'SourceAlpha';
    if (drop.spread !== 0) {
      primitives += `<feMorphology in="SourceAlpha" operator="${drop.spread > 0 ? 'dilate' : 'erode'}" radius="${Math.abs(drop.spread)}" result="dropSpread" />`;
      src = 'dropSpread';
    }
    primitives +=
      `<feOffset in="${src}" dx="${drop.x}" dy="${drop.y}" result="dropOffset" />` +
      `<feGaussianBlur in="dropOffset" stdDeviation="${drop.blur / 2}" result="dropBlur" />` +
      `<feFlood flood-color="${drop.color}" flood-opacity="${drop.opacity}" result="dropColor" />` +
      `<feComposite in="dropColor" in2="dropBlur" operator="in" result="drop" />`;
    merge.push('drop');
  }
  merge.push('SourceGraphic');
  if (inner) {
    let src = 'SourceAlpha';
    if (inner.spread > 0) {
      primitives += `<feMorphology in="SourceAlpha" operator="erode" radius="${inner.spread}" result="innerSpread" />`;
      src = 'innerSpread';
    } else if (inner.spread < 0) {
      primitives += `<feMorphology in="SourceAlpha" operator="dilate" radius="${-inner.spread}" result="innerSpread" />`;
      src = 'innerSpread';
    }
    primitives +=
      `<feOffset in="${src}" dx="${inner.x}" dy="${inner.y}" result="innerOffset" />` +
      `<feGaussianBlur in="innerOffset" stdDeviation="${inner.blur / 2}" result="innerBlur" />` +
      `<feComposite in="SourceAlpha" in2="innerBlur" operator="out" result="innerArea" />` +
      `<feFlood flood-color="${inner.color}" flood-opacity="${inner.opacity}" result="innerColor" />` +
      `<feComposite in="innerColor" in2="innerArea" operator="in" result="inner" />`;
    merge.push('inner');
  }
  ctx.defs.push(
    `<filter id="fx_${uid}" filterUnits="userSpaceOnUse" x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" color-interpolation-filters="sRGB">${primitives}<feMerge>${merge
      .map((m) => `<feMergeNode in="${m}" />`)
      .join('')}</feMerge></filter>`
  );
  return `<g filter="url(#fx_${uid})">${content}</g>`;
}

// ── Boolean groups ──────────────────────────────────────────────────────────

const unionBounds = (boxes: (BoundingBox | null | undefined)[]): BoundingBox | null => {
  const list = boxes.filter((b): b is BoundingBox => !!b);
  if (list.length === 0) return null;
  const minX = Math.min(...list.map((b) => b.minX));
  const minY = Math.min(...list.map((b) => b.minY));
  const maxX = Math.max(...list.map((b) => b.maxX));
  const maxY = Math.max(...list.map((b) => b.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

const EMPTY_PATH = 'M0 0';

/**
 * A boolean group, exported in the lightest form that still looks the same:
 * - its shapes don't move against each other: one <path> (the group's own animation still applies)
 * - 'flatten': one <path> whose outline changes with SMIL (<animate> on d works in every browser,
 *   unlike the CSS d property): interpolated while the outline keeps its structure, frame by
 *   frame otherwise
 * - 'masks': the shapes themselves, animated, combined with SVG masks (the stroke of the result
 *   is approximated where the shapes cross)
 */
function exportBooleanGroup(ctx: ExportContext, group: Layer, uid: string): string {
  const layers = ctx.project.layers;
  const p0 = getLayerPropertiesAtTime(group, 0);
  const times = sampleTimes(ctx);
  const results = times.map((t) => resolveBooleanGroup(layers, group, t));
  const outlines = results.map((r) => r.d);
  const ready = outlines.every((d) => d !== null);

  if (ready && outlines.every((d) => d === outlines[0])) {
    const d = outlines[0]!;
    if (!d) return '';
    const bounds = getPathBounds(d);
    const content = paintContent(ctx, group, p0, uid, (attrs) => `<path d="${d}" ${attrs} />`, bounds);
    return wrapShadows(ctx, group, p0, uid, content, bounds, 0);
  }

  const wanted = ctx.booleanMode === 'auto' ? (hasVisibleStroke(p0) ? 'flatten' : 'masks') : ctx.booleanMode;
  if (wanted === 'flatten' && outlines.some((d) => d !== null)) return exportFlattenedGroup(ctx, group, p0, uid, outlines);
  return exportMaskedGroup(ctx, group, p0, uid, results);
}

// Missing outlines (failed frames) take the closest earlier one
function fillGaps(outlines: (string | null)[]): string[] {
  const first = outlines.find((d) => d !== null) ?? '';
  let last = first;
  return outlines.map((d) => (d === null ? last : (last = d)));
}

const pathStructure = (d: string) => d.replace(/[^a-zA-Z]/g, '');

function exportFlattenedGroup(
  ctx: ExportContext,
  group: Layer,
  p0: LayerProperties,
  uid: string,
  sampled: (string | null)[]
): string {
  const layers = ctx.project.layers;
  let values = fillGaps(sampled);
  let keyTimes = values.map((_, i) => i / (values.length - 1));
  // Outlines with the same commands morph smoothly; otherwise they change frame by frame
  const smooth = values.every((d) => d && pathStructure(d) === pathStructure(values[0]));
  if (!smooth) {
    const frames = Math.max(ctx.samples, Math.min(600, Math.round(ctx.durationSec * ctx.fps)));
    const dense = fillGaps(sampleTimes(ctx, frames).map((t) => resolveBooleanGroup(layers, group, t).d));
    values = [];
    keyTimes = [];
    dense.forEach((d, i) => {
      // Only the changes are written: the previous outline holds until then
      if (i > 0 && d === dense[i - 1]) return;
      values.push(d);
      keyTimes.push(i / frames);
    });
  }
  const shown = values.map((d) => d || EMPTY_PATH);
  const animate = `<animate attributeName="d" dur="${ctx.durationSec}s" repeatCount="indefinite" calcMode="${
    smooth ? 'linear' : 'discrete'
  }" keyTimes="${keyTimes.map((k) => Number(k.toFixed(5))).join(';')}" values="${shown.join(';')}" />`;
  const bounds = unionBounds(values.filter((d) => d).map((d) => getPathBounds(d))) ?? getLayerLocalBounds(group, p0);
  const content = paintContent(ctx, group, p0, uid, (attrs) => `<path d="${shown[0]}" ${attrs}>${animate}</path>`, bounds);
  return wrapShadows(ctx, group, p0, uid, content, bounds, 0);
}

function exportMaskedGroup(ctx: ExportContext, group: Layer, p0: LayerProperties, uid: string, results: BooleanResult[]): string {
  const layers = ctx.project.layers;
  let count = 0;
  const nextId = (prefix: string) => `${prefix}_${uid}_${count++}`;
  const animClasses = new Map<string, { name: string; morphs: boolean }>();
  const regions = new Map<string, { box: BoundingBox; attr: string }>();
  const regionMasks = new Map<string, string>();
  const childMasks = new Map<string, string>();
  const strokeWidth = hasVisibleStroke(p0) ? p0.strokeWidth : 0;

  // Shapes of a group, back to front (their time range is handled by their animation)
  const operandsOf = (g: Layer) => getChildren(layers, g.id).filter((c) => c.visible && canBeBooleanOperand(c));

  // Animation class of a shape inside the group
  const animOf = (layer: Layer) => {
    let entry = animClasses.get(layer.id);
    if (!entry) {
      const name = nextId('anim');
      entry = { name, morphs: addLayerAnimation(ctx, layer, name, false) };
      animClasses.set(layer.id, entry);
    }
    return entry;
  };

  // Area a group's masks cover, in its coordinates: its shapes over the whole animation
  const regionOf = (g: Layer) => {
    let region = regions.get(g.id);
    if (!region) {
      const sampled = g === group ? results : sampleTimes(ctx).map((t) => resolveBooleanGroup(layers, g, t));
      const box = unionBounds(sampled.map((r) => operandsBounds(r.operands))) ?? getLayerLocalBounds(g, p0);
      const pad = 10 + strokeWidth * 4 + Math.max(box.width, box.height) * 0.02;
      const padded = { ...box, minX: box.minX - pad, minY: box.minY - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
      region = {
        box: { ...padded, maxX: padded.minX + padded.width, maxY: padded.minY + padded.height },
        attr: `x="${padded.minX.toFixed(2)}" y="${padded.minY.toFixed(2)}" width="${padded.width.toFixed(2)}" height="${padded.height.toFixed(2)}"`,
      };
      regions.set(g.id, region);
    }
    return region;
  };

  const defineMask = (content: string, region: string) => {
    const id = nextId('bm');
    ctx.defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" ${region}>${content}</mask>`);
    return id;
  };
  const fillRegion = (maskId: string, region: string, paint: string) =>
    `<g mask="url(#${maskId})"><rect ${region} ${paint} /></g>`;
  const notMask = (maskId: string, region: string) =>
    defineMask(`<rect ${region} fill="#ffffff" />${fillRegion(maskId, region, 'fill="#000000"')}`, region);

  // A shape (or a nested group) painted in one color, in its group's coordinates
  const paintOf = (layer: Layer, color: string): string => {
    const anim = animOf(layer);
    if (layer.type === 'boolean') {
      const inner = regionOf(layer).attr;
      return `<g class="${anim.name}">${fillRegion(regionMaskOf(layer), inner, `fill="${color}"`)}</g>`;
    }
    const p = getLayerPropertiesAtTime(layer, 0);
    return `<g class="${anim.name}">${shapeMarkup(layer, p, `fill="${color}"`, anim.morphs ? `${anim.name}_d` : undefined)}</g>`;
  };
  const whiteOf = (layer: Layer) => paintOf(layer, '#ffffff');

  // Mask that shows one shape of group g
  const childMaskOf = (layer: Layer, region: string) => {
    let id = childMasks.get(layer.id);
    if (!id) {
      id = defineMask(whiteOf(layer), region);
      childMasks.set(layer.id, id);
    }
    return id;
  };

  // Mask that shows the result of group g (white inside, nothing outside)
  function regionMaskOf(g: Layer): string {
    const cached = regionMasks.get(g.id);
    if (cached) return cached;
    const region = regionOf(g).attr;
    const shapes = operandsOf(g);
    let id: string;
    if (shapes.length === 0) {
      id = defineMask('', region);
    } else {
      switch (g.booleanOp ?? 'union') {
        case 'union':
          id = defineMask(shapes.map(whiteOf).join(''), region);
          break;
        case 'subtract':
          id = defineMask(whiteOf(shapes[0]) + shapes.slice(1).map((s) => paintOf(s, '#000000')).join(''), region);
          break;
        case 'intersect': {
          let content = whiteOf(shapes[0]);
          for (const s of shapes.slice(1)) content = `<g mask="url(#${childMaskOf(s, region)})">${content}</g>`;
          id = defineMask(content, region);
          break;
        }
        case 'exclude': {
          // Folded two by two: (A − B) ∪ (B − A)
          id = childMaskOf(shapes[0], region);
          for (const s of shapes.slice(1)) {
            const sMask = childMaskOf(s, region);
            id = defineMask(
              `<g mask="url(#${notMask(sMask, region)})">${fillRegion(id, region, 'fill="#ffffff"')}</g>` +
                `<g mask="url(#${notMask(id, region)})">${whiteOf(s)}</g>`,
              region
            );
          }
          break;
        }
      }
    }
    regionMasks.set(g.id, id);
    return id;
  }

  // Outline of the result, drawn as the shapes' strokes kept only where they lie on its edge.
  // width is in the coordinates of group g.
  function strokeOf(g: Layer, width: number, attrs: (w: number) => string): string {
    const region = regionOf(g).attr;
    const shapes = operandsOf(g);
    const op = g.booleanOp ?? 'union';
    return shapes
      .map((shape, i) => {
        const p = getLayerPropertiesAtTime(shape, 0);
        // Shapes are stroked in their own coordinates: undo their scale on the width
        const scale = Math.sqrt(Math.abs((p.scaleX ?? 1) * (p.scaleY ?? 1))) || 1;
        const anim = animOf(shape);
        let markup =
          shape.type === 'boolean'
            ? `<g class="${anim.name}">${strokeOf(shape, width / scale, attrs)}</g>`
            : `<g class="${anim.name}">${shapeMarkup(shape, p, attrs(width / scale), anim.morphs ? `${anim.name}_d` : undefined)}</g>`;
        const others = shapes.filter((_, j) => j !== i);
        const conditions =
          op === 'union'
            ? others.map((o) => notMask(childMaskOf(o, region), region))
            : op === 'intersect'
              ? others.map((o) => childMaskOf(o, region))
              : op === 'subtract'
                ? i === 0
                  ? others.map((o) => notMask(childMaskOf(o, region), region))
                  : [
                      childMaskOf(shapes[0], region),
                      ...others.filter((o) => o !== shapes[0]).map((o) => notMask(childMaskOf(o, region), region)),
                    ]
                : [];
        for (const m of conditions) markup = `<g mask="url(#${m})">${markup}</g>`;
        return markup;
      })
      .join('');
  }

  const region = regionOf(group);
  const resultMask = regionMaskOf(group);
  const hasFill = !!p0.fill && p0.fill !== 'transparent';
  const fillOpacity = Math.max(0, Math.min(1, p0.fillOpacity ?? 1));
  let content = hasFill
    ? fillRegion(resultMask, region.attr, `fill="${p0.fill}"${fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : ''}`)
    : '';

  if (strokeWidth > 0) {
    const strokeOpacity = Math.max(0, Math.min(1, p0.strokeOpacity ?? 1));
    const align = p0.strokeAlign ?? 'center';
    const width = align === 'center' ? strokeWidth : strokeWidth * 2;
    let stroke = strokeOf(group, width, (w) => `fill="none" stroke="${p0.stroke}" stroke-width="${Number(w.toFixed(3))}"`);
    if (align === 'inside') stroke = `<g mask="url(#${resultMask})">${stroke}</g>`;
    if (align === 'outside') stroke = `<g mask="url(#${notMask(resultMask, region.attr)})">${stroke}</g>`;
    // One opacity for the whole outline, so the pieces don't add up where they meet
    content += strokeOpacity < 1 ? `<g opacity="${strokeOpacity}">${stroke}</g>` : stroke;
  }
  return wrapShadows(ctx, group, p0, uid, content, region.box, 0);
}

// ── Document ────────────────────────────────────────────────────────────────

/**
 * Generates a standalone Animated SVG file with CSS keyframes
 */
export function exportToAnimatedSvg(
  project: Project,
  options?: SvgExportOptions
): string {
  const opts = options || {};
  const fps = opts.fps || 30;
  const totalFrames = Math.round(project.duration * fps);

  const ctx: ExportContext = {
    project,
    durationSec: project.duration,
    // Sample keyframe values at regular intervals (e.g. 60 samples across duration for maximum smoothness)
    samples: Math.min(120, Math.max(20, totalFrames)),
    fps,
    booleanMode: opts.booleanMode ?? 'auto',
    styles: [
      `
    /* Nori Animated SVG */
    @keyframes rootLoop {
      0% { opacity: 1; }
      100% { opacity: 1; }
    }
  `,
    ],
    defs: [],
  };

  const layerElements: string[] = [];

  project.layers.forEach((layer, layerIdx) => {
    // Shapes inside a boolean group are exported by the group
    if (!layer.visible || layer.parentId) return;

    const animName = `anim_layer_${layerIdx}_${safeId(layer.id)}`;
    const uid = `${layerIdx}_${safeId(layer.id)}`;
    const morphs = addLayerAnimation(ctx, layer, animName, true);

    let content: string;
    if (layer.type === 'boolean') {
      content = exportBooleanGroup(ctx, layer, uid);
    } else {
      // Render layer element at initial default
      const p0 = getLayerPropertiesAtTime(layer, 0);
      const bounds = getLayerLocalBounds(layer, p0);
      const shape = (attrs: string) => shapeMarkup(layer, p0, attrs, morphs ? `${animName}_d` : undefined);
      content = paintContent(ctx, layer, p0, uid, shape, bounds);
      // Morphing shapes can leave their first-frame bounds: keep a generous margin
      content = wrapShadows(ctx, layer, p0, uid, content, bounds, morphs ? Math.max(bounds.width, bounds.height) : 0);
    }

    layerElements.push(`
      <g id="${layer.id}" class="${animName}">
        ${content}
      </g>
    `);
  });

  const bgRect = !opts.transparent
    ? `<rect width="100%" height="100%" fill="${opts.backgroundColor || project.backgroundColor || '#ffffff'}" />`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${project.width} ${project.height}" width="${project.width}" height="${project.height}">
  <style>
    ${ctx.styles.join('')}
  </style>
  ${ctx.defs.length > 0 ? `<defs>${ctx.defs.join('')}</defs>` : ''}
  ${bgRect}
  ${layerElements.join('\n')}
</svg>`;
}

/**
 * Whether the SVG export has to choose how to write boolean groups: some group's outline changes
 * during the animation (its shapes move against each other). Needs the boolean engine; without
 * it, any shape animation inside a group counts.
 */
export function hasAnimatedBooleanGroups(project: Project): boolean {
  const fps = 30;
  const samples = Math.min(120, Math.max(20, Math.round(project.duration * fps)));
  return project.layers.some((group) => {
    if (group.type !== 'boolean' || group.parentId || !group.visible) return false;
    const outlines = Array.from({ length: samples + 1 }, (_, s) =>
      resolveBooleanGroup(project.layers, group, (s / samples) * project.duration).d
    );
    if (outlines.some((d) => d === null)) {
      return project.layers.some((l) => l.parentId && l.tracks.length > 0);
    }
    return outlines.some((d) => d !== outlines[0]);
  });
}
