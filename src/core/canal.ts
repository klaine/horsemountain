import { BrickCountry } from './brick';
import { clearOfWalls, planCorridor, planDouble, planNarrow, planOpen, Shell, wallsAtBack } from './interior';
import { Rng } from './rng';
import { Building, BuildingPlan, CanalWork } from './site';

/**
 * The canal houses of Amsterdam: how each is dealt from the seed, and the measures that follow
 * from what the site document says of it. Everything is in the building's own measures, as in
 * `building.ts`: `u` across the front from its middle, to the right as seen from outside; `v` back
 * from the face of the front wall; `y` up from the street before the door.
 *
 * A canal house is a lot of a few metres' frontage on a canal, built up as far as the lot allows:
 * narrow, deep and tall. Its fronts changed with the centuries more than its plan did, and what
 * tells one from the next is chiefly the outline over the eaves: the spout gable of the warehouses,
 * the stepped gable of the early houses, the neck and the bell gables of the golden age, and the
 * straight cornice of the eighteenth century, sometimes with a panel raised over its middle. A
 * house of one window's breadth stands beside a double house of seven. Most have a stoop up to a
 * raised ground storey with a basement under it, sash windows painted white, a hoist beam at the
 * top, and fronts that lean out over the street. Every choice here is from a stream of its own, so
 * that any of them may be fixed (`want`) and the rest still dealt as they would have been.
 */

/** Fixed measures: the thickness of the front and of the other walls, the plinth of stone under the front, and a wall between rooms inside. */
export const CANAL = { front: 0.44, wall: 0.36, plinth: 0.28, cross: 0.18 };

type Colour = [number, number, number];
const round = (v: number) => Math.round(v * 100) / 100;

/** The height of a storey's floor above the street before the door: the ground storey's is the stoop's top. */
export const canalFloor = (b: Building, storey: number): number => b.canalwork!.stoop + b.heights.slice(0, storey).reduce((sum, h) => sum + h, 0);

/** The height of the top of the walls, where the roof begins. */
export const canalEaves = (b: Building): number => canalFloor(b, b.storeys);

/** The bays across the front: the margin at each end, how far apart the bays are, the middle of each, and how broad a window is. */
export function canalBays(b: Building) {
  const margin = Math.min(0.75, Math.max(0.38, b.w * 0.07)), pitch = (b.w - 2 * margin) / b.bays;
  return { margin, pitch, centre: (j: number) => margin + (j + 0.5) * pitch, window: Math.min(1.3, Math.max(0.7, pitch - 0.72)) };
}

/** The door's opening across the front: a warehouse's is broad, for goods; a house's a single leaf with a light over it. */
export function canalDoor(b: Building): { s0: number; s1: number } {
  const { centre, pitch } = canalBays(b), c = centre(b.canalwork!.door);
  const w = b.canalwork!.kind === 'warehouse' ? Math.min(2.1, pitch - 0.3) : Math.min(1.3, Math.max(0.95, pitch - 0.75));
  return { s0: c - w / 2, s1: c + w / 2 };
}

/** The inside of a canal house: the inside faces of its walls, their thickness, a wall between rooms, and its floors. */
export function canalShell(b: Building): Shell {
  return { u0: -b.w / 2 + CANAL.wall, u1: b.w / 2 - CANAL.wall, v0: CANAL.front, v1: b.d - CANAL.wall, front: CANAL.front, wall: CANAL.wall, cross: CANAL.cross, floors: Array.from({ length: b.storeys + 1 }, (_, s) => canalFloor(b, s)) };
}

/**
 * The plan of a canal house, as they were planned (see `src/core/interior.ts`): a warehouse open
 * floors one over another; a double house, its door in the middle, a passage through the middle with
 * a front room and a back room either side; a house of two to four windows a corridor along the side
 * its door is on, with the stair in it, and a front room and a back room beside; one too narrow for
 * that, its rooms one behind another with the stair between. Every storey is alike, and the walls
 * between rooms stand between the windows. Null for a house whose stair will not fit, which stays shut.
 */
