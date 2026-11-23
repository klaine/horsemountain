import { Rng } from './rng';

/**
 * Land made as land is made: a lattice of heights, given its detail by fractal noise and then
 * worn by water and frost. For places whose large shape is decided first (a mountain's top, its
 * ridge, its summit) and whose surface should then look as if weather had been at it for an age.
 *
 * The noise is Inigo Quilez's (iquilezles.org: "fBM", and "value noise derivatives"): value noise
 * whose slope is known exactly at every point, summed in octaves each twice as fine and half as
 * strong as the last (a Hurst exponent of one, as terrain has), each turned against the last so no
 * lattice lines up, and each damped by how steep the octaves above have already made the ground.
 * That damping is what makes it read as eroded: on the steep the fine octaves are lost, so slopes
 * run smooth into sharp ridges, and the small roughness is left on the flats and the crests.
 *
 * The wear is a simulation. Water: drops fall one at a time anywhere on the land and run downhill,
 * picking up as much as their speed and water let them carry where the ground falls away, and
 * putting it down where it levels out or rises, until they have dried up; tens of thousands of them
 * cut gullies that join and branch, and leave fans where the gullies come out. Frost: wherever one
 * point stands over its neighbour more steeply than broken rock can lie, some of it comes down.
 */

/** A point on Catmull and Rom's curve through four values a step apart, `t` of the way from the second to the third. */
function catmull(a: number, b: number, c: number, e: number, t: number): number {
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - e + t * (3 * (b - c) + e - a)));
}

/** Heights on a square lattice, `cell` metres apart, from (`x0`, `z0`). */
export class HeightField {
  readonly data: Float32Array;
  constructor(readonly x0: number, readonly z0: number, readonly cell: number, readonly nx: number, readonly nz: number) {
    this.data = new Float32Array(nx * nz);
  }
  /** Whether a point lies within the lattice. */
  holds(x: number, z: number): boolean {
    const fx = (x - this.x0) / this.cell, fz = (z - this.z0) / this.cell;
    return fx >= 0 && fz >= 0 && fx <= this.nx - 1 && fz <= this.nz - 1;
  }
  /** The height at a point, on a smooth curve through the sixteen lattice points about it (Catmull and Rom's): no creases at the lattice lines, for land seen from far off on a coarse lattice. */
  smoothAt(x: number, z: number): number {
    const fx = Math.min(this.nx - 2.0001, Math.max(1, (x - this.x0) / this.cell)), fz = Math.min(this.nz - 2.0001, Math.max(1, (z - this.z0) / this.cell));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, d = this.data, nx = this.nx;
    // (Written out, with nothing made on each call: this is asked for millions of times while rock is carved.)
    let k = (j - 1) * nx + i;
    const r0 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx); k += nx;
    const r1 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx); k += nx;
    const r2 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx); k += nx;
    const r3 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx);
    return catmull(r0, r1, r2, r3, tz);
  }
  /** The height at a point, blended between the four lattice points about it. */
  at(x: number, z: number): number {
    const fx = Math.min(this.nx - 1.0001, Math.max(0, (x - this.x0) / this.cell)), fz = Math.min(this.nz - 1.0001, Math.max(0, (z - this.z0) / this.cell));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * this.nx + i, d = this.data;
    return d[k] * (1 - tx) * (1 - tz) + d[k + 1] * tx * (1 - tz) + d[k + this.nx] * (1 - tx) * tz + d[k + this.nx + 1] * tx * tz;
  }
}

/** A number from 0 to 1 belonging to a lattice point. */
function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Value noise and its slope: from -1 to 1, with how fast it changes along x and along z. (The
 * blend between lattice points is quintic, so the slope is smooth too.)
 */
export function noised(x: number, z: number, seed: number, out: Float64Array): void {
  const ix = Math.floor(x), iz = Math.floor(z), wx = x - ix, wz = z - iz;
  const ux = wx * wx * wx * (wx * (wx * 6 - 15) + 10), uz = wz * wz * wz * (wz * (wz * 6 - 15) + 10);
  const dux = 30 * wx * wx * (wx * (wx - 2) + 1), duz = 30 * wz * wz * (wz * (wz - 2) + 1);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  out[0] = -1 + 2 * (a + k1 * ux + k2 * uz + k4 * ux * uz);
  out[1] = 2 * dux * (k1 + k4 * uz);
  out[2] = 2 * duz * (k2 + k4 * ux);
}

