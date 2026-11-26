import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat, Vector2, Vector3, Vector4 } from 'three';
import { MeshStandardNodeMaterial, PhysicalLightingModel } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { TextureSet } from './textures';
import type { PaveFrame } from './scene';

/**
 * The materials used for all static site geometry: standard physically based materials with
 *  - indirect light taken from the per-vertex bake instead of a uniform ambient term,
 *  - moss, damp and soot blended in from per-vertex fields, following the height map so growth
 *    starts in the low spots.
 *
 * They are written as node materials: each is a standard material whose colour, roughness and
 * normal are given as small programs built here, and whose lighting is the standard lighting
 * with three things changed (see `BakedLighting`). The renderer turns them into whatever its
 * graphics interface wants, WebGPU or WebGL 2.
 */

/**
 * A piece of such a program. The library's own types for these are stricter than is useful here:
 * they want every step of a calculation to declare whether it is one number or three, which
 * the calculation already knows. So the pieces, and the functions that make them, are taken untyped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const {
  Break, Fn, If, Loop, abs, attribute, cameraPosition, clamp, cos, cross, dFdx, dFdy, dot, exp, float, floor, fract, fwidth, ivec2, length, materialRoughness, max, min, mix,
  normalMap, normalView, normalViewGeometry, normalWorld, normalWorldGeometry, normalize, positionView, positionViewDirection, positionWorld, pow, select, sin, smoothstep, step, texture, transformNormalToView,
  time, uniform, uv, vec2, vec3, vec4, vertexColor,
} = TSL as N;

export interface SiteUniforms {
  /** 0 before the bake has arrived, 1 once it has. */
  uBake: { value: number };
  /** Stand-in sky light used until the bake arrives. */
  uFallback: { value: Vector3 };
}

/**
 * Where a place's near ground gives way to its far land, for a place whose two are the one land (a mountain top on a world's summit):
 * the rectangle the near ground is laid over (`x0`, `z0`, `x1`, `z1`), and how broad a band inside its edge the one passes into the
 * other over. A band of nothing, as for every other place, and nothing is passed over. (Where the near ground ended along a straight
 * line and the far land's own material began, the place stood in its world as a square set into it.)
 */
export const nearFarUniforms: { uNearRect: { value: Vector4 }; uNearBand: { value: number } } = {
  uNearRect: uniform(new Vector4(0, 0, 0, 0)) as N,
  uNearBand: uniform(0) as N,
};
/**
 * The near ground's share of a point of the band, 0 at its outer edge to 1 at its inner; and patches on the ground a couple of metres
 * across, which the two kinds of ground are cut by: the near ground is drawn where a patch is under the share, the far land where it
 * is not, so that across the band the near ground breaks up into the far land as ground cover thins out. (Cut by the points of the
 * picture instead, the band was a hatched stripe across the hillside: the two kinds of ground are not alike, and side by side at every
 * other point of the picture they showed as a weave.) The far land is cut a little short of the near ground and laid a little under
 * it there (`layRange`), so that where the two surfaces, a few centimetres apart, see a patch's edge differently, both are drawn and
 * the near ground shows, rather than neither and a hole.
 */
function nearFarCut(side: 'near' | 'far'): { opacity: N; test: N } {
  const r = nearFarUniforms.uNearRect as N, band = nearFarUniforms.uNearBand as N, p: N = positionWorld.xz;
  const inside: N = min(min(p.x.sub(r.x), r.z.sub(p.x)), min(p.y.sub(r.y), r.w.sub(p.y)));
  const share: N = min(max(inside.div(max(band, 0.001)), 0), 1);
  const patch: N = farNoise(p.div(2.4)).mul(0.65).add(farNoise(p.div(0.85).add(7.3)).mul(0.35));
  // (The patches' values lie mostly between a quarter and three quarters: the share is spread to match, so that the band is used.)
  // (And none at all past its inner edge, where no far land is laid under it.)
  const spread: N = select(share.greaterThanEqual(0.999), float(2), share.mul(0.7).add(0.15));
  const on: N = band.greaterThan(0);
  // (The near ground is never cut outside its rectangle, where it is not laid: what else is drawn with it there stays.)
  const near: N = select(on.and(inside.greaterThanEqual(0)).and(patch.greaterThanEqual(spread)), float(0), float(1));
  const far: N = select(on.and(inside.greaterThanEqual(0)).and(patch.lessThan(spread.sub(0.06))), float(0), float(1));
  return { opacity: side === 'near' ? near : far, test: float(0.5) };
}
/**
 * Rings spreading on standing water where rain falls on it: puddles, wet paving's hollows, ponds, the harbour. Drops fall in a
 * lattice of small cells (two, of 55 and 33 centimetres), each at a time and a place of its own, a new place each time; how many
 * cells have a drop goes with how hard it rains (`amount`, 0 to 1). Each drop's ring spreads to about a cell across in two thirds
 * of a second or so, a crest with a trough inside it, fading as it goes. Given back as how much the rings tilt the water across x and
 * z. Left out where a cell is smaller than a few points of the picture (they would only speckle), and where there is no rain.
 */
export const rainRings: N = Fn(([p, amount]: [N, N]) => {
  const slope: N = vec2(0, 0).toVar();
  const near: N = one(smoothstep(0.015, 0.05, length(fwidth(p))));
  const a: N = amount.mul(near).toVar();
  If(a.greaterThan(0.01), () => {
    for (const [cell, rate, seed] of [[0.55, 1.3, 1.7], [0.33, 1.7, 8.9]]) {
      const base: N = floor(p.div(cell)).toVar();
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const id: N = base.add(vec2(i, j)).toVar();
        const clock: N = time.mul(rate).add(farHash(id.add(vec2(seed, seed * 1.3)))).toVar();
        const life: N = fract(clock), round: N = floor(clock).mul(0.731).toVar();
        const centre: N = id.add(vec2(farHash(id.add(vec2(round, seed + 3.1))), farHash(id.add(vec2(seed + 5.3, round)))).mul(0.8).add(0.1)).mul(cell);
        const on: N = step(farHash(id.add(vec2(round.add(seed + 7.7), round))), a.mul(1.4));
        const v: N = p.sub(centre), d: N = max(length(v), 1e-3);
        const x: N = d.sub(life.mul(cell * 1.1)).div(cell * 0.11);
        const ring: N = sin(x.mul(2.4)).mul(exp(x.mul(x).negate())).mul(one(life).mul(one(life)));
        slope.addAssign(v.div(d).mul(ring).mul(on).mul(0.42));
      }
    }
  });
  return slope;
});
/**
 * What a material says of how nearly a mirror it is, beside its colour (`userData.mirror`, read by `mirrored` in `post.ts`): the way
 * it faces in the view, as long as it is nearly a mirror, 0 to 1. (So written, and wholly opaque, it is laid over what is under it
 * whole, as the sea must be; and whatever says nothing says it with no opacity, and leaves what is under it.)
 */
export const mirrorAs = (normal: N, amount: N): N => vec4(normalize(normal).mul(clamp(amount, 0, 1)).mul(0.5).add(0.5), 1);
/** Lets a ground material be passed over into the far land, or the far land into the near ground, across the band (`nearFarUniforms`). */
export function fadesAtNearEdge(m: MeshStandardNodeMaterial, side: 'near' | 'far'): MeshStandardNodeMaterial {
  const cut = nearFarCut(side);
  (m as N).opacityNode = cut.opacity;
  (m as N).alphaTestNode = cut.test;
  return m;
}

export const siteUniforms: SiteUniforms = {
  uBake: uniform(0) as N,
  uFallback: uniform(new Vector3(0.35, 0.4, 0.5)) as N,
};
const uBake = siteUniforms.uBake as N, uFallback = siteUniforms.uFallback as N;

/** The weather's hold on what is drawn: `uWet`, how wet everything out under the sky is, 0 dry to 1 after long rain. */
export const weatherUniforms: { uWet: { value: number } } = { uWet: uniform(0) as N };
const uWet = weatherUniforms.uWet as N;
/**
 * How wet the rain has made a point, from what the bake says of how much sky it sees: nothing under a roof, all of it in the open.
 * (Before the bake arrives, everything is taken as open.)
 */
const rainWet = (bk: N): N => uWet.mul(mix(1, smoothstep(0.12, 0.45, bk.x), uBake));

// What every point of the site carries besides where it is and which way it faces: baked light
// (for each colour a level and the way it comes from), four fields (moss, damp, soot and one
// more, used differently by each material), and two numbers from the bake: the share of sky
// seen, and the share of the day in direct sun.
const shOf = (): N[] => [attribute('aSHr', 'vec4'), attribute('aSHg', 'vec4'), attribute('aSHb', 'vec4')];
const fieldOf = (): N => attribute('aField', 'vec4');
const bakeOf = (): N => attribute('aBake', 'vec2');
const one = (x: N): N => float(1).sub(x);
/** `smoothstep`, which may also be asked to fall instead of rise (the first edge above the second). */
const sstep = (a: number, b: number, x: N): N => (a > b ? one(smoothstep(b, a, x)) : smoothstep(a, b, x));

/**
 * The edges of what is cut square: blocks, steps, sills, cornices, timbers. Nothing cut by hand has an edge as sharp as a box's: a
 * dressed stone's arris is eased by the mason and then by weather, a step's nose by feet, a beam's by the adze and by years, and the
 * rounded edge catches a thin line of light where the two faces turn away from each other; there too the stone is chipped and worn
 * paler. Drawn as plain boxes, a building's mouldings and a stair's treads read as cut card. Modelled, every edge would be some
 * dozen more triangles, and there are a great many of them; so the rounding is drawn instead (a bevel in the shading only): every
 * face of such a solid says where its corners are (`markFace`), and here the distance to each of its edges is worked out in metres
 * (from how the face's own coordinates change across the picture, so that it holds for a face of any shape and any size), and within
 * `radius` of an edge the surface is turned towards it, a little at first and half way to the next face at the edge itself, as a
 * rounded arris turns. It fades out where the rounding would be smaller than a point of the picture. Gives the bent normal (from the
 * one given, in the eye's terms) and how near an edge the point is, 0 to 1, for wear.
 */
/**
 * How worn what is built is when nothing says otherwise: the game's, every world page's and the building lab's (`?chips=` another).
 * The scale runs from 0, new, through 1, the wear the game was first given, to 4, derelict. (It was 1; asked, it looked too derelict.
 * Below 1 each mark is fewer where it is laid by a share, as the render's holes are, and fainter where it is not.)
 */
export const GAME_WEAR = 0.6;
/** How worn what is built is (`makeSiteMaterial`'s `wear`, for everything): `GAME_WEAR`, 0 for new (`?chips=0`). */
export const renderUniforms: { uChips: { value: number } } = { uChips: uniform(GAME_WEAR) as N };
export const edgeUniforms: { uEdges: { value: number } } = { uEdges: uniform(1) as N };
/**
 * (`chips`, for dressed stone: its arrises are not worn evenly round. Here and there along an edge a piece has been knocked off, a
 * few centimetres of it: a broken facet, flat and turned half way to the next face, ending at a line, and paler, as fresh stone is.
 * Where along an edge is taken from noise read through the world three ways, so that it changes along an edge whichever way it runs.)
 */
const edgeOf = (radius: number, chips = false, wearU: N = renderUniforms.uChips as N): { bend: (n: N) => N; wear: N; chip: N } => {
  const e: N = attribute('aEdge', 'vec4');
  const P: N = positionView, dPx: N = dFdx(P), dPy: N = dFdy(P);
  const ng: N = normalize(normalViewGeometry);
  // (The way each of the face's two coordinates rises across it, in metres, from how they change from one point of the picture to the next.)
  const a: N = cross(dPy, ng), b: N = cross(ng, dPx), d0: N = dot(dPx, a);
  const det: N = d0.add(select(d0.greaterThanEqual(0), float(1e-14), float(-1e-14)));
  const rise = (f: N): N => a.mul(dFdx(f)).add(b.mul(dFdy(f))).div(det);
  const gs: N = rise(e.x).toVar(), gt: N = rise(e.y).toVar(), g3: N = gs.add(gt).toVar();
  const ls: N = max(length(gs), 1e-4), lt: N = max(length(gt), 1e-4), l3: N = max(length(g3), 1e-4);
  const quad: N = step(0.25, e.z).mul(step(e.z, 0.75)), tri: N = step(0.75, e.z);
  // (Not narrower than a point of the picture; and gone where it would be much narrower.)
  const W: N = positionWorld;
  // (Past the game's wear, more of them, each no stronger: see `wearU` in `makeSiteMaterial`.)
  const pastE: N = clamp(wearU.sub(1).div(3), 0, 1);
  const chip: N = chips ? smoothstep(float(0.6).sub(pastE.mul(0.14)), float(0.78).sub(pastE.mul(0.1)), farNoise(vec2(W.x.mul(6.1).add(W.z.mul(4.7)), W.y.mul(6.3).add(W.x.mul(1.9)))).mul(0.6).add(farNoise(vec2(W.z.mul(5.3).sub(W.y.mul(2.9)), W.x.mul(5.9).add(W.y.mul(4.1)))).mul(0.4))).mul(min(wearU, 1)).toVar() : float(0);
  const rad: N = float(radius).mul(chip.mul(2).add(1)).toVar();
  const point: N = max(length(fwidth(P)), 1e-5), r: N = max(rad, point), shown: N = smoothstep(0.15, 0.6, rad.div(point)).mul(edgeUniforms.uEdges as N);
  // (Rounded where worn, as a quarter of a curve; where a piece is knocked off, a flat facet that ends at a line.)
  const near = (d: N): N => mix(pow(clamp(float(1).sub(d.div(r)), 0, 1), 2), smoothstep(r, r.mul(0.82), d).mul(0.62), chip);
  const s0: N = near(e.x.div(ls)).mul(quad.add(tri)), s1: N = near(float(1).sub(e.x).div(ls)).mul(quad);
  const t0: N = near(e.y.div(lt)).mul(quad.add(tri)), t1: N = near(float(1).sub(e.y).div(lt)).mul(quad);
  const u3: N = near(float(1).sub(e.x).sub(e.y).div(l3)).mul(tri);
  const tilt: N = gs.div(ls).mul(s1.sub(s0)).add(gt.div(lt).mul(t1.sub(t0))).add(g3.div(l3).mul(u3)).mul(shown).toVar();
  const wear: N = max(max(max(s0, s1), max(t0, t1)), u3).mul(shown);
  // (Never turned past facing the eye a little. Where the next face is turned away, as the underside of a board seen from below
  // turns at its back edge towards a face the eye cannot see, the turning would carry the surface past edge-on, and the lighting,
  // reading that as a surface seen at the most glancing angle, mirrored the open sky in it however deep under the eaves it lay: a
  // thin pale-blue line along the angle.)
  const eye: N = normalize(positionView.negate());
  const bend = (n: N): N => {
    const m: N = normalize(n.add(tilt)).toVar();
    return normalize(m.add(eye.mul(max(float(0.2).sub(dot(m, eye)), 0))));
  };
  return { bend, wear, chip: chip.mul(step(0.001, wear)).mul(shown) };
};

/** The baked light on a surface facing `wn`. */
const bakedAt = (wn: N): N => {
  const [r, g, b] = shOf(), n4 = vec4(1, wn);
  return max(vec3(dot(r, n4), dot(g, n4), dot(b, n4)), 0);
};
/**
 * 1 for what sees no sky out where the sun's shadows are not kept: under the hill, or indoors in
 * a building that is not baked. (Out there the two numbers a point carries are how much sky it
 * sees and a fixed share of sun; in the house they come from the bake, which never finds a
 * place with no sky and half a day's sun.) Such a point is not lit by the sun, whatever the
 * light thinks, and has light of its own whether or not the house's light has been reckoned.
 */
const underHill = (bk: N): N => one(smoothstep(0.004, 0.06, bk.x)).mul(step(0.55, bk.y));
/** Indirect light: the bake once it has arrived (or at once, for what has light of its own), and a stand-in for the sky until then. */
const irradianceOf = (wn: N, bk: N): N => mix(uFallback.mul(float(0.55).add(wn.y.mul(0.45))), bakedAt(wn), max(uBake, underHill(bk)));

/**
 * The standard lighting, with three things changed:
 *  - indirect light is what is given here (the bake), and nothing is taken from the sky's picture for it;
 *  - the sun's light is multiplied by `sun` (for what is under the hill and must not have it);
 *  - reflections of the sky are multiplied by `sky` (they belong only where the sky can be seen),
 *    and all gleam by `gleam` (ground and dry rock throw back almost none).
 */
/**
 * The sun flashing off grains of ice (`snowGlints`), added to what a surface throws back of it: where a grain's face is turned so that
 * it sends the sun to the eye, within some three degrees, a flash far brighter than the snow about it; nothing otherwise. Of the sun's light
 * as it reaches the surface, so that grains in shadow do not flash.
 */
const glintFlash = (data: N, g: Glints): void => {
  const facet: N = transformNormalToView(g.facet), half: N = normalize(data.lightDirection.add(positionViewDirection));
  const flash: N = pow(max(dot(facet, half), 0), 400).mul(max(dot(facet, data.lightDirection), 0)).mul(g.amount).mul(60);
  data.reflectedLight.directSpecular.addAssign(data.lightColor.mul(flash));
};
/** Where grains of ice lie on snow and which way each faces (`snowGlints`). */
export interface Glints { amount: N; facet: N }

class BakedLighting extends (PhysicalLightingModel as N) {
  constructor(private readonly o: { irradiance: N; sun?: N; sky?: N; gleam?: N; glint?: Glints }) {
    super();
  }

  direct(data: N, builder: N): void {
    const sunlit = data.lightNode?.light?.isDirectionalLight;
    if (this.o.sun && sunlit) data = { ...data, lightColor: data.lightColor.mul(this.o.sun) };
    super.direct(data, builder);
    if (this.o.glint && sunlit) glintFlash(data, this.o.glint);
  }

  indirect(builder: N): void {
    const c = builder.context;
    // (And after dark, the street lamps' light where it falls: not indoors, where the bake says no sky is seen, nor in the rooms of a
    // town's houses, which say they see a twentieth of it: see `main.ts`.)
    c.irradiance.assign(lampsOn ? this.o.irradiance.add(lampLight(positionWorld, normalWorld).mul(smoothstep(0.06, 0.12, bakeOf().x))) : this.o.irradiance);
    c.iblIrradiance.assign(vec3(0));
    if (this.o.sky) c.radiance.mulAssign(this.o.sky);
    super.indirect(builder);
    if (this.o.gleam) {
      c.reflectedLight.directSpecular.mulAssign(this.o.gleam);
      c.reflectedLight.indirectSpecular.mulAssign(this.o.gleam);
    }
  }
}
const lit = (m: MeshStandardNodeMaterial, o: { irradiance: N; sun?: N; sky?: N; gleam?: N; glint?: Glints }): void => {
  (m as N).setupLightingModel = () => new BakedLighting(o);
};

/**
 * Sunlit snow's glints (asked: "a bit of snow sparkle ... also close by groomed / snow surface?"): in `share` of the cells of four
 * centimetres near the eye, a grain of ice, a round spot within its cell, its face turned its own way, as much as seventy degrees off
 * the surface's. Each flashes where its face turns the sun to the eye (`glintFlash`), and as the eye moves others flash: they twinkle.
 * None past twenty-five metres, where a cell is smaller than a point of the picture. Only the flash takes the grain's face: the snow's
 * own shading keeps the surface's, so that the grains turned from the sun do not speckle it dark. (Turned no more than some twenty
 * degrees, only those looked at against the sun could flash, the sun and the eye both being low; and none were seen.)
 */
export const snowGlints = (share: N): Glints => {
  const P: N = positionWorld.mul(26), cell: N = floor(P);
  const hash = (k: [number, number, number], s: number): N => fract(sin(dot(cell, vec3(...k))).mul(s));
  const spot: N = one(smoothstep(0.14, 0.36, length(fract(P).sub(0.5))));
  const amount: N = step(one(share), hash([12.9898, 78.233, 37.719], 43758.5453)).mul(spot).mul(one(smoothstep(12, 26, length(positionView))));
  const lean: N = vec3(hash([39.3468, 11.135, 83.155], 24634.6345).sub(0.5), 0, hash([73.156, 52.235, 9.151], 43758.5453).sub(0.5)).mul(4.2);
  return { amount, facet: normalize(normalWorld.add(lean)) };
};
class GlintLighting extends (PhysicalLightingModel as N) {
  constructor(private readonly g: Glints) {
    super();
  }

  direct(data: N, builder: N): void {
    super.direct(data, builder);
    if (data.lightNode?.light?.isDirectionalLight) glintFlash(data, this.g);
  }
}
/** A standard material's own lighting, with the sun flashing off grains of snow on it (`snowGlints`). */
export const glinting = (m: MeshStandardNodeMaterial, g: Glints): void => {
  (m as N).setupLightingModel = () => new GlintLighting(g);
};

/**
 * `matt` is for ground: turf and loose stone throw back almost no gleam. With the ordinary sheen
 * every surface has at a glancing angle, land seen from the air goes pale as milk with distance.
 *
 * `deep` is for a surface with real depth to it, bark above all: how deep its hollows are, as a share of one repeat of its texture.
 * Within a few strides such a surface is drawn with that depth. The texture is slid along the line of sight until the line meets
 * the height the texture has there, so that a plate of bark hides the furrow behind it, and more of the furrow shows as the eye
 * comes round: which is what tells the eye that a thing has depth and is not paint.
 */
/**
 * `paint`, where given, is the colour of the whole surface in place of the colour each point carries: for glass in a lit
 * window's frame by day, whose points carry the colour of the lamp behind it, which by day is not seen.
 */
