import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { fbm3, Rng } from '../core/rng';
import { MeshBuilder } from './geom/meshBuilder';
import { CardSet } from './scene';

/**
 * Planting: everything that grows, placed as cards. A card is a small flat sheet with leaves or
 * blades painted on it; grass is tufts of three crossed sheets, and the crown of a tree is a
 * cloud of a few hundred leaf cards round its branches. The mesher decides where things grow and
 * writes one transform per card; the renderer draws them all in a handful of calls.
 */

const M = new Matrix4();
const Q = new Quaternion();
const Q2 = new Quaternion();
const E = new Euler();
const P = new Vector3();
const S = new Vector3();

export type Colour = [number, number, number];

export class Planting {
  readonly grass: CardSet = { kind: 'grass', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };
  readonly flowers: CardSet = { kind: 'flower', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };
  readonly ferns: CardSet = { kind: 'fern', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };
  readonly herbs: CardSet = { kind: 'herb', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };
  readonly reeds: CardSet = { kind: 'reed', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };
  readonly leaves: CardSet = { kind: 'leaf', shape: 'card', shadow: true, matrices: [], colours: [], centres: [] };
  readonly needles: CardSet = { kind: 'needle', shape: 'card', shadow: true, matrices: [], colours: [], centres: [] };
  /** A pine's needles: brushes of them at the ends of its twigs, each three sheets crossed about the twig's line. */
  readonly pines: CardSet = { kind: 'pine', shape: 'tuft', shadow: true, matrices: [], colours: [], centres: [] };
  /** Whole trees, each painted on one tuft of cards: for hillsides too far off for anything more. */
  readonly firs: CardSet = { kind: 'fir', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };
  readonly farTrees: CardSet = { kind: 'tree', shape: 'tuft', shadow: false, matrices: [], colours: [], centres: [] };

  get sets(): CardSet[] {
    return [this.grass, this.flowers, this.ferns, this.herbs, this.reeds, this.leaves, this.needles, this.pines, this.firs, this.farTrees].filter((s) => s.matrices.length > 0);
  }

  /** Adds a card whose place and size have just been composed, with its colour and the point its shading curves about. */
  pushCard(set: CardSet, colour: Colour, cx: number, cy: number, cz: number): void {
    this.push(set, colour, cx, cy, cz);
  }

  /**
   * While this is set, nothing that is planted is kept. It is for leaving a place bare without
   * disturbing what is drawn for it: whatever would have grown there is worked out as before,
   * so everything planted afterwards comes out as it did.
   */
  muted = false;

  private push(set: CardSet, colour: Colour, cx: number, cy: number, cz: number): void {
    if (this.muted) return;
    for (let k = 0; k < 16; k++) set.matrices.push(M.elements[k]);
    set.colours.push(colour[0], colour[1], colour[2]);
    set.centres.push(cx, cy, cz);
  }

  /** A tuft standing on the ground: grass, or flowers on their stems. Lit as the ground is. */
  /**
   * Grass grazed short where sheep feed: every tuft of grass (and, less, of flowers) within `r` of a flock's ground is cut down, the
   * more the nearer its middle. (Left as it grew, the meadow stood knee-deep and hid the sheep in it.)
   */
  crop(flocks: { x: number; z: number; r: number }[]): void {
    for (const [set, least] of [[this.grass, 0.32], [this.flowers, 0.55]] as const) {
      const m = set.matrices;
      for (let k = 0; k < m.length; k += 16) {
        const x = m[k + 12], z = m[k + 14];
        let keep = 1;
        for (const f of flocks) {
          const d = Math.hypot(x - f.x, z - f.z) / (f.r + 6);
          if (d < 1) keep = Math.min(keep, least + (1 - least) * Math.max(0, (d - 0.75) / 0.25));
        }
        if (keep < 1) for (let c = 4; c < 8; c++) m[k + c] *= keep;
      }
    }
  }

