/**
 * The woods of a world's run as the game grows them (asked: "we need better graphics for desktop, can we bring the actual dungeons game
 * side trees?"): its own trees, as its walk over the world plants them on the world's land (klaine/dungeons, `src/worldwalk/dress.ts`,
 * and from it `treesIn`, `woodDepth`, `growTrees` and `farTrees` here, kept as they are there but for the winter and the kinds), in
 * winter as its valleys have it: the spruces and pines keeping their needles, snow on two in five of their sprays. And only those
 * (asked: "what if we just replaced the broadleaf trees with firs and spruce in this skiing game"): where the game would grow an oak or
 * an ash, low down, a spruce stands, so that the woods are snowy conifers to the foot of the run. (Grown as the game grows them in
 * winter, bare, every twig drawn, a wood of oaks and ashes on the foothills had cost more than all the rest of a frame.) Planted on the
 * land about the run (`Land`'s near grid), where the world has woods, and none on the run's own snow; beyond it the country has its
 * woods painted on it, as the game's far land does.
 *
 * Each tree is grown by the game's own `growConifer` (`src/render/planting.ts`): a trunk and its wood in the game's meshes, drawn with
 * its bark (`makeSiteMaterial`, the barks painted by `textures.ts`), and its needles as cards
 * (`src/render/vegetation.ts`). Drawn three ways, as the walk draws the world's woods: whole near the eye, grown more simply further
 * off, one painted card beyond, each tree giving way from one to the next at a distance of its own (`treeLevels`, `treeShare`). The
 * painted cards are made at once for every tree; the trees whole and simply are grown in blocks of thirty-two metres about the eye as
 * it goes, the nearest first, a few a frame, coming in over half a second (`treeGrownMap`), and let go of once far behind.
 */
import { BufferAttribute, Group, type InstancedMesh, type Material, Mesh, type Object3D, type Texture, type Vector3 } from 'three';
import { attribute, mix, positionLocal, step } from 'three/tsl';
import { fbm2, Rng } from '../src/core/rng';
import { MeshBuilder } from '../src/render/geom/meshBuilder';
import { type Colour, growConifer, Planting } from '../src/render/planting';
import type { CardSet } from '../src/render/scene';
import { makeSiteMaterial } from '../src/render/siteMaterial';
import { doneGenerating, generateTextureSet } from '../src/render/textures';
import { cullCards, makeCards, paintCards, treeGrownMap, treeLevels, type TreeLevel, treeShare, vegetationUniforms } from '../src/render/vegetation';

/** What lies on the world's land (`COVER` in the game's `src/core/world.ts`). */
const COVER = { sea: 0, lake: 1, shore: 2, marsh: 3, fields: 4, pasture: 5, forest: 6, moor: 7, rock: 8, snow: 9 } as const;
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** The ground the woods stand on, as the land about the run has it. */
export interface WoodsGround {
  /** Where trees may stand: the land about the run, from its least x and z to its greatest. */
  box: [number, number, number, number];
  /** The snow's height at a point; and a height as the world has it (where the slice's land was brought lower). */
  heightAt(x: number, z: number): number;
  worldHeight(y: number): number;
  /** How steep the world's own land is at a point (rise over run). */
  steepAt(x: number, z: number): number;
  /** What lies there (`COVER`), and the world's cover as it is kept, on the far grid's lattice, for how far inside a wood a point is. */
  coverAt(x: number, z: number): number;
  cover: { data: Uint8Array; nx: number; nz: number; x0: number; z0: number; cell: number };
  /** Where none may stand: on the run's snow. */
  keepOff(x: number, z: number): boolean;
  /** The world's own number, for each tree's choices; the sky's light, which lights the wood. */
  seed: number;
  sky: Colour;
}

export interface Woods {
  group: Group;
  /** A frame of it: grows what the eye wants near it and lets go of what is far, and moves the wind (`seconds`, the page's clock). */
  update(eye: Vector3, seconds: number): void;
  /** Lets go of every block grown, when its land is let go of. */
  dispose(): void;
}

// ---------------------------------------------------------------- where they stand (`treesIn`, `woodDepth` in the game's `dress.ts`)

