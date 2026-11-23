/**
 * A ski run found in a world (asked: "a 100m wide nearland slice of our actual winter gameworld starting on high slopes at suitable
 * location, no buildings or locations"): a line down a mountain from high on it, as a skier would take it; and the land fifty
 * metres either side of that line, at a metre, as the walk page makes the world's near land (`stream.ts`), lying under snow.
 *
 * The line is found, not drawn. A world's range is mostly walls too steep to ski, falling to the floors of its glens (at 400 to 500
 * metres up, seven tenths of the land is steeper than 36 degrees over forty metres); what can be skied high up is its tops, rounded,
 * and the broad spurs running down from them. So a line does not simply fall the steepest way down. From points high on the land,
 * well away from the world's places, its towns and its roads, a line is let go, a step at a time: it looks some way ahead in every
 * way it could turn to, no more sharply than a curve of `bend` allows, and goes the way that falls most steeply short of what is too
 * steep to ski, whose land lies most nearly level across it (along a spur, not across a hillside) and that turns least; until no way
 * on falls and is skiable, or it meets water, or comes near something built. Of all the lines let go, the one kept starts highest and
 * falls furthest, over a good length.
 */
import { HeightField } from './terrain';
import { COVER, TILE, type World, worldTile } from './world';
import { makeSquare, SQUARE, type TileData, type TileGrid, tilesFor } from './stream';
import { landAt, landOfWorld } from './worldLand';
import { type Grid, gridAt, type SkiSlice } from './skiSlice';

/** What a run is looked for in: a world's land on its lattice, what lies at each point, and what is built in it. */
export type RunWorld = Pick<World, 'field' | 'cover' | 'places' | 'towns' | 'ways' | 'plan'>;

/** A run: its line, a point every `step` metres from its top (x, z in the world's coordinates), the land's height there; and what it is like. */
export interface SkiRun { step: number; points: [number, number][]; heights: number[]; drop: number; length: number; score: number; steepest: number; mean: number; crest: number }

/** How a line is let go, what it keeps to and what it keeps away from. */
export const RUN = {
  /**
   * Each step, metres; the tightest curve, metres from its middle; the slice's half-breadth (the near land, drawn true, for the eye);
   * the skiable path's least half-breadth (asked: "20m minimum is plenty wide skiable path"); how far ahead the line looks.
   */
  step: 4, bend: 60, half: 50, path: 10, ahead: 40,
  /** The longest line let go; the shortest kept; the least drop kept. */
  longest: 4000, shortest: 600, least: 150,
  /** How far the slice keeps from a place (its middle: a place reaches some hundreds of metres about it), from a town or village, and a road. */
  place: 550, town: 300, road: 60,
  /**
   * Skiable land: no steeper than `steep` degrees over sixteen metres; a path about the line is skiable where so much of the land
   * within its half-breadth is (`share`). The line falls as steeply as `aim` if it can, never less than `gentle`, and the land across
   * the path, `side` metres either way, tilts no more than `across`; it keeps to a crest where it can, the land `crest` metres either
   * side lower than it.
   */
  steep: 36, share: 0.75, aim: 22, gentle: 3, side: 10, across: 22, crest: 40,
  /**
   * The land of a run's world above `above` metres brought lower, to `keep` of its height over that (asked: "you can scale down a bit
   * the part above 300m elevation if it helps?"): the range's walls, in the slice, at a slope a skier can come down. Only in the slice:
   * the world itself, and every place built in it, keep their land.
   */
  squash: { above: 300, keep: 0.5 },
};

/** A height of the world's land as the slice has it: above `RUN.squash.above`, brought lower. */
export const squash = (h: number) => (h <= RUN.squash.above ? h : RUN.squash.above + (h - RUN.squash.above) * RUN.squash.keep);

const deg = (r: number) => (r * 180) / Math.PI, rad = (d: number) => (d * Math.PI) / 180;

/** The land smoothed over some tens of metres: twice a box of `r` lattice points each way. */
export function smoothed(f: HeightField, r: number): HeightField {
  const out = new HeightField(f.x0, f.z0, f.cell, f.nx, f.nz), tmp = new Float32Array(f.data.length), { nx, nz } = f;
  let src = f.data;
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, i - r); k <= Math.min(nx - 1, i + r); k++) { s += src[j * nx + k]; n++; }
      tmp[j * nx + i] = s / n;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0, n = 0;
      for (let k = Math.max(0, j - r); k <= Math.min(nz - 1, j + r); k++) { s += tmp[k * nx + i]; n++; }
      out.data[j * nx + i] = s / n;
    }
    src = out.data.slice();
  }
  return out;
}

