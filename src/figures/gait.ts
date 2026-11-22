import { AnimationClip, Object3D, Vector3 } from 'three';
import { keyed, type Leg, Poser, qx, qy, qz, rad, smooth } from './posing';

/**
 * A run made rather than taken from the packs (asked: "the running animation looks super silly, make a better one"). The packs' only
 * running clips, a jog and a sprint, are keyed in a cartoon's way: the jog sinks the hips a fifth of a metre below standing and bobs
 * them a quarter of a metre a step, swings the hands half a metre ahead, and strides five metres a cycle, so that at a run's pace it
 * goes at some 110 steps a minute, a slow lope; the sprint is the same, crouched. People who run go at 160 to 190 steps a minute.
 *
 * This one is made on the figures' own skeleton, a cycle at a time, from how people run (Novacheck's review, 1998; and what is seen
 * of runners from the side): the foot that bears the body stays where it came down, the leg over it bent at the knee, solved for
 * each instant so that it reaches from the hip to the foot without the foot sliding; the hips lowest a little after the foot comes
 * down and highest in the air between steps, the leap from one foot to the other a true throw, up and down; the heel lifting as the
 * body passes over the foot, until only the ball and the toes are left on the ground; the free leg folding up behind, the heel coming
 * up under the seat, then the thigh driving forward and the shin reaching out to come down a little ahead of the hips. The pelvis
 * turns with the legs and the chest against it, the arms swing against the legs with the elbows bent near a right angle, the trunk
 * leans a little forward and the head stays level. Its stride is whatever the feet cover: `strideOf`.
 *
 * The left foot comes down at `LEFT_DOWN` of the cycle and the right half a cycle later, as in the packs' walk, jog and sprint, so
 * that a walk blends into this run, and this run into the sprint, with the feet in step.
 */
export interface RunStyle {
  /** The clip's name. */
  name: string;
  /** The speed it is made for, in metres a second. */
  speed: number;
  /** Steps a minute. */
  cadence: number;
  /** How far ahead of the hip the ball of the foot comes down, and how far behind it it leaves the ground, in metres. */
  reach: number;
  push: number;
  /** How far the heel is lifted (the foot's pitch) as it leaves the ground, in degrees. */
  heel: number;
  /** How far forward the thigh is at the height of its swing, from upright; and how far the knee is bent as it folds, in degrees. */
  thigh: number;
  knee: number;
  /** How far forward the pelvis and the chest lean, in degrees. */
  tilt: number;
  lean: number;
  /** How far the pelvis turns either way, and the chest against it, in degrees. */
  turn: number;
  chest: number;
  /** How far the upper arm swings either way about where it hangs, a little behind upright; and the elbow's bend, about which it closes and opens. */
  arm: number;
  armBack: number;
  elbow: number;
  elbowSwing: number;
}

/** Where in the cycle the left foot comes down. */
export const LEFT_DOWN = 0.05;

export const RUN: RunStyle = {
  name: 'Run_Loop', speed: 4.6, cadence: 178, reach: 0.3, push: 0.35, heel: 45, thigh: 40, knee: 100, tilt: 8, lean: 7,
  turn: 6, chest: 7, arm: 30, armBack: 8, elbow: 82, elbowSwing: 12,
};
export const SPRINT: RunStyle = {
  name: 'RunFast_Loop', speed: 7.0, cadence: 190, reach: 0.3, push: 0.4, heel: 50, thigh: 55, knee: 118, tilt: 11, lean: 11,
  turn: 7, chest: 9, arm: 42, armBack: 10, elbow: 78, elbowSwing: 16,
};

/** How far a cycle (two steps) carries the body: its speed over the time of two steps. */
export const strideOf = (s: RunStyle): number => (s.speed * 120) / s.cadence;

const G = 9.81;

/** What `makeRun` found of the clip it made: for checking it. */
export interface RunMade {
  clip: AnimationClip;
  stride: number;
  /** The hips' height over the ground where the foot comes down; the most the leg was stretched, as a share of its length. */
  hips: number;
  stretch: number;
  /** How far a foot slid while it bore the body, and how near the ground the free foot came, in metres. */
  slide: number;
  clearance: number;
  /** The most the knee bent in the swing, in degrees. */
  kneeMost: number;
}

/**
 * Makes a run of the given style on `model`'s skeleton (the mannequin that the clips are made for), from its pose at rest in `base`
 * (the idle's first frame: arms hanging, hands loose), which is kept for everything the run does not move (the fingers).
 */
