/**
 * The arms a rider takes up against the orcs, one after another as it brings them down (asked: "can we make a weapon progression
 * here: starting with the sword (currently on back) you can swing and slay or ride over enemies: 10 more killed, you get a pistol;
 * pistol doesnt have automatic fire, you click per shot; 15 more killed you get a shotgun; 20 more killed you get a flamethrower; 25
 * more killed you get the submachinegun; 30 more killed you get a lightning gun that shoots lightning that jumps from enemies to
 * nearby ones"; "the progression stays within the current session over repeated runs"; and, "one more tier after lightning gun: a
 * bazooka that fires missiles which cause similar explosions but in a smaller scale as the explosion transition and have area of
 * effect"): what each is and how it is used (`LADDER`), each made here in code as the tommy gun is (`slopeGun.ts`), laid along +z from
 * where the right fist holds it; and what they throw, which a round's tracer is not: the flamethrower's fire (`Flames`), the lightning
 * gun's bolts (`Bolts`), the bazooka's rockets (`Rockets`; where they strike, the run's end's explosion made small, `slopeBlast.ts`),
 * and the sword's sweep as it cuts (`Sweep`). The page holds them, aims them and fires them (`slope.ts`).
 */
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group,
  InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, type Scene, SphereGeometry, TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, texture, uniform, uv, vec3 } from 'three/tsl';
import type { Rng } from '../src/core/rng';
import type { Stance } from '../src/figures/alpine';
import { FORE_GRIP, MUZZLE, tommyGun } from './slopeGun';

/** How an arm is used: swung; fired a round at a time, a click each; fired while held, round after round; a stream; a bolt. */
export type Firing = 'swing' | 'single' | 'auto' | 'stream' | 'bolt';
export type ArmKind = 'sword' | 'pistol' | 'shotgun' | 'flamer' | 'smg' | 'lightning' | 'bazooka';
export interface Arm {
  kind: ArmKind; name: string;
  /** How many more orcs brought down after the last arm was taken up, before this one is. */
  after: number;
  /** How it is used; seconds between rounds (or swings, or bolts); what is said of it when it is taken up. */
  firing: Firing; every: number; hint: string;
  /** Where its muzzle (or its blade's tip) is, and how far along it the left hand holds it. */
  muzzle: Vector3; fore: number;
  /** How far it kicks up as it fires (the tommy gun's, 1). */
  kick: number;
  /** Held out at arm's length, as a pistol is aimed (`Rider.point`); else held as `stance` says (`Rider.hold`; at the hip, if it says nothing). */
  out?: boolean;
  stance?: Stance;
  make: () => Group;
}

const smooth01 = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
/** The bore's height over the grip, for the guns made here; the bazooka's tube's, which lies on the shoulder. */
const BORE = 0.065, TUBE = 0.12;
export const LADDER: Arm[] = [
  { kind: 'sword', name: 'Sword', after: 0, firing: 'swing', every: 1.5, hint: 'click or tap to cut at either side; hold to raise it and let go to cut harder; or ride them down', muzzle: new Vector3(0, 0, 1.12), fore: -0.13, kick: 0, make: () => sword() },
  { kind: 'pistol', name: 'Pistol', after: 10, firing: 'single', every: 0.16, hint: 'a click a shot', muzzle: new Vector3(0, BORE, 0.19), fore: 0.03, kick: 0.7, out: true, make: () => pistol() },
  { kind: 'shotgun', name: 'Shotgun', after: 15, firing: 'single', every: 0.75, hint: 'a click a blast, a spread of shot', muzzle: new Vector3(0, BORE, 0.78), fore: 0.36, kick: 1.8, stance: 'shoulder', make: () => shotgun() },
  { kind: 'flamer', name: 'Flamethrower', after: 20, firing: 'stream', every: 1 / 30, hint: 'hold to pour fire on them', muzzle: new Vector3(0, BORE, 0.66), fore: 0.32, kick: 0.35, make: () => flamer() },
  { kind: 'smg', name: 'Tommy gun', after: 25, firing: 'auto', every: 60 / 700, hint: 'hold to fire', muzzle: MUZZLE, fore: FORE_GRIP, kick: 1, stance: 'shoulder', make: () => tommyGun() },
  { kind: 'lightning', name: 'Lightning gun', after: 30, firing: 'bolt', every: 0.45, hint: 'hold to throw lightning, which leaps from orc to orc', muzzle: new Vector3(0, BORE + 0.01, 0.6), fore: 0.3, kick: 0.4, stance: 'shoulder', make: () => lightningGun() },
  { kind: 'bazooka', name: 'Bazooka', after: 35, firing: 'single', every: 1.1, hint: 'a click a rocket, which blows up all about where it strikes', muzzle: new Vector3(0, TUBE, 0.66), fore: 0.34, kick: 2.6, stance: 'tube', make: () => bazooka() },
];
/** The arm carried after `slain` orcs brought down; and the next, and how many more it wants. */
export function armAfter(slain: number): { arm: Arm; next: Arm | null; left: number } {
  let at = 0, i = 0;
  for (let k = 1; k < LADDER.length; k++) { if (slain >= at + LADDER[k].after) { at += LADDER[k].after; i = k; } else break; }
  const next = LADDER[i + 1] ?? null;
  return { arm: LADDER[i], next, left: next ? at + next.after - slain : 0 };
}

