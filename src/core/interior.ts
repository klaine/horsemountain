import { BuildingPlan } from './site';

/**
 * The insides of the houses of brick and of the canal houses, planned from a few measures of the
 * shell as such houses were planned: narrow and deep, wall against wall with their neighbours, so
 * lit only from the front and the back, with a stair that climbs storey over storey in one place.
 * Everything is in the building's own measures (`u` across the front from its middle, `v` back from
 * the face of the front), as the rest of a plan is.
 *
 * The stair of these houses is steep, as theirs are: straight flights one over another, every one
 * beginning where the one below began, so that each comes up through the floor above in the same
 * place, and anyone going on up turns back along the well to the foot of the next. That is how the
 * timber houses' stair is made, and a body climbs it.
 */

/**
 * A stair's measures: no step higher than `rise`; treads `tread` deep where there is room, and never
 * shallower than `least`; a flight `width` broad; and the room left clear before its foot and beyond
 * its head, to turn in.
 */
export const STEEP = { rise: 0.21, tread: 0.26, least: 0.2, width: 0.9, foot: 0.9, head: 0.85 };

type Room = BuildingPlan['rooms'][number];
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * The shell a plan is made in: the inside faces of its outer walls (`u0` and `u1` the side walls', `v0` the front's, `v1` the back's),
 * how thick the front and the other outer walls are, how thick a wall between rooms is, and its floors, storey by storey, above the
 * ground before the door, the last of them the top of its walls.
 */
export interface Shell { u0: number; u1: number; v0: number; v1: number; front: number; wall: number; cross: number; floors: number[] }

/** How many steps each flight has: one flight from each storey to the next. */
const stepsOf = (floors: number[]) => floors.slice(0, -2).map((y, k) => Math.ceil((floors[k + 1] - y) / STEEP.rise - 1e-6));

/** The flights of a stair whose longest is `length` long: each from one floor to the next, its steps, how high each is, how deep, and how long it is. */
export function steepFlights(floors: number[], length: number) {
  const steps = stepsOf(floors), most = Math.max(2, ...steps), tread = length / (most - 1);
  return steps.map((n, k) => ({ steps: n, rise: (floors[k + 1] - floors[k]) / n, tread, length: (n - 1) * tread }));
}

/** How long a stair must be for these floors at the deepest tread that fits in `room`; none if there is only one storey; null if even the shallowest tread does not fit. */
export function fitStair(floors: number[], room: number): number | null {
  const steps = stepsOf(floors);
  if (!steps.length) return 0;
  const most = Math.max(...steps), tread = Math.min(STEEP.tread, room / (most - 1));
  return tread < STEEP.least ? null : r2(tread * (most - 1));
}

/** A room, with how far each of its walls reaches from it: all of an outer wall, half of one between rooms. */
function room(sh: Shell, kind: Room['kind'], u0: number, u1: number, v0: number, v1: number, storey?: number): Room {
  const by = (x: number, edge: number, outer: number) => (Math.abs(x - edge) < 0.02 ? outer : r2(sh.cross / 2));
  return { kind, u0: r2(u0), u1: r2(u1), v0: r2(v0), v1: r2(v1), linings: [by(v0, sh.v0, sh.front), by(v1, sh.v1, sh.wall), by(u0, sh.u0, sh.wall), by(u1, sh.u1, sh.wall)], ...(storey === undefined ? {} : { storey }) };
}
const empty = (sh: Shell): BuildingPlan => ({ rooms: [], doors: [], walls: { outer: sh.wall, spine: sh.cross, cross: sh.cross } });
/** A stair against a wall at `edge`, on its `side` (-1: the wall is on the stair's left, as one looks across the front), from `v0` and `length` long. */
const stairAt = (edge: number, side: -1 | 1, width: number, v0: number, length: number): NonNullable<BuildingPlan['stair']> =>
  side < 0 ? { u0: r2(edge), u1: r2(edge + width), v0: r2(v0), v1: r2(v0 + length), wall: -1 } : { u0: r2(edge - width), u1: r2(edge), v0: r2(v0), v1: r2(v0 + length), wall: 1 };
const door = (line: 'u' | 'v', at: number, c: number, w: number, storey?: number): BuildingPlan['doors'][number] => ({ line, at: r2(at), c: r2(c), w: r2(w), ...(storey === undefined ? {} : { storey }) });

/**
 * Open floors one over another, as a warehouse has them: the ground storey a hall for goods, every
 * storey over it a loft, and the stair against the wall on `side` toward the back.
 */
export function planOpen(sh: Shell, side: -1 | 1): BuildingPlan | null {
  const N = sh.floors.length - 1, top = sh.v1 - STEEP.head, length = fitStair(sh.floors, top - (sh.v0 + 1.8));
  if (length === null) return null;
  const plan = empty(sh);
  for (let s = 0; s < N; s++) plan.rooms.push(room(sh, s ? 'loft' : 'hall', sh.u0, sh.u1, sh.v0, sh.v1, s));
  if (N > 1) plan.stair = stairAt(side < 0 ? sh.u0 : sh.u1, side, STEEP.width, top - length, length);
  return plan;
}

/**
 * A house entered in its middle: a passage from the door to the back between `p0` and `p1` (its
 * inside faces), the stair in it against its left wall, and on either side a front room and a back
 * room, each with a door from the passage and one between them. Every storey alike: upstairs the
 * passage is the landing. So the double houses on the canals were planned, and the broader brick
 * houses of the later centuries.
 */
export function planDouble(sh: Shell, p0: number, p1: number): BuildingPlan | null {
  const C = sh.cross, width = Math.min(STEEP.width, p1 - p0 - 0.8);
  if (width < 0.72 || p0 - C - sh.u0 < 1.8 || sh.u1 - p1 - C < 1.8) return null;
  // (The doors into the back rooms are near the back, beyond the stair's head: the stair stands against the left one's wall.)
  const v0 = sh.v0 + 1.6, length = fitStair(sh.floors, sh.v1 - 1.1 - v0);
  if (length === null) return null;
  const plan = empty(sh), vc = (sh.v0 + sh.v1) / 2;
  plan.rooms.push(room(sh, 'passage', p0, p1, sh.v0, sh.v1));
  for (const [u0, u1, wall] of [[sh.u0, p0 - C, p0 - C / 2], [p1 + C, sh.u1, p1 + C / 2]]) {
    plan.rooms.push(room(sh, 'front', u0, u1, sh.v0, vc - C / 2), room(sh, 'back', u0, u1, vc + C / 2, sh.v1));
    plan.doors.push(door('u', wall, sh.v0 + 0.95, 0.9), door('u', wall, sh.v1 - 0.6, 0.9), door('v', vc, (u0 + u1) / 2, 0.9));
  }
  if (sh.floors.length > 2) plan.stair = stairAt(p0, -1, width, v0, length);
  return plan;
}

/**
 * A house entered at one side: a corridor from the door to the back along the side wall on `side`,
 * its inner wall's middle at `edge`, with the stair in it against the side wall; beside it a front
 * room and a back room, each with a door from the corridor and one between them. Every storey alike.
 * The common plan of a canal house of two to four windows.
 */
export function planCorridor(sh: Shell, side: -1 | 1, edge: number): BuildingPlan | null {
  const C = sh.cross, [c0, c1] = side < 0 ? [sh.u0, edge - C / 2] : [edge + C / 2, sh.u1], [r0, r1] = side < 0 ? [edge + C / 2, sh.u1] : [sh.u0, edge - C / 2];
  const width = Math.min(STEEP.width, c1 - c0 - 0.8);
  if (width < 0.72 || r1 - r0 < 1.8) return null;
  // (The foot of the stair is clear of the front door's leaf, which stands open against the side wall.)
  const v0 = sh.v0 + 1.55, length = fitStair(sh.floors, sh.v1 - STEEP.head - v0);
  if (length === null) return null;
  const plan = empty(sh), vc = (sh.v0 + sh.v1) / 2;
  plan.rooms.push(room(sh, 'passage', c0, c1, sh.v0, sh.v1), room(sh, 'front', r0, r1, sh.v0, vc - C / 2), room(sh, 'back', r0, r1, vc + C / 2, sh.v1));
  plan.doors.push(door('u', edge, sh.v0 + 0.95, 0.9), door('u', edge, sh.v1 - 0.7, 0.9), door('v', vc, (r0 + r1) / 2, 0.9));
  if (sh.floors.length > 2) plan.stair = stairAt(side < 0 ? sh.u0 : sh.u1, side, width, v0, length);
  return plan;
}

/**
 * A house too narrow for a corridor beside its rooms: the rooms one behind another the whole breadth
 * of the house, the front room entered from the street, then the stair, rising along the left wall
 * with a way past it, then the back room, if the lot is deep enough for one. Every storey alike.
 */
export function planNarrow(sh: Shell): BuildingPlan | null {
  const C = sh.cross, inside = sh.u1 - sh.u0, width = Math.min(0.85, inside - 0.8), deep = sh.v1 - sh.v0;
  if (width < 0.7) return null;
  // The stair's room: a stride before its foot, the flight, a stride beyond its head; then as much front room as there is, and a back room if it can be two metres deep.
  let back = true, length = fitStair(sh.floors, deep - 2.2 - 2.0 - 2 * C - STEEP.foot - STEEP.head);
  if (length === null) { back = false; length = fitStair(sh.floors, deep - 2.2 - C - STEEP.foot - STEEP.head); }
  if (length === null) return null;
  const zone = STEEP.foot + length + STEEP.head, rest = deep - zone - (back ? 2 : 1) * C, front = back ? Math.max(2.2, Math.min(rest - 2.0, rest * 0.55)) : rest;
  const a = sh.v0 + front, z0 = a + C, z1 = z0 + zone, free = (sh.u0 + width + sh.u1) / 2, fw = Math.min(0.9, inside - width - 0.1);
  const plan = empty(sh);
  plan.rooms.push(room(sh, 'front', sh.u0, sh.u1, sh.v0, a), room(sh, 'passage', sh.u0, sh.u1, z0, back ? z1 : sh.v1));
  plan.doors.push(door('v', a + C / 2, free, fw));
  if (back) { plan.rooms.push(room(sh, 'back', sh.u0, sh.u1, z1 + C, sh.v1)); plan.doors.push(door('v', z1 + C / 2, free, fw)); }
  if (sh.floors.length > 2) plan.stair = stairAt(sh.u0, -1, width, z0 + STEEP.foot, length);
  return plan;
}

/**
 * A merchant's house of the brick towns. The ground storey is the hall (the Diele), as tall as a
 * storey and a half, where goods came in at the broad door and business was done; partitioned off
 * at its front, on the side away from the door, the office (the Dornse), the one warm room, if
 * `office` gives its wall's middle (`edge`) and its depth. The stair climbs along the side wall on
 * the door's side, `side`, at the back of the hall. Over the hall the first floor is lived in: a
 * room across the whole front, and behind it the landing with the stair and a back room beside it,
 * where the house is deep and broad enough; every storey over that is a loft for goods.
 */
export function planDiele(sh: Shell, side: -1 | 1, office: { edge: number; depth: number } | null): BuildingPlan | null {
  const C = sh.cross, N = sh.floors.length - 1, width = 1.0, top = sh.v1 - STEEP.head, length = fitStair(sh.floors, top - (sh.v0 + 2.2));
  if (length === null) return null;
  const v0 = top - length, plan = empty(sh);
  if (office) {
    const vD = sh.v0 + office.depth, e = office.edge, [h0, h1] = side < 0 ? [sh.u0, e - C / 2] : [e + C / 2, sh.u1], [o0, o1] = side < 0 ? [e + C / 2, sh.u1] : [sh.u0, e - C / 2];
    // (The hall goes round the office: along its side from the door, and the whole breadth behind it.)
    plan.rooms.push(room(sh, 'office', o0, o1, sh.v0, vD - C / 2, 0), room(sh, 'hall', h0, h1, sh.v0, vD + C / 2, 0), room(sh, 'hall', sh.u0, sh.u1, vD + C / 2, sh.v1, 0));
    plan.doors.push(door('v', vD, (o0 + o1) / 2, 0.95, 0));
  } else plan.rooms.push(room(sh, 'hall', sh.u0, sh.u1, sh.v0, sh.v1, 0));
  for (let s = 1; s < N; s++) {
    const a = v0 - 1.0, pw = width + 0.95, [p0, p1] = side < 0 ? [sh.u0, sh.u0 + pw] : [sh.u1 - pw, sh.u1], [b0, b1] = side < 0 ? [p1 + C, sh.u1] : [sh.u0, p0 - C];
    if (s > 1 || a - C / 2 - sh.v0 < 2.6 || b1 - b0 < 2.0) { plan.rooms.push(room(sh, 'loft', sh.u0, sh.u1, sh.v0, sh.v1, s)); continue; }
    plan.rooms.push(room(sh, 'front', sh.u0, sh.u1, sh.v0, a - C / 2, s), room(sh, 'passage', p0, p1, a + C / 2, sh.v1, s), room(sh, 'back', b0, b1, a + C / 2, sh.v1, s));
    plan.doors.push(door('v', a, (p0 + p1) / 2, 0.95, s), door('u', side < 0 ? p1 + C / 2 : p0 - C / 2, (a + sh.v1) / 2, 0.95, s));
  }
  if (N > 1) plan.stair = stairAt(side < 0 ? sh.u0 : sh.u1, side, width, v0, length);
  return plan;
}

/**
 * Where windows may stand in a wall that a plan's walls meet: each of `spans` (from `u0` to `u1`) moved off any wall meeting it,
 * or left out where it cannot be. `walls` are the middles of the walls between rooms that meet it, each `C` thick.
 */
export function clearOfWalls(spans: [number, number][], walls: number[], C: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, e] of spans) {
    let u0 = a, u1 = e;
    for (const w of walls) {
      const lo = w - C / 2 - 0.12, hi = w + C / 2 + 0.12;
      if (u1 <= lo || u0 >= hi) continue;
      // (Moved to whichever side of the wall it mostly stands on.)
      const shift = (u0 + u1) / 2 < w ? lo - u1 : hi - u0;
      u0 += shift; u1 += shift;
    }
    if (!walls.some((w) => u1 > w - C / 2 - 0.1 && u0 < w + C / 2 + 0.1) && !out.some(([p, q]) => u1 > p - 0.25 && u0 < q + 0.25)) out.push([u0, u1]);
  }
  return out;
}

