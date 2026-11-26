import { Rng } from './rng';

/**
 * A settlement grown rather than planned: its lanes leave the roads it already has and find their own way over the land, and its
 * houses line both sides of every way, fronts to it. There are no blocks: what lies between the lanes is whatever the houses along
 * them leave, as in a village that grew a house at a time. The method is the one Oleg Dolya (watabou) describes for his village
 * generator, written afresh here for our land and measures:
 *
 * - How thickly a place is settled is a field over the land (`density`), which the caller makes from what matters there: how far
 *   from the heart of the place, how steep, how near the castle.
 * - Lanes grow a few metres at a step. Each step turns them towards the lie of the land, along the slope where it is steep and up or
 *   down it where it is gentle, but only once the pull to turn is more than a little (`rigid`), so that they run straight and then bend.
 *   A lane that comes up to another way joins it, which is the only way a loop closes. One that has gone far enough without a
 *   junction (`block`, shorter where the place is thicker) puts out a branch square to itself. Where the settlement thins out, a lane
 *   goes on as a trail for a little and ends at a farmstead.
 * - Houses are dealt one after another along each side of each way, each standing on the chord of the way under its front, so that
 *   fronts follow a bending lane; each is kept with a chance that is the density where it stands.
 *
 * Measures are metres, x and z on the ground. Nothing here knows of valleys or towns: the caller says what is open ground, how thick
 * the settlement is, how the land lies and what a house is, and checks each house against what else it has.
 */

export type Pt = [number, number];

export interface GrowLand {
  /** Whether a way may run over this point. */
  open(x: number, z: number): boolean;
  /** How thickly the place is settled here, 0 (not at all) to 1. */
  density(x: number, z: number): number;
  /** The land's height, which the lanes follow; none for level ground, where they run as they set out, bending a little. */
  height?(x: number, z: number): number;
}

/** A way that is there before the settlement grows: a road that lanes may leave and houses may line, or something only to keep clear of. */
export interface GivenWay {
  points: Pt[];
  /** Half its breadth and a little more: how near its middle a house's wall may come. */
  clear: number;
  /** How far from its middle a house's front stands on it, before the house's own leeway. */
  setback: number;
  /** The stretch of it, by distance along it, that lanes may leave from and houses may line; none for a way only to keep clear of. */
  span?: [number, number];
  /** Whether a lane goes on from each of its ends, as a harbour's waterfront goes on along the shore beyond its quay. */
  ends?: boolean;
  /** How much further apart than elsewhere lanes leave it (1 if not given): a broad front, as a harbour's, wants room for broad buildings. */
  spread?: number;
  /**
   * Whether it is built up wall to wall, as a harbour's front or a square's is: a house wherever the place is settled at all, each
   * against the last, their fronts on one line, square to the way.
   */
  tight?: boolean;
}

export interface GrownWay {
  points: Pt[];
  kind: 'road' | 'lane' | 'trail';
  /** How far along it houses may stand: all of a lane, the part of one that went on as a trail before it did, none of a trail. */
  lined: number;
  /** How it ended: at another way (`join`), at ground it could not cross (`edge`), where the settlement thinned out (`thin`), or as a trail at a farmstead (`farm`). */
  end: 'join' | 'edge' | 'thin' | 'farm' | 'given';
}

export interface GrowOptions {
  /** How far a lane goes in a step. */
  step: number;
  /** How far apart junctions are where the density is 1: further apart as it falls. */
  block: number;
  /** How strong a pull to turn has to be before a lane turns: 0 bends at every step, 0.3 runs nearly straight. */
  rigid: number;
  /** How near a house's wall may come to a lane's middle, and how far back from it its front stands before its own leeway. */
  laneClear: number;
  laneSetback: number;
  /** The longest a lane grows, and how many lanes there may be. */
  longest: number;
  most: number;
  /** How far a lane goes on as a trail where the settlement has thinned out (none for no trails). */
  trail: [number, number];
  /** The most houses there may be, if there is a most. */
  houses?: number;
  /**
   * How far a lane keeps from another way running alongside it, if it keeps any distance: one that comes nearer than this to a way
   * running the same way as itself ends there, so that there is room for houses back to back between them. (One coming up to a way
   * across it still joins it.)
   */
  apart?: number;
}