const steelPaint = () => new MeshStandardMaterial({ color: 0x24262b, roughness: 0.38, metalness: 0.8 });
const woodPaint = () => new MeshStandardMaterial({ color: 0x5c3317, roughness: 0.55 });
/** A group of parts, each made of the pieces given it, merged, in its own paint. */
function assemble(name: string, parts: [BufferGeometry[], MeshStandardMaterial][]): Group {
  const g = new Group();
  for (const [gs, m] of parts) {
    if (!gs.length) continue;
    const mesh = new Mesh(mergeGeometries(gs.map((x) => { x.deleteAttribute('uv'); return x; })), m);
    mesh.castShadow = true;
    g.add(mesh);
  }
  g.name = name;
  return g;
}
const box = (into: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) => into.push(new BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z));
const tube = (into: BufferGeometry[], r: number, from: number, to: number, y: number, sides = 10) => into.push(new CylinderGeometry(r, r, to - from, sides).rotateX(Math.PI / 2).translate(0, y, (from + to) / 2));

/**
 * A long sword for both hands, as the one on the skier's back (asked: "make the sword a bit thicker and longer and slower to swing"):
 * the grip in the fist, the cross guard just ahead of it, the blade on along +z.
 */
function sword(): Group {
  const steel: BufferGeometry[] = [], grip: BufferGeometry[] = [];
  // (A blade of a metre and more, broad and thick at the guard, narrowing to its point; a broad cross guard; the grip back from it,
  // long enough for both hands, and a heavy round pommel.)
  const blade = new CylinderGeometry(0.008, 0.036, 1.06, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.34).rotateX(Math.PI / 2).translate(0, 0, 0.6);
  steel.push(blade);
  box(steel, 0.27, 0.028, 0.032, 0, 0, 0.055);
  steel.push(new SphereGeometry(0.03, 12, 9).translate(0, 0, -0.23));
  tube(grip, 0.018, -0.21, 0.045, 0);
  return assemble('sword', [[steel, new MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.25, metalness: 0.9 })], [grip, new MeshStandardMaterial({ color: 0x24190f, roughness: 0.8 })]]);
}

/** A self-loading pistol: its slide over the grip, the grip raked back, the muzzle a hand's breadth ahead. */
function pistol(): Group {
  const steel: BufferGeometry[] = [], grip: BufferGeometry[] = [];
  box(steel, 0.03, 0.034, 0.2, 0, BORE, 0.08);
  box(steel, 0.008, 0.012, 0.05, 0, -0.005, 0.03);
  box(grip, 0.028, 0.11, 0.04, 0, -0.01, -0.01, 0.28);
  return assemble('pistol', [[steel, steelPaint()], [grip, new MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.6 })]]);
}

/** A pump shotgun: a long barrel over its magazine tube, the wooden pump under them, a wooden stock back from the grip. */
function shotgun(): Group {
  const steel: BufferGeometry[] = [], wood: BufferGeometry[] = [];
  box(steel, 0.044, 0.06, 0.22, 0, BORE - 0.004, 0.04);
  tube(steel, 0.013, 0.14, 0.78, BORE + 0.012);
  tube(steel, 0.011, 0.14, 0.66, BORE - 0.016);
  tube(wood, 0.022, 0.3, 0.46, BORE - 0.016, 12);
  box(wood, 0.04, 0.075, 0.32, 0, BORE - 0.05, -0.24, -0.14);
  box(wood, 0.034, 0.1, 0.04, 0, -0.012, -0.012, 0.26);
  return assemble('shotgun', [[steel, steelPaint()], [wood, woodPaint()]]);
}

