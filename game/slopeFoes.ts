/**
 * What comes up the run besides the orcs (asked: "we need more monster variety besides our orcs"): the kinds of foe a horde is made of
 * (`FOES`), each how large, how fast, in how large a pack, how hard to bring down and how much it is worth; and the bodies they come in
 * (`Gait`). Four are the skier's own body made over, as the orc always was: the orc itself, crouched; goblins, small and quick, running
 * in big packs, long-eared and long-nosed; the draugr, the frozen dead, shambling, pale and rimed with ice, glowing blue in the eyes,
 * that take two blows and do not bleed; and yetis, twice a man's height in a coat of shaggy white fur, few, slow and hard to bring down.
 * The fifth is made here in code: wolves, grey, galloping up the run faster than anything else and cutting hard across towards the
 * skier's line. The horde moves them, strikes them and lets them fall (`slopeOrcs.ts`).
 */
import {
  type AnimationAction, AnimationMixer, type AnimationClip, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, LoopOnce,
  Matrix3, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, SkinnedMesh, SphereGeometry, Vector3,
} from 'three';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { fbm3, hash1 } from '../src/core/rng';
import type { FigureLibrary } from '../src/figures/library';
import { dressAdventurer, type Look } from '../src/figures/outfit';
import type { Dice } from './slopeDice';

/** A body as the horde moves it: one of the figures' bodies with its clips (`Figure`), or one made here (`Wolf`). */
export interface Gait {
  readonly model: Object3D;
  /** Its meshes, drawn into the sun's shadows or not as the horde says. */
  readonly meshes: Mesh[];
  /** Set going at `pace` metres a second, `phase` (0 to 1) into its stride. */
  go(pace: number, phase: number): void;
  /** Struck and not brought down: it reels a moment. */
  flinch(): void;
  /** Brought down. */
  fall(): void;
  /** Brought to its knees, beaten, waiting for the last blow (`FoeKind.kneels`). */
  kneel?(): void;
  stop(): void;
  update(dt: number): void;
}
/** How a body of a kind is made, its size given, and which of its coats (where it has more than one, by a number from 0 to 1). */
export type Maker = (size: number, coat: number) => Gait;

export type FoeName = 'orc' | 'goblin' | 'wolf' | 'draugr' | 'yeti' | 'barrow-king';
export interface FoeKind {
  name: FoeName;
  /** How large, against the skier; how fast it comes up the run (metres a second); how many come together. */
  size: [number, number]; pace: [number, number]; pack: [number, number];
  /**
   * How many blows bring it down (a blow is `HP` hit points, `slopeDice.ts`; asked: "basic enemies can have a bit more health", an orc
   * two and a half where it had been one); how many times an orc's points it is worth.
   */
  hp: number; worth: number;
  /** How hard it is to strike: what an attack's d20 and the arm's skill must come to (`slopeDice.ts`). */
  guard: number;
  /** How often a horde is of this kind, against the others; from how far down the run (0 to 1) it comes at all. */
  chance: number; from: number;
  /** What share of the horde's bodies may be of this kind; how far apart a pack comes, along the run and across it. */
  share: number; spread: number;
  /** How hard it edges across towards the skier's line (an orc's, 1). */
  hunt: number;
  /** Its middle's height, and the balls it is struck as (forward, up, radius), for one of size one. */
  mid: number; balls: [number, number, number][];
  /** Whether it bleeds; how long it lies where it fell before it sinks into the snow. */
  bloody: boolean; lies: number;
  /** Its body, made once (it takes some part of a second), and a maker of copies of it. */
  body: (library: FigureLibrary) => Promise<Maker>;
  /**
   * The names one may go by, for a foe met as a great one, its strength shown in a bar across the foot of the picture as the skier
   * comes to it (`Horde.bosses`).
   */
  titles?: string[];
  /**
   * In the cave's dungeon (`Horde.within`), if it comes there: how fast it comes at the one on foot (metres a second), how many come
   * together, how often a pack is of this kind (against the others; a great one, how likely it is to come alone in a pack's stead), and
   * its skill, added to its d20 against the guard of the one on foot, and its damage dice
   * (`slopeDice.ts`; the points lost to a blow struck home, thirty for each hit point).
   */
  den?: { pace: [number, number]; pack: [number, number]; chance: number; skill: number; dmg: Dice };
  /** Beaten, it goes down on its knees rather than falling, and the next blow sends it off far away (`Horde.strike`, `slope.ts`). */
  kneels?: boolean;
}

