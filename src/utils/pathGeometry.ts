import { Layer, LayerProperties } from '../types/animation';

// ── Path parsing ───────────────────────────────────────────────────────────
// Paths are normalized to absolute M, L, C, Q, A and Z commands so they can be edited
// vertex by vertex and interpolated number by number (shape morphing).

export type PathCommand = 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z';

export interface PathSegment {
  cmd: PathCommand;
  // M/L: [x, y] · C: [x1, y1, x2, y2, x, y] · Q: [x1, y1, x, y]
  // A: [rx, ry, rotation, largeArc, sweep, x, y] · Z: []
  values: number[];
}

const ARG_COUNT: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

// Numbers of a path, including arc flags written without separators ("a1 1 0 011 1")
function tokenizeArgs(cmd: string, str: string): number[] {
  const out: number[] = [];
  const numRegex = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  if (cmd.toUpperCase() !== 'A') {
    let m: RegExpExecArray | null;
    while ((m = numRegex.exec(str)) !== null) out.push(parseFloat(m[0]));
    return out;
  }
  // Arc: flags (4th and 5th values of each group) are single digits "0" or "1"
  let i = 0;
  const s = str;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === ',' || ch === '\n' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    const slot = out.length % 7;
    if ((slot === 3 || slot === 4) && (ch === '0' || ch === '1')) {
      out.push(ch === '1' ? 1 : 0);
      i++;
      continue;
    }
    numRegex.lastIndex = i;
    const m = numRegex.exec(s);
    if (!m || m.index !== i) break;
    out.push(parseFloat(m[0]));
    i += m[0].length;
  }
  return out;
}

const parseCache = new Map<string, PathSegment[]>();

export function parsePath(d: string): PathSegment[] {
  const cached = parseCache.get(d);
  if (cached) return cached;

  const segments: PathSegment[] = [];
  const cmdRegex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // Last control point, for the reflected S / T commands
  let lastCubic: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;
  let match: RegExpExecArray | null;

  while ((match = cmdRegex.exec(d)) !== null) {
    const raw = match[1];
    const type = raw.toUpperCase();
    const rel = raw !== type;
    const args = tokenizeArgs(raw, match[2]);
    const count = ARG_COUNT[type];

    if (type === 'Z') {
      segments.push({ cmd: 'Z', values: [] });
      x = startX;
      y = startY;
      lastCubic = lastQuad = null;
      continue;
    }

    for (let i = 0; i + count <= args.length; i += count) {
      const a = args.slice(i, i + count);
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      let cubic: [number, number] | null = null;
      let quad: [number, number] | null = null;

      switch (type) {
        case 'M': {
          // Extra coordinate pairs after M are implicit line-tos
          const isMove = i === 0;
          x = a[0] + ox;
          y = a[1] + oy;
          segments.push({ cmd: isMove ? 'M' : 'L', values: [x, y] });
          if (isMove) {
            startX = x;
            startY = y;
          }
          break;
        }
        case 'L':
          x = a[0] + ox;
          y = a[1] + oy;
          segments.push({ cmd: 'L', values: [x, y] });
          break;
        case 'H':
          x = a[0] + ox;
          segments.push({ cmd: 'L', values: [x, y] });
          break;
        case 'V':
          y = a[0] + oy;
          segments.push({ cmd: 'L', values: [x, y] });
          break;
        case 'C': {
          const v: number[] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy];
          segments.push({ cmd: 'C', values: v });
          cubic = [v[2], v[3]];
          x = v[4];
          y = v[5];
          break;
        }
        case 'S': {
          const c1x: number = lastCubic ? 2 * x - lastCubic[0] : x;
          const c1y: number = lastCubic ? 2 * y - lastCubic[1] : y;
          const v: number[] = [c1x, c1y, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
          segments.push({ cmd: 'C', values: v });
          cubic = [v[2], v[3]];
          x = v[4];
          y = v[5];
          break;
        }
        case 'Q': {
          const v: number[] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy];
          segments.push({ cmd: 'Q', values: v });
          quad = [v[0], v[1]];
          x = v[2];
          y = v[3];
          break;
        }
        case 'T': {
          const c1x: number = lastQuad ? 2 * x - lastQuad[0] : x;
          const c1y: number = lastQuad ? 2 * y - lastQuad[1] : y;
          const v: number[] = [c1x, c1y, a[0] + ox, a[1] + oy];
          segments.push({ cmd: 'Q', values: v });
          quad = [c1x, c1y];
          x = v[2];
          y = v[3];
          break;
        }
        case 'A': {
          x = a[5] + ox;
          y = a[6] + oy;
          segments.push({ cmd: 'A', values: [a[0], a[1], a[2], a[3], a[4], x, y] });
          break;
        }
      }
      lastCubic = cubic;
      lastQuad = quad;
    }
  }

  if (parseCache.size > 400) parseCache.clear();
  parseCache.set(d, segments);
  return segments;
}

