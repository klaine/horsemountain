/**
 * Finds the ski runs in a world (`src/core/skiRun.ts`) and writes the slices of those asked for, the snow on the world's land about
 * each, for the game to ski: `slopes/<world>.json` for the first run kept, `slopes/<world>-<n>.json` for the `n`th (as `w2-3.json`,
 * the third). (As klaine/dungeons `tools/skiRun.ts`, which writes the first, or `PICK`, to its `public/slopes/<world>.json`; here a
 * search, some minutes long, lists every run kept, so that runs can be chosen from it, and writes as many of them as are asked for.)
 *
 * Says of each run kept where it starts and ends, how far it falls, how steep it is, how much of it keeps to a crest, the nearest of
 * the world's great peaks and its nearest village or town (to name it by); and of each written, how long its slice took and how large
 * the file is. With `--picture`, also draws the search over the whole world as shaded relief: the first ten runs kept in colours of
 * their own (red, orange, yellow, green, cyan, blue, purple, white, black, pink), the rest in brown, the places' and towns'
 * keep-away rings in magenta, the great peaks as black squares; and, for each run written, the country about it, that run in red.
 *
 * With `--map`, writes the map of the runs it names (`slopes/<world>-map.json`, `src/core/runMap.ts`): what the world's ink map needs
 * of the stretch of the world about them, on a lattice of `--cell` metres (sixteen), and each run's line and what it is like, from its
 * slice (made for it, and written only if it is named on its own too).
 *
 * A run named in `RAISED` is carried further up its mountain than the search began it, to the point given there; it is listed,
 * written and mapped so.
 *
 *   npx tsx tools/skiRun.ts [world seed, w2] [which runs kept to write: 1 3 ...] [--picture <folder>] [--map 1,3,8,10] [--cell 16]
 *
 * (With no runs named it only lists them, and writes nothing.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { world } from '../src/core/world';
import { findSkiRun, RUN, skiableLand, sliceOfRun, smoothed, squash, type SkiRun } from '../src/core/skiRun';
import { writeSlice, type SkiSlice } from '../src/core/skiSlice';
import { landOfWorld } from '../src/core/worldLand';
import { HeightField } from '../src/core/terrain';
import { type MapRun, writeRunMap } from '../src/core/runMap';
import type { River, WorldWay } from '../src/core/world';

// (Each `--option` takes the word after it.)
const args = process.argv.slice(2), option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const folder = option('--picture'), mapOf = option('--map')?.split(',').map(Number).filter((n) => n > 0), cell = Number(option('--cell')) || 16;
const plain = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const seed = plain.find((a) => !/^\d+$/.test(a)) ?? 'w2', picks = plain.filter((a) => /^\d+$/.test(a)).map(Number);
let t = performance.now();
const w = world(seed);
console.log(`${seed} (${w.name}): world made in ${((performance.now() - t) / 1000).toFixed(1)} s`);
console.log(`  great peaks: ${w.peaks.map((q, k) => `${w.peakNames[k]} (${q.y.toFixed(0)} m)`).join(', ')}`);
t = performance.now();
const found = findSkiRun(w);
console.log(`  ${found.tried} starts tried, ${found.kept.length} runs kept, in ${((performance.now() - t) / 1000).toFixed(1)} s`);

/**
 * Runs carried further up than the search began them: by the world and their place among the runs kept, the point each is to start
 * from. (Asked: "Can we make the Lake wall run longer by making it start more from uphill as marked", on the map, at the knoll at the
 * head of the spur it comes down, some six hundred metres up the spur from where it began. The search lets a line go on only where
 * the land ahead falls by `RUN.gentle` at least, and the spur lies all but level for a hundred metres above where Lake Wall began, so
 * no line let go from higher up it came through.)
 */
const RAISED: Record<string, Record<number, [number, number]>> = { w2: { 14: [1664, -2244] } };

