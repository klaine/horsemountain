import { ShapeUtils, Vector2, Vector3 } from 'three';
import { BRICK, brickBackWindows, brickColumns, brickDoor, brickEaves, brickFloor, brickGroundWindows, brickShell, churchParts, PIER, pierAt } from '../core/brick';
import { blinded } from '../core/building';
import { Rng } from '../core/rng';
import { Building } from '../core/site';
import { buildingTools, litRoom } from './buildings';
import { MeshBuilder } from './geom/meshBuilder';
import { buildInterior, openLeaves } from './interior';

/**
 * Buildings of brick, as in the old towns of the Baltic coast: the merchants' houses, warehouses
 * and churches of the Hanseatic towns, Lübeck above all. The site document says which of the
 * family a building is and how its front is made (`BrickWork`); this makes it.
 *
 * A brick front is not a flat wall with things stuck on it: it is cut. Windows and doors are
 * holes through it, with deep reveals; tall pointed niches are sunk into its face, and their
 * backs are plastered white or left as brick; the gable's outline is cut in steps, or between
 * piers, or in curves. So a front is made as a solid of the outline it has, with its openings and
 * niches as holes in it, in two layers: the face, a niche's depth thick, with the niches and the
 * openings through it; and the wall behind, with only the openings. The holes and outlines are
 * plane figures in the measures of the wall (`s` along it from its left end as seen from outside,
 * `y` up), made into solids by `prism`.
 *
 * The measures of a wall are as in `buildings.ts`: `s` along it, `y` up from the ground before the
 * door, `t` into it from its face.
 */

type Colour = [number, number, number];
export type Pt = [number, number];
type Tools = ReturnType<typeof buildingTools>;
export interface Face { L: number; P: (s: number, y: number, t: number) => Vector3 }
/** The head of an opening or a niche: square, a shallow arc, a half circle, or pointed. */
export type Head = 'flat' | 'segment' | 'round' | 'pointed';
/** An opening or a niche: its sides, its sill or foot, the top of its head, and the head's shape. */
export interface Hole { s0: number; s1: number; y0: number; y1: number; head: Head }

const WHITE: Colour = [0.9, 0.89, 0.85], FRAME: Colour = [0.88, 0.87, 0.82], PANE: Colour = [0.04, 0.055, 0.075], IRON: Colour = [0.05, 0.05, 0.055];
const OAK: Colour = [0.2, 0.13, 0.085];
const shade = (c: Colour, k: number): Colour => [c[0] * k, c[1] * k, c[2] * k];
const mul = (a: Colour, c: Colour): Colour => [a[0] * c[0], a[1] * c[1], a[2] * c[2]];
/** Dark glazed brick: the red is made nearly black with a green cast. */
const GLAZED: Colour = [0.3, 0.42, 0.42];
/** The roofs of the brick towns: their clay tiles a deeper red than the hamlets', tiles glazed nearly black, or copper gone green. */
const COPPER: Colour = [0.22, 0.44, 0.36];
const roofOf = (roof: 'red' | 'dark' | 'copper'): [string, Colour] => (roof === 'copper' ? ['copper', COPPER] : ['tile', roof === 'dark' ? [0.34, 0.32, 0.34] : [0.8, 0.64, 0.58]]);
/** Door paint of the old towns: bottle green, oxblood, a brown, a dull blue. */
const DOORS: Colour[] = [[0.08, 0.17, 0.12], [0.3, 0.07, 0.06], [0.2, 0.12, 0.07], [0.1, 0.14, 0.2]];

// ---------------------------------------------------------------------------------------------
// Plane figures.

/** How high the head of an opening `w` broad rises above its springing. */
export function riseOf(w: number, head: Head): number {
  if (head === 'flat') return 0;
  if (head === 'segment') return Math.min(0.3, w * 0.16);
  if (head === 'round') return w / 2;
  // (Pointed: two arcs, each of a radius a little less than the breadth, struck from points on the springing line.)
  const r = w * 0.9;
  return Math.sqrt(r * r - (r - w / 2) * (r - w / 2));
}

/** The points of a head from its right springing over to its left, both left out, at height `spring`. */
export function headPoints(s0: number, s1: number, spring: number, head: Head, n = 8): Pt[] {
  const w = s1 - s0, mid = (s0 + s1) / 2, out: Pt[] = [];
  if (head === 'flat') return out;
  if (head === 'round') {
    for (let i = 1; i < n * 2; i++) { const a = (Math.PI * i) / (n * 2); out.push([mid + Math.cos(a) * w / 2, spring + Math.sin(a) * w / 2]); }
    return out;
  }
  if (head === 'segment') {
    // (An arc through both springings and a crown `rise` above them.)
    const h = riseOf(w, head), r = (w * w / 4 + h * h) / (2 * h), cy = spring + h - r, a0 = Math.asin(w / 2 / r);
    for (let i = 1; i < n; i++) { const a = -a0 + (2 * a0 * i) / n; out.push([mid + Math.sin(a) * r, cy + Math.cos(a) * r]); }
    return out;
  }
  const r = w * 0.9, h = riseOf(w, head), top = Math.asin(h / r);
  // The right arc is struck from a point inside the left springing, and rises from the right; then the left, from the apex down.
  for (let i = 1; i <= n; i++) { const a = (top * i) / n; out.push([s1 - r + Math.cos(a) * r, spring + Math.sin(a) * r]); }
  for (let i = n - 1; i >= 1; i--) { const a = (top * i) / n; out.push([s0 + r - Math.cos(a) * r, spring + Math.sin(a) * r]); }
  return out;
}

/** The outline of an opening, anticlockwise from its lower left corner. */
export function shapeOf(g: Hole): Pt[] {
  const spring = g.y1 - riseOf(g.s1 - g.s0, g.head);
  return [[g.s0, g.y0], [g.s1, g.y0], [g.s1, spring], ...headPoints(g.s0, g.s1, spring, g.head), [g.s0, spring]];
}

/** A figure with its points counted round the other way, or not: the area it encloses, signed. */
const areaOf = (ring: Pt[]) => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/** What of a figure lies on one side of an upright line: `keep` -1 for the left of `s`, 1 for the right. */
export function clipAt(ring: Pt[], s: number, keep: -1 | 1): Pt[] {
  const inside = (p: Pt) => (p[0] - s) * keep >= 0, out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (s - a[0]) / (b[0] - a[0]); out.push([s, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

/** Whether a hole lies within another's bounds. */
const within = (g: Hole, n: Hole) => g.s0 > n.s0 - 1e-3 && g.s1 < n.s1 + 1e-3 && g.y0 > n.y0 - 1e-3 && g.y1 < n.y1 + 1e-3;

// ---------------------------------------------------------------------------------------------
// Solids from figures.

/** The tools for the brick buildings: the common ones, and solids cut from figures. */
export function brickTools(b: Building, base: number, mesh: (material: string) => MeshBuilder) {
  const k = buildingTools(b, base, mesh);
  const D = new Vector3();
  /**
   * A plane figure made solid in a wall: its face at depth `t0`, its back at `t1`, and an edge all
   * round, with holes through it. Every face is flat-shaded, as everything built is.
   */
  const prism = (f: Face, outline: Pt[], holes: Pt[][], t0: number, t1: number, material: string, colour: Colour) => {
    if (outline.length < 3) return;
    const flat = [...outline, ...holes.flat()];
    const tris = ShapeUtils.triangulateShape(outline.map(([s, y]) => new Vector2(s, y)), holes.map((h) => h.map(([s, y]) => new Vector2(s, y))));
    const out = D.copy(f.P(0, 0, 0)).sub(f.P(0, 0, 1)).clone(), back = out.clone().negate();
    for (const [a, c, e] of tris) {
      k.poly(material, [f.P(flat[a][0], flat[a][1], t0), f.P(flat[c][0], flat[c][1], t0), f.P(flat[e][0], flat[e][1], t0)], colour, out);
      k.poly(material, [f.P(flat[a][0], flat[a][1], t1), f.P(flat[c][0], flat[c][1], t1), f.P(flat[e][0], flat[e][1], t1)], colour, back);
    }
    // (Round each ring, the edge faces away from what is solid: outward from the outline, inward into each hole.)
    [outline, ...holes].forEach((ring, r) => {
      const sign = (areaOf(ring) > 0 ? 1 : -1) * (r === 0 ? 1 : -1);
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i], q = ring[(i + 1) % ring.length], ds = q[0] - p[0], dy = q[1] - p[1];
        if (Math.abs(ds) + Math.abs(dy) < 1e-5) continue;
        const n = f.P(p[0] + dy * sign, p[1] - ds * sign, t0).sub(f.P(p[0], p[1], t0));
        k.poly(material, [f.P(p[0], p[1], t0), f.P(q[0], q[1], t0), f.P(q[0], q[1], t1), f.P(p[0], p[1], t1)], colour, n);
      }
    });
  };
  /** A many-sided pyramid standing on a level base: a pinnacle's cap, a spire. `turn` sets which way its corners point. */
  const pyramid = (at: Vector3, radius: number, height: number, sides: number, turn: number, material: string, colour: Colour) => {
    const top = at.clone().setY(at.y + height), ring = Array.from({ length: sides }, (_, i) => {
      const a = turn + (i / sides) * Math.PI * 2;
      return new Vector3(at.x + Math.cos(a) * radius, at.y, at.z + Math.sin(a) * radius);
    });
    for (let i = 0; i < sides; i++) {
      const p = ring[i], q = ring[(i + 1) % sides], mid = p.clone().add(q).multiplyScalar(0.5);
      k.poly(material, [p, q, top], colour, mid.sub(at).setY(radius * radius / Math.max(0.01, height)));
    }
    k.poly(material, ring, colour, new Vector3(0, -1, 0));
  };
  /** A many-sided upright prism: a shaft, a drum. */
  const shaft = (at: Vector3, radius: number, height: number, sides: number, turn: number, material: string, colour: Colour) => {
    const ring = (y: number) => Array.from({ length: sides }, (_, i) => { const a = turn + (i / sides) * Math.PI * 2; return new Vector3(at.x + Math.cos(a) * radius, y, at.z + Math.sin(a) * radius); });
    const lo = ring(at.y), hi = ring(at.y + height);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      k.poly(material, [lo[i], lo[j], hi[j], hi[i]], colour, lo[i].clone().add(lo[j]).multiplyScalar(0.5).sub(at).setY(0));
    }
    k.poly(material, hi, colour, new Vector3(0, 1, 0));
    k.poly(material, lo, colour, new Vector3(0, -1, 0));
  };
  /** A disc set in a wall, its axis square to the wall: a pulley, a scroll's eye, a round window's frame. */
  const disc = (f: Face, s: number, y: number, r: number, t0: number, t1: number, material: string, colour: Colour, hole = 0) => {
    const ring = (rad: number) => Array.from({ length: 14 }, (_, i): Pt => [s + Math.cos((i / 14) * Math.PI * 2) * rad, y + Math.sin((i / 14) * Math.PI * 2) * rad]);
    prism(f, ring(r), hole ? [ring(hole).reverse()] : [], t0, t1, material, colour);
  };
  /** A wall seen from outside, along the line from one point to another in the building's measures (`u`, `v`), the inside to its left as one walks. */
  const faceFrom = (u0: number, v0: number, u1: number, v1: number): Face => {
    const L = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / L, dv = (v1 - v0) / L;
    return { L, P: (s, y, t) => k.at(u0 + du * s - dv * t, y, v0 + dv * s + du * t) };
  };
  return { ...k, prism, pyramid, shaft, disc, faceFrom };
}
export type BrickKit = ReturnType<typeof brickTools>;

/**
 * Glass in an opening of any head: what `glazed` does for a square one, with the head filled
 * with a pane of its own shape and a bar round its curve. `across` and `down` are the panes of
 * the square part. The light in it, after dark, is the room's, as `glazed` reckons it.
 */
