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
 * a foe is in its fire; the bazooka's, at the heart of its blast), how far it strikes true before each further ten metres takes a point
 * from the die, and how far off a foe may be to be locked on.
 */
export interface ArmDice { skill: number; dmg: Dice; sure: number; lock: number }
export const ARM_DICE: Record<ArmKind, ArmDice> = {
  // (A cut of the long sword brings down an orc four times in five, a draugr in two; held and let go full, `CHARGED`, a yeti more often
  // than not.)
  sword: { skill: 7, dmg: { n: 4, d: 6, plus: 14 }, sure: 6, lock: 30 },
  pistol: { skill: 6, dmg: { n: 2, d: 6, plus: 7 }, sure: 25, lock: 60 },
  // (Nine pellets a blast, each rolled: most of them strike, near, and bring an orc down together.)
  shotgun: { skill: 4, dmg: { n: 1, d: 6, plus: 2 }, sure: 12, lock: 40 },
  flamer: { skill: 0, dmg: { n: 2, d: 6, plus: 4 }, sure: 22, lock: 24 },
  smg: { skill: 4, dmg: { n: 1, d: 8, plus: 3 }, sure: 35, lock: 100 },
  // (Each leap from foe to foe the weaker, `LEAP`.)
  lightning: { skill: 8, dmg: { n: 2, d: 10, plus: 16 }, sure: 60, lock: 110 },
  // (A rocket that misses goes off near, and its blast may catch the foe all the same.)
  bazooka: { skill: 5, dmg: { n: 8, d: 8, plus: 50 }, sure: 60, lock: 110 },
};
/** A cut held and let go full strikes so many times harder than a quick one (and its skill so much the more). */
export const CHARGED = { dmg: 2.6, skill: 3 };
/** Each leap of lightning to the next foe strikes so much as hard as the one before. */
export const LEAP = 0.8;
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
 * An attack with `arm` at a foe whose guard is `guard`, `far` metres off: the die rolled with the arm's skill (and `bonus`, and less for
 * each ten metres past where it strikes true), against the guard; and, struck, its damage (`times` as hard).
 */
export function attack(rng: Rng, arm: ArmKind, guard: number, far: number, bonus = 0, times = 1): Roll {
  const a = ARM_DICE[arm], die = rng.int(1, 20);
  const add = a.skill + bonus - Math.floor(Math.max(0, far - a.sure) / 10);
  const crit = die === 20, hit = crit || (die !== 1 && die + add >= guard);
  return { die, bonus: add, guard, hit, crit, dmg: hit ? damage(rng, a.dmg, crit, times) : 0 };
}

/** How an attack's roll reads, for the fight's line: `d20 14 +6 vs 11 · 13`. */
export function rollSaid(r: Roll): string {
  const sign = r.bonus < 0 ? '−' : '+';
  return `d20 ${r.die} ${sign}${Math.abs(r.bonus)} vs ${r.guard} · ${r.crit ? `critical ${r.dmg}` : r.hit ? `${r.dmg}` : 'miss'}`;
}
