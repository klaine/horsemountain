/**
 * The minimap (asked: "add light minimap"): the whole run small at the right of the picture, under the menu's button, and the skier on
 * it. Light to draw: the run is drawn once for each land, to a canvas kept aside (its marked piste, its kickers, its top and its foot),
 * and each frame no more than that copied and the skier's mark set over it, and only when the mark has moved by a part of a pixel or
 * turned. Light to look at: a pale sheet of the piste, nothing of the land about it.
 *
 * Turned so that the way down the run as a whole points up the map, as a racing game's map has the way ahead: what lies ahead is above
 * the skier's mark, and turning left takes the mark left, as it does in the picture seen from behind. (The map's turn is a turn and
 * not a mirror: seen from above.) Out past the edge of what it shows, off the piste, the mark is held at its edge.
 */

/** What of a land the minimap draws: how long its run is, where its points are, and where its piste's edges lie. */
export interface MiniLand {
  length: number;
  at(s: number, left: number): { x: number; z: number };
  edges(s: number): [number, number];
}

const PISTE = 'rgba(248, 246, 240, .78)', EDGE = 'rgba(255, 255, 255, .95)', LINE = 'rgba(80, 100, 130, .35)';
const KICK = '#e0b070', MARK = '#ff5a3c', OUT = '#ffd25a';

export class MiniMap {
  /** The land drawn, so that it is drawn again only when another is shown. */
  of: unknown = null;
  private readonly el: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private sheet: HTMLCanvasElement | null = null;
  /** The map's turn (where the way down the run points), its scale and offset, from the world's metres to its own pixels. */
  private dx = 0; private dz = 1; private scale = 1; private ox = 0; private oy = 0;
  private w = 0; private h = 0; private ratio = 1;
  private shown = '';

  constructor(el: HTMLCanvasElement) {
    this.el = el;
    this.g = el.getContext('2d')!;
  }

  /** Whether there is a run drawn to show: none on a land with no foot. */
  get has() { return !!this.sheet; }

  /** From the world's (`x`, `z`) to the map's pixels: turned so that the way down the run points up, then scaled into the box. */
  private toMap(x: number, z: number): [number, number] {
    const u = -(x * this.dz - z * this.dx), v = -(x * this.dx + z * this.dz);
    return [this.ox + u * this.scale, this.oy + v * this.scale];
  }

