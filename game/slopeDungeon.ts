/**
 * The cave halfway down a run, and the dungeon it leads into (asked: "could we have a run have dungeon? a made procedurally generated
 * dungeon with opening in the side of the piste around halfway of the run. There should be a small campfire area in front of it and
 * when player enters that entrance area outside of the cavern, they unmount the skis so they can then continue to explore the cavern
 * by foot. If they exit the entrance area, the skis get back on.").
 *
 * Where: looked for along the middle of the run (`findSite`), at the side of the piste, where a bank rises from beside the poles
 * steeply enough for a tunnel to be under it within a few metres, and the snow beside the piste is flat enough to camp on. There the
 * snow is levelled for the camp (`carve`), and a hole cut through it behind the cave's mouth, where the tunnel is too near the surface
 * to lie under the snow: the snow is drawn from a lattice of heights, which can have no overhang, so the rock over the tunnel's first
 * metres is a mound of its own, built over the hole with a face of rock across its front and the mouth in it. Further in, the tunnel
 * runs down under the snow at a walker's slope to a gate in a wall of dressed stone, and the dungeon behind it lies deep enough under
 * the land that no snow comes down through its roof.
 *
 * The dungeon (`layDungeon`): rooms laid on a lattice of three metres, joined by corridors as a tree joins them, and a few more for
 * loops; a hall with pillars, store rooms of barrels and crates, bones; torches on the walls, whose light is worked out once for each
 * point of the walls, floors and roofs, and flickers; a chest of gold in the room furthest from the gate. The cave and the dungeon are
 * lit by their torches and the day coming in at the mouth, not by the sun or the sky: only the light carried in (`Cave.lantern`) and the
 * campfire's light fall on them besides.
 *
 * Everything here is in the scene's frame of the run's land (the world's, less the run's top), as the land's own heights are.
 */
import {
  AdditiveBlending, BoxGeometry, TorusGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide,
  DataTexture, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, NearestFilter, PlaneGeometry, PointLight, Quaternion, RepeatWrapping, RGBAFormat,
  type Material, SphereGeometry, SRGBColorSpace, Texture, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, lights, max, mix, normalWorld, positionWorld, select, sin, smoothstep, texture, time, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, valueNoise2 } from '../src/core/rng';
import { type PropKind, Props, type Stuff } from './slopeProps';
import { type Grid, gridAt, type SkiSlice } from '../src/core/skiSlice';
import { kickerReachable } from './slopeLand';
import { Folk } from './slopeFolk';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const UP = new Vector3(0, 1, 0);
/** Nothing drawn: an instance put away. */
const ZERO_M = new Matrix4().makeScale(0, 0, 0);

/** The cave's measures, in metres. */
export const CAVE = {
  /** How far the camp reaches from its middle, levelled; and over how much further the snow comes back to the land's own. */
  campR: 7.5, campBlend: 3.5,
  /** The tunnel: half its breadth at the floor, how high its crown is, how far its rock stands out from that at the most (rough). */
  hw: 2.3, tall: 4.4, rough: 0.7,
  /** How steeply its floor falls (rise over run), and how far it runs level at the mouth and before the gate. */
  grade: 0.3, levelIn: 3, levelOut: 3.5,
  /** The dungeon's lattice: how broad each square is, how many across the tunnel's way and along it; how high its corridors and rooms are. */
  cell: 3, cols: 19, rows: 17, corridor: 3.8, room: 5.4,
  /** How much land at the least lies over any roof, and over the tunnel's where it runs under the snow (whose edges hang down 1.5 m). */
  cover: 2.4, tunnelCover: 2.4,
  /** How far behind the mouth the hole in the snow begins. */
  holeFrom: 1.6,
};
/** How far out the hole in the snow reaches either side of the tunnel's line; and the mound over it, beyond that. */
const HOLE_HALF = CAVE.hw + CAVE.rough + 0.7, MOUND_HALF = HOLE_HALF + 3;

/** Where the cave is: its mouth, the way in, the camp before it, how far down its tunnel goes, and the hole cut for it. */
export interface CaveSite {
  /** Where along the run it is, and on which side (1, its left). */
  s: number; side: number;
  /** The middle of the mouth, on its floor; the way in (level, of length one); and to the left of that way. */
  mouth: { x: number; z: number }; ax: number; az: number;
  /** The floor's height at the mouth (the camp's, levelled), and in the dungeon. */
  y0: number; deep: number;
  /** The camp's middle. */
  camp: { x: number; z: number };
  /** How long the tunnel is, from the mouth to the gate; and how far in the hole in the snow reaches. */
  length: number; holeTo: number;
  /** Where no bank beside the piste would take a cave, the knoll raised for it (`Knoll`). */
  knoll?: Knoll;
}
/** A hill raised in the run's snow: its middle, its long way (along the cave's way in), how far it reaches along that and across it, and how high. */
export interface Knoll { x: number; z: number; ax: number; az: number; along: number; across: number; high: number }
/** How much a knoll raises the snow at a point: most at its middle, none at its rim, smoothly. */
export const knollAt = (k: Knoll, x: number, z: number) => {
  const rx = x - k.x, rz = z - k.z, a = (rx * k.ax + rz * k.az) / k.along, b = (rx * k.az - rz * k.ax) / k.across, e = Math.hypot(a, b);
  return e >= 1 ? 0 : k.high * Math.cos((Math.PI / 2) * e) ** 2;
};
/** A knoll's measures: long along the way in, so that the tunnel is under it soon and stays under it while it goes down. */
export const KNOLL = { along: 22, across: 13, high: 8.5 };

/** A point `t` in along the cave's way from its mouth and `lat` to the left of its line. */
export const sitePoint = (c: CaveSite, t: number, lat: number) => ({ x: c.mouth.x + c.ax * t + c.az * lat, z: c.mouth.z + c.az * t - c.ax * lat });
/** How far in along the cave's way a point is, and how far to the left of its line. */
export const siteLocal = (c: CaveSite, x: number, z: number): [number, number] => {
  const rx = x - c.mouth.x, rz = z - c.mouth.z;
  return [rx * c.ax + rz * c.az, rx * c.az - rz * c.ax];
};
/** The tunnel's floor `t` in from the mouth: level at the mouth, down at the grade, level before the gate (and on in the dungeon). */
export const floorAt = (c: CaveSite, t: number) => {
  const a = CAVE.levelIn, b = c.length - CAVE.levelOut, drop = c.y0 - c.deep;
  if (t <= a) return c.y0;
  if (t >= b) return c.deep;
  // (The slope eased in and out over a metre and a half at either end, as a path is worn.)
  const u = (t - a) / (b - a), e = Math.min(0.4, 1.5 / (b - a)), w = 2 * e * (1 - e);
  const k = u < e ? (u * u) / w : u > 1 - e ? 1 - (1 - u) ** 2 / w : (u - e / 2) / (1 - e);
  return c.y0 - drop * clamp(k, 0, 1);
};

/** The run's line, the piste's edges, and the land's heights, as the slice has them, in the scene's frame. */
export function sliceFrame(slice: SkiSlice) {
  const [ox, oz] = slice.run.points[0], step = slice.run.step;
  const line = slice.run.points.map(([x, z]) => [x - ox, z - oz] as [number, number]), n = line.length;
  const shift = (g: Grid): Grid => ({ ...g, x0: g.x0 - ox, z0: g.z0 - oz });
  const snow = shift(slice.snow), near = shift(slice.near), far = shift(slice.far);
  const height = (x: number, z: number) => {
    let h = gridAt(snow, x, z);
    if (Number.isNaN(h)) h = gridAt(near, x, z);
    if (Number.isNaN(h)) h = gridAt(far, x, z);
    return Number.isNaN(h) ? 0 : h;
  };
  const at = (s: number, left: number) => {
    const k = clamp(Math.floor(s / step), 0, n - 2), t = s / step - k, [ax, az] = line[k], [bx, bz] = line[k + 1], l = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / l, dz = (bz - az) / l, x = ax + dx * t * step, z = az + dz * t * step;
    return { x: x + dz * left, z: z - dx * left, dx, dz };
  };
  const edges = (s: number): [number, number] => {
    const f = clamp(s / step, 0, n - 1), k = Math.min(n - 2, Math.floor(f)), t = f - k, [a, b] = slice.run.piste[k], [c, d] = slice.run.piste[k + 1];
    return [a + (c - a) * t, b + (d - b) * t];
  };
  return { ox, oz, snow, near, far, height, at, edges, length: (n - 1) * step, onSnow: (x: number, z: number) => !Number.isNaN(gridAt(snow, x, z)) };
}

/**
 * Where on `slice`'s run the cave is to be: of the places along the middle fifth of the run, on either side, the way in square to
 * the run or turned up to forty degrees from it, where the camp and the hole fit on the run's own snow, the bank closes over the
 * tunnel soonest, the camp wants the least levelling and the tunnel the least depth; and nearest the run's middle. Where no bank will
 * take one (on most runs the piste is as broad as the snow at a metre, and the land beside it falls away), a knoll is raised for it
 * (asked: "for other runs find suitable spots to add a mound or adjust land shape to accomodate the entrance to the dungeeon"): in the
 * run's snow near the edge of its band, its long way the way in (turned up to sixty degrees, the more up the run the sooner the tunnel
 * is under the land), the mouth in its flank facing the piste, and the piste's edge drawn in to the camp's middle about it. None if
 * neither will do.
 */
export function findSite(slice: SkiSlice, kickers: KickerZone[] = [], awayFrom?: { x: number; z: number }, clear?: (x: number, z: number) => boolean): CaveSite | null {
  return searchSites(slice, false, kickers, awayFrom, clear) ?? searchSites(slice, true, kickers, awayFrom, clear);
}
/**
 * Whether a cave at `site` keeps to ground `clear` says may be had (out of a village, `villageClear` in `slopeVillage.ts`): its camp and
 * the land about it, its mouth, the hole in the snow behind it and a little past, and its knoll, if it has one.
 */
function siteClear(site: CaveSite, clear: (x: number, z: number) => boolean): boolean {
  const c = site.camp, r = CAVE.campR + CAVE.campBlend;
  for (let i = 0; i < 12; i++) { const w = (i / 12) * Math.PI * 2; if (!clear(c.x + Math.cos(w) * r, c.z + Math.sin(w) * r)) return false; }
  if (!clear(c.x, c.z)) return false;
  for (let t = 0; t <= site.holeTo + 6; t += 3) for (const lat of [-MOUND_HALF, 0, MOUND_HALF]) { const p = sitePoint(site, t, lat); if (!clear(p.x, p.z)) return false; }
  const k = site.knoll;
  if (k) for (let i = 0; i < 16; i++) {
    const w = (i / 16) * Math.PI * 2;
    if (!clear(k.x + k.ax * Math.cos(w) * k.along + k.az * Math.sin(w) * k.across, k.z + k.az * Math.cos(w) * k.along - k.ax * Math.sin(w) * k.across)) return false;
  }
  return true;
}
/** Where a kicker stands on a run (along it and across), and how far along from there it and the snow it lands on reach. */
export interface KickerZone { s: number; left: number; reach: number }
/**
 * Whether a point of `on`'s scene keeps clear of `slice`'s kickers and the snow each lands on, by `by` metres: for a cave on another way
 * of a run that parts (`findSite`'s `clear`), where the two ways run side by side and a kicker on one lands on snow the other's cave
 * would be cut into. (Each way's cave had kept clear of its own way's kickers only: on Ashbridge, Ashbridge Bend's cave, moved up the run
 * by its village, levelled its camp and cut its hole where Ashbridge's second kicker lands, and the demo's backflip there landed too
 * hard.)
 */
export function clearOfKickers(slice: SkiSlice, kickers: KickerZone[], on: SkiSlice, by = 6): (x: number, z: number) => boolean {
  const F = sliceFrame(slice), G = sliceFrame(on), pts: [number, number][] = [];
  for (const k of kickers) for (let u = k.s; u <= k.s + k.reach; u += 3) for (const l of [k.left - 6, k.left, k.left + 6]) { const p = F.at(u, l); pts.push([p.x + F.ox - G.ox, p.z + F.oz - G.oz]); }
  return (x, z) => pts.every(([px, pz]) => Math.abs(px - x) > by || Math.abs(pz - z) > by || Math.hypot(px - x, pz - z) > by);
}
/** Whether a cave at `site` keeps clear of a kicker and its landing, across its breadth, as `Cave.keepsClear` keeps kickers clear of it. */
function keptClear(site: CaveSite, k: KickerZone, F: ReturnType<typeof sliceFrame>): boolean {
  const c = site.camp, k_ = site.knoll;
  for (let u = k.s; u <= k.s + k.reach; u += 3) for (const l of [k.left - 6, k.left, k.left + 6]) {
    const p = F.at(u, l), [t, lat] = siteLocal(site, p.x, p.z);
    if (Math.hypot(p.x - c.x, p.z - c.z) < CAVE.campR + CAVE.campBlend + 3) return false;
    if (t > -1.5 && t < site.holeTo + 5 && Math.abs(lat) < MOUND_HALF + 2) return false;
    if (k_ && knollAt({ ...k_, along: k_.along + 3, across: k_.across + 3 }, p.x, p.z) > 0) return false;
  }
  return true;
}
/**
 * The run as a cave's site is looked for on it, before its land is made: how long, its piste's edges, a point along and across it, and
 * where a kicker may stand (`Land.kickable`, as `sliceLand` has it), for where the kickers will stand to be found (`kickerZones` in `slope.ts`).
 */
export function sliceGround(slice: SkiSlice) {
  const F = sliceFrame(slice), h = (u: number, l: number) => { const p = F.at(u, l); return F.height(p.x, p.z); };
  return {
    length: F.length, edges: F.edges,
    kickable: (s: number, left: number, kick: number) => {
      if (s + kick + 40 > F.length - 30) return false;
      if (!kickerReachable(F.at, F.height, s, kick)) return false;
      const fallAfter = (h(s + kick + 4, left) - h(s + kick + 30, left)) / 26, fallOn = (h(s, left) - h(s + kick, left)) / kick, tilt = Math.abs(h(s + kick / 2, left - 3) - h(s + kick / 2, left + 3)) / 6;
      return fallAfter > Math.tan((13 * Math.PI) / 180) && fallOn < Math.tan((30 * Math.PI) / 180) && fallOn > Math.tan((5 * Math.PI) / 180) && tilt < 0.2;
    },
  };
}
/**
 * The best site along a run, about halfway down it. Given `awayFrom` (the mouth of the cave on the way it parts from), anywhere from a
 * quarter to three quarters of the way down, as far from that one as a good site may be (asked: "spread them apart": the cave on Ashbridge
 * Bend had stood halfway down it, where it still runs beside Ashbridge, some eighty metres from Ashbridge's own).
 */
function searchSites(slice: SkiSlice, raise: boolean, kickers: KickerZone[], awayFrom?: { x: number; z: number }, clear?: (x: number, z: number) => boolean): CaveSite | null {
  const F = sliceFrame(slice), L = F.length, [from, to] = awayFrom ? [0.25, 0.75] : [0.4, 0.6];
  let best: { site: CaveSite; score: number } | null = null;
  for (let s = from * L; s <= to * L; s += raise ? 8 : 5) {
    const [lo, hi] = F.edges(s);
    for (const side of [1, -1]) {
      const edge = side > 0 ? hi : lo, other = side > 0 ? lo : hi, f = F.at(s, 0), lx = f.dz * side, lz = -f.dx * side;
      for (const turn of raise ? [-60, -40, -20, 0, 20, 40, 60] : [-40, -20, 0, 20, 40]) {
        const a = (turn * Math.PI) / 180, ax = lx * Math.cos(a) + f.dx * Math.sin(a), az = lz * Math.cos(a) + f.dz * Math.sin(a);
        for (const inset of raise ? [4, 9] : [0]) {
          let mouth: { x: number; z: number }, knoll: Knoll | undefined;
          if (raise) {
            // (The knoll as far out in the band as it fits, with `inset` metres to spare; the mouth on its flank, a little over halfway out.)
            const k = F.at(s, side * (slice.half - inset - KNOLL.across)), along = KNOLL.along;
            knoll = { x: k.x, z: k.z, ax, az, ...KNOLL };
            let fits = true;
            for (let i = 0; i < 24 && fits; i++) {
              const w = (i / 24) * Math.PI * 2, px = k.x + (ax * Math.cos(w) * along + az * Math.sin(w) * KNOLL.across) * 1.05, pz = k.z + (az * Math.cos(w) * along - ax * Math.sin(w) * KNOLL.across) * 1.05;
              if (!F.onSnow(px, pz)) fits = false;
            }
            if (!fits) continue;
            mouth = { x: k.x - ax * along * 0.62, z: k.z - az * along * 0.62 };
          } else { const m = F.at(s, edge + side * 2.5); mouth = { x: m.x, z: m.z }; }
          const H = knoll ? (x: number, z: number) => F.height(x, z) + knollAt(knoll!, x, z) : F.height;
          const site: CaveSite = { s, side, mouth, ax, az, y0: 0, deep: 0, camp: { x: 0, z: 0 }, length: 20, holeTo: 0, knoll };
          const tried = trySite(F, site, H);
          if (!tried) continue;
          // (Clear of every kicker and the snow it lands on; and of a village, if the run has one.)
          if (kickers.some((k) => !keptClear(site, k, F)) || (clear && !siteClear(site, clear))) continue;
          const apart = awayFrom ? 0.08 * Math.min(400, Math.hypot(site.mouth.x - awayFrom.x, site.mouth.z - awayFrom.z)) : 0;
          const score = tried - 25 * Math.abs(s / L - 0.5) - 0.02 * Math.abs(turn) + apart;
          if (!best || score > best.score) best = { site: { ...site, mouth: { ...site.mouth }, camp: { ...site.camp } }, score };
        }
      }
    }
  }
  return best?.site ?? null;
}
/**
 * Whether a cave will go at `site` (its mouth and its way in given) over the land `H`: the camp before the mouth and the land about the
 * mouth on the run's own snow, the tunnel under the land a few metres in and all the way after, and the dungeon not too deep; its camp's
 * height, how deep the dungeon is and how far in the hole reaches, set on it. Gives back how well it goes (more, better), or none.
 */
export function trySite(F: ReturnType<typeof sliceFrame>, site: CaveSite, H: (x: number, z: number) => number): number | null {
  const P = (t: number, lat: number) => sitePoint(site, t, lat), Hs = (t: number, lat: number) => { const p = P(t, lat); return H(p.x, p.z); };
  const c = P(-(CAVE.campR - 0.5), 0);
  site.camp = { x: c.x, z: c.z };
  // (The camp and the land about the mouth on the run's own snow, within its band.)
  let sum = 0;
  const heights: number[] = [];
  for (let u = -CAVE.campR - 3; u <= CAVE.campR + 3; u += 1.5) for (let v = -CAVE.campR - 3; v <= CAVE.campR + 3; v += 1.5) {
    const x = c.x + u, z = c.z + v;
    if (!F.onSnow(x, z)) return null;
    if (u * u + v * v <= CAVE.campR * CAVE.campR) heights.push(H(x, z));
  }
  heights.sort((p, q) => p - q);
  site.y0 = heights[heights.length >> 1];
  for (const h of heights) sum += Math.abs(h - site.y0);
  const levelling = sum / heights.length;
  // (The hole, the mound over it and its border on the run's snow: looked at first, being quickest.)
  for (let t = -2; t <= 10; t += 1) for (let lat = -MOUND_HALF - 2; lat <= MOUND_HALF + 2; lat += 1) { const p = P(t, lat); if (!F.onSnow(p.x, p.z)) return null; }
  // (How deep the dungeon lies, and so how long the tunnel down to it is: found again as the tunnel's length moves the dungeon.)
  for (let k = 0; k < 5; k++) {
    let least = Infinity;
    for (let t = site.length; t <= site.length + CAVE.rows * CAVE.cell; t += 2) for (let lat = -CAVE.cols * CAVE.cell / 2; lat <= CAVE.cols * CAVE.cell / 2; lat += 2) least = Math.min(least, Hs(t, lat));
    site.deep = Math.min(site.y0 - 2.5, least - CAVE.room - CAVE.cover);
    site.length = CAVE.levelIn + (site.y0 - site.deep) / CAVE.grade + CAVE.levelOut;
  }
  if (site.y0 - site.deep > 20) return null;
  // (How far in the tunnel comes under the snow, with the snow's hanging edge clear of its roof: from there on all the way.)
  const clear = (t: number) => {
    const roof = floorAt(site, t) + CAVE.tall + CAVE.rough + CAVE.tunnelCover;
    for (const lat of [-HOLE_HALF - 1, -HOLE_HALF / 2, 0, HOLE_HALF / 2, HOLE_HALF + 1]) if (Hs(t, lat) < roof) return false;
    return true;
  };
  let holeTo = site.length;
  for (let t = site.length; t >= CAVE.holeFrom; t -= 0.5) { if (!clear(t)) break; holeTo = t; }
  if (holeTo >= site.length - 1 || holeTo > 16) return null;
  site.holeTo = Math.max(CAVE.holeFrom + 1, holeTo + 1);
  for (let t = 10; t <= site.holeTo + 4; t += 1) for (let lat = -MOUND_HALF - 2; lat <= MOUND_HALF + 2; lat += 1) { const p = P(t, lat); if (!F.onSnow(p.x, p.z)) return null; }
  return -3 * levelling - 0.8 * site.holeTo - 0.25 * (site.y0 - site.deep);
}

// ------------------------------------------------------------------------------------------------------- the snow levelled and cut

/** The land under the cave as it lay before the hole was cut through it (the camp levelled): what the mound is laid over. */
export type BaseHeight = (x: number, z: number) => number;

/**
 * Lays the camp level and cuts the hole behind the mouth, in `slice`'s own lattices, before its land is made from them: the camp's
 * snow brought to the mouth's height over its reach and back to the land's own over a few metres more, and the same under the mouth
 * and the tunnel's first metres (the apron); then no snow at all where the tunnel is too near the surface (`holeTo`), in the snow at a
 * metre and in the land at four under it, so that neither is drawn there. Gives back the land's height as it was before the hole.
 */
