/**
 * The run's end, ridden (asked: "at the ending, instead of countdown to start a new run, add a huge robotic arm appearing from under
 * the snow that grabs the player (including possible horse) and throws them in an big arch back to the starting point of the track. A
 * parachute opens to ease the landing and a new round starts"): the arm, an industrial robot's some fourteen metres long, made here in
 * code, its turret buried deep under the snow until it rises, and how it stands in a pose (`RobotArm`); the parachute, a canopy of
 * coloured gores on its lines (`Parachute`); and the throw's flight, from where the arm lets go to the top of the run (`Throw`). The
 * page says when each moves and how (`slope.ts`).
 */
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DodecahedronGeometry, DoubleSide, Group, LineBasicMaterial,
  LineSegments, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, SRGBColorSpace, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rng } from '../src/core/rng';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const UP = new Vector3(0, 1, 0);

/**
 * The arm's measures: how high its shoulder stands over the snow, risen; how long the upper arm and the forearm are; how far along the
 * claw from the wrist is the middle of what it holds; how deep the whole lies under the snow before it rises.
 */
export const ARM = { shoulder: 2.8, upper: 7.2, fore: 6.4, grip: 2.9, depth: 27 };

/**
 * How the arm stands: how far risen out of the snow (0 to 1); which way it is turned (radians, `atan2` of east over south, as a body
 * faces); the upper arm's and the forearm's angles over the level, ahead of the turret (radians: a half turn and more lays them back
 * behind it), and the claw's; the claw turned about its own axis; and how far its fingers are closed on what it holds (0 to 1), and
 * how near they close (`hold`: 0 a person's waist, 1 a horse's barrel).
 */
export interface ArmPose { rise: number; yaw: number; upper: number; fore: number; claw: number; roll: number; grip: number; hold: number }

/** The upper arm's and the forearm's angles that put the wrist `ahead` of the shoulder and `up` over it: the elbow up. */
export function reachFor(ahead: number, up: number): { upper: number; fore: number } {
  const { upper: L1, fore: L2 } = ARM, d = clamp(Math.hypot(ahead, up), Math.abs(L1 - L2) + 0.05, L1 + L2 - 0.05);
  const elbow = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), upper = Math.atan2(up, ahead) + elbow;
  return { upper, fore: Math.atan2(up - L1 * Math.sin(upper), ahead - L1 * Math.cos(upper)) };
}

/** A strip of black and yellow, slanting, as machinery is marked where it moves. */
const hazard = () => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8a412'; g.fillRect(0, 0, 256, 32);
  g.fillStyle = '#1b1c1f';
  for (let x = -32; x < 256 + 32; x += 32) { g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
};

/**
 * The arm: a turret on a column under the snow; a yoke on it, and the shoulder's axle; the upper arm, a box girder painted yellow with
 * the ram that lifts it under it; the elbow's axle and the forearm; the wrist, a ball; and the claw, a palm with two red lamps and four
 * fingers of two joints each, two either side, so that a horse's barrel goes between them as well as a person's waist. Laid along +z
 * from the turret (turned by `yaw`), each joint turning about its own x.
 */
export class RobotArm {
  readonly group = new Group();
  private readonly lift = new Group();
  private readonly shoulderJ = new Group();
  private readonly elbowJ = new Group();
  private readonly wristJ = new Group();
  private readonly rollJ = new Group();
  private readonly fingers: { base: Group; tip: Group }[] = [];
  private readonly heap: Mesh;
  private readonly snow: MeshStandardMaterial;
  private readonly shown = { rise: 0 };

