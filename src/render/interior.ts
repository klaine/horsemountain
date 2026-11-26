import { Shell, steepFlights } from '../core/interior';
import { BuildingPlan } from '../core/site';
import { BrickKit, Face, Pt } from './brick';

/**
 * The insides of the houses of brick and of the canal houses, built from their plans (see
 * `src/core/interior.ts`): the walls between rooms, with their doorways cased in oak; the floors,
 * boards on beams that span from party wall to party wall and are seen from below, as in these
 * houses they were, with the well cut where the stair comes up; whitewash on the inside of the outer
 * walls, cut round every window; and the stair, straight steep flights one over another, the lowest
 * boxed in to the floor, those above open treads between strings, with a rail and balusters along the
 * open side that also keep anyone on a landing out of the well. Nothing is furnished.
 *
 * Timber is laid in the material `oak`, which each builder turns into the timber's own material:
 * a canal house draws what is called `wood` as paint.
 */

type Colour = [number, number, number];
const LIME: Colour = [0.86, 0.84, 0.78], OAK: Colour = [0.24, 0.16, 0.1], BOARDS: Colour = [0.36, 0.26, 0.16], FLAGS: Colour = [0.62, 0.6, 0.56];
type Rect = { u0: number; u1: number; v0: number; v1: number };

/** What of a figure lies on one side of a level line: `keep` -1 below `y`, 1 above. */
function clipY(ring: Pt[], y: number, keep: -1 | 1): Pt[] {
  const inside = (p: Pt) => (p[1] - y) * keep >= 0, out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], c = ring[(i + 1) % ring.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(c)) { const t = (y - a[1]) / (c[1] - a[1]); out.push([a[0] + (c[0] - a[0]) * t, y]); }
  }
  return out;
}
/** And on one side of an upright line. */
function clipS(ring: Pt[], s: number, keep: -1 | 1): Pt[] {
  return clipY(ring.map(([a, b]): Pt => [b, a]), s, keep).map(([a, b]): Pt => [b, a]);
}
/** A rectangle less a hole in it, as the rectangles left round the hole. */
const without = (r: Rect, h: Rect): Rect[] => [
  { u0: r.u0, u1: r.u1, v0: r.v0, v1: Math.min(r.v1, h.v0) },
  { u0: r.u0, u1: r.u1, v0: Math.max(r.v0, h.v1), v1: r.v1 },
  { u0: r.u0, u1: Math.min(r.u1, h.u0), v0: Math.max(r.v0, h.v0), v1: Math.min(r.v1, h.v1) },
  { u0: Math.max(r.u0, h.u1), u1: r.u1, v0: Math.max(r.v0, h.v0), v1: Math.min(r.v1, h.v1) },
].filter((q) => q.u1 - q.u0 > 0.01 && q.v1 - q.v0 > 0.01);

/**
 * Whitewash on the inside face of an outer wall: a sheet from `s0` to `s1` along it and from `y0` to `y1`, at depth `t` into the
 * wall from outside (its inside face), with `holes` (the wall's openings, in its own measures) cut through it where they reach.
 */
function lining(k: BrickKit, f: Face, s0: number, s1: number, y0: number, y1: number, t: number, holes: Pt[][]) {
  const cut: Pt[][] = [];
  for (const h of holes) {
    let ring = clipS(clipS(h, s0 + 0.012, 1), s1 - 0.012, -1);
    ring = clipY(clipY(ring, y0 + 0.012, 1), y1 - 0.012, -1);
    if (ring.length >= 3) cut.push(ring);
  }
  k.prism(f, [[s0, y0], [s1, y0], [s1, y1], [s0, y1]], cut, t, t + 0.025, 'plaster', LIME);
}

/**
 * Builds the inside of a house from its plan. `sh` is its shell (the inside faces of its walls and its floors); `front` and `back`
 * are the openings through its front and back walls, each in that wall's own measures, for the whitewash to be cut round; `ground`
 * is what the ground storey's floor is laid with.
 */
