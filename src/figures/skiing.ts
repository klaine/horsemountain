import { AnimationClip, Object3D, Vector3 } from 'three';
import { SKI_THICK } from './gear';
import { makeAlpineClips } from './alpine';
import { keyed, type Leg, looped, Poser, qx, qy, rad, type Side } from './posing';

/**
 * Three clips of skiing, made in code on the figures' skeleton as the run is (`gait.ts`, `posing.ts`), with skis and poles for them
 * to carry (`gear.ts`). Asked for: animations that resemble cross-country skiing, downhill skiing and a ski jump.
 *
 * - `Ski_Classic_Loop`: the diagonal stride of classic cross-country skiing, arm against leg as in walking: a kick, the ski held
 *   still on the snow for an instant while the leg drives back and the heel lifts from it (the binding holds only the toes), the leg
 *   carried on up behind with the ski's tail off the snow, brought forward low to glide on while the other kicks; the pole planted
 *   ahead as the leg on the other side kicks, pushed past the hip with the arm straightening, let go behind and swung forward again.
 *   The trunk well forward, the knees bent over the gliding ski, the hips dropping before each kick and rising with it.
 * - `Ski_Downhill_Loop`: carving down a slope, a turn to the left and one to the right: the skis parallel and edged, swung out from
 *   under the body and turned across the slope, the legs leaning into the turn and the hips with them, the chest kept square down the
 *   hill and tilted back over the outside ski, rising between turns; arms forward and out, the inside pole flicked to the snow as each
 *   turn begins.
 * - `Ski_Jump`: once through, in some six seconds: crouched on the in-run, the chest on the knees and the arms back; the take-off,
 *   legs driving straight; the flight, the body laid forward over the skis, the skis spread in a V with their tips up, the arms along
 *   the sides; the landing in a telemark, one foot ahead and the other knee low, arms out; and the outrun, standing up.
 *
 * Each is played in place: the figure does not travel with it, and the snow is wherever its feet are.
 */


const cyc = (p: number) => ((p % 1) + 1) % 1;
const deg = (keys: [number, number][]): [number, number][] => keys.map(([t, v]) => [t, rad(v)]);

/** What was found of a clip made: for checking it. */
export interface SkiMade {
  clip: AnimationClip;
  /** The most a leg was stretched, as a share of its length, while its foot was on the snow (more than 0.995 and the foot did not reach). */
  stretch: number;
  /** How near the snow a foot came while it was meant to be off it, and how far into it one went while on it, in metres. */
  clearance: number;
  sunk: number;
}

/** The ball of a foot on the snow, `z` ahead of the hip joint, with the ski under it. */
const onSnow = (P: Poser, L: Leg, x: number, z: number, up = 0) => new Vector3(x, L.ballUp + SKI_THICK + up, P.hipZ + z);
/** How high a foot's lowest point (its ball or its toes) stands over the snow, now; the ski under it. */
const footOver = (P: Poser, k: Side) => Math.min(P.at(`ball_${k}`).y - 0.015, P.at(`ball_leaf_${k}`).y - 0.012) - SKI_THICK;

/** The hips as high as the legs allow: the highest of `h` going down by steps at which `stretchAt(h)` is no more than `most`. */
function highest(top: number, most: number, stretchAt: (h: number) => number): number {
  let h = top;
  for (let i = 0; i < 300 && stretchAt(h) > most; i++) h -= 0.004;
  return h;
}

/**
 * The diagonal stride. `T` is a cycle, two kicks; the left kicks first, at the start.
 */