  constructor() {
    const paint = new MeshStandardMaterial({ color: 0xeea21b, roughness: 0.4, metalness: 0.3 });
    const steel = new MeshStandardMaterial({ color: 0x2c3037, roughness: 0.34, metalness: 0.8 });
    const chrome = new MeshStandardMaterial({ color: 0xcdd2da, roughness: 0.16, metalness: 1 });
    const marked = new MeshStandardMaterial({ map: hazard(), roughness: 0.45, metalness: 0.25 });
    const lamp = new MeshStandardMaterial({ color: 0x200404, emissive: new Color(0xff2a12), emissiveIntensity: 3 });
    this.snow = new MeshStandardMaterial({ color: 0xf3f6fb, roughness: 0.95 });
    /** The pieces of one joint, merged by what they are made of, and hung on it. */
    const part = (on: Group, pieces: [BufferGeometry, MeshStandardMaterial][]) => {
      const by = new Map<MeshStandardMaterial, BufferGeometry[]>();
      for (const [g, m] of pieces) { if (!by.has(m)) by.set(m, []); by.get(m)!.push(g.index ? g.toNonIndexed() : g); }
      for (const [m, gs] of by) {
        // (Merged with what each has: the striped band keeps its picture's coordinates, the plain pieces need none.)
        const keepUv = m === marked;
        const mesh = new Mesh(mergeGeometries(gs.map((g) => { if (!keepUv) g.deleteAttribute('uv'); return g; })), m);
        mesh.castShadow = true; mesh.receiveShadow = true;
        on.add(mesh);
      }
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new BoxGeometry(w, h, d).translate(x, y, z);
    /** A drum about the y axis; or turned onto the x (an axle across), or the z (along the arm). */
    const drum = (r0: number, r1: number, h: number, sides: number, axis: 'x' | 'y' | 'z', x: number, y: number, z: number) => {
      const g = new CylinderGeometry(r0, r1, h, sides);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      if (axis === 'z') g.rotateX(Math.PI / 2);
      return g.translate(x, y, z);
    };
    const { upper: L1, fore: L2, shoulder: SH } = ARM;

    // The turret, on its column; a ring of bolts about its top; the yoke and the shoulder's axle.
    const bolts: [BufferGeometry, MeshStandardMaterial][] = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; bolts.push([drum(0.09, 0.09, 0.14, 6, 'y', Math.cos(a) * 1.55, 1.95, Math.sin(a) * 1.55), steel]); }
    part(this.lift, [
      [drum(1.45, 1.45, 30, 20, 'y', 0, -14.8, 0), steel],
      [drum(1.95, 1.95, 1.4, 32, 'y', 0, 0.9, 0), marked],
      [drum(1.7, 1.95, 0.32, 32, 'y', 0, 1.76, 0), paint],
      [box(0.5, 2.0, 2.2, -1.05, 2.75, 0), paint], [box(0.5, 2.0, 2.2, 1.05, 2.75, 0), paint],
      [drum(0.8, 0.8, 2.7, 20, 'x', 0, SH, 0), steel],
      ...bolts,
    ]);
    this.shoulderJ.position.set(0, SH, 0);
    this.lift.add(this.shoulderJ);
    // The upper arm: its girder, plates at its root, the cable along its back, the ram under it from the turret's yoke.
    part(this.shoulderJ, [
      [box(1.05, 1.2, L1 - 0.9, 0, 0, L1 / 2), paint],
      [box(1.25, 1.45, 1.6, 0, 0, 0.5), paint],
      [drum(0.12, 0.12, L1 - 1.6, 8, 'z', 0, 0.68, L1 / 2), steel],
      [drum(0.25, 0.25, 3.2, 12, 'z', 0, -0.85, 2.2), steel], [drum(0.13, 0.13, 2.6, 10, 'z', 0, -0.85, 4.9), chrome],
      [box(0.3, 0.5, 0.4, 0, -0.75, 6.2), steel],
      [box(1.08, 1.23, 0.5, 0, 0, L1 - 1.2), marked],
    ]);
    this.elbowJ.position.set(0, 0, L1);
    this.shoulderJ.add(this.elbowJ);
    // The elbow's axle, the forearm's girder, and the ram along its top.
    part(this.elbowJ, [
      [drum(0.68, 0.68, 1.75, 18, 'x', 0, 0, 0), steel],
      [box(0.88, 1.0, L2 - 0.7, 0, 0, L2 / 2), paint],
      [drum(0.2, 0.2, 2.6, 12, 'z', 0, 0.7, 1.9), steel], [drum(0.1, 0.1, 2.2, 10, 'z', 0, 0.7, 4.2), chrome],
      [box(0.91, 1.03, 0.45, 0, 0, L2 - 1.1), marked],
    ]);
    this.wristJ.position.set(0, 0, L2);
    this.elbowJ.add(this.wristJ);
    part(this.wristJ, [[new SphereGeometry(0.62, 18, 12), steel]]);
    this.wristJ.add(this.rollJ);
    // The claw: its neck, its palm, two lamps on the palm's face between the fingers.
    part(this.rollJ, [
      [drum(0.45, 0.5, 0.7, 14, 'z', 0, 0, 0.45), steel],
      [drum(0.95, 1.05, 0.6, 24, 'z', 0, 0, 1.0), paint],
      [drum(0.8, 0.8, 0.12, 24, 'z', 0, 0, 1.33), steel],
    ]);
    for (const s of [-1, 1]) { const eye = new Mesh(new SphereGeometry(0.13, 10, 8), lamp); eye.position.set(0, s * 0.5, 1.36); this.rollJ.add(eye); }
    // Four fingers, at the corners between the claw's x and y: each a hinge at the palm's rim, its first joint (yellow), a knuckle and
    // its second (steel), tipped with a point.
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2, mount = new Group(), base = new Group(), tip = new Group();
      mount.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 1.3);
      mount.rotation.z = a;
      part(mount, [[drum(0.24, 0.24, 0.55, 12, 'y', 0, 0, 0), steel]]);
      part(base, [[box(0.42, 0.5, 2.1, 0, 0, 1.05), paint], [box(0.2, 0.54, 1.6, -0.18, 0, 1.0), steel]]);
      tip.position.set(0, 0, 2.1);
      part(tip, [[drum(0.2, 0.2, 0.5, 10, 'y', 0, 0, 0), steel], [box(0.36, 0.44, 1.45, 0, 0, 0.72), steel], [drum(0.02, 0.2, 0.45, 4, 'z', -0.06, 0, 1.6), steel]]);
      base.add(tip);
      mount.add(base);
      this.rollJ.add(mount);
      this.fingers.push({ base, tip });
    }
    // The snow broken up about it as it comes through, heaped about the turret (laid where it stands, `place`).
    this.heap = new Mesh(new BufferGeometry(), this.snow);
    this.heap.receiveShadow = this.heap.castShadow = true;
    this.group.add(this.lift, this.heap);
    this.group.visible = false;
    this.group.name = 'robot arm';
  }

  /** Stood at `base`, on the snow, the snow heaped about it as high as `ground` has it there; buried, not yet risen. */
  place(base: Vector3, ground: (x: number, z: number) => number, rng: Rng) {
    this.group.position.copy(base);
    this.group.rotation.set(0, 0, 0);
    const lumps: BufferGeometry[] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + rng.range(-0.12, 0.12), r = rng.range(2.05, 3.1), x = Math.cos(a) * r, z = Math.sin(a) * r, s = rng.range(0.35, 0.8);
      lumps.push(new DodecahedronGeometry(s, 0).scale(1, rng.range(0.45, 0.8), 1).rotateY(rng.range(0, 6)).translate(x, ground(base.x + x, base.z + z) - base.y - 0.08 * s, z));
    }
    this.heap.geometry.dispose();
    // (Each lump is made of faces that share no points already: asked to be made so again, each said so in the console, twenty-two times.)
    this.heap.geometry = mergeGeometries(lumps);
    this.heap.geometry.computeVertexNormals();
    this.pose({ rise: 0, yaw: 0, upper: Math.PI / 2, fore: Math.PI / 2, claw: Math.PI / 2, roll: 0, grip: 1, hold: 0 });
  }

  /** Stood as `p` has it. */
  pose(p: ArmPose) {
    this.group.visible = p.rise > 0.001;
    this.lift.position.y = -(1 - p.rise) * ARM.depth;
    this.group.rotation.y = p.yaw;
    // (Each joint turns from the one before it: so much more than its parent's angle.)
    this.shoulderJ.rotation.x = -p.upper;
    this.elbowJ.rotation.x = -(p.fore - p.upper);
    this.wristJ.rotation.x = -(p.claw - p.fore);
    this.rollJ.rotation.z = p.roll;
    // Open, the fingers spread wide and nearly straight; closed, drawn in about what they hold, the second joints curled under it.
    const spread = 0.7 * (1 - p.grip) + (0.12 + 0.14 * p.hold) * p.grip, curl = 0.12 * (1 - p.grip) + (1.15 + 0.05 * p.hold) * p.grip;
    for (const f of this.fingers) { f.base.rotation.y = spread; f.tip.rotation.y = -curl; }
    // (The heap thrown up as the turret comes through the snow, and left lying.)
    // (Begun again from nothing when the arm is under the snow: measured standing risen before it comes up, as it is to find its
    // reach, the heap was kept at its full size from then, and lay whole on smooth snow before anything had broken through it.)
    this.shown.rise = p.rise <= 0.001 ? 0 : Math.max(this.shown.rise, p.rise);
    this.heap.scale.setScalar(Math.max(0.001, clamp((this.shown.rise - 0.45) / 0.35, 0, 1)));
    this.group.updateMatrixWorld(true);
  }

  /** Put away: hidden, and its heap of snow gone with it. */
  hide() { this.group.visible = false; this.shown.rise = 0; }

  /** Where the middle of what the claw holds is, in the world; and the claw's own turn (its axis, +z, out from the palm). */
  holding(out = new Vector3()) { return this.rollJ.localToWorld(out.set(0, 0, ARM.grip)); }
  clawTurn(out = new Quaternion()) { return this.rollJ.getWorldQuaternion(out); }
  /** Where the shoulder is, in the world. */
  shoulderAt(out = new Vector3()) { return this.shoulderJ.getWorldPosition(out); }
}