export function buildInterior(k: BrickKit, plan: BuildingPlan, sh: Shell, storeys: number, o: { W: number; front: Pt[][]; back: Pt[][]; ground: 'boards' | 'flags' }): void {
  const F = sh.floors, N = storeys, E = F[N], C = sh.cross, st = plan.stair, all: Rect = { u0: sh.u0, u1: sh.u1, v0: sh.v0, v1: sh.v1 };
  const flights = st && N > 1 ? steepFlights(F, st.v1 - st.v0) : [];
  const here = (s: number) => <T extends { storey?: number }>(q: T) => q.storey === undefined || q.storey === s;
  const [front, right, back, left] = k.walls(0);
  void right; void left;

  // ---- the ground storey's floor, solid down to the ground under it; and the whitewash on the outer walls, up to the top
  k.box(o.ground === 'flags' ? 'stone' : 'oak', sh.u0, sh.u1, -0.3, F[0], sh.v0, sh.v1, o.ground === 'flags' ? FLAGS : BOARDS, o.ground !== 'flags');
  lining(k, front, sh.u0 + o.W / 2, sh.u1 + o.W / 2, F[0], E, sh.front, o.front);
  lining(k, back, o.W / 2 - sh.u1, o.W / 2 - sh.u0, F[0], E, sh.wall, o.back);
  k.box('plaster', sh.u0, sh.u0 + 0.025, F[0], E, sh.v0, sh.v1, LIME);
  k.box('plaster', sh.u1 - 0.025, sh.u1, F[0], E, sh.v0, sh.v1, LIME);

  // ---- the floors over each storey, and the ceiling over the top one: boards on beams, the well cut where a flight comes up
  for (let s = 1; s <= N; s++) {
    const y = F[s], f = s < N && st ? flights[s - 1] : null, well: Rect | null = f && st ? { u0: st.u0, u1: st.u1, v0: st.v0, v1: st.v0 + f.length } : null;
    for (const r of well ? without(all, well) : [all]) k.box('oak', r.u0, r.u1, y - 0.04, y, r.v0, r.v1, BOARDS, true);
    // (Over the stair, from a stride before the foot of its flights to the head of the well, no beam: only the boards, so that whoever
    // stands on the lowest steps of a flight has their head clear of the floor's edge over them.)
    const clear: Rect | null = st ? { u0: st.u0, u1: st.u1, v0: st.v0 - 0.45, v1: well ? well.v1 : st.v0 } : null;
    for (let v = sh.v0 + 0.45; v < sh.v1 - 0.25; v += 0.95) {
      const cut = clear && v + 0.18 > clear.v0 && v < clear.v1;
      for (const [a, c] of cut ? [[sh.u0, clear!.u0], [clear!.u1, sh.u1]] : [[sh.u0, sh.u1]]) if (c - a > 0.05) k.box('oak', a, c, y - 0.28, y - 0.04, v, v + 0.18, OAK, true);
    }
    // (A trimmer along the open side, carrying the beams that are cut short; and one across the head of the well.)
    if (clear && st) {
      const u = st.wall < 0 ? clear.u1 : clear.u0 - 0.18;
      k.box('oak', u, u + 0.18, y - 0.3, y - 0.04, Math.max(sh.v0, clear.v0 - 0.4), Math.min(sh.v1, clear.v1 + 0.4), OAK, true);
      if (well) k.box('oak', well.u0, well.u1, y - 0.28, y - 0.04, well.v1, well.v1 + 0.16, OAK, true);
    }
  }

  // ---- the walls between rooms: whatever of a storey's floor no room covers, from its floor to the boards over it, cut where a doorway is
  for (let s = 0; s < N; s++) {
    const y0 = F[s], y1 = F[s + 1] - 0.04, rooms = plan.rooms.filter(here(s)), doors = plan.doors.filter(here(s)), tall = Math.min(2.1, y1 - y0 - 0.3);
    const lines = (xs: number[], lo: number, hi: number) => [...new Set(xs.map((x) => Math.round(Math.min(hi, Math.max(lo, x)) * 1000) / 1000))].sort((a, c) => a - c);
    const us = lines([sh.u0, sh.u1, ...rooms.flatMap((r) => [r.u0, r.u1]), ...doors.filter((d) => d.line === 'v').flatMap((d) => [d.c - d.w / 2, d.c + d.w / 2])], sh.u0, sh.u1);
    const vs = lines([sh.v0, sh.v1, ...rooms.flatMap((r) => [r.v0, r.v1]), ...doors.filter((d) => d.line === 'u').flatMap((d) => [d.c - d.w / 2, d.c + d.w / 2])], sh.v0, sh.v1);
    const doorAt = (u: number, v: number) => doors.find((d) => (d.line === 'u' ? Math.abs(u - d.at) < C / 2 + 0.05 && Math.abs(v - d.c) < d.w / 2 : Math.abs(v - d.at) < C / 2 + 0.05 && Math.abs(u - d.c) < d.w / 2));
    for (let j = 0; j + 1 < vs.length; j++) {
      const v0 = vs[j], v1 = vs[j + 1], cv = (v0 + v1) / 2;
      if (v1 - v0 < 0.03) continue;
      // (Along each row, the cells of wall run together into one block until a room, a doorway or the end breaks them.)
      let run: number | null = null;
      for (let i = 0; i + 1 < us.length; i++) {
        const u0 = us[i], u1 = us[i + 1], cu = (u0 + u1) / 2;
        const wall = u1 - u0 >= 0.03 && !rooms.some((r) => cu > r.u0 && cu < r.u1 && cv > r.v0 && cv < r.v1), d = wall ? doorAt(cu, cv) : undefined;
        if (wall && !d) { if (run === null) run = u0; }
        else {
          if (run !== null) { k.box('plaster', run, u0, y0, y1, v0, v1, LIME); run = null; }
          if (d) k.box('plaster', u0, u1, y0 + tall, y1, v0, v1, LIME);
        }
        if (i + 2 === us.length && run !== null) k.box('plaster', run, u1, y0, y1, v0, v1, LIME);
      }
    }
    // Doorways cased in oak, on both faces of the wall.
    for (const d of doors) {
      const half = C / 2 + 0.025, top = y0 + tall;
      const put = (a: number, c: number, lo: number, hi: number) => (d.line === 'u' ? k.box('oak', d.at - half, d.at + half, lo, hi, a, c, OAK, true) : k.box('oak', a, c, lo, hi, d.at - half, d.at + half, OAK, true));
      put(d.c - d.w / 2 - 0.08, d.c - d.w / 2 + 0.01, y0, top + 0.08);
      put(d.c + d.w / 2 - 0.01, d.c + d.w / 2 + 0.08, y0, top + 0.08);
      put(d.c - d.w / 2 - 0.08, d.c + d.w / 2 + 0.08, top - 0.01, top + 0.08);
    }
  }

  // ---- the stair
  if (!st || !flights.length) return;
  const at = k.at, open = st.wall < 0 ? st.u1 : st.u0, out = st.wall < 0 ? 1 : -1, rail = open + out * 0.03;
  flights.forEach((f, n) => {
    const y = F[n], up = F[n + 1] - y, L = f.length, railY = (v: number) => y + 0.95 + (up * (v - st.v0)) / L;
    for (let i = 0; i < f.steps - 1; i++) {
      const va = st.v0 + i * f.tread, step = y + (i + 1) * f.rise, mid = va + f.tread / 2;
      // (The lowest flight is boxed in to the floor; those above are treads only, so that the flight over a low storey does not
      // hang too low over the heads of those coming up the one under it.)
      if (n === 0) k.box('oak', st.u0, st.u1, y, step, va, va + f.tread, BOARDS, true);
      else k.box('oak', st.u0, st.u1, step - 0.05, step, va - 0.02, va + f.tread, BOARDS, true);
      k.box('oak', rail - 0.022, rail + 0.022, n === 0 ? step : y, railY(mid), mid - 0.022, mid + 0.022, OAK, true);
    }
    if (n > 0) for (const u of [st.u0 + 0.025, st.u1 - 0.025]) k.stick(at(u, y + f.rise - 0.16, st.v0), at(u, y + up - 0.16, st.v0 + L - f.tread), 0.05, 0.24, OAK, 'oak');
    k.stick(at(rail, railY(st.v0), st.v0), at(rail, railY(st.v0 + L), st.v0 + L), 0.07, 0.08, OAK, 'oak');
    k.box('oak', rail - 0.05, rail + 0.05, y, railY(st.v0) + 0.1, st.v0 - 0.05, st.v0 + 0.05, OAK, true);
    k.box('oak', rail - 0.05, rail + 0.05, n === 0 ? y + up - f.rise : y, railY(st.v0 + L) + 0.1, st.v0 + L - 0.05, st.v0 + L + 0.05, OAK, true);
  });
  // On the top storey nothing goes up, and the well has a rail along its open side and across its foot.
  const y = F[N - 1], end = st.v0 - 0.04, far = st.v0 + flights[flights.length - 1].length, wall = st.wall < 0 ? st.u0 : st.u1;
  k.stick(at(rail, y + 0.95, end), at(rail, y + 0.95, far), 0.07, 0.08, OAK, 'oak');
  k.stick(at(rail, y + 0.95, end), at(wall, y + 0.95, end), 0.07, 0.08, OAK, 'oak');
  for (let v = st.v0 + 0.1; v < far - 0.05; v += 0.2) k.box('oak', rail - 0.022, rail + 0.022, y, y + 0.95, v - 0.022, v + 0.022, OAK, true);
  for (let u = Math.min(rail, wall) + 0.12; u < Math.max(rail, wall) - 0.06; u += 0.2) k.box('oak', u - 0.022, u + 0.022, y, y + 0.95, end - 0.022, end + 0.022, OAK, true);
  for (const v of [end, far]) k.box('oak', rail - 0.05, rail + 0.05, y, y + 1.05, v - 0.05, v + 0.05, OAK, true);
}