/** A standing body's balls: its trunk and its head. */
const UPRIGHT: [number, number, number][] = [[0, 1.0, 0.4], [0, 1.58, 0.25]];
export const FOES: FoeKind[] = [
  {
    name: 'orc', size: [1.05, 1.2], pace: [0.9, 1.4], pack: [4, 9], hp: 2.4, worth: 1, guard: 11, chance: 5, from: 0, share: 0.35, spread: 9, hunt: 1,
    mid: 0.6, balls: [[0, 0.6, 0.42], [0, 1.1, 0.26]], bloody: true, lies: 3.6,
    body: (library) => rigged(library, orcBody, { walk: 'Crouch_Fwd_Loop', die: 'Death01' }),
    den: { pace: [1.3, 1.9], pack: [2, 4], chance: 3, skill: 3, dmg: { n: 1, d: 8, plus: 2 } },
  },
  {
    name: 'goblin', size: [0.66, 0.78], pace: [2.6, 3.6], pack: [5, 10], hp: 1.6, worth: 1, guard: 13, chance: 3, from: 0, share: 0.4, spread: 10, hunt: 1.3,
    mid: 1.0, balls: UPRIGHT, bloody: true, lies: 3.6,
    body: (library) => rigged(library, goblinBody, { walk: 'Jog_Fwd_Loop', die: 'Death01', speed: 5.2 }),
    den: { pace: [2.3, 3.0], pack: [3, 5], chance: 2, skill: 4, dmg: { n: 1, d: 6, plus: 0 } },
  },
  {
    name: 'wolf', size: [0.95, 1.15], pace: [4.2, 5.6], pack: [3, 6], hp: 2, worth: 1.5, guard: 14, chance: 2.5, from: 0.04, share: 0.3, spread: 7, hunt: 2.6,
    mid: 0.72, balls: [[0.3, 0.74, 0.3], [-0.25, 0.7, 0.28], [0.7, 0.95, 0.18]], bloody: true, lies: 3.2,
    body: async () => (size, coat) => new Wolf(size, coat),
  },
  {
    name: 'draugr', size: [1.0, 1.12], pace: [0.55, 0.8], pack: [3, 7], hp: 3.6, worth: 1.5, guard: 10, chance: 2, from: 0.1, share: 0.3, spread: 8, hunt: 0.5,
    mid: 1.0, balls: UPRIGHT, bloody: false, lies: 3.6,
    body: (library) => rigged(library, draugrBody, { walk: 'Zombie_Walk_Fwd_Loop', die: 'Death01', hit: 'Hit_Chest', speed: 1.0 }),
    den: { pace: [0.9, 1.25], pack: [2, 4], chance: 2, skill: 2, dmg: { n: 1, d: 10, plus: 4 } },
  },
  {
    name: 'yeti', size: [1.9, 2.25], pace: [1.4, 1.9], pack: [1, 2], hp: 10, worth: 5, guard: 12, chance: 1, from: 0.18, share: 0.1, spread: 6, hunt: 0.8,
    mid: 1.0, balls: [[0, 0.95, 0.48], [0, 1.55, 0.3]], bloody: true, lies: 5,
    body: (library) => rigged(library, yetiBody, { walk: 'Walk_Loop', die: 'Death01', hit: 'Hit_Chest', kneel: 'Fixing_Kneeling', speed: 1.0 }, 1.14),
    kneels: true,
    titles: [
      'Skarn, Who Walks the Cornice', 'The Old Man of the Drifts', 'Hrimmal, the White Hunger', 'Mother of Whiteouts',
      'Ymmar, Frost Under the Pass', 'Grey Maw of the Upper Snows', 'Ulvgard the Avalanche-Born', 'The Hermit of the Col',
    ],
  },
  {
    // (Only in the dungeon (asked: "maybe the dungeons can have other than orcs as well now. Possible single stronger opponent some times
    // also"): a great one of the dead, half as tall again as a man, crowned, alone; never on the snow, `from` past the run's foot.)
    name: 'barrow-king', size: [1.5, 1.6], pace: [1, 1.2], pack: [1, 1], hp: 16, worth: 6, guard: 14, chance: 0, from: 2, share: 0.04, spread: 0, hunt: 0,
    mid: 1.0, balls: [[0, 0.98, 0.45], [0, 1.58, 0.27]], bloody: false, lies: 5,
    body: (library) => rigged(library, kingBody, { walk: 'Zombie_Walk_Fwd_Loop', die: 'Death01', hit: 'Hit_Chest', speed: 1.0 }),
    titles: ['Sverre, the Barrow-King', 'Old Hrodna of the Mound', 'The Crowned Dead', 'Haldor Ice-Beard', 'Gunnvor, Who Keeps the Tomb', 'The Jarl Under the Snow'],
    den: { pace: [1.0, 1.25], pack: [1, 1], chance: 0.2, skill: 5, dmg: { n: 2, d: 8, plus: 7 } },
  },
];

// ------------------------------------------------------------------------------------------------ the figures' bodies made over

/** Which clips a figure plays, coming, falling and struck; and how fast its coming clip carries a body of size one, if that is known. */
interface Clips { walk: string; die: string; hit?: string; kneel?: string; speed?: number }

