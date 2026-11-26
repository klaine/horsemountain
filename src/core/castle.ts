import { Rng } from './rng';
import { Place, Site, Tower } from './site';
import { insideOf } from './valley';

/**
 * A castle at a valley's head, about the house, which is its hall and keep. (Asked for: a castle with walls, two to four towers, a
 * gate, a keep, a chapel and a dungeon, on high ground, with a village grown about its foot; and then, of the first one, that it was
 * an unnatural perfect rectangle with heavy towers all alike, standing apart from its village.) Laid out as castles on a hill are,
 * Gruyères, Corfe, Beynac or Kaysersberg: its wall follows the brow of the hill it stands on, in straight lengths from corner to
 * corner, round the house and the ground before it; towers of several kinds at some of its corners, smaller than a keep and none
 * alike; its gate where the road comes up, in a tower of its own; and its keep, taller and slenderer than any, at the back of the
 * bailey, the last place to hold.
 */
export interface Castle {
  /** The wall's corners, in order round the bailey. */
  wall: [number, number][];
  /** From the ground to the wall-walk, and through. */
  height: number;
  thick: number;
  /** The gate: where it stands in the wall, which way it faces out (a bearing from greater x towards greater z), how broad its way. */
  gate: { x: number; z: number; out: number; w: number };
  /** The wall's towers, at its corners; the keep is in `Site.towers`, marked `castle`, and can be gone into and climbed. */
  towers: CastleTower[];
  /** How far the castle's ground stands over the land about its foot: the hill it is on. */
  rise: number;
  /**
   * What stands in the bailey (asked: the bailey was bare, and the castle looked artificial): ranges of lean-to buildings against the
   * inner face of the curtain, each from `a` to `b` along that face and `depth` into the bailey, its front wall `height` high, as
   * stables, stores and a smithy were built; a stair of stone up the inner face to the wall-walk, rising from `a` on the bailey's
   * floor to `b` at the walk, `width` broad; and a well.
   */
  ranges?: { a: [number, number]; b: [number, number]; depth: number; height: number; kind: 'stable' | 'store' | 'smithy' }[];
  stair?: { a: [number, number]; b: [number, number]; width: number };
  well?: [number, number];
}

export interface CastleTower {
  x: number;
  z: number;
  /**
   * Round; half round, standing out from the wall with its back flat to the bailey; square and small; or a turret, a small round one
   * corbelled out from the corner at the height of the wall-walk, not standing on the ground (the game deals none: a corner given one
   * in the building lab).
   */
  kind: 'round' | 'half' | 'square' | 'turret';
  /** Its radius, or half its breadth. */
  r: number;
  /** How far it stands over the wall-walk. */
  over: number;
  /** A pointed roof of tiles, or a battlement. */
  roof: 'cone' | 'battlement';
  /** Which way it faces out of the bailey. */
  out: number;
}

/** Whether a tower stands on the ground, and so breaks the wall and the bailey at its corner: all but a turret, which is corbelled out at the top. */
export const grounded = (t: CastleTower): boolean => t.kind !== 'turret';

/**
 * Which way is into the bailey from the length of the wall that runs from corner `i` to the next: a step of one metre square to it.
 * (Found from which way round the wall runs, so that it holds for a wall bent in on itself, as one laid out by hand may be. It was
 * found as the way towards the middle of the corners, which is right only where the middle is on the bailey's side of every length,
 * as it is about the ovals a castle is dealt.)
 */
export function inwardOf(wall: [number, number][], i: number): [number, number] {
  let area = 0;
  for (let k = 0, j = wall.length - 1; k < wall.length; j = k++) area += wall[j][0] * wall[k][1] - wall[k][0] * wall[j][1];
  const [ax, az] = wall[i], [bx, bz] = wall[(i + 1) % wall.length], len = Math.hypot(bx - ax, bz - az) || 1, dx = (bx - ax) / len, dz = (bz - az) / len;
  // (Going round with the bailey on the left, as x runs right and z up: the left of the way along is (-dz, dx).)
  return area > 0 ? [-dz, dx] : [dz, -dx];
}

