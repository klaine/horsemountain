/**
 * A forgotten slope (asked: "New loot: off piste maps ("Notes on forgotten slopes" or something)! Highlights (glowing old ski tracks
 * to follow?) a nice offpiste route to a secluded dungeon entrance (generated after looting?) off the regular piste area (maybe this
 * can be for another location as well?) After exit the player gets an airplane lift back to piste"): where a map found for a run
 * says an old way goes, off the marked piste, down to a cave of its own; laid when the run's land is made, from the map's own seed.
 *
 * The way is looked for over the land beside the run, out past the run's own snow: leaving the piste's edge some way up the run and
 * coming down across the land to a place well out from it, never climbing, never too steep down or across, nowhere over water, and
 * far from the run's own caves. Its end is where the cave's camp is to be, and a knoll is raised past it for the cave's mouth, facing
 * back up the way (as `findSite` raises one where no bank will take a cave), the mouth tried as the run's own are (`trySite`).
 *
 * The run's snow at a metre (`SkiSlice.snow`) reaches only some fifty metres either side of its line; out past it there is only the
 * land at four metres. So the snow at a metre is laid along the way and about the knoll first, from the land at four metres smoothed
 * (`fillSnow`): there the cave can be cut and its camp levelled as on the run's own snow, the land drawn at a metre (the coarser land
 * leaves a hole under it), and the woods keep off it as they keep off the run's (a lane through the trees, and a clearing about the
 * camp). Tried and not taken, what was laid is taken up again.
 *
 * What is seen of it (`TrailLook`): two old tracks along the way, glowing, a light running down them; a faint glow under them; and a
 * beam of light up from where the way leaves the piste, for it to be found.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, Mesh } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, attribute, float, pow, sin, time, uv, vec3 } from 'three/tsl';
import { Rng } from '../src/core/rng';
import { type Grid, gridAt, type SkiSlice } from '../src/core/skiSlice';
import { COVER } from '../src/core/world';
import { CAVE, type CaveSite, KNOLL, knollAt, sliceFrame, trySite } from './slopeDungeon';

type N = ReturnType<typeof float>;

/** A forgotten slope's way and its cave: where it goes (in the scene's frame, from the piste's edge to the camp), and how far down the run it leaves the piste and comes to its end. */
export interface Trail { site: CaveSite; path: [number, number][]; from: number; to: number; side: number }

/** How the way is looked for: how far out past the run's snow it may end, how wide the lane laid for it is, and how far about its knoll the snow is laid. */
const TRAIL = { out: [40, 130] as [number, number], lane: 6, clearing: 44, step: 2, tries: 260, best: 14 };

const catmull = (p0: number, p1: number, p2: number, p3: number, t: number) => 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
/** The land at four metres at a point, smoothed (a cubic through the sixteen heights about it), for the snow laid at a metre not to show the coarser grid's facets. */
function smoothAt(g: Grid, x: number, z: number): number {
  const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 1 || j < 1 || i > g.nx - 3 || j > g.nz - 3) return gridAt(g, x, z);
  const H = (a: number, b: number) => g.data[b * g.nx + a], tx = fx - i, tz = fz - j;
  const row = (b: number) => catmull(H(i - 1, b), H(i, b), H(i + 1, b), H(i + 2, b), tx);
  const v = catmull(row(j - 1), row(j), row(j + 1), row(j + 2), tz);
  return Number.isNaN(v) ? gridAt(g, x, z) : v;
}

/**
 * The snow at a metre laid within `r` of each of `points` (in the scene's frame) where the run's own is not, from the land at four
 * metres smoothed; the cells laid given back, for them to be taken up again.
 */