/** A flamethrower: its tube from the grip to the nozzle, a shroud about the nozzle, a fuel tank slung under it, a pilot flame at its mouth. */
function flamer(): Group {
  const steel: BufferGeometry[] = [], tank: BufferGeometry[] = [], brass: BufferGeometry[] = [];
  box(steel, 0.05, 0.07, 0.24, 0, BORE - 0.005, 0.04);
  tube(steel, 0.016, 0.16, 0.6, BORE);
  tube(steel, 0.03, 0.5, 0.66, BORE, 12);
  tank.push(new CylinderGeometry(0.06, 0.06, 0.3, 16).rotateX(Math.PI / 2).translate(0, BORE - 0.1, 0.22));
  for (const z of [0.1, 0.34]) brass.push(new TorusGeometry(0.061, 0.006, 6, 18).translate(0, BORE - 0.1, z));
  box(steel, 0.034, 0.1, 0.04, 0, -0.012, -0.012, 0.26);
  const g = assemble('flamethrower', [[steel, steelPaint()], [tank, new MeshStandardMaterial({ color: 0x6b2a1a, roughness: 0.5, metalness: 0.3 })], [brass, new MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.35, metalness: 0.8 })]]);
  const pilot = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  pilot.colorNode = vec3(0.5, 0.7, 1.4);
  const flame = new Mesh(new SphereGeometry(0.012, 8, 6).scale(1, 1, 1.8).translate(0, BORE, 0.675), pilot);
  g.add(flame);
  return g;
}

/** A lightning gun, of no make anyone knows: copper coils wound along its barrel, a glass globe at its mouth glowing blue. */
function lightningGun(): Group {
  const steel: BufferGeometry[] = [], copper: BufferGeometry[] = [];
  box(steel, 0.05, 0.07, 0.22, 0, BORE - 0.004, 0.03);
  tube(steel, 0.012, 0.14, 0.56, BORE + 0.01);
  for (let k = 0; k < 9; k++) copper.push(new TorusGeometry(0.03, 0.007, 6, 16).translate(0, BORE + 0.01, 0.18 + k * 0.042));
  box(steel, 0.034, 0.1, 0.04, 0, -0.012, -0.012, 0.26);
  box(steel, 0.04, 0.075, 0.26, 0, BORE - 0.05, -0.2, -0.14);
  const g = assemble('lightning gun', [[steel, steelPaint()], [copper, new MeshStandardMaterial({ color: 0xb8643a, roughness: 0.3, metalness: 0.9 })]]);
  const glow = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  glow.colorNode = vec3(0.45, 0.7, 1.6);
  g.add(new Mesh(new SphereGeometry(0.034, 14, 10).translate(0, BORE + 0.01, 0.6), glow));
  return g;
}

/**
 * A bazooka: a long tube laid on the shoulder, flared at its back, a sight on it, a grip and a trigger grip under it, and a rocket's
 * nose showing in its mouth.
 */
function bazooka(): Group {
  const drab: BufferGeometry[] = [], steel: BufferGeometry[] = [], warhead: BufferGeometry[] = [];
  drab.push(new CylinderGeometry(0.048, 0.048, 1.18, 16, 1, true).rotateX(Math.PI / 2).translate(0, TUBE, 0.06));
  drab.push(new CylinderGeometry(0.062, 0.048, 0.14, 16, 1, true).rotateX(Math.PI / 2).translate(0, TUBE, -0.6));
  for (const z of [-0.28, 0.1, 0.52]) steel.push(new TorusGeometry(0.05, 0.007, 6, 18).translate(0, TUBE, z));
  box(steel, 0.03, 0.1, 0.05, 0, 0.03, 0);
  box(steel, 0.03, 0.1, 0.045, 0, 0.03, 0.34);
  box(steel, 0.012, 0.05, 0.02, 0.035, TUBE + 0.06, 0.4);
  box(drab, 0.07, 0.05, 0.16, 0, TUBE - 0.06, -0.2);
  warhead.push(new ConeGeometry(0.04, 0.12, 12).rotateX(Math.PI / 2).translate(0, TUBE, 0.7));
  return assemble('bazooka', [[drab, new MeshStandardMaterial({ color: 0x4a5236, roughness: 0.7, metalness: 0.25, side: DoubleSide })], [steel, steelPaint()], [warhead, new MeshStandardMaterial({ color: 0x6d6a52, roughness: 0.5, metalness: 0.5 })]]);
}

/** A soft round spot of light, brightest at its middle, painted once: what fire and lightning are drawn with. */
function spot(inner: string, mid: string, outer: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, mid); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** Fire as it burns: white-hot as it leaves the nozzle, orange, a dull red as it burns out; the smoke it leaves, black, greying as it rises. */
const WHITE_HOT = new Color(5, 3.6, 1.6), ORANGE = new Color(3, 1, 0.18), DULL = new Color(0.8, 0.16, 0.03);
const SOOTY = new Color(0.08, 0.07, 0.065), GREY = new Color(0.36, 0.35, 0.34);
/** A rocket's smoke, pale grey, and paler as it spreads. */
const PALE = new Color(0.55, 0.55, 0.57), PALER = new Color(0.74, 0.74, 0.76);

