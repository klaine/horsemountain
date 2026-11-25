/**
 * What stands about in the dungeon (`slopeDungeon.ts`), made here (asked: "create all the props that might be needed by the
 * generator"): each prop a few simple shapes put together, standing on the floor at its origin, its front toward +z, in metres; each
 * part of it of one stuff (`Stuff`: wood, iron, stone and so on) and tinted. A room's props are laid with `Props.put`, and drawn with
 * one instanced mesh to each prop and stuff (`Props.parts`), lit as the dungeon's stone is by the light where each stands.
 */
import {
  BoxGeometry, BufferAttribute, type BufferGeometry, Color, Euler, CylinderGeometry, DodecahedronGeometry, IcosahedronGeometry, LatheGeometry, Matrix4, PlaneGeometry,
  Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../src/core/rng';

/** What a part is made of: each drawn with its own material. */
export type Stuff = 'wood' | 'iron' | 'stone' | 'bone' | 'gold' | 'cloth' | 'wax' | 'straw' | 'clay' | 'coal' | 'fungus';
export const STUFFS: Stuff[] = ['wood', 'iron', 'stone', 'bone', 'gold', 'cloth', 'wax', 'straw', 'clay', 'coal', 'fungus'];

export type PropKind =
  | 'barrel' | 'crate' | 'sack' | 'table' | 'desk' | 'stool' | 'bench' | 'bookcase' | 'books' | 'scroll' | 'candlestick' | 'candelabrum'
  | 'altar' | 'statue' | 'sarcophagus' | 'dais' | 'urn' | 'brazier' | 'skull' | 'bones' | 'skeleton' | 'rubble' | 'shackles' | 'bedroll'
  | 'bucket' | 'weaponRack' | 'goldHeap' | 'coins' | 'banner' | 'cobweb'
  // (More, asked: "create plenty of new possible nice props".) A smithy's and a mine's:
  | 'anvil' | 'grindstone' | 'workbench' | 'toolRack' | 'pickaxe' | 'mineCart' | 'rails' | 'orePile' | 'ladder' | 'scaffold'
  // water and old stone:
  | 'well' | 'trough' | 'basin' | 'throne' | 'brokenColumn' | 'stoneHead' | 'obelisk' | 'runestone' | 'tombSlab'
  // the dead, and what lives in the dark:
  | 'coffin' | 'ribcage' | 'skullPile' | 'eggSacs' | 'mushrooms' | 'moss'
  // a household's:
  | 'cauldron' | 'cookingFire' | 'firewood' | 'jarShelf' | 'amphora' | 'pots' | 'wineRack' | 'rug' | 'tapestry' | 'tent' | 'lectern' | 'alchemyTable'
  // arms, light, and riches:
  | 'shield' | 'armorStand' | 'spearBundle' | 'hangingCage' | 'chain' | 'standingTorch' | 'lantern' | 'idol' | 'gemPile';

/** A part of a prop: its shape (placed in the prop's frame), its stuff, and its tint. */
interface Part { g: BufferGeometry; stuff: Stuff; tint: Color }
/** A prop: its parts, and how far out from its middle it is in the way of one walking (none, if it is not). */
interface Model { parts: Part[]; r: number }

const C = (hex: number) => new Color(hex);
/** A shape moved, turned (about x, y, z, in that order) and scaled into its place in a prop. */
const placed = (g: BufferGeometry, at: [number, number, number], turn: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) =>
  g.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...turn)), new Vector3(...scale)));
const part = (g: BufferGeometry, stuff: Stuff, tint = 0xffffff): Part => ({ g, stuff, tint: C(tint) });
/** A turned shape (a barrel's staves, an urn) from its outline, radius against height. */
const lathe = (outline: [number, number][], sides = 14) => new LatheGeometry(outline.map(([r, y]) => new Vector2(r, y)), sides);

