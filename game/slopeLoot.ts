/**
 * Loot (asked: "it should be possible for the player to find loot from the dungeon treasures and killed bosses. Can include weapons,
 * but also equipment that affects skiing: ski boots that increase fall tolerance or add height to jumps; alternative skis that turn
 * sharper or wider and have different acceleration and max speed; powerups that affect attacks or area effects / wards around the
 * player; ancient ski guidebooks that teach the player new tricks"): what may be found (`BASES`, `BOOKS`), drawn by chance as it is
 * found (`rollLoot`), what the player has and wears (`Pack`, kept in the browser), what all it wears comes to (`Mods`, which the ride,
 * the arms and the wards read in `slope.ts`), and how it is shown: thrown up glowing where it is found and drawn to the player
 * (`Drops`), a ward's ring on the snow (`WardRing`), the card that says what was found (`LootCard`) and the pack in the menu
 * (`packView`).
 *
 * Five places to wear something: skis, boots, a ward (a charm that acts about the player), a weapon (carried in place of the arm the
 * foes brought down have given, while *Orcs & weapons* is on), and guidebooks, which are not worn but read, once, and teach tricks
 * for good (the trick chosen off a kicker may then be one of theirs).
 */
import {
  AdditiveBlending, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, PlaneGeometry,
  type Quaternion, RingGeometry, type Scene, Vector3,
} from 'three';
import type { Rng } from '../src/core/rng';
import type { ArmKind } from './slopeArms';

export type Slot = 'skis' | 'boots' | 'ward' | 'weapon' | 'book';
export type Rarity = 'common' | 'fine' | 'rare' | 'ancient';
export type WardKind = 'ember' | 'storm' | 'shield' | 'magpie';

/**
 * What everything worn comes to, each nothing when nothing is worn: shares more (0.2, a fifth more) or so much more in its own unit.
 * `turn`, a share sharper turning (less, wider); `top`, a share more top speed (by less drag); `accel`, a share more push from slow
 * (fading out by some 90 km/h); `powder`, a share of deep snow's hold taken off; `stones`, km/h faster over the stones before an edge
 * is caught; `landing`, m/s harder into the snow before a fall; `pop`, m/s more up off a kicker's lip; `forgive`, degrees short of a
 * spin or a flip still landed; `might`, a share harder blows; `haste`, a share quicker rounds; `points`, a share more points.
 * The ward's: `ember`, blows a second to every foe within `emberR` metres; `storm`, seconds between bolts at a foe within `stormR`;
 * `shield`, the chance a blow on foot is turned aside.
 */
export interface Mods {
  turn: number; top: number; accel: number; powder: number; stones: number;
  landing: number; pop: number; forgive: number;
  might: number; haste: number; points: number;
  ember: number; emberR: number; storm: number; stormR: number; shield: number;
}
export const NO_MODS: Readonly<Mods> = Object.freeze({
  turn: 0, top: 0, accel: 0, powder: 0, stones: 0, landing: 0, pop: 0, forgive: 0, might: 0, haste: 0, points: 0,
  ember: 0, emberR: 0, storm: 0, stormR: 0, shield: 0,
});

/** A trick a guidebook teaches, as the ride's trick pool has them: what it is, how wild, and how long in the air it wants. */
export interface BookTrick { t: { kind: 'air' | 'flip' | 'roll'; halves: number; cork?: boolean; flips?: number; style?: 'mute' | 'tail' }; wild: number; need: number }
export interface Book { id: string; name: string; about: string; rarity: Rarity; tricks: BookTrick[]; teaches: string }

/**
 * The guidebooks, each teaching what the machinery of the air could always make but the trick pool never chose. Each trick wants as
 * long in the air as it was seen to land in off the Silent Warden's kickers, with a little to spare (a rodeo 540 landed in 1.32
 * seconds, a rodeo 900 in 1.52, a double barrel roll in 1.72, a triple backflip in 2.08 and not in 1.2, a triple cork 1440 in 2.1 and
 * not in 1.68, a triple cork 1800 in 1.97 and not in 1.8).
 */
