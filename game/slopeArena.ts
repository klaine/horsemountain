/**
 * Where a great one comes (asked: "for locations where these bosses spawn, we need to dynamically add some elements like half pipes
 * etc. which allow the player to proceed back on skis, maybe booster powerups to pick etc."): what is laid on the snow there for the
 * fight, riding (`slope.ts` lays them, and takes them away again once the fight is done).
 *
 * A quarter-pipe bent round into a bowl below the great one (`Pipe`), a C open to the top of the run: ridden down into, the skier is
 * carried up its curve, steeper and steeper to near upright at its lip, thrown up off the lip into the air above it, and comes down onto
 * its face again going back into the bowl, and up the run past the great one, until its speed runs out and it turns and comes down
 * again; round and round, a pass at it each time. Its curve is a circle's, laid true (not over the land's fall), from the land's own
 * slope at its foot; a deck behind the lip, level, and its back falling away to the land. The C's ends taper into the snow, so that it
 * can be ridden round, and it sinks back into the snow once the fight is done.
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
 * falls away (over the land's own fall, height a metre), how far its ends taper into the snow; how far over the piste's edges it
 * reaches either side. And (asked: "the quarter pipe is now a straight piece, could it be more like a large C shaped bowl?") how it
 * is bent round into a bowl, in plan: the least radius of the circle its foot is laid on, and how far round from straight down the run
 * either end of the C reaches before it tapers away.
 */
export const PIPE = { radius: 9, steepest: (76 * Math.PI) / 180, deck: 3, back: 0.45, taper: 6, wider: 3, bowl: 10, round: (66 * Math.PI) / 180 };

/** A pipe's curve at one place round its bowl: where its lip is, how high it is there, where its deck ends, where its back meets the land. */
interface Profile { lip: number; top: number; deckEnd: number; end: number; sinA: number; cosA: number; tanA: number }

/**
 * A quarter-pipe bent round into a bowl below the great one: its foot (along the run), the middle of it across, how far it reaches
 * either side, the land's fall there. Its foot is laid on a circle about a point up the run from the foot (`centre`), the C open to the
 * top of the run; ridden into, the skier is carried up its face, outward from that point, wherever round the C it goes. Its curve is
 * the straight pipe's, laid along each line out from the centre, true over the land's fall along that line.
 */