function fillSnow(slice: SkiSlice, ox: number, oz: number, points: [number, number][], r: number, into: number[]): void {
  const g = slice.snow, near = slice.near, d = g.data, rr = r * r;
  for (const [px, pz] of points) {
    const wx = px + ox, wz = pz + oz, i0 = Math.floor((wx - r - g.x0) / g.cell), i1 = Math.ceil((wx + r - g.x0) / g.cell);
    const j0 = Math.floor((wz - r - g.z0) / g.cell), j1 = Math.ceil((wz + r - g.z0) / g.cell);
    for (let j = Math.max(0, j0); j <= Math.min(g.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(g.nx - 1, i1); i++) {
      const x = g.x0 + i * g.cell, z = g.z0 + j * g.cell, k = j * g.nx + i;
      if ((x - wx) ** 2 + (z - wz) ** 2 > rr || !Number.isNaN(d[k])) continue;
      const h = smoothAt(near, x, z);
      if (Number.isNaN(h)) continue;
      d[k] = h;
      into.push(k);
    }
  }
}

/**
 * The forgotten slope a map's `seed` says there is on `slice`'s run, its snow laid in the slice (to be carved and made land after),
 * kept `away` metres from each of `keepFrom` (the run's own caves' camps); none, if none is found that a cave will go at.
 */
export function planTrail(slice: SkiSlice, seed: string, keepFrom: { x: number; z: number }[] = [], away = 140, told?: Record<string, number>): Trail | null {
  const tell = (why: string) => { if (told) told[why] = (told[why] ?? 0) + 1; };
  const F = sliceFrame(slice), L = F.length, rng = new Rng(`forgotten slope ${seed}`), h = F.height, far = F.far;
  const steep = (x: number, z: number, e = 3) => Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e);
  const water = (x: number, z: number) => {
    const i = Math.round((x - far.x0) / far.cell), j = Math.round((z - far.z0) / far.cell), c = i < 0 || j < 0 || i >= far.nx || j >= far.nz ? COVER.sea : slice.cover[j * far.nx + i];
    return c === COVER.sea || c === COVER.lake || c === COVER.marsh;
  };
  // (Well inside the land at four metres, the skier being kept thirty metres inside it, `Land.roam`, and the clearing about the knoll wide.)
  const nearW = F.near, inside = (x: number, z: number, m: number) => x > nearW.x0 + m && z > nearW.z0 + m && x < nearW.x0 + (nearW.nx - 1) * nearW.cell - m && z < nearW.z0 + (nearW.nz - 1) * nearW.cell - m;
  const tanOf = (d: number) => Math.tan((d * Math.PI) / 180);
  const found: { path: [number, number][]; score: number; side: number; from: number; to: number }[] = [];
  // (Found as one finding a way down would find it, a stride at a time from the piste's edge: of the headings about the way it wants
  // to go (out from the run, and down), the first that goes down, not too steeply, not across too steep a side, not over water and not
  // out of the land; out as far as it means to go, then on down the fall line to the first gentle place, where the camp will be.)
  for (let n = 0; n < TRAIL.tries; n++) {
    const side = rng.chance(0.5) ? 1 : -1, from = rng.range(0.12, 0.7) * L, [a, b] = F.edges(from), out = rng.range(TRAIL.out[0], TRAIL.out[1]);
    const p = F.at(from, side > 0 ? b + 1.5 : a - 1.5);
    let x = p.x, z = p.z, fell = 0, run = 0, beyond = 0, ok = false;
    const path: [number, number][] = [[x, z]], lean = rng.range(0.6, 1.6);
    let s = from;
    for (let step = 0; step < 220; step++) {
      // (Out from the run, as its own frame says here; and down, the way the land falls.)
      const f = F.at(s, 0), ox = f.dz * side, oz = -f.dx * side, lat = (x - f.x) * f.dz - (z - f.z) * f.dx;
      const gx = -(h(x + 2, z) - h(x - 2, z)), gz = -(h(x, z + 2) - h(x, z - 2)), gl = Math.hypot(gx, gz) || 1;
      const wide = Math.abs(lat) - slice.half, outward = wide < out ? lean : 0;
      let wx = gx / gl + ox * outward, wz = gz / gl + oz * outward;
      const wl = Math.hypot(wx, wz) || 1; wx /= wl; wz /= wl;
      let next: [number, number] | null = null;
      for (const turn of [0, 15, -15, 30, -30, 45, -45, 60, -60]) {
        const t = (turn * Math.PI) / 180, dx = wx * Math.cos(t) - wz * Math.sin(t), dz = wx * Math.sin(t) + wz * Math.cos(t);
        const nx = x + dx * TRAIL.step, nz = z + dz * TRAIL.step, dh = h(nx, nz) - h(x, z);
        if (dh > -0.05 || -dh / TRAIL.step > tanOf(31) || steep(nx, nz) > tanOf(35) || water(nx, nz) || !inside(nx, nz, 40)) continue;
        next = [nx, nz]; fell -= dh; break;
      }
      if (!next) { tell(`stuck ${wide < out ? 'going out' : 'going down'}`); break; }
      // (How far on down the run it has come, for the run's frame to be taken there.)
      s += Math.max(0, (next[0] - x) * f.dx + (next[1] - z) * f.dz);
      [x, z] = next; run += TRAIL.step; path.push(next);
      if (wide >= out) beyond += TRAIL.step;
      // (Out far enough, and on a while down: a gentle place, the camp's.)
      if (beyond > 12 && steep(x, z, 6) < tanOf(16)) { ok = true; break; }
    }
    if (!ok || path.length < 20) { if (ok) tell('short'); continue; }
    const [ex, ez] = path[path.length - 1];
    if (keepFrom.some((c) => Math.hypot(c.x - ex, c.z - ez) < away) || !inside(ex, ez, TRAIL.clearing + 35)) { tell('near a cave or the land\'s edge'); continue; }
    // (Smoothed, for a way that sweeps rather than steps.)
    const smooth = path.map((q, i) => { if (i < 2 || i > path.length - 3) return q; let sx = 0, sz = 0; for (let k = -2; k <= 2; k++) { sx += path[i + k][0]; sz += path[i + k][1]; } return [sx / 5, sz / 5] as [number, number]; });
    const grade = (Math.atan(fell / run) * 180) / Math.PI;
    const to = Math.max(from + 10, s);
    found.push({ path: smooth, side, from, to, score: -Math.abs(grade - 15) - 0.004 * run + rng.range(0, 2) });
  }
  found.sort((p, q) => q.score - p.score);
  if (told) told.ways = found.length;
  // The best few tried for a cave: the snow laid along the way and about its end; there, the camp, and a knoll raised past it for the
  // mouth, turned into the rising ground across the slope (a cave turned the way down the way goes has its dungeon under land falling
  // away, too deep), not over the old tracks; the best turn that a cave will go at taken.
  for (const f of found.slice(0, TRAIL.best)) {
    const n = f.path.length, [ex, ez] = f.path[n - 1], [px, pz] = f.path[Math.max(0, n - 6)], l = Math.hypot(ex - px, ez - pz) || 1, dx = (ex - px) / l, dz = (ez - pz) / l;
    const laid: number[] = [];
    fillSnow(slice, F.ox, F.oz, f.path, TRAIL.lane, laid);
    fillSnow(slice, F.ox, F.oz, [[ex, ez]], TRAIL.clearing, laid);
    let best: { site: CaveSite; score: number } | null = null;
    for (const turn of [90, -90, 60, -60, 120, -120, 30, -30, 0]) {
      const t = (turn * Math.PI) / 180, ax = dx * Math.cos(t) - dz * Math.sin(t), az = dx * Math.sin(t) + dz * Math.cos(t);
      const mouth = { x: ex + ax * (CAVE.campR - 0.5), z: ez + az * (CAVE.campR - 0.5) }, k = { x: mouth.x + ax * KNOLL.along * 0.62, z: mouth.z + az * KNOLL.along * 0.62 };
      const knoll = { x: k.x, z: k.z, ax, az, ...KNOLL };
      if (f.path.slice(0, -8).some(([x, z]) => knollAt(knoll, x, z) > 0.2)) continue;
      const site: CaveSite = { s: f.to, side: f.side, mouth, ax, az, y0: 0, deep: 0, camp: { x: 0, z: 0 }, length: 20, holeTo: 0, knoll };
      const score = trySite(F, site, (x, z) => F.height(x, z) + knollAt(knoll, x, z));
      if (score !== null && (!best || score > best.score)) best = { site: { ...site, mouth: { ...site.mouth }, camp: { ...site.camp } }, score };
    }
    tell('cave tried');
    if (best) return { site: best.site, path: f.path, from: f.from, to: f.to, side: f.side };
    for (const c of laid) slice.snow.data[c] = NaN;
  }
  return null;
}

