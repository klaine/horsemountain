import { Rng, valueNoise2 } from './rng';
import { fbmd, HeightField, landDetail, leastPath, liftAndErode, ridgedFbm, smoothLine, wearByFrost, wearByWater, Wear } from './terrain';
import { IslandSpot } from './archipelago';
import { findValleys, ValleySpot } from './highlands';
import { Namer } from './names';
import { fitGround, Ground } from './fit';
import { findTowns, TownNeed, TownSpot } from './coastland';

/**
 * A world: one stretch of country, six kilometres by ten unless asked otherwise (`WORLD_SIZE`), in
 * which every kind of place is found rather than drawn: up to four of each, as many as the land holds. From the sea's side: open sea; a shelf with islands on it; the
 * coast; low country of fields and woods; an upland cut by glens; and at the back a high range,
 * with a few great peaks standing over it. One sea level for all of it, heights in metres over
 * the sea. Its mountains are hills of four to six hundred metres, its great peaks a little over that:
 * a small country, low enough that its land can one day be streamed in at a metre where it is walked.
 *
 * It is made as the islands' and the valleys' frames are (`archipelago.ts`, `highlands.ts`), a
 * level up: the plain shape first, from noise, each zone with its own kind of land and the zones
 * blended where they meet; then worn by water and frost on a coarse lattice, so that rivers drain
 * it from the range to the sea; then what lies on it read from what is there (the sea, rivers,
 * lakes, what grows), and only then the places looked for in it. Islands and valley heads are too
 * small to see on the coarse lattice, so they are looked for in tiles of a finer one, made from
 * the coarse one with the detail laid back on and worn again at their own scale. The tiles lie on a
 * fixed grid in the world, so the land of a tile is the same whichever place asks for it.
 *
 * Coordinates are the world's own: `x` east and `z` south, in metres from its middle, as a site's are.
 * What it holds and how it is to be used is written down in `docs/06-world.md`.
 */

const TAU = Math.PI * 2;
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** A soft maximum: the greater of two, with the corner where they meet rounded over `k`. */
function softMax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** What a world is, before its land is made: decided from its seed alone. */
export interface WorldPlan {
  seed: string;
  /** A number for the noise, from the seed. */
  n: number;
  /** Half the world's breadth east and west (`hx`), and north and south (`hz`): it runs from -hx to hx, and -hz to hz. */
  hx: number;
  hz: number;
  /** Which way is inland, as an angle from east towards south: the sea lies the other way. */
  inland: number;
  /** Where the coast lies along that way, in metres from the middle, before it wanders. */
  coast: number;
  /** How far out from the coast the shelf with its islands reaches. */
  shelf: number;
  /** How broad the low country is, from the coast to the foot of the upland; and the upland, from there to the foot of the range (before either wanders). */
  plains: number;
  upland: number;
  /**
   * A great bay, the coast pushed inland: where its middle lies along the coast (metres from the
   * world's middle, eastward when inland is north), how broad it is at its mouth, and how far inland
   * it reaches.
   */
  bay: { at: number; width: number; depth: number };
}

/** How large a world is unless asked otherwise: six kilometres east and west, ten from the sea to the hills, as asked (a world as deep as it is long gives each zone room, the range most). */
export const WORLD_SIZE = { x: 6000, z: 10000 };

export function planWorld(seed: string, size: { x: number; z: number } = WORLD_SIZE): WorldPlan {
  const rng = new Rng(`world/${seed}`), q = rng.fork('plan');
  const hx = size.x / 2, hz = size.z / 2;
  // (Inland is north, turned a little: the sea and its islands to the south, the mountains to the north, as asked.)
  const inland = -Math.PI / 2 + q.range(-0.3, 0.3);
  const span = hx * Math.abs(Math.cos(inland)) + hz * Math.abs(Math.sin(inland));
  // (The zones' depths are shares of the world's depth from the sea to the hills, set for ten kilometres.)
  const k = hz / 5000, shelf = q.range(1700, 2300) * k;
  const p: WorldPlan = {
    seed, n: 1000 + Math.floor(q.next() * 90000), hx, hz, inland,
    // (Some eight hundred metres of open sea beyond the shelf, at the world's edge.)
    coast: -span + 800 * k + shelf, shelf,
    // (Broad in some worlds, a strip in others, and in places none at all: there the upland comes down to the sea.)
    // (The range takes what is left, some third of the world: with more, it filled half of it and the rest was squeezed.)
    plains: q.range(600, 1800) * k, upland: q.range(2400, 3200) * k,
    bay: { at: 0, width: 0, depth: 0 },
  };
  // The bay: somewhere along the coast, not hard by the world's edge; broad, and reaching well inland, past the low country into
  // the upland. (From a stream of its own, so the rest of the plan stays as it was.) Nothing else is planned: no peak, no island.
  const b = rng.fork('bay');
  p.bay = { at: Math.round(b.range(-0.4, 0.4) * hx), width: Math.round(Math.min(b.range(1500, 2500), hx * 0.8)), depth: Math.round(b.range(1800, 3000) * k) };
  return p;
}

/**
 * Where a point lies among the zones: how far inland of the coast (`d0`); how much it lies in the bay
 * (`bay`, 0 to 1); where the upland and the range begin there; how far it is upland or range rather
 * than low country (`up`), and range rather than upland (`high`); and how much it belongs to each zone
 * (the four add to one). The zones say how fast the ground rises (`upliftAt`) and how far the sea has
 * come up over it (`drownAt`); the land's shape is the rivers' making.
 */
export interface Zones { d0: number; bay: number; mouth: number; P: number; U: number; up: number; high: number; wI: number; wP: number; wU: number; wR: number }
const ZN: Zones = { d0: 0, bay: 0, mouth: 0, P: 0, U: 0, up: 0, high: 0, wI: 0, wP: 0, wU: 0, wR: 0 };

/** The zones at a point. (Written into one object, reused: read what is wanted before asking again.) */
export function zonesAt(p: WorldPlan, x: number, z: number): Zones {
  const n = p.n, s = x * Math.cos(p.inland) + z * Math.sin(p.inland);
  // (The coast wanders in bays and headlands a kilometre or two across, and in smaller ones on them.)
  const d0 = s - p.coast + 800 * fbmd(x / 2500 + 1.7, z / 2500 - 0.3, 3, n + 1) + 200 * fbmd(x / 700, z / 700 + 2.2, 3, n + 2);
  // The great bay: where the ground rises least and the sea has come up most, deepest along its middle, which wanders, and dying away
  // at its sides and at its head; the sea comes in as far as the land lies under it. So its shore is where the land's own shape meets
  // the sea: valleys drowned into inlets, the spurs between them left as headlands, hills as islands, as a firth or a sea loch is.
  // (Drawn first as an outline cut out of the land, the bay's shore was one smooth sweep, cutting through hill and valley alike.)
  const B = p.bay, lat = -x * Math.sin(p.inland) + z * Math.cos(p.inland);
  const across = (lat - B.at + 300 * fbmd(d0 / 1400 + 2.7, 0.4, 2, n + 6)) / (B.width / 2) + 0.18 * fbmd(x / 700 - 1.9, z / 700 + 0.6, 3, n + 7);
  // (Sunk evenly over most of its breadth, and dying away slowly at its sides and head, so that there the land's own relief, not the
  // hollow's, says where the water stops.)
  // (Its edge worn into coves and points at two sizes, and its depth uneven: where the land is flat, as low country by the sea is,
  // nothing else breaks the line where the water stops, and without them it was a smooth sweep there.)
  const rag = 0.3 * fbmd(x / 550 + 4.2, z / 550 - 1.3, 3, n + 8) + 0.13 * fbmd(x / 160 - 2.6, z / 160 + 3.4, 2, n + 9);
  // (Its fall at the sides gentle, over most of the bay's half-breadth again: steep, it said where the shore went wherever the land
  // was gentle, and the bay came out a smooth lobe in low country.)
  const sunk = smooth((1.75 - Math.abs(across) + rag) / 1.5) * smooth((B.depth + 400 - d0 + 500 * rag) / 1300) * smooth((d0 + 500) / 500) * (0.85 + 0.3 * (0.5 + fbmd(x / 900, z / 900 + 7.7, 2, n + 10)));
  const P = p.plains + 900 * fbmd(x / 2500 + 3.3, z / 2500 - 1.2, 2, n + 3);
  const U = Math.max(P, -100) + p.upland + 600 * fbmd(x / 2500 - 4.1, z / 2500 + 2.2, 2, n + 4);
  const a = smooth((d0 + 250) / 650), b = smooth((d0 - P + 300) / 600), c = smooth((d0 - U + 500) / 1000);
  // (The way in to the bay: out over the shelf in front of its mouth, where nothing rises, so the bay stays open to the sea.)
  const mouth = smooth((1.25 - Math.abs(across)) / 0.5) * smooth((d0 + 1400) / 700) * (1 - smooth(d0 / 400));
  ZN.d0 = d0; ZN.bay = sunk; ZN.mouth = mouth; ZN.P = P; ZN.U = U; ZN.up = b; ZN.high = c;
  ZN.wI = 1 - a; ZN.wP = a * (1 - b); ZN.wU = a * b * (1 - c); ZN.wR = a * b * c;
  return ZN;
}

