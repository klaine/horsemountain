/**
 * The run's end, a third way (asked: "add a third similarly back to start causing surprising effect: A huge explosion that shatters the
 * ground happens suddenly near the player and sends player to the same transition"): the blast, made here in code. Before it, cracks
 * running out through the snow from where it is to go off, glowing as from a fire under it; then its flash, a fireball rolling up into
 * a column of black smoke, a shock going out through the air, the snow thrown out along the ground in a ring, and the ground itself
 * broken into slabs of snow, ice and rock flung out and falling about; and after it, the crater, scorched, its cracks dark and still
 * glowing. The page says where and when, and what it does to the skier and the view (`slope.ts`).
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, type Camera, CanvasTexture, Color, DodecahedronGeometry, Group, InstancedBufferAttribute,
  InstancedMesh, Matrix4, Mesh, PlaneGeometry, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial } from 'three/webgpu';
import { abs, attribute, float, length, max, normalView, pow, smoothstep, texture, uniform, uv, vec3 } from 'three/tsl';
import type { Rng } from '../src/core/rng';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const TURN = 2 * Math.PI, G = 9.81, UP = new Vector3(0, 1, 0), FACING = new Vector3(0, 0, 1);
const canvasOf = (size: number) => { const c = document.createElement('canvas'); c.width = c.height = size; return { c, g: c.getContext('2d')! }; };

/** How far out from where it goes off its cracks and its scorch reach, in metres. */
const REACH = 16;
/** How many slabs the ground breaks into; puffs of fire, and of smoke and snow. */
const SLABS = 140, FIRE = 90, SMOKE = 230;

type Slab = { p: Vector3; v: Vector3; axis: Vector3; spin: number; turn: number; size: Vector3; still: boolean };
type Puff = { p: Vector3; v: Vector3; wait: number; age: number; life: number; size: number; grow: number; kind: number; roll: number };
/** What each smoke-sheet puff is: smoke rising from the fireball; snow thrown out along the ground. */
const SOOT = 0, DUST = 1;
/** The fire white-hot as it bursts out, orange, a dull red as it burns out; the smoke as it leaves the fire, black, and greying as it spreads. */
const WHITE_HOT = new Color(5, 3.8, 2), ORANGE = new Color(3.2, 1.1, 0.2), DULL = new Color(0.9, 0.18, 0.04);
const FIERY = new Color(0.9, 0.35, 0.1), SOOTY = new Color(0.12, 0.1, 0.09), GREY = new Color(0.4, 0.39, 0.38), SNOW = new Color(0.92, 0.94, 0.97);

/** A soft blot of white, faintly lumpy: a puff of fire or smoke seen anywhere. */
const puffMap = (rng: Rng) => {
  const { c, g } = canvasOf(64);
  const blot = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  };
  blot(32, 32, 31, 0.55);
  for (let i = 0; i < 7; i++) blot(32 + rng.range(-11, 11), 32 + rng.range(-11, 11), rng.range(7, 15), rng.range(0.15, 0.3));
  return new CanvasTexture(c);
};

/**
 * The ground about it from above, `REACH` metres each way: its cracks in red, running out from the middle and branching, wider near
 * it; its scorch in green, darkest in the middle and ragged at its edge.
 */
const groundMap = (rng: Rng) => {
  const S = 512, { c, g } = canvasOf(S), mid = S / 2;
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  const scorch = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(0,255,0,${a})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  };
  scorch(mid, mid, S * 0.3, 1);
  for (let i = 0; i < 26; i++) { const a = rng.range(0, TURN), r = rng.range(0.05, 0.3) * S; scorch(mid + Math.cos(a) * r, mid + Math.sin(a) * r, rng.range(0.05, 0.12) * S, rng.range(0.25, 0.5)); }
  g.strokeStyle = 'rgb(255,0,0)'; g.lineCap = 'round'; g.lineJoin = 'round';
  const crack = (x0: number, y0: number, a0: number, w0: number, n: number) => {
    let x = x0, y = y0, a = a0, w = w0;
    for (let i = 0; i < n; i++) {
      const step = rng.range(9, 20), nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      x = nx; y = ny; a += rng.range(-0.45, 0.45); w = Math.max(1, w * 0.92);
      if (w > 1.5 && rng.chance(0.14)) crack(x, y, a + rng.pick([-1, 1]) * rng.range(0.5, 1.1), w * 0.6, Math.floor((n - i) * 0.6));
      if (Math.hypot(x - mid, y - mid) > S * 0.47) break;
    }
  };
  for (let k = 0; k < 11; k++) crack(mid, mid, (k * TURN) / 11 + rng.range(-0.2, 0.2), rng.range(7, 11), 30);
  return new CanvasTexture(c);
};

