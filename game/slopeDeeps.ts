/**
 * The deeps (asked: "the caves could maybe connect?", then "there should be generated more dungeon content for the passage, not just
 * straight tunnel... maybe some kind of cavernous style with higher vertical spaces and overlaps / bridges?", "make it generative in the
 * way the dungeon generators are somehow, if we ever build new ones I want them to be unique. These can also have possible enemies and
 * loot", "can we have other types of ascents and descents also possible than spiral stairs", "maybe an ancient elevator, other shaped
 * stairs etc"): the way under the mountain from a door in one dungeon of a run that parts to a door in the other's.
 *
 * A dungeon is a lattice, one floor to each square of it; the deeps are a line instead, as a run is, with a floor, a breadth to walk
 * and a cavern about it at each metre, and one on foot is followed along it from where it was, as a skier is along a run: so the line
 * may pass over itself, as a stair winding down a shaft does, each turn of it over the one below, or ramps zigzagging down a chamber's
 * wall, and still be walked.
 *
 * Laid from a seed, a chain of pieces: a way down from the first door (a stair winding down a round shaft, or round a square one in
 * flights and landings, ramps zigzagging down a tall chamber, a great stair, a slope of scree, a ledge along a cavern's wall over its
 * floor far below, or an old lift on its chains); then chambers, each of a kind and of its own size (a hall of pillars, a chasm crossed
 * by a bridge, a fissure, a grotto with a pool, a hall fallen in), joined by passages that wind from one to the next, set off each the
 * way that keeps clear of what is laid already; and a way up to the second door, of any of those kinds again, laid down from the door
 * and turned about. And in them, as the seed has it, torches and braziers, dens of foes and chests.
 */
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide, Euler, Group,
  IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, PlaneGeometry, type PointLight, Quaternion, type Texture, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, frontFacing, lights, mix, mx_fractal_noise_float, normalMap, positionWorld, select, sin, smoothstep as smoothNode, texture, time, uniform, uv, vec3 } from 'three/tsl';
import { Rng, valueNoise2 } from '../src/core/rng';
import { DARK, paintsOf, Shape, STUFF_LOOK, STUFF_PAINT, TORCH_LIGHT, TORCH_REACH } from './slopeDungeon';
import { type PropKind, Props, type Stuff } from './slopeProps';

/** A door of a dungeon the deeps go from or to: where its doorway is (its floor), and which way it looks out into the rock. */
export interface DeepsDoor { x: number; y: number; z: number; dx: number; dz: number }

/** The ways down (and, turned about, up). */
export type Descent = 'spiral' | 'square' | 'switchback' | 'grand' | 'scree' | 'ledge' | 'lift';
export type Chamber = 'hall' | 'chasm' | 'fissure' | 'grotto' | 'collapse' | 'abyss' | 'landing';
export type PieceKind = 'way' | Descent | Chamber;
/** A stretch of the line, by what it is (and, a way down turned about, that it goes up); and its name, as it is said on foot. */
export interface Piece { kind: PieceKind; up?: boolean; name: string; s0: number; s1: number }

/**
 * The deeps as they are laid: the line a metre at a time (`pts`), and at each metre how high its floor is, how far either side of it
 * one may walk, how far either side the cavern reaches and how high its roof is over the floor, how far its middle lies to the path's
 * left (a ledge runs along one wall), how far the land falls away beside the path (a chasm's, under a bridge; a ledge's, over the
 * cavern's floor), and whether the path there is open within a greater space (a shaft's, or a tall chamber's) and so drawn as a ledge, a
 * flight or a ramp in it, not a passage of its own. And what stands in it.
 */
export interface DeepsPlan {
  pts: [number, number][]; floor: number[]; walk: number[]; wide: number[]; roof: number[]; shift: number[]; drop: number[]; open: boolean[];
  pieces: Piece[];
  /** Pillars, and boulders fallen: round, in the way. */
  posts: { x: number; z: number; r: number; y0: number; y1: number; kind: 'pillar' | 'boulder' }[];
  /**
   * The shafts the stairs wind down, and the lifts' wells: their middle, their radius to the wall (a square one's half its side, turned
   * `turn`), from how deep to how high, and their stretch of the line.
   */
  shafts: { x: number; z: number; r: number; y0: number; y1: number; s0: number; s1: number; square?: { turn: number }; abyss?: boolean; twice?: boolean }[];
  /** The tall chambers ramps zigzag down: along a line (`axis`, its two ends), how far either side, from how deep to how high. */
  halls: { axis: [[number, number], [number, number]]; wide: number; y0: number; y1: number; s0: number; s1: number }[];
  /** The old lifts: where the platform rises and falls, from how deep to how high; the line's metre on it at its top, and at its foot. */
  lifts: { x: number; z: number; y0: number; y1: number; top: number; foot: number; turn: number }[];
  /** Pools, oval, their water's height. */
  pools: { x: number; z: number; rx: number; rz: number; turn: number; y: number }[];
  torches: { x: number; y: number; z: number; kind: 'wall' | 'brazier' }[];
  /** Where foes wait, and how many; where a chest stands, facing the path. */
  dens: { x: number; z: number; s: number; size: number }[];
  chests: { x: number; z: number; s: number; face: number }[];
  /**
   * The lines `pts` is made of, one after another: the way through first, from door to door; then each side way off it (asked: "some
   * side paths and rooms as well to not be just spaced piped one after another"), its stretch of metres and the metre of the way through
   * it leaves from (its first metres within that one's breadth), a dead end in a room; or, a way round (`to`), the metre of the way
   * through its last metres come back into further on (asked: "the path through can include a bit of wayfinding through the network").
   */
  lines: { s0: number; s1: number; from: number; to?: number }[];
  /**
   * The doors, one to each dungeon the deeps join (asked: "dynamic in a way that it could serve possible three dungeon interconnect in
   * the future... or why not more than three exits"): the metre at each, and which way along its line is out through it (-1, back past
   * its first metre; 1, on past its last). The first two are the way through's ends; each other the end of a way of its own.
   */
  doors: { s: number; out: -1 | 1 }[];
  /** The seed they were laid from: what is chosen in making them (how each passage is cut, what stands about) is chosen from it too. */
  seed?: string;
}

/** Each chamber's and passage's measures: how long, how far one may walk either side, how wide the cavern and how high its roof. */
const PIECES = {
  way: { long: [14, 26], walk: [1.6, 2.1], wide: [2.4, 3], roof: [3.6, 4.6] },
  hall: { long: [30, 44], walk: [10, 14], wide: [12, 16], roof: [12, 18] },
  chasm: { long: [22, 34], walk: [1.2, 1.4], wide: [13, 20], roof: [14, 20] },
  fissure: { long: [24, 38], walk: [1.1, 1.5], wide: [1.6, 2.2], roof: [8, 13] },
  grotto: { long: [18, 28], walk: [6, 8], wide: [9, 12], roof: [7, 10] },
  collapse: { long: [20, 30], walk: [8, 10], wide: [10, 13], roof: [9, 12] },
  // (A great chasm: round, as broad as `long`, crossed straight over on a bridge that `walk` and `wide` are; `roof` how far above.)
  abyss: { long: [28, 36], walk: [1.2, 1.3], wide: [1.6, 1.8], roof: [12, 18] },
} as const;
/** A great chasm's depth under the way across it, and how far over another way crosses it, above or below. */
const ABYSS = { depth: [30, 44], cross: [6, 8], chance: 0.85, twice: 0.5 } as const;
/**
 * The ways down: a round stair's radius and fall each turn; a square one's side and grade; a switchback's legs, how far each falls and
 * how far apart; the others' grade and measures; a lift's well.
 */
const SPIRAL = { r: [6.5, 8.5], perTurn: [8.5, 10.5], walk: 1.5 } as const;
const SQUARE = { side: [10, 13], grade: 0.5, walk: 1.4 } as const;
const SWITCHBACK = { leg: [16, 22], fall: [4, 5.5], apart: 4.2, walk: 1.5 } as const;
const GRAND = { grade: [0.4, 0.5], walk: [3, 4.5], wide: [5, 6.5], roof: [9, 12] } as const;
const SCREE = { grade: [0.22, 0.3], walk: [2.5, 3.5], wide: [4.5, 6], roof: [6, 9] } as const;
const LEDGE = { grade: [0.16, 0.22], walk: 1.3, wide: [12, 16], roof: [10, 14] } as const;
const LIFT = { well: 2.4, walk: 1.6 } as const;
/** How much rock is kept over the deeps' highest roof everywhere, metres; how far down the deeps lie under the lower door at the least. */
const COVER = 4, UNDER = 12;
/** A dungeon's corridor at its door, half as broad and as high (`CAVE.cell` / 2 and `CAVE.corridor` in `slopeDungeon.ts`). */
const DOOR = { half: 1.55, roof: 3.8 } as const;
/**
 * The side ways: how many, at least how far apart along the way through; each a passage of so many metres out of its wall, as broad and
 * as high, then a room of so many metres, as broad and as high; and how often a second passage and room beyond the first.
 */
const SIDE = { count: [2, 5], apart: 28, passage: [7, 14], room: [9, 13], roomWalk: [2.6, 3.8], roomRoof: [4.5, 6.5], more: 0.4, fork: 0.5, branch: 0.4, round: [0.75, 0.45], roundGap: [34, 70] } as const;
/** How far up a table's (or a desk's, a bench's) top is, for what is laid on it. */
const TOPS: Partial<Record<PropKind, number>> = { table: 0.815, desk: 0.84, workbench: 0.91, alchemyTable: 0.84 };
/** Props laid small: on a table, or as litter on a floor. */
const SMALL: Partial<Record<PropKind, number>> = { pots: 0.45, bucket: 0.6, lantern: 0.7, candlestick: 0.8, books: 0.6, skull: 0.9, rubble: 0.3, firewood: 0.5, mushrooms: 0.6, orePile: 0.5, gemPile: 0.8, amphora: 0.5, shield: 0.8 };
/** Props that stand square to their wall (shelves, racks, hangings), not set down at a slant. */
const WALLED = new Set<PropKind>(['bookcase', 'jarShelf', 'wineRack', 'weaponRack', 'toolRack', 'tapestry', 'banner', 'shield', 'ladder', 'armorStand']);
/**
 * A room's dressing past its recipe: what lines its walls, and how much of them; what is laid on its tables and who sits at them; what
 * litters its floor, how thick (to each square metre); how likely a cobweb in each corner.
 */
interface Dress { line: PropKind[]; lining: number; rows: number; islands: PropKind[]; top: PropKind[]; seat: PropKind; litter: PropKind[]; litterPer: number; webs: number }
const DRESS_ANY: Dress = { line: ['barrel', 'crate', 'sack', 'urn', 'pots'], lining: 0.55, rows: 1, islands: [], top: ['candlestick', 'books', 'pots', 'scroll'], seat: 'stool', litter: ['bones', 'rubble', 'scroll', 'pots'], litterPer: 0.06, webs: 0.5 };
const DRESS_HALL: Partial<Dress> = { line: ['urn', 'brokenColumn', 'standingTorch', 'statue', 'rubble', 'banner'], lining: 0.2, islands: ['brokenColumn', 'rubble', 'statue'], litter: ['rubble', 'bones', 'skull', 'rubble'], litterPer: 0.015, webs: 0.3 };
const DRESS: Record<string, Partial<Dress>> = {
  'the Armoury': { rows: 2, islands: ['armorStand', 'weaponRack', 'crate'], line: ['weaponRack', 'shield', 'spearBundle', 'armorStand', 'crate', 'barrel'], lining: 0.7, litter: ['shield', 'pickaxe', 'rubble'] },
  'the Ossuary': { islands: ['skullPile', 'urn', 'sarcophagus'], line: ['skullPile', 'urn', 'bones', 'skull', 'candlestick'], lining: 0.75, litter: ['bones', 'skull', 'bones'], litterPer: 0.08, webs: 0.8 },
  'the Old Barracks': { rows: 2, islands: ['table', 'bedroll', 'cookingFire'], line: ['bedroll', 'barrel', 'crate', 'weaponRack', 'sack'], lining: 0.7, top: ['lantern', 'pots', 'coins', 'candlestick'], seat: 'bench', litter: ['bones', 'pots', 'coins', 'scroll'] },
  'the Storeroom': { rows: 2, islands: ['crate', 'barrel', 'sack', 'crate'], line: ['crate', 'barrel', 'sack', 'crate', 'amphora', 'jarShelf'], lining: 0.9, litter: ['pots', 'rubble', 'scroll'], litterPer: 0.03 },
  'the Wellhouse': { rows: 2, islands: ['trough', 'barrel', 'bucket', 'crate'], line: ['bucket', 'barrel', 'trough', 'moss', 'pots'], lining: 0.55, litter: ['bucket', 'moss', 'pots'] },
  'the Forge': { rows: 2, islands: ['anvil', 'workbench', 'grindstone'], line: ['firewood', 'orePile', 'toolRack', 'barrel', 'crate', 'shield'], lining: 0.7, top: ['pickaxe', 'lantern', 'shield', 'pots'], litter: ['orePile', 'rubble', 'pickaxe'] },
  'the Counting Room': { islands: ['desk', 'table', 'goldHeap'], line: ['crate', 'bookcase', 'goldHeap', 'candlestick', 'urn'], lining: 0.65, top: ['coins', 'scroll', 'books', 'candlestick', 'gemPile'], litter: ['coins', 'scroll', 'coins'], litterPer: 0.06 },
  "the Hermit's Cell": { islands: ['table', 'cookingFire'], line: ['pots', 'books', 'firewood', 'candlestick', 'mushrooms'], lining: 0.6, top: ['books', 'candlestick', 'skull', 'pots'], litter: ['bones', 'books', 'pots'] },
  'the Sunken Chapel': { islands: ['bench', 'bench', 'brokenColumn'], line: ['candelabrum', 'urn', 'brokenColumn', 'bench', 'candlestick'], lining: 0.55, litter: ['rubble', 'scroll', 'bones'], webs: 0.7 },
  'the Map Room': { islands: ['table', 'lectern'], line: ['bookcase', 'crate', 'candlestick', 'tapestry'], lining: 0.65, top: ['scroll', 'scroll', 'books', 'candlestick', 'lantern'], litter: ['scroll', 'books', 'scroll'], litterPer: 0.05 },
  'the Cold Larder': { rows: 2, islands: ['barrel', 'sack', 'crate'], line: ['sack', 'barrel', 'crate', 'amphora', 'pots', 'jarShelf'], lining: 0.85, litter: ['pots', 'bones', 'rubble'] },
  'the Bone Pit': { islands: ['skullPile', 'ribcage', 'skeleton'], line: ['skullPile', 'bones', 'skeleton', 'ribcage'], lining: 0.65, litter: ['bones', 'skull', 'bones'], litterPer: 0.12, webs: 0.8 },
  'the Smithy': { rows: 2, islands: ['anvil', 'workbench', 'grindstone'], line: ['firewood', 'orePile', 'toolRack', 'barrel', 'shield', 'spearBundle'], lining: 0.7, top: ['pickaxe', 'shield', 'lantern'], litter: ['orePile', 'rubble', 'pickaxe'] },
  'the Library': { rows: 2, islands: ['table', 'lectern', 'desk'], line: ['bookcase', 'bookcase', 'candelabrum', 'books', 'lectern'], lining: 0.9, top: ['books', 'scroll', 'candlestick', 'books', 'skull'], seat: 'stool', litter: ['books', 'scroll', 'books'], litterPer: 0.05 },
  "the Alchemist's Den": { rows: 2, islands: ['alchemyTable', 'table', 'alchemyTable', 'cauldron'], line: ['jarShelf', 'pots', 'amphora', 'bookcase', 'mushrooms', 'jarShelf'], lining: 0.75, top: ['pots', 'skull', 'books', 'candlestick', 'mushrooms'], litter: ['pots', 'mushrooms', 'skull', 'scroll'], litterPer: 0.05 },
  'the Throne Room': { islands: ['statue', 'standingTorch', 'brokenColumn'], line: ['standingTorch', 'statue', 'banner', 'urn', 'armorStand'], lining: 0.5, litter: ['coins', 'bones', 'rubble'], litterPer: 0.02 },
  'the Kitchen': { rows: 2, islands: ['table', 'cauldron', 'cookingFire'], line: ['sack', 'barrel', 'firewood', 'pots', 'jarShelf', 'crate', 'bucket'], lining: 0.8, top: ['pots', 'pots', 'bucket', 'candlestick', 'skull'], seat: 'bench', litter: ['bones', 'pots', 'firewood'], litterPer: 0.05 },
  'the Tomb': { islands: ['tombSlab', 'coffin', 'urn'], line: ['coffin', 'urn', 'candlestick', 'skullPile', 'tombSlab'], lining: 0.65, litter: ['bones', 'skull', 'rubble'], webs: 0.9 },
  'the Spider Nest': { islands: ['eggSacs', 'skeleton', 'hangingCage'], line: ['eggSacs', 'cobweb', 'skeleton', 'bones'], lining: 0.7, litter: ['bones', 'skull', 'eggSacs'], litterPer: 0.07, webs: 1 },
  'the Fungus Garden': { islands: ['mushrooms', 'mushrooms', 'moss'], line: ['mushrooms', 'moss', 'mushrooms', 'rubble'], lining: 0.85, litter: ['mushrooms', 'moss', 'moss'], litterPer: 0.08, webs: 0.2 },
  'the Mine Head': { rows: 2, islands: ['mineCart', 'orePile', 'crate'], line: ['orePile', 'crate', 'barrel', 'firewood', 'toolRack', 'ladder'], lining: 0.75, litter: ['orePile', 'rubble', 'pickaxe', 'rubble'], litterPer: 0.06 },
  'the Treasury': { rows: 2, islands: ['goldHeap', 'gemPile', 'crate'], line: ['goldHeap', 'crate', 'urn', 'gemPile', 'standingTorch', 'shield'], lining: 0.8, litter: ['coins', 'gemPile', 'coins'], litterPer: 0.08 },
  'the Cellar': { rows: 2, islands: ['barrel', 'barrel', 'crate'], line: ['wineRack', 'barrel', 'amphora', 'barrel', 'crate'], lining: 0.9, litter: ['amphora', 'pots', 'rubble'], webs: 0.9 },
  'the Guardroom': { islands: ['table', 'weaponRack'], line: ['weaponRack', 'barrel', 'crate', 'bedroll', 'shield'], lining: 0.65, top: ['lantern', 'coins', 'pots'], litter: ['bones', 'coins', 'pots'] },
  'the Shrine of Steps': { islands: ['runestone', 'urn'], line: ['candelabrum', 'urn', 'candlestick', 'runestone'], lining: 0.5, litter: ['rubble', 'scroll'] },
  'the Cistern': { islands: ['basin', 'barrel'], line: ['bucket', 'barrel', 'moss', 'pots'], lining: 0.5, litter: ['moss', 'bucket', 'rubble'] },
  'the Watch Post': { islands: ['barrel', 'crate'], line: ['barrel', 'crate', 'spearBundle', 'shield', 'sack'], lining: 0.65, top: ['lantern', 'coins'], litter: ['bones', 'rubble'] },
  'the Resting Hall': { rows: 2, islands: ['bedroll', 'table', 'cookingFire'], line: ['bedroll', 'sack', 'barrel', 'firewood', 'pots'], lining: 0.7, top: ['pots', 'lantern', 'candlestick'], seat: 'bench', litter: ['bones', 'pots', 'firewood'] },
};

/** The side rooms' names; what may be in each is by its name (`sideRoom`). */
const SIDE_NAMES = [
  'the Armoury', 'the Ossuary', 'the Old Barracks', 'the Storeroom', 'the Wellhouse', 'the Forge', 'the Counting Room', "the Hermit's Cell", 'the Sunken Chapel', 'the Map Room', 'the Cold Larder', 'the Bone Pit',
  'the Smithy', 'the Library', "the Alchemist's Den", 'the Throne Room', 'the Kitchen', 'the Tomb', 'the Spider Nest', 'the Fungus Garden', 'the Mine Head', 'the Treasury', 'the Cellar',
];

