import {
  Bone, BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshLambertMaterial, MeshStandardMaterial, Object3D,
  Quaternion, Skeleton, SkinnedMesh, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type AirControls, type AlpineArm, type AlpineFoot, type AlpinePose, lifeAt, type RideControls, strideAt } from './alpine';
import type { BodySpec } from './ragdoll';
import { bodyTurn } from './posing';
import { bitRings, horseLooks, type Part } from './horseBody';

/**
 * A horse that skis (asked: "a rigged horse model; fantasy/imaginary way for the horse have skis, two bindings per ski - left and right
 * ski (or as an option for horse skiing: four short skis!); same skiing actions, tricks and animations adapted for this skiing horse;
 * with a rider on back or just the horse skiing option").
 *
 * The horse is made here, in code, on a skeleton of its own (hips, spine, chest, two bones of neck, head and ears, three of tail, and
 * each leg's upper bone, middle bone, cannon, pastern and hoof); how it looks, a bay horse with its mane and tail, and its tack when it
 * is ridden, is made on that skeleton in `horseBody.ts` and skinned to it. (A horse from Quaternius's free animal pack was looked for
 * first; its files are kept where this machine could not reach them. The horse was a wooden mannequin's at first, in the figures'
 * gold and violet; asked for "a realistic horse", it is a horse.)
 *
 * It is posed as the skiers are, by a handful of numbers (`HorsePose`), not by its bones' own axes: the body placed over its skis and
 * turned, leant and pitched about its middle, the back arched, the neck raised or lowered and turned, the head flexed, the ears laid
 * back, the tail raised; each ski placed, turned, pitched and edged under it; and the whole turned about the upright and over (a spin, a
 * flip) and lifted. Its legs are found from the skis up: each hoof is held in a binding on its ski (two to a ski, fore and hind, on a
 * pair of long skis; or each on a short ski of its own), the pastern and the cannon stand on it as the binding holds them, and the upper
 * two bones reach from the shoulder or the hip to the top of the cannon, the elbow bending back and the stifle forward, as a horse's do.
 *
 * Every bone rests unturned, so that a bone's turn in the horse's frame is its turn from rest; the poser keeps those turns and the
 * joints' places itself, bone by bone down the skeleton, and gives each bone its turn from its parent's at the end.
 */

type V3 = [number, number, number];
export type HorseLeg = 'f_l' | 'f_r' | 'h_l' | 'h_r';
export const HORSE_LEGS: HorseLeg[] = ['f_l', 'f_r', 'h_l', 'h_r'];
export type HorseSkis = 'pair' | 'four';
type Side = 'l' | 'r';

/** How thick a horse's ski is: its hooves stand this much over the snow. */
const SKI_T = 0.03;
/**
 * Where the fore and the hind hooves stand along the horse (z), standing square; how far apart they are; and the middle between them,
 * where a long ski's middle is. (The fore hooves under the points of the shoulders, a little ahead of the trunk's middle more than the
 * hind are behind it.)
 */
const FORE_AT = 0.68, HIND_AT = -0.55, BINDINGS = FORE_AT - HIND_AT, MID = (FORE_AT + HIND_AT) / 2;

// The skeleton, as the horse stands square on the snow (forward +z, up +y, its left +x): each bone's joint, and its parent.
const BONES: [string, string | null, V3][] = (() => {
  const b: [string, string | null, V3][] = [
    ['root', null, [0, 0, 0]],
    ['hips', 'root', [0, 1.3, -0.45]],
    ['spine', 'hips', [0, 1.32, 0]],
    ['chest', 'spine', [0, 1.3, 0.45]],
    ['neck1', 'chest', [0, 1.42, 0.78]],
    ['neck2', 'neck1', [0, 1.74, 0.98]],
    ['head', 'neck2', [0, 2.02, 1.14]],
    ['ear_l', 'head', [0.07, 2.08, 1.11]], ['ear_r', 'head', [-0.07, 2.08, 1.11]],
    ['tail1', 'hips', [0, 1.46, -0.84]], ['tail2', 'tail1', [0, 1.24, -0.98]], ['tail3', 'tail2', [0, 0.96, -1.04]],
  ];
  for (const [k, s] of [['l', 1], ['r', -1]] as const) {
    // (The shoulder blade, from under the withers down to the point of the shoulder, where the upper arm hangs from it.)
    // (The fore leg standing under the point of the shoulder, the elbow a little behind it and the forearm straight down: set further
    // back, the legs had come out from under the girth with a long breast before them.)
    b.push([`f_sc_${k}`, 'chest', [0.15 * s, 1.48, 0.42]], [`f_up_${k}`, `f_sc_${k}`, [0.2 * s, 1.18, 0.73]], [`f_mid_${k}`, `f_up_${k}`, [0.19 * s, 0.95, 0.53]], [`f_low_${k}`, `f_mid_${k}`, [0.17 * s, 0.52, 0.59]],
      [`f_pas_${k}`, `f_low_${k}`, [0.15 * s, 0.17, FORE_AT - 0.07]], [`f_hoof_${k}`, `f_pas_${k}`, [0.15 * s, 0.07, FORE_AT - 0.02]]);
    b.push([`h_up_${k}`, 'hips', [0.22 * s, 1.22, -0.58]], [`h_mid_${k}`, `h_up_${k}`, [0.21 * s, 0.92, -0.36]], [`h_low_${k}`, `h_mid_${k}`, [0.16 * s, 0.56, -0.7]],
      [`h_pas_${k}`, `h_low_${k}`, [0.15 * s, 0.17, HIND_AT - 0.09]], [`h_hoof_${k}`, `h_pas_${k}`, [0.15 * s, 0.07, HIND_AT - 0.02]]);
  }
  return b;
})();
/** Points that are not joints: the end of the muzzle and of the tail, the tips of the ears. */
const ENDS: Record<string, V3> = { muzzle: [0, 1.58, 1.62], tail_end: [0, 0.62, -1.03], ear_tip_l: [0.1, 2.27, 1.07], ear_tip_r: [-0.1, 2.27, 1.07] };

const REST = new Map<string, Vector3>([...BONES.map(([n, , p]) => [n, new Vector3(...p)] as const), ...Object.entries(ENDS).map(([n, p]) => [n, new Vector3(...p)] as const)]);
const PARENT = new Map(BONES.map(([n, p]) => [n, p]));
const rest = (n: string) => REST.get(n)!.clone();
/** The horse's look, made once for every horse: its coat, hair, eyes and tack, skinned to the skeleton by bone names' order. */
let LOOKS: { coat: BufferGeometry; hair: BufferGeometry; eyes: BufferGeometry; tack: BufferGeometry; steel: BufferGeometry } | null = null;

/**
 * The horse's skis: a long one under each side, a binding for each hoof; or a short one under each hoof. Its sole on y = 0, along +z.
 * Twin tips, their tails turned up as their tips are, for riding switch.
 */