export function carve(slice: SkiSlice, site: CaveSite): BaseHeight {
  const F = sliceFrame(slice), { snow, near, far } = F;
  // (A raised knoll first, into the snow at a metre and the land at four under it; and the piste's edge drawn in to the camp about it,
  // eased over eighty metres either way.)
  const k = site.knoll;
  if (k) {
    for (const g of [snow, near]) for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
      if (Math.abs(x - k.x) > k.along + 2 || Math.abs(z - k.z) > k.along + 2) continue;
      const n = j * g.nx + i;
      if (!Number.isNaN(g.data[n])) g.data[n] += knollAt(k, x, z);
    }
  }
  const level = (g: Grid, k: number, x: number, z: number) => {
    const [t, lat] = siteLocal(site, x, z), dc = Math.hypot(x - site.camp.x, z - site.camp.z);
    const camp = 1 - smooth((dc - CAVE.campR) / CAVE.campBlend);
    const out = Math.max(t - (CAVE.holeFrom + 0.6), -t - CAVE.campR, Math.abs(lat) - (HOLE_HALF - 0.2));
    const w = Math.max(camp, 1 - smooth(out / 2.5));
    if (w > 0 && !Number.isNaN(g.data[k])) g.data[k] += (site.y0 - g.data[k]) * w;
  };
  const each = (g: Grid, reach: number, f: (k: number, x: number, z: number) => void) => {
    const c = sitePoint(site, (site.holeTo - CAVE.campR * 2) / 2, 0), r = reach;
    const i0 = Math.max(0, Math.floor((c.x - r - g.x0) / g.cell)), i1 = Math.min(g.nx - 1, Math.ceil((c.x + r - g.x0) / g.cell));
    const j0 = Math.max(0, Math.floor((c.z - r - g.z0) / g.cell)), j1 = Math.min(g.nz - 1, Math.ceil((c.z + r - g.z0) / g.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(j * g.nx + i, g.x0 + i * g.cell, g.z0 + j * g.cell);
  };
  const reach = CAVE.campR * 2 + site.holeTo + 12;
  each(snow, reach, (k, x, z) => level(snow, k, x, z));
  // (The land at four metres under the snow levelled as well, so that the land as it was, read from it where the snow is cut, is the
  // camp's.)
  each(near, reach, (k, x, z) => level(near, k, x, z));
  const was = { snow: { ...snow, data: snow.data.slice() }, near: { ...near, data: near.data.slice() } };
  const inHole = (x: number, z: number) => { const [t, lat] = siteLocal(site, x, z); return t >= CAVE.holeFrom && t <= site.holeTo && Math.abs(lat) <= HOLE_HALF; };
  each(snow, reach, (k, x, z) => { if (inHole(x, z)) snow.data[k] = NaN; });
  // (The run's snow drawn from far off takes every fourth point: where one is inside the hole with the hole all about it, it is kept,
  // sunk well under the mound, so that the snow from far off is cut only at the hole's edge and not, a square of four metres about each
  // point left out, wider than the mound. The snow at a metre draws nothing about it, every point next to it being none.)
  each(snow, reach, (k, x, z) => {
    const i = k % snow.nx, j = (k / snow.nx) | 0;
    if (i % 4 || j % 4 || !inHole(x, z)) return;
    for (const [a, b] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) if (!inHole(x + a * snow.cell, z + b * snow.cell)) return;
    snow.data[k] = was.snow.data[k] - 4;
  });
  each(near, reach, (k, x, z) => { if (inHole(x, z)) near.data[k] = NaN; });
  return (x, z) => {
    let h = gridAt(was.snow, x, z);
    if (Number.isNaN(h)) h = gridAt(was.near, x, z);
    if (Number.isNaN(h)) h = gridAt(far, x, z);
    return Number.isNaN(h) ? site.y0 : h;
  };
}

// ---------------------------------------------------------------------------------------------------------------- the dungeon laid

type RoomKind = 'gate' | 'hall' | 'store' | 'crypt' | 'ossuary' | 'shrine' | 'tomb' | 'library' | 'sanctum' | 'cell' | 'guard' | 'warden' | 'vault' | 'hoard' | 'hidden';
/** A doorway: an open arch, a door standing open, a portcullis drawn up; or a way into a hidden room behind a cracked wall (`plotDungeon`). */
type DoorKind = 'arch' | 'door' | 'portcullis' | 'secret';
/** A room: its squares, what it is, which level it is on (0 the gate's, -1 the one below), and what is said of it as it is come into. */
interface Room { c0: number; r0: number; w: number; h: number; kind: RoomKind; level: number; note: string }
/** A doorway, at the end of corridor square (c, r) where it opens toward (dc, dr) into a room. */
interface Door { c: number; r: number; dc: number; dr: number; kind: DoorKind }
/**
 * The dungeon on its lattice of `cols` by `rows` squares (`entry` the column the corridor from the gate comes in at): each square
 * solid (0), corridor (1) or room (2); its floor's height over the gate's (a stair's at its high and its low end, and which way it goes
 * down, `down`, -1 where none); how high its roof is over the gate's floor; its rooms and doorways; how far each square is from the
 * gate; the tags it was made by; and the dungeon's name, and what kind of place it is.
 */
interface Layout {
  cols: number; rows: number; entry: number; tags: Tags;
  cells: Uint8Array; rooms: Room[]; roomAt: Int16Array; far: Int16Array;
  floor: Float32Array; low: Float32Array; down: Int8Array; top: Float32Array;
  doors: Door[]; name: string; about: string;
  /** Whose the place was: who the last room is the tomb, the sanctum, the hoard of (and who its ghost is, `plotDungeon`). */
  who: string;
  /** The way out to the deeps (`slopeDeeps.ts`), where it has one: the square at the lattice's edge it goes out of, and which way. */
  exit?: { c: number; r: number; dc: number; dr: number };
}
/** How far each level below lies under the one above; and the ways out of a square, by number (as `Layout.down`). */
const DROP = 2.6, WAYS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * The tags a dungeon is made by, as One Page Dungeon's are (watabou's generator; asked: "the dungeon generator uses the tags similar to
 * the inspiration source? can we create different kind of layouts with tags?"): how big it is; how its rooms are laid out; whether it
 * goes down a level; and what kind of place it is.
 */
export const TAGS = {
  size: ['small', 'medium', 'large'],
  layout: ['ordered', 'winding', 'chaotic', 'compact'],
  levels: ['flat', 'multi-level'],
  theme: ['tomb', 'temple', 'prison', 'vault'],
} as const;
export type Tags = { [K in keyof typeof TAGS]: (typeof TAGS)[K][number] };
/**
 * A dungeon's tags: those asked for (any of `TAGS`, in any order), and for the rest one each by chance (`rng`), small more often than
 * not (asked: "I think for these within slope dungeons the tag small is best fit"), and two levels more often than one.
 */
export function tagsFor(rng: Rng, asked: string[] = []): Tags {
  const odds: { [K in keyof Tags]: number[] } = { size: [0.55, 0.32, 0.13], layout: [1, 1, 1, 1], levels: [0.35, 0.65], theme: [1, 1, 1, 1] };
  const pick = <K extends keyof Tags>(k: K): Tags[K] => {
    const all = TAGS[k] as readonly string[], chosen = asked.find((a) => all.includes(a));
    if (chosen) return chosen as Tags[K];
    const w = odds[k], sum = w.reduce((a, b) => a + b, 0), r = rng.fork(k).next() * sum;
    let i = 0, acc = w[0];
    while (r > acc && i < all.length - 1) acc += w[++i];
    return all[i] as Tags[K];
  };
  return { size: pick('size'), layout: pick('layout'), levels: pick('levels'), theme: pick('theme') };
}

/** Each size: the lattice it is laid on (the largest is what the cave is dug deep enough for, `CAVE`), how many rooms, how many stairs down. */
const SIZES: Record<Tags['size'], { cols: number; rows: number; rooms: [number, number]; stairs: number }> = {
  small: { cols: 15, rows: 13, rooms: [5, 7], stairs: 1 },
  medium: { cols: 17, rows: 15, rooms: [8, 10], stairs: 1 },
  large: { cols: CAVE.cols, rows: CAVE.rows, rooms: [11, 13], stairs: 2 },
};
/**
 * Each layout: its rooms' sizes (squares across and along, by chance among them); how often a room is set off the last one laid rather
 * than any; how often it goes on the way its parent was come into, and is set square on the corridor's end (ordered); how long its
 * corridors are; and how many more corridors are cut between rooms that face each other, for ways round.
 */
const LAYOUTS: Record<Tags['layout'], { sizes: [number, number][]; last: number; straight: number; square: boolean; len: [number, number]; loops: number }> = {
  ordered: { sizes: [[3, 3], [3, 2], [2, 3], [4, 3], [3, 4]], last: 0.7, straight: 0.65, square: true, len: [1, 2], loops: 1 },
  winding: { sizes: [[2, 2], [2, 3], [3, 2], [3, 3]], last: 0.9, straight: 0.25, square: false, len: [3, 5], loops: 0 },
  chaotic: { sizes: [[2, 2], [2, 4], [4, 2], [3, 5], [5, 3], [2, 3], [4, 4], [3, 2]], last: 0.3, straight: 0, square: false, len: [1, 4], loops: 3 },
  compact: { sizes: [[2, 2], [3, 3], [2, 3], [3, 2], [4, 3]], last: 0.5, straight: 0, square: false, len: [1, 1], loops: 2 },
};
/**
 * Each theme: what it is called, and what its places are called; what its rooms are (dealt in turn), its last room (the furthest from
 * the gate, where the chest is), and whether its largest room is a pillared hall; how often a doorway is an arch, a door, a portcullis;
 * and the small rooms it would rather have (a prison's cells).
 */
const THEMES: Record<Tags['theme'], { noun: string; places: string[]; kinds: RoomKind[]; last: RoomKind; hall: boolean; doors: [number, number, number]; small: number }> = {
  tomb: { noun: 'tomb', places: ['Barrow', 'Tomb', 'Crypt', 'Catacombs'], kinds: ['crypt', 'ossuary', 'shrine', 'store', 'crypt'], last: 'tomb', hall: true, doors: [0.45, 0.4, 0.15], small: 0 },
  temple: { noun: 'temple', places: ['Temple', 'Sanctuary', 'Undercroft', 'Shrine'], kinds: ['shrine', 'library', 'crypt', 'store', 'library', 'shrine'], last: 'sanctum', hall: true, doors: [0.6, 0.35, 0.05], small: 0 },
  prison: { noun: 'prison', places: ['Gaol', 'Dungeons', 'Oubliette', 'Prison'], kinds: ['guard', 'store', 'ossuary', 'guard'], last: 'warden', hall: false, doors: [0.2, 0.3, 0.5], small: 0.6 },
  vault: { noun: 'vault', places: ['Vault', 'Treasury', 'Strongroom', 'Hoard'], kinds: ['vault', 'store', 'guard', 'vault', 'store'], last: 'hoard', hall: true, doors: [0.25, 0.35, 0.4], small: 0 },
};
/** What is said of each kind of room as it is come into. */
const LINES: Record<RoomKind, string[]> = {
  gate: ['An antechamber, cut square; the air still and cold', 'An antechamber; old soot on its roof from torches long burnt'],
  hall: ['A hall of pillars, their capitals worn smooth', 'A pillared hall, frost on its flagstones'],
  store: ['A storeroom: barrels and crates, long rotted', 'Stores stacked in a cold room'],
  crypt: ['A crypt: stone coffins, their lids cracked', 'A crypt, its dead laid out in rows'],
  ossuary: ['An ossuary: bones heaped along the walls', 'Bones and skulls, sorted and stacked'],
  shrine: ['A shrine: candles burning on its altar, lit by no one', 'A shrine, and a statue watching its altar'],
  library: ['A library: shelves of books swollen with damp', 'Scrolls and books, and a reading table'],
  cell: ['A cell, barely wide enough to lie down in', 'A cell; scratches on the wall, counting days'],
  guard: ['A guardroom: a table, and stores for a watch long gone', 'Where the guards kept their watch'],
  vault: ['A vault: chests and crates, coins spilled from one', 'A strongroom, gold glinting on its floor'],
  tomb: ['The tomb of WHO: a great coffin, and a chest before it'],
  sanctum: ['The sanctum of WHO: an altar, and a chest of offerings before it'],
  warden: ["The warden's room: WHO's desk, and the chest of what was taken"],
  hoard: ['The hoard of WHO: gold heaped about a chest'],
  hidden: ['A hidden room, its air stale and still: no one has stood here in an age', 'A room walled up and forgotten, and what was hidden in it'],
};
const NAMES = ['Aldric', 'Morwen', 'Hrothgar', 'Isolde', 'Cenric', 'Edda', 'Thorvald', 'Brannoc', 'Wulfhild', 'Osric', 'Sigrun', 'Eadmund'];
const EPITHETS = ['the Pale', 'the Unbowed', 'Frostborn', 'the Silent', 'the Grey', 'the Hollow-Eyed', 'the Last', 'Oathbreaker', 'of the Long Winter'];

/**
 * The dungeon's rooms and corridors (`rng`), grown as One Page Dungeon grows one, by its tags (`tagsFor`): from an antechamber inside
 * the gate, room after room set off an earlier one (as the layout has it, most often the last), down a straight corridor from a
 * doorway in one of its sides, wherever it and its corridor fit in solid rock with a square of rock about them, so that no room or
 * corridor runs into another; as many rooms as its size has, a tree of them as the generator's are, with as many corridors cut after
 * between rooms that face each other as the layout has loops. A multi-level one goes down by a stair, from the deepest level yet, to a
 * level below (twice, if large); every room beyond a stair is on its level. Each doorway an arch, a door standing open, or a portcullis
 * drawn up, as the theme has them; the last room, the furthest from the gate, behind a portcullis, with the chest; of the rest, the
 * largest a hall of pillars (if the theme has one), the others what the theme deals, a prison's small rooms cells. The place named, and
 * each room given a line to say of it. (Grown again, from the next of its random numbers, until it has as many stairs as asked and some
 * rooms besides the antechamber.)
 */
export function layDungeon(rng: Rng, tags: Tags): Layout {
  const want = tags.levels === 'flat' ? 0 : SIZES[tags.size].stairs;
  let laid = growDungeon(rng.fork('try 0'), tags);
  for (let i = 1; i < 60 && (stairsOf(laid) < want || laid.rooms.length < 4); i++) laid = growDungeon(rng.fork(`try ${i}`), tags);
  return laid;
}
const stairsOf = (l: Layout) => -Math.min(0, ...l.rooms.map((r) => r.level));
/**
 * A way out of a dungeon to the deeps (`slopeDeeps.ts`), cut after it is grown: a straight corridor from a side of a room on its lowest
 * level (or, none fitting there, the next up) out to the lattice's edge, through solid rock with rock either side of it, never out of
 * its front, where the gate is; of those, the one pointing most nearly `toward` (across, along: the way to the other dungeon), and of
 * those the shortest. None if none fits.
 */
function cutDeepDoor(l: Layout, toward: [number, number]) {
  const { cols, rows, cells } = l, at = (c: number, r: number) => r * cols + c, solid = (c: number, r: number) => c < 0 || r < 0 || c >= cols || r >= rows || !cells[at(c, r)];
  const tl = Math.hypot(toward[0], toward[1]) || 1, levels = [...new Set(l.rooms.map((q) => q.level))].sort((a, b) => a - b);
  for (const level of levels) {
    let best: { hall: [number, number][]; room: Room; dc: number; dr: number; score: number } | null = null;
    for (const room of l.rooms) {
      if (room.level !== level || room.kind === 'gate') continue;
      for (const [dc, dr] of WAYS) {
        if (dr === -1) continue;
        const c = dc ? (dc > 0 ? room.c0 + room.w : room.c0 - 1) : room.c0 + (room.w >> 1), r = dr ? room.r0 + room.h : room.r0 + (room.h >> 1), hall: [number, number][] = [];
        for (let i = c, j = r; i >= 0 && j >= 0 && i < cols && j < rows; i += dc, j += dr) hall.push([i, j]);
        if (!hall.length || !hall.every(([i, j]) => solid(i, j) && solid(i + dr, j + dc) && solid(i - dr, j - dc))) continue;
        const score = ((dc * toward[0] + dr * toward[1]) / tl) * 10 - hall.length;
        if (!best || score > best.score) best = { hall, room, dc, dr, score };
      }
    }
    if (!best) continue;
    const y = best.room.level * DROP;
    for (const [i, j] of best.hall) { const k = at(i, j); cells[k] = 1; l.floor[k] = l.low[k] = y; l.top[k] = y + CAVE.corridor; }
    const [c0, r0] = best.hall[0], [c1, r1] = best.hall[best.hall.length - 1];
    l.doors.push({ c: c0, r: r0, dc: -best.dc, dr: -best.dr, kind: 'arch' });
    l.exit = { c: c1, r: r1, dc: best.dc, dr: best.dr };
    return;
  }
}
/**
 * What a dungeon is made to be gone through by, laid over its rooms once they are grown (asked: "how can we have these for our Grand
 * Horse Mountain dungeons?" — of a great dungeon's loops and shortcuts, its locked ways, its secrets, its traps and set pieces): the
 * last room's ways in shut (`locked`) until the key is found in another room (`key`), on one who came before; a door on a way round
 * barred from its far side (`barred`, the side further from the gate once it is shut), to be opened from there on the way back as a
 * short way out; a small room cut off one, walled up behind a cracked wall (`secret`); plates in the passages that loose darts from
 * the wall (`traps`); and the rooms given over to what is in them: one flooded, one under a crack in the roof where the day comes
 * down, one with three cold braziers to be lit in order (`puzzle`), one with someone left captive in it. Each by its own stream of
 * chance (`rng`), so that the dungeons grown before keep every room and prop they had. (Indices are into the layout's rooms and
 * doors; -1, or none, where nothing fitted.)
 */
export interface Plot {
  last: number; locked: number[]; key: number;
  barred: { door: number; from: 1 | -1 } | null;
  secret: { room: number; door: number; cells: number[] } | null;
  traps: { c: number; r: number; dc: number; dr: number }[];
  flooded: number; shaft: number; puzzle: number; captive: number;
}
export function plotDungeon(l: Layout, rng: Rng): Plot {
  const { cols, rows, cells } = l, at = (c: number, r: number) => r * cols + c;
  const inside = (c: number, r: number) => c >= 1 && r >= 1 && c < cols - 1 && r < rows - 1;
  const solid = (c: number, r: number) => c < 0 || r < 0 || c >= cols || r >= rows || !cells[at(c, r)];
  const last = l.rooms.findIndex((r) => r.kind === 'tomb' || r.kind === 'sanctum' || r.kind === 'warden' || r.kind === 'hoard');
  const plot: Plot = { last, locked: [], key: -1, barred: null, secret: null, traps: [], flooded: -1, shaft: -1, puzzle: -1, captive: -1 };
  const ex = l.exit, exitDoor = ex ? l.doors.length - 1 : -1;

  // ---- The hidden room: two squares by two (or one by two), down a corridor of one or two squares off a room's side, in solid rock
  // with rock about it, as the generator sets its rooms; never off the antechamber or the last room.
  const sr = rng.fork('secret');
  for (let tries = 0; tries < 400 && !plot.secret; tries++) {
    const pi = sr.int(1, l.rooms.length - 1), parent = l.rooms[pi];
    if (pi === last || parent.kind === 'gate') continue;
    const [dc, dr] = WAYS[sr.int(0, 3)], len = sr.int(1, 2), [w, h] = sr.pick([[2, 2], [2, 1], [1, 2]] as [number, number][]);
    const across = dc ? sr.int(parent.r0, parent.r0 + parent.h - 1) : sr.int(parent.c0, parent.c0 + parent.w - 1);
    const sc = dc ? (dc > 0 ? parent.c0 + parent.w : parent.c0 - 1) : across, sr0 = dr ? (dr > 0 ? parent.r0 + parent.h : parent.r0 - 1) : across;
    const ec = sc + dc * len, er = sr0 + dr * len;
    const c0 = dc ? (dc > 0 ? ec : ec - w + 1) : ec - sr.int(0, w - 1), r0 = dr ? (dr > 0 ? er : er - h + 1) : er - sr.int(0, h - 1);
    const hall: [number, number][] = Array.from({ length: len }, (_, i) => [sc + dc * i, sr0 + dr * i]);
    let fits = hall.every(([c, r]) => inside(c, r) && solid(c, r) && solid(c + dr, r + dc) && solid(c - dr, r - dc));
    for (let j = r0 - 1; j <= r0 + h && fits; j++) for (let i = c0 - 1; i <= c0 + w && fits; i++) if (!solid(i, j) || (i >= c0 && i < c0 + w && j >= r0 && j < r0 + h && !inside(i, j))) fits = false;
    // (Not where the way out to the deeps would come through it.)
    if (!fits) continue;
    const y = parent.level * DROP, out: number[] = [];
    for (const [c, r] of hall) { const k = at(c, r); cells[k] = 1; l.floor[k] = l.low[k] = y; l.top[k] = y + CAVE.corridor; out.push(k); }
    const room: Room = { c0, r0, w, h, kind: 'hidden', level: parent.level, note: '' };
    l.rooms.push(room);
    for (let j = r0; j < r0 + h; j++) for (let i = c0; i < c0 + w; i++) { const k = at(i, j); cells[k] = 2; l.roomAt[k] = l.rooms.length - 1; l.floor[k] = l.low[k] = y; l.top[k] = y + CAVE.room; out.push(k); }
    room.note = `${parent.level < 0 ? 'Below: ' : ''}${sr.pick(LINES.hidden)}`;
    l.doors.push({ c: sc, r: sr0, dc: -dc, dr: -dr, kind: 'secret' });
    l.doors.push({ c: ec - dc, r: er - dr, dc, dr, kind: 'arch' });
    plot.secret = { room: l.rooms.length - 1, door: l.doors.length - 2, cells: out };
  }

  // ---- The last room's ways in, locked; but never the way out to the deeps, by which one may come in from the other dungeon.
  const intoRoom = (d: Door) => l.roomAt[at(d.c + d.dc, d.r + d.dr)];
  if (last >= 0) l.doors.forEach((d, i) => { if (i !== exitDoor && d.kind !== 'secret' && intoRoom(d) === last) { plot.locked.push(i); d.kind = 'portcullis'; } });
  /** How far each square is from the gate with these doorways shut (crossed neither way). */
  const reach = (shut: number[]) => {
    const far = new Int16Array(cols * rows).fill(-1), q = [l.entry], blocked = new Set<string>();
    for (const i of shut) { const d = l.doors[i]; blocked.add(`${d.c},${d.r},${d.dc},${d.dr}`); blocked.add(`${d.c + d.dc},${d.r + d.dr},${-d.dc},${-d.dr}`); }
    far[l.entry] = 0;
    for (let n = 0; n < q.length; n++) {
      const k = q[n], c = k % cols, r = (k / cols) | 0;
      for (const [dc, dr] of WAYS) { const i = c + dc, j = r + dr; if (solid(i, j) || far[at(i, j)] >= 0 || blocked.has(`${c},${r},${dc},${dr}`)) continue; far[at(i, j)] = far[k] + 1; q.push(at(i, j)); }
    }
    return far;
  };
  const always = [...plot.locked, ...(plot.secret ? [plot.secret.door] : [])], open = reach(always);
  const middle = (r: Room) => at(r.c0 + (r.w >> 1), r.r0 + (r.h >> 1));
  // (The key in a room come to with the last one shut, among the furthest from the gate of those: one has to go looking for it.)
  if (plot.locked.length) {
    const can = l.rooms.map((r, i) => i).filter((i) => i !== last && l.rooms[i].kind !== 'gate' && l.rooms[i].kind !== 'hidden' && open[middle(l.rooms[i])] >= 0)
      .sort((a, b) => open[middle(l.rooms[b])] - open[middle(l.rooms[a])]);
    if (can.length) plot.key = can[rng.fork('key').int(0, Math.max(0, Math.ceil(can.length / 2) - 1))];
    else { for (const i of plot.locked) l.doors[i].kind = 'portcullis'; plot.locked = []; }
  }

  // ---- The barred door: on a way round, so that shutting it leaves every room still to be come to; of those, the one across which the
  // way round is longest, so that opening it from its far side is a real short way back. Barred from that side.
  const count = (f: Int16Array) => f.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0), all = count(open);
  let best: { door: number; from: 1 | -1; gain: number } | null = null;
  l.doors.forEach((d, i) => {
    if (always.includes(i) || i === exitDoor || d.kind === 'secret') return;
    const f = reach([...always, i]);
    if (count(f) !== all) return;
    const a = f[at(d.c, d.r)], b = f[at(d.c + d.dc, d.r + d.dr)], gain = Math.abs(a - b);
    if (gain >= 6 && (!best || gain > best.gain)) best = { door: i, from: b > a ? 1 : -1, gain };
  });
  if (best) { const b = best as { door: number; from: 1 | -1 }; plot.barred = { door: b.door, from: b.from }; l.doors[b.door].kind = 'door'; }

  // ---- Traps: plates in straight passages with rock either side, some way in from the gate, apart from one another and from doorways.
  const tr = rng.fork('traps'), doorCells = new Set(l.doors.map((d) => at(d.c, d.r))), want = { small: 1, medium: 2, large: 3 }[l.tags.size];
  const spots: { c: number; r: number; dc: number; dr: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = at(c, r);
    if (cells[k] !== 1 || l.down[k] >= 0 || l.far[k] < 3 || doorCells.has(k) || plot.secret?.cells.includes(k)) continue;
    const alongR = !solid(c, r - 1) && !solid(c, r + 1) && solid(c - 1, r) && solid(c + 1, r), alongC = !solid(c - 1, r) && !solid(c + 1, r) && solid(c, r - 1) && solid(c, r + 1);
    if (alongR) spots.push({ c, r, dc: tr.chance(0.5) ? 1 : -1, dr: 0 }); else if (alongC) spots.push({ c, r, dc: 0, dr: tr.chance(0.5) ? 1 : -1 });
  }
  for (let i = 0; i < 40 && plot.traps.length < want && spots.length; i++) {
    const s = spots[tr.int(0, spots.length - 1)];
    if (plot.traps.some((t) => Math.abs(t.c - s.c) + Math.abs(t.r - s.r) < 4)) continue;
    plot.traps.push(s);
  }

  // ---- The rooms given over: flooded (more often in a tomb or a temple, and below), the crack of day (on the gate's level), the
  // braziers (a room of six squares or more, not the hall), the captive (a cell, if a prison, else a store or a crypt).
  const free = (i: number) => i !== last && i !== plot.key && l.rooms[i].kind !== 'gate' && l.rooms[i].kind !== 'hidden' && l.rooms[i].kind !== 'hall';
  const rooms = l.rooms.map((_, i) => i), sets = rng.fork('rooms'), theme = l.tags.theme;
  const wet = rooms.filter((i) => free(i) && l.rooms[i].w * l.rooms[i].h >= 4).sort((a, b) => l.rooms[a].level - l.rooms[b].level);
  if (wet.length && sets.chance(theme === 'tomb' || theme === 'temple' ? 0.6 : 0.35)) plot.flooded = sets.chance(0.6) ? wet[0] : sets.pick(wet);
  const lit = rooms.filter((i) => free(i) && i !== plot.flooded && l.rooms[i].level === 0);
  if (lit.length && sets.chance(0.65)) plot.shaft = sets.pick(lit);
  const big = rooms.filter((i) => free(i) && i !== plot.flooded && i !== plot.shaft && l.rooms[i].w * l.rooms[i].h >= 6);
  if (big.length && sets.chance(0.75)) plot.puzzle = sets.pick(big);
  const held = rooms.filter((i) => free(i) && i !== plot.flooded && i !== plot.puzzle && (theme === 'prison' ? l.rooms[i].kind === 'cell' || l.rooms[i].kind === 'guard' : ['store', 'crypt', 'library', 'cell', 'guard', 'vault'].includes(l.rooms[i].kind)));
  if (held.length && sets.chance(theme === 'prison' ? 0.9 : 0.5)) plot.captive = sets.pick(held);
  return plot;
}

function growDungeon(rng: Rng, tags: Tags): Layout {
  const size = SIZES[tags.size], plan = LAYOUTS[tags.layout], theme = THEMES[tags.theme], COLS = size.cols, ROWS = size.rows, ENTRY = COLS >> 1;
  const n = COLS * ROWS, cells = new Uint8Array(n), roomAt = new Int16Array(n).fill(-1), floor = new Float32Array(n), low = new Float32Array(n), down = new Int8Array(n).fill(-1);
  const rooms: Room[] = [], doors: Door[] = [], cameFrom: number[] = [];
  const at = (c: number, r: number) => r * COLS + c, inside = (c: number, r: number) => c >= 1 && r >= 1 && c < COLS - 1 && r < ROWS - 1;
  const solid = (c: number, r: number) => c < 0 || r < 0 || c >= COLS || r >= ROWS || !cells[at(c, r)];
  const add = (room: Room) => { rooms.push(room); for (let j = room.r0; j < room.r0 + room.h; j++) for (let i = room.c0; i < room.c0 + room.w; i++) { cells[at(i, j)] = 2; roomAt[at(i, j)] = rooms.length - 1; floor[at(i, j)] = low[at(i, j)] = room.level * DROP; } };
  const doorKind = (): DoorKind => { const [a, d] = theme.doors, r = rng.next(); return r < a ? 'arch' : r < a + d ? 'door' : 'portcullis'; };
  add({ c0: ENTRY - 1, r0: 2, w: 3, h: 2, kind: 'gate', level: 0, note: '' });
  cameFrom.push(2);
  for (let j = 0; j < 2; j++) cells[at(ENTRY, j)] = 1;
  const wantRooms = rng.int(size.rooms[0], size.rooms[1]), wantStairs = tags.levels === 'flat' ? 0 : size.stairs;
  let stairs = 0;
  for (let tries = 0; tries < 3000 && rooms.length < wantRooms; tries++) {
    const pi = rng.chance(plan.last) ? rooms.length - 1 : rng.int(0, rooms.length - 1), parent = rooms[pi];
    const way = rng.chance(plan.straight) ? cameFrom[pi] : rng.int(0, 3), [dc, dr] = WAYS[way];
    // (No room off the antechamber's front, where the corridor comes in from the gate.)
    if (pi === 0 && dr === -1) continue;
    // (A stair down from the deepest level yet, once a few rooms are laid on it.)
    const goDown: boolean = stairs < wantStairs && parent.level === -stairs && rooms.length >= 2 + 2 * stairs && rng.chance(0.45);
    const len = Math.max(goDown ? 2 : 1, rng.int(plan.len[0], plan.len[1]));
    const [w, h] = theme.small && rng.chance(theme.small) ? rng.pick([[1, 2], [2, 1], [2, 2], [1, 1]] as [number, number][]) : rng.pick(plan.sizes);
    // (Its corridor out from a square along the parent's side, and the room where it ends, the corridor coming into it at one of its
    // squares; ordered, both from the middle.)
    const across = dc ? (plan.square ? parent.r0 + (parent.h >> 1) : rng.int(parent.r0, parent.r0 + parent.h - 1)) : plan.square ? parent.c0 + (parent.w >> 1) : rng.int(parent.c0, parent.c0 + parent.w - 1);
    const sc = dc ? (dc > 0 ? parent.c0 + parent.w : parent.c0 - 1) : across, sr = dr ? (dr > 0 ? parent.r0 + parent.h : parent.r0 - 1) : across;
    const ec = sc + dc * len, er = sr + dr * len;
    const c0 = dc ? (dc > 0 ? ec : ec - w + 1) : ec - (plan.square ? w >> 1 : rng.int(0, w - 1)), r0 = dr ? (dr > 0 ? er : er - h + 1) : er - (plan.square ? h >> 1 : rng.int(0, h - 1));
    const hall: [number, number][] = Array.from({ length: len }, (_, i) => [sc + dc * i, sr + dr * i]);
    let fits = hall.every(([c, r]) => inside(c, r) && solid(c, r) && solid(c + dr, r + dc) && solid(c - dr, r - dc));
    for (let j = r0 - 1; j <= r0 + h && fits; j++) for (let i = c0 - 1; i <= c0 + w && fits; i++) if (!solid(i, j) || ((i >= c0 && i < c0 + w && j >= r0 && j < r0 + h) && !inside(i, j))) fits = false;
    if (!fits) continue;
    const level = parent.level - (goDown ? 1 : 0);
    hall.forEach(([c, r], i) => {
      const k = at(c, r);
      cells[k] = 1;
      // (The stair: the corridor's last two squares, half the drop each.)
      const step = goDown ? i - (len - 2) : -1;
      floor[k] = parent.level * DROP - (step >= 0 ? (step * DROP) / 2 : 0);
      low[k] = step >= 0 ? floor[k] - DROP / 2 : floor[k];
      if (step >= 0) down[k] = way;
    });
    if (goDown) stairs++;
    add({ c0, r0, w, h, kind: 'store', level, note: '' });
    cameFrom.push(way);
    doors.push({ c: ec - dc, r: er - dr, dc, dr, kind: doorKind() });
    if (len > 1 || rng.chance(0.5)) doors.push({ c: sc, r: sr, dc: -dc, dr: -dr, kind: doorKind() });
  }
  // Ways round: corridors cut straight between rooms on one level that face each other across rock.
  for (let loops = 0, tries = 0; loops < plan.loops && tries < 200; tries++) {
    const a = rooms[rng.int(1, rooms.length - 1)], b = rooms[rng.int(1, rooms.length - 1)];
    if (a === b || a.level !== b.level) continue;
    const [dc, dr] = a.c0 + a.w < b.c0 ? [1, 0] : b.c0 + b.w < a.c0 ? [-1, 0] : a.r0 + a.h < b.r0 ? [0, 1] : b.r0 + b.h < a.r0 ? [0, -1] : [0, 0];
    if (!dc && !dr) continue;
    // (Along a row, or a column, that both rooms share.)
    const lo = dc ? Math.max(a.r0, b.r0) : Math.max(a.c0, b.c0), hi = dc ? Math.min(a.r0 + a.h, b.r0 + b.h) - 1 : Math.min(a.c0 + a.w, b.c0 + b.w) - 1;
    if (hi < lo) continue;
    const line = rng.int(lo, hi), from = dc ? (dc > 0 ? a.c0 + a.w : a.c0 - 1) : dr > 0 ? a.r0 + a.h : a.r0 - 1, to = dc ? (dc > 0 ? b.c0 - 1 : b.c0 + b.w) : dr > 0 ? b.r0 - 1 : b.r0 + b.h;
    const hall: [number, number][] = [];
    for (let k = from; dc + dr > 0 ? k <= to : k >= to; k += dc + dr) hall.push(dc ? [k, line] : [line, k]);
    if (!hall.length || hall.length > 5 || !hall.every(([c, r]) => solid(c, r) && solid(c + dr, r + dc) && solid(c - dr, r - dc))) continue;
    for (const [c, r] of hall) { cells[at(c, r)] = 1; floor[at(c, r)] = low[at(c, r)] = a.level * DROP; }
    const [c1, r1] = hall[hall.length - 1];
    doors.push({ c: c1, r: r1, dc, dr, kind: doorKind() }, { c: hall[0][0], r: hall[0][1], dc: -dc, dr: -dr, kind: doorKind() });
    loops++;
  }
  // How far each square is from the gate, through the open ones.
  const far = new Int16Array(n).fill(-1), queue = [ENTRY];
  far[ENTRY] = 0;
  while (queue.length) {
    const k = queue.shift()!, c = k % COLS, r = (k / COLS) | 0;
    for (const [dc, dr] of WAYS) { const i = c + dc, j = r + dr; if (solid(i, j) || far[at(i, j)] >= 0) continue; far[at(i, j)] = far[k] + 1; queue.push(at(i, j)); }
  }
  // The last room (the deepest, and the furthest from the gate there), behind a portcullis; the hall; the rest as the theme deals them.
  const reach = (r: Room) => far[at(r.c0 + (r.w >> 1), r.r0 + (r.h >> 1))] - 40 * r.level;
  let last = 1;
  rooms.forEach((r, i) => { if (i > 0 && r.w * r.h >= 4 && reach(r) > reach(rooms[last])) last = i; });
  rooms[last].kind = theme.last;
  for (const d of doors) if (roomAt[at(d.c + d.dc, d.r + d.dr)] === last) d.kind = 'portcullis';
  let hall = -1;
  if (theme.hall) rooms.forEach((r, i) => { if (i > 0 && i !== last && r.w >= 3 && r.h >= 3 && (hall < 0 || r.w * r.h > rooms[hall].w * rooms[hall].h)) hall = i; });
  if (hall >= 0) rooms[hall].kind = 'hall';
  let next = rng.int(0, theme.kinds.length - 1);
  for (const r of rooms) if (r.kind === 'store') r.kind = tags.theme === 'prison' && r.w * r.h <= 4 ? 'cell' : theme.kinds[next++ % theme.kinds.length];
  const top = new Float32Array(n);
  for (let k = 0; k < n; k++) if (cells[k]) top[k] = floor[k] + (cells[k] === 2 ? CAVE.room : CAVE.corridor);
  // The place named, and each room given its line.
  const who = rng.chance(0.6) ? `${rng.pick(NAMES)} ${rng.pick(EPITHETS)}` : `the ${rng.pick(['Frost', 'Winter', 'Mountain', 'Snow', 'Iron'])} ${rng.pick(['King', 'Queen', 'Jarl', 'Witch', 'Warden'])}`;
  const name = `The ${rng.pick(theme.places)} of ${who}`, levels = -Math.min(0, ...rooms.map((r) => r.level));
  for (const r of rooms) r.note = `${r.level < 0 ? `${r.level < -1 ? 'Deeper still' : 'Below'}: ` : ''}${rng.pick(LINES[r.kind]).replace('WHO', who)}`;
  const about = `a ${tags.size} ${theme.noun}, ${tags.layout}${levels ? `, on ${levels + 1} levels` : ''}, ${rooms.length} rooms`;
  return { cols: COLS, rows: ROWS, entry: ENTRY, tags, cells, rooms, roomAt, far, floor, low, down, top, doors, name, about, who };
}

// ------------------------------------------------------------------------------------------------------------------ what it is made of

/** Smooth noise that repeats every `period` squares either way, for pictures that tile. */
function tileNoise(x: number, y: number, period: number, seed: number): number {
  const h = (i: number, j: number) => { let n = (((i % period) + period) % period) * 374761393 + (((j % period) + period) % period) * 668265263 + seed * 2246822519; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}
const fbm = (x: number, y: number, period: number, seed: number, octaves = 4) => {
  let s = 0, a = 0.5, f = 1, w = 0;
  for (let o = 0; o < octaves; o++) { s += a * tileNoise(x * f, y * f, period * f, seed + o * 17); w += a; a *= 0.5; f *= 2; }
  return s / w;
};

interface Paint { map: Texture; normal: Texture }
/** A picture of `size` points square, from what each point's colour (0 to 1) and height are: its colours, and its normals from its heights. */
function painted(size: number, point: (x: number, y: number) => [number, number, number, number], bump: number): Paint {
  const colour = document.createElement('canvas'), normal = document.createElement('canvas');
  colour.width = colour.height = normal.width = normal.height = size;
  const ci = new ImageData(size, size), ni = new ImageData(size, size), heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, g, b, h] = point(x, y), k = (y * size + x) * 4;
    ci.data[k] = 255 * clamp(r, 0, 1); ci.data[k + 1] = 255 * clamp(g, 0, 1); ci.data[k + 2] = 255 * clamp(b, 0, 1); ci.data[k + 3] = 255;
    heights[y * size + x] = h;
  }
  const H = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * bump, dy = (H(x, y + 1) - H(x, y - 1)) * bump, l = Math.hypot(dx, dy, 1), k = (y * size + x) * 4;
    ni.data[k] = 255 * (0.5 - (0.5 * dx) / l); ni.data[k + 1] = 255 * (0.5 + (0.5 * dy) / l); ni.data[k + 2] = 255 * (0.5 + 0.5 / l); ni.data[k + 3] = 255;
  }
  colour.getContext('2d')!.putImageData(ci, 0, 0);
  normal.getContext('2d')!.putImageData(ni, 0, 0);
  const tex = (c: HTMLCanvasElement, srgb: boolean) => { const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 4; if (srgb) t.colorSpace = SRGBColorSpace; return t; };
  return { map: tex(colour, true), normal: tex(normal, false) };
}

/**
 * Stone in courses, `rows` to the picture, each course of blocks of their own lengths (a share of the picture between `short` and
 * `long`), each block a little its own colour about `tone`, bevelled into mortar; worn and pitted all over.
 */
