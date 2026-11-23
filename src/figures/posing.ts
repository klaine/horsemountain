import { AnimationClip, AnimationMixer, Bone, Matrix4, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';

/**
 * What a clip made in code poses the figures' skeleton with (the run's, `gait.ts`, and the ski clips', `skiing.ts`): a copy of the
 * mannequin's skeleton, set bone by bone a frame at a time and kept as a clip.
 *
 * Everything is set by how each part is to lie in the figure's own frame (forward +z, up +y, its left +x), as a turn from how it lies
 * in the base pose, and not by the bones' own axes, which are the rig's business: the pelvis placed and turned, the three bones of the
 * spine, the neck and the head each turned, an arm swung and bent at the elbow, a leg's thigh, shin, foot and toes aimed along given
 * directions or reaching from the hip to where its ankle is to be (its knee found so that thigh and shin meet).
 *
 * The base pose is the skeleton as it rests, upright, its feet flat and straight ahead and its arms out level, which is the same on
 * either side (the idle's is not: it stands with its weight on one leg, a foot turned out and a hand ahead of the other), with the
 * arms let down to hang (`HANG`) and only the fingers taken from the idle's first frame, loosely curled.
 */

/** How far the arms are let down from level, out at the sides as the skeleton rests, to hang a little out from the body, in degrees. */
export const HANG = 78;

export type Side = 'l' | 'r';
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1);
export const rad = (d: number): number => (d * Math.PI) / 180;
export const qx = (a: number): Quaternion => new Quaternion().setFromAxisAngle(X, a);
export const qy = (a: number): Quaternion => new Quaternion().setFromAxisAngle(Y, a);
export const qz = (a: number): Quaternion => new Quaternion().setFromAxisAngle(Z, a);
export const smooth = (t: number): number => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
/**
 * A whole body's turn in the air: `spin` about an axis (to the left, positive), then `flip` over backwards about its left (forward,
 * positive). The spin's axis is upright, unless `cork` tips it (radians): over towards the body's back and the outside of the spin, so
 * that a cork goes round off its axis, laid over on its side and back halfway through each turn, as a corked spin does.
 */
export const bodyTurn = (spin: number, flip: number, cork = 0): Quaternion => {
  if (!cork) return qy(spin).multiply(qx(flip));
  const out = spin >= 0 ? -1 : 1, axis = new Vector3(0.75 * out * Math.sin(cork), Math.cos(cork), -0.66 * Math.sin(cork)).normalize();
  return new Quaternion().setFromAxisAngle(axis, spin).multiply(qx(flip));
};
/** A cubic from (0, a) with slope `da` to (1, b) with slope `db`. */
export const hermite = (t: number, a: number, da: number, b: number, db: number): number => {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * da + (-2 * t3 + 3 * t2) * b + (t3 - t2) * db;
};
/**
 * A smooth curve through keys `[t, value]`, never going past the keys either side of it (each key's slope is the harmonic mean of
 * the slopes to its neighbours, or level where it is a peak or a trough: Fritsch and Carlson's), with the slopes at its ends given.
 */
export const keyed = (t: number, keys: [number, number][], start: number, end: number): number => {
  const n = keys.length, slopes = keys.map((_, i) => {
    if (i === 0) return start;
    if (i === n - 1) return end;
    const a = (keys[i][1] - keys[i - 1][1]) / (keys[i][0] - keys[i - 1][0]), b = (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  });
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1], h = t1 - t0;
  return hermite((t - t0) / h, v0, slopes[i] * h, v1, slopes[i + 1] * h);
};
/**
 * The same through keys round a loop of length 1: the last key one after the first, with the same value. (The slope where the loop
 * closes is found as a middle key's is, from the keys either side of it.)
 */
export const looped = (t: number, keys: [number, number][]): number => {
  const n = keys.length, k0 = keys[0][0], u = k0 + ((((t - k0) % 1) + 1) % 1);
  const a = (keys[1][1] - keys[0][1]) / (keys[1][0] - keys[0][0]), b = (keys[n - 1][1] - keys[n - 2][1]) / (keys[n - 1][0] - keys[n - 2][0]);
  const end = a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  return keyed(u, keys, end, end);
};