const SKIS: Record<HorseSkis, { length: number; ahead: number; width: number }> = {
  // (Ahead of the middle between the bindings, the rest behind it.)
  pair: { length: 2.88, ahead: 1.49, width: 0.11 },
  four: { length: 1.0, ahead: 0.55, width: 0.1 },
};
function skiMesh(kind: HorseSkis): Mesh {
  const s = SKIS[kind], tip = 0.16, tail = 0.14, flat = s.length - tip - tail, back = s.length - s.ahead;
  const body = new BoxGeometry(s.width, SKI_T, flat).translate(0, SKI_T / 2, (s.ahead - tip - back + tail) / 2);
  const turned = new BoxGeometry(s.width * 0.9, SKI_T, tip).translate(0, SKI_T / 2, tip / 2).rotateX(-0.45).translate(0, 0, s.ahead - tip);
  const up = new BoxGeometry(s.width * 0.9, SKI_T, tail).translate(0, SKI_T / 2, -tail / 2).rotateX(0.45).translate(0, 0, tail - back);
  // The bindings: a toe piece and a heel piece round each hoof.
  const at = kind === 'pair' ? [BINDINGS / 2, -BINDINGS / 2] : [0];
  const parts = [body, turned, up];
  for (const z of at) parts.push(new BoxGeometry(s.width * 1.05, 0.05, 0.06).translate(0, SKI_T + 0.025, z + 0.1), new BoxGeometry(s.width * 1.05, 0.07, 0.05).translate(0, SKI_T + 0.035, z - 0.09));
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  const m = new Mesh(g, new MeshStandardMaterial({ color: 0xc0322b, roughness: 0.5 }));
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------------ posing it

/** A ski's place under the horse, from where it rests: to the left `x`, ahead `z`, `up` off the snow; turned, pitched nose down, edged. */
export interface HorseSki { x: number; z: number; up: number; yaw: number; pitch: number; edge: number }
/**
 * A skiing horse's pose. Its body from where it stands square on its skis: lower (negative `height`), to the left and ahead; turned to
 * the left (`yaw`), leant to its right (`roll`; to its left, negative) and pitched nose down, about its middle; its back arched
 * (positive, the chest and the hips down from the spine) and twisted; its neck lowered (positive) and turned to the left; its head
 * flexed, the nose in towards the chest; its ears laid back (0 pricked, 1 flat back); its tail raised (0 hanging, 1 streaming straight
 * back) and swung. Each side's ski (on four short skis, the side's two together), and on four short skis the fore and the hind skis
 * lifted more (`front`, `hind`) and pushed apart along the horse (`spread`). The whole turned about the upright and over, and lifted.
 */
export interface HorsePose {
  height: number; bodyX: number; bodyZ: number; yaw: number; roll: number; pitch: number; arch: number; twist: number;
  neck: number; neckYaw: number; head: number; ears: number; tail: number; tailYaw: number;
  skis: Record<Side, HorseSki>; front: number; hind: number; spread: number;
  spin: number; flip: number; lift: number;
  /** How far the spin's axis is tipped off the upright (a cork, `bodyTurn`); 0 unless given. */
  cork?: number;
  /** Off its skis: where each hoof's sole is (in the horse's frame) and how far its toe is tipped down; given, the skis are not worn. */
  hooves?: Record<HorseLeg, Hoof>;
}
/** A hoof off skis: the middle of its sole, in the horse's frame, and its toe tipped down (radians; the hoof folded back in a stride). */
export interface Hoof { x: number; y: number; z: number; pitch: number }
/** Where each hoof's sole rests, the horse standing square. */
export const HOOF_REST: Record<HorseLeg, Hoof> = {
  f_l: { x: 0.15, y: 0, z: FORE_AT, pitch: 0 }, f_r: { x: -0.15, y: 0, z: FORE_AT, pitch: 0 },
  h_l: { x: 0.15, y: 0, z: HIND_AT, pitch: 0 }, h_r: { x: -0.15, y: 0, z: HIND_AT, pitch: 0 },
};

const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
const qx = (a: number) => new Quaternion().setFromAxisAngle(X, a), qy = (a: number) => new Quaternion().setFromAxisAngle(Y, a), qz = (a: number) => new Quaternion().setFromAxisAngle(Z, a);
const rad = (d: number) => (d * Math.PI) / 180;
const mul = (...q: Quaternion[]) => q.reduce((a, b) => a.multiply(b), new Quaternion());

export function restHorsePose(): HorsePose {
  const ski = (): HorseSki => ({ x: 0, z: 0, up: 0, yaw: 0, pitch: 0, edge: 0 });
  return { height: 0, bodyX: 0, bodyZ: 0, yaw: 0, roll: 0, pitch: 0, arch: 0, twist: 0, neck: 0, neckYaw: 0, head: 0, ears: 0, tail: 0, tailYaw: 0, skis: { l: ski(), r: ski() }, front: 0, hind: 0, spread: 0, spin: 0, flip: 0, lift: 0 };
}
/** A pose `w` of the way from `a` to `b`, every number of it. */
export function mixHorse(a: HorsePose, b: HorsePose, w: number): HorsePose {
  const m = (x: number, y: number) => x + (y - x) * w, ski = (s: Side): HorseSki => {
    const p = a.skis[s], q = b.skis[s];
    return { x: m(p.x, q.x), z: m(p.z, q.z), up: m(p.up, q.up), yaw: m(p.yaw, q.yaw), pitch: m(p.pitch, q.pitch), edge: m(p.edge, q.edge) };
  };
  const out = { ...a } as HorsePose;
  for (const k of Object.keys(a) as (keyof HorsePose)[]) if (typeof a[k] === 'number') (out as unknown as Record<string, number>)[k] = m(a[k] as number, (b[k] as number | undefined) ?? (a[k] as number));
  out.skis = { l: ski('l'), r: ski('r') };
  if (a.hooves && b.hooves) {
    const hoof = (l: HorseLeg): Hoof => { const p = a.hooves![l], q = b.hooves![l]; return { x: m(p.x, q.x), y: m(p.y, q.y), z: m(p.z, q.z), pitch: m(p.pitch, q.pitch) }; };
    out.hooves = { f_l: hoof('f_l'), f_r: hoof('f_r'), h_l: hoof('h_l'), h_r: hoof('h_r') };
  } else out.hooves = w < 0.5 ? a.hooves : b.hooves;
  return out;
}

export class Horse {
  readonly model = new Group();
  /** Where a rider sits: on its back over its middle, a frame that moves with the spine (its origin 0.6 under the seat, where a rider's stirrups hang). */
  readonly saddle = new Object3D();
  readonly mesh: SkinnedMesh;
  private readonly bones = new Map<string, Bone>();
  private readonly wq = new Map<string, Quaternion>();
  private readonly wp = new Map<string, Vector3>();
  private skiKind: HorseSkis;
  private skiMeshes: Mesh[] = [];
  /** Its saddle, cloth, girth, stirrups and bridle; the reins; and where the bit's rings are from the head's joint. */
  private readonly tack: SkinnedMesh[];
  private readonly reins: Mesh;
  private readonly bits: Vector3[];
  /** The skis' turns and places as last posed (in the horse's frame), by `l`, `r` or by leg. */
  private readonly skiAt = new Map<string, { at: Vector3; q: Quaternion }>();
  /** How far each leg was stretched to reach its ski as last posed, as a share of its length. */
  readonly reach: Record<HorseLeg, number> = { f_l: 0, f_r: 0, h_l: 0, h_r: 0 };

  constructor(skis: HorseSkis = 'pair') {
    this.skiKind = skis;
    for (const [n, , p] of BONES) {
      const b = new Bone();
      b.name = n;
      const at = new Vector3(...p);
      const parent = PARENT.get(n);
      b.position.copy(parent ? at.clone().sub(rest(parent)) : at);
      this.bones.set(n, b);
      if (parent) this.bones.get(parent)!.add(b);
    }
    const root = this.bones.get('root')!;
    this.model.add(root);
    this.model.updateMatrixWorld(true);
    const all = [...this.bones.values()], index = new Map(all.map((b, i) => [b.name, i])), skeleton = new Skeleton(all);
    // Its look (`horseBody.ts`): coat, hair, eyes, and tack for when it is ridden; each part's points given to their bones.
    // (Made once, and shared by every horse: sculpting the body takes a second.)
    const looks = (LOOKS ??= (() => {
      const made = horseLooks(rest), merge = (parts: Part[]) => mergeGeometries(parts.map(({ geometry, weights, colours }) => {
        const g = geometry.clone(), n = g.getAttribute('position').count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          weights[i].filter(([, x]) => x > 1e-4).slice(0, 4).forEach(([b, x], j) => { si[i * 4 + j] = index.get(b)!; sw[i * 4 + j] = x; });
          col.set([colours[i].r, colours[i].g, colours[i].b], i * 3);
        }
        g.setAttribute('skinIndex', new BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new BufferAttribute(sw, 4));
        g.setAttribute('color', new BufferAttribute(col, 3));
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'skinIndex', 'skinWeight', 'color'].includes(name)) g.deleteAttribute(name);
        if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
        return g;
      }));
      return { coat: merge(made.coat), hair: merge(made.hair), eyes: merge(made.eyes), tack: merge(made.tack), steel: merge(made.steel) };
    })());
    const skinned = (geometry: BufferGeometry, material: MeshStandardMaterial | MeshLambertMaterial) => {
      const mesh = new SkinnedMesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.model.add(mesh);
      mesh.updateMatrixWorld(true);
      mesh.bind(skeleton);
      return mesh;
    };
    this.mesh = skinned(looks.coat, new MeshStandardMaterial({ vertexColors: true, roughness: 0.52 }));
    // (Hair gives back no sheen at all: thin strands seen edge on caught the sky, however matt, and showed grey.)
    skinned(looks.hair, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }));
    skinned(looks.eyes, new MeshStandardMaterial({ vertexColors: true, roughness: 0.12 }));
    this.tack = [
      skinned(looks.tack, new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: DoubleSide })),
      skinned(looks.steel, new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 })),
    ];
    // The reins, from the bit's rings to a rider's hands, drawn anew each time they are moved (`setReins`).
    this.bits = bitRings(rest).map((p) => p.sub(rest('head')));
    this.reins = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: 0x3e2614, roughness: 0.8 }));
    this.reins.frustumCulled = false;
    this.reins.castShadow = true;
    this.model.add(this.reins);
    this.setTack(false);
    // (The seat is on the top of the barrel over the spine; a rider's frame stands 0.6 under it.)
    this.saddle.position.set(0, 1.22 + 0.34 - 0.6 - 1.32, -0.02);
    this.bones.get('spine')!.add(this.saddle);
    this.setSkis(skis);
    this.pose(restHorsePose());
  }

  get skis(): HorseSkis { return this.skiKind; }
  /** Puts its tack on (ridden) or takes it off. */
  setTack(on: boolean): void { for (const m of this.tack) m.visible = on; this.reins.visible = on; }
  /**
   * Draws the reins from the bit's rings to `hands` (a rider's left and right hands, in the world), each hanging a little between;
   * none, without hands.
   */
  setReins(hands: Vector3[] | null): void {
    if (!hands || !this.reins.visible) { this.reins.visible = this.reins.visible && !!hands; return; }
    const head = this.bones.get('head')!, toModel = this.model.matrixWorld.clone().invert(), pos: number[] = [], index: number[] = [];
    const sides = 5, along = 10, r = 0.007;
    this.bits.forEach((bit, k) => {
      const a = head.localToWorld(bit.clone()).applyMatrix4(toModel), b = hands[k].clone().applyMatrix4(toModel), base = pos.length / 3;
      const dir = b.clone().sub(a).normalize(), side = Math.abs(dir.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(side).normalize();
      for (let i = 0; i <= along; i++) {
        const t = i / along, c = a.clone().lerp(b, t).add(new Vector3(0, -0.06 * Math.sin(Math.PI * t), 0));
        for (let j = 0; j < sides; j++) { const th = (j / sides) * Math.PI * 2, p = c.clone().addScaledVector(side, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r); pos.push(p.x, p.y, p.z); }
      }
      for (let i = 0; i < along; i++) for (let j = 0; j < sides; j++) {
        const q = base + i * sides + j, w = base + i * sides + ((j + 1) % sides);
        index.push(q, w, q + sides, w, w + sides, q + sides);
      }
    });
    // (Written into the points it has, once it has them: given new ones each frame, the graphics card was given new buffers for them
    // each frame, twice over with the sun's shadows, the old ones left to be found unused.)
    const g = this.reins.geometry, had = g.getAttribute('position') as BufferAttribute | undefined;
    if (had && had.array.length === pos.length) { (had.array as Float32Array).set(pos); had.needsUpdate = true; }
    else { g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3)); g.setIndex(index); }
    g.computeVertexNormals();
  }
  /** Its skis changed: a long pair, or four short. */
  setSkis(kind: HorseSkis): void {
    for (const m of this.skiMeshes) { m.removeFromParent(); m.geometry.dispose(); }
    this.skiKind = kind;
    this.skiMeshes = (kind === 'pair' ? ['l', 'r'] : HORSE_LEGS).map(() => { const m = skiMesh(kind); this.model.add(m); return m; });
  }
  /** Each ski's mesh, by side (a pair) or by leg (four). */
  skiObjects(): Mesh[] { return this.skiMeshes; }
  /** How far ahead of its middle (between bindings) and behind it each ski reaches. */
  skiReach(): { ahead: number; behind: number } { const s = SKIS[this.skiKind]; return { ahead: s.ahead, behind: s.length - s.ahead }; }

  /** Puts the horse in a pose. Gives back how far its legs had to stretch to reach their skis, as a share of their length (over 1: not reached). */
  pose(a: HorsePose): number {
    const wq = this.wq, wp = this.wp;
    wq.clear(); wp.clear();
    wq.set('root', new Quaternion()); wp.set('root', new Vector3());
    // The whole, turned about the middle of the barrel and lifted (on skis, by their thickness more).
    const shod = a.hooves, under = shod ? 0 : SKI_T;
    const R = bodyTurn(a.spin, a.flip, a.cork ?? 0), pivot = new Vector3(a.bodyX, 1.22 + under + a.height, a.bodyZ);
    const place = (v: Vector3) => v.sub(pivot).applyQuaternion(R).add(pivot).setY(v.y + a.lift);
    const Rb = mul(R, qy(a.yaw), qz(a.roll), qx(a.pitch));
    // The body, turned about its spine.
    const spineAt = place(rest('spine').add(new Vector3(a.bodyX, under + a.height, a.bodyZ)));
    wq.set('hips', Rb.clone().multiply(qx(-a.arch * 0.5)).multiply(qy(-a.twist * 0.5)));
    wp.set('hips', spineAt.clone().sub(rest('spine').sub(rest('hips')).applyQuaternion(wq.get('hips')!)));
    const fk = (n: string, q: Quaternion) => {
      const p = PARENT.get(n)!;
      wp.set(n, wp.get(p)!.clone().add(rest(n).sub(rest(p)).applyQuaternion(wq.get(p)!)));
      wq.set(n, q);
    };
    fk('spine', Rb.clone());
    fk('chest', Rb.clone().multiply(qx(a.arch * 0.5)).multiply(qy(a.twist * 0.5)));
    fk('neck1', wq.get('chest')!.clone().multiply(qy(a.neckYaw * 0.5)).multiply(qx(a.neck * 0.5)));
    fk('neck2', wq.get('neck1')!.clone().multiply(qy(a.neckYaw * 0.5)).multiply(qx(a.neck * 0.5)));
    fk('head', wq.get('neck2')!.clone().multiply(qx(a.head)));
    for (const k of ['l', 'r'] as const) fk(`ear_${k}`, wq.get('head')!.clone().multiply(qx(-a.ears * 1.15)).multiply(qz(a.ears * 0.4 * (k === 'l' ? -1 : 1))));
    fk('tail1', wq.get('hips')!.clone().multiply(qy(a.tailYaw)).multiply(qx(a.tail * 0.95)));
    fk('tail2', wq.get('tail1')!.clone().multiply(qy(a.tailYaw * 0.5)).multiply(qx(a.tail * 0.45)));
    fk('tail3', wq.get('tail2')!.clone().multiply(qx(a.tail * 0.3)));
    // The skis, and where each hoof stands on them.
    this.skiAt.clear();
    const soles: Record<HorseLeg, { at: Vector3; q: Quaternion }> = {} as Record<HorseLeg, { at: Vector3; q: Quaternion }>;
    for (const m of this.skiMeshes) m.visible = !shod;
    if (shod) for (const leg of HORSE_LEGS) { const h = shod[leg]; soles[leg] = { at: place(new Vector3(h.x, h.y, h.z)), q: R.clone().multiply(qx(h.pitch)) }; }
    else for (const k of ['l', 'r'] as const) {
      const s = a.skis[k], sign = k === 'l' ? 1 : -1, Rs = mul(qy(s.yaw), qx(s.pitch), qz(s.edge)), q = R.clone().multiply(Rs);
      if (this.skiKind === 'pair') {
        const centre = new Vector3(0.15 * sign + s.x, s.up, s.z + MID);
        this.skiAt.set(k, { at: place(centre.clone()), q });
        for (const [f, dz] of [['f', BINDINGS / 2], ['h', -BINDINGS / 2]] as const) soles[`${f}_${k}`] = { at: place(centre.clone().add(new Vector3(0, SKI_T, dz).applyQuaternion(Rs))), q };
      } else {
        // (Each side's two along a line as a long ski's bindings are, turned with it.)
        for (const [f, dz, lift, apart] of [['f', BINDINGS / 2, a.front, a.spread], ['h', -BINDINGS / 2, a.hind, -a.spread]] as const) {
          const centre = new Vector3(0.15 * sign + s.x, s.up, s.z + MID).add(new Vector3(0, lift, dz + apart).applyQuaternion(Rs));
          this.skiAt.set(`${f}_${k}`, { at: place(centre.clone()), q });
          soles[`${f}_${k}`] = { at: place(centre.clone().add(new Vector3(0, SKI_T, 0).applyQuaternion(Rs))), q };
        }
      }
    }
    // The legs, from the skis up.
    let stretch = 0;
    const aim = (n: string, next: Vector3, up: Quaternion) => {
      const from = rest(this.childOf(n)).sub(rest(n)).applyQuaternion(up).normalize(), to = next.clone().sub(wp.get(n)!).normalize();
      return new Quaternion().setFromUnitVectors(from, to).multiply(up);
    };
    for (const leg of HORSE_LEGS) {
      const [f, k] = leg.split('_') as ['f' | 'h', Side], fore = f === 'f', { at: sole, q } = soles[leg];
      const up = Y.clone().applyQuaternion(q), fwd = Z.clone().applyQuaternion(q);
      const coronet = sole.clone().addScaledVector(up, 0.07).addScaledVector(fwd, -0.02), fetlock = coronet.clone().addScaledVector(up, 0.1).addScaledVector(fwd, -0.07);
      if (fore) {
        // The shoulder blade swings with the leg, about its top under the withers: a third as far as the leg reaches forward or back
        // from where it rests, carrying the point of the shoulder with it (as a horse's does; so too its reach).
        const chestQ = wq.get('chest')!, toBody = chestQ.clone().invert(), blade = rest(`f_sc_${k}`);
        fk(`f_sc_${k}`, chestQ.clone());
        const shoulder0 = wp.get(`f_sc_${k}`)!.clone().add(rest(`f_up_${k}`).sub(blade).applyQuaternion(chestQ));
        const reachNow = fetlock.clone().sub(shoulder0).applyQuaternion(toBody), reachRest = rest(`f_pas_${k}`).sub(rest(`f_up_${k}`));
        const swing = Math.atan2(reachNow.z, -reachNow.y) - Math.atan2(reachRest.z, -reachRest.y);
        wq.set(`f_sc_${k}`, chestQ.clone().multiply(qx(-0.33 * Math.max(-0.9, Math.min(0.9, swing)))));
      }
      fk(`${f}_up_${k}`, new Quaternion()); // (its place, from the shoulder blade or the hips; its turn is found below)
      const top = wp.get(`${f}_up_${k}`)!, n = (s: string) => `${f}_${s}_${k}`;
      const L1 = rest(n('mid')).distanceTo(rest(n('up'))), L2 = rest(n('low')).distanceTo(rest(n('mid'))), Lc = rest(n('pas')).distanceTo(rest(n('low')));
      const restReach = rest(n('low')).distanceTo(rest(n('up')));
      // The cannon stands on the pastern as it rests, tipped as the leg is gathered: the knee forward under a fore leg, the hock back.
      const cannon0 = rest(n('low')).sub(rest(n('pas'))).normalize().applyQuaternion(q);
      const gathered = Math.max(0, Math.min(1, (restReach - top.distanceTo(fetlock.clone().addScaledVector(cannon0, Lc))) / restReach));
      const bodyFwd = Z.clone().applyQuaternion(wq.get(fore ? 'chest' : 'hips')!), side = X.clone().applyQuaternion(q);
      const cannon = cannon0.clone().applyAxisAngle(side, (fore ? -0.9 : 0.6) * gathered).normalize();
      // (Off skis, a hoof flat on the ground lets its fetlock give, so that the cannon lies along the leg's line, from the hoof up
      // towards the shoulder or the hip, as the leg sweeps under the body; folded in a stride, the hoof's tip sets it.)
      if (shod) cannon.lerp(top.clone().sub(fetlock).normalize(), 0.65 * (1 - Math.min(1, Math.max(0, Math.abs(shod[leg].pitch) - 0.2) / 0.4))).normalize();
      const knee = fetlock.clone().addScaledVector(cannon, Lc);
      const d = knee.clone().sub(top), len = d.length(), reach = Math.min(len, (L1 + L2) * 0.999), u = d.clone().normalize();
      stretch = Math.max(stretch, len / (L1 + L2));
      this.reach[leg] = len / (L1 + L2);
      const bend = bodyFwd.clone().multiplyScalar(fore ? -1 : 1), w = bend.clone().addScaledVector(u, -bend.dot(u)).normalize();
      const cosA = (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach), A = Math.acos(Math.max(-1, Math.min(1, cosA)));
      const midAt = top.clone().addScaledVector(u, Math.cos(A) * L1).addScaledVector(w, Math.sin(A) * L1);
      // (Each bone placed at the end of the one above it, then aimed at where the next joint is to be.)
      const step = (bone: string, target: Vector3) => { fk(bone, new Quaternion()); wq.set(bone, aim(bone, target, wq.get(PARENT.get(bone)!)!)); };
      wq.set(n('up'), aim(n('up'), midAt, wq.get(fore ? `f_sc_${k}` : 'hips')!));
      step(n('mid'), top.clone().addScaledVector(u, reach));
      step(n('low'), fetlock);
      step(n('pas'), coronet);
      fk(n('hoof'), q.clone());
    }
    this.apply();
    return stretch;
  }

  private childOf(n: string): string {
    if (n === 'head') return 'muzzle';
    if (n === 'tail3') return 'tail_end';
    if (n.startsWith('ear_')) return `ear_tip_${n.slice(-1)}`;
    if (n.startsWith('f_sc_')) return `f_up_${n.slice(-1)}`;
    const leg = n.match(/^([fh])_(up|mid|low|pas)_([lr])$/);
    if (leg) return `${leg[1]}_${{ up: 'mid', mid: 'low', low: 'pas', pas: 'hoof' }[leg[2]]}_${leg[3]}`;
    return { hips: 'spine', spine: 'chest', chest: 'neck1', neck1: 'neck2', neck2: 'head', tail1: 'tail2', tail2: 'tail3' }[n] ?? n;
  }

  /** Gives every bone its turn from its parent's, the hips their place, and the skis theirs. */
  private apply(): void {
    for (const [n, b] of this.bones) {
      const p = PARENT.get(n), q = this.wq.get(n) ?? new Quaternion();
      b.quaternion.copy(p ? (this.wq.get(p) ?? new Quaternion()).clone().invert().multiply(q) : q);
    }
    this.bones.get('hips')!.position.copy(this.wp.get('hips')!);
    const keys = this.skiKind === 'pair' ? ['l', 'r'] : HORSE_LEGS;
    keys.forEach((k, i) => { const s = this.skiAt.get(k); if (s) { this.skiMeshes[i].position.copy(s.at); this.skiMeshes[i].quaternion.copy(s.q); } });
    this.model.updateMatrixWorld(true);
  }

  /** Where each ski's middle is on the snow, in the world: under each side (a pair) or each hoof (four). */
  skiMiddles(): Vector3[] {
    return this.skiMeshes.map((m) => m.localToWorld(new Vector3(0, 0, (SKIS[this.skiKind].ahead - (SKIS[this.skiKind].length - SKIS[this.skiKind].ahead)) / 2)));
  }

  // ---------------------------------------------------------------- gone limp

  /** The points a body gone limp is made of: the joints, the muzzle and the tail's end, and each ski's tip and tail, by name. */
  spec(): BodySpec { return horseSpec(this.skiKind); }
  /** Where those points are now, in the world. */
  joints(): Record<string, Vector3> {
    this.model.updateMatrixWorld(true);
    const out: Record<string, Vector3> = {};
    for (const j of this.spec().joints) {
      if (j === 'muzzle') out[j] = this.bones.get('head')!.localToWorld(rest('muzzle').sub(rest('head')));
      else if (j === 'tail_end') out[j] = this.bones.get('tail3')!.localToWorld(rest('tail_end').sub(rest('tail3')));
      else if (j.startsWith('ski_')) {
        const [, key, end] = j.match(/^ski_(.+)_(tip|tail)$/)!, i = (this.skiKind === 'pair' ? ['l', 'r'] : HORSE_LEGS).indexOf(key as HorseLeg), s = SKIS[this.skiKind];
        out[j] = this.skiMeshes[i].localToWorld(new Vector3(0, 0.01, end === 'tip' ? s.ahead - 0.1 : -(s.length - s.ahead) + 0.05));
      } else out[j] = this.bones.get(j)!.getWorldPosition(new Vector3());
    }
    return out;
  }
  /**
   * The skeleton put through points placed anywhere, in the frame of what holds the horse: the hips and the chest turned as the frames
   * of their points are (the spine between), the neck, the head, the tail and each leg aimed bone by bone at the next point, each hoof
   * and its ski turned as the ski's tip and tail and the pastern above it lie.
   */
  poseJoints(p: Record<string, Vector3>): void {
    const wq = this.wq, wp = this.wp;
    wq.clear(); wp.clear();
    wq.set('root', new Quaternion()); wp.set('root', new Vector3());
    const frame = (a: Vector3, b: Vector3) => { const z = a.clone().normalize(), x = b.clone().addScaledVector(z, -b.dot(z)).normalize(), y = z.clone().cross(x); return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)); };
    const turnOf = (a0: Vector3, b0: Vector3, a1: Vector3, b1: Vector3) => frame(a1, b1).multiply(frame(a0, b0).invert());
    const q = (n: string) => p[n].clone();
    const hipsQ = turnOf(rest('spine').sub(rest('hips')), rest('h_up_l').sub(rest('h_up_r')), q('spine').sub(q('hips')), q('h_up_l').sub(q('h_up_r')));
    const chestQ = turnOf(rest('neck1').sub(rest('chest')), rest('f_up_l').sub(rest('f_up_r')), q('neck1').sub(q('chest')), q('f_up_l').sub(q('f_up_r')));
    wq.set('hips', hipsQ); wp.set('hips', q('hips'));
    const fk = (n: string, qq: Quaternion) => { const par = PARENT.get(n)!; wp.set(n, wp.get(par)!.clone().add(rest(n).sub(rest(par)).applyQuaternion(wq.get(par)!))); wq.set(n, qq); };
    const aimAt = (n: string, target: Vector3) => {
      const up = wq.get(PARENT.get(n)!)!, from = rest(this.childOf(n)).sub(rest(n)).applyQuaternion(up).normalize(), to = target.clone().sub(wp.get(n)!);
      return to.lengthSq() > 1e-10 ? new Quaternion().setFromUnitVectors(from, to.normalize()).multiply(up) : up.clone();
    };
    const chain = (n: string, target: Vector3) => { fk(n, new Quaternion()); wq.set(n, aimAt(n, target)); };
    fk('spine', hipsQ.clone().slerp(chestQ, 0.5));
    fk('chest', chestQ);
    chain('neck1', q('neck2'));
    chain('neck2', q('head'));
    chain('head', q('muzzle'));
    for (const k of ['l', 'r'] as const) fk(`ear_${k}`, wq.get('head')!.clone());
    chain('tail1', q('tail_end'));
    fk('tail2', wq.get('tail1')!.clone()); fk('tail3', wq.get('tail1')!.clone());
    this.skiAt.clear();
    for (const k of ['l', 'r'] as const) fk(`f_sc_${k}`, chestQ.clone());
    for (const leg of HORSE_LEGS) {
      const [f, k] = leg.split('_'), n = (s: string) => `${f}_${s}_${k}`;
      chain(n('up'), q(n('mid'))); chain(n('mid'), q(n('low'))); chain(n('low'), q(n('pas'))); chain(n('pas'), q(n('hoof')));
      const key = this.skiKind === 'pair' ? k : leg, tip = q(`ski_${key}_tip`), tail = q(`ski_${key}_tail`), s = SKIS[this.skiKind];
      // (The ski's frame: along it from tail to tip, and its left, across it from the pastern standing over it.)
      const along = tip.clone().sub(tail), skiQ = frame(along, q(n('pas')).sub(q(n('hoof'))).cross(along));
      fk(n('hoof'), skiQ);
      const behind = s.length - s.ahead;
      this.skiAt.set(key, { at: tail.clone().addScaledVector(tip.clone().sub(tail).normalize(), behind - 0.05).addScaledVector(Y.clone().applyQuaternion(skiQ), -0.01), q: skiQ });
    }
    this.apply();
  }
}

