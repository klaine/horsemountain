/**
 * The run's end, an eighth way (asked: "a small cessna style airplane flies above and catches player with a hook that is released at the
 * destination (or bit before) and the player drops to the destination"): a small high-winged plane of four seats, made here in code.
 * White, a red stripe down its side and red tips to its wings and tail; its wing over the cabin on a strut each side, its windows dark,
 * its propeller spinning, its wheels on their legs; and from its belly a line, a hook at its end. The page says where it flies and how
 * it is turned, and where the hook is (`slope.ts`).
 */
import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Line, LineBasicMaterial, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';

/** Its measures, in metres: how long the line is from its belly to the hook, and where on the plane the line hangs from. */
export const PLANE = { line: 9, belly: new Vector3(0, -0.55, -0.6) };

export class Plane {
  readonly group = new Group();
  private readonly craft = new Group();
  private readonly prop = new Group();
  private readonly hook = new Group();
  private readonly line: Line;
  private readonly linePos = new Float32Array(6);
  private readonly v = new Vector3();

  constructor() {
    const white = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.45, metalness: 0.1 });
    const red = new MeshStandardMaterial({ color: 0xb8261e, roughness: 0.5 });
    const glass = new MeshStandardMaterial({ color: 0x1b2836, roughness: 0.1, metalness: 0.4 });
    const dark = new MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const steel = new MeshStandardMaterial({ color: 0x9a9fa6, roughness: 0.35, metalness: 0.8 });
    const part = (g: BufferGeometry, m: MeshStandardMaterial, x = 0, y = 0, z = 0) => { const mesh = new Mesh(g, m); mesh.position.set(x, y, z); mesh.castShadow = true; return mesh; };
    // (Built facing +z, its wing's top at about 1.4 m over its middle.)
    // The fuselage: the cabin, tapering back to the tail, the nose and its cowling ahead.
    const cabin = part(new BoxGeometry(1.2, 1.35, 2.6), white, 0, 0, 0.2);
    const boom = new CylinderGeometry(0.62, 0.22, 4.2, 10, 1);
    boom.rotateX(-Math.PI / 2).scale(1, 1.05, 1);
    const tailCone = part(boom, white, 0, 0.12, -3.2);
    const nose = new CylinderGeometry(0.5, 0.62, 1.3, 12, 1);
    nose.rotateX(Math.PI / 2);
    const cowling = part(nose, white, 0, -0.05, 2.1);
    const spinner = part(new SphereGeometry(0.22, 12, 8), red, 0, -0.05, 2.82);
    // (The red stripe down each side.)
    const stripe = part(new BoxGeometry(1.24, 0.14, 6.6), red, 0, -0.2, -0.9);
    // The windows: the windscreen, sloped, and a pane each side.
    const screen = part(new BoxGeometry(1.1, 0.6, 0.06), glass, 0, 0.45, 1.45);
    screen.rotation.x = -0.6;
    const sides = [-1, 1].map((s) => part(new BoxGeometry(0.04, 0.55, 1.6), glass, 0.61 * s, 0.35, 0.3));
    // The wing over the cabin, red at its tips; a strut each side down to the fuselage.
    const wing = part(new BoxGeometry(11, 0.14, 1.55), white, 0, 0.78, 0.25);
    const tips = [-1, 1].map((s) => part(new BoxGeometry(0.6, 0.16, 1.57), red, 5.2 * s, 0.78, 0.25));
    const struts = [-1, 1].map((s) => {
      const m = part(new CylinderGeometry(0.04, 0.04, 2.5, 6), steel, 1.7 * s, 0.05, 0.4);
      m.rotation.z = s * 1.12;
      return m;
    });
    // The tail: its plane, and its fin, red at the top.
    const tailPlane = part(new BoxGeometry(3.6, 0.1, 0.9), white, 0, 0.3, -5.0);
    const fin = part(new BoxGeometry(0.1, 1.4, 1.1), white, 0, 0.95, -5.05);
    fin.rotation.x = 0.25;
    const finTip = part(new BoxGeometry(0.12, 0.35, 0.9), red, 0, 1.6, -5.25);
    finTip.rotation.x = 0.25;
    // The wheels, on their legs: two under the cabin and one under the nose.
    const wheel = (x: number, z: number, legY: number) => {
      const g = new Group();
      const leg = part(new CylinderGeometry(0.04, 0.04, 0.8, 6), steel, 0, legY / 2, 0);
      const w = part(new CylinderGeometry(0.28, 0.28, 0.16, 14), dark, 0, legY, 0);
      w.rotation.z = Math.PI / 2;
      g.add(leg, w); g.position.set(x, -0.6, z);
      return g;
    };
    const wheels = [wheel(-0.9, 0.0, -0.55), wheel(0.9, 0.0, -0.55), wheel(0, 2.0, -0.45)];
    wheels[0].rotation.z = -0.35; wheels[1].rotation.z = 0.35;
    // The propeller: two blades about its hub, spun (`step`).
    for (const s of [0, Math.PI]) {
      const blade = part(new BoxGeometry(0.16, 0.9, 0.05), dark, 0, 0, 0);
      blade.geometry.translate(0, 0.45, 0);
      blade.rotation.z = s;
      this.prop.add(blade);
    }
    this.prop.position.set(0, -0.05, 2.9);
    this.craft.add(cabin, tailCone, cowling, spinner, stripe, screen, ...sides, wing, ...tips, ...struts, tailPlane, fin, finTip, ...wheels, this.prop);

    // The line from its belly, and the hook at its end: a steel hook, open upward to take what it catches by its harness.
    const lg = new BufferGeometry();
    lg.setAttribute('position', new BufferAttribute(this.linePos, 3));
    this.line = new Line(lg, new LineBasicMaterial({ color: 0x2a2a2a }));
    this.line.frustumCulled = false;
    const bend = new Mesh(new TorusGeometry(0.22, 0.045, 6, 16, Math.PI * 1.3), steel);
    bend.rotation.z = Math.PI * 1.15;
    bend.position.y = -0.2;
    const eye = new Mesh(new TorusGeometry(0.07, 0.025, 5, 10), steel);
    eye.position.y = 0.05;
    this.hook.add(bend, eye);

    this.group.add(this.craft, this.line, this.hook);
    this.group.visible = false;
    this.group.name = 'plane';
  }

  /** Flying at `at`, turned by `turn` (built facing +z); its hook at `hook`, its line from its belly to there. */
  place(at: Vector3, turn: Quaternion, hook: Vector3) {
    this.group.visible = true;
    this.craft.position.copy(at);
    this.craft.quaternion.copy(turn);
    this.craft.updateMatrixWorld(true);
    const from = this.belly(this.v);
    this.linePos.set([from.x, from.y, from.z, hook.x, hook.y + 0.1, hook.z]);
    this.line.geometry.getAttribute('position').needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
    this.hook.position.copy(hook);
    // (Hanging along its line, the bend of it at the bottom.)
    this.hook.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), from.clone().sub(hook).normalize());
  }
  /** Where its line hangs from, in the world. */
  belly(out = new Vector3()) { return this.craft.localToWorld(out.copy(PLANE.belly)); }
  /** A step on: its propeller spinning. */
  step(dt: number) { if (this.group.visible) this.prop.rotation.z += dt * 55; }
  hide() { this.group.visible = false; }
}