/** How far a point is outside the castle's wall line (negative within it). */
export function castleOff(c: Pick<Castle, 'wall'>, x: number, z: number): number {
  const w = c.wall;
  let inside = false, best = Infinity;
  for (let i = 0, j = w.length - 1; i < w.length; j = i++) {
    const [ax, az] = w[j], [bx, bz] = w[i];
    if ((bz > z) !== (az > z) && x < ((ax - bx) * (z - bz)) / (az - bz || 1e-9) + bx) inside = !inside;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    best = Math.min(best, Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t));
  }
  return inside ? -best : best;
}

/**
 * Lays the castle out about the house (its rooms, `house`) and the meadow before its door, within the valley. Its wall is an oval
 * of eight to eleven straight lengths, a little uneven, some ten metres off the house on either hand and behind and some paces beyond
 * the meadow; the gate where a line from the door down the valley meets it; towers at three or four of the other corners, the
 * sharpest turns first; the keep at the back. Returns the gate, for the road to start from.
 */
export function layOutCastle(site: Site, meadow: Place, house: { x0: number; x1: number; z0: number }, doorX: number, rng: Rng, room?: (x: number, z: number) => number): Castle {
  // (`room`: how far inside the place a point is, where it is not a valley's: on an island, how far inland from the cliffs.)
  const round = (x: number) => Math.round(x * 10) / 10, within = room ?? ((x: number, z: number) => insideOf(site.valley!, x, z));
  const hx0 = Math.min(house.x0, meadow.x0), hx1 = Math.max(house.x1, meadow.x1), hz0 = house.z0, hz1 = meadow.z1;
  const cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2;
  const fromHouse = (x: number, z: number) => Math.hypot(Math.max(hx0 - x, 0, x - hx1), Math.max(hz0 - z, 0, z - hz1));
  const n = rng.int(8, 11), phase = rng.range(0, (Math.PI * 2) / n);
  const jitter = Array.from({ length: n }, () => [rng.range(-0.2, 0.2), rng.range(-0.08, 0.16)]);
  // (Larger than it was, nine to twelve metres off the house, with walls seven or eight metres high: asked, the roofs of the village
  // below nearly reached the top of its wall. A castle's bailey holds its stables, stores and yards besides its hall, and its curtain
  // stands ten metres and more over the ground outside, its towers higher again and its keep over all.)
  let margin = rng.range(12, 15);
  let wall: [number, number][] = [];
  for (let attempt = 0; attempt < 10; attempt++, margin *= 0.88) {
    const ax = (hx1 - hx0) / 2 + margin, az = (hz1 - hz0) / 2 + margin * 0.85;
    wall = [];
    for (let k = 0; k < n; k++) {
      const a = phase + ((k + jitter[k][0]) / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      // On an oval about the house, each corner a little in or out of it; and never nearer the house than seven metres.
      let r = (1 / Math.hypot(c / ax, s / az)) * (1 + jitter[k][1]);
      while (fromHouse(cx + c * r, cz + s * r) < 7) r += 0.5;
      // (Further out behind the house, where the keep stands between it and the wall.)
      if (cz + s * r < hz0 + 2) r += 7;
      wall.push([round(cx + c * r), round(cz + s * r)]);
    }
    // (Within the valley, with room to walk round it.)
    if (wall.every(([x, z]) => within(x, z) > 7)) break;
  }
  // The gate: where a line from the door straight down the valley crosses the wall.
  let gate = { x: doorX, z: hz1 + 6, out: Math.PI / 2, w: 3.4 }, edge = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = wall[i], [bx, bz] = wall[(i + 1) % n];
    if ((ax - doorX) * (bx - doorX) > 0 || Math.max(az, bz) < hz1) continue;
    const t = (doorX - ax) / (bx - ax || 1e-9), z = az + (bz - az) * t;
    if (z < hz1) continue;
    // (Not hard by a corner: kept four metres from either end of its length.)
    const len = Math.hypot(bx - ax, bz - az), u = Math.min(len - 4, Math.max(4, t * len)) / len;
    const nx = bz - az, nz = -(bx - ax), out = Math.atan2(nz, nx);
    // (Outward is away from the bailey's middle.)
    const outward = Math.cos(out) * (cx - (ax + bx) / 2) + Math.sin(out) * (cz - (az + bz) / 2) < 0 ? out : out + Math.PI;
    gate = { x: round(ax + (bx - ax) * u), z: round(az + (bz - az) * u), out: Math.round(outward * 1000) / 1000, w: 3.4 };
    edge = i;
    break;
  }
  // Towers at the corners: the sharpest turns first, none by the gate, three or four of them, no two alike in kind and size.
  const turnAt = (k: number) => {
    const [px, pz] = wall[(k + n - 1) % n], [x, z] = wall[k], [qx, qz] = wall[(k + 1) % n];
    const a = Math.atan2(z - pz, x - px), b = Math.atan2(qz - z, qx - x);
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  };
  const corners = wall.map((_, k) => k).filter((k) => Math.hypot(wall[k][0] - gate.x, wall[k][1] - gate.z) > 9).sort((a, b) => turnAt(b) - turnAt(a) + rng.range(-0.15, 0.15));
  const want = rng.int(3, 4), kinds: CastleTower['kind'][] = ['round', 'half', 'square', 'round'];
  const towers: CastleTower[] = [];
  for (const k of corners) {
    if (towers.length >= want) break;
    if (towers.some((t) => Math.hypot(t.x - wall[k][0], t.z - wall[k][1]) < 14)) continue;
    const kind = kinds[(towers.length + rng.int(0, 3)) % 4];
    const [x, z] = wall[k];
    towers.push({
      x, z, kind, r: round(kind === 'square' ? rng.range(3.0, 3.8) : rng.range(3.3, 4.4)), over: round(rng.range(4.5, 9)),
      roof: kind === 'square' ? (rng.chance(0.5) ? 'cone' : 'battlement') : rng.chance(0.6) ? 'cone' : 'battlement',
      out: Math.round(Math.atan2(z - cz, x - cx) * 1000) / 1000,
    });
  }
  void edge;
  // The keep: tall and slender, at the back of the bailey, where the wall is furthest from the gate, on the bailey's side of it and
  // clear of the house. Its door faces the bailey's middle. (A tower that can be gone into and climbed, as the old lone tower could.)
  const back = wall.map((p, k) => ({ p, k })).sort((a, b) => Math.hypot(b.p[0] - gate.x, b.p[1] - gate.z) - Math.hypot(a.p[0] - gate.x, a.p[1] - gate.z));
  // (Eight or nine storeys, some twenty-five metres: it should stand over everything else, its towers too, as a keep does over its castle.)
  const half = round(rng.range(3.2, 3.7)), storeys = rng.int(8, 9);
  for (const { p } of back) {
    const dx = cx - p[0], dz = cz - p[1], l = Math.hypot(dx, dz) || 1, inset = half + 0.9 + 1.0 + 0.6;
    const kx = round(p[0] + (dx / l) * inset), kz = round(p[1] + (dz / l) * inset);
    if (fromHouse(kx, kz) < half + 0.9 + 0.9 || towers.some((t) => Math.hypot(t.x - kx, t.z - kz) < t.r + half + 2.5)) continue;
    site.towers = [...(site.towers ?? []).filter((t) => !t.castle), { x: kx, z: kz, half, storeys, door: kx < cx ? 'e' : 'w', castle: true }];
    break;
  }
  const castle: Castle = { wall, height: round(rng.range(10, 12.5)), thick: 2.4, gate, towers, rise: round(rng.range(7, 10)) };
  layOutBailey(castle, site, { x0: hx0, x1: hx1, z0: hz0, z1: hz1 }, doorX, meadow.z0, rng.fork('bailey'));
  return castle;
}

