/** Deterministic random streams. One seed string reproduces one site; `fork` gives each layer its own stream. */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seed: string;

  constructor(seed: string) {
    this.seed = seed;
    const h = xmur3(seed);
    this.a = h();
    this.b = h();
    this.c = h();
    this.d = h();
    for (let i = 0; i < 8; i++) this.next();
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** An independent stream derived from this seed and a label. Does not advance this stream. */
  fork(label: string): Rng {
    return new Rng(`${this.seed}/${label}`);
  }
}

/** Cheap 2D value noise in [0, 1], for geometry relief and fields. */
export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x: number, y: number, octaves: number, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x, y, seed + i * 17);
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hash3i(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Value noise in three dimensions, in [0, 1]. Rock needs it: noise in two dimensions smears along the third. */
export function valueNoise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const k = 1 / 4294967296;
  const a = hash3i(xi, yi, zi, seed) * k, b = hash3i(xi + 1, yi, zi, seed) * k;
  const c = hash3i(xi, yi + 1, zi, seed) * k, d = hash3i(xi + 1, yi + 1, zi, seed) * k;
  const e = hash3i(xi, yi, zi + 1, seed) * k, f = hash3i(xi + 1, yi, zi + 1, seed) * k;
  const g = hash3i(xi, yi + 1, zi + 1, seed) * k, h = hash3i(xi + 1, yi + 1, zi + 1, seed) * k;
  const lo = a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
  const hi = e + (f - e) * u + (g - e + (e - f - g + h) * u) * v;
  return lo + (hi - lo) * w;
}

export function fbm3(x: number, y: number, z: number, octaves: number, seed = 0): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise3(x, y, z, seed + i * 17);
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** A number in [0, 1) belonging to a whole-numbered point: the same every time it is asked. */
export function hash1(i: number, seed = 0): number {
  return hash3i(i, 0, 0, seed) / 4294967296;
}

/**
 * Cells in three dimensions: space divided among scattered points, each owning what lies nearest
 * to it. This is how rock breaks into blocks. Written to `out`:
 *   0: distance to the nearest point; 1: to the second nearest;
 *   2: a number in [0, 1) belonging to the nearest cell; 3: one belonging to the second nearest;
 *   4: distance to the wall between those two cells.
 * `jitter` is how far points stray from a regular lattice: 0 gives cubes, 1 the most irregular.
 * `jitterY` is the same for the second coordinate alone, so that cells can lie in level layers.
 */
export function cells3(x: number, y: number, z: number, seed: number, jitter: number, out: Float32Array, jitterY = jitter): void {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let d1 = Infinity, d2 = Infinity, id1 = 0, id2 = 0;
  let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
  const k = jitter / 1024, ky = jitterY / 1024;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const h = hash3i(xi + dx, yi + dy, zi + dz, seed);
    const px = xi + dx + 0.5 + ((h & 1023) - 511.5) * k - x;
    const py = yi + dy + 0.5 + (((h >>> 10) & 1023) - 511.5) * ky - y;
    const pz = zi + dz + 0.5 + (((h >>> 20) & 1023) - 511.5) * k - z;
    const d = px * px + py * py + pz * pz;
    if (d < d1) {
      d2 = d1; id2 = id1; bx = ax; by = ay; bz = az;
      d1 = d; id1 = h; ax = px; ay = py; az = pz;
    } else if (d < d2) {
      d2 = d; id2 = h; bx = px; by = py; bz = pz;
    }
  }
  out[0] = Math.sqrt(d1);
  out[1] = Math.sqrt(d2);
  // The low bits placed the point; other bits, stirred again, name the cell.
  out[2] = (Math.imul(id1 ^ (id1 >>> 15), 2246822519) >>> 8) / 16777216;
  out[3] = (Math.imul(id2 ^ (id2 >>> 15), 2246822519) >>> 8) / 16777216;
  out[4] = (d2 - d1) / (2 * Math.hypot(bx - ax, by - ay, bz - az) + 1e-9);
}

/**
 * Facets: a surface made of flat faces meeting in sharp creases, as rock breaks. Every cell of a
 * lattice holds a tilted plane, and the value at a point is the highest of the planes near it,
 * each falling away with distance so that only near ones can be the highest. Roughly -0.3 to
 * 0.8, and continuous: the creases are where one plane overtakes another.
 */
export function facets3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = -Infinity;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const h = hash3i(xi + dx, yi + dy, zi + dz, seed);
    const px = x - (xi + dx + 0.5 + ((h & 255) - 127.5) / 320);
    const py = y - (yi + dy + 0.5 + (((h >>> 8) & 255) - 127.5) / 320);
    const pz = z - (zi + dz + 0.5 + (((h >>> 16) & 255) - 127.5) / 320);
    const d2 = px * px + py * py + pz * pz;
    // Too far off to be the highest whatever its tilt: most cells are, and cost nothing more.
    if (d2 > 1.7) continue;
    // The plane's tilt and height come from the same number, stirred.
    const g = Math.imul(h ^ (h >>> 13), 2246822519);
    const nx = ((g & 1023) - 511.5) / 640, ny = (((g >>> 10) & 1023) - 511.5) / 640, nz = (((g >>> 20) & 1023) - 511.5) / 640;
    const v = (h >>> 24) / 510 - (px * nx + py * ny + pz * nz) - d2 * 0.55;
    if (v > best) best = v;
  }
  return best;
}