export function makeClassicSki(source: Object3D, base: AnimationClip, frames = 48): SkiMade {
  const P = new Poser(source, base), T = 1.3;
  // A leg through its cycle, `u` from the kick: where the ball of the foot is (ahead of the hip; over the snow), the heel's lift and
  // whether the ski is on the snow. The kick from 0 to 0.18, the ski still on the snow and the body going on over it; the leg carried
  // up behind to 0.3; brought forward low by 0.56; gliding on to the next kick, the body coming up over the ski.
  const ballZ = (u: number) => looped(u, [[0, 0.12], [0.18, -0.42], [0.3, -0.6], [0.43, -0.22], [0.56, 0.4], [0.78, 0.27], [1, 0.12]]);
  const ballUp = (u: number) => looped(u, [[0, 0], [0.17, 0], [0.3, 0.1], [0.43, 0.06], [0.54, 0.008], [0.6, 0], [1, 0]]);
  const lift = (u: number) => looped(u, deg([[0, 0], [0.1, 3], [0.18, 30], [0.3, 44], [0.43, 22], [0.55, 0], [1, 0]]));
  const legU = (k: Side, p: number) => cyc(p - (k === 'r' ? 0.5 : 0));
  // An arm through its cycle, `a` from the pole's plant (the right arm's as the left leg kicks): swung forward in the figure's frame
  // (not the chest's), the elbow's bend, the wrist's (back, the pole's tip behind the hand; forward, the pole let go and trailing).
  const armWorld = (a: number) => looped(a, deg([[0, 45], [0.12, 36], [0.3, -12], [0.42, -46], [0.56, -50], [0.8, 4], [1, 45]]));
  const elbow = (a: number) => looped(a, deg([[0, 50], [0.15, 44], [0.3, 24], [0.42, 6], [0.56, 10], [0.8, 38], [1, 50]]));
  const wrist = (a: number) => looped(a, deg([[0, 22], [0.15, 6], [0.3, -35], [0.42, -62], [0.56, -60], [0.72, -35], [0.88, 2], [1, 22]]));
  const lean = rad(30);

  const upper = (p: number, h: number) => {
    P.begin();
    // The hips: dropping before each kick, rising with it; the side of the leg that kicks going back with it.
    const half = cyc(p * 2), c = Math.cos(2 * Math.PI * (p - 0.27));
    const dPelvis = qy(rad(7) * c).multiply(qx(rad(16)));
    P.pelvis(new Vector3(0, h + looped(half, [[0, -0.03], [0.35, 0.025], [0.75, 0.005], [1, -0.03]]), P.pelvisAt.z + 0.06), dPelvis);
    const chest = (k: number) => qy(-rad(6) * c * k).multiply(qx(lean * (0.75 + 0.25 * k)));
    P.trunk(dPelvis, [chest(0.3), chest(0.65), chest(1)], qx(rad(18)), qx(rad(10)));
    for (const k of ['l', 'r'] as const) {
      const a = cyc(p - (k === 'r' ? 0 : 0.5));
      P.arm(k, { swing: armWorld(a) + lean, bend: elbow(a), wrist: wrist(a), hang: 80 });
    }
    P.update();
  };
  const legs = (p: number) => {
    let stretch = 0;
    for (const k of ['l', 'r'] as const) {
      const L = P.legs[k], u = legU(k, p), up = ballUp(u);
      // (The ski hinged at the toes: its tip kept on the snow as its tail lifts with the foot behind.)
      const ball = onSnow(P, L, L.sign * 0.1, ballZ(u), up), pitch = Math.asin(Math.min(0.5, up / 0.95));
      const r = P.reachLeg(k, P.ankleFor(k, ball, lift(u)), P.footDir(k, lift(u)), P.toeDir(k, pitch));
      if (u < 0.18 || u > 0.6) stretch = Math.max(stretch, r.stretch);
    }
    P.update();
    return stretch;
  };
  const h0 = highest(P.pelvisAt.y, 0.96, (h) => { let most = 0; for (let i = 0; i < 24; i++) { upper(i / 24, h); most = Math.max(most, legs(i / 24)); } return most; });
  let stretch = 0, clearance = Infinity, sunk = 0;
  for (let i = 0; i <= frames; i++) {
    const p = i / frames;
    upper(p, h0);
    stretch = Math.max(stretch, legs(p));
    for (const k of ['l', 'r'] as const) { const over = footOver(P, k); sunk = Math.max(sunk, -over); const u = legU(k, p); if (u > 0.22 && u < 0.5) clearance = Math.min(clearance, over); }
    P.keep(p * T);
  }
  return { clip: P.clip('Ski_Classic_Loop', T), stretch, clearance, sunk };
}