export class Blast {
  readonly group = new Group();
  /** Where it goes off, on the snow. */
  readonly at = new Vector3();
  /** How long since it went off (none yet, below nothing); and since it was laid. */
  private age = -1;
  private t = 0;
  private rng: Rng | null = null;
  private readonly ground: Mesh;
  private readonly glow: Mesh;
  private readonly groundPos: Float32Array;
  private readonly uReveal = uniform(0);
  private readonly uGlow = uniform(0);
  private readonly uScorch = uniform(0);
  private readonly uFlash = uniform(0);
  private readonly uShock = uniform(0);
  private readonly slabs: InstancedMesh;
  private readonly slab: Slab[] = [];
  private readonly fire: InstancedMesh;
  private readonly smoke: InstancedMesh;
  private readonly fireLook: InstancedBufferAttribute;
  private readonly smokeLook: InstancedBufferAttribute;
  private readonly firePuffs: Puff[] = [];
  private readonly smokePuffs: Puff[] = [];
  private readonly flashMesh: Mesh;
  private readonly shock: Mesh;
  private static readonly GRID = 40;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly roll = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly hidden = new Matrix4().makeScale(0, 0, 0);
  private readonly colour = new Color();

  constructor(rng: Rng) {
    // The ground about it: one sheet of the land's shape, laid over the snow where it is to go off; drawn twice, the scorch dark over
    // the snow, and the cracks' glow added to it.
    const N = Blast.GRID, pos = (this.groundPos = new Float32Array((N + 1) * (N + 1) * 3)), uvs = new Float32Array((N + 1) * (N + 1) * 2), index: number[] = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const k = j * (N + 1) + i; uvs[2 * k] = i / N; uvs[2 * k + 1] = j / N; }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1; index.push(a, b, a + 1, a + 1, b, b + 1); }
    const sheet = new BufferGeometry();
    sheet.setAttribute('position', new BufferAttribute(pos, 3));
    sheet.setAttribute('uv', new BufferAttribute(uvs, 2));
    sheet.setIndex(index);
    const map = texture(groundMap(rng.fork('ground')), uv()), out = length(uv().sub(0.5)).mul(2);
    // (Its cracks shown as far out as they have run.)
    const cracks = map.r.mul(smoothstep(this.uReveal, this.uReveal.sub(0.08), out));
    const scorchPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    scorchPaint.colorNode = vec3(0.07, 0.06, 0.055);
    // (The cracks dark as soon as they open, so that their glow shows on white snow; the scorch once it has gone off.)
    scorchPaint.opacityNode = max(map.g.mul(0.92).mul(this.uScorch), cracks.mul(0.9));
    const glowPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
    glowPaint.colorNode = vec3(2.6, 0.75, 0.12).mul(cracks).mul(this.uGlow);
    this.ground = new Mesh(sheet, scorchPaint);
    this.glow = new Mesh(sheet, glowPaint);
    for (const m of [this.ground, this.glow]) { m.frustumCulled = false; m.renderOrder = 1; }

    // The ground broken: slabs, each its own size and colour (snow; ice; earth and rock from under it, nearer the middle), lit as the
    // land is, casting shadows.
    this.slabs = new InstancedMesh(new DodecahedronGeometry(1, 0), new MeshLambertNodeMaterial(), SLABS);
    this.slabs.castShadow = true; this.slabs.frustumCulled = false;
    for (let i = 0; i < SLABS; i++) {
      this.slab.push({ p: new Vector3(), v: new Vector3(), axis: new Vector3(0, 1, 0), spin: 0, turn: 0, size: new Vector3(), still: true });
      this.slabs.setColorAt(i, this.colour.set(0xffffff));
    }

    // Puffs of fire, added to the picture; of smoke and of snow, laid over it. Each its own colour and how much of it shows.
    const puffs = (n: number, add: boolean, tex: CanvasTexture) => {
      const shape = new PlaneGeometry(1, 1), look = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
      shape.setAttribute('aLook', look);
      const paint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, ...(add ? { blending: AdditiveBlending } : {}) });
      const l = attribute('aLook', 'vec4');
      paint.colorNode = l.xyz;
      paint.opacityNode = texture(tex, uv()).a.mul(l.w);
      const mesh = new InstancedMesh(shape, paint, n);
      mesh.frustumCulled = false; mesh.renderOrder = 3;
      return { mesh, look };
    };
    const tex = puffMap(rng.fork('puff'));
    // (The fire laid over the picture, not added to it: added, over snow lit by the sun it was white, not fire.)
    ({ mesh: this.fire, look: this.fireLook } = puffs(FIRE, false, tex));
    ({ mesh: this.smoke, look: this.smokeLook } = puffs(SMOKE, false, tex));
    // (The fire over its own smoke, which rises out of it.)
    this.fire.renderOrder = 4;
    const puff = (kind: number): Puff => ({ p: new Vector3(), v: new Vector3(), wait: 0, age: 0, life: 0, size: 0, grow: 0, kind, roll: 0 });
    for (let i = 0; i < FIRE; i++) this.firePuffs.push(puff(SOOT));
    for (let i = 0; i < SMOKE; i++) this.smokePuffs.push(puff(i < 60 ? DUST : SOOT));

    // Its flash, a light turned to the eye; and the shock going out through the air, seen at its edge.
    const flashMap = (() => {
      const { c, g } = canvasOf(128), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.25, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      return new CanvasTexture(c);
    })();
    const flashPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    flashPaint.colorNode = vec3(3, 2.4, 1.7).mul(this.uFlash);
    flashPaint.opacityNode = texture(flashMap, uv()).a;
    this.flashMesh = new Mesh(new PlaneGeometry(1, 1), flashPaint);
    const shockPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    shockPaint.colorNode = vec3(1, 0.95, 0.85).mul(pow(float(1).sub(abs(normalView.z)), 3)).mul(this.uShock);
    this.shock = new Mesh(new SphereGeometry(1, 32, 16), shockPaint);
    for (const m of [this.flashMesh, this.shock]) { m.frustumCulled = false; m.renderOrder = 4; }

    this.group.add(this.ground, this.glow, this.slabs, this.fire, this.smoke, this.flashMesh, this.shock);
    this.group.visible = false;
    this.group.name = 'blast';
  }

  /** How bright its flash is now, 0 to 1: what the page lights the scene up by. */
  get flash() { return this.age < 0 ? 0 : Math.exp(-this.age / 0.12); }
  /** Whether it has gone off. */
  get gone() { return this.age >= 0; }

  /** Laid at `at` on the snow, whose height is `ground`: its cracks not yet run out, nothing else yet. */
  lay(at: Vector3, ground: (x: number, z: number) => number, rng: Rng) {
    this.at.copy(at); this.rng = rng; this.age = -1; this.t = 0;
    const N = Blast.GRID, pos = this.groundPos;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = (j * (N + 1) + i) * 3, x = at.x + (i / N - 0.5) * 2 * REACH, z = at.z + (j / N - 0.5) * 2 * REACH;
      pos[k] = x; pos[k + 1] = ground(x, z) + 0.06; pos[k + 2] = z;
    }
    this.ground.geometry.getAttribute('position').needsUpdate = true;
    this.uReveal.value = 0; this.uGlow.value = 0; this.uScorch.value = 0; this.uFlash.value = 0; this.uShock.value = 0;
    for (const m of [this.slabs, this.fire, this.smoke]) for (let i = 0; i < m.count; i++) m.setMatrixAt(i, this.hidden);
    for (const m of [this.slabs, this.fire, this.smoke]) m.instanceMatrix.needsUpdate = true;
    this.slabs.visible = this.fire.visible = this.smoke.visible = this.flashMesh.visible = this.shock.visible = false;
    this.group.visible = true;
  }

  /** Its cracks run out as far as `k` of the way (0 to 1), glowing, flickering. */
  cracking(k: number) {
    this.uReveal.value = 0.04 + 0.96 * smooth(k);
    this.uGlow.value = k > 0 ? 0.8 + 0.35 * Math.sin(this.t * 23) * Math.sin(this.t * 7.3) : 0;
  }

  /** Gone off: the ground broken up and flung out, the fire and the smoke and the snow thrown, its flash and its shock. */
  boom() {
    const rng = this.rng!, X = this.at;
    this.age = 0;
    this.slabs.visible = this.fire.visible = this.smoke.visible = this.flashMesh.visible = this.shock.visible = true;
    this.uReveal.value = 1;
    this.slab.forEach((s, i) => {
      const r = Math.sqrt(rng.next()) * 9, a = rng.range(0, TURN), near = 1 - r / 9, big = rng.range(0.3, 1.7);
      s.p.set(X.x + Math.cos(a) * r, X.y + 0.2, X.z + Math.sin(a) * r);
      s.v.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rng.range(5, 20) * (0.6 + 0.4 * near)).addScaledVector(UP, rng.range(8, 28) * (0.6 + 0.6 * near));
      s.axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      s.spin = rng.range(2, 9); s.turn = rng.range(0, TURN); s.still = false;
      s.size.set(big, big * rng.range(0.2, 0.4), big * rng.range(0.6, 1));
      const kind = rng.next();
      this.slabs.setColorAt(i, kind < (near > 0.5 ? 0.6 : 0.25) ? this.colour.setRGB(0.26, 0.22, 0.19).multiplyScalar(rng.range(0.7, 1.2)) : kind < 0.8 ? this.colour.copy(SNOW) : this.colour.setRGB(0.72, 0.83, 0.94));
    });
    if (this.slabs.instanceColor) this.slabs.instanceColor.needsUpdate = true;
    for (const f of this.firePuffs) {
      const d = new Vector3(rng.range(-1, 1), rng.range(0.1, 1), rng.range(-1, 1)).normalize();
      f.p.copy(X).addScaledVector(d, rng.range(0, 2)).addScaledVector(UP, 1);
      f.v.copy(d).multiplyScalar(rng.range(8, 26)); f.wait = rng.range(0, 0.12); f.age = 0; f.life = rng.range(0.8, 1.7);
      f.size = rng.range(3, 6); f.grow = rng.range(2.5, 4); f.roll = rng.range(0, TURN);
    }
    for (const s of this.smokePuffs) {
      const a = rng.range(0, TURN), out = new Vector3(Math.cos(a), 0, Math.sin(a));
      s.age = 0; s.roll = rng.range(0, TURN);
      if (s.kind === DUST) {
        s.p.copy(X).addScaledVector(out, rng.range(2, 5)).addScaledVector(UP, 0.8);
        s.v.copy(out).multiplyScalar(rng.range(14, 32)).addScaledVector(UP, rng.range(1, 5));
        s.wait = rng.range(0, 0.1); s.life = rng.range(1.4, 3); s.size = rng.range(2.5, 4); s.grow = rng.range(2.5, 3.5);
      } else {
        s.p.copy(X).addScaledVector(out, rng.range(0, 3)).addScaledVector(UP, rng.range(1, 5));
        s.v.copy(out).multiplyScalar(rng.range(2, 8)).addScaledVector(UP, rng.range(5, 16));
        s.wait = rng.range(0.15, 0.7); s.life = rng.range(3.5, 7); s.size = rng.range(3, 5); s.grow = rng.range(3, 4.5);
      }
    }
  }

  /**
   * A step on (`dt`; none while held still, though still turned to `eye`): the cracks flickering; gone off, the slabs flying and
   * falling and coming to lie on the snow (whose height is `ground`), the fire rolling up and burning out into smoke, the smoke rising
   * and spreading, the snow along the ground slowed and settling, the flash and the shock gone, and the cracks' glow dying down.
   */
  step(dt: number, eye: Camera, ground: (x: number, z: number) => number) {
    if (!this.group.visible) return;
    this.t += dt;
    if (this.age < 0) return;
    this.age += dt;
    const age = this.age;
    this.uScorch.value = smooth(age / 0.15);
    this.uGlow.value = 1.6 * Math.exp(-age / 0.6) + 0.35 * Math.exp(-age / 12);
    // The flash, turned to the eye, as big as it is bright; the shock gone out to seventy metres in under half a second.
    this.uFlash.value = this.flash;
    this.flashMesh.visible = this.flash > 0.01;
    this.flashMesh.position.copy(this.at).addScaledVector(UP, 3);
    this.flashMesh.quaternion.copy(eye.quaternion);
    this.flashMesh.scale.setScalar(20 + 40 * this.flash);
    const shock = age / 0.45;
    this.shock.visible = shock < 1;
    this.shock.position.copy(this.at);
    this.shock.scale.setScalar(5 + 65 * smooth(shock));
    this.uShock.value = 0.8 * (1 - shock);

    this.slab.forEach((s, i) => {
      if (!s.still && dt > 0) {
        s.v.y -= G * dt; s.v.multiplyScalar(Math.exp(-0.15 * dt)); s.p.addScaledVector(s.v, dt); s.turn += s.spin * dt;
        const g = ground(s.p.x, s.p.z) + 0.3 * s.size.y;
        if (s.p.y < g && s.v.y < 0) {
          s.p.y = g;
          if (-s.v.y < 3) { s.still = true; s.v.set(0, 0, 0); } else { s.v.y *= -0.3; s.v.x *= 0.5; s.v.z *= 0.5; s.spin *= 0.5; }
        }
      }
      this.slabs.setMatrixAt(i, this.m4.compose(s.p, this.q.setFromAxisAngle(s.axis, s.turn), s.size));
    });
    this.slabs.instanceMatrix.needsUpdate = true;

    // (The fire white-hot as it bursts out, then orange, then a dull red as it burns out; the smoke black, greying as it spreads.)
    this.firePuffs.forEach((f, i) => {
      if (dt > 0) f.wait -= dt;
      if (f.wait > 0 || f.age >= f.life) { this.fire.setMatrixAt(i, this.hidden); this.fireLook.setXYZW(i, 0, 0, 0, 0); return; }
      f.age += dt;
      f.v.multiplyScalar(Math.exp(-2.5 * dt)); f.v.y += 6 * dt; f.p.addScaledVector(f.v, dt);
      const k = clamp(f.age / f.life, 0, 1), hot = this.colour.copy(WHITE_HOT).lerp(ORANGE, smooth(k / 0.4));
      if (k > 0.4) hot.lerp(DULL, smooth((k - 0.4) / 0.6));
      this.fire.setMatrixAt(i, this.billboard(f, eye, f.size * (1 + f.grow * Math.sqrt(k))));
      this.fireLook.setXYZW(i, hot.r, hot.g, hot.b, Math.min(1, 1.4 * (1 - k) ** 1.2));
    });
    this.smokePuffs.forEach((s, i) => {
      if (dt > 0) s.wait -= dt;
      if (s.wait > 0 || s.age >= s.life) { this.smoke.setMatrixAt(i, this.hidden); this.smokeLook.setXYZW(i, 0, 0, 0, 0); return; }
      s.age += dt;
      const k = clamp(s.age / s.life, 0, 1);
      let alpha: number;
      if (s.kind === DUST) {
        s.v.multiplyScalar(Math.exp(-2.2 * dt)); s.v.y -= 0.5 * dt; s.p.addScaledVector(s.v, dt);
        s.p.y = Math.max(s.p.y, ground(s.p.x, s.p.z) + 0.8);
        this.colour.copy(SNOW);
        alpha = smooth(s.age / 0.1) * (1 - k) ** 1.5 * 0.8;
      } else {
        s.v.x *= Math.exp(-1.2 * dt); s.v.z *= Math.exp(-1.2 * dt); s.v.y = Math.min(s.v.y + 2.5 * dt, 14) * Math.exp(-0.3 * dt); s.p.addScaledVector(s.v, dt);
        this.colour.copy(FIERY).lerp(SOOTY, smooth(s.age / 0.35)).lerp(GREY, smooth(k));
        alpha = smooth(s.age / 0.2) * (1 - k) ** 1.1 * 0.9;
      }
      this.smoke.setMatrixAt(i, this.billboard(s, eye, s.size * (1 + s.grow * Math.sqrt(k))));
      this.smokeLook.setXYZW(i, this.colour.r, this.colour.g, this.colour.b, alpha);
    });
    this.fire.instanceMatrix.needsUpdate = this.smoke.instanceMatrix.needsUpdate = true;
    this.fireLook.needsUpdate = this.smokeLook.needsUpdate = true;
  }

  /** A puff turned to the eye, turned about its own middle as it goes, `size` across. */
  private billboard(f: Puff, eye: Camera, size: number) {
    this.q.copy(eye.quaternion).multiply(this.roll.setFromAxisAngle(FACING, f.roll + f.age * 0.4));
    return this.m4.compose(f.p, this.q, this.p.setScalar(size));
  }

  hide() { this.group.visible = false; this.age = -1; }
}