/** A figure's body, made once, and a maker of copies of it, `broad` times broader than it is tall (a yeti is bulky). */
async function rigged(library: FigureLibrary, make: (bare: Object3D) => Object3D, clips: Clips, broad = 1): Promise<Maker> {
  const { model, moves } = await library.body('base-man'), body = make(model);
  return (size) => {
    const copy = cloneRigged(body), meshes: Mesh[] = [];
    copy.scale.set(size * broad, size, size * broad);
    copy.traverse((o) => { if ((o as Mesh).isMesh) { meshes.push(o as Mesh); o.castShadow = true; o.receiveShadow = true; if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; } });
    return new Figure(copy, meshes, moves, clips, size);
  };
}

/** One of the figures' bodies going up the run: its clip of coming played as fast as it goes, a clip of reeling as it is struck, and of falling. */
class Figure implements Gait {
  private readonly mixer: AnimationMixer;
  private readonly walk: AnimationAction;
  private readonly die: AnimationAction;
  private readonly hit: AnimationAction | null;
  private readonly down: AnimationAction | null;
  private scale = 1;
  private reeling = 0;
  constructor(readonly model: Object3D, readonly meshes: Mesh[], moves: Map<string, { clip: AnimationClip }>, private readonly clips: Clips, private readonly size: number) {
    this.mixer = new AnimationMixer(model);
    this.walk = this.mixer.clipAction(moves.get(clips.walk)!.clip);
    this.die = this.mixer.clipAction(moves.get(clips.die)!.clip);
    this.die.setLoop(LoopOnce, 1);
    this.die.clampWhenFinished = true;
    this.hit = clips.hit ? this.mixer.clipAction(moves.get(clips.hit)!.clip) : null;
    if (this.hit) { this.hit.setLoop(LoopOnce, 1); this.hit.clampWhenFinished = true; }
    this.down = clips.kneel && moves.get(clips.kneel) ? this.mixer.clipAction(moves.get(clips.kneel)!.clip) : null;
  }
  kneel() {
    if (!this.down) return;
    this.reeling = 0;
    this.down.reset().setEffectiveTimeScale(0.8).setEffectiveWeight(1).play();
    for (const a of [this.walk, this.hit]) if (a?.isRunning()) a.crossFadeTo(this.down, 0.3, false);
  }
  go(pace: number, phase: number) {
    // (Its stride played as fast as it goes, where how far one carries it is known, that its feet do not slide over the snow.)
    this.scale = this.clips.speed ? pace / (this.clips.speed * this.size) : pace;
    this.reeling = 0;
    this.hit?.stop(); this.die.stop(); this.down?.stop();
    this.walk.reset().setEffectiveTimeScale(this.scale).setEffectiveWeight(1).play();
    this.walk.time = phase * this.walk.getClip().duration;
  }
  flinch() {
    // (Struck again while it reels, it reels on: begun again at each round of a tommy gun, it stood frozen in the first moment of it.)
    if (!this.hit || this.reeling > 0) return;
    this.hit.reset().setEffectiveTimeScale(1.5).setEffectiveWeight(1).play();
    this.walk.crossFadeTo(this.hit, 0.06, false);
    this.reeling = (this.hit.getClip().duration / 1.5) * 0.55;
  }
  fall() {
    const from = this.down?.isRunning() ? this.down : this.reeling > 0 && this.hit ? this.hit : this.walk;
    this.reeling = 0;
    this.die.reset().setEffectiveTimeScale(1.2).setEffectiveWeight(1).play();
    from.crossFadeTo(this.die, 0.12, false);
  }
  stop() { this.walk.stop(); this.die.stop(); this.hit?.stop(); this.down?.stop(); this.reeling = 0; }
  update(dt: number) {
    if (this.reeling > 0 && (this.reeling -= dt) <= 0 && this.hit) {
      // (Faded out as it reeled, its coming clip is taken up again where it was left.)
      this.walk.enabled = true;
      this.walk.setEffectiveTimeScale(this.scale).play();
      this.hit.crossFadeTo(this.walk, 0.25, false);
    }
    this.mixer.update(dt);
  }
}

/** Each named mesh of a body given a colour over its own picture; and those named in `glow`, a light of their own (eyes that shine). */
function tint(body: Object3D, colours: Record<string, number>, glow: Record<string, number> = {}) {
  body.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    if (m.name in glow) { m.material = new MeshBasicMaterial({ color: glow[m.name] }); return; }
    if (!(m.name in colours)) return;
    const made = (m.material as MeshStandardMaterial).clone();
    made.color.set(colours[m.name]);
    m.material = made;
  });
}
/** The body's skin, its largest skinned mesh. */
function skinOf(body: Object3D): SkinnedMesh | null {
  let skin: SkinnedMesh | null = null;
  body.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh && o.name === 'SuperHero_Male') skin = o as SkinnedMesh; });
  return skin;
}