/** One leg's measures in the base pose. */
export interface Leg {
  k: Side;
  sign: number;
  thighLen: number;
  shinLen: number;
  /** Which way each part points from its joint in the base pose: thigh, shin, foot (ankle to ball), toes. */
  dThigh: Vector3;
  dShin: Vector3;
  dFoot: Vector3;
  dToe: Vector3;
  /** Where the ankle is from the ball of the foot, standing flat; and how high the ball stands. */
  ankleFromBall: Vector3;
  ballUp: number;
}

export class Poser {
  readonly model: Object3D;
  readonly bones: Bone[] = [];
  readonly legs: Record<Side, Leg>;
  /** The pelvis where it stands in the base pose, and how far forward the hip joints are. */
  readonly pelvisAt: Vector3;
  readonly hipZ: number;
  private readonly W0 = new Map<Bone, Quaternion>();
  private readonly basePos = new Map<Bone, Vector3>();
  private readonly baseLocal = new Map<Bone, Quaternion>();
  /** Where each bone's joint is as the skeleton rests, by name. */
  private readonly restAt = new Map<string, Vector3>();
  private readonly pelvisBone: Bone;
  private readonly root: Object3D;
  /** The chest's turn from the base pose, and its rotation in the figure's frame, as the trunk was last set. */
  private chestD = new Quaternion();
  private chestW = new Quaternion();
  private readonly times: number[] = [];
  private readonly rot = new Map<Bone, number[]>();
  private readonly hipsPos: number[] = [];

  constructor(source: Object3D, base: AnimationClip) {
    this.model = cloneRigged(source);
    this.model.traverse((o) => { if ((o as Bone).isBone) this.bones.push(o as Bone); });
    this.model.updateMatrixWorld(true);
    for (const b of this.bones) { this.W0.set(b, b.getWorldQuaternion(new Quaternion())); this.basePos.set(b, b.position.clone()); }
    const restLocal = new Map(this.bones.map((b) => [b, b.quaternion.clone()]));
    const mixer = new AnimationMixer(this.model);
    mixer.clipAction(base).play();
    mixer.update(0);
    const finger = /thumb|index|middle|ring|pinky/;
    for (const b of this.bones) this.baseLocal.set(b, (finger.test(b.name) ? b.quaternion : restLocal.get(b)!).clone());
    for (const b of this.bones) { b.quaternion.copy(restLocal.get(b)!); b.position.copy(this.basePos.get(b)!); }
    this.model.updateMatrixWorld(true);
    for (const b of this.bones) this.restAt.set(b.name, b.getWorldPosition(new Vector3()));
    const side = (k: Side): Leg => {
      const hip = this.at(`thigh_${k}`), knee = this.at(`calf_${k}`), ankle = this.at(`foot_${k}`), ball = this.at(`ball_${k}`), toe = this.at(`ball_leaf_${k}`);
      return {
        k, sign: k === 'l' ? 1 : -1, thighLen: hip.distanceTo(knee), shinLen: knee.distanceTo(ankle),
        dThigh: knee.clone().sub(hip).normalize(), dShin: ankle.clone().sub(knee).normalize(), dFoot: ball.clone().sub(ankle).normalize(), dToe: toe.clone().sub(ball).normalize(),
        ankleFromBall: ankle.clone().sub(ball), ballUp: ball.y,
      };
    };
    this.legs = { l: side('l'), r: side('r') };
    this.pelvisAt = this.at('pelvis');
    this.hipZ = this.at('thigh_l').z;
    this.pelvisBone = this.bone('pelvis');
    this.root = this.pelvisBone.parent!;
    for (const b of this.bones) this.rot.set(b, []);
  }

  /** (Each found once and kept: looked for by name through the whole figure each time, some twenty times a pose, it was a third of posing.) */
  private readonly byName = new Map<string, Bone>();
  bone(n: string): Bone {
    let b = this.byName.get(n);
    if (!b) {
      b = this.model.getObjectByName(n) as Bone | undefined;
      if (!b) throw new Error(`a figure without ${n}`);
      this.byName.set(n, b);
    }
    return b;
  }
  /** Where a bone's joint is now, in the figure's frame. */
  at(n: string): Vector3 { return this.bone(n).getWorldPosition(new Vector3()); }
  private setWorld(b: Object3D, w: Quaternion, parentW: Quaternion): void { b.quaternion.copy(parentW.clone().invert().multiply(w)); }
  private worldOf(b: Object3D): Quaternion { return b.getWorldQuaternion(new Quaternion()); }
  /** The rotation that takes a bone's direction in the base pose to `dir`, put before its rotation in the base pose. */
  private aimed(b: Bone, from: Vector3, dir: Vector3): Quaternion { return new Quaternion().setFromUnitVectors(from, dir.clone().normalize()).multiply(this.W0.get(b)!); }