  tuft(set: CardSet, x: number, y: number, z: number, width: number, height: number, yaw: number, colour: Colour): void {
    if (this.keepOut?.(set, x, z)) return;
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, yaw, 0)), S.set(width, height, width));
    this.push(set, colour, x, y - 1000, z);
  }

  /**
   * Where low plants are not to grow, if anywhere: asked of every tuft by its set and where it stands. (A valley's fields: what grows
   * wild is kept out of them by this, from every one of the many places it is planted, and their crops are planted by themselves.)
   * Not asked of trees, whose crowns reach out over whatever is beside them.
   */
  keepOut?: (set: CardSet, x: number, z: number) => boolean;

  /** A whole tree far off, as one tuft: shaded as a rounded body about a point a third of the way up it. */
  farTree(fir: boolean, x: number, y: number, z: number, width: number, height: number, yaw: number, colour: Colour): void {
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(0, yaw, 0)), S.set(width, height, width));
    this.push(fir ? this.firs : this.farTrees, colour, x, y + height * 0.35, z);
  }

  /**
   * A mass of leaves: cards scattered through an ellipsoid, thicker towards its surface, each
   * facing its own way. They are shaded as parts of one rounded body, about a point low inside it,
   * so a crown is light on top and dark beneath however its cards happen to lie.
   */
  crown(cx: number, cy: number, cz: number, rx: number, ry: number, cards: number, size: number, colour: (rng: Rng) => Colour, rng: Rng): void {
    for (let k = 0; k < cards; k++) {
      // A direction evenly over the sphere, and a distance that favours the outside.
      const u = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - u * u);
      const d = Math.pow(rng.next(), 0.42);
      const x = cx + Math.cos(a) * s * rx * d, y = cy + u * ry * d, z = cz + Math.sin(a) * s * rx * d;
      const w = size * rng.range(0.75, 1.3);
      M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rng.range(-1.2, 1.2), rng.range(0, Math.PI * 2), rng.range(-0.5, 0.5))), S.set(w, w, w));
      this.push(this.leaves, colour(rng), cx, cy - ry * 0.55, cz);
    }
  }

  /** One card set where it is told: its size, how it is tipped and turned, its colour, and the point its shading curves about. */
  card(set: CardSet, x: number, y: number, z: number, size: number, tipX: number, tipY: number, roll: number, colour: Colour, sx: number, sy: number, sz: number): void {
    M.compose(P.set(x, y, z), Q.setFromEuler(E.set(tipX, tipY, roll)), S.set(size, size, size));
    this.push(set, colour, sx, sy, sz);
  }

  /** A spray of leaves about a twig: a few cards in a flattened ball, shaded about the point given. */
  spray(cx: number, cy: number, cz: number, rx: number, ry: number, cards: number, size: number, colour: (rng: Rng) => Colour, rng: Rng, sx: number, sy: number, sz: number): void {
    for (let k = 0; k < cards; k++) {
      const u = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), s = Math.sqrt(1 - u * u), d = Math.pow(rng.next(), 0.5);
      // Most sprays are small; one in five is a larger bough that fills the crown behind them.
      const w = size * (k % 5 === 0 ? rng.range(1.5, 2.1) : rng.range(0.75, 1.3));
      // Leaves turn their faces to the sky more than to the side.
      M.compose(P.set(cx + Math.cos(a) * s * rx * d, cy + u * ry * d, cz + Math.sin(a) * s * rx * d), Q.setFromEuler(E.set(-Math.PI / 2 + rng.range(-0.9, 0.9), rng.range(0, Math.PI * 2), rng.range(-0.7, 0.7))), S.set(w, w, w));
      this.push(this.leaves, colour(rng), sx, sy, sz);
    }
  }

  /** A broadleaved tree: a main crown and a few lesser ones about it, so the outline is lumpy. */
  broadleaf(x: number, base: number, z: number, height: number, spread: number, cards: number, colour: (rng: Rng) => Colour, rng: Rng, cardScale = 1): void {
    const top = base + height;
    this.crown(x, top - spread * 0.25, z, spread, spread * 0.78, Math.round(cards * 0.5), spread * 0.62 * cardScale, colour, rng);
    const lobes = 3 + rng.int(0, 2);
    for (let k = 0; k < lobes; k++) {
      const a = rng.range(0, Math.PI * 2), out = spread * rng.range(0.5, 0.85);
      this.crown(x + Math.cos(a) * out, top - spread * rng.range(0.5, 1.0), z + Math.sin(a) * out, spread * 0.6, spread * 0.48, Math.round((cards * 0.5) / lobes), spread * 0.55 * cardScale, colour, rng);
    }
  }

  /**
   * A conifer: tiers of boughs that droop, wide at the foot and closing to a point. Given wood
   * to build with, each bough of a near tree gets the branch that carries it, and a second
   * sheet of needles hanging beneath, so that it is not a flat fan when seen from the side.
   */
  conifer(x: number, base: number, z: number, height: number, radius: number, tiers: number, colour: (rng: Rng) => Colour, rng: Rng, wood?: { mesh: MeshBuilder; bark: Colour; detail: number }): void {
    const skirt = base + height * 0.16;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = skirt + (height - (skirt - base)) * f * 0.94;
      const r = radius * Math.pow(1 - f, 0.8) + 0.25;
      const around = Math.max(3, Math.round(3 + 4 * (1 - f)));
      const turn = rng.range(0, Math.PI * 2);
      for (let k = 0; k < around; k++) {
        const a = turn + (k / around) * Math.PI * 2 + rng.range(-0.25, 0.25);
        // Each bough is a card lying outwards from the trunk and hanging at its tip.
        const droop = 0.42 + 0.3 * (1 - f) + rng.range(-0.1, 0.1);
        Q.setFromEuler(E.set(-Math.PI / 2 + droop, -a + Math.PI / 2, 0, 'YXZ'));
        const len = r * 1.25 * rng.range(0.85, 1.15);
        M.compose(P.set(x + Math.cos(a) * r * 0.5, y - r * 0.2, z + Math.sin(a) * r * 0.5), Q, S.set(len * 0.95, len, len));
        const tint = colour(rng);
        this.push(this.needles, tint, x, y - 1.2 - r, z);
        if (wood && wood.detail > 0.5) {
          // The card runs from the trunk, at its top edge, out and down to the tip of the bough.
          const cx = x + Math.cos(a) * r * 0.5, cy = y - r * 0.2, cz = z + Math.sin(a) * r * 0.5;
          const ux = -Math.cos(a) * Math.cos(droop), uy = Math.sin(droop), uz = -Math.sin(a) * Math.cos(droop);
          const from = new Vector3(x, cy + uy * len * 0.5 + 0.05, z), to = new Vector3(cx - ux * len * 0.18, cy - uy * len * 0.18, cz - uz * len * 0.18);
          const mid = from.clone().lerp(to, 0.5).setY((from.y + to.y) / 2 + len * 0.03);
          const thick = 0.02 + 0.035 * (1 - f);
          // Dark, as wood is under its own needles, and stopping short of the tip, where the bough is all needle.
          layLimb(wood.mesh, [from, mid, to], [thick, thick * 0.75, thick * 0.4], 3, [wood.bark[0] * 0.6, wood.bark[1] * 0.6, wood.bark[2] * 0.6], t + k, (h) => 0.3 + 0.2 * Math.min(1, Math.max(0, (h - base) / height)));
          // The second sheet: the same bough turned on edge, narrower, and a little darker for hanging under the first.
          M.compose(P.set(cx, cy - len * 0.06, cz), Q.multiply(Q2.setFromAxisAngle(UP, Math.PI / 2)), S.set(len * 0.5, len * 0.9, len));
          this.push(this.needles, [tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8], x, y - 1.2 - r, z);
        }
      }
    }
    // The leader: two upright cards crossed.
    for (const yaw of [0, Math.PI / 2]) {
      M.compose(P.set(x, base + height * 0.96, z), Q.setFromEuler(E.set(0, yaw + rng.range(0, 1), 0)), S.set(radius * 0.5, height * 0.2, 1));
      this.push(this.needles, colour(rng), x, base + height * 0.6, z);
    }
  }
}

export interface TreeOptions {
  /** An oak has a short trunk and wide limbs; an ash a tall one, with a leader and rising branches. */
  kind: 'oak' | 'ash';
  /** 1 for a tree that can be walked up to, falling to 0 for one far off, which is drawn more simply. */
  detail: number;
  /** How many leaf cards to hang on it, and how large each is, in metres. */
  cards: number;
  cardSize: number;
  leaf: (rng: Rng) => Colour;
  bark: Colour;
  /** How far the limbs spread, as a multiple of the usual: an old oak standing alone, its boughs reaching out low like an umbrella. 1 by default. */
  wide?: number;
  /** For wood that is not baked: gives each point its share of the sky, less up among the leaves. */
  shaded?: boolean;
  /** Where to build roots and other small wood that nobody should be stopped by. */
  soft?: MeshBuilder;
  /**
   * A wind it has grown in, blowing towards `x`, `z`: every limb is bent that way by `strength` (0 to 1), the young growth the
   * more, so that a tree by the sea grows swept away from it, its crown low and thrown to the lee.
   */
  wind?: { x: number; z: number; strength: number };
  /**
   * Where no limb may grow: a wall, a roof, a cliff. A limb that would grow into it turns aside, as a bough does that has grown
   * against a wall, and goes on along it or away; only where every way is shut is it cut off, bearing nothing beyond. Leaves keep
   * clear of it too. For a house beside a wood, whose walls a great tree's boughs would otherwise reach through and droop into its court.
   */
  keepOut?: (p: Vector3) => boolean;
  /** In winter, without its leaves: one more order of twigs where it is near enough for them to show, which is what a bare crown is. */
  bare?: boolean;
}

const UP = new Vector3(0, 1, 0);

/**
 * The way a limb growing from `from` along `d` turns where its next stretch (`step` long) would enter what it may not: the first of a
 * fan of ways turned further and further from it, to either side, up and down, whose stretch ends clear and passes clear at its
 * middle; or null if every one is shut. Always the same fan in the same order, so that nothing is drawn from a stream for it.
 */
function giveWay(from: Vector3, d: Vector3, step: number, keepOut: (p: Vector3) => boolean): Vector3 | null {
  const side = new Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : UP).normalize(), lift = new Vector3().crossVectors(side, d).normalize();
  const way = new Vector3(), end = new Vector3(), mid = new Vector3();
  // (The least turn that clears first, so that a limb bends no more than it must; and as far as back the way it came, so that it is
  // almost never stopped.)
  for (const turn of [0.3, 0.6, 0.9, 1.25, 1.65, 2.1, 2.6]) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0.7, 0.7], [-0.7, 0.7], [0, -1]]) {
    way.copy(d).multiplyScalar(Math.cos(turn)).addScaledVector(side, a * Math.sin(turn)).addScaledVector(lift, b * Math.sin(turn)).normalize();
    end.copy(from).addScaledVector(way, step); mid.copy(from).addScaledVector(way, step / 2);
    if (!keepOut(end) && !keepOut(mid)) return way.clone();
  }
  return null;
}
/** How large a spray of leaves (`r` about `at`, its cards `size` across) may be and keep clear of what they may not enter: smaller near it, nothing inside it. */
function roomFor(at: Vector3, r: number, size: number, keepOut: (p: Vector3) => boolean): number {
  if (keepOut(at)) return 0;
  const q = new Vector3();
  const blocked = (rr: number) => [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -0.7, 0]].some(([x, y, z]) => keepOut(q.set(at.x + x * (rr + size * 0.45), at.y + y * (rr + size * 0.45), at.z + z * (rr + size * 0.45))));
  while (r > 0.2 && blocked(r)) r *= 0.7;
  return r > 0.2 ? r : 0.2;
}