/** The world's land as the search reads it: brought lower above `RUN.squash.above`, smoothed, and where a path can be skied. */
let searched: { h: (x: number, z: number) => number; band: Uint8Array; cellOf: (x: number, z: number) => number } | null = null;
const searchLand = () => {
  if (searched) return searched;
  const f = new HeightField(w.field.x0, w.field.z0, w.field.cell, w.field.nx, w.field.nz);
  f.data.set(w.field.data.map(squash));
  const soft = smoothed(f, 1), { band } = skiableLand(w, f);
  const cellOf = (x: number, z: number) => {
    const i = Math.round((x - f.x0) / f.cell), j = Math.round((z - f.z0) / f.cell);
    return i < 0 || j < 0 || i >= f.nx || j >= f.nz ? -1 : j * f.nx + i;
  };
  return (searched = { h: (x, z) => soft.smoothAt(x, z), band, cellOf });
};
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * A run carried up to a point above its top: walked up from its top a step at a time, setting off the way the run comes down to it
 * turned about (so that it goes on into the run with no bend), turning toward the point no more sharply than a curve of `RUN.bend`
 * allows, over land where a path can be skied, never steeper than can be skied and never falling (as it is skied down, climbing no
 * more than half a metre in eight). Then measured again as the search measures a run.
 */
function raise(run: SkiRun, [tx, tz]: [number, number]): SkiRun {
  const { h, band, cellOf } = searchLand(), turnMost = RUN.step / RUN.bend, seg = RUN.ahead / 5, steep = Math.tan((RUN.steep * Math.PI) / 180);
  let [x, z] = run.points[0], a = Math.atan2(run.points[0][1] - run.points[1][1], run.points[0][0] - run.points[1][0]);
  const up: [number, number][] = [];
  while (Math.hypot(tx - x, tz - z) >= RUN.step) {
    if (up.length * RUN.step > RUN.longest) throw new Error(`run carried up to ${tx},${tz}: lost on the way`);
    // (Each way it could turn to, looking as far ahead as the search does, or only to the point, where it is nearer.)
    const toward = Math.atan2(tz - z, tx - x), look = Math.max(1, Math.min(5, Math.floor(Math.hypot(tx - x, tz - z) / seg)));
    let best = Infinity, to = a;
    for (let turn = -turnMost; turn <= turnMost + 1e-9; turn += turnMost / 3) {
      const b = a + turn, dx = Math.cos(b), dz = Math.sin(b);
      let prev = h(x, z), ok = true;
      for (let k = 1; k <= look && ok; k++) {
        const px = x + dx * seg * k, pz = z + dz * seg * k, c = cellOf(px, pz), y = h(px, pz);
        ok = c >= 0 && !!band[c] && y - prev <= steep * seg && y >= prev - 0.5;
        prev = y;
      }
      const off = Math.abs(Math.atan2(Math.sin(toward - b), Math.cos(toward - b)));
      if (ok && off < best) { best = off; to = b; }
    }
    if (best === Infinity) throw new Error(`run carried up to ${tx},${tz}: no way up from ${x.toFixed(0)},${z.toFixed(0)}`);
    a = to;
    x += Math.cos(a) * RUN.step; z += Math.sin(a) * RUN.step;
    up.push([x, z]);
  }
  const points = [...up.reverse(), ...run.points], hs = points.map(([px, pz]) => h(px, pz));
  const length = (points.length - 1) * RUN.step, drop = hs[0] - hs[hs.length - 1];
  // (As the search measures a run: how much of it keeps to a crest, its steepest over the look ahead, its steepness on the whole.)
  const crestAt = (px: number, pz: number, b: number) => {
    const dx = Math.cos(b), dz = Math.sin(b), c = RUN.crest;
    return h(px, pz) - (h(px - dz * c, pz + dx * c) + h(px + dz * c, pz - dx * c)) / 2;
  };
  let crest = 0, steepest = 0;
  for (let k = 1; k < points.length; k++) { const [px, pz] = points[k], [qx, qz] = points[k - 1]; if (crestAt(px, pz, Math.atan2(pz - qz, px - qx)) > 5) crest += RUN.step; }
  const per = Math.round(RUN.ahead / RUN.step);
  for (let k = per; k < points.length; k += per) steepest = Math.max(steepest, deg(Math.atan((hs[k - per] - hs[k]) / RUN.ahead)));
  return { step: RUN.step, points, heights: hs, drop, length, score: drop + 2 * hs[0] + 0.25 * length + 0.6 * crest, steepest, mean: deg(Math.atan(drop / length)), crest };
}

