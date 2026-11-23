import { Rng } from './rng';
import { erodedFbm, erodedFbmLod, fbmd, HeightField, ridgedFbm, Wear, wornLattice } from './terrain';

/**
 * A coast made the land's way round, for a town: first a stretch of country between the sea and
 * the mountains, made by noise and worn by water and frost; then, on its shore, the bay that best
 * suits a harbour town, found by search; and only then the town laid on what is there.
 *
 * The country runs along its frame's `u`; `v` goes inland. Out to sea the bed shelves away; ashore
 * there is a strip of low land, then hills, then mountains, a kilometre and more high, some two to
 * four kilometres back. Spurs run down from the hills to the sea and stand out of it as headlands,
 * with bays between them, and the coast's line wanders besides in broad bays and points.
 *
 * As with the islands (`archipelago.ts`), the land is in its own frame, in metres, with the sea at
 * nought; a town that has been found says where in that frame its quay is, how the frame is turned
 * to the site's (the sea lies south of the town in the site, as it lies south of every house), and
 * what height in the frame the house's ground stands at (`TownSpot`).
 */

export interface Coastland { seed: number; inner: HeightField; outer: HeightField }

const SHAPES = new Map<number, Coastland>();
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/**
 * Where the coast's line runs: how far out to sea it stands at a point (more `out`, further out), as a broad sweep of
 * kilometres and, laid on it, the bays and points of a few hundred metres (`jut`), which are also where the hard rock is.
 */
function coastLine(seed: number, u: number, v: number): { out: number; jut: number } {
  const wu = u + 160 * fbmd(u / 1100 + 1.7, v / 1100 - 0.4, 3, seed + 1);
  const jut = 460 * fbmd(wu / 780 - 2.1, v / 2400 + 0.9, 3, seed + 3) + 150 * fbmd(wu / 280 + 4.4, v / 900, 2, seed + 8);
  return { out: 1500 * fbmd(wu / 3600 + 0.3, 0.61, 3, seed + 2) + jut, jut };
}

/** The plain shape of the land at a point of its frame. */
function shapeAt(seed: number, u: number, v: number, fine: boolean): number {
  const { out, jut } = coastLine(seed, u, v), d = v + out;
  // Out to sea, a bed shelving away; ashore, low land rising some twenty metres in a kilometre.
  const low = d < 0 ? -1.5 + d * 0.05 : 1.2 + d * 0.021;
  // Where the coast stands out in a point the rock is hard and the land high: a headland, falling to the sea in cliffs. In the bays
  // between, the land is low, and there a town may stand. (Only on the land: the sea has cut the headland back to a cliff.)
  const head = 52 * smooth((jut - 70) / 210) * smooth((d + 12) / 24) * (1 - smooth((d - 380) / 520)) * (0.7 + 0.6 * ridgedFbm(u / 300 + 2.2, v / 300 - 0.7, 3, seed + 6));
  // Swells on the low land: knolls and broad rises, more of them further in.
  const swell = 22 * smooth((d - 60) / 500) * (erodedFbm(u / 520 + 5.1, v / 520 - 2.3, fine ? 4 : 3, seed + 9) + 0.25);
  // The hills, from half a kilometre in: crests and hollows from ridged noise.
  const hills = 170 * smooth((d - 450) / 1100) * (0.5 + 0.95 * ridgedFbm(u / 900 + 0.4, v / 900, fine ? 5 : 4, seed + 4));
  // The mountains, from a kilometre and a half: great ridges and horns.
  const peaks = 1100 * smooth((d - 1500) / 2800) * (0.28 + ridgedFbm(u / 1700 - 3.3, v / 1700 + 1.1, fine ? 5 : 4, seed + 5));
  // And everywhere the small relief of a worn land: hummocks, the heads of gullies.
  const rough = 4 * erodedFbm(u / 240 + 0.7, v / 240, fine ? 5 : 4, seed + 7) * smooth((d + 60) / 160);
  return Math.max(-70, low + head + Math.max(0, swell) + hills + peaks + rough);
}

/** How the frame's two lattices are worn. */
const INNER_WEAR: Wear = {
  cut: 26, fill: 10,
  water: { drops: 1.0, life: 80, inertia: 0.1, capacity: 0.5, erode: 0.15, deposit: 0.25, evaporate: 0.012, gravity: 4, radius: 2, most: 1.2 },
  frost: { passes: 2, repose: 1.5, rate: 0.4 },
};
const OUTER_WEAR: Wear = {
  cut: 70, fill: 25,
  water: { drops: 1.0, life: 80, inertia: 0.15, capacity: 0.5, erode: 0.15, deposit: 0.25, evaporate: 0.012, gravity: 4, radius: 2, most: 3 },
  frost: { passes: 2, repose: 1.3, rate: 0.4 },
};

