/**
 * The run's end, a ninth way (asked: "an ice column rises from below the player from inside ground into high heights along with a huge
 * ski jump slope (mäkihyppy) from where the player speeds down and jumps all the way to back"): a tower of ice and a ski jump's in-run on
 * it, made here in code. The tower a column of clear blue ice, its faces uneven; from its top the in-run, a deck of snow with two tracks
 * cut in it and a rail of ice each side, falling steeply and curving out into the take-off's table, held up on columns of ice that go down
 * into the ground. Built along its own +z, from its foot (0, 0, 0), as tall as it is asked to be; risen out of the ground as far as the
 * page says (`slope.ts`), which also has the skier slide down its track.
 */
import { BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Rng } from '../src/core/rng';

/**
 * The in-run's measures: how long its steep part is and how steeply it falls; the curve out and the table's own slope (down, more than
 * nothing) and length; how broad its deck is. (Its table turned up at its lip (asked: "the lip needs to be angled to look like it gives a
 * higher jump"), the curve longer to come round to it: it had fallen at ten degrees to its lip, as a ski jump's does, and looked to
 * throw the skier out flat, under the great arch it flies.)
 */
export const ICE = { inrun: 55, steep: (33 * Math.PI) / 180, curve: 20, table: (-14 * Math.PI) / 180, flat: 6, deck: 5.6, web: 2.4, column: 3.4, below: 30 };

export class IceJump {
  readonly group = new Group();
  private readonly built = new Group();
  private readonly ice: MeshStandardMaterial;
  private readonly snow: MeshStandardMaterial;
  private readonly cut: MeshStandardMaterial;
  /** The track's points along the deck's middle, on its surface, from the top; and how far along it each is. */
  private points: Vector3[] = [];
  private along: number[] = [];
  /** How tall it is built: its top over its foot. */
  tall = 60;