/**
 * What stands in the bailey: the stair up to the wall-walk on the inner face of one length of the curtain, ranges against two or three
 * others, and a well. Each kept clear of the house and its forecourt (`house`), the keep, the towers, the gate and the way from the
 * door to it.
 */
function layOutBailey(c: Castle, site: Site, house: { x0: number; x1: number; z0: number; z1: number }, doorX: number, doorZ: number, rng: Rng): void {
  /** A list in an order drawn from `rng`. */
  const shuffled = <V>(list: V[]): V[] => { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = rng.int(0, i); [out[i], out[j]] = [out[j], out[i]]; } return out; };
  const round = (x: number) => Math.round(x * 10) / 10, n = c.wall.length, T = c.thick;
  const cx = c.wall.reduce((s, p) => s + p[0], 0) / n, cz = c.wall.reduce((s, p) => s + p[1], 0) / n;
  const keep = (site.towers ?? []).find((t) => t.castle), g = c.gate;
  const seg = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1, t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    return Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t);
  };
  const taken: [number, number][][] = [];
  const inRing = (ring: [number, number][], x: number, z: number) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) if ((ring[i][1] > z) !== (ring[j][1] > z) && x < ((ring[j][0] - ring[i][0]) * (z - ring[i][1])) / (ring[j][1] - ring[i][1] || 1e-9) + ring[i][0]) inside = !inside;
    return inside;
  };
  const clear = (x: number, z: number, m: number) =>
    Math.max(house.x0 - x, x - house.x1, house.z0 - z, z - house.z1) > m && (!keep || Math.max(Math.abs(x - keep.x), Math.abs(z - keep.z)) > keep.half + 0.9 + m)
    && c.towers.every((t) => !grounded(t) || Math.hypot(t.x - x, t.z - z) > t.r + m) && seg(x, z, doorX, doorZ, g.x, g.z) > 2.6 + m && Math.hypot(x - g.x, z - g.z) > 6 + m
    && !taken.some((q) => inRing(q, x, z));
  // Each length of the curtain, its inner face, and how much of it is free between the towers at its ends.
  const lengths = c.wall.map((a, i) => {
    const b = c.wall[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    const [ix, iz] = inwardOf(c.wall, i);
    const tA = c.towers.find((t) => grounded(t) && Math.hypot(t.x - a[0], t.z - a[1]) < 0.5), tB = c.towers.find((t) => grounded(t) && Math.hypot(t.x - b[0], t.z - b[1]) < 0.5);
    const at = (u: number, inward: number): [number, number] => [a[0] + dx * u + ix * (T / 2 + inward), a[1] + dz * u + iz * (T / 2 + inward)];
    return { i, len, at, u0: (tA ? tA.r : 0) + 1.6, u1: len - (tB ? tB.r : 0) - 1.6 };
  });
  /** Whether an oblong along a length's inner face, from `u0` to `u1` and `deep` into the bailey, is clear. */
  const free = (l: (typeof lengths)[number], u0: number, u1: number, deep: number, m: number) => {
    for (let u = u0; u <= u1 + 0.01; u += Math.max(0.5, (u1 - u0) / Math.ceil((u1 - u0) / 1.5))) for (const d of [0.2, deep / 2, deep]) { const [x, z] = l.at(u, d); if (!clear(x, z, m)) return false; }
    return true;
  };
  // The stair: straight up the inner face, a step of twenty-two centimetres for each twenty-six along, to the walk.
  {
    const run = round((c.height / 0.22) * 0.26), width = 1.3;
    for (const l of shuffled(lengths)) {
      if (l.u1 - l.u0 < run + 1) continue;
      const u0 = l.u0 + rng.range(0, l.u1 - l.u0 - run), u1 = u0 + run;
      if (!free(l, u0 - 0.5, u1 + 0.5, width + 1.5, 0.3)) continue;
      const head = rng.chance(0.5);
      c.stair = { a: l.at(head ? u0 : u1, 0).map(round) as [number, number], b: l.at(head ? u1 : u0, 0).map(round) as [number, number], width };
      taken.push([l.at(u0 - 0.5, 0), l.at(u1 + 0.5, 0), l.at(u1 + 0.5, width + 1.5), l.at(u0 - 0.5, width + 1.5)]);
      break;
    }
  }
  // The ranges: two or three, seven to fourteen metres long and four to five and a half deep.
  const ranges: NonNullable<Castle['ranges']> = [], kinds: ('stable' | 'store' | 'smithy')[] = ['stable', 'store', 'smithy'];
  for (const l of shuffled(lengths)) {
    if (ranges.length >= 3) break;
    const long = Math.min(l.u1 - l.u0, rng.range(7, 14)), deep = round(rng.range(4, 5.5));
    if (long < 6) continue;
    const u0 = l.u0 + rng.range(0, l.u1 - l.u0 - long), u1 = u0 + long;
    if (!free(l, u0, u1, deep, 0.6)) continue;
    ranges.push({ a: l.at(u0, 0).map(round) as [number, number], b: l.at(u1, 0).map(round) as [number, number], depth: deep, height: round(rng.range(2.6, 3.3)), kind: kinds[ranges.length] });
    taken.push([l.at(u0, -0.2), l.at(u1, -0.2), l.at(u1, deep + 0.6), l.at(u0, deep + 0.6)]);
  }
  if (ranges.length) c.ranges = ranges;
  // The well: in the open bailey, clear of everything by a few strides.
  for (let tries = 0; tries < 60; tries++) {
    const x = cx + rng.range(-1, 1) * 30, z = cz + rng.range(-1, 1) * 30;
    if (castleOff(c, x, z) > -(T / 2 + 3.5) || !clear(x, z, 2.8)) continue;
    c.well = [round(x), round(z)];
    break;
  }
}

