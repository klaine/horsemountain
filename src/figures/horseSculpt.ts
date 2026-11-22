import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';

/**
 * The horse's body as one solid (asked: "improve horse skeleton and skin further - the butt and how legs attach to horse body look
 * weird"). Lofted as tubes, the legs had only crossed the trunk where they met it, the quarters had ended in a ball over thin legs with
 * nothing behind them, and the forearms had come straight out from under the chest. A horse's body is masses grown into one another:
 * so here it is made as rock is carved in the game, from a function that says how far any point is outside it, and the surface
 * extracted with marching cubes. The function is the smooth union of rounded masses, each named for what it is on a horse: the barrel,
 * the ribcage, the breast, the withers, the loin and the croup, the points of the buttocks; on each side the quarter and thigh, from
 * the croup over the stifle and down the back of the thigh (the hamstring) into the gaskin and the hock; the shoulder from the
 * withers down to the point of the shoulder, the upper arm, the point of the elbow and the forearm down towards the knee; and the
 * neck, from the withers to behind the poll, crested. Where two masses meet they are blended over a few centimetres, so that the thigh
 * grows out of the quarter and the forearm out of the breast and the elbow, as a horse's do.
 *
 * Each point of the surface is moved by the bones of the masses it was made of: each mass names its bones (shared along it where it
 * spans a joint), and a point near where two masses meet takes both masses' bones, shared as nearly as it lies to each. The legs below
 * the knees and the hocks, the head, ears, eyes and hair are made as before (`horseBody.ts`) and overlap this where they join it.
 */

/** A rounded mass: its middle, the way its length lies, its half-breadth, half-length and half-depth; how far it is blended into what is made before it; and the bones that move each point of it. */
export interface Mass { c: Vector3; along: Vector3; r: [number, number, number]; blend: number; bones: (p: Vector3) => [string, number][]; name: string }

const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const X = new Vector3(1, 0, 0);