/**
 * How fast the ground rises at a point, in metres a year: what, worn by the rivers, makes the land
 * (`liftAndErode`). Fast under the range, more so in some stretches than others, so its mountains
 * stand in massifs; slower under the upland; slow under the low country; under the shelf slow, but in
 * patches, which rise into the hills that the sea will leave as islands; and least where the bay is, so
 * that the low ground runs far inland there for the sea to come into. These rates make the land's
 * shape and nothing else: where the mountains, valleys, coasts and islands come out is the rivers' doing.
 */
function upliftAt(p: WorldPlan, x: number, z: number): number {
  const n = p.n, zn = zonesAt(p, x, z), { wI, wP, wU, wR, bay, mouth } = zn;
  // (In patches at two sizes, so that the sea leaves an archipelago: some islands a kilometre across, more of a few hundred metres.)
  const patches = Math.max(0, fbmd(x / 700 + 3.1, z / 700 - 1.4, 3, n + 81) * 1.6 + fbmd(x / 260 - 0.7, z / 260 + 2.6, 2, n + 87) * 1.9 - 0.12);
  const shelf = 0.03 + 0.55 * patches * patches * (1 - 0.95 * mouth);
  const plains = 0.07 + 0.04 * fbmd(x / 1500, z / 1500 + 2.2, 2, n + 82);
  const upland = 0.32 + 0.14 * fbmd(x / 1800 - 2.7, z / 1800, 3, n + 83);
  const range = 0.85 + 0.35 * fbmd(x / 2400 + 6.1, z / 2400, 3, n + 84) + 0.4 * ridgedFbm(x / 1700 + 0.3, z / 1700 - 0.8, 3, n + 85);
  return (wI * shelf + wP * plains + wU * upland + wR * range) * (1 - 0.85 * bay) * 1e-3;
}

/** How the land is lifted and worn: on a lattice of 24 metres, over some seven million years in steps of fifty thousand; rivers from two and a half hectares of ground draining. */
export const LIFT = { cell: 24, steps: 140, dt: 5e4, k: 2.2e-5, m: 0.5, creep: 0.012, channel: 2.5e4 };
/**
 * How high the land is made to stand: the highest three points in a thousand at `TOP`; then the ground
 * over `STRETCH_FROM` raised, the more the higher, until the highest summit stands at `HIGHEST`. So the
 * mountains rise higher over the fells and valleys they are seen from, and the coast, the low country
 * and the fells stay as they were. ("Should the maximum mountain height be scaled to around 800m for
 * more dramatic looks?" Raising every height alike made the fells steeper and rockier, and moved the places.)
 */
const TOP = 650, STRETCH_FROM = 250, HIGHEST = 800;

/**
 * How far the sea has come up over the land since it was made: nothing inland of the coast, more out
 * over the shelf, more again beyond it, and more over the bay. The sea comes in as far as the land lies
 * under it, so its shore is where the land's own shape meets it: valleys drowned into inlets, hills left
 * standing as headlands and islands.
 */
function drownAt(p: WorldPlan, zn: Zones): number {
  return 35 * smooth((0.15 * p.shelf - zn.d0) / (0.9 * p.shelf)) + 70 * smooth((-zn.d0 - p.shelf) / 700) + 30 * zn.bay;
}

/**
 * Crests on the high ground, in metres: ridged noise at two sizes, nothing below 120 metres and all of it from some 470 up. Lifted and
 * worn by its rivers alone the high ground came out in round ridges like worms, all alike, combed by the drops into gullies just as
 * alike ("I would also prefer the landscape mountains to be a bit more rugged and sharp than round fell style"); crests and spurs
 * of their own, sharp and irregular, as harder and softer rock would leave them, break that up, and the drops wear fewer gullies
 * into them. (Tried on a crop of the mountains against making the rivers' valleys closer and the creep less, which only folded the
 * mountains into an even maze, and against sharpening the land as it was, which did little.)
 */
function crestsAt(x: number, z: number, y: number, seed: number): number {
  const w = smooth((y - 120) / 350);
  return w <= 0 ? 0 : w * (100 * (ridgedFbm(x / 380 + 4.1, z / 380 - 2.3, 4, seed + 92) - 0.45) + 35 * (ridgedFbm(x / 150 - 1.7, z / 150 + 3.2, 3, seed + 93) - 0.45));
}

/** Detail finer than the lifted land holds, in metres: some where the ground is gentle and more where it is steep. */
function detailAt(x: number, z: number, slope: number, scale: number, seed: number): number {
  // (Next to nothing on level ground: on a valley's floor, which the rivers leave graded and nearly level, more dammed it with sills
  // into lakes one after another all down the valley.)
  return (0.06 + 0.94 * smooth(slope / 0.6)) * scale * landDetail(x, z, scale * 18, seed);
}

/** How the world's lattice is worn: deep for its size, so that rivers cut real valleys into the upland and the range. */
export const WORLD_WEAR: Wear = {
  // (Building up no more than six metres anywhere, and putting down less: with eighteen, the rivers built fans where they came out
  // into the bay, all at that height, which drew as flat wedges fanning out from the bay's head.)
  // (A third as many drops, wearing three points wide and following the ground more closely, and building up no more than a metre:
  // a drop to every point, two wide, combed every slope of the fells and mountains into gullies all alike and close together, "too
  // frequent and uniform"; fewer and broader, they gather into fewer gullies of different sizes. And where a drop ran up the far side
  // of a valley's floor it put down all it carried at once, a line of it along every valley; built up no more than a metre, it is gone.)
  cut: 40, fill: 1,
  water: { drops: 0.35, life: 90, inertia: 0.05, capacity: 0.5, erode: 0.15, deposit: 0.04, evaporate: 0.012, gravity: 4, radius: 3, most: 1.5 },
  frost: { passes: 2, repose: 1.3, rate: 0.4 },
};
/** How a tile is worn: lightly, over the world's own wear. */
export const TILE_WEAR: Wear = {
  // (Lightly: the world's lattice has been worn already, and a tile only adds what is finer. Worn as hard again, a drop to every point
  // of five metres, it combed every slope a second time, closer still.)
  cut: 8, fill: 1,
  water: { drops: 0.12, life: 80, inertia: 0.05, capacity: 0.5, erode: 0.08, deposit: 0.04, evaporate: 0.012, gravity: 4, radius: 4, most: 1.5 },
  frost: { passes: 2, repose: 1.5, rate: 0.4 },
};

/** What grows or lies at a point, as the world's lattice has it. */
export const COVER = { sea: 0, lake: 1, shore: 2, marsh: 3, fields: 4, pasture: 5, forest: 6, moor: 7, rock: 8, snow: 9 } as const;

export interface WorldPlace {
  kind: 'island' | 'valley' | 'mountain' | 'coast';
  /** Its number among places of its kind, from 1, best first; and its name. */
  n: number;
  name: string;
  /** Where it is (the middle of the house's ground, or the summit), and the height there. */
  x: number; z: number; y: number;
  /** How well it suits: higher is better. */
  score: number;
  /** For an island: as found in its tile, in the world's coordinates. */
  island?: IslandSpot;
  /** For a valley head: as found, its course in the world's coordinates. */
  valley?: ValleySpot;
  /** For a coastal town: as the town's search found it (`findTowns`), in the world's coordinates; `x` and `z` are the middle of its quay. */
  town?: TownSpot;
  /** For a mountain top: which way its ridge runs down (an angle from east towards south), and where its foot is. */
  ridge?: { angle: number; foot: [number, number]; footY: number };
  /** The house's ground, fitted to the land found: levelled, or terraced (`fit.ts`). */
  ground?: Ground;
  /** For an island: where one lands, on the gentlest shore near the house, and how steep the shore is there. */
  landing?: { x: number; z: number; slope: number };
}

export interface Town { kind: 'harbour' | 'town' | 'village'; name: string; x: number; z: number; y: number }
export interface WorldWay { kind: 'road' | 'track' | 'path' | 'ferry'; points: [number, number][] }
export interface River { points: [number, number][]; width: number[] }

export interface World {
  plan: WorldPlan;
  /** Its name; the names of its sea, its bay, its upland and its range; and of each great peak, in the order of `peaks`. */
  name: string;
  regions: { sea: string; bay: string; upland: string; range: string };
  peakNames: string[];
  /** The great peaks, found: the highest summits, well apart, which a map names; and their names are `peakNames`, in the same order. */
  peaks: { x: number; z: number; y: number }[];
  /** The land, worn; and as it was shaped before it was worn. */
  field: HeightField;
  shaped: HeightField;
  /** 1 where the sea is; where a lake stands, its surface (else 0); what lies at each point (`COVER`). */
  sea: Uint8Array;
  lake: Float32Array;
  /**
   * The lakes, each as a body of water: a point in it, the level of its surface, and its shore as a ring of points round that point
   * (where a ray from it first leaves the lake, a few metres out over the shore: the water shows only where the land is under it).
   */
  lakes: { x: number; z: number; level: number; outline: [number, number][] }[];
  cover: Uint8Array;
  /** How much ground drains through each point, square metres; and where it drains to next (-1 into the sea or off the world). */
  acc: Float32Array;
  down: Int32Array;
  rivers: River[];
  places: WorldPlace[];
  towns: Town[];
  ways: WorldWay[];
  /** How long each stage took, milliseconds; and why candidates were turned down, by kind. */
  timing: Record<string, number>;
  why: Record<string, Record<string, number>>;
}

/** The world's lattice: 8 metres (751 points by 1,251 for a world of six kilometres by ten). */
const CELL = 8;
/** A river on the map from forty hectares of ground draining through it. */
export const RIVER = 4e5;

/**
 * Where water goes on a lattice: hollows filled to where they spill (flooded from the outlets
 * inward, lowest first), then from each point to its steepest neighbour downhill. Outlets are the
 * points marked in `outlet` and the lattice's edge.
 */
