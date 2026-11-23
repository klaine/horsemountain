/**
 * A way's bed (`route.ts` lays where it goes): its line and the height of its surface along it, and the land at a metre with the bed
 * cut and filled into it (`withWay`), which every square a way passes through makes alike, so that squares still meet exactly. Apart
 * from `route.ts`, which reads the world, so that the workers making squares need not.
 */

/** A way's bed: its middle line, a point every `STEP` metres, the height of its surface at each, and half its breadth. */
export interface Way { points: [number, number][]; heights: number[]; half: number }

/** How far apart the points of a way's line lie; half a cart track's breadth; how far its bed may reach out to the land. */
export const WAY = { step: 4, half: 2.4, shoulder: 0.6, bankMost: 16, smooth: 32 };
/** How far from a way's middle anything of it reaches: its bed, its shoulder and the broadest bank. */
export const WAY_REACH = WAY.half + WAY.shoulder + WAY.bankMost + 1;

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

/** A line's length, on the level. */
export function lengthOf(line: [number, number][]): number {
  let s = 0;
  for (let k = 1; k < line.length; k++) s += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]);
  return s;
}

/** A line laid again with its points `step` apart along it, its ends kept. */
export function evenly(line: [number, number][], step: number): [number, number][] {
  const total = lengthOf(line), count = Math.max(1, Math.round(total / step)), out: [number, number][] = [line[0]];
  let k = 1, segStart = 0;
  for (let c = 1; c < count; c++) {
    const want = (c * total) / count;
    while (k < line.length - 1 && segStart + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]) < want) { segStart += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]); k++; }
    const len = Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]), t = len > 0 ? (want - segStart) / len : 0;
    out.push([line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t, line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t]);
  }
  out.push(line[line.length - 1]);
  return out;
}

/**
 * A way's bed along a line: the land's height under each point (`landAt`, the land the squares at a metre are made from), drawn out
 * smooth along the way over some thirty metres either side, so that it climbs and falls evenly where the land is lumpy; the land cut to
 * it and filled up to it about (`withWay`). The ends are the land's own, so that a way comes onto a house's ground as the ground lies.
 */
export function gradeWay(line: [number, number][], landAt: (x: number, z: number) => number): Way {
  return { points: line, heights: gradeHeights(line.map(([x, z]) => landAt(x, z))), half: WAY.half };
}

/** A way's bed from the land's heights under its points, drawn out smooth along it, its ends the land's own (`gradeWay`). */
export function gradeHeights(land: number[]): number[] {
  const r = Math.max(1, Math.round(WAY.smooth / WAY.step));
  let h = land.slice();
  // (Twice over, a running mean each time: the second takes the corners off where the first leaves them.)
  for (let pass = 0; pass < 2; pass++) {
    const next = h.slice();
    for (let k = 0; k < h.length; k++) {
      let s = 0, c = 0;
      for (let d = -r; d <= r; d++) { const q = Math.min(h.length - 1, Math.max(0, k + d)); s += h[q]; c++; }
      next[k] = s / c;
    }
    h = next;
  }
  for (let k = 0; k < h.length; k++) { const t = smooth(Math.min(k, h.length - 1 - k) / r); h[k] = land[k] + (h[k] - land[k]) * t; }
  return h.map((v) => Math.round(v * 1000) / 1000);
}

/**
 * Finds the nearest point of a way's middle line to any point within `WAY_REACH` of it, quickly: its stretches filed in cells of 32
 * metres by every cell they come within reach of, so that every stretch within reach of a point is in that point's cell, and the
 * nearest is found the same whichever square asks.
 */
export class WayIndex {
  private readonly cells = new Map<string, number[]>();
  private readonly along: number[] = [0];
  constructor(readonly way: Way, private readonly size = 32) {
    const p = way.points;
    for (let k = 1; k < p.length; k++) this.along.push(this.along[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
    for (let k = 1; k < p.length; k++) {
      const x0 = Math.min(p[k - 1][0], p[k][0]) - WAY_REACH, x1 = Math.max(p[k - 1][0], p[k][0]) + WAY_REACH;
      const z0 = Math.min(p[k - 1][1], p[k][1]) - WAY_REACH, z1 = Math.max(p[k - 1][1], p[k][1]) + WAY_REACH;
      for (let j = Math.floor(z0 / size); j <= Math.floor(z1 / size); j++) for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++) {
        const key = `${i},${j}`, list = this.cells.get(key);
        if (list) list.push(k); else this.cells.set(key, [k]);
      }
    }
  }
  /** Whether any of the way reaches into a stretch of ground. */
  touches(x0: number, z0: number, x1: number, z1: number): boolean {
    for (let j = Math.floor(z0 / this.size); j <= Math.floor(z1 / this.size); j++) for (let i = Math.floor(x0 / this.size); i <= Math.floor(x1 / this.size); i++) if (this.cells.has(`${i},${j}`)) return true;
    return false;
  }
  /** The nearest point of the middle line within reach: how far off (`d`), to which side (`off`, signed, + to the right going along), how far along, and the bed's height there. */
  near(x: number, z: number): { d: number; off: number; s: number; y: number } | null {
    const list = this.cells.get(`${Math.floor(x / this.size)},${Math.floor(z / this.size)}`);
    if (!list) return null;
    const p = this.way.points, h = this.way.heights;
    let best = Infinity, bk = -1, bt = 0;
    for (const k of list) {
      const ax = p[k - 1][0], az = p[k - 1][1], dx = p[k][0] - ax, dz = p[k][1] - az, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < best) { best = d; bk = k; bt = t; }
    }
    if (bk < 0 || best > WAY_REACH) return null;
    const ax = p[bk - 1][0], az = p[bk - 1][1], dx = p[bk][0] - ax, dz = p[bk][1] - az;
    // (Which side: the cross of the way's direction with the point. Right of the way, going along it, is +.)
    const side = dx * (z - az) - dz * (x - ax) < 0 ? 1 : -1;
    return { d: best, off: best * side, s: this.along[bk - 1] + (this.along[bk] - this.along[bk - 1]) * bt, y: h[bk - 1] + (h[bk] - h[bk - 1]) * bt };
  }
}

/**
 * The land at a point with a way's bed made in it: level across on the bed and its shoulder, at the bed's height; then a bank out to
 * the land as it was, half again as broad as it is high (two metres at least, `WAY.bankMost` at most). A function of where the point
 * lies and of the land there alone, so that two squares made apart meet along their edge as they did.
 */
export function withWay(ix: WayIndex, x: number, z: number, natural: number): number {
  const n = ix.near(x, z);
  if (!n) return natural;
  const bed = ix.way.half + WAY.shoulder;
  if (n.d <= bed) return n.y;
  const bank = Math.min(WAY.bankMost, Math.max(2, Math.abs(natural - n.y) * 1.6));
  return n.y + (natural - n.y) * smooth((n.d - bed) / bank);
}

/** How far to one side of a way's middle a point is, for the ground's material (its track: plus a hundred), or nothing if it is not near; for every way given. */
export function trackField(ixs: WayIndex[], x: number, z: number): number {
  for (const ix of ixs) { const n = ix.near(x, z); if (n && Math.abs(n.off) < 6) return 100 + n.off; }
  return 0;
}
