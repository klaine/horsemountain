import { Rng } from './rng';
import { erodedFbmLod, fbmd, HeightField, landDetail, ridgedFbm, Wear, wornLattice } from './terrain';

/**
 * Islands made the land's way round: first a sea full of islands, made by noise and worn by water
 * and frost; then, in it, the island that best suits the house, found by search; and only then the
 * house's ground levelled on it, cliffs cut where the sea has eaten its coast back, and the landing
 * and the way laid on what is there.
 *
 * The land is in its own frame (`u`, `v`, in metres, heights over a datum of its own). An island
 * that has been found says where in that frame the house stands, how the frame is turned to the
 * site's, and what height there is the forecourt's floor (`IslandSpot`); `islandFrame` turns site
 * coordinates into the frame's.
 */

/** The land's frame: two lattices, a fine one about the middle and a coarse one round it for what is seen across the water. */
export interface Archipelago { seed: number; inner: HeightField; outer: HeightField }

const SHAPES = new Map<number, Archipelago>();

/** The plain shape of the land at a point of its frame: a shelf, islands broken out of it, hills on them. */
function shapeAt(seed: number, u: number, v: number, fine: boolean): number {
  // The shelf: where the sea is shallower and the islands thicker, and where it is open water.
  const shelf = fbmd(u / 2200 + 1.3, v / 2200 - 0.7, 3, seed + 1);
  // The islands: warped noise, so that their coasts wander and are not blobs.
  const wu = u / 520 + 0.45 * fbmd(u / 700, v / 700, 3, seed + 2), wv = v / 520 + 0.45 * fbmd(u / 700 + 5.2, v / 700, 3, seed + 3);
  const isles = fbmd(wu, wv, fine ? 5 : 4, seed + 4);
  // (An island three hundred metres across stands twenty to sixty metres out of the sea: the land is no steeper than that.)
  const h = 170 * (0.45 * shelf + 0.55 * isles);
  // Hills on the land, more of them the higher it stands: crests and hollows from ridged noise.
  const up = Math.max(0, h + 10) / 45, r = ridgedFbm(u / 260 + 0.3 * isles, v / 260, fine ? 5 : 3, seed + 5);
  return h + 18 * Math.min(1.4, up) * (r - 0.25);
}

/** How the frame's two lattices are worn. */
const INNER_WEAR: Wear = {
  cut: 30, fill: 12,
  water: { drops: 1.0, life: 80, inertia: 0.1, capacity: 0.5, erode: 0.15, deposit: 0.25, evaporate: 0.012, gravity: 4, radius: 2, most: 1.2 },
  frost: { passes: 2, repose: 1.6, rate: 0.4 },
};
const OUTER_WEAR: Wear = {
  cut: 60, fill: 25,
  water: { drops: 1.0, life: 80, inertia: 0.15, capacity: 0.5, erode: 0.15, deposit: 0.25, evaporate: 0.012, gravity: 4, radius: 2, most: 3 },
  frost: { passes: 2, repose: 1.4, rate: 0.4 },
};

/** The land of a frame: made when first asked for, and kept. */
export function archipelago(seed: number): Archipelago {
  let a = SHAPES.get(seed);
  if (a) return a;
  const rng = new Rng(`archipelago/${seed}`);
  // (Five metres to a point within 1.2 kilometres, twenty beyond: a notch finer than first made, for the land across the water.)
  const oc = 20, on = 361, ic = 5, inn = 481;
  const outer = wornLattice(-(on - 1) * oc / 2, -(on - 1) * oc / 2, oc, on, on, (u, v) => shapeAt(seed, u, v, false), rng.fork('outer'), OUTER_WEAR, undefined, 8);
  const inner = wornLattice(-(inn - 1) * ic / 2, -(inn - 1) * ic / 2, ic, inn, inn, (u, v) => shapeAt(seed, u, v, true), rng.fork('inner'), INNER_WEAR, undefined, 20);
  a = { seed, inner, outer };
  SHAPES.set(seed, a);
  return a;
}

/** The height of a frame's land at a point of it, with detail laid on, in fewer octaves the further `out` it lies from whoever sees it. */
export function frameHeight(a: Archipelago, u: number, v: number, out = 0): number {
  const i = a.inner, o = a.outer;
  let h: number;
  if (i.holds(u, v)) {
    // (Blended into the coarse lattice over the fine one's last two hundred metres.)
    const edge = Math.min(u - i.x0, v - i.z0, i.x0 + (i.nx - 1) * i.cell - u, i.z0 + (i.nz - 1) * i.cell - v);
    h = edge > 200 ? i.smoothAt(u, v) : o.smoothAt(u, v) + (i.smoothAt(u, v) - o.smoothAt(u, v)) * Math.min(1, Math.max(0, edge / 200));
  } else h = o.holds(u, v) ? o.smoothAt(u, v) : shapeAt(a.seed, u, v, false);
  if (out > 0) {
    const octaves = Math.min(5, Math.max(2, 5 - Math.log2(Math.max(out, 400) / 400)));
    h += 6 * erodedFbmLod(u / 160 + 2.1, v / 160 - 0.4, octaves, a.seed + 9);
  }
  return h;
}

