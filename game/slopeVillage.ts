/**
 * A resort village where a run parts and comes together again (asked: "a town / village to the Ashbridge with access to both sides";
 * "lets build the resort village! fetch the village generator logic and building generator logics from the dungeons repository and
 * adapt them"; "timbered houses and classical wood houses probably are the best fit with a small church or so"; and, of where, "Both:
 * lanes from the spur to the foot"). Its houses stand on the spur between the two ways and go on down to the lake where the ways meet:
 * along the inner edge of each piste, their fronts to it, so that the village is skied into from either way, and along lanes grown
 * across the spur between them, as dungeons grows a village (`growWays`, `lineWays` in `src/core/grown.ts`, after watabou's village
 * generator). Its houses are the dungeons valleys' own, built by its builders (`buildBuilding` in `src/render/buildings.ts`): timber
 * houses, plastered between their frames and jettied, and classical houses of painted weatherboards on granite basements, and one
 * small church of coursed stone with a tower; all shut, seen only from outside.
 *
 * The land is steep there, twenty to thirty degrees nearly everywhere, so each house's ground is levelled where it stands, at its
 * front's height, the land cut back behind it and filled before it over short banks (`levelVillage`, in the slice before its land is
 * made from it, as the cave's camp is), and a footing of stone is built under it wherever the ground still falls away below its floor,
 * as the half basements of houses on a hillside are. Neither the pistes nor the caves are touched: no house, lane or bank comes onto
 * a piste, and none near a cave or the forgotten slope's way.
 *
 * It is laid out once, by `npm run village` (`tools/village.ts`), in the world's coordinates from the slice of the first of its runs,
 * and kept beside the slices (`slopes/<world>-<village>.json`), so that it is the same village from whichever of its runs it is come to:
 * each run's slice carries the other's line as its branch, but its own copy of the land, which differs from the other's by a centimetre
 * here and there and at the edges of its band, and laid out from each the village came out with a house more or less. The pistes are
 * narrowed through it as the slice is read (`narrowPistes`), alike in both, which carry the same two lines; the caves and the
 * forgotten slope's way are then found clear of it (`villageClear`), and its ground levelled (`levelVillage`).
 */
import { BufferGeometry, Group, Material, Mesh } from 'three';
import { dealChapel, footprintOf } from '../src/core/building';
import { clearOfWays, type GivenWay, type GrowLand, type GrowOptions, growWays, lineWays, type Pt } from '../src/core/grown';
import { Rng } from '../src/core/rng';
import type { Building } from '../src/core/site';
import { gridAt, type Grid, type SkiSlice } from '../src/core/skiSlice';
import { COVER } from '../src/core/world';
import { makeBuiltMaterials, makeWindowFor } from '../src/render/builtMaterials';
import { buildBuilding } from '../src/render/buildings';
import { MeshBuilder } from '../src/render/geom/meshBuilder';
import { placeHouse } from '../src/render/housePlacing';
import type { Colour } from '../src/render/planting';
import { snowUniforms } from '../src/render/siteMaterial';
import { generateTextureSet, type TextureSet } from '../src/render/textures';
import type { Branch } from './slopeLand';

/**
 * The villages, each where two runs that part (`FORKS` in `tools/skiRun.ts`) are one area (`area` in the game's list of runs): its
 * name, and the runs it lies between, by their slices' names; the first the way whose left the spur is on is found, not given.
 */
export const VILLAGES: Record<string, { name: string; ways: [string, string] }> = {
  ashbridge: { name: 'Ashbridge', ways: ['w2-8', 'w2-25'] },
};

/** A house of the village, as the builders take it, and the height of its floor (the ground before its door, levelled). */
export type VillageHouse = Building & { y: number };

export interface Village {
  name: string;
  /** Its houses and its church, in the world's coordinates. */
  houses: VillageHouse[];
  /** The lanes grown across the spur, in the world's coordinates. */
  lanes: Pt[][];
}

/** The file a run's village is kept in, beside the slices (`slopes/`), if the run is one of a village's: `w2-ashbridge.json`. */
export function villageFile(world: string, id: string): string | null {
  const key = Object.keys(VILLAGES).find((k) => VILLAGES[k].ways.includes(id));
  return key ? `${world}-${key}.json` : null;
}

const smooth01 = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const round = (v: number) => Math.round(v * 10) / 10;

/**
 * Measures: how far the two ways must be apart for the spur between them to be settled; how far about the point where they meet again
 * the village reaches, and over how far it thins out to nothing beyond that; how far a house keeps off a piste's edge (further than the
 * yetis' arena reaches past it, `PIPE.wider` in `slopeArena.ts`, so that one laid beside the village does not go into a house), a lane off it,
 * a bank of levelled ground off it; how far beyond a house, and a lane, a cave or the forgotten slope's way keeps; how many metres of
 * fall across a house's ground it may stand on (its footing takes the rest); the lattice the village's ground is read on.
 */
