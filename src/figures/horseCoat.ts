import { Color, Vector3 } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/**
 * A horse's coat as hair (asked: "improve for desktop player the horse material, now it looks like modelling clay shiny, now textured
 * like real horse would be"): on a computer's picture, in place of the plain coat of `horse.ts`, whose one smooth shine over one smooth
 * colour made the horse look modelled in clay.
 *
 * A horse's coat is short hair lying one way over the whole of it: back along the barrel and a little down, down the neck from the
 * crest, down the face to the muzzle, straight down the legs. Seen near, it is streaked along that lie, strand by strand and in the
 * locks the hair lies in; seen from further off, its colour still varies a little in patches over the muscles. And it does not shine as
 * a smooth thing does, in one bright spot, but softly, over the whole of a side turned to the light, the hair catching it most where
 * it is seen along its length (a sheen, as velvet has). So here: the streaks drawn from noise stretched along the way the hair lies,
 * at two sizes, the single hairs and the locks, each faded out where the picture is too coarse to show it (it would only flicker);
 * the coat's colour (the bay of `horseBody.ts`, its black points and its muzzle, given per point) made lighter and darker along them,
 * the lighter hair warmer, and in broad patches; the surface's slope ruffled by them, so that what light it catches is streaked too;
 * a rougher, weaker shine; and a sheen of the coat's own colour, lightened.
 *
 * Read where each point of the coat lies on the horse as it stands (its points before the skeleton moves them), so that the hair
 * stays where it grows whatever the horse does.
 */
// (The library's own types for these pieces want every step to say whether it is one number or three; taken untyped, as in
// `src/render/siteMaterial.ts`.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const {
  abs, cross, dFdx, dFdy, dot, float, fwidth, length, mix, mx_noise_float, normalViewGeometry, normalize, positionGeometry, positionView, sign,
  smoothstep, vec3, vec4, vertexColor,
} = TSL as N;

export function horseCoatMaterial(): MeshPhysicalNodeMaterial {
  const m = new MeshPhysicalNodeMaterial({ vertexColors: true, color: new Color(1, 1, 1), roughness: 0.66, metalness: 0 });
  const p: N = positionGeometry;
  // The way the hair lies, as the horse stands (forward +z, up +y): back and a little down over the body; down and back from the
  // crest on the neck; down the face to the muzzle; down the legs. Each part's own, one way over the whole of it, and the parts'
  // streaks blended where they meet. (One way bent about over the surface, the noise read along it was torn up wherever it bent,
  // as the noise is read a long way out along it: the coat came out pebbled, as leather is.)
  const head: N = smoothstep(1.0, 1.14, p.z).mul(smoothstep(1.38, 1.56, p.y));
  const legs: N = smoothstep(0.95, 0.68, p.y);
  const neck: N = smoothstep(0.5, 0.82, p.z).mul(smoothstep(1.28, 1.48, p.y)).mul(float(1).sub(head)).mul(float(1).sub(legs));
  const face: N = head.mul(float(1).sub(legs));
  const parts: [N, Vector3][] = [
    [float(1).sub(legs).sub(neck).sub(face).max(0), new Vector3(0, -0.35, -1)], [neck, new Vector3(0, -1, -0.5)],
    [face, new Vector3(0, -0.68, 0.74)], [legs, new Vector3(0, -1, 0)],
  ];
  // How much of the coat one point of the picture covers, in metres: what is finer than about two points across is not drawn.
  const coarse: N = length(fwidth(p)).toVar();
  const shown = (across: number): N => float(1).sub(smoothstep(0.2, 0.55, coarse.mul(across))).toVar();
  const seen = { hairs: shown(240), locks: shown(70), brushed: shown(24) };
  /** Noise streaked along `lie`: `across` waves a metre across it, `lengthwise` along it. From -1 to 1, about. */
  const streaks = (lie: Vector3, across: number, lengthwise: number, seed: number): N => {
    const l = lie.clone().normalize(), along: N = vec3(l.x, l.y, l.z);
    return mx_noise_float(p.mul(across).sub(along.mul(dot(p, along).mul(across - lengthwise))).add(seed));
  };
  // The hairs, some four millimetres across and five centimetres long; the locks they lie in, some fifteen millimetres and twenty;
  // and the way the coat is brushed, some four centimetres and forty (the most of it seen from where it is ridden).
  const hairOf = (lie: Vector3): N => streaks(lie, 240, 18, 0).mul(seen.hairs).mul(0.45)
    .add(streaks(lie, 70, 5, 17.3).mul(seen.locks).mul(0.4)).add(streaks(lie, 24, 2.2, 41.9).mul(seen.brushed).mul(0.3));
  const hair: N = parts.reduce((sum: N, [w, lie]) => sum.add(hairOf(lie).mul(w)), float(0)).toVar();
  // Broad patches over the muscles, a hand or two across.
  const patches: N = mx_noise_float(p.mul(3.1).add(5.1)).mul(0.65).add(mx_noise_float(p.mul(7.7).add(11.3)).mul(0.35));
  // (Lighter along the lighter hair and warmer, as a bay's hair is redder and more golden at its tips; times the coat's colour.)
  m.colorNode = vec4(vec3(1).add(hair.mul(vec3(0.6, 0.5, 0.38))).add(patches.mul(0.1)), 1);
  // Its shine: broken up along the hair, the lighter hair glossier and the darker rougher, so that the light it catches is streaked
  // as a groomed coat's is, not one smooth spot; and a sheen, as short hair has, of the coat's own colour, browner.
  m.roughnessNode = float(0.58).sub(hair.mul(0.3));
  m.specularIntensityNode = float(0.8);
  m.sheenNode = mix(vertexColor().rgb, vec3(0.1, 0.075, 0.055), 0.45);
  m.sheenRoughnessNode = float(0.38);
  // The surface ruffled by the hair: its slope bent by how the streaks rise and fall across the picture, as a bump map bends it
  // (the coat lifted a millimetre or two along the lighter hair).
  const rise: N = hair.mul(0.0016);
  const dx: N = dFdx(positionView), dy: N = dFdy(positionView), nv: N = normalViewGeometry;
  const r1: N = cross(dy, nv), r2: N = cross(nv, dx), det: N = dot(dx, r1);
  const grad: N = sign(det).mul(dFdx(rise).mul(r1).add(dFdy(rise).mul(r2)));
  m.normalNode = normalize(abs(det).mul(nv).sub(grad));
  return m;
}