  /** Every bone back as in the base pose. */
  begin(): void { for (const b of this.bones) { b.quaternion.copy(this.baseLocal.get(b)!); b.position.copy(this.basePos.get(b)!); } }

  /** The pelvis at `at` (the place of its joint), turned by `d` from the base pose. */
  pelvis(at: Vector3, d: Quaternion): void {
    this.root.updateMatrixWorld(true);
    this.pelvisBone.position.copy(this.root.worldToLocal(at.clone()));
    this.setWorld(this.pelvisBone, d.clone().multiply(this.W0.get(this.pelvisBone)!), this.worldOf(this.root));
  }

  /**
   * The spine's three bones, each turned by its own `spine[i]` from the base pose (in the figure's frame, not from the bone below), the
   * neck and the head by theirs; `pelvis`, the pelvis's turn as it was set. The last of the spine is the chest, which the arms hang from.
   */
  trunk(pelvis: Quaternion, spine: [Quaternion, Quaternion, Quaternion], neck: Quaternion, head: Quaternion): void {
    let parentW = pelvis.clone().multiply(this.W0.get(this.pelvisBone)!);
    ['spine_01', 'spine_02', 'spine_03'].forEach((n, i) => { const b = this.bone(n), w = spine[i].clone().multiply(this.W0.get(b)!); this.setWorld(b, w, parentW); parentW = w; });
    this.chestD = spine[2].clone();
    this.chestW = parentW;
    const nb = this.bone('neck_01'), hb = this.bone('Head'), wNeck = neck.clone().multiply(this.W0.get(nb)!), wHead = head.clone().multiply(this.W0.get(hb)!);
    this.setWorld(nb, wNeck, parentW); this.setWorld(hb, wHead, wNeck);
  }

  /**
   * An arm, from the chest as the trunk last set it: let down from level to hang a little out from the side (by `hang` degrees, `HANG`
   * unless given; less, and it stands out from the body), its palm to the thigh; swung forward by `swing` (a turn about the figure's
   * left, the arm hanging down), and in across the body by `inward`; the elbow bent forward by `bend` and the wrist by `wrist` (all in
   * radians; a wrist bent back, its knuckles up, is negative).
   */
  arm(k: Side, o: { swing: number; inward?: number; bend: number; wrist?: number; hang?: number }): void {
    const clav = this.bone(`clavicle_${k}`), up = this.bone(`upperarm_${k}`), low = this.bone(`lowerarm_${k}`), hand = this.bone(`hand_${k}`);
    const wClav = this.chestD.clone().multiply(this.W0.get(clav)!);
    this.setWorld(clav, wClav, this.chestW);
    const hang = qz(rad(o.hang ?? HANG) * (k === 'l' ? -1 : 1));
    const swung = this.chestD.clone().multiply(qy(o.inward ?? 0)).multiply(qx(-o.swing));
    const wUp = swung.clone().multiply(hang).multiply(this.W0.get(up)!);
    this.setWorld(up, wUp, wClav);
    const bent = swung.clone().multiply(qx(-o.bend)), wLow = bent.clone().multiply(hang).multiply(this.W0.get(low)!);
    this.setWorld(low, wLow, wUp);
    this.setWorld(hand, bent.clone().multiply(qx(o.wrist ?? rad(-8))).multiply(hang).multiply(this.W0.get(hand)!), wLow);
  }

  /** Brings every joint's place up to date (after the pelvis, trunk and arms are set, before a leg is reached for). */
  update(): void { this.model.updateMatrixWorld(true); }