/** A soft blot of white, faintly lumpy, painted once: a puff of fire or of smoke seen anywhere. */
function lump(rng: Rng): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const blot = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  };
  blot(32, 32, 31, 0.6);
  for (let i = 0; i < 7; i++) blot(32 + rng.range(-11, 11), 32 + rng.range(-11, 11), rng.range(7, 15), rng.range(0.15, 0.3));
  return new CanvasTexture(c);
}

/**
 * A tongue of fire, or a puff of smoke: where it is, which way and how fast it goes, how old it is and how long it lasts, how large it
 * is as it begins and how much it swells, how it is turned; whether it was thrown from the nozzle, and whether it has come down on
 * the snow; and, of smoke, whether it is a rocket's, pale.
 */
interface Lick { p: Vector3; v: Vector3; age: number; life: number; size: number; grow: number; roll: number; jet: boolean; down: boolean; pale?: boolean }
/** Fire left burning on the snow: where, how long it has burnt and will, how far across, and how far to its next tongue. */
interface Pool { p: Vector3; age: number; life: number; r: number; due: number }

/**
 * The flamethrower's fire, and fire where an orc burns (asked, of the flamethrower: "a bit more impressive, more pressure and more
 * devastating looking flame"). From the nozzle a jet of burning fuel thrown hard and narrow, white-hot, arcing down as it goes as a
 * liquid does; breaking up and swelling into rolling orange fire as it slows, and rising as it burns; dying into black smoke. Where it
 * comes down on the snow it splashes and runs on along it, and leaves fire burning there a few seconds (`pools`), as round an orc that
 * burns. Laid over the picture, not added to it: added, over snow lit by the sun, fire was white, not fire.
 */
