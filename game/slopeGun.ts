/**
 * A tommy gun for the skier alone, riding on a computer (asked: "if the player is skiing with just the human, make the skier have a
 * tommygun submachine gun that fires when left mouse button is clicked, aimed according to where the control dot is; desktop only";
 * "they would not have poles when skiing with the tommygun"; "the player can mow down and shoot at hordes of goblins crawling up the
 * slope"): the gun itself, made here in code, and its fire: a bright tracer for every round, out from the muzzle to where it strikes,
 * the muzzle's flash, and its sound, a rattle made as it fires (`GunSound`). The orcs are `slopeOrcs.ts`; the page holds the gun,
 * aims it and pulls the trigger (`slope.ts`).
 */
import { AdditiveBlending, BoxGeometry, type BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, type Scene, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { texture, uv, vec3 } from 'three/tsl';
import type { Rng } from '../src/core/rng';

/** The bore's height over the pistol grip, where the fist holds it; the fore grip's place along the gun; the muzzle's. */
const BORE = 0.075, FORE = 0.3;
export const MUZZLE = new Vector3(0, BORE, 0.53);
export const FORE_GRIP = FORE;

/**
 * A Thompson of the twenties, drum fed: laid along +z from its pistol grip at the origin (where the right fist holds it), its bore
 * a little above. A walnut stock, pistol grip and fore grip; a blued receiver, the finned barrel and the compensator at its muzzle; the
 * round drum under it, ahead of the grip.
 */
export function tommyGun(): Group {
  const steel: BufferGeometry[] = [], wood: BufferGeometry[] = [], drum: BufferGeometry[] = [];
  const box = (into: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, tilt = 0) => into.push(new BoxGeometry(w, h, d).rotateX(tilt).translate(x, y, z));
  const tube = (into: BufferGeometry[], r: number, from: number, to: number, y: number, sides = 10) => into.push(new CylinderGeometry(r, r, to - from, sides).rotateX(Math.PI / 2).translate(0, y, (from + to) / 2));
  // The receiver, the bolt's knob on top, the trigger guard under it, the rear and front sights.
  box(steel, 0.046, 0.066, 0.24, 0, BORE - 0.006, 0.04);
  steel.push(new CylinderGeometry(0.008, 0.008, 0.025, 8).translate(0, BORE + 0.036, 0.06));
  box(steel, 0.012, 0.012, 0.07, 0, -0.012, 0.03);
  box(steel, 0.014, 0.022, 0.016, 0, BORE + 0.036, -0.06);
  box(steel, 0.006, 0.02, 0.01, 0, BORE + 0.022, 0.5);
  // The barrel, its cooling fins over the first half of it, and the compensator.
  tube(steel, 0.012, 0.16, 0.47, BORE);
  for (let k = 0; k < 11; k++) tube(steel, 0.024, 0.17 + k * 0.014, 0.175 + k * 0.014, BORE, 12);
  tube(steel, 0.019, 0.47, 0.53, BORE, 10);
  // The stock, falling to its butt; the pistol grip, raked back; the fore grip under the barrel, where the left hand holds it.
  box(wood, 0.04, 0.075, 0.3, 0, BORE - 0.05, -0.23, -0.14);
  box(wood, 0.042, 0.11, 0.02, 0, BORE - 0.075, -0.385, -0.14);
  box(wood, 0.034, 0.11, 0.042, 0, -0.012, -0.012, 0.26);
  box(wood, 0.034, 0.1, 0.04, 0, BORE - 0.07, FORE, 0.1);
  // The drum, its axle across the gun, with a rim either side.
  drum.push(new CylinderGeometry(0.085, 0.085, 0.046, 24).rotateZ(Math.PI / 2).translate(0, BORE - 0.105, 0.085));
  for (const s of [-1, 1]) drum.push(new CylinderGeometry(0.06, 0.06, 0.006, 20).rotateZ(Math.PI / 2).translate(s * 0.026, BORE - 0.105, 0.085));
  const gun = new Group();
  const part = (gs: BufferGeometry[], m: MeshStandardMaterial) => {
    const mesh = new Mesh(mergeGeometries(gs.map((g) => { g.deleteAttribute('uv'); return g; })), m);
    mesh.castShadow = true;
    gun.add(mesh);
  };
  part(steel, new MeshStandardMaterial({ color: 0x24262b, roughness: 0.38, metalness: 0.8 }));
  part(wood, new MeshStandardMaterial({ color: 0x5c3317, roughness: 0.55 }));
  part(drum, new MeshStandardMaterial({ color: 0x2c3036, roughness: 0.32, metalness: 0.85 }));
  gun.name = 'tommy gun';
  return gun;
}

/** A round in flight: where it left, which way, how far it goes before it strikes, how far it has gone, and what then. */
interface Round { from: Vector3; dir: Vector3; reach: number; gone: number; then: (() => void) | null }

/**
 * The gun's fire: each round a tracer, a streak of light some metres long flying from the muzzle at three hundred metres a second to
 * where it strikes, and there what it strikes is told (`then`); the muzzle's flash, a burst of light turned to the eye for a moment.
 */
export class Gunfire {
  private readonly rounds: Round[] = [];
  private readonly tracers: InstancedMesh;
  private readonly flash: Mesh;
  private flashLeft = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly p = new Vector3();
  constructor(scene: Scene, private readonly rng: Rng, private readonly most = 64) {
    const glow = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    glow.colorNode = vec3(1, 0.74, 0.38).mul(5);
    this.tracers = new InstancedMesh(new BoxGeometry(1, 1, 1).translate(0, 0, -0.5), glow, most);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    scene.add(this.tracers);
    // (A star of light, brightest at its middle, painted once.)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,250,220,1)'); grad.addColorStop(0.25, 'rgba(255,190,90,0.9)'); grad.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    const flashPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    flashPaint.colorNode = vec3(1, 0.85, 0.6).mul(4).mul(texture(new CanvasTexture(c), uv()).a);
    this.flash = new Mesh(new PlaneGeometry(1, 1), flashPaint);
    this.flash.visible = false;
    this.flash.frustumCulled = false;
    scene.add(this.flash);
  }

  /** A round fired from `from` along `dir`, striking `reach` metres on; `then`, what happens there when it does. */
  fire(from: Vector3, dir: Vector3, reach: number, then: (() => void) | null): void {
    if (this.rounds.length >= this.most) this.rounds.shift();
    this.rounds.push({ from: from.clone(), dir: dir.clone().normalize(), reach, gone: 0, then });
    this.flashLeft = 0.045;
    this.flash.position.copy(from).addScaledVector(dir, 0.08);
    this.flash.scale.setScalar(this.rng.range(0.28, 0.5));
    this.flash.rotation.z = this.rng.range(0, Math.PI);
  }

  /** A step on by `dt`: rounds flown on and struck; the flash turned to the eye (`eye`, the camera's turn) and gone after a moment. */
  step(dt: number, eye: Quaternion): void {
    const SPEED = 300, LONG = 5;
    let n = 0;
    for (let i = 0; i < this.rounds.length; i++) {
      const r = this.rounds[i];
      r.gone += SPEED * dt;
      if (r.gone >= r.reach) { r.then?.(); this.rounds.splice(i--, 1); continue; }
      // (A streak from where the round is back towards the muzzle, never further back than it.)
      const len = Math.min(LONG, r.gone);
      this.p.copy(r.from).addScaledVector(r.dir, r.gone);
      this.q.setFromUnitVectors(Z, r.dir);
      this.tracers.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s.set(0.035, 0.035, len)));
    }
    // (Sent to the graphics card only while a round is in flight, or the last has just struck.)
    if (n || this.tracers.count) this.tracers.instanceMatrix.needsUpdate = true;
    this.tracers.count = n;
    this.flashLeft -= dt;
    this.flash.visible = this.flashLeft > 0;
    if (this.flash.visible) this.flash.quaternion.copy(eye);
  }

  /** Every round in flight let go of, and the flash. */
  clear(): void { this.rounds.length = 0; this.tracers.count = 0; this.flash.visible = false; this.flashLeft = 0; }
}
const Z = new Vector3(0, 0, 1);

