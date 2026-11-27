/**
 * Orcs coming up the slope, to be shot (asked: "the player can mow down and shoot at hordes of goblins crawling up the slope"; then
 * "lets make the goblins more like orcs (so larger and wearing similar clothes as the player but brown grayish outfit color)"): hordes
 * of them, a few to nine or so together, crouched and coming up the run towards the skier from well ahead of it, edging across towards
 * its line as they come; each the skier's own body, a little larger than the skier, its skin a greenish grey, with pointed ears and
 * tusks, dressed as the skier is (`dressAdventurer`) but in browns and greys, its sword at its hip; going in its crouched walk. Struck
 * by a round (`strike`), or run down by the skier, one falls as it is struck, thrown along the way it was struck, and lies a while
 * before it sinks into the snow. Those the skier has gone by are let go of, and more come.
 *
 * And not only orcs (asked: "we need more monster variety besides our orcs"): each horde is of one kind of foe (`FOES`,
 * `slopeFoes.ts`), goblins, wolves, the frozen dead or yetis as well as orcs, each its own size, pace and pack, and some taking more
 * than one blow to bring down: struck and not brought down, one reels a moment and comes on.
 */
import { type Object3D, type Scene, Vector3 } from 'three';
import { Rng } from '../src/core/rng';
import type { FigureLibrary } from '../src/figures/library';
import { FOES, type FoeKind, type FoeName, type Gait, type Maker } from './slopeFoes';

export type { FoeKind } from './slopeFoes';

/** The run the orcs come up: its snow's height, a point along and across it and which way it goes, its path's edges, its length. */
export interface HordeGround {
  ground(x: number, z: number): number;
  at(s: number, left: number): { x: number; z: number; dx: number; dz: number };
  edges(s: number): [number, number];
  length: number;
  /**
   * On a run that parts in two (`Land.ways`): which way is ridden, and the run seen along another, with where the skier is against it.
   * Each foe keeps to the way it came up (`Foe.way`): had all of them been reckoned along the way ridden, every one there was would
   * have leapt onto the other as the skier crossed from one way's path onto the other's (asked: "the two path runs like lakewall
   * (east) still have some kind of split that causes enemies to appear and disappear when crossing the invisible boundary").
   */
  way?: number;
  /** How many ways the run has (`other` is asked of each but `way`). */
  ways?: number;
  other?(w: number): HordeWay;
}
/** The run along one of its ways not ridden, and where the skier is against it (`HordeGround.other`). */
export interface HordeWay { at: HordeGround['at']; edges: HordeGround['edges']; length: number; down: number; left: number }
/** Where the skier is: in the scene, along the run and across it, and how fast it goes; and how near a body must come to be run down. */
export interface Quarry { at: Vector3; down: number; left: number; v: Vector3; reach: number }
/**
 * Somewhere walled the orcs come at the one on foot through, rather than up a run (a dungeon): where one may come from, out of the way
 * of `from`; which way to go from `p` to come at `to`, round the walls; the floor's height; and a step from (`x`, `z`) toward (`tx`, `tz`)
 * as the walls let a body `r` across its middle go. Each is told, `y`, the height the one asking is at, for a place where one way passes
 * over another (the deeps), so that a floor is the one it stands on and not the one above or below it.
 */
export interface Den {
  spawn(rng: Rng, from: Vector3): Vector3 | null;
  way(p: Vector3, to: Vector3): Vector3;
  floor(x: number, z: number, y?: number): number;
  walk(x: number, z: number, tx: number, tz: number, r: number, y?: number): [number, number];
  /** Whether what stands at a point is to be drawn: in sight of the one on foot (the dark of the dungeon hides the rest). */
  shows?(p: Vector3): boolean;
}

/**
 * How many there may be out at once (each is the skier's body and its clothes, some thirty thousand triangles), of every kind together;
 * how far ahead of the skier they come from.
 */
const MOST = 26, AHEAD: [number, number] = [120, 230];
/** How far from the skier one coming up a way of the run it is not on sinks away (`HordeGround.other`): further than any comes from, and too far to be made out. */
const SINKS = 260;
/**
 * How far beyond the edge of a way not ridden the skier may be for a horde to come up that way rather than the one ridden, and how
 * often one does then: near where a run parts, where either way is in sight of the other.
 */
const NEAR = 60, ACROSS = 0.5;
/** How hard the skier strikes what it runs down: enough to bring down any but the great ones and the dead. */
const RUN_DOWN = 3;