/**
 * `wear`, a uniform of the material's own for how worn it is, in place of the one for everything (`renderUniforms.uChips`): 0 new,
 * 1 as the game first built it (it now builds `GAME_WEAR`), and on past that to 4, derelict, where the render is mostly gone, the joints raked deep, timber grey and
 * rotten and its paint all but gone, the roof dark and broken, and the walls grimed and grown over from the foot. (Nothing changes
 * at 1 or below for anything past it: the game, which never goes past 1, is drawn as it was.)
 *
 * `unrepeat`, for a wall of rubble (the castle's): its picture covers `span` units of the surface's texture coordinates, and it is laid
 * over the wall in patches a few metres across, each patch from another place in it (see `laidUnrepeated`), so that no stretch of the
 * wall is a copy of another. `courses` is how many courses the picture has from foot to head, so that a patch is moved up or down by
 * whole courses and its courses run on into its neighbour's.
 */
export function makeSiteMaterial(base: TextureSet, moss: TextureSet, o: { normalScale?: number; roughness?: number; mossScale?: number; matt?: boolean; deep?: number; hollow?: number; paint?: [number, number, number]; fades?: 'near'; bevel?: number; render?: boolean; chips?: boolean; weather?: boolean; bond?: 'wendish' | 'running'; timber?: boolean; roof?: boolean; unrepeat?: { span: number; courses: number }; wear?: { value: number }; snowed?: boolean } = {}): MeshStandardNodeMaterial {
  if (o.deep) return makeDeepMaterial(base, moss, { ...o, deep: o.deep });
  const un = o.unrepeat;
  // (How worn what is built is: the one for everything, which `?chips=0` turns off, or one of this material's own, `wear`, as the building
  // lab gives a building it has been asked to show more or less worn than the rest. `GAME_WEAR` is as the game builds it.)
  const wearU: N = (o.wear ?? renderUniforms.uChips) as N;
  // Up to 1, as the game builds: each mark grows as it always has. Past it, a building worn more than the game's, to a ruin at 4: the
  // same marks spread further (more render come away, more bricks flaked, more paint peeled, more tiles lost), each held at its full
  // strength, which overdrawn went past black; and what only a long-abandoned building has, grime over everything and moss and lichen
  // climbing its walls. (`wearI`, how strong a mark is; `past`, how far past the game's it is, 0 up to 1 and 1 at 4.)
  const wearI: N = min(wearU, 1).toVar(), past: N = clamp(wearU.sub(1).div(3), 0, 1).toVar();
  const m = new MeshStandardNodeMaterial({
    normalMap: un ? null : base.normalMap,
    normalScale: new Vector2(o.normalScale ?? 1, o.normalScale ?? 1),
    aoMap: un ? null : base.ormMap,
    roughnessMap: un ? null : base.ormMap,
    roughness: o.roughness ?? 1,
    metalness: 0,
    color: new Color(1, 1, 1),
  });
  const f = fieldOf(), bk = bakeOf();
  const laid = un ? laidUnrepeated(base, un.span, un.courses) : null;
  const stone: N = laid ? laid.map : texture(base.map, uv()), mossTex: N = texture(moss.map, uv().mul(o.mossScale ?? 1.7));
  // (The picture's bumps, as the standard material would read them, or as they are laid in patches.)
  const bumps = (): N => (laid ? laid.normal : texture(base.normalMap, uv()));
  if (laid) {
    m.normalNode = normalMap(laid.normal, vec2(o.normalScale ?? 1, o.normalScale ?? 1));
    m.aoNode = laid.orm.r;
  }
  const roughness: N = laid ? float(o.roughness ?? 1).mul(laid.orm.g) : materialRoughness;
  // (Damp from the place, and the rain's wetting where the sky reaches.)
  const wet = max(f.y, rainWet(bk).mul(0.8));
  // Moss wants sky above it and little direct sun; before the bake arrives, use the raw field.
  const lightOk = mix(0.4, smoothstep(0.03, 0.3, bk.x).mul(one(smoothstep(0.2, 0.8, bk.y).mul(0.92))), uBake);
  const mossy = smoothstep(0, 0.22, f.x.mul(lightOk).mul(1.5).add(one(stone.a).mul(0.4)).add(mossTex.a.mul(0.45)).sub(1));
  // Damp stone is darker; soot is darker still and matt.
  let colour: N = stone.rgb.mul(o.paint ? vec3(...o.paint) : vertexColor().rgb).mul(mix(1, 0.5, wet));
  if (laid) {
    // A wall of rubble is not one grey from end to end: stone from another bed of the quarry or another year's work, a length
    // refaced, the grime of centuries thicker in some places than others. Patches of a few metres, darker and lighter, a little
    // warmer and cooler, with smaller ones in them. (Seen from across a field, the wall of one even tone was a picture laid on it.)
    const t: N = uv();
    const big: N = farNoise(t.div(2.4).add(vec2(4.4, 2.6))).mul(0.6).add(farNoise(t.div(0.9).add(vec2(9.1, 1.4))).mul(0.28)).add(farNoise(t.div(0.3).add(vec2(2.7, 6.3))).mul(0.12)).toVar();
    colour = colour.mul(mix(0.66, 1.06, smoothstep(0.22, 0.78, big)));
    colour = colour.mul(mix(vec3(0.93, 0.97, 1.03), vec3(1.06, 1.0, 0.9), smoothstep(0.3, 0.7, farNoise(t.div(3.3).add(vec2(1.7, 8.8))))));
  }
  colour = mix(colour, mossTex.rgb, mossy);
  colour = mix(colour, vec3(0.012), f.z.mul(0.9));
  // Damp risen in the foot of an outer wall from the ground it stands in, where the wall says how high that ground is (the fourth
  // number of its field, the height plus a thousand; a town's houses say it, see `buildTurned`): up to a ragged line from half a
  // metre to a metre and a quarter, darker and a little greener, with a darker rim where the damp dries and leaves what it carried;
  // and below a hand or two the street's dirt the rain splashes up.
  // (Painted timber says it with the height made negative: see `placeHouse`.)
  const hasFoot: N = step(500, abs(f.w)), above: N = positionWorld.y.sub(abs(f.w).sub(1000)).toVar(), along: N = positionWorld.x.add(positionWorld.z);
  // Render that has come away. Where a wall is rendered (`render`, for plaster) and looks out of a house (where the wall says how high
  // the ground at its foot is: see `placeHouse`), the lime has fallen away in places: a few patches here and there, more about the
  // foot of the wall where the damp has worked at it, and more on some houses than others. In a hole the coarse brown coat the
  // render was laid on shows, and where that has gone too, the brick of the wall, in courses; the broken edge of the render is pale,
  // and the hole lies a centimetre and a half below the face, with its lip catching the light on one side and in shadow on the other.
  // (Before, every rendered wall was as smooth and whole as if it had been finished that morning and painted.)
  let chipNormal: N = null, woodGrey: N = null;
  // (Where on a wall: along it, level, and up it, so that courses are level whichever way the wall faces; and how worn this part of
  // the town is, from a noise some seventeen metres across, so that some houses are older than others.)
  const P: N = positionWorld, nG: N = normalize(normalWorldGeometry);
  const tH: N = normalize(vec2(nG.z.negate(), nG.x).add(vec2(1e-4, 0)));
  // (On a castle's walls, from its texture coordinates, which run a unit to two metres along a wall and up it: its walls are bent
  // (`sway` in `castle.ts`), so the way a face looks turns a little from point to point, and a place along it reckoned from that and
  // from how far it is from the world's middle swung by metres, and drew its streaks as the lines of a map.)
  const q: N = (laid ? uv().mul(2) : vec2(dot(P.xz, tH), P.y)).toVar();
  const worn: N = smoothstep(0.35, 0.8, farNoise(P.xz.div(17).add(5.3))).toVar();
  if (o.render) {
    const share: N = min(worn.mul(0.09).add(0.012).add(one(smoothstep(0.25, 1.4, above)).mul(0.12)).mul(wearU), 0.9).mul(hasFoot).toVar();
    // (Blots a few hand-breadths across, ragged with smaller ones, their edges torn finer still.)
    // (The finest tearing only where a point of the picture is small enough to show it: further off it speckled the edges.)
    const nearW: N = one(smoothstep(0.004, 0.012, length(fwidth(q)))).toVar();
    const n0: N = farNoise(rot(q.mul(1.7)).add(11.3)).mul(0.62).add(farNoise(rot(q.mul(-5.9)).add(3.7)).mul(0.27)).add(farNoise(rot(q.mul(23)).add(1.9)).sub(0.5).mul(0.11).mul(nearW)).add(0.055).toVar();
    // (Below the wear the game was first given, fewer holes and smaller, and not the same holes fainter: the share alone moved the
    // level the noise is cut at so little that a wall at a third of that wear had nearly every hole it had at the full.)
    const t0: N = float(0.77).sub(share.mul(0.75)).add(one(wearI).mul(0.16)).toVar();
    const dd: N = n0.sub(t0).toVar();
    const soft: N = max(fwidth(n0).mul(0.8), 0.006).toVar();
    const hole: N = smoothstep(soft.negate(), soft, dd).mul(step(0.004, share)).toVar();
    // (The coat under it has held in most of a hole; the brick shows where the hole is deepest.)
    const core: N = smoothstep(0.065, 0.1, dd.add(farNoise(rot(q.mul(9.1))).sub(0.5).mul(0.05))).mul(hole).toVar();
    // Brick in courses: seven and a half centimetres to a course, a quarter of a metre to a brick, joints of a centimetre.
    const row = cellsOf(q.y.div(0.076), float(3.1), 0.02), brickAt = cellsOf(q.x.div(0.25).add(row.k.mul(0.5)), row.k.add(7.7), 0.08);
    const jx: N = min(brickAt.at, one(brickAt.at)).mul(0.25), jy: N = min(row.at, one(row.at)).mul(0.076);
    const mortar: N = one(smoothstep(0.004, 0.007, min(jx, jy))).toVar();
    const bTone: N = farHash(vec2(brickAt.k, row.k.add(2.2)));
    const brick: N = mix(vec3(0.5, 0.25, 0.16), vec3(0.62, 0.36, 0.22), bTone).mul(mix(0.85, 1.1, stone.a)).mul(mix(1, 0.7, farHash(vec2(row.k, brickAt.k.add(9.3))).mul(0.6)));
    const coat: N = mix(vec3(0.41, 0.35, 0.26), vec3(0.53, 0.46, 0.35), smoothstep(0.3, 0.7, farNoise(rot(q.mul(31))))).mul(mix(0.85, 1.12, stone.a));
    const under: N = mix(coat, mix(brick, vec3(0.5, 0.48, 0.42), mortar), core);
    // (The broken edge of the render, a few millimetres of it, pale and fresh; and the old paint about a hole a little dirtier.)
    const lip: N = smoothstep(soft.negate(), soft, dd).mul(one(smoothstep(0.006, 0.016, dd))).mul(step(0.004, share)).mul(nearW);
    colour = colour.mul(mix(1, 0.92, smoothstep(-0.05, 0, dd).mul(one(hole)).mul(step(0.004, share))));
    colour = mix(colour, under.mul(mix(1, 0.6, wet)), hole);
    colour = mix(colour, vec3(0.82, 0.8, 0.75).mul(mix(1, 0.6, wet)), lip.mul(0.75));
    // Hairline cracks in the render where it is old: meandering lines, in some places and not others, gone within a few strides.
    // (Jagged and broken short: the lines along which smooth noise crosses a level are long smooth loops, like a map's.)
    const cv: N = farNoise(rot(q.mul(2.6)).add(17.7)).add(farNoise(rot(q.mul(-11)).add(4.4)).mul(0.22)).add(farNoise(rot(q.mul(41)).add(8.1)).mul(0.07)).toVar();
    const cw: N = max(fwidth(cv).mul(0.9), 1e-4);
    // (Faint, and only where the wall is old: drawn darker, and everywhere, they were the lines of a map drawn on the wall.)
    const crack: N = one(smoothstep(cw.mul(0.6), cw.mul(1.6), abs(cv.sub(0.5)))).mul(smoothstep(0.6, 0.72, farNoise(rot(q.mul(3.3)).add(9.9)).mul(0.6).add(farNoise(rot(q.mul(0.7)).add(2.3)).mul(0.4)).add(worn.mul(0.1))))
      .mul(one(smoothstep(4, 11, length(positionView)))).mul(one(hole)).mul(hasFoot).mul(wearI.add(past.mul(1.5)));
    colour = colour.mul(one(crack.mul(0.2)));
    // The hole's depth, for its light: a centimetre and a half below the face, the brick a little deeper still; turned into the way
    // the surface faces from how it changes across the picture (as `edgeOf` does for its rounding).
    // (Only within some strides, and never tilting the surface more than half a right angle: further off, or with the hole's edge
    // a single point of the picture wide, its light was a dotted black and white line round every hole.)
    const H: N = hole.mul(-0.015).sub(core.mul(0.004)).sub(mortar.mul(core).mul(0.004)).mul(one(smoothstep(5, 12, length(positionView)))).toVar();
    const Pv: N = positionView, sx: N = dFdx(Pv), sy: N = dFdy(Pv), nv: N = normalize(normalViewGeometry);
    const r1: N = cross(sy, nv), r2: N = cross(nv, sx), det: N = dot(sx, r1);
    const grad0: N = r1.mul(dFdx(H)).add(r2.mul(dFdy(H))).mul(select(det.greaterThanEqual(0), float(1), float(-1)));
    const grad: N = grad0.mul(min(1, abs(det).div(max(length(grad0), 1e-12))));
    chipNormal = (n: N): N => normalize(n.mul(max(abs(det), 1e-12)).sub(grad).div(max(abs(det), 1e-12)));
  }
  // Brick that has stood out in the weather (`bond`, the bond its picture is laid in, so that each brick can be told from the next):
  // here and there a brick's fired skin has flaked from its face, frost having got in, showing the softer, paler clay within, its
  // edge a little dark; the mortar has crumbled from the joints in patches, raked out deep and dark, more about the foot of the wall;
  // and where the damp rises, salt has come out of the wall and dried white on it.
  if (o.bond) {
    const t: N = uv();
    let row: N, xb: N, idx: N, fx: N, fy: N;
    if (o.bond === 'wendish') {
      // (As the picture lays them, `brickRecipe`: fifteen headers across, twenty courses up, a stretcher two headers long.)
      row = floor(t.y.mul(20)); fy = fract(t.y.mul(20));
      const x: N = t.x.mul(15).add(row.mul(3).mod(5)), pp: N = x.mod(5);
      const start: N = select(pp.lessThan(2), float(0), select(pp.lessThan(4), float(2), float(4))), len: N = select(pp.lessThan(4), float(2), float(1));
      xb = floor(x.div(5)).mul(5).add(start); fx = pp.sub(start).div(len);
    } else {
      row = floor(t.y.mul(26)); fy = fract(t.y.mul(26));
      const x: N = t.x.mul(9).add(row.mod(2).mul(0.5));
      xb = floor(x); fx = fract(x);
    }
    idx = vec2(xb, row);
    const out: N = hasFoot.mul(wearU).toVar(), outI: N = hasFoot.mul(wearI).toVar();
    const faceB: N = smoothstep(0.38, 0.5, stone.a).toVar(), joint: N = one(faceB);
    const flaky: N = step(farHash(idx.add(vec2(3.3, 7.1))), worn.mul(0.07).add(0.03).add(one(smoothstep(0.3, 1.6, above)).mul(0.1))).mul(out);
    const fv: N = farNoise(vec2(fx.mul(3.1), fy.mul(1.3)).add(farHash(idx).mul(17))).toVar();
    const flake: N = smoothstep(0.4, 0.46, fv).mul(flaky).mul(faceB).toVar();
    const flakeRim: N = smoothstep(0.38, 0.4, fv).mul(one(smoothstep(0.4, 0.43, fv))).mul(flaky).mul(faceB);
    colour = mix(colour, colour.mul(vec3(1.5, 1.2, 0.92)).mul(mix(0.8, 1.1, farNoise(t.mul(220)))), flake.mul(0.9)).mul(one(flakeRim.mul(0.5)));
    const raked: N = smoothstep(float(0.58).sub(past.mul(0.3)), float(0.74).sub(past.mul(0.25)), farNoise(rot(q.mul(2.3)).add(6.1)).add(worn.mul(0.12)).add(one(smoothstep(0.2, 1.2, above)).mul(0.2))).mul(outI).toVar();
    colour = colour.mul(one(joint.mul(raked).mul(0.62)));
    // (In a crust that is thick in the joints and thin over the brick, broken up finely: laid as an even veil it was white paint.)
    const salt: N = one(smoothstep(0.2, 0.85, above.add(farNoise(rot(q.mul(4.1))).sub(0.5).mul(0.35)))).mul(smoothstep(0.55, 0.75, farNoise(rot(q.mul(3.3)).add(2.2))))
      .mul(smoothstep(0.3, 0.7, farNoise(rot(q.mul(27)).add(5.5)))).mul(outI);
    colour = mix(colour, vec3(0.74, 0.72, 0.68).mul(mix(0.85, 1, stone.a)), salt.mul(mix(0.12, 0.5, joint)));
  }
  // Timber out of doors on a house (`timber`; where the timber says how high the ground at its foot is, see `placeHouse`), weathered
  // as the walls are, in its own ways, along its grain (which runs along the picture's first coordinate, a metre to 0.9 of it):
  // bare or stained timber faded towards a grey brown where sun and rain reach it, most on what faces up, in drifts along the
  // grain; split here and there along the grain in a check, a long fine dark line; and at its foot, a hand or two above the ground,
  // dark and rotten. Painted timber's paint chalky and faded, worn through at the arrises, and peeled from the wood in places, in
  // flakes drawn out along the grain, most low down and on older houses, showing the grey wood under it, the paint's edge lifting.
  let woodEdge: N = null;
  if (o.timber) {
    const t: N = uv(), isOut: N = hasFoot.mul(wearI).toVar(), isOutX: N = hasFoot.mul(wearU).toVar(), painted: N = step(f.w, -500).toVar(), bare: N = one(painted);
    const lum = (c: N): N => dot(c, vec3(0.3, 0.55, 0.15));
    // (Wood long bare goes silver grey; the brown of the picture under it, only a little.)
    const grey: N = mix(stone.rgb, vec3(lum(stone.rgb)), 0.78).mul(vec3(0.92, 0.92, 0.9)).toVar();
    const facing: N = smoothstep(-0.3, 0.9, nG.y).toVar();
    const drift: N = smoothstep(0.35, 0.7, farNoise(vec2(t.x.mul(0.9), t.y.mul(7)).add(2.1))).toVar();
    // Bare: faded and checked.
    const faded: N = vec3(lum(colour)).mul(vec3(1.06, 1.02, 0.96)).mul(2.1).add(vec3(0.03, 0.028, 0.025));
    colour = mix(colour, faded, isOut.mul(bare).mul(mix(0.12, 0.6, facing)).mul(worn.mul(0.5).add(0.5)).mul(drift.mul(0.6).add(0.4)));
    const lane: N = t.y.mul(17).add(farNoise(vec2(t.x.mul(1.1), 4.4)).mul(0.6)).toVar();
    const lw: N = max(fwidth(lane).mul(0.8), 0.02);
    const check: N = one(smoothstep(lw, lw.mul(2), abs(fract(lane).sub(0.5)))).mul(step(0.66, farNoise(vec2(t.x.mul(1.7), floor(lane).mul(3.7))))).mul(one(smoothstep(4, 12, length(positionView))));
    colour = colour.mul(one(check.mul(isOut).mul(0.55)));
    const rotten: N = one(smoothstep(0.1, float(0.45).add(past.mul(0.9)), above.add(farNoise(vec2(t.x.mul(7), t.y.mul(3))).sub(0.5).mul(0.15)))).mul(isOut);
    colour = mix(colour, vec3(0.045, 0.045, 0.03).mul(mix(0.8, 1.2, stone.a)), rotten.mul(0.6));
    // Painted: chalky, then worn and peeled.
    colour = mix(colour, colour.mul(1.12).add(vec3(lum(colour)).mul(0.25)).add(0.012), isOut.mul(painted).mul(mix(0.25, 0.6, facing)).mul(worn.mul(0.6).add(0.4)));
    // (In flakes a few centimetres to a hand long, not in broad sheets: large and many, they were a soldier's camouflage.)
    const share: N = min(worn.mul(0.07).add(0.015).add(one(smoothstep(0.2, 1.1, above)).mul(0.14)).add(facing.mul(0.05)).mul(isOutX), 0.75).mul(painted).toVar();
    const pv: N = farNoise(vec2(t.x.mul(6.3), t.y.mul(29)).add(8.8)).mul(0.65).add(farNoise(vec2(t.x.mul(19), t.y.mul(83)).add(1.3)).mul(0.35)).toVar();
    const pt: N = float(0.8).sub(share).toVar(), pw: N = max(fwidth(pv).mul(0.8), 0.004);
    const peeled: N = smoothstep(pt.sub(pw), pt.add(pw), pv).mul(step(0.002, share)).toVar();
    const curl: N = smoothstep(pt.sub(0.03), pt.sub(0.005), pv).mul(one(peeled)).mul(step(0.002, share));
    colour = mix(colour, grey.mul(mix(1, 0.6, wet)), peeled);
    colour = colour.mul(mix(1, 1.18, curl));
    woodEdge = (wear: N): N => wear.mul(isOut).mul(painted).mul(drift.mul(0.5).add(0.5));
    woodGrey = grey;
  }
  // A roof of clay tiles (`roof`) as old roofs are, where from any height a town's roofs were a carpet of clean orange, every tile the
  // same as its neighbour six along: each tile its own tone, fired darker or paler, some browner; patches mended with newer tiles of
  // a cleaner orange; crusts of lichen on the tiles' faces, grey-green and some yellow-orange, more on old roofs; moss in the joints
  // and laps, thick on a slope that faces north and the sun seldom dries, little on one facing south; dark streaks of the algae
  // that the rain feeds, running down the slope; and on the oldest roofs, here and there, a tile gone.
  let roofMatt: N = float(0);
  if (o.roof) {
    const plain: N = colour;
    // (As the picture lays them, `tile` in `textures.ts`: six across and eight rows up to a unit of it, each row set half a tile along.
    // The picture repeats every six by eight tiles; these do not.)
    const t: N = uv(), row: N = floor(t.y.mul(8));
    const id: N = vec2(floor(t.x.mul(6).add(fract(row.mul(0.5)))), row).toVar();
    const h1: N = farHash(id.add(vec2(1.7, 3.1))), h2: N = farHash(id.add(vec2(5.3, 9.7))), h3: N = farHash(id.add(vec2(8.1, 2.9))), h4: N = farHash(id.add(vec2(4.6, 7.4)));
    // (A tile is a hand or two across: where one is smaller than a point of the picture its own tone is left out, which would only speckle.)
    const sharp: N = one(smoothstep(0.35, 0.9, length(fwidth(t.mul(vec2(6, 8)))))).toVar();
    // (North is less z. A roof's slope, not the upright sides of its ridge or of a chimney's pots.)
    const north: N = smoothstep(0.2, -0.6, nG.z).toVar(), slope: N = smoothstep(0.25, 0.5, nG.y).toVar();
    const patch: N = farNoise(P.xz.div(4.3).add(7.7)).toVar(), age: N = worn.mul(0.6).add(farNoise(P.xz.div(9.1).add(1.9)).mul(0.4)).add(past.mul(0.7)).toVar();
    const mended: N = step(0.64, patch).mul(step(0.4, h2)).toVar(), old: N = one(mended);
    colour = colour.mul(mix(1, mix(0.78, 1.14, h1), sharp)).mul(mix(vec3(1), vec3(0.9, 0.84, 0.78), step(0.72, h3).mul(sharp)));
    colour = mix(colour, colour.mul(vec3(1.2, 1.07, 0.9)), mended.mul(sharp).mul(0.85));
    // (Old clay darkens all over with the dirt of the air and what grows on it too fine to see.)
    colour = colour.mul(mix(1, 0.8, age.mul(old).mul(slope)));
    // Moss in the joints and laps, where the picture's height says the tile is low or there is none.
    // (And on a north slope it climbs out of them in cushions over the lower ends of the tiles.)
    const lowIn: N = one(smoothstep(0.2, 0.55, stone.a));
    const mossAt: N = smoothstep(0.4, 0.8, farNoise(P.xz.div(1.4).add(3.9)).mul(0.6).add(north.mul(0.5)).add(age.mul(0.3)).sub(0.12)).mul(slope).mul(old).toVar();
    const cushion: N = farNoise(rot(t.mul(17)).add(6.2)).mul(0.65).add(farNoise(rot(t.mul(-52)).add(2.4)).mul(0.35));
    const mossed: N = smoothstep(0.42, 0.62, lowIn.mul(mossAt).mul(0.9).add(mossAt.mul(cushion).mul(north.mul(0.5).add(0.25)))).toVar();
    colour = mix(colour, mossTex.rgb.mul(vec3(0.8, 0.95, 0.6)).mul(mix(0.75, 1.15, cushion)).mul(mix(1, 0.6, wet)), mossed.mul(0.92));
    // Lichen in crusts the size of a coin to a palm, on the tiles' faces, more where the roof is old and where the sun reaches; grey,
    // and in some colonies yellow-orange; a little paler than the clay, not white.
    const lv: N = farNoise(rot(t.mul(21)).add(3.3)).mul(0.7).add(farNoise(rot(t.mul(-67)).add(1.1)).mul(0.3)).toVar();
    const lt: N = float(0.84).sub(age.mul(0.12).add(one(north).mul(0.04)).mul(slope).mul(old)).toVar();
    const lichen: N = smoothstep(lt, lt.add(0.03), lv).mul(smoothstep(0.2, 0.4, stone.a)).mul(slope).mul(old).mul(sharp.mul(0.6).add(0.4)).toVar();
    const orange: N = smoothstep(0.55, 0.62, farNoise(rot(t.mul(3.1)).add(5.5)).add(one(north).mul(0.08)));
    colour = mix(colour, mix(vec3(0.4, 0.4, 0.34), vec3(0.52, 0.36, 0.1), orange).mul(mix(0.85, 1.1, lv)).mul(mix(1, 0.6, wet)), lichen.mul(0.6));
    // Streaks of dark algae down the slope, thickest on a north slope.
    const streak: N = smoothstep(0.55, 0.82, farNoise(vec2(dot(P.xz, vec2(nG.z, nG.x.negate())).mul(2.1), P.y.mul(0.35)).add(2.2))).mul(north.mul(0.7).add(0.3)).mul(age).mul(slope).mul(old);
    colour = colour.mul(one(streak.mul(0.38)));
    // (One tile in a few hundred, on the oldest roofs only.)
    const gone: N = step(float(0.9985).add(one(age).mul(0.002)).sub(past.mul(0.04)), h4).mul(smoothstep(0.15, 0.3, stone.a)).mul(slope).mul(sharp);
    colour = mix(colour, vec3(0.03, 0.024, 0.02), gone);
    // (`uChips` turns it off, as it does the walls' weathering, to compare.)
    colour = mix(plain, colour, min(wearU, 1));
    roofMatt = max(mossed, lichen.mul(0.7)).mul(wearI);
  }
  // Rain has run down the outer walls, in long streaks of grime from what stands out over them, darker in some places than others.
  if (o.weather) {
    const streak: N = smoothstep(0.52, 0.8, farNoise(vec2(q.x.mul(2.4), q.y.mul(0.16)).add(1.3)).mul(0.75).add(farNoise(vec2(q.x.mul(9.1), q.y.mul(0.5)).add(4.4)).mul(0.25)));
    // (On a castle's walls, high and long without eaves over them, more of it.)
    colour = colour.mul(one(streak.mul(worn.mul(laid ? 0.2 : 0.14).add(laid ? 0.2 : 0.12)).mul(hasFoot).mul(wearI.add(past.mul(1.2)))));
    // Long left: grime over the whole of it, dull and darker in some places than others, the colour gone out of it; and moss and lichen
    // up its walls from the foot, higher the longer it has been left, and here and there a patch higher up, thickest in the joints, as
    // on a ruin. (Nothing below the game's wear.)
    const grime: N = smoothstep(0.25, 0.75, farNoise(vec2(q.x.mul(0.45), q.y.mul(0.3)).add(7.3))).mul(0.6).add(0.4).mul(past).mul(hasFoot).toVar();
    colour = mix(colour, vec3(dot(colour, vec3(0.3, 0.55, 0.15))).mul(vec3(0.95, 0.93, 0.88)), grime.mul(0.45)).mul(one(grime.mul(0.32)));
    const low: N = one(smoothstep(0.15, past.mul(1.6).add(0.5), above));
    const creep: N = smoothstep(0.72, 0.84, farNoise(rot(q.mul(0.9)).add(3.3)).mul(0.65).add(farNoise(rot(q.mul(3.7)).add(8.8)).mul(0.35)).add(low.mul(0.42)).sub(stone.a.sub(0.5).mul(0.2))).mul(past).mul(hasFoot).toVar();
    colour = mix(colour, mossTex.rgb.mul(vec3(0.62, 0.78, 0.45)).mul(mix(1, 0.6, wet)), creep.mul(mix(0.75, 0.45, stone.a)));
  }
  const mark: N = farNoise(vec2(along.mul(0.9), 3.1)).mul(0.6).add(farNoise(vec2(along.mul(4.3), positionWorld.y.mul(0.7))).mul(0.2)).add(0.42).toVar();
  // (Its edge is taken through the wall's own texture as well, so that it is blotched as damp is, and not a drawn wave.)
  const edgeAt: N = above.sub(mark).add(stone.a.sub(0.5).mul(0.22)).toVar();
  const risen: N = one(smoothstep(-0.12, 0.06, edgeAt)).mul(hasFoot).toVar();
  const rim: N = one(smoothstep(0, 0.07, abs(edgeAt.add(0.03)))).mul(hasFoot);
  const splash: N = one(smoothstep(0.04, 0.38, above.add(farNoise(vec2(along.mul(11), positionWorld.y.mul(11))).sub(0.5).mul(0.14)))).mul(hasFoot);
  colour = colour.mul(mix(vec3(1, 1, 1), vec3(0.74, 0.77, 0.72), risen)).mul(one(rim.mul(0.1)));
  colour = mix(colour, colour.mul(vec3(0.5, 0.46, 0.4)), splash.mul(0.55));
  // Snow on what is built, out of doors: on roofs, copings, sills and the floors of open courts. What is out of doors is known only
  // from the bake, which says how much sky each point sees; until it arrives, nothing built has snow on it. Or, where nothing is baked
  // and what is built is shut, seen only from outside (`snowed`: the ski runs' village), on all of it that faces up.
  const outdoors: N = o.snowed ? float(1) : smoothstep(0.3, 0.55, bk.x).mul(uBake);
  const snowy: N = snowOn(positionWorld, normalize(normalWorldGeometry).y.add(one(stone.a).mul(0.1))).mul(outdoors).toVar();
  colour = mix(colour, vec3(...SNOW), snowy);
  // The edges of what is cut square, rounded in the shading (`edgeOf`), and a little paler where they are worn.
  if (o.bevel) {
    const edge = edgeOf(o.bevel, !!o.chips, wearU);
    colour = colour.mul(edge.wear.mul(0.12).add(1)).mul(edge.chip.mul(0.16).add(1));
    // (Paint wears through first where it is knocked and rubbed, at the arrises, and most where a piece has been knocked off.)
    if (woodEdge) colour = mix(colour, woodGrey, clamp(woodEdge(max(edge.wear.mul(0.75), edge.chip)), 0, 1));
    m.normalNode = edge.bend(normalMap(bumps(), vec2(o.normalScale ?? 1, o.normalScale ?? 1)));
  }
  if (chipNormal) m.normalNode = chipNormal(normalMap(bumps(), vec2(o.normalScale ?? 1, o.normalScale ?? 1)));
  m.colorNode = vec4(colour, 1);
  m.roughnessNode = mix(mix(roughness.mul(mix(1, 0.42, wet.mul(one(mossy)))), 0.97, max(max(mossy, f.z), roofMatt)), 0.66, snowy);
  // Stone that sees no sky, out where the sun's shadows are not kept, is indoors: the inside of
  // a tower in the valley, say. The sun does not reach it through its walls.
  // Reflections of the sky only where the sky can be seen.
  lit(m, { irradiance: irradianceOf(normalWorldGeometry, bk), sun: one(underHill(bk)), sky: mix(0.3, smoothstep(0, 0.5, bk.x), uBake), gleam: o.matt ? float(0.12) : undefined });
  // (Ground laid with it, the scree, is passed over into the far land at the edge of the near ground, where a place asks for it.)
  return o.fades ? fadesAtNearEdge(m, o.fades) : m;
}