export function glaze(k: BrickKit, f: Face, g: Hole, across: number, down: number, frame: Colour, deep: number) {
  const spring = g.y1 - riseOf(g.s1 - g.s0, g.head);
  k.glazed(f, { s0: g.s0, s1: g.s1, y0: g.y0, y1: spring }, across, down, frame, deep);
  if (g.head === 'flat') return;
  const room = f.P(Math.floor(g.s0 / 3.5) * 3.5, Math.floor(g.y0 / 2.6) * 2.6, 0), light = litRoom(Math.round(room.x), Math.round(room.y), Math.round(room.z));
  const pts = headPoints(g.s0, g.s1, spring, g.head);
  k.prism(f, [[g.s1, spring], ...pts, [g.s0, spring]], [], deep + 0.05, deep + 0.08, light ? 'window' : 'glass', light ?? PANE);
  const line = [[g.s1, spring] as Pt, ...pts, [g.s0, spring] as Pt];
  for (let i = 0; i < line.length - 1; i++) {
    const [a, c] = [line[i], line[i + 1]];
    // (Pulled in a little toward the middle of the head, so that the bar lies inside the opening.)
    const cx = (g.s0 + g.s1) / 2, inA: Pt = [a[0] + (cx - a[0]) * 0.04, a[1] - 0.035], inC: Pt = [c[0] + (cx - c[0]) * 0.04, c[1] - 0.035];
    k.stick(f.P(inA[0], inA[1], deep + 0.035), f.P(inC[0], inC[1], deep + 0.035), 0.07, 0.07, frame);
  }
  // A bar up the middle of the head, carrying on the one of the square part where there is one.
  if (across % 2 === 0) k.on(f, 'wood', (g.s0 + g.s1) / 2 - 0.022, (g.s0 + g.s1) / 2 + 0.022, spring, g.y1 - 0.05, deep + 0.01, deep + 0.06, frame, true);
}

/**
 * A closed door of two leaves of upright boards, filling an opening of any head, set `deep`
 * into the wall: each leaf is the half of the opening's figure on its side, a little short of
 * the middle, with two iron straps across it and a ring.
 */
function doorLeaves(k: BrickKit, f: Face, g: Hole, deep: number, paint: Colour) {
  const shape = shapeOf(g), mid = (g.s0 + g.s1) / 2;
  for (const side of [-1, 1] as const) {
    const half = clipAt(shape, mid + side * 0.006, side);
    k.prism(f, half, [], deep, deep + 0.07, 'wood', paint);
    // (Boards: grooves are cut as darker strips standing a little proud.)
    const a = side < 0 ? g.s0 : mid, c = side < 0 ? mid : g.s1, n = Math.max(2, Math.round((c - a) / 0.16));
    const spring = g.y1 - riseOf(g.s1 - g.s0, g.head), h = g.y1 - g.y0;
    for (let i = 1; i < n; i++) { const s = a + ((c - a) * i) / n; k.on(f, 'wood', s - 0.008, s + 0.008, g.y0 + 0.02, Math.min(spring + (g.head === 'flat' ? -0.02 : 0.1), g.y1 - 0.1), deep - 0.006, deep, shade(paint, 0.6), true); }
    for (const y of [g.y0 + Math.min(0.35, h * 0.16), Math.min(spring - 0.16, g.y0 + h * 0.68)]) k.on(f, 'metal', a + 0.04, c - 0.04, y, y + 0.06, deep - 0.02, deep, IRON);
    k.disc(f, mid + side * 0.16, g.y0 + Math.min(1.15, h * 0.48), 0.07, deep - 0.03, deep - 0.01, 'metal', IRON, 0.05);
  }
}

// ---------------------------------------------------------------------------------------------
// A front: an outline with openings through it and niches sunk in it.

interface FrontPlan {
  /** The figure of the whole front, anticlockwise. */
  outline: Pt[];
  /**
   * Openings through the wall, each with what fills it: glass, a door, a hatch, the dark of a
   * belfry behind louvres, a church window's tracery, or nothing. `orders` steps the jambs back
   * from the face in so many stages, as a Gothic portal's are.
   */
  openings: (Hole & { fill: 'window' | 'door' | 'hatch' | 'dark' | 'none' | 'tracery' | 'louvre'; across?: number; down?: number; orders?: number })[];
  /** Niches sunk into the face, and whether their backs are plastered white. */
  niches: (Hole & { white: boolean })[];
}

/**
 * Builds a front from its plan, in `material` and `colour`, `T` thick: the face with its niches
 * cut through it, the wall behind with only the openings, and white backs to the niches that
 * have them. Then fills the openings.
 */
function buildFront(k: BrickKit, f: Face, plan: FrontPlan, T: number, material: string, colour: Colour, o: { frame: Colour; paint: Colour; door?: Colour; dress?: Colour }) {
  const N = BRICK.niche, inNiche = (g: Hole) => plan.niches.some((n) => within(g, n)), most = Math.max(0, ...plan.openings.map((g) => g.orders ?? 0));
  // (An opening with orders is cut larger in each layer nearer the face, by a step each time; its springing stays where it was.)
  const grown = (g: FrontPlan['openings'][number], layer: number) => grow(g, Math.max(0, (g.orders ?? 0) - layer) * ORDER);
  if (plan.niches.length || most) {
    k.prism(f, plan.outline, [...plan.niches.map(shapeOf), ...plan.openings.filter((g) => !inNiche(g)).map((g) => shapeOf(grown(g, 0)))], 0, N, material, colour);
    for (let layer = 1; layer <= most; layer++) k.prism(f, plan.outline, plan.openings.map((g) => shapeOf(grown(g, layer))), N + (layer - 1) * ORDER_DEEP, N + layer * ORDER_DEEP, material, colour);
    k.prism(f, plan.outline, plan.openings.map(shapeOf), N + most * ORDER_DEEP, T, material, colour);
    for (const n of plan.niches) if (n.white) k.prism(f, shapeOf(n), plan.openings.filter((g) => within(g, n)).map(shapeOf), N - 0.014, N, 'plaster', WHITE);
  } else k.prism(f, plan.outline, plan.openings.map(shapeOf), 0, T, material, colour);
  for (const g of plan.openings) {
    const deep = g.fill === 'door' ? T - 0.16 : g.fill === 'tracery' ? Math.min(T * 0.55, N + (g.orders ?? 0) * ORDER_DEEP + 0.15) : Math.min(0.22, T - 0.12) + (inNiche(g) ? N : 0);
    if (g.fill === 'tracery') { tracery(k, f, g, deep, o.dress ?? WHITE); continue; }
    if (g.fill === 'louvre') { louvres(k, f, g, deep); continue; }
    if (g.fill === 'window') {
      glaze(k, f, g, g.across ?? 2, g.down ?? 3, o.frame, deep);
      // A sill of brick on edge, sloped off, standing a little out.
      k.on(f, material === 'plaster' ? 'plaster' : 'brick', g.s0 - 0.04, g.s1 + 0.04, g.y0 - 0.09, g.y0 + 0.005, (inNiche(g) ? N : 0) - 0.07, deep + 0.02, material === 'plaster' ? WHITE : shade(colour, 0.82));
    } else if (g.fill === 'door') doorLeaves(k, f, g, deep, o.door ?? o.paint);
    else if (g.fill === 'hatch') doorLeaves(k, f, g, deep, o.paint);
    else if (g.fill === 'dark') k.prism(f, shapeOf(g), [], deep + 0.3, deep + 0.34, 'wood', [0.02, 0.02, 0.02]);
  }
}

/** Leaves out of a front the windows that would look into something standing close before it (what the document's `near` says); a niche stays, blind. */
function shutWindows(b: Building, k: BrickKit, f: Face, plan: FrontPlan) {
  plan.openings = plan.openings.filter((g) => {
    if (g.fill !== 'window') return true;
    const c = (g.s0 + g.s1) / 2, p = k.local(f.P(c, 0, 0)), q = k.local(f.P(c, 0, -1));
    return !blinded(b, p.u, p.v, q.u - p.u, q.v - p.v, g.y0, (g.s1 - g.s0) / 2);
  });
}

/** How far each order of a portal steps back from the one outside it, across the face, and into the wall. */
const ORDER = 0.17, ORDER_DEEP = 0.15;

/** An opening made broader by `by` at each side, springing where it did: what an order outside it is cut to. */
function grow<G extends Hole>(g: G, by: number): G {
  if (!by) return g;
  const spring = g.y1 - riseOf(g.s1 - g.s0, g.head);
  return { ...g, s0: g.s0 - by, s1: g.s1 + by, y1: spring + riseOf(g.s1 - g.s0 + 2 * by, g.head) + (g.head === 'flat' ? by : 0) };
}

/**
 * The tracery of a church window: mullions of stone dividing it into two or three lights, each
 * light ending in a pointed arch of its own at the springing of the whole, and in the head over
 * them a ring; iron bars across, and leaded glass behind, a little green.
 */
function tracery(k: BrickKit, f: Face, g: Hole, deep: number, dress: Colour) {
  const w = g.s1 - g.s0, lights = w > 2.3 ? 3 : 2, bar = 0.14, spring = g.y1 - riseOf(w, g.head), lw = (w - bar * (lights - 1)) / lights, mid = (g.s0 + g.s1) / 2;
  const room = f.P(Math.floor(g.s0 / 4) * 4, 3, 0), light = litRoom(Math.round(room.x), Math.round(room.y), Math.round(room.z), 0.25);
  k.prism(f, shapeOf(g), [], deep + 0.07, deep + 0.1, light ? 'window' : 'glass', light ? shade(light, 0.7) : [0.05, 0.07, 0.07]);
  for (let i = 1; i < lights; i++) {
    const s = g.s0 + i * (lw + bar) - bar / 2;
    k.on(f, 'stone', s - bar / 2, s + bar / 2, g.y0, spring + 0.02, deep - 0.05, deep + 0.12, dress);
  }
  const riseL = riseOf(lw + bar, 'pointed');
  for (let i = 0; i < lights; i++) {
    const a = g.s0 + i * (lw + bar) - (i ? bar / 2 : 0), c = a + lw + (i ? bar / 2 : 0) + (i < lights - 1 ? bar / 2 : 0);
    const line = [[c, spring] as Pt, ...headPoints(a, c, spring, 'pointed', 6), [a, spring] as Pt];
    for (let q = 0; q < line.length - 1; q++) k.stick(f.P(line[q][0], line[q][1], deep + 0.035), f.P(line[q + 1][0], line[q + 1][1], deep + 0.035), 0.17, 0.1, dress, 'stone');
  }
  // The ring in the head, as large as the space over the lights allows.
  const free = g.y1 - (spring + riseL), r = Math.min(w * 0.24, free / 2 - 0.12);
  if (r > 0.18) k.disc(f, mid, spring + riseL + free * 0.45, r, deep - 0.05, deep + 0.12, 'stone', dress, r - 0.1);
  for (let y = g.y0 + 0.62; y < spring - 0.2; y += 0.62) k.on(f, 'metal', g.s0 + 0.02, g.s1 - 0.02, y - 0.012, y + 0.012, deep + 0.03, deep + 0.06, IRON);
  k.on(f, 'stone', g.s0 - 0.05, g.s1 + 0.05, g.y0 - 0.12, g.y0 + 0.02, -0.02, deep + 0.12, dress);
}

/** A belfry's opening: dark within, and boards set across it to keep the weather off the bells and let their sound out. */
function louvres(k: BrickKit, f: Face, g: Hole, deep: number) {
  const spring = g.y1 - riseOf(g.s1 - g.s0, g.head);
  k.prism(f, shapeOf(g), [], deep + 0.35, deep + 0.39, 'wood', [0.015, 0.014, 0.012]);
  for (let y = g.y0 + 0.12; y < spring; y += 0.24) {
    k.stick(f.P(g.s0 + 0.01, y + 0.1, deep), f.P(g.s1 - 0.01, y + 0.1, deep), 0.03, 0.04, shade(OAK, 0.8));
    k.on(f, 'wood', g.s0 + 0.01, g.s1 - 0.01, y, y + 0.03, deep - 0.06, deep + 0.18, shade(OAK, 0.75), true);
  }
}