export class Flames {
  private readonly licks: Lick[] = [];
  private readonly soot: Lick[] = [];
  /** Fire burning on the snow, for the page to burn what walks into it. */
  readonly pools: Pool[] = [];
  private readonly fire: InstancedMesh;
  private readonly fireLook: InstancedBufferAttribute;
  private readonly smoke: InstancedMesh;
  private readonly smokeLook: InstancedBufferAttribute;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly turn = new Quaternion();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private static readonly POOLS = 26;
  constructor(scene: Scene, private readonly rng: Rng, private readonly ground: (x: number, z: number) => number = () => -Infinity, private readonly most = 1100, private readonly mostSoot = 480) {
    const tex = lump(rng.fork('lump'));
    const puffs = (n: number, order: number): [InstancedMesh, InstancedBufferAttribute] => {
      const shape = new PlaneGeometry(1, 1), look = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
      shape.setAttribute('aLook', look);
      const paint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
      const l = attribute('aLook', 'vec4');
      paint.colorNode = l.xyz;
      paint.opacityNode = texture(tex, uv()).a.mul(l.w);
      const mesh = new InstancedMesh(shape, paint, n);
      mesh.frustumCulled = false; mesh.renderOrder = order; mesh.count = 0;
      scene.add(mesh);
      return [mesh, look];
    };
    // (The fire over the smoke it rises out of.)
    [this.smoke, this.smokeLook] = puffs(mostSoot, 3);
    [this.fire, this.fireLook] = puffs(most, 4);
  }
  /** `n` tongues thrown from `from` along `dir` at `speed` (metres a second), spread by `spread` (radians, about): the jet. */
  pour(from: Vector3, dir: Vector3, n: number, speed = 36, spread = 0.035): void {
    for (let i = 0; i < n; i++) {
      if (this.licks.length >= this.most) return;
      const v = dir.clone().add(new Vector3(this.rng.range(-spread, spread), this.rng.range(-spread, spread), this.rng.range(-spread, spread))).normalize().multiplyScalar(speed * this.rng.range(0.9, 1.05));
      // (Laid out along what the jet went in the step they were thrown in, not all at its mouth: a stream, not beads.)
      this.licks.push({ p: from.clone().addScaledVector(v, this.rng.range(0, 1 / 120)), v, age: 0, life: this.rng.range(0.55, 0.8), size: this.rng.range(0.16, 0.26), grow: this.rng.range(5, 7.5), roll: this.rng.range(0, 6.3), jet: true, down: false });
    }
  }
  /** Fire about a point, as on an orc that burns: `n` tongues rising out of it, and fire left burning on the snow under it. */
  burn(at: Vector3, n: number, r = 0.4): void {
    for (let i = 0; i < n; i++) this.lick(at.clone().add(new Vector3(this.rng.range(-r, r), this.rng.range(-r, r) * 0.6, this.rng.range(-r, r))), this.rng.range(0.3, 0.6));
    const p = at.clone();
    p.y = this.ground(p.x, p.z);
    if (Number.isFinite(p.y)) this.ignite(p, this.rng.range(4, 6), 0.8);
  }
  /** Fire left burning on the snow at `at`, for `life` seconds, `r` metres across; or the fire burning there already, kept burning. */
  ignite(at: Vector3, life = this.rng.range(2.5, 4.5), r = this.rng.range(0.45, 0.8)): void {
    const near = this.pools.find((q) => q.p.distanceToSquared(at) < 1.1);
    if (near) { near.life = Math.max(near.life, near.age + life * 0.6); return; }
    if (this.pools.length >= Flames.POOLS) this.pools.shift();
    this.pools.push({ p: at.clone(), age: 0, life, r, due: 0 });
  }
  /** A rocket's exhaust at `p`, going back from it at `v`: a short tongue of fire, and a puff of pale smoke left hanging in the air. */
  trail(p: Vector3, v: Vector3): void {
    if (this.licks.length < this.most) this.licks.push({ p: p.clone(), v: v.clone(), age: 0, life: this.rng.range(0.06, 0.12), size: this.rng.range(0.25, 0.4), grow: 1, roll: this.rng.range(0, 6.3), jet: false, down: true });
    if (this.soot.length < this.mostSoot) this.soot.push({ p: p.clone(), v: v.clone().multiplyScalar(0.3), age: 0, life: this.rng.range(1.2, 2), size: this.rng.range(0.3, 0.45), grow: 3, roll: this.rng.range(0, 6.3), jet: false, down: false, pale: true });
  }
  /** A tongue of fire rising from `p`, `size` across as it begins. */
  private lick(p: Vector3, size: number): void {
    if (this.licks.length >= this.most) return;
    this.licks.push({ p, v: new Vector3(this.rng.range(-0.5, 0.5), this.rng.range(1.4, 3.2), this.rng.range(-0.5, 0.5)), age: 0, life: this.rng.range(0.35, 0.75), size, grow: 2, roll: this.rng.range(0, 6.3), jet: false, down: true });
  }
  /** A puff of smoke rising from `p`, `size` across as it begins. */
  private puff(p: Vector3, size: number): void {
    if (this.soot.length >= this.mostSoot) return;
    this.soot.push({ p: p.clone(), v: new Vector3(this.rng.range(-0.6, 0.6), this.rng.range(1.2, 2.6), this.rng.range(-0.6, 0.6)), age: 0, life: this.rng.range(1.4, 2.6), size, grow: 2.6, roll: this.rng.range(0, 6.3), jet: false, down: false });
  }
  /**
   * A step on by `dt` (none while all is held still): the fire on the snow burning, and dying down; each tongue on, the jet's falling
   * as it goes and splashing along the snow where it comes down, all of it slowed by the air, tossed about and rising as it burns;
   * the smoke rising and spreading. Drawn turned to the eye (`eye`, the camera's turn).
   */
  step(dt: number, eye: Quaternion): void {
    if (dt > 0) {
      for (let i = 0; i < this.pools.length; i++) {
        const f = this.pools[i];
        f.age += dt;
        if (f.age >= f.life) { this.pools.splice(i--, 1); continue; }
        // (Some thirty tongues a second as it catches, fewer as it burns down; and smoke.)
        const strength = Math.min(1, f.age / 0.2) * (1 - (f.age / f.life) ** 2);
        for (f.due += dt * 30 * strength; f.due >= 1; f.due--) {
          const a = this.rng.range(0, 6.3), r = Math.sqrt(this.rng.next()) * f.r;
          this.lick(f.p.clone().add(new Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r)), this.rng.range(0.3, 0.55) * (0.5 + 0.5 * strength));
          if (this.rng.chance(0.1)) this.puff(f.p.clone().setY(f.p.y + 1.2), 0.7);
        }
      }
    }
    let n = 0;
    for (let i = 0; i < this.licks.length; i++) {
      const l = this.licks[i];
      if (dt > 0) {
        l.age += dt;
        if (l.age >= l.life) {
          if (this.rng.chance(l.jet ? 0.16 : 0.05)) this.puff(l.p, l.size * (1 + l.grow) * 0.7);
          this.licks.splice(i--, 1);
          continue;
        }
        const k = l.age / l.life, toss = 9 * k * dt;
        l.v.x += this.rng.range(-toss, toss); l.v.y += this.rng.range(-toss, toss); l.v.z += this.rng.range(-toss, toss);
        l.v.multiplyScalar(Math.exp(-(l.jet ? 1.5 : 2.5) * dt));
        // (The jet falls as the fuel it is does, and rises as it burns away into flame.)
        l.v.y += (l.jet && !l.down ? -6 * (1 - k) ** 2 + 5 * k : 3.5) * dt;
        l.p.addScaledVector(l.v, dt);
        const g = this.ground(l.p.x, l.p.z) + 0.08;
        if (l.p.y < g) {
          l.p.y = g;
          // (Come down on the snow: splashed out along it, slower and every way, the fire running on over it; some of it left
          // burning there.)
          if (!l.down) {
            l.down = true;
            const a = this.rng.range(-0.7, 0.7), cs = Math.cos(a), sn = Math.sin(a), x = l.v.x, z = l.v.z;
            l.v.set((x * cs - z * sn) * 0.7, Math.abs(l.v.y) * 0.15 + 0.6, (x * sn + z * cs) * 0.7);
            if (this.rng.chance(0.1)) this.ignite(l.p);
          } else l.v.y = Math.max(l.v.y, 0);
        }
      }
      const k = l.age / l.life, size = l.size * (1 + l.grow * Math.sqrt(k));
      this.c.copy(WHITE_HOT).lerp(ORANGE, smooth01(k / 0.3));
      if (k > 0.3) this.c.lerp(DULL, smooth01((k - 0.3) / 0.7));
      this.fire.setMatrixAt(n, this.facing(l, eye, size));
      this.fireLook.setXYZW(n++, this.c.r, this.c.g, this.c.b, Math.min(1, 1.5 * (1 - k) ** 1.2) * smooth01(l.age / 0.03));
    }
    if (n || this.fire.count) { this.fire.instanceMatrix.needsUpdate = true; this.fireLook.needsUpdate = true; }
    this.fire.count = n;
    n = 0;
    for (let i = 0; i < this.soot.length; i++) {
      const s = this.soot[i];
      if (dt > 0) {
        s.age += dt;
        if (s.age >= s.life) { this.soot.splice(i--, 1); continue; }
        s.v.x *= Math.exp(-1.2 * dt); s.v.z *= Math.exp(-1.2 * dt); s.v.y = Math.min(s.v.y + (s.pale ? 0.3 : 1.5) * dt, 4);
        s.p.addScaledVector(s.v, dt);
      }
      const k = s.age / s.life;
      if (s.pale) this.c.copy(PALE).lerp(PALER, smooth01(k));
      else this.c.copy(SOOTY).lerp(GREY, smooth01(k));
      this.smoke.setMatrixAt(n, this.facing(s, eye, s.size * (1 + s.grow * Math.sqrt(k))));
      this.smokeLook.setXYZW(n++, this.c.r, this.c.g, this.c.b, 0.55 * smooth01(s.age / 0.25) * (1 - k) ** 1.3);
    }
    if (n || this.smoke.count) { this.smoke.instanceMatrix.needsUpdate = true; this.smokeLook.needsUpdate = true; }
    this.smoke.count = n;
  }
  /** A puff turned to the eye, and about its own middle as it goes, `size` across. */
  private facing(l: Lick, eye: Quaternion, size: number): Matrix4 {
    this.q.copy(eye).multiply(this.turn.setFromAxisAngle(Z, l.roll + l.age * 1.2));
    return this.m.compose(l.p, this.q, this.s.set(size, size, size));
  }
  clear(): void { this.licks.length = 0; this.soot.length = 0; this.pools.length = 0; this.fire.count = 0; this.smoke.count = 0; }
}