/** How far a point (in the scene's frame) is from the way, and how far along it the nearest of it is (metres from where it leaves the piste). */
export function nearTrail(path: [number, number][], x: number, z: number): { off: number; along: number } {
  let best = Infinity, along = 0, sum = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), cx = ax + dx * t - x, cz = az + dz * t - z, d = cx * cx + cz * cz, l = Math.sqrt(l2);
    if (d < best) { best = d; along = sum + t * l; }
    sum += l;
  }
  return { off: Math.sqrt(best), along };
}

/**
 * The way as it is seen, laid on the land `height` (in the scene's frame, as the land's group is): two old tracks along it, a light
 * running down them, fading in off the piste and out at the camp; a faint glow under them; and a beam up from where it leaves the
 * piste.
 */
export class TrailLook {
  readonly group = new Group();
  constructor(path: [number, number][], height: (x: number, z: number) => number) {
    this.group.name = 'forgotten slope';
    // (The way smoothed and taken every half metre, a running sum of how far along it each point is.)
    const pts: [number, number, number][] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const p0 = path[Math.max(0, i - 1)], p1 = path[i], p2 = path[i + 1], p3 = path[Math.min(path.length - 1, i + 2)], m = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.5));
      for (let q = 0; q < m; q++) { const t = q / m; pts.push([catmull(p0[0], p1[0], p2[0], p3[0], t), 0, catmull(p0[1], p1[1], p2[1], p3[1], t)]); }
    }
    const last = path[path.length - 1];
    pts.push([last[0], 0, last[1]]);
    let sum = 0;
    const along = pts.map((p, i) => (i ? (sum += Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2])) : 0)), total = sum;
    const ribbon = (offset: number, half: number, lift: number) => {
      const n = pts.length, pos = new Float32Array(n * 2 * 3), uvs = new Float32Array(n * 2 * 2), fade = new Float32Array(n * 2), index: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, lx = -dz / l, lz = dx / l;
        const f = Math.min(1, along[i] / 12, (total - along[i]) / 6);
        for (let s = 0; s < 2; s++) {
          const w = offset + (s ? half : -half), x = pts[i][0] + lx * w, z = pts[i][2] + lz * w, k = i * 2 + s;
          pos.set([x, height(x, z) + lift, z], k * 3); uvs.set([along[i], s], k * 2); fade[k] = Math.max(0, f);
        }
        if (i) index.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3)); g.setAttribute('uv', new BufferAttribute(uvs, 2)); g.setAttribute('fade', new BufferAttribute(fade, 1));
      g.setIndex(index);
      return g;
    };
    // (A light running down the tracks, one every so many metres; across each track, brightest at its middle.)
    const running = pow(sin(uv().x.mul(0.16).sub(time.mul(2.4))).mul(0.5).add(0.5), 5) as N, across = float(1).sub(abs(uv().y.mul(2).sub(1))) as N, fade = attribute('fade', 'float') as unknown as N;
    const tracks = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    tracks.colorNode = vec3(0.2, 0.75, 1).mul(running.mul(1.6).add(0.9));
    tracks.opacityNode = across.mul(fade).mul(running.mul(0.35).add(0.6));
    const under = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    under.colorNode = vec3(0.12, 0.35, 0.55).mul(across.mul(across)).mul(fade).mul(running.mul(0.8).add(0.35));
    for (const side of [-0.17, 0.17]) { const m = new Mesh(ribbon(side, 0.07, 0.03), tracks); m.frustumCulled = false; m.renderOrder = 2; this.group.add(m); }
    const glow = new Mesh(ribbon(0, 1.3, 0.02), under);
    glow.frustumCulled = false; glow.renderOrder = 1;
    this.group.add(glow);
    // (The beam where it leaves the piste, pulsing, fading up into the air.)
    const beam = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
    beam.colorNode = vec3(0.25, 0.7, 1).mul(pow(float(1).sub(uv().y), 2) as N).mul(sin(time.mul(2)).mul(0.25).add(0.75));
    const post = new Mesh(new CylinderGeometry(0.18, 0.5, 18, 12, 1, true).translate(0, 9, 0), beam), [sx, , sz] = pts[0];
    post.position.set(sx, height(sx, sz), sz);
    this.group.add(post);
  }
  dispose(): void { this.group.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as MeshBasicNodeMaterial).dispose(); } }); }
}