const V = { apart: 30, foot: 80, footFade: 45, offPiste: 4, laneOff: 1.5, bankOff: 1, clear: 10, laneClear: 5, fall: 5, cell: 2 };
/**
 * How far from its line each piste reaches at most on the village's side of it, through the village; and on its other side about the
 * foot, where the village reaches round the pistes' ends. (The pistes were laid as broad as the land allowed, up to forty-six metres
 * either side of their lines: through the spur they lay over all of it but a strip, and round the foot over all of it.) Over how many
 * points of the line the narrowing comes in.
 */
const NARROW = { inner: 16, outer: 22, over: 15 };

/** Washes on the timber houses' plaster, and paints on the wooden houses' boards, as dungeons deals them. */
const WASHES: Colour[] = [[0.86, 0.8, 0.66], [0.82, 0.62, 0.3], [0.78, 0.5, 0.44], [0.55, 0.66, 0.74], [0.6, 0.68, 0.5], [0.88, 0.87, 0.82], [0.74, 0.36, 0.26]];
const BOARDS: Colour[] = [[0.8, 0.55, 0.18], [0.78, 0.52, 0.2], [0.55, 0.2, 0.12], [0.86, 0.72, 0.36], [0.62, 0.68, 0.58], [0.72, 0.74, 0.72], [0.85, 0.6, 0.52]];

/** A way's line, as a slice keeps it: where a point lies against it, its piste's edges there, and the point along and across it. */
function lineOf(run: SkiSlice['run']) {
  const p = run.points, n = p.length, step = run.step;
  const dirs = p.map((_, k) => {
    const [ax, az] = p[Math.max(0, Math.min(n - 2, k))], [bx, bz] = p[Math.max(1, Math.min(n - 1, k + 1))], l = Math.hypot(bx - ax, bz - az) || 1;
    return [(bx - ax) / l, (bz - az) / l] as [number, number];
  });
  const frame = (x: number, z: number) => {
    let best = Infinity, s = 0, left = 0;
    for (let k = 0; k < n - 1; k++) {
      const [ax, az] = p[k], [dx, dz] = dirs[k], t = Math.max(k > 0 ? 0 : -Infinity, Math.min(k < n - 2 ? 1 : Infinity, ((x - ax) * dx + (z - az) * dz) / step));
      const px = ax + dx * t * step, pz = az + dz * t * step, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; s = (k + t) * step; left = (x - px) * dz - (z - pz) * dx; }
    }
    return { s, left };
  };
  const edges = (s: number): [number, number] => {
    const f = Math.max(0, Math.min(n - 1, s / step)), k = Math.min(n - 2, Math.floor(f)), t = f - k, [a, b] = run.piste[k], [c, d] = run.piste[k + 1];
    return [a + (c - a) * t, b + (d - b) * t];
  };
  /** How far a point lies outside the piste (less than nothing, on it), past its top and foot too. */
  const outside = (x: number, z: number) => { const f = frame(x, z), [lo, hi] = edges(f.s); return Math.max(lo - f.left, f.left - hi, -4 - f.s, f.s - (n - 1) * step - 4); };
  const at = (k: number, left: number): Pt => { const [x, z] = p[k], [dx, dz] = dirs[k]; return [x + dz * left, z - dx * left]; };
  return { points: p, n, step, frame, edges, outside, at };
}
type Line = ReturnType<typeof lineOf>;

/** Whether a point is within a ring of points. */
function inRing(ring: Pt[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az || 1e-9) + ax) inside = !inside;
  }
  return inside;
}

/** How far a point is from a line of points. */
function offLine(pts: Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], dx = bx - ax, dz = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** An oblong `w` across its front and `d` deep about (x, z), its front facing the bearing `th`, grown by `grow`: its corners. */
function oblong(x: number, z: number, w: number, d: number, th: number, grow = 0): Pt[] {
  const c = Math.cos(th), sn = Math.sin(th), hw = w / 2 + grow, hd = d / 2 + grow;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, dd]) => [x + u * sn + dd * c, z - u * c + dd * sn] as Pt);
}
/** Whether two turned oblongs are apart: some line square to one of their sides parts them. */
function parted(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length], nx = z1 - z0, nz = x0 - x1;
    const pa = a.map(([x, z]) => x * nx + z * nz), pb = b.map(([x, z]) => x * nx + z * nz);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return true;
  }
  return false;
}

/** Where a point of a building's own measures (across its front from its middle, `u`; back from its front, `v`) is. */
function turnedPoint(b: Building, u: number, v: number): Pt {
  const f = b.turn ?? Math.PI, fx = Math.cos(f), fz = Math.sin(f), out = b.d / 2 - v;
  return [b.x + fx * out + fz * u, b.z + fz * out - fx * u];
}
/** A point in a building's own measures: across its front from its middle, and back from its front. */
function ownPoint(b: Building, x: number, z: number): [number, number] {
  const f = b.turn ?? Math.PI, fx = Math.cos(f), fz = Math.sin(f), dx = x - b.x, dz = z - b.z;
  return [dx * fz - dz * fx, b.d / 2 - (dx * fx + dz * fz)];
}
/** The corners of each part of a building's footprint, where they stand. */
function cornersOf(b: Building): Pt[][] {
  return footprintOf(b).map((r) => [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]].map(([u, v]) => turnedPoint(b, u, v)));
}

