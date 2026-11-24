/**
 * Where a great one comes (asked: "for locations where these bosses spawn, we need to dynamically add some elements like half pipes
 * etc. which allow the player to proceed back on skis, maybe booster powerups to pick etc."): what is laid on the snow there for the
 * fight. Boosters (`Boosters`): crystals of amber light hung over the snow in a ring of gold, turning and rising and falling a little,
 * each taken by riding through it, which throws the skier on faster (the page says how, `slope.ts`), and comes again a while after.
 */
import {
  AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, type Object3D, Sprite, SpriteMaterial, TorusGeometry, Vector3,
} from 'three';

/** A booster's measures: how high it hangs over the snow; how near it must be passed to be taken; how long before it comes again. */
export const BOOST = { high: 1.15, reach: 1.9, again: 9 };

interface Booster { g: Group; at: Vector3; taken: number; phase: number }

export class Boosters {
  readonly group = new Group();
  private readonly items: Booster[] = [];
  private readonly crystal = new OctahedronGeometry(0.34, 0).scale(1, 1.55, 1);
  private readonly halo = new TorusGeometry(0.72, 0.045, 8, 40);
  private readonly amber = new MeshBasicMaterial({ color: 0xffb43c });
  private readonly gold = new MeshBasicMaterial({ color: 0xffe07a, transparent: true, opacity: 0.85 });
  private readonly glow: SpriteMaterial;
  private t = 0;

  constructor() {
    // (A soft round glow behind each, drawn adding its light: a crystal alone was lost against the bright snow.)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 214, 120, 0.95)'); g.addColorStop(0.35, 'rgba(255, 170, 60, 0.45)'); g.addColorStop(1, 'rgba(255, 150, 40, 0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    this.glow = new SpriteMaterial({ map: new CanvasTexture(c), blending: AdditiveBlending, depthWrite: false, transparent: true });
    this.group.name = 'boosters';
  }

  /** Boosters hung over each of `points` (on the snow), the ones there before taken away. */
  lay(points: Vector3[]): void {
    this.clear();
    points.forEach((p, i) => {
      let b = this.items[i];
      if (!b) {
        const g = new Group(), stone = new Mesh(this.crystal, this.amber), ring = new Mesh(this.halo, this.gold), light = new Sprite(this.glow);
        light.scale.setScalar(2.4);
        g.add(light, stone, ring);
        this.group.add(g);
        b = { g, at: new Vector3(), taken: -1, phase: i * 1.7 };
        this.items.push(b);
      }
      b.at.copy(p);
      b.taken = -1;
      b.g.visible = true;
      b.g.position.copy(p).setY(p.y + BOOST.high);
    });
  }

  /**
   * A step on by `dt`: each turning and bobbing, and each that is taken coming back once it has been gone long enough. Gives back
   * where those `at` passes through were (within `BOOST.reach`), taken now.
   */
  step(dt: number, at: Vector3): Vector3[] {
    this.t += dt;
    const took: Vector3[] = [];
    for (const b of this.items) {
      if (!b.g.parent || b.taken === -2) continue;
      if (b.taken >= 0) {
        if (this.t - b.taken < BOOST.again) continue;
        b.taken = -1; b.g.visible = true;
      }
      const y = b.at.y + BOOST.high + 0.12 * Math.sin(this.t * 2.2 + b.phase);
      b.g.position.y = y;
      b.g.children[1].rotation.y = this.t * 2.4 + b.phase;
      b.g.children[2].rotation.set(Math.PI / 2 + 0.25 * Math.sin(this.t * 1.3 + b.phase), this.t * 1.1, 0);
      if (Math.hypot(at.x - b.at.x, at.z - b.at.z) < BOOST.reach && Math.abs(at.y + 0.9 - y) < 2.4) {
        b.taken = this.t; b.g.visible = false;
        took.push(b.g.position.clone());
      }
    }
    return took;
  }

  /** Every booster put away. */
  clear(): void { for (const b of this.items) { b.g.visible = false; b.taken = -2; } }
  /** Where each still to be taken is, for a script. */
  where(): Vector3[] { return this.items.filter((b) => b.g.visible).map((b) => b.at.clone()); }
  /** Its parts, to be made ready to draw before any is laid. */
  get parts(): Object3D { return this.group; }
}
