/**
 * The run's end, ridden, the other way (asked: "another alternative could be hurricane / whirlwind starting to build up as the player
 * approaches the end and it grows to such a strong tornado that it throws the player back to beginning (And then the parachute
 * landing)"): the whirlwind, made here in code. A funnel narrow at the snow and opening up into a dark cloud that turns over it, its
 * walls two sheets of streaked cloud going round; snow drawn in to it along the snow from all about, thrown up in a churning skirt
 * where it touches down and carried round and up its walls; and bits of ice whirled about it. Weak, it is a little whirl of snow a few
 * metres high; full strength, a funnel some ninety metres high under a cloud a quarter of a kilometre across. The page says where it
 * touches down, how strong it is, and what it takes up (`slope.ts`); the throw and the parachute are the arm's (`slopeArm.ts`).
 */
import {
  BufferAttribute, BufferGeometry, type Camera, CanvasTexture, CircleGeometry, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh,
  Matrix4, Mesh, PlaneGeometry, Quaternion, RepeatWrapping, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial } from 'three/webgpu';
import { abs, attribute, float, length, mix, normalView, smoothstep, texture, uniform, uv, vec2, vec3 } from 'three/tsl';
import { Rng } from '../src/core/rng';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const TURN = 2 * Math.PI, FACING = new Vector3(0, 0, 1);

/** A canvas `size` across, and its drawing. */
const canvasOf = (size: number) => { const c = document.createElement('canvas'); c.width = c.height = size; return { c, g: c.getContext('2d')! }; };
/**
 * A soft blot of white on a tile `size` across, `r` high and `wide` times as wide, tilted by `tilt`; on a tile that repeats (`wrap`), drawn
 * again across each edge it crosses, so that the tile shows no seams.
 */
const blot = (g: CanvasRenderingContext2D, size: number, x: number, y: number, r: number, alpha: number, wide = 1, tilt = 0, wrap = true) => {
  const shifts = wrap ? [-size, 0, size] : [0];
  for (const ox of shifts) for (const oy of shifts) {
    const cx = x + ox, cy = y + oy, reach = r * wide;
    if (cx + reach < 0 || cx - reach > size || cy + reach < 0 || cy - reach > size) continue;
    g.save();
    g.translate(cx, cy); g.rotate(tilt); g.scale(wide, 1);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(-r, -r, 2 * r, 2 * r);
    g.restore();
  }
};

/**
 * What each bit about it is doing: snow going up the funnel's wall; churned in the skirt; drawn in along the snow; ice whirled round;
 * and cloud turning about the funnel's top, the bulk of the cloud over it.
 */
const WALL = 0, SKIRT = 1, INFLOW = 2, ICE = 3, CLOUD = 4;
const COUNTS = [260, 150, 170, 120, 90];
/** How thick each kind's puffs are: the wall's thin, so that together they make a column and not a heap of balls. */
const THICK = [0.55, 0.9, 0.8, 1, 0.9];
type Bit = { kind: number; a: number; h: number; r: number; w: number; top: number; size: number; life: number; age: number; roll: number; spin: number; shade: number; phase: number };

/**
 * The whirlwind: where it touches down (`base`, on the snow) and how strong it is (`strength`, 0 a breath of wind to 1), set by the page;
 * the rest, its funnel's lean and snaking, its cloud's turning and the snow it carries, it works out for itself as it is stepped. It
 * turns the way a storm does in the north, anticlockwise seen from above.
 */
export class Tornado {
  readonly group = new Group();
  readonly base = new Vector3();
  strength = 0;
  private readonly was = new Vector3();
  private readonly lean = new Vector3();
  private t = 0;
  private readonly shells: { mesh: Mesh; pos: Float32Array; size: number; at: number; rate: number; turn: { value: number }; rise: { value: number } }[] = [];
  private readonly clouds: { mesh: Mesh; size: number; below: number; rate: number; turn: number }[] = [];
  private readonly puffs: InstancedMesh;
  private readonly looks: InstancedBufferAttribute;
  private readonly bits: Bit[] = [];
  private readonly rng = new Rng('whirlwind snow');
  private readonly uShell = uniform(0);
  private readonly uCloud = uniform(0);
  private static readonly AROUND = 40;
  private static readonly UP = 26;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly roll = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly size = new Vector3();
  private readonly hidden = new Matrix4().makeScale(0, 0, 0);