/**
 * The parachute: a canopy of sixteen gores, orange and white with a blue pair, a dome with a vent at its crown, seen from under it as
 * from above; its lines from its rim down to where they meet over what it carries, and straps from there to the harness.
 */
export class Parachute {
  readonly group = new Group();
  private readonly canopy: Mesh;
  private readonly lines: LineSegments;
  private readonly linePos: Float32Array;
  static readonly GORES = 16;
  /** The cap's edge: how far down from its crown it reaches (radians from the top of its sphere). */
  private static readonly EDGE = 1.12;
  private static readonly STRAPS = 4;

  constructor() {
    const g = new SphereGeometry(1, Parachute.GORES * 2, 8, 0, Math.PI * 2, 0.09, Parachute.EDGE - 0.09).toNonIndexed();
    // (Each triangle the colour of the gore its middle lies in, so that the gores' seams are sharp.)
    const pos = g.getAttribute('position'), colours = new Float32Array(pos.count * 3);
    const orange = new Color(0xe9531b), white = new Color(0xf3efe4), blue = new Color(0x1f4f93);
    for (let i = 0; i < pos.count; i += 3) {
      const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const gore = Math.floor(((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1) * Parachute.GORES), c = gore === 4 || gore === 12 ? blue : gore % 2 ? white : orange;
      for (let j = 0; j < 3; j++) c.toArray(colours, (i + j) * 3);
    }
    g.setAttribute('color', new BufferAttribute(colours, 3));
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    this.canopy = new Mesh(g, new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: DoubleSide }));
    this.canopy.castShadow = true;
    const n = (Parachute.GORES + Parachute.STRAPS) * 2;
    this.linePos = new Float32Array(n * 3);
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(this.linePos, 3));
    this.lines = new LineSegments(lg, new LineBasicMaterial({ color: 0x34322e }));
    this.lines.frustumCulled = false;
    this.group.add(this.canopy, this.lines);
    this.group.visible = false;
    this.group.name = 'parachute';
  }

  /**
   * Spread over `riser` (where its lines meet), along `up` (its axis, from the riser to its crown), its canopy `radius` across and its
   * lines `reach` long; open as far as `open` (0 packed, a streamer as it comes out, 1 full; a little over, as it snaps full and
   * breathes); flattened by `flat` (0 a dome, 1 lying spent on the snow); its straps from the riser to `straps`.
   */
  set(riser: Vector3, up: Vector3, radius: number, reach: number, open: number, flat: number, straps: Vector3[]) {
    this.group.visible = open > 0.01;
    if (!this.group.visible) return;
    this.group.position.copy(riser);
    this.group.quaternion.setFromUnitVectors(UP, up.clone().normalize());
    this.group.updateMatrixWorld(true);
    // Out of the pack as a streamer, long and narrow; then filling, wide and less deep; spent, wide and flat.
    const stream = clamp(open / 0.3, 0, 1), fill = clamp((open - 0.3) / 0.7, 0, 1.2);
    const across = radius * (0.08 + 0.12 * stream + 0.8 * fill) * (1 + 0.15 * flat), deep = radius * (0.9 - 0.25 * fill) * (1 - 0.82 * flat);
    const lines = reach * (0.35 + 0.65 * stream) * (1 - 0.35 * flat);
    const rimR = Math.sin(Parachute.EDGE) * across, rimY = Math.cos(Parachute.EDGE) * deep;
    this.canopy.scale.set(across, deep, across);
    this.canopy.position.set(0, lines - rimY, 0);
    // The lines from the rim's seams down to the riser; the straps on from there, put in the canopy's frame.
    let k = 0;
    const put = (v: Vector3) => { this.linePos[k++] = v.x; this.linePos[k++] = v.y; this.linePos[k++] = v.z; };
    const at = new Vector3(), zero = new Vector3();
    for (let i = 0; i < Parachute.GORES; i++) {
      const a = (i / Parachute.GORES) * Math.PI * 2;
      put(at.set(Math.cos(a) * rimR, lines, Math.sin(a) * rimR)); put(zero);
    }
    for (let i = 0; i < Parachute.STRAPS; i++) { put(zero); put(straps[i] ? this.group.worldToLocal(at.copy(straps[i])) : zero); }
    this.lines.geometry.getAttribute('position').needsUpdate = true;
  }

  hide() { this.group.visible = false; }
}