export function planCanal(b: Building): BuildingPlan | null {
  const cw = b.canalwork!, sh = canalShell(b), C = sh.cross, bays = canalBays(b), edge = (j: number) => -b.w / 2 + bays.margin + j * bays.pitch;
  if (cw.kind === 'warehouse') return planOpen(sh, -1);
  if (b.bays >= 3 && cw.door > 0 && cw.door < b.bays - 1) {
    const p = planDouble(sh, edge(cw.door) + C / 2, edge(cw.door + 1) - C / 2);
    if (p) return p;
  }
  if (b.bays >= 2) {
    const side: -1 | 1 = cw.door < b.bays / 2 ? -1 : 1, p = planCorridor(sh, side, side < 0 ? edge(cw.door + 1) : edge(cw.door));
    if (p) return p;
  }
  return planNarrow(sh);
}

/**
 * The windows of a canal house's back on a storey, as spans of `u`: one to a bay, behind the front's, so that a wall within standing
 * between two bays never meets one; and moved off any wall of its plan that does.
 */
export function canalBackWindows(b: Building, storey: number): [number, number][] {
  const bays = canalBays(b), w = Math.min(1.0, bays.pitch - 0.7);
  const spans = Array.from({ length: b.bays }, (_, j): [number, number] => { const u = -b.w / 2 + bays.centre(j); return [u - w / 2, u + w / 2]; });
  return b.plan ? clearOfWalls(spans, wallsAtBack(b.plan, canalShell(b), storey), CANAL.cross) : spans;
}

/** A flight of the stoop: where it begins across the front, which way it runs (along the front, or straight out), and its steps. */
export interface CanalFlight { s: number; dir: -1 | 0 | 1; steps: number; rise: number; tread: number; width: number }

/**
 * The stoop before the door, in the measures of the front (`s` along it from its left end, `out`
 * from its face into the street): a landing at the ground storey's floor, as broad as the door
 * and a little more, and the flights down from it. A low stoop is a few steps straight out. A high
 * one runs down along the front, toward whichever side has room for it; a double house's runs
 * down both ways from the landing in the middle; and where there is no room along the front, it
 * comes straight out into the street. Null where the floor is at the street.
 */
export function canalStoop(b: Building): { landing: { s0: number; s1: number; out: number }; flights: CanalFlight[] } | null {
  const F0 = b.canalwork!.stoop, door = canalDoor(b), W = b.w, tread = 0.28;
  if (F0 < 0.1) return null;
  if (F0 <= 0.5) {
    // (Steps straight out before the door, the highest of them the landing.)
    const steps = Math.max(1, Math.round(F0 / 0.17)), rise = F0 / steps;
    return { landing: { s0: door.s0 - 0.18, s1: door.s1 + 0.18, out: 0.32 }, flights: steps > 1 ? [{ s: (door.s0 + door.s1) / 2, dir: 0, steps: steps - 1, rise, tread, width: door.s1 - door.s0 + 0.36 }] : [] };
  }
  const steps = Math.ceil(F0 / 0.19) - 1, rise = F0 / (steps + 1), run = steps * tread, width = 1.0;
  const double = b.bays >= 5 && b.canalwork!.door === b.bays >> 1;
  const landing = { s0: door.s0 - (double ? 0.2 : 0.25), s1: door.s1 + (double ? 0.2 : 0.25), out: 1.1 };
  if (double && landing.s0 - run > 0.1 && landing.s1 + run < W - 0.1) return { landing, flights: [{ s: landing.s0, dir: -1, steps, rise, tread, width }, { s: landing.s1, dir: 1, steps, rise, tread, width }] };
  const left = landing.s0 - 0.08, right = W - landing.s1 - 0.08;
  if (Math.max(left, right) >= run) return { landing, flights: [right >= left ? { s: landing.s1, dir: 1, steps, rise, tread, width } : { s: landing.s0, dir: -1, steps, rise, tread, width }] };
  return { landing, flights: [{ s: (landing.s0 + landing.s1) / 2, dir: 0, steps, rise, tread, width: landing.s1 - landing.s0 }] };
}

