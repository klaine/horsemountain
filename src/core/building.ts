import { brickFootprint } from './brick';
import { Rng } from './rng';
import { Building, BuildingPlan, ClassicalDress } from './site';

/**
 * How a classical building is laid out: where its windows stand, how its rooms are planned, and
 * where its stair goes. Everything here is in the building's own measures: `u` across the front
 * from its middle, to the right as seen from outside; `v` back from the face of the front wall;
 * `y` up from the ground before the door. The builder and the maps both read it, so that what is
 * drawn on a plan is what is built.
 */

/** The thickness of its walls, and other fixed measures. */
export const CLASSICAL = {
  /** An outer wall, all of it; and the part of that which is the rendered skin with its windows. */
  outer: 0.75, skin: 0.3,
  /** The wall down the middle of the depth, between front rooms and back. */
  spine: 0.5,
  /** A wall between one room and the next. */
  cross: 0.3,
  /** How far the middle stands forward, where it does; a pavilion at an end; and how far before the middle's wall its columns stand, where it has them. */
  out: 0.4, pavilion: 0.25, columns: 1.0,
  plinth: 0.5,
};

/** How a classical building is dressed where its document does not say: as the first of them were. */
export const PLAIN_DRESS: ClassicalDress = {
  centre: 3, order: 'pilasters', pavilions: 0, arches: 0, heads: 'alternate', rusticated: true, frieze: false, balustrade: false,
  tympanum: 'window', flag: false, doors: 1, plinth: CLASSICAL.plinth, fall: 0, roof: 'dealt', style: 'empire',
};
export const dressOf = (b: Building): ClassicalDress => ({ ...PLAIN_DRESS, ...(b.dress ?? {}) });

/** How high the floor of a classical building's ground storey stands over the ground before its door. */
export const plinthOf = (b: Building): number => b.dress?.plinth ?? CLASSICAL.plinth;

/** The height of a storey's floor above the ground before the door. */
export const floorOf = (b: Building, storey: number): number => plinthOf(b) + b.heights.slice(0, storey).reduce((sum, h) => sum + h, 0);

/**
 * How high the ground stands at a point of a building, above the ground before its door: set into rising ground, none at the front and
 * all of `sunk` at the back; where the ground falls along the front, half the fall higher at its upper end and half lower at the other.
 */
export const groundOf = (b: Building, v: number, u = 0): number => {
  const t = Math.min(1, Math.max(0, v / b.d)), fall = b.dress?.fall ?? 0;
  return (b.sunk ?? 0) * t * t * (3 - 2 * t) - (fall ? (fall * Math.min(1, Math.max(-1, (2 * u) / b.w))) / 2 : 0);
};

/**
 * The flight of steps up to a classical building's door from the ground before it, `rise` high: four low steps where it stands on its
 * plinth of half a metre, more where it stands higher, none of them higher than a hand and a half; how deep each is, how much broader
 * than the one over it, and how far before the front the whole reaches.
 */
export function stepsUp(rise: number): { steps: number; rise: number; tread: number; spread: number; run: number } {
  // (Four low ones at the least: the ground before a door is never quite the height it was levelled to, and a step and a bit stops a walker dead.)
  const steps = rise <= 0.62 ? 4 : Math.ceil(rise / 0.165), tread = steps === 4 ? 0.32 : 0.34;
  return { steps, rise: rise / steps, tread, spread: steps === 4 ? 0.3 : 0.06, run: 0.4 + steps * tread };
}

/**
 * Where the windows of a classical front stand (as `u`); where the middle that stands forward begins and ends (`standL`, `standR`,
 * nothing where nothing does); and where the pavilions at its ends give way to the rest of the front (`pavL`, `pavR`, the ends of
 * the front where there are none). A pavilion's edge stands midway between two windows, as a wall between rooms does.
 */
export function classicalFront(b: Building): { windows: number[]; standL: number; standR: number; pavL: number; pavR: number; centre: number; pavilions: number } {
  const W = b.w, n = b.bays, middle = n >> 1, pitch = (W - 1.6) / n, d = dressOf(b), p = d.pavilions;
  const centre = b.portico ? d.centre : 0, k = (centre - 1) / 2;
  let windows: number[], standL = 0, standR = 0;
  if (!b.portico) windows = Array.from({ length: n }, (_, i) => -W / 2 + 0.8 + (i + 0.5) * pitch);
  else {
    // (Two wings, and between them the bays standing forward: each laid out evenly across its own breadth.)
    const side = middle - k, a = 0.8 + side * pitch - 0.3, c = 0.8 + (middle + k + 1) * pitch + 0.3;
    const wing = (from: number, to: number) => Array.from({ length: side }, (_, i) => -W / 2 + from + 0.5 + (i + 0.5) * ((to - from - 1.0) / side));
    const stand = Array.from({ length: centre }, (_, i) => -W / 2 + a + 0.3 + (i + 0.5) * ((c - a - 0.6) / centre));
    windows = [...wing(0, a), ...stand, ...wing(c, W)];
    standL = a - W / 2; standR = c - W / 2;
  }
  return { windows, standL, standR, centre, pavilions: p, pavL: p ? (windows[p - 1] + windows[p]) / 2 : -W / 2, pavR: p ? (windows[n - p - 1] + windows[n - p]) / 2 : W / 2 };
}

/** How far the wall of a classical front stands forward of its line at a point across it: where the middle or a pavilion does. */
export function frontAt(b: Building, u: number): number {
  if (b.style !== 'imperial') return 0;
  const f = classicalFront(b);
  if (b.portico && u > f.standL && u < f.standR) return CLASSICAL.out;
  return u < f.pavL || u > f.pavR ? CLASSICAL.pavilion : 0;
}

/** Where the windows of the end walls stand, as `v`: an even number of them, so that the wall down the middle meets each end wall between two. */
export function classicalEnds(b: Building): number[] {
  const n = b.d >= 10.4 ? 4 : 2, pitch = (b.d - 1.6) / n;
  return Array.from({ length: n }, (_, i) => 0.8 + (i + 0.5) * pitch);
}

type Wing = NonNullable<Building['wings']>[number];

/**
 * A wing's own frame: its measures as if it stood square to the back (`u` across, `v` back, as the building's), turned about the back
 * corner of the end it stands on by its `lean`. `to` takes a point of those measures to the building's, `from` the building's back.
 * `from0` is how far along its outer wall (from the back's line) the wing is whole across its width, which is where its rooms and its
 * windows begin; `foot` is where its footprint begins, within the main block; `span` is how much of the back it covers. The line of the
 * back runs across the wing's measures from its outer wall at nought to its inner at `back(width)`.
 */