/** Names for each piece, picked by the seed: the deeps' own. */
const NAMES: Record<Exclude<PieceKind, 'way'>, string[]> = {
  spiral: ['the Winding Stair', 'the Well of Steps', 'the Turning Stair'],
  square: ['the Stair Tower', 'the Square Stair', 'the Stair of Landings'],
  switchback: ['the Terraces', 'the Zigzag Stair', 'the Stepped Wall'],
  grand: ['the Great Stair', 'the Long Steps', 'the Broad Stair'],
  scree: ['the Scree', 'the Loose Slope', 'the Stone Slide'],
  ledge: ['the Ledge', 'the Wall Path', 'the Hanging Way'],
  lift: ['the Old Lift', 'the Chain Lift', 'the Hoist'],
  hall: ['the Pillared Hall', 'the Hall of Columns', 'the Echoing Hall', 'the Long Hall'],
  chasm: ['the Long Bridge', 'the Narrow Bridge', 'the Chasm'],
  fissure: ['the Cleft', 'the Narrows', 'the Split Rock'],
  grotto: ['the Still Pool', 'the Dripping Grotto', 'the Black Water'],
  collapse: ['the Fallen Hall', 'the Broken Hall', 'the Rubble Deep'],
  abyss: ['the Crossing', 'the Great Chasm', 'the Hanging Bridges', 'the Deep Crossing'],
  landing: ['the Guardroom', 'the Shrine of Steps', 'the Cistern', 'the Watch Post', 'the Resting Hall'],
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** A number drawn between a range's least and most. */
const span = (rng: Rng, [lo, hi]: readonly [number, number]) => rng.range(lo, hi);
const empty = (): DeepsPlan => ({ pts: [], floor: [], walk: [], wide: [], roof: [], shift: [], drop: [], open: [], pieces: [], posts: [], shafts: [], halls: [], lifts: [], pools: [], torches: [], dens: [], chests: [], lines: [], doors: [] });

/** What lays the line: where it now is and which way it goes, how high its floor is; a metre at a time into its plan. */
class Turtle {
  constructor(public x: number, public z: number, public heading: number, public y: number, readonly P: DeepsPlan = empty()) {}
  get s() { return this.P.pts.length; }
  put(walk: number, wide: number, roof: number, o: { drop?: number; open?: boolean; shift?: number; floor?: number } = {}) {
    const P = this.P;
    P.pts.push([this.x, this.z]); P.floor.push(o.floor ?? this.y); P.walk.push(walk); P.wide.push(wide); P.roof.push(roof);
    P.shift.push(o.shift ?? 0); P.drop.push(o.drop ?? 0); P.open.push(o.open ?? false);
  }
  step(turn: number, long = 1) { this.heading += turn; this.x += Math.cos(this.heading) * long; this.z += Math.sin(this.heading) * long; }
  /** A point `d` metres to the side of the line's `k`th metre (`side` 1, its left; -1, its right). */
  beside(k: number, d: number, side: number): [number, number] {
    const P = this.P, [px, pz] = P.pts[k], [qx, qz] = P.pts[Math.min(k + 1, P.pts.length - 1)], h = k + 1 < P.pts.length && (qx !== px || qz !== pz) ? Math.atan2(qz - pz, qx - px) : this.heading;
    return [px - Math.sin(h) * d * side, pz + Math.cos(h) * d * side];
  }
  piece(kind: PieceKind, name: string, s0: number) { this.P.pieces.push({ kind, name, s0, s1: this.s }); }
}

/** A way down from where the turtle is to `to`, of `kind`: its stretch of line, and what it stands in and is lit by. */
function descend(T: Turtle, kind: Descent, to: number, rng: Rng) {
  const P = T.P, s0 = T.s, fall = T.y - to, from = T.y, name = rng.pick(NAMES[kind]), side = rng.chance(0.5) ? 1 : -1;
  if (kind === 'spiral') {
    const r = span(rng, SPIRAL.r), per = span(rng, SPIRAL.perTurn), turns = Math.max(0.75, fall / per), long = Math.round(turns * 2 * Math.PI * r);
    const cx = T.x - Math.sin(T.heading) * r * side, cz = T.z + Math.cos(T.heading) * r * side;
    for (let i = 0; i < long; i++) { T.put(SPIRAL.walk, SPIRAL.walk + 0.6, 4, { open: true, floor: from - (fall * i) / long }); T.step(side / r); }
    P.shafts.push({ x: cx, z: cz, r: r + SPIRAL.walk + 1.2, y0: to - 1, y1: from + 6, s0, s1: T.s });
    // (A torch on the shaft's wall every quarter turn, beside the stair: the wall away from the shaft's middle.)
    for (let k = s0 + Math.round(r); k < T.s; k += Math.round((Math.PI / 2) * r)) { const [px, pz] = T.beside(k, SPIRAL.walk + 1.1, -side); P.torches.push({ x: px, y: P.floor[k] + 2.2, z: pz, kind: 'wall' }); }
  } else if (kind === 'square') {
    // Round a square well, a flight along each wall and a landing in each corner, turned about on there.
    const S = span(rng, SQUARE.side), run = Math.round(S - 2 * (SQUARE.walk + 0.8) - 2), flights = Math.max(2, Math.ceil(fall / (run * SQUARE.grade))), per = fall / flights;
    const h0 = T.heading, cx = T.x + Math.cos(h0) * (run / 2 + 1) - Math.sin(h0) * side * (run / 2 + 1), cz = T.z + Math.sin(h0) * (run / 2 + 1) + Math.cos(h0) * side * (run / 2 + 1);
    let y = from;
    for (let f = 0; f < flights; f++) {
      for (let i = 0; i < run; i++) { T.put(SQUARE.walk, SQUARE.walk + 0.6, 4, { open: true, floor: y - (per * i) / run }); T.step(0); }
      y -= per;
      // (The landing: flat, turned a quarter round in a couple of metres.)
      for (let i = 0; i < 2; i++) { T.put(SQUARE.walk + 0.4, SQUARE.walk + 1, 4, { open: true, floor: y }); T.step((side * Math.PI) / 4); }
      if (f % 2 === 0) { const [px, pz] = T.beside(T.s - 1, SQUARE.walk + 1, -side); P.torches.push({ x: px, y: y + 2.2, z: pz, kind: 'wall' }); }
    }
    P.shafts.push({ x: cx, z: cz, r: S / 2, y0: to - 1, y1: from + 6, s0, s1: T.s, square: { turn: h0 } });
  } else if (kind === 'switchback') {
    // Ramps down a tall chamber's wall, to and fro, each leg falling as far and a little further out from the wall than the last; at
    // each end a landing turned about on.
    const leg = Math.round(span(rng, SWITCHBACK.leg)), per = span(rng, SWITCHBACK.fall), legs = Math.max(2, Math.ceil(fall / per));
    const ax = T.x, az = T.z, h0 = T.heading, R = SWITCHBACK.apart / 2, turn = Math.round(Math.PI * R), total = legs * leg + (legs - 1) * turn;
    let done = 0;
    for (let l = 0; l < legs; l++) {
      for (let i = 0; i < leg; i++, done++) { T.put(SWITCHBACK.walk, SWITCHBACK.walk + 0.6, 4, { open: true, floor: from - (fall * done) / total }); T.step(0); }
      if (l === legs - 1) break;
      const way = l % 2 ? -side : side;
      for (let i = 0; i < turn; i++, done++) { T.put(SWITCHBACK.walk + 0.6, SWITCHBACK.walk + 1, 4, { open: true, floor: from - (fall * done) / total }); T.step((way * Math.PI) / turn); }
    }
    const reach = ((legs - 1) * SWITCHBACK.apart) / 2, mx = -Math.sin(h0) * side * reach, mz = Math.cos(h0) * side * reach;
    P.halls.push({ axis: [[ax - Math.cos(h0) * 3 + mx, az - Math.sin(h0) * 3 + mz], [ax + Math.cos(h0) * (leg + 3) + mx, az + Math.sin(h0) * (leg + 3) + mz]], wide: reach + 4, y0: to - 1, y1: from + 7, s0, s1: T.s });
    for (let l = 0; l < legs; l += 2) { const k = s0 + l * (leg + turn) + Math.floor(leg / 2), [px, pz] = T.beside(Math.min(k, T.s - 1), SWITCHBACK.walk + 0.9, -side * (l % 2 ? -1 : 1)); P.torches.push({ x: px, y: P.floor[Math.min(k, T.s - 1)] + 2.2, z: pz, kind: 'wall' }); }
  } else if (kind === 'lift') {
    // A short way onto the platform; its place at the well's top, and the same place at its foot, one metre of the line to the next;
    // and out from there the way it came in.
    for (let i = 0; i < 4; i++) { T.put(LIFT.walk, 2.4, 3.8, { floor: from }); T.step(0); }
    const top = T.s;
    T.put(LIFT.well - 0.4, LIFT.well, 4.2, { open: true, floor: from });
    T.put(LIFT.well - 0.4, LIFT.well, 4.2, { open: true, floor: to });
    P.lifts.push({ x: T.x, z: T.z, y0: to, y1: from, top, foot: top + 1, turn: T.heading });
    P.shafts.push({ x: T.x, z: T.z, r: LIFT.well + 0.6, y0: to - 1, y1: from + 5, s0, s1: top + 2, square: { turn: T.heading } });
    for (const y of [from, to]) { const [px, pz] = T.beside(top, LIFT.well + 0.3, side); P.torches.push({ x: px, y: y + 2.2, z: pz, kind: 'wall' }); }
    T.step(0, 1);
    for (let i = 0; i < 4; i++) { T.put(LIFT.walk, 2.4, 3.8, { floor: to }); T.step(0); }
  } else {
    const m = kind === 'grand' ? GRAND : kind === 'scree' ? SCREE : LEDGE, grade = span(rng, m.grade), long = Math.max(12, Math.round(fall / grade));
    const walk = kind === 'ledge' ? LEDGE.walk : span(rng, (m as typeof GRAND).walk), wide = span(rng, m.wide), roof = span(rng, m.roof);
    const bend = kind === 'scree' ? rng.range(0.02, 0.05) : kind === 'ledge' ? rng.range(-0.012, 0.012) : 0, ph = rng.range(0, 6);
    for (let i = 0; i < long; i++) {
      const e = Math.min(1, i / 4, (long - 1 - i) / 4), y = from - (fall * i) / long;
      // (A ledge: the path along the cavern's wall, the cavern's middle out to the open side, its floor as deep as the way's foot and more.)
      if (kind === 'ledge') T.put(walk, lerp(2.4, wide, e), lerp(3.8, roof, e), { floor: y, shift: side * lerp(0, wide - walk - 1, e), drop: Math.max(0, y - (to - 3)) * e });
      else T.put(lerp(1.6, walk, e), lerp(2.4, wide, e), lerp(3.8, roof, e), { floor: y });
      T.step(kind === 'scree' ? Math.sin(i * 0.13 + ph) * bend : bend);
    }
    if (kind === 'grand') for (let k = s0 + 4; k < T.s - 2; k += 8) for (const sd of [-1, 1]) { const [px, pz] = T.beside(k, wide - 0.3, sd); P.torches.push({ x: px, y: P.floor[k] + 2.6, z: pz, kind: 'wall' }); }
    if (kind === 'scree') {
      const R = rng.fork('scree');
      for (let i = 0; i < Math.round(long / 3); i++) { const k = s0 + R.int(3, long - 3), sd = R.chance(0.5) ? 1 : -1, [px, pz] = T.beside(k, R.range(walk + 0.6, wide - 0.6), sd); P.posts.push({ x: px, z: pz, r: R.range(0.6, 1.6), y0: P.floor[k] - 0.3, y1: P.floor[k] + R.range(0.8, 2.2), kind: 'boulder' }); }
      for (let k = s0 + 8; k < T.s - 4; k += 18) { const [px, pz] = T.beside(k, wide - 0.2, k % 2 ? 1 : -1); P.torches.push({ x: px, y: P.floor[k] + 2.3, z: pz, kind: 'wall' }); }
    }
    if (kind === 'ledge') for (let k = s0 + 6; k < T.s - 4; k += 12) { const [px, pz] = T.beside(k, walk + 0.6, -side); P.torches.push({ x: px, y: P.floor[k] + 2.2, z: pz, kind: 'wall' }); }
  }
  T.y = to;
  T.piece(kind, name, s0);
}

/**
 * A long way down broken by rooms along it (asked: "long stairwell needs an interesting space or two maybe along it, side room or so"):
 * a fall of more than some twenty-seven metres laid in parts (each some eighteen), as like as the seed has them, a room off the way between each two (a
 * guardroom, a shrine, a cistern, a watch post), each with what the seed puts in it. A lift goes the whole way at once.
 */
function descendLong(T: Turtle, kind: Descent, to: number, rng: Rng, ground: (x: number, z: number) => number) {
  const parts = kind === 'lift' ? 1 : Math.max(1, Math.round((T.y - to) / 18));
  // (A way down that goes on straight, a great stair, scree, a ledge, set off, and turned a quarter at each landing, to the side where the
  // land stands high enough over all of the next of it; where none does, the rest of the way down one that keeps to one place, a stair
  // round a shaft, back and forth, a lift. Laid on and on the way it began, a hundred metres deep it had come out from under the
  // mountain, under a valley, and the deeps been laid deeper for it, and so longer, and further out.)
  const straight = (k: Descent) => k === 'grand' || k === 'scree' || k === 'ledge';
  const shape = (k: Descent) => (k === 'grand' ? { grade: 0.45, roof: 12 } : k === 'scree' ? { grade: 0.26, roof: 9 } : { grade: 0.19, roof: 14 });
  /** How far short of its cover the next part would come, set off turned by `turn`: the most, over all of it (none, or less than none, enough). */
  const short = (turn: number, fall: number) => {
    const { grade, roof } = shape(kind), far = fall / grade, h = T.heading + turn;
    let most = -Infinity;
    for (let d = 5; d <= far + 5; d += 5) most = Math.max(most, T.y - grade * Math.min(d, far) + roof + COVER - ground(T.x + Math.cos(h) * d, T.z + Math.sin(h) * d));
    return most;
  };
  const choose = (fall: number, turns: number[]) => {
    const by = turns.map((t) => ({ t, short: short(t, fall) })).sort((p, q) => p.short - q.short);
    // (Two sides as good as each other, either, as the seed has it.)
    const even = by.filter((b) => b.short < by[0].short + 2);
    return { turn: rng.pick(even).t, short: by[0].short };
  };
  for (let i = 0; i < parts; i++) {
    const fall = (T.y - to) / (parts - i);
    if (straight(kind)) {
      const q = 0.5 * Math.PI, c = choose(fall, i === 0 ? [0, -q, q] : [-q, q]);
      if (c.short > 0) kind = rng.pick(['spiral', 'square', 'switchback', 'lift'] as const);
      else if (c.turn && i === 0) {
        // (Set off another way than the door looks: a bend in the passage to it.)
        for (let j = 0; j < 8; j++) { T.put(1.6, 2.4, 3.8); T.step(c.turn / 8); }
      }
      if (i > 0) landing(T, rng.fork(`landing ${i - 1}`), straight(kind) ? c.turn : 0);
    } else if (i > 0) landing(T, rng.fork(`landing ${i - 1}`), 0);
    // (A lift goes all the way down at once.)
    if (kind === 'lift') { descend(T, kind, to, rng.fork(`part ${i}`)); break; }
    descend(T, kind, T.y - fall, rng.fork(`part ${i}`));
  }
}
/** A room on a way down, where it rests between two of its parts: on the way it goes, or turned through it by `turn`, a brazier in it, and as the seed has it, foes, a chest, a pool. */
function landing(T: Turtle, rng: Rng, turn = 0) {
  const P = T.P, name = rng.pick(NAMES.landing), long = Math.round(rng.range(10, 14)), walk = rng.range(3.5, 5), wide = walk + rng.range(1.5, 2.5), roof = rng.range(6, 9), s0 = T.s, y = T.y;
  for (let i = 0; i < long; i++) { const e = Math.min(1, i / 3, (long - 1 - i) / 3); T.put(lerp(1.6, walk, e), lerp(2.4, wide, e), lerp(3.8, roof, e)); T.step(i >= 2 && i < long - 2 ? turn / (long - 4) : 0); }
  T.piece('landing', name, s0);
  const mid = Math.floor((s0 + T.s) / 2), [bx, bz] = T.beside(mid, 0, 1);
  P.torches.push({ x: bx, y: y + 1.1, z: bz, kind: 'brazier' });
  for (const k of [s0 + 1, T.s - 2]) { const [px, pz] = T.beside(k, Math.min(P.wide[k], 2.4) - 0.2, k === s0 + 1 ? 1 : -1); P.torches.push({ x: px, y: y + 2.3, z: pz, kind: 'wall' }); }
  const side = rng.chance(0.5) ? 1 : -1;
  if (name === 'the Cistern') { const [px, pz] = T.beside(mid, walk + 0.8, side); P.pools.push({ x: px, z: pz, rx: rng.range(2.5, 3.5), rz: rng.range(1.5, 2.2), turn: T.heading, y: y - 0.4 }); }
  if (name === 'the Shrine of Steps') for (const sd of [-1, 1]) { const [px, pz] = T.beside(mid + 2, walk - 1, sd); P.posts.push({ x: px, z: pz, r: 0.7, y0: y - 0.3, y1: y + roof + 0.5, kind: 'pillar' }); }
  if (rng.chance(name === 'the Guardroom' ? 0.75 : 0.35)) P.dens.push({ x: bx, z: bz, s: mid, size: 1 + (rng.chance(0.4) ? 1 : 0) });
  if (rng.chance(name === 'the Guardroom' ? 0.6 : 0.3)) { const k = s0 + Math.round(long * 0.7), [px, pz] = T.beside(k, walk - 1, -side); P.chests.push({ x: px, z: pz, s: k, face: T.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) }); }
}

/**
 * The deeps from door `a` to door `b`, from `seed`; `ground(x, z)`, the land's height over a point (the deeps keep under it by
 * `COVER`). Laid again deeper where the roof would come too near the land, and again from the seed's next fork where the line runs
 * into itself at the same depth: up to two dozen times, the one that comes nearest kept if none is clear.
 */
export function planDeeps(all: DeepsDoor[], ground: (x: number, z: number) => number, seed: string): DeepsPlan {
  const [a, b] = all, rng = new Rng(`deeps ${seed}`);
  let under = UNDER + rng.fork('depth').range(0, 8), best: DeepsPlan | null = null, fewest = Infinity;
  for (let tries = 0; tries < 24; tries++) {
    const plan = lay(a, b, rng.fork(`lay ${tries}`), Math.min(a.y, b.y) - under, ground);
    // (Only below the doors' own depth: about the doors, the deeps are as deep as the dungeons are, and the rock over them theirs; asked
    // of them too, the deeps were laid deeper and deeper for what no depth of theirs could mend, one lift five hundred metres long.)
    // (Nor a shaft's top or a lift's head where it is at the doors, for laying the rest deeper cannot lower it: asked so, the deeps had
    // gone down a few metres more on every try for a lift's head that stayed where it was, and been laid four hundred metres down.)
    let worst = 0;
    const doors = Math.min(a.y, b.y) - 3;
    plan.pts.forEach(([x, z], k) => { const top = plan.floor[k] + plan.roof[k]; if (plan.floor[k] < doors && top < doors) worst = Math.max(worst, top + COVER - ground(x, z)); });
    // (A great chasm's roof too, all round it.)
    for (const sh of plan.shafts) if (sh.abyss) for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI * 2, r = i === 8 ? 0 : sh.r; worst = Math.max(worst, sh.y1 + COVER - ground(sh.x + Math.cos(a) * r, sh.z + Math.sin(a) * r)); }
    if (worst > 0 && under < UNDER + 90) { under = Math.min(UNDER + 90, under + worst + 2); continue; }
    const crossed = clashes(plan);
    if (crossed < fewest) { fewest = crossed; best = plan; }
    if (!crossed) break;
  }
  const plan = best ?? lay(a, b, rng.fork('lay last'), Math.min(a.y, b.y) - under, ground);
  plan.lines = [{ s0: 0, s1: plan.pts.length, from: -1 }];
  plan.seed = seed;
  plan.doors = [{ s: 0, out: -1 }, { s: plan.pts.length - 1, out: 1 }];
  // (Each door past the first two: a way of its own down from it, joined into the way through where it comes nearest.)
  all.slice(2).forEach((d, i) => addDoorWay(plan, d, rng.fork(`door ${i + 2}`), ground));
  addCrossings(plan, rng.fork('crossings'), ground);
  addSides(plan, rng.fork('sides'), ground);
  return plan;
}

/**
 * Over or under the way across each great chasm, another way across it, square to it (asked: "narrow bridges over a chasm crossing each
 * other"): out of the way through's wall some way before the chasm or after it, round and up or down to the chasm's side, straight across
 * its middle on a bridge of its own, and on to a room beyond, a dead end; as the seed has it, and only where it keeps clear.
 */
function addCrossings(P: DeepsPlan, rng: Rng, ground: (x: number, z: number) => number) {
  const kindAt = new Array<PieceKind>(P.pts.length).fill('way');
  for (const q of P.pieces) for (let k = q.s0; k < q.s1; k++) kindAt[k] = q.kind;
  const lifted = new Set(P.lifts.flatMap((l) => [l.top, l.foot])), named = new Set(P.pieces.map((q) => q.name));
  for (const sh of P.shafts.filter((q) => q.abyss && !q.twice)) {
    const R0 = rng.fork(`abyss ${sh.s0}`);
    if (!R0.chance(ABYSS.chance)) continue;
    const [ax, az] = P.pts[sh.s0], [bx, bz] = P.pts[sh.s1 - 1], h = Math.atan2(bz - az, bx - ax), yWay = P.floor[sh.s0];
    const near: number[] = [];
    for (let d = 14; d < 70; d++) for (const k of [sh.s0 - d, sh.s1 - 1 + d]) if (k > 0 && k < P.lines[0].s1 && levelAt(P, k, kindAt, lifted) && !P.lines.some((l) => l.from >= 0 && Math.abs(l.from - k) < SIDE.apart)) near.push(k);
    for (let t = 0; t < 12 && t < near.length; t++) {
      const R = R0.fork(`try ${t}`), j = near[t * 2 % Math.max(1, near.length)], side = R.chance(0.5) ? 1 : -1, dy = (R.chance(0.5) ? 1 : -1) * span(R, ABYSS.cross), yb = yWay + dy;
      if (yb - 3 < sh.y0 || yb + 4 > sh.y1) continue;
      // (Its side of the chasm, and the point a few metres out from it the way comes to, to go in square.)
      const nx = -Math.sin(h) * side, nz = Math.cos(h) * side, A: [number, number] = [sh.x + nx * (sh.r + 6), sh.z + nz * (sh.r + 6)];
      const [px, pz] = P.pts[j - 1], [qx, qz] = P.pts[j + 1], jh = Math.atan2(qz - pz, qx - px), out = Math.sign(Math.cos(jh) * (A[1] - P.pts[j][1]) - Math.sin(jh) * (A[0] - P.pts[j][0])) || 1;
      const T = new Turtle(P.pts[j][0], P.pts[j][1], jh + (out * Math.PI) / 2, P.floor[j]), m = sidePassage(R, P, j), leave = Math.ceil(P.wide[j]) + 3;
      for (let i = 0; i < leave; i++) { T.put(m.walk, m.wide, m.roof); T.step(0); }
      const x0 = T.x, z0 = T.z, h0 = T.heading, y0 = T.y, dist = Math.hypot(A[0] - x0, A[1] - z0), n = Math.max(10, Math.round(dist * 1.3)), k0 = dist * 1.2, inH = Math.atan2(-nz, -nx);
      if (Math.abs(yb - y0) / n > 0.22) continue;
      for (let i = 0; i < n; i++) {
        const u = i / n, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
        T.x = h00 * x0 + h10 * k0 * Math.cos(h0) + h01 * A[0] + h11 * k0 * Math.cos(inH);
        T.z = h00 * z0 + h10 * k0 * Math.sin(h0) + h01 * A[1] + h11 * k0 * Math.sin(inH);
        T.y = lerp(y0, yb, Math.min(1, u * 1.15));
        T.put(m.walk, m.wide, m.roof);
      }
      T.piece('way', '', 0);
      lightPassage(T, 0, T.s);
      // Straight across its middle, the bridge where it is over the drop, and on into the rock past its far wall.
      T.x = A[0]; T.z = A[1]; T.y = yb; T.heading = inH;
      const s0 = T.s, across = Math.round(2 * (sh.r + 6) + 4), bw = span(R, PIECES.abyss.walk), bwide = span(R, PIECES.abyss.wide);
      for (let i = 0; i < across; i++) {
        const inside = Math.hypot(T.x - sh.x, T.z - sh.z) < sh.r - 0.8;
        T.put(inside ? bw : m.walk, inside ? bwide : m.wide, inside ? 3.2 : m.roof, { open: inside, drop: inside ? yb - sh.y0 : 0 });
        T.step(0);
      }
      T.piece('abyss', dy > 0 ? 'the High Bridge' : 'the Low Bridge', s0);
      sideRoom(T, R.fork('room'), named, m);
      const Q = T.P;
      if (!clearOf(P, Q, j, ground, undefined, Infinity, sh.s0)) continue;
      joinSide(P, Q, j);
      for (const q of Q.pieces) if (q.name) named.add(q.name);
      break;
    }
  }
}

/** Where a side way may leave the way through: a level, walled passage or chamber, no stair, bridge, ledge, cleft, lift or shaft about it. */
function levelAt(P: DeepsPlan, k: number, kindAt: PieceKind[], lifted: Set<number>): boolean {
  const l = P.lines.find((q) => k >= q.s0 && k < q.s1) ?? { s0: 0, s1: P.pts.length };
  if (k < l.s0 + 16 || k > l.s1 - 17 || P.open[k] || P.drop[k] >= 0.5 || !['way', 'landing', 'grotto', 'hall', 'collapse'].includes(kindAt[k])) return false;
  for (let d = -3; d <= 3; d++) if (lifted.has(k + d) || P.open[k + d] || Math.abs(P.floor[k + d] - P.floor[k]) > 0.25) return false;
  return intoSpace(P, P.pts[k][0], P.pts[k][1], 3) <= 0;
}

/**
 * The way to another dungeon's door (`d`): laid down from the door as the way up to the second door is, and from a level metre of the
 * way through near where it comes down, out of that one's wall and round to its foot; tried a few times, a different metre or way down
 * each; none, if none keeps clear. Its door the last of its metres.
 */
function addDoorWay(P: DeepsPlan, d: DeepsDoor, rng: Rng, ground: (x: number, z: number) => number): boolean {
  const kindAt = new Array<PieceKind>(P.pts.length).fill('way');
  for (const q of P.pieces) for (let k = q.s0; k < q.s1; k++) kindAt[k] = q.kind;
  const lifted = new Set(P.lifts.flatMap((l) => [l.top, l.foot]));
  const near: number[] = [];
  // (Off the way through, or off the way to another door; not where another way already leaves: they would leave through one another.)
  for (const line of P.lines) for (let k = line.s0; k < line.s1; k++) if (levelAt(P, k, kindAt, lifted) && !P.lines.some((l) => l.from >= 0 && Math.abs(l.from - k) < SIDE.apart)) near.push(k);
  near.sort((p, q) => Math.hypot(P.pts[p][0] - d.x, P.pts[p][1] - d.z) - Math.hypot(P.pts[q][0] - d.x, P.pts[q][1] - d.z));
  const descents: Descent[] = ['spiral', 'square', 'switchback', 'grand', 'scree', 'ledge', 'lift'];
  // (The metres nearest the door first, every other one, a way down of the seed's choosing from each.)
  for (let t = 0; t < 16 && 2 * t < near.length; t++) {
    const R = rng.fork(`try ${t}`), j = near[2 * t];
    // Its way down from the door, to about the depth of the way through where it joins.
    const inH = Math.atan2(-d.dz, -d.dx), U = new Turtle(d.x - 6 * Math.cos(inH), d.z - 6 * Math.sin(inH), inH + Math.PI, d.y);
    descendLong(U, R.pick(descents), P.floor[j], R.fork('down'), ground);
    const footX = U.x, footZ = U.z, footH = U.heading + Math.PI;
    // Out of the way through's wall on the side the foot is, and round to the foot.
    const [ax, az] = P.pts[j - 1], [bx, bz] = P.pts[j + 1], mh = Math.atan2(bz - az, bx - ax), side = Math.sign((bx - ax) * (footZ - P.pts[j][1]) - (bz - az) * (footX - P.pts[j][0])) || 1;
    const T = new Turtle(P.pts[j][0], P.pts[j][1], mh + (side * Math.PI) / 2, P.floor[j]), m = sidePassage(R, P, j), leave = Math.ceil(P.wide[j]) + 3;
    for (let i = 0; i < leave; i++) { T.put(m.walk, m.wide, m.roof); T.step(0); }
    const x0 = T.x, z0 = T.z, h0 = T.heading, y0 = T.y, yF = U.y, dist = Math.hypot(footX - x0, footZ - z0), n = Math.max(8, Math.round(dist * 1.3)), k0 = dist * 1.2;
    for (let i = 0; i < n; i++) {
      const u = i / n, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
      T.x = h00 * x0 + h10 * k0 * Math.cos(h0) + h01 * footX + h11 * k0 * Math.cos(footH);
      T.z = h00 * z0 + h10 * k0 * Math.sin(h0) + h01 * footZ + h11 * k0 * Math.sin(footH);
      T.y = lerp(y0, yF, u);
      T.put(m.walk, m.wide, m.roof);
    }
    T.piece('way', '', 0);
    lightPassage(T, 0, T.s);
    appendTurned(T.P, U.P);
    doorPassage(T, d);
    const Q = T.P;
    if (!clearOf(P, Q, j, ground, undefined, d.y - 3)) continue;
    joinSide(P, Q, j);
    P.doors.push({ s: P.pts.length - 1, out: 1 });
    return true;
  }
  return false;
}

/**
 * A way laid from a door down (`Q`) joined on to the end of `P` turned about: its metres from its foot to the door, its sides changed
 * over (its left is now its right), and all in it with them; its stretches named as going up.
 */
function appendTurned(P: DeepsPlan, Q: DeepsPlan) {
  const sUp = P.pts.length, N = Q.pts.length, back = (s: number) => sUp + (N - 1 - s);
  for (let i = N - 1; i >= 0; i--) {
    P.pts.push(Q.pts[i]); P.floor.push(Q.floor[i]); P.walk.push(Q.walk[i]); P.wide.push(Q.wide[i]); P.roof.push(Q.roof[i]);
    P.shift.push(-Q.shift[i]); P.drop.push(Q.drop[i]); P.open.push(Q.open[i]);
  }
  for (const q of Q.pieces) P.pieces.push({ ...q, up: true, s0: back(q.s1 - 1), s1: back(q.s0) + 1 });
  for (const sh of Q.shafts) P.shafts.push({ ...sh, s0: back(sh.s1 - 1), s1: back(sh.s0) + 1 });
  for (const h of Q.halls) P.halls.push({ ...h, s0: back(h.s1 - 1), s1: back(h.s0) + 1 });
  for (const l of Q.lifts) P.lifts.push({ ...l, top: back(l.top), foot: back(l.foot), turn: l.turn + Math.PI });
  P.posts.push(...Q.posts); P.torches.push(...Q.torches); P.pools.push(...Q.pools);
  P.dens.push(...Q.dens.map((d) => ({ ...d, s: back(d.s) }))); P.chests.push(...Q.chests.map((c) => ({ ...c, s: back(c.s) })));
}

