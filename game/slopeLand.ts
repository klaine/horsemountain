/**
 * What the downhill run is skied on (`lab/slope.ts`): a land, with the snow's height at any point, the run's line through it (how far
 * along the run a point is and how far to its left), and what is seen of it.
 *
 * Two lands. The groomed slope the page began with: a plane falling at sixteen degrees, going on as far as it is ridden, firs either
 * side and its edges marked with poles. And a slice of a world (asked: "a 100m wide nearland slice of our actual winter gameworld
 * starting on high slopes at suitable location, no buildings or locations"), found in it and kept by `tools/skiRun.ts`
 * (`src/core/skiRun.ts`): the snow on the world's near land at a metre fifty metres either side of the run, the land about it at four
 * metres and the country round about at sixteen, in winter: snow on all of it but where the ground is too steep for snow to lie, the
 * lakes frozen, and snowy firs where the world has woods. Scene coordinates are the world's, less the run's top.
 */
import {
  BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, InstancedMesh, type Material, Matrix4, Mesh, MeshStandardMaterial,
  PlaneGeometry, Quaternion, type Texture, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { abs, float, mix, positionWorld, smoothstep, texture } from 'three/tsl';
import { glinting, snowGlints } from '../src/render/siteMaterial';
import { MeshBuilder } from '../src/render/geom/meshBuilder';
import { Rng } from '../src/core/rng';
import { type Grid, gridAt, type SkiSlice } from '../src/core/skiSlice';
import { sliceWoods, type Woods } from './slopeTrees';

/** Where a point lies against the run: how far along it (`s`), how far to its left (`left`), and which way the run goes there. */
export interface Frame { s: number; left: number; dx: number; dz: number }

export interface Land {
  /** What it is called (and shortly), and what the run is like, for the page to say. */
  name: string; short: string; about: string;
  /** How long the run is, horizontally (`Infinity` for one that goes on); how far either side of its line its snow reaches. */
  length: number; half: number;
  /**
   * How far below the run's top a point `y` high lies, in metres of height as the world has it (a slice's land above some height
   * having been brought lower); and how far below it the run's foot lies (`Infinity` for a slope that goes on).
   */
  drop(y: number): number; fall: number;
  /** Where the skiable path's edges are `s` along the run: how far to the left of its line each lies (the right edge less than nothing). */
  edges(s: number): [number, number];
  /** The snow's height at a point of the scene. */
  height(x: number, z: number): number;
  /**
   * How much snow lies at a point as it is drawn: 1, snow; 0, the mountain's stones, bare where it is too steep for snow to lie;
   * between, its ragged edge. (None given, snow everywhere.)
   */
  snowAt?(x: number, z: number): number;
  /**
   * The tree nearest a body `r` metres across its middle at (`x`, `z`) that it is into, if one is: where its trunk stands, how far out
   * from it its trunk and the dense lower boughs about it reach, and how tall it is. (Only off the piste: none stands on the run.)
   */
  treeNear?(x: number, z: number, r: number): { x: number; z: number; r: number; tall: number } | null;
  /** Whether a point can be ridden, off the piste: on the land drawn about the run (none given, anywhere). */
  roam?(x: number, z: number): boolean;
  /** Where a point lies against the run; `hint`, the `s` of a point near it, makes it quicker. */
  frame(x: number, z: number, hint?: number): Frame;
  /** The point `s` along the run and `left` to its left, and which way the run goes there. */
  at(s: number, left: number): { x: number; z: number; dx: number; dz: number };
  /** Whether a kicker may be built with its foot at (`s`, `left`): the land after its lip falls away enough to land on. */
  kickable(s: number, left: number, length: number): boolean;
  /** What is seen of it, and keeping that about a point as it moves (the groomed slope's goes on with the skier). */
  group: Group;
  keepAbout(x: number, z: number): void;
  /** Draws what is near the eye at (`x`, `z`) finely and the rest coarsely, where the land is made so. */
  lod?(x: number, z: number): void;
  /**
   * Lets go of what it has made, on the graphics card and off it, once another land is shown in its place: a run's land, drawn with
   * the game's materials, is some hundred megabytes of shapes, and kept, each run visited added to what the page held. (Made again
   * from its slice if it is wanted again.)
   */
  dispose?(): void;
  /** Grows the woods about the eye, where the land has the game's own trees (`slopeTrees.ts`); `seconds`, the page's clock, for the wind. */
  trees?(eye: Vector3, seconds: number): void;
  /** How far the air's haze begins and is whole; where the sun is (towards it); and how strong the sky's light is. */
  fog: [number, number]; sun: [number, number, number]; sky: number;
  /**
   * The ways down a run that parts in two (its slice's `branches`, `FORKS` in `tools/skiRun.ts`), each to be asked of itself (`LandWay`):
   * the first its own, each other the run it is (by its slice's name), from where it parts from the first. What is laid on the run, or
   * comes along it, keeps to the way it is on and asks that way of it, not the land; the land's own `frame`, `at`, `edges`, `length` and
   * `kickable` are those of the way the skier rides (`way`, `setWay`), which only the ride changes. And the way whose path a point is
   * on, or nearest (`wayAt`). None for a run of one way.
   */
  ways?: LandWay[];
  way?(): number;
  setWay?(w: number): void;
  wayAt?(x: number, z: number): number;
}
/**
 * One way down a run that parts (`Land.ways`): its name (none, the run's own), where it parts from the first, how long it is, and where a
 * point lies against it, its path's edges, a point along and across it, and where a kicker may be built on it, as the land has them
 * for the way ridden.
 */
export interface LandWay extends Pick<Land, 'length' | 'frame' | 'at' | 'edges' | 'kickable'> { id?: string; from: number }

/** A way down a run that parts from its own, as its slice carries it (`branches`, written by `tools/skiRun.ts`). */
export interface Branch { id: string; from: number; run: SkiSlice['run'] }

const smooth01 = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

// ------------------------------------------------------------------------------------------------------------------- the groomed slope

/** The groomed slope: a plane falling at sixteen degrees down +z, going on as far as it is ridden. */
export function groomedLand(snowMap: Texture, powderMap: Texture): Land {
  const ANGLE = (16 * Math.PI) / 180, tan = Math.tan(ANGLE);
  const FALL = new Vector3(0, -Math.sin(ANGLE), Math.cos(ANGLE)), LEFT = new Vector3(1, 0, 0);
  const onSlope = (down: number, left: number) => new Vector3().addScaledVector(FALL, down).addScaledVector(LEFT, left);
  const group = new Group();
  // The snow: a sheet moved along under the skier, so that the slope goes on; its pictures laid by where each point is, not on the
  // sheet, so that it is the same snow wherever the sheet has been moved to. Groomed between the poles, its corduroy a picture every
  // nine metres; beyond them loose snow, unlined, as off a world's run, coming in over the first six metres past the poles (asked:
  // "the groomed surface shouldn't be shown by the way off piste"; where the snow is deep to ride, `DEEP` in `slope.ts`).
  const W = 252, L = 720, paint = new MeshStandardNodeMaterial({ color: 0xffffff });
  const where = positionWorld.xz, loose = smoothstep(31, 37, abs(positionWorld.x));
  paint.colorNode = mix(texture(snowMap, where.div(9)), texture(powderMap, where.div(23)), loose);
  paint.roughnessNode = mix(float(0.92), float(0.95), loose);
  glinting(paint, snowGlints(mix(float(0.45), float(0.55), loose)));
  const snow = new Mesh(new PlaneGeometry(W, L), paint);
  snow.geometry.rotateX(-Math.PI / 2).rotateX(ANGLE);
  snow.receiveShadow = true;
  group.add(snow);
  // Beside the piste, firs on both sides and its edges marked with poles every twenty-five metres: a stretch of 300 metres of them,
  // laid three times, one after another, about wherever the skier is.
  const TILE = 300, tiles: Group[] = [];
  /** Where each fir of a stretch stands (down the slope and to its left), how far out its trunk and lower boughs reach, how tall it is. */
  const firSpots: { down: number; left: number; r: number; tall: number }[] = [];
  {
    const rng = new Rng('woods'), trees: Matrix4[] = [];
    for (let down = 0; down < TILE; down += rng.range(3, 7)) for (const side of [-1, 1]) {
      if (rng.chance(0.25)) continue;
      const h = rng.range(5, 11), left = side * rng.range(36, 100);
      firSpots.push({ down, left, r: 0.12 * h, tall: h });
      // (Turned each its own way, by where it stands, so as not to draw on the slope's random numbers.)
      trees.push(new Matrix4().compose(onSlope(down, left).add(new Vector3(0, -0.2, 0)), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (down * 7.3 + left * 3.1) % 6.28), new Vector3(h * 0.9, h * 0.86, h * 0.9)));
    }
    const marks: Matrix4[] = [];
    for (let down = 0; down < TILE; down += 25) for (const side of [-1, 1]) marks.push(new Matrix4().compose(onSlope(down, side * 30).add(new Vector3(0, 0.75, 0)), new Quaternion(), new Vector3(1, 1, 1)));
    // (The snowy firs of the world's runs, in tiers with snow on their boughs, in place of the plain green cones the slope had: asked,
    // "now find ways to improve visual impression without making the game much heavier"; some forty triangles more to a tree.)
    const firShape = snowyFir(3, 6, true), firPaint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    for (let k = 0; k < 3; k++) {
      const fir = new InstancedMesh(firShape, firPaint, trees.length), poles = new InstancedMesh(POLE, POLE_PAINT, marks.length);
      trees.forEach((m, i) => fir.setMatrixAt(i, m));
      marks.forEach((m, i) => poles.setMatrixAt(i, m));
      fir.castShadow = true;
      // (Moved as a whole: what is in it is not where its bounds were worked out.)
      fir.frustumCulled = poles.frustumCulled = false;
      const tile = new Group();
      tile.add(fir, poles);
      group.add(tile);
      tiles.push(tile);
    }
  }
  return {
    name: 'Groomed slope', short: 'groomed', about: 'a groomed slope at sixteen degrees', length: Infinity, half: 31,
    edges: () => [-31, 31],
    drop: (y) => -y, fall: Infinity,
    height: (_x, z) => -z * tan,
    frame: (x, z) => ({ s: z, left: x, dx: 0, dz: 1 }),
    at: (s, left) => ({ x: left, z: s, dx: 0, dz: 1 }),
    // (Each fir as it stands in every stretch of them, one after another down the slope: looked for in the stretch nearest.)
    treeNear: (x, z, r) => {
      const down = z / Math.cos(ANGLE);
      for (const t of firSpots) {
        const along = ((((down - t.down) % TILE) + TILE * 1.5) % TILE) - TILE / 2, dz = along * Math.cos(ANGLE);
        if (Math.hypot(x - t.left, dz) < t.r + r) return { x: t.left, z: z - dz, r: t.r, tall: t.tall };
      }
      return null;
    },
    kickable: () => true,
    group,
    keepAbout: (x, z) => {
      const down = z / Math.cos(ANGLE);
      snow.position.copy(onSlope(Math.round(down / 45) * 45 + 220, Math.round(x / 45) * 45));
      const first = Math.floor(down / TILE) * TILE - TILE;
      tiles.forEach((tile, k) => tile.position.copy(onSlope(first + k * TILE, 0)));
    },
    fog: [90, 520], sun: [-0.55, 0.75, -0.35], sky: 1.15,
  };
}

