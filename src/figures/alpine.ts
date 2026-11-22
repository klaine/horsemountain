import { AnimationClip, Object3D, Quaternion, Vector3 } from 'three';
import { SKI_THICK } from './gear';
import { bodyTurn, keyed, Poser, qx, qy, qz, rad, type Side, smooth } from './posing';

/**
 * Downhill skiing, and jumps that go with it (asked for: "animations for few different kind of downhill skiing jumps that you see
 * could be chained together with the downhill skiing (off a cliff, off a man made jump/kicker, ..?)"). Made in code on the figures'
 * skeleton as the run is (`posing.ts`), carrying the downhill skis and poles (`gear.ts`).
 *
 * A skier's pose is a handful of numbers (`AlpinePose`): how high the hips are and where; how the pelvis and the chest are turned and
 * leant; the head; each arm's swing and bend; each foot's place, and its ski's turn, pitch and edge; and the whole body turned (a spin
 * about the upright, a flip about its left) and lifted off the snow. The downhill turns are a loop of such poses; each jump a run of
 * them keyed in time, which begins and ends with the turns' own pose where one turn gives way to the next (`linkPose`), so that the
 * jump can be put between turns and the turns go on after it (`AFTER`, and `Figure.play`, which waits for that moment in the turns).
 *
 * - `Ski_Pop`: a hop off a roller or a bump, the everyday jump: a crouch, a spring, the knees drawn up for half a second, a landing
 *   taken in the legs.
 * - `Ski_Kicker`: straight air off a kicker, a built jump: crouched on the ramp, a pop, the knees drawn up in a tuck in the air for well
 *   over a second, the legs let down to land, the landing absorbed.
 * - `Ski_Kicker_360`: off a kicker, a full turn about the upright: the chest wound up the other way on the ramp, let go at the take-off,
 *   the turn made tucked, and the skis straight down the slope again to land.
 * - `Ski_Backflip`: off a kicker, a full turn over backwards: the arms and head thrown back at the take-off, tucked to turn quicker,
 *   opened to land.
 * - `Ski_Cliff_Drop`: off the edge of a drop: slower to the edge, rolled off with a small pop, a long fall laid forward over the skis
 *   with the arms reaching ahead and the eyes on the landing, which is taken low, the hips almost to the boots.
 *
 * Each is played in place, as the turns are: the body's height over the snow is the clip's (a jump goes up and comes down where it
 * began), and the slope, the ramp and the drop are not there.
 */

export interface AlpineArm { swing: number; bend: number; wrist: number; hang: number; inward: number }
export interface AlpineFoot { x: number; z: number; up: number; yaw: number; pitch: number; edge: number }
export interface AlpinePose {
  /** The pelvis's height over the snow (before the lift), and how far it is to the left and forward of where it rests. */
  hips: number;
  hipsX: number;
  hipsZ: number;
  pelvisYaw: number;
  pelvisRoll: number;
  pelvisPitch: number;
  chestYaw: number;
  chestRoll: number;
  lean: number;
  neck: number;
  head: number;
  /** The neck and head turned to the left of the body (the head looking round over a shoulder), half of it in the neck. */
  headYaw: number;
  /** Each arm: swung forward in the chest's frame, the elbow's bend and the wrist's (radians); how far let down from level (degrees); in across the body. */
  arms: Record<Side, AlpineArm>;
  /**
   * Each foot: the ball of the foot `x` to the left and `z` ahead of the hip, `up` over the snow; its ski (fast to the boot) turned to
   * the left by `yaw`, pitched nose down by `pitch`, rolled onto its right edge by `edge`.
   */
  feet: Record<Side, AlpineFoot>;
  /**
   * The whole body turned about the upright (`spin`, to the left) and about its left (`flip`, forward) round its middle, and lifted;
   * the spin's axis tipped off the upright by `cork` (`bodyTurn`).
   */
  spin: number;
  flip: number;
  cork: number;
  lift: number;
}

const X = new Vector3(1, 0, 0);
const cyc = (p: number) => ((p % 1) + 1) % 1;

/** Puts the figure in a pose. Gives back how far the legs were stretched, as a share of their length (more than 0.995: not reached). */
export function poseAlpine(P: Poser, a: AlpinePose): number {
  P.begin();
  const turned = a.spin !== 0 || a.flip !== 0, R = turned ? bodyTurn(a.spin, a.flip, a.cork) : new Quaternion();
  // (Its middle, which it turns about: a little over the pelvis.)
  const pivot = new Vector3(a.hipsX, a.hips + 0.12, P.pelvisAt.z + a.hipsZ);
  const place = (v: Vector3) => (turned ? v.sub(pivot).applyQuaternion(R).add(pivot) : v).setY(v.y + a.lift);
  const by = (q: Quaternion) => (turned ? R.clone().multiply(q) : q);
  const dPelvis = by(qy(a.pelvisYaw).multiply(qz(a.pelvisRoll)).multiply(qx(a.pelvisPitch)));
  P.pelvis(place(new Vector3(a.hipsX, a.hips, P.pelvisAt.z + a.hipsZ)), dPelvis);
  const chest = (k: number) => by(qy(a.chestYaw * k).multiply(qz(a.chestRoll * k)).multiply(qx(a.lean * (0.8 + 0.2 * k))));
  P.trunk(dPelvis, [chest(0.3), chest(0.65), chest(1)], by(qy(a.chestYaw + 0.5 * a.headYaw).multiply(qx(a.neck))), by(qy(a.chestYaw + a.headYaw).multiply(qx(a.head))));
  for (const k of ['l', 'r'] as const) P.arm(k, a.arms[k]);
  P.update();
  let stretch = 0;
  for (const k of ['l', 'r'] as const) {
    const L = P.legs[k], f = a.feet[k];
    const ball = new Vector3(f.x, L.ballUp + SKI_THICK + f.up, P.hipZ + f.z);
    let from = L.ankleFromBall.clone();
    if (f.pitch) from = from.applyQuaternion(qx(f.pitch));
    const ankle = place(ball.clone().add(from.applyQuaternion(qy(f.yaw))));
    const toDir = (v: Vector3) => (turned ? v.applyQuaternion(R) : v);
    const hinge = toDir(X.clone().applyQuaternion(qy(f.yaw)));
    const got = P.reachLeg(k, ankle, toDir(P.footDir(k, f.pitch, f.yaw)), toDir(P.toeDir(k, f.pitch, f.yaw)), { hinge, roll: f.edge });
    stretch = Math.max(stretch, got.stretch);
  }
  P.update();
  return stretch;
}

/** A pose `w` of the way from `a` to `b`, every number of it. */
function mix<T>(a: T, b: T, w: number): T {
  if (typeof a === 'number') return (a + ((b as number) - a) * w) as T;
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(a as object)) out[k] = mix((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], w);
  return out as T;
}
const clonePose = (a: AlpinePose): AlpinePose => mix(a, a, 0);