/** An orc's clothes: the skier's, in browns and greys, the iron dull. */
const ORC: Look = { tunic: 0x5b5349, trousers: 0x433d36, boots: 0x2b221a, leather: 0x4b3726, cloak: 0x574c42, metal: 0x7c776e, grip: 0x24190f };
/** The orc: the skier's body dressed in the orc's clothes, its skin greened and greyed, its eyes yellow; pointed ears and tusks. */
function orcBody(bare: Object3D): Object3D {
  const body = dressAdventurer(bare, ORC, { sword: 'hip' });
  tint(body, { SuperHero_Male: 0x7c9a52, Eyes: 0xffb030, Eyebrows: 0x2a2a1e });
  hang(body, [[EAR, turned(0.075, 0.08, -0.005, -0.45, -1.2)], [EAR, turned(-0.075, 0.08, -0.005, -0.45, 1.2)],
    [TUSK, turned(0.022, 0.005, 0.085, 0.15, -0.15), IVORY], [TUSK, turned(-0.022, 0.005, 0.085, 0.15, 0.15), IVORY]], ORC_SKIN);
  return body;
}

/** A goblin's rags: an ochre hood, patched brown leather, a rusty blade. */
const GOBLIN: Look = { tunic: 0x6b4c2c, trousers: 0x4d3b27, boots: 0x2a1f15, leather: 0x3e2a1a, cloak: 0x8a6a28, metal: 0x7a5c44, grip: 0x24190f };
const GOBLIN_SKIN = new MeshStandardMaterial({ color: 0x86a83c, roughness: 0.7 });
/** The goblin: a bright green skin and red eyes; long ears out sideways through its hood, and a long pointed nose. */
function goblinBody(bare: Object3D): Object3D {
  const body = dressAdventurer(bare, GOBLIN, { sword: 'back' });
  tint(body, { SuperHero_Male: 0x93bb48, Eyebrows: 0x1e2410 }, { Eyes: 0xff4a1c });
  const ear = new ConeGeometry(0.034, 0.24, 6).translate(0, 0.12, 0), nose = new ConeGeometry(0.02, 0.075, 6).translate(0, 0.037, 0);
  hang(body, [[ear, turned(0.075, 0.07, -0.01, -0.25, -1.4)], [ear, turned(-0.075, 0.07, -0.01, -0.25, 1.4)], [nose, turned(0, 0.035, 0.09, 1.35, 0)]], GOBLIN_SKIN);
  return body;
}

/** The draugr's grave-clothes: faded blue-greys whitened with frost, frosted iron. */
const DRAUGR: Look = { tunic: 0x76858f, trousers: 0x5a646c, boots: 0x3a3f44, leather: 0x5b5650, cloak: 0xa9bac6, metal: 0xc4d2da, grip: 0x2a2520 };
const ICE = new MeshStandardMaterial({ color: 0xcfeefa, roughness: 0.15, metalness: 0.1 });
/** The draugr: pale ice-blue skin, eyes that shine blue, icicles hanging from its brow and its chin. */
function draugrBody(bare: Object3D): Object3D {
  const body = dressAdventurer(bare, DRAUGR, { sword: 'hip' });
  tint(body, { SuperHero_Male: 0xd8f0ff, Eyebrows: 0xeef6fa }, { Eyes: 0x7fe3ff });
  const icicle = (r: number, h: number) => new ConeGeometry(r, h, 5).translate(0, -h / 2, 0).rotateX(Math.PI);
  const pieces: [BufferGeometry, Matrix4, MeshStandardMaterial?][] = [];
  for (const [x, h] of [[-0.03, 0.05], [-0.012, 0.075], [0.008, 0.06], [0.026, 0.045]] as const) pieces.push([icicle(0.008, h), turned(x, -0.06, 0.07, 0, 0)]);
  for (const [x, h] of [[-0.045, 0.03], [0.04, 0.035]] as const) pieces.push([icicle(0.006, h), turned(x, 0.075, 0.09, 0, 0)]);
  hang(body, pieces, ICE);
  return body;
}

/** The barrow-king's grave-clothes: a king's, gone dark, a cloak the blue of deep ice, its iron gilt. */
const KING: Look = { tunic: 0x3d4652, trousers: 0x2c3138, boots: 0x1d1f22, leather: 0x4a3a2a, cloak: 0x2e5a7a, metal: 0xc9a24a, grip: 0x2a2018 };
const GILT = new MeshStandardMaterial({ color: 0xd4a83c, roughness: 0.3, metalness: 0.85 });
/** The barrow-king: a draugr dressed as a king of old, an iron crown gilt and spiked about its brow, icicles in its beard. */
function kingBody(bare: Object3D): Object3D {
  const body = dressAdventurer(bare, KING, { sword: 'back' });
  tint(body, { SuperHero_Male: 0xc8e4f2, Eyebrows: 0xeef6fa }, { Eyes: 0x9ff0ff });
  const pieces: [BufferGeometry, Matrix4, MeshStandardMaterial?][] = [];
  // (The crown: a band about the head, as broad as the hood, and a spike standing up from it every so far round.)
  pieces.push([new CylinderGeometry(0.118, 0.112, 0.045, 20, 1, true), turned(0, 0.13, -0.01, 0, 0)]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, spike = new ConeGeometry(0.016, i % 2 ? 0.06 : 0.09, 5).translate(0, i % 2 ? 0.03 : 0.045, 0);
    pieces.push([spike, turned(Math.sin(a) * 0.115, 0.15, Math.cos(a) * 0.115 - 0.01, 0, 0)]);
  }
  const icicle = (r: number, h: number) => new ConeGeometry(r, h, 5).translate(0, -h / 2, 0).rotateX(Math.PI);
  for (const [x, h] of [[-0.034, 0.08], [-0.014, 0.11], [0.008, 0.09], [0.028, 0.07]] as const) pieces.push([icicle(0.01, h), turned(x, -0.06, 0.07, 0, 0), ICE]);
  hang(body, pieces, GILT);
  return body;
}