/** The land of a frame: made when first asked for, and kept. */
export function coastland(seed: number): Coastland {
  let c = SHAPES.get(seed);
  if (c) return c;
  const rng = new Rng(`coastland/${seed}`);
  // (Five metres to a point over 2.8 kilometres about the middle, where towns are looked for; twenty over eight, for the country seen from them.)
  const oc = 20, on = 401, ic = 5, inn = 561;
  const outer = wornLattice(-(on - 1) * oc / 2, -(on - 1) * oc / 2, oc, on, on, (u, v) => shapeAt(seed, u, v, false), rng.fork('outer'), OUTER_WEAR, undefined, 8);
  const inner = wornLattice(-(inn - 1) * ic / 2, -(inn - 1) * ic / 2, ic, inn, inn, (u, v) => shapeAt(seed, u, v, true), rng.fork('inner'), INNER_WEAR, undefined, 20);
  c = { seed, inner, outer };
  SHAPES.set(seed, c);
  return c;
}

/** The height of a frame's land at a point of it, with detail laid on in fewer octaves the further `out` it lies from whoever sees it. */
export function coastHeight(c: Coastland, u: number, v: number, out = 0): number {
  const i = c.inner, o = c.outer;
  let h: number;
  if (i.holds(u, v)) {
    // (Blended into the coarse lattice over the fine one's last two hundred metres.)
    const edge = Math.min(u - i.x0, v - i.z0, i.x0 + (i.nx - 1) * i.cell - u, i.z0 + (i.nz - 1) * i.cell - v);
    h = edge > 200 ? i.smoothAt(u, v) : o.smoothAt(u, v) + (i.smoothAt(u, v) - o.smoothAt(u, v)) * Math.min(1, Math.max(0, edge / 200));
  } else h = o.holds(u, v) ? o.smoothAt(u, v) : shapeAt(c.seed, u, v, false);
  if (out > 0) {
    const octaves = Math.min(5, Math.max(2, 5 - Math.log2(Math.max(out, 400) / 400)));
    // (Detail on the land only: the sea bed is not seen.)
    h += 7 * erodedFbmLod(u / 170 + 2.1, v / 170 - 0.4, octaves, c.seed + 9) * smooth((h + 4) / 10);
  }
  return h;
}

/** Where a town was found, and how the frame stands to the site. */
export interface TownSpot {
  /** The point of the frame under the middle of the quay's edge; how far the frame is turned; the height in the frame of the house's ground. */
  u: number; v: number; turn: number; base: number;
  /** The natural height of the square's ground over the sea, at its north side and at its south. */
  north: number; south: number;
  /** Which hand a headland with cliffs stands on (west -1, east 1, as the site has it), and how far along the coast; or none. */
  head?: { side: -1 | 1; x: number; height: number };
  score: number;
}

/** A point of the site in the frame, given where the quay's middle is in the site (`qx`, `qz`). */
export function townFrame(s: { u: number; v: number; turn: number }, qx: number, qz: number, x: number, z: number): [number, number] {
  const c = Math.cos(s.turn), sn = Math.sin(s.turn), dx = x - qx, dz = z - qz;
  return [s.u + c * dx - sn * dz, s.v + sn * dx + c * dz];
}

/** What a town needs, in the site's measures about the middle of its quay's edge (north is less `z`, inland). */
export interface TownNeed {
  /** The square: across, and from how far north to how far north of the quay's edge (both less than nothing). */
  square: { x0: number; x1: number; z0: number; z1: number };
  /** The house and its forecourt. */
  house: { x0: number; x1: number; z0: number; z1: number };
  /** How far either way along the coast, and how far inland, the blocks of the town may go. */
  half: number; deep: number;
}

/**
 * Finds places on the coast for a town: a shore with the sea open before it for a harbour, low
 * ground behind it rising gently for a square and blocks of streets, the house's ground at the
 * head of the square a few metres higher than it, country rising behind to the hills; and,
 * better still, a headland with cliffs beside it, and land standing out on either hand so that
 * the harbour lies in a bay.
 */