// ------------------------------------------------------------------ the turns

/** The turns' cycle: a turn to the left, then one to the right, in this many seconds. */
export const TURNS = 2.2;
const lean = rad(34);
/** How far into a turn and which way: up to 1 at the middle of the left one (the first half), down to -1 at the middle of the right. */
const turnOf = (p: number) => Math.sin(2 * Math.PI * p);
/** The skis turned across the slope (to the left, positive), a little after the body leans; and on their edges (left edges down, negative). */
const yawOf = (p: number) => rad(20) * Math.sin(2 * Math.PI * (p - 0.1)), edgeOf = (p: number) => -rad(32) * Math.sin(2 * Math.PI * (p - 0.04));
/** The inside pole's flick to the snow, as a turn begins: the left's just before the left turn, the right's half a cycle on. */
const flick = (k: Side, p: number) => { const d = cyc(p - (k === 'l' ? 0.96 : 0.46) + 0.5) - 0.5; return Math.exp(-((d / 0.055) ** 2)); };

/**
 * The turns at phase `p` of their cycle, the hips `h` high where they are lowest. Sat lower than a skier walking would stand, the knees
 * well bent and the shins pressed forward into the boots, the hips back over the heels and the trunk forward to balance them, the
 * hands ahead; the hips lowest in the turn and rising between, turned a little with the skis and dropped on the inside; the chest
 * square down the slope, tilted back over the outside ski; the feet swung out from under the body, away from the turn, the inside
 * foot a little ahead.
 */
export function turnsPose(p: number, h: number): AlpinePose {
  return carvePose(h, turnOf(p), yawOf(p), edgeOf(p), flick('l', p), flick('r', p));
}

/**
 * A skier carving: `s` how far it leans into a turn and which way (1 to the left as far as the turns go, -1 to the right), the skis
 * turned by `y` and edged by `r`, and each pole's flick to the snow (0 to 1). The turns' pose (`turnsPose`), and the long run's
 * (`makeDownhillRun`), which drives these by the turns it makes.
 */
export function carvePose(h: number, s: number, y: number, r: number, flickL: number, flickR: number): AlpinePose {
  const arm = (k: Side): AlpineArm => { const f = k === 'l' ? flickL : flickR; return { swing: rad(32) + lean + rad(14) * f, bend: rad(48), wrist: rad(34) - rad(55) * f, hang: 62, inward: rad(4) * (k === 'l' ? -1 : 1) }; };
  const foot = (k: Side): AlpineFoot => { const sign = k === 'l' ? 1 : -1; return { x: sign * 0.12 - 0.3 * s, z: 0.2 + 0.07 * s * sign, up: 0, yaw: y, pitch: 0, edge: r }; };
  return {
    hips: h + 0.05 * (1 - Math.abs(s)), hipsX: 0, hipsZ: -0.06, pelvisYaw: 0.45 * y, pelvisRoll: -rad(11) * s, pelvisPitch: rad(24),
    chestYaw: -0.1 * y, chestRoll: rad(7) * s, lean, neck: rad(16), head: rad(6), headYaw: 0.1 * y, arms: { l: arm('l'), r: arm('r') }, feet: { l: foot('l'), r: foot('r') },
    spin: 0, flip: 0, cork: 0, lift: 0,
  };
}

/** The hips as high as the legs allow in the turns: the highest at which no leg is stretched past 0.85 of its length. */
function turnsHeight(P: Poser): number {
  let h = P.pelvisAt.y;
  const stretchAt = (h2: number) => { let most = 0; for (let i = 0; i < 24; i++) most = Math.max(most, poseAlpine(P, turnsPose(i / 24, h2))); return most; };
  for (let i = 0; i < 300 && stretchAt(h) > 0.85; i++) h -= 0.004;
  return h;
}

/** What was found of a clip made: for checking it. */
export interface AlpineMade {
  clip: AnimationClip;
  /** The most a leg was stretched while on the snow, as a share of its length; how far a foot went into the snow while on it, and how near the snow a ski's ends came while in the air (metres). */
  stretch: number;
  sunk: number;
  clearance: number;
}

/** How far into the snow (negative) or over it the lowest of a foot's ball, its toes, and its ski's tip and tail are, now. */
function skiOver(P: Poser, k: Side, ski = true): number {
  const ball = P.at(`ball_${k}`), toe = P.at(`ball_leaf_${k}`), dir = toe.clone().sub(ball).normalize();
  let low = Math.min(ball.y - 0.015, toe.y - 0.012) - SKI_THICK;
  // (The ski runs on along the toes' line, 0.88 ahead of the ball and 0.8 behind it, its sole a hand under the ball.)
  if (ski) for (const reach of [0.88, -0.8]) low = Math.min(low, ball.y + dir.y * reach - 0.015 - SKI_THICK);
  return low;
}

export function makeDownhillSki(source: Object3D, base: AnimationClip, frames = 64): AlpineMade {
  const P = new Poser(source, base), h0 = turnsHeight(P);
  let stretch = 0, sunk = 0;
  for (let i = 0; i <= frames; i++) {
    const p = i / frames;
    stretch = Math.max(stretch, poseAlpine(P, turnsPose(p, h0)));
    for (const k of ['l', 'r'] as const) sunk = Math.max(sunk, -skiOver(P, k, false));
    P.keep(p * TURNS);
  }
  return { clip: P.clip('Ski_Downhill_Loop', TURNS), stretch, sunk, clearance: Infinity };
}

// ------------------------------------------------------------------ the jumps

/** Which clip goes on after a jump: the turns. */
export const AFTER: Record<string, string> = {};
/** The jumps, in the order they are offered. */
export const JUMPS = ['Ski_Pop', 'Ski_Kicker', 'Ski_Kicker_360', 'Ski_Backflip', 'Ski_Cliff_Drop'] as const;
for (const j of JUMPS) AFTER[j] = 'Ski_Downhill_Loop';
/** A run down the hill with every jump in it, a turn or two between them (`Figure.chain`). */
export const SKI_RUN = ['Ski_Downhill_Loop', 'Ski_Pop', 'Ski_Kicker', 'Ski_Kicker_360', 'Ski_Cliff_Drop', 'Ski_Backflip'];
/**
 * Where in the turns a jump may begin: where one turn gives way to the next, at these shares of their cycle; the jump begins in the
 * turns' pose at the first of them (`linkPose`), and the other is near enough to it, the same turned the other way, to fade across.
 */
export const LINKS = [0, 0.5];
/** The turns' pose where a jump begins and ends. */
const linkPose = (h: number) => turnsPose(LINKS[0], h);