/** Torches along a long passage (`s0` to `s1` of the turtle's plan), every sixteen metres, on either wall in turn: no way left dark for long. */
function lightPassage(T: Turtle, s0: number, s1: number) {
  const P = T.P;
  for (let k = s0 + 8, n = 0; k < s1 - 4; k += 16, n++) { const [px, pz] = T.beside(k, Math.min(P.wide[k], 2.6) - 0.2, n % 2 ? 1 : -1); P.torches.push({ x: px, y: P.floor[k] + 2.3, z: pz, kind: 'wall' }); }
}

/** The last six metres to a door, from the passage's measures to the dungeon corridor's, as the first eight out of the first door are. */
function doorPassage(T: Turtle, d: DeepsDoor) {
  const inH = Math.atan2(-d.dz, -d.dx), s0 = T.s;
  for (let i = 0; i <= 6; i++) { const e = i / 6; T.x = lerp(d.x - 6 * Math.cos(inH), d.x, e); T.z = lerp(d.z - 6 * Math.sin(inH), d.z, e); T.y = d.y; T.put(lerp(1.6, 1.2, e), lerp(2.4, DOOR.half, e), lerp(3.8, DOOR.roof, e)); }
  T.piece('way', '', s0);
}

/**
 * Side ways off the way through, as many as fit: each out of the wall of a level passage or chamber, a passage and a room at its end,
 * sometimes a second beyond; kept under the land, out of the shafts and the tall chambers, and clear of every other way, as the way
 * through keeps clear of itself.
 */
function addSides(P: DeepsPlan, rng: Rng, ground: (x: number, z: number) => number) {
  if (!P.lines.length) P.lines = [{ s0: 0, s1: P.pts.length, from: -1 }];
  const N = P.lines[0].s1, kindAt = new Array<PieceKind>(P.pts.length).fill('way');
  for (const q of P.pieces) for (let k = q.s0; k < q.s1; k++) kindAt[k] = q.kind;
  const lifted = new Set(P.lifts.flatMap((l) => [l.top, l.foot]));
  // (Out of a wall where the way is level and walled: a passage, a resting room, a grotto, a hall, a fallen hall; not a stair, a bridge,
  // a ledge, a narrow cleft, nor within a shaft; and not where a way to another door leaves.)
  const fit = (k: number) => levelAt(P, k, kindAt, lifted) && !P.lines.some((l) => l.from >= 0 && Math.abs(l.from - k) < SIDE.apart);
  // (The names the crossings' rooms already have, kept to them: no two rooms of the deeps called the same.)
  const from: number[] = [], named = new Set(P.pieces.map((q) => q.name).filter((n) => n)), taken = (k: number) => from.some((f) => Math.abs(f - k) < SIDE.apart);
  const join = (Q: DeepsPlan, k: number, to?: number) => {
    joinSide(P, Q, k, to);
    from.push(k);
    if (to !== undefined) from.push(to);
    for (const q of Q.pieces) if (q.name) named.add(q.name);
  };
  // Ways round, first, as they need the most room: out of one wall of the way through and back into it further on, the same side, a
  // room on the way; either way leads on, the one longer.
  for (const chance of SIDE.round) {
    if (!rng.chance(chance)) continue;
    for (let tries = 0; tries < 40; tries++) {
      const k = rng.int(16, N - 17), to = k + rng.int(SIDE.roundGap[0], SIDE.roundGap[1]);
      if (to > N - 17 || !fit(k) || !fit(to) || taken(k) || taken(to)) continue;
      const Q = wayRound(P, k, to, rng.chance(0.5) ? 1 : -1, rng.fork(`round ${k}`), named);
      if (!Q || !clearOf(P, Q, k, ground, to)) continue;
      join(Q, k, to);
      break;
    }
  }
  // Then ways to a dead end: some out of the wall square, some at a slant as a fork in the way, so that which is the way on is not seen
  // at a glance; and some of those parting again, to a room of their own.
  const want = rng.int(SIDE.count[0], SIDE.count[1] + (N > 400 ? 1 : 0));
  for (let tries = 0, made = 0; tries < 80 && made < want; tries++) {
    const k = rng.int(16, N - 17);
    if (!fit(k) || taken(k)) continue;
    const Q = sideWay(P, k, rng.chance(0.5) ? 1 : -1, rng.fork(`side ${k}`), named);
    if (!clearOf(P, Q, k, ground)) continue;
    const line = P.lines.length;
    join(Q, k);
    made++;
    if (!rng.chance(SIDE.branch)) continue;
    // (Off its passage, before its room, a way of its own.)
    const L = P.lines[line], room = P.pieces.find((q) => q.s0 >= L.s0 && q.s1 <= L.s1 && q.kind === 'landing');
    const lo = L.s0 + Math.ceil(P.wide[k]) + 4, hi = (room?.s0 ?? L.s1) - 3;
    for (let t = 0; t < 8 && hi > lo; t++) {
      const j = rng.int(lo, hi);
      if (Math.abs(P.floor[j + 1] - P.floor[j - 1]) > 0.3) continue;
      const Q2 = sideWay(P, j, rng.chance(0.5) ? 1 : -1, rng.fork(`branch ${j}`), named);
      if (!clearOf(P, Q2, j, ground)) continue;
      join(Q2, j);
      break;
    }
  }
  clearOfPosts(P);
}

/** A side way's passage measures: as the way through's own passages are, so that a doorway does not say which is which; lower than the way it leaves. */
const sidePassage = (rng: Rng, P: DeepsPlan, k: number) => ({ walk: span(rng, PIECES.way.walk), wide: span(rng, PIECES.way.wide), roof: Math.min(span(rng, PIECES.way.roof), P.roof[k] - 0.4) });

/**
 * A side way laid out of the `k`th metre (of the way through, or of another side way) to its `side` (1, its left): its passage from the
 * middle of that one, out square or at a slant ahead as a fork, and its rooms.
 */
function sideWay(P: DeepsPlan, k: number, side: number, rng: Rng, named: Set<string>): DeepsPlan {
  const [ax, az] = P.pts[k - 1], [bx, bz] = P.pts[k + 1], fork = rng.chance(SIDE.fork);
  const h = Math.atan2(bz - az, bx - ax) + side * (fork ? rng.range(0.55, 0.9) : Math.PI / 2 + rng.range(-0.3, 0.3));
  const T = new Turtle(P.pts[k][0], P.pts[k][1], h, P.floor[k]), m = sidePassage(rng, P, k);
  const passage = (long: number, turn: number, slope: number, leave: number) => {
    const s0 = T.s;
    for (let i = 0; i < long; i++) {
      T.put(m.walk, m.wide, m.roof);
      T.step(i > leave ? turn : 0);
      // (Level out of the wall, then down or up a little, as the seed has it.)
      if (i > leave + 1) T.y += slope;
    }
    T.piece('way', '', s0);
  };
  // (Through the breadth of the way it leaves, further at a slant, and on.)
  const leave = Math.ceil(P.wide[k] / (fork ? 0.6 : 1)) + 1;
  passage(leave + Math.round(span(rng, SIDE.passage)), rng.range(-0.05, 0.05), rng.chance(0.5) ? rng.range(-0.12, 0.08) : 0, leave);
  sideRoom(T, rng.fork('room'), named, m);
  if (rng.chance(SIDE.more)) {
    passage(Math.round(rng.range(5, 9)), (rng.chance(0.5) ? 1 : -1) * rng.range(0.09, 0.16), rng.chance(0.4) ? rng.range(-0.1, 0.1) : 0, 0);
    sideRoom(T, rng.fork('room beyond'), named, m);
  }
  return T.P;
}

/**
 * A way round, out of the way through's `k`th metre to its `side` and back into its `to`th, the same side: out square, round in a curve
 * clear of the way through, a room on the way, and in square again; level where it leaves and comes back, between them rising or falling
 * as the way through does between those metres. None, if it would be steeper than a ramp.
 */
function wayRound(P: DeepsPlan, k: number, to: number, side: number, rng: Rng, named: Set<string>): DeepsPlan | null {
  const normal = (j: number): [number, number] => { const [ax, az] = P.pts[j - 1], [bx, bz] = P.pts[j + 1], l = Math.hypot(bx - ax, bz - az) || 1; return [-(bz - az) / l * side, (bx - ax) / l * side]; };
  const [n0x, n0z] = normal(k), [n1x, n1z] = normal(to), out0 = P.wide[k] + 7, out1 = P.wide[to] + 7;
  const A: [number, number] = [P.pts[k][0] + n0x * out0, P.pts[k][1] + n0z * out0], B: [number, number] = [P.pts[to][0] + n1x * out1, P.pts[to][1] + n1z * out1];
  // (The curve between: leaving A outward and coming to B inward, as a Hermite curve does, its tangents as long as the way between.)
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) * 1.3, pts: [number, number][] = [];
  for (let i = 0; i <= out0; i++) pts.push([P.pts[k][0] + n0x * i, P.pts[k][1] + n0z * i]);
  let last = A, run = 0;
  for (let i = 1; i <= 400; i++) {
    const t = i / 400, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    const p: [number, number] = [h00 * A[0] + h10 * L * n0x + h01 * B[0] - h11 * L * n1x, h00 * A[1] + h10 * L * n0z + h01 * B[1] - h11 * L * n1z];
    run += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p;
    if (run >= 1) { pts.push(p); run -= 1; }
  }
  for (let i = Math.floor(out1); i >= 0; i--) pts.push([P.pts[to][0] + n1x * i, P.pts[to][1] + n1z * i]);
  const n = pts.length, y0 = P.floor[k], y1 = P.floor[to], level = Math.ceil(out0) + 2, levelEnd = Math.ceil(out1) + 2;
  if (Math.abs(y1 - y0) / Math.max(1, n - level - levelEnd) > 0.2) return null;
  const T = new Turtle(pts[0][0], pts[0][1], 0, y0), m = sidePassage(rng, P, k), mid = Math.floor(n / 2), half = Math.round(rng.range(5, 7));
  const free = SIDE_NAMES.filter((q) => !named.has(q)), name = rng.pick(free.length ? free : SIDE_NAMES), roomWalk = span(rng, SIDE.roomWalk), roomRoof = span(rng, SIDE.roomRoof);
  for (let i = 0; i < n; i++) {
    const e = Math.max(0, 1 - Math.max(0, Math.abs(i - mid) - half + 2.5) / 2.5), y = i < level ? y0 : i >= n - levelEnd ? y1 : lerp(y0, y1, (i - level) / Math.max(1, n - level - levelEnd));
    T.x = pts[i][0]; T.z = pts[i][1]; T.y = y;
    if (i + 1 < n) T.heading = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    T.put(lerp(m.walk, roomWalk, e), lerp(m.wide, roomWalk + 1.6, e), lerp(m.roof, roomRoof, e));
  }
  T.piece('way', '', 0);
  // (The room on the way round: named, a brazier and torches, and what its name has in it; the way to it and from it lit.)
  const Q = T.P, r0 = mid - half, r1 = mid + half;
  lightPassage(T, 0, r0); lightPassage(T, r1, n);
  Q.pieces = [{ kind: 'way', name: '', s0: 0, s1: r0 }, { kind: 'landing', name, s0: r0, s1: r1 }, { kind: 'way', name: '', s0: r1, s1: n }];
  const [bx, bz] = T.beside(mid, 0, 1);
  Q.torches.push({ x: bx, y: Q.floor[mid] + 1.1, z: bz, kind: 'brazier' });
  for (const [at, sd] of [[r0 + 1, 1], [r1 - 2, -1]] as const) { const [px, pz] = T.beside(at, Math.min(Q.wide[at], 2.4) - 0.2, sd); Q.torches.push({ x: px, y: Q.floor[at] + 2.3, z: pz, kind: 'wall' }); }
  if (rng.chance(/Barracks|Ossuary|Bone/.test(name) ? 0.85 : 0.45)) Q.dens.push({ x: bx, z: bz, s: mid, size: 2 });
  if (rng.chance(0.35)) { const c = mid + 2, [px, pz] = T.beside(c, Math.max(0.6, Q.walk[c] - 0.9), 1); Q.chests.push({ x: px, z: pz, s: c, face: T.heading - Math.PI / 2 }); }
  return Q;
}

/**
 * A room at a side way's end, or on along it: broadening out of the passage, a brazier in its middle and torches by its door; and, as
 * its name has it, a chest more often in a storeroom, foes waiting more often in barracks and bone pits, pillars in a chapel, a pool
 * in a wellhouse. A chest is more often found off the way than on it: what is worth the going.
 */
function sideRoom(T: Turtle, rng: Rng, named: Set<string>, m: { walk: number; wide: number; roof: number }) {
  // (No two rooms of the deeps called the same; the first of them its own.)
  const free = SIDE_NAMES.filter((n) => !named.has(n) && !T.P.pieces.some((q) => q.name === n));
  const P = T.P, name = rng.pick(free.length ? free : SIDE_NAMES), long = Math.round(span(rng, SIDE.room)), walk = span(rng, SIDE.roomWalk), wide = walk + rng.range(1.2, 2), roof = span(rng, SIDE.roomRoof), s0 = T.s, y = T.y;
  for (let i = 0; i < long; i++) {
    // (Opening out over its first metres, and a little narrower again at its far wall.)
    const e = Math.min(1, i / 2.5), f = Math.min(1, 0.7 + 0.3 * ((long - 1 - i) / 2));
    T.put(lerp(m.walk, walk, e) * f, lerp(m.wide, wide, e) * f, lerp(m.roof, roof, e));
    T.step(0);
  }
  T.piece('landing', name, s0);
  const mid = Math.floor((s0 + T.s) / 2), [bx, bz] = T.beside(mid, 0, 1), side = rng.chance(0.5) ? 1 : -1;
  P.torches.push({ x: bx, y: y + 1.1, z: bz, kind: 'brazier' });
  for (const sd of [1, -1]) { const [px, pz] = T.beside(s0 + 2, Math.min(P.wide[s0 + 2], 2.4) - 0.2, sd); P.torches.push({ x: px, y: y + 2.3, z: pz, kind: 'wall' }); }
  const hoard = /Armoury|Storeroom|Counting|Vault|Larder|Treasury|Cellar|Alchemist/.test(name), host = /Barracks|Ossuary|Bone|Spider|Tomb|Guard/.test(name);
  if (/Chapel/.test(name)) for (const sd of [-1, 1]) for (const at of [0.35, 0.7]) { const [px, pz] = T.beside(s0 + Math.round(long * at), walk - 0.8, sd); P.posts.push({ x: px, z: pz, r: 0.5, y0: y - 0.3, y1: y + roof + 0.5, kind: 'pillar' }); }
  if (/Wellhouse/.test(name)) { const [px, pz] = T.beside(mid, walk * 0.5, side); P.pools.push({ x: px, z: pz, rx: 1.6, rz: 1.2, turn: T.heading, y: y - 0.4 }); }
  if (rng.chance(hoard ? 0.9 : 0.55)) { const k = T.s - 2, [px, pz] = T.beside(k, Math.max(0.6, P.walk[k] - 0.9), -side); P.chests.push({ x: px, z: pz, s: k, face: T.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2) }); }
  if (rng.chance(host ? 0.85 : 0.35)) P.dens.push({ x: bx, z: bz, s: mid, size: host ? 2 : 1 });
}

/**
 * Whether a side way (`Q`, laid from the way through's `k`th metre) keeps clear: under the land by the rock the deeps keep over them, out
 * of the shafts and the tall chambers, and away from every other way at about its height; its first metres, within and by the wall of
 * the way it leaves, excused that way's own metres about where it leaves.
 */
function clearOf(P: DeepsPlan, Q: DeepsPlan, k: number, ground: (x: number, z: number) => number, to?: number, coverBelow = Infinity, through?: number): boolean {
  // (Its first metres excused the metres it leaves from, a slanting fork's for longer; a way round's last, those it comes back into.)
  const leave = Math.ceil(P.wide[k] / 0.6) + 5, back = to === undefined ? -1 : Q.pts.length - Math.ceil(P.wide[to]) - 6;
  for (let i = 0; i < Q.pts.length; i++) {
    const [x, z] = Q.pts[i];
    if (Q.floor[i] < coverBelow && Q.floor[i] + Q.roof[i] < coverBelow && Q.floor[i] + Q.roof[i] + COVER > ground(x, z)) return false;
    if (i > leave - 4 && (back < 0 || i < back + 4) && intoSpace(P, x, z, Q.wide[i] + 1, through) > 0) return false;
    for (let j = 0; j < P.pts.length; j++) {
      if (i < leave && Math.abs(j - k) <= 16) continue;
      if (back >= 0 && i > back && to !== undefined && Math.abs(j - to) <= 16) continue;
      const [px, pz] = P.pts[j], room = P.wide[j] + Q.wide[i] + 1.5;
      if (Math.abs(px - x) > room || Math.abs(pz - z) > room) continue;
      if (Math.hypot(px - x, pz - z) < room && Math.abs(P.floor[j] - Q.floor[i]) < Math.max(P.roof[j], Q.roof[i]) + 2) return false;
    }
  }
  return true;
}

/** A side way joined on to the plan: its metres after all that is there, and what is in it with them. */
function joinSide(P: DeepsPlan, Q: DeepsPlan, k: number, to?: number) {
  const off = P.pts.length;
  // (What stands in the way of it across the chamber it leaves, a fallen boulder, a pillar, taken away: its way to the wall kept clear.)
  P.posts = P.posts.filter((p) => !Q.pts.some(([x, z], i) => Math.hypot(x - p.x, z - p.z) < p.r + Q.walk[i] + 0.5 && p.y0 < Q.floor[i] + 2 && p.y1 > Q.floor[i]));
  for (let i = 0; i < Q.pts.length; i++) {
    P.pts.push(Q.pts[i]); P.floor.push(Q.floor[i]); P.walk.push(Q.walk[i]); P.wide.push(Q.wide[i]); P.roof.push(Q.roof[i]);
    P.shift.push(Q.shift[i]); P.drop.push(Q.drop[i]); P.open.push(Q.open[i]);
  }
  P.pieces.push(...Q.pieces.map((q) => ({ ...q, s0: q.s0 + off, s1: q.s1 + off })));
  P.shafts.push(...Q.shafts.map((sh) => ({ ...sh, s0: sh.s0 + off, s1: sh.s1 + off })));
  P.halls.push(...Q.halls.map((h) => ({ ...h, s0: h.s0 + off, s1: h.s1 + off })));
  P.lifts.push(...Q.lifts.map((l) => ({ ...l, top: l.top + off, foot: l.foot + off })));
  P.torches.push(...Q.torches); P.posts.push(...Q.posts); P.pools.push(...Q.pools);
  P.dens.push(...Q.dens.map((d) => ({ ...d, s: d.s + off }))); P.chests.push(...Q.chests.map((c) => ({ ...c, s: c.s + off })));
  P.lines.push({ s0: off, s1: off + Q.pts.length, from: k, ...(to === undefined ? {} : { to }) });
}

/** How far a point lies inside a shaft or a tall chamber, by `pad` more (more than nothing, in it): none of `skip`'s own stretch. */
function intoSpace(P: DeepsPlan, x: number, z: number, pad: number, skip?: number): number {
  let most = -Infinity;
  for (const sh of P.shafts) {
    if (sh.s0 === skip) continue;
    // (A square one by how far out from its middle across either of its sides: its corners reach further than a round one's wall.)
    if (sh.square) { const c = Math.cos(sh.square.turn), sn = Math.sin(sh.square.turn), dx = x - sh.x, dz = z - sh.z; most = Math.max(most, sh.r + pad - Math.max(Math.abs(dx * c + dz * sn), Math.abs(-dx * sn + dz * c))); }
    else most = Math.max(most, sh.r + pad - Math.hypot(x - sh.x, z - sh.z));
  }
  for (const h of P.halls) {
    if (h.s0 === skip) continue;
    const [[x0, z0], [x1, z1]] = h.axis, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / (L * L)));
    most = Math.max(most, h.wide + pad - Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)));
  }
  return most;
}

/**
 * How many metres of the line run into another stretch of it at the same depth (the caverns about them meeting, more than a short way
 * apart along it), or into a shaft or a tall chamber not their own. A way down passing over itself, within its own space, is not one;
 * nor the fifteen metres either side of it, the way into it and out (a passage leaving a stair round a shaft is clear of its wall in
 * some twelve). (Twenty, and a chamber come to just before the way up was let into its shaft.)
 */
export function clashes(p: DeepsPlan): number {
  let n = 0;
  const N = p.pts.length, spaces = [...p.shafts, ...p.halls], own = (i: number) => spaces.find((h) => i >= h.s0 - 15 && i < h.s1 + 15)?.s0;
  for (let i = 0; i < N; i += 2) {
    if (p.open[i]) continue;
    const [xi, zi] = p.pts[i];
    for (let j = i + 40; j < N; j += 2) {
      if (p.open[j]) continue;
      const [xj, zj] = p.pts[j], room = p.wide[i] + p.wide[j] + 3;
      if (Math.abs(xi - xj) < room && Math.abs(zi - zj) < room && Math.hypot(xi - xj, zi - zj) < room && Math.abs(p.floor[i] - p.floor[j]) < Math.max(p.roof[i], p.roof[j]) + 3) { n++; break; }
    }
    if (intoSpace(p, xi, zi, p.wide[i] + 1, own(i)) > 0) n++;
  }
  return n;
}

/**
 * A great chasm (asked: "in this kind of real network there could be things like narrow bridges over a chasm crossing each other"):
 * round, `R` from its middle to its wall, deep under the way and high over it, the way straight across its middle on a narrow bridge;
 * torches round its wall at the way's height and far down. Another way may cross it later, over or under this one (`addCrossings`).
 */
function abyss(T: Turtle, R: number, above: number, rng: Rng) {
  const P = T.P, s0 = T.s, y = T.y, h = T.heading, cx = T.x + Math.cos(h) * (R + 1), cz = T.z + Math.sin(h) * (R + 1), depth = span(rng, ABYSS.depth);
  const m = { walk: span(rng, PIECES.abyss.walk), wide: span(rng, PIECES.abyss.wide) }, name = rng.pick(NAMES.abyss);
  /** Straight on from where the turtle is, across the chasm's middle on a bridge where it is over the drop, to a few metres past its far wall. */
  const across = (y: number) => {
    for (let i = 0, past = 0; past < 2; i++) {
      const d = Math.hypot(T.x - cx, T.z - cz), inside = d < R - 0.8;
      if (i > R && d > R + 1) past++;
      T.put(inside ? m.walk : 1.6, inside ? m.wide : 2.4, inside ? 3.2 : 3.8, { open: inside, drop: inside ? y - (P.floor[s0] - depth) : 0, floor: y });
      T.step(0);
    }
  };
  across(y);
  T.piece('abyss', name, s0);
  // Sometimes the way across it twice (asked: "does the path through sometimes go over both?"): out past its far wall, round outside
  // it a quarter of the way, rising or falling some seven metres, and straight across its middle again, square to the first bridge,
  // over it or under it.
  const twice = rng.chance(ABYSS.twice);
  if (twice) {
    const side = rng.chance(0.5) ? 1 : -1, dy = (rng.chance(0.5) ? 1 : -1) * span(rng, ABYSS.cross), s1 = T.s, yb = y + dy, wd = span(rng, PIECES.way.walk), wi = span(rng, PIECES.way.wide);
    const goal = h + (side * Math.PI) / 2, turn = () => { for (let k = 0; k < 6; k++) { put(); T.step((side * Math.PI) / 2 / 6); } };
    let i = 0;
    const put = () => { T.put(wd, wi, 3.8, { floor: lerp(y, yb, Math.min(1, i++ / 40)) }); };
    for (let k = 0; k < 4; k++) { put(); T.step(0); }
    turn();
    // (Round the chasm at about the same distance from its middle, to where it would turn in square to the first bridge.)
    for (let k = 0; k < 200; k++) {
      const a = Math.atan2(T.z - cz, T.x - cx), r = Math.hypot(T.x - cx, T.z - cz);
      if (Math.abs(wrap(goal - a)) < 4.2 / r) break;
      put(); T.step(side / r);
    }
    turn();
    T.heading = goal + Math.PI;
    while (i < 40) { put(); T.step(0); }
    T.piece('way', '', s1);
    lightPassage(T, s1, T.s);
    const s2 = T.s;
    across(yb);
    T.piece('abyss', dy > 0 ? 'the High Bridge' : 'the Low Bridge', s2);
  }
  P.shafts.push({ x: cx, z: cz, r: R, y0: y - depth, y1: y + above, s0, s1: T.s, abyss: true, ...(twice ? { twice: true } : {}) });
  // (Round its wall, clear of where the way comes in and goes out: at the bridge's height, and lower down, the depth glowing.)
  for (let k = 0; k < 10; k++) {
    const a = h + ((k + 0.5) / 10) * Math.PI * 2;
    if (Math.abs(Math.sin(a - h)) < 0.3 || (twice && Math.abs(Math.cos(a - h)) < 0.3)) continue;
    for (const dy of [2.4, -depth * 0.4, -depth * 0.8]) P.torches.push({ x: cx + Math.cos(a) * (R - 0.4), y: y + dy, z: cz + Math.sin(a) * (R - 0.4), kind: 'wall' });
  }
}