export function drain(f: HeightField, outlet?: Uint8Array): { filled: Float32Array; acc: Float32Array; down: Int32Array } {
  const nx = f.nx, nz = f.nz, n = nx * nz, h = f.data, filled = new Float32Array(n), seen = new Uint8Array(n), order = new Int32Array(n);
  const heap = new Int32Array(n), key = new Float32Array(n);
  let size = 0, popped = 0;
  const push = (k: number, y: number) => {
    let i = size++;
    heap[i] = k; key[i] = y;
    while (i > 0) { const pa = (i - 1) >> 1; if (key[pa] <= key[i]) break; const tk = heap[pa], ty = key[pa]; heap[pa] = heap[i]; key[pa] = key[i]; heap[i] = tk; key[i] = ty; i = pa; }
  };
  const pop = () => {
    const top = heap[0];
    size--;
    if (size > 0) {
      heap[0] = heap[size]; key[0] = key[size];
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < size && key[l] < key[m]) m = l;
        if (r < size && key[r] < key[m]) m = r;
        if (m === i) break;
        const tk = heap[m], ty = key[m]; heap[m] = heap[i]; key[m] = key[i]; heap[i] = tk; key[i] = ty; i = m;
      }
    }
    return top;
  };
  for (let k = 0; k < n; k++) {
    const i = k % nx, j = (k - i) / nx;
    if ((outlet && outlet[k]) || i === 0 || j === 0 || i === nx - 1 || j === nz - 1) { filled[k] = h[k]; seen[k] = 1; push(k, h[k]); }
  }
  while (size) {
    const k = pop(), i = k % nx, j = (k - i) / nx;
    order[popped++] = k;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if ((!di && !dj) || ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const q = jj * nx + ii;
      if (seen[q]) continue;
      // (A hair above the point it was reached from, so that water still knows which way to go across a filled flat.)
      seen[q] = 1; filled[q] = Math.max(h[q], filled[k] + 1e-3); push(q, filled[q]);
    }
  }
  const acc = new Float32Array(n).fill(f.cell * f.cell), down = new Int32Array(n).fill(-1);
  // (Highest first: the reverse of the order the points were flooded in, so each passes on what it has gathered before its neighbour downhill does.)
  for (let o = n - 1; o >= 0; o--) {
    const k = order[o];
    if (outlet && outlet[k]) continue;
    const i = k % nx, j = (k - i) / nx;
    let low = -1, best = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if ((!di && !dj) || ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const q = jj * nx + ii, drop = (filled[k] - filled[q]) / (di && dj ? Math.SQRT2 : 1);
      if (drop > best) { best = drop; low = q; }
    }
    if (low >= 0) { down[k] = low; acc[low] += acc[k]; }
  }
  return { filled, acc, down };
}

/**
 * Lets hollows drain, as rivers do: where a hollow is deeper than `deepest`, an outlet is cut from
 * its lowest point along the way the water would go, out through where it would spill, until the
 * ground beyond falls away below the cut on its own; low enough that what water stands in the
 * hollow afterwards is no deeper than `deepest`. Shallower hollows are left to fill, as lakes.
 * Three times over, since cutting one hollow can leave others inside it.
 */
export function breach(f: HeightField, outlet: Uint8Array, deepest: number): void {
  const h = f.data, nx = f.nx, n = h.length;
  for (let pass = 0; pass < 3; pass++) {
    const { filled, down } = drain(f, outlet), seen = new Uint8Array(n);
    let cut = 0;
    for (let s = 0; s < n; s++) {
      if (seen[s] || outlet[s] || filled[s] - h[s] < 0.5) continue;
      // The hollow: its points, and the lowest of them.
      const cells = [s];
      seen[s] = 1;
      let pit = s;
      for (let c = 0; c < cells.length; c++) {
        const k = cells[c], i = k % nx;
        if (h[k] < h[pit]) pit = k;
        for (const m of [k - nx, k + nx, i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1]) {
          if (m < 0 || m >= n || seen[m] || outlet[m] || filled[m] - h[m] < 0.5) continue;
          seen[m] = 1; cells.push(m);
        }
      }
      if (filled[pit] - h[pit] <= deepest) continue;
      cut++;
      const level = h[pit] + deepest;
      for (let k = down[pit], m = 1; k >= 0 && !outlet[k]; k = down[k], m++) {
        const want = level - 1e-3 * m;
        if (h[k] <= want && filled[k] - h[k] < 0.5) break;
        if (h[k] > want) h[k] = want;
      }
    }
    if (!cut) break;
  }
}

/** A worn lattice, keeping its shape from before the wear as well. */
function wear(f: HeightField, rng: Rng, w: Wear, keep?: Float32Array): HeightField {
  const shaped = new HeightField(f.x0, f.z0, f.cell, f.nx, f.nz);
  shaped.data.set(f.data);
  wearByWater(f, rng, { ...w.water, keep });
  for (let k = 0; k < f.data.length; k++) { const free = keep ? 1 - keep[k] : 1; f.data[k] = Math.max(shaped.data[k] - w.cut * free, Math.min(shaped.data[k] + w.fill * free, f.data[k])); }
  wearByFrost(f, w.frost.passes, w.frost.repose, w.frost.rate, keep);
  return shaped;
}

/** A tile of the finer lattice: five metres, 2.4 kilometres square, in coordinates of its own about its middle (`ox`, `oz` in the world). */
export interface Tile { i: number; j: number; ox: number; oz: number; field: HeightField; acc: Float32Array; down: Int32Array }
/** The tiles' grid: a tile every two kilometres, each reaching two hundred metres over its neighbours on every side, on a lattice of 5 metres, as the islands' and the valleys' own frames are. */
export const TILE = { cell: 5, n: 481, stride: 2000, over: 200 };

const TILES = new Map<string, Tile>();
/** The tile at (`i`, `j`) of a world: made when first asked for, and kept. */
export function worldTile(w: World, i: number, j: number): Tile {
  const key = `${w.plan.seed}/${w.plan.hx}x${w.plan.hz}/${i},${j}`;
  let t = TILES.get(key);
  if (t) return t;
  const p = w.plan, half = ((TILE.n - 1) * TILE.cell) / 2;
  const ox = -p.hx + TILE.stride / 2 + i * TILE.stride, oz = -p.hz + TILE.stride / 2 + j * TILE.stride;
  const f = new HeightField(-half, -half, TILE.cell, TILE.n, TILE.n), keep = new Float32Array(TILE.n * TILE.n);
  // Its shape: the world's land, worn as it is, with detail laid on finer than the world's lattice holds; worn again here at its own scale.
  for (let jj = 0; jj < TILE.n; jj++) for (let ii = 0; ii < TILE.n; ii++) {
    const x = ox + f.x0 + ii * TILE.cell, z = oz + f.z0 + jj * TILE.cell, k = jj * TILE.n + ii;
    const slope = Math.hypot(w.field.smoothAt(x + 8, z) - w.field.smoothAt(x - 8, z), w.field.smoothAt(x, z + 8) - w.field.smoothAt(x, z - 8)) / 16;
    const y = w.field.smoothAt(x, z) + detailAt(x, z, slope, 1.5, p.n + 91);
    f.data[k] = y;
    // (The sea's floor is spared: what the water brought down would otherwise build it up into flats and false islands.)
    keep[k] = 0.8 * smooth((-y - 1) / 6);
  }
  // (Nor the lakes: the drops dropped what they carried in the still water, and filled every lake some ten metres over its surface,
  // so that a lake drawn about a place lay under the land. Spared where the world has a lake, and less so for twenty metres or so
  // about it, so that its shore is worn land and not a step; putting the bed back after the wear left a bank ten metres high.)
  const L = w.field, lakeCell = (li: number, lj: number) => (li < 0 || lj < 0 || li >= L.nx || lj >= L.nz ? 0 : w.lake[lj * L.nx + li]);
  const inLake = (x: number, z: number) => {
    const fx = (x - L.x0) / L.cell, fz = (z - L.z0) / L.cell, li = Math.floor(fx), lj = Math.floor(fz), tx = fx - li, tz = fz - lj;
    const at = (a: number, b: number) => (lakeCell(a, b) > 0 ? 1 : 0);
    return (at(li, lj) * (1 - tx) + at(li + 1, lj) * tx) * (1 - tz) + (at(li, lj + 1) * (1 - tx) + at(li + 1, lj + 1) * tx) * tz;
  };
  const levelAt = (x: number, z: number) => lakeCell(Math.round((x - L.x0) / L.cell), Math.round((z - L.z0) / L.cell));
  for (let jj = 0; jj < TILE.n; jj++) for (let ii = 0; ii < TILE.n; ii++) {
    const x = ox + f.x0 + ii * TILE.cell, z = oz + f.z0 + jj * TILE.cell, k = jj * TILE.n + ii;
    let soft = 0;
    for (const dz of [-12, 0, 12]) for (const dx of [-12, 0, 12]) soft += inLake(x + dx, z + dz) / 9;
    if (soft > 0) keep[k] = Math.max(keep[k], smooth((soft - 0.1) / 0.6));
  }
  wear(f, new Rng(`world/${p.seed}/tile/${i},${j}`), TILE_WEAR, keep);
  // (The water's ways worked out over the lakes' surfaces, as water runs, not down into their beds.)
  const surface = new HeightField(f.x0, f.z0, f.cell, f.nx, f.nz);
  surface.data.set(f.data);
  for (let jj = 0; jj < TILE.n; jj++) for (let ii = 0; ii < TILE.n; ii++) {
    const k = jj * TILE.n + ii, level = levelAt(ox + f.x0 + ii * TILE.cell, oz + f.z0 + jj * TILE.cell);
    if (level > 0) surface.data[k] = Math.max(surface.data[k], level);
  }
  const outlet = new Uint8Array(TILE.n * TILE.n);
  for (let k = 0; k < outlet.length; k++) outlet[k] = f.data[k] < 0 ? 1 : 0;
  const { acc, down } = drain(surface, outlet);
  t = { i, j, ox, oz, field: f, acc, down };
  TILES.set(key, t);
  return t;
}