/** The straight run to a jump: skis flat and straight down the slope, the stance and arms of the turns, nothing leant. */
function straightPose(h: number): AlpinePose {
  const a = turnsPose(0.25, h), arm = (k: Side): AlpineArm => ({ ...a.arms[k], swing: rad(32) + lean, wrist: rad(34) });
  return {
    ...a, hips: h + 0.02, pelvisYaw: 0, pelvisRoll: 0, chestYaw: 0, chestRoll: 0, headYaw: 0, arms: { l: arm('l'), r: arm('r') },
    feet: { l: { x: 0.12, z: 0.2, up: 0, yaw: 0, pitch: 0, edge: 0 }, r: { x: -0.12, z: 0.2, up: 0, yaw: 0, pitch: 0, edge: 0 } },
  };
}

/**
 * A jump: how long it is, when it leaves the snow and meets it again, and its pose at every time, from the straight run's; and, for one
 * that goes off an edge, how fast it goes forward at every time (the figure is carried along by it, and falls where the ground does).
 */
interface JumpPlan {
  length: number;
  off: number;
  on: number;
  pose(t: number, run: AlpinePose): AlpinePose;
  speed?: (t: number) => number;
}
const G = 9.81;
/** The height thrown up between leaving the snow at `off` and meeting it again at `on`: a body's, with nothing but its weight on it. */
const thrown = (t: number, off: number, on: number) => { if (t <= off || t >= on) return 0; const u = t - off, T = on - off; return (G * T * u) / 2 - (G * u * u) / 2; };
const at = (t: number, keys: [number, number][]) => keyed(t, keys, 0, 0);
const deg = (keys: [number, number][]): [number, number][] => keys.map(([t, v]) => [t, rad(v)]);
/** Every number of a pose that is a turn, eased between keys given in degrees. */
const both = (a: AlpinePose, f: (s: Side, arm: AlpineArm, foot: AlpineFoot) => void) => { for (const k of ['l', 'r'] as const) f(k, a.arms[k], a.feet[k]); };

/**
 * The common parts of a jump off the snow: the crouch before it (`down`, how far the hips sink, at `t0`), the spring at `off` and the
 * landing at `on` taken in the legs (`absorb`, how far the hips sink), with the knees drawn up in the air by `tuck` (the feet lifted
 * that far, the hips with them a little) and the skis' tips up a little.
 */
function airborne(a: AlpinePose, t: number, o: { t0: number; off: number; on: number; down: number; tuck: number; absorb: number; recover: number }): AlpinePose {
  const { t0, off, on } = o, mid = (off + on) / 2;
  a.hips += at(t, [[t0 - 0.25, 0], [t0, -o.down], [off, 0.06], [off + 0.12, 0], [on - 0.05, 0.02], [on + 0.12, -o.absorb], [on + o.recover, 0]]);
  const tuck = at(t, [[off, 0], [off + 0.18, o.tuck * 0.8], [mid, o.tuck], [on - 0.2, o.tuck * 0.6], [on - 0.04, 0]]);
  a.hips -= tuck * 0.25;
  both(a, (_k, _arm, f) => { f.up += tuck; f.z += tuck * 0.15; f.pitch += at(t, deg([[off, 0], [off + 0.2, -8], [on - 0.25, -6], [on, 0]])); });
  a.lift = thrown(t, off, on);
  return a;
}

const PLANS: Record<(typeof JUMPS)[number], JumpPlan> = {
  // A hop off a roller: half a second in the air.
  Ski_Pop: {
    length: 2.0, off: 0.72, on: 1.22,
    pose(t, run) {
      const a = airborne(clonePose(run), t, { t0: 0.58, off: 0.72, on: 1.22, down: 0.1, tuck: 0.12, absorb: 0.13, recover: 0.4 });
      both(a, (_k, arm) => { arm.hang += at(t, [[0.7, 0], [0.85, -16], [1.15, -14], [1.4, 0]]); arm.swing += at(t, deg([[0.7, 0], [0.85, 8], [1.3, 0]])); });
      return a;
    },
  },
  // Straight air off a kicker, tucked, well over a second in the air.
  Ski_Kicker: {
    length: 3.2, off: 0.95, on: 2.25,
    pose(t, run) {
      const a = airborne(clonePose(run), t, { t0: 0.78, off: 0.95, on: 2.25, down: 0.09, tuck: 0.3, absorb: 0.18, recover: 0.5 });
      // (The chest coming up a little in the tuck, the arms forward and out for balance.)
      a.lean += at(t, deg([[0.95, 0], [1.2, -8], [2.0, -8], [2.25, 0], [2.4, 6], [2.8, 0]]));
      both(a, (_k, arm) => { arm.hang += at(t, [[0.9, 0], [1.15, -22], [2.0, -20], [2.35, 0]]); arm.swing += at(t, deg([[0.9, 0], [1.1, 16], [2.1, 12], [2.4, 0]])); });
      return a;
    },
  },
  // A full turn about the upright, to the left, wound up the other way on the ramp.
  Ski_Kicker_360: {
    length: 3.4, off: 1.0, on: 2.35,
    pose(t, run) {
      const off = 1.0, on = 2.35;
      const a = airborne(clonePose(run), t, { t0: 0.8, off, on, down: 0.09, tuck: 0.28, absorb: 0.18, recover: 0.5 });
      // The chest wound to the right before the take-off, then leading the turn; the arms in close as it turns.
      a.chestYaw += at(t, deg([[0.45, 0], [0.85, -38], [off, -30], [off + 0.2, 18], [on - 0.3, 10], [on, 0]]));
      a.pelvisYaw += at(t, deg([[0.45, 0], [0.85, -14], [off + 0.15, 6], [on, 0]]));
      both(a, (_k, arm) => { arm.hang += at(t, [[0.9, 0], [off + 0.15, 10], [on - 0.25, 10], [on, 0]]); arm.bend += at(t, deg([[0.9, 0], [off + 0.15, 30], [on - 0.25, 30], [on, 0]])); });
      // (Slow as it leaves the ramp and as it lands, quickest between; the skis straight down the slope again by the landing.)
      const u = Math.min(1, Math.max(0, (t - off) / (on - 0.08 - off)));
      a.spin = u >= 1 ? 0 : 2 * Math.PI * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.7);
      return a;
    },
  },
  // A full turn over backwards: thrown back, tucked, opened to land.
  Ski_Backflip: {
    length: 3.8, off: 1.05, on: 2.6,
    pose(t, run) {
      const off = 1.05, on = 2.6;
      const a = airborne(clonePose(run), t, { t0: 0.85, off, on, down: 0.1, tuck: 0.42, absorb: 0.2, recover: 0.55 });
      // The arms swung up and back and the head back at the take-off; the chest up out of its lean while it turns.
      both(a, (_k, arm) => { arm.swing += at(t, deg([[0.85, 0], [off + 0.1, 70], [off + 0.5, 40], [on - 0.3, 10], [on, 0]])); arm.hang += at(t, [[0.85, 0], [off + 0.1, -30], [on - 0.3, -10], [on, 0]]); });
      a.lean += at(t, deg([[0.85, 0], [off + 0.1, -26], [on - 0.35, -14], [on, 0], [on + 0.15, 8], [on + 0.5, 0]]));
      a.head += at(t, deg([[0.85, 0], [off + 0.1, -30], [off + 0.6, -10], [on - 0.2, 10], [on + 0.3, 0]]));
      a.lift = thrown(t, off, on) * 1.15;
      // (Backwards is a negative turn about its left; quicker when tucked, between.)
      const u = Math.min(1, Math.max(0, (t - off) / (on - 0.1 - off)));
      a.flip = u >= 1 ? 0 : -2 * Math.PI * (u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.75);
      return a;
    },
  },
  // Off the edge of a drop: rolled off with a small pop, a long hang laid forward over the skis, taken low. Carried forward three metres
  // a second from the approach until after the landing, so that played near an edge it goes over it (`DROPS`).
  Ski_Cliff_Drop: {
    length: 3.7, off: 1.0, on: 2.45,
    speed: (t) => at(t, [[0.3, 0], [0.7, 3], [2.45, 3], [3.3, 0]]),
    pose(t, run) {
      const off = 1.0, on = 2.45;
      const a = airborne(clonePose(run), t, { t0: 0.85, off, on, down: 0.05, tuck: 0.12, absorb: 0.3, recover: 0.7 });
      // (Not thrown up: dropped. Here, where the snow does not fall away under it, a small lift and a long, slow coming down.)
      a.lift = at(t, [[off, 0], [off + 0.22, 0.3], [off + 0.6, 0.34], [on - 0.45, 0.22], [on, 0]]);
      a.lean += at(t, deg([[0.6, 0], [off, 8], [off + 0.4, 12], [on - 0.2, 6], [on + 0.2, 14], [on + 0.7, 0]]));
      a.head += at(t, deg([[0.6, 0], [off, 20], [on - 0.1, 24], [on + 0.5, 0]]));
      // The arms reaching ahead and out; the skis' tips kept up, the feet a little ahead of the body.
      both(a, (_k, arm, f) => {
        arm.swing += at(t, deg([[0.6, 0], [off + 0.1, 28], [on - 0.1, 30], [on + 0.3, 14], [on + 0.8, 0]]));
        arm.hang += at(t, [[0.6, 0], [off + 0.1, -26], [on, -22], [on + 0.8, 0]]);
        f.z += at(t, [[off, 0], [off + 0.3, 0.12], [on - 0.1, 0.1], [on + 0.3, 0]]);
        f.pitch += at(t, deg([[off, 0], [off + 0.3, -6], [on - 0.5, -3], [on - 0.25, 0]]));
      });
      return a;
    },
  },
};