/**
 * A length of trunk or branch: a tube through the given points, round, tapering, closed at both
 * ends. Bark is wrapped round it a whole number of times, so it meets itself without a seam.
 */
/** How a limb's cross-section departs from a circle: ridges and flutes that die away up it, and an oval; and what has grown on it. */
export interface LimbShape {
  /** Flutes round the foot: how many, how deep (a fraction of the radius), and where they start. */
  lobes: number;
  amp: number;
  phase: number;
  /** How much longer one way across than the other, and which way. */
  oval: number;
  ovalAt: number;
  /** Lumpiness: swellings and hollows a hand or two across, all over it, as a fraction of the radius. No trunk is a turned post. */
  lumps?: number;
  /**
   * Burrs and knots: where along it each is (0 at the foot, 1 at the top) and where round it, how far it stands out (a fraction of
   * the radius) and how broad it is (in radii). A knot is where a branch was: a burr with a hollow in its middle.
   */
  burrs?: { at: number; around: number; size: number; spread: number; knot?: boolean }[];
  seed?: number;
}

export function layLimb(mesh: MeshBuilder, points: Vector3[], radii: number[], sides: number, colour: Colour, along: number, open: ((y: number) => number) | null, shape?: LimbShape): void {
  const side = new Vector3(), fore = new Vector3(), dir = new Vector3();
  const lumpy = !!shape && ((shape.lumps ?? 0) > 0 || (shape.burrs?.length ?? 0) > 0);
  // A limb with lumps on it needs more rings than its bends do: one every hand or two, laid in between the ones given.
  let pts = points, rad = radii;
  if (lumpy) {
    pts = []; rad = [];
    for (let j = 0; j < points.length - 1; j++) {
      const n = Math.max(1, Math.min(8, Math.round(points[j].distanceTo(points[j + 1]) / Math.max(0.16, radii[j] * 0.7))));
      for (let k = 0; k < n; k++) { pts.push(points[j].clone().lerp(points[j + 1], k / n)); rad.push(radii[j] + (radii[j + 1] - radii[j]) * (k / n)); }
    }
    pts.push(points[points.length - 1]); rad.push(radii[radii.length - 1]);
  }
  const last = pts.length - 1;
  let length = 0;
  for (let j = 1; j <= last; j++) length += pts[j].distanceTo(pts[j - 1]);
  const wraps = Math.max(1, Math.round((Math.PI * 2 * rad[0]) / 0.7));
  // Where every point of it is, and which way a plain round limb would face there.
  const at: number[][][] = [], out: number[][][] = [], vs: number[] = [];
  let v = along, run = 0;
  for (let j = 0; j <= last; j++) {
    dir.subVectors(pts[Math.min(last, j + 1)], pts[Math.max(0, j - 1)]).normalize();
    // Any two directions square to the limb will do, so long as they turn little from ring to ring.
    if (j === 0) side.crossVectors(dir, Math.abs(dir.y) > 0.9 ? fore.set(1, 0, 0) : UP).normalize();
    else side.addScaledVector(dir, -side.dot(dir)).normalize();
    fore.crossVectors(dir, side);
    if (j > 0) { const step = pts[j].distanceTo(pts[j - 1]); v += step; run += step; }
    vs.push(v);
    const p = pts[j], r = rad[j], t = length > 0 ? run / length : 0;
    const ringAt: number[][] = [], ringOut: number[][] = [];
    for (let i = 0; i <= sides; i++) {
      const a = ((i % sides) / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const nx = side.x * c + fore.x * s, ny = side.y * c + fore.y * s, nz = side.z * c + fore.z * s;
      // Flutes are deepest at the foot and gone by the first third of the way up; the oval stays, easing off.
      const fade = Math.max(0, 1 - t / 0.5);
      let swell = shape ? 1 + shape.amp * fade * Math.cos(shape.lobes * a + shape.phase) + shape.oval * (1 - 0.5 * t) * Math.cos(2 * (a - shape.ovalAt)) : 1;
      if (lumpy) {
        const seed = shape!.seed ?? 1;
        if (shape!.lumps) swell += shape!.lumps * 2 * (fbm3(c * 1.4 + seed, run / Math.max(0.2, rad[0] * 2.2), s * 1.4, 3, seed) - 0.5);
        for (const b of shape!.burrs ?? []) {
          let da = a - b.around;
          da -= Math.round(da / (Math.PI * 2)) * Math.PI * 2;
          const dl = ((t - b.at) * length) / Math.max(0.05, r), d2 = (da * da + dl * dl) / (b.spread * b.spread);
          if (d2 < 9) swell += b.size * (Math.exp(-d2) - (b.knot ? 0.75 * Math.exp(-d2 * 7) : 0));
        }
      }
      ringAt.push([p.x + nx * r * swell, p.y + ny * r * swell, p.z + nz * r * swell]);
      ringOut.push([nx, ny, nz]);
    }
    at.push(ringAt); out.push(ringOut);
  }
  const rows: number[][] = [];
  const A = new Vector3(), B = new Vector3(), Nn = new Vector3();
  for (let j = 0; j <= last; j++) {
    const row: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const q = at[j][i], o = out[j][i];
      let nx = o[0], ny = o[1], nz = o[2];
      if (lumpy) {
        // It faces as its own surface lies, lumps and all: found from the points to either side of it and above and below.
        const e = at[j][(i + 1) % sides === 0 ? sides : (i + 1) % sides], w = at[j][(i + sides - 1) % sides], up = at[Math.min(last, j + 1)][i], dn = at[Math.max(0, j - 1)][i];
        A.set(e[0] - w[0], e[1] - w[1], e[2] - w[2]); B.set(up[0] - dn[0], up[1] - dn[1], up[2] - dn[2]);
        Nn.crossVectors(A, B);
        if (Nn.lengthSq() > 1e-12) { Nn.normalize(); if (Nn.x * o[0] + Nn.y * o[1] + Nn.z * o[2] < 0) Nn.negate(); nx = Nn.x; ny = Nn.y; nz = Nn.z; }
      }
      // (A little unlike from point to point, and only a little: see the note on bark's texture, which is where the lines round trunks came from.)
      const tone = lumpy ? 1 : 0.95 + 0.08 * (((i * 7 + j * 3) % 5) / 5);
      const id = mesh.addVertex(q[0], q[1], q[2], nx, ny, nz, (i / sides) * wraps, vs[j] / 0.7, colour[0] * tone, colour[1] * tone, colour[2] * tone);
      if (open) mesh.setOpen(id, open(pts[j].y));
      row.push(id);
    }
    rows.push(row);
  }
  // (Wound so that each triangle faces outward. For a long time they were wound the other way: every trunk and branch was drawn as
  // the inside of its far wall, seen through its near one. Being round and lit by normals that did point outward, it passed.)
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < sides; i++) {
    mesh.addTriangle(rows[j][i], rows[j + 1][i + 1], rows[j + 1][i]);
    mesh.addTriangle(rows[j][i], rows[j][i + 1], rows[j + 1][i + 1]);
  }
  // Closed at both ends: a point in the middle of each, joined to its ring.
  for (const [j, flip] of [[0, true], [last, false]] as const) {
    dir.subVectors(pts[Math.min(last, j + 1)], pts[Math.max(0, j - 1)]).normalize();
    if (flip) dir.negate();
    const p = pts[j], tip = mesh.addVertex(p.x + dir.x * rad[j] * 0.5, p.y + dir.y * rad[j] * 0.5, p.z + dir.z * rad[j] * 0.5, dir.x, dir.y, dir.z, 0.5, v / 0.7, colour[0], colour[1], colour[2]);
    if (open) mesh.setOpen(tip, open(p.y));
    for (let i = 0; i < sides; i++) {
      if (flip) mesh.addTriangle(tip, rows[j][i + 1], rows[j][i]);
      else mesh.addTriangle(tip, rows[j][i], rows[j][i + 1]);
    }
  }
}

