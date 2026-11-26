import type { Material } from 'three';
import { makeSiteMaterial, makeWindowMaterial } from './siteMaterial';
import type { TextureSet } from './textures';

/**
 * What everything built is made of, made in one place for the game (`main.ts`) and the building lab alike, so that a change to how
 * buildings are drawn is seen in both: the seeds their surfaces are painted from, and their materials with every option the game gives
 * them. (The lab had made its own, and a change made in the game for nine days had not reached it.)
 */

/** The seeds each surface of what is built is painted from (`generateTextureSet`), and its size against the others'. */
export const BUILT_SURFACES = {
  stone: { seed: 3 }, wood: { seed: 5 }, moss: { seed: 9, half: true }, plaster: { seed: 41 }, tile: { seed: 43 }, thatch: { seed: 47 },
  redBrick: { seed: 73 }, buffBrick: { seed: 79 }, brick: { seed: 83 },
  // (The coursed stone of a castle's walls and a village church's, painted at twice the breadth of the others, up to 2048, since it covers
  // four metres to their two: see `laidUnrepeated`.)
  castle: { seed: 89, twice: true }, ashlar: { seed: 89 },
} as const satisfies Record<string, { seed: number; half?: boolean; twice?: boolean }>;
export type BuiltSurface = keyof typeof BUILT_SURFACES;

/** How many pixels square a surface is painted, where the others are `size`. */
export function builtSurfaceSize(name: BuiltSurface, size: number): number {
  const s = BUILT_SURFACES[name] as { half?: boolean; twice?: boolean };
  return s.half ? size / 2 : s.twice ? Math.min(size * 2, 2048) : size;
}

/** The surfaces painted for what is built: those a place does not have (brick in a valley, ashlar out of a town) are left out. */
export type BuiltTextures = Pick<Record<BuiltSurface, TextureSet>, 'stone' | 'wood' | 'moss' | 'plaster' | 'tile' | 'redBrick' | 'buffBrick'> &
  Partial<Record<'thatch' | 'brick' | 'castle' | 'ashlar', TextureSet | null>>;

/**
 * The materials of what is built. `weathered`: whether it shows its age (render come away, brick flaked, stone chipped, rain streaked;
 * `?chips=0` builds it all new). `wear`: a uniform of these materials' own for how worn they are, in place of the one for everything
 * (`renderUniforms.uChips`): for a building the lab shows more or less worn than the rest.
 */
export function makeBuiltMaterials(t: BuiltTextures, o: { weathered: boolean; wear?: { value: number }; snowed?: boolean }): Record<string, Material> {
  // (`snowed`: snow lying on all that faces up, where nothing is baked to say what is out of doors; the ski runs' village, all shut.)
  const { weathered, wear } = o, moss = t.moss, snowed = !!o.snowed;
  return {
    // (Stone and timber cut square have their edges rounded in the shading: see `edgeOf`.)
    stone: makeSiteMaterial(t.stone, moss, { snowed, normalScale: 1.0, bevel: 0.02, chips: weathered, weather: weathered, wear }),
    floor: makeSiteMaterial(t.stone, moss, { normalScale: 1.2 }),
    slate: makeSiteMaterial(t.stone, moss, { snowed, normalScale: 0.7, roughness: 0.8 }),
    wood: makeSiteMaterial(t.wood, moss, { snowed, normalScale: 1.0, bevel: 0.012, chips: weathered, timber: weathered, weather: weathered, wear }),
    // What buildings are made of besides stone and timber: plaster, with a wash of colour on it; clay tiles; sheet metal, for low roofs;
    // and glass, which is the same smooth surface made dark and bright, so that it mirrors the sky.
    plaster: makeSiteMaterial(t.plaster, moss, { snowed, normalScale: 0.8, render: weathered, weather: weathered, wear }),
    // (Weathered as old roofs are: see `roof` there.)
    tile: makeSiteMaterial(t.tile, moss, { snowed, normalScale: 1.3, mossScale: 3, roof: weathered, wear }),
    ...(t.brick ? { brick: makeSiteMaterial(t.brick, moss, { snowed, normalScale: 1.1, mossScale: 3, wear, ...(weathered ? { bond: 'running' as const, weather: true } : {}) }) } : {}),
    ...(t.castle ? { castle: makeSiteMaterial(t.castle, moss, { snowed, normalScale: 1.2, mossScale: 2.4, weather: weathered, unrepeat: { span: 2, courses: 12 }, wear }) } : {}),
    // Brick, for the towns of the northern coasts: of red clay or of buff, and tinted per building from brown to orange.
    redBrick: makeSiteMaterial(t.redBrick, moss, { snowed, normalScale: 1.1, mossScale: 2.2, wear, ...(weathered ? { bond: 'wendish' as const, weather: true } : {}) }),
    buffBrick: makeSiteMaterial(t.buffBrick, moss, { snowed, normalScale: 1.1, mossScale: 2.2, wear, ...(weathered ? { bond: 'wendish' as const, weather: true } : {}) }),
    metal: makeSiteMaterial(t.plaster, moss, { snowed, normalScale: 0.25, roughness: 0.5 }),
    // Copper gone green, on the roofs and spires of the brick towns: the patina is matt, and does not mirror the sky as sheet metal does.
    copper: makeSiteMaterial(t.plaster, moss, { snowed, normalScale: 0.45, roughness: 0.86, mossScale: 2.5 }),
    glass: makeSiteMaterial(t.plaster, moss, { normalScale: 0.12, roughness: 0.1 }),
    // Thatch on the fishermen's cottages.
    ...(t.thatch ? { thatch: makeSiteMaterial(t.thatch, moss, { snowed, normalScale: 1.6, mossScale: 2 }) } : {}),
    // (And the ashlar of a cathedral's walls, laid as a picture and not stone by stone.)
    ...(t.ashlar ? { ashlar: makeSiteMaterial(t.ashlar, moss, { snowed, normalScale: 1.0, chips: weathered, weather: weathered, wear }) } : {}),
  };
}

/** Windows: with a lamp behind them they glow once the light is going; by day they are glass, dark. */
export function makeWindowFor(lamps: number, t: Pick<BuiltTextures, 'plaster' | 'moss'>): Material {
  return lamps ? makeWindowMaterial() : makeSiteMaterial(t.plaster, t.moss, { normalScale: 0.12, roughness: 0.1, paint: [0.04, 0.055, 0.075] });
}
