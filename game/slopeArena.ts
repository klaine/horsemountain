/**
 * Where a great one comes (asked: "for locations where these bosses spawn, we need to dynamically add some elements like half pipes
 * etc. which allow the player to proceed back on skis, maybe booster powerups to pick etc."): what is laid on the snow there for the
 * fight, riding (`slope.ts` lays them, and takes them away again once the fight is done).
 *
 * A quarter-pipe across the run below the great one (`Pipe`), its face to the top of the run: ridden down into, the skier is carried up
 * its curve, steeper and steeper to near upright at its lip, thrown up off the lip into the air above it, and comes down onto its face
 * again going back up the run, past the great one, until its speed runs out and it turns and comes down again; round and round, a
 * pass at it each time. Its curve is a circle's, laid true (not over the land's fall), from the land's own slope at its foot; a deck
 * behind the lip, level, and its back falling away to the land. Its ends taper into the snow, so that it can be ridden round, and it
 * sinks back into the snow once the fight is done.
 *
 * Boosters (`Boosters`): crystals of amber light hung over the snow in a ring of gold, turning and rising and falling a little, each
 * taken by riding through it, which throws the skier on faster (the page says how), and comes again a while after; laid up the run
 * from the pipe's foot, where the skier climbs back.
 */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Group, type Material, Mesh, MeshBasicMaterial, OctahedronGeometry, type Object3D, Sprite,
  SpriteMaterial, TorusGeometry, Vector3,
} from 'three';

/**
 * The pipe's measures: its curve's radius, the steepest its face comes to at the lip, how long its level deck is, how fast its back
 * falls away (over the land's own fall, height a metre), how far its ends taper into the snow; and how far over the piste's edges it
 * reaches either side.
 */
export const PIPE = { radius: 9, steepest: (76 * Math.PI) / 180, deck: 3, back: 0.45, taper: 6, wider: 3 };

/** A quarter-pipe across the run: its foot (along the run), the middle of it across, how far it reaches either side, the land's fall there. */
export class Pipe {
  /** How far along from its foot its lip is, how high it is raised there over the land; where its deck ends; where its back meets the land. */
  readonly lip: number; readonly top: number; readonly deckEnd: number; readonly end: number;
  private readonly sinA: number; private readonly cosA: number; private readonly tanA: number;
  /** How far it has sunk back into the snow (0, standing; 1, gone). */
  sunk = 0;
  constructor(readonly foot: number, readonly mid: number, readonly half: number, fall: number) {
    const a = Math.min(Math.atan(Math.max(0, fall)), (35 * Math.PI) / 180), R = PIPE.radius;
    this.sinA = Math.sin(a); this.cosA = Math.cos(a); this.tanA = Math.tan(a);
    this.lip = R * (Math.sin(PIPE.steepest) + this.sinA);
    this.top = this.face(this.lip);
    this.deckEnd = this.lip + PIPE.deck;
    const deckTop = this.top + PIPE.deck * this.tanA;
    this.end = this.deckEnd + deckTop / PIPE.back;
  }
  /** How high the curve stands over the land `u` metres along from its foot: the circle, true, less the land's own fall under it. */
  private face(u: number): number {
    const R = PIPE.radius, sin = Math.min(1, u / R - this.sinA), cos = Math.sqrt(1 - sin * sin);
    return R * (this.cosA - cos) + u * this.tanA;
  }
  /** How high it stands over the land at `u` along the run from its foot and `across` from its middle (as much as it has not sunk). */
  raise(u: number, across: number): number {
    if (u <= 0 || u >= this.end || this.sunk >= 1) return 0;
    const out = Math.abs(across) - this.half;
    if (out >= PIPE.taper) return 0;
    const h = u <= this.lip ? this.face(u) : u <= this.deckEnd ? this.top + (u - this.lip) * this.tanA : this.top + PIPE.deck * this.tanA - (u - this.deckEnd) * PIPE.back;
    const t = out <= 0 ? 1 : 1 - out / PIPE.taper, w = t * t * (3 - 2 * t);
    return Math.max(0, h) * w * (1 - this.sunk);
  }
  /** Whether `u` along and `across` is on its face near the lip, where a skier going up it is thrown straight up (`slope.ts`). */
  nearLip(u: number, across: number): boolean { return u > this.lip - 2.5 && u < this.lip + 1.2 && Math.abs(across) < this.half + 1; }

  /**
   * Its snow, as a sheet over the land (`at`, a point along the run and across it in the scene, on the land), a hand over the land's
   * own snow; a band of `dye` along its lip; to be laid again as it sinks (`relay`).
   */
  build(at: (s: number, left: number) => Vector3, snow: Material, dye: Material): Group {
    const g = new Group(), us: number[] = [], xs: number[] = [];
    for (let u = 0; u <= this.lip; u += 0.5) us.push(u);
    for (let u = this.lip; u <= this.end + 0.01; u += 1) us.push(u);
    us.push(this.lip - 0.001);
    us.sort((a, b) => a - b);
    const span = this.half + PIPE.taper;
    for (let x = -span; x <= span + 0.01; x += 1) xs.push(x);
    const sheet = this.sheet(at, us, xs, 0.012), band = this.sheet(at, [this.lip - 0.1, this.lip], xs.filter((x) => Math.abs(x) <= this.half), 0.022);
    const body = new Mesh(sheet, snow), lip = new Mesh(band, dye);
    body.castShadow = body.receiveShadow = true;
    lip.receiveShadow = true;
    g.add(body, lip);
    g.userData.relay = () => { this.lay(sheet, at, us, xs, 0.012); this.lay(band, at, [this.lip - 0.1, this.lip], xs.filter((x) => Math.abs(x) <= this.half), 0.022); };
    return g;
  }
  private sheet(at: (s: number, left: number) => Vector3, us: number[], xs: number[], lift: number): BufferGeometry {
    const g = new BufferGeometry(), w = xs.length, index: number[] = [], uv = new Float32Array(us.length * w * 2);
    g.setAttribute('position', new BufferAttribute(new Float32Array(us.length * w * 3), 3));
    us.forEach((u, i) => xs.forEach((x, j) => uv.set([x / 9, u / 9], (i * w + j) * 2)));
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    for (let i = 1; i < us.length; i++) for (let j = 1; j < w; j++) {
      const a = (i - 1) * w + j - 1, b = a + 1, c = a + w, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    g.setIndex(index);
    this.lay(g, at, us, xs, lift);
    return g;
  }
  private lay(g: BufferGeometry, at: (s: number, left: number) => Vector3, us: number[], xs: number[], lift: number): void {
    const p = g.getAttribute('position') as BufferAttribute;
    us.forEach((u, i) => xs.forEach((x, j) => { const q = at(this.foot + u, this.mid + x); p.setXYZ(i * xs.length + j, q.x, q.y + this.raise(u, x) + lift, q.z); }));
    p.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
  }
}

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
    // (One kept, never shown, so that the page makes their shaders ready as it opens: laid with the first arena, they had made them then.)
    const kept = new Group(), light = new Sprite(this.glow);
    light.scale.setScalar(2.4);
    kept.add(light, new Mesh(this.crystal, this.amber), new Mesh(this.halo, this.gold));
    kept.visible = false;
    this.group.add(kept);
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