// ------------------------------------------------------------------ a horse gone limp

/** The points of a horse gone limp, and how they hold together. */
export function horseSpec(skis: HorseSkis): BodySpec {
  const legs = HORSE_LEGS.flatMap((l) => { const [f, k] = l.split('_'); return ['up', 'mid', 'low', 'pas', 'hoof'].map((s) => `${f}_${s}_${k}`); });
  const skiKeys = skis === 'pair' ? ['l', 'r'] : HORSE_LEGS;
  const joints = ['hips', 'spine', 'chest', 'neck1', 'neck2', 'head', 'muzzle', 'tail1', 'tail_end', ...legs, ...skiKeys.flatMap((k) => [`ski_${k}_tip`, `ski_${k}_tail`])];
  return {
    joints,
    radius: (j) => (({ hips: 0.3, spine: 0.32, chest: 0.3, neck1: 0.18, neck2: 0.13, head: 0.12, muzzle: 0.09, tail1: 0.06 }) as Record<string, number>)[j] ?? (j.startsWith('ski_') ? 0.02 : 0.06),
    links(link) {
      // The barrel nearly stiff, braced between the shoulders and the hips; the neck, the head and the tail in their bones.
      const soft = (stiff: number) => ({ stiff });
      link('hips', 'spine'); link('spine', 'chest'); link('hips', 'chest', soft(0.8));
      link('chest', 'neck1'); link('spine', 'neck1', soft(0.6)); link('neck1', 'neck2'); link('neck2', 'head'); link('head', 'muzzle'); link('neck1', 'head', soft(0.25));
      link('hips', 'tail1'); link('spine', 'tail1', soft(0.6)); link('tail1', 'tail_end');
      link('f_up_l', 'f_up_r'); link('h_up_l', 'h_up_r');
      for (const k of ['l', 'r'] as const) {
        link(`f_up_${k}`, 'chest'); link(`f_up_${k}`, 'spine', soft(0.8)); link(`f_up_${k}`, 'neck1', soft(0.8));
        link(`h_up_${k}`, 'hips'); link(`h_up_${k}`, 'spine', soft(0.8)); link(`h_up_${k}`, 'tail1', soft(0.8));
      }
      for (const l of HORSE_LEGS) {
        const [f, k] = l.split('_'), n = (s: string) => `${f}_${s}_${k}`, len = (a: string, b: string) => rest(n(a)).distanceTo(rest(n(b)));
        link(n('up'), n('mid')); link(n('mid'), n('low')); link(n('low'), n('pas')); link(n('pas'), n('hoof'));
        // (Never folded quite flat.)
        link(n('up'), n('low'), { least: (len('up', 'mid') + len('mid', 'low')) * 0.4 }); link(n('mid'), n('pas'), { least: (len('mid', 'low') + len('low', 'pas')) * 0.4 });
      }
      // Each ski stiff with the hooves bound to it and their pasterns.
      for (const key of skiKeys) {
        const bound = skis === 'pair' ? [`f_hoof_${key}`, `f_pas_${key}`, `h_hoof_${key}`, `h_pas_${key}`] : [`${key.split('_')[0]}_hoof_${key.split('_')[1]}`, `${key.split('_')[0]}_pas_${key.split('_')[1]}`];
        const piece = [`ski_${key}_tip`, `ski_${key}_tail`, ...bound];
        for (let a = 0; a < piece.length; a++) for (let b = a + 1; b < piece.length; b++) link(piece[a], piece[b]);
      }
    },
  };
}

