import { Rng } from './rng';

/**
 * Names for what a world holds: its towns, islands, glens and mountains, and the great features of
 * its country. A northern country of sounds, glens and fells, so the names have that ring without
 * being any real place's: a root of one or two syllables, made up, with the word a map would put
 * with it for what it names.
 */

const FIRST = ['al', 'ar', 'bal', 'bran', 'cal', 'carn', 'dor', 'dun', 'el', 'fal', 'gar', 'glas', 'hal', 'kel', 'kil', 'lor', 'mar', 'mor', 'nor', 'or', 'ral', 'ros', 'sel', 'tal', 'tor', 'ul', 'val', 'wen', 'yr', 'ash', 'thorn', 'brack'];
const SECOND = ['an', 'ach', 'dar', 'den', 'e', 'ish', 'ith', 'mere', 'nach', 'or', 'ra', 'rin', 'ston', 'vie', 'wyn', 'y', 'ock', 'el', 'way', 'more'];
const TOWN_END = ['ford', 'by', 'wick', 'ham', 'ton', 'stead', 'mouth', 'bridge', 'holm', 'dale', 'thwaite', 'ley', 'garth', 'bury', 'haven'];
const PEAK_WORDS = { a: ['Grey', 'White', 'Old', 'Black', 'Pale', 'Silent', 'High', 'Cold', 'Broken', 'Long'], b: ['Warden', 'Horn', 'Man', 'Tooth', 'Crown', 'Spire', 'Shepherd', 'Saddle', 'Anvil', 'Watcher'] };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A made-up root: one syllable, or two. */
function root(rng: Rng): string {
  const a = rng.pick(FIRST);
  return cap(rng.chance(0.7) ? a + rng.pick(SECOND) : a);
}

export type NameKind = 'world' | 'sea' | 'bay' | 'upland' | 'range' | 'peak' | 'harbour' | 'town' | 'village' | 'island' | 'valley' | 'mountain';

/**
 * Hands out names for one world, none twice. Each name is drawn from a stream of its own, keyed by
 * what it names (`key`: its kind and where it is), so that a place keeps its name whatever else the
 * world finds or loses: drawn one after another, every name after a place gained or lost was another.
 */
export class Namer {
  private used = new Set<string>();
  constructor(private rng: Rng) {}
  name(kind: NameKind, key: string = kind): string {
    for (let tries = 0; ; tries++) {
      const n = this.make(kind, this.rng.fork(tries ? `${key}/${tries}` : key));
      if (!this.used.has(n) || tries > 40) { this.used.add(n); return n; }
    }
  }
  private make(kind: NameKind, r: Rng): string {
    const x = root(r);
    switch (kind) {
      case 'world': return x;
      case 'sea': return r.pick([`The ${x} Sound`, `The Sea of ${x}`, `The ${x} Firth`]);
      case 'bay': return r.pick([`The Bay of ${x}`, `${x} Firth`, `The ${x} Fjord`]);
      case 'upland': return r.pick([`The ${x} Fells`, `The ${x} Moors`, `The Heights of ${x}`]);
      case 'range': return r.pick([`The ${x} Mountains`, `The ${x} Range`, `The Wall of ${x}`]);
      case 'peak': return `The ${r.pick(PEAK_WORDS.a)} ${r.pick(PEAK_WORDS.b)}`;
      case 'harbour': return r.pick([`${x}haven`, `Port ${x}`, `${x}mouth`]);
      case 'town':
      case 'village': {
        const end = r.pick(TOWN_END), stem = r.pick(FIRST);
        return cap(stem + (/[aeiou]$/.test(stem) || /^[aeiou]/.test(end) ? '' : r.pick(['', '', 'e', 'en'])) + end);
      }
      case 'island': return r.pick([`Isle of ${x}`, `${x} Holm`, `${x}ay`, `${x} Island`]);
      case 'valley': return r.pick([`Glen ${x}`, `${x}dale`, `Strath ${x}`, `Glen ${x}`]);
      case 'mountain': return r.pick([`Ben ${x}`, `${x} Pike`, `${x} Fell`, `Ben ${x}`, `Mount ${x}`]);
    }
  }
}
