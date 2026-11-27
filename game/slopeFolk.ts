/**
 * The folk met at and in the dungeons (asked: "what new materials, decorations, ways to shape the spaces, npcs etc we need?" and then
 * "proceed autonomously to make these all dungeon improvements"): the hermit keeping the fire at a cave's camp, someone left captive
 * below, and the ghost of whoever the place was made for. Each a robed and hooded figure of a few simple shapes, as the props are
 * (`slopeProps.ts`), so that none needs a skeleton or clips of its own: a long robe turned on a lathe, its hood, the dark under it,
 * two hands out of the sleeves. One shape of all its parts, coloured by its vertices, for the caller to give a material that lights
 * it as where it stands is lit; posed sitting, standing or kneeling, and stirred a little as it breathes (`Folk.update`).
 */
import { BufferAttribute, type BufferGeometry, Color, Euler, Group, LatheGeometry, Matrix4, Mesh, type Material, Quaternion, SphereGeometry, Vector2, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type FolkPose = 'sit' | 'stand' | 'kneel';
/** What a figure wears: its robe's colour, its hood's (a shade of the robe's, unless given), its skin's. */
export interface FolkLook { robe: number; hood?: number; skin?: number }

const placed = (g: BufferGeometry, at: [number, number, number], turn: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) =>
  g.applyMatrix4(new Matrix4().compose(new Vector3(...at), new Quaternion().setFromEuler(new Euler(...turn)), new Vector3(...scale)));
const tinted = (g: BufferGeometry, hex: number) => {
  const flat = g.index ? g.toNonIndexed() : g, n = flat.getAttribute('position').count, c = new Float32Array(n * 3), col = new Color(hex);
  for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
  flat.setAttribute('color', new BufferAttribute(c, 3));
  // (Merged with the rest, which carry no uvs of their own.)
  flat.deleteAttribute('uv');
  return flat;
};

/**
 * A figure's shape, standing on the floor at its origin and facing +z: its body (robe, hood, the dark of its face, its hands) as one,
 * and its head (the hood and the face) as another, so that it may turn to look at whoever comes near. Sitting, the robe is shorter and
 * set on a seat 0.45 m up, the knees out before it; kneeling, lower still.
 */
export function folkShapes(look: FolkLook, pose: FolkPose): { body: BufferGeometry; head: BufferGeometry; headAt: number } {
  const robe = look.robe, hood = look.hood ?? new Color(robe).multiplyScalar(0.8).getHex(), skin = look.skin ?? 0xc8a088;
  const seat = pose === 'sit' ? 0.45 : pose === 'kneel' ? 0.25 : 0, tall = pose === 'stand' ? 1.42 : 0.72;
  // (The robe: wide at its hem, in at the waist, out to the shoulders, round to the neck.)
  const outline: [number, number][] = pose === 'stand'
    ? [[0, 0], [0.34, 0], [0.3, 0.3], [0.24, 0.75], [0.2, 1.0], [0.24, 1.22], [0.2, 1.38], [0.08, 1.44], [0, 1.44]]
    : [[0, 0], [0.3, 0], [0.26, 0.25], [0.21, 0.5], [0.24, 0.62], [0.2, 0.7], [0.08, 0.74], [0, 0.74]];
  const parts: BufferGeometry[] = [tinted(placed(new LatheGeometry(outline.map(([r, y]) => new Vector2(r, y)), 14), [0, seat, 0]), robe)];
  if (pose !== 'stand') {
    // (The lap and knees out before it, and the hem falling from them to the floor.)
    parts.push(tinted(placed(new SphereGeometry(0.2, 10, 6), [0, seat + 0.06, 0.24], [0, 0, 0], [1.25, 0.6, 1.5]), robe));
    if (pose === 'sit') parts.push(tinted(placed(new LatheGeometry([[0, 0], [0.26, 0], [0.22, 0.45], [0, 0.45]].map(([r, y]) => new Vector2(r, y)), 10), [0, 0, 0.42], [0, 0, 0], [1, 1, 0.8]), robe));
  }
  // (Hands out of the sleeves, held together before it.)
  const handsY = seat + tall * 0.62;
  for (const s of [-1, 1]) {
    parts.push(tinted(placed(new SphereGeometry(0.075, 8, 6), [s * 0.17, handsY, 0.2], [0, 0, 0], [1, 1.2, 1.4]), robe));
    parts.push(tinted(placed(new SphereGeometry(0.045, 8, 6), [s * 0.07, handsY - 0.02, 0.27]), skin));
  }
  const headAt = seat + tall + 0.02;
  // (The hood, drawn about the head, deep enough that the face is in its shadow; the face a dark oval under it.)
  const head = mergeGeometries([
    tinted(placed(new SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), [0, 0.13, 0], [-0.2, 0, 0], [1, 1.15, 1.1]), hood),
    tinted(placed(new SphereGeometry(0.12, 12, 8), [0, 0.11, 0.05], [0, 0, 0], [0.85, 1.05, 0.7]), 0x0e0b0a),
    tinted(placed(new SphereGeometry(0.035, 6, 4), [0, 0.06, 0.15]), skin),
  ])!;
  return { body: mergeGeometries(parts)!, head, headAt };
}

/**
 * A figure made and posed, its parts in `group` (stood where it is wanted by the caller), drawn with `material` (vertex colours on);
 * its head turned to look at a point near it (`update`), and its body stirred by its breathing; a ghost bobbing in the air too.
 */
export class Folk {
  readonly group = new Group();
  private readonly head: Mesh;
  private readonly body: Mesh;
  /** Where a ghost was set, before it bobs: taken as it is first stirred. */
  private baseY: number | null = null;
  private look = 0;
  constructor(look: FolkLook, pose: FolkPose, material: Material, private readonly ghost = false) {
    const { body, head, headAt } = folkShapes(look, pose);
    this.body = new Mesh(body, material);
    this.head = new Mesh(head, material);
    this.head.position.y = headAt;
    this.body.castShadow = this.head.castShadow = !ghost;
    this.group.add(this.body, this.head);
  }
  /** The shapes' materials and shapes let go of. */
  dispose(): void { for (const m of [this.body, this.head]) m.geometry.dispose(); }
  /**
   * A moment on, at `seconds`: breathing; the head turned toward `toward` (in the group's parent's frame) while it is within six
   * metres, else back to before it.
   */
  update(dt: number, seconds: number, toward: Vector3 | null): void {
    const breath = Math.sin(seconds * 1.7);
    this.body.scale.set(1 + 0.012 * breath, 1 + 0.008 * breath, 1 + 0.012 * breath);
    let want = 0;
    if (toward) {
      const g = this.group, dx = toward.x - g.position.x, dz = toward.z - g.position.z;
      if (dx * dx + dz * dz < 36) want = Math.max(-1.1, Math.min(1.1, wrap(Math.atan2(dx, dz) - g.rotation.y)));
    }
    this.look += (want - this.look) * Math.min(1, dt * 3);
    this.head.rotation.y = this.look;
    this.head.rotation.x = 0.05 * Math.sin(seconds * 0.6);
    if (this.ghost) { this.baseY ??= this.group.position.y; this.group.position.y = this.baseY + this.hover + 0.12 * Math.sin(seconds * 1.3); }
  }
  /** How high a ghost floats over where it was set. */
  hover = 0;
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
