/**
 * Orcs coming up the slope, to be shot (asked: "the player can mow down and shoot at hordes of goblins crawling up the slope"; then
 * "lets make the goblins more like orcs (so larger and wearing similar clothes as the player but brown grayish outfit color)"): hordes
 * of them, a few to nine or so together, crouched and coming up the run towards the skier from well ahead of it, edging across towards
 * its line as they come; each the skier's own body, a little larger than the skier, its skin a greenish grey, with pointed ears and
 * tusks, dressed as the skier is (`dressAdventurer`) but in browns and greys, its sword at its hip; going in its crouched walk. Struck
 * by a round (`hit`, `fall`), or run down by the skier, one falls as it is struck, thrown along the way it was struck, and lies a while
 * before it sinks into the snow. Those the skier has gone by are let go of, and more come.
 */
import {
  AnimationMixer, type AnimationAction, type AnimationClip, type BufferGeometry, ConeGeometry, LoopOnce, Matrix4, Mesh, MeshStandardMaterial, type Object3D,
  type Scene, type SkinnedMesh, Vector3,
} from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { Rng } from '../src/core/rng';
import type { FigureLibrary } from '../src/figures/library';
import { dressAdventurer, type Look } from '../src/figures/outfit';

/** The run the orcs come up: its snow's height, a point along and across it and which way it goes, its path's edges, its length. */
export interface HordeGround {
  ground(x: number, z: number): number;
  at(s: number, left: number): { x: number; z: number; dx: number; dz: number };
  edges(s: number): [number, number];
  length: number;
}
/** Where the skier is: in the scene, along the run and across it, and how fast it goes; and how near a body must come to be run down. */
export interface Quarry { at: Vector3; down: number; left: number; v: Vector3; reach: number }

/**
 * How large an orc is, against the skier (each its own, between these); how many there may be at once (each is the skier's body and
 * its clothes, some thirty thousand triangles); how far ahead of the skier they come from.
 */
const SIZE: [number, number] = [1.05, 1.2], MOST = 26, AHEAD: [number, number] = [120, 230];
/** An orc's clothes: the skier's, in browns and greys, the iron dull. */
const ORC: Look = { tunic: 0x5b5349, trousers: 0x433d36, boots: 0x2b221a, leather: 0x4b3726, cloak: 0x574c42, metal: 0x7c776e, grip: 0x24190f };

interface Orc {
  model: Object3D; mixer: AnimationMixer; walk: AnimationAction; die: AnimationAction; size: number;
  /** Where it is along the run and across it, and in the scene; how fast it comes; which way it faces. */
  s: number; left: number; p: Vector3; pace: number; yaw: number;
  /** `come` while it comes up the slope; `down` once it has fallen (how long since, and how it was thrown); `gone`, waiting to come. */
  state: 'come' | 'down' | 'gone'; since: number; v: Vector3;
  /** Its meshes, and whether they are drawn into the sun's shadows now: only near the skier, about which those are kept. */
  meshes: Mesh[]; casts: boolean;
}

/** An orc as a round strikes it: two balls one over the other, its crouched body and its head; how high each is and how large, for an orc of size one. */
const BALLS = [[0.6, 0.42], [1.1, 0.26]] as const;

export class Horde {
  private readonly orcs: Orc[] = [];
  private readonly rng = new Rng('orcs');
  private making = false;
  private readonly scratch = new Vector3();
  /** The orc's body as it is made once, dressed, and its moves (each orc a copy of it). */
  private kind: Promise<{ body: Object3D; moves: Map<string, { clip: AnimationClip }> }> | null = null;
  /** How many have been brought down this run. */
  downed = 0;
  /** How many there may be at once, coming, fallen and waiting; a horde comes while fewer than two fifths of as many are coming. */
  most = MOST;
  /** `onFall`, told where each falls (its middle), how it was thrown and how large it is, for its blood to be spilt. */
  constructor(private readonly library: FigureLibrary, private readonly scene: Scene, private readonly dress: (o: Object3D) => void, private readonly onFall?: (at: Vector3, push: Vector3, size: number, bloody: boolean) => void) {}