/**
 * The throw's flight, for the middle of what was thrown: from where the arm lets it go, `from`, to where it comes down standing at the
 * top of the run, `to`. Up in a great arch, slowing across the sky as a body thrown through the air does, and falling from the top of
 * it; its canopy opening some `low` metres over the snow at the top of the run (higher, the higher it fell from, so that its fall is
 * taken out of it in time), the fall taken out of it quickly, and down slowly under it, drifting on along its way, more slowly still the
 * last few metres. The arch is so high and so long in the air as the throw is far.
 */
export class Throw {
  /** How long it flies before its canopy has opened, and after; in all. */
  readonly free: number;
  readonly chute: number;
  readonly total: number;
  /** Which way, level, it flies. */
  readonly dir: Vector3;
  /** How high over the snow at the top its canopy opens. */
  readonly open: number;
  private readonly far: number;
  private readonly apex: number;
  private readonly top: number;
  private static readonly APEX = 0.58;
  private static readonly KAPPA = 1.4;
  private static readonly DROP = 1.6;
  private static readonly STEP = 1 / 240;
  /** Under the canopy, a step at a time: how high over the landing, and how far it has drifted on. */
  private readonly highs: number[] = [];
  private readonly drifts: number[] = [];

  constructor(readonly from: Vector3, readonly to: Vector3, fallback: Vector3, low = 28, sink = 7) {
    const level = to.clone().sub(from).setY(0), D = level.length();
    this.dir = D > 0.5 ? level.divideScalar(D) : fallback.clone().setY(0).normalize();
    this.free = clamp(2.6 + D / 300, 2.8, 6.5);
    // (As high over whichever end is higher, the further the higher, and well over where the canopy opens.)
    this.apex = Math.max(Math.max(from.y, to.y) + clamp(30 + 0.1 * D, 40, 160), to.y + low + 25);
    const open = (this.open = low + 0.12 * (this.apex - to.y - low));
    this.top = to.y + open;
    // How fast it is falling, and going on level, as the canopy opens (each the last of the arch's).
    const fall = (Throw.DROP * (this.apex - this.top)) / ((1 - Throw.APEX) * this.free);
    const k = Throw.KAPPA, onward = (k * Math.exp(-k)) / (1 - Math.exp(-k)) / this.free;
    // Under the canopy: its fall slowed to its sink, and slower still near the snow; its drift slowed, as far as it goes on for each
    // metre a second it had as the canopy opened.
    let h = open, v = fall, u = 1, x = 0;
    const dt = Throw.STEP;
    this.highs.push(h); this.drifts.push(0);
    while (h > 0 && this.highs.length < 240 * 30) {
      const want = h > 6 ? sink : 2.4 + (sink - 2.4) * (h / 6);
      v += (want - v) * (1 - Math.exp(-3.4 * dt));
      h -= v * dt; u *= Math.exp(-1.7 * dt); x += u * dt;
      this.highs.push(Math.max(0, h)); this.drifts.push(x);
    }
    this.chute = (this.highs.length - 1) * dt;
    this.total = this.free + this.chute;
    // (So far along the arch that what it drifts under the canopy brings it down where it is to: the arch's last speed on is its length
    // over so much, and the drift so much of that.)
    this.far = D / (1 + onward * x);
    const drift = this.far * onward;
    for (let i = 0; i < this.drifts.length; i++) this.drifts[i] *= drift;
  }

