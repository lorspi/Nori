import { Layer, Project } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';
import { getShapePathData } from './pathGeometry';
import { getLayerLocalBounds } from './renderer';

export interface SvgExportOptions {
  transparent?: boolean;
  backgroundColor?: string;
  fps?: number;
}

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
  const durationSec = project.duration;

  let styles = `
    /* Nori Animated SVG */
    @keyframes rootLoop {
      0% { opacity: 1; }
      100% { opacity: 1; }
    }
  `;

  const layerElements: string[] = [];
  // Clip paths, masks and filters used by the layers
  const defs: string[] = [];

  project.layers.forEach((layer, layerIdx) => {
    if (!layer.visible) return;

    const animName = `anim_layer_${layerIdx}_${layer.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Sample keyframe values at regular intervals (e.g. 60 samples across duration for maximum smoothness)
    const samples = Math.min(120, Math.max(20, totalFrames));
    let keyframeCss = `@keyframes ${animName} {\n`;
    // Blur and vertex animation are only written when the layer uses them
    const hasBlur = (layer.properties.blur ?? 0) > 0 || layer.tracks.some((t) => t.property === 'blur');
    const morphs = layer.type === 'path' && layer.tracks.some((t) => t.property === 'pathData' && t.keyframes.length > 1);
    let morphCss = morphs ? `@keyframes ${animName}_d {\n` : '';

    for (let s = 0; s <= samples; s++) {
      const progress = s / samples;
      const t = progress * durationSec;
      const percentage = (progress * 100).toFixed(1);

      // Check inTime and outTime
      if (t < layer.inTime || t > layer.outTime) {
        keyframeCss += `  ${percentage}% { opacity: 0; transform: none; }\n`;
        continue;
      }

      const p = getLayerPropertiesAtTime(layer, t);
      const tx = p.x;
      const ty = p.y;
      const sx = p.scaleX !== undefined ? p.scaleX : 1;
      const sy = p.scaleY !== undefined ? p.scaleY : 1;
      const rot = p.rotation || 0;
      const op = p.opacity !== undefined ? p.opacity : 1;

      const blurCss = hasBlur ? `\n    filter: blur(${Math.max(0, Number(p.blur) || 0).toFixed(2)}px);` : '';
      keyframeCss += `  ${percentage}% {
    opacity: ${op.toFixed(3)};
    transform: translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)});${blurCss}
  }\n`;
      if (morphs && p.pathData) morphCss += `  ${percentage}% { d: path("${p.pathData}"); }\n`;
    }

    keyframeCss += `}\n`;
    styles += keyframeCss;
    if (morphs) {
      styles += `${morphCss}}\n.${animName}_d { animation: ${animName}_d ${durationSec}s infinite linear; }\n`;
    }

    // Layer class styling - transform-origin: 0px 0px perfectly preserves translation and pivot
    styles += `
      .${animName} {
        animation: ${animName} ${durationSec}s infinite linear;
        transform-origin: 0px 0px;
      }
    `;

    // Render layer element at initial default
    const p0 = getLayerPropertiesAtTime(layer, 0);
    const uid = `${layerIdx}_${layer.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const hasFill = !!p0.fill && p0.fill !== 'transparent';
    const hasStroke = !!p0.stroke && p0.stroke !== 'transparent' && p0.strokeWidth > 0;
    const roundJoins = layer.type === 'path' || layer.type === 'text';
    const fillOpacity = Math.max(0, Math.min(1, p0.fillOpacity ?? 1));
    const strokeOpacity = Math.max(0, Math.min(1, p0.strokeOpacity ?? 1));
    // Inside / outside strokes: twice as wide, clipped to the inside or masked to the outside
    const align = layer.type === 'text' ? 'center' : (p0.strokeAlign ?? 'center');
    const strokeAttr = (width: number) =>
      `stroke="${p0.stroke}" stroke-width="${width}"${strokeOpacity < 1 ? ` stroke-opacity="${strokeOpacity}"` : ''}${
        roundJoins ? ' stroke-linecap="round" stroke-linejoin="round"' : ''
      }`;
    const fillAttr = hasFill
      ? `fill="${p0.fill}"${fillOpacity < 1 ? ` fill-opacity="${fillOpacity}"` : ''}`
      : 'fill="none"';

    // The layer's geometry with the given paint attributes
    const shape = (attrs: string): string => {
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
        return `<path d="${p0.pathData}"${morphs ? ` class="${animName}_d"` : ''} fill-rule="evenodd" clip-rule="evenodd" ${attrs} />`;
      }
      return '';
    };

    const bounds = getLayerLocalBounds(layer, p0);
    let content = '';
    if (!hasStroke || align === 'center') {
      content = shape(`${fillAttr} ${layer.type === 'text' || !hasStroke ? '' : strokeAttr(p0.strokeWidth)}`);
    } else {
      if (hasFill) content += shape(fillAttr);
      if (align === 'inside') {
        defs.push(`<clipPath id="clip_${uid}">${shape('')}</clipPath>`);
        content += shape(`fill="none" ${strokeAttr(p0.strokeWidth * 2)} clip-path="url(#clip_${uid})"`);
      } else {
        const pad = p0.strokeWidth * 12 + 10;
        const box = `x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}"`;
        defs.push(
          `<mask id="mask_${uid}" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#ffffff" />${shape('fill="#000000"')}</mask>`
        );
        content += shape(`fill="none" ${strokeAttr(p0.strokeWidth * 2)} mask="url(#mask_${uid})"`);
      }
    }

    // Drop and inner shadows as an SVG filter (same model as the canvas renderer)
    const drop = p0.dropShadow?.enabled && p0.dropShadow.opacity > 0 ? p0.dropShadow : null;
    const inner = layer.type !== 'text' && p0.innerShadow?.enabled && p0.innerShadow.opacity > 0 ? p0.innerShadow : null;
    if (content && (drop || inner)) {
      const reach = Math.max(
        ...[drop, inner].filter((s) => !!s).map((s) => Math.abs(s!.x) + Math.abs(s!.y) + Math.abs(s!.spread) + s!.blur * 1.5)
      );
      // Morphing shapes can leave their first-frame bounds: keep a generous margin
      const pad = reach + p0.strokeWidth * 2 + 10 + (morphs ? Math.max(bounds.width, bounds.height) : 0);
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
      defs.push(
        `<filter id="fx_${uid}" filterUnits="userSpaceOnUse" x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${bounds.width + pad * 2}" height="${bounds.height + pad * 2}" color-interpolation-filters="sRGB">${primitives}<feMerge>${merge
          .map((m) => `<feMergeNode in="${m}" />`)
          .join('')}</feMerge></filter>`
      );
      content = `<g filter="url(#fx_${uid})">${content}</g>`;
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
    ${styles}
  </style>
  ${defs.length > 0 ? `<defs>${defs.join('')}</defs>` : ''}
  ${bgRect}
  ${layerElements.join('\n')}
</svg>`;
}