/** The yeti: the bare body in a coat of shaggy white fur that leaves its face out, the face dark slate, the eyes shining icy; fangs down from its upper jaw. */
function yetiBody(bare: Object3D): Object3D {
  const body = cloneRigged(bare);
  tint(body, { SuperHero_Male: 0x56606c, Eyebrows: 0xe4ebf0 }, { Eyes: 0xa8ecff });
  const skin = skinOf(body);
  if (skin) furCoat(body, skin);
  const fang = new ConeGeometry(0.012, 0.05, 6).translate(0, -0.025, 0).rotateX(Math.PI);
  hang(body, [[fang, turned(0.024, 0.005, 0.088, 0.1, 0.1)], [fang, turned(-0.024, 0.005, 0.088, 0.1, -0.1)]], IVORY);
  return body;
}

/**
 * A coat of fur over a bare body, as the figures' clothes are made over it (`outfit.ts`): every bit of the skin but the face lifted off
 * it, the more over the shoulders and the back and the less over the hands and the feet, smoothed, then roughed up point by point, a
 * tuft standing out here and there and hanging down; its whites mottled, greyer in the hollows. Drawn in facets, which reads as shag.
 * The skin is no longer drawn where the fur covers it.
 */
function furCoat(model: Object3D, skin: SkinnedMesh) {
  model.updateMatrixWorld(true);
  const bones = skin.skeleton.bones, names = bones.map((b) => b.name);
  const local = skin.matrixWorld.clone(), toLocal = local.clone().invert(), toModel = model.matrixWorld.clone().invert();
  const joint = (n: string) => bones[names.indexOf(n)].getWorldPosition(new Vector3()).applyMatrix4(toModel);
  const head = joint('Head'), chest = joint('spine_03'), pelvis = joint('pelvis');
  const g = skin.geometry, P = g.getAttribute('position'), N = g.getAttribute('normal'), SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight');
  const n = P.count, normalOf = new Matrix3().getNormalMatrix(local);
  const at: Vector3[] = [], nrm: Vector3[] = [], bone: string[] = [];
  for (let i = 0; i < n; i++) {
    at.push(new Vector3().fromBufferAttribute(P, i).applyMatrix4(local));
    nrm.push(new Vector3().fromBufferAttribute(N, i).applyMatrix3(normalOf).normalize());
    let best = 0, w = -1;
    for (let k = 0; k < 4; k++) { const x = SW.getComponent(i, k); if (x > w) { w = x; best = SI.getComponent(i, k); } }
    bone.push(names[best]);
  }
  const is = (b: string, ...parts: string[]) => parts.some((p) => b.startsWith(p));
  const span = Math.max(0.15, ...at.filter((_, i) => bone[i] === 'Head').map((p) => p.y - head.y));
  const face = at.map((p, i) => is(bone[i], 'Head', 'neck_01') && nrm[i].z > 0.25 && p.z > head.z && p.y < head.y + 0.55 * span && p.y > head.y - 0.4 * span && Math.abs(p.x) < 0.28 * span);
  /** How deep the fur is over each point. */
  const deep = (i: number) => {
    const b = bone[i], p = at[i];
    if (is(b, 'hand_', 'thumb_', 'index_', 'middle_', 'ring_', 'pinky_')) return 0.012;
    if (is(b, 'foot_', 'ball_')) return 0.02;
    let d = 0.04;
    // (Heaped over the shoulders and the upper back, a mane; fuller on the forearms and the shins.)
    if (p.y > chest.y - 0.05 && is(b, 'spine_', 'clavicle_', 'neck_01', 'upperarm_')) d += 0.035 * Math.max(0, Math.min(1, (p.y - chest.y + 0.05) / 0.2)) * (p.z < chest.z ? 1.3 : 0.8);
    if (is(b, 'lowerarm_', 'calf_')) d += 0.015;
    if (is(b, 'pelvis', 'thigh_') && p.y < pelvis.y) d += 0.01;
    return d;
  };
  const index = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  const tris: number[] = [], bare: number[] = [];
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (!face[a] || !face[b] || !face[c]) tris.push(a, b, c);
    if (face[a] || face[b] || face[c]) bare.push(a, b, c);
  }
  const used = [...new Set(tris)], remap = new Map(used.map((v, j) => [v, j]));
  // (Points the mesh keeps twice at one place, along a seam of its picture, smoothed and roughed as one: else the fur opens there.)
  const keyOf = (v: number) => `${at[v].x.toFixed(4)},${at[v].y.toFixed(4)},${at[v].z.toFixed(4)}`;
  const one = new Map<string, number>(), weld = used.map((v, j) => { const key = keyOf(v); if (!one.has(key)) one.set(key, j); return one.get(key)!; });
  const near = used.map(() => new Set<number>());
  for (let t = 0; t < tris.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) near[weld[remap.get(tris[t + a])!]].add(weld[remap.get(tris[t + b])!]);
  const lifted = used.map((v) => at[v].clone().addScaledVector(nrm[v], deep(v)));
  for (let pass = 0; pass < 3; pass++) {
    const next = lifted.map((p, j) => {
      if (weld[j] !== j || !near[j].size || face[used[j]]) return p;
      const mid = new Vector3();
      for (const o of near[j]) mid.add(lifted[o]);
      return p.clone().lerp(mid.divideScalar(near[j].size), 0.5);
    });
    next.forEach((p, j) => lifted[j].copy(next[weld[j]]));
  }
  // Roughed up: each point out a little or a lot, some tufts well out, and hanging, as long fur does.
  const shag = used.map((v, j) => {
    const w = weld[j], thin = deep(v) < 0.03 ? 0.35 : 1, p = at[used[w]];
    const tuft = 0.5 + 0.5 * fbm3(p.x * 22, p.y * 22, p.z * 22, 2, 7), spike = hash1(w, 11) > 0.86 ? hash1(w, 12) : 0;
    return thin * (0.012 + 0.03 * tuft + 0.045 * spike);
  });
  const pos = new Float32Array(used.length * 3), col = new Float32Array(used.length * 3), si = new Uint16Array(used.length * 4), sw = new Float32Array(used.length * 4);
  const white = new Color(0xe9eef2), q = new Vector3();
  used.forEach((v, j) => {
    const w = weld[j], out = shag[w];
    q.copy(lifted[w]).addScaledVector(nrm[used[w]], out).add(new Vector3(0, -0.6 * Math.max(0, out - 0.03), 0)).applyMatrix4(toLocal);
    pos.set([q.x, q.y, q.z], j * 3);
    const p = at[used[w]], m = 0.86 + 0.1 * fbm3(p.x * 6, p.y * 6, p.z * 6, 2, 3) + 1.4 * Math.max(0, out - 0.035);
    const c = white.clone().multiplyScalar(Math.min(1.04, m));
    col.set([c.r, c.g * 1.0, c.b * 1.02], j * 3);
    for (let k = 0; k < 4; k++) { si[j * 4 + k] = SI.getComponent(v, k); sw[j * 4 + k] = SW.getComponent(v, k); }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new BufferAttribute(sw, 4));
  geo.setIndex(tris.map((v) => remap.get(v)!));
  geo.computeVertexNormals();
  const fur = new SkinnedMesh(geo, Object.assign(new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), { name: 'Fur' }));
  fur.name = 'Yeti_Fur';
  fur.position.copy(skin.position); fur.quaternion.copy(skin.quaternion); fur.scale.copy(skin.scale);
  fur.castShadow = fur.receiveShadow = true;
  fur.frustumCulled = false;
  skin.parent!.add(fur);
  fur.bind(skin.skeleton, skin.bindMatrix);
  const face1 = g.clone();
  face1.setIndex(bare);
  skin.geometry = face1;
}