/** Where a horizontal band across a front may run, between `y0` and `y1`: from `s0` to `s1`, broken wherever an opening or a niche crosses it. */
function bandSpans(plan: FrontPlan, s0: number, s1: number, y0: number, y1: number): [number, number][] {
  const cuts = [...plan.openings.map((g) => grow(g, ('orders' in g ? g.orders ?? 0 : 0) * ORDER)), ...plan.niches].filter((g) => g.y1 > y0 - 0.02 && g.y0 < y1 + 0.02).map((g): [number, number] => [g.s0 - 0.03, g.s1 + 0.03]).sort((a, c) => a[0] - c[0]);
  const out: [number, number][] = [];
  let s = s0;
  for (const [a, c] of cuts) { if (a > s + 0.05) out.push([s, Math.min(a, s1)]); s = Math.max(s, c); }
  if (s1 > s + 0.05) out.push([s, s1]);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Gables.

/**
 * The gable of a front `W` broad over walls `E` high, under a roof of slope `tan`: its outline
 * from the left eaves over to the right (as points left to right; the eaves points themselves are
 * left out where the side runs straight on up), its niches and openings, and what stands on it
 * (copings, pinnacles), to be built after the front. `roofAt(s)` is how high the roof stands at
 * a point across the front; every point of the outline stands above it.
 */
function gableOf(k: BrickKit, b: Building, f: Face, W: number, E: number, tan: number, T: number, rng: Rng, o: { material: string; colour: Colour; trim: [string, Colour]; hoist: boolean }) {
  const bw = b.brickwork!, n = bw.steps, ridge = E + (W / 2) * tan, roofAt = (s: number) => E + Math.min(s, W - s) * tan;
  const top: Pt[] = [], niches: FrontPlan['niches'] = [], openings: FrontPlan['openings'] = [], after: (() => void)[] = [];
  const white = bw.niches === 'white', sunk = bw.niches !== 'none';
  const coping: Colour = bw.rendered ? WHITE : shade(o.colour, 0.85), copeMat = bw.rendered ? 'plaster' : o.material;
  // The lofts in the roof have floors about every two and a half metres: windows and hatches are set on them.
  const lofts = (from: number, to: number) => { const out: number[] = []; for (let y = E + 0.75; y < to; y += 2.4) if (y > from - 0.01) out.push(y); return out; };
  /** A window or hatch in the gable at a loft's floor, in a column from `a` to `c` whose top is at `ceiling`. The middle one may be the hatch the hoist serves. */
  const loftOpenings = (a: number, c: number, from: number, ceiling: number, middle: boolean) => {
    const mid = (a + c) / 2, levels = lofts(from, ceiling).filter((y) => y + 0.85 < ceiling - 0.05);
    levels.forEach((y, i) => {
      // (The highest loft that has room for it, in the middle, has the hatch the hoist serves.)
      const hatch = middle && o.hoist && i === levels.length - 1 && y + 1.25 < ceiling - 0.05 && c - a - 0.24 >= 0.7, h = hatch ? 1.25 : 0.85;
      const w = Math.min(hatch ? 0.9 : 0.62, c - a - 0.24);
      if (w < 0.32) return;
      openings.push({ s0: mid - w / 2, s1: mid + w / 2, y0: y, y1: y + h, head: hatch ? 'flat' : sunk ? 'segment' : 'flat', fill: hatch ? 'hatch' : 'window', across: 2, down: 2 });
    });
  };
  if (bw.gable === 'stepped') {
    // Steps all the same breadth, the middle one the crown. Each step's top stands clear of the roof where its inner end meets it.
    const a = W / (2 * n + 1), y = (j: number) => j >= n ? Math.max(ridge + 0.55, E + n * a * tan + 0.75) : E + (j + 1) * a * tan + 0.3;
    for (let j = 0; j <= 2 * n; j++) {
      const lev = Math.min(j, 2 * n - j);
      top.push([j * a, y(lev)], [(j + 1) * a, y(lev)]);
      // A niche in every step, up to just under its top; or, without niches, windows in every other.
      const m = Math.min(0.26, Math.max(0.13, a * 0.17)), s0 = j * a + m, s1 = (j + 1) * a - m, ceiling = y(lev) - 0.3;
      if (sunk && ceiling - (E + 0.42) > riseOf(s1 - s0, 'pointed') + 0.6) {
        niches.push({ s0, s1, y0: E + 0.42, y1: ceiling, head: 'pointed', white });
        loftOpenings(s0, s1, E + 0.6, ceiling - riseOf(s1 - s0, 'pointed') - 0.1, lev === n);
      } else if (!sunk && (j - n) % 2 === 0) loftOpenings(j * a, (j + 1) * a, E + 0.6, y(lev) - 0.45, lev === n);
      // The top of each step: a coping, and on it a little ridged cap; at the outer end of each step now and then a pinnacle.
      const s = j * a, e = (j + 1) * a, yt = y(lev);
      after.push(() => {
        k.on(f, copeMat, s - 0.05, e + 0.05, yt, yt + 0.09, -0.06, T + 0.06, coping);
        const into = f.P(0, 0, T + 0.12).sub(f.P(0, 0, 0));
        k.wedge(f.P(s - 0.05, yt + 0.09, -0.06), f.P(e + 0.05, yt + 0.09, -0.06), f.P((s + e) / 2, yt + 0.09 + Math.min(0.32, (e - s) * 0.3), -0.06), into, [copeMat, coping], [copeMat, coping]);
      });
    }
    // (Each step's outer side is where the outline turns up: the points along the top run left to right, and are joined by risers.)
  } else if (bw.gable === 'piers') {
    // Piers stand in front of the face from the first floor up, through the gable and above it, each ending in a pinnacle.
    const P = 2 * n + 1, pw = PIER, at = (j: number) => pierAt(W, P, j);
    const tops = Array.from({ length: P }, (_, j) => roofAt(at(j)) + 0.35);
    // The wall between two piers ends in a little gable of its own.
    for (let j = 0; j < P - 1; j++) {
      const sa = at(j), sc = at(j + 1), apex = Math.max(tops[j], tops[j + 1]) + 0.55;
      if (j === 0) top.push([0, tops[0]], [sa, tops[0]]);
      top.push([(sa + sc) / 2, apex], [sc, tops[j + 1]]);
      if (j === P - 2) top.push([W, tops[P - 1]]);
      const s0 = sa + pw / 2 + 0.13, s1 = sc - pw / 2 - 0.13, ceiling = Math.min(tops[j], tops[j + 1]) - 0.15;
      if (s1 - s0 > 0.3 && sunk && ceiling - (E + 0.42) > riseOf(s1 - s0, 'pointed') + 0.5) {
        niches.push({ s0, s1, y0: E + 0.42, y1: ceiling, head: 'pointed', white });
        loftOpenings(s0, s1, E + 0.6, ceiling - riseOf(s1 - s0, 'pointed') - 0.1, j === n - 1 || j === n);
      } else if (s1 - s0 > 0.3) loftOpenings(s0, s1, E + 0.6, ceiling - 0.2, false);
    }
    after.push(() => {
      const foot = brickFloor(b, 1) - 0.1;
      for (let j = 0; j < P; j++) {
        const s = at(j), crest = tops[j] + 1.0;
        // (Through the wall's thickness and a little behind it, so that above the wall it is a pier seen all round.)
        k.on(f, o.material, s - pw / 2, s + pw / 2, foot, crest, -0.24, T + 0.02, o.colour);
        // The pinnacle: a band, a shaft with its sides square to the wall, and a steep cap with a knob.
        const c = f.P(s, crest, (T - 0.22) / 2);
        k.on(f, copeMat, s - pw / 2 - 0.05, s + pw / 2 + 0.05, crest, crest + 0.1, -0.29, T + 0.07, coping);
        k.shaft(above(c, 0.1), 0.3, 0.75, 4, Math.PI / 4 + rot(f), o.material, o.colour);
        k.on(f, copeMat, s - pw / 2 - 0.02, s + pw / 2 + 0.02, crest + 0.85, crest + 0.93, -0.26, T + 0.04, coping);
        k.pyramid(above(c, 0.93), 0.36, 1.05, 4, Math.PI / 4 + rot(f), copeMat, coping);
        k.shaft(above(c, 1.98), 0.06, 0.14, 6, 0, 'stone', [0.6, 0.58, 0.52]);
      }
    });
  } else if (bw.gable === 'volute') {
    // Tiers that narrow upward, each ending in a cornice; at each side a scroll from the tier's foot up into its body; over the last, a curved cap.
    const m = 0.35, c = 0.75 * tan, crown = ridge + m - c, ys = Array.from({ length: n + 1 }, (_, i) => E + ((crown - E) * i) / n);
    const half = (y: number) => Math.max(0.72, W / 2 - (y - m - E) / tan), xs = ys.slice(1).map(half);
    const right: Pt[] = [];
    let outer = W / 2;
    for (let i = 0; i < n; i++) {
      const yb = ys[i], yt = ys[i + 1], x = xs[i];
      // The scroll's line: from its eye at the outer foot up to the body's side, swelling out and then in.
      for (let q = 0; q <= 10; q++) {
        const t = q / 10, xq = outer + (x - outer) * t, yq = yb + 0.2 + (yt - 0.05 - yb - 0.2) * t + 0.28 * Math.sin(2 * Math.PI * t) * Math.min(1, (yt - yb) / 2.4);
        right.push([W / 2 + xq, Math.max(yq, roofAt(W / 2 + xq) + 0.2)]);
      }
      right.push([W / 2 + x, yt]);
      outer = x;
      // Windows in the tier's body, clear of its pilasters: three, two or one as it narrows.
      const count = x > 2.1 ? 3 : x > 1.15 ? 2 : 1, wwin = 0.72, spread = count === 3 ? 0.6 : 0.45, h = Math.min(1.3, yt - 0.35 - (yb + 0.45));
      if (h >= 0.6) for (let w = 0; w < count; w++) {
        const s = W / 2 + (count === 1 ? 0 : -x * spread + (w * x * spread * 2) / (count - 1));
        openings.push({ s0: s - wwin / 2, s1: s + wwin / 2, y0: yb + 0.45, y1: yb + 0.45 + h, head: 'flat', fill: i === n - 1 && o.hoist && w === (count - 1) / 2 ? 'hatch' : 'window', across: 2, down: 2 });
      }
      // What is moulded: the tier's cornice, a pilaster strip at each side of its body, its scrolls' eyes, and an obelisk at each end of the cornice.
      after.push(() => {
        const [mat, col] = o.trim;
        k.on(f, mat, W / 2 - x - 0.14, W / 2 + x + 0.14, yt - 0.05, yt + 0.16, -0.16, T * 0.7, col);
        k.on(f, mat, W / 2 - x - 0.06, W / 2 + x + 0.06, yt - 0.13, yt - 0.05, -0.08, T * 0.7, col);
        for (const side of [-1, 1]) {
          k.on(f, mat, W / 2 + side * (x - 0.13) - 0.12, W / 2 + side * (x - 0.13) + 0.12, yb + 0.1, yt - 0.13, -0.05, 0.05, col);
          k.disc(f, W / 2 + side * (ys[i] === E ? W / 2 - 0.28 : xs[i - 1] - 0.22), yb + 0.36, 0.2, -0.1, T * 0.7, mat, col, 0);
          if (i < n - 1) {
            const p = f.P(W / 2 + side * (x + 0.02), yt + 0.16, T * 0.3);
            k.shaft(p, 0.11, 0.18, 4, Math.PI / 4 + rot(f), mat, col);
            k.pyramid(p.clone().setY(p.y + 0.18), 0.09, 0.5, 4, Math.PI / 4 + rot(f), mat, col);
          }
        }
      });
    }
    // The cap over the last tier: a curve (a parabola, which stands everywhere over the roof's ridge if its crown does), with a round window and a knob on top.
    const capW = xs[n - 1] + 0.14, capH = c - m + 0.35, cap = (t: number): Pt => [W / 2 + capW * t, crown + capH * (1 - t * t)];
    for (let q = 0; q < 12; q++) right.push(cap(1 - q / 12));
    const left = right.map(([s, y]): Pt => [W - s, y]).reverse();
    top.push(...left, [W / 2, crown + capH], ...right.reverse());
    if (capH > 0.95) openings.push({ s0: W / 2 - 0.22, s1: W / 2 + 0.22, y0: crown + 0.2, y1: crown + 0.64, head: 'round', fill: 'window', across: 2, down: 1 });
    after.push(() => {
      const [mat, col] = o.trim;
      // (The cap's moulded edge, as short lengths round its curve.)
      for (let q = 0; q < 12; q++) {
        const [a0, a1] = [cap(1 - q / 6), cap(1 - (q + 1) / 6)];
        k.stick(f.P(a0[0], a0[1] + 0.03, T * 0.3), f.P(a1[0], a1[1] + 0.03, T * 0.3), T * 0.7 + 0.2, 0.14, col, mat);
      }
      const p = f.P(W / 2, crown + capH + 0.05, T * 0.3);
      k.shaft(p, 0.06, 0.25, 6, 0, mat, col);
      k.pyramid(p.clone().setY(p.y + 0.25), 0.16, 0.4, 8, 0, mat, col);
    });
  } else {
    // A plain gable, a coping along its two sides, and windows in rows that grow shorter as it narrows.
    const apex = ridge + 0.3;
    top.push([W / 2, apex]);
    for (const y0 of lofts(E + 0.6, apex - 1.4)) {
      const room = W / 2 - (y0 + 1.25 - E - 0.3) / tan - 0.5, count = room >= 2.2 ? 3 : room >= 1.0 ? 2 : 1, spread = count === 3 ? 0.6 : 0.5;
      if (room < 0.45) continue;
      const hatchHere = o.hoist && y0 + 2.4 > apex - 1.4;
      for (let w = 0; w < count; w++) {
        const s = W / 2 + (count === 1 ? 0 : -room * spread + (w * room * spread * 2) / (count - 1)), mid = count === 1 || w === (count - 1) / 2, hatch = hatchHere && mid, wd = hatch ? 0.85 : 0.6;
        openings.push({ s0: s - wd / 2, s1: s + wd / 2, y0, y1: y0 + (hatch ? 1.2 : 0.9), head: hatch ? 'flat' : 'segment', fill: hatch ? 'hatch' : 'window', across: 2, down: 2 });
      }
    }
    after.push(() => {
      for (const side of [-1, 1]) k.stick(f.P(W / 2 + side * (W / 2 + 0.08), E + 0.08, T / 2), f.P(W / 2, apex + 0.1, T / 2), T + 0.12, 0.18, coping, copeMat);
    });
  }
  return { top, niches, openings, after, roofAt, ridge };
}

/** A point the given height above another. (Heights given to a point already in the world are counted from it, never from the building's ground.) */
const above = (p: Vector3, dy: number) => p.clone().setY(p.y + dy);

/** The bearing a wall faces, for turning what stands on it to suit. */
function rot(f: Face): number {
  const a = f.P(0, 0, 0), c = f.P(1, 0, 0);
  return Math.atan2(c.z - a.z, c.x - a.x);
}

// ---------------------------------------------------------------------------------------------
// The street houses.

/**
 * A merchant's house or a warehouse, its gable to the street. The ground storey is the hall, as
 * tall as a storey and a half, with the broad door and a window or two; the storeys over it have
 * their windows in columns, standing in tall niches where the front has them; then the gable,
 * with the lofts' windows and, at the top, the hatch for the hoist. Its side walls are plain brick,
 * as walls are that stand against a neighbour's; its back is plainer than its front.
 */
function streetHouse(b: Building, k: BrickKit, rng: Rng, stone: Colour): void {
  const bw = b.brickwork!, W = b.w, D = b.d, T = BRICK.front, S = BRICK.wall, PL = BRICK.plinth, N = b.storeys, E = brickEaves(b), store = bw.kind === 'store';
  const tan = Math.tan((bw.pitch * Math.PI) / 180), brick = bw.tone, rendered = bw.rendered;
  const material = rendered ? 'plaster' : 'brick', colour = rendered ? b.colour : brick;
  const trim: [string, Colour] = rendered ? ['plaster', WHITE] : ['stone', mul(stone, [1.15, 1.05, 0.88])];
  const paint = rng.pick(DOORS), granite = shade(stone, 0.6), glazedTone = mul(brick, GLAZED);
  const [front, right, back, left] = k.walls(0);
  const H0 = b.heights[0], floor = (s: number) => brickFloor(b, s);

  // ---- the front below the gable
  const plan: FrontPlan = { outline: [], openings: [], niches: [] };
  // Columns of windows: between the piers where there are piers; otherwise evenly across.
  const piers = bw.gable === 'piers', cols = brickColumns(b);
  const sunk = bw.niches !== 'none' && (bw.gable === 'stepped' || piers || store);
  const headUp: Head = rendered ? 'flat' : 'segment';
  // A warehouse's middle column is its loading doors, one to a storey, and the windows beside them are small.
  const middle = store ? cols.length >> 1 : -1;
  for (const [j, col] of cols.entries()) {
    const ww = j === middle ? Math.min(1.05, col.room - 0.36) : Math.min(store ? 0.75 : 1.2, col.room - (sunk ? 0.5 : 0.4));
    if (ww < 0.4) continue;
    const nw = ww + 0.34, nicheTop = E - 0.32;
    if (sunk && N > 1) plan.niches.push({ s0: col.c - nw / 2, s1: col.c + nw / 2, y0: floor(1) + 0.2, y1: nicheTop, head: piers || !store ? 'pointed' : 'segment', white: bw.niches === 'white' && j !== middle });
    const ceiling = sunk ? nicheTop - riseOf(nw, store && !piers ? 'segment' : 'pointed') - 0.12 : E - 0.3;
    for (let s = 1; s < N; s++) {
      const y0 = floor(s) + (j === middle ? 0.15 : store ? 0.9 : 0.78), y1 = Math.min(floor(s + 1) - (store ? 0.45 : 0.42), ceiling);
      if (y1 - y0 < 0.6) continue;
      plan.openings.push({ s0: col.c - ww / 2, s1: col.c + ww / 2, y0, y1, head: j === middle ? 'flat' : headUp, fill: j === middle ? 'hatch' : 'window', across: 2, down: store ? 2 : 3 });
    }
  }
  // The ground storey: the door, in its portal, and windows where there is room beside it.
  const { s0: ds0, s1: ds1 } = brickDoor(b), dw = ds1 - ds0, dc = (ds0 + ds1) / 2;
  const doorHead: Head = store ? 'round' : rendered ? 'round' : rng.pick(['pointed', 'pointed', 'round', 'segment'] as Head[]);
  const door: Hole = { s0: dc - dw / 2, s1: dc + dw / 2, y0: PL, y1: PL + Math.min(store ? 3.0 : 3.4, H0 - 0.55), head: doorHead };
  // (A house that can be entered stands with its door open: its leaves are built below, swung in.)
  plan.openings.push({ ...door, fill: b.plan ? 'none' : 'door' });
  if (!rendered) plan.niches.push({ s0: door.s0 - 0.24, s1: door.s1 + 0.24, y0: PL - 0.02, y1: door.y1 + 0.24 + (riseOf(dw + 0.48, doorHead) - riseOf(dw, doorHead)), head: doorHead, white: false });
  for (const [s0, s1] of brickGroundWindows(b)) plan.openings.push({ s0, s1, y0: PL + 1.0, y1: PL + H0 - 0.65, head: headUp, fill: 'window', across: 2, down: 4 });
  // ---- the gable, and the whole outline
  const g = gableOf(k, b, front, W, E, tan, T, rng, { material, colour, trim, hoist: true });
  plan.niches.push(...g.niches);
  plan.openings.push(...g.openings);
  const top = g.top.filter(([s]) => s > -1e-6 && s < W + 1e-6);
  plan.outline = [[0, -0.45], [W, -0.45], ...(top[top.length - 1][0] < W - 1e-6 ? [[W, E] as Pt] : []), ...[...top].reverse(), ...(top[0][0] > 1e-6 ? [[0, E] as Pt] : [])];
  shutWindows(b, k, front, plan);
  buildFront(k, front, plan, T, material, colour, { frame: FRAME, paint, door: paint });
  g.after.forEach((f) => f());
  if (b.plan) openLeaves(k, front, door.s0, door.s1, door.y0, door.y1 - riseOf(dw, door.head), T - 0.16, paint, true);

  // ---- what is laid on the front
  // The plinth of granite, broken at the door, and a step before it.
  for (const [a, c] of [[-0.04, door.s0 - 0.24], [door.s1 + 0.24, W + 0.04]]) if (c > a) k.on(front, 'stone', a, c, -0.45, PL, -0.07, 0.05, granite);
  k.on(front, 'stone', door.s0 - 0.3, door.s1 + 0.3, -0.45, PL - 0.02, -0.5, T - 0.1, shade(granite, 1.1));
  // Bands: at each floor, and a deeper one at the foot of the gable, where the front changes from house to roof.
  const bandAt = (y0: number, y1: number, out: number, mat: string, col: Colour) => { for (const [a, c] of bandSpans(plan, -0.02, W + 0.02, y0, y1)) k.on(front, mat, a, c, y0, y1, -out, 0.04, col); };
  for (let s = 1; s < N; s++) {
    if (rendered) bandAt(floor(s) - 0.12, floor(s) + 0.06, 0.06, 'plaster', WHITE);
    else if (bw.glazed) bandAt(floor(s) - 0.14, floor(s) + 0.04, 0.025, 'brick', glazedTone);
  }
  if (rendered) {
    bandAt(E - 0.02, E + 0.2, 0.16, 'plaster', WHITE);
    bandAt(E - 0.16, E - 0.02, 0.07, 'plaster', WHITE);
  } else {
    // (A frieze of bricks set corner-on under a course that stands out: the sawtooth of the brick towns.)
    bandAt(E + 0.1, E + 0.22, 0.08, 'brick', bw.glazed ? glazedTone : shade(brick, 0.92));
    for (const [a, c] of bandSpans(plan, 0.05, W - 0.05, E - 0.08, E + 0.1)) {
      for (let s = a + 0.08; s < c - 0.08; s += 0.16) {
        const into = front.P(0, 0, 0.1).sub(front.P(0, 0, 0));
        k.wedge(front.P(s - 0.07, E + 0.1, -0.06), front.P(s + 0.07, E + 0.1, -0.06), front.P(s, E - 0.06, -0.06), into, ['brick', shade(brick, 0.9)], ['brick', shade(brick, 0.9)]);
      }
    }
  }
  // Windows on a rendered front have white surrounds; on brick, an arch of bricks on end over each.
  for (const o of plan.openings) {
    if (o.fill !== 'window' || o.y0 > E) continue;
    const inN = plan.niches.some((n) => within(o, n));
    if (rendered) {
      for (const [a, c] of [[o.s0 - 0.13, o.s0], [o.s1, o.s1 + 0.13]]) k.on(front, 'plaster', a, c, o.y0 - 0.02, o.y1 + 0.13, -0.04, 0.03, WHITE);
      k.on(front, 'plaster', o.s0 - 0.13, o.s1 + 0.13, o.y1, o.y1 + 0.13, -0.04, 0.03, WHITE);
    } else if (!inN && o.head === 'segment') {
      // (A band of even depth over the window's own arch: the bricks of a relieving arch, standing on end.)
      const spring = o.y1 - riseOf(o.s1 - o.s0, 'segment'), lower = headPoints(o.s0 - 0.1, o.s1 + 0.1, spring, 'segment');
      const upper = lower.map(([s, y]): Pt => [s, y + 0.24]).reverse();
      k.prism(front, [[o.s1 + 0.1, spring], ...lower, [o.s0 - 0.1, spring], [o.s0 - 0.1, spring + 0.24], ...upper, [o.s1 + 0.1, spring + 0.24]], [], -0.025, 0.05, 'brick', shade(brick, 1.08));
    }
  }
  // Iron anchors at the floors, holding the front to the beams behind it.
  for (let s = 1; s <= N; s++) for (const a of [0.3, W - 0.3]) {
    const y = s === N ? E - 0.5 : floor(s) + 0.05;
    k.on(front, 'metal', a - 0.025, a + 0.025, y - 0.28, y + 0.28, -0.04, 0.01, IRON);
    k.on(front, 'metal', a - 0.12, a + 0.12, y - 0.025, y + 0.025, -0.05, -0.035, IRON);
  }

  // ---- the hoist: a beam out from over the top hatch, with a wheel and a rope; on a warehouse, a housing of boards round the winch.
  const hatch = plan.openings.filter((o) => o.fill === 'hatch').sort((p, q) => q.y1 - p.y1)[0];
  if (hatch) {
    const s = (hatch.s0 + hatch.s1) / 2, y = hatch.y1 + 0.32;
    if (store && g.ridge - y > 1.4) {
      // (The housing stands out from the gable over the hatch: a box of boards with a little roof of its own.)
      const hw = 0.85, out = 1.05, h = 1.5;
      k.on(front, 'wood', s - hw, s + hw, y - 0.1, y + h, -out, 0, shade(OAK, 1.3), true);
      k.on(front, 'wood', s - hw - 0.04, s + hw + 0.04, y - 0.18, y - 0.1, -out - 0.04, 0, shade(OAK, 0.9), true);
      const into = front.P(0, 0, out + 0.3).sub(front.P(0, 0, 0));
      k.wedge(front.P(s - hw - 0.12, y + h, -out - 0.15), front.P(s + hw + 0.12, y + h, -out - 0.15), front.P(s, y + h + 0.9, -out - 0.15), into, ['tile', [1.1, 1.0, 0.95]], ['wood', shade(OAK, 1.2)], ['wood', shade(OAK, 0.8)]);
      // (The rope hangs to above a head's height: the door is under it.)
      k.stick(front.P(s, y - 0.12, -out + 0.15), front.P(s, PL + 2.6, -out + 0.15 + 0.001), 0.025, 0.025, [0.45, 0.4, 0.3]);
    } else {
      k.stick(front.P(s, y, T * 0.5), front.P(s, y + 0.001, -1.0), 0.17, 0.2, OAK);
      k.disc(front, s, y - 0.2, 0.17, -0.97, -0.91, 'wood', shade(OAK, 1.2), 0.04);
      k.stick(front.P(s + 0.17, y - 0.2, -0.94), front.P(s + 0.17, Math.max(PL + 2.6, y - 3.2), -0.94 + 0.001), 0.022, 0.022, [0.45, 0.4, 0.3]);
    }
  }

  // ---- the side walls, plain brick; and the back
  for (const f of [right, left]) {
    k.on(f, 'brick', T - 0.01, D - S + 0.01, -0.45, E, 0, S, brick);
    for (let s = 1; s < N; s++) for (const a of [D * 0.3, D * 0.7]) k.on(f, 'metal', a - 0.025, a + 0.025, floor(s) - 0.25, floor(s) + 0.3, -0.04, 0.01, IRON);
  }
  {
    const gaps: { s0: number; s1: number; y0: number; y1: number }[] = [];
    const sh = brickShell(b);
    for (let s = 0; s < N; s++) for (const [u0, u1] of brickBackWindows(b, s)) gaps.push({ s0: W / 2 - u1, s1: W / 2 - u0, y0: floor(s) + (s ? 0.85 : PL + 1.0), y1: floor(s + 1) - 0.5 });
    // (A figure with its windows cut through it: `pierced` takes one row of openings, and these are a row to a storey.)
    k.prism(back, [[0, -0.45], [W, -0.45], [W, E], [0, E]], gaps.map((g) => shapeOf({ ...g, head: 'flat' })), 0, S, 'brick', brick);
    for (const gp of gaps) { k.glazed(back, gp, 2, 2, FRAME, 0.18); k.on(back, 'brick', gp.s0 - 0.04, gp.s1 + 0.04, gp.y0 - 0.08, gp.y0, -0.06, 0.2, shade(brick, 0.85)); }
    // ---- inside, if it can be entered: the hall laid with flags of stone, as it was for carts
    if (b.plan) buildInterior(k, b.plan, sh, N, { W, front: plan.openings.map(shapeOf), back: gaps.map((g) => shapeOf({ ...g, head: 'flat' })), ground: 'flags' });
    const into = back.P(0, 0, S).sub(back.P(0, 0, 0));
    // (Its sloping edges lie just inside the roof's thickness, so that the roof covers them.)
    k.wedge(back.P(0, E, 0), back.P(W, E, 0), back.P(W / 2, g.ridge - 0.1, 0), into, ['brick', brick], ['brick', brick]);
    k.glazed(back, { s0: W / 2 - 0.35, s1: W / 2 + 0.35, y0: E + 0.8, y1: E + 1.7 }, 2, 2, FRAME, -0.03);
  }

  // ---- the roof: two slopes from the side walls to the ridge, from behind the front gable to just past the back.
  const roofCol = roofOf(bw.roof);
  const ov = 0.14, v0 = T - 0.02, v1 = D + 0.28, low = E - ov * tan;
  for (const side of [-1, 1]) k.slope([k.at(side * (W / 2 + ov), low, v0), k.at(side * (W / 2 + ov), low, v1), k.at(0, g.ridge, v1), k.at(0, g.ridge, v0)], roofCol, shade(OAK, 0.8));
  k.box(roofCol[0], -0.13, 0.13, g.ridge - 0.06, g.ridge + 0.08, v0, v1, shade(roofCol[1], 0.85));
  // A chimney of brick through the ridge, toward the back.
  {
    const v = D * rng.range(0.55, 0.75), u = rng.range(-0.3, 0.3);
    k.box('brick', u - 0.32, u + 0.32, g.ridge - 1.4, g.ridge + 1.0, v - 0.42, v + 0.42, shade(brick, 0.95));
    k.box('brick', u - 0.4, u + 0.4, g.ridge + 1.0, g.ridge + 1.12, v - 0.5, v + 0.5, shade(brick, 0.8));
  }
}

/**
 * A house with its eaves to the street, of the century after the gabled ones: broader, its front
 * rendered and washed, its windows in even rows in white surrounds, a white band over the ground
 * storey and a cornice under the eaves, a strip at each corner. Over its middle bays a small gable
 * of its own rises through the roof (a wall dormer), of the front's own plane, with a storey of
 * windows and a gable of any of the outlines the gabled houses have; it has a roof of its own,
 * ridged back into the great one. The door is in the middle, in a surround with a cornice over it
 * and a light above the leaves. The ends are gables of plain brick.
 */
function eavesHouse(b: Building, k: BrickKit, rng: Rng, stone: Colour): void {
  const bw = b.brickwork!, W = b.w, D = b.d, T = BRICK.front, S = BRICK.wall, PL = BRICK.plinth, N = b.storeys, E = brickEaves(b), H0 = b.heights[0];
  const tan = Math.tan((bw.pitch * Math.PI) / 180), brick = bw.tone, rendered = bw.rendered, floor = (s: number) => brickFloor(b, s);
  const material = rendered ? 'plaster' : 'brick', colour = rendered ? b.colour : brick, trim: [string, Colour] = rendered ? ['plaster', WHITE] : ['stone', mul(stone, [1.15, 1.05, 0.88])];
  const paint = rng.pick(DOORS), granite = shade(stone, 0.6);
  const [front, right, back, left] = k.walls(0);
  const margin = 0.65, pitch = (W - 2 * margin) / b.bays, centre = (j: number) => margin + (j + 0.5) * pitch, ww = Math.min(1.15, pitch - 0.9);
  const doorBay = b.bays >> 1, dc = centre(doorBay), head: Head = rendered ? 'flat' : 'segment';
  const plan: FrontPlan = { outline: [], openings: [], niches: [] };
  for (let s = 0; s < N; s++) for (let j = 0; j < b.bays; j++) {
    if (s === 0 && j === doorBay) continue;
    const y0 = s === 0 ? PL + 0.95 : floor(s) + 0.72, y1 = s === 0 ? floor(1) - 0.6 : floor(s + 1) - 0.5;
    plan.openings.push({ s0: centre(j) - ww / 2, s1: centre(j) + ww / 2, y0, y1, head, fill: 'window', across: 2, down: s === 0 ? 4 : 3 });
  }
  // The door: its leaves, and a light over them in the same opening.
  const dw = 1.5, door: Hole = { s0: dc - dw / 2, s1: dc + dw / 2, y0: PL, y1: PL + Math.min(3.25, H0 - 0.5), head: 'flat' };
  plan.openings.push({ ...door, fill: 'none' });

  // The wall dormer: over the middle one, two or three bays, as broad as lets its roof run in under the great roof's ridge.
  const ridge = E + (D / 2) * tan, hd = Math.min(2.9, b.heights[N - 1]), tanD = Math.tan(((bw.pitch + 6) * Math.PI) / 180);
  let span = b.bays >= 5 && b.bays % 2 ? 3 : b.bays % 2 ? 1 : 2, zw = span * pitch + 0.5;
  while (span > 1 && E + hd + (zw / 2) * tanD > ridge - 0.5) { span--; zw = span * pitch + 0.5; }
  const zl = W / 2 - zw / 2, zr = W / 2 + zw / 2, Ed = E + hd;
  const fz: Face = { L: zw, P: (s, y, t) => front.P(zl + s, y, t) };
  const g = gableOf(k, b, fz, zw, Ed, tanD, T, rng, { material, colour, trim, hoist: true });
  const shift = (h: Hole): Hole => ({ ...h, s0: h.s0 + zl, s1: h.s1 + zl });
  plan.openings.push(...g.openings.map((o) => ({ ...shift(o), fill: o.fill, across: o.across, down: o.down })));
  for (let j = 0; j < span; j++) {
    const c = W / 2 + (j - (span - 1) / 2) * pitch;
    plan.openings.push({ s0: c - ww / 2, s1: c + ww / 2, y0: E + 0.55, y1: Ed - 0.45, head, fill: 'window', across: 2, down: 2 });
  }
  plan.outline = [[0, -0.45], [W, -0.45], [W, E], [zr, E], ...[...g.top].reverse().map(([s, y]): Pt => [s + zl, y]), [zl, E], [0, E]];
  // (The gable's own outline may begin and end above the dormer's eaves: then its sides run straight down to them.)
  plan.outline.splice(4, 0, [zr, Ed]);
  plan.outline.splice(plan.outline.length - 2, 0, [zl, Ed]);
  shutWindows(b, k, front, plan);
  buildFront(k, front, plan, T, material, colour, { frame: FRAME, paint });
  g.after.forEach((f) => f());

  // ---- what is moulded on the front
  for (const [a, c] of [[-0.04, door.s0 - 0.35], [door.s1 + 0.35, W + 0.04]]) k.on(front, 'stone', a, c, -0.45, PL, -0.07, 0.05, granite);
  for (let n = 0; n < 3; n++) k.on(front, 'stone', door.s0 - 0.3 - n * 0.25, door.s1 + 0.3 + n * 0.25, -0.45, PL - n * (PL / 3), -0.42 - n * 0.3, T - 0.12, shade(granite, 1.1 - n * 0.05));
  const [tm, tc] = trim;
  const band = (y0: number, y1: number, out: number, s0 = -0.03, s1 = W + 0.03) => { for (const [a, c] of bandSpans(plan, s0, s1, y0, y1)) k.on(front, tm, a, c, y0, y1, -out, 0.04, tc); };
  band(floor(1) - 0.16, floor(1) + 0.08, 0.07);
  // The cornice under the eaves: three members, each standing further out than the one below; and the dormer's at its own eaves.
  band(E - 0.3, E - 0.16, 0.06);
  band(E - 0.16, E - 0.04, 0.14);
  band(E - 0.04, E + 0.1, 0.26);
  band(Ed - 0.12, Ed + 0.08, 0.16, zl - 0.1, zr + 0.1);
  // Corner strips, and the windows' surrounds and sills.
  for (const s of [0, W - 0.42]) k.on(front, tm, s + 0.02, s + 0.4, PL, E - 0.3, -0.05, 0.04, tc);
  for (const o of plan.openings) {
    if (o.fill !== 'window' || o.head === 'round') continue;
    if (rendered) {
      for (const [a, c] of [[o.s0 - 0.13, o.s0], [o.s1, o.s1 + 0.13]]) k.on(front, 'plaster', a, c, o.y0 - 0.02, o.y1 + 0.13, -0.04, 0.03, WHITE);
      k.on(front, 'plaster', o.s0 - 0.13, o.s1 + 0.13, o.y1, o.y1 + 0.13, -0.04, 0.03, WHITE);
      // (Over the windows of the first floor, a cornice of their own.)
      if (o.y0 > floor(1) && o.y0 < floor(2) - 0.5) k.on(front, 'plaster', o.s0 - 0.24, o.s1 + 0.24, o.y1 + 0.13, o.y1 + 0.24, -0.13, 0.03, WHITE);
    }
  }
  // The door's surround: two pilasters, a frieze, and a cornice; and in the opening, the leaves and a light over them.
  {
    const top = door.y1, light = top - 0.62;
    for (const s of [door.s0 - 0.3, door.s1]) k.on(front, tm, s, s + 0.3, PL, top + 0.05, -0.08, 0.04, tc);
    k.on(front, tm, door.s0 - 0.36, door.s1 + 0.36, top + 0.05, top + 0.32, -0.08, 0.04, tc);
    k.on(front, tm, door.s0 - 0.48, door.s1 + 0.48, top + 0.32, top + 0.44, -0.26, 0.04, tc);
    const into = front.P(0, 0, 0.3).sub(front.P(0, 0, 0));
    k.wedge(front.P(door.s0 - 0.48, top + 0.44, -0.26), front.P(door.s1 + 0.48, top + 0.44, -0.26), front.P(dc, top + 0.44 + 0.42, -0.26), into, trim, trim);
    const deep = T - 0.16;
    if (b.plan) openLeaves(k, front, door.s0, door.s1, door.y0, light, deep, paint, true);
    else doorLeaves(k, front, { ...door, y1: light }, deep, paint);
    k.on(front, 'wood', door.s0, door.s1, light, light + 0.08, deep - 0.02, deep + 0.08, FRAME, true);
    k.glazed(front, { s0: door.s0, s1: door.s1, y0: light + 0.08, y1: top }, 3, 1, FRAME, deep - 0.02);
  }

  // ---- the ends, the dormer's sides, and the back
  for (const f of [right, left]) {
    k.on(f, 'brick', T - 0.01, D - S + 0.01, -0.45, E, 0, S, brick);
    const into = f.P(0, 0, S).sub(f.P(0, 0, 0));
    k.wedge(f.P(0, E, 0), f.P(D, E, 0), f.P(D / 2, ridge - 0.1, 0), into, ['brick', brick], ['brick', brick]);
  }
  {
    const back0: { s0: number; s1: number; y0: number; y1: number }[] = [];
    for (let s = 0; s < N; s++) for (const [u0, u1] of brickBackWindows(b, s)) back0.push({ s0: W / 2 - u1, s1: W / 2 - u0, y0: floor(s) + (s ? 0.8 : PL + 1.0), y1: floor(s + 1) - 0.55 });
    k.prism(back, [[0, -0.45], [W, -0.45], [W, E], [0, E]], back0.map((g) => shapeOf({ ...g, head: 'flat' })), 0, S, 'brick', brick);
    for (const gp of back0) k.glazed(back, gp, 2, 2, FRAME, 0.18);
    if (b.plan) buildInterior(k, b.plan, brickShell(b), N, { W, front: plan.openings.map(shapeOf), back: back0.map((g) => shapeOf({ ...g, head: 'flat' })), ground: 'boards' });
  }
  // The dormer's side walls, back as far as the great roof rises above them.
  const deepD = hd / tan + 0.3;
  for (const [u0, u1] of [[zl - W / 2, zl - W / 2 + 0.3], [zr - W / 2 - 0.3, zr - W / 2]]) k.box(material, u0, u1, E - 0.2, Ed, T - 0.01, deepD, colour);

  // ---- the roofs
  const roofCol = roofOf(bw.roof);
  const ov = 0.38, verge = 0.14, low = E - ov * tan, mid = D / 2, uL = -W / 2 - verge, uR = W / 2 + verge, a = zl - W / 2, c = zr - W / 2;
  const at = k.at, under = shade(OAK, 0.8);
  // The great roof's slope to the street, cut about the dormer; and the slope at the back, whole.
  k.slope([at(uL, low, -ov), at(a, low, -ov), at(a, ridge, mid), at(uL, ridge, mid)], roofCol, under);
  k.slope([at(c, low, -ov), at(uR, low, -ov), at(uR, ridge, mid), at(c, ridge, mid)], roofCol, under);
  k.slope([at(a, Ed, hd / tan), at(c, Ed, hd / tan), at(c, ridge, mid), at(a, ridge, mid)], roofCol, under);
  k.slope([at(uL, low, D + ov), at(uR, low, D + ov), at(uR, ridge, mid), at(uL, ridge, mid)], roofCol, under);
  k.box(roofCol[0], uL, uR, ridge - 0.06, ridge + 0.08, mid - 0.13, mid + 0.13, shade(roofCol[1], 0.85));
  // The dormer's roof, from behind its gable back into the great roof.
  const Rd = Ed + (zw / 2) * tanD, vEnd = (Rd - E) / tan + 0.4, ovD = 0.12, lowD = Ed - ovD * tanD, um = (a + c) / 2;
  for (const [p, q] of [[a - ovD, um], [c + ovD, um]]) k.slope([at(p, lowD, T - 0.02), at(p, lowD, vEnd), at(q, Rd, vEnd), at(q, Rd, T - 0.02)], roofCol, under);
  k.box(roofCol[0], um - 0.12, um + 0.12, Rd - 0.06, Rd + 0.07, T - 0.02, vEnd, shade(roofCol[1], 0.85));
  // Chimneys of brick at the ridge, one toward each end.
  for (const side of [-1, 1]) {
    const u = side * W * rng.range(0.25, 0.36), v = mid + rng.range(-0.4, 0.4);
    k.box('brick', u - 0.34, u + 0.34, ridge - 1.2, ridge + 1.05, v - 0.45, v + 0.45, shade(brick, 0.95));
    k.box('brick', u - 0.42, u + 0.42, ridge + 1.05, ridge + 1.17, v - 0.53, v + 0.53, shade(brick, 0.8));
  }
}

// ---------------------------------------------------------------------------------------------
// The church.

/**
 * A church of the brick Gothic: a hall church, nave and aisles under one great steep roof, its
 * long walls buttressed bay by bay with a tall pointed window of two or three lights in each,
 * and under the eaves a frieze of little pointed arches on corbels, as the brick churches of the
 * coast have. A portal of stepped orders in the middle bay to the street. At one end a tower, or
 * two side by side: stages divided by bands of dark glazed brick, blind niches plastered white,
 * a belfry with louvred openings, and over it a needle spire of copper rising from among four
 * gables, a pyramid with a spirelet at each corner, or a ridged roof between stepped gables; the
 * portal at its foot. At the other end the choir, lower and narrower, ending in half an octagon or
 * a flat wall with a gable, and over its roof the nave's own gable, stepped or between piers.
 */
function church(b: Building, k: BrickKit, rng: Rng, stone: Colour): void {
  const bw = b.brickwork!, c = bw.church!, W = b.w, D = b.d, Hw = b.heights[0], T = 1.1, PL = BRICK.plinth, bays = b.bays, bay = W / bays;
  const tan = Math.tan((bw.pitch * Math.PI) / 180), brick = bw.tone, glazedTone = mul(brick, GLAZED), granite = shade(stone, 0.6);
  const dress: Colour = [0.82, 0.79, 0.72], paint = rng.pick(DOORS), parts = churchParts(b), away = parts.away, out = c.end;
  const [front, right, back, left] = k.walls(0), ridge = Hw + (D / 2) * tan;
  const roofCol = roofOf(bw.roof);
  const under = shade(OAK, 0.7), trim: [string, Colour] = ['brick', shade(brick, 0.85)];

  /** A buttress against a wall at `s`: two stages, each with a sloping weathering on top, the lower standing further out. */
  const buttress = (f: Face, s: number, top: number, outBy = 1.25, wide = 0.95) => {
    const foot = -0.6, mid = foot + (top - foot) * 0.5, out2 = outBy * 0.62, along = f.P(s + wide / 2, 0, 0).sub(f.P(s - wide / 2, 0, 0));
    k.on(f, 'brick', s - wide / 2, s + wide / 2, foot, mid, -outBy, 0.05, brick);
    k.on(f, 'stone', s - wide / 2 - 0.05, s + wide / 2 + 0.05, foot, PL + 0.3, -outBy - 0.08, 0.05, granite);
    k.wedge(f.P(s - wide / 2, mid, -outBy), f.P(s - wide / 2, mid, -out2), f.P(s - wide / 2, mid + (outBy - out2) * 1.1, -out2), along, ['brick', glazedTone], ['brick', glazedTone]);
    k.on(f, 'brick', s - wide * 0.45, s + wide * 0.45, mid, top, -out2, 0.05, brick);
    const along2 = f.P(s + wide * 0.45, 0, 0).sub(f.P(s - wide * 0.45, 0, 0));
    k.wedge(f.P(s - wide * 0.45, top, -out2), f.P(s - wide * 0.45, top, 0.02), f.P(s - wide * 0.45, top + out2 * 1.1, 0.02), along2, ['brick', glazedTone], ['brick', glazedTone]);
  };
  /** Under the eaves, a frieze of little pointed arches hanging from a course, each pair parted by a corbel; white behind. */
  const frieze = (f: Face, s0: number, s1: number, y0: number, y1: number) => {
    const n = Math.max(1, Math.floor((s1 - s0) / 0.52)), pitch = (s1 - s0) / n, aw = pitch * 0.7, line: Pt[] = [[s0, y0]];
    k.on(f, 'plaster', s0, s1, y0 + 0.02, y1 - 0.02, -0.02, 0.02, WHITE);
    for (let i = 0; i < n; i++) {
      const a = s0 + (i + 0.5) * pitch - aw / 2, e = a + aw, spring = y1 - 0.08 - riseOf(aw, 'pointed');
      line.push([a, y0], [a, spring], ...headPoints(a, e, spring, 'pointed', 5).reverse(), [e, spring], [e, y0]);
      // (The corbel under the pier between this arch and the last.)
      k.on(f, 'brick', a - (pitch - aw) / 2, a, y0 - 0.12, y0, -0.1, 0.02, shade(brick, 0.9));
    }
    line.push([s1, y0], [s1, y1], [s0, y1]);
    k.prism(f, line, [], -0.1, -0.02, 'brick', shade(brick, 0.95));
    k.on(f, 'brick', s0 - 0.05, s1 + 0.05, y1, y1 + 0.16, -0.2, 0.04, bw.glazed ? glazedTone : shade(brick, 0.9));
    k.on(f, 'brick', s0 - 0.08, s1 + 0.08, y1 + 0.16, y1 + 0.3, -0.3, 0.04, shade(brick, 0.85));
  };
  /** A sheet of roof through any number of corners, covered on top and boarded beneath. */
  const sheet = (pts: Vector3[], cover: [string, Colour], thick = 0.2) => {
    const n = new Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize();
    if (n.y < 0) n.negate();
    const low = pts.map((p) => p.clone().addScaledVector(n, -thick)), mid = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length);
    k.poly(cover[0], pts, cover[1], n, false, cover[0] === 'tile' ? 0.62 : 0.5);
    k.poly('wood', low, under, n.clone().negate(), true, 0.9);
    for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; k.poly('wood', [pts[i], pts[j], low[j], low[i]], under, pts[i].clone().add(pts[j]).multiplyScalar(0.5).sub(mid), true, 0.9); }
  };

  // ---- the nave's long walls
  const portalBay = bays >> 1;
  for (const [fi, f] of [front, back].entries()) {
    const plan: FrontPlan = { outline: [[0, -0.6], [W, -0.6], [W, Hw], [0, Hw]], openings: [], niches: [] };
    for (let j = 0; j < bays; j++) {
      const cx = (j + 0.5) * bay, ww = Math.min(2.9, bay - 2.5), portal = fi === 0 && j === portalBay;
      if (portal) plan.openings.push({ s0: cx - 1.05, s1: cx + 1.05, y0: PL, y1: PL + 4.4, head: 'pointed', fill: 'door', orders: 3 });
      const y0 = portal ? PL + 6.4 : 2.8;
      if (Hw - 1.5 - y0 > riseOf(ww, 'pointed') + 0.8) plan.openings.push({ s0: cx - ww / 2, s1: cx + ww / 2, y0, y1: Hw - 1.55, head: 'pointed', fill: 'tracery', orders: 1 });
    }
    buildFront(k, f, plan, T, 'brick', brick, { frame: FRAME, paint, door: paint, dress });
    for (const [a, e] of bandSpans(plan, -0.05, W + 0.05, -0.6, PL + 0.35)) k.on(f, 'stone', a, e, -0.6, PL + 0.35, -0.12, 0.05, granite);
    for (const [a, e] of bandSpans(plan, -0.03, W + 0.03, 2.45, 2.62)) k.on(f, 'brick', a, e, 2.45, 2.62, -0.05, 0.04, glazedTone);
    frieze(f, 0, W, Hw - 1.05, Hw - 0.42);
    // (Buttresses at every division between bays, and at the corners; none where a pair of towers stands against the corner.)
    for (let j = 0; j <= bays; j++) {
      const s = j === 0 ? 0.6 : j === bays ? W - 0.6 : j * bay, u = fi === 0 ? -W / 2 + s : W / 2 - s;
      if (c.towers === 2 && Math.sign(u) === out && Math.abs(u) > W / 2 - 1.5) continue;
      buttress(f, s, Hw - 1.3);
    }
  }
  // ---- the nave's ends: walls between the long walls, and a gable over each
  const towerFace = out > 0 ? right : left, choirFace = out > 0 ? left : right;
  for (const f of [towerFace, choirFace]) {
    k.on(f, 'brick', T - 0.01, D - T + 0.01, -0.6, Hw, 0, T, brick);
    k.on(f, 'stone', T - 0.01, D - T + 0.01, -0.6, PL + 0.35, -0.12, 0.05, granite);
  }
  {
    // Over the choir, the nave's gable is the church's show front to the east: stepped or between piers, and sunk with niches.
    const g = gableOf(k, b, choirFace, D, Hw, tan, 0.8, rng, { material: 'brick', colour: brick, trim, hoist: false });
    buildFront(k, choirFace, { outline: [[0, Hw], [D, Hw], ...[...g.top].reverse()], openings: g.openings, niches: g.niches }, 0.8, 'brick', brick, { frame: FRAME, paint, dress });
    g.after.forEach((fn) => fn());
    frieze(choirFace, 0.3, D - 0.3, Hw - 0.75, Hw - 0.12);
    // (At the tower's end the gable is plain, and under the roof's edge; the tower stands before it.)
    const into = towerFace.P(0, 0, 0.8).sub(towerFace.P(0, 0, 0));
    k.wedge(towerFace.P(0, Hw, 0), towerFace.P(D, Hw, 0), towerFace.P(D / 2, ridge - 0.12, 0), into, ['brick', brick], ['brick', brick]);
  }
  // ---- the nave's roof: from the eaves of the long walls to the ridge, from behind the east gable to over the west one.
  {
    const ov = 0.55, low = Hw - ov * tan, uc = out > 0 ? -W / 2 + 0.78 : W / 2 - 0.78, ut = out > 0 ? W / 2 + 0.3 : -W / 2 - 0.3;
    const u0 = Math.min(uc, ut), u1 = Math.max(uc, ut);
    k.slope([k.at(u0, low, -ov), k.at(u1, low, -ov), k.at(u1, ridge, D / 2), k.at(u0, ridge, D / 2)], roofCol, under, 0.22);
    k.slope([k.at(u0, low, D + ov), k.at(u1, low, D + ov), k.at(u1, ridge, D / 2), k.at(u0, ridge, D / 2)], roofCol, under, 0.22);
    k.box(roofCol[0], u0, u1, ridge - 0.08, ridge + 0.1, D / 2 - 0.16, D / 2 + 0.16, shade(roofCol[1], 0.85));
  }

  // ---- the choir
  {
    const a = parts.cw / 2, L = c.choirLength, Hc = Hw - 1.1, Rc = Hc + a * tan, un = away > 0 ? W / 2 : -W / 2, side = a * Math.tan(Math.PI / 8) * 2;
    // Its outline, going round with the inside to the left, from the nave's end on the street side; in measures beyond the nave's end (`x`) and across from its middle (`y`).
    const shape: Pt[] = c.choir === 'apse'
      ? [[0, -a], [L + side / 2, -a], [L + a, -side / 2], [L + a, side / 2], [L + side / 2, a], [0, a]]
      : [[0, -a], [L, -a], [L, a], [0, a]];
    const uv = ([x, y]: Pt): Pt => [un + away * x, D / 2 + y];
    const ring = (away > 0 ? shape : [...shape].reverse()).map(uv);
    const walls: Face[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [p, q] = [ring[i], ring[i + 1]];
      // (The closing side, back at the nave, is the nave's own end wall.)
      if (Math.abs(p[0] - un) < 1e-6 && Math.abs(q[0] - un) < 1e-6) continue;
      walls.push(k.faceFrom(p[0], p[1], q[0], q[1]));
    }
    for (const f of walls) {
      // (A face along the choir's side runs from the nave; one of the apse stands free.)
      const plan: FrontPlan = { outline: [[0, -0.6], [f.L, -0.6], [f.L, Hc], [0, Hc]], openings: [], niches: [] };
      const n = f.L > 5 ? Math.max(1, Math.round((f.L - 1.2) / 4.2)) : f.L > 2.4 ? 1 : 0, pitch = f.L / Math.max(1, n), ww = Math.min(c.choir === 'flat' && f.L > 6 ? 3.2 : 2.3, pitch - 1.7);
      for (let j = 0; j < n; j++) if (ww > 0.9) plan.openings.push({ s0: (j + 0.5) * pitch - ww / 2, s1: (j + 0.5) * pitch + ww / 2, y0: 2.8, y1: Hc - 1.4, head: 'pointed', fill: 'tracery', orders: 1 });
      buildFront(k, f, plan, 0.9, 'brick', brick, { frame: FRAME, paint, dress });
      for (const [p, e] of bandSpans(plan, -0.02, f.L + 0.02, -0.6, PL + 0.35)) k.on(f, 'stone', p, e, -0.6, PL + 0.35, -0.12, 0.05, granite);
      for (const [p, e] of bandSpans(plan, -0.02, f.L + 0.02, 2.45, 2.62)) k.on(f, 'brick', p, e, 2.45, 2.62, -0.05, 0.04, glazedTone);
      frieze(f, 0.05, f.L - 0.05, Hc - 1.0, Hc - 0.4);
      for (let j = 1; j < n; j++) buttress(f, j * pitch, Hc - 1.2, 1.0, 0.8);
    }
    // Buttresses at the corners of the apse and the choir's end, standing out along the line that halves each corner.
    for (let i = 1; i < ring.length - 1; i++) {
      const [p, q, r] = [ring[i - 1], ring[i], ring[i + 1]];
      if (Math.abs(q[0] - un) < 1e-6) continue;
      const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [r[0] - q[0], r[1] - q[1]], l1 = Math.hypot(d1[0], d1[1]), l2 = Math.hypot(d2[0], d2[1]);
      const dir = [d1[0] / l1 + d2[0] / l2, d1[1] / l1 + d2[1] / l2], dl = Math.hypot(dir[0], dir[1]);
      const fc = k.faceFrom(q[0] - (dir[0] / dl) * 0.5, q[1] - (dir[1] / dl) * 0.5, q[0] + (dir[0] / dl) * 0.5, q[1] + (dir[1] / dl) * 0.5);
      buttress(fc, 0.5, Hc - 1.2, 1.1, 0.8);
    }
    // The choir's roof: two slopes along it, and over the apse a facet down to each of its sides; or, at a flat end, a gable.
    // (At a flat end the roof stops behind the gable, which stands above it.)
    const ov = 0.45, low = Hc - ov * tan, uIn = un - away * 0.6, uEnd = un + away * (L - (c.choir === 'flat' ? 0.7 : 0)), lo = (x: number, y: number) => k.at(x, low, y);
    k.slope([lo(Math.min(uIn, uEnd), D / 2 - a - ov), lo(Math.max(uIn, uEnd), D / 2 - a - ov), k.at(Math.max(uIn, uEnd), Rc, D / 2), k.at(Math.min(uIn, uEnd), Rc, D / 2)], roofCol, under, 0.2);
    k.slope([lo(Math.min(uIn, uEnd), D / 2 + a + ov), lo(Math.max(uIn, uEnd), D / 2 + a + ov), k.at(Math.max(uIn, uEnd), Rc, D / 2), k.at(Math.min(uIn, uEnd), Rc, D / 2)], roofCol, under, 0.2);
    k.box(roofCol[0], Math.min(uIn, uEnd), Math.max(uIn, uEnd), Rc - 0.08, Rc + 0.09, D / 2 - 0.14, D / 2 + 0.14, shade(roofCol[1], 0.85));
    if (c.choir === 'apse') {
      const apex = k.at(un + away * L, Rc, D / 2), grow = (a + ov) / a;
      const eave = shape.slice(1, 5).map(([x, y]): Pt => [L + (x - L) * grow, y * grow]).map(uv);
      const all: Pt[] = [uv([L, -(a + ov)]), ...eave, uv([L, a + ov])];
      for (let i = 0; i < all.length - 1; i++) sheet([k.at(all[i][0], low, all[i][1]), k.at(all[i + 1][0], low, all[i + 1][1]), apex], roofCol, 0.2);
    } else {
      const end = walls[1];
      const g = gableOf(k, b, end, parts.cw, Hc, tan, 0.75, rng, { material: 'brick', colour: brick, trim, hoist: false });
      buildFront(k, end, { outline: [[0, Hc], [parts.cw, Hc], ...[...g.top].reverse()], openings: g.openings, niches: g.niches }, 0.75, 'brick', brick, { frame: FRAME, paint, dress });
      g.after.forEach((fn) => fn());
    }
  }

  // ---- the tower or towers
  for (const [ti, tr] of parts.towers.entries()) {
    const L = tr.u1 - tr.u0, Tt = 1.3, Ht = c.height, cu = (tr.u0 + tr.u1) / 2, cv = (tr.v0 + tr.v1) / 2;
    // Its four faces, going round: to the street, the end away from the nave, the back, the nave's end; each a prism from its corner to within a wall's thickness of the next.
    const faces = [k.faceFrom(tr.u0, tr.v0, tr.u1, tr.v0), k.faceFrom(tr.u1, tr.v0, tr.u1, tr.v1), k.faceFrom(tr.u1, tr.v1, tr.u0, tr.v1), k.faceFrom(tr.u0, tr.v1, tr.u0, tr.v0)];
    const outer = out > 0 ? 1 : 3, toNave = out > 0 ? 3 : 1, street = c.towers === 2 ? (ti === 0 ? 0 : 2) : 0;
    // (Each face is a prism from its corner to within a wall's thickness of the next corner, where the next face begins; but what is
    // set in it is centred on the whole face as it is seen, and kept within the part of it that is its own.)
    const yA = Hw - 0.6, yB = Ht - 6.6, split = yB - yA > 10 ? (yA + yB) / 2 : 0, span = L - Tt, mid = L / 2, usable = L - 2 * Tt - 0.7;
    faces.forEach((f, i) => {
      const plan: FrontPlan = { outline: [[0, -0.6], [span, -0.6], [span, Ht], [0, Ht]], openings: [], niches: [] };
      const white = bw.niches === 'white';
      // The foot: the portal on the end away from the nave, with a window over it; elsewhere a pair of tall blind niches.
      if (i === outer) {
        plan.openings.push({ s0: mid - 1.2, s1: mid + 1.2, y0: PL, y1: PL + 5.0, head: 'pointed', fill: 'door', orders: 3 });
        if (yA - 9.0 > 2.4) plan.openings.push({ s0: mid - 1.15, s1: mid + 1.15, y0: 8.4, y1: yA - 0.7, head: 'pointed', fill: 'tracery', orders: 1 });
      } else if (i !== toNave && i === street) for (const s of [mid - 1.2, mid + 1.2]) plan.niches.push({ s0: s - 0.75, s1: s + 0.75, y0: 2.2, y1: yA - 0.8, head: 'pointed', white });
      // The stages above: three tall niches, or two; on the street face the clock, under the belfry.
      const stages = split ? [[yA, split], [split, yB]] : [[yA, yB]];
      stages.forEach(([s0, s1], si) => {
        const clock = i === street && si === stages.length - 1 && s1 - s0 > 6;
        const top = clock ? s1 - 3.0 : s1 - 0.6, n = usable > 4.2 ? 3 : 2, nw = (usable - 0.45 * (n - 1)) / n;
        if (top - (s0 + 0.6) > riseOf(nw, 'pointed') + 1.0) for (let j = 0; j < n; j++) {
          const a = mid - usable / 2 + j * (nw + 0.45);
          plan.niches.push({ s0: a, s1: a + nw, y0: s0 + 0.6, y1: top - (j === (n - 1) / 2 ? 0 : 0.5), head: 'pointed', white });
        }
      });
      // The belfry: two openings with louvres, side by side in one niche.
      const bwid = Math.min(1.2, (usable - 1.0) / 2);
      plan.niches.push({ s0: mid - bwid - 0.45, s1: mid + bwid + 0.45, y0: yB + 0.45, y1: Ht - 1.25, head: 'pointed', white: false });
      for (const s of [mid - bwid / 2 - 0.15, mid + bwid / 2 + 0.15]) plan.openings.push({ s0: s - bwid / 2, s1: s + bwid / 2, y0: yB + 0.75, y1: Ht - 1.25 - riseOf(2 * bwid + 0.9, 'pointed') + riseOf(bwid, 'pointed') - 0.25, head: 'pointed', fill: 'louvre' });
      buildFront(k, f, plan, Tt, 'brick', brick, { frame: FRAME, paint, door: paint, dress });
      // Bands at the foot of each stage, the plinth, and the frieze under the top.
      // (Bands run on round the corner, past the next face's own, so that they meet.)
      for (const y of [yA, ...(split ? [split] : []), yB]) for (const [p, e] of bandSpans(plan, 0, L + 0.06, y - 0.12, y + 0.12)) k.on(f, 'brick', p, e, y - 0.12, y + 0.12, -0.08, 0.04, glazedTone);
      for (const [p, e] of bandSpans(plan, 0, L + 0.12, -0.6, PL + 0.4)) k.on(f, 'stone', p, e, -0.6, PL + 0.4, -0.14, 0.05, granite);
      frieze(f, 0.25, L - 0.25, Ht - 1.0, Ht - 0.4);
      if (i === street && split !== 0) {
        // The clock: a white dial in a ring of stone, with its hours and two hands of gilt.
        const cy = yB - 1.55, gold: Colour = [0.75, 0.58, 0.22];
        k.disc(f, mid, cy, 1.15, -0.12, 0.05, 'stone', dress);
        k.disc(f, mid, cy, 0.98, -0.16, -0.12, 'plaster', [0.86, 0.84, 0.78]);
        for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; k.disc(f, mid + Math.cos(a) * 0.82, cy + Math.sin(a) * 0.82, 0.05, -0.19, -0.16, 'metal', IRON); }
        const hand = (ang: number, len: number) => k.stick(f.P(mid, cy, -0.19), f.P(mid + Math.cos(ang) * len, cy + Math.sin(ang) * len + 1e-3, -0.19), 0.03, 0.07, gold, 'metal');
        const hour = rng.range(0, Math.PI * 2);
        hand(hour, 0.5);
        hand(rng.range(0, Math.PI * 2), 0.78);
      }
    });
    // ---- what stands over the tower
    const gold: Colour = [0.78, 0.6, 0.22], copper = COPPER;
    const finial = (p: Vector3) => {
      k.shaft(p, 0.06, 1.1, 6, 0, 'metal', IRON);
      k.shaft(p.clone().setY(p.y + 0.5), 0.2, 0.36, 8, 0, 'metal', gold);
      // (A cross over the ball, its arms along the street.)
      const v = (dx: number, dy: number, dz: number) => p.clone().add(new Vector3(dx, dy, dz));
      k.block('metal', v(-0.035, 0.85, -0.035), v(0.035, 2.0, 0.035), gold);
      k.block('metal', v(-0.03, 1.5, -0.32), v(0.03, 1.58, 0.32), gold);
    };
    const centre = k.at(cu, Ht, cv), turn = rot(faces[0]);
    // (The corners of the tower's top, where the spire's base does not reach: a pinnacle on each.)
    const corners = [[tr.u0, tr.v0], [tr.u1, tr.v0], [tr.u1, tr.v1], [tr.u0, tr.v1]].map(([u, v]) => k.at(u + (u < cu ? 0.55 : -0.55), Ht, v + (v < cv ? 0.55 : -0.55)));
    if (c.spire === 'needle') {
      // A gable on every face, with niches in it; and from among them an eight-sided spire.
      const tg = Math.tan((62 * Math.PI) / 180), gh = (L / 2) * tg;
      for (const f of faces) {
        const n: FrontPlan['niches'] = [], w0 = 0.75, w1 = 1.0;
        n.push({ s0: L / 2 - w1 / 2, s1: L / 2 + w1 / 2, y0: Ht + 0.4, y1: Ht + gh - 1.0, head: 'pointed', white: bw.niches === 'white' });
        for (const sd of [-1, 1]) { const sc = L / 2 + sd * 1.25, top = Ht + (L / 2 - Math.abs(sc - L / 2) - w0 / 2) * tg - 0.5; if (top - Ht > 1.6) n.push({ s0: sc - w0 / 2, s1: sc + w0 / 2, y0: Ht + 0.4, y1: top, head: 'pointed', white: bw.niches === 'white' }); }
        buildFront(k, f, { outline: [[0, Ht], [L, Ht], [L / 2, Ht + gh]], openings: [], niches: n }, 0.7, 'brick', brick, { frame: FRAME, paint });
        for (const sd of [0, L]) k.stick(f.P(sd, Ht + 0.05, 0.35), f.P(L / 2, Ht + gh + 0.12, 0.35), 0.86, 0.2, shade(brick, 0.85), 'brick');
        finial(f.P(L / 2, Ht + gh + 0.2, 0.35));
      }
      const r = (L / 2 - 0.72) / Math.cos(Math.PI / 8), h = gh + c.spireHeight;
      k.pyramid(centre, r, h, 8, turn + Math.PI / 8, 'copper', copper);
      for (const p of corners) { k.shaft(p, 0.42, 1.5, 4, turn + Math.PI / 4, 'brick', brick); k.pyramid(above(p, 1.5), 0.5, 2.2, 4, turn + Math.PI / 4, 'copper', copper); }
      finial(above(centre, h));
    } else if (c.spire === 'corners') {
      // A four-sided spire standing out a little over the walls, and at each corner a spirelet on a turret of its own.
      const h = c.spireHeight;
      k.on(faces[0], 'brick', -0.12, L + 0.12, Ht, Ht + 0.25, -0.12, L + 0.12, shade(brick, 0.9));
      k.pyramid(above(centre, 0.25), (L / 2 + 0.25) * Math.SQRT2, h, 4, turn + Math.PI / 4, 'copper', copper);
      for (const p of corners) {
        k.shaft(p, 0.62, 2.4, 8, 0, 'brick', brick);
        k.pyramid(above(p, 2.4), 0.7, h * 0.42, 8, Math.PI / 8, 'copper', copper);
        finial(above(p, 2.4 + h * 0.42));
      }
      finial(above(centre, 0.25 + h));
    } else {
      // A ridged roof between two stepped gables, to the street and to the back.
      const tg = Math.tan((58 * Math.PI) / 180), rr = Ht + (L / 2) * tg, steps = { ...b, brickwork: { ...bw, gable: 'stepped' as const, steps: 3 } };
      for (const f of [faces[0], faces[2]]) {
        const g = gableOf(k, steps, f, L, Ht, tg, 0.8, rng, { material: 'brick', colour: brick, trim, hoist: false });
        buildFront(k, f, { outline: [[0, Ht], [L, Ht], ...[...g.top].reverse()], openings: g.openings, niches: g.niches }, 0.8, 'brick', brick, { frame: FRAME, paint });
        g.after.forEach((fn) => fn());
      }
      for (const sd of [-1, 1]) {
        const ue = cu + sd * (L / 2 + 0.3), low = Ht - 0.3 * tg;
        k.slope([k.at(ue, low, tr.v0 + 0.78), k.at(ue, low, tr.v1 - 0.78), k.at(cu, rr, tr.v1 - 0.78), k.at(cu, rr, tr.v0 + 0.78)], roofCol, under, 0.2);
      }
      k.box(roofCol[0], cu - 0.14, cu + 0.14, rr - 0.08, rr + 0.09, tr.v0 + 0.78, tr.v1 - 0.78, shade(roofCol[1], 0.85));
    }
  }
  // Between a pair of towers, a wall up to the height of the nave's ridge, so that the front reads as one.
  if (c.towers === 2) {
    const [t0, t1] = parts.towers;
    k.box('brick', t0.u0 + 0.3, t0.u1 - 0.3, -0.6, ridge, t0.v1 - 0.4, t1.v0 + 0.4, brick);
  }
}