/** Where an island was found, and how the frame stands to the site. */
export interface IslandSpot {
  /** The point of the frame under the middle of the house's level ground; how far the frame is turned; the height there, which is the forecourt's floor. */
  u: number; v: number; turn: number; base: number;
  /** The sea's level in the frame. */
  sea: number;
  /** The island's middle, in the frame, and how far its farthest point lies from that. */
  cu: number; cv: number; reach: number;
}

/** A point of the site in the frame of an island found in it, the house's level ground about (`hx`, `hz`). */
export function islandFrame(s: { u: number; v: number; turn: number }, hx: number, hz: number, x: number, z: number): [number, number] {
  const c = Math.cos(s.turn), sn = Math.sin(s.turn), dx = x - hx, dz = z - hz;
  return [s.u + c * dx - sn * dz, s.v + sn * dx + c * dz];
}

/**
 * Finds islands for a house whose level ground is `w` by `d` metres: an island `radius` metres
 * across the half of it or so, near enough round that its coast can be told as a ring of distances
 * from its middle, with a place on it where that ground can be levelled with little cut or fill, 18 to
 * 34 metres over the sea, well in from the cliffs, nearer one end of the island than its middle.
 */
export function findIslands(a: Archipelago, w: number, d: number, radius: number, rng: Rng, why?: Record<string, number>, seas?: number[]): IslandSpot[] {
  const no = (k: string) => { if (why) why[k] = (why[k] ?? 0) + 1; };
  const f = a.inner, nx = f.nx, nz = f.nz, cell = f.cell;
  // Sea levels to try: between the middle of the land's heights and its upper quarter, from the frame's own heights.
  // (Unless the sea is given: in a world (`world.ts`) it stands at one level for every island.)
  const sorted = seas ? [] : Array.from(f.data).sort((p, q) => p - q);
  const levels = seas ?? Array.from({ length: 20 }, (_, k) => sorted[Math.floor(sorted.length * (0.4 + k * 0.026))]);
  const want = Math.PI * radius * radius, half = Math.min(w, d) / 2;
  const found: { spot: IslandSpot; score: number }[] = [];
  const label = new Int32Array(nx * nz), far = new Float32Array(nx * nz);
  for (const sea of levels) {
    // The coast stands some metres over the sea where it is cliff (three to sixteen): the island is what stands over the middle of that.
    const shore = sea + 9;
    label.fill(0);
    let next = 0;
    for (let start = 0; start < nx * nz; start++) {
      if (label[start] || f.data[start] <= shore) continue;
      next++;
      const cells: number[] = [start];
      label[start] = next;
      let touches = false;
      for (let q = 0; q < cells.length; q++) {
        const k = cells[q], i = k % nx, j = (k - i) / nx;
        if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) touches = true;
        for (const n of [k - 1, k + 1, k - nx, k + nx]) {
          if (n < 0 || n >= nx * nz || label[n] || f.data[n] <= shore) continue;
          if ((n === k - 1 && i === 0) || (n === k + 1 && i === nx - 1)) continue;
          label[n] = next; cells.push(n);
        }
      }
      const area = cells.length * cell * cell;
      if (touches) continue;
      if (area < want * 0.5 || area > want * 2.2) { no(area < want ? 'small' : 'large'); continue; }
      // Its middle, and how far its coast lies from it: near enough round, and no point of it out on a long arm.
      let cu = 0, cv = 0, top = -Infinity;
      for (const k of cells) { cu += k % nx; cv += Math.floor(k / nx); top = Math.max(top, f.data[k]); }
      cu = f.x0 + (cu / cells.length) * cell; cv = f.z0 + (cv / cells.length) * cell;
      let reach = 0;
      for (const k of cells) reach = Math.max(reach, Math.hypot(f.x0 + (k % nx) * cell - cu, f.z0 + Math.floor(k / nx) * cell - cv));
      const round = area / (Math.PI * reach * reach);
      if (round < 0.35) { no('not round'); continue; }
      if (top - sea < 26 || top - sea > 110) { no('height'); continue; }
      // Rays from the middle that cross the coast more than once: an island is told by a ring only if few do.
      let crossed = 0;
      for (let r = 0; r < 64; r++) {
        const t = (r / 64) * Math.PI * 2;
        let inside = true, crossings = 0;
        for (let s = 0; s < reach + 30; s += cell / 2) { const now = f.at(cu + Math.cos(t) * s, cv + Math.sin(t) * s) > shore; if (now !== inside) { crossings++; inside = now; } }
        if (crossings > 1) crossed++;
      }
      if (crossed > 12) { no('ragged'); continue; }
      // How far each of its points lies from its coast.
      // (Two sweeps over the lattice's own order, forward and back, each taking the least of its neighbours' and the step to them.)
      cells.sort((p, q) => p - q);
      // (Measured to where the land falls below the highest a cliff is cut, sixteen metres over the sea: wherever the cliffs come
      // to be cut, the house's ground is that far in from them.)
      for (const k of cells) far[k] = f.data[k] > sea + 16 ? 1e6 : 0;
      for (let pass = 0; pass < 2; pass++) for (const k0 of pass ? [...cells].reverse() : cells) {
        const i = k0 % nx;
        let m = far[k0];
        if (!m) continue;
        for (const [n, dd] of [[k0 - 1, cell], [k0 + 1, cell], [k0 - nx, cell], [k0 + nx, cell], [k0 - nx - 1, cell * 1.414], [k0 - nx + 1, cell * 1.414], [k0 + nx - 1, cell * 1.414], [k0 + nx + 1, cell * 1.414]] as const) {
          if ((i === 0 && (n === k0 - 1 || n === k0 - nx - 1 || n === k0 + nx - 1)) || (i === nx - 1 && (n === k0 + 1 || n === k0 - nx + 1 || n === k0 + nx + 1))) continue;
          m = Math.min(m, label[n] === label[k0] ? far[n] + dd : dd);
        }
        far[k0] = m;
      }
      // Where on it the house's ground goes: far enough in, at a height over the sea a forecourt has on an island, as level as
      // may be over the whole of that ground, and out towards one end, with the middle of the island beyond it.
      // (How far in from the coast a point of the frame lies, as the lattice has it.)
      const farAt = (pu: number, pv: number) => { const i = Math.round((pu - f.x0) / cell), j = Math.round((pv - f.z0) / cell); return i < 0 || j < 0 || i >= nx || j >= nz || label[j * nx + i] !== label[cells[0]] ? 0 : far[j * nx + i]; };
      let spots = 0, best: IslandSpot | null = null, bestScore = -Infinity;
      for (const k of cells) {
        if (far[k] < half + 18) continue;
        const u = f.x0 + (k % nx) * cell, v = f.z0 + Math.floor(k / nx) * cell, base = f.data[k];
        if (base - sea < 18 || base - sea > 34) { no('spot height'); continue; }
        const off = Math.hypot(u - cu, v - cv);
        if (off < reach * 0.15) { no('spot middle'); continue; }
        // (Turned so that the island's middle lies south of the house, as it does on every island: z grows southward.)
        const turn = Math.atan2(cv - v, cu - u) - Math.PI / 2 + rng.range(-0.35, 0.35);
        const s: IslandSpot = { u, v, turn, base, sea, cu, cv, reach };
        let lo = Infinity, hi = -Infinity;
        for (let gx = -1; gx <= 1; gx += 0.5) for (let gz = -1; gz <= 1; gz += 0.5) {
          const [pu, pv] = islandFrame(s, 0, 0, (gx * w) / 2, (gz * d) / 2), y = f.at(pu, pv);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
        if (hi - lo > 12) { no('spot uneven'); continue; }
        // (Every corner of the level ground well in from the coast.)
        let clear = Infinity;
        for (const [gx, gz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const [pu, pv] = islandFrame(s, 0, 0, (gx * w) / 2, (gz * d) / 2); clear = Math.min(clear, farAt(pu, pv)); }
        if (clear < 20) { no('spot near coast'); continue; }
        spots++;
        const score = -Math.abs(area - want) / want * 6 + round * 4 - (hi - lo) * 0.5 - Math.abs(off / reach - 0.5) * 4 - crossed * 0.3 + rng.range(0, 1.5);
        if (score > bestScore) { bestScore = score; best = { ...s, base: (lo + hi) / 2 }; }
      }
      if (!spots) no('no spot');
      if (best) found.push({ spot: best, score: bestScore });
    }
  }
  // (The best place on each island found, best first: whoever asked tries them in turn, since what is cut and laid next may not fit on every one.)
  return found.sort((p, q) => q.score - p.score).map((f) => f.spot);
}

/** Detail for the island's own land, laid on the frame's when it is made fine: a few metres, at `scale` to its broadest wave. */
export function islandDetail(x: number, z: number, seed: number): number {
  return landDetail(x, z, 110, seed);
}