  /**
   * The orc's body, made once: the skier's bare body dressed in the orc's clothes, its skin greened and greyed and its eyes yellowed (on
   * the body made for it, which every orc's copy shares), ears and tusks put on its head.
   */
  private kindOf() {
    return (this.kind ??= this.library.body('base-man').then(({ model, moves }) => {
      const body = dressAdventurer(model, ORC, { sword: 'hip' });
      // (Its skin's own picture, tinted: greener and greyer; its eyes yellow; its brows dark.)
      const tint: Record<string, number> = { SuperHero_Male: 0x7c9a52, Eyes: 0xffb030, Eyebrows: 0x2a2a1e };
      body.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isSkinnedMesh || !(m.name in tint)) return;
        const made = (m.material as MeshStandardMaterial).clone();
        made.color.set(tint[m.name]);
        m.material = made;
      });
      let skin: SkinnedMesh | null = null;
      body.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh && o.name === 'SuperHero_Male') skin = o as SkinnedMesh; });
      if (skin) { const head = headPiece(skin); if (head) for (const [g, at] of FACE) head(g, at); }
      return { body, moves };
    }));
  }

  /**
   * The orc's body made ahead of need (it takes some part of a second, which riding along would feel), while the page is opening; and
   * the first orc made from it, hidden, so that what it is drawn with can be made ready before any comes.
   */
  async prepare(): Promise<void> {
    await this.kindOf();
    if (this.orcs.length || this.making) return;
    this.making = true;
    try { await this.make(); } finally { this.making = false; }
  }

  /** An orc made (one a frame or so until there are enough): a copy of the orc's body, its size its own. */
  private async make(): Promise<void> {
    const { body, moves } = await this.kindOf(), model = cloneRigged(body), size = this.rng.range(...SIZE);
    model.scale.setScalar(size);
    const meshes: Mesh[] = [];
    model.traverse((o) => { if ((o as Mesh).isMesh) { meshes.push(o as Mesh); o.castShadow = true; o.receiveShadow = true; if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; } });
    this.dress(model);
    const mixer = new AnimationMixer(model), walk = mixer.clipAction(moves.get('Crouch_Fwd_Loop')!.clip), die = mixer.clipAction(moves.get('Death01')!.clip);
    die.setLoop(LoopOnce, 1);
    die.clampWhenFinished = true;
    model.visible = false;
    this.scene.add(model);
    this.orcs.push({ model, mixer, walk, die, size, s: 0, left: 0, p: new Vector3(), pace: 1, yaw: 0, state: 'gone', since: 0, v: new Vector3(), meshes, casts: true });
  }

  /** A frame on, by `dt`: more come where there are too few ahead; each comes on, or lies where it fell. */
  update(dt: number, g: HordeGround, q: Quarry): void {
    if (this.orcs.length < this.most && !this.making) { this.making = true; void this.make().finally(() => { this.making = false; }); }
    // A horde comes, from well ahead, when there are too few coming.
    // (Where from is drawn by chance only when a horde may come: drawn every frame, which hordes came where went by how many frames
    // had been drawn, and the orc hunt was never twice the same.)
    const coming = this.orcs.filter((b) => b.state === 'come').length, free = this.orcs.filter((b) => b.state === 'gone');
    const s0 = coming < Math.round(this.most * 0.4) && free.length >= 3 ? q.down + this.rng.range(...AHEAD) : Infinity;
    if (s0 < g.length - 40) {
      const [lo, hi] = g.edges(s0), mid = this.rng.range(lo + 3, hi - 3), n = Math.min(free.length, this.rng.int(4, 9));
      for (let k = 0; k < n; k++) {
        const b = free[k], s = s0 + this.rng.range(-10, 10), left = mid + this.rng.range(-8, 8);
        Object.assign(b, { s, left, state: 'come', since: 0, pace: this.rng.range(0.9, 1.4) });
        b.walk.reset().setEffectiveTimeScale(b.pace).setEffectiveWeight(1).play();
        b.walk.time = this.rng.range(0, 2);
        b.die.stop();
        b.model.visible = true;
      }
    }
    for (const b of this.orcs) {
      if (b.state === 'gone') continue;
      b.since += dt;
      if (b.state === 'come') {
        // Up the run, and across towards the skier's line, the nearer the more.
        const was = g.at(b.s, b.left), across = Math.max(-1, Math.min(1, (q.left - b.left) / 12)) * 0.6;
        b.s -= b.pace * dt; b.left += across * dt;
        const at = g.at(b.s, b.left), mx = at.x - was.x, mz = at.z - was.z;
        if (Math.hypot(mx, mz) > 1e-5) b.yaw = Math.atan2(mx, mz);
        // (Climbing up out of the snow over its first moments, as it sinks into it when it is done with: none stands there all at once.)
        b.p.set(at.x, g.ground(at.x, at.z) - Math.max(0, 1 - b.since / 0.9) * 1.9 * b.size, at.z);
        // (Gone by: let go of. Run down: thrown on along the skier's way and up.)
        if (b.s < q.down - 30) { this.letGo(b); continue; }
        if (Math.hypot(b.p.x - q.at.x, b.p.z - q.at.z) < q.reach + 0.2 * b.size && Math.abs(b.p.y - q.at.y) < 2) {
          this.fall(b, q.v.clone().multiplyScalar(0.6).add(new Vector3(0, 4, 0)));
        }
      } else {
        // Thrown, and sliding to a stop on the snow; lying a while; then sinking into it, and gone.
        b.v.y -= 9.8 * dt;
        b.p.addScaledVector(b.v, dt);
        const y = g.ground(b.p.x, b.p.z);
        if (b.p.y <= y) { b.p.y = y; b.v.y = 0; b.v.multiplyScalar(Math.exp(-3 * dt)); }
        if (b.since > 3.6) b.p.y = y - (b.since - 3.6) * 0.6;
        if (b.since > 5.4) { this.letGo(b); continue; }
      }
      b.model.position.copy(b.p);
      // (Drawn into the sun's shadows only within fifty metres of the skier, about whom they are kept fourteen metres out: its skinned
      // body is never passed over as out of sight, and every orc on the run, a hundred metres off and more, was drawn into them each frame.)
      const casts = b.p.distanceToSquared(q.at) < 50 * 50;
      if (casts !== b.casts) { b.casts = casts; for (const m of b.meshes) m.castShadow = casts; }
      b.model.rotation.set(0, b.yaw, 0);
      b.mixer.update(dt);
    }
  }

  /**
   * The nearest orc still coming that a line from `from` along `dir` (of length one) passes through, before `reach` metres: which, and
   * how far along. Each is reckoned as two balls one over the other, its crouched body and its head, as large as it is.
   */
  hit(from: Vector3, dir: Vector3, reach: number): { t: number; orc: number } | null {
    let best: { t: number; orc: number } | null = null;
    const c = this.scratch;
    this.orcs.forEach((b, i) => {
      if (b.state !== 'come') return;
      for (const [up, r] of BALLS) {
        c.set(b.p.x, b.p.y + up * b.size, b.p.z).sub(from);
        const t = c.dot(dir), rr = r * b.size;
        if (t < 0 || t > reach || (best && t >= best.t)) continue;
        if (c.lengthSq() - t * t < rr * rr) best = { t, orc: i };
      }
    });
    return best;
  }
  /** Where an orc's middle is, for snow to be thrown from where it falls. */
  middle(i: number): Vector3 { const b = this.orcs[i]; return b.p.clone().add(new Vector3(0, 0.6 * b.size, 0)); }

  /**
   * Each orc still coming within `r` metres of `at`, across the snow, and not further above or below it than the run's steepest
   * snow could rise or fall over as far (with three metres more): which, and where its middle is (for what strikes all about a
   * point, or leaps from one to the next). (Kept to three metres above or below, an orc a few metres down a steep run was out of reach.)
   */
  near(at: Vector3, r: number): { orc: number; at: Vector3 }[] {
    const out: { orc: number; at: Vector3 }[] = [];
    this.orcs.forEach((b, i) => {
      if (b.state !== 'come') return;
      const across = Math.hypot(b.p.x - at.x, b.p.z - at.z);
      if (across > r || Math.abs(b.p.y + 0.6 * b.size - at.y) > 3 + 0.85 * across) return;
      out.push({ orc: i, at: b.p.clone().add(new Vector3(0, 0.6 * b.size, 0)) });
    });
    return out;
  }

  /** An orc falls, thrown by `push`, if it is still coming (`bloody`, as a blade or a round brings it down; not burnt or struck by lightning). Gives back whether it fell. */
  fall(i: number | Orc, push: Vector3, bloody = true): boolean {
    const b = typeof i === 'number' ? this.orcs[i] : i;
    if (!b || b.state !== 'come') return false;
    b.state = 'down'; b.since = 0; b.v.copy(push);
    b.die.reset().setEffectiveTimeScale(1.2).setEffectiveWeight(1).play();
    b.walk.crossFadeTo(b.die, 0.12, false);
    this.downed++;
    this.onFall?.(b.p.clone().add(new Vector3(0, 0.6 * b.size, 0)), push, b.size, bloody);
    return true;
  }

  private letGo(b: Orc): void { b.state = 'gone'; b.model.visible = false; b.walk.stop(); b.die.stop(); }

  /** Every orc let go of, and the count begun again (a new run, or no gun). */
  clear(): void { for (const b of this.orcs) if (b.state !== 'gone') this.letGo(b); this.downed = 0; }
  /** How many are about. */
  get about(): number { return this.orcs.filter((b) => b.state !== 'gone').length; }
  /** Where each still coming is, for a script that drives the page. */
  where(): Vector3[] { return this.orcs.filter((b) => b.state === 'come').map((b) => b.p.clone()); }
}