/** The same material as `makeSiteMaterial` makes, for a surface with depth (see `deep` there). */
function makeDeepMaterial(base: TextureSet, moss: TextureSet, o: { normalScale?: number; roughness?: number; mossScale?: number; matt?: boolean; deep: number; hollow?: number }): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: o.roughness ?? 1, metalness: 0, color: new Color(1, 1, 1) });
  const f = fieldOf(), bk = bakeOf();
  // Which way the texture's two directions run across the surface, as the eye sees it: worked out from how the surface and the
  // texture's coordinates change from one point of the picture to the next.
  const dp1: N = dFdx(positionView), dp2: N = dFdy(positionView), du1: N = dFdx(uv()), du2: N = dFdy(uv());
  const flatN: N = normalize(normalViewGeometry).toVar();
  const p2: N = dp2.cross(flatN), p1: N = flatN.cross(dp1);
  const T: N = normalize(p2.mul(du1.x).add(p1.mul(du2.x))), B: N = normalize(p2.mul(du1.y).add(p1.mul(du2.y)));
  const eye: N = normalize(positionView.negate());
  const near: N = one(smoothstep(5, 13, length(positionView)));
  const at: N = Fn(() => {
    const p: N = vec2(uv()).toVar();
    If(near.greaterThan(0), () => {
      const slide: N = vec2(dot(eye, T), dot(eye, B)).div(max(dot(eye, flatN), 0.32)).mul(o.deep).mul(near).toVar();
      const sunk: N = float(0).toVar();
      Loop(10, () => {
        const h = (texture(base.map, uv().sub(slide.mul(sunk))) as N).level(0).a;
        If(one(h).lessThanEqual(sunk), () => { Break(); });
        sunk.addAssign(1 / 10);
      });
      p.subAssign(slide.mul(sunk));
    });
    return p;
  })().toVar();
  const stone: N = (texture(base.map, at) as N).toVar(), orm: N = (texture(base.ormMap, at) as N).toVar(), mossTex: N = texture(moss.map, uv().mul(o.mossScale ?? 1.7));
  const wet = max(f.y, rainWet(bk).mul(0.8));
  const lightOk = mix(0.4, smoothstep(0.03, 0.3, bk.x).mul(one(smoothstep(0.2, 0.8, bk.y).mul(0.92))), uBake);
  const mossy = smoothstep(0, 0.22, f.x.mul(lightOk).mul(1.5).add(one(stone.a).mul(0.4)).add(mossTex.a.mul(0.45)).sub(1));
  // (The hollows are darker than the texture alone makes them: little light of any kind gets down a furrow.)
  // (`hollow` is how much darker, 0 to 1: a pine's shallow furrows are hardly darker than its plates, an oak's are nearly black.)
  const hollow = mix(1 - 0.5 * (o.hollow ?? 1), 1, smoothstep(0.05, 0.45, stone.a));
  let colour: N = stone.rgb.mul(vertexColor().rgb).mul(mix(1, 0.5, wet)).mul(hollow);
  colour = mix(colour, mossTex.rgb, mossy);
  colour = mix(colour, vec3(0.012), f.z.mul(0.9));
  m.colorNode = vec4(colour, 1);
  m.roughnessNode = mix(float(o.roughness ?? 1).mul(orm.g).mul(mix(1, 0.42, wet.mul(one(mossy)))), 0.97, max(mossy, f.z));
  m.aoNode = orm.r;
  const tn: N = (texture(base.normalMap, at) as N).xyz.mul(2).sub(1);
  m.normalNode = normalMap(vec3(tn.xy.mul(o.normalScale ?? 1), tn.z).mul(0.5).add(0.5));
  lit(m, { irradiance: irradianceOf(normalWorldGeometry, bk).mul(mix(1 - 0.4 * (o.hollow ?? 1), 1, smoothstep(0.05, 0.5, stone.a))), sun: one(underHill(bk)), sky: mix(0.3, smoothstep(0, 0.5, bk.x), uBake), gleam: o.matt ? float(0.12) : undefined });
  return m;
}

/**
 * The material for ground: everything nearly level out of doors. It was grass texture with a
 * brown tint smeared along the track from one point of the sheet to the next, which looked
 * like what it was. Now the sheet says, at each of its points, how bare the ground is, how wet
 * and how much under trees (in the fields that masonry uses for damp, soot and so on), and
 * what is drawn is worked out for each point of the picture from those and from the textures
 * themselves:
 *  - turf, with broad slow changes of tone and dry patches, so that a hillside is not one green;
 *  - beaten earth where the ground is bare, pale and gritty with small stones in it; where it
 *    is wet as well, the shingle of a stream's bed;
 *  - last year's leaves under trees;
 *  - and the edges between them where the textures put them, not where the sheet's points
 *    happen to fall: grass holds on where its mat stands high and gives way where the earth
 *    does, so the edge of a track is ragged, with tufts out in the bare ground and bare ground
 *    in among the grass.
 * How much trouble is taken depends on how far off the ground is. Within a few strides bare
 * ground is drawn with depth: its stones stand up out of it and hide what is behind them as
 * the eye moves (the texture is slid along the line of sight by its own heights, a few steps
 * of it). Further off there is texture and its light and shade only. Further still the
 * textures are read more and more blurred, until a far field is its colour and its broad
 * variation and nothing that could be seen repeating.
 */
/** How far off grass is drawn in full, in metres (see `vegetationRange`): where it thins out, the ground begins to stand in for it. */
/**
 * Snow. `uSnow` is how much lies, from 0 for none (the valley and the island) to 1 for the whole
 * of a mountain's winter. It is laid by the materials on whatever faces up enough to hold it:
 * at 1, everything but steep faces, which stay dark, with ragged edges where a slope grows too
 * steep; at a little, only patches of old snow lying late into summer on what is nearly level.
 * Its edges are drawn from noise at two sizes, drifts some tens of metres across and a ragged
 * fringe, so that it never ends along a line.
 */
export const snowUniforms: { uSnow: { value: number }; uSnowLine: { value: Vector2 } } = { uSnow: uniform(0) as N, uSnowLine: uniform(new Vector2(0, 0)) as N };
const snowOn = (P: N, up: N): N => {
  const cover = snowUniforms.uSnow as N, line = snowUniforms.uSnowLine as N;
  const drift: N = farFbm(P.xz.mul(0.045).add(3.7)), fringe: N = farNoise(P.xz.mul(0.85));
  // (And more of it higher up, above a line, if one is given: in summer the old snow lies on the summit and hardly anywhere below it.)
  const higher: N = smoothstep(line.x, line.x.add(35), P.y).mul(line.y);
  // (Where a line is given, nothing lies far below it: old snow in summer is on the heights, not about the house.)
  const below: N = mix(1, smoothstep(line.x.sub(10), line.x.add(8), P.y), step(0.001, line.y));
  return smoothstep(0, 0.12, mix(-1.15, 0.75, cover).add(higher).add(up.sub(0.8).mul(2.4)).add(drift.sub(0.5).mul(1.5)).add(fringe.sub(0.5).mul(0.35))).mul(step(0.001, cover)).mul(below);
};
/** Snow's own colour: white, a little blue, and darker and greyer where it has been trodden. */
// (A little under what fresh snow reflects: in a clear sun anything brighter was drawn as flat white, its shading lost.)
const SNOW: [number, number, number] = [0.79, 0.83, 0.9];

export const groundUniforms: { uGrassRange: { value: number }; uSward: { value: Vector3 }; uBare: { value: Vector4 } } = {
  uGrassRange: uniform(80) as N, uSward: uniform(new Vector3(0.225, 0.3, 0.066)) as N,
  // What bare ground is: its tint (earth, where it is 1, 1, 1), and how far it is stones and not earth whatever the wet (0 in a valley; on a mountain top bare ground is scree of the mountain's own rock).
  uBare: uniform(new Vector4(1, 1, 1, 0)) as N,
};

/**
 * The light a town's street lamps throw after dark. There are a hundred or more of them, far more than lights the renderer can
 * carry, and the streets between them were as dark as the fields, the lanterns glowing over nothing. So their places are kept in a
 * lattice of eight metres, one lamp to a point of it, read without a filter (`setLamps`), and every surface lit by the bake's way
 * (`lit`) adds the light of the lamps in the nine points about it: warm, falling off with distance and gone at eight metres, by
 * how squarely the surface faces the lantern. No shadows: a lamp's light reaches round a corner a little way, as it would by what
 * the walls throw back. Only where the graphics card can read one more texture, and only when the lamps are lit.
 */
const lampTex = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
lampTex.magFilter = lampTex.minFilter = NearestFilter;
lampTex.generateMipmaps = false;
lampTex.needsUpdate = true;
const lampNode: N = texture(lampTex);
/** Where the lattice begins and how many points to a metre (x0, z0, 1/cell), and how bright the lamps are; how many points it has each way. */
export const lampUniforms: { uLamps: { value: Vector4 }; uLampSize: { value: Vector2 } } = { uLamps: uniform(new Vector4(0, 0, 1 / 8, 0)) as N, uLampSize: uniform(new Vector2(1, 1)) as N };
let lampsOn = false;
const LAMP_CELL = 8, LAMP_REACH = 8;
/** Gives the lit materials a town's lamps (`strength` 0 by day), before they are first drawn; or none. */
export function setLamps(list: [number, number, number][] | undefined, strength: number, on = true): void {
  lampsOn = !!list?.length && on && strength > 0;
  if (!lampsOn || !list) { lampUniforms.uLamps.value.w = 0; return; }
  // (Two empty points about the edge, so that what is read beyond it, clamped to the edge, finds nothing and not a lamp twice.)
  const x0 = Math.min(...list.map((l) => l[0])) - 2 * LAMP_CELL, z0 = Math.min(...list.map((l) => l[2])) - 2 * LAMP_CELL;
  const nx = Math.ceil((Math.max(...list.map((l) => l[0])) - x0) / LAMP_CELL) + 3, nz = Math.ceil((Math.max(...list.map((l) => l[2])) - z0) / LAMP_CELL) + 3;
  const data = new Float32Array(nx * nz * 4);
  for (const [x, y, z] of list) {
    const k = (Math.floor((z - z0) / LAMP_CELL) * nx + Math.floor((x - x0) / LAMP_CELL)) * 4;
    // (Lamps stand a dozen metres apart or more; should two fall to one point, the second is left out.)
    if (data[k + 3] === 0) data.set([x, y, z, 1], k);
  }
  lampTex.dispose();
  lampTex.image = { data, width: nx, height: nz } as N;
  lampTex.needsUpdate = true;
  lampUniforms.uLamps.value.set(x0, z0, 1 / LAMP_CELL, strength);
  lampUniforms.uLampSize.value.set(nx, nz);
}
const lampLight = (P: N, n: N): N => {
  const L: N = lampUniforms.uLamps, S: N = lampUniforms.uLampSize;
  const c: N = floor(P.xz.sub(L.xy).mul(L.z)).toVar();
  let sum: N = float(0);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const t: N = lampNode.load(ivec2(clamp(c.add(vec2(dx, dz)), vec2(0, 0), S.sub(1)))).toVar();
    const d: N = t.xyz.sub(P), d2: N = max(dot(d, d), 0.01);
    const window: N = clamp(one(d2.div(LAMP_REACH * LAMP_REACH)), 0, 1);
    // (A lantern's cap shades what is above it: without that the roofs about a lamp glowed as if the house were afire.)
    const capped: N = mix(1, 0.06, smoothstep(-0.2, 1.6, P.y.sub(t.y)));
    sum = sum.add(t.w.mul(window.mul(window)).mul(capped).div(d2.mul(0.6).add(1)).mul(max(dot(n, d.mul(d2.inverseSqrt())), 0).mul(0.85).add(0.15)));
  }
  return vec3(1.0, 0.6, 0.28).mul(sum).mul(L.w);
};