/** The masses of a horse's body, on the skeleton `rest` gives the joints of. */
export function horseMasses(rest: (n: string) => Vector3): Mass[] {
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z), out: Mass[] = [];
  const add = (name: string, c: Vector3, along: Vector3, r: [number, number, number], blend: number, bones: Mass['bones']) => out.push({ name, c, along: along.clone().normalize(), r, blend, bones });
  const along = (a: Vector3, b: Vector3) => b.clone().sub(a);
  /** Shared along the trunk by the hips, the spine and the chest. */
  const trunk = (p: Vector3): [string, number][] => {
    const z = p.z;
    if (z <= -0.45) return [['hips', 1]];
    if (z >= 0.45) return [['chest', 1]];
    if (z < 0) { const t = smooth((z + 0.45) / 0.45); return [['hips', 1 - t], ['spine', t]]; }
    const t = smooth(z / 0.45);
    return [['spine', 1 - t], ['chest', t]];
  };
  /** Shared between two bones by how far along from `a` to `b` a point is, `from` to `to` of the way. */
  const between = (a: Vector3, b: Vector3, boneA: string, boneB: string, from = 0.3, to = 0.7) => (p: Vector3): [string, number][] => {
    const d = b.clone().sub(a), t = smooth((p.clone().sub(a).dot(d) / d.lengthSq() - from) / (to - from));
    return [[boneA, 1 - t], [boneB, t]];
  };
  const Z = V(0, 0, 1);
  // The trunk.
  add('barrel', V(0, 1.19, 0.02), Z, [0.275, 0.57, 0.33], 0, trunk);
  add('ribcage', V(0, 1.26, 0.37), Z, [0.25, 0.33, 0.33], 0.08, trunk);
  add('breast', V(0, 1.15, 0.56), Z, [0.195, 0.18, 0.18], 0.08, () => [['chest', 1]]);
  add('withers', V(0, 1.47, 0.36), V(0, 0.3, 1), [0.09, 0.24, 0.12], 0.08, () => [['chest', 1]]);
  add('loin', V(0, 1.42, -0.22), Z, [0.2, 0.3, 0.13], 0.08, trunk);
  add('croup', V(0, 1.34, -0.55), Z, [0.245, 0.27, 0.22], 0.08, () => [['hips', 1]]);
  // (The points of the buttocks no further back than over the points of the hocks, as a horse's are: further back and larger, they had
  // made the quarters one great ball reaching out behind the legs.)
  for (const s of [1, -1]) add('buttock', V(0.1 * s, 1.24, -0.68), V(0, -0.3, 1), [0.12, 0.13, 0.19], 0.06, () => [['hips', 1]]);
  // The neck, crested above, from the withers to behind the poll: many masses along a smooth line, each overlapping the next well, so
  // that it is one smooth neck rather than a string of beads; the crest a second string along its top.
  {
    const keys = [V(0, 1.3, 0.52), V(0, 1.45, 0.7), V(0, 1.61, 0.85), V(0, 1.78, 0.97), V(0, 1.93, 1.06)];
    const R: [number, number, number][] = [[0.2, 0.2, 0.26], [0.17, 0.2, 0.225], [0.14, 0.18, 0.19], [0.12, 0.16, 0.16], [0.1, 0.13, 0.13]];
    const bonesAt = (u: number): [string, number][] => u < 1 ? [['chest', 1 - u * 0.6], ['neck1', u * 0.6]] : u < 2.2 ? [['neck1', 1]] : u < 3 ? [['neck1', (3 - u) / 0.8], ['neck2', (u - 2.2) / 0.8]] : u < 3.6 ? [['neck2', 1]] : [['neck2', 1 - (u - 3.6) * 0.9], ['head', (u - 3.6) * 0.9]];
    const n = 16;
    for (let q = 0; q <= n; q++) {
      const u = (q / n) * (keys.length - 1), i = Math.min(keys.length - 2, Math.floor(u)), t = u - i;
      const c = keys[i].clone().lerp(keys[i + 1], t), dir = keys[i + 1].clone().sub(keys[i]).normalize(), crest = X.clone().cross(dir).negate().normalize();
      const r = R[i].map((v, a) => v + (R[i + 1][a] - v) * t) as [number, number, number];
      add('neck', c, dir, [r[0], 0.13, r[2]], 0.05, () => bonesAt(u));
      if (u > 0.6 && u < 3.7) add('crest', c.clone().addScaledVector(crest, r[2] * 0.5), dir, [r[0] * 0.6, 0.12, r[2] * 0.5], 0.05, () => bonesAt(u));
    }
  }
  for (const [k, s] of [['l', 1], ['r', -1]] as const) {
    const j = (n: string) => rest(n);
    // The quarter and the thigh: from the croup down over the stifle in front and the hamstring behind, into the gaskin.
    const hip = j(`h_up_${k}`), stifle = j(`h_mid_${k}`), hock = j(`h_low_${k}`);
    const thighBones = (p: Vector3): [string, number][] => {
      const up = smooth((p.y - 1.05) / 0.25), low = smooth((0.86 - p.y) / 0.16);
      return [['hips', up * (1 - low)], [`h_up_${k}`, (1 - up) * (1 - low)], [`h_mid_${k}`, low]];
    };
    // The haunch, broad, and under it the lower thigh, narrower, tapering into the gaskin: one mass from the croup to below the stifle
    // had ended round and low, the quarters' bottom hanging over the legs.
    // (The quarters widest high, at the points of the hips, falling straight to the stifle and slimming into the gaskin: widest low,
    // they had swelled into a pear seen from behind, a lump hanging over the legs.)
    add('point of hip', V(0.19 * s, 1.4, -0.44), V(0, 0, 1), [0.06, 0.09, 0.06], 0.08, () => [['hips', 1]]);
    add('haunch', V(0.16 * s, 1.17, -0.57), V(0.01 * s, 1, -0.04), [0.105, 0.21, 0.2], 0.08, thighBones);
    add('lower thigh', V(0.175 * s, 0.93, -0.53), V(0.02 * s, 1, 0.12), [0.065, 0.12, 0.12], 0.08, thighBones);
    add('stifle', stifle.clone().add(V(-0.01 * s, 0.03, 0)), V(0, 1, 0), [0.055, 0.075, 0.06], 0.06, () => [[`h_up_${k}`, 0.6], [`h_mid_${k}`, 0.4]]);
    add('hamstring', V(0.15 * s, 0.86, -0.715), along(V(0.155 * s, 1.1, -0.75), V(0.155 * s, 0.62, -0.71)), [0.05, 0.24, 0.062], 0.06,
      between(V(0.155 * s, 1.1, -0.75), V(0.155 * s, 0.62, -0.71), `h_up_${k}`, `h_mid_${k}`, 0.2, 0.7));
    add('gaskin', stifle.clone().lerp(hock, 0.42).add(V(-0.01 * s, 0, -0.03)), along(stifle, hock), [0.062, 0.25, 0.095], 0.05, between(stifle, hock, `h_up_${k}`, `h_mid_${k}`, -0.3, 0.2));
    add('hock', hock.clone().add(V(0, 0.035, -0.025)), along(stifle, hock), [0.048, 0.075, 0.062], 0.05, between(stifle, hock, `h_mid_${k}`, `h_low_${k}`, 0.85, 1.05));
    // The shoulder from under the withers to the point of the shoulder; the upper arm; the point of the elbow; the forearm.
    const blade = j(`f_sc_${k}`), point = j(`f_up_${k}`), elbow = j(`f_mid_${k}`), knee = j(`f_low_${k}`);
    add('shoulder', blade.clone().lerp(point, 0.5).add(V(0.02 * s, 0, 0)), along(blade, point), [0.1, 0.26, 0.15], 0.1,
      between(blade, point, 'chest', `f_sc_${k}`, -0.2, 0.4));
    add('upper arm', point.clone().lerp(elbow, 0.5).add(V(-0.01 * s, 0, -0.025)), along(point, elbow), [0.085, 0.19, 0.11], 0.07,
      // (Moved by the shoulder blade, giving way to the upper arm only near the elbow: moved by the upper arm, it had dragged the skin
      // under the chest back with the leg, in a sag.)
      between(point, elbow, `f_sc_${k}`, `f_up_${k}`, 0.35, 1.1));
    add('elbow', elbow.clone().add(V(-0.01 * s, 0.03, -0.055)), V(0, 1, 0), [0.048, 0.055, 0.05], 0.05, () => [[`f_up_${k}`, 0.5], [`f_mid_${k}`, 0.5]]);
    add('forearm', elbow.clone().lerp(knee, 0.33), along(elbow, knee), [0.072, 0.24, 0.088], 0.06, between(elbow, knee, `f_up_${k}`, `f_mid_${k}`, -0.4, 0.15));
    add('forearm, lower', elbow.clone().lerp(knee, 0.75), along(elbow, knee), [0.05, 0.14, 0.055], 0.04, () => [[`f_mid_${k}`, 1]]);
  }
  return out;
}

