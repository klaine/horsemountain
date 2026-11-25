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
 * A run named in `RAISED` is carried further up its mountain than the search began it, to the point given there; one named in `LAID`
 * has its line laid, or the rest of it, through points given there, to where another run ends. Each is listed, written and mapped so.
 *
 *   npx tsx tools/skiRun.ts [world seed, w2] [which runs kept to write: 1 3 ...] [--picture <folder>] [--map 1,3,8,10] [--cell 16]
 *
 * (With no runs named it only lists them, and writes nothing.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { world } from '../src/core/world';
import { findSkiRun, RUN, skiableLand, sliceOfRun, smoothed, squash, type SkiRun } from '../src/core/skiRun';
import { gridAt, type Grid, writeSlice, type SkiSlice } from '../src/core/skiSlice';
import { landOfWorld } from '../src/core/worldLand';
import { HeightField, leastPath } from '../src/core/terrain';
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
  return measured([...up.reverse(), ...run.points]);
}

/** A line measured as the search measures a run: how far and how steeply it falls, how much of it keeps to a crest. */
function measured(points: [number, number][]): SkiRun {
  const { h } = searchLand(), hs = points.map(([px, pz]) => h(px, pz));
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

/**
 * Runs laid by hand, wholly or from some way down: by the world and their place among the runs kept, the run whose line each keeps
 * the first metres of (`after`: itself, to lay only the rest of it anew; another, to set off from that one's top), the points its
 * line goes through, in turn, from there, and the run at whose foot it ends. (Asked: "route 3 and 6 to end in same location in
 * Ashbridge? route 8 to bend around and also end there in Ashbridge? Route 8 would start from route 3 start, but diverge": the game's
 * third, sixth and eighth runs, Ashbridge, Lake Wall and Arford, the eighth, fourteenth and twenty-fifth kept. Ashbridge comes down
 * to the head of the lake under the range; Lake Wall had come down to its far shore, 150 metres off across the water, and so is
 * kept to where it was about to drop to it, then laid across the slope above the lake to Ashbridge's foot. The twenty-fifth, which
 * had gone down to the shore above Arford, sets off down Ashbridge's first hundred metres, leaves it to the south, round the spur
 * the old one came down, and comes back east under Ashbridge to the same foot: turned east above the head of the gully, where it had
 * been laid through it first, and the demo run stood still on its level floor. Then, asked: "could we add an alternative path also
 * on the right side forking from run 6 (sharing same start)", along a line drawn on the map, "37 degrees for momentarily is fine",
 * "you can add bends if it helps": the fortieth, none the search kept (it keeps thirty-two), sets off down Lake Wall's first two
 * hundred metres, leaves it to the east, down the far side of its spur and round under it to the west, to the same foot. `steep`,
 * how steep a line laid may be at most, degrees, where it is more than the search's `RUN.steep`; and then over land the search would
 * not ski, though only where it must.)
 */
const LAID: Record<string, Record<number, { after: { run: number; metres: number }; through: [number, number][]; to: { run: number }; steep?: number }>> = {
  w2: {
    14: { after: { run: 14, metres: 1360 }, through: [], to: { run: 8 } },
    25: { after: { run: 8, metres: 100 }, through: [[272, -1143]], to: { run: 8 } },
    40: { after: { run: 14, metres: 200 }, through: [[1454, -2014], [1320, -1771], [1340, -1600]], to: { run: 8 }, steep: 40 },
  },
};

/**
 * A line laid from `from`, setting off `heading`, through each of `stops` in turn. First the way of least effort over the search's
 * land (`leastPath`, on the world's lattice): only where a path can be skied (or, `steep` given, dearer where it cannot), never
 * climbing, never steeper than can be skied (or `steep`), and dear where it is flatter than glides well, steeper than the search aims
 * for, or tilted across more than a path may be. Then followed a step at a time, turning toward a point some way along it no more
 * sharply than the tightest curve, as the search's own lines turn, each step the way nearest that which does not climb. (The way
 * alone went in steps of the lattice, eight metres, and turned in eighths of a circle; and followed so, cut over the bumps between
 * its turns, climbing three metres at a time.)
 */
function lay(from: [number, number], heading: number, stops: [number, number][], steep = RUN.steep): [number, number][] {
  const { h, band } = searchLand(), f = w.field, rad = (d: number) => (d * Math.PI) / 180;
  const cost = (a: number, b: number) => {
    const wild = !band[b];
    if (wild && steep <= RUN.steep) return Infinity;
    const ax = f.x0 + (a % f.nx) * f.cell, az = f.z0 + Math.floor(a / f.nx) * f.cell, bx = f.x0 + (b % f.nx) * f.cell, bz = f.z0 + Math.floor(b / f.nx) * f.cell;
    const len = Math.hypot(bx - ax, bz - az), s = (h(ax, az) - h(bx, bz)) / len;
    if (s < 0 || s > Math.tan(rad(steep))) return Infinity;
    const ux = (bx - ax) / len, uz = (bz - az) / len, gx = (h(bx + 4, bz) - h(bx - 4, bz)) / 8, gz = (h(bx, bz + 4) - h(bx, bz - 4)) / 8;
    const across = Math.abs(-uz * gx + ux * gz);
    return (wild ? 3 : 1) * len * (1 + 6 * Math.max(0, Math.tan(rad(RUN.gentle + 3)) - s) + 2 * Math.max(0, s - Math.tan(rad(RUN.aim))) + 4 * Math.max(0, across - Math.tan(rad(RUN.across))));
  };
  const guide: [number, number][] = [from];
  for (const stop of stops) {
    const leg = leastPath(f.x0, f.z0, f.cell, f.nx, f.nz, guide[guide.length - 1], stop, cost);
    if (!leg) throw new Error(`run laid through ${stops.join(' ')}: no way down to ${stop}`);
    guide.push(...leg.slice(1), stop);
  }
  const cum = [0];
  for (let i = 1; i < guide.length; i++) cum.push(cum[i - 1] + Math.hypot(guide[i][0] - guide[i - 1][0], guide[i][1] - guide[i - 1][1]));
  const along = (d: number): [number, number] => {
    let i = 1;
    while (i < guide.length - 1 && cum[i] < d) i++;
    const t = Math.min(1, Math.max(0, (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
    return [guide[i - 1][0] + (guide[i][0] - guide[i - 1][0]) * t, guide[i - 1][1] + (guide[i][1] - guide[i - 1][1]) * t];
  };
  const end = guide[guide.length - 1], turnMost = RUN.step / RUN.bend;
  let [x, z] = from, a = heading, d = 0;
  const out: [number, number][] = [[x, z]];
  while (Math.hypot(end[0] - x, end[1] - z) > RUN.step) {
    if (out.length * RUN.step > RUN.longest) throw new Error(`run laid through ${stops.join(' ')}: lost on the way`);
    // (Where along the way it is: the nearest of it a little ahead of where it was; and toward the way some thirty metres on.)
    let near = Infinity;
    for (let k = d; k < Math.min(cum[cum.length - 1], d + 40); k += 2) { const [qx, qz] = along(k), e = Math.hypot(qx - x, qz - z); if (e < near) { near = e; d = k; } }
    const [tx, tz] = along(d + 28), want = Math.atan2(tz - z, tx - x), turn = Math.max(-turnMost, Math.min(turnMost, Math.atan2(Math.sin(want - a), Math.cos(want - a))));
    const here = h(x, z);
    let pick = a, climbs = Infinity, miss = Infinity;
    for (let t = -turnMost; t <= turnMost + 1e-9; t += turnMost / 4) {
      const b = a + t, up = Math.max(0, h(x + Math.cos(b) * RUN.step, z + Math.sin(b) * RUN.step) - here - 0.05), off = Math.abs(t - turn);
      if (up < climbs - 1e-9 || (Math.abs(up - climbs) <= 1e-9 && off < miss)) { climbs = up; miss = off; pick = b; }
    }
    a = pick;
    x += Math.cos(a) * RUN.step; z += Math.sin(a) * RUN.step;
    out.push([x, z]);
  }
  return out;
}

/** The runs kept, those named in `RAISED` carried up, and then those in `LAID` laid (from the runs as carried up). */
const raised = found.kept.map((r, i) => {
  const top = RAISED[seed]?.[i + 1];
  return top ? raise(r, top) : r;
});
// (Laid runs numbered past those the search keeps are runs of their own: the list goes on to them, with none between.)
const laidPast = Object.keys(LAID[seed] ?? {}).map(Number).filter((n) => n > raised.length);
const kept: (SkiRun | undefined)[] = Array.from({ length: Math.max(raised.length, ...laidPast) }, (_, i) => raised[i]).map((r, i) => {
  const o = LAID[seed]?.[i + 1];
  if (!o) return r;
  const from = raised[o.after.run - 1], to = raised[o.to.run - 1];
  if (!from || !to) throw new Error(`run ${i + 1} laid from or to a run not kept`);
  const first = from.points.slice(0, Math.round(o.after.metres / RUN.step) + 1), [p, q] = [first[first.length - 1], first[first.length - 2]];
  const rest = lay(p, Math.atan2(p[1] - q[1], p[0] - q[0]), [...o.through, to.points[to.points.length - 1]], o.steep);
  return measured([...first, ...rest.slice(1)]);
});

/** The nearest of a list to a point, and how far, kilometres. */
const nearest = <T extends { x: number; z: number }>(list: T[], [x, z]: [number, number]) =>
  list.reduce<{ it: T | null; d: number }>((best, it) => { const d = Math.hypot(it.x - x, it.z - z); return d < best.d ? { it, d } : best; }, { it: null, d: Infinity });
const peaks = w.peaks.map((q, k) => ({ ...q, name: w.peakNames[k] ?? '' }));
kept.forEach((r, i) => {
  if (!r) return;
  const [a, b] = [r.points[0], r.points[r.points.length - 1]], peak = nearest(peaks, a), town = nearest(w.towns, b);
  const more = LAID[seed]?.[i + 1] ? ` (laid by hand: \`LAID\`)` : r === found.kept[i] ? '' : ` (carried ${r.length - found.kept[i]!.length} m further up than the search began it)`;
  console.log(`  ${String(i + 1).padStart(2)}. from ${a.map((v) => v.toFixed(0))} at ${r.heights[0].toFixed(0)} m to ${b.map((v) => v.toFixed(0))} at ${r.heights[r.heights.length - 1].toFixed(0)} m: ${r.length} m long, falling ${r.drop.toFixed(0)} m, ${r.mean.toFixed(1)} degrees on the whole, ${r.steepest.toFixed(1)} at most over ${RUN.ahead} m, ${r.crest} m along a crest; ${(peak.d / 1000).toFixed(1)} km from ${peak.it?.name}, its foot ${(town.d / 1000).toFixed(1)} km from ${town.it?.name} (${town.it?.kind})${more}`);
});

/** A run's slice, made as it would be alone. */
const sliceAlone = (run: SkiRun) => {
  // (The world's land keeps the tiles a slice makes, and the country about the next, read from them where they reach it, came out a
  // little different from the same run's slice written by itself.)
  landOfWorld(w).tiles.clear();
  const pick = kept.indexOf(run) + 1, slice = sliceOfRun(w, run), bench = TERRACED[seed]?.[pick];
  return bench ? terrace(slice, bench, forksOf(pick).map((o) => kept[o - 1]!.points)) : slice;
};

/**
 * Runs terraced (asked: "Can the lakewall east new route be somehow bit more landscaped/terraced so that it is not in so sideways
 * angled orientation often"): Lake Wall East, laid by hand across the far side of its spur, along a hillside that falls away across it
 * some twenty degrees as often as not, and forty in places, where the search's own runs tilt five. By the world and the run's place
 * among those kept: from how far down it (`from`, metres: past where it parts from the run it sets off down, so that the snow the two
 * share is the same in both their slices), how much across the bench may tilt at most (`most`, degrees), how far out either side of
 * the line the bench reaches at least (`half`, metres), and over how far beyond it its banks come back to the land (`bank`).
 */
const TERRACED: Record<string, Record<number, { from: number; most: number; half: number; bank: number }>> = { w2: { 40: { from: 215, most: 6, half: 11, bank: 14 } } };
/**
 * A run's snow cut and filled into a bench along it, as a road is cut along a hillside: across the line, level but for the land's own
 * lean, as much as `most` (eased along the run over sixteen metres either way); out to `half` either side of the line, and beyond, over
 * `bank` metres, back to the snow as it lay, a cut bank above it and a filled one below; eased in over forty metres from `from`. Along
 * the line nothing is changed: each point across the bench is at the line's own height there, but for the lean. The piste then as broad
 * as the bench at least, where it had been held narrow by how steep the land beside the line was. None where a run that parts from it
 * runs beside it, within thirty metres, easing in to sixty. And nothing changed toward a run that
 * parts from it (`others`, their lines): eased back to the snow as it lay by the time it is as near the other's line as its own, where
 * the slices of the two, each with the land of both (`forked`), take the other's snow; else there a step had stood between them.
 */
function terrace(slice: SkiSlice, o: { from: number; most: number; half: number; bank: number }, others: [number, number][][] = []): SkiSlice {
  const { points: P, heights: Hs, step, piste } = slice.run, g = slice.snow, d = g.data, natural = Float32Array.from(d), n = P.length;
  const H = (x: number, z: number) => gridAt({ ...g, data: natural }, x, z);
  // (The left of the line at each point, as the piste's edges have it: positive to the left.)
  const left = P.map((_, k) => { const [ax, az] = P[Math.max(0, k - 1)], [bx, bz] = P[Math.min(n - 1, k + 1)], l = Math.hypot(bx - ax, bz - az) || 1; return [(bz - az) / l, -(bx - ax) / l] as [number, number]; });
  const lean = P.map(([px, pz], k) => { const [lx, lz] = left[k], a = 6, v = (H(px + lx * a, pz + lz * a) - H(px - lx * a, pz - lz * a)) / (2 * a); return Number.isNaN(v) ? 0 : v; });
  const most = Math.tan((o.most * Math.PI) / 180), span = Math.round(16 / step);
  const tilt = lean.map((_, k) => { const w = lean.slice(Math.max(0, k - span), k + span + 1), m = w.reduce((a, b) => a + b, 0) / w.length; return Math.max(-most, Math.min(most, m)); });
  // (Only where the run is out on its own (asked, of the shared stretches: "Not on the shares sections"): none while another run that
  // parts from it is within thirty metres of its line, all of it from sixty; and from `from` on.)
  const ease = (u: number) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
  const apart = P.map(([px, pz]) => (others.length ? Math.min(...others.map((l) => offLine(l, px, pz))) : Infinity));
  const alone = apart.map((_, k) => Math.min(...apart.slice(Math.max(0, k - span), k + span + 1)));
  const on = (k: number) => { const i = Math.max(0, Math.min(n - 1, Math.round(k))); return ease((k * step - o.from) / 40) * ease((alone[i] - 30) / 30); };
  // Each point of the snow at a metre near the line: the nearest of the line to it (as a fraction of the way along its points), and
  // how far to the left of it it is.
  const R = o.half + o.bank + 2, best = new Float32Array(d.length).fill(Infinity), at = new Float32Array(d.length), off = new Float32Array(d.length);
  for (let k = 0; k < n - 1; k++) {
    if (on(k + 1) <= 0) continue;
    const [ax, az] = P[k], [bx, bz] = P[k + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - R - g.x0)), i1 = Math.min(g.nx - 1, Math.ceil(Math.max(ax, bx) + R - g.x0));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - R - g.z0)), j1 = Math.min(g.nz - 1, Math.ceil(Math.max(az, bz) + R - g.z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * g.nx + i;
      if (Number.isNaN(d[c])) continue;
      const x = g.x0 + i, z = g.z0 + j, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), qx = ax + dx * t, qz = az + dz * t, e = Math.hypot(x - qx, z - qz);
      if (e >= best[c]) continue;
      const lx = left[k][0] + (left[k + 1][0] - left[k][0]) * t, lz = left[k][1] + (left[k + 1][1] - left[k][1]) * t;
      best[c] = e; at[c] = k + t; off[c] = (x - qx) * lx + (z - qz) * lz;
    }
  }
  for (let c = 0; c < d.length; c++) {
    if (!(best[c] <= R)) continue;
    const k0 = Math.min(n - 2, Math.floor(at[c])), t = at[c] - k0, w = on(at[c]);
    if (w <= 0) continue;
    const centre = Hs[k0] + (Hs[k0 + 1] - Hs[k0]) * t, lean_ = tilt[k0] + (tilt[k0 + 1] - tilt[k0]) * t, a = Math.abs(off[c]);
    let keep = a <= o.half ? 1 : 1 - ease((a - o.half) / o.bank);
    if (keep > 0 && others.length) { const x = g.x0 + (c % g.nx), z = g.z0 + Math.floor(c / g.nx); keep *= ease((Math.min(...others.map((l) => offLine(l, x, z))) - best[c] - 1) / 12); }
    d[c] = natural[c] + (centre + lean_ * off[c] - natural[c]) * keep * w;
  }
  const broad = piste.map(([r, l], k) => [Math.min(r, -o.half * on(k)), Math.max(l, o.half * on(k))] as [number, number]);
  return { ...slice, run: { ...slice.run, piste: broad } };
}
/** A run's name in the game, as its slice is named. */
const idOf = (pick: number) => (pick === 1 ? seed : `${seed}-${pick}`);

/**
 * Runs that set off down the same line and part (asked: "proceed with making the combined diverging runs"): Ashbridge and Ashbridge
 * Bend, Lake Wall and Lake Wall East. Each is written with the land of both, its own line its way down and the other's a branch off
 * it, from where the two part (`branches`, beside what a slice holds, which the game reads as it is), so that either can be ridden
 * down from the top whichever was chosen.
 */
const FORKS: Record<string, [number, number][]> = { w2: [[8, 25], [14, 40]] };
const forksOf = (pick: number) => (FORKS[seed] ?? []).flatMap(([a, b]) => (a === pick ? [b] : b === pick ? [a] : []));
/** How far a point lies from a line, in metres, from its points (a step apart, near enough for which of two lines is nearer). */
const offLine = (line: [number, number][], x: number, z: number) => { let d = Infinity; for (const [px, pz] of line) d = Math.min(d, (px - x) ** 2 + (pz - z) ** 2); return Math.sqrt(d); };
/**
 * A grid of `a` grown to reach as far as `b` does, on `a`'s own lattice: where only one has land, that one's; where both do, the one
 * whose run's line is nearer (`b`'s where `nearerB`). (The snow at a metre lies on the world's own lattice in every slice; the land
 * about the run, at four metres, on one begun where the slice begins, so `b`'s is read between its points.)
 */
function grown(a: Grid, b: Grid, nearerB: (x: number, z: number) => boolean): Grid {
  const c = a.cell, ax1 = a.x0 + (a.nx - 1) * c, az1 = a.z0 + (a.nz - 1) * c, bx1 = b.x0 + (b.nx - 1) * b.cell, bz1 = b.z0 + (b.nz - 1) * b.cell;
  const x0 = a.x0 - Math.ceil(Math.max(0, a.x0 - b.x0) / c) * c, z0 = a.z0 - Math.ceil(Math.max(0, a.z0 - b.z0) / c) * c;
  const nx = Math.round((ax1 + Math.ceil(Math.max(0, bx1 - ax1) / c) * c - x0) / c) + 1, nz = Math.round((az1 + Math.ceil(Math.max(0, bz1 - az1) / c) * c - z0) / c) + 1;
  const data = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * c, z = z0 + j * c, ai = Math.round((x - a.x0) / c), aj = Math.round((z - a.z0) / c);
    const va = ai < 0 || aj < 0 || ai >= a.nx || aj >= a.nz ? NaN : a.data[aj * a.nx + ai], vb = gridAt(b, x, z);
    data[j * nx + i] = Number.isNaN(va) ? vb : Number.isNaN(vb) ? va : nearerB(x, z) ? vb : va;
  }
  return { x0, z0, cell: c, nx, nz, data };
}
/** A run's slice with the land of the runs that part from it, and their lines as its branches. */
function forked(main: SkiSlice, others: { id: string; slice: SkiSlice }[]) {
  let { snow, near } = main;
  const branches = others.map(({ id, slice: o }) => {
    const a = main.run.points, b = o.run.points;
    let k = 0;
    while (k < Math.min(a.length, b.length) - 1 && Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) < 0.5) k++;
    const from = k * main.run.step, nearerB = (x: number, z: number) => offLine(b, x, z) < offLine(a, x, z) - 1;
    snow = grown(snow, o.snow, nearerB);
    near = grown(near, o.near, nearerB);
    return { id, from, run: o.run };
  });
  return { ...main, snow, near, branches };
}

