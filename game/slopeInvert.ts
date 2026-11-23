/**
 * The run's end, a sixth way (asked: "an earth inverting shock where the peaks inverts into a valley and player can ride back to the
 * "top" and when they reach it, the world inverts back to normal"): the land drawn so that it may be turned inside out, its heights
 * mirrored about a level, a fold rolling out across it from a point like a shock through the ground, a glowing seam along its front.
 *
 * The land's own meshes (`slopeLand.ts`) are not turned: their heights are laid down once, and parts of them are sunk under finer
 * parts over them so that no seam shows, which turned over would stand above them. So the land is drawn again for it, more simply,
 * from the same heights: the run and some way either side of it every two metres, laid along the run; the country about it every
 * twenty, out to some kilometres, sunk a little under the run's. Each point keeps its own height, and is lifted where the fold has it
 * on the graphics card, its light turned as the slope it lies on is. The page says how the land is folded (`Fold`), and folds the
 * snow it rides on as this does (`heightIn`).
 */
import { BufferAttribute, BufferGeometry, Color, Group, Mesh, type Texture, Vector2 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, clamp as clampNode, distance, exp, float, mix, normalGeometry, normalize, positionGeometry, smoothstep, texture, transformNormalToView, uniform, uv, vec3 } from 'three/tsl';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/**
 * How the land is folded: the height each point has before the fold reaches it (`from`) and after (`to`), each as a height `h` of the
 * land's own made `k * h + c`; the fold's middle (`x`, `z`), how far out its front has gone, and how wide it is; how brightly its seam
 * glows; and how far the snow is tinged as a world turned inside out is.
 */
export interface Fold { from: [number, number]; to: [number, number]; x: number; z: number; front: number; width: number; glow: number; tinge: number }

/** How far the fold has turned the land at (`x`, `z`), 0 not yet to 1 wholly: the same sum as the graphics card does. */
export function foldAt(f: Fold, x: number, z: number) {
  if (f.front === Infinity) return 1;
  const d = Math.hypot(x - f.x, z - f.z);
  return 1 - smooth((d - (f.front - f.width)) / f.width);
}
/** A height `h` of the land's own, as the fold has it at (`x`, `z`). */
export function heightIn(f: Fold, h: number, x: number, z: number) {
  const k = foldAt(f, x, z), a = f.from[0] * h + f.from[1], b = f.to[0] * h + f.to[1];
  return a + (b - a) * k;
}

/** What the land is drawn from: its heights; and its run, how long, how far either side its snow reaches, and where a point of it is. */
export interface FoldSource { height(x: number, z: number): number; length: number; half: number; at(s: number, left: number): { x: number; z: number }; edges(s: number): [number, number] }

export class Folding {
  readonly group = new Group();
  private builtFor: object | null = null;
  private readonly paint: MeshStandardNodeMaterial;
  private readonly uFrom = uniform(new Vector2(1, 0));
  private readonly uTo = uniform(new Vector2(1, 0));
  private readonly uMiddle = uniform(new Vector2());
  private readonly uFront = uniform(0);
  private readonly uWidth = uniform(100);
  private readonly uGlow = uniform(0);
  private readonly uTinge = uniform(0);