const ORC_SKIN = new MeshStandardMaterial({ color: 0x6f8a4a, roughness: 0.7 });
const IVORY = new MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.45 });
const EAR = new ConeGeometry(0.03, 0.13, 6).translate(0, 0.065, 0), TUSK = new ConeGeometry(0.011, 0.045, 6).translate(0, 0.022, 0);
/** Where a piece sits about the head's joint as the body stands at rest (forward +z, up +y, its left +x), turned about x, then z. */
function turned(x: number, y: number, z: number, rx: number, rz: number) { return new Matrix4().makeRotationZ(rz).premultiply(new Matrix4().makeRotationX(rx)).setPosition(x, y, z); }

/**
 * Hangs pieces on a body's head, laid out about the head's joint as the skeleton stands at rest and put into the head bone's own frame
 * by the inverse of where it stood, as the figures' gear is hung (`gear.ts`); each in its own paint, or `paint`.
 */
function hang(body: Object3D, pieces: [BufferGeometry, Matrix4, MeshStandardMaterial?][], paint: MeshStandardMaterial) {
  const skinned = skinOf(body);
  if (!skinned) return;
  const sk = skinned.skeleton, i = sk.bones.findIndex((b) => b.name === 'Head');
  if (i < 0) return;
  const bone = sk.bones[i], inverse = sk.boneInverses[i], rest = new Vector3().setFromMatrixPosition(inverse.clone().invert());
  for (const [g, at, m = paint] of pieces) {
    const mesh = new Mesh(g, m);
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(inverse.clone().multiply(new Matrix4().makeTranslation(rest.x, rest.y, rest.z).multiply(at)));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    bone.add(mesh);
  }
}

