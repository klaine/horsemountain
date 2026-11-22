import { AnimationClip, KeyframeTrack, Mesh, Object3D, SkinnedMesh, Vector3, VectorKeyframeTrack } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRigged } from 'three/addons/utils/SkeletonUtils.js';
import { makeRun, RUN, SPRINT } from './gait';
import { dressAdventurer } from './outfit';
import { makeSkiClips } from './skiing';

/**
 * The figures' bodies and their clips, as `tools/figures.ts` makes them from Quaternius's packs (CC0): one skeleton of 65 bones shared by
 * every body, and 85 clips on it; and five made here on the same skeleton when they are loaded, a run and a sprint (`gait.ts`) and
 * three of skiing (`skiing.ts`). A clip
 * is made for the male mannequin; another body takes it as it stands but for the hips, whose height in the clip is the mannequin's: it
 * is scaled by how much higher or lower the body's own hips are (only the hips and the root are ever moved along; every other bone is
 * only turned, so a body's own proportions are kept).
 *
 * Where a clip carries the root along (a roll, a dash, the climb onto a ledge), the root's travel is taken out of it, so that the figure
 * is moved by its body and stopped by what is solid, rather than run through it by the clip: `Move.travel`.
 *
 * A kind of body may be dressed (`BodyKind.dress`): the adventurers are the base man and woman in a ranger's clothes (`outfit.ts`),
 * dressed once when first asked for and copied for every figure after (`source`).
 */

/** A kind of body: its file, and what it is dressed in, if anything (`outfit.ts`). */
export interface BodyKind { id: string; label: string; file: string; dress?: 'adventurer' }

export const BODIES: BodyKind[] = [
  { id: 'mannequin', label: 'Mannequin', file: 'clips.glb' },
  { id: 'mannequin-f', label: 'Mannequin, woman', file: 'mannequin-f.glb' },
  { id: 'base-man', label: 'Base man', file: 'superhero-male.glb' },
  { id: 'base-woman', label: 'Base woman', file: 'superhero-female.glb' },
  { id: 'adventurer', label: 'Adventurer', file: 'superhero-male.glb', dress: 'adventurer' },
  { id: 'adventurer-f', label: 'Adventurer, woman', file: 'superhero-female.glb', dress: 'adventurer' },
];

/** A clip as a figure plays it. */
export interface Move {
  clip: AnimationClip;
  /** Where its root went over the clip, in the figure's own frame (forward is +z), taken out of the clip; null where it stays put. */
  travel: VectorKeyframeTrack | null;
}

/** A body ready to move: its own copy of the model, and the clips fitted to it. */
export interface Rigged {
  model: Object3D;
  moves: Map<string, Move>;
  /** How much taller the body stands at the hips than the mannequin the clips were made on: strides and travel are scaled by it. */
  scale: number;
}

const HIPS = 'pelvis', ROOT = 'root';

/**
 * How a figure's file is fetched, given its address: plainly; or, where a page fetches its files itself (to say how far it has got as
 * they come in, `lab/slope.ts`), as the page does.
 */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>;
const fetchBytes: FetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.arrayBuffer();
};

/**
 * A figure's file, as bytes: from the page itself where it carries them; else fetched from the folder, as it is or, where a host serves
 * only text beside a page (`__figureText`), written out as text (`clips.glb.txt`). (A page may ask for its files early, to fetch them
 * all at once, with a `fetchFile` that keeps what it fetched.)
 */
export async function figureBytes(base: string, name: string, fetchFile: FetchBytes = fetchBytes): Promise<ArrayBuffer> {
  const g = globalThis as { __figureFiles?: Record<string, string>; __figureText?: boolean };
  let text = g.__figureFiles?.[name];
  if (!text && g.__figureText) text = new TextDecoder().decode(await fetchFile(base + name + '.txt'));
  if (!text) return fetchFile(base + name);
  return Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0)).buffer;
}

async function loadFile(loader: GLTFLoader, base: string, name: string, fetchFile?: FetchBytes): Promise<GLTF> {
  return loader.parseAsync(await figureBytes(base, name, fetchFile), base);
}

/** The height of a model's hips as it stands rigged, at rest. */
function hipsOf(model: Object3D): number {
  model.updateMatrixWorld(true);
  const hips = model.getObjectByName(HIPS);
  if (!hips) throw new Error('a figure without hips');
  return hips.getWorldPosition(new Vector3()).y;
}

export class FigureLibrary {
  private readonly fitted = new Map<string, Map<string, Move>>();
  private readonly sources = new Map<string, Promise<GLTF>>();
  private readonly made = new Map<string, Promise<Object3D>>();

  private constructor(private readonly base: string, private readonly loader: GLTFLoader, readonly clips: AnimationClip[], private readonly hips: number, mannequin: GLTF,
    private readonly fetchFile?: FetchBytes) {
    this.sources.set('mannequin', Promise.resolve(mannequin));
  }

