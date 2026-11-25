/**
 * The dice behind the fight (asked: "Can we find a nice way to leave out human aiming? Like auto targeting and just attack button and
 * maybe cycle target buttons next to attack. Some kind of light rpg system to roll attacks in the background, damage etc. Basic enemies
 * can have a bit more health"): each attack at a foe rolls a twenty-sided die, with the arm's skill added, against how hard the foe is to
 * strike (its guard, `FoeKind.guard`); a natural twenty always strikes, and strikes hard (a critical: the damage dice thrown twice), a
 * natural one always misses. What strikes rolls its damage dice. A foe's strength is kept as so many blows (`FoeKind.hp`, a round of
 * the tommy gun as it was, one), and said as so many hit points, `HP` to a blow; damage is rolled in hit points.
 *
 * Aimed by the arms themselves (auto aiming, and the demos), each round, pellet, cut or bolt at the foe locked on is rolled to strike or
 * miss; aimed by hand (*Aiming: Free*), what the hand aimed true strikes, and only its damage is rolled.
 */
import type { Rng } from '../src/core/rng';
import type { ArmKind } from './slopeArms';

/** Hit points to a blow: a foe's `hp` of 2.4 blows is said as 24. */
export const HP = 10;

/** So many dice of so many sides, and so much added: `n`d`d` + `plus`. */
export interface Dice { n: number; d: number; plus: number }
export const diceSaid = (x: Dice) => `${x.n}d${x.d}${x.plus ? `+${x.plus}` : ''}`;

/**
 * Each arm's skill (added to the die), its damage (per round, per pellet, per cut, per bolt; the flamethrower's, each `BURN_EVERY` seconds
 * a foe is in its fire; the bazooka's, at the heart of its blast), how far it strikes true before each further `FAR_STEP` metres takes a
 * point from the die (and, for what fires rounds, from the blow, `falloff`), and how far off a foe may be to be locked on. And how
 * quickly the arms swing it round to a foe (`turn`, degrees a second), the heavier the slower; and how much each round fired throws the
 * aim off for those after it (`kick`, points off the die, wearing off by `SETTLE`): the tommy gun's, held down, two or so.
 */
export interface ArmDice { skill: number; dmg: Dice; sure: number; lock: number; crit: number; turn: number; kick: number }
export const ARM_DICE: Record<ArmKind, ArmDice> = {
  // (A cut of the long sword brings down an orc four times in five, a draugr in two; held and let go full, `CHARGED`, a yeti more often
  // than not.)
  sword: { skill: 7, dmg: { n: 4, d: 6, plus: 14 }, sure: 6, lock: 30, crit: 18, turn: 400, kick: 0 },
  pistol: { skill: 6, dmg: { n: 2, d: 6, plus: 7 }, sure: 18, lock: 60, crit: 19, turn: 240, kick: 0.9 },
  // (Nine pellets a blast, each rolled: most of them strike, near, and bring an orc down together.)
  shotgun: { skill: 4, dmg: { n: 1, d: 6, plus: 2 }, sure: 9, lock: 40, crit: 20, turn: 190, kick: 1.5 },
  flamer: { skill: 0, dmg: { n: 2, d: 6, plus: 4 }, sure: 22, lock: 24, crit: 20, turn: 160, kick: 0 },
  // (Heavy, and climbing as it is held down: quick to kill what is near and in its sights, slow to come round to the next.)
  smg: { skill: 4, dmg: { n: 1, d: 8, plus: 3 }, sure: 20, lock: 100, crit: 20, turn: 120, kick: 0.25 },
  // (Each leap from foe to foe the weaker, `LEAP`. Weaker than it was (asked: "make lightning gun a bit less powerful but visually way
  // more impressive"): 2d10+16 a bolt, four fifths of it at each leap, had brought an orc down four times in five and the next often
  // too; now a third of the time, and seven tenths at each leap.)
  lightning: { skill: 8, dmg: { n: 2, d: 8, plus: 13 }, sure: 45, lock: 110, crit: 19, turn: 200, kick: 0.6 },
  // (A rocket that misses goes off near, and its blast may catch the foe all the same.)
  bazooka: { skill: 5, dmg: { n: 8, d: 8, plus: 50 }, sure: 45, lock: 110, crit: 19, turn: 80, kick: 2 },
};
/** Metres past where an arm strikes true for each point it loses off the die. */
export const FAR_STEP = 7;
/**
 * How quickly a round's throw of the aim wears off: so large a share of it a second, so that a gun held down comes to a throw of its
 * own (the tommy gun's, some two points off the die; the pistol's, fired as fast as it will, three).
 */