  /**
   * The run of a land drawn aside, `tall` CSS pixels high, as wide as its shape asks within `widest`; its kickers (`kicks`, how far
   * along the run and to the left) marked across it. A land with no foot (the groomed slope) is not drawn: there is nothing to show.
   */
  draw(land: MiniLand, kicks: { s: number; left: number }[], tall: number, widest: number) {
    this.of = land;
    this.shown = '';
    if (!(land.length < Infinity)) { this.sheet = null; return; }
    const top = land.at(0, 0), foot = land.at(land.length, 0);
    const n = Math.hypot(foot.x - top.x, foot.z - top.z) || 1;
    this.dx = (foot.x - top.x) / n; this.dz = (foot.z - top.z) / n;
    this.scale = 1; this.ox = this.oy = 0;
    // (The piste's two edges and its line, a point every few metres, in the map's turn before it is scaled.)
    const step = Math.max(4, land.length / 400), left: [number, number][] = [], right: [number, number][] = [], mid: [number, number][] = [];
    for (let s = 0; ; s = Math.min(land.length, s + step)) {
      const [lo, hi] = land.edges(s), a = land.at(s, hi), b = land.at(s, lo), c = land.at(s, 0);
      left.push(this.toMap(a.x, a.z)); right.push(this.toMap(b.x, b.z)); mid.push(this.toMap(c.x, c.z));
      if (s >= land.length) break;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of [...left, ...right]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    // (A margin for the mark and the line's width; the box as wide as the run's shape, no narrower than a third of its height.)
    const pad = 7, w = Math.round(Math.min(widest, Math.max(tall / 3, ((x1 - x0) / (y1 - y0)) * (tall - 2 * pad) + 2 * pad)));
    this.scale = Math.min((w - 2 * pad) / (x1 - x0), (tall - 2 * pad) / (y1 - y0));
    this.ox = w / 2 - ((x0 + x1) / 2) * this.scale; this.oy = tall / 2 - ((y0 + y1) / 2) * this.scale;
    const fit = ([x, y]: [number, number]): [number, number] => [this.ox + x * this.scale, this.oy + y * this.scale];
    this.w = w; this.h = tall; this.ratio = Math.min(devicePixelRatio || 1, 2);
    this.el.width = Math.round(w * this.ratio); this.el.height = Math.round(tall * this.ratio);
    this.el.style.width = `${w}px`; this.el.style.height = `${tall}px`;

    const sheet = document.createElement('canvas');
    sheet.width = this.el.width; sheet.height = this.el.height;
    const g = sheet.getContext('2d')!;
    g.scale(this.ratio, this.ratio);
    g.lineJoin = g.lineCap = 'round';
    // The piste, pale, its edges a little brighter; its line faint down its middle.
    const band = [...left.map(fit), ...right.map(fit).reverse()];
    g.beginPath(); band.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = PISTE; g.fill();
    g.strokeStyle = EDGE; g.lineWidth = 0.8; g.stroke();
    g.beginPath(); mid.map(fit).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = LINE; g.lineWidth = 1; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
    // The kickers, a short bar of brass across the run where each stands.
    g.strokeStyle = KICK; g.lineWidth = 2.2;
    for (const k of kicks) {
      const a = land.at(k.s, k.left - 4), b = land.at(k.s, k.left + 4), [ax, ay] = this.toMap(a.x, a.z), [bx, by] = this.toMap(b.x, b.z);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    // The top, a flag's dot; the foot, a line across the piste.
    const [tx, ty] = this.toMap(top.x, top.z);
    g.fillStyle = '#3a8f3a'; g.beginPath(); g.arc(tx, ty, 2.6, 0, 2 * Math.PI); g.fill();
    const [lo, hi] = land.edges(land.length), fa = land.at(land.length, lo), fb = land.at(land.length, hi);
    const [fax, fay] = this.toMap(fa.x, fa.z), [fbx, fby] = this.toMap(fb.x, fb.z);
    g.strokeStyle = '#1d1a17'; g.lineWidth = 2; g.beginPath(); g.moveTo(fax, fay); g.lineTo(fbx, fby); g.stroke();
    this.sheet = sheet;
  }

  /**
   * The skier's mark at (`x`, `z`), heading the level way (`hx`, `hz`); `out`, off the marked piste (the mark in the warning's gold).
   * Drawn again only when it would look otherwise.
   */
  show(x: number, z: number, hx: number, hz: number, out: boolean) {
    if (!this.sheet || this.el.hidden) return;
    let [mx, my] = this.toMap(x, z);
    const inset = 4, held = mx < inset || mx > this.w - inset || my < inset || my > this.h - inset;
    mx = Math.min(this.w - inset, Math.max(inset, mx)); my = Math.min(this.h - inset, Math.max(inset, my));
    // (The heading on the map: the world's level way turned as the map is.)
    const hu = -(hx * this.dz - hz * this.dx), hv = -(hx * this.dx + hz * this.dz), turn = Math.atan2(hu, -hv);
    const key = `${(mx * 3) | 0},${(my * 3) | 0},${Math.round(turn * 12)},${out ? 1 : 0}${held ? 1 : 0}`;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.el.width, this.el.height);
    g.drawImage(this.sheet, 0, 0);
    g.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    g.translate(mx, my); g.rotate(turn);
    // (An arrowhead pointing the way it goes; hollow, held at the edge, when the skier is further out than the map shows.)
    g.beginPath(); g.moveTo(0, -5.5); g.lineTo(4, 4); g.lineTo(0, 2); g.lineTo(-4, 4); g.closePath();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(10, 12, 16, .85)'; g.stroke();
    g.fillStyle = out ? OUT : MARK;
    if (held) { g.strokeStyle = g.fillStyle; g.stroke(); } else g.fill();
  }
}