/**
 * Where a village lies on a slice of one of its runs (`VILLAGES`): its two ways' lines, from where on each they are far enough apart
 * for the spur between them, which hand of each the spur is on, the spur's outline, and the point where the ways meet again. Nothing
 * where the slice is of no village's runs.
 */
function spurOf(slice: SkiSlice, id: string) {
  const entry = Object.entries(VILLAGES).find(([, v]) => v.ways.includes(id));
  if (!entry) return null;
  const [key, plan] = entry;
  const runs = new Map<string, SkiSlice['run']>([[id, slice.run], ...((slice as SkiSlice & { branches?: Branch[] }).branches ?? []).map((b) => [b.id, b.run] as [string, SkiSlice['run']])]);
  const runA = runs.get(plan.ways[0]), runB = runs.get(plan.ways[1]);
  if (!runA || !runB) return null;
  const A = lineOf(runA), B = lineOf(runB);
  const apartAt = (a: Line, b: Line, k: number) => { const [x, z] = a.points[k]; return Math.abs(b.frame(x, z).left); };
  const firstApart = (a: Line, b: Line) => { let k = 0; while (k < a.n - 1 && apartAt(a, b, k) < V.apart) k++; return k; };
  const iA = firstApart(A, B), iB = firstApart(B, A);
  if (iA >= A.n - 4 || iB >= B.n - 4) return null;
  const spur: Pt[] = [...A.points.slice(iA), ...B.points.slice(iB).reverse()];
  const [ea, eb] = [A.points[A.n - 1], B.points[B.n - 1]], foot: Pt = [(ea[0] + eb[0]) / 2, (ea[1] + eb[1]) / 2];
  // (Which hand of each way the spur is on: towards the other's middle.)
  const midOf = (l: Line, i0: number) => l.points[Math.floor((i0 + l.n) / 2)];
  const handOf = (l: Line, o: Pt) => Math.sign(l.frame(o[0], o[1]).left) || 1;
  const handA = handOf(A, midOf(B, iB)), handB = handOf(B, midOf(A, iA));
  return { key, plan, A, B, runA, runB, iA, iB, handA, handB, spur, foot };
}

/**
 * The pistes of a village's runs narrowed through it, in the slice as it is read and before anything is found or laid on it: so that
 * its land is made with them so, their poles, their grooming and what is built on them keeping to them. Each the same from either run's
 * slice, which carry the same two lines. Gives back whether the slice is of a village's runs.
 */
export function narrowPistes(slice: SkiSlice, id: string): boolean {
  const at = spurOf(slice, id);
  if (!at) return false;
  const { A, B, runA, runB, handA, handB, iA, iB, foot } = at;
  for (const [l, run, hand, i0] of [[A, runA, handA, iA], [B, runB, handB, iB]] as const) {
    for (let k = 0; k < l.n; k++) {
      const [x, z] = l.points[k], fromFoot = Math.hypot(x - foot[0], z - foot[1]);
      // (Coming in from where the spur begins, not before it: begun sixty metres up the run, it squeezed a kicker there against its
      // edge, which the demo then missed twice.)
      const inner = smooth01((k - i0) / NARROW.over), outer = 1 - smooth01((fromFoot - V.foot) / 30);
      const e = run.piste[k], side = hand > 0 ? 1 : 0;
      const cap = (v: number, most: number, w: number) => Math.sign(v) * (Math.abs(v) + (Math.min(Math.abs(v), most) - Math.abs(v)) * w);
      e[side] = cap(e[side], NARROW.inner, inner);
      e[1 - side] = cap(e[1 - side], NARROW.outer, outer);
    }
  }
  return true;
}

/**
 * The village where the two runs a slice carries part and meet again, laid out on the slice's land, its pistes narrowed through it
 * (`narrowPistes`, first), in the world's coordinates (`tools/village.ts`, once; the game reads what it wrote). Nothing where the slice
 * is of no village's runs, or where too few houses fit.
 */