export const BOOKS: Book[] = [
  {
    id: 'rodeo', name: 'The Rodeo Scrolls', rarity: 'fine', teaches: 'Rodeo 540 and Rodeo 900',
    about: 'Brittle vellum, the drawings of a rider thrown sideways over its own skis and landing backwards',
    tricks: [{ t: { kind: 'flip', halves: 3 }, wild: 0.6, need: 1.38 }, { t: { kind: 'flip', halves: 5 }, wild: 0.82, need: 1.6 }],
  },
  {
    id: 'barrel', name: "The Barrelwright's Almanac", rarity: 'rare', teaches: 'the double barrel roll',
    about: 'A cooper\'s almanac, its margins full of a skier rolled over twice like a cask down a ramp',
    tricks: [{ t: { kind: 'roll', halves: 0, flips: 2 }, wild: 0.74, need: 1.75 }, { t: { kind: 'roll', halves: 0, flips: 2, style: 'mute' }, wild: 0.8, need: 1.85 }],
  },
  {
    id: 'triple', name: 'Codex of the Three Turnings', rarity: 'ancient', teaches: 'the triple backflip',
    about: 'Bound in yeti hide; three circles drawn one inside the next on every page',
    tricks: [{ t: { kind: 'flip', halves: 0, flips: 3 }, wild: 1.0, need: 2.02 }],
  },
  {
    id: 'tcork', name: 'Treatise on the Triple Cork', rarity: 'ancient', teaches: 'the triple cork 1440 and 1800',
    about: 'Its author fell, it says in another hand on the last page, trying the chapter after this one',
    tricks: [{ t: { kind: 'air', halves: 8, cork: true, flips: 3 }, wild: 1.05, need: 2.05 }, { t: { kind: 'air', halves: 10, cork: true, flips: 3 }, wild: 1.12, need: 2.15 }],
  },
];

/** What may be found, apart from the books: a slot, what it is called, its stats' ranges (a rare one's), and for a weapon its arm. */
interface Base { id: string; slot: Exclude<Slot, 'book'>; noun: string; stats: Partial<Record<keyof Mods, [number, number]>>; arm?: ArmKind; ward?: WardKind }
const ARM_NOUN: Record<ArmKind, string> = { sword: 'sword', pistol: 'pistol', shotgun: 'shotgun', flamer: 'flamethrower', smg: 'tommy gun', lightning: 'lightning gun', bazooka: 'bazooka' };
const BASES: Base[] = [
  // Skis: each better at one thing and a little worse at another, so that which is best is a matter of the run and the rider.
  { id: 'slalom', slot: 'skis', noun: 'slalom skis', stats: { turn: [0.18, 0.32], top: [-0.05, -0.03] } },
  { id: 'downhill', slot: 'skis', noun: 'downhill skis', stats: { top: [0.07, 0.13], turn: [-0.2, -0.12] } },
  { id: 'powder', slot: 'skis', noun: 'powder skis', stats: { powder: [0.35, 0.6], turn: [-0.08, -0.04] } },
  { id: 'skating', slot: 'skis', noun: 'skating skis', stats: { accel: [0.25, 0.45], top: [-0.03, -0.01] } },
  { id: 'stone', slot: 'skis', noun: 'iron-edged skis', stats: { stones: [10, 20], top: [-0.03, -0.01] } },
  // Boots.
  { id: 'padded', slot: 'boots', noun: 'padded boots', stats: { landing: [1.6, 3.0] } },
  { id: 'spring', slot: 'boots', noun: 'spring boots', stats: { pop: [0.8, 1.5] } },
  { id: 'masters', slot: 'boots', noun: "masters' boots", stats: { forgive: [15, 30] } },
  { id: 'hobnail', slot: 'boots', noun: 'hobnailed boots', stats: { stones: [6, 12], landing: [0.6, 1.2] } },
  // Wards, which act about the player while it rides or walks (`slope.ts`, `wardStep`).
  { id: 'ember', slot: 'ward', ward: 'ember', noun: 'ember ward', stats: { ember: [1.2, 2.2], emberR: [5, 7.5] } },
  { id: 'storm', slot: 'ward', ward: 'storm', noun: 'storm ward', stats: { storm: [3.2, 2.0], stormR: [16, 24] } },
  { id: 'shield', slot: 'ward', ward: 'shield', noun: 'barrow ward', stats: { shield: [0.3, 0.55] } },
  { id: 'magpie', slot: 'ward', ward: 'magpie', noun: "magpie's charm", stats: { points: [0.12, 0.3] } },
  // Weapons: each arm the foes give, made better (`might`, and for what fires, `haste`).
  ...(['sword', 'pistol', 'shotgun', 'flamer', 'smg', 'lightning', 'bazooka'] as const).map((arm): Base => ({
    id: arm, slot: 'weapon', arm, noun: ARM_NOUN[arm], stats: arm === 'sword' || arm === 'flamer' ? { might: [0.3, 0.8] } : { might: [0.2, 0.6], haste: [0.08, 0.25] },
  })),
];

