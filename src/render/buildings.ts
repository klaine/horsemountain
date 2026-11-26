import { Vector3 } from 'three';
import { Rng } from '../core/rng';
import { chapelParts, blinded, buried, CLASSICAL, inPart, insetRing, underWing, wedgeOf, wingFrame, classicalArch, classicalEnds, classicalFront, classicalStairs, dressOf, entranceBays, floorOf, footprintOf, groundOf, plinthOf, stepsUp, TIMBER, timberFloor, timberFront, timberBackDoor, timberStair, timberWindows, wingWindows } from '../core/building';
import { Building, ClassicalDress } from '../core/site';
import { MeshBuilder } from './geom/meshBuilder';
import { layBeam } from './geom/timber';
import { chamfered, chamfering } from './geom/chamfer';
import { turner } from './geom/turned';
import { buildBrick } from './brick';
import { buildCanal } from './canal';

/**
 * Buildings that stand by themselves and are seen from outside. The site document says what a
 * building is in a few numbers (its style, its size, its storeys, its bays and its colour); this
 * makes it, piece by piece: every timber, every moulding, every pane is a closed solid of its
 * own, so the light catches them as it would. Nothing is drawn on. There are two styles.
 *
 * A building is laid out in measures of its own: `s` along a wall from its left end as seen from
 * outside, `y` up from the ground it stands on, `t` into the wall from its face. The four walls
 * are the front, then round by the right. A wall with openings is built as what is left of it:
 * the piers between, the breast under each and the head over each.
 */

type Colour = [number, number, number];
/** A wall seen from outside: how long it is, and where a place on it is in the world. */
/** A wall, along which things are laid: `P` is where a point is, `s` along it, `y` up, `t` into it. `oblique` where it is not square to the world. */
interface Face { L: number; P: (s: number, y: number, t: number) => Vector3; oblique?: boolean }
interface Gap { s0: number; s1: number; y0: number; y1: number }

const OAK: Colour = [0.2, 0.13, 0.085], WHITE: Colour = [0.9, 0.89, 0.85], PANE: Colour = [0.04, 0.055, 0.075], LIMEWASH: Colour = [0.86, 0.84, 0.78];
const shade = (c: Colour, k: number): Colour => [c[0] * k, c[1] * k, c[2] * k];

/**
 * Whether a room has a lamp or a fire lit in it when it is dark, told from where it is (so no choice is drawn, and nothing else
 * about a place changes): a share of the rooms, and the colour and strength of the light in each; or nothing if it is dark.
 * Lamplight is yellow and steady, firelight redder; windows of one room are alike.
 */
export function litRoom(x: number, y: number, z: number, share = 0.38): Colour | null {
  const h = (k: number) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 19.19) * 43758.5453; return v - Math.floor(v); };
  if (h(0) > share) return null;
  const strength = 0.55 + 0.6 * h(1), fire = h(2);
  return [strength, strength * (0.5 - 0.12 * fire), strength * (0.17 - 0.1 * fire)];
}

/** The tools: where things are, and solids to build with. */
/** Turns what a builder lays in one material and colour into another, while `active`: how a classical building's walls become brick. */
type Dress = { active: boolean; map: (material: string, colour: Colour) => [string, Colour] | null };
export function buildingTools(b: Building, base: number, mesh: (material: string) => MeshBuilder, dress?: Dress) {
  const turn = b.faces === 'w' ? 1 : -1;
  // From the building's own measures (along its front, up, back from its front) to the world.
  const at = (u: number, y: number, v: number) => new Vector3(b.x - (turn * b.d) / 2 + turn * v, base + y, b.z + turn * u);
  let count = 0;
  const A = new Vector3(), B = new Vector3(), N = new Vector3(), U = new Vector3(), V = new Vector3();
  // (How slight a solid is, the second least of its three measures, said of all it laid: a glazing bar or a window's frame is slight
  // however long it is, a shutter or a board along the eaves is not, however thin. See `markDetail`.)
  const slight = (m: MeshBuilder, from: number, a: number, b: number, c: number) => {
    const second = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    if (second < 1) m.markDetail(from, second);
  };
  /** One flat face of a solid, through the given corners, facing `out`. `grain` lays the texture along its longer way, as timber wants. */
  const poly = (material: string, pts: Vector3[], colour: Colour, out: Vector3, grain = false, scale = 0.5) => {
    if (dress?.active) { const r = dress.map(material, colour); if (r) [material, colour] = r; }
    const m = mesh(material);
    N.crossVectors(A.subVectors(pts[1], pts[0]), B.subVectors(pts[2], pts[0])).normalize();
    const list = N.dot(out) < 0 ? [...pts].reverse() : pts;
    if (N.dot(out) < 0) N.negate();
    if (Math.abs(N.y) > 0.95) { U.set(1, 0, 0); V.set(0, 0, 1); } else { U.set(N.z, 0, -N.x).normalize(); V.crossVectors(N, U); if (V.y < 0) V.negate(); }
    if (grain) {
      let lu = 0, lv = 0;
      for (const p of list) { lu = Math.max(lu, Math.abs(A.subVectors(p, list[0]).dot(U))); lv = Math.max(lv, Math.abs(A.dot(V))); }
      if (lv > lu) { A.copy(U); U.copy(V); V.copy(A); }
    }
    const ids = list.map((p) => m.addVertex(p.x, p.y, p.z, N.x, N.y, N.z, p.dot(U) * scale, p.dot(V) * scale, colour[0], colour[1], colour[2]));
    for (let k = 1; k < ids.length - 1; k++) m.addTriangle(ids[0], ids[k], ids[k + 1]);
    m.markFace(ids);
  };
  /**
   * A block between two opposite corners, square to the world. No two are quite the same tone. `bevel`, if given, takes its edges
   * off by that much (`chamfered`): for what stands out to be seen, sills, cornices, steps, whose outline against the light is a
   * knife's edge if left square.
   */
  const block = (material: string, a: Vector3, c: Vector3, colour: Colour, grain = false, bevel = 0) => {
    const x0 = Math.min(a.x, c.x), x1 = Math.max(a.x, c.x), y0 = Math.min(a.y, c.y), y1 = Math.max(a.y, c.y), z0 = Math.min(a.z, c.z), z1 = Math.max(a.z, c.z);
    if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
    // (Turned before it is shaded, so that the hook knows the colour it was given; `poly` is then given another, and leaves it alone.)
    if (dress?.active) { const r = dress.map(material, colour); if (r) [material, colour] = r; }
    const col = shade(colour, 0.94 + 0.12 * (((count++ * 7919) % 13) / 13)), scale = grain ? 0.9 : 0.5;
    const laid = mesh(material), from = laid.vertexCount;
    if (bevel > 0 && chamfering.on) {
      const m = laid;
      for (const piece of chamfered([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], bevel)) {
        N.set(...piece.out);
        if (Math.abs(N.y) > 0.95) { U.set(1, 0, 0); V.set(0, 0, 1); } else { U.set(N.z, 0, -N.x).normalize(); V.crossVectors(N, U); if (V.y < 0) V.negate(); }
        // (Timber's grain along the piece's longer way, as `poly` lays it.)
        if (grain) {
          let lu = 0, lv = 0;
          for (const q of piece.pts) { A.set(q[0] - piece.pts[0][0], q[1] - piece.pts[0][1], q[2] - piece.pts[0][2]); lu = Math.max(lu, Math.abs(A.dot(U))); lv = Math.max(lv, Math.abs(A.dot(V))); }
          if (lv > lu) { A.copy(U); U.copy(V); V.copy(A); }
        }
        const ids = piece.pts.map((q, k) => m.addVertex(q[0], q[1], q[2], piece.normals[k][0], piece.normals[k][1], piece.normals[k][2], (q[0] * U.x + q[1] * U.y + q[2] * U.z) * scale, (q[0] * V.x + q[1] * V.y + q[2] * V.z) * scale, col[0], col[1], col[2]));
        for (let k = 1; k < ids.length - 1; k++) m.addTriangle(ids[0], ids[k], ids[k + 1]);
      }
      slight(laid, from, x1 - x0, y1 - y0, z1 - z0);
      return;
    }
    const p = (x: number, y: number, z: number) => new Vector3(x, y, z);
    poly(material, [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], col, p(1, 0, 0), grain, scale);
    poly(material, [p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1)], col, p(-1, 0, 0), grain, scale);
    poly(material, [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], col, p(0, 1, 0), grain, scale);
    poly(material, [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], col, p(0, -1, 0), grain, scale);
    poly(material, [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], col, p(0, 0, 1), grain, scale);
    poly(material, [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], col, p(0, 0, -1), grain, scale);
    slight(laid, from, x1 - x0, y1 - y0, z1 - z0);
  };
  /** A block given in the building's own measures. */
  const box = (material: string, u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, colour: Colour, grain = false, bevel = 0) => block(material, at(u0, y0, v0), at(u1, y1, v1), colour, grain, bevel);
  /**
   * A block whose sides need not be square to the world, through its eight corners: the four at one end round in order, then the four
   * at the other in the same order. (Its edges are left square.)
   */
  const cuboid = (material: string, c: Vector3[], colour: Colour, grain = false) => {
    if (dress?.active) { const r = dress.map(material, colour); if (r) [material, colour] = r; }
    const col = shade(colour, 0.94 + 0.12 * (((count++ * 7919) % 13) / 13)), mid = c.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / 8);
    const laid = mesh(material), from = laid.vertexCount;
    for (const q of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
      const pts = q.map((i) => c[i]), out = pts.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(0.25).sub(mid);
      poly(material, pts, col, out, grain, grain ? 0.9 : 0.5);
    }
    slight(laid, from, c[0].distanceTo(c[1]), c[1].distanceTo(c[2]), c[0].distanceTo(c[4]));
  };
  /** A block set in a wall: square to the world where the wall is, and turned with it where it is not. */
  const on = (f: Face, material: string, s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, colour: Colour, grain = false, bevel = 0) => {
    if (!f.oblique) { block(material, f.P(s0, y0, t0), f.P(s1, y1, t1), colour, grain, bevel); return; }
    if (Math.abs(s1 - s0) < 1e-4 || Math.abs(y1 - y0) < 1e-4 || Math.abs(t1 - t0) < 1e-4) return;
    cuboid(material, [f.P(s0, y0, t0), f.P(s1, y0, t0), f.P(s1, y1, t0), f.P(s0, y1, t0), f.P(s0, y0, t1), f.P(s1, y0, t1), f.P(s1, y1, t1), f.P(s0, y1, t1)], colour, grain);
  };
  /** A squared length of timber from one point to another. */
  const stick = (from: Vector3, to: Vector3, thick: number, broad: number, colour: Colour, material = 'wood') => {
    if (dress?.active) { const r = dress.map(material, colour); if (r) [material, colour] = r; }
    const laid = mesh(material), first = laid.vertexCount;
    layBeam(laid, from, to, thick, broad, shade(colour, 0.92 + 0.16 * (((count++ * 104729) % 11) / 11)), count * 0.173);
    slight(laid, first, thick, broad, from.distanceTo(to));
  };
  /** The four walls of a storey whose front stands at `front` (less than nothing if it stands out over the street). */
  const walls = (front: number, w = b.w, d = b.d): Face[] => [
    { L: w, P: (s, y, t) => at(-w / 2 + s, y, front + t) },
    { L: d - front, P: (s, y, t) => at(w / 2 - t, y, front + s) },
    { L: w, P: (s, y, t) => at(w / 2 - s, y, d - t) },
    { L: d - front, P: (s, y, t) => at(-w / 2 + t, y, d - s) },
  ];
  /**
   * A stretch of wall with openings in it: what is left of the wall, as blocks. `bands` cuts it into courses with a dark joint between,
   * as rusticated work is; `ends` then says how far the courses (`c`) and the work behind them (`k`) run at the wall's two ends, where
   * they turn a corner: the courses of one wall run on past the other's work behind, and meet its courses as a mitre would.
   */
  const pierced = (f: Face, material: string, s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, colour: Colour, gaps: Gap[], bands = 0, ends?: { c: [number, number]; k: [number, number] }) => {
    const piece = (a0: number, a1: number, lo: number, hi: number) => {
      if (a1 - a0 < 0.01 || hi - lo < 0.01) return;
      if (!bands) { on(f, material, a0, a1, lo, hi, t0, t1, colour); return; }
      const [c0, c1] = [a0 === s0 && ends ? ends.c[0] : a0, a1 === s1 && ends ? ends.c[1] : a1], [k0, k1] = [a0 === s0 && ends ? ends.k[0] : a0, a1 === s1 && ends ? ends.k[1] : a1];
      if (k1 - k0 > 0.01) on(f, material, k0, k1, lo, hi, t0 + 0.045, t1, shade(colour, 0.5));
      // (Courses are counted from the foot of the whole wall, so that they run level across every piece of it. Each stops where the
      // joint behind it begins: run on into it, their ends lay in one plane with the joint's at every corner and reveal, and flickered.)
      for (let y = y0; y < hi - 0.01; y += bands) {
        const from = Math.max(lo, y), to = Math.min(hi, y + bands - 0.055);
        if (to - from > 0.03) on(f, material, c0, c1, from, to, t0, t0 + 0.045, colour);
      }
    };
    // (Only the openings within its height: each cuts the stretch it stands in into what is beside it, under it and over it, so two
    // standing one over the other, as on two storeys, would each be covered by the other's wall over or under it.)
    const sorted = gaps.filter((g) => g.s1 > s0 && g.s0 < s1 && g.y1 > y0 && g.y0 < y1).sort((a, c) => a.s0 - c.s0);
    let s = s0;
    for (const g of sorted) {
      piece(s, g.s0, y0, y1);
      piece(g.s0, g.s1, y0, g.y0);
      piece(g.s0, g.s1, g.y1, y1);
      s = g.s1;
    }
    piece(s, s1, y0, y1);
  };
  /** What stands in a window opening: the frame, the bars that divide it, and the glass behind them. */
  const glazed = (f: Face, g: Gap, across: number, down: number, frame: Colour, deep = 0.1) => {
    const w = g.s1 - g.s0, h = g.y1 - g.y0;
    // (Which room a window belongs to, near enough: a stretch of a wall some three and a half metres long on one storey.)
    const room = f.P(Math.floor(g.s0 / 3.5) * 3.5, Math.floor(g.y0 / 2.6) * 2.6, 0), light = litRoom(Math.round(room.x), Math.round(room.y), Math.round(room.z));
    if (light) on(f, 'window', g.s0, g.s1, g.y0, g.y1, deep + 0.05, deep + 0.08, light);
    else on(f, 'glass', g.s0, g.s1, g.y0, g.y1, deep + 0.05, deep + 0.08, PANE);
    for (const [a, c] of [[g.s0, g.s0 + 0.07], [g.s1 - 0.07, g.s1]]) on(f, 'wood', a, c, g.y0, g.y1, deep, deep + 0.07, frame, true);
    for (const [a, c] of [[g.y0, g.y0 + 0.07], [g.y1 - 0.07, g.y1]]) on(f, 'wood', g.s0, g.s1, a, c, deep, deep + 0.07, frame, true);
    for (let k = 1; k < across; k++) on(f, 'wood', g.s0 + (w * k) / across - 0.022, g.s0 + (w * k) / across + 0.022, g.y0, g.y1, deep + 0.01, deep + 0.06, frame, true);
    for (let k = 1; k < down; k++) on(f, 'wood', g.s0, g.s1, g.y0 + (h * k) / down - 0.02, g.y0 + (h * k) / down + 0.02, deep + 0.015, deep + 0.055, frame, true);
  };
  /** A solid with a three-cornered end, drawn out along a line: a gable, a pediment, a ridged roof. `ends` and `sides` are what its faces are made of. */
  const wedge = (a0: Vector3, b0: Vector3, top0: Vector3, along: Vector3, sides: [string, Colour], ends: [string, Colour], under: [string, Colour] = ends) => {
    const a1 = a0.clone().add(along), b1 = b0.clone().add(along), top1 = top0.clone().add(along);
    const mid = a0.clone().add(b0).add(top0).multiplyScalar(1 / 3).addScaledVector(along, 0.5);
    const outOf = (...pts: Vector3[]) => pts.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(1 / pts.length).sub(mid);
    poly(sides[0], [a0, a1, top1, top0], sides[1], outOf(a0, a1, top1, top0), false, sides[0] === 'tile' ? 0.62 : 0.5);
    poly(sides[0], [b0, b1, top1, top0], sides[1], outOf(b0, b1, top1, top0), false, sides[0] === 'tile' ? 0.62 : 0.5);
    poly(ends[0], [a0, b0, top0], ends[1], outOf(a0, b0, top0));
    poly(ends[0], [a1, b1, top1], ends[1], outOf(a1, b1, top1));
    poly(under[0], [a0, b0, b1, a1], under[1], outOf(a0, b0, b1, a1));
  };
  /** One slope of a roof: a sheet with some thickness, through four corners given from the eaves up, covered on top and boarded beneath. */
  const slope = (corners: Vector3[], cover: [string, Colour], under: Colour, thick = 0.16) => {
    N.crossVectors(A.subVectors(corners[1], corners[0]), B.subVectors(corners[3], corners[0])).normalize();
    if (N.y < 0) N.negate();
    const up = N.clone(), low = corners.map((p) => p.clone().addScaledVector(up, -thick));
    poly(cover[0], corners, cover[1], up, false, cover[0] === 'tile' ? 0.62 : 0.5);
    poly('wood', low, under, up.clone().negate(), true, 0.9);
    const mid = corners.reduce((sum, p) => sum.add(p), new Vector3()).multiplyScalar(0.25);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      poly('wood', [corners[i], corners[j], low[j], low[i]], under, corners[i].clone().add(corners[j]).multiplyScalar(0.5).sub(mid), true, 0.9);
    }
  };
  /** From a place in the world back to the building's own measures. */
  const local = (p: Vector3) => ({ u: turn * (p.z - b.z), y: p.y - base, v: turn * (p.x - b.x) + b.d / 2 });
  return { at, local, poly, block, cuboid, box, on, stick, walls, pierced, glazed, wedge, slope };
}

/**
 * A timber-framed house. Its ground storey is stone under plaster, on a plinth; over it stand one
 * or two storeys of framing, each jettied out over the street on the ends of its floor joists:
 * a sill beam and a head beam, posts between them at every bay, a rail at the height of the
 * window sills, and in the bays that have no window a brace, or under a window a cross. The
 * spaces between are filled and washed with the house's colour. The roof is steep and tiled,
 * with either a framed gable to the street or its eaves, and then dormers; a chimney of stone
 * comes through it. Windows have shutters, and on the street side boxes of flowers.
 */