function masonry(size: number, rows: number, short: number, long: number, tone: [number, number, number], rng: Rng): Paint {
  const courses = Array.from({ length: rows }, () => {
    const lengths: number[] = [];
    let sum = 0;
    while (sum < 1 - short) { const l = rng.range(short, long); lengths.push(l); sum += l; }
    const cuts = [0];
    lengths.forEach((l) => cuts.push(cuts[cuts.length - 1] + l / sum));
    return { cuts, shift: rng.range(0, 1), tones: lengths.map(() => [rng.range(0.82, 1.15), rng.range(-0.04, 0.04)] as [number, number]) };
  });
  const seed = rng.int(0, 9999), mortar = 0.012 * rows, bevel = 0.05 * rows;
  return painted(size, (px, py) => {
    const u = px / size, v = py / size, row = Math.min(rows - 1, Math.floor(v * rows)), c = courses[row];
    const x = (u + c.shift) % 1, b = c.cuts.findIndex((cut, i) => x >= cut && x < c.cuts[i + 1]), k = Math.max(0, b);
    const inRow = v * rows - row, edge = Math.min(inRow, 1 - inRow, ((x - c.cuts[k]) * rows) / 1.2, ((c.cuts[k + 1] - x) * rows) / 1.2);
    const n = fbm(u * 16, v * 16, 16, seed), pit = fbm(u * 64, v * 64, 64, seed + 5, 2);
    if (edge < mortar) { const m = 0.32 + 0.1 * n; return [m, m * 0.97, m * 0.93, 0]; }
    const [lit, warm] = c.tones[k], s = lit * (0.78 + 0.35 * n) * (0.88 + 0.12 * smooth((edge - mortar) / bevel)) * (pit < 0.22 ? 0.93 : 1);
    return [tone[0] * s + warm, tone[1] * s, tone[2] * s - warm, 0.35 + 0.65 * smooth((edge - mortar) / bevel) + 0.25 * n - (pit < 0.22 ? 0.1 : 0)];
  }, 3.2);
}

/** Bare rock: grey-brown, banded and cracked. */
function rockPaint(size: number, tone: [number, number, number], seed: number): Paint {
  return painted(size, (px, py) => {
    const u = px / size, v = py / size, n = fbm(u * 6, v * 6, 6, seed, 5), crack = Math.abs(fbm(u * 10, v * 10, 10, seed + 3, 3) - 0.5);
    const band = 0.06 * Math.sin((v + 0.3 * n) * Math.PI * 10), fine = fbm(u * 24, v * 24, 24, seed + 4, 3), s = (0.74 + 0.3 * n + 0.18 * fine + band) * (crack < 0.012 ? 0.72 : 1);
    return [tone[0] * s, tone[1] * s, tone[2] * s, n + 0.5 * fine + (crack < 0.012 ? -0.2 : 0)];
  }, 5);
}

/** Packed earth and grit, a cave's floor. */
function earthPaint(size: number, seed: number): Paint {
  return painted(size, (px, py) => {
    const u = px / size, v = py / size, n = fbm(u * 8, v * 8, 8, seed, 4), grit = tileNoise(u * 120, v * 120, 120, seed + 1);
    const s = 0.62 + 0.4 * n + (grit > 0.8 ? 0.18 : grit < 0.12 ? -0.12 : 0);
    return [0.36 * s, 0.31 * s, 0.26 * s, n + (grit > 0.8 ? 0.3 : 0)];
  }, 3);
}

/** Wood, its grain along the picture's height. */
function woodPaint(size: number, tone: [number, number, number], seed: number): Paint {
  return painted(size, (px, py) => {
    const u = px / size, v = py / size, grain = fbm(u * 24, v * 3, 24, seed, 3), ring = 0.5 + 0.5 * Math.sin((u * 24 + grain * 6) * Math.PI);
    const s = 0.75 + 0.25 * ring + 0.15 * (grain - 0.5);
    return [tone[0] * s, tone[1] * s, tone[2] * s, ring * 0.6 + grain * 0.4];
  }, 2);
}

/** A tongue of flame, white at its root to orange and gone at its tip: for fire drawn added to what lies behind it. */
function flamePicture(): Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = (x - 31.5) / 32, v = 1 - y / 127, w = 0.95 * (1 - v) ** 0.6 * Math.min(1, v * 5 + 0.2), d = Math.abs(u) / Math.max(0.02, w);
    const a = clamp(1 - d, 0, 1) ** 1.4 * clamp(1.2 - v, 0, 1), heat = a * (1 - 0.6 * v), k = (y * 64 + x) * 4;
    img.data[k] = 255 * clamp(heat * 1.4, 0, 1); img.data[k + 1] = 255 * clamp(heat * heat * 1.1, 0, 1); img.data[k + 2] = 255 * clamp(heat ** 3 * 0.8, 0, 1); img.data[k + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** A soft round puff, for smoke and glow. */
function puffPicture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

let paints: { wall: Paint; floor: Paint; rock: Paint; earth: Paint; wood: Paint; bark: Paint; flame: Texture; puff: Texture } | null = null;
/** The pictures everything here is painted with, made once (when the first cave is made) and kept for every cave after. */
export const paintsOf = () => {
  if (paints) return paints;
  const rng = new Rng('dungeon paints');
  paints = {
    wall: masonry(512, 5, 0.13, 0.3, [0.52, 0.49, 0.45], rng.fork('wall')),
    floor: masonry(512, 3, 0.2, 0.45, [0.46, 0.44, 0.41], rng.fork('floor')),
    rock: rockPaint(512, [0.5, 0.47, 0.44], 11), earth: earthPaint(256, 5),
    wood: woodPaint(256, [0.5, 0.33, 0.19], 3), bark: woodPaint(128, [0.3, 0.22, 0.15], 8),
    flame: flamePicture(), puff: puffPicture(),
  };
  return paints;
};

/**
 * Each kind of place's own stone (asked: "what new materials ... do we need?"), its walls' and its floors': a tomb's pale grey-green, in
 * courses of middling blocks, its floor of great slabs; a temple's cream, its blocks long and dressed, as marble is laid; a prison's dark
 * and rough, in many small courses; a vault's warm sandstone. Made as each is first wanted, and kept. (The deeps and the props keep the
 * plain stone, `paintsOf`.)
 */
const THEME_STONE: Record<Tags['theme'], { wall: [number, number, number, [number, number, number]]; floor: [number, number, number, [number, number, number]] }> = {
  tomb: { wall: [5, 0.14, 0.32, [0.5, 0.52, 0.47]], floor: [2, 0.3, 0.55, [0.43, 0.44, 0.41]] },
  temple: { wall: [4, 0.25, 0.5, [0.68, 0.63, 0.55]], floor: [2, 0.35, 0.7, [0.6, 0.56, 0.5]] },
  prison: { wall: [7, 0.1, 0.22, [0.37, 0.35, 0.33]], floor: [4, 0.15, 0.3, [0.33, 0.31, 0.29]] },
  vault: { wall: [5, 0.16, 0.34, [0.6, 0.5, 0.38]], floor: [3, 0.2, 0.45, [0.52, 0.44, 0.34]] },
};
const themed = new Map<Tags['theme'], { wall: Paint; floor: Paint }>();
export const themePaints = (theme: Tags['theme']) => {
  let t = themed.get(theme);
  if (!t) {
    const rng = new Rng(`dungeon paints ${theme}`), [wr, ws, wl, wt] = THEME_STONE[theme].wall, [fr, fs, fl, ft] = THEME_STONE[theme].floor;
    t = { wall: masonry(512, wr, ws, wl, wt, rng.fork('wall')), floor: masonry(512, fr, fs, fl, ft, rng.fork('floor')) };
    themed.set(theme, t);
  }
  return t;
};
/** The torches' light in each kind of place: a tomb's pale and greenish, a temple's golden, a prison's red, a vault's amber. */
const THEME_TORCH: Record<Tags['theme'], Color> = {
  tomb: new Color(0.9, 0.76, 0.5), temple: new Color(1.0, 0.74, 0.44), prison: new Color(1.0, 0.55, 0.3), vault: new Color(1.0, 0.68, 0.36),
};
let weather: Texture | null = null;
/** Soft noise in patches, to lay the frost and the damp by (its red). */
const weatherNoise = () => {
  if (weather) return weather;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!, img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const n = fbm(x / 32, y / 32, 4, 31, 4), k = (y * 128 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * n; img.data[k + 3] = 255; }
  g.putImageData(img, 0, 0);
  weather = new CanvasTexture(c);
  weather.wrapS = weather.wrapT = RepeatWrapping;
  return weather;
};

/** What each stuff a prop is made of is painted with, and how it takes the light. */
export const STUFF_PAINT: Partial<Record<Stuff, 'wood' | 'wall' | 'rock' | 'earth'>> = { wood: 'wood', stone: 'wall', straw: 'earth', clay: 'rock' };
export const STUFF_LOOK: Record<Stuff, { color?: number; roughness: number; metalness?: number; side?: typeof DoubleSide }> = {
  wood: { roughness: 0.85 }, iron: { color: 0x55555c, roughness: 0.45, metalness: 0.7 }, stone: { color: 0xd0c8bc, roughness: 0.9 },
  bone: { color: 0xd8cfb8, roughness: 0.7 }, gold: { color: 0xffc040, roughness: 0.3, metalness: 1 }, cloth: { color: 0xf0f0f0, roughness: 0.95, side: DoubleSide },
  wax: { color: 0xeee2c4, roughness: 0.6 }, straw: { color: 0xffe0a0, roughness: 1 }, clay: { color: 0xd09070, roughness: 0.8 }, coal: { color: 0x201812, roughness: 1 },
  fungus: { color: 0xc8f0e0, roughness: 0.55 },
};

// ------------------------------------------------------------------------------------------------------------------------ shapes

/** A shape put together a triangle at a time: where each point is, which way it faces, where it is on its picture, its light. */
export class Shape {
  readonly pos: number[] = []; readonly nor: number[] = []; readonly uv: number[] = []; readonly light: number[] = []; readonly snow: number[] = []; readonly index: number[] = [];
  /** The floor each point stands over (`floor`, as it is laid): what the view from above cuts away a height over (`CUT`). */
  readonly ground: number[] = [];
  floor = 0;
  /** How far each point is of a second stone rather than the first (`mixed`, as it is laid): the deeps' natural rock and dressed stone. */
  readonly mix: number[] = [];
  mixed = 0;
  get count() { return this.pos.length / 3; }
  point(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, snow = 0): number {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.light.push(0, 0, 0); this.snow.push(snow); this.ground.push(this.floor); this.mix.push(this.mixed);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) { this.index.push(a, b, c); }
  /**
   * A flat piece from `o`, `nu` steps along `du` and `nv` along `dv` (each a whole side's length), facing `n`; its picture laid
   * `scale` metres to a repeat, from where it begins along it (`u0`, `v0`).
   */
  panel(o: Vector3, du: Vector3, dv: Vector3, n: Vector3, nu: number, nv: number, scale: number, u0 = 0, v0 = 0) {
    const first = this.count, lu = du.length(), lv = dv.length();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const p = o.clone().addScaledVector(du, i / nu).addScaledVector(dv, j / nv);
      this.point(p.x, p.y, p.z, n.x, n.y, n.z, (u0 + (lu * i) / nu) / scale, (v0 + (lv * j) / nv) / scale);
    }
    const flip = new Vector3().crossVectors(du, dv).dot(n) < 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = first + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) { this.tri(a, c, b); this.tri(b, c, d); } else { this.tri(a, b, c); this.tri(b, d, c); }
    }
  }
  geometry(withLight: boolean, withSnow = false): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2));
    if (withLight) { g.setAttribute('aLight', new BufferAttribute(new Float32Array(this.light), 3)); g.setAttribute('aFloor', new BufferAttribute(new Float32Array(this.ground), 1)); }
    if (withSnow) g.setAttribute('aSnow', new BufferAttribute(new Float32Array(this.snow), 1));
    if (withLight) g.setAttribute('aMix', new BufferAttribute(new Float32Array(this.mix), 1));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    return g;
  }
  /** Its normals found again from its triangles (where they were not laid by hand). */
  smoothNormals() {
    const n = new Float32Array(this.pos.length), p = this.pos, a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (let i = 0; i < this.index.length; i += 3) {
      const [i0, i1, i2] = [this.index[i], this.index[i + 1], this.index[i + 2]];
      a.set(p[i0 * 3], p[i0 * 3 + 1], p[i0 * 3 + 2]); b.set(p[i1 * 3], p[i1 * 3 + 1], p[i1 * 3 + 2]); c.set(p[i2 * 3], p[i2 * 3 + 1], p[i2 * 3 + 2]);
      const f = b.sub(a).cross(c.sub(a));
      for (const k of [i0, i1, i2]) { n[k * 3] += f.x; n[k * 3 + 1] += f.y; n[k * 3 + 2] += f.z; }
    }
    for (let k = 0; k < n.length; k += 3) { const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1; this.nor[k] = n[k] / l; this.nor[k + 1] = n[k + 1] / l; this.nor[k + 2] = n[k + 2] / l; }
  }
}

/** A torch on a wall: where its flame is (in the cave's own frame), and which way the wall faces. */
interface Torch { at: Vector3; facing: Vector3; kind: 'wall' | 'post' | 'candle' | 'brazier' | 'sky'; power: number; color?: Color }
/** Something in the way of one on foot, round, in the cave's own frame (across, along). */
interface Post { lat: number; t: number; r: number; horse?: boolean }

/** The tunnel's cross-section `phi` of the way round (0 to pi) from the foot of its right wall over its crown to the foot of its left. */
const arch = (phi: number): [number, number] => [-CAVE.hw * Math.cos(phi), CAVE.tall * Math.pow(Math.sin(phi), 0.5)];
/** Where along the cross-section each of its `k + 1` points lies, alike in length round it (as phi). */
const archSteps = (k: number): number[] => {
  const fine = 400, len = [0];
  for (let i = 1; i <= fine; i++) { const [a, b] = arch((Math.PI * (i - 1)) / fine), [c, d] = arch((Math.PI * i) / fine); len.push(len[i - 1] + Math.hypot(c - a, d - b)); }
  return Array.from({ length: k + 1 }, (_, j) => { const want = (len[fine] * j) / k; let i = 1; while (i < fine && len[i] < want) i++; const f = (want - len[i - 1]) / (len[i] - len[i - 1] || 1); return (Math.PI * (i - 1 + f)) / fine; });
};

/** The light the torches give, the day's at the mouth, and what is about everywhere in the dark. */
export const TORCH_LIGHT = new Color(1.0, 0.66, 0.38), DAYLIGHT = new Color(0.78, 0.84, 0.95), DARK = new Color(0.022, 0.024, 0.03);
/** The cold fire burning by the way that matters (the last room's locked way in): pale blue, as no torch burns. */
export const COLD_FIRE = new Color(0.42, 0.7, 1.15);
export const TORCH_REACH = 15;
/**
 * Seen from above on foot (`Cave.overhead`), how high over its own floor the stone is cut away (its roofs and its walls' tops), as a
 * dungeon is drawn seen from above; and how far the dark caps laid over the cut walls reach into the rock.
 */
export const CUT = 3, CAP = 0.7;
const addScaled = (into: Color, c: Color, k: number) => { into.r += c.r * k; into.g += c.g * k; into.b += c.b * k; };
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The cave, made: its mound and rock face, the camp, the tunnel and the dungeon (`group`, to go in the land's own), and what the
 * game asks of it, in the land's frame: where one on foot may go and how high its floor is there, where a view may stand, how deep
 * in a point is, and what is solid to one on skis. Inside, its own frame (`frame`): across the way in to its left (x), up, and in (z).
 */
/**
 * What came of a step through the plot (`Cave.tread`), for the game to tell and do: something said; the key taken up; a way opened (the
 * locked, the barred, the hidden); the hidden room's stash opened, the braziers lit in order (each where its find is thrown up from); a
 * trap's darts loosed (from where); the hermit come to (health back) and sat by long enough to trade (where he sits); the captive freed;
 * the last room come into, and whoever it was made for rising there to fight (where, and by what name).
 */
export type CaveEvent =
  | { kind: 'say'; title: string; text: string }
  | { kind: 'key' | 'unlock' | 'unbar' | 'secret' | 'heal' }
  | { kind: 'stash' | 'puzzle' | 'trap' | 'trade'; at: Vector3 }
  | { kind: 'freed'; name: string }
  | { kind: 'boss'; at: Vector3; title: string };
/** Each kind of room, as one would name it in telling the way. */
const ROOM_NAMES: Record<RoomKind, string> = {
  gate: 'antechamber', hall: 'pillared hall', store: 'storeroom', crypt: 'crypt', ossuary: 'ossuary', shrine: 'shrine', tomb: 'tomb', library: 'library',
  sanctum: 'sanctum', cell: 'cell', guard: 'guardroom', warden: "warden's room", vault: 'vault', hoard: 'hoard', hidden: 'hidden room',
};
/** A picture of a crack, dark, branching across a wall from near its foot: the hidden room's wall's tell (its alpha only). */
function crackPicture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!, r = new Rng('crack');
  g.strokeStyle = 'rgba(0,0,0,1)'; g.lineCap = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number) => {
    if (len < 8 || w < 0.6) return;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    let px = x, py = y;
    for (let i = 0; i < 6; i++) { a += r.range(-0.5, 0.5); px += Math.cos(a) * len / 6; py += Math.sin(a) * len / 6; g.lineTo(px, py); }
    g.stroke();
    if (r.chance(0.8)) branch(px, py, a + r.range(-0.9, -0.3), len * 0.65, w * 0.65);
    if (r.chance(0.8)) branch(px, py, a + r.range(0.3, 0.9), len * 0.6, w * 0.6);
  };
  branch(118, 250, -Math.PI / 2 - 0.15, 120, 4.5);
  branch(140, 250, -Math.PI / 2 + 0.3, 80, 3);
  const t = new CanvasTexture(c);
  return t;
}
/** A shaft of light: soft at its sides, brighter at its top, as a picture's alpha. */
function beamPicture(): Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!, img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const u = (x - 31.5) / 32, v = y / 255, a = (1 - u * u) ** 2 * (0.25 + 0.75 * (1 - v)) * Math.min(1, (1 - v) * 12) * Math.min(1, v * 4 + 0.2), k = (y * 64 + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = 255 * a;
  }
  g.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}
/** A band of runes cut in stone, as a picture's alpha: staves with their twigs, each its own by chance (`seed`). */
function runePicture(seed: string): Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!, r = new Rng(`runes ${seed}`);
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  // (Lines along the band's top and foot, and between them the staves.)
  for (const y of [10, 86]) { g.beginPath(); g.moveTo(8, y); g.lineTo(504, y); g.stroke(); }
  for (let x = 30; x < 500; x += 38) {
    g.beginPath(); g.moveTo(x, 22); g.lineTo(x, 74);
    for (let k = r.int(1, 3); k > 0; k--) {
      const y0 = r.range(24, 62), side = r.chance(0.5) ? 1 : -1, down = r.chance(0.5) ? 1 : -1;
      g.moveTo(x, y0); g.lineTo(x + side * r.range(10, 15), y0 + down * r.range(10, 16));
    }
    g.stroke();
  }
  return new CanvasTexture(c);
}
/** A circle drawn on a floor for some rite: two rings, a star of lines across them, marks between, as a picture's alpha. */
function circlePicture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#fff'; g.lineWidth = 4;
  for (const r of [118, 96]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
  g.beginPath();
  for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5, x = 128 + 96 * Math.cos(a), y = 128 + 96 * Math.sin(a); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.lineWidth = 3;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.moveTo(128 + 100 * Math.cos(a), 128 + 100 * Math.sin(a)); g.lineTo(128 + 114 * Math.cos(a + 0.05), 128 + 114 * Math.sin(a + 0.05)); g.stroke(); }
  return new CanvasTexture(c);
}
/** A numeral cut in stone, I, II or III (`order`, from 0), as a picture's alpha: before each cold brazier, the order it is to be lit in. */
function numeralPicture(order: number): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(['I', 'II', 'III'][order], 64, 68);
  return new CanvasTexture(c);
}

/** Where a script may be put in or by the cave (`Cave.spot`): the camp, the gate, the chest, a room, a stair, and what the plot has laid. */
export type CaveSpot = 'camp' | 'gate' | 'tomb' | 'room' | 'stair' | 'locked' | 'barred' | 'secret' | 'key' | 'captive' | 'puzzle' | 'stash' | 'water' | 'shaft' | 'trap';
/** The corners about a point, a quarter metre out, that must all be open floor for it to be clear of the walls (`Cave.clear`). */
const ROOM_CORNERS = [[-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25]] as const;

export class Cave {
  readonly group = new Group();
  /**
   * The light carried in by one on foot, and the campfire's: the only lights the cave's own stone takes. Given by the page, the same
   * two for every cave, kept in the scene for good and set where this cave wants them as it is stepped (`sharedLights`): a light's own
   * number is part of what each lit thing's shaders are made for, and each cave's own pair, coming with each run and going as the land
   * was turned inside out, had every shader in the scene made again each time (asked: "I feel that we might not be precaching all new
   * things anymore"). Made here, only when none are given.
   */
  readonly lantern: PointLight;
  readonly fireLight: PointLight;
  private readonly sharedLights: boolean;
  /** Where the fire's light and the lantern stand in the cave's own frame, set into the land as it is stepped when the lights are shared. */
  private readonly fireLocal = new Vector3();
  private readonly lanternLocal = new Vector3();
  /** The chest's place in the land, and how far open it is. */
  readonly chest = { at: new Vector3(), open: 0, opened: false };
  private readonly frame = new Group();
  private readonly inner = new Group();
  private readonly layout: Layout;
  private readonly torches: Torch[] = [];
  private readonly posts: Post[] = [];
  private readonly flicker = uniform(1);
  /** Seen from above (`overhead`): how high over each stone's own floor it is cut away, and the height over which what stands about is (none, far off). */
  /**
   * What of the dungeon has been seen (asked: "can we have darkness/fog of uncovered halls and rooms in the dungeons and a dungeon minimap
   * and inkmap that updates accordingly?"): each square of its lattice, seen or not, kept as a picture of the lattice for its stone and
   * all in it to look up (`fog`), unseen not drawn, the dark under the snow showing in its stead; and whether that is so now (only on foot
   * inside, seen from above: from outside none of it is seen anyway). The scene's frame taken to the cave's own, for the look-up.
   */
  private readonly seen: Uint8Array;
  private readonly fogMap: DataTexture;
  private readonly fogOn = uniform(0);
  private readonly toFrame = uniform(new Matrix4());
  /** When the squares in sight were last looked over, and from which. */
  private lookedAt = -1;
  private lookedFrom = '';
  private readonly cutOver = uniform(1e5);
  private readonly cutAt = uniform(1e5);
  /** The dark caps over the cut stone, and the mound and rock face over it all: shown or hidden as it is seen from above. */
  private readonly caps = new Shape();
  private capMesh!: Mesh;
  private readonly outside: Mesh[] = [];
  private readonly plug: Mesh;
  private readonly flames: InstancedMesh;
  private readonly coldFlames: InstancedMesh;
  private readonly fire: InstancedMesh;
  private readonly smoke: InstancedMesh;
  private readonly smokeFade: InstancedBufferAttribute;
  /** The last room's chest's lid, on its hinge (`makeChest`). */
  private lid = new Group();
  private readonly glow: Mesh;
  private readonly rack = new Group();
  private readonly fireAt: Vector3;
  private readonly puffs: { age: number; life: number; x: number; z: number; drift: number }[] = [];
  private readonly rng: Rng;
  private readonly m4 = new Matrix4();
  private chestTurn = 0;
  /** Where a horse is left, across and along (`horseSpot`). */
  private parking: [number, number] = [0, 0];

  // ---- What the dungeon is made to be gone through by (`plotDungeon`), and what keeps it: all in the cave's own frame but where said.
  /** The dungeon's plot: its locked way, its key, its barred door, its hidden room, its traps, the rooms given over. */
  readonly plot: Plot;
  /** The squares of the hidden room and its way in, while its wall stands: solid to everything, walking, light, sight, the foes' ways. */
  private readonly hidden = new Set<number>();
  /** The light the torches give (`TORCH_LIGHT`), as the place's own (`themeLook`). */
  private torchLight = TORCH_LIGHT;
  /** Each door and portcullis drawn, by its doorway: its mesh, which way its leaf swings, and where it stands open and shut. */
  private readonly doorMesh = new Map<number, { mesh: Mesh; s: number; open: number; shut: number }>();
  /**
   * Each doorway kept shut, and how far open it is now (0 to 1): the last room's ways in (`locked`, opened with the key from outside,
   * freely from within), the barred door (opened from its far side), the hidden room's wall (pushed through). What stands in it (`parts`)
   * goes as it opens; what is left when it is open (`after`) comes.
   */
  private readonly shuts: { door: number; kind: 'locked' | 'barred' | 'secret'; open: number; going: boolean; parts: Mesh[]; after: Mesh[] }[] = [];
  /** Where a circle is drawn on a floor, candles about it (`layThings`): drawn, glowing, in `layPlot`. */
  private readonly circles: Vector3[] = [];
  /** Spots taken on the floors by what the plot lays, kept apart (`layThings`). */
  private readonly taken: [number, number][] = [];
  /** The key, by the one who came before: where, whether taken; drawn, and its glint. */
  private readonly keyLocal = new Vector3(NaN, 0, 0);
  private keyMesh: Group | null = null;
  keyTaken = false;
  /** The hidden room's stash: where, how it lies, its lid and its glow, and whether opened. */
  private readonly stashLocal = new Vector3(NaN, 0, 0);
  private stashTurn = 0;
  private stash: { hinge: Group; glow: Mesh; open: number; opened: boolean } | null = null;
  /** The dart traps: each plate's square, the wall it shoots from, how long until it may again, and its darts' flight. */
  private traps: { at: Vector3; from: Vector3; to: Vector3; wait: number; fly: number; seen: boolean }[] = [];
  private darts: InstancedMesh | null = null;
  /** The flooded room's water: its rectangle and its surface's height. */
  private water: { x0: number; t0: number; x1: number; t1: number; y: number } | null = null;
  /** The crack of day's foot, and the snow coming down it. */
  private readonly shaftLocal = new Vector3(NaN, 0, 0);
  private flakes: { mesh: InstancedMesh; at: Vector3[] } | null = null;
  /** The three cold braziers: where, which is to be lit when (0 first), whether lit; their flames, and how long since a wrong one was lit. */
  private readonly braziers: { at: Vector3; order: number; lit: boolean; cool: boolean }[] = [];
  private brazierFlames: InstancedMesh | null = null;
  private puzzleDone = false;
  private puzzleWrong = -1;
  /** The folk: the hermit at the fire, the captive, the ghost of the place; where, and what has passed with each. */
  private readonly captiveLocal = new Vector3(NaN, 0, 0);
  private readonly ghostLocal = new Vector3(NaN, 0, 0);
  private readonly folk: { who: 'hermit' | 'captive' | 'ghost'; figure: Folk; fade: number }[] = [];
  private met = { hermit: false, hermitAway: true, by: 0, traded: false, captive: false, ghost: false, boss: false, locked: false, barred: false, draught: false, near: 0 };