/** The runs kept, those named in `RAISED` carried up. */
const kept = found.kept.map((r, i) => {
  const top = RAISED[seed]?.[i + 1];
  return top ? raise(r, top) : r;
});

/** The nearest of a list to a point, and how far, kilometres. */
const nearest = <T extends { x: number; z: number }>(list: T[], [x, z]: [number, number]) =>
  list.reduce<{ it: T | null; d: number }>((best, it) => { const d = Math.hypot(it.x - x, it.z - z); return d < best.d ? { it, d } : best; }, { it: null, d: Infinity });
const peaks = w.peaks.map((q, k) => ({ ...q, name: w.peakNames[k] ?? '' }));
kept.forEach((r, i) => {
  const [a, b] = [r.points[0], r.points[r.points.length - 1]], peak = nearest(peaks, a), town = nearest(w.towns, b);
  const more = r === found.kept[i] ? '' : ` (carried ${r.length - found.kept[i].length} m further up than the search began it)`;
  console.log(`  ${String(i + 1).padStart(2)}. from ${a.map((v) => v.toFixed(0))} at ${r.heights[0].toFixed(0)} m to ${b.map((v) => v.toFixed(0))} at ${r.heights[r.heights.length - 1].toFixed(0)} m: ${r.length} m long, falling ${r.drop.toFixed(0)} m, ${r.mean.toFixed(1)} degrees on the whole, ${r.steepest.toFixed(1)} at most over ${RUN.ahead} m, ${r.crest} m along a crest; ${(peak.d / 1000).toFixed(1)} km from ${peak.it?.name}, its foot ${(town.d / 1000).toFixed(1)} km from ${town.it?.name} (${town.it?.kind})${more}`);
});

/** A run's slice, made as it would be alone. */
const sliceAlone = (run: SkiRun) => {
  // (The world's land keeps the tiles a slice makes, and the country about the next, read from them where they reach it, came out a
  // little different from the same run's slice written by itself.)
  landOfWorld(w).tiles.clear();
  return sliceOfRun(w, run);
};
/** A run's name in the game, as its slice is named. */
const idOf = (pick: number) => (pick === 1 ? seed : `${seed}-${pick}`);

for (const pick of picks) {
  const run = kept[pick - 1];
  if (!run) { console.log(`  no run ${pick} kept`); process.exitCode = 1; continue; }
  t = performance.now();
  const slice = sliceAlone(run);
  const text = writeSlice(slice), out = `slopes/${idOf(pick)}.json`;
  mkdirSync('slopes', { recursive: true });
  writeFileSync(out, text);
  let inSlice = 0;
  for (const v of slice.snow.data) if (!Number.isNaN(v)) inSlice++;
  const broad = slice.run.piste.map(([r, l]) => l - r);
  console.log(`  run ${pick}: slice made in ${((performance.now() - t) / 1000).toFixed(1)} s: ${inSlice.toLocaleString()} points of snow at a metre, its path ${Math.min(...broad).toFixed(0)} to ${Math.max(...broad).toFixed(0)} m broad; below ${slice.peak}`);
  console.log(`    written to ${out}, ${(text.length / 1e6).toFixed(2)} MB`);
  if (folder) picture(`${folder}/${seed}-${pick}-run.png`, run.points[Math.floor(run.points.length / 2)], 2500, 5, run);
}
if (folder) picture(`${folder}/${seed}-runs.png`, [0, 0], Math.max(w.plan.hx, w.plan.hz), 8);