export function layVillage(slice: SkiSlice, id: string): Village | null {
  const at = spurOf(slice, id);
  if (!at) return null;
  const { key, plan, A, B, iA, iB, handA, handB, spur, foot } = at;
  const rng = new Rng(`${slice.world} ${key} village`);

  // The land as both runs have it: the snow at a metre, and below it what lies on the country (a lake, frozen).
  const height = (x: number, z: number) => { const h = gridAt(slice.snow, x, z); return Number.isNaN(h) ? gridAt(slice.near, x, z) : h; };
  const onSnow = (x: number, z: number) => !Number.isNaN(gridAt(slice.snow, x, z));
  const far = slice.far, coverAt = (x: number, z: number) => {
    const i = Math.round((x - far.x0) / far.cell), j = Math.round((z - far.z0) / far.cell);
    return i < 0 || j < 0 || i >= far.nx || j >= far.nz ? COVER.sea : slice.cover[j * far.nx + i];
  };
  const wet = (x: number, z: number) => [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]].some(([dx, dz]) => { const c = coverAt(x + dx, z + dz); return c === COVER.lake || c === COVER.sea; });

  // What is asked of the land over and over as the lanes grow and the houses are dealt, read once onto a lattice of two metres over the
  // village's box: how far off either piste a point is, how thickly settled it is, and whether a lane may cross it.
  const all = [...spur, ...[0, 1, 2, 3].map((k): Pt => [foot[0] + Math.cos(k * Math.PI / 2) * (V.foot + V.footFade), foot[1] + Math.sin(k * Math.PI / 2) * (V.foot + V.footFade)])];
  const bx0 = Math.min(...all.map((p) => p[0])) - 20, bz0 = Math.min(...all.map((p) => p[1])) - 20, bx1 = Math.max(...all.map((p) => p[0])) + 20, bz1 = Math.max(...all.map((p) => p[1])) + 20;
  const gnx = Math.ceil((bx1 - bx0) / V.cell) + 1, gnz = Math.ceil((bz1 - bz0) / V.cell) + 1;
  // (How far off the pistes a point is is read as it is first asked: most of the box is never asked.)
  const offPiste = new Float32Array(gnx * gnz).fill(NaN), settled = new Float32Array(gnx * gnz), crossable = new Uint8Array(gnx * gnz);
  const cellOf = (x: number, z: number) => { const i = Math.round((x - bx0) / V.cell), j = Math.round((z - bz0) / V.cell); return i < 0 || j < 0 || i >= gnx || j >= gnz ? -1 : j * gnx + i; };
  const offAt = (x: number, z: number) => {
    const k = cellOf(x, z);
    if (k < 0) return Math.min(A.outside(x, z), B.outside(x, z));
    if (Number.isNaN(offPiste[k])) offPiste[k] = Math.min(A.outside(bx0 + (k % gnx) * V.cell, bz0 + Math.floor(k / gnx) * V.cell), B.outside(bx0 + (k % gnx) * V.cell, bz0 + Math.floor(k / gnx) * V.cell));
    return offPiste[k];
  };
  for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) {
    const x = bx0 + i * V.cell, z = bz0 + j * V.cell, k = j * gnx + i;
    const fromFoot = Math.hypot(x - foot[0], z - foot[1]), inSpur = inRing(spur, x, z);
    const region = Math.max(inSpur ? 1 : 0, 1 - smooth01((fromFoot - V.foot) / V.footFade));
    if (region <= 0 || !onSnow(x, z) || wet(x, z)) continue;
    const off = offAt(x, z);
    // (Thinner on steep ground, where a house wants a deep footing; thicker near the pistes it is skied into from and near the foot.)
    const e = 2, g = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);
    const steep = 1 - smooth01((g - 0.5) / 0.35), skiIn = 0.6 + 0.4 * (1 - smooth01(Math.max(0, off) / 45)), low = 0.75 + 0.25 * (1 - smooth01(fromFoot / 160));
    settled[k] = region * steep * skiIn * low;
    crossable[k] = off > V.laneOff && steep > 0.05 ? 1 : 0;
  }

  const houses: VillageHouse[] = [], kept: Pt[][] = [];
  const free = (ring: Pt[]) => kept.every((q) => parted(ring, q));
  const inKept = (x: number, z: number) => kept.some((r) => inRing(r, x, z));
  /**
   * Whether a building may stand where it is put: on settled snow, off the pistes, clear of the others, on ground falling no more than
   * its footing takes; and if so, the height of its floor, the ground before its door.
   */
  const sits = (b: Building, ring: Pt[]): number | null => {
    for (const [x, z] of [...ring, [b.x, b.z] as Pt]) {
      const k = cellOf(x, z);
      if (k < 0 || settled[k] <= 0 || offAt(x, z) < V.offPiste) return null;
    }
    if (!free(ring)) return null;
    const heights = cornersOf(b).flat().map(([x, z]) => height(x, z)), front = turnedPoint(b, 0, -1.2), y = height(front[0], front[1]);
    if (Math.max(...heights) - Math.min(...heights) > V.fall || Math.max(...heights) - y > V.fall) return null;
    return round(y);
  };
  const place = (b: Building): boolean => {
    const ring = oblong(b.x, b.z, b.w, b.d, b.turn!, 0.4), y = sits(b, ring);
    if (y === null) return false;
    houses.push({ ...b, y });
    kept.push(ring);
    return true;
  };

  // The lanes, grown from the inner edge of each piste across the spur, and the houses along them and along the pistes' edges.
  const edgeLine = (l: Line, hand: number, from: number): Pt[] => {
    const out: Pt[] = [];
    for (let k = from; k < l.n; k++) { const [lo, hi] = l.edges(k * l.step); out.push(l.at(k, (hand > 0 ? hi : lo) + hand * 0.5)); }
    return out;
  };
  // (Both edges at the foot, where the village reaches round the pistes' ends to the lake.)
  const footFrom = (l: Line) => { let k = l.n - 1; while (k > 0 && Math.hypot(l.points[k][0] - foot[0], l.points[k][1] - foot[1]) < V.foot + V.footFade) k--; return k; };
  const given: GivenWay[] = [
    { points: edgeLine(A, handA, iA), clear: 2.2, setback: 3.4, span: [0, Infinity] as [number, number] },
    { points: edgeLine(B, handB, iB), clear: 2.2, setback: 3.4, span: [0, Infinity] as [number, number] },
    { points: edgeLine(A, -handA, footFrom(A)), clear: 2.2, setback: 3.4, span: [0, Infinity] as [number, number] },
    { points: edgeLine(B, -handB, footFrom(B)), clear: 2.2, setback: 3.4, span: [0, Infinity] as [number, number] },
  ].filter((g) => g.points.length > 2);
  const gq = rng.fork('grown');
  const land: GrowLand = {
    open: (x, z) => { const k = cellOf(x, z); return k >= 0 && crossable[k] === 1 && !inKept(x, z); },
    density: (x, z) => { const k = cellOf(x, z); return k < 0 ? 0 : settled[k]; },
    height,
  };
  const grow: GrowOptions = { step: 3, block: gq.range(16, 22), rigid: gq.range(0.06, 0.16), laneClear: 1.6, laneSetback: 2.6, longest: gq.range(50, 80), most: gq.int(10, 15), trail: [6, 14], houses: 90, apart: 9 };
  const ways = growWays(given, land, grow, gq.fork('ways'));
  const lanes = ways.slice(given.length).filter((w) => w.kind !== 'trail').map((w) => w.points);
  // The church: a small one of stone (`dealChapel`, as dungeons deals a village's), its long side to a lane, as near the middle of
  // the spur as it fits. (Along a lane, which keeps to the lie of the land, and not a piste, which falls down it: along a piste the
  // church, some fourteen metres long, fell six and more, and it was never built.) (Its own stream.)
  {
    const cq = rng.fork('church'), { W, D, H, chapel } = dealChapel(cq);
    const mid = spur.reduce((a, p) => [a[0] + p[0] / spur.length, a[1] + p[1] / spur.length], [0, 0]);
    const tries: { x: number; z: number; th: number; d: number }[] = [];
    for (const lane of lanes) for (let k = 0; k + 1 < lane.length; k++) {
      const [ax, az] = lane[k], [bx, bz] = lane[k + 1], l = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / l, dz = (bz - az) / l;
      for (const side of [-1, 1]) {
        const nx = -dz * side, nz = dx * side, off = grow.laneSetback + 1 + D / 2, x = (ax + bx) / 2 + nx * off, z = (az + bz) / 2 + nz * off;
        tries.push({ x, z, th: Math.atan2(-nz, -nx), d: Math.hypot(x - mid[0], z - mid[1]) });
      }
    }
    tries.sort((p, q) => p.d - q.d);
    for (const t of tries) {
      const b: Building = { style: 'chapel', w: W, d: D, storeys: 1, heights: [H], bays: 1, colour: [0.9, 0.88, 0.82], x: round(t.x), z: round(t.z), faces: Math.cos(t.th) < 0 ? 'w' : 'e', turn: Math.round(t.th * 1000) / 1000, chapel: { end: 1, ...chapel } };
      const rects = footprintOf(b), u0 = Math.min(...rects.map((r) => r.u0)), u1 = Math.max(...rects.map((r) => r.u1)), v1 = Math.max(...rects.map((r) => r.v1));
      const ring = [[u0 - 0.6, -0.6], [u1 + 0.6, -0.6], [u1 + 0.6, v1 + 0.6], [u0 - 0.6, v1 + 0.6]].map(([u, v]) => turnedPoint(b, u, v));
      if (!clearOfWays(lanes.map((points) => ({ points })), b.x, b.z, Math.max(...rects.map((r) => r.u1 - r.u0)), v1, t.th, grow.laneClear)) continue;
      const y = sits(b, ring);
      if (y === null) continue;
      houses.push({ ...b, y });
      kept.push(ring);
      break;
    }
  }
  /** A house of the village: a timber house or, two in five, a wooden one; larger where the village is thicker. */
  let n = 0;
  const deal = (density: number) => {
    const q = rng.fork(`house${n++}`);
    if (q.chance(0.4)) {
      const w = round(q.range(8.5, 12.5)), d = round(q.range(7, 8.8)), storeys = q.chance(0.3 + 0.3 * density) ? 2 : 1, tall = q.fork('heights');
      const heights = storeys === 1 ? [round(tall.range(3.1, 3.6))] : [round(tall.range(3.0, 3.4)), round(tall.range(2.8, 3.2))];
      return { style: 'wooden' as const, w, d, storeys, heights, bays: Math.max(3, Math.round((w - 2) / 2.2)), colour: q.pick(BOARDS), basement: round(q.range(0.8, 1.5)), endDoor: (q.chance(0.5) ? -1 : 1) as -1 | 1, dormers: q.int(0, w > 11 ? 3 : 2) };
    }
    const big = density > 0.6 && q.chance(0.6), small = density < 0.4 && q.chance(0.55), tall = q.fork('heights');
    const w = round(big ? q.range(8, 9.6) : small ? q.range(5.4, 6.6) : q.range(6, 8.6)), d = round(small ? q.range(5.6, 6.6) : q.range(6.2, 7.8));
    const storeys = big ? 3 : small ? (q.chance(0.6) ? 1 : 2) : q.chance(0.4) ? 3 : 2;
    const heights = [round(tall.range(2.6, 3.3)), ...Array.from({ length: storeys - 1 }, (_, m) => round(tall.range(2.35, 2.9) - m * 0.1))];
    return { style: 'timber' as const, w, d, storeys, heights, bays: w > 7.4 ? 3 : 2, colour: WASHES[(n * 3 + 1) % WASHES.length], jetty: round(q.range(0.3, 0.45)), gable: q.chance(small ? 0.35 : 0.6), door: q.pick([0.24, 0.76]) };
  };
  lineWays(ways, given, land, grow, gq.fork('houses'), (_, d) => deal(d), (lot) => {
    // (Clear of the lanes too, which `lineWays` asks only of the way a house fronts and those before it.)
    if (!clearOfWays(lanes.map((points) => ({ points })), lot.x, lot.z, lot.house.w, lot.house.d, lot.turn, grow.laneClear - 0.2)) return false;
    return place({ ...lot.house, x: round(lot.x), z: round(lot.z), faces: Math.cos(lot.turn) < 0 ? 'w' : 'e', turn: Math.round(lot.turn * 1000) / 1000 } as Building);
  });
  if (houses.filter((h) => h.style !== 'chapel').length < 6) return null;
  return { name: plan.name, houses, lanes: lanes.map((l) => l.map(([x, z]): Pt => [round(x), round(z)])) };
}

