/**
 * A six-sided solid with its edges taken off. Given its eight corners (the foot's four and then the top's four, each round the same
 * way, as `anyAngle`'s `solid` takes them), every face is drawn in from each of its edges by `bevel`, and between two faces runs a
 * narrow strip, and at each corner a small three-cornered face where three strips meet. The strips' points keep the way the face
 * they come from looks, so that the light turns over the strip as over a rounded arris; the faces stay flat. It is the solid as a
 * mason leaves a dressed stone, or wear leaves a step's nose: the outline as well as the shading has no knife edge to it.
 *
 * Gives the pieces to draw, each a polygon of points with the way each faces and the way the piece as a whole faces out, for the
 * caller to lay in whatever mesh and colour it lays its solids in. 44 triangles where the plain solid has 12.
 */

type P3 = [number, number, number];
/** Whether edges are taken off at all: `?edges=0` draws every solid square, as before, for comparing (set by the program). */
export const chamfering = { on: true };
export interface ChamferPiece {
  pts: P3[];
  normals: P3[];
  /** Which way the piece as a whole faces, out of the solid. */
  out: P3;
}

const FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: P3, b: P3): P3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: P3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: P3): P3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function chamfered(c: P3[], bevel: number): ChamferPiece[] {
  const mid: P3 = mul(c.reduce((s, q) => add(s, q), [0, 0, 0] as P3), 1 / 8);
  // (No more than a third of the shortest edge, or the faces would turn inside out.)
  let shortest = Infinity;
  for (const f of FACES) for (let k = 0; k < 4; k++) shortest = Math.min(shortest, len(sub(c[f[(k + 1) % 4]], c[f[k]])));
  const b = Math.min(bevel, shortest / 3);
  const pieces: ChamferPiece[] = [];
  // Each face's way out, and each corner as that face has it, drawn in along the face's two edges at the corner.
  const normalOf: P3[] = [], inset = new Map<string, P3>();
  FACES.forEach((f, fi) => {
    let n = unit(cross(sub(c[f[1]], c[f[0]]), sub(c[f[2]], c[f[0]])));
    // (Some faces are not quite flat, with a corner raised or drawn in: the way out is taken about the whole face, turned outward.)
    const centre = mul(f.reduce((s, i) => add(s, c[i]), [0, 0, 0] as P3), 1 / 4);
    if (len(n) < 0.5 || dot(n, sub(centre, mid)) < 0) n = mul(n, -1);
    if (len(n) < 0.5) n = unit(sub(centre, mid));
    normalOf[fi] = n;
    for (let k = 0; k < 4; k++) {
      const i = f[k], prev = c[f[(k + 3) % 4]], next = c[f[(k + 1) % 4]];
      inset.set(`${fi}:${i}`, add(c[i], add(mul(unit(sub(prev, c[i])), b), mul(unit(sub(next, c[i])), b))));
    }
  });
  const push = (pts: P3[], normals: P3[], out: P3) => {
    // (Laid so that it faces out: round the other way if its corners as given face in.)
    const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    if (dot(n, out) < 0) { pts.reverse(); normals.reverse(); }
    pieces.push({ pts, normals, out });
  };
  // The faces, drawn in.
  FACES.forEach((f, fi) => push(f.map((i) => inset.get(`${fi}:${i}`)!), f.map(() => normalOf[fi]), normalOf[fi]));
  // The strips along the edges: every edge is shared by two faces.
  const edges = new Map<string, number[]>();
  FACES.forEach((f, fi) => { for (let k = 0; k < 4; k++) { const a = f[k], e = f[(k + 1) % 4], key = a < e ? `${a}-${e}` : `${e}-${a}`; (edges.get(key) ?? edges.set(key, []).get(key)!).push(fi); } });
  for (const [key, fs] of edges) {
    if (fs.length !== 2) continue;
    const [a, e] = key.split('-').map(Number), [f, g] = fs;
    const pts = [inset.get(`${f}:${a}`)!, inset.get(`${f}:${e}`)!, inset.get(`${g}:${e}`)!, inset.get(`${g}:${a}`)!];
    push(pts, [normalOf[f], normalOf[f], normalOf[g], normalOf[g]], unit(add(normalOf[f], normalOf[g])));
  }
  // The corners: where three faces meet.
  for (let i = 0; i < 8; i++) {
    const fs = FACES.map((f, fi) => (f.includes(i) ? fi : -1)).filter((fi) => fi >= 0);
    if (fs.length !== 3) continue;
    push(fs.map((fi) => inset.get(`${fi}:${i}`)!), fs.map((fi) => normalOf[fi]), unit(fs.reduce((s, fi) => add(s, normalOf[fi]), [0, 0, 0] as P3)));
  }
  return pieces;
}