// ------------------------------------------------------------------ skiing

/**
 * A skiing horse's pose from what it is doing, as a skier's is (`riderPose`): carving into a turn, its body leant in over skis swung
 * out under it and on their edges, lower in the turn, its head turned into it; nodding as each turn begins, where a skier flicks its
 * pole; tucked, low with the neck stretched out level ahead as a racehorse's, its ears laid back and its tail streaming; standing tall,
 * the head up and drawn in, the ears pricked; braking, a reining horse's sliding stop, sat down on its hocks over the skis thrown
 * across, its fore legs braced ahead; skidding, some of that; sunk into a landing.
 */
export function horseRidePose(c: RideControls): HorsePose {
  const a = restHorsePose(), { s, ski, tuck, brake, tall } = c, skid = c.skid ?? 0, absorb = c.absorb ?? 0, nod = Math.max(c.flickL, c.flickR);
  a.height = -0.08 - 0.16 * Math.abs(s);
  a.bodyX = 0.12 * s;
  a.roll = -rad(18) * s;
  a.yaw = 0.95 * ski;
  a.neckYaw = 0.25 * s - 0.4 * ski;
  a.neck = rad(8);
  a.head = rad(6);
  a.tail = 0.15 + 0.1 * Math.abs(s);
  // Carving deep (asked: "make the maximum carving angles larger"): out past six tenths of the turns' lean, laid further in over skis
  // further out from under it and higher on their edges, lower, as a skier is (`riderPose`).
  const deep = Math.sign(s) * Math.max(0, Math.abs(s) - 0.6) * (1 - skid);
  a.height -= 0.12 * Math.abs(deep); a.bodyX += 0.16 * deep; a.roll -= rad(18) * deep;
  const edge = -rad(28) * s * (1 - 0.4 * skid) - rad(22) * deep - rad(22) * brake;
  for (const k of ['l', 'r'] as const) a.skis[k] = { x: -0.08 * s - 0.1 * deep, z: 0, up: 0, yaw: ski, pitch: 0, edge };
  a.head += rad(14) * nod; a.neck += rad(6) * nod;
  // The tuck.
  a.height -= 0.26 * tuck; a.pitch += rad(4) * tuck; a.neck += rad(46) * tuck; a.head -= rad(30) * tuck; a.ears += tuck; a.tail += 0.7 * tuck;
  // Standing tall.
  a.height += 0.04 * tall; a.neck -= rad(18) * tall; a.head += rad(22) * tall; a.tail += 0.25 * tall;
  // The sliding stop, and some of it in a skid.
  const sit = Math.max(brake, 0.35 * skid);
  a.pitch -= rad(6) * sit; a.height -= 0.24 * sit; a.bodyZ -= 0.06 * sit; a.arch += rad(6) * sit; a.neck -= rad(12) * sit; a.head += rad(10) * sit; a.tail += 0.3 * sit;
  a.ears += 0.3 * sit;
  // Sunk into a landing.
  a.height -= 0.2 * absorb; a.neck += rad(10) * absorb; a.head += rad(6) * absorb;
  // Its life: breathing in the neck and the head's carriage, looking about, the ears turning to what it hears, the tail swishing; its
  // legs giving to the snow's shape; going switch, its neck turned to look back over its shoulder the way it goes.
  if (c.life !== undefined) {
    const L = lifeAt(c.life), t = c.life, easy = 1 - tuck;
    a.neck += rad(2.5) * L.breath * easy; a.head += rad(3) * Math.sin(2 * Math.PI * 0.6 * t) * easy;
    a.neckYaw += 0.2 * L.look * easy;
    a.ears += (0.25 + 0.25 * Math.sin(2 * Math.PI * 0.23 * t + 1) ** 3) * easy * (1 - Math.min(1, a.ears));
    a.tailYaw += (0.22 * Math.sin(2 * Math.PI * 0.45 * t) + 0.1 * Math.sin(2 * Math.PI * 1.3 * t + 2)) * (1 - 0.6 * tuck);
    a.bodyX += 0.015 * L.shift * easy; a.roll += rad(1.5) * L.shift * easy;
  }
  const flex = c.flex ?? 0, back = c.back ?? 0;
  a.height -= 0.07 * flex; a.neck += rad(5) * flex;
  a.neckYaw += 0.7 * back; a.head -= rad(6) * back; a.ears += 0.3 * back;
  // Pressed onto its skis' tips: its weight forward onto its fore legs, the neck down and out; onto their tails: sat back on its hocks.
  const press = c.press ?? 0;
  if (press > 0) { a.neck += rad(20) * press; a.head -= rad(8) * press; a.bodyZ += 0.08 * press; a.tail += 0.4 * press; }
  else if (press < 0) { const q = -press; a.height -= 0.18 * q; a.bodyZ -= 0.08 * q; a.arch += rad(5) * q; a.neck -= rad(14) * q; a.head += rad(10) * q; a.tail += 0.3 * q; }
  // Skating: both skis in a V, their tips turned out, and set wider than it stands, so that the long skis' tails pass clear of each
  // other; a side at a time, its ski (on four, the side's two) pushed further out and a little back, turned out further and on its
  // inside edge, then lifted and drawn back in as the other side pushes; the body swaying over the gliding side, a little lower, the
  // neck nodding with each push. (A tip turned to the left is `yaw` up: the left ski's.)
  const sk = c.skate ?? 0;
  if (sk > 0.005) {
    const { side, out, lift } = strideAt(c.stride ?? 0), sgn = side === 'l' ? 1 : -1;
    for (const k of ['l', 'r'] as const) { const ks = k === 'l' ? 1 : -1; a.skis[k].x += ks * 0.13 * sk; a.skis[k].yaw += ks * rad(8) * sk; }
    const f = a.skis[side];
    f.x += sgn * 0.18 * out * sk; f.z -= 0.08 * out * sk; f.up += 0.1 * lift * sk; f.yaw += sgn * rad(5) * out * sk; f.edge += sgn * rad(18) * out * sk;
    a.height -= 0.06 * sk; a.bodyX -= sgn * 0.08 * (0.4 + 0.6 * out) * sk; a.roll -= sgn * rad(5) * out * sk; a.neck += rad(7) * out * sk; a.head -= rad(4) * out * sk;
  }
  // Springing off a lip: the legs driven long, the head and neck up (and back, set for a backflip).
  const pop = c.pop ?? 0;
  if (pop) { a.height += (0.1 - a.height) * pop; a.neck += (rad(-10) - rad(18) * tall - a.neck) * pop; a.head += (rad(10) - a.head) * pop; a.ears *= 1 - pop; a.pitch += (rad(-4) - a.pitch) * pop; }
  a.spin = c.spin ?? 0;
  a.flip = c.flip ?? 0;
  return a;
}

