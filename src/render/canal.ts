import { Vector3 } from 'three';
import { CANAL, canalBackWindows, canalBays, canalDoor, canalEaves, canalFloor, canalShell, canalStoop } from '../core/canal';
import { Rng } from '../core/rng';
import { Building } from '../core/site';
import { BrickKit, brickTools, clipAt, Face, glaze, Hole, Pt, riseOf, shapeOf } from './brick';
import { MeshBuilder } from './geom/meshBuilder';
import { buildInterior, openLeaves } from './interior';

/**
 * The canal houses of Amsterdam. The site document says how each is made (`CanalWork`); this
 * makes it, with the brick builder's tools: the front is a plane figure (its outline over the
 * eaves, with every window, door and hatch a hole through it) made solid, and what is dressed,
 * carved or painted is laid on it. Then the front is leaned out over the street, as the fronts on
 * the canals lean, and the stoop is built before it, upright.
 *
 * The measures of the front are as for brick: `s` along it from its left end as seen from the
 * street, `y` up from the street before the door, `t` into the wall from its face.
 */

type Colour = [number, number, number];
/** An opening through the front, and what fills it. */
interface Opening extends Hole { fill: 'window' | 'door' | 'hatch' | 'cellar' | 'pui' | 'oculus' | 'loft'; storey: number; ring?: Pt[] }

const OAK: Colour = [0.2, 0.13, 0.085], IRON: Colour = [0.05, 0.05, 0.055], BRASS: Colour = [0.62, 0.5, 0.24], PANE: Colour = [0.04, 0.055, 0.075];
/** Bluestone, the hard dark limestone of the plinths, sills and stoops; and the tar on the boards of a spout gable. */
const BLUE: Colour = [0.27, 0.28, 0.3], TAR: Colour = [0.09, 0.075, 0.065];
const shade = (c: Colour, k: number): Colour => [c[0] * k, c[1] * k, c[2] * k];
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
const above = (p: Vector3, dy: number) => p.clone().setY(p.y + dy);

/** The points of a segmental arc over `s0`..`s1` springing at `spring` and rising `rise`, from its right end over to its left, both ends in. */
function arc(s0: number, s1: number, spring: number, rise: number, n = 10): Pt[] {
  const w = s1 - s0, mid = (s0 + s1) / 2, r = (w * w / 4 + rise * rise) / (2 * rise), cy = spring + rise - r, a0 = Math.asin(Math.min(1, w / 2 / r));
  return Array.from({ length: n + 1 }, (_, i): Pt => { const a = a0 - (2 * a0 * i) / n; return [mid + Math.sin(a) * r, cy + Math.cos(a) * r]; });
}

/** Where a level band from `s0` to `s1` between `y0` and `y1` may run, broken wherever an opening crosses it. */
function spans(openings: Hole[], s0: number, s1: number, y0: number, y1: number, pad = 0.03): [number, number][] {
  const cuts = openings.filter((g) => g.y1 > y0 - 0.01 && g.y0 < y1 + 0.01).map((g): [number, number] => [g.s0 - pad, g.s1 + pad]).sort((a, c) => a[0] - c[0]);
  const out: [number, number][] = [];
  let s = s0;
  for (const [a, c] of cuts) { if (a > s + 0.05) out.push([s, Math.min(a, s1)]); s = Math.max(s, c); }
  if (s1 > s + 0.05) out.push([s, s1]);
  return out;
}

/**
 * The half breadth of the front at a height, from its outline over the eaves (`top`, its points
 * from left to right): how far either side of the middle the wall stands at least that high. The
 * left half of every outline here rises as it goes in, so the first place it reaches the height is
 * the answer.
 */
function halfAt(top: Pt[], W: number, y: number): number {
  if (y <= top[0][1]) return W / 2;
  for (let i = 0; i + 1 < top.length && top[i][0] < W / 2 + 1e-6; i++) {
    const [s0, y0] = top[i], [s1, y1] = top[i + 1];
    if (y1 >= y && y0 < y) return W / 2 - (s0 + ((s1 - s0) * (y - y0)) / (y1 - y0));
  }
  return 0;
}

/**
 * Builds a canal house where the site document says it stands, on ground at the height `base`. `tops`, if given, is told where its
 * chimneys' tops are. (The country's stone, which every other builder is given, is not used: the canal cities had no stone of their
 * own, and dressed their brick in sandstone from Bentheim and bluestone from the Meuse, brought by water.)
 */
export function buildCanal(b: Building, base: number, mesh: (material: string) => MeshBuilder, rng: Rng, _stone: Colour, tops?: Vector3[]): void {
  const cw = b.canalwork!, clay = cw.clay === 'buff' ? 'buffBrick' : 'redBrick';
  // (What is built of brick is built of the house's own clay. Its woodwork is all painted, frames, doors, shutters, cornices, and is
  // drawn as paint, smooth, not as the grain of bare timber, which showed through white and made it brown. What is laid now is
  // noted, mesh by mesh, so that it can be leaned.)
  // (A house that can be entered has glass that can be seen through, both ways, and its lit windows glow without hiding the room;
  // its bare timber within is laid as `oak`, which is drawn as timber.)
  const enter = !!b.plan;
  const as = (material: string) => (material === 'brick' ? clay : material === 'wood' ? 'plaster' : material === 'oak' ? 'wood' : enter && material === 'glass' ? 'pane' : enter && material === 'window' ? 'paneLit' : material);
  const begun = new Map<MeshBuilder, number>();
  const noting = (material: string) => { const m = mesh(as(material)); if (!begun.has(m)) begun.set(m, m.vertexCount); return m; };
  const k = brickTools(b, base, noting);
  canalHouse(b, k, rng.fork('house'), tops);
  // Indoors only a share of the sky is seen, through the windows: so the rooms are dimmer than the street, and the sun lies on their floors where it comes in.
  if (enter) {
    const turn = b.faces === 'w' ? 1 : -1, sh = canalShell(b), lo = sh.floors[0] - 0.1, hi = sh.floors[b.storeys] + 0.05;
    for (const [m, from] of begun) m.setOpenBy((x, y, z) => {
      const u = turn * (z - b.z), v = turn * (x - b.x) + b.d / 2, h = y - base;
      return u > sh.u0 - 0.01 && u < sh.u1 + 0.01 && v > sh.v0 - 0.01 && v < sh.v1 + 0.01 && h > lo && h < hi ? 0.32 : 1;
    }, from);
  }
  // The lean: everything of the front, and what is laid on it, out over the street by `lean` for each metre up; the side walls and
  // the roof are carried with it at their front ends, and not at all at their backs.
  if (cw.lean > 0) {
    const turn = b.faces === 'w' ? 1 : -1, T = CANAL.front;
    for (const [m, from] of begun) m.movePoints((p) => {
      const v = turn * (p[0] - b.x) + b.d / 2, y = p[1] - base, share = v <= T + 0.05 ? 1 : Math.max(0, 1 - (v - T - 0.05) / 2.4);
      p[0] -= turn * cw.lean * Math.max(0, y) * share;
    }, from);
  }
  stoop(b, brickTools(b, base, (material) => mesh(as(material))));
}

/**
 * The house: its front with its gable, windows, door and dressings; its side walls, which stand
 * against its neighbours and are plain; its back; and its roof, ridged from front to back as the
 * lots run, or two such roofs side by side over a house too broad for one.
 */
