import { Rng } from './rng';
import { fbmd, HeightField, landDetail, wearByFrost, wearByWater } from './terrain';
import { Ground, groundsOpen, withGrounds } from './fit';
import { gradeHeights, Way, WAY, WayIndex, withWay } from './way';

/**
 * A place built into the world over a square of its land (`PlaceHole` in `render/placePack.ts`, where it is made): its square's middle,
 * turn and half-breadths, and the height of the place's land all round the square's edge, every `step` metres. Here only as numbers,
 * so that the workers making squares need nothing of the place's but this.
 */
export interface Hole { cx: number; cz: number; turn: number; hx: number; hz: number; step: number; profile: Float32Array; gap?: Float32Array }

/**
 * How far outside a hole's square a point lies (less than nothing inside), the place's land at the nearest point of its edge, and how far
 * that stands from the world's own land there (`gap`, as the place's worker measured it; nothing if not given).
 */
export function holeAt(h: Hole, x: number, z: number): { out: number; edge: number; gap: number } {
  const c = Math.cos(h.turn), s = Math.sin(h.turn), dx = x - h.cx, dz = z - h.cz;
  // (Into the square's own two ways: the inverse of the place's turn.)
  const lx = c * dx + s * dz, lz = -s * dx + c * dz;
  const ox = Math.abs(lx) - h.hx, oz = Math.abs(lz) - h.hz;
  const out = ox > 0 || oz > 0 ? Math.hypot(Math.max(0, ox), Math.max(0, oz)) : Math.max(ox, oz);
  // The nearest point of the edge, and how far round from the corner at the square's own least x and z it lies.
  let ex = Math.min(h.hx, Math.max(-h.hx, lx)), ez = Math.min(h.hz, Math.max(-h.hz, lz));
  if (out < 0) { if (ox > oz) ex = Math.sign(lx) * h.hx; else ez = Math.sign(lz) * h.hz; }
  const w = 2 * h.hx, d = 2 * h.hz;
  const round = ez <= -h.hz + 1e-6 ? ex + h.hx : ex >= h.hx - 1e-6 ? w + (ez + h.hz) : ez >= h.hz - 1e-6 ? w + d + (h.hx - ex) : 2 * w + d + (h.hz - ez);
  const n = h.profile.length, f = round / h.step, i = Math.floor(f), t = f - i, a = ((i % n) + n) % n, b = (((i + 1) % n) + n) % n;
  return { out, edge: h.profile[a] * (1 - t) + h.profile[b] * t, gap: h.gap ? h.gap[a] * (1 - t) + h.gap[b] * t : 0 };
}

/**
 * The land at a point with a place's land met (`holeAt`): outside its square, brought to the place's height at the edge over a band
 * the broader the more the place's land stands off the world's there (thirty metres, and three times that more: behind a valley's head
 * the place's land stands some tens of metres over the world's, and brought down over thirty metres it was a cliff); inside, a little
 * under the place's own land, which is drawn there instead (the squares are cut away inside: `squareBuilders`'s `skip`), so that where
 * the two overlap at the edge the place's is seen. The band's breadth goes by where along the edge a point is, not by the point's own
 * height: by that, a way's bed and the grass beside it, a metre apart, were brought in by different shares, and the way stood up out of
 * the land as a causeway. A function of where the point lies and of the land there alone, so squares still meet.
 */
export function withHole(h: Hole, x: number, z: number, natural: number): number {
  const { out, edge, gap } = holeAt(h, x, z);
  if (out <= 0) return edge - 0.25 * smooth(-out / 1.5);
  const band = 30 + 3 * Math.abs(gap);
  return out >= band ? natural : edge + (natural - edge) * smooth(out / band);
}

/**
 * A way graded again on the land as it lies with places standing in the world (`withHole`): where it comes through the band about a
 * place, the land there is brought to the place's, and a bed graded on the land as it was stood off it, tilted across or buried. So
 * the land under each of its points is taken as the place leaves it and the bed drawn out smooth again (`gradeHeights`); the squares
 * meet the places first and cut the way into that (`makeSquare`).
 */