/** The ground a house's spot is looked for with: about the size of an island's or a valley's level ground. */
const HOUSE = { w: 46, d: 62 }, VALLEY_LENGTH = 260;
/**
 * The most land an island may have, in square metres, to be built whole as a place: 25 hectares. (Built whole, its cost grows faster
 * than its land: 7 hectares built in 41 seconds with half a million triangles of rock, 14 in 71 with nine hundred thousand, 55 in
 * eight minutes with six and a half million. An island drawn by the game itself, some 20 hectares, has 1.6 million.)
 */
const ISLAND_MOST = 25e4;
/** How many places of each kind are kept; and how many tiles of each kind are searched at most for them (the richest first, stopping when there are enough). */
const SEARCH = { isleTiles: 8, uplandTiles: 8, keep: 4 };

const WORLDS = new Map<string, World>();

/** The world of a seed: made when first asked for, and kept. */
export function world(seed: string, size: { x: number; z: number } = WORLD_SIZE): World {
  const steps = worldSteps(seed, size);
  for (;;) { const s = steps.next(); if (s.done) return s.value; }
}

/** The world made a stage at a time: each `yield` says what is being done next, so a page can paint between stages. */
export function* worldSteps(seed: string, size: { x: number; z: number } = WORLD_SIZE): Generator<string, World> {
  const key = `${seed}@${size.x}x${size.z}`, had = WORLDS.get(key);
  if (had) return had;
  const p = planWorld(seed, size), rng = new Rng(`world/${seed}`), timing: Record<string, number> = {}, why: Record<string, Record<string, number>> = { island: {}, valley: {}, mountain: {}, coast: {} };
  let t0 = performance.now();
  const lap = (k: string) => { const t = performance.now(); timing[k] = Math.round(t - t0); t0 = t; };
  yield 'Lifting the land, and letting the rivers wear it';
  // The land is made on a lattice of 24 metres: lifted as the zones say, worn by its rivers, which end in the open sea beyond the shelf.
  // It starts nearly level, a little higher inland and a little uneven, so that the rivers have somewhere to begin.
  const LX = Math.round((2 * p.hx) / LIFT.cell) + 1, LZ = Math.round((2 * p.hz) / LIFT.cell) + 1;
  const g = new HeightField(-p.hx, -p.hz, LIFT.cell, LX, LZ), uplift = new Float32Array(LX * LZ), outlet = new Uint8Array(LX * LZ);
  for (let j = 0; j < LZ; j++) for (let i = 0; i < LX; i++) {
    const x = g.x0 + i * LIFT.cell, z = g.z0 + j * LIFT.cell, k = j * LX + i, d0 = zonesAt(p, x, z).d0;
    uplift[k] = upliftAt(p, x, z);
    outlet[k] = d0 < -p.shelf ? 1 : 0;
    g.data[k] = outlet[k] ? 0 : 1 + Math.max(0, d0) * 0.002 + 3 * (0.5 + fbmd(x / 600, z / 600, 3, p.n + 86));
  }
  liftAndErode(g, uplift, outlet, LIFT);
  // (Brought to the height wanted: the highest three points in a thousand at `TOP`, every height in the same proportion, so the
  // rivers' courses and the falls along them stay as they were made; then the mountains raised, the ground over `STRETCH_FROM` the
  // more the higher it stands, until the highest summit is at `HIGHEST`. Raising only ever adds, the more the higher, so nothing
  // that drained stops draining.)
  {
    const sorted = Float32Array.from(g.data).sort(), top = sorted[Math.floor(sorted.length * 0.997)], scale = TOP / Math.max(1, top);
    let high = 0;
    for (let k = 0; k < g.data.length; k++) { g.data[k] *= scale; high = Math.max(high, g.data[k]); }
    const over = Math.max(1e-6, Math.pow((high - STRETCH_FROM) / 400, 1.5)), raise = Math.max(0, (HIGHEST - high) / over);
    for (let k = 0; k < g.data.length; k++) if (g.data[k] > STRETCH_FROM) g.data[k] += raise * Math.pow((g.data[k] - STRETCH_FROM) / 400, 1.5);
  }
  lap('lift');
  yield 'Shaping the land';
  // On the world's lattice of 8 metres: the lifted land, with detail on it finer than it holds, and the sea come up over it.
  const NX = Math.round((2 * p.hx) / CELL) + 1, NZ = Math.round((2 * p.hz) / CELL) + 1;
  const f = new HeightField(-p.hx, -p.hz, CELL, NX, NZ), keep = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = f.x0 + i * CELL, z = f.z0 + j * CELL, k = j * NX + i;
    const slope = Math.hypot(g.smoothAt(x + 12, z) - g.smoothAt(x - 12, z), g.smoothAt(x, z + 12) - g.smoothAt(x, z - 12)) / 24;
    const y0 = g.smoothAt(x, z);
    f.data[k] = y0 + detailAt(x, z, slope, 4, p.n + 90) + crestsAt(x, z, y0, p.n) - drownAt(p, zonesAt(p, x, z));
    // (The floor of the sea is spared the wear: what the water brought down would build it up into flats and false islands.)
    keep[k] = smooth(-f.data[k] / 15);
  }
  lap('shape');
  yield 'Wearing it with water and frost';
  const shaped = wear(f, rng.fork('wear'), WORLD_WEAR, keep);
  lap('wear');
  yield 'Following the water';
  const n = NX * NZ, h = f.data, sea = new Uint8Array(n);
  {
    // The sea: whatever lies below its level and is joined to the world's edge by more of the same.
    const q: number[] = [];
    for (let k = 0; k < n; k++) { const i = k % NX, j = (k - i) / NX; if ((i === 0 || j === 0 || i === NX - 1 || j === NZ - 1) && h[k] < 0) { sea[k] = 1; q.push(k); } }
    for (let c = 0; c < q.length; c++) {
      const k = q[c], i = k % NX, j = (k - i) / NX;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj, m = jj * NX + ii;
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ || sea[m] || h[m] >= 0) continue;
        sea[m] = 1; q.push(m);
      }
    }
  }
  // (Hollows deeper than four metres have an outlet cut down to four metres over their floor, as a river cuts through a sill; what
  // water stands in them then, and in the shallower ones, are lochs.)
  breach(f, sea, 4);
  const { filled, acc, down } = drain(f, sea);
  const lake = new Float32Array(n);
  // (No lake below the sea's level: a hollow there, shut off from the sea, is land, wet.)
  for (let k = 0; k < n; k++) if (!sea[k] && filled[k] - h[k] > 0.8 && filled[k] > 0.3) lake[k] = filled[k];
  // (A lake of a few points is a hollow the wear left, not a lake: let it go.)
  const lakes: World['lakes'] = [], body = new Int32Array(n);
  {
    const seen = new Uint8Array(n);
    for (let s = 0; s < n; s++) {
      if (!lake[s] || seen[s]) continue;
      const cells = [s];
      seen[s] = 1;
      for (let c = 0; c < cells.length; c++) {
        const k = cells[c], i = k % NX, j = (k - i) / NX;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj, m = jj * NX + ii;
          if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ || seen[m] || !lake[m]) continue;
          seen[m] = 1; cells.push(m);
        }
      }
      if (cells.length < 40) { for (const k of cells) lake[k] = 0; continue; }
      // (As a body of water, for whoever draws it: from the point of it nearest its middle, its shore along forty-eight rays.)
      for (const k of cells) body[k] = lakes.length + 1;
      let cx = 0, cz = 0;
      for (const k of cells) { cx += f.x0 + (k % NX) * CELL; cz += f.z0 + Math.floor(k / NX) * CELL; }
      cx /= cells.length; cz /= cells.length;
      let o = cells[0], od = Infinity;
      for (const k of cells) { const d = Math.hypot(f.x0 + (k % NX) * CELL - cx, f.z0 + Math.floor(k / NX) * CELL - cz); if (d < od) { od = d; o = k; } }
      const ox = f.x0 + (o % NX) * CELL, oz = f.z0 + Math.floor(o / NX) * CELL, id = lakes.length + 1, outline: [number, number][] = [];
      const inLake = (x: number, z: number) => { const i = Math.round((x - f.x0) / CELL), j = Math.round((z - f.z0) / CELL); return i >= 0 && j >= 0 && i < NX && j < NZ && body[j * NX + i] === id; };
      for (let a = 0; a < 48; a++) {
        const ux = Math.cos((a / 48) * TAU), uz = Math.sin((a / 48) * TAU);
        let r = 0;
        while (r < 4000 && inLake(ox + ux * (r + 4), oz + uz * (r + 4))) r += 4;
        outline.push([Math.round(ox + ux * (r + 10)), Math.round(oz + uz * (r + 10))]);
      }
      lakes.push({ x: ox, z: oz, level: Math.round(lake[s] * 100) / 100, outline });
    }
  }
  const rivers = traceRivers(f, sea, acc, down);
  lap('water');
  yield 'Seeing what grows';
  const cover = coverOf(p, f, sea, lake, acc);
  lap('cover');
  const w: World = { plan: p, name: '', regions: { sea: '', bay: '', upland: '', range: '' }, peakNames: [], peaks: [], field: f, shaped, sea, lake, lakes, cover, acc, down, rivers, places: [], towns: [], ways: [], timing, why };

  // ---- the places
  // Valley heads, in the tiles where the upland is; islands on the world's own lattice, where none crosses a tile's edge.
  const tilesX = Math.round((2 * p.hx) / TILE.stride), tilesZ = Math.round((2 * p.hz) / TILE.stride);
  const isleTiles: { i: number; j: number; score: number }[] = [], uplandTiles: { i: number; j: number; score: number }[] = [];
  for (let j = 0; j < tilesZ; j++) for (let i = 0; i < tilesX; i++) {
    let isle = 0, up = 0, all = 0;
    const cx = -p.hx + TILE.stride / 2 + i * TILE.stride, cz = -p.hz + TILE.stride / 2 + j * TILE.stride;
    for (let z = cz - TILE.stride / 2; z < cz + TILE.stride / 2; z += 80) for (let x = cx - TILE.stride / 2; x < cx + TILE.stride / 2; x += 80) {
      const zn = zonesAt(p, x, z), y = f.at(x, z);
      all++;
      if ((zn.wI > 0.5 || zn.bay > 0.3) && y > -12) isle++;
      if (zn.wU > 0.6 && y > 20) up++;
    }
    if (isle / all > 0.04) isleTiles.push({ i, j, score: isle / all });
    if (up / all > 0.3) uplandTiles.push({ i, j, score: up / all });
  }
  isleTiles.sort((a, b) => b.score - a.score); uplandTiles.sort((a, b) => b.score - a.score);
  const valleys: WorldPlace[] = [];
  // (Only in the tile's own two kilometres, what lies in its overlap being the neighbour's; and four hundred metres in from the world's
  // edge at least, so that what is seen from a place is the world's own.)
  const core = (t: Tile, x: number, z: number) => Math.abs(x - t.ox) <= TILE.stride / 2 && Math.abs(z - t.oz) <= TILE.stride / 2 && Math.abs(x) < p.hx - 400 && Math.abs(z) < p.hz - 400;
  yield 'Looking for islands';
  const isles = findIslandGrounds(w, why.island);
  lap('isles');
  for (const { i, j } of uplandTiles.slice(0, SEARCH.uplandTiles)) {
    if (valleys.length >= SEARCH.keep) break;
    yield `Looking for valleys (${valleys.length} so far)`;
    const t = worldTile(w, i, j);
    const spots = findValleys({ seed: 0, inner: t.field, outer: t.field, acc: t.acc, down: t.down }, HOUSE.w, HOUSE.d, VALLEY_LENGTH, rng.fork(`glens ${i},${j}`), why.valley);
    // (Found best first; many lie a few points apart along the same stream.)
    let rank = 0;
    for (const s of spots) {
      const x = s.u + t.ox, z = s.v + t.oz;
      if (!core(t, x, z) || zonesAt(p, x, z).wU < 0.5) continue;
      if (valleys.some((o) => Math.hypot(o.x - x, o.z - z) < 700)) continue;
      const spot: ValleySpot = { ...s, u: x, v: z, course: s.course.map(([a, b]) => [a + t.ox, b + t.oz]) };
      // (Its ground fitted where the search put it, turned down the valley, levelled or terraced.)
      const g = fitGround((gx, gz) => t.field.at(gx - t.ox, gz - t.oz), x, z, s.turn, HOUSE.w, HOUSE.d);
      if (g.work > 3) { why.valley['too rough to build on'] = (why.valley['too rough to build on'] ?? 0) + 1; continue; }
      valleys.push({ kind: 'valley', n: 0, name: '', x, z, y: g.terraces[g.terraces.length - 1].y, score: 10 - rank++ - g.work, valley: spot, ground: g });
      if (rank >= 4) break;
    }
    lap(`glens ${i},${j}`);
  }
  // Islands: the best place on each island found; the best islands first.
  const keptIsles = isles.sort((a, b) => b.score - a.score);
  yield 'Looking for mountain tops';
  const summits = findSummits(w, why.mountain);
  lap('summits');
  yield 'Looking for coastal towns';
  const coasts = findCoastalTowns(w, why.coast, rng.fork('coast'));
  lap('coast');
  const number = (list: WorldPlace[]) => list.slice(0, SEARCH.keep).map((q, k) => ({ ...q, n: k + 1 }));
  w.places = [...number(keptIsles), ...number(valleys.sort((a, b) => b.score - a.score)), ...number(summits), ...number(coasts)];

  // ---- towns and the ways between them
  yield 'Settling the low country';
  w.towns = settle(w, rng.fork('towns'));
  lap('towns');
  yield 'Laying roads';
  w.ways = layWays(w);
  lap('ways');
  // ---- names, each from a stream keyed by what it names, so that a world's names stay as they are while its places do
  const namer = new Namer(rng.fork('names'));
  w.name = namer.name('world');
  w.regions = { sea: namer.name('sea'), bay: namer.name('bay'), upland: namer.name('upland'), range: namer.name('range') };
  w.peaks = highestSummits(w, 3);
  // (Each keyed by what it names and where, to fifty metres, so that it keeps its name whatever else is found or lost.)
  const at = (x: number, z: number) => `${Math.round(x / 50)},${Math.round(z / 50)}`;
  w.peakNames = w.peaks.map((q) => namer.name('peak', `peak ${at(q.x, q.z)}`));
  for (const t of w.towns) t.name = namer.name(t.kind, `${t.kind} ${at(t.x, t.z)}`);
  // (A coastal town is named as a harbour is.)
  for (const q of w.places) q.name = namer.name(q.kind === 'coast' ? 'harbour' : q.kind, `${q.kind} ${at(q.x, q.z)}`);
  WORLDS.set(key, w);
  return w;
}