/**
 * Which way a town's paving is laid (`PaveFrame`, made by the town), read point by point without a filter: a lattice of a metre,
 * holding at each point how far along and across its street (or square) it lies, which way that runs, and which it is. Between the
 * lattice's points each of the four about is carried on to this point the way its street runs, and the four are mixed by nearness;
 * those of another street than the nearest are left out, so that where two streets meet their courses meet along a line, as they do.
 */
const paveFrameTex = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType);
paveFrameTex.magFilter = paveFrameTex.minFilter = NearestFilter;
paveFrameTex.generateMipmaps = false;
paveFrameTex.needsUpdate = true;
const paveFrameNode: N = texture(paveFrameTex);
/** Where the lattice begins, how many points to a metre, and whether there is one (x0, z0, 1/cell, on); and how many points it has each way. */
export const paveUniforms: { uPave: { value: Vector4 }; uPaveSize: { value: Vector2 }; uSun: { value: Vector3 } } = { uPave: uniform(new Vector4(0, 0, 1, 0)) as N, uPaveSize: uniform(new Vector2(1, 1)) as N, uSun: uniform(new Vector3(0.5, 0.6, 0.6)) as N };
// (`uSun` is the way to the sun, for the shadows in the paving's joints.)
/** Gives the ground's material a town's paving frame, or none (`on` false where the graphics card cannot read one more texture). */
export function setPaving(f: PaveFrame | undefined, on = true): void {
  paveFrameUsed = !!f && on;
  if (!f || !on) { paveUniforms.uPave.value.set(0, 0, 1, 0); return; }
  paveFrameTex.dispose();
  paveFrameTex.image = { data: f.data, width: f.nx, height: f.nz } as N;
  paveFrameTex.needsUpdate = true;
  paveUniforms.uPave.value.set(f.x0, f.z0, 1 / f.cell, 1);
  paveUniforms.uPaveSize.value.set(f.nx, f.nz);
}
/**
 * Whether the lattice is read at all. Where it is not to be had (no town, or a graphics card that cannot read one more texture, as
 * under WebGL 2, which allows sixteen to the ground's program), it is left out of the program altogether: read and then ignored, it
 * was one texture too many there, the ground's program was refused, and a town's streets were drawn as nothing, the haze showing
 * through. (Settled before the materials are first drawn, when their programs are made.)
 */
let paveFrameUsed = false;
const paveFrameAt = (p: N): { c: N; a: N; d: N; e: N; id: N } => {
  if (!paveFrameUsed) return { c: p.x.negate(), a: p.y, d: vec2(0, 1), e: vec2(-1, 0), id: float(0) };
  const P: N = paveUniforms.uPave, S: N = paveUniforms.uPaveSize;
  const gp: N = p.sub(P.xy).mul(P.z).toVar();
  const base: N = floor(gp).toVar(), w: N = gp.sub(base).toVar();
  const load = (ij: N): N => paveFrameNode.load(ivec2(clamp(ij, vec2(0, 0), S.sub(1))));
  const idN: N = load(floor(gp.add(0.5))).w.toVar();
  let sum: N = vec2(0, 0), dir: N = vec2(0, 0), wsum: N = float(0);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const ij: N = base.add(vec2(dx, dy));
    const t: N = load(ij).toVar();
    const off: N = p.sub(ij.div(P.z).add(P.xy));
    const d: N = vec2(cos(t.z), sin(t.z)), e: N = vec2(d.y.negate(), d.x);
    const wt: N = (dx ? w.x : one(w.x)).mul(dy ? w.y : one(w.y)).mul(step(abs(t.w.sub(idN)), 0.5));
    sum = sum.add(vec2(t.y.add(dot(off, e)), t.x.add(dot(off, d))).mul(wt));
    dir = dir.add(d.mul(wt));
    wsum = wsum.add(wt);
  }
  const on: N = step(0.5, idN).mul(P.w).toVar();
  const fr: N = sum.div(max(wsum, 1e-6)).toVar(), dn: N = normalize(dir.add(vec2(1e-6, 0))).toVar();
  // (Where there is none, as everywhere but a town, courses run along x, as they always did.)
  return { c: mix(p.x.negate(), fr.x, on), a: mix(p.y, fr.y, on), d: mix(vec2(0, 1), dn, on), e: mix(vec2(-1, 0), vec2(dn.y.negate(), dn.x), on), id: idN.mul(on) };
};
/** A plane turned a little more than a third of a right angle, so that noise read through it shows none of the squares it is made on. */
const rot = (q: N): N => vec2(q.x.mul(0.8).sub(q.y.mul(0.6)), q.x.mul(0.6).add(q.y.mul(0.8)));
/** A row of cells each one wide, their ends moved by up to `j` either way: which one `x` falls in, how far through it (0 to 1), and how wide it is. */
const cellsOf = (x: N, seed: N, j: number | N): { k: N; at: N; size: N } => {
  const k0: N = floor(x).toVar();
  const end = (k: N): N => k.add(farHash(vec2(k, seed)).sub(0.5).mul(float(j).mul(2)));
  const b0: N = end(k0).toVar(), b1: N = end(k0.add(1)).toVar();
  const below: N = x.lessThan(b0), above: N = x.greaterThanEqual(b1);
  const lo: N = select(below, end(k0.sub(1)), select(above, b1, b0)).toVar(), hi: N = select(below, b0, select(above, end(k0.add(2)), b1)).toVar();
  return { k: select(below, k0.sub(1), select(above, k0.add(1), k0)), at: x.sub(lo).div(hi.sub(lo)), size: hi.sub(lo) };
};
/**
 * The stone of a pavement a point falls on, from where it is in the paving (`c` along the courses, `a` across them): which stone,
 * how far it is from the stone's nearer edges each way, in metres, and how far through the stone it is each way (0 to 1). Setts
 * are in courses of fourteen centimetres or so, seventeen across; flags in courses of some fifty-five, each stone its own length.
 * Neither courses nor stones are all one size: sorted by eye from what the quarry gave, they differ by a quarter either way, and
 * each course begins its stones at its own place, so that no joint runs on from one course into the next. `arcs`, where 1, lays
 * the courses in arcs between springings two metres apart, as the setts of old streets were laid, so that wheels cross the joints
 * at a slant and do not wear them into ruts.
 */
const stonesAt = (c: N, a: N, flagged: N, arcs: N): { id: N; ex: N; ez: N; lx: N; lz: N } => {
  const rowM: N = mix(0.14, 0.55, flagged), widM: N = mix(0.17, 0.9, flagged);
  const sx: N = fract(c.div(2.2).add(0.5)).sub(0.5);
  // (Each arc rises a quarter of a metre over its two: steeper, and where two arcs met their courses ran together in sharp points.)
  const aw: N = a.sub(arcs.mul(1.0).mul(float(0.25).sub(sx.mul(sx))));
  const row = cellsOf(aw.div(rowM), float(17.31), mix(0.2, 0.3, flagged));
  const st = cellsOf(c.div(widM).add(farHash(vec2(row.k, 5.17)).mul(9.7)), row.k.add(31.7), mix(0.32, 0.36, flagged));
  const at: N = st.at.toVar(), az: N = row.at.toVar();
  return { id: vec2(st.k, row.k), ex: min(at, one(at)).mul(st.size).mul(widM), ez: min(az, one(az)).mul(row.size).mul(rowM), lx: at, lz: az };
};

/** The stone a point of the paving falls on (`stonesAt`), with its edge's distance, the corners rounded and the edge a little ragged, as split stone is. */
const stoneAt = (q: N, flagged: N, arcs: N, id: N, detail: N): { sto: ReturnType<typeof stonesAt>; edge: N; inCorner: N; rc: N; tone: N } => {
  const sto = stonesAt(q.x, q.y, flagged, arcs);
  const tone: N = farHash(sto.id.add(vec2(id.mul(13.1), 0.5))).toVar();
  // (A flag's corners are broken off more on some than others: old flags are chipped, and none is square.)
  const rc: N = mix(0.028, mix(0.035, 0.09, tone), flagged);
  const inCorner: N = sto.ex.lessThan(rc).and(sto.ez.lessThan(rc));
  const ragged: N = farNoise(rot(q.mul(mix(41, 17, flagged))).add(tone.mul(17))).sub(0.5).mul(mix(0.014, 0.012, flagged)).mul(detail);
  const edge: N = select(inCorner, rc.sub(length(vec2(rc.sub(sto.ex), rc.sub(sto.ez)))), min(sto.ex, sto.ez)).add(ragged).toVar();
  return { sto, edge, inCorner, rc, tone };
};
/** How high a point of a stone stands, from 0 at the bottom of a joint to 1 at the top of the stone: the sand of a joint a little up, the stone rising over its last few centimetres to its edge, and domed. */
const stoneHeight = (st: ReturnType<typeof stoneAt>, flagged: N, jw: N): N => {
  const rise: N = smoothstep(jw.mul(0.5), jw.add(mix(0.026, 0.03, flagged)), st.edge);
  const dome: N = one(st.sto.lx.sub(0.5).mul(st.sto.lx.sub(0.5)).add(st.sto.lz.sub(0.5).mul(st.sto.lz.sub(0.5))).mul(2));
  // (Flags have settled each its own way, some a few millimetres lower than their neighbours.)
  return mix(0.18, mix(0.8, 1, dome).mul(mix(1, mix(0.72, 1, st.tone), flagged)), rise);
};

/**
 * Round spots scattered over a surface, as lichen grows on stone: a cell of `cell` metres holds one spot or none (`share` of them
 * do), somewhere in its middle half, from `r0` to `r1` metres across, its edge ragged. 1 in a spot, 0 between. (Read from noise
 * cut at a level, as they were, they were angular blots like the chips in terrazzo.)
 */
const spotsOf = (q: N, cell: number, share: N, r0: number, r1: number, k: number): N => {
  const g: N = q.div(cell), i: N = floor(g), f: N = fract(g);
  const at: N = vec2(farHash(i.add(k + 1.7)), farHash(i.add(k + 3.1))).mul(0.5).add(0.25);
  const r: N = mix(r0 / cell, r1 / cell, farHash(i.add(k + 5.3)));
  const d: N = length(f.sub(at)).div(r).add(farNoise(rot(q.mul(90).add(k))).sub(0.5).mul(0.35));
  return one(smoothstep(0.75, 1, d)).mul(step(farHash(i.add(k)), share));
};