/** A bolt of lightning: the points it leaps through, how old it is, how long it lasts, and its crooked course as it is now drawn. */
interface Bolt { through: Vector3[]; age: number; life: number; path: Vector3[]; redrawn: number }

/**
 * The lightning gun's bolts: from its mouth to the first orc and on from each to the next it leaps to, a crooked line of blue-white
 * light, its crooks thrown anew every few hundredths of a second as it flickers, gone in a moment; and a forked branch here and there.
 */
export class Bolts {
  private readonly bolts: Bolt[] = [];
  private readonly mesh: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();
  constructor(scene: Scene, private readonly rng: Rng, private readonly most = 600) {
    const paint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    paint.colorNode = vec3(0.55, 0.75, 1).mul(6);
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0, 0.5), paint, most);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  /** A bolt through `through` (its mouth first), lasting `life` seconds. */
  strike(through: Vector3[], life = 0.16): void {
    if (through.length < 2) return;
    this.bolts.push({ through: through.map((p) => p.clone()), age: 0, life, path: [], redrawn: -1 });
  }
  /** The crooked course from point to point: each leap broken at every metre or so, each break thrown aside by a fraction of the leap. */
  private crook(through: Vector3[]): Vector3[] {
    const out: Vector3[] = [through[0].clone()];
    for (let i = 1; i < through.length; i++) {
      const a = through[i - 1], b = through[i], len = a.distanceTo(b), steps = Math.max(2, Math.min(18, Math.round(len / 1.1)));
      for (let k = 1; k <= steps; k++) {
        const p = a.clone().lerp(b, k / steps);
        if (k < steps) { const w = Math.min(0.9, len * 0.06); p.add(new Vector3(this.rng.range(-w, w), this.rng.range(-w, w), this.rng.range(-w, w))); }
        out.push(p);
      }
    }
    return out;
  }
  step(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      b.age += dt;
      if (b.age >= b.life) { this.bolts.splice(i--, 1); continue; }
      // (Its crooks thrown anew every three hundredths of a second: lightning flickers.)
      if (Math.floor(b.age / 0.03) !== b.redrawn) { b.redrawn = Math.floor(b.age / 0.03); b.path = this.crook(b.through); }
      const thick = 0.05 * (1 - b.age / b.life) + 0.015;
      const segment = (a: Vector3, c: Vector3, w: number) => {
        if (n >= this.most) return;
        this.p.subVectors(c, a);
        const len = this.p.length();
        if (len < 1e-4) return;
        this.q.setFromUnitVectors(Z, this.p.divideScalar(len));
        this.mesh.setMatrixAt(n++, this.m.compose(a, this.q, this.s.set(w, w, len)));
      };
      for (let k = 1; k < b.path.length; k++) {
        segment(b.path[k - 1], b.path[k], thick);
        // (A fork off here and there, short and thin.)
        if (k % 4 === 2) {
          const off = b.path[k].clone().add(new Vector3(this.rng.range(-1, 1), this.rng.range(-0.6, 0.6), this.rng.range(-1, 1)).multiplyScalar(1.2));
          segment(b.path[k], off, thick * 0.5);
        }
      }
    }
    if (n || this.mesh.count) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = n;
  }
  clear(): void { this.bolts.length = 0; this.mesh.count = 0; }
}
const Z = new Vector3(0, 0, 1);