export function wayThroughHoles(way: Way, holes: Hole[]): Way {
  if (!holes.length) return way;
  const land = way.heights.map((y, k) => holes.reduce((v, h) => withHole(h, way.points[k][0], way.points[k][1], v), y)), drawn = gradeHeights(land);
  // (Near a place's edge the bed is the land's own, the smoothing coming back over forty metres out: drawn out smooth across the edge,
  // it fell short of the place's land where it came in, by metres, and the body met a step.)
  return { ...way, heights: land.map((y, k) => {
    const out = Math.min(...holes.map((h) => holeAt(h, way.points[k][0], way.points[k][1]).out));
    return Math.round((y + (drawn[k] - y) * smooth(out / 40)) * 1000) / 1000;
  }) };
}

/**
 * The world's land at a metre, made a square at a time where it is wanted (`docs/06-world.md`,
 * step 2): squares 256 metres on a side on a fixed grid in the world, so that a square is the same
 * whoever asks for it and whenever. A square is made from the world's tiles of 5 metres under it
 * (`worldTile`), blended where tiles overlap, with detail laid on finer than they hold, and worn a
 * little by water and frost at its own scale. The wear fades out towards the square's edge, so that
 * along its edge a square is the plain function of the tiles and the detail, which its neighbour
 * shares: two squares meet exactly. Nothing here draws: what is drawn is made from the heights and
 * from how far each point may be left out (`errorsOf`), by `streamMesh.ts`.
 *
 * Coordinates are the world's (`x` east, `z` south, metres from its middle).
 */

/** The squares' grid: 256 metres, 257 points a side at a metre, from the world's north-west corner. */
export const SQUARE = { size: 256, n: 257 };
/** How far beyond a square its land is made and worn, so the wear at its edge has ground to run on; and how far in from the edge the wear fades in. */
const APRON = 24, FADE = 20;
/** What a point of a way's bed counts as for the mesh, in metres: kept in every mesh of a square within some 250 metres (`LEVELS` in the walk page). */
const WAY_KEEP = 0.5;

/** What a square needs of the world's tiles: each tile's lattice and where its middle lies (`ox`, `oz`). */
export interface TileData { i: number; j: number; ox: number; oz: number; x0: number; z0: number; cell: number; nx: number; nz: number; data: Float32Array }
/** The tiles' grid, as the world has it (`TILE` in `world.ts`): a tile every `stride` metres, reaching `over` beyond. */
export interface TileGrid { stride: number; over: number; hx: number; hz: number }

/** Where a square lies: its north-west corner in the world. */
export function squareOrigin(g: TileGrid, i: number, j: number): [number, number] {
  return [-g.hx + i * SQUARE.size, -g.hz + j * SQUARE.size];
}

/** How many squares the world holds each way. */
export function squareCount(g: TileGrid): [number, number] {
  return [Math.ceil((2 * g.hx) / SQUARE.size), Math.ceil((2 * g.hz) / SQUARE.size)];
}

/** The tiles a square's land is read from (with its apron): every tile whose lattice covers any of it. */
export function tilesFor(g: TileGrid, i: number, j: number): [number, number][] {
  const [x0, z0] = squareOrigin(g, i, j), out: [number, number][] = [];
  const reach = g.stride / 2 + g.over;
  const tx = Math.round((2 * g.hx) / g.stride), tz = Math.round((2 * g.hz) / g.stride);
  for (let tj = 0; tj < tz; tj++) for (let ti = 0; ti < tx; ti++) {
    const ox = -g.hx + g.stride / 2 + ti * g.stride, oz = -g.hz + g.stride / 2 + tj * g.stride;
    if (x0 - APRON < ox + reach && x0 + SQUARE.size + APRON > ox - reach && z0 - APRON < oz + reach && z0 + SQUARE.size + APRON > oz - reach) out.push([ti, tj]);
  }
  return out;
}

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/**
 * The land of the tiles at a point: each tile's height there, weighed by how far inside its own
 * lattice the point lies, so that across the strip where two tiles overlap the land passes from one
 * to the other. (Tiles are worn each alone and differ there; read from one tile or the other, two
 * squares either side of the strip would not meet.)
 */
