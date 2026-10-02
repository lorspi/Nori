import { Layer, LayerProperties, Project, PropertyTrack, TimelineClipboard } from '../types/animation';
import { createKeyframe } from './animationTracks';
import { getLayerPropertiesAtTime } from './interpolator';

/**
 * System clipboard support: Nori layers and timeline keyframes are written to the clipboard
 * as tagged JSON text (so they can be pasted in another tab or project), and the clipboard is
 * read back to detect what can be pasted: Nori content, SVG code (also Figma's "Copy as SVG")
 * or Figma's own format, which cannot be imported.
 */

const MARKER = 'nori-clipboard';
const VERSION = 1;

// Copied layers. staticProperties holds each layer as it looked at the playhead when copied,
// used by "Pegar sin animación".
export interface LayersClipboard {
  kind: 'layers';
  layers: Layer[];
  staticProperties: LayerProperties[];
  sourceDuration: number;
}

export type NoriClipboard = LayersClipboard | { kind: 'timeline'; clipboard: TimelineClipboard };

export type ClipboardContent =
  | { type: 'nori'; data: NoriClipboard }
  | { type: 'svg'; svg: string }
  | { type: 'figma' } // Figma's native copy (Ctrl + C): binary data, not importable
  | null;

// 'unknown': the browser can't read the clipboard without asking (or it was denied)
export type ClipboardProbe = { status: 'ok'; content: ClipboardContent } | { status: 'unknown' };

export function createLayersClipboard(layers: Layer[], time: number, duration: number): LayersClipboard {
  const copy = JSON.parse(JSON.stringify(layers)) as Layer[];
  return {
    kind: 'layers',
    layers: copy,
    staticProperties: copy.map((l) => {
      const p = getLayerPropertiesAtTime(l, time);
      return { ...l.properties, ...p };
    }),
    sourceDuration: duration,
  };
}

export const serializeClipboard = (data: NoriClipboard) => JSON.stringify({ [MARKER]: VERSION, ...data });

// The <svg> element inside a text (ignores XML prologs, comments or an HTML wrapper)
export function extractSvg(text: string): string | null {
  const match = text.match(/<svg[\s>][\s\S]*<\/svg>/i);
  return match ? match[0] : null;
}

const isFigmaHtml = (html: string) => /\(figma\)|\(figmeta\)|data-metadata=|data-buffer=/i.test(html);

function parseNori(text: string): NoriClipboard | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.includes(MARKER)) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || parsed[MARKER] !== VERSION) return null;
    if (parsed.kind === 'layers' && Array.isArray(parsed.layers) && parsed.layers.length > 0) {
      const valid = parsed.layers.every(
        (l: Layer) => l && typeof l.type === 'string' && l.properties && Array.isArray(l.tracks)
      );
      if (!valid) return null;
      return {
        kind: 'layers',
        layers: parsed.layers,
        staticProperties: Array.isArray(parsed.staticProperties)
          ? parsed.staticProperties
          : parsed.layers.map((l: Layer) => l.properties),
        sourceDuration: Number(parsed.sourceDuration) || 0,
      };
    }
    if (parsed.kind === 'timeline' && parsed.clipboard && typeof parsed.clipboard.kind === 'string') {
      return { kind: 'timeline', clipboard: parsed.clipboard };
    }
  } catch {
    // Not Nori JSON
  }
  return null;
}

export function classifyClipboard(text: string, html = ''): ClipboardContent {
  const nori = parseNori(text);
  if (nori) return { type: 'nori', data: nori };
  const svg = extractSvg(text);
  if (svg) return { type: 'svg', svg };
  if (isFigmaHtml(html)) return { type: 'figma' };
  return null;
}

export function classifyClipboardEvent(e: ClipboardEvent): ClipboardContent {
  const data = e.clipboardData;
  if (!data) return null;
  return classifyClipboard(data.getData('text/plain'), data.getData('text/html'));
}

// Whether the clipboard can be read now without an extra paste prompt (Chromium asks for
// permission once; Firefox and Safari show a "Paste" button on every read)
async function canProbeClipboard(): Promise<boolean> {
  if (!navigator.clipboard?.readText || !navigator.permissions?.query) return false;
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    return status.state !== 'denied';
  } catch {
    return false;
  }
}

