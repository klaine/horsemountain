import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute } from 'three';

/** Vertex layout shared by all site geometry. */
export const FIELD_MOSS = 0;
export const FIELD_WET = 1;
export const FIELD_SOOT = 2;
export const FIELD_MORTAR = 3;

class GrowF32 {
  data: Float32Array;
  length = 0;
  constructor(initial: number) {
    this.data = new Float32Array(initial);
  }
  ensure(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    let cap = this.data.length * 2;
    while (cap < this.length + extra) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }
  trimmed(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

/** Accumulates indexed triangles with position, normal, uv, colour and a four-channel field. */
export class MeshBuilder {
  private pos = new GrowF32(3 << 14);
  private nrm = new GrowF32(3 << 14);
  private uv = new GrowF32(2 << 14);
  private col = new GrowF32(3 << 14);
  private fld = new GrowF32(4 << 14);
  private idx: number[] = [];
  /**
   * Which vertices carry baked light. Tracing light for every vertex is wasteful: a stone's bevel
   * and mortar edge can take their light from the stone's face. A vertex with a source copies that
   * vertex's baked light, scaled; a vertex without one is traced itself.
   */
  private bakeSource: number[] = [];
  private bakeScale: number[] = [];
  /** For geometry that is not baked: the share of the sky each vertex can see, where the builder knows it. */
  private sky: number[] = [];
  /**
   * Where each point lies on the face it belongs to, for faces that say so (`markFace`): four bytes, the first two how far across
   * the face and how far up it (0 or 255 at a corner), the third what the face is (0 none, 128 four-cornered, 255 three-cornered).
   * The materials read it to round the face's edges (see `edgeOf` in `siteMaterial.ts`). (Held in an object, so that a builder made
   * from another, as a burnt house's is, writes into the same one.)
   */
  private readonly edges = { data: new Uint8Array(0) };
  vertexCount = 0;

  addVertex(
    px: number, py: number, pz: number,
    nx: number, ny: number, nz: number,
    u: number, v: number,
    r: number, g: number, b: number,
    f0 = 0, f1 = 0, f2 = 0, f3 = 0,
  ): number {
    const i = this.vertexCount++;
    this.pos.ensure(3);
    this.nrm.ensure(3);
    this.uv.ensure(2);
    this.col.ensure(3);
    this.fld.ensure(4);
    const p = this.pos, n = this.nrm, t = this.uv, c = this.col, f = this.fld;
    p.data[p.length++] = px; p.data[p.length++] = py; p.data[p.length++] = pz;
    n.data[n.length++] = nx; n.data[n.length++] = ny; n.data[n.length++] = nz;
    t.data[t.length++] = u; t.data[t.length++] = v;
    c.data[c.length++] = r; c.data[c.length++] = g; c.data[c.length++] = b;
    f.data[f.length++] = f0; f.data[f.length++] = f1; f.data[f.length++] = f2; f.data[f.length++] = f3;
    return i;
  }

  /** Makes vertex `i` take its baked light from vertex `source`, multiplied by `scale`. */
  setBakeSource(i: number, source: number, scale: number): void {
    this.bakeSource[i] = source;
    this.bakeScale[i] = scale;
  }

  /** Records how much of the sky vertex `i` can see, from 0 to 1. Used only where light is not baked. */
  setOpen(i: number, open: number): void {
    this.sky[i] = open;
  }

  /** The share of sky recorded for vertex `i`; all of it if nothing was recorded. */
  openAt(i: number): number {
    return this.sky[i] ?? 1;
  }

  /** For each vertex, the vertex its baked light comes from (itself if it is traced) and the multiplier. */
  bakePlan(): { source: Int32Array; scale: Float32Array } {
    const source = new Int32Array(this.vertexCount);
    const scale = new Float32Array(this.vertexCount);
    for (let i = 0; i < this.vertexCount; i++) {
      const s = this.bakeSource[i];
      source[i] = s === undefined ? i : s;
      scale[i] = s === undefined ? 1 : this.bakeScale[i];
    }
    return { source, scale };
  }

  /**
   * Copies another mesh into this one. Each vertex is handed to `place` as a position, a normal,
   * a colour, a field and its share of sky, any of which it may change: this is how one carved
   * stone becomes many, each turned and tinted differently.
   */
  /** Says, for every point already laid, how much of the sky it sees, from where the point is: for what is underground and sees none. */
  setOpenBy(value: (x: number, y: number, z: number) => number, from = 0): void {
    for (let i = from; i < this.vertexCount; i++) this.setOpen(i, value(this.pos.data[i * 3], this.pos.data[i * 3 + 1], this.pos.data[i * 3 + 2]));
  }

  /** Moves every point laid from `from` on: `move` is given its place and may change it. (A front that leans out over the street is built upright and then leaned.) */
  movePoints(move: (p: number[]) => void, from = 0): void {
    const p = [0, 0, 0], d = this.pos.data;
    for (let i = from; i < this.vertexCount; i++) {
      p[0] = d[i * 3]; p[1] = d[i * 3 + 1]; p[2] = d[i * 3 + 2];
      move(p);
      d[i * 3] = p[0]; d[i * 3 + 1] = p[1]; d[i * 3 + 2] = p[2];
    }
  }

  /**
   * Light of its own, for what is neither baked nor under the sky: for every point already laid,
   * given where it is and which way it faces, the light that falls on it, as the bake would
   * have written it (for each of red, green and blue: a level, and three numbers for the way it
   * comes from; and last, a thirteenth number, whether it stands clear in a shaft of sunlight).
   * What is given this is lit by nothing else but lamps.
   */
  own: Float32Array | null = null;
  setLightBy(light: (p: number[], n: number[], out: Float32Array) => void): void {
    this.own = new Float32Array(this.vertexCount * 13);
    const p = [0, 0, 0], n = [0, 0, 0], out = new Float32Array(13);
    for (let i = 0; i < this.vertexCount; i++) {
      for (let k = 0; k < 3; k++) { p[k] = this.pos.data[i * 3 + k]; n[k] = this.nrm.data[i * 3 + k]; }
      out.fill(0);
      light(p, n, out);
      this.own.set(out, i * 13);
    }
  }

  /** Calls `fn` for every triangle laid: its three vertices' numbers, where its middle is, and which way its first vertex faces. */
  eachTriangle(fn: (a: number, b: number, c: number, mx: number, my: number, mz: number, nx: number, ny: number, nz: number) => void): void {
    const P = this.pos.data, Q = this.nrm.data;
    for (let t = 0; t < this.idx.length; t += 3) {
      const a = this.idx[t], b = this.idx[t + 1], c = this.idx[t + 2];
      fn(a, b, c, (P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3, Q[a * 3], Q[a * 3 + 1], Q[a * 3 + 2]);
    }
  }

  /** Sets one of the four fields of every point already laid, from where the point is. Where the function gives nothing, the field is left. */
  setField(channel: number, value: (x: number, y: number, z: number) => number | undefined): void {
    for (let i = 0; i < this.vertexCount; i++) {
      const v = value(this.pos.data[i * 3], this.pos.data[i * 3 + 1], this.pos.data[i * 3 + 2]);
      if (v !== undefined) this.fld.data[i * 4 + channel] = v;
    }
  }

  append(src: MeshBuilder, place: (v: { p: number[]; n: number[]; colour: number[]; field: number[]; open: number }) => void): void {
    const base = this.vertexCount;
    const v = { p: [0, 0, 0], n: [0, 0, 0], colour: [0, 0, 0], field: [0, 0, 0, 0], open: 1 };
    for (let i = 0; i < src.vertexCount; i++) {
      for (let k = 0; k < 3; k++) {
        v.p[k] = src.pos.data[i * 3 + k];
        v.n[k] = src.nrm.data[i * 3 + k];
        v.colour[k] = src.col.data[i * 3 + k];
      }
      for (let k = 0; k < 4; k++) v.field[k] = src.fld.data[i * 4 + k];
      v.open = src.openAt(i);
      place(v);
      const id = this.addVertex(v.p[0], v.p[1], v.p[2], v.n[0], v.n[1], v.n[2], src.uv.data[i * 2], src.uv.data[i * 2 + 1], v.colour[0], v.colour[1], v.colour[2], v.field[0], v.field[1], v.field[2], v.field[3]);
      this.setOpen(id, v.open);
    }
    // (Where the faces copied said where their corners were, so do the copies.)
    const se = src.edges.data;
    if (se.length) {
      const top = Math.min(src.vertexCount, se.length >> 2);
      for (let i = 0; i < top; i++) if (se[i * 4 + 2]) this.markCopied(base + i, se[i * 4], se[i * 4 + 1], se[i * 4 + 2]);
    }
    for (let t = 0; t < src.idx.length; t += 3) this.addTriangle(src.idx[t] + base, src.idx[t + 1] + base, src.idx[t + 2] + base);
  }

  /**
   * Says that the points given, three or four in order round one flat face, are its corners: so that its edges can be told from its
   * middle, and drawn rounded (see `edges`). A face of more corners is left as it is.
   */
  markFace(ids: number[]): void {
    if (ids.length !== 3 && ids.length !== 4) return;
    const e = this.edges, need = (Math.max(...ids) + 1) * 4;
    if (e.data.length < need) {
      let cap = Math.max(1024, e.data.length);
      while (cap < need) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(e.data);
      e.data = next;
    }
    const corners = ids.length === 4 ? [[0, 0], [255, 0], [255, 255], [0, 255]] : [[0, 0], [255, 0], [0, 255]], kind = ids.length === 4 ? 128 : 255;
    ids.forEach((id, k) => { e.data[id * 4] = corners[k][0]; e.data[id * 4 + 1] = corners[k][1]; e.data[id * 4 + 2] = kind; });
  }

  addTriangle(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  private markCopied(id: number, s: number, t: number, kind: number): void {
    const e = this.edges, need = (id + 1) * 4;
    if (e.data.length < need) {
      let cap = Math.max(1024, e.data.length);
      while (cap < need) cap *= 2;
      const next = new Uint8Array(cap);
      next.set(e.data);
      e.data = next;
    }
    e.data[id * 4] = s; e.data[id * 4 + 1] = t; e.data[id * 4 + 2] = kind;
  }

  get triangleCount(): number {
    return this.idx.length / 3;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos.trimmed(), 3));
    g.setAttribute('normal', new BufferAttribute(this.nrm.trimmed(), 3));
    g.setAttribute('uv', new BufferAttribute(this.uv.trimmed(), 2));
    g.setAttribute('color', new BufferAttribute(this.col.trimmed(), 3));
    g.setAttribute('aField', new BufferAttribute(this.fld.trimmed(), 4));
    const n = this.vertexCount;
    // Baked light: per colour channel, a constant term and a direction term; plus sky and sun visibility.
    // (All fourteen numbers lie side by side in one run of memory: a graphics card will take only eight
    // separate runs for one mesh, and with these four apart there would be nine.)
    const light = new InterleavedBuffer(new Float32Array(n * 14), 14);
    g.setAttribute('aSHr', new InterleavedBufferAttribute(light, 4, 0));
    g.setAttribute('aSHg', new InterleavedBufferAttribute(light, 4, 4));
    g.setAttribute('aSHb', new InterleavedBufferAttribute(light, 4, 8));
    g.setAttribute('aBake', new InterleavedBufferAttribute(light, 2, 12));
    // (Every mesh has it, read or not, so that a material that reads it finds it on whatever it is given: nothing for what was not marked.)
    const edge = new Uint8Array(n * 4);
    edge.set(this.edges.data.subarray(0, Math.min(this.edges.data.length, n * 4)));
    g.setAttribute('aEdge', new BufferAttribute(edge, 4, true));
    g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