export function tilesAt(tiles: { t: TileData; f: HeightField }[], g: TileGrid, x: number, z: number): number {
  let sum = 0, weight = 0;
  for (const { t, f } of tiles) {
    const lx = x - t.ox, lz = z - t.oz, reach = g.stride / 2 + g.over;
    const inside = Math.min(reach - Math.abs(lx), reach - Math.abs(lz));
    if (inside <= 0) continue;
    // (Full weight from the tile's own two kilometres inward; nothing at its lattice's edge.)
    const w = smooth(inside / (2 * g.over)) + 1e-6;
    sum += w * f.smoothAt(lx, lz); weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/**
 * Detail finer than the tiles hold, in metres: knolls and hollows tens of metres across, a metre or
 * two high where the ground is rough and less where it is gentle; and small unevenness on that.
 */
export function detailAt(x: number, z: number, slope: number, seed: number): number {
  const rough = 0.5 + 1.6 * smooth(slope / 0.5);
  return rough * (landDetail(x, z, 42, seed) + 0.25 * fbmd(x / 6, z / 6, 2, seed + 7));
}

/** The light wear a square is given at a metre: shallow gullies, the loose stuff they carry put down in hollows. */
const WEAR = { drops: 1.0, life: 40, inertia: 0.1, capacity: 0.4, erode: 0.12, deposit: 0.2, evaporate: 0.02, gravity: 4, radius: 1, most: 0.15 };
const CUT = 1.5, FILL = 0.6;

/** A made square: its heights at a metre (257 by 257, from its north-west corner), and how far each point may be left out. */
export interface Square { i: number; j: number; x0: number; z0: number; heights: Float32Array; errors: Float32Array; ms: number }

/**
 * Makes a square's land from the tiles under it. `seed` is the world's number for its noise. `grounds`
 * are the houses' grounds fitted to the land (`fit.ts`): made on it, levelled or terraced, with their
 * banks, after the wear; each a function of where a point lies alone, so two squares still meet.
 * `ways` are ways' beds (`way.ts`), cut and filled into the land after the wear and before the
 * grounds, alike in every square they pass through.
 */
export function makeSquare(g: TileGrid, tiles: TileData[], i: number, j: number, seed: number, grounds: Ground[] = [], ways: Way[] = [], holes: Hole[] = []): Square {
  const t0 = performance.now();
  const [x0, z0] = squareOrigin(g, i, j), n = SQUARE.n + 2 * APRON;
  const read = tiles.map((t) => { const f = new HeightField(t.x0, t.z0, t.cell, t.nx, t.nz); f.data.set(t.data); return { t, f }; });
  const f = new HeightField(x0 - APRON, z0 - APRON, 1, n, n);
  // The tiles' land, then the detail on it, rougher where the tiles' land is steep.
  for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) f.data[jj * n + ii] = tilesAt(read, g, f.x0 + ii, f.z0 + jj);
  const base = f.data.slice();
  for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) {
    const k = jj * n + ii, l = ii > 2 ? k - 3 : k, r = ii < n - 3 ? k + 3 : k, u = jj > 2 ? k - 3 * n : k, d = jj < n - 3 ? k + 3 * n : k;
    const slope = Math.hypot((base[r] - base[l]) / Math.max(1, (r - l)), (base[d] - base[u]) / Math.max(1, (d - u) / n));
    f.data[k] = base[k] + detailAt(f.x0 + ii, f.z0 + jj, slope, seed);
  }
  // The wear, and then only so much of it as lies far enough in from the square's edge.
  const shaped = f.data.slice();
  wearByWater(f, new Rng(`square/${seed}/${i},${j}`), WEAR);
  for (let k = 0; k < f.data.length; k++) f.data[k] = Math.max(shaped[k] - CUT, Math.min(shaped[k] + FILL, f.data[k]));
  wearByFrost(f, 1, 1.4, 0.4);
  const out = new Float32Array(SQUARE.n * SQUARE.n);
  for (let jj = 0; jj < SQUARE.n; jj++) for (let ii = 0; ii < SQUARE.n; ii++) {
    const k = (jj + APRON) * n + ii + APRON, edge = Math.min(ii, jj, SQUARE.n - 1 - ii, SQUARE.n - 1 - jj);
    out[jj * SQUARE.n + ii] = shaped[k] + (f.data[k] - shaped[k]) * smooth(edge / FADE);
  }
  // Places built into the world: the land brought to meet each place's at the edge of its square (`withHole`), before the ways are cut
  // into it (a way through the band is graded again on the land as the place leaves it: `wayThroughHoles`). (A band of up to some
  // hundreds of metres reaches out from a square half a kilometre across.)
  const nearHoles = holes.filter((h) => { const r = Math.hypot(h.hx, h.hz) + 600; return Math.abs(x0 + SQUARE.size / 2 - h.cx) < r + SQUARE.size && Math.abs(z0 + SQUARE.size / 2 - h.cz) < r + SQUARE.size; });
  if (nearHoles.length) for (let jj = 0; jj < SQUARE.n; jj++) for (let ii = 0; ii < SQUARE.n; ii++) {
    const k = jj * SQUARE.n + ii;
    for (const h of nearHoles) out[k] = withHole(h, x0 + ii, z0 + jj, out[k]);
  }
  // The ways through it, their beds cut and filled into the land (`withWay`): before the houses' grounds, which a way comes onto as
  // they lie. Each point of a way's bed and a strip either side is kept in every mesh near enough to see its track (`keep`): the
  // ground's material reads the track from a number that changes by a metre to the metre across it, and a triangle broader than the
  // track would spread that number over the grass.
  let keep: Float32Array | undefined;
  const near = ways.map((w) => new WayIndex(w)).filter((ix) => ix.touches(x0, z0, x0 + SQUARE.size, z0 + SQUARE.size));
  if (near.length) {
    keep = new Float32Array(SQUARE.n * SQUARE.n);
    const strip = WAY.half + WAY.shoulder + 4;
    for (let jj = 0; jj < SQUARE.n; jj++) for (let ii = 0; ii < SQUARE.n; ii++) {
      const k = jj * SQUARE.n + ii, x = x0 + ii, z = z0 + jj;
      // (A way's bed fades out over the last twenty-five metres before a place's edge, where the place's land is met as it lies: cut
      // level across there, the bed stood off the place's land, which can fall away steeply across a way's breadth, by metres.)
      const edge = nearHoles.length ? Math.min(...nearHoles.map((h) => smooth(holeAt(h, x, z).out / 25))) : 1;
      for (const ix of near) {
        out[k] = edge >= 1 ? withWay(ix, x, z, out[k]) : out[k] + (withWay(ix, x, z, out[k]) - out[k]) * edge;
        const n = ix.near(x, z);
        if (n && n.d < strip) keep[k] = WAY_KEEP;
      }
    }
  }
  if (grounds.length) for (let jj = 0; jj < SQUARE.n; jj++) for (let ii = 0; ii < SQUARE.n; ii++) {
    const k = jj * SQUARE.n + ii;
    out[k] = withGrounds(grounds, x0 + ii, z0 + jj, out[k]);
  }
  return { i, j, x0, z0, heights: out, errors: errorsOf(out, keep), ms: performance.now() - t0 };
}