export function makeRun(source: Object3D, base: AnimationClip, s: RunStyle, frames = 36): RunMade {
  const P = new Poser(source, base), legs = [P.legs.l, P.legs.r];
  const T = 120 / s.cadence, v = s.speed, stance = (s.reach + s.push) / v, beta = stance / T, flight = T / 2 - stance;
  if (flight <= 0.01) throw new Error(`${s.name}: no time in the air between steps`);
  const vUp = (G * flight) / 2, sink = (vUp * stance) / Math.PI;
  const cyc = (p: number) => ((p % 1) + 1) % 1;

  /** The pelvis and everything above it at phase `p`, with the hips at height `h`. */
  const upper = (p: number, h: number) => {
    P.begin();
    const c = Math.cos(2 * Math.PI * (p - LEFT_DOWN)), mid = Math.cos(2 * Math.PI * (p - LEFT_DOWN - beta / 2));
    // (Its left side forward as the left foot comes down; dropping on the side of the free leg; a little over the foot that bears it.)
    const dPelvis = qy(-rad(s.turn) * c).multiply(qx(rad(s.tilt))).multiply(qz(rad(3) * mid));
    P.pelvis(new Vector3(0.014 * mid, h, P.pelvisAt.z), dPelvis);
    // The chest turned against the pelvis (its right shoulder forward as the left foot comes down), leaning; the head level.
    const chest = (k: number) => qy(rad(s.chest) * c * k).multiply(qx(rad(s.lean) * (0.6 + 0.4 * k)));
    P.trunk(dPelvis, [chest(0.3), chest(0.65), chest(1)], qx(rad(s.lean * 0.4)), qx(rad(2)));
    // The arms: each swinging against the leg on its own side, the elbow bent, closing as the arm comes forward; a little across the
    // body as it comes forward.
    for (const k of ['l', 'r'] as const) {
      const fwd = k === 'r' ? c : -c, sway = Math.cos(2 * Math.PI * (p - LEFT_DOWN - 0.03)) * (k === 'r' ? 1 : -1);
      P.arm(k, { swing: rad(-s.armBack + s.arm * sway), inward: rad(6) * Math.max(0, sway) * (k === 'l' ? -1 : 1), bend: rad(s.elbow + s.elbowSwing * fwd) });
    }
    P.update();
  };

  /**
   * The bearing leg, its ball planted at `ballAt` with the heel lifted by `lift`, reaching from the hip; the toes stay flat on the
   * ground as the heel lifts.
   */
  const plant = (L: Leg, ballAt: Vector3, lift: number) => P.reachLeg(L.k, P.ankleFor(L.k, ballAt, lift), P.footDir(L.k, lift), L.dToe.clone());
  /** The free leg, by its thigh's angle forward from upright, the knee's bend, the foot's pitch (heel up) and the toes'. */
  const swingLeg = (L: Leg, thighA: number, kneeA: number, pitch: number, toePitch: number) => P.angleLeg(L.k, thighA, kneeA, P.footDir(L.k, pitch), P.toeDir(L.k, toePitch));

  /** How high the hips are at phase `p`, for hips `h0` high where a foot comes down: lowest under the bearing foot, thrown between. */
  const hipsAt = (p: number, h0: number) => {
    const t = cyc(p - LEFT_DOWN) % 0.5 * T;
    if (t < stance) return h0 - sink * Math.sin((Math.PI * t) / stance);
    const f = t - stance;
    return h0 + vUp * f - (G * f * f) / 2;
  };
  /** Where a foot is in its cycle: bearing (`u` of the way through) or free (`w` of the way through). */
  const legPhase = (L: Leg, p: number) => {
    const tau = cyc(p - LEFT_DOWN - (L.k === 'r' ? 0.5 : 0));
    return tau < beta ? { bearing: true, u: tau / beta } : { bearing: false, u: (tau - beta) / (1 - beta) };
  };
  /** The heel's lift while the foot bears the body: flat, then rising from a little before the body is over it. */
  const liftAt = (u: number) => rad(s.heel) * smooth((u - 0.42) / 0.58);
  const ballOf = (L: Leg, u: number) => new Vector3(L.sign * 0.078, L.ballUp, P.hipZ + s.reach - v * u * stance);

  // The hips as high as the legs allow: the leg stretched to no more than its length anywhere under the body.
  let h0 = P.pelvisAt.y;
  for (let tries = 0; tries < 200; tries++, h0 -= 0.003) {
    let most = 0;
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, p = LEFT_DOWN + u * beta;
      upper(p, hipsAt(p, h0));
      most = Math.max(most, plant(legs[0], ballOf(legs[0], u), liftAt(u)).stretch);
    }
    if (most <= 0.99) break;
  }

  // The bearing leg's angles where the foot comes down and leaves, and how fast they change there, for the free leg to meet them.
  const angles = (u: number) => { const p = LEFT_DOWN + u * beta; upper(p, hipsAt(p, h0)); return plant(legs[0], ballOf(legs[0], u), liftAt(u)); };
  const du = 0.01, swingTime = (1 - beta) * T, stanceTime = beta * T;
  const down = angles(0), down2 = angles(du), off = angles(1), off2 = angles(1 - du);
  const rate = (a: number, b: number) => ((a - b) / (du * stanceTime)) * swingTime;
  const offShin = off.thighA - off.kneeA, downShin = down.thighA - down.kneeA;
  const top = rad(s.thigh), fold = rad(s.knee);
  /**
   * The free leg's angles `w` of the way through its swing: thigh, knee, and the foot's pitch. As runners swing a leg: the thigh, still
   * going back as the foot leaves, comes forward to its height four fifths through and draws back a little to come down; the knee
   * folds at once, the heel coming up under the seat a little before halfway, and stays well bent while the thigh drives forward,
   * opening only in the last fifth to reach out for the ground.
   */
  const swingAt = (w: number) => {
    const thighA = keyed(w, [[0, off.thighA], [0.08, off.thighA - rad(2)], [0.45, (off.thighA + top) * 0.45], [0.8, top], [1, down.thighA]], rate(off.thighA, off2.thighA) * 0.3, rate(down2.thighA, down.thighA) * 0.5);
    // (The first fold quick, a third of the way in a tenth of the swing, so that the foot is off the ground at once and does not trail.)
    const kneeA = keyed(w, [[0, off.kneeA], [0.1, off.kneeA + (fold - off.kneeA) * 0.38], [0.42, fold], [0.62, fold * 0.9], [0.8, fold * 0.68], [1, down.kneeA]], ((fold - off.kneeA) * 0.38) / 0.1, 0);
    // The foot: from the push, easing to hang a little pointed, then flat to come down. (Its pitch heel-up, against the shin's lean.)
    const shinA = thighA - kneeA, pushRel = rad(s.heel) + offShin, landRel = downShin;
    const rel = w < 0.5 ? pushRel + (rad(10) - pushRel) * smooth(w / 0.5) : rad(10) + (landRel - rad(10)) * smooth((w - 0.6) / 0.4);
    return { thighA, kneeA, pitch: -shinA + rel };
  };

  // The frames.
  let slide = 0, clearance = Infinity, kneeMost = 0, stretch = 0;
  const planted = new Map<string, Vector3>();
  for (let i = 0; i <= frames; i++) {
    const p = i / frames;
    upper(p, hipsAt(p, h0));
    for (const L of legs) {
      const lp = legPhase(L, p);
      if (lp.bearing) {
        stretch = Math.max(stretch, plant(L, ballOf(L, lp.u), liftAt(lp.u)).stretch);
      } else {
        const a = swingAt(lp.u);
        kneeMost = Math.max(kneeMost, a.kneeA);
        // (The toes, flat on the ground as the foot left it, come into line with the foot as it lifts.)
        swingLeg(L, a.thighA, a.kneeA, a.pitch, a.pitch * smooth(lp.u / 0.2));
      }
    }
    P.update();
    // (Checked: the bearing ball where it came down, the ground carried back at the run's speed; the free foot clear of the ground.)
    for (const L of legs) {
      const lp = legPhase(L, p), ballW = P.at(`ball_${L.k}`);
      if (lp.bearing) {
        const ground = ballW.clone().setZ(ballW.z + v * lp.u * stance), key = `${L.k}`;
        if (lp.u === 0 || !planted.has(key)) planted.set(key, ground);
        slide = Math.max(slide, ground.distanceTo(planted.get(key)!));
      } else if (lp.u > 0.08 && lp.u < 0.92) {
        for (const n of [`ball_${L.k}`, `ball_leaf_${L.k}`, `foot_${L.k}`]) clearance = Math.min(clearance, P.at(n).y - (n.startsWith('foot') ? 0.09 : 0));
      }
    }
    P.keep(p * T);
  }
  return { clip: P.clip(s.name, T), stride: strideOf(s), hips: h0, stretch, slide, clearance, kneeMost: (kneeMost * 180) / Math.PI };
}