/**
 * Makes a jump: from the turns' pose where a turn gives way to the next, into the straight run to the jump, the jump, and back into
 * that pose of the turns at its end.
 */
export function makeAlpineJump(source: Object3D, base: AnimationClip, name: (typeof JUMPS)[number], step = 1 / 30): AlpineMade {
  const P = new Poser(source, base), h0 = turnsHeight(P), plan = PLANS[name], link = linkPose(h0), run = straightPose(h0);
  let stretch = 0, sunk = 0, clearance = Infinity, went = 0;
  const travel: number[] = [];
  for (let t = 0; t <= plan.length + 1e-6; t += step) {
    if (plan.speed) { travel.push(went); went += plan.speed(t + step / 2) * step; }
    const w = Math.min(smooth(t / 0.35), smooth((plan.length - t) / 0.45));
    const pose = mix(link, plan.pose(t, run), w);
    // (A turn about the upright or over is not eased into the turns' pose: it is whole by then.)
    pose.spin = plan.pose(t, run).spin;
    pose.flip = plan.pose(t, run).flip;
    const s = poseAlpine(P, pose);
    if (t < plan.off || t > plan.on) {
      stretch = Math.max(stretch, s);
      for (const k of ['l', 'r'] as const) sunk = Math.max(sunk, -skiOver(P, k, false));
    } else if (t > plan.off + 0.12 && t < plan.on - 0.12) for (const k of ['l', 'r'] as const) clearance = Math.min(clearance, skiOver(P, k));
    P.keep(Math.min(t, plan.length));
  }
  return { clip: P.clip(name, plan.length, plan.speed ? travel : undefined), stretch, sunk, clearance };
}

/**
 * Jumps that go off an edge, and how the figure plays one where the ground falls away under it: once its body leaves the ground, the
 * clip is held at `hold` (the hang, laid forward over the skis) while it falls, the clip's own small lift there taken off (`lift`) as the
 * fall is the body's; when it meets the ground again, the clip goes on from `land`. On level ground it plays through, a small hop.
 */
export const DROPS: Record<string, { hold: number; land: number; lift: number }> = {};
{
  const plan = PLANS.Ski_Cliff_Drop, hold = plan.off + 0.45;
  DROPS.Ski_Cliff_Drop = { hold, land: plan.on, lift: plan.pose(hold, turnsPose(0, 0.8)).lift };
}

/** The downhill turns and every jump, made on `source` from its idle's first frame. */
export function makeAlpineClips(source: Object3D, base: AnimationClip): AnimationClip[] {
  return [makeDownhillSki(source, base).clip, ...JUMPS.map((j) => makeAlpineJump(source, base, j).clip)];
}

// ------------------------------------------------------------------ a run down a slope

/**
 * A long run down a slope, played as the skier goes down it (asked: "can the downhill animation be used to visualize long wide turns
 * tightening to short turns and opening up to straight lining and to tuck it and then braking speed down and continuing downhill
 * again?"): the turns' pose driven, moment by moment, by what the skier is doing, and the way it goes down the slope with them.
 *
 * What it does is set by hand, in time (`RUN_KEYS`): how long a pair of turns takes, how far the skis turn across the slope, how fast
 * it goes, and when it tucks and when it brakes. From those: the skis' heading, swinging across the slope and back (the turns' rhythm
 * kept by a phase that runs at their pace, so that turns tighten without a jump); the lean into each turn, as much as speed and how
 * quickly it turns ask (a body going round leans in until its weight and the turn's pull meet: `atan(speed × turning / g)`), and the
 * skis' edges with it; the inside pole flicked to the snow as each turn begins; the way it goes, along its skis; the tuck, crouched with
 * the chest on the knees and the hands together ahead; and the braking, the skis thrown across the slope on their uphill edges with the
 * upper body still facing down it, sliding on down the slope as it slows.
 */
