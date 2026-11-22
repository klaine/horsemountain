import {
  DataTexture, LinearFilter, LinearMipmapLinearFilter, Mesh, NoColorSpace, OrthographicCamera, PlaneGeometry, RepeatWrapping,
  RGBAFormat, Scene, ShaderMaterial, SRGBColorSpace, Texture, UnsignedByteType, WebGLRenderer, WebGLRenderTarget,
} from 'three';

/**
 * Procedural material recipes. Each recipe is a height function and a colour function in GLSL;
 * the generator renders tiling base colour, normal and occlusion/roughness maps from them.
 * All noise is periodic, so the results tile.
 */

export interface TextureSet {
  /** Base colour, with height in alpha. */
  map: Texture;
  normalMap: Texture;
  /** Occlusion in red, roughness in green, metalness in blue. */
  ormMap: Texture;
  /** The pictures themselves, in the same order, four bytes to a point, bottom row first: for saving them. */
  pixels: Uint8Array[];
  size: number;
}

const NOISE = /* glsl */ `
uniform float uSeed;
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973) + uSeed * .0137);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash21(vec2 p) { return hash22(p).x; }
// Gradient noise, periodic over 'per' lattice cells. Roughly -0.7..0.7.
float gnoise(vec2 x, vec2 per) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 ga = hash22(mod(i, per)) * 2. - 1.;
  vec2 gb = hash22(mod(i + vec2(1, 0), per)) * 2. - 1.;
  vec2 gc = hash22(mod(i + vec2(0, 1), per)) * 2. - 1.;
  vec2 gd = hash22(mod(i + vec2(1, 1), per)) * 2. - 1.;
  float a = dot(ga, f), b = dot(gb, f - vec2(1, 0)), c = dot(gc, f - vec2(0, 1)), d = dot(gd, f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 uv, vec2 freq, int octaves, float gain) {
  float sum = 0., amp = .5;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    sum += amp * gnoise(uv * freq + float(i) * 3.7, freq);
    freq *= 2.; amp *= gain;
  }
  return sum;
}
// Cellular noise: distance to nearest and second-nearest feature point.
vec2 worley(vec2 x, vec2 per) {
  vec2 i = floor(x), f = fract(x);
  float d1 = 9., d2 = 9.;
  for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 o = hash22(mod(i + g, per));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(d1, d2);
}
// The same, with a number belonging to the nearest cell: for giving each piece its own height or shade.
vec3 worleyId(vec2 x, vec2 per) {
  vec2 i = floor(x), f = fract(x);
  float d1 = 9., d2 = 9., id = 0.;
  for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 c = mod(i + g, per);
    vec2 o = hash22(c);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = hash21(c + 17.3); } else if (d < d2) { d2 = d; }
  }
  return vec3(d1, d2, id);
}
// Flat faces meeting in creases, as rock breaks: each cell holds a tilted plane, and the height
// is the highest of the planes nearby. About -0.3 to 0.8.
float facets(vec2 x, vec2 per) {
  vec2 i = floor(x), f = fract(x);
  float best = -9.;
  for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 c = mod(i + g, per);
    vec2 d = f - g - hash22(c);
    vec2 n = hash22(c + 31.7) * 2. - 1.;
    best = max(best, hash21(c + 5.1) * .5 - dot(d, n) * .9 - dot(d, d) * .35);
  }
  return best;
}
`;

interface Recipe {
  /** float heightFn(vec2 uv): 0..1 */
  height: string;
  /** void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough): linear colour */
  surface: string;
  normalStrength: number;
}

/**
 * Bark. Every tree's is made the same way and no two kinds are alike, so there is one recipe and each kind is a set of numbers
 * for it. Bark is plates parted by furrows; flakes on the plates, stepped and a little domed, with a crack round each; scales
 * on the flakes; and grain along the trunk. What differs is how large each of those is, how deep the furrows go, and the colours:
 *  - an oak's is long narrow ridges with furrows right through, grey-brown and lichened;
 *  - an ash's is smooth, with a shallow net of fine cracks, pale grey;
 *  - a pine's is broad plates like the pieces of a puzzle, built of thin flakes, in shallow furrows no darker than old wood;
 *  - a spruce's is small round scales lifting at their edges, with no furrows to speak of.
 * `plate`, `flake` and `scale` are how many of each lie across the picture and up it; `furrow` how wide the furrows are and `deep`
 * how far down they go, 0 to 1; `rise` how unlike in height plates are; `flakes`, `scales` and `fibre` how strongly each stands out.
 * (Everything in it comes round in the height of the picture as well as across it. Once one part did not, and drew a line round every trunk.)
 */
