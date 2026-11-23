import { Rng, valueNoise2 } from '../core/rng';
import { COVER, World, WorldPlace, zonesAt } from '../core/world';

/**
 * The ink map of a world, in the hand of the ink maps of the house and the place (`ink.ts`,
 * `inkCountry.ts`): an old map of a whole country. The coast a firm line with the sea in lines
 * following it at widening distances; the relief in hachures, strokes running down the fall of the
 * ground, heavier where it is steeper and on the side away from the light, none on the snow;
 * woods as little trees, fields as strips, heath and marsh by their marks; rivers swelling towards
 * the sea, lakes with their ripples; roads as a pair of lines, tracks single, paths dotted, ferries
 * broken lines over the water; towns as huddles of buildings. The places of adventure are in red,
 * as an old map picks out what matters, and listed under the map with the key.
 *
 * Drawn from the world alone, so the same world always gives the same drawing.
 */

/** What the map needs of a world: all of it but what was only needed to make it. */
export type WorldMap = Pick<World, 'plan' | 'name' | 'regions' | 'peakNames' | 'peaks' | 'field' | 'sea' | 'lake' | 'cover' | 'rivers' | 'places' | 'towns' | 'ways'>;

const INK = '#1d1a17';
const PAPER = '#f1eadb';
const WATER = '#5f7d8a';
const RIVER = '#3d5866';
const RED = '#9a2a1c';
const SERIF = `Georgia, 'Times New Roman', serif`;

/**
 * Lines where a lattice's values cross `level` (marching squares), each piece handed to `seg` in
 * the lattice's own measures. Where a square's corners are high and low crosswise, its middle decides.
 */
function contour(v: ArrayLike<number>, nx: number, nz: number, x0: number, z0: number, cell: number, level: number, seg: (ax: number, az: number, bx: number, bz: number) => void): void {
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i, a = v[k] - level, b = v[k + 1] - level, c = v[k + nx + 1] - level, d = v[k + nx] - level;
    const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const x = x0 + i * cell, z = z0 + j * cell;
    const T = (): [number, number] => [x + (cell * a) / (a - b), z], R = (): [number, number] => [x + cell, z + (cell * b) / (b - c)];
    const B = (): [number, number] => [x + (cell * d) / (d - c), z + cell], L = (): [number, number] => [x, z + (cell * a) / (a - d)];
    const s = (p: [number, number], q: [number, number]) => seg(p[0], p[1], q[0], q[1]);
    const mid = a + b + c + d > 0;
    switch (idx) {
      case 1: case 14: s(L(), T()); break;
      case 2: case 13: s(T(), R()); break;
      case 3: case 12: s(L(), R()); break;
      case 4: case 11: s(R(), B()); break;
      case 6: case 9: s(T(), B()); break;
      case 7: case 8: s(L(), B()); break;
      case 5: if (mid) { s(T(), R()); s(B(), L()); } else { s(L(), T()); s(R(), B()); } break;
      case 10: if (mid) { s(L(), T()); s(R(), B()); } else { s(T(), R()); s(B(), L()); } break;
    }
  }
}

/** A stretch of a world to map alone, in the world's coordinates: from `x0`, `z0` to `x1`, `z1`. */
export interface InkArea { x0: number; z0: number; x1: number; z1: number }

/**
 * Where the ink map of `pixels` across puts the world: its margin, the room for its title over it, how many pixels a metre is, how
 * tall the sheet is, and the point on it of a point of the world. (For what is drawn over the map afterwards: places' footprints.)
 * With an `area`, the map is of that stretch alone, at the scale that fills the sheet's breadth with it, and its key shorter.
 */
export function inkFrame(plan: { hx: number; hz: number }, pixels = 2400, area?: InkArea): { edge: number; head: number; scale: number; W: number; H: number; msz: number; X: (x: number) => number; Z: (z: number) => number; x0: number; z0: number } {
  const W = pixels, u = W / 2400, x0 = area ? area.x0 : -plan.hx, z0 = area ? area.z0 : -plan.hz;
  const across = area ? area.x1 - area.x0 : 2 * plan.hx, down = area ? area.z1 - area.z0 : 2 * plan.hz;
  // (The map as broad as the page, and as tall as the world, or the stretch, is deep at that scale.)
  const edge = 70 * u, head = 190 * u, foot = (area ? 300 : 470) * u, msx = W - 2 * edge, scale = msx / across, msz = down * scale;
  return { edge, head, scale, W, H: Math.round(head + msz + foot), msz, X: (x: number) => edge + (x - x0) * scale, Z: (z: number) => head + (z - z0) * scale, x0, z0 };
}

/**
 * What an ink map of a stretch of a world says over and under it, and draws on it besides the world's own: its title and the line
 * under it, and a way walked, drawn in red over the rest with its own line in the key.
 */
export interface InkAreaOptions { area: InkArea; title: string; subtitle: string; route?: [number, number][]; routeName?: string }