/**
 * The gun's sound and the orcs' cries, made as they are wanted (no files): a round, a crack of noise through a falling filter
 * over a thump; an orc falling, a grunt dropping in pitch. Quietly, and only once the page has been clicked, as browsers require. And
 * the other arms' (`slopeArms.ts`): a pistol's shot, sharper and lighter; a shotgun's, a long low boom; the flamethrower's roar, a
 * roar of low noise over the hiss of its jet; the lightning gun's crack and buzz; a sword's swish through the air; the bazooka's rocket
 * rushing off, and its blast, a long low rumble under the crack. The sword's blow struck home, a chop, a dull thud under a short tearing
 * crack; and its blade held drawn up until its cut has all its force, a ring of steel.
 */
export type Heard = 'shot' | 'grunt' | 'pistol' | 'shotgun' | 'flame' | 'zap' | 'swish' | 'chop' | 'ring' | 'rocket' | 'boom';
export class GunSound {
  constructor(private readonly rng: Rng) {}
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private out: GainNode | null = null;
  /** Told of every round and every cry as it is made, woken or not: for a recording to make its sound again afterwards (`render`). */
  heard: ((kind: Heard) => void) | null = null;
  /** Wakes the sound, from a click (a browser lets a page make sound only after one). */
  wake(): void {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.35;
        this.out.connect(this.ctx.destination);
        this.noise = this.noiseOn(this.ctx);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* (no sound where there is none to be had) */ }
  }
  shot(): void { this.now('shot'); }
  grunt(): void { this.now('grunt'); }
  /** Any of the sounds by its name. */
  hear(kind: Heard): void { this.now(kind); }
  /**
   * The sound of what was heard, each at so many seconds from the start, made afterwards as one recording `seconds` long: for a video
   * made a frame at a time, slower or faster than it plays, whose sound could not be heard as it was made.
   */
  render(events: { kind: Heard; at: number }[], seconds: number): Promise<AudioBuffer> {
    const c = new OfflineAudioContext(2, Math.ceil(48000 * seconds), 48000), out = c.createGain(), noise = this.noiseOn(c);
    out.gain.value = 0.35;
    out.connect(c.destination);
    for (const e of events) this.play(c, out, noise, e.kind, e.at);
    return c.startRendering();
  }

  private now(kind: Heard): void {
    this.heard?.(kind);
    const c = this.ctx, out = this.out;
    if (c && out && this.noise && c.state === 'running') this.play(c, out, this.noise, kind, c.currentTime);
  }
  /** A quarter of a second of noise, for the rounds' crack. */
  private noiseOn(c: BaseAudioContext): AudioBuffer {
    const len = Math.floor(c.sampleRate * 0.25), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng.range(-1, 1);
    return b;
  }
  /** A burst of noise through a filter of `type` from `f0` to `f1` hertz over `len` seconds, at `gain`. */
  private hiss(c: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, type: BiquadFilterType, f0: number, f1: number, len: number, gain: number, rate = 1): void {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise;
    src.playbackRate.value = rate * this.rng.range(0.9, 1.1);
    f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len * 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, len * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t); src.stop(t + len + 0.02);
  }
  /** A tone from `f0` to `f1` hertz over `len` seconds, of `type`, at `gain`. */
  private tone(c: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, len: number, gain: number): void {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + len + 0.02);
  }
  /** A round's crack over its thump, or an orc's grunt, or another arm's sound, made into `out` at `t`. */
  private play(c: BaseAudioContext, out: AudioNode, noise: AudioBuffer, kind: Heard, t: number): void {
    if (kind === 'pistol') { this.hiss(c, out, noise, t, 'lowpass', 7000, 900, 0.1, 0.8); this.tone(c, out, t, 'sine', 180, 60, 0.06, 0.5); return; }
    if (kind === 'shotgun') { this.hiss(c, out, noise, t, 'lowpass', 3200, 240, 0.4, 1, 0.6); this.tone(c, out, t, 'sine', 90, 32, 0.3, 0.9); return; }
    if (kind === 'flame') { this.hiss(c, out, noise, t, 'lowpass', 700, 260, 0.2, 0.42, 0.45); this.hiss(c, out, noise, t, 'bandpass', 2600, 1900, 0.14, 0.1); return; }
    if (kind === 'rocket') { this.hiss(c, out, noise, t, 'bandpass', 1800, 500, 0.6, 0.5, 0.4); this.tone(c, out, t, 'sine', 120, 50, 0.15, 0.6); return; }
    if (kind === 'boom') { this.hiss(c, out, noise, t, 'lowpass', 2400, 70, 0.85, 1.1, 0.28); this.hiss(c, out, noise, t, 'lowpass', 6000, 600, 0.12, 0.7); this.tone(c, out, t, 'sine', 75, 28, 0.7, 1); return; }
    if (kind === 'zap') { this.hiss(c, out, noise, t, 'highpass', 2600, 5200, 0.14, 0.5); this.tone(c, out, t, 'sawtooth', 1400, 90, 0.18, 0.12); return; }
    if (kind === 'swish') { this.hiss(c, out, noise, t, 'bandpass', 900, 2600, 0.2, 0.28); return; }
    if (kind === 'chop') { this.hiss(c, out, noise, t, 'lowpass', 3400, 280, 0.13, 0.75, 0.7); this.tone(c, out, t, 'sine', 160, 48, 0.12, 0.85); return; }
    if (kind === 'ring') { this.tone(c, out, t, 'triangle', 1760, 1700, 0.5, 0.06); this.tone(c, out, t, 'sine', 2640, 2600, 0.35, 0.03); return; }
    if (kind === 'shot') {
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = noise;
      src.playbackRate.value = this.rng.range(0.9, 1.1);
      f.type = 'lowpass'; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.1);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      src.connect(f).connect(g).connect(out);
      src.start(t); src.stop(t + 0.15);
      const thump = c.createOscillator(), tg = c.createGain();
      thump.frequency.setValueAtTime(130, t); thump.frequency.exponentialRampToValueAtTime(45, t + 0.08);
      tg.gain.setValueAtTime(0.7, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      thump.connect(tg).connect(out);
      thump.start(t); thump.stop(t + 0.1);
      return;
    }
    const o = c.createOscillator(), g = c.createGain(), p = this.rng.range(150, 260);
    o.type = 'sawtooth';
    // (Low, as a large throat's; it was a goblin's squeal, three times as high.)
    o.frequency.setValueAtTime(p, t); o.frequency.exponentialRampToValueAtTime(p * 0.35, t + 0.28);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.32);
  }
}
