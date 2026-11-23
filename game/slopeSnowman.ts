/**
 * The run's end, a fifth way (asked, after the arm, the whirlwind and the blast: "come up with two additional ones on top of these"): a
 * snowman twenty metres high, made here in code. Three balls of snow, rolled lumpy; coal for its eyes, its mouth and its buttons, a carrot
 * for its nose, a black hat and a red scarf; stick arms, and in its hands a fir pulled up by the roots, held by its crown as a club, the
 * ball of its roots the club's head. It rises out of the snow, swings the fir back over its shoulder and drives what it finds at its feet
 * back up the mountain, as a golfer drives a ball. The page says where it stands, how far it has risen and turned, and where the fir is
 * swung (`slope.ts`).
 */
import { ConeGeometry, CylinderGeometry, DodecahedronGeometry, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, BoxGeometry, Vector3 } from 'three';
import { fbm3, type Rng } from '../src/core/rng';

const UP = new Vector3(0, 1, 0);

/** Its measures: each ball's radius and the height of its middle; where its shoulders are on the middle ball; how deep it lies before it rises. */
export const SNOWMAN = {
  balls: [{ r: 4.4, y: 3.8 }, { r: 3.3, y: 10.2 }, { r: 2.4, y: 14.9 }],
  shoulder: new Vector3(3.0, 10.9, 0.4),
  depth: 22,
};

/** How a snowman stands: risen out of the snow (0 to 1), its top turned about its middle (radians); and the fir, held at `grip`, pointing along `club` to its head (both in the world). */
export interface SnowmanPose { rise: number; twist: number; grip: Vector3; club: Vector3 }

export class Snowman {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly top = new Group();
  private readonly fir = new Group();
  private readonly trunk: Mesh;
  private readonly roots: Group;
  private readonly arms: Mesh[] = [];
  private length = 10;
  private readonly q = new Quaternion();
  private readonly a = new Vector3();
  private readonly b = new Vector3();

