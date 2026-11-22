import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, CylinderGeometry, DoubleSide, Matrix3, Matrix4, MeshStandardMaterial, Object3D, Quaternion,
  SkinnedMesh, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Clothes for the figures (asked: "improve the skins/visuals for the horse and rider/skier: human skier/rider: a medieval fantasy
 * adventurer type"): a ranger's, put on any body on the figures' skeleton, made here from the body itself.
 *
 * The garments are the body's own skin, lifted off it: each a copy of the body's mesh where it covers (by the bone that moves each
 * point most, and by where it is), pushed out along the skin's normal by the garment's thickness, so that it bends exactly as the
 * body bends, bone for bone, whatever the figure does: a quilted gambeson over the trunk and the arms, skirted over the hips; trousers;
 * tall boots with turned-down cuffs; gloves, and leather bracers over the sleeves; a hood that leaves the face open, and a mantle over
 * the shoulders. A short cloak hangs down the back from under the mantle, a belt with its buckle is drawn round the waist, a pouch hangs
 * at the right hip and a sword in its scabbard at the left: each made as a solid in the body's frame and given to the bones it hangs
 * from (the cloak to the spine, the belt, the pouch and the sword to the hips), so that it goes with them.
 *
 * Or the sword on its back (asked, of the skier: "the human skiier could have the sword on their back"; `sword: 'back'`): its
 * scabbard slung across the back over the cloak, from the left hip up to the right shoulder, its hilt standing up behind that shoulder
 * to be drawn over it, on a baldric across the chest from the right shoulder to the left hip; hung from the chest, so that it goes with
 * the body as it bends and turns rather than swinging from the hips about the skis.
 */

export interface Look {
  tunic: number; trousers: number; boots: number; leather: number; cloak: number; metal: number; grip: number;
}
/** A ranger's colours: a green gambeson, brown wool and leather, a russet hood and cloak, steel. */
export const RANGER: Look = { tunic: 0x41613a, trousers: 0x55504a, boots: 0x3a261a, leather: 0x6a4428, cloak: 0x7a3023, metal: 0xbab4a8, grip: 0x2e1d12 };

type Kind = 'glove' | 'boot' | 'trousers' | 'tunic' | 'hood' | 'bracer' | 'mantle';
/** How far each garment stands off the skin. */
const THICK: Record<Kind, number> = { glove: 0.007, boot: 0.02, trousers: 0.013, tunic: 0.026, hood: 0.05, bracer: 0.034, mantle: 0.06 };
/**
 * How many times each garment's surface is smoothed once it is lifted off the skin: a body made for heroes has every muscle in its
 * skin, and cloth over it does not (a boot or a glove keeps more of the shape under it).
 */
const SMOOTH: Record<Kind, number> = { glove: 1, boot: 4, trousers: 6, tunic: 10, hood: 3, bracer: 4, mantle: 12 };

/** A little unevenness in a colour, the same at the same place. */
const mottle = (c: Color, p: Vector3, by = 0.07) => {
  const h = Math.sin(p.x * 91.7 + p.y * 37.3 + p.z * 53.1) * 43758.5453;
  const k = 1 + by * ((h - Math.floor(h)) * 2 - 1);
  return new Color(c.r * k, c.g * k, c.b * k);
};

/** Dresses a copy of `base` (a body on the figures' skeleton, as loaded) as an adventurer; gives back the copy. */
export function dressAdventurer(base: Object3D, look: Look = RANGER, o: { sword?: 'hip' | 'back' } = {}): Object3D {
  const model = cloneRigged(base);
  model.updateMatrixWorld(true);
  let body: SkinnedMesh | null = null;
  model.traverse((o) => {
    const s = o as SkinnedMesh;
    if (s.isSkinnedMesh && (!body || s.geometry.getAttribute('position').count > body.geometry.getAttribute('position').count)) body = s;
  });
  if (!body) return model;
  const skin: SkinnedMesh = body;
  const bones = skin.skeleton.bones, names = bones.map((b) => b.name), boneAt = (n: string) => names.indexOf(n);
  // (The body's points as it stands at rest, in its own frame, which is the frame its bones are bound in.)
  const local = skin.matrixWorld.clone(), toModel = (v: Vector3) => v.clone().applyMatrix4(local), toLocal = local.clone().invert();
  const joint = (n: string) => bones[boneAt(n)].getWorldPosition(new Vector3()).applyMatrix4(model.matrixWorld.clone().invert());
  const knee = joint('calf_l').y, hip = joint('thigh_l').y, pelvis = joint('pelvis'), chest = joint('spine_03').y, head = joint('Head');
  const wrist = Math.abs(joint('hand_l').x), elbow = Math.abs(joint('lowerarm_l').x), shoulder = Math.abs(joint('upperarm_l').x);
  const scale = new Vector3().setFromMatrixScale(local).x;

  const g = skin.geometry, P = g.getAttribute('position'), N = g.getAttribute('normal'), SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight');
  const n = P.count, normalOf = new Matrix3().getNormalMatrix(local);
  const at: Vector3[] = [], nrm: Vector3[] = [], bone: string[] = [];
  for (let i = 0; i < n; i++) {
    at.push(toModel(new Vector3().fromBufferAttribute(P, i)));
    nrm.push(new Vector3().fromBufferAttribute(N, i).applyMatrix3(normalOf).normalize());
    let best = 0, w = -1;
    for (let k = 0; k < 4; k++) { const x = SW.getComponent(i, k); if (x > w) { w = x; best = SI.getComponent(i, k); } }
    bone.push(names[best]);
  }
  const is = (b: string, ...parts: string[]) => parts.some((p) => b.startsWith(p));
  // (The head's height over its joint, that the face is measured by: a smaller head has a smaller face.)
  const span = Math.max(0.15, ...at.filter((_, i) => bone[i] === 'Head').map((p) => p.y - head.y));
  const fingers = ['hand_', 'thumb_', 'index_', 'middle_', 'ring_', 'pinky_'];
  /** Which garment covers each point of the skin (the hood and the gloves leave the face and nothing else bare). */
  const under: (Kind | null)[] = at.map((p, i) => {
    const b = bone[i], ax = Math.abs(p.x);
    if (is(b, ...fingers) || (is(b, 'lowerarm_') && ax > wrist - 0.035)) return 'glove';
    if (is(b, 'calf_', 'foot_', 'ball_') && p.y < knee - 0.05) return 'boot';
    if (is(b, 'thigh_', 'calf_') && p.y < hip - 0.14) return 'trousers';
    if (is(b, 'Head', 'neck_01')) {
      const face = nrm[i].z > 0.2 && p.z > head.z && p.y < head.y + 0.62 * span && p.y > head.y - 0.42 * span && ax < 0.3 * span;
      return face ? null : 'hood';
    }
    return 'tunic';
  });
  const over = (i: number): Kind[] => {
    const p = at[i], b = bone[i], ax = Math.abs(p.x), out: Kind[] = [];
    if (is(b, 'lowerarm_') && ax > elbow + 0.05 && ax < wrist - 0.02) out.push('bracer');
    // (The mantle's hem higher before than behind.)
    const hem = chest + (p.z > pelvis.z ? 0.08 : -0.04);
    if (p.y > hem && (is(b, 'spine_', 'clavicle_', 'neck_01') || (is(b, 'upperarm_') && ax < shoulder + 0.1))) out.push('mantle');
    return out;
  };
  const colours: Record<Kind, number> = { glove: look.leather, boot: look.boots, trousers: look.trousers, tunic: look.tunic, hood: look.cloak, bracer: look.leather, mantle: look.cloak };
  /** How far a point of a garment stands off the skin: a boot's cuff further, the gambeson's skirt flaring as it goes down. */
  const thickness = (k: Kind, p: Vector3) => {
    let t = THICK[k];
    if (k === 'boot' && p.y > knee - 0.15) t += 0.009;
    if (k === 'tunic' && p.y < hip) t += Math.min(0.05, (hip - p.y) * 0.22);
    if (k === 'mantle') t += Math.max(0, chest + 0.12 - p.y) * 0.25;
    // (A hood stands off the back of the head, and rises there to a point, as a hood of cloth does.)
    if (k === 'hood') {
      const peak = head.clone().add(new Vector3(0, 0.2, -0.1)), d = p.distanceTo(peak);
      // (And lies closer about the face, that its rim does not stand out over it.)
      t += Math.max(0, head.z - p.z) * 0.15 + 0.07 * Math.exp(-((d / 0.08) ** 2)) - 0.025 * Math.max(0, Math.min(1, (p.z - head.z) / 0.08));
    }
    return t;
  };
  const shells: BufferGeometry[] = [], draped: BufferGeometry[] = [];
  const index = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  const cut = (k: Kind, covers: (i: number) => boolean) => {
    // (A triangle is the garment's if any corner of it is: the garments overlap by a row where they meet, leaving no skin between.)
    const tris: number[] = [];
    for (let t = 0; t < index.length; t += 3) if (covers(index[t]) || covers(index[t + 1]) || covers(index[t + 2])) tris.push(index[t], index[t + 1], index[t + 2]);
    if (!tris.length) return;
    const used = [...new Set(tris)], remap = new Map(used.map((v, j) => [v, j]));
    const pos = new Float32Array(used.length * 3), nor = new Float32Array(used.length * 3), col = new Float32Array(used.length * 3);
    const si = new Uint16Array(used.length * 4), sw = new Float32Array(used.length * 4);
    const base = new Color(colours[k]);
    // Lifted off the skin, then smoothed: each point drawn half way to the middle of its neighbours, so many times over. (Points the
    // mesh keeps twice at one place, along a seam of its picture, are smoothed as one, so that the garment does not open there.)
    const lifted = used.map((v) => at[v].clone().addScaledVector(nrm[v], thickness(k, at[v])));
    const keyOf = (v: number) => `${at[v].x.toFixed(4)},${at[v].y.toFixed(4)},${at[v].z.toFixed(4)}`;
    const one = new Map<string, number>(), weld = used.map((v, j) => { const key = keyOf(v); if (!one.has(key)) one.set(key, j); return one.get(key)!; });
    const near = used.map(() => new Set<number>());
    for (let t = 0; t < tris.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) near[weld[remap.get(tris[t + a])!]].add(weld[remap.get(tris[t + b])!]);
    // (Its edge, where it meets the next garment, is left where it was lifted to: smoothed, it was drawn in, and opened a gap there.)
    const edges = new Map<string, number>();
    for (let t = 0; t < tris.length; t += 3) for (let a = 0; a < 3; a++) {
      const x = weld[remap.get(tris[t + a])!], y = weld[remap.get(tris[t + (a + 1) % 3])!], key = x < y ? `${x},${y}` : `${y},${x}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    const pinned = new Set<number>();
    for (const [key, uses] of edges) if (uses === 1) for (const v of key.split(',')) pinned.add(Number(v));
    for (let pass = 0; pass < SMOOTH[k]; pass++) {
      const next = lifted.map((p, j) => {
        if (weld[j] !== j || !near[j].size || pinned.has(j)) return p;
        const mid = new Vector3();
        for (const o of near[j]) mid.add(lifted[o]);
        return p.clone().lerp(mid.divideScalar(near[j].size), 0.5);
      });
      next.forEach((p, j) => lifted[j].copy(next[weld[j]]));
    }
    // (Its normals made again from its smoothed surface, shared across those seams.)
    const sums = used.map(() => new Vector3());
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((q) => remap.get(tris[t + q])!), face = lifted[b].clone().sub(lifted[a]).cross(lifted[c].clone().sub(lifted[a]));
      for (const q of [a, b, c]) sums[weld[q]].add(face);
    }
    const normalToLocal = new Matrix3().getNormalMatrix(toLocal);
    used.forEach((v, j) => {
      const p = lifted[j].clone().applyMatrix4(toLocal), q = sums[weld[j]].clone().normalize().applyMatrix3(normalToLocal).normalize();
      pos.set(p.toArray(), j * 3);
      nor.set(q.toArray(), j * 3);
      let c = mottle(base, at[v]);
      // (The gambeson's quilting, a darker line every seven centimetres down the trunk; a boot's sole.)
      if (k === 'tunic' && is(bone[v], 'spine_', 'pelvis') && (((at[v].y + 10) / 0.07) % 1) < 0.18) c = c.multiplyScalar(0.8);
      if (k === 'boot' && at[v].y < 0.03) c = new Color(0x1c1410);
      col.set([c.r, c.g, c.b], j * 3);
      for (let q = 0; q < 4; q++) { si[j * 4 + q] = SI.getComponent(v, q); sw[j * 4 + q] = SW.getComponent(v, q); }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('normal', new BufferAttribute(nor, 3));
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.setAttribute('skinIndex', new BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    geo.setIndex(tris.map((v) => remap.get(v)!));
    (k === 'mantle' ? draped : shells).push(geo);
  };
  for (const k of ['glove', 'boot', 'trousers', 'tunic', 'hood'] as Kind[]) cut(k, (i) => under[i] === k);
  // The body is no longer drawn where its clothes cover it all (smoothed, a garment lies inside the body's swells, which would show
  // through); only the face is left, and what borders it.
  {
    const keep: number[] = [];
    for (let t = 0; t < index.length; t += 3) if (under[index[t]] === null || under[index[t + 1]] === null || under[index[t + 2]] === null) keep.push(index[t], index[t + 1], index[t + 2]);
    const bare = g.clone();
    bare.setIndex(keep);
    skin.geometry = bare;
  }
  for (const k of ['bracer', 'mantle'] as Kind[]) cut(k, (i) => over(i).includes(k));

  // ---------------------------------------------------------------- what is made as solids and hung on the bones
  /** A solid made in the body's frame, every point of it moved by the bones given (each with its share). */
  const rigged = (geo: BufferGeometry, colour: number | ((p: Vector3) => Color), weights: (p: Vector3) => [string, number][]) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    flat.deleteAttribute('uv');
    const m = flat.getAttribute('position').count, si = new Uint16Array(m * 4), sw = new Float32Array(m * 4), col = new Float32Array(m * 3), p = new Vector3();
    for (let i = 0; i < m; i++) {
      p.fromBufferAttribute(flat.getAttribute('position') as BufferAttribute, i);
      weights(p).forEach(([b, w], q) => { si[i * 4 + q] = Math.max(0, boneAt(b)); sw[i * 4 + q] = w; });
      const c = typeof colour === 'number' ? mottle(new Color(colour), p, 0.05) : colour(p);
      col.set([c.r, c.g, c.b], i * 3);
    }
    // (Made in the model's frame; the mesh's points are in the body's.)
    flat.applyMatrix4(toLocal);
    flat.setAttribute('skinIndex', new BufferAttribute(si, 4));
    flat.setAttribute('skinWeight', new BufferAttribute(sw, 4));
    flat.setAttribute('color', new BufferAttribute(col, 3));
    return flat;
  };
  const toHips = () => [['pelvis', 1]] as [string, number][];
  const solids: BufferGeometry[] = [], metal: BufferGeometry[] = [];
  // The belt: round the gambeson at the waist, as wide as the body is there, every way round.
  const beltY = pelvis.y + 0.09, ring: Vector3[] = [];
  for (let a = 0; a < 40; a++) {
    const th = (a / 40) * Math.PI * 2, dir = new Vector3(Math.sin(th), 0, Math.cos(th));
    let r = 0.1;
    at.forEach((p, i) => {
      if (Math.abs(p.y - beltY) > 0.035 || !is(bone[i], 'spine_', 'pelvis')) return;
      const d = new Vector3(p.x - pelvis.x, 0, p.z - pelvis.z);
      if (d.clone().normalize().dot(dir) > 0.985) r = Math.max(r, d.length());
    });
    ring.push(new Vector3(pelvis.x, beltY, pelvis.z).addScaledVector(dir, r + THICK.tunic + 0.012));
  }
  const belt: BufferGeometry[] = [];
  ring.forEach((p, a) => {
    const q = ring[(a + 1) % ring.length], mid = p.clone().add(q).multiplyScalar(0.5), along = q.clone().sub(p);
    const box = new BoxGeometry(0.012, 0.045, along.length() + 0.004);
    box.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), along.normalize()));
    belt.push(box.translate(mid.x, mid.y, mid.z));
  });
  solids.push(rigged(mergeGeometries(belt.map((b) => b.toNonIndexed())), look.leather, toHips));
  const front = ring[0];
  metal.push(rigged(new BoxGeometry(0.05, 0.05, 0.012).translate(front.x, front.y, front.z + 0.006), look.metal, toHips));
  // A pouch at the right hip, hung from the belt.
  const pouchAt = ring[Math.round(ring.length * 0.68)].clone().add(new Vector3(0, -0.07, 0));
  solids.push(rigged(new BoxGeometry(0.11, 0.12, 0.05).translate(pouchAt.x - 0.01, pouchAt.y, pouchAt.z), look.leather, toHips));
  solids.push(rigged(new BoxGeometry(0.115, 0.04, 0.056).translate(pouchAt.x - 0.01, pouchAt.y + 0.045, pouchAt.z), new Color(look.leather).multiplyScalar(0.8).getHex(), toHips));
  /**
   * A sword in its scabbard, the scabbard's mouth at `top` and running on along `down`, its hilt standing out the other way; its flat
   * turned to face `face` (by default the body's side); each point moved by the bones `weights` gives.
   */
  const sheathe = (top: Vector3, down: Vector3, weights: (p: Vector3) => [string, number][], face?: Vector3) => {
    const along = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), down.clone().negate());
    // (Turned about its own length so that its broad side lies flat against what it hangs on.)
    if (face) { const wide = new Vector3(1, 0, 0).applyQuaternion(along), want = face.clone().cross(down).normalize(); along.premultiply(new Quaternion().setFromUnitVectors(wide, want)); }
    const place = (geo: BufferGeometry, from: number, to: number) => {
      const mid = top.clone().addScaledVector(down, (from + to) / 2);
      return geo.applyQuaternion(along).translate(mid.x, mid.y, mid.z);
    };
    solids.push(rigged(place(new BoxGeometry(0.055, 0.86, 0.022), 0.02, 0.88), look.boots, weights));
    metal.push(rigged(place(new BoxGeometry(0.06, 0.07, 0.026), 0.84, 0.91), look.metal, weights));
    metal.push(rigged(place(new BoxGeometry(0.06, 0.04, 0.026), 0.0, 0.04), look.metal, weights));
    metal.push(rigged(place(new BoxGeometry(0.2, 0.022, 0.024), -0.03, -0.008), look.metal, weights));
    solids.push(rigged(place(new CylinderGeometry(0.014, 0.016, 0.13, 8), -0.17, -0.035), look.grip, weights));
    const pommel = top.clone().addScaledVector(down, -0.19);
    metal.push(rigged(new SphereGeometry(0.022, 10, 8).translate(pommel.x, pommel.y, pommel.z), look.metal, weights));
  };
  /** How far out the trunk's skin stands at (x, y), behind it (`back`) or in front: the furthest point of it near there. */
  const trunkAt = (x: number, y: number, back: boolean) => {
    let z = back ? 0 : -1;
    at.forEach((p, i) => { if (Math.abs(p.x - x) < 0.045 && Math.abs(p.y - y) < 0.045 && is(bone[i], 'spine_', 'pelvis', 'clavicle_') && (back ? p.z < z : p.z > z)) z = p.z; });
    return z;
  };
  /** The chest and the spine below it, shared out by height: what a thing hung on the trunk above the belt moves with. */
  const toChest = (p: Vector3): [string, number][] => {
    const v = Math.min(1, Math.max(0, (chest + 0.1 - p.y) / (chest + 0.1 - beltY)));
    return v < 0.5 ? [['spine_03', 1 - v * 2], ['spine_02', v * 2]] : [['spine_02', (1 - v) * 2], ['spine_01', (v - 0.5) * 2]];
  };
  if (o.sword === 'back') {
    // Across the back over the cloak, from behind the left hip up to behind the right shoulder; the hilt standing up over it.
    const low = new Vector3(pelvis.x + 0.15, beltY - 0.06, 0), high = new Vector3(pelvis.x - 0.13, chest + 0.2, 0);
    for (const q of [low, high]) q.z = trunkAt(q.x, Math.min(q.y, chest + 0.06), true) - 0.125;
    const down = low.clone().sub(high).normalize(), top = high.clone().addScaledVector(down, 0.02);
    sheathe(top, down, (p) => toChest(new Vector3(p.x, Math.max(p.y, beltY), p.z)), new Vector3(0, 0, -1));
    // The baldric: across the chest from the right shoulder to the left hip, and across the back under the scabbard.
    const strap: BufferGeometry[] = [];
    const band = (from: Vector3, to: Vector3, back: boolean) => {
      const pts: Vector3[] = [];
      for (let i = 0; i <= 10; i++) { const q = from.clone().lerp(to, i / 10); q.z = trunkAt(q.x, q.y, back) + (back ? -1 : 1) * (THICK.tunic + 0.014); pts.push(q); }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a);
        const box = new BoxGeometry(0.05, 0.012, dir.length() + 0.006);
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.normalize());
        // (Lying flat on the body: its breadth across the way the band goes, in the plane of the chest.)
        const wide = new Vector3(1, 0, 0).applyQuaternion(q), want = new Vector3(0, 0, back ? -1 : 1).cross(dir).normalize();
        q.premultiply(new Quaternion().setFromUnitVectors(wide, want));
        strap.push(box.applyQuaternion(q).translate(mid.x, mid.y, mid.z).toNonIndexed());
      }
    };
    band(new Vector3(pelvis.x - 0.12, chest + 0.13, 0), new Vector3(pelvis.x + 0.15, beltY + 0.02, 0), false);
    band(new Vector3(pelvis.x - 0.12, chest + 0.13, 0), new Vector3(pelvis.x + 0.15, beltY + 0.02, 0), true);
    solids.push(rigged(mergeGeometries(strap), look.leather, toChest));
  } else {
    // A sword in its scabbard at the left hip, hanging back from the belt; its hilt forward and up.
    sheathe(ring[Math.round(ring.length * 0.26)].clone().add(new Vector3(0.03, -0.03, 0)), new Vector3(0, -Math.cos(0.55), -Math.sin(0.55)), toHips);
  }
  // A short cloak down the back from under the mantle to below the belt, standing off the back more the lower it hangs; moved by the
  // spine above and the hips below.
  {
    const cols = 9, rows = 10, topY = chest + 0.1, bottomY = pelvis.y - 0.14, verts: number[] = [], index2: number[] = [];
    const backAt = (x: number, y: number) => {
      let z = 0;
      at.forEach((p, i) => { if (Math.abs(p.x - x) < 0.04 && Math.abs(p.y - y) < 0.04 && is(bone[i], 'spine_', 'pelvis', 'clavicle_') && p.z < z) z = p.z; });
      return z;
    };
    const pts: Vector3[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const u = c / cols, v = r / rows, y = topY + (bottomY - topY) * v, half = 0.2 + 0.06 * v, x = pelvis.x + (u * 2 - 1) * half;
      const z = backAt(x, y) - 0.045 - 0.05 * v - 0.03 * Math.abs(u * 2 - 1) * (1 - v);
      pts.push(new Vector3(x, y, z));
    }
    for (const p of pts) verts.push(p.x, p.y, p.z);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1; index2.push(a, d, b, b, d, e); }
    const cloak = new BufferGeometry();
    cloak.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
    cloak.setIndex(index2);
    cloak.computeVertexNormals();
    draped.push(rigged(cloak, look.cloak, (p) => {
      const v = Math.min(1, Math.max(0, (topY - p.y) / (topY - bottomY)));
      return v < 0.5 ? [['spine_03', 1 - v * 2], ['spine_02', v * 2]] : [['spine_02', (1 - v) * 2], ['pelvis', (v - 0.5) * 2]];
    }));
  }

  // The garments, each a skinned mesh bound as the body is.
  const add = (geos: BufferGeometry[], material: MeshStandardMaterial) => {
    if (!geos.length) return;
    const geo = mergeGeometries(geos.map((q) => { for (const name of Object.keys(q.attributes)) if (!['position', 'normal', 'color', 'skinIndex', 'skinWeight'].includes(name)) q.deleteAttribute(name); if (!q.getAttribute('normal')) q.computeVertexNormals(); return q.index ? q.toNonIndexed() : q; }));
    const mesh = new SkinnedMesh(geo, material);
    mesh.name = `Outfit_${material.name}`;
    mesh.position.copy(skin.position); mesh.quaternion.copy(skin.quaternion); mesh.scale.copy(skin.scale);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    skin.parent!.add(mesh);
    mesh.bind(skin.skeleton, skin.bindMatrix);
  };
  // (Cloth drawn from both sides: where two garments meet, the inside of one is what shows through any gap, not what is behind.)
  add([...shells, ...solids], Object.assign(new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: DoubleSide }), { name: 'Cloth' }));
  add(draped, Object.assign(new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide }), { name: 'Cloak' }));
  add(metal, Object.assign(new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.85 }), { name: 'Steel' }));
  void scale; void Matrix4;
  return model;
}