const N3 = new Float64Array(3);
/**
 * Quilez's eroded fBM, at a point given in noise units: about -1 to 1. Each octave is twice as fine
 * and half as strong as the last, turned by a fixed rotation, and divided by one plus the square of
 * the slope the octaves before it have built up.
 */
export function erodedFbm(x: number, z: number, octaves: number, seed: number): number {
  let a = 0, b = 1, dx = 0, dz = 0, px = x, pz = z;
  for (let i = 0; i < octaves; i++) {
    noised(px, pz, seed + i * 31, N3);
    dx += N3[1]; dz += N3[2];
    a += (b * N3[0]) / (1 + dx * dx + dz * dz);
    b *= 0.5;
    const qx = 1.6 * px - 1.2 * pz, qz = 1.2 * px + 1.6 * pz;
    px = qx; pz = qz;
  }
  return a;
}

/**
 * Quilez's eroded fBM with a number of octaves that need not be whole: the last is weighed by the
 * fraction. For land that has less detail the further it lies from whoever sees it, without a seam
 * where one octave fewer begins.
 */
export function erodedFbmLod(x: number, z: number, octaves: number, seed: number): number {
  let a = 0, b = 1, dx = 0, dz = 0, px = x, pz = z;
  for (let i = 0; i < Math.ceil(octaves); i++) {
    noised(px, pz, seed + i * 31, N3);
    const w = Math.min(1, octaves - i);
    dx += N3[1] * w; dz += N3[2] * w;
    a += (w * b * N3[0]) / (1 + dx * dx + dz * dz);
    b *= 0.5;
    const qx = 1.6 * px - 1.2 * pz, qz = 1.2 * px + 1.6 * pz;
    px = qx; pz = qz;
  }
  return a;
}

/**
 * Ridged fBM (Musgrave's ridged multifractal): each octave folded about its middle so that its
 * crests are sharp, and weighed by the octave above, so that the finer crests run along the coarser
 * ones and die out in the hollows between. From 0 to about 1: high on the crests and the horns.
 */
export function ridgedFbm(x: number, z: number, octaves: number, seed: number): number {
  let sum = 0, norm = 0, amp = 0.5, w = 1, px = x, pz = z;
  for (let i = 0; i < octaves; i++) {
    noised(px, pz, seed + i * 13, N3);
    let r = 1 - Math.abs(N3[0]);
    r *= r * w;
    w = Math.min(1, Math.max(0, r * 2));
    sum += r * amp; norm += amp;
    amp *= 0.5;
    const qx = 1.6 * px - 1.2 * pz, qz = 1.2 * px + 1.6 * pz;
    px = qx; pz = qz;
  }
  return sum / norm;
}

/** Plain fBM of the same noise, for warping with: about -1 to 1. */
export function fbmd(x: number, z: number, octaves: number, seed: number): number {
  let a = 0, b = 0.5, px = x, pz = z;
  for (let i = 0; i < octaves; i++) {
    noised(px, pz, seed + i * 17, N3);
    a += b * N3[0];
    b *= 0.5;
    const qx = 1.6 * px - 1.2 * pz, qz = 1.2 * px + 1.6 * pz;
    px = qx; pz = qz;
  }
  return a;
}

/**
 * Detail for a piece of land, in metres, at a point in metres: the eroded fBM read through a warp
 * (its coordinates pushed about by plain fBM of their own, so its ridges wander and branch), at
 * `scale` metres to its broadest octave.
 */
export function landDetail(x: number, z: number, scale: number, seed: number): number {
  const u = x / scale, v = z / scale;
  const wu = u + 0.55 * fbmd(u * 0.7 + 3.1, v * 0.7 - 1.7, 3, seed + 1000), wv = v + 0.55 * fbmd(u * 0.7 - 5.2, v * 0.7 + 2.9, 3, seed + 2000);
  return erodedFbm(wu, wv, 6, seed);
}

