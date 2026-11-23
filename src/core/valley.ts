import { fbm2, Rng } from './rng';
import { highlands, uplandHeight, valleyFrame, ValleySpot } from './highlands';
import { Place, Valley } from './site';
import { landAt, worldLand } from './worldLand';

/**
 * The shape of the valley. It is not a box, and the house is not its end. The house is built into
 * the end of a ridge that comes down into the valley from the north; on either side of the ridge,
 * or on one, the valley runs on past the house as an arm, to close at a head of its own.
 * Southward from the house it opens out, bends, widens into bays and draws in between spurs, and
 * at its foot closes to a gap between two crags, where the track goes out and the country beyond
 * begins. Its two sides are recorded as where each lies at every second metre down its length.
 */

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** Where one side of the valley lies at `z`: the line the rock rises from. Beyond the ends of what is recorded it runs straight on. */
export function edgeAt(v: Valley, side: 'w' | 'e', z: number): number {
  const line = side === 'w' ? v.west : v.east, at = Math.min(line.length - 1, Math.max(0, (z - v.z0) / v.step)), i = Math.min(line.length - 2, Math.floor(at));
  return line[i] + (line[i + 1] - line[i]) * (at - i);
}

/** How much the side bears in or out as one goes down the valley: metres across for each metre along. */
export function slantAt(v: Valley, side: 'w' | 'e', z: number): number {
  return (edgeAt(v, side, z + v.step) - edgeAt(v, side, z - v.step)) / (2 * v.step);
}

/**
 * How far a point is from the nearer side of the valley: more than nothing between the two
 * sides, less outside them. The country beyond the gap counts as between them, since the sides
 * run on out there; whether a point can be walked to is another question: see `walkable`.
 */
export function insideOf(v: Valley, x: number, z: number): number {
  let best = Infinity;
  // (The ridge the house stands on is not valley: a point is as far inside as it is from the ridge's sides, if that is nearer.)
  const r = v.ridge, onRidge = !!r && z < r.z && x > r.x0 && x < r.x1;
  if (r) for (const rx of [r.x0, r.x1]) best = Math.min(best, Math.hypot(x - rx, Math.max(0, z - r.z)));
  const n = v.west.length, i0 = Math.max(0, Math.floor((z - v.z0) / v.step) - 40), i1 = Math.min(n - 2, i0 + 80);
  for (const line of [v.west, v.east]) {
    for (let i = i0; i <= i1; i++) {
      const az = v.z0 + i * v.step, ax = line[i], bx = line[i + 1] - ax, t = Math.min(1, Math.max(0, ((x - ax) * bx + (z - az) * v.step) / (bx * bx + v.step * v.step)));
      best = Math.min(best, Math.hypot(x - ax - bx * t, z - az - v.step * t));
    }
    // (Beyond either end each side runs straight on.)
    if (z < v.z0) best = Math.min(best, Math.abs(x - line[0]));
    if (z > v.z0 + (n - 1) * v.step) best = Math.min(best, Math.abs(x - line[n - 1]));
  }
  return x > edgeAt(v, 'w', z) && x < edgeAt(v, 'e', z) && !onRidge ? best : -best;
}

/** Whether a point is ground that can be walked on with `margin` metres to spare: between the sides, and not beyond the gap. */
export function walkable(v: Valley, x: number, z: number, margin: number): boolean {
  return z < v.mouth - margin * 0.5 && z > v.z0 && insideOf(v, x, z) > margin;
}

/**
 * Shapes a valley below a house whose forecourt is `meadow`. Returns it and the line down its
 * middle, which is where a track would go if nothing turned it aside.
 */
/** How high a found valley's land stands over its floor, as a share of the upland's own height. */
const RELIEF = 0.3;