/** Each prop, made once. */
const MODELS: Record<PropKind, () => Model> = {
  barrel: () => {
    const out: [number, number][] = [[0, 0], [0.27, 0], [0.31, 0.2], [0.33, 0.43], [0.31, 0.66], [0.27, 0.86], [0, 0.86]];
    const parts = [part(lathe(out, 16), 'wood', 0xa07a58)];
    for (const y of [0.1, 0.3, 0.56, 0.76]) parts.push(part(placed(new TorusGeometry(y > 0.2 && y < 0.7 ? 0.33 : 0.3, 0.012, 4, 20), [0, y, 0], [Math.PI / 2, 0, 0]), 'iron'));
    return { parts, r: 0.38 };
  },
  crate: () => {
    const parts = [part(placed(new BoxGeometry(0.76, 0.7, 0.76), [0, 0.35, 0]), 'wood', 0xb08a64)];
    // (Battens along its edges and across its faces, darker.)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(placed(new BoxGeometry(0.07, 0.72, 0.07), [x * 0.36, 0.35, z * 0.36]), 'wood', 0x6e5038));
    for (const s of [-1, 1]) { parts.push(part(placed(new BoxGeometry(0.78, 0.06, 0.04), [0, 0.35, s * 0.385], [0, 0, s * 0.72]), 'wood', 0x6e5038)); parts.push(part(placed(new BoxGeometry(0.04, 0.06, 0.78), [s * 0.385, 0.35, 0], [s * 0.72, 0, 0]), 'wood', 0x6e5038)); }
    return { parts, r: 0.45 };
  },
  sack: () => ({ parts: [part(placed(new IcosahedronGeometry(0.3, 2), [0, 0.28, 0], [0, 0, 0], [1, 0.95, 0.85]), 'cloth', 0x9a8460), part(placed(new CylinderGeometry(0.06, 0.1, 0.14, 8), [0, 0.6, 0]), 'cloth', 0x8a7452)], r: 0.32 }),
  table: () => {
    const parts = [part(placed(new BoxGeometry(1.7, 0.07, 0.9), [0, 0.78, 0]), 'wood', 0x9a7452)];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(placed(new BoxGeometry(0.08, 0.76, 0.08), [x * 0.74, 0.38, z * 0.36]), 'wood', 0x7a5a40));
    parts.push(part(placed(new BoxGeometry(1.4, 0.06, 0.05), [0, 0.22, 0]), 'wood', 0x7a5a40));
    return { parts, r: 0.95 };
  },
  desk: () => {
    const parts = [part(placed(new BoxGeometry(1.8, 0.08, 0.85), [0, 0.8, 0]), 'wood', 0x7e5a3c)];
    // (Drawers either side, panelled, an iron pull on each.)
    for (const s of [-1, 1]) {
      parts.push(part(placed(new BoxGeometry(0.5, 0.76, 0.8), [s * 0.62, 0.38, 0]), 'wood', 0x6a4a30));
      for (const y of [0.2, 0.55]) parts.push(part(placed(new BoxGeometry(0.06, 0.03, 0.03), [s * 0.62, y, 0.415]), 'iron'));
    }
    parts.push(part(placed(new BoxGeometry(0.7, 0.5, 0.04), [0, 0.5, -0.38]), 'wood', 0x5e4028));
    return { parts, r: 1.0 };
  },
  stool: () => {
    const parts = [part(placed(new CylinderGeometry(0.2, 0.2, 0.05, 12), [0, 0.46, 0]), 'wood', 0x9a7452)];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; parts.push(part(placed(new CylinderGeometry(0.022, 0.028, 0.47, 6), [0.12 * Math.cos(a), 0.22, 0.12 * Math.sin(a)], [0.18 * Math.sin(a), 0, -0.18 * Math.cos(a)]), 'wood', 0x7a5a40)); }
    return { parts, r: 0.28 };
  },
  bench: () => {
    const parts = [part(placed(new BoxGeometry(1.8, 0.06, 0.36), [0, 0.45, 0]), 'wood', 0x8a6446)];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.06, 0.44, 0.32), [s * 0.75, 0.22, 0]), 'wood', 0x6e5038));
    return { parts, r: 0.5 };
  },
  bookcase: () => {
    // A case against a wall (its back at -z): sides, back, shelves, and on each shelf a row of books of their own heights and colours.
    const parts = [part(placed(new BoxGeometry(1.3, 0.04, 0.4), [0, 2.28, 0]), 'wood', 0x5e4028), part(placed(new BoxGeometry(1.3, 2.3, 0.03), [0, 1.15, -0.19]), 'wood', 0x4a3220)];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.05, 2.3, 0.42), [s * 0.64, 1.15, 0]), 'wood', 0x5e4028));
    const rng = new Rng('bookcase'), tints = [0x7a2a22, 0x2a4a6a, 0x3a5a2a, 0x6a4a22, 0x4a2a4a, 0x8a6a3a, 0x2a2a2a];
    for (const y of [0.06, 0.62, 1.18, 1.74]) {
      parts.push(part(placed(new BoxGeometry(1.24, 0.03, 0.38), [0, y, 0]), 'wood', 0x5e4028));
      for (let x = -0.58; x < 0.56;) {
        const w = rng.range(0.035, 0.08), h = rng.range(0.28, 0.46), gone = rng.chance(0.12);
        if (!gone) parts.push(part(placed(new BoxGeometry(w * 0.92, h, rng.range(0.22, 0.3)), [x + w / 2, y + 0.015 + h / 2, 0.02], [0, 0, rng.chance(0.08) ? 0.25 : 0]), 'cloth', rng.pick(tints)));
        x += gone ? w * 2 : w;
      }
    }
    return { parts, r: 0.5 };
  },
  books: () => {
    const rng = new Rng('books'), parts: Part[] = [];
    let y = 0;
    for (let i = 0; i < 4; i++) { const h = rng.range(0.04, 0.07); parts.push(part(placed(new BoxGeometry(rng.range(0.2, 0.3), h, rng.range(0.15, 0.22)), [rng.range(-0.02, 0.02), y + h / 2, 0], [0, rng.range(-0.4, 0.4), 0]), 'cloth', rng.pick([0x7a2a22, 0x2a4a6a, 0x3a5a2a, 0x6a4a22]))); y += h; }
    return { parts, r: 0 };
  },
  scroll: () => ({ parts: [part(placed(new CylinderGeometry(0.03, 0.03, 0.32, 8), [0, 0.03, 0], [0, 0, Math.PI / 2]), 'cloth', 0xd8c8a0), part(placed(new PlaneGeometry(0.3, 0.22), [0, 0.002, 0.13], [-Math.PI / 2, 0, 0]), 'cloth', 0xd8c8a0)], r: 0 }),
  candlestick: () => ({ parts: [part(lathe([[0, 0], [0.06, 0], [0.06, 0.015], [0.02, 0.03], [0.015, 0.12], [0.035, 0.13], [0, 0.135]], 10), 'iron'), part(placed(new CylinderGeometry(0.018, 0.02, 0.14, 8), [0, 0.2, 0]), 'wax', 0xeee2c4)], r: 0 }),
  candelabrum: () => {
    const parts = [part(lathe([[0, 0], [0.16, 0], [0.16, 0.03], [0.04, 0.06], [0.025, 1.2], [0, 1.2]], 12), 'iron')];
    for (const x of [-0.22, 0, 0.22]) {
      if (x) parts.push(part(placed(new BoxGeometry(0.22, 0.02, 0.02), [x / 2, 1.16, 0]), 'iron'));
      parts.push(part(placed(new CylinderGeometry(0.03, 0.025, 0.04, 8), [x, 1.2, 0]), 'iron'), part(placed(new CylinderGeometry(0.02, 0.022, 0.16, 8), [x, 1.3, 0]), 'wax', 0xeee2c4));
    }
    return { parts, r: 0.3 };
  },
  altar: () => ({
    parts: [
      part(placed(new BoxGeometry(1.8, 0.86, 0.85), [0, 0.43, 0]), 'stone'),
      part(placed(new BoxGeometry(2.0, 0.12, 1.0), [0, 0.92, 0]), 'stone', 0xc8c0b0),
      // (A cloth over its top, hanging down its front.)
      part(placed(new BoxGeometry(0.7, 0.015, 1.02), [0, 0.985, 0]), 'cloth', 0x7a1e1e),
      part(placed(new BoxGeometry(0.7, 0.55, 0.015), [0, 0.71, 0.51]), 'cloth', 0x7a1e1e),
      part(placed(new BoxGeometry(0.66, 0.04, 0.02), [0, 0.47, 0.515]), 'gold'),
    ],
    r: 1.0,
  }),
  statue: () => ({
    parts: [
      part(placed(new BoxGeometry(0.95, 0.6, 0.95), [0, 0.3, 0]), 'stone', 0xb8b0a4),
      part(placed(new BoxGeometry(1.05, 0.08, 1.05), [0, 0.62, 0]), 'stone', 0xb8b0a4),
      // A robed figure, hooded, its head bowed and its hands together before it on a sword's hilt.
      part(lathe([[0, 0], [0.44, 0], [0.4, 0.4], [0.3, 1.1], [0.26, 1.5], [0.3, 1.62], [0.16, 1.72], [0, 1.74]], 14).translate(0, 0.66, 0), 'stone', 0xc0b8aa),
      part(placed(new SphereGeometry(0.17, 12, 10), [0, 2.48, 0.05], [0, 0, 0], [0.95, 1.1, 1]), 'stone', 0xc0b8aa),
      part(placed(new SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), [0, 2.46, -0.02], [-0.3, 0, 0], [1, 1.15, 1.1]), 'stone', 0xb0a89a),
      part(placed(new BoxGeometry(0.07, 0.9, 0.03), [0, 1.55, 0.36], [-0.12, 0, 0]), 'stone', 0xa8a092),
      part(placed(new BoxGeometry(0.3, 0.05, 0.05), [0, 2.0, 0.31]), 'stone', 0xa8a092),
      part(placed(new SphereGeometry(0.09, 8, 6), [0, 2.08, 0.3]), 'stone', 0xc0b8aa),
    ],
    r: 0.62,
  }),
  sarcophagus: () => ({
    parts: [
      part(placed(new BoxGeometry(0.95, 0.78, 2.15), [0, 0.39, 0]), 'stone'),
      part(placed(new BoxGeometry(1.05, 0.1, 2.25), [0, 0.06, 0]), 'stone', 0xa8a092),
      part(placed(new BoxGeometry(1.02, 0.12, 2.22), [0, 0.84, 0]), 'stone', 0xc8c0b0),
      // (Its lid carved with who lies in it: a figure laid out, its hands on its breast.)
      part(placed(new BoxGeometry(0.42, 0.14, 1.5), [0, 0.95, -0.1]), 'stone', 0xc8c0b0),
      part(placed(new SphereGeometry(0.14, 10, 8), [0, 0.98, 0.78], [0, 0, 0], [1, 0.7, 1]), 'stone', 0xc8c0b0),
      part(placed(new BoxGeometry(0.06, 0.04, 0.5), [0, 1.05, 0.1]), 'stone', 0xb0a89a),
    ],
    r: 0.6,
  }),
  dais: () => ({ parts: [part(placed(new BoxGeometry(2.6, 0.18, 3.2), [0, 0.09, 0]), 'stone', 0xa8a092), part(placed(new BoxGeometry(2.3, 0.17, 2.9), [0, 0.255, 0]), 'stone', 0xb8b0a4)], r: 0 }),
  urn: () => ({ parts: [part(lathe([[0, 0], [0.12, 0], [0.2, 0.12], [0.22, 0.3], [0.16, 0.48], [0.1, 0.54], [0.13, 0.6], [0, 0.6]], 14), 'clay', 0x9a5a3a), part(placed(new TorusGeometry(0.21, 0.012, 4, 18), [0, 0.3, 0], [Math.PI / 2, 0, 0]), 'gold')], r: 0.28 }),
  brazier: () => {
    const parts = [part(lathe([[0, 0.7], [0.32, 0.86], [0.36, 0.98], [0.34, 1.0], [0.2, 0.9], [0, 0.88]], 14), 'iron'), part(placed(new IcosahedronGeometry(0.26, 1), [0, 0.94, 0], [0, 0, 0], [1, 0.35, 1]), 'coal')];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; parts.push(part(placed(new CylinderGeometry(0.02, 0.025, 0.95, 6), [0.2 * Math.cos(a), 0.44, 0.2 * Math.sin(a)], [0.2 * Math.sin(a), 0, -0.2 * Math.cos(a)]), 'iron')); }
    return { parts, r: 0.42 };
  },
  skull: () => ({ parts: [part(placed(new SphereGeometry(0.1, 10, 8), [0, 0.1, 0], [0, 0, 0], [0.9, 0.95, 1.15]), 'bone'), part(placed(new BoxGeometry(0.11, 0.05, 0.08), [0, 0.03, 0.06]), 'bone', 0xc8bea6)], r: 0 }),
  bones: () => {
    const bone = (len: number, at: [number, number, number], yaw: number) => [
      part(placed(new CylinderGeometry(0.018, 0.022, len, 6), at, [Math.PI / 2, yaw, 0]), 'bone'),
      ...[-1, 1].map((s) => part(placed(new SphereGeometry(0.032, 6, 4), [at[0] + Math.sin(yaw) * s * len / 2, at[1], at[2] + Math.cos(yaw) * s * len / 2]), 'bone')),
    ];
    return { parts: [...bone(0.42, [0, 0.03, 0], 0.3), ...bone(0.3, [0.1, 0.03, 0.05], 1.7), ...bone(0.36, [-0.08, 0.07, -0.02], -0.9)], r: 0 };
  },
  skeleton: () => {
    // Laid on its back, as it fell: the skull, the spine and ribs, the pelvis, its arms and legs a little apart.
    const parts: Part[] = [part(placed(new SphereGeometry(0.1, 10, 8), [0, 0.09, 0.78], [0, 0, 0], [0.9, 0.95, 1.1]), 'bone')];
    parts.push(part(placed(new CylinderGeometry(0.02, 0.02, 0.62, 6), [0, 0.05, 0.38], [Math.PI / 2, 0, 0]), 'bone'));
    for (let i = 0; i < 6; i++) parts.push(part(placed(new TorusGeometry(0.13 - i * 0.008, 0.012, 4, 10, Math.PI), [0, 0.05, 0.6 - i * 0.055], [0, 0, 0], [1, 0.55, 1]), 'bone'));
    parts.push(part(placed(new TorusGeometry(0.11, 0.025, 4, 10), [0, 0.05, 0.05], [Math.PI / 2, 0, 0], [1, 0.7, 1]), 'bone'));
    for (const s of [-1, 1]) {
      parts.push(part(placed(new CylinderGeometry(0.02, 0.018, 0.55, 6), [s * 0.28, 0.04, 0.42], [Math.PI / 2, 0, s * 0.3]), 'bone'));
      parts.push(part(placed(new CylinderGeometry(0.024, 0.02, 0.8, 6), [s * 0.12, 0.04, -0.38], [Math.PI / 2, 0, s * 0.12]), 'bone'));
    }
    return { parts, r: 0 };
  },
  rubble: () => ({ parts: [part(placed(new DodecahedronGeometry(0.2, 0), [0, 0.08, 0], [0.4, 0.7, 0], [1, 0.6, 1]), 'stone', 0x8a847a), part(placed(new DodecahedronGeometry(0.12, 0), [0.22, 0.05, 0.08], [0, 1.2, 0.5], [1, 0.7, 1]), 'stone', 0x8a847a)], r: 0 }),
  shackles: () => {
    // On a wall (its back at -z): an iron ring set in the stone, a chain of links hanging from it, and the cuffs at its end.
    const parts = [part(placed(new BoxGeometry(0.12, 0.12, 0.04), [0, 1.6, 0]), 'iron'), part(placed(new TorusGeometry(0.05, 0.01, 4, 10), [0, 1.53, 0.03]), 'iron')];
    for (let i = 0; i < 9; i++) parts.push(part(placed(new TorusGeometry(0.03, 0.008, 4, 8), [0, 1.46 - i * 0.05, 0.035], [0, i % 2 ? Math.PI / 2 : 0, 0], [1, 1.3, 1]), 'iron'));
    for (const s of [-1, 1]) parts.push(part(placed(new TorusGeometry(0.05, 0.014, 4, 12), [s * 0.06, 0.98, 0.04], [Math.PI / 2, 0, 0]), 'iron'));
    return { parts, r: 0 };
  },
  bedroll: () => ({ parts: [part(placed(new BoxGeometry(0.85, 0.12, 1.9), [0, 0.06, 0], [0, 0, 0]), 'straw', 0xb89a5a), part(placed(new CylinderGeometry(0.12, 0.12, 0.8, 10), [0, 0.12, -0.8], [0, 0, Math.PI / 2]), 'cloth', 0x6a5a48)], r: 0.45 }),
  bucket: () => ({ parts: [part(lathe([[0, 0], [0.13, 0], [0.16, 0.3], [0.15, 0.3], [0.12, 0.02], [0, 0.02]], 12), 'wood', 0x8a6a4a), part(placed(new TorusGeometry(0.15, 0.008, 4, 16), [0, 0.25, 0], [Math.PI / 2, 0, 0]), 'iron'), part(placed(new TorusGeometry(0.16, 0.006, 4, 16, Math.PI), [0, 0.3, 0]), 'iron')], r: 0.2 }),
  weaponRack: () => {
    // Against a wall (its back at -z): two posts and two bars, spears and a shield leant in it.
    const parts: Part[] = [];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.07, 1.7, 0.07), [s * 0.7, 0.85, -0.12]), 'wood', 0x6e5038));
    for (const y of [0.3, 1.4]) parts.push(part(placed(new BoxGeometry(1.48, 0.06, 0.06), [0, y, -0.1]), 'wood', 0x6e5038));
    for (const x of [-0.45, -0.15, 0.15, 0.45]) {
      parts.push(part(placed(new CylinderGeometry(0.016, 0.016, 2.0, 6), [x, 1.0, 0], [-0.08, 0, 0]), 'wood', 0x8a6a4a));
      parts.push(part(placed(new CylinderGeometry(0, 0.04, 0.22, 6), [x, 2.1, 0.08], [-0.08, 0, 0]), 'iron'));
    }
    parts.push(part(placed(new CylinderGeometry(0.32, 0.32, 0.04, 16), [0.3, 0.5, 0.12], [Math.PI / 2 - 0.2, 0, 0]), 'wood', 0x6a3a28), part(placed(new SphereGeometry(0.07, 8, 6), [0.3, 0.5, 0.17]), 'iron'));
    return { parts, r: 0.45 };
  },
  goldHeap: () => {
    const rng = new Rng('gold heap'), parts = [part(placed(new SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0, 0], [0, 0, 0], [1.1, 0.42, 1]), 'gold')];
    for (let i = 0; i < 14; i++) { const a = rng.range(0, 6.3), d = rng.range(0.45, 0.8); parts.push(part(placed(new CylinderGeometry(0.035, 0.035, 0.008, 9), [Math.sin(a) * d, 0.006, Math.cos(a) * d], [rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)]), 'gold')); }
    parts.push(part(placed(new BoxGeometry(0.14, 0.3, 0.02), [0.12, 0.25, 0.02], [0.1, 0.3, -0.5]), 'gold', 0xe0b850), part(placed(new SphereGeometry(0.07, 8, 6), [-0.18, 0.2, 0.15]), 'gold'));
    return { parts, r: 0.6 };
  },
  coins: () => {
    const rng = new Rng('coins'), parts: Part[] = [];
    for (let i = 0; i < 9; i++) { const a = rng.range(0, 6.3), d = rng.range(0, 0.18); parts.push(part(placed(new CylinderGeometry(0.035, 0.035, 0.008, 9), [Math.sin(a) * d, 0.005 + i * 0.006, Math.cos(a) * d], [rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)]), 'gold')); }
    return { parts, r: 0 };
  },
  banner: () => {
    // On a wall (its back at -z): a rod, and a long cloth hanging from it, a gold device on it and a fringe at its foot.
    return {
      parts: [
        part(placed(new CylinderGeometry(0.025, 0.025, 1.2, 8), [0, 3.4, 0.08], [0, 0, Math.PI / 2]), 'wood', 0x5e4028),
        part(placed(new BoxGeometry(1.0, 2.2, 0.02), [0, 2.3, 0.07]), 'cloth', 0x6a1a22),
        part(placed(new BoxGeometry(0.4, 0.4, 0.024), [0, 2.6, 0.07], [0, 0, Math.PI / 4]), 'gold', 0xd8a840),
        part(placed(new BoxGeometry(1.0, 0.08, 0.024), [0, 1.22, 0.07]), 'gold', 0xd8a840),
      ],
      r: 0,
    };
  },
  cobweb: () => ({ parts: [part(placed(new PlaneGeometry(0.9, 0.9), [0, 0, 0], [0, Math.PI / 4, 0]), 'cloth', 0xcfcfd4)], r: 0 }),
  // ------------------------------------------------------------------------------------------- a smithy's and a mine's
  anvil: () => ({
    parts: [
      part(lathe([[0, 0], [0.3, 0], [0.28, 0.42], [0.3, 0.45], [0, 0.45]], 12), 'wood', 0x7a5a3c),
      part(placed(new BoxGeometry(0.34, 0.12, 0.26), [0, 0.51, 0]), 'iron', 0x3a3a3e),
      part(placed(new BoxGeometry(0.2, 0.14, 0.18), [0, 0.64, 0]), 'iron', 0x3a3a3e),
      part(placed(new BoxGeometry(0.56, 0.12, 0.22), [0, 0.77, 0]), 'iron', 0x45454a),
      part(placed(new CylinderGeometry(0, 0.08, 0.26, 8), [0.4, 0.78, 0], [0, 0, -Math.PI / 2], [1, 1, 0.8]), 'iron', 0x45454a),
      // (A hammer left on it.)
      part(placed(new CylinderGeometry(0.015, 0.015, 0.34, 6), [-0.05, 0.86, 0.04], [0, 0.4, Math.PI / 2]), 'wood', 0x8a6a4a),
      part(placed(new BoxGeometry(0.06, 0.06, 0.12), [-0.2, 0.86, -0.02], [0, 0.4, 0]), 'iron'),
    ],
    r: 0.38,
  }),
  grindstone: () => {
    const parts = [part(placed(new CylinderGeometry(0.36, 0.36, 0.1, 18), [0, 0.6, 0], [0, 0, Math.PI / 2]), 'stone', 0x9a948a), part(placed(new CylinderGeometry(0.025, 0.025, 0.7, 6), [0, 0.6, 0], [0, 0, Math.PI / 2]), 'iron')];
    for (const s of [-1, 1]) { parts.push(part(placed(new BoxGeometry(0.06, 0.68, 0.1), [s * 0.22, 0.34, 0]), 'wood', 0x6e5038)); parts.push(part(placed(new BoxGeometry(0.06, 0.06, 0.5), [s * 0.22, 0.05, 0]), 'wood', 0x6e5038)); }
    parts.push(part(placed(new BoxGeometry(0.03, 0.18, 0.03), [0.36, 0.52, 0]), 'wood', 0x8a6a4a), part(lathe([[0, 0], [0.18, 0], [0.2, 0.12], [0, 0.12]], 10).translate(0, 0, 0.38), 'wood', 0x7a5a3c));
    return { parts, r: 0.45 };
  },
  workbench: () => {
    const parts = [part(placed(new BoxGeometry(1.7, 0.1, 0.7), [0, 0.86, 0]), 'wood', 0x8a6446), part(placed(new BoxGeometry(1.5, 0.05, 0.55), [0, 0.22, 0]), 'wood', 0x6e5038)];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(placed(new BoxGeometry(0.09, 0.82, 0.09), [x * 0.76, 0.41, z * 0.29]), 'wood', 0x6e5038));
    // (Tools on it: tongs, a chisel, a mallet; a vice at one end; shavings.)
    parts.push(part(placed(new BoxGeometry(0.4, 0.02, 0.03), [-0.3, 0.92, 0.05], [0, 0.3, 0]), 'iron'), part(placed(new BoxGeometry(0.4, 0.02, 0.03), [-0.3, 0.92, 0.1], [0, 0.2, 0]), 'iron'));
    parts.push(part(placed(new CylinderGeometry(0.06, 0.06, 0.16, 8), [0.3, 0.97, 0.05], [0, 0, Math.PI / 2]), 'wood', 0xa07a58), part(placed(new CylinderGeometry(0.015, 0.015, 0.3, 6), [0.3, 0.93, 0.18], [Math.PI / 2, 0, 0]), 'wood', 0x8a6a4a));
    parts.push(part(placed(new BoxGeometry(0.14, 0.16, 0.12), [0.76, 0.98, 0.2]), 'iron', 0x3a3a3e));
    for (let i = 0; i < 5; i++) parts.push(part(placed(new TorusGeometry(0.03, 0.006, 3, 8), [0.1 + i * 0.06, 0.915, -0.15 + (i % 2) * 0.05], [Math.PI / 2, 0, 0]), 'straw', 0xd8b880));
    return { parts, r: 0.95 };
  },
  toolRack: () => {
    // Against a wall: a board with pegs, a pick, a shovel and a saw hung on it.
    const parts = [part(placed(new BoxGeometry(1.2, 0.5, 0.04), [0, 1.5, -0.15]), 'wood', 0x5e4028)];
    parts.push(part(placed(new CylinderGeometry(0.018, 0.018, 1.0, 6), [-0.35, 1.2, -0.08], [0, 0, 0.05]), 'wood', 0x8a6a4a), part(placed(new BoxGeometry(0.5, 0.06, 0.04), [-0.37, 1.68, -0.08], [0, 0, 0.05]), 'iron'));
    parts.push(part(placed(new CylinderGeometry(0.018, 0.018, 1.1, 6), [0.05, 1.15, -0.08]), 'wood', 0x8a6a4a), part(placed(new BoxGeometry(0.22, 0.28, 0.02), [0.05, 0.6, -0.08]), 'iron', 0x5a5a60));
    parts.push(part(placed(new BoxGeometry(0.06, 0.4, 0.015), [0.42, 1.3, -0.1]), 'iron', 0x6a6a70), part(placed(new BoxGeometry(0.1, 0.12, 0.03), [0.42, 1.55, -0.1]), 'wood', 0x7a5a3c));
    return { parts, r: 0.3 };
  },
  pickaxe: () => ({
    parts: [
      part(placed(new CylinderGeometry(0.02, 0.022, 0.9, 6), [0, 0.03, 0], [Math.PI / 2, 0, 0]), 'wood', 0x8a6a4a),
      part(placed(new CylinderGeometry(0, 0.035, 0.3, 6), [0.15, 0.05, 0.42], [0, 0, -Math.PI / 2 - 0.25]), 'iron'),
      part(placed(new CylinderGeometry(0, 0.035, 0.3, 6), [-0.15, 0.05, 0.42], [0, 0, Math.PI / 2 + 0.25]), 'iron'),
    ],
    r: 0,
  }),
  mineCart: () => {
    const parts = [part(placed(new CylinderGeometry(0.62, 0.46, 0.55, 4), [0, 0.6, 0], [0, Math.PI / 4, 0], [1, 1, 0.72]), 'wood', 0x7a5a3c)];
    for (const y of [0.42, 0.78]) parts.push(part(placed(new TorusGeometry(y > 0.5 ? 0.6 : 0.5, 0.015, 3, 4), [0, y, 0], [Math.PI / 2, 0, Math.PI / 4], [1, 0.72, 1]), 'iron'));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(placed(new CylinderGeometry(0.16, 0.16, 0.06, 12), [x * 0.38, 0.17, z * 0.3], [0, 0, Math.PI / 2]), 'iron', 0x3a3a3e));
    // (Ore heaped in it.)
    parts.push(part(placed(new DodecahedronGeometry(0.34, 0), [0, 0.86, 0], [0.3, 0.6, 0], [1.2, 0.5, 0.85]), 'stone', 0x6a6460), part(placed(new DodecahedronGeometry(0.08, 0), [0.15, 1.0, 0.1]), 'gold', 0xd8a840));
    return { parts, r: 0.72 };
  },
  rails: () => {
    // Two metres of track along z: two iron rails on five sleepers.
    const parts: Part[] = [];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.05, 0.07, 2.0), [s * 0.42, 0.085, 0]), 'iron', 0x4a4a50));
    for (let i = 0; i < 5; i++) parts.push(part(placed(new BoxGeometry(1.1, 0.06, 0.16), [0, 0.03, -0.8 + i * 0.4], [0, 0.03 * (i - 2), 0]), 'wood', 0x5e4028));
    return { parts, r: 0 };
  },
  orePile: () => {
    const rng = new Rng('ore pile'), parts: Part[] = [];
    for (let i = 0; i < 9; i++) { const a = rng.range(0, 6.3), d = rng.range(0, 0.4), sz = rng.range(0.1, 0.24); parts.push(part(placed(new DodecahedronGeometry(sz, 0), [Math.sin(a) * d, sz * 0.6 + (0.4 - d) * 0.3, Math.cos(a) * d], [rng.range(0, 3), rng.range(0, 3), 0]), 'stone', rng.pick([0x5a5450, 0x6a5a4a, 0x4a4a50]))); }
    for (let i = 0; i < 5; i++) { const a = rng.range(0, 6.3), d = rng.range(0, 0.35); parts.push(part(placed(new DodecahedronGeometry(0.05, 0), [Math.sin(a) * d, 0.25 + rng.range(0, 0.15), Math.cos(a) * d]), 'gold', 0xd8a840)); }
    return { parts, r: 0.5 };
  },
  ladder: () => {
    // Leant against a wall (its top toward -z).
    const parts: Part[] = [];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.05, 2.8, 0.05), [s * 0.22, 1.36, -0.15], [-0.18, 0, 0]), 'wood', 0x8a6a4a));
    for (let i = 0; i < 8; i++) { const y = 0.3 + i * 0.32; parts.push(part(placed(new CylinderGeometry(0.018, 0.018, 0.44, 6), [0, y, -0.15 - (y - 1.36) * Math.tan(0.18)], [0, 0, Math.PI / 2]), 'wood', 0x7a5a3c)); }
    return { parts, r: 0.3 };
  },
  scaffold: () => {
    const parts: Part[] = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(placed(new BoxGeometry(0.1, 2.5, 0.1), [x * 0.8, 1.25, z * 0.45]), 'wood', 0x7a5a3c));
    for (let i = 0; i < 6; i++) parts.push(part(placed(new BoxGeometry(1.75, 0.05, 0.17), [0, 1.65, -0.42 + i * 0.17]), 'wood', 0x8a6446));
    for (const z of [-1, 1]) parts.push(part(placed(new BoxGeometry(1.9, 0.06, 0.06), [0, 0.9, z * 0.45], [0, 0, 0.75]), 'wood', 0x6e5038));
    parts.push(part(lathe([[0, 0], [0.16, 0], [0.18, 0.28], [0, 0.28]], 10).translate(0.5, 1.68, 0), 'wood', 0x8a6a4a));
    return { parts, r: 1.0 };
  },
  // ---------------------------------------------------------------------------------------------- water and old stone
  well: () => {
    const parts = [part(lathe([[0.5, 0], [0.72, 0], [0.74, 0.7], [0.66, 0.78], [0.5, 0.74], [0.5, 0]], 18), 'stone', 0x9a948a), part(placed(new CylinderGeometry(0.5, 0.5, 0.02, 16), [0, 0.35, 0]), 'iron', 0x2a3a46)];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.1, 1.7, 0.1), [s * 0.62, 1.4, 0]), 'wood', 0x6e5038));
    parts.push(part(placed(new CylinderGeometry(0.06, 0.06, 1.3, 8), [0, 2.05, 0], [0, 0, Math.PI / 2]), 'wood', 0x7a5a3c), part(placed(new CylinderGeometry(0.008, 0.008, 1.0, 4), [0, 1.55, 0]), 'straw', 0xc8a870));
    parts.push(part(lathe([[0, 0], [0.11, 0], [0.13, 0.22], [0, 0.22]], 10).translate(0, 0.95, 0), 'wood', 0x8a6a4a));
    return { parts, r: 0.8 };
  },
  trough: () => ({
    parts: [
      part(placed(new BoxGeometry(1.5, 0.45, 0.55), [0, 0.225, 0]), 'stone', 0x8a847a),
      part(placed(new BoxGeometry(1.36, 0.02, 0.41), [0, 0.4, 0]), 'iron', 0x2a3a46),
    ],
    r: 0.78,
  }),
  basin: () => ({
    parts: [
      part(lathe([[0, 0], [0.3, 0], [0.18, 0.12], [0.14, 0.6], [0.6, 0.72], [0.66, 0.9], [0.58, 0.9], [0, 0.8]], 18), 'stone', 0xb0a89a),
      part(placed(new CylinderGeometry(0.56, 0.56, 0.02, 18), [0, 0.84, 0]), 'iron', 0x2a3a46),
    ],
    r: 0.68,
  }),
  throne: () => ({
    parts: [
      part(placed(new BoxGeometry(1.3, 0.3, 1.2), [0, 0.15, 0]), 'stone', 0x9a948a),
      part(placed(new BoxGeometry(0.9, 0.5, 0.7), [0, 0.55, 0.05]), 'stone', 0xa8a092),
      part(placed(new BoxGeometry(0.95, 2.1, 0.22), [0, 1.35, -0.38]), 'stone', 0xa8a092),
      part(placed(new BoxGeometry(0.7, 0.3, 0.24), [0, 2.5, -0.38], [0, 0, Math.PI / 4]), 'stone', 0xa8a092),
      ...[-1, 1].map((s) => part(placed(new BoxGeometry(0.14, 0.42, 0.7), [s * 0.52, 0.95, 0.05]), 'stone', 0x9a948a)),
      part(placed(new BoxGeometry(0.6, 0.06, 0.5), [0, 0.83, 0.08]), 'cloth', 0x6a1a22),
      part(placed(new BoxGeometry(0.2, 0.2, 0.04), [0, 2.15, -0.26], [0, 0, Math.PI / 4]), 'gold', 0xd8a840),
    ],
    r: 0.75,
  }),
  brokenColumn: () => ({
    parts: [
      part(placed(new CylinderGeometry(0.46, 0.5, 0.22, 14), [0, 0.11, 0]), 'stone', 0xa8a092),
      part(placed(new CylinderGeometry(0.36, 0.38, 1.3, 12), [0, 0.86, 0], [0.04, 0, 0.03]), 'stone', 0xb8b0a4),
      part(placed(new DodecahedronGeometry(0.38, 0), [0, 1.52, 0], [0.3, 0, 0.2], [1, 0.4, 1]), 'stone', 0xb0a89a),
      // (Its fallen drum beside it.)
      part(placed(new CylinderGeometry(0.36, 0.36, 0.6, 12), [0.85, 0.36, 0.3], [0, 0.6, Math.PI / 2]), 'stone', 0xb8b0a4),
    ],
    r: 0.55,
  }),
  stoneHead: () => ({
    // A giant's head of stone fallen from its statue, on its side, half sunk.
    parts: [
      part(placed(new SphereGeometry(0.62, 14, 10), [0, 0.45, 0], [0, 0, 1.2], [0.85, 1.05, 0.95]), 'stone', 0xa8a092),
      part(placed(new BoxGeometry(0.16, 0.36, 0.22), [0.05, 0.5, 0.55], [0, 0, 1.2]), 'stone', 0xa09888),
      ...[-1, 1].map((s) => part(placed(new SphereGeometry(0.09, 8, 6), [-0.05 + s * 0.08, 0.68 - s * 0.18, 0.5]), 'stone', 0x2a2420)),
      part(placed(new BoxGeometry(0.85, 0.3, 0.7), [-0.1, 0.95, -0.05], [0, 0, 1.2]), 'stone', 0x9a948a),
    ],
    r: 0.7,
  }),
  obelisk: () => ({
    parts: [
      part(placed(new BoxGeometry(0.8, 0.3, 0.8), [0, 0.15, 0]), 'stone', 0x8a847a),
      part(placed(new CylinderGeometry(0.2, 0.32, 2.6, 4), [0, 1.6, 0], [0, Math.PI / 4, 0]), 'stone', 0x9a948a),
      part(placed(new CylinderGeometry(0, 0.2, 0.35, 4), [0, 3.07, 0], [0, Math.PI / 4, 0]), 'gold', 0xd8a840),
    ],
    r: 0.45,
  }),
  runestone: () => {
    const rng = new Rng('runes'), parts = [part(placed(new BoxGeometry(0.75, 1.5, 0.24), [0, 0.7, 0], [0.05, 0, 0.04]), 'stone', 0x8a8478), part(placed(new DodecahedronGeometry(0.45, 0), [0, 1.42, 0], [0.4, 0.2, 0], [0.85, 0.35, 0.3]), 'stone', 0x8a8478)];
    // (Runes cut down its face, filled dark: stone, not coal, which would glow.)
    for (let i = 0; i < 9; i++) parts.push(part(placed(new BoxGeometry(rng.range(0.04, 0.16), rng.range(0.05, 0.12), 0.01), [rng.range(-0.2, 0.2), 0.35 + i * 0.11, 0.13], [0, 0, rng.range(-0.8, 0.8)]), 'stone', 0x302820));
    return { parts, r: 0.4 };
  },
  tombSlab: () => ({
    parts: [
      part(placed(new BoxGeometry(1.0, 0.25, 2.1), [0, 0.125, 0]), 'stone', 0x9a948a),
      part(placed(new BoxGeometry(0.5, 0.1, 1.5), [0, 0.3, -0.05]), 'stone', 0xb0a89a),
      part(placed(new SphereGeometry(0.15, 10, 8), [0, 0.33, 0.8], [0, 0, 0], [1, 0.6, 1]), 'stone', 0xb0a89a),
      part(placed(new BoxGeometry(0.05, 0.03, 0.7), [0, 0.37, 0.1]), 'iron', 0x5a5a60),
    ],
    r: 0.6,
  }),
  // ------------------------------------------------------------------------------- the dead, and what lives in the dark
  coffin: () => ({
    parts: [
      part(placed(new CylinderGeometry(0.42, 0.3, 0.42, 6), [0, 0.21, 0], [0, 0, 0], [1, 1, 2.6]), 'wood', 0x4a3220),
      part(placed(new CylinderGeometry(0.43, 0.31, 0.05, 6), [0.05, 0.44, 0], [0, 0.12, 0.08], [1, 1, 2.6]), 'wood', 0x5e4028),
      part(placed(new BoxGeometry(0.06, 0.02, 0.5), [0.05, 0.47, 0.2], [0, 0.12, 0]), 'iron'),
      part(placed(new BoxGeometry(0.3, 0.02, 0.06), [0.05, 0.47, 0.3], [0, 0.12, 0]), 'iron'),
    ],
    r: 0.55,
  }),
  ribcage: () => {
    // A great beast's: its spine along the floor, its ribs arching over it.
    const parts = [part(placed(new CylinderGeometry(0.06, 0.05, 2.2, 8), [0, 0.08, 0], [Math.PI / 2, 0, 0]), 'bone', 0xd0c6ae)];
    for (let i = 0; i < 7; i++) parts.push(part(placed(new TorusGeometry(0.55 - Math.abs(i - 3) * 0.06, 0.035, 5, 14, Math.PI), [0, 0.05, -0.9 + i * 0.3], [0, 0, 0], [1, 1.3, 1]), 'bone', 0xd8cfb8));
    parts.push(part(placed(new SphereGeometry(0.22, 10, 8), [0, 0.18, 1.35], [0.3, 0, 0], [0.8, 0.7, 1.4]), 'bone', 0xd0c6ae));
    return { parts, r: 0 };
  },
  skullPile: () => {
    const parts: Part[] = [];
    const at: [number, number, number][] = [[0, 0, 0], [0.2, 0, 0.05], [-0.2, 0, 0.04], [0.1, 0, -0.18], [-0.1, 0, -0.18], [0.02, 0.18, -0.06], [0.16, 0.16, -0.04], [-0.14, 0.16, -0.05], [0.0, 0.33, -0.08]];
    for (const [x, y, z] of at) parts.push(part(placed(new SphereGeometry(0.1, 9, 7), [x, y + 0.1, z], [0, x * 4, 0], [0.9, 0.95, 1.15]), 'bone'), part(placed(new SphereGeometry(0.025, 5, 4), [x - 0.035, y + 0.11, z + 0.1]), 'bone', 0x2a2018), part(placed(new SphereGeometry(0.025, 5, 4), [x + 0.035, y + 0.11, z + 0.1]), 'bone', 0x2a2018));
    return { parts, r: 0.35 };
  },
  eggSacs: () => {
    const rng = new Rng('eggs'), parts: Part[] = [];
    for (let i = 0; i < 9; i++) { const a = rng.range(0, 6.3), d = rng.range(0, 0.35), sz = rng.range(0.1, 0.2); parts.push(part(placed(new SphereGeometry(sz, 9, 7), [Math.sin(a) * d, sz * 0.8, Math.cos(a) * d], [0, 0, 0], [1, 1.25, 1]), 'bone', 0xe8e2d0)); }
    parts.push(part(placed(new PlaneGeometry(1.1, 1.1), [0, 0.02, 0], [-Math.PI / 2, 0, 0.4]), 'cloth', 0xcfcfd4));
    return { parts, r: 0.35 };
  },
  mushrooms: () => {
    // Pale fungi that glow of themselves (`fungus`): a cluster, one of them tall.
    const rng = new Rng('mushrooms'), parts: Part[] = [];
    for (let i = 0; i < 7; i++) {
      const a = rng.range(0, 6.3), d = i ? rng.range(0.12, 0.45) : 0, h = i ? rng.range(0.12, 0.45) : 0.8, r = i ? rng.range(0.07, 0.18) : 0.32;
      parts.push(part(placed(new CylinderGeometry(r * 0.22, r * 0.3, h, 7), [Math.sin(a) * d, h / 2, Math.cos(a) * d]), 'bone', 0xe8e0d0));
      parts.push(part(placed(new SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [Math.sin(a) * d, h - r * 0.15, Math.cos(a) * d], [rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)], [1, 0.55, 1]), 'fungus', rng.pick([0x9fe8d0, 0xb8f0c8, 0x8fd8f0])));
    }
    return { parts, r: 0.3 };
  },
  moss: () => {
    const rng = new Rng('moss'), parts: Part[] = [];
    for (let i = 0; i < 5; i++) parts.push(part(placed(new CylinderGeometry(rng.range(0.2, 0.5), rng.range(0.25, 0.55), 0.03, 9), [rng.range(-0.4, 0.4), 0.015, rng.range(-0.4, 0.4)], [0, rng.range(0, 3), 0], [1, 1, rng.range(0.6, 1)]), 'cloth', rng.pick([0x3a5a2a, 0x4a6a32, 0x2e4a26])));
    return { parts, r: 0 };
  },
  // ------------------------------------------------------------------------------------------------------ a household's
  cauldron: () => {
    const parts = [part(lathe([[0, 0.2], [0.3, 0.25], [0.42, 0.45], [0.4, 0.7], [0.36, 0.72], [0.34, 0.68], [0, 0.66]], 16), 'iron', 0x2e2e32), part(placed(new CylinderGeometry(0.34, 0.34, 0.02, 14), [0, 0.64, 0]), 'clay', 0x5a7a3a)];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; parts.push(part(placed(new CylinderGeometry(0.03, 0.02, 0.28, 6), [0.28 * Math.cos(a), 0.14, 0.28 * Math.sin(a)]), 'iron', 0x2e2e32)); }
    parts.push(part(placed(new CylinderGeometry(0.015, 0.015, 0.7, 6), [0.15, 0.9, 0], [0, 0, -0.5]), 'wood', 0x8a6a4a), part(placed(new IcosahedronGeometry(0.16, 1), [0, 0.06, 0], [0, 0, 0], [1, 0.3, 1]), 'coal'));
    return { parts, r: 0.5 };
  },
  cookingFire: () => {
    const parts: Part[] = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; parts.push(part(placed(new DodecahedronGeometry(0.14, 0), [0.5 * Math.cos(a), 0.06, 0.5 * Math.sin(a)], [a, a * 2, 0], [1, 0.7, 1]), 'stone', 0x7a746a)); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.3; parts.push(part(placed(new CylinderGeometry(0.05, 0.06, 0.6, 6), [0.12 * Math.cos(a), 0.12, 0.12 * Math.sin(a)], [0.9 * Math.sin(a), 0, -0.9 * Math.cos(a)]), 'wood', 0x3a2a1e)); }
    parts.push(part(placed(new IcosahedronGeometry(0.2, 1), [0, 0.05, 0], [0, 0, 0], [1, 0.35, 1]), 'coal'));
    // (A spit across it on two forked sticks.)
    for (const s of [-1, 1]) parts.push(part(placed(new CylinderGeometry(0.02, 0.025, 0.9, 5), [s * 0.6, 0.45, 0]), 'wood', 0x5e4028));
    parts.push(part(placed(new CylinderGeometry(0.015, 0.015, 1.4, 5), [0, 0.86, 0], [0, 0, Math.PI / 2]), 'iron'));
    return { parts, r: 0.65 };
  },
  firewood: () => {
    const parts: Part[] = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) parts.push(part(placed(new CylinderGeometry(0.08, 0.08, 0.9, 8), [(i - (3 - row) / 2) * 0.17, 0.08 + row * 0.15, 0], [Math.PI / 2, 0, 0]), 'wood', [0x6e5038, 0x7a5a3c, 0x5e4028][(i + row) % 3]));
    return { parts, r: 0.45 };
  },
  jarShelf: () => {
    // Against a wall: shelves of jars and pots, stoppered.
    const rng = new Rng('jars'), parts = [part(placed(new BoxGeometry(1.4, 1.7, 0.03), [0, 0.85, -0.17]), 'wood', 0x4a3220)];
    for (const s of [-1, 1]) parts.push(part(placed(new BoxGeometry(0.05, 1.7, 0.36), [s * 0.68, 0.85, 0]), 'wood', 0x5e4028));
    for (const y of [0.08, 0.6, 1.12, 1.64]) {
      parts.push(part(placed(new BoxGeometry(1.32, 0.03, 0.34), [0, y, 0]), 'wood', 0x5e4028));
      if (y > 1.6) continue;
      for (let x = -0.55; x < 0.55; x += rng.range(0.16, 0.26)) { const h = rng.range(0.14, 0.3), r = rng.range(0.05, 0.09); parts.push(part(lathe([[0, 0], [r, 0], [r * 1.15, h * 0.6], [r * 0.6, h], [r * 0.7, h * 1.08], [0, h * 1.08]], 9).translate(x, y + 0.015, 0), 'clay', rng.pick([0x9a5a3a, 0x7a6a4a, 0x5a6a7a, 0xb08a5a]))); }
    }
    return { parts, r: 0.45 };
  },
  amphora: () => ({ parts: [part(lathe([[0, 0], [0.04, 0], [0.18, 0.25], [0.2, 0.5], [0.12, 0.8], [0.06, 0.9], [0.08, 0.98], [0, 0.98]], 14), 'clay', 0xa86a44), ...[-1, 1].map((s) => part(placed(new TorusGeometry(0.07, 0.015, 4, 10, Math.PI), [s * 0.1, 0.82, 0], [0, 0, s * Math.PI / 2]), 'clay', 0xa86a44))], r: 0.24 }),
  pots: () => {
    const rng = new Rng('pots'), parts: Part[] = [];
    for (let i = 0; i < 6; i++) { const a = rng.range(0, 6.3), d = rng.range(0, 0.35), h = rng.range(0.15, 0.45), r = rng.range(0.08, 0.17); parts.push(part(lathe([[0, 0], [r * 0.7, 0], [r, h * 0.45], [r * 0.6, h], [r * 0.7, h * 1.06], [0, h]], 10).translate(Math.sin(a) * d, 0, Math.cos(a) * d), 'clay', rng.pick([0x9a5a3a, 0x8a6a4a, 0xa87a54]))); }
    return { parts, r: 0.4 };
  },
  wineRack: () => {
    // Against a wall: a lattice of bottles laid on their sides, their ends toward the room.
    const parts = [part(placed(new BoxGeometry(1.2, 1.5, 0.4), [0, 0.75, -0.02]), 'wood', 0x3a2a1e)];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if ((r * 5 + c) % 7 !== 3) parts.push(part(placed(new CylinderGeometry(0.045, 0.045, 0.3, 8), [-0.48 + c * 0.24, 0.2 + r * 0.28, 0.08], [Math.PI / 2, 0, 0]), 'clay', 0x6aa070));
    return { parts, r: 0.4 };
  },
  rug: () => ({
    parts: [
      part(placed(new BoxGeometry(2.4, 0.015, 1.5), [0, 0.008, 0]), 'cloth', 0x6a1e22),
      part(placed(new BoxGeometry(2.0, 0.018, 1.1), [0, 0.01, 0]), 'cloth', 0x8a5a2a),
      part(placed(new BoxGeometry(1.6, 0.02, 0.7), [0, 0.012, 0]), 'cloth', 0x2a3a5a),
      part(placed(new BoxGeometry(0.4, 0.022, 0.4), [0, 0.014, 0], [0, Math.PI / 4, 0]), 'cloth', 0xc8a060),
    ],
    r: 0,
  }),
  tapestry: () => ({
    parts: [
      part(placed(new CylinderGeometry(0.025, 0.025, 2.0, 8), [0, 2.9, 0.06], [0, 0, Math.PI / 2]), 'iron'),
      part(placed(new BoxGeometry(1.8, 2.2, 0.02), [0, 1.8, 0.05]), 'cloth', 0x2a3a5a),
      part(placed(new BoxGeometry(1.5, 1.85, 0.022), [0, 1.82, 0.055]), 'cloth', 0x7a5a2a),
      part(placed(new BoxGeometry(0.5, 0.9, 0.024), [-0.3, 1.9, 0.058]), 'cloth', 0x6a1e22),
      part(placed(new SphereGeometry(0.2, 10, 8), [0.35, 2.2, 0.06], [0, 0, 0], [1, 1, 0.1]), 'cloth', 0xc8a060),
    ],
    r: 0,
  }),
  tent: () => {
    const parts = [part(placed(new CylinderGeometry(0, 1.3, 1.9, 4, 1, true), [0, 0.95, 0], [0, Math.PI / 4, 0], [1, 1, 1.3]), 'cloth', 0x8a7a5a), part(placed(new CylinderGeometry(0.03, 0.03, 2.1, 5), [0, 1.05, 0]), 'wood', 0x5e4028)];
    parts.push(part(placed(new PlaneGeometry(0.7, 1.2), [0, 0.6, 1.0], [-0.55, 0, 0]), 'cloth', 0x6a5a40));
    return { parts, r: 1.2 };
  },
  lectern: () => ({
    parts: [
      part(placed(new BoxGeometry(0.5, 0.06, 0.5), [0, 0.03, 0]), 'wood', 0x5e4028),
      part(placed(new BoxGeometry(0.12, 1.0, 0.12), [0, 0.55, 0]), 'wood', 0x6e5038),
      part(placed(new BoxGeometry(0.6, 0.05, 0.42), [0, 1.1, 0.02], [0.45, 0, 0]), 'wood', 0x7a5a3c),
      part(placed(new BoxGeometry(0.46, 0.04, 0.3), [0, 1.14, 0.03], [0.45, 0, 0]), 'cloth', 0xd8c8a0),
      part(placed(new BoxGeometry(0.02, 0.05, 0.3), [0, 1.16, 0.03], [0.45, 0, 0]), 'cloth', 0x6a1e22),
    ],
    r: 0.35,
  }),
  alchemyTable: () => {
    const rng = new Rng('alchemy'), parts = [part(placed(new BoxGeometry(1.6, 0.08, 0.75), [0, 0.8, 0]), 'wood', 0x5e4028)];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(part(placed(new BoxGeometry(0.08, 0.78, 0.08), [x * 0.72, 0.39, z * 0.3]), 'wood', 0x4a3220));
    // (Flasks and phials, a small burner, a skull, an open book.)
    for (let i = 0; i < 6; i++) { const x = -0.65 + i * 0.22, h = rng.range(0.15, 0.32); parts.push(part(lathe([[0, 0], [0.07, 0], [0.08, h * 0.4], [0.025, h * 0.7], [0.025, h], [0, h]], 10).translate(x, 0.84, rng.range(-0.2, 0.1)), 'clay', rng.pick([0x3a8a5a, 0x7a3a8a, 0x3a5a9a, 0x9a8a3a]))); }
    parts.push(part(placed(new SphereGeometry(0.08, 8, 6), [0.5, 0.92, 0.18]), 'bone'), part(placed(new BoxGeometry(0.4, 0.02, 0.28), [-0.2, 0.85, 0.2], [0, 0.2, 0]), 'cloth', 0xd8c8a0));
    parts.push(part(placed(new CylinderGeometry(0.05, 0.06, 0.08, 8), [0.25, 0.88, -0.15]), 'iron'), part(placed(new CylinderGeometry(0.012, 0.012, 0.03, 6), [0.25, 0.93, -0.15]), 'wax', 0xeee2c4));
    return { parts, r: 0.9 };
  },
  // ----------------------------------------------------------------------------------------------- arms, light, riches
  shield: () => ({
    parts: [
      part(placed(new CylinderGeometry(0.34, 0.34, 0.04, 18), [0, 0.36, 0], [Math.PI / 2 - 0.25, 0, 0]), 'wood', 0x6a3a28),
      part(placed(new TorusGeometry(0.34, 0.018, 4, 20), [0, 0.36, 0.01], [-0.25, 0, 0]), 'iron'),
      part(placed(new SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.37, 0.03], [Math.PI / 2 - 0.25, 0, 0]), 'iron'),
    ],
    r: 0.2,
  }),
  armorStand: () => ({
    parts: [
      part(placed(new BoxGeometry(0.5, 0.06, 0.5), [0, 0.03, 0]), 'wood', 0x5e4028),
      part(placed(new BoxGeometry(0.07, 1.5, 0.07), [0, 0.8, 0]), 'wood', 0x6e5038),
      part(placed(new BoxGeometry(0.7, 0.06, 0.06), [0, 1.42, 0]), 'wood', 0x6e5038),
      part(lathe([[0, 0], [0.2, 0], [0.24, 0.3], [0.27, 0.45], [0.22, 0.55], [0, 0.56]], 14).translate(0, 0.92, 0), 'iron', 0x6a6a70),
      part(placed(new SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), [0, 1.62, 0]), 'iron', 0x6a6a70),
      ...[-1, 1].map((s) => part(placed(new SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [s * 0.3, 1.45, 0], [0, 0, -s * 0.5]), 'iron', 0x5a5a60)),
    ],
    r: 0.4,
  }),
  spearBundle: () => {
    const parts: Part[] = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(part(placed(new CylinderGeometry(0.014, 0.014, 2.2, 5), [0.08 * Math.cos(a), 1.1, 0.08 * Math.sin(a)], [0.1 * Math.sin(a), 0, -0.1 * Math.cos(a)]), 'wood', 0x8a6a4a), part(placed(new CylinderGeometry(0, 0.035, 0.22, 6), [0.19 * Math.cos(a), 2.28, 0.19 * Math.sin(a)], [0.1 * Math.sin(a), 0, -0.1 * Math.cos(a)]), 'iron')); }
    parts.push(part(placed(new TorusGeometry(0.11, 0.015, 4, 12), [0, 1.2, 0], [Math.PI / 2, 0, 0]), 'straw', 0xb89a5a));
    return { parts, r: 0.3 };
  },
  hangingCage: () => {
    // Hung from the roof on a chain, its floor some way over the ground; empty, but for bones.
    const parts = [part(placed(new CylinderGeometry(0.45, 0.45, 0.04, 14), [0, 1.2, 0]), 'iron', 0x3a3a3e), part(placed(new CylinderGeometry(0.06, 0.45, 0.3, 14), [0, 3.15, 0]), 'iron', 0x3a3a3e)];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; parts.push(part(placed(new CylinderGeometry(0.012, 0.012, 1.8, 4), [0.44 * Math.cos(a), 2.1, 0.44 * Math.sin(a)]), 'iron', 0x3a3a3e)); }
    for (let i = 0; i < 6; i++) parts.push(part(placed(new TorusGeometry(0.035, 0.009, 4, 8), [0, 3.4 + i * 0.07, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], [1, 1.3, 1]), 'iron'));
    parts.push(part(placed(new SphereGeometry(0.09, 8, 6), [0.1, 1.31, 0.05]), 'bone'), part(placed(new CylinderGeometry(0.015, 0.015, 0.35, 5), [-0.1, 1.24, 0], [Math.PI / 2, 0.6, 0]), 'bone'));
    return { parts, r: 0 };
  },
  chain: () => {
    // Hanging from the roof, its end some way over the floor.
    const parts: Part[] = [];
    for (let i = 0; i < 30; i++) parts.push(part(placed(new TorusGeometry(0.05, 0.012, 4, 8), [0, 1.0 + i * 0.09, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], [1, 1.35, 1]), 'iron', 0x3a3a3e));
    parts.push(part(placed(new CylinderGeometry(0, 0.06, 0.18, 6), [0, 0.88, 0], [Math.PI, 0, 0]), 'iron', 0x3a3a3e));
    return { parts, r: 0 };
  },
  standingTorch: () => ({
    parts: [
      part(lathe([[0, 0], [0.2, 0], [0.2, 0.04], [0.05, 0.1], [0.035, 1.5], [0, 1.5]], 10), 'iron', 0x2e2e32),
      part(lathe([[0, 1.5], [0.14, 1.6], [0.16, 1.72], [0.13, 1.72], [0.1, 1.64], [0, 1.62]], 10), 'iron', 0x2e2e32),
      part(placed(new IcosahedronGeometry(0.1, 1), [0, 1.68, 0], [0, 0, 0], [1, 0.4, 1]), 'coal'),
    ],
    r: 0.22,
  }),
  lantern: () => ({
    parts: [
      part(placed(new BoxGeometry(0.2, 0.03, 0.2), [0, 0.015, 0]), 'iron', 0x2e2e32),
      part(placed(new CylinderGeometry(0.02, 0.12, 0.1, 4), [0, 0.36, 0], [0, Math.PI / 4, 0]), 'iron', 0x2e2e32),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => part(placed(new BoxGeometry(0.015, 0.3, 0.015), [x * 0.085, 0.16, z * 0.085]), 'iron', 0x2e2e32)),
      part(placed(new CylinderGeometry(0.035, 0.04, 0.1, 8), [0, 0.08, 0]), 'wax', 0xeee2c4),
      part(placed(new TorusGeometry(0.05, 0.01, 4, 10), [0, 0.45, 0]), 'iron'),
    ],
    r: 0,
  }),
  idol: () => ({
    parts: [
      part(placed(new BoxGeometry(0.55, 0.9, 0.55), [0, 0.45, 0]), 'stone', 0x8a847a),
      part(placed(new BoxGeometry(0.65, 0.08, 0.65), [0, 0.94, 0]), 'stone', 0x9a948a),
      // A squat figure of gold, cross-legged, its eyes two stones.
      part(lathe([[0, 0], [0.2, 0], [0.18, 0.1], [0.13, 0.32], [0.1, 0.36], [0, 0.37]], 12).translate(0, 0.98, 0), 'gold', 0xe0b040),
      part(placed(new SphereGeometry(0.09, 10, 8), [0, 1.42, 0]), 'gold', 0xe0b040),
      ...[-1, 1].map((s) => part(placed(new SphereGeometry(0.018, 6, 4), [s * 0.035, 1.44, 0.08]), 'clay', 0xc02020)),
    ],
    r: 0.4,
  }),
  gemPile: () => {
    const rng = new Rng('gems'), parts: Part[] = [];
    for (let i = 0; i < 12; i++) { const a = rng.range(0, 6.3), d = rng.range(0.03, 0.25); parts.push(part(placed(new CylinderGeometry(0.035, 0.035, 0.008, 9), [Math.sin(a) * d, 0.006, Math.cos(a) * d]), 'gold')); }
    // (The gems glimmer of themselves, as the fungi do, so that a hoard catches the eye in the dark.)
    for (let i = 0; i < 10; i++) { const a = rng.range(0, 6.3), d = rng.range(0, 0.22); parts.push(part(placed(new IcosahedronGeometry(rng.range(0.04, 0.06), 0), [Math.sin(a) * d, 0.03, Math.cos(a) * d]), 'fungus', rng.pick([0xd02040, 0x2060e0, 0x30c060, 0xa040d0]))); }
    return { parts, r: 0 };
  },
};