/** How far along a stat's range each rarity comes (a rare one's range as it is; an ancient's past it); and how each is shown. */
const QUALITY: Record<Rarity, [number, number]> = { common: [0.45, 0.6], fine: [0.65, 0.85], rare: [0.85, 1.05], ancient: [1.15, 1.4] };
export const RARITY: Record<Rarity, { name: string; colour: string }> = {
  common: { name: 'Common', colour: '#d8d2c4' }, fine: { name: 'Fine', colour: '#8fd17a' }, rare: { name: 'Rare', colour: '#6fb0ff' }, ancient: { name: 'Ancient', colour: '#ffb347' },
};
const PREFIX: Record<Exclude<Slot, 'book'>, Record<Rarity, string[]>> = {
  skis: { common: ['Old', 'Patched', 'Birch'], fine: ['Hickory', 'Ashwood', 'Waxed'], rare: ['Whalebone', 'Runed', 'Lacquered'], ancient: [] },
  boots: { common: ['Old', 'Cracked', 'Hide'], fine: ['Sealskin', 'Stitched', 'Lined'], rare: ['Runed', 'Dwarf-made', 'Silvered'], ancient: [] },
  ward: { common: ['Bone', 'Clay', 'Knotted'], fine: ['Amber', 'Jet', 'Carved'], rare: ['Runed', 'Moonstone', 'Gilt'], ancient: [] },
  weapon: { common: ['Rusted', 'Notched', 'Old'], fine: ['Oiled', 'Balanced', 'Engraved'], rare: ['Runed', 'Frostforged', 'Gilt'], ancient: [] },
};
/** An ancient thing's own name, by what it is: a phrase, the noun after it. */
const ANCIENT: Record<string, string[]> = {
  slalom: ["Ullr's Own", 'The Hare\'s Way'], downhill: ['The Long Fall', 'Avalanche-runners'], powder: ['Cloudwalkers', 'The Drift Kings'],
  skating: ['The Fox\'s Feet', 'Swiftsoles'], stone: ['Scree-singers', 'The Mountain\'s Teeth'],
  padded: ['Featherfalls', 'The Soft Landing'], spring: ['Hartleaps', 'The Seven Leagues'], masters: ['The Old Masters', 'Second Chances'], hobnail: ['Gravelgrinders', 'Ironsoles'],
  ember: ['The Last Hearth', 'Coal of the Barrow-king'], storm: ['The Thunder-eye', 'Stormglass'], shield: ['The Unbroken Ring', 'Ward of the Seven Dead'], magpie: ['The Magpie Queen', 'Hoardheart'],
  sword: ['Gram', 'Yeti\'s Bane'], pistol: ['The Widow\'s Answer', 'Quickfinger'], shotgun: ['Old Thunder', 'The Doorknocker'], flamer: ['Dragon\'s Breath', 'The Hearthfather'],
  smg: ['The Chatterbox', 'Hailstorm'], lightning: ['Stormcaller', 'The Sky\'s Anger'], bazooka: ['The Avalanche', 'Mountainbreaker'],
};