export const RUN_KEYS = {
  /** How long a pair of turns takes, in seconds. */
  cycle: [[0, 4.4], [11, 4.2], [19, 1.3], [23, 1.3], [26, 2.6], [36.2, 2.6], [37, 2.8], [44, 2.8]] as [number, number][],
  /** How far the skis turn across the slope at the end of a turn, in degrees. */
  across: [[0, 0], [1.2, 0], [3.2, 42], [11, 42], [19, 20], [23, 20], [25.6, 0], [36.4, 0], [38.6, 32], [44, 32]] as [number, number][],
  /** How fast, in metres a second. */
  speed: [[0, 5], [3, 10], [11, 11], [19, 8.5], [23, 8], [26, 12], [28, 15], [32, 19], [33, 19], [33.35, 18.6], [34.9, 3], [35.6, 2.6], [37, 6], [44, 10]] as [number, number][],
  /** How far into a tuck, and into braking (0 to 1). */
  tuck: [[27.8, 0], [28.5, 1], [32, 1], [32.8, 0]] as [number, number][],
  brake: [[33.0, 0], [33.35, 1], [34.95, 1], [35.7, 0]] as [number, number][],
};
/** The run's parts, for a page to show where it is. */
export const RUN_PARTS = [
  { from: 0, to: 11, label: 'Long, wide turns' }, { from: 11, to: 19, label: 'Tightening' }, { from: 19, to: 23, label: 'Short turns' },
  { from: 23, to: 26, label: 'Opening up' }, { from: 26, to: 28, label: 'Straight line' }, { from: 28, to: 32.8, label: 'Tuck' },
  { from: 32.8, to: 35.7, label: 'Braking' }, { from: 35.7, to: 44, label: 'On down the hill' },
];
export const RUN_LENGTH = 44;

/**
 * Where the skier is at a moment of the run: how far down the slope and to its left (metres), how fast, which way its skis and it go
 * (radians from straight down, to the left), and how much its skis slide sideways (0 to 1); how far into a tuck and braking; and how far
 * it leans into its turn and flicks each pole, as `riderPose` takes them (so that another skier can be posed from the run, live).
 */
export interface RunSample { t: number; down: number; left: number; speed: number; ski: number; way: number; skid: number; tuck: number; brake: number; lean: number; flickL: number; flickR: number }

export function makeDownhillRun(source: Object3D, base: AnimationClip, step = 1 / 30): { clip: AnimationClip; samples: RunSample[]; stretch: number; sunk: number } {
  const P = new Poser(source, base), h0 = turnsHeight(P), K = RUN_KEYS, n = Math.round(RUN_LENGTH / step);
  // The turns' phase, run at their pace; the skis' heading from it, swinging across the slope and back.
  const phase: number[] = [0];
  for (let i = 1; i <= n + 1; i++) phase.push(phase[i - 1] + step / at((i - 0.5) * step, K.cycle));
  const carveAt = (i: number) => -rad(at(i * step, K.across)) * Math.cos(2 * Math.PI * phase[Math.max(0, Math.min(n + 1, i))]);
  const samples: RunSample[] = [];
  let down = 0, left = 0, stretch = 0, sunk = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * step, p = phase[i], speed = at(t, K.speed), tuck = at(t, K.tuck), brake = at(t, K.brake);
    const carve = carveAt(i), turning = (carveAt(i + 1) - carveAt(i - 1)) / (2 * step);
    // The lean a body going round needs, as a share of the turns' own (`turnsPose`'s 1, some 48 degrees).
    const s = Math.max(-1.3, Math.min(1.3, Math.atan((speed * turning) / G) / rad(48))) * (1 - brake);
    const ski = carve + (rad(78) - carve) * brake, way = carve * (1 - brake);
    const turnsBig = Math.min(1, at(t, K.across) / 25) * (1 - tuck) * (1 - brake);
    const flickL = flick('l', p) * turnsBig, flickR = flick('r', p) * turnsBig;
    const a = riderPose(h0, { s, ski, tuck, brake, tall: 0, flickL, flickR });
    stretch = Math.max(stretch, poseAlpine(P, a));
    for (const k of ['l', 'r'] as const) sunk = Math.max(sunk, -skiOver(P, k, false));
    P.keep(t);
    samples.push({ t, down, left, speed, ski, way, skid: Math.abs(Math.sin(ski - way)), tuck, brake, lean: s, flickL, flickR });
    down += speed * Math.cos(way) * step;
    left += speed * Math.sin(way) * step;
  }
  return { clip: P.clip('Ski_Downhill_Run', RUN_LENGTH), samples, stretch, sunk };
}

/**
 * What a skier is doing at a moment, as `riderPose` takes it: how far it leans into a turn (`s`, as `carvePose` takes it), which way its
 * skis point (radians to the left of where it faces), how far it is into a tuck, into braking and into standing tall (each 0 to 1), and
 * each pole's flick to the snow.
 */
export interface RideControls {
  s: number; ski: number; tuck: number; brake: number; tall: number; flickL: number; flickR: number;
  /** How far down it has sunk to take a landing, or crouched on a ramp (0 to 1); and any turn of the whole body still to come out of. */
  absorb?: number; spin?: number; flip?: number;
  /** How far its turn is skidded rather than carved (0 to 1): its skis pivoted across the way it goes (in `ski`), flatter on the snow. */
  skid?: number;
  /**
   * How far into the pop at a kicker's lip (0 to 1): up out of the ramp's crouch, the legs driven long and the arms swung forward and
   * up, as a skier springs off a lip; up and back over the head, the more it stands tall (setting a backflip).
   */
  pop?: number;
  /**
   * Its life, as it goes (asked: "there should be some "life" movement going on even straight lining without turns"): `life`, a time
   * in seconds that its small movements run by (breathing, looking about, shifting its weight, its hands); `flex`, how far its knees
   * give to the snow's shape under it (1 sunk into a hollow taken fast, -1 let long over a crest); `back`, how far it looks back over
   * its left shoulder riding switch (0 to 1).
   */
  life?: number; flex?: number; back?: number;
  /**
   * Pressed onto the tips of its skis (positive, a nose butter: its weight forward over them, the tails up) or onto their tails
   * (negative, a tail butter: sat back, the tips up), 0 to 1 either way (asked: "add a single control to 180 to switch (and back), this
   * could alternate between pops, smooth and cool nose butters and some other cool "land tricks"").
   */
  press?: number;
}

/**
 * A body's small movements by the time `t` (seconds), each a few slow waves of their own so that nothing repeats soon: breathing
 * (-1 to 1), looking about (radians to the left), shifting its weight (-1 to 1, to the left), its hands (each -1 to 1).
 */
export function lifeAt(t: number): { breath: number; look: number; shift: number; handL: number; handR: number } {
  const w = (f: number, p: number) => Math.sin(2 * Math.PI * f * t + p);
  return {
    breath: w(0.27, 0),
    look: 0.3 * w(0.071, 0.6) + 0.16 * w(0.19, 2.1) + 0.06 * w(0.53, 4),
    shift: 0.7 * w(0.11, 1.3) + 0.3 * w(0.29, 0.2),
    handL: 0.6 * w(0.37, 0.4) + 0.4 * w(0.83, 1.9), handR: 0.6 * w(0.41, 3.1) + 0.4 * w(0.77, 5.2),
  };
}

/**
 * A skier's pose from what it is doing: carving (`carvePose`), with as much of a tuck, of braking and of standing tall as it is into
 * them, any of them together (a tuck held through a turn, as a racer carves the faster turns). The long run's, and the live rider's.
 */