// (The downhill turns are made in `alpine.ts`, with the jumps that go between them.)
export { makeDownhillSki } from './alpine';

/** The jump's times: the take-off begins, the skis leave the snow, they meet it again. */
const JUMP = { takeOff: 1.4, lift: 1.82, land: 4.35, end: 6.0 };

/**
 * The ski jump, once through. Its parts keyed in time (seconds); the legs reaching for feet on the snow until the take-off and from
 * the landing, and in the air set by their angles, met at both ends by the angles the reaching legs had there.
 */
export function makeSkiJump(source: Object3D, base: AnimationClip, step = 1 / 30): SkiMade {
  const P = new Poser(source, base), J = JUMP;
  const at = (t: number, keys: [number, number][]) => keyed(t, keys, 0, 0);
  // The pelvis: low in the crouch and sat back, driving up and forward, thrown up in the flight and down to the landing; deep in the
  // telemark, then standing. Its pitch forward, the trunk's lean and the head's (each from upright, in degrees).
  const hips = [[0, 0.5], [J.takeOff, 0.5], [J.lift, 0.92], [2.5, 1.42], [3.2, 1.5], [3.9, 1.3], [J.land, 0.82], [4.75, 0.64], [5.35, 0.82], [J.end, 0.89]] as [number, number][];
  const back = [[0, -0.2], [J.takeOff, -0.2], [J.lift, 0.02], [J.land, 0.02], [4.75, -0.04], [J.end, 0]] as [number, number][];
  const tilt = deg([[0, 42], [J.takeOff, 42], [1.72, 18], [2.5, 55], [3.9, 54], [4.25, 16], [4.75, 22], [5.4, 10], [J.end, 4]]);
  const leanK = deg([[0, 74], [J.takeOff, 74], [1.72, 38], [2.5, 62], [3.9, 60], [4.25, 14], [4.75, 20], [5.4, 8], [J.end, 3]]);
  const headK = deg([[0, 34], [J.takeOff, 34], [1.8, 18], [2.5, 30], [3.9, 26], [J.land, 6], [J.end, 2]]);
  // The arms: back along the body in the crouch and the flight, out to the sides for the landing, hanging at the end. (Swung in the
  // chest's frame: 0 lies along the trunk.)
  const swingK = deg([[0, -10], [J.takeOff, -10], [1.7, 12], [2.0, -4], [2.5, -10], [3.9, -10], [4.3, 40], [4.75, 32], [5.35, 18], [J.end, 0]]);
  const hangK = [[0, 86], [J.takeOff, 86], [1.8, 80], [2.5, 72], [3.9, 72], [4.3, 24], [4.75, 18], [5.4, 40], [J.end, 78]] as [number, number][];
  const bendK = deg([[0, 10], [1.8, 16], [2.5, 8], [3.9, 8], [4.3, 22], [J.end, 14]]);
  // On the snow: the feet under the body, then for the landing the left ahead and the right behind with its heel up, then together.
  const footZ: Record<Side, [number, number][]> = {
    l: [[0, 0.1], [J.lift, 0.1], [J.land, 0.26], [4.75, 0.32], [5.4, 0.24], [J.end, 0.12]],
    r: [[0, 0.1], [J.lift, 0.1], [J.land, -0.26], [4.75, -0.36], [5.4, -0.18], [J.end, 0.12]],
  };
  const heelK: Record<Side, [number, number][]> = { l: [[0, 0], [J.end, 0]], r: deg([[0, 0], [J.land, 18], [4.75, 44], [5.4, 26], [J.end, 0]]) };
  // In the air: the skis spread in a V and their tips up (a negative pitch), then together and level to land.
  const skiPitch = deg([[J.lift, 0], [2.0, -12], [2.5, -33], [3.9, -30], [4.2, -8], [J.land, 0]]);
  const skiSpread = deg([[J.lift, 0], [2.1, 3], [2.6, 18], [3.9, 18], [4.2, 4], [J.land, 0]]);

  const upper = (t: number) => {
    P.begin();
    const dPelvis = qx(at(t, tilt));
    P.pelvis(new Vector3(0, at(t, hips), P.pelvisAt.z + at(t, back)), dPelvis);
    const l = at(t, leanK), chest = (k: number) => qx(l * (0.8 + 0.2 * k));
    P.trunk(dPelvis, [chest(0.3), chest(0.65), chest(1)], qx((l + at(t, headK)) / 2), qx(at(t, headK)));
    for (const k of ['l', 'r'] as const) P.arm(k, { swing: at(t, swingK), bend: at(t, bendK), hang: at(t, hangK), wrist: 0 });
    P.update();
  };
  /** The legs on the snow, reaching for their feet. */
  const ground = (t: number) => {
    let stretch = 0;
    const got = {} as Record<Side, { thighA: number; kneeA: number }>;
    for (const k of ['l', 'r'] as const) {
      const L = P.legs[k], heel = at(t, heelK[k]), ball = onSnow(P, L, L.sign * 0.09, at(t, footZ[k]));
      const r = P.reachLeg(k, P.ankleFor(k, ball, heel), P.footDir(k, heel), P.toeDir(k, 0));
      stretch = Math.max(stretch, r.stretch);
      got[k] = r;
    }
    P.update();
    return { stretch, got };
  };
  upper(J.lift); const off = ground(J.lift).got;
  upper(J.land); const down = ground(J.land).got;
  /** The legs in the air: straight back from the hips, a little bent; the foot square to the shin and lifted a little, the ski as keyed. */
  const air = (t: number) => {
    for (const k of ['l', 'r'] as const) {
      const thighA = at(t, [[J.lift, off[k].thighA], [2.5, -rad(42)], [3.9, -rad(42)], [J.land, down[k].thighA]]);
      const kneeA = at(t, [[J.lift, off[k].kneeA], [2.5, rad(6)], [3.9, rad(6)], [J.land, down[k].kneeA]]);
      const shinA = thighA - kneeA, spread = at(t, skiSpread) * (k === 'l' ? 1 : -1);
      // (The foot from as it stood at the take-off to square to the shin, its toes up a little, and back to as it lands, flat or, the
      // foot behind, with its heel up.)
      const square = -shinA - rad(25), w = Math.max(0, Math.min(1, (t - J.lift) / 0.4, (J.land - t) / 0.35));
      const ends = t < (J.lift + J.land) / 2 ? 0 : at(J.land, heelK[k]);
      P.angleLeg(k, thighA, kneeA, P.footDir(k, ends + (square - ends) * w, spread * 0.5), P.toeDir(k, at(t, skiPitch), spread));
    }
    P.update();
  };

  let stretch = 0, clearance = Infinity, sunk = 0;
  for (let t = 0; t <= J.end + 1e-6; t += step) {
    upper(t);
    if (t < J.lift || t >= J.land) {
      stretch = Math.max(stretch, ground(t).stretch);
      for (const k of ['l', 'r'] as const) sunk = Math.max(sunk, -footOver(P, k));
    } else {
      air(t);
      if (t > J.lift + 0.1 && t < J.land - 0.1) for (const k of ['l', 'r'] as const) clearance = Math.min(clearance, footOver(P, k));
    }
    P.keep(t);
  }
  return { clip: P.clip('Ski_Jump', J.end), stretch, clearance, sunk };
}

/** All of them, made on `source` from its idle's first frame: these two, and the downhill turns with their jumps (`alpine.ts`). */
export function makeSkiClips(source: Object3D, base: AnimationClip): AnimationClip[] {
  return [makeClassicSki(source, base).clip, ...makeAlpineClips(source, base), makeSkiJump(source, base).clip];
}