export interface Item {
  id: string; slot: Slot; base: string; name: string; rarity: Rarity; mods: Partial<Mods>;
  arm?: ArmKind; ward?: WardKind; book?: string;
  /** Where it was found, said on its card and in the pack. */
  found: string;
}

/** Where loot comes from: a chest at the end of a dungeon (more often a book), or a great one felled (more often a weapon or a ward). */
export type Source = 'chest' | 'boss';
const SLOT_ODDS: Record<Source, Record<Slot, number>> = {
  chest: { book: 3, skis: 2.5, boots: 2.5, ward: 1.5, weapon: 1.5 },
  boss: { book: 1, skis: 1.5, boots: 1.5, ward: 2.5, weapon: 3 },
};
const RARITY_ODDS: Record<Source, Record<Rarity, number>> = {
  chest: { common: 2, fine: 4, rare: 3, ancient: 1 },
  boss: { common: 0.5, fine: 3.5, rare: 4, ancient: 2 },
};
const weighted = <K extends string>(rng: Rng, odds: Record<K, number>): K => {
  const keys = Object.keys(odds) as K[];
  let r = rng.next() * keys.reduce((a, k) => a + odds[k], 0);
  for (const k of keys) if ((r -= odds[k]) <= 0) return k;
  return keys[keys.length - 1];
};
const round = (v: number, by: number) => Math.round(v / by) * by;

/**
 * Something found, drawn by `rng` from what `source` gives: a book not yet read, if one is drawn and any is left (else something else);
 * otherwise a thing of a kind drawn by the slot's odds, of a rarity drawn by the source's, its stats along its ranges as far as its
 * rarity says (and an ancient one a share better again in its second stat, if it has a drawback, that drawback halved).
 */
export function rollLoot(rng: Rng, source: Source, read: ReadonlySet<string>, found: string): Item {
  const id = `${Date.now().toString(36)}${rng.int(0, 1e9).toString(36)}`;
  let slot = weighted(rng, SLOT_ODDS[source]);
  const unread = BOOKS.filter((b) => !read.has(b.id));
  if (slot === 'book' && !unread.length) slot = weighted(rng.fork('again'), { skis: 1, boots: 1, ward: 1, weapon: 1 });
  if (slot === 'book') {
    // (The rarer books the less often: a fine one twice as often as an ancient.)
    const book = weighted(rng.fork('book'), Object.fromEntries(unread.map((b) => [b.id, b.rarity === 'ancient' ? 1 : b.rarity === 'rare' ? 1.5 : 2])) as Record<string, number>);
    const b = BOOKS.find((x) => x.id === book)!;
    return { id, slot, base: b.id, name: b.name, rarity: b.rarity, mods: {}, book: b.id, found };
  }
  const base = rng.pick(BASES.filter((b) => b.slot === slot)), rarity = weighted(rng.fork('rarity'), RARITY_ODDS[source]);
  const [q0, q1] = QUALITY[rarity], mods: Partial<Mods> = {};
  for (const [k, [lo, hi]] of Object.entries(base.stats) as [keyof Mods, [number, number]][]) {
    // (Along the range, worst to best (a storm ward's seconds between bolts given so too: fewer, the better), as far as the rarity
    // says, an ancient one's past its end; but a drawback, a stat below nothing, drawn anywhere in its range whatever the rarity, an
    // ancient one's halved.)
    const v = hi < 0 ? (lo + (hi - lo) * rng.next()) * (rarity === 'ancient' ? 0.5 : 1) : lo + (hi - lo) * rng.range(q0, q1);
    mods[k] = k === 'storm' ? Math.max(1.4, round(v, 0.1)) : round(v, k === 'stones' || k === 'forgive' ? 1 : 0.01);
  }
  const named = rarity === 'ancient' ? rng.pick(ANCIENT[base.id]) : `${rng.pick(PREFIX[base.slot][rarity])} ${base.noun}`;
  const name = rarity === 'ancient' ? `${named}, ${/s$/.test(base.noun) ? '' : base.noun.match(/^[aeiou]/) ? 'an ' : 'a '}${base.noun}` : named;
  return { id, slot, base: base.id, name, rarity, mods, arm: base.arm, ward: base.ward, found };
}