export function riderPose(h0: number, c: RideControls): AlpinePose {
  const { s, ski, tuck, brake, tall } = c, skid = c.skid ?? 0;
  const a = carvePose(h0, s, ski, -rad(32) * s * (1 - 0.4 * skid) - rad(48) * brake, c.flickL, c.flickR);
  // Skidding a turn: a little lower and back, the feet pushed ahead to drive the tails round, the arms out for balance.
  if (skid) {
    a.hips -= 0.04 * skid;
    a.pelvisPitch -= rad(4) * skid;
    both(a, (_k, arm, f) => { f.z += 0.06 * skid; arm.hang -= 8 * skid; });
  }
  // Braking: the feet pushed on down the slope ahead of the body, which sits back and low over its uphill edges, the upper body
  // still facing down the slope, the arms out.
  a.hips -= 0.1 * brake;
  a.pelvisPitch -= rad(8) * brake;
  both(a, (_k, arm, f) => { f.z += 0.3 * brake; arm.hang -= 12 * brake; arm.swing += rad(6) * brake; });
  // The tuck: crouched low with the chest down on the knees, the head up to see ahead; the elbows down by the knees, the forearms
  // level and the fists together ahead of the chin, the wrists bent back so that the poles run back along the forearms, under the
  // arms.
  a.hips -= 0.2 * tuck;
  a.pelvisPitch += rad(30) * tuck;
  a.lean += rad(30) * tuck;
  a.neck -= rad(10) * tuck;
  a.head -= rad(34) * tuck;
  both(a, (k, arm, f) => {
    arm.swing += rad(8) * tuck; arm.bend += (rad(95) - arm.bend) * tuck; arm.hang += (86 - arm.hang) * tuck;
    arm.inward += (rad(24) * (k === 'l' ? -1 : 1) - arm.inward) * tuck; arm.wrist += (rad(85) - arm.wrist) * tuck;
    f.z -= 0.04 * tuck;
  });
  // Standing tall: easing off, the knees straighter and the trunk up, the hands lower.
  if (tall) {
    a.hips += 0.08 * tall;
    a.pelvisPitch -= rad(10) * tall;
    a.lean -= rad(14) * tall;
    a.neck -= rad(4) * tall;
    both(a, (_k, arm) => { arm.swing -= rad(16) * tall; arm.bend -= rad(14) * tall; });
  }
  // Sunk into a landing: the hips down towards the boots and back, the trunk over the knees, the hands forward and out.
  const absorb = c.absorb ?? 0;
  if (absorb) {
    a.hips -= 0.17 * absorb;
    a.hipsZ -= 0.04 * absorb;
    a.lean += rad(12) * absorb;
    a.head -= rad(8) * absorb;
    both(a, (_k, arm) => { arm.hang -= 16 * absorb; arm.swing += rad(14) * absorb; });
  }
  // Its life: breathing in the chest and shoulders, looking about (more running straight and easy, and into a turn), its weight
  // shifting from foot to foot, its hands never quite still; its knees giving to the snow's shape; riding switch, looking back over
  // its shoulder, the chest opened round with the head.
  if (c.life !== undefined) {
    const L = lifeAt(c.life), easy = (1 - tuck) * (1 - brake), straight = 1 - Math.min(1, Math.abs(s));
    a.lean += rad(1.4) * L.breath;
    a.headYaw += (0.55 * L.look * straight + 0.3 * s) * easy;
    a.chestYaw += 0.12 * L.look * straight * easy;
    a.head += rad(4) * Math.sin(L.look * 3) * easy;
    a.hipsX += 0.022 * L.shift * easy; a.pelvisRoll += rad(2.5) * L.shift * easy;
    a.feet.l.up += 0.012 * Math.max(0, -L.shift) * easy; a.feet.r.up += 0.012 * Math.max(0, L.shift) * easy;
    a.arms.l.swing += rad(4) * L.handL * easy; a.arms.r.swing += rad(4) * L.handR * easy;
    a.arms.l.hang += 3 * L.breath; a.arms.r.hang += 3 * L.breath;
  }
  const flex = c.flex ?? 0, back = c.back ?? 0;
  if (flex) { a.hips -= 0.07 * flex; a.lean += rad(4) * flex; both(a, (_k, arm) => { arm.hang -= 6 * Math.max(0, flex); }); }
  if (back) { a.chestYaw += 0.42 * back; a.pelvisYaw += 0.12 * back; a.headYaw += 0.95 * back; a.head -= rad(4) * back; }
  // Pressed onto the tips: up over them, the trunk forward, the arms out ahead for balance, the head up to look ahead. Onto the tails:
  // sat back and low over them, the trunk up, the arms out to the sides.
  const press = c.press ?? 0;
  if (press > 0) {
    a.hipsZ += 0.08 * press; a.lean += rad(16) * press; a.pelvisPitch += rad(10) * press; a.head -= rad(14) * press;
    both(a, (_k, arm, f) => { arm.swing += rad(26) * press; arm.hang -= 26 * press; arm.bend -= rad(14) * press; f.pitch += 0; });
  } else if (press < 0) {
    const q = -press;
    a.hips -= 0.1 * q; a.hipsZ -= 0.12 * q; a.lean -= rad(14) * q; a.pelvisPitch -= rad(12) * q; a.head -= rad(6) * q;
    both(a, (_k, arm) => { arm.hang -= 34 * q; arm.swing += rad(6) * q; });
  }
  // The pop: up out of the crouch, the legs driven long, the arms swung through (up and back for a backflip).
  const pop = c.pop ?? 0;
  if (pop) popUp(a, h0, pop, tall);
  a.spin = c.spin ?? 0;
  a.flip = c.flip ?? 0;
  return a;
}

/** A pose `a` sprung up off a lip by `pop` (0 to 1), from hips `h0` high where they ride; the arms up and back the more it is set to stand `tall`. */
function popUp(a: AlpinePose, h0: number, pop: number, tall: number): void {
  a.hips += (h0 + 0.13 - a.hips) * pop;
  a.hipsZ += (0.02 - a.hipsZ) * pop;
  a.pelvisPitch += (rad(8) - a.pelvisPitch) * pop;
  a.lean += (rad(14) - rad(26) * tall - a.lean) * pop;
  a.head += (rad(-6) - rad(18) * tall - a.head) * pop;
  both(a, (_k, arm, f) => {
    f.up += (0 - f.up) * pop; f.z += (0.08 - f.z) * pop;
    arm.swing += (rad(70) + rad(80) * tall - arm.swing) * pop;
    arm.bend += (rad(25) - arm.bend) * pop;
    arm.hang += (55 - 25 * tall - arm.hang) * pop;
  });
}

