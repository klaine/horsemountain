import { HeightField } from './terrain';
import { TILE, Tile, World, WorldPlace, worldTile, WORLD_SIZE, worldSteps } from './world';
import { Site } from './site';

/**
 * A world's land as a place built in it reads it (`docs/06-world.md`, step 3): its tiles of 5 metres
 * where they have been made, each weighed by how far inside its own lattice a point lies (as the
 * squares at a metre weigh them, `tilesAt` in `stream.ts`), and the world's own lattice of 8 metres
 * for the share of any tile not made; so near a place, where its tiles are made, the land is the
 * tiles', and further off it passes to the world's. Beyond the world's edge it is the world seen in
 * a mirror laid along that edge: land that goes on, with no streaks run out from the edge; but the
 * open sea beyond the southern edge.
 *
 * A place's site records which world it was built in (`terrain.world`), and whoever builds it reads
 * the world's land from here. In a browser the world and its tiles are made in a worker and handed
 * over (`adoptWorldLand`); in a tool, made here when first asked for (`worldLand`).
 */
export interface WorldLand {
  seed: string;
  /** Half the world's breadth and depth, in metres. */
  hx: number; hz: number;
  /** The world's lattice of 8 metres. */
  field: HeightField;
  /** The tiles of 5 metres made so far, by `i,j`: each its lattice about its middle (`ox`, `oz`). */
  tiles: Map<string, { ox: number; oz: number; field: HeightField }>;
  /** The places found in it. */
  places: WorldPlace[];
  /** Its lakes as bodies of water (`World['lakes']`), for whoever draws the country about a place. */
  lakes?: World['lakes'];
  /** Its ways (`World['ways']`), for a city built in it, whose main streets come in where its roads do (`layOutCity` in `town.ts`). */
  ways?: World['ways'];
  /** The world itself, where it was made in this thread (its tiles can then be made here too). */
  world?: World;
}

const LANDS = new Map<string, WorldLand>();
/** How far about a place its tiles of 5 metres are made: further off, the world's lattice of 8 metres is near enough. */
export const WORLD_REACH = 700;
const keyOf = (seed: string) => seed;

/** Takes up the land of a world made elsewhere (a worker), so that places built in it can read it. */
export function adoptWorldLand(land: WorldLand): WorldLand {
  LANDS.set(keyOf(land.seed), land);
  return land;
}

/** Adds a tile made elsewhere to a world's land. */
export function adoptTile(land: WorldLand, t: { i: number; j: number; ox: number; oz: number; x0: number; z0: number; cell: number; nx: number; nz: number; data: Float32Array }): void {
  const f = new HeightField(t.x0, t.z0, t.cell, t.nx, t.nz);
  f.data.set(t.data);
  land.tiles.set(`${t.i},${t.j}`, { ox: t.ox, oz: t.oz, field: f });
}

/** The land of a world already taken up or made, if it has been. */
export function knownWorldLand(seed: string): WorldLand | undefined {
  return LANDS.get(keyOf(seed));
}

/** A world's land: as taken up, or made here (all at once: for tools, and for anything that can wait half a minute). */
export function worldLand(seed: string): WorldLand {
  const had = LANDS.get(keyOf(seed));
  if (had) return had;
  const steps = worldSteps(seed, WORLD_SIZE);
  let s = steps.next();
  while (!s.done) s = steps.next();
  return landOfWorld(s.value);
}

/** The land of a world made in this thread. */
export function landOfWorld(w: World): WorldLand {
  const had = LANDS.get(keyOf(w.plan.seed));
  if (had && had.world === w) return had;
  const land: WorldLand = { seed: w.plan.seed, hx: w.plan.hx, hz: w.plan.hz, field: w.field, tiles: new Map(), places: w.places, lakes: w.lakes, ways: w.ways, world: w };
  LANDS.set(keyOf(w.plan.seed), land);
  return land;
}