/** The line laid, the deeps' middle at `deep`. */
function lay(a: DeepsDoor, b: DeepsDoor, rng: Rng, deep: number, ground: (x: number, z: number) => number): DeepsPlan {
  const T = new Turtle(a.x, a.z, Math.atan2(a.dz, a.dx), a.y), P = T.P;
  const descents: Descent[] = ['spiral', 'square', 'switchback', 'grand', 'scree', 'ledge', 'lift'];

  // A passage out of the door, straight on a little, the way it looks; and the way down.
  // (As the dungeon's corridor is where it comes out of the door, a square and a half across and as high, and opening out from there to
  // the passage's measures over eight metres: from the one into the other with nothing to tell where the one ends.)
  const out0 = T.s;
  for (let i = 0; i < 8; i++) { const e = i / 7; T.put(lerp(1.2, 1.6, e), lerp(DOOR.half, 2.4, e), lerp(DOOR.roof, 3.8, e)); T.step(0); }
  T.piece('way', '', out0);
  descendLong(T, rng.pick(descents), deep, rng.fork('down'), ground);

  // The way up to the second door, laid now from the door down (and turned about when it is joined on), so that the chambers keep
  // clear of it, and the line can make for its foot.
  const inH = Math.atan2(-b.dz, -b.dx), U = new Turtle(b.x - 6 * Math.cos(inH), b.z - 6 * Math.sin(inH), inH + Math.PI, b.y);
  descendLong(U, rng.pick(descents), deep, rng.fork('up'), ground);
  const footX = U.x, footZ = U.z, footHeading = U.heading + Math.PI;
  /**
   * How many metres of the line, set off now turning towards `ang` over `turnIn` metres and on for `long` in all, `wide` either side
   * and `roof` high, would run into a shaft or a tall chamber, or into the line laid already (or the way up) at about this depth, or
   * come under land too low to keep its roof under (out over a valley, which had the whole of the deeps laid deeper for it, and the
   * ways down and up a hundred metres and more).
   */
  const blocked = (ang: number, turnIn: number, long: number, wide: number, roof = 5) => {
    let px = T.x, pz = T.z, h = T.heading, n = 0;
    for (let i = 0; i < long; i += 2) {
      if (i < turnIn) h += (wrap(ang - h) / Math.max(4, turnIn - i)) * 2;
      px += Math.cos(h) * 2; pz += Math.sin(h) * 2;
      if (ground(px, pz) < T.y + roof + COVER) { n++; continue; }
      if (intoSpace(P, px, pz, wide + 3) > 0 || intoSpace(U.P, px, pz, wide + 3) > 0) { n++; continue; }
      for (const L of [P, U.P]) {
        const upto = L === P ? L.pts.length - 30 : L.pts.length;
        let hit = false;
        for (let k = 0; k < upto; k += 3) if (!L.open[k] && Math.abs(L.floor[k] - T.y) < 14 && Math.hypot(px - L.pts[k][0], pz - L.pts[k][1]) < wide + L.wide[k] + 3) { hit = true; break; }
        if (hit) { n++; break; }
      }
    }
    return n;
  };

  // The chambers, as many as the way to the way up has room for, each set off the way that keeps clearest of what is laid already, and
  // of those the nearest to between the way to the way up and as far as the seed swings it.
  const kinds: Exclude<Chamber, 'landing'>[] = ['hall', 'chasm', 'fissure', 'grotto', 'collapse', 'abyss'];
  const order = kinds.slice().sort(() => rng.next() - 0.5);
  const count = Math.max(2, Math.min(5, Math.round(Math.hypot(footX - T.x, footZ - T.z) / 45) + rng.int(1, 2)));
  /** A passage from where the line is, turning towards `want` over its length, winding as it goes. */
  const way = (want: number, long: number) => {
    const s0 = T.s, wd = span(rng, PIECES.way.walk), wi = span(rng, PIECES.way.wide), rf = span(rng, PIECES.way.roof), wob = rng.range(0.02, 0.06), ph = rng.range(0, 6), y0 = T.y;
    for (let i = 0; i < long; i++) { T.put(wd, wi, rf, { floor: y0 + Math.sin(i * 0.11 + ph) * 0.4 }); T.step(wrap(want - T.heading) / Math.max(4, long - i) + Math.sin(i * 0.2 + ph) * wob); }
    T.piece('way', '', s0);
  };
  for (let n = 0; n < count; n++) {
    const kind = order[n % order.length], m = PIECES[kind], toFoot = Math.atan2(footZ - T.z, footX - T.x), left = count - n;
    // (The fewer chambers left, the nearer to the way to the way up: early ones wander, the last ones make for it.)
    const bias = toFoot + rng.range(-1, 1) * (0.35 + 0.65 * Math.min(1, (left - 1) / 2)), wayLong = Math.round(span(rng, PIECES.way.long));
    const long = Math.round(span(rng, m.long)), walk = span(rng, m.walk), wide = Math.max(walk + 1, span(rng, m.wide)), roof = span(rng, m.roof);
    let want = bias, least = Infinity;
    // (A great chasm wants room all round it: as far either side as it is across.)
    const room = kind === 'abyss' ? long / 2 + 2 : wide;
    for (let c = -6; c <= 6; c++) { const ang = bias + c * 0.25, score = blocked(ang, wayLong, wayLong + long, room, roof) * 100 + Math.abs(c); if (score < least) { least = score; want = ang; } }
    way(want, wayLong);
    if (kind === 'abyss') { abyss(T, long / 2, roof, rng.fork(`abyss ${n}`)); continue; }
    const s0 = T.s, y = T.y;
    const bend = kind === 'fissure' ? rng.range(0.03, 0.06) : 0, ph = rng.range(0, 6), drop = kind === 'chasm' ? rng.range(28, 48) : 0;
    for (let i = 0; i < long; i++) {
      // (Into a chamber and out of it over a few metres, from the passage's measures to its own and back.)
      const e = Math.min(1, i / 4, (long - 1 - i) / 4), lift = kind === 'fissure' ? Math.sin(i * 0.15 + ph) * 1.2 : 0;
      T.put(lerp(1.6, walk, kind === 'chasm' ? 1 : e), lerp(2.4, wide, e), lerp(3.8, roof, e), { floor: y + lift, drop: drop * Math.min(1, i / 3, (long - 1 - i) / 3) });
      T.step(kind === 'fissure' ? Math.sin(i * 0.17 + ph) * bend : 0);
    }
    T.piece(kind, rng.fork(`name ${n}`).pick(NAMES[kind]), s0);
    const mid = Math.floor((s0 + T.s) / 2), R = rng.fork(`things ${n}`);
    // (A torch either side of the way into a chamber and out of it, where the passage widens.)
    if (kind !== 'chasm' && kind !== 'fissure') for (const k of [s0 + 2, T.s - 3]) for (const side of [-1, 1]) { const [px, pz] = T.beside(k, Math.min(P.wide[k], 2.6) - 0.2, side); P.torches.push({ x: px, y: y + 2.3, z: pz, kind: 'wall' }); }
    if (kind === 'hall') {
      // Two rows of pillars, a brazier between each pair, roof to floor.
      const gap = R.range(7, 9), row = walk * 0.6;
      for (let d = 6; d < long - 4; d += gap) for (const side of [-1, 1]) { const [px, pz] = T.beside(s0 + Math.round(d), row, side); P.posts.push({ x: px, z: pz, r: R.range(1, 1.4), y0: y - 0.5, y1: y + roof + 1, kind: 'pillar' }); }
      for (let d = 6 + gap / 2; d < long - 4; d += gap) { const [px, pz] = T.beside(s0 + Math.round(d), 0, 1); P.torches.push({ x: px, y: y + 1.1, z: pz, kind: 'brazier' }); }
    } else if (kind === 'chasm') {
      for (const k of [s0 + 1, T.s - 2]) for (const side of [-1, 1]) { const [px, pz] = T.beside(k, 1.8, side); P.torches.push({ x: px, y: y + 1.6, z: pz, kind: 'brazier' }); }
    } else if (kind === 'collapse') {
      // Stone fallen from the roof, here and there, in the way but never all of it.
      for (let i = 0; i < Math.round(long / 2.5); i++) { const k = s0 + R.int(2, long - 3), side = R.chance(0.5) ? 1 : -1, [px, pz] = T.beside(k, R.range(2.2, walk - 0.5), side); P.posts.push({ x: px, z: pz, r: R.range(0.8, 2.2), y0: y - 0.3, y1: y + R.range(1, 3), kind: 'boulder' }); }
      const [px, pz] = T.beside(mid, 0, 1); P.torches.push({ x: px, y: y + 1.1, z: pz, kind: 'brazier' });
    } else if (kind === 'grotto') {
      const side = R.chance(0.5) ? 1 : -1, [px, pz] = T.beside(mid, walk + 2.5, side);
      P.pools.push({ x: px, z: pz, rx: R.range(3, 5), rz: R.range(2, 3.5), turn: T.heading, y: y - 0.5 });
      const [tx, tz] = T.beside(mid, walk - 0.5, -side); P.torches.push({ x: tx, y: y + 2.3, z: tz, kind: 'wall' });
    } else {
      for (let k = s0 + 6; k < T.s - 4; k += 14) { const [px, pz] = T.beside(k, wide - 0.2, k % 2 ? 1 : -1); P.torches.push({ x: px, y: P.floor[k] + 2.3, z: pz, kind: 'wall' }); }
    }
    // Foes in the larger chambers, as the seed has it; a chest off to one side in some.
    if ((kind === 'hall' || kind === 'collapse' || kind === 'grotto') && R.chance(kind === 'hall' ? 0.7 : 0.5)) { const [px, pz] = T.beside(mid, 0, 1); P.dens.push({ x: px, z: pz, s: mid, size: kind === 'hall' ? 3 : 2 }); }
    if (kind !== 'chasm' && kind !== 'fissure' && R.chance(0.45)) { const side = R.chance(0.5) ? 1 : -1, k = s0 + Math.round(long * R.range(0.6, 0.85)), [px, pz] = T.beside(k, walk - 1.2, side); P.chests.push({ x: px, z: pz, s: k, face: T.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) }); }
  }

  // A passage to the way up's foot (Hermite's curve, from where the line is and the way it goes to the foot and the way it goes up).
  const s0w = T.s, dist = Math.hypot(footX - T.x, footZ - T.z), x0 = T.x, z0 = T.z, h0 = T.heading, n = Math.max(8, Math.round(dist * 1.3)), k0 = dist * 1.2;
  const wd = span(rng, PIECES.way.walk), wi = span(rng, PIECES.way.wide), rf = span(rng, PIECES.way.roof);
  for (let i = 0; i < n; i++) {
    const t = i / n, h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    T.x = h00 * x0 + h10 * k0 * Math.cos(h0) + h01 * footX + h11 * k0 * Math.cos(footHeading);
    T.z = h00 * z0 + h10 * k0 * Math.sin(h0) + h01 * footZ + h11 * k0 * Math.sin(footHeading);
    T.put(wd, wi, rf);
  }
  T.piece('way', '', s0w);
  lightPassage(T, s0w, T.s);

  // The way up joined on, turned about; and the last metres to the door.
  appendTurned(P, U.P);
  doorPassage(T, b);
  clearOfPosts(P);
  return P;
}

/**
 * Chests and dens moved out of what stands in the deeps (a chest had been left inside a boulder of a collapsed hall, where it could be
 * neither seen nor come to): across the line, or along it a few metres, as it is clear; else none there.
 */
function clearOfPosts(P: DeepsPlan) {
  const clear = (x: number, z: number, s: number) =>
    P.posts.every((q) => Math.hypot(x - q.x, z - q.z) > q.r + 0.9 || q.y1 < P.floor[s] || q.y0 > P.floor[s] + 2) &&
    P.pools.every((q) => Math.hypot(x - q.x, z - q.z) > Math.max(q.rx, q.rz) + 0.6);
  const place = <T extends { x: number; z: number; s: number; face?: number }>(o: T): T | null => {
    const [px, pz] = P.pts[o.s], ox = o.x - px, oz = o.z - pz, line = P.lines.find((l) => o.s >= l.s0 && o.s < l.s1) ?? { s0: 0, s1: P.pts.length };
    for (const ds of [0, 3, -3, 6, -6]) for (const side of [1, -1]) {
      const k = Math.max(line.s0, Math.min(line.s1 - 1, o.s + ds)), [qx, qz] = P.pts[k], x = qx + ox * side, z = qz + oz * side;
      if (clear(x, z, k)) return { ...o, x, z, s: k, ...(o.face === undefined ? {} : { face: side > 0 ? o.face : o.face + Math.PI }) };
    }
    return null;
  };
  P.chests = P.chests.map(place).filter((c): c is DeepsPlan['chests'][number] => !!c);
  P.dens = P.dens.map(place).filter((d): d is DeepsPlan['dens'][number] => !!d);
}

// ---------------------------------------------------------------------------------------------------------------------------- made

type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const UP = new Vector3(0, 1, 0);
const smoothstep = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
/** The kinds of piece whose floor is laid in steps (three treads to the metre), not as a slope. */
const STEPPED = new Set<PieceKind>(['spiral', 'square', 'switchback', 'grand']);
/** How far round a vault's cross-section its points lie, and how many. */
const RING = 22;
/** The cold in the dark between the lights, as the eye sees it. */
const COLD = new Color(0.012, 0.02, 0.042);
/**
 * How a passage is cut (asked: "shapes of the corridors, mix of materials"): its cross-section, from one foot of its wall over to the
 * other, across from -1 to 1 and up from 0 to 1 (`natural` is the rough arch, its own). Hewn: straight walls, the corners cut off, the
 * roof flat; vaulted: straight walls to over half its height and an arch over them, of masonry; a room: tall straight walls, a flat roof.
 */
type Cut = 'natural' | 'hewn' | 'vaulted' | 'room';
const CUTS: Cut[] = ['natural', 'hewn', 'vaulted', 'room'];
const OUTLINES: Record<Exclude<Cut, 'natural'>, [number, number][]> = {
  hewn: [[-1, 0], [-1, 0.78], [-0.72, 1], [0.72, 1], [1, 0.78], [1, 0]],
  vaulted: [[-1, 0], [-1, 0.55], ...Array.from({ length: 13 }, (_, a): [number, number] => { const t = Math.PI - (a / 12) * Math.PI; return [Math.cos(t), 0.55 + 0.45 * Math.sin(t)]; }), [1, 0.55], [1, 0]],
  room: [[-1, 0], [-1, 0.9], [-0.92, 1], [0.92, 1], [1, 0.9], [1, 0]],
};
/** A cut's outline at `t` of the way round it (0 at one foot, 1 at the other), by its length; the natural arch's by its angle. */
const outlineAt = (cut: Cut, t: number): [number, number] => {
  if (cut === 'natural') { const phi = Math.PI * t; return [-Math.cos(phi), Math.pow(Math.sin(phi), 0.55)]; }
  const o = OUTLINES[cut], lens = o.slice(1).map((p, i) => Math.hypot(p[0] - o[i][0], p[1] - o[i][1])), total = lens.reduce((a, b) => a + b, 0);
  let d = t * total;
  for (let i = 0; i < lens.length; i++) { if (d <= lens[i] || i === lens.length - 1) { const f = Math.min(1, d / lens[i]); return [o[i][0] + (o[i + 1][0] - o[i][0]) * f, o[i][1] + (o[i + 1][1] - o[i][1]) * f]; } d -= lens[i]; }
  return o[o.length - 1];
};
/**
 * A triangle of a shape, turned to face `want` (its points taken the other way round if its own face looks away from it): each of the
 * deeps' surfaces faces into the space it bounds, a floor up and a roof down, whichever way round its points were laid.
 */
const face = (s: Shape, a: number, b: number, c: number, wx: number, wy: number, wz: number) => {
  const p = s.pos, ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * wx + ny * wy + nz * wz >= 0) s.tri(a, b, c); else s.tri(a, c, b);
};
/** A quad of a shape (`a`, `b` along one edge, `c`, `d` along the next) facing `want`, as two triangles. */
const quad = (s: Shape, a: number, b: number, c: number, d: number, wx: number, wy: number, wz: number) => { face(s, a, b, c, wx, wy, wz); face(s, b, d, c, wx, wy, wz); };
/** The middle of a shape's points `a` and `d`. */
const mid = (s: Shape, a: number, d: number): [number, number, number] => [(s.pos[a * 3] + s.pos[d * 3]) / 2, (s.pos[a * 3 + 1] + s.pos[d * 3 + 1]) / 2, (s.pos[a * 3 + 2] + s.pos[d * 3 + 2]) / 2];

/**
 * A doorway into a shaft or a tall chamber, where the line comes in or goes out: where it is, how far across, and from how low to how
 * high; the stone of the space's wall not laid there.
 */
interface Portal { x: number; z: number; half: number; y0: number; y1: number }

/**
 * The deeps made: their stone (vaults along the line, the floors and stairs and bridges in them, the shafts and the tall chambers), what
 * stands in them, their torches, and the lift; lit by the torches, the light worked into the stone as the dungeons' is, and by the two
 * lights every cave shares (`shared`). And what the game asks of them: whether a point is within them (`spaceAt`), where one on foot is
 * along them, and how high the floor is there.
 */
export class Deeps {
  readonly group = new Group();
  /** Seen from above on foot: stone cut away over its own floor by `cutOver`, and all of a floor higher than `under`'s by two metres. */
  readonly cutOver = uniform(1e5);
  readonly under = uniform(1e5);
  /** Whether the backs of the walls are drawn (1), dark, as the rock they are the face of; not (0) for a picture of all of them from outside. */
  readonly backs = uniform(1);
  private readonly flicker = uniform(1);
  private readonly flames: InstancedMesh;
  private readonly flameAt: Vector3[] = [];
  private readonly grid = new Map<string, number[]>();
  private readonly kindAt: PieceKind[];
  /** How each metre is cut, as a share of each of `CUTS` (eased from one to the next over a few metres, so that no seam shows). */
  private readonly cuts: Float32Array[];
  /** For the map: what each metre of the line is (0 a passage, 1 a chamber or a landing, 2 a way up or down), and whether it has been come near. */
  readonly mapKind: Uint8Array;
  readonly seen: Uint8Array;
  private readonly portals: Portal[] = [];
  /** The lines (`DeepsPlan.lines`), which each metre is on, how many side ways each is from the way through, and the side ways leaving at each metre. */
  private readonly lines: DeepsPlan['lines'];
  private readonly lineOf: Int16Array;
  private readonly depth: number[];
  private readonly kids = new Map<number, number[]>();
  /** The way through's last metre, at the second door. */
  readonly mainEnd: number;
  /** The doors (`DeepsPlan.doors`): the metre at each, and which way is out through it. */
  readonly doors: DeepsPlan['doors'];
  /** Every pair of metres joined: one to the next along a line, and each side way's first to the metre it leaves from (for the maps). */
  readonly links: [number, number][] = [];
  /** The crystals' light (where, what colour, how strong and how far): worked into the stone with the torches'. */
  private readonly glows: { at: Vector3; color: Color; power: number; reach: number }[] = [];
  /** What is strewn and stands about (`planDressing`), placed before the light is worked into the stone and made after. */
  private dressing: { kind: 'rubble' | 'mite' | 'puddle' | 'crystal' | 'post' | 'beam'; m: Matrix4; at: Vector3; floor: number; tint?: Color }[] = [];
  /** The passages propped with timbers (by their first metre): old workings, with their rails and carts. */
  private readonly propped = new Set<number>();
  /** The embers over the braziers, the dust in the air about the one on foot, the mist in the deeps of the chasms. */
  private embers: { mesh: InstancedMesh; from: Vector3[] } | null = null;
  private motes: InstancedMesh | null = null;
  private readonly moteAt: Vector3[] = [];
  /** The lifts' platforms, and where each now is (0 at its foot, 1 at its top). */
  readonly platforms: { mesh: Group; at: number }[] = [];
  private readonly m4 = new Matrix4();