const pct = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
/** What an item does, a line a stat. */
export function linesOf(item: Item): string[] {
  if (item.book) { const b = BOOKS.find((x) => x.id === item.book)!; return [`Teaches ${b.teaches}`, b.about]; }
  const m = item.mods, out: string[] = [];
  if (m.turn) out.push(`Turns ${pct(m.turn)} ${m.turn > 0 ? 'sharper' : '(wider)'}`);
  if (m.top) out.push(`Top speed ${pct(m.top)}`);
  if (m.accel) out.push(`Acceleration ${pct(m.accel)}`);
  if (m.powder) out.push(`Deep snow's hold ${pct(-m.powder)}`);
  if (m.stones) out.push(`Over the stones ${Math.round(m.stones)} km/h faster before an edge catches`);
  if (m.landing) out.push(`Fall tolerance +${Math.round((m.landing / 14) * 100)}%`);
  if (m.pop) out.push(`Pops ${m.pop.toFixed(1)} m/s higher off kickers`);
  if (m.forgive) out.push(`Lands spins and flips up to ${Math.round(m.forgive)}° short`);
  if (m.might) out.push(`Strikes ${pct(m.might)} harder`);
  if (m.haste) out.push(`Fires ${pct(m.haste)} faster`);
  if (m.ember) out.push(`Burns foes within ${m.emberR!.toFixed(1)} m (${m.ember.toFixed(1)} blows a second)`);
  if (m.storm) out.push(`Calls lightning on a foe within ${Math.round(m.stormR!)} m every ${m.storm.toFixed(1)} s`);
  if (m.shield) out.push(`Turns aside ${Math.round(m.shield * 100)}% of blows on foot`);
  if (m.points) out.push(`Points ${pct(m.points)}`);
  return out;
}
export const SLOT_NAME: Record<Slot, string> = { skis: 'Skis', boots: 'Boots', ward: 'Ward', weapon: 'Weapon', book: 'Guidebook' };
/** What kind of thing it is, as its card heads it: its rarity and slot. */
export const kindOf = (item: Item) => `${RARITY[item.rarity].name} ${item.slot === 'weapon' ? ARM_NOUN[item.arm!] : item.slot === 'book' ? 'guidebook' : item.slot === 'ward' ? 'ward' : item.slot}`;

/** How many of a slot are kept, besides what is worn: the oldest not worn let go of past it. */
const KEEP = 8;
/**
 * What the player has found, what it wears in each slot, and which books it has read; kept in the browser (by `save`, given), so that
 * what is found is had again when the page is opened again.
 */
