/**
 * The map of the runs (asked: "can you make a ink map based (bring the needed code from dungeons repo) run selector? think like a
 * medieval fantasy ski resort map hah. This should be shown to the player when they enter the game after the loading screen along
 * with the dialog to watch either the regular demo, orcs demo or choose a location from the map to ride"; and then "clicking a run on
 * the map should initially show a small modal to show some details on length, vertical, steepness; maybe a run elevation profile").
 *
 * The world's own ink map of the stretch about the runs (`drawInkWorld`, as klaine/dungeons draws its worlds), from what the run
 * finder kept of the world for it (`slopes/w2-map.json`, `src/core/runMap.ts`), cut to its frame; and over it, as a resort's map has
 * them, the runs in the inks of their grades (blue, red, black, each with its own mark: a ring, a square, a diamond), numbered and
 * named, a flag at each top; a cartouche with the range's name and a scale, and a compass rose, each in a corner the runs leave
 * free. A run clicked, or chosen in the list beside the map, opens its card: its grade, how long, how far it falls, how steep, its
 * profile from top to foot (followed by the pointer: how far down, how high, how steep there), the best won on it; and to ride it.
 */
import type { WorldPlan } from '../src/core/world';
import { drawInkWorld, inkFrame, type WorldMap } from '../src/maps/inkWorld';
import type { MapRun, RunMap } from '../src/core/runMap';
import type { Plan } from './slopeMini';

/**
 * The dungeon under the run ridden, as far as it has been seen (asked: "a dungeon minimap and inkmap that updates accordingly"): where
 * its mouth is in the world, its plan (`Cave.plan`), where in it the one on foot stands (if it is in it), and its name.
 */
export interface MapDungeon { x: number; z: number; plan: Plan; here: { c: number; r: number } | null; name: string }

/** A run as the game offers it: its slice's name, what it is called, and what it is like, in a sentence. */
export interface RunInfo { id: string; label: string; title: string }

const NS = 'http://www.w3.org/2000/svg', PAPER = '#f1eadb', INK = '#1d1a17';

/**
 * A run's grade, by how steep it is on the whole, as Europe's resorts grade theirs by the gradient (blue to a quarter, some fourteen
 * degrees; red to two fifths, some twenty-one; black beyond): each in its ink, and with a mark of its own, so that it is never told by
 * its colour alone.
 */
const GRADES = [
  { most: 14, name: 'Blue', say: 'gentle', ink: '#1f5aa6', shape: 'ring' },
  { most: 21, name: 'Red', say: 'steep in places', ink: '#a8261b', shape: 'square' },
  { most: Infinity, name: 'Black', say: 'steep', ink: INK, shape: 'diamond' },
] as const;
type Grade = (typeof GRADES)[number];
export const gradeOf = (r: Pick<MapRun, 'mean'>): Grade => GRADES.find((g) => r.mean < g.most)!;

/** A grade's mark about (0, 0), `r` across its middle: its outline as a path. */
const markPath = (g: Grade, r: number) =>
  g.shape === 'ring' ? `M ${-r} 0 a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`
  : g.shape === 'square' ? `M ${-r * 0.86} ${-r * 0.86} h ${r * 1.72} v ${r * 1.72} h ${-r * 1.72} Z`
  : `M 0 ${-r * 1.22} L ${r * 1.22} 0 L 0 ${r * 1.22} L ${-r * 1.22} 0 Z`;
