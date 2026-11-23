import { BoxGeometry, BufferGeometry, CylinderGeometry, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * What a figure carries for a clip that wants it: skis and poles for the ski clips (`skiing.ts`). Without them a stride on skis read
 * as a strange lunge. Each is hung on a bone of the figure's own skeleton, so that it goes where the bone goes: a ski under the toes
 * where the binding holds it only there and the heel lifts (cross-country, jumping), under the whole foot where the boot is held
 * fast (downhill); a pole through the fist. They are laid out as the skeleton stands at rest, in its own frame (forward +z, up +y, its
 * left +x: the space its bind matrices are in), and put into each bone's own by the inverse of where that bone stood: so they fit any
 * body on the skeleton, whatever the length of its feet and arms.
 */
export type GearKind = 'classic' | 'alpine' | 'jump' | 'mounted';

/** Which clips want which gear: the downhill turns' jumps the turns' skis and poles. */
export const GEAR_OF: Record<string, GearKind> = {
  Ski_Classic_Loop: 'classic', Ski_Downhill_Loop: 'alpine', Ski_Jump: 'jump',
  Ski_Pop: 'alpine', Ski_Kicker: 'alpine', Ski_Kicker_360: 'alpine', Ski_Backflip: 'alpine', Ski_Cliff_Drop: 'alpine',
};

interface SkiSpec { length: number; width: number; ahead: number; on: 'toes' | 'foot'; colour: number; pole: number; twin?: boolean }
/**
 * The skis: how long and broad, how much of each lies ahead of the ball of the foot (cross-country and downhill skis are held about
 * their middle, a jumper's well back, with more than half the ski ahead), what holds it, its colour, and the poles' length (0: none);
 * and whether its tail turns up as its tip does, a twin tip (asked of the downhill skis: "we can make the skis twintip, since skiing
 * switch is perfectly possible").
 */
const SPECS: Record<GearKind, SkiSpec> = {
  classic: { length: 2.0, width: 0.047, ahead: 0.95, on: 'toes', colour: 0xe8edf2, pole: 1.48 },
  alpine: { length: 1.68, width: 0.075, ahead: 0.88, on: 'foot', colour: 0xc0322b, pole: 1.18, twin: true },
  jump: { length: 2.45, width: 0.11, ahead: 1.38, on: 'toes', colour: 0xf2c230, pole: 0 },
  // A rider on a skiing horse: no skis of its own, and poles long enough to reach the snow from the saddle.
  mounted: { length: 0, width: 0, ahead: 0, on: 'foot', colour: 0, pole: 2.3 },
};
/** How thick a ski is; the clips stand the feet this much over the ground, on it. */
export const SKI_THICK = 0.02;

const materials = new Map<number, MeshStandardMaterial>();
const material = (colour: number, metal = 0) => {
  let m = materials.get(colour);
  if (!m) { m = new MeshStandardMaterial({ color: colour, roughness: metal ? 0.35 : 0.5, metalness: metal }); materials.set(colour, m); }
  return m;
};

/**
 * A ski along +z, its sole on y = 0, the ball of the foot at z = 0: flat, with its tip turned up over its last thirteen centimetres;
 * a twin tip, its tail turned up as well over its last twelve.
 */
function skiGeometry(s: SkiSpec): BufferGeometry {
  const tip = 0.13, tail = s.twin ? 0.12 : 0, flat = s.length - tip - tail, back = s.length - s.ahead;
  const body = new BoxGeometry(s.width, SKI_THICK, flat).translate(0, SKI_THICK / 2, (s.ahead - tip - back + tail) / 2);
  const turned = new BoxGeometry(s.width * 0.9, SKI_THICK, tip).translate(0, SKI_THICK / 2, tip / 2).rotateX(-0.45).translate(0, 0, s.ahead - tip);
  if (!tail) return mergeGeometries([body, turned]);
  const up = new BoxGeometry(s.width * 0.9, SKI_THICK, tail).translate(0, SKI_THICK / 2, -tail / 2).rotateX(0.45).translate(0, 0, tail - back);
  return mergeGeometries([body, turned, up]);
}
/** A pole along -z from a grip at the origin: shaft, grip and a small basket near its tip. */
function poleGeometry(length: number): BufferGeometry {
  const shaft = new CylinderGeometry(0.009, 0.006, length, 8).rotateX(Math.PI / 2).translate(0, 0, -length / 2 + 0.05);
  const grip = new CylinderGeometry(0.017, 0.015, 0.14, 8).rotateX(Math.PI / 2).translate(0, 0, 0.0);
  const basket = new CylinderGeometry(0.05, 0.05, 0.008, 12).rotateX(Math.PI / 2).translate(0, 0, -length + 0.12);
  return mergeGeometries([shaft, grip, basket]);
}

/**
 * Puts the gear of `kind` on a figure's model, each piece hung on its bone; gives back the pieces, to take off again (`takeOff`).
 * (A model without a skinned mesh, or without the bones, gets none.)
 */
export function putOn(model: Object3D, kind: GearKind): Object3D[] {
  let skinned: SkinnedMesh | null = null;
  model.traverse((o) => { if (!skinned && (o as SkinnedMesh).isSkinnedMesh) skinned = o as SkinnedMesh; });
  if (!skinned) return [];
  const skeleton = (skinned as SkinnedMesh).skeleton;
  const at = (name: string) => { const i = skeleton.bones.findIndex((b) => b.name === name); return i < 0 ? null : { bone: skeleton.bones[i], inverse: skeleton.boneInverses[i] }; };
  const rest = (name: string) => { const b = at(name); return b ? new Vector3().setFromMatrixPosition(b.inverse.clone().invert()) : null; };
  const s = SPECS[kind], out: Object3D[] = [];
  /** Hangs a piece laid out at rest by `placed` (in the skeleton's frame) on the bone `name`. */
  const hang = (name: string, geometry: BufferGeometry, mat: MeshStandardMaterial, placed: Matrix4) => {
    const b = at(name);
    if (!b) return;
    const m = new Mesh(geometry, mat);
    m.castShadow = true;
    m.matrixAutoUpdate = false;
    m.matrix.copy(b.inverse.clone().multiply(placed));
    m.matrix.decompose(m.position, m.quaternion, m.scale);
    b.bone.add(m);
    out.push(m);
  };
  const ski = s.length ? skiGeometry(s) : null, pole = s.pole ? poleGeometry(s.pole) : null;
  for (const k of ['l', 'r'] as const) {
    const ball = rest(`ball_${k}`);
    if (!ball) continue;
    // (Its sole on the ground under the ball of the foot as it stands at rest, the ball a little above it.)
    if (ski) hang(s.on === 'toes' ? `ball_${k}` : `foot_${k}`, ski, material(s.colour), new Matrix4().makeTranslation(ball.x, ball.y - 0.015 - SKI_THICK, ball.z));
    const hand = rest(`hand_${k}`);
    if (pole && hand) {
      // Through the fist, which is a little beyond the wrist along the hand and under it, the palm being down as the arm rests level.
      const fist = hand.clone().add(new Vector3((k === 'l' ? 1 : -1) * 0.085, -0.02, 0));
      hang(`hand_${k}`, pole, material(0x2a2d33, 0.6), new Matrix4().compose(fist, new Quaternion(), new Vector3(1, 1, 1)));
    }
  }
  return out;
}

/** Takes gear off again. (Its geometry is let go of; the few materials are shared, and kept.) */
export function takeOff(pieces: Object3D[]): void {
  for (const p of pieces) { p.removeFromParent(); (p as Mesh).geometry?.dispose(); }
}