export class Pack {
  items: Item[] = [];
  worn: Partial<Record<Slot, string>> = {};
  read = new Set<string>();
  /** Told whenever it changes. */
  onChange: (() => void) | null = null;
  constructor(private readonly save: (json: string) => void, json: string | null) {
    try {
      const o = json ? JSON.parse(json) : null;
      if (o && Array.isArray(o.items)) { this.items = o.items; this.worn = o.worn ?? {}; this.read = new Set(o.read ?? []); }
    } catch { /* (begun empty) */ }
  }
  private changed(): void { this.save(JSON.stringify({ items: this.items, worn: this.worn, read: [...this.read] })); this.onChange?.(); }
  wornIn(slot: Slot): Item | null { const id = this.worn[slot]; return (id && this.items.find((i) => i.id === id)) || null; }
  /**
   * Something found put in the pack: a book read at once; anything else worn if nothing is worn in its slot. Gives back whether it was
   * put on (or read).
   */
  add(item: Item): boolean {
    this.items.push(item);
    let on = false;
    if (item.book) { this.read.add(item.book); on = true; } else if (!this.wornIn(item.slot)) { this.worn[item.slot] = item.id; on = true; }
    const of = this.items.filter((i) => i.slot === item.slot && i.slot !== 'book' && i.id !== this.worn[i.slot]);
    while (of.length > KEEP) { const old = of.shift()!; this.items = this.items.filter((i) => i !== old); }
    this.changed();
    return on;
  }
  /** Worn in its slot (or nothing there, `null`). */
  wear(slot: Slot, id: string | null): void { if (id) this.worn[slot] = id; else delete this.worn[slot]; this.changed(); }
  /** Everything let go of: nothing found, nothing read. */
  empty(): void { this.items = []; this.worn = {}; this.read.clear(); this.changed(); }
  /** What everything worn comes to. */
  mods(): Mods {
    const m: Mods = { ...NO_MODS };
    for (const slot of ['skis', 'boots', 'ward', 'weapon'] as const) {
      const it = this.wornIn(slot);
      if (it) for (const [k, v] of Object.entries(it.mods) as [keyof Mods, number][]) m[k] += v;
    }
    return m;
  }
  /** The tricks the books read teach. */
  tricks(): BookTrick[] { return BOOKS.filter((b) => this.read.has(b.id)).flatMap((b) => b.tricks); }
}

// ---------------------------------------------------------------- found, in the world

/** A soft round glow, white at its middle, for the halo about a drop; and a fade up a beam. */
const glowTexture = (() => {
  let made: CanvasTexture | null = null;
  return () => {
    if (made) return made;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    return (made = new CanvasTexture(c));
  };
})();
const beamTexture = (() => {
  let made: CanvasTexture | null = null;
  return () => {
    if (made) return made;
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const g = c.getContext('2d')!, r = g.createLinearGradient(0, 64, 0, 0);
    r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 4, 64);
    return (made = new CanvasTexture(c));
  };
})();

interface Drop { item: Item; g: Group; from: Vector3; rest: Vector3; t: number; at: Vector3; v: Vector3; halo: Mesh }
/** How long a drop flies up out of where it was found, waits glowing, and then how fast it comes to the player (m/s, growing). */
const DROP = { flies: 0.9, waits: 1.3, speed: 6, faster: 22, takes: 1.1 };

/**
 * What is found, shown in the world: a gem in its rarity's colour, a halo about it and a beam of light up from it, thrown up out of
 * the chest or the great one felled, waiting there a moment, glowing, and then drawn to the player, which takes it as it comes to it.
 * (Drawn to it rather than left to be ridden to: a skier is far down the run before it could turn back, and nothing found is lost.)
 */