/** A run's mark with its number on it, as a small picture of its own (for the list and the card). */
const markSvg = (g: Grade, n: number, size: number) =>
  `<svg class="mark" viewBox="-16 -16 32 32" width="${size}" height="${size}" aria-hidden="true"><path d="${markPath(g, 12)}" fill="${g.ink}" stroke="${PAPER}" stroke-width="2"/><text x="0" y="0.5" text-anchor="middle" dominant-baseline="central" fill="${PAPER}" font-size="14" font-family="Cinzel, Georgia, serif" font-weight="700">${n}</text></svg>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class RunMapView {
  /** The map as drawn: its picture, and what is laid over it (the runs and their marks), in the picture's pixels. */
  private readonly canvas = document.createElement('canvas');
  private readonly svg = document.createElementNS(NS, 'svg');
  private readonly stage = document.createElement('div');
  private readonly card = document.createElement('div');
  private cw = 0;
  private ch = 0;
  private toX: (x: number) => number = (x) => x;
  private toY: (z: number) => number = (z) => z;
  /** Metres to the picture's pixels. */
  private scale = 1;
  /** How far in from the picture's edge the map's frame is, in its pixels. */
  private inset = 0;
  private drawn = false;
  /** How broad the map was last laid out at, in the screen's pixels. */
  private laidAt = 0;
  private hot: string | null = null;
  private opened: { id: string; from: HTMLElement | null } | null = null;
  private readonly shown: { info: RunInfo; run: MapRun | undefined; n: number }[];
  private dungeon: MapDungeon | null = null;

  constructor(
    /** Where the map goes (it fills it, keeping its shape), the list of the runs beside it, and where a run's card opens. */
    private readonly box: HTMLElement, private readonly list: HTMLElement, cardHost: HTMLElement,
    private readonly map: RunMap | null, runs: RunInfo[],
    private readonly o: { ride: (id: string) => void; best: (id: string) => number },
  ) {
    this.shown = runs.map((info, k) => ({ info, run: map?.runs.find((r) => r.id === info.id), n: k + 1 }));
    this.stage.className = 'stage';
    this.svg.setAttribute('class', 'over');
    this.card.className = 'card';
    this.card.hidden = true;
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-labelledby', 'runCardName');
    this.stage.append(this.canvas, this.svg);
    box.append(this.stage);
    cardHost.append(this.card);
    // (The runs over the map: hovered, the run stands out, and its row in the list; clicked, its card.)
    this.svg.addEventListener('pointerover', (e) => this.setHot((e.target as Element).closest<SVGGElement>('.run')?.dataset.id ?? null));
    this.svg.addEventListener('pointerleave', () => this.setHot(null));
    // (And clicked anywhere else on the map, a card open is closed.)
    this.svg.addEventListener('click', (e) => { const id = (e.target as Element).closest<SVGGElement>('.run')?.dataset.id; if (id) this.openCard(id, null); else this.closeCard(); });
    this.card.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeCard(); } });
    this.makeList();
    new ResizeObserver(() => this.fit()).observe(box);
  }

  /** The dungeon shown on the map as far as it has been seen (laid out again with it); none, none shown. */
  setDungeon(d: MapDungeon | null) { this.dungeon = d; this.laidAt = 0; this.fit(); }

  /** Whether a run's card is open. */
  get carding() { return !!this.opened; }

  /**
   * The map drawn: the world's ink map of the stretch, `pixels` across as a sheet (its title and key under it cut away, its frame
   * kept). Some tenths of a second; done once.
   */
  draw(pixels = 1600) {
    if (this.drawn || !this.map) return;
    this.drawn = true;
    const m = this.map, sheet = document.createElement('canvas');
    const world: WorldMap = {
      plan: { seed: m.plan.seed, hx: m.plan.hx, hz: m.plan.hz } as WorldPlan, name: m.worldName, regions: m.regions,
      peakNames: m.peaks.map((q) => q.name), peaks: m.peaks.map(({ x, z, y }) => ({ x, z, y })),
      field: m.field, sea: m.sea, lake: m.lake, cover: m.cover, rivers: m.rivers, places: [], towns: m.towns, ways: m.ways,
    };
    drawInkWorld(sheet, world, { pixels, stretch: { area: m.area, title: '', subtitle: '' } });
    // (Cut to the outer line of its frame and a little paper beyond.)
    const f = inkFrame(m.plan, pixels, m.area), u = pixels / 2400, o = 14 * u + 4 * u;
    const x0 = Math.floor(f.edge - o), y0 = Math.floor(f.head - o);
    this.cw = Math.ceil(pixels - 2 * f.edge + 2 * o); this.ch = Math.ceil(f.msz + 2 * o);
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.canvas.getContext('2d')!.drawImage(sheet, x0, y0, this.cw, this.ch, 0, 0, this.cw, this.ch);
    sheet.width = sheet.height = 0;
    this.toX = (x) => f.X(x) - x0; this.toY = (z) => f.Z(z) - y0; this.scale = f.scale; this.inset = f.edge - x0;
    this.svg.setAttribute('viewBox', `0 0 ${this.cw} ${this.ch}`);
    this.stage.style.aspectRatio = `${this.cw} / ${this.ch}`;
    this.box.style.setProperty('--map-aspect', `${this.cw} / ${this.ch}`);
    this.fit();
  }

  /** The map fitted into its box, keeping its shape; and what is over it laid out again for the size it is seen at. */
  private fit() {
    if (!this.drawn) return;
    const bw = this.box.clientWidth, bh = this.box.clientHeight;
    if (!bw || !bh) return;
    const s = Math.min(bw / this.cw, bh / this.ch), w = Math.floor(this.cw * s);
    // (Laid out again only when the map is seen at another size: laid out anew, what was under the pointer is made again, and a
    // click begun on a run before it was not a click.)
    if (w === this.laidAt) return;
    this.laidAt = w;
    this.stage.style.width = `${w}px`; this.stage.style.height = `${Math.floor(this.ch * s)}px`;
    this.lay(this.cw / w);
  }

  /**
   * What is laid over the map, sized for the map seen at `k` of its pixels to a pixel of the screen: the runs, their marks and names
   * (not where the map is seen small, where the list beside it names them), the cartouche and the compass rose.
   */
  private lay(k: number) {
    const parts: string[] = [], boxes: [number, number, number, number][] = [], W = this.cw, H = this.ch;
    // (The cartouche and the rose drawn smaller where the map is seen small, as on a phone, down to what can still be read.)
    const inner = this.inset, named = W / k >= 520, z = Math.min(1, Math.max(0.62, W / k / 760));
    const free = (b: [number, number, number, number]) => b[0] > inner && b[2] < W - inner && b[1] > inner && b[3] < H - inner && boxes.every((q) => b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]);
    const on = this.shown.filter((s) => s.run);
    const lines = on.map((s) => s.run!.points.map(([x, z]) => [this.toX(x), this.toY(z)] as [number, number]));
    // The cartouche and the compass rose, each in the corner with the least of the runs under it.
    const corners = (w: number, h: number): [number, number, number, number][] => {
      const m = inner + 10 * k;
      return [[m, H - m - h, m + w, H - m], [W - m - w, H - m - h, W - m, H - m], [m, m, m + w, m + h], [W - m - w, m, W - m, m + h]];
    };
    const under = (b: [number, number, number, number]) => lines.reduce((n, l) => n + l.filter(([x, y]) => x > b[0] - 20 * k && x < b[2] + 20 * k && y > b[1] - 20 * k && y < b[3] + 20 * k).length, 0)
      + this.map!.towns.filter((t) => { const x = this.toX(t.x), y = this.toY(t.z); return x > b[0] && x < b[2] && y > b[1] && y < b[3]; }).length * 40;
    const best = (list: [number, number, number, number][]) => list.slice().sort((a, b) => under(a) - under(b))[0];
    {
      const title = this.map!.regions.range, ts = 17 * k * z, ss = 12 * k * z, km = this.scale * 1000 > W * 0.3 ? 500 : 1000, bar = km * this.scale;
      const w = Math.max(title.length * ts * 0.74, 'The runs of the'.length * ss * 0.5, bar + 60 * k * z) + 36 * k * z, h = ts + ss * 2 + 46 * k * z;
      const b = best(corners(w, h));
      boxes.push(b);
      const cx = (b[0] + b[2]) / 2;
      parts.push(`<g class="cartouche" aria-hidden="true">
        <rect x="${b[0]}" y="${b[1]}" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK}" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
        <rect x="${b[0] + 5 * k * z}" y="${b[1] + 5 * k * z}" width="${w - 10 * k * z}" height="${h - 10 * k * z}" fill="none" stroke="${INK}" stroke-width="0.8" vector-effect="non-scaling-stroke"/>
        <text x="${cx}" y="${b[1] + 14 * k * z + ss}" text-anchor="middle" font-family="'Cormorant Garamond', Georgia, serif" font-style="italic" font-weight="600" font-size="${ss * 1.15}" fill="${INK}">The runs of</text>
        <text x="${cx}" y="${b[1] + 16 * k * z + ss + ts * 1.05}" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="${ts}" letter-spacing="${ts * 0.06}" fill="${INK}">${esc(title.toUpperCase())}</text>
        ${[0, 1, 2, 3].map((i) => `<rect x="${cx - bar / 2 + (i * bar) / 4}" y="${b[3] - 22 * k * z}" width="${bar / 4}" height="${5 * k * z}" fill="${i % 2 ? PAPER : INK}" stroke="${INK}" stroke-width="0.8" vector-effect="non-scaling-stroke"/>`).join('')}
        <text x="${cx}" y="${b[3] - 9 * k * z}" text-anchor="middle" font-family="'Cormorant Garamond', Georgia, serif" font-style="italic" font-weight="600" font-size="${ss}" fill="${INK}">${km === 1000 ? 'one kilometre' : 'half a kilometre'}</text>
      </g>`);
      const r = 30 * k * z, c = best(corners(2 * r + 8 * k, 2 * r + 22 * k * z).filter((q) => free(q)));
      if (c) {
        boxes.push(c);
        const x = (c[0] + c[2]) / 2, y = (c[1] + c[3]) / 2 + 7 * k * z;
        // (Eight points, the four great ones long and half shaded, the four between them short.)
        const point = (a: number, l: number, w: number, shade: boolean) => {
          const ca = Math.cos(a), sa = Math.sin(a), tip = [x + ca * l, y + sa * l], left = [x + Math.cos(a - Math.PI / 2) * w, y + Math.sin(a - Math.PI / 2) * w], right = [x + Math.cos(a + Math.PI / 2) * w, y + Math.sin(a + Math.PI / 2) * w];
          return `<path d="M ${x} ${y} L ${tip} L ${left} Z" fill="${shade ? INK : PAPER}" stroke="${INK}" stroke-width="0.9" vector-effect="non-scaling-stroke"/><path d="M ${x} ${y} L ${tip} L ${right} Z" fill="${shade ? PAPER : INK}" stroke="${INK}" stroke-width="0.9" vector-effect="non-scaling-stroke"/>`;
        };
        parts.push(`<g class="rose" aria-hidden="true"><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="none" stroke="${INK}" stroke-width="0.8" vector-effect="non-scaling-stroke"/>
          ${[0, 1, 2, 3].map((i) => point(Math.PI / 4 + (i * Math.PI) / 2, r * 0.55, r * 0.12, false)).join('')}
          ${[0, 1, 2, 3].map((i) => point(-Math.PI / 2 + (i * Math.PI) / 2, r, r * 0.17, true)).join('')}
          <text x="${x}" y="${y - r - 4 * k * z}" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="${13 * k * z}" fill="${INK}">N</text></g>`);
      }
    }
    // The runs: a paper casing under each line of ink, a flag at the top and a dot at the foot; a mark with its number partway down,
    // where it is clear of the others' marks; and its name beside it.
    const marks: string[] = [];
    on.forEach((s, i) => {
      const g = gradeOf(s.run!), l = lines[i], d = `M ${l.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`;
      const [sx, sy] = l[0], [ex, ey] = l[l.length - 1], fh = 16 * k;
      parts.push(`<g class="run${this.hot === s.info.id ? ' hot' : ''}" data-id="${s.info.id}">
        <path class="hit" d="${d}"/>
        <path class="case" d="${d}" stroke="${PAPER}"/>
        <path class="line" d="${d}" stroke="${g.ink}"/>
        <path d="M ${sx} ${sy} V ${sy - fh} L ${sx + fh * 0.75} ${sy - fh * 0.78} L ${sx} ${sy - fh * 0.55}" fill="${g.ink}" stroke="${INK}" stroke-width="1" vector-effect="non-scaling-stroke"/>
        <circle cx="${ex}" cy="${ey}" r="${3.4 * k}" fill="${g.ink}" stroke="${PAPER}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      </g>`);
      boxes.push([sx - 2 * k, sy - fh - 2 * k, sx + fh, sy + 2 * k]);
    });
    on.forEach((s, i) => {
      const g = gradeOf(s.run!), l = lines[i], r = 11 * k, fs = 14 * k;
      let placed: [number, number] | null = null;
      for (const at of [0.4, 0.55, 0.28, 0.7, 0.18, 0.82]) {
        const [x, y] = l[Math.round(at * (l.length - 1))], b: [number, number, number, number] = [x - r * 1.3, y - r * 1.3, x + r * 1.3, y + r * 1.3];
        if (free(b)) { boxes.push(b); placed = [x, y]; break; }
      }
      placed ??= l[Math.round(0.4 * (l.length - 1))];
      const [x, y] = placed;
      let name = '';
      if (named) {
        const tw = s.info.label.length * fs * 0.46 + 6 * k;
        for (const [tx, ty, anchor] of [[x + r + 5 * k, y, 'start'], [x - r - 5 * k, y, 'end'], [x, y - r - 9 * k, 'middle'], [x, y + r + 11 * k, 'middle']] as const) {
          const bx = anchor === 'start' ? tx : anchor === 'end' ? tx - tw : tx - tw / 2, b: [number, number, number, number] = [bx, ty - fs * 0.6, bx + tw, ty + fs * 0.5];
          if (!free(b)) continue;
          boxes.push(b);
          name = `<text class="name" x="${tx}" y="${ty}" text-anchor="${anchor}" dominant-baseline="central" font-size="${fs}">${esc(s.info.label)}</text>`;
          break;
        }
      }
      marks.push(`<g class="run${this.hot === s.info.id ? ' hot' : ''}" data-id="${s.info.id}"><g class="medal" transform="translate(${x} ${y})"><path d="${markPath(g, r)}" fill="${g.ink}" stroke="${PAPER}" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <text x="0" y="${0.5 * k}" text-anchor="middle" dominant-baseline="central" fill="${PAPER}" font-size="${13 * k}" font-family="Cinzel, Georgia, serif" font-weight="700">${s.n}</text></g>${name}</g>`);
    });
    this.svg.innerHTML = parts.join('') + marks.join('') + this.layDungeon(k, z, best, corners, free, boxes);
  }

  /**
   * The dungeon on the map: a mark at its mouth (an arch, in ink), and its plan as far as it has been seen drawn in a box of its own
   * in the corner freest of the runs, as a map shows a town's plan beside it: its rooms paper, its halls a hatch, its stairs ruled
   * across, its walls inked where what is seen meets the rock, the way in at the top; where the one on foot stands, a red dot; a line of
   * dots from the box to the mark. Its name over it.
   */
  private layDungeon(k: number, z: number, best: (l: [number, number, number, number][]) => [number, number, number, number], corners: (w: number, h: number) => [number, number, number, number][], free: (b: [number, number, number, number]) => boolean, boxes: [number, number, number, number][]): string {
    const d = this.dungeon;
    if (!d || !d.plan.seen.some((v) => v)) return '';
    const p = d.plan, mx = this.toX(d.x), my = this.toY(d.z), a = 7 * k;
    const out: string[] = [`<g class="dungeon" aria-hidden="true"><path d="M ${mx - a} ${my + a * 0.6} V ${my - a * 0.1} A ${a} ${a} 0 0 1 ${mx + a} ${my - a * 0.1} V ${my + a * 0.6} Z" fill="${INK}" stroke="${PAPER}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`];
    // (Each square as large as the box lets the whole lattice be, up to a size that reads.)
    const sq = Math.min(10 * k * z, (150 * k * z) / Math.max(p.cols, p.rows)), pad = 14 * k * z, title = 13 * k * z;
    const w = p.cols * sq + 2 * pad, h = p.rows * sq + 2 * pad + title;
    const b = best(corners(w, h).filter((q) => free(q))) ?? best(corners(w, h));
    boxes.push(b);
    const x0 = b[0] + pad, y0 = b[1] + pad + title, open = (c: number, r: number) => c >= 0 && r >= 0 && c < p.cols && r < p.rows && p.kind[r * p.cols + c] > 0;
    out.push(`<line x1="${(b[0] + b[2]) / 2}" y1="${(b[1] + b[3]) / 2}" x2="${mx}" y2="${my}" stroke="${INK}" stroke-width="1.2" stroke-dasharray="2 4" vector-effect="non-scaling-stroke"/>`);
    out.push(`<rect x="${b[0]}" y="${b[1]}" width="${w}" height="${h}" fill="${PAPER}" stroke="${INK}" stroke-width="2.2" vector-effect="non-scaling-stroke"/>`);
    out.push(`<text x="${(b[0] + b[2]) / 2}" y="${b[1] + pad * 0.6 + title * 0.7}" text-anchor="middle" font-family="'Cormorant Garamond', Georgia, serif" font-style="italic" font-weight="600" font-size="${title}" fill="${INK}">${esc(d.name)}</text>`);
    const hatch: string[] = [], walls: string[] = [];
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      const k2 = r * p.cols + c, kind = p.kind[k2];
      if (!kind || !p.seen[k2]) continue;
      const x = x0 + c * sq, y = y0 + r * sq;
      if (kind === 2) out.push(`<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="#f6ecd2"/>`);
      else {
        out.push(`<rect x="${x}" y="${y}" width="${sq}" height="${sq}" fill="#e6d8b8"/>`);
        if (kind === 3) for (let i = 1; i < 4; i++) hatch.push(`M ${x + (sq * i) / 4} ${y} V ${y + sq}`);
        else hatch.push(`M ${x} ${y + sq} L ${x + sq} ${y}`);
      }
      // (A wall inked wherever the square meets the rock.)
      if (!open(c, r - 1)) walls.push(`M ${x} ${y} H ${x + sq}`);
      if (!open(c, r + 1)) walls.push(`M ${x} ${y + sq} H ${x + sq}`);
      if (!open(c - 1, r)) walls.push(`M ${x} ${y} V ${y + sq}`);
      if (!open(c + 1, r)) walls.push(`M ${x + sq} ${y} V ${y + sq}`);
    }
    if (hatch.length) out.push(`<path d="${hatch.join(' ')}" fill="none" stroke="${INK}" stroke-width="0.6" opacity="0.55" vector-effect="non-scaling-stroke"/>`);
    if (walls.length) out.push(`<path d="${walls.join(' ')}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="square" vector-effect="non-scaling-stroke"/>`);
    if (d.here) out.push(`<circle cx="${x0 + d.here.c * sq}" cy="${y0 + d.here.r * sq}" r="${Math.max(2.5 * k, sq * 0.28)}" fill="#c0322b" stroke="${PAPER}" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`);
    out.push('</g>');
    return out.join('');
  }

  /** A run stood out on the map and in the list, or none. */
  private setHot(id: string | null) {
    if (id === this.hot) return;
    this.hot = id;
    this.svg.querySelectorAll<SVGGElement>('.run').forEach((g) => g.classList.toggle('hot', g.dataset.id === id));
    this.list.querySelectorAll<HTMLElement>('[data-id]').forEach((b) => b.classList.toggle('hot', b.dataset.id === id));
    this.svg.classList.toggle('dim', !!id);
  }

  /** The list of the runs beside the map: each its mark and number, its name, and how long it is and how far it falls. */
  private makeList() {
    this.list.innerHTML = '';
    for (const s of this.shown) {
      const b = document.createElement('button'), g = s.run ? gradeOf(s.run) : null;
      b.type = 'button'; b.dataset.id = s.info.id; b.title = s.info.title;
      b.innerHTML = `${g ? markSvg(g, s.n, 26) : `<span class="mark">${s.n}</span>`}<span class="name">${esc(s.info.label)}</span><span class="len">${s.run ? `${(s.run.length / 1000).toFixed(2)} km · ${Math.round(s.run.top - s.run.foot)} m` : ''}</span>`;
      b.addEventListener('click', () => (s.run ? this.openCard(s.info.id, b) : this.o.ride(s.info.id)));
      b.addEventListener('pointerenter', () => this.setHot(s.info.id));
      b.addEventListener('pointerleave', () => this.setHot(null));
      this.list.append(b);
    }
  }

  /** A run's card opened over the map; `from`, what to give the keys back to when it closes. */
  openCard(id: string, from: HTMLElement | null) {
    const s = this.shown.find((q) => q.info.id === id);
    if (!s?.run) return;
    const r = s.run, g = gradeOf(r), best = this.o.best(id);
    this.opened = { id, from };
    this.setHot(id);
    this.card.innerHTML = `
      <div class="top">${markSvg(g, s.n, 34)}<div><div class="name" id="runCardName">${esc(s.info.label)}</div><div class="grade">${g.name} run · ${g.say}</div></div>
        <button type="button" class="x" aria-label="Back to the map" title="Back to the map">✕</button></div>
      <p class="about">${esc(s.info.title)}.</p>
      <dl class="stats">
        <div><dt>Length</dt><dd>${(r.length / 1000).toFixed(2)} km</dd></div>
        <div><dt>Vertical</dt><dd>${Math.round(r.top - r.foot)} m</dd></div>
        <div><dt>Average</dt><dd>${Math.round(r.mean)}°</dd></div>
        <div><dt>Steepest</dt><dd>${Math.round(r.steepest)}°</dd></div>
      </dl>
      ${this.profile(r, g)}
      <div class="read" aria-live="polite"></div>
      <div class="more">${r.crest >= 40 ? `${Math.round(r.crest / 10) * 10} m along a crest · ` : ''}its path ${Math.round(r.broad[0])} to ${Math.round(r.broad[1])} m broad${best > 0 ? ` · your best here ${best.toLocaleString('en')}` : ''}</div>
      <button type="button" class="ride on">Ride ${esc(s.info.label)}</button>`;
    this.card.hidden = false;
    this.card.querySelector<HTMLButtonElement>('.x')!.onclick = () => this.closeCard();
    this.card.querySelector<HTMLButtonElement>('.ride')!.onclick = () => this.o.ride(id);
    this.follow(r);
    this.card.querySelector<HTMLButtonElement>('.ride')!.focus({ preventScroll: true });
  }

  closeCard() {
    if (!this.opened) return;
    const from = this.opened.from;
    this.opened = null;
    this.card.hidden = true;
    this.setHot(null);
    from?.focus({ preventScroll: true });
  }

  /**
   * A run's profile, from its top to its foot: the height of its snow as it is skied, against how far down it is, its line in its
   * grade's ink over a wash of it; the top's height and the foot's as the world has them (the run's land above some height was
   * brought lower for skiing it, so its shape is the run's as it is ridden, and between them no heights are marked); a mark each
   * quarter or half kilometre down. Followed by the pointer (`follow`).
   */
  private profile(r: MapRun, g: Grade) {
    const W = 300, H = 118, L = 8, R = 8, T = 18, B = 20, hs = r.heights, lo = Math.min(...hs), hi = Math.max(...hs), n = hs.length;
    const X = (i: number) => L + ((Math.min(r.length, i * r.step)) / r.length) * (W - L - R), Y = (h: number) => T + ((hi - h) / (hi - lo || 1)) * (H - T - B);
    const line = hs.map((h, i) => `${X(i).toFixed(1)} ${Y(h).toFixed(1)}`).join(' L ');
    const every = r.length > 1100 ? 500 : 250, ticks: string[] = [];
    for (let d = 0; d <= r.length + 1; d += every) {
      const x = L + (d / r.length) * (W - L - R);
      ticks.push(`<line x1="${x}" x2="${x}" y1="${H - B}" y2="${H - B + 4}" class="axis"/><text x="${x}" y="${H - 5}" text-anchor="${d ? 'middle' : 'start'}" class="tick">${d ? `${d / 1000} km` : '0'}</text>`);
    }
    const ink = g.ink;
    return `<svg class="profile" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile of the run: ${Math.round(r.top)} metres at its top, ${Math.round(r.foot)} at its foot, ${(r.length / 1000).toFixed(2)} kilometres long">
      <path d="M ${X(0)} ${H - B} L ${line} L ${X(n - 1)} ${H - B} Z" fill="${ink}" fill-opacity="0.12"/>
      <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="axis"/>
      ${ticks.join('')}
      <path d="M ${line}" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <text x="${X(0) + 4}" y="${Y(hs[0]) - 6}" class="tick strong">${Math.round(r.top)} m</text>
      <text x="${X(n - 1)}" y="${Y(hs[n - 1]) - 7}" text-anchor="end" class="tick strong">${Math.round(r.foot)} m</text>
      <g class="cross" visibility="hidden"><line class="hair" y1="${T - 6}" y2="${H - B}"/><circle r="3.5" fill="${ink}" stroke="${PAPER}" stroke-width="1.5"/></g>
      <rect class="feel" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>
    </svg>`;
  }

  /** The profile followed by the pointer: a hairline at the nearest point of the run, and how far down, how high and how steep there. */
  private follow(r: MapRun) {
    const svg = this.card.querySelector<SVGSVGElement>('.profile')!, cross = svg.querySelector<SVGGElement>('.cross')!, hair = cross.querySelector('line')!, dot = cross.querySelector('circle')!;
    const read = this.card.querySelector<HTMLElement>('.read')!, hs = r.heights, n = hs.length;
    const W = 300, H = 118, L = 8, R = 8, T = 18, B = 20, lo = Math.min(...hs), hi = Math.max(...hs);
    const { above, keep } = this.map!.squash, worldOf = (y: number) => (y <= above ? y : above + (y - above) / keep);
    const idle = `From ${Math.round(r.top)} m down to ${Math.round(r.foot)} m`;
    read.textContent = idle;
    const at = (e: PointerEvent) => {
      const box = svg.getBoundingClientRect(), x = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - L) / (W - L - R)) * (r.length / r.step))));
      const px = L + (Math.min(r.length, i * r.step) / r.length) * (W - L - R), py = T + ((hi - hs[i]) / (hi - lo || 1)) * (H - T - B);
      hair.setAttribute('x1', String(px)); hair.setAttribute('x2', String(px)); dot.setAttribute('cx', String(px)); dot.setAttribute('cy', String(py));
      cross.setAttribute('visibility', 'visible');
      // (How steep it is here, over some fifty metres about the point, as it is skied.)
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2), steep = Math.atan((hs[a] - hs[b]) / Math.max(1, (b - a) * r.step)) * (180 / Math.PI);
      read.textContent = `${(Math.min(r.length, i * r.step) / 1000).toFixed(2)} km down · ${Math.round(worldOf(hs[i]))} m high · ${Math.max(0, Math.round(steep))}° here`;
    };
    svg.addEventListener('pointermove', at);
    svg.addEventListener('pointerdown', at);
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); read.textContent = idle; });
  }
}