function canalHouse(b: Building, k: BrickKit, rng: Rng, tops?: Vector3[]): void {
  const cw = b.canalwork!, W = b.w, D = b.d, T = CANAL.front, S = CANAL.wall, PL = CANAL.plinth, N = b.storeys, store = cw.kind === 'warehouse';
  const F0 = cw.stoop, floor = (s: number) => canalFloor(b, s), E = canalEaves(b), mid = W / 2, orn = cw.ornament;
  const tan = Math.tan((cw.pitch * Math.PI) / 180), roofAt = (s: number) => E + Math.min(s, W - s) * tan, ridge = E + mid * tan;
  const brick = cw.tone, painted = cw.front === 'painted', material = painted ? 'plaster' : 'brick', colour: Colour = painted ? b.colour : brick;
  const tc = cw.trim, tm = painted || Math.min(...tc) > 0.84 ? 'plaster' : 'stone';
  const [front, right, back, left] = k.walls(0);
  const bays = canalBays(b), door = canalDoor(b), st = canalStoop(b);
  const cornice = cw.gable === 'cornice' || cw.gable === 'raised';
  const shutterOf = cw.shutters ?? cw.paint, enter = !!b.plan, hinge: -1 | 1 = (door.s0 + door.s1) / 2 < W / 2 ? -1 : 1;

  // ---- the openings below the eaves
  const openings: Opening[] = [];
  const hatchCols = store ? (b.bays === 5 ? [1, 3] : [b.bays >> 1]) : [];
  const ww = store ? Math.min(0.95, bays.window) : bays.window;
  const sillUp = (s: number) => (s === 0 ? (cw.basement ? 0.6 : 0.85) : store ? 0.75 : 0.72);
  for (let s = 0; s < N; s++) for (let j = 0; j < b.bays; j++) {
    const c = bays.centre(j);
    if (s === 0 && (cw.pui || j === cw.door)) continue;
    if (hatchCols.includes(j)) {
      if (s === 0) continue;
      const hw = Math.min(1.35, bays.pitch - 0.45);
      openings.push({ s0: c - hw / 2, s1: c + hw / 2, y0: floor(s) + 0.1, y1: floor(s + 1) - 0.4, head: 'flat', fill: 'hatch', storey: s });
      continue;
    }
    // (A cross window under a relieving arch stops lower, so that the arch clears the floor above.)
    const y0 = (s === 0 ? F0 : floor(s)) + sillUp(s), y1 = floor(s + 1) - (store ? 0.55 : cw.windows === 'cross' && orn >= 1 ? 0.78 : 0.42);
    if (y1 - y0 > 0.5) openings.push({ s0: c - ww / 2, s1: c + ww / 2, y0, y1, head: store ? 'segment' : 'flat', fill: 'window', storey: s });
  }
  if (cw.pui) {
    openings.push({ s0: 0.2, s1: W - 0.2, y0: PL + 0.02, y1: floor(1) - 0.3, head: 'flat', fill: 'pui', storey: 0 });
  } else {
    const dTop = store ? Math.min(F0 + 3.0, floor(1) - 0.3) : floor(1) - 0.42;
    openings.push({ s0: door.s0, s1: door.s1, y0: F0, y1: dTop, head: store ? 'segment' : 'flat', fill: 'door', storey: 0 });
    // The basement's low windows at the foot of the front, where the stoop does not stand before them.
    if (cw.basement && F0 - 0.27 >= 0.38) {
      const covered: [number, number][] = st ? [[st.landing.s0, st.landing.s1], ...st.flights.map((f): [number, number] => (f.dir === 0 ? [st.landing.s0, st.landing.s1] : f.dir > 0 ? [f.s, f.s + f.steps * f.tread] : [f.s - f.steps * f.tread, f.s]))] : [];
      for (let j = 0; j < b.bays; j++) {
        const c = bays.centre(j), bw = ww * 0.8, s0 = c - bw / 2, s1 = c + bw / 2;
        if (j === cw.door || covered.some(([a, e]) => s1 > a - 0.1 && s0 < e + 0.1)) continue;
        openings.push({ s0, s1, y0: 0.1, y1: F0 - 0.17, head: 'flat', fill: 'cellar', storey: -1 });
      }
    }
  }

  // ---- the outline over the eaves, and the openings in it
  const after: (() => void)[] = [];
  let top: Pt[] = [], Etop = E, hoistAt: { s: number; y: number; out: number } | null = null;
  /** Rows of windows in the gable, on the lofts' floors, as many as its breadth allows at each; the highest middle one the hatch the hoist serves. */
  const lofts = (from: number, room = 0.3) => {
    const h = store ? 1.35 : 1.25, gw = Math.min(store ? 0.85 : 1.0, ww), out: Opening[] = [];
    for (let y0 = from; ; y0 += store ? 2.5 : 2.45) {
      const hatchH = store ? 1.55 : 1.45, avail = Math.min(halfAt(top, W, y0 + hatchH + room), halfAt(top, W, y0)) - 0.3;
      if (avail < 0.36) break;
      // (Where there is a hoist, a row is of an odd number, so that its middle opening is under the beam.)
      let n = Math.max(1, Math.min(3, Math.floor((2 * avail + 0.6) / (gw + 0.6))));
      if ((store || cw.hoist) && n % 2 === 0) n--;
      const sp = n > 1 ? Math.min(bays.pitch, (2 * avail - gw) / (n - 1)) : 0, w0 = Math.min(gw, 2 * avail);
      for (let i = 0; i < n; i++) {
        const c = mid + (i - (n - 1) / 2) * sp, middle = n % 2 === 1 && i === (n - 1) / 2;
        out.push({ s0: c - w0 / 2, s1: c + w0 / 2, y0, y1: y0 + (middle && (store || cw.hoist) ? hatchH : h), head: 'flat', fill: middle && store ? 'hatch' : 'loft', storey: N });
      }
    }
    // (The highest middle opening is the hatch under the hoist; below it, a house's are windows to the lofts.)
    const last = out.filter((o) => Math.abs((o.s0 + o.s1) / 2 - mid) < 0.01).sort((p, q) => q.y0 - p.y0)[0];
    for (const o of out) if (Math.abs((o.s0 + o.s1) / 2 - mid) < 0.01 && o !== last && !store) o.y1 = o.y0 + h;
    if (last && (store || cw.hoist)) { last.fill = 'hatch'; hoistAt = { s: mid, y: last.y1 + 0.32, out: 1.0 }; }
    openings.push(...out);
  };
  // A crown, on a level top from `s0` to `s1` at `y`: of the kind the document says, in the dressing's material.
  const crownOn = (kind: typeof cw.crown, s0: number, s1: number, y: number) => {
    const m = (s0 + s1) / 2, w = s1 - s0;
    after.push(() => k.on(front, tm, s0 - 0.14, s1 + 0.14, y - 0.04, y + 0.14, -0.2, T * 0.75, tc));
    const yb = y + 0.14;
    if (kind === 'triangle') {
      const h = Math.max(0.45, (w + 0.2) * 0.3);
      after.push(() => {
        k.prism(front, [[s0 - 0.08, yb], [s1 + 0.08, yb], [m, yb + h]], [[[s0 + 0.12, yb + 0.12], [m, yb + h - 0.16], [s1 - 0.12, yb + 0.12]]], -0.04, T * 0.7, tm, shade(tc, 0.96));
        k.prism(front, [[s0 + 0.12, yb + 0.12], [s1 - 0.12, yb + 0.12], [m, yb + h - 0.16]], [], 0.0, T * 0.7, tm, shade(tc, 0.9));
        for (const side of [-1, 1]) k.stick(front.P(m + side * (w / 2 + 0.16), yb + 0.02, T * 0.3), front.P(m, yb + h + 0.06, T * 0.3), T * 0.75 + 0.24, 0.13, tc, tm);
        if (orn >= 1) ball(k, front.P(m, yb + h + 0.06, T * 0.35), 0.16, tm, tc);
        if (orn >= 2) for (const side of [-1, 1]) vase(k, front.P(m + side * (w / 2 + 0.02), yb, T * 0.35), 0.14, tm, tc);
      });
      return;
    }
    if (kind === 'segment') {
      const rise = Math.max(0.35, (w + 0.2) * 0.3), outer = arc(s0 - 0.08, s1 + 0.08, yb, rise, 12), inner = arc(s0 + 0.14, s1 - 0.14, yb + 0.1, rise - 0.2, 12);
      after.push(() => {
        k.prism(front, [...outer.slice().reverse()], [[...inner]], -0.04, T * 0.7, tm, shade(tc, 0.96));
        k.prism(front, [...inner.slice().reverse()], [], 0.0, T * 0.7, tm, shade(tc, 0.9));
        for (let i = 0; i < outer.length - 1; i++) k.stick(front.P(outer[i][0], outer[i][1] + 0.04, T * 0.3), front.P(outer[i + 1][0], outer[i + 1][1] + 0.04, T * 0.3), T * 0.75 + 0.24, 0.12, tc, tm);
        if (orn >= 1) ball(k, front.P(m, yb + rise + 0.08, T * 0.35), 0.15, tm, tc);
        if (orn >= 2) for (const side of [-1, 1]) vase(k, front.P(m + side * (w / 2 + 0.02), yb, T * 0.35), 0.14, tm, tc);
      });
      return;
    }
    if (kind === 'scroll') {
      // A crest of two curves swelling up from scrolls at its ends to a little block in the middle, and a vase on that.
      const h = Math.max(0.6, w * 0.34), half = (q: number): Pt => { const t = q / 10; return [s0 - 0.05 + (m - 0.14 - s0 + 0.05) * t, yb + h * 0.8 * Math.sin((t * Math.PI) / 2)]; };
      // (Round from the left foot: along the foot, up the right curve, across the cap, down the left curve.)
      const lf = Array.from({ length: 11 }, (_, q) => half(q)), up = lf.map(([s, yy]): Pt => [2 * m - s, yy]);
      after.push(() => {
        k.prism(front, [lf[0], ...up, [m + 0.14, yb + h + 0.12], [m - 0.14, yb + h + 0.12], ...lf.slice(1).reverse()], [], -0.04, T * 0.7, tm, shade(tc, 0.95));
        for (const side of [-1, 1]) k.disc(front, m + side * (w / 2 - 0.02), yb + 0.2, 0.17, -0.1, T * 0.7, tm, tc, 0);
        vase(k, front.P(m, yb + h + 0.12, T * 0.35), 0.16, tm, tc);
      });
      return;
    }
    after.push(() => {
      k.on(front, tm, m - Math.min(w / 2, 0.5), m + Math.min(w / 2, 0.5), yb, yb + 0.28, -0.08, T * 0.7, shade(tc, 0.95));
      k.on(front, tm, m - Math.min(w / 2, 0.5) - 0.06, m + Math.min(w / 2, 0.5) + 0.06, yb + 0.28, yb + 0.36, -0.12, T * 0.75, tc);
      ball(k, front.P(m, yb + 0.36, T * 0.35), 0.18, tm, tc);
    });
  };
  /** A claw piece: carved stone filling the corner between a shoulder and a neck, from `a` low and outside to `c` high against the neck. */
  const claw = (a: Pt, c: Pt, side: -1 | 1) => {
    const pts: Pt[] = [];
    for (let q = 0; q <= 12; q++) {
      const t = q / 12, s = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * Math.sin((t * Math.PI) / 2) + 0.12 * Math.sin(t * Math.PI * 2) * (1 - t);
      pts.push([s, Math.max(y, roofAt(s) + 0.18)]);
    }
    return { pts, build: () => {
      const m = (p: Pt): Pt => (side < 0 ? p : [W - p[0], p[1]]);
      const low = pts.map(([s, y]): Pt => [s, Math.max(roofAt(s) + 0.05, y - 0.55)]);
      // (Counted round so that it encloses: up the curve, down the neck, back along the lower edge.)
      const ring = [...pts, [c[0], Math.max(roofAt(c[0]) + 0.05, c[1] - 0.7)] as Pt, ...low.slice(0, -1).reverse()].map(m);
      k.prism(front, side < 0 ? ring.slice().reverse() : ring, [], -0.07, T - 0.05, tm, tc);
      k.disc(front, m([a[0] + 0.12, a[1] + 0.1])[0], a[1] + 0.1, 0.16, -0.12, T - 0.05, tm, shade(tc, 0.95), 0);
      if (orn >= 2) k.disc(front, m([c[0] - 0.16, c[1] - 0.3])[0], c[1] - 0.3, 0.13, -0.12, T - 0.05, tm, shade(tc, 0.95), 0);
    } };
  };
  /** A shoulder: the end of the front at the foot of a gable that stands narrower, capped, and from the second degree of dressing on, with a vase or a ball on it. */
  const shoulder = (s0: number, s1: number, y: number) => after.push(() => {
    k.on(front, tm, s0 - 0.04, s1 + 0.04, y - 0.12, y + 0.04, -0.12, T + 0.04, tc);
    if (orn >= 2) vase(k, front.P((s0 + s1) / 2, y + 0.04, T * 0.4), 0.15, tm, tc);
    else if (orn >= 1) ball(k, front.P((s0 + s1) / 2, y + 0.04, T * 0.4), 0.15, tm, tc);
  });

  if (cw.gable === 'stepped') {
    // Steps all of a breadth, the middle one the crown; each step's top clear of the roof where its inner end meets it.
    const n = cw.tiers, a = W / (2 * n + 1), yS = (lev: number) => (lev >= n ? Math.max(ridge + 0.45, E + n * a * tan + 0.9) : E + (lev + 1) * a * tan + 0.22);
    for (let j = 0; j <= 2 * n; j++) {
      const lev = Math.min(j, 2 * n - j), s = j * a, e = (j + 1) * a, yt = yS(lev);
      top.push([s, yt], [e, yt]);
      if (lev < n) after.push(() => {
        k.on(front, tm, s - 0.06, e + 0.06, yt - 0.02, yt + 0.1, -0.08, T + 0.06, tc);
        if (orn >= 2) ball(k, front.P(j < n ? s + 0.14 : e - 0.14, yt + 0.1, T * 0.4), 0.13, tm, tc);
      });
    }
    lofts(E + 0.72, 0.35);
    crownOn(cw.crown, n * a, (n + 1) * a, yS(n));
  } else if (cw.gable === 'neck') {
    // Shoulders, claw pieces up to the neck, the neck, and the crown on it; with two tiers, a broader neck and a narrower one on it.
    const two = cw.tiers >= 2, sh = 0.36, yS = E + sh * tan + 0.18;
    const nw1 = two ? Math.min(W - 1.0, Math.max(3.0, W * 0.7)) : Math.min(Math.min(3.6, W - 1.2), Math.max(1.9, W * 0.44)), a1 = mid - nw1 / 2;
    const c1 = Math.max(1.1, a1 * tan + 0.4), yC1 = E + c1;
    // (The shoulders stand as high as the roof behind them, so that none of it shows over them.)
    const cl1 = claw([sh, yS], [a1, yC1], -1), cr1 = claw([sh, yS], [a1, yC1], 1);
    let yTop: number, aTop = a1;
    const leftPts: Pt[] = [[0, yS], ...cl1.pts.map(([s, y]): Pt => [s, y - 0.05])];
    after.push(cl1.build, cr1.build);
    shoulder(0, sh, yS); shoulder(W - sh, W, yS);
    if (two) {
      const nw2 = Math.min(3.4, Math.max(1.9, W * 0.42)), a2 = mid - nw2 / 2, y2 = yC1 + 2.35, sh2 = 0.32;
      const c2 = Math.max(0.95, E + a2 * tan + 0.4 - y2);
      leftPts.push([a1, y2]);
      const cl2 = claw([a1 + sh2, y2], [a2, y2 + c2], -1), cr2 = claw([a1 + sh2, y2], [a2, y2 + c2], 1);
      leftPts.push(...cl2.pts.map(([s, y]): Pt => [s, y - 0.05]));
      after.push(cl2.build, cr2.build);
      shoulder(a1, a1 + sh2, y2); shoulder(W - a1 - sh2, W - a1, y2);
      yTop = Math.max(ridge + 0.35, y2 + c2 + 1.75);
      aTop = a2;
    } else yTop = Math.max(ridge + 0.35, yC1 + 2.3);
    leftPts.push([aTop, yTop]);
    top = [...leftPts, ...leftPts.slice().reverse().map(([s, y]): Pt => [W - s, y])];
    // Strips up the neck's sides.
    if (orn >= 1) after.push(() => { for (const s of [aTop, W - aTop - 0.2]) k.on(front, tm, s, s + 0.2, yTop - 1.8, yTop - 0.05, -0.04, 0.05, tc); });
    lofts(E + 0.72, 0.8);
    crownOn(cw.crown, aTop, W - aTop, yTop);
  } else if (cw.gable === 'bell') {
    // From low shoulders the outline rises straight, curves in, and rises straight again to a narrow top: a bell's outline.
    const tw = Math.min(3.0, Math.max(1.5, W * 0.36)), stp = mid - tw / 2, sh = 0.3, yA = E + sh * tan + 0.18, yB = Math.max(ridge + 0.2, E + 3.4);
    const curve: Pt[] = [];
    let last = yA;
    for (let q = 0; q <= 18; q++) {
      const t = q / 18, s = sh + (stp - sh) * smooth(t);
      last = Math.max(last, yA + (yB - yA) * t, roofAt(s) + 0.18);
      curve.push([s, last]);
    }
    const left: Pt[] = [[0, yA], ...curve];
    top = [...left, ...left.slice().reverse().map(([s, y]): Pt => [W - s, y])];
    shoulder(0, sh, yA); shoulder(W - sh, W, yA);
    after.push(() => {
      // The curve edged with stone; a scroll at its foot; from the second degree, a garland hung from its middle.
      for (const side of [-1, 1]) {
        const m = (p: Pt): Pt => (side < 0 ? p : [W - p[0], p[1]]);
        for (let i = 0; i < curve.length - 1; i++) { const p = m(curve[i]), q = m(curve[i + 1]); k.stick(front.P(p[0], p[1] - 0.02, T * 0.45), front.P(q[0], q[1] - 0.02, T * 0.45), T + 0.16, 0.15, tc, tm); }
        const foot = m([sh + 0.18, yA + 0.32]);
        k.disc(front, foot[0], foot[1], 0.17, -0.1, T * 0.6, tm, tc, 0);
        if (orn >= 2) {
          const c = m(curve[9]);
          k.disc(front, c[0] + (side < 0 ? 0.32 : -0.32), c[1] - 0.15, 0.14, -0.08, T * 0.6, tm, tc, 0);
        }
      }
    });
    lofts(E + 0.72, 0.45);
    crownOn(cw.crown, stp, W - stp, yB);
  } else if (cw.gable === 'spout') {
    // A strip up the middle rising over the roof, and the slopes either side of it covered with tarred boards.
    const sw = Math.min(2.3, Math.max(1.3, W * 0.3)), a = mid - sw / 2, ya = roofAt(a) + 0.15, yTop = Math.max(ridge + 0.5, ya + 1.4);
    top = [[0, E], [a, ya], [a, yTop], [W - a, yTop], [W - a, ya], [W, E]];
    after.push(() => {
      for (const side of [-1, 1]) {
        const p0: Pt = side < 0 ? [-0.05, E - 0.04] : [W + 0.05, E - 0.04], p1: Pt = side < 0 ? [a + 0.02, ya + 0.04] : [W - a - 0.02, ya + 0.04];
        k.stick(front.P(p0[0], p0[1], T * 0.45), front.P(p1[0], p1[1], T * 0.45), T + 0.22, 0.3, TAR);
      }
    });
    lofts(E + 0.72, 0.25);
    crownOn(cw.crown === 'scroll' ? 'segment' : cw.crown, a, W - a, yTop);
  } else {
    // A cornice across the whole front: a frieze over the top windows, mouldings standing further out one over another, brackets
    // under them from the first degree of dressing on, and small windows to the attic in the frieze.
    const frieze = orn === 0 ? 0.55 : 0.75 + 0.1 * Math.min(orn, 2);
    Etop = E + frieze;
    top = [[0, Etop], [W, Etop]];
    if (frieze >= 0.8 && cw.gable === 'cornice' && orn <= 2) for (let j = 0; j < b.bays; j++) {
      const c = bays.centre(j), aw = Math.min(0.85, ww * 0.7);
      if (!(cw.hoist && W > 8.5 && j === b.bays >> 1)) openings.push({ s0: c - aw / 2, s1: c + aw / 2, y0: E + 0.16, y1: Etop - 0.3, head: 'flat', fill: 'loft', storey: N });
    }
    after.push(() => {
      k.on(front, tm, -0.02, W + 0.02, Etop - 0.32, Etop - 0.2, -0.06, 0.05, tc);
      k.on(front, tm, -0.04, W + 0.04, Etop - 0.2, Etop + 0.03, -0.44, T * 0.5, tc);
      k.on(front, tm, -0.05, W + 0.05, Etop + 0.03, Etop + 0.13, -0.52, T * 0.5, shade(tc, 0.94));
      if (orn >= 1) {
        // (Brackets: a curved profile drawn in a wall square to the front, carried across a few centimetres of its breadth.)
        const n = Math.max(2, Math.round(W / 0.8)), pitch = W / n;
        for (let i = 0; i <= n; i++) {
          const s = Math.min(W - 0.1, Math.max(0.1, i * pitch)), u = s - mid, f = k.faceFrom(u, 0, u, -1);
          const prof: Pt[] = [[0, Etop - 0.62], [0.07, Etop - 0.62]];
          for (let q = 1; q <= 6; q++) { const t = q / 6; prof.push([0.07 + 0.33 * t * t, Etop - 0.62 + 0.42 * t]); }
          prof.push([0, Etop - 0.2]);
          k.prism(f, prof.reverse(), [], -0.07, 0.07, tm, shade(tc, 0.92));
        }
      }
      if (orn >= 3 && cw.gable === 'cornice') balustrade(k, front, W, Etop + 0.13, T, tm, tc);
    });
    if (cw.gable === 'raised') {
      // A panel over the middle, on the cornice: its own cornice and crown, scrolls either side of its foot, the hatch in it.
      const aw = Math.min(4.4, Math.max(1.9, W * 0.42)), ah = orn >= 2 ? 2.25 : 1.7, a = mid - aw / 2, yP = Etop + ah;
      top = [[0, Etop], [a, Etop], [a, yP], [W - a, yP], [W - a, Etop], [W, Etop]];
      const ho = cw.hoist ? 1.35 : 0.95, hw = Math.min(0.95, aw - 0.8);
      openings.push({ s0: mid - hw / 2, s1: mid + hw / 2, y0: Etop + 0.2, y1: Math.min(Etop + 0.2 + ho, yP - 0.35), head: 'flat', fill: cw.hoist ? 'hatch' : 'loft', storey: N });
      if (cw.hoist) hoistAt = { s: mid, y: Math.min(Etop + 0.2 + ho, yP - 0.35) + 0.25, out: 1.0 };
      after.push(() => {
        k.on(front, tm, a - 0.1, W - a + 0.1, yP - 0.18, yP + 0.02, -0.22, T * 0.6, tc);
        for (const s of [a, W - a - 0.22]) k.on(front, tm, s, s + 0.22, Etop + 0.13, yP - 0.18, -0.05, 0.05, tc);
        if (orn >= 1) for (const side of [-1, 1]) {
          // (Each scroll a quarter of a curve from the cornice up the panel's side, with an eye at its foot.)
          const s0 = side < 0 ? a - 0.95 : W - a + 0.95, s1 = side < 0 ? a : W - a, pts: Pt[] = [[s0, Etop + 0.13]];
          for (let q = 1; q <= 10; q++) { const t = q / 10; pts.push([s0 + (s1 - s0) * t, Etop + 0.13 + (ah * 0.72) * Math.sin((t * Math.PI) / 2)]); }
          pts.push([s1, Etop + 0.13]);
          k.prism(front, side < 0 ? pts.slice().reverse() : pts, [], -0.06, T * 0.6, tm, tc);
          k.disc(front, s0 + side * -0.18, Etop + 0.33, 0.16, -0.12, T * 0.6, tm, shade(tc, 0.94), 0);
        }
      });
      crownOn(cw.crown, a, W - a, yP + 0.02);
    }
  }

  // An oval window under the crown, from the second degree, where there is room over the highest opening; and the hoist kept under the crown.
  const topMid = Math.max(...top.filter(([s]) => s > 0.01 && s < W - 0.01 && Math.abs(s - mid) < W / 2).map(([, y]) => y), Etop);
  // (Over the highest opening in the middle of the front: a front of an even number of bays with no loft in its gable has none there,
  // and has no oval either.)
  const middles = openings.filter((o) => Math.abs((o.s0 + o.s1) / 2 - mid) < 0.05);
  if (orn >= 2 && !cornice && middles.length) {
    const hi = Math.max(...middles.map((o) => o.y1)), room = halfAt(top, W, hi + 1.1);
    if (room > 0.55 && topMid - hi > (hoistAt ? 1.65 : 1.0)) {
      const y = hi + (hoistAt ? 1.15 : 0.55), r = 0.25;
      openings.push({ s0: mid - r, s1: mid + r, y0: y - r, y1: y + r, head: 'round', fill: 'oculus', storey: N, ring: Array.from({ length: 16 }, (_, i): Pt => [mid + Math.cos((i / 16) * Math.PI * 2) * r, y + Math.sin((i / 16) * Math.PI * 2) * r]) });
      if (hoistAt) hoistAt = { ...hoistAt, y: Math.min(hoistAt.y, y - 0.8) };
    }
  }
  if (hoistAt) hoistAt = { ...hoistAt, y: Math.min(hoistAt.y, topMid - 0.25) };

  // ---- the front made solid: its outline, with every opening a hole through it
  const outline: Pt[] = [[0, -0.45], [W, -0.45], ...top.slice().reverse()];
  // (No two points the same, or the figure will not triangulate.)
  const clean = outline.filter((p, i) => { const q = outline[(i + outline.length - 1) % outline.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  k.prism(front, clean, openings.map((o) => o.ring ?? shapeOf(o)), 0, T, material, colour);
  after.forEach((f) => f());

  // ---- what fills the openings
  const deep = 0.16;
  // (Each window's neighbours on its storey: for shutters that fold back against the wall, and for the room they have.)
  const rowOf = (o: Opening) => openings.filter((p) => p.storey === o.storey && (p.fill === 'window' || p.fill === 'door') && p !== o);
  for (const o of openings) {
    if (o.fill === 'window' || o.fill === 'loft') {
      window_(k, front, o, cw.frame, o.fill === 'loft' ? 'small' : store ? 'store' : cw.windows, deep, cw.shutters);
      k.on(front, tm === 'plaster' && !painted ? 'stone' : tm, o.s0 - 0.07, o.s1 + 0.07, o.y0 - 0.1, o.y0 + 0.01, -0.07, deep + 0.02, tm === 'plaster' && !painted ? BLUE : tc);
      // Shutters folded back against the wall beside a ground-storey window, where there is room for both leaves.
      if (cw.shutters && !store && cw.windows !== 'cross' && o.storey === 0 && o.fill === 'window') {
        const lw = (o.s1 - o.s0) / 2, row = rowOf(o);
        const room = (side: -1 | 1) => { const n = row.filter((p) => (side < 0 ? p.s1 < o.s0 : p.s0 > o.s1)).map((p) => (side < 0 ? o.s0 - p.s1 : p.s0 - o.s1)); const gap = n.length ? Math.min(...n) - lw : side < 0 ? o.s0 : W - o.s1; return gap >= lw + 0.06; };
        if (room(-1) && room(1)) for (const [a, c] of [[o.s0 - lw - 0.03, o.s0 - 0.03], [o.s1 + 0.03, o.s1 + lw + 0.03]]) leaf(k, front, a, c, o.y0, o.y1, -0.07, -0.03, cw.shutters);
      }
    } else if (o.fill === 'hatch') hatchLeaves(k, front, o, deep, shutterOf, store ? cw.frame : null);
    else if (o.fill === 'cellar') {
      k.glazed(front, o, 2, 1, cw.frame, 0.22);
      for (let s = o.s0 + 0.1; s < o.s1 - 0.05; s += 0.13) k.stick(front.P(s, o.y0, 0.06), front.P(s, o.y1, 0.06), 0.025, 0.025, IRON, 'metal');
    } else if (o.fill === 'door') {
      // (A house that can be entered stands with its door open.)
      if (store && enter) openLeaves(k, front, o.s0, o.s1, o.y0, o.y1 - riseOf(o.s1 - o.s0, o.head), T - 0.16, shutterOf, true);
      else if (store) hatchLeaves(k, front, o, T - 0.16, shutterOf, cw.frame);
      else houseDoor(k, front, o, deep + 0.04, cw.paint, cw.frame, orn, enter ? hinge : 0);
    } else if (o.fill === 'pui') pui(k, front, b, o, door, rng, enter ? hinge : 0);
    else if (o.fill === 'oculus') {
      const y = (o.y0 + o.y1) / 2, r = (o.s1 - o.s0) / 2;
      k.disc(front, mid, y, r + 0.1, -0.06, 0.08, tm, tc, r);
      k.disc(front, mid, y, r + 0.01, 0.2, 0.23, 'glass', PANE, 0);
      k.on(front, 'wood', mid - 0.02, mid + 0.02, y - r, y + r, 0.16, 0.2, cw.frame);
      k.on(front, 'wood', mid - r, mid + r, y - 0.02, y + 0.02, 0.16, 0.2, cw.frame);
    }
  }

  // ---- what is laid on the front
  const bandAt = (y0: number, y1: number, out: number, mat: string, col: Colour, s0 = -0.02, s1 = W + 0.02) => { for (const [a, c] of spans(openings, s0, s1, y0, y1)) k.on(front, mat, a, c, y0, y1, -out, 0.04, col); };
  // The plinth, of bluestone, broken where an opening comes down through it.
  bandAt(-0.45, Math.min(PL, F0 > PL ? PL : F0 - 0.02), 0.06, 'stone', BLUE);
  // Bands at the floors, and at the eaves of a gable; on a front without dressings, none.
  if (orn >= 1 || painted) for (let s = 1; s < N; s++) bandAt(floor(s) - 0.06, floor(s) + 0.1, 0.05, tm, tc);
  if (!cornice && (orn >= 1 || painted)) bandAt(E - 0.1, E + 0.05, 0.07, tm, tc, -0.02, W + 0.02);
  // Bands of stone across the brick of a stepped gable's front, two or three courses apart, as the oldest fronts have them.
  if (cw.gable === 'stepped' && orn >= 2 && !painted) for (let y = floor(1) + 0.55; y < E - 0.3; y += 0.62) bandAt(y, y + 0.1, 0.012, tm, tc, 0.02, W - 0.02);
  for (const o of openings) {
    if (o.fill !== 'window' && o.fill !== 'hatch' && !(o.fill === 'door' && !store)) continue;
    if (o.y0 > E + 0.2 && o.fill !== 'window') continue;
    const m = (o.s0 + o.s1) / 2, ow = o.s1 - o.s0;
    if (painted) {
      // Surrounds on a painted front; from the first degree, a cornice over the windows of the two lowest storeys.
      if (o.fill === 'door') continue;
      for (const [a, c] of [[o.s0 - 0.12, o.s0], [o.s1, o.s1 + 0.12]]) k.on(front, tm, a, c, o.y0 - 0.02, o.y1 + 0.12, -0.04, 0.03, tc);
      k.on(front, tm, o.s0 - 0.12, o.s1 + 0.12, o.y1, o.y1 + 0.12, -0.04, 0.03, tc);
      if (orn >= 1 && o.storey <= 1 && o.fill === 'window') k.on(front, tm, o.s0 - 0.22, o.s1 + 0.22, o.y1 + 0.12, o.y1 + 0.24, -0.14, 0.03, tc);
      continue;
    }
    if (o.head === 'segment') {
      // (Over an arched opening, an arch of bricks on end following it.)
      const spring = o.y1 - riseOf(ow, 'segment'), lower = arc(o.s0 - 0.08, o.s1 + 0.08, spring, riseOf(ow, 'segment') + 0.02, 8);
      const band: Pt[] = [[o.s1 + 0.08, spring], ...lower.slice(1, -1), [o.s0 - 0.08, spring], [o.s0 - 0.08, spring + 0.22], ...lower.slice(1, -1).reverse().map(([s, y]): Pt => [s, y + 0.22]), [o.s1 + 0.08, spring + 0.22]];
      k.prism(front, band, [], -0.02, 0.05, 'brick', shade(brick, 1.1));
      continue;
    }
    if (o.fill === 'door') {
      if (orn === 0) k.on(front, 'brick', o.s0 - 0.1, o.s1 + 0.1, o.y1, o.y1 + 0.22, -0.02, 0.05, shade(brick, 1.12));
      continue;
    }
    if (cw.windows === 'cross' && orn >= 1 && o.storey >= 0 && o.y1 < E) {
      // A relieving arch over the window, its tympanum filled with stone and a shell carved in it.
      const rise = Math.min(0.32, ow * 0.24), outer = arc(o.s0 - 0.12, o.s1 + 0.12, o.y1, rise + 0.22, 10), inner = arc(o.s0, o.s1, o.y1, rise, 10);
      k.prism(front, [[o.s0 - 0.12, o.y1], ...inner.slice().reverse(), [o.s1 + 0.12, o.y1], ...outer.slice(1, -1)], [], -0.02, 0.05, 'brick', shade(brick, 1.1));
      k.prism(front, [[o.s0, o.y1], [o.s1, o.y1], ...inner.slice(1, -1)], [], -0.015, 0.05, tm, tc);
      for (let q = 1; q < 6; q++) { const a = (Math.PI * q) / 6; k.stick(front.P(m, o.y1 + 0.02, -0.03), front.P(m + Math.cos(a) * ow * 0.3, o.y1 + 0.02 + Math.sin(a) * rise * 0.8, -0.03), 0.03, 0.05, shade(tc, 0.9), tm); }
      continue;
    }
    // A flat arch of bricks on end over the window; from the first degree a keystone in it, from the second a lintel of stone with a cornice over the lowest storeys.
    if (orn >= 2 && o.fill === 'window') {
      k.on(front, tm, o.s0 - 0.1, o.s1 + 0.1, o.y1, o.y1 + 0.2, -0.03, 0.05, tc);
      k.on(front, tm, m - 0.11, m + 0.11, o.y1 - 0.03, o.y1 + 0.26, -0.07, 0.05, shade(tc, 1.04));
      if (o.storey <= 1) k.on(front, tm, o.s0 - 0.2, o.s1 + 0.2, o.y1 + 0.2, o.y1 + 0.31, -0.15, 0.05, tc);
    } else {
      k.on(front, 'brick', o.s0 - 0.1, o.s1 + 0.1, o.y1, o.y1 + 0.22, -0.02, 0.05, shade(brick, 1.12));
      if (orn >= 1) k.on(front, tm, m - 0.1, m + 0.1, o.y1 - 0.02, o.y1 + 0.27, -0.05, 0.05, tc);
    }
  }
  // Garlands hung under the windows of the first floor, from the second degree; and pilasters between the bays, from the third.
  if (orn >= 2) for (const o of openings) {
    if (o.fill !== 'window' || o.storey !== 1) continue;
    const yt = o.y0 - 0.14, yb = floor(1) + 0.16;
    if (yt - yb < 0.24) continue;
    garland(k, front, o.s0 + 0.08, o.s1 - 0.08, yt, Math.min(0.32, (yt - yb) * 0.8), tm, tc);
  }
  if (orn >= 3) {
    const at = Array.from({ length: b.bays + 1 }, (_, j) => (j === 0 ? bays.margin * 0.5 : j === b.bays ? W - bays.margin * 0.5 : bays.margin + j * bays.pitch));
    const pw = Math.min(0.32, bays.margin * 0.75, (bays.pitch - ww) * 0.6);
    for (let s = 1; s < N; s++) for (const c of at) {
      const y0 = floor(s) + 0.1, y1 = s === N - 1 && cornice ? E - 0.04 : floor(s + 1) - 0.06;
      k.on(front, tm, c - pw / 2, c + pw / 2, y0, y1 - 0.2, -0.05, 0.04, tc);
      k.on(front, tm, c - pw / 2 - 0.04, c + pw / 2 + 0.04, y0, y0 + 0.14, -0.08, 0.04, shade(tc, 0.95));
      k.on(front, tm, c - pw / 2 - 0.06, c + pw / 2 + 0.06, y1 - 0.2, y1, -0.1, 0.04, shade(tc, 1.04));
    }
  }
  // Iron anchors at the floors, holding the front to the beams behind it.
  if (!painted) for (let s = 1; s <= N; s++) for (const a of [0.26, W - 0.26]) {
    const y = s === N ? E - 0.4 : floor(s) + 0.2;
    k.on(front, 'metal', a - 0.025, a + 0.025, y - 0.24, y + 0.24, -0.04, 0.01, IRON);
    k.on(front, 'metal', a - 0.1, a + 0.1, y - 0.022, y + 0.022, -0.05, -0.035, IRON);
  }

  // ---- the hoist: a beam out over the street above the top hatch, its hook, and on a warehouse or a dressed house a little hood over it
  const roofSpans: [number, number][] = W > 8.5 && cornice ? [[-mid, 0], [0, mid]] : [[-mid, mid]];
  if (cw.hoist && !hoistAt && cornice && roofSpans.length > 1) hoistAt = { s: mid, y: Etop - 0.42, out: 0.9 };
  if (cw.hoist && cw.gable === 'cornice' && roofSpans.length === 1) hoistAt = null;
  if (hoistAt) hoist(k, front, hoistAt, T, store || orn >= 1, cw.frame);

  // ---- the side walls, plain, against the neighbours; and the back
  const wallTop = E;
  for (const f of [right, left]) {
    k.on(f, 'brick', T - 0.01, D - S + 0.01, -0.45, wallTop, 0, S, brick);
    for (let s = 1; s < N; s++) for (const a of [D * 0.3, D * 0.7]) k.on(f, 'metal', a - 0.025, a + 0.025, floor(s) - 0.25, floor(s) + 0.3, -0.04, 0.01, IRON);
  }
  {
    // (One to a bay, behind the front's, so that a wall inside that stands between two bays never meets one; and moved off any that does.)
    const gaps: Hole[] = [], sh = canalShell(b);
    for (let s = 0; s < N; s++) for (const [u0, u1] of canalBackWindows(b, s)) gaps.push({ s0: W / 2 - u1, s1: W / 2 - u0, y0: (s ? floor(s) : F0) + 0.8, y1: floor(s + 1) - 0.45, head: 'flat' });
    // (A figure with its windows cut through it, a row of them to a storey.)
    k.prism(back, [[0, -0.45], [W, -0.45], [W, wallTop], [0, wallTop]], gaps.map(shapeOf), 0, S, 'brick', brick);
    for (const gp of gaps) { k.glazed(back, gp, 2, 3, cw.frame, 0.16); k.on(back, 'stone', gp.s0 - 0.05, gp.s1 + 0.05, gp.y0 - 0.08, gp.y0, -0.06, 0.18, BLUE); }
    // ---- inside, if it can be entered
    if (b.plan) buildInterior(k, b.plan, sh, N, { W, front: openings.map((o) => o.ring ?? shapeOf(o)), back: gaps.map(shapeOf), ground: 'boards' });
  }

  // ---- the roofs: ridged from front to back, from behind the front to just past the back; hipped at the front behind a cornice
  const cover: [string, Colour] = ['tile', cw.roof === 'dark' ? [0.34, 0.32, 0.34] : [0.84, 0.6, 0.52]], under = shade(OAK, 0.8), into = back.P(0, 0, S).sub(back.P(0, 0, 0));
  const v0 = T - 0.02, v1 = D + 0.22;
  for (const [ua, ub] of roofSpans) {
    const w2 = ub - ua, uc = (ua + ub) / 2, rY = E + (w2 / 2) * tan, at = k.at;
    if (cornice) {
      const Ey = Math.min(Etop - 0.12, rY - 0.3), h = (Ey - E) / tan, vh = v0 + w2 / 2 - h;
      sheet(k, [at(ua, E, v0), at(ua + h, Ey, v0), at(uc, rY, vh), at(uc, rY, v1), at(ua, E, v1)], cover, under);
      sheet(k, [at(ub, E, v1), at(uc, rY, v1), at(uc, rY, vh), at(ub - h, Ey, v0), at(ub, E, v0)], cover, under);
      sheet(k, [at(ua + h, Ey, v0), at(ub - h, Ey, v0), at(uc, rY, vh)], cover, under);
      k.box('tile', uc - 0.12, uc + 0.12, rY - 0.06, rY + 0.08, vh, v1, shade(cover[1], 0.85));
      // A dormer in the hip over a single roof, with the hatch the hoist serves.
      if (cw.hoist && roofSpans.length === 1 && cw.gable === 'cornice') {
        const vd = v0 + 0.32, yb = Ey + (vd - v0) * tan, dh = 1.65, dw2 = Math.min(0.75, (w2 - 2 * h - 0.7) / 2 - 0.3);
        if (dw2 > 0.4) {
          const vEnd = v0 + (yb + dh - Ey) / tan + 0.1, vTop = v0 + (yb + dh + 0.55 - Ey) / tan + 0.05, df = k.faceFrom(uc - dw2, vd, uc + dw2, vd), paintD = painted ? tc : cw.frame;
          k.on(df, 'wood', -0.06, 2 * dw2 + 0.06, yb - 0.6, yb + dh, 0, vEnd - vd, paintD, true);
          const g: Opening = { s0: 0.18, s1: 2 * dw2 - 0.18, y0: yb + 0.12, y1: yb + dh - 0.2, head: 'flat', fill: 'hatch', storey: N };
          hatchLeaves(k, df, g, -0.04, shutterOf, null);
          const dInto = df.P(0, 0, vTop - vd + 0.12).sub(df.P(0, 0, 0));
          k.wedge(df.P(-0.16, yb + dh, -0.12), df.P(2 * dw2 + 0.16, yb + dh, -0.12), df.P(dw2, yb + dh + 0.55, -0.12), dInto, cover, [tm, paintD], ['wood', under]);
          hoist(k, df, { s: dw2, y: yb + dh - 0.06, out: 1.0 }, 0.1, false, cw.frame);
        }
      }
    } else {
      const ov = 0.08;
      k.slope([at(ua - ov, E - ov * tan, v0), at(ua - ov, E - ov * tan, v1), at(uc, rY, v1), at(uc, rY, v0)], cover, under);
      k.slope([at(ub + ov, E - ov * tan, v0), at(ub + ov, E - ov * tan, v1), at(uc, rY, v1), at(uc, rY, v0)], cover, under);
      k.box('tile', uc - 0.12, uc + 0.12, rY - 0.06, rY + 0.08, v0, v1, shade(cover[1], 0.85));
    }
    // The back gable, plain, with a window to the lofts.
    const bs0 = mid - ub, bs1 = mid - ua;
    k.wedge(back.P(bs0, E, 0), back.P(bs1, E, 0), back.P((bs0 + bs1) / 2, rY - 0.1, 0), into, ['brick', brick], ['brick', brick]);
    if (rY - E > 2.2) k.glazed(back, { s0: (bs0 + bs1) / 2 - 0.35, s1: (bs0 + bs1) / 2 + 0.35, y0: E + 0.6, y1: E + 1.5 }, 2, 2, cw.frame, -0.03);
    // A chimney through the ridge toward the back.
    const v = D * rng.range(0.55, 0.78), u = uc + rng.range(-0.2, 0.2);
    k.box('brick', u - 0.3, u + 0.3, rY - 1.2, rY + 0.95, v - 0.4, v + 0.4, shade(brick, 0.95));
    k.box('brick', u - 0.38, u + 0.38, rY + 0.95, rY + 1.07, v - 0.48, v + 0.48, shade(brick, 0.8));
    tops?.push(k.at(u, rY + 1.07, v));
  }
}

// ---------------------------------------------------------------------------------------------
// The parts.

/** A sheet of roof through any number of corners, covered on top and boarded beneath. */
function sheet(k: BrickKit, pts: Vector3[], cover: [string, Colour], under: Colour, thick = 0.16) {
  const n = new Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0])).normalize();
  if (n.y < 0) n.negate();
  const low = pts.map((p) => p.clone().addScaledVector(n, -thick)), mid = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length);
  k.poly(cover[0], pts, cover[1], n, false, cover[0] === 'tile' ? 0.62 : 0.5);
  k.poly('wood', low, under, n.clone().negate(), true, 0.9);
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; k.poly('wood', [pts[i], pts[j], low[j], low[i]], under, pts[i].clone().add(pts[j]).multiplyScalar(0.5).sub(mid), true, 0.9); }
}