/** The tiles whose lattices reach within `r` metres of a point: what a place there needs made before it is built. */
export function tilesNear(land: { hx: number; hz: number }, x: number, z: number, r: number): [number, number][] {
  const out: [number, number][] = [], reach = TILE.stride / 2 + TILE.over;
  const tx = Math.round((2 * land.hx) / TILE.stride), tz = Math.round((2 * land.hz) / TILE.stride);
  for (let j = 0; j < tz; j++) for (let i = 0; i < tx; i++) {
    const ox = -land.hx + TILE.stride / 2 + i * TILE.stride, oz = -land.hz + TILE.stride / 2 + j * TILE.stride;
    const dx = Math.max(0, Math.abs(x - ox) - reach), dz = Math.max(0, Math.abs(z - oz) - reach);
    if (Math.hypot(dx, dz) < r) out.push([i, j]);
  }
  return out;
}

/** Makes the tiles within `r` of a point, one a step (each takes a second or two): for a world made in this thread. */
export function* makeTilesNear(land: WorldLand, x: number, z: number, r: number): Generator<string, void> {
  const w = land.world;
  if (!w) return;
  for (const [i, j] of tilesNear(land, x, z, r)) {
    if (land.tiles.has(`${i},${j}`)) continue;
    yield `Making the land at five metres (${land.tiles.size + 1})`;
    const t: Tile = worldTile(w, i, j);
    land.tiles.set(`${i},${j}`, { ox: t.ox, oz: t.oz, field: t.field });
  }
}

/**
 * A point of the world in a place's own site: the inverse of the place's frame (`valleyFrame`, `islandFrame`, `worldFrame`), which
 * lays the site's point (`hx`, `hz`) over the world's (`u`, `v`), turned by `turn`.
 */
export function toSite(frame: { u: number; v: number; turn: number }, hx: number, hz: number, x: number, z: number): [number, number] {
  const c = Math.cos(frame.turn), sn = Math.sin(frame.turn), du = x - frame.u, dv = z - frame.v;
  return [hx + c * du + sn * dv, hz - sn * du + c * dv];
}

/**
 * How a place built in a world lies in it: the point of its site (`hx`, `hz`) its frame lays over the world's (`u`, `v`), turned by
 * `turn`, and the height in the world of its ground (`base`), which is its forecourt's floor in the site. That point is the middle of
 * the forecourt for a valley, the middle of the level ground for an island or a mountain top, and the middle of the quay's edge for a
 * town. Nothing for a place not built in a world.
 */
export interface SiteFrame { world: string; u: number; v: number; turn: number; base: number; hx: number; hz: number; floor: number }
export function siteFrame(site: Site): SiteFrame | null {
  const middle = (r: { x0: number; x1: number; z0: number; z1: number }) => [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] as const;
  const approach = site.places.find((q) => q.role === 'approach');
  if (!approach) return null;
  const of = (t: { world?: string; u?: number; v?: number; turn?: number; base?: number } | undefined, at: readonly [number, number]): SiteFrame | null =>
    t?.world && t.u !== undefined && t.v !== undefined && t.turn !== undefined && t.base !== undefined ? { world: t.world, u: t.u, v: t.v, turn: t.turn, base: t.base, hx: at[0], hz: at[1], floor: approach.floor } : null;
  if (site.valley?.terrain?.world) return of(site.valley.terrain, middle(approach));
  if (site.island?.terrain?.world) return of(site.island.terrain, middle(site.island.level));
  if (site.mountain?.terrain?.world) return of(site.mountain.terrain, middle(site.mountain.level));
  if (site.town?.terrain.world) return of(site.town.terrain, [(site.town.quay.x0 + site.town.quay.x1) / 2, site.town.quay.z]);
  return null;
}

/**
 * The house each place of a world has, when no other is asked for: its seed is the world's and the place's, so that the same place
 * is the same house wherever it is gone to from, and a place built beforehand (`placesWorker.ts`) is the one the game builds.
 * `next` for the place's next house, where its own will not go there (`generateWorldPlace`).
 */
export function placeSeed(world: string, kind: WorldPlace['kind'], n: number, next = 0): string {
  return `${world}-${kind}${n}${next ? `-${next + 1}` : ''}`;
}