for (const pick of picks) {
  const run = kept[pick - 1];
  if (!run) { console.log(`  no run ${pick} kept`); process.exitCode = 1; continue; }
  t = performance.now();
  const alone = sliceAlone(run), parts = forksOf(pick).map((o) => ({ id: idOf(o), slice: sliceAlone(kept[o - 1]!) }));
  const slice = parts.length ? forked(alone, parts) : alone;
  if (parts.length) console.log(`  run ${pick}: forked, its branches ${(slice as ReturnType<typeof forked>).branches.map((b) => `${b.id} from ${b.from} m`).join(', ')}`);
  const text = writeSlice(slice), out = `slopes/${idOf(pick)}.json`;
  mkdirSync('slopes', { recursive: true });
  writeFileSync(out, text);
  let inSlice = 0;
  for (const v of slice.snow.data) if (!Number.isNaN(v)) inSlice++;
  const broad = slice.run.piste.map(([r, l]) => l - r);
  console.log(`  run ${pick}: slice made in ${((performance.now() - t) / 1000).toFixed(1)} s: ${inSlice.toLocaleString()} points of snow at a metre, its path ${Math.min(...broad).toFixed(0)} to ${Math.max(...broad).toFixed(0)} m broad; below ${slice.peak}`);
  console.log(`    written to ${out}, ${(text.length / 1e6).toFixed(2)} MB`);
  // (How much its line climbs anywhere over twenty metres, in the slice's own snow: the land a line is laid over is the search's, at
  // eight metres and smoothed, and a hump of two or three metres under a line laid by hand, too small for it, stopped the demo run.)
  const hs = slice.run.heights, per = Math.round(20 / slice.run.step);
  let climb = 0, climbAt = 0;
  for (let k = per; k < hs.length; k++) if (hs[k] - hs[k - per] > climb) { climb = hs[k] - hs[k - per]; climbAt = k * slice.run.step; }
  if (climb > 0.3) console.log(`    its line climbs ${climb.toFixed(1)} m over twenty, ${climbAt} m down`);
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
    kept.filter((k): k is SkiRun => !!k && k !== chosen).forEach((k) => k.points.forEach(([x, z]) => dot(x, z, [255, 200, 0])));
    chosen.points.forEach(([x, z]) => dot(x, z, [230, 30, 30]));
  } else {
    kept.slice(10).forEach((k) => k?.points.forEach(([x, z]) => dot(x, z, [120, 60, 30], 0)));
    kept.slice(0, 10).forEach((k, i) => k?.points.forEach(([x, z]) => dot(x, z, colours[i])));
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