  constructor() {
    // The funnel's walls: streaks of cloud drawn out round it, a little slanted, so that going round and rising they wind up it.
    const streaks = (() => {
      const { c, g } = canvasOf(256), rng = new Rng('whirlwind streaks');
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 60; i++) blot(g, 256, rng.range(0, 256), rng.range(0, 256), rng.range(12, 30), rng.range(0.08, 0.16), rng.range(1.5, 3), -0.2);
      for (let i = 0; i < 170; i++) blot(g, 256, rng.range(0, 256), rng.range(0, 256), rng.range(3, 11), rng.range(0.18, 0.42), rng.range(3, 9), -0.22);
      // (Stretched to its full range, the thinnest of it nothing and the thickest solid: drawn as it was, the thickest was faint.)
      const img = g.getImageData(0, 0, 256, 256), d = img.data;
      let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { lo = Math.min(lo, d[i]); hi = Math.max(hi, d[i]); }
      for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = ((d[i] - lo) / Math.max(1, hi - lo)) * 255;
      g.putImageData(img, 0, 0);
      const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping;
      return t;
    })();
    const sheet = (dark: number, most: number) => {
      const turn = uniform(0), rise = uniform(0), paint = new MeshLambertNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
      const v = uv().y, streak = texture(streaks, uv().mul(vec2(3, 1.5)).sub(vec2(turn, rise))).r;
      // (White with snow low down, where it is thrown up into it; grey cloud higher, darker as it goes up into the cloud over it: a white
      // funnel was lost against the sky.)
      paint.colorNode = mix(vec3(0.9, 0.92, 0.96), vec3(0.46, 0.49, 0.55).mul(dark), smoothstep(0.05, 0.5, v));
      // (A veil all round, thicker in its streaks; and thicker toward its edges as seen, where the eye looks through more of it.)
      const edge = float(1).sub(abs(normalView.z)).mul(0.5).add(0.6);
      paint.opacityNode = smoothstep(0.1, 0.65, streak).mul(0.7).add(0.3).mul(edge).mul(smoothstep(0, 0.07, v)).mul(float(1).sub(smoothstep(0.82, 1, v))).mul(this.uShell).mul(most);
      return { paint, turn, rise };
    };
    // (Two sheets, one in the other: the inner darker and thicker, going round faster.)
    for (const [size, dark, most, at, rate] of [[0.72, 0.85, 0.95, 0.2, 1], [1, 1, 0.6, 0.45, 0.8]]) {
      const { AROUND: A, UP: U } = Tornado, pos = new Float32Array(U * (A + 1) * 3), uvs = new Float32Array(U * (A + 1) * 2), index: number[] = [];
      for (let j = 0; j < U; j++) for (let i = 0; i <= A; i++) { const k = j * (A + 1) + i; uvs[2 * k] = i / A; uvs[2 * k + 1] = j / (U - 1); }
      for (let j = 0; j < U - 1; j++) for (let i = 0; i < A; i++) { const a = j * (A + 1) + i, b = a + A + 1; index.push(a, b, a + 1, a + 1, b, b + 1); }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3));
      g.setAttribute('uv', new BufferAttribute(uvs, 2));
      g.setIndex(index);
      const { paint, turn, rise } = sheet(dark, most), mesh = new Mesh(g, paint);
      mesh.frustumCulled = false; mesh.renderOrder = 1;
      this.shells.push({ mesh, pos, size, at, rate, turn, rise });
      this.group.add(mesh);
    }

    // The cloud over it, turning: arms of cloud wound in to the funnel's top. (Two sheets: one wide and slow, one under it, smaller and quicker.)
    const swirl = (() => {
      const { c, g } = canvasOf(256), rng = new Rng('whirlwind cloud');
      for (let arm = 0; arm < 5; arm++) {
        for (let k = 0; k < 70; k++) {
          const r = 8 + k * 1.7, a = (arm * TURN) / 5 - k * 0.075;
          blot(g, 256, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 4 + r * 0.2, rng.range(0.1, 0.22), 1, 0, false);
        }
      }
      for (let i = 0; i < 110; i++) { const r = Math.sqrt(rng.range(0, 1)) * 120, a = rng.range(0, TURN); blot(g, 256, 128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rng.range(8, 26), rng.range(0.06, 0.14), 1, 0, false); }
      return new CanvasTexture(c);
    })();
    const cloudPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide });
    cloudPaint.colorNode = vec3(0.3, 0.32, 0.37);
    cloudPaint.opacityNode = smoothstep(0.05, 0.45, texture(swirl, uv()).r).mul(float(1).sub(smoothstep(0.5, 1, length(uv().sub(0.5)).mul(2)))).mul(this.uCloud);
    for (const [size, below, rate] of [[1, -3, 1], [0.38, 6, 2.6]]) {
      const mesh = new Mesh(new CircleGeometry(1, 48), cloudPaint);
      mesh.frustumCulled = false;
      this.clouds.push({ mesh, size, below, rate, turn: 0 });
      this.group.add(mesh);
    }

    // The snow it carries: puffs, each a picture of a soft blot turned to the eye, faintly lumpy, its own shade and how much of it shows.
    // (Soft all the way to its edge: puffs of a few dense blots, as the skis throw up, looked like balls of cotton this big.)
    const puffMap = (() => {
      const { c, g } = canvasOf(64), rng = new Rng('whirlwind puff');
      blot(g, 64, 32, 32, 31, 0.5, 1, 0, false);
      for (let i = 0; i < 6; i++) blot(g, 64, 32 + rng.range(-10, 10), 32 + rng.range(-10, 10), rng.range(8, 16), rng.range(0.12, 0.25), 1, 0, false);
      return new CanvasTexture(c);
    })();
    const n = COUNTS.reduce((a, b) => a + b, 0), shape = new PlaneGeometry(1, 1);
    this.looks = new InstancedBufferAttribute(new Float32Array(n * 2), 2);
    shape.setAttribute('aLook', this.looks);
    const puffPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const look = attribute('aLook', 'vec2');
    puffPaint.colorNode = vec3(0.97, 0.99, 1.04).mul(look.y);
    puffPaint.opacityNode = texture(puffMap, uv()).a.mul(look.x).mul(0.6);
    this.puffs = new InstancedMesh(shape, puffPaint, n);
    this.puffs.frustumCulled = false; this.puffs.renderOrder = 3;
    this.group.add(this.puffs);
    COUNTS.forEach((count, kind) => { for (let i = 0; i < count; i++) this.bits.push({ kind, a: 0, h: 0, r: 0, w: 0, top: 0, size: 0, life: 0, age: 0, roll: 0, spin: 0, shade: 0, phase: 0 }); });
    this.group.visible = false;
    this.group.name = 'whirlwind';
  }

  /** How high its funnel reaches, up into its cloud. */
  height() { return 10 + 80 * this.strength; }
  /** How wide its funnel is `h` metres up: narrow at the snow, opening out into the cloud. */
  radiusAt(h: number) { const s = this.strength, lo = 0.8 + 5.2 * s, hi = 2 + 26 * s; return lo + (hi - lo) * clamp(h / this.height(), 0, 1) ** 2.4; }
  /** Where its axis is `h` metres up: leaning back from the way it goes, and snaking. */
  axisAt(h: number, out = new Vector3()) {
    const k = clamp(h / this.height(), 0, 1), snake = (1 + 5 * this.strength) * k;
    return out.copy(this.base).addScaledVector(this.lean, k ** 1.6)
      .add(this.s.set(Math.sin(0.09 * h + 0.7 * this.t) * snake, 0, Math.cos(0.07 * h + 0.5 * this.t) * snake)).setY(this.base.y + h);
  }
  /** How fast the wind goes round `r` metres from its axis, `h` metres up: fastest at the funnel's wall, slower in it and outside it. */
  windAt(r: number, h: number) { const rc = this.radiusAt(h), most = 3 + 27 * this.strength; return r <= rc ? (most * r) / rc : most * (rc / r) ** 0.6; }
  /** The point `r` metres out from its axis, `h` metres up, `a` radians round the way it turns. */
  about(h: number, a: number, r: number, out = new Vector3()) { return this.axisAt(h, out).add(this.s.set(Math.cos(a) * r, 0, -Math.sin(a) * r)); }
  /** Which way, level, the wind carries what is `a` radians round. */
  round(a: number, out = new Vector3()) { return out.set(-Math.sin(a), 0, -Math.cos(a)); }

  /** Set down at `at`: where it is, as it was going; or, not there before, there as it forms, with nothing yet drawn into it. */
  place(at: Vector3) {
    const fresh = !this.group.visible;
    this.base.copy(at); this.was.copy(at);
    if (fresh) { this.lean.set(0, 0, 0); for (const b of this.bits) this.spawn(b, true); }
  }
  hide() { this.strength = 0; this.group.visible = false; }

  /** A bit of snow begun again, where its kind begins (or, `anywhere`, anywhere along its way: as it forms, not all coming at once). */
  private spawn(b: Bit, anywhere: boolean) {
    const rng = this.rng, s = this.strength;
    b.a = rng.range(0, TURN); b.roll = rng.range(0, TURN); b.spin = rng.range(-0.8, 0.8); b.age = 0;
    if (b.kind === WALL) {
      b.h = anywhere ? rng.range(0, this.height()) : rng.range(-0.5, 1.5); b.r = rng.range(0.8, 1.25); b.w = rng.range(0.7, 1.3); b.size = rng.range(3.5, 7); b.shade = rng.range(0.84, 1);
    } else if (b.kind === SKIRT) {
      b.h = rng.range(0, 1.2); b.r = rng.range(1.05, 2.3); b.w = rng.range(0.8, 2.6); b.life = rng.range(1.6, 3.4); b.size = rng.range(2.2, 5.4); b.shade = rng.range(0.92, 1);
      if (anywhere) b.age = rng.range(0, b.life);
    } else if (b.kind === INFLOW) {
      b.h = rng.range(0.15, 1.1); b.r = this.radiusAt(0) * 1.3 + rng.range(anywhere ? 0 : 8, 34) * (0.4 + 0.6 * s); b.w = rng.range(0.7, 1.3); b.size = rng.range(0.7, 2); b.shade = 1;
    } else if (b.kind === ICE) {
      b.r = rng.range(1, 2.2); b.top = rng.range(0.12, 0.7); b.phase = rng.range(0, TURN); b.w = rng.range(0.25, 0.6); b.size = rng.range(0.18, 0.55); b.shade = rng.range(0.22, 0.42);
    } else {
      // (About the funnel's top, a little under it and over it, out to four times its width there.)
      b.h = rng.range(-4, 9); b.r = rng.range(0.5, 4.2); b.size = rng.range(14, 32); b.shade = rng.range(0.26, 0.4);
    }
  }

  /**
   * A step on (`dt`; none while it is held still, though it is still turned to the eye): its funnel leaning back from the way it goes
   * and snaking, its sheets and its cloud going round, the snow it carries carried round and up, each bit turned to `eye`. Near the snow
   * the snow it carries keeps over the snow, whose height is `ground`.
   */
  step(dt: number, eye: Camera, ground: (x: number, z: number) => number) {
    const s = this.strength;
    this.group.visible = s > 0.004;
    if (!this.group.visible) return;
    this.t += dt;
    // (Its top dragged behind it as it goes, as a funnel trails back from its foot: but not by its being set down somewhere else.)
    if (dt > 0) {
      const v = this.p.copy(this.base).sub(this.was).setY(0).divideScalar(dt);
      if (v.length() < 40) { const want = v.multiplyScalar(-1.4); if (want.length() > 24) want.setLength(24); this.lean.lerp(want, 1 - Math.exp(-0.8 * dt)); }
    }
    this.was.copy(this.base);
    const H = this.height(), show = (from: number, over: number) => smooth((s - from) / over);
    this.uShell.value = show(0.05, 0.35);
    this.uCloud.value = show(0.25, 0.45);

    const { AROUND: A, UP: U } = Tornado, at = this.p;
    for (const sh of this.shells) {
      const pos = sh.pos;
      for (let j = 0; j < U; j++) {
        // (Its rings closer together low down, where it narrows most quickly; the lowest a little under the snow.)
        const h = -1.5 + (H + 1.5) * (j / (U - 1)) ** 1.25, r = this.radiusAt(Math.max(0, h)) * sh.size;
        this.axisAt(Math.max(0, h), at).setY(this.base.y + h);
        for (let i = 0; i <= A; i++) {
          const a = (i / A) * TURN, k = (j * (A + 1) + i) * 3;
          pos[k] = at.x + Math.cos(a) * r; pos[k + 1] = at.y; pos[k + 2] = at.z - Math.sin(a) * r;
        }
      }
      const g = sh.mesh.geometry;
      g.getAttribute('position').needsUpdate = true;
      g.computeVertexNormals();
      // (Round at the wind's pace at its own height, three repeats of its streaks to a turn; and drawn up it.)
      const h = H * sh.at, rc = this.radiusAt(h);
      sh.turn.value = (sh.turn.value + ((this.windAt(rc, h) / rc / TURN) * 3 * sh.rate * dt)) % 1;
      sh.rise.value = (sh.rise.value + (0.04 + 0.12 * s) * dt) % 1;
    }
    this.axisAt(H, at);
    for (const cl of this.clouds) {
      const r = (30 + 120 * s) * cl.size;
      cl.turn += (0.12 + 0.2 * s) * cl.rate * dt;
      cl.mesh.position.set(at.x, this.base.y + H - cl.below, at.z);
      cl.mesh.rotation.set(Math.PI / 2, 0, -cl.turn);
      cl.mesh.scale.set(r, r, 1);
    }

    // The snow it carries, each bit a step on by its kind; carried round as fast as the wind goes where it is; turned to the eye.
    const rc0 = this.radiusAt(0), shown = [show(0.08, 0.3), show(0.04, 0.22), show(0, 0.12), show(0.4, 0.3), show(0.25, 0.4)];
    this.bits.forEach((b, i) => {
      let r: number, fade: number;
      if (b.kind === WALL) {
        b.h += b.w * (2 + 10 * s) * dt;
        if (b.h > H) this.spawn(b, false);
        r = this.radiusAt(Math.max(0, b.h)) * b.r;
        fade = smooth(b.h / 3) * (1 - smooth((b.h - 0.8 * H) / (0.2 * H)));
      } else if (b.kind === SKIRT) {
        b.age += dt; b.h += b.w * (0.3 + s) * dt;
        if (b.age > b.life) this.spawn(b, false);
        const k = b.age / b.life;
        r = rc0 * b.r * (1 + 0.3 * k);
        fade = smooth(b.age / 0.4) * (1 - k) ** 1.2;
      } else if (b.kind === INFLOW) {
        b.age += dt; b.r -= b.w * (2.5 + 9 * s) * dt;
        if (b.r < rc0 * 1.25) this.spawn(b, false);
        r = b.r;
        fade = smooth(b.age / 0.6) * smooth((b.r - rc0 * 1.25) / 3);
      } else if (b.kind === ICE) {
        b.phase += b.w * dt;
        b.h = H * b.top * (0.55 + 0.45 * Math.sin(b.phase));
        r = this.radiusAt(b.h) * b.r;
        fade = 1;
      } else {
        r = this.radiusAt(H) * b.r;
        fade = 1;
      }
      const h = b.kind === CLOUD ? H + b.h * (0.4 + 0.6 * s) : Math.max(0, b.h), seen = fade * shown[b.kind];
      b.a += (this.windAt(r, h) / Math.max(r, 0.5)) * dt;
      if (seen < 0.003) { this.puffs.setMatrixAt(i, this.hidden); this.looks.setXY(i, 0, 0); return; }
      this.axisAt(h, at);
      const x = at.x + Math.cos(b.a) * r, z = at.z - Math.sin(b.a) * r;
      // (Low down, over the snow where it is rather than level with the funnel's foot: on a slope, the skirt and the snow drawn in to it
      // keep to the snow.)
      const y = h < 10 ? at.y + (ground(x, z) - this.base.y) * (1 - smooth(h / 10)) : at.y;
      const size = b.size * (b.kind === CLOUD ? 0.2 + 0.8 * s : (0.35 + 0.65 * s) * (b.kind === WALL ? 0.55 + 0.09 * r : 1));
      this.q.copy(eye.quaternion).multiply(this.roll.setFromAxisAngle(FACING, b.roll + this.t * b.spin));
      this.puffs.setMatrixAt(i, this.m4.compose(this.s.set(x, y, z), this.q, this.size.setScalar(size)));
      this.looks.setXY(i, seen * THICK[b.kind], b.kind === WALL ? b.shade * (1 - 0.45 * (h / H)) : b.shade);
    });
    this.puffs.instanceMatrix.needsUpdate = true;
    this.looks.needsUpdate = true;
  }
}