export interface WaterWear {
  /** How many drops fall, per lattice point. */
  drops: number;
  /** How many steps a drop takes at most before it has dried up. */
  life: number;
  /** How far a drop keeps its way when the ground turns it, 0 to 1. */
  inertia: number;
  /** How much a drop can carry, for its speed, its water and the fall of the ground. */
  capacity: number;
  /** How much of what it could carry and does not, it takes up at a step; and how much of what it carries over that, it puts down. */
  erode: number;
  deposit: number;
  /** How much of its water it loses at a step. */
  evaporate: number;
  /** How hard the fall of the ground speeds it. */
  gravity: number;
  /** How far about its place a drop wears the ground, in lattice points. */
  radius: number;
  /** The most a drop may take up at one step, in metres: on a precipice the ground falls metres in a step, and a drop would otherwise take it all. */
  most: number;
  /** Where, if anywhere, the ground may not be worn or built on: 0 to 1 at each lattice point, 1 for untouched. */
  keep?: Float32Array;
}

/** Wears a heightfield with water, drop by drop (as Hans Beyer described it, and as many have made it since). */
export function wearByWater(f: HeightField, rng: Rng, o: WaterWear): void {
  const { nx, nz, data: h, cell } = f;
  // The brush a drop wears with: the points within its reach, the nearer the more.
  const brushI: number[] = [], brushJ: number[] = [], brushW: number[] = [];
  let sum = 0;
  for (let j = -o.radius; j <= o.radius; j++) for (let i = -o.radius; i <= o.radius; i++) {
    const d = Math.hypot(i, j);
    if (d > o.radius) continue;
    brushI.push(i); brushJ.push(j); brushW.push(o.radius - d); sum += o.radius - d;
  }
  for (let k = 0; k < brushW.length; k++) brushW[k] /= sum;
  const keep = o.keep;
  // (Heights and slopes are taken in metres per metre: the lattice's size does not change how the water behaves.)
  const sample = (x: number, z: number, out: Float64Array) => {
    const i = Math.floor(x), j = Math.floor(z), tx = x - i, tz = z - j, k = j * nx + i;
    const a = h[k], b = h[k + 1], c = h[k + nx], d = h[k + nx + 1];
    out[0] = a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
    out[1] = ((b - a) * (1 - tz) + (d - c) * tz) / cell;
    out[2] = ((c - a) * (1 - tx) + (d - b) * tx) / cell;
  };
  const here = new Float64Array(3), there = new Float64Array(3);
  const count = Math.round(nx * nz * o.drops);
  for (let n = 0; n < count; n++) {
    let x = rng.range(1, nx - 2), z = rng.range(1, nz - 2), dx = 0, dz = 0, speed = 1, water = 1, carried = 0;
    for (let life = 0; life < o.life; life++) {
      const i = Math.floor(x), j = Math.floor(z), k = j * nx + i, tx = x - i, tz = z - j;
      sample(x, z, here);
      // It goes downhill, keeping some of the way it was going.
      dx = dx * o.inertia - here[1] * (1 - o.inertia);
      dz = dz * o.inertia - here[2] * (1 - o.inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) break;
      dx /= len; dz /= len;
      x += dx; z += dz;
      if (x < 1 || z < 1 || x >= nx - 2 || z >= nz - 2) break;
      sample(x, z, there);
      // (How far the ground fell or rose over the step, in metres.)
      const fall = there[0] - here[0];
      const can = Math.max(-fall * speed * water * o.capacity, 0.01);
      const kept = keep ? keep[k] : 0;
      if (carried > can || fall > 0) {
        // It puts down: all it can into a hollow it has run up into, or what it carries over what it can.
        const put = (fall > 0 ? Math.min(fall, carried) : (carried - can) * o.deposit) * (1 - kept);
        carried -= put;
        h[k] += put * (1 - tx) * (1 - tz);
        h[k + 1] += put * tx * (1 - tz);
        h[k + nx] += put * (1 - tx) * tz;
        h[k + nx + 1] += put * tx * tz;
      } else {
        // It takes up: never more than the ground fell, or it would dig a pit.
        const take = Math.min((can - carried) * o.erode, -fall, o.most) * (1 - kept);
        for (let b = 0; b < brushW.length; b++) {
          const ii = i + brushI[b], jj = j + brushJ[b];
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          h[jj * nx + ii] -= take * brushW[b];
        }
        carried += take;
      }
      speed = Math.min(6, Math.sqrt(Math.max(0, speed * speed - fall * o.gravity)));
      water *= 1 - o.evaporate;
    }
  }
}