/** A tree of the world: where it stands, what it is, how tall and stout, and a number of its own. */
interface WorldTree { x: number; z: number; kind: 'spruce' | 'pine'; tall: number; girth: number; own: number }

/**
 * How far a point lies inside the world's woods, in metres: more than nothing in a wood (how far in from its edge), less than nothing
 * outside one (how far out), from the world's cover on its lattice, worked out once (two sweeps each way). Read between the lattice's points.
 */
function woodDepth(cover: Uint8Array, nx: number, nz: number, x0: number, z0: number, cell: number): (x: number, z: number) => number {
  const sweep = (inside: boolean): Float32Array => {
    const d = new Float32Array(nx * nz), c = cell, c2 = cell * Math.SQRT2;
    for (let k = 0; k < d.length; k++) d[k] = (cover[k] === COVER.forest) === inside ? 1e9 : 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!d[k]) continue;
      let m = d[k];
      if (i > 0) m = Math.min(m, d[k - 1] + c);
      if (j > 0) { m = Math.min(m, d[k - nx] + c); if (i > 0) m = Math.min(m, d[k - nx - 1] + c2); if (i < nx - 1) m = Math.min(m, d[k - nx + 1] + c2); }
      d[k] = m;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (!d[k]) continue;
      let m = d[k];
      if (i < nx - 1) m = Math.min(m, d[k + 1] + c);
      if (j < nz - 1) { m = Math.min(m, d[k + nx] + c); if (i < nx - 1) m = Math.min(m, d[k + nx + 1] + c2); if (i > 0) m = Math.min(m, d[k + nx - 1] + c2); }
      d[k] = m;
    }
    return d;
  };
  const inn = sweep(true), out = sweep(false), signed = new Float32Array(nx * nz);
  for (let k = 0; k < signed.length; k++) signed[k] = inn[k] ? inn[k] - cell / 2 : -(out[k] - cell / 2);
  return (x, z) => {
    const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / cell)), fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / cell)), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * nx + i;
    return (signed[k] * (1 - tx) + signed[k + 1] * tx) * (1 - tz) + (signed[k + nx] * (1 - tx) + signed[k + nx + 1] * tx) * tz;
  };
}

/**
 * The trees in a square of ground (`size` metres from `x0`, `z0`), as the game plants the world's: one to a cell of seven metres where
 * the world has woods, and in a wood's heart now and then a second; fewer towards a wood's edge; past it single trees in the open,
 * fewer the further out; none on rock, snow or water, nor on ground too steep. Spruce, and pine higher, pine alone near the treeline
 * (by the world's own heights); spruce too low down, where the game grows oaks and ashes. The same trees whoever asks, so that a tree
 * drawn far off as a card and near by whole is the same tree.
 */
