/**
 * On foot, the skis off (`slopeDungeon.ts`: in the camp before the cave, and inside it): the person walking and jogging by the packs'
 * clips, and the horse walking and trotting on its bare hooves, a gait made here.
 */
import { type AnimationAction, AnimationMixer, type Object3D } from 'three';
import { HOOF_REST, type HorseLeg, type HorsePose, mixHorse, restHorsePose } from '../src/figures/horse';
import type { Move } from '../src/figures/library';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * A person on foot: standing, walking and jogging, by the packs' clips, each played as fast as the person goes, one passing into the
 * next as it goes faster; walking backwards, the walk played backwards.
 */
export class Walker {
  private readonly mixer: AnimationMixer;
  private readonly idle: AnimationAction;
  private readonly walk: AnimationAction;
  private readonly jog: AnimationAction;
  /** How fast the walk and the jog go as they were made (metres a second), for this body. */
  readonly walkSpeed: number;
  readonly jogSpeed: number;
  constructor(readonly model: Object3D, moves: Map<string, Move>, scale: number) {
    this.mixer = new AnimationMixer(model);
    const play = (name: string) => { const a = this.mixer.clipAction(moves.get(name)!.clip); a.play(); a.setEffectiveWeight(0); return a; };
    this.idle = play('Idle_Loop'); this.walk = play('Walk_Loop'); this.jog = play('Jog_Fwd_Loop');
    // (The packs' walk and jog are made in place, the root's travel taken out: their pace is the packs', for the mannequin's height.)
    this.walkSpeed = 1.35 * scale; this.jogSpeed = 3.1 * scale;
    this.idle.setEffectiveWeight(1);
  }
  /** A moment on (`dt`), going `speed` metres a second (less than nothing, backwards). */
  update(dt: number, speed: number): void {
    const s = Math.abs(speed), moving = smooth(s / 0.35), running = smooth((s - this.walkSpeed) / (this.jogSpeed - this.walkSpeed));
    this.idle.setEffectiveWeight(1 - moving);
    this.walk.setEffectiveWeight(moving * (1 - running));
    this.jog.setEffectiveWeight(moving * running);
    this.walk.setEffectiveTimeScale(Math.sign(speed || 1) * clamp(s / this.walkSpeed, 0.45, 1.8));
    this.jog.setEffectiveTimeScale(clamp(s / this.jogSpeed, 0.6, 1.5));
    this.mixer.update(dt);
  }
}

/** The horse's walk, a hoof at a time (the left hind, the left fore, the right hind, the right fore, each a quarter of a stride on), and its trot, the diagonals together. */
const WALK: Record<HorseLeg, number> = { h_l: 0, f_l: 0.25, h_r: 0.5, f_r: 0.75 };
const TROT: Record<HorseLeg, number> = { f_l: 0, h_r: 0, f_r: 0.5, h_l: 0.5 };
/** Above this, it trots. */
const TROTS = 2.1;

/** How many strides the horse takes a second at `speed` (metres a second): a walk's, near one; a trot's, quicker. */
export const horseCadence = (speed: number) => (Math.abs(speed) < TROTS ? 0.75 + 0.18 * Math.abs(speed) : 1.35);

/**
 * The horse on its bare hooves at `phase` (0 to 1) of a stride, going `speed` metres a second: each hoof on the ground for most of the
 * stride, carried back under the body as the body goes over it, then lifted, folded and swung forward; the body rising and falling a
 * little with the steps, the head nodding with the fore feet at the walk; the tail swinging; turning (`turn`, to its left), its neck
 * turned that way. Standing still, square.
 */
export function horseWalk(phase: number, speed: number, turn: number, life: number): HorsePose {
  const s = Math.abs(speed), dir = Math.sign(speed || 1), freq = horseCadence(speed), stride = s / freq;
  const gait = (offsets: Record<HorseLeg, number>, duty: number, lift: number, bob: number, nod: number): HorsePose => {
    const a = restHorsePose(), on = clamp(stride / 0.9, 0, 1);
    a.hooves = { ...HOOF_REST };
    for (const leg of Object.keys(offsets) as HorseLeg[]) {
      const q = (((phase - offsets[leg]) % 1) + 1) % 1, rest = HOOF_REST[leg], fore = leg[0] === 'f';
      let z: number, y = 0, pitch = 0;
      if (q < duty) z = rest.z + dir * stride * (0.5 - q / duty);
      else {
        const w = (q - duty) / (1 - duty);
        z = rest.z + dir * stride * (-0.5 + smooth(w));
        y = lift * (fore ? 1 : 0.8) * Math.sin(Math.PI * w) * on;
        pitch = (fore ? 0.95 : 0.6) * Math.sin(Math.PI * Math.min(1, w * 1.15)) * on;
      }
      a.hooves[leg] = { x: rest.x, y, z, pitch };
    }
    a.height = -0.02 - bob * on * (0.5 + 0.5 * Math.cos(4 * Math.PI * phase));
    a.neck = rad(6) + nod * on * Math.sin(4 * Math.PI * phase + 1.2);
    a.head = rad(4) - 0.5 * nod * on * Math.sin(4 * Math.PI * phase + 1.2);
    return a;
  };
  const walk = gait(WALK, 0.64, 0.17, 0.025, rad(4));
  const pose = s > TROTS - 0.3 ? mixHorse(walk, gait(TROT, 0.45, 0.24, 0.06, rad(1.5)), smooth((s - (TROTS - 0.3)) / 0.3)) : walk;
  pose.neckYaw = clamp(turn, -1, 1) * 0.35;
  pose.roll = -clamp(turn, -1, 1) * rad(3) * smooth(s / 1.5);
  pose.ears = 0.15 + 0.2 * Math.sin(life * 0.9) ** 2;
  pose.tail = 0.18 + 0.05 * Math.sin(life * 2.1);
  pose.tailYaw = 0.25 * Math.sin(life * 1.7) + 0.1 * Math.sin(life * 4.3);
  return pose;
}