/** How a lattice is worn: by water, by frost, and how far either may take it from the shape it was given. */
export interface Wear {
  water: Omit<WaterWear, 'keep'>;
  frost: { passes: number; repose: number; rate: number };
  /** How deep the water may cut below the shape, and how high it may build on it, in metres, where nothing is spared. */
  cut: number;
  fill: number;
}

/**
 * A lattice of `shape`, worn. `keep`, if given, says how far each point is spared, 0 to 1: the
 * water and the frost act there the less, and the depth they may cut to or build to is bounded by
 * the share not spared, so that a spared place keeps its shape however long the weather is at it.
 * `blend`, if given, is how many lattice points in from the edge the wear fades in over, so that
 * land reckoned beyond the lattice meets it.
 */
export function wornLattice(x0: number, z0: number, cell: number, nx: number, nz: number, shape: (x: number, z: number) => number, rng: Rng, wear: Wear, keep?: (x: number, z: number) => number, blend = 0): HeightField {
  const f = new HeightField(x0, z0, cell, nx, nz), kept = keep ? new Float32Array(nx * nz) : undefined;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell, k = j * nx + i;
    f.data[k] = shape(x, z);
    if (kept) kept[k] = keep!(x, z);
  }
  const shaped = f.data.slice();
  wearByWater(f, rng, { ...wear.water, keep: kept });
  for (let k = 0; k < f.data.length; k++) { const free = kept ? 1 - kept[k] : 1; f.data[k] = Math.max(shaped[k] - wear.cut * free, Math.min(shaped[k] + wear.fill * free, f.data[k])); }
  wearByFrost(f, wear.frost.passes, wear.frost.repose, wear.frost.rate, kept);
  if (blend > 0) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, e = Math.min(i, j, nx - 1 - i, nz - 1 - j) / blend;
    if (e < 1) { const s = e * e * (3 - 2 * e); f.data[k] = shaped[k] + (f.data[k] - shaped[k]) * s; }
  }
  return f;
}

/** Wears a heightfield with frost: wherever ground stands over its neighbour more steeply than `repose`, a share `rate` of the excess comes down. */
export function wearByFrost(f: HeightField, passes: number, repose: number, rate: number, keep?: Float32Array): void {
  const { nx, nz, data: h, cell } = f;
  const steps = [[1, 0, 1], [0, 1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2]];
  for (let pass = 0; pass < passes; pass++) {
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i;
      for (const [di, dj, dist] of steps) {
        const n = (j + dj) * nx + i + di, most = repose * dist * cell, diff = h[k] - h[n];
        if (Math.abs(diff) <= most) continue;
        const from = diff > 0 ? k : n, to = diff > 0 ? n : k;
        const move = (Math.abs(diff) - most) * 0.5 * rate * (1 - (keep ? Math.max(keep[from], keep[to]) : 0));
        h[from] -= move; h[to] += move;
      }
    }
  }
}

/**
 * The way of least effort between two points over a square lattice (`cell` metres, `nx` by `nz` points from `x0`, `z0`), going to
 * any of the eight neighbours of a point at a time, `cost` saying what the step from one point to another costs (at least its
 * length; Infinity where it may not be taken). As a track is made where nobody has laid one: round a hill rather than over it,
 * along the side of a slope rather than up it. Its points, from `from` to `to`, or null if there is no way.
 */