export function drawInkWorld(canvas: HTMLCanvasElement, w: WorldMap, opts: { pixels?: number; stretch?: InkAreaOptions } = {}): number {
  const W = opts.pixels ?? 2400, u = W / 2400, stretch = opts.stretch;
  const f = w.field, p = w.plan, hx = p.hx, hz = p.hz, nx = f.nx, nz = f.nz, h = f.data;
  const rng = new Rng(`world/${p.seed}`).fork('ink'), seed = Math.floor(rng.next() * 1e6);
  const { edge, head, scale, H, msz, X, Z, x0: ax0, z0: az0 } = inkFrame(p, W, stretch?.area), msx = W - 2 * edge;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  /** The lattice point nearest a point of the world. */
  const cellOf = (x: number, z: number) => Math.min(nz - 1, Math.max(0, Math.round((z - f.z0) / f.cell))) * nx + Math.min(nx - 1, Math.max(0, Math.round((x - f.x0) / f.cell)));

  // ---- paper
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 4200; k++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(120,96,60,0.035)' : 'rgba(255,255,255,0.09)';
    const r = rng.range(5, 34) * u;
    ctx.beginPath();
    ctx.ellipse(rng.range(0, W), rng.range(0, H), r, r * rng.range(0.4, 1), rng.range(0, Math.PI), 0, Math.PI * 2);
    ctx.fill();
  }
  const shade = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  shade.addColorStop(0, 'rgba(90,70,40,0)');
  shade.addColorStop(1, 'rgba(90,70,40,0.16)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.beginPath(); ctx.rect(edge, head, msx, msz); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  /** Lines from `contour`, stroked as one. */
  const strokeContour = (v: ArrayLike<number>, level: number, style: string, width: number, dash: number[] = []) => {
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath();
    contour(v, nx, nz, f.x0, f.z0, f.cell, level, (ax, az, bx, bz) => { ctx.moveTo(X(ax), Z(az)); ctx.lineTo(X(bx), Z(bz)); });
    ctx.stroke(); ctx.setLineDash([]);
  };

  // ---- the sea: lines following the coast, further apart the further out
  // (How far each point of the sea lies from land, in metres: two sweeps of the lattice, each taking the least of its neighbours' and the step to them.)
  const dist = new Float32Array(nx * nz);
  {
    const c = f.cell, c2 = c * Math.SQRT2;
    for (let k = 0; k < dist.length; k++) dist[k] = w.sea[k] ? 1e9 : 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!dist[k]) continue;
      let m = dist[k];
      if (i > 0) m = Math.min(m, dist[k - 1] + c);
      if (j > 0) { m = Math.min(m, dist[k - nx] + c); if (i > 0) m = Math.min(m, dist[k - nx - 1] + c2); if (i < nx - 1) m = Math.min(m, dist[k - nx + 1] + c2); }
      dist[k] = m;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (!dist[k]) continue;
      let m = dist[k];
      if (i < nx - 1) m = Math.min(m, dist[k + 1] + c);
      if (j < nz - 1) { m = Math.min(m, dist[k + nx] + c); if (i < nx - 1) m = Math.min(m, dist[k + nx + 1] + c2); if (i > 0) m = Math.min(m, dist[k + nx - 1] + c2); }
      dist[k] = m;
    }
    // (Three, close in: four, further out, ran together between the islands into a sea of rings.)
    for (const [k, px] of [[0, 3.5], [1, 7.5], [2, 13]] as const) {
      strokeContour(dist, (px * u) / scale, WATER, Math.max(0.7, (1.5 - k * 0.35) * u), k ? [(36 - k * 10) * u, (5 + k * 6) * u] : []);
    }
  }

  // ---- the relief: hachures down the fall of the ground
  const snowy = (k: number) => w.cover[k] === COVER.snow;
  {
    const sp = 5.2 * u, buckets = new Map<string, number[]>();
    for (let py = head; py < head + msz; py += sp) for (let px = edge; px < edge + msx; px += sp) {
      const sx = px + rng.range(-0.45, 0.45) * sp, sy = py + rng.range(-0.45, 0.45) * sp;
      const x = (sx - edge) / scale + ax0, z = (sy - head) / scale + az0, k = cellOf(x, z);
      if (w.sea[k] || w.lake[k] || snowy(k)) continue;
      // (The fall measured over a lattice step and a half each way: a cut one point wide is a river's bed, not a slope to hatch.)
      const c = f.cell * 1.5, gx = (f.at(x + c, z) - f.at(x - c, z)) / (2 * c), gz = (f.at(x, z + c) - f.at(x, z - c)) / (2 * c), s = Math.hypot(gx, gz);
      if (s < 0.06) continue;
      // (Down the fall; lit from the north-west, so the faces turned away from it are hatched the heavier.)
      const dx = -gx / s, dz = -gz / s, away = (1 + (dx * 0.6 + dz * 0.8)) / 2;
      // (And the higher the ground, the heavier: so the range stands out from the fells, whose slopes are often as steep, if lower.)
      const steep = Math.min(1, s / 0.75), wood = w.cover[k] === COVER.forest ? 0.7 : 1, high = 0.55 + 0.6 * Math.min(1, Math.max(0, (h[k] - 80) / 450));
      const width = Math.round((0.3 + 1.2 * steep + 0.5 * (high - 0.55)) * 4) / 4, alpha = Math.round(Math.min(1, (0.22 + 0.85 * steep) * (0.55 + 0.7 * away) * wood * high) * 5) / 5;
      if (alpha <= 0) continue;
      const len = sp * (0.75 + 0.35 * steep) / 2, key = `${width}/${alpha}`;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(sx - dx * len, sy - dz * len, sx + dx * len, sy + dz * len);
    }
    for (const [key, list] of buckets) {
      const [width, alpha] = key.split('/').map(Number);
      ctx.strokeStyle = INK; ctx.globalAlpha = alpha; ctx.lineWidth = width * u;
      ctx.beginPath();
      for (let q = 0; q < list.length; q += 4) { ctx.moveTo(list[q], list[q + 1]); ctx.lineTo(list[q + 2], list[q + 3]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- what lies on the land, by its marks
  const at = (sx: number, sy: number) => cellOf((sx - edge) / scale + ax0, (sy - head) / scale + az0);
  /** Points on a jittered grid `sp` pixels apart where the land is of kind `c`. */
  const scatter = (sp: number, c: number, chance: number, draw: (x: number, y: number) => void) => {
    for (let py = head; py < head + msz; py += sp) for (let px = edge; px < edge + msx; px += sp) {
      const sx = px + rng.range(0.1, 0.9) * sp, sy = py + rng.range(0.1, 0.9) * sp;
      if (w.cover[at(sx, sy)] !== c || !rng.chance(chance)) continue;
      draw(sx, sy);
    }
  };
  ctx.strokeStyle = INK;
  // Woods: little trees, a crown on a stem.
  ctx.lineWidth = Math.max(0.8, 1.1 * u); ctx.globalAlpha = 0.85;
  ctx.beginPath();
  scatter(8.5 * u, COVER.forest, 0.9, (x, y) => {
    const r = rng.range(2, 2.8) * u;
    ctx.moveTo(x + r, y - r); ctx.arc(x, y - r, r, 0, Math.PI * 2);
    ctx.moveTo(x, y); ctx.lineTo(x, y + r * 0.9);
  });
  ctx.stroke();
  // Fields: strips, a few parallel strokes to a field, each field turned its own way.
  ctx.lineWidth = Math.max(0.6, 0.8 * u); ctx.globalAlpha = 0.6;
  ctx.beginPath();
  scatter(20 * u, COVER.fields, 0.85, (x, y) => {
    const a = Math.floor(valueNoise2(x / (60 * u), y / (60 * u), seed) * 4) * (Math.PI / 4) + rng.range(-0.15, 0.15), ca = Math.cos(a), sa = Math.sin(a);
    const n = rng.int(3, 5), l = rng.range(6, 9) * u;
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 3.2 * u; ctx.moveTo(x - ca * l - sa * o, y - sa * l + ca * o); ctx.lineTo(x + ca * l - sa * o, y + sa * l + ca * o); }
  });
  ctx.stroke();
  // Heath and rough grazing: tufts.
  const tuft = (x: number, y: number, s: number) => { ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.4, y - s * 1.2); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 1.6); ctx.moveTo(x + s, y); ctx.lineTo(x + s * 0.4, y - s * 1.2); };
  ctx.lineWidth = Math.max(0.6, 0.9 * u); ctx.globalAlpha = 0.55;
  ctx.beginPath();
  scatter(17 * u, COVER.moor, 0.5, (x, y) => tuft(x, y, 2.4 * u));
  scatter(26 * u, COVER.pasture, 0.3, (x, y) => tuft(x, y, 1.8 * u));
  ctx.stroke();
  // Marsh: level dashes with rushes standing out of them.
  ctx.beginPath();
  scatter(12 * u, COVER.marsh, 0.8, (x, y) => { ctx.moveTo(x - 4 * u, y); ctx.lineTo(x + 4 * u, y); tuft(x, y - 0.5 * u, 1.4 * u); });
  ctx.stroke();
  // Shingle and sand by the sea: a stipple.
  ctx.fillStyle = INK; ctx.globalAlpha = 0.45;
  scatter(4.5 * u, COVER.shore, 0.8, (x, y) => ctx.fillRect(x, y, 1.1 * u, 1.1 * u));
  ctx.globalAlpha = 1;

  // ---- water on the land: rivers, then lakes over them
  ctx.strokeStyle = RIVER;
  for (const r of w.rivers) {
    // (In runs between lakes: a river is not drawn across one. It is drawn on into the sea, under the coast's line.)
    let run: number[] = [];
    const flush = () => {
      for (let q = 1; q < run.length; q++) {
        const [ax, az] = r.points[run[q - 1]], [bx, bz] = r.points[run[q]];
        ctx.lineWidth = Math.max(0.9 * u, r.width[run[q]] * scale * 0.8 + 0.5 * u);
        ctx.beginPath(); ctx.moveTo(X(ax), Z(az)); ctx.lineTo(X(bx), Z(bz)); ctx.stroke();
      }
      run = [];
    };
    r.points.forEach(([x, z], i) => {
      const k = cellOf(x, z);
      if (w.lake[k]) { flush(); return; }
      run.push(i);
    });
    flush();
  }
  {
    const v = new Float32Array(nx * nz);
    for (let k = 0; k < v.length; k++) v[k] = w.lake[k] ? w.lake[k] - h[k] : -1;
    strokeContour(v, 0, INK, Math.max(1, 1.6 * u));
    // Ripples on the lakes: short level strokes.
    ctx.strokeStyle = WATER; ctx.lineWidth = Math.max(0.7, 1 * u);
    ctx.beginPath();
    for (let py = head; py < head + msz; py += 7 * u) for (let px = edge; px < edge + msx; px += 13 * u) {
      const sx = px + rng.range(0, 6) * u, sy = py + rng.range(-1, 1) * u;
      if (!w.lake[at(sx, sy)] || !w.lake[at(sx - 4 * u, sy)] || !w.lake[at(sx + 4 * u, sy)]) continue;
      ctx.moveTo(sx - 3 * u, sy); ctx.quadraticCurveTo(sx, sy - 1.6 * u, sx + 3 * u, sy);
    }
    ctx.stroke();
  }

  // ---- the coast: a firm line round the land, over everything that runs into the sea
  {
    const v = new Float32Array(nx * nz);
    for (let k = 0; k < v.length; k++) v[k] = w.sea[k] ? Math.min(h[k], -0.5) : Math.max(h[k], 0.5);
    strokeContour(v, 0, INK, Math.max(1.4, 2.3 * u));
  }

  // ---- ways: roads a pair of lines, tracks single, paths dotted, ferries broken over the water
  const line = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([x, z], k) => (k ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); };
  for (const way of w.ways) {
    if (way.kind === 'ferry') { ctx.strokeStyle = RIVER; ctx.lineWidth = Math.max(1.2, 2 * u); ctx.setLineDash([10 * u, 6 * u]); line(way.points); ctx.stroke(); }
    else if (way.kind === 'path') { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 1.5 * u); ctx.setLineDash([1.2 * u, 4.2 * u]); line(way.points); ctx.stroke(); }
    else if (way.kind === 'track') { ctx.strokeStyle = INK; ctx.lineWidth = Math.max(0.9, 1.3 * u); line(way.points); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  for (const pass of [0, 1]) for (const way of w.ways) {
    if (way.kind !== 'road') continue;
    ctx.strokeStyle = pass ? PAPER : INK; ctx.lineWidth = (pass ? 2.4 : 5.2) * u;
    line(way.points); ctx.stroke();
  }

  // ---- labels, placed where they do not cover one another
  const boxes: [number, number, number, number][] = [];
  const free = (x0: number, y0: number, x1: number, y1: number) => boxes.every(([a, b, c, d]) => x1 < a || x0 > c || y1 < b || y0 > d) && x0 > edge && x1 < edge + msx && y0 > head && y1 < head + msz;
  /** A name beside a mark at (`x`, `y`), on whichever side is clear: right, left, above, below. */
  const label = (text: string, x: number, y: number, r: number, font: string, colour: string) => {
    ctx.font = font;
    const tw = ctx.measureText(text).width, th = parseFloat(font.match(/(\d+(\.\d+)?)px/)![1]);
    const tries: [number, number, CanvasTextAlign][] = [[x + r + 4 * u, y + th * 0.35, 'left'], [x - r - 4 * u, y + th * 0.35, 'right'], [x, y - r - 5 * u, 'center'], [x, y + r + th + 2 * u, 'center']];
    for (const [tx, ty, align] of tries) {
      const x0 = align === 'left' ? tx : align === 'right' ? tx - tw : tx - tw / 2, y0 = ty - th;
      if (!free(x0 - 2 * u, y0 - 2 * u, x0 + tw + 2 * u, ty + 3 * u)) continue;
      boxes.push([x0 - 2 * u, y0 - 2 * u, x0 + tw + 2 * u, ty + 3 * u]);
      ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 4 * u; ctx.strokeStyle = PAPER; ctx.globalAlpha = 0.85; ctx.strokeText(text, tx, ty); ctx.globalAlpha = 1;
      ctx.fillStyle = colour; ctx.fillText(text, tx, ty);
      return;
    }
  };
  const mark = (x: number, y: number, r: number) => boxes.push([x - r, y - r, x + r, y + r]);

  // The great peaks: a small mark, the name and the height.
  ctx.fillStyle = INK;
  const peaks = w.peaks.map((q) => {
    const x = X(q.x), y = Z(q.z), r = 6 * u;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.85, y + r * 0.55); ctx.lineTo(x - r * 0.85, y + r * 0.55); ctx.closePath(); ctx.fill();
    mark(x, y, r);
    return q;
  });
  // Towns: huddles of buildings, and for the harbour a quay out into the water.
  for (const t of w.towns) {
    const x = X(t.x), y = Z(t.z), n = t.kind === 'village' ? 3 : t.kind === 'town' ? 8 : 10, spread = (t.kind === 'village' ? 4 : 8) * u;
    ctx.fillStyle = INK;
    for (let i = 0; i < n; i++) { const s = rng.range(2.2, 3.6) * u; ctx.fillRect(x + rng.range(-spread, spread) - s / 2, y + rng.range(-spread, spread) - s / 2, s, s); }
    if (t.kind === 'village') { ctx.lineWidth = 1.2 * u; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - 9 * u); ctx.lineTo(x, y - 3 * u); ctx.moveTo(x - 2.5 * u, y - 7 * u); ctx.lineTo(x + 2.5 * u, y - 7 * u); ctx.stroke(); }
    else { ctx.lineWidth = 1.4 * u; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(x, y, spread + 4 * u, 0, Math.PI * 2); ctx.stroke(); }
    mark(x, y, spread + 4 * u);
  }
  // The places of adventure, in red: an island's house a ring with a dot, a valley's a square with a cross, a mountain top's a triangle,
  // a coastal town's a diamond with a dot.
  const placeMark = (q: WorldPlace, x: number, y: number, r: number) => {
    ctx.strokeStyle = RED; ctx.fillStyle = RED; ctx.lineWidth = 2.2 * u;
    ctx.beginPath();
    if (q.kind === 'island') { ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
    else if (q.kind === 'valley') { ctx.rect(x - r, y - r, 2 * r, 2 * r); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x, y + r * 0.6); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x + r * 0.6, y); ctx.stroke(); }
    else if (q.kind === 'coast') { ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.2, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r * 1.2, y); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r, y + r * 0.7); ctx.lineTo(x - r, y + r * 0.7); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y + r * 0.1, r * 0.25, 0, Math.PI * 2); ctx.fill(); }
  };
  // Each place's ground, as it is fitted to the land: its outline, a line at each step between terraces; and for an island, its
  // landing and the way up to the house from it, dotted. (Drawn to scale: the house's ground is some fifty metres by sixty.)
  for (const q of w.places) {
    const g = q.ground;
    if (!g) continue;
    const c = Math.cos(g.turn), sn = Math.sin(g.turn), pt = (a: number, b: number): [number, number] => [X(g.x + a * c - b * sn), Z(g.z + a * sn + b * c)];
    ctx.strokeStyle = RED; ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sa, sb], k) => { const [x, y] = pt((sa * g.w) / 2, (sb * g.d) / 2); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.stroke();
    for (let t = 0; t < g.terraces.length - 1; t++) { const b = g.terraces[t].to, [x0, y0] = pt(-g.w / 2, b), [x1, y1] = pt(g.w / 2, b); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    if (q.landing) {
      ctx.setLineDash([1.2 * u, 3.6 * u]); ctx.lineWidth = 1.4 * u;
      const [fx, fy] = pt(0, g.d / 2);
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(X(q.landing.x), Z(q.landing.z)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(X(q.landing.x), Z(q.landing.z), 2.6 * u, 0, Math.PI * 2); ctx.fill();
    }
  }
  // A way walked, on a map of a stretch: red over the paper, as the places it joins are.
  if (stretch?.route && stretch.route.length > 1) {
    const r = stretch.route;
    ctx.beginPath(); r.forEach(([x, z], k) => { if (k) ctx.lineTo(X(x), Z(z)); else ctx.moveTo(X(x), Z(z)); });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = PAPER; ctx.lineWidth = 7 * u; ctx.stroke();
    ctx.strokeStyle = RED; ctx.lineWidth = 3.2 * u; ctx.setLineDash([12 * u, 5 * u]); ctx.stroke(); ctx.setLineDash([]);
    for (let k = 0; k < r.length; k += 6) mark(X(r[k][0]), Z(r[k][1]), 4 * u);
  }
  for (const q of w.places) { const x = X(q.x), y = Z(q.z); placeMark(q, x, y, 7 * u); mark(x, y, 8 * u); }
  // Their names, most important first, so they get the clearest places.
  for (const q of w.places) label(q.name, X(q.x), Z(q.z), 8 * u, `italic 600 ${17 * u}px ${SERIF}`, RED);
  peaks.forEach((q, i) => label(`${w.peakNames[i]} · ${Math.round(q.y)} m`, X(q.x), Z(q.z), 7 * u, `italic ${15 * u}px ${SERIF}`, INK));
  for (const t of w.towns) {
    const big = t.kind !== 'village';
    label(big ? t.name.toUpperCase() : t.name, X(t.x), Z(t.z), (big ? 12 : 6) * u, big ? `${15 * u}px ${SERIF}` : `italic ${14 * u}px ${SERIF}`, INK);
  }

  // The names of the sea, the upland and the range, spaced out across them, along the run of the coast. (Not on a map of a stretch.)
  if (!stretch) {
    const spots: Record<string, [number, number][]> = { sea: [], bay: [], upland: [], range: [] };
    for (let z = -hz + hz / 50; z < hz; z += hz / 25) for (let x = -hx + hx / 50; x < hx; x += hx / 25) {
      const zn = zonesAt(p, x, z), k = cellOf(x, z);
      if (w.sea[k] && dist[k] > 300 && zn.d0 < -300) spots.sea.push([x, z]);
      if (w.sea[k] && dist[k] > 80 && zn.d0 > 300) spots.bay.push([x, z]);
      if (zn.wU > 0.7) spots.upland.push([x, z]);
      if (zn.wR > 0.8) spots.range.push([x, z]);
    }
    let a = p.inland + Math.PI / 2;
    while (a > Math.PI / 2) a -= Math.PI;
    while (a < -Math.PI / 2) a += Math.PI;
    for (const [key, size] of [['sea', 46], ['bay', 30], ['upland', 38], ['range', 44]] as const) {
      const list = spots[key];
      if (!list.length) continue;
      const text = w.regions[key].toUpperCase().split('').join(String.fromCharCode(8202) + ' ');
      ctx.font = `italic ${size * u}px ${SERIF}`;
      // Where in its zone a name goes: near the zone's middle, but where it covers no mark or name already drawn, as near as may be.
      // (Set at the middle alone, a zone's name lay across the places in it.)
      const half2 = Math.min(msx * 0.4, ctx.measureText(text).width / 2), mx = list.reduce((q, [x]) => q + x, 0) / list.length, mz = list.reduce((q, [, z]) => q + z, 0) / list.length;
      let best = list[0], bestScore = Infinity;
      for (const [x, z] of list) {
        const sx = X(x), sy = Z(z), ca = Math.cos(a), sa = Math.sin(a);
        let covered = 0;
        for (const [x0, y0, x1, y1] of boxes) {
          // (How far the box's middle lies along the name and across it.)
          const dx = (x0 + x1) / 2 - sx, dy = (y0 + y1) / 2 - sy, along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
          if (Math.abs(along) < half2 + (x1 - x0) / 2 && Math.abs(across) < size * u * 0.7 + (y1 - y0) / 2) covered++;
        }
        const score = covered * 1e6 + Math.hypot(x - mx, z - mz);
        if (score < bestScore) { bestScore = score; best = [x, z]; }
      }
      ctx.save();
      ctx.translate(X(best[0]), Z(best[1])); ctx.rotate(a);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // (Lettered over the hachures, with the paper showing round each letter so it can be read.)
      ctx.lineWidth = 7 * u; ctx.strokeStyle = PAPER; ctx.globalAlpha = 0.75;
      ctx.strokeText(text, 0, 0, msx * 0.8);
      ctx.globalAlpha = 0.8; ctx.fillStyle = key === 'sea' || key === 'bay' ? RIVER : INK;
      ctx.fillText(text, 0, 0, msx * 0.8);
      ctx.restore();
    }
  }
  ctx.restore();

  // ---- the frame: two lines, with every half kilometre between them in bars
  {
    const o = 14 * u, km = 500 * scale;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * u;
    ctx.strokeRect(edge, head, msx, msz);
    ctx.lineWidth = 2.6 * u;
    ctx.strokeRect(edge - o, head - o, msx + 2 * o, msz + 2 * o);
    ctx.fillStyle = INK;
    for (let i = 0; i * km < msx; i += 2) {
      const a = i * km, b = Math.min(msx, (i + 1) * km);
      ctx.fillRect(edge + a, head - o * 0.62, b - a, o * 0.38);
      ctx.fillRect(edge + a, head + msz + o * 0.24, b - a, o * 0.38);
    }
    for (let i = 0; i * km < msz; i += 2) {
      const a = i * km, b = Math.min(msz, (i + 1) * km);
      ctx.fillRect(edge - o * 0.62, head + a, o * 0.38, b - a);
      ctx.fillRect(edge + msx + o * 0.24, head + a, o * 0.38, b - a);
    }
  }

  // ---- heading, scale and the north point
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `italic ${58 * u}px ${SERIF}`;
  ctx.fillText(stretch ? stretch.title : `The Country of ${w.name}`, W / 2, 92 * u, W - 2 * edge);
  ctx.font = `${22 * u}px ${SERIF}`;
  ctx.fillText(stretch ? stretch.subtitle : `with ${w.regions.sea}, ${w.regions.bay}, ${w.regions.upland} and ${w.regions.range}; the places of adventure in red`, W / 2, 132 * u, W - 2 * edge);
  {
    // (A kilometre in tenths; or, where a kilometre would take more than half the sheet, half a kilometre in tenths of that.)
    const half = 1000 * scale > msx * 0.55, step = half ? 50 : 100, sx = edge, sy = 160 * u, kmPx = step * scale;
    ctx.lineWidth = 1.4 * u; ctx.strokeStyle = INK;
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? PAPER : INK; ctx.fillRect(sx + i * kmPx, sy - 5 * u, kmPx, 7 * u); }
    ctx.strokeRect(sx, sy - 5 * u, 10 * kmPx, 7 * u);
    ctx.fillStyle = INK; ctx.font = `italic ${18 * u}px ${SERIF}`; ctx.textAlign = 'left';
    ctx.fillText(half ? 'half a kilometre' : 'one kilometre', sx + 10 * kmPx + 12 * u, sy + 2 * u);
    const nx0 = W - edge - 20 * u, ny0 = 128 * u, r = 26 * u;
    ctx.beginPath(); ctx.moveTo(nx0, ny0 - r); ctx.lineTo(nx0 + r * 0.38, ny0 + r * 0.6); ctx.lineTo(nx0, ny0 + r * 0.25); ctx.lineTo(nx0 - r * 0.38, ny0 + r * 0.6); ctx.closePath(); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = `${22 * u}px ${SERIF}`;
    ctx.fillText('N', nx0, ny0 - r - 8 * u);
  }

  // ---- under the map: the key, and the places listed
  {
    const top = head + msz + 50 * u, lh = 25 * u;
    ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.strokeStyle = INK;
    ctx.font = `italic ${24 * u}px ${SERIF}`;
    ctx.fillText('Key', edge, top);
    ctx.font = `${16 * u}px ${SERIF}`;
    const keys: [string, (x: number, y: number) => void][] = [
      ['Road', (x, y) => { ctx.lineWidth = 5.2 * u; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 * u, y); ctx.stroke(); ctx.lineWidth = 2.4 * u; ctx.strokeStyle = PAPER; ctx.stroke(); }],
      ['Track', (x, y) => { ctx.lineWidth = 1.3 * u; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 * u, y); ctx.stroke(); }],
      ['Path', (x, y) => { ctx.lineWidth = 1.5 * u; ctx.strokeStyle = INK; ctx.setLineDash([1.2 * u, 4.2 * u]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 * u, y); ctx.stroke(); ctx.setLineDash([]); }],
      ['Ferry', (x, y) => { ctx.lineWidth = 2 * u; ctx.strokeStyle = RIVER; ctx.setLineDash([10 * u, 6 * u]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 * u, y); ctx.stroke(); ctx.setLineDash([]); }],
      ['River', (x, y) => { ctx.lineWidth = 2 * u; ctx.strokeStyle = RIVER; ctx.beginPath(); ctx.moveTo(x, y + 3 * u); ctx.quadraticCurveTo(x + 17 * u, y - 6 * u, x + 34 * u, y); ctx.stroke(); }],
      ['Town or harbour', (x, y) => { ctx.fillStyle = INK; for (let i = 0; i < 6; i++) ctx.fillRect(x + 10 * u + (i % 3) * 5 * u, y - 5 * u + Math.floor(i / 3) * 5 * u, 3.4 * u, 3.4 * u); ctx.lineWidth = 1.4 * u; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(x + 16 * u, y - 1 * u, 11 * u, 0, Math.PI * 2); ctx.stroke(); }],
      ['Village', (x, y) => { ctx.fillStyle = INK; for (let i = 0; i < 3; i++) ctx.fillRect(x + 11 * u + i * 4.5 * u, y - 1 * u, 3 * u, 3 * u); ctx.lineWidth = 1.2 * u; ctx.beginPath(); ctx.moveTo(x + 15.5 * u, y - 9 * u); ctx.lineTo(x + 15.5 * u, y - 3 * u); ctx.moveTo(x + 13 * u, y - 7 * u); ctx.lineTo(x + 18 * u, y - 7 * u); ctx.stroke(); }],
      ['Great peak', (x, y) => { ctx.fillStyle = INK; const r = 6 * u; ctx.beginPath(); ctx.moveTo(x + 16 * u, y - r); ctx.lineTo(x + 16 * u + r * 0.85, y + r * 0.55); ctx.lineTo(x + 16 * u - r * 0.85, y + r * 0.55); ctx.closePath(); ctx.fill(); }],
      ['Woods', (x, y) => { ctx.lineWidth = 1.1 * u; ctx.strokeStyle = INK; ctx.beginPath(); for (let i = 0; i < 4; i++) { const tx = x + 4 * u + i * 8 * u, r = 2.4 * u; ctx.moveTo(tx + r, y - r); ctx.arc(tx, y - r, r, 0, Math.PI * 2); ctx.moveTo(tx, y); ctx.lineTo(tx, y + r); } ctx.stroke(); }],
      ['Fields', (x, y) => { ctx.lineWidth = 0.8 * u; ctx.strokeStyle = INK; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(x + 6 * u, y - 5 * u + i * 3.2 * u); ctx.lineTo(x + 28 * u, y - 5 * u + i * 3.2 * u); } ctx.stroke(); }],
      ['Heath, rough grazing', (x, y) => { ctx.lineWidth = 0.9 * u; ctx.strokeStyle = INK; ctx.beginPath(); for (let i = 0; i < 3; i++) tuft(x + 7 * u + i * 10 * u, y + 3 * u, 2.4 * u); ctx.stroke(); }],
      ['Hachures: the steeper, the darker', (x, y) => { ctx.strokeStyle = INK; ctx.beginPath(); for (let i = 0; i < 9; i++) { ctx.lineWidth = (0.4 + i * 0.18) * u; ctx.moveTo(x + i * 4 * u, y - 6 * u); ctx.lineTo(x + i * 4 * u, y + 4 * u); } ctx.stroke(); }],
    ];
    if (stretch?.route) keys.unshift([stretch.routeName ?? 'The way walked', (x, y) => { ctx.strokeStyle = RED; ctx.lineWidth = 3.2 * u; ctx.setLineDash([12 * u, 5 * u]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 * u, y); ctx.stroke(); ctx.setLineDash([]); }]);
    keys.forEach(([text, draw], i) => {
      const rows = stretch ? 5 : 6, col = Math.floor(i / rows), row = i % rows, x = edge + col * (stretch ? 450 : 330) * u, y = top + 38 * u + row * lh * 1.25;
      draw(x, y - 5 * u);
      ctx.fillStyle = INK; ctx.font = `${16 * u}px ${SERIF}`; ctx.textAlign = 'left';
      ctx.fillText(text, x + 46 * u, y);
    });
    // The places of adventure: by kind, each with its height.
    // (With how its ground is fitted: on one level, or on two or three terraces.)
    const fitted = (q: WorldPlace) => (q.ground && q.ground.terraces.length > 1 ? `, on ${q.ground.terraces.length === 2 ? 'two' : 'three'} terraces` : '');
    const kinds: [WorldPlace['kind'], string, (q: WorldPlace) => string][] = [
      ['island', 'Houses on islands', (q) => `${q.name}, ${Math.round(q.y)} m over the sea${fitted(q)}`],
      ['valley', 'Houses at the heads of glens', (q) => `${q.name}, ${Math.round(q.y)} m${fitted(q)}`],
      ['mountain', 'Hospices on mountain tops', (q) => `${q.name}, ${Math.round(q.y)} m${q.ground ? `, the hospice at ${Math.round(q.ground.terraces[q.ground.terraces.length - 1].y)} m` : ''}${fitted(q)}`],
      ['coast', 'Houses above harbour towns', (q) => `${q.name}, ${Math.round(q.y)} m over the sea${fitted(q)}`],
    ];
    // (Two by two beside the key: three abreast ran off the paper's edge with four kinds. Not on a map of a stretch, whose places are
    // named on it, and whose key runs across the sheet.)
    if (!stretch) kinds.forEach(([kind, title, text], c) => {
      const x = edge + 700 * u + (c % 2) * 820 * u, y0 = top + Math.floor(c / 2) * 200 * u;
      placeMark({ kind } as WorldPlace, x + 8 * u, y0 - 8 * u, 7 * u);
      ctx.fillStyle = INK; ctx.font = `italic ${22 * u}px ${SERIF}`; ctx.textAlign = 'left';
      ctx.fillText(title, x + 26 * u, y0);
      ctx.font = `${15 * u}px ${SERIF}`;
      w.places.filter((q) => q.kind === kind).forEach((q, i) => { ctx.fillStyle = INK; ctx.fillText(`${q.n}. ${text(q)}`, x, y0 + 34 * u + i * lh * 1.1, 780 * u); });
    });
  }
  return H;
}