/** The height of the land a valley was found in, at a point of the site, relative to the meadow's floor `floor`. */
export function valleyLand(v: Valley, floor: number, meadow: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number, out = 0): number {
  const t = v.terrain!, [u, w] = valleyFrame(t, (meadow.x0 + meadow.x1) / 2, (meadow.z0 + meadow.z1) / 2, x, z);
  // (A world's land is at its own height: its glens were found at it, and the rest of the world must meet them.)
  if (t.world) return landAt(worldLand(t.world), u, w) - t.base + floor;
  // (At under a third of its height over the valley: the upland's shape is the shape of a valley country, but at its own height
  // the hills stood two hundred metres sheer over the floor, a gorge, where the valley is to be a wooded one under crags.)
  return (uplandHeight(highlands(t.seed), u, w, out) - t.base) * RELIEF + floor;
}

export function shapeValley(meadow: Place, rng: Rng, house: { x0: number; x1: number; z0?: number } = meadow, free = false, found?: { seed: number; spot: ValleySpot; world?: string }, extra = 0, seated = false): { valley: Valley; middle: (z: number) => number } {
  const round = (x: number) => Math.round(x * 10) / 10;
  // (A valley that was found: the line down its middle is its stream's, turned into the site's frame, and its breadth on either
  // hand is where the land has risen four metres over the stream. Both read once, at every second metre down its length.)
  const terrain = found ? { seed: found.seed, u: found.spot.u, v: found.spot.v, turn: found.spot.turn, base: Math.round(found.spot.base * 100) / 100, ...(found.world ? { world: found.world } : {}) } : undefined;
  const mx = (meadow.x0 + meadow.x1) / 2, mz = (meadow.z0 + meadow.z1) / 2;
  let courseX: number[] = [], courseZ: number[] = [];
  if (found) {
    const c = Math.cos(found.spot.turn), sn = Math.sin(found.spot.turn);
    for (const [u, w] of found.spot.course) { const du = u - found.spot.u, dw = w - found.spot.v; courseX.push(mx + c * du + sn * dw); courseZ.push(mz - sn * du + c * dw); }
    // (Kept going south: a point that would turn back up the valley is dropped.)
    const keep = courseZ.map((z, k) => k === 0 || z > Math.max(...courseZ.slice(0, k)));
    courseX = courseX.filter((_, k) => keep[k]); courseZ = courseZ.filter((_, k) => keep[k]);
  }
  const courseAt = (z: number) => {
    if (z <= courseZ[0]) return courseX[0];
    for (let k = 1; k < courseZ.length; k++) if (z <= courseZ[k]) return courseX[k - 1] + ((courseX[k] - courseX[k - 1]) * (z - courseZ[k - 1])) / (courseZ[k] - courseZ[k - 1] || 1);
    return courseX[courseX.length - 1];
  };
  const landAtV = (x: number, z: number) => valleyLand({ z0: 0, step: 2, west: [], east: [], mouth: 0, terrain }, meadow.floor, meadow, x, z);
  const landHalf = (z: number, k: number): number => {
    const c = courseAt(z), floor = landAtV(c, z), dir = k === 0 ? -1 : 1;
    // (Out to where it has risen seven metres: at four, as it was, the play area was a corridor; with a castle at its head, a village
    // below that, fields, and a forest at its foot, a valley wants the breadth of its floor and the lower slopes of its sides.)
    for (let r = 4; r <= 95; r += 1) if (landAtV(c + dir * r, z) > floor + 7) return r;
    return 95;
  };
  // (`front` is the house front, where the meadow begins; the valley's own record begins further north if it has arms.)
  // (Long enough for a castle, a village, fields and a forest one below another: some two hundred metres from the house front.)
  // (And longer by `extra` where the castle stands on the high ground beside the valley, for the way down to its floor: `findSeat`.)
  const step = 2, front = meadow.z0, length = meadow.z1 - meadow.z0 + rng.range(185, 235) + extra, mouth = Math.round((front + length) / step) * step;
  const mid = (meadow.x0 + meadow.x1) / 2, head = (meadow.x1 - meadow.x0) / 2 + rng.range(5.5, 10);
  const s = rng.range(0, 500), gate = rng.range(7.4, 9.2);
  // It bends: once or twice in its length, and less the nearer the house, which it must stay square to.
  const swing = rng.range(0, 15) * (rng.chance(0.5) ? 1 : -1), wave = rng.range(70, 140), phase = rng.range(0, Math.PI * 2);
  const drawn = (z: number) => mid + (swing * (Math.sin(((z - front) / wave) * Math.PI * 2 + phase) - Math.sin(phase)) + (fbm2(z / 46, s, 2) - 0.5) * 12) * smooth((z - meadow.z1 + 4) / 30);
  const middle = found ? (z: number) => mid + (courseAt(z) - mid) * smooth((z - meadow.z1 + 4) / 30) : drawn;
  // (Its breadth on either hand as the land has it, at every second metre, evened over a dozen metres so that it does not jink.)
  const breadth: number[][] = [[], []];
  if (found) for (const k of [0, 1]) {
    const raw: number[] = [];
    for (let z = front; z <= mouth + 2; z += step) raw.push(landHalf(z, k));
    // (Below a castle on the high ground beside the valley, evened over thirty-odd metres: across a hillside the land rises seven metres
    // now near and now far, and the side jumped in and out by tens of metres from one stride to the next.)
    const even = seated ? 8 : 3;
    for (let i = 0; i < raw.length; i++) { let sum = 0, n = 0; for (let j = i - even; j <= i + even; j++) if (j >= 0 && j < raw.length) { sum += raw[j]; n++; } breadth[k].push(sum / n); }
  }
  // Each side has its own breadth, a bay somewhere (more often than not), and its own unevenness.
  const sides = (['w', 'e'] as const).map((_, k) => ({
    full: rng.range(42, 72), open: rng.range(14, 30), close: rng.range(15, 24),
    bay: rng.chance(0.65) ? { at: front + length * rng.range(0.3, 0.8), deep: rng.range(8, 18), long: rng.range(8, 16) } : null,
    seed: s + 40 + k * 91,
  }));
  // And somewhere in the lower half, as often as not, it draws in between two spurs.
  const narrows = rng.chance(0.5) ? { at: front + length * rng.range(0.5, 0.78), by: rng.range(0.3, 0.5), long: rng.range(7, 11) } : null;
  // The ridge the house is built into (ending a little behind the face of the house front): as broad as the head of the valley, or as the house with eight metres to spare either side, whichever is broader.
  const ridge = { x0: round(Math.min(mid - head, house.x0 - 8)), x1: round(Math.max(mid + head, house.x1 + 8)), z: front - 0.5 };
  const edge = [mid - ridge.x0, ridge.x1 - mid];
  // The arms past the house, from a stream of their own: on one side, on both, or now and then on neither.
  const arming = rng.fork('arms'), count = arming.pick([0, 1, 1, 1, 2, 2]), first = arming.chance(0.5) ? 0 : 1;
  const arms = [0, 1].map((k) => (count === 2 || (count === 1 && k === first) ? { length: arming.range(36, 72), width: arming.range(16, 28), seed: arming.range(0, 500) } : null));
  // A house that stands free has the valley all round it: on either side a breadth of open ground, and behind it a bowl that closes some way back.
  // (Broad enough on either hand and behind for the castle's curtain wall, its towers and a walk round outside it.)
  const round_ = free && house.z0 !== undefined ? { gap: [arming.range(32, 42), arming.range(32, 42)], back: house.z0 - arming.range(30, 42), seed: arming.range(0, 500) } : null;
  const z0 = round_ ? Math.floor((round_.back - 26) / step) * step : front - Math.ceil(Math.max(0, ...arms.map((q) => (q ? q.length + 4 : 0))) / step) * step;
  const roundAt = (k: number, z: number): number => {
    const base = (k === 0 ? mid - house.x0 : house.x1 - mid) + round_!.gap[k] * (1 + 0.3 * (fbm2(z / 15, round_!.seed + k * 17, 2) - 0.5));
    // (Beside the house it keeps its breadth; behind it, it closes over the last twenty-odd metres, round as the head of a combe.)
    const t = Math.min(1, Math.max(0, (z - z0) / (round_!.back - z0)));
    return base * Math.sqrt(t * (2 - t));
  };
  // How far out from the ridge an arm's side lies at a place along it: nothing at its head, its full breadth by the house front.
  const armAt = (k: number, z: number): number => {
    const q = arms[k];
    if (!q) return 0;
    const t = (z - (front - q.length)) / q.length;
    return t <= 0 ? 0 : q.width * smooth(t / 0.55) * (1 + 0.35 * (fbm2(z / 13, q.seed, 2) - 0.5));
  };
  const half = (side: (typeof sides)[number], z: number, k: number): number => {
    if (z < front) return round_ ? Math.max(0.5, roundAt(k, z)) : edge[k] + armAt(k, z);
    // (Beyond the gap the country opens out again, unevenly, into a broader vale.)
    if (z >= mouth) return gate + Math.min(64, Math.max(0, z - mouth - 3) * 1.25) * (0.75 + 0.6 * fbm2(z / 17, side.seed + 3, 2));
    let w = side.full * (1 + 0.5 * (fbm2(z / 40, side.seed, 2) - 0.5)) + (fbm2(z / 11, side.seed + 7, 2) - 0.5) * 5;
    if (side.bay) w += side.bay.deep * Math.exp(-(((z - side.bay.at) / side.bay.long) ** 2));
    if (narrows) w *= 1 - narrows.by * Math.exp(-(((z - narrows.at) / narrows.long) ** 2));
    // (A valley that was found is as broad as the land has it, not less than twenty-two metres to a side nor more than eighty-five.)
    if (found) w = Math.min(85, Math.max(seated ? 34 : 22, breadth[k][Math.min(breadth[k].length - 1, Math.max(0, Math.round((z - front) / step)))]));
    // From the corner of the ridge it opens out, or on from the mouth of an arm; to the gap it draws in.
    const start = round_ ? roundAt(k, front - 0.01) : edge[k] + armAt(k, front - 0.01);
    w = Math.max(w, 15, start * 0.9);
    w = start + (w - start) * smooth((z - front - 1.5) / side.open);
    w = gate + (w - gate) * smooth((mouth - z) / side.close);
    return z < meadow.z1 + 2 ? Math.max(w, head, start) : w;
  };
  const valley: Valley = { z0, step, west: [], east: [], mouth, ...(round_ ? {} : { ridge }), ...(terrain ? { terrain } : {}) };
  for (let i = 0, n = Math.round((mouth - z0) / step) + 1 + 22; i < n; i++) {
    const z = z0 + i * step, c = z < front ? mid : middle(Math.min(z, mouth + 30));
    valley.west.push(round(c - half(sides[0], z, 0)));
    valley.east.push(round(c + half(sides[1], z, 1)));
  }
  // (And a side draws in no faster than seven metres in ten down the valley, only ever by standing further out where it drew in faster:
  // the middle line runs on a slant down the hillside under the castle, and a side measured square to the valley's length came in
  // across the way down in a stride or two.)
  // (Not where it draws in to the gap at the valley's foot, which is a gap between two crags and is drawn so: over the forty metres
  // before the last eighty it comes back to the side as it was.)
  if (seated) for (const [line, out] of [[valley.west, -1], [valley.east, 1]] as const) {
    const most = 0.7 * step, was = line.slice(), upto = (mouth - 80 - z0) / step, fade = 40 / step;
    for (let i = 1; i < line.length; i++) line[i] = out < 0 ? Math.min(line[i], line[i - 1] + most) : Math.max(line[i], line[i - 1] - most);
    for (let i = line.length - 2; i >= 0; i--) line[i] = out < 0 ? Math.min(line[i], line[i + 1] + most) : Math.max(line[i], line[i + 1] - most);
    for (let i = 0; i < line.length; i++) line[i] = round(was[i] + (line[i] - was[i]) * smooth((upto - i) / fade));
  }
  return { valley, middle };
}