export function leastPath(x0: number, z0: number, cell: number, nx: number, nz: number, from: [number, number], to: [number, number], cost: (a: number, b: number) => number): [number, number][] | null {
  const at = (x: number, z: number) => Math.min(nz - 1, Math.max(0, Math.round((z - z0) / cell))) * nx + Math.min(nx - 1, Math.max(0, Math.round((x - x0) / cell)));
  const start = at(from[0], from[1]), goal = at(to[0], to[1]), gx = goal % nx, gz = Math.floor(goal / nx);
  const best = new Float64Array(nx * nz).fill(Infinity), came = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz);
  // (A binary heap of points still to be looked at, by what they have cost and the least they can still cost.)
  const heap: number[] = [], key: number[] = [];
  const push = (k: number, f: number) => {
    heap.push(k); key.push(f);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (key[p] <= key[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [key[p], key[i]] = [key[i], key[p]]; i = p; }
  };
  const pop = (): number => {
    const top = heap[0], lastK = heap.pop()!, lastF = key.pop()!;
    if (heap.length) {
      heap[0] = lastK; key[0] = lastF;
      for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && key[l] < key[m]) m = l; if (r < heap.length && key[r] < key[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [key[m], key[i]] = [key[i], key[m]]; i = m; }
    }
    return top;
  };
  const guess = (k: number) => Math.hypot((k % nx) - gx, Math.floor(k / nx) - gz) * cell;
  best[start] = 0; push(start, guess(start));
  while (heap.length) {
    const k = pop();
    if (done[k]) continue;
    done[k] = 1;
    if (k === goal) break;
    const i = k % nx, j = (k - i) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const n = jj * nx + ii;
      if (done[n]) continue;
      const c = best[k] + cost(k, n);
      if (c < best[n]) { best[n] = c; came[n] = k; push(n, c + guess(n)); }
    }
  }
  if (!done[goal]) return null;
  const path: [number, number][] = [];
  for (let k = goal; k >= 0; k = came[k]) path.push([x0 + (k % nx) * cell, z0 + Math.floor(k / nx) * cell]);
  path.reverse();
  path[0] = [from[0], from[1]]; path[path.length - 1] = [to[0], to[1]];
  return path;
}