export interface Lot<T> {
  house: T;
  x: number;
  z: number;
  /** The bearing its front faces, as a building's `turn`. */
  turn: number;
  /** The way it fronts (an index into the ways: the given ones first), and whether it is a farmstead at a trail's end. */
  way: number;
  farm: boolean;
}

/** A way's points measured: the distance along it to each. */
function measure(points: Pt[]): number[] {
  const out = [0];
  for (let k = 1; k < points.length; k++) out.push(out[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
  return out;
}

/** Where a way is at a distance along it, and which way it runs there. */
function along(points: Pt[], lengths: number[], s: number): [number, number, number, number] {
  let k = 1;
  while (k < points.length - 1 && lengths[k] < s) k++;
  const l = lengths[k] - lengths[k - 1] || 1, t = Math.min(1, Math.max(0, (s - lengths[k - 1]) / l));
  const dx = (points[k][0] - points[k - 1][0]) / l, dz = (points[k][1] - points[k - 1][1]) / l;
  return [points[k - 1][0] + (points[k][0] - points[k - 1][0]) * t, points[k - 1][1] + (points[k][1] - points[k - 1][1]) * t, dx, dz];
}

/** The nearest point of a segment to a point, and how far off it is. */
function nearest(ax: number, az: number, bx: number, bz: number, x: number, z: number): [number, number, number] {
  const dx = bx - ax, dz = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  const px = ax + dx * t, pz = az + dz * t;
  return [px, pz, Math.hypot(x - px, z - pz)];
}

/** Whether two segments cross, and where. */
function crossing(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): Pt | null {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [ax + rx * t, az + rz * t] : null;
}

/**
 * Whether an oblong `w` across its front and `d` deep about (x, z), its front facing the bearing `turn`, keeps `m` metres and more
 * clear of every segment of every way. (The segment is taken into the oblong's own measures and clipped to it, grown by `m`.)
 */
export function clearOfWays(ways: { points: Pt[] }[], x: number, z: number, w: number, d: number, turn: number, m: number): boolean {
  const c = Math.cos(turn), sn = Math.sin(turn), hu = w / 2 + m, hv = d / 2 + m, reach = Math.hypot(hu, hv);
  const local = (px: number, pz: number): Pt => [(px - x) * sn - (pz - z) * c, (px - x) * c + (pz - z) * sn];
  for (const way of ways) for (let k = 0; k + 1 < way.points.length; k++) {
    const [ax, az] = way.points[k], [bx, bz] = way.points[k + 1];
    if (nearest(ax, az, bx, bz, x, z)[2] > reach) continue;
    const [u0, v0] = local(ax, az), [u1, v1] = local(bx, bz);
    // (Liang and Barsky's clipping: whether any of the segment lies within the box.)
    let t0 = 0, t1 = 1, hit = true;
    for (const [p, q] of [[-(u1 - u0), u0 + hu], [u1 - u0, hu - u0], [-(v1 - v0), v0 + hv], [v1 - v0, hv - v0]] as const) {
      if (p === 0) { if (q < 0) { hit = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { hit = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { hit = false; break; } if (r < t1) t1 = r; }
    }
    if (hit) return false;
  }
  return true;
}

/** Rounds a way's corners once (Chaikin's cutting), keeping its ends where they are, so that a lane bends rather than kinks. */
function soften(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k], [bx, bz] = points[k + 1];
    if (k > 0) out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
    if (k + 2 < points.length) out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
  }
  out.push(points[points.length - 1]);
  return out;
}

interface Tracker { way: number; parent: number; x: number; z: number; dx: number; dz: number; len: number; since: number; trail: number; kind: 'lane' | 'trail' }

/**
 * Grows the lanes from the given ways over the land. Returns every way, the given ones first (as `road`s) and then the lanes and
 * trails in the order they were begun.
 */
export function growWays(given: GivenWay[], land: GrowLand, o: GrowOptions, rng: Rng): GrownWay[] {
  const ways: (GrownWay & { parent: number })[] = given.map((g) => ({ points: g.points.slice(), kind: 'road', end: 'given', lined: Infinity, parent: -1 }));
  const junctions: Pt[] = [];
  const spacing = (d: number) => o.block / Math.max(0.3, d);
  const junctionNear = (x: number, z: number, r: number) => junctions.some(([jx, jz]) => Math.hypot(jx - x, jz - z) < r);
  const trackers: Tracker[] = [];
  const begin = (parent: number, x: number, z: number, dx: number, dz: number) => {
    if (ways.length - given.length >= o.most) return;
    // (Only where the first two steps are open: a lane that could not leave its road is not begun.)
    for (const t of [1, 2]) if (!land.open(x + dx * o.step * t, z + dz * o.step * t)) return;
    ways.push({ points: [[x, z]], kind: 'lane', end: 'edge', lined: Infinity, parent });
    trackers.push({ way: ways.length - 1, parent, x, z, dx, dz, len: 0, since: 0, trail: 0, kind: 'lane' });
  };

  // The lanes leave the given roads where the place is settled, square to the road, on one hand or the other or both, the points
  // tried in no order, each kept only where no junction is nearer than the spacing there.
  const q = rng.fork('seeds');
  const seeds: { way: number; x: number; z: number; dx: number; dz: number; spread: number }[] = [];
  for (const [i, g] of given.entries()) {
    if (!g.span) continue;
    const lengths = measure(g.points);
    for (let s = g.span[0] + o.step; s < Math.min(g.span[1], lengths[lengths.length - 1]); s += o.step) {
      const [x, z, dx, dz] = along(g.points, lengths, s);
      seeds.push({ way: i, x, z, dx, dz, spread: g.spread ?? 1 });
    }
  }
  // (From the ends of a way that goes on, first: on along the line of its end.)
  for (const [i, g] of given.entries()) if (g.ends && g.points.length > 1) {
    const p = g.points, n = p.length;
    for (const [[ax, az], [bx, bz]] of [[p[1], p[0]], [p[n - 2], p[n - 1]]] as [Pt, Pt][]) {
      const l = Math.hypot(bx - ax, bz - az) || 1;
      begin(i, bx, bz, (bx - ax) / l, (bz - az) / l);
      if (ways.length > given.length) junctions.push([bx, bz]);
    }
  }
  for (let k = seeds.length - 1; k > 0; k--) { const j = Math.floor(q.next() * (k + 1)); [seeds[k], seeds[j]] = [seeds[j], seeds[k]]; }
  for (const sd of seeds) {
    const d = land.density(sd.x, sd.z);
    if (d <= 0.05 || junctionNear(sd.x, sd.z, spacing(d) * sd.spread)) continue;
    const r = q.next(), hands = r < 1 / 3 ? [1] : r < 2 / 3 ? [-1] : [1, -1];
    const before = ways.length;
    for (const h of hands) begin(sd.way, sd.x, sd.z, -sd.dz * h, sd.dx * h);
    if (ways.length > before) junctions.push([sd.x, sd.z]);
  }

  // Every lane steps on in turn until it ends.
  const lean = rng.fork('lean');
  const slope = (x: number, z: number): Pt => {
    if (!land.height) return [0, 0];
    const e = 1.5;
    return [(land.height(x + e, z) - land.height(x - e, z)) / (2 * e), (land.height(x, z + e) - land.height(x, z - e)) / (2 * e)];
  };
  /** Where a lane stepping from (x, z) to (nx, nz) runs into another way, if it does: the point it joins it at. */
  const meets = (t: Tracker, x: number, z: number, nx: number, nz: number): Pt | null => {
    const ahead: Pt = [x + (nx - x) * 1.6, z + (nz - z) * 1.6], snap = o.step * 1.3;
    let best: Pt | null = null, bestD = Infinity;
    for (const [i, w] of ways.entries()) {
      // (Not its own last few steps, nor, as it leaves, the way it left.)
      const own = i === t.way, pts = own ? w.points.slice(0, -4) : w.points;
      if (i === t.parent && t.len < o.step * 2.5) continue;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        const cut = crossing(x, z, ahead[0], ahead[1], ax, az, bx, bz);
        if (cut) { const dd = Math.hypot(cut[0] - x, cut[1] - z); if (dd < bestD) { bestD = dd; best = cut; } continue; }
        const [px, pz, off] = nearest(ax, az, bx, bz, ahead[0], ahead[1]);
        // (Only what it is coming up to, not what it is passing beside: the point must be nearer the step's end than its start.)
        if (off < snap && Math.hypot(px - x, pz - z) > off + o.step * 0.5 && off < bestD) { bestD = off; best = [px, pz]; }
      }
    }
    return best;
  };
  /** The nearest point of a way other than the one a lane left that runs alongside it within `apart` of where it is stepping to, and how far off. */
  const crowding = (t: Tracker, x: number, z: number): [number, number, number] | null => {
    let best: [number, number, number] | null = null;
    for (const [i, w] of ways.entries()) {
      // (The way it left is let be only while it is leaving it: one that turns back along it, a few metres off, takes its frontage.)
      if (i === t.way || (i === t.parent && t.len < o.step * 2.5)) continue;
      for (let k = 0; k + 1 < w.points.length; k++) {
        const [ax, az] = w.points[k], [bx, bz] = w.points[k + 1], l = Math.hypot(bx - ax, bz - az) || 1, n = nearest(ax, az, bx, bz, x, z);
        if (n[2] < o.apart! && Math.abs(((bx - ax) * t.dx + (bz - az) * t.dz) / l) > 0.8 && (!best || n[2] < best[2])) best = n;
      }
    }
    return best;
  };
  for (let round = 0; trackers.length && round < 400; round++) {
    for (const t of trackers.slice()) {
      const way = ways[t.way];
      const stop = (end: GrownWay['end']) => { way.end = end; trackers.splice(trackers.indexOf(t), 1); };
      const nx = t.x + t.dx * o.step, nz = t.z + t.dz * o.step;
      const joint = meets(t, t.x, t.z, nx, nz);
      if (joint) { way.points.push(joint); junctions.push(joint); stop('join'); continue; }
      if (!land.open(nx, nz)) { stop('edge'); continue; }
      // (Alongside another way and too near it: away from it, or, nearer still, no further.)
      const crowd = o.apart ? crowding(t, nx, nz) : null;
      if (crowd && crowd[2] < o.apart! * 0.6) { stop('thin'); continue; }
      const d = land.density(nx, nz);
      if (t.kind === 'lane' && (d <= 0.04 || t.len >= o.longest)) {
        if (d > 0.04 || o.trail[1] <= 0) { stop('thin'); continue; }
        t.kind = 'trail'; way.lined = t.len; t.trail = t.len + lean.range(o.trail[0], o.trail[1]);
        if (t.len < o.step * 2) way.kind = 'trail';
      }
      way.points.push([nx, nz]);
      t.x = nx; t.z = nz; t.len += o.step; t.since += o.step;
      if (t.kind === 'trail' && t.len >= t.trail) { stop('farm'); continue; }
      // Turned by the lie of the land: of the four ways it offers (up, down, and along the slope either way), the one nearest the
      // way it is going, along the slope the more as it is steeper and up or down it the more as it is gentler.
      let sx = 0, sz = 0;
      const [gx, gz] = slope(nx, nz), g = Math.hypot(gx, gz);
      if (g > 1e-4) {
        const along = Math.min(1, g / 0.15), fall = 1 / (1 + (g / 0.1) ** 2);
        let bx = 0, bz = 0, bestDot = -Infinity;
        for (const [cx, cz, wgt] of [[-gz / g, gx / g, along], [gz / g, -gx / g, along], [gx / g, gz / g, fall], [-gx / g, -gz / g, fall]]) {
          const dot = cx * t.dx + cz * t.dz;
          if (dot > bestDot) { bestDot = dot; bx = cx * wgt; bz = cz * wgt; }
        }
        sx += bx * 0.5; sz += bz * 0.5;
      }
      // (Away from ground it cannot cross, looked for a little ahead on either hand.)
      const look = (a: number) => { const c = Math.cos(a), sn = Math.sin(a), lx = t.dx * c - t.dz * sn, lz = t.dx * sn + t.dz * c; return land.open(nx + lx * o.step * 2, nz + lz * o.step * 2); };
      const left = look(-0.6), right = look(0.6);
      if (left !== right) { const h = right ? 1 : -1; sx += -t.dz * h * 0.6; sz += t.dx * h * 0.6; }
      if (crowd) { const ax = nx - crowd[0], az = nz - crowd[1], l = Math.hypot(ax, az) || 1; sx += (ax / l) * 0.8; sz += (az / l) * 0.8; }
      // (And a little at random, as no one walks quite straight.)
      const wob = lean.range(-0.12, 0.12);
      sx += -t.dz * wob; sz += t.dx * wob;
      if (Math.abs(t.dx * sz - t.dz * sx) > o.rigid) {
        // (Never more than a third of a right angle at a step.)
        const want = Math.atan2(t.dz + sz, t.dx + sx), now = Math.atan2(t.dz, t.dx);
        let turn = want - now;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        while (turn < -Math.PI) turn += 2 * Math.PI;
        const a = now + Math.max(-0.52, Math.min(0.52, turn));
        t.dx = Math.cos(a); t.dz = Math.sin(a);
      }
      // A branch, where it has gone far enough without a junction: square to it on one hand, the other or both; it goes on itself
      // most of the time if it put out one, seldom if two.
      if (t.kind === 'lane' && t.since >= spacing(d) && !junctionNear(nx, nz, spacing(d) * 0.6)) {
        const r = lean.next(), hands = r < 1 / 3 ? [1] : r < 2 / 3 ? [-1] : [1, -1], before = ways.length;
        for (const h of hands) begin(t.way, nx, nz, -t.dz * h, t.dx * h);
        if (ways.length > before) {
          junctions.push([nx, nz]);
          t.since = 0;
          if (!lean.chance(ways.length - before === 1 ? 0.9 : 0.15)) { stop('thin'); continue; }
        }
      }
    }
  }
  for (const t of trackers) ways[t.way].end = 'thin';
  // Stubs that went nowhere are let go, unless something branches from them: a lane that stopped within a few steps of leaving its
  // way, without joining another, would have taken frontage from the houses along that way for none of its own. Corners are rounded.
  const branched = new Set(ways.map((w) => w.parent));
  return ways
    .filter((w, i) => w.kind === 'road' || branched.has(i) || measure(w.points).pop()! >= o.step * (w.end === 'join' ? 3 : 6))
    .map(({ points, kind, end, lined }) => ({ points: kind === 'road' ? points : soften(points), kind, end, lined }));
}

/**
 * Lines the ways with houses: along each, both sides, from its start to its end, the given roads first and then the lanes in the
 * order they grew. `deal` makes a house for a place as thickly settled as `density`; `place` is asked whether it may stand where it
 * has been put (and keeps it if so). Houses never come nearer a way's middle than its `clear`. Trails have no houses along them,
 * but a farmstead at their end.
 */
export function lineWays<T extends { w: number; d: number }>(
  ways: GrownWay[], given: GivenWay[], land: GrowLand, o: GrowOptions, rng: Rng,
  deal: (k: number, density: number, way: number) => T, place: (lot: Lot<T>) => boolean,
): Lot<T>[] {
  const lots: Lot<T>[] = [];
  let k = 0;
  const tryLot = (house: T, x: number, z: number, turn: number, way: number, farm: boolean): boolean => {
    if (o.houses !== undefined && lots.length >= o.houses) return false;
    for (const [i, w] of ways.entries()) {
      const m = i < given.length ? given[i].clear : o.laneClear;
      if (!clearOfWays([w], x, z, house.w, house.d, turn, m)) return false;
    }
    const lot: Lot<T> = { house, x, z, turn, way, farm };
    if (!place(lot)) return false;
    lots.push(lot);
    k++;
    return true;
  };
  for (const [i, w] of ways.entries()) {
    if (w.kind === 'trail') continue;
    const g = i < given.length ? given[i] : null;
    if (g && !g.span) continue;
    const lengths = measure(w.points), total = lengths[lengths.length - 1], q = rng.fork(`way${i}`);
    const setback = g ? g.setback : o.laneSetback;
    // (Not across the mouth of the junction it left from, nor the one it ends at.)
    // (A lane's houses begin clear of the way it left, as wide as that way keeps houses off its middle and a little more.)
    const mouth = given.reduce((m, gv) => Math.max(m, gv.clear), o.laneClear) + 1.2;
    const s0 = g ? g.span![0] : mouth, s1 = g ? Math.min(g.span![1], total) : Math.min(w.lined, total - (w.end === 'join' ? mouth : 0.5));
    for (const side of [-1, 1] as const) {
      for (let s = s0 + q.range(0, 2.5); s < s1;) {
        const [mx0, mz0] = along(w.points, lengths, s);
        const house = deal(k, land.density(mx0, mz0), i);
        if (s + house.w > s1) break;
        const [ax, az] = along(w.points, lengths, s), [bx, bz] = along(w.points, lengths, s + house.w);
        const cl = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / cl, uz = (bz - az) / cl;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -uz * side, nz = ux * side, d = land.density(mx, mz);
        let placed = false;
        const tight = !!g?.tight, wanted = tight ? d > 0.08 : q.next() < d * 1.6;
        if (wanted) {
          // (Set back a little more or less, and not quite square to the way: built one at a time.)
          const set = tight ? 0 : q.range(0, 1.4), skew = tight ? 0 : q.range(-0.07, 0.07);
          for (let step = 0; step < 4 && !placed; step++) {
            const off = setback + set + step + house.d / 2;
            placed = tryLot(house, mx + nx * off, mz + nz * off, Math.atan2(-nz, -nx) + skew, i, false);
          }
        }
        // (Next door: close by, or across a gap; closer where the place is thicker. Where a house was wanted and did not fit, a
        // little further on another is tried.)
        if (wanted && !placed) s += 2;
        else s += house.w + (tight ? 0.05 : q.chance(0.35 - 0.25 * d) ? q.range(3.5, 6) : q.range(0.4, 1.8));
      }
    }
  }
  // A farmstead at the end of each trail, facing back along it.
  for (const [i, w] of ways.entries()) {
    if (w.end !== 'farm' || w.points.length < 2) continue;
    const [ex, ez] = w.points[w.points.length - 1], [px, pz] = w.points[w.points.length - 2], l = Math.hypot(ex - px, ez - pz) || 1, dx = (ex - px) / l, dz = (ez - pz) / l;
    const house = deal(k, 0.2, i);
    for (const off of [1.5, 3, 4.5]) if (tryLot(house, ex + dx * (off + house.d / 2), ez + dz * (off + house.d / 2), Math.atan2(-dz, -dx), i, true)) break;
  }
  return lots;
}

/** A way cut where houses stop lining it: the part that is a lane (or road), and the part that went on as a trail (either may be empty). */
export function splitWay(w: GrownWay): { lane: Pt[]; trail: Pt[] } {
  if (w.kind === 'trail') return { lane: [], trail: w.points };
  const lengths = measure(w.points), total = lengths[lengths.length - 1];
  if (w.lined >= total) return { lane: w.points, trail: [] };
  const lane: Pt[] = [], trail: Pt[] = [];
  for (let k = 0; k < w.points.length; k++) (lengths[k] <= w.lined ? lane : trail).push(w.points[k]);
  const [x, z] = along(w.points, lengths, w.lined), cut: Pt = [x, z];
  lane.push(cut); trail.unshift(cut);
  return { lane: lane.length > 1 ? lane : [], trail: trail.length > 1 ? trail : [] };
}