export function makeGroundMaterial(turf: TextureSet, soil: TextureSet, shingle: TextureSet, litter: TextureSet, thatch: TextureSet, moss: TextureSet, scale = 2.3): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0, color: new Color(1, 1, 1) });
  const f = fieldOf(), bk = bakeOf();
  // Where on the ground this point of the picture is, in metres; every texture is laid by that.
  const at0: N = positionWorld.xz, far: N = length(positionView), blur: N = smoothstep(70, 260, far).mul(5);
  const turfAt = (at: N): N => texture(turf.map, at);
  // The same turf read very large: slow changes of tone that no repeat can be seen in.
  const macro = turfAt(at0.div(41).add(0.37)).a, mid = turfAt(at0.div(9.7).add(0.11)).a;
  // The track: two ruts, a stride apart, and between them bare earth wherever grass is not
  // standing in a clump. (The sheet gives how far this point is to one side of the track's
  // middle, plus a hundred; nothing where there is no track.) Neither the ruts nor the edges
  // of the track run straight: they wander, and widen and narrow.
  const wander = turfAt(at0.div(5.3).add(0.61)).a.sub(0.5);
  const off = abs(f.x.sub(100).add(wander.mul(0.34))).add(mid.sub(0.5).mul(0.3));
  // (The field says how far from the track's middle, plus a hundred; or from a footpath's, plus two hundred.)
  // (Only where the number changes across the ground as a distance does, a metre to the metre. Between a point of the sheet on a
  // track and one off it, a town's paving (less than minus three hundred) or the grass beside it (nothing), the sheet's triangle
  // carries the number through every value between, and the material found a rut's floor wherever it passed the rut's place: a
  // line of ruts, holding water, along every edge of every track and across a street of earth where it met paving.)
  const trueWay: N = one(smoothstep(3, 8, fwidth(f.x).div(length(fwidth(at0)).add(1e-4)))).toVar();
  const onFoot: N = step(150, f.x).mul(trueWay), onTrack: N = step(50, f.x).mul(step(f.x, 150)).mul(trueWay);
  // Paving, in a town: where the field's first number is less than nothing it is how far in from the paving's edge this point is,
  // plus three hundred, made negative; and what the paving is, the litter channel says, which paving has no other use for: nothing
  // or more for setts (a street), less than nothing for flags (a square, a quay), less than minus one and a half for gravel (a
  // garden's walk). It is drawn here as stones in courses, each its own tone, with dark joints between, the edges of setts rounded,
  // and the pattern fading into its own average further off, where it would only shimmer.
  // (The kinds were once told apart by bands of the first number, three hundred apart; but where flags meet grass the sheet's
  // triangles blend their number down towards nothing, and passing through the setts' band it drew setts in the grass a few metres
  // off every flagged edge, first a strip and, with the band narrowed, a hairline. One band for all crosses nothing on its way.)
  const flagged: N = step(f.w, -0.5), gravelled: N = step(f.w, -1.5), paveSd: N = f.x.negate().sub(300).toVar();
  const paved: N = smoothstep(-0.04, 0.04, paveSd).mul(step(f.x, -250)).toVar();
  // Where in its paving this point is: `c` along the courses and `a` the way they follow one another, in metres, by which way the
  // street it belongs to runs (`paveFrameAt`); and the stone it falls on (`stonesAt`), its edges rounded and a little ragged, as
  // split stone is. Setts are granite of the fields, each stone its own; a street in two of every four is laid in arcs.
  // (All of the paving is worked out only where there is paving: everywhere else, in every valley, on every island and mountain,
  // the ground's material would otherwise lay stones it does not show at every point of the picture.)
  const pave: N = vec3(0, 0, 0).toVar(), paveNormal: N = vec3(0, 0, 1).toVar(), paveRough: N = float(0.9).toVar(), jointLit: N = float(1).toVar(), paveLow: N = float(0).toVar();
  // (The paving's own two ways are in metres, as the ground's are, so how fast they change across the picture is the ground's.)
  const aa: N = length(fwidth(at0)).mul(1.2).add(0.002).toVar(), byEdge: N = one(smoothstep(0.3, 1.6, paveSd)).toVar();
  // (Worked out where the ground's colour is, which is the first of what the material is made of: the relief, the roughness and the
  // sun's shadow in the joints are left in those variables for what is made after it to read.)
  const paving: N = Fn(() => {
  pave.assign(vec3(0, 0, 0)); paveNormal.assign(vec3(0, 0, 1)); paveRough.assign(0.9); jointLit.assign(1); paveLow.assign(0);
  If(paved.greaterThan(0), () => {
    const pf = paveFrameAt(at0);
    const street: N = step(0.5, pf.id).mul(step(pf.id, 1000)), arcs: N = street.mul(step(0.5, farHash(vec2(pf.id, 2.71)))).mul(one(flagged));
    const detail: N = one(smoothstep(mix(16, 36, flagged), mix(55, 130, flagged), far)).toVar();
    // (Setts are bedded in sand, a finger's breadth between them, which feet and rain keep low; flags are laid close.)
    const jw: N = mix(0.0105, 0.006, flagged);
    // Near the eye the paving has depth, as bare ground has: the stones stand up out of their joints and hide what is behind them
    // as the eye moves, the picture slid along the line of sight until the line meets a stone. And the sun is followed a little way
    // from where the line came down: a joint lies in the shadow of the stone on its sunward side, which is what makes a pavement
    // read as stones when the sun is low, and a flat picture of them when it is not.
    const pnear: N = one(smoothstep(7, 13, far)).mul(step(0.01, paved)).mul(one(gravelled)).toVar();
    const deepM: N = mix(0.024, 0.012, flagged);
    const heightAt = (q: N): N => stoneHeight(stoneAt(q, flagged, arcs, pf.id, float(1)), flagged, jw);
    const pq: N = Fn(() => {
      const q0: N = vec2(pf.c, pf.a), q: N = vec2(q0).toVar();
      If(pnear.greaterThan(0), () => {
        const eye: N = normalize(cameraPosition.sub(positionWorld));
        const w: N = eye.xz.div(max(eye.y, 0.22));
        const slide: N = vec2(dot(w, pf.e), dot(w, pf.d)).mul(deepM).mul(pnear).toVar();
        const sunk: N = float(0).toVar(), last: N = float(0).toVar();
        Loop(8, () => {
          const h: N = heightAt(q0.sub(slide.mul(sunk)));
          If(one(h).lessThanEqual(sunk), () => { Break(); });
          last.assign(sunk);
          sunk.addAssign(1 / 8);
        });
        // (And once more between the last step above the stone and the first in it.)
        const mid2: N = last.add(sunk).mul(0.5);
        sunk.assign(select(one(heightAt(q0.sub(slide.mul(mid2)))).lessThanEqual(mid2), mid2, sunk));
        q.assign(q0.sub(slide.mul(sunk)));
        const sun: N = paveUniforms.uSun as N;
        If(sun.y.greaterThan(0.05), () => {
          const s: N = sun.xz.div(max(sun.y, 0.12));
          const toSun: N = vec2(dot(s, pf.e), dot(s, pf.d)).mul(deepM).toVar();
          // (From the stone's true height where the line came down, a little raised: from the height of the step the line had come
          // down to, which is coarser, a domed flag shaded itself in rings.)
          const h0: N = heightAt(q).add(0.03).toVar();
          for (const k of [0.2, 0.45, 0.75, 1]) {
            const t: N = max(one(h0), 0.05).mul(k);
            jointLit.assign(min(jointLit, smoothstep(-0.04, 0.06, h0.add(t).sub(heightAt(q.add(toSun.mul(t)))))));
          }
          jointLit.assign(mix(1, jointLit, pnear));
        });
      });
      return q;
    })().toVar();
    // The stone this point of the picture shows, and the paving where it lies, as the line of sight found it.
    const st = stoneAt(pq, flagged, arcs, pf.id, detail);
    const sto = st.sto, edge: N = st.edge, inCorner: N = st.inCorner, rc: N = st.rc, sTone: N = st.tone;
    const sCast: N = farHash(sto.id.add(vec2(7.3, pf.id.mul(3.7)))).toVar(), sKind: N = farHash(sto.id.add(vec2(1.7, pf.id.add(9.1)))).toVar();
    const joint: N = one(smoothstep(jw, jw.add(aa), edge)).mul(detail).add(one(detail).mul(0.1)).toVar();
    // How far from the paving's edge, where it meets a wall or the grass, and from the middle of a street, where wheels and feet go.
    const trod: N = smoothstep(1.2, 2.8, paveSd).mul(street).toVar();
    pave.assign(Fn(() => {
      // Field granite is grey, pink, red-brown, blue-grey and pale by turns, stone by stone; flags from one quarry differ less. (As
      // shares of the paving's own colour, which is what the paving is drawn as further off, so that it does not change colour there.)
      const granite: N = select(sKind.lessThan(0.3), vec3(0.96, 0.97, 1.02), select(sKind.lessThan(0.5), vec3(1.12, 0.97, 0.9), select(sKind.lessThan(0.65), vec3(1.0, 0.8, 0.72),
        select(sKind.lessThan(0.82), vec3(0.74, 0.79, 0.86), vec3(1.2, 1.17, 1.1)))));
      // (Flags from one quarry and one bed are near one colour, but a bed runs warmer or greyer, and some were brought from elsewhere.)
      const bed: N = select(sKind.lessThan(0.35), vec3(0.93, 0.96, 1.02), select(sKind.lessThan(0.7), vec3(1.07, 1.0, 0.9), select(sKind.lessThan(0.88), vec3(0.8, 0.8, 0.82), vec3(1.12, 1.08, 1.0))));
      const kind: N = mix(granite, bed.mul(mix(vec3(0.97, 0.99, 1.02), vec3(1.03, 1.0, 0.97), sCast)), flagged);
      // (The grain of the stone, laid differently in each: a speckle of crystals and a coarser grain, turned off the lines of the noise
      // so that they show no squares; a mottle of old wet and lichen on some, scrubbed pale on others; and dirt towards the edges, where
      // feet and brooms do not reach.)
      const seed: N = vec2(sTone.mul(37.1), sCast.mul(53.7)), q: N = pq;
      const fine: N = one(smoothstep(3, 9, far));
      const speckle: N = smoothstep(0.25, 0.75, farNoise(rot(q.mul(71)).add(seed.yx))).mul(0.6).add(smoothstep(0.3, 0.7, farNoise(rot(q.mul(-43)).add(seed))).mul(0.4));
      const grain: N = smoothstep(0.25, 0.75, farNoise(rot(q.mul(mix(11, 4.5, flagged))).add(seed)));
      const mottle: N = smoothstep(0.2, 0.8, farNoise(rot(q.mul(mix(3.1, 1.3, flagged))).add(seed.mul(1.3))));
      const grime: N = mix(0.8, 1, smoothstep(0.01, mix(0.05, 0.14, flagged), edge));
      const worn: N = mix(1, mix(0.82, 1.16, speckle), fine.mul(0.8).add(0.2)).mul(mix(0.84, 1.1, grain)).mul(mix(0.8, 1.08, mottle)).mul(grime);
      // (Where feet go the tops are rubbed paler and clean; by the walls dust lies on them.)
      const rubbed: N = mix(1, 1.07, trod.mul(smoothstep(0.02, 0.05, edge)));
      // Old flags carry lichen where few feet go, pale grey-green rosettes and dark spots; and here and there one is cracked across.
      const still: N = one(trod.mul(0.8)).mul(flagged);
      const lichen: N = spotsOf(q, 0.13, still.mul(mix(0.18, 0.4, byEdge)), 0.016, 0.048, 11).mul(fine.mul(0.6).add(0.4));
      const spots: N = spotsOf(q, 0.09, still.mul(0.07), 0.005, 0.014, 27);
      const ang: N = sCast.mul(3.1416), lp: N = vec2(sto.lx.sub(0.5), sto.lz.sub(0.5));
      const crackD: N = abs(dot(lp, vec2(cos(ang), sin(ang))).sub(sTone.sub(0.5).mul(0.5)).add(farNoise(rot(q.mul(19))).sub(0.5).mul(0.06)));
      const crack: N = one(smoothstep(0.003, 0.009, crackD)).mul(step(farHash(sto.id.add(vec2(5.5, 1.3))), 0.09)).mul(flagged).mul(detail).mul(0.7);
      const stones: N = vertexColor().rgb.mul(mix(vec3(1, 1, 1), kind.mul(mix(mix(0.82, 1.14, sTone), mix(0.76, 1.18, sTone), flagged)).mul(worn).mul(rubbed), detail))
        .mul(mix(0.9, 1.08, macro)).mul(mix(vec3(1, 1, 1), vec3(1.12, 1.15, 0.98), lichen.mul(0.7))).mul(one(spots.mul(0.35))).mul(one(crack.mul(0.6)));
      // In the joints, sand and grit; moss and dark earth where feet go least, and towards the edges.
      const sand: N = mix(vec3(0.2, 0.18, 0.15), vec3(0.4, 0.35, 0.28), farNoise(rot(q.mul(23)))).mul(mix(0.6, 0.85, trod)).mul(mix(0.55, 1, smoothstep(0, jw, edge)));
      const mossy: N = smoothstep(0.45, 0.75, mid.add(macro.sub(0.5).mul(0.8)).add(byEdge.mul(0.35)).sub(trod.mul(0.4)));
      const filled: N = mix(mix(sand, stones.mul(vec3(0.32, 0.3, 0.27)), flagged), vec3(0.05, 0.075, 0.03), mossy.mul(0.75));
      return mix(stones, filled, joint);
    })());
    // The stones' relief: each falls away towards its edges over the last few centimetres, setts much more than flags, is a little
    // domed over its whole face, and lies not quite level, settled a little one way or another, so that the sun catches them unevenly.
    paveNormal.assign(Fn(() => {
      const fallW: N = mix(0.026, 0.03, flagged), rise: N = mix(0.013, 0.005, flagged);
      const t: N = clamp(edge.sub(jw).div(fallW), 0, 1);
      const fall: N = t.mul(one(t)).mul(6).div(fallW).mul(rise).mul(step(jw, edge)).mul(detail).toVar();
      // (Which way is out of the stone at its nearest edge, in the paving's own two ways: across, or along, or out of the corner.)
      const sx: N = select(sto.lx.lessThan(0.5), float(-1), float(1)), sz: N = select(sto.lz.lessThan(0.5), float(-1), float(1));
      const out: N = select(inCorner, normalize(vec2(sx.mul(rc.sub(sto.ex)), sz.mul(rc.sub(sto.ez))).add(1e-5)), select(sto.ex.lessThan(sto.ez), vec2(sx, 0), vec2(0, sz)));
      const dome: N = vec2(sto.lx.sub(0.5), sto.lz.sub(0.5)).mul(mix(0.16, 0.035, flagged));
      const tilt: N = vec2(farHash(sto.id.add(vec2(41.3, 2.9))), farHash(sto.id.add(vec2(3.1, 61.7)))).sub(0.5).mul(mix(0.12, 0.07, flagged));
      const g: N = out.mul(fall).add(dome.add(tilt).mul(detail).mul(one(joint)));
      // (From the paving's two ways to the ground's: across is `e`, along is `d`.)
      return vec3(pf.e.mul(g.x).add(pf.d.mul(g.y)), 1);
    })());
    paveRough.assign(mix(mix(mix(0.66, 0.5, trod), 0.95, joint), mix(0.82, 0.6, trod), flagged));
    // Where water stands on the paving in rain: in its joints, and over the stones in the hollows a street settles into, a stride or
    // two across (more of them in the middle of a street, where the carts go). How much is wet is said outside.
    // (Water in the joints is sunk below the stones and sees less of the sky: it is a dark wet line with a glint, not a bright one.)
    const hollow: N = smoothstep(0.29, 0.23, farNoise(rot(pq.div(3.7)).add(8.3)).mul(0.75).add(farNoise(rot(pq.mul(0.9)).add(4.1)).mul(0.25)).sub(trod.mul(0.04)));
    paveLow.assign(max(joint.mul(mix(0.35, 0.2, flagged)), hollow));
  });
  return pave;
  })().toVar();
  // A footpath: one worn line, a forearm's breadth or two, wandering a little either side of where it is laid.
  const footOff: N = abs(f.x.sub(200)).add(wander.mul(0.22)).toVar();
  const footBare: N = one(smoothstep(0.22, 0.5, footOff.add(mid.sub(0.5).mul(0.25)))).mul(onFoot).toVar();
  const rut: N = one(smoothstep(0, 0.34, abs(off.sub(0.58)).sub(0.2).sub(wander.mul(0.14)))).toVar();
  // The bottom of a rut, where wheels have pressed the earth down hard: narrower than the rut.
  const rutFloor: N = one(smoothstep(0, 0.16, abs(off.sub(0.58)).sub(0.08).sub(wander.mul(0.08)))).mul(onTrack).toVar();
  const clump = sin(at0.y.mul(0.9).add(sin(at0.y.mul(0.31)).mul(2.2)));
  const bareV: N = max(select(onTrack.greaterThan(0.5), max(f.z, max(rut, sstep(-0.15, -0.35, clump).mul(one(smoothstep(0.25, 0.5, off))))), f.z), footBare.mul(0.85)).toVar();
  const wetV = max(f.y, rainWet(bk).mul(0.7)), litV = f.w;
  const stony: N = max(smoothstep(0.2, 0.55, wetV.add(mid.sub(0.5).mul(0.3))), (groundUniforms.uBare as N).w.mul(smoothstep(0.25, 0.6, mid.add(macro.sub(0.5).mul(0.6))).mul(0.6).add(0.4))).toVar();
  // Near the eye, bare ground has depth: the texture is slid along the line of sight until the
  // line meets the height the texture has there, so stones stand up and hide what is behind them.
  // And a track's ruts are sunk, a hand deep in their middles, their sides sloping up to the strip between them and to the grass:
  // so the line of sight is slid by the ruts' depth as well, and near the eye a rut's far side hides its floor. (They were drawn
  // as darker bands on level ground.) How far from the track's middle a point a little way off is, the slide needs; the sheet gives
  // it only here, so it is carried on from here by how fast it changes across the ground, which is worked out from how fast it
  // changes across the picture.
  const near = one(smoothstep(6, 14, far));
  const dPx: N = dFdx(at0), dPy: N = dFdy(at0), dOx: N = dFdx(off), dOy: N = dFdy(off);
  const det0: N = dPx.x.mul(dPy.y).sub(dPx.y.mul(dPy.x));
  const det: N = det0.add(select(det0.greaterThanEqual(0), float(1e-12), float(-1e-12)));
  const gOff0: N = vec2(dOx.mul(dPy.y).sub(dOy.mul(dPx.y)), dPx.x.mul(dOy).sub(dPy.x.mul(dOx))).div(det);
  // (A distance changes by a metre to the metre, no more: where the picture says otherwise, at the track's middle, it is held to that.)
  const gOff: N = gOff0.mul(min(1, float(1.2).div(max(length(gOff0), 1e-4)))).toVar();
  const RUT = 0.07;
  const rutDeep = (o: N): N => one(smoothstep(0.06, 0.3, abs(o.sub(0.58)).sub(wander.mul(0.1)))).mul(onTrack).mul(RUT);
  const at: N = Fn(() => {
    const p: N = vec2(at0).toVar();
    If(near.greaterThan(0).and(bareV.greaterThan(0.04)), () => {
      const eye: N = normalize(cameraPosition.sub(positionWorld));
      const texD: N = mix(0.022, 0.05, stony).mul(smoothstep(0.04, 0.4, bareV)).toVar(), deep: N = texD.add(onTrack.mul(RUT)).toVar();
      const slide: N = eye.xz.div(max(eye.y, 0.3)).mul(deep).mul(near).toVar();
      const sunk: N = float(0).toVar();
      Loop(8, () => {
        const q = at0.sub(slide.mul(sunk));
        const h = mix((texture(soil.map, q.mul(1.5)) as N).level(0).a, (texture(shingle.map, q.mul(0.62)) as N).level(0).a, stony);
        const below: N = one(h).mul(texD).add(rutDeep(off.add(dot(gOff, q.sub(at0))))).div(max(deep, 1e-4));
        If(below.lessThanEqual(sunk), () => { Break(); });
        sunk.addAssign(1 / 8);
      });
      p.subAssign(slide.mul(sunk));
    });
    return p;
  })().toVar();
  // (The slope of a rut's side where the line of sight came down, for its light and shade.)
  const offAt: N = off.add(dot(gOff, at.sub(at0))).toVar();
  const rutTilt: N = gOff.mul(rutDeep(offAt.add(0.02)).sub(rutDeep(offAt.sub(0.02))).div(0.04)).mul(one(smoothstep(30, 80, far))).toVar();
  const gUv = at.mul(scale);
  // The turf is read twice, the second time larger and turned, and the two mixed: neither one's repeat survives the other.
  const gTurf: N = mix((texture(turf.map, gUv) as N).bias(blur), (texture(turf.map, at.yx.mul(0.83).add(0.29)) as N).bias(blur), 0.45).toVar();
  const gSoil: N = (texture(soil.map, at.mul(1.5)) as N).bias(blur), gShingle: N = (texture(shingle.map, at.mul(0.62)) as N).bias(blur), gLitter: N = (texture(litter.map, at.mul(1.7)) as N).bias(blur);
  const earthH = mix(gSoil.a, gShingle.a, stony);
  // Grass gives way to earth where its mat is thin and the earth stands high: not along a line.
  const bare: N = smoothstep(0.4, 0.6, bareV.mul(1.12).add(mid.sub(0.5).mul(0.55)).add(earthH.sub(gTurf.a).mul(0.35))).toVar();
  const leafy: N = smoothstep(0.4, 0.62, litV.add(macro.sub(0.5).mul(0.5)).add(gLitter.a.sub(gTurf.a).mul(0.3))).mul(one(bare)).toVar();
  // (Turf as it is, not as a lawn is painted: a little less green than the texture and the sheet would make it.)
  const raw: N = vertexColor().rgb.mul(gTurf.rgb).mul(mix(0.74, 1.3, macro));
  const base: N = mix(raw, vec3(dot(raw, vec3(0.3, 0.55, 0.15))), 0.22);
  const wide = turfAt(at0.div(23).add(0.71)).a;
  const lowSpotOf = (p: N): N => (texture(turf.map, p.div(6.1).add(0.19)) as N).a.add(mid.sub(0.5).mul(0.4));
  // Turf is not one green. It is yellower where it has dried, darker and bluer where clover and
  // moss have got into it, and thin enough in places for the earth to show.
  const patch = turfAt(at.div(3.7).add(0.83)).a;
  let turfed: N = mix(base, base.mul(vec3(1.5, 1.22, 0.7)), smoothstep(0.55, 0.8, mid).mul(0.34));
  turfed = mix(turfed, turfed.mul(vec3(0.62, 0.8, 0.86)), smoothstep(0.5, 0.72, patch).mul(0.5));
  turfed = mix(turfed, gSoil.rgb.mul(vec3(0.5, 0.46, 0.4)), sstep(0.4, 0.2, gTurf.a.add(patch.sub(0.5).mul(0.4))).mul(0.55)).toVar();
  // (Earth is darker where it is damp, which on a track is in broad patches, and darker in the hollows of the ground.)
  const damp = smoothstep(0.35, 0.7, wide.add(lowSpotOf(at0)).mul(0.6));
  const earthy = mix(gSoil.rgb.mul(vec3(0.6, 0.57, 0.52)), gShingle.rgb.mul(0.62), stony).mul(mix(0.84, 1.14, macro)).mul(mix(1, 0.68, damp)).mul((groundUniforms.uBare as N).xyz);
  // Dead grass lying in the turf, in drifts some metres across: thickest where it is dry and trodden,
  // along the edges of the track and between its ruts, and least where the ground is wet.
  const gThatch: N = (texture(thatch.map, at.mul(1.15)) as N).bias(blur).toVar();
  // (Less of it along a track than there was: it lay in a band of straw a stride broad down each side, flat and pale yellow, like
  // a mat laid along the track, where the grass of a summer's track is olive and comes right up to the earth.)
  const trodden = onTrack.mul(one(smoothstep(1.1, 2.4, off))).mul(0.14).add(onFoot.mul(one(smoothstep(0.4, 1.6, footOff))).mul(0.3));
  const dry: N = smoothstep(0.5, 0.72, wide.mul(0.7).add(mid.mul(0.45)).add(patch.sub(0.5).mul(0.35)).add(trodden).sub(wetV.mul(0.7)).sub(0.08).add(gThatch.a.sub(0.4).mul(0.3))).mul(one(leafy)).toVar();
  turfed = mix(turfed, gThatch.rgb.mul(vertexColor().rgb.mul(1.2).add(0.24)).mul(mix(0.8, 1.1, macro)), dry.mul(0.85));
  // Far off there is no grass standing on the ground: the tufts thin out and then stop, because nothing so small can be drawn so far
  // away. What stops must not leave bare turf behind it, which is another colour and lies flat: a meadow would end at a line. So where
  // the tufts thin, the turf takes on what standing grass looks like from a distance: its colour, which is paler and yellower than
  // the mat under it, and its unevenness, drifts some metres across. It costs nothing, and it has no farthest distance.
  const swardFar: N = smoothstep((groundUniforms.uGrassRange as N).mul(0.55), (groundUniforms.uGrassRange as N).mul(2.2), far).toVar();
  const sward = vertexColor().rgb.mul(groundUniforms.uSward as N).mul(1.68).mul(mix(0.9, 1.1, mid)).mul(mix(0.86, 1.12, macro));
  turfed = mix(turfed, sward, swardFar.mul(0.85)).toVar();
  // Nor is it one green over a hillside, any more than the far land's pasture is (`makeFarMaterial`): yellower on dry slopes that face
  // the sun (greater z) and in drifts a field or two across, darker and lusher where the ground is damp, with stands of olive-brown
  // bracken on the dry slopes. Only where the tufts no longer stand on it; where they do, they are what is seen.
  // (The hills just beyond a valley are laid with this material, not the far land's, and stayed one bright green, a golf course.)
  {
    const nG: N = normalize(normalWorldGeometry), fDrift: N = farNoise(at0.mul(0.045).add(3.3)).toVar();
    const dryLie: N = smoothstep(0.15, 0.75, nG.z.mul(0.5).add(0.25).add(fDrift.sub(0.5).mul(0.7)).sub(wetV.mul(0.5))).toVar();
    const lush: N = smoothstep(0.5, 0.85, farNoise(at0.mul(0.021).add(7.9)).add(wetV.mul(0.4))).toVar();
    const bracken: N = smoothstep(0.6, 0.7, farNoise(at0.mul(0.017).add(11.1)).mul(0.7).add(fDrift.mul(0.3))).mul(dryLie).mul(smoothstep(0.02, 0.12, one(nG.y))).toVar();
    let hill: N = turfed.mul(fDrift.mul(0.24).add(0.88));
    hill = mix(hill, hill.mul(vec3(0.74, 0.88, 0.72)), lush.mul(0.6));
    hill = mix(hill, hill.mul(vec3(1.2, 1.08, 0.78)).add(vec3(0.016, 0.01, 0)), dryLie.mul(0.5));
    hill = mix(hill, vec3(0.16, 0.14, 0.06).mul(mix(0.85, 1.1, macro)), bracken.mul(0.65));
    turfed = mix(turfed, hill, swardFar).toVar();
  }
  // And moss, low and dark, where it is damp or shaded.
  const gMoss: N = (texture(moss.map, at.mul(0.9)) as N).bias(blur);
  const mossy: N = smoothstep(0.55, 0.78, (texture(turf.map, at0.div(7.3).add(0.53)) as N).a.add(wetV.mul(0.45)).add(litV.mul(0.25)).sub(dry.mul(0.4))).mul(one(leafy)).toVar();
  turfed = mix(turfed, gMoss.rgb.mul(vec3(0.62, 0.72, 0.5)), mossy.mul(0.7));
  let ground: N = mix(turfed, gLitter.rgb.mul(mix(0.6, 0.85, mid)), leafy);
  // Along the edge of bare ground, a fringe of short green that is neither one nor the other.
  ground = mix(ground, turfed.mul(1.25), bare.mul(one(bare)).mul(1.4));
  ground = mix(ground, earthy, bare);
  // The floor of a rut is pressed hard by the wheels. On a dry day it is the palest of the track: dust and grit, with small stones
  // pressed into it, the shingle read small; wet, it is the darkest, and in its low places water stands. (It was always the
  // darkest, and the ruts of a dry summer's track were two dark brown troughs, where a cart track's are two pale bands.)
  const wetDay: N = max(uWet, smoothstep(0.2, 0.6, f.y)).toVar();
  const gGrit: N = (texture(shingle.map, at.mul(3.6).add(0.53)) as N).bias(blur).toVar();
  const dust: N = mix(earthy.mul(1.45), vec3(dot(earthy, vec3(0.3, 0.55, 0.15))).mul(1.5), 0.3).add(vec3(0.022, 0.02, 0.016));
  const gritty: N = mix(dust, gGrit.rgb.mul(vec3(1.05, 1.0, 0.94)).mul((groundUniforms.uBare as N).xyz), smoothstep(0.55, 0.78, gGrit.a).mul(0.65));
  ground = mix(ground, mix(gritty, ground.mul(vec3(0.58, 0.54, 0.5)), wetDay), rutFloor.mul(bare));
  // (And the whole of a track's bare earth is a little paler and dustier on a dry day than earth elsewhere.)
  ground = mix(ground, ground.mul(1.18), onTrack.mul(bare).mul(one(wetDay)).mul(one(rutFloor)));
  const lowSpot = lowSpotOf(at0);
  // (In rain more of the low places hold water, on bare ground too, not only in the ruts.)
  const pool: N = uWet.mul(0.09);
  // (Read from the turf's heights blurred, and with a softer edge: read sharp, the water lay in blocky shapes, pixel-edged, like
  // pieces of blue paint on the earth.)
  const pudSpot: N = (texture(turf.map, at0.div(6.1).add(0.19)) as N).bias(2.5).a.add(mid.sub(0.5).mul(0.4)).toVar();
  // (Standing water in a rut after rain, or where the ground is wet; on a dry day only the mud of its low places, darker.)
  const puddle: N = smoothstep(float(0.535).sub(pool), float(0.6).sub(pool), pudSpot).mul(max(rutFloor.mul(mix(0.25, 1, max(uWet, smoothstep(0.2, 0.6, f.y)))), bare.mul(uWet).mul(0.7))).mul(one(stony)).toVar();
  const wetRim: N = smoothstep(0.44, 0.555, pudSpot).mul(rutFloor).toVar();
  ground = mix(ground, ground.mul(0.6), wetRim.mul(mix(0.2, 0.6, wetDay)));
  // (Standing water in a rut is muddy, brown more than black, where the eye looks down into it.)
  ground = mix(ground, vec3(0.055, 0.045, 0.032), puddle.mul(0.85));
  // On a mountain, where all the ground is stones, a path shows as what feet and hooves have made of them: a band a couple of strides
  // broad, trodden fine and darker, with the dust of it paler along its middle.
  const footWorn: N = onFoot.mul(one(smoothstep(0.38, 0.62, footOff.add(mid.sub(0.5).mul(0.12))))).mul((groundUniforms.uBare as N).w).toVar();
  ground = mix(ground, ground.mul(vec3(0.66, 0.64, 0.62)).add(gSoil.rgb.mul(0.1)), footWorn.mul(0.85));
  ground = mix(ground, ground.mul(1.22), footWorn.mul(one(smoothstep(0.05, 0.2, footOff))).mul(0.5));
  // Snow over all of it; trodden on the track and the paths, where it is packed and dirtied.
  // (And a town's streets and its square, trodden all over but along their edges, by the wall, where it lies clean.)
  const trodSnow: N = max(max(onTrack.mul(one(smoothstep(0.8, 2.2, off))), footBare), paved.mul(smoothstep(0.5, 1.8, paveSd)).mul(0.9)).toVar();
  // (In summer, what is left of the snow does not lie on a path that is walked every day; in winter it is only thinner there.)
  const snowy: N = snowOn(positionWorld, normalize(normalWorldGeometry).y).mul(one(trodSnow.mul(mix(1, 0.25, smoothstep(0.4, 0.9, snowUniforms.uSnow as N))))).toVar();
  // A garden's walks are gravel: the shingle read small and pale, darker towards the edges where it is not raked.
  // (Read at nearly twice the shingle's size it was cobbles; and its dark grit between the stones is lightened, as dust fills a walk.)
  const gravelAt: N = at0.mul(4.3).add(0.37), gGravel: N = (texture(shingle.map, gravelAt) as N).bias(blur);
  const gravel: N = mix(gGravel.rgb, vec3(0.5, 0.47, 0.41), 0.35).mul(vec3(1.3, 1.24, 1.1)).mul(mix(0.9, 1.06, macro)).mul(mix(0.82, 1, smoothstep(0, 0.4, paveSd))).toVar();
  // Standing water on wet paving (`paveLow`): darker, as wet stone is, and smooth.
  const paveWater: N = paveLow.mul(smoothstep(0.1, 0.45, wetV)).mul(paved).mul(one(gravelled)).toVar();
  ground = mix(ground, mix(paving.mul(mix(1, 0.7, paveWater)), gravel, gravelled), paved);
  ground = mix(ground.mul(mix(1, 0.52, wetV)), mix(vec3(...SNOW).mul(mix(0.94, 1.04, macro)), vec3(0.5, 0.49, 0.47), trodSnow.mul(0.55)), snowy);
  m.colorNode = vec4(ground, 1);
  m.roughnessNode = mix(mix(float(0.96), 0.94, bare).mul(mix(1, 0.4, wetV.mul(bare))).mul(mix(1, 0.82, rutFloor.mul(bare))).mul(mix(1, 0.7, wetRim)), 0.09, puddle);
  {
    // Earth and shingle have their own relief; shingle borrows the earth's, laid coarser. Leaves lie flat.
    const gN: N = (texture(turf.normalMap, gUv) as N).bias(blur).xyz.mul(2).sub(1);
    const gE: N = (texture(soil.normalMap, at.mul(mix(1.5, 0.31, stony))) as N).bias(blur).xyz.mul(2).sub(1);
    const flat = one(leafy.mul(0.6));
    // (Dead grass has a relief of its own, of strands; standing water has none.)
    const gT: N = (texture(thatch.normalMap, at.mul(1.15)) as N).bias(blur).xyz.mul(2).sub(1);
    const turfN: N = mix(gN.mul(vec3(flat, flat, 1)), gT, dry.mul(0.8));
    const n: N = mix(turfN, gE, bare).add(vec3(rutTilt.mul(bare), 0));
    const steep = mix(1, stony.mul(1.2).add(1.15), bare).mul(one(puddle));
    // Snow the wind has worked: low ripples across the way it blows, and broader drifts, as light and shade.
    const rip = (k: number, e: number): N => {
      const q: N = vec2(at0.x.mul(0.8).add(at0.y.mul(0.35)), at0.y.mul(2.6).sub(at0.x.mul(0.5))).mul(k);
      return vec2(farNoise(q.add(vec2(e, 0))).sub(farNoise(q.sub(vec2(e, 0)))), farNoise(q.add(vec2(0, e))).sub(farNoise(q.sub(vec2(0, e))))).div(e * 2);
    };
    // (Three sizes: the long swells of drift; ridges a stride or two apart, sharp on their lee side, as the wind cuts old snow; and
    // ripples a hand apart, near the eye. With the two larger alone, and faint, a snowfield in the sun was flat white paint.)
    const drifted: N = rip(0.9, 0.08).mul(0.16).add(rip(0.16, 0.05).mul(0.35)).add(rip(2.7, 0.03).mul(0.05).mul(one(smoothstep(6, 18, far)))).mul(one(smoothstep(20, 90, far))).toVar();
    // (The gravel's relief from the heights the shingle's own picture carries, read a step either way, and not from its normal map: one
    // more texture took this material to seventeen, past the sixteen a stage may sample under WebGPU, which then drew none of the ground.)
    const ge = 0.003, gh: N = (texture(shingle.map, gravelAt) as N).bias(blur).a;
    const gG: N = vec3(gh.sub((texture(shingle.map, gravelAt.add(vec2(ge, 0))) as N).bias(blur).a).mul(4), gh.sub((texture(shingle.map, gravelAt.add(vec2(0, ge))) as N).bias(blur).a).mul(4), 1);
    const laid0: N = mix(vec3(n.xy.mul(steep), n.z), mix(mix(paveNormal, vec3(0, 0, 1), paveWater), gG, gravelled), paved);
    // (Where water stands in the rain, the drops' rings on it.)
    const laid: N = vec3(laid0.xy.add(rainRings(positionWorld.xz, uWet.mul(max(puddle, paveWater)))), laid0.z);
    m.normalNode = normalMap(vec3(laid.xy.mul(one(snowy.mul(0.85))).add(drifted.mul(snowy)), laid.z).mul(0.5).add(0.5));
  }
  // (And here and there a grain of it catches the sun: a glint, near the eye, from a crystal turned just so.)
  const glint: N = step(0.992, fract(sin(dot(floor(positionWorld.mul(26)), vec3(12.9898, 78.233, 37.719))).mul(43758.5453))).mul(one(smoothstep(4, 14, far))).toVar();
  m.roughnessNode = mix(mix(m.roughnessNode as N, mix(mix(paveRough.mul(mix(1, 0.6, wetV)), 0.07, paveWater), 0.95, gravelled), paved), mix(0.66, 0.08, glint), snowy);
  // How nearly a mirror each point is, and which way it faces, for the air's pass to find what it mirrors in the picture (`mirrored`
  // in `post.ts`): standing water most, wet setts and flags some, wet earth a little; nothing under snow.
  (m.userData as N).mirror = mirrorAs(normalView, max(max(max(puddle, paveWater), wetV.mul(paved).mul(one(gravelled)).mul(0.75)), wetV.mul(bare).mul(0.2)).mul(one(snowy)));
  // Ground is matt, except where it is wet stones, or water stands in a rut and mirrors the sky.
  lit(m, { irradiance: irradianceOf(normalWorldGeometry, bk), sun: one(underHill(bk)).mul(mix(1, jointLit, paved)), sky: mix(0.3, smoothstep(0, 0.5, bk.x), uBake), gleam: mix(max(max(mix(0.12, 0.7, wetV.mul(bare)), max(puddle.mul(1.15), paveWater.mul(0.85))), wetV.mul(paved).mul(one(gravelled)).mul(0.65)), 0.55, snowy) });
  return fadesAtNearEdge(m, 'near');
}