/** A line made smooth: corners cut a quarter in from either end, three times over (Chaikin's way), its ends kept. */
export function smoothLine(line: [number, number][], times = 3): [number, number][] {
  let pts = line;
  for (let t = 0; t < times; t++) {
    const out: [number, number][] = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** How land is lifted and worn by rivers (`liftAndErode`). */
export interface LiftAndErode {
  /** How many steps, and how many years each is. */
  steps: number;
  dt: number;
  /** How readily ground wears where water runs over it, and how much the ground draining through a point counts (the stream power law: wear = k · area^m · slope). */
  k: number;
  m: number;
  /** How fast slopes creep down, square metres a year: rounds the ground between the rivers. */
  creep: number;
  /** How much ground must drain through a point, square metres, before a river wears it: above that, a hillside, which only creeps. */
  channel: number;
}

/**
 * Land made as land is made: lifted, at a rate given for each point (`uplift`, metres a year), and
 * worn by the river through each point in proportion to the ground draining through it and the fall
 * to the next point down (the stream power law), step after step until the two come near to balance;
 * with the slopes creeping down between. Rivers then branch as rivers do, ridges stand between them,
 * and every valley drains to an outlet by its own making (`outlet`: points held at their height, the
 * sea). Solved as Braun and Willett showed (2013), each point in turn from the outlets upward, so that
 * a step may be long; hollows are filled on the way, as water fills them (Cordonnier and others, 2016,
 * "Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion", make land this way).
 */
export function liftAndErode(f: HeightField, uplift: Float32Array, outlet: Uint8Array, o: LiftAndErode): void {
  const nx = f.nx, nz = f.nz, n = nx * nz, h = f.data, cell = f.cell;
  const order = new Int32Array(n), rec = new Int32Array(n), len = new Float32Array(n), area = new Float32Array(n), filled = new Float32Array(n), seen = new Uint8Array(n);
  const heap = new Int32Array(n), key = new Float32Array(n), tmp = new Float32Array(n);
  const NB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  // (Creep is taken in as many small passes as keep it steady: a pass may move a point no more than a fifth of the way to its neighbours' mean.)
  const creepAll = (o.creep * o.dt) / (cell * cell), passes = Math.ceil(creepAll / 0.2), creep = creepAll / Math.max(1, passes);
  /** A number from 0 to 1 belonging to a point and a step: the same each time the land is made. */
  const chance = (k: number, step: number) => { let x = Math.imul(k, 374761393) ^ Math.imul(step + 1, 668265263); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  for (let step = 0; step < o.steps; step++) {
    // Where each point's water goes: hollows filled from the outlets inward, lowest first, as in `drain`.
    seen.fill(0);
    let size = 0, popped = 0;
    const push = (k: number, y: number) => {
      let i = size++;
      heap[i] = k; key[i] = y;
      while (i > 0) { const pa = (i - 1) >> 1; if (key[pa] <= key[i]) break; const tk = heap[pa], ty = key[pa]; heap[pa] = heap[i]; key[pa] = key[i]; heap[i] = tk; key[i] = ty; i = pa; }
    };
    for (let k = 0; k < n; k++) if (outlet[k]) { seen[k] = 1; filled[k] = h[k]; push(k, h[k]); }
    while (size) {
      const k = heap[0];
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
      order[popped++] = k;
      const i = k % nx, j = (k - i) / nx;
      for (const [di, dj] of NB) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii;
        if (seen[q]) continue;
        seen[q] = 1; filled[q] = Math.max(h[q], filled[k] + 1e-3); push(q, filled[q]);
      }
    }
    // Each point's water goes to a neighbour downhill over the filled surface: chosen afresh each step, the steeper the likelier.
    // (Always the steepest, water ran only along the lattice's eight ways, and ridges and valleys came out squared to them.)
    for (let o2 = 0; o2 < popped; o2++) {
      const k = order[o2];
      rec[k] = -1;
      if (outlet[k]) continue;
      const i = k % nx, j = (k - i) / nx;
      let total = 0;
      for (const [di, dj] of NB) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii, d = di && dj ? cell * Math.SQRT2 : cell, s = (filled[k] - filled[q]) / d;
        if (s > 0) total += s;
      }
      let pick = chance(k, step) * total;
      for (const [di, dj] of NB) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii, d = di && dj ? cell * Math.SQRT2 : cell, s = (filled[k] - filled[q]) / d;
        if (s <= 0) continue;
        rec[k] = q; len[k] = d;
        if ((pick -= s) <= 0) break;
      }
    }
    // What drains through each point, from the top down.
    area.fill(cell * cell);
    for (let o2 = popped - 1; o2 >= 0; o2--) { const k = order[o2], r = rec[k]; if (r >= 0) area[r] += area[k]; }
    // Lifted, and worn towards the height of where its water goes: from the outlets upward, so that each point's receiver is
    // already where it will be at the end of the step.
    for (let o2 = 0; o2 < popped; o2++) {
      const k = order[o2], r = rec[k];
      if (outlet[k]) continue;
      h[k] += o.dt * uplift[k];
      if (r < 0 || area[k] < o.channel) continue;
      const F = (o.dt * o.k * Math.pow(area[k], o.m)) / len[k];
      h[k] = (h[k] + F * h[r]) / (1 + F);
    }
    // Creep: each point drawn a little towards the mean of its neighbours.
    // (At the lattice's edge, towards the neighbours it has: skipped there, the edge rose with the land and never crept, into a wall.)
    for (let pass = 0; pass < passes && creep > 0; pass++) {
      tmp.set(h);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (outlet[k]) continue;
        let sum = 0, count = 0;
        if (i > 0) { sum += tmp[k - 1]; count++; }
        if (i < nx - 1) { sum += tmp[k + 1]; count++; }
        if (j > 0) { sum += tmp[k - nx]; count++; }
        if (j < nz - 1) { sum += tmp[k + nx]; count++; }
        h[k] = tmp[k] + creep * (sum - count * tmp[k]);
      }
    }
  }
}
