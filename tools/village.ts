/**
 * Lays out the villages where runs that part come together again (`VILLAGES` in `game/slopeVillage.ts`) and writes each beside the
 * slices, `slopes/<world>-<village>.json`, for the game to read: `npm run village -- w2` for all of a world's, or `npm run village -- w2
 * ashbridge` for one. Each is laid out on the slice of its first run, read from `slopes/`, its pistes narrowed through it as the game
 * narrows them (`narrowPistes`); so remake it when either of its runs is written again (`npm run skirun`), or the village's rules are
 * changed. (Laid out here once, and not as the game reads a slice: each of a village's runs carries its own copy of the land, which
 * differs from the other's by a centimetre here and there, and a village laid out from each came out with a house more or less.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { readSlice } from '../src/core/skiSlice';
import { layVillage, narrowPistes, VILLAGES, villageFile, writeVillage } from '../game/slopeVillage';

const [world = 'w2', ...asked] = process.argv.slice(2);
for (const [key, v] of Object.entries(VILLAGES)) {
  if (asked.length && !asked.includes(key)) continue;
  const id = v.ways[0], slice = readSlice(readFileSync(`slopes/${id}.json`, 'utf8'));
  if (slice.world !== world) continue;
  narrowPistes(slice, id);
  const t0 = performance.now(), village = layVillage(slice, id);
  if (!village) { console.log(`${v.name}: too few houses fit; nothing written`); continue; }
  const file = `slopes/${villageFile(world, id)}`, kinds = new Map<string, number>();
  for (const h of village.houses) kinds.set(h.style, (kinds.get(h.style) ?? 0) + 1);
  writeFileSync(file, writeVillage(village));
  console.log(`${v.name}: ${village.houses.length} buildings (${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}), ${village.lanes.length} lanes, laid out in ${Math.round(performance.now() - t0)} ms: ${file}`);
}
