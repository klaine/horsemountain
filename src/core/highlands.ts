import { Rng } from './rng';
import { erodedFbmLod, fbmd, HeightField, ridgedFbm, Wear, wornLattice } from './terrain';

/**
 * Valleys made the land's way round, as islands are (`archipelago.ts`): first a stretch of upland,
 * made by noise and worn by water and frost, so that its streams have cut valleys into it; then, in
 * it, the head of a valley that suits the house, found by search; and only then the house's ground
 * levelled there and the rest laid on what is there.
 *
 * The land is in its own frame (`u`, `v`, metres, heights over a datum of its own). A valley that
 * has been found says where in that frame the house stands, how the frame is turned to the site's
 * (so that the valley runs south, towards +z, from the house), and what height there is the
 * forecourt's floor (`ValleySpot`).
 */

export interface Highlands { seed: number; inner: HeightField; outer: HeightField; acc: Float32Array; down: Int32Array }

const LANDS = new Map<number, Highlands>();

/** The plain shape of the upland at a point of its frame: broad swells, ridges running for miles, the summits of hills on them. */
function shapeAt(seed: number, u: number, v: number, fine: boolean): number {
  // The valleys are cut into it from the first: ridged noise turned over, whose sharp crests are then sharp-bottomed valleys in a
  // network, branching and joining, some four or five hundred metres apart; between them broad hills. (The wear by water was not
  // strong enough, at this size, to cut glens of its own: it gives their floors and sides their detail.)
  const broad = fbmd(u / 2600 + 2.1, v / 2600, 3, seed + 1);
  const wu = u / 520 + 0.45 * fbmd(u / 700, v / 700, 3, seed + 2), wv = v / 520 + 0.45 * fbmd(u / 700 + 4.4, v / 700, 3, seed + 3);
  const valleys = ridgedFbm(wu, wv, fine ? 5 : 4, seed + 4);
  const hills = 1 - Math.pow(Math.min(1, valleys * 1.25), 1.6);
  return 200 * broad + 190 * hills + 25 * fbmd(u / 200, v / 200, fine ? 4 : 2, seed + 5);
}

const INNER_WEAR: Wear = {
  cut: 60, fill: 18,
  water: { drops: 1.4, life: 100, inertia: 0.1, capacity: 0.7, erode: 0.2, deposit: 0.25, evaporate: 0.01, gravity: 4, radius: 2, most: 2 },
  frost: { passes: 2, repose: 1.5, rate: 0.4 },
};
const OUTER_WEAR: Wear = {
  cut: 70, fill: 30,
  water: { drops: 1.0, life: 80, inertia: 0.15, capacity: 0.5, erode: 0.15, deposit: 0.25, evaporate: 0.012, gravity: 4, radius: 2, most: 3 },
  frost: { passes: 2, repose: 1.4, rate: 0.4 },
};