/**
 * A castle's wall as it is edited by hand (asked: that the line which gives the castle's walls their shape be editable, its corners
 * moved, added and taken away, and what stands at each, a tower or none, chosen): its corners in order round the bailey, each with the
 * tower at it, if any; its gate as a place along one of its lengths (`i`, the length from corner `i` to the next, and `t`, how far along
 * it, as a share of it), so that the gate goes with its length as the corners move; and the wall's height and thickness. The building
 * lab edits one (`lab/buildings.ts`); the game deals its castles and never edits them.
 */
export interface CastlePlan {
  corners: { x: number; z: number; tower?: Pick<CastleTower, 'kind' | 'r' | 'over' | 'roof'> }[];
  gate: { i: number; t: number };
  height: number;
  thick: number;
}

/** A castle as a plan: each tower given to the corner it stands at (one standing at none is left out). */
export function planOf(c: Castle): CastlePlan {
  const corners = c.wall.map(([x, z]) => {
    const t = c.towers.find((q) => Math.hypot(q.x - x, q.z - z) < 0.5);
    return { x, z, ...(t ? { tower: { kind: t.kind, r: t.r, over: t.over, roof: t.roof } } : {}) };
  });
  const { i, t } = nearestOnWall(c.wall, c.gate.x, c.gate.z);
  return { corners, gate: { i, t }, height: c.height, thick: c.thick };
}

