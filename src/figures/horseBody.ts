import { BufferAttribute, BufferGeometry, Color, Vector3 } from 'three';
import { sculptHorse } from './horseSculpt';

/**
 * The horse's body as it looks (asked: "improve the skins/visuals for the horse ...: horse, a realistic horse"; then "improve horse
 * skeleton and skin further - the butt and how legs attach to horse body look weird"): made in code on the skeleton of `horse.ts`,
 * which it was made to fit. Its trunk, neck, quarters, shoulders and upper legs are one solid of rounded masses grown into one another
 * (`horseSculpt.ts`), so that the thighs grow out of the quarters and the forearms out of the breast; the head, from the poll to the
 * muzzle, broad at the cheeks and the forehead, narrowing down the face and flaring a little at the nostrils, and each leg from the
 * knee or the hock down (the cannon with its tendons behind, the fetlock, the pastern, the hoof) are surfaces lofted through cross-
 * sections, which overlap the solid where they join it. Ears are leaves; eyes are dark and glossy; the nostrils dark. The mane and the
 * tail are hair, strands laid from the crest (where it is felt for on the solid) and the dock.
 *
 * Its coat is a bay's: a red brown, darker along the back, its legs black from the knees and the hocks down, its mane and tail black,
 * its muzzle dark, a small white star on its forehead. Ridden, it wears tack as a mediaeval horse did: a saddle with a high pommel and
 * cantle on a cloth bordered in another colour, a girth, stirrups hung where a rider's feet are, a bridle with its bit; laid on the
 * solid's surface where a ray from inside the body comes out through it.
 *
 * Every point is given to the bones that move it, blended across each joint, so that the surfaces bend with the skeleton.
 */

/** A piece of the horse: its surface, and for each of its points the bones that move it with their shares, and its colour. */
export interface Part { geometry: BufferGeometry; weights: [string, number][][]; colours: Color[] }
export interface HorseLooks { coat: Part[]; hair: Part[]; eyes: Part[]; tack: Part[]; steel: Part[] }

const BAY = new Color(0x6b391c), DARK = new Color(0x191411), MUZZLE = new Color(0x2e221c), HOOF = new Color(0x2a2522), STAR = new Color(0xe9e4dc);
const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const noise = (p: Vector3) => { const h = Math.sin(p.x * 71.3 + p.y * 113.7 + p.z * 37.9) * 43758.5453; return h - Math.floor(h); };

/** A cross-section: its middle, which way is its side and its top, its half-breadth, its depth above and below the middle, how square. */
interface Section { c: Vector3; side: Vector3; up: Vector3; w: number; top: number; bottom: number; square: number }

/**
 * A closed surface through sections, `around` points round each, its ends capped; and for each point, the share of the way along it
 * (0 at the first section, 1 at the last) and the angle round it.
 */
function loft(sections: Section[], around = 28): { geometry: BufferGeometry; along: number[]; angle: number[] } {
  const pos: number[] = [], along: number[] = [], angle: number[] = [], index: number[] = [];
  sections.forEach((s, i) => {
    const e = 2 / s.square;
    for (let j = 0; j < around; j++) {
      const th = (j / around) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      const x = s.w * Math.sign(cs) * Math.abs(cs) ** e, y = (sn >= 0 ? s.top : s.bottom) * Math.sign(sn) * Math.abs(sn) ** e;
      const p = s.c.clone().addScaledVector(s.side, x).addScaledVector(s.up, y);
      pos.push(p.x, p.y, p.z);
      along.push(i / (sections.length - 1));
      angle.push(th);
    }
  });
  const m = sections.length;
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < around; j++) {
    const a = i * around + j, b = i * around + ((j + 1) % around), c = a + around, d = b + around;
    index.push(a, b, c, b, d, c);
  }
  // The ends: a point a little beyond each end section's middle, and a fan to it.
  for (const [i, out] of [[0, -1], [m - 1, 1]] as const) {
    const s = sections[i], next = sections[i - out] ?? s, dir = s.c.clone().sub(next.c).normalize().multiplyScalar(Math.min(s.w, s.top) * 0.6 * (s.c.equals(next.c) ? 0 : 1));
    const tip = s.c.clone().add(dir), k = pos.length / 3;
    pos.push(tip.x, tip.y, tip.z);
    along.push(i / (m - 1));
    angle.push(0);
    for (let j = 0; j < around; j++) {
      const a = i * around + j, b = i * around + ((j + 1) % around);
      if (out < 0) index.push(k, b, a); else index.push(k, a, b);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return { geometry, along, angle };
}

/** A smooth path through points (Catharine-Rom, its ends held), `per` points between each two. */
function path(points: Vector3[], per: number): { at: Vector3[]; from: number[] } {
  const at: Vector3[] = [], from: number[] = [];
  const P = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) for (let k = 0; k < per; k++) {
    const t = k / per, p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t2 = t * t, t3 = t2 * t;
    at.push(new Vector3()
      .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t)
      .addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
      .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t)
      .addScaledVector(p3, 0.5 * t3 - 0.5 * t2));
    from.push(i + t);
  }
  at.push(points[points.length - 1].clone());
  from.push(points.length - 1);
  return { at, from };
}