  constructor(private readonly rng: Rng) {
    this.ice = new MeshStandardMaterial({ color: 0xbfe4fb, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.84, emissive: 0x1c4a6c, emissiveIntensity: 0.35 });
    this.snow = new MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.85 });
    this.cut = new MeshStandardMaterial({ color: 0x9fb4c8, roughness: 0.6 });
    this.group.add(this.built);
    this.group.visible = false;
    this.group.name = 'ice jump';
  }

  /** How long the track is, from the top of the tower to the table's lip. */
  get length() { return this.along[this.along.length - 1] ?? 0; }

  /** Built again `tall` metres high: the tower, the in-run down from its top to the table, and the columns under it. */
  build(tall: number) {
    this.tall = tall;
    for (const m of this.built.children) (m as Mesh).geometry?.dispose();
    this.built.clear();
    const rng = this.rng.fork(`build ${tall.toFixed(1)}`), shadowed = (m: Mesh) => { m.castShadow = true; m.receiveShadow = true; return m; };
    // The track: down the steep part, out round the curve to the table's slope, along the table to its lip.
    const pts: Vector3[] = [], top = new Vector3(0, tall, 0.4);
    const dirAt = (a: number) => new Vector3(0, -Math.sin(a), Math.cos(a));
    let p = top.clone();
    pts.push(p.clone());
    for (let s = 1; s <= ICE.inrun; s++) { p = p.clone().addScaledVector(dirAt(ICE.steep), 1); pts.push(p.clone()); }
    for (let s = 1; s <= ICE.curve; s++) { const a = ICE.steep + (ICE.table - ICE.steep) * (s / ICE.curve); p = p.clone().addScaledVector(dirAt(a), 1); pts.push(p.clone()); }
    for (let s = 1; s <= ICE.flat; s++) { p = p.clone().addScaledVector(dirAt(ICE.table), 1); pts.push(p.clone()); }
    this.points = pts;
    this.along = pts.map((_, i) => i);
    // The deck: a strip of snow along the track, a slab of ice under it, two tracks cut in it, a rail of ice each side.
    const strip = (half: number, up: number, down: number, mat: MeshStandardMaterial) => {
      const pos: number[] = [], idx: number[] = [];
      pts.forEach((q, i) => {
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)], d = next.clone().sub(prev).normalize(), n = new Vector3(0, d.z, -d.y);
        const a = q.clone().addScaledVector(n, up), b = q.clone().addScaledVector(n, -down);
        pos.push(-half, a.y, a.z, half, a.y, a.z, -half, b.y, b.z, half, b.y, b.z);
        if (i) { const k = 4 * i, j = k - 4; idx.push(j, j + 1, k, j + 1, k + 1, k, j + 2, k + 2, j + 3, j + 3, k + 2, k + 3, j, k, j + 2, j + 2, k, k + 2, j + 1, j + 3, k + 1, j + 3, k + 3, k + 1); }
      });
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return shadowed(new Mesh(g, mat));
    };
    const half = ICE.deck / 2;
    const deck = strip(half, 0, 0.08, this.snow), slab = strip(half + 0.15, -0.08, 1.4, this.ice);
    const tracks = [-0.55, 0.55].map((x) => { const m = strip(0.09, 0.012, 0.0, this.cut); m.position.x = x; return m; });
    const rails = [-1, 1].map((sd) => { const m = strip(0.18, 0.9, 0.05, this.ice); m.position.x = sd * (half + 0.1); return m; });
    // The tower: a column of ice, uneven, from under the ground to the top of the in-run, a little broader at its foot.
    const col = new CylinderGeometry(ICE.column, ICE.column * 1.25, tall + ICE.below, 7, 6);
    const cp = col.getAttribute('position');
    for (let i = 0; i < cp.count; i++) { const w = 1 + rng.range(-0.08, 0.08); cp.setX(i, cp.getX(i) * w); cp.setZ(i, cp.getZ(i) * w); }
    col.computeVertexNormals();
    col.translate(0, (tall - ICE.below) / 2, 0);
    const tower = shadowed(new Mesh(col, this.ice));
    // (A cap of snow on its top, round the start of the in-run.)
    const cap = shadowed(new Mesh(new CylinderGeometry(ICE.column * 1.05, ICE.column * 1.05, 0.3, 7), this.snow));
    cap.position.y = tall + 0.05;
    // Under the in-run, a wall of ice down from its slab into the ground, as broad as the slab is at its top: a whole ski jump's hill,
    // not a deck on posts.
    const pos: number[] = [], idx: number[] = [], w = ICE.web / 2;
    pts.forEach((q, i) => {
      const top = q.y - 1.2, bottom = -ICE.below;
      pos.push(-w, top, q.z, w, top, q.z, -w, bottom, q.z, w, bottom, q.z);
      if (i) { const k = 4 * i, j = k - 4; idx.push(j, j + 1, k, j + 1, k + 1, k, j + 2, k + 2, j + 3, j + 3, k + 2, k + 3, j, k, j + 2, j + 2, k, k + 2, j + 1, j + 3, k + 1, j + 3, k + 3, k + 1); }
    });
    const n = pts.length - 1;
    idx.push(4 * n, 4 * n + 2, 4 * n + 1, 4 * n + 1, 4 * n + 2, 4 * n + 3);
    const webGeo = new BufferGeometry();
    webGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    webGeo.setIndex(idx);
    webGeo.computeVertexNormals();
    const legs = [shadowed(new Mesh(webGeo, this.ice))];
    // Shards of ice thrust up about its foot.
    const shards: Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2), r = ICE.column + rng.range(0.5, 3.5), h = rng.range(1.5, 5);
      const m = shadowed(new Mesh(new ConeGeometry(rng.range(0.3, 0.8), h, 5), this.ice));
      m.position.set(Math.cos(a) * r, h / 2 - 0.6, Math.sin(a) * r);
      m.rotation.set(rng.range(-0.4, 0.4), rng.range(0, 6), rng.range(-0.4, 0.4));
      shards.push(m);
    }
    this.built.add(deck, slab, ...tracks, ...rails, tower, cap, ...legs, ...shards);
  }

  /** Stood with its foot at `foot`, its in-run going along `toward` (level), risen out of the ground by `rise` (0, its top level with the snow; 1, all of it up). */
  place(foot: Vector3, toward: Vector3, rise: number) {
    this.group.visible = rise > 0.001;
    // (Its top under the skier's feet as it begins, level with the snow.)
    this.group.position.copy(foot).addScaledVector(new Vector3(0, 1, 0), -this.tall * (1 - rise));
    this.group.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), toward.clone().setY(0).normalize()));
    this.group.updateMatrixWorld(true);
  }

  /** The point `s` metres down the track from the top, on the deck, and its way there, in the world. */
  track(s: number): { at: Vector3; dir: Vector3 } {
    const n = this.points.length, f = Math.min(Math.max(s, 0), n - 1.001), i = Math.floor(f), k = f - i;
    const a = this.points[i], b = this.points[Math.min(n - 1, i + 1)];
    const at = this.group.localToWorld(a.clone().lerp(b, k)), dir = b.clone().sub(a).normalize().transformDirection(this.group.matrixWorld);
    return { at, dir };
  }

  hide() { this.group.visible = false; }
}