/** A ball on a short stem, as stands on the steps and pediments of the old gables. */
function ball(k: BrickKit, p: Vector3, r: number, mat: string, col: Colour) {
  k.shaft(p, r * 0.45, r * 0.5, 8, 0, mat, shade(col, 0.95));
  k.shaft(above(p, r * 0.5), r * 0.7, r * 0.3, 8, 0, mat, col);
  k.shaft(above(p, r * 0.8), r, r * 0.9, 8, Math.PI / 8, mat, col);
  k.pyramid(above(p, r * 1.7), r * 0.92, r * 0.55, 8, Math.PI / 8, mat, col);
}

/** A vase: a foot, a swelling body, a neck and a flame-shaped lid. */
function vase(k: BrickKit, p: Vector3, r: number, mat: string, col: Colour) {
  k.shaft(p, r * 0.7, r * 0.3, 8, 0, mat, shade(col, 0.94));
  k.shaft(above(p, r * 0.3), r * 0.4, r * 0.3, 8, 0, mat, col);
  k.shaft(above(p, r * 0.6), r, r * 1.1, 8, Math.PI / 8, mat, col);
  k.shaft(above(p, r * 1.7), r * 0.55, r * 0.25, 8, 0, mat, shade(col, 0.96));
  k.pyramid(above(p, r * 1.95), r * 0.6, r * 0.9, 8, Math.PI / 8, mat, col);
}