export function wingFrame(b: Building, g: Wing) {
  const a = ((g.lean ?? 0) * Math.PI) / 180, phi = -g.side * a, c = Math.cos(phi), s = Math.sin(phi), pu = (g.side * b.w) / 2, pv = b.d;
  const tan = Math.tan(a), back = (x: number) => -x * tan;
  return {
    leans: !!g.lean, c, s,
    to: (u: number, v: number): [number, number] => { const du = u - pu, dv = v - pv; return [pu + du * c - dv * s, pv + du * s + dv * c]; },
    from: (u: number, v: number): [number, number] => { const du = u - pu, dv = v - pv; return [pu + du * c + dv * s, pv - du * s + dv * c]; },
    /** How far back of the back's line, along the wing, a point `x` in from its outer wall is. */
    back,
    from0: Math.max(0, back(g.width)), foot: Math.min(0, back(g.width)), span: g.width / Math.cos(a),
  };
}

/** Whether a point across the back (`u`) is where a wing stands against it, within `m` of it. */
export const underWing = (b: Building, u: number, m = 0.3) => (b.wings ?? []).some((g) => g.side * u > b.w / 2 - wingFrame(b, g).span - m);

/** The windows of a wing: along its two long walls (as `v`), and across its far end (as `u`); in the wing's own measures. */
export function wingWindows(b: Building, wing: Wing): { along: number[]; across: number[] } {
  const from = wingFrame(b, wing).from0, L = wing.length - from;
  const n = Math.max(1, Math.round((L - 1.2) / 2.6)), pitch = (L - 1.2) / n;
  const mid = wing.side * (b.w / 2 - wing.width / 2);
  return {
    along: Array.from({ length: n }, (_, i) => b.d + from + 0.6 + (i + 0.5) * pitch),
    across: wing.width >= 7.8 ? [mid - wing.width / 4, mid + wing.width / 4] : [mid],
  };
}

/**
 * A part of where a building stands: an oblong in its own measures, or, for a wing that leans, in that wing's (`turned`, its side;
 * `partAt` takes a point of the building's into them); or, for a wedge, any four-sided figure (`ring`, round in order, its sides
 * straight and bending one way), the oblong then the box about it.
 */
export type FootPart = { u0: number; u1: number; v0: number; v1: number; turned?: { to: (u: number, v: number) => [number, number]; from: (u: number, v: number) => [number, number] }; ring?: [number, number][] };
/** A point of a building's measures in a part's own. */
export const partAt = (r: FootPart, u: number, v: number): [number, number] => (r.turned ? r.turned.from(u, v) : [u, v]);
/** A part's corners, in the building's measures, round in order; `inset` in from its sides (less than nothing, out). */
export const partCorners = (r: FootPart, inset = 0): [number, number][] => r.ring ? insetRing(r.ring, r.ring.map(() => inset))
  : ([[r.u0 + inset, r.v0 + inset], [r.u1 - inset, r.v0 + inset], [r.u1 - inset, r.v1 - inset], [r.u0 + inset, r.v1 - inset]] as [number, number][]).map(([u, v]) => (r.turned ? r.turned.to(u, v) : [u, v]));
/** How far within a figure that bends one way a point is: the least of how far it is within each side (less than nothing outside). */
const inRing = (ring: [number, number][], u: number, v: number) => {
  const turn = ringTurn(ring);
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [au, av] = ring[i], [bu, bv] = ring[(i + 1) % ring.length], L = Math.hypot(bu - au, bv - av);
    if (L < 1e-9) continue;
    best = Math.min(best, (turn * ((bu - au) * (v - av) - (bv - av) * (u - au))) / L);
  }
  return best;
};
/** Which way round a figure goes: 1 one way, -1 the other. */
const ringTurn = (ring: [number, number][]) => Math.sign(ring.reduce((a, [u, v], i) => { const [p, q] = ring[(i + 1) % ring.length]; return a + u * q - p * v; }, 0)) || 1;
/** A figure that bends one way with each side moved in by its own distance (less than nothing, out): where the moved sides meet. */
export function insetRing(ring: [number, number][], by: number[]): [number, number][] {
  const turn = ringTurn(ring), n = ring.length;
  const line = (i: number) => {
    const [au, av] = ring[i], [bu, bv] = ring[(i + 1) % n], L = Math.hypot(bu - au, bv - av) || 1, du = (bu - au) / L, dv = (bv - av) / L;
    // (The inward hand of a side, as the figure goes round.)
    const nu = -dv * turn, nv = du * turn;
    return { pu: au + nu * by[i], pv: av + nv * by[i], du, dv };
  };
  return ring.map((_, i) => {
    const a = line((i + n - 1) % n), c = line(i), det = a.du * c.dv - a.dv * c.du;
    if (Math.abs(det) < 1e-9) return [c.pu, c.pv];
    const t = ((c.pu - a.pu) * c.dv - (c.pv - a.pv) * c.du) / det;
    return [a.pu + a.du * t, a.pv + a.dv * t];
  });
}
/** How far a point of the building's measures is outside a part (nothing within it). */
export const offPart = (r: FootPart, u: number, v: number) => {
  if (r.ring) {
    if (inRing(r.ring, u, v) >= 0) return 0;
    let best = Infinity;
    for (let i = 0; i < r.ring.length; i++) {
      const [au, av] = r.ring[i], [bu, bv] = r.ring[(i + 1) % r.ring.length], du = bu - au, dv = bv - av, t = Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv || 1)));
      best = Math.min(best, Math.hypot(u - au - du * t, v - av - dv * t));
    }
    return best;
  }
  const [a, e] = partAt(r, u, v);
  return Math.hypot(Math.max(r.u0 - a, 0, a - r.u1), Math.max(r.v0 - e, 0, e - r.v1));
};
/** How far within a part a point is (less than nothing outside it). */
export const inPart = (r: FootPart, u: number, v: number) => { if (r.ring) return inRing(r.ring, u, v); const [a, e] = partAt(r, u, v); return Math.min(a - r.u0, r.u1 - a, e - r.v0, r.v1 - e); };
/** A part as a figure that bends one way, from its corners. */
const ringPart = (ring: [number, number][]): FootPart => ({ u0: Math.min(...ring.map((p) => p[0])), u1: Math.max(...ring.map((p) => p[0])), v0: Math.min(...ring.map((p) => p[1])), v1: Math.max(...ring.map((p) => p[1])), ring });

/**
 * A classical building's wedge (`wedge`), worked out: its ground (`ring`: the main block's end at the front, the far corner of the
 * front, the far corner of the back, the main block's end at the back), and within it what the builder and the plans both need. Its
 * front and back carry on the main block's windows at their pitch, as far as there is room before the slanting end; the slanting end has
 * windows of its own, evenly; walls within it stand across from front to back midway between two of the front's windows, some five
 * metres apart, where it is deep enough; and the main block's end wall has a door on every storey into each room against it.
 */
