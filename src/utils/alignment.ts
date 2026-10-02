import { Layer, LayerProperties } from '../types/animation';
import { Affine, applyAffine } from './layerTree';
import { Box, getLayerWorldCorners, getWorldBox } from './transformHandles';

// Canvas box of a layer that lives inside a group (matrix: the group's canvas matrix)
function getCanvasBox(layer: Layer, props: LayerProperties, matrix?: Affine): Box {
  if (!matrix) return getWorldBox(layer, props);
  const corners = getLayerWorldCorners(layer, props).map((c) => applyAffine(matrix, c.x, c.y));
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

export type AlignMode = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'distribute-x' | 'distribute-y';

export interface AlignMove {
  layerId: string;
  dx: number;
  dy: number;
}

/**
 * Offsets that align or distribute layers by their visible bounds (axis-aligned box in canvas
 * coordinates). A single layer aligns to the canvas, several to the box around all of them.
 * Distributing leaves the first and last layer in place and spaces the rest so the gaps between
 * neighbours are equal (needs at least three layers). The offsets are in canvas coordinates; a
 * member inside a boolean group passes its group's canvas matrix.
 */
export function computeAlignMoves(
  members: { layer: Layer; props: LayerProperties; matrix?: Affine }[],
  mode: AlignMode,
  canvas: { width: number; height: number }
): AlignMove[] {
  if (members.length === 0) return [];
  const items = members.map((m) => ({ id: m.layer.id, box: getCanvasBox(m.layer, m.props, m.matrix) }));

  if (mode === 'distribute-x' || mode === 'distribute-y') {
    if (items.length < 3) return [];
    const horizontal = mode === 'distribute-x';
    const min = (b: Box) => (horizontal ? b.minX : b.minY);
    const size = (b: Box) => (horizontal ? b.maxX - b.minX : b.maxY - b.minY);
    const sorted = [...items].sort((a, b) => min(a.box) + size(a.box) / 2 - (min(b.box) + size(b.box) / 2));
    const first = sorted[0].box;
    const last = sorted[sorted.length - 1].box;
    const span = min(last) + size(last) - min(first);
    const total = sorted.reduce((sum, item) => sum + size(item.box), 0);
    const gap = (span - total) / (sorted.length - 1);
    let cursor = min(first);
    return sorted.map((item) => {
      const delta = cursor - min(item.box);
      cursor += size(item.box) + gap;
      return { layerId: item.id, dx: horizontal ? delta : 0, dy: horizontal ? 0 : delta };
    });
  }

  const target: Box =
    items.length === 1
      ? { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }
      : {
          minX: Math.min(...items.map((i) => i.box.minX)),
          minY: Math.min(...items.map((i) => i.box.minY)),
          maxX: Math.max(...items.map((i) => i.box.maxX)),
          maxY: Math.max(...items.map((i) => i.box.maxY)),
        };

  return items.map(({ id, box }) => {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left':
        dx = target.minX - box.minX;
        break;
      case 'center-x':
        dx = (target.minX + target.maxX) / 2 - (box.minX + box.maxX) / 2;
        break;
      case 'right':
        dx = target.maxX - box.maxX;
        break;
      case 'top':
        dy = target.minY - box.minY;
        break;
      case 'center-y':
        dy = (target.minY + target.maxY) / 2 - (box.minY + box.maxY) / 2;
        break;
      case 'bottom':
        dy = target.maxY - box.maxY;
        break;
    }
    return { layerId: id, dx, dy };
  });
}