/** Rivers as lines, from where forty hectares drain through a point down to the sea, a lake's still water, or where one joins another. */
function traceRivers(f: HeightField, sea: Uint8Array, acc: Float32Array, down: Int32Array): River[] {
  const n = f.nx * f.nz, nx = f.nx, inflow = new Uint8Array(n), done = new Uint8Array(n), out: River[] = [];
  for (let k = 0; k < n; k++) if (acc[k] >= RIVER && down[k] >= 0) inflow[down[k]]++;
  const at = (k: number): [number, number] => [f.x0 + (k % nx) * f.cell, f.z0 + Math.floor(k / nx) * f.cell];
  // (Width on the map, in metres: a burn a metre or two, a river at its mouth twenty and more.)
  const width = (a: number) => Math.min(25, 1.5 + 3 * Math.sqrt(a / RIVER));
  for (let s = 0; s < n; s++) {
    if (acc[s] < RIVER || inflow[s] || sea[s]) continue;
    const pts: [number, number][] = [], wd: number[] = [];
    let k = s;
    for (;;) {
      pts.push(at(k)); wd.push(width(acc[k]));
      if (done[k] || sea[k] || down[k] < 0) break;
      done[k] = 1;
      k = down[k];
    }
    if (pts.length > 2) {
      // (Smoothed, so a river on the map does not go in steps of the lattice; its widths follow it.)
      const line = smoothLine(pts, 2), widths = line.map((_, i) => wd[Math.min(wd.length - 1, Math.round((i / (line.length - 1)) * (wd.length - 1)))]);
      out.push({ points: line, width: widths });
    }
  }
  return out;
}

/** What lies at each point: water, shore, marsh, fields, pasture, forest, moor, rock or snow, from height, slope, wet and the zone. */
function coverOf(p: WorldPlan, f: HeightField, sea: Uint8Array, lake: Float32Array, acc: Float32Array): Uint8Array {
  const n = f.nx * f.nz, nx = f.nx, h = f.data, out = new Uint8Array(n), C = COVER;
  for (let k = 0; k < n; k++) {
    if (sea[k]) { out[k] = C.sea; continue; }
    if (lake[k]) { out[k] = C.lake; continue; }
    const i = k % nx, j = (k - i) / nx, x = f.x0 + i * f.cell, z = f.z0 + j * f.cell, y = h[k];
    const il = Math.max(0, i - 1), ir = Math.min(nx - 1, i + 1), jl = Math.max(0, j - 1), jr = Math.min(f.nz - 1, j + 1);
    const slope = Math.hypot((h[j * nx + ir] - h[j * nx + il]) / ((ir - il) * f.cell), (h[jr * nx + i] - h[jl * nx + i]) / ((jr - jl) * f.cell));
    let bySea = false;
    for (const m of [k - 1, k + 1, k - nx, k + nx]) if (m >= 0 && m < n && sea[m]) bySea = true;
    const tree = 300 + 60 * fbmd(x / 2000, z / 2000, 2, p.n + 51), snow = 700 + 40 * fbmd(x / 2000 + 3, z / 2000, 2, p.n + 52);
    const zn = zonesAt(p, x, z);
    // (Above the trees, heath and rough grazing, broken by rock where it is steep or high; snow lies late only on the great peaks.)
    if (y > snow && slope < 1.1) out[k] = C.snow;
    else if (slope > 0.75 || y > tree + 250 + 60 * fbmd(x / 500, z / 500, 2, p.n + 55)) out[k] = C.rock;
    else if (y > tree) out[k] = C.moor;
    else if (bySea && y < 6 && slope < 0.3) out[k] = C.shore;
    else if (y < 12 && slope < 0.02 && acc[k] > 2e4) out[k] = C.marsh;
    else {
      // Fields on gentle low ground, woods on slopes and in patches, thinning out up the upland, whose higher ground is
      // mostly heath and rough grazing, with the woods down in its glens.
      const arable = (slope < 0.07 ? 1 : 0) * (1 - smooth((y - 90) / 60)) * (1 - zn.wR);
      const woods = fbmd(x / 900 + 7, z / 900, 4, p.n + 53) + 0.3 * smooth((slope - 0.12) / 0.3) - 0.18 * arable - 0.5 * smooth((y - 70) / 150) * (zn.wU + zn.wR);
      if (woods > 0.14) out[k] = C.forest;
      else if (arable > 0.5 && fbmd(x / 600 - 3, z / 600, 3, p.n + 54) > -0.12) out[k] = C.fields;
      else if (zn.wU + zn.wR > 0.5 && y > tree - 80) out[k] = C.moor;
      else out[k] = C.pasture;
    }
  }
  return out;
}