if (mapOf?.length) {
  t = performance.now();
  const chosen = mapOf.map((n) => ({ n, run: kept[n - 1] })).filter((c): c is { n: number; run: SkiRun } => !!c.run);
  // The stretch: about the runs, half a kilometre more every way, within the world.
  const xs = chosen.flatMap((c) => c.run.points.map(([x]) => x)), zs = chosen.flatMap((c) => c.run.points.map(([, z]) => z)), margin = 500;
  const p = w.plan, area = {
    x0: Math.max(-p.hx, Math.floor((Math.min(...xs) - margin) / cell) * cell), x1: Math.min(p.hx, Math.ceil((Math.max(...xs) + margin) / cell) * cell),
    z0: Math.max(-p.hz, Math.floor((Math.min(...zs) - margin) / cell) * cell), z1: Math.min(p.hz, Math.ceil((Math.max(...zs) + margin) / cell) * cell),
  };
  // The world's land on the map's lattice; and what lies at each point, where the sea and the lakes are, from the world's nearest point.
  const nx = Math.round((area.x1 - area.x0) / cell) + 1, nz = Math.round((area.z1 - area.z0) / cell) + 1, f = w.field;
  const field = new HeightField(area.x0, area.z0, cell, nx, nz), sea = new Uint8Array(nx * nz), lake = new Float32Array(nx * nz), cover = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = area.x0 + i * cell, z = area.z0 + j * cell, k = j * nx + i;
    const ci = Math.min(f.nx - 1, Math.max(0, Math.round((x - f.x0) / f.cell))), cj = Math.min(f.nz - 1, Math.max(0, Math.round((z - f.z0) / f.cell))), wk = cj * f.nx + ci;
    field.data[k] = f.at(x, z); sea[k] = w.sea[wk]; lake[k] = w.lake[wk]; cover[k] = w.cover[wk];
  }
  // Rivers and ways, in the pieces of them that come within some way of the stretch (each piece a line of its own).
  const near = 300, inside = ([x, z]: [number, number]) => x > area.x0 - near && x < area.x1 + near && z > area.z0 - near && z < area.z1 + near;
  const pieces = <T extends { points: [number, number][] }>(lines: T[], make: (line: T, from: number, to: number) => T) => lines.flatMap((line) => {
    const out: T[] = [];
    let from = -1;
    line.points.forEach((q, i) => {
      if (inside(q) && from < 0) from = Math.max(0, i - 1);
      if ((!inside(q) || i === line.points.length - 1) && from >= 0) { out.push(make(line, from, Math.min(line.points.length, i + 1))); from = -1; }
    });
    return out.filter((o) => o.points.length > 1);
  });
  // (Each thinned to the points that turn it by more than a metre and a half, which the map, some four metres to a point of its
  // picture, cannot show: a river or a way has a point every few metres in the world.)
  const thin = (pts: [number, number][], tol = 1.5): number[] => {
    const keep = new Uint8Array(pts.length), stack: [number, number][] = [[0, pts.length - 1]];
    keep[0] = keep[pts.length - 1] = 1;
    while (stack.length) {
      const [a, b] = stack.pop()!, [ax, az] = pts[a], [bx, bz] = pts[b], l = Math.hypot(bx - ax, bz - az) || 1;
      let far = -1, most = tol;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * (bz - az) - (pts[i][1] - az) * (bx - ax)) / l; if (d > most) { most = d; far = i; } }
      if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    return pts.map((_, i) => i).filter((i) => keep[i]);
  };
  const rivers = pieces<River>(w.rivers, (r, a, b) => { const pts = r.points.slice(a, b), ws = r.width.slice(a, b), k = thin(pts); return { points: k.map((i) => pts[i]), width: k.map((i) => ws[i]) }; });
  const ways = pieces<WorldWay>(w.ways, (r, a, b) => { const pts = r.points.slice(a, b); return { kind: r.kind, points: thin(pts).map((i) => pts[i]) }; });
  const towns = w.towns.filter((q) => inside([q.x, q.z]));
  // Each run, from its slice: its line and its snow's height every twelve metres; its top and foot as the world has them.
  const worldHeight = (y: number) => (y <= RUN.squash.above ? y : RUN.squash.above + (y - RUN.squash.above) / RUN.squash.keep);
  const every = 3, runs: MapRun[] = chosen.map(({ n, run }) => {
    const slice: SkiSlice = sliceAlone(run), pts = slice.run.points, hs = slice.run.heights, broad = slice.run.piste.map(([r, l]) => l - r);
    const keep = pts.map((_, k) => k).filter((k) => k % every === 0 || k === pts.length - 1);
    return {
      id: idOf(n), step: slice.run.step * every, points: keep.map((k) => pts[k]), heights: keep.map((k) => hs[k]),
      length: slice.run.length, top: worldHeight(hs[0]), foot: worldHeight(hs[hs.length - 1]),
      mean: run.mean, steepest: run.steepest, crest: run.crest, broad: [Math.min(...broad), Math.max(...broad)],
    };
  });
  const text = writeRunMap({
    world: seed, worldName: w.name, regions: w.regions, plan: { seed: p.seed, hx: p.hx, hz: p.hz }, area,
    peaks: w.peaks.map((q, k) => ({ x: q.x, z: q.z, y: q.y, name: w.peakNames[k] ?? '' })), towns, rivers, ways,
    field, sea, lake, cover, squash: { ...RUN.squash }, runs,
  }), out = `slopes/${seed}-map.json`;
  mkdirSync('slopes', { recursive: true });
  writeFileSync(out, text);
  console.log(`  map of runs ${chosen.map((c) => c.n).join(', ')} made in ${((performance.now() - t) / 1000).toFixed(1)} s: ${((area.x1 - area.x0) / 1000).toFixed(1)} by ${((area.z1 - area.z0) / 1000).toFixed(1)} km at ${cell} m, ${rivers.length} rivers, ${ways.length} ways, ${towns.length} towns`);
  console.log(`    written to ${out}, ${(text.length / 1e6).toFixed(2)} MB`);
}