/**
 * A seat for a castle by the head of a valley that was found: the land's own high ground beside it, at the brow of the slope over the
 * valley, rather than the valley's floor at its head on a hill made up for it. (Asked, of a castle on the floor at its head: would it
 * not be more natural on the high ground beside the valley, with the village planned along the slope under it? And a larger play area
 * is fine, if that is what fits them.) Castles are built so, Beynac on its crag over the Dordogne, Gruyères on its hill over the
 * Sarine, Cochem on its spur over the Moselle: on ground level enough on top for the bailey, at the edge of where it falls away to the
 * valley, high enough over the valley to command it, with a way up from it that a cart can climb, along which the village is built.
 *
 * Looked for over the ground within some three hundred and forty metres of the valley's head, beside its upper stretch: ground standing
 * twelve to seventy-five metres over the stream, level within eight metres over the castle's reach (`reach` from its middle), falling
 * away towards the stream just beyond its walls and by three metres or more on four of sixteen bearings, with nothing higher between it
 * and the stream, and no steeper to climb from the stream than three in ten. Returns the frame for the site, its middle the meadow's
 * (`dx`, `dz` from the castle's middle in the site's measures), turned so that the site's south runs from the castle down the slope on a
 * slant, as a road goes down a hillside, and then on down the valley; its course the way down to the stream and then the stream's; and
 * how much longer the valley is for the way down. Or null where there is no such ground.
 */
