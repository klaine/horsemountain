/**
 * A run down a world's mountainside or a groomed slope (`lab/slope.html`), watched or ridden.
 *
 * Watched (asked: "make the demo run be such that it hits tricks in the jumps: 720, backflip, backflip 360, tucked jump; both with
 * human and horse skiers"): the run ridden as below, by a pilot in place of the pointer, and kept to be played back: carving down
 * between the kickers, and off the four of them a 720, a backflip, a backflip with a 360 and a ski jumper's flight, then on to the foot
 * of the run; moved about in by the timeline of its parts, played at its own speed or slower. (It began as the downhill turns of
 * `src/figures/alpine.ts` driven by what a skier does over some forty seconds, `makeDownhillRun`, with no kickers.)
 *
 * Ridden (asked: "can the turning and tucking combine? lets add touch/mouse control to the slope lab page for user to control the
 * skier. push forward means more tucked position, closer to screen bottom end more relaxed position, sideways controls turns"): where
 * the pointer is, against the middle of the picture, says what the skier does: up, tucked, the further the deeper; down, standing tall
 * and easy; to either side, turning that way, the further the sharper; any of them together, as a racer holds a tuck through a turn.
 * By mouse, where it is; by touch, where the finger is held; the arrow keys too. The skier goes as the slope and its stance let it:
 * pulled down the slope by its weight, as much as its skis point down it, slowed by the snow and by the air, much less tucked and more
 * standing tall; it turns tighter the faster it goes, if wider in a tuck; held, *Brake* (or Shift) throws the skis across the slope.
 * The slope goes on as far as it is ridden.
 *
 * Ridden, the slope has kickers on it (asked: "can we add jumps/kickers to the course? riding them in tucked position causes ski jump
 * animation (but here with poles of course), middle is regular kicker jump, tall standing is a backflip? if there is turning, it can
 * mix in spin? landing badly activates ragdoll physics and player can restart run"): built jumps of snow every 130 metres, each at a
 * different place across the piste, a ramp curving up to a lip. Off the lip the skier is thrown as any body is, as far and as high
 * as its speed takes it, and what it does in the air is what it was doing as it left: tucked, a ski jumper's flight; neither tucked
 * nor standing tall, straight air, the knees drawn up; standing tall, a backflip; and turning as well, a spin with any of them, a 360
 * turning, a 720 turning hard. In the air, pointing up draws it tighter and turns it quicker, pointing down opens it out and slows the
 * turn; it opens up to land by itself. Landed short of the turn, or too hard, it goes limp (`ragdoll.ts`) and tumbles and slides down
 * the snow until it stops; *Restart run*, or Enter, starts the run again from the top.
 *
 * Either way, the skier's skis leave their tracks in the snow, carved lines thin and dark and a skid a broad pale band, with snow thrown
 * up as it brakes; seen from behind, beside, above (where the tracks' shape shows best) or, watching, from anywhere.
 *
 * Where (asked: "now lets make this have a 100m wide nearland slice of our actual winter gameworld starting on high slopes at suitable
 * location, no buildings or locations"): a run found in the game's world, `w2` (`?world=` another, for which `tools/skiRun.ts` has
 * made a slice), down from the foot of its range across the upland below, a hundred metres broad, in winter (`slopeLand.ts`); or a
 * second run found there, below another peak (asked: "can we cheaply add a second found location as an option where to play?"), and
 * six more, steep and gentle, each down its own spur or glen (`runs`); or, with `?land=groomed`, the groomed slope the page began with, a plane at sixteen degrees going on for ever. Everything that moves is
 * worked out in the world's own terms, over whatever land it is on: where it is, east and south, and how high the snow is there; the
 * pull of its weight down whatever way the snow falls under it; thrown off a kicker or a knoll as any body is, and landing on the
 * land as it lies. The run's line is only for the edges, the views and where the kickers stand.
 */
import {
  ACESFilmicToneMapping, AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Group, HemisphereLight, InstancedBufferAttribute, InstancedMesh, type Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PCFShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Quaternion, Raycaster, RepeatWrapping, Scene, SkinnedMesh, Sphere, SRGBColorSpace, Vector2, Vector3,
} from 'three';
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshStandardNodeMaterial, RenderPipeline, WebGPURenderer } from 'three/webgpu';
import { abs, attribute, cameraPosition, clamp as clampNode, diffuseColor, dot, float, fog as fogOf, fract, Fn, If, int, length, Loop, max, min, mix, mrt, normalize, normalView, normalWorld, output, pass, positionViewDirection, positionWorld, positionWorldDirection, pow, rangeFogFactor, renderOutput, screenSize, sin, smoothstep, texture, time, uniform, uv, vec2, vec3, vec4, velocity, vertexStage } from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BODIES, FigureLibrary, figureBytes } from '../src/figures/library';
import { putOn } from '../src/figures/gear';
import { type AirControls, type RideControls, Rider, SLASH_MARKS } from '../src/figures/alpine';
import { type BodySpec, type Ground, HUMAN, humanSpec, JOINTS, Ragdoll } from '../src/figures/ragdoll';
import { Horse, horseAirPose, horseRidePose, type HorseSkis, saddlePose } from '../src/figures/horse';
import { horseCoatMaterial } from '../src/figures/horseCoat';
import { Rng } from '../src/core/rng';
import { readSlice } from '../src/core/skiSlice';
import { readRunMap, type RunMap } from '../src/core/runMap';
import { RunMapView } from './slopeMap';
import { type Arm, armAfter, type ArmKind, Bolts, Flames, LADDER, Rockets, Sparks, Sweep } from './slopeArms';
import { Drops, type Item, LootCard, type Mods, NO_MODS, Pack, packView, RARITY, rollLoot, type Slot, type Source, WARD_COLOUR, WardRing } from './slopeLoot';
import { type Frame, type GameLook, groomedLand, type Land, sliceLand } from './slopeLand';
import { Gunfire, GunSound, type Heard, tommyGun } from './slopeGun';
import { type Boss, type Den, type FoeKind, Horde } from './slopeOrcs';
import { ARM_DICE, attack as rollAttack, blow as rollBlow, BURN_EVERY, CHARGED, GUARD, HP, LEAP, type Roll, rollAt, rollSaid } from './slopeDice';
import { Boosters, PIPE, Pipe } from './slopeArena';
import { Splatter } from './slopeSplatter';
import { ARM, type ArmPose, Parachute, reachFor, RobotArm, Throw } from './slopeArm';
import { Tornado } from './slopeStorm';
import { Blast } from './slopeBlast';
import { SAUCER, Saucer } from './slopeSaucer';
import { PLANE, Plane } from './slopePlane';
import { ICE, IceJump } from './slopeIce';
import { SNOWMAN, Snowman } from './slopeSnowman';
import { type Fold, Folding, heightIn } from './slopeInvert';
import { CART_DECK, RocketCart } from './slopeCart';
import { carve, Cave, findSite, sitePoint, sliceGround } from './slopeDungeon';
import { horseCadence, horseWalk, Walker } from './slopeFoot';
import { MiniMap } from './slopeMini';
import { doneGenerating, generateTextureSet } from '../src/render/textures';
import { farUniforms, makeFarMaterial, makeSnowMaterial, siteUniforms, snowLiesAt, snowUniforms } from '../src/render/siteMaterial';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
/** Words put on the page only when they change: the same words said again each frame were laid out again each frame. */
const saidOn = new WeakMap<HTMLElement, string>();
const say = (el: HTMLElement, text: string) => { if (saidOn.get(el) !== text) { saidOn.set(el, text); el.textContent = text; } };

const G = 9.81, UP = new Vector3(0, 1, 0);
/** Along the run (where it goes at `f`) and to its left, level. */
const runDir = (f: { dx: number; dz: number }) => new Vector3(f.dx, 0, f.dz), runLeft = (f: { dx: number; dz: number }) => new Vector3(f.dz, 0, -f.dx);
/** Which way, level, a skier goes whose way is `way` (radians to the left of the run's own way at `f`). */
const along = (way: number, f: { dx: number; dz: number }) => runDir(f).multiplyScalar(Math.cos(way)).addScaledVector(runLeft(f), Math.sin(way));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
const TURN = 2 * Math.PI, deg = (d: number) => (d * Math.PI) / 180;
/** A soft round blot on a tile of `size` that repeats: drawn again across each edge it crosses, so that the tile shows no seams. */
const blot = (g: CanvasRenderingContext2D, size: number, colour: string, x: number, y: number, r: number) => {
  g.fillStyle = colour;
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
    if (x + dx + r < 0 || x + dx - r > size || y + dy + r < 0 || y + dy - r > size) continue;
    g.beginPath(); g.arc(x + dx, y + dy, r, 0, 7); g.fill();
  }
};

/**
 * The kickers on the ridden slope: the foot of the first so far down it, one every so far after it, each set across the piste at its
 * own place; a ramp so long, rising to a lip so high, curving up as the power of the way along it (steepest at the lip, some 23
 * degrees over the slope; asked: "I feel the kickers are a bit limiting somehow the vertical of the jumps": it had been 20, which off
 * a slope of twenty degrees threw a skier out level, not up), and behind the lip a steep back down to the snow; so broad across its top, its sides sloping down. On a
 * world's run, each is put where the land after it falls away enough to land on, up to `shift` further down than its turn.
 *
 * Each built to its own size (asked: "make so that the jump/kicker sizes can vary! when the landing allows for a larger jump, make the
 * jump larger"): as big as the land after it gives room to land, `kickSize`. `KICK` is a kicker of size 1, the one size they all were.
 */
const KICK = { first: 70, every: 130, length: 7, height: 1.5, power: 2.0, back: 2.4, half: 2.5, side: 1.2, shift: 60 };
/**
 * The sizes a kicker is built at, the biggest first: from four fifths of `KICK` (a lip a metre high) to nearly twice it (a lip of three
 * and a half metres at the end of a ramp of thirteen). And the speed it is sized for, about what a run is taken at (some 72 km/h); how
 * hard, at the most, a skier off one bigger than size 1 at that speed is to come into the snow, metres a second (a fall is past `FALL_BLOW`);
 * and how hard off one of size 1, before it is made smaller.
 */
const KICK_SIZES = [1.8, 1.55, 1.35, 1.15, 1, 0.88, 0.78], KICK_SPEED = 20, KICK_BLOW = 10, KICK_HARD = 11;
/**
 * A kicker's measures at a size: its ramp and its back as much longer as it is bigger; its lip higher still, so that a bigger kicker
 * throws a little steeper as well as from higher (some 21 degrees over the slope at the least, 28 at the most, against 23 at size 1);
 * a little broader.
 */
interface KickDims { size: number; L: number; H: number; B: number; half: number; side: number }
const kickDims = (size: number): KickDims => ({ size, L: KICK.length * size, H: KICK.height * size ** 1.4, B: KICK.back * size, half: KICK.half * (0.8 + 0.2 * size), side: KICK.side * size });
const kickLefts = new Map<number, number>();
const kickerLeft = (i: number, most = 14) => { let v = kickLefts.get(i); if (v === undefined) { v = new Rng(`kicker ${i}`).range(-1, 1); kickLefts.set(i, v); } return v * most; };
/**
 * Where the `i`th kicker stands on a land, as a kicker of size 1 would (how big it is built is found after, `kickSize`), and how much
 * room it has either side to be built broader; none if none may stand there. Across the skiable path at its own place, in from either
 * edge further than the band where the skier is turned back towards the middle, there and all along the sixty metres before it where it
 * is lined up on: one within it, there or where the path is narrower on the way to it, could not be lined up on. (Its own function, so
 * that where the kickers will stand is known before a run's land is made, for the cave to keep out of their way: `kickerZones`.)
 */
const kickerSpot = (l: { length: number; edges(s: number): [number, number]; kickable(s: number, left: number, length: number): boolean }, i: number): { s: number; left: number; spare: number } | null => {
  const one = kickDims(1);
  for (let shift = 0; shift <= (l.length === Infinity ? 0 : KICK.shift); shift += 6) {
    const s = KICK.first + i * KICK.every + shift, [lo, hi] = l.edges(s);
    let room = 14;
    for (let u = s - 60; u <= s; u += 6) { const [a, b] = l.edges(u), mid = (lo + hi) / 2; room = Math.min(room, Math.min(mid - a, b - mid) - Math.min(8, (b - a) / 4) - one.half - one.side - 1); }
    const off = kickerLeft(i, clamp(room, 0, 14)), left = (lo + hi) / 2 + off;
    if (l.kickable(s, left, one.L + one.B)) return { s, left, spare: room - Math.abs(off) };
  }
  return null;
};
/** Where every kicker will stand on a run, and how far it and the snow it lands on reach along it: what a cave keeps out of the way of. */
const kickerZones = (l: { length: number; edges(s: number): [number, number]; kickable(s: number, left: number, length: number): boolean }) => {
  const out: { s: number; left: number; reach: number }[] = [];
  for (let i = 0; i < 60; i++) { const k = kickerSpot(l, i); if (k && k.s < l.length) out.push({ s: k.s, left: k.left, reach: kickDims(KICK_SIZES[0]).L + kickDims(KICK_SIZES[0]).B + 50 }); }
  return out;
};
/** A kicker's height `u` along it from its foot, and how steeply it rises there. */
const rise = (d: KickDims, u: number): [number, number] => {
  const { L, H, B } = d, P = KICK.power;
  if (u <= 0) return [0, 0];
  if (u <= L) return [H * (u / L) ** P, ((P * H) / L) * (u / L) ** (P - 1)];
  if (u <= L + B) return [H * (1 - (u - L) / B), -H / B];
  return [0, 0];
};
/** A kicker's height at `u` along it and `x` across it from its middle; and how it rises along and across. */
const kickerShape = (d: KickDims, u: number, x: number) => {
  const [f, df] = rise(d, u), ax = Math.abs(x), { half, side } = d;
  const s = ax <= half ? 1 : ax < half + side ? 1 - (ax - half) / side : 0, ds = ax > half && ax < half + side ? -Math.sign(x) / side : 0;
  return { h: f * s, dDown: df * s, dLeft: f * ds };
};
/** How steeply a kicker's lip throws a skier up off the land under it. */
const lipLift = (d: KickDims) => Math.atan((KICK.power * d.H) / d.L);
/**
 * Air off a knoll (`stepRide`): no slower than `speed` metres a second (some 68 km/h); the snow looked at so many seconds of the way
 * ahead; how sharply it must turn over there, against what the skier's weight can follow, for the skier to spring off it; how hard it
 * springs, metres a second upward, from such a crest to one that would throw it anyway; and how long after landing, seconds, before
 * it springs again.
 */
const KNOLL = { speed: 19, ahead: [0.2, 0.3, 0.4], bend: 0.9, pop: [0.8, 2], after: 3 };
/** The demo run's frames are kept a thirtieth of a second apart. */
const STEP = 1 / 30;

/**
 * The loading screen (`#status`): how far the page has got in opening, as a bar, the files coming in and the stages of making the run
 * each a share of it; what is being done said under it, and how much of the files has come. Later, while a slope is made or a demo run
 * flown, the same screen says so, with the bar sweeping.
 */
type Stage = 'start' | 'paint' | 'snow' | 'moves' | 'dress' | 'demo' | 'map' | 'shaders';
const loading = (() => {
  const box = $('status'), fill = box.querySelector<HTMLElement>('.fill')!, say = box.querySelector<HTMLElement>('.say')!, bytes = box.querySelector<HTMLElement>('.bytes')!;
  // (Each stage's share of the work, about as long as each took opening the world's run, where painting the textures and making the
  // shaders were the most of it, drawn without a graphics card. The files, fetched all at once while the work goes on, are two fifths
  // of the bar; the work the rest.)
  const STAGES: [Stage, number, string][] = [
    ['start', 0.04, 'Waking the graphics'], ['paint', 0.16, 'Painting the snow and the rock'], ['snow', 0.1, 'Laying the snow on the run'],
    ['moves', 0.09, 'Teaching the rider to ski'], ['dress', 0.11, 'Dressing the rider, saddling the horse'], ['demo', 0.15, 'Flying the demo run'],
    ['map', 0.04, 'Inking the map of the runs'], ['shaders', 0.35, 'Lighting the mountain'],
  ];
  const FILES = 0.4, whole = STAGES.reduce((a, [, w]) => a + w, 0);
  const files = new Map<string, { got: number; of: number }>();
  const times: [string, number][] = [];
  let opening = true, stage = -1, shown = 0, said = '', began = performance.now();
  const mb = (n: number) => (n / 1e6).toFixed(1);
  const show = () => {
    let got = 0, of = 0;
    for (const f of files.values()) { got += f.got; of += f.of; }
    if (opening) {
      const work = STAGES.slice(0, Math.max(0, stage)).reduce((a, [, w]) => a + w, 0) / whole;
      // (Never back: a file whose size was not known ahead can grow as it comes. Before the first stage nothing has been asked for yet;
      // after it, all there is to fetch has been.)
      shown = Math.max(shown, FILES * (of > 0 ? got / of : stage >= 1 ? 1 : 0) + (1 - FILES) * work);
      fill.style.transform = `scaleX(${shown.toFixed(4)})`;
      box.setAttribute('aria-valuenow', (shown * 100).toFixed(0));
    } else {
      // (Later, the bar filled by a file as it comes; sweeping while the work is not counted.)
      const coming = of > 0 && got < of;
      box.classList.toggle('waiting', !coming);
      if (coming) fill.style.transform = `scaleX(${(got / of).toFixed(4)})`;
    }
    const text = got < of ? `Fetched ${mb(got)} of ${mb(of)} MB` : '';
    if (text !== said) { said = text; bytes.textContent = text; }
  };
  /** A moment for the page to be drawn, before work that holds it up. */
  const paint = () => new Promise<void>((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 80); });
  /** Work after opening (a slope, a demo run): the screen over the picture while it is done, the bar sweeping. */
  /** Made quietly, the screen not shown (`hush`): a run made while the rider rides on to it. */
  let hushed = false, hushSaid: ((text: string) => void) | null = null;
  const busy = (text: string): Promise<void> => {
    if (hushed) { hushSaid?.(text); return paint(); }
    if (opening) { say.textContent = text; return paint(); }
    box.hidden = false; box.classList.remove('gone', 'failed'); box.classList.add('waiting'); say.textContent = text;
    fill.style.transform = 'scaleX(0)';
    show();
    return paint();
  };
  return {
    busy,
    /** Quiet, or not; and, quiet, told what is being done (the card a run made while riding is said on: `travelTo`). */
    hush(on: boolean, said: ((text: string) => void) | null = null) { hushed = on; hushSaid = on ? said : null; },
    /** A moment for what has changed on the page to be shown, before work that holds it. */
    paint,
    /** The stage of opening now begun, said, and a moment for it to be shown; after opening, said as other work is. */
    stage(name: Stage, text?: string): Promise<void> {
      const i = STAGES.findIndex(([n]) => n === name), now = performance.now();
      if (i < 0) return paint();
      if (!opening) return busy(text ?? STAGES[i][2]);
      if (stage >= 0) times.push([STAGES[stage][0], Math.round(now - began)]);
      began = now; stage = Math.max(stage, i);
      box.classList.remove('waiting');
      say.textContent = text ?? STAGES[i][2];
      show();
      return paint();
    },
    /** So much of a file fetched, of so much. */
    count(url: string, got: number, of: number) { files.set(url, { got, of }); show(); },
    /** That work done. */
    idle() { if (!opening) box.hidden = true; },
    /** Opened: the bar filled, and the screen faded away. */
    done() {
      if (!opening) return;
      times.push([STAGES[stage]?.[0] ?? '', Math.round(performance.now() - began)]);
      // (What comes later is counted alone.)
      opening = false; shown = 1; files.clear();
      fill.style.transform = 'scaleX(1)';
      box.setAttribute('aria-valuenow', '100');
      box.classList.add('gone');
      setTimeout(() => { if (box.classList.contains('gone')) { box.hidden = true; box.classList.remove('gone'); } }, 750);
    },
    /** Could not open, or could not go on: said, and the screen kept. */
    fail(text: string) { opening = false; box.hidden = false; box.classList.remove('gone', 'waiting'); box.classList.add('failed'); say.textContent = text; bytes.textContent = ''; },
    /** How long each stage of opening took, in milliseconds (for weighing their shares). */
    get times() { return times; },
  };
})();

/**
 * A file the page needs, fetched once and counted as it comes in. (Where the host packs it for the way, its size on arrival is not
 * said; then it is taken as about as large as the file is kept, and grown if it comes larger.)
 */
const ABOUT: Record<string, number> = { 'clips.glb': 3.02e6, 'superhero-male.glb': 1.38e6, 'superhero-female.glb': 1.47e6, 'w2.json': 1.08e6, 'w2-3.json': 1.29e6, 'w2-8.json': 1.03e6, 'w2-10.json': 1.2e6, 'w2-2.json': 0.97e6, 'w2-14.json': 1.41e6, 'w2-17.json': 1.01e6, 'w2-25.json': 1.09e6, 'w2-map.json': 0.39e6 };
const fetching = new Map<string, Promise<ArrayBuffer>>();
const fetchCounted = (url: string): Promise<ArrayBuffer> => {
  let made = fetching.get(url);
  if (made) return made;
  const name = url.split('?')[0].split('/').pop() ?? url, plain = name.replace(/\.txt$/, '');
  // (Counted from when it is asked for, not from when it begins to come: until then the bar would take it for fetched.)
  let of = (ABOUT[plain] ?? 1.5e6) * (plain === name ? 1 : 4 / 3);
  loading.count(url, 0, of);
  made = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      const told = Number(res.headers.get('content-length')) || 0, packed = !!res.headers.get('content-encoding');
      if (told && !packed) of = told;
      loading.count(url, 0, of);
      if (!res.body) { const all = await res.arrayBuffer(); loading.count(url, all.byteLength, all.byteLength); return all; }
      const reader = res.body.getReader(), parts: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length; of = Math.max(of, got);
        loading.count(url, got, of);
      }
      loading.count(url, got, got);
      const all = new Uint8Array(got);
      let at = 0;
      for (const p of parts) { all.set(p, at); at += p.length; }
      return all.buffer;
    } catch (e) {
      // (Not counted any longer: what comes of it is for whoever asked for it.)
      loading.count(url, 0, 0);
      throw e;
    }
  })();
  fetching.set(url, made);
  return made;
};

/** Where the skier is and what it is doing, now: watched or ridden. */
interface Now { down: number; left: number; speed: number; way: number; ski: number; skid: number; tuck: number; brake: number; deep?: number }

async function start() {
  // The files the run is made of, all asked for at once from the first, and counted as they come in: the slice of the world's land (when
  // the run is to be on it), the figures' clips and the skier's body. (Not where the page carries them in itself.)
  const win = window as unknown as { __figureBase?: string; __figureFiles?: object; __slopeBase?: string; __slopeFiles?: Record<string, string> };
  const base = win.__figureBase ?? new URL('../figures/', location.href).href, slices = win.__slopeBase ?? new URL('../slopes/', location.href).href;
  // The runs to choose from, each a slice beside the page (`npm run skirun -- w2 3` for the third run kept in a world, and so on),
  // named for the peak it comes down below, or the village or town at its foot (`where`, said of it as its snow is laid and over the
  // picture); `?world=` another slice to open on (`#w2-3` too, as the address keeps the choice). (Asked: "can we try to find two more
  // "tracks" in our mountains?": of the runs the search keeps in `w2`, the eighth, the steepest, and the tenth, the longest gentle one,
  // each somewhere the others are not; then, asked "can we add the remaining 4 other runs to make it 8 total?", the second, fourteenth,
  // seventeenth and twenty-fifth, each again somewhere the others are not: the rest came down the same spurs as these, or were too flat
  // for a kicker.)
  // (And a cave halfway down each, with a dungeon in it, `slopeDungeon.ts` (asked: "could we have a run have dungeon?"; then "add the
  // caves to warden's spur and balestead; and for other runs find suitable spots to add a mound or adjust land shape"): in a bank
  // beside the piste where there is one, Silent Warden's, Warden's Spur's and Balestead's; elsewhere in a knoll raised for it.)
  const runs: { id: string; label: string; where?: string; title: string; detail: string; cave?: boolean }[] = ([
    { id: 'w2', label: 'Silent Warden', where: 'below The Silent Warden', title: 'From beside the highest summit of the range, along a crest with rock falling away either side; halfway down, a cave in the bank beside the piste, a camp before it and a tomb under the mountain', detail: '1.02 km along a crest, from beside the highest summit; a cave halfway down', cave: true },
    { id: 'w2-3', label: 'Pale Crown', where: 'below The Pale Crown', title: 'Down a long spur out of the range into the wooded foothills above a bay', detail: '1.43 km down a spur into wooded foothills above a bay' },
    { id: 'w2-8', label: 'Ashbridge', where: 'near Ashbridge', title: 'Short and steep, along the foot of the range under its rock walls, down to a lake in a glen below Ashbridge', detail: '0.80 km, the steepest, under rock walls to a lake' },
    { id: 'w2-10', label: 'Carndale', where: 'above Carndale', title: 'Long and gentle, straight down a wooded spur in the west of the range to a lake above Carndale', detail: '1.32 km, gentle, down a wooded spur to a lake' },
    { id: 'w2-2', label: "Warden's Spur", where: "on the Silent Warden's south spur", title: "From beside the highest summit down its south spur, along the crest for half its length", detail: '0.76 km from the summit, half of it along a crest' },
    { id: 'w2-14', label: 'Lake Wall', where: 'above the lake below Ashbridge', title: 'From a knoll at the head of a long spur, down its broad back, then steeply down its end to the lake below Ashbridge that Ashbridge comes down to, its kickers big', detail: '1.47 km, broad above and steep below, big kickers, to the lake' },
    { id: 'w2-17', label: 'Balestead', where: 'near Balestead', title: 'In among the mountains, down a crest to the glen below Balestead', detail: '0.77 km down a crest inside the range' },
    { id: 'w2-25', label: 'Arford', where: 'above Arford', title: 'Long, gentle and broad, out of the foothills down to the shore above Arford', detail: '1.02 km, gentle and broad, to the shore' },
  ]).map((r) => ({ ...r, cave: true, title: r.title.includes('cave') ? r.title : `${r.title}; halfway down, a cave beside the piste, a camp before it and a dungeon under the mountain`, detail: r.detail.includes('cave') ? r.detail : `${r.detail}; a cave halfway down` }));
  const asked = query.get('world'), bodyId = query.get('body') ?? 'adventurer';
  if (asked && !runs.some((r) => r.id === asked)) runs.unshift({ id: asked, label: asked, title: `A run down the world ${asked}`, detail: `A run found in the world, ${asked}` });
  // (A land is a run, by its slice's name, or the groomed slope.)
  type LandKind = string;
  /**
   * The dungeon's seed: a new one each time the page is opened (asked: "would it be expensive to regenerate the dungeon layout every
   * session?": laying it out is nothing, building and lighting it some part of a second as its run is laid), the same while it stays
   * open, so that the cave is the same each time the run is come back to; `?dungeon=` a given one, to find it again.
   * (Its tags, `slopeDungeon.ts`, are dealt from it too; `?tags=` names any of them, `?tags=prison,large,winding`.)
   */
  const dungeonSeed = query.get('dungeon') ?? Math.floor(Math.random() * 36 ** 6).toString(36);
  let caveMade = 0;
  /** A land, and the cave in it, if it has one. */
  type CaveLand = Land & { cave?: Cave };
  const hashed = location.hash.slice(1);
  // (Opened on what the address asks for: after a choice on the page, its end, `#groomed` or `#w2-3`, which the page sets.)
  const opensOn = query.get('land') === 'groomed' ? 'groomed' : asked ?? runs[0].id;
  let landKind: LandKind = hashed === 'groomed' || runs.some((r) => r.id === hashed) ? hashed : opensOn;
  if (landKind !== 'groomed' && !win.__slopeFiles?.[`${landKind}.json`]) void fetchCounted(`${slices}${landKind}.json`).catch(() => {});
  const whereOf = (kind: LandKind) => runs.find((r) => r.id === kind)?.where ?? `on ${kind}`;
  // (And the map of the runs, `slopeMap.ts`, which the run finder wrote for them: `npm run skirun -- w2 --map 1,3,8,10,2,14,17,25`.)
  const MAP_FILE = 'w2-map.json', mapText = win.__slopeFiles?.[MAP_FILE] ? Promise.resolve(win.__slopeFiles[MAP_FILE])
    : fetchCounted(`${slices}${MAP_FILE}`).then((b) => new TextDecoder().decode(b)).catch(() => null);
  if (!win.__figureFiles) for (const file of new Set(['clips.glb', (BODIES.find((b) => b.id === bodyId) ?? BODIES[0]).file])) void figureBytes(base, file, fetchCounted).catch(() => {});
  // Drawn more simply where the graphics cannot draw it all (asked: "my friend with oneplus 13 ... says that the ground doesn't draw
  // properly for him, he can see the jumps but not the ground or something. can we blindly without the device try to fix this
  // without altering the game for others?"). Where the graphics card says, as the page opens, that it could not draw something (a
  // shader it could not make, a draw it threw away, the device lost), the page opens again drawing more simply, and keeps to it in this
  // browser: first the plain snow and rock, whose shaders are a small part of the detailed ones'; then, if that fails too, by WebGL 2
  // rather than WebGPU. Only on what has failed: where nothing fails, nothing changes. (Said in the menu under *Picture*, with a way to
  // try the full picture again; `?safe=0` forgets it, `?safe=1` or `2` asks for it.)
  const SAFE = { most: 2, key: 'slope.safe', within: 12000 };
  const safe: { level: number; why: string } = (() => {
    const asked = query.get('safe');
    if (asked !== null) { try { localStorage.removeItem(SAFE.key); } catch { /* (not kept) */ } return { level: clamp(Number(asked) || 0, 0, SAFE.most), why: 'asked for in the address' }; }
    try {
      const k = JSON.parse(localStorage.getItem(SAFE.key) ?? 'null');
      if (k && typeof k.level === 'number') return { level: clamp(k.level, 0, SAFE.most), why: String(k.why ?? '') };
    } catch { /* (none kept) */ }
    return { level: 0, why: '' };
  })();
  await loading.stage('start', safe.level ? 'Waking the graphics, drawn simply for this device' : undefined);
  const canvas = $<HTMLCanvasElement>('view');
  // (Its picture is drawn through a pipeline of its own, smoothed there: the canvas's own four times over is not wanted.)
  // (How far off each point is kept as the reverse of the usual, nearest the most and the furthest nothing, which a depth kept as a
  // floating-point number tells apart alike near and far (asked: "i see flickering materials along the edges of the near and far land
  // types"): kept the usual way, from a tenth of a metre out to five kilometres, two surfaces less than half a metre apart a kilometre
  // off could not be told apart, and the land at its three grains, where one lies over another, flickered through each other.)
  // (By WebGPU on an iPhone or an iPad too, as everywhere: drawn there by WebGL 2 for a while, the picture gone black on an iPad was
  // found to go black by WebGL as well, from a number gone bad, not from WebGPU (`keepSane`).)
  const renderer = new WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance', forceWebGL: query.has('webgl') || safe.level >= 2, reversedDepthBuffer: true });
  await renderer.init();
  /** When the page was opened, to the moment: what fails while it opens, or in the seconds after, is the device's; later, it is let be. */
  let openedAt = Infinity, fallingBack = false;
  /**
   * The graphics failing once the page is open, kept for when it is opened again (`slope.lost`) and said then over the picture: what
   * went wrong and what was happening, so that it can be told of (asked: "Ipad chrome: screen turned black after upside down world
   * transition"). Given for the page as it was when it happened.
   */
  let doingWhenLost = () => '';
  const noteLost = (why: string) => {
    try { localStorage.setItem('slope.lost', JSON.stringify({ why: why.slice(0, 200), doing: doingWhenLost(), at: new Date().toISOString() })); } catch { /* (not kept) */ }
  };
  const fallBack = (why: string, late = false) => {
    if (fallingBack || (!late && performance.now() > openedAt + SAFE.within)) return;
    const webglAlready = query.has('webgl') || safe.level >= 2, next = safe.level + 1;
    if (late) noteLost(why);
    // (Already as simple as it is drawn: nothing more to fall back on; once open, opened again all the same, rather than left black.)
    if (late && (next > SAFE.most || (next === 2 && webglAlready && snowLook === 'plain'))) { fallingBack = true; loading.fail('The graphics failed: opening again…'); setTimeout(() => location.reload(), 1200); return; }
    if (next > SAFE.most || (next === 2 && webglAlready && snowLook === 'plain')) { console.warn(`Grand Horse Mountain could not draw everything here: ${why}`); return; }
    fallingBack = true;
    console.warn(`Grand Horse Mountain will draw more simply here (${next}): ${why}`);
    let kept = false;
    // (And whether it was drawing by WebGL 2 when it failed: `gl`.)
    try { localStorage.setItem(SAFE.key, JSON.stringify({ level: next, why, gl: !(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend })); kept = localStorage.getItem(SAFE.key) !== null; } catch { /* (not kept) */ }
    loading.fail('This device could not draw everything: opening again, drawn more simply…');
    // (Opened again: by its address, where this browser keeps nothing, so that it cannot come back to the same.)
    setTimeout(() => {
      if (kept) { location.reload(); return; }
      const u = new URL(location.href); u.searchParams.set('safe', String(next)); location.replace(u.href);
    }, 900);
  };
  const gpu = (renderer.backend as unknown as { device?: EventTarget }).device;
  /**
   * The graphics' errors: as the page opens, drawn more simply at once (`fallBack`); once open, only if they keep coming, five within
   * three seconds (asked: "Ipad chrome: screen turned black after upside down world transition"): one failing every frame leaves every
   * frame black, and the page had gone on drawing nothing with nothing said. One now and then, only told of in the console.
   */
  let lateErrors: number[] = [];
  gpu?.addEventListener('uncapturederror', (e) => {
    const why = String((e as Event & { error?: { message?: string } }).error?.message ?? 'a graphics error').split(/\r?\n/)[0].slice(0, 160), now = performance.now();
    if (now <= openedAt + SAFE.within) { fallBack(why); return; }
    console.warn(`Grand Horse Mountain: a graphics error: ${why}`);
    lateErrors = lateErrors.filter((t) => now - t < 3000);
    lateErrors.push(now);
    if (lateErrors.length >= 5) fallBack(`the graphics kept failing: ${why}`, true);
  });
  const lost = renderer.onDeviceLost.bind(renderer);
  renderer.onDeviceLost = (info) => {
    lost(info);
    // (Never let go of on purpose, the renderer: lost however it is said to be, 'destroyed' too, as a browser may say of a lost device.)
    // (Lost once the page is open, which no frame drawn after it can come back from: opened again as it was, rather than left stood
    // still; drawn no more simply, as it had drawn till then.)
    if (performance.now() > openedAt + SAFE.within && !fallingBack) { fallingBack = true; noteLost(`lost (${info.reason}): ${info.message}`); console.warn(`Grand Horse Mountain lost its graphics: ${info.message}`); loading.fail('The graphics were lost: opening again…'); setTimeout(() => location.reload(), 1200); return; }
    fallBack(`the graphics were lost: ${info.message}`.slice(0, 160));
  };
  // (How finely: see *Resolution*, below.)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // (The renderer's own soft shadows: `PCFSoftShadowMap` is gone from it, and asked for only brought a warning and these.)
  renderer.shadowMap.type = PCFShadowMap;
  const scene = new Scene();
  // The caves' two lights, the lantern carried in and the campfire's, the same two for every cave and kept in the scene for good, each
  // cave setting them where it wants them as it is stepped, and out where there is none (`Cave`): a light's own number is part of what
  // every lit thing's shaders are made for, and a pair of each cave's own, come with each run and gone as the land was turned inside out,
  // had every shader in the scene made again each time.
  const caveLights = { lantern: new PointLight(0xffc690, 0, 20, 1.6), fire: new PointLight(0xff9440, 0, 24, 2) };
  scene.add(caveLights.lantern, caveLights.fire);
  const camera = new PerspectiveCamera(50, 1, 0.1, 1200);
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;

  // Light: the sky's, and a sun low across the slope, so that the snow has a grain and the skier a shadow. (A clear day's: the sun warm
  // and the sky blue, so that the snow in sun is white and in shade blue, and its shapes read; on the skier, the sky's blue from above
  // and the snow's light thrown back from below, warm, which had left its underside near black.)
  const sky = new HemisphereLight(0xc2d6ff, 0xfff4e8, 1.15);
  scene.add(sky);
  const sun = new DirectionalLight(0xffecd8, 2.7);
  const sunFrom = new Vector3(-0.55, 0.75, -0.35).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 120 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);

  // The sky (asked: "now find ways to improve visual impression without making the game much heavier"): it had been one flat blue.
  // Now deep blue overhead, paling to a haze at the horizon; the air glowing warm about the sun, and the sun's disc; and high thin
  // cloud, from a small picture of cloud read at two sizes over a plane above, drawn out along the horizon. Worked out only where the
  // sky is seen, behind everything else. And the haze over what is far off takes its colour from the horizon behind it, the way it
  // looks, warmer towards the sun: so that a far range fades into the sky behind it rather than into a grey.
  const uSun = uniform(sunFrom), uFogNear = uniform(90), uFogFar = uniform(520);
  /** How dark the sky is under the whirlwind's cloud (`gloom`): 0 clear, 1 under it at its strongest. */
  const uGloom = uniform(0);
  /** How far the picture is drawn as from under the snow, seen from above on foot in the cave: the sky behind all of it gone dark. */
  const uUnder = uniform(0);
  type SkyN = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const skyAt = (dir: SkyN, disc: boolean): SkyN => {
    // (As one sum, with no assignments: the haze reads it outside any function of the shader's.)
    const h = clampNode(dir.y, 0, 1), toSun = max(dot(dir, uSun), 0);
    const col: SkyN = mix(vec3(0.09, 0.24, 0.6), vec3(0.66, 0.77, 0.9), pow(float(1).sub(h), 5)).add(vec3(1, 0.84, 0.6).mul(pow(toSun, 5).mul(0.2).add(pow(toSun, 40).mul(0.45))));
    return disc ? col.add(vec3(1, 0.93, 0.8).mul(smoothstep(0.99955, 0.9998, toSun).mul(24))) : col;
  };
  const cloudMap = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!, rng = new Rng('cloud');
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) blot(g, 256, `rgba(255,255,255,${rng.range(0.05, 0.12)})`, rng.range(0, 256), rng.range(0, 256), rng.range(18, 60));
    for (let i = 0; i < 160; i++) blot(g, 256, `rgba(255,255,255,${rng.range(0.03, 0.08)})`, rng.range(0, 256), rng.range(0, 256), rng.range(5, 16));
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping;
    return t;
  })();
  scene.backgroundNode = Fn(() => {
    const dir = positionWorldDirection, col = skyAt(dir, true).toVar();
    // (Over a plane above, nearer the horizon further off: drawn out along it, as high cloud is seen.)
    // (Its picture read once, both sizes of cloud painted into it: read twice, at two sizes, the sky cost a tenth of a frame of the
    // groomed slope, half of it sky, drawn in software.)
    const over = dir.xz.div(max(dir.y, 0.03).add(0.1));
    const wisp = texture(cloudMap, over.mul(vec2(0.11, 0.3))).r;
    const cloud = smoothstep(0.4, 0.72, wisp).mul(smoothstep(0.02, 0.16, dir.y)).mul(0.45);
    col.assign(mix(col, vec3(1, 0.97, 0.93).mul(max(dot(dir, uSun), 0).mul(0.25).add(0.95)), cloud));
    return vec4(col.mul(float(1).sub(uGloom.mul(0.45))).mul(float(1).sub(uUnder)), 1);
  })();
  // (The haze's colour worked out at the corners of what is drawn and blended between them, not at every point: it changes slowly
  // across the picture, and worked out at every point of every surface it cost a sixth of a frame of the groomed slope drawn in software.)
  const level: SkyN = normalize(positionWorld.sub(cameraPosition).mul(vec3(1, 0, 1)).add(vec3(1e-4, 0, 0)));
  scene.fogNode = fogOf(vertexStage(skyAt(vec3(level.x, 0.03, level.z), false).mul(float(1).sub(uGloom.mul(0.45)))), rangeFogFactor(uFogNear, uFogFar));

  // The snow: groomed corduroy faintly lined along the run, a little uneven in tone; and loose snow off the run, unlined.
  const snowMap = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d')!, rng = new Rng('snow');
    g.fillStyle = '#f2f5f9'; g.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 4) { g.fillStyle = `rgba(150,170,200,${0.05 + rng.range(0, 0.04)})`; g.fillRect(x, 0, 1.5, 512); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '255,255,255' : '160,180,210'},${rng.range(0.15, 0.4)})`; g.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(1, 3), rng.range(1, 3)); }
    for (let i = 0; i < 24; i++) blot(g, 512, `rgba(170,190,215,${rng.range(0.008, 0.02)})`, rng.range(0, 512), rng.range(0, 512), rng.range(60, 160));
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const powderMap = (() => {
    // (Faint, and fine: any blotch or grain that stands out shows the tile repeating, seen from far off or from above.)
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d')!, rng = new Rng('powder');
    g.fillStyle = '#f4f7fb'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i++) blot(g, 512, `rgba(165,185,212,${rng.range(0.008, 0.022)})`, rng.range(0, 512), rng.range(0, 512), rng.range(25, 120));
    for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${rng.chance(0.6) ? '255,255,255' : '170,188,214'},${rng.range(0.08, 0.22)})`; g.fillRect(rng.range(0, 512), rng.range(0, 512), rng.range(0.8, 2), rng.range(0.8, 2)); }
    const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();

  // The land: a world's run, from its slice beside the page; or the groomed slope (`?land=groomed`, or when the slice cannot be had).
  // (Its slice is fetched from beside the page, or, in a page made whole, carried in it.)
  const lands = new Map<string, Land>();
  /** Where each run's top lies in the world, level (`landOf`): the scene is laid about it. */
  const topOf = new WeakMap<Land, Vector3>();
  /** How far the land now ridden is stood from where it was laid (ridden off to from another, `trip`), and where its top lies in the world. */
  let landShift = new Vector3(), landTop: Vector3 | null = null;
  /**
   * What has been taken out of the scene, to be let go of on the graphics card at the start of the next frame: a land left, the
   * inside-out land's old sheets, a kicker taken down. (Not at once: the frame before may still be making its shaders ready, `warmSoon`,
   * which gathers what is in the scene and then waits; let go of in that wait, the renderer took up again what it had gathered, and
   * kept it, and the land with it, for as long as the page was open.) And each mesh let go of with its shape: its shape alone, the
   * renderer kept the mesh, listening on materials every mesh shares.
   */
  const toLetGo: (() => void)[] = [];
  const letGoOf = (o: Object3D, keep?: (g: BufferGeometry) => boolean) => toLetGo.push(() => o.traverse((m) => { if (!(m as Mesh).isMesh) return; if (!keep?.((m as Mesh).geometry)) (m as Mesh).geometry.dispose(); (m as Mesh).dispose(); }));
  // The world's run drawn with the game's own materials for land, in their lighter winter forms (`GameLook`; *Snow*, `?snow=plain`
  // for the plain look the page had before). Their textures are painted when first wanted, at 512 (`?tex=` another size).
  type SnowLook = 'game' | 'plain';
  let snowLook: SnowLook = query.get('snow') ? (query.get('snow') === 'plain' ? 'plain' : 'game') : safe.level >= 1 ? 'plain' : 'game', gameLook: GameLook | null = null;
  // (The game's own trees on the land about the run, with its own materials, on a computer (`slopeTrees.ts`); the snowy firs on a phone
  // or a tablet, where each point of the picture costs more. `?trees=game` or `?trees=plain`, either anywhere.)
  const treesAsked = query.get('trees'), gameTrees = treesAsked ? treesAsked !== 'plain' : matchMedia('(hover: hover) and (pointer: fine)').matches;
  const gameLookOf = (): GameLook => {
    if (gameLook) return gameLook;
    const size = Number(query.get('tex')) || 512;
    const turf = generateTextureSet('ground', size, 17), scree = generateTextureSet('scree', size, 23);
    doneGenerating();
    // (A whole winter: snow wherever the ground holds it, near and far; and the sky's light, which no bake brings here, as the game
    // has it before its bake arrives.)
    snowUniforms.uSnow.value = 1;
    farUniforms.uFarSnow.value = 1;
    // (A deep one: the low country about the runs, woods and pasture, under snow too, not green with snow in patches.)
    farUniforms.uFarDeep.value = 1;
    const skyLight: [number, number, number] = [0.5, 0.65, 0.95];
    siteUniforms.uFallback.value.set(...skyLight);
    const far = makeFarMaterial({ light: query.get('relief') !== '1' });
    // (The far land whole: the game cuts it away in patches where its near ground lies over it and about a valley, neither of which
    // is here, but each point of it still worked the patches out, four readings of noise, to be thrown away or kept, and it was kept.)
    Object.assign(far, { opacityNode: null, alphaTestNode: null });
    gameLook = { snow: makeSnowMaterial(turf, scree), far, sky: skyLight, snowAt: (up, x, z) => snowLiesAt(up, x, z, turf) };
    return gameLook;
  };
  /**
   * The cave made part of a run's land (`slopeDungeon.ts`): drawn with it, and kept by it (`CaveLand`); no kicker built in its camp or
   * over its mound, and none of the piste's poles standing in them.
   */
  const dig = (made: Land, cave: Cave) => {
    made.group.add(cave.group);
    (made as CaveLand).cave = cave;
    const kickable = made.kickable;
    // (Its ramp and the snow it lands on, across its breadth, each clear.)
    made.kickable = (s, left, length) => {
      if (!kickable(s, left, length)) return false;
      for (let u = s; u <= s + length + 22; u += 3) for (const l of [left - 4, left, left + 4]) { const p = made.at(u, l); if (!cave.keepsClear(p.x, p.z)) return false; }
      return true;
    };
    const poles = made.group.getObjectByName('poles') as InstancedMesh | undefined, m = new Matrix4(), p = new Vector3();
    if (poles) {
      for (let i = 0; i < poles.count; i++) { poles.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (cave.inCamp(p.x, p.z, 1.5) || cave.skiTop(p.x, p.z) !== null) poles.setMatrixAt(i, m.makeScale(0, 0, 0)); }
      poles.instanceMatrix.needsUpdate = true;
    }
  };
  const sliceTexts = new Map<string, string | null>();
  const landOf = async (kind: LandKind): Promise<Land> => {
    const key = kind !== 'groomed' ? `${kind}:${snowLook}` : kind;
    let made = lands.get(key);
    if (made) return made;
    if (kind !== 'groomed') {
      const carried = win.__slopeFiles?.[`${kind}.json`];
      if (!sliceTexts.has(kind) && !carried) await loading.busy('Fetching the mountain');
      if (!sliceTexts.has(kind)) sliceTexts.set(kind, carried ?? await fetchCounted(`${slices}${kind}.json`).then((b) => new TextDecoder().decode(b)).catch(() => null));
      const sliceText = sliceTexts.get(kind);
      if (sliceText) {
        if (snowLook === 'game' && !gameLook) { await loading.stage('paint'); gameLookOf(); }
        await loading.stage('snow', `Laying the snow ${whereOf(kind)}`);
      }
      // (Without its slice, the groomed slope.)
      const slice = sliceText ? readSlice(sliceText) : null, where = runs.find((r) => r.id === kind)?.where;
      // (The cave's camp levelled and the hole behind its mouth cut in the slice, before its land is made from it.)
      // (`?cave=0`: none, the runs as they were before them.)
      const site = slice && runs.find((r) => r.id === kind)?.cave && query.get('cave') !== '0' ? findSite(slice, kickerZones(sliceGround(slice))) : null, base = site && slice ? carve(slice, site) : null;
      made = slice ? sliceLand(slice, snowMap, powderMap, snowLook === 'game' ? gameLookOf() : undefined, snowLook === 'game' && gameTrees ? Number(query.get('tex')) || 512 : undefined) : await landOf('groomed');
      // (Called as the menu calls it: the slice names it for the nearest of the world's great peaks, which two runs far from any share.)
      if (slice && where) Object.assign(made, { name: `${slice.worldName}, ${where}`, short: where });
      // (Where its top lies in the world: each run's land is laid with its own top at the middle of the scene.)
      if (slice) topOf.set(made, new Vector3(slice.run.points[0][0], 0, slice.run.points[0][1]));
      if (site && base) { const t0 = performance.now(); dig(made, new Cave(site, base, dungeonSeed, (query.get('tags') ?? '').split(',').map((t) => t.trim()), caveLights)); caveMade = performance.now() - t0; }
    } else { await loading.stage('snow', 'Laying the groomed slope'); made = groomedLand(snowMap, powderMap); }
    lands.set(key, made);
    return made;
  };
  let land = await landOf(landKind);
  landTop = topOf.get(land) ?? null;
  /** Shows a land: its snow and country, and the air's haze as far as it reaches. */
  const showLand = () => {
    for (const l of lands.values()) l.group.removeFromParent();
    scene.add(land.group);
    // (A world's mountainside is lit by a lower sun and less of the sky, so that its slopes shade one from another: lit as the groomed
    // slope is, its snow was white all over and its shape could not be read.)
    sunFrom.set(...land.sun).normalize();
    sky.intensity = land.sky;
    uFogNear.value = land.fog[0]; uFogFar.value = land.fog[1];
    camera.far = land.fog[1] + 400;
    camera.updateProjectionMatrix();
    canvas.setAttribute('aria-label', land.length === Infinity ? 'A skier going down a groomed slope' : `A skier going down a run ${land.about}, ${land.name}`);
  };
  showLand();

  // The kickers, watched and ridden: each where the land lets it stand (`Land.kickable`), its shape laid on the land
  // as it lies there; a few about the skier at a time. The snow's height anywhere is the land's, with a kicker's on it where there is one.
  let kickersOn = false;
  interface Kicker extends KickDims { i: number; s: number; left: number; x: number; z: number; dx: number; dz: number; group?: Group; flags?: Mesh[]; safe?: number }
  const kickerAt = new Map<number, Kicker | null>();
  const kickerOf = (i: number): Kicker | null => {
    if (kickerAt.has(i)) return kickerAt.get(i)!;
    const at = kickerSpot(land, i), p = at && land.at(at.s, at.left), k: Kicker | null = at && p ? { i, s: at.s, left: at.left, ...p, ...kickSize(i, at.s, at.left, p, at.spare) } : null;
    kickerAt.set(i, k);
    return k;
  };
  /**
   * How big a kicker is built where it stands: the biggest whose landing the land after it gives (asked: "when the landing allows for a
   * larger jump, make the jump larger"). For each size, the biggest first, a skier is flown off its lip at `KICK_SPEED`, straight on
   * down the kicker's way over the land as it lies (`kickFlight`); the size is kept if it comes down where the land falls at ten degrees
   * and more, and still at eight six metres further on, and not too hard. A bigger kicker throws further and higher, and wants a longer,
   * steeper landing: a long fall after the lip, steepening as it goes, is given a big kicker; a short or gentle one, size 1 or smaller. A size broader than one only where the path has the room (`spare`, metres either side to the band
   * where the skier is turned back), and only if the land under its longer ramp lets it stand (`Land.kickable`). (On the groomed slope, whose landing is the same everywhere and any size comes down on it, each
   * its own size by chance.)
   */
  /**
   * Flown off a kicker of measures `d` standing at `at` from `v0` metres a second on the run before it (less what climbing to its lip
   * costs), straight on down its way over the land as it lies: how far from its foot it comes down, how steeply the land falls there and
   * six metres on (rise over run), and how hard it comes into the snow (the blow, as `land_` has it, which past `FALL_BLOW` metres a second is
   * a fall).
   */
  const kickFlight = (at: { x: number; z: number; dx: number; dz: number }, d: KickDims, v0: number) => {
    const h = (u: number) => land.height(at.x + at.dx * u, at.z + at.dz * u), fall = (u: number) => (h(u - 3) - h(u + 3)) / 6;
    // (Up the ramp, slowed by the climb and by the air, as `stepRide` slows a skier standing; in the air, by the air, as `stepAir`.
    // Without them, a skier was flown a third further than it went, and came down twice as hard.)
    const v = Math.max(1, Math.sqrt(Math.max(1, v0 * v0 - 2 * G * d.H)) - 0.0065 * v0 * d.L);
    const a = Math.atan((h(d.L + 1) - h(d.L - 1)) / 2) + lipLift(d), dt = 1 / 120;
    let u = d.L, y = h(d.L) + d.H, vu = v * Math.cos(a), vy = v * Math.sin(a);
    for (let t = 0; t < 6; t += dt) {
      const sp = Math.hypot(vu, vy);
      vy -= G * dt; vu -= 0.004 * sp * vu * dt; vy -= 0.004 * sp * vy * dt;
      u += vu * dt; y += vy * dt;
      if (y <= h(u)) break;
    }
    const f = fall(u);
    return { u, f, after: fall(u + 6), blow: Math.max(0, -(vu * f + vy) / Math.hypot(f, 1)) };
  };
  const kickSize = (i: number, s: number, left: number, at: { x: number; z: number; dx: number; dz: number }, spare: number): KickDims => {
    if (land.length === Infinity) return kickDims(new Rng('kicker sizes').fork(`kicker ${i}`).pick(KICK_SIZES));
    const one = kickDims(1), flight = (d: KickDims, v0: number) => kickFlight(at, d, v0);
    // (A big kicker throws high, and a skier off it comes down steeply: hard, unless the land falls away under it as steeply. So a size
    // bigger than 1 is kept where, taken at `KICK_SPEED`, it comes down on the slope and no harder than `KICK_BLOW`, or than a kicker
    // of size 1 there would; and one smaller than 1 only where size 1 would come down harder than `KICK_HARD`: kickers of size 1 are
    // what the demo runs' tricks were made on, and a smaller one keeps a skier too short a time in the air for a flip.)
    const fits = (d: KickDims) => d.size === 1 || (land.kickable(s, left, d.L + d.B) && (d.size < 1 || d.half + d.side - one.half - one.side <= spare));
    const base = flight(one, KICK_SPEED);
    for (const size of KICK_SIZES.filter((z) => z > 1)) {
      const d = kickDims(size);
      if (!fits(d)) continue;
      const o = flight(d, KICK_SPEED);
      if (s + o.u + 36 < land.length && o.f >= Math.tan((10 * Math.PI) / 180) && o.after >= Math.tan((8 * Math.PI) / 180) && o.blow <= Math.max(KICK_BLOW, base.blow)) return d;
    }
    if (base.blow <= KICK_HARD) return one;
    for (const size of KICK_SIZES.filter((z) => z < 1)) { const d = kickDims(size); if (fits(d) && flight(d, KICK_SPEED).blow <= KICK_HARD) return d; }
    return one;
  };
  let kicks: Kicker[] = [];
  /** A kicker's height at a point, if one is under it. */
  const bumpAt = (x: number, z: number) => {
    let h = 0;
    for (const k of kicks) { const rx = x - k.x, rz = z - k.z; h = Math.max(h, kickerShape(k, rx * k.dx + rz * k.dz, rx * k.dz - rz * k.dx).h); }
    return h;
  };
  /** How far up its own lip's height a point stands on a kicker under it, 0 to 1 (for the pop, which comes as much towards the lip of a small kicker as of a big one). */
  const bumpShare = (x: number, z: number) => {
    let share = 0;
    for (const k of kicks) { const rx = x - k.x, rz = z - k.z; share = Math.max(share, kickerShape(k, rx * k.dx + rz * k.dz, rx * k.dz - rz * k.dx).h / k.H); }
    return share;
  };
  /** The snow's height at a point, and how it rises east and south there (over `e` metres); and which way is up from it. */
  /** The cave in the land now, if it has one (none while the land is turned inside out); and where the land is stood. */
  const caveNow = (): Cave | null => (land as CaveLand).cave ?? null;
  const toCave = <T extends { x: number; z: number; y?: number }>(p: T) => { const o = land.group.position; return { x: p.x - o.x, y: p.y ?? 0, z: p.z - o.z }; };
  /**
   * The arena laid where a great one is fought, riding (`slopeArena.ts`; asked: "for locations where these bosses spawn, we need to
   * dynamically add some elements like half pipes etc. which allow the player to proceed back on skis, maybe booster powerups to pick
   * etc."): the quarter-pipe below it, drawn; where in the scene it may stand (a box, for `ground` to pass over it quickly elsewhere);
   * whether it is sinking back, the fight done.
   */
  let arena: { pipe: Pipe; group: Group; box: [number, number, number, number]; sinking: boolean } | null = null;
  /** How high the arena's pipe raises the snow at a point: only riding, and never while the demo run is flown, which it is not in. */
  const arenaRaise = (x: number, z: number) => {
    const a = arena;
    if (!a || mode !== 'ride' || flyingDemo || x < a.box[0] || x > a.box[1] || z < a.box[2] || z > a.box[3]) return 0;
    const f = land.frame(x, z, a.pipe.foot);
    return a.pipe.raise(f.s - a.pipe.foot, f.left - a.pipe.mid);
  };
  /** Whether the skier is about the arena: in its pen, or on its pipe. */
  const inArena = () => !!arena && !arena.sinking && mode === 'ride' && !flyingDemo && ride.down > (horde.pen?.lo ?? arena.pipe.foot) - 30 && ride.down < arena.pipe.foot + arena.pipe.end;
  // (Over the cave's mound, its rock: the snow under it is cut away there.)
  const ground = (x: number, z: number) => {
    const cave = caveNow();
    if (cave) {
      const o = land.group.position, lx = x - o.x, lz = z - o.z;
      // (On foot inside, what falls or burns or bleeds there comes down on the cave's floor, not on the snow over it.)
      if (foot && cave.inside(lx, lz)) { const f = cave.floorUnder(lx, lz); if (f !== null) return f; }
      const top = cave.skiTop(lx, lz);
      if (top !== null) return top + bumpAt(x, z);
    }
    return land.height(x, z) + bumpAt(x, z) + arenaRaise(x, z);
  };
  const slopeAt = (x: number, z: number, e = 0.3): [number, number] => [(ground(x + e, z) - ground(x - e, z)) / (2 * e), (ground(x, z + e) - ground(x, z - e)) / (2 * e)];
  const normalAt = (x: number, z: number, e = 0.3) => { const [gx, gz] = slopeAt(x, z, e); return new Vector3(-gx, 1, -gz).normalize(); };
  /** The ground under a point anywhere, for a body gone limp: how far over it the point is, and which way is up from it. */
  const groundUnder: Ground = (p) => {
    const up = normalAt(p.x, p.z);
    return { above: (p.y - ground(p.x, p.z)) * up.y, up };
  };
  // Each kicker drawn as its shape in snow on the land under it, the lip dyed blue across its top, a flag either side of the lip.
  const kickerSurface = (k: Kicker, u0: number, u1: number, nu: number, x0: number, x1: number, nx: number, lift: number, xs?: number[]) => {
    const across = xs ?? Array.from({ length: nx + 1 }, (_, j) => x0 + ((x1 - x0) * j) / nx), us: number[] = [];
    for (let i = 0; i <= nu; i++) us.push(u0 + ((u1 - u0) * i) / nu);
    if (u1 > k.L && u0 < k.L && !us.includes(k.L)) { us.push(k.L); us.sort((a, b) => a - b); }
    const pos: number[] = [], uv: number[] = [], index: number[] = [], w = across.length;
    for (const u of us) for (const x of across) {
      const px = k.x + k.dx * u + k.dz * x, pz = k.z + k.dz * u - k.dx * x;
      pos.push(px, land.height(px, pz) + kickerShape(k, u, x).h + lift, pz); uv.push(x / 9, u / 9);
    }
    for (let i = 1; i < us.length; i++) for (let j = 1; j < w; j++) {
      const a = (i - 1) * w + j - 1, b = a + 1, c = a + w, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(index);
    g.computeVertexNormals();
    return g;
  };
  const kickerParts = (() => {
    const pole = new CylinderGeometry(0.03, 0.03, 1.7, 6).translate(0, 0.85, 0);
    const flag = new BufferGeometry();
    flag.setAttribute('position', new BufferAttribute(new Float32Array([0, 1.68, 0, 0, 1.28, 0, 0, 1.48, -0.55]), 3));
    flag.computeVertexNormals();
    const map = snowMap.clone(); map.repeat.set(1, 1); map.needsUpdate = true;
    return {
      pole, flag,
      snow: new MeshStandardMaterial({ color: 0xf7f9fc, map, roughness: 0.9 }),
      dye: new MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.8 }),
      wood: new MeshStandardMaterial({ color: 0x23262b, roughness: 0.6 }),
      cloth: new MeshStandardMaterial({ color: 0xf07a1a, roughness: 0.7, side: DoubleSide }),
    };
  })();
  const buildKicker = (k: Kicker) => {
    const { L, B, half, side } = k, xs: number[] = [];
    for (let j = 0; j <= 3; j++) xs.push(-half - side + (side * j) / 3);
    for (let j = 1; j < 12; j++) xs.push(-half + (2 * half * j) / 12);
    for (let j = 0; j <= 3; j++) xs.push(half + (side * j) / 3);
    const g = new Group(), body = new Mesh(kickerSurface(k, 0, L + B, 40, 0, 0, 0, 0.012, xs), kickerParts.snow), lip = new Mesh(kickerSurface(k, L - 0.32, L - 0.04, 3, -half, half, 12, 0.022), kickerParts.dye);
    body.castShadow = body.receiveShadow = true;
    lip.receiveShadow = true;
    g.add(body, lip);
    k.flags = [];
    for (const s of [-1, 1]) {
      const x = s * (half + side + 0.4), px = k.x + k.dx * L + k.dz * x, pz = k.z + k.dz * L - k.dx * x;
      const pole = new Mesh(kickerParts.pole, kickerParts.wood), flag = new Mesh(kickerParts.flag, kickerParts.cloth);
      pole.position.set(px, land.height(px, pz), pz); flag.position.copy(pole.position);
      // (The flag flies back up the run, as the old slope's did.)
      flag.rotation.y = flag.userData.turn = Math.atan2(k.dx, k.dz);
      pole.castShadow = flag.castShadow = true;
      g.add(pole, flag);
      k.flags.push(flag);
    }
    scene.add(g);
    k.group = g;
  };
  /** A kicker taken down: its own shapes let go of (its poles' and its flags' are every kicker's). */
  const takeDown = (k: Kicker) => {
    if (!k.group) return;
    k.group.removeFromParent();
    letGoOf(k.group, (g) => g === kickerParts.pole || g === kickerParts.flag);
    k.group = undefined; k.flags = undefined;
  };
  /** The flags flying (asked: "add visual impression improvements where it doesn't hurt the performance"): each turned to and fro about its pole, as a pennant in the wind. */
  const flutter = (time: number) => {
    for (const k of kicks) k.flags?.forEach((f, j) => { f.rotation.y = f.userData.turn + 0.24 * Math.sin(time * 5.1 + k.i * 1.7 + j * 2.3) + 0.09 * Math.sin(time * 12.3 + k.i + j); });
  };
  /** The kickers about `s`: one behind, the next two ahead; built when first come near, and let go of once far behind. */
  const placeKickers = (s: number) => {
    const i0 = Math.floor((s - KICK.first) / KICK.every) - 1, near: Kicker[] = [];
    // (None where an arena is laid, riding: its pen and its pipe have the snow, and a kicker's landing ran into the pipe.)
    const clear = (k: Kicker) => !arena || k.s < arena.pipe.foot - 120 || k.s > arena.pipe.foot + arena.pipe.end + 20;
    for (let i = Math.max(0, i0); i <= i0 + 3; i++) { const k = kickerOf(i); if (k && k.s < land.length && clear(k)) near.push(k); }
    for (const k of kickerAt.values()) if (k && !near.includes(k)) takeDown(k);
    if (kickersOn) for (const k of near) if (!k.group) buildKicker(k);
    kicks = kickersOn ? near : [];
  };
  const showKickers = (on: boolean) => { kickersOn = on; placeKickers(ride.down); };

  // The skier: the adventurer, posed live (`Rider`), ridden or as the demo run was kept, with its downhill skis and poles.
  if (!win.__figureFiles) await loading.busy('Fetching the rider');
  // (The clips that come with the file; not those made from them, the run, the sprint and the skiing, which nothing here plays: the
  // skier is posed live, and making them was near half a second of opening.)
  const library = await FigureLibrary.load(base, { made: false, fetch: async (url) => { const bytes = await fetchCounted(url); if (url.includes('clips.glb')) await loading.stage('moves'); return bytes; } });
  await loading.stage('dress');
  const idle = library.clips.find((c) => c.name === 'Idle_Loop')!;
  // (The skier, and a horse's rider, an adventurer: a ranger's clothes on a base body, `src/figures/outfit.ts`; `?body=mannequin`
  // for the plain mannequin, or any other body's name.)
  const source = await library.source(bodyId, { sword: 'back' });
  const live = new Rider(source, idle), model = live.model;
  const shade = (m: Object3D) => m.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false; } });
  shade(model);
  const gear = putOn(model, 'alpine');
  // The horse (asked: "a rigged horse model; fantasy/imaginary way for the horse have skis, two bindings per ski - left and right ski
  // (or as an option for horse skiing: four short skis!); same skiing actions, tricks and animations adapted for this skiing horse;
  // with a rider on back or just the horse skiing option"), on a long pair of skis or four short ones (`src/figures/horse.ts`); and the
  // rider for its back, another mannequin, with poles long enough to reach the snow from the saddle.
  const horse = new Horse(query.get('skis') === 'four' ? 'four' : 'pair');
  const jockey = new Rider(source, idle);
  shade(jockey.model);
  const jockeyGear = putOn(jockey.model, 'mounted');
  const rider = new Group();
  scene.add(rider);
  // The skier's edges lit (asked: "now find ways to improve visual impression without making the game much heavier"): seen against the
  // sun, a horse's dark coat showed as a black shape on the snow, the side towards the eye in its own shade. The sun behind a body
  // lights its edges, as it does a horse's coat and a rider's shoulders; the more the more the eye looks towards the sun, and the more
  // the edge leans to it; and faintly from anywhere, so that the body stands off the snow. Its materials given that light of their own,
  // the same materials made as the renderer's own kind (which it otherwise makes of them when first drawn), with the light added.
  // (Worked out only where the skier is drawn: a few points of the picture.)
  // (The light takes the colour of what it falls on, as the sun's does: lit the same pale gold everywhere, a bay's rounded chest came out
  // beige and the red skis orange. And kept to the edges.)
  const rimLight = (() => {
    const edge = pow(float(1).sub(clampNode(dot(normalView, positionViewDirection), 0, 1)), 3.5);
    const against = smoothstep(-0.2, 0.8, dot(normalize(positionWorld.sub(cameraPosition)), uSun));
    const leaning = max(dot(normalWorld, uSun), 0).mul(0.6).add(0.4);
    return diffuseColor.rgb.mul(2.8).add(0.05).mul(vec3(1, 0.88, 0.72)).mul(edge.mul(leaning).mul(against.mul(0.85).add(0.1)));
  })();
  const rimmed = new Map<Material, Material>();
  const KEPT = ['name', 'color', 'roughness', 'metalness', 'map', 'normalMap', 'normalScale', 'roughnessMap', 'metalnessMap', 'aoMap', 'vertexColors', 'side', 'transparent', 'opacity', 'alphaTest', 'depthWrite', 'flatShading'] as const;
  const rimOf = (src: Material): Material => {
    if ([...rimmed.values()].includes(src)) return src;
    let made = rimmed.get(src);
    if (made) return made;
    const kind = (src as { type: string }).type;
    if (kind !== 'MeshStandardMaterial' && kind !== 'MeshLambertMaterial') return src;
    const m = kind === 'MeshStandardMaterial' ? new MeshStandardNodeMaterial() : new MeshLambertNodeMaterial();
    const from = src as unknown as Record<string, unknown>, to = m as unknown as Record<string, unknown>;
    for (const k of KEPT) if (k in from && k in to) { const v = from[k] as { clone?: () => unknown }; to[k] = v && typeof v === 'object' && 'isColor' in v || (v && typeof v === 'object' && 'isVector2' in v) ? v.clone!() : v; }
    m.emissiveNode = rimLight;
    rimmed.set(src, m);
    return m;
  };
  /** Every material of the skier's given its edge light (again after the horse's skis are changed, which makes them anew). */
  const rimAll = (o: Object3D) => o.traverse((x) => { const m = x as Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(rimOf) : rimOf(m.material); });
  const basis = new Matrix4();
  /**
   * Stands the skier at `p`, upright to `up` (the snow's, under it), facing `facing` (radians to the left of the run's way at `f`);
   * its nose `pitch` further up (just off a kicker's lip, in the air).
   */
  const standAt = (p: Vector3, up: Vector3, facing: number, f: Frame | { dx: number; dz: number }, pitch = 0) => {
    const ahead = along(facing, f), fwd = ahead.addScaledVector(up, -ahead.dot(up)).normalize(), side = up.clone().cross(fwd).normalize();
    rider.position.copy(p);
    rider.quaternion.setFromRotationMatrix(basis.makeBasis(side, up, fwd));
    if (pitch) rider.quaternion.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch));
    rider.updateMatrixWorld(true);
  };
  /**
   * The skier, as `standAt` has put it, rolled over sideways by `roll` about the way it faces (a barrel roll), through the middle of
   * its body (a person's, over the hips; a horse's barrel, which its rider sits on): the whole of it, horse and rider together.
   */
  /** How far a barrel roll has moved the skier's place (its feet) about the middle of its body, for the views to leave out (`focus`). */
  const rollShift = new Vector3();
  /** What the last barrel roll was turned about, in the skier's own frame: the line, and the point on it (`__slope.rollAxis`). */
  let rolledAbout: { axis: Vector3; mid: Vector3 } | null = null;
  const rollAbout = (roll: number, tuck = 0) => {
    rollShift.set(0, 0, 0);
    if (!roll) return;
    // (A person rolls about the way it faces, through its middle, lower as it tucks, its knees drawn up. A horse about its own spine as
    // it is posed, from its hips to its chest, through the middle of its barrel, a little higher with its rider on it, for the rider's
    // weight (asked: "Check over which axle the barrel roll rotates on a horse mounted ride also"). Its spine lies along the way it faces
    // to two degrees, its barrel's middle 1.21 metres up: the fixed line it had been rolled about, 1.35 up, was all but the same.)
    let axis = new Vector3(0, 0, 1), mid = new Vector3(0, 1.0 - 0.22 * tuck, 0);
    if (who !== 'person') {
      rider.updateMatrixWorld(true);
      const js = horse.joints(), inv = rider.matrixWorld.clone().invert(), hips = js.hips.clone().applyMatrix4(inv), chest = js.chest.clone().applyMatrix4(inv);
      axis = chest.clone().sub(hips).normalize();
      mid = hips.lerp(chest, 0.5).addScaledVector(UP, who === 'mounted' ? 0.15 : 0);
    }
    rolledAbout = { axis: axis.clone(), mid: mid.clone() };
    const before = mid.clone().applyQuaternion(rider.quaternion);
    rider.quaternion.multiply(new Quaternion().setFromAxisAngle(axis, roll));
    rollShift.copy(before.sub(mid.applyQuaternion(rider.quaternion)));
    rider.position.add(rollShift);
    rider.updateMatrixWorld(true);
  };
  // A person's joints where they are in the world, as a body gone limp takes them: its bones', and its skis' tips and tails.
  const humanJoints = (m: Object3D, skis: Object3D[] | null): Record<string, Vector3> => {
    rider.updateMatrixWorld(true);
    const out: Record<string, Vector3> = {};
    for (const j of JOINTS) if (!j.startsWith('tip') && !j.startsWith('tail')) out[j] = m.getObjectByName(j)!.getWorldPosition(new Vector3());
    if (skis) (['l', 'r'] as const).forEach((k, i) => {
      out[`tip_${k}`] = skis[i].localToWorld(new Vector3(0, 0.01, 0.8));
      out[`tail_${k}`] = skis[i].localToWorld(new Vector3(0, 0.01, -0.78));
    });
    return out;
  };
  const personSkis = (['l', 'r'] as const).map((k) => gear.find((m) => m.parent?.name === `foot_${k}`)!);
  /** Puts a spot on the snow (or on a kicker's), a finger's breadth over it. */
  const onSnow = (p: Vector3) => { p.y = ground(p.x, p.z) + 0.02; return p; };
  const feet = ['foot_l', 'foot_r'].map((n) => model.getObjectByName(n)!), toes = ['ball_l', 'ball_r'].map((n) => model.getObjectByName(n)!);

  /**
   * What is skiing, and what it is asked to do: posed for the ride and for the air (the demo run's frames keep how it was posed); how far its body faces round
   * with its way (a person's chest stays down the slope, a horse goes where its skis go); where each of its skis is (the middles, to lay
   * their tracks from); and the bodies it is made of, for a fall (a horse and its rider are two, and part).
   */
  interface Body { spec: BodySpec; joints(): Record<string, Vector3>; poseJoints(p: Record<string, Vector3>): void }
  interface Skier { object: Object3D; facing: number; ride(c: RideControls): void; air(c: AirControls): void; skis(): Vector3[]; bodies(): Body[] }
  type Who = 'person' | 'horse' | 'mounted';
  const personBody: Body = { spec: HUMAN, joints: () => humanJoints(model, personSkis), poseJoints: (p) => live.poseJoints(p) };
  const horseBody: Body = { get spec() { return horse.spec(); }, joints: () => horse.joints(), poseJoints: (p) => horse.poseJoints(p) };
  const jockeyBody: Body = { spec: humanSpec(false), joints: () => humanJoints(jockey.model, null), poseJoints: (p) => jockey.poseJoints(p) };
  const airSaddle = (c: AirControls) => saddlePose({ s: 0, brake: 0, tall: 0, flickL: 0, flickR: 0, ...c });
  const skiers: Record<Who, Skier> = {
    person: {
      object: model, facing: 0.5,
      ride: (c) => live.pose(c), air: (c) => live.poseAir(c),
      skis: () => [0, 1].map((k) => feet[k].getWorldPosition(new Vector3()).add(toes[k].getWorldPosition(new Vector3())).multiplyScalar(0.5)),
      bodies: () => [personBody],
    },
    horse: {
      object: horse.model, facing: 0.85,
      ride: (c) => horse.pose(horseRidePose(c)), air: (c) => horse.pose(horseAirPose(c, horse.skis === 'four')),
      skis: () => horse.skiMiddles(), bodies: () => [horseBody],
    },
    mounted: {
      object: horse.model, facing: 0.85,
      ride: (c) => { horse.pose(horseRidePose(c)); jockey.posePose(saddlePose(c)); },
      air: (c) => { horse.pose(horseAirPose(c, horse.skis === 'four')); jockey.posePose(airSaddle(c)); },
      skis: () => horse.skiMiddles(), bodies: () => [horseBody, jockeyBody],
    },
  };
  // The horse's coat as hair on a computer (`horseCoat.ts`), with the same edge light; its plain coat on a phone or a tablet, where the
  // horse is drawn in fewer points and each costs more. (`?coat=hair` or `?coat=plain`, either anywhere.)
  const coatAsked = query.get('coat');
  if (coatAsked ? coatAsked !== 'plain' : matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const coat = horseCoatMaterial();
    coat.emissiveNode = rimLight;
    rimmed.set(coat, coat);
    horse.mesh.material = coat;
  }
  for (const o of [model, horse.model, jockey.model]) rimAll(o);
  // (On foot at the cave, the skier, or the horse's rider got down, walks and runs by the packs' clips (`slopeFoot.ts`), played on its
  // own posed body: so that what it carries is held as it is on skis, the arms posed on the walk (`Rider.hold`). Their clips fitted to the
  // body while the page opens.)
  let walkers: { person: Walker; mounted: Walker } | null = null;
  void library.body(bodyId).then((b) => { walkers = { person: new Walker(live.model, b.moves, b.scale), mounted: new Walker(jockey.model, b.moves, b.scale) }; }).catch((e) => console.warn(e));
  const walkerNow = () => (walkers ? (who === 'mounted' ? walkers.mounted : walkers.person) : null);
  // (The horse and its rider unless another is asked for (asked: "also make the horse & rider the default mode"): `?skier=person` or
  // `?skier=horse`.)
  let who: Who = (['person', 'horse', 'mounted'] as Who[]).find((w) => w === query.get('skier')) ?? 'mounted', skier = skiers[who];
  /** The rider back in its saddle, if there is one. */
  const seat = () => { if (who === 'mounted') horse.saddle.add(jockey.model); else jockey.model.removeFromParent(); horse.setTack(who === 'mounted'); };
  /** The reins from the bit to the rider's hands, as they are now; none once the rider is thrown. */
  const reinsNow = () => { if (who === 'mounted' && !foot) { rider.updateMatrixWorld(true); horse.setReins(crash || (cat && cat.t < cat.gather[1]) ? null : ['hand_l', 'hand_r'].map((n) => jockey.model.getObjectByName(n)!.getWorldPosition(new Vector3()))); } };
  rider.add(skier.object);
  seat();


  // The tracks. A carved line is a narrow, sharp groove, shadowed; a skid scrapes a broad band, only a little paler than the snow
  // about it. Laid as strips, each a ski's middle at each step with the ski's track either side of it, across the way it went. Lit as
  // the snow is, and shadowed with it (asked: "the skid marks dont seem to receive lighting or shadows"): unlit, they stayed as bright
  // in a tree's or the skier's shadow as in the sun.
  const trackPaint = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.9, depthWrite: false });
  const groove = new Color(0x8ea5c2), scraped = new Color(0xd3dde9);
  const strip = (n: number, parent: Object3D = scene) => {
    const g = new BufferGeometry(), index: number[] = [];
    for (let j = 1; j < n; j++) index.push(j * 2 - 2, j * 2 - 1, j * 2, j * 2 - 1, j * 2 + 1, j * 2);
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 6), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(n * 6), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(n * 6), 3));
    g.setIndex(index);
    g.setDrawRange(0, 0);
    const mesh = new Mesh(g, trackPaint);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    // (Not drawn until something of it is laid: a strip of nothing was a draw of nothing each frame, eight of them, and a warning.)
    mesh.visible = false;
    parent.add(mesh);
    return mesh;
  };
  /** So much of a strip shown, from its start: none of it, and it is not drawn at all. */
  const showStrip = (mesh: Mesh, count: number) => { mesh.geometry.setDrawRange(0, count); mesh.visible = count > 0; };
  /**
   * Writes the `j`th step of a strip: the ski's middle, the way it went (against the run's way at `f`), and how broad it is (half); and
   * how `deep` in loose snow it went, off the piste: a broader trench, its walls shadowed blue.
   */
  const trench = new Color(0x7d92b2);
  const lay = (mesh: Mesh, j: number, at: Vector3, way: number, half: number, f: { dx: number; dz: number }, deep = 0) => {
    const across = along(way + Math.PI / 2, f).multiplyScalar(half + 0.1 * deep);
    (mesh.geometry.getAttribute('position') as BufferAttribute).set([...onSnow(at.clone().add(across)).toArray(), ...onSnow(at.clone().sub(across)).toArray()], j * 6);
    const c = groove.clone().lerp(scraped, Math.min(1, (half - 0.035) * 2.5)).lerp(trench, 0.85 * deep);
    (mesh.geometry.getAttribute('color') as BufferAttribute).set([c.r, c.g, c.b, c.r, c.g, c.b], j * 6);
    // (Facing up from the snow under its middle, both its edges, to be lit as that snow is.)
    const up = normalAt(at.x, at.z);
    (mesh.geometry.getAttribute('normal') as BufferAttribute).set([up.x, up.y, up.z, up.x, up.y, up.z], j * 6);
  };
  const halfOf = (skid: number) => 0.035 + 0.75 * skid;
  // The demo run's: worked out for the whole run (again for each skier), then shown as far as the skier has got. As many strips as the
  // skier has skis: two, or a horse's four short ones. (Room for four minutes of it.)
  const watchTracks = [0, 1, 2, 3].map(() => strip(3600));
  let watchSkis = 2;
  // The ridden runs' tracks, laid as the skier goes, a step every thirty centimetres; and kept run after run on the same slope (asked:
  // "would it be expensive to keep the laid tracks accumulating run after run while in the same location"), let go of only as the
  // slope changes (`clearRideTracks`). Laid in chunks of `TRACKS.chunk` steps, a strip a ski each, so that a chunk out of sight is not
  // drawn; and each step sent to the graphics card alone as it is laid (every strip had been sent whole at each step, some seventy
  // kilobytes, which run after run would have grown to megabytes a step). Past `TRACKS.runs` runs, or `TRACKS.most` steps a ski, the
  // oldest chunk let go of; the runs before this one fainter, the older the fainter (`TRACKS.fade`), so that the slope ridden over and
  // over shows the last run plainest. Not drawn while the demo run is watched, which has its own (`watchTracks`).
  const TRACKS = { chunk: 600, runs: 5, most: 24000, fade: [0.9, 0.7, 0.55, 0.45, 0.35], gap: 8 };
  interface TrackChunk { meshes: Mesh[]; laid: number; run: number; box: Box3 }
  const rideTrackGroup = new Group();
  rideTrackGroup.name = 'ride tracks';
  scene.add(rideTrackGroup);
  const rideChunks: TrackChunk[] = [], chunkPool: Mesh[] = [];
  const runPaint = TRACKS.fade.map((o) => { const m = trackPaint.clone(); m.opacity = o; return m; });
  /** Which run is being ridden (counted on the slope), and whether the next step begins the tracks anew where it is: after the air, a fall, a throw. */
  let rideRun = 0, rideBreak = true;
  const lastLaid = new Vector3(), corner = new Vector3();
  const TRACK_ATTRS = ['position', 'color', 'normal'] as const;
  const chunkMesh = () => {
    const m = chunkPool.pop() ?? strip(TRACKS.chunk, rideTrackGroup);
    // (Drawn only when its chunk is in sight: what it covers, kept as it is laid, `showChunk`.)
    m.frustumCulled = true;
    m.geometry.boundingSphere ??= new Sphere();
    showStrip(m, 0);
    return m;
  };
  const dropChunk = (c: TrackChunk) => { for (const m of c.meshes) { showStrip(m, 0); chunkPool.push(m); } };
  /** Steps `from` to `to` of a chunk sent to the graphics card, and what it covers grown to take them in. */
  const sendSteps = (c: TrackChunk, from: number, to: number) => {
    for (const m of c.meshes) {
      for (const name of TRACK_ATTRS) { const a = m.geometry.getAttribute(name) as BufferAttribute; a.addUpdateRange(from * 6, (to - from) * 6); a.needsUpdate = true; }
      const p = m.geometry.getAttribute('position') as BufferAttribute;
      for (let i = from * 2; i < to * 2; i++) c.box.expandByPoint(corner.fromBufferAttribute(p, i));
    }
  };
  const showChunk = (c: TrackChunk) => { for (const m of c.meshes) { c.box.getBoundingSphere(m.geometry.boundingSphere!); showStrip(m, Math.max(0, c.laid - 1) * 6); } };
  /** The oldest chunks let go of, past so many runs or so many steps. */
  const trimTracks = () => {
    let steps = rideChunks.reduce((n, c) => n + c.laid, 0);
    while (rideChunks.length > 1 && (rideChunks[0].run <= rideRun - TRACKS.runs || steps > TRACKS.most)) { const c = rideChunks.shift()!; steps -= c.laid; dropChunk(c); }
  };
  /** A chunk begun, of so many skis' strips: going on from the last step of `from`, or anew. */
  const newChunk = (skis: number, from: TrackChunk | null) => {
    const c: TrackChunk = { meshes: Array.from({ length: skis }, chunkMesh), laid: 0, run: rideRun, box: new Box3() };
    for (const m of c.meshes) m.material = runPaint[0];
    if (from) {
      c.meshes.forEach((m, k) => { for (const name of TRACK_ATTRS) (m.geometry.getAttribute(name) as BufferAttribute).set((from.meshes[k].geometry.getAttribute(name) as BufferAttribute).array.subarray((from.laid - 1) * 6, from.laid * 6), 0); });
      c.laid = 1;
      sendSteps(c, 0, 1);
    }
    rideChunks.push(c);
    trimTracks();
    return c;
  };
  /** The `j`th step of a strip made as narrow as nothing, where the step before it ended: a break in the strip begins so. */
  const pinch = (mesh: Mesh, j: number) => {
    const p = mesh.geometry.getAttribute('position') as BufferAttribute, i = (j - 1) * 2;
    corner.fromBufferAttribute(p, i).add(new Vector3().fromBufferAttribute(p, i + 1)).multiplyScalar(0.5);
    p.setXYZ(j * 2, corner.x, corner.y, corner.z); p.setXYZ(j * 2 + 1, corner.x, corner.y, corner.z);
    for (const name of ['color', 'normal'] as const) { const a = mesh.geometry.getAttribute(name) as BufferAttribute; a.array.copyWithin(j * 6, (j - 1) * 6, j * 6); }
  };
  const layRide = (now: Now) => {
    const at = skier.skis().map(onSnow);
    let c = rideChunks[rideChunks.length - 1];
    const fresh = !c || c.run !== rideRun || c.meshes.length !== at.length;
    if (!fresh && !rideBreak && at[0].distanceTo(lastLaid) < 0.3) return;
    // (Moved further than a step can go, put down somewhere else: not joined to where it was.)
    if (!fresh && at[0].distanceTo(lastLaid) > TRACKS.gap) rideBreak = true;
    lastLaid.copy(at[0]);
    if (fresh) c = newChunk(at.length, null);
    else if (c.laid + (rideBreak ? 3 : 1) > TRACKS.chunk) c = newChunk(at.length, rideBreak ? null : c);
    const from = c.laid;
    // (A break in the strip, as it goes on: a step of no breadth where it ended, and another here, so that nothing is drawn between them.)
    if (rideBreak && c.laid) {
      c.meshes.forEach((m, k) => { pinch(m, c.laid); lay(m, c.laid + 1, at[k], now.way, 0, here, 0); });
      c.laid += 2;
    }
    rideBreak = false;
    at.forEach((p, k) => lay(c.meshes[k], c.laid, p, now.way, halfOf(now.skid), here, ride.deep));
    c.laid++;
    sendSteps(c, from, c.laid);
    showChunk(c);
  };
  /** A run begun again on the same slope: its tracks laid anew, the ones before kept, a little fainter, and the oldest let go of. */
  const newRideRun = () => {
    rideBreak = true;
    // (Nothing laid since the last one began: no run to count.)
    if (rideChunks[rideChunks.length - 1]?.run !== rideRun) return;
    rideRun++;
    for (const c of rideChunks) for (const m of c.meshes) m.material = runPaint[Math.min(rideRun - c.run, runPaint.length - 1)];
    trimTracks();
  };
  /** Every ridden track let go of: the slope changed, or turned over. */
  const clearRideTracks = () => { for (const c of rideChunks.splice(0)) dropChunk(c); rideBreak = true; };
  /**
   * The ridden tracks within `box` (in the scene: x from, to, z from, to) laid down on the snow again: those ridden over an arena's
   * pipe, as it sinks back into the snow, else they were left hanging in the air where it had stood.
   */
  const settleRideTracks = (box: readonly [number, number, number, number]) => {
    for (const c of rideChunks) {
      if (c.box.isEmpty() || c.box.max.x < box[0] || c.box.min.x > box[1] || c.box.max.z < box[2] || c.box.min.z > box[3]) continue;
      let moved = false;
      for (const m of c.meshes) {
        const p = m.geometry.getAttribute('position') as BufferAttribute, n = m.geometry.getAttribute('normal') as BufferAttribute;
        for (let i = 0; i < c.laid * 2; i++) {
          const x = p.getX(i), z = p.getZ(i);
          if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) continue;
          p.setY(i, ground(x, z) + 0.02);
          const up = normalAt(x, z);
          n.setXYZ(i, up.x, up.y, up.z);
          moved = true;
        }
      }
      if (moved) { c.box.makeEmpty(); sendSteps(c, 0, c.laid); showChunk(c); }
    }
  };

  // Snow thrown up from the skis' edges (asked: "maybe the flying snow from skidded turns and braking could be improved to something
  // nicer with a bit of snow sparkle?"; it had been white chips of a solid). A cloud of powder: puffs, each a picture of soft blots
  // turned to the eye, thrown out, slowed by the air and settling slowly, swelling and thinning as they hang. And grains of ice in it,
  // a few centimetres of light each, that twinkle as they tumble and catch the sun, falling as grains do and lying a moment where they
  // land. Thrown while the skis slide sideways (a skidded turn, braking), the more the faster; a few grains off the edges of a turn
  // carved hard; and a burst where a jump lands. (Two draws, of quads only; what they cost is how much of the picture the puffs cover.)
  const PUFFS = 220, GRAINS = 640;
  const puffMap = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, rng = new Rng('puff');
    for (let i = 0; i < 7; i++) {
      const x = 32 + rng.range(-9, 9), y = 32 + rng.range(-9, 9), r = rng.range(10, 20), grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${rng.range(0.35, 0.6)})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    }
    return new CanvasTexture(c);
  })();
  const puffShape = new PlaneGeometry(1, 1), grainShape = new PlaneGeometry(1, 1);
  const puffFade = new InstancedBufferAttribute(new Float32Array(PUFFS), 1), grainLight = new InstancedBufferAttribute(new Float32Array(GRAINS * 2), 2);
  puffShape.setAttribute('aFade', puffFade);
  grainShape.setAttribute('aGrain', grainLight);
  const puffPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  puffPaint.colorNode = vec3(1, 1.02, 1.07);
  puffPaint.opacityNode = texture(puffMap, uv()).a.mul(attribute('aFade', 'float')).mul(0.5);
  // (Each grain's light: how much of it is left, and when in its tumble it turns its face to the sun, a flash of light far brighter
  // than the snow, added to the picture.)
  const grainPaint = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
  const grainOf = attribute('aGrain', 'vec2'), twinkle = pow(sin(time.mul(21).add(grainOf.y.mul(57))).mul(0.5).add(0.5), 10);
  grainPaint.colorNode = vec3(1, 0.96, 0.88).mul(twinkle.mul(9).add(0.35)).mul(grainOf.x);
  grainPaint.opacityNode = smoothstep(0.5, 0.06, length(uv().sub(0.5)));
  const puffs = new InstancedMesh(puffShape, puffPaint, PUFFS), grains = new InstancedMesh(grainShape, grainPaint, GRAINS);
  for (const m of [puffs, grains]) { m.frustumCulled = false; m.renderOrder = 2; scene.add(m); }
  type Bit = { p: Vector3; v: Vector3; age: number; life: number; size: number; grow: number; down: boolean; shown: boolean };
  const bits = (n: number): Bit[] => Array.from({ length: n }, () => ({ p: new Vector3(), v: new Vector3(), age: 0, life: 0, size: 0, grow: 0, down: false, shown: true }));
  const puffBits = bits(PUFFS), grainBits = bits(GRAINS);
  let nextPuff = 0, nextGrain = 0, sprayAir = false;
  const hidden = new Matrix4().makeScale(0, 0, 0), m4 = new Matrix4(), size = new Vector3();
  const sprayRng = new Rng('spray');
  const throwPuff = (from: Vector3, v: Vector3, big = 1, long = 1) => {
    const b = puffBits[nextPuff++ % PUFFS];
    b.p.copy(from); b.v.copy(v); b.age = 0; b.life = sprayRng.range(0.6, 1.1) * long; b.size = sprayRng.range(0.18, 0.32) * big; b.grow = sprayRng.range(0.35, 0.75) * big;
  };
  const throwGrain = (from: Vector3, v: Vector3) => {
    const i = nextGrain++ % GRAINS, b = grainBits[i];
    b.p.copy(from); b.v.copy(v); b.age = 0; b.life = sprayRng.range(0.6, 1.4); b.size = sprayRng.range(0.03, 0.055); b.down = false;
    grainLight.setY(i, sprayRng.range(0, 1));
  };
  /** Where the snow is thrown from, about a ski's spot, and how: on along the way it goes, up, and out the way the skis slide. */
  const thrown = (spot: Vector3, go: Vector3, aside: Vector3, slide: Vector3, speed: number, up: [number, number]) => {
    const from = onSnow(spot.clone()).addScaledVector(go, 0.3).addScaledVector(aside, sprayRng.range(-0.6, 0.6)).addScaledVector(UP, 0.05);
    const v = go.clone().multiplyScalar(speed * sprayRng.range(0.45, 0.95)).addScaledVector(UP, sprayRng.range(...up)).addScaledVector(aside, sprayRng.range(-1.4, 1.4)).addScaledVector(slide, speed * sprayRng.range(0.2, 0.6));
    return { from, v };
  };
  /** The spray stepped on by `dt` (none while paused), and thrown from the skis by what they are doing now (`now`; none in the air). */
  const stepSpray = (dt: number, now: Now | null, inAir: boolean) => {
    if (dt > 0 && now) {
      const go = along(now.way, here), skiAlong = along(now.ski, here), slide = go.clone().addScaledVector(skiAlong, -go.dot(skiAlong)), spots = skier.skis(), aside = runLeft(here);
      // (So many a second, whatever the frames' pace: a share of one carried to the next frame by chance.)
      const many = (perSecond: number) => Math.floor(perSecond * dt + sprayRng.range(0, 1));
      if (now.skid > 0.45 && now.speed > 3.5) {
        for (let i = many(now.speed * 12); i > 0; i--) { const t = thrown(spots[i % spots.length], go, aside, slide, now.speed, [0.3, 1.5]); throwPuff(t.from, t.v); }
        for (let i = many(now.speed * 32); i > 0; i--) { const t = thrown(spots[i % spots.length], go, aside, slide, now.speed, [1.4, 3.6]); throwGrain(t.from, t.v); }
      } else if (now.skid > 0.12 && now.speed > 9) {
        for (let i = many(now.speed * 3); i > 0; i--) { const t = thrown(spots[i % spots.length], go, aside, slide, now.speed * 0.6, [0.6, 1.8]); throwGrain(t.from, t.v); }
      }
      // (Off the piste, the powder the skis plough through thrown up before and beside them, the more the deeper and the faster: `DEEP`.)
      const deep = now.deep ?? 0;
      if (deep > 0.15 && now.speed > 2.5 && !inAir) {
        for (let i = many(now.speed * 4 * deep); i > 0; i--) {
          const spot = spots[i % spots.length];
          throwPuff(onSnow(spot.clone()).addScaledVector(UP, 0.1), go.clone().multiplyScalar(now.speed * sprayRng.range(0.2, 0.5)).addScaledVector(aside, sprayRng.range(-1.2, 1.2)).addScaledVector(UP, sprayRng.range(0.6, 1.8)), sprayRng.range(0.8, 1.3));
        }
        for (let i = many(now.speed * 8 * deep); i > 0; i--) {
          const spot = spots[i % spots.length];
          throwGrain(onSnow(spot.clone()).addScaledVector(UP, 0.05), go.clone().multiplyScalar(now.speed * sprayRng.range(0.3, 0.7)).addScaledVector(aside, sprayRng.range(-1.5, 1.5)).addScaledVector(UP, sprayRng.range(1, 2.6)));
        }
      }
      // (A jump landed: a burst about the skis, out to every side, as far as the speed throws it.)
      if (sprayAir && !inAir && now.speed > 4) {
        for (let i = 0; i < 14; i++) {
          const spot = spots[i % spots.length], out = new Vector3(sprayRng.range(-1, 1), 0, sprayRng.range(-1, 1)).normalize();
          throwPuff(onSnow(spot.clone()).addScaledVector(UP, 0.1), out.multiplyScalar(sprayRng.range(1, 3)).addScaledVector(go, now.speed * sprayRng.range(0.3, 0.7)).addScaledVector(UP, sprayRng.range(0.6, 1.8)), 1.4);
        }
        for (let i = 0; i < 60; i++) {
          const spot = spots[i % spots.length], out = new Vector3(sprayRng.range(-1, 1), 0, sprayRng.range(-1, 1)).normalize();
          throwGrain(onSnow(spot.clone()).addScaledVector(UP, 0.05), out.multiplyScalar(sprayRng.range(1, 4)).addScaledVector(go, now.speed * sprayRng.range(0.3, 0.8)).addScaledVector(UP, sprayRng.range(1, 3.5)));
        }
      }
    }
    if (dt > 0) sprayAir = inAir;
    // Each turned to the eye. Puffs slowed by the air and settling slowly, swelling and thinning; grains falling, lying where they land.
    // (One spent is put away once, not every frame; and with none in the air and none just put away, nothing is sent to the graphics
    // card and nothing drawn: most of a run, which had sent both sets whole every frame.)
    const drag = Math.exp(-2.6 * dt), grainDrag = Math.exp(-0.7 * dt);
    let puffsUp = 0, grainsUp = 0, puffsChanged = false, grainsChanged = false;
    puffBits.forEach((b, i) => {
      if (b.age >= b.life) { if (b.shown) { b.shown = false; puffsChanged = true; puffs.setMatrixAt(i, hidden); puffFade.setX(i, 0); } return; }
      b.shown = true; puffsUp++;
      b.age += dt; b.v.multiplyScalar(drag); b.v.y -= 0.35 * G * dt; b.p.addScaledVector(b.v, dt);
      const k = Math.min(1, b.age / b.life);
      puffs.setMatrixAt(i, m4.compose(b.p, camera.quaternion, size.setScalar(b.size + b.grow * Math.sqrt(k))));
      puffFade.setX(i, smooth(b.age / 0.08) * (1 - k) ** 1.4);
    });
    grainBits.forEach((b, i) => {
      if (b.age >= b.life) { if (b.shown) { b.shown = false; grainsChanged = true; grains.setMatrixAt(i, hidden); grainLight.setX(i, 0); } return; }
      b.shown = true; grainsUp++;
      b.age += dt;
      if (!b.down) {
        b.v.multiplyScalar(grainDrag); b.v.y -= 0.8 * G * dt; b.p.addScaledVector(b.v, dt);
        const g = ground(b.p.x, b.p.z) + 0.02;
        if (b.p.y < g && b.v.y < 0) { b.p.y = g; b.down = true; b.life = Math.min(b.life, b.age + sprayRng.range(0.2, 0.6)); }
      }
      grains.setMatrixAt(i, m4.compose(b.p, camera.quaternion, size.setScalar(b.size)));
      grainLight.setX(i, 1 - (b.age / b.life) ** 3);
    });
    if (puffsUp || puffsChanged) puffs.instanceMatrix.needsUpdate = puffFade.needsUpdate = true;
    if (grainsUp || grainsChanged) grains.instanceMatrix.needsUpdate = grainLight.needsUpdate = true;
    puffs.visible = puffsUp > 0; grains.visible = grainsUp > 0;
  };
  const clearSpray = () => { for (const b of [...puffBits, ...grainBits]) b.age = b.life = 0; sprayAir = false; };

  // ---------------------------------------------------------------- riding: the skier as the pointer and the slope have it
  /**
   * The ridden skier: where it is (east, south and up, in the scene), and how fast it is rising there (as the snow under it rose over
   * its last step), and where that is against the run (`down` along it, `left` across it); which way it goes against the run's own way there, and how fast; the facing of its body (half the way it goes, lagging,
   * so that its chest stays more down the run than its skis); how far into a tuck, standing tall and braking; its lean into the turn;
   * its poles' flicks, each a time left to run; how high the kicker under it is, if it is on one; how far it has sunk to take a
   * landing; any turn of the whole body it is still coming out of from one; how far its turn is skidded rather than carved (0 to 1);
   * how long an arrow key has been held to turn; and whether it has come to the end of the run.
   */
  const ride = {
    x: 0, y: 0, z: 0, vy: 0, down: 0, left: 0, way: 0, speed: 0, facing: 0, tuck: 0, tall: 0, brake: 0, brakeSide: 1, lean: 0, leanSide: 0, flickL: 0, flickR: 0, time: 0,
    out: 0, absorb: 0, sink: 0, pop: 0, settle: { spin: 0, flip: 0, left: 0 }, skid: 0, held: 0, ended: false,
    /** Riding switch: backwards, the tails of its skis leading, its body facing back up the slope and looking over its shoulder. */
    switch: false,
    /** How far its knees give to the snow's shape under it (`RideControls.flex`), and how far it looks back over its shoulder (switch). */
    flex: 0, back: 0,
    /** A 180 on the snow it is in the middle of, if it is: which, how far into it (seconds), and which way round (to the left, 1). */
    turn180: null as { kind: Ground180; t: number; dir: number } | null,
    /** How long it has left of pushing off with its poles, a run begun (seconds). */
    shove: 0,
    /** Skating (`SKATE`): whether it is, how far into it its legs are (0 to 1, eased in and out), and how far through a stride (0 to 1). */
    skating: false, skate: 0, stride: 0,
    /**
     * How bare of snow the ground under its skis is (`STONES`; 0 to 1, eased over a stride), and how far it has gone over the stones;
     * and how bare it is just where it is now, not eased, the barest of under its middle and its skis' tips and tails.
     */
    stones: 0, overStones: 0, bare: 0,
    /** How deep in loose snow off the groomed piste it is (`DEEP`; 0 to 1, eased). */
    deep: 0,
  };
  /**
   * The push off at a run's start (asked: "maybe just add always a small push for new run to get things moving"): for its first moments
   * the skier pushes off with both poles, a push dying away over them.
   */
  const SHOVE = { long: 1.6, most: 3.5 };
  /**
   * On foot, the skis off (asked: "when player enters that entrance area outside of the cavern, they unmount the skis so they can then
   * continue to explore the cavern by foot. If they exit the entrance area, the skis get back on"): where, which way it faces (radians,
   * as the world's: forward is along (sin, cos)), how fast it goes (backwards, less than nothing) and how hard it turns, how far through
   * a horse's stride, which of the dungeon's rooms it was last in, and whether it has been told where it is. Riding into the cave's
   * camp, the skier brakes to a stop (`stopping`), and the skis come off.
   */
  let foot: { x: number; y: number; z: number; heading: number; speed: number; dx: number; dz: number; turn: number; phase: number; room: number; told: boolean } | null = null;
  let stopping = false;
  let flyingDemo = false;
  /**
   * What the player wears, found in the dungeons' chests and on the great ones felled (`slopeLoot.ts`), and what it all comes to
   * (`worn`, worked out again as it changes): read by the ride, the jumps, the landings, the arms and the wards, riding only, never in
   * the demo runs or as one is flown, which the pilot flies as they always were.
   */
  let pack: Pack | null = null, worn: Mods = NO_MODS;
  /** What was found and is still on its way to the player given it at once (as a run begins again); nothing, until loot is set up. */
  let giveLeft = () => {};
  const kit = (): Readonly<Mods> => (pack && mode === 'ride' && !flyingDemo ? worn : NO_MODS);
  /**
   * A number gone bad, caught where it would go on into what is drawn (asked, of the run begun again by itself and the rider's upper
   * body gone: "I get this instant reset now when i ride off to rocks or so and upper torso of human player model is missing"): what it
   * was and where, the last kept in this browser (`slope.problem`) and shown in the menu under *Settings*, for it to be told of.
   */
  const noteProblem = (what: string) => {
    console.warn(`Grand Horse Mountain: ${what}`);
    const at = new Date();
    try { localStorage.setItem('slope.problem', JSON.stringify({ what: what.slice(0, 300), at: at.toISOString() })); } catch { /* (not kept) */ }
    showProblem?.();
  };
  let showProblem: (() => void) | null = null;
  /** The pose's numbers made sane before they pose a body: each gone to no number set to nothing, and the first said (`noteProblem`), once a while. */
  let poseSaidAt = -1e9;
  const sanePose = (c: Record<string, unknown>, where: string) => {
    let bad = '';
    for (const k in c) { const v = c[k]; if (typeof v === 'number' && !Number.isFinite(v)) { if (!bad) bad = k; c[k] = 0; } }
    if (bad && performance.now() - poseSaidAt > 5000) { poseSaidAt = performance.now(); noteProblem(`the pose ${where}: ${bad} went to no number`); }
  };
  /** How hard skis that push on from slow (`Mods.accel`, a share) push at a standstill, m/s² a whole one; less the faster, none at 90 km/h. */
  const ACCEL_PUSH = 3.5;
  const shoveNow = () => (carting || ride.ended || ride.brake > 0.3 ? 0 : SHOVE.most * smooth(ride.shove / SHOVE.long));
  /**
   * Skating (asked: "if the player speed goes too low, like below 10km/h, make the skier (horse or human) start making skating kick
   * moves to add speed back to up to 25km/h"): riding (not the demo run's pilot), on the snow, going slower than `below` metres a
   * second, not braking, not at its run's end, the skier skates, a stride with each leg in turn (`rate` strides of both a second), each
   * a push out to its side that swells and dies away, `push` at its height (some 1.35 metres a second each second in all), until it is
   * going `until` again. So no flat stretch or stop leaves it standing there with no way on: the run back up the land turned inside out
   * began at its foot, where the run flattens out, and could stall there. (It had pushed on without a stride to be seen, below 14 km/h.)
   * And up a slope (asked: "the skating from low speed should be possible to uphill as well (for example if the player gets somehow
   * stuck)"): each stride pushes the harder, over the stride, by as much as the slope pulls it back (`against`), up to as steep as
   * `steepest` (a share of its weight; some thirty-five degrees), the less the faster it already goes, none once it goes `climb`
   * metres a second and more and a half besides: so that it climbs at a walk, never stuck, rather than speeding up the hill. (Pushed
   * as on the flat, a slope of five degrees held it still, and one steeper slid it back to a stop.) And as much more as the deep snow
   * off the piste holds it back by (`DEEP`), which held it still on the flat. The strides drawn: `riderPose`, `horseRidePose`.
   */
  const SKATE = { below: 10 / 3.6, until: 25 / 3.6, push: 3.6, rate: 0.75, steepest: 0.57, climb: 2 };
  /** How much of each stride's push is pushed, on the average over the stride: the share its swell and fall make of it. */
  const STRIDE_SHARE = 0.375;
  /**
   * Skating asked for (asked: "add a skate button on top of 180 that player can hold to to accelerate faster. That button would perform
   * skating kicks to boost a little bit"): while *Skate* (or `Z`) is held, it skates at any speed, its strides quicker the faster it
   * goes, and each pushing it on the less from `full` (some 29 km/h), until at `fades` (some 86 km/h) they push it on no more: a little
   * more speed, not another engine. Not in the last moments up to a kicker's lip, where its stance makes the trick (`rideTrick`).
   */
  let skateHeld = false;
  const SKATE_BOOST = { full: 8, fades: 24, quicker: 0.6 };
  const skateNow = (dt: number, against = 0) => {
    // (Not on up past the top of the run, where its snow ends.)
    const can = mode === 'ride' && !flyingDemo && !carting && !ride.ended && ride.brake < 0.3 && !ride.turn180 && !(ride.down < -2 && Math.cos(ride.way) < 0);
    const boost = can && skateHeld && !rideTrick;
    if (!can || (!boost && ride.speed >= SKATE.until)) ride.skating = false;
    // (About an arena too, up the snow to the great one, as anywhere (asked: "Arena fights feel bad .. the player character keeps on
    // turning towards the quarterpipe with little speed"): it had not skated of itself there, so as to run out of speed and be turned.)
    else if (boost || ride.speed < SKATE.below) ride.skating = true;
    ride.skate += ((ride.skating ? 1 : 0) - ride.skate) * ease(dt, 4);
    const quick = 1 + SKATE_BOOST.quicker * smooth((ride.speed - SKATE.below) / (SKATE_BOOST.full * 1.2));
    if (ride.skate > 0.005) ride.stride = (ride.stride + dt * SKATE.rate * quick) % 1;
    // (Each leg's push over the first three quarters of its half of the stride, swelling and dying away; then drawn back in.)
    const q = (ride.stride % 0.5) / 0.5, swell = Math.sin(Math.PI * Math.min(1, q / 0.75)) ** 2;
    const uphill = Math.min(Math.max(0, against), G * SKATE.steepest) * (1 - smooth((ride.speed - SKATE.climb) / 1.5));
    const fading = 1 - smooth((ride.speed - SKATE_BOOST.full) / (SKATE_BOOST.fades - SKATE_BOOST.full));
    return ride.skating ? (SKATE.push * fading + uphill / STRIDE_SHARE) * swell : 0;
  };
  /**
   * Over the mountain's stones (asked: "does hitting rock or dirt should interrupt the skiing from smooth gliding appropriately"):
   * where the snow gives way to them, as the picture shows it (`land.snowAt`), off the marked piste for the most part. The skis grate on
   * them, held back as a ski's base is on stone, by half its weight (`grip`), if hardly at all going slowly (below `slow`), so that a
   * skier stopped among them can skate off; and the body is jarred as they go under it. Taken onto them fast, over more than a stride
   * or two of them (`catch` metres, at more than `fast`), an edge is caught and the skier thrown. Riding only: the demo runs keep to
   * the piste, and to what they were made to land.
   */
  const STONES = { grip: 0.5, slow: 6, fast: 13, catch: 2.5 };
  const stonesNow = (dt: number) => {
    const off = mode !== 'ride' || flyingDemo || carting || inside || !land.snowAt;
    const bare = off ? 0 : 1 - land.snowAt!(ride.x, ride.z);
    // (The skis reach on ahead of the boots and back behind them, the more on a horse's: a tip on the stones is out of the snow.)
    const go = along(ride.way, here), reach = who === 'person' ? 0.8 : 1.3;
    ride.bare = off ? 0 : Math.max(bare, 1 - land.snowAt!(ride.x + go.x * reach, ride.z + go.z * reach), 1 - land.snowAt!(ride.x - go.x * reach, ride.z - go.z * reach));
    ride.stones += (bare - ride.stones) * ease(dt, 12);
    ride.overStones = ride.stones > 0.5 ? ride.overStones + ride.speed * dt : Math.max(0, ride.overStones - 2 * ride.speed * dt);
    return ride.stones;
  };
  /**
   * Deep snow off the piste (asked: "can we make the player ski a bit deeper in the snow when off piste? leaving also deeper trails and
   * not accelerating so fast as on groomed piste"): beyond the groomed path's edge, as its grooming is drawn there (fading out over the
   * first few metres past the poles), and up past the top of the run, loose snow the skis sink into. Held back by it more than on the
   * groomed snow, by a share of its weight (`friction`) and by its speed squared (`drag`, the snow it ploughs through): slower to
   * gather speed, and slower at the most, some 55 km/h where the piste lets it run to 85. Sunk into it (`sink` metres; a horse,
   * heavier, `sinkHorse`), half as deep going fast (between `planes` metres a second), as skis plane on powder; throwing it up as it
   * goes, and leaving a broader, deeper trench (`layRide`, `stepSpray`). Not where stones lie bare: on them at once, as the snow
   * thins at their edge, wholly out of it where it is half bare, under the skis' tips and tails as under the boots (asked: "when hitting
   * rocky patch, it shouldn't ride under the rock surface though"; eased, the skier came out of deep snow onto the stones still sunk
   * in them a stride or two). Riding only, the demo runs keeping to the piste.
   */
  /** Whether what is ridden goes off the piste as a rider may: riding, or the showcase flown (whose way off the piste is in deep snow). */
  const wildRide = () => (flyingDemo ? demoKind === 'show' : mode === 'ride');
  const DEEP = { friction: 0.12, drag: 0.005, sink: 0.17, sinkHorse: 0.22, planes: [8, 20], horsePitch: (7 * Math.PI) / 180 };
  const deepNow = (dt: number) => {
    const [lo, hi] = land.edges(ride.down), out = Math.max(lo - ride.left, ride.left - hi, -4 - ride.down);
    const deep = !wildRide() || carting || inside ? 0 : smooth((out + 1) / 6) * (1 - ride.bare);
    ride.deep += (deep - ride.deep) * ease(dt, deep < ride.deep ? 25 : 4);
    return ride.deep;
  };
  /**
   * How far into powder the skier rides now, 0 to 1: as deep as it is, out of it where stones show. Its skis' tips plane up out of it
   * (asked: "bit of the skis should be visible in the deeper out piste skiing still, think how it could look"): a person's pitched up
   * about the balls of its feet (`RideControls.powder`), a horse, whose skis cannot be, carried a little nose up, its forelegs high,
   * as a horse bounds through deep snow (`horsePitch`).
   */
  const powderNow = () => ride.deep * smooth((0.5 - ride.bare) / 0.5);
  /** How far the skier is sunk into the snow now (metres). */
  const sunkNow = () => powderNow() * (who === 'person' ? DEEP.sink : DEEP.sinkHorse) * (1 - 0.5 * smooth((ride.speed - DEEP.planes[0]) / (DEEP.planes[1] - DEEP.planes[0])));
  /**
   * The trees (asked: "also can there be collision check with the trees"; "all trees are off piste"): ridden into, the skier is kept
   * out of a tree's trunk and the dense lower boughs about it (`Land.treeNear`), its breadth `person` metres either side of its middle
   * (a horse's, `horse`). Glancing off one, it goes on along it, as much slowed as it went into it; going into it faster than `hard`
   * metres a second (some 18 km/h head on), it is thrown. Flown into one below its top, thrown. Riding only: the demo runs keep to the
   * piste, where no tree stands.
   */
  const TREE = { person: 0.35, horse: 0.6, hard: 5 };
  const treeBody = () => (who === 'person' ? TREE.person : TREE.horse);
  /** Into a tree, going along `go`: kept out of it, turned along it and slowed, or thrown (giving back whether it was thrown). */
  const intoTree = (go: Vector3): boolean => {
    if (mode !== 'ride' || flyingDemo || carting) return false;
    const t = land.treeNear?.(ride.x, ride.z, treeBody());
    if (!t) return false;
    const n = new Vector3(ride.x - t.x, 0, ride.z - t.z), d = n.length();
    if (d > 1e-3) n.divideScalar(d); else n.copy(go).setY(0).normalize().negate();
    const into = -(go.x * n.x + go.z * n.z);
    ride.x = t.x + n.x * (t.r + treeBody()); ride.z = t.z + n.z * (t.r + treeBody());
    if (into <= 0) return false;
    if (ride.speed * into > TREE.hard) { fall('ran into a tree'); return true; }
    const slide = go.clone().setY(0).addScaledVector(n, into), share = slide.length();
    ride.speed *= share;
    if (share > 1e-3) ride.way = Math.atan2(slide.dot(runLeft(here)), slide.dot(runDir(here)));
    return false;
  };
  /** Into the cave's rock face, or what stands in its camp, as into a tree (`intoTree`): kept out of it, slowed, or thrown. */
  const intoRock = (go: Vector3): boolean => {
    const cave = caveNow();
    if (!cave || mode !== 'ride' || flyingDemo) return false;
    const o = land.group.position, w = cave.skiWall(ride.x - o.x, ride.z - o.z, treeBody());
    if (!w) return false;
    ride.x += w.nx * w.into; ride.z += w.nz * w.into;
    const into = -(go.x * w.nx + go.z * w.nz);
    if (into <= 0) return false;
    // (The rock face thrown into; what stands in the camp only bumped against, slowing.)
    if (ride.speed * into > TREE.hard && w.what === 'ran into the rock') { fall(w.what); return true; }
    const slide = go.clone().setY(0).addScaledVector(new Vector3(w.nx, 0, w.nz), into), share = slide.length();
    ride.speed *= share;
    if (share > 1e-3) ride.way = Math.atan2(slide.dot(runLeft(here)), slide.dot(runDir(here)));
    return false;
  };
  /** A run begun riding: pushed off with both poles, planted together. */
  const pushOff = () => { ride.shove = SHOVE.long; ride.flickL = ride.flickR = FLICK; };
  /** An angle brought within half a turn either way of nothing. */
  const wrapAngle = (a: number) => a - TURN * Math.round(a / TURN);
  /** Half a turn, when riding switch. */
  const switched = () => (ride.switch ? Math.PI : 0);
  /** Where the skier is against the run, as its last step left it. */
  let here: Frame = land.frame(0, 0);
  /**
   * How the last step posed the skier, on the snow or in the air; and whether to pose it at all (not while the demo run is flown,
   * but where a frame of it is kept).
   */
  let posed: { air: boolean; c: RideControls | AirControls } = { air: false, c: { s: 0, ski: 0, tuck: 0, brake: 0, tall: 0, flickL: 0, flickR: 0 } }, quiet = false;
  /**
   * In the air: what it is doing there (`air`, straight air; `flip`, a backflip; `flight`, a ski jumper's; `hop`, too short a time
   * in the air for anything), the spin and the flip it is to make and how far into them it is, how long it has been in the air and how
   * long it was to be, how fast it goes and which way, where it left the snow, and how far its nose was up over the land as it did.
   * And: how far the spin's axis is tipped (a cork); how fast it turns, as a share of the quickest (`rate`: paced to the time it has in
   * the air, as a skier sets a spin off the lip to come round just before the landing); how tall it stood and how far into its pop it
   * was as it left; how far into each style it is (`style`: a mute grab, a tail grab, a spread eagle, a flip laid out) and how long each
   * has been held (`held`); and when its turns were made, if they have been. And (asked: "make it also possible to ride switch or
   * land switch (180/540/900...)"): which way it spins and whether the spin is still being held, so that it goes on round another
   * half turn for as long as it is held; whether it left the lip riding switch. And (asked: "would double backflips and doublecorks be
   * possible? barrel rolls? add them if yes"): a barrel roll, the whole body rolled over sideways about the way it goes (`roll`,
   * `rollTo`; `rollAbout`); a double backflip, a flip of two turns; a double cork, a cork with two flips made through its spin.
   */
  type Style = 'mute' | 'tail' | 'spread' | 'layout';
  interface Air {
    kind: 'air' | 'flip' | 'flight' | 'hop' | 'roll'; spinTo: number; flipTo: number; spin: number; flip: number; roll: number; rollTo: number; rollFor: number;
    t: number; T: number; v: Vector3; from: Vector3; nose: number; name: string;
    cork: number; rate: { spin: number; flip: number }; set: number; pop0: number; style: Record<Style, number>; held: Record<Style, number>; done: number | null;
    spinDir: number; holding: boolean; fromSwitch: boolean;
  }
  const STYLES: Style[] = ['mute', 'tail', 'spread', 'layout'];
  /** How fast a spin and a flip go round at the quickest, untucked: turns a second. */
  const SPIN_RATE = 1.9, FLIP_RATE = 1.3;
  /**
   * How long before the snow a trick's turns are to come round (asked: "I think timings of tricks could be improved across the board so
   * that the tricks that can complete during the jump dont end up finishing the movement/rotation so much before landing"): each step its
   * spin and its flip paced to come round then, no slower than a fifth of the quickest. (They had been paced no slower than half, and a
   * spin of many turns flung round at the quickest off the lip, half a turn at a time as it was held, before it was paced at all: in a
   * long air every trick was round long before the snow, and hung there.)
   */
  // (Paced to come round 0.42 seconds before the snow, they come round some third of a second before it: each turn eases out over its
  // last part, and the time left is a little less than it is reckoned, the snow rising to meet it. Paced to a third, they came round with
  // a tenth of a second to spare, and some not quite round at all.)
  const TRICK_END = 0.42, SLOWEST = 0.2;
  /**
   * A barrel roll's going over (asked: "The barrel rolls look weeeird as f... make them more natural looking"): begun a moment off the
   * lip (`from`), and made over the time in the air but the last `left` seconds before the snow, no quicker than `least` and no slower
   * than `most`; eased in and out, quickest upside down; the body drawn up into a tuck (`tuck`) through the middle of it, as a skier
   * pulls its knees in to go round, and opened out again to land. (It had gone round as fast as a flip goes, the body held as it left the
   * lip: over in half a second, a log turned on a spit.)
   */
  const ROLL = { from: 0.1, left: 0.4, least: 0.75, most: 2.4, tuck: 0.9 };
  /** How far through a barrel roll it is at `t` seconds into the air, eased (0 to 1). */
  const rolledAt = (a: Air, t: number) => smooth((t - ROLL.from) / a.rollFor);
  /** How hard a turn is held to keep a spin going round. */
  const HOLD = 0.6;
  let air: Air | null = null;
  /** The air taken off a kicker's lip, while it lasts (not a knoll's, nor the arena's pipe's). */
  let kickerAir: Air | null = null;
  /**
   * The trick about to be made off the kicker ahead, by the demo run's pilot or for the rider (`rideTrick`): what the stance at the lip
   * cannot say of it, `takeOff` takes from it: a barrel roll, and a second flip.
   */
  let planned: DemoTrick | null = null;
  /** Gone limp, every body of it (a horse and its rider each their own), and why. */
  let crash: { dolls: { body: Body; doll: Ragdoll }[]; why: string; settled: number; anchors: Vector3[] } | null = null;
  /** The skier's bodies' joints as the last two steps left them, and how long the last step was: what a body gone limp goes on from. */
  let joints: Record<string, Vector3>[] | null = null, jointsBefore: Record<string, Vector3>[] | null = null, jointsDt = 1 / 120;
  /** What the rider asks: across (-1 to 1, to the right positive) and up (1 the deepest tuck, -1 standing tallest); and braking. */
  const ask = { x: 0, y: 0 }, want = { x: 0, y: 0, keys: { up: false, down: false, left: false, right: false }, brake: false, brakeKey: false, auto: false };
  /** Where the rider's thumb holds the stick: across (-1 to 1, to the right positive) and up (1 tucked, -1 standing straight). */
  const stick = { x: 0, y: 0 };
  /**
   * Where a mouse or a touchpad points over the picture, asking as the stick does; whether it has taken the skier (`on`: until then,
   * and once it is let go, the stick asks), and whether its button is held, braking.
   */
  const aim = { x: 0, y: 0, on: false, brake: false, px: 0, py: 0 };
  const FLICK = 0.3;
  /** Where across the range a turn begins to skid (it skids wholly at its end), and how far the skis are pivoted across the way then. */
  const SKID_FROM = 0.8, SKID_TURN = deg(38);
  /**
   * How hard a turn is held at `x` across the range (asked: "make the maximum carving angles larger"): as far as it is pushed, and out
   * past `CARVE_DEEP` twice as fast, up to where it skids, so that the deepest carve, higher on its edges, comes round more than a
   * quarter tighter than it did. (Short of `CARVE_DEEP` as it was, where the demo run's pilot carves between the kickers; only the
   * hard turn it sets a big spin off with on a ramp's last metres is carved harder and skidded less.)
   */
  const CARVE_DEEP = 0.68;
  const carveOf = (x: number) => x + Math.sign(x) * clamp(Math.abs(x) - CARVE_DEEP, 0, SKID_FROM - CARVE_DEEP);
  /** How long from now until something at `p` going at `v` comes down onto the snow, its weight bringing it down as it goes. */
  const timeToSnow = (p: Vector3, v: Vector3) => {
    const q = p.clone(), w = v.clone(), dt = 1 / 60;
    for (let t = dt; t < 6; t += dt) { w.y -= G * dt; q.addScaledVector(w, dt); if (q.y <= ground(q.x, q.z)) return t; }
    return 6;
  };
  const keepJoints = (dt: number) => { if (dt <= 0) return; jointsBefore = joints; joints = skier.bodies().map((b) => b.joints()); jointsDt = dt; };
  /**
   * Off the marked piste (asked: "can we allow the player to ski out of the marked piste? if they return back to track within 15 seconds
   * it's fine; when 5 seconds left, a count down should be shown that you need to return to the marked slopes"; "in menu there could
   * be an option to toggle between out of piste allowed or not"): riding, with *Off piste* allowed in the menu, the skier may go out
   * past the poles over the land about the run as far as it can be ridden (`Land.roam`, `reachAt`); not
   * watching, not driving the cart back up, not on the land turned inside out. Out past the poles, a clock runs (`OFF_PISTE`), and is
   * begun again each time it comes back between them; counted down on the picture from the moment it goes out, the more urgently over
   * its last `warn` seconds; run out, the skier is thrown back onto the piste (`backOnto`). Thirty seconds of it (asked: "maybe 30
   * second out of bounds can be allowed as climbing a hill up can be slow"; it had been fifteen).
   */
  const OFF_PISTE = { most: 30, warn: 5 };
  let offPisteOn = true, offPisteFor = 0;
  const offPisteOk = () => offPisteOn && mode === 'ride' && !flyingDemo && !carting && !inside;
  const offPisteEl = $('offPiste'), offPisteN = offPisteEl.querySelector<HTMLElement>('.n')!;
  /**
   * The clock off the piste a moment on (`dt`): run while the skier is out past the poles (on the snow or over it, not fallen, not at
   * the run's end), begun again when it comes back between them; the countdown shown for its last seconds; and, run out, the run over,
   * the skier braking to a stop and asked the way back to the top, as at the foot of the run.
   */
  /**
   * Out of bounds, where the run's end is to throw it (asked: "the out of bounds timer going off resulting transition should launch
   * the player to the nearest in piste location"): onto the nearest snow of the marked piste, as far down the run as it was (short of
   * its foot), a few metres in from the nearer edge, the run going on from there, its time and points kept (`endingFrom`, `resumeAt`).
   * Unset, the run's end throws it back to the top as it always has.
   */
  let backOnto: { s: number; left: number } | null = null;
  const stepOffPiste = (dt: number) => {
    const [lo, hi] = land.edges(ride.down), out = offPisteOk() && !foot && !stopping && !crash && !cat && !ride.ended && (ride.left < lo || ride.left > hi);
    offPisteFor = out ? offPisteFor + dt : 0;
    const left = OFF_PISTE.most - offPisteFor, late = out && left <= OFF_PISTE.warn;
    if (offPisteEl.hidden === out) offPisteEl.hidden = !out;
    offPisteEl.classList.toggle('late', late);
    if (out) say(offPisteN, String(Math.max(1, Math.ceil(left))));
    if (out && left <= 0) {
      // (Brought to a stop, and the run's end then throws it back onto the piste, `backOnto`.)
      const s = land.length === Infinity ? Math.max(5, ride.down) : clamp(ride.down, 5, land.length - 60), [a, b] = land.edges(s);
      backOnto = { s, left: clamp(ride.left, a + 4, b - 4) };
      ride.ended = true; offPisteFor = 0; offPisteEl.hidden = true;
      tell('Out of bounds', 'too long off the marked slopes: back onto them', true, 1e9);
    }
  };
  /** How far either side of the run's line the skier may go: the piste's edges, or, off it allowed, the snow's reach. */
  // (Off the piste allowed, no reach across the run at all (asked: "we can widen also the area how far the player can wander off piste;
  // probably no need for limits as there is the 15 second pull back?"): out over the land about the run as far as it can be ridden,
  // `Land.roam`, `keepOn`. It had been held to the run's own snow, some fifty metres either side of its line.)
  const reachAt = (s: number): [number, number] => (offPisteOk() || (flyingDemo && demoKind === 'show') ? [-1e6, 1e6] : land.edges(s));
  /**
   * Where the skier now is against the run: its way and its body's facing kept as they were in the world as the run's own way turns
   * under it; kept on the skiable path, inside its edges (or, off the piste allowed, the snow's reach) and between its top and its foot
   * (and, in the air, going no further out).
   */
  const keepOn = () => {
    let f = land.frame(ride.x, ride.z, ride.down);
    const [lo, hi] = reachAt(f.s), end = land.length + 20;
    if (f.left < lo + 1 || f.left > hi - 1 || f.s < -20 || f.s > end) {
      const s = clamp(f.s, -20, end), left = clamp(f.left, lo + 1, hi - 1), p = land.at(s, left);
      ride.x = p.x; ride.z = p.z;
      if (air && left !== f.left) { const out = runLeft(f).multiplyScalar(Math.sign(f.left - left)), o = air.v.dot(out); if (o > 0) air.v.addScaledVector(out, -o); }
      f = { ...f, s, left };
    }
    // (Off the piste, kept on the land that can be ridden: brought back a metre at a time toward the run's line until it is.)
    if (land.roam && !land.roam(ride.x, ride.z)) {
      for (let i = 1; i <= 80 && !land.roam(ride.x, ride.z); i++) { const p = land.at(f.s, f.left - Math.sign(f.left) * i); ride.x = p.x; ride.z = p.z; }
      f = land.frame(ride.x, ride.z, f.s);
    }
    const turned = Math.atan2(f.dx * here.dz - f.dz * here.dx, f.dx * here.dx + f.dz * here.dz);
    ride.way = wrapAngle(ride.way - turned); ride.facing -= turned;
    here = f; ride.down = f.s; ride.left = f.left;
  };

  /** The style a trick is known by: the one held longest, for a quarter of a second at least. */
  const styleOf = (a: Air): Style | '' => { let best: Style | '' = '', most = 0.25; for (const k of STYLES) if (a.held[k] > most) { best = k; most = a.held[k]; } return best; };
  /**
   * What a trick is called: by what it did off the lip (a spin, a flip, a cork, a flight) and the style it was known by. A horse's
   * grab is a whip and its spread eagle a capriole (on four short skis) or the splits (on a long pair); its rider's grab a superman,
   * and its spread eagle a no-hander.
   */
  const nameOf = (kind: Air['kind'], halves: number, cork: boolean, style: Style | '', fromSwitch = false, flips = kind === 'flip' ? 1 : 0) => {
    const named = nameOfTrick(kind, halves, cork, style, flips);
    return fromSwitch && kind !== 'hop' ? `Switch ${named.charAt(0).toLowerCase()}${named.slice(1)}` : named;
  };
  /** (A spin by how far it goes round, in half turns: a 180, a 540, a 900, which land switch, and a 360, a 720, which do not.) */
  const nameOfTrick = (kind: Air['kind'], halves: number, cork: boolean, style: Style | '', flips: number) => {
    const spin = halves ? `${halves * 180}` : '', horse_ = who !== 'person', rider_ = who === 'mounted';
    const grab = horse_ ? (rider_ ? 'superman whip' : 'whip') : '', four = horse.skis === 'four';
    if (kind === 'hop') return 'Hop';
    if (kind === 'flight') return 'Ski-jump flight';
    const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1), upper = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    if (kind === 'roll') {
      // (Twice over, a double barrel roll: a guidebook's.)
      const roll = flips > 1 ? 'Double barrel roll' : 'Barrel roll';
      if (style === 'mute' || style === 'tail') return horse_ ? `${roll} ${grab}` : `${roll} ${style === 'mute' ? 'mute' : 'tail grab'}`;
      return roll;
    }
    if (kind === 'flip') {
      // (A single backflip spun an odd number of half turns, landing switch, is a rodeo: a guidebook's.)
      const back = flips > 2 ? 'Triple backflip' : flips > 1 ? 'Double backflip' : 'Backflip', base = spin ? (flips === 1 && halves % 2 ? `Rodeo ${spin}` : `${back} ${spin}`) : back;
      if (style === 'layout') return `Layout ${lower(base)}`;
      if (style === 'mute' || style === 'tail') return horse_ ? `${upper(grab)} ${lower(base)}` : `${style === 'mute' ? 'Mute' : 'Tail grab'} ${lower(base)}`;
      return base;
    }
    const base = cork ? `${flips > 2 ? 'Triple cork' : flips > 1 ? 'Double cork' : 'Cork'} ${spin}` : spin;
    if (style === 'mute' || style === 'tail') return horse_ ? (base ? `${base} ${grab}` : upper(grab)) : base ? `${base} ${style === 'mute' ? 'mute' : 'tail grab'}` : style === 'mute' ? 'Mute grab' : 'Tail grab';
    if (style === 'spread' && !base) return horse_ ? `${four ? 'Capriole' : 'Splits'}${rider_ ? ' no-hander' : ''}` : 'Spread eagle';
    // (A horse's straight air is a show jumper's.)
    return base || (who === 'person' ? 'Straight air' : 'Show jump');
  };
  const halvesOf = (a: Air) => Math.round(Math.abs(a.spinTo) / Math.PI);
  const flipsOf = (a: Air) => Math.round(Math.abs(a.flipTo) / TURN);
  /** (A barrel roll's turns over, a double's two.) */
  const rollsOf = (a: Air) => Math.round(Math.abs(a.rollTo) / TURN);
  const trickName = (a: Air) => nameOf(a.kind, halvesOf(a), !!a.cork, styleOf(a), a.fromSwitch, a.kind === 'roll' ? rollsOf(a) : flipsOf(a));
  // What has just happened, said over the picture for a while: a landing, or a fall.
  let told = { text: '', small: '', bad: false, until: 0 };
  const tell = (text: string, small: string, bad: boolean, seconds: number) => { told = { text, small, bad, until: ride.time + seconds }; };

  // Points (asked: "add some kind of splashy hit markers / "score points" to show when hitting the orcs with the submachine; and also
  // scores for the jumps and tricks based on the trick complexity, air time and jump length"): won riding, counted at the top left, and
  // each thrown up over the picture where it was won. An orc shot down, a hundred, and a white cross where the round struck; run down,
  // a hundred and fifty; orcs downed one after another within a second and a half of each other, each worth as many times more as it
  // comes in the run of them (a double, a triple). A jump landed, by what was made of it: so much for each half turn of spin, more for
  // each flip, more for a cork, a grab held, taken off switch; all of it the more the longer it was in the air; and so much for each
  // metre it went. Begun again with each run.
  const popsEl = $('pops'), scoreEl = $('score'), bestEl = $('best');
  let score = 0, downedRun = 0, downedUntil = 0;
  /**
   * The most points won in one run on the slope now ridden (asked: "make potential identified improvements to the gameplay"): kept in
   * this browser, slope by slope, and shown beside the run's own; and what it was as this run began, to say when the run beats it.
   */
  let best = 0, bestBefore = 0;
  const showBest = () => say(bestEl, best <= 0 ? '' : score < best ? ` · best ${best.toLocaleString('en')}` : bestBefore > 0 ? ' · new best' : '');
  /** Where a point of the scene is over the picture, in pixels; none if it is behind the eye or well off the picture. */
  const overPictureAt = (p: Vector3): [number, number] | null => {
    const n = p.clone().project(camera);
    return n.z > 1 || Math.abs(n.x) > 1.1 || Math.abs(n.y) > 1.1 ? null : [((n.x + 1) / 2) * innerWidth, ((1 - n.y) / 2) * innerHeight];
  };
  /** Points thrown up over the picture at `at`, fading; and, under them, what they were for. */
  const popUp = (at: [number, number], text: string, kind: string, small = '') => {
    const el = document.createElement('div');
    el.className = `pop ${kind}`; el.textContent = text;
    if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
    el.style.left = `${at[0].toFixed(0)}px`; el.style.top = `${at[1].toFixed(0)}px`;
    el.addEventListener('animationend', () => el.remove());
    popsEl.appendChild(el);
  };
  /** A white cross where a round struck. */
  const hitMark = (at: [number, number]) => {
    const el = document.createElement('i');
    el.className = 'mark'; el.style.left = `${at[0].toFixed(0)}px`; el.style.top = `${at[1].toFixed(0)}px`;
    el.addEventListener('animationend', () => el.remove());
    popsEl.appendChild(el);
  };
  /** Points won riding, counted. */
  const addScore = (n: number) => {
    if (mode !== 'ride') return;
    score += n;
    if (score > best) { best = score; keep(`best.${landKind}`, String(best)); }
    showBest();
    scoreEl.textContent = score.toLocaleString('en');
    scoreEl.classList.remove('bump'); void scoreEl.offsetWidth; scoreEl.classList.add('bump');
  };
  /**
   * The run's end as the sheet at the foot says it, on a phone or a tablet (`stepRunEnd`): what became of it, and how far down and how
   * long it had gone when it did; and over the run, the tricks landed and what was found. Set as it ends, let go of as the next begins.
   */
  let runOver: { what: string; why: string; bad: boolean; drop: number; time: number } | null = null, tricksRun = 0;
  const foundRun: string[] = [];
  const resetScore = () => { tricksRun = 0; foundRun.length = 0; score = 0; downedRun = 0; downedUntil = 0; scoreEl.textContent = '0'; best = bestBefore = Math.max(0, Number(kept(`best.${landKind}`)) || 0); showBest(); };
  /** An orc downed at `p`: shot (the cross where it was struck), or run down; and the run of them it comes in. */
  /**
   * How many orcs the rider has brought down riding, over every run since the page was opened, which says what it carries
   * (`armAfter`, `slopeArms.ts`; asked: "the progression stays within the current session over repeated runs"): not kept in the
   * browser, and not the orc hunt's.
   */
  let slain = 0;
  /** How an orc was brought down: shot, run down, cut down with the sword (or cleft, by a cut held and let go full), burnt, struck by lightning, or blown up by a rocket. */
  type Downed = 'shot' | 'run' | 'slain' | 'cleaved' | 'burnt' | 'zapped' | 'blown';
  const orcDowned = (p: Vector3, how: Downed, foe: FoeKind) => {
    const clock = mode === 'ride' ? ride.time : t;
    downedRun = clock < downedUntil ? downedRun + 1 : 1;
    downedUntil = clock + 1.5;
    // (Up close, run down or cut down, worth half as much again as at a distance.)
    // (A foe harder to bring down worth more: a yeti five times an orc, `FOES`.)
    const close = how === 'run' || how === 'slain' || how === 'cleaved', pts = Math.round(((how === 'cleaved' ? 200 : close ? 150 : 100) * downedRun * foe.worth * (1 + kit().points)) / 10) * 10, at = overPictureAt(p), named = ['', '', 'double', 'triple', 'quad'][downedRun] ?? `${downedRun} in a row`;
    const said = { run: 'run down', slain: 'cut down', cleaved: 'cleaved', burnt: 'burnt', zapped: 'struck down', blown: 'blown up', shot: '' }[how];
    if (at) { if (how === 'shot') hitMark(at); popUp(at, `+${pts}`, close ? 'run' : 'shot', [foe.name, said, named].filter(Boolean).join(' · ')); }
    addScore(pts);
    // Riding, counted towards the next arm; and the next taken up, thrown up over the picture (and said, `armUp`).
    if (mode === 'ride') {
      const was = armAfter(slain).arm;
      slain++;
      const now = armAfter(slain).arm;
      if (now !== was && at) popUp([at[0], at[1] - 40], now.name, 'trick', `${slain} down`);
      // (The bazooka taken up: a weapon found and worn is carried from now on, said so.)
      if (now !== was && weaponsFree() && wornWeapon()) tell(`${wornWeapon()!.name}!`, 'the weapon you found, carried now that the bazooka is yours', false, 3.5);
      // (A great one leaves something behind it.)
      if (foe.titles) findLoot('boss', p, `left by ${horde.lastGreat || 'a great one'}`);
      earnWild(WILD.foe * foe.worth + (foe.titles ? WILD.great : 0));
    }
  };
  /** What a jump landed is worth: what was made of it, the more the longer in the air, and its length. */
  const trickPoints = (a: Air, far: number) => {
    const flips = flipsOf(a), grab = STYLES.reduce((g, s) => g + Math.min(1, a.held[s]), 0);
    // (A barrel roll as a flip; a second flip worth more than the first.)
    const made = 50 + 100 * halvesOf(a) + 400 * flips + 200 * Math.max(0, flips - 1) + 350 * rollsOf(a) + 200 * Math.max(0, rollsOf(a) - 1) + (a.cork ? 150 : 0) + 120 * Math.min(1.5, grab) + (a.fromSwitch ? 100 : 0);
    return Math.round(((made * (1 + 0.5 * a.t) + 3 * far) * (1 + kit().points)) / 10) * 10;
  };

  /**
   * A 180 on the snow, to switch and back again (asked: "add a single control to 180 to switch (and back), this could alternate between
   * pops, smooth and cool nose butters and some other cool "land tricks""): one control, *180* or `X`, and each time the next of four:
   * a pop 180, crouched and sprung up off the tails, turned in the air and landed; a nose butter, pressed up onto its skis' tips, the
   * tails lifted off the snow, pivoted round on the tips; a smooth 180, the skis slid round flat on the snow, scraping it; and a tail
   * butter, sat back onto the tails, the tips up, pivoted round on the tails. Each turns it half round, to switch or back from it; it
   * turns which way it is steering, or each way in turn.
   */
  const GROUND_180 = ['pop', 'nose', 'smooth', 'tail'] as const;
  type Ground180 = (typeof GROUND_180)[number];
  const G180: Record<Ground180, { T: number; name: string }> = {
    pop: { T: 0.62, name: 'Pop 180' }, nose: { T: 1.05, name: 'Nose butter 180' }, smooth: { T: 0.85, name: 'Smooth 180' }, tail: { T: 1.05, name: 'Tail butter 180' },
  };
  let next180 = 0;
  /** Begins the next ground 180, if it can be done now: on the snow and going, not on a kicker, not braking, not in one already. */
  const start180 = (dir?: number) => {
    if (foot) return false;
    if (air || crash || ride.turn180 || ride.speed < 3 || ride.brake > 0.3 || ride.out > 0.02) return false;
    const kind = GROUND_180[next180++ % GROUND_180.length];
    ride.turn180 = { kind, t: 0, dir: dir ?? (Math.abs(ask.x) > 0.2 ? -Math.sign(ask.x) : next180 % 2 ? 1 : -1) };
    tell(G180[kind].name, ride.switch ? 'back round from switch' : 'round to switch', false, 1.8);
    return true;
  };
  /**
   * A ground 180 at `p` (0 to 1) of the way through: how far round it is (0 to 1), how far pressed onto the tips (positive) or the
   * tails, how high it is sprung off the snow, how far its skis are tipped nose up (radians), how far it sinks at the knees, how far
   * its skis scrape the snow side on, and how much speed that costs it (metres a second, each second, side on).
   */
  const shape180 = (kind: Ground180, p: number) => {
    const bell = (a: number, b: number, c: number, d: number) => smooth((p - a) / (b - a)) * (1 - smooth((p - c) / (d - c)));
    if (kind === 'pop') {
      const q = clamp((p - 0.2) / 0.62, 0, 1);
      return { rot: smooth((p - 0.24) / 0.5), press: 0, lift: 0.34 * 4 * q * (1 - q), pitch: deg(9) * Math.sin(Math.PI * q), sink: 0.55 * bell(0, 0.12, 0.16, 0.24) + 0.3 * bell(0.2, 0.32, 0.68, 0.8) + 0.45 * bell(0.78, 0.85, 0.9, 1), scrape: 0, slow: 0 };
    }
    if (kind === 'smooth') return { rot: smooth((p - 0.04) / 0.86), press: 0, lift: 0, pitch: 0, sink: 0.35 * bell(0, 0.2, 0.8, 1), scrape: 1, slow: 3 };
    const press = bell(0, 0.18, 0.82, 1) * (kind === 'nose' ? 1 : -1);
    return { rot: smooth((p - 0.15) / 0.7), press, lift: 0, pitch: (kind === 'nose' ? -deg(17) : deg(15)) * Math.abs(press), sink: 0.15 * Math.abs(press), scrape: 0.5, slow: 2 };
  };

  /** The rider's wishes eased in: across and up, the tuck and standing tall, braking. */
  const easeAsk = (dt: number) => {
    // (Not while a trick is being made: it asks what it must, whatever the keys say.)
    const keys = want.keys, keyed = !want.auto && !isoRiding() && (keys.up || keys.down || keys.left || keys.right);
    // (An arrow key carves at first; held on, it pushes the turn out to the end of the range, into a skid, as the pointer does at
    // the edge of the ring.)
    ride.held = keys.left !== keys.right ? ride.held + dt : 0;
    const pushed = 0.62 + 0.38 * smooth((ride.held - 0.35) / 0.9);
    const tx = keyed ? ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * pushed : want.x, ty = keyed ? (keys.up ? 1 : 0) - (keys.down ? 1 : 0) : want.y;
    ask.x += (tx - ask.x) * ease(dt, 8);
    ask.y += (ty - ask.y) * ease(dt, 8);
    ride.tuck += (Math.max(0, ask.y) - ride.tuck) * ease(dt, 4);
    ride.tall += (Math.max(0, -ask.y) - ride.tall) * ease(dt, 4);
  };

  /**
   * Leaves the snow (the ground fell away under it faster than its weight can bring it down: off a kicker's lip, or its back, or the
   * crest of a knoll taken fast), going at `v`, its nose `nose` up over the land: what it does in the air is what it was doing as it
   * left, if it is to be in the air long enough for anything. Turning as it leaves, it spins that way: half a turn, turning a little;
   * turning hard, another half turn each time it comes within some two hundred degrees of where it is to stop for as long as the turn
   * is held hard (`holding`, in `stepAir`), so that let go it comes round to the next half turn ahead: a 180, a 540 or a 900 lands
   * it switch.
   */
  /**
   * Off the lip of an arena's pipe, going up its face (`Pipe.nearLip`): thrown straight up, as off a halfpipe's wall, rather than on
   * over its deck: what of its going was along the run, up the face, taken out, and a little given back the other way, so that it comes
   * down onto the face a metre or so under the lip, whatever its speed (it is up as long as it took to rise; the faster, the longer). And
   * set back off the lip by a hand, over the face. Its going across the run kept: carved across the pipe, it comes down further along it.
   */
  const pipeThrow = (v: Vector3) => {
    const a = arena;
    if (!a || a.sinking || mode !== 'ride' || flyingDemo) return;
    const f = land.frame(ride.x, ride.z, a.pipe.foot);
    if (!a.pipe.nearLip(f.s - a.pipe.foot, f.left - a.pipe.mid)) return;
    const rd = runDir(here), up = v.dot(rd);
    if (up <= 0 || v.y <= 1) return;
    const back = clamp(G / (2 * v.y), 0.15, 1);
    v.addScaledVector(rd, -up - back);
    ride.x -= rd.x * 0.35; ride.z -= rd.z * 0.35;
  };
  /**
   * Which way the body faces, going `way` (radians from straight down the run): a person's chest kept turned down the slope as it
   * crosses it, half as far round as its skis (a horse's, most of the way); and, past straight across, coming on round to face back up the
   * run once it goes straight up it. (Only the first, it had been turned sideways on, going straight back up the run, and turned the
   * other way side on as soon as it veered across the top.)
   */
  const chestTo = (way: number) => {
    const f = skier.facing, a = Math.abs(way), q = Math.PI / 2;
    return a <= q ? f * way : Math.sign(way) * (f * q + (a - q) * (2 - f));
  };
  /**
   * A booster taken (`Boosters`, in an arena): for a second and a half, a push on along the way the skier goes, dying away over its last
   * moments; some thirteen metres a second more, all told, enough to carry the skier back up to the great one.
   */
  const BOOSTER = { push: 10, last: 1.5 };
  let boostLeft = 0;
  const boostNow = (dt: number) => {
    if (boostLeft <= 0 || mode !== 'ride' || flyingDemo) return 0;
    boostLeft = Math.max(0, boostLeft - dt);
    return BOOSTER.push * smooth(boostLeft / 0.4);
  };
  const takeOff = (v: Vector3, nose: number, pop: number, plain = false) => {
    pipeThrow(v);
    if (!plain) soak(v);
    // (Boots found that spring: off a kicker's lip, so much more up; before the time in the air is reckoned, so that the trick chosen
    // is chosen for it.)
    if (!plain && ride.out > 0.01) v.y += kit().pop;
    const from = new Vector3(ride.x, ride.y, ride.z), T = timeToSnow(from, v), long = T > 0.5;
    // (Off a knoll, `plain`: not set off on purpose, so no spin and no flip, whatever the stick was asking as the snow fell away.)
    const spinning = !plain && long && Math.abs(ask.x) > 0.3, dir = spinning ? -Math.sign(ask.x) : 0;
    // (Tucked and turning, a cork: the spin laid over off its axis; tucked and straight, a ski jumper's flight.)
    const tucked = ride.tuck > 0.55, stance: Air['kind'] = !long ? 'hop' : tucked && !spinning ? 'flight' : ride.tall > 0.5 && !plain ? 'flip' : 'air';
    // (A barrel roll, set off straight and neither tucked nor tall; two flips for a double backflip or a double cork, as planned.)
    const plan = plain ? null : planned, cork = tucked && spinning && stance === 'air';
    const rolls = stance === 'air' && !spinning && plan?.kind === 'roll', kind: Air['kind'] = rolls ? 'roll' : stance;
    // (Three, for a triple backflip or a triple cork, which only a guidebook found in the caves teaches: `slopeLoot.ts`.)
    const flips = kind === 'flip' ? (plan?.kind === 'flip' ? clamp(plan.flips ?? 1, 1, 3) : 1) : cork && plan?.cork && (plan.flips ?? 0) > 1 ? Math.min(3, plan.flips!) : 0;
    // Paced to the time in the air: the flip set off the lip to be made a little before the snow, no slower than about half the
    // quickest (a long air) and no quicker than the quickest (a short one wants a tighter tuck to come round). (A spin is paced once
    // let go of, in `stepAir`.)
    const avail = Math.max(0.3, T - TRICK_END - 0.1), pace = (n: number, rate: number) => clamp(n / (rate * avail), SLOWEST, 1);
    air = {
      kind, spinTo: dir * Math.PI, flipTo: -flips * TURN, spin: 0, flip: 0, roll: 0, rollTo: rolls ? (plan?.side ?? 1) * TURN * clamp(plan?.flips ?? 1, 1, 2) : 0,
      rollFor: clamp(T - ROLL.from - ROLL.left, ROLL.least, ROLL.most), t: 0, T, v, from, nose, name: '',
      cork: cork ? deg(42) : 0, rate: { spin: 1, flip: pace(flips, FLIP_RATE) }, set: ride.tall, pop0: pop,
      style: { mute: 0, tail: 0, spread: 0, layout: 0 }, held: { mute: 0, tail: 0, spread: 0, layout: 0 }, done: spinning || flips || rolls ? null : 0,
      spinDir: dir, holding: spinning && Math.abs(ask.x) > HOLD, fromSwitch: ride.switch,
    };
    // (A trick done for the rider, or by the demo run's pilot, is known: its spin set its whole length off the lip, to be paced over the
    // air from the first, rather than held round half a turn at a time at the quickest.)
    if (spinning && plan && plan.halves > 0 && kind !== 'roll') { air.spinTo = dir * plan.halves * Math.PI; air.holding = false; }
    air.name = trickName(air);
    // (Off a kicker's lip, where the snow was raised under it the step before: what the slow motion is for, `SLOWMO`.)
    kickerAir = !plain && ride.out > 0.01 ? air : null;
  };

  /** Comes down onto the snow: landed, if the turns are near enough made and the blow (how fast it comes into the snow) not too hard; else gone limp. */
  /**
   * How hard a skier may come into the snow, metres a second across it, before it falls (asked: "You can increase a bit the limit when
   * a fall would happen also"): 14, where it had been 12.5.
   */
  const FALL_BLOW = 14;
  /** When the skier may next spring off a knoll (by `ride.time`): a moment after it last came down. (Or at once, on a run begun since, whose clock has gone back.) */
  let knollAfter = 0;
  const land_ = () => {
    const a = air!, up = normalAt(ride.x, ride.z, 0.5), into = a.v.dot(up), blow = Math.max(0, -into);
    const flipShort = Math.max(Math.abs(a.flipTo - a.flip), Math.abs(a.rollTo - a.roll)), spinShort = Math.abs(a.spinTo - a.spin);
    const far = Math.hypot(ride.x - a.from.x, ride.z - a.from.z);
    air = null;
    knollAfter = ride.time + KNOLL.after;
    // (Boots found that take a harder landing, or forgive a spin or a flip come up short.)
    const g = kit(), hard = FALL_BLOW + g.landing, short = deg(g.forgive);
    if (flipShort > deg(55) + short || spinShort > deg(75) + short || blow > hard) {
      const why = blow > hard ? 'landed too hard' : flipShort > deg(55) + short ? (flipShort > deg(200) ? (a.rollTo ? 'landed on its side' : 'landed on its back') : a.rollTo ? 'short of the roll' : 'short of the flip') : `short of the ${halvesOf(a) * 180}`;
      fall(why);
      return;
    }
    // (Going on as it was going, along the snow: what of its going was into the snow is taken up in the landing.)
    const along_ = a.v.clone().addScaledVector(up, -into);
    ride.speed = along_.length() * (blow > 9 ? 0.9 : 1);
    ride.way = Math.atan2(along_.dot(runLeft(here)), along_.dot(runDir(here)));
    ride.y = ground(ride.x, ride.z);
    ride.vy = risingHere();
    ride.out = bumpAt(ride.x, ride.z);
    ride.sink = clamp(0.35 + blow / 10, 0, 1);
    ride.pop = 0;
    ride.settle = { spin: a.spin - a.spinTo, flip: a.flip - a.flipTo, left: 0.25 };
    // (Its body's facing carried round by the spin it made, what is left of it to settle out of; switch, if it went round an odd
    // number of half turns.)
    ride.facing += a.spinTo;
    if (halvesOf(a) % 2) ride.switch = !ride.switch;
    if (a.kind !== 'hop') {
      const pts = trickPoints(a, far), at = overPictureAt(rider.position.clone().addScaledVector(UP, 1.2));
      tell(a.name, `+${pts.toLocaleString('en')} · ${far.toFixed(0)} m, ${a.t.toFixed(1)} s in the air`, false, 2.6);
      if (at) popUp(at, `+${pts.toLocaleString('en')}`, 'trick', a.name);
      addScore(pts);
      if (mode === 'ride' && !flyingDemo && !quiet) tricksRun++;
      earnWild(clamp(pts / WILD.trickPts, WILD.trick[0], WILD.trick[1]));
    }
  };

  /** Goes limp: the body goes on as it was going, turning as it was turning, from where its joints were. */
  const fall = (why: string) => {
    const bodies = skier.bodies(), now = bodies.map((b) => b.joints()), going = along(ride.way, here);
    crash = {
      dolls: bodies.map((body, i) => {
        let before = jointsBefore?.[i] ?? now[i];
        // (A rider is thrown on over the horse's head as the horse stops: given that much more of a start, forward and up.)
        if (i > 0) { const thrown = going.clone().multiplyScalar(1.5).addScaledVector(UP, 2.2).multiplyScalar(jointsDt); before = Object.fromEntries(Object.entries(before).map(([k, v]) => [k, v.clone().sub(thrown)])); }
        return { body, doll: new Ragdoll(body.spec, now[i], before, jointsDt, groundUnder) };
      }),
      why, settled: 0, anchors: [],
    };
    rider.position.set(0, 0, 0);
    rider.quaternion.identity();
    rider.updateMatrixWorld(true);
    // (Out of the saddle: its own body now, in the world.)
    if (who === 'mounted') rider.add(jockey.model);
    for (const { body, doll } of crash.dolls) body.poseJoints(doll.joints());
    earnWild(-WILD.fall);
    tell(`Crashed: ${why}`, `A new run in a moment, or ${document.body.classList.contains('mouse') ? 'click' : 'tap'}`, true, 1e9);
    if (mode === 'ride' && !flyingDemo && !quiet) runOver = { what: 'Crashed', why: why.charAt(0).toUpperCase() + why.slice(1), bad: true, drop: Number(downEl.textContent) || 0, time: ride.time };
    reflect();
  };

  /** How fast the skier rises going on along the snow as it lies where the skier is (falls, going down it). */
  const risingHere = () => {
    const go = along(ride.way, here), [gx, gz] = slopeAt(ride.x, ride.z, 1), rise = gx * go.x + gz * go.z;
    return (ride.speed * rise) / Math.hypot(1, rise);
  };
  /** Puts the skier at `down` along the run and `left` across it, on the snow, going on as the snow lies there. */
  const putAt = (down: number, left: number) => {
    const p = land.at(down, left);
    ride.x = p.x; ride.z = p.z;
    here = land.frame(p.x, p.z, down);
    ride.down = here.s; ride.left = here.left;
    ride.y = ground(p.x, p.z);
    ride.vy = risingHere();
  };
  /** The skier back at the top, going a little. */
  const resetRide = () => {
    runOver = null;
    leaveFoot();
    offPisteFor = 0; backOnto = null;
    Object.assign(ride, { shove: 0, way: 0, speed: 7, facing: 0, tuck: 0, tall: 0, brake: 0, lean: 0, leanSide: 0, flickL: 0, flickR: 0, time: 0, out: 0, absorb: 0, sink: 0, pop: 0, skid: 0, ended: false, held: 0, switch: false, flex: 0, back: 0, turn180: null, stones: 0, overStones: 0, bare: 0, deep: 0 });
    here = land.frame(0, 0);
    putAt(0, 0);
    ride.settle = { spin: 0, flip: 0, left: 0 };
    Object.assign(ask, { x: 0, y: 0 });
    air = null; crash = null; joints = jointsBefore = null;
    seat();
    told = { text: '', small: '', bad: false, until: 0 };
    next180 = 0;
    // (No trick left over from the run before: one chosen for a kicker further down, kept, held back every trick before it.)
    rideTrick = null; planned = null;
  };
  /** What the tommy gun leaves about to be cleared away for a new run: its orcs, their blood and its rounds in flight (set where it is made). */
  let clearGun: (() => void) | null = null;
  /** The run again from the top, going a little. */
  const restart = () => {
    caveNow()?.shutChest();
    // (What was found and not yet come to the player, given it now: nothing found is lost.)
    giveLeft();
    // (Come down at another run's top: that the run now, the old let go of.)
    if (trip?.swapped) arrive();
    // (The land as it lies first: the ride begins again at its top.)
    showEnding = false;
    unflip();
    resetScore();
    resetRide();
    levelTilt();
    endCatapult();
    newRideRun();
    clearSpray();
    clearGun?.();
    pushOff();
    placed = false;
    reflect();
  };

  // ---------------------------------------------------------------- riding off to another run
  /**
   * Another run chosen while riding (asked: "can we use these transitions also when switching a run? first we load the new run after
   * player selection while at the current spot, then transition then landing and remove old place from memory"): the new run's land
   * made where the rider is, riding on, the loading screen not shown; once it is made and the rider is on the snow, taken there by one of
   * the ways back to the top that carry it (the one the player keeps, if it is one, or one by chance; not the cart nor the land turned
   * inside out, which ride back up the run ridden): to the new run's top where it lies in the world, from the run ridden. Past halfway
   * the old land put away and the new one shown; down at its top, the run begun there, and the old one let go of.
   *
   * Each run's land is laid with its own top at the middle of the scene; so the new one is stood where it lies from the old one
   * (`shifted`), and stays there, the scene laid about the old run's top, until a run is chosen in the menu again.
   */
  let trip: { kind: LandKind; land: Land | null; base: Land | null; from: Land; way: Ending; top: Vector3; downhill: Vector3; started: boolean; swapped: boolean; start: Vector3 } | null = null;
  /** A land stood `off` from where it was laid: what it is asked and what it says moved by as much, and what is drawn of it. */
  const shiftedLand = (base: Land, off: Vector3): Land => {
    const group = new Group(), ox = off.x, oz = off.z, out = (p: Vector3) => p.clone().sub(off);
    group.position.copy(off);
    group.add(base.group);
    return {
      ...base, group,
      height: (x, z) => base.height(x - ox, z - oz),
      snowAt: base.snowAt && ((x, z) => base.snowAt!(x - ox, z - oz)),
      treeNear: base.treeNear && ((x, z, r) => { const t = base.treeNear!(x - ox, z - oz, r); return t && { ...t, x: t.x + ox, z: t.z + oz }; }),
      roam: base.roam && ((x, z) => base.roam!(x - ox, z - oz)),
      frame: (x, z, hint) => base.frame(x - ox, z - oz, hint),
      at: (s_, left) => { const a = base.at(s_, left); return { ...a, x: a.x + ox, z: a.z + oz }; },
      keepAbout: (x, z) => base.keepAbout(x - ox, z - oz),
      lod: base.lod && ((x, z) => base.lod!(x - ox, z - oz)),
      trees: base.trees && ((eye, seconds) => base.trees!(out(eye), seconds)),
    };
  };
  /** The ways that carry the rider through the air, which can take it to another run. */
  const carries = (e: Ending) => e !== 'invert' && e !== 'cart' && e !== 'revert';
  /** Off to run `kind`: its land made quietly where the rider is; the way there chosen. */
  const travelTo = async (kind: LandKind) => {
    const from = land, label = runs.find((r) => r.id === kind)?.label ?? kind;
    const rng = endRng.fork(`trip ${kind} ${ride.time.toFixed(2)}`), flying = ENDINGS.filter(carries);
    const way: Ending = backBy !== 'ask' && backBy !== 'random' && carries(backBy) ? backBy : rng.pick(flying);
    const mine = (trip = { kind, land: null, base: null, from, way, top: new Vector3(), downhill: new Vector3(), started: false, swapped: false, start: new Vector3() });
    // (Held while it is made, and said so, the card's wheel turning (asked: "it froze for a while after selecting the new location, it
    // didnt show that it is loading the other run"): made on a phone, each of its steps held the page for a second or more, the ride
    // jerking on between them, and the shaders made ready after them held it for seconds more, with nothing said.)
    makingFor(label);
    await loading.paint();
    loading.hush(true, (text) => makingStep(text));
    let base: Land;
    try { base = await landOf(kind); } catch (e) { makingDone(); throw e; } finally { loading.hush(false); }
    // (Broken off while it was made, by another run chosen, or watching: let be.)
    if (trip !== mine) { makingDone(); return; }
    makingStep('Making its shaders ready', 0.85);
    const fromTop = landTop, toTop = topOf.get(base);
    if (!fromTop || !toTop || land !== from) { makingDone(); trip = null; void setLand(kind); return; }
    // (Stood where it lies from the land ridden, as that one is stood.)
    const off = landShift.clone().add(toTop.clone().sub(fromTop)), stood = shiftedLand(base, off), top = stood.at(0, 0);
    stood.group.visible = false;
    scene.add(stood.group);
    Object.assign(trip, { land: stood, base, top: new Vector3(top.x, stood.height(top.x, top.z), top.z), downhill: runDir(stood.frame(top.x, top.z, 0)) });
    warmWith.add(stood.group);
    warmSoon();
  };
  /**
   * The card said while another run is made riding (`#making`): where to, what is being done and how far it has got; the ride held
   * meanwhile (and let go again only if it was going), until its land is made and its shaders ready (`stepMaking`).
   */
  const makingEl = $('making'), makingBar = makingEl.querySelector('.bar') as HTMLElement;
  let making: { held: boolean; k: number } | null = null;
  const makingFor = (label: string) => {
    if (making) makingDone();
    // (Held on a phone or a tablet, where it is slow to make; on a computer, ridden on as before, the card said all the same.)
    making = { held: touchHud && mode === 'ride' && playing, k: 0.08 };
    if (making.held) { playing = false; reflect(); }
    say($('makingWhat'), `Off to ${label}`);
    makingStep('Fetching the mountain', 0.08);
    makingEl.hidden = false;
  };
  const makingStep = (text: string, k?: number) => {
    if (!making) return;
    making.k = k ?? Math.min(0.75, making.k + 0.22);
    say($('makingStep'), text);
    makingBar.style.setProperty('--k', making.k.toFixed(3));
  };
  const makingDone = () => {
    if (!making) return;
    const held = making.held;
    making = null;
    makingEl.hidden = true;
    if (held && mode === 'ride' && !playing) { playing = true; reflect(); }
  };
  /** Each frame: once the run made is ready to be shown (its shaders made, or given up on), the card put away and the ride let go. */
  const stepMaking = () => {
    if (!making) return;
    if (!trip || mode !== 'ride') { makingDone(); return; }
    if (trip.land && !warmWanted && !warming) makingDone();
  };
  /**
   * Riding off to another run, a step on: once its land is made, and the rider is on the snow (or fallen), taken by the way chosen;
   * past halfway there, the old land put away and the new one shown.
   */
  const stepTravel = () => {
    const t = trip;
    if (!t?.land || mode !== 'ride') return;
    if (!t.started && !cat && !air && !carting && !inside && !foot && !stopping) {
      t.started = true; backOnto = null; ending = t.way;
      if (asking) hideAsk();
      told.until = 0;
      t.start.copy(focus());
      WAYS[t.way].begin();
      return;
    }
    if (t.started && !t.swapped && cat?.held && cat.at.distanceTo(t.top) < cat.at.distanceTo(t.start)) {
      // (The old land put away; the new one shown, lit as it is, its kickers its own.)
      t.from.group.visible = false;
      t.land.group.visible = true;
      land = t.land;
      clearRideTracks();
      sunFrom.set(...land.sun).normalize();
      sky.intensity = land.sky;
      uFogNear.value = land.fog[0]; uFogFar.value = land.fog[1];
      camera.far = land.fog[1] + 400;
      camera.updateProjectionMatrix();
      dropKickers();
      t.swapped = true;
    }
  };
  /**
   * A trip broken off (asked, of these: "for some reason the in world run change transitions dont trigger anymore"): past halfway, the
   * new run kept as the one ridden; before, put away and the old one shown again. Broken off and kept, a trip had held back every one
   * after it: another run chosen was laid at once, as when not riding.
   */
  const abortTrip = () => {
    const t = trip;
    if (!t) return;
    if (t.swapped) { arrive(); return; }
    trip = null;
    t.land?.group.removeFromParent();
    t.from.group.visible = true;
    if (!t.started) told.until = 0;
  };
  /** Down at the new run's top: it the run ridden now, the old one let go of. */
  const arrive = () => {
    const t = trip!, old = t.from;
    trip = null;
    landKind = t.kind;
    landShift = (t.land!.group.position as Vector3).clone();
    landTop = topOf.get(t.base!) ?? null;
    old.group.removeFromParent();
    for (const [key, l] of lands) if (l !== t.base && key !== 'groomed') { if (l.dispose) toLetGo.push(l.dispose); demos.delete(l); lands.delete(key); }
    demos.delete(old);
    for (const k of [...sliceTexts.keys()]) if (k !== t.kind) { sliceTexts.delete(k); fetching.delete(`${slices}${k}.json`); }
    buildFold();
    try { history.replaceState(null, '', t.kind === opensOn ? location.pathname + location.search : `#${t.kind}`); } catch { /* (not where the page may not change its address) */ }
  };
  /** Thrown back onto the piste out of bounds (`backOnto`), down there at `to`: the run going on from it, its time, points and tracks kept. */
  const resumeAt = (to: { s: number; left: number }) => {
    const time = ride.time;
    unflip();
    resetRide();
    ride.time = time;
    putAt(to.s, to.left);
    placeKickers(to.s);
    levelTilt();
    backOnto = null;
    endCatapult();
    clearSpray();
    pushOff();
    placed = false;
    tell('Back on the piste', 'the run goes on', false, 2.5);
    reflect();
  };

  // ---------------------------------------------------------------- the run's end: five ways back to the top, the throw and the parachute
  /**
   * A run over, riding (asked: "When player controlled run reaches end or the player falls show a 5 second countdown after which a new
   * run starts"; and then: "at the ending, instead of countdown to start a new run, add a huge robotic arm appearing from under the snow
   * that grabs the player (including possible horse) and throws them in an big arch back to the starting point of the track. A
   * parachute opens to ease the landing and a new round starts"). Once it has fallen and lain still, or come to a stop at the foot of
   * the world's run, an arm rises out of the snow beside it (`slopeArm.ts`), reaches over and takes it up in its claw, whatever it is: a
   * fallen horse and its rider, thrown apart, are gathered up together as the fingers close and the rider put back in the saddle. It
   * lifts it high, turns to the top of the run, draws it back and throws it; it flies back up the mountain in a great arch, tumbling,
   * and over the top of the run its parachute opens and lets it down there onto its skis, where the run begins again. A click, or
   * Enter, begins the new run at once.
   *
   * Or, the second way (asked: "another alternative could be hurricane / whirlwind starting to build up as the player approaches the end
   * and it grows to such a strong tornado that it throws the player back to beginning (And then the parachute landing)"): coming down
   * the last stretch of the run, a whirl of snow rises at its foot (`slopeStorm.ts`), and grows as the skier comes down to it into a
   * funnel under a dark turning cloud. Stopped at the foot, it comes over to it; ridden into, it takes it up there and then; fallen
   * anywhere, one forms beside it and comes for it. It carries it round and up its funnel, tumbling, and throws it out toward the top
   * of the run, the way the wind carries it.
   *
   * Or the third (asked: "add a third similarly back to start causing surprising effect: A huge explosion that shatters the ground
   * happens suddenly near the player and sends player to the same transition"): cracks run out glowing through the snow a few metres
   * from it, on the side away from the top of the run, and in a moment the ground there goes up (`slopeBlast.ts`), throwing it up and
   * away toward the top. And two more of the game's own (asked: "you get the idea maybe! come up with two additional ones on top of
   * these"): a flying saucer comes down out of the sky over it, takes it up in its beam, and carries it back in its beam to the top
   * and lets it down there (`slopeSaucer.ts`; asked then: "make the flying saucer transition to actually fly you back instead of throw"); or a snowman twenty metres high rises out of the snow beside it with a fir pulled up by the roots, and
   * drives it back up the mountain as a golfer drives a ball (`slopeSnowman.ts`). From there each as the arm's throw goes.
   *
   * Or the sixth (asked: "an earth inverting shock where the peaks inverts into a valley and player can ride back to the "top" and when
   * they reach it, the world inverts back to normal"): a shock through the ground, and the land turned inside out about the level the
   * skier stands at, folded over in a wave rolling out from under it across the mountains (`slopeInvert.ts`): the foot of the run is now
   * the height of the land, the top a hollow at the bottom of a pit where the peak was. Turned round, the skier rides the run back down
   * to its top; and there, stopped (or fallen anywhere on the way), the land folds back the right way up about it and the run begins
   * again at its top. Which of the six a run ends in is chosen by chance as it begins, each in turn in a shuffled round of them (on the
   * groomed slope, which has no top to ride back to, of the five others) (`__slope.ending` chooses).
   */
  const robot = new RobotArm(), chute = new Parachute(), whirl = new Tornado(), blast = new Blast(new Rng('blast')), saucer = new Saucer(), snowman = new Snowman(new Rng('snowman')), plane = new Plane(), iceJump = new IceJump(new Rng('ice jump'));
  const folding = new Folding(powderMap, snowMap), cart = new RocketCart();
  const armRng = new Rng('robot arm'), whirlRng = new Rng('whirlwind'), blastRng = new Rng('blast at'), saucerRng = new Rng('saucer flight'), snowmanRng = new Rng('snowman at');
  const endRng = new Rng('run end');
  scene.add(robot.group, chute.group, whirl.group, blast.group, saucer.group, snowman.group, folding.group, cart.group, plane.group, iceJump.group);
  /** The ways a run may end; and, not dealt, the land turned back the right way up once the run is ridden back to its top. */
  type Ending = 'arm' | 'whirlwind' | 'blast' | 'saucer' | 'snowman' | 'invert' | 'cart' | 'plane' | 'ice' | 'revert';
  const ENDINGS: Ending[] = ['arm', 'whirlwind', 'blast', 'saucer', 'snowman', 'invert', 'cart', 'plane', 'ice'];
  /** Whether a way back is ridden back up the run to its top: not on the groomed slope, which has no top to come back to. */
  const needsTop = (e: Ending | 'random' | null) => e === 'invert' || e === 'cart';
  /**
   * How the player would get back to the top as a run ends (asked: "add a dialog that shows at the end or after falling for the player
   * to choose how to get back to the beginning of a new run ... one option can also be the Random and there can be a check box
   * "Remember my choice" and if that is checked, the dialog is not shown anymore, but accessible via the menu to edit the choice"):
   * asked each time; one of the ways by chance; or one way, always. (*Back to the top* in the menu; kept in this browser.)
   */
  type Dealt = Exclude<Ending, 'revert'>;
  type BackBy = 'ask' | 'random' | Dealt;
  let backBy: BackBy = 'ask';
  /**
   * How the run now ridden ends (none yet, to be asked as it ends); how a run's end was asked for by a script (`__slope.ending`); the
   * ways yet to come in this round of them, how many rounds have been dealt, and the last way dealt. (By chance, each way once in every
   * round, in an order shuffled afresh each round, and never the same twice running: chosen each time by chance alone, one came up
   * eight times in twenty runs and another once.) Known as the run begins, the whirlwind gathers at its foot as it is ridden down to it;
   * asked for only at its end, it forms beside the skier then.
   */
  let ending: Ending | null = null, endingAsked: Ending | null = null, round: Ending[] = [], rounds = 0, dealt: Ending | null = null;
  const deal = (): Ending => {
    // (Passed over, on the groomed slope, the land turned inside out: it has no top to ride back to. A round dealt on a world's run may
    // be finished on it.)
    let e: Ending;
    do {
      if (!round.length) {
        const rng = endRng.fork(`round ${rounds++}`);
        round = ENDINGS.filter((w) => !needsTop(w) || land.length < Infinity);
        for (let i = round.length - 1; i > 0; i--) { const j = rng.int(0, i); [round[i], round[j]] = [round[j], round[i]]; }
        if (round[0] === dealt) [round[0], round[1]] = [round[1], round[0]];
      }
      e = round.shift()!;
    } while (needsTop(e) && land.length === Infinity);
    return (dealt = e);
  };
  const chooseEnding = () => {
    if (endingAsked) { ending = endingAsked; return; }
    ending = backBy === 'ask' ? null : backBy === 'random' || (needsTop(backBy) && land.length === Infinity) ? deal() : backBy;
  };
  // The question, as a run ends: each way, named and told in a few words, and by chance; and whether the choice is to be kept.
  const backToEl = $('backTo'), rememberWay = $<HTMLInputElement>('rememberWay');
  const WAY_NAMES: [Dealt | 'random', string, string][] = [
    ['arm', 'Robot arm', 'picked up and thrown'], ['whirlwind', 'Tornado', 'carried up and flung'], ['blast', 'Explosion', 'blown sky high'],
    ['saucer', 'Flying saucer', 'beamed up and flown back'], ['snowman', 'Snowman', 'driven like a golf ball'], ['invert', 'Inside out', 'ride the world upside down'],
    ['cart', 'Rocket cart', 'drive it back up'], ['plane', 'Airplane', 'hooked and dropped'], ['ice', 'Ice jump', 'a ski jump out of the ground'],
    ['random', 'Random', 'a surprise'],
  ];
  let asking = false;
  /** The menu's choice shown as it is (set where the menu is made). */
  let showBackBy = () => {};
  const takeWay = (w: Dealt | 'random') => {
    if (rememberWay.checked) { backBy = w; keep('backBy', w); showBackBy(); }
    ending = w === 'random' || (needsTop(w) && land.length === Infinity) ? deal() : w;
    hideAsk();
  };
  const wayButtons = WAY_NAMES.map(([w, name, line], k) => {
    const b = document.createElement('button'), title = document.createElement('b'), about = document.createElement('span');
    b.type = 'button'; b.title = `${name} (${k + 1})`; title.textContent = name; about.textContent = line;
    b.append(title, about); b.onclick = () => takeWay(w);
    backToEl.querySelector('.ways')!.appendChild(b);
    return b;
  });
  /** Asked, the run over: how to get back to the top (the land turned inside out not offered on the groomed slope). */
  const askWay = () => {
    if (asking) return;
    asking = true;
    wayButtons.forEach((b, k) => { b.hidden = needsTop(WAY_NAMES[k][0]) && (land.length === Infinity || !!backOnto); });
    say($('backToWhat'), backOnto ? 'Back onto the piste' : 'Back to the top');
    rememberWay.checked = false;
    backToEl.hidden = false;
    document.body.classList.add('asking');
  };
  function hideAsk() { if (!asking) return; asking = false; backToEl.hidden = true; document.body.classList.remove('asking'); }
  /** The way back chosen in the menu: for this run too, if it has not ended yet. */
  const setBackBy = (w: BackBy) => {
    backBy = w; keep('backBy', w); showBackBy();
    if (!cat && !inside && !endingAsked) { chooseEnding(); if (ending) hideAsk(); }
  };
  /** The arm's times, in seconds from when it begins to rise: risen; over what it is to take; down on it; closed on it; lifted; drawn back; let go. */
  const ARM_T = { risen: 1.3, over: 2.0, down: 2.25, closed: 2.65, lifted: 3.2, drawn: 3.95, sweep: 0.34, letGo: 0.24 };
  /** The arm's stance as it rises (folded up, the claw first), held high, and drawn back to throw; and thrown through. */
  const FOLDED = { upper: deg(95), fore: deg(82), claw: deg(88) }, HIGH = { upper: deg(86), fore: deg(48), claw: deg(-90) };
  const DRAWN = { upper: deg(140), fore: deg(190), claw: deg(-150) }, THROWN = { upper: deg(55), fore: deg(40), claw: deg(-310) };
  /**
   * The blast's times: when it goes off, the cracks having run out; and how long it throws what it takes up out of the fire before it
   * flies free (long enough to be seen thrown up out of it: let go as soon as it went off, the view went with it before the fire was seen).
   */
  const BLAST_T = { booms: 1.3, blown: 1.1 };
  /**
   * The saucer's: how long it takes to come down out of the sky; to shine its beam; to take it up; to let it down at the top; and to be
   * gone from there. (How long it flies there, by how far it is: `beginSaucer`.)
   */
  const SAUCER_T = { arrives: 2.6, beams: 0.45, rises: 2.6, lowers: 2.4, leaves: 1.3 };
  /** The snowman's: risen; the fir set behind what it is to drive; at the top of its swing; on it; through; sinking back; gone. */
  const SNOWMAN_T = { risen: 1.5, address: 2.0, top: 3.0, contact: 3.3, through: 3.95, sinks: 5.2, gone: 6.8 };
  /**
   * The land's turning over, either way (asked: "would it be possible to have it as an actual transition where to world transforms to
   * the inverted state, animated and all?"): the fold set going out after the shock; the skier turned round by; and the ride handed back,
   * as what is in sight is turned. Each point of the land takes a couple of seconds to turn over, beginning the later the further it is,
   * the fold going out at a kilometre a second and more: so that the land about the skier sinks and rises first, the peak at the top of
   * the run goes down into its pit after, and the far mountains after that, all of it seen going. (Gone out as a wave in a second and a
   * half, a few hundred metres wide, it was past before it was seen.)
   */
  const FLIP_T = { wave: 0.4, turned: 3.4, done: 4.6 }, FOLD = { speed: 1100, each: 2.4 };
  /**
   * The arm's own: where it stands and what it reaches for (the middle of what it takes, `grip`), which way that faces, and which way the
   * arm turns to take it and to throw it; its reach for it from over it and down on it, and the claw's turn about its axis to take it
   * square; and which side of it, across the run, it came up.
   */
  interface ArmTake {
    base: Vector3; grip: Vector3; facing: Vector3; yaw: { take: number; throw: number };
    over: { upper: number; fore: number }; on: { upper: number; fore: number }; roll: number; side: Vector3;
  }
  /**
   * The whirlwind's own: where its foot stood as it set out for what it takes, and where that lies (on the snow under its middle); how
   * strong it was as it began; when it sets out and when it gets there; how long it carries it round and up before it throws it, and how
   * high; where round its axis what it takes was as it was taken up, and how far out, and how many turns it is carried round (so many
   * that as it is let go the wind carries it toward the top of the run); and which side of its way the view stands.
   */
  interface WhirlTake { from: Vector3; to: Vector3; start: number; sets: number; reaches: number; lift: number; high: number; a: number; r: number; turns: number; side: number }
  /**
   * The blast's own: where it goes off, and where what it takes is (on the snow); the way, level, from it to what it takes, and toward
   * the top of the run; where the middle of what it takes was as it went off; and which side the view stands.
   */
  interface BlastTake { at: Vector3; on: Vector3; away: Vector3; toTop: Vector3; from: Vector3; side: number }
  /**
   * The saucer's own: where it comes in from, high and far off, and where it hovers, over what it takes (on the snow); the way toward the
   * top of the run, and which side the view stands; where the middle of what it takes was as the beam took it; and where it is now. And
   * its carry back (asked: "make the flying saucer transition to actually fly you back instead of throw"): when it sets off with it,
   * how long it flies, where it hovers over the top of the run to let it down, and how much higher than the straight way there it
   * climbs at the most (over the mountain between); when it lets it down, and when it is gone.
   */
  interface SaucerTake {
    from: Vector3; hover: Vector3; on: Vector3; toTop: Vector3; side: number; start: Vector3; at: Vector3;
    carries: number; flies: number; over: Vector3; climb: number; lowers: number; done: number;
  }
  /**
   * The plane's own (asked: "a small cessna style airplane flies above and catches player with a hook that is released at the
   * destination (or bit before) and the player drops to the destination"): where the hook comes in from and where it catches what it
   * takes (its middle), and where it lets it go, over the run short of the top; the way it flies there, level, and which side the view
   * stands; how fast it flies, and how much higher than the straight way it climbs at the most; when it catches it, when it lets go,
   * and when what it let go of is down; and the drop, worked out ahead: each step's height under where it was let go, how far on it has
   * gone, and when its canopy opens.
   */
  interface PlaneTake {
    from: Vector3; catches: Vector3; lets: Vector3; way: Vector3; side: number; speed: number; climb: number;
    caught: number; released: number; down: number; drop: { fall: number[]; on: number[]; opens: number };
  }
  /**
   * The ice jump's own (asked: "an ice column rises from below the player from inside ground into high heights along with a huge ski
   * jump slope (mäkihyppy) from where the player speeds down and jumps all the way to back"): where its tower stands (on the snow under
   * what it takes), the way its in-run goes, toward the top of the run, and which side the view stands; when it has risen, when what it
   * took drops into the in-run, and when it is off the table's lip.
   */
  interface IceTake { foot: Vector3; toward: Vector3; side: number; risen: number; drops: number; off: number; slide: number[] }
  /**
   * The snowman's own: where it stands, facing what it drives, and where its hands are risen; the fir's length from its hands to its
   * head; the plane of its swing (from its hands down to what it drives, and on toward the top of the run); the middle of what it drives;
   * the fir's angle as it meets it; and which way its middle turns as it swings toward the top.
   */
  interface SnowmanTake { base: Vector3; facing: Vector3; grip: Vector3; length: number; u: Vector3; v: Vector3; ball: Vector3; toTop: Vector3; meets: number; turn: number }
  /**
   * The land's turning over, either way: where it is turned about (on the snow under the skier); the way, level, the skier faced as it
   * began, and the way it is turned round to (down the run as it will be ridden); which side the view stands; and how far, turned back
   * the right way up, the land is left lower than it was (and the view and all moved up by as much, the run begun again).
   */
  interface FlipTake { on: Vector3; from: Vector3; to: Vector3; side: number; off: number }
  /** The rocket cart's own: where what it is brought to is (on the snow), where the cart comes down beside it, the way up the run there, which side the view stands, and how high the cart is now. */
  interface CartTake { on: Vector3; spot: Vector3; up: Vector3; side: number; high: number }
  /**
   * The run's end at work, from the moment it begins (`t`, seconds): which way it ends, and that way's own; when it has what it takes,
   * and when it gathers it up into the pose it is held in; what it takes as it took it (each body's joints, in the world, gone limp or
   * standing), and whether it has it; the flight from where it lets go, and how far into it; how what it held was turned as it let go of
   * it; where the run begins, and the way down it from there; how far down the run it is, and where its middle is; how it tumbles; the
   * view as it began, and as it is now, and how hard it is being shaken.
   */
  interface Catapult {
    t: number; by: Ending;
    arm: ArmTake | null; whirl: WhirlTake | null; blast: BlastTake | null; saucer: SaucerTake | null; snowman: SnowmanTake | null; plane: PlaneTake | null; ice: IceTake | null; flip: FlipTake | null; cart: CartTake | null;
    takes: number; gather: [number, number];
    from: Record<string, Vector3>[] | null; held: boolean;
    fly: Throw | null; flown: number; letGo: Quaternion; landing: Vector3; downhill: Vector3; down: number; at: Vector3;
    spun: { flip: number; spin: number } | null; tumble: { flip: number; spin: number };
    eye: { start: Vector3; look: Vector3; at: Vector3; off: Vector3; rel: Vector3; side: number; fov: number; started: boolean };
    shake: number;
    /** How long since it was let go. */
    loose: number;
  }
  const NONE = { arm: null, whirl: null, blast: null, saucer: null, snowman: null, flip: null, cart: null, plane: null, ice: null };
  let cat: Catapult | null = null;
  /** The parachute left on the snow at the top as the run begins, spent, for a while: where it came down, how long since, how big. */
  let spent: { riser: Vector3; up: Vector3; t: number; radius: number; reach: number; behind: Vector3 } | null = null;
  /**
   * How high the middle of what is taken stands over its skis' soles, where the claw holds it: a person by the chest, so that its legs
   * hang kicking below the fingers; a horse by its barrel.
   */
  const middleOf = () => (who === 'person' ? 1.3 : 1.22);
  /**
   * The parachute's measures for what it lets down: its canopy's radius and its lines' length; where its lines meet, over the skier's
   * shoulders, and the straps from there to the harness (a person's shoulders, the girth about a horse), in the skier's own frame.
   */
  const chuteOf = () => who === 'person'
    ? { radius: 3.4, reach: 4.4, riser: new Vector3(0, 1.98, -0.14), straps: [new Vector3(0.17, 1.42, -0.07), new Vector3(-0.17, 1.42, -0.07)] }
    : { radius: who === 'mounted' ? 5.3 : 4.7, reach: 5.6, riser: new Vector3(0, who === 'mounted' ? 3.1 : 2.2, 0), straps: [-1, 1].flatMap((x) => [-1, 1].map((z) => new Vector3(0.43 * x, 1.18, 0.52 * z))) };
  /** The turn that holds a skier upright, facing `fwd` (level). */
  const uprightTo = (fwd: Vector3) => { const f = fwd.clone().setY(0).normalize(), side = UP.clone().cross(f).normalize(); return new Quaternion().setFromRotationMatrix(basis.makeBasis(side, UP, f)); };
  /** In the claw: a skier's own frame against the claw's, its back to the palm, facing the claw's x. */
  const inClaw = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(0, -1, 0), new Vector3(0, 0, -1), new Vector3(1, 0, 0)));
  /** An angle on from `a` to `b` by `k`, along the shorter way round. */
  const turnTo = (a: number, b: number, k: number) => a + wrapAngle(b - a) * k;
  /** What it takes, where it lies or stands: a fallen horse and its rider both, from between them. */
  const takenAt = () => (crash ? crash.dolls.reduce((p, d) => p.add(d.doll.middle()), new Vector3()).divideScalar(crash.dolls.length) : rider.position.clone());
  /** What every run's end begins with, `down` the run with its middle at `at`: where the run begins and the way down it; the view as it is. */
  const endingFrom = (down: number, at: Vector3): Omit<Catapult, 'by' | 'arm' | 'whirl' | 'blast' | 'saucer' | 'snowman' | 'plane' | 'ice' | 'flip' | 'cart' | 'takes' | 'gather'> => {
    // (Out of bounds, the nearest snow of the marked piste instead of the top, `backOnto`.)
    const top = backOnto ? land.at(backOnto.s, backOnto.left) : land.at(0, 0);
    // (Riding off to another run, its top, where it lies: `trip`.)
    const landing = trip?.land ? trip.top.clone() : new Vector3(top.x, ground(top.x, top.z), top.z);
    const downhill = trip?.land ? trip.downhill.clone() : runDir(land.frame(top.x, top.z, backOnto?.s ?? 0));
    const look = camera.getWorldDirection(new Vector3()).multiplyScalar(10).add(camera.position);
    return {
      t: 0, from: null, held: false, fly: null, flown: 0, letGo: new Quaternion(), landing, downhill, down, at: at.clone(), spun: null, tumble: { flip: 0, spin: 0 },
      eye: { start: camera.position.clone(), look, at: camera.position.clone(), off: new Vector3(), rel: new Vector3(), side: 1, fov: camera.fov, started: false }, shake: 0, loose: 0,
    };
  };
  /**
   * What any way but the arm and the whirlwind begins with: what it takes, on the snow and its middle, and how far down the run; the
   * way toward the top of the run from it, level, and across that; and which side across it the snow lies lower, where the view stands
   * (on the higher, it looked down on it all from up the side of the valley).
   */
  const takenFor = () => {
    const at = takenAt(), on = at.clone().setY(ground(at.x, at.z)), f = land.frame(on.x, on.z, ride.down), begun = endingFrom(f.s, on.clone().addScaledVector(UP, middleOf()));
    const toTop = begun.landing.clone().sub(on).setY(0);
    if (toTop.lengthSq() < 1) toTop.copy(begun.downhill).negate();
    toTop.normalize();
    const across = toTop.clone().cross(UP), lowAt = (k: number) => { const p = on.clone().addScaledVector(across, 35 * k); return ground(p.x, p.z); };
    return { on, f, begun, toTop, across, side: lowAt(1) <= lowAt(-1) ? 1 : -1 };
  };

  const beginArm = () => {
    const rng = armRng.fork(`take ${ride.down.toFixed(1)} ${ride.time.toFixed(2)}`), f = land.frame(focus().x, focus().z, ride.down);
    const at = takenAt(), grip = at.clone().setY(ground(at.x, at.z) + middleOf() + 0.12);
    const facing = along(ride.way, f).setY(0).normalize();
    // The arm comes up beside it, on the side nearer the middle of the run, and a little further down it.
    const side = runLeft(f).multiplyScalar(f.left > 0 ? -1 : 1), base = grip.clone().addScaledVector(side, 7.6).addScaledVector(runDir(f), rng.range(1.5, 3.5));
    base.y = ground(base.x, base.z);
    const take = Math.atan2(grip.x - base.x, grip.z - base.z), ahead = Math.hypot(grip.x - base.x, grip.z - base.z);
    const shoulder = base.y + ARM.shoulder, over = reachFor(ahead, grip.y + ARM.grip + 1.8 - shoulder), on = reachFor(ahead, grip.y + ARM.grip - shoulder);
    const begun = endingFrom(f.s, grip);
    // (The claw turned about its axis so that what it takes lies square in it, facing the claw's x.)
    robot.place(base, ground, rng);
    robot.pose({ rise: 1, yaw: take, ...on, claw: -Math.PI / 2, roll: 0, grip: 0, hold: 0 });
    const q = robot.clawTurn(), x = new Vector3(1, 0, 0).applyQuaternion(q), z = new Vector3(0, 0, 1).applyQuaternion(q), fp = facing.clone().addScaledVector(z, -facing.dot(z)).normalize();
    const roll = Math.atan2(x.clone().cross(fp).dot(z), x.dot(fp));
    const throwYaw = begun.landing.distanceTo(base) > 2 ? Math.atan2(begun.landing.x - base.x, begun.landing.z - base.z) : take + Math.PI;
    cat = { ...begun, by: 'arm', ...NONE, arm: { base, grip, facing, yaw: { take, throw: throwYaw }, over, on, roll, side }, takes: ARM_T.over, gather: [ARM_T.down - 0.1, ARM_T.closed] };
    robot.pose(armPose(0));
  };
  /**
   * The whirlwind come for what it takes: the one gathering at the foot of the run, if it stands near enough, or one forming beside
   * it, toward the middle of the run and a little further down. Ridden into, it takes it up there and then.
   */
  const beginWhirl = () => {
    const rng = whirlRng.fork(`take ${ride.down.toFixed(1)} ${ride.time.toFixed(2)}`), at = takenAt(), to = at.clone().setY(ground(at.x, at.z));
    const f = land.frame(to.x, to.z, ride.down), flat = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
    if (!whirl.group.visible || flat(whirl.base, to) > 90) {
      const side = runLeft(f).multiplyScalar(f.left > 0 ? -1 : 1), p = to.clone().addScaledVector(side, rng.range(26, 34)).addScaledVector(runDir(f), rng.range(4, 12));
      whirl.hide(); whirl.strength = 0.02; whirl.place(p.setY(ground(p.x, p.z)));
    }
    dying.copy(runDir(f)).multiplyScalar(4);
    // (Weak, it gathers a moment before it sets out; it comes at a fast run.)
    const d = flat(whirl.base, to), into = d < whirl.radiusAt(0) + 2;
    const sets = into ? 0 : whirl.strength < 0.35 ? 1.6 : 0.3, reaches = into ? 0 : sets + clamp(d / 11, 1.2, 4), takes = Math.max(0, reaches - 0.3);
    const w: WhirlTake = { from: whirl.base.clone(), to: into ? whirl.base.clone() : to, start: whirl.strength, sets, reaches, lift: 4.4, high: rng.range(38, 46), a: 0, r: 0, turns: 2, side: 1 };
    // (The view stood off to whichever side of the whirlwind's way the snow lies lower: on the higher, it looked down on it all from up
    // the side of the valley.)
    const way = w.to.clone().sub(w.from).setY(0), across = (way.lengthSq() > 1 ? way : runDir(f)).normalize().cross(UP);
    const lowAt = (k: number) => { const p = to.clone().addScaledVector(across, 45 * k); return ground(p.x, p.z); };
    w.side = lowAt(1) <= lowAt(-1) ? 1 : -1;
    cat = { ...endingFrom(f.s, at.clone().setY(to.y + middleOf())), by: 'whirlwind', ...NONE, whirl: w, takes, gather: [takes, takes + 0.55] };
  };
  /** The blast laid a few metres from what it takes, on the side away from the top of the run, so that it throws it toward the top. */
  const beginBlast = () => {
    const rng = blastRng.fork(`take ${ride.down.toFixed(1)} ${ride.time.toFixed(2)}`), { on, begun, toTop, across, side } = takenFor();
    const at = on.clone().addScaledVector(toTop, -rng.range(6, 8)).addScaledVector(across, rng.range(-3, 3));
    at.y = ground(at.x, at.z);
    blast.lay(at, ground, rng.fork('blast'));
    const away = on.clone().sub(at).setY(0).normalize().add(toTop).normalize();
    cat = { ...begun, by: 'blast', ...NONE, blast: { at, on, away, toTop, from: begun.at.clone(), side }, takes: BLAST_T.booms, gather: [BLAST_T.booms, BLAST_T.booms + 0.3] };
  };
  /** The saucer come down out of the sky from far off over the valley, to hover over what it takes. */
  const beginSaucer = () => {
    const rng = saucerRng.fork(`take ${ride.down.toFixed(1)} ${ride.time.toFixed(2)}`), { on, begun, toTop, across, side } = takenFor();
    const hover = on.clone().addScaledVector(UP, 24);
    // (From beyond what it takes, as the view looks: seen coming all the way.)
    const from = hover.clone().addScaledVector(across, -side * rng.range(200, 260)).addScaledVector(toTop, rng.range(-80, 80)).addScaledVector(UP, rng.range(120, 170));
    const takes = SAUCER_T.arrives + SAUCER_T.beams, carries = takes + SAUCER_T.rises;
    // (Over the top of the run, as high over it as it hovered here; there as quickly as a few seconds and the way's length allow; and
    // high enough all the way to pass over the mountain between, forty metres clear of it.)
    const over = begun.landing.clone().addScaledVector(UP, 24), far = Math.hypot(over.x - hover.x, over.z - hover.z), flies = clamp(3 + far / 260, 4, 9);
    let climb = 0;
    for (let k = 0.05; k < 0.96; k += 0.05) {
      const p = hover.clone().lerp(over, k), lift = ground(p.x, p.z) + 40 + SAUCER.belly + middleOf() + 1.4 - p.y;
      climb = Math.max(climb, lift / Math.sin(Math.PI * k));
    }
    const lowers = carries + flies, done = lowers + SAUCER_T.lowers + SAUCER_T.leaves;
    saucer.place(from, new Quaternion());
    cat = {
      ...begun, by: 'saucer', ...NONE, takes, gather: [takes, takes + 0.8],
      saucer: { from, hover, on, toTop, side, start: begun.at.clone(), at: from.clone(), carries, flies, over, climb, lowers, done },
    };
  };
  /** Where the saucer is on its way back with what it took, `k` of the way (0 to 1): the straight way, and climbed over what lies between. */
  const saucerWay = (s: SaucerTake, k: number) => s.hover.clone().lerp(s.over, k).addScaledVector(UP, s.climb * Math.sin(Math.PI * k));
  /** How far along its way back the saucer is at `t`: eased off and slowing again to a hover. */
  const saucerAlong = (s: SaucerTake, t: number) => { const u = clamp((t - s.carries) / s.flies, 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };
  /** Let down at the top, the saucer gone: the run begun again there (or on the piste, thrown out of bounds). */
  const finishSaucer = (c: Catapult): Now => {
    const eye = camera.position.clone(), look = c.eye.look.clone(), onto = backOnto, wasShow = showEnding;
    if (onto) resumeAt(onto); else restart();
    if (wasShow) showBack = 1.4;
    handOver(eye, look, c.downhill);
    return { down: ride.down, left: ride.left, speed: ride.speed, way: 0, ski: 0, skid: 0, tuck: 0, brake: 0 };
  };
  /**
   * The ice jump's: how long its tower takes to rise; how long it stands there risen before what it took drops in; how quickly that
   * gathers speed down the in-run (metres a second, each second); and how high over its foot the tower is built at the least, and
   * clear of the land under the table at the least.
   */
  // (Twice as tall as it need be for its table to stand clear of the land, and a hundred and ten metres at the least (asked: "the ski
  // jump transition needs to be 2x higher"); rising the longer for it.)
  // (And how the in-run's last part gathers the more speed, over what gravity gives, to leave the lip as fast as the throw flies off it
  // (asked: "make the speed that the player accelerates to in the ski jump slope by the end of the run in match the speed that the player
  // gets then sent flying"): to the power of how far down it is, so that it comes most at the curve and the table. And how finely the
  // slide is laid out in time.)
  const ICE_T = { rises: 4.0, waits: 0.7, pull: 7.5, least: 110, clear: 14, taller: 2, boost: 3, step: 1 / 120 };
  /**
   * The in-run slid, `length` metres to the lip, leaving it at `last` metres a second: how far down the track it is at each step of time
   * after it drops in. As a body slides down a slope (more gently, if even that would leave it faster than the throw flies: a short throw
   * off the lip, a slower slide to it), and, for a long throw, gathering speed on over that, the more the further down it is, until it
   * leaves the lip as fast as the throw flies off it.
   */
  const inrunOf = (length: number, last: number) => {
    const pull = Math.min(ICE_T.pull, (last * last) / (2 * length)), gain = Math.max(0, last - Math.sqrt(2 * pull * length)), slide = [0];
    for (let s = 0; s < length && slide.length < 30 / ICE_T.step; ) {
      s += (Math.sqrt(2 * pull * Math.max(s, 0.02)) + gain * (s / length) ** ICE_T.boost) * ICE_T.step;
      slide.push(Math.min(s, length));
    }
    return slide;
  };
  /** The ice jump's tower risen under what it takes, its in-run toward the top of the run, so tall that the table stands clear of the land under it. */
  const beginIce = () => {
    const { on, begun, toTop, side } = takenFor();
    // (Its table so far along the way to the top as the in-run reaches, and that much higher, the land rising toward the top.)
    const reach = ICE.inrun * Math.cos(ICE.steep) + ICE.curve + ICE.flat, drop = ICE.inrun * Math.sin(ICE.steep) + ICE.curve * Math.sin((ICE.steep + ICE.table) / 2) + ICE.flat * Math.sin(ICE.table);
    let rises = 0;
    for (let k = 0.2; k <= 1.001; k += 0.2) { const q = on.clone().addScaledVector(toTop, reach * k); rises = Math.max(rises, ground(q.x, q.z) - on.y); }
    iceJump.build(Math.max(ICE_T.least, ICE_T.taller * (rises + drop + ICE_T.clear)));
    // (How fast the throw will fly off the lip, from where the lip will stand once it is risen, to where it comes down.)
    iceJump.place(on, toTop, 1);
    const lip = iceJump.track(iceJump.length).at.addScaledVector(UP, middleOf());
    const leaves = new Throw(lip, begun.landing.clone().addScaledVector(UP, middleOf()), begun.downhill.clone().negate()).velocity(0).length();
    iceJump.place(on, toTop, 0);
    const slide = inrunOf(iceJump.length, leaves), risen = ICE_T.rises, drops = risen + ICE_T.waits, off = drops + (slide.length - 1) * ICE_T.step;
    cat = { ...begun, by: 'ice', ...NONE, ice: { foot: on.clone(), toward: toTop.clone(), side, risen, drops, off, slide }, takes: 0.15, gather: [0.15, 0.7] };
  };
  /** The ice jump a step on: rising out of the snow, snow and ice thrown up about its foot as it does; then standing. */
  const iceStep = (c: Catapult, dt: number) => {
    const k = c.ice!, rise = smooth(c.t / k.risen);
    iceJump.place(k.foot, k.toward, rise);
    if (dt > 0 && rise > 0.01 && rise < 0.97) snowBurst(k.foot, ICE.column + 2.5, Math.round(dt * 260), 6);
    if (c.t > k.off + 5) iceJump.hide();
  };
  /**
   * What the ice jump took: stood on its tower's top as it rises, facing down the in-run; dropped in, crouched as a ski jumper is in the
   * in-run, sliding down the track faster and faster to the table's lip.
   */
  const iceHold = (c: Catapult) => {
    const k = c.ice!, mid = middleOf();
    const f = clamp((c.t - k.drops) / ICE_T.step, 0, k.slide.length - 1), i = Math.floor(f), j = Math.min(i + 1, k.slide.length - 1);
    const s = k.slide[i] + (k.slide[j] - k.slide[i]) * (f - i), { at, dir } = iceJump.track(s);
    const left = UP.clone().cross(dir).normalize(), up = dir.clone().cross(left).normalize();
    rider.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(left, up, dir));
    rider.position.copy(at);
    rider.updateMatrixWorld(true);
    const inrun = smooth((c.t - k.drops + 0.4) / 0.5);
    skier.ride({ s: 0, ski: 0, tuck: inrun, brake: 0, tall: 0.3 * (1 - inrun), flickL: 0, flickR: 0 });
    return at.clone().addScaledVector(up, mid);
  };
  /**
   * The ice jump's shots: from off to the side and a little up the run, low, the tower rising out of the snow with what it took on top;
   * then alongside the in-run, looking down it, what it took dropping in and speeding down to the lip. (Off the lip, as the throw is.)
   */
  const iceShot = (c: Catapult, dt: number) => {
    const k = c.ice!, e = c.eye, mid = c.at, across = k.toward.clone().cross(UP).multiplyScalar(k.side);
    const tall = iceJump.tall, rise = smooth(c.t / k.risen);
    const want = standCamera(k.foot.clone().addScaledVector(across, 42 + 0.4 * tall).addScaledVector(k.toward, 18).addScaledVector(UP, 4), 2, k.foot);
    const target = k.foot.clone().addScaledVector(UP, 0.6 * tall * rise + 2);
    const eye = e.start.clone().lerp(want, smooth(c.t / 1.3));
    // (Down the in-run: from the side of it, a little behind and well above what slides down it, kept along with it: from lower, the rail
    // along the deck's edge hid a skier crouched in the in-run.)
    const slide = smooth((c.t - k.drops + 0.6) / 1.2), alongside = mid.clone().addScaledVector(across, 14).addScaledVector(k.toward, -10).addScaledVector(UP, 9);
    // (Not inside the tower: kept out from its axis.)
    const fromAxis = alongside.clone().sub(k.foot).setY(0), most = ICE.column + 6;
    if (fromAxis.length() < most) alongside.addScaledVector(fromAxis.lengthSq() > 1e-4 ? fromAxis.normalize() : across, most - fromAxis.length());
    eye.lerp(alongside, slide);
    target.lerp(mid.clone().addScaledVector(k.toward, 6), slide);
    e.at.copy(eye);
    if (!e.started) e.rel.copy(e.look).sub(mid);
    e.rel.lerp(target.sub(mid), ease(dt, 4) * turnIn(c));
    e.look.copy(mid).add(e.rel);
    camera.position.copy(e.at);
    const g = ground(mid.x, mid.z);
    return mid.y - g > 30 ? mid.clone().setY(g) : mid.clone();
  };
  /**
   * The plane's: how long it comes in over before it catches; how far its line trails back from straight down as it flies (radians);
   * how high over the top of the run it lets go; how long what it lets go of falls before its canopy opens; and how long the plane flies
   * on after it is down, before the run begins.
   */
  const PLANE_T = { comes: 3.6, trail: 0.3, over: 40, free: 1.0, after: 0.6, sink: 9 };
  /** How far over its middle the hook takes what it catches: a person by the harness between its shoulders, a horse by its saddle. */
  const hangOf = () => (who === 'person' ? 0.45 : 0.95);
  /** Where the plane's hook is at `t`: coming in, straight and level; carrying, climbing away over the land between and on; let go, on and up. */
  const hookAt = (p: PlaneTake, t: number) => {
    if (t < p.caught) return p.from.clone().lerp(p.catches, t / p.caught);
    if (t < p.released) { const u = (t - p.caught) / (p.released - p.caught); return p.catches.clone().lerp(p.lets, u).addScaledVector(UP, p.climb * Math.sin(Math.PI * u)); }
    const after = t - p.released;
    return p.lets.clone().addScaledVector(p.way, p.speed * after).addScaledVector(UP, 6 * after + 2 * after * after);
  };
  /**
   * Drops what it lets go of, as it is let go of going `speed` along the way: where it is under the point it was let go `t` seconds
   * after, as a step's height under it and how far on (`drop`), until it is down on the snow `high` metres under where it was let go.
   * Falling free at first, going on as the air slows it; then its canopy opening, the fall taken out of it and the way on slowed, as
   * the arm's throw's canopy does (`Throw`), down slowly the last few metres.
   */
  const dropFrom = (speed: number, high: number) => {
    const dt = 1 / 120, fall = [0], on = [0];
    let y = 0, x = 0, vy = 0, vx = speed, t = 0;
    while (y < high && fall.length < 120 * 40) {
      t += dt;
      if (t < PLANE_T.free) { vy += G * dt; vx *= Math.exp(-dt / 2.5); }
      else { const left = high - y, want = left > 6 ? PLANE_T.sink : 2.4 + (PLANE_T.sink - 2.4) * (left / 6); vy += (want - vy) * (1 - Math.exp(-3.4 * dt)); vx *= Math.exp(-1.7 * dt); }
      y = Math.min(high, y + vy * dt); x += vx * dt;
      fall.push(y); on.push(x);
    }
    return { fall, on, opens: PLANE_T.free };
  };
  /**
   * The plane come in low from down the run, flying toward its top, its hook at the height of what it takes: to snag it as it passes
   * over, carry it away up the mountain hanging from its line, and let it go short of the top, so far short that its fall and its
   * canopy bring it down there.
   */
  const beginPlane = () => {
    const { on, begun, toTop, across, side } = takenFor(), mid = middleOf();
    const hang = hangOf(), catches = on.clone().addScaledVector(UP, mid + hang), over = begun.landing.clone().addScaledVector(UP, mid + PLANE_T.over);
    const way = over.clone().sub(catches).setY(0);
    if (way.lengthSq() < 1) way.copy(toTop);
    way.normalize();
    const far = Math.hypot(over.x - catches.x, over.z - catches.z), speed = Math.max(clamp(far / 6, 45, 90), far / 12);
    // (Let go of short of the top by as far as its drop carries it on.)
    const drop = dropFrom(speed, over.y - hang - (begun.landing.y + mid)), lets = over.clone().addScaledVector(way, -drop.on[drop.on.length - 1]);
    const from = catches.clone().addScaledVector(way, -speed * PLANE_T.comes).addScaledVector(UP, 14).addScaledVector(across, -side * 25);
    // (Climbing over the land between, its hook forty metres clear of it, its wings and wheels more.)
    let climb = 0;
    for (let k = 0.05; k < 0.96; k += 0.05) {
      const q = catches.clone().lerp(lets, k), lift = ground(q.x, q.z) + 40 - q.y;
      climb = Math.max(climb, lift / Math.sin(Math.PI * k));
    }
    const length = Math.hypot(lets.x - catches.x, lets.z - catches.z) + 1.5 * climb + Math.abs(lets.y - catches.y);
    const caught = PLANE_T.comes, released = caught + Math.max(3, length / speed), down = released + (drop.fall.length - 1) / 120;
    cat = {
      ...begun, by: 'plane', ...NONE, takes: caught, gather: [caught, caught + 0.35],
      plane: { from, catches, lets, way, side, speed, climb, caught, released, down, drop },
    };
  };
  /** The plane a step on: along its way, its nose into it, banked as it turns, its line trailing back to its hook; and gone a while after. */
  const planeStep = (c: Catapult, dt: number) => {
    const p = c.plane!, t = c.t;
    if (t > p.down + 6) { plane.hide(); return; }
    const hook = hookAt(p, t), ahead = hookAt(p, t + 0.05).sub(hook).divideScalar(0.05), fwd = ahead.lengthSq() > 1 ? ahead.clone().normalize() : p.way.clone();
    const left = UP.clone().cross(fwd).normalize(), up = fwd.clone().cross(left).normalize();
    // (Its line trailing back and down from its belly to the hook, the plane over and ahead of it.)
    const line = PLANE.line, at = hook.clone().addScaledVector(up, line * Math.cos(PLANE_T.trail)).addScaledVector(fwd, line * Math.sin(PLANE_T.trail)).sub(PLANE.belly.clone().applyMatrix4(new Matrix4().makeBasis(left, up, fwd)));
    const turn = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left, up, fwd));
    plane.place(at, turn, t < p.released ? hook : plane.belly().addScaledVector(fwd, -1.5).addScaledVector(up, -2));
    plane.step(dt);
  };
  /**
   * What the plane took, held a step on: caught by the hook and hanging under it, kicking, swung back as it is snatched away and swaying;
   * let go, falling, then hanging under its canopy, turned to face down the run, and down on its skis at the top.
   */
  const planeHold = (c: Catapult, dt: number) => {
    const p = c.plane!, t = c.t, mid = middleOf(), ch = chuteOf();
    if (t < p.released) {
      const hook = hookAt(p, t), w = t - p.caught, swing = 0.5 * Math.exp(-w / 1.4) * Math.sin(3.1 * w) + 0.12 * Math.sin(w * 1.3);
      const middle = hook.clone().addScaledVector(UP, -hangOf()).addScaledVector(p.way, -0.9 * Math.sin(0.35 + swing));
      rider.quaternion.copy(uprightTo(p.way)).premultiply(new Quaternion().setFromAxisAngle(UP.clone().cross(p.way).normalize(), -0.35 - swing));
      rider.position.copy(middle).addScaledVector(UP, -mid);
      rider.updateMatrixWorld(true);
      skier.air(kicking(t));
      return middle;
    }
    // Let go: where it is in its drop, under where it was let go and on along the way.
    const f = clamp((t - p.released) * 120, 0, p.drop.fall.length - 1), i = Math.floor(f), j = Math.min(i + 1, p.drop.fall.length - 1), k = f - i;
    const fell = p.drop.fall[i] + (p.drop.fall[j] - p.drop.fall[i]) * k, on = p.drop.on[i] + (p.drop.on[j] - p.drop.on[i]) * k;
    const middle = p.lets.clone().addScaledVector(UP, -hangOf() - fell).addScaledVector(p.way, on);
    const since = t - p.released, open = smooth((since - p.drop.opens + 0.3) / 0.75), down = smooth((since - (p.down - p.released - 0.7)) / 0.7);
    // (Turned from the way it flew to face down the run under the canopy, the shorter way round.)
    const toward = p.way.clone().lerp(c.downhill, smooth((since - p.drop.opens) / 2)).setY(0);
    rider.quaternion.copy(uprightTo(toward.lengthSq() > 1e-4 ? toward : c.downhill));
    rider.position.copy(middle).addScaledVector(UP, -mid);
    rider.updateMatrixWorld(true);
    skier.air(open > 0.5 ? { tuck: 0, flight: 0, open: 1, throw: 0, wrap: 0, ski: 0, spin: 0, flip: 0, reach: down } : { ...kicking(t), spread: 0.8 });
    if (open > 0) {
      const riser = rider.localToWorld(ch.riser.clone());
      chute.set(riser, UP.clone(), ch.radius, ch.reach, open < 1 ? open : 1 + 0.06 * Math.sin((since - p.drop.opens) * 2.2), 0, ch.straps.map((v) => rider.localToWorld(v.clone())));
    }
    return middle;
  };
  /** Down at the top under its canopy: the run begun again there (or on the piste, thrown out of bounds), the canopy left lying behind. */
  const finishPlane = (c: Catapult): Now => {
    const ch = chuteOf(), riser = rider.localToWorld(ch.riser.clone());
    const eye = camera.position.clone(), look = c.eye.look.clone(), onto = backOnto, wasShow = showEnding;
    if (onto) resumeAt(onto); else restart();
    if (wasShow) showBack = 1.4;
    ride.sink = 0.6;
    spent = { riser, up: UP.clone(), t: 0, radius: ch.radius, reach: ch.reach, behind: c.downhill.clone().negate() };
    snowBurst(c.landing, 1.6, 50, 2.2);
    handOver(eye, look, c.downhill);
    return { down: ride.down, left: ride.left, speed: ride.speed, way: 0, ski: 0, skid: 0, tuck: 0, brake: 0 };
  };
  /**
   * The plane's shots: from off to the side of what it takes, low, the plane coming in over the snow at it and snatching it away; then
   * along with the two of them as they fly, behind and to the side and a little below; at the top, from the side, the drop and the
   * canopy coming down; and as it is down, to where the rider's own view will stand.
   */
  const planeShot = (c: Catapult, dt: number) => {
    const p = c.plane!, e = c.eye, mid = c.at, across = p.way.clone().cross(UP).multiplyScalar(p.side);
    const want = standCamera(p.catches.clone().addScaledVector(across, 26).addScaledVector(p.way, 10).addScaledVector(UP, 1), 2, mid);
    const planeAt = plane.belly();
    const target = mid.clone().lerp(planeAt, 0.35 * (1 - smooth((c.t - p.caught) / 1.2)));
    const eye = e.start.clone().lerp(want, smooth(c.t / 1.3));
    const off = p.way.clone().multiplyScalar(-24).addScaledVector(across, 14).addScaledVector(UP, -3);
    e.off.lerp(off, c.t > p.caught ? ease(dt, 1.5) : 1);
    const chase = smooth((c.t - p.caught - 0.1) / 1.1) * (1 - smooth((c.t - p.released + 1) / 1.6));
    eye.lerp(standCamera(mid.clone().add(e.off), 3, mid), chase);
    target.lerp(mid.clone().lerp(planeAt, 0.25), chase);
    const watching = standCamera(c.landing.clone().addScaledVector(across.clone().negate(), 26).addScaledVector(c.downhill, 14).addScaledVector(UP, 5), 2, c.landing), atTop = smooth((c.t - p.released + 1) / 1.6);
    eye.lerp(watching, atTop);
    target.lerp(mid.clone().addScaledVector(UP, 1.5), atTop);
    const end = smooth((c.t - (p.down - 1.2)) / 1.4), own = end > 0 ? viewAtTop(c) : null;
    if (own) { eye.lerp(own.eye, end); target.lerp(own.look, end); }
    e.at.copy(eye);
    if (!e.started) e.rel.copy(e.look).sub(mid);
    e.rel.lerp(target.sub(mid), ease(dt, 4) * turnIn(c));
    e.look.copy(mid).add(e.rel);
    camera.position.copy(e.at);
    const g = ground(mid.x, mid.z);
    return mid.y - g > 30 ? mid.clone().setY(g) : mid.clone();
  };
  /**
   * The snowman risen beside what it takes, on the side nearer the middle of the run, square to the way to the top of the run (as a
   * golfer stands to the line of the drive); its hands in front of its middle; the fir reaching from them to what it drives.
   */
  const beginSnowman = () => {
    const { on, f, begun, toTop, across } = takenFor();
    const sign = Math.sign(across.dot(runLeft(f).multiplyScalar(f.left > 0 ? -1 : 1))) || 1;
    const base = on.clone().addScaledVector(across, sign * 11);
    base.y = ground(base.x, base.z);
    const facing = on.clone().sub(base).setY(0).normalize(), grip = base.clone().addScaledVector(UP, 10).addScaledVector(facing, 3.6), ball = begun.at.clone();
    const reach = ball.clone().sub(grip), length = reach.length(), u = reach.divideScalar(length), v = toTop.clone().addScaledVector(u, -toTop.dot(u)).normalize();
    // (The fir meets it a head's width before the bottom of its swing, its root ball's side against it.)
    const meets = -1.7 / length, turn = Math.sign(toTop.dot(UP.clone().cross(facing))) || 1;
    snowman.place(base, facing, length);
    cat = { ...begun, by: 'snowman', ...NONE, snowman: { base, facing, grip, length, u, v, ball, toTop, meets, turn }, takes: SNOWMAN_T.contact, gather: [SNOWMAN_T.contact, SNOWMAN_T.contact + 0.12] };
  };
  /** Whether, the run to end in the whirlwind, the skier has ridden into it while it is strong enough to take it up. */
  const riddenInto = () => {
    if (ending !== 'whirlwind' || !whirl.group.visible || whirl.strength < 0.45) return false;
    const p = focus();
    return Math.hypot(p.x - whirl.base.x, p.z - whirl.base.z) < whirl.radiusAt(0) + 1.5;
  };
  /** Put away, all of it: the arm, the whirlwind, the blast, the saucer, the snowman, the parachute, the land turned over, and what any had of the skier; and the next run's end chosen. */
  const endCatapult = () => {
    unflip();
    hideAsk();
    cat = null; spent = null;
    robot.hide(); chute.hide(); whirl.hide(); blast.hide(); saucer.hide(); snowman.hide(); plane.hide(); iceJump.hide();
    chooseEnding();
  };

  /** How the arm stands `t` seconds after it began to rise (and, once it has let go, through to sinking back under the snow). */
  const armPose = (t: number): ArmPose => {
    const c = cat!, a = c.arm!, T = ARM_T, k = (from: number, to: number) => smooth((t - from) / (to - from));
    const mix3 = (p: { upper: number; fore: number; claw: number }, q: { upper: number; fore: number; claw: number }, w: number) => ({ upper: p.upper + (q.upper - p.upper) * w, fore: p.fore + (q.fore - p.fore) * w, claw: p.claw + (q.claw - p.claw) * w });
    const over = { ...a.over, claw: -Math.PI / 2 }, on = { ...a.on, claw: -Math.PI / 2 }, hold = who === 'person' ? 0 : 1;
    // Rising out of the snow folded up; reaching over, the claw turned down to it, the fingers opening; down on it; closing.
    let j = mix3(FOLDED, over, k(T.risen - 0.15, T.over));
    j = mix3(j, on, k(T.over, T.down));
    // Lifted high; turned to the top of the run and drawn back, swinging it down behind; thrown, over the top and through.
    j = mix3(j, HIGH, k(T.closed, T.lifted));
    j = mix3(j, DRAWN, k(T.lifted, T.drawn));
    const sweep = clamp((t - T.drawn) / T.sweep, 0, 1);
    j = mix3(j, THROWN, sweep * sweep * (3 - 2 * sweep));
    // (After the throw, it sinks back under the snow.)
    const rise = smooth(t / T.risen) * (1 - k(T.drawn + 0.9, T.drawn + 2.8));
    const yaw = turnTo(a.yaw.take, a.yaw.throw, k(T.lifted, T.drawn - 0.1));
    const grip = t < T.risen ? 1 - k(0.6, T.risen) : 1 - k(T.risen, T.over) + k(T.down, T.closed) - (c.fly ? k(T.drawn + T.letGo, T.drawn + T.letGo + 0.2) : 0);
    return { rise, yaw, ...j, roll: a.roll * k(T.risen, T.over), grip: clamp(grip, 0, 1), hold };
  };
  /** What is held in the claw, or carried in the wind or the blast, kicking: its legs flung about, now tucked, now spread. */
  const kicking = (t: number): AirControls => ({ tuck: 0.35 + 0.3 * Math.sin(t * 5.3), flight: 0, open: 0.2, throw: 0, wrap: 0.3, ski: 0.18 * Math.sin(t * 3.7), spin: 0, flip: 0, spread: 0.5 + 0.5 * Math.sin(t * 6.1), cross: 0.3 + 0.3 * Math.sin(t * 4.4) });
  /** The skier put with its middle at `middle`, upright facing `facing`; and posed tumbling as it is tumbling, kicking. */
  const putTumbling = (c: Catapult, middle: Vector3, facing: Vector3) => {
    rider.quaternion.copy(uprightTo(facing));
    rider.position.copy(middle).addScaledVector(UP, -middleOf());
    rider.updateMatrixWorld(true);
    skier.air({ ...kicking(c.t), flip: c.tumble.flip, spin: c.tumble.spin });
  };
  /** The skier put where the claw holds it, turned as it holds it. */
  const putInClaw = () => {
    const q = robot.clawTurn().multiply(inClaw);
    rider.quaternion.copy(q);
    rider.position.copy(robot.holding()).addScaledVector(UP.clone().applyQuaternion(q), -middleOf());
    rider.updateMatrixWorld(true);
  };
  /** The arm a step on: breaking up through the snow, a burst about it as the claw comes through and as the turret does, another as the fingers dig in; posed; after the throw, following through and sinking back. */
  const armStep = (c: Catapult, dt: number, was: number) => {
    const T = ARM_T, a = c.arm!, t = c.t;
    if (dt > 0) {
      const rise = smooth(t / T.risen);
      if (rise > 0.2 && rise < 0.97) snowBurst(a.base, 2.8, Math.round(dt * 420), 7);
      if (was < T.down + 0.1 && t >= T.down + 0.1) snowBurst(a.grip, 1.4, 70, 3);
    }
    if (!c.fly || robot.group.visible) robot.pose(armPose(t));
    if (c.fly && t > T.drawn + 2.8) robot.hide();
  };
  /** The whirlwind coming over to what it takes, growing to its full strength as it comes; and standing over it as it carries it up. */
  const comeOver = (c: Catapult) => {
    const w = c.whirl!, t = c.t;
    whirl.strength = w.start + (1 - w.start) * smooth(t / Math.max(1.4, w.reaches));
    const go = w.reaches > w.sets ? smooth((t - w.sets) / (w.reaches - w.sets)) : 1;
    whirl.base.copy(w.from).lerp(w.to, go);
    whirl.base.y = ground(whirl.base.x, whirl.base.z);
  };
  /**
   * Taken up into the whirlwind: where round its axis it was, and how far out; and how many turns it is to be carried round, two and
   * some, so that as it is let go the wind carries it toward the top of the run.
   */
  const takeUp = (c: Catapult) => {
    const w = c.whirl!, rel = c.at.clone().sub(whirl.axisAt(middleOf())).setY(0);
    w.r = rel.length(); w.a = Math.atan2(-rel.z, rel.x);
    const toward = c.landing.clone().sub(w.to).setY(0).normalize(), last = Math.atan2(-toward.x, -toward.z);
    w.turns = 2 + ((((last - w.a) / TURN) % 1) + 1) % 1;
  };
  /**
   * Carried round and up the outside of the whirlwind's funnel, the way the wind goes, further out as it widens and faster and faster, tumbling
   * head over heels and round, kicking: and where its middle is.
   */
  const carry = (c: Catapult, dt: number) => {
    const w = c.whirl!, u = clamp((c.t - c.takes) / w.lift, 0, 1);
    // (Just outside its walls, where it is seen going round: inside them, it was lost in the cloud.)
    const h = middleOf() + w.high * u ** 1.6, wide = Math.max(2.5, whirl.radiusAt(h) * 1.2), a = w.a + w.turns * TURN * u ** 1.35;
    const middle = whirl.about(h, a, w.r + (wide - w.r) * smooth(u / 0.35));
    c.tumble.flip -= TURN * (0.2 + 0.95 * u) * dt; c.tumble.spin += TURN * 0.5 * u * dt;
    putTumbling(c, middle, whirl.round(a));
    return middle;
  };
  /**
   * The blast a step on: its cracks running out, glowing, and puffs of snow blown up out of them, a rumble under the snow shaking the
   * view harder and harder; then going off, a burst of snow besides its own, the view shaken hard and the shake dying away.
   */
  const blastStep = (c: Catapult, dt: number, was: number) => {
    const b = c.blast!, t = c.t, T = BLAST_T;
    if (t < T.booms) {
      const k = clamp(t / (T.booms - 0.1), 0, 1);
      blast.cracking(k);
      c.shake = 0.03 + 0.15 * smooth(t / T.booms);
      if (dt > 0 && sprayRng.chance(dt * 14)) {
        const a = sprayRng.range(0, TURN), p = onSnow(b.at.clone().add(new Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(sprayRng.range(1, 14) * k)));
        throwPuff(p, new Vector3(0, sprayRng.range(2, 5), 0), sprayRng.range(1.5, 2.5), 1.6);
      }
    } else if (was < T.booms) {
      blast.boom();
      c.shake = 1.4;
      snowBurst(b.at, 9, 220, 16);
    } else c.shake *= Math.exp(-2.4 * dt);
    blast.step(dt, camera, ground);
  };
  /** Thrown up out of the blast and away from it toward the top of the run, fast and slowing as it rises, tumbling. */
  const blown = (c: Catapult, dt: number) => {
    const b = c.blast!, u = clamp((c.t - c.takes) / BLAST_T.blown, 0, 1);
    const middle = b.from.clone().addScaledVector(b.away, 10 * u ** 1.5).addScaledVector(UP, 24 * (1 - (1 - u) ** 2));
    c.tumble.flip -= TURN * 1.2 * dt; c.tumble.spin += TURN * 0.5 * dt;
    putTumbling(c, middle, b.toTop);
    return middle;
  };
  /**
   * The saucer a step on: swooping down out of the sky, slowing to a hover, banked into its way as it comes and level as it hovers,
   * bobbing; its beam shining down to the snow. Then, what it took drawn up under it, carried back to the top of the run in its beam:
   * climbing away, over the mountain between, tipped into its way as it goes the faster, and slowing to a hover over the top; its beam
   * let down to the snow there, a flash as what it carried stands on the snow; and then off up into the sky, faster and faster, gone.
   */
  const saucerStep = (c: Catapult, dt: number) => {
    const s = c.saucer!, t = c.t, T = SAUCER_T, k = clamp(t / T.arrives, 0, 1), gone = t - (s.lowers + T.lowers);
    const carried = saucerAlong(s, t), at = t < s.carries ? s.from.clone().lerp(s.hover, 1 - (1 - k) ** 3) : saucerWay(s, carried);
    at.y += Math.sin(t * 2.1) * 0.35 * smooth((t - T.arrives) / 0.6);
    const way = s.hover.clone().sub(s.from).setY(0).normalize(), tip = new Quaternion().setFromAxisAngle(UP.clone().cross(way).normalize(), 0.5 * (1 - k));
    // (Tipped forward into its way back as hard as it goes: hardest halfway, level again over the top.)
    const back = s.over.clone().sub(s.hover).setY(0).normalize(), pace = t > s.carries && t < s.lowers ? Math.sin(Math.PI * clamp((t - s.carries) / s.flies, 0, 1)) : 0;
    if (back.lengthSq() > 0.5) tip.premultiply(new Quaternion().setFromAxisAngle(UP.clone().cross(back).normalize(), 0.32 * pace));
    if (gone > 0) at.addScaledVector(c.downhill.clone().negate().addScaledVector(UP, 1.6).normalize(), 20 * gone + 90 * gone * gone);
    s.at.copy(at);
    saucer.place(at, tip);
    // (Its beam down to the snow as it takes and lets down; carrying, only down to what it carries, which hangs in it.)
    const reach = saucer.belly().y - ground(at.x, at.z), held = SAUCER.belly + middleOf() + 3.5;
    const down = smooth((t - s.carries + 0.6) / 0.8) * (1 - smooth((t - s.lowers + 0.3) / 0.6));
    const on = smooth((t - T.arrives) / T.beams) * (1 - smooth(gone / 0.25)) + 1.5 * Math.exp(-(((t - (s.lowers + T.lowers - 0.3)) / 0.12) ** 2));
    saucer.shine(on, reach + (Math.min(reach, held) - reach) * down);
    saucer.step(dt, camera);
  };
  /**
   * Taken up in the saucer's beam, floating up it to just under its belly, turning slowly about the upright, its limbs spread; carried
   * there in the beam back to the top of the run, swaying as the saucer goes; and let down the beam onto the snow there, turned to face
   * down the run, standing on its skis.
   */
  const floatUp = (c: Catapult) => {
    const s = c.saucer!, u = smooth((c.t - c.takes) / SAUCER_T.rises), mid = middleOf(), w = c.t - c.takes;
    const top = saucer.belly().addScaledVector(UP, -(mid + 1.4)), middle = s.start.clone().lerp(top, u);
    // (Swaying in the beam; swung back the harder as the saucer goes off, and on past as it slows.)
    const sway = 0.3 * u + 0.5 * Math.sin(Math.PI * clamp((c.t - s.carries) / s.flies, 0, 1));
    middle.x += Math.sin(w * 1.7) * sway; middle.z += Math.cos(w * 1.3) * sway;
    // (Let down, from under the belly to standing on the snow at the top, turned on the way to face down the run.)
    const low = smooth((c.t - s.lowers) / SAUCER_T.lowers), stand = c.landing.clone().addScaledVector(UP, mid);
    middle.lerp(stand, low);
    const turning = uprightTo(s.toTop).premultiply(new Quaternion().setFromAxisAngle(UP, 1.6 * w * w / (1 + w)));
    rider.quaternion.copy(turning).slerp(uprightTo(c.downhill), smooth((c.t - s.lowers) / (0.8 * SAUCER_T.lowers)));
    rider.position.copy(middle).addScaledVector(UP, -mid);
    rider.updateMatrixWorld(true);
    // (Spread out in the beam; drawn in and reaching for the snow as it comes down to it; standing.)
    const calm = 1 - low;
    if (low < 0.98) skier.air({ tuck: 0.1, flight: 0, open: 1, throw: 0, wrap: 0, ski: 0.15 * Math.sin(w * 2.3) * calm, spin: 0, flip: 0.18 * Math.sin(w * 1.4) * calm, spread: (0.85 + 0.15 * Math.sin(w * 3.1)) * calm, cross: 0, reach: smooth((low - 0.6) / 0.4) });
    else skier.ride({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0.2, flickL: 0, flickR: 0 });
    return middle;
  };
  /**
   * The fir's angle in the snowman's swing at `t`, from the bottom of its swing toward the top of the run (radians): set down behind
   * what it is to drive; swung back slowly, up over its shoulder; down fast and faster, meeting it; through and up.
   */
  const swingAt = (c: Catapult, t: number) => {
    const s = c.snowman!, T = SNOWMAN_T, set = s.meets - 0.25;
    if (t < T.address) return set;
    if (t < T.top) return set + (-2.3 - set) * smooth((t - T.address) / (T.top - T.address));
    if (t < T.contact) return -2.3 + (s.meets + 2.3) * ((t - T.top) / (T.contact - T.top)) ** 2.2;
    return s.meets + (2.1 - s.meets) * (1 - (1 - clamp((t - T.contact) / (T.through - T.contact), 0, 1)) ** 3);
  };
  /** The snowman a step on: rising out of the snow, a burst of snow about it as it does; its swing; sinking back under the snow, and gone. */
  const snowmanStep = (c: Catapult, dt: number, was: number) => {
    const s = c.snowman!, t = c.t, T = SNOWMAN_T;
    if (t > T.gone) { snowman.hide(); return; }
    const rise = smooth(t / T.risen) * (1 - smooth((t - T.sinks) / (T.gone - T.sinks))), a = swingAt(c, t);
    if (dt > 0 && ((rise > 0.05 && rise < 0.97 && t < T.risen) || (t > T.sinks && rise > 0.03))) snowBurst(s.base, 5, Math.round(dt * 500), 9);
    if (was < T.contact && t >= T.contact) snowBurst(s.ball.clone().setY(ground(s.ball.x, s.ball.z)), 2.4, 110, 7);
    const grip = s.grip.clone().addScaledVector(UP, -(1 - rise) * SNOWMAN.depth);
    snowman.pose({ rise, twist: 0.3 * a * s.turn, grip, club: s.u.clone().multiplyScalar(Math.cos(a)).addScaledVector(s.v, Math.sin(a)) });
  };
  /** Driven: carried a moment on the fir's head, just ahead of it along its swing, tumbling. */
  const driven = (c: Catapult, dt: number) => {
    const s = c.snowman!, a = swingAt(c, c.t), along = s.u.clone().multiplyScalar(-Math.sin(a)).addScaledVector(s.v, Math.cos(a));
    const middle = snowman.head().addScaledVector(along, 1.7);
    c.tumble.flip -= TURN * 1.3 * dt; c.tumble.spin += TURN * 0.4 * dt;
    putTumbling(c, middle, s.toTop);
    return middle;
  };
  /** The shock as the land begins to turn: a flash and the view shaken, the snow thrown up about the skier; and the ground rumbling as it turns. */
  const flipStep = (c: Catapult, dt: number, was: number) => {
    const fl = c.flip!, u = c.t - FLIP_T.wave;
    if (was === 0 && dt > 0) { c.shake = 1.2; thump = 1; snowBurst(fl.on, 4, 40, 4); }
    else c.shake = Math.max(c.shake * Math.exp(-2.5 * dt), 0.08 * smooth(u / 0.3) * (1 - smooth((u - 2.6) / 1.4)));
  };
  /**
   * The land turning, a step on (`dt`; none while riding is held), whether the skier is held or riding back: the fold going out, its
   * seam glowing along its front a while; the snow tinged as it turns inside out (or its tinge going, turned back).
   */
  const stepFold = (dt: number) => {
    const f = fold;
    if (!f) return;
    foldT += dt;
    const u = foldT - FLIP_T.wave;
    if (f.front !== Infinity) {
      f.front = Math.max(0, FOLD.speed * u);
      f.width = FOLD.speed * FOLD.each;
      if (f.front - f.width > 9000) f.front = Infinity;
    }
    f.glow = 2 * smooth(u / 0.15) * (1 - smooth((u - 2.4) / 1.4));
    f.tinge = foldIn ? smooth(u / 3) : 1 - smooth(u / 3);
    folding.set(f);
  };
  /** Stood on the snow where the land turns about, as the shock lifts it to its feet, turned round as the fold goes out: and its middle. */
  const standFlip = (c: Catapult) => {
    const fl = c.flip!, k = smooth((c.t - 0.9) / (FLIP_T.turned - 0.9));
    const round = Math.atan2(fl.from.clone().cross(fl.to).dot(UP), fl.from.dot(fl.to));
    rider.quaternion.copy(uprightTo(fl.from.clone().applyAxisAngle(UP, round * k)));
    rider.position.set(fl.on.x, ground(fl.on.x, fl.on.z), fl.on.z);
    rider.updateMatrixWorld(true);
    skier.ride({ s: 0, ski: 0, tuck: 0, brake: 0, tall: 0.2, flickL: 0, flickR: 0 });
    return rider.position.clone().addScaledVector(UP, middleOf());
  };
  /** Turned inside out, the run ridden back from here: the skier going a little down it turned round, the ride handed back. */
  const finishInvert = (c: Catapult): Now => {
    const fl = c.flip!, eye = camera.position.clone(), look = c.eye.look.clone();
    inside!.reversed = true;
    Object.assign(ride, { way: 0, speed: 6, facing: 0, tuck: 0, tall: 0, brake: 0, lean: 0, leanSide: 0, flickL: 0, flickR: 0, out: 0, absorb: 0, sink: 0, pop: 0, skid: 0, ended: false, held: 0, switch: false, flex: 0, back: 0, turn180: null, stones: 0, overStones: 0, bare: 0, deep: 0 });
    const at = land.frame(fl.on.x, fl.on.z);
    putAt(at.s, at.left);
    ride.settle = { spin: 0, flip: 0, left: 0 };
    air = null; crash = null; joints = jointsBefore = null;
    seat();
    cat = null;
    levelTilt();
    pushOff();
    tell('Inside out', 'ride it back down to the top', false, 4);
    handOver(eye, look, runDir(here));
    return { down: ride.down, left: ride.left, speed: ride.speed, way: 0, ski: 0, skid: 0, tuck: 0, brake: 0 };
  };
  /**
   * Turned the right way up, the run begun again at its top: the land as it lies, at its own heights, and the view moved up as the land
   * is (it was left lower), to go on from there.
   */
  const finishRevert = (c: Catapult): Now => {
    const off = c.flip!.off, eye = camera.position.clone().addScaledVector(UP, -off), look = c.eye.look.clone().addScaledVector(UP, -off);
    restart();
    thump = 0.7;
    const top = land.at(0, 0);
    handOver(eye, look, runDir(land.frame(top.x, top.z, 0)));
    return { down: 0, left: 0, speed: ride.speed, way: 0, ski: 0, skid: 0, tuck: 0, brake: 0 };
  };
  /** The rocket cart's times: down beside the skier under its parachute; the skier on it; its engine lit; the drive handed over. */
  const CART_T = { lands: 1.8, board: 2.5, lit: 2.7, done: 3.3 };
  /** The rocket cart brought down out of the sky beside what it is for, a little up the run, under a parachute, to be driven back up. */
  const beginCart = () => {
    const { on, f, begun, across, side } = takenFor(), up = runDir(f).negate();
    const spot = on.clone().addScaledVector(across, -side * 3.2).addScaledVector(up, 1.5);
    spot.y = ground(spot.x, spot.z);
    cart.size(who === 'person' ? 2.3 : 3.4, who === 'person' ? 1 : 1.5);
    scene.add(cart.group); cart.group.visible = true; cart.set(0, 0);
    dropKickers();
    cat = { ...begun, by: 'cart', ...NONE, cart: { on, spot, up, side, high: 40 }, takes: CART_T.lands, gather: [CART_T.lands, CART_T.lands + 0.5] };
  };
  /**
   * The cart a step on: floating down under its canopy, the canopy let go of as it lands, snow thrown up; its engine lit once the skier
   * is on it, a cough of smoke and then its flame.
   */
  const cartStep = (c: Catapult, dt: number, was: number) => {
    const k = c.cart!, t = c.t;
    k.high = 40 * (1 - smooth(t / CART_T.lands)) ** 1.3;
    cart.group.position.copy(k.spot).addScaledVector(UP, CART_DECK + k.high);
    cart.group.quaternion.copy(uprightTo(k.up));
    cart.group.updateMatrixWorld(true);
    const riser = cart.group.localToWorld(new Vector3(0, 1.8, 0));
    if (t < CART_T.lands) {
      const corners = [-1, 1].flatMap((x) => [-1, 1].map((z) => cart.group.localToWorld(new Vector3(0.4 * x, 0, 0.9 * z))));
      chute.set(riser, UP, 3.4, 3.2, smooth(t / 0.4), 0, corners);
    } else if (was < CART_T.lands) {
      snowBurst(k.spot, 2.6, 90, 3);
      // (Let go of on the far side of the cart from the skier: let fall behind it, it lay over the skier getting on.)
      spent = { riser, up: UP.clone(), t: 0, radius: 3.4, reach: 3.2, behind: k.spot.clone().sub(k.on).setY(0).normalize() };
    }
    if (t >= CART_T.lit && was < CART_T.lit) thump = 0.25;
    cart.set(0.7 * smooth((t - CART_T.lit) / 0.3), dt);
  };
  /** Hopped from where it was onto the cart's deck, turned to face up the run, standing. */
  const boardCart = (c: Catapult) => {
    const k = c.cart!, u = smooth((c.t - CART_T.lands) / (CART_T.board - CART_T.lands)), mid = middleOf();
    const from = k.on.clone().addScaledVector(UP, mid), to = k.spot.clone().addScaledVector(UP, CART_DECK + mid);
    const middle = from.lerp(to, u).addScaledVector(UP, 1.3 * Math.sin(Math.PI * u));
    rider.quaternion.copy(uprightTo(k.up));
    rider.position.copy(middle).addScaledVector(UP, -mid);
    rider.updateMatrixWorld(true);
    skier.ride({ s: 0, ski: 0, tuck: 0.3, brake: 0, tall: 0, flickL: 0, flickR: 0 });
    return middle;
  };
  /** On the cart, its engine lit: driven from here back up the run, as riding goes, the cart under the skis. */
  const finishCart = (c: Catapult): Now => {
    const k = c.cart!, eye = camera.position.clone(), look = c.eye.look.clone();
    carting = { base: land };
    land = reversedLand(land);
    dropKickers();
    rider.add(cart.group);
    cart.group.position.set(0, 0, 0); cart.group.quaternion.identity();
    Object.assign(ride, { way: 0, speed: 4, facing: 0, tuck: 0, tall: 0, brake: 0, lean: 0, leanSide: 0, flickL: 0, flickR: 0, out: 0, absorb: 0, sink: 0, pop: 0, skid: 0, ended: false, held: 0, switch: false, flex: 0, back: 0, turn180: null, stones: 0, overStones: 0, bare: 0, deep: 0 });
    const at = land.frame(k.spot.x, k.spot.z);
    putAt(at.s, at.left);
    ride.settle = { spin: 0, flip: 0, left: 0 };
    air = null; crash = null; joints = jointsBefore = null;
    seat();
    cat = null;
    levelTilt();
    tell('Rocket cart', 'drive it back up to the top · tuck for more push', false, 4);
    handOver(eye, look, runDir(here));
    return { down: ride.down, left: ride.left, speed: ride.speed, way: 0, ski: 0, skid: 0, tuck: 0, brake: 0 };
  };
  /**
   * The cart's push as the skier asks for it, driving back up the run: tucked for more, standing tall for less; none once at the top.
   * (Against its weight up the slope and the drag of a cart: some seventy kilometres an hour up the steeps, a hundred up the gentler.
   * Pushed half as hard again, with only the skis' drag, it went up at a hundred and eighty.)
   */
  const cartThrust = () => (carting && !ride.ended ? 8 + 4 * Math.max(0, ask.y) - 4 * Math.max(0, -ask.y) : 0);
  /** The cart a step on as it is driven: its flame as hard as it pushes, and smoke out of its nozzle, the more the harder. */
  const stepCart = (dt: number) => {
    if (!carting) return;
    cart.set(cartPush, dt);
    if (dt <= 0 || cartPush < 0.05 || air) return;
    rider.updateMatrixWorld(true);
    const mouth = cart.group.localToWorld(cart.nozzle.clone()), back = new Vector3(0, 0, -1).applyQuaternion(rider.quaternion);
    for (let i = Math.floor(dt * 45 * cartPush + sprayRng.next()); i > 0; i--) {
      throwPuff(mouth.clone().addScaledVector(back, sprayRng.range(0, 0.6)), back.clone().multiplyScalar(sprayRng.range(3, 7)).add(new Vector3(sprayRng.range(-0.8, 0.8), sprayRng.range(0.3, 1.4), sprayRng.range(-0.8, 0.8))), 1.2 + cartPush, 1.8);
    }
  };
  /**
   * The cart's coming, filmed (where the sun's shadows are kept about given back): off to the side, a little down the run, looking up at
   * it coming down out of the sky over the skier, and at the two of them as it lands and the skier gets on.
   */
  const cartShot = (c: Catapult, dt: number) => {
    const k = c.cart!, e = c.eye, across = k.up.clone().cross(UP).multiplyScalar(k.side);
    const want = k.on.clone().addScaledVector(across, 14).addScaledVector(k.up, -9).addScaledVector(UP, 4);
    const target = k.on.clone().lerp(k.spot, 0.5).addScaledVector(UP, 1.6 + 0.55 * k.high);
    standCamera(want, 2, k.on.clone().addScaledVector(UP, 1));
    e.at.copy(e.start).lerp(want, smooth(c.t / 1.2));
    e.look.lerp(target, ease(dt, 5) * turnIn(c));
    camera.position.copy(e.at);
    return k.on.clone();
  };
  /**
   * Each way the run may end: how it begins; its own doings a step on, from `was` to now (before it lets go and after); anything it
   * works out as it takes what it takes; what it holds put where it holds it, and where its middle is; whether it lets go now; the view
   * before it lets go (and where the sun's shadows are kept about), and how wide; whether what it lets go of is tumbling already (or
   * begins to tumble only then); and what is told it is doing as it comes, and once it has it.
   */
  interface Way {
    begin(): void; step(c: Catapult, dt: number, was: number): void; took?(c: Catapult): void; hold(c: Catapult, dt: number): Vector3;
    /** Done with it, without a throw (the land turned over): the ride handed back, and what the ride's step gives this step. */
    ends?(c: Catapult): Now | null;
    lets(c: Catapult): boolean; shot(c: Catapult, dt: number): Vector3; fov: number; tumbling: boolean; coming: string; holding: string;
    /** How fast it goes as it is let go, of the throw's own pace (struck, near it; floated off, far short of it). */
    launch: number;
    /** Flown as a ski jumper flies, laid out over its skis and not tumbling (off the ice jump's table), rather than thrown. */
    glides?: boolean;
  }
  const WAYS: Record<Ending, Way> = {
    arm: {
      begin: () => beginArm(), step: (c, dt, was) => armStep(c, dt, was), hold: (c) => { putInClaw(); skier.air(kicking(c.t)); return robot.holding(); },
      lets: (c) => c.t >= ARM_T.drawn + ARM_T.letGo, shot: (c, dt) => armShot(c, dt), fov: 56, tumbling: false, coming: 'Something under the snow', holding: 'In the claw', launch: 0.25,
    },
    whirlwind: {
      begin: () => beginWhirl(), step: (c, dt, was) => { if (!c.fly) { comeOver(c); if (was < c.takes && c.t >= c.takes) snowBurst(c.whirl!.to, 2.2, 60, 5); } },
      took: (c) => takeUp(c), hold: (c, dt) => carry(c, dt), lets: (c) => c.t >= c.takes + c.whirl!.lift, shot: (c, dt) => whirlShot(c, dt), fov: 62, tumbling: true, launch: 0.15,
      coming: 'A tornado coming', holding: 'In the tornado',
    },
    blast: {
      begin: () => beginBlast(), step: (c, dt, was) => blastStep(c, dt, was), took: (c) => { c.blast!.from.copy(c.at); }, hold: (c, dt) => blown(c, dt),
      lets: (c) => c.t >= c.takes + BLAST_T.blown, shot: (c, dt) => blastShot(c, dt), fov: 60, tumbling: true, coming: 'The snow cracking', holding: 'Blown sky high', launch: 0.08,
    },
    ice: {
      begin: () => beginIce(), step: (c, dt) => iceStep(c, dt), hold: (c) => iceHold(c),
      lets: (c) => c.t >= c.ice!.off, shot: (c, dt) => iceShot(c, dt), fov: 60, tumbling: false, coming: 'The ground cracking', holding: 'Into the in-run', launch: 1, glides: true,
      // (Flown off the lip at the throw's own speed from the first: the in-run brought it up to that speed (`inrunOf`), which the view
      // went along with.)
    },
    plane: {
      begin: () => beginPlane(), step: (c, dt) => planeStep(c, dt), hold: (c, dt) => planeHold(c, dt),
      lets: () => false, ends: (c) => (c.t >= c.plane!.down + PLANE_T.after ? finishPlane(c) : null),
      shot: (c, dt) => planeShot(c, dt), fov: 58, tumbling: false, coming: 'An engine overhead', holding: 'On the hook', launch: 1,
    },
    saucer: {
      begin: () => beginSaucer(), step: (c, dt) => saucerStep(c, dt), took: (c) => { c.saucer!.start.copy(c.at); }, hold: (c) => floatUp(c),
      lets: () => false, ends: (c) => (c.t >= c.saucer!.done ? finishSaucer(c) : null),
      shot: (c, dt) => saucerShot(c, dt), fov: 60, tumbling: false, coming: 'Lights in the sky', holding: 'Taken up', launch: 1,
    },
    snowman: {
      begin: () => beginSnowman(), step: (c, dt, was) => snowmanStep(c, dt, was), hold: (c, dt) => driven(c, dt),
      lets: (c) => c.t >= SNOWMAN_T.contact + 0.1, shot: (c, dt) => snowmanShot(c, dt), fov: 58, tumbling: true, coming: 'A snowman rising', holding: 'Driven', launch: 0.25,
    },
    invert: {
      begin: () => beginInvert(), step: (c, dt, was) => flipStep(c, dt, was), hold: (c) => standFlip(c), lets: () => false, ends: (c) => (c.t >= FLIP_T.done ? finishInvert(c) : null),
      shot: (c, dt) => flipShot(c, dt), fov: 62, tumbling: false, coming: 'The earth shaking', holding: 'Turned inside out', launch: 1,
    },
    cart: {
      begin: () => beginCart(), step: (c, dt, was) => cartStep(c, dt, was), hold: (c) => boardCart(c), lets: () => false, ends: (c) => (c.t >= CART_T.done ? finishCart(c) : null),
      shot: (c, dt) => cartShot(c, dt), fov: 55, tumbling: false, coming: 'A cart coming down', holding: 'Getting on the cart', launch: 1,
    },
    revert: {
      begin: () => beginRevert(), step: (c, dt, was) => flipStep(c, dt, was), hold: (c) => standFlip(c), lets: () => false, ends: (c) => (c.t >= FLIP_T.done ? finishRevert(c) : null),
      shot: (c, dt) => flipShot(c, dt), fov: 62, tumbling: false, coming: 'The earth shaking', holding: 'Turned right side up', launch: 1,
    },
  };
  /**
   * The world turned inside out, while it is: the land as it lies, and the level it is turned about; and whether the run is ridden back
   * the other way now (its foot its start, its top its foot). And how the land is folded now (none, as it lies).
   */
  let inside: { base: Land; pivot: number; reversed: boolean } | null = null;
  let fold: Fold | null = null;
  /** How long since the land began to turn, and which way: inside out, or back. */
  let foldT = 0, foldIn = true;
  /** A flash of light as the shock goes through the ground, dying away. */
  let thump = 0;
  /**
   * The land as the ride and the views have it while it is folded: its heights as the fold has them; and, ridden back, its run the
   * other way about, from its foot to its top, so that riding it back goes as riding down any run does. No kickers stand on it, and
   * none of what is drawn of the land as it lies is seen (`folding` draws it).
   */
  const foldedLand = (base: Land): CaveLand => ({
    ...base, cave: undefined,
    height: (x, z) => (fold ? heightIn(fold, base.height(x, z), x, z) : base.height(x, z)),
    frame: (x, z, hint) => {
      if (!inside?.reversed) return base.frame(x, z, hint);
      const f = base.frame(x, z, hint === undefined ? undefined : base.length - hint);
      return { s: base.length - f.s, left: -f.left, dx: -f.dx, dz: -f.dz };
    },
    at: (s, left) => { if (!inside?.reversed) return base.at(s, left); const a = base.at(base.length - s, -left); return { x: a.x, z: a.z, dx: -a.dx, dz: -a.dz }; },
    edges: (s) => { if (!inside?.reversed) return base.edges(s); const [lo, hi] = base.edges(base.length - s); return [-hi, -lo]; },
    drop: (y) => base.drop(inside?.reversed ? 2 * inside.pivot - y : y),
    kickable: () => false, keepAbout: () => {}, lod: undefined, trees: undefined,
  });
  /**
   * The land turned inside out built ahead, for the land as it lies (not on the groomed slope, which is never turned): built as the
   * shock went through the ground, it held up that moment by some part of a second, a great deal more on a phone.
   */
  const buildFold = () => { if (!inside && !carting && land.length < Infinity) foldFor(land); };
  /** The land turned inside out built for a land, its old sheets let go of (`toLetGo`). */
  const foldFor = (l: Land) => { for (const m of folding.build(l, l)) letGoOf(m); };
  /** The kickers taken down and forgotten: the land they stood on is not the land now. */
  const dropKickers = () => { for (const k of kickerAt.values()) if (k) takeDown(k); kickerAt.clear(); kicks = []; };
  /**
   * Driving the rocket cart back up the run, while it is: the land as it lies; and how hard its engine pushes now (0 to 1, for its flame
   * and its smoke).
   */
  let carting: { base: Land } | null = null, cartPush = 0;
  /** The land as the ride and the views have it while the cart is driven back up: its run the other way about, so that driving up it goes as riding down any run does; no kickers on it. */
  const reversedLand = (base: Land): Land => ({
    ...base,
    frame: (x, z, hint) => { const f = base.frame(x, z, hint === undefined ? undefined : base.length - hint); return { s: base.length - f.s, left: -f.left, dx: -f.dx, dz: -f.dz }; },
    at: (s, left) => { const a = base.at(base.length - s, -left); return { x: a.x, z: a.z, dx: -a.dx, dz: -a.dz }; },
    edges: (s) => { const [lo, hi] = base.edges(base.length - s); return [-hi, -lo]; },
    kickable: () => false,
  });
  /** The land as it lies again, at its own heights, drawn as it is, its run the right way about; the cart put away. */
  const unflip = () => {
    if (carting) {
      land = carting.base; carting = null; cartPush = 0;
      scene.add(cart.group); cart.group.visible = false;
      dropKickers();
    }
    if (!inside) return;
    land = inside.base; inside = null; fold = null;
    clearRideTracks();
    folding.show(false); land.group.visible = true;
    dropKickers();
  };
  /** The level way the skier faces now. */
  const facingNow = () => { const f = new Vector3(0, 0, 1).applyQuaternion(rider.quaternion).setY(0); return f.lengthSq() > 1e-6 ? f.normalize() : runDir(here); };
  /**
   * The shock: the land turned inside out about the level of the snow under the skier, the fold set rolling out from there; drawn
   * by `folding` from now until it lies the right way up again, the ride going by it too.
   */
  const beginInvert = () => {
    const { on, f, begun, side } = takenFor(), base = land;
    foldFor(base);
    inside = { base, pivot: on.y, reversed: false };
    fold = { from: [1, 0], to: [-1, 2 * on.y], x: on.x, z: on.z, front: 0, width: FOLD.speed * FOLD.each, glow: 0, tinge: 0 };
    foldT = 0; foldIn = true;
    folding.set(fold); folding.show(true); base.group.visible = false;
    land = foldedLand(base);
    dropKickers(); clearGun?.(); clearRideTracks();
    cat = { ...begun, by: 'invert', ...NONE, flip: { on, from: facingNow(), to: runDir(f).negate(), side, off: 0 }, takes: 0.25, gather: [0.25, 0.9] };
  };
  /**
   * Back at the top, ridden back to it (or fallen on the way): the land turned the right way up again, about the level the skier is at
   * now, so that it stays where it is as the land turns about it; which leaves the land lower than it was by as much as that level is
   * under the one it was turned over about, twice (`off`).
   */
  const beginRevert = () => {
    const { on, begun, side } = takenFor(), p = inside!.pivot, base = inside!.base;
    fold = { from: [-1, 2 * p], to: [1, 2 * (on.y - p)], x: on.x, z: on.z, front: 0, width: FOLD.speed * FOLD.each, glow: 0, tinge: 1 };
    foldT = 0; foldIn = false;
    folding.set(fold);
    // (The tracks ridden back laid on the land turned over: left as they lay, they stood up into the sky as it turned back.)
    clearRideTracks();
    cat = { ...begun, by: 'revert', ...NONE, flip: { on, from: facingNow(), to: runDir(base.frame(on.x, on.z)), side, off: 2 * (on.y - p) }, takes: 0.25, gather: [0.25, 0.9] };
  };
  const beginEnding = () => {
    if (inside) { beginRevert(); return; }
    // (Driven back up to the top: a new run there. Fallen off on the way: another cart brought down.)
    if (carting) { const top = ride.ended; unflip(); if (top) restart(); else beginCart(); return; }
    // (Not yet chosen: asked, and begun once it is.)
    if (!ending) { askWay(); return; }
    // (The ways that go back to the top, and only there, the arm in their place on the groomed slope, which has none, and out of bounds.)
    WAYS[needsTop(ending) && (land.length === Infinity || backOnto) ? 'arm' : ending].begin();
  };
  /** Let go, from `from`, flying back up the mountain: the throw to the top of the run worked out, and the view to be carried along after it. */
  const throwFrom = (c: Catapult, from: Vector3) => {
    c.fly = new Throw(from.clone(), c.landing.clone().addScaledVector(UP, middleOf()), c.downhill.clone().negate());
    c.letGo.copy(rider.quaternion);
    c.flown = 0; c.loose = 0;
    c.eye.off.copy(camera.position).sub(from);
    c.eye.rel.copy(c.eye.look).sub(from);
    c.eye.side = Math.sign(camera.position.clone().sub(from).dot(c.fly.dir.clone().cross(UP))) || 1;
  };
  /** A burst of snow thrown up about `p`, out to `r` metres from it: puffs and grains, `n` of them, as high as `up`. */
  const snowBurst = (p: Vector3, r: number, n: number, up: number) => {
    for (let i = 0; i < n; i++) {
      const a = sprayRng.range(0, TURN), out = new Vector3(Math.cos(a), 0, Math.sin(a)), from = onSnow(p.clone().addScaledVector(out, sprayRng.range(0.6, 1) * r)).addScaledVector(UP, 0.2);
      if (i % 3 === 0) throwPuff(from, out.clone().multiplyScalar(sprayRng.range(1.5, 4)).addScaledVector(UP, sprayRng.range(0.4, 1) * up), sprayRng.range(3, 5.5), 2.4);
      throwGrain(from, out.multiplyScalar(sprayRng.range(1, 5)).addScaledVector(UP, sprayRng.range(0.5, 1.2) * up));
    }
  };

  /**
   * The run's end a step on (`dt`; none while riding is held): the way it ends at its own work (the arm reaching and throwing, the
   * whirlwind carrying it round and up, the blast, the saucer's beam, the snowman's swing); what it takes gathered up into the pose it
   * is held in and let go; and it flown, under its canopy, and down at the top, where the run begins again. What the views and the rest
   * go by, as the ride's steps give it.
   */
  const stepCatapult = (dt: number, riding: Now): Now => {
    const c = cat!, way = WAYS[c.by], was = c.t, mid = middleOf();
    c.t += dt;
    const t = c.t;
    way.step(c, dt, was);
    // Taking it: what it takes put in the claw or the wind (or wherever it is to be held), gathered up into the pose it is held in from
    // how it lay (or stood), its rider put back in the saddle; and then held there, kicking.
    if (t >= c.takes && !c.held) {
      c.from = crash ? crash.dolls.map((d) => Object.fromEntries(Object.entries(d.doll.joints()).map(([k, v]) => [k, v.clone()]))) : skier.bodies().map((b) => b.joints());
      c.held = true;
      crash = null; air = null; joints = jointsBefore = null;
      ride.turn180 = null;
      told = { text: '', small: '', bad: false, until: 0 };
      way.took?.(c);
    }
    let speed = 0, middle = c.at.clone();
    if (c.held && !c.fly) {
      seat();
      middle = way.hold(c, dt);
      speed = dt > 0 ? middle.distanceTo(c.at) / dt : 0;
      const k = smooth((t - c.gather[0]) / (c.gather[1] - c.gather[0]));
      if (k < 1 && c.from) {
        // (Gathered from the joints it had, to the joints it is to have held, through the world's frame, as a body gone limp is posed.)
        rider.updateMatrixWorld(true);
        const to = skier.bodies().map((b) => b.joints());
        rider.position.set(0, 0, 0); rider.quaternion.identity(); rider.updateMatrixWorld(true);
        if (who === 'mounted') rider.add(jockey.model);
        skier.bodies().forEach((b, i) => b.poseJoints(Object.fromEntries(Object.entries(to[i]).map(([n, v]) => [n, (c.from![i][n] ?? v).clone().lerp(v, k)]))));
      }
      // Let go: as the arm's throw comes round over the top; as the whirlwind has carried it up as high as it carries it; and so on. (Only
      // once it is gathered up, its rider back in the saddle: let go mid-gather, as the snowman's drive was, the rider flew the whole way
      // posed in the world's frame where it had been taken, far from the horse, which came down under its canopy alone.)
      if (k >= 1 && way.lets(c)) throwFrom(c, middle);
      // (Or done with it without a throw: the land turned over, and the ride handed back.)
      const done = k >= 1 ? way.ends?.(c) : null;
      if (done) return done;
    }
    // (Until it has it, what the ride says goes; and where the view is about, the skier's own place.)
    if (!c.held) { c.at.copy(focus()).addScaledVector(UP, mid); return riding; }
    if (c.fly) {
      const fly = c.fly;
      // (Its flight brought up to its pace over its first moments: from the throw's own speed at once, hundreds of metres a second, the
      // view following it was flung away in a single frame.)
      c.loose += dt;
      const pace = way.launch + (1 - way.launch) * smooth(c.loose / 0.8);
      c.flown = Math.min(fly.total, c.flown + dt * pace);
      const ft = c.flown, opening = fly.free - 0.45, v = fly.velocity(ft);
      middle = fly.at(ft);
      speed = v.length();
      // Tumbling head over heels and round as it flies; under the canopy, brought upright, and turned round to face down the run.
      // (Out of the claw, it begins to tumble as it goes; out of the whirlwind, it was tumbling already.)
      // (A ski jumper does not tumble: `glides`.)
      const wild = way.glides ? 0 : way.tumbling ? 1 : smooth(ft / 0.3);
      if (ft < opening) { c.tumble.flip -= TURN * 1.15 * wild * dt; c.tumble.spin += TURN * 0.45 * wild * dt; }
      else if (!c.spun) { c.spun = { ...c.tumble }; told = { text: '', small: '', bad: false, until: 0 }; }
      const settle = c.spun ? smooth((ft - opening) / 0.8) : 0, round = (a: number) => Math.round(a / TURN) * TURN;
      const flip = c.spun ? c.spun.flip + (round(c.spun.flip) - c.spun.flip) * settle : c.tumble.flip;
      const spin = c.spun ? c.spun.spin + (round(c.spun.spin) - c.spun.spin) * settle : c.tumble.spin;
      // (Turned about the upright from the way it flies to the way down the run, the shorter way round: which, coming back up the run,
      // is near enough half a turn.)
      const round_ = Math.atan2(fly.dir.clone().cross(c.downhill).dot(UP), fly.dir.dot(c.downhill));
      const toward = fly.dir.clone().applyAxisAngle(UP, round_ * smooth((ft - fly.free - 0.3) / Math.max(0.5, fly.chute - 1.3)));
      const q = c.letGo.clone().slerp(uprightTo(toward), smooth(ft / 0.35));
      const under = ft >= opening, landing = smooth((ft - (fly.total - 0.7)) / 0.7);
      // (Gliding, laid out over its skis in a ski jumper's flight, its nose with the way it flies, up and then down, until its canopy.)
      if (way.glides && !under) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.6 * Math.atan2(v.y, Math.hypot(v.x, v.z))));
      skier.air(under
        ? { tuck: 0, flight: 0, open: 1, throw: 0, wrap: 0, ski: 0, spin, flip, reach: landing }
        : way.glides ? { tuck: 0, flight: 1, open: 0, throw: 0, wrap: 0, ski: 0, spin: 0, flip: 0.3 }
          : { tuck: 0.25, flight: 0, open: 0, throw: 0, wrap: 0, ski: 0.2 * Math.sin(ft * 5), spin, flip, spread: 0.65 + 0.35 * Math.sin(ft * 7.3), cross: 0.2 });
      // Hung under the canopy, swinging on its lines: forward as the canopy takes hold and it goes on, back, and still by the snow.
      const ch = chuteOf(), u = ft - fly.free, swing = under && u > 0 ? 0.36 * Math.exp(-u / 1.1) * Math.sin(3.2 * u) * (1 - smooth((ft - (fly.total - 1.1)) / 1.0)) : 0;
      const sway = new Quaternion().setFromAxisAngle(fly.dir.clone().cross(UP).normalize(), swing);
      rider.quaternion.copy(sway).multiply(q);
      // (Swung about the canopy, which goes on where the flight goes: the skier's middle on it as it hangs still.)
      const riserUp = ch.riser.clone().sub(new Vector3(0, mid, 0)).applyQuaternion(q), canopy = middle.clone().add(riserUp).addScaledVector(UP, ch.reach);
      const hung = middle.clone().sub(canopy).applyQuaternion(sway).add(canopy);
      rider.position.copy(hung).addScaledVector(UP.clone().applyQuaternion(rider.quaternion), -mid);
      rider.updateMatrixWorld(true);
      // The canopy: out of its pack a moment before the arch's end, snapping full, and breathing a little as it settles.
      const o = (ft - opening) / 0.75, full = o > 1 ? 1 + 0.1 * Math.sin(Math.min(1, (o - 1) * 1.2) * Math.PI) : Math.max(0, o);
      if (o > 0) chute.set(rider.localToWorld(ch.riser.clone()), canopy.clone().sub(rider.localToWorld(ch.riser.clone())), ch.radius, ch.reach, full, 0, ch.straps.map((s) => rider.localToWorld(s.clone())));
      middle = hung;
      // Down at the top: the run begins again there, the canopy left lying behind.
      if (ft >= fly.total) {
        const ride0 = { riser: rider.localToWorld(ch.riser.clone()), up: canopy.clone().sub(rider.localToWorld(ch.riser.clone())).normalize(), radius: ch.radius, reach: ch.reach };
        const eye = camera.position.clone(), look = c.eye.look.clone(), onto = backOnto, wasShow = showEnding;
        if (onto) resumeAt(onto); else restart();
        if (wasShow) showBack = 1.4;
        ride.sink = 0.6;
        spent = { ...ride0, t: 0, behind: c.downhill.clone().negate() };
        snowBurst(c.landing, 1.6, 50, 2.2);
        // (The view goes on from where it was, eased to where the view chosen would have it, rather than starting there afresh.)
        handOver(eye, look, c.downhill);
        return { down: ride.down, left: ride.left, speed: ride.speed, way: 0, ski: 0, skid: 0, tuck: 0, brake: 0 };
      }
    }
    const f = land.frame(middle.x, middle.z, c.down);
    c.down = f.s;
    c.at.copy(middle);
    return { down: f.s, left: f.left, speed, way: ride.way, ski: ride.way, skid: 0, tuck: 0, brake: 0 };
  };
  /** How far up the run from its foot the whirlwind begins to gather, as the skier comes down to it. */
  const GATHER = 480;
  /** How long it has been gathering, for its wandering; and which way it goes as it dies away. */
  let brewing = 0;
  const dying = new Vector3();
  /**
   * The whirlwind a step on, whatever the run's end is doing: gathering at the foot of the run as the skier comes down to it, if the
   * run is to end in it, stronger the nearer the skier comes (from a whirl of snow at first sight to a funnel under a dark cloud),
   * wandering about where the run ends and drawn toward the skier's line as it comes near; once it has thrown what it took, or it is
   * not wanted, thinning out and gone, going on its way.
   */
  const stepWhirlwind = (dt: number) => {
    if (mode === 'ride' && ending === 'whirlwind' && !cat && land.length < Infinity && land.length - ride.down < GATHER) {
      const near = clamp(1 - (land.length - ride.down) / GATHER, 0, 1);
      brewing += dt;
      const p = land.at(land.length + 6, clamp(ride.left * 0.6 * smooth(near * 2 - 1), -25, 25));
      const spot = new Vector3(p.x + 7 * Math.sin(brewing * 0.13), 0, p.z + 7 * Math.cos(brewing * 0.1));
      spot.y = ground(spot.x, spot.z);
      if (!whirl.group.visible) { whirl.strength = 0.02; whirl.place(spot); dying.copy(runDir(p)).multiplyScalar(4); }
      else { whirl.base.lerp(spot, ease(dt, 0.6)); whirl.base.y = ground(whirl.base.x, whirl.base.z); }
      whirl.strength += (0.12 + 0.63 * smooth(near) - whirl.strength) * ease(dt, 0.7);
    } else if (whirl.group.visible && (!cat?.whirl || cat.fly)) {
      whirl.strength = Math.max(0, whirl.strength - dt / 3.5);
      whirl.base.addScaledVector(dying, dt);
      whirl.base.y = ground(whirl.base.x, whirl.base.z);
    }
    whirl.step(dt, camera, ground);
  };
  /**
   * The light under the whirlwind's cloud: the sun, the sky's light and the sky itself dimmed, the stronger it is and the nearer the view
   * is to it. And the blast's flash, lighting everything up for a moment.
   */
  const SUN = sun.intensity;
  const gloom = (dt: number) => {
    const g = whirl.group.visible ? whirl.strength * (1 - smooth((camera.position.distanceTo(whirl.base) - 150) / 350)) : 0;
    thump *= Math.exp(-dt / 0.15);
    const flash = Math.max(blast.group.visible ? blast.flash : 0, thump);
    // (Into the cave, the sun and the sky's light left outside, and the picture drawn brighter, as the eye takes to the dark.)
    sun.intensity = SUN * (1 - 0.5 * g) * (1 + 2.5 * flash) * (1 - caveDark);
    sky.intensity = land.sky * (1 - 0.3 * g) * (1 + 1.5 * flash) * (1 - 0.94 * caveDark);
    renderer.toneMappingExposure = 0.92 * (1 + 0.3 * caveDark);
    uGloom.value = g;
  };
  /** The spent parachute, a step on: sinking down behind where it came down, flattening out on the snow, and gone. */
  const stepSpent = (dt: number) => {
    if (!spent) return;
    const s = spent;
    s.t += dt;
    const k = smooth(s.t / 1.8), up = s.up.clone().lerp(s.behind.clone().addScaledVector(UP, 0.25), k).normalize();
    const riser = s.riser.clone().lerp(onSnow(s.riser.clone()), k);
    chute.set(riser, up, s.radius, s.reach, 1 - 0.05 * k, k, []);
    if (s.t > 4.5) { spent = null; chute.hide(); }
  };

  /** The skier in the air, a step on: thrown, turning as it is making its turns, opening up to land, and down. */
  const stepAir = (dt: number): Now => {
    const a = air!;
    a.t += dt;
    const v = a.v.length();
    a.v.y -= G * dt;
    a.v.addScaledVector(a.v, -0.004 * v * dt);
    ride.x += a.v.x * dt; ride.y += a.v.y * dt; ride.z += a.v.z * dt;
    keepOn();
    ride.time += dt;
    // (Flown into a tree, below its top: thrown, `TREE`.)
    const tree = mode === 'ride' && !flyingDemo ? land.treeNear?.(ride.x, ride.z, treeBody()) : null;
    if (tree && ride.y < ground(tree.x, tree.z) + tree.tall * 0.9) { air = null; fall('flew into a tree'); return stepFallen(dt); }
    // Opening up to land, the last few tenths of a second before the snow, or once its turns are made (a moment after, if it holds a
    // grab); a tighter tuck turns it quicker, laid out or spread it turns slower.
    const left = timeToSnow(new Vector3(ride.x, ride.y, ride.z), a.v);
    const made = a.done === null || !(a.spinTo || a.flipTo || a.rollTo) ? 0 : smooth((a.t - a.done - 0.12 - 0.2 * Math.max(a.style.mute, a.style.tail)) / 0.3);
    const open = a.kind === 'hop' ? 0 : Math.max(1 - smooth(left / 0.4), made);
    // The styles, from what is asked in the air (not at once off the lip, where the ask made the trick): up and to a side, a grab, to
    // the left a mute, to the right a tail grab; down, in straight air a spread eagle and in a flip a flip laid out.
    const grab = a.t > 0.12 && ask.y > 0.35 && Math.abs(ask.x) > 0.45, down = a.t > 0.12 && ask.y < -0.5;
    const want_: Record<Style, number> = {
      mute: grab && ask.x < 0 ? 1 : 0, tail: grab && ask.x > 0 ? 1 : 0,
      spread: down && a.kind === 'air' && !a.spinTo ? 1 : 0, layout: down && a.kind === 'flip' ? 1 : 0,
    };
    for (const k of STYLES) {
      a.style[k] += (want_[k] * (1 - open) - a.style[k]) * ease(dt, 7);
      if (a.style[k] > 0.6) a.held[k] += dt;
    }
    // A spin held goes on round: another half turn each time it comes within some two hundred degrees of where it is to stop, as long
    // as the turn is held hard its way (and not drawn up into a tuck or a grab, a moment after the lip: a cork leaves tucked); let go,
    // it stops at the next half turn ahead, paced to come round a little before the snow as a flip is off the lip (held, it goes as
    // quick as it can).
    if (a.holding) {
      a.holding = ask.x * -a.spinDir > HOLD && (ask.y < 0.35 || a.t < 0.25);
      if (a.holding && Math.abs(a.spinTo - a.spin) < deg(200) && halvesOf(a) < 10) a.spinTo += a.spinDir * Math.PI;
    }
    // (Over its last moments, no slower than it was going: paced only by what is left and the time left, both coming to nothing, it went
    // slower and slower, and crept through its last tenth of a turn for half a second.)
    const until = Math.max(0.15, left - TRICK_END), last = until < 0.3;
    const pace = (short: number, rate: number, was: number) => { const p = clamp(short / (rate * TURN * until), SLOWEST, 1); return last ? Math.max(p, was) : p; };
    a.rate.spin = a.holding || !a.spinDir ? 1 : pace(Math.abs(a.spinTo - a.spin), SPIN_RATE, a.rate.spin);
    if (a.flipTo) a.rate.flip = pace(Math.abs(a.flipTo - a.flip), FLIP_RATE, a.rate.flip);
    const quick = (1 + 0.45 * Math.max(0, ask.y) - 0.1 * Math.max(a.style.layout, a.style.spread)) * (1 - 0.5 * open);
    const turned = (now: number, to: number, rate: number) => {
      const short = to - now;
      if (!short) return now;
      const most = rate * TURN * dt * quick * Math.min(1, 0.3 + Math.abs(short) / 1.0) * Math.min(1, (a.t + 0.08) / 0.25);
      return now + Math.sign(short) * Math.min(Math.abs(short), most);
    };
    a.flip = turned(a.flip, a.flipTo, FLIP_RATE * a.rate.flip);
    a.spin = turned(a.spin, a.spinTo, SPIN_RATE * a.rate.spin);
    a.roll = a.rollTo * rolledAt(a, a.t);
    if (a.done === null && a.flip === a.flipTo && a.spin === a.spinTo && a.roll === a.rollTo) a.done = a.t;
    a.name = trickName(a);
    const way = Math.atan2(a.v.dot(runLeft(here)), a.v.dot(runDir(here)));
    ride.way = way;
    ride.facing += wrapAngle(way + switched() - ride.facing) * ease(dt, 6);
    ride.flickL = ride.flickR = 0;
    // (How far round the flip is, for the head to look back for the snow over its second half.)
    const flipped = a.flipTo ? a.flip / a.flipTo : 0;
    // (Rolling, drawn up into a tuck over its first quarter, held, and opened out over its last: `ROLL`.)
    const rollU = a.rollTo ? clamp((a.t - ROLL.from) / a.rollFor, 0, 1) : 0, rollTuck = a.rollTo ? ROLL.tuck * smooth(rollU / 0.25) * (1 - smooth((rollU - 0.72) / 0.28)) : 0;
    posed = { air: true, c: {
      tuck: Math.max(0, ask.y, rollTuck), flight: a.kind === 'flight' ? smooth(a.t / 0.3) : 0, open,
      throw: a.kind === 'flip' ? (1 - smooth(a.t / 0.35)) * (1 - a.style.layout) : 0, wrap: a.spinTo ? smooth(a.t / 0.2) : 0, ski: wrapAngle(ride.way + switched() - ride.facing), spin: a.spin, flip: a.flip,
      cross: a.flipTo && a.spinDir ? smooth((a.t - 0.15) / 0.25) : 0,
      pop: a.pop0 * (1 - smooth(a.t / 0.26)), set: a.set, lead: (a.spinTo - a.spin) * smooth(a.t / 0.15), spot: smooth((flipped - 0.45) / 0.3),
      cork: a.cork * (1 - open), layout: a.style.layout, spread: a.style.spread, mute: a.style.mute, tail: a.style.tail, reach: a.kind === 'hop' ? 0 : 1 - smooth(left / 0.2),
    } };
    sanePose(posed.c as unknown as Record<string, unknown>, 'in the air');
    if (!quiet) skier.air(posed.c as AirControls);
    // (Upright to the land under it, smoothed over some metres; its nose up as it left the lip, coming level over the flight.)
    standAt(new Vector3(ride.x, ride.y, ride.z), normalAt(ride.x, ride.z, 1.5), ride.facing, here, a.nose * (1 - smooth(a.t / (0.75 * a.T))));
    rollAbout(a.roll, rollTuck);
    if (!quiet) keepJoints(dt);
    if (ride.y <= ground(ride.x, ride.z)) land_();
    return { down: here.s, left: here.left, speed: Math.hypot(a.v.x, a.v.z), way, ski: ride.way, skid: 0, tuck: ride.tuck, brake: 0 };
  };

  /**
   * Gone limp and sliding on (asked: "when player falls and goes into a long (5+ sec glide down the slopes out of bound) make the body
   * brake down to bring the transition happen faster"): the snow's hold on a body (0.55 of its weight) is less than the pull down a slope
   * steeper than some 29 degrees, as much of the land off the piste is, and a body fallen there slid on for many seconds before the run
   * could end. So after `after` seconds down, the hold grows by `rate` a second up to `most`, as a body digs into the snow: one that has
   * stopped is no different, one sliding on is brought to a stop within a couple of seconds more. A body tumbling on, which friction
   * holds only as it strikes the snow (a rider thrown from the horse rolled on down for five seconds more), slowed from `dragAfter`
   * seconds by a drag on it all that grows by `dragRate` a second up to `dragMost`. And stopped so on steep snow, its
   * limbs may twitch on for seconds, never all still at once (`stillFor`): so the run may end too once every body's middle has stayed
   * within `near` metres of where it was for `settled` seconds together (`crash.settled`, from `crash.anchors`).
   */
  const FALL_BRAKE = { after: 1.5, rate: 1.2, most: 3, dragAfter: 3, dragRate: 0.8, dragMost: 2, near: 0.4, settled: 1 };
  /** Gone limp, a step on. */
  const stepFallen = (dt: number): Now => {
    const was = fallenAt();
    const c = crash!;
    for (const { body, doll } of c.dolls) {
      doll.friction = clamp(0.55 + (doll.time - FALL_BRAKE.after) * FALL_BRAKE.rate, 0.55, FALL_BRAKE.most);
      doll.drag = clamp(0.03 + (doll.time - FALL_BRAKE.dragAfter) * FALL_BRAKE.dragRate, 0.03, FALL_BRAKE.dragMost);
      doll.step(dt); body.poseJoints(doll.joints());
    }
    // (Moved off from where they were, the clock begun again from where they are now.)
    if (c.anchors.length && c.dolls.every((d, i) => d.doll.middle().distanceTo(c.anchors[i]) < FALL_BRAKE.near)) c.settled += dt;
    else { c.anchors = c.dolls.map((d) => d.doll.middle().clone()); c.settled = 0; }
    ride.time += dt;
    const at = fallenAt(), went = at.clone().sub(was), f = land.frame(at.x, at.z, ride.down);
    return { down: f.s, left: f.left, speed: went.length() / dt, way: ride.way, ski: ride.way, skid: 0, tuck: 0, brake: 0 };
  };
  /** Where what has fallen is, for the view to follow: the first of its bodies (a horse, not the rider thrown from it). */
  const fallenAt = () => crash!.dolls[0].doll.middle().clone();
  /** How long all of it has lain still. */
  const stillFor = () => Math.min(...crash!.dolls.map((d) => d.doll.still));
  /** Whether what has fallen has come to rest: all of it still, or its middles barely moving for a second (`FALL_BRAKE`). */
  const atRest = () => stillFor() > 0.6 || crash!.settled > FALL_BRAKE.settled;

  const stepRide = (dt: number): Now => {
    easeAsk(dt);
    if (!air) rollShift.set(0, 0, 0);
    if (crash) return stepFallen(dt);
    if (air) return stepAir(dt);
    const g = kit();
    // (At the foot of the run it brakes to a stop by itself.)
    const braking = want.brake || want.brakeKey || ride.ended;
    if (braking && ride.brake < 0.05) ride.brakeSide = Math.sign(ride.way || ride.lean) || 1;
    ride.brake += ((braking ? 1 : 0) - ride.brake) * ease(dt, 6);
    // Turning: quicker the faster (a carving ski holds its own curve, some twenty metres across at speed), if never too slowly to come
    // round; wider tucked; none while braking. Pushed out to the ends of the range (asked: "also extreme control range ends with right
    // and/or left turns should make the turns skidded instead of carved"), the turn is skidded: the skis pivoted across the way they
    // go, their tails sliding out, so that the turn comes round quicker than a carve can, flatter on the snow and less leant, scraping
    // and throwing snow and losing speed as it does.
    ride.skid += (smooth((Math.abs(ask.x) - SKID_FROM) / (0.97 - SKID_FROM)) * (1 - ride.brake) - ride.skid) * ease(dt, 5);
    const turning = -carveOf(ask.x) * clamp(ride.speed / 9, 0.5, 1.2) * (1 - 0.35 * ride.tuck) * (1 - ride.brake) * (1 + 0.6 * ride.skid) * Math.max(0.5, 1 + g.turn);
    const pivot = Math.sign(turning) * SKID_TURN * ride.skid;
    // (Steered freely, all the way round, and back up the run the way it came (asked: "allow the player to steer freely, also to go
    // back uphill where they came from"): it was held to within some hundred and ten degrees of straight down the run.)
    ride.way = wrapAngle(ride.way + turning * dt);
    // The skiable path's edges, marked by its poles: turned back towards its middle near them (the nearer, the narrower the path), and
    // kept off them: going down the run, toward straight down it; going back up it, toward straight up it. (Off the piste allowed, only
    // near the snow's reach.)
    const [lo, hi] = reachAt(ride.down), near = Math.min(8, (hi - lo) / 4), across = Math.sin(ride.way);
    if ((ride.left > hi - near && across > 0) || (ride.left < lo + near && across < 0)) {
      const to = Math.abs(ride.way) <= Math.PI / 2 ? 0 : Math.sign(ride.way) * Math.PI;
      ride.way += clamp(to - ride.way, -dt * 2.2, dt * 2.2);
    }
    // Its speed: its weight pulling it down the snow as much as the snow falls the way it goes, less the snow's friction (its weight
    // into the snow), the air's drag (much less tucked, more standing tall), a little lost to every turn, and a great deal to braking.
    // (Going up a kicker, or a rise, its weight pulls it back.)
    const go = along(ride.way, here), [gx, gz] = slopeAt(ride.x, ride.z), rise = gx * go.x + gz * go.z, level = 1 / Math.hypot(1, rise);
    // (How steeply a kicker under it rises over the land, from just behind: not across its lip, to its steep back.)
    const into = G / Math.hypot(1, gx, gz), e = 0.3;
    const nose = Math.atan((bumpAt(ride.x, ride.z) - bumpAt(ride.x - go.x * e, ride.z - go.z * e)) / e);
    // (Skis found that run faster, as much faster at the top as they ask, by less drag: the speed it settles at goes as its root.)
    const drag = (0.0065 + (0.0037 - 0.0065) * ride.tuck + (0.012 - 0.0065) * ride.tall) / (1 + g.top) ** 2;
    // (A ground 180 under way: what it is doing at this point of it; it ends, half round, switch or back.)
    let g180: ReturnType<typeof shape180> | null = null;
    if (ride.turn180) {
      const tr = ride.turn180;
      tr.t += dt;
      if (tr.t >= G180[tr.kind].T) { ride.facing += tr.dir * Math.PI; ride.switch = !ride.switch; ride.turn180 = null; }
      else g180 = shape180(tr.kind, tr.t / G180[tr.kind].T);
    }
    const sideOn = g180 ? Math.abs(Math.sin(Math.PI * g180.rot)) : 0;
    // (Driving the rocket cart back up, its engine pushing it on.)
    const push = cartThrust();
    cartPush += ((push ? push / 15 : 0) - cartPush) * ease(dt, 6);
    ride.shove = Math.max(0, ride.shove - dt);
    // (Skis found that float in deep snow: its hold on them less; that push on from slow; that grate less over the stones.)
    const stones = stonesNow(dt), deep = deepNow(dt) * (1 - Math.min(0.9, g.powder)), lift = carting || ride.ended ? 0 : g.accel * ACCEL_PUSH * Math.max(0, 1 - ride.speed / 25) * (1 - ride.brake);
    const pull = lift + push + shoveNow() + boostNow(dt) + skateNow(dt, G * rise * level + DEEP.friction * deep * into) - G * rise * level - (0.04 + STONES.grip * (1 - Math.min(0.6, g.stones / 30)) * stones * smooth(ride.speed / STONES.slow) + DEEP.friction * deep) * into - (drag + (carting ? 0.006 : 0) + DEEP.drag * deep) * ride.speed ** 2 - 0.05 * Math.abs(turning) * ride.speed - 7 * ride.brake - (stopping ? 6 * ride.brake : 0) - 6 * Math.abs(Math.sin(pivot)) - (g180 ? g180.slow * sideOn : 0);
    ride.speed = Math.max(0, ride.speed + pull * dt);
    // (Its speed run out going up an arena's pipe, turned round where it stands to come back down its face, as a halfpipe's wall turns a
    // skier. Elsewhere it stops, as it always did; on the snow up to the great one too, which it had turned round on as well, and the
    // skier, steering up to it, was turned back to the pipe each time it slowed.)
    if (ride.speed < 0.4 && rise > 0.05 && inArena() && arenaRaise(ride.x, ride.z) > 0.05) ride.way = wrapAngle(ride.way + Math.PI);
    ride.x += go.x * ride.speed * level * dt; ride.z += go.z * ride.speed * level * dt;
    ride.time += dt;
    if (intoTree(go) || intoRock(go)) return stepFallen(dt);
    // On the snow as high as the snow is where it went; unless the snow falls away faster than the skier's weight can bring it down
    // after it (by more than the snow gives underfoot), and the skier leaves it, rising as it was over its last step (up a kicker's
    // ramp, off its lip). (Judged where it went, before it is kept on the path: moved back in from an edge, onto snow higher or lower,
    // it would have seemed to rise or fall as fast as it was moved, and been thrown.)
    const g1 = ground(ride.x, ride.z), thrown = ride.y + ride.vy * dt - 0.5 * G * dt * dt;
    if (g1 < thrown - 0.03) {
      ride.y = thrown;
      keepOn();
      takeOff(go.clone().multiplyScalar(ride.speed * level).setY(ride.vy - G * dt), nose, ride.pop);
      return stepAir(0);
    }
    ride.vy = clamp((g1 - ride.y) / dt, -ride.speed, ride.speed);
    keepOn();
    ride.y = ground(ride.x, ride.z);
    ride.out = bumpAt(ride.x, ride.z);
    // Over a knoll or a crest taken fast (asked: "could we make it so that it is possible to get some airtime also if you ride fast
    // enough over a mound? it doesn't need to happen often but when the circumstances are good"). How sharply the snow ahead turns
    // over, as the pull it would take to hold the skier to it (the speed squared over the crest's radius), judged over the next two
    // fifths of a second of the way, not over a step: the snow has knobs a hand high, and over a step alone the skier was either held to every
    // crest or thrown off every knob. Where it turns over faster than the skier's weight can bring it down after it, it leaves the snow,
    // rising as it was; and where it turns over nearly as fast as that, it springs off the crest as a skier does off a roller, the
    // harder the sharper (`KNOLL`). A moment after landing, before it does again. (Held to the snow, it took a crest of less than sixty
    // metres across at 90 km/h to throw a skier; the runs, along the fall of the land, have few.)
    if (!carting && !g180 && ride.out < 0.01 && arenaRaise(ride.x, ride.z) < 0.01 && ride.speed > KNOLL.speed && (ride.time > knollAfter || knollAfter - ride.time > KNOLL.after)) {
      // (The least it turns over at any of those times: a crest turns over all the way along, a knob only for a moment, and taken at
      // the most, every knob was a crest and the skier hopped off each, a step's height, and was slowed.)
      let pull = Infinity;
      for (const t of KNOLL.ahead) {
        const d = ride.speed * level * t, below = ride.y + ride.vy * t - ground(ride.x + go.x * d, ride.z + go.z * d);
        pull = Math.min(pull, below / (0.5 * t * t));
      }
      if (pull > KNOLL.bend * G) {
        // (The sharper, the harder it springs; off one that would throw it anyway as hard as any, or it left the snow for a step or two
        // as the crest fell away from under it, and was on it again over the next knob.)
        const spring = KNOLL.pop[0] + (KNOLL.pop[1] - KNOLL.pop[0]) * smooth((pull / G - KNOLL.bend) / (1 - KNOLL.bend));
        // (Off the snow by a hair: put back on it this step, the air's first look found it there and landed it at once.)
        ride.y += 0.005;
        takeOff(go.clone().multiplyScalar(ride.speed * level).setY(ride.vy + spring), nose, 0, true);
        return stepAir(0);
      }
    }
    // The lean into the turn that speed and turning ask, as `makeDownhillRun` reckons it (up to half as far again as the turns' own,
    // where the deepest carves lie: `riderPose`, `horseRidePose`); and the inside pole flicked as a turn begins.
    const lean = clamp(Math.atan((ride.speed * turning) / G) / ((48 * Math.PI) / 180), -1.5, 1.5) * (1 - ride.brake) * (1 - 0.4 * ride.skid);
    ride.lean += (lean - ride.lean) * ease(dt, 10);
    const side = Math.abs(ride.lean) > 0.2 ? Math.sign(ride.lean) : 0;
    if (side && side !== ride.leanSide) { if (side > 0) ride.flickL = FLICK; else ride.flickR = FLICK; }
    if (side) ride.leanSide = side;
    ride.flickL = Math.max(0, ride.flickL - dt);
    ride.flickR = Math.max(0, ride.flickR - dt);
    const bump = (left: number) => (left > 0 ? Math.sin((Math.PI * (FLICK - left)) / FLICK) : 0) * (1 - ride.tuck);
    // (Riding switch, its body faces back up the slope, its skis' tails leading; it leans into a turn the other way in its own frame,
    // and the pole it flicks is its other hand's.)
    ride.facing += wrapAngle(chestTo(ride.way) + switched() - ride.facing) * ease(dt, 2);
    const ski = ride.way + pivot + ((ride.brakeSide * 78 * Math.PI) / 180) * ride.brake, mirror = ride.switch ? -1 : 1;
    // Crouched going up a kicker's ramp, the more the steeper, and springing up out of the crouch over its last metre or two to the lip
    // (the pop); sunk into a landing, quickly, and coming up out of it more slowly; and out of what is left of a turn of the whole body.
    ride.pop = ride.out > 0.02 && nose > 0.02 ? smooth((bumpShare(ride.x, ride.z) - 0.45) / 0.45) : 0;
    const crouch = ride.out > 0.05 ? 0.5 * clamp(Math.sin(nose) / 0.34, 0, 1) * (1 - ride.pop) : 0;
    ride.sink = Math.max(0, ride.sink - dt * 1.5);
    ride.absorb += (Math.max(crouch, ride.sink, g180?.sink ?? 0) - ride.absorb) * ease(dt, 16);
    const settling = smooth(ride.settle.left / 0.25);
    ride.settle.left = Math.max(0, ride.settle.left - dt);
    // Its knees giving to the snow's shape: sunk into a hollow and let long over a crest, as much as the snow under it, taken at its
    // speed, would throw it up or let it drop (the snow's bend along the way it goes, over a metre either side, by its speed squared);
    // and a little chatter at speed. Riding switch, its head turned to look back the way it goes.
    const g0 = ground(ride.x, ride.z), bend = ground(ride.x + go.x, ride.z + go.z) - 2 * g0 + ground(ride.x - go.x, ride.z - go.z);
    const shake = 0.05 * smooth((ride.speed - 12) / 10) * Math.sin(ride.time * 47) * Math.sin(ride.time * 13.3);
    // (Over the stones, jarred: knocked down and up, a few times a second, the harder the faster.)
    const jar = 0.9 * stones * smooth(ride.speed / 8) * Math.sin(ride.time * 19) * Math.sin(ride.time * 7.3 + 1);
    ride.flex += (clamp((bend * ride.speed ** 2) / 14, -1, 1) + shake + jar - ride.flex) * ease(dt, 9);
    ride.back += ((ride.switch ? 1 : 0) - ride.back) * ease(dt, 3);
    posed = { air: false, c: {
      s: ride.lean * mirror, ski: wrapAngle(ski + switched() - ride.facing), tuck: ride.tuck, brake: ride.brake, tall: ride.tall,
      flickL: bump(ride.switch ? ride.flickR : ride.flickL), flickR: bump(ride.switch ? ride.flickL : ride.flickR),
      absorb: ride.absorb, spin: ride.settle.spin * settling + (ride.turn180 && g180 ? ride.turn180.dir * Math.PI * g180.rot : 0), flip: ride.settle.flip * settling,
      skid: Math.max(ride.skid, g180 ? 0.8 * g180.scrape * sideOn : 0), pop: ride.pop, life: ride.time, flex: ride.flex, back: ride.back, press: g180?.press ?? 0,
      skate: ride.skate, stride: ride.stride, powder: powderNow(),
    } };
    sanePose(posed.c as unknown as Record<string, unknown>, 'on the snow');
    if (!quiet) skier.ride(posed.c as RideControls);
    // (Upright to the snow under it, smoothed over half a metre, as skis bridge what is smaller. In a ground 180: sprung up off it in a
    // pop; tipped onto the tips or the tails in a butter, the pressed ends kept on the snow and the body carried round about them.)
    // (Sunk into deep snow off the piste, `DEEP`.)
    const stand = new Vector3(ride.x, ride.y + (carting ? CART_DECK : 0) - sunkNow(), ride.z);
    if (ride.turn180 && g180) {
      stand.addScaledVector(UP, g180.lift);
      if (g180.press) {
        const reach = g180.press > 0 ? (who === 'person' ? 0.85 : 1.1) : -(who === 'person' ? 0.78 : 1.0), arm = along(ride.facing, here).multiplyScalar(reach);
        const round = arm.clone().applyAxisAngle(UP, ride.turn180.dir * Math.PI * g180.rot), fade = 1 - smooth((ride.turn180.t / G180[ride.turn180.kind].T - 0.65) / 0.35);
        stand.add(arm.sub(round).multiplyScalar(fade)).addScaledVector(UP, Math.abs(reach) * Math.sin(Math.abs(g180.pitch)));
      }
    }
    standAt(stand, normalAt(ride.x, ride.z, 0.5), ride.facing, here, (g180?.pitch ?? 0) + (who === 'person' ? 0 : DEEP.horsePitch * powderNow()));
    if (!quiet) keepJoints(dt);
    // Taken onto the stones too fast, thrown (`STONES`).
    if (ride.overStones > STONES.catch && ride.speed > STONES.fast + g.stones / 3.6 && !ride.ended) { ride.overStones = 0; fall('caught an edge on the stones'); }
    // At the foot of a world's run: brought to a stop there.
    if (!ride.ended && ride.down > land.length - 30) { ride.ended = true; if (inside) tell('Back at the top', 'the world turning the right way up', false, 1e9); else if (carting) tell('At the top', 'a new run in a moment', false, 1e9); else { if (!flyingDemo && !quiet) runOver = { what: 'The foot of the run', why: '', bad: false, drop: land.fall, time: ride.time }; tell('The foot of the run', `${land.fall.toFixed(0)} m vertical in ${ride.time.toFixed(0)} s · ${score.toLocaleString('en')} points${bestBefore > 0 && score > bestBefore ? ' · new best!' : ''}`, false, 1e9); } }
    return { down: ride.down, left: ride.left, speed: ride.speed, way: ride.way, ski, skid: Math.max(Math.abs(Math.sin(ski - ride.way)), g180 ? g180.scrape * sideOn : 0), tuck: ride.tuck, brake: ride.brake, deep: ride.deep };
  };
  /** On foot, what it is doing, in words: in the camp, in the tunnel, or in which of the dungeon's rooms. */
  const footDoing = () => {
    const cave = caveNow(), f = foot!, o = land.group.position, x = f.x - o.x, z = f.z - o.z, room = cave?.roomAt(x, z);
    const going = Math.abs(f.speed) < 0.2 ? 'Standing' : f.speed < 0 ? 'Stepping back' : f.speed > (walks() ? FOOT.walk : FOOT.horseWalk) + 0.3 ? (walks() ? 'Running' : 'Trotting') : 'Walking';
    return `${going} ${room ? `in the ${room.kind === 'gate' ? 'antechamber' : room.kind}` : cave?.inside(x, z) ? 'in the cave' : 'in the camp'}`;
  };
  /** What the ridden skier is doing, in words. */
  const doingNow = () => { const d = doing_(); return ride.switch && !air && !crash && !cat ? `${d}, switch` : d; };
  const doing_ = () => {
    if (foot && playing && !menuOpen) return footDoing();
    // (Held, and said so: Space pressed by chance while riding stopped everything with nothing to say why.)
    if (!playing) return document.body.classList.contains('mouse') ? 'Paused · Space to go on' : 'Paused';
    if (menuOpen) return 'Paused · menu open';
    if (asking) return 'Choosing the way back';
    if (cat?.fly) return cat.flown >= cat.fly.free - 0.45 ? 'Under the parachute' : backOnto ? 'Thrown back onto the piste' : 'Thrown back to the top';
    if (cat?.held) return WAYS[cat.by].holding;
    if (cat && !crash) return WAYS[cat.by].coming;
    if (ride.turn180) return `${G180[ride.turn180.kind].name}…`;
    if (rideTrick && !rideTrick.air && !air && !crash) return `Up to the kicker: ${demoName(rideTrick.trick)}`;
    if (crash) return stillFor() > 0.5 || atRest() ? 'Down in the snow' : 'Tumbling';
    if (air) return air.kind === 'hop' ? 'In the air' : `${air.name}…`;
    if (ride.brake > 0.5) return who === 'person' ? 'Braking' : 'Sliding stop';
    if (ride.speed < 0.5) return ride.ended ? 'At the foot of the run' : 'Standing';
    if (ride.out > 0.05) return 'Up the kicker';
    if (ride.stones > 0.4) return ride.speed > 3 ? 'Grating over stones' : 'On the stones';
    const turn = Math.abs(ask.x) > 0.15 ? (ask.x < 0 ? 'turning left' : 'turning right') : '';
    if (ride.skid > 0.5) return `${ride.tuck > 0.5 ? 'Tucked, skidding' : 'Skidding'} ${turn.split(' ')[1]}`;
    const stance = ride.tuck > 0.5 ? 'Tucked' : ride.tall > 0.5 ? 'Standing tall' : '';
    if (stance && turn) return `${stance}, ${turn}`;
    if (stance) return stance;
    return turn ? `Carving ${turn.split(' ')[1]}` : 'Running straight';
  };

  // ---------------------------------------------------------------- the demo run
  /**
   * The run watched (asked: "make the demo run be such that it hits tricks in the jumps: 720, backflip, backflip 360, tucked jump; both
   * with human and horse skiers"): the ride itself, flown by a pilot in place of the pointer, kept a thirtieth of a second at a time
   * and played back. Between the kickers it carves down the skiable path, a turn every two seconds or so, wider the faster it goes,
   * held towards the path's middle; from some seventy metres before each it lines up on the kicker, going at the speed it means to
   * take it at, and takes off in the stance that makes the trick asked of that kicker: neither tucked nor tall and turning hard, a 720;
   * standing tall, a backflip; tall and turning, a backflip with a 360; tucked, a ski jumper's flight; tucked and turning hard, a cork
   * 720. In the air it holds the style asked (asked then: "also add some cool trick to the remaining jumps/kickers"): a mute grab, a
   * flip laid out, a 360 with a tail grab, a spread eagle (a horse's whip, capriole or splits, its rider's superman or no-hander, as
   * `nameOf` has them); and it tucks, which turns it quicker, only if its turns would not otherwise come round in time. It opens up to
   * land by itself. A kicker it does not land its trick off (short of it, fallen, or another trick) is flown again from the start of its
   * approach, at another speed. After the last it carves on to the foot of the run (on the groomed slope, some way on, and brakes to a
   * stop). Each skier, a person, a horse, a horse and its rider, is flown for itself; the same pilot and the same tricks.
   */
  /**
   * A trick the demo run asks of a kicker: what it does off the lip, how far it spins (in half turns) and which way (1 to the right),
   * whether corked, its style in the air, and whether it is taken switch (as the trick before it leaves it: a 540 lands switch, and
   * the switch 540 after it brings it round again).
   */
  interface DemoTrick { kind: Air['kind']; halves: number; cork?: boolean; side?: number; style?: Style; switch?: boolean; flips?: number }
  const DEMO_TRICKS: DemoTrick[] = [
    { kind: 'air', halves: 4, side: 1 }, { kind: 'flip', halves: 0 }, { kind: 'flip', halves: 2, side: -1 }, { kind: 'flight', halves: 0 },
    { kind: 'air', halves: 3, cork: true, side: 1 }, { kind: 'air', halves: 3, side: -1, switch: true },
    { kind: 'air', halves: 0, style: 'mute' }, { kind: 'flip', halves: 0, style: 'layout' },
    { kind: 'air', halves: 2, side: -1, style: 'tail' }, { kind: 'air', halves: 0, style: 'spread' },
    { kind: 'air', halves: 5, side: 1 }, { kind: 'air', halves: 1, side: -1, switch: true },
  ];
  /**
   * The second demo run, the orc hunt (asked: "I need a second demo run then where the rider with a horse lands crazy tricks from the
   * jumps but also shoots plenty of the orcs while at it"): the horse and its rider, the tommy gun in the rider's hands, the wildest
   * trick each kicker will give it (a cork 720, a backflip 720, a 900 and a switch 900 to come round again, a superman whip backflip
   * 360, a 1080...), and between them the orcs coming up the run, shot down as it goes (`armUp`, aimed for it). Each kicker's tricks
   * wildest first: one that is not made at any speed gives way to the next (kickers differ, and a 900 off one is a 540 off another),
   * each of them turning the same way and coming down in the same stance, so that what follows is taken as it was to be.
   */
  const spin = (halves: number, side: number, o: Partial<DemoTrick> = {}): DemoTrick => ({ kind: 'air', halves, side, ...o });
  const flip = (halves: number, side: number, o: Partial<DemoTrick> = {}): DemoTrick => ({ kind: 'flip', halves, side, ...o });
  const ORC_TRICKS: DemoTrick[][] = [
    [spin(4, 1, { cork: true }), spin(4, 1), spin(2, 1)],
    [flip(0, -1, { flips: 2 }), flip(4, -1), flip(2, -1), flip(0, -1)],
    [spin(5, 1), spin(3, 1, { cork: true }), spin(3, 1), spin(1, 1)],
    [spin(5, -1, { switch: true }), spin(3, -1, { switch: true }), spin(1, -1, { switch: true })],
    [flip(2, 1, { style: 'mute' }), flip(2, 1), flip(0, 1, { style: 'mute' })],
    [spin(6, -1, { cork: true, flips: 2 }), spin(6, -1), spin(4, -1, { cork: true }), spin(4, -1)],
    [flip(4, 1), flip(2, 1), flip(0, 1, { style: 'layout' })],
    [spin(4, 1, { style: 'tail' }), spin(2, 1, { style: 'tail' }), spin(4, 1)],
    [{ kind: 'roll', halves: 0, side: -1, style: 'mute' }, flip(4, -1), flip(2, -1, { style: 'mute' }), flip(2, -1)],
    [spin(3, -1, { cork: true }), spin(3, -1), spin(1, -1)],
    [spin(5, 1, { switch: true }), spin(3, 1, { switch: true }), spin(1, 1, { switch: true })],
    [spin(6, 1), spin(4, 1, { cork: true }), spin(4, 1)],
  ];
  /**
   * The showcase (asked: "make a new demo in silent warden as the main opening demo, showcasing different weapons and tricks and
   * offpiste skiing etc"; "the ending transition should be the robot arm throw in the demo"): each kicker's tricks, wildest first, as
   * the orc hunt's; and where there are none (`null`), the kicker passed by off the piste, out in the deep snow beside it and back
   * (`wanderFor`). Made for Silent Warden's seven kickers. Its arms, while it is watched: `showArm`; its end, the robot arm's throw:
   * `endShow`.
   */
  // (Off the piste beside the sixth: beside the fourth, where it had been, both sides of the piste have stones showing. Every trick
  // whole turns round, coming down facing the way it went, and no 180s on the snow between them (asked: "too much riding switch in
  // general"): a 540 among them, it came down backwards, and took every kicker after it switch.)
  const SHOW_TRICKS: (DemoTrick[] | null)[] = [
    [spin(4, 1, { cork: true }), spin(4, 1), spin(2, 1)],
    [flip(2, -1), flip(0, -1, { style: 'mute' }), flip(0, -1)],
    [spin(4, -1, { style: 'tail' }), spin(4, -1), spin(2, -1)],
    // (A barrel roll off the fourth (asked: "barrel rolls? add them if yes"). Off the second, as it was first tried, the roll wanted
    // taking fast, and the third, close after it, could not be slowed for, and was not made at any speed.)
    [{ kind: 'roll', halves: 0, side: 1, style: 'mute' }, flip(2, 1, { style: 'mute' }), flip(2, 1), flip(0, 1, { style: 'mute' })],
    [spin(6, 1, { cork: true, flips: 2 }), spin(6, 1), spin(4, 1, { cork: true }), spin(4, 1)],
    null,
    [flip(0, -1, { flips: 2 }), flip(4, -1), flip(2, -1, { style: 'layout' }), flip(2, -1)],
  ];
  /**
   * Which demo run is watched: the tricks', the orc hunt, or the showcase (the opening's); and each kicker's tricks for it, wildest first
   * (the tricks' one each; none, for a kicker the showcase passes by off the piste).
   */
  let demoKind: 'tricks' | 'orcs' | 'show' = 'show';
  const demoTricks = (): (DemoTrick[] | null)[] => (demoKind === 'orcs' ? ORC_TRICKS : demoKind === 'show' ? SHOW_TRICKS : DEMO_TRICKS.map((trick) => [trick]));
  /**
   * Coming up to a kicker's lip `tLip` seconds off, with `trick` to make off it: the stance asked (each `null` where it is free). Tucked
   * from further out, which takes a while to sink into; tall for a flip; neither for the rest. Then turning, hard for a spin to be held
   * and a little for a 180, only in the last quarter of a second, or straight.
   */
  const askAtLip = (trick: DemoTrick, tLip: number): { x: number | null; y: number | null } => {
    let x: number | null = null, y: number | null = null;
    const tucked = trick.kind === 'flight' || !!trick.cork;
    if (tucked && tLip < 1.2) y = 1;
    else if (trick.kind === 'flip' && tLip < 0.75) y = -1;
    else if (tLip < 0.7) y = 0;
    if (!trick.halves && tLip < 0.4) x = 0;
    if (trick.halves && tLip < 0.27) x = (trick.side ?? 1) * (trick.halves > 1 ? 0.9 : 0.45);
    return { x, y };
  };
  /**
   * In the air with `trick` to make (none, off a knoll): what is asked. The spin held its way until it is to stop at as many half turns
   * as the trick asks, then let go; the style asked, from a moment off the lip until a moment before the snow; tucked, if its turns would
   * not otherwise come round in time (at the rate it set off the lip, before it opens up to land); laid out, or spread, unless the turns
   * are well behind (a little slower round, which the pace off the lip leaves room for).
   */
  const askInAir = (trick: DemoTrick | undefined, a: Air) => {
    const left = a.T - a.t, style = trick?.style, spinning = !!trick && a.holding && halvesOf(a) < trick.halves;
    const toGo = Math.max(Math.abs(a.spinTo - a.spin) / (SPIN_RATE * TURN), Math.abs(a.flipTo - a.flip) / (FLIP_RATE * TURN * a.rate.flip), a.rollTo ? Math.max(0, ROLL.from + a.rollFor - a.t) : 0);
    const behind = toGo > left - 0.42, styling = !!style && a.t > 0.14 && left > 0.5 && !spinning;
    let x = spinning ? (trick?.side ?? 1) * 0.9 : 0, y = behind && !spinning ? 1 : 0;
    if (styling && (style === 'mute' || style === 'tail')) { x = style === 'mute' ? -0.8 : 0.8; y = 0.75; }
    if (styling && (style === 'spread' || style === 'layout') && toGo < left - 0.3) y = -1;
    return { x, y };
  };
  /** What a trick is, to tell one landed from another: what it did off the lip, how many half turns, whether corked, its style, switch. */
  const keyOf = (kind: Air['kind'], halves: number, cork: boolean, style: Style | '', sw: boolean, flips: number) => `${kind}|${halves}|${cork ? 1 : 0}|${style}|${sw ? 'switch' : ''}|${flips}`;
  /** How many flips a trick asks: a backflip's one unless it is a double; a double cork's two; none else. */
  const flipsAsked = (t: DemoTrick) => t.flips ?? (t.kind === 'flip' ? 1 : 0);
  const trickKey = (t: DemoTrick) => keyOf(t.kind, t.halves, !!t.cork, t.style ?? '', !!t.switch, flipsAsked(t));
  const demoName = (t?: DemoTrick) => (t ? nameOf(t.kind, t.halves, !!t.cork, t.style ?? '', !!t.switch, flipsAsked(t)) : 'Carving');
  /** The speeds a kicker is taken at, the first first, the others if that one does not make its trick. */
  const DEMO_SPEEDS = [17, 20, 14, 23, 11, 26];
  interface DemoFrame { p: Vector3; q: Quaternion; air: boolean; c: RideControls | AirControls; now: Now; sw: boolean; shift?: Vector3 }
  interface Demo { frames: DemoFrame[]; parts: { label: string; from: number; to: number }[]; length: number; landed: string[]; tries: number[]; fell: string | null; flown: string[] }
  const demos = new Map<Land, Map<string, Demo>>();
  /** Which demo run a skier has: a horse's for each set of skis, as its tricks differ on them. */
  const demoKey = () => `${demoKind} ${who === 'person' ? who : `${who} ${horse.skis}`}`;
  /** The kickers that stand on the run, from the top, as many as `n`. */
  const standing = (n: number) => { const out: Kicker[] = []; for (let i = 0; i < 60 && out.length < n; i++) { const k = kickerOf(i); if (k && k.s < land.length) out.push(k); } return out; };
  /** Flies the demo run on the land as it is, for the skier as it is. */
  const flyDemo = (): Demo => {
    const TRICKS = demoTricks(), kicked = standing(TRICKS.length).filter((k) => k.s + 40 < land.length), was = kicks;
    flyingDemo = true;
    // (Which of each kicker's tricks it is making, wildest first: the next once one is not made at any speed.)
    const rung: number[] = [], trickAt = (n: number) => TRICKS[n]?.[rung[n] ?? 0];
    // (Every kicker under it as it goes, without drawing any.)
    kicks = standing(kicked.length + 2);
    resetRide();
    Object.assign(want, { x: 0, y: 0, brake: false, brakeKey: false });
    for (const key of Object.keys(want.keys) as (keyof typeof want.keys)[]) want.keys[key] = false;
    const frames: DemoFrame[] = [], labels: string[] = [], landed: string[] = [], tries: number[] = [], flown: string[] = [];
    let k = 0, phase = 0, settle = 0, label = 'Off from the top', fell: string | null = null, stopAt = Infinity, last = '', lastT = 0, step = 0, airFrom = 0;
    // (Ground 180s done since the last kicker, and how long since the last of them.)
    let gap180 = 0, since180 = 1e9;
    // (Where the approach to the kicker now ahead began, to fly it again from there.)
    let from: { k: number; step: number; ride: typeof ride; ask: typeof ask; here: Frame; frames: number; landed: number; phase: number } | null = null;
    /** Each kicker's flight, as it went: at what speed, off the lip how fast, and how it came down. */
    let off = '';
    const note = (how: string) => { flown.push(`${demoName(trickAt(k))} at ${DEMO_SPEEDS[tries[k] ?? 0]}: ${off}${how}`); off = ''; };
    const again = () => {
      if (!from || from.k !== k) return false;
      if (tries[k] >= DEMO_SPEEDS.length - 1) { if ((rung[k] ?? 0) + 1 >= (TRICKS[k]?.length ?? 0)) return false; rung[k] = (rung[k] ?? 0) + 1; tries[k] = -1; }
      Object.assign(ride, structuredClone(from.ride));
      Object.assign(ask, from.ask);
      here = { ...from.here };
      air = null; crash = null; joints = jointsBefore = null;
      seat();
      frames.length = labels.length = from.frames;
      landed.length = from.landed;
      phase = from.phase; step = from.step; settle = 0;
      tries[k]++;
      return true;
    };
    /** How hard to turn to go the way `wantWay` (radians to the left of the run's way): a carve, short of a skid, unless asked. */
    const steer = (wantWay: number, gain = 2.6, most = 0.68) => clamp((ride.way - wantWay) * gain, -most, most);
    /**
     * Off the piste in place of the `n`th kicker (the showcase's, `SHOW_TRICKS`): from a little after the landing of the one before it to
     * a little before the approach to the one after it; out to whichever side, and as far out (twenty-four metres past the poles, or
     * less), the snow lies with no stones showing and no tree along the way, as far as the way out reaches and a little more; none such,
     * not off the piste at all.
     */
    const wanderFor = (n: number) => {
      const before = kicked[n - 1], after = kicked[n + 1];
      const from = before ? before.s + before.L + 30 : 20, to = after ? after.s + after.L - 90 : land.length - 60;
      if (to - from < 90) return null;
      for (const out of [24, 18, 12]) for (const side of [1, -1]) {
        let clear = true;
        for (let s = from; s <= to && clear; s += 3) {
          const [lo, hi] = land.edges(s), edge = side > 0 ? hi : lo;
          for (let l = 0; l <= out + 4 && clear; l += 3) {
            const p = land.at(s, edge + side * l);
            if ((land.snowAt?.(p.x, p.z) ?? 1) < 0.85 || land.treeNear?.(p.x, p.z, 1.5)) clear = false;
          }
        }
        if (clear) return { from, to, side, out };
      }
      return null;
    };
    let wander = TRICKS[0] === null ? wanderFor(0) : null;
    const dt = 1 / 120;
    for (let spent = 0; spent < 600 * 120; spent++, step++) {
      const kick = kicked[k], trick = trickAt(k);
      // (Where it is against the kicker ahead, in the kicker's own frame: how far along its ramp from its lip, and how far left of
      // its middle. Against the run instead, where the run bends near a kicker set across it, the skier seemed past the lip while
      // still on the ramp.)
      const toLip = kick ? kick.L - ((ride.x - kick.x) * kick.dx + (ride.z - kick.z) * kick.dz) : Infinity;
      want.brake = false;
      // (Lined up on from seventy-five metres before its lip; from further, the further across the run it is from the skier, past ten
      // metres: from a kicker far to one side to one far to the other, a skier lined up from only seventy-five metres came up to it
      // some four metres off its middle, and went by it.)
      const across = kick ? Math.abs((ride.x - kick.x) * kick.dz - (ride.z - kick.z) * kick.dx) : 0, linesUp = 75 + 3 * clamp(across - 10, 0, 30);
      if (!air) planned = kick && toLip < linesUp && trick ? trick : null;
      if (air) {
        // In the air: the style asked, from a moment off the lip until a moment before the snow; tucked, if its turns would not
        // otherwise come round in time (at the rate it set off the lip, before it opens up to land).
        const a = air, o = askInAir(from?.k === k ? trick : undefined, a);
        want.x = o.x; want.y = o.y;
        if (a.kind !== 'hop') label = a.name;
      } else if (kick && toLip < -1 && !trick) {
        // (Passed by off the piste: on to the next.)
        k++; from = null; gap180 = 0;
        if (k < kicked.length && !TRICKS[k]) wander = wanderFor(k);
      } else if (kick && toLip < -1 && trick) {
        // Past a kicker: on to the next, if it made its trick; or the approach flown again.
        note(last ? `landed the ${last}` : `no trick, ${(((ride.x - kick.x) * kick.dz - (ride.z - kick.z) * kick.dx)).toFixed(1)} m off its middle at ${(ride.speed * 3.6).toFixed(0)} km/h`);
        // (A flip or a spin flung round in too short a time in the air looks it: flown again, faster or slower, if it had less than a
        // second, or nine tenths for a single spin.)
        const short = lastT < (trick.kind === 'flip' || trick.halves > 2 ? 1 : trick.halves ? 0.9 : 0);
        if ((last !== trickKey(trick) || short) && again()) continue;
        k++; from = null; gap180 = 0;
        if (k < kicked.length && !TRICKS[k]) wander = wanderFor(k);
        // (A moment straight before turning again; but none where the next kicker is so near that it wants lining up on already: off a
        // fast landing, that moment took a third of the way to a kicker standing close after another, and it could not be lined up on.)
        settle = kicked[k] && kicked[k].s + kicked[k].L - ride.down < 75 + 0.7 * ride.speed ? 0 : 0.7;
      } else if (settle > 0) {
        settle -= dt; want.x = 0; want.y = 0;
      } else if (kick && toLip < linesUp && trick) {
        // Lining up on it, at the speed it is to be taken at; and at the lip, the stance that makes its trick.
        if (!from || from.k !== k) { tries[k] ??= 0; rung[k] ??= 0; last = ''; lastT = 0; from = { k, step, ride: structuredClone(ride), ask: { ...ask }, here: { ...here }, frames: frames.length, landed: landed.length, phase }; }
        const tLip = toLip / Math.max(ride.speed, 1), speed = DEMO_SPEEDS[tries[k]];
        // (Turned towards the kicker's middle, the nearer the more; its way and its offset against the kicker's own way.)
        const go = along(ride.way, here), kd = runDir(kick), kl = runLeft(kick), off = (ride.x - kick.x) * kl.x + (ride.z - kick.z) * kl.z;
        const way = Math.atan2(go.dot(kl), go.dot(kd)), aim = clamp(Math.atan2(-off, Math.max(toLip, 6)) * 1.3, -0.45, 0.45);
        want.x = clamp((way - aim) * 3, -0.6, 0.6);
        want.y = ride.speed < speed - 1 ? 1 : ride.speed > speed + 1 ? -0.5 : 0.3;
        want.brake = ride.speed > speed + 4 && toLip > 25;
        label = `Up to the kicker: ${demoName(trick)}`;
        const o = askAtLip(trick, tLip);
        if (o.x !== null) want.x = o.x;
        if (o.y !== null) want.y = o.y;
      } else if (wander && ride.down > wander.from - 40 && ride.down < wander.to) {
        // The showcase's way off the piste: out past the poles over some forty-five metres, along beside the piste in the deep snow in
        // short turns, and back in over the last fifty, tucked to keep its pace in the snow; no 180s out there.
        const w = wander, [lo, hi] = land.edges(ride.down), mid = (lo + hi) / 2, edge = w.side > 0 ? hi : lo;
        const outK = smooth((ride.down - w.from) / 45) * (1 - smooth((ride.down - (w.to - 50)) / 50)), aimLeft = mid + (edge + w.side * w.out - mid) * outK;
        phase += (dt * Math.PI) / 1.6;
        want.x = steer(clamp((aimLeft - ride.left) * 0.06, -0.7, 0.7) + 0.22 * Math.sin(phase));
        want.y = ride.speed < 14 ? 1 : 0;
        label = 'Off the piste, in deep snow';
      } else {
        // Carving down between them.
        phase += (dt * Math.PI) / 1.9;
        const [lo, hi] = land.edges(ride.down), mid = (lo + hi) / 2, half = Math.max(6, (hi - lo) / 2);
        const amp = clamp(0.3 + (ride.speed - 15) * 0.06, 0.2, 0.8);
        want.x = steer(amp * Math.sin(phase) + clamp((mid - ride.left) / half, -1, 1) * 0.3) * (ride.turn180 ? 0.4 : 1);
        want.y = ride.speed < 12 ? 0.8 : ride.speed > 21 ? -0.4 : 0;
        label = k < kicked.length ? 'Carving' : 'On to the foot';
        // (On a slope that goes on for ever, carried on some way past the last kicker for its 180s on the snow, then brought to a stop.)
        if (k >= kicked.length && land.length === Infinity) {
          if (stopAt === Infinity) stopAt = ride.down + 290;
          if (gap180 >= 4 && !ride.turn180 && since180 > 1.4) stopAt = Math.min(stopAt, ride.down);
          if (ride.down > stopAt) { want.brake = true; label = 'Stopping'; }
        }
        // Ground 180s where there is room for them: where the next kicker's approach (or the run's end) is far enough off for two, and
        // only two, between kickers, so that it comes to the kicker in the stance it left the last one in; up to four on the way to the
        // foot. (Each as long as it takes, and a moment after it.)
        const room = kick ? toLip - 75 : (land.length === Infinity ? stopAt : land.length - 40) - ride.down;
        const need = (n: number) => Math.max(ride.speed, 8) * (G180[GROUND_180[(next180 + n) % GROUND_180.length]].T + 0.9);
        if (!ride.turn180 && since180 > 1 && ride.speed > 8 && ride.down > 20 && demoKind !== 'show') {
          const back = gap180 % 2 === 1, more = kick ? gap180 < 2 : gap180 < 4;
          if ((back && room > need(0)) || (!back && more && room > need(0) + need(1) + 5)) { if (start180()) { gap180++; since180 = 0; } }
        }
        if (ride.turn180) label = G180[ride.turn180.kind].name;
      }
      // (No body posed while it is flown: a frame keeps what the pose is made from, not the pose, and a fall is flown again or ends it.
      // Posed at each frame kept, the horse and its rider, it was a fifth of a millisecond each, some thousands of times.)
      const keep = step % 4 === 0, wasAir = air;
      since180 = ride.turn180 ? 0 : since180 + dt;
      quiet = true;
      const now = stepRide(dt);
      if (air && !wasAir && air.kind !== 'hop' && from?.k === k) off = `off at ${(ride.speed * 3.6).toFixed(0)} km/h, ${air.name}, ${air.T.toFixed(2)} s up; `;
      // (The whole flight named as it landed, or fell: it is named as it goes, and a grab is not one until it has been held.)
      if (air && !wasAir) airFrom = labels.length;
      if (wasAir && !air && wasAir.kind !== 'hop') for (let i = airFrom; i < labels.length; i++) labels[i] = wasAir.name;
      if (wasAir && !air && !crash && wasAir.kind !== 'hop') { landed.push(wasAir.name); last = keyOf(wasAir.kind, halvesOf(wasAir), !!wasAir.cork, styleOf(wasAir), wasAir.fromSwitch, flipsOf(wasAir)); lastT = wasAir.t; off += `${wasAir.name} in ${wasAir.t.toFixed(2)} s; `; }
      if (keep) { frames.push({ p: rider.position.clone(), q: rider.quaternion.clone(), air: posed.air, c: { ...posed.c }, now: { ...now }, sw: ride.switch, ...(rollShift.lengthSq() > 0 ? { shift: rollShift.clone() } : {}) }); labels.push(label); }
      if (crash) { note(`fell, ${crash.why}`); if (again()) continue; fell = crash.why; break; }
      if ((ride.ended || stopAt < Infinity) && ride.speed < 0.3) break;
    }
    quiet = false;
    flyingDemo = false;
    // (The run's parts: each stretch kept under one name.)
    const parts: Demo['parts'] = [];
    labels.forEach((l, i) => { const p = parts[parts.length - 1]; if (p && p.label === l) p.to = (i + 1) * STEP; else parts.push({ label: l, from: i * STEP, to: (i + 1) * STEP }); });
    resetRide();
    kicks = was;
    return { frames, parts, length: Math.max(STEP, (frames.length - 1) * STEP), landed, tries, fell, flown };
  };
  let demo: Demo = { frames: [], parts: [], length: STEP, landed: [], tries: [], fell: null, flown: [] };
  /** The demo run for this land and skier, flown when first wanted (and then kept). */
  const demoFor = () => {
    let forLand = demos.get(land);
    if (!forLand) demos.set(land, (forLand = new Map()));
    let d = forLand.get(demoKey());
    if (!d) forLand.set(demoKey(), (d = flyDemo()));
    return d;
  };
  /** The numbers of two frames, so far from the first to the second. */
  const between = <T extends object>(a: T, b: T, k: number): T => {
    const o = { ...a } as Record<string, unknown>;
    for (const key of Object.keys(a)) { const x = (a as Record<string, unknown>)[key], y = (b as Record<string, unknown>)[key]; if (typeof x === 'number' && typeof y === 'number') o[key] = x + (y - x) * k; }
    return o as T;
  };
  /** Puts the skier where the demo run has it at time `t`, in its pose then; and says where it is and what it is doing. */
  const watchPose = (t: number): Now => {
    const fs = demo.frames, last = fs.length - 1, f = clamp(t / STEP, 0, last), i = Math.min(Math.max(0, last - 1), Math.floor(f)), k = f - i, a = fs[i], b = fs[Math.min(last, i + 1)];
    rider.position.lerpVectors(a.p, b.p, k);
    // (Through a barrel roll, how far its feet are swung about its middle, for the views to leave out, as riding.)
    rollShift.set(0, 0, 0);
    if (a.shift || b.shift) rollShift.lerpVectors(a.shift ?? new Vector3(), b.shift ?? new Vector3(), k);
    // (Where a half turn is handed from the pose to the way the body faces between two frames, a 180 landed or a 180 on the snow
    // ended, neither is blended: the pose's turn goes at once and the facing was turned round over the frames between, so that the
    // body stood up to a quarter turn off for a frame or two, or turned the wrong way round.)
    // (Told by the facing going round by more than any spin or flip does in a thirtieth of a second, which is under half a radian.)
    const near = k < 0.5 ? a : b, handed = a.q.angleTo(b.q) > 1.5;
    if (handed) rider.quaternion.copy(near.q); else rider.quaternion.slerpQuaternions(a.q, b.q, k);
    const c = handed || a.air !== b.air ? near.c : between(a.c, b.c, k);
    if (near.air) skier.air(c as AirControls); else skier.ride(c as RideControls);
    rider.updateMatrixWorld(true);
    return between(a.now, b.now, k);
  };
  /** The demo run's tracks: each ski's middle every other frame, laid as it went; nothing while it is in the air. */
  const layWatchTracks = () => {
    const fs = demo.frames, was = kicks;
    kicks = standing(demoTricks().length + 2);
    for (let i = 0, j = 0; i < fs.length && j < 3600; i += 2, j++) {
      const now = watchPose(i * STEP), spots = skier.skis(), f = land.at(now.down, now.left);
      watchSkis = spots.length;
      spots.forEach((p, s) => lay(watchTracks[s], j, onSnow(p), now.way, fs[i].air ? 0 : halfOf(now.skid), f, now.deep ?? 0));
    }
    kicks = was;
    for (const m of watchTracks) { m.geometry.getAttribute('position').needsUpdate = true; m.geometry.getAttribute('color').needsUpdate = true; m.geometry.getAttribute('normal').needsUpdate = true; }
  };
  // ---------------------------------------------------------------- riding: the tricks done for the rider
  /**
   * Riding, the rider steers and the tricks are done for it (asked: "lets simplify controls so that bottom left has thumb control for
   * steering and tucked/straight on one control (doesnt control the tricks), then on bottom right there is a slider that goes from Mild
   * -> Wild and then a trick that could probably land is chosen randomly at the jump spots based on that slider"): coming up on a kicker,
   * lined up on it, a trick is chosen among those that should come round in the time the kicker will give it in the air at the speed it
   * is going (each wants so long), the likelier the nearer its wildness to the slider's; then it is made as the demo run's pilot makes
   * it, the stance at the lip and what is asked in the air, whatever the stick says.
   */
  const TRICK_POOL: { t: DemoTrick; wild: number; need: number }[] = [
    { t: { kind: 'air', halves: 0, style: 'mute' }, wild: 0.02, need: 0.85 }, { t: { kind: 'air', halves: 0, style: 'spread' }, wild: 0.06, need: 0.85 },
    { t: { kind: 'flight', halves: 0 }, wild: 0.1, need: 0.7 }, { t: { kind: 'air', halves: 0, style: 'tail' }, wild: 0.14, need: 0.85 },
    { t: { kind: 'air', halves: 1 }, wild: 0.2, need: 0.75 }, { t: { kind: 'air', halves: 2 }, wild: 0.3, need: 0.95 },
    { t: { kind: 'air', halves: 1, style: 'mute' }, wild: 0.34, need: 0.95 }, { t: { kind: 'flip', halves: 0 }, wild: 0.42, need: 1.0 },
    { t: { kind: 'air', halves: 2, style: 'tail' }, wild: 0.46, need: 1.1 }, { t: { kind: 'air', halves: 3 }, wild: 0.52, need: 1.05 },
    { t: { kind: 'flip', halves: 0, style: 'layout' }, wild: 0.56, need: 1.1 }, { t: { kind: 'air', halves: 4 }, wild: 0.62, need: 1.2 },
    { t: { kind: 'air', halves: 3, cork: true }, wild: 0.67, need: 1.15 }, { t: { kind: 'flip', halves: 2 }, wild: 0.72, need: 1.22 },
    { t: { kind: 'air', halves: 4, cork: true }, wild: 0.8, need: 1.3 }, { t: { kind: 'air', halves: 5 }, wild: 0.86, need: 1.48 },
    { t: { kind: 'flip', halves: 4 }, wild: 0.9, need: 1.48 }, { t: { kind: 'air', halves: 6 }, wild: 0.96, need: 1.65 },
    // (Asked: "would double backflips and doublecorks be possible? barrel rolls? add them if yes". Each wants as long in the air as it
    // was seen to come round in off the Silent Warden's kickers, and a little more: a double backflip 1.37 seconds, a double cork 720
    // 1.62 and a 1080 1.65. A barrel roll, made over its time in the air (`ROLL`), wants long enough to go over unhurried.)
    { t: { kind: 'roll', halves: 0 }, wild: 0.5, need: 1.25 }, { t: { kind: 'roll', halves: 0, style: 'mute' }, wild: 0.6, need: 1.4 },
    { t: { kind: 'flip', halves: 0, flips: 2 }, wild: 0.88, need: 1.5 }, { t: { kind: 'air', halves: 4, cork: true, flips: 2 }, wild: 0.94, need: 1.7 },
    { t: { kind: 'air', halves: 6, cork: true, flips: 2 }, wild: 1, need: 1.78 },
    // (Past the 1080 (asked: "it seems we now have a limit at 1080 degrees, but we can allow more as long as the jump allows it"): a
    // 1260 to an 1800, and corks and double corks of 1260 and 1440, each wanting as long in the air as it was seen to come round in off
    // the Silent Warden's longest airs, and a little more (a 1440 came round in 1.95 seconds, an 1800 in 2.45 and not in 1.87). Wilder
    // than the slider's end, so that at its end, off a jump that keeps the skier up long enough, one comes up often, not always.)
    { t: { kind: 'air', halves: 7 }, wild: 0.98, need: 1.85 }, { t: { kind: 'air', halves: 7, cork: true }, wild: 1.02, need: 1.92 },
    { t: { kind: 'air', halves: 7, cork: true, flips: 2 }, wild: 1.04, need: 1.98 }, { t: { kind: 'air', halves: 8 }, wild: 1.06, need: 2.02 },
    { t: { kind: 'air', halves: 8, cork: true }, wild: 1.08, need: 2.08 }, { t: { kind: 'air', halves: 8, cork: true, flips: 2 }, wild: 1.1, need: 2.12 },
    { t: { kind: 'air', halves: 9 }, wild: 1.12, need: 2.3 }, { t: { kind: 'air', halves: 10 }, wild: 1.16, need: 2.55 },
  ];
  /** How long a kicker keeps a skier going at `speed` off its lip in the air, as near as can be told before it gets there. */
  const airtimeOff = (k: Kicker, speed: number) => {
    const L = k.L, lx = k.x + k.dx * L, lz = k.z + k.dz * L, h = (u: number) => land.height(k.x + k.dx * u, k.z + k.dz * u);
    const a = Math.atan((h(L + 1) - h(L - 1)) / 2) + lipLift(k);
    return timeToSnow(new Vector3(lx, land.height(lx, lz) + k.H + 0.02, lz), new Vector3(k.dx * Math.cos(a), Math.sin(a), k.dz * Math.cos(a)).multiplyScalar(speed));
  };
  /**
   * How long the skier will be in the air off what is ahead of it, going on straight at it as it goes: found by riding on to the lip
   * unseen and putting everything back as it was. (Reckoned from its speed and the lip alone, it was right at some sixty kilometres an
   * hour and a third too long at eighty, where the ramp and the air take more of the speed; and a 900 was chosen that could not come
   * round.) Nothing, if it would not leave the snow in the next three seconds.
   */
  const probeAirtime = (up = 0) => {
    const saved = { ride: structuredClone(ride), ask: { ...ask }, here: { ...here }, posed, want: { ...want, keys: { ...want.keys } }, told: { ...told }, quiet, joints, jointsBefore };
    quiet = true; want.auto = true; want.x = 0; want.y = up;
    for (let i = 0; i < 360 && !air && !crash; i++) stepRide(1 / 120);
    const T = air ? air.T : 0, fell = !!crash;
    Object.assign(ride, saved.ride); Object.assign(ask, saved.ask); here = saved.here; posed = saved.posed; Object.assign(want, saved.want);
    told = saved.told; quiet = saved.quiet; joints = saved.joints; jointsBefore = saved.jointsBefore; air = null; crash = null;
    if (fell) seat();
    return T;
  };
  const wildInput = $<HTMLInputElement>('wild');
  const trickRng = new Rng('ride tricks');
  /** The time in the air the last trick chosen was chosen for (`pickTrick`), for a script to see. */
  let pickedFor = 0;
  let trickPicks = 0;
  // ---------------------------------------------------------------- riding: how wild the tricks are, earned
  /**
   * With *Orcs & weapons* on, how wild the tricks are is earned rather than chosen (asked: "the mild to wild trick level slider is not a
   * slider but starts from mild and the more tricks the player land and more enemies the player defeats, the higher the trick level goes
   * on mild to wild scale. When player falls or is hit by enemies, it goes down. lets say 8 blocks? When the meter is at Wild 8/8, the
   * found loot tome tricks are possible to take place"): eight blocks, empty at first; filled by the tricks landed, the more a trick is
   * worth the more of a block (`trickPts` points a whole one, and never less than `trick[0]` of one), and by the foes brought down (`foe`
   * of a block for each of an orc's worth, `great` for a great one besides); emptied by a fall (`fall` blocks) and by a blow taken on
   * foot (`struck`, a harder blow the more). The trick off a kicker is chosen by how full it is as it was by the slider, and only full,
   * at 8/8, are the guidebooks' tricks among them. Kept over the runs since the page was opened, as the arms are, and not in the browser.
   */
  const WILD = { blocks: 8, trick: [0.3, 1] as const, trickPts: 900, foe: 0.1, great: 1.5, fall: 3, struck: 1 };
  let wildEarned = 0;
  const wildMeter = $('wildMeter'), wildBlocks = [...wildMeter.querySelectorAll<HTMLElement>('i')], wildLvl = $('wildLvl');
  /** How wild the tricks are to be, nothing to one: as earned, with orcs and weapons; else as the slider says. */
  const wildness = () => (orcsOn ? wildEarned / WILD.blocks : Number(wildInput.value));
  /** Whether the guidebooks' tricks may be chosen: always without orcs and weapons; with them, only with the meter full. */
  const wildFull = () => !orcsOn || wildEarned >= WILD.blocks - 1e-6;
  /** The meter drawn as it is: each block as far filled as it has come; and, `how`, a flash as it rises or falls. */
  const showWild = (how: 'up' | 'down' | null = null) => {
    wildBlocks.forEach((b, i) => b.style.setProperty('--f', clamp(wildEarned - i, 0, 1).toFixed(3)));
    const n = Math.floor(wildEarned + 1e-6);
    wildLvl.textContent = `${n}/${WILD.blocks}`;
    wildMeter.setAttribute('aria-valuenow', wildEarned.toFixed(1));
    wildMeter.classList.toggle('full', n >= WILD.blocks);
    if (how) { wildMeter.classList.remove('up', 'down'); void wildMeter.offsetWidth; wildMeter.classList.add(how); }
  };
  /**
   * `n` blocks more (or fewer), riding with orcs and weapons (not while the ride is tried out unseen, `quiet`); a block filled or lost
   * said beside the meter, and the guidebooks opened as it fills.
   */
  const earnWild = (n: number) => {
    if (!orcsOn || mode !== 'ride' || quiet || !n) return;
    const was = Math.floor(wildEarned + 1e-6);
    wildEarned = clamp(wildEarned + n, 0, WILD.blocks);
    const now = Math.floor(wildEarned + 1e-6);
    showWild(n > 0 ? 'up' : 'down');
    if (now === was) return;
    const r = wildMeter.getBoundingClientRect();
    if (!r.width) return;
    const words = now >= WILD.blocks ? 'the guidebooks open' : now > was ? 'wilder tricks' : 'milder tricks';
    popUp([r.left - 52, r.top + r.height * (1 - (now + 0.5) / WILD.blocks)], `${now >= WILD.blocks ? 'Wild' : now > was ? '▲' : '▼'} ${now}/${WILD.blocks}`, now > was ? 'wild' : 'wild lost', words);
  };
  /** The trick to make off kicker `k`, its lip `tLip` seconds off: one that should come round, by how wild the slider says. */
  const pickTrick = (k: Kicker, tLip: number): DemoTrick => {
    // (Ridden on standing easy, as a trick off the lip but a tucked one is taken, the last moments before it; and, for the tucked ones
    // (a cork, a ski jumper's flight), as the rider holds itself now, tucked or not: ridden on standing easy alone, a rider coming up
    // tucked, as most do, was reckoned to fly a quarter shorter than it did off its corks, and nothing past a 1080 was ever chosen.)
    const easy = (probeAirtime() || airtimeOff(k, ride.speed)) * 0.95, tucked = ask.y > 0.3 ? (probeAirtime(ask.y) || easy / 0.95) * 0.95 : easy;
    const T = Math.max(easy, tucked), w = wildness(), airFor = (t: DemoTrick) => (t.kind === 'flight' || t.cork ? tucked : easy);
    pickedFor = T;
    // (A tuck takes a while to sink into, and standing tall for a flip a little less: neither is chosen too late to be stood in.)
    // (A spin of two turns and more turns hard on the ramp's last metres, which costs it some speed and so some of its time in the air.)
    // (And the tricks the guidebooks found have taught, `slopeLoot.ts`.)
    const can = [...TRICK_POOL, ...learned().map((p) => ({ ...p, book: true }))].filter((p) => p.need + (p.t.halves >= 4 ? 0.06 : 0) <= airFor(p.t) && (!(p.t.kind === 'flight' || p.t.cork) || tLip > 1.25) && (p.t.kind !== 'flip' || tLip > 0.8));
    if (!can.length) return { kind: 'air', halves: 0 };
    // (With the meter full, the guidebooks' tricks as likely as the wildest of the rest, whatever their own wildness says: the reward
    // of filling it is to see them.)
    const weights = can.map((p) => ('book' in p && orcsOn ? 1 : Math.exp(-(((p.wild - w) / 0.16) ** 2))) + 0.002);
    // (By chance, from where and when it is chosen: another each time a kicker is come up on, as no two runs are ridden alike.)
    const rng = trickRng.fork(`kicker ${k.i} ${ride.down.toFixed(1)} ${ride.time.toFixed(2)} ${trickPicks++}`);
    let r = rng.next() * weights.reduce((a, b) => a + b, 0);
    const i = Math.max(0, weights.findIndex((x) => (r -= x) <= 0));
    return { ...can[i].t, side: rng.chance(0.5) ? 1 : -1 };
  };
  /** The tricks the guidebooks read teach, riding. */
  const learned = (): { t: DemoTrick; wild: number; need: number }[] => (pack && mode === 'ride' && !flyingDemo && wildFull() ? pack.tricks() : []);
  /** The trick being made riding, if one is: off which kicker, what, and the time in the air it is made in once off the lip. */
  let rideTrick: { k: Kicker; trick: DemoTrick; air: Air | null } | null = null;
  /** The kicker the skier is coming up on, lined up on it and going its way, within a second and a half: and how far its lip is. */
  const kickerAhead = () => {
    const go = along(ride.way, here);
    for (const k of kicks) {
      const toLip = k.L - ((ride.x - k.x) * k.dx + (ride.z - k.z) * k.dz), off = (ride.x - k.x) * k.dz - (ride.z - k.z) * k.dx;
      const heading = Math.atan2(go.x * k.dz - go.z * k.dx, go.x * k.dx + go.z * k.dz);
      if (toLip > 0 && toLip < Math.max(12, ride.speed * 1.6) && Math.abs(off) < k.half + 0.4 && Math.abs(heading) < 0.6) return { k, toLip };
    }
    return null;
  };
  /**
   * The speed check (asked: "the fifth kicker on below the silent warden run seems to often make such a jump that it ends up crashing too
   * hard"): a kicker is sized for a skier coming to it at some 72 km/h (`kickSize`), and one at the foot of a steep stretch is come to
   * far faster: the Silent Warden's fifth, at 85 to 110 km/h, off which over 88 a rider came down too hard to stand. So riding up to a
   * kicker faster than it lands softly at (`safeOff`), its skis are thrown across to brake, as a skier checks its speed, until it is
   * no faster: over the run up to it, before its ramp, and before the trick off it is chosen, which is chosen for the speed it then
   * goes. (The kickers kept as they were: made smaller for it, the demo runs' pilot could not line up on two of them.)
   */
  // (A fall is past `FALL_BLOW`, 14 m/s into the snow; braked to come down no harder than 13: closer to the fall, a cork 900 and a spread eagle taken at their limits came down too hard, the flight reckoned for the limit a little lower than the ride makes it off a kicker's curve. To `KICK_HARD`'s 11, which a kicker is sized by, a
  // rider was checked before most of the Silent Warden's kickers at 67 to 70 km/h, slower than they are sized for.) And (asked: "The
  // speedcheck comes too easily now"): only lined up on a kicker and going its way, not going by beside it; only `slack` metres a second
  // over what it lands softly at, and then braked down to that; and only from as far before its foot as it takes to brake so much, at
  // some `slows` metres a second each second, and `lead` metres more as the brake bites. It had braked any rider within four metres of a
  // kicker's sides and going its way at all, from 110 metres out, at the least speed over.
  // (A little over it, taken off its lip absorbed, as a skier soaks up a lip to fly less far: off it no faster than its limit, `soak`.)
  const SPEED_CHECK = { until: 4, blow: 13, slack: 3, slows: 4.5, lead: 10 };
  /** Off a kicker's lip faster than it lands softly at: the lip absorbed, the skier off it no faster than that. (Riding only.) */
  const soak = (v: Vector3) => {
    if (!speedChecks || flyingDemo || mode !== 'ride') return;
    for (const k of kicks) {
      const toLip = k.L - ((ride.x - k.x) * k.dx + (ride.z - k.z) * k.dz), off = (ride.x - k.x) * k.dz - (ride.z - k.z) * k.dx;
      if (Math.abs(toLip) > 2.5 || Math.abs(off) > k.half + 1) continue;
      // (A little under its limit, the limit reckoned by a flight a little lower than the ride makes off a kicker's curve.)
      const safe = 0.97 * safeOff(k), speed = v.length();
      if (speed > safe) v.multiplyScalar(safe / speed);
      return;
    }
  };
  let speedChecks = true;
  /**
   * The fastest a kicker is come to that a skier off it comes down no harder than `SPEED_CHECK.blow`; worked out once. (As fast as it comes to
   * it, it goes off the lip: riding, the ramp's climb costs it little. `kickFlight` takes the speed on the run before it, and takes the
   * climb off that, so it is given the speed that leaves its lip at as fast as the skier came. Given that speed itself, a rider braked
   * to it still left the lip a little faster than was safe, and one in five came down too hard.)
   */
  const safeOff = (k: Kicker) => {
    if (k.safe !== undefined) return k.safe;
    const before = (v: number) => { let v0 = v; for (let n = 0; n < 6; n++) v0 = Math.sqrt((v + 0.0065 * v0 * k.L) ** 2 + 2 * G * k.H); return v0; };
    k.safe = Infinity;
    for (let v = 14; v <= 36; v += 0.5) if (kickFlight(k, k, before(v)).blow > SPEED_CHECK.blow) { k.safe = v - 0.5; break; }
    return k.safe;
  };
  /** Whether the skier is coming up on a kicker, going its way and lined up on it or near it, faster than it lands softly at. */
  /** The kicker being braked for, once the check has begun: braked for down to its limit, not let go of at the slack over it. */
  let checkingFor: Kicker | null = null, toldFor: Kicker | null = null;
  const tooFast = () => {
    if (!speedChecks || air || crash || ride.ended || flyingDemo) { checkingFor = null; return false; }
    const go = along(ride.way, here);
    for (const k of kicks) {
      const toFoot = -((ride.x - k.x) * k.dx + (ride.z - k.z) * k.dz), off = (ride.x - k.x) * k.dz - (ride.z - k.z) * k.dx;
      const heading = Math.atan2(go.x * k.dz - go.z * k.dx, go.x * k.dx + go.z * k.dz), safe = safeOff(k), over = ride.speed - safe;
      if (toFoot <= SPEED_CHECK.until || Math.abs(off) > k.half + 1 || Math.abs(heading) > 0.35 || over <= 0) continue;
      if (checkingFor !== k && over < SPEED_CHECK.slack) continue;
      if (checkingFor !== k && toFoot > (ride.speed ** 2 - safe ** 2) / (2 * SPEED_CHECK.slows) + SPEED_CHECK.lead) continue;
      checkingFor = k;
      return true;
    }
    checkingFor = null;
    return false;
  };
  /** Riding, a step: what the stick or the pointer asks, unless a trick is being made, which asks what it must. */
  /** Whether riding is seen from above (`iso`), and steered so: on the snow, not on foot. */
  const isoRiding = () => mode === 'ride' && view === 'iso' && !foot;
  /**
   * How hard a turn is asked, `a` radians short of the way asked for, riding seen from above: carved, the harder the further round it
   * is to come, out to `CARVE_DEEP` at `ISO_STEER.carve`; past it, harder to `SKID_FROM` at `ISO_STEER.edge`, where it begins to skid;
   * and past that, skidded the more, wholly at `ISO_STEER.skid` and on round.
   */
  const ISO_STEER = { carve: deg(24), edge: deg(40), skid: deg(80), tuck: deg(10), dead: 0.12 };
  const isoSharp = (a: number) =>
    a < ISO_STEER.carve ? CARVE_DEEP * (a / ISO_STEER.carve)
      : a < ISO_STEER.edge ? CARVE_DEEP + (SKID_FROM - CARVE_DEEP) * ((a - ISO_STEER.carve) / (ISO_STEER.edge - ISO_STEER.carve))
        : SKID_FROM + (1 - SKID_FROM) * smooth((a - ISO_STEER.edge) / (ISO_STEER.skid - ISO_STEER.edge));
  /**
   * Riding seen from above, steered as on foot in the cave (asked: "make the isometric skiing mode follow the dungeon control
   * principles.. if player makes too sharp turns, then it will skid and so on"): W A S D or the arrows, the stick, the tilt, are up,
   * down, left and right across the picture, and the pointer where it is from the skier on the picture: the way to go, not a turn.
   * The skier turns to it as a skier can: a little way round, carved; further, harder; too sharp to carve (some forty degrees and
   * more), skidded round, scraping and slowing, the more the sharper. Held the way it already goes, it tucks; let go, it runs on as it
   * goes. Shift, or the button held, brakes as ever.
   */
  const askIso = (by: { x: number; y: number }) => {
    const k = want.keys;
    let sx = (k.right ? 1 : 0) - (k.left ? 1 : 0), sy = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    if (!sx && !sy) {
      if (aim.on) {
        // (From where the skier is on the picture to the pointer; what is up the picture drawn shorter than it is, as the view looks
        // down at a slant, made as long again.)
        const r = canvas.getBoundingClientRect(), p = rider.position.clone().project(camera);
        const dx = aim.px - (r.left + ((p.x + 1) / 2) * r.width), dy = (r.top + ((1 - p.y) / 2) * r.height - aim.py) / Math.sin(ISO.pitch);
        const l = Math.hypot(dx, dy), reach = aimReach();
        if (l > ISO_STEER.dead * reach) { sx = dx / l; sy = dy / l; }
      } else if (Math.hypot(by.x, by.y) > ISO_STEER.dead) { sx = by.x; sy = by.y; }
    }
    const amount = Math.min(1, Math.hypot(sx, sy));
    if (amount < 1e-3) { want.x = 0; want.y = 0; return; }
    const up = camera.getWorldDirection(new Vector3()).setY(0).normalize(), right = new Vector3(-up.z, 0, up.x);
    const go = up.multiplyScalar(sy).addScaledVector(right, sx);
    const wantWay = Math.atan2(go.dot(runLeft(here)), go.dot(runDir(here))), short = wrapAngle(wantWay - ride.way);
    // (Turning to the left is to less across, as `ask.x` goes.)
    want.x = -Math.sign(short) * isoSharp(Math.abs(short));
    want.y = amount * (1 - smooth(Math.abs(short) / ISO_STEER.tuck));
  };
  const askRide = () => {
    const by = aim.on ? aim : stickHeld === null && tilting() ? tilt : stick;
    want.auto = false; want.x = by.x; want.y = by.y; want.brake = aim.brake;
    if (isoRiding()) askIso(by);
    // (Too fast for the kicker ahead: braked down to it, and no trick chosen off it until it is slow enough.)
    const checking = !quiet && tooFast();
    if (checking && checkingFor && checkingFor !== toldFor) { toldFor = checkingFor; tell('Speed check', 'too fast for the kicker ahead', false, 1.2); }
    if (checking || stopping) want.brake = true;
    if (crash) { rideTrick = null; return; }
    if (air) {
      if (rideTrick && !rideTrick.air) rideTrick.air = air;
      if (rideTrick && rideTrick.air === air) { const o = askInAir(rideTrick.trick, air); want.x = o.x; want.y = o.y; want.auto = true; }
      return;
    }
    if (rideTrick?.air) rideTrick = null;
    planned = rideTrick?.trick ?? null;
    if (rideTrick) {
      const k = rideTrick.k, toLip = k.L - ((ride.x - k.x) * k.dx + (ride.z - k.z) * k.dz);
      // (Gone by it, not off it: steered off its line.)
      if (toLip < -0.5) { rideTrick = null; return; }
      const o = askAtLip(rideTrick.trick, toLip / Math.max(ride.speed, 1));
      if (o.x !== null) { want.x = o.x; want.auto = true; }
      if (o.y !== null) { want.y = o.y; want.auto = true; }
      return;
    }
    const ahead = checking ? null : kickerAhead();
    if (ahead) { rideTrick = { k: ahead.k, trick: pickTrick(ahead.k, ahead.toLip / Math.max(ride.speed, 1)), air: null }; planned = rideTrick.trick; }
  };

  const showWatchTracks = (t: number | null) => watchTracks.forEach((m, k) => showStrip(m, t === null || k >= watchSkis ? 0 : Math.max(0, Math.floor(t / (2 * STEP))) * 6));

  // ---------------------------------------------------------------- what is shown, and how it is moved about in
  type Mode = 'watch' | 'ride';
  type View = 'cinema' | 'behind' | 'beside' | 'iso' | 'free';
  let mode = 'watch' as Mode;
  let t = 0, playing = true, rate = 1, view = 'cinema' as View, scrubbing = false;
  const rates: [string, number][] = [['¼×', 0.25], ['½×', 0.5], ['1×', 1]];
  const views: [string, View, string][] = [['Cinema', 'cinema', 'C'], ['Behind', 'behind', 'B'], ['Beside', 'beside', 'S'], ['Iso', 'iso', 'A'], ['Free', 'free', 'F']];
  const modes: [string, Mode, string][] = [['Watch demo', 'watch', 'Watch the demo run, a trick off every kicker (R)'], ['Ride', 'ride', 'Ride it yourself: you steer, and each kicker gives you a trick (R)']];
  /** A button in the menu, in the bar or the cards of `parent`; a card says what it is under its name (`detail`). */
  const button = (parent: string, label: string, onclick: () => void, title?: string, detail?: string) => {
    const b = document.createElement('button'), host = $(parent);
    b.type = 'button'; b.onclick = onclick;
    if (title) b.title = title;
    if (detail) { const name = document.createElement('b'), about = document.createElement('span'); name.textContent = label; about.textContent = detail; b.append(name, about); } else b.textContent = label;
    (host.querySelector('.seg, .cards') ?? host).appendChild(b);
    return b;
  };
  // (Choosing to ride closes the menu, which holds riding while it is open.)
  const modeButtons = modes.map(([label, m, title]) => button('modes', label, () => { if (m === 'watch') setDemoKind('tricks'); setMode(m); if (m === 'ride') setMenu(false); }, title));
  // The orc hunt, the second demo run (`ORC_TRICKS`), on a computer (where the tommy gun is): the horse and its rider, whom choosing it
  // puts on the slope.
  // (Its sound woken by the click that chose it, as a browser lets a page make sound only after one.)
  const showButton = button('modes', 'Showcase', () => { setDemoKind('show'); setMode('watch'); }, 'Watch the showcase: tricks off the kickers, a run off the piste in deep snow, every arm against the orcs, and the robot arm at the end');
  const orcHuntButton = button('modes', 'Orc hunt', () => { gunSound.wake(); setDemoKind('orcs'); setMode('watch'); }, 'Watch the horse and its rider take crazy tricks off the kickers and shoot down the orcs coming up the run (O)');
  orcHuntButton.id = 'orcHunt';
  /**
   * Orcs and the tommy gun, a choice of the menu's, on a computer, and not made at first (asked: "lets make the gun and orcs mode an option
   * in the menu (not on by default)"): made, riding a human carries the gun and the orcs come up the run, and the orc hunt may be
   * watched. (Kept in this browser for next time; `?orcs=1` or `?orcs=0` either way.)
   */
  let orcsOn = false;
  /** Whether the arms aim themselves, riding (`setAiming`). */
  let autoAim = true;
  // (The gun's sound woken by the click that turns them on, as a browser lets a page make sound only after one: woken by the first shot,
  // it was made as the first shot was fired.)
  // Off the piste allowed, or kept between the poles as the runs were (asked: "in menu there could be an option to toggle between out of
  // piste allowed or not"): kept in this browser; `?offpiste=0` or `1`.
  const pisteButtons = (['Allowed', 'Not allowed'] as const).map((label, k) => button('pisteSeg', label, () => setOffPiste(k === 0), k ? 'Kept between the poles, turned back at them' : "Out past the poles, as far as the run's snow goes: back between them within fifteen seconds, or the run is over"));
  const setOffPiste = (on: boolean) => {
    offPisteOn = on;
    keep('offpiste', on ? '1' : '0');
    pisteButtons.forEach((b, k) => b.classList.toggle('on', (k === 0) === on));
  };
  // The minimap (`slopeMini.ts`), shown or not: kept in this browser; `?minimap=0` or `1`; `N`.
  const miniEl = $<HTMLCanvasElement>('mini'), mini = new MiniMap(miniEl);
  let miniOn = true, miniTall = 0;
  /**
   * On a phone or a tablet, the run as a slim rail at the right in place of the minimap (`#rail`, `body.touchhud` in the page): its top,
   * its kickers, the cave and its foot along it, and how far down the skier is; tapped, the minimap itself, tapped again, the rail.
   * (Asked: "the vertical view is cluttered with the bars.. propose me a better gui".) On foot in the dungeon, the minimap's plan of it
   * as before.
   */
  const touchHud = !matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.body.classList.toggle('touchhud', touchHud);
  const railEl = $<HTMLButtonElement>('rail'), railTicks = railEl.querySelector('.ticks') as HTMLElement;
  let railOf: Land | null = null, railAt = '', miniOpen = false;
  const openMini = (on: boolean) => { miniOpen = on; document.body.classList.toggle('miniOpen', on); };
  railEl.addEventListener('click', () => openMini(true));
  miniEl.addEventListener('click', () => { if (miniOpen) openMini(false); });
  /** The rail's marks laid for the land now: its top, its kickers, the cave, its foot, each by how far down the run it is. */
  const layRail = (kicks: { s: number }[]) => {
    railOf = land;
    const at = (s: number, kind = '') => { const i = document.createElement('i'); i.style.top = `${clamp(s / land.length, 0, 1) * 100}%`; if (kind) i.className = kind; return i; };
    const cave = caveNow();
    railTicks.replaceChildren(at(0, 'top'), ...kicks.map((k) => at(k.s)), ...(cave ? [at(cave.site.s, 'cave')] : []), at(land.length, 'foot'));
  };
  const miniButtons = (['Shown', 'Hidden'] as const).map((label, k) => button('miniSeg', label, () => setMini(k === 0), k ? 'No minimap' : 'The whole run small at the right, the skier on it, the way down pointing up (N)'));
  const setMini = (on: boolean) => {
    miniOn = on;
    keep('minimap', on ? '1' : '0');
    miniButtons.forEach((b, k) => b.classList.toggle('on', (k === 0) === on));
  };
  /**
   * The minimap a frame on: the run drawn again when the land is another, or the picture another size (smaller on a phone held
   * sideways); and the skier's mark set at `where`, heading as it goes (`at`). Drawn from the land as it lies, not as the cart's ride
   * up it or the land turned inside out have it, which are the same land turned about: drawn from them, its kickers would be none.
   */
  const stepMini = (where: Vector3, at: Now) => {
    const show = miniOn && landKind !== 'groomed';
    // (On foot in the dungeon, its plan as seen so far in the run's stead.)
    const cave = caveNow(), o = land.group.position, onPlan = show && foot && cave && mode === 'ride' ? cave.onPlan(foot.x - o.x, foot.z - o.z) : null;
    if (onPlan && cave && foot && mini.has) {
      if (miniEl.hidden) miniEl.hidden = false;
      if (!railEl.hidden) railEl.hidden = true;
      const p = cave.plan();
      mini.plan(p, onPlan, foot.heading, isoYaw(), p.seen.reduce((n, v) => n + v, 0));
      return;
    }
    if (show && !carting && !inside) {
      const tall = innerHeight <= 500 && innerWidth > innerHeight ? 84 : 140;
      if (mini.of !== land || tall !== miniTall) {
        miniTall = tall;
        const kicks: { s: number; left: number }[] = [];
        for (let i = 0; KICK.first + i * KICK.every < land.length; i++) { const k = kickerOf(i); if (k && k.s < land.length) kicks.push(k); }
        mini.draw(land, kicks, tall, innerWidth < 420 ? 84 : 108);
        if (touchHud) layRail(kicks);
      }
    }
    const shown = show && mini.has && !cat;
    // (On a phone or a tablet, the rail unless the minimap was asked for by a tap; riding only.)
    const rail = touchHud && shown && !miniOpen && mode === 'ride';
    if (railEl.hidden === rail) railEl.hidden = !rail;
    if (rail) {
      if (railOf !== land) { const kicks: { s: number }[] = []; for (let i = 0; KICK.first + i * KICK.every < land.length; i++) { const k = kickerOf(i); if (k && k.s < land.length) kicks.push(k); } layRail(kicks); }
      const k = clamp(at.down / land.length, 0, 1).toFixed(3);
      if (k !== railAt) { railAt = k; railEl.style.setProperty('--at', k); }
    }
    const minied = shown && !rail;
    if (miniEl.hidden === minied) miniEl.hidden = !minied;
    if (!minied) return;
    const f = land.at(at.down, at.left), way = along(at.way, f);
    mini.show(where.x, where.z, way.x, way.z, offPisteFor > 0);
  };
  // The info at the top left (what the skier is doing, how fast, how far down, the points), hidden unless asked for (asked: "lets
  // remove the text box in top left altogether (as default, can be enabled in menu)"): kept in this browser; `?info=1`; `I`.
  let infoOn = false;
  const infoButtons = (['Hidden', 'Shown'] as const).map((label, k) => button('infoSeg', label, () => setInfo(k === 1), k ? 'What the skier is doing, how fast, how far down and the points, at the top left (I)' : 'The picture clear at the top left'));
  const setInfo = (on: boolean) => {
    infoOn = on;
    keep('info', on ? '1' : '0');
    infoButtons.forEach((b, k) => b.classList.toggle('on', (k === 1) === on));
    document.body.classList.toggle('info', on);
  };
  const orcsButtons = (['Off', 'On'] as const).map((label, k) => button('orcsSeg', label, () => { if (k === 1) gunSound.wake(); setOrcs(k === 1); }, k ? 'The skier, or the horse\'s rider, carries arms in place of its poles, and orcs, goblins, wolves, the frozen dead and yetis come up the run: a sword first, then a pistol, a shotgun, a flamethrower, a tommy gun, a lightning gun and a bazooka as more are brought down; adds the orc hunt to watch (O)' : 'No orcs, and poles in the hands'));
  const setOrcs = (on: boolean) => {
    orcsOn = on;
    keep('orcs', on ? '1' : '0');
    // (The orcs' body dressed now, before any are wanted: dressing it takes a moment, which riding along would feel.)
    // (And made ready to be drawn, and the gun with them.)
    if (on) void horde.prepare().then(() => warmSoon(gun), () => {});
    if (!on && demoKind === 'orcs') setDemoKind('tricks');
    reflect();
  };
  /**
   * How the arms are aimed, riding (asked: "Can we find a nice way to leave out human aiming? Like auto targeting and just attack button
   * and maybe cycle target buttons next to attack"): *Auto*, at first, the arms locked on a foe by themselves (the nearest they can
   * reach, kept until it falls or is lost, another chosen with the buttons beside *Attack* or by touching it), each attack rolled to
   * strike or miss (`slopeDice.ts`); or *Free*, aimed by hand at the guide's mark or a finger, as they were. Kept in this browser;
   * `?aim=free` or `auto`.
   */
  const aimButtons = (['Auto', 'Free'] as const).map((label, k) => button('aimSeg', label, () => setAiming(k === 0), k ? 'Aimed by hand: at the mark the pointer steers by, or where a finger is on the picture' : 'Locked on the nearest foe by themselves; Attack strikes at it, rolled to hit or miss; ◀ ▶ (Q, E) or touching a foe chooses another'));
  const setAiming = (on: boolean) => {
    autoAim = on;
    keep('aiming', on ? 'auto' : 'free');
    aimButtons.forEach((b, k) => b.classList.toggle('on', (k === 0) === on));
  };
  /** Which demo run is watched; the orc hunt's with the horse and its rider. */
  const setDemoKind = (k: 'tricks' | 'orcs' | 'show') => {
    if (k === 'orcs' && !orcsOn) return;
    if (k === 'orcs' && who !== 'mounted') setSkier('mounted');
    // (The showcase's arms want a human to hold them: the horse alone gets its rider; and its orcs made ready, on or not.)
    if (k === 'show') { if (who === 'horse') setSkier('mounted'); void horde.prepare().then(() => warmSoon(gun, ...arms.values()), () => {}); }
    if (k === demoKind) return;
    demoKind = k;
    clearGun?.();
    if (mode === 'watch') { t = 0; placed = false; clearSpray(); void useDemo(); }
    reflect();
  };
  // The menu: opened by its button or `H`, closed by its cross, `H` or Escape. Riding is held while it is open; watching goes on.
  const menuEl = $('menu'), menuButton = $('menuButton');
  let menuOpen = false;
  const setMenu = (open: boolean) => {
    if (open === menuOpen && menuEl.hidden === !open) return;
    // (Where the keys' focus was, seen before the panel goes, which takes it along.)
    const inside = menuEl.contains(document.activeElement);
    menuOpen = open;
    // (The pack shown afresh: the arm the foes have given may have changed since.)
    if (open && pack) regear();
    if (open) showNow();
    menuEl.hidden = !open;
    // (The pointer goes off to the menu: it lets the skier go, and takes it again only once brought back over it.)
    if (open) letAimGo();
    document.body.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    // (The keys' focus taken into the menu, and given back to its button: on the panel itself, not on a button in it, so that Space
    // still pauses rather than pressing the button.)
    if (open) menuEl.focus({ preventScroll: true }); else if (inside) menuButton.focus({ preventScroll: true });
  };
  menuButton.onclick = () => setMenu(true);
  $('menuClose').onclick = () => setMenu(false);
  $('menuResume').onclick = () => setMenu(false);
  doingWhenLost = () => `${runs.find((r) => r.id === landKind)?.label ?? landKind}, ${mode === 'watch' ? `watching (${demoKind})` : inside ? (cat ? 'the land turning back' : inside.reversed ? 'riding the land inside out' : 'the land turning inside out') : cat ? `the way back to the top (${cat.by})` : foot ? 'on foot at the cave' : trip ? `off to ${trip.kind}` : 'riding'}`;
  /** What went wrong last time the page was open, said once riding begins. */
  let lostBefore: { why: string; doing: string } | null = null;
  try { const k = localStorage.getItem('slope.lost'); if (k) { lostBefore = JSON.parse(k); localStorage.removeItem('slope.lost'); } } catch { /* (none) */ }
  // (The last number gone bad, said in the menu under *Settings*: `noteProblem`.)
  showProblem = () => {
    try {
      const k = JSON.parse(localStorage.getItem('slope.problem') ?? 'null');
      const el = $('problemNote');
      el.hidden = !k;
      if (k) el.textContent = `Last problem seen (${new Date(k.at).toLocaleString()}): ${k.what}`;
    } catch { /* (none) */ }
  };
  showProblem();
  /** The card at the menu's head: the run, and whether it is ridden, watched (which demo) or walked in its cave. */
  const showNow = () => {
    say($('menuRun'), runs.find((r) => r.id === landKind)?.label ?? 'The groomed slope');
    say($('menuDoing'), mode === 'ride' ? (foot ? 'On foot at the cave' : 'Riding') : demoKind === 'show' ? 'Watching the showcase' : demoKind === 'orcs' ? 'Watching the orc hunt' : 'Watching the demo run');
    say($('menuResume'), mode === 'ride' ? 'Resume' : 'Watch on');
  };
  /** The menu's parts, one shown at a time, chosen by its tabs; the last chosen kept in this browser. */
  const tabButtons = [...$('menuTabs').querySelectorAll<HTMLButtonElement>('button[data-tab]')];
  const showTab = (k: string) => {
    if (!tabButtons.some((b) => b.dataset.tab === k)) k = 'play';
    for (const b of tabButtons) { const on = b.dataset.tab === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    for (const sec of menuEl.querySelectorAll<HTMLElement>('section.tab')) sec.hidden = sec.dataset.tab !== k;
    (menuEl.querySelector('.scroll') as HTMLElement).scrollTop = 0;
    try { localStorage.setItem('slope.menuTab', k); } catch { /* (not kept) */ }
  };
  for (const b of tabButtons) b.addEventListener('click', () => showTab(b.dataset.tab!));
  // (The arrow keys along the tabs, as tabs go.)
  $('menuTabs').addEventListener('keydown', (e) => {
    const i = tabButtons.findIndex((b) => b === document.activeElement), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (i < 0 || !d) return;
    const next = tabButtons[(i + d + tabButtons.length) % tabButtons.length];
    showTab(next.dataset.tab!); next.focus(); e.preventDefault(); e.stopPropagation();
  });
  showTab((() => { try { return localStorage.getItem('slope.menuTab') ?? 'play'; } catch { return 'play'; } })());
  const whos: [string, Who][] = [['Horse & rider', 'mounted'], ['Horse', 'horse'], ['Person', 'person']];
  const skiSets: [string, HorseSkis, string][] = [['Two long', 'pair', 'A long ski under each side, the fore and hind hooves bound to it'], ['Four short', 'four', 'A short ski under each hoof']];
  const whoButtons = whos.map(([label, w]) => button('skiers', label, () => setSkier(w)));
  // The land: the world's run, or the groomed slope; changed where the skier is, the demo run flown on the new land and riding
  // begun again from its top.
  const landKinds: [string, LandKind, string, string][] = [...runs.map((r): [string, LandKind, string, string] => [r.label, r.id, r.title, r.detail]), ['Groomed', 'groomed', 'A groomed slope at sixteen degrees, going on for ever', 'Sixteen degrees, going on for ever']];
  // (Riding a world's run, another of them chosen here is ridden off to as on the map, `rideOn`.)
  const landButtons = landKinds.map(([label, k, title, detail]) => button('lands', label, () => { if (mode === 'ride' && k !== 'groomed' && landKind !== 'groomed' && k !== landKind) { setMenu(false); rideOn(k); } else void setLand(k); }, title, detail));
  const snowLooks: [string, SnowLook, string][] = [['Detailed', 'game', 'Snow, rock and far country in full detail'], ['Plain', 'plain', 'Plain snow and rock: lighter to draw']];
  const snowButtons = snowLooks.map(([label, k, title]) => button('snows', label, () => { if (k !== snowLook) { snowLook = k; if (landKind !== 'groomed') void setLand(landKind, true); else reflect(); } }, title));
  const setLand = async (kind: LandKind, again = false) => {
    abortTrip();
    leaveFoot();
    if (kind === landKind && !again) return;
    await loading.busy(kind !== 'groomed' ? `Laying the snow ${whereOf(kind)}` : 'Laying the groomed slope');
    const next = await landOf(kind);
    loading.idle();
    unflip();
    dropKickers();
    landKind = kind;
    resetScore();
    // (Laid at the middle of the scene again: whatever land was stood elsewhere, ridden off to, taken out of it.)
    land.group.removeFromParent();
    land = next;
    clearRideTracks();
    landShift = new Vector3(); landTop = topOf.get(next) ?? null;
    showLand();
    // Every run left behind let go of (asked: "can we add new runs without much performance impact"): its land, the demo runs flown on
    // it, its slice; so that the page holds one run at a time however many there are to choose from, and however many are visited.
    // Kept, each held a hundred to a hundred and fifty megabytes of shapes, and as much again on the graphics card, until the page was
    // closed: four runs visited, more than a phone has to give. (Coming back to one, it is laid again from the slice,
    // which the browser has kept, in about a second, and its demo run flown again. The groomed slope, small, is kept.)
    for (const [key, l] of lands) if (l !== land && key !== 'groomed') { if (l.dispose) toLetGo.push(l.dispose); demos.delete(l); lands.delete(key); }
    for (const k of [...sliceTexts.keys()]) if (k !== kind) { sliceTexts.delete(k); fetching.delete(`${slices}${k}.json`); }
    buildFold();
    warmSoon();
    if (mode === 'ride') restart();
    else { await useDemo(); t = 0; placed = false; clearSpray(); }
    try { history.replaceState(null, '', kind === opensOn ? location.pathname + location.search : `#${kind}`); } catch { /* (not where the page may not change its address) */ }
    reflect();
  };
  const skiButtons = skiSets.map(([label, k, title]) => button('skisets', label, () => setSkier(who, k), title));
  const rateButtons = rates.map(([label, r]) => button('rates', label, () => { rate = r; reflect(); }));
  const viewButtons = views.map(([label, v, key]) => button('views', label, () => setView(v), `${label} (${key})`));
  const restartButton = $('restart');
  restartButton.onclick = () => { restart(); setMenu(false); };
  // The stance: turned round on the snow to switch, or back to regular, by the next of the ground 180s; named for where it goes.
  const stanceButton = $('stance');
  // (Turned on the finger's touch, not its click (asked: "multi touch need to be enabled to be able to click 180 while steering on
  // mobile"): a phone makes no click of a tap while another finger is down, as the thumb on the stick is; so a touch turns it as it
  // lands, and the click that may follow it is let pass. A mouse, or the keyboard, by the click.)
  // (Skating, held: by the finger on it, kept with it as it moves off it; by the mouse; or `Z`.)
  const skateButton = $('skate');
  const holdSkate = (on: boolean) => { skateHeld = on; skateButton.classList.toggle('on', on); };
  skateButton.addEventListener('pointerdown', (e) => { e.preventDefault(); skateButton.setPointerCapture(e.pointerId); holdSkate(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) skateButton.addEventListener(ev, () => holdSkate(false));
  skateButton.addEventListener('contextmenu', (e) => e.preventDefault());
  let stanceTouched = -Infinity;
  stanceButton.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; e.preventDefault(); stanceTouched = performance.now(); start180(); });
  stanceButton.onclick = () => { if (performance.now() - stanceTouched > 800) start180(); };
  let stanceShown = '';
  // (The button says only "180"; where it goes, in its name for a screen reader, and lit while riding switch.)
  const showStance = () => { const to = ride.switch ? '180 to regular' : '180 to switch'; if (to !== stanceShown) { stanceShown = to; stanceButton.setAttribute('aria-label', to); stanceButton.classList.toggle('switch', ride.switch); } };
  // How wild the tricks are, kept in this browser for next time.
  wildInput.addEventListener('input', () => keep('wild', wildInput.value));
  const line = $('line'), head = line.querySelector('.head') as HTMLElement;
  // The demo run's parts along the timeline, and its seconds ticked off under them, five at a time.
  let bands: HTMLElement[] = [], shownPart = '';
  const buildTimeline = () => {
    for (const b of bands) b.remove();
    bands = demo.parts.map((part) => {
      const d = document.createElement('div'); d.className = 'band';
      d.style.left = `${(part.from / demo.length) * 100}%`; d.style.width = `${((part.to - part.from) / demo.length) * 100}%`;
      const s = document.createElement('span'); s.textContent = part.label; d.title = part.label; d.appendChild(s);
      line.insertBefore(d, head);
      return d;
    });
    line.style.setProperty('--ticks', String(demo.length / 5));
    line.setAttribute('aria-valuemax', demo.length.toFixed(1));
    shownPart = '';
  };
  /**
   * The demo run for the land and the skier as they are, flown if it has not been (a second or so, said while it is), its timeline
   * laid along the foot and its tracks on the snow.
   */
  const useDemo = async () => {
    if (!demos.get(land)?.has(demoKey())) await loading.busy('Flying the demo run');
    const d = demoFor();
    loading.idle();
    if (d !== demo) { demo = d; buildTimeline(); t = Math.min(t, demo.length - 0.01); }
    layWatchTracks();
    showWatchTracks(mode === 'watch' ? t : null);
  };
  // (The stick and the trick controls lifted over the foot while the menus are shown.)
  const reflect = () => {
    $('play').textContent = playing ? 'Pause' : 'Play';
    modeButtons.forEach((b, i) => b.classList.toggle('on', modes[i][1] === mode && (mode !== 'watch' || demoKind === 'tricks')));
    orcHuntButton.classList.toggle('on', mode === 'watch' && demoKind === 'orcs');
    showButton.classList.toggle('on', mode === 'watch' && demoKind === 'show');
    orcHuntButton.hidden = !orcsOn;
    orcsButtons.forEach((b, k) => b.classList.toggle('on', (k === 1) === orcsOn));
    rateButtons.forEach((b, i) => b.classList.toggle('on', rates[i][1] === rate));
    viewButtons.forEach((b, i) => { b.classList.toggle('on', views[i][1] === view); b.hidden = mode === 'ride' && views[i][1] === 'free'; });
    $('playback').hidden = mode === 'ride';
    $('stick').hidden = $('tricky').hidden = $('restarts').hidden = mode === 'watch';
    $('tricky').classList.toggle('earned', orcsOn);
    showWild();
    restartButton.classList.toggle('on', !!crash);
    whoButtons.forEach((b, i) => b.classList.toggle('on', whos[i][1] === who));
    skiButtons.forEach((b, i) => b.classList.toggle('on', skiSets[i][1] === horse.skis));
    $('skisets').hidden = who === 'person';
    // (The game's name is the menu's; here, where and who.)
    $('name').textContent = [land.short, { person: '', horse: 'horse', mounted: 'horse and rider' }[who], mode === 'ride' ? 'riding' : ''].filter(Boolean).join(' · ');
    landButtons.forEach((b, i) => b.classList.toggle('on', landKinds[i][1] === landKind));
    snowButtons.forEach((b, i) => b.classList.toggle('on', snowLooks[i][1] === snowLook));
    $('snows').hidden = landKind === 'groomed';
    $('of').textContent = land.fall === Infinity ? '' : ` of ${land.fall.toFixed(0)}`;
    document.body.classList.toggle('riding', mode === 'ride');
  };
  $('play').onclick = () => { playing = !playing; reflect(); };
  // (Free: the view turned about the skier by hand, and carried along with it; only watching, as riding the stick steers.)
  const setView = (v: View) => { view = mode === 'ride' && v === 'free' ? 'behind' : v; viewFor[mode] = view; controls.enabled = view === 'free'; camera.up.set(0, 1, 0); placed = false; reflect(); };
  /**
   * The view each mode was last left in, taken up again on coming back to it: watching, the cinematic view to begin with; riding,
   * from behind (asked: "make behind view default for player controlled runs"), where the rider sees the way ahead it steers on.
   */
  const viewFor: Record<Mode, View> = { watch: 'cinema', ride: 'behind' };
  const setMode = (m: Mode, quietly = false) => {
    // (Any mode chosen otherwise answers the opening's question; not the showcase's own going over to its end, and back, `endShow`.)
    if (!quietly) { $('choose').hidden = true; $('intro').hidden = true; document.body.classList.remove('choosing'); }
    showEnding = false; showBack = 0;
    if (m === mode) return;
    leaveFoot();
    abortTrip();
    offPisteFor = 0; $('offPiste').hidden = true;
    endCatapult();
    letAimGo();
    if (m === 'ride') {
      // Ridden from where the demo run had got to, going as it went (or, if it was in the air there, from where it comes down).
      let i = clamp(Math.round(t / STEP), 0, demo.frames.length - 1);
      while (i < demo.frames.length - 1 && demo.frames[i].air) i++;
      const s = demo.frames[i].now, sw = demo.frames[i].sw;
      Object.assign(ride, { way: s.way, speed: s.speed, facing: chestTo(s.way) + (sw ? Math.PI : 0), tuck: s.tuck, tall: 0, brake: 0, lean: 0, leanSide: 0, flickL: 0, flickR: 0, time: 0, ended: false, switch: sw, back: sw ? 1 : 0, stones: 0, overStones: 0, bare: 0, deep: 0 });
      Object.assign(ask, { x: 0, y: s.tuck });
      Object.assign(want, { x: 0, y: s.tuck, brake: false, brakeKey: false });
      showWatchTracks(null);
      newRideRun();
      levelTilt();
      playing = true;
      // (On the snow where the demo run had got to; on a kicker's, if one stands there.)
      putAt(s.down, s.left);
      placeKickers(ride.down);
      ride.y = ground(ride.x, ride.z);
      ride.vy = risingHere();
      ride.out = bumpAt(ride.x, ride.z);
      ride.absorb = ride.skid = ride.sink = ride.pop = 0;
      ride.settle = { spin: 0, flip: 0, left: 0 };
    } else newRideRun();
    air = null; crash = null; joints = jointsBefore = null;
    told = { text: '', small: '', bad: false, until: 0 };
    mode = m;
    // (Back to watching: the demo run for the skier there is now, flown if a new skier was chosen while riding.)
    if (m === 'watch') { seat(); void useDemo(); }
    clearSpray();
    setView(viewFor[m]);
    placed = false;
  };
  /**
   * The showcase come to the foot of the run (asked: "the ending transition should be the robot arm throw in the demo"): ridden out as
   * a run's end is, with no one at the controls, the robot arm coming up out of the snow for it and throwing it back up to the top,
   * under the parachute (`showEnding`); and a moment after it is down there, the showcase watched again from its top (`showBack`).
   * (Ridden: the run's end is the ride's. The ride's own view kept as it was.)
   */
  let showEnding = false, showBack = 0;
  const endShow = () => {
    const rideView = viewFor.ride;
    t = demo.length - 0.01;
    setMode('ride', true);
    viewFor.ride = rideView;
    showEnding = true;
    ending = 'arm';
    ride.ended = true;
  };
  /**
   * Another skier, or the horse on other skis: watching, the demo run flown for it (once; then kept) and its tracks laid; riding, it
   * goes on from where the last was (or from the top, if that one lay fallen).
   */
  const setSkier = (w: Who, skis: HorseSkis = horse.skis) => {
    if (w === who && skis === horse.skis) return;
    leaveFoot();
    skier.object.removeFromParent();
    if (skis !== horse.skis) { horse.setSkis(skis); rimAll(horse.model); }
    who = w;
    skier = skiers[w];
    rider.add(skier.object);
    seat();
    joints = jointsBefore = null;
    if (mode === 'ride' && (crash || cat)) restart();
    if (air) { air = null; ride.y = ground(ride.x, ride.z); ride.vy = risingHere(); }
    if (mode === 'watch') void useDemo();
    newRideRun();
    clearSpray();
    placed = false;
    reflect();
  };
  const seek = (x: number) => { const r = line.getBoundingClientRect(); t = clamp(((x - r.left) / r.width) * demo.length, 0, demo.length - 0.01); clearSpray(); };
  line.addEventListener('pointerdown', (e) => { scrubbing = true; line.setPointerCapture(e.pointerId); seek(e.clientX); });
  line.addEventListener('pointermove', (e) => { if (scrubbing) seek(e.clientX); });
  line.addEventListener('pointerup', () => { scrubbing = false; });
  line.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { t = clamp(t + (e.key === 'ArrowRight' ? 1 : -1), 0, demo.length - 0.01); clearSpray(); e.preventDefault(); } });

  // Riding by the stick at the lower left, under the thumb: where it is held against its middle, as far as its rim; to either side
  // turning, carved, and out past eight tenths of the way skidded; up tucked, down standing straight. Let go of, it springs back to its
  // middle, and the skier eases back to its plain stance, going straight. (By mouse too, dragged.)
  const stickEl = $('stick'), knob = stickEl.querySelector('.knob') as HTMLElement;
  let stickHeld: number | null = null, knobAt = '';
  const holdStick = (e: PointerEvent) => {
    const r = stickEl.getBoundingClientRect(), half = r.width / 2;
    let x = (e.clientX - (r.left + half)) / (half * 0.82), y = ((r.top + half) - e.clientY) / (half * 0.82);
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    stick.x = x; stick.y = y;
  };
  const letGo = () => { stick.x = 0; stick.y = 0; stickHeld = null; homeStick(); };
  /**
   * The stick where the thumb comes down (asked: "Can we make the left thumb movement control position "dynamic", placed where the
   * player puts their left side thumb?"): on a phone or a tablet, a thumb put down anywhere on the left of the picture, under the
   * strip at its top, brings the stick there, its middle under the thumb, and steers from there as it moves; let go, the stick goes back
   * to its corner. (Not while the run's end is at its work or the skier lies fallen, when a tap begins the next run; nor over the
   * picture's buttons, which take their own touches.) What is carried is fired by a finger on the rest of the picture.
   */
  const homeStick = () => { if (!stickEl.classList.contains('floating')) return; stickEl.classList.remove('floating'); stickEl.style.left = stickEl.style.top = stickEl.style.bottom = ''; };
  const floatsStick = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || stickHeld !== null || mode !== 'ride' || menuOpen || stickEl.hidden || cat || crash || runOver) return false;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const strip = parseFloat(getComputedStyle(document.body).getPropertyValue('--under')) || 70;
    return x < r.width * 0.42 && y > strip + 10 && y < r.height - 4;
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!floatsStick(e)) return;
    // (The stick's middle under the thumb, kept whole on the picture.)
    const w = stickEl.offsetWidth, h = stickEl.offsetHeight;
    stickEl.classList.add('floating');
    stickEl.style.left = `${clamp(e.clientX - w / 2, 4, innerWidth - w - 4)}px`;
    stickEl.style.top = `${clamp(e.clientY - h / 2, 4, innerHeight - h - 4)}px`;
    stickEl.style.bottom = 'auto';
    stickHeld = e.pointerId;
    try { stickEl.setPointerCapture(e.pointerId); } catch { /* (a pointer it cannot take: followed by the canvas's own) */ }
    holdStick(e);
    // (The picture's own handling of a touch, firing or walking to it, not done for this one.)
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  canvas.addEventListener('pointermove', (e) => { if (stickHeld === e.pointerId) holdStick(e); });
  canvas.addEventListener('pointerup', (e) => { if (stickHeld === e.pointerId) letGo(); });
  canvas.addEventListener('pointercancel', (e) => { if (stickHeld === e.pointerId) letGo(); });
  stickEl.addEventListener('pointerdown', (e) => { stickHeld = e.pointerId; stickEl.setPointerCapture(e.pointerId); holdStick(e); e.preventDefault(); });
  stickEl.addEventListener('pointermove', (e) => { if (stickHeld === e.pointerId) holdStick(e); });
  stickEl.addEventListener('pointerup', letGo);
  stickEl.addEventListener('pointercancel', letGo);
  const showStick = () => {
    const half = stickEl.offsetWidth / 2 || 66, x = stickHeld !== null ? stick.x : ask.x, y = stickHeld !== null ? stick.y : tilting() ? ask.y : 0;
    const to = `translate(${(x * half * 0.82).toFixed(1)}px, ${(-y * half * 0.82).toFixed(1)}px)`;
    if (to !== knobAt) { knobAt = to; knob.style.transform = to; }
  };
  // Steering by tilting (asked: "for mobile users enable steer by device tilting with the calibration for steering being centered at
  // the position the device is at the start of the run"): on a phone or a tablet, from however it was held as the run began, tipped
  // to the right (its right edge lowered, as a wheel is turned) it turns right, out past eight tenths of the way skidded, as the stick
  // does; its top tipped away from the rider it tucks, toward the rider it stands straight. Measured as how far the screen's own edges
  // tip against the level, so that it goes alike held up before the face and turned as a wheel, or lying flat and tipped. A thumb on
  // the stick takes over while it is held. (*Steering* in the menu: the stick alone, or tilting too; kept for next time. A browser
  // that asks before a page may read how the device is held, as an iPhone's does, is asked at the first touch.)
  const tilt = { x: 0, y: 0, roll: 0, pitch: 0, heard: 0, calm: 0, zero: null as { roll: number; pitch: number; until: number } | null };
  /** How far tipped asks a full turn, and a full tuck or stance; and how far it may be tipped either way and ask nothing. */
  const TILT = { roll: deg(26), pitch: deg(24), give: deg(2.5) };
  /**
   * Levelled again by itself (asked: "steering should recalibrate/reorient to center on its own if player holds the phone relatively
   * still for a few seconds without making "steering moves""): held still, turning by less than so much a second, for so long, however
   * it is held then is eased to be the level, over some seconds, so that a hold that has crept off its level as the run went on comes
   * back to running straight. Only as far off its level as a hold creeps, a third of the way to the hardest turn (some nine degrees):
   * further is a turn meant, held through a long carve, which is not taken out from under it (levelled, it turned the other way as
   * the phone was brought back).
   */
  const RELEVEL = { still: deg(6), after: 2.5, over: 2, most: 0.35 };
  const canTilt = typeof DeviceOrientationEvent !== 'undefined';
  // (Off until chosen (asked: "disable tilt steering by default on mobile"): the stick steers at first.)
  let tiltWanted = false, tiltHeard = false, tiltAsking = false;
  /** Whether tilting steers now: chosen, heard from, and no mouse. */
  const tilting = () => tiltWanted && tiltHeard && !document.body.classList.contains('mouse');
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    // (Which way is up in the device's own frame, x to its right, y to its top and z out of its screen, from its tilts front to back
    // and side to side; and then in the screen's, as it is turned to be held sideways.)
    const b = deg(e.beta), g = deg(e.gamma), ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b), uz = Math.cos(g) * Math.cos(b);
    const turned = deg(screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
    const sx = ux * Math.cos(turned) - uy * Math.sin(turned), sy = ux * Math.sin(turned) + uy * Math.cos(turned);
    // (Its right edge lowered under the level; its top tipped back from standing up. Eased a little, the sensor being unsteady.)
    const roll = Math.asin(clamp(-sx, -1, 1)), pitch = Math.atan2(uz, sy), now = performance.now(), since = Math.min(0.1, (now - tilt.heard) / 1000);
    const k = tiltHeard ? 1 - Math.exp(-since / 0.06) : 1, was = { roll: tilt.roll, pitch: tilt.pitch };
    tilt.roll += wrapAngle(roll - tilt.roll) * k; tilt.pitch += wrapAngle(pitch - tilt.pitch) * k;
    // (How long it has been held still: turned by less than `RELEVEL.still` a second, either way.)
    const turning = since > 0 ? Math.hypot(wrapAngle(tilt.roll - was.roll), wrapAngle(tilt.pitch - was.pitch)) / since : 0;
    tilt.calm = tiltHeard && turning < RELEVEL.still ? tilt.calm + since : 0;
    tilt.heard = now; tiltHeard = true;
    // (Levelled, taken from how it is held over the next moment, once it has settled there: so that a run begun as the device is
    // still being brought to hand begins straight.)
    if (!tilt.zero) { tilt.roll = roll; tilt.pitch = pitch; tilt.zero = { roll, pitch, until: now + 300 }; }
    if (now < tilt.zero.until) { tilt.zero.roll = tilt.roll; tilt.zero.pitch = tilt.pitch; }
    else if (tilt.calm > RELEVEL.after) {
      const ease_ = 1 - Math.exp(-since / RELEVEL.over), offRoll = wrapAngle(tilt.roll - tilt.zero.roll), offPitch = wrapAngle(tilt.pitch - tilt.zero.pitch);
      if (Math.abs(offRoll) < RELEVEL.most * TILT.roll) tilt.zero.roll += offRoll * ease_;
      if (Math.abs(offPitch) < RELEVEL.most * TILT.pitch) tilt.zero.pitch += offPitch * ease_;
    }
    const ask_ = (a: number, full: number) => Math.sign(a) * clamp((Math.abs(a) - TILT.give) / (full - TILT.give), 0, 1);
    tilt.x = ask_(wrapAngle(tilt.roll - tilt.zero.roll), TILT.roll);
    tilt.y = ask_(wrapAngle(tilt.pitch - tilt.zero.pitch), TILT.pitch);
  };
  /** Begun again from however the device is held now: at the start of each run, and as the screen is turned. */
  const levelTilt = () => { tilt.zero = null; };
  const listenTilt = async () => {
    if (!canTilt || !tiltWanted || tiltHeard || tiltAsking || document.body.classList.contains('mouse')) return;
    const asks = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    tiltAsking = true;
    try { if (asks && (await asks.call(DeviceOrientationEvent)) !== 'granted') return; } catch { return; } finally { tiltAsking = false; }
    removeEventListener('deviceorientation', onTilt);
    addEventListener('deviceorientation', onTilt);
  };
  addEventListener('pointerup', () => void listenTilt(), true);
  screen.orientation?.addEventListener('change', levelTilt);
  addEventListener('orientationchange', levelTilt);
  // The way back to the top, in the menu: asked each time, by chance, or one way always.
  const BACK_CHOICES: [BackBy, string, string][] = [
    ['ask', 'Ask', 'Ask how to get back to the top each time a run ends'], ['random', 'Random', 'A way back to the top chosen by chance each run'],
    ['arm', 'Robot arm', 'The robot arm throws you back to the top'], ['whirlwind', 'Tornado', 'A tornado gathers at the foot of the run and flings you back to the top'],
    ['blast', 'Explosion', 'The ground blows up and throws you back to the top'], ['saucer', 'Flying saucer', 'A flying saucer beams you up and flies you back to the top'],
    ['snowman', 'Snowman', 'A snowman drives you back to the top'], ['invert', 'Inside out', 'The world turns inside out and you ride back down to the top'],
    ['cart', 'Rocket cart', 'A rocket cart is brought down to you, and you drive it back up to the top'],
    ['plane', 'Airplane', 'A small plane snatches you up on a hook, flies you back and drops you over the top under a parachute'],
    ['ice', 'Ice jump', 'A tower of ice and a ski jump rise out of the snow under you, and you jump back to the top'],
  ];
  const backButtons = BACK_CHOICES.map(([w, label, title]) => button('waysSeg', label, () => setBackBy(w), title));
  showBackBy = () => backButtons.forEach((b, k) => b.classList.toggle('on', BACK_CHOICES[k][0] === backBy));
  const tiltButtons = (['Stick', 'Tilt'] as const).map((label, k) => button('tiltSeg', label, () => setTilt(k === 1, true), k ? 'Tip the device to steer and to tuck, from however it is held as the run begins' : 'Steer by the stick at the lower left alone'));
  $('tiltField').hidden = !canTilt;
  /**
   * Steering by tilting, or not; kept, `chosen` in the menu, as `steering`. (Not as `tilt`, which was kept as the page opened, chosen or
   * not, while tilting was the first choice: every phone that had opened it kept tilting so, and would have gone on tilting.)
   */
  const setTilt = (on: boolean, chosen = false) => {
    tiltWanted = on;
    if (chosen) keep('steering', on ? 'tilt' : 'stick');
    tiltButtons.forEach((b, k) => b.classList.toggle('on', (k === 1) === on));
    if (on) { levelTilt(); void listenTilt(); }
  };
  const ARROWS: Record<string, keyof typeof want.keys> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const WASD: Record<string, keyof typeof want.keys> = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) { setMenu(false); return; }
    // (The map of the runs open, the keys are its own: it closes itself on Escape.)
    if (!$('choose').hidden) return;
    // (With Ctrl, Alt or the command key held, a key is the browser's own: Ctrl+R to load the page again had first switched to riding,
    // Ctrl+F the view to the free one, Ctrl+C to the cinematic.)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLButtonElement && e.key === ' ') return;
    if (mode === 'ride' && ARROWS[e.key]) { want.keys[ARROWS[e.key]] = true; e.preventDefault(); return; }
    // (On foot, W, A, S and D as the arrows, by where the keys are whatever the keyboard's letters: riding, S and A are views.)
    // (And seen from above on the snow, where they are its way to go as on foot: there A and S are not the views.)
    if (mode === 'ride' && (foot || view === 'iso') && WASD[e.code] && !(e.target instanceof HTMLInputElement)) { want.keys[WASD[e.code]] = true; e.preventDefault(); return; }
    if (mode === 'ride' && e.key === 'Shift') { want.brakeKey = true; return; }
    if (mode === 'ride' && e.key.toLowerCase() === 'x' && !(e.target instanceof HTMLInputElement)) { start180(); e.preventDefault(); return; }
    if (mode === 'ride' && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) { if (!e.repeat) holdSkate(true); e.preventDefault(); return; }
    if (mode === 'ride' && e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { restart(); e.preventDefault(); return; }
    // (Carrying arms, Space attacks, held as the button is, in place of pausing; the arms aiming themselves, Q and E, or Tab, lock on
    // the foe to the left or the right.)
    if (mode === 'ride' && armed() && !menuOpen && !(e.target instanceof HTMLInputElement)) {
      if (e.key === ' ') { if (!e.repeat) attackDown(); e.preventDefault(); return; }
      if (rolling() && (e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e' || e.key === 'Tab')) { cycleLock(e.key.toLowerCase() === 'q' ? -1 : 1); e.preventDefault(); return; }
    }
    // (Asked the way back, by its number.)
    // (Asked the way back, by its number: 1 to 9, and 0 for the tenth.)
    const nth = e.key === '0' ? 9 : /^[1-9]$/.test(e.key) ? +e.key - 1 : -1;
    if (asking && nth >= 0 && nth < wayButtons.length && !wayButtons[nth].hidden) { takeWay(WAY_NAMES[nth][0]); e.preventDefault(); return; }
    // (A view's key only as it is pressed, not as it repeats held: walking out of the camp with A or S held, the skis on and the keys no
    // longer the walker's, their repeats chose the view from above, or beside, as it rode on.)
    const k = e.key.toLowerCase(), v = views.find((x) => x[2].toLowerCase() === k);
    if (e.target instanceof HTMLInputElement) return;
    if (k === ' ') { playing = !playing; reflect(); e.preventDefault(); } else if (k === 'r') setMode(mode === 'ride' ? 'watch' : 'ride'); else if (k === 'h') setMenu(!menuOpen); else if (k === 'm') $('openMap').click(); else if (k === 'n') setMini(!miniOn); else if (k === 'i') setInfo(!infoOn); else if (v && !e.repeat) setView(v[1]);
    else if (k === 'o' && orcsOn) { gunSound.wake(); setDemoKind('orcs'); setMode('watch'); }
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') attackUp(); if (ARROWS[e.key]) want.keys[ARROWS[e.key]] = false; if (WASD[e.code]) want.keys[WASD[e.code]] = false; if (e.key === 'Shift') want.brakeKey = false; if (e.key.toLowerCase() === 'z') holdSkate(false); });
  window.addEventListener('blur', () => { holdSkate(false); for (const k of Object.keys(want.keys) as (keyof typeof want.keys)[]) want.keys[k] = false; want.brakeKey = false; letGo(); letAimGo(); });

  // Riding by mouse or touchpad (asked: "make better controls for desktop/laptop users, current is for touch screens. Mouse / touchpad
  // control should be enough?"): the pointer steers from wherever it is over the picture, with no button held, so that a finger
  // gliding on a touchpad is enough; where it is against the middle of the picture, where the views keep the skier, is where the
  // thumb would hold the stick against its middle, out to `aimReach` either way: to either side turning, carved, and out past eight
  // tenths of the way skidded; above tucked, below standing straight; any of them together, and past the reach as far as it goes. A
  // guide drawn about the skier shows how far that is, where a turn skids, and the mark the pointer has become. The button held down
  // brakes (as Shift does); a right click, a tap with two fingers on a touchpad, turns round to switch (X); a click once a run is over
  // starts the next at once (Enter); scrolled or pinched, the view comes nearer or goes further off (*Distance*). The pointer takes the
  // skier only once it is brought within the guide, so that left where the menu's buttons were, far out at a side, it does not throw
  // the skier into a turn as riding goes on; and it lets the skier go, running straight, when it leaves the picture for a control or
  // the window. With a mouse the stick is put away and the guide drawn; a finger on the screen brings the stick back.
  const aimEl = $('aim'), aimDot = aimEl.querySelector('.dot') as HTMLElement;
  /** How far from the middle of the picture the pointer asks the most, in pixels: some three tenths of the picture's shorter side. */
  const aimReach = () => clamp(0.3 * Math.min(innerWidth, innerHeight), 120, 340);
  let overPicture = false, shownReach = 0, aimDotAt = '';
  function letAimGo() { aim.on = aim.brake = false; aim.x = aim.y = 0; canvas.style.cursor = ''; }
  const byMouse = (on: boolean) => { if (document.body.classList.contains('mouse') !== on) document.body.classList.toggle('mouse', on); if (!on) letAimGo(); };
  byMouse(matchMedia('(hover: hover) and (pointer: fine)').matches);
  addEventListener('pointerdown', (e) => byMouse(e.pointerType === 'mouse'), true);
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') byMouse(true); }, true);
  const aimAt = (e: PointerEvent) => {
    const reach = aimReach(), nx = (e.clientX - innerWidth / 2) / reach, ny = (innerHeight / 2 - e.clientY) / reach;
    const inside = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
    if (inside) aim.on = true;
    // (A little give about the middle, so that the skier runs straight without the pointer being held on a point.)
    const give = (n: number) => Math.sign(n) * clamp((Math.abs(n) - 0.05) / 0.95, 0, 1);
    if (aim.on) { aim.x = give(nx); aim.y = give(ny); }
    aim.px = e.clientX; aim.py = e.clientY;
    // (Within the guide its mark is the pointer; outside it the mark stays at its edge, and the pointer is shown where it is.)
    canvas.style.cursor = aim.on && inside ? 'none' : '';
  };
  const aiming = (e: PointerEvent) => e.pointerType === 'mouse' && mode === 'ride' && !menuOpen;
  /**
   * Shooting by touch (asked: "ok can we enable the guns and orcs mode also for mobile players"; "would it be then steer by tilt and aim
   * and shoot by clicking?"): steered by tilting (or the stick, with a thumb), a finger held on the picture fires the gun at what is
   * under it, and dragged, the gun follows it; let go, it stops. An orc within a fingertip of where it is held is aimed at itself, as a
   * finger is broad and an orc far up the run small. Where the finger is, across and up the picture (-1 to 1); which, held.
   */
  const finger = { id: -1, x: 0, y: 0, until: 0 };
  // (Against the picture as it lies on the page, not the window: on an iPad the page can be pinched larger whatever it asks, and then
  // the window's measures are of the part of it in sight, and a finger was taken to be somewhere else on the picture than it was.)
  const fingerAt = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); finger.x = ((e.clientX - r.left) / r.width) * 2 - 1; finger.y = 1 - ((e.clientY - r.top) / r.height) * 2; };
  /**
   * (A finger held on the picture kept for the game (asked: "Aimin by touch is not working on ipad"): an iPad takes a finger held still
   * for half a second to be lifting what is under it out to drag it elsewhere, or asking for its menu, or its magnifier, and takes the
   * finger from the page, so that the gun stopped and lost its aim; and two fingers apart, to be pinching the page larger. None of them
   * is let begin on the picture, nor a pinch anywhere.)
   */
  for (const kind of ['touchstart', 'touchmove'] as const) canvas.addEventListener(kind, (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  /**
   * (Let go of, its place still aimed at for a moment (`until`, by the page's clock), for the shot it asked for (asked: "still ipad with
   * chrome, clicking anywhere on the screen with pistol for example just shoots forward"): a tap is quick, and its finger was let go of
   * before the frame that fires the shot came, which then fired where the gun was held, ahead.)
   */
  const fingerOff = (e: PointerEvent) => { if (e.pointerId === finger.id) { finger.id = -1; finger.until = performance.now() + 300; firing = false; } };
  /** Whether a finger on the picture, held or just let go of, is aimed at. */
  const fingerAims = () => finger.id >= 0 || performance.now() < finger.until;
  canvas.addEventListener('pointermove', (e) => { if (e.pointerId === finger.id) fingerAt(e); });
  canvas.addEventListener('pointerup', fingerOff);
  canvas.addEventListener('pointercancel', fingerOff);
  canvas.addEventListener('lostpointercapture', fingerOff);
  canvas.addEventListener('pointermove', (e) => { overPicture = true; if (footMouse(e)) return; if (aiming(e)) aimAt(e); });
  canvas.addEventListener('pointerleave', () => { overPicture = false; letAimGo(); });
  canvas.addEventListener('pointerdown', (e) => {
    // (By touch, a tap on the picture while the run's end is at its work begins the next run at once, as a click does and Enter: a
    // phone has no Enter. Not in its first moment, where a finger may still be coming off the picture.)
    if (e.pointerType !== 'mouse' && mode === 'ride' && !menuOpen && cat && cat.t > 0.4) { restart(); return; }
    // (On foot, the mouse its own: the left button attacking (or, with nothing carried, walking after the pointer), the right walking
    // after it; a tap with nothing carried walks to where it is.)
    if (footMouse(e)) {
      if (e.button === 2 || (e.button === 0 && !armed())) footPad.walk = true;
      else if (e.button === 0) { if (rolling()) lockNear(e.clientX, e.clientY); firing = true; shotClock = SHOT; pull(); gunSound.wake(); footPad.facing = performance.now() + 700; }
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (foot && mode === 'ride' && !menuOpen && e.pointerType !== 'mouse' && !armed()) {
      const r = canvas.getBoundingClientRect();
      footPad.to = footGround(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2));
      return;
    }
    // (By touch, carrying the gun: a finger held on the picture fires it there, `finger`.)
    if (e.pointerType !== 'mouse' && mode === 'ride' && !menuOpen && !cat && armed()) {
      // (The arms aiming themselves: a foe touched is locked on, and attacked.)
      if (rolling()) lockNear(e.clientX, e.clientY);
      finger.id = e.pointerId; fingerAt(e);
      firing = true; shotClock = SHOT; pull(); gunSound.wake();
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (!aiming(e) || e.button !== 0 || e.ctrlKey) return;
    if (cat) { restart(); return; }
    // (Held onto while the button is down, so that the brake, or the trigger, is not let go of where the pointer crosses a control.)
    // (With the tommy gun, the button is its trigger, and Shift brakes.)
    // (The arms aiming themselves: a foe clicked on is locked on, and attacked.)
    if (armed()) { if (rolling()) lockNear(e.clientX, e.clientY); firing = true; shotClock = SHOT; pull(); gunSound.wake(); } else aim.brake = true;
    canvas.setPointerCapture(e.pointerId);
    aimAt(e);
  });
  canvas.addEventListener('pointerup', () => { aim.brake = false; firing = false; footPad.walk = false; });
  canvas.addEventListener('lostpointercapture', () => { aim.brake = false; firing = false; footPad.walk = false; });
  // (A right click turns the skier round; a finger held long, which an iPad may also call one, does not: it is firing.)
  let lastPointer = '';
  addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, true);
  canvas.addEventListener('contextmenu', (e) => { if (mode !== 'ride') return; e.preventDefault(); if (!menuOpen && lastPointer === 'mouse') start180(); });
  // (Not in the free view, whose own turning about the skier takes the wheel; nor the cinematic, which keeps its own distances.)
  canvas.addEventListener('wheel', (e) => {
    if ((view === 'free' || view === 'cinema') && !foot) return;
    e.preventDefault();
    const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    // (A pinch comes as the wheel with Ctrl held, in much smaller steps.)
    setDistance(distance * Math.exp(px * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });
  /** The guide, a frame on: its reach, the mark where the pointer (or, not aiming, the keys or a trick) asks the skier to go. */
  const showAim = () => {
    const reach = aimReach();
    if (reach !== shownReach) { shownReach = reach; aimEl.style.setProperty('--reach', `${reach}px`); }
    const x = aim.on ? aim.x : ask.x, y = aim.on ? aim.y : ask.y;
    const to = `translate(${(x * reach).toFixed(1)}px, ${(-y * reach).toFixed(1)}px)`;
    if (to !== aimDotAt) { aimDotAt = to; aimDot.style.transform = to; }
    // (Asking to be brought in, while the pointer is over the picture and has not taken the skier; put away while it lies fallen, and
    // while the arm has it.)
    aimEl.classList.toggle('lost', overPicture && !aim.on && !cat);
    aimEl.classList.toggle('fallen', !!crash || !!cat);
    aimEl.classList.toggle('iso', isoRiding());
  };

  // The tommy gun (asked: "if the player is skiing with just the human, make the skier have a tommygun submachine gun that fires when
  // left mouse button is clicked, aimed according to where the control dot is; desktop only"; "they would not have poles when skiing
  // with the tommygun"; "the player can mow down and shoot at hordes of goblins crawling up the slope", orcs since; "enable this for the
  // horse riding human as well"): riding on a computer, the skier alone or the horse's rider carries it in place of its poles, both
  // hands on it on the snow, aimed at what the guide's mark is over in the picture (the snow there, or an orc), as far round as its arms
  // let it; in the air, or thrown, in the right hand alone. Held down, the button fires it, some seven hundred rounds a minute; each
  // round flies as a tracer and strikes the snow, throwing it up, or an orc, which falls (`slopeGun.ts`, `slopeOrcs.ts`). Orcs come up
  // the run in hordes while it is carried, and how many have been brought down is counted.
  const gunRng = new Rng('tommy gun'), gun = tommyGun(), gunfire = new Gunfire(scene, gunRng.fork('fire')), gunSound = new GunSound(gunRng.fork('sound'));
  // (Struck, an orc spatters its blood over the snow, a great deal of it, and a pool spreads where it falls: `slopeSplatter.ts`.)
  const splatter = new Splatter(scene, gunRng.fork('blood'), ground, (x, z) => normalAt(x, z, 0.5));
  // (Struck and not brought down, a little blood thrown, and no pool.)
  const horde = new Horde(library, scene, rimAll, (at, push, size, fell, bloody) => {
    if (!bloody) return;
    if (!fell) { splatter.spray(at, push, 12); return; }
    splatter.spray(at, push, 56); splatter.pool(at, gunRng.range(1.1, 1.6) * size);
  });
  // (Fewer at a time on a phone or a tablet, where each is a good deal more to draw: half as many.)
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) horde.most = 14;
  rimAll(gun);
  gun.visible = false;
  /** How long between rounds; how far into the next the trigger has got; how far the last round kicked the gun up (1, just fired). */
  const SHOT = 60 / 700;
  let firing = false, shotClock = 0, kick = 0;
  // The arms taken up in turn as orcs are brought down, riding (`slopeArms.ts`, `slain`): the sword first, then the pistol, the
  // shotgun, the flamethrower, the tommy gun and the lightning gun; each carried as the tommy gun is, in place of the poles, aimed as
  // it is. The orc hunt's rider carries the tommy gun, as it always did. The flamethrower's fire and the lightning's bolts, drawn.
  const arms = new Map<ArmKind, Group>(LADDER.map((a): [ArmKind, Group] => [a.kind, a.kind === 'smg' ? gun : a.make()]));
  for (const [k, g] of arms) if (k !== 'smg') { rimAll(g); g.visible = false; }
  const flames = new Flames(scene, gunRng.fork('flames'), ground), bolts = new Bolts(scene, gunRng.fork('bolts'));
  // (Sparks of gold where a blow strikes hard, a critical; of blue-white where lightning strikes.)
  const sparks = new Sparks(scene, gunRng.fork('sparks'), [3.6, 2.4, 0.7]), zapSparks = new Sparks(scene, gunRng.fork('zap sparks'), [1.4, 2, 3.6]);
  /**
   * The picture flashed a moment: blue-white as lightning strikes (`zap`), the more the more it struck; red at its edges as a crushing
   * blow is taken (`hurt`).
   */
  const flashEl = $('flash');
  const flashScreen = (kind: 'zap' | 'hurt', strength = 1) => {
    flashEl.className = ''; flashEl.style.setProperty('--strength', strength.toFixed(2));
    void flashEl.offsetWidth; flashEl.className = kind;
  };
  const hurtFlash = () => flashScreen('hurt');
  const sweep = new Sweep(scene), rockets = new Rockets(scene, gunRng.fork('rockets'));
  // (Where the rockets go off, the run's end's blast made small: a few of them, each used again in turn, put away once its smoke has
  // gone.)
  const BOOM = { size: 0.32, reach: 7, last: 6 };
  const booms = [0, 1, 2].map((i) => ({ blast: new Blast(gunRng.fork(`boom ${i}`)), until: 0 }));
  for (const b of booms) scene.add(b.blast.group);
  let nextBoom = 0, boomClock = 0;
  // (The sword drawn from the skier's back, and the rider's, is out of its scabbard there: `Outfit_Hilt`, `dressAdventurer`.)
  const hilts = new Map<Rider, Object3D | undefined>([[live, live.model.getObjectByName('Outfit_Hilt')], [jockey, jockey.model.getObjectByName('Outfit_Hilt')]]);
  /** The arm carried now: riding, by how many have been brought down (`slain`); watching the orc hunt, the tommy gun. */
  const armNow = (): Arm => (mode === 'watch' ? (demoKind === 'show' ? showArm() : LADDER.find((a) => a.kind === 'smg')!) : carried());
  /**
   * The showcase's arm at the moment watched: each in turn, the sword to the bazooka, for two of the cinematic view's shots each, and
   * round again (asked: "the weapons can change between camera cuts, its fine").
   */
  const showArm = (): Arm => { const shots = shotsOf(demo), i = Math.max(0, shots.findIndex((x) => t >= x.t0 && t < x.t1)); return LADDER[Math.floor(i / 2) % LADDER.length]; };
  /** Watching, how near and how far off an orc each arm is fired at, in metres: the sword at either side, all else ahead. */
  const WATCH_REACH: Record<ArmKind, [number, number]> = { sword: [0, 4.6], pistol: [6, 60], shotgun: [5, 38], flamer: [3, 40], smg: [8, 100], lightning: [8, 100], bazooka: [16, 110] };
  /**
   * A click (or a tap) as a round asked of an arm fired a round at a time, or a swing of the sword: kept until it can be fired, one
   * at most, and only if asked near when it can; how long until the arm can fire again; the sword's swing, while it swings (how far
   * through, to which side, which orcs it has cut down); how long each orc has been in the flamethrower's fire; the arm last said.
   */
  /**
   * A swing of the sword: how far through its pose (`Rider.slash`), at which side, which it has struck; whether the button that began
   * it is still held (it waits drawn up), how much force it has gathered so (0 to 1); whether its cut has begun; whether it has drawn
   * blood.
   */
  type Swing = { k: number; side: number; struck: Set<number>; held: boolean; charge: number; cut: boolean; blood: boolean };
  /** How long the arms stay the gun's in the air after the trigger is let go (`armUp`), and how long still now. */
  const AIR_AIM = 0.6;
  let airAim = 0;
  let pulls = 0, ready = 0, swing: Swing | null = null, lastSide = -1, flameSaid = 0, armSaid: ArmKind | null = null;
  const heat = new Map<number, number>();
  // (The sword's swing so long that a click made in the last half of one is kept for the next.)
  const pull = () => { if (ready < (armNow().firing === 'swing' ? 0.75 : 0.25)) pulls = 1; };
  /**
   * *Attack*, beside ◀ ▶ at the lower right (and Space): pressed, as the button on the picture is, the trigger pulled, a cut begun;
   * held, firing on (or the cut held drawn up); let go, let go of. ◀ ▶ lock on the foe to the left or the right (`cycleLock`).
   */
  const attackDown = () => { if (!armed() || mode !== 'ride' || cat) return; firing = true; shotClock = SHOT; pull(); gunSound.wake(); };
  const attackUp = () => { firing = false; };
  {
    const attack = $('attack');
    attack.addEventListener('pointerdown', (e) => { e.preventDefault(); attack.setPointerCapture(e.pointerId); attack.classList.add('down'); attackDown(); });
    for (const kind of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) attack.addEventListener(kind, () => { attack.classList.remove('down'); attackUp(); });
    attack.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const [id, by] of [['prevFoe', -1], ['nextFoe', 1]] as const) $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); cycleLock(by); });
  }
  /** Each human's poles, put away while it carries the gun. */
  const poleSets: [Who, Object3D[]][] = [['person', gear.filter((p) => p.parent?.name.startsWith('hand_'))], ['mounted', jockeyGear]];
  /** Whether the gun is carried: riding, on a computer, by a human (the skier alone, or the horse's rider). */
  // (The showcase shows them whether or not they are on: it is there to show what the game has.)
  const armed = () => ((orcsOn && (mode === 'ride' || (mode === 'watch' && demoKind === 'orcs'))) || (mode === 'watch' && demoKind === 'show')) && who !== 'horse';
  const ray = new Raycaster(), ndc = new Vector2(), toLook = new Matrix4(), ZERO = new Vector3(), Y = new Vector3(0, 1, 0);
  /** Where a line from `from` along `dir` (of length one) first meets the snow, within `most` metres; none, beyond. */
  const snowAlong = (from: Vector3, dir: Vector3, most: number): number => {
    const p = new Vector3();
    // (On foot in the cave, its walls, floors and roofs: what is fired there strikes them, in small steps, as they are near.)
    const cave = foot ? caveNow() : null;
    if (cave) {
      const o = land.group.position, q = new Vector3();
      for (let t = 0.25; t <= Math.min(most, 80); t += 0.25) { p.copy(from).addScaledVector(dir, t); if (!cave.clear(q.set(p.x - o.x, p.y, p.z - o.z)) || p.y < ground(p.x, p.z)) return t; }
      return Infinity;
    }
    let last = 0;
    for (let t = 1; t <= most; t += t < 60 ? 1 : 3) {
      p.copy(from).addScaledVector(dir, t);
      if (p.y < ground(p.x, p.z)) {
        let a = last, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; p.copy(from).addScaledVector(dir, m); if (p.y < ground(p.x, p.z)) b = m; else a = m; }
        return (a + b) / 2;
      }
      last = t;
    }
    return Infinity;
  };
  /** Snow thrown up where a round strikes, or about an orc as it falls. */
  const burst = (p: Vector3, puffs: number, grains: number) => {
    for (let i = 0; i < puffs; i++) throwPuff(p.clone().addScaledVector(UP, 0.05), new Vector3(gunRng.range(-1, 1), gunRng.range(0.8, 2.2), gunRng.range(-1, 1)), 0.6);
    for (let i = 0; i < grains; i++) throwGrain(p.clone().addScaledVector(UP, 0.05), new Vector3(gunRng.range(-1.5, 1.5), gunRng.range(1.5, 4), gunRng.range(-1.5, 1.5)));
  };
  /** Where the arm carried has its muzzle (or the sword its tip), and which way it points, in the scene. */
  const muzzleOf = (arm: Arm) => {
    const model = arms.get(arm.kind)!;
    model.updateMatrixWorld(true);
    return { from: model.localToWorld(arm.muzzle.clone()), dir: new Vector3(0, 0, 1).transformDirection(model.matrixWorld) };
  };
  // ---------------------------------------------------------------- the foe locked on, and the dice
  /**
   * The foe the arms are locked on (`setAiming`, *Auto*; and watching, the one the demo's rider fires at): which (-1, none); whether it
   * was chosen (by ◀ ▶ or a touch: kept until it falls or is lost, not given up for a nearer one); how long it has been out of reach or
   * sight (a moment's grace before another is taken); those that could be locked on, looked for every so often (`LOCK_SCAN`); the way
   * the body that holds the arms faces, for the buttons to look by between frames.
   */
  type Mark = { orc: number; at: Vector3; tall: number; far: number; sx: number; sy: number };
  const lock = { orc: -1, chosen: false, lost: 0, scan: 0, list: [] as Mark[], ahead: new Vector3(0, 0, 1) };
  const LOCK_SCAN = 0.15, LOCK_GRACE = 0.5;
  const diceRng = gunRng.fork('dice');
  /** Whether the arms aim themselves at the foe locked on, and each attack at it is rolled: riding with *Auto*, and watching. */
  const rolling = () => mode === 'watch' || autoAim;
  /** The foe locked on, if it is still coming and within `reach` of `from`; else -1. */
  const lockedIn = (from: Vector3, reach: number) => (lock.orc >= 0 && horde.coming(lock.orc) && horde.middle(lock.orc).distanceTo(from) <= reach ? lock.orc : -1);
  const guardOf = (orc: number) => horde.kindOf(orc)?.guard ?? 10;
  /** Rolled in the air, a little harder to strike true. */
  const rollBonus = () => (mode === 'ride' && air ? -2 : 0);
  /**
   * Each foe the arm carried could be locked on: drawn, within its reach (`ARM_DICE.lock`; on foot, in the dungeon's close quarters, less),
   * on the picture, and riding, where the arms can turn to it from the body (ahead of it, or for the sword, not behind it) and not behind
   * the snow; with where it is on the picture, for ◀ ▶ to go across it by.
   */
  const lockable = (arm: Arm): Mark[] => {
    const reach = foot ? Math.min(ARM_DICE[arm.kind].lock, arm.firing === 'swing' ? 12 : 40) : ARM_DICE[arm.kind].lock;
    const from = rider.position, eye = from.clone().addScaledVector(UP, 1.4), ahead = lock.ahead, out: Mark[] = [];
    for (const m of horde.marks()) {
      const dx = m.at.x - from.x, dz = m.at.z - from.z, far = Math.hypot(dx, dz), on = dx * ahead.x + dz * ahead.z;
      if (far > reach) continue;
      if (!foot && (arm.firing === 'swing' ? on < -2 : on < far * 0.3)) continue;
      const s = m.at.clone().project(camera);
      if (s.z > 1 || Math.abs(s.x) > 1.05 || Math.abs(s.y) > 1.05) continue;
      if (!foot && far > 4) { const d = m.at.clone().sub(eye), len = d.length(); if (snowAlong(eye, d.divideScalar(len), len) < len - 1) continue; }
      out.push({ ...m, far, sx: s.x, sy: s.y });
    }
    return out;
  };
  const nearestOf = (list: Mark[]) => list.reduce<Mark | null>((a, m) => (!a || m.far < a.far ? m : a), null);
  /**
   * The lock a moment on (`dt`), riding with the arms aiming themselves: kept on the foe it has while it can be had (a moment's grace
   * when it cannot), else on the nearest; not chosen, given up for one much nearer that has come up.
   */
  const relock = (arm: Arm, dt: number) => {
    lock.scan -= dt;
    const has = lock.orc >= 0 && horde.coming(lock.orc);
    if (lock.scan > 0 && has) return;
    lock.scan = LOCK_SCAN;
    lock.list = lockable(arm);
    const here = lock.list.find((m) => m.orc === lock.orc), nearest = nearestOf(lock.list);
    if (here) lock.lost = 0; else lock.lost += LOCK_SCAN;
    if (!has || (!here && lock.lost > LOCK_GRACE)) { lock.orc = nearest?.orc ?? -1; lock.chosen = false; lock.lost = 0; }
    else if (here && !lock.chosen && nearest && nearest.orc !== here.orc && nearest.far < here.far * 0.6) lock.orc = nearest.orc;
  };
  /** Locked on the next foe across the picture, to the right (`by` 1) or the left (-1), round again past the last. */
  const cycleLock = (by: number) => {
    if (!armed() || mode !== 'ride' || !rolling()) return;
    lock.list = lockable(armNow()); lock.scan = LOCK_SCAN;
    const across = [...lock.list].sort((a, b) => a.sx - b.sx), i = across.findIndex((m) => m.orc === lock.orc);
    if (!across.length) { lock.orc = -1; return; }
    const to = i < 0 ? nearestOf(across)! : across[(i + (by > 0 ? 1 : -1) + across.length) % across.length];
    lock.orc = to.orc; lock.chosen = true; lock.lost = 0;
  };
  /** Locked on the foe nearest a point on the picture (in pixels), if one is within a fingertip of it: a touch or a click on it. */
  const lockNear = (px: number, py: number) => {
    if (!armed() || mode !== 'ride' || !rolling()) return;
    const list = lockable(armNow()), r = canvas.getBoundingClientRect();
    let best: Mark | null = null, near = 56 * 56;
    for (const m of list) {
      const dx = ((m.sx + 1) / 2) * r.width + r.left - px, dy = ((1 - m.sy) / 2) * r.height + r.top - py, d = dx * dx + dy * dy;
      if (d < near) { near = d; best = m; }
    }
    if (best) { lock.orc = best.orc; lock.chosen = true; lock.lost = 0; lock.list = list; lock.scan = LOCK_SCAN; }
  };
  /**
   * The fight's numbers over the picture: the damage each blow does thrown up over the foe it struck (gold and larger, a critical), and
   * *miss* where one missed (not more than one every so often for each, as the tommy gun misses many a time a second); kept to so many
   * at once.
   */
  let dmgLive = 0;
  const missedAt = new Map<number, number>();
  const dmgPop = (p: Vector3, text: string, kind: string, small = '') => {
    if (dmgLive > 36) return;
    const at = overPictureAt(p);
    if (!at) return;
    const el = document.createElement('div');
    el.className = `pop dmg ${kind}`; el.textContent = text;
    if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
    el.style.left = `${(at[0] + gunRng.range(-14, 14)).toFixed(0)}px`; el.style.top = `${(at[1] - 18).toFixed(0)}px`;
    dmgLive++;
    el.addEventListener('animationend', () => { el.remove(); dmgLive--; });
    popsEl.appendChild(el);
  };
  /**
   * Damage done (hit points, as hard as a weapon found makes it) said over where it struck. A critical (asked: "we could have critical
   * hits also") made much of: its number large and gilt, *critical* under it, a burst of sparks of gold where it struck, a ring of
   * steel, and the view jolted; not more than one so every so often, as the tommy gun may strike hard several times a second.
   */
  let critAt = 0;
  const dmgSaid = (p: Vector3, dmg: number, crit: boolean, burn = false) => {
    const n = String(Math.round(dmg * horde.might));
    if (!crit) { dmgPop(p, n, burn ? 'burn' : ''); return; }
    dmgPop(p, n, 'crit', 'critical');
    const now = performance.now();
    if (now < critAt) return;
    critAt = now + 250;
    sparks.add(p, 26);
    gunSound.hear('ring');
    bladeJolt = Math.max(bladeJolt, 0.35);
  };
  const missSaid = (orc: number, p: Vector3) => {
    const now = performance.now();
    if ((missedAt.get(orc) ?? 0) > now) return;
    missedAt.set(orc, now + 350);
    dmgPop(p, 'miss', 'miss');
  };
  /** The last rolls, newest last, for the fight's line and for a script (`__slope.rolls`). */
  /** (`arm`, `foe` for a foe's roll at the one on foot.) */
  const rolls: { foe: string; arm: ArmKind | 'foe'; say: string; roll: Roll }[] = [];
  let rollsMade = 0;
  const noteRoll = (orc: number, arm: ArmKind | 'foe', r: Roll, say = rollSaid(r)) => {
    rollsMade++;
    rolls.push({ foe: horde.titleOf(orc), arm, say, roll: r });
    if (rolls.length > 16) rolls.shift();
  };
  /**
   * A round fired from `from` along `dir`, a little astray (`spread`), as far as `reach`: a tracer to where it strikes, and there an
   * orc falls or the snow flies.
   */
  /** The last round fired, from where and which way: for a script to tell where it went (`__slope.lastShot`). */
  let lastShot: { from: Vector3; dir: Vector3 } | null = null;
  /**
   * A round's blow on one it struck, `orc`, going `dir`: its damage rolled (or, rolled to strike, `r`'s), said over it; down, counted;
   * struck and not brought down, the cross where it was struck all the same.
   */
  const roundStrikes = (orc: number, dir: Vector3, arm: ArmKind, r: Roll | null) => {
    const at = horde.middle(orc), b = r ? { dmg: r.dmg, crit: r.crit } : rollBlow(diceRng, arm), struck = horde.strike(orc, dir.clone().multiplyScalar(3).addScaledVector(UP, 1.6), b.dmg / HP);
    if (struck) dmgSaid(at, b.dmg, b.crit);
    if (struck?.down) { gunSound.grunt(); orcDowned(at, 'shot', struck.kind); }
    else if (struck) { const on = overPictureAt(at); if (on) hitMark(on); }
    burst(at, 3, 10);
  };
  /** A round flown from `from` along `dir` as far as `reach`, striking nothing: to the snow, which flies, or on out of sight. */
  const roundAstray = (from: Vector3, dir: Vector3, reach: number) => {
    const snowAt = snowAlong(from, dir, reach);
    gunfire.fire(from, dir, Number.isFinite(snowAt) ? snowAt : reach, Number.isFinite(snowAt) ? () => burst(from.clone().addScaledVector(dir, snowAt), 4, 14) : null);
  };
  /** Where a round, or a rocket, that missed the foe whose middle is `mid` goes: a little wide of it, to one side and high or low. */
  const wideOf = (from: Vector3, mid: Vector3, wide = 1) => {
    const dir = mid.clone().sub(from).normalize(), side = new Vector3().crossVectors(dir, UP).normalize();
    return mid.clone().addScaledVector(side, (gunRng.chance(0.5) ? 1 : -1) * gunRng.range(0.9, 1.8) * wide).addScaledVector(UP, gunRng.range(-0.3, 0.9)).sub(from).normalize();
  };
  const fireRound = (from: Vector3, way: Vector3, spread: number, arm: ArmKind, reach = 400) => {
    // (The arms aiming themselves: the round at the foe locked on, rolled to strike it or to go wide of it.)
    const foe = rolling() ? lockedIn(from, reach) : -1;
    if (foe >= 0) {
      const mid = horde.middle(foe), r = rollAttack(diceRng, arm, guardOf(foe), mid.distanceTo(from), rollBonus());
      noteRoll(foe, arm, r);
      if (r.hit) { const dir = mid.clone().sub(from).normalize(); lastShot = { from: from.clone(), dir: dir.clone() }; gunfire.fire(from, dir, mid.distanceTo(from), () => roundStrikes(foe, dir, arm, r)); return; }
      missSaid(foe, mid);
      const dir = wideOf(from, mid);
      lastShot = { from: from.clone(), dir: dir.clone() };
      roundAstray(from, dir, reach);
      return;
    }
    const dir = way.clone().add(new Vector3(gunRng.range(-spread, spread), gunRng.range(-spread, spread), gunRng.range(-spread, spread))).normalize();
    lastShot = { from: from.clone(), dir: dir.clone() };
    const snowAt = snowAlong(from, dir, reach), met = horde.hit(from, dir, Math.min(snowAt, reach));
    if (met) gunfire.fire(from, dir, met.t, () => roundStrikes(met.orc, dir, arm, null));
    else roundAstray(from, dir, reach);
  };
  /** A round from the tommy gun as it points: the tommy gun's own sound, and its kick. */
  const shoot = () => { const arm = armNow(), { from, dir } = muzzleOf(arm); fireRound(from, dir, 0.012, arm.kind); gunSound.shot(); kick = 1; };
  /**
   * The shotgun's nine pellets at the foe locked on, each rolled: those that strike flown to it and their damage done together, as the
   * first of them comes to it, one number said for them all; the rest wide of it.
   */
  const blastAt = (from: Vector3, foe: number) => {
    const mid = horde.middle(foe), far = mid.distanceTo(from), each: Roll[] = [];
    for (let i = 0; i < 9; i++) each.push(rollAttack(diceRng, 'shotgun', guardOf(foe), far, rollBonus()));
    const hits = each.filter((r) => r.hit), crit = hits.some((r) => r.crit), dmg = hits.reduce((n, r) => n + r.dmg, 0);
    const all: Roll = { die: Math.max(...each.map((r) => r.die)), bonus: each[0].bonus, guard: each[0].guard, hit: hits.length > 0, crit, dmg };
    noteRoll(foe, 'shotgun', all, `9 pellets, ${hits.length} strike · ${dmg}`);
    if (!hits.length) missSaid(foe, mid);
    let first = true;
    for (const r of each) {
      if (!r.hit) { roundAstray(from, wideOf(from, mid, 1.4), 45); continue; }
      const dir = mid.clone().add(new Vector3(gunRng.range(-0.25, 0.25), gunRng.range(-0.3, 0.3), gunRng.range(-0.25, 0.25))).sub(from).normalize();
      const strikes = first;
      first = false;
      gunfire.fire(from, dir, far, strikes ? () => roundStrikes(foe, dir, 'shotgun', all) : null);
    }
  };
  /** The pistol's round, or the shotgun's blast: nine pellets spread wide, going no further than forty-five metres. */
  const fireOnce = (arm: Arm) => {
    const { from, dir } = muzzleOf(arm);
    if (arm.kind === 'shotgun') {
      const foe = rolling() ? lockedIn(from, 45) : -1;
      if (foe >= 0) blastAt(from, foe); else for (let i = 0; i < 9; i++) fireRound(from, dir, 0.06, 'shotgun', 45);
      gunSound.hear('shotgun');
    } else if (arm.kind === 'bazooka') {
      // (At the foe locked on: rolled, a rocket that strikes flown at it; one that misses, at the snow a few metres wide of it, its blast
      // catching it or not.)
      const foe = rolling() ? lockedIn(from, ARM_DICE.bazooka.lock) : -1;
      let way = dir;
      if (foe >= 0) {
        const mid = horde.middle(foe), r = rollAttack(diceRng, 'bazooka', guardOf(foe), mid.distanceTo(from), rollBonus());
        noteRoll(foe, 'bazooka', { ...r, dmg: 0 }, rollSaid(r).replace(/ · .*$/, r.hit ? ' · straight at it' : ' · wide'));
        way = r.hit ? mid.clone().sub(from).normalize() : wideOf(from, mid, 2.6);
        if (!r.hit) missSaid(foe, mid);
      }
      rockets.launch(from, way); burst(from.clone().addScaledVector(way, -1.2), 4, 0); gunSound.hear('rocket');
    } else { fireRound(from, dir, 0.004, arm.kind); gunSound.hear('pistol'); }
    kick = 1;
  };
  /**
   * The flamethrower a moment on (`dt`): fire poured hard from its mouth along its way, the gun shuddering with it (`Flames`); and
   * every orc within some twenty-two metres of it, not much off its way and not behind the snow, in the fire, burnt for so much rolled
   * every `BURN_EVERY` seconds it is kept there (the first burn soon after it is caught): an orc falls burning in half a second or so.
   */
  const pourFire = (arm: Arm, dt: number) => {
    const { from, dir } = muzzleOf(arm);
    flames.pour(from, dir, Math.max(1, Math.round(dt * 260)));
    kick = Math.max(kick, gunRng.range(0.4, 1));
    if ((flameSaid -= dt) <= 0) { flameSaid = 0.12; gunSound.hear('flame'); }
    const inFire = new Set<number>();
    for (const o of horde.near(from, 23)) {
      const d = o.at.clone().sub(from), far = d.length();
      if (far > 22 || d.divideScalar(far).dot(dir) < Math.cos(0.32) || snowAlong(from, d, far) < far - 0.5) continue;
      inFire.add(o.orc);
      let h = (heat.get(o.orc) ?? BURN_EVERY * 0.6) + dt;
      // (The harder one is to bring down, the longer the fire must be kept on it: a yeti, near two seconds.)
      if (h >= BURN_EVERY) { h -= BURN_EVERY; const b = rollBlow(diceRng, 'flamer'); dmgSaid(o.at, b.dmg, b.crit, true); burnDown(o.orc, o.at, dir, b.dmg / HP); }
      if (horde.coming(o.orc)) heat.set(o.orc, h);
    }
    // (Out of the fire, it cools: the fire must be kept on it.)
    for (const k of heat.keys()) if (!inFire.has(k)) heat.delete(k);
  };
  /** An orc brought down burning, thrown on along `dir`; fire left on it, and under it. */
  const burnDown = (orc: number, at: Vector3, dir: Vector3, blow = Infinity) => {
    const struck = horde.strike(orc, dir.clone().setY(0).normalize().multiplyScalar(2).addScaledVector(UP, 1.2), blow, false);
    if (!struck?.down) return;
    flames.burn(at, 18); gunSound.grunt(); orcDowned(at, 'burnt', struck.kind); heat.delete(orc);
  };
  /**
   * A rocket gone off at `at`: the blast made small there (`BOOM`), and every orc within `BOOM.reach` of it brought down, thrown out
   * from it and up, the harder the nearer.
   */
  const boomAt = (at: Vector3) => {
    const b = booms[nextBoom++ % booms.length], on = at.clone();
    on.y = Math.max(on.y - 0.3, ground(on.x, on.z));
    b.blast.lay(on, ground, gunRng.fork('boom'), BOOM.size);
    b.blast.boom();
    b.until = boomClock + BOOM.last;
    gunSound.hear('boom');
    for (const o of horde.near(at, BOOM.reach + 1)) {
      const d = o.at.clone().sub(at), far = d.length();
      if (far > BOOM.reach) continue;
      const near = 1 - far / BOOM.reach, out = far > 0.01 ? d.setY(0).normalize() : new Vector3(1, 0, 0);
      // (Its damage rolled, the more the nearer: nearly all in reach brought down; a yeti, only near where it went off, and not always.)
      const b = rollBlow(diceRng, 'bazooka', 0.4 + 0.6 * near);
      const struck = horde.strike(o.orc, out.multiplyScalar(4 + 11 * near).addScaledVector(UP, 4 + 9 * near), b.dmg / HP);
      if (struck) dmgSaid(o.at, b.dmg, b.crit);
      if (struck?.down) { gunSound.grunt(); orcDowned(o.at, 'blown', struck.kind); }
    }
  };
  /**
   * Where a rocket going from `from` to `to` strikes, if it does: an orc on the way, or one it passes within a metre or so of (it goes
   * off near one, not only on one); or the snow, looked for every half metre of the way. (Looked for as rounds are, a metre on and
   * then every metre, a step's flight of a metre and a bit was looked at only once, and rockets flew on through the snow.)
   */
  const rocketStrikes = (from: Vector3, to: Vector3): Vector3 | null => {
    const d = to.clone().sub(from), len = d.length(), dir = d.divideScalar(len);
    let snowAt = Infinity;
    for (let i = 1, n = Math.ceil(len / 0.5); i <= n; i++) {
      const t = (len * i) / n, p = from.clone().addScaledVector(dir, t);
      if (p.y < ground(p.x, p.z)) { snowAt = t; break; }
    }
    const reach = Math.min(snowAt, len), met = horde.hit(from, dir, reach);
    if (met) return from.clone().addScaledVector(dir, met.t);
    for (const o of horde.near(from, len + 2)) {
      const mid = o.at.clone().addScaledVector(UP, 0.9), t = clamp(mid.clone().sub(from).dot(dir), 0, reach), p = from.clone().addScaledVector(dir, t);
      if (p.distanceTo(mid) < 1.3) return p;
    }
    return Number.isFinite(snowAt) ? from.clone().addScaledVector(dir, snowAt) : null;
  };
  /**
   * The lightning gun's bolt: to the first orc along its way, or else the one nearest its way within some seven degrees of it, a hundred
   * and twenty metres out (lightning goes where it will, and finds what stands nearest it); and from it on to the nearest orc within
   * eleven metres not yet struck, and on, three leaps at the most; each struck falls. With none to strike, a short bolt into the snow.
   * (Weaker than it was (asked: "make the lightning gun somehow a little bit weaker, its super imba now"): it had aimed itself within
   * ten degrees, leapt fourteen metres five times and thrown a bolt every third of a second, some nineteen orcs a second at the most;
   * now some nine, a bolt every 0.45 seconds, `LADDER`.)
   */
  const ZAP = { aim: 7, leap: 11, most: 4 };
  const zap = (arm: Arm) => {
    const { from, dir } = muzzleOf(arm), snowAt = snowAlong(from, dir, 120), reach = Math.min(snowAt, 120);
    const through = [from.clone()], struck = new Set<number>();
    // (The arms aiming themselves: at the foe locked on, rolled; missing, the bolt goes into the snow beside it, and leaps no further.)
    const foe = rolling() ? lockedIn(from, 120) : -1;
    let met = foe >= 0 ? -1 : horde.hit(from, dir, reach)?.orc ?? -1, first: Roll | null = null;
    if (foe >= 0) {
      const mid = horde.middle(foe);
      first = rollAttack(diceRng, 'lightning', guardOf(foe), mid.distanceTo(from), rollBonus());
      noteRoll(foe, 'lightning', first);
      if (first.hit) met = foe;
      else {
        missSaid(foe, mid);
        const p = from.clone().add(wideOf(from, mid, 1.6).multiplyScalar(mid.distanceTo(from)));
        p.y = ground(p.x, p.z);
        through.push(p); burst(p, 2, 8);
      }
    } else if (met < 0) {
      let best = Math.tan((ZAP.aim * Math.PI) / 180);
      for (const o of horde.near(from, reach)) {
        const d = o.at.clone().sub(from), along2 = d.dot(dir);
        if (along2 < 4 || along2 > reach) continue;
        const off = (d.addScaledVector(dir, -along2).length() - 1.5) / along2;
        if (off < best && snowAlong(from, o.at.clone().sub(from).normalize(), o.at.distanceTo(from)) > o.at.distanceTo(from) - 1) { best = off; met = o.orc; }
      }
    }
    while (met >= 0 && struck.size < ZAP.most) {
      struck.add(met);
      const at = horde.middle(met);
      through.push(at);
      // (Arcs crackling over each it strikes a while after, sparks thrown off it.)
      const big = horde.kindOf(met)?.titles ? 1.15 : 0.6;
      bolts.crackle(at, big, 0.75); zapSparks.add(at, 14, 7);
      // (Each leap the weaker, `LEAP`.)
      const b = first && struck.size === 1 ? { dmg: first.dmg, crit: first.crit } : rollBlow(diceRng, 'lightning', LEAP ** (struck.size - 1));
      const hurt = horde.strike(met, new Vector3(0, 3, 0).addScaledVector(dir, 1.5), b.dmg / HP, false);
      if (hurt) dmgSaid(at, b.dmg, b.crit);
      // (Brought down: a bolt out of the sky onto it, thick, as if the sky had answered.)
      if (hurt?.down) {
        gunSound.grunt(); orcDowned(at, 'zapped', hurt.kind);
        const sky = at.clone().add(new Vector3(gunRng.range(-6, 6), gunRng.range(26, 34), gunRng.range(-6, 6))), foot = at.clone(); foot.y = ground(at.x, at.z);
        bolts.strike([sky, sky.clone().lerp(foot, 0.5).add(new Vector3(gunRng.range(-2, 2), 0, gunRng.range(-2, 2))), foot], 0.5, 2.2);
        zapSparks.add(foot, 24, 10); snowBurst(foot, 1.2, 40, 4);
      }
      burst(at, 2, 6);
      met = -1;
      let near = ZAP.leap;
      for (const o of horde.near(at, ZAP.leap)) { if (struck.has(o.orc)) continue; const d = o.at.distanceTo(at); if (d < near) { near = d; met = o.orc; } }
    }
    if (through.length === 1) { const end = from.clone().addScaledVector(dir, Number.isFinite(snowAt) ? Math.min(snowAt, 30) : 30); through.push(end); burst(end, 2, 8); }
    bolts.strike(through);
    flashScreen('zap', Math.min(1, 0.35 + 0.18 * struck.size));
    gunSound.hear('zap');
    bladeJolt = Math.max(bladeJolt, 0.12 + 0.05 * struck.size);
    kick = 1;
  };
  /**
   * The sword's swing (asked: "proper slashing alternating on right and left side of the horse flanks"; "slower to swing, like
   * 1.5sec/swing"; then "improve the sword play"): a second and a half from one swing to the next, drawn up over a shoulder, cut down
   * past that side and carried through low along it, and back (`Rider.slash`; `SLASH_MARKS`). Most of that second and a half is in
   * bringing the heavy blade back: it is drawn up in a fifth of a second and cut through in a quarter, so that the cut comes hard on the
   * click (it had come two thirds of a second after it, and the orc it was meant for was gone by). Held (the button, or a finger, kept
   * down), the blade is held drawn up, gathering the cut's force (`charge`, whole in `SLASH.charge` seconds, said by a ring about the
   * guide's mark and a ring of steel) until it is let go: a whole one reaches near half as far again, strikes three times as hard (a
   * yeti cleft at a blow) and throws them further. Each cut is at the side those within reach will be on as the blade comes down (the
   * skier gone on some way by then), the side with more; else at the other side from the last, right and left in turn. Every one on
   * that side within reach as the blade goes down past it (more from the saddle, which is higher and further out over them), ahead of
   * the skier or not far behind, struck and thrown out that way and on along the skier's way; each struck felt, a chop and the view
   * jolted, and the blade's sweep reddened.
   */
  const SLASH = { every: 1.5, up: 0.2, cut: 0.1, through: 0.14, charge: 0.8 };
  const slashReach = () => (who === 'mounted' ? 3.6 : 3);
  /** How fast a swing goes through its pose at `k` (of it a second): quick up, quicker through, slow back. */
  const slashRate = (k: number) => {
    const m = SLASH_MARKS, back = SLASH.every - SLASH.up - SLASH.cut - SLASH.through;
    return k < m.up ? m.up / SLASH.up : k < m.cut ? (m.cut - m.up) / SLASH.cut : k < m.through ? (m.through - m.cut) / SLASH.through : (1 - m.through) / back;
  };
  /** A swing begun at `side`, `k` of the way through; `held`, while the button that began it is down. */
  const newSwing = (side: number, held: boolean, k = 0): Swing => ({ k, side, struck: new Set(), held, charge: 0, cut: k >= SLASH_MARKS.up, blood: false });
  /** Which side to cut at, the skier going at `vel`: where each within reach will be as the blade comes down. */
  const slashSide = (right: Vector3, vel: Vector3) => {
    const soon = SLASH.up + SLASH.cut, reach = slashReach() + 0.8;
    // (The foe locked on, near enough to be cut at: at its side.)
    const foe = rolling() && mode === 'ride' ? lockedIn(rider.position, reach + vel.length() * soon + 2) : -1;
    if (foe >= 0) return (lastSide = horde.middle(foe).sub(rider.position).addScaledVector(vel, -soon).dot(right) >= 0 ? 1 : -1);
    let r = 0, l = 0;
    for (const o of horde.near(rider.position, reach + vel.length() * soon + 1)) {
      const d = o.at.clone().sub(rider.position).addScaledVector(vel, -soon).setY(0);
      if (d.length() > reach) continue;
      if (d.dot(right) >= 0) r++; else l++;
    }
    return (lastSide = r !== l ? (r > l ? 1 : -1) : -lastSide);
  };
  const swingOn = (dt: number, right: Vector3, ahead: Vector3, vel: Vector3) => {
    if (!swing) return;
    // (Held drawn up while the button is down, gathering force; let go, it cuts.)
    if (swing.held && !firing) swing.held = false;
    if (swing.held && swing.k >= SLASH_MARKS.up) {
      const was = swing.charge;
      swing.k = SLASH_MARKS.up;
      swing.charge = Math.min(1, swing.charge + dt / SLASH.charge);
      if (was < 1 && swing.charge >= 1) gunSound.hear('ring');
    } else swing.k = Math.min(1, swing.k + slashRate(swing.k) * dt);
    const k = swing.k, power = swing.charge, reach = slashReach() * (1 + 0.45 * power), out = right.clone().multiplyScalar(swing.side);
    if (!swing.cut && k > SLASH_MARKS.up) { swing.cut = true; gunSound.hear('swish'); }
    if (k > SLASH_MARKS.up + 0.01 && k < SLASH_MARKS.through + 0.04) {
      for (const o of horde.near(rider.position, reach + 0.6)) {
        const d = o.at.clone().sub(rider.position).setY(0), far = d.length();
        if (swing.struck.has(o.orc) || far > reach || d.dot(out) < -0.2 || d.dot(ahead) < -1.2) continue;
        swing.struck.add(o.orc);
        // (Rolled, the arms aiming themselves: each the blade comes to may turn it, or be missed; a cut held full strikes surer. Its damage
        // rolled either way, a held cut's the harder, `CHARGED`.)
        const times = 1 + (CHARGED.dmg - 1) * power;
        let dmg: number, crit = false;
        if (rolling()) {
          const r = rollAttack(diceRng, 'sword', guardOf(o.orc), 0, CHARGED.skill * power + rollBonus(), times);
          noteRoll(o.orc, 'sword', r);
          if (!r.hit) { missSaid(o.orc, o.at); continue; }
          dmg = r.dmg; crit = r.crit;
        } else ({ dmg, crit } = rollBlow(diceRng, 'sword', times));
        const push = out.clone().multiplyScalar(5 * (1 + 1.2 * power)).addScaledVector(ahead, 1.5).addScaledVector(vel, 0.35).addScaledVector(UP, 2.5 + 2 * power);
        const struck = horde.strike(o.orc, push, dmg / HP);
        if (!struck) continue;
        dmgSaid(o.at, dmg, crit);
        swing.blood = true;
        gunSound.hear('chop');
        bladeJolt = Math.max(bladeJolt, 0.25 + 0.45 * power);
        if (struck.down) { gunSound.grunt(); orcDowned(o.at, power > 0.95 ? 'cleaved' : 'slain', struck.kind); }
        else { const on = overPictureAt(o.at); if (on) hitMark(on); }
      }
    }
    if (k >= 1) swing = null;
  };
  /**
   * The great ones met (asked: "Show soulslike health bar when engaged in combat with the Yeti"): each, as the skier comes within
   * some fifty metres of it or strikes it, its name over a long thin bar across the foot of the picture, the bar shrinking as it is
   * struck, what a blow took left pale a moment and draining after; two at the most, the nearest. Brought down, its name gilt, a banner
   * across the picture (*Felled*, and its name), and the bar gone; gone by, or no longer carried, the bar fades away.
   */
  const bossesEl = $('bosses'), felledEl = $('felled');
  const bossShown = new Map<string, { el: HTMLElement; bar: HTMLElement; hp: number; felled: boolean; knelt: boolean }>();
  const showBosses = (list: Boss[]) => {
    const now = new Set(list.map((b) => b.id));
    for (const b of list) {
      let e = bossShown.get(b.id);
      if (!e) {
        const el = document.createElement('div'), name = document.createElement('div'), bar = document.createElement('div');
        el.className = 'boss'; name.className = 'name'; name.textContent = b.title; bar.className = 'bar';
        bar.innerHTML = '<i class="lag"></i><i class="fill"></i>';
        bar.setAttribute('role', 'meter'); bar.setAttribute('aria-label', b.title); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(b.most));
        el.append(name, bar);
        bossesEl.appendChild(el);
        e = { el, bar, hp: -1, felled: false, knelt: false };
        bossShown.set(b.id, e);
      }
      if (b.hp !== e.hp) {
        // (The red at once; the pale behind it, which the sheet lets follow after a moment.)
        e.hp = b.hp;
        e.bar.style.setProperty('--hp', String(b.hp / b.most));
        e.bar.style.setProperty('--was', String(b.hp / b.most));
        e.bar.setAttribute('aria-valuenow', String(Math.ceil(b.hp)));
      }
      // (Beaten, on its knees: said, and its name pulsing, waiting for the last blow.)
      if (b.kneeling && !e.knelt) {
        e.knelt = true;
        e.el.classList.add('kneeling');
        tell(`${b.title.split(',')[0]} is beaten`, 'strike once more to send it off', false, 2.8);
      }
      if (b.down && !e.felled) {
        e.felled = true;
        e.el.classList.add('felled');
        (felledEl.querySelector('small') as HTMLElement).textContent = b.title;
        felledEl.classList.remove('on'); void felledEl.offsetWidth; felledEl.classList.add('on');
      }
    }
    for (const [id, e] of bossShown) {
      if (now.has(id) || e.el.classList.contains('gone')) continue;
      e.el.classList.add('gone');
      e.el.addEventListener('animationend', () => { e.el.remove(); bossShown.delete(id); }, { once: true });
    }
  };
  /**
   * The arena laid where a horde of great ones comes, riding (`horde.onGreat`): the pipe across the run some way below it, a flag at
   * either end of its lip; the great ones penned between the pipe and some fifty metres above where they came, after the skier; and
   * boosters up the run from the pipe's foot, the way the skier climbs back. Not where the run ends too soon after it. Said as it is laid,
   * well ahead. Kickers about it taken away while it stands (`placeKickers`).
   */
  const boosters = new Boosters();
  scene.add(boosters.group);
  const layArena = (s0: number, mid0: number) => {
    if (mode !== 'ride' || flyingDemo || arena || carting || inside) return;
    const foot = s0 + 34, [lo, hi] = land.edges(foot), mid = (lo + hi) / 2, half = (hi - lo) / 2 + PIPE.wider;
    const onLand = (s: number, left: number) => { const p = land.at(s, left); return new Vector3(p.x, land.height(p.x, p.z), p.z); };
    const fall = (onLand(foot - 6, mid).y - onLand(foot + 6, mid).y) / 12, pipe = new Pipe(foot, mid, half, fall);
    if (foot + pipe.end > land.length - 60) return;
    const group = pipe.build(onLand, kickerParts.snow, kickerParts.dye);
    for (const side of [-1, 1]) {
      const p = onLand(foot + pipe.lip + 0.6, mid + side * (half + 0.6)), pole = new Mesh(kickerParts.pole, kickerParts.wood), flag = new Mesh(kickerParts.flag, kickerParts.cloth);
      pole.position.copy(p).setY(p.y + pipe.raise(pipe.lip + 0.6, side * (half + 0.6))); flag.position.copy(pole.position);
      const d = land.at(foot, mid);
      flag.rotation.y = Math.atan2(-d.dx, -d.dz);
      pole.castShadow = flag.castShadow = true;
      group.add(pole, flag);
    }
    scene.add(group);
    // (The box it may stand in, for `ground` to pass by quickly anywhere else.)
    const box: [number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let u = 0; u <= pipe.end; u += 2) for (const x of [-half - PIPE.taper, 0, half + PIPE.taper]) {
      const p = land.at(foot + u, mid + x);
      box[0] = Math.min(box[0], p.x - 2); box[1] = Math.max(box[1], p.x + 2); box[2] = Math.min(box[2], p.z - 2); box[3] = Math.max(box[3], p.z + 2);
    }
    arena = { pipe, group, box, sinking: false };
    horde.pen = { lo: s0 - 45, hi: foot - 5, mid: (mid + mid0) / 2, half: Math.max(4, half - PIPE.wider - 3) };
    boosters.lay([12, 26, 40, 54].map((back, i) => onLand(foot - back, mid + (i % 2 ? -2.5 : 2.5))));
    placeKickers(ride.down);
    tell('A great one ahead', 'a pipe below it turns you back up to it; take the boosters', false, 3.5);
  };
  horde.onGreat = layArena;
  /** The arena taken away: at once (a new run, or no longer riding with arms), or sunk back into the snow over a few seconds once the fight is done. */
  const endArena = (now = false) => {
    if (!arena) return;
    if (!arena.sinking) { arena.sinking = true; horde.unpen(); boosters.clear(); }
    if (now) arena.pipe.sunk = 1;
    if (arena.pipe.sunk >= 1) {
      arena.group.removeFromParent();
      arena.group.traverse((o) => { const m = o as Mesh; if (m.isMesh && m.geometry !== kickerParts.pole && m.geometry !== kickerParts.flag) m.geometry.dispose(); });
      const box = arena.box;
      arena = null;
      settleRideTracks(box);
      placeKickers(ride.down);
    }
  };
  /** The arena a moment on, riding: boosters taken; done once its great ones are, or once the skier has gone on well past it (round its pipe's end), sinking. */
  const arenaOn = (dt: number) => {
    if (!arena) return;
    if (mode !== 'ride') { endArena(true); return; }
    const a = arena;
    if (!a.sinking && (horde.penned === 0 || ride.down > a.pipe.foot + a.pipe.end + 40)) endArena();
    if (a.sinking) {
      a.pipe.sunk = Math.min(1, a.pipe.sunk + dt / 2.5);
      (a.group.userData.relay as () => void)();
      // (And the tracks ridden on it going down with it.)
      settleRideTracks(a.box);
      // (Its flags going down with it.)
      for (const o of a.group.children) { const g = (o as Mesh).geometry; if (g === kickerParts.pole || g === kickerParts.flag) o.position.y -= dt * 3; }
      if (a.pipe.sunk >= 1) endArena();
      return;
    }
    for (const at of boosters.step(dt, rider.position)) {
      boostLeft = BOOSTER.last;
      gunSound.hear('boost');
      burst(at.clone().setY(ground(at.x, at.z)), 6, 24);
      const on = overPictureAt(at);
      if (on) popUp(on, '+50', 'trick', 'boost');
      addScore(50);
    }
  };
  /**
   * A great one beaten and struck once more (asked: "when health reaches zero, the boss goes down to kneeled position and after next
   * hit a random transition (not the invert world or rocket sled or any other possible that requires active steering) activates and
   * launches the boss into faraway lands (and it disappears and the battle is considered won)"): sent off by one of the run's ends that
   * wants no steering, drawn by chance: the robot arm up out of the snow beside it, which takes it in its claw and throws it; a
   * whirlwind, which comes over and carries it round and up; a blast under the snow at its side; the saucer, which draws it up in its
   * beam and flies off with it; the snowman, which drives it off with its fir; or the plane, which snatches it on its hook and climbs
   * away with it. Thrown, it goes on up and away over the far valleys, tumbling, dwindling, gone with a glint; and the fight is won
   * (`horde.release`: its bar *Felled*, the arena sinking). (A second beaten while the first is being sent off, or while the run's own
   * end is at its work, which has the same pieces: knocked straight off by the blow itself, in a burst of snow, `plain`.)
   */
  type LaunchBy = 'arm' | 'whirl' | 'blast' | 'saucer' | 'snowman' | 'plane' | 'plain';
  const LAUNCHES: LaunchBy[] = ['arm', 'whirl', 'blast', 'saucer', 'snowman', 'plane'];
  /** Thrown: how fast it goes off (along `away`, and up), how little it falls, how long until it is gone. */
  const FLUNG = { on: 80, up: 42, fall: 5, gone: 3.6 };
  const launchRng = new Rng('launch');
  interface Launch {
    by: LaunchBy; t: number; model: Object3D; at: Vector3; mid: number; away: Vector3; side: Vector3;
    /** When it was thrown, from where, how fast; how far it has tumbled. */
    thrown: number; from: Vector3; fly: Vector3; tumble: number; gone: boolean;
    /** Each piece's own: where the arm stands and how it reaches; where the whirlwind came from; where the blast is; the saucer's way; the snowman's swing; the plane's hook. */
    base?: Vector3; grip?: Vector3; yaw?: { take: number; throw: number }; over?: { upper: number; fore: number }; on?: { upper: number; fore: number };
    a0?: number; r0?: number; spot?: Vector3; hover?: Vector3; sky?: Vector3; ship?: Vector3;
    sm?: { base: Vector3; grip: Vector3; length: number; u: Vector3; v: Vector3; meets: number; turn: number }; hook0?: Vector3;
  }
  const launches: Launch[] = [];
  /** The next launch's piece, if a script has chosen it (`__slope.launch`). */
  let launchNext: LaunchBy | null = null;
  /** Where the body is put, its middle at `middle`, turned by `q` (else upright, facing the way it goes off, tumbling over). */
  const putFlung = (l: Launch, middle: Vector3, q?: Quaternion) => {
    const turn = q ?? uprightTo(l.away).premultiply(new Quaternion().setFromAxisAngle(l.side, l.tumble));
    l.model.quaternion.copy(turn);
    l.model.position.copy(middle).addScaledVector(UP.clone().applyQuaternion(turn), -l.mid);
  };
  /** Thrown from `from` going `fly`: from now on it goes off by itself. */
  const throwOff = (l: Launch, from: Vector3, fly: Vector3) => { l.thrown = l.t; l.from.copy(from); l.fly.copy(fly); };
  const startLaunch = (model: Object3D, at: Vector3, size: number) => {
    const mid = 1.0 * size, fromSkier = at.clone().sub(rider.position).setY(0);
    const f = land.frame(at.x, at.z, ride.down), toTop = runDir(f).negate();
    // (Away from the skier and on up the run, over the far side of the valley.)
    const away = (fromSkier.lengthSq() > 1 ? fromSkier.normalize() : toTop.clone()).add(toTop).setY(0).normalize(), side = UP.clone().cross(away).normalize();
    const busy = !!cat || launches.some((x) => x.by !== 'plain');
    const l: Launch = { by: busy ? 'plain' : launchNext ?? launchRng.pick(LAUNCHES), t: 0, model, at: at.clone(), mid, away, side, thrown: -1, from: new Vector3(), fly: new Vector3(), tumble: 0, gone: false };
    launches.push(l);
    if (l.by !== 'plain') launchNext = null;
    tell('Sent flying', 'into the far lands', false, 2.4);
    const rng = launchRng.fork(`${l.by} ${ride.time.toFixed(2)}`), middle = at.clone().addScaledVector(UP, mid);
    if (l.by === 'plain') {
      snowBurst(at, 3, 90, 7); bladeJolt = Math.max(bladeJolt, 0.8);
      throwOff(l, at.clone().addScaledVector(UP, mid), away.clone().multiplyScalar(FLUNG.on).addScaledVector(UP, FLUNG.up));
    } else if (l.by === 'blast') {
      l.spot = at.clone().addScaledVector(away, -4.5); l.spot.y = ground(l.spot.x, l.spot.z);
      blast.lay(l.spot, ground, rng, 0.8);
    } else if (l.by === 'whirl') {
      const p = at.clone().addScaledVector(side, rng.range(24, 30));
      whirl.hide(); whirl.strength = 0.02; whirl.place(p.setY(ground(p.x, p.z)));
      l.base = p.clone();
    } else if (l.by === 'saucer') {
      l.hover = middle.clone().addScaledVector(UP, 24);
      l.sky = l.hover.clone().addScaledVector(side, rng.range(200, 260) * (rng.chance(0.5) ? 1 : -1)).addScaledVector(away, -60).addScaledVector(UP, 150);
      l.ship = l.sky.clone();
    } else if (l.by === 'snowman') {
      const base = at.clone().addScaledVector(side, 11); base.y = ground(base.x, base.z);
      const facing = at.clone().sub(base).setY(0).normalize(), grip = base.clone().addScaledVector(UP, 10).addScaledVector(facing, 3.6);
      const reach = middle.clone().sub(grip), length = reach.length(), u = reach.divideScalar(length), v = away.clone().addScaledVector(u, -away.dot(u)).normalize();
      l.sm = { base, grip, length, u, v, meets: -1.7 / length, turn: Math.sign(away.dot(UP.clone().cross(facing))) || 1 };
      snowman.place(base, facing, length);
    } else if (l.by === 'arm') {
      const grip = middle.clone().addScaledVector(UP, 0.12), base = grip.clone().addScaledVector(side, 7.6).addScaledVector(away, -2);
      base.y = ground(base.x, base.z);
      const ahead = Math.hypot(grip.x - base.x, grip.z - base.z), shoulder = base.y + ARM.shoulder;
      l.base = base; l.grip = grip;
      l.yaw = { take: Math.atan2(grip.x - base.x, grip.z - base.z), throw: Math.atan2(away.x, away.z) };
      l.over = reachFor(ahead, grip.y + ARM.grip + 1.8 - shoulder); l.on = reachFor(ahead, grip.y + ARM.grip - shoulder);
      robot.place(base, ground, rng);
    } else {
      // (The plane's hook comes in low from behind it, the way it is to go, and passes just over it.)
      l.hook0 = middle.clone().addScaledVector(UP, mid * 0.9 + 0.4);
    }
  };
  /** The great one let go of, gone: a glint where it went, and the fight won. */
  const endLaunch = (l: Launch) => {
    const i = launches.indexOf(l);
    if (i < 0) return;
    launches.splice(i, 1);
    if (!l.gone && l.thrown >= 0) { const on = overPictureAt(l.model.position); if (on) popUp(on, '✦', 'trick', 'gone'); gunSound.hear('ring'); }
    horde.release(l.model);
    // (Its piece put away, unless the run's own end has it now.)
    if (!cat) ({ arm: robot, whirl, blast, saucer, snowman, plane, plain: null })[l.by]?.hide();
  };
  const endLaunches = () => { for (const l of [...launches]) endLaunch(l); };
  /** The arm a moment on, as `armPose`, for the launch. */
  const launchArm = (l: Launch): ArmPose => {
    const T = ARM_T, t = l.t, k = (from: number, to: number) => smooth((t - from) / (to - from));
    const mix3 = (p: { upper: number; fore: number; claw: number }, q: { upper: number; fore: number; claw: number }, w: number) => ({ upper: p.upper + (q.upper - p.upper) * w, fore: p.fore + (q.fore - p.fore) * w, claw: p.claw + (q.claw - p.claw) * w });
    let j = mix3(FOLDED, { ...l.over!, claw: -Math.PI / 2 }, k(T.risen - 0.15, T.over));
    j = mix3(j, { ...l.on!, claw: -Math.PI / 2 }, k(T.over, T.down));
    j = mix3(j, HIGH, k(T.closed, T.lifted));
    j = mix3(j, DRAWN, k(T.lifted, T.drawn));
    const sweep = clamp((t - T.drawn) / T.sweep, 0, 1);
    j = mix3(j, THROWN, sweep * sweep * (3 - 2 * sweep));
    const rise = smooth(t / T.risen) * (1 - k(T.drawn + 0.9, T.drawn + 2.8)), yaw = turnTo(l.yaw!.take, l.yaw!.throw, k(T.lifted, T.drawn - 0.1));
    const grip = t < T.risen ? 1 - k(0.6, T.risen) : 1 - k(T.risen, T.over) + k(T.down, T.closed) - k(T.drawn + T.letGo, T.drawn + T.letGo + 0.2);
    return { rise, yaw, ...j, roll: 0, grip: clamp(grip, 0, 1), hold: 1 };
  };
  /** The launch a moment on (`dt`): its piece at its work, the great one where it has it; thrown, going off; gone, let go of. */
  const launchStep = (dt: number) => { for (const l of [...launches]) launchOn(l, dt); };
  const launchOn = (l: Launch, dt: number) => {
    // (The run's own end begun: the pieces are its own; what was being sent off is gone at once.)
    if (cat && l.by !== 'plain') { l.gone = true; endLaunch(l); return; }
    const was = l.t;
    l.t += dt;
    const t = l.t, middle = l.at.clone().addScaledVector(UP, l.mid), past = (m: number) => was < m && t >= m;
    if (l.by === 'plain') {
      // (Thrown by the blow at once: below.)
    } else if (l.by === 'blast') {
      const booms = 1.1;
      if (t < booms) { blast.cracking(clamp(t / (booms - 0.1), 0, 1)); bladeJolt = Math.max(bladeJolt, 0.15 * t); }
      if (past(booms)) { blast.boom(); snowBurst(l.spot!, 8, 180, 14); bladeJolt = 1.2; gunSound.hear('boom'); throwOff(l, middle, l.away.clone().multiplyScalar(FLUNG.on).addScaledVector(UP, FLUNG.up)); }
      blast.step(dt, camera, ground);
    } else if (l.by === 'whirl') {
      const reaches = 2.2, lifts = 2.6;
      whirl.strength = l.thrown < 0 ? 0.02 + 0.98 * smooth(t / reaches) : whirl.strength * Math.exp(-dt * 0.9);
      if (t < reaches) { whirl.base.copy(l.base!).lerp(l.at, smooth(t / reaches)); whirl.base.y = ground(whirl.base.x, whirl.base.z); }
      if (past(reaches)) { const rel = middle.clone().sub(whirl.axisAt(l.mid)).setY(0); l.r0 = rel.length(); l.a0 = Math.atan2(-rel.z, rel.x); }
      if (t >= reaches && l.thrown < 0) {
        const u = clamp((t - reaches) / lifts, 0, 1), h = l.mid + 34 * u ** 1.6, wide = Math.max(2.5, whirl.radiusAt(h) * 1.2), a = l.a0! + 2.4 * TURN * u ** 1.35;
        const at = whirl.about(h, a, l.r0! + (wide - l.r0!) * smooth(u / 0.35));
        l.tumble += TURN * (0.3 + u) * dt;
        putFlung(l, at);
        if (u >= 1) throwOff(l, at, whirl.round(a).multiplyScalar(45).addScaledVector(l.away, FLUNG.on * 0.7).addScaledVector(UP, FLUNG.up * 0.7));
      }
      whirl.step(dt, camera, ground);
      if (l.thrown >= 0 && t > l.thrown + 4) whirl.hide();
    } else if (l.by === 'saucer') {
      const arrives = 2.6, beams = 0.45, rises = 2.2, leaves = rises + arrives + beams + 0.3, k = clamp(t / arrives, 0, 1);
      const ship = t < leaves ? l.sky!.clone().lerp(l.hover!, 1 - (1 - k) ** 3) : l.hover!.clone().addScaledVector(l.away.clone().addScaledVector(UP, 1.6).normalize(), 20 * (t - leaves) + 70 * (t - leaves) ** 2);
      ship.y += Math.sin(t * 2.1) * 0.35 * smooth((t - arrives) / 0.6);
      l.ship!.copy(ship);
      saucer.place(ship, new Quaternion().setFromAxisAngle(UP.clone().cross(l.hover!.clone().sub(l.sky!).setY(0).normalize()).normalize(), 0.5 * (1 - k)));
      const reach = saucer.belly().y - ground(ship.x, ship.z), up = clamp((t - arrives - beams) / rises, 0, 1);
      saucer.shine(smooth((t - arrives) / beams) * (1 - smooth((t - leaves) / 0.3)), reach);
      saucer.step(dt, camera);
      if (up > 0 && up < 1) { l.tumble += 0.4 * dt; const top = saucer.belly().addScaledVector(UP, -(l.mid + 0.6)); putFlung(l, middle.clone().lerp(top, smooth(up)), uprightTo(l.away).premultiply(new Quaternion().setFromAxisAngle(UP, 2 * (t - arrives)))); }
      if (up >= 1 && l.model.visible) { l.model.visible = false; l.thrown = t; l.gone = true; }
      if (t > leaves + 2.4) { saucer.hide(); const on = overPictureAt(ship); if (on) popUp(on, '✦', 'trick', 'gone'); gunSound.hear('ring'); endLaunch(l); return; }
      return;
    } else if (l.by === 'snowman') {
      const T = SNOWMAN_T, sm = l.sm!, set = sm.meets - 0.25;
      const a = t < T.address ? set : t < T.top ? set + (-2.3 - set) * smooth((t - T.address) / (T.top - T.address)) : t < T.contact ? -2.3 + (sm.meets + 2.3) * ((t - T.top) / (T.contact - T.top)) ** 2.2 : sm.meets + (2.1 - sm.meets) * (1 - (1 - clamp((t - T.contact) / (T.through - T.contact), 0, 1)) ** 3);
      const rise = smooth(t / T.risen) * (1 - smooth((t - T.sinks) / (T.gone - T.sinks)));
      if (dt > 0 && ((rise > 0.05 && rise < 0.97 && t < T.risen) || (t > T.sinks && rise > 0.03))) snowBurst(sm.base, 5, Math.round(dt * 500), 9);
      if (t > T.gone) snowman.hide();
      else snowman.pose({ rise, twist: 0.3 * a * sm.turn, grip: sm.grip.clone().addScaledVector(UP, -(1 - rise) * SNOWMAN.depth), club: sm.u.clone().multiplyScalar(Math.cos(a)).addScaledVector(sm.v, Math.sin(a)) });
      if (past(T.contact)) { snowBurst(l.at, 2.4, 110, 7); bladeJolt = 0.9; gunSound.hear('chop'); throwOff(l, middle, l.away.clone().multiplyScalar(FLUNG.on).addScaledVector(UP, FLUNG.up)); }
    } else if (l.by === 'arm') {
      const T = ARM_T;
      robot.pose(launchArm(l));
      if (dt > 0 && t < T.risen) snowBurst(l.base!, 2.8, Math.round(dt * 420), 7);
      if (t >= T.closed && l.thrown < 0) { const q = robot.clawTurn(); putFlung(l, robot.holding(), q); }
      if (past(T.drawn + T.letGo)) throwOff(l, robot.holding(), l.away.clone().multiplyScalar(FLUNG.on).addScaledVector(UP, FLUNG.up));
      if (t > T.drawn + 2.8) robot.hide();
    } else {
      const catches = 3, speed = 55, w = t - catches, hook = l.hook0!.clone().addScaledVector(l.away, speed * w).addScaledVector(UP, w > 0 ? 7 * w * w : 0);
      const fwd = l.away.clone().addScaledVector(UP, w > 0 ? (14 * w) / speed : 0).normalize(), left = UP.clone().cross(fwd).normalize(), up = fwd.clone().cross(left).normalize();
      const at = hook.clone().addScaledVector(up, PLANE.line * Math.cos(0.3)).addScaledVector(fwd, PLANE.line * Math.sin(0.3)).sub(PLANE.belly.clone().applyMatrix4(new Matrix4().makeBasis(left, up, fwd)));
      plane.place(at, new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(left, up, fwd)), hook);
      plane.step(dt);
      if (w > 0) {
        const swing = 0.5 * Math.exp(-w / 1.4) * Math.sin(3.1 * w);
        putFlung(l, hook.clone().addScaledVector(UP, -(l.mid * 0.9 + 0.4)).addScaledVector(l.away, -0.9 * Math.sin(0.35 + swing)), uprightTo(l.away).premultiply(new Quaternion().setFromAxisAngle(l.side, -0.35 - swing)));
      }
      if (past(catches)) gunSound.hear('chop');
      if (w > FLUNG.gone) { plane.hide(); const on = overPictureAt(hook); if (on) popUp(on, '✦', 'trick', 'gone'); gunSound.hear('ring'); l.gone = true; endLaunch(l); }
      return;
    }
    // Thrown: on up and away, falling only a little, tumbling; gone once far enough off.
    if (l.thrown >= 0) {
      const u = t - l.thrown;
      l.tumble += TURN * 1.4 * dt;
      putFlung(l, l.from.clone().addScaledVector(l.fly, u).addScaledVector(UP, -0.5 * FLUNG.fall * u * u));
      if (u > FLUNG.gone) endLaunch(l);
    }
  };
  horde.onTaken = (model, at, size) => startLaunch(model, at, size);
  clearGun = () => {
    horde.clear(); gunfire.clear(); splatter.clear(); flames.clear(); bolts.clear(); sparks.clear(); zapSparks.clear(); heat.clear(); sweep.clear(); rockets.clear();
    endArena(true); boostLeft = 0; endLaunches();
    for (const b of booms) b.blast.hide();
    swing = null; pulls = 0;
  };
  // (With the orcs on, the sound woken by any click or key, the first that a browser lets wake it: not left to the first shot.)
  const wakeSound = () => { if (orcsOn) gunSound.wake(); };
  // The bar toward the next arm (`#armBar`), riding with the arms, drawn as the tricks' meter is: a block for each `ARM_BLOCK` orcs
  // toward it, filled as each is brought down; full and gilt for a moment (`ARM_WON` seconds, the page's own) as an arm is taken up,
  // then empty toward the one after it, or put away when there is none left to take up.
  const ARM_WON = 1.6, ARM_BLOCK = 5;
  const armBar = $('armBar'), armBarBlocks = armBar.querySelector<HTMLElement>('.blocks')!;
  const armBarNext = armBar.querySelector<HTMLElement>('.next')!, armBarLeft = armBar.querySelector<HTMLElement>('.left')!;
  // (In the phone's strip, the arm carried and how many more to the next, in one line over the bar.)
  const armBarNow = armBar.querySelector<HTMLElement>('.now')!, armBarTo = armBar.querySelector<HTMLElement>('.to')!;
  let armBarArm = -1, armWonAt = -Infinity, armBarTold = '';
  const armBarUp = (shown: boolean) => {
    const by = armAfter(slain), rung = LADDER.indexOf(by.arm), now = performance.now() / 1000;
    // (Taken up, not set back by the script's `slain`: only a step up the ladder is shown won.)
    if (rung !== armBarArm) { if (armBarArm >= 0 && rung > armBarArm) armWonAt = now; armBarArm = rung; }
    const won = now - armWonAt < ARM_WON;
    shown &&= won || by.next !== null;
    if (armBar.hidden === shown) armBar.hidden = !shown;
    armBar.classList.toggle('won', won);
    if (!shown) return;
    const need = by.next ? by.next.after : 1, got = won ? need : need - by.left;
    const n = Math.max(1, Math.ceil(need / ARM_BLOCK));
    while (armBarBlocks.children.length < n) armBarBlocks.appendChild(document.createElement('i'));
    while (armBarBlocks.children.length > n) armBarBlocks.lastElementChild!.remove();
    [...armBarBlocks.children].forEach((b, i) => (b as HTMLElement).style.setProperty('--f', clamp(got / ARM_BLOCK - i, 0, 1).toFixed(3)));
    say(armBarNext, won ? by.arm.name : by.next!.name);
    say(armBarLeft, won ? 'Taken up' : `${by.left} more`);
    say(armBarNow, armNow().name);
    say(armBarTo, won ? 'taken up' : `${by.left} to ${by.next!.name.toLowerCase()}`);
    const told = won ? `${by.arm.name} taken up` : `${got} of ${need} orcs toward the ${by.next!.name.toLowerCase()}`;
    if (told !== armBarTold) {
      armBarTold = told;
      armBar.setAttribute('aria-valuemax', String(need));
      armBar.setAttribute('aria-valuenow', String(got));
      armBar.setAttribute('aria-label', told);
    }
  };
  addEventListener('pointerdown', wakeSound, true);
  addEventListener('keydown', wakeSound, true);
  /** Where the orc hunt's demo run had got to last frame: gone back, or on by more than a moment (the timeline dragged), begun anew. */
  let huntAt = 0;
  /**
   * The gun a frame on (`dt`, the page's own; nothing goes on while riding is held, or the demo run is paused), the skier where `now`
   * says: put in the hands of whoever carries it, aimed; fired while the button is held; its rounds flown; the orcs come on. Put away,
   * and its orcs with it, when it is not carried. Watching the orc hunt, aimed and fired for the rider: at the nearest orc ahead that can
   * be seen from the muzzle, within a hundred metres, for as long as there is one.
   */
  /**
   * The dungeon as the orcs come through it (`Horde.within`; asked: "go ahead with the indoor combat requirements"): out of its rooms,
   * round its walls, on its floors; in the land's frame, as the cave is stood in it.
   */
  const den = (cave: Cave): Den => {
    const o = land.group.position;
    return {
      spawn: (rng, from) => { const p = cave.orcSpawn(rng, { x: from.x - o.x, z: from.z - o.z }); return p && new Vector3(p.x + o.x, 0, p.z + o.z); },
      way: (p, to) => { const w = cave.orcWay({ x: p.x - o.x, z: p.z - o.z }, { x: to.x - o.x, z: to.z - o.z }); return new Vector3(w.x, 0, w.z); },
      floor: (x, z) => cave.floorUnder(x - o.x, z - o.z) ?? land.height(x, z),
      walk: (x, z, tx, tz, r) => { const [a, b] = cave.walk(x - o.x, z - o.z, tx - o.x, tz - o.z, r); return [a + o.x, b + o.z]; },
      shows: (p) => !foot || cave.inSight({ x: foot.x - o.x, z: foot.z - o.z, y: 0 } as Vector3, new Vector3(p.x - o.x, p.y, p.z - o.z)),
    };
  };
  /**
   * Struck by a foe come up to it on foot: points lost, and thrown back a step from it; the more, the harder it strikes (a goblin, less
   * than an orc; one of the dead, more; the barrow-king, two and a half times as much: `FoeKind.den`).
   */
  const struck = (from: Vector3, kind: FoeKind, who: number) => {
    const f = foot, cave = caveNow(), den = kind.den;
    if (!f || !cave || mode !== 'ride' || !den) return;
    // (A barrow ward worn: the blow turned aside, as often as it says.)
    if (kit().shield && wardRng.chance(kit().shield)) {
      const s = overPictureAt(rider.position.clone().addScaledVector(UP, 1.8));
      if (s) popUp(s, 'Warded', 'trick', 'the blow turned aside');
      wardRing.pulse();
      gunSound.hear('ring');
      return;
    }
    // (Rolled, as the arms' attacks are (asked: "enemies attacks against the player should also use rpg system"): its d20 and its skill
    // against the guard of the one on foot, `GUARD`; missed, dodged; struck home, its damage rolled (a natural twenty, a crushing blow,
    // its dice thrown twice), and as much lost as it did: thirty points a hit point, the meter's blocks by how hard it was against an
    // orc's blow, thrown back as far.)
    const name = horde.titleOf(who), r = rollAt(diceRng, den.skill, den.dmg, GUARD);
    noteRoll(who, 'foe', r, `${name[0].toUpperCase()}${name.slice(1)} at you: ${rollSaid(r)}`);
    const head = rider.position.clone().addScaledVector(UP, 1.8);
    if (!r.hit) { dmgPop(head, 'dodged', 'miss'); gunSound.hear('swish'); return; }
    const blow = r.dmg / 6.5, lost = r.dmg * 30;
    score = Math.max(0, score - lost);
    earnWild(-WILD.struck * blow);
    scoreEl.textContent = score.toLocaleString('en');
    bladeJolt = Math.max(bladeJolt, r.crit ? 0.9 : blow > 2 ? 0.6 : 0.2);
    const away = new Vector3(f.x - from.x, 0, f.z - from.z).normalize().multiplyScalar(1.2 * Math.sqrt(blow) * (r.crit ? 1.4 : 1)), o = land.group.position;
    const [x, z] = cave.walk(f.x - o.x, f.z - o.z, f.x - o.x + away.x, f.z - o.z + away.z, walks() ? FOOT.person : FOOT.horse);
    f.x = x + o.x; f.z = z + o.z;
    dmgPop(head.clone().addScaledVector(UP, 0.3), String(r.dmg), r.crit ? 'hurt crit' : 'hurt', r.crit ? 'crushing blow' : '');
    const s = overPictureAt(head);
    if (s) popUp([s[0], s[1] + 30], `−${lost}`, 'run', 'struck');
    if (r.crit) hurtFlash();
    const what = kind.titles ? name : `${/^[aeiou]/.test(kind.name) ? 'an' : 'a'} ${kind.name}`;
    tell(r.crit ? 'Crushing blow!' : 'Struck!', `${what} came at you`, true, 1.2);
    gunSound.hear('grunt');
  };
  // ---------------------------------------------------------------- loot
  /**
   * What is found (`slopeLoot.ts`; asked: "it should be possible for the player to find loot from the dungeon treasures and killed
   * bosses"): drawn as the chest at a dungeon's end is opened, or a great one is felled, riding; thrown up glowing where it was found
   * and drawn to the player, and said on a card as it is taken; put in the pack (kept in the browser, `pack`, made where what is kept
   * is read), worn at once if nothing is worn in its place, and changed in the menu.
   */
  const drops = new Drops(scene), wardRing = new WardRing(scene), lootCard = new LootCard($('loot'));
  // (Each find drawn afresh, the page's time in its seed: no two sessions find alike.)
  const lootRng = new Rng(`loot ${Date.now()}`), wardRng = lootRng.fork('wards');
  let finds = 0;
  /** Something found at `at`, as `source` gives, said to be `found` so; to wait over the snow, or `floor`. Riding only. */
  const findLoot = (source: Source, at: Vector3, found: string, floor?: number) => {
    if (!pack || mode !== 'ride' || flyingDemo) return null;
    const item = rollLoot(lootRng.fork(`find ${finds++}`), source, pack.read, found);
    drops.add(item, at, new Vector3(at.x, (floor ?? ground(at.x, at.z)) + 1, at.z));
    return item;
  };
  /** Something found come to the player: put in the pack (worn, or read, if it can be), said, and a chime. */
  const takeLoot = (item: Item) => {
    if (!pack) return;
    const on = pack.add(item);
    foundRun.push(item.name);
    lootCard.show(item, on, item.slot === 'weapon' && !weaponsFree() ? `in your pack · ${HELD_BACK.toLowerCase()}` : undefined);
    gunSound.hear('ring');
  };
  giveLeft = () => { for (const it of drops.clear()) takeLoot(it); };
  /** A frame on: what was found drawn to the player and taken; the card said. */
  const stepLoot = (dt: number) => {
    lootCard.step(performance.now() / 1000);
    if (drops.count) for (const it of drops.step(dt, focus().addScaledVector(UP, 1.1), camera.quaternion)) takeLoot(it);
  };
  /**
   * Whether a weapon found may be carried (asked: "also disable looted weapons until the weapons progression is at bazooka level"):
   * only once the foes brought down have given the last of their arms, the bazooka. Until then, found weapons are kept in the pack,
   * worn there, but the foes' arm is carried, and the weapon's might is not had.
   */
  const weaponsFree = () => armAfter(slain).next === null;
  const HELD_BACK = 'Carried once the bazooka is taken up';
  /** The weapon found and worn, riding, once it may be carried: carried in place of the arm the foes brought down have given. */
  const wornWeapon = (): Item | null => (pack && mode === 'ride' && weaponsFree() ? pack.wornIn('weapon') : null);
  const carriedArms = new Map<string, Arm>();
  /** The arm carried riding: the weapon worn, as its arm is but quicker to fire as it says (and named for it); else the foes' gift. */
  const carried = (): Arm => {
    const it = wornWeapon();
    if (!it?.arm) return armAfter(slain).arm;
    let a = carriedArms.get(it.id);
    if (!a) {
      const of = LADDER.find((x) => x.kind === it.arm)!;
      a = { ...of, name: it.name, every: of.firing === 'swing' ? of.every : of.every * (1 - (it.mods.haste ?? 0)) };
      carriedArms.set(it.id, a);
    }
    return a;
  };
  /**
   * The ward worn, about the player while it carries arms: its ring on the snow as far out as it reaches, flaring as it acts. An ember
   * ward burns every foe within its ring, so many blows a second, struck twice a second (each blow staggers what it does not bring
   * down: struck every frame, they stood still); a storm ward calls a bolt down out of the sky on the nearest foe within its ring every
   * so many seconds, as hard as the lightning gun's; a barrow ward turns aside blows on foot (`struck`); a magpie's charm only adds to
   * the points, and has no ring.
   */
  let emberClock = 0, stormClock = 0;
  const EMBER_EVERY = 0.5;
  const wardStep = (dt: number, on: boolean) => {
    const g = kit(), it = pack?.wornIn('ward'), kind = on && it?.ward && mode === 'ride' && !cat && !crash ? it.ward : null;
    const r = kind === 'ember' ? g.emberR : kind === 'storm' ? g.stormR : kind === 'shield' ? 1.3 : 0, at = focus();
    wardRing.step(dt, at, foot ? UP : normalAt(at.x, at.z, 0.6), r, kind ? WARD_COLOUR[kind] : '#fff');
    if (!kind || dt <= 0) return;
    if (kind === 'ember' && (emberClock += dt) >= EMBER_EVERY) {
      emberClock = 0;
      let any = false;
      for (const o of horde.near(at, g.emberR)) {
        any = true;
        flames.burn(o.at, 4, 0.3);
        const struck = horde.strike(o.orc, o.at.clone().sub(at).setY(0).normalize().multiplyScalar(2).addScaledVector(UP, 1.2), g.ember * EMBER_EVERY, false);
        if (struck?.down) { flames.burn(o.at, 18); gunSound.grunt(); orcDowned(o.at, 'burnt', struck.kind); }
      }
      if (any) { wardRing.pulse(); gunSound.hear('flame'); }
    }
    if (kind === 'storm' && (stormClock += dt) >= g.storm) {
      let best: { orc: number; at: Vector3 } | null = null, near = Infinity;
      for (const o of horde.near(at, g.stormR)) { const d = o.at.distanceTo(at); if (d < near) { near = d; best = o; } }
      // (None near: ready to strike the first that comes.)
      if (!best) { stormClock = g.storm; return; }
      stormClock = 0;
      const sky = best.at.clone().add(new Vector3(wardRng.range(-3, 3), 18, wardRng.range(-3, 3)));
      bolts.strike([sky, sky.clone().lerp(best.at, 0.5).add(new Vector3(wardRng.range(-1.5, 1.5), 0, wardRng.range(-1.5, 1.5))), best.at.clone()]);
      burst(best.at, 2, 6);
      gunSound.hear('zap');
      wardRing.pulse();
      const b = rollBlow(wardRng, 'lightning'), struck = horde.strike(best.orc, new Vector3(0, 3, 0), b.dmg / HP, false);
      if (struck) dmgSaid(best.at, b.dmg, b.crit);
      if (struck?.down) { gunSound.grunt(); orcDowned(best.at, 'zapped', struck.kind); }
    }
  };
  /** What is had with nothing found worn in a slot, as the pack in the menu names it. */
  const plainIn = (slot: Slot) => slot === 'skis' ? 'The skis you came with' : slot === 'boots' ? 'Your own boots' : slot === 'ward' ? 'No ward' : `${armAfter(slain).arm.name}, given by the foes brought down`;
  /** What everything worn comes to, worked out again; the pack in the menu shown again. */
  const regear = () => {
    if (!pack) return;
    worn = pack.mods();
    carriedArms.clear();
    packView($('pack'), pack, plainIn, () => {}, (slot) => (slot === 'weapon' && !weaponsFree() && pack!.items.some((i) => i.slot === 'weapon') ? `${HELD_BACK}: until then, the foes' arm is carried.` : ''));
    $('packEmpty').hidden = !pack.items.length;
    const n = pack.items.length;
    say($('packCount'), n ? String(n) : '');
  };
  $('packEmpty').addEventListener('click', () => { if (pack && confirm('Let go of everything found, and forget the guidebooks read?')) pack.empty(); });

  /** Where the arm was last aimed, for a script to see that it holds still (`__slope.aimed`). */
  const aimedAt = new Vector3();
  /** How an arm is used, said as it is taken up, the arms aiming themselves. */
  const autoHint = (arm: Arm, touch: boolean) => {
    const press = touch ? 'Attack' : 'Attack (Space, or a click)', hold = touch ? 'hold Attack' : 'hold Attack (Space, or the button)';
    const how = arm.firing === 'swing' ? `${press} cuts at the foe locked on; hold to raise it, let go to cut harder` : arm.firing === 'single' ? `${press} fires at the foe locked on` : `${hold} to fire at the foe locked on`;
    return `${how}; ${touch ? '◀ ▶ or a touch on a foe' : '◀ ▶ (Q, E) or a click on a foe'} locks on another`;
  };
  /**
   * The fight shown, riding with the arms aiming themselves (`arm`; none, not): brackets about the foe locked on, sized to it, and a
   * thin bar of its strength under them; and by *Attack* and ◀ ▶, its name, its strength in hit points, and the last roll made at it.
   */
  const lockEl = $('lockOn'), fightEl = $('fight'), attackEl = $('attack'), fightWho = fightEl.querySelector<HTMLElement>('.who')!;
  const fightHp = fightEl.querySelector<HTMLElement>('.hpN')!, fightBar = fightEl.querySelector<HTMLElement>('.bar')!, fightRoll = fightEl.querySelector<HTMLElement>('.roll')!;
  let lockAt = '', lockHp = '-', fightRolls = 0;
  const showFight = (arm: Arm | null) => {
    const on = !!arm && mode === 'ride' && rolling() && !cat;
    if (fightEl.hidden === on) fightEl.hidden = !on;
    document.body.classList.toggle('autoaim', on);
    const foe = on && lock.orc >= 0 && horde.coming(lock.orc) ? lock.orc : -1, health = foe >= 0 ? horde.health(foe) : null;
    const mid = foe >= 0 ? horde.middle(foe) : null, at = mid && overPictureAt(mid), mark = foe >= 0 ? lock.list.find((m) => m.orc === foe) : null;
    if (!at || !health) { if (!lockEl.hidden) lockEl.hidden = true; }
    else {
      if (lockEl.hidden) lockEl.hidden = false;
      // (As tall as it stands on the picture: its middle, and as far over it as it is tall.)
      const top = overPictureAt(mid!.clone().addScaledVector(UP, (mark?.tall ?? 2) * 0.55)), tall = clamp(top ? Math.abs(at[1] - top[1]) * 2 : 40, 26, 220);
      const to = `translate(${at[0].toFixed(0)}px, ${at[1].toFixed(0)}px)|${tall.toFixed(0)}`;
      if (to !== lockAt) { lockAt = to; lockEl.style.transform = `translate(${at[0].toFixed(0)}px, ${at[1].toFixed(0)}px)`; lockEl.style.setProperty('--tall', `${tall.toFixed(0)}px`); }
      const reachOf = arm!.firing === 'swing' ? slashReach() + 1.5 : ARM_DICE[arm!.kind].lock;
      lockEl.classList.toggle('far', mid!.distanceTo(rider.position) > reachOf);
      lockEl.classList.toggle('chosen', lock.chosen);
    }
    // (Its name and strength, and the last roll made at it, by the buttons.)
    const hp = health ? `${Math.ceil(health.hp * HP)}|${Math.round(health.most * HP)}|${health.kneeling}` : '';
    if (hp !== lockHp) {
      lockHp = hp;
      const k = health ? health.hp / health.most : 0;
      lockEl.style.setProperty('--hp', k.toFixed(3)); fightBar.style.setProperty('--hp', k.toFixed(3));
      say(fightWho, foe >= 0 ? horde.titleOf(foe) : on ? 'No foe in reach' : '');
      say(fightHp, health ? (health.kneeling ? 'beaten · strike once more' : `${Math.ceil(health.hp * HP)} / ${Math.round(health.most * HP)} hp`) : '');
      fightEl.classList.toggle('none', foe < 0);
    }
    if (on && rollsMade !== fightRolls && rolls.length) {
      fightRolls = rollsMade; const r = rolls[rolls.length - 1];
      say(fightRoll, r.say);
      fightRoll.classList.toggle('hit', r.roll.hit); fightRoll.classList.toggle('crit', r.roll.crit); fightRoll.classList.toggle('against', r.arm === 'foe');
      fightRoll.classList.remove('new'); void fightRoll.offsetWidth; fightRoll.classList.add('new');
    }
  };
  const armUp = (dt: number, now: Now) => {
    // (A weapon found strikes harder.)
    horde.might = 1 + (wornWeapon() ? kit().might : 0);
    const on = armed(), human = who === 'person' ? live : who === 'mounted' ? jockey : null, watching = mode === 'watch';
    document.body.classList.toggle('gun', on);
    const arm = armNow(), model = arms.get(arm.kind)!, touch = !document.body.classList.contains('mouse');
    // (Riding with an arm for the first time, what it is and how it is used, said: the sword as the first run with the orcs begins,
    // and each after it as it is taken up.)
    if (on && human && mode === 'ride' && armSaid !== arm.kind && !cat && !crash) {
      armSaid = arm.kind;
      tell(arm.kind === 'sword' ? 'Sword' : `${arm.name}!`, rolling() ? autoHint(arm, touch) : touch ? arm.hint.replace('click or tap', 'tap').replace('a click', 'a tap').replace('hold to', 'hold a finger on the picture to') : arm.hint, false, 3.5);
    }
    for (const [w, poles] of poleSets) for (const p of poles) p.visible = !((on || foot) && w === who);
    $('tally').hidden = !on;
    armBarUp(on && !!human && !watching);
    for (const [k, g] of arms) if (g.visible && (k !== arm.kind || !on || !human)) g.visible = false;
    // (The sword out of its scabbard on the back while it is in the hand.)
    for (const [r, h] of hilts) if (h) h.visible = !(on && r === human && arm.kind === 'sword');
    if (!on || !human) {
      lock.orc = -1;
      showFight(null);
      if (bossShown.size) showBosses([]);
      if (horde.about) clearGun!();
      endArena(true);
      firing = false;
      return;
    }
    if (watching && (t < huntAt - 0.01 || t > huntAt + 1)) clearGun!();
    huntAt = t;
    const going = watching ? (playing && !scrubbing ? dt * rate : 0) : playing && !menuOpen ? dt : 0, holder = human.model.parent;
    if (!holder) return;
    if (model.parent !== holder) holder.add(model);
    model.visible = true;
    const muzzle = model.localToWorld(arm.muzzle.clone()), go = along(now.way, here);
    // In the air (or thrown, or in a turn of the whole body on the snow), the gun in the right hand alone, unfired; riding, unless fired.
    const frame = watching ? demo.frames[Math.min(demo.frames.length - 1, Math.round(t / STEP))] : null;
    // (Riding, in the air too (asked: "can we enable shooting from mid air?"): while the trigger is held, or a shot or a cut asked for is
    // still to come, and `AIR_AIM` seconds after, the arms are the gun's, aimed as on the snow, as far round as they turn from a body
    // spinning or upside down, and fired along where it points; else the trick's own, its grab, the gun in the right hand alone.)
    if (!watching && air && (firing || pulls || swing)) airAim = AIR_AIM; else airAim = Math.max(0, airAim - going);
    const holding = watching ? !!frame && !frame.air && Math.abs((frame.c as RideControls).spin ?? 0) < 0.3 : (!air || airAim > 0) && !crash && !ride.turn180 && !cat;
    // (The frame of what holds the human, a skier's own, a horse's saddle's: whose right and ahead, in the scene, the sword cuts to, and
    // the arms turn about.)
    const hq = holder.getWorldQuaternion(new Quaternion());
    const right = new Vector3(-1, 0, 0).applyQuaternion(hq).setY(0).normalize(), ahead = new Vector3(0, 0, 1).applyQuaternion(hq).setY(0).normalize();
    lock.ahead.copy(ahead);
    let target: Vector3;
    if (watching) {
      // The nearest orc to be seen from the muzzle, within the arm's reach (`WATCH_REACH`): ahead, or, for the sword, at either side;
      // none, the gun held on the snow some way ahead, and not fired. One there: fired at, a round a click for those fired so; locked on,
      // for what is fired at it to be rolled.
      const [least, reach] = WATCH_REACH[arm.kind], from = arm.firing === 'swing' ? rider.position : muzzle;
      let best: Vector3 | null = null, most = reach;
      lock.orc = -1;
      for (const m of horde.marks()) {
        const at = m.at, d = at.clone().sub(from), far = d.length();
        if (far < least || far > most || (arm.firing !== 'swing' && (d.x * go.x + d.z * go.z) / far < 0.35)) continue;
        if (arm.firing !== 'swing' && snowAlong(muzzle, at.clone().sub(muzzle).normalize(), at.distanceTo(muzzle)) < at.distanceTo(muzzle) - 1) continue;
        best = at; most = far; lock.orc = m.orc;
      }
      target = best ?? rider.position.clone().addScaledVector(go, 30).setY(ground(rider.position.x + go.x * 30, rider.position.z + go.z * 30));
      firing = !!best;
      if (best && (arm.firing === 'single' || arm.firing === 'swing')) pulls = 1;
      // (The showcase's flamethrower poured all the while it is carried (asked: "the flame thrower section is too lame as of now"): with
      // no orc in reach, swept to and fro across the snow some way ahead, and leaving it burning.)
      if (!best && demoKind === 'show' && arm.firing === 'stream') {
        const sweep = Math.sin(t * 1.7) * 0.55, way = go.clone().applyAxisAngle(UP, sweep), p = rider.position.clone().addScaledVector(way, 16);
        target = p.setY(ground(p.x, p.z) + 0.5);
        firing = true;
      }
    } else if (rolling()) {
      // The arms aiming themselves: at the foe locked on (`relock`), its middle; none, on foot the way the body faces, riding the snow
      // some way ahead, low.
      relock(arm, going);
      if (lock.orc >= 0) target = horde.middle(lock.orc);
      else if (foot) target = rider.position.clone().addScaledVector(new Vector3(Math.sin(foot.heading), 0, Math.cos(foot.heading)), 8).setY(foot.y + 1.1);
      else { const p = rider.position.clone().addScaledVector(go, 24); target = p.setY(ground(p.x, p.z) + 0.6); }
    } else {
      // What the guide's mark is over (or, by touch, the finger held on the picture, `finger`): the first orc or the snow along the
      // line from the eye through it.
      const reach = aimReach(), x = aim.on ? aim.x : ask.x, y = aim.on ? aim.y : ask.y;
      ndc.set((x * reach) / (innerWidth / 2), (y * reach) / (innerHeight / 2));
      // (On foot, seen from above: the pointer, or the finger, where it is over the picture.)
      if (foot) ndc.copy(fingerAims() ? new Vector2(finger.x, finger.y) : footPad.ndc);
      else if (fingerAims()) {
        // (A finger low on the picture, below where the snow some way ahead of the skier is in it, taken as that high: it was over snow
        // beside or behind the skier, which the gun cannot be turned down or round to, and fired ahead whatever side it was on. So it
        // aims across the picture, its side kept, at the run ahead.)
        const ahead = rider.position.clone().addScaledVector(go, 18).addScaledVector(UP, 1).project(camera);
        ndc.set(finger.x, Math.max(finger.y, ahead.z < 1 ? ahead.y : -1));
        // (An orc within some forty-five points of the finger aimed at itself, the nearest to it; only one before the eye, as one behind
        // it is put on the picture turned about.)
        let near = 45 * 45;
        for (const p of horde.aims()) {
          const at = p;
          if (at.clone().applyMatrix4(camera.matrixWorldInverse).z > -1) continue;
          const s = at.project(camera), dx = (s.x - finger.x) * canvas.clientWidth / 2, dy = (s.y - finger.y) * canvas.clientHeight / 2;
          if (dx * dx + dy * dy < near) { near = dx * dx + dy * dy; ndc.set(s.x, s.y); }
        }
      }
      ray.setFromCamera(ndc, camera);
      const eye = ray.ray.origin, look = ray.ray.direction;
      // (On foot, seen from above, the eye is out over the snow: what it points at is on the floor it stands on, through all that is cut away.)
      let far = foot ? (look.y < -1e-3 ? (foot.y + 0.05 - eye.y) / look.y : 60) : Math.min(600, snowAlong(eye, look, 600));
      const met = horde.hit(eye, look, far);
      if (met) far = met.t;
      target = eye.clone().addScaledVector(look, far);
      // (Fired the way it is aimed, not at the very point (asked: "make the guns fire to the direction of the aim, not exactly to the
      // aim. Now when i try to shoot enemies close to me, the player shoots at the ground, not their direction"): a foe pointed at, at
      // its middle, not where the line from the eye first touched it, its feet as often as not, seen from above; on foot, one standing
      // within a stride of the floor pointed to as well; and the floor pointed to and none there, at chest height over it, so that what
      // is fired goes level across the room.)
      let foe: Vector3 | null = met ? horde.middle(met.orc) : null;
      // (On foot by touch, no finger on the picture: ahead, the way it faces (asked: "something is also causing the aiming to flicker
      // superfast when i enter a camp and dungeon, on iphone 15 chrome"). With no pointer the aim had stayed where the picture's middle
      // is, which seen from above is the one on foot itself, and the gun turned to and fro about it every frame.)
      const faces = foot ? new Vector3(Math.sin(foot.heading), 0, Math.cos(foot.heading)) : null;
      if (foot && faces && !fingerAims() && !document.body.classList.contains('mouse')) { target = rider.position.clone().addScaledVector(faces, 8); target.y = foot.y + 1.1; foe = null; }
      if (foot && !foe) {
        let near = 1.6;
        for (const p of horde.aims()) { const d = Math.hypot(p.x - target.x, p.z - target.z); if (d < near) { near = d; foe = p; } }
      }
      if (foe) target = foe.clone();
      else if (foot) target.y = Math.max(target.y, foot.y + 1.1);
      // (Aimed nearer than three metres: on along the same way from the muzzle, thirty metres; it had been on along the line from the eye,
      // which from behind, from beside or from above looks down at the skier, and fired into the snow, or the floor, at its feet.)
      if (target.distanceTo(muzzle) < 3) {
        // (On foot, the way from its body, which the gun turning does not move, level; or, pointed at itself, the way it faces: from the
        // muzzle, which moves as the gun turns to it, the way had turned round with the gun from frame to frame.)
        const body = foot ? target.clone().sub(rider.position).setY(0) : null;
        const way = body ? (body.lengthSq() > 0.36 ? body : faces!.clone()) : target.clone().sub(muzzle);
        if (foot || way.lengthSq() < 0.04) way.y = Math.max(way.y, -0.1 * Math.hypot(way.x, way.z));
        target = muzzle.clone().addScaledVector(way.lengthSq() > 1e-4 ? way.normalize() : go.clone(), 30);
      }
      // (By touch, a finger held low on the picture is over snow between the eye and the skier, or under it, which the gun cannot be
      // turned to, and it fired somewhere else altogether: then it fires at the snow some way ahead the way the finger points, as near
      // to it across the run as the arms let the gun turn.)
      // (Only behind the skier, where the gun cannot be turned (asked: "now on ipad some times it fires to where clicked but seems like
      // something is pulling the gun direction and often it just fires forward"): it had fired so at any snow within twelve metres ahead
      // too, and turned by the way the eye looks, nearly straight ahead from behind the skier, not by where the snow touched lies; on an
      // iPad, which shows more of the snow near the skier than a phone held sideways, at most of what was touched.)
      if (fingerAims() && !met && !foot) {
        const rel = target.clone().sub(rider.position).setY(0);
        if (rel.x * go.x + rel.z * go.z < 1.5) {
          const level = rel.lengthSq() > 1e-4 ? rel : go.clone();
          const off = clamp(Math.atan2(go.x * level.z - go.z * level.x, go.x * level.x + go.z * level.z), -0.9, 0.9);
          const way = go.clone().applyAxisAngle(UP, -off).setY(0).normalize(), p = rider.position.clone().addScaledVector(way, 16);
          target = p.setY(ground(p.x, p.z) + 0.3);
        }
      }
    }
 // The gun turned to it from the muzzle, as far round as the arms let it.
    aimedAt.copy(target);
    showFight(watching ? null : arm);
    const d = target.sub(muzzle).normalize().applyQuaternion(hq.clone().invert());
    let yaw = clamp(Math.atan2(d.x, d.z), -1.3, 1.3), pitch = clamp(Math.asin(clamp(d.y, -1, 1)), -0.85, 0.55);
    // (Aimed at no number, held straight ahead: posed so, the arms and the body over the hips went to no number for good, and were not
    // drawn.)
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) {
      if (performance.now() - poseSaidAt > 5000) { poseSaidAt = performance.now(); noteProblem(`the arms' aim went to no number (${arm.kind}${lock.orc >= 0 ? ', locked on' : ''}${foot ? ', on foot' : ''}${air ? ', in the air' : ''})`); }
      yaw = 0; pitch = 0;
    }
    // (On foot the floor is level, and the gun with it: tipped down no more than it takes to reach a foe fallen low, nor up much.)
    if (foot && arm.firing !== 'swing') pitch = clamp(pitch, -0.3, 0.35);
    // (The sword, ready, held out towards what is aimed at, its point down; swung, at one side and then the other, `Rider.slash`, its
    // sweep drawn behind it as it cuts.)
    if (arm.firing === 'swing') pitch = Math.min(pitch, -0.3);
    d.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    // (The pistol held out at arm's length along the aim, `Rider.point`, the arms thrown up a little by each shot, after it has gone,
    // and coming down again.)
    const flung = arm.out && holding ? d.clone().addScaledVector(Y, 0.22 * kick).normalize() : d;
    const held = swing && holding ? human.slash(swing.k, swing.side, d, arm.fore) : arm.out && holding ? human.point(flung) : human.hold(holding ? d : null, arm.fore, arm.stance);
    model.position.copy(held.grip).addScaledVector(held.dir, -0.02 * kick * arm.kick);
    model.quaternion.setFromRotationMatrix(toLook.lookAt(held.dir, ZERO, Y)).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.09 * kick * arm.kick));
    if (swing && holding && going > 0) {
      const k = swing.k;
      if (k > SLASH_MARKS.up - 0.04 && k < SLASH_MARKS.through + 0.06) { model.updateMatrixWorld(true); sweep.add(model.localToWorld(new Vector3(0, 0, 0.25)), model.localToWorld(arm.muzzle.clone()), 1 + swing.charge); }
      sweep.redden(swing.blood);
    }
    // (The force gathered in a held cut, a ring filling about the guide's mark.)
    const charging = swing?.held && swing.k >= SLASH_MARKS.up ? Math.round(swing.charge * 50) / 50 : -1;
    if (charging !== shownCharge) { shownCharge = charging; aimEl.style.setProperty('--charge', String(Math.max(0, charging))); attackEl.style.setProperty('--charge', String(Math.max(0, charging))); aimEl.classList.toggle('charging', charging >= 0); aimEl.classList.toggle('charged', charging >= 1); }
    // Fired on the snow, each arm as it is fired: the tommy gun while the button is held (or an orc is in its sights, watching), the
    // first round as it is pressed; the pistol and the shotgun a round, or a blast, a click; the flamethrower pouring fire while held;
    // the lightning gun a bolt every third of a second while held; the sword a swing a click.
    ready = Math.max(0, ready - going);
    if (going > 0 && holding) {
      if (arm.firing === 'auto') { if (firing) for (shotClock += going; shotClock >= arm.every; shotClock -= arm.every) shoot(); }
      else if (arm.firing === 'single') { if (pulls && ready <= 0) { pulls = 0; ready = arm.every; fireOnce(arm); } }
      else if (arm.firing === 'stream') { if (firing) pourFire(arm, going); }
      else if (arm.firing === 'bolt') { if (firing && ready <= 0) { ready = arm.every; zap(arm); } }
      else if (pulls && ready <= 0 && !swing) {
        pulls = 0; ready = arm.every;
        // (Watching, never held: the demo's rider cuts at once.)
        swing = newSwing(slashSide(right, go.clone().multiplyScalar(now.speed)), !watching && firing);
      }
    }
    if (arm.firing !== 'single' && arm.firing !== 'swing') pulls = 0;
    swingOn(going, right, ahead, go.clone().multiplyScalar(now.speed));
    kick *= Math.exp(-dt * 18);
    gunfire.step(going, camera.quaternion);
    flames.step(going, camera.quaternion);
    bolts.step(going, camera.quaternion);
    sparks.step(going); zapSparks.step(going);
    // (The lightning gun held firing: small arcs crackling about its mouth between bolts.)
    if (arm.kind === 'lightning' && holding && firing && going > 0 && gunRng.chance(going * 14)) bolts.crackle(muzzle, 0.13, 0.12);
    sweep.step(going);
    rockets.step(going, camera.quaternion, rocketStrikes, boomAt, (at, v) => flames.trail(at, v));
    boomClock += going;
    for (const b of booms) {
      if (!b.until) continue;
      if (boomClock > b.until) { b.blast.hide(); b.until = 0; } else b.blast.step(going, camera, ground);
    }
    // (Orcs that walk into fire left burning on the snow, burnt.)
    if (going > 0) for (const f of [...flames.pools]) for (const o of horde.near(f.p, f.r + 1)) if (o.at.distanceTo(f.p) < f.r + 0.7) burnDown(o.orc, o.at, ZERO, going * 6);
    splatter.step(going);
    const v = !watching && air ? air.v.clone() : go.clone().multiplyScalar(now.speed);
    // (Any downed as the orcs come on, the skier ran down: the rounds' are counted as they strike.)
    const cave = caveNow();
    let ranDown: { at: Vector3; kind: FoeKind }[] = [];
    if (foot && cave) horde.within(going, den(cave), { at: rider.position, down: now.down, left: now.left, v, reach: 0.9 }, struck);
    else ranDown = horde.update(going, { ground, at: land.at, edges: land.edges, length: land.length }, { at: rider.position, down: now.down, left: now.left, v, reach: who === 'person' ? 0.9 : 1.5 });
    for (const r of ranDown) orcDowned(rider.position.clone().addScaledVector(UP, 1.6), 'run', r.kind);
    wardStep(going, !watching);
    showBosses(horde.bosses(rider.position));
    arenaOn(going);
    launchStep(going);
    say($('orcs'), String(horde.downed));
    // (Riding, what is carried: how many more until the next, the bar beside the picture says.)
    say($('armSay'), watching ? '' : ` · ${arm.name}`);
  };

  // The view, following the skier. It keeps pace with the skier exactly down the slope, and eases only what the view does about it: how
  // far across the slope it follows (so that the turns swing the skier across the picture rather than swinging the view), which way it
  // looks along, and the change from one view to another. (Eased whole, the view had trailed the skier by its speed over the easing's
  // rate, twice over: some twelve metres at speed, so that from beside and above the skier ran ahead of the picture.) Riding, behind
  // and above look most of the way along the way it goes.
  let placed = false, distance = 1;
  const eyeOff = new Vector3(), lookOff = new Vector3(), lastRider = new Vector3(), ahead = new Vector3(0, 0, 1);
  /**
   * The isometric view riding: how far off it is (further than on foot, for the speed), and which way it looks across the land, level:
   * down the run turned forty-five degrees to the skier's left, as the cave's view is turned across its lattice.
   */
  const ISO_RIDE = { far: 30 };
  const isoWay = (down: Vector3, aside: Vector3) => down.clone().multiplyScalar(Math.SQRT1_2).addScaledVector(aside, Math.SQRT1_2).setY(0).normalize();
  const isoTurn = new Vector3(0, 0, 1);
  /** How hard the view is jolted by a blow of the sword struck home, dying away (`swingOn`); the charge last shown about the guide's mark. */
  let bladeJolt = 0, shownCharge = -1;
  /** What the free view is held looking at, for a picture of what is not the skier (`__slope.lookAt`); none, the skier. */
  let heldLook: Vector3 | null = null;
  let across = 0;
  /** Where the view is about: the skier's feet, or, gone limp, the snow under its hips. */
  // (Not swung round in a circle with a barrel roll's feet, the view following it swung about with them: `rollShift`.)
  const focus = () => { if (!crash) return rider.position.clone().sub(rollShift); const p = fallenAt(); return p.setY(ground(p.x, p.z)); };
  /** A point on the snow, or so far over it. */
  const over = (p: Vector3, up: number) => p.setY(ground(p.x, p.z) + up);
  /** Which way the skier goes, level, eased: what the beside view leaves room ahead of and the cinematic shots look along. */
  const travel = new Vector3(0, 0, 1);

  // ---------------------------------------------------------------- on foot, at the cave
  /** How fast one goes on foot, walking and running (a horse a little faster, trotting), backwards; how quickly it turns; how broad it is. */
  const FOOT = { walk: 1.9, run: 4.4, horseWalk: 2.0, horseRun: 4.2, back: 1.4, turn: 3.2, person: 0.35, horse: 0.62 };
  /** Whether one on foot walks as a person: the skier, or the rider got down off its horse (the horse alone walks as a horse). */
  const walks = () => who !== 'horse';
  /** Into the cave's camp, riding: braked to a stop, and the skis off. Out of it on foot: the skis on again, and away. */
  const stepCamp = () => {
    const cave = caveNow();
    // (Driving the rocket cart back up the run into the camp: the cart left there, gone, the run the right way about again, and the
    // skis off, to go on into the cave on foot or to ride on down from there.)
    if (cave && carting && !foot && mode === 'ride' && !air && !crash && !cat) {
      const p = toCave(ride);
      if (cave.inCamp(p.x, p.z)) {
        const go = along(ride.way, here);
        unflip();
        here = land.frame(ride.x, ride.z);
        ride.down = here.s; ride.left = here.left;
        ride.way = Math.atan2(go.dot(runLeft(here)), go.dot(runDir(here)));
        ride.facing = skier.facing * ride.way; ride.ended = false;
        placeKickers(ride.down);
        if (!walks() || walkerNow()) skisOff();
        tell('The camp', 'the cart left behind: on foot into the cave, or out of the camp and on down', false, 3.5);
      }
      return;
    }
    if (!cave || foot || mode !== 'ride' || air || crash || cat || carting || inside || flyingDemo || trip?.started) { stopping = false; return; }
    // (Braking from as far back as it takes to stop in the camp, if the way it goes leads into it: not riding on past beside it.)
    const p = toCave(ride), was = stopping, go = along(ride.way, here), reach = 3 + ride.speed ** 2 / 14;
    // (Aimed a few metres inside its edge, and kept up once begun, near it: so that it stops in it, not short of it.)
    stopping = cave.inCamp(p.x, p.z) || (was && cave.inCamp(p.x, p.z, 3));
    for (let d = 1; d <= reach && !stopping; d += 1) stopping = cave.inCamp(p.x + go.x * d, p.z + go.z * d, -3);
    if (stopping && !was) tell('The camp', 'skis off here, and on foot into the cave', false, 2.5);
    if (stopping && ride.speed < 1.4 && cave.inCamp(p.x, p.z, 0.8) && (!walks() || walkerNow())) skisOff();
  };
  /** The skis taken off where the skier has stopped, and left on the rack by the fire. */
  const skisOff = () => {
    const cave = caveNow()!, go = along(ride.way, here);
    stopping = false;
    foot = { x: ride.x, y: ride.y, z: ride.z, heading: Math.atan2(go.x, go.z), speed: 0, dx: go.x, dz: go.z, turn: 0, phase: 0, room: -1, told: false };
    footPad.walk = false; footPad.to = null;
    Object.assign(ride, { speed: 0, brake: 0, tuck: 0, tall: 0, skating: false, skate: 0, turn180: null, switch: false, back: 0 });
    // (Its rider off the horse, the horse left standing by the rack, and the rider on foot.)
    if (who === 'mounted') parkHorse(cave);
    // (The person's skis off its feet; the rider down from the saddle, on its own feet where the horse stood.)
    if (who === 'person') for (const s of personSkis) s.visible = false;
    if (who === 'mounted') { jockey.model.position.set(0, 0, 0); jockey.model.quaternion.identity(); rider.add(jockey.model); }
    // (The orcs on the run gone: those of the dungeon come in it, `Horde.within`.)
    horde.clear();
    cave.rackSkis(who === 'person' ? 'person' : horse.skis, who === 'person' ? 1.18 : who === 'mounted' ? 2.3 : 0);
    const mouse = document.body.classList.contains('mouse');
    tell(who === 'mounted' ? 'Down off the horse' : 'Skis off', mouse ? 'W A S D to go, the mouse to aim, click to attack; right click to walk to a spot; Shift to walk' : 'the stick to go; tap to attack there, or to walk there', false, 3.5);
    placed = false;
  };
  /**
   * The horse left by the rack while its rider goes on foot (asked: "if the player is on a horse, we can leave the horse next to the ski
   * rack outside"): out from under the rider, its rider out of the saddle, standing there riderless, its reins hanging.
   */
  const parkHorse = (cave: Cave) => {
    const at = cave.horseSpot, o = land.group.position;
    horse.model.removeFromParent();
    jockey.model.removeFromParent();
    horse.model.position.set(at.x + o.x, land.height(at.x + o.x, at.z + o.z), at.z + o.z);
    horse.model.quaternion.setFromAxisAngle(UP, at.heading);
    scene.add(horse.model);
    horse.setReins(null);
    cave.parkHorse(true);
  };
  /** On foot no more, quietly: the skier back as it was on its skis (the rider back in the saddle), the rack bare. */
  const leaveFoot = () => {
    if (!foot) return;
    const c = caveNow();
    if (c) underground(c, false, false, 0);
    foot = null; stopping = false;
    if (who === 'person') for (const s of personSkis) s.visible = true;
    horde.clear();
    if (who === 'mounted') { caveNow()?.parkHorse(false); horse.model.position.set(0, 0, 0); horse.model.quaternion.identity(); rider.add(horse.model); seat(); }
    caveNow()?.rackSkis(null, 0);
    placed = false;
  };
  /** The skis on again where it has walked out of the camp, and on down the run the way it was walking, pushing off. */
  const skisOn = () => {
    const f = foot!;
    leaveFoot();
    ride.x = f.x; ride.z = f.z;
    here = land.frame(f.x, f.z, ride.down);
    ride.down = here.s; ride.left = here.left;
    ride.y = ground(f.x, f.z);
    const dir = new Vector3(Math.sin(f.heading), 0, Math.cos(f.heading));
    ride.way = Math.atan2(dir.dot(runLeft(here)), dir.dot(runDir(here)));
    ride.facing = chestTo(ride.way);
    ride.speed = 2.5; ride.vy = risingHere();
    pushOff();
    tell('Skis on', 'and away', false, 1.8);
  };
  /**
   * On foot, what the mouse asks, apart from how riding is steered (asked: "we need to have totally separate from the with skis on
   * control scheme for the on foot movement"): where it is over the picture; whether a button is held to walk to where it points; a
   * spot to walk to (clicked, or tapped); and until when what was attacked is faced.
   */
  const footPad = { ndc: new Vector2(), walk: false, to: null as Vector3 | null, facing: 0 };
  /** Where on the floor one on foot stands on a point of the picture (`ndc`) is over. */
  const footGround = (at: Vector2): Vector3 | null => {
    if (!foot) return null;
    const rc = new Raycaster();
    rc.setFromCamera(at, camera);
    const o = rc.ray.origin, d = rc.ray.direction;
    if (d.y > -1e-3) return null;
    return o.clone().addScaledVector(d, (foot.y + 0.05 - o.y) / d.y);
  };
  /** Where what is carried is aimed on foot: the floor (or an orc) under the finger on the picture, or the pointer. */
  // (The arms aiming themselves, the foe locked on.)
  const footAim = () => (rolling() && lock.orc >= 0 && horde.coming(lock.orc) ? horde.middle(lock.orc) : footGround(fingerAims() ? new Vector2(finger.x, finger.y) : footPad.ndc));
  /** The pointer over the picture, on foot: where it is kept, a cross over the picture. Gives back whether it was taken so. */
  const footMouse = (e: PointerEvent) => {
    if (!foot || mode !== 'ride' || menuOpen || e.pointerType !== 'mouse') return false;
    const r = canvas.getBoundingClientRect();
    footPad.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    canvas.style.cursor = 'crosshair';
    return true;
  };
  /** The way the view from above looks across the land, level: across the cave's lattice at forty-five degrees, as such views are. */
  const isoYaw = () => { const cave = caveNow(); return cave ? Math.atan2(cave.site.ax, cave.site.az) + Math.PI / 4 : 0; };
  /**
   * On foot a moment on (asked, of the view from above: "with similar controls"): W A S D (or the arrows, the stick, the tilt) go up,
   * down, left and right across the picture, running (Shift, walking); or a click (with nothing carried, or the right button whatever is
   * carried) walks to the floor clicked on, held, after the pointer; a tap the same, by touch. It faces where it goes, and while it
   * attacks, what it attacks; it goes backwards or sideways as it must, the walk turned to suit. Kept off the walls and what stands about
   * (`Cave.walk`), on the floor where it is (the tunnel's, the stairs'). Out of the camp, the skis back on; into a room, what it is said;
   * at the chest, opened.
   */
  const stepFoot = (dt: number): Now => {
    const f = foot!, cave = caveNow()!, person = walks(), o = land.group.position, k = want.keys;
    let sx = (k.right ? 1 : 0) - (k.left ? 1 : 0), sy = (k.up ? 1 : 0) - (k.down ? 1 : 0);
    if (!sx && !sy) { const by = stickHeld !== null ? stick : tilting() ? tilt : null; if (by) { sx = Math.abs(by.x) > 0.12 ? by.x : 0; sy = Math.abs(by.y) > 0.12 ? by.y : 0; } }
    const yaw = isoYaw(), up = new Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const move = up.multiplyScalar(sy).addScaledVector(right, sx);
    if (footPad.walk) { const g = footGround(footPad.ndc); if (g) footPad.to = g; }
    if (move.lengthSq() > 0.01) footPad.to = null;
    else if (footPad.to) { const d = new Vector3(footPad.to.x - f.x, 0, footPad.to.z - f.z), l = d.length(); if (l < 0.3) footPad.to = null; else move.copy(d.divideScalar(l)); }
    const amount = Math.min(1, move.length());
    if (amount > 1e-3) { move.normalize(); f.dx = move.x; f.dz = move.z; }
    const top = want.brakeKey ? (person ? FOOT.walk : FOOT.horseWalk) : person ? FOOT.run : FOOT.horseRun, goal = amount * top;
    f.speed += (goal - f.speed) * ease(dt, goal > f.speed ? 10 : 14);
    // (Facing what it attacks while it attacks; else the way it goes.)
    const attacking = firing || performance.now() < footPad.facing || fingerAims();
    let face = f.heading;
    if (attacking) { const g = footAim(); if (g && Math.hypot(g.x - f.x, g.z - f.z) > 0.3) face = Math.atan2(g.x - f.x, g.z - f.z); } else if (amount > 0.05) face = Math.atan2(move.x, move.z);
    const was = f.heading;
    f.heading = wrapAngle(f.heading + clamp(wrapAngle(face - f.heading), -14 * dt, 14 * dt));
    f.turn += ((dt > 0 ? wrapAngle(f.heading - was) / dt / 3 : 0) - f.turn) * ease(dt, 8);
    const r = person ? FOOT.person : FOOT.horse;
    const [nx, nz] = cave.walk(f.x - o.x, f.z - o.z, f.x - o.x + f.dx * f.speed * dt, f.z - o.z + f.dz * f.speed * dt, r);
    f.x = nx + o.x; f.z = nz + o.z;
    const floor = cave.floorUnder(nx, nz) ?? land.height(f.x, f.z);
    f.y = Math.abs(floor - f.y) > 1 ? floor : f.y + (floor - f.y) * ease(dt, 18);
    // (Its body: the person by the clips, the horse by its gait, going forward or back as the way it goes lies to the way it faces.)
    const ahead = f.speed * (f.dx * Math.sin(f.heading) + f.dz * Math.cos(f.heading));
    if (person) walkerNow()?.update(dt, Math.abs(ahead) < 0.3 * f.speed ? f.speed : ahead);
    else {
      f.phase = (f.phase + horseCadence(ahead) * dt) % 1;
      horse.pose(horseWalk(f.phase, ahead, f.turn, ride.time));
    }
    // (The horse left by the rack standing easy, its tail swishing.)
    if (who === 'mounted') horse.pose(horseWalk(0, 0, 0, ride.time));
    rider.position.set(f.x, f.y, f.z);
    rider.quaternion.setFromAxisAngle(UP, f.heading);
    rider.updateMatrixWorld(true);
    ride.x = f.x; ride.y = f.y; ride.z = f.z; ride.time += dt;
    here = land.frame(f.x, f.z, ride.down);
    ride.down = here.s; ride.left = here.left;
    // (Where it is, said: the place named as it comes in at the gate, and each room as it comes into it; the chest opened.)
    const room = cave.roomAt(nx, nz);
    if (room && room.i !== f.room) {
      f.room = room.i;
      if (!f.told) { f.told = true; tell(cave.title.name, `${cave.title.about}. ${room.note}`, false, 4.5); } else tell(room.note, '', false, 3);
    }
    const chest = cave.chest.at;
    if (!cave.chest.opened && Math.hypot(nx - chest.x, nz - chest.z) < 1.7 && Math.abs(f.y - chest.y) < 1.5) {
      cave.openChest();
      addScore(5000);
      const s = overPictureAt(new Vector3(chest.x + o.x, chest.y + 1, chest.z + o.z));
      if (s) popUp(s, '+5,000', 'trick', 'treasure');
      tell('Treasure!', `the gold of ${cave.title.name.replace(/^The [A-Za-z]+ of /, '')} · 5,000 points`, false, 4);
      // (And something more in it: `slopeLoot.ts`.)
      findLoot('chest', new Vector3(chest.x + o.x, chest.y + 0.6, chest.z + o.z), `found in ${cave.title.name.replace(/^The /, 'the ')}`, chest.y);
    }
    if (!cave.inCamp(nx, nz, 1.2) && !cave.inside(nx, nz)) skisOn();
    // (Its way against the run's, as riding has it, for what it carries to be aimed from.)
    const dir = new Vector3(Math.sin(f.heading), 0, Math.cos(f.heading)), way = Math.atan2(dir.dot(runLeft(here)), dir.dot(runDir(here)));
    return { down: here.s, left: here.left, speed: Math.abs(f.speed), way, ski: way, skid: 0, tuck: 0, brake: 0 };
  };
  /**
   * The view on foot, from above (asked: "Lets have the view top down / isometric like minecraft dungeons or diablo 4 etc."): high
   * over the one on foot and back from it, looking down at it at fifty-six degrees across the cave's lattice at forty-five, drawn narrow
   * so that it is nearly as a plan is; following it a little behind; as far off as *Distance* says (or the wheel). Swung there from the
   * view riding was in over the first moments; inside, the cave cut away over a height above its floors (`Cave.overhead`).
   */
  const ISO = { pitch: deg(56), far: 18, fov: 38, swing: 0.9 };
  const iso = { at: new Vector3(), from: new Vector3(), turn: new Quaternion(), since: Infinity };
  const placeIsoView = (dt: number) => {
    const f = foot!, yaw = isoYaw(), d = ISO.far * distance, target = new Vector3(f.x, f.y + 1, f.z);
    if (!placed) { iso.at.copy(target); iso.from.copy(camera.position); iso.turn.copy(camera.quaternion); iso.since = 0; }
    iso.at.lerp(target, ease(dt, 9));
    iso.since += dt;
    const eye = iso.at.clone().addScaledVector(new Vector3(Math.sin(yaw), 0, Math.cos(yaw)), -d * Math.cos(ISO.pitch)).addScaledVector(UP, d * Math.sin(ISO.pitch));
    camera.up.set(0, 1, 0);
    camera.position.copy(eye);
    camera.lookAt(iso.at);
    // (Swung from the view it rode in, as it takes its skis off.)
    const k = smooth(iso.since / ISO.swing);
    if (k < 1) { camera.position.lerpVectors(iso.from, eye, k); camera.quaternion.slerpQuaternions(iso.turn, camera.quaternion.clone(), k); }
    // (A blow struck home, or a great one's struck on it, felt: the view jolted a moment.)
    bladeJolt *= Math.exp(-dt * 14);
    if (bladeJolt > 0.003) { const w = performance.now() / 1000, j = 0.12 * bladeJolt; camera.position.add(new Vector3(Math.sin(w * 71) * j, Math.sin(w * 89 + 1) * j * 0.7, Math.sin(w * 67 + 2) * j)); }
    const fov = FOV + (ISO.fov - FOV) * k;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fovNow = fov; camera.updateProjectionMatrix(); }
    lastRider.copy(target);
    placed = true;
    sun.position.copy(target).addScaledVector(sunFrom, 50);
    sun.target.position.copy(target);
  };
  /** On foot or not, shown: the guide's and the stick's up and down said as walking and stepping back, and the skis' own buttons put away. */
  let footShown = false;
  const showFoot = () => {
    const on = !!foot && mode === 'ride';
    if (on === footShown) return;
    footShown = on;
    document.body.classList.toggle('onfoot', on);
    for (const el of document.querySelectorAll<HTMLElement>('#aim .say.up, #stick .say.up')) el.textContent = on ? 'Walk' : 'Tuck';
    for (const el of document.querySelectorAll<HTMLElement>('#aim .say.down, #stick .say.down')) el.textContent = on ? 'Back' : 'Straight';
  };
  /**
   * Under the snow on foot, seen from above: the cave cut away over its floors (`Cave.overhead`); the snow over it and all that lies on
   * the snow (the land, the woods, the poles, the kickers, the tracks) not drawn, and the sky behind it all gone dark, as a dungeon is
   * drawn from above in the dark. Back out, all as it was. And just inside, in the tunnel where only the mound lies over it (`shallow`;
   * asked: "when player just inside the dungeon or coming out, the outdoor camp and snow can be shown"): the cave cut away as inside,
   * the mound with it, but the land about, the camp and the snow still drawn, and the sky as it is, through the hole the land has for
   * the tunnel.
   */
  let under = false;
  const underground = (cave: Cave, on: boolean, shallow: boolean, floor: number) => {
    cave.overhead(!!foot && mode === 'ride', on, floor);
    const dark = on && !shallow;
    uUnder.value = dark ? 1 : 0;
    if (dark === under) return;
    under = dark;
    for (const c of cave.group.parent?.children ?? []) if (c !== cave.group) c.visible = !dark;
    for (const k of kicks) if (k.group) k.group.visible = !dark;
    for (const m of watchTracks) m.visible = !dark && ((m.geometry.drawRange.count ?? 0) > 0);
  };
  /** How far into the cave's dark the eye is (0 to 1): the sun and the sky dimmed by as much, and the picture drawn brighter. */
  let caveDark = 0;
  const stepCave = (dt: number, seconds: number) => {
    const cave = caveNow();
    if (!cave) { caveDark = 0; uUnder.value = 0; under = false; caveLights.lantern.intensity = caveLights.fire.intensity = 0; return; }
    const o = land.group.position, eye = camera.position.clone().sub(o), at = foot ? new Vector3(foot.x - o.x, foot.y, foot.z - o.z) : null;
    // (On foot the view is from above, out in the air over the snow: how dark it is, is how dark it is where the one on foot is.)
    caveDark = cave.darkness(at && mode === 'ride' ? at : eye);
    const into = !!at && mode === 'ride' && cave.inside(at.x, at.z);
    underground(cave, into, into && cave.shallow(at!.x, at!.z), at ? at.y : 0);
    const ahead = foot ? new Vector3(Math.sin(foot.heading), 0, Math.cos(foot.heading)) : undefined;
    cave.update(dt, seconds, eye, at, at ? Math.max(0.15 * smooth(1 - cave.fireSpot.distanceTo(at) / 12), cave.darkness(at)) : 0, ahead);
  };

  // ---------------------------------------------------------------- the cinematic camera
  /**
   * The cinematic view (asked: "add a cinematic camera mode"; and that it be the view the page opens in): shots cut one to the next,
   * as a film of a run is cut. Watching, the demo run is cut into shots once (`shotsOf`), so that it is the same each time and wherever
   * it is moved to: around each jump a shot of it from a camera set down by the kicker (beside the flight, looking up at it; low on the
   * snow past the landing, the skier flying at it; just behind the lip, the skier going away from it; or going round the skier in the
   * air), from a second and a half before the lip to a second after the landing; between them, shots of three and a half to six seconds:
   * following close behind, alongside, ahead looking back as the camera draws in, from a drone high and ahead, or from a camera beside
   * the way that the skier comes past. Riding, the shots are those the rider can steer by (following at several heights and distances),
   * and a jump taken from beside the flight.
   */
  type ShotKind = 'chase' | 'track' | 'ahead' | 'pass' | 'aerial' | 'orbit' | 'side' | 'low' | 'lip';
  /** A shot: what kind, from when to when, to which side, how wide, and where its camera stands if it stands still. */
  interface Shot { kind: ShotKind; t0: number; t1: number; side: number; fov: number; eye?: Vector3; high?: number; far?: number }
  const FOV = 50;
  /** Whether there is a mouse or a touchpad to point with: a computer, not a phone or a tablet. */
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const shotFov: Record<ShotKind, number> = { chase: 50, track: 40, ahead: 34, pass: 42, aerial: 46, orbit: 46, side: 36, low: 30, lip: 50 };
  /** A camera set down at `p` as high over the snow as asked, and raised until nothing of the land stands between it and `to`. */
  const standCamera = (p: Vector3, up: number, to: Vector3) => {
    p.y = Math.max(p.y, ground(p.x, p.z) + up);
    for (let tries = 0; tries < 4; tries++) {
      let worst = -Infinity;
      for (let i = 1; i < 12; i++) { const q = p.clone().lerp(to, i / 12); worst = Math.max(worst, ground(q.x, q.z) + 0.4 - q.y); }
      if (worst <= 0) break;
      p.y += worst + 0.5;
    }
    return p;
  };
  const leftOf = (dir: Vector3) => new Vector3(dir.z, 0, -dir.x);
  const shotCache = new WeakMap<Demo, Shot[]>();
  /** The demo run's shots, worked out once. */
  const shotsOf = (d: Demo): Shot[] => {
    const known = shotCache.get(d);
    if (known) return known;
    const fs = d.frames, last = fs.length - 1, rng = new Rng(`shots ${d.length.toFixed(2)} ${fs.length}`);
    const posAt = (tt: number) => fs[clamp(Math.round(tt / STEP), 0, last)].p.clone();
    const dirAt = (tt: number) => { const v = posAt(tt + 0.4).sub(posAt(tt - 0.4)).setY(0); return v.lengthSq() > 1e-6 ? v.normalize() : new Vector3(0, 0, 1); };
    // The jumps: each time in the air for half a second and more.
    const airs: [number, number][] = [];
    for (let i = 0; i <= last; i++) {
      if (!fs[i].air) continue;
      let j = i;
      while (j < last && fs[j + 1].air) j++;
      if ((j - i) * STEP > 0.5) airs.push([i * STEP, j * STEP]);
      i = j;
    }
    const shots: Shot[] = [];
    const between = ['chase', 'track', 'aerial', 'pass', 'ahead', 'chase', 'pass', 'track'] as const;
    let n = rng.int(0, between.length - 1);
    const fill = (t0: number, t1: number) => {
      while (t1 - t0 > 0.05) {
        let len = rng.range(3.5, 6);
        if (t1 - (t0 + len) < 2.2) len = t1 - t0;
        const kind = between[n++ % between.length], side = rng.chance(0.5) ? 1 : -1, shot: Shot = { kind, t0, t1: t0 + len, side, fov: shotFov[kind] };
        if (kind === 'pass') {
          // (Set down beside the way the skier is to come, so that it comes past near the end of the shot.)
          const tt = t0 + len - 0.7, p = posAt(tt);
          shot.eye = standCamera(p.clone().addScaledVector(leftOf(dirAt(tt)), side * 6.5), 1.1, p.clone().setY(p.y + 0.9));
        }
        if (kind === 'chase') { shot.high = rng.range(1.4, 2.8); shot.far = rng.range(5.5, 8.5); }
        shots.push(shot);
        t0 += len;
      }
    };
    // (Beside the flight and round it in the air show a trick best: they come round most often.)
    const jumps = ['side', 'orbit', 'low', 'side', 'lip', 'orbit'] as const;
    let cursor = 0;
    airs.forEach(([a0, a1], k) => {
      const t0 = Math.max(cursor, a0 - 1.5), t1 = Math.min(d.length, a1 + 1.1);
      fill(cursor, t0);
      const kind = jumps[k % jumps.length], side = rng.chance(0.5) ? 1 : -1, shot: Shot = { kind, t0, t1, side, fov: shotFov[kind] };
      const lip = posAt(a0), down = posAt(a1), mid = posAt((a0 + a1) / 2), dir = down.clone().sub(lip).setY(0).normalize(), left = leftOf(dir);
      if (kind === 'side') shot.eye = standCamera(mid.clone().addScaledVector(left, side * 12).setY(-Infinity), 1.4, mid);
      // (Past the landing and off to the side, high enough to see over the crest the skier comes down past; beside the lip and a little
      // behind it, high enough to see the landing beyond the kicker: from lower, both lost the skier behind the snow.)
      if (kind === 'low') shot.eye = standCamera(down.clone().addScaledVector(dir, 14).addScaledVector(left, side * 6).setY(-Infinity), 1.6, mid);
      if (kind === 'lip') shot.eye = standCamera(lip.clone().addScaledVector(dir, -3).addScaledVector(left, side * 4.5).setY(-Infinity), 2.8, down.clone().setY(down.y + 0.9));
      shots.push(shot);
      cursor = t1;
    });
    fill(cursor, d.length + 1);
    shotCache.set(d, shots);
    return shots;
  };
  /** Riding: the shot now, chosen as it goes. */
  let rideShot: Shot | null = null, rideShotFor: Air | null = null, rideShotsMade = 0;
  const rideShotRng = new Rng('ride shots');
  const rideShots = (): Shot => {
    const T = ride.time, shotRng = rideShotRng.fork(`shot ${rideShotsMade++} ${T.toFixed(2)}`), rng = () => shotRng.next();
    // (A jump, from a camera set down beside its flight as it leaves the lip, where it will be halfway through it.)
    if (air && air.kind !== 'hop' && air.T > 0.6 && rideShotFor !== air) {
      rideShotFor = air;
      const h = air.T / 2, v = air.v, mid = new Vector3(ride.x + v.x * h, ride.y + v.y * h - 0.5 * G * h * h, ride.z + v.z * h);
      const side = rng() < 0.5 ? 1 : -1, dir = v.clone().setY(0).normalize();
      rideShot = { kind: 'side', t0: T, t1: T + air.T + 1.1, side, fov: shotFov.side, eye: standCamera(mid.clone().addScaledVector(leftOf(dir), side * 11).setY(-Infinity), 1.4, mid) };
    }
    if (!rideShot || (T > rideShot.t1 && !air) || T < rideShot.t0) {
      rideShot = { kind: 'chase', t0: T, t1: T + 5 + 3 * rng(), side: rng() < 0.5 ? 1 : -1, fov: shotFov.chase, high: 1.4 + 1.8 * rng(), far: 5.5 + 3.5 * rng() };
    }
    return rideShot;
  };
  /**
   * Jumps in slow motion (asked: "can we add a toggle that enables slow motion cinematic camera during airtime from kicker jumps? then
   * resumes the previous view always"; "this way one could ride isometric but see the jumps nicely"): chosen in the menu, riding,
   * each air off a kicker's lip long enough for a trick (`least` seconds) is seen in the cinematic view, its shot from beside the
   * flight, with time eased down to `scale` of its pace; down on the snow again, landed or fallen, and `hold` seconds on, time eased
   * back to its pace and the view the one ridden in before, whichever it was. (Kept in this browser; `?slowmo=1` or `0`.)
   */
  const SLOWMO = { scale: 0.35, least: 0.6, hold: 0.45, into: 10, out: 5 };
  let slowmoOn = false, timeScale = 1;
  /** The jump being slowed: its air, the view ridden in before it, and how long until that view comes back once down. */
  let slowJump: { air: Air; was: View; after: number } | null = null;
  const slowmoButtons = (['Off', 'On'] as const).map((label, k) => button('slowmoSeg', label, () => setSlowmo(k === 1), k ? 'Riding, each jump off a kicker seen in the cinematic view and in slow motion, then back to the view ridden in' : 'Jumps at their own pace, in the view ridden in'));
  const setSlowmo = (on: boolean) => {
    slowmoOn = on;
    keep('slowmo', on ? '1' : '0');
    slowmoButtons.forEach((b, k) => b.classList.toggle('on', (k === 1) === on));
  };
  /** The view ridden in given back, the jump over (or riding left: then only kept, to be had on riding again). */
  const endSlowmo = () => {
    if (!slowJump) return;
    const was = slowJump.was;
    slowJump = null;
    if (mode !== 'ride') { viewFor.ride = was; return; }
    // (Not if another view was chosen meanwhile.)
    if (view === 'cinema' && was !== 'cinema') setView(was);
  };
  /** A frame on, `held` seconds of it going on riding (none while paused or in the menu): a jump begun, the view given back, time's pace. */
  const stepSlowmo = (held: number) => {
    const may = slowmoOn && mode === 'ride' && !foot && !cat;
    if (may && air && air === kickerAir && air.T > SLOWMO.least && slowJump?.air !== air) {
      // (Another jump straight after the last, before its view came back: the view ridden in kept from the first.)
      slowJump = { air, was: slowJump?.was ?? view, after: SLOWMO.hold };
      if (view !== 'cinema') setView('cinema');
    }
    if (slowJump) {
      if (air !== slowJump.air) slowJump.after -= held;
      if (!may || slowJump.after <= 0) endSlowmo();
    }
    const want = slowJump && air === slowJump.air ? SLOWMO.scale : 1;
    if (held > 0) timeScale += (want - timeScale) * ease(held, want < timeScale ? SLOWMO.into : SLOWMO.out);
    if (Math.abs(timeScale - want) < 0.005 || !slowmoOn || mode !== 'ride') timeScale = want;
  };
  let shotNow: Shot | null = null, fovNow = FOV;
  /** The cinematic view, now: which shot, and where its camera is and what it looks at. */
  const placeCinema = (at: Vector3, dt: number) => {
    const shot = mode === 'watch' ? shotsOf(demo).find((x) => t >= x.t0 && t < x.t1) ?? shotsOf(demo)[0] : rideShots();
    const cut = shot !== shotNow;
    if (cut) { shotNow = shot; placed = false; }
    const tt = mode === 'watch' ? t : ride.time, k = clamp((tt - shot.t0) / Math.max(0.1, shot.t1 - shot.t0), 0, 1);
    const dir = travel.clone(), left = leftOf(dir), look = at.clone().addScaledVector(UP, 0.9), eye = new Vector3();
    let moving = true;
    switch (shot.kind) {
      case 'chase': eye.copy(at).addScaledVector(dir, -(shot.far ?? 7)).addScaledVector(left, shot.side * 1.6).addScaledVector(UP, shot.high ?? 2); look.addScaledVector(dir, 5).addScaledVector(UP, -0.3); break;
      case 'track': eye.copy(at).addScaledVector(left, shot.side * 9).addScaledVector(dir, 2).addScaledVector(UP, 1.4); look.addScaledVector(dir, 3.5); break;
      case 'ahead': eye.copy(at).addScaledVector(dir, 17 - 7 * k).addScaledVector(left, shot.side * 2.5).addScaledVector(UP, 1.1); break;
      case 'aerial': { const a = shot.side * (0.5 + 0.35 * k); eye.copy(at).addScaledVector(dir.clone().applyAxisAngle(UP, a), 15).addScaledVector(UP, 10); look.copy(at).addScaledVector(dir, 4); break; }
      case 'orbit': { const a = shot.side * (0.4 + 1.1 * (tt - shot.t0)); eye.copy(at).addScaledVector(left.clone().applyAxisAngle(UP, a), 8.5).addScaledVector(UP, 1.6); break; }
      default: eye.copy(shot.eye!); moving = false;
    }
    if (moving) {
      standCamera(eye, 0.5, look);
      eyeOff.lerp(eye.sub(at), placed ? ease(dt, 4) : 1);
      camera.position.copy(at).add(eyeOff);
    } else camera.position.copy(eye);
    camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 0.4);
    lookOff.lerp(look.sub(at), placed ? ease(dt, moving ? 6 : 9) : 1);
    camera.lookAt(at.clone().add(lookOff));
    // (Each its own width; a camera standing still draws in on the skier while it is far off, keeping some seven metres of the
    // picture about it, as a cameraman follows focus and zoom; a cut takes it at once, within a shot it eases.)
    const fov = moving ? shot.fov : clamp((2 * Math.atan(3.5 / Math.max(1, camera.position.distanceTo(at))) * 180) / Math.PI, 14, shot.fov);
    fovNow += (fov - fovNow) * (placed ? ease(dt, 2.5) : 1);
    if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
  };

  /**
   * However narrow the picture, the skier kept in it. A view that looks ahead of the skier, for room on the side it is heading to (a
   * camera tracking beside it, the view from beside), was made for a screen held sideways; on a phone held upright the picture is
   * less than half as wide, and the skier fell outside it. So the view is turned back towards the skier until it is no further off the
   * middle than two thirds of the way to the picture's side: on a screen held sideways that is further than any view looks ahead.
   */
  const keepInPicture = (at: Vector3) => {
    // (Where the skier is, seen from the camera: how far to the side of the middle of the picture, and how far above; each held within
    // two thirds of the way to that edge, the camera turned on its own axes by what is over. With the menu open, the picture is what it
    // leaves to be seen, `shiftView`.)
    const half = Math.tan((camera.fov * Math.PI) / 360), v = Math.atan(half * Math.max(0.2, 1 - (2 * shift.y) / innerHeight));
    const h = Math.atan(half * camera.aspect * Math.max(0.2, 1 - (2 * shift.x) / innerWidth));
    const p = at.clone().addScaledVector(UP, 0.9).sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
    const side = Math.atan2(p.x, -p.z), up = Math.atan2(p.y, Math.hypot(p.x, p.z));
    const overSide = side - clamp(side, -0.65 * h, 0.65 * h), overUp = up - clamp(up, -0.65 * v, 0.65 * v);
    if (overSide) camera.rotateY(-overSide);
    if (overUp) camera.rotateX(overUp);
  };
  const placeView = (now: Now, dt: number) => {
    const at = focus(), f = land.at(now.down, 0);
    across += ((mode === 'ride' ? 1 : 0.35) * now.left - across) * (placed ? ease(dt, 3) : 1);
    const p = land.at(now.down, across), follow = new Vector3(p.x, at.y, p.z), down = runDir(f), aside = runLeft(f);
    ahead.lerp(mode === 'ride' ? down.clone().lerp(along(now.way, f), 0.65).normalize() : down, placed ? ease(dt, 2) : 1).setY(0).normalize();
    travel.lerp(along(now.way, f).setY(0).normalize(), placed ? ease(dt, 1.5) : 1).setY(0).normalize();
    // (Riding from behind, a little wider the faster it goes, up to eight degrees at a hundred kilometres an hour: the snow beside
    // streams by further out, and speed is felt. Eased, so that it is not seen to change.)
    if (view !== 'cinema') {
      const wide = view === 'iso' ? ISO.fov : FOV + (mode === 'ride' && view === 'behind' ? 8 * smooth((now.speed - 14) / 16) : 0);
      fovNow = placed ? fovNow + (wide - fovNow) * ease(dt, 1.8) : wide;
      if (Math.abs(camera.fov - fovNow) > 0.01) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
    }
    if (view === 'cinema') placeCinema(at, dt);
    else if (view === 'free') {
      if (!placed) { camera.position.copy(at).addScaledVector(UP, 3 * distance).addScaledVector(aside, 6 * distance).addScaledVector(down, -6 * distance); controls.target.copy(at); }
      else camera.position.add(at.clone().sub(lastRider));
      if (heldLook) controls.target.copy(heldLook); else controls.target.copy(at).addScaledVector(UP, 0.9);
      controls.update();
      // (Not let under the snow: on a world's land the hills about can stand over the skier.)
      camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 0.6);
    } else {
      // (Each kept over the snow where it is: on a world's land the snow behind and beside the skier can lie well above it.)
      const wantAt = new Vector3(), aim = new Vector3();
      // (Each as far off as the *Distance* slider says, from half as far to three times. From behind on a phone held upright, twice as
      // far again (asked: "make the default mobile portrait from behind view 2x farther"): the picture there is narrow, and close
      // behind it showed the skier and little of the run ahead or either side of it.)
      const d = distance * (view === 'behind' && innerHeight > innerWidth && !finePointer ? 2 : 1);
      if (view === 'behind') { over(wantAt.copy(follow).addScaledVector(ahead, -9 * d), 3.4 * d); over(aim.copy(follow).addScaledVector(ahead, 6), 0.6); wantAt.y = Math.max(wantAt.y, at.y + 1.6 * d); }
      // (From the side and a little behind, back far enough to see the slope it is on as well as the skier; looking a little ahead of
      // it the way it goes, eased, so that there is room in the picture on the side it is heading to (asked: "adjust besides camera so
      // that it eases so that there is more visibility to the side the rider is heading to (now the rider is in the sharp center of
      // framing)").)
      else if (view === 'beside') { over(wantAt.copy(follow).addScaledVector(aside, 14 * d).addScaledVector(down, -4 * d), 2.2 * d); wantAt.y = Math.max(wantAt.y, at.y + 0.8 * d); aim.copy(at).addScaledVector(UP, 0.9).addScaledVector(travel, 4.5 * d); }
      // (Isometric, as on foot in the cave (asked: "lets make the isometric view available for skiing as well, as replacement of the above
      // camera"): high and back, looking down at the skier at `ISO.pitch`, from up the run and off to one side at forty-five degrees, drawn
      // narrow so that it is nearly as a plan is; turned only slowly as the run bends, so that the slope does not swing about; a little
      // ahead of the skier, where it goes. It had been from straight above, the view turned after the skier's way.)
      else {
        isoTurn.lerp(isoWay(down, aside), placed ? ease(dt, 0.7) : 1).setY(0).normalize();
        const D = ISO_RIDE.far * d;
        wantAt.copy(at).addScaledVector(isoTurn, -D * Math.cos(ISO.pitch)).setY(at.y + D * Math.sin(ISO.pitch));
        aim.copy(at).addScaledVector(travel, Math.min(6, now.speed * 0.25) * d);
      }
      eyeOff.lerp(wantAt.sub(at), placed ? ease(dt, 5) : 1);
      lookOff.lerp(aim.sub(at), placed ? ease(dt, 6) : 1);
      camera.position.copy(at).add(eyeOff);
      // (Never under the snow, whatever the easing has done.)
      camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 0.6);
      camera.lookAt(at.clone().add(lookOff));
      // (A blow of the sword struck home felt: the view jolted a moment, the more the harder the blow.)
      bladeJolt *= Math.exp(-dt * 14);
      if (bladeJolt > 0.003) {
        const w = performance.now() / 1000, j = 0.09 * bladeJolt;
        camera.position.add(new Vector3(Math.sin(w * 71) * j, Math.sin(w * 89 + 1) * j * 0.7, Math.sin(w * 67 + 2) * j));
        camera.rotateZ(Math.sin(w * 53) * 0.02 * bladeJolt);
      }
    }
    if (view !== 'free') keepInPicture(at);
    lastRider.copy(at);
    placed = true;
    sun.position.copy(at).addScaledVector(sunFrom, 50);
    sun.target.position.copy(at);
  };
  /** How quickly the run's end's view turns to what it looks at, as it begins: slowly at first, so that it turns rather than swings. */
  const turnIn = (c: Catapult) => 0.12 + 0.88 * smooth(c.t / 0.9);
  /**
   * The arm's shots, before it lets go (where the sun's shadows are kept about given back): up the run from what it takes, a little to
   * the far side of it from the arm, the arm reaching over it seen from its side; then round to the side of the throw, far enough off to
   * see the whole arm and what it holds, drawn back and thrown over the top.
   */
  const armShot = (c: Catapult, dt: number) => {
    const a = c.arm!, e = c.eye, T = ARM_T, mid = c.at;
    const both = a.grip.clone().lerp(a.base, 0.5), thrown = new Vector3(Math.sin(a.yaw.throw), 0, Math.cos(a.yaw.throw)), across = thrown.clone().cross(UP);
    const stand = a.grip.clone().addScaledVector(c.downhill, -17).addScaledVector(a.side, -5).addScaledVector(UP, 5.5);
    if (stand.clone().sub(a.base).dot(across) < 0) across.negate();
    const side = a.base.clone().addScaledVector(across, 27).addScaledVector(thrown, -3).addScaledVector(UP, 8);
    const want = stand.clone().lerp(side, smooth((c.t - T.closed + 0.2) / 1.3));
    const target = both.clone().addScaledVector(UP, 4.5).lerp(mid, 0.6 * smooth((c.t - T.over + 0.6) / 1.0));
    target.lerp(a.base.clone().addScaledVector(UP, 8).lerp(mid, 0.45), smooth((c.t - T.closed) / 1.3));
    standCamera(want, 2, target);
    e.at.copy(e.start).lerp(want, smooth(c.t / 1.3));
    e.look.lerp(target, ease(dt, c.t > T.drawn ? 11 : 5) * turnIn(c));
    camera.position.copy(e.at);
    return both;
  };
  /**
   * The whirlwind's shots, before it throws (where the sun's shadows are kept about given back): off to the side of its way and a little
   * beyond what it comes for, low, looking past it to the funnel coming at it, the whole height of it; then, as it takes it up, drawn
   * back and up with it, looking up the funnel to as high as it has carried it, and a little toward it.
   */
  const whirlShot = (c: Catapult, dt: number) => {
    const w = c.whirl!, e = c.eye, mid = c.at, way = w.to.clone().sub(w.from).setY(0);
    if (way.lengthSq() < 1) way.copy(c.downhill);
    way.normalize();
    const aside = way.clone().cross(UP).multiplyScalar(w.side), high = mid.y - w.to.y;
    const stand = w.to.clone().addScaledVector(aside, 40).addScaledVector(way, 10).addScaledVector(UP, 4);
    const coming = w.to.clone().addScaledVector(UP, 3).lerp(whirl.base.clone().addScaledVector(UP, whirl.height() * 0.3), 0.45);
    const back = w.to.clone().addScaledVector(aside, 58).addScaledVector(way, 14).addScaledVector(UP, 6 + 0.6 * high);
    const up = whirl.axisAt(high).lerp(mid, 0.6), k = smooth((c.t - c.takes + 0.2) / 1.8);
    const want = stand.lerp(back, k), target = coming.lerp(up, k);
    // (Raised until it sees what is taken, not only what it looks at: fallen on a mountainside, it lay hidden behind a rise in the snow.)
    standCamera(want, 2, mid);
    e.at.copy(e.start).lerp(want, smooth(c.t / 1.3));
    e.look.lerp(target, ease(dt, 5) * turnIn(c));
    camera.position.copy(e.at);
    const g = ground(mid.x, mid.z);
    return high > 30 ? mid.clone().setY(g) : w.to.clone();
  };
  /**
   * The blast's shots, before what it takes flies free (where the sun's shadows are kept about given back): off to the side of it, a
   * little toward the top of the run, low, looking between it and where the cracks run out; as it goes off, drawn back and up, looking
   * up at the fire and at it thrown.
   */
  const blastShot = (c: Catapult, dt: number) => {
    const b = c.blast!, e = c.eye, mid = c.at, across = b.toTop.clone().cross(UP).multiplyScalar(b.side), k = smooth((c.t - BLAST_T.booms) / 0.5);
    const want = b.on.clone().addScaledVector(across, 24 + 10 * k).addScaledVector(b.toTop, 7).addScaledVector(UP, 3.5 + 5 * k);
    const target = b.on.clone().lerp(b.at, 0.45).addScaledVector(UP, 1.5).lerp(b.at.clone().addScaledVector(UP, 9).lerp(mid, 0.5), k);
    standCamera(want, 2, b.on.clone().addScaledVector(UP, 1));
    e.at.copy(e.start).lerp(want, smooth(c.t / 1.0));
    e.look.lerp(target, ease(dt, 6) * turnIn(c));
    camera.position.copy(e.at);
    return b.on.clone();
  };
  /**
   * The saucer's shots (where the sun's shadows are kept about given back): off to the side of what it takes, low, looking up at the
   * saucer coming down out of the sky from beyond it; down to the two of them as it hovers; and up the beam with what it takes.
   */
  const saucerShot = (c: Catapult, dt: number) => {
    const s = c.saucer!, e = c.eye, mid = c.at, across = s.toTop.clone().cross(UP).multiplyScalar(s.side);
    const want = s.on.clone().addScaledVector(across, 34).addScaledVector(s.toTop, -6).addScaledVector(UP, 3);
    const target = s.at.clone().lerp(mid.clone().lerp(s.at, 0.45), smooth(c.t / SAUCER_T.arrives));
    standCamera(want, 2, mid);
    const eye = e.start.clone().lerp(want, smooth(c.t / 1.3));
    // Carried back: kept along with the two of them, behind and to the side and a little below, looking up at them against the sky.
    const back = s.over.clone().sub(s.hover).setY(0).normalize(), off = back.clone().multiplyScalar(-30).addScaledVector(across, 18).addScaledVector(UP, -4);
    e.off.lerp(off, c.t > s.carries ? ease(dt, 1.5) : 1);
    const alongside = standCamera(mid.clone().add(e.off), 3, mid), chase = smooth((c.t - s.carries) / 2);
    eye.lerp(alongside, chase);
    target.lerp(mid.clone().lerp(s.at, 0.3), chase);
    // Over the top: from the side of it and a little up the run, low, looking up the beam at it coming down to the snow.
    const side = across.clone().multiplyScalar(-1);
    const watching = standCamera(c.landing.clone().addScaledVector(side, 22).addScaledVector(c.downhill, 8).addScaledVector(UP, 4), 2, c.landing);
    const atTop = smooth((c.t - (s.lowers - 1.2)) / 1.8);
    eye.lerp(watching, atTop);
    target.lerp(mid.clone().lerp(s.at, 0.2), atTop);
    // And as the saucer goes, to where the rider's own view will stand at the top (the cinematic view cuts to its first shot).
    const end = smooth((c.t - (s.done - 1.5)) / 1.5), own = end > 0 ? viewAtTop(c) : null;
    if (own) {
      eye.lerp(own.eye, end); target.lerp(own.look, end);
    }
    e.at.copy(eye);
    // (Where it looks eased against the two of them, not the world: carried off faster than any eased look follows, it fell behind
    // them, at the mountainside below.)
    if (!e.started) e.rel.copy(e.look).sub(mid);
    e.rel.lerp(target.sub(mid), ease(dt, 4) * turnIn(c));
    e.look.copy(mid).add(e.rel);
    camera.position.copy(e.at);
    // (High over the snow, the sun's shadows kept about the snow under it.)
    const g = ground(mid.x, mid.z);
    return mid.y - g > 30 ? mid.clone().setY(g) : mid.clone();
  };
  /**
   * The snowman's shots (where the sun's shadows are kept about given back): from beyond what it drives, away from the snowman and back
   * from the way to the top of the run, as a golfer is watched from behind the tee: the snowman rising, facing the view, its swing, and
   * the drive going away up the mountain.
   */
  const snowmanShot = (c: Catapult, dt: number) => {
    const s = c.snowman!, e = c.eye;
    const want = s.ball.clone().addScaledVector(s.facing, 16).addScaledVector(s.toTop, -14).addScaledVector(UP, 4);
    const target = s.ball.clone().lerp(s.base.clone().addScaledVector(UP, 10), 0.5);
    standCamera(want, 2, s.ball);
    e.at.copy(e.start).lerp(want, smooth(c.t / 1.3));
    e.look.lerp(target, ease(dt, 5) * turnIn(c));
    camera.position.copy(e.at);
    return s.ball.clone().setY(ground(s.ball.x, s.ball.z));
  };
  /**
   * The land's turning over, filmed (where the sun's shadows are kept about given back): from behind the skier, rising up and back as
   * the land turns, high over it and off to one side, looking out the way it will ride: the slopes about it sinking away (or rising),
   * then the peak at the run's top going down into its pit (or coming up out of it), the far mountains after. Coming down to the skier
   * as the ride is handed back, the view it rides in takes it from there.
   */
  const flipShot = (c: Catapult, dt: number) => {
    const fl = c.flip!, e = c.eye, across = fl.to.clone().cross(UP).multiplyScalar(fl.side), k = smooth((c.t - 0.1) / (FLIP_T.done - 0.2));
    // (Up at once out of the snow about it, which rises and sinks first: begun low, the view was for a moment all snow.)
    const want = fl.on.clone().addScaledVector(fl.to, -(30 + 50 * k)).addScaledVector(across, 10 + 22 * k).addScaledVector(UP, 18 + 56 * k);
    const target = fl.on.clone().addScaledVector(fl.to, 240 + 360 * k).addScaledVector(UP, 4 - 110 * k);
    standCamera(want, 2, fl.on.clone().addScaledVector(UP, 1.2));
    e.at.copy(e.start).lerp(want, smooth(c.t / 1.1));
    e.look.lerp(target, ease(dt, 4) * turnIn(c));
    camera.position.copy(e.at);
    return fl.on.clone();
  };
  /**
   * The view of the run's end (`cat`): drawn round from wherever it was to stand off to the side of what the arm takes, across from the
   * arm and a little up the run, looking at them both as it rises, then following what it takes up into the air, and drawn back and up
   * as the arm lifts it high and throws it. As it lets go, carried along after it as it flies, behind it and to the side; under the
   * canopy, off to its side and a little below, the canopy over it against the sky; and over its last moments, down to where the view
   * the rider rides in would stand at the top of the run, so that the run goes on from there in it as it begins (asked: "can this
   * robotic arm sequence always have cinematic camera after which the previous active camera comes back when player gets again the
   * control"). The whirlwind's own shots before it throws: `whirlShot`.
   */
  const placeCatapultView = (dt: number) => {
    const c = cat!, e = c.eye, mid = c.at;
    // (Whatever view the rider rides in, the run's end's own cinematic view, which gives it back as the run begins: `handOver`. Turned
    // from where the view was looking to what each way looks at, from the first moment, rather than cut to it: cut, the picture jumped
    // as each way began.)
    camera.up.set(0, 1, 0);
    let sunAt: Vector3;
    if (!c.fly) sunAt = WAYS[c.by].shot(c, dt);
    else {
      // (Kept along with it, eased about it rather than after it: it goes far faster than any view could follow.)
      const fly = c.fly, ft = c.flown, opening = fly.free - 0.45, aside = fly.dir.clone().cross(UP).normalize().multiplyScalar(e.side);
      // (A ski jumper's flight from the side, a little behind it, the V of its skis and its lay over them in profile: from behind, it
      // looked to be standing up in the air.)
      const way = WAYS[c.by], chase = way.glides ? fly.dir.clone().multiplyScalar(-8).addScaledVector(UP, 2).addScaledVector(aside, 15) : fly.dir.clone().multiplyScalar(-19).addScaledVector(UP, 5).addScaledVector(aside, 7);
      const under = aside.clone().multiplyScalar(17).addScaledVector(fly.dir, -5).addScaledVector(UP, -2), canopy = smooth((ft - opening) / 1.2);
      e.off.lerp(chase.lerp(under, canopy), ease(dt, 2.2));
      const eye = mid.clone().add(e.off), target = mid.clone().addScaledVector(UP, canopy * (chuteOf().reach * 0.7 + 1));
      // (The last moments: to where the rider's own view will stand at the top of the run; the cinematic view cuts to its first shot.)
      const end = smooth((ft - (fly.total - 1.8)) / 1.8), own = end > 0 ? viewAtTop(c) : null;
      if (own) {
        eye.lerp(own.eye, end); target.lerp(own.look, end);
        }
      e.rel.lerp(target.sub(mid), ease(dt, 6));
      e.look.copy(mid).add(e.rel);
      camera.position.copy(eye);
      // (High over the snow, the sun's shadows kept about the snow under it: kept about it, the snow there lay beyond the shadows' reach,
      // and was drawn as in shade, a dark square under it.)
      const g = ground(mid.x, mid.z);
      sunAt = mid.y - g > 30 ? mid.clone().setY(g) : mid;
    }
    e.started = true;
    // (Shaken, as by the blast: the eye thrown about a little this way and that, and where it looks half as far, the shake dying away.)
    const look = e.look.clone();
    if (c.shake > 0.001) {
      const t = c.t, jolt = new Vector3(Math.sin(t * 61) * Math.sin(t * 17), Math.sin(t * 53 + 1) * Math.sin(t * 13), Math.sin(t * 67 + 2) * Math.sin(t * 19)).multiplyScalar(0.6 * c.shake);
      camera.position.add(jolt); look.addScaledVector(jolt, 0.5);
    }
    camera.position.y = Math.max(camera.position.y, ground(camera.position.x, camera.position.z) + 0.8);
    camera.lookAt(look);
    const fov = c.fly ? FOV : WAYS[c.by].fov;
    e.fov += (fov - e.fov) * ease(dt, 2);
    if (Math.abs(camera.fov - e.fov) > 0.01) { camera.fov = fovNow = e.fov; camera.updateProjectionMatrix(); }
    sun.position.copy(sunAt).addScaledVector(sunFrom, 50);
    sun.target.position.copy(sunAt);
  };
  /**
   * Where the view the rider rides in stands as the run begins at the top (as `placeView` puts it, the skier there going straight down
   * the run), and what it looks at: from behind, beside or above; none for the cinematic view, which begins with a shot of its own.
   */
  const viewAtTop = (c: Catapult): { eye: Vector3; look: Vector3 } | null => {
    const L = c.landing, down = c.downhill, aside = runLeft({ dx: down.x, dz: down.z }), d = distance;
    if (view === 'behind') {
      const eye = over(L.clone().addScaledVector(down, -9 * d), 3.4 * d);
      eye.y = Math.max(eye.y, L.y + 1.6 * d);
      return { eye, look: over(L.clone().addScaledVector(down, 6), 0.6) };
    }
    if (view === 'beside') {
      const eye = over(L.clone().addScaledVector(aside, 14 * d).addScaledVector(down, -4 * d), 2.2 * d);
      eye.y = Math.max(eye.y, L.y + 0.8 * d);
      return { eye, look: L.clone().addScaledVector(UP, 0.9).addScaledVector(down, 4.5 * d) };
    }
    if (view === 'iso') { const way = isoWay(down, aside), D = ISO_RIDE.far * d; return { eye: L.clone().addScaledVector(way, -D * Math.cos(ISO.pitch)).setY(L.y + D * Math.sin(ISO.pitch)), look: L.clone() }; }
    return null;
  };
  /**
   * The view handed back to the rider's own as the run begins again, from where it is (`eye`, looking at `look`), the run going on from
   * the top, `downhill`: eased on from there; the cinematic view cut to its first shot.
   */
  const handOver = (eye: Vector3, look: Vector3, downhill: Vector3) => {
    const at = focus();
    camera.position.copy(eye);
    eyeOff.copy(eye).sub(at); lookOff.copy(look).sub(at);
    ahead.copy(downhill); travel.copy(downhill);
    across = 0;
    lastRider.copy(at);
    camera.fov = fovNow = FOV; camera.updateProjectionMatrix();
    placed = view !== 'cinema';
  };

  // What has just happened, over the picture.
  const toldBox = $('told'), toldText = toldBox.querySelector('.text') as HTMLElement, toldSmall = toldBox.querySelector('.small') as HTMLElement;
  let toldShown = '';
  /**
   * The run's end on a phone or a tablet (asked, of the run's end: a sheet at the foot): over its lower part, as the way back to the
   * top plays above it, what became of the run, its points, how far down and how long; the tricks landed, what was brought down and what
   * was found; and on to the map of the runs, or the next run at once. What has just happened is not said over the picture as well.
   */
  const runEndEl = $('runEnd');
  let runEndKey = '';
  $('runEndMap').addEventListener('click', () => showMap());
  $('runEndNext').addEventListener('click', () => restart());
  const sayLostBefore = () => {
    if (!lostBefore || mode !== 'ride' || ride.time < 0.5) return;
    tell('The graphics failed last time', `${lostBefore.doing}: ${lostBefore.why}`.slice(0, 180), true, 10);
    lostBefore = null;
  };
  const stepRunEnd = () => {
    sayLostBefore();
    const over = runOver, on = touchHud && mode === 'ride' && !!over && !foot && !trip;
    if (document.body.classList.contains('ended') !== on) document.body.classList.toggle('ended', on);
    if (runEndEl.hidden === on) runEndEl.hidden = !on;
    if (!on || !over) { runEndKey = ''; return; }
    const downed = orcsOn ? horde.downed : 0, key = `${over.what}|${over.why}|${score}|${tricksRun}|${downed}|${foundRun.length}`;
    if (key === runEndKey) return;
    runEndKey = key;
    say($('runEndRun'), runs.find((r) => r.id === landKind)?.label ?? 'The groomed slope');
    const what = $('runEndWhat');
    say(what, over.what);
    what.classList.toggle('bad', over.bad);
    say($('runEndWhy'), over.why);
    say($('runEndPoints'), score.toLocaleString('en'));
    say($('runEndBest'), bestBefore > 0 && score > bestBefore ? 'points · new best' : best > 0 && score < best ? `points · best ${best.toLocaleString('en')}` : 'points');
    say($('runEndDrop'), `${Math.round(over.drop)} m`);
    say($('runEndTime'), `${Math.round(over.time)} s`);
    const said = [`${tricksRun} ${tricksRun === 1 ? 'trick' : 'tricks'} landed`];
    if (orcsOn) said.push(`${downed} brought down`);
    if (foundRun.length) said.push(`found: ${foundRun.join(', ')}`);
    say($('runEndLine'), said.join(' · '));
  };
  const showTold = () => {
    const on = mode === 'ride' && !!told.text && ride.time < told.until, key = on ? `${told.text}|${told.small}|${told.bad}` : '';
    if (key === toldShown) return;
    toldShown = key;
    toldBox.classList.toggle('shown', on);
    toldBox.classList.toggle('bad', told.bad);
    if (on) { toldText.textContent = told.text; toldSmall.textContent = told.small; }
  };

  const fit = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  // (While the menu is open, the picture drawn as through a window slid over, so that the skier, whom the views keep in the middle of
  // the picture, stands in the middle of what the menu leaves to be seen: above its sheet on a phone held upright, to the left of its
  // panel beside the picture. Eased, so that the picture glides aside and back.)
  const shift = { x: 0, y: 0 };
  const shiftView = (dt: number) => {
    let tx = 0, ty = 0;
    if (menuOpen) {
      const r = menuEl.getBoundingClientRect();
      // (Above a sheet, between it and what is said at the top; beside a panel, in the middle of what it leaves.)
      if (r.left < 2) ty = Math.max(0, innerHeight / 2 - (Math.max(0, $('where').getBoundingClientRect().bottom) + r.top) / 2); else tx = Math.max(0, innerWidth - r.left) / 2;
    }
    const k = ease(dt, 7);
    shift.x += (tx - shift.x) * k; shift.y += (ty - shift.y) * k;
    if (!tx && !ty && Math.abs(shift.x) + Math.abs(shift.y) < 0.5) { shift.x = shift.y = 0; if (camera.view?.enabled) camera.clearViewOffset(); return; }
    camera.setViewOffset(innerWidth, innerHeight, shift.x, shift.y, innerWidth, innerHeight);
  };

  // The picture (asked: "can we cheaply make background a bit blurry and add some motion blur?"): the scene drawn once with how far
  // each point of it moved across the picture since the last frame; each point smeared along that way, over eight samples, as a
  // camera's shutter open a sixtieth of a second would smear it (the frames' own length taken out, so that it smears alike at any
  // rate, and never more than a twenty-fifth of the picture); and what lies well beyond the skier mixed with a blurred picture drawn
  // at half the size, the more the further, so that the background is a little out of focus. *Blur* turns both off, and the plain
  // picture is drawn. (Nothing about as far off as the skier is smeared: the view keeps the skier still in the picture, and its
  // skinned body's motion comes out wrong when the whole of it moves across the picture. A smear that would leave out what lies much
  // nearer than the point smeared, so that the skier is not streaked over the snow behind it, read nothing from the depths at other
  // points of the picture and drew the near snow black; it is not done.)
  // (Drawn once to a point, its edges smoothed after (FXAA), not drawn four times over at each (`?msaa=1` for that): four times over cost
  // more than half of a frame drawn in software, and what the blur smears and softens needs none of it.)
  const msaa = query.get('msaa') === '1';
  const scenePass = pass(scene, camera, { samples: msaa ? 4 : 0 });
  scenePass.setMRT(mrt({ output, velocity }));
  const picture = scenePass.getTextureNode('output'), moved = scenePass.getTextureNode('velocity').xy;
  const uShutter = uniform(1), uFocus = uniform(10), uBlur = uniform(1);
  type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const depthHere: N = scenePass.getViewZNode().negate();
  const streak: N = moved.mul(uShutter).mul(smoothstep(0.12, 0.4, abs(depthHere.sub(uFocus)).div(uFocus)));
  const smear: N = streak.mul(min(1, max(length(streak), 1e-5).reciprocal().mul(0.04)));
  // (Not at all where nothing moves across the picture by as much as a tenth of a point: the skier, and everything while it stands.)
  const smeared: N = Fn(() => {
    const sum = vec4(0).toVar();
    If(length(smear.mul(screenSize)).greaterThan(0.1), () => {
      // (Each point's samples set off along the smear by its own share of a step, told from where it is in the picture: all at the same
      // eight places, a glint on the snow came out as a row of eight dots, a dotted line; so it comes out as one streak, a little grainy.)
      const off: N = fract(fract(dot(uv().mul(screenSize), vec2(0.06711056, 0.00583715))).mul(52.9829189)).toVar();
      Loop({ start: int(0), end: int(8), type: 'int' }, ({ i }: { i: N }) => {
        sum.addAssign(picture.sample(uv().add(smear.mul(float(i).add(off).div(8).sub(0.5)))));
      });
      sum.divAssign(8);
    }).Else(() => { sum.assign(picture.sample(uv())); });
    return sum;
  })();
  const soft = gaussianBlur(picture, vec2(1, 1), 3, { resolutionScale: 0.5 });
  const away = smoothstep(uFocus.mul(2.2), uFocus.mul(9), depthHere).mul(min(0.95, uBlur.mul(0.85)));
  // (The finished picture graded as a photograph of a bright day is: its tones drawn a little apart, a little more colour, and its
  // corners a little darker, which holds the eye on the middle. Worked out in the pass that is drawn anyway, for nothing more.)
  const grade = (c: N): N => {
    const curved: N = mix(c.rgb, c.rgb.mul(c.rgb).mul(float(3).sub(c.rgb.mul(2))), 0.22);
    const grey: N = dot(curved, vec3(0.2126, 0.7152, 0.0722)), rich: N = mix(vec3(grey), curved, 1.12);
    const edge: N = length(uv().sub(0.5).mul(vec2(1, 0.78)));
    return vec4(rich.mul(mix(1, 0.8, smoothstep(0.32, 0.8, edge))), c.a);
  };
  const pipeline = new RenderPipeline(renderer);
  if (msaa) pipeline.outputNode = mix(smeared, soft, away);
  else { pipeline.outputColorTransform = false; pipeline.outputNode = grade(fxaa(renderOutput(mix(smeared, soft, away)))); }
  // (With no blur, the scene alone, smoothed the same way: drawn straight to the canvas, it had its four times over, and cost more
  // than with the blur.)
  const sharp = new RenderPipeline(renderer), sharpPass = pass(scene, camera, { samples: msaa ? 4 : 0 });
  if (msaa) sharp.outputNode = sharpPass;
  else { sharp.outputColorTransform = false; sharp.outputNode = grade(fxaa(renderOutput(sharpPass))); }
  // Made ready ahead of need (asked: "there are still some unexplainable stutters that might happen just around when "something exciting
  // is about to happen" on mobile as well.. can there be somehow improved caching or any way to prepare for smoother experience?"; "can
  // happen also when orcs appear or when your starting to shoot at them or in the beginning of a transition to back up"): each thing
  // drawn for the first time has its shaders made then, and its shapes sent to the graphics card, a tenth to a third of a second here
  // and several times that on a phone: the arm, the blast, the saucer, the snowman, the tornado, the cart and the land turned inside
  // out as each first came, the orcs and the gun, the blood, the tracers. So, everything there is in the scene, the hidden with the
  // shown, and wherever it is, is drawn once as the page opens, behind its loading screen (the sun's shadows with it), its shaders made
  // first a few at a time where the renderer can (WebGPU); and later, the gun and the orcs as they are first wanted, or a new slope,
  // made ready the same way but not drawn, which would show them all for a frame. Then nothing is new when it comes.
  const warmWith = new Set<Object3D>();
  let warmWanted = true;
  /** Everything made ready by the next frame, with `also`, which is not in the scene until it is wanted (the gun). */
  const warmSoon = (...also: Object3D[]) => { for (const o of also) warmWith.add(o); warmWanted = true; };
  /** Everything there is shown, and drawn wherever it is (not passed over as out of sight); and how to put it all back as it was. */
  const showEverything = (): (() => void) => {
    const undo: (() => void)[] = [];
    for (const o of warmWith) if (!o.parent) { scene.add(o); undo.push(() => o.removeFromParent()); }
    warmWith.clear();
    scene.traverse((o) => {
      // (Not what has no shape yet: made when it is first wanted, it is drawn then.)
      if ((o as Mesh).isMesh && !(o as Mesh).geometry.getAttribute('position')) return;
      if (o.visible && !o.frustumCulled) return;
      const shown = o.visible, culled = o.frustumCulled;
      o.visible = true; o.frustumCulled = false;
      undo.push(() => { o.visible = shown; o.frustumCulled = culled; });
    });
    return () => { for (let i = undo.length - 1; i >= 0; i--) undo[i](); };
  };
  const webgpu = !!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend;
  // (How much, by *Blur*: from none, the plain picture drawn, to twice as much; `?blur=` too.)
  let blurLevel = query.has('blur') ? clamp(Number(query.get('blur')) || 0, 0, 2) : 1;
  // Hiding the menus and the text, `H` too; the distance of the views from the skier. (Kept in this browser for next time, where it may.)
  const keep = (k: string, v: string) => { try { localStorage.setItem(`slope.${k}`, v); } catch { /* (not kept) */ } };
  const kept = (k: string) => { try { return localStorage.getItem(`slope.${k}`); } catch { return null; } };
  // (What was found, had again as the page opens; `?pack=0` begins with nothing, not forgetting what is kept.)
  pack = new Pack((json) => { if (query.get('pack') !== '0') keep('pack', json); }, query.get('pack') === '0' ? null : kept('pack'));
  pack.onChange = regear;
  regear();
  const distanceInput = $<HTMLInputElement>('distance');
  const setDistance = (d: number) => { distance = clamp(d, 0.5, 3); distanceInput.value = String(distance); $('distanceOut').textContent = `${distance.toFixed(1)}×`; keep('distance', String(distance)); };
  distanceInput.addEventListener('input', () => setDistance(Number(distanceInput.value)));
  const blurInput = $<HTMLInputElement>('blur');
  // (Turned on or off, the picture is drawn another way, whose shaders are made ready.)
  const setBlur = (b: number) => { if (!b !== !blurLevel) warmSoon(); blurLevel = clamp(b, 0, 2); blurInput.value = String(blurLevel); $('blurOut').textContent = blurLevel ? `${blurLevel.toFixed(1)}×` : 'off'; keep('blur', String(blurLevel)); };
  blurInput.addEventListener('input', () => setBlur(Number(blurInput.value)));
  const keptBlur = kept('blur');
  setBlur(query.has('blur') || keptBlur === null ? blurLevel : Number(keptBlur));
  setDistance(Number(kept('distance') ?? 1) || 1);
  setOffPiste(query.has('offpiste') ? query.get('offpiste') !== '0' : kept('offpiste') !== '0');
  setOrcs(query.has('orcs') ? query.get('orcs') !== '0' : kept('orcs') === '1');
  setAiming(query.has('aim') ? query.get('aim') !== 'free' : kept('aiming') !== 'free');
  setInfo(query.has('info') ? query.get('info') !== '0' : kept('info') === '1');
  setMini(query.has('minimap') ? query.get('minimap') !== '0' : kept('minimap') !== '0');
  setSlowmo(query.has('slowmo') ? query.get('slowmo') !== '0' : kept('slowmo') === '1');
  resetScore();
  setTilt(kept('steering') === 'tilt');
  {
    const k = kept('backBy');
    backBy = BACK_CHOICES.some(([w]) => w === k) ? (k as BackBy) : 'ask';
    showBackBy();
    chooseEnding();
  }
  // (Drawn more simply here, said, and a way to try the full picture again.)
  if (safe.level) {
    const note = $('safeNote');
    note.hidden = false;
    note.querySelector('span')!.textContent = `Drawn more simply on this device (${safe.level >= 2 ? 'plain snow, by WebGL' : 'plain snow'})${safe.why ? `: ${safe.why}` : ''}.`;
    note.querySelector('button')!.onclick = () => {
      try { localStorage.removeItem(SAFE.key); } catch { /* (not kept) */ }
      const u = new URL(location.href);
      if (!u.searchParams.has('safe')) { location.reload(); return; }
      u.searchParams.delete('safe'); location.replace(u.href);
    };
  }
  // (Closed unless asked for, `?menus=1`: asked, "make the cinematic camera and hide menus enabled as default".)
  setMenu(query.get('menus') === '1');

  // How finely the picture is drawn (asked: "find how to best optimize the performance still with reasonable visual tradeoffs"):
  // what a frame costs goes nearly as the number of points drawn, so the surest saving there is. *Auto* (unless `?res=` says
  // otherwise) watches how long frames take: kept slower than sixty a second (or than the screen's own rate, if that is lower) for
  // half a second, it draws at fewer points, a step at a time, down to half as many each way; with room to spare for some seconds,
  // a step back up. Each step is held a while before the next, so that it does not hunt. *Full*, *¾* and *½* fix it. (Full is the
  // screen's own fineness, but never more than twice the page's.)
  type Res = 'auto' | 1 | 0.75 | 0.5;
  const fullRatio = Math.min(devicePixelRatio, 2), resChoices: [string, Res][] = [['Auto', 'auto'], ['Full', 1], ['¾', 0.75], ['½', 0.5]];
  const asRes = (v: string | null): Res | undefined => (v === 'auto' ? 'auto' : resChoices.find(([, r]) => String(r) === v)?.[1]);
  let res: Res = asRes(query.get('res')) ?? asRes(kept('res')) ?? 'auto', autoScale = 1;
  const auto = { best: Infinity, slow: 0, slowFrames: 0, fast: 0, hold: 0 };
  const resButtons = resChoices.map(([label, r]) => button('resolutions', label, () => setRes(r), r === 'auto' ? 'Fewer points drawn while frames come slowly' : `Draw at ${label === 'Full' ? 'the screen\'s own' : label} fineness`));
  const applyRatio = () => {
    const s = res === 'auto' ? autoScale : res;
    renderer.setPixelRatio(fullRatio * s);
    fit();
    resButtons.forEach((b, i) => { b.classList.toggle('on', resChoices[i][1] === res); if (resChoices[i][1] === 'auto') b.textContent = res === 'auto' && autoScale < 0.995 ? `Auto ${Math.round(autoScale * 100)}%` : 'Auto'; });
  };
  const setRes = (r: Res) => { res = r; keep('res', String(r)); Object.assign(auto, { slow: 0, slowFrames: 0, fast: 0, hold: 1500 }); applyRatio(); };
  /** Watches a frame's length, in milliseconds, and draws at fewer points or more as frames keep coming slowly or with room to spare. */
  const adapt = (interval: number) => {
    // (A gap of more than a second is the page put aside, not a slow frame. And a single long frame, as when shaders are made, is not
    // slowness: it takes three in a row.)
    if (res !== 'auto' || interval > 1000 || document.hidden) return;
    auto.best = Math.min(auto.best * 1.0005, interval);
    const target = Math.max(auto.best, 1000 / 62);
    auto.hold -= interval;
    if (interval > target * 1.3) { auto.slow += interval; auto.slowFrames++; auto.fast = 0; } else { auto.slow = Math.max(0, auto.slow - interval * 0.5); auto.slowFrames = 0; auto.fast = interval < target * 1.12 ? auto.fast + interval : 0; }
    if (auto.slow > 500 && auto.slowFrames >= 3 && autoScale > 0.5 && auto.hold <= 0) { autoScale = Math.max(0.5, autoScale * 0.85); Object.assign(auto, { slow: 0, slowFrames: 0, fast: 0, hold: 1200 }); applyRatio(); }
    else if (auto.fast > 4000 && autoScale < 1 && auto.hold <= 0) { autoScale = Math.min(1, autoScale * 1.1); Object.assign(auto, { slow: 0, fast: 0, hold: 3000 }); applyRatio(); }
  };
  applyRatio();
  addEventListener('resize', fit);
  fit();
  // (The cinematic view unless another is asked for, `?view=behind`, `beside` or `above`.)
  setView(views.find(([, v]) => v === query.get('view'))?.[1] ?? 'cinema');
  // (Riding, from behind, unless asked otherwise, `?rideView=cinema` or another.)
  viewFor.ride = views.find(([, v]) => v === query.get('rideView') && v !== 'free')?.[1] ?? 'behind';
  showKickers(true);
  wildInput.value = kept('wild') ?? '0.5';
  await loading.stage('demo');
  if (demoKind === 'show' && who === 'horse') setSkier('mounted');
  await useDemo();
  reflect();
  // The map of the runs (`slopeMap.ts`): the opening's choice is made on it, and the menu opens it again (*Map of the runs*, `M`).
  // Drawn now if the page opens on the choice, so that it is ready when it is shown; else when it is first opened. (Without its
  // file, only the list of the runs.)
  let runMap: RunMap | null = null;
  try { const text = await mapText; runMap = text ? readRunMap(text) : null; } catch (e) { console.warn(e); }
  const choose = $('choose');
  const mapView = new RunMapView($('runMap'), $('runList'), choose, runMap, runs, {
    ride: (id) => rideOn(id),
    best: (id) => Math.max(0, Number(kept(`best.${id}`)) || 0),
  });
  if (!query.has('nointro')) { await loading.stage('map'); mapView.draw(); }
  // (The first frames make the shaders, which can take some seconds: the screen goes once two have been drawn. What may come later is
  // made ready with them: the land turned inside out built, an orc made if they are on, and the gun.)
  await loading.stage('shaders');
  buildFold();
  if (orcsOn || demoKind === 'show') await horde.prepare().catch(() => {});
  warmSoon(gun, ...arms.values());

  // The opening (asked: "Game opening shows a brief grand title: HORSE / Mountain; the demo runs on the background and after the title a
  // dialog show decision: "Watch demo run" / "Send it myself!" (which switches to player controlled run)"; the title then made "Grand
  // Horse Mountain", GRAND HORSE over Mountain): the title over the demo run
  // as it plays, for some three seconds; then the choice. Watching, the demo goes on; sending it, a run from the top, the rider's own.
  // (`?nointro` for neither.)
  // Then (asked: "... along with the dialog to watch either the regular demo, orcs demo or choose a location from the map to ride"):
  // the map of the runs, with the demo run and the orc hunt beside it. Watching, the demo goes on; a run chosen on the map and ridden,
  // a run from its top, the rider's own. Opened again later, riding, the ride is held until it is closed.
  const intro = $('intro');
  let heldRide = false;
  const showMap = () => {
    setMenu(false);
    mapView.draw();
    // (The dungeon under this run on the map as far as it has been seen, and where the one on foot stands in it.)
    const cave = caveNow(), top = topOf.get(land), o = land.group.position, plan = cave?.plan();
    mapView.setDungeon(cave && top && plan ? { x: cave.site.mouth.x + top.x, z: cave.site.mouth.z + top.z, plan, here: foot ? cave.onPlan(foot.x - o.x, foot.z - o.z) : null, name: plan.name } : null);
    if (mode === 'ride' && playing) { playing = false; heldRide = true; reflect(); }
    choose.hidden = false;
    document.body.classList.add('choosing');
    choose.querySelector<HTMLButtonElement>('#runList button, #watchDemo')?.focus({ preventScroll: true });
  };
  const chosen = () => {
    mapView.closeCard();
    choose.hidden = true; intro.hidden = true; introFrames = -1;
    document.body.classList.remove('choosing');
    if (heldRide) { heldRide = false; playing = true; reflect(); }
  };
  /** A run chosen on the map (or the groomed slope), ridden from its top. */
  const rideOn = (id: string) => {
    // (Riding a world's run, another of them chosen: ridden off to it, `travelTo`.)
    // (During a run's end, the trip waits for it to be over, and begins from where it set the rider down; not driving the cart back up
    // or riding the land turned inside out, which are rides of their own.)
    // (And, asked of these: "its not consistent": chosen while the cart was driven back up or the land was turned inside out, or again
    // while the run first chosen was being made ready, the run had been laid at once, no way there ridden. Now the cart put away, or the
    // land turned back, the rider on the snow where it is, and ridden off from there; or the run first chosen let be for this one.)
    const world = mode === 'ride' && landKind !== 'groomed' && id !== 'groomed';
    if (world && trip && !trip.started) abortTrip();
    const riding = world && id !== landKind && !trip;
    heldRide = false; playing = true;
    chosen(); setMode('ride');
    if (riding && (carting || inside)) { const x = ride.x, z = ride.z; unflip(); const f = land.frame(x, z); resumeAt({ s: f.s, left: f.left }); }
    if (riding) void travelTo(id);
    else if (id !== landKind) void setLand(id); else restart();
  };
  $('watchDemo').onclick = () => { heldRide = false; playing = true; chosen(); setDemoKind('tricks'); setMode('watch'); };
  $('watchShow').onclick = () => { heldRide = false; playing = true; chosen(); setDemoKind('show'); setMode('watch'); };
  // (The orc hunt has the orcs and the tommy gun, which it turns on, as *Orcs & tommy gun* in the menu does.)
  $('watchHunt').onclick = () => { heldRide = false; playing = true; chosen(); gunSound.wake(); if (!orcsOn) setOrcs(true); setMode('watch'); setDemoKind('orcs'); };
  $('rideGroomed').onclick = () => rideOn('groomed');
  $('chooseClose').onclick = () => chosen();
  $('openMap').onclick = () => showMap();
  choose.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; e.preventDefault(); if (mapView.carding) mapView.closeCard(); else chosen(); });
  // (Timed from the third frame drawn, not from the page being ready, and held for twenty frames at the least: the first frames, which
  // make the shaders, can take seconds, and the title went by before anything was seen.)
  let introFrames = query.has('nointro') ? -1 : 0, introAt = 0;
  const stepIntro = (now: number) => {
    if (introFrames < 0) return;
    if (introFrames < 3) { if (++introFrames === 3) { intro.hidden = false; introAt = now; } return; }
    const shown = (now - introAt) / 1000, drawn = ++introFrames - 3;
    if (shown > 2.7 && drawn > 20 && !intro.classList.contains('gone')) intro.classList.add('gone');
    if (shown > 3.8 && drawn > 26) { introFrames = -1; if (!intro.hidden) { intro.hidden = true; if (mode === 'watch') showMap(); } }
  };

  let then = performance.now(), benching = false, drawnFrames = 0;
  const fixedDt = Number(query.get('dt')) || 0;
  let afterFrame: (() => void) | null = null;
  // (What the frame says on the page, and where the timeline's head stands: written only when it changes.)
  const clockEl = $('clock'), speedEl = $('speed'), downEl = $('down');
  let headAt = -1, headOf: Demo | null = null;
  /**
   * Every frame, whatever becomes of the one before (asked: "on iphone 15 the game freezes now for some reason after first starting the
   * game and choosing a run from the splash map ... if i reload the page and go play, then it works"): each frame asked for again once
   * it is done, as it always was, but now even if it threw, so that one thing gone wrong does not stop the picture for good; and what
   * went wrong said over the picture, the first time, so that it can be told of.
   */
  let frameFailed = false;
  const frame = async () => {
    try { await frameOnce(); } catch (e) {
      console.error(e);
      if (!frameFailed) { frameFailed = true; tell('Something went wrong', String((e as Error)?.message ?? e).slice(0, 140), true, 8); }
    }
    requestAnimationFrame(frame);
  };
  /**
   * The shaders being made ready (`warmSoon`), while they are: what was taken out of the scene is not let go of under them. And the
   * longest a frame waits for them, `WARM_WAIT` milliseconds: on an iPhone opened afresh, with nothing yet made for it, the wait after a
   * run was chosen on the map could go on with the picture stood still, and never end. Past it, the picture goes on, what is not yet
   * ready made as it is first drawn (a stutter, at worst).
   */
  let warming: Promise<unknown> | null = null;
  // (Longer as the page opens, behind its loading screen, where a phone was seen to take four seconds over them all.)
  const WARM_WAIT = 3000, WARM_WAIT_OPENING = 12000;
  const frameOnce = async () => {
    if (benching) return;
    // (What was taken out of the scene since the last frame let go of, now that no frame is making shaders ready: `toLetGo`.)
    if (!warming) for (const f of toLetGo.splice(0)) f();
    // (`?dt=` steps every frame by so many seconds whatever time has passed: for pictures, made by a browser too slow to keep pace.)
    // (Riding, slowed through a jump if so chosen: `stepSlowmo`. What keeps pace with the clock on the wall, the picture's blur, not.)
    const now = performance.now(), realDt = fixedDt || Math.min(0.1, (now - then) / 1000);
    stepSlowmo(mode === 'ride' && playing && !menuOpen ? realDt : 0);
    const dt = realDt * (mode === 'ride' ? timeScale : 1);
    stepIntro(now);
    if (drawnFrames >= 0 && ++drawnFrames > 2) { drawnFrames = -1; loading.done(); openedAt = performance.now(); }
    adapt(now - then);
    then = now;
    let at: Now;
    if (mode === 'watch') {
      if (playing && !scrubbing) {
        t += dt * rate;
        if (t >= demo.length) { if (demoKind === 'show') endShow(); else { t = 0; clearSpray(); placed = false; } }
      }
      at = watchPose(t);
      here = { ...land.at(at.down, at.left), s: at.down, left: at.left };
      showWatchTracks(t);
      stepSpray(playing && !scrubbing ? dt * rate : 0, playing && !scrubbing ? at : null, demo.frames[Math.min(demo.frames.length - 1, Math.round(t / STEP))]?.air ?? false);
      const parts = demo.parts, part = parts.find((p) => t >= p.from && t < p.to) ?? parts[parts.length - 1];
      if (part && part.label !== shownPart) { shownPart = part.label; $('part').textContent = part.label; bands.forEach((b, i) => b.classList.toggle('now', parts[i] === part)); }
      say(clockEl, `${t.toFixed(1)} s of ${demo.length.toFixed(0)}`);
      if (t !== headAt || demo !== headOf) { headAt = t; headOf = demo; head.style.left = `${(t / demo.length) * 100}%`; line.setAttribute('aria-valuenow', t.toFixed(1)); }
    } else {
      // (The showcase's end over, and a moment at the top after it: the showcase again, from its top.)
      if (showBack > 0 && playing && (showBack -= dt) <= 0) { setMode('watch', true); t = 0; placed = false; clearSpray(); }
      // (Stepped in small steps, so that a slow frame does not throw the skier off its line.)
      // (Held while the menu is open.)
      const steps = playing && !menuOpen ? Math.ceil(dt / (1 / 120)) : 0;
      const p = focus(), f = land.frame(p.x, p.z, ride.down);
      at = { down: f.s, left: f.left, speed: crash ? 0 : ride.speed, way: ride.way, ski: ride.way, skid: 0, tuck: ride.tuck, brake: ride.brake };
      // (Until the arm has it in its claw, the ride goes on: lain in the snow, or stood at the foot of the run.)
      if (foot) at = stepFoot(playing && !menuOpen ? dt : 0);
      else if (!cat?.held) for (let i = 0; i < steps; i++) { askRide(); at = stepRide(dt / steps); }
      if (playing && !menuOpen) stepCamp();
      // (A run over: fallen and lain still, or stopped at the foot of the run; and the arm comes for it.)
      // (Or, the run to end in the whirlwind, ridden into it.)
      if (playing && !cat && !trip && ((crash && atRest()) || (ride.ended && ride.speed < 0.5) || riddenInto())) beginEnding();
      if (playing && !menuOpen) stepTravel();
      if (cat) at = stepCatapult(playing && !menuOpen ? dt : 0, at);
      stepSpent(playing && !menuOpen ? dt : 0);
      stepWhirlwind(playing && !menuOpen ? dt : 0);
      stepFold(playing && !menuOpen ? dt : 0);
      stepCart(playing && !menuOpen ? dt : 0);
      stepOffPiste(playing && !menuOpen ? dt : 0);
      const onSnow = !air && !crash && !cat && !foot;
      if (playing && onSnow) layRide(at);
      else if (!onSnow) rideBreak = true;
      stepSpray(playing && !menuOpen ? dt : 0, playing && onSnow ? at : null, !!air);
      const doing = doingNow();
      if (doing !== shownPart) { shownPart = doing; $('part').textContent = doing; }
      say(clockEl, `${ride.time.toFixed(0)} s riding`);
      showStick();
      showAim();
      showStance();
    }
    // (The tommy gun in the hands of whoever carries it, after the pose it was put in, and fired; or put away.)
    armUp(dt, at);
    stepLoot(mode === 'ride' && playing && !menuOpen ? dt : 0);
    stepMaking();
    stepRunEnd();
    // (Where the skier is: on its skis, lain in the snow, or in the arm's hands or thrown.)
    const where = cat ? cat.at.clone() : focus();
    land.keepAbout(where.x, where.z);
    stepCave(dt, now / 1000);
    rideTrackGroup.visible = mode === 'ride' && !under;
    gloom(dt);
    land.lod?.(camera.position.x, camera.position.z);
    land.trees?.(camera.position, now / 1000);
    if (kickersOn) { placeKickers(at.down); flutter(now / 1000); }
    if (mode === 'ride' && cat) placeCatapultView(dt); else if (mode === 'ride' && foot) placeIsoView(dt); else placeView(at, dt);
    shiftView(dt);
    reinsNow();
    showFoot();
    showTold();
    say(speedEl, (at.speed * 3.6).toFixed(0));
    // (How far down, as height come down from the top: vertical metres, as the world's heights have it.)
    say(downEl, Math.max(0, land.drop(where.y)).toFixed(0));
    stepMini(where, at);
    // (Before the first frame is drawn, its shaders made a few at a time with the page given a moment between them, rather than all at
    // once as it is drawn: made so, the page stood frozen for the four seconds they took, the loading screen's bar with it, and they
    // took a second and more longer. With WebGPU only: with WebGL 2, made this way they took twice as long, ten seconds for five.)
    // (And everything else there is with it: `warmSoon`. Opening, drawn this frame behind the loading screen; later, only made ready.)
    keepSane();
    let unwarm: (() => void) | null = null;
    // (Not while shaders given up on are still being made: asked for again once they are.)
    if (warmWanted && !warming) {
      warmWanted = false;
      const opening = drawnFrames >= 0;
      unwarm = showEverything();
      if (webgpu || !opening) {
        // (The pass sets the renderer drawing into its own target while it waits, and puts it back once done: put back here too if it
        // is given up on, so that the frame draws to the picture.)
        const target = renderer.getRenderTarget(), mrt = renderer.getMRT(), context = renderer.contextNode;
        const made = (blurLevel > 0 ? scenePass : sharpPass).compileAsync(renderer).catch((e) => console.warn(e));
        const done = made.then(() => { if (warming === done) warming = null; });
        warming = done;
        const inTime = await Promise.race([made.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), opening ? WARM_WAIT_OPENING : WARM_WAIT))]);
        // (Given up on, no longer waited on at all: what was taken out of the scene let go of as ever, and what is wanted made ready next
        // time. Waited on until it came, which on an iPad it might never, nothing let go of was let go of, and the land turned inside out,
        // which is the whole land made again, piled up behind it each time.)
        if (!inTime) { console.warn('Grand Horse Mountain went on without waiting longer for its shaders'); renderer.setRenderTarget(target); renderer.setMRT(mrt); renderer.contextNode = context; warming = null; }
      }
      if (!opening) { unwarm(); unwarm = null; }
    }
    if (blurLevel > 0) {
      uShutter.value = clamp(1 / 60 / Math.max(realDt, 1e-3), 0.005, 3) * blurLevel;
      uBlur.value = blurLevel;
      // (The land turning over in focus as it does, rather than the skier, small in the middle of it.)
      // (A number gone bad here blackens the whole picture, every point of it blurred by it: kept to a sane one.)
      const focusAt = camera.position.distanceTo(cat?.flip ? cat.eye.look : rider.position);
      uFocus.value = Number.isFinite(focusAt) ? Math.max(3, focusAt) : 10;
      pipeline.render();
    } else sharp.render();
    unwarm?.();
    probeBlack(now);
    // (For a script making a video a frame at a time: told once each frame is drawn, `__slope.everyFrame`.)
    afterFrame?.();
  };
  /**
   * Whether the picture is being drawn at all (asked: "Ipad chrome: screen turned black after upside down world transition"; "Gui
   * visible and player moving"): every four seconds, just after a frame is drawn, the picture taken small; once it has been seen drawn
   * on this page (so that a browser that gives back nothing of its picture is never taken for a black one), black or empty three times
   * over, outdoors, where nothing is ever black, and the graphics are taken to have failed: the page opened again, drawn more simply.
   */
  /** What was so as the picture came out black, for what is kept of it (`noteLost`): the eye and the rider sane or not, and the run's state. */
  const pictureState = () => {
    const ok = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    return [`eye ${ok(camera.position) ? 'ok' : 'bad'}`, `rider ${ok(rider.position) ? 'ok' : 'bad'}`, `view ${view}`, ride.ended ? 'ended' : '', asking ? 'asking' : '', crash ? 'fallen' : '', cat ? `way ${cat.by}` : '', inside ? 'inside out' : '', foot ? 'on foot' : '', `blur ${blurLevel}`].filter(Boolean).join(', ');
  };
  /**
   * The eye and the rider kept sane each frame: a place gone to no number (as from a length of nothing made one), drawn, blackens the
   * picture for good. Seen so, the run begun again from its top (the ride's own numbers gone bad), or the eye put back behind the rider;
   * and said, the first time.
   */
  let insaneSaid = false;
  const keepSane = () => {
    const ok = (v: Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
    // (The ride's own eased numbers, its lean, its facing and the rest, set right where they stand: gone to no number, each eased on from
    // itself kept to it for good. Only its place gone so begins the run again.)
    const r = ride as unknown as Record<string, unknown>, fixed: string[] = [];
    for (const k in r) if (typeof r[k] === 'number' && !Number.isFinite(r[k] as number) && !['x', 'y', 'z', 'down', 'left'].includes(k)) { r[k] = 0; fixed.push(k); }
    if (fixed.length) noteProblem(`the ride's ${fixed.join(', ')} went to no number: set to nothing (${pictureState()})`);
    const rideOk = [ride.x, ride.y, ride.z, ride.speed, ride.way, ride.down, ride.left].every(Number.isFinite);
    if (rideOk && ok(rider.position) && ok(camera.position)) return;
    const what = `${rideOk ? '' : 'the ride '}${ok(rider.position) ? '' : 'the rider '}${ok(camera.position) ? '' : 'the eye'}`.trim();
    const bad = ['x', 'y', 'z', 'speed', 'way', 'down', 'left'].filter((k) => !Number.isFinite((ride as unknown as Record<string, number>)[k]));
    noteProblem(`${what} went to no number${bad.length ? ` (${bad.join(', ')})` : ''}: begun again (${pictureState()})`);
    if (!insaneSaid) { insaneSaid = true; tell('Something went wrong', `${what} went to no number: set right`, true, 6); }
    if (!rideOk || !ok(rider.position)) { restart(); return; }
    camera.position.copy(rider.position).add(new Vector3(0, 4, -8));
    camera.lookAt(rider.position);
    placed = false;
  };
  const probe = document.createElement('canvas');
  probe.width = probe.height = 8;
  const probeCtx = probe.getContext('2d', { willReadFrequently: true });
  let probeAt = 0, probing = false, probeSeen = false, blackFor = 0;
  const probeBlack = (now: number) => {
    if (!probeCtx || probing || fallingBack || now < probeAt || typeof createImageBitmap === 'undefined') return;
    probeAt = now + 4000;
    if (document.hidden || drawnFrames >= 0 || foot || caveDark > 0.3 || menuOpen) return;
    probing = true;
    createImageBitmap(canvas, { resizeWidth: 8, resizeHeight: 8 }).then((bmp) => {
      probeCtx.clearRect(0, 0, 8, 8);
      probeCtx.drawImage(bmp, 0, 0);
      bmp.close();
      const d = probeCtx.getImageData(0, 0, 8, 8).data;
      let most = 0;
      for (let i = 0; i < d.length; i += 4) most = Math.max(most, Math.min(d[i + 3], Math.max(d[i], d[i + 1], d[i + 2])));
      if (most >= 24) { probeSeen = true; blackFor = 0; return; }
      if (!probeSeen) return;
      blackFor++;
      console.warn(`Grand Horse Mountain: the picture came out black (${blackFor})`);
      if (blackFor >= 3) fallBack(`the picture went black (${pictureState()})`, true);
    }).catch(() => { /* (not to be told) */ }).finally(() => { probing = false; });
  };
  const __look = (off: Vector3) => { heldLook = null; view = 'free'; controls.enabled = true; const at = focus(); camera.position.copy(at).add(off); controls.target.copy(at).addScaledVector(UP, 0.9); controls.update(); lastRider.copy(at); placed = true; };
  // (For a script that drives the page: where it is, and to put it anywhere; riding, what the pointer would ask.)
  (window as unknown as Record<string, unknown>).__slope = {
    seek: (to: number) => { t = to; clearSpray(); placed = false; }, pause: (p: boolean) => { playing = !p; reflect(); }, setView, setMode,
    steer: (x: number, y: number) => { stick.x = x; stick.y = y; }, brake: (on: boolean) => { want.brakeKey = on; }, ride: () => ({ ...ride }),
    // (Steering by tilting: whether it steers now, and what it asks, from how the device was held as the run began.)
    tilt: () => ({ on: tilting(), x: +tilt.x.toFixed(2), y: +tilt.y.toFixed(2), calm: +tilt.calm.toFixed(1), ask: { x: +ask.x.toFixed(2), y: +ask.y.toFixed(2) } }),
    // (Riding: how wild the tricks are, and the trick being made, if one is.)
    // (With orcs and weapons, the meter filled so far, nothing to one; `meter`, how full it is.)
    wild: (w: number) => { if (orcsOn) { wildEarned = clamp(w, 0, 1) * WILD.blocks; showWild(); } else wildInput.value = String(w); },
    meter: () => ({ earned: +wildEarned.toFixed(2), of: WILD.blocks, full: wildFull(), wildness: +wildness().toFixed(3) }), trick: () => (rideTrick ? demoName(rideTrick.trick) : null),
    // (How long the `i`th kicker that stands is reckoned to keep a skier going at `speed` in the air.)
    airtime: (i: number, speed: number) => { const all = Array.from({ length: 60 }, (_, n) => kickerOf(n)).filter((k): k is Kicker => !!k && k.s < land.length); return airtimeOff(all[i] ?? all[0], speed); },
    // (Where the skier's hips are in the picture: -1 to 1 across and up it, 0 its middle.)
    onScreen: () => { const p = focus().addScaledVector(UP, 0.9).project(camera); return [+p.x.toFixed(2), +p.y.toFixed(2)]; },
    step: (seconds: number) => { let at: Now | null = null; for (let i = 0; i < Math.round(seconds * 120); i++) { askRide(); at = stepRide(1 / 120); } if (at && !air && !crash) layRide(at); placed = false; return { ...ride }; },
    // (Riding: what is happening in the air or on the ground, the kickers, and to put the skier anywhere going anyhow.)
    state: () => ({ air: air && { ...air }, crash: crash && { why: crash.why, still: stillFor(), rest: atRest(), at: fallenAt().toArray(), bodies: crash.dolls.map((d) => d.doll.middle().toArray()) }, told: { ...told } }),
    // (The `i`th kicker that stands, counting from the top; and where the skier is put, by how far down the run and across it.)
    // (How each size would land off the `i`th kicker standing, slower and faster: for weighing `kickSize`.)
    // (Riding, the `i`th kicker taken from `back` metres before it (40) at `kmh`: with `trick`, or (`null`) the one chosen for it as
    // riding chooses, by the *Mild*-*Wild* slider; steered onto it as the demo run's pilot lines up on one, tucked. What came of it, how
    // fast it went off its lip, and whether it was braked for (`tooFast`); or, `stop` seconds into the air, held there, for a picture.)
    fly: (i: number, trick: DemoTrick | null, kmh: number, stop?: number, back = 40) => {
      const k = standing(i + 1)[i];
      restart();
      ride.way = ride.facing = 0; ride.switch = !!trick?.switch;
      putAt(k.s - back, k.left); placeKickers(ride.down); ride.y = ground(ride.x, ride.z); ride.vy = risingHere(); ride.speed = kmh / 3.6;
      rideTrick = trick ? { k, trick, air: null } : null;
      let flew: Air | null = null, lip = 0, checked = false;
      const toLipOf = () => k.L - ((ride.x - k.x) * k.dx + (ride.z - k.z) * k.dz);
      for (let n = 0; n < 3000; n++) {
        if (!air) {
          const go = along(ride.way, here), kd = runDir(k), kl = runLeft(k), off = (ride.x - k.x) * kl.x + (ride.z - k.z) * kl.z;
          const way = Math.atan2(go.dot(kl), go.dot(kd)), aimAt = clamp(Math.atan2(-off, Math.max(toLipOf(), 6)) * 1.3, -0.45, 0.45);
          stick.x = clamp((way - aimAt) * 3, -0.6, 0.6); stick.y = 1;
        }
        askRide(); checked ||= want.brake;
        const was = ride.speed;
        stepRide(1 / 120);
        if (air && !flew && Math.abs(toLipOf()) < 25) { flew = air; lip = was; }
        if (crash || (flew && !air) || (stop !== undefined && air && air.t >= stop)) break;
      }
      stick.x = stick.y = 0;
      if (stop !== undefined) { playing = false; placed = false; reflect(); }
      return { lip: +(lip * 3.6).toFixed(0), T: flew ? +flew.T.toFixed(2) : 0, chosenFor: +pickedFor.toFixed(2), flown: flew ? +flew.t.toFixed(2) : 0, done: flew?.done == null ? null : +flew.done.toFixed(2), did: flew?.name ?? '', fell: crash?.why ?? null, checked, safe: +(safeOff(k) * 3.6).toFixed(0) };
    },
    // (How hard a flight off the `i`th kicker comes down, built at `size`, taken at each of `speeds` (metres a second, on the run before it).)
    // (Where the middle of each of the skier's bodies is, in its own frame (x to its left, y up from its soles, z ahead), as posed now;
    // and of all of them together, each joint alike.)
    bodyMiddle: () => {
      rider.updateMatrixWorld(true);
      const inv = rider.matrixWorld.clone().invert(), all = new Vector3();
      let n = 0;
      const each = skier.bodies().map((b) => { const m = new Vector3(), js = Object.values(b.joints()); for (const j of js) { const l = j.clone().applyMatrix4(inv); m.add(l); all.add(l); n++; } return m.divideScalar(js.length).toArray().map((v) => +v.toFixed(2)); });
      return { each, all: all.divideScalar(n).toArray().map((v) => +v.toFixed(2)) };
    },
    // (What the last barrel roll was turned about, in the skier's own frame (x to its left, y up, z ahead): the line, and a point on it.)
    rollAxis: () => rolledAbout && { axis: rolledAbout.axis.toArray().map((v) => +v.toFixed(3)), mid: rolledAbout.mid.toArray().map((v) => +v.toFixed(2)) },
    // (The last round fired: from where, and which way.)
    lastShot: () => lastShot && { from: lastShot.from.toArray(), dir: lastShot.dir.toArray() },
    // (Where a point on the picture, `x` across and `y` down in its pixels, looks out to from the eye: for a script to tell a shot aimed
    // there from one gone elsewhere.)
    rayAt: (x: number, y: number) => { const r = canvas.getBoundingClientRect(), v = new Vector2(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2), rc = new Raycaster(); rc.setFromCamera(v, camera); const far = snowAlong(rc.ray.origin, rc.ray.direction, 600); return { from: rc.ray.origin.toArray(), dir: rc.ray.direction.toArray(), snow: Number.isFinite(far) ? rc.ray.origin.clone().addScaledVector(rc.ray.direction, far).toArray() : null, rider: rider.position.toArray() }; },
    // (A run chosen as the map chooses one: riding a world's run, ridden off to it, `trip`; and the trip as it is.)
    rideTo: (id: string) => rideOn(id),
    trip: () => trip && { kind: trip.kind, way: trip.way, made: !!trip.land, started: trip.started, swapped: trip.swapped },
    // (The speed check, on or off, for trying the kickers without it.)
    speedCheck: (on: boolean, blow?: number) => { speedChecks = on; if (blow) { SPEED_CHECK.blow = blow; for (const k of kickerAt.values()) if (k) k.safe = undefined; } },
    landings: (i: number, size: number, speeds: number[]) => { const all = Array.from({ length: 60 }, (_, k) => kickerOf(k)).filter((k): k is Kicker => !!k && k.s < land.length); const k = all[i] ?? all[0]; return speeds.map((v) => { const o = kickFlight(k, kickDims(size), v); return { v, u: +o.u.toFixed(1), f: +o.f.toFixed(2), blow: +o.blow.toFixed(1) }; }); },
    flights: (i: number) => { const all = Array.from({ length: 60 }, (_, k) => kickerOf(k)).filter((k): k is Kicker => !!k && k.s < land.length); const k = all[i] ?? all[0]; return KICK_SIZES.map((size) => ({ size, slow: kickFlight(k, kickDims(size), KICK_SPEED - 3), fast: kickFlight(k, kickDims(size), KICK_SPEED + 3) })); },
// (The orcs brought down riding, over the session, which say the arm carried: read, or set, as a script would to try each arm; and
    // the trigger, held or let go, as the button is, and pulled once as a click does.)
    slain: (n?: number) => { if (n !== undefined) slain = Math.max(0, n); return { slain, arm: armAfter(slain).arm.kind }; },
// (Off the piste: whether it is allowed and may be now, how long the skier has been out past the poles, and where they are.)
    /**
     * The stones (`STONES`): how much snow lies `down` along the run and `left` across it (1, snow; 0, stones); or, asked of nothing,
     * under the skier now, and over the whole run, the share of the piste, and of the snow beyond it, that is bare (every two metres).
     */
    stones: (down?: number, left?: number) => {
      const snowAt = (s: number, l: number) => { const p = land.at(s, l); return land.snowAt?.(p.x, p.z) ?? 1; };
      if (down !== undefined) return +snowAt(down, left ?? 0).toFixed(3);
      let on = 0, onBare = 0, off = 0, offBare = 0;
      for (let s = 0; s < Math.min(land.length, 5000); s += 2) {
        const [lo, hi] = land.edges(s);
        for (let l = -(land.half - 3); l <= land.half - 3; l += 2) {
          const bare = snowAt(s, l) < 0.5, inside_ = l >= lo && l <= hi;
          if (inside_) { on++; if (bare) onBare++; } else { off++; if (bare) offBare++; }
        }
      }
      return { here: +(land.snowAt?.(ride.x, ride.z) ?? 1).toFixed(3), stones: +ride.stones.toFixed(2), over: +ride.overStones.toFixed(1), piste: +(onBare / Math.max(1, on)).toFixed(4), beyond: +(offBare / Math.max(1, off)).toFixed(4) };
    },
    offPiste: () => ({ allowed: offPisteOn, now: offPisteOk(), for: +offPisteFor.toFixed(2), edges: land.edges(ride.down), reach: reachAt(ride.down), left: +ride.left.toFixed(1) }),
    trigger: (on: boolean) => { firing = on; if (on) { shotClock = SHOT; pull(); } },
    // (The arms aiming themselves: `aiming('free' | 'auto')`; the foe locked on, and its strength in hit points; `cycle(1)` to the right;
    // the last rolls made, newest last.)
    aiming: (how?: 'auto' | 'free') => { if (how) setAiming(how === 'auto'); return autoAim ? 'auto' : 'free'; },
    target: () => { const h = lock.orc >= 0 ? horde.health(lock.orc) : null; return h && horde.coming(lock.orc) ? { orc: lock.orc, name: horde.titleOf(lock.orc), kind: horde.kindOf(lock.orc)?.name, hp: Math.ceil(h.hp * HP), most: Math.round(h.most * HP), chosen: lock.chosen, far: +horde.middle(lock.orc).distanceTo(rider.position).toFixed(1), lockable: lock.list.length } : null; },
    cycle: (by = 1) => { cycleLock(by); return lock.orc; },
    rolls: () => rolls.map((r) => ({ foe: r.foe, arm: r.arm, say: r.say })),
    // (The sword `k` of the way through a swing at `side` (1, the right), held there while all is held still: for pictures.)
    // (The nearest tree ahead of the skier down the run, within `most` metres along it and `wide` either side: how far down the run
    // and across it its middle stands, and how far out it reaches, `Land.treeNear`.)
    treeAhead: (most = 120, wide = 25) => {
      for (let d = 1; d <= most; d += 0.5) for (let l = 0; l <= wide; l += 0.5) for (const side of l ? [1, -1] : [1]) {
        const p = land.at(ride.down + d, ride.left + side * l), t = land.treeNear?.(p.x, p.z, 0.01);
        if (t) { const f = land.frame(t.x, t.z, ride.down + d); return { down: +f.s.toFixed(2), left: +f.left.toFixed(2), r: +t.r.toFixed(2), tall: +t.tall.toFixed(1) }; }
      }
      return null;
    },
    swingAt: (k: number, side: number, charge = 0) => { swing = { ...newSwing(side, false, k), charge }; },
    kicker: (i: number) => { const all = Array.from({ length: 60 }, (_, k) => kickerOf(k)).filter((k): k is Kicker => !!k && k.s < land.length); const k = all[i] ?? all[0]; return { down: k.s, left: k.left, length: k.L, size: k.size, safe: +(safeOff(k) * 3.6).toFixed(0), height: k.H, edges: land.edges(k.s), x: k.x, z: k.z, dx: k.dx, dz: k.dz }; },
    put: (o: Partial<typeof ride>) => { Object.assign(ride, o); if (o.down !== undefined || o.left !== undefined) { putAt(ride.down, ride.left); placeKickers(ride.down); ride.y = ground(ride.x, ride.z); ride.vy = risingHere(); } placed = false; },
    land: () => ({ name: land.name, length: land.length, half: land.half, about: land.about }),
    setSkier: (w: Who, skis?: HorseSkis) => setSkier(w, skis), who: () => who,
    // (The view from so far east, up and south of the skier, looking at it: for pictures.)
    lookFrom: (dx: number, dy: number, dz: number) => __look(new Vector3(dx, dy, dz)),
    // (The view from `from` looking at `at`, both in the scene, kept as the skier goes: for pictures of what is not the skier.)
    lookAt: (from: number[], at: number[]) => { __look(new Vector3()); camera.position.fromArray(from); heldLook = new Vector3().fromArray(at); controls.target.copy(heldLook); controls.update(); },
    // (For a script measuring what each part of the picture costs: the present view drawn `frames` times, each waited for to be done,
    // with some things changed for the while; how long a frame took, in milliseconds, and what was drawn. `hide` names parts of the
    // land (`run`, `about`, `country`, `firs`, `far firs`, `poles`) or `skier`.)
    bench: async (o: { frames?: number; ratio?: number; blur?: number; shadows?: boolean; shadowSize?: number; firShadows?: boolean; hide?: string[] }) => {
      const was = { ratio: renderer.getPixelRatio(), blur: blurLevel, shadows: sun.castShadow, size: sun.shadow.mapSize.x };
      const hidden: Object3D[] = [];
      for (const name of o.hide ?? []) { const m = name === 'skier' ? rider : land.group.getObjectByName(name); if (m && m.visible) { m.visible = false; hidden.push(m); } }
      const firs = land.group.getObjectByName('firs'), firsCast = firs?.castShadow;
      if (firs && o.firShadows !== undefined) firs.castShadow = o.firShadows;
      if (o.ratio) { renderer.setPixelRatio(o.ratio); fit(); }
      const wasRes = res;
      res = 1;
      if (o.blur !== undefined) blurLevel = o.blur;
      if (o.shadows !== undefined) sun.castShadow = o.shadows;
      if (o.shadowSize) { sun.shadow.mapSize.set(o.shadowSize, o.shadowSize); sun.shadow.map?.dispose(); (sun.shadow as unknown as { map: unknown }).map = null; }
      const backend = (renderer as unknown as { backend: { gl?: WebGL2RenderingContext; device?: { queue: { onSubmittedWorkDone(): Promise<void> } } } }).backend;
      const done = async () => { if (backend.gl) backend.gl.readPixels(0, 0, 1, 1, backend.gl.RGBA, backend.gl.UNSIGNED_BYTE, new Uint8Array(4)); else await backend.device?.queue.onSubmittedWorkDone(); };
      const draw = (p: RenderPipeline) => { if (blurLevel > 0) { uShutter.value = 0.3 * blurLevel; uBlur.value = blurLevel; uFocus.value = Math.max(3, camera.position.distanceTo(rider.position)); p.render(); } else sharp.render(); };
      const p = pipeline;
      // (Each drawn in a frame of the browser's own, as the page's frames are: the renderer counts frames by them, and the scene's
      // picture is drawn once a frame, so that drawn twice within one only the blur was drawn again. The page's own frames wait. The
      // first frame after a change makes its shaders, and is not counted.)
      benching = true;
      const tick = () => new Promise((r) => requestAnimationFrame(r));
      await tick(); draw(p); await done();
      const frames = o.frames ?? 4;
      let ms = 0;
      for (let i = 0; i < frames; i++) { await tick(); const t0 = performance.now(); draw(p); await done(); ms += performance.now() - t0; }
      ms /= frames;
      const info = { triangles: renderer.info.render.triangles, calls: renderer.info.render.drawCalls };
      benching = false;
      for (const m of hidden) m.visible = true;
      if (firs) firs.castShadow = firsCast!;
      if (o.ratio) { renderer.setPixelRatio(was.ratio); fit(); }
      res = wasRes;
      blurLevel = was.blur; sun.castShadow = was.shadows;
      if (o.shadowSize) { sun.shadow.mapSize.set(was.size, was.size); sun.shadow.map?.dispose(); (sun.shadow as unknown as { map: unknown }).map = null; }
      return { ms: +ms.toFixed(1), ...info };
    },
    // (What was drawn in the last frame.)
    drawn: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.drawCalls }),
    // (A run by its slice's name, or `groomed`; `world` for the first run, as the page named it before it had two.)
    setLand: (k: LandKind) => setLand(k === 'world' ? runs[0].id : k),
    // (The view from `d` metres to the left of the skier across the run, `up` over it and `back` up the run, carried along with it:
    // for pictures of a trick side on.)
    lookSide: (d: number, up: number, back = 0) => { const f = land.frame(rider.position.x, rider.position.z, ride.down); __look(runLeft(f).multiplyScalar(d).addScaledVector(UP, up).addScaledVector(runDir(f), -back)); },
    // (The cinematic view's shot now, and when it began and ends.)
    shot: () => (shotNow ? `${shotNow.kind} ${shotNow.t0.toFixed(1)}-${shotNow.t1.toFixed(1)}` : ''),
    // (The views' distance from the skier, as the *Distance* slider sets it.)
    distance: (d: number) => setDistance(d),
    restart, time: () => t, ready: true,
    // (Riding, the run's end: how long since the arm began to rise, whether it has the skier, and how far into its flight, of how long.)
    // (The run's end: which it is to be, or to be it, by chance if none (`null`); and the whirlwind as it is.)
    ending: (kind?: Ending | null) => { if (kind !== undefined) { endingAsked = kind; if (kind) ending = kind; } return ending; },
    // (The way back as the player has it, or to set it; whether it is being asked, and to answer.)
    backBy: (w?: BackBy) => { if (w) setBackBy(w); return backBy; }, asking: () => asking, takeWay: (w: Dealt | 'random', remember = false) => { rememberWay.checked = remember; takeWay(w); },
    carting: () => !!carting,
    inside: () => inside && { pivot: +inside.pivot.toFixed(1), reversed: inside.reversed, front: fold && (fold.front === Infinity ? 'all' : +fold.front.toFixed(0)) },
    whirl: () => ({ shown: whirl.group.visible, strength: +whirl.strength.toFixed(2), at: whirl.base.toArray().map((v) => +v.toFixed(1)), height: +whirl.height().toFixed(0) }),
    arm: () => cat && { by: cat.by, t: +cat.t.toFixed(2), at: cat.at.toArray().map(Math.round), eye: camera.position.toArray().map(Math.round), rider: rider.position.toArray().map(Math.round), carry: cat.saucer && { flies: +cat.saucer.flies.toFixed(2), climb: +cat.saucer.climb.toFixed(0), far: +Math.hypot(cat.saucer.over.x - cat.saucer.hover.x, cat.saucer.over.z - cat.saucer.hover.z).toFixed(0) }, held: cat.held, flown: +cat.flown.toFixed(2), free: cat.fly && +cat.fly.free.toFixed(2), leaves: cat.fly && +cat.fly.velocity(0).length().toFixed(1), rode: cat.at.toArray().map((v) => +v.toFixed(2)), total: cat.fly && +cat.fly.total.toFixed(2), open: cat.fly && +cat.fly.open.toFixed(1) },
    // (Which demo run is watched: the orc hunt, or the tricks'.)
    hunt: (on: boolean) => { setDemoKind(on ? 'orcs' : 'tricks'); },
    // (The showcase, watched; and where it has got to: its arm now, and whether its end is ridden out or it has gone back to its top.)
    showcase: () => { setDemoKind('show'); setMode('watch'); },
    show: () => ({ kind: demoKind, arm: mode === 'watch' && demoKind === 'show' ? showArm().kind : null, ending: showEnding, back: +showBack.toFixed(2) }),
    // (For a video made a frame at a time: told of each round and cry as it is made, their sound made afterwards, and told once each
    // frame is drawn, with `?dt=` set; none, with nothing.)
    heard: (fn: ((kind: Heard) => void) | null) => { gunSound.heard = fn; },
    soundOf: (events: { kind: Heard; at: number }[], seconds: number) => gunSound.render(events, seconds),
    everyFrame: (fn: (() => void) | null) => { afterFrame = fn; },
    // (As if the graphics had failed as the page opened: to try the falling back to a simpler picture, `fallBack`.)
    failGraphics: (why = 'tried') => fallBack(why),
    // (With the tommy gun: how many orcs are about, and how many have been brought down.)
    // (The arena laid for a great one, if there is one: where its pipe's foot, lip and end are along the run, its middle and half its
    // breadth across it, how far it has sunk; its pen; how many boosters are still to be taken.)
    // (The ridden tracks kept: the run being ridden, and of each chunk its run, its steps, and how faint it is drawn.)
    tracks: () => ({ run: rideRun, pooled: chunkPool.length, chunks: rideChunks.map((c) => ({ run: c.run, laid: c.laid, skis: c.meshes.length, opacity: (c.meshes[0].material as Material).opacity })) }),
    slowmo: (on?: boolean) => { if (on !== undefined) setSlowmo(on); return { on: slowmoOn, scale: timeScale, jump: !!slowJump, was: slowJump?.was ?? null, view }; },
    arena: () => arena && { foot: arena.pipe.foot, lip: arena.pipe.foot + arena.pipe.lip, top: arena.pipe.top, end: arena.pipe.foot + arena.pipe.end, mid: arena.pipe.mid, half: arena.pipe.half, sunk: arena.pipe.sunk, sinking: arena.sinking, pen: horde.pen, penned: horde.penned, boosters: boosters.where().length },
    // (The great one being sent off, if one is: by what, how far through; and `by`, what the next is sent off by.)
    launch: (by?: string) => { if (by) launchNext = by as LaunchBy; const l = launches.find((x) => x.by !== 'plain') ?? launches[0]; return l && { by: l.by, t: +l.t.toFixed(2), thrown: l.thrown, at: l.model.position.toArray().map((v) => +v.toFixed(1)), all: launches.map((x) => x.by) }; },
    // (Only one kind of foe comes, for a script trying it (`slopeFoes.ts`); `null`, every kind again; and from how far ahead.)
    foes: (only: FoeKind['name'] | null, ahead?: [number, number]) => { horde.only = only; if (ahead) horde.ahead = ahead; horde.clear(); },
    orcs: () => ({ about: horde.about, downed: horde.downed, kinds: horde.kinds(), coming: horde.where().map((p) => { const s = p.clone().setY(p.y + 0.4).project(camera); return { at: p.toArray().map((v) => +v.toFixed(1)), screen: [+s.x.toFixed(3), +s.y.toFixed(3)] }; }) }),
    // (The game's own trees on the land about the run, where it has them: where each stands, what it is, how tall.)
    trees: () => (land.group.getObjectByName('woods')?.userData.trees ?? []) as { x: number; z: number; kind: string; tall: number }[],
    // (How long each stage of opening took, in milliseconds.)
    loadTimes: () => loading.times,
    // (On foot, turned to face a point, for a script.)
    faceTo: (x: number, z: number) => { if (foot) { foot.heading = Math.atan2(x - foot.x, z - foot.z); placed = false; } return !!foot; },
    // (The cave, where the run has one: what it is made of, where its camp is, the one on foot, how dark it is about the eye.)
    cave: () => { const c = caveNow(); if (!c) return null; const o = land.group.position; return { ...c.counts, made: Math.round(caveMade), s: +c.site.s.toFixed(0), knoll: !!c.site.knoll, camp: [+(c.site.camp.x + o.x).toFixed(1), +(c.site.camp.z + o.z).toFixed(1)], foot: foot && { ...foot }, view: foot && +camera.position.distanceTo(new Vector3(foot.x, foot.y, foot.z)).toFixed(2), stopping, dark: +caveDark.toFixed(2), chest: c.chest.opened }; },
    // (Riding, put at the cave: on skis `back` metres up the run from its camp, coming down to it (`ride`); or on foot in the camp, inside
    // the gate, before the chest, or in room `back` (by its number); or, `chest`, a step from the chest, to open it; or, `tunnel`, `back`
    // metres in from the mouth.)
    goCave: (where: 'ride' | 'cart' | 'camp' | 'gate' | 'tomb' | 'room' | 'stair' | 'chest' | 'tunnel' = 'camp', back = 50) => {
      const c = caveNow();
      if (!c) return false;
      if (mode !== 'ride') setMode('ride');
      const o = land.group.position;
      // (`cart`: stopped `back` metres down the run from the camp, its end the rocket cart, to be driven back up into it.)
      if (where === 'cart') { leaveFoot(); const f = land.frame(c.site.camp.x + o.x, c.site.camp.z + o.z); putAt(f.s + back, f.left); placeKickers(ride.down); Object.assign(ride, { way: 0, speed: 0, ended: true }); ending = 'cart'; return true; }
      if (where === 'ride') { leaveFoot(); const f = land.frame(c.site.camp.x + o.x, c.site.camp.z + o.z); putAt(f.s - back, f.left); placeKickers(ride.down); ride.way = 0; ride.speed = 8; placed = false; return true; }
      const sp = where === 'chest' ? { x: c.chest.at.x + 1.2, z: c.chest.at.z, heading: -Math.PI / 2 } : where === 'tunnel' ? { ...sitePoint(c.site, back, 0), heading: Math.atan2(c.site.ax, c.site.az) } : c.spot(where, back);
      if (!foot) { const f = land.frame(sp.x + o.x, sp.z + o.z); putAt(f.s, f.left); ride.speed = 0; skisOff(); }
      Object.assign(foot!, { x: sp.x + o.x, z: sp.z + o.z, y: c.floorUnder(sp.x, sp.z) ?? land.height(sp.x + o.x, sp.z + o.z), heading: sp.heading, speed: 0, room: -1 });
      placed = false;
      return true;
    },
    // (Loot, `slopeLoot.ts`: something found, as a chest or a great one gives it, thrown up some metres ahead of the player and drawn to
    // it (riding); or, given a slot, the first such find drawn for that slot (of `rarity`, if given). What is in the pack and worn, and
    // what it comes to; something in it worn by its place in the pack (or nothing, `-1`); the pack emptied.)
    loot: (what: Source | Slot = 'boss', rarity?: Item['rarity']) => {
      if (!pack || mode !== 'ride') return null;
      const at = focus().add(along(ride.way, here).multiplyScalar(6)).addScaledVector(UP, 1);
      if (what === 'chest' || what === 'boss') return findLoot(what, at, 'given by a script')?.name ?? null;
      for (let n = 0; n < 2000; n++) {
        const it = rollLoot(lootRng.fork(`script ${finds++}`), n % 2 ? 'boss' : 'chest', pack.read, 'given by a script');
        if (it.slot === what && (!rarity || it.rarity === rarity)) { drops.add(it, at, at); return it.name; }
      }
      return null;
    },
    aimed: () => aimedAt.toArray().map((v) => +v.toFixed(2)),
    // (The shaders made from now on, each by what it was made for, its name (or its parent's) and its material: for a script to see
    // what was not made ready ahead (`warmSoon`). `shaders(true)` begins counting afresh; `shaders()` says what has been made since.)
    shaders: (fresh = false) => {
      const pipes = (renderer as unknown as { _pipelines?: { caches: Map<unknown, unknown>; getForRender: (o: { object: Object3D; material: Material }, p?: unknown) => unknown } })._pipelines;
      if (!pipes) return null;
      const w = window as unknown as { __late?: string[]; __lateOn?: boolean };
      if (!w.__lateOn) {
        w.__lateOn = true; w.__late = [];
        const was = pipes.getForRender.bind(pipes);
        pipes.getForRender = (o, p) => {
          const n = pipes.caches.size, r = was(o, p);
          if (pipes.caches.size > n) { let at: Object3D | null = o.object, name = ''; while (at && !name) { name = at.name; at = at.parent; } w.__late!.push(`${name || o.object.type} · ${o.material.type}${o.material.name ? ` ${o.material.name}` : ''}`); }
          return r;
        };
      }
      if (fresh) w.__late = [];
      return { total: pipes.caches.size, since: [...new Set(w.__late)] };
    },
    // (Whether the picture has been seen drawn, and how many times over since it came out black: `probeBlack`.)
    blackProbe: () => ({ seen: probeSeen, black: blackFor }),
    // (What it draws by, WebGPU or WebGL 2, and how simply.)
    graphics: () => ({ webgpu, safe: safe.level }),
    pack: () => pack && { items: pack.items.map((i) => ({ name: i.name, slot: i.slot, rarity: i.rarity, mods: i.mods, worn: pack!.worn[i.slot] === i.id })), read: [...pack.read], kit: { ...worn }, carried: carried().name, drops: drops.count },
    wear: (slot: Slot, n: number) => { if (!pack) return; const of = pack.items.filter((i) => i.slot === slot); pack.wear(slot, n < 0 ? null : of[n]?.id ?? null); },
    emptyPack: () => pack?.empty(),
    // (The tricks a kicker may be given now, by how long in the air: the guidebooks' among them.)
    learned: () => learned().map((p) => demoName(p.t)),
    // (The demo run as flown for the skier now: how long, its parts, the tricks it landed, how many times each kicker was flown again.)
    // (Every kicker standing on the run: which, how far down, across, how big.)
    kickers: () => Array.from({ length: 60 }, (_, i) => kickerOf(i)).filter((k): k is Kicker => !!k && k.s < land.length).map((k) => ({ i: k.i, s: +k.s.toFixed(1), left: +k.left.toFixed(1), size: k.size })),
    // (Where the demo run is `t` seconds in: how far down, across, how fast.)
    demoAt: (at: number) => { const w = watchPose(at); return { down: +w.down.toFixed(2), left: +w.left.toFixed(2), speed: +w.speed.toFixed(2) }; },
    demo: () => ({ length: demo.length, parts: demo.parts, landed: demo.landed, tries: demo.tries, fell: demo.fell, flown: demo.flown }),
  };
  requestAnimationFrame(frame);
}

start().catch((e) => { loading.fail(`The run could not be made: ${(e as Error)?.message ?? e}`); console.error(e); });
