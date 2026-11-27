/**
 * The end of a run marked on the snow (asked: "add clear final run end area markers (like blue painted boundary in the snow or a flag
 * or something to the runs"): where the ride is brought to a stop (thirty metres short of the run's length) a band of blue paint
 * across the piste, blue flags on poles down both edges for the stretch before it, and a gate over the line, two posts and a banner
 * reading FINISH, facing the skier coming down. Made by the page for each way of a land, and let go of with it.
 */
import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, SRGBColorSpace,
} from 'three';
import type { Land } from './slopeLand';

/** How far short of the run's length the ride is brought to a stop (the page's `land.length - 30`). */
export const FINISH_BEFORE = 30;

const BLUE = 0x1d63d8;

/** The banner's face: white on blue with a chequered edge, `w` by `h` metres. */
function bannerFace(w: number, h: number): CanvasTexture {
  const c = document.createElement('canvas');
  // (A broad piste has a long banner: the picture is as wide as the canvas allows, and the word said over again along it, at its own
  // proportions, as often as it fits.)
  c.width = 4096; c.height = Math.max(64, Math.round((4096 * h) / w));
  const g = c.getContext('2d')!, W = c.width, H = c.height, cell = H / 5;
  g.fillStyle = '#1d63d8'; g.fillRect(0, 0, W, H);
  // (A chequered border along the top and the bottom.)
  for (let i = 0; i * cell < W; i++) for (const row of [0, 4]) { g.fillStyle = (i + row / 4) % 2 ? '#f4f7ff' : '#0c2c6b'; g.fillRect(i * cell, row * cell, cell, cell); }
  g.fillStyle = '#f4f7ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${H * 0.5}px Georgia, 'Times New Roman', serif`;
  const copies = Math.max(1, Math.floor(W / (H * 6)));
  for (let i = 0; i < copies; i++) g.fillText('FINISH', ((i + 0.5) * W) / copies, H / 2 + H * 0.03);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/**
 * The marks at the end of one way down a run: `way` gives its length, its points and edges, `height` the snow's. Standing in the
 * scene's own coordinates, so added to the land's group as it is.
 */
export function finishMarks(way: Pick<Land, 'length' | 'at' | 'edges'>, height: (x: number, z: number) => number): { group: Group; dispose(): void } {
  const group = new Group(), s0 = way.length - FINISH_BEFORE, disposables: { dispose(): void }[] = [];
  group.name = 'finish';
  const [lo, hi] = way.edges(s0), edge = (side: number, s: number) => way.edges(s)[side > 0 ? 1 : 0] + side * 1.2;

  // The paint: a band a metre and a half along the run across the piste (and a little past each edge), lying on the snow.
  const band = (sa: number, sb: number, color: number, lift: number) => {
    const n = 28, pos: number[] = [], index: number[] = [];
    const [l, h] = way.edges(sa), a = l - 1.2, b = h + 1.2;
    for (let i = 0; i <= n; i++) {
      const left = a + ((b - a) * i) / n;
      for (const s of [sa, sb]) { const p = way.at(s, left); pos.push(p.x, height(p.x, p.z) + lift, p.z); }
    }
    for (let i = 0; i < n; i++) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(index); geo.computeVertexNormals();
    const mat = new MeshStandardMaterial({ color, roughness: 0.55, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const m = new Mesh(geo, mat);
    m.name = 'finish paint'; m.receiveShadow = true; m.frustumCulled = false;
    group.add(m); disposables.push(geo, mat);
  };
  // (A wide blue band with a thin white one just before it, so that it reads from far up the run.)
  band(s0, s0 + 1.8, BLUE, 0.05);
  band(s0 - 1.1, s0 - 0.5, 0xf4f7ff, 0.05);
  // The foot of the run's own edge: a line of blue along each side of the piste across the stopping stretch, dashed.
  for (const side of [-1, 1]) for (let s = s0 + 2; s < way.length - 2; s += 5) {
    const a = way.at(s, edge(side, s) - side * 0.6), b = way.at(s + 2.5, edge(side, s + 2.5) - side * 0.6);
    const ax = (a.x + b.x) / 2, az = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z);
    const geo = new BoxGeometry(0.35, 0.04, len), mat = new MeshStandardMaterial({ color: BLUE, roughness: 0.6 });
    const m = new Mesh(geo, mat);
    m.position.set(ax, height(ax, az) + 0.04, az); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    group.add(m); disposables.push(geo, mat);
  }

  // The flags: a pole at each edge every six metres from the line to the run's end, each with a blue pennant streaming down the run.
  const pole = new CylinderGeometry(0.04, 0.05, 2.6, 6).translate(0, 1.3, 0), pennant = new BoxGeometry(0.02, 0.4, 0.8).translate(0, 2.35, -0.42);
  const wood = new MeshStandardMaterial({ color: 0x5b4030, roughness: 0.85 }), cloth = new MeshStandardMaterial({ color: BLUE, roughness: 0.7, side: DoubleSide });
  disposables.push(pole, pennant, wood, cloth);
  for (const side of [-1, 1]) for (let s = s0 + 6; s <= way.length; s += 6) {
    const p = way.at(s, edge(side, s));
    const g = new Group(), a = new Mesh(pole, wood), b = new Mesh(pennant, cloth);
    a.castShadow = true; g.add(a, b);
    g.position.set(p.x, height(p.x, p.z), p.z);
    g.rotation.y = Math.atan2(p.dx, p.dz);
    group.add(g);
  }

  // The gate over the line: two tall posts a metre and a half outside the piste's edges, a banner between them facing up the run.
  const left = way.at(s0, hi + 1.8), right = way.at(s0, lo - 1.8), mid = way.at(s0, (hi + lo) / 2);
  const width = Math.hypot(left.x - right.x, left.z - right.z), H = 2.2, post = new CylinderGeometry(0.1, 0.12, 7, 8).translate(0, 3.5, 0);
  const face = bannerFace(width, H), front = new MeshStandardMaterial({ map: face, roughness: 0.7 }), back = new MeshStandardMaterial({ color: BLUE, roughness: 0.7 });
  const board = new BoxGeometry(width, H, 0.06), blue = new MeshStandardMaterial({ color: BLUE, roughness: 0.6 });
  disposables.push(post, face, front, back, board, blue);
  for (const p of [left, right]) {
    const m = new Mesh(post, blue);
    m.position.set(p.x, height(p.x, p.z), p.z); m.castShadow = true;
    group.add(m);
  }
  // (Its faces along its own +z, turned up the run, as the fork sign's are; the banner's span along the line between the posts.)
  const gate = new Mesh(board, [back, back, back, back, front, back]);
  gate.position.set((left.x + right.x) / 2, Math.max(height(left.x, left.z), height(right.x, right.z)) + 5.6, (left.z + right.z) / 2);
  gate.rotation.y = Math.atan2(-mid.dx, -mid.dz);
  gate.castShadow = true;
  group.add(gate);

  return { group, dispose: () => { for (const d of disposables) d.dispose(); } };
}