  constructor(readonly plan: DeepsPlan, readonly shared: { lantern: PointLight; fire: PointLight }) {
    const P = plan, N0 = P.pts.length;
    this.lines = P.lines?.length ? P.lines : [{ s0: 0, s1: N0, from: -1 }];
    this.lineOf = new Int16Array(N0);
    const meet = (at: number, k: number) => { this.links.push([at, k]); const l = this.kids.get(at); if (l) l.push(k); else this.kids.set(at, [k]); };
    this.lines.forEach((l, i) => { this.lineOf.fill(i, l.s0, l.s1); for (let k = l.s0; k < l.s1 - 1; k++) this.links.push([k, k + 1]); if (l.from >= 0) meet(l.from, l.s0); if (l.to !== undefined) meet(l.to, l.s1 - 1); });
    this.depth = this.lines.map(() => 0);
    this.lines.forEach((l, i) => { this.depth[i] = l.from < 0 ? 0 : this.depth[this.lineOf[l.from]] + 1; });
    this.mainEnd = this.lines[0].s1 - 1;
    this.doors = P.doors?.length ? P.doors : [{ s: 0, out: -1 }, { s: this.mainEnd, out: 1 }];
    this.kindAt = new Array<PieceKind>(N0).fill('way');
    for (const q of P.pieces) for (let k = q.s0; k < q.s1; k++) this.kindAt[k] = q.kind;
    this.cuts = this.cutsOf();
    this.mapKind = Uint8Array.from(this.kindAt, (k) => (k === 'way' ? 0 : ['spiral', 'square', 'switchback', 'grand', 'scree', 'ledge', 'lift'].includes(k) ? 2 : 1));
    this.seen = new Uint8Array(N0);
    // (The line in squares of eight metres, for finding what of it is near a point.)
    P.pts.forEach(([x, z], k) => { const key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`; const l = this.grid.get(key); if (l) l.push(k); else this.grid.set(key, [k]); });
    this.findPortals();
    this.group.name = 'deeps';
    // (Where each flame burns, first: the stone is lit by them as it is laid.)
    for (const t of P.torches) this.flameAt.push(new Vector3(t.x, t.y + (t.kind === 'brazier' ? 0.25 : 0), t.z));

    const rock = new Shape(), floors = new Shape(), walls = new Shape();
    this.layVaults(rock, floors);
    this.layDecks(floors, walls);
    this.laySpaces(rock, floors);
    this.layPosts(walls, rock);
    this.planDressing();
    for (const s of [rock, floors, walls]) this.bake(s);
    const T = paintsOf();
    /**
     * Stone of two paints, each point of it as much of the second as it was laid (`aMix`): rock, and masonry or flagstones; lit by the
     * light worked into it, and by the lantern and the fire. Seen from above, cut away over a height; a wall's back drawn dark, as the
     * rock behind its face, so that a wall seen from outside is a mass and not a sheet.
     */
    const stone = (a: { map: N; normal: N }, b: { map: N; normal: N }, roughness: number, backed = false) => {
      const m = new MeshStandardNodeMaterial({ roughness, metalness: 0, side: backed ? DoubleSide : undefined });
      const k = attribute('aMix', 'float') as N, albedo = mix(texture(a.map, uv()).rgb as N, texture(b.map, uv()).rgb as N, k);
      const dark = vec3(0.035, 0.031, 0.028);
      m.colorNode = (backed ? select(frontFacing, albedo, dark) : albedo) as N;
      m.normalNode = normalMap(mix(texture(a.normal, uv()) as N, texture(b.normal, uv()) as N, k));
      const lit = (albedo as N).mul(attribute('aLight', 'vec3')).mul(this.flicker);
      m.emissiveNode = (backed ? select(frontFacing, lit, dark.mul(0.25)) : lit) as N;
      m.lightsNode = lights([this.shared.lantern, this.shared.fire]);
      const floor = attribute('aFloor', 'float') as N;
      // (Seen from above: gone over the height it is cut at over its own floor, and all of a floor above the one on foot's; a back, not
      // when the backs are not drawn.)
      const gone = positionWorld.y.greaterThan(floor.add(this.cutOver)).or(floor.greaterThan((this.under as N).add(2)));
      m.opacityNode = select(backed ? gone.or(frontFacing.not().and((this.backs as N).lessThan(0.5))) : gone, float(0), float(1));
      m.alphaTestNode = float(0.5);
      return m;
    };
    for (const [s, m] of [[rock, stone(T.rock, T.wall, 0.95, true)], [floors, stone(T.rock, T.floor, 0.88)], [walls, stone(T.wall, T.wall, 0.9)]] as const) {
      const mesh = new Mesh(s.geometry(true), m);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.layPools();
    this.layLifts();
    this.layChests();
    this.layDressing();
    this.layFurniture();
    this.layAir();
    // The torches' and braziers' flames, each a tongue of fire turned to the eye; a brazier's bowl, and a torch's stick.
    const flamePaint = new MeshBasicNodeMaterial({ map: T.flame, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    flamePaint.colorNode = (texture(T.flame, uv()).rgb as N).mul(vec3(2.2, 1.6, 1.1));
    this.flames = new InstancedMesh(new PlaneGeometry(1, 1).translate(0, 0.38, 0), flamePaint, Math.max(1, this.flameAt.length));
    this.flames.frustumCulled = false;
    this.group.add(this.flames);
    const iron = new MeshStandardNodeMaterial({ color: 0x2b2622, roughness: 0.6, metalness: 0.5 });
    iron.lightsNode = lights([this.shared.lantern]);
    iron.emissiveNode = vec3(0.08, 0.05, 0.03);
    const bowls = P.torches.filter((t) => t.kind === 'brazier'), sticks = P.torches.filter((t) => t.kind === 'wall');
    const bowl = new InstancedMesh(new CylinderGeometry(0.45, 0.22, 0.4, 10).translate(0, 0.9, 0), iron, Math.max(1, bowls.length));
    bowls.forEach((t, i) => bowl.setMatrixAt(i, this.m4.makeTranslation(t.x, t.y - 1.1, t.z)));
    const stick = new InstancedMesh(new CylinderGeometry(0.03, 0.022, 0.55, 6).translate(0, -0.3, 0), iron, Math.max(1, sticks.length));
    sticks.forEach((t, i) => stick.setMatrixAt(i, this.m4.makeTranslation(t.x, t.y, t.z)));
    bowl.count = bowls.length; stick.count = sticks.length;
    this.group.add(bowl, stick);
  }

  // ------------------------------------------------------------------------------------------------------------- what is asked of them

  /** Whether metre `k` and the next are one line's, walked from one to the other. */
  joined(k: number): boolean { return k >= 0 && k + 1 < this.lineOf.length && this.lineOf[k] === this.lineOf[k + 1]; }
  /** Which line a metre is on: 0 the way through, else a side way. */
  lineAt(k: number): number { return this.lineOf[Math.max(0, Math.min(this.lineOf.length - 1, Math.round(k)))]; }
  /** How many metres it is from one metre to another, along the lines and through where a side way leaves. */
  apart(a: number, b: number): number {
    a = Math.max(0, Math.min(this.lineOf.length - 1, Math.round(a))); b = Math.max(0, Math.min(this.lineOf.length - 1, Math.round(b)));
    // (Out of a way round by either of its ends, whichever is the shorter.)
    const la = this.lines[this.lineOf[a]], lb = this.lines[this.lineOf[b]];
    let best = this.treeApart(a, b);
    if (la.to !== undefined && la !== lb) best = Math.min(best, la.s1 - a + this.treeApart(la.to, b));
    if (lb.to !== undefined && la !== lb) best = Math.min(best, lb.s1 - b + this.treeApart(a, lb.to));
    return best;
  }
  /** As `apart`, along the lines as they part from one another, not round the ways round. */
  private treeApart(a: number, b: number): number {
    let A = this.lineOf[a], B = this.lineOf[b], n = 0;
    while (A !== B) {
      if (this.depth[A] >= this.depth[B]) { n += a - this.lines[A].s0 + 1; a = this.lines[A].from; A = this.lineOf[a]; }
      else { n += b - this.lines[B].s0 + 1; b = this.lines[B].from; B = this.lineOf[b]; }
    }
    return n + Math.abs(a - b);
  }
  /** The metres next to one: before and after it on its line, the one its side way leaves from, and the first of each side way leaving it. */
  private nextTo(k: number): number[] {
    const l = this.lines[this.lineOf[k]], out: number[] = [];
    if (k > l.s0) out.push(k - 1);
    if (k < l.s1 - 1) out.push(k + 1);
    if (k === l.s0 && l.from >= 0) out.push(l.from);
    if (k === l.s1 - 1 && l.to !== undefined) out.push(l.to);
    const kids = this.kids.get(k);
    if (kids) out.push(...kids);
    return out;
  }
  /** The metres within `R` of `s`, along the lines either way and into and out of side ways. */
  around(s: number, R: number): number[] {
    const k0 = Math.max(0, Math.min(this.lineOf.length - 1, Math.round(s))), seen = new Map<number, number>([[k0, 0]]), todo = [k0];
    while (todo.length) { const k = todo.shift()!, d = seen.get(k)!; if (d >= R) continue; for (const n of this.nextTo(k)) if (!seen.has(n)) { seen.set(n, d + 1); todo.push(n); } }
    return [...seen.keys()];
  }
  /** The line's metres near a point (within a square of eight metres either way). */
  private near(x: number, z: number): number[] {
    const i = Math.floor(x / 8), j = Math.floor(z / 8), out: number[] = [];
    for (let b = j - 1; b <= j + 1; b++) for (let a = i - 1; a <= i + 1; a++) { const l = this.grid.get(`${a},${b}`); if (l) out.push(...l); }
    return out;
  }
  /** Which way the line goes at its `k`th metre, and its left. */
  private dirAt(k: number): [number, number] {
    const P = this.plan.pts, line = this.lines[this.lineOf[k]], a = P[Math.max(line.s0, k - 1)], b = P[Math.min(line.s1 - 1, k + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) { const t = this.plan.lifts.find((q) => q.top === k || q.foot === k)?.turn ?? 0; return [Math.cos(t), Math.sin(t)]; }
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  }
  /** How far a point lies inside a shaft or a tall chamber (more than nothing, in it). */
  private inSpace(x: number, z: number, pad = 0): number { return intoSpace(this.plan, x, z, pad); }
  /** Whether a point is within the deeps' open space: a vault about the line, a shaft, a tall chamber. */
  spaceAt(x: number, y: number, z: number): boolean {
    const P = this.plan;
    for (const sh of P.shafts) if (y > sh.y0 - 0.2 && y < sh.y1 + 0.2 && (sh.square ? Math.max(...this.squareLocal(sh, x, z).map(Math.abs)) < sh.r : Math.hypot(x - sh.x, z - sh.z) < sh.r)) return true;
    if (P.halls.some((h) => y > h.y0 - 0.2 && y < h.y1 + 0.2) && this.inSpace(x, z) > 0) for (const h of P.halls) if (y > h.y0 - 0.2 && y < h.y1 + 0.2 && intoSpace({ ...P, shafts: [], halls: [h] }, x, z, 0) > 0) return true;
    for (const k of this.near(x, z)) {
      const [dx, dz] = this.dirAt(k), [px, pz] = P.pts[k], along = (x - px) * dx + (z - pz) * dz;
      if (Math.abs(along) > 0.8) continue;
      const lat = -(x - px) * dz + (z - pz) * dx - P.shift[k];
      if (Math.abs(lat) < P.wide[k] && y > P.floor[k] - P.drop[k] - 0.3 && y < P.floor[k] + P.roof[k]) return true;
    }
    return false;
  }
  private squareLocal(sh: DeepsPlan['shafts'][number], x: number, z: number): [number, number] {
    const t = sh.square!.turn, c = Math.cos(t), s = Math.sin(t), dx = x - sh.x, dz = z - sh.z;
    return [dx * c + dz * s, -dx * s + dz * c];
  }

  // ------------------------------------------------------------------------------------------------------------------ building them

  /** The doorways into each shaft and tall chamber, where the line crosses into it from a passage and out again. */
  private findPortals() {
    const P = this.plan, spaces = [...P.shafts, ...P.halls];
    // (Where any line goes from in a space to out of it, or back: its first metre out, the doorway there. A great chasm is crossed by
    // more than one.)
    for (const sp of spaces) {
      const only = { ...P, shafts: P.shafts.filter((q) => q === sp), halls: P.halls.filter((q) => q === sp) }, inside = (k: number) => intoSpace(only, P.pts[k][0], P.pts[k][1], 0) > 0;
      for (let k = 0; k + 1 < P.pts.length; k++) {
        if (!this.joined(k)) continue;
        const a = inside(k), b = inside(k + 1);
        if (a === b) continue;
        const o = a ? k + 1 : k;
        this.portals.push({ x: P.pts[o][0], z: P.pts[o][1], half: Math.max(1, P.wide[o] - 0.5), y0: P.floor[o] - 0.5, y1: P.floor[o] + Math.min(P.roof[o], 4.6) - 0.3 });
      }
    }
  }
  private inPortal(x: number, y: number, z: number): boolean { return this.portals.some((p) => y > p.y0 && y < p.y1 && Math.hypot(x - p.x, z - p.z) < p.half); }

  /** How much the rock stands out from a vault's line, `k` along and `j` of the way round. */
  private rough(k: number, j: number, big: number): number { return (0.25 + 0.06 * big) * (0.3 + 0.7 * valueNoise2(k * 0.4, j * 0.5, 17) * (0.6 + 0.4 * valueNoise2(k * 1.7, j * 1.9, 23))); }

  /**
   * How each metre is cut: the chambers that are caverns natural, the pillared halls vaulted, the rooms rooms, the stairs' passages hewn;
   * the passages between, each as the seed has it (most natural, some hewn, some vaulted), those to a door vaulted as the dungeon's
   * corridor is. Each metre's share of each eased over three metres either way along its line.
   */
  private cutsOf(): Float32Array[] {
    const P = this.plan, N0 = P.pts.length, raw = new Uint8Array(N0), R = new Rng(`deeps cut ${P.seed ?? N0}`);
    const of: Partial<Record<PieceKind, Cut>> = { hall: 'vaulted', landing: 'room', spiral: 'hewn', square: 'hewn', switchback: 'hewn', grand: 'vaulted', lift: 'hewn' };
    for (const q of P.pieces) {
      let cut: Cut = of[q.kind] ?? 'natural';
      if (q.kind === 'way') {
        const toDoor = this.doors.some((d) => Math.abs(d.s - q.s0) <= 1 || Math.abs(d.s - (q.s1 - 1)) <= 1), r = R.fork(`way ${q.s0}`).next();
        cut = toDoor ? 'vaulted' : r < 0.5 ? 'natural' : r < 0.8 ? 'hewn' : 'vaulted';
      }
      raw.fill(CUTS.indexOf(cut), q.s0, q.s1);
    }
    const out = CUTS.map(() => new Float32Array(N0));
    for (let k = 0; k < N0; k++) {
      let n = 0;
      for (let d = -3; d <= 3; d++) { const j = k + d; if (j < 0 || j >= N0 || this.lineOf[j] !== this.lineOf[k]) continue; out[raw[j]][k] += 1; n++; }
      for (const o of out) o[k] /= n;
    }
    return out;
  }
  /** How much broader a natural passage is to its left (`side` -1) or right (1) at a metre: its walls in and out as rock is, never in past where one walks. */
  private bulge(k: number, side: number): number {
    const w = this.cuts[0][k], s = side < 0 ? 41 : 47;
    return w * (0.32 * valueNoise2(k * 0.085, s * 0.13, s) + 0.14 * valueNoise2(k * 0.37, s * 0.29, s + 3));
  }
  /**
   * How far within the way a side way leaves a side way's metre lies (more than nothing, within its walls): its distance in from that
   * one's wall, across it about where it leaves. Nothing for the way through's own metres.
   */
  private inParent(k: number): number {
    const l = this.lines[this.lineOf[k]];
    if (l.from < 0) return 0;
    const at = k - l.s0 <= 24 ? l.from : l.to !== undefined && l.s1 - 1 - k <= 24 ? l.to : -1;
    if (at < 0) return 0;
    const P = this.plan, [x, z] = P.pts[k], line = this.lines[this.lineOf[at]];
    let most = -Infinity;
    for (let j = Math.max(line.s0, at - 10); j <= Math.min(line.s1 - 2, at + 10); j++) {
      if (!this.joined(j)) continue;
      const [ax, az] = P.pts[j], [bx, bz] = P.pts[j + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      most = Math.max(most, P.wide[j] - Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return most;
  }
  /**
   * Where each side way goes out through the wall of the way it leaves: its first metre out of that one's breadth, which way it goes, how
   * far either side and how high; for that one's vault to be left open there (`holds`, about the metres `near` where it leaves).
   */
  private sideMouths(): { near(k: number): boolean; holds(x: number, y: number, z: number): boolean }[] {
    const P = this.plan;
    const ends: { at: number; k: number; out: 1 | -1 }[] = [];
    for (const l of this.lines.slice(1)) {
      let k = l.s0;
      while (k < l.s1 - 2 && this.inParent(k) > 0.3) k++;
      ends.push({ at: l.from, k, out: 1 });
      if (l.to === undefined) continue;
      k = l.s1 - 1;
      while (k > l.s0 + 1 && this.inParent(k) > 0.3) k--;
      ends.push({ at: l.to, k, out: -1 });
    }
    return ends.map(({ at, k, out }) => {
      const [ddx, ddz] = this.dirAt(k), dx = ddx * out, dz = ddz * out, [ox, oz] = P.pts[k], half = P.wide[k] - 0.15, y0 = P.floor[k] - 0.6, y1 = P.floor[k] + P.roof[k] - 0.15;
      // (The metres of the side way from where it leaves the one it comes out of to a few past its first metre out of its breadth, each as
      // far either side as the way is broad: the opening follows the way itself. The wall it goes through is further out than the
      // breadth the line is judged by where the rock bulges out or the chamber is broad, and a way leaving at a slant is long in that
      // wall: an opening a few metres either side of its first metre out left stone across the way a few metres before it, which had to
      // be walked "through".)
      const l = this.lines[this.lineOf[k]], run: number[] = [];
      const parent = this.lines[this.lineOf[at]];
      for (let j = out > 0 ? l.s0 : k - 3; j <= (out > 0 ? k + 3 : l.s1 - 2); j++) {
        if (j < l.s0 || j + 1 >= l.s1) continue;
        // (Not where it is still in the middle of the way it leaves, whose roof is not to be opened over it.)
        let clear = true;
        for (let q = Math.max(parent.s0, at - 30); q <= Math.min(parent.s1 - 1, at + 30) && clear; q++) if (Math.hypot(P.pts[j][0] - P.pts[q][0], P.pts[j][1] - P.pts[q][1]) < 0.7 * P.wide[q]) clear = false;
        if (clear) run.push(j);
      }
      return {
        near: (j: number) => Math.abs(j - at) <= 30 && this.lineOf[j] === this.lineOf[at],
        holds: (x: number, y: number, z: number) => {
          const along = (x - ox) * dx + (z - oz) * dz, lat = -(x - ox) * dz + (z - oz) * dx;
          if (along > -3 && along < 2.5 && Math.abs(lat) < half && y > y0 && y < y1) return true;
          for (const j of run) {
            const [ax, az] = P.pts[j], [bx, bz] = P.pts[j + 1], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
            if (Math.hypot(x - (ax + ex * t), z - (az + ez * t)) < P.wide[j] - 0.15 && y > P.floor[j] - 0.6 && y < P.floor[j] + P.roof[j] - 0.15) return true;
          }
          return false;
        },
      };
    });
  }
  /**
   * The vaults about the line, a ring of rock at each metre (out of the shafts and the tall chambers, which are their own): its cross-
   * section arched, as wide and high as the line has it there and its middle where it is, its foot as deep as the land falls away; and
   * the floor across it, where nothing falls away and no stair is laid (`layDecks`).
   */
  private layVaults(rock: Shape, floors: Shape) {
    const P = this.plan, N0 = P.pts.length, ring: number[] = new Array(N0).fill(-1), axis: [number, number, number][] = new Array(N0);
    const mouths = this.sideMouths();
    for (let k = 0; k < N0; k++) {
      if (P.open[k]) continue;
      // (A side way's first metres, within the breadth of the way it leaves: no vault of its own there, that one's is about it; and its
      // floor only from a metre within that one's wall, a hair lower, so the two floors meet with no gap.)
      const inParent = this.inParent(k);
      if (inParent > 0.3) {
        // (Its floor laid all the way in, not only the last metre or so: the way's own floor ends at its wall, and where the rock bulges
        // out or the chamber is broad the wall is further out than the breadth `inParent` judges by, so that nothing lay between them.)
        {
          const [dx, dz] = this.dirAt(k), lx = -dz, lz = dx, [px, pz] = P.pts[k], W = P.wide[k], first = floors.count;
          floors.floor = P.floor[k];
          // (As many points across as the vault's own floor rows, so that the next joins on to it.)
          for (let i = 0; i <= 8; i++) { const lat = -W + (2 * W * i) / 8; floors.point(px + lx * lat, P.floor[k] - 0.015, pz + lz * lat, 0, 1, 0, lat / 3, k / 3); }
          if ((floors as N).lastK === k - 1 && this.joined(k - 1)) { const prev = (floors as N).lastRow as number; for (let i = 0; i < 8; i++) quad(floors, prev + i, prev + i + 1, first + i, first + i + 1, 0, 1, 0); }
          (floors as N).lastRow = first; (floors as N).lastK = k;
        }
        continue;
      }
      // (Into a shaft or a tall chamber the passage's vault goes on a metre and a half past its wall, through the doorway cut a little
      // smaller than it, so that no gap shows between them; further in, only its floor, out to where a stair or a ramp takes over.)
      const into = this.inSpace(P.pts[k][0], P.pts[k][1]);
      const [dx, dz] = this.dirAt(k), lx = -dz, lz = dx, [px, pz] = P.pts[k], cx = px + lx * P.shift[k], cz = pz + lz * P.shift[k];
      if (into > 1.5) {
        if (STEPPED.has(this.kindAt[k])) continue;
        floors.floor = P.floor[k];
        const W = P.walk[k] + 0.6, first = floors.count;
        for (let i = 0; i <= 4; i++) { const lat = -W + (2 * W * i) / 4; floors.point(px + lx * lat, P.floor[k], pz + lz * lat, 0, 1, 0, lat / 3, k / 3); }
        if ((floors as N).lastInK === k - 1 && this.joined(k - 1)) { const prev = (floors as N).lastIn as number; for (let i = 0; i < 4; i++) quad(floors, prev + i, prev + i + 1, first + i, first + i + 1, 0, 1, 0); }
        (floors as N).lastIn = first; (floors as N).lastInK = k;
        continue;
      }
      const base = P.floor[k] - P.drop[k], H = P.roof[k] + P.drop[k], W = P.wide[k], big = Math.min(6, W / 3), share = this.cuts.map((c) => c[k]);
      // (Its walls as each cut it is a share of has them, the natural's bulging in and out; rough as rock is, the less so the more it is
      // dressed stone; the stone itself rock or masonry by as much.)
      const WL = W * (1 + this.bulge(k, -1)), WR = W * (1 + this.bulge(k, 1)), smooth = share[0] + 0.25 * (1 - share[0]);
      rock.floor = P.floor[k];
      rock.mixed = 0.35 * share[1] + share[2] + share[3];
      ring[k] = rock.count;
      axis[k] = [cx, base + H * 0.35, cz];
      for (let j = 0; j <= RING; j++) {
        let lat = 0, up = 0;
        CUTS.forEach((c, i) => { if (share[i] <= 0) return; const [a, b] = outlineAt(c, j / RING); lat += share[i] * a; up += share[i] * b; });
        lat *= lat < 0 ? WL : WR;
        const h = H * up, r = this.rough(k, j, big) * smooth * (1 + 0.6 * share[0]);
        const ox = lat / Math.max(W, 1e-3), oy = (up - 0.35) * 0.8, ol = Math.hypot(ox, oy) || 1;
        rock.point(cx + lx * (lat + (ox / ol) * r), base + h + (oy / ol) * r, cz + lz * (lat + (ox / ol) * r), 0, 0, 0, (j * W * 0.14) / 2.5, k / 2.5);
      }
      // The floor across it, where it is not a bridge's or a ledge's over a drop, nor a stair's.
      if (P.drop[k] < 0.5 && !STEPPED.has(this.kindAt[k])) {
        floors.floor = P.floor[k];
        // (Rock where it is natural, uneven toward its walls, flagstones and tiles where it is dressed; out to its walls as they bulge.)
        floors.mixed = 0.45 * share[1] + share[2] + share[3];
        const across = 8, first = floors.count, rough = 0.03 + 0.16 * share[0];
        for (let i = 0; i <= across; i++) {
          const u = -1 + (2 * i) / across, lat = u * (u < 0 ? WL : WR), edge = Math.max(0, Math.abs(u) - 0.55) / 0.45;
          floors.point(cx + lx * lat, P.floor[k] + rough * (valueNoise2(lat * 0.7, k * 0.7, 3) - 0.3) * (0.4 + edge) + share[0] * 0.25 * edge * edge, cz + lz * lat, 0, 1, 0, lat / 3, k / 3);
        }
        if (k > 0 && (floors as N).lastRow !== undefined && (floors as N).lastK === k - 1 && this.joined(k - 1)) {
          const prev = (floors as N).lastRow as number;
          for (let i = 0; i < across; i++) { const a = prev + i, b = a + 1, c = first + i, d = c + 1; quad(floors, a, b, c, d, 0, 1, 0); }
        }
        (floors as N).lastRow = first; (floors as N).lastK = k;
      } else if (P.drop[k] >= 0.5) {
        // (The floor far below, rough, under a bridge or a ledge.)
        floors.floor = base;
        const across = 6, first = floors.count;
        for (let i = 0; i <= across; i++) { const lat = -W + (2 * W * i) / across; floors.point(cx + lx * lat, base + 0.6 * valueNoise2(lat * 0.5, k * 0.5, 5), cz + lz * lat, 0, 1, 0, lat / 3, k / 3); }
        if ((floors as N).lastDeepK === k - 1 && this.joined(k - 1)) { const prev = (floors as N).lastDeep as number; for (let i = 0; i < across; i++) { const a = prev + i, b = a + 1, c = first + i, d = c + 1; quad(floors, a, b, c, d, 0, 1, 0); } }
        (floors as N).lastDeep = first; (floors as N).lastDeepK = k;
      }
    }
    for (let k = 1; k < N0; k++) if (ring[k] >= 0 && ring[k - 1] >= 0 && this.joined(k - 1)) for (let j = 0; j < RING; j++) {
      const a = ring[k - 1] + j, b = a + 1, c = ring[k] + j, d = c + 1, [mx, my, mz] = mid(rock, a, d), [ox, oy, oz] = axis[k];
      // (Not where a side way goes out through this one's wall: its doorway.)
      if (mouths.some((m) => m.near(k) && m.holds(mx, my, mz))) continue;
      quad(rock, a, b, c, d, ox - mx, oy - my, oz - mz);
    }
    // (Each side way's far end walled up: a wall across its last metre, from its middle out to its vault.)
    for (const l of this.lines.slice(1)) {
      const k = l.s1 - 1;
      if (ring[k] < 0 || l.to !== undefined || this.doors.some((o) => o.s === k)) continue;
      const [dx, dz] = this.dirAt(k), [cx, cy, cz] = axis[k], c = rock.count;
      rock.floor = P.floor[k];
      // (Its middle painted as the vault's middle is, the paint not drawn out across it from one corner.)
      rock.point(cx, cy, cz, -dx, 0, -dz, (RING / 2) * P.wide[k] * 0.14 / 2.5, k / 2.5);
      for (let j = 0; j < RING; j++) face(rock, c, ring[k] + j, ring[k] + j + 1, -dx, 0, -dz);
    }
    rock.smoothNormals();
    floors.smoothNormals();
  }

  /**
   * What is walked on where it is not the vault's own floor: a stair's treads and risers (three to the metre), a bridge, a ledge, a ramp,
   * each a slab with its underside and edges, and a parapet along an edge with nothing beyond it.
   */
  private layDecks(floors: Shape, walls: Shape) {
    const P = this.plan, N0 = P.pts.length, lifted = new Set<number>();
    // (Stairs and bridges are dressed stone.)
    floors.mixed = 1; walls.mixed = 1;
    for (const l of P.lifts) { lifted.add(l.top); lifted.add(l.foot); }
    const at = (t: number): { x: number; z: number; y: number; lx: number; lz: number; k: number } => {
      const k = Math.max(0, Math.min(N0 - 2, Math.floor(t))), f = t - k, [ax, az] = P.pts[k], [bx, bz] = P.pts[k + 1], [dx, dz] = this.dirAt(k);
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, y: P.floor[k] + (P.floor[k + 1] - P.floor[k]) * f, lx: -dz, lz: dx, k };
    };
    const slab = (s: Shape, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3) => { const i = s.count; for (const p of [a, b, c, d]) s.point(p.x, p.y, p.z, n.x, n.y, n.z, p.x / 2.5 + p.y / 5, p.z / 2.5); quad(s, i, i + 1, i + 2, i + 3, n.x, n.y, n.z); };
    for (let k = 0; k < N0 - 1; k++) {
      // (A bridge or a ledge begins a metre early, in the last metre of the vault's own floor: that floor stops at its last row and the deck
      // had begun only at the next, so that a metre of nothing lay between them, a gap seen on an iPad crossing into the Chasm.)
      const stepped = STEPPED.has(this.kindAt[k]), over = P.drop[k] >= 0.5 || P.drop[k + 1] >= 0.5, open = P.open[k];
      if (!this.joined(k) || lifted.has(k) || lifted.has(k + 1) || (!stepped && !over && !open)) continue;
      const W = stepped && !open ? P.wide[k] : P.walk[k] + 0.3, side = Math.sign(P.shift[k]);
      // (A ledge reaches from the wall it runs along to its open edge; a bridge and a stair in a shaft, as far either side as is walked.)
      const lo = over && side ? (side > 0 ? -(P.wide[k] - Math.abs(P.shift[k])) - 0.3 : -W) : -W, hi = over && side ? (side > 0 ? W : P.wide[k] - Math.abs(P.shift[k]) + 0.3) : W;
      const parts = stepped ? 3 : 1;
      for (let p = 0; p < parts; p++) {
        const A = at(k + p / parts), B = at(k + (p + 1) / parts), y = stepped ? Math.round(A.y / 0.18) * 0.18 : A.y, yB = stepped ? y : B.y;
        floors.floor = P.floor[k];
        const v = (o: typeof A, lat: number, yy: number) => new Vector3(o.x + o.lx * lat, yy, o.z + o.lz * lat);
        slab(floors, v(A, lo, y), v(A, hi, y), v(B, lo, yB), v(B, hi, yB), UP);
        // The riser down to the next tread, and the slab's underside and its open edges, where there is a drop or open space under it.
        if (stepped) { const n = at(k + (p + 1) / parts), ny = Math.round(n.y / 0.18) * 0.18; if (Math.abs(ny - y) > 0.01) slab(walls, v(B, lo, y), v(B, hi, y), v(B, lo, ny), v(B, hi, ny), new Vector3(B.x - A.x, 0, B.z - A.z).normalize().negate()); }
        if (over || open) {
          // (Solid under it, as stone is: a flight of a stair a sloping mass a metre and a half deep under its treads, its underside
          // smooth and its sides closed from each tread's edge down to it; a bridge or a ledge a slab over a metre thick. Asked: "the
          // stairs have transparent sides, they should have some 3 dimensionality for immersiveness / slab depth".)
          const deep = stepped ? 1.5 : 1.1, sa = A.y - deep, sb = B.y - deep;
          slab(walls, v(A, lo, sa), v(B, lo, sb), v(A, hi, sa), v(B, hi, sb), UP.clone().negate());
          for (const e of [lo, hi]) {
            // (A parapet on an edge with nothing beyond it: not against a wall.)
            const againstWall = (over && side && ((side > 0 && e === lo) || (side < 0 && e === hi))) || (open && this.edgeAgainstWall(A, e));
            const out = new Vector3(A.lx, 0, A.lz).multiplyScalar(Math.sign(e));
            slab(walls, v(A, e, sa), v(B, e, sb), v(A, e, y), v(B, e, yB), out);
            if (!againstWall) { const w = e - Math.sign(e) * 0.25; slab(walls, v(A, w, y), v(B, w, yB), v(A, w, y + 0.45), v(B, w, yB + 0.45), out.clone().negate()); slab(walls, v(A, e, y), v(B, e, yB), v(A, e, y + 0.45), v(B, e, yB + 0.45), out); slab(walls, v(A, w, y + 0.45), v(A, e, y + 0.45), v(B, w, yB + 0.45), v(B, e, yB + 0.45), UP); }
          }
        }
      }
    }
  }
  /** Whether a deck's edge at `lat` across from `o` stands against a shaft's or a chamber's wall (the outer edge of a stair round it). */
  private edgeAgainstWall(o: { x: number; z: number; lx: number; lz: number }, lat: number): boolean {
    const x = o.x + o.lx * (lat + Math.sign(lat) * 1.2), z = o.z + o.lz * (lat + Math.sign(lat) * 1.2);
    return this.inSpace(x, z, 0) < 0.4;
  }

  /** The shafts (round or square) and the tall chambers: their walls rough, a doorway wherever the line comes in or goes out; floor and roof. */
  private laySpaces(rock: Shape, floors: Shape) {
    const P = this.plan;
    const wall = (pt: (u: number, v: number) => Vector3, nu: number, nv: number, inward: (x: number, z: number) => [number, number], floorOf: (y: number) => number) => {
      const first = rock.count;
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = pt(i / nu, j / nv); rock.floor = floorOf(p.y); rock.point(p.x, p.y, p.z, 0, 0, 0, (i / nu) * nu * 0.6, p.y / 2.5); }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = first + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1, [mx, my, mz] = mid(rock, a, d);
        if (this.inPortal(mx, my, mz)) continue;
        const [wx, wz] = inward(mx, mz);
        quad(rock, a, b, c, d, wx, 0, wz);
      }
    };
    const cap = (cx: number, cz: number, edge: (u: number) => [number, number], y: number, up: boolean) => {
      floors.floor = y;
      const c = floors.count, n = 40;
      floors.point(cx, y, cz, 0, up ? 1 : -1, 0, cx / 3, cz / 3);
      for (let i = 0; i <= n; i++) { const [x, z] = edge(i / n); floors.point(x, y + (up ? 0.1 : 0) * valueNoise2(x, z, 9), z, 0, up ? 1 : -1, 0, x / 3, z / 3); }
      for (let i = 0; i < n; i++) face(floors, c, c + 1 + i, c + 2 + i, 0, up ? 1 : -1, 0);
    };
    for (const sh of P.shafts) {
      const nv = Math.max(2, Math.round((sh.y1 - sh.y0) / 1.5)), floorOf = (y: number) => y - 1.6;
      // (A stair tower built, of masonry; a round shaft, a chasm, rock.)
      rock.mixed = sh.square ? 1 : 0; floors.mixed = sh.square ? 1 : 0;
      if (sh.square) {
        const t = sh.square.turn, c = Math.cos(t), s = Math.sin(t), r = sh.r, corner = (u: number): [number, number] => {
          const side = Math.min(3, Math.floor(u * 4)), f = u * 4 - side, loc: [number, number] = [[-r + 2 * r * f, -r], [r, -r + 2 * r * f], [r - 2 * r * f, r], [-r, r - 2 * r * f]][side] as [number, number];
          return [sh.x + loc[0] * c - loc[1] * s, sh.z + loc[0] * s + loc[1] * c];
        };
        wall((u, v) => { const [x, z] = corner(u), y = sh.y0 + (sh.y1 - sh.y0) * v, n = 0.12 * valueNoise2(u * 40, v * 9, 4); return new Vector3(x + n, y, z + n); }, 48, nv, (x, z) => [sh.x - x, sh.z - z], floorOf);
        cap(sh.x, sh.z, corner, sh.y0, true); cap(sh.x, sh.z, corner, sh.y1, false);
      } else {
        const ring = (u: number): [number, number] => { const a = u * 2 * Math.PI; return [sh.x + Math.cos(a) * sh.r, sh.z + Math.sin(a) * sh.r]; };
        wall((u, v) => { const a = u * 2 * Math.PI, rr = sh.r + 0.5 * valueNoise2(u * 18, v * 6, 11), y = sh.y0 + (sh.y1 - sh.y0) * v; return new Vector3(sh.x + Math.cos(a) * rr, y, sh.z + Math.sin(a) * rr); }, 56, nv, (x, z) => [sh.x - x, sh.z - z], floorOf);
        cap(sh.x, sh.z, ring, sh.y0, true); cap(sh.x, sh.z, ring, sh.y1, false);
      }
    }
    rock.mixed = 0; floors.mixed = 0;
    for (const h of P.halls) {
      const [[x0, z0], [x1, z1]] = h.axis, L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L, lx = -dz, lz = dx, nv = Math.max(2, Math.round((h.y1 - h.y0) / 1.5));
      // (Round about its axis, a stadium's shape: two straight sides and a half-round at each end.)
      const edge = (u: number): [number, number] => {
        const per = 2 * L + 2 * Math.PI * h.wide, d = u * per;
        if (d < L) return [x0 + dx * d + lx * h.wide, z0 + dz * d + lz * h.wide];
        if (d < L + Math.PI * h.wide) { const a = (d - L) / h.wide; return [x1 + (lx * Math.cos(a) + dx * Math.sin(a)) * h.wide, z1 + (lz * Math.cos(a) + dz * Math.sin(a)) * h.wide]; }
        if (d < 2 * L + Math.PI * h.wide) { const e = d - L - Math.PI * h.wide; return [x1 - dx * e - lx * h.wide, z1 - dz * e - lz * h.wide]; }
        const a = (d - 2 * L - Math.PI * h.wide) / h.wide; return [x0 + (-lx * Math.cos(a) - dx * Math.sin(a)) * h.wide, z0 + (-lz * Math.cos(a) - dz * Math.sin(a)) * h.wide];
      };
      // (Inward: toward the nearest point of its axis.)
      const toAxis = (x: number, z: number): [number, number] => { const t = Math.max(0, Math.min(L, (x - x0) * dx + (z - z0) * dz)); return [x0 + dx * t - x, z0 + dz * t - z]; };
      wall((u, v) => { const [x, z] = edge(u), y = h.y0 + (h.y1 - h.y0) * v, n = 0.6 * valueNoise2(u * 30, v * 7, 13); return new Vector3(x + lx * n * 0.3, y, z + lz * n * 0.3); }, 72, nv, toAxis, (y) => y - 1.6);
      cap((x0 + x1) / 2, (z0 + z1) / 2, edge, h.y0, true); cap((x0 + x1) / 2, (z0 + z1) / 2, edge, h.y1, false);
    }
    rock.smoothNormals();
  }

  /** The pillars, dressed stone from floor to roof, a broader foot and head; the stone fallen, rough. */
  private layPosts(walls: Shape, rock: Shape) {
    for (const p of this.plan.posts) {
      if (p.kind === 'pillar') {
        const s = walls, first = s.count, n = 12, rows = [[p.y0, p.r * 1.3], [p.y0 + 0.5, p.r * 1.3], [p.y0 + 0.7, p.r], [p.y1 - 1.2, p.r], [p.y1 - 0.8, p.r * 1.35], [p.y1, p.r * 1.35]];
        s.floor = p.y0;
        for (const [y, r] of rows) for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; s.point(p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r, Math.cos(a), 0, Math.sin(a), i / n * 4, y / 2.5); }
        for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < n; i++) { const a = first + j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; s.tri(a, c, b); s.tri(b, c, d); }
      } else {
        const g = new IcosahedronGeometry(1, 1), pos = g.getAttribute('position'), first = rock.count, h = p.y1 - p.y0;
        rock.floor = p.y0;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), f = 0.75 + 0.5 * valueNoise2(x * 2 + p.x, z * 2 + y + p.z, 31); rock.point(p.x + x * p.r * f, p.y0 + (y + 1) * 0.5 * h * f, p.z + z * p.r * f, 0, 0, 0, x + y, z + y); }
        // (Its triangles a point each, three by three: the shape is laid without an index.)
        for (let i = 0; i + 2 < pos.count; i += 3) face(rock, first + i, first + i + 1, first + i + 2, pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2), pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2), pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2));
        g.dispose();
      }
    }
    walls.smoothNormals();
  }

  /** The pools: still water, dark, a little of the torchlight in it. */
  private layPools() {
    for (const q of this.plan.pools) {
      const g = new BufferGeometry(), n = 32, pos = [q.x, q.y, q.z], idx: number[] = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI, ex = Math.cos(a) * q.rx, ez = Math.sin(a) * q.rz; pos.push(q.x + ex * Math.cos(q.turn) - ez * Math.sin(q.turn), q.y, q.z + ex * Math.sin(q.turn) + ez * Math.cos(q.turn)); }
      for (let i = 1; i <= n; i++) idx.push(0, i + 1, i);
      g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
      const water = new MeshStandardNodeMaterial({ color: 0x0a161e, roughness: 0.08, metalness: 0.4 });
      water.lightsNode = lights([this.shared.lantern, this.shared.fire]);
      water.emissiveNode = vec3(0.03, 0.05, 0.07);
      this.group.add(new Mesh(g, water));
    }
  }

  // ------------------------------------------------------------------------------------------------------- dressed (asked: "way more immersive and atmospheric")

  /**
   * What is strewn about the deeps and stands in them, as the seed has it: rubble at the foot of natural walls, and now and then a pebble
   * in the way; stalagmites in the grottos, the clefts and the fallen halls, and here and there in a natural passage; water lying in the
   * hollows; crystals in the grottos and on a great chasm's wall, lighting the stone about them cold; old timber props, posts and a beam,
   * along some hewn passages. Placed here, before the light is worked into the stone, which the crystals add to.
   */
  private planDressing() {
    const P = this.plan, R = new Rng(`deeps dress ${P.seed ?? P.pts.length}`), hue = R.pick([new Color(0.3, 0.85, 1), new Color(0.7, 0.45, 1), new Color(0.4, 1, 0.65)]);
    const put = (kind: (typeof this.dressing)[number]['kind'], at: Vector3, floor: number, rot: Euler, scale: Vector3, tint?: Color) =>
      this.dressing.push({ kind, m: new Matrix4().compose(at, new Quaternion().setFromEuler(rot), scale), at: at.clone(), floor, tint });
    const crystal = (at: Vector3, floor: number, out: Vector3, r: Rng) => {
      const n = r.int(3, 6), up = out.clone().multiplyScalar(0.55).add(new Vector3(0, 1, 0)).normalize();
      for (let i = 0; i < n; i++) {
        const tilt = new Vector3(r.range(-0.5, 0.5), 0, r.range(-0.5, 0.5)).add(up).normalize(), q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tilt), h = r.range(0.5, 1.5);
        const p = at.clone().add(new Vector3(r.range(-0.25, 0.25), 0, r.range(-0.25, 0.25)));
        this.dressing.push({ kind: 'crystal', m: new Matrix4().compose(p, q, new Vector3(r.range(0.1, 0.22), h, r.range(0.1, 0.22))), at: p, floor, tint: hue });
      }
      this.glows.push({ at: at.clone().add(new Vector3(0, 0.5, 0)).addScaledVector(out, 0.4), color: hue, power: 0.9, reach: 7 });
    };
    // (Through the hewn passages that are propped: every so often a pair of posts and a beam over them.)
    const propped = this.propped;
    for (const q of P.pieces) if (q.kind === 'way' && R.fork(`props ${q.s0}`).chance(0.55)) propped.add(q.s0);
    let lastProp = -9;
    for (let k = 0; k < P.pts.length; k++) {
      if (P.open[k] || P.drop[k] >= 0.5 || STEPPED.has(this.kindAt[k]) || this.kindAt[k] === 'lift' || this.inParent(k) > 0.3 || this.liftPair(k)) continue;
      const [px, pz] = P.pts[k];
      if (this.inSpace(px, pz, 0.5) > 0) continue;
      const [dx, dz] = this.dirAt(k), lx = -dz, lz = dx, r = R.fork(`m ${k}`), y = P.floor[k], walk = P.walk[k], kind = this.kindAt[k], nat = this.cuts[0][k];
      const Wof = (side: number) => P.wide[k] * (1 + this.bulge(k, side));
      const at = (lat: number, along = 0) => new Vector3(px + lx * lat + dx * along, y, pz + lz * lat + dz * along);
      for (const side of [-1, 1]) {
        const W = Wof(side);
        // Rubble at the wall's foot, the more where it is natural.
        if (r.chance(0.12 + 0.55 * nat)) for (let i = r.int(1, 3); i > 0; i--) {
          const lat = side * (W - 0.2 - r.range(0, 0.7)), size = r.range(0.12, 0.45) * (0.6 + 0.6 * nat);
          if (Math.abs(lat) < walk + 0.15) continue;
          const p = at(lat, r.range(-0.5, 0.5)); p.y += size * 0.25;
          put('rubble', p, y, new Euler(r.range(0, 6), r.range(0, 6), r.range(0, 6)), new Vector3(size, size * r.range(0.5, 0.9), size * r.range(0.7, 1.1)));
        }
        // Stalagmites by the walls of the caverns, and now and then of a natural passage.
        const mites = kind === 'grotto' || kind === 'collapse' || kind === 'fissure' ? 0.3 : kind === 'way' ? 0.06 * nat : 0;
        if (r.chance(mites)) {
          const lat = side * (W - 0.45 - r.range(0, 0.7)), h = r.range(0.4, 1.9);
          if (Math.abs(lat) > walk + 0.3) for (let i = r.int(1, 3); i > 0; i--) { const hh = h * r.range(0.4, 1), w = r.range(0.09, 0.2) * (0.6 + hh / 2); put('mite', at(lat + r.range(-0.3, 0.3), r.range(-0.5, 0.5)), y, new Euler(r.range(-0.1, 0.1), r.range(0, 6), r.range(-0.1, 0.1)), new Vector3(w, hh, w)); }
        }
        // Crystals in the grottos and the clefts, by the wall.
        if (r.chance(kind === 'grotto' ? 0.08 : kind === 'fissure' ? 0.05 : 0)) {
          const lat = side * (W - 0.35);
          crystal(at(lat), y, new Vector3(-lx * side, 0, -lz * side), r.fork('crystal'));
        }
      }
      // A pebble in the way, where it is natural; water lying in a hollow.
      if (r.chance(0.25 * nat)) { const s = r.range(0.04, 0.1), p = at(r.range(-walk, walk) * 0.8, r.range(-0.5, 0.5)); p.y += s * 0.3; put('rubble', p, y, new Euler(r.range(0, 6), r.range(0, 6), 0), new Vector3(s, s * 0.7, s)); }
      if (r.chance((kind === 'grotto' ? 0.07 : kind === 'way' ? 0.035 : 0) * nat)) put('puddle', at(r.range(-walk, walk) * 0.6).setY(y + 0.03), y, new Euler(0, r.range(0, 6), 0), new Vector3(r.range(0.35, 0.9), 1, r.range(0.22, 0.6)));
      // The props of a propped passage, every four and a half metres.
      const piece = this.pieceAt(k);
      if (piece && propped.has(piece.s0) && this.cuts[1][k] > 0.6 && k - lastProp >= 4.5) {
        lastProp = k;
        const W = P.wide[k] - 0.28, H = Math.min(P.roof[k] * 0.82, 3.4), yaw = Math.atan2(dx, dz);
        for (const side of [-1, 1]) put('post', at(side * W).setY(y + H / 2), y, new Euler(0, yaw, r.range(-0.04, 0.04)), new Vector3(0.2, H, 0.2));
        put('beam', at(0).setY(y + H + 0.1), y, new Euler(0, yaw, 0), new Vector3(2 * W + 0.4, 0.22, 0.24));
      }
    }
    // Round each great chasm's wall, crystals at its foot and on its wall, low down.
    for (const sh of P.shafts.filter((q) => q.abyss)) {
      const r = R.fork(`abyss ${sh.s0}`);
      for (let i = 0; i < 9; i++) {
        const a = r.range(0, Math.PI * 2), y = sh.y0 + r.range(1, (sh.y1 - sh.y0) * 0.45), out = new Vector3(-Math.cos(a), 0, -Math.sin(a));
        crystal(new Vector3(sh.x + Math.cos(a) * (sh.r - 0.3), y, sh.z + Math.sin(a) * (sh.r - 0.3)), y, out, r.fork(`c ${i}`));
      }
    }
  }

  /**
   * A material for things that stand in the deeps, lit as their stone is: each copy by the light where it stands (`at`), worked out
   * once; cut away from above as the stone is, by the floor it stands on (`floor`).
   */
  private litAt(m: MeshStandardNodeMaterial, shape: BufferGeometry, at: Vector3[], floors: number[], paint?: Texture, tinted = false, glow?: N) {
    const light = new Float32Array(at.length * 3), base = new Float32Array(floors), c = new Color();
    at.forEach((p, i) => { this.lightAt(p.clone().add(new Vector3(0, 0.6, 0)), new Vector3(0, 1, 0), c); const k = Math.min(1, 1.4 / Math.max(c.r, c.g, c.b, 1e-3)); light.set([c.r * k, c.g * k, c.b * k], i * 3); });
    shape.setAttribute('aThing', new InstancedBufferAttribute(light, 3));
    shape.setAttribute('aBase', new InstancedBufferAttribute(base, 1));
    const plain = paint ? (texture(paint, uv()).rgb as N).mul(m.color) : vec3(m.color.r, m.color.g, m.color.b), albedo = tinted ? (plain as N).mul(attribute('color', 'vec3')) : plain;
    m.emissiveNode = (albedo as N).mul(attribute('aThing', 'vec3')).mul(this.flicker).add(glow ?? vec3(0, 0, 0));
    m.lightsNode = lights([this.shared.lantern, this.shared.fire]);
    const floor = attribute('aBase', 'float') as N;
    m.opacityNode = select(positionWorld.y.greaterThan(floor.add(this.cutOver)).or(floor.greaterThan((this.under as N).add(2))), float(0), float(1));
    m.alphaTestNode = float(0.5);
    return m;
  }
  /** One instanced shape of copies, lit where each stands. */
  private many(shape: BufferGeometry, m: MeshStandardNodeMaterial, list: { m: Matrix4; at: Vector3; floor: number }[], paint?: Texture, tinted = false, glow?: N, shadows = true) {
    if (!list.length) return;
    const mesh = new InstancedMesh(shape, this.litAt(m, shape, list.map((d) => d.at), list.map((d) => d.floor), paint, tinted, glow), list.length);
    list.forEach((d, i) => mesh.setMatrixAt(i, d.m));
    mesh.castShadow = shadows; mesh.receiveShadow = true;
    this.group.add(mesh);
  }
  /** What `planDressing` placed, made: each kind one instanced shape. */
  private layDressing() {
    const T = paintsOf(), of = (k: string) => this.dressing.filter((d) => d.kind === k);
    const rockM = () => new MeshStandardNodeMaterial({ color: 0x9a8f84, roughness: 0.95 });
    this.many(new DodecahedronGeometry(1, 0), rockM(), of('rubble'), T.rock.map);
    this.many(new ConeGeometry(1, 1, 9, 4).translate(0, 0.5, 0), new MeshStandardNodeMaterial({ color: 0xc8bcac, roughness: 0.7 }), of('mite'), T.rock.map);
    // (Water lying: the floor under it darker and smooth enough to shine where a light is, not a hole.)
    this.many(new CylinderGeometry(1, 1, 0.02, 20), new MeshStandardNodeMaterial({ color: 0x6a6660, roughness: 0.12, metalness: 0.15 }), of('puddle'), T.rock.map, false, undefined, false);
    const wood = new MeshStandardNodeMaterial({ color: 0x8a6a4a, roughness: 0.9 });
    this.many(new BoxGeometry(1, 1, 1), wood, of('post'), T.wood.map);
    this.many(new BoxGeometry(1, 1, 1), new MeshStandardNodeMaterial({ color: 0x7a5a3c, roughness: 0.9 }), of('beam'), T.wood.map);
    // (The crystals glowing of themselves, as each's colour; brighter, slowly, and back.)
    const crystals = of('crystal');
    if (crystals.length) {
      const c = crystals[0].tint ?? new Color(0.3, 0.85, 1), glow = vec3(c.r, c.g, c.b).mul(sin(time.mul(0.7)).mul(0.35).add(2.2));
      this.many(new ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0), new MeshStandardNodeMaterial({ color: 0x9fdfff, roughness: 0.15, metalness: 0.1, transparent: false }), crystals, undefined, false, glow, false);
    }
  }

  /**
   * Each room furnished as its name has it (the storeroom with crates and barrels and sacks, the armoury with racks of weapons, the
   * ossuary with skulls and urns, the chapel with an altar and candles, and so on; the pillared halls with statues and banners), with
   * the dungeon's own props: along its walls, out of the way of the chest, the brazier and the way through it, each standing in the way
   * of one walking as it stands.
   */
  private layFurniture() {
    const P = this.plan, R = new Rng(`deeps furnish ${P.seed ?? P.pts.length}`), props = new Props();
    const RECIPES: Record<string, [PropKind, number, 'wall' | 'end' | 'free'][]> = {
      'the Armoury': [['weaponRack', 2, 'wall'], ['armorStand', 2, 'wall'], ['spearBundle', 1, 'wall'], ['shield', 2, 'wall'], ['crate', 1, 'wall'], ['banner', 1, 'end']],
      'the Ossuary': [['urn', 3, 'wall'], ['skullPile', 2, 'wall'], ['skull', 4, 'free'], ['bones', 4, 'free'], ['skeleton', 1, 'wall'], ['candlestick', 2, 'wall'], ['cobweb', 2, 'wall']],
      'the Old Barracks': [['bedroll', 4, 'wall'], ['table', 1, 'end'], ['stool', 2, 'free'], ['armorStand', 1, 'wall'], ['weaponRack', 1, 'wall'], ['lantern', 1, 'free'], ['rug', 1, 'free']],
      'the Storeroom': [['crate', 4, 'wall'], ['barrel', 3, 'wall'], ['sack', 3, 'wall'], ['jarShelf', 1, 'wall'], ['amphora', 2, 'wall'], ['pots', 1, 'wall']],
      'the Wellhouse': [['well', 1, 'end'], ['trough', 1, 'wall'], ['bucket', 2, 'free'], ['barrel', 1, 'wall']],
      'the Forge': [['anvil', 1, 'free'], ['brazier', 1, 'end'], ['grindstone', 1, 'wall'], ['workbench', 1, 'wall'], ['toolRack', 1, 'wall'], ['firewood', 1, 'wall'], ['barrel', 1, 'wall']],
      'the Counting Room': [['desk', 1, 'end'], ['gemPile', 1, 'free'], ['coins', 3, 'free'], ['goldHeap', 1, 'wall'], ['candlestick', 2, 'wall'], ['bookcase', 1, 'wall'], ['lectern', 1, 'wall']],
      "the Hermit's Cell": [['bedroll', 1, 'wall'], ['cookingFire', 1, 'free'], ['firewood', 1, 'wall'], ['candlestick', 2, 'wall'], ['books', 2, 'wall'], ['pots', 1, 'wall'], ['rug', 1, 'free'], ['lantern', 1, 'wall']],
      'the Sunken Chapel': [['altar', 1, 'end'], ['candelabrum', 2, 'end'], ['tapestry', 1, 'end'], ['statue', 1, 'wall'], ['bench', 2, 'free'], ['banner', 2, 'wall'], ['brokenColumn', 1, 'wall']],
      'the Map Room': [['table', 1, 'end'], ['scroll', 3, 'free'], ['bookcase', 2, 'wall'], ['lectern', 1, 'wall'], ['tapestry', 1, 'wall'], ['candlestick', 2, 'wall'], ['rug', 1, 'free']],
      'the Cold Larder': [['sack', 4, 'wall'], ['barrel', 2, 'wall'], ['crate', 2, 'wall'], ['pots', 2, 'wall'], ['amphora', 2, 'wall'], ['bucket', 1, 'free']],
      'the Bone Pit': [['bones', 6, 'free'], ['skullPile', 2, 'wall'], ['skull', 4, 'free'], ['ribcage', 1, 'free'], ['skeleton', 2, 'wall'], ['hangingCage', 1, 'free']],
      'the Smithy': [['anvil', 2, 'free'], ['grindstone', 1, 'wall'], ['workbench', 2, 'wall'], ['toolRack', 2, 'wall'], ['brazier', 1, 'end'], ['firewood', 1, 'wall'], ['shield', 1, 'wall']],
      'the Library': [['bookcase', 4, 'wall'], ['lectern', 1, 'end'], ['books', 3, 'free'], ['scroll', 2, 'free'], ['candelabrum', 2, 'wall'], ['rug', 1, 'free'], ['desk', 1, 'wall']],
      "the Alchemist's Den": [['alchemyTable', 1, 'end'], ['jarShelf', 2, 'wall'], ['cauldron', 1, 'free'], ['pots', 2, 'wall'], ['bookcase', 1, 'wall'], ['skull', 2, 'free'], ['mushrooms', 1, 'wall']],
      'the Throne Room': [['throne', 1, 'end'], ['rug', 1, 'free'], ['standingTorch', 2, 'end'], ['tapestry', 2, 'wall'], ['banner', 2, 'wall'], ['statue', 2, 'wall'], ['idol', 1, 'wall']],
      'the Kitchen': [['cookingFire', 1, 'free'], ['cauldron', 1, 'free'], ['table', 1, 'wall'], ['pots', 2, 'wall'], ['firewood', 1, 'wall'], ['sack', 2, 'wall'], ['barrel', 1, 'wall'], ['jarShelf', 1, 'wall']],
      'the Tomb': [['sarcophagus', 1, 'end'], ['tombSlab', 2, 'free'], ['coffin', 2, 'wall'], ['urn', 2, 'wall'], ['candlestick', 3, 'wall'], ['cobweb', 2, 'wall']],
      'the Spider Nest': [['eggSacs', 4, 'free'], ['cobweb', 5, 'wall'], ['skeleton', 1, 'wall'], ['bones', 3, 'free'], ['hangingCage', 1, 'free']],
      'the Fungus Garden': [['mushrooms', 7, 'free'], ['moss', 4, 'free'], ['bucket', 1, 'wall'], ['pots', 1, 'wall']],
      'the Mine Head': [['mineCart', 1, 'free'], ['orePile', 2, 'wall'], ['pickaxe', 2, 'free'], ['toolRack', 1, 'wall'], ['ladder', 1, 'wall'], ['scaffold', 1, 'end'], ['lantern', 2, 'free'], ['crate', 1, 'wall']],
      'the Treasury': [['goldHeap', 2, 'wall'], ['gemPile', 2, 'free'], ['coins', 4, 'free'], ['idol', 1, 'end'], ['crate', 2, 'wall'], ['standingTorch', 2, 'wall']],
      'the Cellar': [['wineRack', 3, 'wall'], ['barrel', 4, 'wall'], ['amphora', 3, 'wall'], ['cobweb', 2, 'wall'], ['lantern', 1, 'free']],
      'the Guardroom': [['table', 1, 'end'], ['stool', 2, 'free'], ['weaponRack', 1, 'wall'], ['armorStand', 1, 'wall'], ['barrel', 1, 'wall'], ['lantern', 1, 'free']],
      'the Shrine of Steps': [['altar', 1, 'end'], ['candelabrum', 2, 'wall'], ['runestone', 1, 'wall']],
      'the Cistern': [['basin', 1, 'free'], ['trough', 1, 'wall'], ['bucket', 2, 'free'], ['barrel', 1, 'wall']],
      'the Watch Post': [['banner', 2, 'wall'], ['standingTorch', 1, 'wall'], ['stool', 1, 'free'], ['barrel', 1, 'wall'], ['spearBundle', 1, 'wall']],
      'the Resting Hall': [['bedroll', 3, 'wall'], ['bench', 2, 'wall'], ['cookingFire', 1, 'free'], ['firewood', 1, 'wall'], ['rug', 1, 'free']],
    };
    const taken: { x: number; z: number; r: number }[] = [...P.chests.map((c) => ({ x: c.x, z: c.z, r: 1.2 })), ...P.torches.filter((t) => t.kind === 'brazier').map((t) => ({ x: t.x, z: t.z, r: 1.3 })), ...P.posts.map((p) => ({ x: p.x, z: p.z, r: p.r + 0.4 })), ...P.pools.map((p) => ({ x: p.x, z: p.z, r: Math.max(p.rx, p.rz) + 0.4 }))];
    const free = (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r);
    const laidIn = new Map<Piece, { kind: PropKind; x: number; z: number; y: number; face: number; where: 'wall' | 'end' | 'free'; k: number }[]>();
    for (const q of P.pieces) {
      const recipe = q.kind === 'hall' ? ([['statue', 2, 'end'], ['banner', 3, 'wall'], ['tapestry', 1, 'wall'], ['standingTorch', 2, 'wall'], ['brokenColumn', 1, 'free']] as [PropKind, number, 'wall' | 'end' | 'free'][]) : RECIPES[q.name];
      if (!recipe) continue;
      const r = R.fork(`room ${q.s0}`);
      for (const [kind, n, where] of recipe) for (let i = 0, tries = 0; i < n && tries < 24; tries++) {
        // (Along a wall, a little in from it; at its far end; or anywhere in it but its middle line, where one walks through.)
        const k = where === 'end' ? q.s1 - 2 - r.int(0, 1) : r.int(q.s0 + 2, Math.max(q.s0 + 2, q.s1 - 3));
        if (this.lineOf[k] !== this.lineOf[q.s0]) continue;
        const [px, pz] = P.pts[k], [dx, dz] = this.dirAt(k), lx = -dz, lz = dx, side = r.chance(0.5) ? 1 : -1, walk = P.walk[k];
        // (Against a wall: as far out as the room goes there, a little in from its face.)
        const lat = where === 'free' ? side * r.range(0.9, Math.max(1, walk - 0.6)) : where === 'end' ? r.range(-0.6, 0.6) * Math.max(0, walk - 1.5) : side * Math.max(0.8, P.wide[k] - 0.75);
        const x = px + lx * lat + (where === 'end' ? dx * 0.2 : 0), z = pz + lz * lat + (where === 'end' ? dz * 0.2 : 0);
        const big = ['table', 'desk', 'altar', 'bookcase', 'workbench', 'alchemyTable', 'throne', 'well', 'scaffold', 'mineCart', 'tombSlab', 'sarcophagus', 'rug', 'tent', 'ribcage'].includes(kind) ? 0.9
          : ['skull', 'coins', 'scroll', 'bones', 'cobweb', 'pickaxe', 'gemPile', 'moss', 'lantern', 'books'].includes(kind) ? 0.15 : 0.45;
        if (!free(x, z, big)) continue;
        // (Facing into the room: from a wall toward its middle; at its end, back along it.)
        const face = where === 'end' ? Math.atan2(-dx, -dz) : where === 'wall' ? Math.atan2(-lx * side, -lz * side) : r.range(0, Math.PI * 2);
        const at = new Vector3(x, P.floor[k] + (kind === 'cobweb' ? 2.2 : 0), z), reach = props.put(kind, at, face, kind === 'statue' ? 1.15 : 1);
        taken.push({ x, z, r: big });
        // (In the way of one walking, as far as it stands out.)
        if (reach > 0.2) P.posts.push({ x, z, r: reach * 0.85, y0: P.floor[k] - 0.3, y1: P.floor[k] + 1.6, kind: 'boulder' });
        if (!laidIn.has(q)) laidIn.set(q, []);
        laidIn.get(q)!.push({ kind, x, z, y: P.floor[k], face, where, k });
        i++;
      }
      this.dressRoom(props, q, r.fork('dress'), laidIn.get(q) ?? [], taken);
    }
    this.furnishWays(props, R.fork('ways'), taken);
    const T = paintsOf(), stuffOf = (stuff: Stuff) => {
      const paint = STUFF_PAINT[stuff], m = new MeshStandardNodeMaterial({ vertexColors: true, ...STUFF_LOOK[stuff] });
      if (paint) { m.map = T[paint].map; m.normalMap = T[paint].normal; }
      return m;
    };
    for (const { stuff, shape, at: list } of props.parts()) {
      const glow = stuff === 'coal' ? vec3(1.6, 0.5, 0.12).mul(sin(time.mul(3.1)).mul(0.15).add(0.85)) : stuff === 'wax' ? vec3(0.25, 0.2, 0.12) : stuff === 'fungus' ? (attribute('color', 'vec3') as N).mul(sin(time.mul(0.9)).mul(0.2).add(0.75)) : undefined;
      this.many(shape, stuffOf(stuff), list.map((m) => { const at = new Vector3().setFromMatrixPosition(m); return { m, at, floor: at.y }; }), STUFF_PAINT[stuff] ? T[STUFF_PAINT[stuff]!].map : undefined, true, glow, stuff !== 'cloth');
    }
    // (The flames the furnishings hold, candles and a forge's brazier, among the deeps' own: their light is not worked into the stone,
    // which is already lit, but they burn.)
    for (const f of props.flames()) this.flameAt.push(f.at.clone().add(new Vector3(0, -0.2, 0)));
  }

  /**
   * A room filled as one lived in, worked in or left would be, past the few pieces its recipe names (asked: "for the rooms to not feel
   * so empty"): about each table stools or benches and on it what was being done there; barrels and crates two and three together,
   * crates stacked; the rest of its walls lined with its own goods, by its size; litter about its floor; cobwebs in its corners. Out of
   * the way through it and of any way leading off it, as the recipe's pieces are.
   */
  private dressRoom(props: Props, q: Piece, r: Rng, laid: { kind: PropKind; x: number; z: number; y: number; face: number; where: 'wall' | 'end' | 'free'; k: number }[], taken: { x: number; z: number; r: number }[]) {
    const P = this.plan, line = this.lineOf[q.s0], hall = q.kind === 'hall';
    const theme = { ...DRESS_ANY, ...(hall ? DRESS_HALL : (DRESS[q.name] ?? {})) };
    // (Where other ways come into it or leave it, kept clear: their first few metres, wherever they are about the room.)
    const k0 = q.s0, k1 = Math.min(q.s1, P.pts.length) - 1, [cx, cz] = P.pts[Math.floor((k0 + k1) / 2)], span = k1 - k0 + 12;
    const doors: [number, number][] = [];
    P.pts.forEach(([x, z], j) => { if (this.lineOf[j] !== line && Math.hypot(x - cx, z - cz) < span && Math.abs(P.floor[j] - P.floor[k0]) < 3) doors.push([x, z]); });
    
    // (And the doorways at its ends, as wide as the way that comes in there.)
    // (A strip as wide as that way, a metre or so deep into the room; none where the room is the way's end.)
    const ends: { x: number; z: number; dx: number; dz: number; half: number }[] = [];
    for (const [k, j] of [[k0, k0 - 1], [k1, k1 + 1]]) if (j >= 0 && j < P.pts.length && this.lineOf[j] === line) { const [dx, dz] = this.dirAt(k); ends.push({ x: P.pts[k][0], z: P.pts[k][1], dx, dz, half: P.walk[j] }); }
    // (The way through it, a metre either side of its middle line, kept for walking: nothing that stands in the way laid on it.)
    const onPath = (x: number, z: number, rr: number) => {
      for (let k = k0; k <= k1; k++) {
        if (this.lineOf[k] !== line) continue;
        const [px, pz] = P.pts[k], [dx, dz] = this.dirAt(k), a = (x - px) * dx + (z - pz) * dz;
        if (Math.abs(a) < 0.6 && Math.abs(-(x - px) * dz + (z - pz) * dx) < 1 + rr) return true;
      }
      return false;
    };
    const clear = (x: number, z: number, rr: number) => (rr <= 0.2 || !onPath(x, z, rr)) && taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + rr) && doors.every(([dx, dz]) => Math.hypot(dx - x, dz - z) > 2.2 + rr) && ends.every((e) => { const a = (x - e.x) * e.dx + (z - e.z) * e.dz, l = -(x - e.x) * e.dz + (z - e.z) * e.dx; return Math.abs(a) > 1.2 + rr || Math.abs(l) > e.half + 0.3 + rr; });
    const put = (kind: PropKind, x: number, y: number, z: number, face: number, rr: number, o: { scale?: number; block?: boolean; free?: boolean } = {}) => {
      if (o.free !== false && !clear(x, z, rr)) return false;
      const reach = props.put(kind, new Vector3(x, y, z), face, o.scale ?? 1);
      if (o.free !== false) taken.push({ x, z, r: rr });
      if (o.block !== false && reach > 0.2) P.posts.push({ x, z, r: reach * 0.85, y0: y - 0.3, y1: y + 1.6, kind: 'boulder' });
      return true;
    };
    // (A prop's own x and z (its front) turned as it stands.)
    const turned = (face: number, ax: number, az: number): [number, number] => [ax * Math.cos(face) + az * Math.sin(face), -ax * Math.sin(face) + az * Math.cos(face)];
    for (const it of laid) {
      // About a table: seats along its front (and its back, if it stands free), and on it what is used there.
      const top = TOPS[it.kind];
      if (top !== undefined) {
        const seat: PropKind = theme.seat, sides = it.where === 'free' ? [1, -1] : [1];
        for (const sd of sides) for (const ax of seat === 'bench' ? [0] : [-0.45, 0.45]) {
          if (it.kind === 'alchemyTable' || it.kind === 'workbench' || r.chance(0.25)) continue;
          const [ox, oz] = turned(it.face, ax + r.range(-0.08, 0.08), sd * (seat === 'bench' ? 0.75 : 0.72));
          put(seat, it.x + ox, it.y, it.z + oz, it.face + (sd > 0 ? Math.PI : 0) + r.range(-0.3, 0.3), seat === 'bench' ? 0.4 : 0.22, { free: false, block: seat === 'bench' });
        }
        for (let i = 0, n = r.int(2, 4); i < n; i++) {
          const kind = r.pick(theme.top), [ox, oz] = turned(it.face, r.range(-0.6, 0.6), r.range(-0.22, 0.22));
          put(kind, it.x + ox, it.y + top, it.z + oz, r.range(0, Math.PI * 2), 0, { scale: SMALL[kind] ?? 0.7, free: false, block: false });
        }
      }
      // Barrels, crates and sacks kept together: another beside, a crate on a crate.
      if (it.kind === 'barrel' || it.kind === 'crate' || it.kind === 'sack') {
        for (const sd of [-1, 1]) if (r.chance(0.55)) {
          const [ox, oz] = turned(it.face, sd * r.range(0.72, 0.85), r.range(-0.1, 0.1)), kind = r.chance(0.7) ? it.kind : r.pick(['barrel', 'crate', 'sack'] as PropKind[]);
          put(kind, it.x + ox, it.y, it.z + oz, it.face + r.range(-0.4, 0.4), 0.4);
        }
        if (it.kind === 'crate' && r.chance(0.45)) put(r.chance(0.7) ? 'crate' : 'sack', it.x, it.y + 0.7, it.z, it.face + r.range(-0.5, 0.5), 0, { scale: r.range(0.75, 0.9), free: false, block: false });
      }
    }
    // (The room at `t` metres along it, between its metres: where its middle is, which way it goes, how wide it is.)
    const at = (t: number) => {
      const i = Math.floor(t), j = Math.min(i + 1, k1), f = t - i, [ax, az] = P.pts[i], [bx, bz] = P.pts[j], [dx, dz] = this.dirAt(i);
      return { px: ax + (bx - ax) * f, pz: az + (bz - az) * f, dx, dz, wide: P.wide[i] + (P.wide[j] - P.wide[i]) * f, walk: P.walk[i] + (P.walk[j] - P.walk[i]) * f, y: P.floor[i] + (P.floor[j] - P.floor[i]) * f, roof: P.roof[i], k: i };
    };
    const ok = (k: number) => this.lineOf[k] === line && !P.open[k];
    const loose = theme.line.filter((kind) => !WALLED.has(kind));
    // A stack, a pile: what stands on the floor of a store laid out from where one piece is, about it.
    const heap = (kind: PropKind, x: number, y: number, z: number, face: number, n: number) => {
      // (Crates two by two, more on them; barrels three together; the rest of a store's goods about the one.)
      if (kind === 'crate') {
        for (const [ax, az] of [[0.8, 0], [0, 0.8], [0.8, 0.8]]) { const [ox, oz] = turned(face, ax, az); put('crate', x + ox, y, z + oz, face + r.range(-0.15, 0.15), 0.38); }
        for (const [ax, az] of [[0, 0], [0.8, 0.4], [0.4, 0.8]]) if (r.chance(0.6)) { const [ox, oz] = turned(face, ax, az); put(r.chance(0.8) ? 'crate' : 'sack', x + ox, y + 0.7, z + oz, face + r.range(-0.4, 0.4), 0, { scale: r.range(0.8, 0.95), free: false, block: false }); }
        return;
      }
      if (kind === 'barrel') {
        for (const a of [0, 2.1]) { const [ox, oz] = turned(face + a, 0.68, 0); put('barrel', x + ox, y, z + oz, r.range(0, 6), 0.35); }
        return;
      }
      for (let i = 0; i < n; i++) {
        const a = face + r.range(-2.2, 2.2), d = r.range(0.75, 0.95), kind = r.pick(loose.length ? loose : theme.line);
        put(kind, x + Math.sin(a) * d, y, z + Math.cos(a) * d, a + r.range(-0.4, 0.4), 0.38);
      }
    };
    // The walls lined, as far as the room goes, a piece to each step along them; some of it left bare. A second row out from the first,
    // where the room keeps goods.
    for (let t = k0 + 1; t < k1 - 0.5; t += r.range(0.75, 0.9)) {
      const w = at(t);
      if (!ok(w.k)) continue;
      const lx = -w.dz, lz = w.dx;
      for (const side of [-1, 1]) {
        if (!r.chance(theme.lining)) continue;
        const lat = side * Math.max(0.9, w.wide - 0.6), kind = r.pick(theme.line), x = w.px + lx * lat, z = w.pz + lz * lat;
        if (Math.abs(lat) < 1.4) continue;
        const face = Math.atan2(-lx * side, -lz * side) + (WALLED.has(kind) ? 0 : r.range(-0.5, 0.5)), deep = kind === 'bookcase' || kind === 'jarShelf' || kind === 'wineRack';
        if (put(kind, x, w.y + (kind === 'cobweb' ? Math.min(2.2, w.roof - 0.6) : 0), z, face, deep ? 0.55 : 0.4) && (kind === 'crate' || kind === 'sack') && r.chance(0.55))
          put(r.chance(0.7) ? 'crate' : 'sack', x, w.y + (kind === 'crate' ? 0.7 : 0.55), z, face + r.range(-0.5, 0.5), 0, { scale: r.range(0.75, 0.9), free: false, block: false });
        // (The second row, whether or not the wall behind it had room: a recipe's piece may stand there, a little further in than these.)
        const inner = Math.abs(lat) - 1.1;
        if (theme.rows > 1 && loose.length && inner > 1.6 && r.chance(0.75))
          put(r.pick(loose), w.px + lx * side * inner, w.y, w.pz + lz * side * inner, face + r.range(-0.6, 0.6), 0.4);
      }
    }
    // Its near wall, either side of the doorway in.
    if (ok(k0 + 1)) {
      const w = at(k0 + 1), lx = -w.dz, lz = w.dx, fore = Math.atan2(w.dx, w.dz);
      for (let lat = -w.wide + 1; lat <= w.wide - 1; lat += r.range(0.85, 1.05)) {
        if (!r.chance(theme.lining)) continue;
        const kind = r.pick(theme.line);
        put(kind, w.px + lx * lat - w.dx * 0.3, w.y + (kind === 'cobweb' ? Math.min(2.2, w.roof - 0.6) : 0), w.pz + lz * lat - w.dz * 0.3, fore + (WALLED.has(kind) ? 0 : r.range(-0.4, 0.4)), 0.4);
      }
    }
    // Its far wall lined too, across, but for the doorway out if the way goes on.
    if (ok(k1 - 1)) {
      const w = at(k1 - 1), lx = -w.dz, lz = w.dx, back = Math.atan2(-w.dx, -w.dz);
      for (let lat = -w.wide + 1; lat <= w.wide - 1; lat += r.range(0.85, 1.05)) {
        if (!r.chance(theme.lining)) continue;
        const kind = r.pick(theme.line);
        put(kind, w.px + lx * lat + w.dx * 0.4, w.y + (kind === 'cobweb' ? Math.min(2.2, w.roof - 0.6) : 0), w.pz + lz * lat + w.dz * 0.4, back + (WALLED.has(kind) ? 0 : r.range(-0.4, 0.4)), 0.4);
      }
    }
    // Out on its floor, clear of the way through: a piece or two of what the room is for, and about each what goes with it.
    for (let i = 0, n = Math.max(theme.islands.length ? 1 : 0, Math.round(((k1 - k0) * 2 * P.wide[Math.floor((k0 + k1) / 2)]) / 20)); i < n && theme.islands.length; i++) {
      const w = at(r.range(k0 + 2, Math.max(k0 + 2.1, k1 - 2)));
      if (!ok(w.k) || w.walk < 2.2) continue;
      const side = r.chance(0.5) ? 1 : -1, lat = side * r.range(1.5, Math.max(1.6, w.walk - 0.6)), x = w.px - w.dz * lat, z = w.pz + w.dx * lat;
      const kind = r.pick(theme.islands), face = Math.atan2(w.dx, w.dz) + (r.chance(0.5) ? 0 : Math.PI) + r.range(-0.3, 0.3);
      if (!put(kind, x, w.y, z, face, 0.6)) continue;
      const top = TOPS[kind];
      if (top !== undefined) {
        for (const sd of [1, -1]) for (const ax of [-0.45, 0.45]) if (r.chance(0.7)) { const [ox, oz] = turned(face, ax, sd * 0.72); put(theme.seat, x + ox, w.y, z + oz, face + (sd > 0 ? Math.PI : 0) + r.range(-0.3, 0.3), 0.22, { free: false, block: false }); }
        for (let j = 0, m = r.int(2, 4); j < m; j++) { const tk = r.pick(theme.top), [ox, oz] = turned(face, r.range(-0.6, 0.6), r.range(-0.22, 0.22)); put(tk, x + ox, w.y + top, z + oz, r.range(0, Math.PI * 2), 0, { scale: SMALL[tk] ?? 0.7, free: false, block: false }); }
      } else heap(kind, x, w.y, z, face, r.int(2, 4));
    }
    // Litter about the floor, the way through too: by the room's size.
    let area = 0;
    for (let k = k0; k <= k1; k++) if (this.lineOf[k] === line) area += 2 * P.walk[k];
    for (let i = 0, n = Math.round(area * theme.litterPer); i < n; i++) {
      const k = r.int(k0 + 1, Math.max(k0 + 1, k1 - 1));
      if (this.lineOf[k] !== line || P.open[k]) continue;
      const [px, pz] = P.pts[k], [dx, dz] = this.dirAt(k), lat = r.range(-1, 1) * Math.max(0.3, P.walk[k] - 0.3), kind = r.pick(theme.litter);
      put(kind, px - dz * lat, P.floor[k], pz + dx * lat, r.range(0, Math.PI * 2), 0.12, { scale: SMALL[kind] ?? 1, block: false });
    }
    // Cobwebs in its corners, high.
    for (const k of [k0 + 1, k1 - 1]) for (const side of [-1, 1]) {
      if (!r.chance(theme.webs) || this.lineOf[k] !== line) continue;
      const [px, pz] = P.pts[k], [dx, dz] = this.dirAt(k), lat = side * Math.max(0.9, P.wide[k] - 0.35);
      props.put('cobweb', new Vector3(px - dz * lat, P.floor[k] + Math.min(2.4, P.roof[k] - 0.5), pz + dx * lat), Math.atan2(dz * side, -dx * side) + (k === k0 + 1 ? -0.6 : 0.6) * side);
    }
  }

  /**
   * The passages and the caverns furnished as what they are: the propped passages old workings, rails down their middle and now and then
   * a cart on them, ore heaped and a pick left by a wall, a lantern on the ground; the grottos grown with glowing fungi and moss; the
   * fallen halls with a column broken or a giant's stone head lying; the narrows' floors mossed; and over a great chasm, cages and chains
   * hanging down into it beside the bridge. In the props `props` lays, out of the way of what is `taken`.
   */
  private furnishWays(props: Props, R: Rng, taken: { x: number; z: number; r: number }[]) {
    const P = this.plan, free = (x: number, z: number, r: number) => taken.every((t) => Math.hypot(t.x - x, t.z - z) > t.r + r);
    const lay = (kind: PropKind, x: number, y: number, z: number, yaw: number, r: number, block = true) => {
      if (!free(x, z, r)) return false;
      const reach = props.put(kind, new Vector3(x, y, z), yaw);
      taken.push({ x, z, r });
      if (block && reach > 0.2) P.posts.push({ x, z, r: reach * 0.85, y0: y - 0.3, y1: y + 1.6, kind: 'boulder' });
      return true;
    };
    let lastRail = -9;
    for (let k = 0; k < P.pts.length; k++) {
      if (P.open[k] || P.drop[k] >= 0.5 || STEPPED.has(this.kindAt[k]) || this.inParent(k) > 0.3 || this.liftPair(k)) continue;
      const [px, pz] = P.pts[k];
      if (this.inSpace(px, pz, 0.5) > 0) continue;
      const [dx, dz] = this.dirAt(k), lx = -dz, lz = dx, y = P.floor[k], walk = P.walk[k], kind = this.kindAt[k], piece = this.pieceAt(k), r = R.fork(`w ${k}`), yaw = Math.atan2(dx, dz);
      const side = r.chance(0.5) ? 1 : -1, wall = side * Math.max(0.6, P.wide[k] - 0.55);
      // Old workings.
      if (piece && this.propped.has(piece.s0) && this.cuts[1][k] > 0.6) {
        if (k - lastRail >= 2 && this.joined(k)) { lastRail = k; props.put('rails', new Vector3(px, y, pz), yaw); }
        if (r.chance(0.03)) lay('mineCart', px, y, pz, yaw, 0.75);
        if (r.chance(0.05)) lay('orePile', px + lx * wall, y, pz + lz * wall, r.range(0, 6), 0.45, false);
        if (r.chance(0.03)) lay('pickaxe', px + lx * wall * 0.8, y, pz + lz * wall * 0.8, r.range(0, 6), 0.15, false);
        if (r.chance(0.025)) lay('lantern', px + lx * wall * 0.9, y, pz + lz * wall * 0.9, 0, 0.15, false);
        if (r.chance(0.02)) lay('firewood', px + lx * wall, y, pz + lz * wall, yaw, 0.45);
      }
      // Fungi and moss in the grottos and the clefts; moss in a natural passage now and then.
      if (kind === 'grotto' && r.chance(0.18)) lay('mushrooms', px + lx * side * r.range(1, Math.max(1.1, walk + 0.5)), y, pz + lz * side * r.range(1, Math.max(1.1, walk + 0.5)), r.range(0, 6), 0.35, false);
      if ((kind === 'grotto' || kind === 'fissure') && r.chance(0.12)) lay('moss', px + lx * r.range(-walk, walk), y, pz + lz * r.range(-walk, walk), r.range(0, 6), 0.2, false);
      if (kind === 'way' && this.cuts[0][k] > 0.8 && r.chance(0.02)) lay(r.chance(0.6) ? 'moss' : 'mushrooms', px + lx * wall, y, pz + lz * wall, r.range(0, 6), 0.3, false);
      // The ruins of a fallen hall; bones in a passage, now and then.
      if (kind === 'collapse' && r.chance(0.035)) lay(r.pick(['brokenColumn', 'stoneHead', 'ribcage'] as PropKind[]), px + lx * side * Math.max(1.5, walk - 1.2), y, pz + lz * side * Math.max(1.5, walk - 1.2), r.range(0, 6), 0.8);
      if (kind === 'way' && r.chance(0.012)) lay(r.pick(['bones', 'skull', 'skeleton'] as PropKind[]), px + lx * wall * 0.8, y, pz + lz * wall * 0.8, r.range(0, 6), 0.2, false);
    }
    // Over each great chasm, beside the bridge: cages and chains hanging down into it from its roof.
    for (const sh of P.shafts.filter((q) => q.abyss)) {
      const r = R.fork(`abyss ${sh.s0}`), y = P.floor[sh.s0];
      for (let i = 0; i < 7; i++) {
        const a = r.range(0, Math.PI * 2), d = r.range(4, sh.r - 2.5), x = sh.x + Math.cos(a) * d, z = sh.z + Math.sin(a) * d;
        // (Not over a bridge: out over the drop.)
        let clear = true;
        for (let k = sh.s0; k < sh.s1 && clear; k++) if (Math.hypot(P.pts[k][0] - x, P.pts[k][1] - z) < 2.2) clear = false;
        if (clear) props.put(r.chance(0.4) ? 'hangingCage' : 'chain', new Vector3(x, y - r.range(2, 9), z), r.range(0, 6));
      }
    }
  }

  /**
   * The air of the deeps: embers going up from each brazier and dying; dust hanging in the air about the one on foot, glinting where
   * the light is; and mist lying in the deeps of the chasms, under the bridges, drifting.
   */
  private layAir() {
    const P = this.plan, T = paintsOf();
    // Embers: eight to each brazier, each going up from it over a couple of seconds, turned to the eye (`update`).
    const from = P.torches.filter((t) => t.kind === 'brazier').map((t) => new Vector3(t.x, t.y + 0.35, t.z));
    if (from.length) {
      const spark = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      spark.colorNode = (texture(T.puff, uv()).a as N).mul(vec3(2.4, 1.1, 0.35));
      const mesh = new InstancedMesh(new PlaneGeometry(1, 1), spark, from.length * 8);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.embers = { mesh, from };
    }
    // Dust: some two hundred motes in the air about the one on foot, wrapped round as it goes.
    const dust = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    dust.colorNode = (texture(T.puff, uv()).a as N).mul(vec3(0.16, 0.13, 0.1));
    this.motes = new InstancedMesh(new PlaneGeometry(1, 1), dust, 220);
    this.motes.frustumCulled = false;
    const r = new Rng(`deeps dust ${P.seed ?? P.pts.length}`);
    for (let i = 0; i < 220; i++) this.moteAt.push(new Vector3(r.range(-14, 14), r.range(0, 5), r.range(-14, 14)));
    this.group.add(this.motes);
    // Mist: low in each great chasm, two layers turning slowly; and along each chasm crossed on a bridge, under it.
    const mist = (opacity: number) => {
      const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
      // (Wisps of it, drifting slowly over each other: noise in the world's own frame, its patches thin out to nothing.)
      const at = vec3((positionWorld.x as N).mul(0.11), (positionWorld.z as N).mul(0.11), time.mul(0.035)), n = mx_fractal_noise_float(at, 3, 2, 0.5, 1) as N;
      m.colorNode = smoothNode(0.0, 0.55, n).mul(vec3(0.42, 0.48, 0.58).mul(opacity));
      return m;
    };
    for (const sh of P.shafts.filter((q) => q.abyss)) for (const [dy, o] of [[2.5, 0.35], [7, 0.2]] as const) {
      const plane = new Mesh(new PlaneGeometry(2 * sh.r, 2 * sh.r).rotateX(-Math.PI / 2), mist(o));
      plane.position.set(sh.x, sh.y0 + dy, sh.z);
      this.group.add(plane);
    }
    for (const q of P.pieces.filter((x) => x.kind === 'chasm')) {
      const a = P.pts[q.s0], b = P.pts[q.s1 - 1], mid = Math.floor((q.s0 + q.s1) / 2), long = Math.hypot(b[0] - a[0], b[1] - a[1]) + 4, W = P.wide[mid] * 2;
      const plane = new Mesh(new PlaneGeometry(long, W).rotateX(-Math.PI / 2).rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])), mist(0.3));
      plane.position.set((a[0] + b[0]) / 2, P.floor[mid] - P.drop[mid] + 3, (a[1] + b[1]) / 2);
      this.group.add(plane);
    }
  }

  /** The chests: iron-bound wood, a lid on hinges along its back, turned to face the path. */
  private layChests() {
    const wood = new MeshStandardNodeMaterial({ color: 0x5a3b22, roughness: 0.8 }), band = new MeshStandardNodeMaterial({ color: 0x3b3530, roughness: 0.45, metalness: 0.7 });
    for (const m of [wood, band]) { m.lightsNode = lights([this.shared.lantern, this.shared.fire]); m.emissiveNode = vec3(0.06, 0.04, 0.02); }
    const body = new CylinderGeometry(1, 1, 1, 4).rotateY(Math.PI / 4), lidShape = new CylinderGeometry(0.42, 0.42, 1.0, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.3);
    for (const c of this.plan.chests) {
      const g = new Group(), y = this.floorAt(c.s);
      const box = new Mesh(body, wood); box.scale.set(0.72, 0.55, 0.42); box.position.y = 0.275; box.castShadow = true;
      const strap = new Mesh(body, band); strap.scale.set(0.74, 0.56, 0.44); strap.position.y = 0.275; strap.scale.x = 0.1;
      const lid = new Group(), top = new Mesh(lidShape, wood); top.castShadow = true; lid.add(top); lid.position.set(0, 0.55, -0.3);
      g.add(box, strap, lid);
      g.position.set(c.x, y, c.z);
      g.rotation.y = Math.PI / 2 - c.face;
      this.group.add(g);
      this.chests.push({ lid, opened: false, open: 0, since: -1, at: new Vector3(c.x, y, c.z) });
    }
  }
  /** Each old lift: a platform of planks hung on four chains from a beam over the well, at the foot of the well to begin with. */
  private layLifts() {
    const wood = new MeshStandardNodeMaterial({ color: 0x4a3423, roughness: 0.85 }), chain = new MeshStandardNodeMaterial({ color: 0x3a3836, roughness: 0.5, metalness: 0.6 });
    for (const m of [wood, chain]) { m.lightsNode = lights([this.shared.lantern, this.shared.fire]); m.emissiveNode = vec3(0.05, 0.035, 0.02); }
    for (const l of this.plan.lifts) {
      const g = new Group(), w = 2 * 2.2;
      const deck = new Mesh(new CylinderGeometry(1, 1, 1, 4).rotateY(Math.PI / 4).scale(w * 0.7, 0.18, w * 0.7), wood);
      deck.castShadow = true;
      g.add(deck);
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = new Mesh(new CylinderGeometry(0.03, 0.03, 1, 5).translate(0, 0.5, 0), chain); c.position.set(cx * 1.4, 0, cz * 1.4); c.name = 'chain'; g.add(c); }
      g.position.set(l.x, l.y0, l.z);
      g.rotation.y = -l.turn;
      g.userData.lift = l;
      this.group.add(g);
      this.platforms.push({ mesh: g, at: 0 });
      this.setLift(this.platforms.length - 1, 0);
    }
  }
  /** A lift's platform set `at` of the way up its well (0 at its foot, 1 at its top), its chains reaching up to the beam over the well. */
  setLift(i: number, at: number) {
    const p = this.platforms[i], l = p.mesh.userData.lift as DeepsPlan['lifts'][number], y = l.y0 + (l.y1 - l.y0) * at, top = l.y1 + 4.5;
    p.at = at;
    p.mesh.position.y = y;
    for (const c of p.mesh.children) if (c.name === 'chain') c.scale.y = top - y;
  }

  /**
   * The light at a point facing `n`: the torches' that reach it (not through the rock between, as the line of sight's points within the
   * deeps' open space tell), and the dark's.
   */
  private lightAt(p: Vector3, n: Vector3, into: Color) {
    // (In the dark between the lights, not black but a deep cold blue: the rock seen as the eye comes used to the dark.)
    into.copy(DARK).add(COLD);
    const from = p.clone().addScaledVector(n, 0.3), q = new Vector3();
    for (let i = 0; i < this.flameAt.length; i++) {
      // (A brazier's fire burns brighter and further than a torch: the deeps' halls are far broader than a dungeon's rooms.)
      const t = this.flameAt[i], big = this.plan.torches[i]?.kind === 'brazier', reach = big ? 24 : TORCH_REACH, power = big ? 2.6 : 1, d = t.distanceTo(p);
      if (d > reach) continue;
      const dir = t.clone().sub(p).divideScalar(Math.max(d, 1e-3)), face = Math.max(0, Math.min(1, n.dot(dir) * 0.8 + 0.2));
      if (face <= 0) continue;
      let seen = true;
      for (let i = 1, m = Math.ceil(d / 1.2); i < m && seen; i++) { q.lerpVectors(from, t, i / m); seen = this.spaceAt(q.x, q.y, q.z); }
      if (!seen) continue;
      const k = power * Math.min(2.2, 1.9 / (1 + (d / (big ? 2.2 : 1.3)) ** 2)) * smoothstep((reach - d) / 4) * face;
      into.r += TORCH_LIGHT.r * k; into.g += TORCH_LIGHT.g * k; into.b += TORCH_LIGHT.b * k;
    }
    // (And the crystals' cold light, nearer and fainter.)
    for (const g of this.glows) {
      const d = g.at.distanceTo(p);
      if (d > g.reach) continue;
      const dir = g.at.clone().sub(p).divideScalar(Math.max(d, 1e-3)), face = Math.max(0, Math.min(1, n.dot(dir) * 0.8 + 0.2));
      const k = g.power * face * smoothstep((g.reach - d) / 2) / (1 + (d / 1.6) ** 2);
      into.r += g.color.r * k; into.g += g.color.g * k; into.b += g.color.b * k;
    }
    return into;
  }
  private bake(s: Shape) {
    const p = new Vector3(), n = new Vector3(), c = new Color();
    for (let i = 0; i < s.count; i++) { p.fromArray(s.pos, i * 3); n.fromArray(s.nor, i * 3); this.lightAt(p, n, c); s.light[i * 3] = c.r; s.light[i * 3 + 1] = c.g; s.light[i * 3 + 2] = c.b; }
  }

  // ------------------------------------------------------------------------------------------------------------------- walking them

  /** The floor at `s` along the line (a fraction of the way from one metre to the next): between them, as the line rises or falls. */
  floorAt(s: number): number {
    const P = this.plan, k = Math.max(0, Math.min(P.pts.length - 1, Math.floor(s))), f = s - k;
    if (!this.joined(k) || this.liftPair(k)) return P.floor[k];
    return P.floor[k] + (P.floor[k + 1] - P.floor[k]) * f;
  }
  /** The floor under a point near `s` along the line, `y` high (where it stands, for which turn of a stair it is over). */
  groundAt(x: number, z: number, y: number, s: number): number { const a = this.place(x, z, y, s); return this.floorAt(a.k + Math.max(0, Math.min(1, a.t))); }
  /** Whether the line's `k`th metre and the next are a lift's top and foot (one above the other: not walked from one to the other). */
  private liftPair(k: number): boolean { return this.plan.lifts.some((l) => Math.min(l.top, l.foot) === k); }
  /**
   * Where a point lies along the line, from about `hint` (twelve metres either way): the stretch it is nearest, judged by its height as
   * well (`y`, where it stands), so that on a stair round a shaft it is the turn it is on, not the one over or under it; how far along
   * that stretch (`t`, past its ends where it is beyond the line's), and how far to its left.
   */
  private place(x: number, z: number, y: number, hint: number): { k: number; t: number; lat: number } {
    const P = this.plan;
    let best = Infinity, out = { k: Math.max(0, Math.min(P.pts.length - 2, Math.round(hint))), t: 0, lat: 0 };
    for (const k of this.around(hint, 12)) {
      if (!this.joined(k) || this.liftPair(k)) continue;
      const [ax, az] = P.pts[k], [bx, bz] = P.pts[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      const raw = t;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, pz = az + dz * t, fy = P.floor[k] + (P.floor[k + 1] - P.floor[k]) * t, L = Math.sqrt(L2);
      const lat = (-(x - px) * dz + (z - pz) * dx) / L, d = Math.hypot(x - px, z - pz) + 1.5 * Math.abs(y - fy);
      if (d < best) { best = d; out = { k, t: this.doors.some((o) => (o.out < 0 && k === o.s && raw < 0) || (o.out > 0 && k === o.s - 1 && raw > 1)) ? raw : t, lat }; }
    }
    return out;
  }
  /**
   * A step on foot from (`x0`, `z0`) toward (`x1`, `z1`), `y` high, from about `s` along the line, its body `r` across: where it comes
   * to and how far along the line that is; kept within the breadth that may be walked there and out of the pillars and the fallen stone.
   * Past the line's first metre or its last, out of the deeps (`out`: 0 at the first door, 1 at the second), into the dungeon there.
   */
  walk(x0: number, z0: number, x1: number, z1: number, y: number, s: number, r: number): { x: number; z: number; s: number; out?: number } {
    const P = this.plan;
    if (this.carry) { const l = P.lifts[this.carry.i]; return { x: l.x, z: l.z, s }; }
    // (What may be walked is every stretch of the line about this far along it, at this height, and as far either side of it as may be
    // walked there, its ends rounded: so a corner, a stair's landing, is walked round, not caught on. Of the stretches the step lands in,
    // the one whose line it is nearest; landing in none, put back to the edge of the nearest.)
    let inside: { k: number; t: number; score: number } | null = null, near: { k: number; t: number; px: number; pz: number; d: number; room: number; raw: number } | null = null;
    for (const k of this.around(s, 12)) {
      if (!this.joined(k) || this.liftPair(k)) continue;
      const [ax, az] = P.pts[k], [bx, bz] = P.pts[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, raw = ((x1 - ax) * dx + (z1 - az) * dz) / L2, t = Math.max(0, Math.min(1, raw));
      const fy = P.floor[k] + (P.floor[k + 1] - P.floor[k]) * t;
      if (Math.abs(y - fy) > 2.2) continue;
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x1 - px, z1 - pz), room = Math.max(0.25, P.walk[k] + (P.walk[k + 1] - P.walk[k]) * t - r * 0.5);
      // (Of those it is in, the one whose line it is nearest: in a broad chamber it is in many, and taken as the one nearest where it was
      // along the line, it was never further along at all. The turns of a stair are told apart by their heights, above.)
      const score = d + 0.02 * (this.apart(k, s) + (this.lineAt(s) === this.lineOf[k] ? t : 0));
      if (d <= room && (!inside || score < inside.score)) inside = { k, t, score };
      if (!near || d - room < near.d - near.room) near = { k, t, px, pz, d, room, raw };
    }
    if (!near) return { x: x0, z: z0, s };
    // (Out past a door's metre: into the dungeon there, which door it is said.)
    if (!inside) for (let i = 0; i < this.doors.length; i++) {
      const o = this.doors[i];
      if ((o.out < 0 && near.k === o.s && near.raw < -0.3) || (o.out > 0 && near.k === o.s - 1 && near.raw > 1.3)) return { x: x1, z: z1, s: o.s, out: i };
    }
    let x = x1, z = z1, at = inside ? inside.k + inside.t : near.k + near.t;
    if (!inside) { const u = near.room / Math.max(near.d, 1e-6); x = near.px + (x1 - near.px) * u; z = near.pz + (z1 - near.pz) * u; }
    // (Out of what stands in the way: put back to its edge, along the line from its middle.)
    for (const p of P.posts) {
      if (y < p.y0 - 1 || y > p.y1) continue;
      const ox = x - p.x, oz = z - p.z, d = Math.hypot(ox, oz), need = p.r + r;
      if (d < need) { const u = d > 1e-3 ? need / d : 0; x = u ? p.x + ox * u : x0; z = u ? p.z + oz * u : z0; }
    }
    if (!inside && Math.hypot(x - x0, z - z0) < 1e-4) at = s;
    return { x, z, s: at };
  }

  /** The lift being ridden, if one is: which, from which end to which (0 its foot, 1 its top), and whether it carries one on foot. */
  private carry: { i: number; to: number; with: boolean } | null = null;
  private stood = 0;
  /**
   * The lifts a moment on, `dt`, one on foot at `x`, `z`, `y` (none, `null`): a lift comes to the level of one standing by it, and,
   * stood on for a moment, carries them to its other end. Gives back where the one carried now is (its floor, and how far along the line
   * it will be once off), while it is carried; and what is said of it as it begins to move.
   */
  stepLifts(dt: number, at: { x: number; z: number; y: number } | null): { y: number; s: number; said?: string } | null {
    const P = this.plan;
    if (this.carry) {
      const c = this.carry, l = P.lifts[c.i], p = this.platforms[c.i], span = Math.max(1, l.y1 - l.y0), step = (1.6 * dt) / span;
      const next = c.to > p.at ? Math.min(c.to, p.at + step) : Math.max(c.to, p.at - step);
      this.setLift(c.i, next);
      const y = l.y0 + (l.y1 - l.y0) * next, s = c.to ? l.top : l.foot;
      if (next === c.to) { const was = c.with; this.carry = null; this.stood = 0; return was ? { y, s } : null; }
      return c.with ? { y, s } : null;
    }
    if (!at) return null;
    for (let i = 0; i < P.lifts.length; i++) {
      const l = P.lifts[i], d = Math.hypot(at.x - l.x, at.z - l.z);
      if (d > 3) continue;
      const level = Math.abs(at.y - l.y1) < Math.abs(at.y - l.y0) ? 1 : 0, p = this.platforms[i];
      // (Not where one stands: called to it.)
      if (Math.abs(p.at - level) > 1e-3) { this.carry = { i, to: level, with: false }; return null; }
      if (d < 1.2) { this.stood += dt; if (this.stood > 0.6) { this.carry = { i, to: 1 - level, with: true }; return { y: at.y, s: level ? l.top : l.foot, said: level ? 'The lift goes down' : 'The lift goes up' }; } }
      else this.stood = 0;
    }
    return null;
  }
  /** Whether one on foot is being carried by a lift now. */
  get carrying(): boolean { return !!this.carry?.with; }
  /** The metre of the line nearest a point (and, `y` given, at about its height), anywhere along it. */
  nearS(x: number, z: number, y?: number): number {
    const P = this.plan;
    let best = Infinity, at = 0;
    for (const k of this.near(x, z)) { const d = Math.hypot(x - P.pts[k][0], z - P.pts[k][1]) + (y === undefined ? 0 : 1.5 * Math.abs(y - P.floor[k])); if (d < best) { best = d; at = k; } }
    return at;
  }
  /** For a foe at `p` making its way to `to`: which way it goes (level, of length one), straight at it once near along the line, else on along the line toward it. */
  wayToward(p: Vector3, to: Vector3): Vector3 {
    const P = this.plan, a = this.nearS(p.x, p.z, p.y), b = this.nearS(to.x, to.z, to.y);
    let tx = to.x, tz = to.z;
    // (Three metres on toward it along the lines, out of a side way or into one as the way to it goes.)
    if (this.apart(a, b) > 3) { let k = a; for (let i = 0; i < 3; i++) k = this.nextTo(k).reduce((m, n) => (this.apart(n, b) < this.apart(m, b) ? n : m), k); tx = P.pts[k][0]; tz = P.pts[k][1]; }
    const d = Math.hypot(tx - p.x, tz - p.z) || 1;
    return new Vector3((tx - p.x) / d, 0, (tz - p.z) / d);
  }
  /** A step for a foe, as `walk` takes one on foot, from wherever along the line it is (about `y` high, if told). */
  walkFree(x: number, z: number, tx: number, tz: number, r: number, y?: number): [number, number] {
    const s = this.nearS(x, z, y), w = this.walk(x, z, tx, tz, y ?? this.plan.floor[s], s, r);
    return w.out === undefined ? [w.x, w.z] : [x, z];
  }
  /** The floor a foe stands on (about `y` high, if told). */
  floorFree(x: number, z: number, y?: number): number { const s = this.nearS(x, z, y); return this.groundAt(x, z, y ?? this.plan.floor[s], s); }
  /** How many have come out of each den so far: each lets out as many packs as its size, and then is empty. */
  private denLeft: number[] | null = null;
  /**
   * Where foes may come from, for one at `from` (at the line's metre `s`): a den not yet empty within some thirty-five metres along the
   * line, and nine away at least, out of its sight if one is; none if there is no such den.
   */
  denSpawn(rng: Rng, from: Vector3, s: number): Vector3 | null {
    const P = this.plan, left = (this.denLeft ??= P.dens.map((d) => d.size));
    const ok = P.dens.map((d, i) => i).filter((i) => {
      const d = P.dens[i];
      return left[i] > 0 && this.apart(d.s, s) < 35 && Math.hypot(d.x - from.x, d.z - from.z) > 9;
    });
    if (!ok.length) return null;
    const hid = ok.filter((i) => !this.sees(new Vector3(P.dens[i].x, P.floor[P.dens[i].s] + 1.2, P.dens[i].z), from.clone().setY(from.y + 1.6)));
    const i = rng.pick(hid.length ? hid : ok);
    left[i]--;
    return new Vector3(P.dens[i].x, P.floor[P.dens[i].s], P.dens[i].z);
  }
  /** Whether a point is in sight of another: nothing but the deeps' open space between. */
  sees(a: Vector3, b: Vector3): boolean {
    const q = new Vector3(), n = Math.ceil(a.distanceTo(b) / 1.5);
    for (let i = 1; i < n; i++) { q.lerpVectors(a, b, i / n); if (!this.spaceAt(q.x, q.y, q.z)) return false; }
    return true;
  }
  /** The chests: each its body and its lid, and whether it is opened (and how far its lid is thrown back). */
  readonly chests: { lid: Group; opened: boolean; open: number; since: number; at: Vector3 }[] = [];
  /** A chest opened: its lid thrown back over a second (`update`). */
  openChest(i: number) { this.chests[i].opened = true; }
  /** As they were for a new run: the chests shut and the dens full again. */
  restock() {
    for (const c of this.chests) { c.opened = false; c.open = 0; c.since = -1; c.lid.rotation.x = 0; }
    this.denLeft = null;
    this.seen.fill(0);
  }
  /** As far as it is seen from `s` along the line, either way: so far as the map has it. */
  see(s: number, far = 24) {
    // (Along the lines either way, and as far into a side way leaving near: its mouth seen, as it is passed.)
    for (const k of this.around(s, far)) this.seen[k] = 1;
  }

  /** The piece at `s` along the line, and its name (none for a passage between). */
  pieceAt(s: number): Piece | undefined { return this.plan.pieces.find((q) => s >= q.s0 && s < q.s1); }

  // --------------------------------------------------------------------------------------------------------------------- each frame

  /** A frame on: the flames turned to the eye (`eye`, in the land's frame) and flickering. */
  update(seconds: number, eye: Vector3, at?: Vector3) {
    this.stepAir(seconds, eye, at);
    // (A chest's lid thrown back over most of a second from the frame it is opened in.)
    for (const c of this.chests) if (c.opened && c.open < 1) { if (c.since < 0) c.since = seconds; c.open = Math.min(1, (seconds - c.since) / 0.9); c.lid.rotation.x = -1.85 * smoothstep(c.open); }
    this.flicker.value = 0.92 + 0.08 * Math.sin(seconds * 9.1) * Math.sin(seconds * 3.7 + 1);
    const q = new Quaternion(), s = new Vector3();
    this.flameAt.forEach((f, i) => {
      q.setFromAxisAngle(UP, Math.atan2(eye.x - f.x, eye.z - f.z));
      const h = 0.55 + 0.12 * Math.sin(seconds * 13 + i * 2.3);
      s.set(0.32, h, 0.32);
      this.flames.setMatrixAt(i, this.m4.compose(f, q, s));
    });
    this.flames.count = this.flameAt.length;
    this.flames.instanceMatrix.needsUpdate = true;
  }

  /** The embers and the dust a moment on, each turned to the eye. */
  private stepAir(seconds: number, eye: Vector3, at?: Vector3) {
    const q = new Quaternion(), s = new Vector3(), p = new Vector3(), look = (x: number, z: number) => q.setFromAxisAngle(UP, Math.atan2(eye.x - x, eye.z - z));
    if (this.embers) {
      const { mesh, from } = this.embers;
      from.forEach((f, b) => {
        for (let i = 0; i < 8; i++) {
          const t = (seconds * 0.45 + i / 8 + b * 0.137) % 1, sway = Math.sin(seconds * 2.3 + i * 1.7 + b) * 0.25 * t;
          p.set(f.x + sway + Math.sin(i * 2.4) * 0.15, f.y + t * 2.6, f.z + Math.cos(seconds * 1.9 + i) * 0.2 * t);
          s.setScalar(0.07 * (1 - t));
          mesh.setMatrixAt(b * 8 + i, this.m4.compose(p, look(p.x, p.z), s));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.motes && at) {
      this.moteAt.forEach((m, i) => {
        // (Hanging about the one on foot, wrapped round within fourteen metres of it, drifting.)
        const wrapTo = (v: number, c: number) => c + ((((v - c + 14) % 28) + 28) % 28) - 14;
        p.set(wrapTo(m.x + Math.sin(seconds * 0.1 + i) * 0.6, at.x), at.y + m.y + Math.sin(seconds * 0.23 + i * 0.7) * 0.3, wrapTo(m.z + Math.cos(seconds * 0.08 + i * 1.3) * 0.6, at.z));
        s.setScalar(0.05 + 0.03 * Math.sin(i * 3.1));
        this.motes!.setMatrixAt(i, this.m4.compose(p, look(p.x, p.z), s));
      });
      this.motes.instanceMatrix.needsUpdate = true;
      this.motes.visible = true;
    } else if (this.motes) this.motes.visible = false;
  }

  /** Lets go of what it made. */
  dispose() {
    this.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); } });
  }
}