/** The highest summits of a world, up to `count`, each the highest ground within a kilometre: the great peaks, as they came out. */
function highestSummits(w: World, count: number): { x: number; z: number; y: number }[] {
  const f = w.field, h = f.data, NX = f.nx, NZ = f.nz, R = Math.round(1000 / CELL), out: { x: number; z: number; y: number }[] = [];
  const order = Array.from({ length: NX * NZ }, (_, k) => k).filter((k) => h[k] > 300).sort((a, b) => h[b] - h[a]);
  for (const k of order) {
    if (out.length >= count) break;
    const x = f.x0 + (k % NX) * CELL, z = f.z0 + Math.floor(k / NX) * CELL;
    if (out.some((q) => Math.hypot(q.x - x, q.z - z) < R * CELL)) continue;
    out.push({ x, z, y: h[k] });
  }
  void NZ;
  return out;
}

/**
 * Islands a house can stand on, as the land made them: every island of the world (land standing out
 * of the sea, apart from the mainland and from the world's edge) of three hectares or more, whatever its shape and size;
 * on each, the ground the house fits best (`fitGround`: levelled or terraced), well in from the cliffs,
 * near its landing and facing it; and the landing, the gentlest shore near the house. One to an island.
 * (Before, an island had to be of a size, round, with a shoulder at a set height, level within twelve
 * metres; few were.)
 */
function findIslandGrounds(w: World, why: Record<string, number>): WorldPlace[] {
  const no = (k: string) => { why[k] = (why[k] ?? 0) + 1; };
  const f = w.field, nx = f.nx, nz = f.nz, cell = f.cell, h = f.data, n = nx * nz, out: WorldPlace[] = [], p = w.plan;
  const t = { ox: 0, oz: 0 };
  const label = new Int32Array(n), far = new Float32Array(n);
  // How far each point of land lies from the sea.
  for (let k = 0; k < n; k++) far[k] = h[k] > 0.5 ? 1e6 : 0;
  for (let pass = 0; pass < 2; pass++) for (let o = 0; o < n; o++) {
    const k = pass ? n - 1 - o : o, i = k % nx, j = (k - i) / nx;
    if (!far[k]) continue;
    let m = far[k];
    for (const [di, dj, dd] of [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [1, 1, 1.414]] as const) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      m = Math.min(m, far[jj * nx + ii] + dd * cell);
    }
    far[k] = m;
  }
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (label[s] || h[s] <= 0.5) continue;
    const cells = [s];
    label[s] = ++next;
    let touches = false;
    for (let c = 0; c < cells.length; c++) {
      const k = cells[c], i = k % nx, j = (k - i) / nx;
      if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) touches = true;
      for (const m of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k - nx, k + nx]) {
        if (m < 0 || m >= n || label[m] || h[m] <= 0.5) continue;
        label[m] = next; cells.push(m);
      }
    }
    if (touches) { no('mainland, or at the world\'s edge'); continue; }
    // (Six hectares at the least: one of three or four, a hundred metres from its middle to its furthest shore, had no room for the house
    // and a cove, whatever the house.)
    if (cells.length * cell * cell < 6e4) { no('small'); continue; }
    let cu = 0, cv = 0, reach = 0;
    for (const k of cells) { cu += f.x0 + (k % nx) * cell; cv += f.z0 + Math.floor(k / nx) * cell; }
    cu /= cells.length; cv /= cells.length;
    for (const k of cells) reach = Math.max(reach, Math.hypot(f.x0 + (k % nx) * cell - cu, f.z0 + Math.floor(k / nx) * cell - cv));
    // (An island is built whole as a place, its cliffs all round and what grows over all of it: one of 55 hectares made six and a
    // half million triangles of rock and took eight minutes to build. Such a one is country, not a place: `ISLAND_MOST`.)
    if ((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.DBG_ISLES) console.log('  island: reach', Math.round(reach), 'area', Math.round((cells.length * cell * cell) / 1e4), 'ha');
    if (cells.length * cell * cell > ISLAND_MOST) { no('too large to build whole'); continue; }
    // The shore: where it is gentle enough to land and walk up (rising no more than six metres in the first fifteen), the landings.
    const shore: { x: number; z: number; slope: number }[] = [];
    for (const k of cells) {
      if (far[k] > cell * 1.5) continue;
      const i = k % nx, j = (k - i) / nx;
      let high = 0;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && label[jj * nx + ii] === next) high = Math.max(high, h[jj * nx + ii]); }
      shore.push({ x: f.x0 + i * cell, z: f.z0 + j * cell, slope: high / (2 * cell) });
    }
    // The house: wherever on the island its ground fits best, well in from the cliffs, a little up from the sea.
    const half = Math.hypot(HOUSE.w, HOUSE.d) / 2;
    let best: WorldPlace | null = null;
    for (let c = 0; c < cells.length; c += 3) {
      const k = cells[c];
      if (far[k] < half + 12 || h[k] < 5 || h[k] > 90) continue;
      const gx = f.x0 + (k % nx) * cell, gz = f.z0 + Math.floor(k / nx) * cell;
      // (Its landing: the nearest gentle shore, or the gentlest of all if none is gentle.)
      let land = shore[0], ld = Infinity;
      for (const q of shore) { const d = Math.hypot(q.x - gx, q.z - gz) * (q.slope < 0.4 ? 1 : 3 + q.slope); if (d < ld) { ld = d; land = q; } }
      if (!land) continue;
      const toLand = Math.atan2(land.z - gz, land.x - gx);
      for (let r = 0; r < 8; r++) {
        const turn = (r / 8) * TAU, g = fitGround((px, pz) => f.at(px, pz), gx, gz, turn, HOUSE.w, HOUSE.d);
        if (g.work > 2.5) continue;
        // (Facing its landing, as a house on an island faces the way people come: its front is the side at b = d/2.)
        const facing = Math.cos(toLand - (turn + Math.PI / 2));
        const score = -g.work * 2 - 0.4 * (g.terraces.length - 1) - Math.hypot(land.x - gx, land.z - gz) / 250 - (land.slope < 0.4 ? 0 : 1.5) + 0.4 * facing - Math.abs(g.terraces[g.terraces.length - 1].y - 25) / 40;
        if (best && score <= best.score) continue;
        const wx = gx + t.ox, wz = gz + t.oz;
        const spot: IslandSpot = { u: wx, v: wz, turn, base: g.terraces[g.terraces.length - 1].y, sea: 0, cu: cu + t.ox, cv: cv + t.oz, reach };
        best = { kind: 'island', n: 0, name: '', x: wx, z: wz, y: spot.base, score, island: spot, ground: { ...g, x: wx, z: wz }, landing: { x: land.x + t.ox, z: land.z + t.oz, slope: land.slope } };
      }
    }
    if (!best) { no('no ground a house fits'); continue; }
    // (Four hundred metres in from the world's edge, as every place is.)
    if (Math.abs(best.x) > p.hx - 400 || Math.abs(best.z) > p.hz - 400) { no('near the world\'s edge'); continue; }
    out.push(best);
  }
  return out;
}

/**
 * Summits for mountain tops: in the range, a summit with nothing as high within three hundred
 * metres, standing a hundred and eighty metres or more over the valleys a kilometre about it,
 * not on the flanks of a great peak, and with a ridge running down from it that a way could come
 * up: falling steadily for some four hundred and fifty metres, the ground lower on both hands.
 * (The mountain top as a site was made for a country three times as high; when it is fitted to
 * one of these, its cloud and the valleys under it come down to suit.)
 */