/**
 * A skiing horse in the air (the controls a skier's are, `AirControls`): sprung off the lip, its legs driven long under it and its head
 * up, folding from that into the trick; straight air, a show jumper's, its skis drawn up under it with the legs folded, the neck
 * arched down and the back rounded over them (the fore skis drawn higher still on four); a ski jumper's flight as a horse can fly one,
 * stretched out along its skis, which are spread at their tips, the neck reaching out ahead and the ears back (on four skis, the fore
 * pushed forward and the hind back, as a horse stretches over a ditch); the backflip's throw, its head flung up and back; laid out in a
 * flip, stretched long; round a spin, its legs flung out wide, its neck and head turned into it ahead of its body, round to the landing first; its
 * head back for the snow in a flip. Its own tricks: for a grab, a whip, its skis flung out to one side under it and its body laid over
 * the other way (`mute` to its left, `tail` to its right); for a spread eagle, on four short skis a capriole, as the white horses of
 * Vienna leap, the fore legs folded under and the hind kicked out behind, and on a long pair the splits, its skis flung wide either
 * side. Opened up to land into its stance, the legs let long to reach for the snow.
 */
export function horseAirPose(c: AirControls, four: boolean): HorsePose {
  const pop = c.pop ?? 0, lead = Math.max(-1, Math.min(1, c.lead ?? 0)), spot = c.spot ?? 0, layout = c.layout ?? 0, spread = c.spread ?? 0, reach = c.reach ?? 0;
  const whip = (c.mute ?? 0) - (c.tail ?? 0), whipW = Math.abs(whip), side = Math.sign(whip);
  const stance = horseRidePose({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 });
  const tucked = horseRidePose({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 }), draw = 0.44 + 0.12 * c.tuck - 0.16 * c.wrap;
  tucked.height -= 0.02;
  for (const k of ['l', 'r'] as const) { tucked.skis[k].up += draw; tucked.skis[k].pitch -= rad(6); }
  if (four) { tucked.front += 0.14; tucked.hind -= 0.04; }
  tucked.arch += rad(8); tucked.neck += rad(22) + rad(10) * c.wrap; tucked.head += rad(14); tucked.tail = 0.55; tucked.ears = 0.2;
  // The backflip's throw.
  if (c.throw) { tucked.neck -= rad(40) * c.throw; tucked.head -= rad(30) * c.throw; tucked.tail += 0.3 * c.throw; tucked.arch -= rad(6) * c.throw; }
  const flight = horseRidePose({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 });
  // (Not laid forward over its skis as a ski jumper is: a horse is level already, and laid forward it dives. It stretches out along
  // them instead, the neck reaching out ahead, the nose along it, the legs long.)
  Object.assign(flight, { height: 0, neck: rad(24), head: rad(-30), ears: 1, tail: 1, arch: rad(-5) });
  for (const k of ['l', 'r'] as const) {
    const sign = k === 'l' ? 1 : -1;
    Object.assign(flight.skis[k], { yaw: rad(four ? 10 : 5) * sign, x: (four ? 0.06 : 0.03) * sign, up: 0, pitch: 0 });
  }
  if (four) flight.spread = 0.12;
  let a = mixHorse(tucked, flight, c.flight);
  // Laid out in a flip: long from the nose to the tail, the back a little hollowed, the legs long under it.
  if (layout) {
    const out = horseRidePose({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 });
    Object.assign(out, { height: 0.04, neck: rad(-6), head: rad(-24), ears: 0.8, tail: 1, arch: rad(-10) });
    for (const k of ['l', 'r'] as const) Object.assign(out.skis[k], { up: 0.06, pitch: 0 });
    a = mixHorse(a, out, layout);
  }
  // A capriole on four skis: the fore legs folded up under the chest, the hind kicked out straight behind, the tail streaming, the head
  // up. The splits on a pair: the skis flung wide either side, tipped onto their outer edges, the head up, the ears pricked.
  if (spread) {
    const wide = horseRidePose({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 });
    Object.assign(wide, { height: 0.02, neck: rad(-8), head: rad(-10), ears: 0, tail: 1, arch: rad(-4) });
    if (four) {
      // (The body carried forward over the skis, so that the fore ones come back up under the chest and the hind ones go out behind;
      // the hind drawn up level with the belly, the legs kicked out long to them.)
      Object.assign(wide, { front: 0.36, hind: 0.42, spread: 0.3, bodyZ: 0.34, pitch: rad(-6), arch: rad(-8) });
      for (const k of ['l', 'r'] as const) Object.assign(wide.skis[k], { up: 0.16, pitch: rad(-4) });
    } else for (const k of ['l', 'r'] as const) {
      const sign = k === 'l' ? 1 : -1;
      Object.assign(wide.skis[k], { x: 0.34 * sign, up: 0.22, yaw: rad(6) * sign, edge: rad(-34) * sign, pitch: 0 });
    }
    a = mixHorse(a, wide, spread);
  }
  // Round a spin, its legs flung out wide from under it (as a body thrown round spreads), the skis apart and on their outer edges;
  // on four short skis the fore and the hind apart along it too.
  if (c.wrap) {
    const fling = c.wrap * (1 - c.open) * (1 - spread);
    for (const k of ['l', 'r'] as const) {
      const sign = k === 'l' ? 1 : -1;
      a.skis[k].x += 0.24 * sign * fling; a.skis[k].edge -= rad(22) * sign * fling; a.skis[k].up += 0.06 * fling; a.skis[k].yaw += rad(5) * sign * fling;
    }
    if (four) { a.spread += 0.18 * fling; a.front -= 0.08 * fling; }
    a.tail += 0.3 * fling; a.ears += 0.4 * fling;
  }
  // The whip: the skis flung out to one side under it, turned across, the body laid over the other way and the neck turned back
  // against them, the tail flung out after them.
  if (whipW) {
    for (const k of ['l', 'r'] as const) { a.skis[k].x += 0.42 * side * whipW; a.skis[k].yaw += rad(36) * side * whipW; a.skis[k].edge -= rad(20) * side * whipW; a.skis[k].up += 0.1 * whipW; }
    a.roll -= rad(24) * side * whipW; a.yaw -= rad(10) * side * whipW; a.neckYaw -= 0.5 * side * whipW; a.tailYaw += 0.6 * side * whipW; a.tail += 0.3 * whipW;
  }
  // The spring off the lip: the legs driven long under it, the head and neck up, the ears pricked.
  if (pop) {
    const sprung = horseRidePose({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 });
    Object.assign(sprung, { height: 0.1, neck: rad(-10) - rad(18) * (c.set ?? 0), head: rad(10), ears: 0, tail: 0.5, pitch: rad(-4), arch: rad(-4) });
    a = mixHorse(a, sprung, pop);
  }
  // Opened up to land, the legs let long to reach for the snow.
  const land = mixHorse(stance, stance, 0);
  land.height += 0.08 * reach; land.neck -= rad(8) * reach; land.head += rad(6) * reach;
  a = mixHorse(a, land, c.open);
  // Round a spin, the neck and head turned ahead into it and the chest a little ahead of the hips; in a flip, the head back for the snow.
  const held = 1 - c.open;
  a.neckYaw += 0.7 * lead * held; a.twist += 0.25 * lead * held;
  a.head -= rad(30) * spot * held; a.neck -= rad(14) * spot * held;
  for (const k of ['l', 'r'] as const) a.skis[k].yaw += c.ski;
  a.yaw += 0.95 * c.ski;
  a.spin = c.spin;
  a.flip += c.flip;
  a.cork = c.cork ?? 0;
  return a;
}