/** How far out of the way each prop is, for one walking; and those that hold a flame (a little light where it is). */
export const flameOf: Partial<Record<PropKind, { at: [number, number, number][]; power: number }>> = {
  candlestick: { at: [[0, 0.3, 0]], power: 0.25 },
  candelabrum: { at: [[-0.22, 1.42, 0], [0, 1.42, 0], [0.22, 1.42, 0]], power: 0.3 },
  brazier: { at: [[0, 1.05, 0]], power: 0.9 },
  cookingFire: { at: [[0, 0.15, 0]], power: 0.8 },
  standingTorch: { at: [[0, 1.78, 0]], power: 0.7 },
  lantern: { at: [[0, 0.18, 0]], power: 0.3 },
  alchemyTable: { at: [[0.25, 0.97, -0.15]], power: 0.2 },
};
/** Every kind of prop there is, in the order they are made here: for a picture of them all (`__slope.propGallery`). */
export const PROP_KINDS = Object.keys(MODELS) as PropKind[];
let made: Partial<Record<PropKind, Model>> = {};
const modelOf = (k: PropKind) => (made[k] ??= MODELS[k]());

/** The props laid in one place: each kind's placings, and drawn, one instanced shape to each kind and stuff. */
export class Props {
  private readonly laid = new Map<PropKind, Matrix4[]>();
  /** A prop of kind `k` laid with its foot at `at`, turned `yaw` about the upright, scaled; gives back how far it is in the way. */
  put(k: PropKind, at: Vector3, yaw = 0, scale: number | [number, number, number] = 1): number {
    const s = typeof scale === 'number' ? new Vector3(scale, scale, scale) : new Vector3(...scale);
    let list = this.laid.get(k);
    if (!list) this.laid.set(k, (list = []));
    list.push(new Matrix4().compose(at, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), s));
    return modelOf(k).r * Math.max(s.x, s.z);
  }
  /** What is to be drawn: for each kind laid and each stuff it has, its parts as one shape (tinted, `color`), and where each copy stands. */
  parts(): { kind: PropKind; stuff: Stuff; shape: BufferGeometry; at: Matrix4[] }[] {
    const out: { kind: PropKind; stuff: Stuff; shape: BufferGeometry; at: Matrix4[] }[] = [];
    for (const [kind, at] of this.laid) {
      const model = modelOf(kind);
      for (const stuff of STUFFS) {
        const ps = model.parts.filter((p) => p.stuff === stuff);
        if (!ps.length) continue;
        const shape = mergeGeometries(ps.map((p) => {
          const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
          const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) c.set([p.tint.r, p.tint.g, p.tint.b], i * 3);
          g.setAttribute('color', new BufferAttribute(c, 3));
          return g;
        }))!;
        out.push({ kind, stuff, shape, at });
      }
    }
    return out;
  }
  /** The flames held by the props laid (candles, braziers): where each is, and how strong a light it gives. */
  flames(): { at: Vector3; power: number }[] {
    const out: { at: Vector3; power: number }[] = [];
    for (const [kind, list] of this.laid) {
      const f = flameOf[kind];
      if (f) for (const m of list) for (const p of f.at) out.push({ at: new Vector3(...p).applyMatrix4(m), power: f.power });
    }
    return out;
  }
}
/** Forget the props made (they are made again when next wanted). */
export const forgetProps = () => { made = {}; };