/** A piste's edge marker: an orange pole. */
const POLE = new CylinderGeometry(0.035, 0.035, 1.5, 6), POLE_PAINT = new MeshStandardMaterial({ color: 0xd9542b, roughness: 0.6 });

// ----------------------------------------------------------------------------------------------------------------- a slice of a world

/** What lies on the world's land (`COVER` in `src/core/world.ts`; the numbers it keeps, not the world's code, which the page does not need). */
const COVER = { sea: 0, lake: 1, forest: 6 } as const;

/**
 * The game's own materials for land, in their winter forms (asked: "can we have some kind of optimized versions of the game side
 * landscape materials"): its ground drawn as only what shows of it under a full winter (`makeSnowMaterial`: snow, and the stones where
 * none lies), and its far country (`makeFarMaterial`), which paints its own woods, rock bands and snow; and the sky's colour, for the
 * light the land has from it.
 */
export interface GameLook {
  snow: Material; far: Material; sky: [number, number, number];
  /** Off the graphics card, how much snow the game's snow draws at a point that faces up by `up` (`snowLiesAt`): 1, snow; 0, stones. */
  snowAt?: (up: number, x: number, z: number) => number;
}

/**
 * The land of a world's ski run (`SkiSlice`), its scene's origin at the run's top; drawn with the game's materials if they are given,
 * and then, if `woods` is given (its textures' size), with the game's own trees in place of the snowy firs (`slopeTrees.ts`).
 */
/**
 * (`pause`, if given: called now and then as it goes, with how far it has got (0 to 1), and waited on, so that the page can be drawn
 * between its parts, a loading screen's bar moved on, rather than held for the whole of it: asked, "can we have loading that doesn't
 * fully freeze the app and that shows more granular progress indication to the user?")
 */