export function findSeat(found: { seed: number; spot: ValleySpot; world?: string }, reach: number, dx: number, dz: number, rng: Rng): { spot: ValleySpot; extra: number } | null {
  const { spot } = found, scale = found.world ? 1 : RELIEF;
  // (The land as the site will have it: a world's at its own height, an upland's at the share of it a valley found in it is given.)
  const raw: (u: number, v: number) => number = found.world ? ((land) => (u: number, v: number) => landAt(land, u, v))(worldLand(found.world)) : ((h) => (u: number, v: number) => uplandHeight(h, u, v))(highlands(found.seed));
  const L = (u: number, v: number) => raw(u, v) * scale;
  const course = spot.course, along = [0];
  for (let k = 1; k < course.length; k++) along.push(along[k - 1] + Math.hypot(course[k][0] - course[k - 1][0], course[k][1] - course[k - 1][1]));
  const FAR = 340;
  // Which way the stream runs at a point of it.
  const flowAt = (i: number) => { const a = course[Math.max(0, Math.min(i, course.length - 4))], b = course[Math.min(course.length - 1, Math.max(i, 0) + 3)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  let best: { score: number; u: number; v: number; i: number; d: number; lo: number; hi: number } | null = null;
  for (let du = -FAR; du <= FAR; du += 12) for (let dv = -FAR; dv <= FAR; dv += 12) {
    if (du * du + dv * dv > FAR * FAR) continue;
    const u = spot.u + du, v = spot.v + dv;
    // Beside the valley's upper stretch: the nearest point of the stream within its first hundred and ten metres.
    let d = Infinity, i = 0;
    for (let k = 0; k < course.length; k++) { const e = Math.hypot(course[k][0] - u, course[k][1] - v); if (e < d) { d = e; i = k; } }
    if (d < 45 || along[i] > 110) continue;
    const [pu, pv] = course[i], top = L(u, v), h = top - L(pu, pv);
    if (h < 12 || h > 75 || h / d > 0.3) continue;
    // (Not where the stream runs back towards it: the way down and the valley below would run against each other.)
    if (Math.cos(flowAt(i) - Math.atan2(pv - v, pu - u)) < -0.3) continue;
    // At the brow: towards the stream, just beyond its walls, the land has fallen away.
    if (L(u + ((pu - u) / d) * (reach + 25), v + ((pv - v) / d) * (reach + 25)) > top - 4) continue;
    let lo = top, hi = top, falls = 0;
    for (let a = 0; a < 16; a++) {
      const c = Math.cos((a / 16) * Math.PI * 2), sn = Math.sin((a / 16) * Math.PI * 2);
      for (const f of [0.5, 1]) { const y = L(u + c * reach * f, v + sn * reach * f); lo = Math.min(lo, y); hi = Math.max(hi, y); }
      if (L(u + c * (reach + 18), v + sn * (reach + 18)) < top - 3) falls++;
    }
    if (hi - lo > 8 || falls < 4) continue;
    let between = -Infinity;
    for (let t = 0.2; t < 0.95; t += 0.1) between = Math.max(between, L(u + (pu - u) * t, v + (pv - v) * t));
    if (between > top + 1) continue;
    const score = falls * 0.3 + Math.min(h, 45) * 0.08 - (hi - lo) * 0.5 - d * 0.006 + rng.range(0, 1);
    if (!best || score > best.score) best = { score, u, v, i, d, lo, hi };
  }
  if (!best) return null;
  // The way down meets the stream where it is nearest; the site's south is turned halfway between straight down the slope and down the
  // stream, so that the way down goes on a slant across the hillside and the valley below runs on south, each as much as the other.
  // (Turned only a little off straight down, a valley whose stream ran across the foot of the slope ran across the site.)
  const [ju, jv] = course[best.i], down = Math.atan2(jv - best.v, ju - best.u), flow = flowAt(best.i);
  const head = Math.atan2(Math.sin(down) + Math.sin(flow), Math.cos(down) + Math.cos(flow)), turn = head - Math.PI / 2;
  const steps = Math.max(1, Math.round(best.d / 6)), way: [number, number][] = [];
  for (let k = 0; k < steps; k++) way.push([best.u + ((ju - best.u) * k) / steps, best.v + ((jv - best.v) * k) / steps]);
  const [u, v] = valleyFrame({ u: best.u, v: best.v, turn }, 0, 0, dx, dz);
  // (Longer by as much of the way down as is more than the stretch below a castle at its head: the stream's valley still runs on
  // some way below where the way reaches it, for the fields and the forest.)
  const extra = Math.max(0, best.d * Math.cos(down - head) - 80);
  return { spot: { u, v, turn, base: (best.lo + best.hi) / 2 / scale, course: [...way, ...course.slice(best.i)] }, extra };
}

/** The shape of a valley that was recorded only as a box, as they once all were: straight sides, drawing in at its foot to a gap. */
export function boxValley(g: { x0: number; x1: number; z0: number; z1: number }): Valley {
  const step = 2, mouth = g.z1, mid = (g.x0 + g.x1) / 2, v: Valley = { z0: g.z0, step, west: [], east: [], mouth };
  for (let z = g.z0; z <= mouth + 44; z += step) {
    const half = z >= mouth ? 6.5 + Math.min(64, Math.max(0, z - mouth - 3) * 1.25) : 6.5 + ((g.x1 - g.x0) / 2 - 6.5) * smooth((mouth - z) / 14);
    v.west.push(mid - half);
    v.east.push(mid + half);
  }
  return v;
}

/**
 * The arms of a valley that run on past the house: on which side, where each one's head is (the
 * last place, going north, where it is still a stride or two across), and the line up its middle.
 */
export function armsOf(v: Valley): { side: 'w' | 'e'; head: number; middle: (z: number) => number }[] {
  const r = v.ridge;
  if (!r) return [];
  const out: { side: 'w' | 'e'; head: number; middle: (z: number) => number }[] = [];
  for (const side of ['w', 'e'] as const) {
    const wide = (z: number) => (side === 'w' ? r.x0 - edgeAt(v, 'w', z) : edgeAt(v, 'e', z) - r.x1);
    if (wide(r.z - 4) < 8) continue;
    let head = r.z - 4;
    while (head > v.z0 && wide(head - 2) > 4) head -= 2;
    out.push({ side, head, middle: (z: number) => (side === 'w' ? (edgeAt(v, 'w', z) + r.x0) / 2 : (edgeAt(v, 'e', z) + r.x1) / 2) });
  }
  return out;
}

/** How much the floor of an arm of the valley has risen, at `z`, above the ground before the house front (which is at `front`). */
export const armRise = (z: number, front: number): number => 4.5 * smooth((front - 3.35 - z) / 45);

/**
 * Where a hall under the hill has its door onward, if it is given one: `u` metres along the hall
 * from its near end, in the side wall on the side of `s` (greater z if 1), cut through to `end`
 * metres from the hall's middle line. `x` is where that is in the world. In a plain hall it is a
 * doorway in the side wall, between two pillars near the middle of its length; in a great one it
 * is in the far wall of the room over the upper bridge, which was made for it.
 */
export function hallOnward(v: Valley, q: { side: 'w' | 'e'; z: number; hall?: { length: number; width: number; drop: number; great?: { chasm: { at: number; width: number } } } }, s: -1 | 1): { u: number; x: number; end: number } {
  const h = q.hall!, inw = q.side === 'w' ? 1 : -1, hall0 = 3.9 + h.drop / 0.5 + 1.6;
  const u = h.great ? h.great.chasm.at + h.great.chasm.width / 2 : 3.4 + 4.4 * Math.max(0, Math.round((0.45 * h.length - 5.6) / 4.4)) + 2.2;
  return { u, x: edgeAt(v, q.side, q.z) + inw * (7 - hall0 - u), end: h.width / 2 + (h.great ? 9.6 : 1.9) };
}

/**
 * The line of the passage that joins a cave in an arm's wall to the cavern: from inside the
 * cave's chamber out through its side, along the foot of the wall three strides behind it (so that
 * the crag stands over it while it is still shallow), and in to the cavern's rim. From a hall it
 * is simpler: out of the hall's door onward and straight on, with one slight turn, to the cavern.
 */
export function joinLine(v: Valley, cave: { side: 'w' | 'e'; z: number; r: number; hall?: { length: number; width: number; drop: number; great?: { chasm: { at: number; width: number } } } }, cavern: { x: number; z: number; rx: number; rz: number; join?: { toward: -1 | 1; run: number } }): [number, number][] {
  const inw = cave.side === 'w' ? 1 : -1, s = cavern.join?.toward ?? 1, run = cavern.join?.run ?? 0;
  const line: [number, number][] = [];
  if (cave.hall) {
    const on = hallOnward(v, cave, s), z0 = cave.z + s * (on.end - 0.6);
    line.push([on.x, z0], [on.x - inw * 1.3, z0 + s * run * 0.5], [on.x, z0 + s * run]);
  } else {
    line.push([edgeAt(v, cave.side, cave.z) - inw * (cave.r - 0.1), cave.z + s * 1.2]);
    for (let d = 1.2 * cave.r + 1, last = 1.2 * cave.r + run; ; d += 3) {
      const at = Math.min(d, last), z = cave.z + s * at;
      line.push([edgeAt(v, cave.side, z) - inw * 3.4, z]);
      if (at === last) break;
    }
  }
  // (It comes into the cavern at the part of its rim that faces the way it comes.)
  const [px, pz] = line[line.length - 1], ux = (px - cavern.x) / cavern.rx, uz = (pz - cavern.z) / cavern.rz, u = Math.hypot(ux, uz) || 1;
  line.push([cavern.x + (ux / u) * (cavern.rx - 1.2), cavern.z + (uz / u) * (cavern.rz - 1.2)]);
  return line;
}
