import { BooleanOperation, Layer } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';
import { canBeBooleanOperand, resolveBooleanGroup } from './booleanOps';
import {
  Affine,
  getAncestors,
  getChildren,
  getDescendantIds,
  getLayer,
  getLayerWorldMatrix,
  getParentWorldMatrix,
  IDENTITY,
  invertAffine,
  isContainerLayer,
  layerMatrix,
  multiplyAffine,
  normalizeLayerTree,
  topLevelIds,
  transformLayerPose,
  withDescendants,
} from './layerTree';
import { getGroupBox } from './transformHandles';
import { t } from '../i18n';

/** Editing operations on groups, boolean groups and layer subtrees (pure: they return new layers) */

export const BOOLEAN_OPERATIONS: BooleanOperation[] = ['union', 'subtract', 'intersect', 'exclude'];

export const BOOLEAN_LABELS: Record<BooleanOperation, { name: string; action: string; shortcut: string; description: string }> = {
  union: {
    name: 'Unión',
    action: 'Unir',
    shortcut: 'Alt+Shift+U',
    description: 'Une las formas en una sola',
  },
  subtract: {
    name: 'Resta',
    action: 'Restar',
    shortcut: 'Alt+Shift+S',
    description: 'Quita las formas de delante a la de más atrás',
  },
  intersect: {
    name: 'Intersección',
    action: 'Intersectar',
    shortcut: 'Alt+Shift+I',
    description: 'Deja solo la parte que todas las formas comparten',
  },
  exclude: {
    name: 'Exclusión',
    action: 'Excluir',
    shortcut: 'Alt+Shift+X',
    description: 'Deja todo menos las partes donde las formas se superponen',
  },
};