export class Drops {
  private readonly drops: Drop[] = [];
  private readonly gem = new OctahedronGeometry(0.26, 0);
  private readonly plane = new PlaneGeometry(1, 1);
  private readonly beam = new CylinderGeometry(0.1, 0.32, 10, 12, 1, true).translate(0, 5, 0);
  constructor(private readonly scene: Scene) {}
  get count(): number { return this.drops.length; }
  /** Something found at `at`, to wait glowing at `rest` (over the floor or the snow). */
  add(item: Item, at: Vector3, rest: Vector3): void {
    const colour = new Color(RARITY[item.rarity].colour), g = new Group();
    const gem = new Mesh(this.gem, new MeshBasicMaterial({ color: colour.clone().multiplyScalar(1.6) }));
    const halo = new Mesh(this.plane, new MeshBasicMaterial({ color: colour, map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending }));
    halo.scale.setScalar(1.6);
    const beam = new Mesh(this.beam, new MeshBasicMaterial({ color: colour, map: beamTexture(), transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
    beam.position.y = -0.9;
    g.add(gem, halo, beam);
    g.position.copy(at);
    this.scene.add(g);
    this.drops.push({ item, g, from: at.clone(), rest: rest.clone(), t: 0, at: at.clone(), v: new Vector3(), halo });
  }
  /**
   * A moment on: each flown up and down to its rest, waiting, or come on to `to` (the player's middle), the camera's facing turning
   * its halo to it. Gives back what the player took.
   */
  step(dt: number, to: Vector3, facing: Quaternion): Item[] {
    const taken: Item[] = [];
    for (const d of [...this.drops]) {
      d.t += dt;
      const gem = d.g.children[0], beam = d.g.children[2];
      gem.rotation.y += dt * 2.4;
      d.halo.quaternion.copy(facing);
      if (d.t < DROP.flies) {
        // (Up out of where it was, an arch two metres over the higher of where it left and where it comes to rest.)
        const u = d.t / DROP.flies, top = Math.max(d.from.y, d.rest.y) + 2;
        d.at.lerpVectors(d.from, d.rest, u);
        d.at.y = (1 - u) * (1 - u) * d.from.y + 2 * u * (1 - u) * (2 * top - (d.from.y + d.rest.y) / 2) + u * u * d.rest.y;
      } else if (d.t < DROP.flies + DROP.waits) {
        d.at.copy(d.rest).setY(d.rest.y + 0.12 * Math.sin((d.t - DROP.flies) * 4));
      } else {
        // (Come to the player, the faster the longer it has come; the beam drawn in as it goes.)
        const off = to.clone().sub(d.at), far = off.length(), speed = DROP.speed + DROP.faster * (d.t - DROP.flies - DROP.waits);
        if (far < DROP.takes || far < speed * dt) { taken.push(d.item); this.let(d); continue; }
        d.at.addScaledVector(off, (speed * dt) / far);
        beam.scale.y = Math.max(0.05, beam.scale.y - dt * 2);
      }
      d.g.position.copy(d.at);
    }
    return taken;
  }
  private let(d: Drop): void {
    d.g.removeFromParent();
    for (const m of d.g.children) ((m as Mesh).material as MeshBasicMaterial).dispose();
    this.drops.splice(this.drops.indexOf(d), 1);
  }
  /** All let go of (a new run): what was still to be taken given back, so that it is not lost. */
  clear(): Item[] { const left = this.drops.map((d) => d.item); for (const d of [...this.drops]) this.let(d); return left; }
}

/**
 * The ward's ring on the snow about the player, as far out as it reaches, in its colour: faint, and flaring out as it acts (`pulse`).
 * Laid flat to the snow under the player.
 */
export class WardRing {
  readonly mesh: Mesh;
  private flare = 0;
  private readonly paint: MeshBasicMaterial;
  constructor(scene: Scene) {
    this.paint = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
    this.mesh = new Mesh(new RingGeometry(0.94, 1, 72).rotateX(-Math.PI / 2), this.paint);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  pulse(): void { this.flare = 1; }
  /** Shown about `at` (on the snow, its slope's `up`), `r` metres out, in `colour`; or not, `r` nothing. */
  step(dt: number, at: Vector3, up: Vector3, r: number, colour: string): void {
    this.mesh.visible = r > 0;
    if (!r) return;
    this.flare = Math.max(0, this.flare - dt * 2.2);
    this.mesh.position.copy(at).addScaledVector(up, 0.06);
    this.mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), up);
    this.mesh.scale.setScalar(r * (1 + 0.08 * this.flare));
    this.paint.color.set(colour);
    this.paint.opacity = 0.22 + 0.6 * this.flare;
  }
}
/** Each ward's colour, for its ring. */
export const WARD_COLOUR: Record<WardKind, string> = { ember: '#ff7a3a', storm: '#8fc4ff', shield: '#e8e2d6', magpie: '#ffd46a' };

// ---------------------------------------------------------------- found, said

/**
 * The card that says what was found (`#loot`): its rarity and kind, its name in its rarity's colour, what it does, where it was found,
 * and whether it was put on (or read) or put in the pack. One at a time, each for some seconds; those found together after each other.
 */
export class LootCard {
  private readonly queue: { item: Item; on: boolean; note?: string }[] = [];
  private until = 0;
  constructor(private readonly el: HTMLElement) {}
  /** Said as found; `note`, said in place of whether it was put on. */
  show(item: Item, on: boolean, note?: string): void { this.queue.push({ item, on, note }); }
  step(now: number): void {
    if (now < this.until) return;
    if (this.el.classList.contains('on')) { this.el.classList.remove('on'); this.until = now + 0.45; return; }
    const next = this.queue.shift();
    if (!next) return;
    const { item, on, note } = next, el = this.el;
    el.style.setProperty('--rarity', RARITY[item.rarity].colour);
    el.querySelector('.kind')!.textContent = kindOf(item);
    el.querySelector('.name')!.textContent = item.name;
    const lines = el.querySelector('.lines')!;
    // (A book's last line, what it looks like, set apart from what it teaches.)
    lines.replaceChildren(...linesOf(item).map((t, i, all) => Object.assign(document.createElement('li'), { textContent: t, className: item.book && i === all.length - 1 ? 'about' : '' })));
    el.querySelector('.where')!.textContent = `${item.found} · ${note ?? (item.book ? 'read, and learned for good' : on ? 'put on' : 'in your pack (Menu)')}`;
    void el.offsetWidth;
    el.classList.add('on');
    this.until = now + (item.book ? 6 : 4.6);
  }
}

/**
 * The pack in the menu (`#pack`): for each slot, what is worn and what else is in the pack, each a card to put it on by; and the books
 * read. `plain` names what is had with nothing worn in a slot (the skis the skier came with; the arm the foes have given).
 */
export function packView(el: HTMLElement, pack: Pack, plain: (slot: Slot) => string, onWear: (slot: Slot) => void, note: (slot: Slot) => string = () => ''): void {
  const parts: HTMLElement[] = [];
  const card = (title: string, lines: string[], on: boolean, colour: string | null, click: (() => void) | null) => {
    const b = document.createElement(click ? 'button' : 'div');
    b.className = `item${on ? ' on' : ''}`;
    if (click) { (b as HTMLButtonElement).type = 'button'; b.addEventListener('click', click); b.setAttribute('aria-pressed', String(on)); }
    const t = document.createElement('b'); t.textContent = title; if (colour) t.style.color = colour;
    b.append(t, ...lines.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
    return b;
  };
  for (const slot of ['skis', 'boots', 'ward', 'weapon'] as const) {
    const of = pack.items.filter((i) => i.slot === slot), worn = pack.wornIn(slot);
    const h = document.createElement('div'); h.className = 'slot'; h.textContent = SLOT_NAME[slot];
    parts.push(h);
    // (What holds the slot back, if anything: found weapons until the bazooka is taken up.)
    const said = note(slot);
    if (said) parts.push(Object.assign(document.createElement('p'), { className: 'note held', textContent: said }));
    parts.push(card(plain(slot), [], !worn, null, of.length ? () => { pack.wear(slot, null); onWear(slot); } : null));
    for (const it of [...of].reverse()) parts.push(card(it.name, [kindOf(it), ...linesOf(it)], it === worn, RARITY[it.rarity].colour, () => { pack.wear(slot, it.id); onWear(slot); }));
  }
  const h = document.createElement('div'); h.className = 'slot'; h.textContent = 'Guidebooks read';
  parts.push(h);
  const read = BOOKS.filter((b) => pack.read.has(b.id));
  if (!read.length) parts.push(card('None yet', ['Found in the chests of the dungeons, and on the great ones felled'], false, null, null));
  for (const b of read) parts.push(card(b.name, [`Teaches ${b.teaches}`], false, RARITY[b.rarity].colour, null));
  el.replaceChildren(...parts);
}