interface Foe {
  kind: FoeKind; gait: Gait; size: number;
  /** Where it is along the run and across it, and in the scene; how fast it comes; which way it faces; how many more blows it takes. */
  s: number; left: number; p: Vector3; pace: number; yaw: number; hp: number;
  /** Which way down a run that parts it came up, and keeps to (`HordeGround.way`); how long it has been sinking away, off another. */
  way: number; sunk: number;
  /**
   * `come` while it comes up the slope; `down` once it has fallen (how long since, and how it was thrown); `taken`, its body the page's
   * a while, sent off far away (`onTaken`); `gone`, waiting to come.
   */
  state: 'come' | 'down' | 'taken' | 'gone'; since: number; v: Vector3;
  /** Beaten and on its knees, waiting for the last blow (`FoeKind.kneels`). */
  kneeling: boolean;
  /** How much longer it reels from a blow that did not bring it down; how much longer before the skier can run it down again. */
  reel: number; bumped: number;
  /** Whether its meshes are drawn into the sun's shadows now: only near the skier, about which those are kept. */
  casts: boolean;
  /** For a great one: the name it goes by this time it comes; whether the skier has come to it (`bosses`); how many times it has come. */
  title: string; met: boolean; comes: number;
  /** Kept within the pen where it came (`Horde.pen`), not let go of behind the skier. */
  penned: boolean;
  /** In a den, when it may strike again. */
  next: number;
}
/**
 * Where a great one is kept while it is fought (`slope.ts` lays a pipe below it): along the run from `lo` to `hi`, and `half` either
 * side of `mid` across it.
 */
export interface Pen { lo: number; hi: number; mid: number; half: number }
/** A great one the skier has come to: which (the same while it comes), its name, how strong it is still, and whether it has fallen. */
export interface Boss { id: string; title: string; kind: FoeName; hp: number; most: number; down: boolean; kneeling: boolean }
/** How near a great one comes before the skier is reckoned to have come to it; how long its bar stays once it has fallen. */
const MEET = 55, FELLED = 2.6;

export class Horde {
  private readonly foes: Foe[] = [];
  private readonly rng = new Rng('orcs');
  /** (The great ones' names drawn apart: drawn from `rng`, every horde after the first yeti came somewhere else.) */
  private readonly naming = this.rng.fork('titles');
  /** (Which way a horde comes up, where a run parts, drawn apart too: hordes on a run of one way come as they always did.) */
  private readonly parting = this.rng.fork('parting');
  /** In a den: how long it has been gone through, and when a great one last came there. */
  private denClock = 0;
  private greatAt = -Infinity;
  /** The den last gone through (`within`): for a script calling a pack out at a place in it (`comeAt`). */
  private den: Den | null = null;
  private making = false;
  private readonly scratch = new Vector3();
  private readonly ball = new Vector3();
  /** Each kind's body, made once, and a maker of copies of it. */
  private readonly bodies = new Map<FoeName, Promise<Maker>>();
  /** How many have been brought down this run. */
  downed = 0;
  /** Only this kind to come, if any (for a script trying it), wherever down the run. */
  only: FoeName | null = null;
  /**
   * Told of each horde of great ones as it comes, where (along the run, across it): may lay a pen for them (`pen`), which they are kept
   * in. And the pen, while there is one.
   */
  onGreat: ((s: number, left: number) => void) | null = null;
  pen: Pen | null = null;
  /** How much harder every blow strikes than it is given (a weapon found, `slopeLoot.ts`; 1, as it is). */
  might = 1;
  /** The name of the last great one brought down, for what it leaves (`slopeLoot.ts`). */
  lastGreat = '';
  /**
   * Told of one brought to its knees and struck again: its body, where it is, how large; the page sends it off far away and hands it
   * back (`release`) once it is gone.
   */
  onTaken: ((model: Object3D, at: Vector3, size: number, kind: FoeKind) => void) | null = null;
  /** How far ahead of the skier a horde comes from (nearer, for a script that would see them soon). */
  ahead: [number, number] = AHEAD;
  /** How many there may be out at once, coming and fallen (each kind's share of it waiting besides); a horde comes while fewer than two fifths of as many are coming. */
  most = MOST;
  /**
   * `onStruck`, told where each struck is (its middle), how it was thrown, how large it is, whether it fell, and whether it bleeds (a
   * blade or a round brings it down; not fire or lightning, and not the frozen dead), for its blood to be spilt.
   */
  constructor(private readonly library: FigureLibrary, private readonly scene: Scene, private readonly dress: (o: Object3D) => void, private readonly onStruck?: (at: Vector3, push: Vector3, size: number, fell: boolean, bloody: boolean) => void) {}

