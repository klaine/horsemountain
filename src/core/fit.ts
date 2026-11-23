/**
 * A house's ground fitted to the land found, rather than land looked for to fit the house: the
 * ground the house and its forecourt stand on, levelled where the land is near level, and terraced
 * where it slopes (one, two or three level steps down its depth, no step higher than a retaining wall
 * should be), at whatever heights take the least earth away and bring the least in. Round it the land
 * is eased back into its own shape over a bank no steeper than earth lies. ("Best found location can be
 * then slightly flattened or smoothed in places for a town or other needs if must, but terraced
 * adaptations are good also.")
 *
 * A ground is a rectangle `w` metres across (its front) by `d` deep, about (`x`, `z`), turned by `turn`
 * (as the islands' and the valleys' frames are turned): a point `a` across and `b` back from its middle
 * lies at x + a·cos(turn) − b·sin(turn), z + a·sin(turn) + b·cos(turn); its front is the side at b = d/2.
 */

export interface Ground {
  x: number; z: number; turn: number; w: number; d: number;
  /** The level steps, from the back (b = −d/2) to the front: each reaches to `to` (in b) and stands at `y`. */
  terraces: { to: number; y: number }[];
  /** How much earth is moved, as a depth over the whole ground (metres); the most cut or filled at any point; and the most cut and filled. */
  work: number;
  most: number;
}

const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
/** The highest a step between two terraces may be: what a retaining wall of drystone, or a bank, holds. */
export const MAX_STEP = 3;

/**
 * The best ground of `w` by `d` at (`x`, `z`), turned by `turn`, on the land `height` gives: as one level,
 * or two or three terraces down its depth, whichever moves least earth for the steps it costs.
 */
export function fitGround(height: (x: number, z: number) => number, x: number, z: number, turn: number, w: number, d: number, spacing = 4): Ground {
  const c = Math.cos(turn), s = Math.sin(turn), cols = Math.max(2, Math.round(w / spacing) + 1), rows = Math.max(2, Math.round(d / spacing) + 1);
  const H: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const b = -d / 2 + (d * r) / (rows - 1), row: number[] = [];
    for (let q = 0; q < cols; q++) { const a = -w / 2 + (w * q) / (cols - 1); row.push(height(x + a * c - b * s, z + a * s + b * c)); }
    H.push(row);
  }
  let best: Ground | null = null, bestCost = Infinity;
  for (let T = 1; T <= 3; T++) {
    // Each terrace at the middle height of the land under it (which moves the least earth), then held within a step of the last.
    const levels: number[] = [], bounds: number[] = [];
    for (let t = 0; t < T; t++) {
      const r0 = Math.round((t * (rows - 1)) / T), r1 = Math.round(((t + 1) * (rows - 1)) / T), under: number[] = [];
      for (let r = r0; r <= r1; r++) under.push(...H[r]);
      under.sort((p, q) => p - q);
      levels.push(under[Math.floor(under.length / 2)]);
      bounds.push(-d / 2 + (d * (t + 1)) / T);
    }
    for (let t = 1; t < T; t++) levels[t] = Math.max(levels[t - 1] - MAX_STEP, Math.min(levels[t - 1] + MAX_STEP, levels[t]));
    let sum = 0, most = 0;
    for (let r = 0; r < rows; r++) {
      const b = -d / 2 + (d * r) / (rows - 1), t = Math.min(T - 1, Math.floor(((b + d / 2) / d) * T - 1e-9));
      for (let q = 0; q < cols; q++) { const e = Math.abs(H[r][q] - levels[Math.max(0, t)]); sum += e; most = Math.max(most, e); }
    }
    const work = sum / (rows * cols);
    // (A terrace more is worth half a metre of earth over the whole ground: the house is easier built, and looks, on one level.)
    const cost = work + 0.5 * (T - 1);
    if (cost < bestCost) { bestCost = cost; best = { x, z, turn, w, d, terraces: levels.map((y, t) => ({ to: bounds[t], y })), work, most }; }
  }
  return best!;
}

/** Where a point lies on a ground: how far across (`a`) and back (`b`) from its middle. */
function local(g: Ground, x: number, z: number): [number, number] {
  const dx = x - g.x, dz = z - g.z, c = Math.cos(g.turn), s = Math.sin(g.turn);
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** How far beyond a ground its banks reach at most: room for a bank of the highest cut or fill at the slope earth lies at, and more. */
export function bankReach(g: Ground): number {
  return 14 + 2 * g.most;
}

/**
 * The land's height at a point once a ground is made on it, given the land's own height there: the
 * terrace's level on the ground (a short steep bank between two terraces, as a retaining wall's face
 * would be at a metre), and beyond it the land eased back into its own shape over a bank half again
 * as broad as it is high, and six metres at least.
 */
export function groundHeight(g: Ground, x: number, z: number, natural: number): number {
  const [a, b] = local(g, x, z);
  const out = Math.max(Math.abs(a) - g.w / 2, Math.abs(b) - g.d / 2);
  const reach = bankReach(g);
  if (out >= reach) return natural;
  // The level at this depth: each terrace's, eased into the next over the metre at their meeting.
  const bb = Math.max(-g.d / 2, Math.min(g.d / 2, b));
  let level = g.terraces[0].y;
  for (let t = 1; t < g.terraces.length; t++) level += (g.terraces[t].y - g.terraces[t - 1].y) * smooth((bb - g.terraces[t - 1].to + 0.5) / 1);
  if (out <= 0) return level;
  // (No broader than the ground's reach, so that at its edge the land is its own again, with no step.)
  const bank = Math.min(reach, Math.max(6, 1.5 * Math.abs(natural - level)));
  return level + (natural - level) * smooth(out / bank);
}

/** The land's height with every ground near a point made on it. */
export function withGrounds(grounds: Ground[], x: number, z: number, natural: number): number {
  let y = natural;
  for (const g of grounds) {
    const r = bankReach(g) + Math.hypot(g.w, g.d) / 2;
    if (Math.abs(x - g.x) > r || Math.abs(z - g.z) > r) continue;
    y = groundHeight(g, x, z, y);
  }
  return y;
}

/**
 * How much of the land's own small unevenness is left at a point near grounds, 0 to 1: none on a
 * ground, all of it six metres beyond its edge (the narrowest bank). For laying finer detail on land
 * the grounds are already made on, without making them a second time.
 */
export function groundsOpen(grounds: Ground[], x: number, z: number): number {
  let open = 1;
  for (const g of grounds) {
    const r = bankReach(g) + Math.hypot(g.w, g.d) / 2;
    if (Math.abs(x - g.x) > r || Math.abs(z - g.z) > r) continue;
    const [a, b] = local(g, x, z), out = Math.max(Math.abs(a) - g.w / 2, Math.abs(b) - g.d / 2);
    open = Math.min(open, smooth(out / 6));
  }
  return open;
}