  /**
   * A leg put so that its segments point along the given directions (thigh, shin, foot, toes); the foot and the toes then rolled about
   * their own length by `roll` (a ski put on its edge).
   */
  aimLeg(k: Side, dThigh: Vector3, dShin: Vector3, dFoot: Vector3, dToe: Vector3, roll = 0): void {
    const L = this.legs[k], thigh = this.bone(`thigh_${k}`), calf = this.bone(`calf_${k}`), foot = this.bone(`foot_${k}`), ball = this.bone(`ball_${k}`);
    const wT = this.aimed(thigh, L.dThigh, dThigh), wC = this.aimed(calf, L.dShin, dShin);
    let wF = this.aimed(foot, L.dFoot, dFoot), wB = this.aimed(ball, L.dToe, dToe);
    if (roll) {
      wF = new Quaternion().setFromAxisAngle(dFoot.clone().normalize(), roll).multiply(wF);
      wB = new Quaternion().setFromAxisAngle(dToe.clone().normalize(), roll).multiply(wB);
    }
    this.setWorld(thigh, wT, this.worldOf(this.pelvisBone)); this.setWorld(calf, wC, wT); this.setWorld(foot, wF, wC); this.setWorld(ball, wB, wF);
  }

  /** Where the hip joint is now. */
  hip(k: Side): Vector3 { return this.at(`thigh_${k}`); }

  /**
   * An arm reaching from the shoulder for `target` (a hand grabbing a ski): the elbow found so that the upper arm and the forearm meet,
   * bent out towards `elbow` (a direction); the hand turned as the forearm is. Further than it reaches, it reaches as far as it can
   * towards it. Gives back how far it was stretched, as a share of its length.
   */
  reachArm(k: Side, target: Vector3, elbow: Vector3): number {
    const up = this.bone(`upperarm_${k}`), low = this.bone(`lowerarm_${k}`), hand = this.bone(`hand_${k}`);
    const L1 = this.restOf(`lowerarm_${k}`).distanceTo(this.restOf(`upperarm_${k}`)), L2 = this.restOf(`hand_${k}`).distanceTo(this.restOf(`lowerarm_${k}`));
    const shoulder = this.at(`upperarm_${k}`), d = target.clone().sub(shoulder), len = d.length(), reach = Math.min(len, (L1 + L2) * 0.995);
    const u = d.clone().normalize(), w = elbow.clone().addScaledVector(u, -elbow.dot(u)).normalize();
    const cosA = (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach), a = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const at = shoulder.clone().addScaledVector(u, Math.cos(a) * L1).addScaledVector(w, Math.sin(a) * L1), end = shoulder.clone().addScaledVector(u, reach);
    // (Each aimed from where it lies now at where it is to point, so that it keeps its roll about its own length as the arm had it.)
    const aimFrom = (b: Bone, from: Vector3, to: Vector3) => {
      const wq = this.worldOf(b), now = this.restOf(this.childName(b.name)).sub(this.restOf(b.name)).applyQuaternion(this.W0.get(b)!.clone().invert()).applyQuaternion(wq).normalize();
      return new Quaternion().setFromUnitVectors(now, to.clone().sub(from).normalize()).multiply(wq);
    };
    const wUp = aimFrom(up, shoulder, at);
    this.setWorld(up, wUp, this.worldOf(up.parent!));
    this.update();
    const wLow = aimFrom(low, at, end);
    this.setWorld(low, wLow, wUp);
    const wHand = wLow.clone().multiply(this.W0.get(low)!.clone().invert()).multiply(this.W0.get(hand)!);
    this.setWorld(hand, wHand, wLow);
    this.update();
    return len / (L1 + L2);
  }
  private childName(n: string): string { return n.startsWith('upperarm_') ? `lowerarm_${n.slice(-1)}` : `hand_${n.slice(-1)}`; }

  /** Where the ankle is when the ball of the foot is at `ball` and the heel is lifted by `lift` (radians) about it. */
  ankleFor(k: Side, ball: Vector3, lift: number): Vector3 { return ball.clone().add(this.legs[k].ankleFromBall.clone().applyQuaternion(qx(lift))); }
  /** The foot's direction, ankle to ball, with the heel lifted by `lift`, then turned by `yaw` about the upright. */
  footDir(k: Side, lift: number, yaw = 0): Vector3 { return this.legs[k].ankleFromBall.clone().negate().applyQuaternion(qx(lift)).applyQuaternion(qy(yaw)); }
  /** The toes' direction, pitched down by `pitch` (radians), then turned by `yaw`. */
  toeDir(k: Side, pitch = 0, yaw = 0): Vector3 { return this.legs[k].dToe.clone().applyQuaternion(qx(pitch)).applyQuaternion(qy(yaw)); }