/**
 * What a skier is doing in the air off a kicker, as `airPose` takes it: how much tighter it has drawn its tuck (0 to 1); how far it is
 * into a ski jumper's flight (laid out over its skis, which are spread in a V, the arms back along its sides) rather than a tuck; how far
 * it has opened up again to land (0 to 1); how far into the throw that starts a backflip (the arms and head thrown up and back); how
 * close it holds its arms for a spin; its skis' turn from where it faces; and the whole body's turn about the upright and over backwards
 * (radians, as `AlpinePose` has them). The rest are each 0 unless given:
 *
 * - `pop`: how much is left of the spring off the lip (1 as it leaves, gone in a quarter of a second), and `set`, how tall it stood to
 *   spring (1 for a backflip, its arms up and back);
 * - `lead`: how much of the spin is still to come (radians, to the left positive): the shoulders and the head go ahead of the hips by
 *   some of it, and come round to the landing first; `spot`, how far it is looking back for the snow in a flip (0 to 1);
 * - `cork`: how far the spin's axis is tipped off the upright (a cork);
 * - `layout`: a flip laid out straight, the arms out to the sides (0 to 1); `spread`, a spread eagle, the legs and arms flung wide;
 *   `mute`, the left hand reaching across to the right ski in front of the boot, the knees drawn up; `tail`, the right hand reaching
 *   back for the tail of the right ski, drawn up behind;
 * - `reach`: the legs let long to reach for the snow, the last moment before it (0 to 1);
 * - `cross`: the skis crossed, their tips over one another ahead and the tails apart, the knees bent out (an iron cross, as a skier
 *   crosses them going round a flip and a spin together).
 */
export interface AirControls {
  tuck: number; flight: number; open: number; throw: number; wrap: number; ski: number; spin: number; flip: number;
  pop?: number; set?: number; lead?: number; spot?: number; cork?: number; layout?: number; spread?: number; mute?: number; tail?: number; reach?: number; cross?: number;
}

/**
 * A skier in the air, from the straight run's stance at hips `h0` high (asked: "riding them in tucked position causes ski jump
 * animation (but here with poles of course), middle is regular kicker jump, tall standing is a backflip? if there is turning, it can
 * mix in spin?"; and then: "work on making all the trick animations more realistic and transitions to them as well"): sprung off the
 * lip, legs long and arms swung through, and folding from that into the trick over a quarter of a second rather than at once; the
 * kicker's tuck, the knees drawn up and the arms forward and out, deeper the tighter it is drawn; the ski jumper's flight, the legs
 * long and the body laid forward over the skis' V, the poles trailing back from the hands; a flip laid out, a spread eagle, a grab;
 * in a spin, the shoulders and the head ahead of the hips and round to the landing first; in a flip, the head back to look for the snow
 * as it comes round; opened up to land into the straight run's stance, the legs let long to reach for the snow; turned whole by the
 * spin and the flip.
 */
export function airPose(h0: number, c: AirControls): AlpinePose {
  const run = straightPose(h0), pop = c.pop ?? 0, lead = c.lead ?? 0, spot = c.spot ?? 0, layout = c.layout ?? 0, spread = c.spread ?? 0;
  const mute = c.mute ?? 0, tail = c.tail ?? 0, reach = c.reach ?? 0, cross = c.cross ?? 0;
  // The kicker's tuck (as `Ski_Kicker`'s in the air): the knees drawn up, the trunk over them, the arms forward and out.
  const tucked = clonePose(run), knees = 0.28 + 0.16 * c.tuck;
  tucked.hips -= knees * 0.25;
  tucked.lean += rad(4) + rad(10) * c.tuck;
  tucked.head -= rad(6);
  both(tucked, (_k, arm, f) => {
    f.up += knees; f.z += knees * 0.15; f.pitch -= rad(8);
    arm.hang -= 22; arm.swing += rad(16);
    // (In close for a spin: the elbows bent, the fists in by the chest.)
    arm.bend += rad(34) * c.wrap; arm.hang += 12 * c.wrap;
  });
  // The backflip's throw: the arms swung up and back, the chest up out of its lean, the head back.
  if (c.throw) {
    tucked.lean -= rad(28) * c.throw;
    tucked.head -= rad(28) * c.throw;
    both(tucked, (_k, arm, f) => { arm.swing += rad(80) * c.throw; arm.hang -= 30 * c.throw; f.up -= 0.12 * c.throw; });
  }
  // The flight: the legs nearly straight, the trunk in line with them and the whole laid forward, the skis held up level under it and
  // spread at their tips; the arms back along the sides, the hands turned so that the poles trail back from them; the head up.
  const flight = clonePose(run);
  Object.assign(flight, { hips: h0 + 0.16, hipsZ: 0, pelvisPitch: rad(4), lean: rad(6), neck: rad(-8), head: rad(-24), flip: rad(40) });
  both(flight, (k, arm, f) => {
    const sign = k === 'l' ? 1 : -1;
    Object.assign(arm, { swing: rad(-18), bend: rad(10), wrist: rad(-70), hang: 80, inward: 0 });
    Object.assign(f, { x: 0.2 * sign, z: 0.04, up: 0, yaw: rad(11) * sign, pitch: rad(-40), edge: 0 });
  });
  let a = mix(tucked, flight, c.flight);
  // Laid out: straight from the shoulders to the boots, a little arched, the skis together, the arms out to the sides.
  if (layout) {
    const out = clonePose(run);
    Object.assign(out, { hips: h0 + 0.15, hipsZ: 0, pelvisPitch: rad(-6), lean: rad(-10), neck: rad(-4), head: rad(-10) });
    both(out, (k, arm, f) => {
      Object.assign(arm, { swing: rad(20), bend: rad(12), wrist: rad(10), hang: 12, inward: 0 });
      Object.assign(f, { x: 0.1 * (k === 'l' ? 1 : -1), z: 0.02, up: 0, yaw: 0, pitch: rad(-4), edge: 0 });
    });
    a = mix(a, out, layout);
  }
  // A spread eagle: the legs flung out wide either side, the skis' tips up and out, the arms up and out.
  if (spread) {
    const wide = clonePose(a);
    Object.assign(wide, { hips: h0 + 0.08, hipsZ: 0, pelvisPitch: rad(2), lean: rad(4), head: rad(-12) });
    both(wide, (k, arm, f) => {
      const sign = k === 'l' ? 1 : -1;
      Object.assign(arm, { swing: rad(30), bend: rad(8), wrist: rad(10), hang: -12, inward: 0 });
      Object.assign(f, { x: 0.5 * sign, z: 0.12, up: 0.28, yaw: rad(16) * sign, pitch: rad(-14), edge: rad(-30) * sign });
    });
    a = mix(a, wide, spread);
  }
  // Grabs: the ski brought up to the hand rather than the body down to the ski (the hand put on it by `Rider`, `grabsOf`). A mute:
  // the knees drawn up to the chest, the right ski across under the body, the shoulders turned to the right and dropped a little over
  // it. A tail grab: the right knee drawn up and the foot back under the seat, the ski's tail up behind; the shoulders turned and
  // dropped to the right to reach back for it, the left arm out for balance.
  if (mute) {
    a.lean -= rad(10) * mute; a.chestYaw -= rad(20) * mute; a.chestRoll -= rad(10) * mute; a.head -= rad(4) * mute;
    a.feet.l.up += 0.18 * mute; a.feet.r.up += 0.26 * mute; a.feet.r.x += 0.08 * mute; a.feet.r.yaw += rad(12) * mute; a.feet.l.z -= 0.04 * mute;
    a.arms.r.hang -= 24 * mute; a.arms.r.swing += rad(10) * mute;
  }
  if (tail) {
    a.lean -= rad(6) * tail; a.chestYaw -= rad(22) * tail; a.chestRoll -= rad(18) * tail; a.pelvisRoll -= rad(8) * tail;
    a.feet.r.up += 0.3 * tail; a.feet.r.z -= 0.36 * tail; a.feet.r.pitch += rad(18) * tail; a.feet.l.up += 0.1 * tail;
    a.arms.l.hang -= 32 * tail; a.arms.l.swing += rad(20) * tail;
  }
  // Crossed: each ski turned in across the other, the feet drawn in under the body and lifted a little, the knees out.
  if (cross) both(a, (k, _arm, f) => {
    const sign = k === 'l' ? 1 : -1;
    f.yaw -= rad(30) * sign * cross; f.x -= 0.06 * sign * cross; f.up += 0.06 * cross; f.edge += rad(18) * sign * cross;
  });
  // The spring off the lip, folding into the trick as it fades.
  if (pop) {
    const sprung = clonePose(run);
    popUp(sprung, h0, 1, c.set ?? 0);
    a = mix(a, sprung, pop);
  }
  // Opened up to land: into the straight run's stance, the legs let long the last moment to reach for the snow.
  const land = clonePose(run);
  land.hips += 0.07 * reach; land.lean -= rad(4) * reach;
  both(land, (_k, arm, f) => { f.z -= 0.02 * reach; arm.swing += rad(10) * reach; arm.hang -= 8 * reach; });
  a = mix(a, land, c.open);
  // Round a spin, the shoulders ahead of the hips and the head ahead of the shoulders, by as much as is left to come (as a skier
  // leads a spin with them and looks round for the landing before the skis come round to it); in a flip, the head back towards the
  // snow as it comes round to it.
  const ahead = Math.max(-1, Math.min(1, lead)), held = 1 - c.open;
  a.pelvisYaw -= 0.22 * ahead * held;
  a.chestYaw += 0.3 * ahead * held;
  a.headYaw += 0.55 * ahead * held;
  a.head -= rad(26) * spot * held; a.neck -= rad(12) * spot * held;
  both(a, (_k, _arm, f) => { f.yaw += c.ski; });
  a.spin = c.spin;
  a.flip += c.flip;
  a.cork = c.cork ?? 0;
  return a;
}

