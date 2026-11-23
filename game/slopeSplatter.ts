/**
 * Blood on the snow (asked: "the goblins spatter a LOT of goblin blood on the snow when hit"; then, of orcs, "spill red blood"): red. Struck,
 * an orc throws a burst of drops out along the way the round went and up, which fall as anything thrown does and lie where they
 * strike the snow, each a splash, drawn out along the way it was going, the faster the longer; and as it falls a pool spreads under it.
 * The splashes lie on the snow as it slopes, and stay until the run is begun again; the oldest give way to the newest when there are
 * very many.
 */
import { CanvasTexture, Color, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, PlaneGeometry, Quaternion, type Scene, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, texture, uv } from 'three/tsl';
import type { Rng } from '../src/core/rng';

/** A drop in flight: where, how fast, how big; and how long it has flown. */
interface Drop { p: Vector3; v: Vector3; size: number; age: number }
/** A pool spreading: where it lies, which way is up there, how big it will be and how far it has spread. */
interface Pool { at: Vector3; up: Vector3; size: number; t: number; slot: number; turn: number }

const UP = new Vector3(0, 1, 0);

export class Splatter {
  private readonly drops: Drop[] = [];
  private readonly pools: Pool[] = [];
  private readonly flying: InstancedMesh;
  private readonly lying: InstancedMesh;
  private readonly tint: Float32Array;
  private next = 0;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  constructor(scene: Scene, private readonly rng: Rng, private readonly ground: (x: number, z: number) => number, private readonly normalAt: (x: number, z: number) => Vector3,
    private readonly most = { drops: 700, marks: 1400 }) {
    // The drops: small, dark and wet.
    this.flying = new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ color: new Color(0.32, 0.012, 0.018), roughness: 0.2 }), most.drops);
    this.flying.frustumCulled = false;
    this.flying.count = 0;
    scene.add(this.flying);
    // The splashes: a blot painted once, its edge ragged and with droplets about it, laid flat on the snow and tinted each its own.
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const blob = (x: number, y: number, r: number) => { g.beginPath(); for (let a = 0; a <= 24; a++) { const th = (a / 24) * Math.PI * 2, k = r * (0.78 + 0.32 * this.rng.next()); g.lineTo(x + Math.cos(th) * k, y + Math.sin(th) * k); } g.fill(); };
    g.fillStyle = 'rgba(255,255,255,1)';
    blob(64, 64, 34);
    for (let i = 0; i < 14; i++) { const th = this.rng.range(0, Math.PI * 2), d = this.rng.range(36, 58); blob(64 + Math.cos(th) * d, 64 + Math.sin(th) * d, this.rng.range(2, 7)); }
    const splash = new CanvasTexture(c);
    const paint = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shade = attribute('aTint', 'vec3');
    paint.colorNode = shade;
    paint.opacityNode = texture(splash, uv()).a.mul(0.95);
    this.lying = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), paint, most.marks);
    this.tint = new Float32Array(most.marks * 3);
    this.lying.geometry.setAttribute('aTint', new InstancedBufferAttribute(this.tint, 3));
    this.lying.frustumCulled = false;
    this.lying.count = 0;
    this.lying.renderOrder = 1;
    scene.add(this.lying);
  }

  /** An orc struck at `at`, by something going along `dir`: a burst of drops, out along it, to every side and up. */
  spray(at: Vector3, dir: Vector3, many: number): void {
    const d = dir.clone().setY(0).normalize();
    for (let i = 0; i < many; i++) {
      if (this.drops.length >= this.most.drops) this.drops.shift();
      const v = d.clone().multiplyScalar(this.rng.range(0.5, 5.5)).add(new Vector3(this.rng.range(-2.2, 2.2), this.rng.range(0.6, 4.2), this.rng.range(-2.2, 2.2)));
      this.drops.push({ p: at.clone().add(new Vector3(this.rng.range(-0.12, 0.12), this.rng.range(-0.1, 0.15), this.rng.range(-0.12, 0.12))), v, size: this.rng.range(0.018, 0.05), age: 0 });
    }
    // (And a splash on the snow under where it was struck, at once.)
    const y = this.ground(at.x, at.z);
    this.mark(new Vector3(at.x, y, at.z), this.rng.range(0.5, 0.9), d, 1.2);
  }

  /** A pool spreading under an orc fallen at `at`, over a second or two. */
  pool(at: Vector3, size: number): void {
    const p = new Vector3(at.x, this.ground(at.x, at.z), at.z);
    this.pools.push({ at: p, up: this.normalAt(p.x, p.z), size, t: 0, slot: this.claim([0.26, 0.008, 0.014]), turn: this.rng.range(0, Math.PI * 2) });
  }

  /** A frame on: drops flown and fallen, each where it falls a splash; pools spread. */
  step(dt: number): void {
    if (dt > 0) {
      for (let i = 0; i < this.drops.length; i++) {
        const b = this.drops[i];
        b.age += dt; b.v.y -= 9.8 * dt; b.p.addScaledVector(b.v, dt);
        const y = this.ground(b.p.x, b.p.z);
        if (b.p.y > y && b.age < 4) continue;
        // (Where it strikes: a splash its own size and more, drawn out along the way it was going, the faster the longer.)
        const speed = Math.hypot(b.v.x, b.v.z);
        this.mark(new Vector3(b.p.x, y, b.p.z), b.size * this.rng.range(4, 7), new Vector3(b.v.x, 0, b.v.z).normalize(), 1 + Math.min(2.5, speed * 0.35));
        this.drops.splice(i--, 1);
      }
      for (let i = 0; i < this.pools.length; i++) {
        const p = this.pools[i];
        p.t = Math.min(1, p.t + dt / 1.6);
        this.lay(p.slot, p.at, p.up, p.turn, p.size * Math.sqrt(p.t), 1);
        if (p.t >= 1) this.pools.splice(i--, 1);
      }
      // (Sent to the graphics card only when a mark was laid or a drop is in the air: sent every frame the gun was carried, with no
      // blood anywhere, they were some three hundred kilobytes a frame.)
      if (this.laid) {
        this.laid = false;
        this.lying.instanceMatrix.needsUpdate = true;
        (this.lying.geometry.getAttribute('aTint') as InstancedBufferAttribute).needsUpdate = true;
      }
    }
    if (!this.drops.length && !this.flying.count) return;
    this.flying.count = this.drops.length;
    this.drops.forEach((b, k) => this.flying.setMatrixAt(k, this.m.compose(b.p, this.q.identity(), this.s.setScalar(b.size))));
    this.flying.instanceMatrix.needsUpdate = true;
  }

  /** Whether a mark has been laid, or made larger, since the marks were last sent to the graphics card. */
  private laid = false;
  /** Every drop and splash cleared away (a new run). */
  clear(): void { this.drops.length = 0; this.pools.length = 0; this.next = 0; this.flying.count = 0; this.lying.count = 0; }

  /** The next splash's place, the oldest given up when there are as many as there may be, with its tint (a little darker or lighter). */
  private claim(base: [number, number, number]): number {
    const slot = this.next++ % this.most.marks, k = this.rng.range(0.75, 1.2);
    this.laid = true;
    this.tint.set([base[0] * k, base[1] * k, base[2] * k], slot * 3);
    this.lying.count = Math.min(this.most.marks, Math.max(this.lying.count, slot + 1));
    return slot;
  }
  /** A splash at `at` on the snow, `size` across, drawn out by `long` along `way`. */
  private mark(at: Vector3, size: number, way: Vector3, long: number): void {
    const slot = this.claim([0.42, 0.018, 0.024]), up = this.normalAt(at.x, at.z);
    const turn = Number.isFinite(way.x) && way.lengthSq() > 0.01 ? Math.atan2(way.x, way.z) : this.rng.range(0, Math.PI * 2);
    this.lay(slot, at, up, turn, size, long);
  }
  /** Lays a splash in its place: flat on the snow there (`up`), turned by `turn`, `size` across and `long` times as long. */
  private lay(slot: number, at: Vector3, up: Vector3, turn: number, size: number, long: number): void {
    this.laid = true;
    this.q.setFromUnitVectors(UP, up).multiply(new Quaternion().setFromAxisAngle(UP, turn));
    this.lying.setMatrixAt(slot, this.m.compose(at.clone().addScaledVector(up, 0.012), this.q, this.s.set(size, 1, size * long)));
  }
}