  /**
   * Loads the clips (with the male mannequin) from `base`, the folder that holds the figures' files. (A page that is one file, with no
   * folder beside it, carries them in itself, written out in `__figureFiles`: see `tools/buildingLabPage.mjs`.) Its files are fetched
   * by `o.fetch` where it is given (see `figureBytes`).
   */
  static async load(base: string, o: { fetch?: FetchBytes } = {}): Promise<FigureLibrary> {
    const loader = new GLTFLoader();
    const gltf = await loadFile(loader, base, 'clips.glb', o.fetch);
    // (With the run and the sprint, and three clips of skiing, made on the mannequin from its idle's first frame: see `gait.ts` and
    // `skiing.ts`.)
    const idle = gltf.animations.find((c) => c.name === 'Idle_Loop');
    const made = idle ? [...[RUN, SPRINT].map((s) => makeRun(gltf.scene, idle, s).clip), ...makeSkiClips(gltf.scene, idle)] : [];
    return new FigureLibrary(base, loader, [...gltf.animations, ...made], hipsOf(gltf.scene), gltf, o.fetch);
  }

  get names(): string[] { return this.clips.map((c) => c.name); }

  /** The mannequin as it was loaded, whom the clips are made for: to make more clips on (`makeDownhillRun`), not to show. */
  async mannequin(): Promise<Object3D> { return (await this.sources.get('mannequin')!).scene; }

  /**
   * A body of the kind `id` as it is made, dressed if it is dressed: to be copied, or to make clips and live poses on (`Rider`), not to
   * show. Each kind is fetched and dressed once; an adventurer with its sword on its back (`sword: 'back'`, as the skier wears it)
   * once more.
   */
  source(id: string, o: { sword?: 'hip' | 'back' } = {}): Promise<Object3D> {
    const kind = BODIES.find((b) => b.id === id) ?? BODIES[0], key = o.sword === 'back' && kind.dress === 'adventurer' ? `${kind.id} sword on back` : kind.id;
    let made = this.made.get(key);
    if (!made) {
      let file = this.sources.get(kind.file === 'clips.glb' ? 'mannequin' : kind.file);
      if (!file) { file = loadFile(this.loader, this.base, kind.file, this.fetchFile); this.sources.set(kind.file, file); }
      made = file.then((gltf) => (kind.dress === 'adventurer' ? dressAdventurer(gltf.scene, undefined, o) : gltf.scene));
      this.made.set(key, made);
    }
    return made;
  }

  /** A new figure's body of the kind `id`. Each kind is fetched once, and copied for every figure. */
  async body(id: string): Promise<Rigged> {
    const kind = BODIES.find((b) => b.id === id) ?? BODIES[0];
    const model = cloneRigged(await this.source(kind.id));
    model.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        // (A clip carries a limb far outside the bounds of the pose the body was made in: it is drawn whether or not those bounds are
        // in view.)
        if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
      }
    });
    const scale = hipsOf(model) / this.hips;
    let moves = this.fitted.get(kind.id);
    if (!moves) { moves = this.fit(scale); this.fitted.set(kind.id, moves); }
    return { model, moves, scale };
  }

  /** The clips made over for a body whose hips stand `scale` times the mannequin's. */
  private fit(scale: number): Map<string, Move> {
    const moves = new Map<string, Move>();
    for (const clip of this.clips) {
      const tracks: KeyframeTrack[] = [];
      let travel: VectorKeyframeTrack | null = null;
      for (const t of clip.tracks) {
        if (t.name === `${ROOT}.position`) {
          const v = Float32Array.from(t.values);
          for (let i = 0; i < v.length; i += 3) { v[i] *= scale; v[i + 2] *= scale; }
          travel = new VectorKeyframeTrack(t.name, Float32Array.from(t.times), v);
          continue;
        }
        if (t.name === `${HIPS}.position` && scale !== 1) {
          const v = Float32Array.from(t.values);
          for (let i = 0; i < v.length; i++) v[i] *= scale;
          tracks.push(new VectorKeyframeTrack(t.name, Float32Array.from(t.times), v));
          continue;
        }
        tracks.push(t);
      }
      moves.set(clip.name, { clip: new AnimationClip(clip.name, clip.duration, tracks), travel });
    }
    return moves;
  }
}

/** Where a clip's root has got to at `time`, in the figure's frame. */
export function travelAt(track: VectorKeyframeTrack, time: number, into: Vector3): Vector3 {
  const t = track.times, v = track.values, n = t.length;
  if (time <= t[0]) return into.set(v[0], v[1], v[2]);
  if (time >= t[n - 1]) return into.set(v[n * 3 - 3], v[n * 3 - 2], v[n * 3 - 1]);
  let i = 1;
  while (t[i] < time) i++;
  const k = (time - t[i - 1]) / (t[i] - t[i - 1]), a = (i - 1) * 3, b = i * 3;
  return into.set(v[a] + (v[b] - v[a]) * k, v[a + 1] + (v[b + 1] - v[a + 1]) * k, v[a + 2] + (v[b + 2] - v[a + 2]) * k);
}