/** The middles of the walls between rooms that meet the back wall on a storey: where rooms touching the back have their sides, inside the house. */
export function wallsAtBack(plan: BuildingPlan, sh: Shell, storey: number): number[] {
  const rooms = plan.rooms.filter((r) => (r.storey === undefined || r.storey === storey) && r.v1 > sh.v1 - 0.02);
  const out: number[] = [];
  for (const r of rooms) for (const u of [r.u0, r.u1]) if (u > sh.u0 + 0.05 && u < sh.u1 - 0.05) {
    const mid = r2(u === r.u0 ? u - sh.cross / 2 : u + sh.cross / 2);
    if (!out.some((w) => Math.abs(w - mid) < 0.05)) out.push(mid);
  }
  return out;
}

/**
 * What is wrong with a house's plan, if anything, for the checks (`tools/sites.ts`): a room outside the shell or in another; a room
 * that cannot be reached from the front door (`door`, the middle of it across the front, as `u`) through the doorways, the rooms that
 * open into one another, and the stair; or a flight that does not stand on the floor of one room, or has no floor to come up onto.
 */
export function planProblem(plan: BuildingPlan, sh: Shell, storeys: number, door: number): string | null {
  const C = sh.cross, on = (s: number) => plan.rooms.filter((r) => r.storey === undefined || r.storey === s);
  const find = (s: number, u: number, v: number) => on(s).findIndex((r) => u > r.u0 - 0.01 && u < r.u1 + 0.01 && v > r.v0 - 0.01 && v < r.v1 + 0.01);
  const links = new Map<string, string[]>(), link = (a: string, c: string) => { links.set(a, [...(links.get(a) ?? []), c]); links.set(c, [...(links.get(c) ?? []), a]); };
  for (let s = 0; s < storeys; s++) {
    const rooms = on(s);
    if (!rooms.length) return `storey ${s} has no rooms`;
    for (const [i, r] of rooms.entries()) {
      if (r.u0 < sh.u0 - 0.02 || r.u1 > sh.u1 + 0.02 || r.v0 < sh.v0 - 0.02 || r.v1 > sh.v1 + 0.02) return `a ${r.kind} on storey ${s} stands outside the walls`;
      for (const [j, q] of rooms.entries()) {
        if (j <= i) continue;
        const du = Math.min(r.u1, q.u1) - Math.max(r.u0, q.u0), dv = Math.min(r.v1, q.v1) - Math.max(r.v0, q.v0);
        if (du > 0.02 && dv > 0.02) return `a ${r.kind} and a ${q.kind} on storey ${s} stand in one another`;
        // (Rooms that touch along a stretch a body can pass are one floor: the hall that goes round an office.)
        if ((Math.abs(du) < 0.02 && dv > 0.8) || (Math.abs(dv) < 0.02 && du > 0.8)) link(`${s}:${i}`, `${s}:${j}`);
      }
    }
    for (const d of plan.doors.filter((q) => q.storey === undefined || q.storey === s)) {
      const off = C / 2 + 0.1, [p, q] = d.line === 'u' ? [[d.at - off, d.c], [d.at + off, d.c]] : [[d.c, d.at - off], [d.c, d.at + off]], a = find(s, p[0], p[1]), c = find(s, q[0], q[1]);
      if (a < 0 || c < 0) return `a doorway on storey ${s} opens onto no room`;
      link(`${s}:${a}`, `${s}:${c}`);
    }
  }
  const st = plan.stair;
  if (storeys > 1) {
    if (!st) return 'no stair';
    const flights = steepFlights(sh.floors, st.v1 - st.v0), mid = (st.u0 + st.u1) / 2;
    for (const [k, f] of flights.entries()) {
      if (f.tread < STEEP.least - 1e-3 || f.rise > STEEP.rise + 1e-3) return `the flight from storey ${k} is too steep`;
      const foot = find(k, mid, st.v0 - 0.3), head = find(k + 1, mid, st.v0 + f.length + 0.3);
      if (foot < 0 || head < 0) return `the flight from storey ${k} has no floor at its foot or its head`;
      // (It stands on floor all along, though that floor may be two rooms that open into one another.)
      for (let v = st.v0; v <= st.v0 + f.length; v += 0.25) for (const u of [st.u0 + 0.05, st.u1 - 0.05]) if (find(k, u, v) < 0) return `the flight from storey ${k} stands over a wall`;
      if (st.v0 + f.length + STEEP.head > sh.v1 + 0.01) return `the flight from storey ${k} comes up against the back wall`;
      link(`${k}:${foot}`, `${k + 1}:${head}`);
    }
  }
  const start = find(0, door, sh.v0 + 0.3);
  if (start < 0) return 'the front door opens onto no room';
  const seen = new Set([`0:${start}`]), queue = [`0:${start}`];
  while (queue.length) for (const n of links.get(queue.shift()!) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  for (let s = 0; s < storeys; s++) for (const [i, r] of on(s).entries()) if (!seen.has(`${s}:${i}`)) return `a ${r.kind} on storey ${s} cannot be reached`;
  return null;
}

/**
 * A way on one storey from a point to another through the plan's doorways, for walking a house (`tools/houses.ts`): the points to
 * pass, a stride before and a stride beyond each doorway on the way, then the end. Rooms that touch are crossed where they touch.
 * Empty if either point is in no room or there is no way between them.
 */
export function routeThrough(plan: BuildingPlan, sh: Shell, storey: number, from: [number, number], to: [number, number]): [number, number][] {
  const rooms = plan.rooms.filter((r) => r.storey === undefined || r.storey === storey), C = sh.cross;
  const find = (u: number, v: number) => rooms.findIndex((r) => u > r.u0 - 0.01 && u < r.u1 + 0.01 && v > r.v0 - 0.01 && v < r.v1 + 0.01);
  const a = find(...from), z = find(...to);
  if (a < 0 || z < 0) return [];
  // Each room's ways out: through a doorway (with the points either side of it), or where it touches another.
  const ways: { from: number; to: number; pts: [number, number][] }[] = [];
  for (const d of plan.doors.filter((q) => q.storey === undefined || q.storey === storey)) {
    const off = C / 2 + 0.45, p: [number, number] = d.line === 'u' ? [d.at - off, d.c] : [d.c, d.at - off], q: [number, number] = d.line === 'u' ? [d.at + off, d.c] : [d.c, d.at + off];
    const i = find(...p), j = find(...q);
    if (i >= 0 && j >= 0) { ways.push({ from: i, to: j, pts: [p, q] }, { from: j, to: i, pts: [q, p] }); }
  }
  for (const [i, r] of rooms.entries()) for (const [j, q] of rooms.entries()) {
    if (i === j) continue;
    const du = Math.min(r.u1, q.u1) - Math.max(r.u0, q.u0), dv = Math.min(r.v1, q.v1) - Math.max(r.v0, q.v0);
    if (Math.abs(dv) < 0.02 && du > 0.8) { const u = (Math.max(r.u0, q.u0) + Math.min(r.u1, q.u1)) / 2, v = r.v1 < q.v0 + 0.02 ? r.v1 : r.v0, s = r.v1 < q.v0 + 0.02 ? 1 : -1; ways.push({ from: i, to: j, pts: [[u, v - s * 0.45], [u, v + s * 0.45]] }); }
    if (Math.abs(du) < 0.02 && dv > 0.8) { const v = (Math.max(r.v0, q.v0) + Math.min(r.v1, q.v1)) / 2, u = r.u1 < q.u0 + 0.02 ? r.u1 : r.u0, s = r.u1 < q.u0 + 0.02 ? 1 : -1; ways.push({ from: i, to: j, pts: [[u - s * 0.45, v], [u + s * 0.45, v]] }); }
  }
  const back = new Map<number, { prev: number; pts: [number, number][] }>([[a, { prev: -1, pts: [] }]]), queue = [a];
  while (queue.length && !back.has(z)) { const n = queue.shift()!; for (const w of ways) if (w.from === n && !back.has(w.to)) { back.set(w.to, { prev: n, pts: w.pts }); queue.push(w.to); } }
  if (!back.has(z)) return [];
  const legs: [number, number][][] = [];
  for (let n = z; n !== a; n = back.get(n)!.prev) legs.unshift(back.get(n)!.pts);
  return [...legs.flat(), to];
}