const n = (v: number) => Number(v.toFixed(2)).toString();

export function serializePath(segments: PathSegment[]): string {
  return segments
    .map((s) => {
      if (s.cmd === 'Z') return 'Z';
      if (s.cmd === 'A') {
        const [rx, ry, rot, large, sweep, x, y] = s.values;
        return `A${n(rx)} ${n(ry)} ${n(rot)} ${large ? 1 : 0} ${sweep ? 1 : 0} ${n(x)} ${n(y)}`;
      }
      return s.cmd + s.values.map(n).join(' ');
    })
    .join(' ');
}

export const normalizePathData = (d: string) => serializePath(parsePath(d));

// ── Vertices ───────────────────────────────────────────────────────────────

export interface PathVertex {
  segment: number; // index of the segment that ends on this vertex
  x: number;
  y: number;
}

// Points the path passes through (end point of every segment except Z). A closing
// point that repeats the start of its subpath is skipped so it isn't drawn twice.
export function getPathVertices(segments: PathSegment[]): PathVertex[] {
  const vertices: PathVertex[] = [];
  let start: PathVertex | null = null;
  segments.forEach((s, i) => {
    if (s.cmd === 'Z') return;
    const x = s.values[s.values.length - 2];
    const y = s.values[s.values.length - 1];
    if (s.cmd === 'M') {
      start = { segment: i, x, y };
      vertices.push(start);
      return;
    }
    const closesSubpath = segments[i + 1]?.cmd === 'Z' || segments[i + 1]?.cmd === 'M' || i === segments.length - 1;
    if (start && closesSubpath && Math.hypot(x - start.x, y - start.y) < 0.01) return;
    vertices.push({ segment: i, x, y });
  });
  return vertices;
}

// Segments whose end point sits on the same spot as `segment` within its subpath (the
// start of a closed shape and the segment that closes it), so they move together
export function getLinkedSegments(segments: PathSegment[], segment: number): number[] {
  const end = (i: number) => {
    const v = segments[i].values;
    return { x: v[v.length - 2], y: v[v.length - 1] };
  };
  let first = segment;
  while (first > 0 && segments[first].cmd !== 'M') first--;
  let last = segment;
  while (last + 1 < segments.length && segments[last + 1].cmd !== 'M') last++;

  const target = end(segment);
  const linked: number[] = [];
  for (let i = first; i <= last; i++) {
    if (segments[i].cmd === 'Z') continue;
    const p = end(i);
    if (Math.hypot(p.x - target.x, p.y - target.y) < 0.01) linked.push(i);
  }
  return linked;
}

/**
 * Moves the vertices that end the given segments by (dx, dy). The Bézier handles
 * attached to each vertex move with it, so curves keep their shape around the point.
 */
export function moveVertices(segments: PathSegment[], indices: number[], dx: number, dy: number): PathSegment[] {
  const next = segments.map((s) => ({ cmd: s.cmd, values: [...s.values] }));
  const moved = new Set<string>();
  const shift = (seg: number, xi: number) => {
    const key = `${seg}:${xi}`;
    if (moved.has(key)) return;
    moved.add(key);
    next[seg].values[xi] += dx;
    next[seg].values[xi + 1] += dy;
  };

  for (const i of indices) {
    const s = next[i];
    if (!s || s.cmd === 'Z') continue;
    shift(i, s.values.length - 2);
    // Incoming handle (end of a cubic) and outgoing handle (start of the next cubic)
    if (s.cmd === 'C') shift(i, 2);
    const after = next[i + 1];
    if (after?.cmd === 'C') shift(i + 1, 0);
  }
  return next;
}

// ── Bézier handles ───────────────────────────────────────────────────────────

// A control point of a cubic segment: values[index], values[index + 1] (index 0 or 2)
export interface HandleRef {
  segment: number;
  index: number;
}

export type HandleSide = 'in' | 'out';