export class Pipe {
  /**
   * Straight down the run from the centre: how far along from its foot its lip is, how high it is raised there over the land; where
   * its deck ends; where its back meets the land (the furthest it reaches down the run).
   */
  readonly lip: number; readonly top: number; readonly deckEnd: number; readonly end: number;
  /** The radius of the circle its foot is laid on, about a point that far up the run from its foot. */
  readonly bowl: number;
  /** How far round from straight down the run its taper goes, at the most (radians). */
  private readonly reach: number;
  private readonly fall: number;
  /** How far it has sunk back into the snow (0, standing; 1, gone). */
  sunk = 0;
  constructor(readonly foot: number, readonly mid: number, readonly half: number, fall: number) {
    this.fall = Math.max(0, fall);
    const c = this.profile(0);
    this.lip = c.lip; this.top = c.top; this.deckEnd = c.deckEnd; this.end = c.end;
    // (Wide enough that the C's two ends stand about the piste's edges, the lip a little past them.)
    this.bowl = Math.max(PIPE.bowl, (half + 2) / Math.sin(PIPE.round) - c.lip);
    this.reach = PIPE.round + PIPE.taper / this.bowl;
  }
  /** The curve laid along the line out from the centre `ang` round from straight down the run: the land falls along it as much as that line goes down the run. */
  private profile(ang: number): Profile {
    const a = Math.min(Math.atan(this.fall * Math.max(0, Math.cos(ang))), (35 * Math.PI) / 180), R = PIPE.radius;
    const sinA = Math.sin(a), cosA = Math.cos(a), tanA = Math.tan(a), lip = R * (Math.sin(PIPE.steepest) + sinA);
    const p = { lip, top: 0, deckEnd: lip + PIPE.deck, end: 0, sinA, cosA, tanA };
    p.top = this.face(p, lip);
    p.end = p.deckEnd + (p.top + PIPE.deck * tanA) / PIPE.back;
    return p;
  }
  /** How high the curve stands over the land `r` metres out from its foot: the circle, true, less the land's own fall under it. */
  private face(p: Profile, r: number): number {
    const R = PIPE.radius, sin = Math.min(1, r / R - p.sinA), cos = Math.sqrt(1 - sin * sin);
    return R * (p.cosA - cos) + r * p.tanA;
  }
  /** A point `u` along the run from its foot and `across` from its middle, about the bowl: how far round from straight down the run, and how far out from its foot. */
  private polar(u: number, across: number): [number, number] {
    const du = u + this.bowl;
    return [Math.atan2(across, du), Math.hypot(du, across) - this.bowl];
  }
  /** The point `ang` round and `r` out from the foot, along the run from its foot and across from its middle. */
  private point(ang: number, r: number): [number, number] {
    const d = this.bowl + r;
    return [d * Math.cos(ang) - this.bowl, d * Math.sin(ang)];
  }
  /** How high it stands over the land at `u` along the run from its foot and `across` from its middle (as much as it has not sunk). */
  raise(u: number, across: number): number {
    if (this.sunk >= 1 || u <= -this.bowl) return 0;
    const [ang, r] = this.polar(u, across);
    if (r <= 0 || Math.abs(ang) >= this.reach) return 0;
    const p = this.profile(ang);
    if (r >= p.end) return 0;
    const out = (Math.abs(ang) - PIPE.round) * (this.bowl + r);
    if (out >= PIPE.taper) return 0;
    const h = r <= p.lip ? this.face(p, r) : r <= p.deckEnd ? p.top + (r - p.lip) * p.tanA : p.top + PIPE.deck * p.tanA - (r - p.deckEnd) * PIPE.back;
    const t = out <= 0 ? 1 : 1 - out / PIPE.taper, w = t * t * (3 - 2 * t);
    return Math.max(0, h) * w * (1 - this.sunk);
  }
  /** Whether `u` along and `across` is on its face near the lip, where a skier going up it is thrown straight up (`slope.ts`). */
  nearLip(u: number, across: number): boolean {
    const [ang, r] = this.polar(u, across), lip = this.profile(ang).lip;
    return r > lip - 2.5 && r < lip + 1.2 && Math.abs(ang) < PIPE.round + 1 / this.bowl;
  }
  /** Which way is up its face at `u` along and `across` (out from the centre, level): along the run and across it. */
  outward(u: number, across: number): [number, number] {
    const du = u + this.bowl, l = Math.hypot(du, across) || 1;
    return [du / l, across / l];
  }
  /** Where a flag stands at either end of the C's lip (`side`, -1 or 1), a little past it: along the run from its foot, and across. */
  lipEnd(side: number): [number, number] { return this.point(side * PIPE.round, this.profile(PIPE.round).lip + 0.6); }
  /** Points about its outline, along the run from its foot and across (for the box it stands in). */
  outline(): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const ang = -this.reach + (2 * this.reach * i) / 24; pts.push(this.point(ang, 0), this.point(ang, this.profile(ang).end)); }
    return pts;
  }

  /**
   * Its snow, as a sheet over the land (`at`, a point along the run from its foot and across from its middle, in the scene, on the
   * land), a hand over the land's own snow; a band of `dye` along its lip; to be laid again as it sinks (`relay`). Laid round the bowl, each line out from the centre
   * its own curve: rows finely up the face to the lip, which each line has where its own curve has it, and coarsely on over the deck.
   */
  build(at: (s: number, left: number) => Vector3, snow: Material, dye: Material): Group {
    const g = new Group(), angs: number[] = [], n = Math.ceil((2 * this.reach * (this.bowl + this.lip * 0.5)) / 0.9);
    for (let i = 0; i <= n; i++) angs.push(-this.reach + (2 * this.reach * i) / n);
    const faceRows = Math.ceil(this.lip / 0.5), deckRows = Math.ceil((this.end - this.lip) / 1);
    const body = (ang: number, k: number): [number, number] => {
      const p = this.profile(ang);
      return this.point(ang, k <= faceRows ? (p.lip * k) / faceRows : k === faceRows + 1 ? p.lip + 0.001 : p.lip + ((p.end - p.lip) * (k - faceRows - 1)) / deckRows);
    };
    const bandAngs = angs.filter((a) => Math.abs(a) <= PIPE.round + 1e-6);
    const band = (ang: number, k: number): [number, number] => this.point(ang, this.profile(ang).lip - 0.1 * (1 - k));
    const sheet = this.sheet(at, faceRows + deckRows + 2, angs, body, 0.012), lipBand = this.sheet(at, 2, bandAngs, band, 0.022);
    const bodyMesh = new Mesh(sheet, snow), lip = new Mesh(lipBand, dye);
    bodyMesh.castShadow = bodyMesh.receiveShadow = true;
    lip.receiveShadow = true;
    g.add(bodyMesh, lip);
    g.userData.relay = () => { this.lay(sheet, at, faceRows + deckRows + 2, angs, body, 0.012); this.lay(lipBand, at, 2, bandAngs, band, 0.022); };
    return g;
  }
  private sheet(at: (s: number, left: number) => Vector3, rows: number, angs: number[], where: (ang: number, k: number) => [number, number], lift: number): BufferGeometry {
    const g = new BufferGeometry(), w = angs.length, index: number[] = [], uv = new Float32Array(rows * w * 2);
    g.setAttribute('position', new BufferAttribute(new Float32Array(rows * w * 3), 3));
    for (let i = 0; i < rows; i++) angs.forEach((ang, j) => { const [u, x] = where(ang, i); uv.set([x / 9, u / 9], (i * w + j) * 2); });
    g.setAttribute('uv', new BufferAttribute(uv, 2));
    for (let i = 1; i < rows; i++) for (let j = 1; j < w; j++) {
      const a = (i - 1) * w + j - 1, b = a + 1, c = a + w, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    g.setIndex(index);
    this.lay(g, at, rows, angs, where, lift);
    return g;
  }
  private lay(g: BufferGeometry, at: (s: number, left: number) => Vector3, rows: number, angs: number[], where: (ang: number, k: number) => [number, number], lift: number): void {
    const p = g.getAttribute('position') as BufferAttribute;
    for (let i = 0; i < rows; i++) angs.forEach((ang, j) => {
      const [u, x] = where(ang, i), q = at(u, x);
      p.setXYZ(i * angs.length + j, q.x, q.y + this.raise(u, x) + lift, q.z);
    });
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