/** A garland hung on a wall from `s0` to `s1` at `y`, sagging `sag` in the middle, thickest there, with a drop at each end. */
function garland(k: BrickKit, f: Face, s0: number, s1: number, y: number, sag: number, mat: string, col: Colour) {
  const n = 10, pt = (i: number): Pt => { const t = i / n; return [s0 + (s1 - s0) * t, y - sag * Math.sin(t * Math.PI)]; };
  for (let i = 0; i < n; i++) {
    const a = pt(i), c = pt(i + 1), thick = 0.06 + 0.08 * Math.sin(((i + 0.5) / n) * Math.PI);
    k.stick(f.P(a[0], a[1], -0.04), f.P(c[0], c[1], -0.04), thick, thick, col, mat);
  }
  for (const s of [s0, s1]) {
    k.stick(f.P(s, y + 0.04, -0.03), f.P(s, y - sag * 0.8, -0.03), 0.06, 0.07, col, mat);
    k.disc(f, s, y + 0.06, 0.06, -0.06, 0.02, mat, col, 0);
  }
}

/** A balustrade over a cornice: posts, a vase on each, short turned balusters between, and a rail. */
function balustrade(k: BrickKit, f: Face, W: number, y: number, T: number, mat: string, col: Colour) {
  const h = 0.72, posts = Math.max(2, Math.round(W / 2.2) + 1), pitch = (W - 0.3) / (posts - 1);
  for (let i = 0; i < posts; i++) {
    const s = 0.15 + i * pitch;
    k.on(f, mat, s - 0.15, s + 0.15, y, y + h, -0.12, T * 0.6, col);
    vase(k, f.P(s, y + h + 0.06, T * 0.25), 0.15, mat, col);
    k.on(f, mat, s - 0.18, s + 0.18, y + h, y + h + 0.06, -0.15, T * 0.63, shade(col, 0.95));
    if (i === posts - 1) continue;
    for (let s1 = s + 0.32; s1 < s + pitch - 0.26; s1 += 0.2) {
      const c = f.P(s1, y + 0.08, T * 0.25);
      k.shaft(c, 0.05, h - 0.18, 6, 0, mat, col);
      k.shaft(above(c, 0.14), 0.08, 0.2, 6, 0, mat, col);
    }
    k.on(f, mat, s + 0.15, s + pitch - 0.15, y, y + 0.08, -0.06, T * 0.55, col);
    k.on(f, mat, s + 0.15, s + pitch - 0.15, y + h - 0.1, y + h, -0.08, T * 0.57, col);
  }
}