// How the two handles of a vertex follow each other: not at all, in opposite directions
// (each keeps its length) or as an exact reflection (same angle and length)
export type MirrorMode = 'none' | 'angle' | 'angleLength';

type Pt = { x: number; y: number };

const EPS = 0.01;
const cloneSegments = (segments: PathSegment[]) => segments.map((s) => ({ cmd: s.cmd, values: [...s.values] }));
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

const segmentEnd = (segments: PathSegment[], i: number): Pt => {
  const v = segments[i].values;
  return { x: v[v.length - 2], y: v[v.length - 1] };
};

// Point each segment starts from (the end of the previous one, or the subpath start after Z)
function getStartPoints(segments: PathSegment[]): Pt[] {
  const out: Pt[] = [];
  let current: Pt = { x: 0, y: 0 };
  let subpathStart = current;
  for (const s of segments) {
    out.push(current);
    if (s.cmd === 'Z') {
      current = subpathStart;
      continue;
    }
    const end = { x: s.values[s.values.length - 2], y: s.values[s.values.length - 1] };
    if (s.cmd === 'M') subpathStart = end;
    current = end;
  }
  return out;
}

export const getHandlePoint = (segments: PathSegment[], ref: HandleRef): Pt => ({
  x: segments[ref.segment].values[ref.index],
  y: segments[ref.segment].values[ref.index + 1],
});

const setHandlePoint = (segments: PathSegment[], ref: HandleRef, p: Pt) => {
  segments[ref.segment].values[ref.index] = p.x;
  segments[ref.segment].values[ref.index + 1] = p.y;
};

/**
 * Handles of a vertex: the incoming one ends the cubic that arrives at the vertex and the
 * outgoing one starts the cubic that leaves it (a closed shape's start vertex takes its
 * incoming handle from the segment that closes it).
 */
export function getVertexHandles(segments: PathSegment[], vertex: number): { in: HandleRef | null; out: HandleRef | null } {
  let inRef: HandleRef | null = null;
  let outRef: HandleRef | null = null;
  if (!segments[vertex] || segments[vertex].cmd === 'Z') return { in: null, out: null };
  for (const j of getLinkedSegments(segments, vertex)) {
    if (!inRef && segments[j].cmd === 'C') inRef = { segment: j, index: 2 };
    if (!outRef && segments[j + 1]?.cmd === 'C') outRef = { segment: j + 1, index: 0 };
  }
  return { in: inRef, out: outRef };
}

// Handles drawn on the canvas: the ones that don't sit on their vertex
export function getVisibleHandles(segments: PathSegment[], vertex: number): { side: HandleSide; ref: HandleRef; x: number; y: number }[] {
  const v = segmentEnd(segments, vertex);
  const h = getVertexHandles(segments, vertex);
  const out: { side: HandleSide; ref: HandleRef; x: number; y: number }[] = [];
  (['in', 'out'] as const).forEach((side) => {
    const ref = h[side];
    if (!ref) return;
    const p = getHandlePoint(segments, ref);
    if (dist(p, v) > EPS) out.push({ side, ref, ...p });
  });
  return out;
}

// Mirroring the current handles of a vertex follow (none when it has fewer than two)
export function getVertexMirroring(segments: PathSegment[], vertex: number): MirrorMode {
  const h = getVertexHandles(segments, vertex);
  if (!h.in || !h.out) return 'none';
  const v = segmentEnd(segments, vertex);
  const a = getHandlePoint(segments, h.in);
  const b = getHandlePoint(segments, h.out);
  const la = dist(a, v);
  const lb = dist(b, v);
  if (la <= EPS || lb <= EPS) return 'none';
  const dot = ((a.x - v.x) * (b.x - v.x) + (a.y - v.y) * (b.y - v.y)) / (la * lb);
  if (dot > -0.9995) return 'none';
  return Math.abs(la - lb) <= Math.max(0.1, 0.01 * Math.max(la, lb)) ? 'angleLength' : 'angle';
}

/**
 * Moves one handle of a vertex to (x, y). With mirroring the opposite handle turns to the
 * opposite direction ('angle', keeping its length) or becomes its exact reflection.
 */
