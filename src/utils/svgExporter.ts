import { Layer, Project } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';

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

  project.layers.forEach((layer, layerIdx) => {
    if (!layer.visible) return;

    const animName = `anim_layer_${layerIdx}_${layer.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Sample keyframe values at regular intervals (e.g. 60 samples across duration for maximum smoothness)
    const samples = Math.min(120, Math.max(20, totalFrames));
    let keyframeCss = `@keyframes ${animName} {\n`;

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

      keyframeCss += `  ${percentage}% {
    opacity: ${op.toFixed(3)};
    transform: translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)});
  }\n`;
    }

    keyframeCss += `}\n`;
    styles += keyframeCss;

    // Layer class styling - transform-origin: 0px 0px perfectly preserves translation and pivot
    styles += `
      .${animName} {
        animation: ${animName} ${durationSec}s infinite linear;
        transform-origin: 0px 0px;
      }
    `;

    // Render layer element at initial default
    const p0 = getLayerPropertiesAtTime(layer, 0);
    const strokeAttr = p0.stroke && p0.stroke !== 'transparent'
      ? `stroke="${p0.stroke}" stroke-width="${p0.strokeWidth || 1}" stroke-linecap="round" stroke-linejoin="round"`
      : '';

    let content = '';
    const fillAttr = `fill="${p0.fill || 'transparent'}"`;

    if (layer.type === 'rect') {
      content = `<rect x="${-p0.width / 2}" y="${-p0.height / 2}" width="${p0.width}" height="${p0.height}" rx="${p0.radius || 0}" ${fillAttr} ${strokeAttr} />`;
    } else if (layer.type === 'capsule') {
      const r = Math.min(p0.width, p0.height) / 2;
      content = `<rect x="${-p0.width / 2}" y="${-p0.height / 2}" width="${p0.width}" height="${p0.height}" rx="${r}" ${fillAttr} ${strokeAttr} />`;
    } else if (layer.type === 'ellipse') {
      content = `<ellipse cx="0" cy="0" rx="${p0.width / 2}" ry="${p0.height / 2}" ${fillAttr} ${strokeAttr} />`;
    } else if (layer.type === 'star') {
      const points: string[] = [];
      const outerR = p0.width / 2;
      const innerR = outerR * 0.45;
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        points.push(`${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`);
      }
      content = `<polygon points="${points.join(' ')}" ${fillAttr} ${strokeAttr} />`;
    } else if (layer.type === 'text') {
      content = `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" ${fillAttr} font-size="${p0.fontSize || 32}" font-weight="${p0.fontWeight || 'bold'}" font-family="${p0.fontFamily || 'Sen, sans-serif'}">${p0.text || ''}</text>`;
    } else if (layer.type === 'path' && p0.pathData) {
      content = `<path d="${p0.pathData}" fill-rule="evenodd" ${fillAttr} ${strokeAttr} />`;
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
  ${bgRect}
  ${layerElements.join('\n')}
</svg>`;
}