export async function sliceLand(slice: SkiSlice, snowMap: Texture, powderMap: Texture, game?: GameLook, woods?: number, pause?: (k: number) => Promise<void>): Promise<Land> {
  const [ox, oz] = slice.run.points[0], step = slice.run.step;
  const shift = (g: Grid): Grid => ({ ...g, x0: g.x0 - ox, z0: g.z0 - oz });
  const snow = shift(slice.snow), near = shift(slice.near), far = shift(slice.far);

  /** The snow at a metre on a smooth curve through the sixteen points about (Catmull and Rom's), where all of them are snow. */
  const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  const smoothSnow = (x: number, z: number): number => {
    const fx = x - snow.x0, fz = z - snow.z0, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 1 || j < 1 || i > snow.nx - 3 || j > snow.nz - 3) return NaN;
    // (Its four rows each in a number of its own, not a list made for every height asked: this is asked more than anything else in the
    // game, by the ride, by every grain of snow in the air, by the views.)
    const tx = fx - i, tz = fz - j, d = snow.data, w = snow.nx;
    let k = (j - 1) * w + i;
    const r0 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx); k += w;
    const r1 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx); k += w;
    const r2 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx); k += w;
    const r3 = catmull(d[k - 1], d[k], d[k + 1], d[k + 2], tx);
    return catmull(r0, r1, r2, r3, tz);
  };
  const height = (x: number, z: number): number => {
    let h = smoothSnow(x, z);
    if (Number.isNaN(h)) h = gridAt(snow, x, z);
    if (Number.isNaN(h)) h = gridAt(near, x, z);
    if (Number.isNaN(h)) h = gridAt(far, x, z);
    return Number.isNaN(h) ? 0 : h;
  };

  /**
   * A way down the run, from its line: where a point lies against it, its path's edges, a point along and across it. The run's own, and
   * on a run that parts in two (`branches`), each other way, from where it parts.
   */
  const wayOf = (run: SkiSlice['run'], id: string | undefined, from: number) => {
    const line = run.points.map(([x, z]) => [x - ox, z - oz] as [number, number]), n = line.length, length = (n - 1) * step;
    // Each stretch of the line: where it starts and which way it goes.
    const dirs = line.map((_, k) => {
      const [ax, az] = line[Math.max(0, Math.min(n - 2, k))], [bx, bz] = line[Math.max(1, Math.min(n - 1, k + 1))], l = Math.hypot(bx - ax, bz - az) || 1;
      return [(bx - ax) / l, (bz - az) / l] as [number, number];
    });
    /** Where a point lies against the line: the nearest point on it, from the stretches about `hint` if given. */
    const frame = (x: number, z: number, hint?: number): Frame => {
      const k0 = hint === undefined ? 0 : Math.max(0, Math.floor(hint / step) - 16), k1 = hint === undefined ? n - 2 : Math.min(n - 2, Math.floor(hint / step) + 16);
      let best = Infinity, out: Frame = { s: 0, left: 0, dx: dirs[0][0], dz: dirs[0][1] };
      for (let k = k0; k <= k1; k++) {
        const [ax, az] = line[k], [dx, dz] = dirs[k], rx = x - ax, rz = z - az;
        // (Before the first stretch and past the last, the line goes on straight.)
        let t = (rx * dx + rz * dz) / step;
        if (k > 0) t = Math.max(0, t);
        if (k < n - 2) t = Math.min(1, t);
        const px = ax + dx * t * step, pz = az + dz * t * step, d = Math.hypot(x - px, z - pz);
        if (d < best) { best = d; out = { s: (k + t) * step, left: (x - px) * dz - (z - pz) * dx, dx, dz }; }
      }
      return out;
    };
    /** The skiable path's edges at `s` (from slices made before the path had its own edges, the snow's edge less four metres). */
    const piste = run.piste ?? line.map(() => [-(slice.half - 4), slice.half - 4] as [number, number]);
    const edges = (s: number): [number, number] => {
      const f = Math.max(0, Math.min(n - 1, s / step)), k = Math.min(n - 2, Math.floor(f)), t = f - k, [a, b] = piste[k], [c, d] = piste[k + 1];
      return [a + (c - a) * t, b + (d - b) * t];
    };
    const at = (s: number, left: number) => {
      const k = Math.max(0, Math.min(n - 2, Math.floor(s / step))), t = s / step - k, [ax, az] = line[k], [dx, dz] = dirs[k];
      const x = ax + dx * t * step, z = az + dz * t * step;
      return { x: x + dz * left, z: z - dx * left, dx, dz };
    };
    /** How far a place against the line lies outside its path, metres (less than nothing, inside), past its top and foot too. */
    const outside = (f: Frame) => { const [lo, hi] = edges(f.s); return Math.max(lo - f.left, f.left - hi, -4 - f.s, f.s - length - 4); };
    return { id, from, length, frame, edges, at, outside, kickable: (s: number, left: number, kick: number): boolean => kickableOn(at, length, s, left, kick) };
  };
  const ways = [wayOf(slice.run, undefined, 0), ...((slice as SkiSlice & { branches?: Branch[] }).branches ?? []).map((b) => wayOf(b.run, b.id, b.from))];
  let way = ways[0];
  const frame = (x: number, z: number, hint?: number) => way.frame(x, z, hint), edges = (s: number) => way.edges(s), at = (s: number, left: number) => way.at(s, left);
  /**
   * Of the ways down a run that parts, the one whose path a point is on or nearest, and where it lies against it: for what is drawn and
   * where the snow lies, alike whichever way is ridden. (`hints`, where the last point asked lay along each, to look about.)
   */
  const nearestWay = (x: number, z: number, hints?: number[]) => {
    let best = ways[0], f = best.frame(x, z, hints?.[0]), out = best.outside(f);
    for (let w = 1; w < ways.length; w++) {
      const g = ways[w].frame(x, z, hints?.[w]), o = ways[w].outside(g);
      if (o < out) { best = ways[w]; f = g; out = o; }
    }
    return { w: best, f, out };
  };

  /** How steep the snow is about a point, in degrees, over `e` metres either way: alike whichever grid asks. */
  const steepAt = (x: number, z: number, e: number) => Math.atan(Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e)) * (180 / Math.PI);
  /** A height of the slice as the world has it (undoing `squash` in `skiRun.ts`). */
  const sq = slice.run.squash, worldHeight = (h: number) => (!sq || h <= sq.above ? h : sq.above + (h - sq.above) / sq.keep);
  /** How much steeper the world's own land is than the slice's at height `y` (where it was brought lower, by as much). */
  const worldSlope = (y: number) => (!sq || y <= sq.above ? 1 : 1 / sq.keep);
  /** How steep the world's own land is where the slice's is `steep` degrees at height `y`. */
  const worldSteep = (steep: number, y: number) => (!sq || y <= sq.above ? steep : (Math.atan(Math.tan((steep * Math.PI) / 180) / sq.keep) * 180) / Math.PI);

  // How much snow lies at a point, as it is drawn (`Land.snowAt`), for the skis to know what they go over. With the game's snow, by its
  // own rule (`game.snowAt`), from how nearly the ground faces up there as the run's snow is made to (`nrm` in `gameMeshes`: over three
  // metres either way; off the skiable path, as steeply as the world's own land); drawn plainly, as `coloured` lays its rock.
  let snowHint = 0;
  const snowAt = (x: number, z: number) => {
    const y = height(x, z);
    let out: number;
    if (ways.length === 1) { const f = frame(x, z, snowHint); snowHint = f.s; out = ways[0].outside(f); } else out = nearestWay(x, z).out;
    const away = smooth01((out + 1) / 6);
    if (!game?.snowAt) return 1 - smooth01((worldSteep(steepAt(x, z, 4), y) - 38) / 14) * away;
    // (Over three metres either way on the run's own snow, eight on the land about it, as each is shaded, `nrm`.)
    const e = inSlice(x, z) ? 3 : 8, k = away >= 0.5 ? worldSlope(y) : 1;
    const gx = (k * (height(x + e, z) - height(x - e, z))) / (2 * e), gz = (k * (height(x, z + e) - height(x, z - e))) / (2 * e);
    return game.snowAt(1 / Math.hypot(gx, 1, gz), x, z);
  };

  // ---- What is seen.
  const group = new Group(), rng = new Rng(`slice ${slice.world}`);
  const snowWhite = new Color(0.94, 0.96, 0.99), rock = new Color(0.34, 0.33, 0.32), ice = new Color(0.78, 0.85, 0.9), sea = new Color(0.09, 0.15, 0.21);
  const coverAt = (x: number, z: number) => {
    const i = Math.round((x - far.x0) / far.cell), j = Math.round((z - far.z0) / far.cell);
    return i < 0 || j < 0 || i >= far.nx || j >= far.nz ? COVER.sea : slice.cover[j * far.nx + i];
  };
  /**
   * A grid made a mesh: a point for each of its heights (`lift` moving some down out of sight under a finer grid over them), a
   * triangle pair for each square of four, its normals from the heights about each point, and its colour from how steep it is and
   * what lies there; with a skirt hanging from its outer edges, so that no crack shows where it meets the grid under it.
   */
  const gridMesh = (g: Grid, lift: (x: number, z: number) => number, uv: (x: number, z: number) => [number, number], skirt: number, coloured: boolean, off?: (x: number, z: number) => number, hole?: (x: number, z: number) => boolean) => {
    const idx = new Int32Array(g.nx * g.nz).fill(-1), pos: number[] = [], nor: number[] = [], col: number[] = [], uvs: number[] = [], index: number[] = [], other: number[] = [], kinds: boolean[] = [];
    const H = (i: number, j: number) => (i < 0 || j < 0 || i >= g.nx || j >= g.nz ? NaN : g.data[j * g.nx + i]);
    const c = new Color();
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      const y = H(i, j);
      if (Number.isNaN(y)) continue;
      const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
      const l = H(i - 1, j), r = H(i + 1, j), u = H(i, j - 1), d = H(i, j + 1);
      const gx = ((Number.isNaN(r) ? y : r) - (Number.isNaN(l) ? y : l)) / ((Number.isNaN(r) || Number.isNaN(l) ? 1 : 2) * g.cell);
      const gz = ((Number.isNaN(d) ? y : d) - (Number.isNaN(u) ? y : u)) / ((Number.isNaN(d) || Number.isNaN(u) ? 1 : 2) * g.cell);
      const nl = Math.hypot(gx, 1, gz);
      idx[j * g.nx + i] = pos.length / 3;
      pos.push(x, y + lift(x, z), z);
      nor.push(-gx / nl, 1 / nl, -gz / nl);
      const [a, b] = uv(x, z);
      uvs.push(a, b);
      // (How far off the skiable path, 0 to 1: the path is groomed and white whatever lies under it, and beyond its edge the loose
      // snow, and the rock, come in over a few metres.)
      const away = off ? off(x, z) : 1;
      kinds.push(away > 0.5);
      if (coloured) {
        // Snow, but where it is too steep to lie (bare rock) or on water (frozen, or the open sea).
        const steep = steepAt(x, z, Math.max(4, g.cell / 2)), cv = coverAt(x, z);
        if (cv === COVER.sea && y < 0.5) c.copy(sea);
        else if (cv === COVER.lake) c.copy(ice);
        // (Bare rock where the world's own land is too steep for snow to lie: where the slice has its land brought lower, the steepness
        // it had. The skiable path's snow is groomed white whatever lies under it.)
        else c.copy(snowWhite).lerp(rock, smooth01((worldSteep(steep, y) - 38) / 14) * away);
        col.push(c.r, c.g, c.b);
      }
    }
    const v = (i: number, j: number) => (i < 0 || j < 0 || i >= g.nx || j >= g.nz ? -1 : idx[j * g.nx + i]);
    const whole = (i: number, j: number) => v(i, j) >= 0 && v(i + 1, j) >= 0 && v(i, j + 1) >= 0 && v(i + 1, j + 1) >= 0;
    const hang = (a: number, b: number) => {
      // (A strip down from the edge a–b, its normals as the edge's.)
      const base = pos.length / 3;
      for (const p of [a, b]) {
        pos.push(pos[p * 3], pos[p * 3 + 1] - skirt, pos[p * 3 + 2]);
        nor.push(nor[p * 3], nor[p * 3 + 1], nor[p * 3 + 2]);
        uvs.push(uvs[p * 2], uvs[p * 2 + 1]);
        if (coloured) col.push(col[p * 3], col[p * 3 + 1], col[p * 3 + 2]);
      }
      index.push(a, base, b, b, base, base + 1, a, b, base, b, base + 1, base);
    };
    for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
      if (!whole(i, j) || covered(g, i, j, hole)) continue;
      const a = v(i, j), b = v(i + 1, j), c2 = v(i, j + 1), d = v(i + 1, j + 1);
      // (A square with any corner of the other kind is of it: the path's edge falls a little outside its edge.)
      (kinds[a] || kinds[b] || kinds[c2] || kinds[d] ? other : index).push(a, c2, b, b, c2, d);
      if (skirt > 0) {
        if (!whole(i, j - 1)) hang(a, b);
        if (!whole(i, j + 1)) hang(c2, d);
        if (!whole(i - 1, j)) hang(a, c2);
        if (!whole(i + 1, j)) hang(b, d);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    if (coloured) geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    // (Two kinds drawn with two materials: the first of the indices, then the other.)
    geo.setIndex([...index, ...other]);
    if (off) { geo.addGroup(0, index.length, 0); geo.addGroup(index.length, other.length, 1); }
    geo.computeBoundingSphere();
    return geo;
  };

  // The run's snow at a metre: the skiable path groomed, its corduroy laid along the run; beyond its edges loose snow, and bare rock
  // where it is too steep for snow to lie (each point's place against the line found from the last's).
  let hint = 0, last: Frame = { s: 0, left: 0, dx: 0, dz: 1 }, lastWay = ways[0];
  const hints = ways.map(() => 0);
  const pisteUv = (x: number, z: number): [number, number] => {
    if (ways.length > 1) {
      // (On a run that parts, against the way whose path it is on or nearest, each looked along from where its last point lay.)
      const { w, f } = nearestWay(x, z, hints);
      hints[ways.indexOf(w)] = f.s; last = f; lastWay = w;
      return [f.left / 9, f.s / 9];
    }
    // (Looked for along all of the line if the last point's place seems to have lost the way.)
    let f = frame(x, z, hint);
    if (Math.abs(f.left) > slice.half + 2) f = frame(x, z);
    hint = f.s; last = f;
    return [f.left / 9, f.s / 9];
  };
  const offPiste = () => smooth01((lastWay.outside(last) + 1) / 6);
  // The land about it at four metres, sunk a little out of sight under the run's snow; and the country at sixteen, sunk out of sight
  // under the land about the run. (Both drawn behind what lies over them where they meet, a little, so as not to flicker through it.)
  const plainUv = (x: number, z: number): [number, number] => [x / 23, z / 23];
  const underSnow = (x: number, z: number) => (Number.isNaN(gridAt(snow, x, z)) ? 0 : -1.2);
  const nearBox = [near.x0, near.z0, near.x0 + (near.nx - 1) * near.cell, near.z0 + (near.nz - 1) * near.cell];
  /** How far inside the land about the run a point is, in metres from its nearest edge (less than nothing, outside it). */
  const intoNear = (x: number, z: number) => Math.min(x - nearBox[0], nearBox[2] - x, z - nearBox[1], nearBox[3] - z);
  // (The country sunk the further in the deeper, a sixth of a metre for each, down to eight: so that a square of it reaching in under
  // the land about the run from beyond its edge is sunk under it, but at the edge itself, where the two meet, by two thirds of a metre
  // at the most, which the land about the run's skirt hides. Under it all, none is drawn, as `inNear` says. Sunk nowhere within twenty-four metres of the edge, as it was, the two lay at
  // the same height there, each its own grain, and flickered through each other along all its edges, the country's colours over the
  // snow's.)
  const underNear = (x: number, z: number) => -Math.min(8, Math.max(0, intoNear(x, z)) / 6);
  // Where a finer grid lies over a coarser one, the coarser has a hole: not drawn there at all, rather than drawn sunk out of sight.
  // (Sunk, every point of the picture there was worked out twice or three times over, the land about the run under the run's snow and
  // the country under both; it was a third and more of what a frame cost.) A square of the coarser is left out where all its corners
  // lie under the finer; where it reaches out from under it, it is kept, sunk where it is under, as before.
  const inSlice = (x: number, z: number) => !Number.isNaN(gridAt(snow, x, z));
  const inNear = (x: number, z: number) => intoNear(x, z) > 0;
  function covered(g: Grid, i: number, j: number, hole?: (x: number, z: number) => boolean) {
    if (!hole) return false;
    const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell;
    return hole(x, z) && hole(x + g.cell, z) && hole(x, z + g.cell) && hole(x + g.cell, z + g.cell);
  }
  let runOf: (g: Grid) => Mesh, pisteMap: Texture | null = null;
  if (game) {
    const made = gameMeshes(game);
    group.add(...made.parts);
    runOf = made.runOf;
  } else {
    pisteMap = snowMap.clone();
    pisteMap.needsUpdate = true;
    const pisteMats = [
      glintingSnow({ vertexColors: true, map: pisteMap, roughness: 0.92 }, 0.28),
      glintingSnow({ vertexColors: true, map: powderMap, roughness: 0.95 }),
    ];
    runOf = (g) => { const m = new Mesh(gridMesh(g, () => 0, pisteUv, 1.5, true, offPiste), pisteMats); m.receiveShadow = true; return m; };
    const powder = (offset: number) => new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: powderMap, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset });
    const about = new Mesh(gridMesh(near, underSnow, plainUv, 3, true, undefined, inSlice), powder(1));
    about.receiveShadow = true;
    const country = new Mesh(gridMesh(far, underNear, (x, z) => [x / 61, z / 61], 0, true, undefined, inNear), powder(2));
    about.name = 'about'; country.name = 'country';
    group.add(about, country);
  }

  await pause?.(0.25);
  // The run's snow at a metre, in tiles of 64 metres, each made twice: at a metre, and at four (every fourth point). Only the tiles
  // within some 120 metres of the eye are drawn at a metre (`lod`); further off, a metre's triangle is smaller than a point of the
  // picture, and the material was worked out for each again and again. (Drawn whole at a metre, from behind the skier looking down
  // the run, it was a third of a frame.) Each tile's edges have skirts, so that a tile at a metre beside one at four leaves no crack.
  const TILE = 64, FINE_WITHIN = 120, runTiles: { x0: number; z0: number; x1: number; z1: number; fine: Mesh; coarse: Mesh }[] = [];
  const subGrid = (i0: number, j0: number, every: number): Grid => {
    const nx = Math.floor(Math.min(TILE, snow.nx - 1 - i0) / every) + 1, nz = Math.floor(Math.min(TILE, snow.nz - 1 - j0) / every) + 1, data = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = snow.data[(j0 + j * every) * snow.nx + i0 + i * every];
    return { x0: snow.x0 + i0 * snow.cell, z0: snow.z0 + j0 * snow.cell, cell: snow.cell * every, nx, nz, data };
  };
  const runGroup = new Group();
  runGroup.name = 'run';
  const tiles = Math.ceil((snow.nz - 1) / TILE) * Math.ceil((snow.nx - 1) / TILE);
  let tilesDone = 0;
  for (let j0 = 0; j0 < snow.nz - 1; j0 += TILE) for (let i0 = 0; i0 < snow.nx - 1; i0 += TILE) {
    if (pause && ++tilesDone % 4 === 0) await pause(0.25 + (0.55 * tilesDone) / tiles);
    const fineGrid = subGrid(i0, j0, 1);
    if (fineGrid.data.every((v) => Number.isNaN(v))) continue;
    const fine = runOf(fineGrid), coarse = runOf(subGrid(i0, j0, 4));
    coarse.visible = false;
    runGroup.add(fine, coarse);
    runTiles.push({ x0: fineGrid.x0, z0: fineGrid.z0, x1: fineGrid.x0 + (fineGrid.nx - 1) * fineGrid.cell, z1: fineGrid.z0 + (fineGrid.nz - 1) * fineGrid.cell, fine, coarse });
  }
  group.add(runGroup);
  const lod = (x: number, z: number) => {
    for (const t of runTiles) {
      const near = Math.hypot(Math.max(t.x0 - x, 0, x - t.x1), Math.max(t.z0 - z, 0, z - t.z1)) < FINE_WITHIN;
      t.fine.visible = near; t.coarse.visible = !near;
    }
  };

  /**
   * The land drawn with the game's materials: each grid's points as the game's meshes carry them (the colour and the four fields its
   * materials read), a triangle pair to each square of four, all of it the winter ground (`makeSnowMaterial`), which leaves bare stone
   * where the snow does not lie, with skirts as above; the country as the game's far sheet, carrying how high each point stands and
   * how much of a hollow it is. And each point lit by the sky as the game lights what it does not bake. (Laid as snow or rock a square
   * at a time, as the game's rock material wants, the rock near the run came out in squares four metres across.)
   */
  function gameMeshes(look: GameLook): { parts: Mesh[]; runOf: (g: Grid) => Mesh } {
    // (Under the snow, where it does not lie, the mountain's stones, grey.)
    const tint = new Color(0.72, 0.71, 0.7);
    const gridBuilder = (g: Grid, lift: (x: number, z: number) => number, skirt: number, groomedHere: boolean, hole?: (x: number, z: number) => boolean) => {
      const B = new MeshBuilder(g.nx * g.nz + 4 * (g.nx + g.nz)), ids = new Int32Array(g.nx * g.nz).fill(-1);
      const H = (i: number, j: number) => (i < 0 || j < 0 || i >= g.nx || j >= g.nz ? NaN : g.data[j * g.nx + i]);
      // (Off the skiable path, each point faces as the world's own land does there: where the slice's land was brought lower, as steep
      // as it was. The snow lies by how a point faces, and the light shades it so: lowered, the walls were gentle slopes, snow lay over
      // every one, and the mountain's rock was gone.)
      // (And over several metres, as snow lies on a slope and not on each knob of it: from the next points, the snow's edges ran along
      // the grid's triangles.)
      const s = g.cell < 2 ? 3 : 2;
      const nrm = (i: number, j: number, onPath: boolean): [number, number, number] => {
        const y = H(i, j), l = H(i - s, j), r = H(i + s, j), u = H(i, j - s), d = H(i, j + s);
        let gx = ((Number.isNaN(r) ? y : r) - (Number.isNaN(l) ? y : l)) / ((Number.isNaN(r) || Number.isNaN(l) ? 1 : 2) * s * g.cell);
        let gz = ((Number.isNaN(d) ? y : d) - (Number.isNaN(u) ? y : u)) / ((Number.isNaN(d) || Number.isNaN(u) ? 1 : 2) * s * g.cell);
        if (!onPath) { const k = worldSlope(y); gx *= k; gz *= k; }
        const nl = Math.hypot(gx, 1, gz);
        return [-gx / nl, 1 / nl, -gz / nl];
      };
      // (Each point's place against the line, once: how groomed it is and which way the machines went.)
      const groom = new Float32Array(g.nx * g.nz * 3);
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
        if (Number.isNaN(H(i, j)) || !groomedHere) continue;
        pisteUv(g.x0 + i * g.cell, g.z0 + j * g.cell);
        groom.set([1 - offPiste(), last.dx, last.dz], (j * g.nx + i) * 3);
      }
      const vertex = (i: number, j: number, drop = 0): number => {
        const k = j * g.nx + i;
        if (!drop && ids[k] >= 0) return ids[k];
        const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell, y = H(i, j) + lift(x, z) - drop, [nx, ny, nz] = nrm(i, j, groom[k * 3] > 0.5);
        const id = B.addVertex(x, y, z, nx, ny, nz, x * 2.3, z * 2.3, tint.r, tint.g, tint.b, groom[k * 3], groom[k * 3 + 1], groom[k * 3 + 2], 0);
        if (!drop) ids[k] = id;
        return id;
      };
      const whole = (i: number, j: number) => [H(i, j), H(i + 1, j), H(i, j + 1), H(i + 1, j + 1)].every((v) => !Number.isNaN(v));
      for (let j = 0; j < g.nz - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
        if (!whole(i, j) || covered(g, i, j, hole)) continue;
        const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i, j + 1), d = vertex(i + 1, j + 1);
        B.addTriangle(a, c, b); B.addTriangle(b, c, d);
        if (skirt > 0) for (const [p, q, open] of [[[i, j], [i + 1, j], !whole(i, j - 1)], [[i, j + 1], [i + 1, j + 1], !whole(i, j + 1)], [[i, j], [i, j + 1], !whole(i - 1, j)], [[i + 1, j], [i + 1, j + 1], !whole(i + 1, j)]] as const) {
          if (!open) continue;
          const P = vertex(p[0], p[1]), Q = vertex(q[0], q[1]), P1 = vertex(p[0], p[1], skirt), Q1 = vertex(q[0], q[1], skirt);
          B.addTriangle(P, P1, Q); B.addTriangle(Q, P1, Q1); B.addTriangle(P, Q, P1); B.addTriangle(Q, Q1, P1);
        }
      }
      return B;
    };
    // The country: the game's far sheet. How high each point stands in its range (0 at its foot, 1 about where rock takes over, from the
    // world's own heights) and how much of a hollow it is; water where the sea is (a lake is frozen, and snow lies on it).
    const farB = new MeshBuilder(far.nx * far.nz), fH = (i: number, j: number) => far.data[Math.max(0, Math.min(far.nz - 1, j)) * far.nx + Math.max(0, Math.min(far.nx - 1, i))];
    const fid = new Int32Array(far.nx * far.nz);
    for (let j = 0; j < far.nz; j++) for (let i = 0; i < far.nx; i++) {
      const x = far.x0 + i * far.cell, z = far.z0 + j * far.cell, y = fH(i, j);
      const k = worldSlope(y), gx = (k * (fH(i + 1, j) - fH(i - 1, j))) / (2 * far.cell), gz = (k * (fH(i, j + 1) - fH(i, j - 1))) / (2 * far.cell), nl = Math.hypot(gx, 1, gz);
      const hollow = Math.min(1, Math.max(-1, (((fH(i + 1, j) + fH(i - 1, j) + fH(i, j + 1) + fH(i, j - 1)) / 4 - y) / far.cell) * 9));
      const high = Math.min(1.3, Math.max(0, (worldHeight(y) - 60) / 600)), water = coverAt(x, z) === COVER.sea && y < 0.5 ? 1 : 0;
      fid[j * far.nx + i] = farB.addVertex(x, y + underNear(x, z), z, -gx / nl, 1 / nl, -gz / nl, x * 0.012, z * 0.012, 0.3, 0.3, 0.31, water, 0, hollow, high);
    }
    for (let j = 0; j < far.nz - 1; j++) for (let i = 0; i < far.nx - 1; i++) {
      if (covered(far, i, j, inNear)) continue;
      const a = fid[j * far.nx + i], b = fid[j * far.nx + i + 1], c = fid[(j + 1) * far.nx + i], d = fid[(j + 1) * far.nx + i + 1];
      farB.addTriangle(a, c, b); farB.addTriangle(b, c, d);
    }
    const snowAbout = gridBuilder(near, underSnow, 3, false, inSlice);
    const lit = (builder: MeshBuilder, material: Material) => {
      // (As the walk page lights the world's land, `meshOf`: the sky's light by the share of it each point sees, here all of it.)
      const geometry = builder.build(), L = look.sky;
      const sh = [geometry.getAttribute('aSHr'), geometry.getAttribute('aSHg'), geometry.getAttribute('aSHb')] as BufferAttribute[], bk = geometry.getAttribute('aBake') as BufferAttribute;
      for (let i = 0; i < builder.vertexCount; i++) {
        for (let c = 0; c < 3; c++) sh[c].setXYZW(i, (Math.PI / 2) * L[c], 0, (Math.PI / 2) * L[c] * 0.8, 0);
        bk.setXY(i, 1, 0.6);
      }
      const mesh = new Mesh(geometry, material);
      mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      return mesh;
    };
    const parts = [lit(snowAbout, look.snow), lit(farB, look.far)];
    ['about', 'country'].forEach((name, k) => { parts[k].name = name; });
    return { parts, runOf: (g) => lit(gridBuilder(g, () => 0, 1.5, true), look.snow) };
  }

  // The path's edges marked with poles every twenty metres.
  // (On a run that parts, along each way from where it parts, and none standing on another's path.)
  const marks: Matrix4[] = [];
  for (const w of ways) for (let s = w.from && Math.ceil(w.from / 20) * 20; s <= w.length; s += 20) for (const side of [0, 1]) {
    const e = w.edges(s), p = w.at(s, e[side] + (side ? 1 : -1));
    if (ways.some((o) => o !== w && o.outside(o.frame(p.x, p.z)) < 0)) continue;
    marks.push(new Matrix4().makeTranslation(p.x, height(p.x, p.z) + 0.75, p.z));
  }
  const poles = new InstancedMesh(POLE, POLE_PAINT, marks.length);
  marks.forEach((m, i) => poles.setMatrixAt(i, m));
  poles.name = 'poles';
  group.add(poles);

  // Snowy firs where the world has woods: near the run, every four metres a chance of one, none on the run; further out, one to a
  // square of sixteen metres here and there.
  const nearFirs: Matrix4[] = [], farFirs: Matrix4[] = [];
  const fir = (x: number, z: number, list: Matrix4[], tall: number) => {
    const y = height(x, z);
    if (y < 0.5) return;
    list.push(new Matrix4().compose(new Vector3(x, y - 0.2, z), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rng.range(0, 6.3)), new Vector3(tall * rng.range(0.85, 1.15), tall, tall * rng.range(0.85, 1.15))));
  };
  for (let j = 0; j < near.nz; j++) for (let i = 0; i < near.nx; i++) {
    const x = near.x0 + i * near.cell + rng.range(-1.6, 1.6), z = near.z0 + j * near.cell + rng.range(-1.6, 1.6);
    if (coverAt(x, z) !== COVER.forest || !rng.chance(0.32)) continue;
    if (ways.some((w) => { const f = w.frame(x, z); return Math.abs(f.left) < slice.half + 2 && f.s > -20 && f.s < w.length + 20; })) continue;
    fir(x, z, nearFirs, rng.range(6, 13));
  }
  // (Drawn with the game's materials, the country has its woods painted on it, as the game's far land does, and no firs stand there.)
  for (let j = 0; j < far.nz && !game; j++) for (let i = 0; i < far.nx; i++) {
    const x = far.x0 + i * far.cell + rng.range(-6, 6), z = far.z0 + j * far.cell + rng.range(-6, 6);
    if (underNear(x, z) < 0 || coverAt(x, z) !== COVER.forest || !rng.chance(0.75)) continue;
    fir(x, z, farFirs, rng.range(7, 14));
  }
  const firPaint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const near3 = new InstancedMesh(snowyFir(3, 6, true), firPaint, nearFirs.length), far1 = new InstancedMesh(snowyFir(1, 5, false), firPaint, farFirs.length);
  nearFirs.forEach((m, k) => near3.setMatrixAt(k, m));
  farFirs.forEach((m, k) => far1.setMatrixAt(k, m));
  near3.castShadow = true;
  near3.name = 'firs'; far1.name = 'far firs';
  near3.computeBoundingSphere(); far1.computeBoundingSphere();
  group.add(far1);
  // The game's own trees in place of the near firs, where they are asked for (`slopeTrees.ts`): on the land about the run, wherever the
  // world has woods, but not on the run's snow nor within a few metres of it. (The firs are still dealt, so that what is dealt from the
  // same random numbers after them comes out as it did.)
  let woodsGrown: Woods | null = null;
  if (woods && game) {
    const onSnow = (x: number, z: number) => !Number.isNaN(gridAt(snow, x, z));
    woodsGrown = sliceWoods({
      box: [nearBox[0], nearBox[1], nearBox[2], nearBox[3]], heightAt: height, worldHeight,
      steepAt: (x, z) => (Math.hypot(height(x + 2, z) - height(x - 2, z), height(x, z + 2) - height(x, z - 2)) / 4) * worldSlope(height(x, z)),
      coverAt, cover: { data: slice.cover, nx: far.nx, nz: far.nz, x0: far.x0, z0: far.z0, cell: far.cell },
      keepOff: (x, z) => onSnow(x, z) || onSnow(x + 3, z) || onSnow(x - 3, z) || onSnow(x, z + 3) || onSnow(x, z - 3),
      seed: [...slice.world].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 99991, sky: game.sky,
    }, woods);
    group.add(woodsGrown.group);
  } else group.add(near3);

  await pause?.(0.92);
  // Where the trees drawn stand, for what goes into them (`Land.treeNear`): the game's own, or the snowy firs; kept in squares of
  // eight metres. How far out each one's trunk and lower boughs reach, from how tall it is.
  const TREE_CELL = 8, treeCells = new Map<string, { x: number; z: number; r: number; tall: number }[]>();
  const keepTree = (x: number, z: number, r: number, tall: number) => {
    const key = `${Math.floor(x / TREE_CELL)},${Math.floor(z / TREE_CELL)}`;
    let cell = treeCells.get(key);
    if (!cell) treeCells.set(key, (cell = []));
    cell.push({ x, z, r, tall });
  };
  if (woodsGrown) for (const t of woodsGrown.group.userData.trees as { x: number; z: number; tall: number }[]) keepTree(t.x, t.z, Math.min(1.5, Math.max(0.5, 0.1 * t.tall)), t.tall);
  else for (const m of nearFirs) { const p = new Vector3(), q = new Quaternion(), sc = new Vector3(); m.decompose(p, q, sc); keepTree(p.x, p.z, 0.12 * sc.x, sc.y); }
  const treeNear = (x: number, z: number, r: number) => {
    const i0 = Math.floor(x / TREE_CELL), j0 = Math.floor(z / TREE_CELL);
    let best: { x: number; z: number; r: number; tall: number } | null = null, most = Infinity;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) for (const t of treeCells.get(`${i},${j}`) ?? []) {
      const d = Math.hypot(x - t.x, z - t.z) - t.r - r;
      if (d < 0 && d < most) { most = d; best = t; }
    }
    return best;
  };

  // Where a kicker may stand: where the land falls away after its lip at least as steeply as a landing wants, and is not too steep
  // or too tilted across where it is built; and where it can be come up to (`kickerReachable`).
  function kickableOn(at: (s: number, left: number) => { x: number; z: number; dx: number; dz: number }, length: number, s: number, left: number, kick: number) {
    if (s + kick + 40 > length - 30) return false;
    if (!kickerReachable(at, height, s, kick)) return false;
    const h = (u: number, l = left) => { const p = at(u, l); return height(p.x, p.z); };
    const fallAfter = (h(s + kick + 4) - h(s + kick + 30)) / 26, fallOn = (h(s) - h(s + kick)) / kick, tilt = Math.abs(h(s + kick / 2, left - 3) - h(s + kick / 2, left + 3)) / 6;
    return fallAfter > Math.tan((13 * Math.PI) / 180) && fallOn < Math.tan((30 * Math.PI) / 180) && fallOn > Math.tan((5 * Math.PI) / 180) && tilt < 0.2;
  }
  const kickable = (s: number, left: number, kick: number) => way.kickable(s, left, kick);

  return {
    name: `${slice.worldName}, below ${slice.peak}`, short: `below ${slice.peak}`,
    // (Its heights as the world has them: the slice's land above some height was brought lower.)
    about: `${(ways[0].length / 1000).toFixed(2)} km from ${worldHeight(slice.run.heights[0]).toFixed(0)} m to ${worldHeight(slice.run.heights[slice.run.heights.length - 1]).toFixed(0)} m`,
    drop: (y: number) => worldHeight(slice.run.heights[0]) - worldHeight(y),
    fall: worldHeight(slice.run.heights[0]) - worldHeight(slice.run.heights[slice.run.heights.length - 1]),
    get length() { return way.length; },
    half: slice.half, edges, height, snowAt, treeNear, frame, at, kickable, group,
    // (Which way down is ridden, on a run that parts: kept to the one ridden on until another's path is two metres nearer, so that
    // where the two paths lie side by side, as they part, it does not go to and fro.)
    ...(ways.length > 1 ? {
      ways,
      way: () => ways.indexOf(way),
      setWay: (w: number) => { way = ways[Math.max(0, Math.min(ways.length - 1, w))]; },
      wayAt: (x: number, z: number) => {
        let best = way, out = way.outside(way.frame(x, z)) - 2;
        for (const w of ways) { if (w === way) continue; const o = w.outside(w.frame(x, z)); if (o < out) { best = w; out = o; } }
        return ways.indexOf(best);
      },
    } : {}),
    // (Off the piste, as far out over the land about the run as it is drawn, short of its edge by thirty metres.)
    roam: (x, z) => intoNear(x, z) > 30, keepAbout: () => {}, lod, fog: [380, 5200], sun: [-0.6, 0.42, -0.5], sky: 0.8,
    trees: woodsGrown ? (eye, seconds) => woodsGrown!.update(eye, seconds) : undefined,
    dispose: () => {
      // (Every shape it made, and the materials of its own; not those every land shares, the game's snow and far land and the poles'
      // paint, nor the pictures of snow, but its own copy of one. The poles' shape is shared too, but let go of with the rest, as
      // the woods' cards are: it is made again on the graphics card when next drawn.)
      woodsGrown?.dispose();
      const shared = new Set<Material>([POLE_PAINT, ...(game ? [game.snow, game.far] : [])]);
      group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const material of Array.isArray(m.material) ? m.material : [m.material]) if (!shared.has(material)) material.dispose();
        (m as unknown as { dispose?: () => void }).dispose?.();
      });
      pisteMap?.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * A fir laden with snow: `tiers` cones one over another, dark green below each and white over, for a tree a metre high (scaled); open
 * underneath, which is never seen; with a trunk under it, or (far off, where it would not be seen) none.
 */