export function moveHandle(
  segments: PathSegment[],
  vertex: number,
  side: HandleSide,
  x: number,
  y: number,
  mode: MirrorMode
): PathSegment[] {
  const next = cloneSegments(segments);
  const h = getVertexHandles(next, vertex);
  const ref = h[side];
  if (!ref) return next;
  setHandlePoint(next, ref, { x, y });
  const other = h[side === 'in' ? 'out' : 'in'];
  if (!other || mode === 'none') return next;
  const v = segmentEnd(next, vertex);
  const d = { x: x - v.x, y: y - v.y };
  if (mode === 'angleLength') {
    setHandlePoint(next, other, { x: v.x - d.x, y: v.y - d.y });
  } else {
    const len = Math.hypot(d.x, d.y);
    const otherLen = dist(getHandlePoint(next, other), v);
    if (len > EPS && otherLen > EPS) {
      setHandlePoint(next, other, { x: v.x - (d.x / len) * otherLen, y: v.y - (d.y / len) * otherLen });
    }
  }
  return next;
}

// Turns a line or quadratic segment into the cubic that draws exactly the same curve
function toCubic(segments: PathSegment[], i: number, start: Pt) {
  const s = segments[i];
  if (s.cmd === 'L') {
    segments[i] = { cmd: 'C', values: [start.x, start.y, s.values[0], s.values[1], s.values[0], s.values[1]] };
  } else if (s.cmd === 'Q') {
    const [qx, qy, x, y] = s.values;
    segments[i] = {
      cmd: 'C',
      values: [start.x + (2 / 3) * (qx - start.x), start.y + (2 / 3) * (qy - start.y), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y],
    };
  }
}

// A cubic whose handles sit on its own end points is a straight line again
function toLineIfStraight(segments: PathSegment[], i: number, start: Pt) {
  const s = segments[i];
  if (s?.cmd !== 'C') return;
  const [x1, y1, x2, y2, x, y] = s.values;
  if (dist({ x: x1, y: y1 }, start) <= EPS && dist({ x: x2, y: y2 }, { x, y }) <= EPS) {
    segments[i] = { cmd: 'L', values: [x, y] };
  }
}

// Segments arriving at and leaving a vertex (closing segments of closed shapes included)
function getVertexNeighbours(segments: PathSegment[], vertex: number) {
  let incoming: number | null = null;
  let outgoing: number | null = null;
  for (const j of getLinkedSegments(segments, vertex)) {
    if (incoming === null && segments[j].cmd !== 'M') incoming = j;
    const after = segments[j + 1];
    if (outgoing === null && after && after.cmd !== 'M' && after.cmd !== 'Z') outgoing = j + 1;
  }
  return { incoming, outgoing };
}

/**
 * Closed subpaths that end with an implicit straight line (the Z) get that line written
 * out, so the vertices on both ends of it can have handles. Returns the new segments and
 * how old segment indices map to new ones.
 */
function expandClosingLines(segments: PathSegment[], vertices: number[] | null) {
  const positions: number[] = [];
  let first = 0;
  for (let i = 0; i <= segments.length; i++) {
    if (i < segments.length && (i === 0 || segments[i].cmd !== 'M')) continue;
    // Subpath [first, i - 1]
    const last = i - 1;
    if (last > first && segments[last].cmd === 'Z' && segments[last - 1].cmd !== 'Z') {
      const startPt = segmentEnd(segments, first);
      const closesOnStart = dist(segmentEnd(segments, last - 1), startPt) <= EPS;
      const touched = vertices === null || vertices.some((v) => v === first || v === last - 1);
      if (!closesOnStart && last - 1 > first && touched) positions.push(last);
    }
    first = i;
  }
  if (positions.length === 0) return { segments, remap: (i: number) => i };
  const next: PathSegment[] = [];
  segments.forEach((s, i) => {
    if (positions.includes(i)) {
      const start = (() => {
        let k = i;
        while (k > 0 && segments[k].cmd !== 'M') k--;
        return segmentEnd(segments, k);
      })();
      next.push({ cmd: 'L', values: [start.x, start.y] });
    }
    next.push({ cmd: s.cmd, values: [...s.values] });
  });
  return { segments: next, remap: (i: number) => i + positions.filter((p) => p <= i).length };
}

/**
 * Gives the vertices smooth Bézier handles: the segments around them become cubics and the
 * handles follow the direction between the neighbouring vertices, mirrored in angle and
 * length. Vertices that already have both handles are left as they are. Writing out a
 * closing line can shift segment indices, so `remap` translates the old ones.
 */