/**
 * The ground under a full winter, drawn as only what shows of it: for open country under snow, where the ground's own material
 * (`makeGroundMaterial`) would work out turf, earth, shingle, leaves, paving and puddles at every point, twenty textures and more, to
 * cover nearly all of it with snow (asked, of the downhill run: "can we have some kind of optimized versions of the game side
 * landscape materials"). Here, by the same rule for where snow lies (`snowOn`, at `uSnow`) and the same snow: its colour, the drifts
 * the wind has worked into it at three sizes as light and shade, and a grain catching the sun near the eye; under it, where the
 * ground is too steep for snow to hold, the mountain's rock in beds, its grain from the scree's picture. Four reads of two textures.
 *
 * And snow that has been groomed, where the sheet says so: its first field how far groomed (0 to 1), its second and third the way the
 * machines went (level, a unit long). Groomed snow is smooth, the drifts gone, in lanes the breadth of a machine each a shade apart,
 * pressed into the fine ridges of corduroy along its way, which fade out where they are finer than a point of the picture.
 */
export function makeSnowMaterial(turf: TextureSet, scree: TextureSet): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0, color: new Color(1, 1, 1) });
  const f = fieldOf(), bk = bakeOf();
  const P: N = positionWorld, at0: N = P.xz, far: N = length(positionView), blur: N = smoothstep(70, 260, far).mul(5);
  const up: N = normalize(normalWorldGeometry).y;
  // The same slow changes of tone the ground has, from its turf read very large: no repeat is seen in them.
  const macro: N = (texture(turf.map, at0.div(41).add(0.37)) as N).a, mid: N = (texture(turf.map, at0.div(9.7).add(0.11)) as N).a;
  // Where snow lies: the game's own rule (`snowOn`), but its ragged fringe read turned off the noise's lattice and at two sizes. (Read
  // square to it, as `snowOn` reads it, the edge of the snow on a broad face stepped along the lattice's squares and their diagonals,
  // which seen across a slope from a little way off were blocks.)
  const turned: N = vec2(P.x.mul(0.8).sub(P.z.mul(0.6)), P.x.mul(0.6).add(P.z.mul(0.8)));
  const fringe: N = farNoise(turned.mul(0.85)).mul(0.6).add(farNoise(turned.yx.mul(2.3).add(5.3)).mul(0.4));
  // (Its drifts some tens of metres across from the turf read large, which this material reads already, in place of the four sizes of
  // noise `snowOn` sums for them.)
  const drift: N = macro.mul(0.65).add(mid.mul(0.35));
  const snowy: N = smoothstep(0, 0.12, mix(-1.15, 0.75, snowUniforms.uSnow as N).add(up.sub(0.8).mul(2.4)).add(drift.sub(0.5).mul(1.5)).add(fringe.sub(0.5).mul(0.35))).mul(step(0.001, snowUniforms.uSnow as N)).toVar();
  // Where it does not lie, the mountain's rock, as the far land draws it (`makeFarMaterial`): in beds some metres thick, each its own
  // shade; its grain from the scree's picture read at two sizes, so that no repeat of it shows; tinted by the colour the sheet carries.
  // (The scree's picture alone, at a stride, showed the same pebbles over and over across a face.)
  const bedAt: N = P.y.add(macro.mul(34)).add(at0.x.mul(0.06)).div(7).toVar();
  const bed: N = mix(farHash(vec2(floor(bedAt), 3)), 0.5, smoothstep(0.25, 0.8, fwidth(bedAt)));
  const grit: N = mix((texture(scree.map, at0.mul(0.62)) as N).bias(blur).rgb, (texture(scree.map, at0.mul(0.13).add(0.31)) as N).bias(blur).rgb, 0.5);
  const stones: N = vertexColor().rgb.mul(vec3(0.62, 0.6, 0.58)).mul(bed.mul(0.5).add(0.62)).mul(dot(grit, vec3(0.3, 0.5, 0.2)).mul(0.9).add(0.45)).mul(mid.mul(0.3).add(0.85)).toVar();
  // Groomed: lanes some five metres broad across the way the machines went, each its own shade; and in each the corduroy, a ridge
  // every six centimetres.
  const groomed: N = clamp(f.x, 0, 1).toVar();
  const way: N = vec2(f.y, f.z), across: N = vec2(way.y.negate(), way.x);
  const lanePos: N = dot(at0, across).div(4.8), lane: N = farHash(vec2(floor(lanePos), 7)).toVar();
  const ridgePos: N = dot(at0, across).div(0.06);
  // (Let go of well before a ridge is as small as a point of the picture: nearer that, they beat against the points in broad stripes.)
  const ridgeSeen: N = one(smoothstep(0.08, 0.22, fwidth(ridgePos))).toVar();
  const ridges: N = sin(fract(ridgePos).mul(Math.PI * 2)).mul(ridgeSeen).toVar();
  const snowColour: N = vec3(...SNOW).mul(mix(0.94, 1.04, macro)).mul(mix(1, lane.mul(0.05).add(0.975).add(ridges.mul(0.015)), groomed));
  m.colorNode = vec4(mix(stones, snowColour, snowy), 1);
  {
    // Snow the wind has worked, as the ground's material draws it: low ripples across the way it blows, broader drifts, and near the
    // eye ripples a hand apart; none on what is groomed, where instead the corduroy's ridges tilt the light across the lane.
    // (Each size's slope worked out exactly, not from the noise a step either way: three samples of noise for the twelve it took.)
    const rip = (k: number): N => farNoiseSlope(vec2(at0.x.mul(0.8).add(at0.y.mul(0.35)), at0.y.mul(2.6).sub(at0.x.mul(0.5))).mul(k));
    // (Worked out only where they can be seen, within ninety metres: twelve samples of noise, the most of what this material does,
    // and nothing of them shows further off.)
    const drifted: N = Fn(() => {
      const d: N = vec2(0, 0).toVar();
      If(far.lessThan(90), () => {
        d.assign(rip(0.9).mul(0.16).add(rip(0.16).mul(0.35)).add(rip(2.7).mul(0.05).mul(one(smoothstep(6, 18, far)))).mul(one(smoothstep(20, 90, far))));
      });
      return d;
    })().toVar();
    const corduroy: N = across.mul(cos(fract(ridgePos).mul(Math.PI * 2)).mul(0.12).mul(ridgeSeen));
    const tilt: N = mix(drifted, corduroy, groomed).mul(snowy).add(vec2(mid.sub(0.5).mul(0.15)).mul(one(snowy)));
    m.normalNode = normalMap(vec3(tilt, 1).mul(0.5).add(0.5));
  }
  m.roughnessNode = mix(float(0.95), mix(0.66, 0.58, groomed), snowy);
  // (And the sun flashing off grains of ice in it, more on loose snow than packed: `snowGlints`.)
  lit(m, { irradiance: irradianceOf(normalWorldGeometry, bk), sun: one(underHill(bk)), sky: mix(0.3, smoothstep(0, 0.5, bk.x), uBake), gleam: mix(0.12, 0.55, snowy), glint: snowGlints(mix(0.45, 0.28, groomed).mul(snowy)) });
  return m;
}

/**
 * How much snow lies at a point as `makeSnowMaterial` draws it (1, snow; 0, its stones; between, its ragged edge), worked out off the
 * graphics card by the same rule, for what goes over the snow to know what it is going over: `up`, how nearly the ground faces straight
 * up there, as the shape's own normals have it; `turf`, the ground's pictures the material was made with. (Its drifts read from the
 * turf's height as the material reads them, and its fringe from the same noise, a 32-bit float at each step as the graphics card
 * works it, so that the edge of the snow falls where it is seen. Keep the two together: a change to one is a change to both.)
 */
export function snowLiesAt(up: number, x: number, z: number, turf: TextureSet): number {
  const snow = snowUniforms.uSnow.value;
  if (snow < 0.001) return 0;
  const macro = alphaAt(turf, x / 41 + 0.37, z / 41 + 0.37), mid = alphaAt(turf, x / 9.7 + 0.11, z / 9.7 + 0.11);
  const tx = x * 0.8 - z * 0.6, tz = x * 0.6 + z * 0.8;
  const fringe = farNoiseAt(tx * 0.85, tz * 0.85) * 0.6 + farNoiseAt(tz * 2.3 + 5.3, tx * 2.3 + 5.3) * 0.4;
  const drift = macro * 0.65 + mid * 0.35;
  const t = Math.min(1, Math.max(0, (-1.15 + 1.9 * snow + (up - 0.8) * 2.4 + (drift - 0.5) * 1.5 + (fringe - 0.5) * 0.35) / 0.12));
  return t * t * (3 - 2 * t);
}
/** A texture set's height (its picture's alpha, 0 to 1) at (`u`, `v`), as the graphics card reads it: repeating, between its points. */
function alphaAt(set: TextureSet, u: number, v: number): number {
  const n = set.size, px = set.pixels[0], fx = (u - Math.floor(u)) * n - 0.5, fy = (v - Math.floor(v)) * n - 0.5;
  const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
  const at = (ii: number, jj: number) => px[((((jj % n) + n) % n) * n + (((ii % n) + n) % n)) * 4 + 3];
  return ((at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b) / 255;
}
/** `farHash` and `farNoise` (below), off the graphics card. */
const fract32 = (v: number) => { const w = Math.fround(v); return Math.fround(w - Math.floor(w)); };
function farHashAt(x: number, y: number): number {
  const qx = fract32(x * 0.1031), qy = fract32(y * 0.1031), qz = qx;
  const d = Math.fround(qx * Math.fround(qy + 33.33) + qy * Math.fround(qz + 33.33) + qz * Math.fround(qx + 33.33));
  return fract32(Math.fround(Math.fround(qx + d) + Math.fround(qy + d)) * Math.fround(qz + d));
}
function farNoiseAt(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = farHashAt(ix, iy), b = farHashAt(ix + 1, iy), c = farHashAt(ix, iy + 1), d = farHashAt(ix + 1, iy + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/**
 * A material for small loose things: iron fittings, torch brands, keys. They are not part of the
 * light bake, and left to themselves they would be lit by the open sky wherever they are, indoors
 * included. Here they get a faint fixed ambient instead, and otherwise only the real lights.
 */
/**
 * For what moves about out of doors, sheep and the like, which the bake knows nothing of: their colour per vertex (and per animal,
 * if the mesh gives each its own), lit by the sun as everything is, and by the sky's light as the stand-in for the bake has it,
 * more from above than below. Matt: wool and hide do not shine.
 */
export function makeCreatureMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0, vertexColors: true, color: new Color(1, 1, 1) });
  // (The normal as each animal is turned, not as its mesh was made.)
  const n: N = normalize((TSL as N).normalWorld);
  // (Wool scatters light through itself: what faces away from the sky is not much darker than what faces it.)
  lit(m, { irradiance: uFallback.mul(float(0.8).add(n.y.mul(0.2))).mul(1.9) });
  return m;
}

/**
 * Coloured glass in a window, seen from within: lit by the day that comes through it, so its colours glow whatever falls on its
 * inner face; dull from without, as glass with the light behind the eye is. `uGlow` is how bright the day is through it.
 */
export const glassUniforms: { uGlow: { value: number } } = { uGlow: uniform(1) as N };
export function makeStainedMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0, vertexColors: true, color: new Color(1, 1, 1) });
  m.colorNode = vertexColor().mul(0.12);
  m.emissiveNode = vertexColor().mul(glassUniforms.uGlow as N);
  return m;
}

/**
 * A window with a lamp or a fire lit in the room behind it, seen from outside once the light is going: the glass glows with the
 * room's light, each room its own colour and brightness (given per vertex), and firelight wavers a little. By day the windows
 * that would be lit are drawn as any other glass, so this is only made for the evening and the night. `uLit` is how much the
 * lamps tell against the hour.
 */
export const windowUniforms: { uLit: { value: number } } = { uLit: uniform(1) as N };
export function makeWindowMaterial(): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0, vertexColors: true, color: new Color(1, 1, 1) });
  const c: N = vertexColor();
  m.colorNode = c.mul(0.05);
  // (Each room wavers at its own pace, from its own colour: two slow beats, so that it never quite repeats.)
  const waver: N = sin(time.mul(5.3).add(c.x.mul(91))).mul(sin(time.mul(2.3).add(c.y.mul(57)))).mul(0.07).add(1);
  m.emissiveNode = c.mul(windowUniforms.uLit as N).mul(waver);
  return m;
}

/**
 * Clear glass, in the windows of a building that can be entered: seen through both ways, a little
 * darkened and a little mirroring, and throwing no shadow, so that the sun comes in at the windows
 * and the rooms are seen from the street. With `lit` (made only for the evening and the night), a
 * room's lamp or fire shows in it as a glow of the room's colour (given per point, as for the
 * windows that are not seen through), but the room behind it still shows. Every pane is a closed
 * solid, so it is looked through twice; the opacity is reckoned for that.
 */
export function makePaneMaterial(lit = false): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0, color: new Color(0.55, 0.62, 0.64), vertexColors: lit, transparent: true, opacity: lit ? 0.32 : 0.16, depthWrite: false });
  if (lit) {
    const c: N = vertexColor();
    m.colorNode = c.mul(0.05).add(0.25);
    m.emissiveNode = c.mul(windowUniforms.uLit as N).mul(0.6);
  }
  return m;
}

export function makePropMaterial(o: { color: Color; roughness: number; metalness: number; emissive?: Color; emissiveIntensity?: number }): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({
    color: o.color, roughness: o.roughness, metalness: o.metalness,
    emissive: o.emissive ?? new Color(0, 0, 0), emissiveIntensity: o.emissiveIntensity ?? 1,
  });
  lit(m, { irradiance: vec3(0.05, 0.045, 0.04), sky: float(0) });
  return m;
}

/**
 * Shared by all rock. `uShaftTop`, `uShaftUp` and `uShaftSun` are a shaft of sunlight let down into a
 * hall under the hill: a point on its middle line and how broad it is, the way up it, and the
 * sun's light. Rock that was told it stands in that light draws its edge itself, point by point
 * of the picture, so the round of light on the floor is round. `uRockFacet` is how far this stone
 * breaks in flat faces, 0 to 1: it is how much each face is lit as the flat plane it is. `uRockWorn`
 * is how far water has worked it, 0 to 1: the planes between its beds eaten back, runnels down its faces.
 */
export const rockUniforms: { uRockBroad: { value: number }; uRockFacet: { value: number }; uRockWorn: { value: number }; uShaftTop: { value: Vector4 }; uShaftUp: { value: Vector3 }; uShaftSun: { value: Vector3 } } = {
  uRockBroad: uniform(0.8) as N, uRockFacet: uniform(0) as N, uRockWorn: uniform(0) as N, uShaftTop: uniform(new Vector4()) as N, uShaftUp: uniform(new Vector3(0, 1, 0)) as N, uShaftSun: uniform(new Vector3()) as N,
};

/**
 * The material for natural rock. Carved rock has no texture coordinates worth the name, so the
 * texture is laid on from three sides by where each point is, and blended by which way it faces:
 * nothing stretches, on any slope or under any overhang. Over that:
 *  - the same texture read very large gives slow changes of tone, so no repeat can be seen;
 *  - on steep faces, thin beds of lighter and darker stone, and dark streaks where water runs down;
 *  - moss and damp from the per-vertex fields, as on masonry.
 * Light comes from the bake where there is one, and from the open sky where there is not.
 */
