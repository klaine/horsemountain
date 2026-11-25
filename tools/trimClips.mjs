// The figures' clips (`figures/clips.glb`) cut down to those the game plays: the file holds eighty-five, from both of Quaternius's
// animation libraries, and the game plays eight of them (the walk, the jog, the crouched run, the zombie's shamble, the idle, which
// the skiing clips are also made from, a death, a blow taken, a kneel). The rest were more than two of its three megabytes, fetched
// with the page before anything is seen. The mannequin's body, its skin and every clip kept stay as they were, byte for byte.
//
//   node tools/trimClips.mjs [--dry]
//
// A clip is kept if its name is written, in quotes, anywhere in `game/` or `src/`. So a clip newly played must be named there in full,
// and taken from the whole file again (klaine/dungeons, `figures/clips.glb`, where the clips were brought together) before this is run.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'figures', 'clips.glb');
const dry = process.argv.includes('--dry');

const glb = readFileSync(file);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binAt = 20 + jsonLength + 8, bin = glb.subarray(binAt, binAt + glb.readUInt32LE(20 + jsonLength));

// (The clips named in the program.)
const sources = [];
const walk = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) sources.push(readFileSync(p, 'utf8')); } };
walk(join(root, 'game')); walk(join(root, 'src'));
const program = sources.join('\n');
const named = (n) => new RegExp(`['"\`]${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(program);
const kept = gltf.animations.filter((a) => named(a.name));
if (!kept.some((a) => a.name === 'Idle_Loop')) throw new Error('Idle_Loop, which the skiing clips are made from, would go');
console.log(`clips: ${gltf.animations.length} → ${kept.length} (${kept.map((a) => a.name).join(', ')})`);

// (The accessors still wanted: the mesh's, the skin's, and the kept clips'.)
const wanted = new Set();
for (const m of gltf.meshes ?? []) for (const p of m.primitives) {
  for (const i of Object.values(p.attributes)) wanted.add(i);
  if (p.indices !== undefined) wanted.add(p.indices);
  for (const t of p.targets ?? []) for (const i of Object.values(t)) wanted.add(i);
}
for (const s of gltf.skins ?? []) if (s.inverseBindMatrices !== undefined) wanted.add(s.inverseBindMatrices);
for (const a of kept) for (const s of a.samplers) { wanted.add(s.input); wanted.add(s.output); }

// (Each accessor's bytes, from where it lies: a view with a stride (the mesh's vertices) is carried whole; a packed one (the clips'
// keys), only its accessors still wanted, one after another, each begun on a four-byte boundary.)
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const views = [], parts = [], accessors = [], newIndex = new Map();
let length = 0;
const put = (bytes) => { const at = length; parts.push(bytes); length += bytes.length; const pad = (4 - (length % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); length += pad; } return at; };
const byView = new Map();
gltf.accessors.forEach((a, i) => { if (wanted.has(i)) { const l = byView.get(a.bufferView) ?? []; l.push(i); byView.set(a.bufferView, l); } });
for (const [v, list] of [...byView].sort((a, b) => a[0] - b[0])) {
  const view = gltf.bufferViews[v], from = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  if (view.byteStride || list.length === gltf.accessors.filter((a) => a.bufferView === v).length) {
    const at = put(Buffer.from(from)), index = views.push({ ...view, byteOffset: at }) - 1;
    for (const i of list) { newIndex.set(i, accessors.length); accessors.push({ ...gltf.accessors[i], bufferView: index }); }
    continue;
  }
  const start = length, index = views.length;
  views.push(null);
  for (const i of list) {
    const a = gltf.accessors[i], size = a.count * COUNT[a.type] * SIZE[a.componentType], off = a.byteOffset ?? 0;
    const at = put(Buffer.from(from.subarray(off, off + size)));
    newIndex.set(i, accessors.length);
    accessors.push({ ...a, bufferView: index, byteOffset: at - start });
  }
  views[index] = { buffer: 0, byteOffset: start, byteLength: length - start };
}

const out = { ...gltf, accessors, bufferViews: views, buffers: [{ byteLength: length }], animations: kept.map((a) => ({
  ...a, samplers: a.samplers.map((s) => ({ ...s, input: newIndex.get(s.input), output: newIndex.get(s.output) })),
})) };
for (const m of out.meshes ?? []) for (const p of m.primitives) {
  p.attributes = Object.fromEntries(Object.entries(p.attributes).map(([k, i]) => [k, newIndex.get(i)]));
  if (p.indices !== undefined) p.indices = newIndex.get(p.indices);
  if (p.targets) p.targets = p.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, i]) => [k, newIndex.get(i)])));
}
for (const s of out.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = newIndex.get(s.inverseBindMatrices);

// (Written as a GLB again: its JSON padded with spaces, its binary with zeros, each to four bytes.)
let json = Buffer.from(JSON.stringify(out), 'utf8');
if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]);
const body = Buffer.concat(parts);
const head = Buffer.alloc(12);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
const made = Buffer.concat([head, chunk(0x4e4f534a, json), chunk(0x004e4942, body)]);
console.log(`${file}: ${(glb.length / 1e6).toFixed(2)} MB → ${(made.length / 1e6).toFixed(2)} MB${dry ? ' (not written: --dry)' : ''}`);
if (!dry) writeFileSync(file, made);