export function addVertexCurves(segments: PathSegment[], vertices: number[]) {
  const expanded = expandClosingLines(segments, vertices);
  const next = cloneSegments(expanded.segments);
  for (const vertex of vertices.map(expanded.remap)) {
    if (!next[vertex] || next[vertex].cmd === 'Z') continue;
    if (getVisibleHandles(next, vertex).length === 2) continue;
    const { incoming, outgoing } = getVertexNeighbours(next, vertex);
    const starts = getStartPoints(next);
    const v = segmentEnd(next, vertex);
    if (incoming !== null) toCubic(next, incoming, starts[incoming]);
    if (outgoing !== null) toCubic(next, outgoing, starts[outgoing]);
    const prev = incoming !== null && next[incoming].cmd === 'C' ? starts[incoming] : null;
    const after = outgoing !== null && next[outgoing].cmd === 'C' ? segmentEnd(next, outgoing) : null;

    let dir: Pt | null = null;
    let len = 0;
    if (prev && after) {
      dir = { x: after.x - prev.x, y: after.y - prev.y };
      len = (dist(v, prev) + dist(after, v)) / 6;
    } else if (after) {
      dir = { x: after.x - v.x, y: after.y - v.y };
      len = dist(after, v) / 3;
    } else if (prev) {
      dir = { x: v.x - prev.x, y: v.y - prev.y };
      len = dist(v, prev) / 3;
    }
    const dirLen = dir ? Math.hypot(dir.x, dir.y) : 0;
    if (!dir || dirLen <= EPS || len <= EPS) continue;
    const u = { x: dir.x / dirLen, y: dir.y / dirLen };
    const h = getVertexHandles(next, vertex);
    if (h.in) setHandlePoint(next, h.in, { x: v.x - u.x * len, y: v.y - u.y * len });
    if (h.out) setHandlePoint(next, h.out, { x: v.x + u.x * len, y: v.y + u.y * len });
  }
  return { segments: next, remap: expanded.remap };
}

// Removes the handles of the vertices (sharp corners); cubics left without handles become lines
export function removeVertexCurves(segments: PathSegment[], vertices: number[]): PathSegment[] {
  const next = cloneSegments(segments);
  const touched = new Set<number>();
  for (const vertex of vertices) {
    if (!next[vertex] || next[vertex].cmd === 'Z') continue;
    const v = segmentEnd(next, vertex);
    const h = getVertexHandles(next, vertex);
    for (const ref of [h.in, h.out]) {
      if (!ref) continue;
      setHandlePoint(next, ref, v);
      touched.add(ref.segment);
    }
  }
  const starts = getStartPoints(next);
  touched.forEach((i) => toLineIfStraight(next, i, starts[i]));
  return next;
}

/**
 * Applies a mirroring to the vertices: their handles are lined up in opposite directions
 * (along the average of both) and, for 'angleLength', given the same length. A vertex
 * with a single handle gets the reflection of it on the other side.
 */
export function setVertexMirroring(segments: PathSegment[], vertices: number[], mode: MirrorMode): PathSegment[] {
  if (mode === 'none') return segments;
  const next = cloneSegments(segments);
  for (const vertex of vertices) {
    if (!next[vertex] || next[vertex].cmd === 'Z') continue;
    const visible = getVisibleHandles(next, vertex);
    if (visible.length === 0) continue;
    // The side without a handle needs a cubic to hold the reflected one
    const { incoming, outgoing } = getVertexNeighbours(next, vertex);
    const starts = getStartPoints(next);
    if (incoming !== null) toCubic(next, incoming, starts[incoming]);
    if (outgoing !== null) toCubic(next, outgoing, starts[outgoing]);

    const v = segmentEnd(next, vertex);
    const h = getVertexHandles(next, vertex);
    if (!h.in || !h.out) continue;
    const a = getHandlePoint(next, h.in);
    const b = getHandlePoint(next, h.out);
    const la = dist(a, v);
    const lb = dist(b, v);
    const ua = la > EPS ? { x: (v.x - a.x) / la, y: (v.y - a.y) / la } : null; // incoming, pointing forward
    const ub = lb > EPS ? { x: (b.x - v.x) / lb, y: (b.y - v.y) / lb } : null;
    let u = ua && ub ? { x: ua.x + ub.x, y: ua.y + ub.y } : (ua ?? ub)!;
    const ul = Math.hypot(u.x, u.y);
    u = ul > EPS ? { x: u.x / ul, y: u.y / ul } : (ub ?? ua)!;
    // A missing handle takes the length of the other one
    let lenIn = la > EPS ? la : lb;
    let lenOut = lb > EPS ? lb : la;
    if (mode === 'angleLength') lenIn = lenOut = (lenIn + lenOut) / 2;
    setHandlePoint(next, h.in, { x: v.x - u.x * lenIn, y: v.y - u.y * lenIn });
    setHandlePoint(next, h.out, { x: v.x + u.x * lenOut, y: v.y + u.y * lenOut });
  }
  return next;
}