export function makeRockMaterial(base: TextureSet, moss: TextureSet, o: { scale?: number; normalScale?: number; dip?: [number, number]; relief?: boolean } = {}): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, color: new Color(1, 1, 1) });
  const f = fieldOf(), bk = bakeOf();
  const P: N = positionWorld, rockN: N = normalize(normalWorldGeometry);
  const scale = o.scale ?? 0.3, bump = o.normalScale ?? 1.4, dip = o.dip ?? [0.05, 0.03];
  const uFacet = rockUniforms.uRockFacet as N, uWorn = rockUniforms.uRockWorn as N;
  const uBroad = rockUniforms.uRockBroad as N, uShaftTop = rockUniforms.uShaftTop as N, uShaftUp = rockUniforms.uShaftUp as N, uShaftSun = rockUniforms.uShaftSun as N;
  const w0: N = pow(abs(rockN), vec3(5));
  const w: N = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
  const ux = P.zy.mul(scale), uy = P.xz.mul(scale), uz = P.xy.mul(scale);
  // From far off the grain of the stone cannot be seen, and what would be seen instead is the
  // same square of it laid side by side to the horizon. So with distance it is read ever more
  // blurred, until a hillside a quarter of a mile away has the stone's colour and none of its pattern.
  const blur: N = smoothstep(110, 320, length(positionView)).mul(6);
  const read = (map: N, at: N, b: N = blur): N => (texture(map, at) as N).bias(b);
  const tex: N = read(base.map, ux).mul(w.x).add(read(base.map, uy).mul(w.y)).add(read(base.map, uz).mul(w.z)).toVar();
  // The same stone seen from far off: patches some metres across.
  const farTex: N = read(base.map, vec2(P.x.add(P.z.mul(0.71)), P.y.mul(0.9).add(P.z.mul(0.37))).mul(scale * 0.11), blur.mul(0.6)).toVar();
  // Stone that breaks in flat faces is lit face by face. The plane of each face is read from how the
  // surface slopes across the picture, turned to face outward, and mixed into the normal; where
  // it parts company with the smooth normal there is an edge, and an edge catches the light. Both
  // fade out with distance, where a pixel covers many faces and the plane it reads is only noise.
  const flat0: N = normalize(dFdx(P).cross(dFdy(P)));
  const flat: N = select(dot(flat0, rockN).lessThan(0), flat0.negate(), flat0);
  const near: N = one(smoothstep(45, 120, length(positionView)));
  const facetW: N = uFacet.mul(near);
  const edge: N = one(dot(flat, rockN)).mul(facetW);
  const steep = one(smoothstep(0.4, 0.75, abs(rockN.y)));
  let rock: N = tex.rgb.mul(mix(vec3(0.8, 0.79, 0.8), vec3(1.2, 1.17, 1.1), smoothstep(0.25, 0.75, farTex.a)));
  // Thin beds within the thick ones: bands a hand or two deep, gathered into broader ones, each
  // its own shade, with a dark line where one lies on the next. They fade out with distance,
  // before they could shimmer.
  // No two are alike. Their thickness is unequal (the count of them runs ahead of the height in
  // some stretches and falls behind in others, as in `Strata`); the plane between two is an open
  // dark line here, a hair there, and often nothing at all; and a line that is open does not run
  // on for ever, but closes and opens again along the face. Ruled lines are what gives a drawn cliff away.
  // (They roll, slowly: by the same stone read from far off, and read blurred, or its grain would make every line between beds a scribble.)
  const roll: N = (texture(base.map, vec2(P.x.add(P.z.mul(0.71)), P.y.mul(0.9).add(P.z.mul(0.37))).mul(scale * 0.11)) as N).bias(max(blur, 4.5)).toVar();
  // How high a point lies among the beds, in metres: they dip a little, and roll.
  const level: N = P.y.add(dot(P.xz, vec2(dip[0], dip[1]))).add(roll.r.sub(0.5).mul(1.5)).toVar();
  // (Water-worn stone is not bedded alike all over: stretches of it are massive, one pale face with hardly a line across it.)
  const bedded: N = f.w.mul(steep).mul(mix(1, smoothstep(0.3, 0.6, farTex.a), uWorn.mul(0.75))).toVar();
  const along: N = P.x.add(P.z.mul(0.6));
  /**
   * Beds of one thickness, in metres. Stone is bedded at every size: plates a hand thick lie in
   * beds of a stride, and those in great beds as tall as a house. Which of them the eye can see
   * depends on how far off it stands, so all three are drawn, each for as long as it is large
   * enough in the picture not to shimmer: close to, the plates; across a valley, the strides;
   * on a mountain a mile off, the great beds alone. One size of bed drawn at every distance is
   * right at one distance only: nearer it is too coarse, and farther it is a few stray lines.
   */
  const bedsOf = (thick: number, k: number) => {
    const u0: N = level.div(thick).add(k * 3.7).toVar();
    const u: N = u0.add(sin(u0.mul(1.9).add(roll.g.mul(5))).mul(0.3)).add(sin(u0.mul(0.83).add(1.3)).mul(0.26)).toVar();
    const large: N = one(smoothstep(0.2, 0.55, fwidth(u))).toVar();
    const within: N = fract(u).toVar();
    const tone = mix(0.72, 1.14, fract(sin(floor(u).mul(91.7)).mul(43758.5)));
    // The plane nearest this point, and three numbers of its own: how open it is, how wide, and where along the face it is shut.
    const plane: N = floor(u.add(0.5)).toVar();
    const planeOpen: N = fract(sin(plane.mul(57.3)).mul(24634.6)).toVar();
    const open: N = smoothstep(0.4, 0.8, planeOpen).mul(smoothstep(0.42, 0.6, farNoise(vec2(along.mul(0.09 / thick), plane.mul(7.13))))).toVar();
    const wide: N = fract(planeOpen.mul(7.31)).toVar();
    // (A great bed's plane is wider than a plate's, but not as many times wider as the bed is thicker.)
    const from: N = min(within, one(within)).div(mix(0.1, 0.3, wide).mul(Math.sqrt(0.3 / thick))).toVar();
    const line: N = mix(1, smoothstep(0, 1, from), open).toVar();
    // Where water has worked the stone the open planes are eaten back into grooves: darker, and with a lip above and below that the light catches.
    const dark = mix(0.62, mix(0.86, 0.5, wide), uWorn);
    // How steeply the surface runs into the groove, signed: up above the plane, down below it.
    const lip = from.mul(one(from)).mul(4).mul(step(from, 1)).mul(select(within.lessThan(0.5), 1, -1)).mul(open);
    return { large, tone, line, dark, lip };
  };
  const plates = bedsOf(0.3, 0), strides = bedsOf(1.4, 1), greats = bedsOf(6.5, 2);
  // Each size has its shades wherever it can be seen; its dark lines only once the size below it has grown too small to show its own,
  // or a face seen close would be ruled across with lines that nothing in its shape answers to.
  const seenP: N = bedded.mul(plates.large).toVar(), seenS: N = bedded.mul(strides.large).toVar(), seenG: N = bedded.mul(greats.large).toVar();
  const lineS: N = mix(1, strides.line, one(plates.large.mul(0.8))).toVar(), lineG: N = mix(1, greats.line, one(strides.large.mul(0.8))).toVar();
  rock = rock.mul(mix(1, plates.tone.mul(mix(plates.dark, 1, plates.line)), seenP))
    .mul(mix(1, mix(1, strides.tone, 0.6).mul(mix(strides.dark, 1, lineS)), seenS))
    .mul(mix(1, mix(1, greats.tone, 0.45).mul(mix(greats.dark, 1, lineG)), seenG));
  // (Every size of bed has its lip, each taking over from the one below as the lines do; and on stone that water has not worked, a fainter one.)
  const lip: N = plates.lip.mul(seenP).add(strides.lip.mul(seenS).mul(one(plates.large.mul(0.8)))).add(greats.lip.mul(seenG).mul(one(strides.large.mul(0.8))).mul(1.3)).mul(mix(0.35, 1, uWorn)).toVar();
  // The pits and cracks of the texture hold less of the sky's light; so do the planes between beds.
  const ao: N = mix(0.45, 1, smoothstep(0.08, 0.5, tex.a)).mul(mix(1, mix(mix(0.65, 0.5, uWorn), 1, plates.line), seenP)).mul(mix(1, mix(0.6, 1, lineS), seenS)).mul(mix(1, mix(0.6, 1, lineG), seenG)).toVar();
  // Where water runs down a face it leaves dark streaks, long and narrow.
  // (The streaks a walker sees are a stride or two apart, and the texture they are read from comes round again every three metres. On a
  // cliff that is no matter. On a mountain's face a furlong off it is a fence of upright bars, evenly spaced, and crossed with the beds
  // it is a chequerboard. So with distance the streaks are read eight times as broad: the great stains of a face, which do not repeat in sight.)
  const streakClose = (texture(base.map, vec2(P.z.mul(0.37), P.y.mul(0.03))) as N).a.mul(w.x).add((texture(base.map, vec2(P.x.mul(0.37), P.y.mul(0.03).add(0.5))) as N).a.mul(w.z));
  const streakFar = (texture(base.map, vec2(P.z.mul(0.043), P.y.mul(0.007).add(0.31))) as N).a.mul(w.x).add((texture(base.map, vec2(P.x.mul(0.043), P.y.mul(0.007).add(0.77))) as N).a.mul(w.z));
  const streak: N = mix(streakFar, streakClose, one(smoothstep(30, 100, length(positionView)))).toVar();
  const stain: N = smoothstep(0.5, 0.72, streak).mul(steep).mul(f.w.mul(0.65).add(0.35)).toVar();
  // (On pale water-worn stone the streaks are a grey film, not a dark one, and in places they run rust-coloured from iron in the rock.)
  const rust: N = smoothstep(0.62, 0.8, farTex.r.add(farTex.a).mul(0.5).add(streak.sub(0.5).mul(0.5))).mul(steep).mul(uWorn).toVar();
  rock = rock.mul(mix(vec3(1), mix(vec3(0.56, 0.53, 0.5), vec3(0.7, 0.7, 0.72), uWorn), stain.mul(mix(0.75, 0.6, uWorn))));
  rock = rock.mul(mix(vec3(1), vec3(1.1, 0.83, 0.6), rust.mul(0.45)));
  // Water-worn stone is also washed pale between the streaks, where the rain runs clean, and is
  // cut into runnels: narrow flutes straight down the face, a hand or two apart. They are drawn
  // as light and shade only, from the same texture read tall and narrow, and fade with distance.
  rock = rock.mul(mix(1, 1.2, smoothstep(0.5, 0.28, streak).mul(steep).mul(uWorn)));
  const fluteNear: N = one(smoothstep(25, 80, length(positionView))).mul(steep).mul(uWorn).toVar();
  const flute = (s: N, shift: number): N => (texture(base.map, vec2(s.mul(0.55), P.y.mul(0.045).add(shift))) as N).a;
  const fluteX: N = flute(P.z.add(0.05), 0).sub(flute(P.z.sub(0.05), 0)).mul(w.x).toVar(), fluteZ: N = flute(P.x.add(0.05), 0.5).sub(flute(P.x.sub(0.05), 0.5)).mul(w.z).toVar();
  const runnel = flute(P.z, 0).mul(w.x).add(flute(P.x, 0.5).mul(w.z));
  rock = rock.mul(mix(1, mix(0.86, 1.06, smoothstep(0.3, 0.7, runnel)), fluteNear.mul(w.x.add(w.z))));
  const wet: N = max(max(f.y, stain.mul(0.25)), rainWet(bk).mul(0.9)).toVar();
  // Moss: from above on what is level, from the side on what is not.
  const mossUv = select(w.x.greaterThan(w.z), ux, uz).mul(5.5);
  const mossTex: N = mix(texture(moss.map, mossUv), texture(moss.map, uy.mul(5.5)), w.y);
  const lightOk = mix(0.4, smoothstep(0.03, 0.3, bk.x).mul(one(smoothstep(0.2, 0.8, bk.y).mul(0.92))), uBake);
  const mossy: N = smoothstep(0, 0.22, f.x.mul(lightOk).mul(1.5).add(one(tex.a).mul(0.4)).add(mossTex.a.mul(0.45)).sub(1)).toVar();
  rock = rock.mul(edge.mul(0.7).add(1));
  // Snow, on ledges and whatever faces up; it lies first in the cracks and the pits of the stone.
  // (Not on rock that was told it is under a roof of rock: a tunnel's floor.)
  const snowy: N = max(snowOn(P, rockN.y.add(one(tex.a).mul(0.12))).mul(one(max(f.z, 0))), smoothstep(-0.3, -0.8, f.z).mul(step(0.5, snowUniforms.uSnow as N))).toVar();
  m.colorNode = vec4(mix(mix(vertexColor().rgb.mul(rock).mul(mix(1, 0.5, wet)), mossTex.rgb, mossy), vec3(...SNOW).mul(mix(0.9, 1.02, tex.a)), snowy), 1);
  const rough: N = smoothstep(0.55, 0.9, tex.a).mul(-0.14).add(0.93).clamp(0.5, 1).mul(mix(1, 0.45, wet.mul(one(mossy))));
  m.roughnessNode = mix(mix(rough, 0.97, mossy), 0.66, snowy);
  // The normal map from three sides, each bent onto the surface and blended as the colour was.
  // It is read twice: as it is, for the grain and the small breaks, and four times larger, for
  // faces a stride or two across, which the carved surface is too coarse to hold an edge on.
  const lift = one(mossy.mul(0.6)).mul(bump);
  const closeTo: N = one(smoothstep(3, 13, length(positionView))).mul(0.8).toVar();
  const farOff: N = smoothstep(30, 130, length(positionView)).mul(1.5).toVar();
  const grain = (at: N, broad: N): N => {
    const t: N = read(base.normalMap, at).xyz.mul(2).sub(1);
    const wide: N = (texture(base.normalMap, at.mul(0.23).add(0.37)) as N).xy.mul(2).sub(1).mul(broad);
    // And once more, much smaller, for whoever stands within reach of it: the pits and the grain of a hand's breadth of stone.
    const fine: N = (texture(base.normalMap, at.mul(3.7).add(0.19)) as N).xy.mul(2).sub(1).mul(closeTo);
    // And from far off, very large: a face a furlong away is carved too coarsely to hold a buttress ten metres across or a ledge under
    // it, and without them it is a smooth ramp with stripes on. The same broken surface read sixty metres to the repeat gives them, as
    // light and shade; it comes in with distance, as the smaller relief goes out of sight.
    const vast: N = (texture(base.normalMap, at.mul(0.052).add(0.71)) as N).xy.mul(2).sub(1).mul(farOff);
    return vec3(t.xy.add(wide).add(fine).add(vast), t.z);
  };
  const tx = grain(ux, uBroad), ty = grain(uy, uBroad.mul(0.5)), tz = grain(uz, uBroad);
  const bx: N = vec3(tx.xy.mul(lift).add(rockN.zy), abs(tx.z).mul(rockN.x));
  const by: N = vec3(ty.xy.mul(lift).add(rockN.xz), abs(ty.z).mul(rockN.y));
  const bz: N = vec3(tz.xy.mul(lift).add(rockN.xy), abs(tz.z).mul(rockN.z));
  const bentSmooth: N = normalize(bx.zyx.mul(w.x).add(by.xzy.mul(w.y)).add(bz.xyz.mul(w.z)));
  // The grooves between beds and the runnels down the face bend the light as their slopes would.
  const up: N = vec3(0, 1, 0).sub(rockN.mul(rockN.y));
  const worn: N = up.mul(lip.mul(1.1)).add(vec3(fluteZ, 0, fluteX).mul(fluteNear).mul(1.6));
  let bent: N = normalize(mix(normalize(mix(bentSmooth, flat, facetW.mul(0.2)).sub(worn)), rockN, snowy.mul(0.75))).toVar();
  // Rock laid as a plain sheet, not carved: its buttresses, gullies and ledges drawn on it, as on far land (`rockRelief`), or a steep
  // bank of it was one smooth face, plaster with beds painted on.
  let sheetCavity: N = float(1);
  if (o.relief) {
    const grainR: N = max(length(dFdx(P.xz)), length(dFdy(P.xz))).toVar();
    // (Stronger than on far land: seen from nearer, and with no sheet-scale relief of its own to add to it.)
    const r = rockRelief(P, rockN, bent, grainR, steep.mul(one(snowy.mul(0.6))), 8, 0.42);
    bent = r.normal;
    sheetCavity = r.cavity;
    m.colorNode = vec4((m.colorNode as N).xyz.mul(mix(1, sheetCavity, one(snowy))), 1);
  }
  // (Blocks of it laid by hand, steps, kerbs and cairns, have their edges rounded as dressed stone's are (`edgeOf`); what is carved has none to round.)
  const rockEdge = edgeOf(0.03);
  m.normalNode = rockEdge.bend(transformNormalToView(bent));
  m.colorNode = vec4((m.colorNode as N).xyz.mul(rockEdge.wear.mul(0.1).add(1)), 1);
  // The sun down a shaft, on rock under the hill that was found to stand clear in it (which it
  // carries in the second of its two numbers, above the six tenths all such rock has).
  const inShaft = smoothstep(0.62, 0.95, bk.y).mul(step(bk.x, 0.004)).mul(step(0.001, uShaftTop.w));
  const fromAxis: N = P.sub(uShaftTop.xyz);
  const aside = length(fromAxis.sub(uShaftUp.mul(dot(fromAxis, uShaftUp))));
  const shaft = uShaftSun.mul(max(dot(bent, uShaftUp), 0)).mul(inShaft).mul(one(smoothstep(uShaftTop.w.sub(0.3), uShaftTop.w.add(0.05), aside)));
  // Rough rock gleams little, and less where it is dry.
  // (The sky's light is reckoned for the surface as its grain turns it, not for the smooth surface under the grain: most of a cliff is in
  // shade most of the day, and in shade the sky is all the light there is. Reckoned for the smooth surface, rock in shade is flat paint.)
  lit(m, { irradiance: irradianceOf(normalize(mix(rockN, bent, 0.85)), bk).add(shaft).mul(ao).mul(mix(1, sheetCavity, 0.8)), sun: one(underHill(bk)), sky: mix(0.3, smoothstep(0, 0.5, bk.x), uBake).mul(ao), gleam: mix(mix(0.3, 1, wet), 0.55, snowy) });
  // (Rock laid as a sheet is ground too, and is passed over into the far land with it; carved rock is not.)
  return o.relief ? fadesAtNearEdge(m, 'near') : m;
}

/** What far land is covered with in this season: its woods and its open ground. */
export const farUniforms: { uFarWood: { value: Vector3 }; uFarGrass: { value: Vector3 }; uFarSnow: { value: number }; uFarDeep: { value: number }; uFarRing: { value: Vector3 } } = {
  uFarWood: uniform(new Vector3(0.07, 0.15, 0.06)) as N, uFarGrass: uniform(new Vector3(0.16, 0.2, 0.08)) as N,
  // (How far snow lies down from the heights, 0 to 1: in a valley's or a town's winter, everywhere.)
  uFarSnow: uniform(0) as N,
  // (How deep a winter it is, 0 to 1. At 1, as on the ski runs' mountains in Grand Horse Mountain (asked: "see the ground outside
  // playarea is not snowy enough"), the snow lies over all the open ground that holds it, not in patches with the grass between,
  // and on the woods' crowns, which stand grey out of it rather than dark green: at 0, the low country about the runs, which is
  // woods and pasture, was green with snow here and there.)
  uFarDeep: uniform(0) as N,
  // (Where the far land begins about a valley: its middle, x and z, and how far out from it. The woods it paints come in over the
  // next 180 metres, as its trees do; none of it where the radius is 0.)
  uFarRing: uniform(new Vector3(0, 0, 0)) as N,
};

const farHash: N = Fn(([p]: [N]) => {
  const q: N = fract(vec3(p.xyx).mul(0.1031)).toVar();
  q.addAssign(dot(q, q.yzx.add(33.33)));
  return fract(q.x.add(q.y).mul(q.z));
});
const farNoise: N = Fn(([p]: [N]) => {
  const i: N = floor(p).toVar(), f0: N = fract(p);
  const f: N = f0.mul(f0).mul(f0.mul(-2).add(3)).toVar();
  return mix(mix(farHash(i), farHash(i.add(vec2(1, 0))), f.x), mix(farHash(i.add(vec2(0, 1))), farHash(i.add(vec2(1, 1))), f.x), f.y);
});
/**
 * How `farNoise` rises along each axis at a point, worked out exactly from the same four corners: what its value a step either way
 * on each axis gives, for a quarter of the samples (four reads of the noise for one).
 */
const farNoiseSlope: N = Fn(([p]: [N]) => {
  const i: N = floor(p).toVar(), f0: N = fract(p).toVar();
  const f: N = f0.mul(f0).mul(f0.mul(-2).add(3)).toVar(), df: N = f0.mul(one(f0)).mul(6);
  const a: N = farHash(i).toVar(), b: N = farHash(i.add(vec2(1, 0))).toVar(), c: N = farHash(i.add(vec2(0, 1))).toVar(), d: N = farHash(i.add(vec2(1, 1)));
  const k: N = a.sub(b).sub(c).add(d).toVar();
  return vec2(df.x.mul(b.sub(a).add(k.mul(f.y))), df.y.mul(c.sub(a).add(k.mul(f.x))));
});
/**
 * A picture of rubble laid over a wall so that it does not repeat (`unrepeat` in `makeSiteMaterial`). The wall is cut into patches by
 * a number that wanders over it, rising a little along it and up it, each whole step of the number a patch; each patch reads the
 * picture from a place of its own, moved along by any amount and up by whole courses. Between two patches both are read, and at
 * each point whichever stands higher there is shown, the one patch's stones over the other's mortar, so that where they meet the join
 * runs round stones and not through them in a line. (Read from one place, a picture of two metres repeated sixty times over a length of
 * curtain, and the eye found the same dark stone and the same lichen at every step.)
 */