/** The land of a frame: made when first asked for, and kept; with how its inner lattice drains (what gathers at each point, and where it goes). */
export function highlands(seed: number): Highlands {
  let h = LANDS.get(seed);
  if (h) return h;
  const rng = new Rng(`highlands/${seed}`);
  const oc = 20, on = 361, ic = 5, inn = 481;
  const outer = wornLattice(-(on - 1) * oc / 2, -(on - 1) * oc / 2, oc, on, on, (u, v) => shapeAt(seed, u, v, false), rng.fork('outer'), OUTER_WEAR, undefined, 8);
  const inner = wornLattice(-(inn - 1) * ic / 2, -(inn - 1) * ic / 2, ic, inn, inn, (u, v) => shapeAt(seed, u, v, true), rng.fork('inner'), INNER_WEAR, undefined, 20);
  // How it drains. First its hollows are filled to where they would spill (water does not stop in a dip where the wear left
  // one: it fills it and runs on), by flooding inward from the edge, lowest first; each filled point a hair above the one it was
  // reached from, so that the water still knows which way to go across a filled flat.
  const n = inn, filled = new Float32Array(n * n), seen = new Uint8Array(n * n), heap: number[] = [], key: number[] = [];
  const push = (k: number, y: number) => { heap.push(k); key.push(y); for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (key[p] <= key[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [key[p], key[i]] = [key[i], key[p]]; i = p; } };
  const pop = () => { const top = heap[0], lk = heap.pop()!, lf = key.pop()!; if (heap.length) { heap[0] = lk; key[0] = lf; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && key[l] < key[m]) m = l; if (r < heap.length && key[r] < key[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [key[m], key[i]] = [key[i], key[m]]; i = m; } } return top; };
  for (let k = 0; k < n * n; k++) { const i = k % n, j = (k - i) / n; if (i === 0 || j === 0 || i === n - 1 || j === n - 1) { filled[k] = inner.data[k]; seen[k] = 1; push(k, filled[k]); } }
  while (heap.length) {
    const k = pop(), i = k % n, j = (k - i) / n;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if ((!di && !dj) || ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const q = jj * n + ii;
      if (seen[q]) continue;
      seen[q] = 1; filled[q] = Math.max(inner.data[q], filled[k] + 1e-3); push(q, filled[q]);
    }
  }
  // Then each point passes what has gathered there to its steepest neighbour downhill.
  const acc = new Float32Array(n * n).fill(ic * ic), down = new Int32Array(n * n).fill(-1);
  const order = Array.from({ length: n * n }, (_, k) => k).sort((a, b) => filled[b] - filled[a]);
  for (const k of order) {
    const i = k % n, j = (k - i) / n;
    let low = -1, best = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if ((!di && !dj) || ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const q = jj * n + ii, drop = (filled[k] - filled[q]) / Math.hypot(di, dj);
      if (drop > best) { best = drop; low = q; }
    }
    if (low >= 0) { down[k] = low; acc[low] += acc[k]; }
  }
  h = { seed, inner, outer, acc, down };
  LANDS.set(seed, h);
  return h;
}

/** The height of a frame's land at a point of it, with detail laid on, in fewer octaves the further `out` it lies from whoever sees it. */
export function uplandHeight(h: Highlands, u: number, v: number, out = 0): number {
  const i = h.inner, o = h.outer;
  let y: number;
  if (i.holds(u, v)) {
    const edge = Math.min(u - i.x0, v - i.z0, i.x0 + (i.nx - 1) * i.cell - u, i.z0 + (i.nz - 1) * i.cell - v);
    y = edge > 200 ? i.smoothAt(u, v) : o.smoothAt(u, v) + (i.smoothAt(u, v) - o.smoothAt(u, v)) * Math.min(1, Math.max(0, edge / 200));
  } else y = o.holds(u, v) ? o.smoothAt(u, v) : shapeAt(h.seed, u, v, false);
  if (out > 0) y += 5 * erodedFbmLod(u / 140 + 2.1, v / 140 - 0.4, Math.min(5, Math.max(2, 5 - Math.log2(Math.max(out, 300) / 300))), h.seed + 9);
  return y;
}

/** Where a valley was found, and how the frame stands to the site. */
export interface ValleySpot {
  /** The point of the frame under the middle of the house's level ground; how far the frame is turned; the height there, which is the forecourt's floor. */
  u: number; v: number; turn: number; base: number;
  /** The valley's floor down from the house, in the frame: points `[u, v]` along the stream's line, about six metres apart. */
  course: [number, number][];
}

/** A point of the site in the frame of a valley found in it, the house's level ground about (`hx`, `hz`). */
export function valleyFrame(s: { u: number; v: number; turn: number }, hx: number, hz: number, x: number, z: number): [number, number] {
  const c = Math.cos(s.turn), sn = Math.sin(s.turn), dx = x - hx, dz = z - hz;
  return [s.u + c * dx - sn * dz, s.v + sn * dx + c * dz];
}

/**
 * Finds valley heads for a house whose level ground is `w` by `d` metres: places where a stream's
 * upper valley begins, with a floor falling gently for `length` metres below it, walls rising on
 * both hands, and at its head ground where the house's ground can be levelled with little cut or
 * fill. Best first.
 */
export function findValleys(h: Highlands, w: number, d: number, length: number, rng: Rng, why?: Record<string, number>): ValleySpot[] {
  const no = (k: string) => { if (why) why[k] = (why[k] ?? 0) + 1; };
  const f = h.inner, n = f.nx, cell = f.cell, found: { spot: ValleySpot; score: number }[] = [];
  const at = (k: number): [number, number] => [f.x0 + (k % n) * cell, f.z0 + Math.floor(k / n) * cell];
  const margin = 260;
  for (let k = 0; k < n * n; k += 1) {
    // (Only where a stream begins to be one: enough has gathered to have cut a valley, not so much that it is a broad strath.)
    if (h.acc[k] < 60000 || h.acc[k] > 400000) continue;
    const [u0, v0] = at(k);
    if (Math.abs(u0) > (n * cell) / 2 - margin || Math.abs(v0) > (n * cell) / 2 - margin) continue;
    // Down the stream for the valley's length.
    const course: [number, number][] = [[u0, v0]];
    let cur = k, gone = 0;
    while (gone < length && h.down[cur] >= 0) { const nx2 = h.down[cur], [a, b] = at(cur), [c2, d2] = at(nx2); gone += Math.hypot(c2 - a, d2 - b); cur = nx2; course.push([c2, d2]); }
    if (gone < length) { no('short'); continue; }
    const fall = (f.data[k] - f.data[cur]) / gone;
    if (fall < 0.002 || fall > 0.2) { no('fall'); continue; }
    // Its walls: across the valley every forty metres down it, the land within seventy metres either side must stand well over the floor.
    const head = Math.atan2(course[Math.min(course.length - 1, 12)][1] - v0, course[Math.min(course.length - 1, 12)][0] - u0);
    let walls = Infinity, wide = 0, bent = 0, ok = true;
    for (let i = 6; i < course.length && ok; i += 7) {
      const [pu, pv] = course[i], [qu, qv] = course[Math.max(0, i - 3)], dir = Math.atan2(pv - qv, pu - qu), px = -Math.sin(dir), pz = Math.cos(dir), floor = f.at(pu, pv);
      bent = Math.max(bent, Math.abs(Math.atan2(Math.sin(dir - head), Math.cos(dir - head))));
      for (const side of [-1, 1]) {
        let high = -Infinity, edge = 90;
        for (let r = 4; r <= 120; r += 4) { const y = f.at(pu + px * side * r, pv + pz * side * r) - floor; high = Math.max(high, y); if (edge === 90 && y > 5) edge = r; }
        walls = Math.min(walls, high); wide = Math.max(wide, edge);
      }
      if (walls < 7) ok = false;
    }
    if (!ok) { no('walls'); continue; }
    // (It runs south from the house when turned; it must not turn back on itself, or its sides could not be told by distance along it.)
    if (bent > 1.35) { no('bent'); continue; }
    // The house's ground at the head: turned so the valley runs south, as level as may be.
    const turn = head - Math.PI / 2 + rng.range(-0.15, 0.15), s0 = { u: u0, v: v0, turn };
    let lo = Infinity, hi = -Infinity;
    for (let gx = -1; gx <= 1; gx += 0.5) for (let gz = -1; gz <= 1; gz += 0.5) { const [pu, pv] = valleyFrame(s0, 0, 0, (gx * w) / 2, (gz * d) / 2), y = f.at(pu, pv); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi - lo > 18) { no('uneven'); continue; }
    const score = Math.min(walls, 60) * 0.08 - (hi - lo) * 0.25 - bent * 2 - Math.abs(fall - 0.04) * 30 - Math.abs(wide - 45) * 0.03 + rng.range(0, 1);
    found.push({ spot: { ...s0, base: (lo + hi) / 2, course }, score });
  }
  return found.sort((a, b) => b.score - a.score).map((x) => x.spot);
}