/**
 * A square may be split into four of 128 metres, 257 points a side at half a metre, where the walker
 * is near and asks for it (`refineSquare`).
 */
export const FINE = { cell: 0.5, size: 128 };
/** The light wear a finer square is given at half a metre, on top of the square's own: rills a metre across, and how deep they may cut or fill. */
const FINE_WEAR = { drops: 0.5, life: 60, inertia: 0.1, capacity: 0.3, erode: 0.1, deposit: 0.2, evaporate: 0.02, gravity: 4, radius: 2, most: 0.06 };
const FINE_CUT = 0.35, FINE_FILL = 0.2, FINE_FADE = 12;

/**
 * Unevenness finer than a metre, in metres: tussocks and stones a hand high, more of them in some
 * patches than in others. A function of where a point lies alone, so that two finer squares meet. (Its
 * finest bumps are some two metres across: anything less would only flicker at half a metre.)
 */
export function fineAt(x: number, z: number, seed: number): number {
  const patch = smooth(0.5 + 1.5 * fbmd(x / 21, z / 21, 2, seed + 31));
  const tussocks = Math.max(0, fbmd(x / 1.1, z / 1.1, 1, seed + 37) + 0.04) * (0.14 + 0.22 * patch);
  const hummocks = 0.05 * fbmd(x / 3.2, z / 3.2, 1, seed + 41);
  // (Less what tussocks add on the whole, so the finer ground lies about where the square's own does.)
  return tussocks + hummocks - 0.019 - 0.02 * patch;
}

