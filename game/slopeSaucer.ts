/**
 * The run's end, a fourth way (asked, after the arm, the whirlwind and the blast: "come up with two additional ones on top of these"):
 * a flying saucer, made here in code. A disc of metal eighteen metres across, a glass dome on it, a ring of lights about its rim
 * running round, and under it a glowing ring from which it shines its beam down: a cone of light, banded, the bands going up it, sparks
 * rising in it. The page says where it flies and how it is tipped, how far down its beam reaches and how brightly, and what the beam
 * takes up (`slope.ts`).
 */
import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, LatheGeometry, Matrix4, Mesh, MeshStandardMaterial,
  PlaneGeometry, Quaternion, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, type Camera,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, float, normalView, sin, smoothstep, texture, time, uniform, uv, vec3 } from 'three/tsl';
import { Rng } from '../src/core/rng';

const TURN = 2 * Math.PI, UP = new Vector3(0, 1, 0);

/** The saucer's measures: its radius at the rim; how far under its middle its belly is, where the beam comes out; the beam's radius there. */
export const SAUCER = { rim: 9, belly: 1.0, mouth: 2.6 };

/** The hull's skin: plates of grey metal, seams between them round and across, a row of rivets along each seam. */
const plating = () => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!, rng = new Rng('saucer plating');
  g.fillStyle = '#b4bcc6'; g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(${rng.range(150, 200) | 0},${rng.range(160, 205) | 0},${rng.range(170, 215) | 0},0.35)`; g.fillRect((i * 512) / 24, 0, 512 / 24, 128); }
  g.strokeStyle = 'rgba(40,44,52,0.8)'; g.lineWidth = 2;
  for (let i = 0; i <= 24; i++) { const x = (i * 512) / 24; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (const y of [20, 52, 76, 104]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); g.fillStyle = 'rgba(30,32,38,0.7)'; for (let x = 4; x < 512; x += 8) g.fillRect(x, y + 3, 2, 2); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace;
  return t;
};

export class Saucer {
  readonly group = new Group();
  /** The craft itself, where it flies and as it is tipped; and its beam, hung straight down from its belly whichever way it is tipped. */
  private readonly craft = new Group();
  private readonly hull = new Group();
  private readonly beam = new Group();
  private readonly lights: InstancedMesh;
  private readonly sparks: InstancedMesh;
  private readonly spark: { a: number; h: number; r: number; w: number }[] = [];
  private readonly uBeam = uniform(0);
  private readonly uRing = uniform(0);
  private t = 0;
  private length = 1;
  private static readonly LIGHTS = 18;
  private static readonly SPARKS = 60;
  private readonly m4 = new Matrix4();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly colour = new Color();

  constructor() {
    // The hull: turned about its axis from its outline, the belly with the beam's ring sunk in it, out to the rim, up to the dome.
    const outline = [[0.01, -0.85], [2.1, -0.85], [2.4, -1.0], [3.0, -1.0], [5.5, -0.7], [8.0, -0.22], [9.0, 0], [8.1, 0.26], [5.6, 0.72], [3.6, 1.0], [3.4, 1.0]].map(([x, y]) => new Vector2(x, y));
    // (Not so much metal as to look black: there is no sky about it for metal to show, only the sun and the sky's light.)
    const metal = new MeshStandardMaterial({ map: plating(), metalness: 0.3, roughness: 0.38, emissive: 0x1c2027 });
    const body = new Mesh(new LatheGeometry(outline, 64), metal);
    body.castShadow = true;
    const domeGeo = new SphereGeometry(3.4, 32, 12, 0, TURN, 0, Math.PI / 2);
    const dome = new Mesh(domeGeo, new MeshStandardMaterial({ color: 0x9fd8ff, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.6, emissive: 0x1a4a6a }));
    dome.position.y = 1.0; dome.scale.y = 0.75;
    // (Its lights, running round the rim; and the ring under it the beam comes out of, glowing as the beam does.)
    const lightPaint = new MeshBasicNodeMaterial();
    this.lights = new InstancedMesh(new SphereGeometry(0.34, 10, 8), lightPaint, Saucer.LIGHTS);
    for (let i = 0; i < Saucer.LIGHTS; i++) {
      const a = (i / Saucer.LIGHTS) * TURN;
      this.lights.setMatrixAt(i, this.m4.makeTranslation(Math.cos(a) * 8.75, 0.04, Math.sin(a) * 8.75));
      this.lights.setColorAt(i, this.colour.setRGB(1, 1, 1));
    }
    const ringPaint = new MeshBasicNodeMaterial();
    ringPaint.colorNode = vec3(0.5, 1.6, 1.4).mul(this.uRing);
    const ring = new Mesh(new TorusGeometry(2.7, 0.22, 8, 48), ringPaint);
    ring.rotation.x = Math.PI / 2; ring.position.y = -SAUCER.belly;
    this.hull.add(body, dome, this.lights, ring);
    this.craft.add(this.hull);

    // The beam: a cone of light from the belly down to the snow, brightest seen edge-on, banded, the bands going up it; fading out at
    // the snow. Sparks rising in it, turning about its axis.
    const cone = new CylinderGeometry(SAUCER.mouth, 7.5, 1, 48, 8, true);
    cone.translate(0, -0.5, 0);
    const beamPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    const v = uv().y, bands = sin(v.mul(40).sub(time.mul(9))).mul(0.18).add(0.24), edge = float(1).sub(abs(normalView.z)).mul(0.8).add(0.5);
    beamPaint.colorNode = vec3(0.45, 1.0, 0.85).mul(bands).mul(edge).mul(smoothstep(0, 0.15, v)).mul(this.uBeam);
    this.beam.add(new Mesh(cone, beamPaint));
    const dot = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d')!, grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
      return new CanvasTexture(c);
    })();
    const sparkPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    sparkPaint.colorNode = vec3(0.8, 1.6, 1.4).mul(this.uBeam);
    sparkPaint.opacityNode = texture(dot, uv()).a;
    this.sparks = new InstancedMesh(new PlaneGeometry(1, 1), sparkPaint, Saucer.SPARKS);
    const rng = new Rng('saucer sparks');
    for (let i = 0; i < Saucer.SPARKS; i++) this.spark.push({ a: rng.range(0, TURN), h: rng.range(0, 1), r: Math.sqrt(rng.next()), w: rng.range(0.3, 0.6) });
    for (const m of [...this.beam.children, this.sparks]) { m.frustumCulled = false; m.renderOrder = 3; }

    this.group.add(this.craft, this.beam, this.sparks);
    this.group.visible = false;
    this.group.name = 'saucer';
  }

  /** Flying at `at` (its middle), tipped by `tip`. */
  place(at: Vector3, tip: Quaternion) {
    this.group.visible = true;
    this.craft.position.copy(at);
    this.craft.quaternion.copy(tip);
    this.craft.updateMatrixWorld(true);
    this.beam.position.copy(this.belly(this.v));
  }
  /** Where its belly is, the beam's mouth, in the world. */
  belly(out = new Vector3()) { return this.craft.localToWorld(out.set(0, -SAUCER.belly, 0)); }
  /** Its beam shining as brightly as `on` (0 off, 1 full, more a flash), reaching `down` metres below its belly. */
  shine(on: number, down: number) {
    this.uBeam.value = on;
    this.uRing.value = 0.3 + on;
    this.length = Math.max(1, down);
    this.beam.visible = this.sparks.visible = on > 0.005;
    this.beam.scale.set(1, this.length, 1);
  }

  /** A step on: its hull turning, its lights running round, the sparks in its beam rising; turned to `eye`. */
  step(dt: number, eye: Camera) {
    if (!this.group.visible) return;
    this.t += dt;
    this.hull.rotation.y += 0.9 * dt;
    for (let i = 0; i < Saucer.LIGHTS; i++) {
      const a = (i / Saucer.LIGHTS) * TURN, b = 0.35 + 2.6 * Math.max(0, Math.cos(a - this.t * 4)) ** 8;
      this.lights.setColorAt(i, i % 3 === 0 ? this.colour.setRGB(0.4 * b, 1.1 * b, 1.0 * b) : this.colour.setRGB(1.2 * b, 0.75 * b, 0.25 * b));
    }
    if (this.lights.instanceColor) this.lights.instanceColor.needsUpdate = true;
    // (Each spark from the snow up to the belly in a couple of seconds, about the axis, as far out as the cone is wide there.)
    // (Only while the beam shines: coming and going, they are not seen.)
    if (this.sparks.visible) this.spark.forEach((p, i) => {
      p.h = (p.h + p.w * dt) % 1; p.a += 1.5 * dt;
      const wide = (SAUCER.mouth + (7.5 - SAUCER.mouth) * (1 - p.h)) * p.r * 0.9, size = 0.35 + 0.25 * Math.sin(this.t * 7 + i);
      this.v.set(Math.cos(p.a) * wide, -(1 - p.h) * this.length, Math.sin(p.a) * wide).add(this.beam.position);
      this.sparks.setMatrixAt(i, this.m4.compose(this.v, eye.quaternion, this.s.setScalar(size)));
    });
    if (this.sparks.visible) this.sparks.instanceMatrix.needsUpdate = true;
  }

  hide() { this.group.visible = false; this.shine(0, 1); }
}