/**
 * Snow that glints near the eye, as the game's snow does (`snowGlints`, `glinting`): here and there a grain of ice that flashes the sun
 * where its face turns it to the eye (asked: "a bit of snow sparkle ... also close by groomed / snow surface?"); fewer on packed snow.
 */
function glintingSnow(o: { map: Texture; roughness: number; vertexColors?: boolean }, share = 0.45): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: 0xffffff, ...o });
  glinting(m, snowGlints(float(share)));
  return m;
}

function snowyFir(tiers: number, sides: number, trunked: boolean): BufferGeometry {
  const parts: BufferGeometry[] = [], green = new Color(0.07, 0.15, 0.1), white = new Color(0.9, 0.93, 0.97), c = new Color();
  for (let t = 0; t < tiers; t++) {
    const r = 0.36 * (1 - t / (tiers + 0.6)), h = tiers === 1 ? 0.95 : 0.5, y0 = tiers === 1 ? 0.05 : 0.12 + t * 0.27;
    const g = new ConeGeometry(r, h, sides, 1, true).translate(0, y0 + h / 2, 0).toNonIndexed();
    const p = g.getAttribute('position'), col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const up = (p.getY(k) - y0) / h;
      c.copy(green).lerp(white, smooth01((up - 0.25) / 0.5) * 0.85);
      col.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  if (trunked) {
    const trunk = new CylinderGeometry(0.035, 0.05, 0.2, 5, 1, true).translate(0, 0.1, 0).toNonIndexed();
    trunk.deleteAttribute('uv');
    trunk.setAttribute('color', new BufferAttribute(new Float32Array(trunk.getAttribute('position').count * 3).map((_, k) => [0.2, 0.13, 0.08][k % 3]), 3));
    parts.push(trunk);
  }
  return mergeGeometries(parts)!;
}

/**
 * Whether a kicker at `s` along a run, `kick` metres long, can be come up to and flown off: not where the run turns hard between a
 * little before it and past where a skier comes down, nor where the run gives too little speed to come up to it with. (Here, for the
 * land's own `kickable` and for the cave's, `sliceGround` in `slopeDungeon.ts`, which finds where the kickers will stand before the
 * land is made: kept apart, the cave kept out of the way of kickers that were never built.)
 *
 * A kicker throws straight on: at the end of Lake Wall laid by hand, `LAID` in `tools/skiRun.ts`, where the run turns 65 degrees, the
 * demo run came down off one on the slope beside the run, too hard. The runs the search found turn no more than 44 under any.
 *
 * And the speed, how fast a skier gliding down the line's last 150 metres comes up to it, from eight metres a second, as after a
 * landing, slowed by the snow and the air: Lake Wall's at 632 metres stood just past a col where the line all but levels out, found at
 * some 20 km/h, and the demo run, slowed for the kicker before, came up to it at 19 whatever it tried, and made no trick on it. Every
 * other kicker of every run is come up to at 45 and more.
 */
export function kickerReachable(at: (s: number, left: number) => { x: number; z: number; dx: number; dz: number }, height: (x: number, z: number) => number, s: number, kick: number): boolean {
  const a = at(s - 10, 0), heading = Math.atan2(a.dz, a.dx);
  for (let u = s - 6; u <= s + kick + 40; u += 4) {
    const b = at(u, 0), d = Math.atan2(b.dz, b.dx) - heading;
    if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > (50 * Math.PI) / 180) return false;
  }
  let v = 8;
  for (let u = Math.max(0, s - 150); u < s; u += 4) {
    const p = at(u, 0), q = at(u + 4, 0), slope = Math.atan((height(p.x, p.z) - height(q.x, q.z)) / 4);
    v = Math.sqrt(Math.max(0, v * v + 2 * 4 * (9.8 * (Math.sin(slope) - 0.06 * Math.cos(slope)) - 0.003 * v * v)));
  }
  return v >= 35 / 3.6;
}
