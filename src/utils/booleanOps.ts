import { useEffect, useState } from 'react';
import { BooleanOperation, Layer, Project } from '../types/animation';
import { getLayerPropertiesAtTime } from './interpolator';
import { getShapePathData } from './pathGeometry';
import { Affine, applyAffine, getChildren, layerMatrix } from './layerTree';
import { BoundingBox, getPathBounds } from './renderer';

/**
 * Boolean groups as real geometry. The result is an SVG path in the group's coordinates, made
 * with paper.js, which keeps the curves (it doesn't turn them into polygons). paper.js is only
 * downloaded when a project has a boolean group; until then, and on the rare frame where the
 * operation fails, the renderer composites the children instead (same fill, no stroke).
 */

type PaperScope = typeof import('paper/dist/paper-core');
type PathItem = paper.PathItem;

let paperScope: PaperScope | null = null;
let loading: Promise<boolean> | null = null;

/** Downloads paper.js once. Resolves to false when it can't be loaded (offline before first use). */
export function loadBooleanEngine(): Promise<boolean> {
  if (paperScope) return Promise.resolve(true);
  if (!loading) {
    loading = import('paper/dist/paper-core')
      .then((mod) => {
        const scope = ((mod as unknown as { default?: PaperScope }).default ?? mod) as PaperScope;
        scope.setup(new scope.Size(1, 1));
        // Items are only used for the math: they must not pile up in paper's project
        scope.settings.insertItems = false;
        paperScope = scope;
        return true;
      })
      .catch(() => {
        loading = null;
        return false;
      });
  }
  return loading;
}

export const isBooleanEngineReady = () => !!paperScope;

export const hasBooleanLayers = (project: Project) => project.layers.some((l) => l.type === 'boolean');