function timberHouse(b: Building, base: number, given: (material: string) => MeshBuilder, rng: Rng, stone: Colour, first: boolean, tops?: Vector3[]): void {
  // A house that was burnt is built as any other, through a mesh that chars what it is given: timber nearly black, plaster sooted
  // in streaks, stone darkened; and that throws away its glass, its flowers and its tiles, which did not survive.
  const burnt = !!b.burnt, waste = new MeshBuilder(), charred = new Map<string, MeshBuilder>();
  const mesh = !burnt ? given : (material: string): MeshBuilder => {
    if (material === 'glass' || material === 'window' || material === 'leaf' || material === 'tile') return waste;
    let m = charred.get(material);
    if (!m) {
      const real = given(material), k = material === 'wood' ? 0.28 : material === 'plaster' ? 0.42 : material === 'stone' ? 0.62 : 0.8;
      m = Object.create(real) as MeshBuilder;
      m.addVertex = (px: number, py: number, pz: number, nx: number, ny: number, nz: number, u: number, v: number, r = 1, g = 1, bl = 1, ...rest: number[]) => {
        // (Soot rises: the upper part of a wall is blacker than its foot.)
        const up = Math.min(1, Math.max(0, (py - base) / 4)), f = k * (1 - 0.35 * up) * (0.85 + 0.3 * Math.abs(Math.sin(px * 3.1 + pz * 2.3)));
        return real.addVertex(px, py, pz, nx, ny, nz, u, v, r * f, g * f, bl * f, ...rest);
      };
      charred.set(material, m);
    }
    return m;
  };
  const k = buildingTools(b, base, mesh), { at, box, on, stick, pierced, glazed, wedge, slope } = k;
  const W = b.w, D = b.d, jetty = b.jetty ?? 0.35, T = 0.3, PLINTH = 0.3, H0 = b.heights[0];
  // How far behind the face of the posts each layer of a framed wall stands (see the storeys of framing).
  const RAIL = 0.015, BRACE = 0.028, CROSS = 0.04, PANEL = 0.06;
  // (Each storey is as high as the document says, so floors stand at different heights from house to house.)
  const floorOf = (storey: number) => PLINTH + b.heights.slice(0, storey).reduce((sum, h) => sum + h, 0), frontOf = (storey: number) => -jetty * storey;
  const top = floorOf(b.storeys), front = frontOf(b.storeys - 1);
  const paint: Colour = rng.pick([[0.16, 0.28, 0.2], [0.2, 0.26, 0.36], [0.36, 0.14, 0.11], [0.3, 0.24, 0.14]] as Colour[]);
  const frame: Colour = [0.8, 0.78, 0.7];

  // The ground storey: a stone plinth, plastered walls, a door and a window or two to the street, one small window to each side and the back.
  box('stone', -W / 2 - 0.07, W / 2 + 0.07, 0, PLINTH + 0.18, -0.07, D + 0.07, shade(stone, 0.8));
  const ground = k.walls(0);
  // (Where the door is, the site document says; the choice made here is kept only so that nothing after it is dealt differently.)
  const picked = rng.pick([0.24, 0.5, 0.76]), doorAt = W * (b.door ?? picked), door: Gap = { s0: doorAt - 0.52, s1: doorAt + 0.52, y0: PLINTH - 0.12, y1: PLINTH + 2.28 };
  ground.forEach((f, i) => {
    const gaps: Gap[] = [];
    if (i === 0) gaps.push(door);
    for (const [s0, s1] of timberWindows(b, 0)[i]) gaps.push({ s0, s1, y0: PLINTH + (i === 0 ? 0.95 : 1.15), y1: PLINTH + (i === 0 ? 2.0 : 1.95) });
    // (The ground storey is stone under its plaster, and thick: more than half a metre.)
    pierced(f, 'plaster', 0, f.L, PLINTH + 0.18, PLINTH + H0, 0, 0.56, LIMEWASH, gaps);
    for (const g of gaps) {
      if (g === door) {
        // A door of upright boards in a frame of oak, with a stone step before it.
        // (The boards of the door are dealt their tones whether it is shut or stands open inside: see the hall.)
        const tones = Array.from({ length: 5 }, () => 0.9 + 0.2 * rng.next());
        if (!b.plan) {
          for (let n = 0; n < 5; n++) on(f, 'wood', g.s0 + 0.1 + n * 0.168, g.s0 + 0.1 + (n + 1) * 0.168 - 0.008, PLINTH + 0.02, g.y1 - 0.1, 0.12, 0.17, shade(paint, tones[n]), true);
          for (const y of [PLINTH + 0.3, PLINTH + 1.55]) on(f, 'metal', g.s0 + 0.1, g.s1 - 0.1, y, y + 0.07, 0.1, 0.125, [0.05, 0.05, 0.055]);
          on(f, 'metal', g.s1 - 0.26, g.s1 - 0.2, PLINTH + 0.95, PLINTH + 1.1, 0.06, 0.12, [0.06, 0.06, 0.06]);
        }
        for (const [a, c] of [[g.s0 - 0.04, g.s0 + 0.1], [g.s1 - 0.1, g.s1 + 0.04]]) on(f, 'wood', a, c, PLINTH, g.y1 + 0.02, -0.03, 0.2, OAK, true);
        on(f, 'wood', g.s0 - 0.1, g.s1 + 0.1, g.y1 - 0.1, g.y1 + 0.1, -0.04, 0.2, OAK, true);
        on(f, 'stone', g.s0 - 0.25, g.s1 + 0.25, 0, PLINTH - 0.1, -0.55, 0.02, shade(stone, 0.9));
        on(f, 'stone', g.s0 - 0.12, g.s1 + 0.12, 0, PLINTH, -0.28, 0.02, shade(stone, 0.95));
      } else {
        glazed(f, g, 2, i === 0 ? 3 : 2, frame, 0.2);
        on(f, 'stone', g.s0 - 0.08, g.s1 + 0.08, g.y0 - 0.1, g.y0, -0.15, 0.2, shade(stone, 0.95));
        on(f, 'wood', g.s0 - 0.08, g.s1 + 0.08, g.y1, g.y1 + 0.14, -0.03, 0.14, OAK, true);
        // Inside, a board for a sill across the depth of the wall.
        on(f, 'wood', g.s0 - 0.04, g.s1 + 0.04, g.y0 - 0.05, g.y0, 0.27, 0.6, shade(OAK, 1.5), true);
        if (i === 0) for (const [a, c] of [[g.s0 - 0.52, g.s0 - 0.02], [g.s1 + 0.02, g.s1 + 0.52]]) {
          // Shutters, of boards with two ledges across them, standing open against the wall.
          on(f, 'wood', a, c, g.y0, g.y1, -0.035, 0, paint, true);
          for (const y of [g.y0 + 0.14, g.y1 - 0.22]) on(f, 'wood', a + 0.02, c - 0.02, y, y + 0.08, -0.055, -0.03, shade(paint, 0.8), true);
        }
      }
    }
  });
  // A bench by the door, for the evening.
  {
    const f = ground[0], s = doorAt > W / 2 ? doorAt - 2.3 : doorAt + 1.0;
    on(f, 'wood', s, s + 1.3, 0.42, 0.47, -0.42, -0.04, shade(OAK, 1.5), true);
    for (const leg of [s + 0.08, s + 1.14]) on(f, 'wood', leg, leg + 0.08, 0, 0.42, -0.38, -0.08, shade(OAK, 1.3), true);
  }

  // The storeys of framing.
  for (let storey = 1; storey < b.storeys; storey++) {
    const y0 = floorOf(storey), y1 = floorOf(storey + 1), sill = y0 + 0.98, head = Math.min(sill + 0.14 + 1.08, y1 - 0.36), fr = frontOf(storey);
    // What carries it out over the street: the ends of the floor joists, a board under them, and a bracket at each end.
    box('wood', -W / 2, W / 2, y0 - 0.2, y0 - 0.14, fr - 0.02, frontOf(storey - 1) + 0.06, shade(OAK, 0.9), true);
    for (let u = -W / 2 + 0.2; u < W / 2 - 0.1; u += 0.52) box('wood', u, u + 0.13, y0 - 0.34, y0 - 0.2, fr + 0.02, frontOf(storey - 1) + 0.1, OAK, true);
    for (const u of [-W / 2 + 0.11, W / 2 - 0.11]) stick(at(u, y0 - 0.9, frontOf(storey - 1) - 0.02), at(u, y0 - 0.3, fr + 0.08), 0.14, 0.14, OAK);
    k.walls(fr).forEach((f, i) => {
      const bays = Math.max(2, Math.round(f.L / 1.55)), pitch = f.L / bays;
      // Which bays have windows: on the street as many as the house has, spread evenly; elsewhere every other bay, or one.
      const lit = new Set<number>(timberWindows(b, storey)[i].map(([s0]) => Math.round((s0 - 0.2) / pitch)));
      const gaps: Gap[] = [...lit].map((n) => ({ s0: n * pitch + 0.2, s1: (n + 1) * pitch - 0.2, y0: sill + 0.14, y1: head }));
      // Over a half basement, a door in the back wall onto the ground there, which stands at this storey's floor: a bay of the frame,
      // its sill the sill beam's top.
      const bd = storey === 1 && i === 2 ? timberBackDoor(b) : null, back: Gap | null = bd ? { s0: bd.s0, s1: bd.s1, y0: y0 + 0.2, y1: Math.min(y0 + 2.15, y1 - 0.3) } : null;
      if (back) gaps.push(back);
      // (Each layer of the frame stands at its own depth, a centimetre and more from the next, so that no two faces lie in one plane and
      // flicker against each other: posts and beams in front, rails and studs behind them, the braces behind those, the plaster at the back.)
      pierced(f, 'plaster', 0.05, f.L - 0.05, y0, y1, PANEL, T, b.colour, gaps);
      // Sill beam and head beam, posts, and the rail under the windows.
      // (The sill beam stands a centimetre and a half proud: it reaches down over the top of the wall below, the stone ground storey's on
      // the sides and the back, and the head beam of the storey under it, and in one plane with them its face flickered against theirs.)
      on(f, 'wood', 0, f.L, y0 - 0.14, y0 + 0.2, -0.015, 0.2, OAK, true);
      on(f, 'wood', 0, f.L, y1 - 0.2, y1, 0, 0.2, OAK, true);
      for (let n = 0; n <= bays; n++) {
        const half = n === 0 || n === bays ? 0.11 : 0.085, s = Math.min(f.L - half, Math.max(half, n * pitch));
        on(f, 'wood', s - half, s + half, y0 + 0.2, y1 - 0.2, 0, 0.18, OAK, true);
      }
      for (const [ra, rb] of back ? [[0.1, back.s0], [back.s1, f.L - 0.1]] : [[0.1, f.L - 0.1]]) on(f, 'wood', ra, rb, sill, sill + 0.14, RAIL, 0.17, OAK, true);
      for (let n = 0; n < bays; n++) {
        const a = n * pitch + 0.09, c = (n + 1) * pitch - 0.09;
        if (back && n === bd!.bay) {
          // The door: upright boards in the colour of the shutters, two iron straps, a ring, and a head of oak over it.
          const tones = [0.95, 1.05, 0.92, 1.08, 1.0], wide = (back.s1 - back.s0) / 5;
          for (let m = 0; m < 5; m++) on(f, 'wood', back.s0 + m * wide, back.s0 + (m + 1) * wide - 0.008, back.y0, back.y1, 0.1, 0.16, shade(paint, tones[m]), true);
          for (const y of [back.y0 + 0.3, back.y1 - 0.45]) on(f, 'metal', back.s0 + 0.05, back.s1 - 0.05, y, y + 0.07, 0.08, 0.1, [0.05, 0.05, 0.055]);
          on(f, 'metal', back.s1 - 0.24, back.s1 - 0.17, back.y0 + 0.9, back.y0 + 1.05, 0.05, 0.1, [0.06, 0.06, 0.06]);
          on(f, 'wood', a, c, back.y1, back.y1 + 0.14, RAIL, 0.17, OAK, true);
          continue;
        }
        if (lit.has(n)) {
          const g = gaps.find((q) => Math.abs(q.s0 - (n * pitch + 0.2)) < 0.01)!;
          on(f, 'wood', a, c, head, head + 0.13, RAIL, 0.17, OAK, true);
          for (const [p, q] of [[a, g.s0], [g.s1, c]]) on(f, 'wood', p, q, sill + 0.14, head, RAIL, 0.16, OAK, true);
          glazed(f, g, 2, 2, frame, 0.07);
          // Under a window, more often than not, a cross.
          if (rng.chance(0.65)) {
            stick(f.P(a, y0 + 0.2, BRACE + 0.08), f.P(c, sill, BRACE + 0.08), 0.16, 0.11, OAK);
            stick(f.P(c, y0 + 0.2, CROSS + 0.075), f.P(a, sill, CROSS + 0.075), 0.15, 0.11, OAK);
          } else on(f, 'wood', (a + c) / 2 - 0.06, (a + c) / 2 + 0.06, y0 + 0.2, sill, RAIL, 0.16, OAK, true);
          if (i === 0) {
            for (const [p, q] of [[g.s0 - 0.36, g.s0 - 0.01], [g.s1 + 0.01, g.s1 + 0.36]]) on(f, 'wood', p, q, g.y0, g.y1, -0.03, 0.005, paint, true);
            // A box of flowers on the sill.
            on(f, 'wood', g.s0 - 0.05, g.s1 + 0.05, sill + 0.02, sill + 0.2, -0.2, -0.01, shade(OAK, 1.4), true);
            for (let s = g.s0; s < g.s1 - 0.05; s += 0.14) on(f, 'leaf', s, s + 0.12, sill + 0.2, sill + 0.27 + 0.1 * rng.next(), -0.19 + 0.05 * rng.next(), -0.03, rng.chance(0.55) ? [0.7, 0.07, 0.1] : [0.16, 0.36, 0.1]);
          }
        } else {
          // A brace from the foot of one post to the head of the next, leaning the way of its neighbours on that side of the wall.
          const lean = n < bays / 2;
          stick(f.P(lean ? a : c, y0 + 0.2, BRACE + 0.08), f.P(lean ? c : a, y1 - 0.2, BRACE + 0.08), 0.16, 0.13, OAK);
          if (y1 - sill > 1.45) on(f, 'wood', a, c, sill + 1.0, sill + 1.1, RAIL, 0.16, OAK, true);
        }
      }
    });
  }

  // The roof. A gable is framed as the walls are: rafters, a collar, a post, and a small window for the loft.
  const pitch = Math.tan(((b.gable ? 56 : 52) * Math.PI) / 180), eave = 0.45, verge = 0.38, tile: [string, Colour] = ['tile', [1.15, 1.08, 1.02]], dark: [string, Colour] = ['wood', shade(OAK, 0.8)];
  // The boards along a roof's sloping edges (0.24 broad) cover the end of its slopes (0.16 thick): their middle is put 0.06 under the
  // tiles, square to the slope, so that they stand that much proud of the tiles and come 0.02 below the boarding under them. (They
  // stood higher, and a strip of the slope's end, a couple of centimetres of it, showed under them; facing the street, it was in the
  // sun while the boarding beside it was in shade, and drew a lit line in the angle under the board.) And they are let two centimetres
  // into the slope's end, standing three out from it: the boarding's edge is rounded in the shading (`edgeOf`), which turns it towards
  // the street over its last centimetre and more, and with less of it hidden that edge still drew a thin light line along the angle.
  const board = 0.06 * Math.hypot(1, pitch), boardOut = 0.005;
  const gableWall = (f: Face, y: number, t: number) => {
    const half = f.L / 2, rise = half * pitch, mid = f.P(half, y + rise, t);
    const into = f.P(0, 0, 0.26).sub(f.P(0, 0, 0));
    wedge(f.P(0, y, t + PANEL), f.P(f.L, y, t + PANEL), f.P(half, y + rise, t + PANEL), into, ['plaster', b.colour], ['plaster', b.colour]);
    const collar = y + rise * 0.48, inAt = (h: number) => (h - y) / pitch;
    // (The two rafters meet at the top, so they too stand at different depths.)
    stick(f.P(0.05, y + 0.05, t + BRACE + 0.08), f.P(half, y + rise - 0.1, t + BRACE + 0.08), 0.16, 0.16, OAK);
    stick(f.P(f.L - 0.05, y + 0.05, t + CROSS + 0.08), f.P(half, y + rise - 0.1, t + CROSS + 0.08), 0.16, 0.16, OAK);
    on(f, 'wood', inAt(collar) + 0.1, f.L - inAt(collar) - 0.1, collar, collar + 0.14, t, t + 0.18, OAK, true);
    on(f, 'wood', half - 0.07, half + 0.07, collar + 0.14, y + rise - 0.25, t + RAIL, t + 0.17, OAK, true);
    for (const side of [-1, 1]) on(f, 'wood', half + side * half * 0.5 - 0.07, half + side * half * 0.5 + 0.07, y, y + rise * 0.5 - 0.12, t + RAIL, t + 0.17, OAK, true);
    const g: Gap = { s0: half - 0.36, s1: half + 0.36, y0: y + 0.5, y1: Math.min(collar - 0.08, y + 1.4) };
    on(f, 'wood', g.s0 - 0.09, g.s1 + 0.09, g.y0 - 0.1, g.y1 + 0.1, t + RAIL, t + 0.15, OAK, true);
    glazed(f, g, 2, 1, frame, t - 0.02);
    return mid;
  };
  const upper = k.walls(front);
  if (burnt) {
    // (No roof: a burnt house is open to the sky, and its gables fell with the roof.)
  } else if (b.gable) {
    const rise = (W / 2 + eave) * pitch, drop = eave * pitch;
    gableWall(upper[0], top, 0);
    gableWall(upper[2], top, 0);
    // Two slopes that meet at a ridge, standing out past the gables and over the walls; and a line of ridge tiles to close the joint.
    for (const side of [-1, 1]) slope([at(side * (W / 2 + eave), top - drop, front - verge), at(side * (W / 2 + eave), top - drop, D + verge), at(0, top - drop + rise, D + verge), at(0, top - drop + rise, front - verge)], tile, dark[1]);
    box('tile', -0.13, 0.13, top - drop + rise - 0.06, top - drop + rise + 0.07, front - verge, D + verge, [0.95, 0.85, 0.8]);
    // Boards along the edge of the roof over the street.
    for (const side of [-1, 1]) stick(at(side * (W / 2 + eave), top - drop - board, front - verge - boardOut), at(0, top - drop + rise - board, front - verge - boardOut), 0.05, 0.24, shade(OAK, 0.9));
  } else {
    const span = D - front, rise = (span / 2 + eave) * pitch, drop = eave * pitch, mid = front + span / 2;
    gableWall(upper[1], top, 0);
    gableWall(upper[3], top, 0);
    for (const v of [front - eave, D + eave]) slope([at(-W / 2 - verge, top - drop, v), at(W / 2 + verge, top - drop, v), at(W / 2 + verge, top - drop + rise, mid), at(-W / 2 - verge, top - drop + rise, mid)], tile, dark[1]);
    box('tile', -W / 2 - verge, W / 2 + verge, top - drop + rise - 0.06, top - drop + rise + 0.07, mid - 0.13, mid + 0.13, [0.95, 0.85, 0.8]);
    for (const end of [-W / 2 - verge - boardOut, W / 2 + verge + boardOut]) for (const v of [front - eave, D + eave]) stick(at(end, top - drop - board, v), at(end, top - drop + rise - board, mid), 0.05, 0.24, shade(OAK, 0.9));
    // Dormers in the slope over the street: a small framed front with a window, and a roof of its own.
    const dormers = b.bays >= 3 ? 2 : 1;
    for (let n = 0; n < dormers; n++) {
      const u = dormers === 1 ? 0 : (n ? 1 : -1) * W * 0.24, v0 = front + 0.55, y0 = top + (v0 - front + eave) * pitch - drop, h = 1.25, w = 0.62;
      box('plaster', u - w, u + w, y0 - 0.5, y0 + h, v0 + PANEL, v0 + 1.6, b.colour);
      for (const side of [-1, 1]) box('wood', u + side * w - 0.07, u + side * w + 0.07, y0 - 0.5, y0 + h, v0, v0 + 0.16, OAK, true);
      box('wood', u - w, u + w, y0 + h - 0.12, y0 + h, v0 + RAIL, v0 + 0.16, OAK, true);
      box('wood', u - w, u + w, y0 + 0.12, y0 + 0.24, v0 + RAIL, v0 + 0.16, OAK, true);
      const f: Face = { L: w * 2, P: (s, y, t) => at(u - w + s, y, v0 + t) };
      glazed(f, { s0: 0.12, s1: w * 2 - 0.12, y0: y0 + 0.3, y1: y0 + h - 0.18 }, 2, 1, frame, 0.02);
      wedge(at(u - w - 0.2, y0 + h, v0 - 0.22), at(u + w + 0.2, y0 + h, v0 - 0.22), at(u, y0 + h + (w + 0.2) * 1.15, v0 - 0.22), at(0, 0, 2.6).sub(at(0, 0, 0)), tile, ['plaster', b.colour], dark);
    }
  }
  // The chimney: stone, with a slab on it and two pots.
  {
    const u = b.gable ? (rng.chance(0.5) ? 1 : -1) * W * 0.2 : W * rng.range(-0.25, 0.25), v = b.gable ? D * rng.range(0.45, 0.7) : front + (D - front) / 2 + 0.6;
    const ridge = top + (b.gable ? W / 2 : (D - front) / 2) * pitch;
    box('stone', u - 0.34, u + 0.34, top + 0.4, ridge + 0.75, v - 0.3, v + 0.3, shade(stone, 0.72));
    box('stone', u - 0.42, u + 0.42, ridge + 0.75, ridge + 0.85, v - 0.38, v + 0.38, shade(stone, 0.6));
    for (const side of [-1, 1]) box('tile', u + side * 0.17 - 0.09, u + side * 0.17 + 0.09, ridge + 0.85, ridge + 1.12, v - 0.09, v + 0.09, [0.9, 0.8, 0.75]);
    tops?.push(at(u, ridge + 1.12, v));
  }
  // A cellar under it, where the land falls away behind it: walls of rough stone from under its floor down to the cellar's, a little
  // proud of the walls over them, and in the back wall a door of boards in a frame of oak under a stone lintel, and a small window
  // with iron bars beside it.
  if (b.cellar) {
    const C = b.cellar, under = shade(stone, 0.74), floor = -C;
    box('stone', -W / 2 - 0.1, W / 2 + 0.1, floor - 0.35, 0.02, -0.1, D + 0.1, under);
    const side = (b.door ?? 0.24) < 0.5 ? 1 : -1, du = side * W * 0.22, half = 0.5, top = floor + 1.9, dark: Colour = [0.03, 0.03, 0.035];
    box('wood', du - half, du + half, floor, top, D + 0.1, D + 0.16, shade(paint, 0.9), true);
    for (const e of [du - half - 0.12, du + half]) box('wood', e, e + 0.12, floor, top + 0.06, D + 0.1, D + 0.2, OAK, true);
    for (const y of [floor + 0.35, top - 0.4]) box('metal', du - half + 0.05, du + half - 0.05, y, y + 0.07, D + 0.16, D + 0.18, [0.05, 0.05, 0.055]);
    box('stone', du - half - 0.3, du + half + 0.3, top + 0.06, top + 0.32, D + 0.1, D + 0.24, shade(stone, 0.9));
    const wu = du - side * 1.6;
    box('metal', wu - 0.35, wu + 0.35, floor + 1.05, floor + 1.55, D + 0.1, D + 0.12, dark);
    for (let m = -1; m <= 1; m++) box('metal', wu + m * 0.18 - 0.02, wu + m * 0.18 + 0.02, floor + 1.05, floor + 1.55, D + 0.12, D + 0.16, [0.05, 0.05, 0.055]);
    box('stone', wu - 0.45, wu + 0.45, floor + 0.95, floor + 1.05, D + 0.1, D + 0.22, shade(stone, 0.9));
  }
  // ------------------------------------------------------------------ inside
  // The rooms are as the site document plans them. A hall along one side with the stair in it,
  // the room beside it; landings and chambers above. Floors are boards on the joists whose ends
  // show under each storey outside; the walls between rooms are framed and filled as the outer
  // walls are, and the stair is a steep one of oak, boxed in below and with a screen of slats
  // along its open side, which is also what keeps anyone on a landing out of the well.
  if (b.plan) {
    const plan = b.plan, st = timberStair(b), G = TIMBER.ground, F = (storey: number) => timberFloor(b, storey);
    const boards: Colour = [0.36, 0.26, 0.16], linen: Colour = [0.8, 0.77, 0.7], iron: Colour = [0.05, 0.05, 0.055], away = -st.side;
    type Rect = { u0: number; u1: number; v0: number; v1: number };
    const without = (r: Rect, hole: Rect): Rect[] => [
      { u0: r.u0, u1: r.u1, v0: r.v0, v1: Math.min(r.v1, hole.v0) },
      { u0: r.u0, u1: r.u1, v0: Math.max(r.v0, hole.v1), v1: r.v1 },
      { u0: r.u0, u1: Math.min(r.u1, hole.u0), v0: Math.max(r.v0, hole.v0), v1: Math.min(r.v1, hole.v1) },
      { u0: Math.max(r.u0, hole.u1), u1: r.u1, v0: Math.max(r.v0, hole.v0), v1: Math.min(r.v1, hole.v1) },
    ].filter((q) => q.u1 - q.u0 > 0.01 && q.v1 - q.v0 > 0.01);
    const well: Rect = { u0: st.u0, u1: st.u1, v0: st.v0, v1: st.v1 };
    // A block between two places across the house (given as distances from the side wall the stair is on, or as `u`), whichever way round they come.
    const span = (material: string, ua: number, ub: number, y0: number, y1: number, v0: number, v1: number, colour: Colour, grain = false) => box(material, Math.min(ua, ub), Math.max(ua, ub), y0, y1, v0, v1, colour, grain);

    // The floors, and over the top storey its ceiling; under each, its joists.
    for (let storey = 1; storey <= b.storeys; storey++) {
      const ceiling = storey === b.storeys, y = floorOf(storey), fr = frontOf(Math.min(storey, b.storeys - 1));
      const all: Rect = { u0: -W / 2 + 0.25, u1: W / 2 - 0.25, v0: fr + 0.2, v1: D - 0.25 }, under = ceiling ? y : y - 0.13;
      // (A burnt house has lost its ceiling with its roof.)
      if (ceiling && burnt) continue;
      for (const r of ceiling ? [all] : without(all, well)) box('wood', r.u0, r.u1, under, ceiling ? y + 0.1 : y + 0.012, r.v0, r.v1, boards, true);
      const below = storey - 1, t = below === 0 ? G : T, deep = ceiling ? 0.15 : 0.2, a = frontOf(below) + t - 0.02, c = D - t + 0.02;
      for (let u = -W / 2 + 0.2; u < W / 2 - 0.1; u += 0.52) {
        const cut = !ceiling && u + 0.13 > well.u0 && u < well.u1;
        for (const [p, q] of cut ? [[a, well.v0 - 0.02], [well.v1 + 0.02, c]] : [[a, c]]) box('wood', u, u + 0.13, under - deep, under, p, q, OAK, true);
      }
      // (Round the well, a trimmer at each end to carry the joists that are cut short.)
      if (!ceiling) for (const v of [well.v0 - 0.14, well.v1 + 0.02]) box('wood', well.u0 - 0.12, well.u1 + 0.12, under - deep, under, v, v + 0.12, OAK, true);
    }
    // The room's floor is boarded; the hall's is the stone of the plinth.
    for (const r of plan.rooms) if (r.storey === 0 && r.kind === 'front') box('wood', r.u0, r.u1, F(0), F(0) + 0.02, r.v0, r.v1, boards, true);

    // A framed wall between rooms: a plate along its top, posts, a rail, the panels between washed white, and its doorways framed in oak.
    const framed = (line: 'u' | 'v', where: number, from: number, to: number, y0: number, y1: number, doors: { c: number; w: number }[]) => {
      const put = (material: string, a: number, c: number, lo: number, hi: number, half: number, colour: Colour, grain = false) => {
        if (c - a < 0.01) return;
        if (line === 'u') box(material, where - half, where + half, lo, hi, a, c, colour, grain); else box(material, a, c, lo, hi, where - half, where + half, colour, grain);
      };
      const head = Math.min(y0 + 1.98, y1 - 0.3), sorted = [...doors].sort((p, q) => p.c - q.c), panels: [number, number][] = [];
      let s = from;
      for (const d of sorted) {
        panels.push([s, d.c - d.w / 2]);
        put('plaster', d.c - d.w / 2, d.c + d.w / 2, head + 0.1, y1, 0.04, LIMEWASH);
        for (const e of [d.c - d.w / 2 - 0.1, d.c + d.w / 2]) put('wood', e, e + 0.1, y0, y1, 0.07, OAK, true);
        put('wood', d.c - d.w / 2, d.c + d.w / 2, head, head + 0.12, 0.07, OAK, true);
        s = d.c + d.w / 2;
      }
      panels.push([s, to]);
      for (const [a, c] of panels) {
        put('plaster', a, c, y0, y1, 0.04, LIMEWASH);
        put('wood', a, c, y0 + 1.0, y0 + 1.1, 0.062, OAK, true);
        const n = Math.max(1, Math.round((c - a) / 1.3));
        for (let k = 0; k <= n; k++) { const p = a + ((c - a) * k) / n; put('wood', Math.max(a, p - 0.06), Math.min(c, p + 0.06), y0, y1, 0.07, OAK, true); }
      }
      put('wood', from, to, y1 - 0.14, y1, 0.07, OAK, true);
    };
    for (let storey = 0; storey < b.storeys; storey++) {
      const y0 = F(storey), y1 = storey === b.storeys - 1 ? top : floorOf(storey + 1) - 0.13;
      const rooms = plan.rooms.filter((r) => r.storey === storey), doors = plan.doors.filter((d) => d.storey === storey && d.line === 'u');
      const hall = rooms.find((r) => r.kind === 'hall' || r.kind === 'passage')!, others = rooms.filter((r) => r !== hall);
      framed('u', doors[0].at, hall.v0, hall.v1, y0, y1, doors);
      if (others.length === 2) framed('v', (others[0].v1 + others[1].v0) / 2, others[0].u0, others[0].u1, y0, y1, []);

      // What stands in the rooms.
      for (const r of others) {
        const near = st.side < 0 ? r.u0 : r.u1, far = st.side < 0 ? r.u1 : r.u0, oak: Colour = [0.3, 0.2, 0.12];
        if (storey === 0) {
          // By the outer wall, under the windows to the street, a table with a bench on either side of it; in the inn, another further back.
          for (const v of first && r.v1 - r.v0 > 4.6 ? [r.v0 + 0.45, r.v1 - 2.1] : [r.v0 + 0.45]) {
            span('wood', far - away * 0.5, far - away * 1.25, y0 + 0.72, y0 + 0.78, v, v + 1.5, oak, true);
            for (const [du, dv] of [[0.54, 0.06], [1.15, 0.06], [0.54, 1.38], [1.15, 1.38]]) span('wood', far - away * du, far - away * (du + 0.06), y0, y0 + 0.72, v + dv, v + dv + 0.06, oak, true);
            for (const du of [0.08, 1.36]) {
              span('wood', far - away * du, far - away * (du + 0.3), y0 + 0.42, y0 + 0.47, v + 0.05, v + 1.45, oak, true);
              for (const dv of [0.12, 1.3]) span('wood', far - away * (du + 0.04), far - away * (du + 0.26), y0, y0 + 0.42, v + dv, v + dv + 0.06, oak, true);
            }
          }
          // Against the wall of the hall, from which it is fed, a stove of green tiles on a stone foot.
          const v = (r.v0 + r.v1) / 2 + 0.3, tiles: Colour = [0.2, 0.34, 0.24];
          span('stone', near + away * 0.03, near + away * 0.71, y0, y0 + 0.22, v - 0.03, v + 0.83, [0.3, 0.3, 0.3]);
          span('metal', near + away * 0.06, near + away * 0.68, y0 + 0.22, y0 + 1.5, v, v + 0.8, tiles);
          span('metal', near + away * 0.03, near + away * 0.71, y0 + 1.5, y0 + 1.6, v - 0.03, v + 0.83, tiles);
          span('metal', near + away * 0.14, near + away * 0.6, y0 + 1.6, y0 + 1.85, v + 0.08, v + 0.72, tiles);
        } else {
          // A bed along the outer wall, its head to the wall between the chambers, and a chest.
          const head = r.kind === 'front' ? r.v1 - 0.06 : r.v0 + 0.06, way = r.kind === 'front' ? -1 : 1, foot = head + way * 1.9;
          const lie = (material: string, du0: number, du1: number, lo: number, hi: number, d0: number, d1: number, colour: Colour, grain = false) => span(material, far - away * du0, far - away * du1, lo, hi, Math.min(head + way * d0, head + way * d1), Math.max(head + way * d0, head + way * d1), colour, grain);
          lie('wood', 0.06, 1.0, y0 + 0.14, y0 + 0.34, 0, 1.9, oak, true);
          for (const [du, dd] of [[0.06, 0], [0.92, 0], [0.06, 1.82], [0.92, 1.82]]) lie('wood', du, du + 0.08, y0, y0 + (dd ? 0.5 : 0.95), dd, dd + 0.08, oak, true);
          lie('wood', 0.06, 1.0, y0 + 0.5, y0 + 0.95, 0, 0.05, oak, true);
          lie('plaster', 0.1, 0.96, y0 + 0.34, y0 + 0.46, 0.08, 1.82, linen);
          lie('plaster', 0.2, 0.86, y0 + 0.46, y0 + 0.55, 0.1, 0.5, linen);
          lie('plaster', 0.08, 0.98, y0 + 0.44, y0 + 0.5, 0.62, 1.84, shade(b.colour, 0.55));
          void foot;
          const cv = r.kind === 'front' ? r.v1 - 1.05 : r.v0 + 0.1;
          span('wood', near + away * 0.1, near + away * 0.55, y0, y0 + 0.45, cv, cv + 0.95, shade(oak, 0.85), true);
          span('wood', near + away * 0.08, near + away * 0.57, y0 + 0.45, y0 + 0.5, cv - 0.02, cv + 0.97, oak, true);
          for (const dv of [0.15, 0.75]) span('metal', near + away * 0.09, near + away * 0.56, y0, y0 + 0.51, cv + dv, cv + dv + 0.05, iron);
        }
      }
    }

    // The stair.
    const rail = st.at(G + TIMBER.stair + 0.04), length = st.v1 - st.v0;
    st.flights.forEach((f, k) => {
      const y = F(k), up = F(k + 1) - y, railY = (v: number) => y + 0.95 + (up * (v - st.v0)) / length;
      for (let i = 0; i < f.steps - 1; i++) {
        const va = st.v0 + i * f.tread, step = y + (i + 1) * f.rise;
        // (The lowest flight is boxed in to the floor. Those above are treads only, boards let into a string at each side: a flight
        // with risers would hang too low over the heads of those coming up the flight beneath it, where the storey is a low one.)
        if (k === 0) box('wood', st.u0, st.u1, y, step, va, va + f.tread, shade(boards, 0.9), true, 0.01);
        else box('wood', st.u0, st.u1, step - 0.05, step, va - 0.02, va + f.tread, shade(boards, 0.9), true, 0.01);
        box('wood', rail - 0.022, rail + 0.022, k === 0 ? step : y, railY(va + f.tread / 2), va + f.tread / 2 - 0.022, va + f.tread / 2 + 0.022, OAK, true);
      }
      if (k > 0) for (const u of [st.u0 + 0.025, st.u1 - 0.025]) stick(at(u, y + f.rise - 0.16, st.v0), at(u, y + up - 0.16, st.v1 - f.tread), 0.05, 0.24, OAK);
      stick(at(rail, railY(st.v0), st.v0), at(rail, railY(st.v1), st.v1), 0.07, 0.08, OAK);
      box('wood', rail - 0.05, rail + 0.05, y, railY(st.v0) + 0.1, st.v0 - 0.05, st.v0 + 0.05, OAK, true);
      box('wood', rail - 0.05, rail + 0.05, k === 0 ? y + up - f.rise : y, railY(st.v1) + 0.1, st.v1 - 0.05, st.v1 + 0.05, OAK, true);
    });
    if (b.storeys > 1) {
      // On the top floor nothing goes up, and the well has a rail along it and across its end.
      const y = F(b.storeys - 1), wall = st.at(T), end = st.v0 - 0.04;
      stick(at(rail, y + 0.95, end), at(rail, y + 0.95, st.v1), 0.07, 0.08, OAK);
      stick(at(rail, y + 0.95, end), at(wall, y + 0.95, end), 0.07, 0.08, OAK);
      for (let v = st.v0 + 0.1; v < st.v1 - 0.05; v += 0.2) box('wood', rail - 0.022, rail + 0.022, y, y + 0.95, v - 0.022, v + 0.022, OAK, true);
      for (let u = Math.min(rail, wall) + 0.12; u < Math.max(rail, wall) - 0.06; u += 0.2) box('wood', u - 0.022, u + 0.022, y, y + 0.95, end - 0.022, end + 0.022, OAK, true);
      for (const v of [end, st.v1]) box('wood', rail - 0.05, rail + 0.05, y, y + 1.05, v - 0.05, v + 0.05, OAK, true);
    }
    // The door stands open, back against the wall of the hall; and at the back of the hall, behind the stair, a barrel.
    {
      const m = (st.side < 0 ? doorAt : W - doorAt) + 0.56, y = F(0);
      span('wood', st.at(m), st.at(m + 0.05), y + 0.02, y + 1.98, G + 0.02, G + 1.0, paint, true);
      for (const h of [0.3, 1.55]) span('metal', st.at(m - 0.02), st.at(m), y + h, y + h + 0.07, G + 0.06, G + 0.96, iron);
      span('wood', st.at(G + 0.12), st.at(G + 0.68), y, y + 0.85, st.v1 + 0.15, st.v1 + 0.71, shade(OAK, 1.3), true);
      for (const h of [0.15, 0.65]) span('metal', st.at(G + 0.1), st.at(G + 0.7), y + h, y + h + 0.05, st.v1 + 0.13, st.v1 + 0.73, iron);
    }
  }
  // In a burnt house, what fell when the roof burnt lies on the floor of each storey: charred beams, at angles, one end propped on another.
  if (burnt) {
    const fall = rng.fork('fallen');
    for (let storey = 0; storey < b.storeys; storey++) {
      const y = storey === 0 ? PLINTH + 0.18 : floorOf(storey), fr = frontOf(storey) + 0.6;
      for (let n = 0; n < 3; n++) {
        const u0 = fall.range(-W / 2 + 0.8, W / 2 - 0.8), v0 = fall.range(fr + 0.4, D - 1), a = fall.range(0, Math.PI), len = fall.range(1.8, 3.2);
        const u1 = Math.max(-W / 2 + 0.5, Math.min(W / 2 - 0.5, u0 + Math.cos(a) * len)), v1 = Math.max(fr, Math.min(D - 0.6, v0 + Math.sin(a) * len));
        stick(at(u0, y + 0.1, v0), at(u1, y + 0.1 + fall.range(0, 0.7), v1), 0.16, 0.18, OAK);
      }
    }
  }
  // The first house of a row is the inn, and hangs out its sign.
  if (first && !burnt) {
    const y = floorOf(1) + 1.75, u = doorAt - W / 2 + (doorAt > W / 2 ? -0.9 : 0.9), v = frontOf(1);
    box('metal', u - 0.025, u + 0.025, y, y + 0.05, v - 1.05, v + 0.02, [0.05, 0.05, 0.055]);
    stick(at(u, y - 0.45, v + 0.02), at(u, y, v - 0.6), 0.03, 0.03, [0.05, 0.05, 0.055], 'metal');
    box('wood', u - 0.03, u + 0.03, y - 0.68, y - 0.1, v - 0.98, v - 0.38, paint, true);
    box('wood', u - 0.04, u + 0.04, y - 0.52, y - 0.26, v - 0.84, v - 0.52, [0.78, 0.62, 0.2], true);
  }
}

