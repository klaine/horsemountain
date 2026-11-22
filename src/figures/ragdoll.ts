import { Vector3 } from 'three';

/**
 * A body gone limp (asked: "landing badly activates ragdoll physics"): the joints of a figure as loose points, each with its weight,
 * held at the lengths its bones had when it fell by links between them, falling under its weight onto the ground, sliding and
 * tumbling on it until the snow's friction stops it. Stepped by positions (each step moves every point as it was going, then puts the
 * links back to their lengths and the points out of the ground, a few times over, and takes how far each went as its new speed), which
 * keeps steady at any step and with any number of links. What it is drawn with is the figure's own skeleton, put through the points
 * (`Poser.poseJoints`).
 *
 * What a body is made of is given with it (`BodySpec`): a person's (`HUMAN`, `humanSpec`), whose trunk is held nearly stiff by links
 * across it (hips to shoulders, shoulder to shoulder, the head to both shoulders), though it may bend a little, whose arms and legs bend
 * freely at elbows and knees, if never folded quite flat, and each of whose feet is held fast in its boot with its ski (ankle, ball,
 * knee and the ski's tip and tail one stiff piece, so that a ski lies on the snow as a ski does); or a horse's (`horseSpec` in
 * `horse.ts`).
 */

/**
 * What a body gone limp is made of: its points, by name (the first its middle, which a view follows); how far each stands off the
 * ground at the least; and the links that hold them, each at the length it has as the body falls unless given, some stiff, some
 * softer (`stiff` under 1), and some only keeping two points from coming nearer than `least`.
 */
export interface BodySpec {
  joints: readonly string[];
  radius(j: string): number;
  links(link: (a: string, b: string, o?: { stiff?: number; least?: number }) => void, at: (j: string) => Vector3): void;
}

/** A person's joints, by the names of their bones; and the ski's tip and tail on each foot. */
export const JOINTS = [
  'pelvis', 'spine_03', 'Head',
  'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r',
  'tip_l', 'tail_l', 'tip_r', 'tail_r',
] as const;
export type Joint = (typeof JOINTS)[number];

/** A person gone limp, with skis on or none (a rider thrown from a horse): the head and the hips round, the rest thinner. */
export const humanSpec = (skis: boolean): BodySpec => ({
  joints: skis ? JOINTS : JOINTS.filter((j) => !j.startsWith('tip') && !j.startsWith('tail')),
  radius: (j) => ({ Head: 0.11, pelvis: 0.11, spine_03: 0.12, thigh_l: 0.09, thigh_r: 0.09 } as Record<string, number>)[j] ?? (j.startsWith('tip') || j.startsWith('tail') ? 0.02 : 0.06),
  links(link, at) {
    // The trunk: the spine and the neck, and braced across.
    link('pelvis', 'spine_03'); link('spine_03', 'Head');
    link('upperarm_l', 'upperarm_r'); link('thigh_l', 'thigh_r');
    for (const k of ['l', 'r'] as const) {
      link('spine_03', `upperarm_${k}`); link('pelvis', `thigh_${k}`);
      link('Head', `upperarm_${k}`, { stiff: 0.6 }); link('pelvis', `upperarm_${k}`, { stiff: 0.5 }); link('spine_03', `thigh_${k}`, { stiff: 0.5 });
    }
    link('upperarm_l', 'thigh_r', { stiff: 0.3 }); link('upperarm_r', 'thigh_l', { stiff: 0.3 });
    const d = (a: string, b: string) => at(a).distanceTo(at(b));
    for (const k of ['l', 'r'] as const) {
      // The limbs, and how near their ends may come (never folded flat).
      link(`upperarm_${k}`, `lowerarm_${k}`); link(`lowerarm_${k}`, `hand_${k}`);
      link(`thigh_${k}`, `calf_${k}`); link(`calf_${k}`, `foot_${k}`);
      link(`upperarm_${k}`, `hand_${k}`, { least: (d(`upperarm_${k}`, `lowerarm_${k}`) + d(`lowerarm_${k}`, `hand_${k}`)) * 0.35 });
      link(`thigh_${k}`, `foot_${k}`, { least: (d(`thigh_${k}`, `calf_${k}`) + d(`calf_${k}`, `foot_${k}`)) * 0.4 });
      // The boot and its ski, one stiff piece with the shin.
      const boot = [`calf_${k}`, `foot_${k}`, `ball_${k}`, ...(skis ? [`tip_${k}`, `tail_${k}`] : [])];
      for (let a = 0; a < boot.length; a++) for (let b = a + 1; b < boot.length; b++) if (!(a === 0 && b === 1)) link(boot[a], boot[b]);
    }
  },
});
export const HUMAN = humanSpec(true);