// ------------------------------------------------------------------------------------------------ the wolf, made here

/** A geometry made shaggy: each point pushed out or in along its normal by a little noise. */
function shaggy<T extends BufferGeometry>(g: T, amount: number, seed: number): T {
  const p = g.getAttribute('position'), nr = g.getAttribute('normal'), v = new Vector3(), m = new Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); m.fromBufferAttribute(nr, i);
    const d = amount * fbm3(v.x * 9 + seed, v.y * 9, v.z * 9, 2, seed);
    p.setXYZ(i, v.x + m.x * d, v.y + m.y * d, v.z + m.z * d);
  }
  g.computeVertexNormals();
  return g;
}
const ball = (sx: number, sy: number, sz: number, seed: number) => shaggy(new SphereGeometry(1, 14, 10).scale(sx, sy, sz), 0.05, seed);
/** A wolf's parts, made once, which every wolf shares: their shapes, and the paints of its three coats. */
const WOLF = (() => {
  const coat = (fur: number, dark: number, pale: number) => ({
    fur: new MeshStandardMaterial({ color: fur, roughness: 0.95, flatShading: true }),
    dark: new MeshStandardMaterial({ color: dark, roughness: 0.95, flatShading: true }),
    pale: new MeshStandardMaterial({ color: pale, roughness: 0.95, flatShading: true }),
  });
  return {
    coats: [coat(0x77726b, 0x4a4642, 0xbdb6aa), coat(0x4a4744, 0x2a2826, 0x8c857c), coat(0xa49c8f, 0x6d665d, 0xd8d2c6)],
    nose: new MeshStandardMaterial({ color: 0x141212, roughness: 0.4 }),
    eye: new MeshBasicMaterial({ color: 0xffc24a }),
    chest: ball(0.21, 0.25, 0.32, 1), hind: ball(0.18, 0.2, 0.32, 2), ruff: ball(0.25, 0.28, 0.2, 3), belly: ball(0.15, 0.1, 0.36, 4),
    neck: ball(0.12, 0.14, 0.17, 5), skull: ball(0.11, 0.1, 0.13, 6), tail: shaggy(new SphereGeometry(1, 10, 8).scale(0.075, 0.075, 0.25).translate(0, 0, -0.23), 0.04, 7),
    snout: new CylinderGeometry(0.034, 0.062, 0.2, 8).rotateX(Math.PI / 2), jaw: new CylinderGeometry(0.026, 0.045, 0.16, 7).rotateX(Math.PI / 2),
    tip: new SphereGeometry(0.026, 8, 6), ear: new ConeGeometry(0.042, 0.11, 5).translate(0, 0.055, 0), eyeBall: new SphereGeometry(0.016, 8, 6),
    thighFore: new CylinderGeometry(0.055, 0.04, 0.34, 7).translate(0, -0.17, 0), thighHind: new CylinderGeometry(0.08, 0.045, 0.34, 7).translate(0, -0.17, 0),
    shin: new CylinderGeometry(0.034, 0.027, 0.32, 6).translate(0, -0.16, 0), paw: new SphereGeometry(0.042, 8, 6).scale(1, 0.6, 1.4).translate(0, -0.33, 0.02),
  };
})();

/** How high a wolf's body is carried, running, over its paws; how high it lies on its side, fallen. */
const WOLF_HIGH = 0.74, WOLF_LOW = 0.22;
/** Its legs: where each is hung from the body, its rest angles at the hip and the knee, and how far into the stride it is (a gallop's). */
const LEGS = [
  { at: [0.1, -0.08, 0.28], fore: true, off: 0.45 }, { at: [-0.1, -0.08, 0.28], fore: true, off: 0.55 },
  { at: [0.1, -0.05, -0.3], fore: false, off: 0 }, { at: [-0.1, -0.05, -0.3], fore: false, off: 0.08 },
] as const;

/**
 * A wolf: a long grey body, a ruff about the chest and a lighter belly, its head held low and forward with its ears up and its eyes
 * shining amber; a bushy tail; four legs, each a thigh and a shin with a paw, galloping. Brought down, it is rolled onto its side, its
 * legs stretched out. Forward is +z.
 */
class Wolf implements Gait {
  readonly model = new Group();
  readonly meshes: Mesh[] = [];
  private readonly body = new Group();
  private readonly head = new Group();
  private readonly tail = new Group();
  private readonly legs: { hip: Group; knee: Group; fore: boolean; off: number }[] = [];
  private phase = 0;
  private rate = 2;
  private down = -1;
  private side = 1;