  /** Drawn with `snow`, loose snow, and on the run's groomed path `piste`, its corduroy laid along the run. */
  constructor(snow: Texture, piste: Texture) {
    // Each point lifted where the fold has it; its normal's tilt scaled as the slope under it is (mirrored, turned the other way); the
    // snow's grain, darker in hollows and lighter on ridges (a hollow turned over is a ridge); tinged, turned inside out, a cold violet;
    // and a seam of light along the fold's front.
    const paint = new MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92 });
    const h = positionGeometry.y, d = distance(positionGeometry.xz, this.uMiddle);
    const k = float(1).sub(smoothstep(this.uFront.sub(this.uWidth), this.uFront, d));
    const lift = mix(this.uFrom.x.mul(h).add(this.uFrom.y), this.uTo.x.mul(h).add(this.uTo.y), k).sub(attribute('aSink', 'float'));
    paint.positionNode = vec3(positionGeometry.x, lift, positionGeometry.z);
    const tilt = mix(this.uFrom.x, this.uTo.x, k), n = normalGeometry;
    paint.normalNode = transformNormalToView(normalize(vec3(n.x.mul(tilt), n.y, n.z.mul(tilt))));
    // (Laid with its own colour, the snow's picture went unseen, and the land was one flat white.)
    const shown = attribute('aHollow', 'float').mul(tilt), shade = float(1).sub(clampNode(shown.mul(9), -0.25, 1).mul(0.32));
    // (The run's groomed path in its corduroy, laid along the run as it was: all of it plain, nothing showed going along it.)
    const grain = mix(texture(snow, uv()).rgb, texture(piste, uv()).rgb, attribute('aGroomed', 'float'));
    paint.colorNode = grain.mul(mix(vec3(1, 1, 1), vec3(0.84, 0.82, 1.0), this.uTinge)).mul(shade);
    // (Along the fold's leading edge, where the land is beginning to move.)
    const seam = d.sub(this.uFront.sub(this.uWidth.mul(0.12))).div(this.uWidth.mul(0.06));
    paint.emissiveNode = vec3(0.55, 0.85, 1.7).mul(this.uGlow).mul(exp(seam.mul(seam).negate()));
    this.paint = paint;
    this.group.visible = false;
    this.group.name = 'folding';
  }

  /**
   * Drawn for the land `key`, from `source`, if it is not already; the sheets it was drawn with before handed back, taken out, for the
   * caller to let go of when the renderer is done with them (their shapes and the meshes themselves: their shapes alone let go of, the
   * renderer kept the meshes, and the shapes' points with them, a land's worth each time the land was changed).
   */
  build(key: object, source: FoldSource): Mesh[] {
    if (this.builtFor === key) return [];
    this.builtFor = key;
    const old = [...this.group.children] as Mesh[];
    for (const m of old) m.removeFromParent();
    const H = source.height, white = new Color(0.9, 0.92, 0.96), rock = new Color(0.33, 0.32, 0.31), c = new Color();
    /**
     * A sheet of `nu` by `nv` points, each where `place` puts it and its picture laid as `lay` says; groomed white where `groomed` says,
     * else snow or rock by how steep.
     */
    const sheet = (nu: number, nv: number, place: (i: number, j: number) => { x: number; z: number }, lay: (i: number, j: number, x: number, z: number) => [number, number], sink: number, groomed: (i: number, j: number) => boolean) => {
      const n = nu * nv, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uvs = new Float32Array(n * 2), sinks = new Float32Array(n).fill(sink), hollows = new Float32Array(n), groom = new Float32Array(n);
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const k = j * nu + i, { x, z } = place(i, j), y = H(x, z);
        const gx = (H(x + 1.5, z) - H(x - 1.5, z)) / 3, gz = (H(x, z + 1.5) - H(x, z - 1.5)) / 3, l = Math.hypot(gx, 1, gz);
        pos.set([x, y, z], k * 3); nor.set([-gx / l, 1 / l, -gz / l], k * 3); uvs.set(lay(i, j, x, z), k * 2);
        const steep = (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI;
        // (How much of a hollow it lies in, over some metres about it: as much as the land about stands over it, for each metre out.)
        const r = sink ? 40 : 6;
        hollows[k] = ((H(x + r, z) + H(x - r, z) + H(x, z + r) + H(x, z - r)) / 4 - y) / r;
        c.copy(white);
        if (groomed(i, j)) groom[k] = 1;
        else c.lerp(rock, smooth((steep - 32) / 14));
        col.set([c.r, c.g, c.b], k * 3);
      }
      const index: number[] = [];
      for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, e = a + nu, f = e + 1; index.push(a, e, b, b, e, f); }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3));
      g.setAttribute('normal', new BufferAttribute(nor, 3));
      g.setAttribute('color', new BufferAttribute(col, 3));
      g.setAttribute('uv', new BufferAttribute(uvs, 2));
      g.setAttribute('aSink', new BufferAttribute(sinks, 1));
      g.setAttribute('aHollow', new BufferAttribute(hollows, 1));
      g.setAttribute('aGroomed', new BufferAttribute(groom, 1));
      g.setIndex(index);
      const mesh = new Mesh(g, this.paint);
      mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      return mesh;
    };
    // The run and sixty metres either side of its snow, every two metres along it and across it.
    const L = source.length, S0 = -120, S1 = L + 120, W = source.half + 60, STEP = 2;
    const nu = Math.round((2 * W) / STEP) + 1, nv = Math.round((S1 - S0) / STEP) + 1;
    const run = sheet(nu, nv, (i, j) => source.at(S0 + j * STEP, -W + i * STEP), (i, j) => [(-W + i * STEP) / 9, (S0 + j * STEP) / 9], 0, (i, j) => { const s = S0 + j * STEP, [lo, hi] = source.edges(clamp(s, 0, L)), left = -W + i * STEP; return s > -4 && s < L + 4 && left > lo - 1 && left < hi + 1; });
    // The country about it, every thirty metres for six kilometres every way from the run's middle, out to where the haze is whole;
    // sunk three under the run's.
    const mid = source.at(L / 2, 0), R = 6000, CELL = 30, nc = Math.round((2 * R) / CELL) + 1;
    const country = sheet(nc, nc, (i, j) => ({ x: mid.x - R + i * CELL, z: mid.z - R + j * CELL }), (_i, _j, x, z) => [x / 23, z / 23], 3, () => false);
    this.group.add(country, run);
    return old;
  }

  set(f: Fold) {
    this.uFrom.value.set(f.from[0], f.from[1]);
    this.uTo.value.set(f.to[0], f.to[1]);
    this.uMiddle.value.set(f.x, f.z);
    // (Gone out past everything, held far beyond it: the card's sums are in single precision.)
    this.uFront.value = f.front === Infinity ? 1e6 : f.front;
    this.uWidth.value = f.width;
    this.uGlow.value = f.glow;
    this.uTinge.value = f.tinge;
  }
  show(on: boolean) { this.group.visible = on; }
}