// ------------------------------------------------------------------ a rider on it

/**
 * The pose of a rider astride a skiing horse, in the frame of its saddle (`Horse.saddle`; the rider's hips 0.7 over that frame's
 * floor, which is 0.6 under the seat): sat down in the saddle, the legs long round the barrel and the feet at its sides, a long pole in
 * each hand to reach the snow from up there; leant into the turn with the horse and a little more, the inside pole flicked to the snow
 * as each turn begins; crouched as a jockey in the tuck, up out of the saddle and laid along the neck, the poles under the arms; sat
 * up straight standing tall; sat back and braced braking. In the air: the arms flung up for a backflip, in close for a spin, laid
 * flat along the neck in a flight; sat deep into a landing.
 */
export function saddlePose(c: RideControls & Partial<AirControls> & { reins?: number; post?: number }): AlpinePose {
  const { s, tuck, tall, brake } = c, absorb = c.absorb ?? 0, fl = c.flight ?? 0, th = c.throw ?? 0, wr = c.wrap ?? 0, reins = c.reins ?? 0, post = c.post ?? 0;
  const arm = (k: Side): AlpineArm => {
    const f = k === 'l' ? c.flickL : c.flickR, sign = k === 'l' ? -1 : 1;
    // (Holding the reins rather than poles: the hands low and together over the withers, the elbows bent at the sides.)
    const poles = { swing: rad(26) + rad(18) * f, bend: rad(40), wrist: rad(30) - rad(45) * f, hang: 50, inward: rad(4) * sign };
    const held = { swing: rad(18), bend: rad(78), wrist: rad(-6), hang: 80, inward: rad(18) * sign };
    return { swing: poles.swing + (held.swing - poles.swing) * reins, bend: poles.bend + (held.bend - poles.bend) * reins, wrist: poles.wrist + (held.wrist - poles.wrist) * reins,
      hang: poles.hang + (held.hang - poles.hang) * reins, inward: poles.inward + (held.inward - poles.inward) * reins };
  };
  const foot = (k: Side): AlpineFoot => { const sign = k === 'l' ? 1 : -1; return { x: 0.36 * sign, z: 0.06, up: 0, yaw: rad(14) * sign, pitch: rad(-10), edge: rad(-10) * sign }; };
  const a: AlpinePose = {
    hips: 0.7, hipsX: 0, hipsZ: 0, pelvisYaw: 0, pelvisRoll: 0, pelvisPitch: rad(4), chestYaw: 0, chestRoll: rad(8) * s, lean: rad(10), neck: rad(4), head: 0, headYaw: 0,
    arms: { l: arm('l'), r: arm('r') }, feet: { l: foot('l'), r: foot('r') }, spin: 0, flip: 0, cork: 0, lift: 0,
  };
  const both = (f: (k: Side, arm: AlpineArm, foot: AlpineFoot) => void) => { for (const k of ['l', 'r'] as const) f(k, a.arms[k], a.feet[k]); };
  // The jockey's crouch.
  const crouch = Math.max(tuck, fl);
  a.hips += 0.1 * crouch; a.hipsZ -= 0.06 * crouch; a.pelvisPitch += rad(34) * crouch; a.lean += rad(48) * crouch; a.neck -= rad(18) * crouch; a.head -= rad(38) * crouch;
  both((k, arm, f) => { arm.swing += rad(40) * crouch; arm.bend += (rad(95) - arm.bend) * crouch; arm.hang += (86 - arm.hang) * crouch; arm.wrist += (rad(85) - arm.wrist) * crouch; arm.inward += (rad(20) * (k === 'l' ? -1 : 1) - arm.inward) * crouch; f.z -= 0.1 * crouch; });
  // Sat up tall; sat back braced.
  a.lean -= rad(14) * tall; a.pelvisPitch -= rad(6) * tall; both((_k, arm) => { arm.swing -= rad(10) * tall; });
  a.lean -= rad(18) * brake; a.pelvisPitch -= rad(10) * brake; both((_k, arm, f) => { f.z += 0.16 * brake; arm.hang -= 14 * brake; });
  // In the air.
  if (th) { a.lean -= rad(20) * th; a.head -= rad(26) * th; both((_k, arm) => { arm.swing += rad(120) * th; arm.hang -= 30 * th; arm.bend -= rad(20) * th; }); }
  if (wr) both((_k, arm) => { arm.bend += rad(40) * wr; arm.hang += 14 * wr; });
  // Its own tricks. Laid out in a flip: leant back along the horse's back, the arms out. A no-hander for a spread eagle: the arms flung
  // out wide and up, the legs out from the horse's sides. A superman for a grab: up out of the saddle and stretched out flat behind it,
  // the hands on the pommel, the legs long and together over the quarters.
  const layout = c.layout ?? 0, spread = c.spread ?? 0, superman = Math.max(c.mute ?? 0, c.tail ?? 0), open = c.open ?? 0;
  if (layout) { a.lean -= rad(30) * layout; a.head -= rad(10) * layout; both((_k, arm) => { arm.swing += rad(30) * layout; arm.hang -= 50 * layout; arm.bend -= rad(20) * layout; }); }
  if (spread) {
    a.lean -= rad(8) * spread; a.head -= rad(12) * spread;
    both((k, arm, f) => { arm.swing += (rad(26) - arm.swing) * spread; arm.bend += (rad(8) - arm.bend) * spread; arm.hang += (-16 - arm.hang) * spread; arm.inward *= 1 - spread; f.x += 0.24 * (k === 'l' ? 1 : -1) * spread; f.up += 0.16 * spread; });
  }
  if (superman) {
    a.hips += 0.24 * superman; a.hipsZ -= 0.3 * superman; a.pelvisPitch += rad(72) * superman; a.lean += rad(12) * superman; a.neck -= rad(22) * superman; a.head -= rad(36) * superman;
    both((k, arm, f) => {
      // (The hands on the pommel, the poles turned back along the forearms; the legs out straight behind, the boots together.)
      arm.swing += (rad(70) - arm.swing) * superman; arm.bend += (rad(36) - arm.bend) * superman; arm.hang += (76 - arm.hang) * superman;
      arm.inward += (rad(14) * (k === 'l' ? -1 : 1) - arm.inward) * superman; arm.wrist += (rad(80) - arm.wrist) * superman;
      f.x += (0.09 * (k === 'l' ? 1 : -1) - f.x) * superman; f.z += (-1.0 - f.z) * superman; f.up += 0.84 * superman; f.pitch += rad(70) * superman; f.yaw *= 1 - superman; f.edge *= 1 - superman;
    });
  }
  // Its life, as a skier's: breathing, looking about, its hands never still; going switch, looking back over its shoulder.
  if (c.life !== undefined && c.open === undefined) {
    const L = lifeAt(c.life + 7), easy = 1 - Math.max(tuck, fl);
    a.lean += rad(1.5) * L.breath; a.headYaw += 0.5 * L.look * easy; a.chestYaw += 0.1 * L.look * easy;
    a.arms.l.swing += rad(4) * L.handL * easy; a.arms.r.swing += rad(4) * L.handR * easy;
  }
  a.chestYaw += 0.35 * (c.back ?? 0); a.headYaw += 0.9 * (c.back ?? 0);
  // (Pressed forward with the horse onto its skis' tips, or sat back with it onto their tails, the arms out.)
  const pressed = c.press ?? 0;
  if (pressed) { a.lean += rad(14) * pressed; both((_k, arm) => { arm.hang -= 22 * Math.abs(pressed); }); }
  // Springing off a lip: up in the stirrups, leant on with the horse; looking round a spin, ahead of the horse; looking for the snow.
  const pop = c.pop ?? 0, lead = Math.max(-1, Math.min(1, c.lead ?? 0)) * (1 - open), spot = (c.spot ?? 0) * (1 - open);
  a.hips += 0.06 * pop; a.lean += rad(6) * pop;
  a.chestYaw += 0.25 * lead; a.headYaw += 0.5 * lead;
  a.head -= rad(24) * spot;
  a.hips -= 0.06 * absorb; a.lean += rad(8) * absorb;
  // Rising to the trot: up out of the saddle on one beat of the two, leant a little forward.
  a.hips += 0.09 * post; a.lean += rad(8) * post; a.pelvisPitch += rad(6) * post;
  return a;
}