  constructor(size: number, coat: number) {
    const c = WOLF.coats[Math.min(2, Math.floor(coat * 3))];
    const add = (to: Group, g: BufferGeometry, m: MeshStandardMaterial | MeshBasicMaterial, x = 0, y = 0, z = 0) => {
      const mesh = new Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.meshes.push(mesh);
      to.add(mesh);
      return mesh;
    };
    add(this.body, WOLF.chest, c.fur, 0, 0.01, 0.2);
    add(this.body, WOLF.hind, c.fur, 0, 0.0, -0.24);
    add(this.body, WOLF.ruff, c.dark, 0, 0.05, 0.32);
    add(this.body, WOLF.belly, c.pale, 0, -0.13, 0.02);
    add(this.body, WOLF.neck, c.dark, 0, 0.12, 0.47).rotation.x = -0.5;
    this.head.position.set(0, 0.18, 0.6);
    add(this.head, WOLF.skull, c.fur);
    add(this.head, WOLF.snout, c.fur, 0, -0.03, 0.15);
    add(this.head, WOLF.jaw, c.pale, 0, -0.075, 0.12).rotation.x = 0.25;
    add(this.head, WOLF.tip, WOLF.nose, 0, -0.02, 0.255);
    for (const s of [1, -1]) {
      add(this.head, WOLF.ear, c.dark, 0.06 * s, 0.08, -0.03).rotation.set(-0.2, 0, -0.3 * s);
      add(this.head, WOLF.eyeBall, WOLF.eye, 0.05 * s, 0.03, 0.095);
    }
    this.body.add(this.head);
    this.tail.position.set(0, 0.06, -0.5);
    add(this.tail, WOLF.tail, c.fur);
    this.body.add(this.tail);
    for (const l of LEGS) {
      const hip = new Group(), knee = new Group();
      hip.position.set(l.at[0], l.at[1], l.at[2]);
      add(hip, l.fore ? WOLF.thighFore : WOLF.thighHind, c.fur);
      knee.position.y = -0.34;
      add(knee, WOLF.shin, c.dark);
      add(knee, WOLF.paw, c.dark);
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee, fore: l.fore, off: l.off });
    }
    this.body.position.y = WOLF_HIGH;
    this.model.add(this.body);
    this.model.scale.setScalar(size);
    this.side = coat * 7 % 1 < 0.5 ? 1 : -1;
    this.model.name = 'wolf';
  }

  go(pace: number, phase: number) {
    this.phase = phase;
    // (Strides a little longer the faster it goes, as a gallop's are: so many a second.)
    this.rate = 1.1 + (0.36 * pace) / this.model.scale.x;
    this.down = -1;
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
  }
  flinch() {}
  fall() { this.down = 0; }
  stop() { this.down = -1; }

  update(dt: number) {
    const TAU = Math.PI * 2;
    if (this.down < 0) {
      this.phase = (this.phase + dt * this.rate) % 1;
      const f = this.phase;
      // Each leg swung forward and back, folded as it is carried forward; the body rising and pitching with the stride, the head the other way.
      for (const l of this.legs) {
        const u = TAU * (f + l.off), reach = Math.cos(u), lift = Math.max(0, -Math.sin(u));
        l.hip.rotation.x = (l.fore ? 0 : -0.3) - 0.6 * reach;
        l.knee.rotation.x = l.fore ? 1.5 * lift : 0.55 + 0.9 * lift;
      }
      this.body.position.y = WOLF_HIGH + 0.035 * Math.sin(2 * TAU * f);
      this.body.rotation.x = 0.07 * Math.sin(TAU * f + 0.5);
      this.head.rotation.x = 0.1 - 0.08 * Math.sin(TAU * f + 0.5);
      this.tail.rotation.set(-0.45 + 0.12 * Math.sin(TAU * f), 0.15 * Math.sin(Math.PI * 2 * f), 0);
      return;
    }
    // Brought down: rolled onto its side, its legs stretched out stiff, its head and tail laid down.
    this.down += dt;
    const k = Math.min(1, this.down / 0.35), e = k * k * (3 - 2 * k);
    this.body.rotation.set(this.body.rotation.x * (1 - e), 0, this.side * 1.45 * e);
    this.body.position.y = WOLF_HIGH + (WOLF_LOW - WOLF_HIGH) * e;
    for (const l of this.legs) {
      l.hip.rotation.x += ((l.fore ? -0.5 : 0.5) - l.hip.rotation.x) * e;
      l.knee.rotation.x += ((l.fore ? 0.15 : 0.3) - l.knee.rotation.x) * e;
    }
    this.head.rotation.x += (0.35 - this.head.rotation.x) * e;
    this.tail.rotation.x += (0.1 - this.tail.rotation.x) * e;
  }
}