/** True once the engine is ready; starts loading it when the project needs it */
export function useBooleanEngine(needed: boolean): boolean {
  const [ready, setReady] = useState(isBooleanEngineReady);
  useEffect(() => {
    if (ready || !needed) return;
    // It may have loaded for another component since this one first rendered
    if (isBooleanEngineReady()) {
      setReady(true);
      return;
    }
    let active = true;
    loadBooleanEngine().then((loaded) => {
      if (active && loaded) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [needed, ready]);
  return ready;
}

/** Loads the engine if the project needs it (before exporting) */
export async function prepareBooleanEngine(project: Project) {
  if (hasBooleanLayers(project)) await loadBooleanEngine();
}

// ── Operands ────────────────────────────────────────────────────────────────

export interface BooleanOperand {
  layer: Layer;
  // Outline in the child's own coordinates; null for a nested group whose result isn't ready
  d: string | null;
  fillRule: CanvasFillRule;
  // Child coordinates → group coordinates
  matrix: Affine;
  // Bounds of the outline in the child's coordinates
  bounds: BoundingBox;
}

// Layers that can't take part: text has no outline, plain groups don't exist yet
export const canBeBooleanOperand = (layer: Layer) => layer.type !== 'text' && layer.type !== 'group';

/** Children that shape the group at this time, back to front */
export function getBooleanOperands(layers: Layer[], group: Layer, time: number): BooleanOperand[] {
  const operands: BooleanOperand[] = [];
  for (const child of getChildren(layers, group.id)) {
    if (!child.visible || time < child.inTime || time > child.outTime || !canBeBooleanOperand(child)) continue;
    const p = getLayerPropertiesAtTime(child, time);
    const matrix = layerMatrix(p);
    if (child.type === 'boolean') {
      const nested = resolveBooleanGroup(layers, child, time);
      operands.push({ layer: child, d: nested.d, fillRule: 'nonzero', matrix, bounds: nested.bounds });
      continue;
    }
    const d = getShapePathData(child.type, p) ?? '';
    operands.push({
      layer: child,
      d,
      fillRule: child.type === 'path' ? 'evenodd' : 'nonzero',
      matrix,
      bounds: d ? getPathBounds(d) : EMPTY_BOUNDS,
    });
  }
  return operands;
}

const EMPTY_BOUNDS: BoundingBox = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

// Box around the operands in group coordinates
export function operandsBounds(operands: BooleanOperand[]): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of operands) {
    if (o.bounds.width === 0 && o.bounds.height === 0) continue;
    const b = o.bounds;
    for (const [x, y] of [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ]) {
      const w = applyAffine(o.matrix, x, y);
      minX = Math.min(minX, w.x);
      minY = Math.min(minY, w.y);
      maxX = Math.max(maxX, w.x);
      maxY = Math.max(maxY, w.y);
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// ── Result ──────────────────────────────────────────────────────────────────

export interface BooleanResult {
  // The combined outline in group coordinates ('' when nothing is left); null while the
  // engine isn't ready or if the operation failed (draw the fallback)
  d: string | null;
  // Bounds of the result, or of the operands while there's none
  bounds: BoundingBox;
  operands: BooleanOperand[];
}

const DEFAULT_BOUNDS: BoundingBox = { minX: -30, minY: -30, maxX: 30, maxY: 30, width: 60, height: 60 };

// Results by input (operation + every operand); FAILED marks inputs paper.js couldn't handle
const FAILED = Symbol('failed');
const resultCache = new Map<string, string | typeof FAILED>();
const MAX_CACHE = 400;
// Last result of each group: bounds for hit testing and selection between renders
const lastResults = new Map<string, BooleanResult>();

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/** Resolves a boolean group at a time (cached), remembering it for getLastBooleanResult */
export function resolveBooleanGroup(layers: Layer[], group: Layer, time: number): BooleanResult {
  const operands = getBooleanOperands(layers, group, time);
  const op = group.booleanOp ?? 'union';
  let d: string | null = null;

  if (paperScope && operands.every((o) => o.d !== null)) {
    const key = `${op}|${operands.map((o) => `${o.fillRule}:${o.matrix.map(round4).join(',')}:${o.d}`).join('|')}`;
    let cached = resultCache.get(key);
    if (cached === undefined) {
      cached = computeBoolean(paperScope, op, operands) ?? FAILED;
      if (resultCache.size >= MAX_CACHE) resultCache.delete(resultCache.keys().next().value!);
    } else {
      resultCache.delete(key); // Most recently used goes last
    }
    resultCache.set(key, cached);
    d = cached === FAILED ? null : cached;
  }

  const bounds = (d ? getPathBounds(d) : null) ?? operandsBounds(operands) ?? DEFAULT_BOUNDS;
  const result = { d, bounds, operands };
  lastResults.set(group.id, result);
  return result;
}

export const getLastBooleanResult = (groupId: string) => lastResults.get(groupId);

// Grid the input coordinates are snapped to: removes float noise (1e-14) that makes paper.js
// miss tangent and coincident edges
const SNAP = 1e-4;

function snapItem(item: PathItem) {
  const r = (v: number) => Math.round(v / SNAP) * SNAP;
  const paths = (item as paper.CompoundPath).children ? ((item as paper.CompoundPath).children as paper.Path[]) : [item as paper.Path];
  for (const path of paths) {
    for (const s of path.segments) {
      s.point.x = r(s.point.x);
      s.point.y = r(s.point.y);
      s.handleIn.x = r(s.handleIn.x);
      s.handleIn.y = r(s.handleIn.y);
      s.handleOut.x = r(s.handleOut.x);
      s.handleOut.y = r(s.handleOut.y);
    }
  }
}

function computeBoolean(scope: PaperScope, op: BooleanOperation, operands: BooleanOperand[]): string | null {
  try {
    const items = operands
      .filter((o) => o.d)
      .map((o) => {
        const item = scope.PathItem.create(o.d!);
        item.fillRule = o.fillRule;
        item.transform(new scope.Matrix(...o.matrix));
        snapItem(item);
        return { item, operand: o };
      });
    // Subtract keeps nothing without its base (the back child)
    if (op === 'subtract' && items[0]?.operand !== operands[0]) return '';
    if (items.length === 0) return '';

    let result: PathItem = items[0].item;
    if (op === 'subtract') {
      if (items.length > 1) {
        let cutter: PathItem = items[1].item;
        for (const { item } of items.slice(2)) cutter = cutter.unite(item);
        result = result.subtract(cutter);
      }
    } else {
      for (const { item } of items.slice(1)) {
        result = op === 'union' ? result.unite(item) : op === 'intersect' ? result.intersect(item) : result.exclude(item);
      }
    }
    // A single child still goes through the engine so self-overlaps resolve like in a union
    if (items.length === 1) result = result.unite(result.clone());

    // getPathData(matrix, precision) is public in paper.js but missing from its typings
    const withPrecision = result as unknown as { getPathData(matrix: paper.Matrix, precision: number): string };
    const d = withPrecision.getPathData(new scope.Matrix(), 3) || '';
    return isPlausible(d, operands) ? d : null;
  } catch {
    return null;
  }
}

// Sanity check: a valid result never leaves the box around its operands
function isPlausible(d: string, operands: BooleanOperand[]): boolean {
  if (!d) return true;
  if (/NaN|Infinity/.test(d)) return false;
  const box = operandsBounds(operands);
  if (!box) return false;
  const b = getPathBounds(d);
  const tol = 1 + Math.max(box.width, box.height) * 1e-3;
  return b.minX >= box.minX - tol && b.minY >= box.minY - tol && b.maxX <= box.maxX + tol && b.maxY <= box.maxY + tol;
}