/** How far outside a rounded mass a point is (negative inside): Inigo Quilez's near distance to an ellipsoid. */
function massDistance(m: Mass, p: Vector3, side: Vector3, depth: Vector3): number {
  const d = p.clone().sub(m.c), x = d.dot(side) / m.r[0], y = d.dot(m.along) / m.r[1], z = d.dot(depth) / m.r[2];
  const k0 = Math.hypot(x, y, z), k1 = Math.hypot(x / m.r[0], y / m.r[1], z / m.r[2]);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(...m.r);
}
/** The union of `a` and `b` with their meeting rounded over `k`. */
const smin = (a: number, b: number, k: number) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export interface Sculpted {
  geometry: BufferGeometry;
  weights: [string, number][][];
  /** How far outside the body a point is. */
  distance: (p: Vector3) => number;
  /** Where a ray from inside the body, from `from` along `dir`, comes out through its surface; and the surface's outward normal there. */
  surface: (from: Vector3, dir: Vector3) => { at: Vector3; normal: Vector3 };
}

/** The body as one solid, sampled every `cell` metres, its surface found by marching cubes; each point given its masses' bones. */
export function sculptHorse(rest: (n: string) => Vector3, cell = 0.02): Sculpted {
  const masses = horseMasses(rest);
  const frames = masses.map((m) => {
    const side = X.clone().addScaledVector(m.along, -X.dot(m.along));
    if (side.lengthSq() < 1e-4) side.set(0, 0, 1).addScaledVector(m.along, -m.along.z);
    side.normalize();
    return { side, depth: m.along.clone().cross(side).normalize(), reach: Math.max(...m.r) + m.blend + 0.05 };
  });
  const near = (p: Vector3) => masses.map((m, i) => (p.distanceTo(m.c) < frames[i].reach + 0.15 ? i : -1)).filter((i) => i >= 0);
  // (The same sums as `massDistance`, in plain numbers: the body is sampled some 400,000 times. Each mass as eighteen numbers: its
  // middle, its three axes, its three half-sizes, its blend, how far off it can be passed by, and its largest half-size.)
  const M = masses.length, S = 18, F = new Float64Array(M * S);
  masses.forEach((m, i) => F.set([m.c.x, m.c.y, m.c.z, ...frames[i].side.toArray(), ...m.along.toArray(), ...frames[i].depth.toArray(), ...m.r, m.blend, frames[i].reach + 0.2, Math.max(...m.r)], i * S));
  const distanceAt = (x: number, y: number, z: number): number => {
    let d = Infinity;
    for (let i = 0; i < M; i++) {
      const o = i * S, dx = x - F[o], dy = y - F[o + 1], dz = z - F[o + 2], far = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (far > F[o + 16]) { const e = far - F[o + 17]; if (e < d) d = e; continue; }
      const rx = F[o + 12], ry = F[o + 13], rz = F[o + 14];
      const ax = (dx * F[o + 3] + dy * F[o + 4] + dz * F[o + 5]) / rx, ay = (dx * F[o + 6] + dy * F[o + 7] + dz * F[o + 8]) / ry, az = (dx * F[o + 9] + dy * F[o + 10] + dz * F[o + 11]) / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az), bx = ax / rx, by = ay / ry, bz = az / rz, k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      d = smin(d, k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -F[o + 17], F[o + 15]);
    }
    return d;
  };
  const distance = (p: Vector3): number => distanceAt(p.x, p.y, p.z);
  // Sampled over a box about the body, a cell at a time.
  const min = new Vector3(-0.44, 0.4, -1.06), max = new Vector3(0.44, 2.12, 1.22);
  const nx = Math.ceil((max.x - min.x) / cell), ny = Math.ceil((max.y - min.y) / cell), nz = Math.ceil((max.z - min.z) / cell);
  const sx = nx + 1, sy = ny + 1, values = new Float32Array(sx * sy * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) values[(k * sy + j) * sx + i] = distanceAt(min.x + i * cell, min.y + j * cell, min.z + k * cell);
  const value = (i: number, j: number, k: number) => values[(k * sy + j) * sx + i];
  // Marching cubes: each cell's corners inside or out; a point where the surface crosses each edge, shared by the cells about it.
  const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const EDGE = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const ids = new Map<number, number>(), pos: number[] = [], index: number[] = [];
  const pointOn = (i: number, j: number, k: number, e: number) => {
    const [a, b] = EDGE[e], ca = CORNER[a], cb = CORNER[b];
    const ia = i + ca[0], ja = j + ca[1], ka = k + ca[2], ib = i + cb[0], jb = j + cb[1], kb = k + cb[2];
    const lo = Math.min((ka * sy + ja) * sx + ia, (kb * sy + jb) * sx + ib), axis = ia !== ib ? 0 : ja !== jb ? 1 : 2, key = lo * 3 + axis;
    let id = ids.get(key);
    if (id === undefined) {
      const va = value(ia, ja, ka), vb = value(ib, jb, kb), t = va / (va - vb);
      pos.push(min.x + (ia + (ib - ia) * t) * cell, min.y + (ja + (jb - ja) * t) * cell, min.z + (ka + (kb - ka) * t) * cell);
      id = pos.length / 3 - 1;
      ids.set(key, id);
    }
    return id;
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let cube = 0;
    for (let c = 0; c < 8; c++) if (value(i + CORNER[c][0], j + CORNER[c][1], k + CORNER[c][2]) < 0) cube |= 1 << c;
    if (!edgeTable[cube]) continue;
    for (let t = 0; triTable[cube * 16 + t] !== -1; t += 3) {
      const a = pointOn(i, j, k, triTable[cube * 16 + t]), b = pointOn(i, j, k, triTable[cube * 16 + t + 1]), c = pointOn(i, j, k, triTable[cube * 16 + t + 2]);
      if (a !== b && b !== c && a !== c) index.push(a, b, c);
    }
  }
  // Normals from the function itself, and every triangle turned to face out along them.
  const normal = (q: Vector3) => {
    const e = 0.004, n = new Vector3(
      distance(q.clone().add(new Vector3(e, 0, 0))) - distance(q.clone().add(new Vector3(-e, 0, 0))),
      distance(q.clone().add(new Vector3(0, e, 0))) - distance(q.clone().add(new Vector3(0, -e, 0))),
      distance(q.clone().add(new Vector3(0, 0, e))) - distance(q.clone().add(new Vector3(0, 0, -e))));
    return n.normalize();
  };
  const count = pos.length / 3, nor = new Float32Array(count * 3), at = (v: number) => new Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
  for (let v = 0; v < count; v++) nor.set(normal(at(v)).toArray(), v * 3);
  for (let t = 0; t < index.length; t += 3) {
    const a = at(index[t]), b = at(index[t + 1]), c = at(index[t + 2]), face = b.clone().sub(a).cross(c.clone().sub(a));
    const n = new Vector3(nor[index[t] * 3], nor[index[t] * 3 + 1], nor[index[t] * 3 + 2]);
    if (face.dot(n) < 0) { const s = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = s; }
  }
  // Each point's bones: those of the masses it lies on, the nearer a mass the larger its share.
  const weights: [string, number][][] = [];
  for (let v = 0; v < count; v++) {
    const q = at(v), list = near(q), ds = list.map((i) => massDistance(masses[i], q, frames[i].side, frames[i].depth)), dmin = Math.min(...ds);
    const share = new Map<string, number>();
    list.forEach((i, n) => {
      const w = Math.exp(-(ds[n] - dmin) / 0.022);
      if (w < 0.02) return;
      for (const [b, x] of masses[i].bones(q)) if (x > 0) share.set(b, (share.get(b) ?? 0) + w * x);
    });
    const top = [...share.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, [, x]) => s + x, 0);
    weights.push(top.map(([b, x]) => [b, x / sum]));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.setIndex(index);
  const surface = (from: Vector3, dir: Vector3) => {
    const d = dir.clone().normalize();
    let lo = 0, hi = 0.02;
    while (hi < 1.2 && distance(from.clone().addScaledVector(d, hi)) < 0) { lo = hi; hi += 0.02; }
    for (let q = 0; q < 20; q++) { const mid = (lo + hi) / 2; if (distance(from.clone().addScaledVector(d, mid)) < 0) lo = mid; else hi = mid; }
    const at2 = from.clone().addScaledVector(d, (lo + hi) / 2);
    return { at: at2, normal: normal(at2) };
  };
  void Color;
  return { geometry, weights, distance, surface };
}