/** How far the stoop reaches out into the street. */
export function canalReach(b: Building): number {
  const st = canalStoop(b);
  if (!st) return 0;
  return st.landing.out + Math.max(0, ...st.flights.map((f) => (f.dir === 0 ? f.steps * f.tread : 0)));
}

// ---------------------------------------------------------------------------------------------
// The palettes.

/** Brick as the canal fronts have it: mostly a dark red-brown, some nearly purple, some a warmer red. */
const TONES: Colour[] = [[0.78, 0.66, 0.64], [0.7, 0.58, 0.56], [0.62, 0.5, 0.5], [0.88, 0.76, 0.72], [1, 0.9, 0.86], [1.06, 0.94, 0.84]];
/** Paint over a front: white, cream, two greys, sand, a dark green-grey, near black, oxblood. */
export const PAINTS: Colour[] = [[0.9, 0.89, 0.86], [0.88, 0.84, 0.72], [0.74, 0.75, 0.74], [0.55, 0.56, 0.56], [0.8, 0.72, 0.56], [0.28, 0.32, 0.29], [0.13, 0.13, 0.13], [0.42, 0.13, 0.1]];
/** Sandstone from Bentheim, cream to grey; white paint. */
const SANDSTONE: Colour[] = [[0.8, 0.75, 0.62], [0.76, 0.72, 0.62], [0.82, 0.78, 0.68]], WHITE: Colour = [0.92, 0.91, 0.88];
/** Window frames: white nearly always; cream, and now and then a dark green or an oxblood. */
const FRAMES: Colour[] = [WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, WHITE, [0.88, 0.84, 0.72], [0.88, 0.84, 0.72], [0.12, 0.24, 0.16], [0.36, 0.1, 0.08]];
/** Shutters and loading doors: dark green, oxblood, a brown, a blue-grey, black. */
const SHUTTERS: Colour[] = [[0.1, 0.22, 0.14], [0.1, 0.22, 0.14], [0.4, 0.09, 0.07], [0.26, 0.15, 0.08], [0.2, 0.25, 0.3], [0.08, 0.08, 0.08]];
/** Doors: dark green, black, oxblood, a dark blue, varnished oak, grey. */
const DOORS: Colour[] = [[0.06, 0.16, 0.1], [0.06, 0.06, 0.06], [0.32, 0.06, 0.05], [0.08, 0.12, 0.22], [0.3, 0.18, 0.09], [0.38, 0.4, 0.4]];
/** The timber fronts of ground storeys: dark green, black, white, cream, oxblood, a grey-blue. */
const PUIS: Colour[] = [[0.1, 0.2, 0.13], [0.07, 0.07, 0.07], [0.88, 0.87, 0.83], [0.86, 0.82, 0.7], [0.36, 0.08, 0.06], [0.36, 0.44, 0.5]];

const tinted = (a: Colour, c: Colour): Colour => [round(a[0] * c[0]), round(a[1] * c[1]), round(a[2] * c[2])];
/** A choice among weighted things. */
function weighted<T extends string | number>(rng: Rng, w: Partial<Record<T, number>>): T {
  const keys = Object.keys(w) as T[], sum = keys.reduce((s, k) => s + (w[k] ?? 0), 0);
  let x = rng.next() * sum;
  for (const k of keys) { x -= w[k] ?? 0; if (x < 0) return (typeof k === 'string' && /^\d+$/.test(k) ? Number(k) : k) as T; }
  return keys[keys.length - 1];
}

/** What may be asked of a canal house: any of how it is made, and its size. */
export type CanalWant = Partial<CanalWork> & { bays?: number; storeys?: number; w?: number; d?: number };

/**
 * A canal house dealt from the seed, of what is asked in `want` and otherwise as the city built
 * them. `deep` is the most depth its lot has; `room` the most frontage, and it is narrowed (fewer
 * bays) to fit, or null if not even a house of one window fits. `country` is the clay of the place.
 */