/** Shaded relief about a point, `half` metres each way at `px` metres a pixel, its cover tinted, the runs kept drawn over it. */
function picture(file: string, [mx, mz]: [number, number], half: number, px: number, chosen?: SkiRun) {
  const f = w.field, W = Math.round((2 * half) / px), H = W, rgb = new Uint8Array(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = mx - half + i * px, z = mz - half + j * px, hx = f.at(x + px, z) - f.at(x - px, z), hz = f.at(x, z + px) - f.at(x, z - px);
    const l = ((hx / (2 * px)) * 0.6 + (hz / (2 * px)) * 0.6 + 1) / Math.hypot(hx / (2 * px), hz / (2 * px), 1);
    const ci = Math.round((x - f.x0) / f.cell), cj = Math.round((z - f.z0) / f.cell), c = ci < 0 || cj < 0 || ci >= f.nx || cj >= f.nz ? 0 : w.cover[cj * f.nx + ci];
    const base = c <= 1 ? [70, 110, 160] : c === 6 ? [90, 130, 80] : c === 8 ? [160, 150, 140] : c === 9 ? [240, 240, 250] : c === 7 ? [150, 140, 100] : [170, 190, 120];
    for (let k = 0; k < 3; k++) rgb[(j * W + i) * 3 + k] = Math.min(255, base[k] * Math.max(0.25, Math.min(1.2, l)));
  }
  const dot = (x: number, z: number, col: number[], r = 1) => {
    const i = Math.round((x - mx + half) / px), j = Math.round((z - mz + half) / px);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < W && jj < H) rgb.set(col, (jj * W + ii) * 3); }
  };
  const colours = [[230, 30, 30], [255, 140, 0], [255, 230, 0], [0, 200, 0], [0, 220, 220], [40, 80, 255], [200, 0, 255], [255, 255, 255], [0, 0, 0], [255, 120, 200]];
  if (chosen) {
    kept.filter((k) => k !== chosen).forEach((k) => k.points.forEach(([x, z]) => dot(x, z, [255, 200, 0])));
    chosen.points.forEach(([x, z]) => dot(x, z, [230, 30, 30]));
  } else {
    kept.slice(10).forEach((k) => k.points.forEach(([x, z]) => dot(x, z, [120, 60, 30], 0)));
    kept.slice(0, 10).forEach((k, i) => k.points.forEach(([x, z]) => dot(x, z, colours[i])));
  }
  for (const q of [...w.places.map((p) => ({ ...p, r: RUN.place })), ...w.towns.map((t) => ({ ...t, r: RUN.town }))]) for (let a = 0; a < 200; a++) dot(q.x + Math.cos(a / 32) * q.r, q.z + Math.sin(a / 32) * q.r, [255, 0, 255], 0);
  for (const q of w.peaks) dot(q.x, q.z, [0, 0, 0], 4);
  mkdirSync(folder!, { recursive: true });
  writeFileSync(file, png(W, H, rgb));
  console.log(`  picture: ${file}`);
}

/** A PNG of RGB pixels. */
function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const t = Buffer.from(type), len = Buffer.alloc(4), c = Buffer.alloc(4); len.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