  /** Where it is `t` seconds after it was let go. */
  at(t: number, out = new Vector3()): Vector3 {
    if (t < this.free) {
      const s = clamp(t / this.free, 0, 1), k = Throw.KAPPA, a = Throw.APEX;
      const on = (1 - Math.exp(-k * s)) / (1 - Math.exp(-k));
      const y = s <= a ? this.from.y + (this.apex - this.from.y) * (1 - (1 - s / a) ** 2) : this.apex - (this.apex - this.top) * ((s - a) / (1 - a)) ** Throw.DROP;
      return out.copy(this.from).addScaledVector(this.dir, this.far * on).setY(y);
    }
    const f = clamp((t - this.free) / Throw.STEP, 0, this.highs.length - 1), i = Math.floor(f), j = Math.min(i + 1, this.highs.length - 1), w = f - i;
    const h = this.highs[i] + (this.highs[j] - this.highs[i]) * w, x = this.drifts[i] + (this.drifts[j] - this.drifts[i]) * w;
    return out.copy(this.from).addScaledVector(this.dir, this.far + x).setY(this.to.y + h);
  }

  /** How fast it is going, and which way, `t` seconds after it was let go. */
  velocity(t: number, out = new Vector3()): Vector3 {
    const e = 0.01, a = this.at(Math.max(0, t - e)), b = this.at(Math.min(this.total, t + e));
    return out.copy(b).sub(a).divideScalar(Math.max(1e-4, Math.min(this.total, t + e) - Math.max(0, t - e)));
  }
}