interface Link { a: number; b: number; length: number; stiff: number; least: boolean }

/** What the ground is under a point: how far the point is above it (negative, in it) and which way is up from it. */
export type Ground = (p: Vector3) => { above: number; up: Vector3 };

export class Ragdoll {
  readonly points: Vector3[];
  private readonly speeds: Vector3[];
  private readonly links: Link[] = [];
  private readonly radii: number[];
  private stillFor = 0;
  /** How long it has been nearly still; and how long since it fell. */
  get still(): number { return this.stillFor; }
  time = 0;

  /**
   * A body of `spec`'s making, from where its points are now and where they were `dt` seconds before (so that it goes on as it was
   * going, turning as it was turning). `friction`: of the body on the ground, against its weight.
   */
  constructor(readonly spec: BodySpec, now: Record<string, Vector3>, before: Record<string, Vector3>, dt: number, private readonly ground: Ground, private readonly friction = 0.55) {
    const names = spec.joints;
    this.points = names.map((j) => now[j].clone());
    this.speeds = names.map((j) => now[j].clone().sub(before[j]).divideScalar(dt));
    this.radii = names.map((j) => spec.radius(j));
    // (Whatever of it is in the ground as it falls, a ski's tip dug in or a hand, the whole lifted out of it first: pushed out point by
    // point in one step, the rest of it was yanked up after them and thrown high into the air.)
    let deepest = 0, up = new Vector3(0, 1, 0);
    this.points.forEach((p, n) => { const g0 = ground(p), into = this.radii[n] - g0.above; if (into > deepest) { deepest = into; up = g0.up; } });
    if (deepest > 0) for (const p of this.points) p.addScaledVector(up, deepest);
    const i = (j: string) => { const n = names.indexOf(j); if (n < 0) throw new Error(`a body without ${j}`); return n; };
    spec.links((a, b, o = {}) => {
      const length = o.least ?? this.points[i(a)].distanceTo(this.points[i(b)]);
      this.links.push({ a: i(a), b: i(b), length, stiff: o.stiff ?? 1, least: o.least !== undefined });
    }, (j) => this.points[i(j)]);
  }

  /** Where joint `j` is now. */
  at(j: string): Vector3 { return this.points[this.spec.joints.indexOf(j)]; }
  /** Every joint, by name. */
  joints(): Record<string, Vector3> { return Object.fromEntries(this.spec.joints.map((j, n) => [j, this.points[n]])); }
  /** The middle of the body (its first point: the hips). */
  middle(): Vector3 { return this.points[0]; }
  /** How fast its quickest point is going. */
  quickest(): number { return Math.max(...this.speeds.map((v) => v.length())); }

  /** Moves it on by `dt` seconds: its weight, the air, the links, the ground and the ground's friction. */
  step(dt: number, g = 9.81): void {
    const was = this.points.map((p) => p.clone());
    for (let n = 0; n < this.points.length; n++) {
      const v = this.speeds[n];
      v.y -= g * dt;
      v.multiplyScalar(1 - 0.03 * dt);
      this.points[n].addScaledVector(v, dt);
    }
    const d = new Vector3();
    const pushed = new Float32Array(this.points.length);
    for (let pass = 0; pass < 10; pass++) {
      for (const l of this.links) {
        const a = this.points[l.a], b = this.points[l.b];
        d.copy(b).sub(a);
        const len = d.length();
        if (len < 1e-9 || (l.least && len >= l.length)) continue;
        d.multiplyScalar(((len - l.length) / len) * 0.5 * l.stiff);
        a.add(d); b.sub(d);
      }
      this.points.forEach((_, n) => {
        const g0 = this.ground(this.points[n]), into = this.radii[n] - g0.above;
        if (into > 0) { this.points[n].addScaledVector(g0.up, into); pushed[n] += into; }
      });
    }
    // The new speeds, from how far each point went; and where the ground pushed a point out, nothing of that push kept as a speed
    // away from the ground, and its speed along the ground slowed by friction, as hard as it was pushed (its weight, and any blow).
    const along = new Vector3();
    for (let n = 0; n < this.points.length; n++) {
      const v = this.speeds[n].copy(this.points[n]).sub(was[n]).divideScalar(dt);
      if (!pushed[n]) continue;
      const up = this.ground(this.points[n]).up, out = v.dot(up), blow = pushed[n] / dt;
      if (out > 0) v.addScaledVector(up, -Math.min(out, blow));
      along.copy(v).addScaledVector(up, -v.dot(up));
      const sliding = along.length();
      if (sliding > 1e-6) v.addScaledVector(along, -Math.min(1, (this.friction * blow) / sliding));
    }
    this.time += dt;
    this.stillFor = this.quickest() < 0.25 ? this.stillFor + dt : 0;
  }
}