/**
 * The village's ground made in the slice, before its land is made from it: each house's ground levelled at its floor's height over its
 * footprint and a metre about it, the land cut back and filled to it over a bank as broad as the cut or fill is high and three metres
 * at least; and each lane cut level across, a bench of three and a half metres along the hillside, as a track is cut. Never on a piste,
 * nor within a metre of one: the banks come back to the land before it. (In the snow at a metre and the land at four alike, so that
 * neither shows through the other.)
 */
export function levelVillage(slice: SkiSlice, id: string, v: Village): void {
  const at = spurOf(slice, id);
  if (!at) return;
  // (How far off the pistes a point is, read on a lattice of two metres as it is first asked.)
  const { A, B } = at, offs = new Map<number, number>();
  const offPiste = (x: number, z: number) => {
    const i = Math.round(x / V.cell), j = Math.round(z / V.cell), k = i * 100003 + j;
    let o = offs.get(k);
    if (o === undefined) offs.set(k, (o = Math.min(A.outside(i * V.cell, j * V.cell), B.outside(i * V.cell, j * V.cell))));
    return o;
  };
  type Pad = { b: VillageHouse; reach: number };
  const pads: Pad[] = v.houses.map((b) => ({ b, reach: 3 }));
  for (const p of pads) {
    let most = 0;
    for (const ring of cornersOf(p.b)) for (const [x, z] of ring) most = Math.max(most, Math.abs(gridAt(slice.snow, x, z) - p.b.y) || 0);
    p.reach = Math.max(3, Math.min(9, most * 1.4));
  }
  /** How far a point is outside a house's footprint and the metre about it (less than nothing, within). */
  const outOf = (b: Building, x: number, z: number) => {
    const [u, w] = ownPoint(b, x, z);
    let best = Infinity;
    for (const r of footprintOf(b)) best = Math.min(best, Math.max(r.u0 - 1 - u, u - r.u1 - 1, r.v0 - 1 - w, w - r.v1 - 1));
    return best;
  };
  // (Each lane and each house with the box about it, so that a point of the lattice asks only those near it.)
  const lanes = v.lanes.map((points) => ({ points, box: [Math.min(...points.map((q) => q[0])) - 5, Math.min(...points.map((q) => q[1])) - 5, Math.max(...points.map((q) => q[0])) + 5, Math.max(...points.map((q) => q[1])) + 5] }));
  const near = (p: Pad, x: number, z: number) => Math.abs(x - p.b.x) < p.reach + Math.max(p.b.w, p.b.d) + 8 && Math.abs(z - p.b.z) < p.reach + Math.max(p.b.w, p.b.d) + 8;
  const box = v.houses.reduce((a, b) => [Math.min(a[0], b.x - 30), Math.min(a[1], b.z - 30), Math.max(a[2], b.x + 30), Math.max(a[3], b.z + 30)], [Infinity, Infinity, -Infinity, -Infinity]);
  for (const p of v.lanes) for (const [x, z] of p) { box[0] = Math.min(box[0], x - 10); box[1] = Math.min(box[1], z - 10); box[2] = Math.max(box[2], x + 10); box[3] = Math.max(box[3], z + 10); }
  for (const g of [slice.snow, slice.near]) {
    const i0 = Math.max(0, Math.floor((box[0] - g.x0) / g.cell)), i1 = Math.min(g.nx - 1, Math.ceil((box[2] - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((box[1] - g.z0) / g.cell)), j1 = Math.min(g.nz - 1, Math.ceil((box[3] - g.z0) / g.cell));
    const was = new Float32Array(g.data), before: Grid = { ...g, data: was };
    const natural = (x: number, z: number) => { const h = gridAt(before, x, z); return Number.isNaN(h) ? gridAt(slice.near, x, z) : h; };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * g.nx + i, x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
      if (Number.isNaN(was[k])) continue;
      // (Off the pistes: nothing within a metre of one is changed, and the change comes in over the next two.)
      const keep = smooth01((offPiste(x, z) - V.bankOff) / 2);
      if (keep <= 0) continue;
      let h = was[k];
      // A lane's bench: level across at the lane's own height, its banks over three metres.
      for (const l of lanes) {
        if (x < l.box[0] || z < l.box[1] || x > l.box[2] || z > l.box[3]) continue;
        let best = Infinity, at = 0;
        for (let m = 0; m + 1 < l.points.length; m++) {
          const [ax, az] = l.points[m], [bx, bz] = l.points[m + 1], dx = bx - ax, dz = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
          if (d < best) { best = d; at = natural(ax + dx * t, az + dz * t); }
        }
        if (best < 4.75) h = h + (at - h) * (1 - smooth01((best - 1.75) / 3));
      }
      // Each house's ground, level within its footprint and a metre about it, and its bank about that.
      for (const p of pads) {
        if (!near(p, x, z)) continue;
        const o = outOf(p.b, x, z);
        if (o > p.reach) continue;
        h = o <= 0 ? p.b.y : h + (p.b.y - h) * (1 - smooth01(o / p.reach));
      }
      g.data[k] = was[k] + (h - was[k]) * keep;
    }
  }
}

/**
 * Whether a point of a run's scene (its top at (`ox`, `oz`) in the world) is clear of the village: not within `V.clear` of a house
 * nor `V.laneClear` of a lane. For a cave and the forgotten slope's way, which are found after it, to keep out of it.
 */
export function villageClear(v: Village, ox: number, oz: number): (x: number, z: number) => boolean {
  const houses = v.houses.map((b) => ({ x: b.x - ox, z: b.z - oz, r: Math.hypot(b.w, b.d) / 2 + V.clear }));
  const lanes = v.lanes.map((l) => l.map(([x, z]): Pt => [x - ox, z - oz]));
  return (x, z) => houses.every((h) => Math.hypot(x - h.x, z - h.z) > h.r) && lanes.every((l) => offLine(l, x, z) > V.laneClear);
}

/** A village as it is kept (`tools/village.ts` writes it), and read back. */
export const writeVillage = (v: Village): string => JSON.stringify(v);
export const readVillage = (text: string): Village => JSON.parse(text) as Village;

/** What the village is made of: the textures dungeons paints for what is built, and the materials it makes of them. */
let kit: { textures: Record<'stone' | 'wood' | 'moss' | 'plaster' | 'tile' | 'castle', TextureSet>; materials: Record<string, Material> } | null = null;
function kitOf(size: number) {
  if (kit) return kit;
  const textures = {
    stone: generateTextureSet('stone', size, 3), wood: generateTextureSet('wood', size, 5), moss: generateTextureSet('moss', size / 2, 9),
    plaster: generateTextureSet('plaster', size, 41), tile: generateTextureSet('tile', size, 43), castle: generateTextureSet('castle', Math.min(size * 2, 2048), 89),
  };
  // (No brick is built here: the brick materials, which `makeBuiltMaterials` always makes, are made on the plaster and never drawn.)
  const materials = makeBuiltMaterials({ ...textures, redBrick: textures.plaster, buffBrick: textures.plaster }, { weathered: true, snowed: true });
  materials.window = makeWindowFor(0, textures);
  // (Every run is in winter: the snow on its roofs as on the land, which the game's look of the land says, and the plain look did not.)
  snowUniforms.uSnow.value = 1;
  kit = { textures, materials };
  return kit;
}

/**
 * The village drawn, laid in a run's land, whose top is at (`ox`, `oz`) in the world: its houses built by dungeons' builders and set
 * on their ground (`placeHouse`), with a footing of stone under each where the ground falls away below its floor; and what a skier
 * runs into (`wall`).
 */
export class VillageLook {
  readonly group = new Group();
  private readonly houses: VillageHouse[];
  private readonly lanes: Pt[][];
  private readonly geometries: BufferGeometry[] = [];

  constructor(v: Village, ox: number, oz: number, ground: (x: number, z: number) => number, texSize = 512) {
    this.group.name = 'village';
    this.houses = v.houses.map((b) => ({ ...b, x: b.x - ox, z: b.z - oz }));
    this.lanes = v.lanes.map((l) => l.map(([x, z]): Pt => [x - ox, z - oz]));
    const { materials } = kitOf(texSize), into = new Map<string, MeshBuilder>(), mesh = (m: string) => { let b = into.get(m); if (!b) into.set(m, (b = new MeshBuilder())); return b; };
    const stone: Colour = [0.62, 0.6, 0.56], rng = new Rng(`${v.name} village look`), inn = this.houses.findIndex((b) => b.style === 'timber');
    this.houses.forEach((b, n) => {
      const local = new Map<string, MeshBuilder>();
      // (Built facing west at the middle, as the builders make them, and turned to face its bearing: by that bearing less a half turn.)
      buildBuilding({ ...b, x: 0, z: 0, faces: 'w', turn: undefined }, b.y, (m) => { let l = local.get(m); if (!l) local.set(m, (l = new MeshBuilder(4096))); return l; }, rng.fork(`house${n}`), stone, n === inn);
      const turn = (b.turn ?? Math.PI) - Math.PI;
      placeHouse(b, b.y, local, mesh, { facing: b.turn ?? Math.PI, foot: ground, turn: { angle: turn, x: b.x, z: b.z } });
      // The footing: from its floor down below the lowest ground under it, under each part of it.
      for (const ring of cornersOf(b)) {
        const low = Math.min(...ring.map(([x, z]) => ground(x, z)));
        if (low > b.y - 0.05) continue;
        footing(mesh('stone'), ring, low - 0.6, b.y + 0.02, [stone[0] * 0.85, stone[1] * 0.85, stone[2] * 0.85]);
      }
    });
    for (const [name, b] of into) {
      if (!b.triangleCount) continue;
      const g = b.build(), m = new Mesh(g, materials[name] ?? materials.plaster);
      if (!materials[name]) console.warn(`the village: no material "${name}", drawn as plaster`);
      m.castShadow = true; m.receiveShadow = true; m.name = `village ${name}`;
      this.geometries.push(g);
      this.group.add(m);
    }
  }

  /**
   * What a body `r` metres across its middle at (`x`, `z`) and `y` high is into, if it is into a house below its roof's top: how far it
   * is in, and the way out (along the ground), as the cave's rock face says it (`Cave.skiWall`).
   */
  wall(x: number, z: number, y: number, r: number): { nx: number; nz: number; into: number; what: string } | null {
    for (const b of this.houses) {
      const reach = Math.hypot(b.w, b.d) + 6;
      if (Math.abs(x - b.x) > reach || Math.abs(z - b.z) > reach) continue;
      const top = b.y + b.heights.reduce((s, h) => s + h, 0) + (b.basement ?? 0) + Math.min(b.w, b.d) * 0.6 + (b.chapel ? b.chapel.height - b.heights[0] + b.chapel.spireHeight : 0);
      if (y > top) continue;
      const [u, v] = ownPoint(b, x, z);
      for (const p of footprintOf(b)) {
        const pen = [u - (p.u0 - r), p.u1 + r - u, v - (p.v0 - r), p.v1 + r - v];
        if (pen.some((d) => d <= 0)) continue;
        const k = pen.indexOf(Math.min(...pen)), f = b.turn ?? Math.PI, fx = Math.cos(f), fz = Math.sin(f);
        // (Out across its front, `u`, is along (fz, −fx); back from its front, `v`, along (−fx, −fz).)
        const [nu, nv] = [[-1, 0], [1, 0], [0, -1], [0, 1]][k];
        return { nx: nu * fz - nv * fx, nz: -nu * fx - nv * fz, into: pen[k], what: b.style === 'chapel' ? 'ran into the church' : 'ran into a house' };
      }
    }
    return null;
  }

  /**
   * Whether a point is in the village: on a lane or a few metres off it, or about a house. There a skier is off the piste but not out
   * of bounds, as on a forgotten slope's way: the village is skied into and through.
   */
  holds(x: number, z: number): boolean {
    return this.houses.some((b) => Math.hypot(x - b.x, z - b.z) < Math.max(b.w, b.d) / 2 + 10) || this.lanes.some((l) => offLine(l, x, z) < 5);
  }

  /** Where each house stands, in the land's own measures, for a script (`__slope.village()`). */
  list(): { style: string; x: number; z: number; y: number; w: number; d: number; turn: number }[] {
    return this.houses.map((b) => ({ style: b.style, x: round(b.x), z: round(b.z), y: b.y, w: b.w, d: b.d, turn: b.turn ?? 0 }));
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.group.removeFromParent();
  }
}

/** A block of stone under a house: its four corners, from `y0` up to `y1`, its sides (its top is the house's floor). */
function footing(m: MeshBuilder, ring: Pt[], y0: number, y1: number, c: Colour): void {
  const face = (pts: [number, number, number][], nx: number, ny: number, nz: number) => {
    const ids = pts.map(([x, y, z], i) => m.addVertex(x, y, z, nx, ny, nz, i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0, c[0], c[1], c[2]));
    m.addTriangle(ids[0], ids[1], ids[2]); m.addTriangle(ids[0], ids[2], ids[3]);
  };
  // (Each side facing out of the ring, whichever way round the ring goes, told from its middle; and its corners going round
  // anticlockwise as it is seen from outside, from the corner on the left as one looks at it, which is the one along (−nz, nx).)
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length], l = Math.hypot(bx - ax, bz - az) || 1;
    let nx = (bz - az) / l, nz = -(bx - ax) / l;
    if (((ax + bx) / 2 - cx) * nx + ((az + bz) / 2 - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const [p, q] = (bx - ax) * nz - (bz - az) * nx > 0 ? [[ax, az], [bx, bz]] : [[bx, bz], [ax, az]];
    face([[p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]]], nx, 0, nz);
  }
}