function findSummits(w: World, why: Record<string, number>): WorldPlace[] {
  const no = (k: string) => { why[k] = (why[k] ?? 0) + 1; };
  const f = w.field, h = f.data, p = w.plan, out: WorldPlace[] = [];
  // (Four hundred metres in from the world's edge, as the other places are; the window the ground joined to it is looked over in
  // stops at the edge. Kept a window's breadth from the edge, as first written for a larger world, half the range was never looked at.)
  const NX = f.nx, NZ = f.nz, R = Math.round(300 / CELL), W = Math.round(1200 / CELL), E = Math.round(400 / CELL), mark = new Int32Array(NX * NZ);
  let stamp = 0;
  for (let j = E; j < NZ - E; j++) for (let i = E; i < NX - E; i++) {
    const k = j * NX + i, y = h[k];
    if (y < 250) continue;
    let top = true;
    for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && h[k + dj * NX + di] > y) { top = false; break; }
    if (!top) continue;
    const x = f.x0 + i * CELL, z = f.z0 + j * CELL;
    if (zonesAt(p, x, z).wR < 0.5) { no('not in the range'); continue; }
    for (let dj = -R; dj <= R && top; dj++) for (let di = -R; di <= R; di++) if (di * di + dj * dj <= R * R && h[k + dj * NX + di] > y) { top = false; break; }
    if (!top) { no('higher near'); continue; }
    // It must stand alone over the cloud, which lies some forty metres under the top: the ground joined to it above that must hold
    // nothing higher, within twelve hundred metres.
    const cloud = y - 40, q = [k];
    mark[k] = ++stamp;
    let joined = false;
    for (let c = 0; c < q.length && !joined; c++) {
      const m = q[c], mi = m % NX, mj = (m - mi) / NX;
      for (const o of [m - 1, m + 1, m - NX, m + NX]) {
        if (o < 0 || o >= NX * NZ) continue;
        const oi = o % NX, oj = (o - oi) / NX;
        if (mark[o] === stamp || h[o] <= cloud) continue;
        if (Math.abs(oi - i) > W || Math.abs(oj - j) > W || Math.abs(oi - mi) > 1) continue;
        if (h[o] > y) { joined = true; break; }
        mark[o] = stamp; q.push(o);
      }
    }
    if (joined) { no('joined to higher over the cloud'); continue; }
    let low = Infinity;
    for (let a = 0; a < 24; a++) for (const r of [700, 900, 1100]) low = Math.min(low, f.at(x + Math.cos((a / 24) * TAU) * r, z + Math.sin((a / 24) * TAU) * r));
    if (y - low < 180) { no('not standing high'); continue; }
    // Its ridge: of the ways down, the one that falls most steadily along a crest. (The site's way comes up some three hundred
    // metres of ridge, falling a hundred; this asks for a ridge half as long again, the ground lower on both hands.)
    let best: { angle: number; score: number } | null = null;
    for (let s = 0; s < 32; s++) {
      const a = (s / 32) * TAU, cx = Math.cos(a), cz = Math.sin(a);
      let ok = true, sides = Infinity, prev = y;
      for (let t = 50; t <= 450 && ok; t += 50) {
        const lx = x + cx * t, lz = z + cz * t, ly = f.smoothAt(lx, lz);
        // (Down, or over a knoll on the way, and never down more than a crag would go.)
        if (ly > prev + 15 || prev - ly > 60) ok = false;
        prev = ly;
        if (t <= 400) for (const side of [-1, 1]) sides = Math.min(sides, ly - f.smoothAt(lx - cz * side * 100, lz + cx * side * 100));
      }
      const fallen = y - prev;
      if (!ok || sides < 6 || fallen < 40 || fallen > 320) continue;
      const score = Math.min(sides, 60) / 20 - Math.abs(fallen - 130) / 60;
      if (!best || score > best.score) best = { angle: a, score };
    }
    if (!best) { no('no ridge'); continue; }
    // The hospice's ground: on a shoulder of the ridge below the summit, its front turned down the ridge, fitted where it fits best.
    // (Well under the summit, so that it stands over the house as a summit does over a hospice in its saddle: the flattest ground
    // is on the summit's own dome, a few metres under it, and taken for that alone the summit was hardly a climb. Taken still if
    // there is nothing lower to build on.)
    let ground: Ground | null = null, groundCost = Infinity;
    for (let t = 40; t <= 320; t += 20) for (let off = -30; off <= 30; off += 15) {
      const gx = x + Math.cos(best.angle) * t - Math.sin(best.angle) * off, gz = z + Math.sin(best.angle) * t + Math.cos(best.angle) * off;
      const g = fitGround((px, pz) => f.smoothAt(px, pz), gx, gz, best.angle - Math.PI / 2, HOUSE.w, HOUSE.d);
      const under = y - g.terraces.reduce((a, q) => a + q.y, 0) / g.terraces.length;
      const cost = g.work + 0.4 * (g.terraces.length - 1) + Math.abs(t - 150) / 400 + 2 * smooth((50 - under) / 35);
      if (cost < groundCost) { groundCost = cost; ground = g; }
    }
    if (!ground || ground.work > 4) { no('no ground for the hospice'); continue; }
    const fx = x + Math.cos(best.angle) * 450, fz = z + Math.sin(best.angle) * 450;
    out.push({ kind: 'mountain', n: 0, name: '', ground, x, z, y, score: best.score + Math.min(350, y - low) / 110, ridge: { angle: best.angle, foot: [fx, fz], footY: f.smoothAt(fx, fz) } });
  }
  out.sort((a, b) => b.score - a.score);
  const kept: WorldPlace[] = [];
  for (const q of out) if (!kept.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 900)) kept.push(q);
  return kept;
}

/**
 * Coastal towns: where on the mainland's shore a harbour town would stand as the town is laid out (`town.ts`), judged by the town's
 * own search (`findTowns` in `coastland.ts`): open water before the quay, low ground behind it rising gently for a square and its
 * streets, the house's ground a few metres over the square, country rising behind; better with a headland beside it and land on
 * either hand, so that the harbour lies in a bay. Judged here on the world's lattice of eight metres, for a house of middling size;
 * the town built on it looks again close by, at five metres, for its own house (`layOutTown`).
 * (They were first sought where a stream came down to the shore, and built as a valley whose foot was the shore; but a harbour town
 * had been made meanwhile, in its own country, and that is what a coastal town is.)
 */