/** Burrs and knots for a trunk: a few of each, anywhere round it, the knots where branches once were. */
function trunkGrowths(q: Rng, burrs: number, knots: number): NonNullable<LimbShape['burrs']> {
  const list: NonNullable<LimbShape['burrs']> = [];
  for (let k = 0; k < burrs; k++) list.push({ at: q.range(0.08, 0.85), around: q.range(0, Math.PI * 2), size: q.range(0.16, 0.42), spread: q.range(0.45, 0.95) });
  for (let k = 0; k < knots; k++) list.push({ at: q.range(0.2, 0.92), around: q.range(0, Math.PI * 2), size: q.range(0.12, 0.24), spread: q.range(0.28, 0.5), knot: true });
  return list;
}

/**
 * Grows a broadleaved tree: a trunk that divides into limbs, the limbs into branches and the
 * branches into twigs, each thinner and shorter than what bears it and reaching for the light,
 * with leaves hung in sprays on the twigs. The wood is real geometry, so limbs show through the
 * crown as they do on a tree; the leaves are cards, as before, but placed where there are twigs
 * to carry them, so the crown has the lumps and gaps of the branching under it.
 * Returns how far the crown reaches from the trunk.
 */
export function growTree(planting: Planting, wood: MeshBuilder, x: number, base: number, z: number, height: number, girth: number, o: TreeOptions, rng: Rng): number {
  const levels = (o.detail > 0.6 ? 4 : o.detail > 0.25 ? 3 : 2) + (o.bare && o.detail > 0.25 ? 1 : 0);
  const oak = o.kind === 'oak';
  const heart = new Vector3(x, base + height * 0.62, z);
  const open = o.shaded ? (y: number) => 0.95 - 0.5 * Math.min(1, Math.max(0, (y - base - height * 0.25) / (height * 0.35))) : null;
  const tips: { at: Vector3; reach: number }[] = [];
  // Where the last branches leave the ones that bear them: the inside of the crown.
  const inner: { at: Vector3; reach: number }[] = [];
  let spread = 0;
  const any = new Vector3();
  // No two trunks are alike: some bend, some stand straight; some are fluted at the foot, with
  // buttresses between the flutes, some are oval, some nearly round. (Drawn from a stream of its
  // own, so the branching of trees already seen is not changed.)
  const wide = o.wide ?? 1;
  const windAt = o.wind ? new Vector3(o.wind.x, 0, o.wind.z).normalize() : null;
  const form = rng.fork('trunk-form');
  const bendAt = form.range(0, Math.PI * 2), bendBy = form.chance(0.4) ? form.range(0.12, 0.3) : form.range(0, 0.08);
  const bend = new Vector3(Math.cos(bendAt) * bendBy, 0, Math.sin(bendAt) * bendBy);
  const trunkShape: LimbShape = { lobes: form.int(3, 5), amp: form.range(0.04, 0.2) * (oak ? 1.3 : 0.8), phase: form.range(0, Math.PI * 2), oval: form.range(0.0, 0.11), ovalAt: form.range(0, Math.PI) };
  // An oak is a lumpy tree, with burrs on it; an ash is cleaner. Both keep the scars of branches they have shed.
  trunkShape.lumps = oak ? form.range(0.06, 0.11) : form.range(0.02, 0.05);
  trunkShape.burrs = trunkGrowths(form, oak ? form.int(1, 4) : form.int(0, 1), form.int(1, 3));
  trunkShape.seed = form.int(1, 9999);
  const branch = (from: Vector3, dir: Vector3, length: number, radius: number, level: number) => {
    const steps = level === 0 ? 4 : level >= levels - 1 ? 2 : 3;
    const points = [from.clone()], radii = [radius];
    const d = dir.clone(), p = from.clone();
    // The trunk spreads into the ground at its foot.
    if (level === 0) { points[0].y -= 0.4; radii[0] = radius * 1.55; points.push(from.clone().setY(from.y + 0.25)); radii.push(radius * 1.15); }
    const taper = level === 0 ? 0.3 : 0.4;
    let cut = false;
    for (let s = 1; s <= steps; s++) {
      // It wanders as it grows, and turns upward: less so for a trunk, which was never in shade.
      const gnarl = (oak ? 0.2 : 0.1) * (level === 0 ? 0.35 : 1) * (1 + 0.6 * (wide - 1));
      d.add(any.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(gnarl));
      d.y += level === 0 ? 0 : (oak ? 0.1 : 0.16) / wide;
      if (level === 0) d.addScaledVector(bend, 1);
      d.normalize();
      // (Where it may not go, it turns aside; where every way is shut, it stops short of it, as a bough lopped off a wall.)
      if (level > 0 && o.keepOut) {
        const step = length / steps, next = p.clone().addScaledVector(d, step);
        if (o.keepOut(next) || o.keepOut(next.lerp(p, 0.5))) { const way = giveWay(p, d, step, o.keepOut); if (!way) { cut = true; break; } d.copy(way); }
      }
      p.addScaledVector(d, length / steps);
      points.push(p.clone());
      radii.push(radius * (1 - (taper * s) / steps));
    }
    if (cut) {
      if (points.length >= 2) layLimb(wood, points, radii, level === 1 ? 6 : 4, o.bark, rng.range(0, 3), open);
      return;
    }
    const sides = level === 0 ? (o.detail > 0.5 ? 14 : 6) : level === 1 ? (o.detail > 0.5 ? 6 : 4) : level === 2 ? 4 : 3;
    layLimb(wood, points, radii, sides, o.bark, rng.range(0, 3), open, level === 0 && o.detail > 0.4 ? trunkShape : undefined);
    const end = points[points.length - 1], endRadius = radii[radii.length - 1];
    spread = Math.max(spread, Math.hypot(end.x - x, end.z - z));
    if (level >= levels) {
      tips.push({ at: end.clone(), reach: length });
      tips.push({ at: points[points.length - 2].clone().lerp(end, 0.2), reach: length });
      return;
    }
    if (level === levels - 1) inner.push({ at: end.clone(), reach: length });
    // Where it divides. An ash keeps a leader going nearly straight on; an oak does not.
    const forks = level === 0 ? (oak ? 3 + rng.int(0, 1) : 3) : 2 + (rng.chance(oak ? 0.45 : 0.25) ? 1 : 0);
    // (A wide tree does not draw more from the stream: it only uses what it drew differently.)
    const turn = rng.range(0, Math.PI * 2);
    // Two directions square to this one, to spread the forks about.
    const a = new Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? any.set(1, 0, 0) : UP).normalize(), b = new Vector3().crossVectors(d, a);
    for (let k = 0; k < forks; k++) {
      const leader = !oak && k === 0;
      const lean = Math.min(1.35, (leader ? rng.range(0.05, 0.2) : level === 0 ? (oak ? rng.range(0.6, 1.0) : rng.range(0.7, 0.95)) : rng.range(0.45, 0.8)) + (leader ? 0 : 0.18 * (wide - 1)));
      const az = turn + (k / forks) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const nd = d.clone().multiplyScalar(Math.cos(lean)).addScaledVector(a, Math.sin(lean) * Math.cos(az)).addScaledVector(b, Math.sin(lean) * Math.sin(az));
      // (Bent to the lee, and held down: a limb that would grow into the wind is turned, one that would rise is laid over.)
      if (windAt) { nd.addScaledVector(windAt, o.wind!.strength * (0.5 + 0.3 * level)); nd.y *= 1 - 0.35 * o.wind!.strength; nd.normalize(); }
      const share = leader ? 0.82 : forks === 2 ? 0.74 : 0.64;
      const nl = level === 0 ? height * (oak ? 0.32 : leader ? 0.3 : 0.24) * rng.range(0.85, 1.15) * wide : length * rng.range(0.62, 0.8);
      branch(end, nd, nl, endRadius * share, level + 1);
    }
    // An ash also puts out branches from the side of its trunk, below the top.
    if (!oak && level === 0) {
      for (let k = 0; k < 3; k++) {
        const f = 0.5 + 0.14 * k + rng.range(-0.04, 0.04), at = points[1].clone().lerp(end, f), az = turn + 1 + k * 2.3 + rng.range(-0.4, 0.4);
        branch(at, new Vector3(Math.cos(az) * 0.8, 0.6, Math.sin(az) * 0.8).normalize(), height * 0.2 * rng.range(0.85, 1.15), radius * 0.38, 2);
      }
    }
  };
  const lean = oak ? 0.1 : 0.05;
  const trunkDir = new Vector3(rng.range(-lean, lean), 1, rng.range(-lean, lean));
  if (windAt) trunkDir.addScaledVector(windAt, 0.35 * o.wind!.strength);
  branch(new Vector3(x, base, z), trunkDir.normalize(), height * (oak ? 0.3 : 0.48), girth, 0);
  // Roots: the trunk does not go into the ground like a post, but spreads into it.
  if (o.soft && o.detail > 0.6) {
    const roots = 4 + rng.int(0, 2), turn = rng.range(0, Math.PI * 2);
    for (let k = 0; k < roots; k++) {
      const a = turn + (k / roots) * Math.PI * 2 + rng.range(-0.3, 0.3), out = girth * rng.range(2.1, 3.3), c = Math.cos(a), s = Math.sin(a);
      // Each leaves the trunk a little way up, runs out along the ground and goes under.
      layLimb(o.soft, [new Vector3(x + c * girth * 0.4, base + girth * 1.3, z + s * girth * 0.4), new Vector3(x + c * out * 0.5, base + girth * 0.3, z + s * out * 0.5), new Vector3(x + c * out, base - girth * 0.7, z + s * out)],
        [girth * 0.6, girth * 0.4, girth * 0.2], 5, o.bark, rng.range(0, 3), open);
    }
  }
  // Leaves: a spray about each twig, shaded half as a body of its own and half as part of the
  // whole crown. A crown is dark inside and beneath, where its own leaves keep the light out,
  // and bright at its edge: each spray is tinted by how deep in the crown it hangs.
  let crownReach = 1;
  for (const tip of tips) crownReach = Math.max(crownReach, tip.at.distanceTo(heart));
  // What the eye takes for a living crown, apart from its shape, is the variety in it. Each spray
  // has its own shade: new growth at the sunlit edge is yellower and brighter, the old leaf inside
  // and beneath is bluer and darker, and from bough to bough the green wanders a little. And the
  // outer shell is not quite whole: some sprays are left out, so the outline is lumpy and the sky
  // shows through in places, the leaves of the rest made a little more numerous to keep the crown full.
  // (Drawn from a stream of its own, so the branching of trees already seen is not changed.)
  const look = rng.fork('crown-look');
  const gaps = o.detail > 0.3;
  const hang = (list: { at: Vector3; reach: number }[], cards: number, size: number, dim: number, outer = false) => {
    let kept = 0;
    const keep: boolean[] = list.map((tip) => {
      const depth = Math.min(1, tip.at.distanceTo(heart) / crownReach);
      const k = !(gaps && outer && look.chance(0.3 * depth * depth * depth));
      if (k) kept++;
      return k;
    });
    // (Fewer leaves than twigs, as on a tree bare in winter, are hung on that many twigs, one spray to each, and none on the rest. Every
    // twig had at least one: a bare tree, with an order of twigs more, came out in full leaf.)
    if (cards < 0.5) return;
    const each = Math.max(1, Math.round(cards / Math.max(1, kept))), thin = Math.min(1, cards / Math.max(1, kept));
    let due = 0;
    list.forEach((tip, i) => {
      if (!keep[i]) return;
      due += thin;
      if (due < 0.999) return;
      due -= 1;
      // (Smaller where it would reach into what it may not, and none at all inside it.)
      let r = Math.min(1.6, 0.3 + tip.reach * 0.55);
      if (o.keepOut) { r = roomFor(tip.at, r, size, o.keepOut); if (!r) return; }
      const depth = Math.min(1, tip.at.distanceTo(heart) / crownReach);
      const up = Math.min(1, Math.max(0, (tip.at.y - heart.y) / (crownReach * 0.7) + 0.5));
      const light = dim * (0.5 + 0.5 * depth * depth) * (tip.at.y < heart.y ? 0.82 : 1);
      // Towards yellow in the sun at the edge, towards blue-green in the old leaf; and a wander of its own.
      const warm = (depth * depth * up - 0.25) * 0.3 + (look.next() - 0.5) * 0.16;
      const tint = [1 + warm * 0.9, 1 + warm * 0.1, 1 - warm * 1.1];
      const centre = tip.at.clone().lerp(heart, 0.5);
      planting.spray(tip.at.x, tip.at.y, tip.at.z, r, r * 0.65, each, size, (q) => { const c = o.leaf(q); return [c[0] * light * tint[0], c[1] * light * tint[1], c[2] * light * tint[2]]; }, rng, centre.x, centre.y - r, centre.z);
      spread = Math.max(spread, Math.hypot(tip.at.x - x, tip.at.z - z) + r * 0.7);
    });
  };
  hang(tips, o.cards * 0.78, o.cardSize, 1, true);
  // Larger, darker boughs fill the inside, so the sky does not show through the middle of the tree.
  if (inner.length) hang(inner, o.cards * 0.22, o.cardSize * 1.7, 0.62);
  return spread;
}