/**
 * Where on a world's lattice (`f`, the world's land as the slice has it) a path could be skied: points where, within the path's
 * half-breadth about them, enough of the land is skiable and none of it water; and how far each lies inside the land so marked, metres.
 */
export function skiableLand(w: RunWorld, f: HeightField = w.field): { band: Uint8Array; inside: Float32Array } {
  const { nx, nz } = f, ok = new Uint8Array(nx * nz), wet = new Uint8Array(nx * nz);
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const k = j * nx + i, c = w.cover[k], gx = (f.data[k + 1] - f.data[k - 1]) / (2 * f.cell), gz = (f.data[k + nx] - f.data[k - nx]) / (2 * f.cell);
    wet[k] = c === COVER.sea || c === COVER.lake || c === COVER.marsh ? 1 : 0;
    ok[k] = !wet[k] && deg(Math.atan(Math.hypot(gx, gz))) <= RUN.steep ? 1 : 0;
  }
  // (Sums over boxes by a table of sums from the north-west corner.)
  const table = (src: Uint8Array) => {
    const s = new Float64Array((nx + 1) * (nz + 1));
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) s[(j + 1) * (nx + 1) + i + 1] = src[j * nx + i] + s[j * (nx + 1) + i + 1] + s[(j + 1) * (nx + 1) + i] - s[j * (nx + 1) + i];
    return s;
  };
  const okSum = table(ok), wetSum = table(wet), r = Math.max(1, Math.round(RUN.path / f.cell)), area = (2 * r + 1) ** 2, band = new Uint8Array(nx * nz);
  const box = (s: Float64Array, i: number, j: number) => s[(j + r + 1) * (nx + 1) + i + r + 1] - s[(j - r) * (nx + 1) + i + r + 1] - s[(j + r + 1) * (nx + 1) + i - r] + s[(j - r) * (nx + 1) + i - r];
  for (let j = r; j < nz - r; j++) for (let i = r; i < nx - r; i++) band[j * nx + i] = box(okSum, i, j) / area >= RUN.share && box(wetSum, i, j) === 0 ? 1 : 0;
  // How far inside: by passes of the nearest step each way (a chamfer of 1 and the square root of 2, times the lattice's cell).
  const inside = new Float32Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) inside[k] = band[k] ? 1e9 : 0;
  const pass = (j0: number, j1: number, dj: number, i0: number, i1: number, di: number) => {
    for (let j = j0; j !== j1; j += dj) for (let i = i0; i !== i1; i += di) {
      const k = j * nx + i;
      if (!inside[k]) continue;
      let v = inside[k];
      for (const [a, b, c] of [[-di, 0, 1], [0, -dj, 1], [-di, -dj, Math.SQRT2], [di, -dj, Math.SQRT2]] as const) {
        const ii = i + a, jj = j + b;
        if (ii >= 0 && jj >= 0 && ii < nx && jj < nz) v = Math.min(v, inside[jj * nx + ii] + c * f.cell);
      }
      inside[k] = v;
    }
  };
  pass(0, nz, 1, 0, nx, 1);
  pass(nz - 1, -1, -1, nx - 1, -1, -1);
  return { band, inside };
}

