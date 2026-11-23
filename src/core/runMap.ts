/**
 * The map of a world's runs, as it is kept and read (`tools/skiRun.ts --map` makes it; `game/slopeMap.ts` draws it): what the world's
 * ink map (`src/maps/inkWorld.ts`) needs of the world, over a stretch of it about the runs, on a lattice coarser than the world's own;
 * and each run's line, the height of its snow along it, and what it is like. (Asked: "can you make a ink map based ... run selector?
 * think like a medieval fantasy ski resort map".)
 *
 * The world itself takes some seconds to make and is not in the game: its slices are, and this. The lattice is sixteen metres (the
 * world's is eight), some hundred thousand points for a stretch five kilometres across: heights in decimetres, and what lies at each
 * point, as base 64; rivers and ways thinned to what the map can show.
 */
import { HeightField } from './terrain';
import type { River, Town, WorldWay } from './world';

/** A run on the map: its slice's name (`w2`, `w2-3`), and what the card the map opens on it says. */
export interface MapRun {
  id: string;
  /** Its line, a point every `step` metres from its top, in the world's coordinates; its snow's height at each (as the slice has it). */
  step: number; points: [number, number][]; heights: number[];
  /** How long it is, horizontally; how high its top and its foot are, as the world has them (not lowered as its slice is). */
  length: number; top: number; foot: number;
  /** Degrees: on the whole, and at the steepest over forty metres; metres of it along a crest; how broad its path is, least and most. */
  mean: number; steepest: number; crest: number; broad: [number, number];
}

export interface RunMap {
  /** The world's seed and name, its regions' names, and what of its plan the ink map reads. */
  world: string; worldName: string; regions: { sea: string; bay: string; upland: string; range: string };
  plan: { seed: string; hx: number; hz: number };
  /** The stretch drawn, in the world's coordinates. */
  area: { x0: number; z0: number; x1: number; z1: number };
  /** The world's great peaks, all of them (those off the stretch are not drawn); its towns and villages, rivers and ways about it. */
  peaks: { x: number; z: number; y: number; name: string }[];
  towns: Town[]; rivers: River[]; ways: WorldWay[];
  /** The land on the map's lattice; where the sea is (1); where a lake stands, its surface (else 0); what lies there (`COVER`). */
  field: HeightField; sea: Uint8Array; lake: Float32Array; cover: Uint8Array;
  /** How the runs' land was brought lower above a height (`RUN.squash`), so their snow's heights can be told as the world's. */
  squash: { above: number; keep: number };
  runs: MapRun[];
}

const toBase64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromBase64 = (s: string) => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return b; };
/** Heights in decimetres above the least, as sixteen bits. */
const keepHeights = (v: Float32Array) => {
  let base = Infinity;
  for (const h of v) base = Math.min(base, h);
  const q = new Uint16Array(v.length);
  v.forEach((h, k) => { q[k] = Math.min(65535, Math.round((h - base) * 10)); });
  return { base, data: toBase64(new Uint8Array(q.buffer)) };
};
const readHeights = (k: { base: number; data: string }, n: number) => {
  const q = new Uint16Array(fromBase64(k.data).buffer), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = k.base + q[i] / 10;
  return out;
};
const tenth = (v: number) => Math.round(v * 10) / 10;
/**
 * Bytes kept as runs of one value: the value, then how many (seven bits at a time, least first). What lies on the land, where the sea
 * is and which lake, change seldom from one point to the next: a tenth of the room each took as it was.
 */
const keepRuns = (v: Uint8Array) => {
  const out: number[] = [];
  for (let i = 0; i < v.length;) {
    let j = i;
    while (j < v.length && v[j] === v[i]) j++;
    out.push(v[i]);
    for (let n = j - i; ; n >>>= 7) { if (n < 128) { out.push(n); break; } out.push((n & 127) | 128); }
    i = j;
  }
  return toBase64(new Uint8Array(out));
};
const readRuns = (s: string, n: number) => {
  const b = fromBase64(s), out = new Uint8Array(n);
  for (let i = 0, at = 0; i < b.length && at < n;) {
    const v = b[i++];
    let count = 0;
    for (let shift = 0; ; shift += 7) { const c = b[i++]; count |= (c & 127) << shift; if (c < 128) break; }
    out.fill(v, at, Math.min(n, at + count));
    at += count;
  }
  return out;
};

/** A map written out as text (JSON). */
export function writeRunMap(m: RunMap): string {
  const { field: f, sea, lake, cover, rivers, ways, runs, ...rest } = m;
  return JSON.stringify({
    ...rest,
    rivers: rivers.map((r) => ({ points: r.points.map(([x, z]) => [tenth(x), tenth(z)]), width: r.width.map(tenth) })),
    ways: ways.map((w) => ({ kind: w.kind, points: w.points.map(([x, z]) => [tenth(x), tenth(z)]) })),
    runs: runs.map((r) => ({ ...r, points: r.points.map(([x, z]) => [tenth(x), tenth(z)]), heights: r.heights.map(tenth) })),
    field: { x0: f.x0, z0: f.z0, cell: f.cell, nx: f.nx, nz: f.nz, heights: keepHeights(f.data) },
    lake: keepLakes(lake), sea: keepRuns(sea), cover: keepRuns(cover),
  });
}

/** Where the lakes are: each lake's surface once (to a centimetre), and at each point which (from 1), or 0 for none, as runs. */
const keepLakes = (v: Float32Array) => {
  const levels: number[] = [], which = new Uint8Array(v.length);
  v.forEach((h, k) => {
    if (!h) return;
    const l = Math.round(h * 100) / 100;
    let i = levels.indexOf(l);
    if (i < 0) { if (levels.length >= 255) return; i = levels.push(l) - 1; }
    which[k] = i + 1;
  });
  return { levels, which: keepRuns(which) };
};

/** A map read back from its text. */
export function readRunMap(text: string): RunMap {
  const o = JSON.parse(text), n = o.field.nx * o.field.nz;
  const field = new HeightField(o.field.x0, o.field.z0, o.field.cell, o.field.nx, o.field.nz);
  field.data.set(readHeights(o.field.heights, n));
  const which = readRuns(o.lake.which, n), lake = new Float32Array(n);
  which.forEach((i, k) => { if (i) lake[k] = o.lake.levels[i - 1]; });
  return { ...o, field, lake, sea: readRuns(o.sea, n), cover: readRuns(o.cover, n) };
}