export interface ConiferOptions {
  /** A spruce is a spire clothed to the ground in drooping boughs; a pine a bare stem with a rounded head. */
  kind: 'spruce' | 'pine';
  detail: number;
  needle: (rng: Rng) => Colour;
  bark: Colour;
  shaded?: boolean;
  /** Where branches go: wood that is drawn but stops nobody. */
  soft: MeshBuilder;
  /** A pine that has stood in the sea wind: short, its trunk leaning and bent, its crown a flat-topped umbrella. */
  coastal?: boolean;
  /** Where no bough may grow: as for `TreeOptions`. A bough that would turns aside, or grows shorter, or is not there. */
  keepOut?: (p: Vector3) => boolean;
}

const BX = new Vector3(), BY = new Vector3(), BZ = new Vector3();

/**
 * Grows a conifer. The trunk goes straight up, tapering. Branches leave it in whorls, a ring of
 * them every half metre or so: on a spruce the low ones are long and hang, the high ones short
 * and rising, and every one turns up at its tip; on a pine there are none for half its height,
 * and those above reach up and out into a rounded head. Needles are sprays laid along each
 * branch, some flat and some hanging, darker by the trunk and lighter at the tips where the
 * year's growth is. Returns how far the boughs reach.
 */
export function growConifer(planting: Planting, wood: MeshBuilder, x: number, base: number, z: number, height: number, radius: number, girth: number, o: ConiferOptions, rng: Rng): number {
  const pine = o.kind === 'pine';
  if (pine) return growPine(planting, wood, x, base, z, height, radius, girth, o, rng.fork('pine'));
  const open = o.shaded ? (y: number) => 0.9 - 0.45 * Math.min(1, Math.max(0, (y - base) / (height * 0.5))) : null;
  // The trunk, with a little sway in it.
  const lean = [rng.range(-0.02, 0.02), rng.range(-0.02, 0.02)], bow = rng.range(-0.25, 0.25), bowAt = rng.range(0, Math.PI * 2);
  const axis = (t: number): Vector3 => new Vector3(x + lean[0] * height * t + Math.cos(bowAt) * bow * Math.sin(t * Math.PI) * 0.5, base + height * t, z + lean[1] * height * t + Math.sin(bowAt) * bow * Math.sin(t * Math.PI) * 0.5);
  const stem: Vector3[] = [axis(0).setY(base - 0.4), axis(0.02)], radii = [girth * 1.5, girth * 1.12];
  for (let k = 1; k <= 6; k++) { stem.push(axis((k / 6) * 0.97)); radii.push(girth * (1 - 0.9 * (k / 6)) + 0.012); }
  // (A spruce's stem is the plainest of any, but not a post: a little lumpy, with the scars of its lowest boughs. Drawn from a stream of its own.)
  const stemForm = rng.fork('stem-form');
  layLimb(wood, stem, radii, o.detail > 0.5 ? 10 : 5, o.bark, rng.range(0, 3), open, o.detail > 0.5 ? { lobes: 3, amp: 0.03, phase: stemForm.range(0, 6), oval: 0.02, ovalAt: 0, lumps: stemForm.range(0.02, 0.04), burrs: trunkGrowths(stemForm, 0, stemForm.int(2, 4)), seed: stemForm.int(1, 9999) } : undefined);

  const crownFrom = pine ? rng.range(0.5, 0.62) : rng.range(0.08, 0.2);
  const spacing = (pine ? 0.6 : 0.42 + height * 0.012) / Math.max(0.45, o.detail);
  const whorls = Math.max(4, Math.round((height * (0.97 - crownFrom)) / spacing));
  const dir = new Vector3(), tip = new Vector3(), at = new Vector3();
  let reach = 0, turn = rng.range(0, Math.PI * 2);
  const bough = (from: Vector3, az: number, rise: number, length: number, f: number, thick: number) => {
    // (Where it would grow into what it may not, it is turned aside a little, or else grows shorter, or is not there at all. A spruce
    // against a wall is flat on that side.)
    if (o.keepOut) {
      const shape = (a: number, l: number) => {
        const m = from.clone().add(dir.set(Math.cos(a) * Math.cos(rise), Math.sin(rise), Math.sin(a) * Math.cos(rise)).multiplyScalar(l * 0.55));
        return [m, m.clone().add(tip.set(Math.cos(a) * Math.cos(rise + 0.4), Math.sin(rise + 0.4), Math.sin(a) * Math.cos(rise + 0.4)).multiplyScalar(l * 0.45))];
      };
      const clear = (a: number, l: number) => { const [m, e] = shape(a, l); return !o.keepOut!(m) && !o.keepOut!(e) && !o.keepOut!(e.clone().addScaledVector(tip, 0.4)); };
      let found = clear(az, length);
      for (const turn of [0.3, -0.3, 0.6, -0.6]) if (!found && clear(az + turn, length)) { az += turn; found = true; }
      while (!found && length > 0.35) { length *= 0.7; found = clear(az, length); }
      if (!found) return;
    }
    // Out from the trunk, then turning upward towards its tip.
    dir.set(Math.cos(az) * Math.cos(rise), Math.sin(rise), Math.sin(az) * Math.cos(rise));
    const mid = from.clone().addScaledVector(dir, length * 0.55);
    tip.set(Math.cos(az) * Math.cos(rise + 0.4), Math.sin(rise + 0.4), Math.sin(az) * Math.cos(rise + 0.4));
    const end = mid.clone().addScaledVector(tip, length * 0.45);
    if (o.detail > 0.5 && thick > 0.012) layLimb(o.soft, [from, mid, end], [thick, thick * 0.6, thick * 0.2], 3, [o.bark[0] * 0.7, o.bark[1] * 0.7, o.bark[2] * 0.7], f * 9, open ? (y) => open(y) * 0.6 : null);
    reach = Math.max(reach, Math.hypot(end.x - x, end.z - z));
    // Sprays of needles along it: more of them, and wider, the longer the bough.
    const sprays = Math.max(pine ? 3 : 2, Math.round(length / (pine ? 0.42 : 0.55) * Math.min(1, 0.45 + o.detail * 0.6)));
    for (let k = 0; k < sprays; k++) {
      const t = pine ? 0.3 + 0.75 * ((k + rng.next()) / sprays) : (k + 0.35 + 0.5 * rng.next()) / sprays;
      if (t < 0.55) at.copy(from).lerp(mid, t / 0.55); else at.copy(mid).lerp(end, Math.min(1.1, (t - 0.55) / 0.45));
      const along = t < 0.55 ? dir : tip;
      // The card lies along the bough, its top edge towards the trunk; flat on a pine, and on a
      // spruce flat or hanging by turns, since spruce twigs hang from the branch like a curtain.
      BY.copy(along).negate();
      BX.crossVectors(BY, UP).normalize();
      BZ.crossVectors(BX, BY);
      const roll = !pine && k % 2 === 1 ? rng.range(0.9, 1.35) * (rng.chance(0.5) ? 1 : -1) : rng.range(-0.45, 0.45);
      const size = (pine ? rng.range(0.95, 1.5) : (0.5 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1))) * Math.min(1.5, 0.55 + length * 0.42)) * (o.detail > 0.5 ? 1 : 1.5);
      M.makeBasis(BX, BY, BZ);
      Q.setFromRotationMatrix(M).multiply(Q2.setFromAxisAngle(UP, roll));
      M.compose(P.set(at.x, at.y - (Math.abs(roll) > 0.8 ? size * 0.22 : 0), at.z), Q, S.set(size * 0.9, size * 1.1, size));
      const c = o.needle(rng), light = (0.5 + 0.5 * t) * (0.85 + 0.3 * f);
      planting.pushCard(planting.needles, [c[0] * light, c[1] * light, c[2] * light], x, from.y - 0.8 - length * 0.5, z);
    }
  };
  for (let w = 0; w < whorls; w++) {
    const f = (w + 0.5) / whorls, from = axis(crownFrom + (0.97 - crownFrom) * f);
    const around = pine ? 4 + rng.int(0, 1) : o.detail > 0.5 ? 5 : 4;
    turn += pine ? rng.range(0.8, 2.2) : 0.63;
    for (let k = 0; k < around; k++) {
      // Now and then a branch is missing, as on any tree that has stood in wind.
      if (rng.chance(0.08)) continue;
      const az = turn + (k / around) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const length = pine ? radius * (0.45 + 0.75 * Math.sin(Math.PI * Math.pow(f, 0.75))) * rng.range(0.75, 1.1) : (radius * (Math.pow(1 - f, 0.9) * 0.95 + 0.07)) * rng.range(0.8, 1.12);
      const rise = pine ? rng.range(0.15, 0.55) : -0.42 + 0.72 * f + rng.range(-0.1, 0.1);
      bough(from, az, rise, length, f, (pine ? 0.035 : 0.014 + 0.03 * (1 - f)) * (girth / 0.2));
    }
  }
  // A pine keeps the stubs of the branches it has shed; a spruce has dead twigs under its skirt.
  if (o.detail > 0.6) {
    for (let k = 0, n = pine ? 5 : 3; k < n; k++) {
      const t = pine ? rng.range(0.18, crownFrom) : rng.range(0.04, crownFrom + 0.03), from = axis(t), az = rng.range(0, Math.PI * 2), len = rng.range(0.3, pine ? 0.9 : 1.4);
      layLimb(o.soft, [from, from.clone().add(dir.set(Math.cos(az) * len, rng.range(-0.15, 0.1) * len, Math.sin(az) * len))], [girth * 0.14, girth * 0.05], 3, [o.bark[0] * 0.6, o.bark[1] * 0.6, o.bark[2] * 0.6], k, open);
    }
  }
  // The leader: two upright sprays crossed at the very top.
  for (const yaw of [0, Math.PI / 2]) {
    const top = axis(0.985);
    M.compose(P.set(top.x, top.y, top.z), Q.setFromEuler(E.set(0, yaw + turn, 0)), S.set(radius * (pine ? 0.7 : 0.42), height * (pine ? 0.1 : 0.16), 1));
    planting.pushCard(planting.needles, o.needle(rng), x, base + height * 0.6, z);
  }
  return reach;
}