const newId = (() => {
  let counter = 0;
  return () => `layer_${Date.now()}_${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
})();

const translation = (x: number, y: number): Affine => [1, 0, 0, 1, x, y];

/** Layers of a selection that can go into a boolean group: top-level ones, with an outline, in stacking order */
export function getBooleanCandidates(layers: Layer[], ids: string[]): Layer[] {
  const tops = new Set(topLevelIds(layers, ids));
  return layers.filter((l) => tops.has(l.id) && canBeBooleanOperand(l));
}

export type BooleanEditResult = { layers: Layer[]; selectId: string } | { error: string };

/**
 * Puts the selected layers into a new boolean group, right where the front-most of them was.
 * The group sits at the center of their box (so its own transforms turn and scale around it) and
 * takes the fill, stroke and effects of the back-most layer, as in Figma.
 */
export function createBooleanGroup(layers: Layer[], ids: string[], op: BooleanOperation, time: number): BooleanEditResult {
  const members = getBooleanCandidates(layers, ids);
  if (members.length < 2) return { error: t('Selecciona al menos dos formas para combinarlas') };
  const parentId = members[0].parentId;
  if (!members.every((m) => m.parentId === parentId)) {
    return { error: t('Las formas deben estar en el mismo grupo para combinarlas') };
  }

  const box = getGroupBox(members.map((m) => ({ layer: m, props: getLayerPropertiesAtTime(m, time) })));
  const gx = Math.round((box.minX + box.maxX) / 2);
  const gy = Math.round((box.minY + box.maxY) / 2);
  const style = getLayerPropertiesAtTime(members[0], time);
  const count = layers.filter((l) => l.type === 'boolean').length + 1;

  const group: Layer = {
    id: newId(),
    name: `${t(BOOLEAN_LABELS[op].name)} ${count}`,
    type: 'boolean',
    booleanOp: op,
    ...(parentId ? { parentId } : {}),
    visible: true,
    locked: false,
    inTime: Math.min(...members.map((m) => m.inTime)),
    outTime: Math.max(...members.map((m) => m.outTime)),
    expanded: true,
    properties: {
      x: gx,
      y: gy,
      width: Math.round(box.maxX - box.minX),
      height: Math.round(box.maxY - box.minY),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      fill: style.fill,
      fillOpacity: style.fillOpacity,
      stroke: style.stroke,
      strokeOpacity: style.strokeOpacity,
      strokeWidth: style.strokeWidth,
      strokeAlign: style.strokeAlign,
      radius: 0,
      blur: style.blur,
      dropShadow: style.dropShadow,
      innerShadow: style.innerShadow,
    },
    tracks: [],
  };

  // The members keep their place on the canvas: their coordinates become relative to the group
  const toGroup = translation(-gx, -gy);
  const memberIds = new Set(members.map((m) => m.id));
  const front = members[members.length - 1].id;
  const next: Layer[] = [];
  for (const layer of layers) {
    if (layer.id === front) {
      next.push(group, ...members.map((m) => ({ ...transformLayerPose(m, toGroup), parentId: group.id })));
    } else if (!memberIds.has(layer.id)) {
      next.push(layer);
    }
  }
  return { layers: normalizeLayerTree(next), selectId: group.id };
}

/**
 * Puts the selected layers (with everything inside them) into a new plain group, right where the
 * front-most of them was. Unlike a boolean group, each layer keeps its own style, effects and
 * animation; the group adds a transform and an opacity that apply to all of them. The group
 * sits at the center of their box, so it turns and scales around it.
 */
export function createLayerGroup(layers: Layer[], ids: string[], time: number): BooleanEditResult {
  const tops = new Set(topLevelIds(layers, ids));
  const members = layers.filter((l) => tops.has(l.id));
  if (members.length === 0) return { error: t('Selecciona una o más capas para agruparlas') };
  const parentId = members[0].parentId;
  if (!members.every((m) => m.parentId === parentId)) {
    return { error: t('Las capas deben estar en el mismo grupo para agruparlas') };
  }

  const box = getGroupBox(members.map((m) => ({ layer: m, props: getLayerPropertiesAtTime(m, time) })));
  const gx = Math.round((box.minX + box.maxX) / 2);
  const gy = Math.round((box.minY + box.maxY) / 2);
  const count = layers.filter((l) => l.type === 'group').length + 1;

  const group: Layer = {
    id: newId(),
    name: `${t('Grupo')} ${count}`,
    type: 'group',
    ...(parentId ? { parentId } : {}),
    visible: true,
    locked: false,
    inTime: Math.min(...members.map((m) => m.inTime)),
    outTime: Math.max(...members.map((m) => m.outTime)),
    expanded: true,
    properties: {
      x: gx,
      y: gy,
      width: Math.max(1, Math.round(box.maxX - box.minX)),
      height: Math.max(1, Math.round(box.maxY - box.minY)),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      fill: 'transparent',
      stroke: 'transparent',
      strokeWidth: 0,
      radius: 0,
    },
    tracks: [],
  };

  // The members keep their place on the canvas: their coordinates become relative to the group
  const toGroup = translation(-gx, -gy);
  const memberIds = new Set(members.map((m) => m.id));
  const front = members[members.length - 1].id;
  const next: Layer[] = [];
  for (const layer of layers) {
    if (layer.id === front) {
      next.push(group, ...members.map((m) => ({ ...transformLayerPose(m, toGroup), parentId: group.id })));
    } else if (!memberIds.has(layer.id)) {
      next.push(layer);
    }
  }
  // normalizeLayerTree puts the members' own children back right after them
  return { layers: normalizeLayerTree(next), selectId: group.id };
}

/** Changes the operation of a boolean group (its name follows when it still has the default one) */
export function setBooleanOperation(layers: Layer[], groupId: string, op: BooleanOperation): Layer[] {
  return layers.map((l) => {
    if (l.id !== groupId || l.type !== 'boolean') return l;
    // Default names in either language
    const names = BOOLEAN_OPERATIONS.flatMap((o) => [BOOLEAN_LABELS[o].name, t(BOOLEAN_LABELS[o].name)]);
    const defaultName = names.find((n) => l.name === n || l.name.startsWith(`${n} `));
    const name = defaultName ? l.name.replace(defaultName, t(BOOLEAN_LABELS[op].name)) : l.name;
    return { ...l, booleanOp: op, name };
  });
}

/**
 * Turns a boolean group into one path with its result at this time. The group keeps its
 * transform, style and animation; the shapes inside go away.
 */
export function flattenBooleanGroup(layers: Layer[], groupId: string, time: number): BooleanEditResult {
  const group = getLayer(layers, groupId);
  if (!group || group.type !== 'boolean') return { error: t('Selecciona un grupo booleano para aplanarlo') };
  const { d } = resolveBooleanGroup(layers, group, time);
  if (d === null) return { error: t('No se pudo calcular la forma combinada. Inténtalo de nuevo en otro instante.') };
  if (!d) return { error: t('La combinación está vacía en este instante: no hay forma que aplanar') };

  const remove = new Set(getDescendantIds(layers, groupId));
  const { booleanOp: _op, ...rest } = group;
  const path: Layer = {
    ...rest,
    type: 'path',
    properties: { ...group.properties, pathData: d, radius: 0 },
    // The outline is fixed now: an animated corner radius no longer applies
    tracks: group.tracks.filter((t) => t.property !== 'radius' && t.property !== 'pathData'),
  };
  return {
    layers: layers.filter((l) => !remove.has(l.id)).map((l) => (l.id === groupId ? path : l)),
    selectId: groupId,
  };
}

/**
 * Takes the layers out of a group (plain or boolean) and removes it. Each layer keeps its place on
 * the canvas (the group's transform at this time is applied to it); the shapes of a boolean group
 * get their own style back, and the opacity of a plain group is passed on to its layers.
 * Returns whether the group's own transform was animated (that animation can't be kept).
 */
export function ungroupGroup(
  layers: Layer[],
  groupId: string,
  time: number
): { layers: Layer[]; selectIds: string[]; lostAnimation: boolean } | { error: string } {
  const group = getLayer(layers, groupId);
  if (!group || (group.type !== 'boolean' && group.type !== 'group')) return { error: t('Selecciona un grupo para desagruparlo') };
  const groupProps = getLayerPropertiesAtTime(group, time);
  const m = layerMatrix(groupProps);
  // A plain group fades its layers: they keep looking the same with the opacity folded in
  const fade = group.type === 'group' ? Math.max(0, Math.min(1, groupProps.opacity ?? 1)) : 1;
  const children = new Map(
    getChildren(layers, groupId).map((child) => {
      let moved = transformLayerPose(child, m);
      if (fade < 1) moved = fadeLayer(moved, fade);
      const { parentId: _p, ...rest } = moved;
      return [child.id, (group.parentId ? { ...rest, parentId: group.parentId } : rest) as Layer];
    })
  );
  const transformProps = ['x', 'y', 'anchorX', 'anchorY', 'scaleX', 'scaleY', 'rotation', ...(group.type === 'group' ? ['opacity'] : [])];
  return {
    layers: normalizeLayerTree(layers.filter((l) => l.id !== groupId).map((l) => children.get(l.id) ?? l)),
    selectIds: [...children.keys()],
    lostAnimation: group.tracks.some((t) => transformProps.includes(t.property) && t.keyframes.length > 1),
  };
}

// Multiplies a layer's opacity (and its opacity animation) by k
function fadeLayer(layer: Layer, k: number): Layer {
  const round = (v: number) => Number(v.toFixed(4));
  return {
    ...layer,
    properties: { ...layer.properties, opacity: round((layer.properties.opacity ?? 1) * k) },
    tracks: layer.tracks.map((track) =>
      track.property !== 'opacity'
        ? track
        : { ...track, keyframes: track.keyframes.map((kf) => (typeof kf.value === 'number' ? { ...kf, value: round(kf.value * k) } : kf)) }
    ),
  };
}

/** Removes layers with everything inside them; groups left empty go away too */
export function deleteLayerTrees(layers: Layer[], ids: string[]): { layers: Layer[]; removed: Set<string> } {
  const removed = new Set(withDescendants(layers, ids));
  let next = layers.filter((l) => !removed.has(l.id));
  for (;;) {
    const empty = next.filter((l) => isContainerLayer(l) && !next.some((c) => c.parentId === l.id));
    if (empty.length === 0) break;
    empty.forEach((l) => removed.add(l.id));
    next = next.filter((l) => !removed.has(l.id));
  }
  return { layers: next, removed };
}

/** Copies of a layer and everything inside it, with new ids (the copy keeps the layer's parent) */
export function cloneLayerTree(layers: Layer[], rootId: string): Layer[] {
  const ids = [rootId, ...getDescendantIds(layers, rootId)];
  const idMap = new Map(ids.map((id) => [id, newId()]));
  return ids.map((id) => {
    const layer = getLayer(layers, id)!;
    const copy: Layer = { ...JSON.parse(JSON.stringify(layer)), id: idMap.get(id)! };
    if (id !== rootId && layer.parentId) copy.parentId = idMap.get(layer.parentId) ?? layer.parentId;
    return copy;
  });
}

/**
 * Layers to put on the clipboard: each selected layer with everything inside it. A layer taken
 * from inside a group is moved to canvas coordinates, so it pastes where it was seen.
 */
export function getLayersForClipboard(layers: Layer[], ids: string[], time: number): Layer[] {
  const tops = topLevelIds(layers, ids);
  const ordered = layers.filter((l) => tops.includes(l.id));
  return ordered.flatMap((top) => {
    const tree = [top, ...getDescendantIds(layers, top.id).map((id) => getLayer(layers, id)!)];
    if (!top.parentId) return tree;
    const lifted = transformLayerPose(top, getParentWorldMatrix(layers, top, time));
    const { parentId: _p, ...root } = lifted;
    return [root as Layer, ...tree.slice(1)];
  });
}

export type LayerDropPosition = 'before' | 'after' | 'inside';

/**
 * Moves a layer (with everything inside it) in the stacking order, as dropped on another row of
 * the timeline: before or after it (as its sibling) or inside it (a group, in front of its
 * layers). Changing groups keeps the layer where it is on the canvas. A group left empty goes
 * away.
 */
export function moveLayer(
  layers: Layer[],
  layerId: string,
  refId: string,
  position: LayerDropPosition,
  time: number
): { layers: Layer[] } | { error: string } | null {
  const layer = getLayer(layers, layerId);
  const ref = getLayer(layers, refId);
  if (!layer || !ref || layerId === refId) return null;
  const subtree = [layerId, ...getDescendantIds(layers, layerId)];
  if (subtree.includes(refId)) return null;
  if (position === 'inside' && !isContainerLayer(ref)) return null;

  const parentId = position === 'inside' ? ref.id : ref.parentId;
  if (getLayer(layers, parentId)?.type === 'boolean' && !canBeBooleanOperand(layer)) {
    return { error: t('Los textos y los grupos no pueden formar parte de un grupo booleano') };
  }

  // Same place on the canvas in the new space: new space ← canvas ← old space
  let moved = layer;
  if (parentId !== layer.parentId) {
    const from = getParentWorldMatrix(layers, layer, time);
    const target = getLayer(layers, parentId);
    const to = target ? getLayerWorldMatrix(layers, target, time) : IDENTITY;
    const { parentId: _old, ...rest } = transformLayerPose(layer, multiplyAffine(invertAffine(to), from));
    moved = (parentId ? { ...rest, parentId } : rest) as Layer;
  }

  const inSubtree = new Set(subtree);
  const block = layers.filter((l) => inSubtree.has(l.id)).map((l) => (l.id === layerId ? moved : l));
  const rest = layers.filter((l) => !inSubtree.has(l.id));
  // Before the row, or after it and everything inside it
  const refEnd = (() => {
    const inside = new Set(getDescendantIds(rest, refId));
    let i = rest.findIndex((l) => l.id === refId);
    while (i + 1 < rest.length && inside.has(rest[i + 1].id)) i++;
    return i + 1;
  })();
  const at = position === 'before' ? rest.findIndex((l) => l.id === refId) : refEnd;
  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  const unchanged = next.every((l, i) => l === layers[i]);
  if (unchanged) return null;
  return { layers: deleteLayerTrees(normalizeLayerTree(next), []).layers };
}

// The group that holds a layer, if any (for "select the group")
export const getBooleanParent = (layers: Layer[], layer: Layer | null | undefined) =>
  layer ? getAncestors(layers, layer)[0] : undefined;