export function wedgeOf(b: Building) {
  const g = b.wedge;
  if (!g || b.style !== 'imperial') return null;
  const s = g.side, W = b.w, D = b.d, e = (s * W) / 2, T = CLASSICAL.outer, skin = CLASSICAL.skin;
  const F: [number, number] = [e + s * g.front, 0], B: [number, number] = [e + s * g.back, D];
  const ring: [number, number][] = [[e, 0], F, B, [e, D]];
  // The slanting end: from the front's far corner to the back's, its length, which way along it, and which way is in.
  const len = Math.hypot(B[0] - F[0], D), du = (B[0] - F[0]) / len, dv = D / len, nu = -s * dv, nv = s * du;
  // (The corners' angles within: at the front's far corner between the front and the end, and at the back's.)
  const atFront = Math.acos(Math.max(-1, Math.min(1, -s * du))), atBack = Math.PI - atFront;
  // How much of a side a window must keep clear of a corner whose angle is `a`: a wall's thickness more where the corner is sharp.
  const clear = (a: number) => 0.9 + (a < Math.PI / 2 ? T / Math.tan(a) : 0);
  const { windows } = classicalFront(b), pitch = (W - 1.6) / b.bays, last = s > 0 ? windows[windows.length - 1] : windows[0];
  const along = (reach: number, a: number) => { const out: number[] = []; for (let k = 1; s * (last + s * k * pitch - e) + 0.6 + clear(a) <= reach; k++) out.push(last + s * k * pitch); return out; };
  const fronts = along(g.front, atFront), backs = along(g.back, atBack);
  const ends: number[] = [], n = Math.max(1, Math.round((len - 2 * Math.max(clear(atFront), clear(atBack)) - 0.4) / 2.6));
  if (len - clear(atFront) - clear(atBack) >= 1.6) {
    const a0 = clear(atFront) + 0.6, a1 = len - clear(atBack) - 0.6;
    for (let k = 0; k < n; k++) ends.push(n === 1 ? (a0 + a1) / 2 : a0 + ((a1 - a0) * k) / (n - 1));
  }
  // Walls across, midway between two of the front's windows, every second or third bay, where the wedge is its full depth past them.
  const full = Math.min(g.front, g.back), crosses: number[] = [];
  for (let k = 2; ; k += 2) { const u = last + s * (k + 0.5) * pitch; if (s * (u - e) > full - 2.2) break; if (s * (u - e) >= 3.5) crosses.push(u); }
  // The doors through the main block's end: one into each room against it, on every storey, at the middle of the room.
  const endRooms = (b.plan?.rooms ?? []).filter((r) => r.frame === undefined && Math.abs(s * (s > 0 ? r.u1 : r.u0) - (W / 2 - T)) < 0.05);
  const doors = endRooms.map((r) => ({ v: (r.v0 + r.v1) / 2, storey: r.storey }));
  return { side: s, e, F, B, ring, len, du, dv, nu, nv, atFront, atBack, fronts, backs, ends, crosses, doors, pitch, skin, T,
    /** A point of the slanting end, `a` along it from the front's corner and `t` in from its face. */
    endAt: (a: number, t: number): [number, number] => [F[0] + du * a + nu * t, F[1] + dv * a + nv * t],
    /** The floor within, to the faces of its walls' skins and the main block's end. */
    inner: insetRing(ring, [skin, skin, skin, 0]),
  };
}

/** Where a building stands on the ground, as oblongs in its own measures: the main block, what stands forward of it, and its wings. */
export function footprintOf(b: Building): FootPart[] {
  if (b.style === 'brick') return brickFootprint(b);
  if (b.style === 'chapel' && b.chapel) return chapelParts(b).rects;
  const out: FootPart[] = [{ u0: -b.w / 2, u1: b.w / 2, v0: 0, v1: b.d }];
  if (b.style === 'imperial') {
    const f = classicalFront(b);
    // (Where there are columns, the ground storey of the middle comes forward to carry them.)
    if (b.portico) out.push({ u0: f.standL, u1: f.standR, v0: -CLASSICAL.out - (dressOf(b).order === 'columns' ? CLASSICAL.columns : 0), v1: 0 });
    if (f.pavilions) out.push({ u0: -b.w / 2, u1: f.pavL, v0: -CLASSICAL.pavilion, v1: 0 }, { u0: f.pavR, u1: b.w / 2, v0: -CLASSICAL.pavilion, v1: 0 });
  }
  const wd = wedgeOf(b);
  if (wd) out.push(ringPart(wd.ring));
  for (const g of b.wings ?? []) {
    // (A wing that leans begins within the main block, where its corner nearest the middle meets the back.)
    const wf = wingFrame(b, g), part: FootPart = { u0: g.side > 0 ? b.w / 2 - g.width : -b.w / 2, u1: g.side > 0 ? b.w / 2 : -b.w / 2 + g.width, v0: b.d + wf.foot - 0.01, v1: b.d + g.length };
    if (wf.leans) part.turned = { to: wf.to, from: wf.from };
    out.push(part);
  }
  return out;
}

/**
 * The parts of a village's church on the ground, in its own measures: its nave; its tower beyond one end of it, on the nave's middle
 * line; its choir beyond the other, narrower; and the apse past the choir, as half a circle of the choir's half breadth.
 */
export function chapelParts(b: Building) {
  const c = b.chapel!, W = b.w, D = b.d, e = c.end, T = c.tower, cw = Math.round(D * 0.68 * 10) / 10, apse = c.apse ? cw / 2 : 0;
  const nave = { u0: -W / 2, u1: W / 2, v0: 0, v1: D };
  const tower = e < 0 ? { u0: -W / 2 - T + 0.4, u1: -W / 2 + 0.4, v0: D / 2 - T / 2, v1: D / 2 + T / 2 } : { u0: W / 2 - 0.4, u1: W / 2 + T - 0.4, v0: D / 2 - T / 2, v1: D / 2 + T / 2 };
  const choir = e < 0 ? { u0: W / 2, u1: W / 2 + c.choir, v0: D / 2 - cw / 2, v1: D / 2 + cw / 2 } : { u0: -W / 2 - c.choir, u1: -W / 2, v0: D / 2 - cw / 2, v1: D / 2 + cw / 2 };
  const round = apse ? (e < 0 ? { u0: choir.u1, u1: choir.u1 + apse, v0: choir.v0, v1: choir.v1 } : { u0: choir.u0 - apse, u1: choir.u0, v0: choir.v0, v1: choir.v1 }) : null;
  return { nave, tower, choir, cw, apse, rects: [nave, tower, choir, ...(round ? [round] : [])] };
}

/**
 * The variations a classical building may have, dealt from `rng` (a stream of its own, so that adding them changed nothing else):
 * its storeys may be other than a tall principal storey over a lower ground one (a tall ground storey under lower ones alike, or all
 * alike); now and then its middle stands forward without a pediment over it; and a building with wings, an L or a U, may have towers at one
 * to three of its corners, rising one to three storeys over its cornice. Towers go in pairs where they can (the two ends of the front,
 * or the two ends of a U's wings), and a third, if there is one, at a wing's end.
 */