/** A point of a place's site in its world: the frame's own sum (`valleyFrame`, `islandFrame`, `worldFrame`, `townFrame`). */
export function toWorld(f: SiteFrame, x: number, z: number): [number, number] {
  const c = Math.cos(f.turn), sn = Math.sin(f.turn), dx = x - f.hx, dz = z - f.hz;
  return [f.u + c * dx - sn * dz, f.v + sn * dx + c * dz];
}

/**
 * The level of the water of the world's lakes at a point of a place's site, in the site's heights, or nothing where no lake is: from
 * each lake's shore as a ring of points (`World['lakes']`, which is what a world made in a worker hands over), a point being in a
 * lake if it is inside the ring or within six metres of a point of it, so that the shore is taken a little wide. For what grows in
 * the country about a place, which stood in the lakes: the far trees favour low hollows, and a lake fills one. Nothing for a place
 * not built in a world.
 */
export function lakeLevelAt(site: Site): ((x: number, z: number) => number | null) | null {
  const f = siteFrame(site);
  if (!f) return null;
  const lakes = (worldLand(f.world).lakes ?? []).map((lk) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of lk.outline) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { ...lk, x0: x0 - 6, x1: x1 + 6, z0: z0 - 6, z1: z1 + 6 };
  });
  if (!lakes.length) return null;
  return (x: number, z: number) => {
    const [wx, wz] = toWorld(f, x, z);
    for (const lk of lakes) {
      if (wx < lk.x0 || wx > lk.x1 || wz < lk.z0 || wz > lk.z1) continue;
      const ring = lk.outline;
      let inside = false, near = false;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const [ax, az] = ring[a], [bx, bz] = ring[b];
        if ((az > wz) !== (bz > wz) && wx < ((bx - ax) * (wz - az)) / (bz - az) + ax) inside = !inside;
        if (!near && (ax - wx) ** 2 + (az - wz) ** 2 < 36) near = true;
      }
      if (inside || near) return lk.level - f.base + f.floor;
    }
    return null;
  };
}

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/**
 * The world's own lattice at a point, the world mirrored beyond its edge; except beyond its southern edge, which is the open sea's,
 * where the land sinks away. (Mirrored there too, the mountains of the far north stood across the water from the islands, white.)
 */
function fieldAt(land: WorldLand, x: number, z: number): number {
  const mirror = (v: number, h: number) => (v > h ? 2 * h - v : v < -h ? -2 * h - v : v);
  const y = land.field.smoothAt(mirror(x, land.hx - 4), mirror(z, land.hz - 4)), past = z - land.hz;
  return past > 0 ? Math.min(y, -12 - past * 0.03) : y;
}

/** The height of a world's land at a point of the world (`x` east, `z` south, metres from its middle). */
export function landAt(land: WorldLand, x: number, z: number): number {
  const reach = TILE.stride / 2 + TILE.over, tx = Math.round((2 * land.hx) / TILE.stride), tz = Math.round((2 * land.hz) / TILE.stride);
  const ci = Math.floor((x + land.hx) / TILE.stride), cj = Math.floor((z + land.hz) / TILE.stride);
  let sum = 0, weight = 0, coarse = 0, wanted = false;
  for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
    if (i < 0 || j < 0 || i >= tx || j >= tz) continue;
    const ox = -land.hx + TILE.stride / 2 + i * TILE.stride, oz = -land.hz + TILE.stride / 2 + j * TILE.stride;
    const inside = Math.min(reach - Math.abs(x - ox), reach - Math.abs(z - oz));
    if (inside <= 0) continue;
    const w = smooth(inside / (2 * TILE.over)) + 1e-6, t = land.tiles.get(`${i},${j}`);
    if (t) sum += w * t.field.smoothAt(x - ox, z - oz);
    else { coarse += w; wanted = true; }
    weight += w;
  }
  if (weight <= 0) return fieldAt(land, x, z);
  if (wanted) sum += coarse * fieldAt(land, x, z);
  return sum / weight;
}