  private bodyOf(k: FoeKind): Promise<Maker> {
    let made = this.bodies.get(k.name);
    if (!made) { made = k.body(this.library); this.bodies.set(k.name, made); }
    return made;
  }
  /** How many of a kind there may be. */
  private cap(k: FoeKind): number { return Math.max(1, Math.round(this.most * k.share)); }

  /**
   * Every kind's body made ahead of need (each takes some part of a second, which riding along would feel), while the page is opening,
   * the orc's first; and the first of each made from them, hidden, so that what it is drawn with can be made ready before any comes.
   */
  async prepare(): Promise<void> {
    await this.bodyOf(FOES[0]);
    await Promise.all(FOES.map((k) => this.bodyOf(k)));
    if (this.making) return;
    this.making = true;
    try { for (const k of FOES) if (!this.foes.some((b) => b.kind === k)) await this.make(k); } finally { this.making = false; }
  }

  /** One made (one a frame or so until there are enough of each kind): a copy of its kind's body, its size its own. */
  private async make(kind: FoeKind): Promise<void> {
    const maker = await this.bodyOf(kind), size = this.rng.range(...kind.size), gait = maker(size, this.rng.next());
    this.dress(gait.model);
    gait.model.visible = false;
    this.scene.add(gait.model);
    this.foes.push({ kind, gait, size, s: 0, left: 0, way: 0, sunk: 0, p: new Vector3(), pace: 1, yaw: 0, hp: kind.hp, state: 'gone', since: 0, v: new Vector3(), reel: 0, bumped: 0, casts: true, title: '', met: false, comes: 0, penned: false, next: 0, kneeling: false });
  }
  /** The kind fewest of which have been made, against how many there may be; none, when there are enough of each. */
  private wanting(): FoeKind | null {
    let best: FoeKind | null = null, least = 1;
    for (const k of FOES) {
      const made = this.foes.filter((b) => b.kind === k).length / this.cap(k);
      if (made < least) { least = made; best = k; }
    }
    return best;
  }