// ── Shape morphing ───────────────────────────────────────────────────────────

const sameStructure = (a: PathSegment[], b: PathSegment[]) =>
  a.length === b.length && a.every((s, i) => s.cmd === b[i].cmd);

const CURVABLE = new Set<PathCommand>(['L', 'Q', 'C']);

/**
 * Two paths that only differ in lines vs curves (as when Bézier handles were added to one
 * keyframe) are rewritten with the same commands, so they can still be morphed.
 */
function alignForMorph(a: PathSegment[], b: PathSegment[]): [PathSegment[], PathSegment[]] | null {
  const ea = expandClosingLines(a, null).segments;
  const eb = expandClosingLines(b, null).segments;
  if (ea.length !== eb.length) return null;
  if (!ea.every((s, i) => s.cmd === eb[i].cmd || (CURVABLE.has(s.cmd) && CURVABLE.has(eb[i].cmd)))) return null;
  const na = cloneSegments(ea);
  const nb = cloneSegments(eb);
  const sa = getStartPoints(na);
  const sb = getStartPoints(nb);
  na.forEach((s, i) => {
    if (s.cmd !== nb[i].cmd) {
      toCubic(na, i, sa[i]);
      toCubic(nb, i, sb[i]);
    }
  });
  return [na, nb];
}

/**
 * Path between two keyframes. Paths with the same structure (as when one keyframe was
 * made by moving vertices of the other) are morphed point by point; otherwise the
 * shape switches halfway.
 */
export function interpolatePath(from: string, to: string, progress: number): string {
  let a = parsePath(from);
  let b = parsePath(to);
  if (!sameStructure(a, b)) {
    const aligned = alignForMorph(a, b);
    if (!aligned) return progress >= 0.5 ? to : from;
    [a, b] = aligned;
  }
  return serializePath(
    a.map((s, i) => ({
      cmd: s.cmd,
      values: s.values.map((v, j) =>
        // Arc flags can't be blended
        s.cmd === 'A' && (j === 3 || j === 4) ? (progress >= 0.5 ? b[i].values[j] : v) : v + (b[i].values[j] - v) * progress
      ),
    }))
  );
}

export const isPathString = (v: unknown): v is string => typeof v === 'string' && /^\s*[Mm]/.test(v);

// ── Basic shapes as paths ─────────────────────────────────────────────────────

/**
 * Closed polygon with rounded corners. Each corner is a circular arc written as a cubic
 * Bézier, with its radius limited so neighbouring corners never overlap.
 */
export function roundedPolygonPath(points: Pt[], radius: number): string {
  const count = points.length;
  if (count < 3) return '';
  if (radius <= 0) {
    return `M${points.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L')} Z`;
  }

  const corners = points.map((v, i) => {
    const prev = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];
    const toPrev = { x: prev.x - v.x, y: prev.y - v.y };
    const toNext = { x: next.x - v.x, y: next.y - v.y };
    const lenPrev = Math.hypot(toPrev.x, toPrev.y) || 1;
    const lenNext = Math.hypot(toNext.x, toNext.y) || 1;
    const uPrev = { x: toPrev.x / lenPrev, y: toPrev.y / lenPrev };
    const uNext = { x: toNext.x / lenNext, y: toNext.y / lenNext };
    // Interior angle at the vertex
    const cos = Math.max(-1, Math.min(1, uPrev.x * uNext.x + uPrev.y * uNext.y));
    const angle = Math.acos(cos);
    const tanHalf = Math.tan(angle / 2) || 1e-6;
    // Distance from the vertex to where the arc touches each edge
    const dist = Math.min(radius / tanHalf, lenPrev / 2, lenNext / 2);
    const r = dist * tanHalf;
    // Cubic handle length for an arc that turns (π − angle)
    const handle = (4 / 3) * Math.tan((Math.PI - angle) / 4) * r;
    return {
      a: { x: v.x + uPrev.x * dist, y: v.y + uPrev.y * dist },
      b: { x: v.x + uNext.x * dist, y: v.y + uNext.y * dist },
      c1: { x: v.x + uPrev.x * (dist - handle), y: v.y + uPrev.y * (dist - handle) },
      c2: { x: v.x + uNext.x * (dist - handle), y: v.y + uNext.y * (dist - handle) },
    };
  });

  let d = `M${n(corners[0].a.x)} ${n(corners[0].a.y)}`;
  corners.forEach((c, i) => {
    if (i > 0) d += ` L${n(c.a.x)} ${n(c.a.y)}`;
    d += ` C${n(c.c1.x)} ${n(c.c1.y)} ${n(c.c2.x)} ${n(c.c2.y)} ${n(c.b.x)} ${n(c.b.y)}`;
  });
  return `${d} Z`;
}