  constructor(rng: Rng) {
    const snow = new MeshStandardMaterial({ color: 0xf3f6fa, roughness: 0.95 }), coal = new MeshStandardMaterial({ color: 0x141414, roughness: 0.7 });
    const bark = new MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.9 }), needles = new MeshStandardMaterial({ color: 0x2f5b3a, roughness: 0.9 });
    const shadowed = (m: Mesh) => { m.castShadow = true; return m; };
    // (Each ball rolled lumpy: pushed in and out a little, here and there, as snow rolled by hand is.)
    const ball = (r: number, seed: number) => {
      const g = new IcosahedronGeometry(r, 4), p = g.getAttribute('position'), n = new Vector3();
      for (let i = 0; i < p.count; i++) {
        n.fromBufferAttribute(p, i).normalize();
        const lump = 1 + 0.06 * fbm3(n.x * 2.2 + seed, n.y * 2.2, n.z * 2.2, 3, seed);
        p.setXYZ(i, n.x * r * lump, n.y * r * lump * 0.94, n.z * r * lump);
      }
      g.computeVertexNormals();
      return shadowed(new Mesh(g, snow));
    };
    const [bottom, middle, head] = SNOWMAN.balls.map((b, i) => { const m = ball(b.r, rng.range(0, 100) + i); m.position.y = b.y; return m; });
    this.body.add(bottom);
    this.top.add(middle, head);
    // Its face: coal eyes and a coal mouth, a carrot nose; three coal buttons down its front.
    const hb = SNOWMAN.balls[2], mb = SNOWMAN.balls[1], onBall = (b: { r: number; y: number }, x: number, y: number) => new Vector3(x, b.y + y, Math.sqrt(Math.max(0, b.r * b.r - x * x - y * y)) * 0.96);
    for (const x of [-0.85, 0.85]) { const eye = new Mesh(new SphereGeometry(0.3, 10, 8), coal); eye.position.copy(onBall(hb, x, 0.55)); this.top.add(eye); }
    for (let i = 0; i < 5; i++) { const a = -0.9 + (i / 4) * 1.8, stone = new Mesh(new SphereGeometry(0.2, 8, 6), coal); stone.position.copy(onBall(hb, Math.sin(a) * 1.1, -0.75 - Math.cos(a) * 0.35)); this.top.add(stone); }
    const nose = new Mesh(new ConeGeometry(0.42, 2.6, 12), new MeshStandardMaterial({ color: 0xe8741a, roughness: 0.6 }));
    nose.rotation.x = Math.PI / 2; nose.position.copy(onBall(hb, 0, 0)).addScaledVector(new Vector3(0, 0, 1), 1.2);
    this.top.add(shadowed(nose));
    for (const y of [1.3, 0, -1.3]) { const button = new Mesh(new SphereGeometry(0.32, 10, 8), coal); button.position.copy(onBall(mb, 0, y)); this.top.add(button); }
    // A black hat, a little askew; a red scarf about its neck, one end hanging.
    const hat = new Group(), black = new MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.6 });
    const brim = new Mesh(new CylinderGeometry(2.6, 2.6, 0.22, 32), black), crown = new Mesh(new CylinderGeometry(1.7, 1.8, 2.5, 32), black);
    crown.position.y = 1.3;
    hat.add(shadowed(brim), shadowed(crown));
    hat.position.set(0.2, hb.y + hb.r * 0.86, -0.1); hat.rotation.z = -0.14;
    const red = new MeshStandardMaterial({ color: 0xb3262e, roughness: 0.85 });
    const scarf = new Mesh(new TorusGeometry(2.45, 0.55, 10, 32), red);
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 12.7;
    const end = new Mesh(new BoxGeometry(0.95, 3.4, 0.35), red);
    end.position.set(1.4, 11.2, 2.2); end.rotation.set(0.15, 0, 0.12);
    this.top.add(hat, shadowed(scarf), shadowed(end));
    this.body.add(this.top);

    // Its arms, sticks from its shoulders to its hands on the fir; and the fir, held by its crown, its trunk out to the ball of its roots.
    for (let i = 0; i < 2; i++) {
      const arm = new CylinderGeometry(0.17, 0.28, 1, 8);
      arm.translate(0, 0.5, 0);
      this.arms.push(shadowed(new Mesh(arm, bark)));
    }
    const trunk = new CylinderGeometry(0.3, 0.55, 1, 10);
    trunk.translate(0, 0.5, 0);
    this.trunk = shadowed(new Mesh(trunk, bark));
    for (let k = 0; k < 3; k++) {
      const tuft = new Mesh(new ConeGeometry(1.5 - 0.35 * k, 2.2, 10), needles);
      tuft.rotation.x = Math.PI; tuft.position.y = 0.6 - k * 1.1;
      this.fir.add(shadowed(tuft));
    }
    this.roots = new Group();
    const earth = new MeshStandardMaterial({ color: 0x4a3526, roughness: 1 });
    this.roots.add(shadowed(new Mesh(new DodecahedronGeometry(1.5, 1), earth)));
    for (let k = 0; k < 6; k++) {
      const root = new Mesh(new CylinderGeometry(0.06, 0.16, 2.2, 5), bark), a = (k / 6) * Math.PI * 2;
      root.position.set(Math.cos(a) * 1.1, 0.6, Math.sin(a) * 1.1); root.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      this.roots.add(root);
    }
    this.fir.add(this.trunk, this.roots);
    this.group.add(this.body, this.fir, ...this.arms);
    this.group.visible = false;
    this.group.name = 'snowman';
  }

  /** Stood with its feet at `base` (on the snow), facing `facing` (level); the fir `length` metres from its hands to the middle of its roots. */
  place(base: Vector3, facing: Vector3, length: number) {
    this.group.visible = true;
    this.group.position.copy(base);
    this.group.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), facing.clone().setY(0).normalize());
    this.length = length;
    this.trunk.scale.set(1, length - 1.2, 1);
    this.roots.position.y = length;
  }

  /** Where its shoulders would be, risen, in the world. */
  shoulders(out: Vector3[] = [new Vector3(), new Vector3()]) {
    this.group.updateMatrixWorld(true);
    const s = SNOWMAN.shoulder;
    out[0].set(s.x, s.y, s.z); out[1].set(-s.x, s.y, s.z);
    return out.map((v) => this.group.localToWorld(v));
  }

  pose(p: SnowmanPose) {
    this.body.position.y = -(1 - p.rise) * SNOWMAN.depth;
    this.top.rotation.y = p.twist;
    this.group.updateMatrixWorld(true);
    // (The fir and the arms laid in the world, then put in the snowman's own frame.)
    const inv = this.group.quaternion.clone().invert();
    this.fir.position.copy(this.group.worldToLocal(this.a.copy(p.grip)));
    this.fir.quaternion.copy(inv).multiply(this.q.setFromUnitVectors(UP, p.club.clone().normalize()));
    this.top.updateMatrixWorld(true);
    const shoulder = SNOWMAN.shoulder;
    this.arms.forEach((arm, i) => {
      const from = this.top.localToWorld(this.b.set(i ? -shoulder.x : shoulder.x, shoulder.y, shoulder.z)), to = this.a.copy(p.grip), d = to.clone().sub(from);
      arm.position.copy(this.group.worldToLocal(from.clone()));
      arm.quaternion.copy(inv).multiply(this.q.setFromUnitVectors(UP, d.clone().normalize()));
      arm.scale.set(1, d.length(), 1);
    });
  }

  /** Where the fir's head is, the ball of its roots, in the world. */
  head(out = new Vector3()) { this.fir.updateMatrixWorld(true); return this.fir.localToWorld(out.set(0, this.length, 0)); }

  hide() { this.group.visible = false; }
}