/** A quarter of a square at half a metre: where it lies, its heights (257 by 257 from its north-west corner), and how far each point may be left out. */
export interface FineSquare { x0: number; z0: number; heights: Float32Array; errors: Float32Array }

/**
 * Splits a made square into four at half a metre. Its own heights are drawn out smooth between its
 * points (Catmull-Rom, each way in turn, reading only points of the square itself, so that along an
 * edge only the edge is read and two squares drawn out meet as they did); the tussocks and stones of
 * `fineAt` are laid on; and rills are worn a little, fading out towards the square's edge as its own
 * wear does. None of it is laid on the houses' grounds, which are in the square already. Where a finer
 * square meets a square at a metre, the two differ by the tussocks alone, a hand at most, and the
 * skirts hide it.
 */
export function refineSquare(coarse: Float32Array, i: number, j: number, x0: number, z0: number, seed: number, grounds: Ground[] = []): { quarters: FineSquare[]; ms: number } {
  const t0 = performance.now(), c = SQUARE.n, last = c - 1, n = 2 * last + 1;
  const at = (a: number) => Math.min(last, Math.max(0, a));
  // Catmull-Rom halfway between two points, from the two either side.
  const half = (p0: number, p1: number, p2: number, p3: number) => (-p0 + 9 * p1 + 9 * p2 - p3) / 16;
  // Along the rows first (every point of each row of the square, and halfway between), then down the columns.
  const rows = new Float32Array(c * n);
  for (let r = 0; r < c; r++) for (let k = 0; k < n; k++) {
    const a = k >> 1, row = r * c;
    rows[r * n + k] = k & 1 ? half(coarse[row + at(a - 1)], coarse[row + a], coarse[row + at(a + 1)], coarse[row + at(a + 2)]) : coarse[row + a];
  }
  const f = new HeightField(x0, z0, FINE.cell, n, n);
  for (let jj = 0; jj < n; jj++) for (let k = 0; k < n; k++) {
    const b = jj >> 1;
    f.data[jj * n + k] = jj & 1 ? half(rows[at(b - 1) * n + k], rows[b * n + k], rows[at(b + 1) * n + k], rows[at(b + 2) * n + k]) : rows[b * n + k];
  }
  const drawn = f.data.slice();
  for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) f.data[jj * n + ii] += fineAt(x0 + ii * FINE.cell, z0 + jj * FINE.cell, seed);
  // The rills, only so deep, and only so much of them as lies far enough in from the square's edge.
  const shaped = f.data.slice();
  wearByWater(f, new Rng(`fine/${seed}/${i},${j}`), FINE_WEAR);
  wearByFrost(f, 1, 1.4, 0.4);
  for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) {
    const k = jj * n + ii, edge = Math.min(ii, jj, n - 1 - ii, n - 1 - jj) * FINE.cell;
    const worn = Math.max(shaped[k] - FINE_CUT, Math.min(shaped[k] + FINE_FILL, f.data[k]));
    const added = shaped[k] - drawn[k] + (worn - shaped[k]) * smooth(edge / FINE_FADE);
    // (The houses' grounds are in the square already, levelled; none of this is laid on them, and it eases in beyond.)
    f.data[k] = drawn[k] + added * (grounds.length ? groundsOpen(grounds, x0 + ii * FINE.cell, z0 + jj * FINE.cell) : 1);
  }
  const quarters: FineSquare[] = [];
  for (let q = 0; q < 4; q++) {
    const qi = (q & 1) * last, qj = (q >> 1) * last, h = new Float32Array(c * c);
    for (let jj = 0; jj < c; jj++) h.set(f.data.subarray((qj + jj) * n + qi, (qj + jj) * n + qi + c), jj * c);
    quarters.push({ x0: x0 + qi * FINE.cell, z0: z0 + qj * FINE.cell, heights: h, errors: errorsOf(h) });
  }
  return { quarters, ms: performance.now() - t0 };
}