export function findTowns(c: { inner: HeightField }, need: TownNeed, rng: Rng, why?: Record<string, number>, o: { margin?: number; where?: (k: number) => boolean } = {}): TownSpot[] {
  const no = (k: string) => { if (why) why[k] = (why[k] ?? 0) + 1; };
  const f = c.inner, nx = f.nx, cell = f.cell;
  const H = (u: number, v: number) => f.at(u, v);
  const found: TownSpot[] = [];
  // (The middle of the lattice only, so that all the town and what it is judged by lies within it: six hundred metres in.)
  // (A world's lattice, of eight metres, asks for the same margin in metres; and only its mainland's shore, `where`.)
  const M = o.margin ?? 120;
  for (let j = M; j < f.nz - M; j += 2) for (let i = M; i < nx - M; i += 2) {
    const k = j * nx + i, h = f.data[k];
    if (h < 0.2 || h > 2.8) continue;
    if (o.where && !o.where(k)) continue;
    // A shore: the sea within a few strides.
    const u = f.x0 + i * cell, v = f.z0 + j * cell;
    let wet = false;
    for (const [di, dj] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (f.data[(j + dj) * nx + i + di] < -0.3) wet = true;
    if (!wet) continue;
    // Out to sea: down the land's broad slope.
    const gu = H(u + 30, v) - H(u - 30, v), gv = H(u, v + 30) - H(u, v - 30), gl = Math.hypot(gu, gv);
    if (gl < 1e-3) { no('flat'); continue; }
    const ou = -gu / gl, ov = -gv / gl;
    const turn = Math.atan2(-ou, ov);
    const cs = Math.cos(turn), sn = Math.sin(turn);
    const at = (x: number, z: number) => H(u + cs * x - sn * z, v + sn * x + cs * z);
    // The harbour: open water before the quay.
    let water = 0, all = 0;
    for (let z = 16; z <= 96; z += 10) for (let x = -60; x <= 60; x += 15) { all++; if (at(x, z) < -0.8) water++; }
    if (water < all * 0.8) { no('harbour'); continue; }
    // The quay's line: neither high nor far under the water.
    let bad = false;
    for (let x = -60; x <= 60 && !bad; x += 10) { const y = at(x, -2); if (y < -2.5 || y > 4.5) bad = true; }
    if (bad) { no('quay'); continue; }
    // The square and the house: low ground, the house's a few metres higher than the square's.
    const mean = (b: { x0: number; x1: number; z0: number; z1: number }) => { let s = 0, n = 0, lo = Infinity, hi = -Infinity; for (let z = b.z0; z <= b.z1; z += 6) for (let x = b.x0; x <= b.x1; x += 6) { const y = at(x, z); s += y; n++; lo = Math.min(lo, y); hi = Math.max(hi, y); } return { y: s / n, lo, hi }; };
    const sq = mean(need.square), hs = mean(need.house);
    if (sq.lo < 0.6 || sq.hi > 16) { no('square height'); continue; }
    if (hs.y < sq.y + 0.5 || hs.y > sq.y + 9 || hs.hi - hs.lo > 10) { no('house ground'); continue; }
    // The blocks: dry, and mostly gentle.
    let land = 0, gentle = 0, n = 0, slope = 0;
    for (let z = -need.deep; z <= -10; z += 10) for (let x = -need.half; x <= need.half; x += 10) {
      n++;
      const y = at(x, z);
      if (y > 0.8) land++;
      const s = Math.hypot(at(x + 5, z) - at(x - 5, z), at(x, z + 5) - at(x, z - 5)) / 10;
      slope += s;
      if (s < 0.16) gentle++;
    }
    if (land < n * 0.9) { no('wet ground'); continue; }
    if (gentle < n * 0.55) { no('steep ground'); continue; }
    // Rising country behind, towards the hills.
    let behind = 0, bn = 0;
    for (let x = -200; x <= 200; x += 50) { behind += at(x, -need.deep - 220); bn++; }
    behind /= bn;
    if (behind < hs.y + 8) { no('flat behind'); continue; }
    // A headland: high ground at the shore on either hand, with the sea under it.
    let head: TownSpot['head'];
    for (const side of [-1, 1] as const) for (let x = need.half * 0.6; x <= need.half + 330; x += 10) for (let z = -60; z <= 40; z += 8) {
      const y = at(side * x, z);
      if (y < 16 || (head && y <= head.height)) continue;
      if (at(side * x, z + 34) > -0.5 && at(side * (x + 30), z + 20) > -0.5) continue;
      head = { side, x: side * x, height: y };
    }
    // A bay: land standing out into the sea beyond the harbour on either hand.
    let arms = 0;
    for (const side of [-1, 1]) for (let x = 90; x <= 180; x += 30) if (at(side * x, 30) > 0) arms++;
    const score = -slope / n * 30 - (sq.hi - sq.lo) * 0.25 + (head ? 2.5 + Math.min(3, (head.height - 16) / 8) - Math.abs(head.x) / 250 : 0) + arms * 0.35 + Math.min(2, (behind - hs.y) / 30) + rng.range(0, 1.5);
    found.push({ u, v, turn, base: Math.round(hs.y * 100) / 100, north: Math.round(at(0, need.square.z0) * 100) / 100, south: Math.round(at(0, need.square.z1) * 100) / 100, head, score });
  }
  // (Spots a few metres apart on the same shore are one spot: the best of each stretch is kept, best first.)
  found.sort((p, q) => q.score - p.score);
  const kept: TownSpot[] = [];
  for (const s of found) if (!kept.some((q) => Math.hypot(q.u - s.u, q.v - s.v) < 120)) kept.push(s);
  return kept;
}