/**
 * A door standing open: one leaf, or two, of the opening from `s0` to `s1` and `y0` to `y1` in a front `f`, each swung in square to
 * the wall against its own side, hinged at `t` into the wall; framed, and with a panel or two.
 */
export function openLeaves(k: BrickKit, f: Face, s0: number, s1: number, y0: number, y1: number, t: number, paint: Colour, two: boolean, hinge: -1 | 1 = -1): void {
  const width = s1 - s0, leaves: [number, -1 | 1][] = two ? [[s0, -1], [s1, 1]] : [[hinge < 0 ? s0 : s1, hinge]], deep = (two ? width / 2 : width) - 0.04;
  for (const [s, side] of leaves) {
    const a = s - side * 0.09, c = s - side * 0.03, lo = Math.min(a, c), hi = Math.max(a, c);
    k.on(f, 'wood', lo, hi, y0 + 0.02, y1, t, t + deep, paint, true);
    // (Panels on the leaf's face that looks into the opening: a frame standing a little proud of it.)
    const face = side < 0 ? hi : lo, proud = side < 0 ? [face, face + 0.015] : [face - 0.015, face];
    for (const [p, q] of [[y0 + 0.15, y0 + (y1 - y0) * 0.45], [y0 + (y1 - y0) * 0.52, y1 - 0.15]]) if (q - p > 0.2) k.on(f, 'wood', proud[0], proud[1], p, q, t + 0.1, t + deep - 0.1, paint, true);
  }
}