/**
 * A stuccoed classical building. A plinth of grey stone; a ground storey of rusticated work, in
 * courses with the joints struck deep; a moulded band; then the tall windows of the principal
 * storey, each in a moulded surround with a cornice over it on brackets, or a small pediment in
 * every other bay; lower storeys of plainer windows over that, as many as it has; pilaster strips
 * at the corners; a deep cornice on blocks, a low wall above it, and a low hipped roof of sheet
 * metal laid in seams. With a portico, the middle three bays stand forward under four pilasters
 * and a pediment, and the door, up three steps, is in the middle of them. Walls are washed with
 * the building's colour and everything moulded is white.
 *
 * Inside, it is planned as such houses were, from its bays. The middle is the way in and the way
 * up: where the middle is three bays broad, an entrance hall to the front and behind it a hall
 * with the stair, two flights and a landing along its back wall; where it is one bay, a passage
 * through the house with the stair at its far end. Either side is a wing of rooms in two rows, a
 * front row and a back, each room one to three bays broad, the two wings alike. Doors stand in a
 * line from room to room along the front, a stride in from the windows, so that from one end of
 * the house the other is seen through every door between; each front room opens into the room
 * behind it; and every storey is planned the same. Each room has its own colour, a skirting, a
 * rail at the height of a chair's back and a cornice; the front rooms have a stove of glazed
 * tiles in the corner.
 */