/** The point of the wall's line nearest (x, z): on the length from corner `i` to the next, `t` of the way along it; `d` from it. */
export function nearestOnWall(wall: [number, number][], x: number, z: number): { i: number; t: number; d: number } {
  let best = { i: 0, t: 0.5, d: Infinity };
  for (let i = 0; i < wall.length; i++) {
    const [ax, az] = wall[i], [bx, bz] = wall[(i + 1) % wall.length], l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2)), d = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t);
    if (d < best.d) best = { i, t, d };
  }
  return best;
}

/**
 * Whether a wall can be built: three corners or more, no length shorter than two metres, no corner so sharp that its two lengths fold
 * back over each other (less than twenty degrees between them), and no two lengths crossing.
 */
export function soundWall(wall: [number, number][]): boolean {
  const n = wall.length;
  if (n < 3) return false;
  const P = (k: number) => wall[((k % n) + n) % n];
  for (let k = 0; k < n; k++) {
    const [ax, az] = P(k), [bx, bz] = P(k + 1), [px, pz] = P(k - 1);
    if (Math.hypot(bx - ax, bz - az) < 2) return false;
    const a = Math.atan2(pz - az, px - ax), b = Math.atan2(bz - az, bx - ax), between = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
    if (between < (20 * Math.PI) / 180) return false;
  }
  // (Two lengths cross where each one's ends lie on either side of the other's line.)
  const side = (p: [number, number], q: [number, number], r: [number, number]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = P(i), b = P(i + 1), c = P(j), d = P(j + 1);
    if (side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0) return false;
  }
  return true;
}