export function classicalVariations(b: Building, rng: Rng): void {
  if (b.style !== 'imperial') return;
  // Its storeys. Most have the tall principal storey over a lower ground storey, as dealt; but some have a tall ground storey (shops,
  // a counting house, a hall) with lower storeys alike over it, and some have every storey the same height.
  if (b.storeys >= 2) {
    const q = rng.fork('storeys'), kind = q.pick(['principal', 'principal', 'principal', 'ground', 'ground', 'even', 'even']), r1 = (v: number) => Math.round(v * 10) / 10;
    if (kind === 'ground') b.heights = [r1(q.range(4.4, 5.2)), ...Array.from({ length: b.storeys - 1 }, (_, n) => r1(q.range(3.1, 3.5) - n * 0.05))];
    else if (kind === 'even') { const h = r1(q.range(3.3, 3.9)); b.heights = Array.from({ length: b.storeys }, (_, n) => r1(h + (n === 0 ? 0.2 : 0) - (n === b.storeys - 1 && b.storeys > 2 ? q.range(0, 0.2) : 0))); }
  }
  if (b.portico && rng.fork('pediment').chance(0.3)) b.pediment = false;
  // A broad one, eleven bays or more, may have two or three entrances along its front, each with its stair: two either side of the
  // middle, or the middle one and one either side.
  if (b.bays >= 11) {
    const q = rng.fork('entrances'), middle = b.bays >> 1;
    if (q.chance(0.4)) {
      if (q.chance(0.5)) { const k = q.int(2, middle - 3); b.entrances = [k, middle, b.bays - 1 - k]; }
      else { const k = Math.min(Math.round(b.bays / 4), (b.bays - 3) >> 1); b.entrances = [k, b.bays - 1 - k]; }
    }
  }
  const wings = b.wings ?? [], q = rng.fork('towers');
  if (!wings.length || !q.chance(0.65)) return;
  const count = q.pick([1, 2, 2, 3]), extra = q.pick([1, 1, 2, 2, 3]);
  const front = Math.min(6.4, b.w / 2 - 3.5, q.range(4.6, 6.4)), wingSize = (side: number) => Math.min(front, wings.find((g) => g.side === side)?.width ?? 0, q.range(4.6, 6.4));
  if (front < 4) return;
  const pairFront: NonNullable<Building['towers']> = [-1, 1].map((side) => ({ corner: 'front' as const, side: side as -1 | 1, size: Math.round(front * 10) / 10, extra }));
  const atWing = (side: -1 | 1) => ({ corner: 'wing' as const, side, size: Math.round(wingSize(side) * 10) / 10, extra: Math.min(3, extra + (q.chance(0.3) ? 1 : 0)) });
  const towers: NonNullable<Building['towers']> = [];
  if (count === 1) towers.push(q.chance(0.5) ? atWing(wings[q.int(0, wings.length - 1)].side) : pairFront[q.int(0, 1)]);
  else if (count === 2) towers.push(...(wings.length === 2 && q.chance(0.4) ? [atWing(-1), atWing(1)] : pairFront));
  else towers.push(...pairFront, atWing(wings[q.int(0, wings.length - 1)].side));
  b.towers = towers.filter((t) => t.size >= 4);
  if (!b.towers.length) delete b.towers;
}

/**
 * How a classical building is dressed, dealt from `rng` (a stream of its own, so that dressing them changed nothing else about a
 * place). A broad one is now and then a palace's front: a middle of five or seven bays under columns or pilasters, pavilions at its
 * ends, round-headed windows, a wreathed frieze, a clock in its pediment, a flagpole, three doors into its hall. A small one is now
 * and then plainer than the first of them were: no ornament over its windows, its ground storey smooth. Where the place has room
 * before it (`raise`), it may stand on a high base of granite with a basement in it, up a longer flight (its floor up to `raise` metres
 * over the ground); and where the ground falls along its front (`fall`, how much lower at its right end than its left), it takes up as
 * much of that as its base allows. `columns` says whether there is room before it for the middle to come forward on columns.
 */
export function dealDress(b: Building, rng: Rng, o: { raise?: number; fall?: number; columns?: boolean; forward?: boolean; fit?: boolean } = {}): void {
  if (b.style !== 'imperial') return;
  const r1 = (v: number) => Math.round(v * 10) / 10, middle = b.bays >> 1, several = !!(b.entrances && b.entrances.length > 1);
  const grand = b.bays >= 11 && rng.chance(0.55), plain = !grand && b.bays <= 7 && rng.chance(0.35);
  const d: ClassicalDress = { ...PLAIN_DRESS };
  if (b.portico && grand && !several) {
    d.centre = rng.pick([3, 5, 5, ...(b.bays >= 17 ? [7] : [])]);
    if (o.columns !== false && b.bays >= 9 && rng.chance(0.5)) d.order = 'columns';
  }
  const beside = b.portico ? middle - (d.centre - 1) / 2 : middle - (b.bays >= 7 ? 1 : 0);
  if (grand && !several && !b.arch && beside >= 3 && rng.chance(0.5)) d.pavilions = Math.min(beside - 1, rng.pick([1, 2, 2, 3]));
  // (`forward` false: nothing may stand before the front's line, as along a street of houses wall to wall.)
  if (o.forward === false) { d.pavilions = 0; d.order = 'pilasters'; }
  d.arches = plain ? 0 : rng.pick(grand ? [0, 1, 1, 2] : [0, 0, 0, 1, 2]) as 0 | 1 | 2;
  if (b.storeys < 2 && d.arches > 1) d.arches = 1;
  d.heads = plain ? rng.pick(['plain', 'cornice'] as const) : rng.pick(['alternate', 'alternate', 'cornice', 'pediments', ...(grand ? ['pediments' as const] : [])] as const);
  d.rusticated = plain ? rng.chance(0.4) : rng.chance(0.9);
  d.frieze = grand ? rng.chance(0.6) : !plain && rng.chance(0.2);
  d.balustrade = grand ? rng.chance(0.35) : !plain && rng.chance(0.1);
  d.tympanum = rng.pick(grand ? ['clock', 'oculus', 'window'] as const : ['window', 'window', 'oculus', 'plain'] as const);
  d.flag = grand && rng.chance(0.5);
  d.roof = rng.pick(grand ? ['dealt', 'dealt', 'copper', 'black', 'grey'] as const : plain ? ['dealt', 'dealt', 'tiles', 'dark', 'grey'] as const : ['dealt', 'dealt', 'dealt', 'tiles', 'copper', 'black'] as const);
  d.doors = grand && b.portico && !several && rng.chance(0.5) ? 3 : 1;
  // (Of its own stream, so that the rest is dealt as it was before there were styles.)
  d.style = rng.fork('style').pick(grand ? ['empire', 'empire', 'quoins'] as const : plain ? ['empire', 'lesenes', 'lesenes', 'bare'] as const : ['empire', 'empire', 'empire', 'quoins', 'lesenes'] as const);
  if (o.raise && o.raise > CLASSICAL.plinth && !b.sunk && (grand ? rng.chance(0.6) : rng.chance(0.2))) d.plinth = r1(rng.range(Math.min(1.1, o.raise), o.raise));
  // (The ground at its upper end stays a little under its floor.)
  // (`fit`: the plinth raised, as far as `raise` allows, until the floor stands over the ground at the upper end.)
  if (o.fall && !b.sunk && o.fit) d.plinth = r1(Math.max(d.plinth, Math.min(Math.max(o.raise ?? 0, CLASSICAL.plinth), 0.4 + Math.abs(o.fall) / 2)));
  if (o.fall && !b.sunk) { const most = 2 * (d.plinth - 0.35); d.fall = r1(Math.min(most, Math.max(-most, o.fall))); }
  if ((Object.keys(PLAIN_DRESS) as (keyof ClassicalDress)[]).some((key) => d[key] !== PLAIN_DRESS[key])) b.dress = d;
}