/** A flat leaf, framed, with a sunk panel: a shutter. */
function leaf(k: BrickKit, f: Face, s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, paint: Colour) {
  k.on(f, 'wood', s0, s1, y0, y1, t0, t1, paint, true);
  const inset = Math.min(0.09, (s1 - s0) * 0.18);
  if (y1 - y0 > 0.5) for (const [a, c] of [[y0 + inset, (y0 + y1) / 2 - inset / 2], [(y0 + y1) / 2 + inset / 2, y1 - inset]]) k.on(f, 'wood', s0 + inset, s1 - inset, a, c, t0 - 0.012, t0 + 0.01, shade(paint, 0.8), true);
}

/**
 * Glass in an opening, as the canal houses have it: `small`, two sashes of small panes; `large`,
 * two of one pane each; `cross`, a mullion and a transom, small panes above and shutters (or glass)
 * below; `store`, a warehouse's, glass above and a shutter below. Arched heads have a pane of their own.
 */
function window_(k: BrickKit, f: Face, o: Opening, frame: Colour, style: 'small' | 'large' | 'cross' | 'store', deep: number, shutters: Colour | null) {
  const w = o.s1 - o.s0, h = o.y1 - o.y0, mid = (o.s0 + o.s1) / 2;
  if (o.head !== 'flat') {
    if (style === 'store' && shutters) {
      glaze(k, f, { ...o, y0: o.y0 + h * 0.5 }, 2, 1, frame, deep);
      leaf(k, f, o.s0, mid - 0.01, o.y0, o.y0 + h * 0.5, deep, deep + 0.06, shutters);
      leaf(k, f, mid + 0.01, o.s1, o.y0, o.y0 + h * 0.5, deep, deep + 0.06, shutters);
    } else glaze(k, f, o, 2, 3, frame, deep);
    return;
  }
  if (style === 'cross') {
    const ty = o.y0 + h * 0.6;
    k.glazed(f, { s0: o.s0, s1: mid, y0: ty, y1: o.y1 }, 2, 2, frame, deep);
    k.glazed(f, { s0: mid, s1: o.s1, y0: ty, y1: o.y1 }, 2, 2, frame, deep);
    if (shutters) for (const [a, c] of [[o.s0, mid], [mid, o.s1]]) leaf(k, f, a + 0.02, c - 0.02, o.y0 + 0.02, ty - 0.02, deep + 0.01, deep + 0.07, shutters);
    else { k.glazed(f, { s0: o.s0, s1: mid, y0: o.y0, y1: ty }, 2, 2, frame, deep); k.glazed(f, { s0: mid, s1: o.s1, y0: o.y0, y1: ty }, 2, 2, frame, deep); }
    k.on(f, 'wood', mid - 0.05, mid + 0.05, o.y0, o.y1, deep - 0.03, deep + 0.09, frame, true);
    k.on(f, 'wood', o.s0, o.s1, ty - 0.05, ty + 0.05, deep - 0.03, deep + 0.09, frame, true);
    return;
  }
  if (style === 'store') {
    const sy = o.y0 + h * 0.5;
    k.glazed(f, { ...o, y0: sy }, 2, 1, frame, deep);
    if (shutters) { leaf(k, f, o.s0 + 0.02, mid - 0.01, o.y0 + 0.02, sy, deep, deep + 0.06, shutters); leaf(k, f, mid + 0.01, o.s1 - 0.02, o.y0 + 0.02, sy, deep, deep + 0.06, shutters); }
    else k.glazed(f, { ...o, y1: sy }, 2, 1, frame, deep);
    return;
  }
  // Sashes: the upper standing a little in front of the lower, and the rail where they meet heavier.
  const meet = o.y0 + h * 0.52, across = style === 'large' ? 1 : w > 0.95 ? 3 : 2;
  const down = (hh: number) => (style === 'large' ? 1 : hh > 1.0 ? 3 : 2);
  k.glazed(f, { s0: o.s0, s1: o.s1, y0: o.y0, y1: meet }, across, down(meet - o.y0), frame, deep + 0.03);
  k.glazed(f, { s0: o.s0, s1: o.s1, y0: meet, y1: o.y1 }, across, down(o.y1 - meet), frame, deep);
  if (style === 'large' && h > 2.0) k.on(f, 'wood', o.s0, o.s1, o.y1 - 0.5, o.y1 - 0.45, deep + 0.01, deep + 0.07, frame, true);
  k.on(f, 'wood', o.s0 - 0.04, o.s1 + 0.04, o.y0 - 0.02, o.y1 + 0.03, deep + 0.09, deep + 0.11, frame, true);
}