function imperialHouse(b: Building, base: number, mesh: (material: string) => MeshBuilder, rng: Rng, stone: Colour, tops?: Vector3[]): void {
  // Brick: everything laid in plaster of the wash outside becomes brick, and in a building of bare brick the white dressings too, a
  // little paler, as moulded brick is. The inside is left as it is (the hook is turned off before the rooms are built).
  const bk = rng.fork('brick'), brickTone: Colour = bk.pick([[1, 1, 1], [1.08, 0.98, 0.92], [0.86, 0.84, 0.82], [1.12, 1.04, 0.96]] as Colour[]);
  const dressTone: Colour = shade([brickTone[0] * 1.12, brickTone[1] * 1.05, brickTone[2] * 1.0], 1);
  const same = (a: Colour, c: Colour) => a[0] === c[0] && a[1] === c[1] && a[2] === c[2];
  const dress: Dress = {
    active: !!b.brick,
    map: (material, colour) => material !== 'plaster' ? null : same(colour, b.colour) ? ['brick', brickTone] : b.brick === 'bare' && same(colour, WHITE) ? ['brick', dressTone] : null,
  };
  const k = buildingTools(b, base, mesh, dress), { at, box, on, stick, pierced, glazed, wedge, poly, block, cuboid } = k;
  // A wing that leans is built in its own measures, as if it stood square, turned about the back corner of its end (`wingFrame`):
  // `atIn` is where a point of a frame is, `boxIn` a block laid square to it. (A frame of nothing is the building's own.)
  const frames = new Map((b.wings ?? []).map((g) => [g.side, wingFrame(b, g)] as const));
  const atIn = (side: -1 | 1 | undefined) => {
    const wf = side === undefined ? undefined : frames.get(side);
    return !wf?.leans ? at : (u: number, y: number, v: number) => { const [uu, vv] = wf.to(u, v); return at(uu, y, vv); };
  };
  const boxIn = (side: -1 | 1 | undefined) => {
    if (side === undefined || !frames.get(side)?.leans) return box;
    const A = atIn(side);
    return (material: string, u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, colour: Colour, grain = false) =>
      cuboid(material, [A(u0, y0, v0), A(u1, y0, v0), A(u1, y1, v0), A(u0, y1, v0), A(u0, y0, v1), A(u1, y0, v1), A(u1, y1, v1), A(u0, y1, v1)], colour, grain);
  };
  /** A solid standing on a figure of the building's ground (`ring`, points `u`, `v` round in order, bending one way), from `y0` to `y1`. */
  const prism = (material: string, ring: [number, number][], y0: number, y1: number, colour: Colour, A = at) => {
    if (y1 - y0 < 0.005 || ring.length < 3) return;
    const lo = ring.map(([u, v]) => A(u, y0, v)), hi = ring.map(([u, v]) => A(u, y1, v)), mid = lo.reduce((t, p) => t.add(p), new Vector3()).multiplyScalar(1 / lo.length).add(new Vector3(0, (y1 - y0) / 2, 0));
    poly(material, hi, colour, new Vector3(0, 1, 0));
    poly(material, lo, colour, new Vector3(0, -1, 0));
    for (let i = 0; i < ring.length; i++) { const j = (i + 1) % ring.length, q = [lo[i], lo[j], hi[j], hi[i]]; poly(material, q, colour, q[0].clone().add(q[2]).multiplyScalar(0.5).sub(mid)); }
  };
  // A wedge, where the building has one: its end carried on to a slanting end wall (`wedgeOf`). `ws` is its side, nought where it has none.
  const wd = wedgeOf(b), ws = wd?.side ?? 0;
  /** How far past a corner whose angle within is `a` a run along one wall must go to meet the run along the other, for each metre it stands out. */
  const mitre = (a: number) => 1 / Math.tan(a / 2);
  // (Over brick with stucco dressings the ground storey is stucco the colour of stone, rusticated, as a basement storey is.)
  // How it is dressed (see `ClassicalDress`): as the first of them were, where its document does not say.
  const dr = dressOf(b), COL = b.portico && dr.order === 'columns' ? CLASSICAL.columns : 0;
  // (How richly it is dressed: `rich` are the two styles with heads over the windows, blocks under their sills and under the cornice.)
  const style = dr.style, rich = style === 'empire' || style === 'quoins', bare = style === 'bare';
  const groundWash: Colour = b.brick === 'stucco' ? [0.8, 0.77, 0.7] : b.colour, rustic = b.brick === 'bare' || !dr.rusticated ? 0 : 0.44;
  // (`T` is the rendered skin of an outer wall, which carries its windows; the rest of its thickness is the linings of the rooms inside.)
  const W = b.w, D = b.d, T = CLASSICAL.skin, FULL = CLASSICAL.outer, PLINTH = plinthOf(b), N = b.storeys, H0 = b.heights[0], wash = b.colour, granite = shade(stone, 0.62);
  const floorY = (storey: number) => floorOf(b, storey);
  const y1 = floorY(1), top = floorY(N);
  const frame: Colour = [0.86, 0.85, 0.8], leaf: Colour = rng.pick([[0.1, 0.17, 0.13], [0.2, 0.12, 0.07], [0.12, 0.13, 0.2]] as Colour[]);
  const dealtTone: Colour = rng.pick([[0.36, 0.45, 0.4], [0.4, 0.2, 0.16], [0.3, 0.31, 0.33]] as Colour[]);
  // What the roof is covered with: sheet metal laid in seams, of the tone dealt or of one the dress names; copper gone green; or clay
  // tiles, red or dark, which want no seams drawn on them.
  const ROOFS: Record<Exclude<ClassicalDress['roof'], 'dealt'>, [string, Colour]> = {
    grey: ['metal', [0.3, 0.31, 0.33]], green: ['metal', [0.36, 0.45, 0.4]], red: ['metal', [0.4, 0.2, 0.16]], black: ['metal', [0.11, 0.11, 0.12]],
    copper: ['copper', [0.22, 0.44, 0.36]], tiles: ['tile', [0.8, 0.64, 0.58]], dark: ['tile', [0.34, 0.32, 0.34]],
  };
  const [roofMat, roofTone] = dressOf(b).roof === 'dealt' ? ['metal', dealtTone] as [string, Colour] : ROOFS[dressOf(b).roof as Exclude<ClassicalDress['roof'], 'dealt'>];
  const seams = roofMat !== 'tile';
  /** Every opening in the outer walls, as the rooms inside need to know them: which wall (front, right, back, left), where along it in the building's measures, and how high. */
  // (`axis` says whether the wall is a line of constant `v` or of constant `u`; `lo` and `hi` are where its skin lies across its thickness, on that axis.)
  // (`frame` for those in the walls of a wing that leans, whose measures are the wing's own.)
  const holes: { axis: 'u' | 'v'; lo: number; hi: number; c: number; half: number; y0: number; y1: number; storey: number; frame?: -1 | 1 }[] = [];

  // One wall: its storeys, their windows, and what is moulded about them. `door` is the bay the door stands in, if any; `plain` leaves off the cornices over the windows.
  type Opening = Gap & { kind: 'window' | 'door' | 'back' | 'through' | 'arch' };
  // `centres` places the windows, along the wall from its left end, where they must line up with others; `back` is where a back door stands, if this wall has one.
  // `arch` is the carriage way's arch, if it comes through this wall: where its middle is along the wall, and whether its gates hang here.
  const arched = classicalArch(b);
  /** How high the ground stands under a point of a wall's foot, over the ground before the door. */
  const groundUnder = (f: Face, s: number) => { const p = k.local(f.P(s, 0, 0)); return groundOf(b, p.v, p.u); };
  /**
   * A round head over an opening: the corners of its head filled through the wall's skin (`t0` to `t1`) above a half circle, an
   * archivolt about it standing proud, and a keystone.
   */
  const roundHead = (f: Face, g: Gap, t0: number, t1: number, colour: Colour, band = 0.16) => {
    const mid = (g.s0 + g.s1) / 2, r = (g.s1 - g.s0) / 2, spring = g.y1 - r, n = 12, arc = (s: number) => spring + Math.sqrt(Math.max(0, r * r - (s - mid) ** 2));
    for (let i = 0; i < n; i++) {
      const a = g.s0 + ((g.s1 - g.s0) * i) / n, e = g.s0 + ((g.s1 - g.s0) * (i + 1)) / n, ya = arc(a), ye = arc(e);
      on(f, 'plaster', a, e, arc((a + e) / 2), g.y1 + 0.005, t0, t1, colour);
      on(f, 'plaster', a, e, Math.min(ya, ye) - 0.02, Math.max(ya, ye) + band, -0.05, 0.02, WHITE);
    }
    on(f, 'plaster', mid - 0.12, mid + 0.12, g.y1 - 0.1, g.y1 + band + 0.12, -0.08, 0.03, WHITE);
    return spring;
  };
  const wall = (f: Face, bays: number, side: number, o: { door?: number; doors?: number[]; plain?: boolean; margin?: number; centres?: number[]; back?: number; through?: number[]; arch?: { s: number; gates: boolean }; heads?: ClassicalDress['heads']; steps?: number; between?: boolean; corners?: [boolean, boolean]; fore?: [number, number]; abut?: [boolean, boolean]; frame?: -1 | 1; mitre?: [number, number] } = {}) => {
    // (`between`: a wall that stands between two others at its ends, as an end wall does between the front and the back, is built only
    // between their skins. Built to its ends, its corners lay in one plane with theirs, and the two flickered against each other.)
    const s0 = o.between ? T : 0, s1 = o.between ? f.L - T : f.L, k0 = o.between ? T : -0.07, k1 = o.between ? f.L - T : f.L + 0.07;
    // (At a corner the rusticated courses and the bands over them turn it: those of the wall between run on to the face of the work
    // behind the other's courses, and `fore` further where what they meet stands forward; the other's work behind stops short of its
    // end, so that its courses close the corner and no dark joint shows down it.)
    const [f0, f1] = o.fore ?? [0, 0], corner = o.corners ?? [false, false];
    const ends = o.between ? { c: [0.045 - f0, f.L - 0.045 + f1] as [number, number], k: [s0, s1] as [number, number] } : { c: [s0, s1] as [number, number], k: [corner[0] ? 0.045 : s0, corner[1] ? f.L - 0.045 : s1] as [number, number] };
    // (`abut`: an end that meets a wall whose bands run on across it, as a wing's long walls meet the back; there this wall's begin
    // past that wall's.)
    // (`mitre`: at a corner that is not square, how much further a band must run for each metre it stands out.)
    const [m0, m1] = o.mitre ?? [1, 1];
    const band = (reach: number): [number, number] => (o.between ? [0.05 - f0, f.L - 0.05 + f1] : [o.abut?.[0] ? reach : -reach * m0, o.abut?.[1] ? f.L - reach : f.L + reach * m1]);
    // (Round heads on the storeys the dress says; the steps before a door stand out from `steps` before the wall, where something stands before it.)
    const roundOn = (storey: number) => storey < dr.arches, lead = o.steps ?? 0, heads = o.plain ? 'plain' : o.heads ?? 'alternate';
    const margin = o.margin ?? 0.8, pitch = (f.L - margin * 2) / bays, centre = (n: number) => o.centres?.[n] ?? margin + (n + 0.5) * pitch;
    // (Windows are as tall as their storeys allow: the room each lights is as high as the document says. None is cut where the ground stands against the wall.)
    // (`through` are doors on every storey into a wing behind this wall: plain openings, with no window in them.)
    const rows: Opening[][] = Array.from({ length: N }, (_, storey) => [...Array.from({ length: bays }, (_, n): Opening | null => {
      const c = centre(n), fy = floorY(storey), h = b.heights[storey];
      if (storey === 1 && o.back !== undefined && Math.abs(c - o.back) < 0.05) return { s0: c - 0.62, s1: c + 0.62, y0: fy - 0.01, y1: fy + Math.min(2.8, h - 0.75), kind: 'back' };
      const g: Opening = storey === 0
        ? n === o.door || o.doors?.includes(n) ? { s0: c - 0.85, s1: c + 0.85, y0: PLINTH - 0.01, y1: PLINTH + Math.min(3.3, H0 - 0.55), kind: 'door' } : { s0: c - 0.58, s1: c + 0.58, y0: PLINTH + 0.85, y1: PLINTH + H0 - 0.9, kind: 'window' }
        : { s0: c - 0.6, s1: c + 0.6, y0: fy + (storey === 1 ? 0.62 : 0.6), y1: fy + h - 1.05, kind: 'window' };
      // (No window in the ground storey where the carriage way's arch is.)
      if (storey === 0 && o.arch && arched && Math.abs(c - o.arch.s) < arched.w / 2 + 0.7) return null;
      // (Nor where something stands close before it: it would look into a wall.)
      const p = k.local(f.P(c, 0, 0)), q = k.local(f.P(c, 0, -1));
      return g.kind === 'window' && (buried(b, p.v, g.y0, p.u) || blinded(b, p.u, p.v, q.u - p.u, q.v - p.v, g.y0, (g.s1 - g.s0) / 2)) ? null : g;
    }), ...(o.through ?? []).map((c): Opening => ({ s0: c - 0.55, s1: c + 0.55, y0: floorY(storey) - 0.01, y1: floorY(storey) + Math.min(2.35, b.heights[storey] - 0.75), kind: 'through' })),
    ...(storey === 0 && o.arch && arched ? [{ s0: o.arch.s - arched.w / 2, s1: o.arch.s + arched.w / 2, y0: -0.02, y1: arched.crown, kind: 'arch' } as Opening] : [])].filter((g): g is Opening => g !== null));
    const inFrame = (pt: Vector3) => { const p = k.local(pt), wf = o.frame === undefined ? undefined : frames.get(o.frame); if (!wf) return p; const [u, v] = wf.from(p.u, p.v); return { u, v }; };
    rows.forEach((row, storey) => row.forEach((g) => {
      const p = inFrame(f.P((g.s0 + g.s1) / 2, 0, 0));
      const q = inFrame(f.P((g.s0 + g.s1) / 2, 0, T)), axis = Math.abs(q.u - p.u) > Math.abs(q.v - p.v) ? 'u' : 'v';
      holes.push({ axis, lo: Math.min(p[axis], q[axis]), hi: Math.max(p[axis], q[axis]), c: axis === 'u' ? p.v : p.u, half: (g.s1 - g.s0) / 2, y0: g.y0, y1: g.y1, storey, frame: o.frame });
    }));
    // The base of granite, down to the lowest ground along the wall; and where the floor stands a metre or more over the ground, a
    // basement's small windows in it, barred, under the ground storey's (none where the ground stands too high for one).
    const g0 = Math.min(0, groundUnder(f, 0), groundUnder(f, f.L));
    const cellar: Gap[] = PLINTH < 1 ? [] : rows[0].filter((g) => g.kind === 'window').flatMap((g) => {
      const c = (g.s0 + g.s1) / 2, y0 = Math.max(groundUnder(f, c) + 0.2, PLINTH - 0.95), y1 = PLINTH - 0.25;
      return y1 - y0 >= 0.3 ? [{ s0: c - 0.45, s1: c + 0.45, y0, y1 }] : [];
    });
    pierced(f, 'stone', k0, k1, g0, PLINTH, -0.07, T, granite, [...rows[0].filter((g) => g.kind === 'arch'), ...cellar]);
    for (const g of cellar) {
      // (The glass before the block of stone under the ground floor, whose face is 0.2 in: laid at 0.2, the two flickered.)
      on(f, 'glass', g.s0, g.s1, g.y0, g.y1, 0.15, 0.18, PANE);
      for (let i = 1; i < 4; i++) on(f, 'metal', g.s0 + (i * (g.s1 - g.s0)) / 4 - 0.015, g.s0 + (i * (g.s1 - g.s0)) / 4 + 0.015, g.y0, g.y1, 0.1, 0.13, [0.05, 0.05, 0.055]);
    }
    // (A building of one storey is all principal storey: smooth, not rusticated, and its windows dressed as the principal storey's are.)
    pierced(f, 'plaster', s0, s1, PLINTH, y1, 0, T, groundWash, rows[0], N > 1 ? rustic : 0, ends);
    for (let storey = 1; storey < N; storey++) pierced(f, 'plaster', s0, s1, floorY(storey), floorY(storey + 1), 0.02, T, wash, rows[storey]);
    if (N > 1) {
      // The band between the ground storey and the one above, and a thin one under its windows; broken where a door goes through them.
      const doors = (rows[1] ?? []).filter((g) => g.kind === 'back' || g.kind === 'through');
      // (The end walls' run only from the face of the front's and back's work behind, which is where those stop: run past, their faces
      // lay in one plane at the corner and flickered.)
      pierced(f, 'plaster', ...band(0.1), y1 - 0.05, y1 + 0.2, -0.1, 0.05, WHITE, doors);
      if (rich) {
        pierced(f, 'plaster', ...band(0.06), y1 + 0.2, y1 + 0.27, -0.06, 0.05, WHITE, doors);
        pierced(f, 'plaster', ...band(0.04), y1 + 0.52, y1 + 0.62, -0.035, 0.05, WHITE, doors);
      }
    }
    // A door at the back, onto the ground there: plainer than the front, its leaves standing open into the room.
    for (const g of rows[1] ?? []) if (g.kind === 'back') {
      for (const [a, e] of [[g.s0 + 0.03, g.s0 + 0.09], [g.s1 - 0.09, g.s1 - 0.03]]) on(f, 'wood', a, e, g.y0 + 0.03, g.y1 - 0.08, FULL - 0.02, FULL + 0.62, leaf, true);
      on(f, 'wood', g.s0, g.s1, g.y1 - 0.08, g.y1, 0.08, 0.2, frame, true);
      for (const [a, e] of [[g.s0 - 0.18, g.s0], [g.s1, g.s1 + 0.18]]) on(f, 'plaster', a, e, g.y0 - 0.2, g.y1 + 0.18, -0.06, 0.05, WHITE);
      on(f, 'plaster', g.s0 - 0.3, g.s1 + 0.3, g.y1 + 0.18, g.y1 + 0.3, -0.16, 0.05, WHITE);
      on(f, 'stone', g.s0 - 0.1, g.s1 + 0.1, g.y0 - 0.25, g.y0, -0.5, FULL + 0.02, shade(stone, 0.8));
    }
    // Doors close together share one flight of steps.
    const flights: Gap[][] = [];
    for (const g of rows[0].filter((q) => q.kind === 'door').sort((p, q) => p.s0 - q.s0)) {
      const last = flights[flights.length - 1];
      if (last && g.s0 - last[last.length - 1].s1 < 1.6) last.push(g); else flights.push([g]);
    }
    rows[0].forEach((g) => {
      if (g.kind === 'through') return;
      if (g.kind === 'arch' && arched) {
        // The carriage way's arch: the head of the opening filled through the whole wall above a half circle, an archivolt about it
        // standing proud, a keystone, imposts at the springing; and in the street's wall the gates, two leaves of boards standing open
        // against the sides of the way.
        const mid = (g.s0 + g.s1) / 2, r = (g.s1 - g.s0) / 2, spring = arched.spring, n = 22;
        for (let i = 0; i < n; i++) {
          const a = g.s0 + ((g.s1 - g.s0) * i) / n, e = g.s0 + ((g.s1 - g.s0) * (i + 1)) / n, x = (a + e) / 2 - mid;
          const y = spring + Math.sqrt(Math.max(0, r * r - x * x));
          on(f, 'plaster', a, e, y, g.y1 + 0.01, -0.01, FULL + 0.01, wash);
          const ya = spring + Math.sqrt(Math.max(0, r * r - (a - mid) ** 2)), ye = spring + Math.sqrt(Math.max(0, r * r - (e - mid) ** 2));
          on(f, 'plaster', a, e, Math.min(ya, ye) - 0.02, Math.max(ya, ye) + 0.26, -0.07, 0.02, WHITE);
          on(f, 'plaster', a, e, Math.min(ya, ye) - 0.02, Math.min(ya, ye) + 0.02, 0, FULL, shade(wash, 0.85));
        }
        on(f, 'plaster', mid - 0.22, mid + 0.22, g.y1 - 0.12, g.y1 + 0.42, -0.13, 0.03, WHITE);
        for (const sx of [g.s0, g.s1]) on(f, 'plaster', sx - 0.18, sx + 0.18, spring - 0.18, spring, -0.08, 0.03, WHITE);
        if (o.arch?.gates) for (const [a, dir] of [[g.s0, 1], [g.s1, -1]] as [number, number][]) {
          const leaf = r - 0.05, inner = dir > 0 ? a + 0.02 : a - 0.1;
          on(f, 'wood', inner, inner + 0.08, 0.05, spring + 0.25, FULL + 0.05, FULL + 0.05 + leaf, leaf === 0 ? frame : shade(leaf > 0 ? [0.24, 0.16, 0.1] : frame, 1), true);
        }
        return;
      }
      if (g.kind === 'door') {
        // The door: two leaves standing open into the hall, under a light of its own (under a round head, a fanlight in it).
        const round = roundOn(0), lintel = round ? g.y1 - (g.s1 - g.s0) / 2 : g.y1 - 0.62;
        for (const [a, e] of [[g.s0 + 0.03, g.s0 + 0.09], [g.s1 - 0.09, g.s1 - 0.03]]) on(f, 'wood', a, e, g.y0 + 0.03, lintel, FULL - 0.02, FULL + 0.8, leaf, true);
        on(f, 'wood', g.s0, g.s1, lintel, lintel + 0.09, 0.08, 0.18, frame, true);
        glazed(f, { s0: g.s0 + 0.02, s1: g.s1 - 0.02, y0: lintel + 0.09, y1: g.y1 - 0.02 }, 4, 1, frame);
        if (round) {
          for (const [a, e] of [[g.s0 - 0.2, g.s0], [g.s1, g.s1 + 0.2]]) on(f, 'plaster', a, e, PLINTH, lintel, -0.07, 0.05, WHITE);
          roundHead(f, g, 0, T, N > 1 ? groundWash : wash, 0.22);
        } else {
          for (const [a, e] of [[g.s0 - 0.2, g.s0], [g.s1, g.s1 + 0.2]]) on(f, 'plaster', a, e, PLINTH, g.y1 + 0.02, -0.07, 0.05, WHITE);
          on(f, 'plaster', g.s0 - 0.3, g.s1 + 0.3, g.y1 + 0.02, g.y1 + 0.3, -0.1, 0.05, WHITE);
          on(f, 'plaster', g.s0 - 0.4, g.s1 + 0.4, g.y1 + 0.3, g.y1 + 0.42, -0.24, 0.05, WHITE);
        }
        // The threshold, and steps of stone, each broader than the one above it: one flight before doors side by side, from the
        // ground before them up to the floor, as many as that needs; and where it climbs high, a parapet of granite either side.
        on(f, 'stone', g.s0, g.s1, PLINTH - 0.25, PLINTH, -0.02, FULL + 0.02, shade(stone, 0.85));
        const flight = flights.find((q) => q[0] === g);
        if (flight) {
          const s0 = flight[0].s0, s1 = flight[flight.length - 1].s1, gr = groundUnder(f, (s0 + s1) / 2), up = stepsUp(PLINTH - gr);
          for (let step = 0; step < up.steps; step++) on(f, 'stone', s0 - 0.5 - step * up.spread, s1 + 0.5 + step * up.spread, gr - 0.3, PLINTH - step * up.rise, -0.4 - step * up.tread + lead, 0.01 + lead, shade(stone, 0.78), false, 0.02);
          if (PLINTH - gr > 0.9) for (let step = 0; step < up.steps; step++) for (const [a, e] of [[s0 - 0.95 - step * up.spread, s0 - 0.5 - step * up.spread], [s1 + 0.5 + step * up.spread, s1 + 0.95 + step * up.spread]]) {
            on(f, 'stone', a, e, gr - 0.3, PLINTH - step * up.rise + 0.5, -0.4 - step * up.tread + lead, (step ? -0.4 - (step - 1) * up.tread : 0.01) + lead, granite);
          }
        }
      } else if (N > 1) {
        glazed(f, g, 2, 3, frame, 0.14);
        if (roundOn(0)) roundHead(f, g, 0, T, groundWash);
        else if (!bare) {
          // Over a window of the ground storey, the stones of a flat arch, with its key standing proud where the style is rich.
          on(f, 'plaster', g.s0 - 0.16, g.s1 + 0.16, g.y1, g.y1 + 0.3, -0.03, 0.05, WHITE);
          if (rich) on(f, 'plaster', (g.s0 + g.s1) / 2 - 0.12, (g.s0 + g.s1) / 2 + 0.12, g.y1 - 0.02, g.y1 + 0.38, -0.07, 0.05, WHITE);
        }
        // (Every sill stands a centimetre over the foot of its opening: level with it, its top lay in one plane with the wall's under the window.)
        on(f, 'stone', g.s0 - 0.08, g.s1 + 0.08, g.y0 - 0.12, g.y0 + 0.01, -0.16, 0.16, granite, false, 0.02);
      }
    });
    (N > 1 ? rows[1] ?? [] : rows[0].filter((g) => g.kind === 'window')).forEach((g, n) => {
      if (g.kind === 'back' || g.kind === 'through') return;
      glazed(f, g, 2, 4, frame);
      // The surround (under a round head, up to where the head springs, and an archivolt about it); the sill on its two blocks; and
      // over it, as the dress says, nothing more, or a frieze and a cornice on brackets, with a pediment in every other bay or in all.
      // (Bare: the opening and its sill alone. Quoins: the surround eared, standing out a hand further either side at its top.
      // Lesenes: the surround, and nothing over it.)
      const round = roundOn(N > 1 ? 1 : 0), spring = round ? g.y1 - (g.s1 - g.s0) / 2 : g.y1 + 0.17;
      if (bare) {
        if (round) roundHead(f, g, 0.02, T, wash);
        on(f, 'plaster', g.s0 - 0.1, g.s1 + 0.1, g.y0 - 0.07, g.y0 + 0.01, -0.1, 0.08, WHITE, false, 0.015);
        return;
      }
      for (const [a, e] of [[g.s0 - 0.17, g.s0], [g.s1, g.s1 + 0.17]]) on(f, 'plaster', a, e, g.y0, spring, -0.045, 0.06, WHITE);
      if (style === 'quoins' && !round) for (const [a, e] of [[g.s0 - 0.29, g.s0 - 0.17], [g.s1 + 0.17, g.s1 + 0.29]]) on(f, 'plaster', a, e, g.y1 - 0.14, g.y1 + 0.17, -0.045, 0.06, WHITE);
      if (round) roundHead(f, g, 0.02, T, wash);
      else on(f, 'plaster', g.s0, g.s1, g.y1, g.y1 + 0.17, -0.045, 0.06, WHITE);
      on(f, 'plaster', g.s0 - 0.24, g.s1 + 0.24, g.y0 - 0.1, g.y0 + 0.01, -0.2, 0.08, WHITE, false, 0.015);
      if (rich) for (const s of [g.s0 - 0.17, g.s1 + 0.05]) on(f, 'plaster', s, s + 0.12, g.y0 - 0.3, g.y0 - 0.1, -0.09, 0.03, WHITE);
      if (heads === 'plain' || !rich) return;
      on(f, 'plaster', g.s0 - 0.17, g.s1 + 0.17, g.y1 + 0.17, g.y1 + 0.37, -0.03, 0.03, WHITE);
      for (const s of [g.s0 - 0.2, g.s1 + 0.07]) on(f, 'plaster', s, s + 0.13, g.y1 + 0.12, g.y1 + 0.4, -0.12, 0.03, WHITE);
      on(f, 'plaster', g.s0 - 0.3, g.s1 + 0.3, g.y1 + 0.37, g.y1 + 0.47, -0.2, 0.03, WHITE, false, 0.015);
      if (heads === 'pediments' || (heads === 'alternate' && (n + (bays >> 1)) % 2 === 0)) {
        const into = f.P(0, 0, 0.2).sub(f.P(0, 0, 0));
        wedge(f.P(g.s0 - 0.3, g.y1 + 0.47, -0.17), f.P(g.s1 + 0.3, g.y1 + 0.47, -0.17), f.P((g.s0 + g.s1) / 2, g.y1 + 0.82, -0.17), into, ['plaster', WHITE], ['plaster', WHITE]);
      }
    });
    for (const row of rows.slice(2)) for (const g of row) {
      if (g.kind === 'through') continue;
      glazed(f, g, 2, 2, frame);
      if (bare) { on(f, 'plaster', g.s0 - 0.1, g.s1 + 0.1, g.y0 - 0.07, g.y0 + 0.01, -0.1, 0.08, WHITE, false, 0.015); continue; }
      for (const [a, e] of [[g.s0 - 0.15, g.s0], [g.s1, g.s1 + 0.15]]) on(f, 'plaster', a, e, g.y0, g.y1 + 0.15, -0.04, 0.06, WHITE);
      on(f, 'plaster', g.s0, g.s1, g.y1, g.y1 + 0.15, -0.04, 0.06, WHITE);
      on(f, 'plaster', g.s0 - 0.2, g.s1 + 0.2, g.y0 - 0.09, g.y0 + 0.01, -0.17, 0.08, WHITE, false, 0.015);
    }
    return { pitch, centre, rows };
  };
  /** A balustrade along a wall from `s0` to `s1`, standing on `y`, `t` into the wall from its face: a plinth, balusters, and a rail. */
  const balustrade = (f: Face, s0: number, s1: number, y: number, t: number) => {
    if (s1 - s0 < 0.4) return;
    on(f, 'plaster', s0, s1, y, y + 0.12, t, t + 0.3, WHITE);
    const n = Math.max(1, Math.round((s1 - s0) / 0.28));
    for (let i = 0; i < n; i++) {
      const c = s0 + ((i + 0.5) * (s1 - s0)) / n;
      on(f, 'plaster', c - 0.05, c + 0.05, y + 0.12, y + 0.78, t + 0.1, t + 0.2, WHITE);
      on(f, 'plaster', c - 0.08, c + 0.08, y + 0.3, y + 0.56, t + 0.07, t + 0.23, WHITE);
    }
    on(f, 'plaster', s0 - 0.03, s1 + 0.03, y + 0.78, y + 0.9, t - 0.02, t + 0.32, WHITE, false, 0.015);
  };
  /** A round disc standing across the front, its middle at `u` and `y`, from `v0` to `v1` deep: laid in level slices. */
  const disc = (u: number, y: number, r: number, v0: number, v1: number, colour: Colour) => {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = y - r + (2 * r * i) / n, e = y - r + (2 * r * (i + 1)) / n, m = (a + e) / 2 - y, half = Math.sqrt(Math.max(0, r * r - m * m));
      box('plaster', u - half, u + half, a, e, v0, v1, colour);
    }
  };
  // A pilaster: a foot, a shaft that narrows a little upward, and a head.
  // (As the style says: a flat strip with no foot and no head for lesenes, and nothing where the walls are bare.)
  const pilaster = (f: Face, s: number, y0: number, y3: number, out: number) => {
    if (bare) return;
    if (style === 'lesenes') { on(f, 'plaster', s - 0.28, s + 0.28, y0, y3, -Math.min(out, 0.07), 0.03, WHITE); return; }
    on(f, 'plaster', s - 0.34, s + 0.34, y0, y0 + 0.18, -out - 0.07, 0.03, WHITE);
    on(f, 'plaster', s - 0.3, s + 0.3, y0 + 0.18, y0 + 0.3, -out - 0.04, 0.03, WHITE);
    on(f, 'plaster', s - 0.26, s + 0.26, y0 + 0.3, y3 - 0.42, -out, 0.03, WHITE);
    on(f, 'plaster', s - 0.3, s + 0.3, y3 - 0.42, y3 - 0.3, -out - 0.04, 0.03, WHITE);
    on(f, 'plaster', s - 0.34, s + 0.34, y3 - 0.3, y3 - 0.1, -out - 0.08, 0.03, WHITE);
    on(f, 'plaster', s - 0.38, s + 0.38, y3 - 0.1, y3, -out - 0.11, 0.03, WHITE);
  };

  const [front, right, back, left] = k.walls(0);
  // (An even number of windows to each end, so that the wall between the front rooms and the back meets the end walls between two of them.)
  const sideBays = classicalEnds(b).length, middle = b.bays >> 1, order = N > 1 ? y1 + 0.27 : PLINTH;
  const fr = classicalFront(b), out = CLASSICAL.out, PAV = CLASSICAL.pavilion;
  const centreLeft = fr.standL, centreRight = fr.standR;
  // The front, in stretches: a pavilion at each end where there are pavilions, the stretches either side of the middle, and the
  // middle, where it stands forward; each stretch's windows where the plan has them, and its doors and the carriage way's arch.
  const archAt = (from: number, to: number) => (arched && arched.u + W / 2 > from && arched.u + W / 2 < to ? { s: arched.u + W / 2 - from, gates: true } : undefined);
  // (The doors: in the middle, and where the building has more than one entrance, along the front; three into one hall where the dress says.)
  const doorBays = [...entranceBays(b)];
  if (dr.doors === 3 && (b.portico || b.bays >= 7) && !(b.entrances && b.entrances.length > 1)) doorBays.push(middle - 1, middle + 1);
  const cuts = [-W / 2, ...(fr.pavilions ? [fr.pavL] : []), ...(b.portico ? [centreLeft, centreRight] : []), ...(fr.pavilions ? [fr.pavR] : []), W / 2];
  const stretches = cuts.slice(1).map((u1, i) => {
    const u0 = cuts[i], mid = (u0 + u1) / 2, centre = b.portico && mid > centreLeft && mid < centreRight, pav = !centre && (mid < fr.pavL || mid > fr.pavR);
    return { u0, u1, centre, pav, out: centre ? out : pav ? PAV : 0, bays: fr.windows.map((u, n) => (u > u0 && u < u1 ? n : -1)).filter((n) => n >= 0) };
  });
  let stand: Face | null = null, standRows: Opening[][] = [], standCentre = (n: number) => n;
  // (The middle last, as it always was.)
  for (const st of [...stretches.filter((q) => !q.centre), ...stretches.filter((q) => q.centre)]) {
    const from = st.u0 + W / 2, face: Face = { L: st.u1 - st.u0, P: (s, y, t) => front.P(from + s, y, t - st.out) };
    const made = wall(face, st.bays.length, 0, {
      corners: [st.u0 === -W / 2 && ws !== -1, st.u1 === W / 2 && ws !== 1],
      centres: st.bays.map((n) => fr.windows[n] - st.u0), arch: archAt(from, from + face.L), heads: dr.heads, steps: st.centre ? -COL : 0,
      doors: st.bays.map((n, i) => (doorBays.includes(n) ? i : -1)).filter((i) => i >= 0),
    });
    if (st.centre) { stand = face; standRows = made.rows; standCentre = made.centre; }
    if (st.pav) {
      // A pavilion: the corner between its skin and the end wall filled, and pilasters at its corners and between its windows, over
      // the ground storey. (Its own wall closes its sides.)
      const end = st.u0 < 0 ? st.u0 : st.u1, inward = st.u0 < 0 ? 1 : -1, ua = Math.min(end, end + inward * T), ub = Math.max(end, end + inward * T);
      // (Over the rusticated ground storey, the fill stands back as the work behind the courses does, and dark as it is: the end
      // wall's courses run on forward over it to the pavilion's face.)
      const sunk = N > 1 && rustic ? 0.045 : 0;
      if (sunk) box('plaster', ua + (inward > 0 ? sunk : 0), ub - (inward < 0 ? sunk : 0), PLINTH, y1, -PAV + T, T, shade(groundWash, 0.5));
      box('plaster', ua, ub, sunk ? y1 : PLINTH, top, -PAV + T, T, wash);
      box('stone', ua - (inward > 0 ? 0.07 : 0), ub + (inward < 0 ? 0.07 : 0), Math.min(0, groundUnder(face, 0), groundUnder(face, face.L)), PLINTH, -PAV + T, T, granite);
      const at0 = st.bays.map((n) => fr.windows[n] - st.u0), spots = [0.36, ...at0.slice(1).map((s, i) => (s + at0[i]) / 2), face.L - 0.36];
      for (const s of spots) pilaster(face, s, order, top, 0.13);
    }
  }
  if (b.portico && stand) {
    const sf: Face = stand;
    // (And the sides of what stands forward.)
    // (From the back of its skin to the front's: its own wall closes its sides in front of that, and two faces in one plane flicker.)
    box('plaster', centreLeft, centreLeft + 0.3, PLINTH, top, -out + T, 0.02, wash);
    box('plaster', centreRight - 0.3, centreRight, PLINTH, top, -out + T, 0.02, wash);
    const spots = [0.36, ...Array.from({ length: fr.centre - 1 }, (_, n) => (standCentre(n) + standCentre(n + 1)) / 2), sf.L - 0.36];
    for (const s of spots) pilaster(sf, s, order, top, 0.13);
    if (COL) {
      // Columns standing clear of the middle, through the storeys over the ground storey, on the ground storey brought forward to
      // carry them: a block as high as the band over the ground storey, rusticated as it is, its doors and windows cut deep through
      // it, a balustrade along its top between the columns. Each column turned: a base, a shaft that narrows a little upward, and a
      // capital under a square abacus, the entablature over them the cornice brought forward.
      const podium: Face = { L: sf.L, P: (s, y, t) => sf.P(s, y, t - COL) }, ledge = order, openings = standRows[0] ?? [];
      const g0 = Math.min(0, groundUnder(podium, 0), groundUnder(podium, podium.L));
      pierced(podium, 'stone', -0.07, podium.L + 0.07, g0, PLINTH, -0.07, COL, granite, []);
      pierced(podium, 'plaster', 0, podium.L, PLINTH, ledge, 0, COL, groundWash, openings, N > 1 ? rustic : 0);
      for (const g of openings) if (dr.arches > 0) roundHead(podium, g, 0, COL, groundWash, 0.22);
      else { on(podium, 'plaster', g.s0 - 0.16, g.s1 + 0.16, g.y1, g.y1 + 0.3, -0.03, 0.05, WHITE); on(podium, 'plaster', (g.s0 + g.s1) / 2 - 0.12, (g.s0 + g.s1) / 2 + 0.12, g.y1 - 0.02, g.y1 + 0.38, -0.07, 0.05, WHITE); }
      // (The ledge stops short of the bands on the wall behind: run on to the wall, its top lay in one plane with theirs.)
      on(podium, 'plaster', -0.1, podium.L + 0.1, ledge - 0.12, ledge, -0.12, COL - 0.1, WHITE);
      const turn = turner(mesh, () => 0), shaft = top - ledge;
      for (const s of spots) {
        const p = podium.P(s, ledge, 0.5);
        turn('plaster', p.x, ledge + base, p.z, [[0, 0], [0.42, 0], [0.42, 0.12], [0.37, 0.17], [0.37, 0.26], [0.33, 0.32], [0.31, shaft * 0.45], [0.28, shaft - 0.62], [0.3, shaft - 0.55], [0.35, shaft - 0.3], [0.43, shaft - 0.14], [0.43, shaft - 0.1], [0, shaft - 0.1]], { colour: () => WHITE, segments: 16 });
        on(podium, 'plaster', s - 0.48, s + 0.48, top - 0.1, top, 0.02, 0.98, WHITE);
      }
      for (let i = 0; i + 1 < spots.length; i++) balustrade(podium, spots[i] + 0.45, spots[i + 1] - 0.45, ledge, 0.12);
    }
  }
  // (The back's windows stand behind the front's, and the ends' are placed as the plan expects them.)
  const ends = classicalEnds(b), fronts = classicalFront(b).windows;
  const pavFore = fr.pavilions ? PAV : 0;
  if (ws !== 1) wall(right, sideBays, 1, { plain: true, centres: ends, between: true, fore: [pavFore, 0] });
  // (Where a wing stands against the back wall there are no windows in it, but a door into the wing on every storey.)
  const behind = (u: number) => underWing(b, u);
  const backs = fronts.filter((u) => !behind(u)), into = b.plan!.doors.filter((q) => q.through).map((q) => W / 2 - q.c);
  wall(back, backs.length, 2, { plain: true, corners: [ws !== 1, ws !== -1], centres: backs.map((u) => W / 2 - u).sort((p, q) => p - q), back: b.backDoor === undefined ? undefined : W / 2 - b.backDoor, through: into, arch: arched ? { s: W / 2 - arched.u, gates: false } : undefined });
  if (ws !== -1) wall(left, sideBays, 3, { plain: true, centres: ends.map((v) => D - v).sort((p, q) => p - q), between: true, fore: [0, pavFore] });
  // The wedge: its front and back carrying on the main block's, and its slanting end, each laid out as the main block's walls are; the
  // front's windows dressed as the front's, the rest plain. (Where one meets the main block's, its bands begin where those end.)
  const wedgeWalls = wd ? (() => {
    const s = wd.side, g = b.wedge!, from = s > 0 ? W / 2 : -W / 2 - g.front;
    const frontW: Face = { L: g.front, P: (a, y, t) => at(from + a, y, t) };
    const backW: Face = { L: g.back, P: (a, y, t) => at(s > 0 ? W / 2 + g.back - a : -W / 2 - a, y, D - t) };
    const endW: Face = { L: wd.len, P: (a, y, t) => { const [u, v] = wd.endAt(a, t); return at(u, y, v); }, oblique: true };
    const mF = mitre(wd.atFront), mB = mitre(wd.atBack);
    const madeF = frontW.L > 0.3 ? wall(frontW, wd.fronts.length, 0, { centres: wd.fronts.map((u) => u - from).sort((p, q) => p - q), heads: dr.heads, corners: s > 0 ? [false, true] : [true, false], abut: s > 0 ? [true, false] : [false, true], mitre: s > 0 ? [1, mF] : [mF, 1] }) : null;
    const madeB = backW.L > 0.3 ? wall(backW, wd.backs.length, 2, { plain: true, centres: wd.backs.map((u) => (s > 0 ? W / 2 + g.back - u : -W / 2 - u)).sort((p, q) => p - q), corners: s > 0 ? [true, false] : [false, true], abut: s > 0 ? [false, true] : [true, false], mitre: s > 0 ? [mB, 1] : [1, mB] }) : null;
    const madeE = wall(endW, wd.ends.length, s > 0 ? 1 : 3, { plain: true, centres: wd.ends, corners: [true, true], mitre: [mF, mB] });
    return { frontW, backW, endW, madeF, madeB, madeE, mF, mB };
  })() : null;
  // (The doors through what was the main block's end, known before its rooms are built, so that their linings are cut for them.)
  if (wd) for (let storey = 0; storey < N; storey++) for (const q of wd.doors) if (q.storey === undefined || q.storey === storey) {
    const fy = floorY(storey), lo = ws > 0 ? W / 2 - CLASSICAL.skin : -W / 2;
    holes.push({ axis: 'u', lo, hi: lo + CLASSICAL.skin, c: q.v, half: 0.55, y0: fy - 0.01, y1: fy + Math.min(2.35, b.heights[storey] - 0.75), storey });
  }
  // Strips at the corners, the height of the upper storeys.
  // The wings: three walls each, laid out as the main block's are; the main block's end wall runs straight on into the wing's outer wall.
  // (A wing that leans is laid out in its own measures: its outer wall begins at the corner of the back, its inner where it meets the
  // back's line, nearer or further, `n0` along.)
  const wingFaces = (b.wings ?? []).map((g) => {
    const s = g.side, L = g.length, { along, across } = wingWindows(b, g), wf = frames.get(s)!, A = atIn(s), oblique = wf.leans, n0 = wf.back(g.width), Li = L - n0;
    const frame = oblique ? s : undefined;
    const outer: Face = { L, P: (a, y, t) => A(s * (W / 2 - t), y, s > 0 ? D + a : D + L - a), oblique };
    const inner: Face = { L: Li, P: (a, y, t) => A(s * (W / 2 - g.width + t), y, s > 0 ? D + L - a : D + n0 + a), oblique };
    const end: Face = { L: g.width, P: (a, y, t) => A(s * (W / 2 - a), y, D + L - t), oblique };
    // (The wing's end stands between its two long walls, as the main block's ends do.)
    wall(outer, along.length, s > 0 ? 1 : 3, { plain: true, corners: s > 0 ? [false, true] : [true, false], abut: s > 0 ? [true, false] : [false, true], centres: along.map((v) => (s > 0 ? v - D : D + L - v)).sort((p, q) => p - q), frame });
    wall(inner, along.length, s > 0 ? 3 : 1, { plain: true, corners: s > 0 ? [true, false] : [false, true], abut: s > 0 ? [false, true] : [true, false], centres: along.map((v) => (s > 0 ? D + L - v : v - D - n0)).sort((p, q) => p - q), frame });
    wall(end, across.length, 2, { plain: true, between: true, centres: across.map((u) => W / 2 - s * u).sort((p, q) => p - q), frame });
    return [outer, inner, end];
  });
  // The corners, as the style says: strips the height of the upper storeys; quoins, stones laid long and short, from over the
  // rusticated work or the plinth; lesenes, flat strips from the same; or nothing. (On the walls that stand between others, they
  // begin at the back of the others' and those run out past the corner, so that they close it and no two faces lie in one plane.)
  // (Which ends of each are dressed: not where a wall goes on into a wedge, nor the main block's end within it.)
  const cornerFaces: [Face, boolean, boolean?, boolean?][] = [[front, false, ws !== -1, ws !== 1], [right, true, ws !== 1, ws !== 1], [back, false, ws !== 1, ws !== -1], [left, true, ws !== -1, ws !== -1], ...wingFaces.flatMap(([outer, inner, end]): [Face, boolean][] => [[outer, false], [inner, false], [end, true]])];
  if (wedgeWalls) {
    const { frontW, backW, endW } = wedgeWalls, s = ws;
    if (frontW.L > 0.3) cornerFaces.push([frontW, false, s < 0, s > 0]);
    if (backW.L > 0.3) cornerFaces.push([backW, false, s > 0, s < 0]);
    cornerFaces.push([endW, false, true, true]);
  }
  const foot = N > 1 && rustic ? order : PLINTH;
  for (const [f, between, dress0, dress1] of cornerFaces) for (const [s, dir] of [[0, 1], [f.L, -1]] as [number, number][]) {
    if ((s === 0 ? dress0 : dress1) === false) continue;
    const a = s + dir * (between ? 0.03 : -0.05);
    if (style === 'empire') on(f, 'plaster', Math.min(a, s + dir * 0.6), Math.max(a, s + dir * 0.6), order, top, -0.05, 0.03, WHITE);
    else if (style === 'lesenes') on(f, 'plaster', Math.min(a, s + dir * 0.55), Math.max(a, s + dir * 0.55), foot, top, -0.05, 0.03, WHITE);
    else if (style === 'quoins') for (let y = foot, n = between ? 1 : 0; y < top - 0.15; y += 0.44, n++) {
      const e = s + dir * (n % 2 ? 0.5 : 0.85);
      on(f, 'plaster', Math.min(a, e), Math.max(a, e), y, Math.min(top, y + 0.4), -0.06, 0.03, shade(WHITE, 0.94));
    }
  }

  // The cornice, all round: a frieze, three mouldings each standing further out than the one under it, and blocks along the front.
  const round = (y0: number, y3: number, reach: number, colour: Colour) => {
    // (The ends' run only between the front's and the back's, and what stands forward only up to the front's face: laid over one
    // another, their tops lay in one plane and flickered.)
    // (Each run with its edges taken off, as a moulding's are: against the sky a square run reads as a plank.)
    const e = 0.02;
    // (Where a wall goes on into a wedge, its run stops at the join, and the wedge's carries on from there; round the wedge, the runs meet
    // at its corners however sharp.)
    on(front, 'plaster', ws === -1 ? 0 : -reach, front.L + (ws === 1 ? 0 : reach), y0, y3, -reach, 0.5, colour, false, e);
    on(back, 'plaster', ws === 1 ? 0 : -reach, back.L + (ws === -1 ? 0 : reach), y0, y3, -reach, 0.5, colour, false, e);
    for (const [f, side] of [[right, 1], [left, -1]] as [Face, number][]) if (ws !== side) on(f, 'plaster', 0.5, f.L - 0.5, y0, y3, -reach, 0.5, colour, false, e);
    if (wedgeWalls) {
      const { frontW, backW, endW, mF, mB } = wedgeWalls;
      if (frontW.L > 0.3) on(frontW, 'plaster', ws > 0 ? 0 : -reach * mF, frontW.L + (ws > 0 ? reach * mF : 0), y0, y3, -reach, 0.5, colour, false, e);
      if (backW.L > 0.3) on(backW, 'plaster', ws > 0 ? -reach * mB : 0, backW.L + (ws > 0 ? 0 : reach * mB), y0, y3, -reach, 0.5, colour, false, e);
      on(endW, 'plaster', -reach * mF, endW.L + reach * mB, y0, y3, -reach, 0.5, colour, false, e);
    }
    if (b.portico) box('plaster', centreLeft - reach, centreRight + reach, y0, y3, -out - COL - reach, -reach, colour, false, e);
    if (fr.pavilions) { box('plaster', -W / 2 - reach, fr.pavL + reach, y0, y3, -PAV - reach, -reach, colour, false, e); box('plaster', fr.pavR - reach, W / 2 + reach, y0, y3, -PAV - reach, -reach, colour, false, e); }
  };
  // (And round the wings, which are finished as the main block is.)
  const roundWings = (y0: number, y3: number, reach: number) => { for (const f of wingFaces.flat()) on(f, 'plaster', -reach, f.L + reach, y0, y3, -reach, 0.5, WHITE, false, 0.02); };
  // (Each style's mouldings, from the frieze up, with how far each stands out: all of them up to the low wall over the cornice.)
  const mouldings: [number, number, number][] = rich ? [[0, 0.42, 0.04], [0.42, 0.52, 0.14], [0.52, 0.62, 0.26], [0.62, 0.78, 0.4]]
    : style === 'lesenes' ? [[0, 0.42, 0.04], [0.42, 0.6, 0.16], [0.6, 0.78, 0.3]] : [[0, 0.5, 0.02], [0.5, 0.64, 0.1], [0.64, 0.78, 0.2]];
  for (const [y0, y3, reach] of mouldings) roundWings(top + y0, top + y3, reach);
  for (const [y0, y3, reach] of mouldings) round(top + y0, top + y3, reach, WHITE);
  if (rich) for (let u = -W / 2 + 0.1; u < W / 2 - 0.05; u += 0.27) {
    const forward = b.portico && u > centreLeft && u < centreRight - 0.1 ? out + COL : fr.pavilions && (u + 0.12 < fr.pavL || u > fr.pavR) ? PAV : 0;
    box('plaster', u, u + 0.12, top + 0.3, top + 0.42, -forward - 0.13, -forward, WHITE);
  }
  if (rich && wedgeWalls && wedgeWalls.frontW.L > 0.6) { const f = wedgeWalls.frontW, lim = f.L - 0.3 * wedgeWalls.mF; for (let a = ws > 0 ? 0.17 : 0.3 * wedgeWalls.mF; a < (ws > 0 ? lim : f.L - 0.1); a += 0.27) on(f, 'plaster', a, a + 0.12, top + 0.3, top + 0.42, -0.13, 0, WHITE); }
  // Wreaths along the frieze, one over each window of the front, where the dress has them.
  if (dr.frieze && !bare) for (const st of stretches) for (const n of st.bays) {
    const u = fr.windows[n], v = -st.out - (st.centre ? COL : 0) - 0.07, y = top + 0.21, r = 0.13;
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
      stick(at(u + Math.cos(a0) * r, y + Math.sin(a0) * r, v), at(u + Math.cos(a1) * r, y + Math.sin(a1) * r, v), 0.05, 0.045, WHITE, 'plaster');
    }
    for (const side of [-1, 1]) stick(at(u + side * r * 0.7, y - r * 0.7, v), at(u + side * (r + 0.22), y - r - 0.06, v), 0.03, 0.04, WHITE, 'plaster');
  }
  // The low wall over the cornice, which is what the roof stands behind.
  const attic = top + 0.78;
  // A balustrade along the top of the cornice, before the roof, where the dress has one: along each stretch of the front at its own
  // line (not over a pediment, nor where a tower stands), and along the two ends of the main block.
  if (dr.balustrade) {
    const towerAt = (u: number) => (b.towers ?? []).some((tw) => tw.corner === 'front' && tw.side * u > W / 2 - tw.size - 0.4);
    for (const st of stretches) {
      if (st.centre && b.pediment !== false) continue;
      const face: Face = { L: st.u1 - st.u0, P: (s, y, t) => front.P(st.u0 + W / 2 + s, y, t - st.out - (st.centre ? COL : 0)) };
      let s0 = 0.05, s1 = face.L - 0.05;
      while (s0 < s1 && towerAt(st.u0 + s0)) s0 += 0.25;
      while (s1 > s0 && towerAt(st.u0 + s1)) s1 -= 0.25;
      balustrade(face, s0, s1, attic, -0.36);
    }
    if (!(b.towers ?? []).some((tw) => tw.corner !== 'wing')) for (const [f, side] of [[right, 1], [left, -1]] as [Face, number][]) if (ws !== side) balustrade(f, 0.05, f.L - 0.05, attic, -0.36);
  }
  box('plaster', -W / 2, W / 2, attic, attic + 0.5, 0, D, wash);
  if (wd) { prism('plaster', wd.ring, attic, attic + 0.5, wash); prism('plaster', insetRing(wd.ring, [-0.05, -0.05, -0.05, 0]), attic + 0.5, attic + 0.58, WHITE); }
  box('plaster', -W / 2 - 0.05, W / 2 + 0.05, attic + 0.5, attic + 0.58, -0.05, D + 0.05, WHITE);
  for (const g of b.wings ?? []) {
    const ua = g.side > 0 ? W / 2 - g.width : -W / 2, ub = g.side > 0 ? W / 2 : -W / 2 + g.width, wf = frames.get(g.side)!, boxW = boxIn(g.side), A = atIn(g.side);
    // (A wing that leans begins within the main block, where its corner nearest the middle meets the back.)
    const from = wf.leans ? D + wf.foot : D;
    boxW('plaster', ua, ub, attic, attic + 0.5, from - 0.02, D + g.length, wash);
    boxW('plaster', ua - 0.05, ub + 0.05, attic + 0.5, attic + 0.58, from, D + g.length + 0.05, WHITE);
    // Its roof: hipped at its far end, and at its near end running in under the main block's, where it is lower. (One leaning in over
    // the court never comes under it: its ridge would pass over the corner of the main block's roof and out at its end. Its near end
    // is hipped too, from the corner of the back, and the main block's roof runs into it.)
    const y = attic + 0.58, e = 0.06, slope = Math.tan((21 * Math.PI) / 180), half = g.width / 2 + e, rise = half * slope, mid = (ua + ub) / 2;
    const sinA = -g.side * wf.s, cosA = wf.c, hipNear = sinA < -1e-6;
    const near = hipNear ? D - e : D + (-half - (g.width / 2) * sinA) / cosA, apex = hipNear ? near + half : near, far = D + g.length + e;
    const up = new Vector3(0, 1, 0), dirOf = (du: number, dv: number) => A(du, 0, dv).sub(A(0, 0, 0)).add(up);
    const p = (u: number, yy: number, v: number) => A(u, yy, v);
    poly(roofMat, [p(ua - e, y, near), p(ua - e, y, far), p(mid, y + rise, far - half), p(mid, y + rise, apex)], roofTone, dirOf(-1, 0));
    poly(roofMat, [p(ub + e, y, near), p(ub + e, y, far), p(mid, y + rise, far - half), p(mid, y + rise, apex)], roofTone, dirOf(1, 0));
    poly(roofMat, [p(ua - e, y, far), p(ub + e, y, far), p(mid, y + rise, far - half)], roofTone, dirOf(0, 1));
    poly(roofMat, [p(ua - e, y, near), p(ub + e, y, near), p(mid, y + rise, apex)], roofTone, dirOf(0, -1));
    poly(roofMat, [p(ua - e, y, near), p(ub + e, y, near), p(ub + e, y, far), p(ua - e, y, far)], shade(roofTone, 0.6), new Vector3(0, -1, 0));
    for (let v = D + 0.3; v < far - 0.2; v += 0.68) {
      const reach = Math.min(half, far - v, hipNear ? v - near : half);
      if (seams) for (const side of [-1, 1]) stick(p(side < 0 ? ua - e : ub + e, y + 0.02, v), p(side < 0 ? ua - e + reach : ub + e - reach, y + reach * slope + 0.02, v), 0.035, 0.05, shade(roofTone, 0.85), roofMat);
    }
  }
  if (b.portico && b.pediment !== false) {
    // The pediment over the middle: its face set back within mouldings that follow its slopes.
    // (Unless it has none: then the middle that stands forward ends at the cornice, which runs straight across it.)
    const half = (centreRight - centreLeft) / 2 + 0.4, mid = (centreLeft + centreRight) / 2, rise = half * 0.42, v = -out - COL - 0.4;
    wedge(at(mid - half, attic, v + 0.22), at(mid + half, attic, v + 0.22), at(mid, attic + rise, v + 0.22), at(0, 0, 2.2 + out + COL).sub(at(0, 0, 0)), [roofMat, roofTone], ['plaster', wash], ['plaster', WHITE]);
    for (const side of [-1, 1]) stick(at(mid + side * half, attic + 0.06, v + 0.1), at(mid, attic + rise + 0.06, v + 0.1), 0.26, 0.16, WHITE, 'plaster');
    // In the tympanum: a small window; a round one; a clock with its hands at ten past ten; or nothing.
    const cy = attic + rise * 0.42, R = Math.min(0.6, rise * 0.3);
    if (dr.tympanum === 'window') box('plaster', mid - 0.3, mid + 0.3, attic + rise * 0.3, attic + rise * 0.3 + 0.36, v + 0.18, v + 0.24, PANE);
    else if (dr.tympanum !== 'plain') {
      disc(mid, cy, R + 0.1, v + 0.17, v + 0.22, dr.tympanum === 'clock' ? [0.08, 0.08, 0.09] : WHITE);
      disc(mid, cy, R, v + 0.15, v + 0.2, dr.tympanum === 'clock' ? [0.88, 0.86, 0.8] : PANE);
      if (dr.tympanum === 'clock') {
        for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; stick(at(mid + Math.sin(a) * R * 0.78, cy + Math.cos(a) * R * 0.78, v + 0.14), at(mid + Math.sin(a) * R * 0.92, cy + Math.cos(a) * R * 0.92, v + 0.14), 0.03, 0.04, [0.08, 0.08, 0.09], 'metal'); }
        for (const [a, len] of [[(-60 * Math.PI) / 180, 0.55], [(60 * Math.PI) / 180, 0.8]]) stick(at(mid, cy, v + 0.12), at(mid + Math.sin(a) * R * len, cy + Math.cos(a) * R * len, v + 0.12), 0.03, 0.05, [0.08, 0.08, 0.09], 'metal');
      } else for (const a of [0, Math.PI / 2]) stick(at(mid - Math.cos(a) * R, cy - Math.sin(a) * R, v + 0.13), at(mid + Math.cos(a) * R, cy + Math.sin(a) * R, v + 0.13), 0.04, 0.05, WHITE, 'plaster');
    }
  }
  // The roof: low, hipped, of sheet metal laid in seams up the slope. (Over a wedge, the same roof carried on, hipped to its slanting
  // end: the ridge ends where it is as far from that end's eaves as from the front's.)
  {
    const y = attic + 0.58, e = 0.06, slope = Math.tan((21 * Math.PI) / 180), half = D / 2 + e, rise = half * slope;
    /** Each end's eaves at the front and at the back, and where the ridge ends over it, as `u`. */
    const endOf = (side: -1 | 1) => {
      if (!wd || side !== ws) return { front: side * (W / 2 + e), back: side * (W / 2 + e), ridge: side * (W / 2 + e - half) };
      // (The slanting end's eaves stand `e` out from its wall: along the line through its corners moved out, where it meets the front's
      // eaves and the back's; and the ridge where it is `half` in from that line.)
      const ou = wd.F[0] - wd.nu * e, ov = wd.F[1] - wd.nv * e, at_ = (v: number) => ou + (wd.du * (v - ov)) / wd.dv;
      return { front: at_(-e), back: at_(D + e), ridge: ou + (half - (D / 2 - ov) * wd.nv) / wd.nu };
    };
    const L = endOf(-1), R = endOf(1);
    const a = at(L.front, y, -e), c = at(R.front, y, -e), g = at(R.back, y, D + e), h = at(L.back, y, D + e);
    const r0 = at(L.ridge, y + rise, D / 2), r1 = at(R.ridge, y + rise, D / 2), up = new Vector3(0, 1, 0);
    const outward = (n: Vector3) => n.add(up);
    poly(roofMat, [a, c, r1, r0], roofTone, outward(at(0, 0, -1).sub(at(0, 0, 0))));
    poly(roofMat, [g, h, r0, r1], roofTone, outward(at(0, 0, 1).sub(at(0, 0, 0))));
    poly(roofMat, [c, g, r1], roofTone, outward(at(1, 0, 0).sub(at(0, 0, 0))));
    poly(roofMat, [h, a, r0], roofTone, outward(at(-1, 0, 0).sub(at(0, 0, 0))));
    poly(roofMat, [a, c, g, h], shade(roofTone, 0.6), new Vector3(0, -1, 0));
    // (A seam runs from the eaves to the ridge, or to a hip where it comes to one first.)
    const reachAt = (u: number, corner: (q: typeof L) => number) => {
      let reach = half;
      for (const q of [L, R]) { const cu = corner(q); if ((u - q.ridge) * (cu - q.ridge) > 0) reach = Math.min(reach, (half * (cu - u)) / (cu - q.ridge)); }
      return reach;
    };
    for (const [side, corner] of [[-1, (q: typeof L) => q.front], [1, (q: typeof L) => q.back]] as [number, (q: typeof L) => number][]) {
      for (let u = corner(L) + 0.4; u < corner(R) - 0.2; u += 0.68) {
        const reach = reachAt(u, corner);
        if (seams && reach > 0.05) stick(at(u, y + 0.02, side < 0 ? -e : D + e), at(u, y + reach * slope + 0.02, side < 0 ? -e + reach : D + e - reach), 0.035, 0.05, shade(roofTone, 0.85), roofMat);
      }
    }
    // Chimneys, plastered, each with a white cap.
    const stacks = b.bays >= 7 ? 4 : 2;
    for (let n = 0; n < stacks; n++) {
      const u = (-0.5 + (n + 0.5) / stacks) * Math.max(1.5, W - D * 0.9), v = D / 2 + (n % 2 ? 1.5 : -1.5);
      box('plaster', u - 0.45, u + 0.45, y + rise * 0.4, y + rise + 0.95, v - 0.3, v + 0.3, b.brick ? wash : shade(wash, 0.92));
      box('plaster', u - 0.52, u + 0.52, y + rise + 0.95, y + rise + 1.07, v - 0.37, v + 0.37, WHITE);
      tops?.push(at(u, y + rise + 1.07, v));
    }
    // A flagpole on the ridge over the middle, where the dress has one.
    if (dr.flag) {
      stick(at(0, y + rise - 0.3, D / 2), at(0, y + rise + 9, D / 2), 0.09, 0.09, [0.86, 0.86, 0.84], 'metal');
      box('metal', -0.11, 0.11, y + rise + 9, y + rise + 9.22, D / 2 - 0.11, D / 2 + 0.11, [0.7, 0.6, 0.3]);
    }
  }
  // Towers at the corners, rising storeys of their own over the cornice: walls standing a hand proud of the front below so that the
  // low wall over the cornice is lost in them, windows in every face of every storey, a cornice of their own, and a pyramid roof of
  // the same sheet metal with an iron finial. Nothing in them can be reached; the roofs below run on into them.
  const at0 = at;
  for (const tw of b.towers ?? []) {
    // (None at a corner that a wedge has carried on past.)
    if (tw.corner !== 'wing' && tw.side === ws) continue;
    const wing = tw.corner === 'wing' ? (b.wings ?? []).find((g) => g.side === tw.side) : undefined;
    if (tw.corner === 'wing' && !wing) continue;
    // (One at the end of a wing that leans is built in the wing's measures, and turned with it.)
    const oblique = !!wing && frames.get(wing.side)!.leans, at = oblique ? atIn(wing!.side) : at0;
    const S = tw.size, P = 0.06, outer = tw.side * W / 2, inner = tw.side * (W / 2 - S);
    const v0 = tw.corner === 'front' ? 0 : tw.corner === 'back' ? D - S : D + wing!.length - S, v1 = v0 + S;
    const u0 = Math.min(outer, inner) - P, u1 = Math.max(outer, inner) + P, a0 = v0 - P, a1 = v1 + P;
    const faces: Face[] = [
      { L: u1 - u0, P: (s0, y, t) => at(u0 + s0, y, a0 + t), oblique },
      { L: a1 - a0, P: (s0, y, t) => at(u1 - t, y, a0 + s0), oblique },
      { L: u1 - u0, P: (s0, y, t) => at(u1 - s0, y, a1 - t), oblique },
      { L: a1 - a0, P: (s0, y, t) => at(u0 + t, y, a1 - s0), oblique },
    ];
    const heights = Array.from({ length: tw.extra }, (_, n) => 3.1 - n * 0.15), from = attic;
    let y = from;
    const each = Math.max(1, Math.round((S - 1.2) / 2.6));
    heights.forEach((h, storey) => {
      const yb = y, ye = y + h;
      for (const f of faces) {
        const pitch = f.L / each, gaps: Gap[] = Array.from({ length: each }, (_, n) => ({ s0: (n + 0.5) * pitch - 0.55, s1: (n + 0.5) * pitch + 0.55, y0: yb + (storey === 0 ? 0.85 : 0.6), y1: ye - 0.75 }));
        pierced(f, 'plaster', 0, f.L, yb, ye, 0, T, wash, gaps);
        for (const g of gaps) {
          glazed(f, g, 2, 3, frame);
          for (const [a, e] of [[g.s0 - 0.15, g.s0], [g.s1, g.s1 + 0.15]]) on(f, 'plaster', a, e, g.y0, g.y1 + 0.15, -0.04, 0.06, WHITE);
          on(f, 'plaster', g.s0, g.s1, g.y1, g.y1 + 0.15, -0.04, 0.06, WHITE);
          on(f, 'plaster', g.s0 - 0.22, g.s1 + 0.22, g.y0 - 0.09, g.y0, -0.17, 0.08, WHITE);
          on(f, 'plaster', g.s0 - 0.2, g.s1 + 0.2, g.y1 + 0.15, g.y1 + 0.27, -0.1, 0.03, WHITE);
        }
        // A band at each floor, and strips at the corners.
        on(f, 'plaster', -0.06, f.L + 0.06, yb, yb + 0.16, -0.06, 0.05, WHITE);
        for (const sx of [0.25, f.L - 0.25]) on(f, 'plaster', sx - 0.25, sx + 0.25, yb, ye, -0.05, 0.03, WHITE);
      }
      y = ye;
    });
    // Its cornice, three mouldings each further out; then the roof.
    for (const [lo, hi, reach] of [[y, y + 0.36, 0.04], [y + 0.36, y + 0.46, 0.15], [y + 0.46, y + 0.6, 0.3]] as [number, number, number][]) for (const f of faces) on(f, 'plaster', -reach, f.L + reach, lo, hi, -reach, 0.5, WHITE);
    const ey = y + 0.6, e = 0.32, mu = (u0 + u1) / 2, mv = (a0 + a1) / 2, rise = (S / 2 + e) * Math.tan((36 * Math.PI) / 180);
    const c0 = at(u0 - e, ey, a0 - e), c1 = at(u1 + e, ey, a0 - e), c2 = at(u1 + e, ey, a1 + e), c3 = at(u0 - e, ey, a1 + e), apex = at(mu, ey + rise, mv), up = new Vector3(0, 1, 0);
    const outOf = (du: number, dv: number) => at(du, 0, dv).sub(at(0, 0, 0)).add(up);
    poly(roofMat, [c0, c1, apex], roofTone, outOf(0, -1));
    poly(roofMat, [c1, c2, apex], roofTone, outOf(1, 0));
    poly(roofMat, [c2, c3, apex], roofTone, outOf(0, 1));
    poly(roofMat, [c3, c0, apex], roofTone, outOf(-1, 0));
    poly(roofMat, [c0, c1, c2, c3], shade(roofTone, 0.6), new Vector3(0, -1, 0));
    // (Seams down each face of the roof, from the eaves to the hips.)
    for (let d = -S / 2 + 0.3; d < S / 2 - 0.1; d += 0.6) for (const [du, dv] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const along = (q: number) => (du === 0 ? mu + q : mu + du * (S / 2 + e)), across = (q: number) => (dv === 0 ? mv + q : mv + dv * (S / 2 + e));
      const reach = S / 2 + e - Math.abs(d), foot = at(along(d), ey + 0.02, across(d)), head = at(along(d) - du * reach, ey + reach * Math.tan((36 * Math.PI) / 180) + 0.02, across(d) - dv * reach);
      if (seams) stick(foot, head, 0.03, 0.045, shade(roofTone, 0.85), roofMat);
    }
    stick(at(mu, ey + rise - 0.05, mv), at(mu, ey + rise + 1.1, mv), 0.07, 0.07, [0.08, 0.08, 0.085], 'metal');
    boxIn(oblique ? wing!.side : undefined)('metal', mu - 0.11, mu + 0.11, ey + rise + 0.55, ey + rise + 0.77, mv - 0.11, mv + 0.11, [0.62, 0.5, 0.2]);
  }
  // ------------------------------------------------------------------ inside
  dress.active = false;
  // The rooms are as the site document plans them; this builds them. Each is its clear floor, and
  // its walls are linings standing out from it into the wall about it: half of a wall shared with
  // the next room, and of an outer wall all of it within the rendered skin. Two linings back to
  // back are a wall; a door or window is the same hole cut in each.
  const plan = b.plan!, plan0 = plan, sw = plan.walls, stairs = classicalStairs(b);
  type Rect = { u0: number; u1: number; v0: number; v1: number };
  const frontOf = (u: number) => (b.portico && u > centreLeft && u < centreRight ? -out : 0);
  // How deep the lining on each side of a room is, and where the middle of that wall is.
  // (How deep the lining on each side of a room is, the plan says; and where it reaches to, which is where a skin with openings in it may be.)
  const lining = (r: (typeof plan.rooms)[number], side: number): { thick: number; far: number; face: number; dir: number } => {
    const face = [r.v0, r.v1, r.u0, r.u1][side], dir = side % 2 === 0 ? -1 : 1, thick = r.linings[side];
    return { thick, far: face + dir * thick, face, dir };
  };
  void frontOf; void sw;
  const stone2: Colour = [0.8, 0.77, 0.7], rail: Colour = [0.16, 0.1, 0.07];
  // (A stair behind each entrance.)
  for (const stair of stairs) {
  const stairAt = (a: number, e: number, y: number) => { const p = stair.place(a, e); return at(p.u, y, p.v); };
  stair.flights.forEach((f, storey) => {
    const { START, TREAD, LANDING, across, strip } = stair, fy = floorY(storey), mid = fy + f.first * f.rise, second = f.steps - f.first, end = f.turn - second * TREAD, upper = floorY(storey + 1);
    const piece = (a0: number, a1: number, e0: number, e1: number, lo: number, hi: number, colour: Colour, material = 'stone') => block(material, stairAt(a0, e0, lo), stairAt(a1, e1, hi), colour);
    for (let i = 1; i <= f.first; i++) piece(START + (i - 1) * TREAD, START + i * TREAD + 0.01, 0, strip, fy + i * f.rise - 0.22, fy + i * f.rise, stone2);
    piece(f.turn, f.turn + LANDING, 0, across, mid - 0.22, mid, stone2);
    for (let j = 1; j <= second; j++) piece(f.turn - j * TREAD - 0.01, f.turn - (j - 1) * TREAD, across - strip, across, mid + j * f.rise - 0.22, mid + j * f.rise, stone2);
    // What carries the landing, and the rails: one up each flight, on posts.
    for (const e of [0.06, across - 0.18]) piece(f.turn + LANDING - 0.2, f.turn + LANDING - 0.08, e, e + 0.12, fy, mid - 0.22, stone2);
    const post = (a: number, e: number, y: number) => piece(a - 0.04, a + 0.04, e - 0.04, e + 0.04, y, y + 1.0, rail, 'wood');
    for (const e of stair.broad ? [0.05, strip + 0.02] : [strip + 0.02]) {
      stick(stairAt(START, e, fy + 0.95), stairAt(f.turn, e, mid + 0.95), 0.06, 0.06, rail);
      post(START, e, fy); post(f.turn, e, mid);
    }
    stick(stairAt(f.turn, across - strip - 0.02, mid + 0.95), stairAt(end, across - strip - 0.02, upper + 0.95), 0.06, 0.06, rail);
    post(f.turn, across - strip - 0.02, mid); post(end, across - strip - 0.02, upper);
    // Round the well in the floor above: a rail along its open side and across its far end; and at the top of the house across its near end too.
    const level = (a0: number, e0: number, a1: number, e1: number) => {
      stick(stairAt(a0, e0, upper + 0.95), stairAt(a1, e1, upper + 0.95), 0.06, 0.06, rail);
      const n = Math.max(1, Math.round(Math.hypot(a1 - a0, e1 - e0) / 1.1));
      for (let i = 0; i <= n; i++) post(a0 + ((a1 - a0) * i) / n, e0 + ((e1 - e0) * i) / n, upper);
    };
    if (stair.broad) level(START + 0.06, -0.05, f.turn + LANDING + 0.05, -0.05);
    if (stair.broad) level(f.turn + LANDING + 0.05, -0.05, f.turn + LANDING + 0.05, across);
    if (storey === N - 2) level(START - 0.05, 0, START - 0.05, strip + 0.1);
    // (Where the second flight comes up a step short of the floor's edge, a strip of floor to step onto.)
    if (end > START + 0.01) piece(START, end, across - strip, across, upper - 0.3, upper, stone2);
  });
  }
  // The wells in the floor of a storey, for the flights that come up to it.
  const wellsOf = (storey: number): Rect[] => stairs.flatMap((stair) => {
    const f = stair.flights[storey - 1];
    if (!f) return [];
    const p = stair.place(stair.START, 0), q = stair.place(f.turn + stair.LANDING, stair.across);
    return [{ u0: Math.min(p.u, q.u), u1: Math.max(p.u, q.u), v0: Math.min(p.v, q.v), v1: Math.max(p.v, q.v) }];
  });
  const without = (r: Rect, hole: Rect | null): Rect[] => {
    if (!hole || hole.u1 <= r.u0 || hole.u0 >= r.u1 || hole.v1 <= r.v0 || hole.v0 >= r.v1) return [r];
    const parts: Rect[] = [{ u0: r.u0, u1: r.u1, v0: r.v0, v1: Math.max(r.v0, hole.v0) }, { u0: r.u0, u1: r.u1, v0: Math.min(r.v1, hole.v1), v1: r.v1 }];
    parts.push({ u0: r.u0, u1: Math.max(r.u0, hole.u0), v0: Math.max(r.v0, hole.v0), v1: Math.min(r.v1, hole.v1) }, { u0: Math.min(r.u1, hole.u1), u1: r.u1, v0: Math.max(r.v0, hole.v0), v1: Math.min(r.v1, hole.v1) });
    return parts.filter((q) => q.u1 - q.u0 > 0.02 && q.v1 - q.v0 > 0.02);
  };

  const paints: Colour[] = [[0.62, 0.72, 0.6], [0.58, 0.66, 0.74], [0.82, 0.7, 0.45], [0.8, 0.6, 0.56], [0.5, 0.2, 0.17], [0.86, 0.83, 0.74], [0.66, 0.62, 0.7], [0.45, 0.56, 0.5]];
  const boards: Colour = [0.42, 0.29, 0.17], sill: Colour = [0.9, 0.88, 0.83];
  // Under the ground floor, and over the top one.
  {
    // (Not under the carriage way, whose floor is the street's.)
    const way = plan0.rooms.find((r) => r.kind === 'carriage'), cuts = way ? [[-W / 2 + 0.2, way.u0 - 0.05], [way.u1 + 0.05, W / 2 - 0.2]] : [[-W / 2 + 0.2, W / 2 - 0.2]];
    for (const [a, e] of cuts) if (e - a > 0.05) box('stone', a, e, 0.1, PLINTH - 0.04, (b.portico ? -out : 0) + 0.2, D - 0.2, shade(stone, 0.6));
  }
  box('plaster', -W / 2 + 0.2, W / 2 - 0.2, top - 0.3, top, (b.portico ? -out : 0) + 0.2, D - 0.2, WHITE);
  // Where a wing leans, what lies between the back and its first room, which is not square to either: filled solid from the ground to
  // the top of the walls, but for a passage on every storey from the door through the back to the door of that room.
  for (const g of b.wings ?? []) {
    const wf = frames.get(g.side)!;
    if (!wf.leans) continue;
    const A = atIn(g.side), s = g.side, skin = CLASSICAL.skin, l1 = wf.from0, door = (W / 2 - g.width / 2) * s - s * 0.2, xd = W / 2 - s * door;
    /** A solid standing on the stretch of that ground from `xa` to `xb` in from the wing's outer wall, from `y0` to `y1`. */
    const fill = (xa: number, xb: number, y0: number, y1: number, material: string, colour: Colour) => {
      if (xb - xa < 0.01) return;
      prism(material, ([[xa, wf.back(xa)], [xb, wf.back(xb)], [xb, l1], [xa, l1]] as [number, number][]).map(([x, l]) => [s * (W / 2 - x), D + l] as [number, number]), y0, y1, colour, A);
    };
    const inside: Colour = [0.84, 0.81, 0.72], g0 = Math.min(0, ...[0, g.width].map((x) => groundOf(b, D, s * (W / 2 - x))));
    fill(skin, xd - 0.7, g0, top, 'plaster', inside);
    fill(xd + 0.7, g.width - skin, g0, top, 'plaster', inside);
    fill(xd - 0.7, xd + 0.7, g0, floorY(0), 'stone', shade(stone, 0.6));
    for (let storey = 0; storey < N; storey++) {
      const fy = floorY(storey), tall = Math.min(2.35, b.heights[storey] - 0.75);
      fill(xd - 0.7, xd + 0.7, fy + tall, storey + 1 < N ? floorY(storey + 1) : top, 'plaster', inside);
    }
  }
  for (let storey = 0; storey < N; storey++) {
    const fy0 = floorY(storey), h = b.heights[storey], clear = fy0 + h - 0.3, doorTop = fy0 + Math.min(storey === 1 ? 2.7 : 2.35, h - 0.75);
    plan.rooms.forEach((room, index) => {
      // (A room named for one storey is on that one alone. The carriage way's floor is the street's, paved in setts, and its walls are the front's wash.)
      if (room.storey !== undefined && room.storey !== storey) return;
      const way = room.kind === 'carriage', fy = way ? 0.02 : fy0;
      const lived = room.kind === 'front' || room.kind === 'back', colour: Colour = way ? shade(wash, 0.92) : lived ? rng.pick(paints) : [0.84, 0.81, 0.72];
      const thick = [0, 1, 2, 3].map((side) => lining(room, side));
      // (A room in a wing that leans is built in the wing's measures; nothing of the main block's walls or doors is in them.)
      const atR = atIn(room.frame), boxR = boxIn(room.frame), oblique = room.frame !== undefined && !!frames.get(room.frame)?.leans;
      // The floor reaches to the middle of each wall about it: boards, or in the halls squares of two stones; and under it the ceiling of the room below.
      const whole: Rect = { u0: room.u0 - thick[2].thick, u1: room.u1 + thick[3].thick, v0: room.v0 - thick[0].thick, v1: room.v1 + thick[1].thick };
      for (const part of (oblique ? [] : wellsOf(storey)).reduce((parts, well) => parts.flatMap((q) => without(q, well)), [whole])) {
        if (storey > 0) boxR('plaster', part.u0, part.u1, fy - 0.3, fy - 0.04, part.v0, part.v1, WHITE);
        if (lived) boxR('wood', part.u0, part.u1, fy - 0.04, fy, part.v0, part.v1, boards, true);
        else if (way) for (let v = part.v0, j = 0; v < part.v1 - 0.01; v += 0.16, j++) for (let u = part.u0 + (j % 2) * 0.12, i = 0; u < part.u1 - 0.01; u += 0.24, i++) {
          box('stone', Math.max(part.u0, u) + 0.01, Math.min(part.u1, u + 0.24) - 0.01, fy - 0.06, fy, v + 0.01, Math.min(part.v1, v + 0.16) - 0.01, shade(stone, 0.55 + 0.12 * (((i * 7 + j * 13) % 5) / 4)));
        }
        else for (let u = part.u0, i = 0; u < part.u1 - 0.01; u += 0.62, i++) for (let v = part.v0, j = 0; v < part.v1 - 0.01; v += 0.62, j++) {
          boxR('stone', u, Math.min(part.u1, u + 0.62), fy - 0.04, fy, v, Math.min(part.v1, v + 0.62), (i + j) % 2 ? [0.78, 0.75, 0.68] : [0.36, 0.35, 0.34]);
        }
      }
      // The four linings, cut for doors and windows, each with a skirting, a rail and a cornice; a frame to each door and a sill to each window.
      // (Each runs on past the room's corners by the depth of the linings it meets, so that no corner is left open.)
      const faces: { f: Face; lo: number; L: number; outer: number; line: 'u' | 'v' }[] = [
        { f: { L: 0, P: (s, y, t) => atR(room.u0 + s, y, room.v0 - t), oblique }, lo: room.u0, L: room.u1 - room.u0, outer: 0, line: 'v' },
        { f: { L: 0, P: (s, y, t) => atR(room.u0 + s, y, room.v1 + t), oblique }, lo: room.u0, L: room.u1 - room.u0, outer: 2, line: 'v' },
        { f: { L: 0, P: (s, y, t) => atR(room.u0 - t, y, room.v0 + s), oblique }, lo: room.v0, L: room.v1 - room.v0, outer: 3, line: 'u' },
        { f: { L: 0, P: (s, y, t) => atR(room.u1 + t, y, room.v0 + s), oblique }, lo: room.v0, L: room.v1 - room.v0, outer: 1, line: 'u' },
      ];
      faces.forEach((side, n) => {
        const f = side.f, { thick: deep, far, face, dir } = thick[n], axis = n < 2 ? 'v' : 'u', gaps: Gap[] = [], ways: Gap[] = [];
        const s0 = -(n < 2 ? thick[2].thick : thick[0].thick), s1 = side.L + (n < 2 ? thick[3].thick : thick[1].thick);
        // Openings in a skin that this lining reaches: windows, outer doors, and doors through into a wing.
        for (const hole of holes) if (hole.frame === room.frame && hole.axis === axis && far > hole.lo - 0.06 && far < hole.hi + 0.06 && hole.storey === storey && hole.c > side.lo - 0.01 && hole.c < side.lo + side.L + 0.01) gaps.push({ s0: hole.c - hole.half - side.lo, s1: hole.c + hole.half - side.lo, y0: hole.y0, y1: hole.y1 });
        // Doors between rooms in this wall: whose middle line lies within the wall, out from this room's floor. (Those through a skin are cut with it, above.)
        for (const door of plan.doors) if (!door.through && door.frame === room.frame && (door.storey === undefined || door.storey === storey) && door.line === side.line && (door.at - face) * dir > 0 && (door.at - face) * dir < deep + 0.6 && door.c > side.lo && door.c < side.lo + side.L) ways.push({ s0: door.c - door.w / 2 - side.lo, s1: door.c + door.w / 2 - side.lo, y0: fy - 0.05, y1: door.tall ? Math.min(clear - 0.35, fy + 3.0) : doorTop });
        const open = [...gaps, ...ways];
        pierced(f, 'plaster', s0, s1, fy, clear, 0, deep, colour, open);
        if (!way) {
          pierced(f, 'plaster', s0, s1, fy, fy + 0.16, -0.02, 0, WHITE, open);
          pierced(f, 'plaster', s0, s1, fy + 0.9, fy + 0.96, -0.025, 0, WHITE, open);
        } else pierced(f, 'stone', s0, s1, fy, fy + 0.45, -0.03, 0, shade(stone, 0.7), open);
        on(f, 'plaster', s0, s1, clear - 0.14, clear, -0.1, 0, WHITE);
        for (const g of ways) {
          for (const [a, e] of [[g.s0 - 0.12, g.s0], [g.s1, g.s1 + 0.12]]) on(f, 'plaster', a, e, fy, g.y1 + 0.12, -0.035, 0, WHITE);
          on(f, 'plaster', g.s0, g.s1, g.y1, g.y1 + 0.12, -0.035, 0, WHITE);
        }
        // A window's sill inside is a board the whole depth of the lining, standing out a little into the room.
        for (const g of gaps) if (g.y0 > fy + 0.3) on(f, 'wood', g.s0 - 0.06, g.s1 + 0.06, g.y0 - 0.04, g.y0 + 0.02, -0.06, deep, sill, true);
      });
      // A stove of glazed tiles in the corner of each front room, away from the windows: a foot, a tall body, a cornice, and its small iron door.
      if (room.kind === 'front') {
        const near = Math.abs(room.u0) < Math.abs(room.u1) ? room.u0 + 0.06 : room.u1 - 0.06 - 0.58, v = room.v1 - 0.06 - 0.8, tiles: Colour = index % 3 ? [0.88, 0.88, 0.84] : [0.3, 0.42, 0.34];
        const body = Math.min(clear - 0.5, fy + 2.3);
        box('stone', near - 0.03, near + 0.61, fy, fy + 0.24, v - 0.03, v + 0.8, [0.2, 0.2, 0.2]);
        box('metal', near, near + 0.58, fy + 0.24, body, v, v + 0.78, tiles);
        box('metal', near - 0.04, near + 0.62, body, body + 0.12, v - 0.04, v + 0.8, tiles);
        box('metal', near + 0.06, near + 0.52, body + 0.12, body + 0.3, v + 0.06, v + 0.72, tiles);
        box('metal', near + 0.16, near + 0.42, fy + 0.45, fy + 0.8, v - 0.025, v, [0.05, 0.05, 0.055]);
      }
      // In the room over the entrance hall, a table and two benches; in the entrance hall itself a bench by the wall.
      if (room.kind === 'hall') {
        const u = (room.u0 + room.u1) / 2, v = (room.v0 + room.v1) / 2 - 0.4, oak: Colour = [0.3, 0.2, 0.12];
        if (storey > 0) {
          box('wood', u - 1.0, u + 1.0, fy + 0.72, fy + 0.78, v - 0.5, v + 0.5, oak, true);
          for (const [du, dv] of [[-0.9, -0.42], [0.84, -0.42], [-0.9, 0.36], [0.84, 0.36]]) box('wood', u + du, u + du + 0.07, fy, fy + 0.72, v + dv, v + dv + 0.07, oak, true);
          for (const dv of [-1.0, 0.72]) {
            box('wood', u - 0.8, u + 0.8, fy + 0.42, fy + 0.46, v + dv, v + dv + 0.3, oak, true);
            for (const du of [-0.74, 0.68]) box('wood', u + du, u + du + 0.06, fy, fy + 0.42, v + dv + 0.04, v + dv + 0.26, oak, true);
          }
        } else {
          box('wood', room.u0 + 0.6, room.u0 + 2.2, fy + 0.44, fy + 0.49, room.v1 - 0.45, room.v1 - 0.05, oak, true);
          for (const du of [0.66, 2.08]) box('wood', room.u0 + du, room.u0 + du + 0.06, fy, fy + 0.44, room.v1 - 0.4, room.v1 - 0.1, oak, true);
        }
      }
    });
  }
  // The wedge within: the main block's end become a wall between rooms, with a door on every storey into each room against it; the
  // wedge's floors and ceilings; linings within its walls, cut for their windows; and walls across it with a door in the middle of each.
  if (wd && wedgeWalls) {
    const s = wd.side, endF = s > 0 ? right : left, skin = CLASSICAL.skin, IN = CLASSICAL.outer - skin, deep = skin + IN;
    const colour: Colour = rng.fork('wedge').pick(paints), ends = (v: number) => (s > 0 ? v : D - v);
    // (Under the ground floor, the stone of the plinth, as the main block's.)
    prism('stone', insetRing(wd.ring, [0.2, 0.2, 0.2, 0]), 0.1, PLINTH - 0.04, shade(stone, 0.6));
    prism('plaster', insetRing(wd.ring, [0.2, 0.2, 0.2, 0]), top - 0.3, top, WHITE);
    pierced(endF, 'plaster', skin, D - skin, Math.min(0, groundOf(b, 0, s * W / 2)), PLINTH, 0, skin, shade(stone, 0.6), []);
    for (let storey = 0; storey < N; storey++) {
      const fy = floorY(storey), h = b.heights[storey], clear = fy + h - 0.3, upper = storey + 1 < N ? floorY(storey + 1) : top;
      const doorTop = fy + Math.min(2.35, h - 0.75);
      // The main block's end: its skin, now within, cut for the doors; and on the wedge's side a skirting, a rail and a cornice.
      const doors: Gap[] = wd.doors.filter((q) => q.storey === undefined || q.storey === storey).map((q) => ({ s0: ends(q.v) - 0.55, s1: ends(q.v) + 0.55, y0: fy - 0.01, y1: doorTop }));
      pierced(endF, 'plaster', skin, D - skin, fy, upper, 0, skin, colour, doors);
      pierced(endF, 'plaster', skin, D - skin, fy, fy + 0.16, -0.02, 0, WHITE, doors);
      pierced(endF, 'plaster', skin, D - skin, fy + 0.9, fy + 0.96, -0.025, 0, WHITE, doors);
      on(endF, 'plaster', skin, D - skin, clear - 0.14, clear, -0.1, 0, WHITE);
      for (const g of doors) {
        for (const [a, e] of [[g.s0 - 0.12, g.s0], [g.s1, g.s1 + 0.12]]) on(endF, 'plaster', a, e, fy, g.y1 + 0.12, -0.035, 0, WHITE);
        on(endF, 'plaster', g.s0, g.s1, g.y1, g.y1 + 0.12, -0.035, 0, WHITE);
      }
      // The floor, boards over the ceiling of the storey below; to the skins of its walls.
      if (storey > 0) prism('plaster', wd.inner, fy - 0.3, fy - 0.04, WHITE);
      prism('wood', wd.inner, fy - 0.04, fy, boards);
      // The linings within its three walls, cut where the wall has its windows, with a skirting, a rail, a cornice and a sill to each
      // window; each running to where it meets the next, however sharp the corner. (`t` is measured into the room from the skin.)
      const sides: [Face, { rows: Opening[][] } | null, number, number][] = [
        [wedgeWalls.frontW, wedgeWalls.madeF, s > 0 ? 0 : wd.atFront, s > 0 ? wd.atFront : 0],
        [wedgeWalls.backW, wedgeWalls.madeB, s > 0 ? wd.atBack : 0, s > 0 ? 0 : wd.atBack],
        [wedgeWalls.endW, wedgeWalls.madeE, wd.atFront, wd.atBack],
      ];
      for (const [f, made, a0, a1] of sides) {
        if (f.L < 0.3) continue;
        // (At a corner whose angle within is `a`, a lining `deep` from the face stops `deep / tan(a)` short of it: past it where the angle is wide.)
        const s0 = a0 ? deep / Math.tan(a0) : 0, s1 = f.L - (a1 ? deep / Math.tan(a1) : 0);
        const gaps: Gap[] = (made?.rows[storey] ?? []).map((g) => ({ s0: g.s0, s1: g.s1, y0: g.y0, y1: g.y1 }));
        pierced(f, 'plaster', s0, s1, fy, clear, skin, deep, colour, gaps);
        pierced(f, 'plaster', s0, s1, fy, fy + 0.16, deep, deep + 0.02, WHITE, gaps);
        pierced(f, 'plaster', s0, s1, fy + 0.9, fy + 0.96, deep, deep + 0.025, WHITE, gaps);
        on(f, 'plaster', s0, s1, clear - 0.14, clear, deep, deep + 0.1, WHITE);
        for (const g of gaps) if (g.y0 > fy + 0.3) on(f, 'wood', g.s0 - 0.06, g.s1 + 0.06, g.y0 - 0.04, g.y0 + 0.02, skin, deep + 0.06, sill, true);
      }
      // The walls across, each with a door in its middle, framed.
      for (const u of wd.crosses) {
        const c0 = deep, c1 = D - deep, mid = D / 2;
        box('plaster', u - 0.15, u + 0.15, fy, clear, c0, mid - 0.55, colour);
        box('plaster', u - 0.15, u + 0.15, fy, clear, mid + 0.55, c1, colour);
        box('plaster', u - 0.15, u + 0.15, doorTop, clear, mid - 0.55, mid + 0.55, colour);
        box('plaster', u - 0.17, u + 0.17, fy, fy + 0.16, c0, mid - 0.55, WHITE);
        box('plaster', u - 0.17, u + 0.17, fy, fy + 0.16, mid + 0.55, c1, WHITE);
      }
    }
  }

}