// Reads the clipboard. With silent = true, it only reads when that doesn't show a prompt.
export async function readClipboard(silent = false): Promise<ClipboardProbe> {
  if (!navigator.clipboard) return { status: 'unknown' };
  if (silent && !(await canProbeClipboard())) return { status: 'unknown' };
  try {
    if (navigator.clipboard.read) {
      let text = '';
      let html = '';
      for (const item of await navigator.clipboard.read()) {
        if (!text && item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
        if (!html && item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
      }
      return { status: 'ok', content: classifyClipboard(text, html) };
    }
    return { status: 'ok', content: classifyClipboard(await navigator.clipboard.readText()) };
  } catch {
    return { status: 'unknown' };
  }
}

export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const newLayerId = () => `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const cloneTracks = (tracks: PropertyTrack[]): PropertyTrack[] =>
  tracks.map((t) => ({
    ...t,
    keyframes: t.keyframes.map((k) => ({
      ...createKeyframe(k.time, k.value),
      easing: JSON.parse(JSON.stringify(k.easing)),
    })),
  }));

/**
 * Turns copied layers into new layers for the target project: new ids, names that don't
 * clash, and layers that lasted the whole source project last the whole target project.
 * Without animation, each layer keeps its look from when it was copied and has no keyframes.
 */
export function instantiateClipboardLayers(data: LayersClipboard, target: Project, withAnimation: boolean): Layer[] {
  const names = new Set(target.layers.map((l) => l.name));
  // Layers inside a copied boolean group point to the group's new id
  const ids = new Map(data.layers.map((l) => [l.id, newLayerId()]));
  return data.layers.map((layer, i) => {
    const fullLength = !data.sourceDuration || layer.outTime >= data.sourceDuration - 1e-3;
    const name = names.has(layer.name) ? `${layer.name} Copia` : layer.name;
    names.add(name);
    const copy: Layer = JSON.parse(JSON.stringify(layer));
    if (copy.parentId) {
      if (ids.has(copy.parentId)) copy.parentId = ids.get(copy.parentId);
      else delete copy.parentId;
    }
    return {
      ...copy,
      id: ids.get(layer.id)!,
      name,
      inTime: Math.min(layer.inTime || 0, target.duration),
      outTime: fullLength ? target.duration : Math.min(layer.outTime, target.duration),
      properties: withAnimation
        ? JSON.parse(JSON.stringify(layer.properties))
        : JSON.parse(JSON.stringify(data.staticProperties[i] ?? layer.properties)),
      tracks: withAnimation ? cloneTracks(layer.tracks) : [],
      expanded: withAnimation && layer.tracks.length > 0,
    };
  });
}

/**
 * Places SVG layers (from importSvg) on the project canvas: the SVG box is centred and, if it
 * is bigger than the canvas, scaled down to fit. Animated positions and scales are adapted too.
 */
export function placeSvgLayers(
  layers: Layer[],
  svgSize: { width: number; height: number },
  target: Project,
  withAnimation: boolean
): Layer[] {
  const s = Math.min(1, target.width / svgSize.width, target.height / svgSize.height);
  const mapX = (x: number) => Number((target.width / 2 + (x - svgSize.width / 2) * s).toFixed(2));
  const mapY = (y: number) => Number((target.height / 2 + (y - svgSize.height / 2) * s).toFixed(2));
  const mapScale = (v: number) => Number((v * s).toFixed(4));
  const names = new Set(target.layers.map((l) => l.name));

  return layers.map((layer) => {
    const p = layer.properties;
    const name = names.has(layer.name) ? `${layer.name} Copia` : layer.name;
    names.add(name);
    const tracks = withAnimation
      ? layer.tracks.map((t) => {
          const map =
            t.property === 'x' ? mapX : t.property === 'y' ? mapY : t.property === 'scaleX' || t.property === 'scaleY' ? mapScale : null;
          return map
            ? { ...t, keyframes: t.keyframes.map((k) => ({ ...k, value: typeof k.value === 'number' ? map(k.value) : k.value })) }
            : t;
        })
      : [];
    return {
      ...layer,
      id: newLayerId(),
      name,
      inTime: 0,
      outTime: target.duration,
      expanded: false,
      properties: { ...p, x: mapX(p.x), y: mapY(p.y), scaleX: mapScale(p.scaleX), scaleY: mapScale(p.scaleY) },
      tracks,
    };
  });
}
