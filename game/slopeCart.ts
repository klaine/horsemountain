/**
 * The run's end, a seventh way (asked: "one more transition option where the player is provided a cart with a rocket engine, so they
 * can drive back uphill"): a rocket cart, made here in code. A sled of red-painted deck on two steel runners curled up at the front,
 * long and wide enough for whatever skis are on it (a person's, a horse's four or two), a bumper at its nose, and on its tail a rocket
 * engine: a steel can, a red nose, four fins and a nozzle, and out of it a flame, white-hot at the throat and orange along its length,
 * as long as the engine is pushing hard, flickering. The page says where it is, how hard it pushes, and lets the smoke out (`slope.ts`).
 */
import { AdditiveBlending, BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { float, positionGeometry, smoothstep, uniform, vec3 } from 'three/tsl';

/** How high its deck stands over the snow: what rides it stands that much higher. */
export const CART_DECK = 0.42;

export class RocketCart {
  readonly group = new Group();
  /** The deck and runners, laid half a metre wide and a metre long, stretched to the skis on it (`size`); and the engine, kept round. */
  private readonly body = new Group();
  private readonly engine = new Group();
  private readonly flames: Mesh[] = [];
  private readonly uPush = uniform(0);
  private t = 0;
  /** Where the nozzle's mouth is in the cart's own frame, as it is sized now. */
  readonly nozzle = new Vector3();

  constructor() {
    const red = new MeshStandardMaterial({ color: 0xc8362b, roughness: 0.45, metalness: 0.2 }), steel = new MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.7 });
    const dark = new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.4 }), yellow = new MeshStandardMaterial({ color: 0xf0b81c, roughness: 0.5 });
    const part = (geometry: BoxGeometry | CylinderGeometry | SphereGeometry, paint: MeshStandardMaterial, x: number, y: number, z: number, into: Group) => {
      const m = new Mesh(geometry, paint);
      m.position.set(x, y, z); m.castShadow = true;
      into.add(m);
      return m;
    };
    const D = CART_DECK;
    part(new BoxGeometry(0.5, 0.06, 1), red, 0, -0.03, 0, this.body);
    part(new BoxGeometry(0.52, 0.05, 0.04), yellow, 0, -0.02, 0.5, this.body);
    part(new CylinderGeometry(0.035, 0.035, 0.56, 8), dark, 0, -0.12, 0.53, this.body).rotation.z = Math.PI / 2;
    for (const x of [-0.21, 0.21]) {
      part(new BoxGeometry(0.035, 0.03, 1.02), steel, x, -D + 0.015, 0, this.body);
      part(new BoxGeometry(0.035, 0.03, 0.18), steel, x, -D + 0.06, 0.57, this.body).rotation.x = -0.6;
      for (const z of [-0.32, 0.32]) part(new BoxGeometry(0.03, D - 0.06, 0.03), dark, x, -D / 2 - 0.03, z, this.body);
    }
    // The engine: its can along the cart, its red nose forward, four fins at its tail, and its nozzle.
    part(new CylinderGeometry(0.15, 0.15, 0.62, 16), steel, 0, 0, 0, this.engine).rotation.x = Math.PI / 2;
    part(new SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0, 0.31, this.engine).rotation.x = Math.PI / 2;
    part(new CylinderGeometry(0.1, 0.16, 0.2, 16, 1, true), dark, 0, 0, -0.41, this.engine).rotation.x = Math.PI / 2;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      part(new BoxGeometry(0.015, 0.16, 0.2), red, Math.cos(a) * 0.19, Math.sin(a) * 0.19, -0.2, this.engine).rotation.z = a - Math.PI / 2;
    }
    // The flame: two cones out of the nozzle, wide at it and drawn to a point behind, the inner white-hot and short, the outer orange
    // and long, each brightest at the nozzle, added to the picture.
    for (const [r, l, hot] of [[0.13, 1.6, false], [0.07, 0.8, true]] as const) {
      const g = new ConeGeometry(r, l, 16, 1, true);
      g.translate(0, l / 2, 0); g.rotateX(-Math.PI / 2);
      const paint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
      paint.colorNode = (hot ? vec3(2.2, 2.0, 1.6) : vec3(2.4, 0.9, 0.2)).mul(float(1).sub(smoothstep(0, l, positionGeometry.z.negate()))).mul(this.uPush);
      const flame = new Mesh(g, paint);
      flame.position.z = -0.5; flame.renderOrder = 3; flame.frustumCulled = false;
      this.engine.add(flame);
      this.flames.push(flame);
    }
    this.group.add(this.body, this.engine);
    this.group.visible = false;
    this.group.name = 'rocket cart';
    this.size(2.4, 1);
  }

  /** Sized for what rides it: its deck `length` by `width` metres; its engine as big as it needs, on the deck's tail. */
  size(length: number, width: number) {
    this.body.scale.set(width / 0.5, 1, length);
    const e = Math.max(1, length / 2.4) * 1.2;
    this.engine.scale.setScalar(e);
    this.engine.position.set(0, 0.17 * e, -length / 2 + 0.1 * e);
    this.nozzle.set(0, 0.17 * e, -length / 2 + 0.1 * e - 0.52 * e);
  }
  /** Pushing as hard as `push` (0 cold, 1 full), a step on (`dt`): the flame flickering, longer the harder it pushes. */
  set(push: number, dt: number) {
    this.t += dt;
    const flicker = 0.85 + 0.15 * Math.sin(this.t * 53) * Math.sin(this.t * 17.3);
    this.uPush.value = push * flicker;
    for (const f of this.flames) { f.visible = push > 0.01; f.scale.set(1, 1, 0.4 + 0.75 * push * flicker); }
  }
}