/**
 * The castle a plan makes: its wall through the corners; each tower at its corner, facing out between the two lengths that meet there;
 * the gate on its length, kept four metres from either end where the length is long enough, facing out; the gate's breadth and the
 * hill's rise as `was` has them; and its bailey laid out again about the new wall (stair, ranges and well) from `rng`, which is given
 * the same from edit to edit so that they stay where they are while they still fit.
 */
export function castleOfPlan(p: CastlePlan, was: Castle, rng: Rng, about?: { keep?: Tower; house?: { x0: number; x1: number; z0: number; z1: number }; door?: [number, number] }): Castle {
  const wall = p.corners.map((k): [number, number] => [k.x, k.z]), n = wall.length, r3 = (v: number) => Math.round(v * 1000) / 1000;
  const outAt = (k: number) => {
    const [ax, az] = inwardOf(wall, (k + n - 1) % n), [bx, bz] = inwardOf(wall, k), ox = -(ax + bx), oz = -(az + bz);
    return Math.hypot(ox, oz) < 1e-6 ? r3(Math.atan2(-bz, -bx)) : r3(Math.atan2(oz, ox));
  };
  const towers: CastleTower[] = [];
  p.corners.forEach((k, i) => { if (k.tower) towers.push({ x: k.x, z: k.z, ...k.tower, out: outAt(i) }); });
  const gi = ((p.gate.i % n) + n) % n, [ax, az] = wall[gi], [bx, bz] = wall[(gi + 1) % n], len = Math.hypot(bx - ax, bz - az);
  const u = Math.min(Math.max(len - 4, len / 2), Math.max(Math.min(4, len / 2), p.gate.t * len)) / len, [ix, iz] = inwardOf(wall, gi);
  const gate = { x: Math.round((ax + (bx - ax) * u) * 100) / 100, z: Math.round((az + (bz - az) * u) * 100) / 100, out: r3(Math.atan2(-iz, -ix)), w: was.gate.w };
  const c: Castle = { wall, height: p.height, thick: p.thick, gate, towers, rise: was.rise };
  // (No house stands in a bailey laid out by hand: the middle of its corners is kept a little clear, and a way from there to the gate.
  // A city's citadel says what does stand in it, its keep and its great building, and where that building's door is: `about`.)
  const mx = wall.reduce((s, q) => s + q[0], 0) / n, mz = wall.reduce((s, q) => s + q[1], 0) / n;
  const [dx, dz] = about?.door ?? [mx, mz];
  layOutBailey(c, { towers: about?.keep ? [about.keep] : [] } as unknown as Site, about?.house ?? { x0: mx, x1: mx, z0: mz, z1: mz }, dx, dz, rng);
  return c;
}