  /**
   * A leg reaching from the hip to `ankle`: its knee found so that thigh and shin meet, bent forward (about `hinge`, the figure's left
   * unless given: a knee over a ski turned across bends along the ski). Gives back the thigh's and the knee's angles (forward from
   * upright; how far bent) and how far the leg was stretched, as a share of its length. (Further than it reaches, it reaches as far as
   * it can towards it.)
   */
  reachLeg(k: Side, ankle: Vector3, dFoot: Vector3, dToe: Vector3, o: { hinge?: Vector3; roll?: number } = {}): { thighA: number; kneeA: number; stretch: number } {
    const L = this.legs[k], hip = this.hip(k), d = ankle.clone().sub(hip), len = d.length(), most = (L.thighLen + L.shinLen) * 0.995, reach = Math.min(len, most);
    const u = d.clone().normalize(), w = u.clone().cross(o.hinge ?? X).normalize();
    const cosA = (L.thighLen ** 2 + reach ** 2 - L.shinLen ** 2) / (2 * L.thighLen * reach), a = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const knee = hip.clone().addScaledVector(u, Math.cos(a) * L.thighLen).addScaledVector(w, Math.sin(a) * L.thighLen);
    const end = hip.clone().addScaledVector(u, reach);
    const dT = knee.clone().sub(hip), dS = end.clone().sub(knee);
    this.aimLeg(k, dT, dS, dFoot, dToe, o.roll ?? 0);
    const thighA = Math.atan2(dT.z, -dT.y), shinA = Math.atan2(dS.z, -dS.y);
    return { thighA, kneeA: thighA - shinA, stretch: len / (L.thighLen + L.shinLen) };
  }

  /** A leg by its thigh's angle forward from upright and the knee's bend (in the figure's upright plane), its foot and toes as given. */
  angleLeg(k: Side, thighA: number, kneeA: number, dFoot: Vector3, dToe: Vector3, roll = 0): void {
    const shinA = thighA - kneeA, dT = new Vector3(0, -Math.cos(thighA), Math.sin(thighA)), dS = new Vector3(0, -Math.cos(shinA), Math.sin(shinA));
    this.aimLeg(k, dT, dS, dFoot, dToe, roll);
  }

  /** Where a bone's joint is as the skeleton rests. */
  restOf(n: string): Vector3 {
    const v = this.restAt.get(n);
    if (!v) throw new Error(`a figure without ${n}`);
    return v.clone();
  }

