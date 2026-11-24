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
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide,
  Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, PointLight, Quaternion, RepeatWrapping, SphereGeometry, SRGBColorSpace,
  Texture, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, lights, mix, sin, texture, time, uniform, uv, vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, valueNoise2 } from '../src/core/rng';
import { type PropKind, Props, type Stuff } from './slopeProps';
import { type Grid, gridAt, type SkiSlice } from '../src/core/skiSlice';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const UP = new Vector3(0, 1, 0);

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
}

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
function sliceFrame(slice: SkiSlice) {
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
 * tunnel soonest, the camp wants the least levelling and the tunnel the least depth; and nearest the run's middle. None if none will do.
 */
export function findSite(slice: SkiSlice): CaveSite | null {
  const F = sliceFrame(slice), L = F.length, H = F.height;
  let best: { site: CaveSite; score: number } | null = null;
  for (let s = 0.4 * L; s <= 0.6 * L; s += 5) {
    const [lo, hi] = F.edges(s);
    for (const side of [1, -1]) {
      const edge = side > 0 ? hi : lo, f = F.at(s, 0), lx = f.dz * side, lz = -f.dx * side;
      for (const turn of [-40, -20, 0, 20, 40]) {
        const a = (turn * Math.PI) / 180, ax = lx * Math.cos(a) + f.dx * Math.sin(a), az = lz * Math.cos(a) + f.dz * Math.sin(a);
        const m = F.at(s, edge + side * 2.5), mouth = { x: m.x, z: m.z };
        const site: CaveSite = { s, side, mouth, ax, az, y0: 0, deep: 0, camp: { x: 0, z: 0 }, length: 20, holeTo: 0 };
        const P = (t: number, lat: number) => sitePoint(site, t, lat), Hs = (t: number, lat: number) => { const p = P(t, lat); return H(p.x, p.z); };
        const c = P(-(CAVE.campR - 0.5), 0);
        site.camp = { x: c.x, z: c.z };
        // (The camp and the land about the mouth on the run's own snow, within its band.)
        let fits = true, sum = 0, n = 0;
        const heights: number[] = [];
        for (let u = -CAVE.campR - 3; u <= CAVE.campR + 3 && fits; u += 1.5) for (let v = -CAVE.campR - 3; v <= CAVE.campR + 3 && fits; v += 1.5) {
          const x = c.x + u, z = c.z + v;
          if (!F.onSnow(x, z)) fits = false;
          else if (u * u + v * v <= CAVE.campR * CAVE.campR) heights.push(H(x, z));
        }
        if (!fits) continue;
        heights.sort((p, q) => p - q);
        site.y0 = heights[heights.length >> 1];
        for (const h of heights) { sum += Math.abs(h - site.y0); n++; }
        const levelling = sum / n;
        // (How deep the dungeon lies, and so how long the tunnel down to it is: found again as the tunnel's length moves the dungeon.)
        for (let k = 0; k < 5; k++) {
          let least = Infinity;
          for (let t = site.length; t <= site.length + CAVE.rows * CAVE.cell; t += 2) for (let lat = -CAVE.cols * CAVE.cell / 2; lat <= CAVE.cols * CAVE.cell / 2; lat += 2) least = Math.min(least, Hs(t, lat));
          site.deep = Math.min(site.y0 - 2.5, least - CAVE.room - CAVE.cover);
          site.length = CAVE.levelIn + (site.y0 - site.deep) / CAVE.grade + CAVE.levelOut;
        }
        if (site.y0 - site.deep > 20) continue;
        // (How far in the tunnel comes under the snow, with the snow's hanging edge clear of its roof: from there on all the way.)
        const clear = (t: number) => {
          const roof = floorAt(site, t) + CAVE.tall + CAVE.rough + CAVE.tunnelCover;
          for (const lat of [-HOLE_HALF - 1, -HOLE_HALF / 2, 0, HOLE_HALF / 2, HOLE_HALF + 1]) if (Hs(t, lat) < roof) return false;
          return true;
        };
        let holeTo = site.length;
        for (let t = site.length; t >= CAVE.holeFrom; t -= 0.5) { if (!clear(t)) break; holeTo = t; }
        if (holeTo >= site.length - 1 || holeTo > 16) continue;
        site.holeTo = Math.max(CAVE.holeFrom + 1, holeTo + 1);
        // (The hole, the mound over it and its border on the run's snow.)
        for (let t = -2; t <= site.holeTo + 4 && fits; t += 1) for (let lat = -MOUND_HALF - 2; lat <= MOUND_HALF + 2 && fits; lat += 1) { const p = P(t, lat); if (!F.onSnow(p.x, p.z)) fits = false; }
        if (!fits) continue;
        const score = -3 * levelling - 0.8 * site.holeTo - 0.25 * (site.y0 - site.deep) - 25 * Math.abs(s / L - 0.5) - 0.02 * Math.abs(turn);
        if (!best || score > best.score) best = { site: { ...site, mouth: { ...site.mouth }, camp: { ...site.camp } }, score };
      }
    }
  }
  return best?.site ?? null;
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

type RoomKind = 'gate' | 'hall' | 'store' | 'crypt' | 'ossuary' | 'shrine' | 'tomb' | 'library' | 'sanctum' | 'cell' | 'guard' | 'warden' | 'vault' | 'hoard';
type DoorKind = 'arch' | 'door' | 'portcullis';
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
  return { cols: COLS, rows: ROWS, entry: ENTRY, tags, cells, rooms, roomAt, far, floor, low, down, top, doors, name, about };
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
const paintsOf = () => {
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

/** What each stuff a prop is made of is painted with, and how it takes the light. */
const STUFF_PAINT: Partial<Record<Stuff, 'wood' | 'wall' | 'rock' | 'earth'>> = { wood: 'wood', stone: 'wall', straw: 'earth', clay: 'rock' };
const STUFF_LOOK: Record<Stuff, { color?: number; roughness: number; metalness?: number; side?: typeof DoubleSide }> = {
  wood: { roughness: 0.85 }, iron: { color: 0x55555c, roughness: 0.45, metalness: 0.7 }, stone: { color: 0xd0c8bc, roughness: 0.9 },
  bone: { color: 0xd8cfb8, roughness: 0.7 }, gold: { color: 0xffc040, roughness: 0.3, metalness: 1 }, cloth: { color: 0xf0f0f0, roughness: 0.95, side: DoubleSide },
  wax: { color: 0xeee2c4, roughness: 0.6 }, straw: { color: 0xffe0a0, roughness: 1 }, clay: { color: 0xd09070, roughness: 0.8 }, coal: { color: 0x201812, roughness: 1 },
};

// ------------------------------------------------------------------------------------------------------------------------ shapes

/** A shape put together a triangle at a time: where each point is, which way it faces, where it is on its picture, its light. */
class Shape {
  readonly pos: number[] = []; readonly nor: number[] = []; readonly uv: number[] = []; readonly light: number[] = []; readonly snow: number[] = []; readonly index: number[] = [];
  get count() { return this.pos.length / 3; }
  point(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, snow = 0): number {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.light.push(0, 0, 0); this.snow.push(snow);
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
    if (withLight) g.setAttribute('aLight', new BufferAttribute(new Float32Array(this.light), 3));
    if (withSnow) g.setAttribute('aSnow', new BufferAttribute(new Float32Array(this.snow), 1));
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
interface Torch { at: Vector3; facing: Vector3; kind: 'wall' | 'post' | 'candle' | 'brazier'; power: number }
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
const TORCH_LIGHT = new Color(1.0, 0.66, 0.38), DAYLIGHT = new Color(0.78, 0.84, 0.95), DARK = new Color(0.022, 0.024, 0.03);
const TORCH_REACH = 15;
const addScaled = (into: Color, c: Color, k: number) => { into.r += c.r * k; into.g += c.g * k; into.b += c.b * k; };
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The cave, made: its mound and rock face, the camp, the tunnel and the dungeon (`group`, to go in the land's own), and what the
 * game asks of it, in the land's frame: where one on foot may go and how high its floor is there, where a view may stand, how deep
 * in a point is, and what is solid to one on skis. Inside, its own frame (`frame`): across the way in to its left (x), up, and in (z).
 */
export class Cave {
  readonly group = new Group();
  /** The light carried in by one on foot, and the campfire's: the only lights the cave's own stone takes. */
  readonly lantern = new PointLight(0xffc690, 0, 20, 1.6);
  readonly fireLight = new PointLight(0xff9440, 0, 24, 2);
  /** The chest's place in the land, and how far open it is. */
  readonly chest = { at: new Vector3(), open: 0, opened: false };
  private readonly frame = new Group();
  private readonly inner = new Group();
  private readonly layout: Layout;
  private readonly torches: Torch[] = [];
  private readonly posts: Post[] = [];
  private readonly flicker = uniform(1);
  private readonly plug: Mesh;
  private readonly flames: InstancedMesh;
  private readonly fire: InstancedMesh;
  private readonly smoke: InstancedMesh;
  private readonly smokeFade: InstancedBufferAttribute;
  private readonly lid = new Group();
  private readonly glow: Mesh;
  private readonly rack = new Group();
  private readonly fireAt: Vector3;
  private readonly puffs: { age: number; life: number; x: number; z: number; drift: number }[] = [];
  private readonly rng: Rng;
  private readonly m4 = new Matrix4();
  private chestTurn = 0;
  /** Where a horse is left, across and along (`horseSpot`). */
  private parking: [number, number] = [0, 0];

  constructor(readonly site: CaveSite, private readonly base: BaseHeight, readonly seed: string, asked: string[] = []) {
    const P = paintsOf();
    this.rng = new Rng(`dungeon ${seed}`);
    this.layout = layDungeon(this.rng.fork('layout'), tagsFor(this.rng.fork('tags'), asked));
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

    // ---- The cave's own stone, lit by its torches (worked out here, `bake`) and the day at the mouth, and by nothing in the scene but
    // the light carried in and the campfire.
    const stone = (paint: Paint, roughness = 0.92) => {
      const m = new MeshStandardNodeMaterial({ map: paint.map, normalMap: paint.normal, roughness, metalness: 0 });
      m.emissiveNode = (texture(paint.map, uv()).rgb as N).mul(attribute('aLight', 'vec3')).mul(this.flicker);
      m.lightsNode = lights([this.lantern, this.fireLight]);
      return m;
    };
    for (const s of [walls, floors, rock, earth]) this.bake(s);
    for (const [s, m] of [[walls, stone(P.wall)], [floors, stone(P.floor, 0.85)], [rock, stone(P.rock, 0.95)], [earth, stone(P.earth, 0.97)]] as const) {
      const mesh = new Mesh(s.geometry(true), m);
      mesh.receiveShadow = true;
      this.inner.add(mesh);
    }

    // ---- Outside: the mound over the hole and the face of rock with the mouth in it, under snow where they face up; lit as the land is.
    const outside = new MeshStandardNodeMaterial({ map: P.rock.map, normalMap: P.rock.normal, roughness: 0.93 });
    outside.colorNode = mix(texture(P.rock.map, uv()).rgb, vec3(0.93, 0.95, 0.99), attribute('aSnow', 'float'));
    const mound = new Shape(), face = new Shape();
    this.layMound(mound, face);
    for (const s of [mound, face]) {
      const mesh = new Mesh(s.geometry(false, true), outside);
      mesh.castShadow = mesh.receiveShadow = true;
      this.frame.add(mesh);
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
    this.fireLight.position.copy(this.fireAt).addScaledVector(UP, 0.9);
    this.frame.add(this.fireLight, this.lantern);
    for (let i = 0; i < 14; i++) this.puffs.push({ age: this.rng.range(0, 4), life: this.rng.range(3, 4.5), x: 0, z: 0, drift: this.rng.range(-1, 1) });
    this.frame.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------------------------------------------------- building it

  /** A point of the cave's own frame in the land. */
  private toLand(lat: number, y: number, t: number): Vector3 { const p = sitePoint(this.site, t, lat); return new Vector3(p.x, y, p.z); }
  /** The land's height (as it was before the hole) under a point of the cave's own frame. */
  private groundAt(lat: number, t: number): number { const p = sitePoint(this.site, t, lat); return this.base(p.x, p.z); }
  /** Across the way in, the middle of the dungeon's square `c`; along it, of row `r`. */
  private latOf(c: number) { return (c - (this.layout.cols - 1) / 2) * CAVE.cell; }
  private tOf(r: number) { return this.site.length + (r + 0.5) * CAVE.cell; }
  private open(c: number, r: number) { return c >= 0 && r >= 0 && c < this.layout.cols && r < this.layout.rows && this.layout.cells[r * this.layout.cols + c] > 0; }
  /** The square a point of the cave's own frame is in, or none outside the lattice. */
  private cellAt(lat: number, t: number): [number, number] | null {
    const c = Math.floor(lat / CAVE.cell + this.layout.cols / 2), r = Math.floor((t - this.site.length) / CAVE.cell);
    return c < 0 || r < 0 || c >= this.layout.cols || r >= this.layout.rows ? null : [c, r];
  }
  private openAt(lat: number, t: number) { const k = this.cellAt(lat, t); return !!k && this.open(k[0], k[1]); }
  /** Open, in the dungeon, or through the gate's doorway into the tunnel's end. */
  private passAt(lat: number, t: number) { return t > this.site.length ? this.openAt(lat, t) : t > this.site.length - 2 && Math.abs(lat) < CAVE.cell / 2; }

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
      for (let k = 0; k <= across; k++) { const lat = -wide + (2 * wide * k) / across; earth.point(lat, y + 0.02 + 0.03 * valueNoise2(lat * 2, t * 2, 3), t, 0, 1, 0, lat / 2.5, t / 2.5); }
    }
    for (let i = 0; i <= rows; i++) for (let k = 0; k < across; k++) { const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1; earth.tri(a, c, b); earth.tri(b, c, d); }
    earth.smoothNormals();
    // The gate: a wall of dressed stone across the tunnel's end, a doorway in it as broad and high as the corridor behind.
    const deep = this.site.deep, W = CAVE.hw + CAVE.rough + 1, top = CAVE.tall + CAVE.rough + 1, half = CAVE.cell / 2, n = new Vector3(0, 0, -1);
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
        const mine = this.edgeFloor(c, r, dc, dr);
        if (!this.open(c + dc, r + dr)) { wall(c, r, dc, dr, Math.min(floor[k], low[k]), top[k]); continue; }
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
      const k = d.r * this.layout.cols + d.c, x = this.latOf(d.c), t = this.tOf(d.r), go = new Vector3(d.dc, 0, d.dr), side = new Vector3(-d.dr, 0, d.dc);
      const f = this.edgeFloor(d.c, d.r, d.dc, d.dr), roof = top[k], edge = new Vector3(x, 0, t).addScaledVector(go, half - 0.22);
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
    const at = this.cellAt(lat, t);
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
      addScaled(into, TORCH_LIGHT, torch.power * Math.min(2.2, 1.9 / (1 + (d / 1.1) ** 2)) * smooth((TORCH_REACH - d) / 4) * face);
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
        default: {
          // The last room: across from the way in, what it is for; and the chest before it.
          const [bx, bt] = back(room.kind === 'hoard' || room.kind === 'warden' ? 1.2 : 1.6);
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
    const goldM = new MeshStandardNodeMaterial({ color: 0xffc040, roughness: 0.3, metalness: 1 });
    // The doors left standing open against the walls, and the portcullises drawn up into their lintels.
    const iron = new MeshStandardNodeMaterial({ color: 0x3a3a3e, roughness: 0.5, metalness: 0.8 }), plank = woodM();
    for (const d of this.layout.doors) {
      if (d.kind === 'arch') continue;
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
      } else {
        const bars: BufferGeometry[] = [], w = CAVE.cell - 0.96, hgt = roof - f - 0.62 - 2.7;
        for (let i = 0; i <= 10; i++) bars.push(new CylinderGeometry(0.025, 0.025, hgt + 0.5, 5).translate(-w / 2 + (w * i) / 10, 2.7 + (hgt + 0.5) / 2, 0));
        for (const y of [2.82, 2.7 + hgt]) bars.push(new BoxGeometry(w, 0.05, 0.05).translate(0, y, 0));
        const grate = new Mesh(mergeGeometries(bars), this.glowing(iron, c));
        grate.position.copy(edge);
        grate.rotation.y = Math.atan2(side.x, side.z) - Math.PI / 2;
        this.inner.add(grate);
      }
    }
    // The chest: a box of planks bound with iron, its lid on a hinge along its back.
    const chest = new Group(), wood = woodM(), local = new Vector3(...this.localOf(this.chest.at)), c = new Color();
    this.lightAt(local.clone().setY(this.chest.at.y + 0.8), UP, c);
    const body = new Mesh(new BoxGeometry(1.1, 0.6, 0.7).translate(0, 0.3, 0), this.glowing(wood, c, P.wood.map)), ironC = this.glowing(iron.clone() as MeshStandardNodeMaterial, c);
    const band = new BoxGeometry(0.06, 0.62, 0.72).translate(0, 0.31, 0);
    for (const bx of [-0.42, 0.42]) { const b = new Mesh(band, ironC); b.position.x = bx; chest.add(b); }
    const lid = new Mesh(new CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, -0.35), this.glowing(woodM(), c, P.wood.map));
    this.lid.position.set(0, 0.6, 0.35);
    this.lid.add(lid);
    const gold = new Mesh(new SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.45, 0.72).translate(0, 0.42, 0), this.glowing(goldM.clone() as MeshStandardNodeMaterial, c.clone().multiplyScalar(1.5)));
    chest.add(body, this.lid, gold);
    chest.position.set(local.x, this.chest.at.y, local.z);
    chest.rotation.y = this.chestTurn;
    chest.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    this.inner.add(chest);
    const glowPaint = new MeshBasicNodeMaterial({ map: P.puff, transparent: true, depthWrite: false, blending: AdditiveBlending });
    glowPaint.colorNode = vec3(1, 0.7, 0.25).mul(texture(P.puff, uv()).a).mul(0.8).mul(sin(time.mul(2.3)).mul(0.15).add(0.85));
    const glow = new Mesh(new PlaneGeometry(2.4, 2.4), glowPaint);
    glow.position.set(local.x, this.chest.at.y + 0.9, local.z);
    glow.visible = false;
    this.inner.add(glow);
    return glow;
  }
  /** A material lit as the dungeon's stone is, by the light `c` where its one thing stands. */
  private glowing(m: MeshStandardNodeMaterial, c: Color, paint?: Texture): MeshStandardNodeMaterial {
    const albedo = paint ? (texture(paint, uv()).rgb as N).mul(m.color) : vec3(m.color.r, m.color.g, m.color.b);
    m.emissiveNode = (albedo as N).mul(vec3(c.r, c.g, c.b)).mul(0.8).mul(this.flicker);
    m.lightsNode = lights([this.lantern]);
    return m;
  }

  // ---------------------------------------------------------------------------------------------------------- what it is asked

  /** A point of the land in the cave's own frame: across, in, and up as it is. */
  localOf(p: { x: number; z: number; y?: number }): [number, number, number] { const [t, lat] = siteLocal(this.site, p.x, p.z); return [lat, p.y ?? 0, t]; }
  /** Whether a point is in the camp (as the way in to the mouth, before it): where the skis come off. */
  inCamp(x: number, z: number, more = 0): boolean {
    const [t, lat] = siteLocal(this.site, x, z);
    return Math.hypot(x - this.site.camp.x, z - this.site.camp.z) < CAVE.campR + more || (t < 0.5 && t > -CAVE.campR && Math.abs(lat) < CAVE.hw + more);
  }
  /** Whether a point is inside, in the tunnel or the dungeon (past the mouth). */
  inside(x: number, z: number): boolean {
    const [t, lat] = siteLocal(this.site, x, z);
    return t > 0 && (t <= this.site.length ? Math.abs(lat) < CAVE.hw + CAVE.rough : this.openAt(lat, t));
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
        const room = [[-0.25, -0.25], [0.25, 0.25], [-0.25, 0.25], [0.25, -0.25]].every(([a, b]) => this.passAt(lat + a, t + b));
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
    return Math.hypot(x - this.site.camp.x, z - this.site.camp.z) > CAVE.campR + 12 && !(t > -CAVE.campR * 2 - 6 && t < this.site.holeTo + 6 && Math.abs(lat) < MOUND_HALF + 8);
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
  spot(where: 'camp' | 'gate' | 'tomb' | 'room' | 'stair', room = 0): { x: number; z: number; heading: number } {
    const turn = Math.atan2(this.site.ax, this.site.az);
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
      for (const [dc, dr] of WAYS) { const i = c + dc, j = r + dr; if (!this.open(i, j) || dist[j * cols + i] >= 0) continue; dist[j * cols + i] = dist[k] + 1; queue.push(j * cols + i); }
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
  /** The skis (and poles) left on the rack while their owner is on foot: of a person, a horse's long pair or its four short; or none. */
  rackSkis(kind: 'person' | 'pair' | 'four' | null, poles: number): void {
    for (const c of [...this.rack.children]) { this.rack.remove(c); (c as Mesh).geometry?.dispose(); }
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
  shutChest(): void { this.chest.opened = false; this.chest.open = 0; this.lid.rotation.x = 0; this.glow.visible = false; }

  /**
   * A moment on: the torches and the fire flickering, their flames turned to the eye, the campfire's smoke rising; the light carried
   * in (`carried`, 0 to 1) about `player`; the dungeon drawn only when the eye is near enough to see into it; the snow under it all
   * from far off. `eye` and `player` in the land.
   */
  update(dt: number, seconds: number, eye: Vector3, player: Vector3 | null, carried: number, ahead?: Vector3): void {
    const flick = (k: number) => 0.9 + 0.06 * Math.sin(seconds * 7.3 + k * 1.7) + 0.04 * Math.sin(seconds * 17.9 + k * 3.1);
    this.flicker.value = flick(0);
    const [lat, , t] = this.localOf(eye), far = Math.hypot(lat, t);
    this.inner.visible = far < 90 || this.inside(eye.x, eye.z);
    this.plug.visible = far > 118;
    // (Each flame turned about the upright to face the eye, tall and narrow, flickering.)
    const local = new Vector3(lat, eye.y, t), q = new Quaternion(), s = new Vector3(), p = new Vector3();
    const face = (at: Vector3) => q.setFromAxisAngle(UP, Math.atan2(local.x - at.x, local.z - at.z));
    if (this.inner.visible || far < 140) {
      this.torches.forEach((torch, i) => {
        const f = flick(i + 1);
        const k = torch.kind === 'candle' ? 0.22 : torch.kind === 'brazier' ? 1.5 : 1;
        this.flames.setMatrixAt(i, this.m4.compose(p.copy(torch.at).addScaledVector(UP, -0.1 * k), face(torch.at), s.set(0.26 * (2 - f) * k, 0.5 * f * k, 1)));
      });
      this.flames.count = this.torches.length;
      this.flames.instanceMatrix.needsUpdate = true;
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
    if (player) { const at = ahead ? player.clone().addScaledVector(ahead, 1.4) : player; this.lantern.position.set(...this.localOf(at)).setY(player.y + 2.5); }
    this.lantern.intensity = 5 * carried * flick(60);
    // (The chest's lid thrown back over a second, once opened.)
    if (this.chest.opened && this.chest.open < 1) { this.chest.open = Math.min(1, this.chest.open + dt * 0.9); this.lid.rotation.x = -1.85 * smooth(this.chest.open); }
    this.glow.rotation.y = Math.atan2(local.x - this.glow.position.x, local.z - this.glow.position.z);
  }
}