/**
 * Grows a pine. A spruce is a spire of boughs; a pine is a tree of branches. Its trunk is bare for
 * a third of its height or more, with the stubs and dead limbs of what it has shed; above that,
 * limbs as thick as an arm leave it a few at a time, the lower ones level or sagging and the upper
 * ones rising, and every one sweeps upward towards its end. Each limb bears branches to either
 * side, each branch twigs, and the needles are not along the wood at all but in brushes at the
 * ends of the twigs: so the crown is clumps of green on a frame of red wood that shows between
 * them. A coastal pine is the same tree after a life in the wind: half as tall, the trunk leaning
 * and bent, and the crown spread flat at the top like an umbrella. Returns how far it reaches.
 */
function growPine(planting: Planting, wood: MeshBuilder, x: number, base: number, z: number, height: number, radius: number, girth: number, o: ConiferOptions, rng: Rng): number {
  const coastal = !!o.coastal, rich = o.detail > 0.5;
  // (Its limbs reach a quarter of its height or more, whatever radius was asked for: that was a spruce's measure.)
  const H = coastal ? height * 0.62 : height, R = coastal ? Math.max(radius * 1.5, H * 0.5) : Math.max(radius * 1.25, H * 0.27);
  const open = o.shaded ? (y: number) => 0.92 - 0.4 * Math.min(1, Math.max(0, (y - base) / (H * 0.6))) : null;
  // The trunk: nearly straight inland, with a sway; on the coast it leans away from the wind and bends back up.
  const leanAt = rng.range(0, Math.PI * 2), lean = coastal ? rng.range(0.3, 0.55) : rng.range(0, 0.05);
  const bowAt = leanAt + rng.range(-1, 1), bow = coastal ? rng.range(0.5, 1.1) : rng.range(-0.3, 0.3);
  // (And on the coast it is crooked as well: it has been set back and has started again more than once, each time another way.)
  const kink = coastal ? rng.range(0.25, 0.5) : 0, kinkAt = rng.range(0, Math.PI * 2), kinks = rng.range(2.2, 3.4), kinkFrom = rng.range(0, 3);
  const axis = (t: number): Vector3 => {
    const crook = kink * Math.sin(t * Math.PI * kinks + kinkFrom) * Math.min(1, t * 4);
    return new Vector3(
      x + Math.cos(leanAt) * lean * H * t + Math.cos(bowAt) * bow * Math.sin(t * Math.PI) * 0.5 + Math.cos(kinkAt + t * 2.5) * crook,
      base + H * t * (coastal ? 1 - 0.12 * t : 1),
      z + Math.sin(leanAt) * lean * H * t + Math.sin(bowAt) * bow * Math.sin(t * Math.PI) * 0.5 + Math.sin(kinkAt + t * 2.5) * crook);
  };
  const thickAt = (t: number) => girth * (coastal ? 1.25 : 1) * (1 - 0.8 * Math.pow(t, 1.15)) + 0.014;
  const stem: Vector3[] = [axis(0).setY(base - 0.4), axis(0.02)], radii = [thickAt(0) * 1.5, thickAt(0) * 1.12];
  const rings = coastal ? 14 : 8;
  for (let k = 1; k <= rings; k++) { stem.push(axis((k / rings) * 0.97)); radii.push(thickAt((k / rings) * 0.97)); }
  // A pine inland is a clean stem with the scars of its branches. One on the coast is gnarled: deeply fluted and out of round, swollen
  // and hollowed all the way up, with burrs on it as well as knots.
  layLimb(wood, stem, radii, rich ? (coastal ? 14 : 12) : 5, o.bark, rng.range(0, 3), open, rich ? (coastal
    ? { lobes: rng.int(3, 5), amp: rng.range(0.14, 0.26), phase: rng.range(0, 6), oval: rng.range(0.06, 0.16), ovalAt: rng.range(0, 3), lumps: rng.range(0.1, 0.17), burrs: trunkGrowths(rng, rng.int(3, 6), rng.int(4, 8)), seed: rng.int(1, 9999) }
    : { lobes: rng.int(3, 5), amp: rng.range(0.05, 0.14), phase: rng.range(0, 6), oval: rng.range(0, 0.08), ovalAt: rng.range(0, 3), lumps: rng.range(0.03, 0.06), burrs: trunkGrowths(rng, rng.int(0, 1), rng.int(3, 6)), seed: rng.int(1, 9999) }) : undefined);

  const crownFrom = coastal ? rng.range(0.4, 0.5) : rng.range(0.3, 0.4);
  const heart = axis(crownFrom + (0.97 - crownFrom) * 0.45);
  const limbBark: Colour = [o.bark[0] * 0.92, o.bark[1] * 0.9, o.bark[2] * 0.9];
  let reach = 0;
  const dir = new Vector3(), any = new Vector3();
  /** A brush of needles at the end of a twig, pointing the way the twig does and a little skyward. */
  const brush = (at: Vector3, way: Vector3, size: number, light: number) => {
    // (None where it would be inside what may not be grown into.)
    if (o.keepOut?.(at)) return;
    BY.copy(way).multiplyScalar(0.7).add(UP).normalize();
    BX.crossVectors(BY, Math.abs(BY.y) > 0.95 ? any.set(1, 0, 0) : UP).normalize();
    BZ.crossVectors(BX, BY);
    M.makeBasis(BX, BY, BZ);
    Q.setFromRotationMatrix(M).multiply(Q2.setFromAxisAngle(UP, rng.range(0, Math.PI)));
    M.compose(P.set(at.x - BY.x * size * 0.12, at.y - BY.y * size * 0.12, at.z - BY.z * size * 0.12), Q, S.set(size * 0.85, size, size * 0.85));
    const c = o.needle(rng);
    // Lit as part of the crown's whole body and, half and half, of its own clump: bright above and outward, dark within and beneath.
    planting.pushCard(planting.pines, [c[0] * light, c[1] * light, c[2] * light], (at.x + heart.x) / 2, Math.min(at.y, heart.y) - 1.2, (at.z + heart.z) / 2);
    reach = Math.max(reach, Math.hypot(at.x - x, at.z - z) + size * 0.4);
  };
  /** A limb, a branch or a twig: out from `from`, turning skyward as it goes, bearing lesser ones to either side and brushes at its end. */
  const limb = (from: Vector3, az: number, rise: number, length: number, thick: number, level: number, f: number) => {
    // (A coastal pine's limbs are as crooked as its trunk: more turns to each, and each turn sharper.)
    const steps = (level === 0 ? 4 : level === 1 ? 3 : 2) + (coastal ? 2 : 0);
    const points = [from.clone()], thicks = [thick];
    const p = from.clone();
    dir.set(Math.cos(az) * Math.cos(rise), Math.sin(rise), Math.sin(az) * Math.cos(rise));
    const d = dir.clone(), ways: Vector3[] = [d.clone()];
    for (let s = 1; s <= steps; s++) {
      // It wanders, and sweeps upward: a little at first, strongly towards its end.
      d.add(any.set(rng.range(-1, 1), rng.range(-0.5, 0.5), rng.range(-1, 1)).multiplyScalar((level === 0 ? 0.13 : 0.2) * (coastal ? 2.4 : 1)));
      d.y += (level === 0 ? 0.03 : 0.16) + (level === 0 ? 0.13 : 0.2) * (s / steps) * (coastal ? 0.6 : 1);
      d.normalize();
      // (Where it may not go, it turns aside; where every way is shut, it ends there.)
      if (o.keepOut) {
        const step = length / steps, next = p.clone().addScaledVector(d, step);
        if (o.keepOut(next) || o.keepOut(next.lerp(p, 0.5))) { const way = giveWay(p, d, step, o.keepOut); if (!way) break; d.copy(way); }
      }
      p.addScaledVector(d, length / steps);
      points.push(p.clone());
      thicks.push(thick * (1 - 0.62 * (s / steps)));
      ways.push(d.clone());
    }
    if (points.length < 2) return;
    const sides = level === 0 ? (rich ? 6 : 4) : level === 1 ? 4 : 3;
    layLimb(o.soft, points, thicks, sides + (coastal && level === 0 ? 2 : 0), limbBark, rng.range(0, 3), open ? (y) => open(y) * (level === 0 ? 0.9 : 0.7) : null,
      coastal && level === 0 && rich ? { lobes: 3, amp: 0, phase: 0, oval: 0.08, ovalAt: rng.range(0, 3), lumps: 0.12, burrs: trunkGrowths(rng, rng.int(0, 2), rng.int(1, 3)), seed: rng.int(1, 9999) } : undefined);
    const end = points[points.length - 1], endWay = ways[ways.length - 1], grown = points.length - 1;
    const at = (t: number): [Vector3, Vector3] => {
      const g = Math.min(grown - 1e-4, t * grown), i = Math.floor(g);
      return [points[i].clone().lerp(points[i + 1], g - i), ways[i + 1]];
    };
    const last = level >= (rich ? 2 : 1);
    if (!last) {
      // Lesser branches to either side by turns, from a third of the way out.
      const n = level === 0 ? 4 + rng.int(0, 2) : 3 + rng.int(0, 1);
      for (let k = 0; k < n; k++) {
        const t = 0.34 + 0.6 * ((k + rng.range(0.1, 0.9)) / n), [bp, bw] = at(t);
        const side = (k % 2 ? 1 : -1) * rng.range(0.55, 1.15);
        limb(bp, Math.atan2(bw.z, bw.x) + side, Math.asin(Math.max(-0.9, Math.min(0.9, bw.y))) + rng.range(0.05, 0.35), length * rng.range(0.4, 0.58) * (1 - 0.3 * t), thick * (0.5 - 0.15 * t), level + 1, f);
      }
    }
    // Needles: a brush at the end of everything, and on the last twigs two or three more just short of it.
    const size = (coastal ? 0.8 : 0.95) * rng.range(0.85, 1.2) * (rich ? 1 : 1.5);
    const depth = Math.min(1, end.distanceTo(heart) / (R * 1.1)), light = (0.55 + 0.5 * depth) * (end.y < heart.y ? 0.85 : 1) * (0.9 + 0.2 * f);
    brush(end, endWay, size, light);
    if (last) {
      for (let k = 0; k < 3; k++) {
        const [bp, bw] = at(rng.range(0.3, 0.9));
        any.set(rng.range(-1, 1), rng.range(0, 0.8), rng.range(-1, 1)).normalize().multiplyScalar(0.8).add(bw);
        brush(bp.addScaledVector(any, size * 0.2), any.normalize(), size * rng.range(0.75, 1), light * 0.9);
      }
    }
  };
  const spacing = (coastal ? 0.75 : 1.05) / Math.max(0.5, o.detail);
  const whorls = Math.max(3, Math.round((H * (0.96 - crownFrom)) / spacing));
  let turn = rng.range(0, Math.PI * 2);
  for (let w = 0; w < whorls; w++) {
    const f = (w + 0.5) / whorls, from = axis(crownFrom + (0.96 - crownFrom) * f);
    const around = rng.int(2, 4);
    turn += rng.range(0.9, 2.2);
    for (let k = 0; k < around; k++) {
      const az = turn + (k / around) * Math.PI * 2 + rng.range(-0.4, 0.4);
      // Longest low in the crown and shortest at the top; on the coast the other way about, which is what makes the umbrella.
      const len = R * (coastal ? 0.55 + 0.6 * f : 0.34 + 0.76 * Math.sin(Math.PI * (0.15 + 0.75 * f))) * rng.range(0.75, 1.15);
      const rise = coastal ? rng.range(0.05, 0.4) : -0.12 + 0.6 * f + rng.range(-0.15, 0.15);
      limb(from, az, rise, len, thickAt(crownFrom + (0.96 - crownFrom) * f) * rng.range(0.34, 0.5), 0, f);
    }
  }
  // The leader: the trunk's own top, with its brushes.
  { const top = axis(0.97); for (let k = 0; k < 3; k++) brush(top.clone().add(any.set(rng.range(-0.3, 0.3), rng.range(-0.1, 0.3), rng.range(-0.3, 0.3))), any.set(rng.range(-0.6, 0.6), 1, rng.range(-0.6, 0.6)).normalize(), 0.8, 1.05); }
  // What it has shed: stubs on the bare trunk, and a dead limb or two still hanging, grey and bare.
  if (o.detail > 0.6) {
    const dead: Colour = [o.bark[0] * 0.5, o.bark[1] * 0.56, o.bark[2] * 0.62];
    for (let k = 0, n = rng.int(4, 7); k < n; k++) {
      const t = rng.range(0.14, crownFrom + 0.05), from = axis(t), az = rng.range(0, Math.PI * 2), long = rng.chance(0.3), len = long ? rng.range(1.2, 2.6) : rng.range(0.25, 0.8);
      const out = new Vector3(Math.cos(az), rng.range(-0.25, 0.05), Math.sin(az)).normalize();
      const mid = from.clone().addScaledVector(out, len * 0.55), end = mid.clone().addScaledVector(out, len * 0.45).add(any.set(rng.range(-0.2, 0.2), -len * rng.range(0.1, 0.3), rng.range(-0.2, 0.2)));
      layLimb(o.soft, [from, mid, end], [thickAt(t) * (long ? 0.2 : 0.16), thickAt(t) * 0.1, 0.012], 3, dead, k, open);
    }
  }
  return reach;
}

/** A plain tapering trunk for a tree that is only looked at: a few sides, no bark relief. */
export function layTrunk(mesh: MeshBuilder, x: number, base: number, z: number, height: number, girth: number, colour: Colour, lean: [number, number] = [0, 0]): void {
  const sides = 6, rings = 3;
  const ids: number[][] = [];
  for (let j = 0; j <= rings; j++) {
    const f = j / rings, r = girth * (1 - 0.6 * f), y = base - 0.4 + (height + 0.4) * f;
    const row: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const tone = 0.95 + 0.08 * ((i * 7 + j * 3) % 5) / 5;
      row.push(mesh.addVertex(x + lean[0] * f + Math.cos(a) * r, y, z + lean[1] * f + Math.sin(a) * r, Math.cos(a), 0.1, Math.sin(a), i * 0.5, y * 0.6, colour[0] * tone, colour[1] * tone, colour[2] * tone));
    }
    ids.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    mesh.addTriangle(ids[j][i], ids[j + 1][i], ids[j + 1][i + 1]);
    mesh.addTriangle(ids[j][i], ids[j + 1][i + 1], ids[j][i + 1]);
  }
}