  /**
   * A frame on, by `dt`: more come where there are too few ahead; each comes on, or lies where it fell. Gives back those the skier ran
   * down: where, and what they were.
   */
  update(dt: number, g: HordeGround, q: Quarry): { at: Vector3; kind: FoeKind }[] {
    const ran: { at: Vector3; kind: FoeKind }[] = [];
    if (!this.making) { const k = this.wanting(); if (k) { this.making = true; void this.make(k).finally(() => { this.making = false; }); } }
    // A horde comes, from well ahead, when there are too few coming: of a kind drawn by chance from those that come this far down the
    // run and have enough waiting.
    // (Where from is drawn by chance only when a horde may come: drawn every frame, which hordes came where went by how many frames
    // had been drawn, and the orc hunt was never twice the same.)
    // (Each kind keeps bodies of its own waiting, more of them all told than `most`; but no more than `most` are out on the run at once,
    // coming or fallen, which is what costs the drawing.)
    const coming = this.foes.filter((b) => b.state === 'come').length, room = this.most - this.about;
    if (coming < Math.round(this.most * 0.4)) {
      const free = (k: FoeKind) => this.foes.filter((b) => b.kind === k && b.state === 'gone');
      const ready = FOES.filter((k) => (this.only ? k.name === this.only : q.down >= k.from * g.length) && Math.min(free(k).length, room) >= Math.min(k.pack[0], this.cap(k)));
      const s0 = ready.length ? q.down + this.rng.range(...this.ahead) : Infinity;
      if (s0 < g.length - 40) {
        let pick = this.rng.range(0, ready.reduce((n, k) => n + k.chance, 0)), kind = ready[0];
        for (const k of ready) { if (pick < k.chance) { kind = k; break; } pick -= k.chance; }
        // Near where the run parts, up either way: the way not ridden is in sight there, and only ever empty, with every horde coming
        // up the one ridden, it was a run of its own and not one place (asked: foes "near the fork", the two ways "one connected area").
        // A great one comes up the way ridden only, where its ring is laid. (Up the other, as far ahead along it as the skier is along
        // its own, and only where it is near enough to be seen: further, it would sink away again as soon as it had come.)
        let way = g.way ?? 0, on: HordeWay | null = null, at0 = s0;
        if (!kind.titles && g.other && (g.ways ?? 1) > 1) {
          const near: { w: number; o: HordeWay; s: number }[] = [];
          for (let w = 0; w < g.ways!; w++) {
            if (w === way) continue;
            const o = g.other(w), [lo, hi] = o.edges(Math.max(0, Math.min(o.length, o.down))), s = o.down + (s0 - q.down);
            if (o.down < 0 || o.down > o.length || Math.max(lo - o.left, o.left - hi) > NEAR || s >= o.length - 40) continue;
            const p = o.at(s, (lo + hi) / 2);
            if (Math.hypot(p.x - q.at.x, p.z - q.at.z) < SINKS - 40) near.push({ w, o, s });
          }
          if (near.length && this.parting.chance(ACROSS)) { const c = near[this.parting.int(0, near.length - 1)]; way = c.w; on = c.o; at0 = c.s; }
        }
        const waiting = free(kind), [lo, hi] = (on ?? g).edges(at0), mid = this.rng.range(lo + 3, hi - 3), n = Math.min(waiting.length, room, this.rng.int(...kind.pack));
        for (let k = 0; k < n; k++) {
          const b = waiting[k], s = at0 + this.rng.range(-kind.spread, kind.spread), left = mid + this.rng.range(-0.8, 0.8) * kind.spread;
          Object.assign(b, { s, left, way, sunk: 0, state: 'come', since: 0, pace: this.rng.range(...kind.pace), hp: kind.hp, reel: 0, bumped: 0, met: false, comes: b.comes + 1, kneeling: false });
          if (kind.titles) b.title = this.naming.pick(kind.titles);
          b.gait.go(b.pace, this.rng.next());
          b.gait.model.visible = true;
        }
        if (kind.titles && this.onGreat && !this.pen) {
          this.onGreat(s0, mid);
          if (this.pen) for (let k = 0; k < n; k++) waiting[k].penned = true;
        }
      }
    }
    for (const b of this.foes) {
      if (b.state === 'gone' || b.state === 'taken') continue;
      b.since += dt;
      if (b.state === 'come' && b.kneeling) {
        // (On its knees: where it went down, turned to the skier, waiting.)
        b.p.y = g.ground(b.p.x, b.p.z);
        const want = Math.atan2(q.at.x - b.p.x, q.at.z - b.p.z);
        b.yaw += Math.max(-dt, Math.min(dt, ((want - b.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI));
      } else if (b.state === 'come') {
        // Up the run, and across towards the skier's line, the nearer the more; hardly at all while it reels from a blow.
        b.reel = Math.max(0, b.reel - dt); b.bumped = Math.max(0, b.bumped - dt);
        const slow = b.reel > 0 ? 0.2 : 1, pen = b.penned ? this.pen : null;
        // (Along its own way, and after the skier as it lies against that way: on a run of one way, or on the way ridden, the run's.)
        const w = b.way !== (g.way ?? 0) && g.other ? g.other(b.way) : null, at_ = w ? w.at : g.at, down = w ? w.down : q.down, left = w ? w.left : q.left;
        // (Off a way not ridden and far from the skier, sinking back into the snow as it climbed out of it, and then let go of: it would
        // have gone on up its own way, unseen, long after the skier had gone down the other, and kept fewer coming where it rides.)
        if (w && !b.penned && (b.sunk > 0 || Math.hypot(b.p.x - q.at.x, b.p.z - q.at.z) > SINKS)) {
          b.sunk += dt;
          b.p.y = g.ground(b.p.x, b.p.z) - (b.sunk / 1.2) * 1.9 * b.size;
          b.gait.model.position.copy(b.p);
          b.gait.update(dt, true);
          if (b.sunk > 1.2) this.letGo(b);
          continue;
        }
        const was = at_(b.s, b.left), across = Math.max(-1, Math.min(1, (left - b.left) / 12)) * 0.6 * b.kind.hunt;
        if (pen) {
          // Penned: after the skier, up or down the run and across it, as far as the pen goes; standing its ground once it is there.
          const ts = Math.max(pen.lo, Math.min(pen.hi, down)), tl = Math.max(pen.mid - pen.half, Math.min(pen.mid + pen.half, left));
          const ds = ts - b.s, dl = tl - b.left, far = Math.hypot(ds, dl), step = Math.min(far, b.pace * slow * dt);
          if (far > 0.05) { b.s += (ds / far) * step; b.left += (dl / far) * step; }
        } else { b.s -= b.pace * slow * dt; b.left += across * slow * dt; }
        const at = at_(b.s, b.left), mx = at.x - was.x, mz = at.z - was.z;
        if (Math.hypot(mx, mz) > 1e-5) b.yaw = Math.atan2(mx, mz);
        // (Climbing up out of the snow over its first moments, as it sinks into it when it is done with: none stands there all at once.)
        b.p.set(at.x, g.ground(at.x, at.z) - Math.max(0, 1 - b.since / 0.9) * 1.9 * b.size, at.z);
        // (Gone by: let go of. Run down: thrown on along the skier's way and up.)
        if (b.s < down - 30 && !(b.penned && this.pen)) { this.letGo(b); continue; }
        if (b.kind.titles && Math.hypot(b.p.x - q.at.x, b.p.z - q.at.z) < MEET) b.met = true;
        if (b.bumped <= 0 && Math.hypot(b.p.x - q.at.x, b.p.z - q.at.z) < q.reach + 0.2 * b.size * (b.kind.balls[0][2] / 0.42) && Math.abs(b.p.y - q.at.y) < 2 + Math.max(0, b.size - 1.2)) {
          const at2 = this.middleOf(b), struck = this.strike(b, q.v.clone().multiplyScalar(0.6).add(new Vector3(0, 4, 0)), RUN_DOWN);
          if (struck?.down) ran.push({ at: at2, kind: b.kind });
          b.bumped = 0.8;
        }
      } else {
        // Thrown, and sliding to a stop on the snow; lying a while; then sinking into it, and gone.
        b.v.y -= 9.8 * dt;
        b.p.addScaledVector(b.v, dt);
        const y = g.ground(b.p.x, b.p.z), lies = b.kind.lies;
        if (b.p.y <= y) { b.p.y = y; b.v.y = 0; b.v.multiplyScalar(Math.exp(-3 * dt)); }
        if (b.since > lies) b.p.y = y - (b.since - lies) * 0.6 * b.size;
        if (b.since > lies + 1.8) { this.letGo(b); continue; }
      }
      const model = b.gait.model;
      model.position.copy(b.p);
      // (Drawn into the sun's shadows only within fifty metres of the skier, about whom they are kept fourteen metres out: its skinned
      // body is never passed over as out of sight, and every orc on the run, a hundred metres off and more, was drawn into them each frame.)
      const casts = b.p.distanceToSquared(q.at) < 50 * 50;
      if (casts !== b.casts) { b.casts = casts; for (const m of b.gait.meshes) m.castShadow = casts; }
      model.rotation.set(0, b.yaw, 0);
      b.gait.update(dt, b.p.distanceToSquared(q.at) > 70 * 70);
    }
    return ran;
  }

  /**
   * A pack of `kind` come out at once about (`x`, `z`) in the den last gone through, on its floor nearest `y` (in the scene, as the one on
   * foot is), up to `n` of those made and not out: for a script staging a fight in sight (`__slope.denPack`); each comes on as any pack
   * does. How many came.
   */
  comeAt(kind: string, x: number, z: number, y: number, n = 3): number {
    const k = FOES.find((f) => f.name === kind && f.den), den = this.den;
    if (!k || !den) return 0;
    const waiting = this.foes.filter((b) => b.kind === k && b.state === 'gone').slice(0, n);
    for (const b of waiting) {
      Object.assign(b, { state: 'come', since: 1, pace: this.rng.range(...k.den!.pace), next: 0, hp: k.hp, reel: 0, bumped: 0, penned: false, met: false, comes: b.comes + 1, kneeling: false });
      b.p.set(x + this.rng.range(-0.9, 0.9), 0, z + this.rng.range(-0.9, 0.9));
      b.p.y = den.floor(b.p.x, b.p.z, y);
      b.gait.go(b.pace * 0.9, this.rng.range(0, 1));
      b.gait.model.visible = true;
    }
    return waiting.length;
  }

  /**
   * A frame on, by `dt`, in a den (`Den`) rather than on a run: a few at a time out of its rooms, out of the way of the one on foot
   * (`q.at`), more as fewer come; each coming at it round the walls, faster than up a run; and, come up to it, striking (`strike`, told
   * where from, and what it is), then a moment back before it may again. Fallen, as on the snow, on the floor. Far off, let go of.
   * Each pack of one kind of those that come there (`FoeKind.den`: orcs, goblins, the draugr), drawn by chance; and now and then, none of
   * them coming already and none for a minute and a half, a great one alone in a pack's stead (the barrow-king), its strength shown in
   * the bar across the foot of the picture as it comes (`bosses`). (Wolves and yetis keep to the snow.)
   */
  within(dt: number, den: Den, q: Quarry, strike: (from: Vector3, kind: FoeKind, who: number) => void, most = 9): void {
    this.den = den;
    this.denClock += dt;
    // (Only one kind, if a script asks for it (`only`); a great one so asked, at once.)
    const kinds = FOES.filter((k) => k.den && (!this.only || k.name === this.only)), packs = kinds.filter((k) => !k.titles), greats = kinds.filter((k) => k.titles);
    const of = (k: FoeKind) => this.foes.filter((b) => b.kind === k), free = (k: FoeKind) => of(k).filter((b) => b.state === 'gone');
    // (Bodies made for each kind as it is wanted, one at a time, as many as its biggest pack, and one besides.)
    if (!this.making) {
      const short = kinds.find((k) => of(k).length < Math.min(this.most, k.den!.pack[1] + 1));
      if (short) { this.making = true; void this.make(short).finally(() => { this.making = false; }); }
    }
    const coming = this.foes.filter((b) => b.state === 'come').length;
    if (dt > 0 && coming < most * 0.5 && this.rng.chance(dt * 0.8)) {
      const greatOn = this.foes.some((b) => b.state === 'come' && b.kind.titles);
      const great = !greatOn && (this.only || this.denClock - this.greatAt > 90) && greats.find((k) => free(k).length && (this.only || this.rng.chance(k.den!.chance)));
      let kind: FoeKind | undefined = great || undefined;
      if (!kind) {
        let pick = this.rng.range(0, packs.reduce((n, k) => n + k.den!.chance, 0));
        for (const k of packs) { if (pick < k.den!.chance) { kind = k; break; } pick -= k.den!.chance; }
      }
      const waiting = kind ? free(kind) : [], from = kind && waiting.length >= Math.min(2, kind.den!.pack[0]) ? den.spawn(this.rng, q.at) : null;
      if (kind && from) {
        const d = kind.den!;
        if (kind.titles) this.greatAt = this.denClock;
        for (let k = 0, n = Math.min(waiting.length, this.rng.int(...d.pack)); k < n; k++) {
          const b = waiting[k];
          Object.assign(b, { state: 'come', since: 1, pace: this.rng.range(...d.pace), next: 0, hp: kind.hp, reel: 0, bumped: 0, penned: false, met: false, comes: b.comes + 1, kneeling: false });
          if (kind.titles) b.title = this.naming.pick(kind.titles);
          b.p.set(from.x + this.rng.range(-0.8, 0.8), 0, from.z + this.rng.range(-0.8, 0.8));
          b.p.y = den.floor(b.p.x, b.p.z, from.y);
          b.gait.go(b.pace * 0.9, this.rng.range(0, 1));
          b.gait.model.visible = true;
        }
      }
    }
    for (const b of this.foes) {
      if (b.state === 'gone' || b.state === 'taken') continue;
      b.since += dt;
      if (b.state === 'come') {
        b.reel = Math.max(0, b.reel - dt);
        const to = q.at, d = Math.hypot(to.x - b.p.x, to.z - b.p.z), reach = 0.75 + 0.35 * b.size;
        if (d > 45) { this.letGo(b); continue; }
        // (Come up to it: struck at, and a moment back; else on at it, round the walls.)
        if (d < reach + 0.15 && b.since > b.next) { b.next = b.since + 1.6; strike(b.p.clone(), b.kind, this.foes.indexOf(b)); }
        // (A great one met as it comes near enough to be seen in the dark.)
        if (b.kind.titles && d < 25) b.met = true;
        const back = b.since < b.next - 1.1, way = den.way(b.p, to), step = (back ? -0.8 : d > reach ? b.pace * (b.reel > 0 ? 0.2 : 1) : 0) * dt;
        // (Something in the way, a coffin, a stack of crates: round it, veering a little and then more, one side and then the other.)
        let x = b.p.x, z = b.p.z;
        for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
          const c = Math.cos(a), sn = Math.sin(a), wx = way.x * c + way.z * sn, wz = way.z * c - way.x * sn;
          const [nx, nz] = den.walk(b.p.x, b.p.z, b.p.x + wx * step, b.p.z + wz * step, 0.3 * b.size, b.p.y);
          if (Math.abs(step) < 1e-6 || Math.hypot(nx - b.p.x, nz - b.p.z) > Math.abs(step) * 0.6) { x = nx; z = nz; break; }
        }
        b.p.set(x, den.floor(x, z, b.p.y), z);
        const face = d < 4 ? new Vector3(to.x - b.p.x, 0, to.z - b.p.z) : way;
        if (Math.hypot(face.x, face.z) > 1e-4) b.yaw = Math.atan2(face.x, face.z);
      } else {
        b.v.y -= 9.8 * dt;
        b.p.addScaledVector(b.v, dt);
        const y = den.floor(b.p.x, b.p.z, b.p.y);
        if (b.p.y <= y) { b.p.y = y; b.v.y = 0; b.v.multiplyScalar(Math.exp(-4 * dt)); }
        const [x, z] = den.walk(b.p.x - b.v.x * dt, b.p.z - b.v.z * dt, b.p.x, b.p.z, 0.25, b.p.y);
        b.p.x = x; b.p.z = z;
        if (b.since > 4.5) b.p.y = y - (b.since - 4.5) * 0.5;
        if (b.since > 6.5) { this.letGo(b); continue; }
      }
      b.gait.model.position.copy(b.p);
      // (Only those in sight drawn: out of it, round a corner, in a room not yet come to, the dark has them.)
      b.gait.model.visible = !den.shows || den.shows(b.p.clone().setY(b.p.y + b.kind.mid * b.size));
      const casts = b.p.distanceToSquared(q.at) < 30 * 30;
      if (casts !== b.casts) { b.casts = casts; for (const m of b.gait.meshes) m.castShadow = casts; }
      b.gait.model.rotation.set(0, b.yaw, 0);
      b.gait.update(dt, !b.gait.model.visible || b.p.distanceToSquared(q.at) > 30 * 30);
    }
  }

  /**
   * The nearest still coming that a line from `from` along `dir` (of length one) passes through, before `reach` metres: which, and how
   * far along. Each is reckoned as a few balls as large as it is: an orc's crouched body and its head; a wolf's chest, haunches and head.
   */
  hit(from: Vector3, dir: Vector3, reach: number): { t: number; orc: number } | null {
    let best: { t: number; orc: number } | null = null;
    const c = this.scratch;
    this.foes.forEach((b, i) => {
      if (b.state !== 'come') return;
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      for (const [fwd, up, r] of b.kind.balls) {
        c.set(b.p.x + fx * fwd * b.size, b.p.y + up * b.size, b.p.z + fz * fwd * b.size).sub(from);
        const t = c.dot(dir), rr = r * b.size;
        if (t < 0 || t > reach || (best && t >= best.t)) continue;
        if (c.lengthSq() - t * t < rr * rr) best = { t, orc: i };
      }
    });
    return best;
  }
  private middleOf(b: Foe): Vector3 { return this.ball.set(b.p.x, b.p.y + b.kind.mid * b.size, b.p.z).clone(); }
  /** Where one's middle is, for snow to be thrown from where it falls. */
  middle(i: number): Vector3 { return this.middleOf(this.foes[i]); }
  /** What one is. */
  kindOf(i: number): FoeKind | null { return this.foes[i]?.kind ?? null; }
  /** How many blows one takes, all told (the flamethrower's fire must be kept on the harder the longer). */
  tough(i: number): number { return this.foes[i]?.kind.hp ?? 1; }

  /**
   * Each still coming within `r` metres of `at`, across the snow, and not further above or below it than the run's steepest snow could
   * rise or fall over as far (with three metres more): which, and where its middle is (for what strikes all about a point, or leaps from
   * one to the next). (Kept to three metres above or below, an orc a few metres down a steep run was out of reach.)
   */
  near(at: Vector3, r: number): { orc: number; at: Vector3 }[] {
    const out: { orc: number; at: Vector3 }[] = [];
    this.foes.forEach((b, i) => {
      if (b.state !== 'come') return;
      const across = Math.hypot(b.p.x - at.x, b.p.z - at.z), mid = this.middleOf(b);
      if (across > r || Math.abs(mid.y - at.y) > 3 + 0.85 * across) return;
      out.push({ orc: i, at: mid });
    });
    return out;
  }

  /**
   * One struck by a blow `blow` blows hard, thrown by `push` if it falls, if it is still coming (`bloody`, by a blade or a round, which
   * spills blood if it bleeds; not by fire or lightning). Struck and not brought down, it reels. Gives back what it was, and whether it
   * fell; nothing, if it was not there to be struck.
   */
  strike(i: number | Foe, push: Vector3, blow = 1, bloody = true): { kind: FoeKind; down: boolean } | null {
    const b = typeof i === 'number' ? this.foes[i] : i;
    if (!b || b.state !== 'come') return null;
    const bleeds = bloody && b.kind.bloody;
    b.met = true;
    // (On its knees, beaten: the next blow, whatever it is, sends it off far away, its body the page's until it is gone.)
    if (b.kneeling && this.onTaken) {
      b.state = 'taken'; b.since = 0; b.kneeling = false;
      this.downed++;
      if (b.kind.titles) this.lastGreat = b.title;
      this.onStruck?.(this.middleOf(b), push, b.size, false, bleeds);
      this.onTaken(b.gait.model, b.p.clone(), b.size, b.kind);
      return { kind: b.kind, down: true };
    }
    b.hp -= blow * this.might;
    // (Beaten, one that kneels goes down on its knees rather than falling, waiting for the last blow.)
    if (b.hp <= 0 && b.kind.kneels && this.onTaken && b.gait.kneel) {
      b.hp = 0; b.kneeling = true; b.reel = 0;
      b.gait.kneel();
      this.onStruck?.(this.middleOf(b), push, b.size, false, bleeds);
      return { kind: b.kind, down: false };
    }
    if (b.hp > 0) {
      b.reel = 0.45;
      b.gait.flinch();
      this.onStruck?.(this.middleOf(b), push, b.size, false, bleeds);
      return { kind: b.kind, down: false };
    }
    // (A yeti's weight thrown less far.)
    b.state = 'down'; b.since = 0; b.v.copy(push).multiplyScalar(Math.min(1, 1.6 / b.size));
    b.gait.fall();
    this.downed++;
    if (b.kind.titles) this.lastGreat = b.title;
    this.onStruck?.(this.middleOf(b), push, b.size, true, bleeds);
    return { kind: b.kind, down: true };
  }

  private letGo(b: Foe): void { b.state = 'gone'; b.penned = false; b.gait.model.visible = false; b.gait.stop(); }
  /** How many penned are still coming (none, and the fight is done). */
  get penned(): number { return this.foes.filter((b) => b.penned && (b.state === 'come' || b.state === 'taken')).length; }
  /** One sent off far away handed back, gone: fallen, as far as the count and its bar are concerned, and not drawn. */
  release(model: Object3D): void {
    const b = this.foes.find((f) => f.gait.model === model && f.state === 'taken');
    if (!b) return;
    b.state = 'down'; b.since = 0; b.v.set(0, 0, 0); b.penned = false;
    b.gait.stop();
    b.gait.model.visible = false;
  }
  /** The pen taken away: those in it go on as the rest do. */
  unpen(): void { this.pen = null; for (const b of this.foes) b.penned = false; }

  /**
   * Every one let go of, and the count begun again (a new run, or no gun); or, `keepCount`, the count kept: going into the cave on foot
   * and out of it again lets the run's foes go, but the run goes on, and its count had dropped to nothing mid-run.
   */
  clear(keepCount = false): void { for (const b of this.foes) if (b.state !== 'gone') this.letGo(b); if (!keepCount) this.downed = 0; this.pen = null; }
  /** How many are about. */
  get about(): number { return this.foes.filter((b) => b.state !== 'gone').length; }
  /** Where each still coming stands, for a script that drives the page; and what it is. */
  where(): Vector3[] { return this.foes.filter((b) => b.state === 'come').map((b) => b.p.clone()); }
  kinds(): FoeName[] { return this.foes.filter((b) => b.state === 'come').map((b) => b.kind.name); }
  /** Which way of a run that parts each coming keeps to, as `where` lists them. */
  ways(): number[] { return this.foes.filter((b) => b.state === 'come').map((b) => b.way); }
  /**
   * The great ones the skier has come to (within `MEET` metres, or struck), still coming, or fallen a moment ago; nearest first, two at
   * the most.
   */
  bosses(at: Vector3): Boss[] {
    return this.foes
      .map((b, i) => ({ b, i, far: Math.hypot(b.p.x - at.x, b.p.z - at.z) }))
      .filter(({ b }) => b.kind.titles && b.met && (b.state === 'come' || b.state === 'taken' || (b.state === 'down' && b.since < FELLED)))
      .sort((x, y) => x.far - y.far).slice(0, 2)
      .map(({ b, i }) => ({ id: `${i}.${b.comes}`, title: b.title, kind: b.kind.name, hp: Math.max(0, b.hp), most: b.kind.hp, down: b.state === 'down', kneeling: b.kneeling || b.state === 'taken' }));
  }
  /** Whether one is still coming (to be struck, or locked on). */
  coming(i: number): boolean { return this.foes[i]?.state === 'come'; }
  /** How strong one is still, and was, in blows; whether it is on its knees, beaten. */
  health(i: number): { hp: number; most: number; kneeling: boolean } | null {
    const b = this.foes[i];
    return b ? { hp: Math.max(0, b.hp), most: b.kind.hp, kneeling: b.kneeling } : null;
  }
  /** One's name: a great one's own, else its kind's. */
  titleOf(i: number): string { const b = this.foes[i]; return !b ? '' : b.kind.titles && b.title ? b.title : b.kind.name; }
  /** Each still coming and drawn (in a den, only those in sight): which, where its middle is, and how tall it stands. */
  marks(): { orc: number; at: Vector3; tall: number }[] {
    const out: { orc: number; at: Vector3; tall: number }[] = [];
    this.foes.forEach((b, i) => { if (b.state === 'come' && b.gait.model.visible) out.push({ orc: i, at: this.middleOf(b), tall: (b.kind.mid * 2 + 0.2) * b.size }); });
    return out;
  }
  /** Where each still coming is to be aimed at: its middle. */
  aims(): Vector3[] { return this.foes.filter((b) => b.state === 'come').map((b) => this.middleOf(b)); }
}
