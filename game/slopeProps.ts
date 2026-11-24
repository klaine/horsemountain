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
export type Stuff = 'wood' | 'iron' | 'stone' | 'bone' | 'gold' | 'cloth' | 'wax' | 'straw' | 'clay' | 'coal';
export const STUFFS: Stuff[] = ['wood', 'iron', 'stone', 'bone', 'gold', 'cloth', 'wax', 'straw', 'clay', 'coal'];

export type PropKind =
  | 'barrel' | 'crate' | 'sack' | 'table' | 'desk' | 'stool' | 'bench' | 'bookcase' | 'books' | 'scroll' | 'candlestick' | 'candelabrum'
  | 'altar' | 'statue' | 'sarcophagus' | 'dais' | 'urn' | 'brazier' | 'skull' | 'bones' | 'skeleton' | 'rubble' | 'shackles' | 'bedroll'
  | 'bucket' | 'weaponRack' | 'goldHeap' | 'coins' | 'banner' | 'cobweb';

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
};

/** How far out of the way each prop is, for one walking; and those that hold a flame (a little light where it is). */
export const flameOf: Partial<Record<PropKind, { at: [number, number, number][]; power: number }>> = {
  candlestick: { at: [[0, 0.3, 0]], power: 0.25 },
  candelabrum: { at: [[-0.22, 1.42, 0], [0, 1.42, 0], [0.22, 1.42, 0]], power: 0.3 },
  brazier: { at: [[0, 1.05, 0]], power: 0.9 },
};
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