function treesIn(x0: number, z0: number, size: number, g: WoodsGround, depthAt: (x: number, z: number) => number): WorldTree[] {
  const CELL = 7, out: WorldTree[] = [], seed = g.seed;
  const hash = (i: number, j: number, k: number) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k + seed, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const [bx0, bz0, bx1, bz1] = g.box;
  for (let j = Math.floor(z0 / CELL); j < Math.ceil((z0 + size) / CELL); j++) for (let i = Math.floor(x0 / CELL); i < Math.ceil((x0 + size) / CELL); i++) {
    for (let pair = 0; pair < 2; pair++) {
      const o = pair * 10, x = (i + 0.1 + 0.8 * hash(i, j, 1 + o)) * CELL, z = (j + 0.1 + 0.8 * hash(i, j, 2 + o)) * CELL;
      if (x < x0 || x >= x0 + size || z < z0 || z >= z0 + size || x < bx0 || x > bx1 || z < bz0 || z > bz1 || g.keepOff(x, z)) continue;
      const cv = g.coverAt(x, z), y = g.worldHeight(g.heightAt(x, z)), deep = depthAt(x, z);
      const dense = fbm2(x * 0.012 + seed * 0.01, z * 0.012, 3);
      const open = cv === COVER.pasture ? 1 : cv === COVER.moor ? 0.6 : cv === COVER.fields ? 0.2 : 0;
      const chance = cv === COVER.forest
        ? (pair ? 0.3 * smooth((deep - 18) / 25) * smooth((dense - 0.3) / 0.3) : (0.32 + 0.6 * smooth(deep / 26)) * (0.8 + 0.2 * smooth((dense - 0.3) / 0.3)))
        : pair ? 0 : open * (0.022 + 0.2 * (1 - smooth(-deep / 45)));
      if (y < 2 || hash(i, j, 3 + o) > chance) continue;
      if (g.steepAt(x, z) > 0.75) continue;
      const r = hash(i, j, 4 + o), high = smooth((y - 90) / 120);
      const kind: WorldTree['kind'] = y > 260 || r < high * 0.45 ? 'pine' : 'spruce';
      const s = hash(i, j, 6 + o), stunt = (1 - 0.35 * smooth((y - 220) / 120)) * (0.85 + 0.15 * smooth(deep / 20));
      const tall = (kind === 'spruce' ? 9 + 5 * s : 10 + 5 * s) * stunt;
      out.push({ x, z, kind, tall, girth: 0.18 + 0.1 * s, own: hash(i, j, 7 + o) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- how they are grown and drawn

/** Snow on a bough, as the game's valleys have it in winter. */
const SNOWED: Colour = [0.74, 0.77, 0.82];
const leafOf = (base: Colour) => (q: Rng): Colour => { const t = q.range(0.7, 1.25); return [base[0] * t, base[1] * t * q.range(0.92, 1.08), base[2] * t]; };
/** A conifer's needles in winter: two sprays in five under snow. */
const needleOf = (base: Colour) => (q: Rng): Colour => (q.chance(0.4) ? leafOf(SNOWED)(q) : leafOf(base)(q));

/**
 * Marks what is grown between `begin` and `end` as one tree's: every card added to the planting's sets and every point added to the
 * wood's meshes, whose numbers `owners` gives, four to a point, once all is grown (for the levels to give way tree by tree).
 */
function tagger(planting: Planting, wood: Map<string, MeshBuilder>) {
  const sets = (): CardSet[] => [planting.leaves, planting.needles, planting.pines, planting.firs, planting.farTrees];
  const runs = new Map<string, number[]>();
  let cardsBefore: number[] = [], woodBefore = new Map<string, number>();
  return {
    begin() { cardsBefore = sets().map((s) => s.matrices.length / 16); woodBefore = new Map([...wood].map(([k, b]) => [k, b.vertexCount])); },
    end(x: number, y: number, z: number, own: number) {
      sets().forEach((s, k) => { const list = (s.trees ??= []); for (let c = cardsBefore[k]; c < s.matrices.length / 16; c++) list.push(x, y, z, own); });
      for (const [k, b] of wood) { let r = runs.get(k); if (!r) runs.set(k, (r = [])); r.push(woodBefore.get(k) ?? 0, b.vertexCount, x, y, z, own); }
    },
    owners(): Map<string, Float32Array> {
      const out = new Map<string, Float32Array>();
      for (const [k, b] of wood) {
        const a = new Float32Array(b.vertexCount * 4), r = runs.get(k) ?? [];
        for (let q = 0; q < r.length; q += 6) for (let v = r[q]; v < r[q + 1]; v++) a.set([r[q + 2], r[q + 3], r[q + 4], r[q + 5]], v * 4);
        out.set(k, a);
      }
      return out;
    },
  };
}

/**
 * Trees grown whole, as the game's are near the walker (a little less finely than a valley's own); or, `light`, more simply, a trunk and
 * its main limbs with fewer, larger sprays, for those further off. In winter: snowed on. Grown a tree at a time (`grow`), so that a
 * block of them can be grown over several frames; then what was grown (`done`).
 */
function treeGrower(heightAt: (x: number, z: number) => number, light: boolean) {
  const detail = light ? 0.25 : 0.75;
  const planting = new Planting(), wood = new Map<string, MeshBuilder>();
  const mesh = (name: string) => { let m = wood.get(name); if (!m) wood.set(name, (m = new MeshBuilder(4096))); return m; };
  const tag = tagger(planting, wood);
  return {
    grow(t: WorldTree) {
      const y = heightAt(t.x, t.z), rng = new Rng(`tree/${t.x.toFixed(1)},${t.z.toFixed(1)}`);
      tag.begin();
      if (t.kind === 'spruce') growConifer(planting, mesh('barkFir'), t.x, y, t.z, t.tall, 2.1 + 0.6 * t.own, t.girth, { kind: 'spruce', detail, needle: needleOf([0.045, 0.13, 0.04]), bark: [0.62, 0.5, 0.42], shaded: true, soft: mesh('barkFir') }, rng);
      else growConifer(planting, mesh('barkPine'), t.x, y, t.z, t.tall, 2.6 + 0.4 * t.own, t.girth, { kind: 'pine', detail, needle: needleOf([0.07, 0.15, 0.07]), bark: [0.98, 0.6, 0.42], shaded: true, soft: mesh('barkPine') }, rng);
      tag.end(t.x, y, t.z, t.own);
    },
    done: (): { wood: Map<string, MeshBuilder>; sets: CardSet[]; owners: Map<string, Float32Array> } => ({ wood, sets: planting.sets, owners: tag.owners() }),
  };
}

/** Trees far off, each one card with a whole tree painted on it, as the game's valleys paint a conifer in winter: green and white together. */
function farTrees(trees: WorldTree[], heightAt: (x: number, z: number) => number): CardSet[] {
  const planting = new Planting(), firs: Colour[] = [[0.05, 0.12, 0.05], [0.06, 0.14, 0.06], [0.07, 0.15, 0.07]];
  const tag = tagger(planting, new Map());
  for (const t of trees) {
    const k = 0.75 + 0.3 * ((t.own * 7.3) % 1), y = heightAt(t.x, t.z), c0 = firs[Math.floor(t.own * 2.999)];
    const c: Colour = [(c0[0] * 0.6 + SNOWED[0] * 0.4) * k, (c0[1] * 0.6 + SNOWED[1] * 0.4) * k, (c0[2] * 0.6 + SNOWED[2] * 0.4) * k];
    tag.begin();
    planting.farTree(true, t.x, y - 0.5, t.z, t.tall * 0.42, t.tall, t.own * 6.283, c);
    tag.end(t.x, y, t.z, t.own);
  }
  return planting.sets;
}

/**
 * What every slope's woods share, made once: which blocks of trees are grown (`treeGrownMap`, made before any material that draws trees
 * in levels; wide enough for any run's land about it); the barks, each drawn at one level or the other and drawn into a point at its
 * tree's foot at the other (as the walk's are, `makeMaterials` in `dress.ts`); the painted cards; and the cards' materials, one of each
 * kind for each level and layer, which every block draws with. (`makeCards` makes its own for each block; each material made is put
 * together again before it is first drawn, at some milliseconds each, and a block came in with a jolt.)
 */
const LOW = 32, HALF = 3072;
let kit: { grown: ReturnType<typeof treeGrownMap>; barks: Record<string, Material>; painted: Map<string, Texture>; cards: Map<string, Material>; active: unknown } | null = null;
function kitOf(texSize: number) {
  if (kit) return kit;
  const grown = treeGrownMap(HALF, HALF, LOW);
  const moss = generateTextureSet('moss', texSize / 2, 9), barkPine = generateTextureSet('barkPine', texSize, 61), barkFir = generateTextureSet('barkFir', texSize, 67);
  doneGenerating();
  const makers: Record<string, () => Material> = {
    barkPine: () => makeSiteMaterial(barkPine, moss, { normalScale: 2, mossScale: 2.5, matt: true, deep: 0.04, hollow: 0.35 }),
    barkFir: () => makeSiteMaterial(barkFir, moss, { normalScale: 2, mossScale: 2.5, matt: true, deep: 0.03, hollow: 0.6 }),
  };
  const barks: Record<string, Material> = {};
  for (const [name, make] of Object.entries(makers)) for (const level of ['whole', 'simple'] as const) {
    const m = make() as Material & { positionNode: unknown }, tree = attribute('aTree', 'vec4');
    m.positionNode = mix(tree.xyz, positionLocal, step(0.5, treeShare(level, tree)));
    barks[`${name}:${level}`] = m;
  }
  return (kit = { grown, barks, painted: new Map(), cards: new Map(), active: null });
}

/** Cards of a planting made into meshes, each kind's painting made once; trees' cards at the level they are drawn at, with the kit's materials. */
function cardsOf(k: NonNullable<typeof kit>, sets: CardSet[], level: TreeLevel): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  for (const set of sets) {
    let t = k.painted.get(set.kind);
    if (!t) k.painted.set(set.kind, (t = paintCards(set.kind)));
    for (const m of makeCards(set, t, level)) {
      // (Sprigs, the leaves made one by one near the eye, only for trees grown whole: a tree grown simply or painted is never so near
      // as to show its own, but its sprigs were gathered and drawn all the same, larger, over the whole tree's, wherever a block grown
      // both ways lay by the eye; and each kept a copy of all its sprigs to gather from.)
      if (m.userData.layer === 'sprigs' && level !== 'whole') { m.geometry.dispose(); (m.material as Material).dispose(); continue; }
      const key = `${m.name}:${level}:${m.userData.layer}`, had = k.cards.get(key);
      if (had) { (m.material as Material).dispose(); m.material = had; } else k.cards.set(key, m.material as Material);
      out.push(m);
    }
  }
  return out;
}

/** Wood as the game's meshes carry it, lit by the sky as the game lights what it does not bake, by each point's share of it. */
function woodMesh(builder: MeshBuilder, material: Material, sky: Colour): Mesh {
  const geometry = builder.build();
  const sh = [geometry.getAttribute('aSHr'), geometry.getAttribute('aSHg'), geometry.getAttribute('aSHb')] as BufferAttribute[], bk = geometry.getAttribute('aBake') as BufferAttribute;
  for (let i = 0; i < builder.vertexCount; i++) {
    const open = 0.3 + 0.7 * builder.openAt(i);
    for (let c = 0; c < 3; c++) sh[c].setXYZW(i, (Math.PI / 2) * sky[c] * open, 0, (Math.PI / 2) * sky[c] * 0.8 * open, 0);
    bk.setXY(i, open, 0.6);
  }
  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true; mesh.castShadow = true; mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Where each tree gives way from whole to simple and from simple to painted, nearer than the walk has them (110 to 150 metres, 300 to
 * 360): the eye here follows the skier, the trees stand fifty metres and more off the run, and a wood drawn out to the walk's
 * distances, a thousand and more trees grown simply about the eye and some three hundred whole, doubled what a frame cost.
 */
treeLevels.uNear.value.set(75, 105);
treeLevels.uFar.value.set(230, 290);
/**
 * How near a block must lie to be grown whole, how far and how near to be grown simply (grown a little past where each way is seen,
 * as the walk grows them: `WHOLE`, `SIMPLE_FROM`, `MID` in its `main.ts`); how long a block just grown takes to come in; and how much
 * of each frame growing may take, in milliseconds.
 */
const BEYOND = 6, RISE = 600, BUDGET = 3;
const WHOLE = treeLevels.uNear.value.y + treeLevels.uSoft.value + BEYOND, SIMPLE_FROM = treeLevels.uNear.value.x - treeLevels.uSoft.value - BEYOND, MID = treeLevels.uFar.value.y + treeLevels.uSoft.value + BEYOND;

/** The woods of the land about a run; its textures `texSize` across. */
export function sliceWoods(g: WoodsGround, texSize: number): Woods {
  const k = kitOf(texSize), group = new Group();
  group.name = 'woods';
  const cv = g.cover, depthAt = woodDepth(cv.data, cv.nx, cv.nz, cv.x0, cv.z0, cv.cell);
  const [x0, z0, x1, z1] = g.box;
  // The painted trees, every one of them, made at once (drawn only beyond where each is drawn simply, or where its nearer way is not
  // grown yet), and casting no shadow, as the walk's.
  const all = treesIn(x0, z0, Math.max(x1 - x0, z1 - z0) + 1, g, depthAt);
  for (const m of cardsOf(k, farTrees(all, g.heightAt), 'painted')) { m.castShadow = false; group.add(m); }
  // (Where each tree stands and what it is, for a script that drives the page: `__slope.trees()`.)
  group.userData.trees = all;
  const bi0 = Math.floor(x0 / LOW), bi1 = Math.floor(x1 / LOW), bj0 = Math.floor(z0 / LOW), bj1 = Math.floor(z1 / LOW);
  const nears = new Map<string, Object3D[]>(), mids = new Map<string, Object3D[]>();
  const rising = new Map<string, { bi: number; bj: number; level: 'whole' | 'simple'; t0: number }>();
  /**
   * The block being grown: its trees grown one at a time, then its wood made into meshes one bark at a time, then its cards, a little of
   * it each frame (`BUDGET`), so that no frame waits on a whole block. (Grown at once, a block of whole trees in a thick wood took forty
   * milliseconds, and riding through a wood the picture jolted every few frames.)
   */
  let growing: {
    bi: number; bj: number; simply: boolean; trees: WorldTree[]; next: number; grower: ReturnType<typeof treeGrower>;
    made: { wood: [string, MeshBuilder][]; sets: CardSet[]; owners: Map<string, Float32Array> } | null; out: Object3D[];
  } | null = null;
  const start = (bi: number, bj: number, simply: boolean) => {
    growing = { bi, bj, simply, trees: treesIn(bi * LOW, bj * LOW, LOW, g, depthAt), next: 0, grower: treeGrower(g.heightAt, simply), made: null, out: [] };
  };
  /** A step of growing: a tree, or a bark's mesh, or the cards and the block done. */
  const grow = () => {
    const b = growing!, level = b.simply ? 'simple' : 'whole';
    if (b.next < b.trees.length) { b.grower.grow(b.trees[b.next++]); return; }
    if (!b.made) { const d = b.grower.done(); b.made = { wood: [...d.wood].filter(([, w]) => w.triangleCount > 0), sets: d.sets, owners: d.owners }; return; }
    const w = b.made.wood.pop();
    if (w) {
      const [name, builder] = w, m = woodMesh(builder, k.barks[`${name}:${level}`], g.sky);
      // (Each point of wood says which tree it is, for the level it is drawn at: `aTree`.)
      m.geometry.setAttribute('aTree', new BufferAttribute(b.made.owners.get(name)!, 4));
      b.out.push(m);
      return;
    }
    b.out.push(...cardsOf(k, b.made.sets, level));
    // (Those grown simply are well beyond the sun's shadows about the skier, and cast none.)
    for (const m of b.out) { if (b.simply) m.castShadow = false; group.add(m); }
    (b.simply ? mids : nears).set(`${b.bi},${b.bj}`, b.out);
    rising.set(`${level}:${b.bi},${b.bj}`, { bi: b.bi, bj: b.bj, level, t0: performance.now() });
    growing = null;
  };
  const drop = (meshes: Object3D[]) => {
    for (const m of meshes) {
      m.removeFromParent();
      // (The wood's geometry is its own; the cards' blocks share their shape's buffers, which are made again when next drawn.)
      (m as Mesh).geometry?.dispose();
      // (And what the renderer keeps for the mesh itself, its matrices and colours on the graphics card among it, let go of now: left
      // to be found unused, it was kept as long as the materials, which every block shares, and riding through a wood it only grew.)
      m.dispose();
    }
  };
  const letGo = (bi: number, bj: number, level: 'whole' | 'simple') => { rising.delete(`${level}:${bi},${bj}`); k.grown.set(bi, bj, level, 0); };
  const dropAll = () => {
    for (const [key, meshes] of nears) { const [i, j] = key.split(',').map(Number); drop(meshes); letGo(i, j, 'whole'); }
    for (const [key, meshes] of mids) { const [i, j] = key.split(',').map(Number); drop(meshes); letGo(i, j, 'simple'); }
    nears.clear(); mids.clear(); rising.clear();
    if (growing) { drop(growing.out); growing = null; }
  };
  const self = { dropAll };
  return {
    group,
    update(eye, seconds) {
      // (Another run's woods had the blocks: theirs let go of, and the map of what is grown cleared for these.)
      if (k.active !== self) { (k.active as typeof self | null)?.dropAll(); k.grown.clear(); k.active = self; }
      const blockNear = (i: number, j: number) => Math.hypot(Math.max(0, i * LOW - eye.x, eye.x - (i + 1) * LOW), Math.max(0, j * LOW - eye.z, eye.z - (j + 1) * LOW));
      const blockFar = (i: number, j: number) => Math.hypot(Math.max(eye.x - i * LOW, (i + 1) * LOW - eye.x), Math.max(eye.z - j * LOW, (j + 1) * LOW - eye.z));
      // (A block being grown that the eye has since gone far from, as a cut of the cinematic view can take it, is given up.)
      if (growing && blockNear(growing.bi, growing.bj) > (growing.simply ? MID + 50 : WHOLE + 40)) { drop(growing.out); growing = null; }
      // What is wanted: the nearest block not grown whole within reach, or else the nearest not grown simply; a little of it each frame.
      const deadline = performance.now() + BUDGET;
      while (performance.now() < deadline) {
        if (!growing) {
          const r = Math.ceil(MID / LOW) + 1, ci = Math.floor(eye.x / LOW), cj = Math.floor(eye.z / LOW);
          let whole: [number, number, number] | null = null, simple: [number, number, number] | null = null;
          for (let j = Math.max(bj0, cj - r); j <= Math.min(bj1, cj + r); j++) for (let i = Math.max(bi0, ci - r); i <= Math.min(bi1, ci + r); i++) {
            const d = blockNear(i, j), key = `${i},${j}`;
            if (d < WHOLE && !nears.has(key) && (!whole || d < whole[2])) whole = [i, j, d];
            if (d < MID && blockFar(i, j) > SIMPLE_FROM && !mids.has(key) && (!simple || d < simple[2])) simple = [i, j, d];
          }
          const next = whole ?? simple;
          if (!next) break;
          start(next[0], next[1], !whole);
        }
        grow();
      }
      const cards: InstancedMesh[] = [];
      const show = (meshes: Object3D[], on: boolean) => { for (const m of meshes) { m.visible = on; if (on && (m as InstancedMesh).isInstancedMesh) cards.push(m as InstancedMesh); } };
      // Each level let go of well past where it is drawn, and, while kept, not drawn at all where every tree in the block is drawn the
      // other way (the shader would draw it into nothing, at the cost of its points).
      for (const [key, meshes] of nears) {
        const [i, j] = key.split(',').map(Number), d = blockNear(i, j);
        if (d > WHOLE + 40) { drop(meshes); nears.delete(key); letGo(i, j, 'whole'); continue; }
        show(meshes, d < WHOLE - BEYOND);
      }
      for (const [key, meshes] of mids) {
        const [i, j] = key.split(',').map(Number), d = blockNear(i, j), far = blockFar(i, j);
        if (d > MID + 50 || far < SIMPLE_FROM - 20) { drop(meshes); mids.delete(key); letGo(i, j, 'simple'); continue; }
        show(meshes, far > SIMPLE_FROM + BEYOND && d < MID - BEYOND);
      }
      // (The cards of the blocks that are drawn, each then drawn or not by how near it is: `cullCards` after the blocks are settled,
      // and only for those left on. Before them, over every block kept, it turned the spruces' cards back on in blocks just turned
      // off, to be drawn into nothing at the cost of all their points.)
      cullCards(cards, eye);
      // Blocks just grown come in, and the shader is told.
      const now = performance.now();
      for (const [key, b] of rising) { const t = (now - b.t0) / RISE; k.grown.set(b.bi, b.bj, b.level, t); if (t >= 1) rising.delete(key); }
      k.grown.flush();
      vegetationUniforms.uTime.value = seconds;
    },
    dispose() {
      // (As when another run's woods take the blocks over; and, were these the woods last grown, the map of what is grown cleared, so
      // that nothing is left holding on to them.)
      dropAll();
      if (k.active === self) { k.grown.clear(); k.grown.flush(); k.active = null; }
    },
  };
}