/**
 * A pair of leaves filling a hatch or a warehouse's door: each framed, and, where `two` is given,
 * painted in the hourglass of the warehouses, two triangles of that colour meeting in the middle
 * of the leaf. The head may be arched: each leaf is then its half of the opening's figure.
 */
function hatchLeaves(k: BrickKit, f: Face, o: Hole, deep: number, paint: Colour, two: Colour | null) {
  const shape = shapeOf(o), mid = (o.s0 + o.s1) / 2;
  for (const side of [-1, 1] as const) {
    const half = clipAt(shape, mid + side * 0.008, side);
    k.prism(f, half, [], deep, deep + 0.07, 'wood', paint);
    const a = side < 0 ? o.s0 : mid, c = side < 0 ? mid : o.s1, top = o.head === 'flat' ? o.y1 : o.y1 - riseOf(o.s1 - o.s0, o.head);
    if (two) {
      const i = 0.08, cy = (o.y0 + top) / 2, cs = (a + c) / 2;
      k.prism(f, [[a + i, top - i], [cs, cy + 0.04], [c - i, top - i]].reverse() as Pt[], [], deep - 0.012, deep + 0.01, 'wood', two);
      k.prism(f, [[a + i, o.y0 + i], [c - i, o.y0 + i], [cs, cy - 0.04]], [], deep - 0.012, deep + 0.01, 'wood', two);
    }
    // The leaf's frame, standing a little proud.
    for (const [s0, s1] of [[a + 0.01, a + 0.06], [c - 0.06, c - 0.01]]) k.on(f, 'wood', s0, s1, o.y0 + 0.01, top - 0.01, deep - 0.02, deep + 0.02, shade(paint, 0.85), true);
    for (const y of [o.y0 + 0.01, top - 0.06]) k.on(f, 'wood', a + 0.01, c - 0.01, y, y + 0.05, deep - 0.02, deep + 0.02, shade(paint, 0.85), true);
  }
}