/**
 * A classical house of wood, as the small towns of the north built them in the early nineteenth century: one storey, sometimes two,
 * on a basement of rough granite with low windows in it, its floor a metre or more over the street; walls of weatherboards painted
 * ochre, red, yellow, green or grey, with broad white boards at the corners carrying a little cap, a white band at each floor and a
 * frieze under the eaves; tall windows of six panes in white surrounds, each with a cornice over it and on the front a panel under
 * it; the door in an end wall near the front, up stone steps under a little roof on brackets; and a low hipped roof of dark sheet
 * metal laid in seams, with plastered chimneys and half-round dormers lighting the attic. With a wing it is an L, as at a street
 * corner, the wing finished as the main block is. Its door is shut: it is seen, and not gone into.
 */
function woodenHouse(b: Building, base: number, mesh: (material: string) => MeshBuilder, rng: Rng, stone: Colour, tops?: Vector3[]): void {
  const k = buildingTools(b, base, mesh), { at, box, on, stick, pierced, glazed, poly, wedge } = k;
  const W = b.w, D = b.d, Bm = b.basement ?? 1.1, N = b.storeys, paint = b.colour, T = 0.22;
  const floorY = (s: number) => Bm + b.heights.slice(0, s).reduce((sum, h) => sum + h, 0), top = floorY(N);
  const white: Colour = [0.9, 0.89, 0.85], backing = shade(paint, 0.35), roofTone: Colour = rng.pick([[0.11, 0.11, 0.12], [0.19, 0.2, 0.21], [0.27, 0.29, 0.3], [0.3, 0.19, 0.15]] as Colour[]);
  const leaf: Colour = rng.pick([[0.42, 0.1, 0.08], [0.12, 0.2, 0.15], [0.35, 0.25, 0.15], [0.86, 0.85, 0.8]] as Colour[]);
  const granite = (q: number): Colour => { const g = 0.52 + 0.22 * q; return [g * (0.9 + 0.25 * stone[0]) * 0.92, g * (0.86 + 0.2 * stone[1]) * 0.9, g * (0.86 + 0.2 * stone[2]) * 0.88]; };
  // The faces: the main block's four, and each wing's three (its outer side, its inner side and its far end).
  const [front, right, back, left] = k.walls(0);
  const wings = (b.wings ?? []).map((g) => {
    const s = g.side, L = g.length;
    return { g, faces: [
      { f: { L, P: (a: number, y: number, t: number) => at(s * (W / 2 - t), y, s > 0 ? D + a : D + L - a) } as Face, kind: 'side' },
      { f: { L, P: (a: number, y: number, t: number) => at(s * (W / 2 - g.width + t), y, s > 0 ? D + L - a : D + a) } as Face, kind: 'yard' },
      { f: { L: g.width, P: (a: number, y: number, t: number) => at(s * (W / 2 - a), y, D + L - t) } as Face, kind: 'yard' },
    ] };
  });
  // (The end wall a wing stands against is hidden where the wing is: no windows in it there.)
  const winged = (side: number) => (b.wings ?? []).find((g) => g.side === side);
  const faces: { f: Face; kind: 'front' | 'side' | 'yard'; door?: number; skip?: [number, number] }[] = [
    { f: front, kind: 'front' },
    { f: right, kind: 'side', door: b.endDoor === 1 ? 1.5 : undefined },
    { f: back, kind: 'yard', skip: winged(1) || winged(-1) ? [winged(1) ? 0 : W - (winged(-1)!.width), winged(1) ? winged(1)!.width : W] : undefined },
    { f: left, kind: 'side', door: b.endDoor === -1 ? D - 1.5 : undefined },
    ...wings.flatMap((w) => w.faces.map((q) => ({ f: q.f, kind: q.kind as 'side' | 'yard' }))),
  ];
  for (const { f, kind, door, skip } of faces) {
    const n = kind === 'front' ? b.bays : Math.max(1, Math.round((f.L - 1.4) / 2.3)), margin = kind === 'front' ? 1.0 : 0.9, pitch = (f.L - 2 * margin) / n;
    const centres = Array.from({ length: n }, (_, i) => margin + (i + 0.5) * pitch).filter((c) => !skip || c < skip[0] - 0.8 || c > skip[1] + 0.8);
    const openings: Gap[][] = Array.from({ length: N }, () => []), cellar: Gap[] = [];
    let doorGap: Gap | null = null;
    if (door !== undefined) doorGap = { s0: door - 0.62, s1: door + 0.62, y0: Bm - 0.01, y1: Bm + 2.35 };
    // (None where something stands close before the wall, under its top: it would look into a wall.)
    const shut = (c: number, y: number) => { const p = k.local(f.P(c, 0, 0)), q = k.local(f.P(c, 0, -1)); return blinded(b, p.u, p.v, q.u - p.u, q.v - p.v, y, 0.55); };
    for (const c of centres) {
      if (doorGap && Math.abs(c - door!) < 1.5) continue;
      for (let st = 0; st < N; st++) { const fy = floorY(st), h = b.heights[st], y0 = fy + (st ? 0.62 : 0.72); if (!shut(c, y0)) openings[st].push({ s0: c - 0.55, s1: c + 0.55, y0, y1: fy + h - (st ? 0.62 : 0.55) }); }
      if (!shut(c, Bm - 0.62)) cellar.push({ s0: c - 0.36, s1: c + 0.36, y0: Bm - 0.62, y1: Bm - 0.18 });
    }
    if (doorGap) openings[0].push(doorGap);
    const all = openings.flat();
    // The basement: rough granite in courses, each stone its own size and tone and standing a little proud or sunk; the joints dark behind.
    pierced(f, 'stone', 0, f.L, -0.45, Bm, 0.03, T + 0.06, shade(granite(0.3), 0.4), cellar);
    for (let y = -0.45, row = 0; y < Bm - 0.01; row++) {
      const hgt = Math.min(Bm - y, rng.range(0.26, 0.42));
      for (let a = -0.08 - (row % 2) * rng.range(0.1, 0.4); a < f.L + 0.08;) {
        const len = rng.range(0.35, 0.95), s0 = Math.max(-0.08, a), s1 = Math.min(f.L + 0.08, a + len);
        if (s1 - s0 > 0.04) pierced(f, 'stone', s0 + 0.012, s1 - 0.012, y + 0.012, y + hgt - 0.012, -0.08 + rng.range(-0.025, 0.02), 0.06, granite(rng.next()), cellar);
        a += len;
      }
      y += hgt;
    }
    for (const g of cellar) { glazed(f, g, 2, 1, [0.25, 0.22, 0.2], 0.1); on(f, 'stone', g.s0 - 0.08, g.s1 + 0.08, g.y0 - 0.08, g.y0, -0.12, 0.1, granite(0.6)); }
    // The water table over it, then the wall: a dark backing, and over it the weatherboards, each laid a little proud of the joint over it.
    on(f, 'wood', -0.1, f.L + 0.1, Bm - 0.06, Bm + 0.12, -0.11, 0.04, white, true);
    // (The backing storey by storey: two storeys' windows stand one over the other, and one stretch of wall cut for both covered both.)
    for (let st = 0; st < N; st++) pierced(f, 'wood', 0, f.L, st ? floorY(st) : Bm + 0.12, st === N - 1 ? top : floorY(st + 1), 0, T, backing, openings[st]);
    for (let y = Bm + 0.12; y < top - 0.42; y += 0.155) pierced(f, 'wood', 0.2, f.L - 0.2, y, Math.min(top - 0.42, y + 0.142), -0.03, 0, shade(paint, 0.93 + 0.12 * Math.sin(y * 37.7 + f.L)), all);
    // Corner boards with their caps; a band at each floor; the frieze under the eaves.
    for (const [a, e] of [[-0.06, 0.32], [f.L - 0.32, f.L + 0.06]]) { on(f, 'wood', a, e, Bm + 0.1, top - 0.4, -0.07, 0.02, white, true); on(f, 'wood', a - 0.04, e + 0.04, top - 0.55, top - 0.4, -0.1, 0.02, white); }
    for (let st = 1; st < N; st++) on(f, 'wood', 0.3, f.L - 0.3, floorY(st) - 0.1, floorY(st) + 0.12, -0.065, 0.02, white, true);
    on(f, 'wood', -0.04, f.L + 0.04, top - 0.42, top, -0.05, 0.02, white, true);
    // The windows: sashes of six panes, a white surround, a sill, a cornice over each; and on the front a panel under those of the ground floor.
    openings.forEach((row, st) => row.forEach((g) => {
      if (g === doorGap) return;
      glazed(f, g, 2, 3, white, 0.08);
      for (const [a, e] of [[g.s0 - 0.13, g.s0], [g.s1, g.s1 + 0.13]]) on(f, 'wood', a, e, g.y0 - 0.05, g.y1 + 0.05, -0.06, 0.02, white, true);
      on(f, 'wood', g.s0 - 0.2, g.s1 + 0.2, g.y0 - 0.1, g.y0, -0.12, 0.04, white, true);
      on(f, 'wood', g.s0 - 0.17, g.s1 + 0.17, g.y1 + 0.05, g.y1 + 0.22, -0.07, 0.02, white, true);
      on(f, 'wood', g.s0 - 0.24, g.s1 + 0.24, g.y1 + 0.22, g.y1 + 0.3, -0.15, 0.02, white, true);
      if (kind === 'front' && st === 0 && g.y0 - 0.85 > Bm + 0.2) {
        const p0 = g.y0 - 0.72, p1 = g.y0 - 0.2;
        for (const [a, e, y0, y1] of [[g.s0 - 0.05, g.s1 + 0.05, p0, p0 + 0.06], [g.s0 - 0.05, g.s1 + 0.05, p1 - 0.06, p1], [g.s0 - 0.05, g.s0 + 0.01, p0, p1], [g.s1 - 0.01, g.s1 + 0.05, p0, p1]]) on(f, 'wood', a, e, y0, y1, -0.06, 0.01, white);
      }
    }));
    if (doorGap) {
      const g = doorGap, mid = (g.s0 + g.s1) / 2;
      // Two leaves, shut, panelled; a light over them; the surround; a little roof on two brackets; and steps of stone up from the street.
      for (const [a, e] of [[g.s0 + 0.02, mid - 0.01], [mid + 0.01, g.s1 - 0.02]]) {
        on(f, 'wood', a, e, g.y0 + 0.02, g.y1 - 0.42, 0.04, 0.09, leaf, true);
        for (const [y0, y1] of [[g.y0 + 0.2, g.y0 + 0.85], [g.y0 + 1.05, g.y1 - 0.62]]) on(f, 'wood', a + 0.08, e - 0.08, y0, y1, 0.0, 0.04, shade(leaf, 1.15), true);
      }
      glazed(f, { s0: g.s0 + 0.04, s1: g.s1 - 0.04, y0: g.y1 - 0.38, y1: g.y1 - 0.04 }, 3, 1, white, 0.06);
      on(f, 'wood', g.s0, g.s1, g.y1 - 0.44, g.y1 - 0.38, 0.0, 0.1, white);
      for (const [a, e] of [[g.s0 - 0.16, g.s0], [g.s1, g.s1 + 0.16]]) on(f, 'wood', a, e, g.y0, g.y1 + 0.08, -0.07, 0.02, white, true);
      const r0 = g.y1 + 0.35, out = 1.1;
      wedge(f.P(g.s0 - 0.45, r0, -out), f.P(g.s1 + 0.45, r0, -out), f.P(mid, r0 + 0.45, -out), f.P(0, 0, 0.02).sub(f.P(0, 0, -out)), ['metal', roofTone], ['wood', white], ['wood', white]);
      for (const a of [g.s0 - 0.3, g.s1 + 0.3]) stick(f.P(a, g.y1 - 0.2, 0), f.P(a, r0, -out + 0.15), 0.08, 0.08, white);
      const steps = Math.max(2, Math.ceil(Bm / 0.18)), rise = Bm / steps;
      for (let i = 0; i < steps; i++) on(f, 'stone', g.s0 - 0.35, g.s1 + 0.35, -0.3, Bm - i * rise, -0.35 - i * 0.32, 0.02, granite(0.55 + 0.1 * (i % 2)));
    }
  }
  // The eaves: a soffit standing out all round, and its fascia.
  const y = top, e = 0.48;
  box('wood', -W / 2 - e, W / 2 + e, y, y + 0.06, -e, D + e, white);
  box('wood', -W / 2 - e, W / 2 + e, y + 0.06, y + 0.2, -e, -e + 0.04, white);
  box('wood', -W / 2 - e, W / 2 + e, y + 0.06, y + 0.2, D + e - 0.04, D + e, white);
  for (const g of b.wings ?? []) { const ua = g.side > 0 ? W / 2 - g.width : -W / 2, ub = g.side > 0 ? W / 2 : -W / 2 + g.width; box('wood', ua - e, ub + e, y, y + 0.06, D, D + g.length + e, white); }
  // The roof: low and hipped, of seamed sheet metal; a wing's runs in under the main block's.
  const slope = Math.tan((24 * Math.PI) / 180), ry = y + 0.2, up = new Vector3(0, 1, 0);
  const outward = (du: number, dv: number) => at(du, 0, dv).sub(at(0, 0, 0)).add(up);
  const hip = (u0: number, u1: number, v0: number, v1: number, nearOpen: boolean) => {
    const half = Math.min(u1 - u0, v1 - v0) / 2, rise = half * slope, alongU = u1 - u0 >= v1 - v0, mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
    const r0 = alongU ? at(u0 + half, ry + rise, mv) : at(mu, ry + rise, nearOpen ? v0 : v0 + half), r1 = alongU ? at(u1 - half, ry + rise, mv) : at(mu, ry + rise, v1 - half);
    const a = at(u0, ry, v0), c = at(u1, ry, v0), g = at(u1, ry, v1), h = at(u0, ry, v1);
    if (alongU) {
      poly('metal', [a, c, r1, r0], roofTone, outward(0, -1)); poly('metal', [g, h, r0, r1], roofTone, outward(0, 1));
      poly('metal', [c, g, r1], roofTone, outward(1, 0)); poly('metal', [h, a, r0], roofTone, outward(-1, 0));
    } else {
      poly('metal', [h, a, r0, r1], roofTone, outward(-1, 0)); poly('metal', [c, g, r1, r0], roofTone, outward(1, 0));
      poly('metal', [g, h, r1], roofTone, outward(0, 1)); if (!nearOpen) poly('metal', [a, c, r0], roofTone, outward(0, -1));
    }
    poly('metal', [a, c, g, h], shade(roofTone, 0.6), new Vector3(0, -1, 0));
    // (Seams up the slopes, a hand proud.)
    if (alongU) for (let u = u0 + 0.35; u < u1 - 0.2; u += 0.6) {
      const reach = Math.min(half, u - u0, u1 - u);
      for (const side of [-1, 1]) stick(at(u, ry + 0.02, side < 0 ? v0 : v1), at(u, ry + reach * slope + 0.02, side < 0 ? v0 + reach : v1 - reach), 0.03, 0.045, shade(roofTone, 0.8), 'metal');
    }
    return rise;
  };
  const mainRise = hip(-W / 2 - e, W / 2 + e, -e, D + e, false);
  for (const g of b.wings ?? []) { const ua = g.side > 0 ? W / 2 - g.width : -W / 2, ub = g.side > 0 ? W / 2 : -W / 2 + g.width; hip(ua - e, ub + e, D / 2, D + g.length + e, true); }
  // Chimneys along the ridge, plastered and dark, each with a cap.
  const stacks = W > 14 ? 3 : 2, cTone: Colour = rng.pick([[0.16, 0.16, 0.17], [0.55, 0.52, 0.48], [0.4, 0.2, 0.15]] as Colour[]);
  for (let n = 0; n < stacks; n++) {
    const u = (-0.5 + (n + 0.5) / stacks) * Math.max(1.5, W - D), v = D / 2 + (n % 2 ? 0.8 : -0.8);
    box('plaster', u - 0.36, u + 0.36, ry + mainRise * 0.5, ry + mainRise + 1.0, v - 0.3, v + 0.3, cTone);
    box('plaster', u - 0.44, u + 0.44, ry + mainRise + 1.0, ry + mainRise + 1.12, v - 0.38, v + 0.38, shade(cTone, 0.8));
    tops?.push(at(u, ry + mainRise + 1.12, v));
  }
  // Half-round dormers in the front slope, lighting the attic: a fan of glass in a white frame, under a little vault of the roof's metal.
  for (let n = 0; n < (b.dormers ?? 0); n++) {
    const u = (-0.5 + (n + 0.5) / (b.dormers ?? 1)) * (W * 0.6), v = 0.35, R = 0.62, sill = ry + (v + e) * slope + 0.05, seg = 9;
    const arc = (i: number, r: number, dv = 0) => { const a = (i / seg) * Math.PI; return at(u + Math.cos(a) * r, sill + Math.sin(a) * r, v + dv); };
    const depth = (R + 0.1) / slope + 0.3;
    for (let i = 0; i < seg; i++) {
      poly('glass', [at(u, sill, v + 0.06), arc(i, R - 0.08, 0.06), arc(i + 1, R - 0.08, 0.06)], [0.04, 0.05, 0.07], outward(0, -1));
      stick(arc(i, R - 0.04), arc(i + 1, R - 0.04), 0.08, 0.1, white);
      k.slope([arc(i + 1, R + 0.05, -0.05), arc(i, R + 0.05, -0.05), arc(i, R + 0.05, depth), arc(i + 1, R + 0.05, depth)], ['metal', roofTone], shade(roofTone, 0.6), 0.05);
    }
    stick(at(u - R, sill, v), at(u + R, sill, v), 0.08, 0.1, white);
    for (const a of [Math.PI / 3, (2 * Math.PI) / 3]) stick(at(u, sill, v + 0.04), at(u + Math.cos(a) * (R - 0.08), sill + Math.sin(a) * (R - 0.08), v + 0.04), 0.03, 0.03, white);
    // (Its cheeks below the vault, down to the roof.)
    for (const side of [-1, 1]) poly('metal', [at(u + side * (R + 0.05), sill - 0.05, v - 0.05), at(u + side * (R + 0.05), sill, v + depth), at(u + side * (R + 0.05), sill - 0.3, v + depth)], roofTone, outward(side, 0));
  }
  // Downpipes at the front corners.
  for (const side of [-1, 1]) stick(at(side * (W / 2 + 0.12), 0.25, -0.12), at(side * (W / 2 + 0.12), y + 0.1, -0.12), 0.09, 0.09, shade(roofTone, 1.2), 'metal');
}