function findCoastalTowns(w: World, why: Record<string, number>, rng: Rng): WorldPlace[] {
  const f = w.field, nx = f.nx, n = nx * f.nz, p = w.plan;
  // The mainland: what is joined over dry land to the world's northern edge (the islands are not).
  const main = new Uint8Array(n), queue: number[] = [];
  for (let i = 0; i < nx; i++) if (!w.sea[i]) { main[i] = 1; queue.push(i); }
  for (let c = 0; c < queue.length; c++) {
    const k = queue[c], i = k % nx;
    for (const m of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k - nx, k + nx]) if (m >= 0 && m < n && !main[m] && !w.sea[m]) { main[m] = 1; queue.push(m); }
  }
  // (Near the mainland: the shore's own point may be a hair under the sea's edge as the lattice has it.)
  const nearMain = (k: number) => { const i = k % nx; for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const m = k + dj * nx + di; if (i + di >= 0 && i + di < nx && m >= 0 && m < n && main[m]) return true; } return false; };
  const spots = findTowns({ inner: f }, TOWN_NEED, rng, why, { margin: Math.ceil(600 / f.cell), where: nearMain });
  const out: WorldPlace[] = [];
  for (const sp of spots) {
    if (Math.abs(sp.u) > p.hx - 700 || Math.abs(sp.v) > p.hz - 700) { why['near the world\'s edge'] = (why['near the world\'s edge'] ?? 0) + 1; continue; }
    if (out.some((q) => Math.hypot(q.x - sp.u, q.z - sp.v) < 900)) continue;
    out.push({ kind: 'coast', n: 0, name: '', x: sp.u, z: sp.v, y: Math.round(f.at(sp.u, sp.v) * 100) / 100, score: sp.score, town: sp });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** What a town of middling size asks of the coast, in its own measures about its quay's middle (`TownNeed`): for the world's search. */
const TOWN_NEED: TownNeed = { square: { x0: -30, x1: 30, z0: -57, z1: -11 }, house: { x0: -26, x1: 26, z0: -100, z1: -57 }, half: 190, deep: 230 };

/**
 * Towns, as placeholders for what the low country will one day hold: a harbour where a river comes
 * out to the sea, nearest the islands; market towns where rivers run through the low country; and
 * villages, on good ground near water, in the low country and up the broad glens.
 */
function settle(w: World, rng: Rng): Town[] {
  const f = w.field, h = f.data, p = w.plan, towns: Town[] = [];
  const NX = f.nx, NZ = f.nz, all = NX * NZ;
  const at = (k: number) => ({ x: f.x0 + (k % NX) * CELL, z: f.z0 + Math.floor(k / NX) * CELL, y: h[k] });
  const slopeAt = (k: number) => { const i = k % NX, j = (k - i) / NX; if (i < 1 || j < 1 || i > NX - 2 || j > NZ - 2) return 1; return Math.hypot(h[k + 1] - h[k - 1], h[k + NX] - h[k - NX]) / (2 * CELL); };
  const isles = w.places.filter((q) => q.kind === 'island');
  const ix = isles.length ? isles.reduce((s, q) => s + q.x, 0) / isles.length : 0, iz = isles.length ? isles.reduce((s, q) => s + q.z, 0) / isles.length : 0;
  // The harbour: a river's mouth, the larger the river and the nearer the islands the better.
  let harbour = -1, best = -Infinity;
  for (let k = 0; k < all; k++) {
    if (w.acc[k] < RIVER || w.sea[k] || w.down[k] < 0 || !w.sea[w.down[k]]) continue;
    const { x, z } = at(k), score = Math.log(w.acc[k]) * 2 - (isles.length ? Math.hypot(x - ix, z - iz) / 500 : 0);
    if (score > best) { best = score; harbour = k; }
  }
  if (harbour < 0) for (let k = 0; k < all; k++) {
    // (No river comes out to the sea: then the gentlest shore.)
    if (w.cover[k] !== COVER.shore) continue;
    const { x, z } = at(k), score = -slopeAt(k) * 50 - (isles.length ? Math.hypot(x - ix, z - iz) / 500 : 0);
    if (score > best) { best = score; harbour = k; }
  }
  if (harbour >= 0) towns.push({ kind: 'harbour', name: '', ...at(harbour) });
  const clear = (x: number, z: number, d: number) => towns.every((t) => Math.hypot(t.x - x, t.z - z) >= d);
  // Market towns: on a river in the low country, on gentle ground; the largest rivers first, well apart.
  const sites: number[] = [];
  for (let k = 0; k < all; k++) if (w.acc[k] >= 2 * RIVER && !w.sea[k] && !w.lake[k] && h[k] > 2 && h[k] < 120 && slopeAt(k) < 0.05) sites.push(k);
  sites.sort((a, b) => w.acc[b] - w.acc[a]);
  for (const k of sites) {
    const t = at(k);
    if (towns.filter((q) => q.kind === 'town').length >= 2) break;
    if (zonesAt(p, t.x, t.z).wR > 0.3 || !clear(t.x, t.z, 1800)) continue;
    towns.push({ kind: 'town', name: '', ...t });
  }
  // Villages: by water, on fields or pasture, eight hundred metres apart and more.
  const near: number[] = [];
  for (let k = 0; k < all; k += 3) if ((w.cover[k] === COVER.fields || w.cover[k] === COVER.pasture) && w.acc[k] > 3e4 && slopeAt(k) < 0.08) near.push(k);
  for (let tries = 0; tries < 4000 && near.length && towns.filter((q) => q.kind === 'village').length < 8; tries++) {
    const t = at(near[rng.int(0, near.length - 1)]);
    if (!clear(t.x, t.z, 800)) continue;
    towns.push({ kind: 'village', name: '', ...t });
  }
  return towns;
}

/**
 * The ways: roads between the towns, the shortest set that joins them all; tracks from the
 * villages and the valley heads to the nearest road; paths from the foot of each mountain top's
 * ridge, and up it; and ferries from the harbour out to the islands. Each is laid as a walker or
 * a cart would lay it: round a hill rather than over it, along a slope rather than up it, across a
 * river where it must; and on a way already made where one goes the right way.
 */
function layWays(w: World): WorldWay[] {
  // (On a lattice of twice the world's: a way finer than sixteen metres is not seen on a map of eight kilometres.)
  const f = w.field, S = 2, n = Math.floor((f.nx - 1) / S) + 1, m2 = Math.floor((f.nz - 1) / S) + 1, cell = CELL * S, x0 = f.x0, z0 = f.z0;
  const H = new Float32Array(n * m2), water = new Uint8Array(n * m2), river = new Uint8Array(n * m2), made = new Uint8Array(n * m2), madeList: number[] = [];
  // (Ground that is a little worse or better going, in patches some hundreds of metres across, for what a lattice cannot know: a
  // farm in the way, a bog, a ford. On the flat it makes a way wander, as ways do, where otherwise it ran ruled along the lattice.)
  const going = new Float32Array(n * m2);
  for (let g = 0; g < n * m2; g++) going[g] = 0.7 + 0.6 * valueNoise2((x0 + (g % n) * cell) / 250, (z0 + Math.floor(g / n) * cell) / 250, w.plan.n + 71);
  const mark = (g: number) => { if (!made[g]) { made[g] = 1; madeList.push(g); } };
  for (let j = 0; j < m2; j++) for (let i = 0; i < n; i++) {
    const k = j * S * f.nx + i * S, g = j * n + i;
    H[g] = f.data[k]; water[g] = w.sea[k] || w.lake[k] ? 1 : 0; river[g] = w.acc[k] >= RIVER * 3 ? 1 : 0;
  }
  const idx = (x: number, z: number) => Math.min(m2 - 1, Math.max(0, Math.round((z - z0) / cell))) * n + Math.min(n - 1, Math.max(0, Math.round((x - x0) / cell)));
  const pt = (g: number): [number, number] => [x0 + (g % n) * cell, z0 + Math.floor(g / n) * cell];
  const ways: WorldWay[] = [];
  // What a step costs, for each kind of way: how steep it may be before it pays heavily, and what a bridge costs.
  const KIND = { road: { steep: 0.07, bridge: 120, reuse: 0.4 }, track: { steep: 0.11, bridge: 90, reuse: 0.5 }, path: { steep: 0.3, bridge: 60, reuse: 0.6 } };
  const route = (kind: 'road' | 'track' | 'path', from: [number, number], to: [number, number]): [number, number][] | null => {
    const o = KIND[kind];
    const cost = (a: number, b: number) => {
      if (water[b]) return Infinity;
      const di = Math.abs((a % n) - (b % n)), len = cell * (di && Math.abs(a - b) !== 1 ? Math.SQRT2 : 1), s = Math.abs(H[b] - H[a]) / len;
      let c = len * (1 + (s / o.steep) ** 2) * going[b];
      if (river[b] && !river[a]) c += o.bridge;
      return made[b] ? c * o.reuse : c;
    };
    const line = leastPath(x0, z0, cell, n, m2, from, to, cost);
    if (!line) return null;
    for (const [x, z] of line) mark(idx(x, z));
    return line;
  };
  /** The nearest point of a way already made. */
  const nearestMade = (x: number, z: number): [number, number] | null => {
    let best = -1, bd = Infinity;
    for (const g of madeList) { const [px, pz] = pt(g), d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = g; } }
    return best < 0 ? null : pt(best);
  };
  const add = (kind: WorldWay['kind'], line: [number, number][] | null) => { if (line && line.length > 1) ways.push({ kind, points: smoothLine(line, 3) }); };
  // Roads: the towns joined by the shortest set of links (Prim's way), each link laid over the land.
  const hubs = w.towns.filter((t) => t.kind !== 'village');
  if (hubs.length) {
    const inTree = [hubs[0]], out = hubs.slice(1);
    while (out.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (let a = 0; a < inTree.length; a++) for (let b = 0; b < out.length; b++) { const d = Math.hypot(inTree[a].x - out[b].x, inTree[a].z - out[b].z); if (d < bd) { bd = d; bi = a; bj = b; } }
      add('road', route('road', [inTree[bi].x, inTree[bi].z], [out[bj].x, out[bj].z]));
      inTree.push(out[bj]); out.splice(bj, 1);
    }
  }
  if (!madeList.length && hubs.length) mark(idx(hubs[0].x, hubs[0].z));
  // Tracks: villages and valley heads, the nearest first, each to the nearest way already made.
  const ends: { x: number; z: number; kind: 'track' | 'path'; from?: [number, number][] }[] = [];
  for (const t of w.towns) if (t.kind === 'village') ends.push({ x: t.x, z: t.z, kind: 'track' });
  for (const q of w.places) if (q.kind === 'valley') ends.push({ x: q.x, z: q.z, kind: 'track' });
  // Paths: up each mountain top's ridge from its foot, and from the foot to the nearest way.
  for (const q of w.places) if (q.kind === 'mountain' && q.ridge) {
    ends.push({ x: q.ridge.foot[0], z: q.ridge.foot[1], kind: 'path', from: [[q.x, q.z], q.ridge.foot] });
  }
  const remaining = [...ends];
  while (remaining.length) {
    // (The one nearest the ways made so far, so that later ones can join it.)
    let bi = 0, bd = Infinity;
    for (let k = 0; k < remaining.length; k++) { const m = nearestMade(remaining[k].x, remaining[k].z); const d = m ? Math.hypot(m[0] - remaining[k].x, m[1] - remaining[k].z) : 0; if (d < bd) { bd = d; bi = k; } }
    const e = remaining.splice(bi, 1)[0], m = nearestMade(e.x, e.z);
    if (e.from) {
      // (The ridge: walked on its crest, straight up; it is not laid over the lattice, which would put it beside the crest.)
      const up: [number, number][] = [];
      for (let t = 0; t <= 1.0001; t += 0.1) up.push([e.from[0][0] + (e.from[1][0] - e.from[0][0]) * t, e.from[0][1] + (e.from[1][1] - e.from[0][1]) * t]);
      ways.push({ kind: 'path', points: up });
      for (const [x, z] of up) mark(idx(x, z));
    }
    if (m && Math.hypot(m[0] - e.x, m[1] - e.z) > cell) add(e.kind, route(e.kind, [e.x, e.z], m));
    else mark(idx(e.x, e.z));
  }
  // Ferries: from the harbour to each island, over the water and round the land.
  const harbour = w.towns.find((t) => t.kind === 'harbour');
  if (harbour) {
    const seaCost = (a: number, b: number) => {
      if (!water[b]) return Infinity;
      return cell * (Math.abs((a % n) - (b % n)) && Math.abs(a - b) !== 1 ? Math.SQRT2 : 1);
    };
    /** The nearest water to a point, on the lattice. */
    const wet = (x: number, z: number): [number, number] | null => {
      const c = idx(x, z), ci = c % n, cj = Math.floor(c / n);
      for (let r = 0; r < 20; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= n || j >= m2 || !water[j * n + i]) continue;
        return pt(j * n + i);
      }
      return null;
    };
    const from = wet(harbour.x, harbour.z);
    for (const q of w.places) {
      if (q.kind !== 'island' || !from) continue;
      const to = wet(q.island!.cu, q.island!.cv);
      if (!to) continue;
      const line = leastPath(x0, z0, cell, n, m2, from, to, seaCost);
      if (line) ways.push({ kind: 'ferry', points: smoothLine([[harbour.x, harbour.z], ...line], 3) });
    }
  }
  return ways;
}