export const SETTLE = 1.6;
/**
 * How hard a round strikes, `far` metres off, from an arm that fires rounds (the pistol, the shotgun's pellets, the tommy gun; not a
 * rocket's blast, nor fire, nor lightning) (asked: "damage should fall off with non rocket bullet shooting weapons"): as hard as it
 * was out to where it strikes true (`sure`, as far as `further` a share further), then less, down to two fifths at three times as far.
 */
export function falloff(arm: ArmKind, far: number, further = 0): number {
  if (arm !== 'pistol' && arm !== 'shotgun' && arm !== 'smg') return 1;
  const sure = ARM_DICE[arm].sure * (1 + further);
  return Math.max(0.4, Math.min(1, 1 - (0.6 * (far - sure)) / (2 * sure)));
}
/** A cut held and let go full strikes so many times harder than a quick one (and its skill so much the more). */
export const CHARGED = { dmg: 2.6, skill: 3 };
/** Each leap of lightning to the next foe strikes so much as hard as the one before. */
export const LEAP = 0.7;
/** How often the flamethrower's fire burns a foe kept in it. */
export const BURN_EVERY = 0.2;

/** One attack's roll: the die, what was added, what it came to against the guard, and what it did. */
export interface Roll {
  die: number; bonus: number; guard: number;
  hit: boolean; crit: boolean;
  /** Hit points of damage (none, if it missed). */
  dmg: number;
}

export function rollDice(rng: Rng, x: Dice, times = 1): number {
  let sum = x.plus;
  for (let i = 0; i < x.n * times; i++) sum += rng.int(1, x.d);
  return sum;
}

/** Damage rolled for an attack that struck (a critical, its dice thrown twice), so many times as hard. */
export function damage(rng: Rng, x: Dice, crit = false, times = 1): number {
  return Math.max(1, Math.round(rollDice(rng, x, crit ? 2 : 1) * times));
}

/**
 * An attack with `skill` against `guard`: the die rolled and the skill added; a natural one always misses, a die of `crit` or over
 * (a natural twenty, for most) always strikes, and strikes hard; and, struck, `dmg` rolled (`times` as hard).
 */
export function rollAt(rng: Rng, skill: number, dmg: Dice, guard: number, crit = 20, times = 1): Roll {
  const die = rng.int(1, 20), critical = die >= crit, hit = critical || (die !== 1 && die + skill >= guard);
  return { die, bonus: skill, guard, hit, crit: critical, dmg: hit ? damage(rng, dmg, critical, times) : 0 };
}

/**
 * An attack with `arm` at a foe whose guard is `guard`, `far` metres off: the die rolled with the arm's skill (and `bonus`, and less for
 * each `FAR_STEP` metres past where it strikes true, `further` a share further), against the guard; and, struck, its damage (`times` as
 * hard, and a round's the less the further past that, `falloff`). Some arms strike hard
 * more often than on a natural twenty (`ArmDice.crit`): the sword on 18 and over, the pistol, the lightning gun and the bazooka on 19.
 */
export function attack(rng: Rng, arm: ArmKind, guard: number, far: number, bonus = 0, times = 1, further = 0): Roll {
  const a = ARM_DICE[arm];
  return rollAt(rng, a.skill + bonus - Math.floor(Math.max(0, far - a.sure * (1 + further)) / FAR_STEP), a.dmg, guard, a.crit, times * falloff(arm, far, further));
}

/**
 * A blow that was not rolled to strike (aimed by hand, a blast, fire, a leap of lightning, a ward): only its damage rolled, and as
 * likely to strike hard as the arm's die is to come up a critical.
 */
export function blow(rng: Rng, arm: ArmKind, times = 1): { dmg: number; crit: boolean } {
  const a = ARM_DICE[arm], crit = rng.int(1, 20) >= a.crit;
  return { dmg: damage(rng, a.dmg, crit, times), crit };
}

/**
 * How hard the one on foot is to strike (asked: "enemies attacks against the player should also use rpg system"), against a foe's
 * d20 and its skill (`FoeKind.den.skill`); the barrow ward worn, harder still.
 */
export const GUARD = 12;

/** How an attack's roll reads, for the fight's line: `d20 14 +6 vs 11 · 13`. */
export function rollSaid(r: Roll): string {
  const sign = r.bonus < 0 ? '−' : '+';
  return `d20 ${r.die} ${sign}${Math.abs(r.bonus)} vs ${r.guard} · ${r.crit ? `critical ${r.dmg}` : r.hit ? `${r.dmg}` : 'miss'}`;
}