export function dealCanalHouse(rng: Rng, o: { deep?: number; room?: number; want?: CanalWant; country?: BrickCountry } = {}): Omit<Building, 'x' | 'z' | 'faces'> | null {
  const want = o.want ?? {};
  const kind = want.kind ?? (rng.fork('kind').chance(0.14) ? 'warehouse' : 'house'), store = kind === 'warehouse';
  // ---- its size: bays, how far apart, and so its breadth; storeys and their heights; depth
  const size = rng.fork('size');
  let bays = want.bays ?? (store ? size.pick([3, 3, 3, 5, 2]) : size.pick([1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 5, 5, 7]));
  const pitch = store ? size.range(1.9, 2.3) : size.range(1.75, 2.15), margin = Math.min(0.75, Math.max(0.38, size.range(0.42, 0.66)));
  const breadth = (n: number) => round(n * pitch + 2 * margin);
  let w = want.w ?? breadth(bays);
  if (o.room !== undefined && !want.w) {
    while (w > o.room && bays > 1) w = breadth(--bays);
    if (w > o.room) return null;
  }
  const wide = bays >= 5, tall = rng.fork('heights');
  const storeys = want.storeys ?? (store ? tall.pick([4, 5, 5, 6]) : bays <= 2 ? tall.pick([3, 4, 4, 5]) : wide ? tall.pick([3, 3, 4, 4]) : tall.pick([3, 4, 4, 4, 5]));
  const heights = store
    ? [round(tall.range(3.0, 3.5)), ...Array.from({ length: storeys - 1 }, () => round(tall.range(2.35, 2.7)))]
    : (() => {
      // (The ground storey, raised over the basement, is the finest; each over it a little lower than the last.)
      const first = tall.range(3.5, 4.3) + (wide ? 0.35 : 0), next = tall.range(3.1, 3.55) + (wide ? 0.3 : 0), fall = tall.range(0.1, 0.28);
      return [round(first), ...Array.from({ length: storeys - 1 }, (_, n) => round(Math.max(2.55, next - n * fall)))];
    })();
  const d = want.d ?? round(Math.min(o.deep ?? 99, store ? size.range(13, 20) : size.range(11, 16.5) + (wide ? 2 : 0)));

  // ---- the gable, and what goes with it
  const gable = want.gable ?? weighted<CanalWork['gable']>(rng.fork('gable'), store ? { spout: 6, stepped: 1, cornice: 2, neck: 1 }
    : bays <= 1 ? { neck: 3, bell: 3, spout: 1, stepped: 1, cornice: 2 }
      : bays === 2 ? { neck: 3, bell: 3, stepped: 2, cornice: 2, raised: 1, spout: 0.5 }
        : bays === 3 ? { neck: 3, bell: 2, stepped: 2, cornice: 3, raised: 2 }
          : bays === 4 ? { neck: 2, stepped: 1, cornice: 4, raised: 3 }
            : { cornice: 5, raised: 4, neck: 1 });
  const gr = rng.fork('tiers');
  const tiers = want.tiers ?? (gable === 'stepped' ? Math.max(2, Math.min(5, Math.round(w / 1.7) + gr.int(-1, 0))) : gable === 'neck' ? (bays >= 5 || (w >= 6.2 && gr.chance(0.4)) ? 2 : 1) : 1);
  const crown = want.crown ?? (gable === 'cornice' ? 'flat' : weighted<CanalWork['crown']>(rng.fork('crown'), gable === 'neck' ? { triangle: 2, segment: 2, scroll: 1 }
    : gable === 'bell' ? { segment: 2, scroll: 2, triangle: 1 }
      : gable === 'stepped' ? { flat: 2, triangle: 1, segment: 1, scroll: 0.5 }
        : gable === 'raised' ? { segment: 2, scroll: 2, triangle: 1 }
          : { segment: 2, triangle: 2, flat: 1 }));
  const orn = rng.fork('ornament');
  let ornament = want.ornament ?? weighted<0 | 1 | 2 | 3>(orn, store ? { 0: 6, 1: 4, 2: 0.6 } : wide ? { 0: 1, 1: 3, 2: 4, 3: 2.5 } : { 0: 3, 1: 4, 2: 3, 3: 1.2 });
  if (want.ornament === undefined && gable === 'raised' && ornament === 0) ornament = 1;
  const windows = want.windows ?? (store || gable === 'spout' ? 'small' : weighted<CanalWork['windows']>(rng.fork('windows'), gable === 'stepped' ? { cross: 6, small: 4 }
    : gable === 'neck' || gable === 'bell' ? { small: 72, cross: 14, large: 14 } : { small: 55, large: 45 }));

  // ---- what it is made of, and its paint
  const look = rng.fork('look'), country = o.country ?? { clay: 'red', tint: [1, 1, 1] };
  const front = want.front ?? (look.fork('front').chance(store ? 0.05 : gable === 'cornice' || gable === 'raised' ? 0.32 : 0.12) ? 'painted' : 'brick');
  const clay = want.clay ?? (country.clay === 'buff' || look.fork('clay').chance(0.08) ? 'buff' : 'red');
  const tone = want.tone ?? tinted(look.pick(TONES), country.tint);
  const colour = look.fork('paint').pick(PAINTS);
  // (Older fronts are dressed in sandstone, later ones in paint; a painted front's dressings are white, or grey on a white front.)
  const old = gable === 'stepped' || gable === 'neck' || gable === 'bell' || gable === 'spout';
  const trim = want.trim ?? (front === 'painted' ? (colour[0] > 0.85 ? [0.7, 0.71, 0.7] as Colour : WHITE) : look.fork('trim').chance(old ? 0.68 : 0.38) ? look.fork('stone').pick(SANDSTONE) : WHITE);
  const frame = want.frame ?? look.fork('frame').pick(FRAMES);
  const sh = look.fork('shutters'), shutters = want.shutters !== undefined ? want.shutters : store || windows === 'cross' || sh.chance(0.12) ? sh.pick(SHUTTERS) : null;
  const paint = want.paint ?? look.fork('door').pick(DOORS);
  const pu = rng.fork('pui'), pui = want.pui !== undefined ? want.pui : !store && pu.chance(windows === 'large' ? 0.4 : 0.22) ? pu.pick(PUIS) : null;

  // ---- the stoop, the lean, the door
  const st = rng.fork('stoop');
  let stoop = want.stoop ?? (store ? st.range(0.1, 0.22) : pui ? st.range(0.12, 0.4) : st.chance(0.65) ? st.range(0.8, 1.45) : st.range(0.15, 0.42));
  // (A front of one window has no room for a flight along it: its stoop comes straight out, and is kept low.)
  if (want.stoop === undefined && w < 4.2) stoop = Math.min(stoop, 0.68);
  const basement = want.basement ?? stoop >= 0.75;
  const ln = rng.fork('lean'), lean = want.lean ?? (ln.chance(0.3) ? ln.range(0, 0.004) : ln.range(0.006, 0.03));
  const dr = rng.fork('door');
  const door = want.door ?? (store ? (bays === 5 ? 2 : bays >> 1) : bays === 1 ? 0 : bays >= 5 ? bays >> 1 : dr.chance(0.5) ? 0 : bays - 1);
  const rf = rng.fork('roof');
  const pitchDeg = want.pitch ?? round(gable === 'cornice' || gable === 'raised' ? rf.range(38, 48) : rf.range(48, 58));
  return {
    style: 'canal', w, d, storeys, heights, bays, colour: front === 'painted' ? colour : WHITE,
    canalwork: {
      kind, gable, tiers, crown, front, clay, tone, trim, ornament, windows, frame, shutters, paint, pui,
      stoop: round(stoop), basement, lean: Math.round(lean * 1000) / 1000, door: Math.min(bays - 1, door), pitch: pitchDeg,
      roof: want.roof ?? (rf.chance(0.55) ? 'dark' : 'red'), hoist: want.hoist ?? (store || rng.fork('hoist').chance(0.9)),
    },
  };
}