const SKIN = new MeshStandardMaterial({ color: 0x6f8a4a, roughness: 0.7 });
const TUSK = new MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.45 });
/**
 * What is put on an orc's head, about the head's joint as the body stands at rest (forward +z, up +y, its left +x): two pointed ears out
 * through the hood, and two tusks up from the lower jaw.
 */
const FACE: [BufferGeometry, Matrix4, MeshStandardMaterial?][] = (() => {
  const ear = new ConeGeometry(0.03, 0.13, 6).translate(0, 0.065, 0), tusk = new ConeGeometry(0.011, 0.045, 6).translate(0, 0.022, 0);
  const turned = (x: number, y: number, z: number, rx: number, rz: number) => new Matrix4().makeRotationZ(rz).premultiply(new Matrix4().makeRotationX(rx)).setPosition(x, y, z);
  return [
    [ear, turned(0.075, 0.08, -0.005, -0.45, -1.2)], [ear, turned(-0.075, 0.08, -0.005, -0.45, 1.2)],
    [tusk, turned(0.022, 0.005, 0.085, 0.15, -0.15), TUSK], [tusk, turned(-0.022, 0.005, 0.085, 0.15, 0.15), TUSK],
  ];
})();

/**
 * Hangs pieces on a body's head, laid out about the head's joint as the skeleton stands at rest and put into the head bone's own frame
 * by the inverse of where it stood, as the figures' gear is hung (`gear.ts`).
 */
function headPiece(skinned: SkinnedMesh): ((g: BufferGeometry, at: Matrix4, m?: MeshStandardMaterial) => void) | null {
  const sk = skinned.skeleton, i = sk.bones.findIndex((b) => b.name === 'Head');
  if (i < 0) return null;
  const bone = sk.bones[i], inverse = sk.boneInverses[i], rest = new Vector3().setFromMatrixPosition(inverse.clone().invert());
  return (g, at, m = SKIN) => {
    const mesh = new Mesh(g, m);
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(inverse.clone().multiply(new Matrix4().makeTranslation(rest.x, rest.y, rest.z).multiply(at)));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    bone.add(mesh);
  };
}