/** Looks for the best run in a world; and every run that was kept, best first (for a picture of the search). */
export function findSkiRun(w: RunWorld): { best: SkiRun | null; kept: SkiRun[]; tried: number } {
  const f = new HeightField(w.field.x0, w.field.z0, w.field.cell, w.field.nx, w.field.nz);
  f.data.set(w.field.data.map(squash));
  const soft = smoothed(f, 1), { hx, hz } = w.plan, { nx, nz } = f, { band, inside } = skiableLand(w, f);
  const h = (x: number, z: number) => soft.smoothAt(x, z);
  const cellOf = (x: number, z: number) => {
    const i = Math.round((x - f.x0) / f.cell), j = Math.round((z - f.z0) / f.cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i;
  };
  const roads = w.ways.filter((r) => r.kind === 'road').flatMap((r) => r.points);
  /** Whether a point is too near anything built: a place, a town, a road. */
  const built = (x: number, z: number, more = 0) =>
    w.places.some((p) => Math.hypot(p.x - x, p.z - z) < RUN.place + more) || w.towns.some((t) => Math.hypot(t.x - x, t.z - z) < RUN.town + more)
    || roads.some(([px, pz]) => Math.hypot(px - x, pz - z) < RUN.road + more);
  /** How far the land at a point stands over the land `RUN.crest` metres either side of the way `a` (a crest's, the more the higher). */
  const crestAt = (x: number, z: number, a: number) => {
    const dx = Math.cos(a), dz = Math.sin(a), c = RUN.crest;
    return h(x, z) - (h(x - dz * c, z + dx * c) + h(x + dz * c, z - dx * c)) / 2;
  };
  /**
   * How good a way on is, from (`x`, `z`) at `a` (radians from +x towards +z) having turned `turned` to it: none if it does not fall,
   * leaves the land where a path can be skied, or is too steep anywhere over the way ahead, or the land tilts too much across it;
   * else how steeply it falls, up to the aim, more the more it keeps to a crest (asked: "riding down along a mountain ridge/crest could
   * be cool!") and inside the skiable land, less for the tilt across it and the turn.
   */
  const worth = (x: number, z: number, a: number, turned: number): number | null => {
    const dx = Math.cos(a), dz = Math.sin(a), h0 = h(x, z), parts = 5, seg = RUN.ahead / parts;
    let prev = h0, deep = Infinity;
    for (let k = 1; k <= parts; k++) {
      const px = x + dx * seg * k, pz = z + dz * seg * k, c = cellOf(px, pz), y = h(px, pz);
      if (c < 0 || !band[c] || deg(Math.atan((prev - y) / seg)) > RUN.steep) return null;
      deep = Math.min(deep, inside[c]);
      prev = y;
    }
    const fall = deg(Math.atan((h0 - prev) / RUN.ahead));
    if (fall < RUN.gentle) return null;
    const ex = x + dx * RUN.ahead, ez = z + dz * RUN.ahead;
    const tilt = deg(Math.atan(Math.abs(h(ex - dz * RUN.side, ez + dx * RUN.side) - h(ex + dz * RUN.side, ez - dx * RUN.side)) / (2 * RUN.side)));
    if (tilt > RUN.across) return null;
    const crest = Math.max(-10, Math.min(20, crestAt(ex, ez, a)));
    return Math.min(fall, RUN.aim) - 0.5 * Math.max(0, fall - RUN.aim) + 0.3 * crest + 0.1 * Math.min(deep, 16) - 0.3 * tilt - 0.12 * Math.abs(deg(turned));
  };
  const kept: SkiRun[] = [], turnMost = RUN.step / RUN.bend;
  let tried = 0;
  // The starts: every point of the land where a band can be skied, high enough to be worth a run down, away from anything built.
  for (let j = 2; j < nz - 2; j += 2) for (let i = 2; i < nx - 2; i += 2) {
    const k0 = j * nx + i, sx = f.x0 + i * f.cell, sz = f.z0 + j * f.cell;
    if (!band[k0] || f.data[k0] < 150 || Math.abs(sx) > hx - 300 || Math.abs(sz) > hz - 300 || built(sx, sz, RUN.half)) continue;
    tried++;
    // Its first way: the best of all ways round.
    let best = -Infinity, a = 0;
    for (let d = 0; d < 360; d += 5) { const v = worth(sx, sz, rad(d), 0); if (v !== null && v > best) { best = v; a = rad(d); } }
    if (best === -Infinity) continue;
    const points: [number, number][] = [[sx, sz]];
    let x = sx, z = sz, why = 'longest';
    while (points.length * RUN.step < RUN.longest) {
      // Each way it could turn to, from as far as a step allows one way to as far the other.
      let pick = -Infinity, to = a;
      for (let t = -turnMost; t <= turnMost + 1e-9; t += turnMost / 3) { const v = worth(x, z, a + t, (t / turnMost) * rad(10)); if (v !== null && v > pick) { pick = v; to = a + t; } }
      // (Come to a corner, where the ground it follows turns more sharply than that, as a spur's end into a glen: a sharper turn, up to
      // an eighth of the way round, where nothing gentler goes on.)
      if (pick === -Infinity) for (let t = -rad(45); t <= rad(45) + 1e-9; t += rad(5)) { const v = worth(x, z, a + t, t); if (v !== null && v > pick) { pick = v; to = a + t; } }
      if (pick === -Infinity) { why = 'no way on'; break; }
      a = to;
      x += Math.cos(a) * RUN.step; z += Math.sin(a) * RUN.step;
      if (Math.abs(x) > hx - 200 || Math.abs(z) > hz - 200 || built(x, z, RUN.half)) { why = 'built or edge'; break; }
      points.push([x, z]);
    }
    const hs = points.map(([px, pz]) => h(px, pz)), length = (points.length - 1) * RUN.step, drop = hs[0] - hs[hs.length - 1];
    if (length < RUN.shortest || drop < RUN.least) continue;
    // (How much of it keeps to a crest, the land falling away five metres and more either side.)
    let onCrest = 0;
    for (let k = 1; k < points.length; k++) { const [px, pz] = points[k], [qx, qz] = points[k - 1]; if (crestAt(px, pz, Math.atan2(pz - qz, px - qx)) > 5) onCrest += RUN.step; }
    let steepest = 0;
    const per = Math.round(RUN.ahead / RUN.step);
    for (let k = per; k < points.length; k += per) steepest = Math.max(steepest, deg(Math.atan((hs[k - per] - hs[k]) / RUN.ahead)));
    const mean = deg(Math.atan(drop / length));
    // (The drop, and the height it starts from, worth most (asked: "starting on high slopes"); the length, so that a run long enough
    // to ski for a while is chosen over a short steep one; and how much of it is along a crest.)
    const score = drop + 2 * hs[0] + 0.25 * length + 0.6 * onCrest;
    kept.push({ step: RUN.step, points, heights: hs, drop, length, score, steepest, mean, crest: onCrest });
  }
  kept.sort((p, q) => q.score - p.score);
  // (Many starts come down the same way: of those that run together for long, keep the best.)
  const distinct: SkiRun[] = [];
  for (const r of kept) {
    const mid = r.points[Math.floor(r.points.length / 2)];
    if (distinct.some((d) => d.points.some(([px, pz]) => Math.hypot(px - mid[0], pz - mid[1]) < 60))) continue;
    distinct.push(r);
  }
  return { best: distinct[0] ?? null, kept: distinct, tried };
}

/**
 * How a slice is made: the land about the run some hundreds of metres out (`near`, at `nearCell`), the country some kilometres out
 * (`far`, at `farCell`); how far the snow at a metre smooths the land (a box `blur` metres each way, twice) and how deep it lies; over
 * how many metres at the slice's edge its snow passes to the land about it, and the land about it, at its edge, to the country's.
 */
export const SLICE = { near: 250, nearCell: 4, far: 3000, farCell: 16, blur: 2, depth: 0.3, edge: 6, ringBlend: 60 };

/** The snow on a world's land about a run: at a metre within `RUN.half` of its line, and coarser further out (`skiSlice.ts`). */
export function sliceOfRun(w: World, run: SkiRun): SkiSlice {
  const p = w.plan, grid: TileGrid = { stride: TILE.stride, over: TILE.over, hx: p.hx, hz: p.hz }, land = landOfWorld(w);
  const xs = run.points.map(([x]) => x), zs = run.points.map(([, z]) => z);
  const x0 = Math.max(-p.hx, Math.floor(Math.min(...xs) - SLICE.near)), x1 = Math.min(p.hx - 1, Math.ceil(Math.max(...xs) + SLICE.near));
  const z0 = Math.max(-p.hz, Math.floor(Math.min(...zs) - SLICE.near)), z1 = Math.min(p.hz - 1, Math.ceil(Math.max(...zs) + SLICE.near));
  // The world's tiles under it, made once, and taken into the world's land so that the country about it is read from them too.
  const tiles = new Map<string, TileData>();
  const tile = (i: number, j: number): TileData => {
    const key = `${i},${j}`;
    let t = tiles.get(key);
    if (!t) {
      const w5 = worldTile(w, i, j), f = w5.field;
      t = { i, j, ox: w5.ox, oz: w5.oz, x0: f.x0, z0: f.z0, cell: f.cell, nx: f.nx, nz: f.nz, data: f.data };
      tiles.set(key, t);
      land.tiles.set(key, { ox: w5.ox, oz: w5.oz, field: f });
    }
    return t;
  };
  // The near land at a metre, from the squares the walk page makes (with no place, way or house in them).
  const nx = x1 - x0 + 1, nz = z1 - z0 + 1, ground = new Float32Array(nx * nz);
  for (let j = Math.floor((z0 + p.hz) / SQUARE.size); j <= Math.floor((z1 + p.hz) / SQUARE.size); j++)
    for (let i = Math.floor((x0 + p.hx) / SQUARE.size); i <= Math.floor((x1 + p.hx) / SQUARE.size); i++) {
      const s = makeSquare(grid, tilesFor(grid, i, j).map(([a, b]) => tile(a, b)), i, j, p.n);
      for (let jj = 0; jj < SQUARE.n; jj++) for (let ii = 0; ii < SQUARE.n; ii++) {
        const x = s.x0 + ii, z = s.z0 + jj;
        if (x >= x0 && x <= x1 && z >= z0 && z <= z1) ground[(z - z0) * nx + (x - x0)] = squash(s.heights[jj * SQUARE.n + ii]);
      }
    }
  // The snow on it: the land smoothed over a few metres (hollows filled, knobs rounded over), and a little deeper.
  const snowAll = boxBlur(boxBlur(ground, nx, nz, SLICE.blur), nx, nz, SLICE.blur).map((v) => v + SLICE.depth);
  // The country about it, from the world's land (its tiles near, its lattice of 8 metres beyond, mirrored past its edges).
  const [mx, mz] = run.points[Math.floor(run.points.length / 2)], fc = SLICE.farCell, fn = Math.round((2 * SLICE.far) / fc) + 1;
  const far: Grid = { x0: Math.round(mx - SLICE.far), z0: Math.round(mz - SLICE.far), cell: fc, nx: fn, nz: fn, data: new Float32Array(fn * fn) };
  const cover = new Uint8Array(fn * fn), f8 = w.field, mirror = (v: number, h: number) => (v > h ? 2 * h - v : v < -h ? -2 * h - v : v);
  /** The world's lattice point nearest a point (mirrored past its edges, as its land is). */
  const cellOf = (x: number, z: number) => {
    const ci = Math.round((mirror(x, p.hx - 4) - f8.x0) / f8.cell), cj = Math.round((mirror(z, p.hz - 4) - f8.z0) / f8.cell);
    return Math.max(0, Math.min(f8.nz - 1, cj)) * f8.nx + Math.max(0, Math.min(f8.nx - 1, ci));
  };
  /** The land (as the slice has it, brought lower above `RUN.squash.above`), or the water over it: the sea's surface, or a lake's (frozen, in winter). */
  const water = (x: number, z: number, h: number) => {
    const k = cellOf(x, z);
    if (z > p.hz || w.cover[k] === COVER.sea) return Math.max(h, 0);
    return w.lake[k] > 0 ? Math.max(h, squash(w.lake[k])) : h;
  };
  for (let j = 0; j < fn; j++) for (let i = 0; i < fn; i++) {
    const x = far.x0 + i * fc, z = far.z0 + j * fc;
    far.data[j * fn + i] = water(x, z, squash(landAt(land, x, z)));
    cover[j * fn + i] = z > p.hz ? COVER.sea : w.cover[cellOf(x, z)];
  }
  // The land about the run at four metres: the snow, passing over its outermost metres to the country's.
  const nc = SLICE.nearCell, rnx = Math.floor((nx - 1) / nc) + 1, rnz = Math.floor((nz - 1) / nc) + 1;
  const near: Grid = { x0, z0, cell: nc, nx: rnx, nz: rnz, data: new Float32Array(rnx * rnz) };
  for (let j = 0; j < rnz; j++) for (let i = 0; i < rnx; i++) {
    const x = x0 + i * nc, z = z0 + j * nc, own = water(x, z, snowAll[j * nc * nx + i * nc]), edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    const t = smooth01(1 - edge / SLICE.ringBlend), country = gridAt(far, x, z);
    near.data[j * rnx + i] = Number.isNaN(country) ? own : own + (country - own) * t;
  }
  // How far each point at a metre is from the line; the snow at a metre within the slice, passing at its edge to the land about it.
  const reach = RUN.half + 1, dist = new Float32Array(nx * nz).fill(Infinity);
  for (const [px, pz] of run.points) {
    const ci = Math.round(px - x0), cj = Math.round(pz - z0);
    for (let j = Math.max(0, cj - reach); j <= Math.min(nz - 1, cj + reach); j++) for (let i = Math.max(0, ci - reach); i <= Math.min(nx - 1, ci + reach); i++) {
      const d = Math.hypot(x0 + i - px, z0 + j - pz);
      if (d < dist[j * nx + i]) dist[j * nx + i] = d;
    }
  }
  const snow: Grid = { x0, z0, cell: 1, nx, nz, data: new Float32Array(nx * nz).fill(NaN) };
  for (let k = 0; k < nx * nz; k++) {
    const d = dist[k];
    if (d > RUN.half) continue;
    const x = x0 + (k % nx), z = z0 + Math.floor(k / nx), t = smooth01((d - (RUN.half - SLICE.edge)) / SLICE.edge);
    snow.data[k] = snowAll[k] + (gridAt(near, x, z) - snowAll[k]) * t;
  }
  // The skiable path: from the line out either way, as far as the snow is no steeper than skiable (over four metres) and within the
  // slice; then each edge kept no further out than the nearest point of it over the sixteen metres before and after, and smoothed
  // over the thirty-two before and after (a path narrowing as it comes onto a crest, not all at once);
  // never nearer the line than the path's least half-breadth. Beyond it the snow is there to be seen, not skied.
  const across = (k: number, side: number) => {
    const [px, pz] = run.points[k], [ax, az] = run.points[Math.max(0, k - 1)], [bx, bz] = run.points[Math.min(run.points.length - 1, k + 1)];
    const l = Math.hypot(bx - ax, bz - az) || 1, lx = (bz - az) / l, lz = -(bx - ax) / l, steep = Math.tan((RUN.steep * Math.PI) / 180);
    let out = 0;
    for (let d = 1; d <= RUN.half - 4; d++) {
      const x = px + lx * d * side, z = pz + lz * d * side, e = 2;
      const gx = (gridAt(snow, x + e, z) - gridAt(snow, x - e, z)) / (2 * e), gz = (gridAt(snow, x, z + e) - gridAt(snow, x, z - e)) / (2 * e);
      if (!(Math.hypot(gx, gz) <= steep)) break;
      out = d;
    }
    return out;
  };
  const reachL = run.points.map((_, k) => across(k, 1)), reachR = run.points.map((_, k) => across(k, -1)), within = Math.round(16 / run.step), over = Math.round(32 / run.step);
  const edge = (reach: number[]) => {
    const least = reach.map((_, k) => Math.min(...reach.slice(Math.max(0, k - within), k + within + 1)));
    return least.map((_, k) => { const w = least.slice(Math.max(0, k - over), k + over + 1); return Math.max(RUN.path, w.reduce((a, b) => a + b, 0) / w.length); });
  };
  const lefts = edge(reachL), rights = edge(reachR);
  // (Named for the nearest of the world's great peaks.)
  let peak = '', nearest = Infinity;
  w.peaks.forEach((q, k) => { const d = Math.hypot(q.x - run.points[0][0], q.z - run.points[0][1]); if (d < nearest) { nearest = d; peak = w.peakNames[k] ?? ''; } });
  return {
    world: p.seed, worldName: w.name, peak,
    run: {
      step: run.step, points: run.points, heights: run.points.map(([x, z]) => gridAt(snow, x, z)), drop: run.drop, length: run.length, mean: run.mean, steepest: run.steepest,
      piste: run.points.map((_, k) => [-rights[k], lefts[k]] as [number, number]), squash: { ...RUN.squash },
    },
    half: RUN.half, snow, near, far, cover,
  };
}

const smooth01 = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** The mean over a box `r` points each way about each point (fewer at the edges). */
function boxBlur(src: Float32Array, nx: number, nz: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - r); k <= Math.min(nx - 1, i + r); k++) { s += src[j * nx + k]; n++; }
    tmp[j * nx + i] = s / n;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, j - r); k <= Math.min(nz - 1, j + r); k++) { s += tmp[k * nx + i]; n++; }
    out[j * nx + i] = s / n;
  }
  return out;
}