/** The world as shaded relief, coloured by what lies on the land: for judging it, beside the ink map. */
export function drawWorldRelief(canvas: HTMLCanvasElement, w: WorldMap, pixels = 2000): void {
  const f = w.field, hx = w.plan.hx, hz = w.plan.hz, px = (2 * hx) / pixels, W = pixels, WH = Math.round((2 * hz) / px);
  canvas.width = W; canvas.height = WH;
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(W, WH), d = img.data;
  const C = COVER, colour: Record<number, [number, number, number]> = {
    [C.sea]: [52, 86, 128], [C.lake]: [70, 110, 150], [C.shore]: [214, 200, 160], [C.marsh]: [120, 140, 110], [C.fields]: [196, 186, 120],
    [C.pasture]: [140, 170, 100], [C.forest]: [60, 100, 60], [C.moor]: [150, 130, 110], [C.rock]: [150, 145, 140], [C.snow]: [240, 242, 245],
  };
  for (let j = 0; j < WH; j++) for (let i = 0; i < W; i++) {
    const x = -hx + i * px, z = -hz + j * px;
    const gx = (f.at(x + px, z) - f.at(x - px, z)) / (2 * px), gz = (f.at(x, z + px) - f.at(x, z - px)) / (2 * px);
    const nl = Math.hypot(gx * 2, 1, gz * 2), sh = Math.max(0, (gx * 2 * 0.5 + 0.75 + gz * 2 * 0.43) / nl);
    const k = Math.min(f.nz - 1, Math.max(0, Math.round((z - f.z0) / f.cell))) * f.nx + Math.min(f.nx - 1, Math.max(0, Math.round((x - f.x0) / f.cell)));
    const c = w.cover[k], col = colour[c], lit = c === C.sea || c === C.lake ? 1 : 0.35 + 0.8 * sh, deep = c === C.sea ? Math.max(0.55, 1 + f.data[k] / 80) : 1;
    const o = (j * W + i) * 4;
    d[o] = col[0] * lit * deep; d[o + 1] = col[1] * lit * deep; d[o + 2] = col[2] * lit * deep; d[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const X = (x: number) => (x + hx) / px, Z = (z: number) => (z + hz) / px;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgb(60,100,160)';
  for (const r of w.rivers) { ctx.lineWidth = 1; ctx.beginPath(); r.points.forEach(([x, z], k) => (k ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); }
  const style: Record<string, [string, number, number[]]> = { road: ['rgb(150,30,20)', 2.5, []], track: ['rgb(110,70,30)', 1.2, []], path: ['rgb(20,20,20)', 1.2, [3, 4]], ferry: ['rgb(200,230,255)', 1.2, [6, 5]] };
  for (const way of w.ways) { const [c, lw, dash] = style[way.kind]; ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.setLineDash(dash); ctx.beginPath(); way.points.forEach(([x, z], k) => (k ? ctx.lineTo(X(x), Z(z)) : ctx.moveTo(X(x), Z(z)))); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const t of w.towns) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(X(t.x), Z(t.z), t.kind === 'village' ? 3 : 6, 0, Math.PI * 2); ctx.fill(); }
  for (const q of w.places) {
    ctx.strokeStyle = q.kind === 'island' ? 'rgb(230,40,40)' : q.kind === 'valley' ? 'rgb(250,150,20)' : q.kind === 'coast' ? 'rgb(20,170,200)' : 'rgb(170,60,230)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(X(q.x), Z(q.z), 9, 0, Math.PI * 2); ctx.stroke();
  }
}