  /**
   * The skeleton put through joints placed anywhere (a body gone limp, `ragdoll.ts`): `p` holds where the pelvis, the chest
   * (`spine_03`), the head, and each side's shoulder, elbow, wrist, hip, knee, ankle and ball of the foot are to be, by the names of
   * their bones, and `calf` is the knee. The pelvis and the chest are each turned as the frame of their joints is (the chest's from the
   * head and the two shoulders; the pelvis's from the chest and the two hips), the spine between them shared out; the neck aimed at the
   * head; each arm and leg aimed bone by bone at the next joint, turned no more than it must be from the bone above it; and each foot,
   * held fast in its boot, turned as its ankle, ball and knee lie. Bones that are not aimed (the fingers, the hands, the toes) keep their
   * turn from the bone above.
   */
  poseJoints(p: Record<string, Vector3>): void {
    this.begin();
    const r = (n: string) => this.restOf(n), q = (n: string) => p[n].clone();
    const frame = (up: Vector3, side: Vector3) => {
      const y = up.clone().normalize(), z = side.clone().cross(y).normalize(), x = y.clone().cross(z);
      return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z));
    };
    const turnOf = (up0: Vector3, side0: Vector3, up: Vector3, side: Vector3) => frame(up, side).multiply(frame(up0, side0).invert());
    const dPelvis = turnOf(r('spine_03').sub(r('pelvis')), r('thigh_l').sub(r('thigh_r')), q('spine_03').sub(q('pelvis')), q('thigh_l').sub(q('thigh_r')));
    const dChest = turnOf(r('Head').sub(r('spine_03')), r('upperarm_l').sub(r('upperarm_r')), q('Head').sub(q('spine_03')), q('upperarm_l').sub(q('upperarm_r')));
    const spine: [Quaternion, Quaternion, Quaternion] = [dPelvis.clone().slerp(dChest, 1 / 3), dPelvis.clone().slerp(dChest, 2 / 3), dChest];
    this.pelvis(p.pelvis, dPelvis);
    this.trunk(dPelvis, spine, dChest, dChest);
    // (The neck aimed at the head from where the chest has put it.)
    const neck = this.bone('neck_01'), neckFrom = r('Head').sub(r('neck_01')).applyQuaternion(dChest).normalize();
    const dNeck = new Quaternion().setFromUnitVectors(neckFrom, q('Head').sub(neck.getWorldPosition(new Vector3())).normalize()).multiply(dChest);
    this.trunk(dPelvis, spine, dNeck, dNeck);
    /** A bone aimed from its joint at the next one's place, turned from its parent's turn `dUp` as little as it must be. */
    const aim = (n: string, next: string, dUp: Quaternion, wUp: Quaternion) => {
      const b = this.bone(n), from = r(next).sub(r(n)).applyQuaternion(dUp).normalize();
      const to = q(next).sub(b.getWorldPosition(new Vector3()));
      const d = to.lengthSq() > 1e-10 ? new Quaternion().setFromUnitVectors(from, to.normalize()).multiply(dUp) : dUp.clone();
      const w = d.clone().multiply(this.W0.get(b)!);
      this.setWorld(b, w, wUp);
      return { d, w };
    };
    const held = (n: string, d: Quaternion, wUp: Quaternion) => this.setWorld(this.bone(n), d.clone().multiply(this.W0.get(this.bone(n))!), wUp);
    const wPelvis = dPelvis.clone().multiply(this.W0.get(this.pelvisBone)!);
    for (const k of ['l', 'r'] as const) {
      const clav = this.bone(`clavicle_${k}`), wClav = dChest.clone().multiply(this.W0.get(clav)!);
      this.setWorld(clav, wClav, this.chestW);
      const up = aim(`upperarm_${k}`, `lowerarm_${k}`, dChest, wClav), low = aim(`lowerarm_${k}`, `hand_${k}`, up.d, up.w);
      held(`hand_${k}`, low.d, low.w);
      const thigh = aim(`thigh_${k}`, `calf_${k}`, dPelvis, wPelvis), calf = aim(`calf_${k}`, `foot_${k}`, thigh.d, thigh.w);
      const foot = this.bone(`foot_${k}`), at = foot.getWorldPosition(new Vector3());
      const dFoot = turnOf(r(`ball_${k}`).sub(r(`foot_${k}`)), r(`calf_${k}`).sub(r(`foot_${k}`)), q(`ball_${k}`).sub(at), q(`calf_${k}`).sub(at));
      // (The frame's first direction is the one kept exactly: here the foot's, ankle to ball.)
      const wFoot = dFoot.clone().multiply(this.W0.get(foot)!);
      this.setWorld(foot, wFoot, calf.w);
      held(`ball_${k}`, dFoot, wFoot);
    }
    this.update();
  }

  /** Keeps every bone's turn and the pelvis's place as the frame at `time`. */
  keep(time: number): void {
    this.times.push(time);
    for (const b of this.bones) this.rot.get(b)!.push(...b.quaternion.toArray());
    this.hipsPos.push(...this.pelvisBone.position.toArray());
  }
  /**
   * The frames kept, as a clip; with `travel` (how far forward the figure has gone at each frame), a track of its root going along,
   * which the figure takes as a way to go (`Move.travel` in `library.ts`) rather than playing it.
   */
  clip(name: string, duration: number, travel?: number[]): AnimationClip {
    const tracks = [new VectorKeyframeTrack(`${this.pelvisBone.name}.position`, this.times, this.hipsPos), ...this.bones.map((b) => new QuaternionKeyframeTrack(`${b.name}.quaternion`, this.times, this.rot.get(b)!))];
    if (travel) tracks.push(new VectorKeyframeTrack(`${this.root.name}.position`, this.times, travel.flatMap((z) => [0, 0, z])));
    return new AnimationClip(name, duration, tracks);
  }
}