/**
 * The sword's sweep as it cuts (asked: "the sword animations need to be improved, like proper slashing alternating on right and left
 * side of the horse flanks"): a ribbon through where the blade has been over the last moment, from near its hilt to its point, a
 * smear of the steel's grey, fading behind it and toward the hilt, as the eye keeps a blade swung fast. (Pale, as such sweeps are
 * mostly drawn, it was not to be seen against the snow and the sky.) Drawn stronger for a cut held and let go, and reddened once the
 * blade has drawn blood in the cut (asked: "improve the sword play").
 */
export class Sweep {
  private static readonly N = 24;
  /** (A fifth of a second, which reads as a stroke of the blade: at an eighth it was a flicker, gone before it was seen.) */
  private static readonly LIFE = 0.2;
  private readonly at: { a: Vector3; b: Vector3; age: number; glow: number }[] = [];
  private readonly mesh: Mesh;
  private readonly pos = new Float32Array(Sweep.N * 6);
  private readonly fade = new Float32Array(Sweep.N * 2);
  /** Its colour: steel grey, or, once the blade has drawn blood in this cut, red. */
  private readonly tint = uniform(new Color(0.5, 0.56, 0.66));
  private static readonly STEEL = new Color(0.5, 0.56, 0.66);
  private static readonly BLOOD = new Color(0.62, 0.05, 0.04);
  constructor(scene: Scene) {
    const geo = new BufferGeometry(), index: number[] = [];
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aFade', new BufferAttribute(this.fade, 1));
    for (let i = 0; i < Sweep.N - 1; i++) { const k = 2 * i; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    geo.setIndex(index);
    const paint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    paint.colorNode = this.tint;
    paint.opacityNode = attribute('aFade', 'float');
    this.mesh = new Mesh(geo, paint);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** The blade where it is now, from `a` (near its hilt) to `b` (its point), while it cuts; `glow`, how strongly it is drawn (a cut held and let go, up to twice). */
  add(a: Vector3, b: Vector3, glow = 1): void {
    this.at.unshift({ a: a.clone(), b: b.clone(), age: 0, glow });
    if (this.at.length > Sweep.N) this.at.pop();
  }
  /** Its colour, red once the blade has drawn blood in this cut, steel before. */
  redden(blood: boolean): void { this.tint.value.copy(blood ? Sweep.BLOOD : Sweep.STEEL); }
  /** A step on by `dt`: each place the blade was, older, and gone once it is old enough. */
  step(dt: number): void {
    for (const p of this.at) p.age += dt;
    while (this.at.length && this.at[this.at.length - 1].age > Sweep.LIFE) this.at.pop();
    const n = this.at.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    this.at.forEach((p, i) => {
      const k = 1 - p.age / Sweep.LIFE;
      this.pos.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6);
      this.fade[i * 2] = Math.min(1, 0.1 * k * p.glow); this.fade[i * 2 + 1] = Math.min(0.95, 0.55 * k * p.glow);
    });
    const geo = this.mesh.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aFade').needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  }
  clear(): void { this.at.length = 0; this.mesh.visible = false; }
}

/** A rocket in flight: where it is, its way and speed, how long it has flown, and how long until its next puff of smoke. */
interface Rocket { p: Vector3; v: Vector3; age: number; due: number }

/**
 * The bazooka's rockets: each flown straight on from the mouth at some seventy metres a second, a flame at its tail and a trail of
 * smoke behind; on until it strikes an orc or the snow, or has flown a hundred and sixty metres, where it goes off. The page says
 * what it strikes (`strikes`), lays its smoke (`smoke`), and blows up what is about where it goes off (`boom`).
 */
export class Rockets {
  private readonly flying: Rocket[] = [];
  private readonly body: InstancedMesh;
  private readonly flame: InstancedMesh;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();
  constructor(scene: Scene, private readonly rng: Rng, private readonly most = 8) {
    const shape = mergeGeometries([
      new CylinderGeometry(0.04, 0.04, 0.42, 10).rotateX(Math.PI / 2),
      new ConeGeometry(0.04, 0.14, 10).rotateX(Math.PI / 2).translate(0, 0, 0.28),
      ...[0, 1, 2, 3].map((k) => new BoxGeometry(0.004, 0.09, 0.1).translate(0, 0.06, -0.18).rotateZ((k * Math.PI) / 2)),
    ].map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }));
    this.body = new InstancedMesh(shape, new MeshStandardMaterial({ color: 0x5d6147, roughness: 0.5, metalness: 0.4 }), most);
    const glow = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    glow.colorNode = vec3(2.2, 1.3, 0.5).mul(texture(spot('rgba(255,255,255,1)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'), uv()).a);
    this.flame = new InstancedMesh(new PlaneGeometry(1, 1), glow, most);
    for (const m of [this.body, this.flame]) { m.frustumCulled = false; m.count = 0; scene.add(m); }
  }
  /** A rocket fired from `from` along `dir`. */
  launch(from: Vector3, dir: Vector3, speed = 70): void {
    if (this.flying.length >= this.most) return;
    this.flying.push({ p: from.clone(), v: dir.clone().normalize().multiplyScalar(speed), age: 0, due: 0 });
  }
  /**
   * A step on by `dt`: each rocket on (falling a little as it goes), its smoke laid behind it every hundredth of a second or so
   * (`smoke`, from its tail, going back); where it strikes something between where it was and where it is (`strikes`, giving back
   * where), or has flown far enough, gone off there (`boom`). Drawn, its flame turned to the eye (`eye`).
   */
  step(dt: number, eye: Quaternion, strikes: (from: Vector3, to: Vector3) => Vector3 | null, boom: (at: Vector3) => void, smoke: (at: Vector3, v: Vector3) => void): void {
    let n = 0;
    for (let i = 0; i < this.flying.length; i++) {
      const r = this.flying[i];
      if (dt > 0) {
        r.age += dt;
        r.v.y -= 1.5 * dt;
        const to = r.p.clone().addScaledVector(r.v, dt), hit = strikes(r.p, to);
        if (hit || r.age > 2.3) { boom(hit ?? to); this.flying.splice(i--, 1); continue; }
        for (r.due -= dt; r.due <= 0; r.due += 0.012) {
          const back = r.v.clone().normalize();
          smoke(r.p.clone().addScaledVector(back, -0.3 + this.rng.range(-1, 0) * r.v.length() * dt), back.multiplyScalar(-this.rng.range(1, 3)).add(new Vector3(this.rng.range(-0.6, 0.6), this.rng.range(-0.3, 0.8), this.rng.range(-0.6, 0.6))));
        }
        r.p.copy(to);
      }
      this.q.setFromUnitVectors(Z, this.p.copy(r.v).normalize());
      this.body.setMatrixAt(n, this.m.compose(r.p, this.q, this.s.set(1, 1, 1)));
      const flicker = this.rng.range(0.45, 0.65);
      this.flame.setMatrixAt(n++, this.m.compose(this.p.copy(r.p).addScaledVector(r.v, -0.26 / r.v.length()), eye, this.s.set(flicker, flicker, flicker)));
    }
    if (n || this.body.count) { this.body.instanceMatrix.needsUpdate = true; this.flame.instanceMatrix.needsUpdate = true; }
    this.body.count = this.flame.count = n;
  }
  clear(): void { this.flying.length = 0; this.body.count = this.flame.count = 0; }
}