/**
 * How far each point of a square may be left out of its mesh: the most the ground at that point (and
 * at every point of the triangles split at it) departs from the triangle it would otherwise lie in.
 * The square is cut into right triangles, each split at the middle of its long side into two more,
 * down to a metre (as Mapbox's Martini does it, after Evans, Kirkpatrick and Townsend's right-
 * triangulated irregular networks); a mesh true to within a given distance splits wherever this
 * says more than that distance.
 */
export function errorsOf(h: Float32Array, keep?: Float32Array): Float32Array {
  const size = SQUARE.n, tile = size - 1, count = tile * tile * 2 - 2, parents = count - tile * tile;
  const coords = triangleCoords(), err = new Float32Array(size * size);
  for (let i = count - 1; i >= 0; i--) {
    const k = i * 4, ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3];
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx, m = my * size + mx;
    // (`keep`: points to be kept at least to that distance, whatever the ground does there; carried up the hierarchy as the rest is.)
    err[m] = Math.max(err[m], Math.abs((h[ay * size + ax] + h[by * size + bx]) / 2 - h[m]), keep ? keep[m] : 0);
    if (i < parents) err[m] = Math.max(err[m], err[((ay + cy) >> 1) * size + ((ax + cx) >> 1)], err[((by + cy) >> 1) * size + ((bx + cx) >> 1)]);
  }
  return err;
}

let COORDS: Uint16Array | null = null;
/** The two ends of the long side of every triangle of the hierarchy, made once. */
function triangleCoords(): Uint16Array {
  if (COORDS) return COORDS;
  const tile = SQUARE.n - 1, count = tile * tile * 2 - 2, c = new Uint16Array(count * 4);
  for (let i = 0; i < count; i++) {
    let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
    if (id & 1) { bx = by = cx = tile; } else { ax = ay = cy = tile; }
    while ((id >>= 1) > 1) {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
      cx = mx; cy = my;
    }
    c[i * 4] = ax; c[i * 4 + 1] = ay; c[i * 4 + 2] = bx; c[i * 4 + 3] = by;
  }
  COORDS = c;
  return c;
}

/**
 * The triangles of a square's mesh true to within `maxError` metres, as corners on its lattice
 * (each three pairs of point numbers `i + j * 257`), and the points they use.
 */
export function meshTriangles(errors: Float32Array, maxError: number): { triangles: Uint32Array; count: number } {
  const size = SQUARE.n, tile = size - 1, out: number[] = [];
  const go = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) { go(cx, cy, ax, ay, mx, my); go(bx, by, cx, cy, mx, my); }
    else out.push(ay * size + ax, by * size + bx, cy * size + cx);
  };
  go(0, 0, tile, tile, tile, 0);
  go(tile, tile, 0, 0, 0, tile);
  return { triangles: Uint32Array.from(out), count: out.length / 3 };
}