/** Plain solids for other builders to use: a block between two corners, a squared length between two points, a sheet of roof. */
/**
 * A village's church (style `chapel`): small, of stone, as the villages under castles have them. A nave under a steep roof of tiles, its
 * gables of stone; a choir beyond one end of it, narrower and lower, under a roof of its own, ending where it has one in a half-round
 * apse under a half cone; a square tower beyond the other end, rising over the ridge with paired openings for its bells near its top,
 * under a pyramid, a tall spire of eight sides or a ridged roof between two gables, with an iron cross over it; tall narrow windows with
 * pointed heads along the nave and in the choir; and the door in the front, under a pointed arch in a frame of dressed stone. Its walls
 * are of the castle's coursed stone (`castle`), so that it is of the castle's building; its dressings of the country's stone.
 */
function chapelBuilding(b: Building, base: number, mesh: (material: string) => MeshBuilder, stone: Colour): void {
  const k = buildingTools(b, base, mesh), { at, box, poly, slope } = k;
  const c = b.chapel!, W = b.w, D = b.d, H = b.heights[0], parts = chapelParts(b), { tower, choir, cw } = parts;
  const wall: Colour = [0.92, 0.9, 0.86], dress = shade(stone, 1.05), dark: Colour = [0.03, 0.03, 0.035], iron: Colour = [0.05, 0.05, 0.055];
  const roofTile: [string, Colour] = ['tile', [1.12, 1.04, 0.98]], slate: [string, Colour] = ['tile', [0.42, 0.44, 0.5]], under: Colour = shade(OAK, 0.8);
  const out = (du: number, dv: number) => at(du, 0, dv).sub(at(0, 0, 0));
  // A plinth a little proud of the walls, down into the ground.
  for (const r of parts.rects) box('stone', r.u0 - 0.08, r.u1 + 0.08, -0.6, 0.35, r.v0 - 0.08, r.v1 + 0.08, shade(stone, 0.8));
  // The nave: its walls, a cornice, its roof and its gables.
  box('castle', -W / 2, W / 2, 0, H, 0, D, wall);
  box('stone', -W / 2 - 0.12, W / 2 + 0.12, H - 0.18, H, -0.12, D + 0.12, dress);
  const pitch = Math.tan((55 * Math.PI) / 180), eave = 0.4, rise = (D / 2 + eave) * pitch, top = H - eave * pitch + rise;
  for (const [v0, v1] of [[-eave, D / 2], [D + eave, D / 2]]) slope([at(-W / 2 - 0.3, H - eave * pitch, v0), at(W / 2 + 0.3, H - eave * pitch, v0), at(W / 2 + 0.3, top, v1), at(-W / 2 - 0.3, top, v1)], roofTile, under);
  box('tile', -W / 2 - 0.3, W / 2 + 0.3, top - 0.05, top + 0.08, D / 2 - 0.12, D / 2 + 0.12, [0.95, 0.85, 0.8]);
  for (const e of [-1, 1]) poly('castle', [at((e * W) / 2, H, 0), at((e * W) / 2, H, D), at((e * W) / 2, top - 0.02, D / 2)], wall, out(e, 0));
  // The choir, lower and narrower; and its apse, a half of twelve sides, under a half cone.
  const ch = H - 1.2, cv0 = D / 2 - cw / 2, cv1 = D / 2 + cw / 2, crise = (cw / 2 + eave) * pitch, ctop = ch - eave * pitch + crise, away = c.end < 0 ? 1 : -1;
  box('castle', choir.u0, choir.u1, 0, ch, cv0, cv1, wall);
  box('stone', choir.u0 - (away < 0 ? 0.12 : 0), choir.u1 + (away > 0 ? 0.12 : 0), ch - 0.16, ch, cv0 - 0.1, cv1 + 0.1, dress);
  const cu0 = away > 0 ? choir.u0 : choir.u0 - (parts.apse ? 0 : 0.3), cu1 = away > 0 ? choir.u1 + (parts.apse ? 0 : 0.3) : choir.u1;
  for (const [v0, v1] of [[cv0 - eave, D / 2], [cv1 + eave, D / 2]]) slope([at(cu0, ch - eave * pitch, v0), at(cu1, ch - eave * pitch, v0), at(cu1, ctop, v1), at(cu0, ctop, v1)], roofTile, under);
  const endU = away > 0 ? choir.u1 : choir.u0;
  if (parts.apse) {
    const R = cw / 2, n = 12, ring = (r: number, y: number) => Array.from({ length: n / 2 + 1 }, (_, i) => { const a = -Math.PI / 2 + (Math.PI * i) / (n / 2); return at(endU + away * Math.cos(a) * r, y, D / 2 + Math.sin(a) * r); });
    const foot = ring(R, 0), head = ring(R, ch), eaveRing = ring(R + eave, ch - eave * pitch), apex = at(endU, ctop, D / 2);
    for (let i = 0; i < n / 2; i++) {
      const m = (Math.PI * (i + 0.5)) / (n / 2) - Math.PI / 2;
      poly('castle', [foot[i], foot[i + 1], head[i + 1], head[i]], wall, out(away * Math.cos(m), Math.sin(m)));
      poly('tile', [eaveRing[i], eaveRing[i + 1], apex], roofTile[1], out(away * Math.cos(m), Math.sin(m)).add(at(0, 1, 0).sub(at(0, 0, 0))), false, 0.62);
      poly('wood', [eaveRing[i + 1], eaveRing[i], at(endU, ch - eave * pitch, D / 2)], under, at(0, -1, 0).sub(at(0, 0, 0)));
    }
    // (Its window, in the middle of the round.)
    const mid = at(endU + away * (R + 0.02), 0, D / 2);
    lancet(mid.x, mid.z, out(away, 0), 1.8, ch - 1.3, 0.5);
  } else {
    poly('castle', [at(endU, ch, cv0), at(endU, ch, cv1), at(endU, ctop - 0.02, D / 2)], wall, out(away, 0));
    const mid = at(endU + away * 0.02, 0, D / 2);
    lancet(mid.x, mid.z, out(away, 0), 1.8, ch - 1.2, 0.55);
  }
  // A window either side of the choir.
  for (const v of [cv0 - 0.02, cv1 + 0.02]) { const p = at((choir.u0 + choir.u1) / 2, 0, v); lancet(p.x, p.z, out(0, v < D / 2 ? -1 : 1), 1.9, ch - 1.3, 0.45); }
  // The tower.
  const TH = c.height, tv0 = tower.v0, tv1 = tower.v1, tu0 = tower.u0, tu1 = tower.u1, T = c.tower;
  box('castle', tu0, tu1, 0, TH, tv0, tv1, wall);
  for (const y of [H + 0.4, TH - 0.25]) box('stone', tu0 - 0.1, tu1 + 0.1, y - 0.18, y, tv0 - 0.1, tv1 + 0.1, dress);
  // Its corners dressed, stone by stone, long and short in turn.
  for (const [cu, cvv] of [[tu0, tv0], [tu1, tv0], [tu0, tv1], [tu1, tv1]]) for (let y = 0.35, n = 0; y < TH - 0.6; y += 0.42, n++) {
    const lu = n % 2 ? 0.55 : 0.3, lv = n % 2 ? 0.3 : 0.55, su = cu === tu0 ? 1 : -1, sv = cvv === tv0 ? 1 : -1;
    box('stone', Math.min(cu - su * 0.03, cu + su * lu), Math.max(cu - su * 0.03, cu + su * lu), y, y + 0.38, Math.min(cvv - sv * 0.03, cvv + sv * lv), Math.max(cvv - sv * 0.03, cvv + sv * lv), shade(dress, 0.95 + 0.1 * (n % 3) / 2));
  }
  // The bells' openings: two to a face, near the top; and a slit or two lower down.
  const tm = (tu0 + tu1) / 2, faces: [Vector3, Vector3][] = [[at(tm, 0, tv0 - 0.02), out(0, -1)], [at(tm, 0, tv1 + 0.02), out(0, 1)], [at(c.end < 0 ? tu0 - 0.02 : tu1 + 0.02, 0, D / 2), out(c.end < 0 ? -1 : 1, 0)]];
  for (const [p, o] of faces) {
    const side = new Vector3(-o.z, 0, o.x);
    for (const s of [-0.42, 0.42]) lancet(p.x + side.x * s * (T / 4.2), p.z + side.z * s * (T / 4.2), o, TH - 2.4, TH - 0.75, 0.32);
    lancet(p.x, p.z, o, H + 1.2, H + 2.2, 0.16);
  }
  // Its roof.
  const ov = 0.35, ty = TH, ex0 = tu0 - ov, ex1 = tu1 + ov, ez0 = tv0 - ov, ez1 = tv1 + ov, ap = at(tm, ty + c.spireHeight, D / 2);
  if (c.spire === 'saddle') {
    // (A ridged roof between two gables, its ridge along the nave.)
    const r2 = ty + c.spireHeight;
    for (const [v0, v1] of [[ez0, D / 2], [ez1, D / 2]]) slope([at(ex0, ty, v0), at(ex1, ty, v0), at(ex1, r2, v1), at(ex0, r2, v1)], slate, under);
    for (const u of [tu0, tu1]) poly('castle', [at(u, ty, tv0), at(u, ty, tv1), at(u, r2 - 0.05, D / 2)], wall, out(u === tu0 ? -1 : 1, 0));
  } else {
    const sides = c.spire === 'needle' ? 8 : 4, R = (T / 2 + ov) * (sides === 8 ? 1.0 : Math.SQRT2), ring = Array.from({ length: sides + 1 }, (_, i) => { const a = (Math.PI * 2 * i) / sides + (sides === 4 ? Math.PI / 4 : Math.PI / 8); return at(tm + Math.cos(a) * R, ty, D / 2 + Math.sin(a) * R); });
    for (let i = 0; i < sides; i++) {
      const m = (Math.PI * 2 * (i + 0.5)) / sides + (sides === 4 ? Math.PI / 4 : Math.PI / 8);
      poly('tile', [ring[i], ring[i + 1], ap], slate[1], out(Math.cos(m), Math.sin(m)).add(at(0, 0.6, 0).sub(at(0, 0, 0))), false, 0.62);
      poly('wood', [ring[i + 1], ring[i], at(tm, ty, D / 2)], under, at(0, -1, 0).sub(at(0, 0, 0)));
    }
    if (sides === 8) for (let i = 0; i < 4; i++) {
      // (Where an eight-sided spire rises from a square tower, a little sloping roof at each corner of the tower.)
      const a = (Math.PI / 2) * i + Math.PI / 4, cx2 = tm + Math.cos(a) * (T / 2 + ov) * Math.SQRT2 * 0.98, cz2 = D / 2 + Math.sin(a) * (T / 2 + ov) * Math.SQRT2 * 0.98;
      const corner = at(cx2, ty, cz2), up = at((tm + cx2) / 2, ty + 1.1, (D / 2 + cz2) / 2), o = at(Math.cos(a), 1, Math.sin(a)).sub(at(0, 0, 0));
      poly('tile', [ring[2 * i], corner, up], slate[1], o, false, 0.62);
      poly('tile', [corner, ring[2 * i + 1], up], slate[1], o, false, 0.62);
    }
  }
  // An iron cross at the top.
  const crossY = c.spire === 'saddle' ? ty + c.spireHeight : ty + c.spireHeight - 0.15;
  box('metal', tm - 0.04, tm + 0.04, crossY, crossY + 1.4, D / 2 - 0.04, D / 2 + 0.04, iron);
  box('metal', tm - 0.04, tm + 0.04, crossY + 0.85, crossY + 0.95, D / 2 - 0.36, D / 2 + 0.36, iron);
  // The nave's windows along its front and its back, three or four a side, tall and narrow, with pointed heads; none where the door is.
  const doorU = (c.end * W) / 4, n = W > 12.5 ? 4 : 3;
  for (const [v, o] of [[-0.02, out(0, -1)], [D + 0.02, out(0, 1)]] as [number, Vector3][]) for (let i = 0; i < n; i++) {
    const u = -W / 2 + ((i + 0.5) * W) / n;
    if (v < 0 && Math.abs(u - doorU) < 1.3) continue;
    const p = at(u, 0, v);
    lancet(p.x, p.z, o, 2.4, H - 1.0, 0.36);
  }
  // The door: boards in a pointed arch, under a frame of dressed stone a step out from the wall, up a step.
  {
    const p = at(doorU, 0, -0.02), o = out(0, -1), side = new Vector3(-o.z, 0, o.x), y0 = 0.35, y1 = y0 + 2.3, half = 0.65;
    const P = (s: number, y: number, t: number) => new Vector3(p.x + side.x * s + o.x * t, base + y, p.z + side.z * s + o.z * t);
    const panel = (s0: number, s1: number, lo: number, hi: number, t: number, colour: Colour, material: string) => poly(material, [P(s0, lo, t), P(s1, lo, t), P(s1, hi, t), P(s0, hi, t)], colour, o);
    panel(-half, half, y0, y1, 0.01, shade(OAK, 0.75), 'wood');
    poly('wood', [P(-half, y1, 0.01), P(half, y1, 0.01), P(0, y1 + half * 1.3, 0.01)], shade(OAK, 0.75), o);
    for (const y of [y0 + 0.5, y1 - 0.5]) panel(-half + 0.05, half - 0.05, y, y + 0.07, 0.03, iron, 'metal');
    for (const [a, e] of [[-half - 0.28, -half], [half, half + 0.28]]) box('stone', doorU + a, doorU + e, 0.3, y1 + 0.2, -0.22, 0.01, dress);
    box('stone', doorU - half - 0.45, doorU + half + 0.45, y1 + 0.2, y1 + 0.2 + half * 1.4, -0.22, 0.01, dress);
    box('stone', doorU - half - 0.4, doorU + half + 0.4, 0, 0.32, -0.9, 0.01, shade(stone, 0.9));
  }
  /** A tall window with a pointed head, its glass dark, set into a wall at (`x`, `z`) facing `o`, from `y0` to the head's spring `y1`, half `half` broad; its sill of stone. */
  function lancet(x: number, z: number, o: Vector3, y0: number, y1: number, half: number): void {
    const d = o.clone().setY(0).normalize(), side = new Vector3(-d.z, 0, d.x);
    const P = (s: number, y: number, t: number) => new Vector3(x + side.x * s + d.x * t, base + y, z + side.z * s + d.z * t);
    poly('metal', [P(-half, y0, 0.01), P(half, y0, 0.01), P(half, y1, 0.01), P(-half, y1, 0.01)], dark, d);
    poly('metal', [P(-half, y1, 0.01), P(half, y1, 0.01), P(0, y1 + half * 1.5, 0.01)], dark, d);
    // (A surround of dressed stone, a hand wide, standing a little out from the wall.)
    for (const s of [-half - 0.12, half]) poly('stone', [P(s, y0, 0.04), P(s + 0.12, y0, 0.04), P(s + 0.12, y1, 0.04), P(s, y1, 0.04)], dress, d);
    poly('stone', [P(-half - 0.2, y0 - 0.12, 0.06), P(half + 0.2, y0 - 0.12, 0.06), P(half + 0.2, y0, 0.06), P(-half - 0.2, y0, 0.06)], dress, d);
  }
}