function laidUnrepeated(base: TextureSet, span: number, courses: number): { map: N; normal: N; orm: N } {
  // (The texture coordinates of what is built run a unit to two metres, along a wall and up it; see `face` in `castle.ts`.)
  const t: N = uv().toVar(), u0: N = t.div(span).toVar();
  // (Read with the steepness of the coordinates themselves: where the patch changes, the place read jumps, and the picture's finest
  // level would be read there for a point of the picture's width, a line of speckle round every patch.)
  const gx: N = dFdx(u0), gy: N = dFdy(u0);
  const n: N = farNoise(t.div(1.6).add(vec2(3.7, 1.1))).mul(2.4).add(farNoise(t.div(0.55).add(vec2(8.2, 5.9))).mul(0.55)).add(t.x.mul(0.1)).add(t.y.mul(0.06)).toVar();
  const k: N = floor(n).toVar(), fk: N = fract(n).toVar();
  const shift = (i: N): N => vec2(farHash(vec2(i, 1.3)), floor(farHash(vec2(i.add(0.5), 7.9)).mul(courses)).div(courses));
  const uA: N = u0.add(shift(k)).toVar(), uB: N = u0.add(shift(k.add(1))).toVar();
  const read = (tex: N, at: N): N => (texture(tex, at) as N).grad(gx, gy);
  const mA: N = read(base.map, uA).toVar(), mB: N = read(base.map, uB).toVar();
  // (Each picture keeps its height in its fourth number. The weights rise from one patch to the next across the whole step, so
  // that the join is as smooth from one step to the next as within one; the higher wins within a few hundredths.)
  const a: N = mA.a.add(one(fk)), b: N = mB.a.add(fk), top: N = max(a, b).sub(0.05);
  const wa: N = max(a.sub(top), 0), wb: N = max(b.sub(top), 0);
  const w: N = wb.div(wa.add(wb).add(1e-5)).toVar();
  return { map: mix(mA, mB, w), normal: mix(read(base.normalMap, uA).xyz, read(base.normalMap, uB).xyz, w), orm: mix(read(base.ormMap, uA), read(base.ormMap, uB), w) };
}
const farFbm: N = Fn(([p0]: [N]) => {
  const p: N = vec2(p0).toVar(), s: N = float(0).toVar(), a: N = float(0.5).toVar();
  Loop(4, () => {
    s.addAssign(a.mul(farNoise(p)));
    p.assign(p.mul(2.03).add(17.1));
    a.mulAssign(0.5);
  });
  return s;
});
// The crowns of a wood seen from above: how high the nearest crown stands at a point (0 between
// trees, 1 at a top), which way it slopes there, and a number of its own for each tree.
/**
 * The rock of a steep face, finer than the sheet it is drawn on can hold: gullies some twenty metres apart and ribs some seven,
 * running down the face and wandering; the ledges where its beds come out across it, every ten metres or so; and the chips and
 * edges of the rock. As light and shade (the normal `base` bent by it, where `weight` says) and as how dark its hollows are. Each
 * size is let go only when it is smaller than four or five points of the picture (`grain`, metres to a point), so a face a mile
 * off still has its rock and none of it glitters. Used for far land and for rock laid as a plain sheet. (Without it such a face
 * was smooth between the sheet's points: a cast, not a mountain.)
 */
const rockRelief = (P: N, n0: N, base: N, grain: N, weight: N, strength = 3.4, dark = 0.55): { normal: N; cavity: N } => {
  // (The distance along a face is read off the world's own axes, x for faces that look along z and z for those that look along x,
  // the two blended where a face turns. It was `dot(P.xz, alongDir)`, with `alongDir` the face's own direction: but P is thousands
  // of metres from the origin, so the least turn of a curved face, from one point of the picture to the next, swung that distance
  // by metres, and the relief came out as contour-line moiré over every great wall.)
  const wz: N = n0.x.mul(n0.x).toVar(), wx: N = n0.z.mul(n0.z).toVar();
  const wsum: N = max(wx.add(wz), 0.0001).toVar();
  const o1: N = one(smoothstep(2.2, 4.5, grain)).toVar(), o2: N = one(smoothstep(0.9, 1.8, grain)).toVar(), o3: N = one(smoothstep(0.35, 0.7, grain)).toVar();
  const ridgeOf = (q: N): N => { const v = one(abs(farNoise(q).mul(2).sub(1))); return v.mul(v); };
  const reliefAt = (sx: N, y: N): N => {
    const w = farNoise(vec2(sx.div(37), y.div(61)).add(5.3));
    const gully = ridgeOf(vec2(sx.div(19).add(w.mul(1.6)), y.div(48)).add(1.7)).mul(o1);
    const rib = ridgeOf(vec2(sx.div(7.3).add(w.mul(2.4)), y.div(17)).add(8.2)).mul(0.5).mul(o2);
    // (The beds dip, and fold a little, and are of all thicknesses; and a ledge comes and goes along each, as the rock breaks. Even
    // and unbroken, they drew a face as a model drawn in contours.)
    const bedY = y.add(sx.mul(0.09)).add(farNoise(vec2(sx.div(70), y.div(90)).add(2.1)).mul(16)).toVar();
    const bedK = floor(bedY.div(11)), beds = fract(bedY.div(11)).toVar();
    const thick = farNoise(vec2(bedK.mul(0.73), 7.7));
    const ledge = smoothstep(0.55, 0.9, beds).mul(one(smoothstep(0.9, 1, beds))).mul(0.45).mul(o2)
      .mul(smoothstep(0.42, 0.72, farNoise(vec2(sx.div(17), bedK.mul(1.31)).add(4.4)))).mul(step(0.35, thick));
    const chip = farNoise(vec2(sx.div(2.6), y.div(3.1)).add(3.3)).mul(0.25).mul(o3);
    return gully.add(rib).add(ledge).add(chip);
  };
  // Each projection (along x, along z): its value, and its slope along the axis and up.
  const rx0: N = reliefAt(P.x, P.y).toVar(), rz0: N = reliefAt(P.z, P.y).toVar();
  const rsx: N = reliefAt(P.x.add(1.2), P.y).sub(rx0).div(1.2), rsz: N = reliefAt(P.z.add(1.2), P.y).sub(rz0).div(1.2);
  const ryx: N = reliefAt(P.x, P.y.add(1.2)).sub(rx0).div(1.2), ryz: N = reliefAt(P.z, P.y.add(1.2)).sub(rz0).div(1.2);
  const r0: N = rx0.mul(wx).add(rz0.mul(wz)).div(wsum).toVar();
  const ry: N = ryx.mul(wx).add(ryz.mul(wz)).div(wsum);
  const upFace: N = normalize(vec3(0, 1, 0).sub(n0.mul(n0.y)).add(vec3(0, 0.0001, 0))).toVar();
  const along: N = vec3(rsx.mul(wx), 0, rsz.mul(wz)).div(wsum);
  const normal: N = normalize(base.sub(along.add(upFace.mul(ry.mul(upFace.y))).mul(strength).mul(weight))).toVar();
  // (Darker down in the gullies and cracks, paler on the ribs; the sky's light reaches less far into them, so a face in the shade,
  // which has no sun to model it, still shows its rock.)
  const cavity: N = mix(1, mix(dark, 1.18, smoothstep(0.05, 1.1, r0)), weight.mul(0.9)).toVar();
  return { normal, cavity };
};

const farCrowns: N = Fn(([p]: [N]) => {
  const i: N = floor(p).toVar(), f: N = fract(p).toVar();
  const best: N = float(9).toVar(), id: N = float(0).toVar(), to: N = vec2(0).toVar();
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const g = vec2(x, y);
    const h: N = farHash(i.add(g)).toVar();
    const o: N = g.add(0.1).add(vec2(h, fract(h.mul(57.31))).mul(0.8)).sub(f).toVar();
    const d: N = dot(o, o).div(fract(h.mul(13.7)).mul(0.22).add(0.3)).toVar();
    If(d.lessThan(best), () => { best.assign(d); to.assign(o); id.assign(h); });
  }
  const h: N = max(0, one(best)).toVar();
  return vec4(h, to.mul(step(0.001, h)).mul(2.4), id);
});

/**
 * The material for land far off: the hills and mountains round the valley. Nothing out there is
 * built or planted. It is one sheet of ground, far too coarse to carry a tree or a ledge, and
 * everything that makes it look like country is worked out for each point of the picture as it
 * is drawn:
 *  - what covers the ground, from how high it is, how steep, and whether it is a hollow or a
 *    spur: woods low down and up the gullies, pasture above, bare rock in beds where it is
 *    steep, scree under the faces, snow on what is high and not too steep to hold it. The edges
 *    of each are ragged, as they are, and not smeared from one corner of the sheet to the next;
 *  - in the woods, the crowns of the trees: each a small dome, lit on its sunward side, dark
 *    between it and the next. From a quarter of a mile this is what a wood looks like, and it
 *    costs nothing like what the trees would;
 *  - ribs and gullies smaller than the sheet can hold, as light and shade only.
 * All of it fades out as it becomes too small to draw, so nothing glitters at the horizon.
 * Each point of the sheet carries how high it stands (0 at the foot of its range, 1 at about
 * the height where rock takes over) and how much of a hollow it is, in the fields other
 * materials use for moss and damp.
 */
export function makeFarMaterial(o: { light?: boolean } = {}): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0, color: new Color(1, 1, 1) });
  const f = fieldOf();
  const uWood = farUniforms.uFarWood as N, uGrass = farUniforms.uFarGrass as N;
  const P: N = positionWorld, fp: N = P.xz, n0: N = normalize(normalWorldGeometry);
  const high = f.w, hollow = f.z;
  // How much of the picture one metre of ground takes up here: what is smaller than a point of it is left out.
  const grain: N = max(length(dFdx(fp)), length(dFdy(fp))).toVar();
  const broad: N = farFbm(fp.mul(0.03)).toVar(), fine: N = farNoise(fp.mul(0.21)).toVar();
  // Ribs and gullies, as light and shade. Water runs straight down a slope, so what it has cut
  // runs that way too: unevenness drawn out along the line of fall and left as it is across it.
  const down: N = n0.xz.div(max(length(n0.xz), 0.04)).toVar();
  let run: N = float(0);
  for (let k = -2; k <= 2; k++) run = run.add(farNoise(fp.add(down.mul(k * 10)).mul(0.075))).add(farNoise(fp.add(down.mul(k * 4)).mul(0.19).add(9)).mul(0.5));
  run = run.div(7.5).sub(0.5).toVar();
  const sloping: N = smoothstep(0.015, 0.16, one(n0.y)).mul(one(smoothstep(3, 9, grain))).toVar();
  const steep: N = one(smoothstep(0.52, 0.74, n0.y)).toVar();
  const ragged: N = broad.sub(0.5).add(fine.sub(0.5).mul(0.2)).add(run.mul(0.9).mul(sloping)).toVar();
  // Rock, in beds some metres thick, each its own shade; darker where it is steep and in hollows.
  const bedAt: N = P.y.add(broad.mul(34)).add(fp.x.mul(0.06)).div(7).toVar();
  const bed = mix(farHash(vec2(floor(bedAt), 3)), 0.5, smoothstep(0.25, 0.8, fwidth(bedAt)));
  let land: N = vertexColor().rgb.mul(bed.mul(0.5).add(0.62).add(broad.sub(0.5).mul(0.3))).mul(one(steep.mul(0.28))).mul(one(max(hollow, 0).mul(0.28)));
  // The gullies are the darker lines.
  const gullied = run.mul(1.5).mul(sloping).add(1);
  // Scree: pale and even, on slopes below the faces that are neither steep nor level.
  land = mix(land, vec3(0.33, 0.32, 0.31).mul(fine.mul(0.3).add(0.85)), smoothstep(0.3, 0.5, high.add(ragged.mul(0.2))).mul(one(steep)).mul(sstep(0.93, 0.83, n0.y)).mul(0.65));
  // Pasture above the trees, on what is not too steep. Not one green: lusher and darker where water gathers, in hollows and down the
  // gullies; paler and yellower on dry crests and on slopes that face the sun (south, which is greater z); in patches a field or two
  // across; with stands of bracken, olive-brown, on the dry slopes, and dark heather on the higher ground. (From any height the hills
  // were a golf course: smooth bright green to the tree line.)
  const wetLie: N = clamp(max(hollow, 0).mul(1.4).sub(run.mul(1.6).mul(sloping)), 0, 1).toVar();
  const drift: N = farNoise(fp.mul(0.045).add(3.3)).toVar();
  const dryLie: N = smoothstep(0.15, 0.75, n0.z.mul(0.5).add(0.25).add(wetLie.negate().mul(0.5)).add(drift.sub(0.5).mul(0.7)).add(max(hollow.negate(), 0).mul(0.6))).toVar();
  let pasture: N = uGrass.mul(broad.mul(0.45).add(0.8)).mul(drift.mul(0.24).add(0.88));
  pasture = mix(pasture, pasture.mul(vec3(0.74, 0.88, 0.72)), wetLie.mul(0.7));
  pasture = mix(pasture, pasture.mul(vec3(1.22, 1.1, 0.78)).add(vec3(0.018, 0.012, 0)), dryLie.mul(0.55));
  const bracken: N = smoothstep(0.6, 0.7, farNoise(fp.mul(0.017).add(11.1)).mul(0.7).add(drift.mul(0.3))).mul(dryLie).mul(sloping.mul(0.6).add(0.4)).toVar();
  pasture = mix(pasture, vec3(0.16, 0.14, 0.06).mul(fine.mul(0.3).add(0.85)), bracken.mul(0.7));
  const heath: N = smoothstep(0.62, 0.72, farNoise(fp.mul(0.013).add(23.7)).mul(0.7).add(fine.mul(0.3))).mul(smoothstep(0.32, 0.5, high)).toVar();
  pasture = mix(pasture, vec3(0.115, 0.075, 0.08).mul(fine.mul(0.3).add(0.85)), heath.mul(0.6));
  const grazed: N = smoothstep(0, 0.07, float(0.62).sub(high).add(ragged.mul(0.3))).mul(one(steep)).mul(0.9).toVar();
  land = mix(land, pasture, grazed);
  // Woods low down, reaching higher up the gullies than on the spurs between them.
  const woodLine: N = float(0.37).sub(high).add(hollow.mul(0.13)).add(ragged.mul(0.42)).toVar();
  // (About a valley, the woods come in gradually from where the far land begins: there they began whole, dark and close, a ring of
  // forest round the open ground and the scattered trees of the valley's own woods, which from any height was a fence.)
  const ring = farUniforms.uFarRing as N;
  const ringIn: N = select(ring.z.greaterThan(0), smoothstep(ring.z, ring.z.add(180), length(fp.sub(ring.xy))), float(1)).toVar();
  const wood: N = smoothstep(0, 0.05, woodLine).mul(one(steep.mul(0.85))).mul(ringIn.mul(ringIn)).toVar();
  // (And past the wood's edge it thins out into single trees and bushes standing in the pasture, fewer the further out: the wood
  // stopped at a line, as if fenced.)
  const scattered: N = smoothstep(-0.14, 0.02, woodLine).mul(one(steep.mul(0.85))).mul(ringIn.mul(0.8).add(0.2)).toVar();
  // Two kinds of tree, in stands: the smaller and darker are firs.
  const firs: N = smoothstep(0.42, 0.58, farNoise(fp.mul(0.011).add(5)).add(high.sub(0.2).mul(0.5))).toVar();
  const size = mix(3.7, 2.6, firs);
  const crown: N = farCrowns(fp.div(size)).toVar();
  // (Crowns are painted as seen from above. On ground that is steep they would be drawn out down the slope into pillars with round
  // tops, row on row, which is what the turned-down edge of the sheet used to show. There the wood is its colour only, and trees
  // of cards stand in front of it.)
  const seen: N = one(smoothstep(0.25, 0.7, grain.div(size))).mul(smoothstep(0.55, 0.8, n0.y)).toVar();
  const green: N = uWood.mul(mix(vec3(1), vec3(0.62, 0.74, 0.82), firs)).mul(fine.mul(0.2).add(0.9));
  // Under the trees it is dark, whatever the ground is.
  land = mix(land, green.mul(0.45), wood.mul(0.9));
  // A wood thins out a tree at a time, not all together: each tree stands or does not; and beyond it, one in many.
  const standing: N = step(fract(crown.w.mul(91.3)), max(wood.mul(1.05), scattered.mul(0.22))).mul(smoothstep(0, 0.3, crown.x)).toVar();
  const tone = crown.x.mul(0.36).add(0.74).mul(crown.w.mul(0.4).add(0.8));
  const treed: N = max(step(0.0001, wood), step(0.0001, scattered).mul(seen)).toVar();
  land = mix(land, green.mul(mix(0.84, tone, seen)).mul(mix(0.6, 1, smoothstep(0.3, 0.7, n0.y))), mix(max(wood, one(smoothstep(0.3, 0.6, n0.y)).mul(step(high, 0.5)).mul(0.9)), standing, seen).mul(treed));
  const farN: N = normalize(n0.sub(vec3(crown.y, 0, crown.z).mul(0.3).mul(seen).mul(standing).mul(treed))).toVar();
  // The rock of a steep face, finer than the sheet can hold: gullies some twenty metres apart and ribs some seven, running down the
  // face and wandering; the ledges where its beds come out across it, every ten metres or so; and the chips and edges of the rock.
  // As light and shade, and as where snow can lie. Each size is let go only when it is smaller than a point of the picture, so a
  // face a mile off still has its rock. (Without it a face far off was smooth between the sheet's points, ten or twenty metres
  // apart: a cast, not a mountain.)
  // (Only on the heights: the low country seen far below through a break in the cloud is wood and pasture, and the rock drawn on it
  // there came out as ripples.)
  const rocky: N = sstep(0.86, 0.6, n0.y).mul(one(wood)).mul(smoothstep(0.3, 0.55, high)).toVar();
  // (`light`: none of it, for a page that must draw quickly on what it has, a tablet's: the relief is worked out six times over at
  // every point of a face, some fifty samples of noise, the most of all this material does.)
  const relief = o.light ? { normal: farN, cavity: float(1) } : rockRelief(P, n0, farN, grain, rocky);
  const faceN: N = relief.normal;
  const cavity: N = relief.cavity;
  land = land.mul(cavity);
  // Snow on what is high, lying deeper in hollows and blown off what is steep.
  // (On a face too steep to hold it, snow still lodges in the gullies and on the ledges of the beds, and lies down the face in
  // streaks and bands; without them a steep face high up was all one dark grey.)
  const lodged: N = max(hollow, 0).mul(0.5).add(max(run.negate(), 0).mul(3).mul(sloping).mul(smoothstep(0.32, 0.62, broad.add(fine.sub(0.5).mul(0.3))))).add(step(0.7, bed).mul(smoothstep(0.42, 0.56, fine.add(broad.sub(0.5).mul(0.8)))).mul(0.42).mul(steep)).toVar();
  // (And in winter, everywhere that is not too steep to hold it, in the open: the woods stand dark out of it, and the snow is thinner
  // where the wind scours the crests.)
  // (And in a deep winter, `uFarDeep`, over all of the open ground, and on the woods too.)
  const deep = farUniforms.uFarDeep as N;
  const lowSnow: N = (farUniforms.uFarSnow as N).mul(smoothstep(0.5, 0.78, faceN.y)).mul(one(wood.mul(mix(0.85, 0.42, deep)))).mul(mix(smoothstep(0.25, 0.55, broad.add(fine.sub(0.5).mul(0.4)).add(max(hollow, 0).mul(0.5)).add(0.15)), 1, deep));
  const snow: N = max(smoothstep(0, 0.08, high.sub(0.6).add(hollow.mul(0.12)).add(ragged.mul(0.35))).mul(smoothstep(lodged.mul(-0.4).add(0.5), lodged.mul(-0.4).add(0.72), faceN.y)), lowSnow).toVar();
  land = mix(land, vec3(1.3, 1.34, 1.42), snow);
  // Water, where the sheet says there is some (in the field other materials use for moss): a lake in a valley floor far below, dark,
  // taking the sky's colour, and bright where the sun is on it.
  const water: N = smoothstep(0.5, 0.9, f.x).toVar();
  m.colorNode = vec4(mix(land.mul(mix(gullied, 1, snow.mul(0.7))), uFallback.mul(vec3(0.16, 0.24, 0.3)).add(vec3(0.012, 0.02, 0.028)), water), 1);
  m.roughnessNode = mix(float(1), 0.16, water);
  m.normalNode = transformNormalToView(normalize(mix(faceN, vec3(0, 1, 0), water)));
  // (The sun is kept off what the land between it and the sun shades: the sheet says how far each point lies in that shadow, in the
  // field other materials use for damp. Sheets that do not reckon it say none.)
  lit(m, { irradiance: mix(uFallback.mul(float(0.55).add(faceN.y.mul(0.45))), bakedAt(faceN), uBake).mul(mix(1, cavity, 0.8)), sun: one(f.y), gleam: mix(mix(0.08, 0.5, snow), 1.6, water) });
  fadesAtNearEdge(m, 'far');
  // (About a valley, the near ground lies under the far land's first thirty metres, and the far land is let into it there in
  // patches, more of it the further out: its colours are not the near ground's, and where it began was a circle drawn round the
  // valley, seen from any height once the woods no longer hid it.)
  const ringShare: N = clamp(length(fp.sub(ring.xy)).sub(ring.z).div(30), 0, 1);
  const ringPatch: N = farNoise(fp.div(2.4)).mul(0.65).add(farNoise(fp.div(0.85).add(7.3)).mul(0.35));
  (m as N).opacityNode = (m as N).opacityNode.mul(select(ring.z.greaterThan(0).and(ringPatch.greaterThan(ringShare.mul(0.7).add(0.15))), float(0), float(1)));
  return m;
}