/** A value keyed along a path by the index of its points (fractional), eased between keys. */
const keyed = (keys: [number, number][], u: number) => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], smooth((u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return keys[keys.length - 1][1];
};

/** Sections along a path through `points`, their shapes keyed by point index; their frames from the path and the side given. */
function sectionsAlong(points: Vector3[], per: number, side: Vector3, shape: { w: [number, number][]; top: [number, number][]; bottom: [number, number][]; square?: number }, flipUp = false) {
  const { at, from } = path(points, per);
  const out: Section[] = at.map((c, i) => {
    const t = at[Math.min(at.length - 1, i + 1)].clone().sub(at[Math.max(0, i - 1)]).normalize();
    const s = side.clone().addScaledVector(t, -side.dot(t)).normalize(), up = t.clone().cross(s).normalize();
    if (flipUp) up.negate();
    const u = from[i];
    return { c, side: s, up, w: keyed(shape.w, u), top: keyed(shape.top, u), bottom: keyed(shape.bottom, u), square: shape.square ?? 2.3 };
  });
  return { sections: out, from };
}

/** Shares of bones by where along a chain a point is (its point index, fractional): each bone from its joint, blended across joints. */
function chainWeights(bones: string[], u: number, blend = 0.18): [string, number][] {
  // (Bone k runs from point k to point k + 1 of the chain; near a joint, the two bones meeting there share the point.)
  const k = Math.max(0, Math.min(bones.length - 1, Math.floor(u))), f = u - k;
  if (f < blend && k > 0) { const w = 0.5 + 0.5 * (f / blend); return [[bones[k], w], [bones[k - 1], 1 - w]]; }
  if (f > 1 - blend && k < bones.length - 1) { const w = 0.5 + 0.5 * ((1 - f) / blend); return [[bones[k], w], [bones[k + 1], 1 - w]]; }
  return [[bones[k], 1]];
}

export function horseLooks(rest: (n: string) => Vector3): HorseLooks {
  const X = new Vector3(1, 0, 0), V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const coat: Part[] = [], hair: Part[] = [], eyes: Part[] = [], tack: Part[] = [], steel: Part[] = [];
  const mottled = (c: Color, p: Vector3, by = 0.06) => { const k = 1 + by * (noise(p) * 2 - 1); return new Color(c.r * k, c.g * k, c.b * k); };
  const part = (geometry: BufferGeometry, weights: [string, number][][], colours: Color[]): Part => ({ geometry, weights, colours });

  // ---------------------------------------------------------------- the body: trunk, neck, quarters, shoulders, upper legs
  // One solid of rounded masses grown into one another (`horseSculpt.ts`). Its coat darker where it faces up (the back, the crest),
  // black down the forearms and gaskins towards the knees and the hocks.
  const body = sculptHorse(rest);
  {
    const P = body.geometry.getAttribute('position'), N = body.geometry.getAttribute('normal'), c: Color[] = [];
    for (let i = 0; i < P.count; i++) {
      const p = V(P.getX(i), P.getY(i), P.getZ(i)), up = N.getY(i);
      const col = BAY.clone().multiplyScalar(1 - 0.25 * smooth((up - 0.45) / 0.45)).lerp(DARK, smooth((0.68 - p.y) / 0.16));
      c.push(mottled(col, p));
    }
    coat.push(part(body.geometry, body.weights, c));
  }
  const n1 = rest('neck1'), poll = rest('head'), muzzle = rest('muzzle');
  void n1;
  // The head, from behind the poll down to the muzzle: its `top` the forehead and the face, its `bottom` the jaw and the throat.
  const headDir = muzzle.clone().sub(poll).normalize(), faceUp = X.clone().cross(headDir).normalize().negate(), headLen = muzzle.distanceTo(poll);
  const headPoint = (s: number) => poll.clone().addScaledVector(headDir, s * headLen);
  {
    const ss = [-0.08, 0.05, 0.2, 0.38, 0.6, 0.8, 0.93, 1.02, 1.07];
    const shape: [number, number, number][] = [[0.085, 0.08, 0.09], [0.105, 0.08, 0.15], [0.12, 0.072, 0.19], [0.108, 0.068, 0.13], [0.085, 0.062, 0.095], [0.078, 0.062, 0.09], [0.082, 0.066, 0.095], [0.07, 0.058, 0.08], [0.04, 0.035, 0.045]];
    const sections: Section[] = [];
    for (let k = 0; k < ss.length - 1; k++) for (let q = 0; q < 5; q++) {
      const t = q / 5, s = lerp(ss[k], ss[k + 1], t), e = smooth(t), a = shape[k], b = shape[k + 1];
      sections.push({ c: headPoint(s), side: X.clone(), up: faceUp.clone(), w: lerp(a[0], b[0], e), top: lerp(a[1], b[1], e), bottom: lerp(a[2], b[2], e), square: 2.5 });
    }
    sections.push({ c: headPoint(ss[ss.length - 1]), side: X.clone(), up: faceUp.clone(), w: shape[shape.length - 1][0], top: shape[shape.length - 1][1], bottom: shape[shape.length - 1][2], square: 2.5 });
    // (The jaw's depth hangs behind and below the line of the face: the sections' middles are let down the jaw's way a little where it is deep.)
    for (const s of sections) s.c.addScaledVector(faceUp, -(s.bottom - s.top) * 0.35);
    const { geometry, along } = loft(sections, 26);
    const P = geometry.getAttribute('position'), w: [string, number][][] = [], c: Color[] = [];
    const starAt = headPoint(0.3).addScaledVector(faceUp, 0.065);
    for (let i = 0; i < P.count; i++) {
      const p = V(P.getX(i), P.getY(i), P.getZ(i)), s = lerp(ss[0], ss[ss.length - 1], along[i]);
      w.push(s < 0.02 ? [['neck2', 0.5 - s * 5], ['head', 0.5 + s * 5]] : [['head', 1]]);
      let col = mottled(BAY.clone().lerp(MUZZLE, smooth((s - 0.62) / 0.3)), p);
      col.lerp(STAR, smooth((0.04 - p.distanceTo(starAt)) / 0.02));
      c.push(col);
    }
    coat.push(part(geometry, w, c));
    // The eyes, one on each side under the brow; the nostrils, dark, either side of the muzzle's front.
    for (const sign of [1, -1]) {
      const eye = loft(ring(headPoint(0.26).addScaledVector(faceUp, 0.012).addScaledVector(X, sign * 0.09), X.clone().multiplyScalar(sign).addScaledVector(faceUp, 0.25).normalize(), 0.027, 0.018), 12);
      eyes.push(part(eye.geometry, eye.along.map(() => [['head', 1]]), eye.along.map(() => new Color(0x120c09))));
      const nostril = loft(ring(headPoint(0.93).addScaledVector(faceUp, 0.015).addScaledVector(X, sign * 0.05), headDir.clone().add(X.clone().multiplyScalar(sign * 0.6)).normalize(), 0.02, 0.012), 10);
      coat.push(part(nostril.geometry, nostril.along.map(() => [['head', 1]]), nostril.along.map(() => new Color(0x0e0a08))));
    }
    // The ears: leaves standing from the poll, a little forward and out, their tips dark.
    for (const [k, sign] of [['l', 1], ['r', -1]] as const) {
      const base = rest(`ear_${k}`), tip = base.clone().lerp(rest(`ear_tip_${k}`).add(V(0.01 * sign, 0, 0.03)), 0.78);
      const pts = [base.clone().addScaledVector(tip.clone().sub(base).normalize(), -0.02), base, base.clone().lerp(tip, 0.5), tip];
      const { sections } = sectionsAlong(pts, 4, X, { w: [[0, 0.04], [1, 0.045], [2, 0.042], [3, 0.004]], top: [[0, 0.02], [1, 0.018], [2, 0.014], [3, 0.003]], bottom: [[0, 0.02], [1, 0.018], [2, 0.014], [3, 0.003]], square: 2 });
      const { geometry, along } = loft(sections, 12);
      const P = geometry.getAttribute('position');
      coat.push(part(geometry, along.map(() => [[`ear_${k}`, 1]]), along.map((a, i) => mottled(BAY.clone().lerp(DARK, smooth((a - 0.55) / 0.4)), V(P.getX(i), P.getY(i), P.getZ(i))))));
    }
  }

  // ---------------------------------------------------------------- the legs, from the knees and the hocks down
  for (const [k] of [['l', 1], ['r', -1]] as const) for (const fore of [true, false]) {
    const f = fore ? 'f' : 'h', j = (n: string) => rest(`${f}_${n}_${k}`), sole = j('hoof').add(V(0, -0.07, 0.02));
    // (From inside the forearm or the gaskin, where the body's solid has grown thin, down the joints to the sole.)
    const pts = [j('mid').lerp(j('low'), fore ? 0.58 : 0.62), j('low'), j('pas'), j('hoof'), sole];
    const shape = {
      w: [[0, fore ? 0.05 : 0.052], [1, fore ? 0.058 : 0.055], [1.3, 0.042], [1.8, 0.042], [2, 0.05], [2.5, 0.04], [3, 0.048], [3.8, 0.062], [4, 0.055]] as [number, number][],
      top: [[0, 0.05], [1, fore ? 0.055 : 0.06], [1.3, fore ? 0.035 : 0.04], [1.8, fore ? 0.035 : 0.04], [2, 0.045], [2.5, 0.04], [3, 0.05], [3.8, 0.07], [4, 0.06]] as [number, number][],
      bottom: [[0, fore ? 0.05 : 0.065], [1, fore ? 0.05 : 0.072], [1.3, fore ? 0.045 : 0.05], [1.8, fore ? 0.045 : 0.05], [2, 0.06], [2.5, 0.035], [3, 0.045], [3.8, 0.055], [4, 0.05]] as [number, number][],
    };
    const { sections, from } = sectionsAlong(pts, 7, X, { ...shape, square: 2.2 });
    const { geometry, along } = loft(sections, 20);
    const P = geometry.getAttribute('position'), w: [string, number][][] = [], c: Color[] = [];
    const bones = [`${f}_mid_${k}`, `${f}_low_${k}`, `${f}_pas_${k}`, `${f}_hoof_${k}`];
    for (let i = 0; i < P.count; i++) {
      const u = along[i] * from[from.length - 1], p = V(P.getX(i), P.getY(i), P.getZ(i));
      w.push(chainWeights(bones, u, 0.2));
      // Black (the bay's points), the hoof's horn below the coronet.
      c.push(u > 3.05 ? mottled(HOOF, p, 0.04) : mottled(BAY.clone().lerp(DARK, smooth((0.68 - p.y) / 0.16)), p));
    }
    coat.push(part(geometry, w, c));
  }

  // ---------------------------------------------------------------- hair: mane, forelock, tail
  /** A strand: a ribbon through points, so wide, facing `out`; each point's bones and its colour. */
  const strand = (points: Vector3[], width: number, out: (i: number) => Vector3, weights: (i: number) => [string, number][], shade: number) => {
    const pos: number[] = [], index: number[] = [], w: [string, number][][] = [], c: Color[] = [];
    points.forEach((p, i) => {
      const along = points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
      const across = along.clone().cross(out(i)).normalize().multiplyScalar(width * (1 - 0.7 * (i / (points.length - 1))) * 0.5);
      const a = p.clone().add(across), b = p.clone().sub(across);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      w.push(weights(i), weights(i));
      const col = DARK.clone().multiplyScalar(shade * (1 + 0.25 * (i / points.length)));
      c.push(col, col);
      if (i) { const q = i * 2; index.push(q - 2, q - 1, q, q - 1, q + 1, q); }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    hair.push(part(geometry, w, c));
  };
  // The mane: from the poll down the crest to the withers, falling on the horse's left (its near side, as it is mostly seen).
  {
    // (Its roots where the crest is: felt for from the neck's line, up and back across it.)
    const neckLine = [V(0, 2.0, 1.12), V(0, 1.93, 1.06), V(0, 1.78, 0.97), V(0, 1.61, 0.85), V(0, 1.45, 0.7), V(0, 1.34, 0.56)];
    const line = path(neckLine, 14), from = line.from;
    const at = line.at.map((c, i) => {
      const dir = line.at[Math.min(line.at.length - 1, i + 1)].clone().sub(line.at[Math.max(0, i - 1)]).normalize(), crest = X.clone().cross(dir).normalize();
      return body.surface(c, crest.y > 0 ? crest : crest.negate()).at;
    });
    at.forEach((root, i) => {
      const u = from[i], len = 0.15 + 0.11 * Math.sin(Math.min(1, u / 4.5) * Math.PI) + 0.04 * noise(root);
      const lean = V(0.5 + 0.15 * noise(root.clone().multiplyScalar(2)), -0.85, -0.12 - 0.1 * noise(root.clone().multiplyScalar(3))).normalize();
      const start = root.clone().add(V(0.012, 0.012, 0));
      const pts = [0, 0.3, 0.6, 1].map((t) => start.clone().addScaledVector(lean, len * t).add(V(0.025 * t * t, 0, 0)));
      const bone: [string, number][] = u < 1.5 ? [['head', 0.4], ['neck2', 0.6]] : u < 3 ? [['neck2', 1]] : u < 4.2 ? [['neck1', 1]] : [['neck1', 0.5], ['chest', 0.5]];
      strand(pts, 0.055, () => V(1, 0.2, 0).normalize(), () => bone, 0.85 + 0.35 * noise(root));
    });
  }
  // The tail: a dock of coat down from the croup, then hair falling from it to below the hocks.
  {
    const t1 = rest('tail1'), t2 = rest('tail2'), t3 = rest('tail3'), te = rest('tail_end');
    const dockPts = [t1.clone().add(V(0, 0.04, 0.06)), t1, t1.clone().lerp(t2, 0.6)];
    const dock = sectionsAlong(dockPts, 5, X, { w: [[0, 0.07], [1, 0.06], [2, 0.045]], top: [[0, 0.07], [1, 0.06], [2, 0.045]], bottom: [[0, 0.07], [1, 0.06], [2, 0.045]], square: 2 });
    const dl = loft(dock.sections, 12);
    coat.push(part(dl.geometry, dl.along.map(() => [['tail1', 1]]), dl.along.map(() => mottled(BAY.clone().multiplyScalar(0.7), t1))));
    const chain = [t1.clone().lerp(t2, 0.3), t2, t3, te, te.clone().add(V(0, -0.22, 0.02))];
    for (let q = 0; q < 34; q++) {
      const a = (q / 34) * Math.PI * 2, spread = 0.02 + 0.05 * noise(V(q, 1, 2)), len = 0.85 + 0.15 * noise(V(q, 3, 4));
      const off = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(spread);
      const pts = chain.map((p, i) => p.clone().add(off.clone().multiplyScalar(0.5 + i * 0.5)).add(V(0, i === chain.length - 1 ? -0.22 * (len - 0.85) : 0, 0)));
      const bones = (i: number): [string, number][] => (i <= 0 ? [['tail1', 1]] : i === 1 ? [['tail2', 1]] : i === 2 ? [['tail3', 0.7], ['tail2', 0.3]] : [['tail3', 1]]);
      strand(pts, 0.06, (i) => off.clone().normalize().add(V(0, 0, -0.3)).normalize(), bones, 0.85 + 0.35 * noise(V(q, 5, 6)));
    }
  }

  // ---------------------------------------------------------------- tack, for a ridden horse
  /** A point on the body's surface at `z`, so far round from the top (radians, to the left positive), lifted off it. */
  const onTrunk = (z: number, th: number, lift: number) => {
    const hit = body.surface(V(0, 1.2, z), V(Math.sin(th), Math.cos(th), 0));
    return hit.at.addScaledVector(hit.normal, lift);
  };
  const trunkWeight = (z: number): [string, number][] => (z < 0 ? [['hips', 1 - smooth((z + 0.45) / 0.45)], ['spine', smooth((z + 0.45) / 0.45)]] : [['spine', 1 - smooth(z / 0.45)], ['chest', smooth(z / 0.45)]]);
  /** A sheet laid over the trunk between two lengths and two angles round it, lifted by `lift(u, v)`, coloured by `colour(u, v)`. */
  const sheet = (z0: number, z1: number, th0: number, th1: number, lift: (u: number, v: number) => number, colour: (u: number, v: number) => Color, into: Part[], nu = 14, nv = 22) => {
    const pos: number[] = [], index: number[] = [], w: [string, number][][] = [], c: Color[] = [];
    for (let i = 0; i <= nu; i++) for (let jj = 0; jj <= nv; jj++) {
      const u = i / nu, v = jj / nv, z = lerp(z0, z1, u), p = onTrunk(z, lerp(th0, th1, v), lift(u, v));
      pos.push(p.x, p.y, p.z);
      w.push(trunkWeight(z));
      c.push(colour(u, v));
    }
    for (let i = 0; i < nu; i++) for (let jj = 0; jj < nv; jj++) { const a = i * (nv + 1) + jj, b = a + 1, d = a + nv + 1, e = d + 1; index.push(a, b, d, b, e, d); }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    into.push(part(geometry, w, c));
  };
  // The saddle cloth: down the sides to below the middle of the barrel, bordered.
  const CLOTH = new Color(0x2d3c5a), BORDER = new Color(0xc8a64a), LEATHER = new Color(0x4e2f1a);
  sheet(-0.36, 0.3, -1.75, 1.75, () => 0.012, (u, v) => (u < 0.06 || u > 0.94 || v < 0.05 || v > 0.95 ? BORDER : CLOTH), tack, 16, 30);
  // The saddle: its seat over the back, its pommel high before and its cantle high behind, its skirts down the sides.
  sheet(-0.24, 0.2, -0.75, 0.75, (u, v) => 0.03 + 0.11 * smooth((0.18 - u) / 0.18) * (1 - Math.abs(v * 2 - 1) * 0.6) + 0.08 * smooth((u - 0.82) / 0.18) * (1 - Math.abs(v * 2 - 1) * 0.5),
    (u, v) => LEATHER.clone().multiplyScalar(0.85 + 0.25 * Math.sin(v * Math.PI)), tack, 16, 18);
  sheet(-0.14, 0.12, -1.25, 1.25, () => 0.025, (u, v) => (Math.abs(v * 2 - 1) < 0.62 ? LEATHER.clone().multiplyScalar(0.7) : LEATHER), tack, 8, 22);
  // The girth, round the barrel behind the elbows.
  sheet(0.24, 0.3, -3.2, 3.2, () => 0.014, () => LEATHER.clone().multiplyScalar(0.8), tack, 2, 40);
  // Stirrups on their leathers, hung from the saddle's sides where a rider's feet are.
  for (const sign of [1, -1]) {
    const top = onTrunk(-0.02, sign * 1.15, 0.03), foot = V(sign * 0.37, 1.22 + 0.34 - 0.6 + 0.03, 0.0);
    const strap = sectionsAlong([top, top.clone().lerp(foot, 0.5).add(V(sign * 0.01, 0, 0)), foot.clone().add(V(0, 0.06, 0))], 3, V(0, 0, 1), { w: [[0, 0.014], [2, 0.014]], top: [[0, 0.004], [2, 0.004]], bottom: [[0, 0.004], [2, 0.004]], square: 2 });
    const sl = loft(strap.sections, 8);
    tack.push(part(sl.geometry, sl.along.map(() => [['spine', 1]]), sl.along.map(() => LEATHER.clone().multiplyScalar(0.8))));
    const iron = loft(ring(foot, V(0, 0, 1), 0.05, 0.012, true), 12);
    steel.push(part(iron.geometry, iron.along.map(() => [['spine', 1]]), iron.along.map(() => new Color(0x9a948a))));
  }
  // The bridle: the crownpiece behind the ears, the browband, the cheekpieces down to the bit, the noseband; the bit's rings.
  {
    const strapRound = (s: number, lift: number, th0: number, th1: number) => {
      const pts: Vector3[] = [];
      for (let q = 0; q <= 16; q++) {
        const th = lerp(th0, th1, q / 16), c = headPoint(s), a = th;
        pts.push(c.clone().addScaledVector(X, Math.sin(a) * (0.13 + lift)).addScaledVector(faceUp, Math.cos(a) * (0.09 + lift)));
      }
      return pts;
    };
    const band = (pts: Vector3[]) => {
      const { sections } = sectionsAlong(pts, 2, headDir, { w: [[0, 0.012], [pts.length - 1, 0.012]], top: [[0, 0.004], [pts.length - 1, 0.004]], bottom: [[0, 0.004], [pts.length - 1, 0.004]], square: 2 });
      const l = loft(sections, 6);
      tack.push(part(l.geometry, l.along.map(() => [['head', 1]]), l.along.map(() => LEATHER.clone().multiplyScalar(0.7))));
    };
    band(strapRound(0.02, 0.01, -2.4, 2.4));
    band(strapRound(0.2, -0.02, -1.6, 1.6).map((p) => p.addScaledVector(faceUp, -0.005)));
    band(strapRound(0.72, -0.05, -2.6, 2.6));
    for (const sign of [1, -1]) {
      const pts = [0.04, 0.3, 0.55, 0.84].map((s) => headPoint(s).addScaledVector(X, sign * (lerp(0.13, 0.085, s))).addScaledVector(faceUp, -0.01));
      band(pts);
      const bit = loft(ring(headPoint(0.86).addScaledVector(faceUp, -0.06).addScaledVector(X, sign * 0.085), X.clone(), 0.028, 0.006, true), 10);
      steel.push(part(bit.geometry, bit.along.map(() => [['head', 1]]), bit.along.map(() => new Color(0xb5b0a6))));
    }
  }
  return { coat, hair, eyes, tack, steel };
}

/** Where the bit's rings are on the horse as it rests (for the reins): left, then right. */
export function bitRings(rest: (n: string) => Vector3): Vector3[] {
  const poll = rest('head'), muzzle = rest('muzzle'), dir = muzzle.clone().sub(poll).normalize(), faceUp = new Vector3(1, 0, 0).cross(dir).normalize().negate();
  const at = poll.clone().addScaledVector(dir, 0.86 * muzzle.distanceTo(poll)).addScaledVector(faceUp, -0.06);
  return [1, -1].map((s) => at.clone().add(new Vector3(s * 0.09, 0, 0)));
}

/** Sections for a small round thing about `c` facing `dir`: a squat ball, or (`hoop`) a ring of a tube. */
function ring(c: Vector3, dir: Vector3, r: number, depth: number, hoop = false): Section[] {
  const side = Math.abs(dir.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(side).normalize();
  if (hoop) {
    // (A ring as a tube bent round: sections round its circle.)
    const out: Section[] = [];
    for (let q = 0; q <= 16; q++) {
      const a = (q / 16) * Math.PI * 2, centre = c.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r);
      const along = side.clone().multiplyScalar(-Math.sin(a)).addScaledVector(up, Math.cos(a)).normalize(), s2 = dir.clone(), u2 = along.clone().cross(s2).normalize();
      out.push({ c: centre, side: s2, up: u2, w: depth, top: depth, bottom: depth, square: 2 });
    }
    return out;
  }
  return [-1, -0.6, 0, 0.6, 1].map((t) => {
    const k = Math.sqrt(Math.max(0.02, 1 - t * t));
    return { c: c.clone().addScaledVector(dir, t * depth), side, up, w: r * k, top: r * k, bottom: r * k, square: 2 };
  });
}

/** A loft whose sections already carry their frames (the trunk's), with its ends capped. */
function loftAlongZ(sections: Section[]): { geometry: BufferGeometry } {
  return { geometry: loft(sections, 32).geometry };
}