// ---------------------------------------------------------------------------------------------

/** Builds a building of brick where the site document says it stands, on ground at the height `base`. */
export function buildBrick(b: Building, base: number, mesh: (material: string) => MeshBuilder, rng: Rng, stone: Colour): void {
  // (What is built of brick is built of the building's own clay.)
  // (A house that can be entered has glass that can be seen through, both ways; and its timber within, laid as `oak`, is timber.)
  const clay = b.brickwork!.clay === 'buff' ? 'buffBrick' : 'redBrick', enter = !!b.plan;
  const as = (material: string) => (material === 'brick' ? clay : material === 'oak' ? 'wood' : enter && material === 'glass' ? 'pane' : enter && material === 'window' ? 'paneLit' : material);
  const begun = new Map<MeshBuilder, number>();
  const noting = (material: string) => { const m = mesh(as(material)); if (!begun.has(m)) begun.set(m, m.vertexCount); return m; };
  const k = brickTools(b, base, noting);
  const kind = b.brickwork!.kind;
  if (kind === 'gabled' || kind === 'store') streetHouse(b, k, rng, stone);
  else if (kind === 'eaves') eavesHouse(b, k, rng, stone);
  else church(b, k, rng, stone);
  // Indoors only a share of the sky is seen, through the windows: so the rooms are dimmer than the street, and the sun lies on their floors where it comes in.
  if (enter) {
    const turn = b.faces === 'w' ? 1 : -1, sh = brickShell(b), lo = sh.floors[0] - 0.1, hi = sh.floors[b.storeys] + 0.05;
    for (const [m, from] of begun) m.setOpenBy((x, y, z) => {
      const u = turn * (z - b.z), v = turn * (x - b.x) + b.d / 2, h = y - base;
      return u > sh.u0 - 0.01 && u < sh.u1 + 0.01 && v > sh.v0 - 0.01 && v < sh.v1 + 0.01 && h > lo && h < hi ? 0.32 : 1;
    }, from);
  }
}