// Regular polygon stretched to fill the layer box (a triangle touches all four sides)
export function getPolygonPoints(sides: number, width: number, height: number): Pt[] {
  const count = Math.max(3, Math.min(12, Math.round(sides)));
  const raw: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
    raw.push({ x: Math.cos(angle), y: Math.sin(angle) });
  }
  const minX = Math.min(...raw.map((p) => p.x));
  const maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y));
  const maxY = Math.max(...raw.map((p) => p.y));
  return raw.map((p) => ({
    x: ((p.x - minX) / (maxX - minX) - 0.5) * width,
    y: ((p.y - minY) / (maxY - minY) - 0.5) * height,
  }));
}

export function getStarPoints(points: number, innerRatio: number, width: number, height: number): Pt[] {
  const count = Math.max(3, Math.min(12, Math.round(points)));
  const inner = Math.max(0.05, Math.min(1, innerRatio));
  const out: Pt[] = [];
  for (let i = 0; i < count * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const angle = (i * Math.PI) / count - Math.PI / 2;
    out.push({ x: Math.cos(angle) * r * (width / 2), y: Math.sin(angle) * r * (height / 2) });
  }
  return out;
}

export const DEFAULT_SHAPE = { sides: 6, points: 5, innerRadius: 0.45 };

function rectPath(w: number, h: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const x0 = -w / 2;
  const y0 = -h / 2;
  if (r <= 0) return `M${n(x0)} ${n(y0)} L${n(-x0)} ${n(y0)} L${n(-x0)} ${n(-y0)} L${n(x0)} ${n(-y0)} Z`;
  return roundedPolygonPath(
    [
      { x: x0, y: y0 },
      { x: -x0, y: y0 },
      { x: -x0, y: -y0 },
      { x: x0, y: -y0 },
    ],
    r
  );
}

function ellipsePath(w: number, h: number): string {
  const rx = w / 2;
  const ry = h / 2;
  const k = 0.5522847498; // cubic approximation of a quarter circle
  const ox = rx * k;
  const oy = ry * k;
  return (
    `M0 ${n(-ry)} ` +
    `C${n(ox)} ${n(-ry)} ${n(rx)} ${n(-oy)} ${n(rx)} 0 ` +
    `C${n(rx)} ${n(oy)} ${n(ox)} ${n(ry)} 0 ${n(ry)} ` +
    `C${n(-ox)} ${n(ry)} ${n(-rx)} ${n(oy)} ${n(-rx)} 0 ` +
    `C${n(-rx)} ${n(-oy)} ${n(-ox)} ${n(-ry)} 0 ${n(-ry)} Z`
  );
}

/**
 * Outline of a shape layer as SVG path data in local coordinates (centered on 0, 0).
 * Used to draw polygons and stars, to export them and to convert any shape to a path.
 */
export function getShapePathData(type: Layer['type'], p: LayerProperties): string | null {
  const w = p.width || 0;
  const h = p.height || 0;
  switch (type) {
    case 'rect':
      return rectPath(w, h, p.radius || 0);
    case 'capsule':
      return rectPath(w, h, Math.min(w, h) / 2);
    case 'ellipse':
      return ellipsePath(w, h);
    case 'polygon':
      return roundedPolygonPath(getPolygonPoints(p.sides ?? DEFAULT_SHAPE.sides, w, h), p.radius || 0);
    case 'star':
      return roundedPolygonPath(
        getStarPoints(p.points ?? DEFAULT_SHAPE.points, p.innerRadius ?? DEFAULT_SHAPE.innerRadius, w, h),
        p.radius || 0
      );
    case 'path':
      return p.pathData ?? null;
    default:
      return null;
  }
}