/**
 * Where each hand reaches in a grab (`AirControls`' `mute` and `tail`), and how far into it: a point on a ski, given by the side of
 * the ski, how far ahead of the ball of the foot along it and how far out from its middle to the side.
 */
export function grabsOf(c: AirControls): { hand: Side; ski: Side; along: number; out: number; w: number; elbow: [number, number, number] }[] {
  const out = [], fade = 1 - c.open;
  if ((c.mute ?? 0) * fade > 0.01) out.push({ hand: 'l' as Side, ski: 'r' as Side, along: 0.18, out: -0.05, w: (c.mute ?? 0) * fade, elbow: [0.7, 0.1, 0.5] as [number, number, number] });
  if ((c.tail ?? 0) * fade > 0.01) out.push({ hand: 'r' as Side, ski: 'r' as Side, along: -0.6, out: -0.04, w: (c.tail ?? 0) * fade, elbow: [-0.8, 0.2, -0.3] as [number, number, number] });
  return out;
}

/**
 * A skier posed live, moment by moment (the slope page's rider when it is ridden): its own copy of the mannequin, which is what is
 * shown, and the height its hips are held at in the turns.
 */
export class Rider {
  private readonly P: Poser;
  readonly h0: number;
  /** Each foot's turn as the skeleton rests, which a ski hung on it is laid out from. */
  private readonly footRest: Record<Side, Quaternion>;
  constructor(source: Object3D, base: AnimationClip) {
    this.P = new Poser(source, base);
    this.h0 = turnsHeight(this.P);
    this.P.begin();
    this.P.update();
    this.footRest = { l: this.P.bone('foot_l').getWorldQuaternion(new Quaternion()), r: this.P.bone('foot_r').getWorldQuaternion(new Quaternion()) };
  }
  get model(): Object3D { return this.P.model; }
  /**
   * Puts it in the pose of what it is doing. Gives back how far its legs were stretched. (Posed as it stands alone: the poser reckons
   * in the figure's own frame, which is the world's only while it stands in nothing, so it is taken out of what holds it meanwhile.)
   */
  pose(c: RideControls): number { return this.alone(() => poseAlpine(this.P, riderPose(this.h0, c))); }
  /** In any pose (a rider on a horse's back, `saddlePose`). */
  posePose(a: AlpinePose): number { return this.alone(() => poseAlpine(this.P, a)); }
  /** In the air, as `airPose` has it; a hand put on its ski for a grab. */
  poseAir(c: AirControls): number {
    return this.alone(() => {
      const stretch = poseAlpine(this.P, airPose(this.h0, c));
      for (const g of grabsOf(c)) this.grab(g.hand, g.ski, g.along, g.out, g.w, new Vector3(...g.elbow));
      return stretch;
    });
  }
  /**
   * A hand `w` of the way from where the pose put it to a point on a ski (`along` it ahead of the ball of the foot, `out` to its
   * left): the ski is fast to the foot, so the point is the ball's, turned and carried as the foot has been.
   */
  private grab(hand: Side, ski: Side, along: number, out: number, w: number, elbow: Vector3): void {
    const P = this.P, foot = P.bone(`foot_${ski}`), turn = foot.getWorldQuaternion(new Quaternion()).multiply(this.footRest[ski].clone().invert());
    const onSki = P.restOf(`ball_${ski}`).add(new Vector3(out, -0.03, along)).sub(P.restOf(`foot_${ski}`)).applyQuaternion(turn).add(P.at(`foot_${ski}`));
    const now = P.at(`hand_${hand}`);
    P.reachArm(hand, now.lerp(onSki, w), elbow.normalize());
  }
  /**
   * Gone limp: its skeleton put through joints placed in the frame of what holds it (`Poser.poseJoints`), as a ragdoll has them
   * (`ragdoll.ts`).
   */
  poseJoints(p: Record<string, Vector3>): void { this.alone(() => this.P.poseJoints(p)); }
  private alone<T>(f: () => T): T {
    const holder = this.P.model.parent;
    holder?.remove(this.P.model);
    this.P.model.updateMatrixWorld(true);
    const out = f();
    holder?.add(this.P.model);
    return out;
  }
}