function barkRecipe(o: { plate: [number, number]; furrow: number; deep: number; rise: number; flake: [number, number]; flakes: number; scale: [number, number]; scales: number; fibre: number; dark: number[]; light: number[]; fresh: number[]; lichen: number; normal: number }): Recipe {
  const n = (v: number) => v.toFixed(3), v2 = (v: number[]) => `vec2(${n(v[0])}, ${n(v[1])})`, v3 = (v: number[]) => `vec3(${n(v[0])}, ${n(v[1])}, ${n(v[2])})`;
  return {
    normalStrength: o.normal,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  float warp = fbm(uv, vec2(3., 2.), 3, .5);
  float sway = fbm(uv + 4.1, vec2(4., 2.), 3, .5);
  vec3 pl = worleyId(uv * ${v2(o.plate)} + vec2(warp * 1.5, sway * .6), ${v2(o.plate)});
  float furrow = mix(${n(1 - o.deep)}, 1., smoothstep(.0, ${n(o.furrow)} * (1. + fbm(uv + 7.3, vec2(6., 3.), 2, .5)), pl.y - pl.x));
  float plate = .42 + ${n(o.rise)} * (pl.z - .2);
  vec3 fl = worleyId(uv * ${v2(o.flake)} + vec2(warp * 2.5 + 3., sway), ${v2(o.flake)});
  float flake = ((fl.z - .5) + (.45 - fl.x) * .45 - (1. - smoothstep(.0, .1, fl.y - fl.x)) * .35) * ${n(o.flakes)};
  vec3 sc = worleyId(uv * ${v2(o.scale)} + vec2(1.7, warp), ${v2(o.scale)});
  float scale = ((sc.z - .5) * smoothstep(.0, .1, sc.y - sc.x) - (1. - smoothstep(.0, .07, sc.y - sc.x)) * .3) * ${n(o.scales)};
  float fibre = gnoise(vec2(uv.x * 64., uv.y * 6.), vec2(64., 6.)) * .5 + gnoise(vec2(uv.x * 150., uv.y * 14.), vec2(150., 14.)) * .3;
  float body = plate + flake + scale + fibre * ${n(o.fibre)} + fbm(uv + 3., vec2(5.), 3, .5) * .12;
  return clamp(.04 + furrow * body, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float t = fbm(uv + 5.5, vec2(4., 3.), 4, .5);
  vec3 base = mix(${v3(o.dark)}, ${v3(o.light)}, smoothstep(.12, .85, h + t * .3));
  // Where a flake has come away the bark under it is fresher.
  base = mix(base, ${v3(o.fresh)}, smoothstep(.5, .3, h) * smoothstep(.12, .28, h) * .55);
  float warm = fbm(uv + 2.1, vec2(2., 2.), 3, .5);
  base *= mix(vec3(1.08, .96, .84), vec3(.9, .98, 1.08), smoothstep(.3, .7, warm));
  // Grey-green crust on the high parts, round pale lichens in colonies, and now and then a small yellow-orange one.
  float lichen = ${n(o.lichen)};
  base = mix(base, vec3(.4, .45, .34), smoothstep(.1, .4, fbm(uv + 8., vec2(5., 4.), 3, .5)) * smoothstep(.5, .8, h) * .5 * min(lichen, 1.));
  vec2 w = worley(uv * vec2(9., 7.) + 4., vec2(9., 7.));
  float colony = smoothstep(.45, .72, fbm(uv + 11., vec2(3., 3.), 3, .5));
  float disc = (1. - smoothstep(.1, .3, w.x)) * colony * smoothstep(.4, .75, h) * min(lichen, 1.5);
  base = mix(base, vec3(.62, .66, .5), min(disc * .6, 1.));
  vec2 w2 = worley(uv * vec2(17., 13.) + 9., vec2(17., 13.));
  float fleck = (1. - smoothstep(.05, .16, w2.x)) * smoothstep(.62, .8, fbm(uv + 21., vec2(4., 4.), 3, .5)) * smoothstep(.5, .8, h) * min(lichen, 1.);
  base = mix(base, vec3(.62, .45, .14), fleck * .7);
  albedo = base * (1. - cavity * ${n(0.3 + 0.4 * o.deep)});
  rough = clamp(.9 + cavity * .08 - disc * .1, .6, 1.);
}`,
  };
}

/**
 * Brick of the Baltic towns: large bricks of the old monastic size, about 28 centimetres by 9, laid in the Wendish bond (two
 * stretchers, then a header) in a thick bed of lime mortar. The picture is two metres square, so faces built at the usual scale
 * have twenty courses to it and fifteen headers' breadth across. Each course is set off from the one below by two or three
 * headers' breadth, so no joint runs straight up. Every brick is its own shade between the clay's `low` and `high`: some fired
 * `hard` nearest the kiln's fire, dark and purplish; a few `soft`, pale, fired too little. Their faces are a little uneven, their
 * arrises worn round, and the mortar stands back from them and is dirtied grey. The colour given to each point tints it all,
 * so the same picture serves a red town or a brown one; a pale clay needs a picture of its own, since the tint would take the
 * mortar with it.
 */
function brickRecipe(o: { low: number[]; high: number[]; hard: number[]; soft: number[] }): Recipe {
  const v3 = (v: number[]) => `vec3(${v.map((n) => n.toFixed(3)).join(', ')})`;
  return {
    normalStrength: 5.5,
    height: /* glsl */ `
vec4 brickCell(vec2 uv) {
  // (Fifteen units across, where a header is one and a stretcher two; twenty courses up.)
  // (Rows and periods are counted round, so that the picture meets itself at its edges.)
  float row = mod(floor(uv.y * 20.), 20.), fy = fract(uv.y * 20.);
  float x = uv.x * 15. + mod(row * 3., 5.);
  float period = mod(floor(x / 5.), 3.), p = mod(x, 5.);
  float start = p < 2. ? 0. : p < 4. ? 2. : 4., len = p < 4. ? 2. : 1.;
  float fx = (p - start) / len;
  float id = hash21(vec2(period * 5. + start, row) + 7.);
  return vec4(fx, fy, id, len);
}
float heightFn(vec2 uv) {
  vec4 c = brickCell(uv);
  // Joints: the bed joint about a centimetre and a half, the cross joints a little narrower.
  float jx = .045 / c.w, jy = .075;
  float ex = min(c.x, 1. - c.x) / jx, ey = min(c.y, 1. - c.y) / jy;
  float face = smoothstep(.55, 1.35, min(ex, ey * 1.0));
  float dent = fbm(uv + c.z * 3.1, vec2(60.), 3, .55) * .12 + (c.z - .5) * .06;
  float pit = smoothstep(.62, .78, fbm(uv + 2.3, vec2(110.), 2, .5)) * .1;
  float mortar = .22 + fbm(uv + 9.1, vec2(140.), 2, .5) * .08;
  return clamp(mix(mortar, .74 + dent - pit, face), 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  vec4 c = brickCell(uv);
  float id = c.z, k = fract(id * 13.7), m = fract(id * 7.31);
  vec3 clay = mix(${v3(o.low)}, ${v3(o.high)}, k);
  // Fired hardest nearest the fire, and darkest. A few came out of the kiln pale.
  clay = mix(clay, ${v3(o.hard)}, step(.86, m) * .85);
  clay = mix(clay, ${v3(o.soft)}, step(m, .07) * .7);
  // Within a brick the colour wanders, darker in fire-flashes along one end.
  clay *= .86 + .22 * fbm(uv + id * 5., vec2(30.), 3, .5) + .14;
  clay *= mix(1., .78, smoothstep(.55, 1., abs(c.x - .5) * 2.) * step(.5, fract(id * 3.3)) * .6);
  vec3 lime = vec3(.44, .42, .38) * (.85 + .2 * fbm(uv + 1.7, vec2(70.), 2, .5));
  float face = smoothstep(.36, .5, h);
  // Weather has washed some of the lime over the brick, and dirt down it.
  float bloom = smoothstep(.25, .65, fbm(uv + 6.6, vec2(4., 7.), 4, .55)) * .22;
  albedo = mix(lime, clay, face);
  albedo = mix(albedo, lime * .9, bloom * face * .5);
  albedo *= (1. - cavity * .45) * (.95 + .1 * hash21(floor(uv * 512.)));
  rough = mix(.94, .82, face);
}`,
  };
}

/**
 * Ashlar: cut stone laid in courses, for what is built too large to be laid block by block (a cathedral; see `MasonryStyle.flat`).
 * The picture is 2.4 metres square, laid on by the metre: six courses of 0.4, each cut into three or four blocks at joints of its
 * own, so no two courses break joint alike; each block its own tone of a pale stone that the colour given to each point tints, its
 * face dressed with the drag of the tool, its arrises a little worn and chipped; joints of lime a centimetre broad, standing back.
 */
const ASHLAR_CELL = /* glsl */ `
vec4 ashlarCell(vec2 uv) {
  float row = mod(floor(uv.y * 6.), 6.), fy = fract(uv.y * 6.);
  float n = 3. + step(.5, hash21(vec2(row, 3.)));
  float x = fract(uv.x + hash21(vec2(row, 7.))) * n, b = floor(x);
  // (The joint before block b stands a little off its even place, and so does the one after.)
  float j0 = (hash21(vec2(row * 11. + mod(b, n), 5.)) - .5) * .5, j1 = (hash21(vec2(row * 11. + mod(b + 1., n), 5.)) - .5) * .5;
  float s = b + j0, e = b + 1. + j1;
  if (x < s) { e = s; b -= 1.; s = b + (hash21(vec2(row * 11. + mod(b, n), 5.)) - .5) * .5; }
  else if (x > e) { s = e; b += 1.; e = b + 1. + (hash21(vec2(row * 11. + mod(b + 1., n), 5.)) - .5) * .5; }
  float len = (e - s) / n * 2.4;
  return vec4((x - s) / (e - s), fy, hash21(vec2(mod(b, n) + row * 13., 9.)), len);
}
// How far a point is in from the nearest joint, in metres.
float ashlarEdge(vec2 uv, vec4 c) { return min(min(c.x, 1. - c.x) * c.w, min(c.y, 1. - c.y) * .4); }`;

const RECIPES: Record<string, Recipe> = {
  ashlar: {
    normalStrength: 4.5,
    height: ASHLAR_CELL + /* glsl */ `
float heightFn(vec2 uv) {
  vec4 c = ashlarCell(uv);
  float d = ashlarEdge(uv, c) + fbm(uv + c.z * 4.1, vec2(96.), 2, .5) * .006;
  // The arris worn round over a couple of centimetres, and here and there a chip out of it.
  float face = smoothstep(.004, .026, d);
  float chip = smoothstep(.6, .8, fbm(uv + 3.3, vec2(48.), 3, .5)) * (1. - smoothstep(.02, .07, d));
  float tool = gnoise(vec2(uv.x * 20., uv.y * 140.) + c.z * 30., vec2(20., 140.)) * .5;
  float dent = fbm(uv + c.z * 2.7, vec2(24.), 3, .55) * .14 + (c.z - .5) * .05;
  float mortar = .2 + fbm(uv + 9.1, vec2(160.), 2, .5) * .06;
  return clamp(mix(mortar, .72 + dent + tool * .05 - chip * .25, face), 0., 1.);
}`,
    // (The height's code comes before the surface's in one program, so the cell is written there once.)
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  vec4 c = ashlarCell(uv);
  float id = c.z, k = fract(id * 13.7), m = fract(id * 7.31);
  // Each block from its own part of the bed: paler, darker, warmer or cooler; now and then one with iron in it.
  vec3 stone = mix(vec3(.62, .6, .56), vec3(.76, .74, .7), k);
  stone *= vec3(1. + (m - .5) * .08, 1., 1. - (m - .5) * .08);
  stone = mix(stone, vec3(.66, .54, .4), step(.9, fract(id * 3.9)) * .4);
  stone *= .9 + .2 * fbm(uv + id * 5., vec2(16.), 4, .5);
  vec3 lime = vec3(.7, .67, .6) * (.85 + .15 * fbm(uv + 1.7, vec2(80.), 2, .5));
  float face = smoothstep(.34, .5, h);
  albedo = mix(lime, stone, face) * (1. - cavity * .4) * (.96 + .08 * hash21(floor(uv * 512.)));
  rough = mix(.95, .86, face);
}`,
  },
  // Dressed limestone: broad undulation, pitting, fine tooling and grain. Pale, so vertex tint sets the colour.
  stone: {
    normalStrength: 5.5,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  float broad = fbm(uv, vec2(3.), 5, .55);
  float mid = fbm(uv + 7.3, vec2(12.), 4, .5);
  vec2 w = worley(uv * 22., vec2(22.));
  float pitMask = smoothstep(.12, .32, fbm(uv + 2.1, vec2(4.), 3, .5) + .1);
  float pitSize = .08 + .22 * hash21(floor(uv * 22.) + 3.);
  float pits = smoothstep(pitSize, .0, w.x) * pitMask * step(.55, hash21(floor(uv * 22.) + 11.));
  float tool = gnoise(vec2(uv.x * 14., uv.y * 96.), vec2(14., 96.)) * .5
             + gnoise(vec2(uv.x * 30., uv.y * 180.), vec2(30., 180.)) * .3;
  float grain = fbm(uv + 1.7, vec2(72.), 3, .6);
  float h = .58 + broad * .6 + mid * .26 + tool * .09 + grain * .12 - pits * .3;
  return clamp(h, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float blot = fbm(uv + 9.1, vec2(4.), 4, .5);
  float speck = hash21(floor(uv * 512.));
  vec3 base = mix(vec3(.60, .58, .55), vec3(.74, .72, .68), smoothstep(-.25, .3, blot));
  // Iron staining and a little warm/cool drift.
  float stain = smoothstep(.12, .4, fbm(uv + 13.7, vec2(6.), 4, .55));
  base = mix(base, vec3(.62, .50, .36), stain * .35);
  base *= mix(.86, 1.06, smoothstep(.2, .8, h));
  base *= 1. - cavity * .45;
  base *= .96 + speck * .08;
  albedo = base;
  rough = clamp(.86 + cavity * .1 - smoothstep(.6, .9, h) * .12 + (speck - .5) * .06, .5, 1.);
}`,
  },
  // Sawn timber: long grain, occasional knots, checks along the grain.
  wood: {
    normalStrength: 4.,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  float warp = fbm(uv, vec2(2., 6.), 3, .5) * .12;
  float g1 = gnoise(vec2(uv.x * 4., (uv.y + warp) * 46.), vec2(4., 46.));
  float g2 = gnoise(vec2(uv.x * 9., (uv.y + warp) * 130.), vec2(9., 130.));
  float g3 = gnoise(vec2(uv.x * 20., (uv.y + warp) * 300.), vec2(20., 300.));
  vec2 w = worley(vec2(uv.x * 3., uv.y * 8.), vec2(3., 8.));
  float knot = smoothstep(.16, .0, w.x) * step(.72, hash21(floor(vec2(uv.x * 3., uv.y * 8.)) + .5));
  float checks = smoothstep(.42, .62, g1) * smoothstep(.1, .5, fbm(uv + 5., vec2(3., 3.), 3, .5) + .2);
  float h = .55 + g1 * .34 + g2 * .2 + g3 * .1 - checks * .3 + knot * .15;
  return clamp(h, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float tone = fbm(uv + 3.3, vec2(2., 10.), 4, .5);
  vec3 base = mix(vec3(.20, .13, .08), vec3(.42, .30, .19), smoothstep(.25, .8, h + tone * .5));
  base = mix(base, vec3(.33, .31, .28), smoothstep(.1, .5, fbm(uv + 8., vec2(3., 5.), 3, .5)) * .45);
  base *= 1. - cavity * .55;
  albedo = base;
  rough = clamp(.78 + cavity * .15 - h * .1, .45, 1.);
}`,
  },
  bark: barkRecipe({ plate: [10, 2], furrow: 0.12, deep: 1, rise: 0.26, flake: [16, 6], flakes: 0.24, scale: [41, 11], scales: 0.12, fibre: 0.13, dark: [0.05, 0.04, 0.035], light: [0.5, 0.45, 0.39], fresh: [0.46, 0.35, 0.27], lichen: 1, normal: 9 }),
  barkAsh: barkRecipe({ plate: [9, 3], furrow: 0.06, deep: 0.3, rise: 0.07, flake: [21, 5], flakes: 0.05, scale: [47, 13], scales: 0.04, fibre: 0.1, dark: [0.17, 0.16, 0.15], light: [0.55, 0.54, 0.5], fresh: [0.5, 0.48, 0.44], lichen: 1.5, normal: 6 }),
  barkPine: barkRecipe({ plate: [5, 2], furrow: 0.1, deep: 0.6, rise: 0.2, flake: [13, 7], flakes: 0.3, scale: [29, 17], scales: 0.1, fibre: 0.05, dark: [0.2, 0.12, 0.085], light: [0.6, 0.5, 0.42], fresh: [0.6, 0.38, 0.27], lichen: 0.15, normal: 8 }),
  barkFir: barkRecipe({ plate: [13, 8], furrow: 0.1, deep: 0.4, rise: 0.3, flake: [27, 15], flakes: 0.14, scale: [53, 23], scales: 0.08, fibre: 0.06, dark: [0.1, 0.085, 0.08], light: [0.46, 0.42, 0.4], fresh: [0.42, 0.33, 0.3], lichen: 0.8, normal: 8 }),
  // Moss: soft clumps. Alpha (height) is used as the growth mask when blending over stone.
  moss: {
    normalStrength: 3.,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  vec2 w = worley(uv * 14., vec2(14.));
  vec2 w2 = worley(uv * 40. + 3., vec2(40.));
  float clumps = 1. - smoothstep(.0, .75, w.x);
  float tufts = 1. - smoothstep(.0, .8, w2.x);
  float h = clumps * .6 + tufts * .25 + fbm(uv, vec2(6.), 4, .55) * .5 + .12;
  return clamp(h, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float t = fbm(uv + 5.5, vec2(5.), 4, .55);
  vec3 dark = vec3(.035, .065, .018), mid = vec3(.10, .17, .035), dry = vec3(.22, .22, .07);
  vec3 base = mix(dark, mid, smoothstep(.2, .75, h));
  base = mix(base, dry, smoothstep(.1, .45, t) * .55);
  albedo = base * (1. - cavity * .3);
  rough = .96;
}`,
  },
  // Living rock: a broken, weathered surface. A few long fractures, more short ones that are not
  // all open, flakes with slightly tilted faces, pits, and grain. There is no bedding in it: the
  // rock is textured from three sides, so beds are drawn by the shader, which knows which way is
  // up. Pale, like the dressed stone, so that the vertex tint sets its colour.
  rock: {
    normalStrength: 6.,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  vec2 warp = vec2(fbm(uv + 1.3, vec2(3.), 4, .55), fbm(uv + 8.9, vec2(3.), 4, .55));
  // A broken face: flat planes at three sizes, the lesser on the greater, meeting in sharp
  // edges. The hollows between them are where the cracks are; none is drawn.
  float broken = (facets(uv * 3. + warp * .6, vec2(3.)) - .3) * .5
               + (facets(uv * 7. + warp * 1.2 + 4.3, vec2(7.)) - .3) * .24
               + (facets(uv * 17. + 9.1, vec2(17.)) - .3) * .1;
  // A few hairline cracks that wander and stop.
  float c1 = abs(fbm(uv + 2.7, vec2(3.), 5, .5));
  float crack = (1. - smoothstep(.0, .009, c1)) * smoothstep(.0, .2, fbm(uv + 11.3, vec2(3.), 3, .5)) * .2;
  float roll = fbm(uv + 3.1, vec2(4.), 4, .55);
  vec2 wp = worley(uv * 30. + 2., vec2(30.));
  float pits = smoothstep(.22, .0, wp.x) * step(.6, hash21(floor(uv * 30. + 2.) + 7.)) * smoothstep(.0, .2, fbm(uv + 2.2, vec2(5.), 3, .5) + .05);
  float grain = fbm(uv + 1.7, vec2(56.), 4, .6);
  return clamp(.5 + broken + roll * .22 + grain * .13 - crack - pits * .2, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float blot = fbm(uv + 9.1, vec2(4.), 4, .5);
  float speck = hash21(floor(uv * 512.));
  vec3 base = mix(vec3(.52, .52, .53), vec3(.72, .70, .67), smoothstep(-.3, .35, blot));
  // Iron in the stone, weathering out warm.
  base = mix(base, vec3(.66, .52, .38), smoothstep(.1, .4, fbm(uv + 13.7, vec2(5.), 4, .55)) * .3);
  // Lichen: pale grey-green and ochre crusts on the high, dry parts.
  vec3 w = worleyId(uv * 11. + 5., vec2(11.));
  float crust = smoothstep(.2, .36, fbm(uv + 21.4, vec2(9.), 4, .6)) * smoothstep(.4, .7, h) * smoothstep(.5, .3, w.x);
  base = mix(base, mix(vec3(.66, .69, .55), vec3(.72, .6, .34), step(.6, w.z)), crust * .6);
  base *= mix(.74, 1.08, smoothstep(.15, .8, h));
  base *= 1. - cavity * .65;
  base *= .95 + speck * .1;
  albedo = base;
  rough = clamp(.9 + cavity * .08 - smoothstep(.6, .9, h) * .1, .55, 1.);
}`,
  },
  // Scree: broken stone lying loose. Stones of three sizes, each a lump highest in its middle,
  // the larger lying on the smaller, with earth and shadow in the gaps.
  scree: {
    normalStrength: 7.,
    height: /* glsl */ `
float lumps(vec2 uv, float n, float share, out float id) {
  vec3 w = worleyId(uv * n + vec2(fbm(uv + n, vec2(4.), 3, .5), fbm(uv + n + 5.3, vec2(4.), 3, .5)) * 1.2, vec2(n));
  id = w.z;
  // Not every cell holds a stone, and those that do hold stones of different sizes.
  float size = mix(.35, .62, fract(w.z * 7.3));
  return step(1. - share, w.z) * smoothstep(size, size * .25, w.x) * smoothstep(.0, .12, w.y - w.x);
}
float heightFn(vec2 uv) {
  float ia, ib, ic;
  float big = lumps(uv, 5., .4, ia) * (.55 + .4 * ia);
  float mid = lumps(uv + 3.7, 11., .7, ib) * (.36 + .25 * ib);
  float small = lumps(uv + 8.1, 26., .9, ic) * (.2 + .12 * ic);
  float grain = fbm(uv + 1.7, vec2(64.), 3, .6);
  return clamp(max(big, max(mid, small)) + .1 + grain * .09 + fbm(uv, vec2(3.), 3, .5) * .1, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float ia, ib, ic;
  float big = lumps(uv, 5., .4, ia), mid = lumps(uv + 3.7, 11., .7, ib), small = lumps(uv + 8.1, 26., .9, ic);
  float tone = big > .05 ? ia : mid > .05 ? ib : ic;
  vec3 stone = mix(vec3(.44, .43, .43), vec3(.74, .72, .68), fract(tone * 3.7));
  stone = mix(stone, vec3(.6, .5, .38), step(.8, fract(tone * 11.3)) * .5);
  vec3 earth = vec3(.17, .14, .1);
  albedo = mix(earth, stone, smoothstep(.14, .26, h)) * (1. - cavity * .6);
  albedo *= .95 + hash21(floor(uv * 512.)) * .1;
  rough = clamp(.93 + cavity * .05, .6, 1.);
}`,
  },
  // Talus: rock split by frost and lying where it fell, on a mountain. Not rounded, as the scree of a valley's
  // foot is drawn: every piece has the outline it broke with, straight-edged and cornered, and a flat face
  // uppermost, tilted its own way, so that one catches the light and the next does not. Three sizes, the
  // larger lying on the smaller; between them grit, not earth.
  talus: {
    normalStrength: 8.,
    height: /* glsl */ `
float shard(vec2 uv, float n, float share, out float id) {
  vec2 x = uv * n + vec2(fbm(uv + n, vec2(4.), 2, .5), fbm(uv + n + 5.3, vec2(4.), 2, .5)) * .45;
  vec2 i = floor(x), f = fract(x), to = vec2(0.);
  float d1 = 9., d2 = 9.;
  id = 0.;
  for (int yy = -1; yy <= 1; yy++) for (int xx = -1; xx <= 1; xx++) {
    vec2 g = vec2(float(xx), float(yy));
    vec2 c = mod(i + g, vec2(n));
    vec2 r = g + hash22(c) - f;
    float d = length(r);
    if (d < d1) { d2 = d1; d1 = d; to = r; id = hash21(c + 17.3); } else if (d < d2) { d2 = d; }
  }
  // Its top is a plane through its own middle, tilted its own way; its edge is where the next piece begins, and is sharp.
  vec2 tilt = (hash22(vec2(id * 91.7, id * 33.1)) - .5) * 1.5;
  float top = .66 + .3 * fract(id * 5.3) - dot(tilt, to);
  return step(1. - share, id) * smoothstep(.0, .06, d2 - d1) * clamp(top, .12, 1.);
}
float heightFn(vec2 uv) {
  float ia, ib, ic;
  float big = shard(uv, 4., .45, ia) * (.62 + .36 * ia);
  float mid = shard(uv + 3.7, 9., .7, ib) * (.4 + .2 * ib);
  float small = shard(uv + 8.1, 22., .92, ic) * (.2 + .1 * ic);
  float grit = fbm(uv + 1.7, vec2(70.), 3, .6);
  return clamp(max(big, max(mid, small)) + .08 + grit * .07 + fbm(uv, vec2(3.), 3, .5) * .08, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float ia, ib, ic;
  float big = shard(uv, 4., .45, ia), mid = shard(uv + 3.7, 9., .7, ib), small = shard(uv + 8.1, 22., .92, ic);
  float tone = big > .05 ? ia : mid > .05 ? ib : ic;
  // (Grey, without a cast of its own: whoever lays it tints it to the rock it broke from.)
  vec3 stone = vec3(mix(.46, .76, fract(tone * 3.7)));
  // Weathered faces are darker than fresh breaks; a few carry a crust of lichen.
  stone *= mix(.82, 1.06, smoothstep(-.2, .3, fbm(uv + 4.4, vec2(13.), 3, .5)));
  stone = mix(stone, vec3(.5, .52, .36), step(.86, fract(tone * 11.3)) * smoothstep(.1, .3, fbm(uv + 9.9, vec2(31.), 2, .5) + .15) * .55);
  vec3 grit = vec3(.36, .35, .33) * (.85 + .3 * hash21(floor(uv * 256.)));
  albedo = mix(grit, stone, smoothstep(.13, .22, h)) * (1. - cavity * .62);
  albedo *= .95 + hash21(floor(uv * 512.)) * .1;
  rough = clamp(.92 + cavity * .06, .6, 1.);
}`,
  },
  // Beaten earth, as on a track: packed and gently uneven, paler where it has dried and darker
  // where it holds the wet, with small stones trodden into it. No two patches the same tone, so
  // that a path is not one colour from end to end.
  soil: {
    normalStrength: 5.,
    height: /* glsl */ `
float pebbles(vec2 uv, float n, float share, out float id) {
  vec3 w = worleyId(uv * n + vec2(fbm(uv + n, vec2(4.), 3, .5), fbm(uv + n + 5.3, vec2(4.), 3, .5)) * 1.1, vec2(n));
  id = w.z;
  float size = mix(.3, .55, fract(w.z * 7.3));
  return step(1. - share, w.z) * smoothstep(size, size * .3, w.x) * smoothstep(.0, .1, w.y - w.x);
}
float heightFn(vec2 uv) {
  float ia, ib, ic;
  float stones = max(pebbles(uv + 1.1, 9., .2, ia) * (.42 + .25 * ia), max(pebbles(uv + 6.4, 19., .34, ib) * (.26 + .16 * ib), pebbles(uv + 2.9, 41., .5, ic) * (.14 + .08 * ic)));
  // Trodden ground: broad shallow hollows where feet fall, and the grain of dried mud.
  float lie = fbm(uv + 2.3, vec2(4.), 4, .55) * .2 + fbm(uv + 7.1, vec2(17.), 3, .5) * .08;
  float crack = smoothstep(.05, .0, worley(uv * 7. + fbm(uv, vec2(5.), 2, .5) * .6, vec2(7.)).y - worley(uv * 7. + fbm(uv, vec2(5.), 2, .5) * .6, vec2(7.)).x) * .08;
  return clamp(.36 + lie + fbm(uv, vec2(70.), 3, .6) * .06 - crack + stones, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float ia, ib, ic;
  float a = pebbles(uv + 1.1, 9., .2, ia), b = pebbles(uv + 6.4, 19., .34, ib), c = pebbles(uv + 2.9, 41., .5, ic);
  float tone = a > .05 ? ia : b > .05 ? ib : ic;
  vec3 stone = mix(vec3(.36, .34, .31), vec3(.62, .59, .52), fract(tone * 3.7));
  stone = mix(stone, vec3(.5, .41, .3), step(.75, fract(tone * 11.3)) * .6);
  float damp = fbm(uv + 5.5, vec2(3.), 4, .55), dry = fbm(uv + 9.1, vec2(11.), 3, .5);
  // (Pale: dry trodden earth is the colour of sand, not of chocolate.)
  vec3 earth = mix(vec3(.17, .135, .092), vec3(.33, .27, .19), smoothstep(-.35, .35, damp));
  earth = mix(earth, vec3(.39, .33, .245), smoothstep(.05, .5, dry) * .5);
  albedo = mix(earth, stone, smoothstep(.04, .14, max(a, max(b, c)))) * (1. - cavity * .5);
  albedo *= .93 + hash21(floor(uv * 512.)) * .14;
  rough = .95;
}`,
  },
  // Sand on a beach: laid by the wind in ripples a hand apart that wander and break, fine-grained,
  // with broken shell and a few small pebbles in it. Pale, because it is drawn darker where it is
  // laid as the bare ground of the turf's material, and darker again where it is wet.
  sand: {
    normalStrength: 3.,
    height: /* glsl */ `
float bits(vec2 uv, float n, float share, out float id) {
  vec3 w = worleyId(uv * n, vec2(n));
  id = w.z;
  return step(1. - share, w.z) * smoothstep(.32, .12, w.x);
}
float heightFn(vec2 uv) {
  vec2 q = uv + vec2(fbm(uv + 3.3, vec2(3.), 3, .5), fbm(uv + 8.8, vec2(3.), 3, .5)) * .35;
  float ripple = sin((q.x * 2. + q.y) * 6.2832 * 6. + fbm(uv, vec2(6.), 3, .5) * 4.);
  ripple = ripple * .5 + .5;
  ripple = pow(ripple, 1.6) * smoothstep(-.25, .25, fbm(uv + 1.9, vec2(4.), 3, .5));
  float ia, ib;
  float shells = bits(uv + 2.2, 23., .12, ia) * .25 + bits(uv + 7.7, 47., .1, ib) * .15;
  return clamp(.4 + ripple * .16 + fbm(uv, vec2(96.), 2, .6) * .08 + fbm(uv + 4., vec2(8.), 3, .5) * .12 + shells, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float ia, ib;
  float a = bits(uv + 2.2, 23., .12, ia), b = bits(uv + 7.7, 47., .1, ib);
  float drift = fbm(uv + 6.1, vec2(5.), 4, .55);
  vec3 sand = mix(vec3(.74, .67, .52), vec3(.86, .8, .66), smoothstep(-.3, .3, drift));
  // Darker grains gather in the troughs of the ripples, as the heavier ones do.
  sand = mix(sand, vec3(.52, .47, .38), cavity * .7 + smoothstep(.2, .5, fbm(uv + 2.7, vec2(40.), 2, .5)) * .15);
  vec3 shell = mix(vec3(.92, .88, .82), vec3(.45, .43, .44), step(.7, fract(ia * 5.3)));
  albedo = mix(sand, shell, max(a, b));
  albedo *= .9 + hash21(floor(uv * 512.)) * .2;
  rough = .92;
}`,
  },
  // The floor of a wood: last year's leaves lying flat on one another, each its own brown, with
  // twigs across them and dark mould showing between.
  litter: {
    normalStrength: 4.5,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  vec2 warp = vec2(fbm(uv + 3.1, vec2(5.), 3, .5), fbm(uv + 7.7, vec2(5.), 3, .5));
  vec3 a = worleyId(uv * 12. + warp * 1.4, vec2(12.)), b = worleyId(uv * 21. + warp * 2. + 4.4, vec2(21.));
  float plateA = (.42 + .4 * a.z - a.x * .32) * smoothstep(.0, .08, a.y - a.x);
  float plateB = (.3 + .32 * b.z - b.x * .3) * smoothstep(.0, .09, b.y - b.x) * step(.25, b.z);
  float twig = smoothstep(.035, .0, abs(gnoise(vec2(uv.x * 3., uv.y * 11.) + 1.3, vec2(3., 11.)))) * step(.12, fbm(uv + 2., vec2(4.), 2, .5)) * .62;
  return clamp(max(max(plateA, plateB), twig) * .85 + fbm(uv, vec2(60.), 3, .6) * .07 + .07, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  vec2 warp = vec2(fbm(uv + 3.1, vec2(5.), 3, .5), fbm(uv + 7.7, vec2(5.), 3, .5));
  vec3 a = worleyId(uv * 12. + warp * 1.4, vec2(12.)), b = worleyId(uv * 21. + warp * 2. + 4.4, vec2(21.));
  float plateA = (.42 + .4 * a.z - a.x * .32) * smoothstep(.0, .08, a.y - a.x);
  float plateB = (.3 + .32 * b.z - b.x * .3) * smoothstep(.0, .09, b.y - b.x) * step(.25, b.z);
  float id = plateA >= plateB ? a.z : b.z;
  vec3 leaf = mix(vec3(.13, .085, .045), vec3(.3, .2, .09), fract(id * 5.3));
  leaf = mix(leaf, vec3(.27, .12, .05), step(.72, fract(id * 9.7)) * .7);
  leaf = mix(leaf, vec3(.31, .27, .14), step(.86, fract(id * 3.1)) * .6);
  float twig = smoothstep(.035, .0, abs(gnoise(vec2(uv.x * 3., uv.y * 11.) + 1.3, vec2(3., 11.)))) * step(.12, fbm(uv + 2., vec2(4.), 2, .5));
  vec3 mould = vec3(.045, .036, .026);
  albedo = mix(mould, leaf, smoothstep(.12, .24, max(plateA, plateB)));
  albedo = mix(albedo, vec3(.2, .16, .12), twig * .9) * (1. - cavity * .55);
  albedo *= .92 + hash21(floor(uv * 512.)) * .16;
  rough = .9;
}`,
  },
  // The ground under grass: a fine, fibrous mat with earth showing in the low places. No pattern
  // large enough to be seen repeating; the grass standing on it carries the look.
  // Dead grass lying in a mat: last year's blades and stems, pale straw, criss-crossed in every
  // direction in short strokes, with green coming up through it and dark gaps between.
  thatch: {
    normalStrength: 5.5,
    height: /* glsl */ `
// Blades lying every which way: each cell of a scattered grid holds one, at its own angle and
// length, centred somewhere in the cell. (Neighbours two cells off are looked at too, since a
// blade may be longer than a cell. The grid wraps, so that the picture tiles.)
float blades(vec2 uv, float n, float seed) {
  vec2 p = uv * n, i = floor(p);
  float m = 0.;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 c = i + vec2(float(x), float(y)), cw = mod(c, n);
    float h = hash21(cw + seed), k = hash21(cw + seed + 17.3);
    vec2 d = p - (c + vec2(h, k));
    float a = h * 18.85, len = mix(.7, 1.8, fract(k * 7.3));
    vec2 dir = vec2(cos(a), sin(a));
    float along = dot(d, dir), across = dot(d, vec2(-dir.y, dir.x));
    // A blade is widest at its middle and tapers to its ends, and is a little bent.
    across += along * along * (fract(h * 5.7) - .5) * .12;
    float width = .11 * (1. - along * along / (len * len));
    m = max(m, smoothstep(width, width * .3, abs(across)) * step(abs(along), len) * (.45 + .55 * fract(k * 3.1)));
  }
  return m;
}
float heightFn(vec2 uv) {
  float m = max(blades(uv, 22., 1.), max(blades(uv, 34., 7.) * .85, blades(uv, 52., 13.) * .7));
  return clamp(.16 + m * .72 + fbm(uv, vec2(9.), 3, .5) * .12, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float t = fbm(uv + 7.7, vec2(5.), 4, .55), g = fbm(uv + 2.2, vec2(13.), 3, .5);
  vec3 straw = mix(vec3(.36, .3, .17), vec3(.55, .48, .3), smoothstep(.25, .7, h + (t - .5) * .4));
  // Some of it still green, and some gone grey.
  straw = mix(straw, vec3(.2, .26, .1), smoothstep(.1, .5, g) * .45);
  straw = mix(straw, vec3(.42, .41, .36), smoothstep(.2, .55, -g) * .3);
  vec3 gap = vec3(.07, .06, .035);
  albedo = mix(gap, straw, smoothstep(.22, .4, h)) * (1. - cavity * .4) * (.92 + hash21(floor(uv * 512.)) * .16);
  rough = .93;
}`,
  },
  // Lime plaster: laid on by hand, so never quite flat; fine grit in it; a hairline crack here and
  // there. Nearly white, so the wash on a wall comes from the colour given to each point of it.
  plaster: {
    normalStrength: 2.2,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  float trowel = fbm(uv + 1.7, vec2(6.), 4, .55);
  float grit = fbm(uv + 5.1, vec2(90.), 2, .5);
  vec3 c = worleyId(uv * 5. + fbm(uv, vec2(4.), 2, .5) * .6, vec2(5.));
  float crack = (1. - smoothstep(.0, .006, c.y - c.x)) * step(.86, c.z);
  return clamp(.55 + (trowel - .5) * .3 + (grit - .5) * .1 - crack * .1, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float stain = fbm(uv + 9.3, vec2(3.), 4, .55), speck = hash21(floor(uv * 512.));
  albedo = vec3(.9, .89, .86) * (.88 + .14 * stain) * (1. - cavity * .4) * (.97 + .06 * speck);
  rough = .88;
}`,
  },
  // Brick in running bond, brown: nine bricks across the picture and twenty-six courses up it, which at the half a texture to the metre
  // that building faces are laid at is a brick of twenty-two centimetres by seven and a half with its joint. The mortar is a little
  // recessed and pale; the bricks are each their own brown, now and then one burnt darker or fired paler, mottled within, their arrises
  // a little worn; and the whole is darkened in long streaks where rain runs down it. The colour is the brick's own: what a building's
  // points carry tints it.
  brick: {
    normalStrength: 4.5,
    height: /* glsl */ `
vec4 brickAt(vec2 uv) {
  float rows = 26., cols = 9.;
  float row = floor(uv.y * rows), fy = fract(uv.y * rows);
  float x = uv.x * cols + mod(row, 2.) * .5, col = mod(floor(x), cols), fx = fract(x);
  // (How far in from the brick's edge, in metres: a course is 2/26 of a metre high, a brick 2/9 long.)
  float d = min(min(fy, 1. - fy) * (2. / rows), min(fx, 1. - fx) * (2. / cols));
  return vec4(col, row, d, hash21(vec2(col, row) + 1.7));
}
float heightFn(vec2 uv) {
  vec4 b = brickAt(uv);
  float wear = fbm(uv + b.w * 9.1, vec2(30., 80.), 3, .5) * .0018;
  float face = smoothstep(.0045, .0085, b.z + wear);
  float own = (b.w - .5) * .08 + fbm(uv + 3.3, vec2(36., 104.), 3, .5) * .06;
  float mortar = .3 + fbm(uv + 7.7, vec2(72., 208.), 2, .5) * .05;
  return clamp(mix(mortar, .72 + own, face), 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  vec4 b = brickAt(uv);
  float r2 = hash21(vec2(b.x, b.y) + 8.4), r3 = hash21(vec2(b.x, b.y) + 13.1);
  vec3 brick = mix(vec3(.27, .15, .095), vec3(.43, .25, .15), b.w);
  brick = mix(brick, vec3(.17, .1, .075), step(.86, r2) * .85);
  brick = mix(brick, vec3(.5, .34, .22), step(.93, r3) * .65);
  brick *= .88 + .24 * smoothstep(-.3, .3, fbm(uv + b.w * 5.3, vec2(18., 52.), 3, .5));
  vec3 mortar = vec3(.55, .52, .47) * (.9 + .16 * smoothstep(-.3, .3, fbm(uv + 2.2, vec2(40., 116.), 2, .5)));
  float isBrick = smoothstep(.0045, .0075, b.z);
  vec3 c = mix(mortar, brick, isBrick);
  // (Rain runs down a wall in long streaks, darkening it.)
  c *= .82 + .18 * smoothstep(-.35, .25, fbm(vec2(uv.x, uv.y * .15) + 4.4, vec2(14., 1.), 3, .5));
  albedo = c * (1. - cavity * .35) * (.95 + .1 * hash21(floor(uv * 512.)));
  rough = mix(.94, .86, isBrick);
}`,
  },
  // Coursed rubble, as the walls and towers of a castle are built: stones of many sizes, roughly squared and hammer-dressed, laid in
  // rough courses some third of a metre high in a lime mortar; their joints waver and their corners are knocked off, a few stand proud
  // or sit back; each stone warmer or cooler, lighter or darker, a few dark and a few stained ochre, with specks of lichen; the mortar
  // raked back and a little grimy. Pale, so the vertex tint sets the stone's colour. (For what is built of plain solids: the house's
  // masonry is laid block by block, and is drawn with the dressed stone above.) (It was courses all forty centimetres high, two to
  // four stones in each, every stone the same grey, clean-edged and flat: a grid, which made the castle look drawn rather than built;
  // and then courses of their own heights with stones of their own lengths, which still read as brick.)
  castle: {
    normalStrength: 1.9,
    height: /* glsl */ `
vec4 blockAt(vec2 uv) {
  // Coursed rubble: each stone the cell of a lattice of points, eight along and twelve up to the picture's four metres, each point
  // moved about in its cell (more along the course than across it, so the courses hold), and some stones grown larger than their
  // neighbours (a cell's distance is less its own weight), so that stones are of many sizes and their joints are anything but
  // straight. (A grid of rectangles, however uneven, read as brick.) (The picture is four metres, not two, and is laid in patches
  // from different places in it, so that a wall does not repeat: see laidUnrepeated in siteMaterial.ts.)
  vec2 cells = vec2(8., 12.), g = uv * cells, ip = floor(g), fp = fract(g);
  float d1 = 9., d2 = 9.; vec2 best = vec2(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)), cell = mod(ip + o, cells), h = hash22(cell + 3.1);
    vec2 pt = (o + vec2(.5 + (h.x - .5) * .75, .5 + (h.y - .5) * .3) - fp) * (vec2(4.) / cells);
    float d = length(pt) - hash21(cell + 6.7) * .09;
    if (d < d1) { d2 = d1; d1 = d; best = cell; } else if (d < d2) d2 = d;
  }
  // (Half the gap between the two nearest is about how far in from the stone's edge, in metres.)
  return vec4(best.x, best.y, (d2 - d1) * .5, hash21(best + 1.7));
}
float heightFn(vec2 uv) {
  vec4 b = blockAt(uv);
  // (The joint wavers: hammer-dressed stone has no straight edge.)
  float wear = (fbm(uv + b.w * 9.1, vec2(28., 68.), 3, .5) - .5) * .05 + fbm(uv * 3. + b.w, vec2(120.), 2, .5) * .012;
  float face = smoothstep(.006, .034, b.z + wear);
  // (Faces split and dressed flat, with only a little rounding to their edges: domed more, each stone was a cushion.)
  float dome = smoothstep(0., .1, b.z + wear * .5) * .07;
  float rough = fbm(uv + b.w * 3.7, vec2(44.), 4, .55) * .2 + gnoise(vec2(uv.x * 92., uv.y * 192.), vec2(92., 192.)) * .05;
  // (A stone in a few stands proud of the course, and one in a few sits back.)
  float own = (b.w - .5) * .12 + (step(.86, hash21(vec2(b.x, b.y) + 21.3)) - step(.9, hash21(vec2(b.x, b.y) + 33.1))) * .1;
  float mortar = .16 + fbm(uv + 7.7, vec2(128.), 3, .5) * .1;
  return clamp(mix(mortar, .52 + dome + rough + own, face), 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  vec4 b = blockAt(uv);
  float r2 = hash21(vec2(b.x, b.y) + 8.4), r3 = hash21(vec2(b.x, b.y) + 15.9), r4 = hash21(vec2(b.x, b.y) + 27.2);
  // Each stone its own: warmer or cooler, lighter or darker; a few much darker, a few stained ochre with iron.
  vec3 warm = vec3(.76, .7, .62), cool = vec3(.64, .66, .67);
  vec3 stone = mix(cool, warm, r3) * (.8 + .32 * b.w);
  stone = mix(stone, vec3(.46, .44, .42), step(.84, r2) * .75);
  stone = mix(stone, vec3(.72, .58, .4), step(.9, r4) * .55);
  // (Within a stone: mottled.) (The noise is asked at whole multiples of the texture's breadth only, so that it tiles.)
  stone *= .86 + .22 * smoothstep(-.3, .3, fbm(uv + b.w * 5.3, vec2(58., 136.), 4, .55));
  float stain = smoothstep(.1, .5, fbm(uv + 13.7, vec2(8.), 4, .55));
  stone = mix(stone, vec3(.55, .48, .38), stain * .3);
  // Specks of lichen, pale grey-green and yellow, on some stones.
  float lichen = smoothstep(.72, .8, fbm(uv + b.w * 2.1, vec2(96., 192.), 3, .55)) * step(.55, r4);
  stone = mix(stone, mix(vec3(.75, .76, .62), vec3(.72, .64, .32), step(.5, r2)), lichen * .55);
  vec3 mortar = vec3(.62, .59, .54) * (.8 + .2 * smoothstep(-.3, .3, fbm(uv + 2.2, vec2(60.), 3, .5)));
  float isStone = smoothstep(.006, .03, b.z);
  vec3 c = mix(mortar, stone, isStone);
  // (Rain runs down a wall in long streaks, darkening it.) (One cell of the noise from the picture's foot to its head, so that the
  // streaks are long and the picture still meets itself above and below: squeezed upright by a fraction, it did not.)
  c *= .8 + .2 * smoothstep(-.35, .25, fbm(uv + 4.4, vec2(20., 1.), 3, .5));
  albedo = c * (1. - cavity * .4) * (.94 + .12 * hash21(floor(uv * 1024.)));
  rough = mix(.96, .88, isStone);
}`,
  },
  // Clay roof tiles of the flat round-ended kind, hung in rows, each row lapping the one below
  // and set half a tile along from it. No two are quite the same red, and some have gone dark.
  tile: {
    normalStrength: 6.5,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  float row = floor(uv.y * 8.), fy = fract(uv.y * 8.);
  float x = uv.x * 6. + mod(row, 2.) * .5, fx = fract(x) - .5;
  // The lower end of each tile is round, and shows the tile under it at its corners.
  float body = smoothstep(.0, .07, fy - (.5 - sqrt(max(.25 - fx * fx, 0.))) * .5) * smoothstep(.0, .05, .5 - abs(fx));
  float id = hash21(vec2(floor(x), row) + 3.);
  return clamp((.3 + .5 * (1. - fy) + (id - .5) * .08) * body + .08 + fbm(uv, vec2(48.), 2, .5) * .06, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float row = floor(uv.y * 8.);
  float x = uv.x * 6. + mod(row, 2.) * .5;
  float id = hash21(vec2(floor(x), row) + 3.), worn = fbm(uv + 4.2, vec2(5.), 4, .55);
  vec3 clay = mix(vec3(.5, .2, .12), vec3(.74, .37, .22), id);
  clay = mix(clay, vec3(.3, .2, .16), step(.82, fract(id * 7.3)) * .7);
  clay = mix(clay, vec3(.36, .34, .26), smoothstep(.55, .8, worn) * .45);
  albedo = clay * (1. - cavity * .6) * (.94 + .1 * hash21(floor(uv * 512.)));
  rough = .82;
}`,
  },
  // Brick of two clays: red, from clays with iron in them as along the Baltic, and buff, from clays with lime in them (see
  // `brickRecipe`). Which a town has is the country's: `brickCountry` in `src/core/brick.ts`.
  redBrick: brickRecipe({ low: [0.27, 0.075, 0.045], high: [0.42, 0.15, 0.085], hard: [0.13, 0.05, 0.04], soft: [0.5, 0.24, 0.12] }),
  buffBrick: brickRecipe({ low: [0.46, 0.33, 0.17], high: [0.62, 0.48, 0.28], hard: [0.3, 0.2, 0.12], soft: [0.68, 0.6, 0.44] }),
  ground: {
    normalStrength: 3.5,
    height: /* glsl */ `
float heightFn(vec2 uv) {
  float clump = fbm(uv + 4.2, vec2(7.), 4, .55);
  float thatch = gnoise(vec2(uv.x * 40., uv.y * 110.), vec2(40., 110.)) * .5 + gnoise(vec2(uv.x * 120., uv.y * 46.), vec2(120., 46.)) * .5;
  float fine = fbm(uv, vec2(90.), 3, .6);
  return clamp(.5 + clump * .55 + thatch * .22 + fine * .16, 0., 1.);
}`,
    surface: /* glsl */ `
void surfaceFn(vec2 uv, float h, float cavity, out vec3 albedo, out float rough) {
  float t = fbm(uv + 5.5, vec2(5.), 4, .55);
  vec3 grass = mix(vec3(.05, .095, .022), vec3(.10, .17, .035), smoothstep(.3, .75, h));
  grass = mix(grass, vec3(.19, .2, .06), smoothstep(.1, .45, t) * .45);
  vec3 earth = vec3(.11, .085, .05);
  albedo = mix(grass, earth, smoothstep(.42, .26, h) * .8) * (1. - cavity * .35);
  rough = .96;
}`,
  },
};

function fragmentSource(r: Recipe): string {
  return /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform int uMode;
uniform float uTexel;
${NOISE}
${r.height}
${r.surface}
void main() {
  float h = heightFn(vUv);
  float e = uTexel;
  float hl = heightFn(vUv - vec2(e, 0.)), hr = heightFn(vUv + vec2(e, 0.));
  float hd = heightFn(vUv - vec2(0., e)), hu = heightFn(vUv + vec2(0., e));
  // Cavity: how far this point sits below its wider surroundings.
  float e2 = e * 6.;
  float around = .25 * (heightFn(vUv - vec2(e2, 0.)) + heightFn(vUv + vec2(e2, 0.))
                      + heightFn(vUv - vec2(0., e2)) + heightFn(vUv + vec2(0., e2)));
  float cavity = clamp((around - h) * 5., 0., 1.);
  if (uMode == 0) {
    vec3 albedo; float rough;
    surfaceFn(vUv, h, cavity, albedo, rough);
    gl_FragColor = vec4(albedo, h);
  } else if (uMode == 1) {
    vec3 n = normalize(vec3((hl - hr) * ${r.normalStrength.toFixed(2)}, (hd - hu) * ${r.normalStrength.toFixed(2)}, 2. * e * 512.));
    gl_FragColor = vec4(n * .5 + .5, 1.);
  } else {
    vec3 albedo; float rough;
    surfaceFn(vUv, h, cavity, albedo, rough);
    gl_FragColor = vec4(1. - cavity * .7, rough, 0., 1.);
  }
}`;
}

/**
 * The recipes are small programs written for WebGL, and are still painted with it, though
 * everything else is now drawn with WebGPU: a WebGL renderer of their own, on a canvas nobody
 * sees, paints each picture, the picture is read back, and it is handed on as plain data that
 * either kind of renderer can use. It is made when first wanted and thrown away by `doneGenerating`.
 */
let painter: WebGLRenderer | null = null;
export function doneGenerating(): void {
  painter?.dispose();
  painter?.forceContextLoss();
  painter = null;
}

export function generateTextureSet(recipe: keyof typeof RECIPES, size: number, seed: number): TextureSet {
  const renderer = (painter ??= new WebGLRenderer({ canvas: document.createElement('canvas'), antialias: false }));
  const r = RECIPES[recipe];
  const material = new ShaderMaterial({
    uniforms: { uMode: { value: 0 }, uTexel: { value: 1 / size }, uSeed: { value: seed } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: fragmentSource(r),
    depthTest: false,
    depthWrite: false,
  });
  const scene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pixels: Uint8Array[] = [];
  const render = (mode: number, srgb: boolean): Texture => {
    // (A colour picture is kept as colours are kept in a file, which is how it comes back when read.)
    const rt = new WebGLRenderTarget(size, size, { format: RGBAFormat, type: UnsignedByteType, depthBuffer: false, generateMipmaps: false, colorSpace: srgb ? SRGBColorSpace : NoColorSpace });
    material.uniforms.uMode.value = mode;
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const data = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, data);
    renderer.setRenderTarget(null);
    rt.dispose();
    pixels.push(data);
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  renderer.toneMapping = 0;
  const set = { map: render(0, true), normalMap: render(1, false), ormMap: render(2, false), pixels, size };
  material.dispose();
  quad.geometry.dispose();
  return set;
}