/** How near something may stand before a window: nearer than this, it would look into a wall, and it is left out. */
export const CLOSE = 2.4;

/**
 * Whether a window whose middle is at `u` across and `v` back, its sill `y` over the ground before the door, looking out along
 * (`nu`, `nv`), would look into something the document says stands close (`near`): anything within CLOSE of it, across its width,
 * whose top is over its sill. Then it is left out.
 */
export function blinded(b: Building, u: number, v: number, nu: number, nv: number, y = 0, half = 0.6): boolean {
  if (!b.near?.length) return false;
  const l = Math.hypot(nu, nv) || 1, du = nu / l, dv = nv / l;
  for (const n of b.near) {
    if (y >= n.top) continue;
    for (const d of [0.05, 0.5, 1, 1.7, CLOSE]) for (const a of [-half, 0, half]) if (within(n.at, u + du * d - dv * a, v + dv * d + du * a)) return true;
  }
  return false;
}

/** Whether a point lies inside an outline (each crossing of a line from it outward counts once). */
function within(ring: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Whether an opening whose foot is at `y0` would be under the ground, at a place `v` back from the front and `u` across it. */
export const buried = (b: Building, v: number, y0: number, u = 0): boolean => y0 < groundOf(b, v, u) + 0.25;

/**
 * The plan of a classical building, worked out from its bays as such houses were. Each window is
 * a bay, and a wall between rooms may stand only between two windows. The middle bay, or the
 * middle three where the middle stands forward or the house is seven bays or more, is the way
 * in and the way up: three bays make an entrance hall to the front and a stair hall behind it,
 * one bay a passage through the house with the stair at its far end. The bays either side are
 * dealt out among rooms of one, two or three bays, the same on both sides, in two rows divided
 * by a wall down the middle of the depth. Doors stand in a line from room to room along the front
 * a stride in from the windows, along the back the same way, and from each front room to the
 * room behind it. Every storey is planned alike.
 */
export function planClassical(b: Building, rng: Rng): BuildingPlan {
  const { outer: T, spine: SPINE, cross: CROSS, out: OUT, pavilion: PAV } = CLASSICAL;
  const W = b.w, D = b.d, { windows, standL, standR, centre, pavilions, pavL, pavR } = classicalFront(b);
  const bays = b.bays, middle = bays >> 1, broad = b.portico || bays >= 7 ? 3 : 1, flank = (broad - 1) / 2, k = (centre - 1) / 2;
  // The middle line of each wall between bays: midway between two windows, or at the cheeks of what stands forward.
  const edge: number[] = [-W / 2];
  for (let i = 1; i < bays; i++) edge.push((windows[i - 1] + windows[i]) / 2);
  edge.push(W / 2);
  if (b.portico) { edge[middle - k] = standL + CROSS / 2; edge[middle + k + 1] = standR - CROSS / 2; }
  if (pavilions) { edge[pavilions] = pavL - CROSS / 2; edge[bays - pavilions] = pavR + CROSS / 2; }
  const lo = (i: number) => (i === 0 ? -W / 2 + T : edge[i] + CROSS / 2), hi = (i: number) => (i === bays ? W / 2 - T : edge[i] - CROSS / 2);
  const spine = D / 2, sF = spine - SPINE / 2, sB = spine + SPINE / 2, front = T, back = D - T;
  const uL = lo(middle - flank), uR = hi(middle + flank + 1);
  const plan: BuildingPlan = { rooms: [], doors: [], walls: { outer: T, spine: SPINE, cross: CROSS } };
  // How far each wall of a room reaches out from it: all of an outer wall within its skin, half of any other.
  const IN = T - CLASSICAL.skin, side = (u: number) => (Math.abs(Math.abs(u) - (W / 2 - T)) < 0.02 ? IN : CROSS / 2);
  const lined = (v0: number, v1: number, u0: number, u1: number): [number, number, number, number] => [v0 < T + 0.02 ? IN : SPINE / 2, v1 > back - 0.02 ? IN : SPINE / 2, side(u0), side(u1)];
  if (broad === 1) plan.rooms.push({ kind: 'passage', u0: uL, u1: uR, v0: front, v1: back, linings: lined(front, back, uL, uR) });
  else {
    plan.rooms.push({ kind: 'hall', u0: uL, u1: uR, v0: b.portico ? -OUT + T : T, v1: sF, linings: lined(T, sF, uL, uR) }, { kind: 'stair', u0: uL, u1: uR, v0: sB, v1: back, linings: lined(sB, back, uL, uR) });
    plan.doors.push({ line: 'v', at: spine, c: (uL + uR) / 2, w: 2.2, tall: true });
  }
  if (b.entrances && b.entrances.length > 1) { planEntrances(b, rng, plan, { edge, lo, hi, lined, middle, broad, spine, sF, sB, front, back }); return planWings(b, rng, plan); }
  // A wing: rooms of one, two or three bays; and the other wing its mirror. (With a carriage way through its end, the outermost two
  // bays are one, the way on the ground storey and a pair of rooms over it on every other.) Each part of the front that stands
  // forward (the rest of a broad middle beyond the hall, and a pavilion) has rooms of its own, so that no room's front is broken by a
  // step, and its front rooms reach forward into it.
  const arch = !!b.arch && middle - flank >= 2 && !b.wings?.length && !pavilions;
  const parts: { bays: number; out: number }[] = [];
  if (k > flank) parts.push({ bays: k - flank, out: OUT });
  parts.push({ bays: middle - flank - Math.max(0, k - flank) - pavilions - (arch ? 2 : 0), out: 0 });
  if (pavilions) parts.push({ bays: pavilions, out: PAV });
  const sizes: { size: number; out: number }[] = [];
  for (const part of parts) for (let left = part.bays; left > 0;) {
    const take = left <= 3 && rng.chance(0.45) ? left : Math.min(left, rng.pick([1, 2, 2, 3]));
    sizes.push({ size: take, out: part.out });
    left -= take;
  }
  if (arch) sizes.push({ size: 2, out: 0 });
  for (const side of [-1, 1]) {
    let bay = side < 0 ? middle - flank : middle + flank + 1;
    for (const { size, out } of sizes) {
      const first = side < 0 ? bay - size : bay, last = side < 0 ? bay : bay + size;
      const u0 = lo(first), u1 = hi(last), inner = side < 0 ? last : first, atMiddle = side < 0 ? last === middle - flank : first === middle + flank + 1;
      const forward = front - out;
      // (The carriage way: on the ground storey one room from the front wall to the back, entered from neither neighbour; over it the
      // rooms are as anywhere else, and so named storey by storey.)
      const through = arch && side === b.arch!.side && (side < 0 ? first === 0 : last === bays);
      const storeys = through ? Array.from({ length: b.storeys - 1 }, (_, n) => n + 1) : [undefined];
      if (through) plan.rooms.push({ kind: 'carriage', u0, u1, v0: front, v1: back, linings: lined(front, back, u0, u1), storey: 0 });
      for (const storey of storeys) {
        const on = storey === undefined ? {} : { storey };
        plan.rooms.push({ kind: 'front', u0, u1, v0: forward, v1: sF, linings: lined(forward, sF, u0, u1), ...on }, { kind: 'back', u0, u1, v0: sB, v1: back, linings: lined(sB, back, u0, u1), ...on });
        plan.doors.push({ line: 'u', at: edge[inner], c: front + 1.25, w: 1.1, ...on });
        // (Beside a passage the back rooms are reached from the front rooms: the passage's far end is its stair.)
        if (!atMiddle || broad === 3) plan.doors.push({ line: 'u', at: edge[inner], c: atMiddle ? sB + 0.9 : back - 1.25, w: 1.0, ...on });
        plan.doors.push({ line: 'v', at: spine, c: (u0 + u1) / 2, w: 1.0, ...on });
      }
      bay += side * size;
    }
  }
  return planWings(b, rng, plan);
}

/** The bays a classical building's front doors are in: the middle one, or those it names. */
export const entranceBays = (b: Building): number[] => (b.entrances && b.entrances.length > 1 ? [...b.entrances].sort((p, q) => p - q) : [b.bays >> 1]);
/** How many bays stand at either end of a classical building before its first entrance and its hall (the fewer of the two ends). */
export function freeAtEnds(b: Building): number {
  const doors = entranceBays(b), middle = b.bays >> 1, broad = (d: number) => d === middle && (b.portico || b.bays >= 7);
  return Math.min(doors[0] - (broad(doors[0]) ? 1 : 0), b.bays - 1 - doors[doors.length - 1] - (broad(doors[doors.length - 1]) ? 1 : 0));
}

/**
 * The rooms of a broad classical building with more than one entrance. Each entrance is a hall and a stair: in the middle, where it
 * stands forward or the building is broad, the hall of three bays with the stair hall behind it; elsewhere a passage one bay broad
 * running back to its stair. A carriage way, if there is one, takes the two bays at its end. The bays between are rooms of one to
 * three bays, a front room and a back one, and each opens towards the entrance nearest it, through the rooms between.
 */
function planEntrances(b: Building, rng: Rng, plan: BuildingPlan, g: { edge: number[]; lo: (i: number) => number; hi: (i: number) => number; lined: (v0: number, v1: number, u0: number, u1: number) => [number, number, number, number]; middle: number; broad: number; spine: number; sF: number; sB: number; front: number; back: number }): void {
  const { edge, lo, hi, lined, middle, broad, spine, sF, sB, front, back } = g, { out: OUT, outer: T } = CLASSICAL, bays = b.bays;
  type Unit = { a: number; e: number; kind: 'broad' | 'passage' | 'carriage' | 'rooms' };
  const groups: Unit[] = entranceBays(b).map((d): Unit => (d === middle && broad === 3 ? { a: d - 1, e: d + 2, kind: 'broad' } : { a: d, e: d + 1, kind: 'passage' }));
  if (b.arch && !b.wings?.length && freeAtEnds(b) >= 2) groups.push(b.arch.side < 0 ? { a: 0, e: 2, kind: 'carriage' } : { a: bays - 2, e: bays, kind: 'carriage' });
  groups.sort((p, q) => p.a - q.a);
  // (Where the middle stands forward without a door in it, its rooms are its own: no room runs across its cheeks.)
  const breaks = b.portico && !groups.some((q) => q.kind === 'broad') ? [middle - 1, middle + 2] : [];
  const units: Unit[] = [];
  let at = 0;
  for (const q of [...groups, { a: bays, e: bays, kind: 'rooms' as const }]) {
    while (at < q.a) {
      const stop = Math.min(q.a, ...breaks.filter((k) => k > at)), left = stop - at;
      const take = left <= 3 && rng.chance(0.45) ? left : Math.min(left, rng.pick([1, 2, 2, 3]));
      units.push({ a: at, e: at + take, kind: 'rooms' });
      at += take;
    }
    if (q.e > q.a) { units.push(q); at = q.e; }
  }
  const entrance = (q: Unit) => q.kind === 'broad' || q.kind === 'passage';
  const forward = (q: Unit) => (b.portico && q.a >= middle - 1 && q.e <= middle + 2 ? -OUT + T : front);
  for (const q of units) {
    const u0 = lo(q.a), u1 = hi(q.e);
    if (q.kind === 'broad') {
      plan.rooms.push({ kind: 'hall', u0, u1, v0: forward(q), v1: sF, linings: lined(T, sF, u0, u1) }, { kind: 'stair', u0, u1, v0: sB, v1: back, linings: lined(sB, back, u0, u1) });
      plan.doors.push({ line: 'v', at: spine, c: (u0 + u1) / 2, w: 2.2, tall: true });
    } else if (q.kind === 'passage') plan.rooms.push({ kind: 'passage', u0, u1, v0: front, v1: back, linings: lined(front, back, u0, u1) });
    else if (q.kind === 'carriage') plan.rooms.push({ kind: 'carriage', u0, u1, v0: front, v1: back, linings: lined(front, back, u0, u1), storey: 0 });
  }
  units.forEach((q, k) => {
    if (entrance(q)) return;
    // Towards the nearest entrance.
    let best = -1;
    units.forEach((o, j) => { if (entrance(o) && (best < 0 || Math.abs(j - k) < Math.abs(best - k))) best = j; });
    const dir = best < k ? -1 : 1, next = units[k + dir], wall = edge[dir < 0 ? q.a : q.e], u0 = lo(q.a), u1 = hi(q.e), v0 = forward(q);
    const storeys = q.kind === 'carriage' ? Array.from({ length: b.storeys - 1 }, (_, n) => n + 1) : [undefined];
    for (const storey of storeys) {
      const on = storey === undefined ? {} : { storey };
      plan.rooms.push({ kind: 'front', u0, u1, v0, v1: sF, linings: lined(front, sF, u0, u1), ...on }, { kind: 'back', u0, u1, v0: sB, v1: back, linings: lined(sB, back, u0, u1), ...on });
      plan.doors.push({ line: 'u', at: wall, c: front + 1.25, w: 1.1, ...on });
      // (Beside a passage the back rooms are reached from the front rooms: the passage's far end is its stair.)
      if (next.kind !== 'passage') plan.doors.push({ line: 'u', at: wall, c: next.kind === 'broad' ? sB + 0.9 : back - 1.25, w: 1.0, ...on });
      plan.doors.push({ line: 'v', at: spine, c: (u0 + u1) / 2, w: 1.0, ...on });
    }
  });
}

/**
 * The wings: a row of rooms each, one or two windows long, one opening into the next down the
 * wing's length, and the first into the main block through what was its back wall. That wall
 * stays as thick as it was, so the door through it is deep.
 */
function planWings(b: Building, rng: Rng, plan: BuildingPlan): BuildingPlan {
  const { outer: T, cross: CROSS } = CLASSICAL, W = b.w, D = b.d, IN = T - CLASSICAL.skin;
  for (const wing of b.wings ?? []) {
    // (A wing that leans is planned in its own measures, as if it stood square, from where it is whole across its width; its rooms and
    // doors say so, and the door through the back is where the wing's middle meets the back's line.)
    const wf = wingFrame(b, wing), frame = wf.leans ? { frame: wing.side } : {};
    const { along } = wingWindows(b, wing), outer = wing.side * (W / 2 - T), inner = wing.side * (W / 2 - wing.width + T);
    const u0 = Math.min(outer, inner), u1 = Math.max(outer, inner), end = D + wing.length - T, door = (u0 + u1) / 2 + wing.side * -0.2;
    const cuts: number[] = [];
    for (let i = 1; i < along.length;) { const take = Math.min(along.length - i, rng.pick([1, 2, 2])); i += take; if (i < along.length) cuts.push((along[i - 1] + along[i]) / 2); }
    const walls = [D + wf.from0 + CLASSICAL.skin, ...cuts, end];
    for (let i = 0; i < walls.length - 1; i++) {
      const v0 = i ? walls[i] + CROSS / 2 : walls[0], v1 = i === walls.length - 2 ? walls[i + 1] : walls[i + 1] - CROSS / 2;
      plan.rooms.push({ kind: 'wing', u0, u1, v0, v1, linings: [i ? CROSS / 2 : CLASSICAL.skin, i === walls.length - 2 ? IN : CROSS / 2, IN, IN], ...frame });
      if (i) plan.doors.push({ line: 'v', at: walls[i], c: door, w: 1.1, ...frame });
    }
    if (!wf.leans) { plan.doors.push({ line: 'v', at: D - (T - CLASSICAL.skin) / 2, c: door, w: 1.1, through: T + CLASSICAL.skin }); continue; }
    const [c] = wf.to(door, D + wf.back(W / 2 - wing.side * door));
    plan.doors.push({ line: 'v', at: D - (T - CLASSICAL.skin) / 2, c, w: 1.1, through: T + CLASSICAL.skin });
    // (And through the near wall of its first room, from the passage that crosses what lies between the back and that room.)
    plan.doors.push({ line: 'v', at: walls[0] - CLASSICAL.skin / 2, c: door, w: 1.1, ...frame });
  }
  return plan;
}

/**
 * The carriage way's arch, where a classical building has one: its middle across the front (`u`), how broad it is, and how high its
 * crown and its springing stand over the ground before the building. It stands between the two windows of the end bays, and as the
 * front's, so the back's, at the same `u`.
 */
export function classicalArch(b: Building): { u: number; w: number; crown: number; spring: number } | null {
  const room = b.plan?.rooms.find((r) => r.kind === 'carriage');
  if (!room) return null;
  const { windows } = classicalFront(b), n = b.arch!.side < 0 ? 0 : b.bays - 2;
  const u = (windows[n] + windows[n + 1]) / 2, w = Math.min(3.3, windows[n + 1] - windows[n] + 0.9, 2 * Math.min(u - room.u0, room.u1 - u) - 0.3), crown = Math.min(plinthOf(b) + b.heights[0] - 0.35, 4.1);
  return { u, w, crown, spring: crown - w / 2 };
}

/** Every stair of a classical building: one behind each entrance. */
export const classicalStairs = (b: Building) => b.plan!.rooms.filter((r) => r.kind === 'stair' || r.kind === 'passage').map((r) => classicalStair(b, r));

/**
 * The stair of a classical building: two flights side by side and a landing between them, the
 * same on every storey, of steps no higher than a hand and a half however high the storey; so a
 * taller storey has a longer flight, and every flight begins where the one below began. It is
 * laid out in measures of its own, `a` along its flights from where the first begins to rise and
 * `e` across them, and `place` turns those into the building's. In a stair hall it lies along
 * the back wall; at the end of a passage it fills the passage's breadth.
 */
export function classicalStair(b: Building, room = b.plan!.rooms.find((r) => r.kind === 'stair' || r.kind === 'passage')!) {
  const broad = room.kind === 'stair';
  const TREAD = 0.24, LANDING = 1.05, START = broad ? 1.2 : 0.3;
  const flights = b.heights.slice(0, -1).map((h) => {
    const steps = Math.ceil(h / 0.17), first = Math.ceil(steps / 2);
    return { steps, first, rise: h / steps, turn: START + first * TREAD };
  });
  const longest = START + Math.max(0, ...flights.map((f) => f.first)) * TREAD + LANDING;
  const across = broad ? 2.2 : room.u1 - room.u0 - 0.1, strip = Math.min(1.1, (across - 0.12) / 2);
  const place = broad
    ? (a: number, e: number) => ({ u: room.u0 + 0.05 + a, v: room.v1 - 0.05 - across + e })
    : (a: number, e: number) => ({ u: room.u0 + 0.05 + e, v: room.v1 - 0.05 - longest + a });
  return { broad, TREAD, LANDING, START, flights, across, strip, place };
}

// ---------------------------------------------------------------------------------------------
// Timber-framed houses.

/** The fixed measures of a timber house: its stone ground walls, its framed walls above, its plinth, the walls between its rooms, and its stair. */
export const TIMBER = { ground: 0.56, wall: 0.3, plinth: 0.3, partition: 0.14, stair: 0.8, riser: 0.22 };

/** The height of a timber house's floors above the ground before the door: the ground floor is the top of its plinth. */
export const timberFloor = (b: Building, storey: number): number => TIMBER.plinth + (storey === 0 ? 0.18 : b.heights.slice(0, storey).reduce((sum, h) => sum + h, 0));

/** Where the front of a storey stands: each stands out over the one below. */
export const timberFront = (b: Building, storey: number): number => -(b.jetty ?? 0.35) * storey;

/** How many bays of framing a wall of a given length has. */
export const timberBays = (length: number): number => Math.max(2, Math.round(length / 1.55));

/**
 * The windows of one storey of a timber house, wall by wall (the front, then round by the right):
 * where each begins and ends along its wall, from the wall's left end as seen from outside. The
 * ground storey has a window or two beside the door and one small one in each other wall; a framed
 * storey has them in whole bays of the frame, on the street as many as the house has bays, at the
 * back one, and at the sides in every other bay.
 */
export function timberWindows(b: Building, storey: number): [number, number][][] {
  const W = b.w, D = b.d - timberFront(b, storey);
  // (None where something stands close before the wall: each wall's line, and the way it looks out, in the building's measures.)
  const front = timberFront(b, storey), sill = timberFloor(b, storey) + 0.9;
  const open = (i: number) => ([s0, s1]: [number, number]) => {
    const c = (s0 + s1) / 2, [u, v, nu, nv] = i === 0 ? [-W / 2 + c, front, 0, -1] : i === 1 ? [W / 2, front + c, 1, 0] : i === 2 ? [W / 2 - c, b.d, 0, 1] : [-W / 2, b.d - c, -1, 0];
    return !blinded(b, u, v, nu, nv, sill, (s1 - s0) / 2);
  };
  if (storey === 0) {
    const door = W * (b.door ?? 0.24);
    // (A half basement, buried behind and at its sides, has windows to the street alone.)
    return ([[0.2, 0.5, 0.8].filter((c) => Math.abs(c * W - door) > 1.5).map((c): [number, number] => [c * W - 0.55, c * W + 0.55]), ...(b.sunk ? [[], [], []] : [[[D / 2 - 0.4, D / 2 + 0.4]], [[W / 2 - 0.4, W / 2 + 0.4]], [[D / 2 - 0.4, D / 2 + 0.4]]])] as [number, number][][]).map((wall, i) => wall.filter(open(i)));
  }
  return [W, D, W, D].map((L, i) => {
    const bays = timberBays(L), pitch = L / bays, lit = new Set<number>();
    if (i === 0) for (let n = 0; n < b.bays; n++) lit.add(Math.min(bays - 1, Math.floor(((n + 0.5) * bays) / b.bays)));
    // (Over a half basement, the middle bay of the first storey's back wall is its back door: `timberBackDoor`.)
    else if (i === 2) { if (!(b.sunk && storey === 1)) lit.add(Math.floor(bays / 2)); }
    else for (let n = 1; n < bays; n += 2) lit.add(n);
    return [...lit].sort((p, q) => p - q).map((n): [number, number] => [n * pitch + 0.2, (n + 1) * pitch - 0.2]).filter(open(i));
  });
}

/** The back door of a timber house over a half basement: the bay of its first storey's back wall it fills, from the wall's left end as seen from outside. */
export function timberBackDoor(b: Building): { bay: number; s0: number; s1: number } | null {
  if (!b.sunk || b.storeys < 2) return null;
  const bays = timberBays(b.w), pitch = b.w / bays, bay = Math.floor(bays / 2);
  return { bay, s0: bay * pitch + 0.16, s1: (bay + 1) * pitch - 0.16 };
}

/**
 * The stair of a timber house: straight flights one over another against the side wall of the
 * hall, on the side the door is, each rising towards the back. They are steep, as such stairs
 * are, and all the same length on plan, so that every flight begins over the foot of the one
 * below and each comes up through the floor at the same place.
 */
export function timberStair(b: Building) {
  const side: -1 | 1 = (b.door ?? 0.24) < 0.5 ? -1 : 1, G = TIMBER.ground;
  const v0 = G + 1.2, v1 = v0 + Math.min(2.9, b.d - 1.05 - v0);
  // (`m` is the distance from the outer face of the side wall the stair stands against.)
  const at = (m: number) => side * (b.w / 2 - m), a = at(G), c = at(G + TIMBER.stair);
  const flights = Array.from({ length: b.storeys - 1 }, (_, k) => {
    const height = timberFloor(b, k + 1) - timberFloor(b, k), steps = Math.ceil(height / TIMBER.riser);
    return { steps, rise: height / steps, tread: (v1 - v0) / (steps - 1) };
  });
  return { side, at, u0: Math.min(a, c), u1: Math.max(a, c), v0, v1, flights };
}

/**
 * The plan of a timber house. The door opens into a hall along one side of the house, with the
 * stair in it against the side wall; a framed wall divides it from the room, which has the
 * windows to the street. Upstairs the stair comes up into a landing, broader than the hall below
 * since its wall stands at a post of the frame, and off it are two chambers, one to the street
 * and one to the back, divided at a post of the side wall so that no wall meets a window.
 */
export function planTimber(b: Building): BuildingPlan {
  const { ground: G, wall: T, partition: P } = TIMBER, W = b.w, D = b.d, stair = timberStair(b), left = stair.side < 0;
  const plan: BuildingPlan = { rooms: [], doors: [], walls: { outer: G, spine: P, cross: P } };
  const span = (m0: number, m1: number) => { const a = stair.at(m0), c = stair.at(m1); return { u0: Math.min(a, c), u1: Math.max(a, c) }; };
  // (The walls of a room: front, back, left, right. The hall's outer wall is on the door's side; the room's on the other.)
  const walls = (outer: number, hall: boolean, front = outer, back = outer): [number, number, number, number] => [front, back, hall === left ? outer : P / 2, hall === left ? P / 2 : outer];
  const door = (left ? b.door ?? 0.24 : 1 - (b.door ?? 0.76)) * W, between = door + 0.82;
  plan.rooms.push({ kind: 'hall', ...span(G, between - P / 2), v0: G, v1: D - G, linings: walls(G, true), storey: 0 });
  plan.rooms.push({ kind: 'front', ...span(between + P / 2, W - G), v0: G, v1: D - G, linings: walls(G, false), storey: 0 });
  plan.doors.push({ line: 'u', at: stair.at(between), c: G + 1.65, w: 0.85, storey: 0 });
  for (let storey = 1; storey < b.storeys; storey++) {
    const front = timberFront(b, storey), post = (2 * W) / timberBays(W), bays = timberBays(D - front), cross = front + (Math.round(bays / 2) * (D - front)) / bays;
    plan.rooms.push({ kind: 'passage', ...span(T, post - P / 2), v0: front + T, v1: D - T, linings: walls(T, true), storey });
    plan.rooms.push({ kind: 'front', ...span(post + P / 2, W - T), v0: front + T, v1: cross - P / 2, linings: walls(T, false, T, P / 2), storey });
    plan.rooms.push({ kind: 'back', ...span(post + P / 2, W - T), v0: cross + P / 2, v1: D - T, linings: walls(T, false, P / 2, T), storey });
    plan.doors.push({ line: 'u', at: stair.at(post), c: front + T + 0.65, w: 0.8, storey }, { line: 'u', at: stair.at(post), c: D - T - 0.65, w: 0.8, storey });
  }
  return plan;
}

/**
 * A village church's own measures, as a village under a castle deals them (`generate.ts`) and the building lab deals one: its nave's
 * length `W`, breadth `D` and walls `H`; how far `before` it its churchyard reaches; and its tower (its breadth and the height of its
 * walls), its spire (a pyramid, a needle or a saddle roof) and its choir, square or with an apse. Which end the tower stands at is the
 * caller's: the village's from the road, the lab's from its seed. (Drawn from `cq` in the order the village always drew them, so that
 * no village is changed by their being drawn here.)
 */
export function dealChapel(cq: Rng): { W: number; D: number; H: number; before: number; chapel: Omit<NonNullable<Building['chapel']>, 'end'> } {
  const round = (x: number) => Math.round(x * 10) / 10;
  const W = round(cq.range(11, 14.5)), D = round(cq.range(6.6, 7.8)), H = round(cq.range(6.2, 7.4)), T = round(cq.range(4.2, 5));
  const spire = cq.pick(['pyramid', 'pyramid', 'needle', 'saddle'] as const), before = cq.range(5, 7);
  const chapel = { tower: T, height: round(H + cq.range(7, 10.5)), spire, spireHeight: round(spire === 'needle' ? cq.range(9, 13) : spire === 'pyramid' ? cq.range(5, 7.5) : cq.range(2.6, 3.4)), choir: round(cq.range(3.6, 5)), apse: cq.chance(0.6) };
  return { W, D, H, before, chapel };
}