/**
 * The door of a house: a leaf of raised panels, with a knob and a letterbox of brass, under a
 * fanlight whose bars spread from the middle of its foot; from the first degree of dressing, a door
 * case of pilasters and a cornice about it, and from the second a pediment on that.
 */
function houseDoor(k: BrickKit, f: Face, o: Opening, deep: number, paint: Colour, frame: Colour, orn: number, open: -1 | 0 | 1 = 0) {
  const w = o.s1 - o.s0, mid = (o.s0 + o.s1) / 2, yL = Math.min(o.y0 + 2.35, o.y1 - 0.5);
  k.on(f, 'wood', o.s0, o.s0 + 0.07, o.y0, o.y1, deep - 0.03, deep + 0.12, frame, true);
  k.on(f, 'wood', o.s1 - 0.07, o.s1, o.y0, o.y1, deep - 0.03, deep + 0.12, frame, true);
  k.on(f, 'wood', o.s0, o.s1, yL, yL + 0.1, deep - 0.03, deep + 0.12, frame, true);
  // (Open, the leaf stands back against the side of the way in, its hinge on the side `open` names; shut, it fills the frame.)
  if (open) openLeaves(k, f, o.s0 + 0.07, o.s1 - 0.07, o.y0, yL, deep + 0.04, paint, false, open);
  else k.on(f, 'wood', o.s0 + 0.07, o.s1 - 0.07, o.y0, yL, deep + 0.04, deep + 0.1, paint, true);
  // Raised panels, in two columns on a broad leaf.
  const cols = w > 1.1 ? 2 : 1, rows = 3, pw = (w - 0.14 - 0.12 * (cols + 1)) / cols, ph = (yL - o.y0 - 0.14 * (rows + 1)) / rows;
  if (!open) {
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const s0 = o.s0 + 0.07 + 0.12 + c * (pw + 0.12), y0 = o.y0 + 0.14 + r * (ph + 0.14);
      k.on(f, 'wood', s0, s0 + pw, y0, y0 + ph * (r === 1 ? 0.6 : 1), deep + 0.01, deep + 0.04, shade(paint, 1.18), true);
    }
    k.disc(f, mid, o.y0 + 1.05, 0.05, deep - 0.02, deep + 0.04, 'metal', BRASS, 0);
    k.on(f, 'metal', mid - 0.14, mid + 0.14, o.y0 + 0.82, o.y0 + 0.88, deep + 0.0, deep + 0.04, BRASS);
  }
  // The fanlight: glass, a ring about the foot of its bars, and the bars spreading to its edges.
  const fy = yL + 0.1, fh = o.y1 - fy;
  if (fh > 0.2) {
    k.glazed(f, { s0: o.s0 + 0.07, s1: o.s1 - 0.07, y0: fy, y1: o.y1 }, 1, 1, frame, deep);
    const r0 = Math.min(0.14, fh * 0.4), bars = 7;
    for (let i = 1; i < bars; i++) {
      const a = (Math.PI * i) / bars, dx = Math.cos(a), dy = Math.sin(a), half = w / 2 - 0.12, len = Math.min(dy > 0.01 ? (fh - 0.06) / dy : 9, Math.abs(dx) > 0.01 ? half / Math.abs(dx) : 9);
      k.stick(f.P(mid + dx * r0, fy + dy * r0, deep + 0.035), f.P(mid + dx * len, fy + dy * len, deep + 0.035), 0.03, 0.035, frame);
    }
    for (let i = 0; i < 6; i++) { const a0 = (Math.PI * i) / 6, a1 = (Math.PI * (i + 1)) / 6; k.stick(f.P(mid + Math.cos(a0) * r0, fy + Math.sin(a0) * r0, deep + 0.035), f.P(mid + Math.cos(a1) * r0, fy + Math.sin(a1) * r0, deep + 0.035), 0.03, 0.035, frame); }
  }
  if (orn >= 1) {
    // (The door case stands on the face of the wall about the opening.)
    const top = o.y1;
    for (const s of [o.s0 - 0.24, o.s1 + 0.02]) k.on(f, 'wood', s, s + 0.22, o.y0, top, -0.08, 0.02, frame, true);
    k.on(f, 'wood', o.s0 - 0.3, o.s1 + 0.3, top, top + 0.22, -0.1, 0.02, frame, true);
    k.on(f, 'wood', o.s0 - 0.36, o.s1 + 0.36, top + 0.22, top + 0.32, -0.2, 0.02, frame, true);
    if (orn >= 2) {
      const into = f.P(0, 0, 0.18).sub(f.P(0, 0, 0));
      k.wedge(f.P(o.s0 - 0.36, top + 0.32, -0.2), f.P(o.s1 + 0.36, top + 0.32, -0.2), f.P(mid, top + 0.32 + (w + 0.7) * 0.22, -0.2), into, ['wood', frame], ['wood', frame]);
    }
  }
}