/**
 * A shed of boards, as stand at the back of a village's yards: on a low footing of stone, walls of upright boards with battens over
 * their joints, a roof of a single slope falling to its front, where its door is.
 */
function shedBuilding(b: Building, base: number, mesh: (material: string) => MeshBuilder, stone: Colour): void {
  const { at, box, wedge, slope } = buildingTools(b, base, mesh);
  const W = b.w, D = b.d, H = b.heights[0], back = H + 0.7, boards = b.colour, dark = shade(boards, 0.75);
  box('stone', -W / 2 - 0.06, W / 2 + 0.06, -0.5, 0.18, -0.06, D + 0.06, shade(stone, 0.8));
  box('wood', -W / 2, W / 2, 0.18, H, 0, D, boards, true);
  // (The walls rise towards the back, under the slope.)
  wedge(at(-W / 2, H, 0), at(-W / 2, H, D), at(-W / 2, back, D), at(W / 2, 0, 0).sub(at(-W / 2, 0, 0)), ['wood', boards], ['wood', boards]);
  for (let u = -W / 2 + 0.3; u < W / 2 - 0.1; u += 0.55) {
    box('wood', u - 0.035, u + 0.035, 0.18, H - 0.02, -0.03, 0, dark, true);
    box('wood', u - 0.035, u + 0.035, 0.18, back - 0.05, D, D + 0.03, dark, true);
  }
  slope([at(-W / 2 - 0.25, H - 0.08, -0.4), at(W / 2 + 0.25, H - 0.08, -0.4), at(W / 2 + 0.25, back + 0.12, D + 0.3), at(-W / 2 - 0.25, back + 0.12, D + 0.3)], ['tile', [1.0, 0.92, 0.88]], shade(OAK, 0.8), 0.12);
  // The door, of boards on two ledges, in the middle of the front.
  const half = Math.min(0.6, W / 2 - 0.4);
  box('wood', -half, half, 0.2, Math.min(2.0, H - 0.15), -0.06, 0, shade(boards, 0.85), true);
  for (const y of [0.55, Math.min(1.65, H - 0.5)]) box('wood', -half + 0.04, half - 0.04, y, y + 0.1, -0.09, -0.06, dark, true);
}