  constructor(readonly site: CaveSite, private readonly base: BaseHeight, readonly seed: string, asked: string[] = [], shared?: { lantern: PointLight; fire: PointLight }, toward?: { x: number; z: number }) {
    this.sharedLights = !!shared;
    this.lantern = shared?.lantern ?? new PointLight(0xffc690, 0, 20, 1.6);
    this.fireLight = shared?.fire ?? new PointLight(0xff9440, 0, 24, 2);
    const P = paintsOf();
    this.rng = new Rng(`dungeon ${seed}`);
    this.layout = layDungeon(this.rng.fork('layout'), tagsFor(this.rng.fork('tags'), asked));
    // (A way out to the deeps, where there is another dungeon to go to: toward it, from the lattice's middle.)
    if (toward) { const [t, lat] = siteLocal(site, toward.x, toward.z); cutDeepDoor(this.layout, [lat, t - (site.length + (this.layout.rows * CAVE.cell) / 2)]); }
    this.plot = plotDungeon(this.layout, this.rng.fork('plot'));
    this.notePlot();
    this.torchLight = THEME_TORCH[this.layout.tags.theme];
    this.seen = new Uint8Array(this.layout.cols * this.layout.rows);
    this.fogMap = new DataTexture(new Uint8Array(this.layout.cols * this.layout.rows * 4), this.layout.cols, this.layout.rows, RGBAFormat);
    this.fogMap.magFilter = this.fogMap.minFilter = NearestFilter;
    this.fogMap.needsUpdate = true;
    this.frame.position.set(site.mouth.x, 0, site.mouth.z);
    this.frame.rotation.y = Math.atan2(site.ax, site.az);
    this.group.add(this.frame);
    this.frame.add(this.inner);
    this.group.name = 'cave';

    // ---- Laid out first, every torch and candle with it, so that the light of each falls on all: the tunnel and the dungeon, the camp
    // (`tc` along the way in: its fire, and a torch either side of the mouth), and what stands about inside, and the chest.
    const walls = new Shape(), floors = new Shape(), rock = new Shape(), earth = new Shape();
    this.layTunnel(rock, earth, walls);
    this.layDungeon(walls, floors);
    const tc = -(CAVE.campR - 0.5);
    this.fireAt = new Vector3(2.7, 0, tc + 0.8);
    this.fireAt.y = this.groundAt(this.fireAt.x, this.fireAt.z);
    this.layCamp(tc);
    this.glow = this.layThings();
    this.layPlot();

    // ---- The cave's own stone, lit by its torches (worked out here, `bake`) and the day at the mouth, and by nothing in the scene but
    // the light carried in and the campfire.
    // (Weathered as it lies: frost where the cold comes in, on the gate's level, on floors and at the feet of walls, in patches; below,
    // the stone dark with damp toward the floor, and moss on it. `aFloor` is the floor each point stands over: the gate's, a level down.)
    const noise = weatherNoise(), deepAt = float(this.site.deep);
    const weathered = (paint: Paint): N => {
      const base = texture(paint.map, uv()).rgb as N, floorY = attribute('aFloor', 'float') as N, up = (positionWorld.y as N).sub(floorY);
      const n = (texture(noise, (positionWorld as N).xz.mul(0.21)) as N).r, n2 = (texture(noise, (positionWorld as N).xz.mul(0.37).add(0.5)) as N).r;
      const below = deepAt.sub(floorY).div(DROP).clamp(0, 1), low = float(1).sub(up.div(1.4).clamp(0, 1));
      const frost = float(1).sub(below).mul(smoothstep(0.52, 0.72, n)).mul(max((normalWorld.y as N).mul(0.9), low.mul(0.8))).mul(0.75);
      const moss = below.mul(smoothstep(0.55, 0.75, n2)).mul(low).mul(0.7), damp = float(1).sub(below.mul(low).mul(0.3));
      return mix(mix(base.mul(damp), vec3(0.14, 0.2, 0.1), moss), vec3(0.8, 0.86, 0.95), frost);
    };
    const stone = (paint: Paint, roughness = 0.92) => {
      const m = new MeshStandardNodeMaterial({ map: paint.map, normalMap: paint.normal, roughness, metalness: 0 }), look = weathered(paint);
      m.colorNode = look;
      m.emissiveNode = look.mul(attribute('aLight', 'vec3')).mul(this.flicker);
      m.lightsNode = lights([this.lantern, this.fireLight]);
      // (Seen from above, gone over the height it is cut at: its roof and the tops of its walls.)
      m.opacityNode = select(positionWorld.y.greaterThan((attribute('aFloor', 'float') as N).add(this.cutOver)), float(0), float(1)).mul(this.fog());
      m.alphaTestNode = float(0.5);
      return m;
    };
    for (const s of [walls, floors, rock, earth]) this.bake(s);
    const T = themePaints(this.layout.tags.theme);
    for (const [s, m] of [[walls, stone(T.wall)], [floors, stone(T.floor, 0.85)], [rock, stone(P.rock, 0.95)], [earth, stone(P.earth, 0.97)]] as const) {
      const mesh = new Mesh(s.geometry(true), m);
      mesh.receiveShadow = true;
      this.inner.add(mesh);
    }
    // (The caps: the rock's cut face, dark, seen only from above.)
    const capPaint = new MeshBasicNodeMaterial();
    capPaint.colorNode = (texture(P.rock.map, uv()).rgb as N).mul(0.07);
    capPaint.opacityNode = this.fog();
    capPaint.alphaTestNode = float(0.5);
    this.capMesh = new Mesh(this.caps.geometry(false), capPaint);
    this.capMesh.visible = false;
    this.inner.add(this.capMesh);

    // ---- Outside: the mound over the hole and the face of rock with the mouth in it, under snow where they face up; lit as the land is.
    const outside = new MeshStandardNodeMaterial({ map: P.rock.map, normalMap: P.rock.normal, roughness: 0.93 });
    outside.colorNode = mix(texture(P.rock.map, uv()).rgb, vec3(0.93, 0.95, 0.99), attribute('aSnow', 'float'));
    const mound = new Shape(), face = new Shape();
    this.layMound(mound, face);
    for (const s of [mound, face]) {
      const mesh = new Mesh(s.geometry(false, true), outside);
      mesh.castShadow = mesh.receiveShadow = true;
      this.frame.add(mesh);
      this.outside.push(mesh);
    }
    // (From far off, where the run's snow is drawn at four metres and the hole in it is cut wider, the snow under it all, plain: shown
    // only then.)
    const plug = new Shape(), nl = 2 * Math.round(MOUND_HALF + 4) + 1;
    for (let t = -5; t <= site.holeTo + 7; t += 1) for (let j = 0; j < nl; j++) {
      const lat = -Math.round(MOUND_HALF + 4) + j, p = sitePoint(site, t, lat);
      plug.point(lat, this.base(p.x, p.z) - 0.15, t, 0, 1, 0, 0, 0);
    }
    for (let i = 0; i < plug.count / nl - 1; i++) for (let j = 0; j < nl - 1; j++) { const a = i * nl + j, b = a + 1, c = a + nl, d = c + 1; plug.tri(a, c, b); plug.tri(b, c, d); }
    plug.smoothNormals();
    this.plug = new Mesh(plug.geometry(false), new MeshStandardNodeMaterial({ color: 0xeef2f8, roughness: 0.95 }));
    this.plug.receiveShadow = true;
    this.plug.visible = false;
    this.frame.add(this.plug);

    // ---- The torches: each a stick in an iron cup on its bracket, its flame drawn as a tongue of fire turned to the eye. (A candle's
    // a small one.)
    const held = this.torches.filter((t) => t.kind === 'wall'), stick = new CylinderGeometry(0.03, 0.022, 0.5, 6).translate(0, 0.25, 0);
    const handles = new InstancedMesh(stick, this.lit(new MeshStandardNodeMaterial({ color: 0x2a1d14, roughness: 0.8 }), stick, held.map((t) => t.at)), held.length);
    held.forEach((t, i) => {
      const lean = new Quaternion().setFromUnitVectors(UP, UP.clone().multiplyScalar(0.9).addScaledVector(t.facing, 0.45).normalize());
      handles.setMatrixAt(i, this.m4.compose(t.at.clone().addScaledVector(UP, -0.52).addScaledVector(t.facing, -0.24), lean, new Vector3(1, 1, 1)));
    });
    this.inner.add(handles);
    const flamePaint = new MeshBasicNodeMaterial({ map: P.flame, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    flamePaint.colorNode = (texture(P.flame, uv()).rgb as N).mul(vec3(2.2, 1.6, 1.1));
    this.flames = new InstancedMesh(new PlaneGeometry(1, 1).translate(0, 0.38, 0), flamePaint, this.torches.length);
    this.flames.frustumCulled = false;
    this.frame.add(this.flames);
    // (The cold fire by the locked way: the same tongues, blue-white.)
    const coldPaint = new MeshBasicNodeMaterial({ map: P.flame, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    coldPaint.colorNode = (texture(P.flame, uv()).rgb as N).mul(vec3(0.7, 1.3, 2.6));
    this.coldFlames = new InstancedMesh(this.flames.geometry, coldPaint, this.torches.length);
    this.coldFlames.frustumCulled = false;
    this.frame.add(this.coldFlames);

    // ---- The campfire's flames and smoke, and its light; the light carried in.
    const firePaint = new MeshBasicNodeMaterial({ map: P.flame, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    firePaint.colorNode = (texture(P.flame, uv()).rgb as N).mul(vec3(2.6, 1.7, 1.0));
    this.fire = new InstancedMesh(new PlaneGeometry(1, 1).translate(0, 0.42, 0), firePaint, 6);
    this.fire.frustumCulled = false;
    this.frame.add(this.fire);
    const smokeShape = new PlaneGeometry(1, 1);
    this.smokeFade = new InstancedBufferAttribute(new Float32Array(14), 1);
    smokeShape.setAttribute('aFade', this.smokeFade);
    const smokePaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    smokePaint.colorNode = vec3(0.62, 0.62, 0.64);
    smokePaint.opacityNode = (texture(P.puff, uv()).a as N).mul(attribute('aFade', 'float')).mul(0.42);
    this.smoke = new InstancedMesh(smokeShape, smokePaint, 14);
    this.smoke.frustumCulled = false;
    this.frame.add(this.smoke);
    this.fireLocal.copy(this.fireAt).addScaledVector(UP, 0.9);
    if (!this.sharedLights) { this.fireLight.position.copy(this.fireLocal); this.frame.add(this.fireLight, this.lantern); }
    for (let i = 0; i < 14; i++) this.puffs.push({ age: this.rng.range(0, 4), life: this.rng.range(3, 4.5), x: 0, z: 0, drift: this.rng.range(-1, 1) });
    this.frame.updateMatrixWorld(true);
  }

  /**
   * Where the way under the mountain from this dungeon begins (`slopeDeeps.ts`): the doorway its way out to the deeps goes through, its
   * floor, and the way out of it, in the land's frame; none where it was not given one (`toward`), or none fitted.
   */
  deepDoor(): { x: number; y: number; z: number; dx: number; dz: number } | null {
    const ex = this.layout.exit;
    if (!ex) return null;
    // (The doorway in the lattice's outer wall, its floor; and out from it, the way across and the way in turned into the land's.)
    const half = CAVE.cell / 2, p = sitePoint(this.site, this.tOf(ex.r) + ex.dr * half, this.latOf(ex.c) + ex.dc * half);
    return { x: p.x, y: this.site.deep + this.layout.floor[ex.r * this.layout.cols + ex.c], z: p.z, dx: this.site.ax * ex.dr + this.site.az * ex.dc, dz: this.site.az * ex.dr - this.site.ax * ex.dc };
  }

  // ------------------------------------------------------------------------------------------------------------- building it

  /** A point of the cave's own frame in the land. */
  private toLand(lat: number, y: number, t: number): Vector3 { const p = sitePoint(this.site, t, lat); return new Vector3(p.x, y, p.z); }
  /** The land's height (as it was before the hole) under a point of the cave's own frame. */
  private groundAt(lat: number, t: number): number { const p = sitePoint(this.site, t, lat); return this.base(p.x, p.z); }
  /** Across the way in, the middle of the dungeon's square `c`; along it, of row `r`. */
  private latOf(c: number) { return (c - (this.layout.cols - 1) / 2) * CAVE.cell; }
  private tOf(r: number) { return this.site.length + (r + 0.5) * CAVE.cell; }
  private open(c: number, r: number) { return c >= 0 && r >= 0 && c < this.layout.cols && r < this.layout.rows && this.layout.cells[r * this.layout.cols + c] > 0 && !this.hidden.has(r * this.layout.cols + c); }
  /** The square a point of the cave's own frame is in, or none outside the lattice. */
  private cellAt(lat: number, t: number): [number, number] | null {
    const c = Math.floor(lat / CAVE.cell + this.layout.cols / 2), r = Math.floor((t - this.site.length) / CAVE.cell);
    return c < 0 || r < 0 || c >= this.layout.cols || r >= this.layout.rows ? null : [c, r];
  }
  /** Whether a point of the cave's own frame has been seen (or is short of the lattice, in the tunnel). */
  private seenAt(lat: number, t: number): boolean { const k = this.cellAt(lat, t); return t < this.site.length || (!!k && this.seen[k[1] * this.layout.cols + k[0]] > 0); }
  private openAt(lat: number, t: number) { const k = this.cellAt(lat, t); return !!k && this.open(k[0], k[1]); }
  /** Open, in the dungeon, or through the gate's doorway into the tunnel's end. */
  private passAt(lat: number, t: number) { return t > this.site.length ? this.openAt(lat, t) || this.outExit(lat, t) : t > this.site.length - 2 && Math.abs(lat) < CAVE.cell / 2; }
  /** Whether a point of the land is out through the way to the deeps, past its doorway by more than half a metre: the deeps' now. */
  throughExit(x: number, z: number): boolean {
    const ex = this.layout.exit;
    if (!ex) return false;
    const [t, lat] = siteLocal(this.site, x, z), along = (lat - this.latOf(ex.c)) * ex.dc + (t - this.tOf(ex.r)) * ex.dr;
    return this.outExit(lat, t) && along > CAVE.cell / 2 + 0.5;
  }
  /** Where one comes back in from the deeps: a metre inside the way out's doorway, in the land, and its floor. */
  insideExit(): { x: number; y: number; z: number } | null {
    const ex = this.layout.exit;
    if (!ex) return null;
    const p = sitePoint(this.site, this.tOf(ex.r) + ex.dr * (CAVE.cell / 2 - 1), this.latOf(ex.c) + ex.dc * (CAVE.cell / 2 - 1));
    return { x: p.x, y: this.site.deep + this.layout.floor[ex.r * this.layout.cols + ex.c], z: p.z };
  }
  /** Whether a point is out through the way to the deeps, within two and a half metres of its doorway: where the deeps take one over. */
  private outExit(lat: number, t: number): boolean {
    const ex = this.layout.exit;
    if (!ex) return false;
    const ox = this.latOf(ex.c), ot = this.tOf(ex.r), along = (lat - ox) * ex.dc + (t - ot) * ex.dr, across = Math.abs((lat - ox) * ex.dr - (t - ot) * ex.dc);
    return along > 0 && along < CAVE.cell / 2 + 2.5 && across < CAVE.cell / 2;
  }

  /** How much the tunnel's rock stands out from its line `t` in, at `j` of the way round. */
  private rough(t: number, j: number): number {
    const ramp = smooth(t / 2.2) * (1 - 0.6 * smooth((t - this.site.length + 1.2) / 1.2));
    return CAVE.rough * ramp * (0.3 + 0.7 * valueNoise2(t * 0.55, j * 0.42, 7) * (0.6 + 0.4 * valueNoise2(t * 2.1, j * 1.3, 9)));
  }

  /** The tunnel: its rock round it, its floor of trodden earth; and the wall of the dungeon's gate at its end, with two torches. */
  private layTunnel(rock: Shape, earth: Shape, walls: Shape) {
    const L = this.site.length, K = 28, phis = archSteps(K), rows = Math.ceil(L / 0.5), ring = K + 3;
    for (let i = 0; i <= rows; i++) {
      const t = (L * i) / rows, y = floorAt(this.site, t);
      rock.floor = y;
      // (Its sides capped where the view from above cuts them, from the cut outward into the rock.)
      if (i < rows) for (const sgn of [-1, 1]) { this.caps.floor = y; const t1 = (L * (i + 1)) / rows; this.caps.panel(new Vector3(sgn * 1.7, Math.max(y, floorAt(this.site, t1)) + CUT + 0.01, t), new Vector3(sgn * (CAVE.hw + CAVE.rough + 1.2 - 1.7), 0, 0), new Vector3(0, 0, t1 - t), UP, 1, 1, 2); }
      for (let j = -1; j <= K + 1; j++) {
        const k = clamp(j, 0, K), [lat, h] = arch(phis[k]), out = new Vector3(lat, h - 0.38 * CAVE.tall, 0).normalize(), r = this.rough(t, k);
        if (k === 0 || k === K) out.set(Math.sign(lat), 0, 0);
        const under = j < 0 || j > K;
        rock.point(lat + out.x * (r + (under ? 0.15 : 0)), y + (under ? -0.3 : h + out.y * r), t, 0, 0, 0, ((k / K) * 11) / 2.5, t / 2.5);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < ring - 1; j++) { const a = i * ring + j, b = a + 1, c = a + ring, d = c + 1; rock.tri(a, b, c); rock.tri(b, d, c); }
    rock.smoothNormals();
    const across = 8, wide = CAVE.hw + 0.9;
    for (let i = -1; i <= rows; i++) {
      const t = i < 0 ? -0.45 : (L * i) / rows, y = floorAt(this.site, Math.max(0, t));
      earth.floor = y;
      for (let k = 0; k <= across; k++) { const lat = -wide + (2 * wide * k) / across; earth.point(lat, y + 0.02 + 0.03 * valueNoise2(lat * 2, t * 2, 3), t, 0, 1, 0, lat / 2.5, t / 2.5); }
    }
    for (let i = 0; i <= rows; i++) for (let k = 0; k < across; k++) { const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1; earth.tri(a, c, b); earth.tri(b, c, d); }
    earth.smoothNormals();
    // The gate: a wall of dressed stone across the tunnel's end, a doorway in it as broad and high as the corridor behind.
    const deep = this.site.deep, W = CAVE.hw + CAVE.rough + 1, top = CAVE.tall + CAVE.rough + 1, half = CAVE.cell / 2, n = new Vector3(0, 0, -1);
    walls.floor = this.caps.floor = deep;
    for (const sgn of [-1, 1]) this.caps.panel(new Vector3(sgn * half, deep + CUT + 0.01, L - 0.3), new Vector3(sgn * (W - half), 0, 0), new Vector3(0, 0, CAP + 0.3), UP, 1, 1, 2);
    walls.panel(new Vector3(half, deep - 0.4, L), new Vector3(W - half, 0, 0), new Vector3(0, top + 0.4, 0), n, 3, 6, 2, half, -0.4);
    walls.panel(new Vector3(-W, deep - 0.4, L), new Vector3(W - half, 0, 0), new Vector3(0, top + 0.4, 0), n, 3, 6, 2, -W, -0.4);
    walls.panel(new Vector3(-half, deep + CAVE.corridor, L), new Vector3(2 * half, 0, 0), new Vector3(0, top - CAVE.corridor, 0), n, 3, 2, 2, -half, CAVE.corridor);
    for (const side of [-1, 1]) this.torches.push({ at: new Vector3(side * (half + 0.75), deep + 2.45, L - 0.3), facing: n.clone(), kind: 'wall', power: 1 });
    if (L > 18) this.torches.push({ at: new Vector3(-CAVE.hw + 0.3, floorAt(this.site, L / 2) + 2.4, L / 2), facing: new Vector3(1, 0, 0), kind: 'wall', power: 1 });
  }

  /** The dungeon's floors (stairs going down step by step), roofs and walls, square by square; doorways; pillars; torches. */
  private layDungeon(walls: Shape, floors: Shape) {
    const { cells, rooms, floor, low, down, top } = this.layout, deep = this.site.deep, half = CAVE.cell / 2;
    /** One wall of square (c, r) toward (dc, dr), from `y0` to `y1` over the gate's floor. */
    const wall = (c: number, r: number, dc: number, dr: number, y0: number, y1: number) => {
      const x = this.latOf(c), t = this.tOf(r), along = new Vector3(-dr, 0, dc), n = new Vector3(-dc, 0, -dr);
      const o = new Vector3(x + dc * half - along.x * half, deep + y0, t + dr * half - along.z * half);
      walls.panel(o, along.clone().multiplyScalar(CAVE.cell), new Vector3(0, y1 - y0, 0), n, 3, Math.max(1, Math.ceil(y1 - y0)), 2, dc ? o.z * dc : -o.x * dr, y0);
    };
    for (let r = 0; r < this.layout.rows; r++) for (let c = 0; c < this.layout.cols; c++) {
      const k = r * this.layout.cols + c;
      if (!cells[k]) continue;
      const x = this.latOf(c), t = this.tOf(r);
      walls.floor = floors.floor = this.caps.floor = deep + floor[k];
      if (down[k] < 0) floors.panel(new Vector3(x - half, deep + floor[k], t - half), new Vector3(CAVE.cell, 0, 0), new Vector3(0, 0, CAVE.cell), UP, 3, 3, 3, x - half, t - half);
      else {
        // (A stair: six steps down its way, each a tread and the riser before it, facing down the stair, as it is seen from below.)
        const [dc, dr] = WAYS[down[k]], go = new Vector3(dc, 0, dr), side = new Vector3(-dr, 0, dc), steps = 6, rise = (floor[k] - low[k]) / steps;
        const tread = (s: number) => (s < 0 ? floor[k] : s >= steps ? low[k] : floor[k] - rise * (s + 0.5));
        for (let s = 0; s <= steps; s++) {
          const o = new Vector3(x, 0, t).addScaledVector(go, (s / steps - 0.5) * CAVE.cell).addScaledVector(side, -half);
          if (s < steps) floors.panel(o.clone().setY(deep + tread(s)), go.clone().multiplyScalar(CAVE.cell / steps), side.clone().multiplyScalar(CAVE.cell), UP, 1, 3, 3, 0, 0);
          walls.panel(o.clone().setY(deep + tread(s)), side.clone().multiplyScalar(CAVE.cell), new Vector3(0, tread(s - 1) - tread(s), 0), go.clone(), 3, 1, 2, 0, tread(s));
        }
      }
      walls.panel(new Vector3(x - half, deep + top[k], t - half), new Vector3(CAVE.cell, 0, 0), new Vector3(0, 0, CAVE.cell), new Vector3(0, -1, 0), 3, 3, 2, x - half, t - half);
      for (const [dc, dr] of WAYS) {
        if (c === this.layout.entry && r === 0 && dr === -1) continue;
        // (The way out to the deeps: open.)
        const ex = this.layout.exit;
        if (ex && c === ex.c && r === ex.r && dc === ex.dc && dr === ex.dr) continue;
        const mine = this.edgeFloor(c, r, dc, dr);
        if (!this.open(c + dc, r + dr)) { wall(c, r, dc, dr, Math.min(floor[k], low[k]), top[k]); this.capWall(c, r, dc, dr); continue; }
        const n = (r + dr) * this.layout.cols + c + dc, theirs = this.edgeFloor(c + dc, r + dr, -dc, -dr);
        if (theirs > mine + 0.01) wall(c, r, dc, dr, mine, theirs);
        if (top[n] < top[k] - 0.01) wall(c, r, dc, dr, Math.max(top[n], mine), top[k]);
      }
    }
    // Torches: along each side of a room two squares long or more, one or two; one to every fourth square of corridor.
    const torchOn = (c: number, r: number, dc: number, dr: number) => {
      this.torches.push({ at: new Vector3(this.latOf(c) + dc * (half - 0.3), deep + floor[r * this.layout.cols + c] + 2.45, this.tOf(r) + dr * (half - 0.3)), facing: new Vector3(-dc, 0, -dr), kind: 'wall', power: 1 });
    };
    const doorAt = (c: number, r: number, dc: number, dr: number) => this.layout.doors.some((d) => (d.c + d.dc === c && d.r + d.dr === r && d.dc === -dc && d.dr === -dr));
    for (const room of rooms) {
      // (None burning in a room walled up an age ago.)
      if (room.kind === 'hidden') continue;
      const lines: [number, number, number, number][][] = [[], [], [], []];
      for (let j = room.r0; j < room.r0 + room.h; j++) { if (!this.open(room.c0 - 1, j)) lines[0].push([room.c0, j, -1, 0]); if (!this.open(room.c0 + room.w, j)) lines[1].push([room.c0 + room.w - 1, j, 1, 0]); }
      for (let i = room.c0; i < room.c0 + room.w; i++) { if (!this.open(i, room.r0 - 1)) lines[2].push([i, room.r0, 0, -1]); if (!this.open(i, room.r0 + room.h)) lines[3].push([i, room.r0 + room.h - 1, 0, 1]); }
      for (const line of lines) {
        if (line.length < 2) continue;
        const marks = line.length >= 4 ? [0.25, 0.75] : [0.5];
        for (const m of marks) { const [c, r, dc, dr] = line[Math.min(line.length - 1, Math.floor(m * line.length))]; if (!doorAt(c, r, dc, dr)) torchOn(c, r, dc, dr); }
      }
    }
    for (let r = 0; r < this.layout.rows; r++) for (let c = 0; c < this.layout.cols; c++) {
      const k = r * this.layout.cols + c;
      if (cells[k] !== 1 || this.layout.far[k] % 4 !== 2 || down[k] >= 0) continue;
      const along = this.open(c, r - 1) || this.open(c, r + 1);
      const [dc, dr] = along ? (this.open(c - 1, r) ? [1, 0] : [-1, 0]) : (this.open(c, r - 1) ? [0, 1] : [0, -1]);
      if (!this.open(c + dc, r + dr)) torchOn(c, r, dc, dr);
    }
    // The doorways: a frame of dressed stone, jambs and a lintel, standing in the corridor's end where it opens into a room.
    for (const d of this.layout.doors) {
      // (None round the way into the hidden room: its wall stands across it, flush with the room's.)
      if (d.kind === 'secret') continue;
      const k = d.r * this.layout.cols + d.c, x = this.latOf(d.c), t = this.tOf(d.r), go = new Vector3(d.dc, 0, d.dr), side = new Vector3(-d.dr, 0, d.dc);
      const f = this.edgeFloor(d.c, d.r, d.dc, d.dr), roof = top[k], edge = new Vector3(x, 0, t).addScaledVector(go, half - 0.22);
      walls.floor = this.caps.floor = deep + f;
      for (const s of [-1, 1]) {
        const at = edge.clone().addScaledVector(side, s * (half - 0.24));
        this.block(walls, at.setY(deep + f + (roof - f) / 2), side, 0.48, roof - f, 0.44);
        const p = edge.clone().addScaledVector(side, s * (half - 0.24));
        this.posts.push({ lat: p.x, t: p.z, r: 0.32 });
      }
      this.block(walls, edge.clone().setY(deep + roof - 0.3), side, CAVE.cell - 0.96, 0.6, 0.44);
    }
    // The hall's pillars, standing at the corners of its squares a square in from its walls: a shaft on a plinth, under a capital.
    for (const room of rooms) {
      if (room.kind !== 'hall') continue;
      const f = room.level * DROP;
      walls.floor = this.caps.floor = deep + f;
      for (const i of [1, room.w - 1]) for (const j of [1, room.h - 1]) {
        const x = this.latOf(room.c0) - half + i * CAVE.cell, t = this.tOf(room.r0) - half + j * CAVE.cell, X = new Vector3(1, 0, 0);
        this.block(walls, new Vector3(x, deep + f + 0.22, t), X, 1.24, 0.44, 1.24);
        this.block(walls, new Vector3(x, deep + f + CAVE.room / 2, t), X, 0.9, CAVE.room - 0.9, 0.9);
        this.block(walls, new Vector3(x, deep + f + CAVE.room - 0.22, t), X, 1.24, 0.44, 1.24);
        this.posts.push({ lat: x, t, r: 0.68 });
      }
    }
  }
  /** A block of stone about `mid`, `w` broad along `side` (level), `h` high, `d` deep: its four sides, its top and its foot. */
  private block(s: Shape, mid: Vector3, side: Vector3, w: number, h: number, d: number) {
    const go = new Vector3(side.z, 0, -side.x), up = new Vector3(0, h, 0), foot = mid.clone().addScaledVector(UP, -h / 2);
    for (const [n, along, out, across] of [[go, side, d, w], [go.clone().negate(), side, d, w], [side, go, w, d], [side.clone().negate(), go, w, d]] as [Vector3, Vector3, number, number][]) {
      s.panel(foot.clone().addScaledVector(n, out / 2).addScaledVector(along, -across / 2), along.clone().multiplyScalar(across), up, n, 1, Math.max(1, Math.ceil(h / 1.2)), 2, 0, 0);
    }
    for (const [y, n] of [[h / 2, UP], [-h / 2, new Vector3(0, -1, 0)]] as [number, Vector3][]) s.panel(mid.clone().addScaledVector(UP, y).addScaledVector(side, -w / 2).addScaledVector(go, -d / 2), side.clone().multiplyScalar(w), go.clone().multiplyScalar(d), n, 1, 1, 2);
    // (Cut across where the view from above cuts it, its cut face dark.)
    const cut = s.floor + CUT;
    if (mid.y - h / 2 < cut && mid.y + h / 2 > cut) this.caps.panel(mid.clone().setY(cut + 0.01).addScaledVector(side, -w / 2).addScaledVector(go, -d / 2), side.clone().multiplyScalar(w), go.clone().multiplyScalar(d), UP, 1, 1, 2);
  }
  /** The dark cap over a wall of square (c, r) toward (dc, dr) where the view from above cuts it: from the wall back into the rock. */
  private capWall(c: number, r: number, dc: number, dr: number) {
    const half = CAVE.cell / 2, x = this.latOf(c), t = this.tOf(r), along = new Vector3(-dr, 0, dc), out = new Vector3(dc, 0, dr);
    const o = new Vector3(x + dc * half - along.x * (half + CAP), this.caps.floor + CUT + 0.01, t + dr * half - along.z * (half + CAP));
    this.caps.panel(o, along.clone().multiplyScalar(CAVE.cell + 2 * CAP), out.clone().multiplyScalar(CAP), UP, 1, 1, 2);
  }
  /** How high the floor of square (c, r) is at its edge toward (dc, dr), over the gate's: a stair's high end, or its low end. */
  private edgeFloor(c: number, r: number, dc: number, dr: number): number {
    const k = r * this.layout.cols + c, d = this.layout.down[k];
    if (d < 0) return this.layout.floor[k];
    const [a, b] = WAYS[d];
    return a === dc && b === dr ? this.layout.low[k] : a === -dc && b === -dr ? this.layout.floor[k] : Math.min(this.layout.floor[k], this.layout.low[k]);
  }
  /** How high the floor is at a point of the dungeon (in its own frame), over the gate's: down a stair, as far down it as the point is. */
  private floorIn(lat: number, t: number): number {
    const at = this.cellAt(lat, t), ex = this.layout.exit;
    if (!at && ex && this.outExit(lat, t)) return this.layout.floor[ex.r * this.layout.cols + ex.c];
    if (!at) return 0;
    const k = at[1] * this.layout.cols + at[0], d = this.layout.down[k];
    if (d < 0) return this.layout.floor[k];
    const [dc, dr] = WAYS[d], u = (lat - this.latOf(at[0])) / CAVE.cell, v = (t - this.tOf(at[1])) / CAVE.cell, s = clamp((dc ? dc * u : dr * v) + 0.5, 0, 1);
    return this.layout.floor[k] + (this.layout.low[k] - this.layout.floor[k]) * s;
  }

  /** Whether the light from `a` reaches `b` (both in the cave's own frame), across the plan: none of the solid stone between. */
  private sees(a: Vector3, b: Vector3): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 0.35), L = this.site.length;
    for (let i = 1; i < n; i++) {
      const lat = a.x + ((b.x - a.x) * i) / n, t = a.z + ((b.z - a.z) * i) / n;
      if (t < -0.3) continue;
      if (t <= L ? Math.abs(lat) > CAVE.hw + CAVE.rough : !this.openAt(lat, t)) return false;
    }
    return true;
  }
  /** The light at a point of the cave's own frame facing `n`: the torches' that reach it, the day's from the mouth, and the dark's. */
  private lightAt(p: Vector3, n: Vector3, into: Color, round = false) {
    into.copy(DARK);
    if (p.z < 14) addScaled(into, DAYLIGHT, 1.25 * Math.exp(-Math.max(0, p.z) / 3) * (0.5 + 0.5 * Math.max(0, -n.z)));
    const from = p.clone().addScaledVector(n, 0.2);
    for (const torch of this.torches) {
      const d = torch.at.distanceTo(p);
      if (d > TORCH_REACH) continue;
      const dir = torch.at.clone().sub(p).divideScalar(Math.max(d, 1e-3)), face = round ? 0.75 : clamp(n.dot(dir) * 0.8 + 0.2, 0, 1);
      if (face <= 0 || !this.sees(torch.at, from)) continue;
      addScaled(into, torch.color ?? this.torchLight, torch.power * Math.min(2.2, 1.9 / (1 + (d / 1.1) ** 2)) * smooth((TORCH_REACH - d) / 4) * face);
    }
    return into;
  }
  private bake(s: Shape) {
    const p = new Vector3(), n = new Vector3(), c = new Color();
    for (let i = 0; i < s.count; i++) {
      p.fromArray(s.pos, i * 3); n.fromArray(s.nor, i * 3);
      this.lightAt(p, n, c);
      s.light[i * 3] = c.r; s.light[i * 3 + 1] = c.g; s.light[i * 3 + 2] = c.b;
    }
  }
  /** A material for a prop's parts of one stuff (tinted each part its own colour), not yet lit (`lit`). */
  private stuffOf(stuff: Stuff): MeshStandardNodeMaterial {
    const P = paintsOf(), paint = STUFF_PAINT[stuff], m = new MeshStandardNodeMaterial({ vertexColors: true, ...STUFF_LOOK[stuff] });
    if (paint) { m.map = P[paint].map; m.normalMap = P[paint].normal; }
    // (The coals in a brazier glow of themselves.)
    if (stuff === 'coal') m.userData.glow = vec3(1.6, 0.5, 0.12).mul(sin(time.mul(3.1)).mul(0.15).add(0.85));
    // (The fungi glow of themselves too, cold, slowly brighter and back.)
    if (stuff === 'fungus') m.userData.glow = attribute('color', 'vec3').mul(sin(time.mul(0.9)).mul(0.2).add(0.75));
    return m;
  }
  /** A material for things in the dungeon, lit as its stone is: each at its own place (`at`, one to each of the shape's copies). */
  private lit(m: MeshStandardNodeMaterial, shape: BufferGeometry, at: Vector3[], paint?: Texture, tinted = false): MeshStandardNodeMaterial {
    const light = new Float32Array(at.length * 3), c = new Color();
    // (Each lit as a thing standing in the room is, from all round, at a metre up; and never as bright as a wall right by a torch, which
    // a thing holding its own flame would otherwise be.)
    at.forEach((p, i) => { this.lightAt(p.clone().addScaledVector(UP, 1), UP, c, true); const k = Math.min(1, 1.3 / Math.max(c.r, c.g, c.b, 1e-3)); light.set([c.r * k, c.g * k, c.b * k], i * 3); });
    shape.setAttribute('aThing', new InstancedBufferAttribute(light, 3));
    const plain = paint ? (texture(paint, uv()).rgb as N).mul(m.color) : vec3(m.color.r, m.color.g, m.color.b), albedo = tinted ? (plain as N).mul(attribute('color', 'vec3')) : plain;
    m.emissiveNode = (albedo as N).mul(attribute('aThing', 'vec3')).mul(this.flicker).add(m.userData.glow ?? vec3(0, 0, 0));
    m.lightsNode = lights([this.lantern]);
    this.cutAway(m);
    return m;
  }

  /**
   * How high the mound stands `t` in and `lat` across: over the tunnel, its rock and some over it, rounded; elsewhere a little over
   * the land, and at its edges sunk under it; lumpy.
   */
  private moundAt(t: number, lat: number): number {
    const b = this.groundAt(lat, t);
    const edge = clamp(Math.max((Math.abs(lat) - (HOLE_HALF + 0.8)) / (MOUND_HALF - HOLE_HALF - 0.8), (t - this.site.holeTo - 0.5) / 2.5), 0, 1);
    const w = HOLE_HALF + 1.4, dome = t <= this.site.length && Math.abs(lat) < w ? floorAt(this.site, t) + (CAVE.tall + CAVE.rough + 0.8) * Math.sqrt(1 - (lat / w) ** 2) : -Infinity;
    const lump = 0.45 * (valueNoise2(t * 0.6, lat * 0.6, 21) - 0.4) * (1 - smooth(edge));
    return Math.max(b + 0.3 - 0.95 * smooth(edge), dome) + lump;
  }
  /** The mound over the hole, and the face of rock across its front with the mouth in it, lofted from the mouth out to the mound. */
  private layMound(mound: Shape, face: Shape) {
    const y0 = this.site.y0, K = 28, phis = archSteps(K), MH = MOUND_HALF, top = Array.from({ length: 21 }, (_, i) => -MH + (2 * MH * i) / 20);
    const foot = (lat: number) => Math.min(y0 - 1.4, this.moundAt(0, lat) - 0.6);
    const inner: [number, number][] = [[-CAVE.hw, y0 - 1.4], ...phis.map((phi) => { const [lat, h] = arch(phi); return [lat, y0 + h] as [number, number]; }), [CAVE.hw, y0 - 1.4]];
    const outer: [number, number][] = [];
    for (let i = 0; i < 5; i++) { const lat = -MH, y = foot(lat) + ((this.moundAt(0, lat) - foot(lat)) * i) / 5; outer.push([lat, y]); }
    for (const lat of top) outer.push([lat, this.moundAt(0, lat)]);
    for (let i = 4; i >= 0; i--) { const lat = MH, y = foot(lat) + ((this.moundAt(0, lat) - foot(lat)) * (i + 1)) / 6; outer.push([lat, i === 4 ? y : y]); }
    outer.length = inner.length;
    const J = 7;
    for (let j = 0; j <= J; j++) for (let i = 0; i < inner.length; i++) {
      const s = (j / J) ** 1.15, lat = inner[i][0] + (outer[i][0] - inner[i][0]) * s, y = inner[i][1] + (outer[i][1] - inner[i][1]) * s;
      const bulge = 0.6 * Math.sin(Math.PI * s) * (0.35 + 0.65 * valueNoise2(i * 0.35, j * 0.6, 4));
      face.point(lat, y, -bulge, 0, 0, -1, lat / 3, y / 3);
    }
    const n = inner.length;
    for (let j = 0; j < J; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; face.tri(a, c, b); face.tri(b, c, d); }
    face.smoothNormals();
    for (let i = 0; i < face.count; i++) face.snow[i] = smooth((face.nor[i * 3 + 1] - 0.45) / 0.3);
    const rows = Math.ceil((this.site.holeTo + 3) / 0.6);
    for (let k = 0; k <= rows; k++) { const t = ((this.site.holeTo + 3) * k) / rows; for (const lat of top) mound.point(lat, this.moundAt(t, lat), t, 0, 1, 0, lat / 3, t / 3); }
    const w = top.length;
    for (let k = 0; k < rows; k++) for (let i = 0; i < w - 1; i++) { const a = k * w + i, b = a + 1, c = a + w, d = c + 1; mound.tri(a, c, b); mound.tri(b, c, d); }
    mound.smoothNormals();
    for (let i = 0; i < mound.count; i++) mound.snow[i] = smooth((mound.nor[i * 3 + 1] - 0.55) / 0.25) * (0.75 + 0.25 * valueNoise2(mound.pos[i * 3] * 0.8, mound.pos[i * 3 + 2] * 0.8, 2));
  }

  /** The camp, `tc` along the way in: the fire, logs to sit on, the ski rack, wood stacked, torches at the mouth. */
  private layCamp(tc: number) {
    const P = paintsOf(), f = this.fireAt;
    const barkPaint = new MeshStandardNodeMaterial({ map: P.bark.map, normalMap: P.bark.normal, roughness: 0.9 });
    const charred = new MeshStandardNodeMaterial({ map: P.bark.map, color: 0x6a5446, roughness: 0.95 });
    const stonePaint = new MeshStandardNodeMaterial({ map: P.rock.map, normalMap: P.rock.normal, roughness: 0.9 });
    const put = (m: Mesh, x: number, z: number, up = 0, yaw = 0, roll = 0) => { m.position.set(x, this.groundAt(x, z) + up, z); m.rotation.set(0, yaw, roll); m.castShadow = m.receiveShadow = true; this.frame.add(m); return m; };
    const stones = new InstancedMesh(new DodecahedronGeometry(0.17, 0), stonePaint, 11);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, x = f.x + 0.62 * Math.cos(a), z = f.z + 0.62 * Math.sin(a);
      stones.setMatrixAt(i, this.m4.compose(new Vector3(x, this.groundAt(x, z) + 0.05, z), new Quaternion().setFromAxisAngle(UP, a * 3), new Vector3(1, 0.7, 1).multiplyScalar(this.rng.range(0.8, 1.2))));
    }
    stones.castShadow = stones.receiveShadow = true;
    this.frame.add(stones);
    const log = new CylinderGeometry(0.05, 0.065, 0.62, 7);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, m = new Mesh(log, charred); m.position.set(f.x + 0.2 * Math.cos(a), f.y + 0.16, f.z + 0.2 * Math.sin(a)); m.lookAt(f.x, f.y + 0.75, f.z); m.rotateX(Math.PI / 2); m.castShadow = true; this.frame.add(m); }
    // (Logs to sit on, on the far side of the fire from the way in to the mouth.)
    const bench = new CylinderGeometry(0.19, 0.2, 1.9, 9).rotateZ(Math.PI / 2);
    put(new Mesh(bench, barkPaint), f.x + 1.75, f.z - 0.4, 0.17, Math.PI / 2 + 0.25);
    put(new Mesh(bench, barkPaint), f.x + 0.4, f.z - 1.8, 0.17, 0.15);
    this.posts.push({ lat: f.x, t: f.z, r: 0.95 }, { lat: f.x + 1.75, t: f.z - 0.4, r: 0.55 }, { lat: f.x + 1.75, t: f.z + 0.5, r: 0.45 }, { lat: f.x + 0.4, t: f.z - 1.8, r: 0.55 }, { lat: f.x - 0.5, t: f.z - 1.8, r: 0.45 });
    // The rack, across the way in from the fire: two posts and a bar, the skis leant on it while they are off.
    const rx = -3.4, rt = tc + 1.2, post = new CylinderGeometry(0.05, 0.06, 1.45, 6).translate(0, 0.72, 0), bar = new CylinderGeometry(0.04, 0.04, 2.0, 6).rotateX(Math.PI / 2);
    for (const s of [-0.95, 0.95]) put(new Mesh(post, barkPaint), rx, rt + s);
    put(new Mesh(bar, barkPaint), rx, rt, 1.32);
    this.rack.position.set(rx, this.groundAt(rx, rt), rt);
    this.parking = [rx - 1.5, rt];
    this.frame.add(this.rack);
    this.posts.push({ lat: rx, t: rt - 0.95, r: 0.35 }, { lat: rx, t: rt, r: 0.35 }, { lat: rx, t: rt + 0.95, r: 0.35 });
    // (Wood stacked by the rack.)
    const billet = new CylinderGeometry(0.08, 0.09, 0.75, 7).rotateX(Math.PI / 2);
    for (let i = 0; i < 6; i++) { const row = i < 3 ? 0 : 1, k = i < 3 ? i : i - 3; put(new Mesh(billet, barkPaint), rx - 0.9 + 0.17 * k + 0.08 * row, rt - 1.9, 0.09 + 0.15 * row, this.rng.range(-0.1, 0.1)); }
    this.posts.push({ lat: rx - 0.75, t: rt - 1.9, r: 0.45 });
    // (A torch on a post either side of the mouth.)
    const pole = new CylinderGeometry(0.045, 0.06, 2.1, 6).translate(0, 1.05, 0);
    for (const side of [-1, 1]) {
      const x = side * (CAVE.hw + 0.7), z = -0.9;
      put(new Mesh(pole, barkPaint), x, z);
      this.torches.push({ at: new Vector3(x, this.groundAt(x, z) + 2.22, z), facing: new Vector3(0, 0, -1), kind: 'post', power: 1 });
      this.posts.push({ lat: x, t: z, r: 0.3 });
    }
  }

  /**
   * What stands about the dungeon, room by room, as its kind has it, of the props made for it (`slopeProps.ts`): barrels, crates and sacks
   * in a store's corners; stone coffins in a crypt, urns, the dead; skulls and bones along an ossuary's walls; an altar in a shrine, its
   * candles, a candelabrum, a statue; bookcases round a library, a table with books, a scroll and a candle, stools; in a cell a bedroll,
   * a bucket, shackles on the wall and whoever was left there; in a guardroom a table and stools, a rack of spears, crates; crates and
   * gold in a vault; banners and braziers in a hall; cobwebs in the corners of the oldest rooms; rubble here and there. And the last
   * room's: a great coffin on its dais (a tomb), an altar on its dais (a sanctum), a desk (the warden's), heaps of gold (a hoard), and
   * before it the chest. Gives back the treasure's glow.
   */
  private layThings(): Mesh {
    const P = paintsOf(), rng = this.rng.fork('things'), deep = this.site.deep, half = CAVE.cell / 2, props = new Props();
    const at = (x: number, y: number, t: number) => new Vector3(x, y, t);
    /** A prop laid with its foot at (x, y, t), turned `turn`; in the way of one walking as far as it reaches, unless `free`. */
    const put = (k: PropKind, x: number, y: number, t: number, turn = 0, scale: number | [number, number, number] = 1, free = false) => {
      const r = props.put(k, at(x, y, t), turn, scale);
      if (r > 0 && !free) this.posts.push({ lat: x, t, r });
    };
    const onFloor = (x: number, t: number, f: number) => this.openAt(x, t) && Math.abs(this.floorIn(x, t) - f) < 0.01;
    /** `n` small things of kind `k` strewn about (`x`, `t`), `r` either way, on the floor `f` (not in the way). */
    const strew = (k: PropKind, x: number, t: number, n: number, r: number, f: number, scale: () => number = () => 1) => {
      for (let i = 0; i < n; i++) { const px = x + rng.range(-r, r), pt = t + rng.range(-r, r); if (onFloor(px, pt, f)) put(k, px, deep + f, pt, rng.range(0, 6.3), scale(), true); }
    };
    /** Each square of a room's walls with rock behind it (not a way in): where its middle is against the wall, and which way it faces in. */
    const walls_ = (x0: number, t0: number, x1: number, t1: number): [number, number, Vector3][] => {
      const out: [number, number, Vector3][] = [];
      for (let x = x0 + half; x < x1; x += CAVE.cell) { if (!this.openAt(x, t0 - 0.5)) out.push([x, t0, new Vector3(0, 0, 1)]); if (!this.openAt(x, t1 + 0.5)) out.push([x, t1, new Vector3(0, 0, -1)]); }
      for (let t = t0 + half; t < t1; t += CAVE.cell) { if (!this.openAt(x0 - 0.5, t)) out.push([x0, t, new Vector3(1, 0, 0)]); if (!this.openAt(x1 + 0.5, t)) out.push([x1, t, new Vector3(-1, 0, 0)]); }
      return out;
    };
    /** Facing `n` (level): the turn about the upright that brings a prop's front (+z) round to it. */
    const facing = (n: { x: number; z: number }) => Math.atan2(n.x, n.z);
    /** Against a wall square: something of kind `k` with its back to it, `off` out from it. */
    const onWall = (k: PropKind, [x, t, n]: [number, number, Vector3], y: number, off: number, free = false) => put(k, x + n.x * off, y, t + n.z * off, facing(n), 1, free);
    /** A wall square no torch hangs on (a bookcase or a banner there would hide it, and stand dark in front of its light). */
    const bare = ([x, t]: [number, number, Vector3]) => !this.torches.some((q) => q.kind === 'wall' && Math.hypot(q.at.x - x, q.at.z - t) < 0.8);
    // (Which way into each room its doorway leads, from the corridor: the room's far side is the way on from there.)
    const into = (i: number): [number, number] => { const d = this.layout.doors.find((q) => this.layout.roomAt[(q.r + q.dr) * this.layout.cols + q.c + q.dc] === i); return d ? [d.dc, d.dr] : [0, 1]; };
    const theme = this.layout.tags.theme;
    this.layout.rooms.forEach((room, ri) => {
      const f = room.level * DROP, y = deep + f, x0 = this.latOf(room.c0) - half, t0 = this.tOf(room.r0) - half, x1 = x0 + room.w * CAVE.cell, t1 = t0 + room.h * CAVE.cell;
      const cx = (x0 + x1) / 2, ct = (t0 + t1) / 2, small = Math.min(x1 - x0, t1 - t0) / 2, [dc, dr] = into(ri), roof = y + CAVE.room;
      // (Its corners, those with wall on both sides, clear of the ways in; its walls; the side across from the way in, a little in from it.)
      const corners = ([[x0, t0, 1, 1], [x1, t0, -1, 1], [x0, t1, 1, -1], [x1, t1, -1, -1]] as const).filter(([x, t, sx, st]) => !this.openAt(x - sx * 0.5, t + st * 1) && !this.openAt(x + sx * 1, t - st * 0.5));
      const sides = walls_(x0, t0, x1, t1), back = (inset: number) => [cx + dc * ((x1 - x0) / 2 - inset), ct + dr * ((t1 - t0) / 2 - inset)] as [number, number];
      const toward = Math.atan2(-dc, -dr), side = new Vector3(-dr, 0, dc);
      const cobwebs = (n: number) => { for (const [x, t, sx, st] of corners.slice(0, n)) put('cobweb', x + sx * 0.3, roof - 0.35, t + st * 0.3, Math.atan2(sx, st) + Math.PI, 1, true); };
      switch (room.kind) {
        case 'store':
          for (const [x, t, sx, st] of corners.slice(0, 3)) for (let i = 0; i < 4; i++) {
            const px = x + sx * (0.5 + (i % 2) * 0.8), pt = t + st * (0.5 + (i >> 1) * 0.8), pick = rng.next();
            if (pick < 0.4) put('barrel', px, y, pt, rng.range(0, 6.3));
            else if (pick < 0.8) { put('crate', px, y, pt, rng.range(-0.3, 0.3)); if (rng.chance(0.4)) put('crate', px, y + 0.7, pt, rng.range(-0.6, 0.6), 0.8, true); }
            else put('sack', px, y, pt, rng.range(0, 6.3));
          }
          strew('rubble', cx, ct, 3, small - 0.6, f);
          cobwebs(1);
          break;
        case 'crypt': {
          const along = room.w >= room.h, n = Math.max(1, Math.min(3, Math.floor((along ? room.w : room.h) * 0.8)));
          for (let i = 0; i < n; i++) {
            const k = (i + 0.5) / n, px = along ? x0 + (x1 - x0) * k : cx, pt = along ? ct : t0 + (t1 - t0) * k, turn = along ? 0 : Math.PI / 2;
            put('sarcophagus', px, y, pt, turn, 1, true);
            for (const s of [-0.6, 0.6]) this.posts.push({ lat: px + (along ? 0 : s), t: pt + (along ? s : 0), r: 0.6 });
          }
          for (const [x, t, sx, st] of corners.slice(0, 2)) put('urn', x + sx * 0.45, y, t + st * 0.45, rng.range(0, 6.3));
          if (rng.chance(0.5)) strew('skeleton', cx, ct, 1, small - 1.2, f);
          strew('bones', cx, ct, 5, small - 0.4, f);
          strew('skull', cx, ct, 3, small - 0.4, f);
          cobwebs(3);
          break;
        }
        case 'ossuary':
          // (Along every wall, a heap: skulls in rows over bones.)
          for (const w of sides) for (const s of [-1.05, -0.35, 0.35, 1.05]) {
            const [x, t, n] = w, along = new Vector3(-n.z, 0, n.x), px = x + n.x * 0.3 + along.x * s, pt = t + n.z * 0.3 + along.z * s;
            put('bones', px, y, pt, facing(n) + rng.range(-0.3, 0.3), 1, true);
            put('skull', px, y + 0.08, pt, facing(n) + rng.range(-0.4, 0.4), 1, true);
            if (rng.chance(0.6)) put('skull', px + n.x * 0.05, y + 0.27, pt + n.z * 0.05, facing(n) + rng.range(-0.4, 0.4), 1, true);
            this.posts.push({ lat: px, t: pt, r: 0.3 });
          }
          strew('skeleton', cx, ct, 1, small - 1.4, f);
          strew('bones', cx, ct, 4, small - 0.8, f);
          cobwebs(4);
          break;
        case 'shrine': {
          const [ax, at_] = back(0.9);
          put('altar', ax, y, at_, toward);
          for (let i = 0; i < 4; i++) put('candlestick', ax + side.x * (i - 1.5) * 0.4, y + 0.98, at_ + side.z * (i - 1.5) * 0.4, 0, 1, true);
          for (const s of [-1, 1]) put('candelabrum', ax + side.x * s * 1.5, y, at_ + side.z * s * 1.5 - dr * 0.2, toward);
          if (corners.length) { const [x, t, sx, st] = corners[0]; put('statue', x + sx * 0.9, y, t + st * 0.9, Math.atan2(sx, st)); }
          strew('rubble', cx, ct, 2, small - 0.8, f);
          break;
        }
        case 'library':
          for (const w of sides.filter(bare)) onWall('bookcase', w, y, 0.22);
          if (small >= 2.5) {
            put('table', cx, y, ct, rng.range(-0.15, 0.15));
            put('books', cx - 0.4, y + 0.82, ct + 0.1, rng.range(0, 6.3), 1, true);
            put('scroll', cx + 0.2, y + 0.82, ct - 0.1, rng.range(0, 6.3), 1, true);
            put('candlestick', cx + 0.6, y + 0.82, ct + 0.2, 0, 1, true);
            for (const s of [-1, 1]) put('stool', cx + s * 0.4, y, ct + s * 0.75, rng.range(0, 6.3));
          }
          strew('books', cx, ct, 2, small - 1, f);
          cobwebs(2);
          break;
        case 'cell': {
          const w = sides[rng.int(0, Math.max(0, sides.length - 1))];
          if (w) { const [x, t, n] = w; put('bedroll', x + n.x * 0.55, y, t + n.z * 0.55, facing(n) + Math.PI / 2); }
          if (sides.length > 1) onWall('shackles', sides[(sides.indexOf(w) + 1) % sides.length], y, 0.02, true);
          put('bucket', x0 + 0.45, y, t0 + 0.45, rng.range(0, 6.3));
          if (rng.chance(0.4)) strew('skeleton', cx, ct, 1, 0.3, f); else strew('bones', cx, ct, 2, small - 0.5, f);
          cobwebs(1);
          break;
        }
        case 'guard':
          put('table', cx, y, ct, rng.range(-0.2, 0.2));
          put('candlestick', cx + 0.5, y + 0.82, ct, 0, 1, true);
          for (const s of [-1, 1]) put('stool', cx + s * 1.25, y, ct + rng.range(-0.3, 0.3), rng.range(0, 6.3));
          if (sides.length) onWall('weaponRack', sides[0], y, 0.2);
          for (const [x, t, sx, st] of corners.slice(0, 1)) for (let i = 0; i < 2; i++) put(i ? 'barrel' : 'crate', x + sx * (0.5 + i * 0.85), y, t + st * 0.5, rng.range(-0.3, 0.3));
          break;
        case 'vault':
          for (const [x, t, sx, st] of corners.slice(0, 3)) for (let i = 0; i < 3; i++) put(i === 2 ? 'sack' : 'crate', x + sx * (0.5 + (i % 2) * 0.8), y, t + st * (0.5 + (i >> 1) * 0.8), rng.range(-0.2, 0.2));
          strew('coins', cx, ct, 6, small - 0.7, f);
          if (small >= 2.5) put('goldHeap', cx, y, ct, rng.range(0, 6.3), 0.6);
          break;
        case 'hall':
          // (Banners down its walls, in a temple or a tomb; a brazier burning either side of its middle.)
          if (theme === 'temple' || theme === 'tomb') for (const w of sides.filter(bare).filter((_, i) => i % 2 === 0)) onWall('banner', w, y, 0.02, true);
          for (const s of [-1, 1]) put('brazier', cx + side.x * s * 1.5 + rng.range(-0.1, 0.1), y, ct + side.z * s * 1.5, 0);
          strew('rubble', cx, ct, 4, small - 0.4, f);
          cobwebs(2);
          break;
        case 'gate':
          for (const [x, t, sx, st] of corners.slice(0, 2)) put(theme === 'tomb' || theme === 'temple' ? 'urn' : 'barrel', x + sx * 0.45, y, t + st * 0.45, rng.range(0, 6.3));
          break;
        case 'hidden':
          // (Laid by the plot, with its stash: `layThings`, after the rooms.)
          break;
        default: {
          // The last room: across from the way in, what it is for; and the chest before it.
          const [bx, bt] = back(room.kind === 'hoard' || room.kind === 'warden' ? 1.2 : 1.6);
          // (Where whoever it was made for stands again, as a ghost: over their coffin, their altar, behind their desk, on their gold.)
          this.ghostLocal.set(bx, y + (room.kind === 'tomb' ? 1.1 : room.kind === 'sanctum' ? 0.5 : 0.1), bt);
          let ahead = 2.9;
          if (room.kind === 'tomb' || room.kind === 'sanctum') {
            put('dais', bx, y, bt, toward, room.kind === 'tomb' ? 1 : [1, 1, 0.8], true);
            if (room.kind === 'tomb') put('sarcophagus', bx, y + 0.34, bt, toward, 1.2, true);
            else {
              put('altar', bx, y + 0.34, bt, toward, 1, true);
              for (let i = 0; i < 5; i++) put('candlestick', bx + side.x * (i - 2) * 0.35, y + 1.32, bt + side.z * (i - 2) * 0.35, 0, 1, true);
              for (const w of sides.filter(bare).filter(([x, t]) => Math.hypot(x - bx, t - bt) < 2.5)) onWall('banner', w, y, 0.02, true);
            }
            for (const s of [-1.1, 0, 1.1]) this.posts.push({ lat: bx + dc * s, t: bt + dr * s, r: 1.3 });
            if ((dc ? t1 - t0 : x1 - x0) >= 6) for (const s of [-1, 1]) put('statue', bx + side.x * s * 2.2, y, bt + side.z * s * 2.2, toward);
            for (const s of [-1, 1]) put('brazier', bx - dc * 2.6 + side.x * s * 1.7, y, bt - dr * 2.6 + side.z * s * 1.7, 0);
            for (const [x, t, sx, st] of corners.slice(0, 2)) put('urn', x + sx * 0.45, y, t + st * 0.45, rng.range(0, 6.3));
          } else if (room.kind === 'warden') {
            put('desk', bx, y, bt, toward);
            put('stool', bx + dc * 0.9, y, bt + dr * 0.9, 0);
            put('candlestick', bx + side.x * 0.6, y + 0.84, bt + side.z * 0.6, 0, 1, true);
            put('books', bx - side.x * 0.5, y + 0.84, bt - side.z * 0.5, rng.range(0, 6.3), 1, true);
            for (const w of sides.filter((_, i) => i % 3 === 1)) onWall('shackles', w, y, 0.02, true);
            for (const [x, t, sx, st] of corners.slice(0, 2)) put('barrel', x + sx * 0.55, y, t + st * 0.55, 0);
            ahead = 1.9;
          } else {
            for (const [x, t, sx, st] of corners) put('goldHeap', x + sx * 0.8, y, t + st * 0.8, rng.range(0, 6.3), rng.range(0.8, 1.2));
            for (const [x, t, sx, st] of corners.slice(0, 2)) put('crate', x + sx * 0.5 + (sx > 0 ? 1.3 : -1.3), y, t + st * 0.5, rng.range(-0.3, 0.3));
            ahead = 1.4;
          }
          const cx2 = bx - dc * ahead, ct2 = bt - dr * ahead;
          this.chest.at.copy(this.toLand(cx2, y, ct2));
          this.chestTurn = Math.atan2(dc, dr);
          this.posts.push({ lat: cx2, t: ct2, r: 0.72 });
          for (let i = 0; i < (room.kind === 'hoard' ? 14 : 7); i++) {
            const a = rng.range(0, 6.3), d = 0.75 + rng.range(0, room.kind === 'hoard' ? 1.5 : 1.0) ** 2, px = cx2 + Math.sin(a) * d, pt = ct2 + Math.cos(a) * d;
            if (onFloor(px, pt, f) && Math.hypot(px - bx, pt - bt) > 1.4) put('coins', px, y, pt, rng.range(0, 6.3), 1, true);
          }
          strew('skeleton', cx - dc * 1.5, ct - dr * 1.5, room.kind === 'hoard' ? 0 : 1, 1, f);
          strew('bones', cx, ct, 4, small - 0.6, f);
          cobwebs(2);
        }
      }
    });
    // (Here and there in the corridors, rubble fallen from the roof.)
    for (let r = 0; r < this.layout.rows; r++) for (let c = 0; c < this.layout.cols; c++) {
      const k = r * this.layout.cols + c;
      if (this.layout.cells[k] === 1 && this.layout.down[k] < 0 && rng.chance(0.18)) strew('rubble', this.latOf(c), this.tOf(r), 2, 1.1, this.layout.floor[k]);
    }
    // ---- What the plot lays in its rooms (`plotDungeon`), by its own chance (`tales`), clear of all laid already.
    const plot = this.plot, tales = this.rng.fork('tales');
    const box = (i: number) => { const room = this.layout.rooms[i], x0 = this.latOf(room.c0) - half, t0 = this.tOf(room.r0) - half; return { room, x0, t0, x1: x0 + room.w * CAVE.cell, t1: t0 + room.h * CAVE.cell, f: room.level * DROP, y: deep + room.level * DROP }; };
    const doorEdges = this.layout.doors.map((d) => [this.latOf(d.c) + d.dc * half, this.tOf(d.r) + d.dr * half]);
    /**
     * A spot on room `i`'s floor `clear` metres clear of what stands in it, its walls, its ways in and the spots taken already (by twice as
     * much, or `apart`); or its middle.
     */
    const freeSpot = (i: number, clear: number, apart = 2 * clear): [number, number] => {
      const b = box(i);
      // (Kept apart as asked if it can be, and less so, a little at a time, in a room crowded already.)
      for (const k of [1, 0.8, 0.6, 0.4]) for (let n = 0; n < 60; n++) {
        const x = tales.range(b.x0 + clear, b.x1 - clear), t = tales.range(b.t0 + clear, b.t1 - clear);
        if (!onFloor(x, t, b.f) || this.posts.some((p) => Math.hypot(x - p.lat, t - p.t) < p.r + clear * k)) continue;
        if (doorEdges.some(([a, c]) => Math.hypot(x - a, t - c) < 1.4 + clear) || this.taken.some(([a, c]) => Math.hypot(x - a, t - c) < apart * k)) continue;
        this.taken.push([x, t]);
        return [x, t];
      }
      const mid: [number, number] = [(b.x0 + b.x1) / 2, (b.t0 + b.t1) / 2];
      this.taken.push(mid);
      return mid;
    };
    // The one who came before, fallen where the key was carried: bones, a pack, a shield, the lantern still burning low beside them.
    if (plot.key >= 0) {
      const b = box(plot.key), [x, t] = freeSpot(plot.key, 1.0), turn = tales.range(0, 6.3), sn = Math.sin(turn), cs = Math.cos(turn);
      put('skeleton', x, b.y, t, turn, 1, true);
      put('sack', x - cs * 0.7, b.y, t + sn * 0.7, tales.range(0, 6.3), 0.8, true);
      put('shield', x + cs * 0.65 + sn * 0.3, b.y, t - sn * 0.65 + cs * 0.3, turn + 1.2, 0.9, true);
      put('lantern', x - sn * 0.55, b.y, t - cs * 0.55, 0, 1, true);
      this.posts.push({ lat: x, t, r: 0.55 });
      this.keyLocal.set(x + sn * 0.62, b.y + 0.04, t + cs * 0.62);
    }
    // The hidden room: the stash in its middle, gems and an idol, a lantern long out (no light), one who was walled up with it all.
    if (plot.secret) {
      const i = plot.secret.room, b = box(i), cx = (b.x0 + b.x1) / 2, ct = (b.t0 + b.t1) / 2, along = b.x1 - b.x0 > b.t1 - b.t0;
      this.stashLocal.set(cx, b.y, ct);
      this.stashTurn = along ? 0 : Math.PI / 2;
      this.posts.push({ lat: cx, t: ct, r: 0.6 });
      const end = (k: number): [number, number] => (along ? [cx + k * ((b.x1 - b.x0) / 2 - 0.8), ct] : [cx, ct + k * ((b.t1 - b.t0) / 2 - 0.8)]);
      const [gx, gt] = end(1), [ix, it] = end(-1);
      put('gemPile', gx, b.y, gt, tales.range(0, 6.3));
      put('idol', ix, b.y, it, Math.atan2(cx - ix, ct - it));
      strew('coins', cx, ct, 6, 1.2, b.f);
      strew('skeleton', cx, ct, 1, 1.0, b.f);
      for (const [x, t, sx, st] of [[b.x0, b.t0, 1, 1], [b.x1, b.t1, -1, -1]] as const) put('cobweb', x + sx * 0.3, b.y + CAVE.room - 0.35, t + st * 0.3, Math.atan2(sx, st) + Math.PI, 1, true);
      // (Its wall's tell, on the side it is come at from: stone fallen from a crack at its foot.)
      const d = this.layout.doors[plot.secret.door], [ex, et] = doorEdges[plot.secret.door], f = this.layout.floor[d.r * this.layout.cols + d.c];
      for (let k = 0; k < 3; k++) put('rubble', ex + d.dc * tales.range(0.3, 0.7) + d.dr * tales.range(-0.9, 0.9), deep + f, et + d.dr * tales.range(0.3, 0.7) + d.dc * tales.range(-0.9, 0.9), tales.range(0, 6.3), tales.range(0.5, 0.8), true);
    }
    // A dart trap's tells: the dead it took before, by its plate.
    for (const tr of plot.traps) {
      const k = tr.r * this.layout.cols + tr.c, x = this.latOf(tr.c), t = this.tOf(tr.r), y = deep + this.layout.floor[k];
      put('skull', x + tr.dc * 0.95 + tr.dr * 0.7, y, t + tr.dr * 0.95 + tr.dc * 0.7, tales.range(0, 6.3), 1, true);
      put('bones', x + tr.dc * 0.9 - tr.dr * 0.9, y, t + tr.dr * 0.9 - tr.dc * 0.9, tales.range(0, 6.3), 0.8, true);
    }
    // The three cold braziers, each where it stands (and drawn apart from the props, unlit: `layPlot`).
    if (plot.puzzle >= 0) {
      const b = box(plot.puzzle), order = tales.fork('order'), seq = [0, 1, 2];
      for (let i = 2; i > 0; i--) { const j = order.int(0, i); [seq[i], seq[j]] = [seq[j], seq[i]]; }
      for (let i = 0; i < 3; i++) { const [x, t] = freeSpot(plot.puzzle, 1.0, 3.2); this.braziers.push({ at: new Vector3(x, b.y, t), order: seq[i], lit: false, cool: false }); this.posts.push({ lat: x, t, r: 0.4 }); }
    }
    // Someone left captive, chained where they sit.
    if (plot.captive >= 0) {
      const b = box(plot.captive), [x, t] = freeSpot(plot.captive, 0.9);
      this.captiveLocal.set(x, b.y, t);
      put('chain', x + 0.3, b.y, t - 0.15, tales.range(0, 6.3), [0.8, (CAVE.room - 0.05) / 3.7, 0.8], true);
      put('bucket', x - 0.7, b.y, t + 0.3, tales.range(0, 6.3), 1, true);
      this.posts.push({ lat: x, t, r: 0.45 });
    }
    // The crack of day: a light from the roof (cold, as the day's), and the snow it has let down heaped under it (`layPlot`).
    if (plot.shaft >= 0) {
      const b = box(plot.shaft), [x, t] = [(b.x0 + b.x1) / 2, (b.t0 + b.t1) / 2];
      this.shaftLocal.set(x, b.y, t);
      this.torches.push({ at: new Vector3(x, b.y + CAVE.room - 0.4, t), facing: UP.clone(), kind: 'sky', power: 1.5, color: DAYLIGHT.clone().multiplyScalar(1.1) });
    }
    // ---- Each kind of place dressed as its own (asked: "what new ... decorations ... do we need?"), by its own chance (`dress`), in the
    // rooms the plot has not given over: a tomb's coffins stood against the walls, skulls heaped, runestones and fallen columns; a
    // temple's rugs, basins, lecterns, tapestries; a prison's armour and spears, cages and chains hung from the roof; a vault's shelves of
    // jars, amphorae, gems. Below, mushrooms and moss in the damp passages.
    const dress = this.rng.fork('dress'), given = new Set([plot.key, plot.puzzle, plot.captive, plot.flooded, plot.shaft, plot.last, plot.secret?.room ?? -1, 0]);
    const wallSpots = (i: number) => { const b = box(i); return walls_(b.x0, b.t0, b.x1, b.t1).filter(bare).filter(([x, t, n]) => !this.posts.some((p) => Math.hypot(x + n.x * 0.4 - p.lat, t + n.z * 0.4 - p.t) < p.r + 0.6) && !this.taken.some(([a, c]) => Math.hypot(x - a, t - c) < 1.4)); };
    const wallOf = (i: number, k: PropKind, off: number, free = false) => { const spots = wallSpots(i); if (!spots.length) return; const w = spots[dress.int(0, spots.length - 1)]; onWall(k, w, box(i).y, off, free); this.taken.push([w[0], w[1]]); };
    const floorOf = (i: number, k: PropKind, clear: number, scale: number | [number, number, number] = 1, free = false) => { const [x, t] = freeSpot(i, clear); put(k, x, box(i).y, t, dress.range(0, 6.3), scale, free); };
    const hung: [number, number, number] = [1, (CAVE.room - 0.1) / 3.85, 1];
    const DRESS: Record<Tags['theme'], Partial<Record<RoomKind, (i: number) => void>>> = {
      tomb: {
        crypt: (i) => { wallOf(i, 'coffin', 0.35); if (dress.chance(0.5)) wallOf(i, 'coffin', 0.35); },
        ossuary: (i) => floorOf(i, 'skullPile', 0.8),
        hall: (i) => { floorOf(i, 'runestone', 0.9); floorOf(i, 'brokenColumn', 0.9); },
        shrine: (i) => floorOf(i, 'tombSlab', 1.0, 1, true),
        store: (i) => floorOf(i, 'ribcage', 0.6, 1, true),
      },
      temple: {
        shrine: (i) => { floorOf(i, 'rug', 1.3, 1, true); wallOf(i, 'basin', 0.4); },
        library: (i) => floorOf(i, 'lectern', 0.8),
        hall: (i) => { wallOf(i, 'tapestry', 0.02, true); wallOf(i, 'tapestry', 0.02, true); floorOf(i, 'brokenColumn', 0.9); },
        crypt: (i) => floorOf(i, 'tombSlab', 1.0, 1, true),
        store: (i) => wallOf(i, 'jarShelf', 0.22),
      },
      prison: {
        guard: (i) => { wallOf(i, 'armorStand', 0.4); wallOf(i, 'spearBundle', 0.35); wallOf(i, 'shield', 0.06, true); },
        hall: (i) => { floorOf(i, 'hangingCage', 0.7, hung, true); floorOf(i, 'hangingCage', 0.7, hung, true); },
        store: (i) => { floorOf(i, 'chain', 0.5, [1, (CAVE.room - 0.05) / 3.7, 1], true); floorOf(i, 'hangingCage', 0.7, hung, true); },
        ossuary: (i) => floorOf(i, 'chain', 0.5, [1, (CAVE.room - 0.05) / 3.7, 1], true),
        cell: (i) => wallOf(i, 'shackles', 0.02, true),
      },
      vault: {
        vault: (i) => { wallOf(i, 'jarShelf', 0.22); floorOf(i, 'amphora', 0.5); floorOf(i, 'gemPile', 0.6); },
        guard: (i) => { wallOf(i, 'armorStand', 0.4); wallOf(i, 'shield', 0.06, true); },
        store: (i) => { floorOf(i, 'amphora', 0.5); floorOf(i, 'pots', 0.5); },
        hall: (i) => { wallOf(i, 'tapestry', 0.02, true); floorOf(i, 'amphora', 0.5); },
      },
    };
    this.layout.rooms.forEach((room, i) => { if (!given.has(i)) DRESS[this.layout.tags.theme][room.kind]?.(i); });
    for (let r = 0; r < this.layout.rows; r++) for (let c = 0; c < this.layout.cols; c++) {
      const k = r * this.layout.cols + c, f = this.layout.floor[k];
      if (this.layout.cells[k] !== 1 || this.layout.down[k] >= 0 || f >= 0 || !dress.chance(0.3)) continue;
      strew(dress.chance(0.5) ? 'mushrooms' : 'moss', this.latOf(c), this.tOf(r), 1, 1.0, f);
    }
    // ---- What happened here, told by what was left (by `scenes`), each in a room no one else has: a camp someone made and left; a
    // circle drawn on the floor, candles round it, a skull in it; a nest, webs thick across the room, its egg sacs in the corners.
    const scenes = this.rng.fork('scenes'), open = this.layout.rooms.map((_, i) => i).filter((i) => !given.has(i) && this.layout.rooms[i].w * this.layout.rooms[i].h >= 4);
    const takeRoom = (kinds: RoomKind[], below = false) => {
      const can = open.filter((i) => kinds.includes(this.layout.rooms[i].kind)).sort((a, b) => (below ? this.layout.rooms[a].level - this.layout.rooms[b].level : 0));
      if (!can.length) return -1;
      const i = below && scenes.chance(0.6) ? can[0] : scenes.pick(can);
      open.splice(open.indexOf(i), 1);
      return i;
    };
    const tell = (i: number, more: string) => { this.layout.rooms[i].note += `; ${more}`; };
    if (scenes.chance(0.55)) {
      const i = takeRoom(['store', 'guard', 'hall', 'library', 'vault']);
      if (i >= 0) {
        const b = box(i), [x, t] = freeSpot(i, 1.3), turn = scenes.range(0, 6.3), sn = Math.sin(turn), cs = Math.cos(turn);
        put('bedroll', x + sn * 0.6, b.y, t + cs * 0.6, turn + Math.PI / 2);
        put('firewood', x - sn * 0.5, b.y, t - cs * 0.5, turn, 0.8, true);
        put('pots', x - cs * 0.6, b.y, t + sn * 0.6, turn, 1, true);
        put('sack', x + cs * 0.7, b.y, t - sn * 0.7, turn, 0.8, true);
        strew('bones', x, t, 2, 0.6, b.f, () => 0.5);
        tell(i, 'someone camped here and did not come back for their things');
      }
    }
    if (scenes.chance(this.layout.tags.theme === 'temple' || this.layout.tags.theme === 'tomb' ? 0.6 : 0.35)) {
      const i = takeRoom(['shrine', 'crypt', 'hall', 'ossuary', 'library']);
      if (i >= 0) {
        const b = box(i), [x, t] = freeSpot(i, 1.6, 3);
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; put('candlestick', x + Math.cos(a) * 1.15, b.y, t + Math.sin(a) * 1.15, 0, 1, true); }
        put('skull', x, b.y, t, scenes.range(0, 6.3), 1.2, true);
        this.circles.push(new Vector3(x, b.y + 0.012, t));
        tell(i, 'a circle drawn on its floor, candles burning about it');
      }
    }
    if (scenes.chance(0.45)) {
      const i = takeRoom(['store', 'ossuary', 'cell', 'crypt', 'guard'], true);
      if (i >= 0) {
        const b = box(i);
        for (let k = 0; k < 2; k++) floorOf(i, 'eggSacs', 0.5, scenes.range(0.8, 1.2), true);
        for (const [x, t, sx, st] of [[b.x0, b.t0, 1, 1], [b.x1, b.t0, -1, 1], [b.x0, b.t1, 1, -1], [b.x1, b.t1, -1, -1]] as const) put('cobweb', x + sx * 0.3, b.y + CAVE.room - 0.35, t + st * 0.3, Math.atan2(sx, st) + Math.PI, 1.4, true);
        strew('bones', (b.x0 + b.x1) / 2, (b.t0 + b.t1) / 2, 4, 1.2, b.f);
        tell(i, 'webs thick across it: something nests here');
      }
    }
    // (The torches either side of the last room's locked way in burn with a cold fire: the way that matters, marked.)
    for (const i of plot.locked) {
      const [ex, et] = doorEdges[i];
      for (const torch of this.torches) if (torch.kind === 'wall' && Math.hypot(torch.at.x - ex, torch.at.z - et) < 3.2) torch.color = COLD_FIRE;
    }
    // (The hidden room, and the way to it, out of everything's reach, and sight, until it is found: walked, lit, seen and gone through.)
    if (plot.secret) for (const k of plot.secret.cells) this.hidden.add(k);

    // The flames the props hold (candles, braziers), each a little light; then the props drawn, lit by every light there is.
    for (const flame of props.flames()) this.torches.push({ at: flame.at, facing: UP.clone(), kind: flame.power > 0.5 ? 'brazier' : 'candle', power: flame.power });
    for (const { stuff, shape, at: list } of props.parts()) {
      const mesh = new InstancedMesh(shape, this.lit(this.stuffOf(stuff), shape, list.map((x) => new Vector3().setFromMatrixPosition(x)), STUFF_PAINT[stuff] ? P[STUFF_PAINT[stuff]!].map : undefined, true), list.length);
      list.forEach((x, i) => mesh.setMatrixAt(i, x));
      mesh.receiveShadow = true;
      mesh.castShadow = stuff !== 'cloth';
      this.inner.add(mesh);
    }
    const woodM = () => this.stuffOf('wood');
    // The doors left standing open against the walls, and the portcullises drawn up into their lintels.
    const iron = new MeshStandardNodeMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.8 }), plank = woodM();
    this.layout.doors.forEach((d, di) => {
      if (d.kind === 'arch' || d.kind === 'secret') return;
      const x = this.latOf(d.c), t = this.tOf(d.r), go = new Vector3(d.dc, 0, d.dr), side = new Vector3(-d.dr, 0, d.dc), f = this.edgeFloor(d.c, d.r, d.dc, d.dr), roof = this.layout.top[d.r * this.layout.cols + d.c];
      const edge = new Vector3(x, deep + f, t).addScaledVector(go, half - 0.22), c = new Color();
      this.lightAt(edge.clone().addScaledVector(UP, 1.5), UP, c);
      if (d.kind === 'door') {
        const leaf = new Mesh(new BoxGeometry(CAVE.cell - 1.0, roof - f - 0.62, 0.08).translate((CAVE.cell - 1.0) / 2, (roof - f - 0.62) / 2, 0), this.glowing(plank, c, P.wood.map));
        const s = rng.chance(0.5) ? 1 : -1;
        leaf.position.copy(edge).addScaledVector(side, s * (half - 0.48)).addScaledVector(go, 0.28);
        leaf.rotation.y = Math.atan2(side.x * s, side.z * s) - Math.PI / 2 + s * 0.25;
        leaf.castShadow = true;
        this.inner.add(leaf);
        this.doorMesh.set(di, { mesh: leaf, s, open: leaf.rotation.y, shut: Math.atan2(s * d.dc, s * d.dr) });
      } else {
        const bars: BufferGeometry[] = [], w = CAVE.cell - 0.96, hgt = roof - f - 0.62 - 2.7;
        for (let i = 0; i <= 10; i++) bars.push(new CylinderGeometry(0.025, 0.025, hgt + 0.5, 5).translate(-w / 2 + (w * i) / 10, 2.7 + (hgt + 0.5) / 2, 0));
        for (const y of [2.82, 2.7 + hgt]) bars.push(new BoxGeometry(w, 0.05, 0.05).translate(0, y, 0));
        const grate = new Mesh(mergeGeometries(bars), this.glowing(iron, c));
        grate.position.copy(edge);
        grate.rotation.y = Math.atan2(side.x, side.z) - Math.PI / 2;
        this.inner.add(grate);
        this.doorMesh.set(di, { mesh: grate, s: 1, open: grate.position.y, shut: grate.position.y - 2.7 });
      }
    });
    // The chest before the last room's end (and the stash in the hidden room, smaller, `layPlot`).
    const local = new Vector3(...this.localOf(this.chest.at)).setY(this.chest.at.y), made = this.makeChest(local, this.chestTurn, 1);
    this.lid = made.hinge;
    return made.glow;
  }
  /**
   * A chest at `local` (in the cave's own frame, on its floor), turned `turn`, of size `scale`: a box of planks bound with iron, its lid
   * on a hinge along its back (`hinge`, turned back to open it), gold heaped in it, and the glow over the gold, hidden until it is open.
   */
  private makeChest(local: Vector3, turn: number, scale: number): { hinge: Group; glow: Mesh } {
    const P = paintsOf(), chest = new Group(), c = new Color(), hinge = new Group();
    const iron = new MeshStandardNodeMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.8 }), goldM = new MeshStandardNodeMaterial({ color: 0xffc040, roughness: 0.3, metalness: 1 });
    this.lightAt(local.clone().setY(local.y + 0.8), UP, c);
    const body = new Mesh(new BoxGeometry(1.1, 0.6, 0.7).translate(0, 0.3, 0), this.glowing(this.stuffOf('wood'), c, P.wood.map)), ironC = this.glowing(iron, c);
    const band = new BoxGeometry(0.06, 0.62, 0.72).translate(0, 0.31, 0);
    for (const bx of [-0.42, 0.42]) { const b = new Mesh(band, ironC); b.position.x = bx; chest.add(b); }
    const lid = new Mesh(new CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, -0.35), this.glowing(this.stuffOf('wood'), c, P.wood.map));
    hinge.position.set(0, 0.6, 0.35);
    hinge.add(lid);
    const gold = new Mesh(new SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.45, 0.72).translate(0, 0.42, 0), this.glowing(goldM, c.clone().multiplyScalar(1.5)));
    chest.add(body, hinge, gold);
    chest.position.copy(local);
    chest.rotation.y = turn;
    chest.scale.setScalar(scale);
    chest.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.inner.add(chest);
    const glowPaint = new MeshBasicNodeMaterial({ map: P.puff, transparent: true, depthWrite: false, blending: AdditiveBlending });
    glowPaint.colorNode = vec3(1, 0.7, 0.25).mul(texture(P.puff, uv()).a).mul(0.8).mul(sin(time.mul(2.3)).mul(0.15).add(0.85));
    glowPaint.opacityNode = this.fog();
    const glow = new Mesh(new PlaneGeometry(2.4 * scale, 2.4 * scale), glowPaint);
    glow.position.set(local.x, local.y + 0.9 * scale, local.z);
    glow.visible = false;
    this.inner.add(glow);
    return { hinge, glow };
  }
  /** A material lit as the dungeon's stone is, by the light `c` where its one thing stands. */
  private glowing(m: MeshStandardNodeMaterial, c: Color, paint?: Texture): MeshStandardNodeMaterial {
    const albedo = paint ? (texture(paint, uv()).rgb as N).mul(m.color) : vec3(m.color.r, m.color.g, m.color.b);
    m.emissiveNode = (albedo as N).mul(vec3(c.r, c.g, c.b)).mul(0.8).mul(this.flicker);
    m.lightsNode = lights([this.lantern]);
    this.cutAway(m);
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------------- the plot

  /** What is said of the rooms the plot has given over, added to their lines, to be said as each is come into. */
  private notePlot(): void {
    const p = this.plot, rooms = this.layout.rooms, add = (i: number, more: string) => { if (i >= 0) rooms[i].note += `; ${more}`; };
    add(p.key, 'one who came before you lies here, their lantern still burning low');
    add(p.flooded, 'black water stands over its floor');
    add(p.shaft, 'a crack in its roof lets the day down, and the snow with it');
    add(p.puzzle, 'three cold braziers stand in it, a numeral cut before each');
    add(p.captive, 'someone is here, alive, chained where they sit');
  }
  /** A room named as one would say it in telling the way to it: "the crypt below". */
  private roomName(i: number): string {
    const r = this.layout.rooms[i];
    return `the ${ROOM_NAMES[r.kind]}${r.level < -1 ? ' deep below' : r.level < 0 ? ' below' : ''}`;
  }
  /** The room the hidden room's cracked wall is come at from. */
  private get secretBy(): number {
    const p = this.plot.secret;
    if (!p) return -1;
    const d = this.layout.doors[p.door];
    return this.layout.roomAt[(d.r + d.dr) * this.layout.cols + d.c + d.dc];
  }
  /** Whose the place was, as said at the start of a line. */
  private get whoSaid(): string { return this.layout.who.replace(/^the /, 'The '); }
  /** A material for one thing standing in the dungeon (of vertex colours), lit as its stone is by the light `c` where it stands. */
  private litByVertex(c: Color, roughness = 0.9): MeshStandardNodeMaterial {
    const m = new MeshStandardNodeMaterial({ vertexColors: true, roughness });
    m.emissiveNode = (attribute('color', 'vec3') as N).mul(vec3(c.r, c.g, c.b)).mul(0.8).mul(this.flicker);
    m.lightsNode = lights([this.lantern]);
    this.cutAway(m);
    return m;
  }
  /**
   * Props laid apart from the rest, drawn as they are (`layThings`), each mesh kept to be shown or hidden; their flames give no light,
   * and, `cold`, their coals no glow (a brazier not yet lit).
   */
  private drawProps(props: Props, cold = false): Mesh[] {
    const P = paintsOf(), out: Mesh[] = [];
    for (const { stuff, shape, at: list } of props.parts()) {
      const m = this.stuffOf(stuff);
      if (cold) m.userData.glow = undefined;
      const paint = STUFF_PAINT[stuff], mesh = new InstancedMesh(shape, this.lit(m, shape, list.map((x) => new Vector3().setFromMatrixPosition(x)), paint ? P[paint].map : undefined, true), list.length);
      list.forEach((x, i) => mesh.setMatrixAt(i, x));
      mesh.receiveShadow = mesh.castShadow = true;
      this.inner.add(mesh);
      out.push(mesh);
    }
    return out;
  }
  /** The turn about the upright that lays a shape's own +x along (`ax`, `az`) in the cave's frame. */
  private static along = (ax: number, az: number) => Math.atan2(-az, ax);

  /**
   * What the plot has that moves, or comes and goes, made: the last room's portcullises let down; the barred door shut, its bar across
   * it; the hidden room's wall, cracked, and the stone it falls to; the key and its glint; the stash; the traps' plates, the slits in
   * the wall and their darts; the flooded room's water; the crack of day, its beams and its snow; the cold braziers, their numerals
   * and the flames they will have; and the folk: the hermit at the camp's fire, the captive, the ghost.
   */
  private layPlot(): void {
    const P = paintsOf(), deep = this.site.deep, half = CAVE.cell / 2, plot = this.plot, cols = this.layout.cols, c = new Color();
    const edge = (i: number) => { const d = this.layout.doors[i]; return { d, x: this.latOf(d.c) + d.dc * half, t: this.tOf(d.r) + d.dr * half, f: this.edgeFloor(d.c, d.r, d.dc, d.dr) }; };
    for (const i of plot.locked) { const m = this.doorMesh.get(i); if (m) m.mesh.position.y = m.shut; this.shuts.push({ door: i, kind: 'locked', open: 0, going: false, parts: [], after: [] }); }
    if (plot.barred) {
      const i = plot.barred.door, m = this.doorMesh.get(i), { d, x, t, f } = edge(i);
      if (m) m.mesh.rotation.y = m.shut;
      this.lightAt(new Vector3(x, deep + f + 1.2, t).addScaledVector(new Vector3(d.dc, 0, d.dr), 0.5 * plot.barred.from), UP, c);
      const bar = new Mesh(new BoxGeometry(CAVE.cell - 0.5, 0.15, 0.1), this.glowing(this.stuffOf('wood'), c, P.wood.map));
      bar.position.set(x + d.dc * (plot.barred.from > 0 ? 0.4 : -0.55), deep + f + 1.15, t + d.dr * (plot.barred.from > 0 ? 0.4 : -0.55));
      bar.rotation.y = Cave.along(-d.dr, d.dc);
      bar.castShadow = true;
      this.inner.add(bar);
      this.shuts.push({ door: i, kind: 'barred', open: 0, going: false, parts: [bar], after: [] });
    }
    if (plot.secret) {
      const i = plot.secret.door, { d, x, t, f } = edge(i), hgt = this.layout.top[d.r * cols + d.c] - f, go = new Vector3(d.dc, 0, d.dr);
      this.lightAt(new Vector3(x, deep + f + 1.5, t).addScaledVector(go, 0.3), go, c);
      const g = new BoxGeometry(CAVE.cell, hgt, 0.3), uvs = g.getAttribute('uv') as BufferAttribute;
      for (let k = 0; k < uvs.count; k++) uvs.setXY(k, (uvs.getX(k) * CAVE.cell) / 2, (uvs.getY(k) * hgt) / 2);
      const T = themePaints(this.layout.tags.theme), plug = new Mesh(g, this.glowing(new MeshStandardNodeMaterial({ map: T.wall.map, normalMap: T.wall.normal, roughness: 0.92, color: 0xcfc6ba }), c.clone().multiplyScalar(1.15), T.wall.map));
      plug.position.set(x - go.x * 0.15, deep + f + hgt / 2, t - go.z * 0.15);
      plug.rotation.y = Math.atan2(go.x, go.z);
      const crackPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      crackPaint.colorNode = vec3(0.02, 0.02, 0.025);
      crackPaint.opacityNode = (texture(crackPicture(), uv()) as N).a.mul(this.fog());
      const crack = new Mesh(new PlaneGeometry(CAVE.cell * 0.9, hgt * 0.9), crackPaint);
      crack.position.set(x + go.x * 0.012, deep + f + hgt * 0.47, t + go.z * 0.012);
      crack.rotation.y = Math.atan2(go.x, go.z);
      this.inner.add(plug, crack);
      // (What it falls to: stone heaped in the way through, and spilled out into the room.)
      const fallen = new Props(), rr = this.rng.fork('fallen');
      for (let k = 0; k < 9; k++) { const a = rr.range(-1.2, 0.6); fallen.put('rubble', new Vector3(x + go.x * a + d.dr * rr.range(-1.1, 1.1), deep + f, t + go.z * a + d.dc * rr.range(-1.1, 1.1)), rr.range(0, 6.3), rr.range(0.6, 1.2)); }
      const after = this.drawProps(fallen);
      for (const m of after) m.visible = false;
      this.shuts.push({ door: i, kind: 'secret', open: 0, going: false, parts: [plug, crack], after });
    }
    // Runes over the locked way, glowing with the cold fire; and, in a temple or a tomb, bands of them high on its halls' and shrines' walls.
    const runes = (color: Color, at: Vector3, facing: Vector3, w: number, seed: string, k: number) => {
      const paint = new MeshBasicNodeMaterial({ map: runePicture(seed), transparent: true, depthWrite: false, blending: AdditiveBlending });
      paint.colorNode = vec3(color.r, color.g, color.b).mul((texture(paint.map!, uv()) as N).a).mul(sin(time.mul(1.3).add(k)).mul(0.2).add(0.8)).mul(0.6);
      paint.opacityNode = this.fog();
      const m = new Mesh(new PlaneGeometry(w, w * 0.19), paint);
      m.position.copy(at);
      m.rotation.y = Math.atan2(facing.x, facing.z);
      this.inner.add(m);
    };
    plot.locked.forEach((i, k) => {
      const { d, x, t } = edge(i), go = new Vector3(d.dc, 0, d.dr), roof = this.layout.top[d.r * cols + d.c];
      runes(COLD_FIRE, new Vector3(x, deep + roof - 0.3, t).addScaledVector(go, -0.455), go.clone().negate(), CAVE.cell - 1.1, `${this.seed} gate ${k}`, k);
    });
    const theme = this.layout.tags.theme;
    if (theme === 'temple' || theme === 'tomb') {
      const rr = this.rng.fork('runes'), glow = theme === 'temple' ? new Color(1, 0.72, 0.3) : new Color(0.55, 0.95, 0.7);
      this.layout.rooms.forEach((room, ri) => {
        if (!['hall', 'shrine', 'sanctum', 'tomb', 'crypt'].includes(room.kind)) return;
        const y = deep + room.level * DROP + 3.4, x0 = this.latOf(room.c0) - half, t0 = this.tOf(room.r0) - half, x1 = x0 + room.w * CAVE.cell, t1 = t0 + room.h * CAVE.cell;
        const spots: [number, number, Vector3][] = [];
        for (let x = x0 + half; x < x1; x += CAVE.cell) { if (!this.openAt(x, t0 - 0.5)) spots.push([x, t0, new Vector3(0, 0, 1)]); if (!this.openAt(x, t1 + 0.5)) spots.push([x, t1, new Vector3(0, 0, -1)]); }
        for (let t = t0 + half; t < t1; t += CAVE.cell) { if (!this.openAt(x0 - 0.5, t)) spots.push([x0, t, new Vector3(1, 0, 0)]); if (!this.openAt(x1 + 0.5, t)) spots.push([x1, t, new Vector3(-1, 0, 0)]); }
        for (let k = 0; k < Math.min(2, spots.length); k++) {
          const [x, t, n] = spots.splice(rr.int(0, spots.length - 1), 1)[0];
          runes(glow, new Vector3(x, y, t).addScaledVector(n, 0.03), n, CAVE.cell - 0.4, `${this.seed} ${ri} ${k}`, ri + k);
        }
      });
    }
    // The circles drawn on the floors, smouldering red.
    for (const at of this.circles) {
      const paint = new MeshBasicNodeMaterial({ map: circlePicture(), transparent: true, depthWrite: false, blending: AdditiveBlending });
      paint.colorNode = vec3(0.9, 0.18, 0.08).mul((texture(paint.map!, uv()) as N).a).mul(sin(time.mul(0.8)).mul(0.25).add(0.75));
      paint.opacityNode = this.fog();
      const m = new Mesh(new PlaneGeometry(2.9, 2.9).rotateX(-Math.PI / 2), paint);
      m.position.copy(at);
      this.inner.add(m);
    }
    // The key: an iron key, its bow a ring, lying by the hand that carried it; a glint over it.
    if (!Number.isNaN(this.keyLocal.x)) {
      this.lightAt(this.keyLocal.clone().setY(this.keyLocal.y + 0.8), UP, c);
      const gold = this.glowing(new MeshStandardNodeMaterial({ color: 0xd8b060, roughness: 0.35, metalness: 0.9 }), c.clone().multiplyScalar(1.8));
      const key = new Group();
      key.add(new Mesh(new TorusGeometry(0.07, 0.018, 6, 14), gold));
      const shaft = new Mesh(new CylinderGeometry(0.016, 0.016, 0.3, 6).rotateZ(Math.PI / 2).translate(0.22, 0, 0), gold);
      const bit = new Mesh(new BoxGeometry(0.03, 0.08, 0.02).translate(0.34, -0.045, 0), gold);
      key.add(shaft, bit);
      key.rotation.x = -Math.PI / 2;
      key.position.copy(this.keyLocal).setY(this.keyLocal.y + 0.03);
      const glint = new MeshBasicNodeMaterial({ map: P.puff, transparent: true, depthWrite: false, blending: AdditiveBlending });
      glint.colorNode = vec3(1, 0.8, 0.4).mul(texture(P.puff, uv()).a).mul(sin(time.mul(3.1)).mul(0.3).add(0.6));
      glint.opacityNode = this.fog();
      const shine = new Mesh(new PlaneGeometry(0.8, 0.8), glint);
      shine.rotation.x = -Math.PI / 2;
      shine.position.set(0.15, 0.02, 0);
      key.add(shine);
      this.inner.add(key);
      this.keyMesh = key;
    }
    if (!Number.isNaN(this.stashLocal.x)) this.stash = { ...this.makeChest(this.stashLocal, this.stashTurn, 0.75), open: 0, opened: false };
    // The traps: a plate a little proud of the floor, three slits in the wall beside it, and the darts they loose across.
    if (plot.traps.length) {
      const darts = new InstancedMesh(new CylinderGeometry(0.012, 0.006, 0.32, 5).rotateX(Math.PI / 2), new MeshBasicNodeMaterial({ color: 0x3a3430 }), plot.traps.length * 3);
      darts.frustumCulled = false;
      for (let k = 0; k < darts.count; k++) darts.setMatrixAt(k, this.m4.makeScale(0, 0, 0));
      this.darts = darts;
      this.inner.add(darts);
      const slit = new MeshBasicNodeMaterial({ color: 0x050404 });
      slit.opacityNode = this.fog();
      slit.alphaTestNode = float(0.5);
      for (const tr of plot.traps) {
        const k = tr.r * cols + tr.c, x = this.latOf(tr.c), t = this.tOf(tr.r), y = deep + this.layout.floor[k], at = new Vector3(x, y, t);
        this.lightAt(at.clone().setY(y + 0.2), UP, c);
        const plate = new Mesh(new BoxGeometry(1.05, 0.05, 1.05), this.glowing(new MeshStandardNodeMaterial({ map: P.floor.map, color: 0x8a8278, roughness: 0.8 }), c, P.floor.map));
        plate.position.set(x, y + 0.025, t);
        plate.receiveShadow = true;
        this.inner.add(plate);
        const from = new Vector3(x + tr.dc * (half - 0.02), y + 1.05, t + tr.dr * (half - 0.02)), to = new Vector3(x - tr.dc * (half - 0.05), y + 1.05, t - tr.dr * (half - 0.05));
        for (const s of [-0.35, 0, 0.35]) {
          const m = new Mesh(new BoxGeometry(0.22, 0.05, 0.03), slit);
          m.position.set(from.x - tr.dr * s, from.y, from.z + tr.dc * s);
          m.rotation.y = Cave.along(-tr.dr, tr.dc);
          this.inner.add(m);
        }
        this.traps.push({ at: at.setY(y), from, to, wait: 0, fly: 9, seen: false });
      }
    }
    // The flooded room: still black water over its floor, the torchlight broken on it.
    if (plot.flooded >= 0) {
      const room = this.layout.rooms[plot.flooded], x0 = this.latOf(room.c0) - half, t0 = this.tOf(room.r0) - half, x1 = x0 + room.w * CAVE.cell, t1 = t0 + room.h * CAVE.cell, y = deep + room.level * DROP + 0.3;
      this.lightAt(new Vector3((x0 + x1) / 2, y + 1, (t0 + t1) / 2), UP, c);
      const pool = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      const ripple = sin((positionWorld.x as N).mul(2.3).add(time.mul(0.9))).mul(sin((positionWorld.z as N).mul(1.9).sub(time.mul(0.7)))).mul(0.5).add(0.5);
      pool.colorNode = vec3(0.012, 0.03, 0.035).add(vec3(c.r, c.g, c.b).mul(0.22).mul((ripple as N).pow(3).mul(1.6).add(0.2)));
      pool.opacityNode = float(0.86).mul(this.fog());
      const surface = new Mesh(new PlaneGeometry(x1 - x0, t1 - t0).rotateX(-Math.PI / 2), pool);
      surface.position.set((x0 + x1) / 2, y, (t0 + t1) / 2);
      surface.renderOrder = 2;
      this.inner.add(surface);
      this.water = { x0, t0, x1, t1, y };
    }
    // The crack of day: its light coming down in beams, and the snow it has let in, heaped, and still falling.
    if (!Number.isNaN(this.shaftLocal.x)) {
      const s = this.shaftLocal, beam = new MeshBasicNodeMaterial({ map: beamPicture(), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      beam.colorNode = vec3(DAYLIGHT.r, DAYLIGHT.g, DAYLIGHT.b).mul((texture(beam.map!, uv()) as N).a).mul(0.32);
      beam.opacityNode = this.fog();
      for (let k = 0; k < 3; k++) {
        const m = new Mesh(new PlaneGeometry(1.9, CAVE.room), beam);
        m.position.set(s.x, s.y + CAVE.room / 2, s.z);
        m.rotation.y = (k * Math.PI) / 3;
        this.inner.add(m);
      }
      this.lightAt(s.clone().setY(s.y + 0.5), UP, c);
      const heap = new Mesh(new SphereGeometry(1.15, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.24, 0.9), this.glowing(new MeshStandardNodeMaterial({ color: 0xeef3fa, roughness: 0.95 }), c.clone().multiplyScalar(1.1)));
      heap.position.copy(s);
      heap.receiveShadow = true;
      this.inner.add(heap);
      const flake = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      flake.colorNode = vec3(0.9, 0.93, 1).mul((texture(P.puff, uv()) as N).a).mul(0.9);
      flake.opacityNode = this.fog();
      const flakes = new InstancedMesh(new PlaneGeometry(0.07, 0.07), flake, 36), fr = this.rng.fork('flakes');
      flakes.frustumCulled = false;
      this.flakes = { mesh: flakes, at: Array.from({ length: 36 }, () => new Vector3(s.x + fr.range(-0.7, 0.7), s.y + fr.range(0, CAVE.room), s.z + fr.range(-0.7, 0.7))) };
      this.inner.add(flakes);
    }
    // The cold braziers, unlit (their flames apart, shown as each is lit), and before each, cut in the floor, its numeral.
    if (this.braziers.length) {
      const cold = new Props();
      for (const b of this.braziers) cold.put('brazier', b.at, 0);
      this.drawProps(cold, true);
      const P2 = paintsOf(), firePaint = new MeshBasicNodeMaterial({ map: P2.flame, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      firePaint.colorNode = (texture(P2.flame, uv()).rgb as N).mul(vec3(2.4, 1.6, 1.0));
      this.brazierFlames = new InstancedMesh(new PlaneGeometry(1, 1).translate(0, 0.38, 0), firePaint, 3);
      this.brazierFlames.frustumCulled = false;
      for (let k = 0; k < 3; k++) this.brazierFlames.setMatrixAt(k, this.m4.makeScale(0, 0, 0));
      this.inner.add(this.brazierFlames);
      const room = this.layout.rooms[plot.puzzle], cx = this.latOf(room.c0) - half + (room.w * CAVE.cell) / 2, ct = this.tOf(room.r0) - half + (room.h * CAVE.cell) / 2;
      for (const b of this.braziers) {
        const mark = new MeshBasicNodeMaterial({ map: numeralPicture(b.order), transparent: true, depthWrite: false, blending: AdditiveBlending });
        mark.colorNode = vec3(1, 0.6, 0.25).mul((texture(mark.map!, uv()) as N).a).mul(sin(time.mul(1.7).add(b.order)).mul(0.15).add(0.55));
        mark.opacityNode = this.fog();
        const m = new Mesh(new PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2), mark), dx = cx - b.at.x, dz = ct - b.at.z, l = Math.hypot(dx, dz) || 1;
        m.position.set(b.at.x + (dx / l) * 0.78, b.at.y + 0.015, b.at.z + (dz / l) * 0.78);
        m.rotation.y = Math.atan2(-dx, -dz);
        this.inner.add(m);
      }
    }
    // The folk. The hermit, sitting on the log by the fire, turned to it; lit as the camp is, by the day and the fire.
    const f = this.fireAt, hx = f.x + 1.75, hz = f.z - 0.4;
    const hermit = new Folk({ robe: 0x3d4a3a, hood: 0x7a3328, skin: 0xb98c70 }, 'sit', new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 }));
    hermit.group.position.set(hx, this.groundAt(hx, hz) - 0.06, hz);
    hermit.group.rotation.y = Math.atan2(f.x - hx, f.z - hz);
    this.frame.add(hermit.group);
    this.folk.push({ who: 'hermit', figure: hermit, fade: 0 });
    if (!Number.isNaN(this.captiveLocal.x)) {
      const at = this.captiveLocal;
      this.lightAt(at.clone().setY(at.y + 1), UP, c, true);
      const captive = new Folk({ robe: 0x6c675c, hood: 0x5a554c }, 'kneel', this.litByVertex(c));
      captive.group.position.copy(at);
      const room = this.layout.rooms[plot.captive];
      captive.group.rotation.y = Math.atan2(this.latOf(room.c0) + ((room.w - 1) * CAVE.cell) / 2 - at.x, this.tOf(room.r0) + ((room.h - 1) * CAVE.cell) / 2 - at.z);
      this.inner.add(captive.group);
      this.folk.push({ who: 'captive', figure: captive, fade: 0 });
    }
    if (!Number.isNaN(this.ghostLocal.x)) {
      const pale = new MeshBasicNodeMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
      pale.colorNode = (attribute('color', 'vec3') as N).mul(0.16).mul(this.ghostFade).mul(sin(time.mul(2.1)).mul(0.12).add(0.88));
      pale.opacityNode = this.fog();
      const ghost = new Folk({ robe: 0x7fb6e8, hood: 0x9cc8f0, skin: 0xd8ecff }, 'stand', pale, true);
      ghost.group.position.copy(this.ghostLocal);
      const room = this.layout.rooms[plot.last];
      if (room) ghost.group.rotation.y = Math.atan2(this.latOf(room.c0) + ((room.w - 1) * CAVE.cell) / 2 - this.ghostLocal.x, this.tOf(room.r0) + ((room.h - 1) * CAVE.cell) / 2 - this.ghostLocal.z);
      this.inner.add(ghost.group);
      this.folk.push({ who: 'ghost', figure: ghost, fade: 0 });
    }
  }
  /** How bright the ghost is: whole, until it has spoken, then gone. */
  private readonly ghostFade = uniform(1);
  /** How long the one on foot has pressed against the cracked wall. */
  private pushing = 0;

  /** What the hermit says: what the place holds, as far as he knows it, and what to mind. */
  private hermitSays(): string {
    const p = this.plot, said: string[] = [];
    if (p.locked.length && p.key >= 0) said.push(`"${this.whoSaid} lies shut away below. The key went down with one who never came back up; look in ${this.roomName(p.key)}."`);
    else said.push(`"${this.whoSaid} lies below. Many went down for that gold."`);
    if (p.traps.length) said.push('"Watch the floor in the passages: where a stone sits proud, and bones lie by it, step round."');
    if (p.secret) said.push('"And where no door is, a draught still finds its way."');
    if (p.puzzle >= 0) said.push('"The cold fires want lighting in their order."');
    return `${said.join(' ')} Warm yourself; sit a while and we might trade.`;
  }
  /** Whose captive it is, and what they say for being freed. */
  private captiveSays(): { name: string; line: string } {
    const r = this.rng.fork('captive'), name = r.pick(['Brynja', 'Old Tove', 'Halvard', 'Inga the Ski-Runner', 'Eskil', 'Sigrid of the Pass', 'Ragna']), p = this.plot;
    const tip = p.secret
      ? `there is a cracked wall in ${this.roomName(this.secretBy)}. Lean on it.`
      : p.key >= 0 && !this.keyTaken ? `the key to the last door lies in ${this.roomName(p.key)}.` : `the dead walk in these halls; keep your blade near.`;
    return { name, line: `"Free, at last. Listen: ${tip}"` };
  }

  /**
   * One on foot at (`x`, `y`, `z`, in the land) a moment (`dt`) on, through what the plot has laid: the hermit come to and sat by, the
   * key taken up, the locked and barred ways and the cracked wall come to and opened, the stash and the braziers, a trap's plate trodden
   * on, the captive freed, the last room come into. Gives back what came of it, for the game to tell, and to do (`CaveEvent`).
   */
  tread(x: number, y: number, z: number, dt: number): CaveEvent[] {
    const out: CaveEvent[] = [], [t, lat] = siteLocal(this.site, x, z), half = CAVE.cell / 2, plot = this.plot, deep = this.site.deep;
    const land = (v: Vector3, up = 0) => this.toLand(v.x, v.y + up, v.z);
    const near = (v: Vector3, r: number) => Math.hypot(v.x - lat, v.z - t) < r && Math.abs(v.y - y) < 1.7;
    const say = (title: string, text: string) => out.push({ kind: 'say', title, text });
    const hermit = this.folk.find((q) => q.who === 'hermit');
    if (hermit) {
      const h = hermit.figure.group.position, d = Math.hypot(h.x - lat, h.z - t);
      if (d < 2.8) {
        if (this.met.hermitAway) { this.met.hermitAway = false; out.push({ kind: 'heal' }); say('The hermit by the fire', this.hermitSays()); }
        this.met.by += dt;
        // (Offered once each time one sits by him; taken up once a run, `traded`.)
        if (!this.met.traded && this.met.by > 4) { this.met.by = -Infinity; out.push({ kind: 'trade', at: land(h, 1.2) }); }
      } else { this.met.by = 0; if (d > 8) this.met.hermitAway = true; }
    }
    if (this.keyMesh && !this.keyTaken && near(this.keyLocal, 1.3)) {
      this.keyTaken = true; this.keyMesh.visible = false;
      out.push({ kind: 'key' });
      say('The key', `iron, heavy, the mark of ${this.layout.who} on its bow`);
    }
    for (const s of this.shuts) {
      if (s.going) continue;
      const d = this.layout.doors[s.door], ex = this.latOf(d.c) + d.dc * half, et = this.tOf(d.r) + d.dr * half, f = deep + this.edgeFloor(d.c, d.r, d.dc, d.dr);
      const along = (lat - ex) * d.dc + (t - et) * d.dr, across = Math.abs((lat - ex) * d.dr - (t - et) * d.dc), dist = Math.abs(along);
      if (across > half + 0.4 || Math.abs(y - f) > 1.7) continue;
      if (s.kind === 'locked') {
        if (dist < 1.8) {
          if (this.keyTaken || along > 0) { s.going = true; out.push({ kind: 'unlock' }); say('The portcullis rises', this.keyTaken ? 'the key turns in the winch' : 'its winch is on this side'); }
          else if (!this.met.locked) { this.met.locked = true; say('Shut fast', 'the portcullis is down, its winch locked: somewhere there is a key'); }
        } else if (dist > 4) this.met.locked = false;
      } else if (s.kind === 'barred') {
        if (dist < 1.6) {
          if (Math.sign(along) === plot.barred!.from) { s.going = true; out.push({ kind: 'unbar' }); say('The bar lifted', 'a short way back toward the gate'); }
          else if (!this.met.barred) { this.met.barred = true; say('Barred', 'from the other side'); }
        } else if (dist > 4) this.met.barred = false;
      } else {
        if (along > 0 && along < 2.6 && across < half && !this.met.draught) { this.met.draught = true; say('A cracked wall', 'cold air comes through it: something lies behind'); }
        if (along > 0 && along < 1.05 && across < half - 0.3) {
          this.pushing += dt;
          if (this.pushing > 0.8) {
            s.going = true; this.hidden.clear(); this.field = null; this.lookedAt = -1;
            out.push({ kind: 'secret' });
            say('The wall gives way', 'a room no one has stood in for an age');
          }
        } else this.pushing = 0;
      }
    }
    if (this.stash && !this.stash.opened && near(this.stashLocal, 1.5)) { this.stash.opened = true; this.stash.glow.visible = true; out.push({ kind: 'stash', at: land(this.stashLocal, 0.5) }); }
    for (const tr of this.traps) {
      tr.wait = Math.max(0, tr.wait - dt);
      if (tr.wait <= 0 && near(tr.at, 0.62)) { tr.wait = 3.5; tr.fly = 0; out.push({ kind: 'trap', at: land(tr.from) }); }
    }
    if (this.braziers.length && !this.puzzleDone) {
      // (A brazier just put out is not lit again until the one on foot has stepped away from it: `cool`.)
      for (const b of this.braziers) if (b.cool && !near(b.at, 1.9)) b.cool = false;
      if (this.puzzleWrong < 0) for (const b of this.braziers) {
        if (b.lit || b.cool || !near(b.at, 1.1)) continue;
        const next = this.braziers.filter((q) => q.lit).length;
        b.lit = true;
        if (b.order !== next) { this.puzzleWrong = 0; say('The flames gutter and die', 'that was not the fire to light'); }
        else if (next === 2) {
          this.puzzleDone = true;
          const room = this.layout.rooms[plot.puzzle];
          out.push({ kind: 'puzzle', at: this.toLand(this.latOf(room.c0) + ((room.w - 1) * CAVE.cell) / 2, b.at.y + 0.6, this.tOf(room.r0) + ((room.h - 1) * CAVE.cell) / 2) });
          say('The three fires burn', 'a stone in the floor grinds back');
        } else say(next ? 'The second fire lit' : 'The first fire lit', 'it takes, and burns');
        break;
      }
    }
    const captive = this.folk.find((q) => q.who === 'captive');
    if (captive && !this.met.captive && near(this.captiveLocal, 2)) {
      this.met.captive = true;
      const { name, line } = this.captiveSays();
      out.push({ kind: 'freed', name });
      say(`${name}, freed`, line);
    }
    const room = this.roomAt(x, z);
    if (room && room.i === plot.last && !this.met.ghost && plot.last >= 0) {
      this.met.ghost = true;
      const theirs = { tomb: 'rest', sanctum: 'altar', warden: 'keys', hoard: 'gold' }[this.layout.rooms[plot.last].kind as 'tomb'] ?? 'gold';
      say(this.whoSaid, `"You have come far for my ${theirs}. Take it, if you can."`);
      out.push({ kind: 'boss', at: land(this.ghostLocal.clone().setY(deep + this.layout.rooms[plot.last].level * DROP)), title: `${this.whoSaid}, Risen` });
    }
    return out;
  }
  /**
   * How much more often each kind of foe comes in this place than it would anywhere (`Den.favour`): the dead walk in a tomb, and in a
   * temple; a prison is kept by orcs; goblins come after a vault's gold; whoever was laid in a barrow rises more often in one.
   */
  favour(kind: string): number {
    const by: Record<Tags['theme'], Record<string, number>> = {
      tomb: { draugr: 3, orc: 0.6, goblin: 0.6, 'barrow-king': 1.5 }, temple: { draugr: 2, goblin: 1.2 },
      prison: { orc: 2.2, goblin: 1.4, draugr: 0.5 }, vault: { goblin: 3, orc: 1, draugr: 0.5 },
    };
    return by[this.layout.tags.theme][kind] ?? 1;
  }
  /** How near the great one's fight is, for what is heard (`CaveEcho`): its room come into and it risen, all of it; else none. */
  dread(x: number, z: number): number { return this.met.ghost && this.roomAt(x, z)?.i === this.plot.last ? 1 : 0; }
  /** The hermit's trade taken up: none more with him this run. */
  traded(): void { this.met.traded = true; }
  /** How fast one on foot may go at a point (in the land), as a share: slowed wading through the flooded room's water. */
  wading(x: number, z: number, y: number): number {
    const w = this.water;
    if (!w) return 1;
    const [t, lat] = siteLocal(this.site, x, z);
    return lat > w.x0 && lat < w.x1 && t > w.t0 && t < w.t1 && Math.abs(y - (w.y - 0.3)) < 0.6 ? 0.55 : 1;
  }
  /** Whether a shut doorway stands in the way of one `r` across its middle at a point of the cave's own frame. */
  private inShut(lat: number, t: number, r: number): boolean {
    const half = CAVE.cell / 2;
    for (const s of this.shuts) {
      if (s.open >= 0.6) continue;
      const d = this.layout.doors[s.door], ex = this.latOf(d.c) + d.dc * half, et = this.tOf(d.r) + d.dr * half;
      const along = (lat - ex) * d.dc + (t - et) * d.dr, across = Math.abs((lat - ex) * d.dr - (t - et) * d.dc);
      if (across > half) continue;
      // (Each where it stands: the portcullis in its frame, the door's leaf just inside the room, the cracked wall flush with the room's.)
      const mid = s.kind === 'locked' ? -0.22 : s.kind === 'barred' ? 0.28 : -0.15, thick = s.kind === 'secret' ? 0.15 : 0.08;
      if (Math.abs(along - mid) < thick + r) return true;
    }
    return false;
  }
  /** Whether a shut doorway stands between square (c, r) and the next toward (dc, dr), for the foes' ways. */
  private shutBetween(c: number, r: number, dc: number, dr: number): boolean {
    return this.shuts.some((s) => {
      if (s.open >= 0.6) return false;
      const d = this.layout.doors[s.door];
      return (d.c === c && d.r === r && d.dc === dc && d.dr === dr) || (d.c + d.dc === c && d.r + d.dr === r && d.dc === -dc && d.dr === -dr);
    });
  }
  /** What has opened and moved a moment on: the ways opening, the darts flying, the fires lit, the snow falling, the folk stirring. */
  private stepPlot(dt: number, seconds: number, eye: Vector3, me: Vector3 | null): void {
    for (const s of this.shuts) {
      if (!s.going || s.open >= 1) continue;
      s.open = Math.min(1, s.open + dt * (s.kind === 'secret' ? 4 : s.kind === 'locked' ? 0.45 : 1.1));
      const k = smooth(s.open), m = this.doorMesh.get(s.door);
      if (s.kind === 'locked' && m) m.mesh.position.y = m.shut + (m.open - m.shut) * k;
      if (s.kind === 'barred' && m) m.mesh.rotation.y = m.shut + Math.atan2(Math.sin(m.open - m.shut), Math.cos(m.open - m.shut)) * k;
      for (const p of s.parts) p.visible = false;
      for (const p of s.after) p.visible = true;
      if (s.open >= 0.6) this.field = null;
    }
    const q = new Quaternion(), sc = new Vector3(), p = new Vector3(), face = (at: Vector3) => q.setFromAxisAngle(UP, Math.atan2(eye.x - at.x, eye.z - at.z));
    if (this.darts) {
      this.traps.forEach((tr, i) => {
        tr.fly += dt;
        const k = tr.fly / 0.28, dir = tr.to.clone().sub(tr.from).normalize(), turn = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir);
        for (let j = 0; j < 3; j++) {
          const off = (j - 1) * 0.35;
          if (k > 1) { this.darts!.setMatrixAt(i * 3 + j, this.m4.makeScale(0, 0, 0)); continue; }
          p.copy(tr.from).lerp(tr.to, Math.min(1, k * (1 + j * 0.08))).add(new Vector3(-dir.z * off, (j - 1) * 0.12, dir.x * off));
          this.darts!.setMatrixAt(i * 3 + j, this.m4.compose(p, turn, sc.set(1, 1, 1)));
        }
      });
      this.darts.instanceMatrix.needsUpdate = true;
    }
    if (this.puzzleWrong >= 0) { this.puzzleWrong += dt; if (this.puzzleWrong > 1.1) { this.puzzleWrong = -1; for (const b of this.braziers) { b.lit = false; b.cool = !!me && Math.hypot(b.at.x - me.x, b.at.z - me.z) < 1.9; } } }
    if (this.brazierFlames) {
      this.braziers.forEach((b, i) => {
        const f = 0.9 + 0.1 * Math.sin(seconds * 9 + i * 2), dying = this.puzzleWrong >= 0 ? Math.max(0, 1 - this.puzzleWrong) : 1;
        this.brazierFlames!.setMatrixAt(i, b.lit ? this.m4.compose(p.copy(b.at).setY(b.at.y + 0.92), face(b.at), sc.set(0.42 * (2 - f) * dying, 0.8 * f * dying, 1)) : this.m4.makeScale(0, 0, 0));
      });
      this.brazierFlames.instanceMatrix.needsUpdate = true;
    }
    if (this.flakes) {
      const s = this.shaftLocal;
      this.flakes.at.forEach((v, i) => {
        v.y -= dt * (0.45 + 0.1 * Math.sin(i));
        if (v.y < s.y + 0.2) v.y += CAVE.room - 0.2;
        this.flakes!.mesh.setMatrixAt(i, this.m4.compose(p.set(v.x + 0.15 * Math.sin(seconds * 0.8 + i), v.y, v.z + 0.15 * Math.cos(seconds * 0.7 + i * 1.3)), face(v), sc.set(1, 1, 1)));
      });
      this.flakes.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.keyMesh?.visible) this.keyMesh.rotation.z = 0.3 * Math.sin(seconds * 0.7);
    if (this.stash?.opened && this.stash.open < 1) { this.stash.open = Math.min(1, this.stash.open + dt * 0.9); this.stash.hinge.rotation.x = -1.85 * smooth(this.stash.open); }
    for (const f of this.folk) {
      if ((f.who === 'ghost' && this.met.ghost) || (f.who === 'captive' && this.met.captive)) f.fade = Math.min(1, f.fade + dt / (f.who === 'ghost' ? 4 : 3.5));
      if (f.who === 'ghost') this.ghostFade.value = 1 - smooth(f.fade);
      f.figure.group.visible = f.fade < 1;
      if (f.figure.group.visible) f.figure.update(dt, seconds, me);
    }
  }
  /** The plot as it was before the run: every way shut again, the hidden room walled up, the key back, the fires out, the folk where they were. */
  private resetPlot(): void {
    for (const s of this.shuts) {
      s.open = 0; s.going = false;
      const m = this.doorMesh.get(s.door);
      if (m && s.kind === 'locked') m.mesh.position.y = m.shut;
      if (m && s.kind === 'barred') m.mesh.rotation.y = m.shut;
      for (const p of s.parts) p.visible = true;
      for (const p of s.after) p.visible = false;
    }
    if (this.plot.secret) for (const k of this.plot.secret.cells) this.hidden.add(k);
    this.field = null;
    this.keyTaken = false;
    if (this.keyMesh) this.keyMesh.visible = true;
    if (this.stash) { this.stash.opened = false; this.stash.open = 0; this.stash.hinge.rotation.x = 0; this.stash.glow.visible = false; }
    for (const b of this.braziers) { b.lit = false; b.cool = false; }
    this.puzzleDone = false; this.puzzleWrong = -1; this.pushing = 0;
    for (const tr of this.traps) { tr.wait = 0; tr.fly = 9; }
    for (const f of this.folk) f.fade = 0;
    this.ghostFade.value = 1;
    this.met = { hermit: false, hermitAway: true, by: 0, traded: false, captive: false, ghost: false, boss: false, locked: false, barred: false, draught: false, near: 0 };
  }
  /**
   * Where what the plot has laid is, in the land, for a script to walk to (`__slope.walkTo`): the key, the stash, the braziers in the order
   * they are to be lit, the captive, the ghost; the locked, barred and cracked ways, at their doorways; the traps' plates.
   */
  get plotPoints(): Record<string, [number, number, number] | [number, number, number][]> {
    const half = CAVE.cell / 2, pt = (v: Vector3): [number, number, number] => { const q = this.toLand(v.x, v.y, v.z); return [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]; };
    const out: Record<string, [number, number, number] | [number, number, number][]> = {};
    const ok = (v: Vector3) => !Number.isNaN(v.x);
    if (ok(this.keyLocal)) out.key = pt(this.keyLocal);
    if (ok(this.stashLocal)) out.stash = pt(this.stashLocal);
    if (ok(this.captiveLocal)) out.captive = pt(this.captiveLocal);
    if (ok(this.ghostLocal)) out.ghost = pt(this.ghostLocal);
    for (const f of this.folk) if (f.who === 'hermit') out.hermit = pt(f.figure.group.position);
    if (this.braziers.length) out.braziers = [...this.braziers].sort((a, b) => a.order - b.order).map((b) => pt(b.at));
    for (const s of this.shuts) { const d = this.layout.doors[s.door]; out[s.kind] = pt(new Vector3(this.latOf(d.c) + d.dc * half, this.site.deep + this.edgeFloor(d.c, d.r, d.dc, d.dr), this.tOf(d.r) + d.dr * half)); }
    if (this.traps.length) out.traps = this.traps.map((t) => pt(t.at));
    return out;
  }
  /** The plot as it stands, for a script (`__slope.dungeon`). */
  get plotState() {
    const p = this.plot, name = (i: number) => (i >= 0 ? this.roomName(i) : null);
    return {
      last: name(p.last), locked: this.shuts.filter((s) => s.kind === 'locked').map((s) => +s.open.toFixed(2)), key: name(p.key), keyTaken: this.keyTaken,
      barred: p.barred ? +(this.shuts.find((s) => s.kind === 'barred')?.open ?? 0).toFixed(2) : null,
      secret: p.secret ? { by: name(this.secretBy), open: !this.hidden.size, stash: !!this.stash?.opened } : null,
      traps: p.traps.length, flooded: name(p.flooded), shaft: name(p.shaft),
      puzzle: p.puzzle >= 0 ? { room: name(p.puzzle), order: this.braziers.map((b) => b.order), lit: this.braziers.filter((b) => b.lit).length, done: this.puzzleDone, dying: +this.puzzleWrong.toFixed(2), cool: this.braziers.filter((b) => b.cool).length } : null,
      captive: p.captive >= 0 ? { room: name(p.captive), freed: this.met.captive } : null, ghost: this.met.ghost, traded: this.met.traded,
      rooms: this.layout.rooms.map((r) => r.note),
    };
  }

  // ---------------------------------------------------------------------------------------------------------- what it is asked

  /** A point of the land in the cave's own frame: across, in, and up as it is. */
  localOf(p: { x: number; z: number; y?: number }): [number, number, number] { const [t, lat] = siteLocal(this.site, p.x, p.z); return [lat, p.y ?? 0, t]; }
  /** Whether a point is in the camp (as the way in to the mouth, before it): where the skis come off. */
  inCamp(x: number, z: number, more = 0): boolean {
    const [t, lat] = siteLocal(this.site, x, z);
    return Math.hypot(x - this.site.camp.x, z - this.site.camp.z) < CAVE.campR + more || (t < 0.5 && t > -CAVE.campR && Math.abs(lat) < CAVE.hw + more);
  }
  /**
   * Whether a point is inside, in the tunnel or the dungeon (past the mouth), or in the doorway of the way out to the deeps, where one
   * may walk (`passAt`): left out, the half metre of it before the deeps take one over was taken for out of the cave, and the skis were
   * put on there, under the mountain (asked: "I was thrown out of a dungeon to skis, off piste while traversing the dungeon in
   * Ashbridge").
   */
  inside(x: number, z: number): boolean {
    const [t, lat] = siteLocal(this.site, x, z);
    return t > 0 && (t <= this.site.length ? Math.abs(lat) < CAVE.hw + CAVE.rough : this.openAt(lat, t) || this.outExit(lat, t));
  }
  /**
   * Whether a point inside is still near the mouth: in the tunnel where it runs under the hole cut in the land for it, which only the
   * mound covers (`holeTo`), and not yet where the land lies over it. There, seen from above, the land about may still be drawn.
   */
  shallow(x: number, z: number): boolean {
    const [t] = siteLocal(this.site, x, z);
    return this.inside(x, z) && t <= this.site.holeTo;
  }
  /** How far into the dark a point is: none outside, all of it some metres down the tunnel and in the dungeon. */
  darkness(p: Vector3): number {
    // (Only within the cave's own hollow, between its floor and its roof: not on the snow over it, nor anywhere else about it.)
    const [t, lat] = siteLocal(this.site, p.x, p.z), L = this.site.length;
    if (t <= 0) return 0;
    if (t <= L) {
      const floor = floorAt(this.site, t);
      return Math.abs(lat) < CAVE.hw + CAVE.rough && p.y > floor - 0.5 && p.y < floor + CAVE.tall + CAVE.rough ? smooth((t - 0.8) / 7) : 0;
    }
    const k = this.cellAt(lat, t);
    if (!k || !this.open(k[0], k[1])) return 0;
    const floor = this.site.deep + this.floorIn(lat, t), roof = this.site.deep + this.layout.top[k[1] * this.layout.cols + k[0]];
    return p.y > floor - 0.5 && p.y < roof + 0.5 ? smooth((t - 0.8) / 7) : 0;
  }
  /** The floor's height under one on foot inside; none outside (the snow's, then). */
  floorUnder(x: number, z: number): number | null {
    const [t, lat] = siteLocal(this.site, x, z);
    if (t < 0) return null;
    return t <= this.site.length ? floorAt(this.site, t) : this.site.deep + this.floorIn(lat, t);
  }
  /** Whether one on foot `r` across its middle may stand at a point. */
  private roomFor(lat: number, t: number, r: number): boolean {
    const L = this.site.length;
    for (const p of this.posts) if (Math.hypot(lat - p.lat, t - p.t) < p.r + r) return false;
    if (this.inShut(lat, t, r)) return false;
    if (t < -0.7 - r) return true;
    if (t < 0) return Math.abs(lat) <= CAVE.hw - r || Math.abs(lat) > MOUND_HALF + r;
    if (t <= L) return Math.abs(lat) <= CAVE.hw - r || (Math.abs(lat) > MOUND_HALF + r && t > this.site.holeTo + 3);
    if (t < L + r && Math.abs(lat) > CAVE.cell / 2 - r) return false;
    return this.passAt(lat - r, t - r) && this.passAt(lat + r, t - r) && this.passAt(lat - r, t + r) && this.passAt(lat + r, t + r);
  }
  /**
   * One on foot `r` across its middle moved from (`x`, `z`) toward (`tx`, `tz`): as far as the walls and what stands about let it,
   * sliding along a wall it meets rather than stopped by it.
   */
  walk(x: number, z: number, tx: number, tz: number, r: number): [number, number] {
    const [t0, l0] = siteLocal(this.site, x, z), [t1, l1] = siteLocal(this.site, tx, tz);
    const to = (t: number, lat: number): [number, number] => { const p = sitePoint(this.site, t, lat); return [p.x, p.z]; };
    if (this.roomFor(l1, t1, r)) return to(t1, l1);
    // (Something in the way: turned along it, a little and then more, either way, as far as the step goes that way; then along the
    // lattice's two ways, as along a wall.)
    const dt = t1 - t0, dl = l1 - l0;
    for (const a of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4]) {
      const c = Math.cos(a), sn = Math.sin(a), nt = t0 + (dt * c - dl * sn) * c, nl = l0 + (dl * c + dt * sn) * c;
      if (this.roomFor(nl, nt, r)) return to(nt, nl);
    }
    if (this.roomFor(l1, t0, r)) return to(t0, l1);
    if (this.roomFor(l0, t1, r)) return to(t1, l0);
    // (Stuck where it stands, as a stack of crates fallen against it: let out toward where it was going.)
    return this.roomFor(l0, t0, r) ? [x, z] : to(t1, l1);
  }
  /**
   * Whether a view may stand at a point: not in the rock or the stone, nor under the snow, nor right against them. (Outside the
   * cave's own ground, only the land's height, as it was, is known here: the game's own views keep over the snow there.)
   */
  clear(p: Vector3): boolean {
    const [t, lat] = siteLocal(this.site, p.x, p.z), y = p.y, L = this.site.length, MH = MOUND_HALF;
    if (t > L) {
      const k = this.cellAt(lat, t), cover = this.site.deep + CAVE.room + CAVE.cover;
      if (k && this.open(k[0], k[1])) {
        const floor = this.site.deep + this.floorIn(lat, t), roof = this.site.deep + this.layout.top[k[1] * this.layout.cols + k[0]];
        const room = ROOM_CORNERS.every(([a, b]) => this.passAt(lat + a, t + b));
        if (y > floor + 0.15 && y < roof - 0.25 && room) return y > floor + 1.9 || !this.posts.some((q) => Math.hypot(lat - q.lat, t - q.t) < q.r - 0.1);
        if (y < cover) return false;
      } else if (k && y < cover) return false;
    }
    if (t >= -0.75 && t <= L) {
      const floor = floorAt(this.site, Math.max(0, t));
      if (Math.abs(lat) < CAVE.hw - 0.25 && y > floor + 0.15 && y < floor + CAVE.tall * Math.sqrt(Math.max(0, 1 - (lat / CAVE.hw) ** 2)) - 0.2) return true;
      if (Math.abs(lat) <= MH && t <= this.site.holeTo + 3) return y > this.moundAt(Math.max(0, t), lat) + 0.3;
      if (t > 0 && Math.abs(lat) < CAVE.hw + CAVE.rough + 0.5 && y < floor + CAVE.tall + CAVE.rough + 0.5) return false;
    }
    return y > this.groundAt(lat, t) + 0.25;
  }
  /** What one on skis rides over on the mound (its height there), where it rides over it; none elsewhere. */
  skiTop(x: number, z: number): number | null {
    const [t, lat] = siteLocal(this.site, x, z);
    if (t < 0 || t > this.site.holeTo + 3 || Math.abs(lat) > MOUND_HALF) return null;
    return Math.max(this.groundAt(lat, t), this.moundAt(t, lat));
  }
  /**
   * The rock face, and what stands in the camp, as one on skis `r` across its middle meets them: how far it is into one, and which way
   * is out of it (level, in the land); none, if it is clear of them.
   */
  skiWall(x: number, z: number, r: number): { into: number; nx: number; nz: number; what: string } | null {
    const [t, lat] = siteLocal(this.site, x, z);
    const out = (dt: number, dl: number, into: number, what: string) => { const p = sitePoint(this.site, dt, dl), o = sitePoint(this.site, 0, 0), l = Math.hypot(p.x - o.x, p.z - o.z) || 1; return { into, nx: (p.x - o.x) / l, nz: (p.z - o.z) / l, what }; };
    if (t > -0.7 - r && t < 0.5 && Math.abs(lat) < MOUND_HALF) return out(-1, 0, t + 0.7 + r, 'ran into the rock');
    // (Only the camp's: what stands in the dungeon is far under the snow.)
    for (const p of this.posts) {
      if (p.t >= 0) continue;
      const d = Math.hypot(lat - p.lat, t - p.t);
      if (d < p.r + r) return out((t - p.t) / (d || 1), (lat - p.lat) / (d || 1), p.r + r - d, 'bumped into the camp');
    }
    return null;
  }
  /** Whether a kicker may stand at a point: well clear of the camp and the mound. */
  keepsClear(x: number, z: number): boolean {
    const [t, lat] = siteLocal(this.site, x, z);
    // (Off the camp and its levelled edge, the mound, and the knoll, with a few metres to spare: kickers are where they were wherever
    // they kept clear of these, and the demo runs fly as they did.)
    const k = this.site.knoll;
    return Math.hypot(x - this.site.camp.x, z - this.site.camp.z) > CAVE.campR + CAVE.campBlend + 2 && !(t > -1.5 && t < this.site.holeTo + 5 && Math.abs(lat) < MOUND_HALF + 2) && !(k && knollAt({ ...k, along: k.along + 3, across: k.across + 3 }, x, z) > 0);
  }
  /** How many torches burn in it, and rooms it has (for a script). */
  get counts() { return { seed: this.seed, tags: Object.values(this.layout.tags).join(','), name: this.layout.name, torches: this.torches.length, rooms: this.layout.rooms.map((r) => `${r.kind}${r.level < 0 ? ' (below)' : ''}`), doors: this.layout.doors.map((d) => d.kind), length: +this.site.length.toFixed(1), deep: +(this.site.y0 - this.site.deep).toFixed(1) }; }
  /** Where the camp's fire is, in the land. */
  get fireSpot(): Vector3 { return this.toLand(this.fireAt.x, this.fireAt.y, this.fireAt.z); }

  /** The dungeon's name, and what kind of place it is (as One Page Dungeon names its own). */
  get title(): { name: string; about: string } { return { name: this.layout.name, about: this.layout.about }; }
  /** The room a point of the land is in, if it is in one: which, and what is said of it. */
  roomAt(x: number, z: number): { i: number; note: string; kind: string } | null {
    const [t, lat] = siteLocal(this.site, x, z), k = t > this.site.length ? this.cellAt(lat, t) : null;
    const i = k ? this.layout.roomAt[k[1] * this.layout.cols + k[0]] : -1;
    return i < 0 ? null : { i, note: this.layout.rooms[i].note, kind: this.layout.rooms[i].kind };
  }
  /** Where to stand (in the land) and which way to face, for a script: in the camp facing the mouth, inside the gate, before the chest, or in room `room`. */
  spot(where: CaveSpot, room = 0): { x: number; z: number; heading: number } {
    const turn = Math.atan2(this.site.ax, this.site.az);
    // (What the plot has laid: a couple of metres off it, looking at it; the last room's locked way, the barred door and the cracked wall
    // from the side they are opened from (the locked from outside); a trap from up its passage. The gate where there is none.)
    const looking = (lat: number, t: number, fromLat: number, fromT: number) => ({ ...sitePoint(this.site, fromT, fromLat), heading: Math.atan2(lat - fromLat, t - fromT) + turn });
    const half = CAVE.cell / 2, door = (i: number, side: number, back: number) => {
      const d = this.layout.doors[i], ex = this.latOf(d.c) + d.dc * half, et = this.tOf(d.r) + d.dr * half;
      return looking(ex, et, ex + d.dc * side * back, et + d.dr * side * back);
    };
    const toward = (v: Vector3, i: number, back: number) => {
      const r = this.layout.rooms[i], cx = this.latOf(r.c0) + ((r.w - 1) * CAVE.cell) / 2, ct = this.tOf(r.r0) + ((r.h - 1) * CAVE.cell) / 2, dx = cx - v.x, dz = ct - v.z, l = Math.hypot(dx, dz) || 1;
      return l < 0.5 ? looking(v.x, v.z, v.x, v.z - back) : looking(v.x, v.z, v.x + (dx / l) * back, v.z + (dz / l) * back);
    };
    const plot = this.plot, shut = (k: string) => this.shuts.find((q) => q.kind === k);
    if (where === 'locked') { const q = shut('locked'); return q ? door(q.door, -1, 2.4) : this.spot('gate'); }
    if (where === 'barred') { const q = shut('barred'); return q && plot.barred ? door(q.door, plot.barred.from, 2.4) : this.spot('gate'); }
    if (where === 'secret') { const q = shut('secret'); return q ? door(q.door, 1, 2.2) : this.spot('gate'); }
    if (where === 'key') return plot.key >= 0 ? toward(this.keyLocal, plot.key, 2.2) : this.spot('gate');
    if (where === 'captive') return plot.captive >= 0 ? toward(this.captiveLocal, plot.captive, 2.6) : this.spot('gate');
    if (where === 'puzzle') {
      // (By the brazier to be lit `room`th, if one of the three is asked for; else at the room's way in.)
      const b = this.braziers.find((q) => q.order === room);
      return plot.puzzle < 0 ? this.spot('gate') : b ? toward(b.at, plot.puzzle, 0.95) : this.spot('room', plot.puzzle);
    }
    if (where === 'stash') return plot.secret ? toward(this.stashLocal, plot.secret.room, 2) : this.spot('gate');
    if (where === 'water') return plot.flooded >= 0 ? this.spot('room', plot.flooded) : this.spot('gate');
    if (where === 'shaft') return plot.shaft >= 0 ? toward(this.shaftLocal, plot.shaft, 3) : this.spot('gate');
    if (where === 'trap') {
      const tr = this.traps[0];
      if (!tr) return this.spot('gate');
      const along = Math.abs(tr.to.x - tr.from.x) > 0.1 ? [0, 1] : [1, 0], back = 2.6;
      for (const sgn of [1, -1]) { const lat = tr.at.x + along[0] * back * sgn, t = tr.at.z + along[1] * back * sgn; if (this.openAt(lat, t)) return looking(tr.at.x, tr.at.z, lat, t); }
      return this.spot('gate');
    }
    if (where === 'stair') {
      // (At the head of the first stair down, looking down it; or, room 1, at its foot looking up.)
      const k = this.layout.down.findIndex((d, i) => d >= 0 && this.layout.down[i] >= 0), c = k % this.layout.cols, r = (k / this.layout.cols) | 0;
      if (k < 0) return this.spot('gate');
      const [dc, dr] = WAYS[this.layout.down[k]], up = room === 1, back = up ? 3.3 * CAVE.cell / 2 + 1.5 : 1.5 + CAVE.cell / 2;
      const lat = this.latOf(c) + (up ? dc : -dc) * back, t = this.tOf(r) + (up ? dr : -dr) * back;
      return { ...sitePoint(this.site, t, lat), heading: Math.atan2(up ? -dc : dc, up ? -dr : dr) + turn };
    }
    if (where === 'room') {
      // (Just inside its doorway, looking in.)
      const r = this.layout.rooms[Math.min(room, this.layout.rooms.length - 1)], i = this.layout.rooms.indexOf(r), half = CAVE.cell / 2;
      const d = this.layout.doors.find((q) => this.layout.roomAt[(q.r + q.dr) * this.layout.cols + q.c + q.dc] === i);
      const lat = d ? this.latOf(d.c) + d.dc * (half + 0.8) : this.latOf(r.c0 + (r.w >> 1)), t = d ? this.tOf(d.r) + d.dr * (half + 0.8) : this.tOf(r.r0 + (r.h >> 1));
      return { ...sitePoint(this.site, t, lat), heading: (d ? Math.atan2(d.dc, d.dr) : 0) + turn };
    }
    if (where === 'camp') return { ...this.site.camp, heading: turn };
    if (where === 'gate') return { ...sitePoint(this.site, this.site.length + 1.5, 0), heading: turn };
    const [lat, , t] = this.localOf(this.chest.at), a = this.chestTurn, p = sitePoint(this.site, t - 2.4 * Math.cos(a), lat - 2.4 * Math.sin(a));
    return { ...p, heading: a + turn };
  }
  /** Where a horse is left while its rider goes in on foot: beside the rack, away from the way in, facing the mouth (in the land). */
  get horseSpot(): { x: number; z: number; heading: number } {
    const [lat, t] = this.parking, p = sitePoint(this.site, t, lat);
    return { ...p, heading: Math.atan2(this.site.ax, this.site.az) };
  }
  /** Where the ski rack stands (in the land), and which way its skis lean from it, level: for what is brought to it from elsewhere. */
  get rackSpot(): { x: number; z: number; heading: number } {
    const p = sitePoint(this.site, this.rack.position.z, this.rack.position.x);
    return { ...p, heading: Math.atan2(this.site.ax, this.site.az) };
  }
  /** The horse left there (in the way of one walking), or taken away again. */
  parkHorse(on: boolean): void {
    for (let i = this.posts.length - 1; i >= 0; i--) if (this.posts[i].horse) this.posts.splice(i, 1);
    if (on) for (const d of [-0.8, 0, 0.8]) this.posts.push({ lat: this.parking[0], t: this.parking[1] + d, r: 0.45, horse: true });
  }
  /** How far each square of the dungeon is from the square the one on foot was last in, through the open ones (for the orcs' way). */
  private field: { from: number; dist: Int16Array } | null = null;
  private fieldFrom(k0: number): Int16Array {
    if (this.field?.from === k0) return this.field.dist;
    const { cols, rows } = this.layout, dist = new Int16Array(cols * rows).fill(-1), queue = [k0];
    dist[k0] = 0;
    for (let q = 0; q < queue.length; q++) {
      const k = queue[q], c = k % cols, r = (k / cols) | 0;
      for (const [dc, dr] of WAYS) { const i = c + dc, j = r + dr; if (!this.open(i, j) || dist[j * cols + i] >= 0 || this.shutBetween(c, r, dc, dr)) continue; dist[j * cols + i] = dist[k] + 1; queue.push(j * cols + i); }
    }
    this.field = { from: k0, dist };
    return dist;
  }
  /** The square one at a point (in the land) is in, or for one in the tunnel the square inside the gate; none outside. */
  private squareOf(x: number, z: number): number {
    const [t, lat] = siteLocal(this.site, x, z), L = this.site.length;
    if (t > L) { const k = this.cellAt(lat, t); return k && this.open(k[0], k[1]) ? k[1] * this.layout.cols + k[0] : -1; }
    return t > 0 ? this.layout.entry : -1;
  }
  /**
   * Where orcs may come from (in the land), for one on foot at `from` in the dungeon: the middle of a square of a room some way off by
   * the corridors and out of its sight, on any level; none while it is not in the dungeon, nor if there is no such room.
   */
  orcSpawn(rng: Rng, from: { x: number; z: number }): { x: number; z: number } | null {
    const [t, lat] = siteLocal(this.site, from.x, from.z), k0 = this.squareOf(from.x, from.z);
    if (t <= this.site.length || k0 < 0) return null;
    const dist = this.fieldFrom(k0), { cols, cells } = this.layout, me = new Vector3(lat, 0, t), out: number[] = [];
    for (let k = 0; k < cells.length; k++) {
      if (cells[k] !== 2 || dist[k] < 5) continue;
      const at = new Vector3(this.latOf(k % cols), 0, this.tOf((k / cols) | 0));
      if (at.distanceTo(me) > 9 && !this.sees(at, me)) out.push(k);
    }
    if (!out.length) return null;
    const k = rng.pick(out);
    return sitePoint(this.site, this.tOf((k / cols) | 0), this.latOf(k % cols));
  }
  /**
   * Which way one at `p` goes to come at `to` (both in the land; level, of length one, in the land): straight at it where nothing stands
   * between them, or in the tunnel; else on to the next square nearer it by the corridors, through the doorways and up and down stairs.
   */
  orcWay(p: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number } {
    const [pt, pl] = siteLocal(this.site, p.x, p.z), [tt, tl] = siteLocal(this.site, to.x, to.z), L = this.site.length;
    const toLand = (dt: number, dl: number) => { const n = Math.hypot(dt, dl) || 1; return { x: (this.site.ax * dt + this.site.az * dl) / n, z: (this.site.az * dt - this.site.ax * dl) / n }; };
    const kp = this.squareOf(p.x, p.z), kt = this.squareOf(to.x, to.z), here = new Vector3(pl, 0, pt), there = new Vector3(tl, 0, tt);
    if (kp < 0 || kt < 0 || kp === kt || pt <= L || (here.distanceTo(there) < 14 && this.sees(here, there))) {
      // (Into the tunnel from the dungeon, by the gate's doorway first.)
      if (pt > L && tt <= L) return toLand(L - 1 - pt, -pl);
      return toLand(tt - pt, tl - pl);
    }
    const dist = this.fieldFrom(kt), { cols } = this.layout, c = kp % cols, r = (kp / cols) | 0;
    let best = -1, least = dist[kp] < 0 ? 1e9 : dist[kp];
    for (const [dc, dr] of WAYS) { const i = c + dc, j = r + dr; if (!this.open(i, j)) continue; const d = dist[j * cols + i]; if (d >= 0 && d < least) { least = d; best = j * cols + i; } }
    if (best < 0) return toLand(tt - pt, tl - pl);
    return toLand(this.tOf((best / cols) | 0) - pt, this.latOf(best % cols) - pl);
  }
  /** What stands about cut away, seen from above, over the height of the floor the one on foot is on (`overhead`). */
  private cutAway(m: MeshStandardNodeMaterial) {
    m.opacityNode = select(positionWorld.y.greaterThan(this.cutAt), float(0), float(1)).mul(this.fog());
    m.alphaTestNode = float(0.5);
  }
  /**
   * Whether a point drawn is in a square seen (1) or not (0), while the fog is on: the point taken a hand along its surface's normal,
   * so that a wall, which stands on the line between two squares, is the open square's it faces, and the top of a wall the rock's beside
   * it (which is seen as the open squares beside it are). The tunnel and the camp, short of the lattice, always seen.
   */
  private fog(): N {
    const L = this.layout, p = (this.toFrame as N).mul(vec4((positionWorld as N).add((normalWorld as N).mul(0.35)), 1)).xyz;
    const c = p.x.div(CAVE.cell).add(L.cols / 2).floor(), r = p.z.sub(this.site.length).div(CAVE.cell).floor();
    const seen = (texture(this.fogMap, vec2(c.add(0.5).div(L.cols), r.add(0.5).div(L.rows))) as N).r;
    return select(r.lessThan(0), float(1), mix(float(1), seen, this.fogOn));
  }
  /** A square seen, and the rock about it with it (its walls' tops, its caps), the picture of what is seen made again. */
  private see(c: number, r: number): boolean {
    const L = this.layout;
    let more = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc, rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= L.cols || rr >= L.rows) continue;
      const k = rr * L.cols + cc;
      if (this.seen[k] || ((dc || dr) && L.cells[k] > 0)) continue;
      this.seen[k] = 1; more = true;
      (this.fogMap.image.data as Uint8Array).set([255, 255, 255, 255], k * 4);
    }
    return more;
  }
  /**
   * What the one on foot at `at` (in the land) sees of the lattice, seen from now on: every open square within eighteen metres that a line
   * from it reaches across the plan (`sees`), and the one it stands in. Looked over a few times a second, and only as it moves.
   */
  private lookAbout(at: Vector3, seconds: number): void {
    const [lat, , t] = this.localOf(at), here = this.cellAt(lat, t), key = here ? `${here[0]},${here[1]},${Math.round(lat)},${Math.round(t)}` : '';
    if (!here || (key === this.lookedFrom && seconds - this.lookedAt < 1)) return;
    if (seconds - this.lookedAt < 0.15) return;
    this.lookedAt = seconds; this.lookedFrom = key;
    const L = this.layout, from = new Vector3(lat, 0, t), R = 6;
    let more = this.see(here[0], here[1]);
    for (let r = here[1] - R; r <= here[1] + R; r++) for (let c = here[0] - R; c <= here[0] + R; c++) {
      if (!this.open(c, r) || this.seen[r * L.cols + c]) continue;
      const to = new Vector3(this.latOf(c), 0, this.tOf(r));
      if (Math.hypot(to.x - lat, to.z - t) > 18) continue;
      // (Any of its middle and its corners in sight: a doorway seen through shows the near side of the room beyond.)
      const h = CAVE.cell * 0.42;
      if ([[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]].some(([dx, dz]) => this.sees(from, to.clone().add(new Vector3(dx, 0, dz))))) more = this.see(c, r) || more;
    }
    if (more) this.fogMap.needsUpdate = true;
  }
  /** Whether a point of the land in the dungeon is in sight of the one on foot at `from` now: near enough, and nothing solid between. */
  inSight(from: Vector3, p: Vector3): boolean {
    const [la, , ta] = this.localOf(from), [lb, , tb] = this.localOf(p);
    return Math.hypot(lb - la, tb - ta) < 22 && this.sees(new Vector3(la, 0, ta), new Vector3(lb, 0, tb));
  }
  /**
   * The dungeon's plan as it has been seen, for a map: its lattice's size, what each square is (0 rock, 1 hall, 2 room, 3 stair), which
   * room, and whether seen; its rooms (kind and what is said of each); the square a point of the land is in, and where in it; and the way
   * the lattice lies in the land (radians, from the land's +z to the cave's way in).
   */
  plan(): { cols: number; rows: number; kind: Uint8Array; room: Int16Array; seen: Uint8Array; rooms: { kind: string; note: string }[]; name: string; turn: number } {
    const L = this.layout, kind = new Uint8Array(L.cols * L.rows);
    for (let k = 0; k < kind.length; k++) kind[k] = L.cells[k] === 1 && L.down[k] >= 0 ? 3 : L.cells[k];
    return { cols: L.cols, rows: L.rows, kind, room: L.roomAt, seen: this.seen, rooms: L.rooms.map((r) => ({ kind: r.kind, note: r.note })), name: L.name, turn: Math.atan2(this.site.ax, this.site.az) };
  }
  /** Where a point of the land lies on the plan: in squares, across (`c`) and in (`r`), as fractions; none outside the lattice. */
  onPlan(x: number, z: number): { c: number; r: number } | null {
    const [lat, , t] = this.localOf({ x, z }), c = lat / CAVE.cell + this.layout.cols / 2, r = (t - this.site.length) / CAVE.cell;
    return r < 0 || c < 0 || c >= this.layout.cols || r >= this.layout.rows ? null : { c, r };
  }
  /**
   * Seen from above on foot (asked: "Lets have the view top down / isometric like minecraft dungeons or diablo 4 etc. ... adapting the
   * view / camera / drawing to properly work for this way"), and inside (`under`): the cave's stone cut away over a height above its own
   * floor, its roofs and the tops of its walls, the cut faces capped dark; what stands about cut over that height above `floor`, the floor
   * the one on foot stands on; the mound and the rock face over it all not drawn. Else drawn whole.
   */
  overhead(on: boolean, under: boolean, floor: number): void {
    const cut = on && under;
    this.cutOver.value = cut ? CUT : 1e5;
    this.cutAt.value = cut ? floor + CUT + 0.6 : 1e5;
    this.capMesh.visible = cut;
    for (const m of this.outside) m.visible = !cut;
    this.seenFromAbove = cut;
  }
  private seenFromAbove = false;
  /** Drawn whole however far off the eye is, for a picture of all of it (`__slope.cutaway`): the dungeon, no plug in the mouth, nothing cut away. */
  drawWhole(): void { this.overhead(false, false, 0); this.inner.visible = true; this.plug.visible = false; }
  /** Let go of with its land: what is its own and not in the land's group, the map of what has been seen (a picture the land's letting go never reaches, as it is in no mesh's paint but only read by one). */
  dispose(): void { this.fogMap.dispose(); }
  /** The skis (and poles) left on the rack while their owner is on foot: of a person, a horse's long pair or its four short; or none. */
  rackSkis(kind: 'person' | 'pair' | 'four' | null, poles: number): void {
    // (Their paints are made with them each time, so let go of with their shapes.)
    for (const c of [...this.rack.children]) { this.rack.remove(c); (c as Mesh).geometry?.dispose(); ((c as Mesh).material as Material | undefined)?.dispose(); }
    if (!kind) return;
    const paint = new MeshStandardNodeMaterial({ color: 0xc0322b, roughness: 0.5 }), pole = new MeshStandardNodeMaterial({ color: 0x1d1f24, roughness: 0.4, metalness: 0.5 });
    const [len, width, n] = kind === 'person' ? [1.68, 0.075, 2] : kind === 'pair' ? [2.88, 0.11, 2] : [1.0, 0.1, 4];
    const lean = 0.28, gap = kind === 'four' ? 0.38 : 0.2;
    for (let i = 0; i < n; i++) {
      const ski = new Mesh(new BoxGeometry(width, 0.025, len).translate(0, 0, len / 2).rotateX(-Math.PI / 2), paint);
      ski.position.set(-0.32, 0, (i - (n - 1) / 2) * gap - 0.45);
      ski.rotation.z = -lean;
      ski.castShadow = true;
      this.rack.add(ski);
    }
    for (let i = 0; i < (poles ? 2 : 0); i++) {
      const p = new Mesh(new CylinderGeometry(0.012, 0.009, poles, 6).translate(0, poles / 2, 0), pole);
      p.position.set(-0.25, 0, 0.45 + i * 0.12);
      p.rotation.z = -lean * (1.3 / poles) * 1.6;
      p.castShadow = true;
      this.rack.add(p);
    }
  }
  /** The chest opened: its lid thrown back, its gold shining. */
  openChest(): void { this.chest.opened = true; this.glow.visible = true; }
  /** The chest shut again, its gold within: a run begun again. */
  shutChest(): void { this.chest.opened = false; this.chest.open = 0; this.lid.rotation.x = 0; this.glow.visible = false; this.resetPlot(); }

  /**
   * A moment on: the torches and the fire flickering, their flames turned to the eye, the campfire's smoke rising; the light carried
   * in (`carried`, 0 to 1) about `player`; the dungeon drawn only when the eye is near enough to see into it; the snow under it all
   * from far off. `eye` and `player` in the land.
   */
  update(dt: number, seconds: number, eye: Vector3, player: Vector3 | null, carried: number, ahead?: Vector3): void {
    const flick = (k: number) => 0.9 + 0.06 * Math.sin(seconds * 7.3 + k * 1.7) + 0.04 * Math.sin(seconds * 17.9 + k * 3.1);
    this.flicker.value = flick(0);
    const [lat, , t] = this.localOf(eye), far = Math.hypot(lat, t);
    this.inner.visible = far < 90 || this.inside(eye.x, eye.z) || this.seenFromAbove;
    // (The fog over what has not been seen, only on foot inside, seen from above; what is in sight of the one on foot seen.)
    this.inner.updateMatrixWorld();
    (this.toFrame.value as Matrix4).copy(this.inner.matrixWorld).invert();
    this.fogOn.value = this.seenFromAbove && player ? 1 : 0;
    if (player && this.inside(player.x, player.z)) this.lookAbout(player, seconds);
    this.plug.visible = far > 118;
    // (Each flame turned about the upright to face the eye, tall and narrow, flickering.)
    const local = new Vector3(lat, eye.y, t), q = new Quaternion(), s = new Vector3(), p = new Vector3();
    const face = (at: Vector3) => q.setFromAxisAngle(UP, Math.atan2(local.x - at.x, local.z - at.z));
    if (this.inner.visible || far < 140) {
      this.torches.forEach((torch, i) => {
        const f = flick(i + 1);
        const k = torch.kind === 'candle' ? 0.22 : torch.kind === 'brazier' ? 1.5 : 1;
        // (Not where it has not been seen, under the fog: a flame there would have shone out of the dark.)
        const hid = torch.kind === 'sky' || (this.fogOn.value > 0 && !this.seenAt(torch.at.x + torch.facing.x * 0.5, torch.at.z + torch.facing.z * 0.5));
        const cold = torch.color === COLD_FIRE, placed = this.m4.compose(p.copy(torch.at).addScaledVector(UP, -0.1 * k), face(torch.at), hid ? s.set(0, 0, 0) : s.set(0.26 * (2 - f) * k, 0.5 * f * k, 1));
        this.flames.setMatrixAt(i, cold ? ZERO_M : placed);
        this.coldFlames.setMatrixAt(i, cold ? placed : ZERO_M);
      });
      this.flames.count = this.coldFlames.count = this.torches.length;
      this.flames.instanceMatrix.needsUpdate = true;
      this.coldFlames.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < 6; i++) {
        const a = i * 2.1 + seconds * 0.7, f = flick(i + 30), o = i < 3 ? 0.06 : 0.2;
        this.fire.setMatrixAt(i, this.m4.compose(p.set(this.fireAt.x + o * Math.cos(a), this.fireAt.y + 0.08, this.fireAt.z + o * Math.sin(a)), face(this.fireAt), s.set((i < 3 ? 0.75 : 0.45) * (2 - f), (i < 3 ? 1.15 : 0.7) * f * (0.85 + 0.15 * Math.sin(seconds * 3 + i)), 1)));
      }
      this.fire.instanceMatrix.needsUpdate = true;
      this.puffs.forEach((pf, i) => {
        pf.age += dt;
        if (pf.age > pf.life) { pf.age = 0; pf.x = this.rng.range(-0.15, 0.15); pf.z = this.rng.range(-0.15, 0.15); pf.drift = this.rng.range(-1, 1); }
        const k = pf.age / pf.life, rise = 1.1 + 4.5 * k, size = 0.5 + 1.8 * k;
        this.smoke.setMatrixAt(i, this.m4.compose(p.set(this.fireAt.x + pf.x + pf.drift * 0.8 * k + 0.6 * k, this.fireAt.y + rise, this.fireAt.z + pf.z + 0.4 * k), face(this.fireAt), s.set(size, size, 1)));
        this.smokeFade.array[i] = smooth(k / 0.15) * (1 - smooth((k - 0.4) / 0.6));
      });
      this.smoke.instanceMatrix.needsUpdate = true;
      this.smokeFade.needsUpdate = true;
    }
    this.fireLight.intensity = 9 * flick(50) * (0.85 + 0.15 * Math.sin(seconds * 11.3));
    // (Held up a little ahead of whoever carries it, the way it looks: what comes at it out of the dark is lit as it comes.)
    if (player) { const at = ahead ? player.clone().addScaledVector(ahead, 1.4) : player; this.lanternLocal.set(...this.localOf(at)).setY(player.y + 2.5); }
    this.lantern.intensity = 5 * carried * flick(60);
    // (Shared, in the scene itself: set where they stand in the land, as this cave lies in it now.)
    if (this.sharedLights) {
      this.frame.updateWorldMatrix(true, false);
      this.fireLight.position.copy(this.fireLocal).applyMatrix4(this.frame.matrixWorld);
      this.lantern.position.copy(this.lanternLocal).applyMatrix4(this.frame.matrixWorld);
    } else this.lantern.position.copy(this.lanternLocal);
    // (The chest's lid thrown back over a second, once opened.)
    if (this.chest.opened && this.chest.open < 1) { this.chest.open = Math.min(1, this.chest.open + dt * 0.9); this.lid.rotation.x = -1.85 * smooth(this.chest.open); }
    this.glow.rotation.y = Math.atan2(local.x - this.glow.position.x, local.z - this.glow.position.z);
    if (this.stash) this.stash.glow.rotation.y = Math.atan2(local.x - this.stash.glow.position.x, local.z - this.stash.glow.position.z);
    this.stepPlot(dt, seconds, local, player ? new Vector3(...this.localOf(player)).setY(player.y) : null);
  }
}