/**
 * A timber front to the ground storey: posts at the bays, a beam under the brick and a cornice on
 * it, a transom across with lights over it, a great window in each bay over a panel, and the door,
 * all of it painted one colour and set a little back in the opening.
 */
function pui(k: BrickKit, f: Face, b: Building, o: Opening, door: { s0: number; s1: number }, rng: Rng, open: -1 | 0 | 1) {
  const cw = b.canalwork!, paint = cw.pui!, frame = cw.frame, F0 = cw.stoop, bays = canalBays(b), dk = 0.12;
  const yT = o.y1 - 0.28, yt = o.y1 - 0.78;
  k.on(f, 'wood', o.s0, o.s1, yT, o.y1, -0.03, 0.2, paint, true);
  k.on(f, 'wood', o.s0 - 0.14, o.s1 + 0.14, o.y1, o.y1 + 0.16, -0.2, 0.05, shade(paint, 1.05), true);
  k.on(f, 'wood', o.s0 - 0.18, o.s1 + 0.18, o.y1 + 0.16, o.y1 + 0.24, -0.26, 0.05, paint, true);
  k.on(f, 'wood', o.s0, o.s1, yt - 0.07, yt + 0.07, 0.02, 0.2, paint, true);
  const posts = Array.from({ length: b.bays + 1 }, (_, j) => Math.min(o.s1 - 0.12, Math.max(o.s0 + 0.12, bays.margin + j * bays.pitch)));
  for (const p of posts) k.on(f, 'wood', p - 0.12, p + 0.12, o.y0, yT, -0.02, 0.2, paint, true);
  for (let j = 0; j < b.bays; j++) {
    const a = posts[j] + 0.12, c = posts[j + 1] - 0.12;
    if (c - a < 0.3) continue;
    // Over the transom, a light of small panes.
    k.glazed(f, { s0: a, s1: c, y0: yt + 0.07, y1: yT }, 3, 1, frame, dk);
    if (j === cw.door) {
      const dw = Math.min(c - a, door.s1 - door.s0), d0 = (a + c) / 2 - dw / 2;
      // (Beside a narrow door in a broad bay, panels.)
      if (d0 - a > 0.05) { k.on(f, 'wood', a, d0, o.y0, yt - 0.07, dk, dk + 0.06, paint, true); k.on(f, 'wood', d0 + dw, c, o.y0, yt - 0.07, dk, dk + 0.06, paint, true); }
      if (F0 > o.y0 + 0.05) k.on(f, 'wood', d0, d0 + dw, o.y0, F0, dk, dk + 0.06, shade(paint, 0.9), true);
      houseDoor(k, f, { s0: d0, s1: d0 + dw, y0: Math.max(F0, o.y0), y1: yt - 0.07, head: 'flat', fill: 'door', storey: 0 }, dk - 0.04, cw.paint, frame, 0, open);
      continue;
    }
    // A panel under the window; in it, over a basement, a low barred light.
    const ys = Math.max(F0 + 0.4, o.y0 + 0.55);
    k.on(f, 'wood', a, c, o.y0, ys, dk, dk + 0.06, paint, true);
    if (cw.basement && ys - o.y0 > 0.7) {
      const g = { s0: a + 0.12, s1: c - 0.12, y0: o.y0 + 0.12, y1: ys - 0.14 };
      k.on(f, 'glass', g.s0, g.s1, g.y0, g.y1, dk + 0.04, dk + 0.07, PANE);
      for (let s = g.s0 + 0.08; s < g.s1 - 0.04; s += 0.12) k.stick(f.P(s, g.y0, dk - 0.02), f.P(s, g.y1, dk - 0.02), 0.024, 0.024, IRON, 'metal');
    } else k.on(f, 'wood', a + 0.1, c - 0.1, o.y0 + 0.1, ys - 0.1, dk - 0.015, dk + 0.01, shade(paint, 1.12), true);
    k.on(f, 'wood', a - 0.02, c + 0.02, ys - 0.05, ys + 0.03, dk - 0.06, dk + 0.08, paint, true);
    k.glazed(f, { s0: a, s1: c, y0: ys + 0.03, y1: yt - 0.07 }, rng.chance(0.5) ? 2 : 1, 1, frame, dk);
  }
}

/** A hoist beam out from the wall at `at`, a hook hanging from its end, and, if `hood`, a little roof of boards over it. */
function hoist(k: BrickKit, f: Face, at: { s: number; y: number; out: number }, T: number, hood: boolean, paint: Colour) {
  const { s, y, out } = at;
  k.stick(f.P(s, y, T * 0.5), f.P(s, y + 0.001, -out), 0.16, 0.2, shade(OAK, 0.9));
  k.on(f, 'metal', s - 0.025, s + 0.025, y - 0.5, y - 0.08, -out + 0.07, -out + 0.12, IRON);
  k.on(f, 'metal', s - 0.06, s + 0.06, y - 0.56, y - 0.5, -out + 0.03, -out + 0.16, IRON);
  if (hood) {
    const into = f.P(0, 0, out + 0.1).sub(f.P(0, 0, 0));
    k.wedge(f.P(s - 0.3, y + 0.1, -out - 0.12), f.P(s + 0.3, y + 0.1, -out - 0.12), f.P(s, y + 0.42, -out - 0.12), into, ['wood', shade(paint, 0.95)], ['wood', paint], ['wood', shade(OAK, 0.8)]);
  }
}

/**
 * The stoop: a landing of bluestone before the door at the ground storey's floor, solid to the
 * street, and its flights down, each step a block; iron railings on the open sides, a post at
 * each end and a rail following the flight.
 */
function stoop(b: Building, k: BrickKit): void {
  const st = canalStoop(b);
  if (!st) return;
  const [front] = k.walls(0), F0 = b.canalwork!.stoop, L = st.landing, stone = BLUE, high = F0 > 0.5;
  k.on(front, 'stone', L.s0, L.s1, -0.3, F0, -L.out, 0.02, stone);
  k.on(front, 'stone', L.s0 - 0.03, L.s1 + 0.03, F0 - 0.08, F0, -L.out - 0.03, 0.02, shade(stone, 1.15));
  const rails: [Vector3, Vector3][] = [];
  for (const fl of st.flights) {
    for (let i = 0; i < fl.steps; i++) {
      const y = F0 - (i + 1) * fl.rise;
      if (fl.dir === 0) k.on(front, 'stone', fl.s - fl.width / 2, fl.s + fl.width / 2, -0.3, y, -L.out - (i + 1) * fl.tread, -L.out - i * fl.tread + 0.02, shade(stone, 1 + 0.03 * (i % 2)));
      else {
        const a = fl.s + fl.dir * i * fl.tread, c = fl.s + fl.dir * (i + 1) * fl.tread;
        k.on(front, 'stone', Math.min(a, c), Math.max(a, c), -0.3, y, -fl.width, 0.02, shade(stone, 1 + 0.03 * (i % 2)));
      }
    }
    if (!high) continue;
    // (The rail runs along the open edge of the flight, from the landing down to its foot.)
    if (fl.dir === 0) for (const side of [-1, 1]) {
      const s = fl.s + side * (fl.width / 2 - 0.04);
      rails.push([front.P(s, F0 + 0.9, -L.out + 0.04), front.P(s, F0 - fl.steps * fl.rise + 0.9, -L.out - fl.steps * fl.tread + 0.1)]);
    } else {
      const end = fl.s + fl.dir * fl.steps * fl.tread;
      rails.push([front.P(fl.s, F0 + 0.9, -fl.width + 0.04), front.P(end - fl.dir * 0.12, F0 - fl.steps * fl.rise + 0.9, -fl.width + 0.04)]);
    }
  }
  if (!high) return;
  // Along the landing's open sides: its front, and its ends where no flight leaves it.
  const leaves = (s: number) => st.flights.some((fl) => fl.dir !== 0 && Math.abs(fl.s - s) < 0.01);
  const outFlight = st.flights.some((fl) => fl.dir === 0);
  if (!outFlight) rails.push([front.P(L.s0 + 0.04, F0 + 0.9, -L.out + 0.04), front.P(L.s1 - 0.04, F0 + 0.9, -L.out + 0.04)]);
  for (const s of [L.s0, L.s1]) if (!leaves(s) && !outFlight) rails.push([front.P(s + (s === L.s0 ? 0.04 : -0.04), F0 + 0.9, -0.05), front.P(s + (s === L.s0 ? 0.04 : -0.04), F0 + 0.9, -L.out + 0.04)]);
  // (Railings are painted black, and drawn as paint: in the material of bare metal the thin bars mirrored the sky and stood white.)
  for (const [p, q] of rails) {
    k.stick(p, q, 0.04, 0.05, [0.04, 0.04, 0.045]);
    const n = Math.max(1, Math.round(p.distanceTo(q) / 0.12));
    for (let i = 0; i <= n; i++) {
      const r = p.clone().lerp(q, i / n), post = i === 0 || i === n, foot = r.clone().setY(r.y - 0.9);
      k.stick(foot, r, post ? 0.045 : 0.018, post ? 0.045 : 0.018, [0.04, 0.04, 0.045]);
      if (post) k.shaft(above(r, 0.02), 0.04, 0.08, 6, 0, 'metal', BRASS);
    }
  }
}