export function solids(mesh: (material: string) => MeshBuilder) {
  const t = buildingTools({ x: 0, z: 0, w: 0, d: 0, faces: 'w' } as Building, 0, mesh);
  return { block: t.block, stick: t.stick, slope: t.slope };
}

/** Builds one building where the site document says it stands, on ground at the height `base`. `stone` is the tint of the country's stone. */
/** Builds a building; `tops`, if given, is told where the top of each of its chimneys is, for smoke to rise from. */
export function buildBuilding(b: Building, base: number, mesh: (material: string) => MeshBuilder, rng: Rng, stone: Colour, first: boolean, tops?: Vector3[]): void {
  // (Brick buildings and canal houses are shut, and seen only from outside: nothing in them is indoors.)
  if (b.style === 'brick') { buildBrick(b, base, mesh, rng, stone); return; }
  if (b.style === 'canal') { buildCanal(b, base, mesh, rng, stone, tops); return; }
  // (A village's church and its sheds are shut, and seen only from outside.)
  if (b.style === 'chapel') { chapelBuilding(b, base, mesh, stone); return; }
  if (b.style === 'shed') { shedBuilding(b, base, mesh, stone); return; }
  // (What is built from here on is noted, mesh by mesh, so that it can be told afterwards which of it is indoors.)
  const begun = new Map<MeshBuilder, number>();
  // (A building that can be entered has glass that can be seen through, both ways; and a room lit after dark glows in it without hiding the room.)
  const seen = (material: string) => (b.plan && material === 'glass' ? 'pane' : b.plan && material === 'window' ? 'paneLit' : material);
  const noting = (material: string) => { const m = mesh(seen(material)); if (!begun.has(m)) begun.set(m, m.vertexCount); return m; };
  if (b.style === 'timber') {
    timberHouse(b, base, noting, rng, stone, first, tops);
    // Indoors is whatever is within the walls of the storey it is on: each storey stands further out over the street than the one below.
    const turn = b.faces === 'w' ? 1 : -1, top = timberFloor(b, b.storeys);
    for (const [m, from] of begun) m.setOpenBy((x, y, z) => {
      const u = turn * (z - b.z), v = turn * (x - b.x) + b.d / 2, h = y - base;
      let storey = 0;
      while (storey < b.storeys - 1 && h > timberFloor(b, storey + 1) - 0.14) storey++;
      return Math.abs(u) < b.w / 2 - 0.24 && v > timberFront(b, storey) + 0.24 && v < b.d - 0.24 && h > 0.4 && h < top + 0.05 ? 0.32 : 1;
    }, from);
    return;
  }
  if (b.style === 'wooden') {
    woodenHouse(b, base, noting, rng, stone, tops);
    // (Shut: what is within its walls is indoors, and nobody sees it.)
    const turn = b.faces === 'w' ? 1 : -1, rects = footprintOf(b);
    for (const [m, from] of begun) m.setOpenBy((x, y, z) => {
      const u = turn * (z - b.z), v = turn * (x - b.x) + b.d / 2;
      return rects.some((r) => u > r.u0 + 0.24 && u < r.u1 - 0.24 && v > r.v0 + 0.24 && v < r.v1 - 0.24) && y > base + (b.basement ?? 1) && y < base + floorOf(b, b.storeys) + (b.basement ?? 1) ? 0.32 : 1;
    }, from);
    return;
  }
  imperialHouse(b, base, noting, rng, stone, tops);
  // Indoors, only a share of the sky is seen, through the windows: so a room is dimmer than the street, and the sun lies on its floor where it comes in.
  const turn = b.faces === 'w' ? 1 : -1, height = plinthOf(b) + b.heights.reduce((sum, h) => sum + h, 0), rects = footprintOf(b).map((r, i) => (i ? { ...r, v0: r.v0 - 0.5 } : r));
  for (const [m, from] of begun) m.setOpenBy((x, y, z) => {
    const u = turn * (z - b.z), v = turn * (x - b.x) + b.d / 2;
    return rects.some((r) => inPart(r, u, v) > 0.24) && y > base + 0.3 && y < base + height - 0.02 ? 0.32 : 1;
  }, from);
}
