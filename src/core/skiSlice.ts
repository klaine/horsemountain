/**
 * A ski run's slice of a world, as it is kept and read (`skiRun.ts` makes it; `lab/slope.ts` skis it): the run's line, and the snow
 * lying on the world's land about it, at three grains.
 *
 * - `snow`: within `half` metres of the line, at a metre: the near land as the walk page makes it (`makeSquare` in `stream.ts`),
 *   smoothed a little as snow lies on it and a little deeper. Nothing (`NaN`) further off. Of it, the skiable path is what lies within
 *   the run's `piste`; the rest is there to be seen.
 * - `near`: the same snow about the run, some hundreds of metres out, at four metres.
 * - `far`: the land of the country round about, some kilometres out, at sixteen metres; and what lies on it (`COVER`), at the same grain.
 *
 * Heights are kept in steps (a centimetre, a decimetre) above the lowest, in sixteen bits, written out as base 64: a file of about a
 * megabyte rather than four.
 */

/** Heights on a lattice: the first point's place, the spacing, how many each way, and the heights by rows from the north-west. */
export interface Grid { x0: number; z0: number; cell: number; nx: number; nz: number; data: Float32Array }

export interface SkiSlice {
  /** The world's seed and name; the peak the run comes down from, and how far from it. */
  world: string; worldName: string; peak: string;
  /**
   * The line (a point every `step` metres from its top, in the world's coordinates), the snow's height along it, and what it is like;
   * at each point of it, how far to its right (less than nothing) and its left the skiable path reaches (`piste`); and how the land
   * above some height was brought lower for the slice (`squash`: heights over `above` kept at `keep` of what they were over it).
   */
  run: { step: number; points: [number, number][]; heights: number[]; drop: number; length: number; mean: number; steepest: number; piste: [number, number][]; squash: { above: number; keep: number } };
  /** How far either side of the line the snow at a metre reaches. */
  half: number;
  snow: Grid; near: Grid; far: Grid;
  /** What lies at each point of `far` (`COVER` in `world.ts`). */
  cover: Uint8Array;
}

const toBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (s: string) => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };

/**
 * A grid as kept: heights in steps of `step` above `base`, 65535 for none; of each row only what lies from its first point to its
 * last (`spans`, where each row's starts and how many it keeps), so that the slice at a metre, a band through a broad box, is small.
 */
interface KeptGrid { x0: number; z0: number; cell: number; nx: number; nz: number; base: number; step: number; spans: string; heights: string }
const keepGrid = (g: Grid, step: number): KeptGrid => {
  let base = Infinity;
  for (const v of g.data) if (!Number.isNaN(v)) base = Math.min(base, v);
  const spans = new Int32Array(2 * g.nz), kept: number[] = [];
  for (let j = 0; j < g.nz; j++) {
    let a = -1, b = -1;
    for (let i = 0; i < g.nx; i++) if (!Number.isNaN(g.data[j * g.nx + i])) { if (a < 0) a = i; b = i; }
    spans[2 * j] = Math.max(0, a); spans[2 * j + 1] = a < 0 ? 0 : b - a + 1;
    for (let i = a; a >= 0 && i <= b; i++) { const v = g.data[j * g.nx + i]; kept.push(Number.isNaN(v) ? 65535 : Math.min(65534, Math.round((v - base) / step))); }
  }
  return { x0: g.x0, z0: g.z0, cell: g.cell, nx: g.nx, nz: g.nz, base, step, spans: toBase64(new Uint8Array(spans.buffer)), heights: toBase64(new Uint8Array(new Uint16Array(kept).buffer)) };
};
const readGrid = (k: KeptGrid): Grid => {
  const spans = new Int32Array(fromBase64(k.spans).buffer), q = new Uint16Array(fromBase64(k.heights).buffer), data = new Float32Array(k.nx * k.nz).fill(NaN);
  let n = 0;
  for (let j = 0; j < k.nz; j++) for (let i = spans[2 * j]; i < spans[2 * j] + spans[2 * j + 1]; i++) { const v = q[n++]; data[j * k.nx + i] = v === 65535 ? NaN : k.base + v * k.step; }
  return { x0: k.x0, z0: k.z0, cell: k.cell, nx: k.nx, nz: k.nz, data };
};

/** A slice written out as text (JSON). */
export function writeSlice(s: SkiSlice): string {
  const { snow, near, far, cover, ...rest } = s;
  return JSON.stringify({ ...rest, snow: keepGrid(snow, 0.01), near: keepGrid(near, 0.01), far: keepGrid(far, 0.1), cover: toBase64(cover) });
}

/** A slice read back from its text. */
export function readSlice(text: string): SkiSlice {
  const o = JSON.parse(text);
  return { ...o, snow: readGrid(o.snow), near: readGrid(o.near), far: readGrid(o.far), cover: fromBase64(o.cover) };
}

/** The height on a grid at a point, blended between the four lattice points about it; `NaN` where any of them is none, or off it. */
export function gridAt(g: Grid, x: number, z: number): number {
  const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
  if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return NaN;
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz)), tx = fx - i, tz = fz - j, k = j * g.nx + i, d = g.data;
  return d[k] * (1 - tx) * (1 - tz) + d[k + 1] * tx * (1 - tz) + d[k + g.nx] * (1 - tx) * tz + d[k + g.nx + 1] * tx * tz;
}
