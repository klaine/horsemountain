import {
  CanvasTexture, DoubleSide, InstancedBufferAttribute, InstancedInterleavedBuffer, InstancedMesh, InterleavedBufferAttribute,
  NoColorSpace, PlaneGeometry, BufferGeometry, Float32BufferAttribute, SRGBColorSpace, StaticDrawUsage, Texture, Vector2, Vector3,
  DataTexture, NearestFilter, RGBAFormat, UnsignedByteType,
} from 'three';
import { MeshStandardNodeMaterial, PhysicalLightingModel } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import { CardSet } from './scene';

/**
 * Drawing what grows. Each kind of card has one small painted texture and one material; every
 * card of that kind in the scene is drawn together. The paint is pale and takes its colour from
 * the card, so one texture serves spring green, dry yellow and blossom alike.
 */

// (The pieces of shader program used below, taken untyped: see the note in `siteMaterial.ts`.)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
const { Fn, abs, attribute, cameraPosition, clamp, cos, diffuseColor, distance, dot, faceDirection, float, floor, mix, normalMap, normalView, normalViewGeometry, normalize, positionLocal, positionViewDirection, positionWorld, pow, sin, smoothstep, texture: tex, transformNormalToView, uniform, uv, vec2, vec3 } = TSL as N;

/**
 * `uGrassTall` multiplies how tall grass stands, and `uGrassVary` (0 to 1) makes it more unequal: at 0 it is as it was planted, at 1 some
 * tufts stand near twice as tall and others are cropped to a third, in drifts some metres across and tuft by tuft within them.
 */
export const vegetationUniforms: { uTime: { value: number }; uWind: { value: number }; uGrassTall: { value: number }; uGrassVary: { value: number } } = { uTime: uniform(0), uWind: uniform(1), uGrassTall: uniform(1), uGrassVary: uniform(0) };

/**
 * How light falls on a leaf. Light comes through a leaf as well as off it: seen against the sun
 * a crown glows, and its shaded side is not black. (The light used here has already been
 * through the shadow map, so leaves in shade stay dark.) And leaves and blades are matt: left
 * alone, every card would mirror the sky at a glancing angle, and a meadow seen from head
 * height is all glancing angles; it turns pale and blue.
 */
class LeafLighting extends (PhysicalLightingModel as N) {
  constructor(private readonly through: number, private readonly gleam = 0.2) {
    super();
  }

  direct(data: N, builder: N): void {
    super.direct(data, builder);
    const against = dot(positionViewDirection.negate(), data.lightDirection).clamp().pow(3);
    const behind = dot(normalView, data.lightDirection).negate().clamp();
    data.reflectedLight.directDiffuse.addAssign(data.lightColor.mul(diffuseColor.rgb).mul(vec3(1.2, 1.25, 0.55)).mul(against.mul(0.9).add(behind.mul(0.22))).mul(this.through / Math.PI));
  }

  indirect(builder: N): void {
    super.indirect(builder);
    const reflected = builder.context.reflectedLight;
    reflected.indirectSpecular.assign(vec3(0));
    reflected.directSpecular.mulAssign(this.gleam);
  }
}

function canvasOf(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

const grey = (v: number, a = 1) => `rgba(${Math.round(v * 255)},${Math.round(v * 255)},${Math.round(v * 255)},${a})`;

/** Paints the texture for one kind of card. Light and dark only: colour comes from the card. */
export function paintCards(kind: CardSet['kind'], seed = 1): Texture {
  // Leaves are looked at closely and are worth four times the paint.
  const size = kind === 'leaf' ? 1024 : kind === 'pine' ? 512 : 256;
  const [canvas, ctx] = canvasOf(size);
  const rng = new Rng(`cards/${kind}/${seed}`);
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  if (kind === 'grass') {
    // Blades from the foot of the card, leaning and tapering, lighter towards the tip.
    for (let k = 0; k < 70; k++) {
      const x0 = rng.range(0.08, 0.92) * size, h = Math.pow(rng.next(), 0.6) * 0.95 * size, lean = rng.range(-0.22, 0.22) * size;
      const tone = rng.range(0.55, 1.0);
      const steps = 7;
      for (let s = 0; s < steps; s++) {
        const f0 = s / steps, f1 = (s + 1) / steps;
        ctx.strokeStyle = grey(tone * (0.55 + 0.45 * f1));
        ctx.lineWidth = Math.max(1, (1 - f0) * rng.range(3.5, 6.5));
        ctx.beginPath();
        ctx.moveTo(x0 + lean * f0 * f0, size - h * f0);
        ctx.lineTo(x0 + lean * f1 * f1, size - h * f1);
        ctx.stroke();
      }
    }
  } else if (kind === 'flower') {
    for (let k = 0; k < 9; k++) {
      const x0 = rng.range(0.15, 0.85) * size, h = rng.range(0.45, 0.92) * size, lean = rng.range(-0.1, 0.1) * size;
      // The stem is drawn very dark, so that the card's colour barely shows on it.
      ctx.strokeStyle = grey(0.16);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x0, size);
      ctx.quadraticCurveTo(x0, size - h * 0.5, x0 + lean, size - h);
      ctx.stroke();
      const r = rng.range(7, 12);
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + k;
        ctx.fillStyle = grey(rng.range(0.85, 1));
        ctx.beginPath();
        ctx.ellipse(x0 + lean + Math.cos(a) * r * 0.7, size - h + Math.sin(a) * r * 0.7, r * 0.62, r * 0.4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'fern') {
    // Fronds arching out from the foot of the card, each a midrib with leaflets down both sides.
    for (let k = 0; k < 7; k++) {
      const lean = (k / 6 - 0.5) * 1.9 + rng.range(-0.12, 0.12), reach = rng.range(0.62, 0.95) * size, tone = rng.range(0.6, 1.0);
      let x = size / 2, y = size - 2, dir = -Math.PI / 2 + lean * 0.55;
      const steps = 22;
      for (let s = 0; s < steps; s++) {
        const f = s / steps, nx = x + Math.cos(dir) * (reach / steps), ny = y + Math.sin(dir) * (reach / steps);
        ctx.strokeStyle = grey(tone * 0.55);
        ctx.lineWidth = 2.2 * (1 - f) + 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        // Leaflets: longest a third of the way up, dwindling to the tip.
        const len = size * 0.085 * Math.sin(Math.min(1, f * 1.5 + 0.12) * Math.PI) * (1.15 - f * 0.5) + 2;
        for (const side of [-1, 1]) {
          ctx.strokeStyle = grey(tone * rng.range(0.75, 1.0));
          ctx.lineWidth = 3.2 * (1 - f * 0.6);
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx + Math.cos(dir + side * 1.25) * len, ny + Math.sin(dir + side * 1.25) * len);
          ctx.stroke();
        }
        x = nx; y = ny;
        dir += lean * 0.055;
      }
    }
  } else if (kind === 'herb') {
    // Tall stems with leaves low down and a flat head of small flowers at the top of each.
    for (let k = 0; k < 6; k++) {
      const x0 = rng.range(0.2, 0.8) * size, h = rng.range(0.6, 0.96) * size, lean = rng.range(-0.12, 0.12) * size;
      ctx.strokeStyle = grey(0.3);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, size);
      ctx.quadraticCurveTo(x0, size - h * 0.5, x0 + lean, size - h);
      ctx.stroke();
      for (let l = 0; l < 5; l++) {
        const f = rng.range(0.08, 0.6), side = l % 2 ? 1 : -1, len = rng.range(16, 30) * (1 - f * 0.7);
        ctx.fillStyle = grey(rng.range(0.4, 0.6));
        ctx.beginPath();
        ctx.ellipse(x0 + lean * f * f + side * len * 0.5, size - h * f - len * 0.15, len * 0.55, len * 0.2, -side * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const spread = rng.range(16, 26);
      for (let d = 0; d < 26; d++) {
        const a = rng.range(Math.PI, Math.PI * 2), r = Math.sqrt(rng.next()) * spread;
        ctx.fillStyle = grey(rng.range(0.85, 1));
        ctx.beginPath();
        ctx.arc(x0 + lean + Math.cos(a) * r, size - h + Math.sin(a) * r * 0.45 + 3, rng.range(2.2, 3.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'reed') {
    // Reeds: tall narrow blades from the foot of the card to its top, arching a little at the
    // tip, and among them stems that carry a dark head of seed.
    for (let k = 0; k < 46; k++) {
      const x0 = rng.range(0.1, 0.9) * size, h = rng.range(0.55, 0.98) * size, lean = rng.range(-0.16, 0.16) * size, tone = rng.range(0.5, 1.0);
      const steps = 10, wide = rng.range(2.6, 4.6);
      for (let s = 0; s < steps; s++) {
        const f0 = s / steps, f1 = (s + 1) / steps;
        ctx.strokeStyle = grey(tone * (0.5 + 0.5 * f1));
        ctx.lineWidth = Math.max(1, (1 - f0 * 0.85) * wide);
        ctx.beginPath();
        ctx.moveTo(x0 + lean * f0 * f0 * f0, size - h * f0);
        ctx.lineTo(x0 + lean * f1 * f1 * f1, size - h * f1);
        ctx.stroke();
      }
    }
    for (let k = 0; k < 7; k++) {
      const x0 = rng.range(0.15, 0.85) * size, h = rng.range(0.7, 0.95) * size, lean = rng.range(-0.05, 0.05) * size;
      ctx.strokeStyle = grey(0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, size); ctx.lineTo(x0 + lean, size - h); ctx.stroke();
      // (The head brown, painted warm so that the green each reed is tinted with leaves it a chocolate brown, and lighter on one side
      // than the other, as a round thing is. Painted dark grey, it came out a flat black cut-out against the water.)
      const hx = x0 + lean, hy = size - h + size * 0.02, hw = size * 0.014;
      const round = ctx.createLinearGradient(hx - hw, 0, hx + hw, 0);
      round.addColorStop(0, 'rgb(190,118,86)');
      round.addColorStop(0.45, 'rgb(158,92,66)');
      round.addColorStop(1, 'rgb(84,48,36)');
      ctx.fillStyle = round;
      ctx.beginPath();
      ctx.ellipse(hx, hy, hw, size * 0.055, lean * 0.01, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'leaf') {
    // A spray: a twig across the card with lesser twigs off it, and on them leaves that can be
    // told apart. Each leaf is painted twice. Once as it looks: a pointed blade, darker at its
    // foot and lighter at its tip, one half a little darker than the other, with a pale midrib
    // and side veins, and a cast of its own (yellower for a young leaf, bluer for an old one).
    // And once as it lies: no leaf on a twig lies in the plane of the twig. Each is tipped its
    // own way, folded a little along its midrib, and droops from foot to tip; that is written
    // into a second picture as the way each point of the leaf faces, and the material lights
    // the leaf by it. A spray painted flat and lit flat is a paper cut-out, however it is drawn.
    const [reliefCanvas, lie] = canvasOf(size);
    lie.fillStyle = 'rgb(128,128,255)';
    lie.fillRect(0, 0, size, size);
    const cast = (tone: number, warm: number, a = 1) => {
      const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
      return `rgba(${c(tone * (1 + 0.16 * warm))},${c(tone)},${c(tone * (1 - 0.3 * warm))},${a})`;
    };
    // (A picture's rows run downward and a card's upward, so the upward lean is written reversed.)
    const facing = (nx: number, ny: number) => {
      const l = Math.hypot(nx, ny, 1);
      return `rgb(${Math.round((nx / l) * 127.5 + 127.5)},${Math.round((-ny / l) * 127.5 + 127.5)},${Math.round((1 / l) * 127.5 + 127.5)})`;
    };
    const leaf = (x: number, y: number, turn: number, len: number, tone: number) => {
      const wide = len * rng.range(0.34, 0.46), c = Math.cos(turn), s = Math.sin(turn);
      const at = (u: number, v: number): [number, number] => [x + c * u * len - s * v * wide, y + s * u * len + c * v * wide];
      const warm = rng.range(-0.7, 1), tipX = rng.range(-0.55, 0.55), tipY = rng.range(-0.55, 0.55), droop = rng.range(0.15, 0.6), fold = rng.range(0.25, 0.6);
      const shade = tone * 0.86;
      for (const half of [-1, 1]) {
        const blade = (to: CanvasRenderingContext2D) => {
          to.beginPath();
          to.moveTo(...at(0, 0));
          to.bezierCurveTo(...at(0.25, half * 1.1), ...at(0.7, half * 0.8), ...at(1, 0));
          to.closePath();
          to.fill();
        };
        const k = half < 0 ? 0.82 : 1;
        const look = ctx.createLinearGradient(...at(0, 0), ...at(1, 0));
        look.addColorStop(0, cast(shade * k * 0.7, warm - 0.2));
        look.addColorStop(0.55, cast(shade * k, warm));
        look.addColorStop(1, cast(shade * k * 1.12, warm + 0.25));
        ctx.fillStyle = look;
        blade(ctx);
        // This half leans in towards the midrib (a leaf is a shallow trough), and the whole leaf leans back at its foot and forward at its tip.
        const px = -s * half, py = c * half;
        const lean = lie.createLinearGradient(...at(0, 0), ...at(1, 0));
        lean.addColorStop(0, facing(tipX - px * fold - c * droop, tipY - py * fold - s * droop));
        lean.addColorStop(1, facing(tipX - px * fold + c * droop, tipY - py * fold + s * droop));
        lie.fillStyle = lean;
        blade(lie);
        // Side veins, from the midrib out towards the edge and forward.
        ctx.strokeStyle = cast(shade * 1.16, warm + 0.3, 0.45);
        ctx.lineWidth = Math.max(1, size / 700);
        for (let v = 0; v < 4; v++) {
          const u = 0.16 + v * 0.19;
          ctx.beginPath(); ctx.moveTo(...at(u, 0)); ctx.lineTo(...at(u + 0.16, half * 0.62 * (1 - u * 0.75))); ctx.stroke();
        }
      }
      ctx.strokeStyle = cast(shade * 1.22, warm + 0.4, 0.85);
      ctx.lineWidth = Math.max(1, size / 340);
      ctx.beginPath(); ctx.moveTo(...at(0, 0)); ctx.lineTo(...at(0.95, 0)); ctx.stroke();
    };
    const twig = (x0: number, y0: number, dir: number, reach: number, width: number, depth: number) => {
      const steps = Math.max(3, Math.round(reach / (size * 0.05)));
      let x = x0, y = y0, d = dir;
      for (let k = 0; k < steps; k++) {
        const f = k / steps, nx = x + Math.cos(d) * (reach / steps), ny = y + Math.sin(d) * (reach / steps);
        // (Brown against the leaves' green, as far as paint that is multiplied by the card's green can be.)
        ctx.strokeStyle = cast(0.34, 2.2);
        ctx.lineWidth = width * (1 - 0.7 * f);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        x = nx; y = ny;
        d += rng.range(-0.22, 0.22);
        if (depth > 0 && k > 0 && k % 2 === 0) twig(x, y, d + (k % 4 ? 1 : -1) * rng.range(0.6, 1.0), reach * rng.range(0.35, 0.5) * (1 - f * 0.4), width * 0.6, depth - 1);
        // Leaves stand off the twig to either side, turned a little forward, and one at the end.
        for (const side of [-1, 1]) if (rng.chance(0.85)) leaf(x, y, d + side * rng.range(0.5, 1.1), size * rng.range(0.085, 0.125), rng.range(0.5, 1.0));
      }
      leaf(x, y, d, size * rng.range(0.09, 0.13), rng.range(0.6, 1.0));
    };
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
      twig(size / 2, size / 2, a, size * rng.range(0.3, 0.42), size * 0.012, 1);
    }
    const relief = new CanvasTexture(reliefCanvas);
    relief.colorSpace = NoColorSpace;
    relief.anisotropy = 4;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    // (It goes with the picture, for whoever makes a material of it.)
    texture.userData.relief = relief;
    // And one leaf by itself, lying along its picture, for leaves that are made one by one (see `sprigClump`).
    {
      const w = 256, h = 128, c1 = document.createElement('canvas');
      c1.width = w; c1.height = h;
      const one = c1.getContext('2d')!;
      const at = (u: number, v: number): [number, number] => [6 + u * (w - 12), h / 2 + v * (h / 2 - 5)];
      for (const half of [-1, 1]) {
        const look = one.createLinearGradient(...at(0, 0), ...at(1, 0));
        const k = half < 0 ? 0.84 : 1;
        look.addColorStop(0, cast(0.86 * k * 0.72, -0.1));
        look.addColorStop(0.55, cast(0.86 * k, 0.1));
        look.addColorStop(1, cast(0.86 * k * 1.12, 0.35));
        one.fillStyle = look;
        one.beginPath();
        one.moveTo(...at(0, 0));
        one.bezierCurveTo(...at(0.25, half * 1.1), ...at(0.7, half * 0.8), ...at(1, 0));
        one.closePath();
        one.fill();
        one.strokeStyle = cast(1, 0.4, 0.5);
        one.lineWidth = 1.5;
        for (let v = 0; v < 5; v++) {
          const u = 0.14 + v * 0.16;
          one.beginPath(); one.moveTo(...at(u, 0)); one.lineTo(...at(u + 0.15, half * 0.62 * (1 - u * 0.75))); one.stroke();
        }
      }
      one.strokeStyle = cast(1, 0.5, 0.9);
      one.lineWidth = 2.5;
      one.beginPath(); one.moveTo(...at(0, 0)); one.lineTo(...at(0.96, 0)); one.stroke();
      // (A plain patch in the corner, for twigs, which have no picture of their own.)
      one.fillStyle = 'rgb(255,255,255)';
      one.fillRect(0, 0, 14, 14);
      const single = new CanvasTexture(c1);
      single.colorSpace = SRGBColorSpace;
      single.anisotropy = 4;
      texture.userData.single = single;
    }
    return texture;
  } else if (kind === 'needle') {
    // A conifer bough seen from above: a stem up the card with side shoots, all bristling with
    // needles, broad at the foot of the card (the trunk end is at the top).
    const shoot = (x0: number, y0: number, x1: number, y1: number, width: number) => {
      ctx.strokeStyle = grey(0.28);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 3.2);
      const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
      for (let k = 0; k < n; k++) {
        const f = k / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
        for (const side of [-1, 1]) {
          ctx.strokeStyle = grey(rng.range(0.45, 1.0));
          ctx.lineWidth = rng.range(1.6, 2.6);
          const l = width * rng.range(0.7, 1.1);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (nx / nl) * side * l + (x1 - x0) * 0.06, y + (ny / nl) * side * l + (y1 - y0) * 0.06);
          ctx.stroke();
        }
      }
    };
    shoot(size / 2, 6, size / 2, size - 8, 15);
    for (let k = 0; k < 9; k++) {
      const f = 0.12 + 0.8 * (k / 9), y = 6 + (size - 14) * f, reach = (0.16 + 0.3 * f) * size;
      for (const side of [-1, 1]) shoot(size / 2, y, size / 2 + side * reach * rng.range(0.8, 1.05), y + reach * rng.range(0.45, 0.75), 12);
    }
    // And one shoot by itself, lying along its picture: a twig with needles standing off it all the way along, leaning forward, the
    // newest at its tip the palest. Boughs that are made shoot by shoot wear it (see `boughSprig`).
    const w = 256, h = 64, c1 = document.createElement('canvas');
    c1.width = w; c1.height = h;
    const one = c1.getContext('2d')!;
    one.lineCap = 'round';
    one.strokeStyle = grey(0.26);
    one.lineWidth = 3;
    one.beginPath(); one.moveTo(3, h / 2); one.lineTo(w - 12, h / 2); one.stroke();
    for (let x = 4; x < w - 8; x += 2.2) {
      const f = x / w;
      for (const side of [-1, 1]) {
        one.strokeStyle = grey(rng.range(0.42, 0.9) * (0.8 + 0.3 * f));
        one.lineWidth = rng.range(1.5, 2.4);
        const l = (h / 2 - 3) * rng.range(0.6, 1) * (1 - 0.45 * Math.pow(f, 3));
        one.beginPath(); one.moveTo(x, h / 2); one.lineTo(x + l * rng.range(0.25, 0.6), h / 2 + side * l); one.stroke();
      }
    }
    const single = new CanvasTexture(c1);
    single.colorSpace = SRGBColorSpace;
    single.anisotropy = 4;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.userData.single = single;
    return texture;
  } else if (kind === 'pine') {
    // A pine's brush of needles, seen from the side: long needles fanning out from the end of a twig at the foot of the card, most of
    // them forward and some out to the sides, dark where they leave the twig and pale at their tips, and the twig itself below them.
    ctx.strokeStyle = grey(0.24);
    ctx.lineWidth = size * 0.022;
    ctx.beginPath(); ctx.moveTo(size / 2, size); ctx.lineTo(size / 2, size * 0.8); ctx.stroke();
    for (let k = 0; k < 170; k++) {
      const spread = (rng.next() - 0.5) * 2, a = spread * Math.abs(spread) * 1.25 + rng.range(-0.12, 0.12);
      const from = size * (0.99 - 0.2 * rng.next()), len = size * rng.range(0.5, 0.86) * (1 - 0.3 * Math.abs(spread)), tone = rng.range(0.5, 1), wide = rng.range(2.6, 4.4) * (size / 512);
      const droop = rng.range(-0.12, 0.2) * (a < 0 ? -1 : 1);
      const steps = 5;
      for (let st = 0; st < steps; st++) {
        const f0 = st / steps, f1 = (st + 1) / steps, at = (f: number): [number, number] => [size / 2 + Math.sin(a + droop * f) * len * f, from - Math.cos(a + droop * f) * len * f];
        ctx.strokeStyle = grey(tone * (0.42 + 0.58 * f1));
        ctx.lineWidth = Math.max(1, wide * (1 - 0.6 * f0));
        ctx.beginPath(); ctx.moveTo(...at(f0)); ctx.lineTo(...at(f1)); ctx.stroke();
      }
    }
  } else if (kind === 'fir') {
    // A whole fir: a spire of drooping tiers, widest near the foot, each lighter at its edge.
    // Painted solid, because it is only ever seen small, and what is thin would vanish.
    ctx.fillStyle = grey(0.3);
    ctx.fillRect(size * 0.485, size * 0.82, size * 0.03, size * 0.18);
    for (let k = 0; k < 13; k++) {
      const f = k / 12, y = size * (0.04 + 0.84 * f), half = size * (0.03 + 0.4 * Math.pow(f, 0.85)) * rng.range(0.85, 1.1), drop = size * 0.085;
      for (const side of [-1, 1]) {
        ctx.fillStyle = grey(rng.range(0.5, 0.72) + 0.25 * (1 - f));
        ctx.beginPath();
        ctx.moveTo(size / 2, y - drop * 0.6);
        ctx.quadraticCurveTo(size / 2 + side * half * 0.6, y - drop * 0.1, size / 2 + side * half, y + drop * rng.range(0.7, 1.2));
        ctx.lineTo(size / 2 + side * half * 0.5, y + drop * 0.55);
        ctx.lineTo(size / 2, y + drop * 0.9);
        ctx.fill();
      }
    }
  } else if (kind === 'tree') {
    // A whole broadleaved tree: a short trunk and a crown of rounded masses, lighter above.
    ctx.fillStyle = grey(0.28);
    ctx.fillRect(size * 0.475, size * 0.66, size * 0.05, size * 0.34);
    for (let k = 0; k < 46; k++) {
      const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()), x = size * (0.5 + 0.34 * d * Math.cos(a)), y = size * (0.4 + 0.3 * d * Math.sin(a));
      ctx.fillStyle = grey(0.5 + 0.45 * (1 - y / (size * 0.72)) + rng.range(-0.08, 0.08));
      ctx.beginPath();
      ctx.ellipse(x, y, size * rng.range(0.07, 0.13), size * rng.range(0.06, 0.1), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'thrift') {
    // Thrift: a low cushion of fine dark leaves, and over it round heads of flowers on bare stems.
    for (let k = 0; k < 60; k++) {
      const x0 = size * (0.5 + rng.range(-0.38, 0.38)), h = size * rng.range(0.12, 0.3), lean = rng.range(-0.15, 0.15) * size;
      ctx.strokeStyle = grey(rng.range(0.12, 0.2));
      ctx.lineWidth = rng.range(2, 3.5);
      ctx.beginPath(); ctx.moveTo(x0, size); ctx.lineTo(x0 + lean, size - h); ctx.stroke();
    }
    for (let k = 0; k < 11; k++) {
      const x0 = size * (0.5 + rng.range(-0.3, 0.3)), h = size * rng.range(0.45, 0.88), lean = rng.range(-0.12, 0.12) * size;
      ctx.strokeStyle = grey(0.22);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, size); ctx.quadraticCurveTo(x0, size - h * 0.6, x0 + lean, size - h); ctx.stroke();
      const r = size * rng.range(0.045, 0.065);
      for (let d = 0; d < 24; d++) {
        const a = rng.range(0, Math.PI * 2), rr = Math.sqrt(rng.next()) * r;
        ctx.fillStyle = grey(rng.range(0.75, 1));
        ctx.beginPath(); ctx.arc(x0 + lean + Math.cos(a) * rr, size - h + Math.sin(a) * rr, rng.range(2.5, 4), 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (kind === 'marram') {
    // Marram: stiff blades rolled tight against the wind, arching over from a dense foot, pale at their tips.
    for (let k = 0; k < 64; k++) {
      const x0 = size * (0.5 + rng.range(-0.3, 0.3)), h = rng.range(0.55, 0.98) * size, lean = rng.range(-0.42, 0.42) * size;
      const steps = 9, wide = rng.range(2.2, 3.6), tone = rng.range(0.55, 1);
      for (let st = 0; st < steps; st++) {
        const f0 = st / steps, f1 = (st + 1) / steps;
        ctx.strokeStyle = grey(tone * (0.45 + 0.55 * f1));
        ctx.lineWidth = Math.max(1, (1 - f0 * 0.9) * wide);
        ctx.beginPath();
        ctx.moveTo(x0 + lean * f0 * f0, size - h * f0 + lean * 0.12 * f0 * f0 * f0 * Math.sign(lean) * Math.sign(lean));
        ctx.lineTo(x0 + lean * f1 * f1, size - h * f1 + Math.abs(lean) * 0.25 * f1 * f1 * f1);
        ctx.stroke();
      }
    }
  } else if (kind === 'bloom') {
    // Blossom without stems, crowded over a rounded mound: the flowers of gorse, laid over its spines.
    for (let k = 0; k < 340; k++) {
      const a = rng.range(Math.PI * 1.05, Math.PI * 1.95), d = Math.pow(rng.next(), 0.45);
      const cx = size / 2 + Math.cos(a) * d * size * 0.44, cy = size * 0.98 + Math.sin(a) * d * size * 0.86;
      ctx.fillStyle = grey(rng.range(0.7, 1));
      ctx.beginPath(); ctx.ellipse(cx, cy, rng.range(2.5, 4.2), rng.range(2, 3.4), rng.range(0, 3), 0, Math.PI * 2); ctx.fill();
    }
  } else if (kind === 'gorse') {
    // Gorse: a dense rounded mass of spines on green shoots, darker within, bristling at its edge.
    for (let k = 0; k < 520; k++) {
      const a = rng.range(Math.PI * 1.02, Math.PI * 1.98), d = Math.pow(rng.next(), 0.6);
      const cx = size / 2 + Math.cos(a) * d * size * 0.46, cy = size * 0.98 + Math.sin(a) * d * size * 0.9;
      const len = rng.range(5, 13), dir = a + rng.range(-0.6, 0.6);
      ctx.strokeStyle = grey((0.25 + 0.75 * d) * rng.range(0.55, 1));
      ctx.lineWidth = rng.range(1.4, 2.6);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(dir) * len, cy + Math.sin(dir) * len); ctx.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * A tuft of real blades, to stand where the painted tuft stands: some thirty strips, each
 * tapering to a point and bent over, in a spread as wide as the card and as tall as it. The shade
 * runs from dark at the foot to light at the tip, as the painted blades do. (`?blades=0` turns them off.)
 */
function bladeClump(): BufferGeometry {
  const P: number[] = [], C: number[] = [], U: number[] = [], I: number[] = [];
  let seed = 12345;
  const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const segs = 2;
  for (let b = 0; b < 30; b++) {
    const x0 = (r() - 0.5) * 0.95, z0 = (r() - 0.5) * 0.25, h = 0.35 + 0.65 * Math.pow(r(), 0.6), hw = 0.02 * (0.7 + 0.6 * r());
    const th = r() * Math.PI, wx = Math.cos(th), wz = Math.sin(th), lean = (r() - 0.5) * 2, tone = 0.6 + 0.4 * r();
    const base = P.length / 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, w = hw * (1 - t) + 0.0006, bend = lean * t * t * h * 0.45;
      const cx = x0 + bend, cz = z0 + bend * 0.4, cy = t * h * (1 - 0.12 * t);
      P.push(cx - wx * w, cy, cz - wz * w, cx + wx * w, cy, cz + wz * w);
      const c = tone * (0.55 + 0.45 * t); C.push(c, c, c, c, c, c); U.push(0, t, 1, t);
      if (i < segs) { const a = base + i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('color', new Float32BufferAttribute(C, 3));
  g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals();
  return g;
}

/**
 * A sprig of real leaves, to hang where a painted spray hangs: three twigs out from the middle,
 * not in one plane, and on them two dozen leaves made one by one. Each leaf is its own small
 * surface, folded along its midrib, and each is turned its own way, as leaves are: mostly face
 * up, and no two alike. Seen from any side it is a thing with depth, where the painted spray is a
 * sheet, and seen edge on a sheet is a line. It fills the same square as the card does, so one
 * can stand for the other; this one is for trees near enough to walk under (`sprigRange`).
 */
/**
 * A conifer's bough made shoot by shoot, to hang where the painted bough hangs: a stem down the
 * card and side shoots off it to either side, as the painting has them, but each shoot is two
 * strips crossed along its length, so that it bristles all round and is a brush from any side;
 * and the side shoots do not lie in the card's plane but droop out of it, some one way and some
 * the other. The trunk end is at the top of the card, as in the painting.
 */
function boughSprig(): BufferGeometry {
  const P: number[] = [], Nn: number[] = [], C: number[] = [], U: number[] = [], I: number[] = [];
  let seed = 9173;
  const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const shoot = (a: number[], b: number[], wide: number, tone: number) => {
    const dir = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const s0 = unit(cross(dir, Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1])), s1 = unit(cross(dir, s0));
    const turn = r() * Math.PI;
    for (let q = 0; q < 2; q++) {
      const an = turn + (q * Math.PI) / 2, c = Math.cos(an), sn = Math.sin(an);
      const side = [s0[0] * c + s1[0] * sn, s0[1] * c + s1[1] * sn, s0[2] * c + s1[2] * sn], n = unit(cross(dir, side));
      const base = P.length / 3;
      const pts = [[a, -1, 0], [a, 1, 0], [b, 1, 1], [b, -1, 1]] as const;
      for (const [at, sgn, u] of pts) {
        P.push(at[0] + side[0] * wide * sgn, at[1] + side[1] * wide * sgn, at[2] + side[2] * wide * sgn);
        Nn.push(n[0], n[1], n[2]); C.push(tone, tone, tone); U.push(u, sgn > 0 ? 1 : 0);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  // The stem, in two lengths so that it can bow a little out of the card's plane.
  const bow = (r() - 0.5) * 0.16, top = [0, 0.48, 0], mid = [0, 0, bow], tip = [0, -0.48, 0];
  shoot(top, mid, 0.06, 0.8);
  shoot(mid, tip, 0.06, 1);
  for (let k = 0; k < 9; k++) {
    const f = 0.12 + 0.8 * (k / 9), y = 0.48 - 0.96 * f, reach = 0.16 + 0.3 * f, z0 = bow * (1 - Math.abs(y) / 0.48);
    for (const side of [-1, 1]) {
      const out = reach * (0.8 + 0.25 * r()), fall = reach * (0.45 + 0.3 * r()), hang = reach * (r() - 0.5) * 0.9;
      // Darker by the stem's upper end, where the old growth is, and paler outward.
      shoot([0, y, z0], [side * out, y - fall, z0 + hang], 0.047, 0.78 + 0.3 * f * r() + 0.08 * r());
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new Float32BufferAttribute(C, 3)); g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}

function sprigClump(): BufferGeometry {
  const P: number[] = [], Nn: number[] = [], C: number[] = [], U: number[] = [], I: number[] = [];
  let seed = 4711;
  const r = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const quad = (pts: number[][], uvs: number[][], colour: number[], n: number[]) => {
    const base = P.length / 3;
    pts.forEach((q, i) => { P.push(q[0], q[1], q[2]); Nn.push(n[0], n[1], n[2]); C.push(colour[0], colour[1], colour[2]); U.push(uvs[i][0], uvs[i][1]); });
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const leaf = (b: number[], along: number[], face: number[], len: number) => {
    const a = unit(along), w = unit(cross(face, a)), n = unit(cross(a, w));
    const wide = len * (0.36 + 0.12 * r()), fold = wide * (0.25 + 0.5 * r()), tone = 0.62 + 0.38 * r(), warm = -0.5 + 1.5 * r();
    const colour = [tone * (1 + 0.14 * warm), tone, tone * (1 - 0.28 * warm)];
    const tip = [b[0] + a[0] * len, b[1] + a[1] * len, b[2] + a[2] * len];
    for (const half of [-1, 1]) {
      // The edge of this half stands up from the midrib: a leaf is a shallow trough.
      const e0 = [b[0] + w[0] * wide * half + n[0] * fold, b[1] + w[1] * wide * half + n[1] * fold, b[2] + w[2] * wide * half + n[2] * fold];
      const e1 = [tip[0] + w[0] * wide * half + n[0] * fold, tip[1] + w[1] * wide * half + n[1] * fold, tip[2] + w[2] * wide * half + n[2] * fold];
      const hn = unit(cross([tip[0] - b[0], tip[1] - b[1], tip[2] - b[2]], [e0[0] - b[0], e0[1] - b[1], e0[2] - b[2]]).map((v) => v * -half));
      const v = half < 0 ? 0.02 : 0.98;
      quad([b, tip, e1, e0], [[0.02, 0.5], [0.98, 0.5], [0.98, v], [0.02, v]], colour, hn);
    }
  };
  for (let t = 0; t < 3; t++) {
    // A twig out from the middle, rising or falling out of the card's plane, and bending as it goes.
    const az = (t / 3) * Math.PI * 2 + (r() - 0.5) * 0.9, lift = (r() - 0.5) * 0.9, reach = 0.36 + 0.12 * r();
    const dir = unit([Math.cos(az) * Math.cos(lift), Math.sin(az) * Math.cos(lift), Math.sin(lift)]);
    const bend = [(r() - 0.5) * 0.25, (r() - 0.5) * 0.25, (r() - 0.5) * 0.3];
    const on = (f: number) => [dir[0] * reach * f + bend[0] * f * f, dir[1] * reach * f + bend[1] * f * f, dir[2] * reach * f + bend[2] * f * f];
    // The twig itself: two thin strips crossed, dark, wearing the plain corner of the leaf's picture.
    const side = unit(cross(dir, [0, 0, 1])), up = unit(cross(side, dir));
    for (const q of [side, up]) {
      const a0 = on(0.05), a1 = on(1), th = 0.006;
      quad([[a0[0] - q[0] * th, a0[1] - q[1] * th, a0[2] - q[2] * th], [a0[0] + q[0] * th, a0[1] + q[1] * th, a0[2] + q[2] * th], [a1[0] + q[0] * th * 0.4, a1[1] + q[1] * th * 0.4, a1[2] + q[2] * th * 0.4], [a1[0] - q[0] * th * 0.4, a1[1] - q[1] * th * 0.4, a1[2] - q[2] * th * 0.4]],
        [[0.02, 0.95], [0.03, 0.95], [0.03, 0.94], [0.02, 0.94]], [1.3, 0.42, 0.5], unit(cross(dir, q)));
    }
    for (let k = 0; k < 8; k++) {
      // Leaves stand off the twig to either side by turns, pointing outward and forward, and the last one straight on.
      const f = 0.18 + 0.82 * (k / 7), b = on(f), sgn = k % 2 ? 1 : -1, last = k === 7;
      const out = last ? 0 : 0.75 + 0.5 * r();
      const along = [dir[0] + side[0] * sgn * out + up[0] * (r() - 0.5) * 0.9, dir[1] + side[1] * sgn * out + up[1] * (r() - 0.5) * 0.9, dir[2] + side[2] * sgn * out + up[2] * (r() - 0.5) * 0.9];
      // Its face is turned towards the card's own front, which the planting turns to the sky, and then tipped its own way.
      const face = [(r() - 0.5) * 1.5, (r() - 0.5) * 1.5, 1];
      leaf(b, along, face, 0.15 + 0.08 * r());
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(P, 3)); g.setAttribute('normal', new Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new Float32BufferAttribute(C, 3)); g.setAttribute('uv', new Float32BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}

function shapeGeometry(shape: CardSet['shape'], folded = false): BufferGeometry {
  if (shape === 'card' && folded) {
    // A spray of leaves is not a flat sheet either: the card is creased down its middle, so that its two halves face different ways,
    // catch different light, and do not vanish together when seen edge on.
    const g = new PlaneGeometry(1, 1, 2, 1), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.01) p.setZ(i, 0.16);
    return g;
  }
  if (shape === 'card') return new PlaneGeometry(1, 1);
  // Three upright sheets through one line, a third of a turn apart, with their feet on the ground.
  const sheets = [0, 1, 2].map((k) => {
    const g = new PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    g.rotateY((k * Math.PI) / 3);
    return g;
  });
  return mergeGeometries(sheets);
}

/**
 * How far off grass and flowers are still drawn in full. They shrink into the ground over the last third. Grass does not stop there:
 * beyond it one tuft in four is still drawn, made broader to stand for the other three, out to two and a half times as far (`FAR_GRASS`).
 * A meadow seen from across a valley is then still grass, and costs a quarter of what it would to draw whole.
 */
const FAR_GRASS = 2.5;
export const vegetationRange: { value: number } = uniform(75);

/** How near the eye grass is drawn as real blades, in metres; beyond it, as painted tufts. */
export const bladeRange = 15;
const bladeRangeUniform = uniform(bladeRange);

/** How near the eye a tree's leaves are made one by one, in sprigs; beyond it they are painted sprays on cards. (`?sprigs=0` keeps the cards alone.) */
export const sprigRange = 26;
const sprigRangeUniform = uniform(sprigRange);

/**
 * Trees drawn three ways, as the walk page draws the world's woods: whole near by, grown more simply further off, a single painted card
 * beyond. Where one way gives way to the next, each tree changes at a distance of its own within a band (`uNear` from whole to simple,
 * `uFar` from simple to painted, in metres), and over a few metres (`uSoft`): its cards shrink to nothing where they stand as the next
 * way's grow from nothing in the same place. So there is no ring at which a whole block of trees changes at once, only a belt in which
 * some trees have already changed and others not yet; and since every way of a tree reads the same foot and the same number, the two
 * ways of one tree always add up to one tree, with nothing doubled or missing. (Asked: "the pop in of more detailed trees is too
 * evident!": each 32-metre block of trees changed whole at once, at 120 and 320 metres, the changes coming in a block a frame.)
 */
export const treeLevels: { uNear: { value: Vector2 }; uFar: { value: Vector2 }; uSoft: { value: number } } = { uNear: uniform(new Vector2(110, 150)), uFar: uniform(new Vector2(300, 360)), uSoft: uniform(4) };
export type TreeLevel = 'whole' | 'simple' | 'painted';

/**
 * Which of a page's blocks of trees are grown, whole and simply, so that a tree whose nearer way is not grown yet is drawn the next way
 * out until it is (a page grows its blocks a few a frame, and flying fast, or just arrived, it is behind: the trees there were missing,
 * the painted cards no longer drawn so near). A texture of the world in blocks of `cell` metres, red whole, green simple, each 0 to 1:
 * a page raises a block's number over half a second or so once it is grown, so that it comes in gently, and lets it go to nothing when
 * the block is let go of. Made by the page, before any material that draws trees in levels; where none is made, every block counts as
 * grown.
 */
let grown: { map: DataTexture; w: number; h: number; ox: number; oz: number; cell: number } | null = null;
export function treeGrownMap(hx: number, hz: number, cell = 32): { set(bi: number, bj: number, level: 'whole' | 'simple', share: number): void; clear(): void; flush(): void } {
  const ox = Math.ceil(hx / cell) + 1, oz = Math.ceil(hz / cell) + 1, w = 2 * ox, h = 2 * oz, data = new Uint8Array(w * h * 4);
  const map = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  map.magFilter = map.minFilter = NearestFilter; map.generateMipmaps = false; map.needsUpdate = true;
  grown = { map, w, h, ox, oz, cell };
  let dirty = false;
  return {
    set(bi, bj, level, share) {
      const i = bi + ox, j = bj + oz;
      if (i < 0 || j < 0 || i >= w || j >= h) return;
      const k = (j * w + i) * 4 + (level === 'whole' ? 0 : 1), v = Math.round(255 * Math.min(1, Math.max(0, share)));
      if (data[k] !== v) { data[k] = v; dirty = true; }
    },
    clear() { data.fill(0); dirty = true; },
    // (Sent to the graphics card at most once a frame, however many blocks changed.)
    flush() { if (dirty) { map.needsUpdate = true; dirty = false; } },
  };
}

/** How much of a tree is drawn the given way, 0 to 1, from `tree`: its foot (`xyz`) and its own number (`w`). */
export function treeShare(level: TreeLevel, tree: N): N {
  // (Measured along the ground, as the blocks of each level are chosen: flying over a wood, the trees under one stay whole, where measured
  // through the air they would have been drawn at a level whose blocks were never grown there.)
  const dist: N = distance(cameraPosition.xz, tree.xz), own: N = tree.w, soft: N = treeLevels.uSoft as N;
  const near: N = mix((treeLevels.uNear as N).x, (treeLevels.uNear as N).y, own), far: N = mix((treeLevels.uFar as N).x, (treeLevels.uFar as N).y, own);
  const past: N = smoothstep(near.sub(soft), near.add(soft), dist), beyond: N = smoothstep(far.sub(soft), far.add(soft), dist);
  const whole: N = float(1).sub(past), simple: N = past.mul(float(1).sub(beyond));
  if (!grown) return level === 'whole' ? whole : level === 'simple' ? simple : beyond;
  // What is not grown yet goes to the next way out: whole to simple, simple to painted. (The three still add up to one tree.)
  const g = grown, at: N = vec2(floor(tree.x.div(g.cell)).add(g.ox + 0.5).div(g.w), floor(tree.z.div(g.cell)).add(g.oz + 0.5).div(g.h));
  const has: N = (tex(g.map, at) as N).level(0), wholeNow: N = whole.mul(has.r), simpleNow: N = has.g.mul(simple.add(whole.mul(float(1).sub(has.r))));
  return level === 'whole' ? wholeNow : level === 'simple' ? simpleNow : float(1).sub(wholeNow).sub(simpleNow);
}

/**
 * How many of a tree's painted leaves are drawn at a distance: all within `near` metres, fewer beyond, down to `least` of them from `far`
 * on; those left grow a little, by the share to the power `grow`, so that a crown thins rather than shrinks and keeps most of its mass. (Asked for: lighter frames. A
 * valley holds two million cards of leaves in summer, a thousand to a tree, and every one was drawn wherever its tree stood: with all of
 * them shrunk to points a frame over the valley took ten milliseconds less, half of them in drawing the cards' points and half in
 * the cards' own overdraw, each tree's leaves lying a dozen deep. A wood a furlong off is a texture of crowns, and a third of its cards
 * draw it.) Each card has a rank in its block, dealt at random; it is drawn while its rank is under the share where it stands, and each
 * block draws only as many of its cards, lowest rank first, as the share at its nearest point allows (`cullCards`).
 */
export const LEAF_THIN = { near: 35, far: 140, least: 0.4, grow: 0.3 };
/** Where the eye is, for thinning: the player's, not the camera drawing (which for the sun's shadow stands hundreds of metres off, and would thin every tree's shadow). */
const leafEye = uniform(new Vector3());
const leafShare = (d: number) => { const t = Math.min(1, Math.max(0, (d - LEAF_THIN.near) / (LEAF_THIN.far - LEAF_THIN.near))); return 1 - (1 - LEAF_THIN.least) * t * t * (3 - 2 * t); };

/**
 * Builds the meshes for a set of cards. The cards are sorted into square blocks of ground, one
 * mesh to a block, so that blocks out of view are not drawn at all; blocks of grass and flowers
 * too far away to matter are dropped as well (see `cullCards`). `level`, for trees drawn in levels
 * whose cards say which tree they belong to (`set.trees`): which way these are drawn (`treeShare`).
 */
export function makeCards(set: CardSet, texture: Texture, level?: TreeLevel): InstancedMesh[] {
  // Whole trees stand far off, are never dropped for distance, and are drawn in large lots.
  const whole = set.kind === 'fir' || set.kind === 'tree';
  const ground = set.kind !== 'leaf' && set.kind !== 'needle' && set.kind !== 'pine' && !whole;
  // (Each block is a draw call: at twelve metres to a block of grass an island had two and a half thousand of them, and the frame
  // was spent issuing them. Blocks four times the area cost a little more drawing at the edge of the range, where the cards shrink
  // away by themselves, and far fewer calls.)
  const block = whole ? 220 : ground ? (set.kind === 'grass' ? 24 : 40) : 48;
  // Grass is drawn two ways: near the eye as real blades, farther off as painted tufts. Each block
  // gets both, and which is drawn, and where one gives way to the other, is settled in `cullCards`
  // and by the cards themselves shrinking away over the hand-over. (`?blades=0` keeps the painted tufts alone.)
  const split = set.kind === 'grass' && new URLSearchParams(location.search).get('blades') !== '0';
  // Leaves likewise: near the eye, sprigs of leaves made one by one; farther off, the painted sprays.
  const sprigs = (set.kind === 'leaf' || set.kind === 'needle') && !!texture.userData.single && new URLSearchParams(location.search).get('sprigs') !== '0';
  const sway = whole ? 0.004 : ground ? 0.07 : set.kind === 'leaf' ? 0.035 : 0.02;
  const uTime = vegetationUniforms.uTime as N, uWind = vegetationUniforms.uWind as N, uRange = vegetationRange as N, uBlade = bladeRangeUniform as N, uSprig = sprigRangeUniform as N;
  // Where each card stands, and how large it is.
  const at: N = attribute('aAt', 'vec4');
  // (Drawn in levels only where every card says which tree it belongs to.)
  const levelled = level && set.trees && set.trees.length === set.matrices.length / 4 ? level : undefined;
  // (Leaves, needles and pines thin out with distance, but for trees drawn in levels, which have their own way of going.)
  // (`?thin=0` draws every card at every distance, as before, for comparing.)
  const thinned = (set.kind === 'leaf' || set.kind === 'needle' || set.kind === 'pine') && !levelled && new URLSearchParams(location.search).get('thin') !== '0';
  const materialFor = (layer: 'painted' | 'blades' | 'sprigs' | 'far'): MeshStandardNodeMaterial => {
    const real = layer === 'blades', sprig = layer === 'sprigs', far = layer === 'far';
    const material = new MeshStandardNodeMaterial({
      map: real ? null : sprig ? (texture.userData.single as Texture) : texture, alphaTest: real ? 0 : 0.42, side: DoubleSide, roughness: 0.82, metalness: 0, alphaToCoverage: !real, vertexColors: real || sprig,
    });
    // In the shadow map a crown's leaves are drawn smaller than they are (only the denser middle of
    // each card), so that some of the sun gets through the crown, as it does in life.
    if (set.kind === 'leaf' || set.kind === 'needle' || set.kind === 'pine') {
      const cut = Number(new URLSearchParams(location.search).get('leafcut') ?? 0.7);
      if (cut > 0.42 && !sprig) material.maskShadowNode = (tex(texture, uv()) as N).a.greaterThan(cut);
    }
    // Real blades came out a good deal lighter than the painted tufts they give way to, so that the belt between them was a change of
    // colour as well as of kind, and showed as an edge however gradually the two were mixed. Each is brought towards the other.
    if (split) material.color.setScalar(real ? 0.8 : 1.24);
    // The sky lights leaves from all round, but as blue as it is it would turn them teal.
    material.envMapIntensity = 0.55;
    // Wind: the free end of each card moves, the fixed end does not. And grass and flowers shrink into the ground as they near the end of their range.
    material.positionNode = Fn(() => {
      // The hand-over: blades shrink to their feet as they near the blade range, and the painted tufts
      // grow from theirs to meet them. It is spread over half the range, and each tuft makes the change
      // at a distance of its own, a couple of metres nearer or farther than its neighbour: so there is
      // no ring on the ground where one kind of grass ends and the other begins, only a belt in which
      // some tufts are already blades and others not yet.
      const dist: N = distance(cameraPosition, at.xyz);
      const own: N = sin(dot(at.xz, vec2(127.1, 311.7))).mul(43758.5453).fract().toVar();
      const turn: N = dist.add(own.sub(0.5).mul(uBlade).mul(0.3));
      // (Leaves the same: sprigs shrink to nothing as they pass the sprig range, and the painted sprays grow from nothing to meet them.)
      const handOver: N = real ? float(1).sub(smoothstep(uBlade.mul(0.5), uBlade, turn))
        : far ? smoothstep(uRange.mul(0.5), uRange.mul(0.8), dist.add(own.sub(0.5).mul(uRange).mul(0.2)))
        : split ? smoothstep(uBlade.mul(0.4), uBlade.mul(0.9), turn)
        : sprig ? float(1).sub(smoothstep(uSprig.mul(0.82), uSprig, dist))
        : sprigs ? smoothstep(uSprig.mul(0.78), uSprig.mul(0.96), dist) : float(1);
      // (By the time this runs each card's points are already where the card stands in the world, not about the card's own foot. So "shrink
      // to its foot" is "draw towards where it stands". Multiplying the point by the share left, as this did, drew every blade towards the
      // middle of the world instead: across the last few metres of the blade range whole tufts slid over the ground as the eye moved.)
      const p: N = mix(at.xyz, positionLocal, handOver).toVar();
      if (set.kind === 'grass') {
        // How tall it stands is settled here as well as in the planting, so that it can be changed while one watches.
        const drift = sin(at.x.mul(0.31).add(sin(at.z.mul(0.17)).mul(1.9))).add(sin(at.z.mul(0.23).add(at.x.mul(0.11)).add(1.3))).mul(0.25).add(0.5);
        const unequal = mix(float(1), mix(float(0.3), float(1.9), mix(drift, own, 0.45).clamp()), vegetationUniforms.uGrassVary as N);
        p.y.assign(at.y.add(p.y.sub(at.y).mul(vegetationUniforms.uGrassTall as N).mul(unequal)));
      }
      const free: N = set.shape === 'tuft' ? uv().y.mul(uv().y) : float(1);
      const gust = sin(uTime.mul(1.3).add(at.x.mul(0.21)).add(at.z.mul(0.17))).add(sin(uTime.mul(2.9).add(at.x.mul(0.6)).sub(at.z.mul(0.45))).mul(0.5));
      p.x.addAssign(free.mul(gust).mul(uWind).mul(at.w).mul(sway));
      p.z.addAssign(free.mul(cos(uTime.mul(1.7).add(at.z.mul(0.3)))).mul(uWind).mul(at.w).mul(sway * 0.6));
      // Leaves made one by one tremble one by one.
      if (sprig) p.addAssign(vec3(sin(uTime.mul(5.3).add(dot(positionLocal, vec3(31, 17, 23)))), sin(uTime.mul(4.1).add(dot(positionLocal, vec3(19, 29, 13)))), 0).mul(uWind).mul(at.w).mul(0.012).mul(handOver));
      const d: N = dist;
      if (far) {
        // One for four: broader, a little taller, and gone at last where even that is too small to see.
        p.assign(vec3(at.x.add(p.x.sub(at.x).mul(1.9)), at.y.add(p.y.sub(at.y).mul(1.2)), at.z.add(p.z.sub(at.z).mul(1.9))));
        // (It sinks into the ground over the whole of its reach, not over the last of it, and each tuft at its own pace: so the far edge
        // of the grass is not a step down onto the ground but grass getting shorter and thinner until none is left.)
        p.assign(mix(p, at.xyz, smoothstep(uRange.mul(FAR_GRASS * 0.3), uRange.mul(FAR_GRASS), d.add(own.sub(0.5).mul(uRange).mul(0.9))).pow(1.5)));
      } else if (ground) p.assign(mix(p, at.xyz, smoothstep(uRange.mul(0.66), uRange, d.add(own.sub(0.5).mul(uRange).mul(0.15)))));
      // A tree drawn in levels: as much of it as this level's share, each card shrinking to where it stands.
      if (levelled && layer === 'painted') p.assign(mix(at.xyz, p, treeShare(levelled, attribute('aTree', 'vec4'))));
      // Thinned with distance (`LEAF_THIN`): a card whose rank is over the share where it stands shrinks to where it stands, over a
      // twentieth of the ranks, so that cards go one by one and not in a ring; and those left grow (`LEAF_THIN.grow`).
      if (thinned && layer === 'painted') {
        const share: N = float(1).sub(smoothstep(float(LEAF_THIN.near), float(LEAF_THIN.far), distance(leafEye as N, at.xyz)).mul(1 - LEAF_THIN.least)).toVar();
        const stays: N = clamp(share.sub(attribute('aRank', 'float')).div(0.05), 0, 1);
        p.assign(mix(at.xyz, p, stays.mul(pow(share, -LEAF_THIN.grow))));
      }
      return p;
    })();
    // Shade every card as part of one rounded body about its centre, not as a flat sheet. (A normal
    // given like this is not turned round on back faces, which a two-sided material would do to its own.)
    const round: N = transformNormalToView(normalize(positionWorld.sub(attribute('aCentre', 'vec3'))));
    // Leaves are lit both ways at once: as parts of the crown's rounded body, which gives the crown its light side and its dark, and each
    // as it lies on its twig, which gives one leaf a gleam and its neighbour none. And a leaf's skin is waxy: it throws the sun back.
    const relief = set.kind === 'leaf' ? (texture.userData.relief as Texture | undefined) : undefined;
    // (A leaf made by itself is lit as it truly lies: by its own surface, whichever side of it is seen.)
    material.normalNode = sprig ? normalize(round.mul(0.55).add(normalViewGeometry.mul(faceDirection).mul(0.68)))
      : relief ? normalize(round.mul(0.6).add((normalMap(tex(relief, uv())) as N).mul(0.62))) : round;
    if (relief) { material.roughness = 0.58; material.color.setScalar(1.16); }
    // A painted spray seen edge on is a streak across the crown. As a card turns its edge to the eye it thins away instead.
    if (relief && !sprig) material.opacityNode = smoothstep(0.05, 0.32, abs(dot(positionViewDirection, normalViewGeometry)));
    // (A painted bough the same, more gently: there are few of them to a tree, and a spruce must not go thin from one side.)
    if (set.kind === 'needle' && !sprig) material.opacityNode = smoothstep(0.02, 0.16, abs(dot(positionViewDirection, normalViewGeometry)));
    (material as N).setupLightingModel = () => new LeafLighting(whole ? 0.25 : 1, relief ? 0.55 : 0.2);
    return material;
  };
  const layers: { layer: 'painted' | 'blades' | 'sprigs' | 'far'; base: BufferGeometry; material: MeshStandardNodeMaterial }[] = [];
  if (split) layers.push({ layer: 'blades', base: bladeClump(), material: materialFor('blades') });
  layers.push({ layer: 'painted', base: shapeGeometry(set.shape, set.kind === 'leaf'), material: materialFor('painted') });
  if (set.kind === 'grass') layers.push({ layer: 'far', base: shapeGeometry(set.shape), material: materialFor('far') });

  // Which block each card falls in.
  const count = set.matrices.length / 16;
  const blocks = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.floor(set.matrices[i * 16 + 12] / block)},${Math.floor(set.matrices[i * 16 + 14] / block)}`;
    let list = blocks.get(key);
    if (!list) blocks.set(key, (list = []));
    list.push(i);
  }
  const meshes: InstancedMesh[] = [];
  for (const block of blocks.values()) {
    // (Where cards thin out with distance, each block's in an order of their own, dealt from where each stands: the first are the last to go.)
    const list = thinned ? block.map((i) => ({ i, key: Math.sin(set.matrices[i * 16 + 12] * 12.9898 + set.matrices[i * 16 + 14] * 78.233 + set.matrices[i * 16 + 13] * 37.719) * 43758.5453 })).map((q) => ({ ...q, key: q.key - Math.floor(q.key) })).sort((a, b) => a.key - b.key).map((q) => q.i) : block;
    const n = list.length;
    const matrices = new Float32Array(n * 16), colours = new Float32Array(n * 3), centres = new Float32Array(n * 3), stands = new Float32Array(n * 4);
    const trees = levelled ? new Float32Array(n * 4) : null;
    list.forEach((i, k) => {
      if (trees) for (let c = 0; c < 4; c++) trees[k * 4 + c] = set.trees![i * 4 + c];
      for (let c = 0; c < 16; c++) matrices[k * 16 + c] = set.matrices[i * 16 + c];
      for (let c = 0; c < 3; c++) stands[k * 4 + c] = set.matrices[i * 16 + 12 + c];
      stands[k * 4 + 3] = Math.hypot(set.matrices[i * 16], set.matrices[i * 16 + 1], set.matrices[i * 16 + 2]);
      for (let c = 0; c < 3; c++) { colours[k * 3 + c] = set.colours[i * 3 + c]; centres[k * 3 + c] = set.centres[i * 3 + c]; }
    });
    for (const { layer, base, material } of layers) {
      // Each block has its own geometry object, sharing the shape's buffers, because the centres are per card.
      const geometry = new BufferGeometry();
      geometry.setIndex(base.getIndex());
      for (const name of ['position', 'normal', 'uv', 'color']) if (base.getAttribute(name)) geometry.setAttribute(name, base.getAttribute(name));
      // (Every card of the block; or, for grass far off, every fourth.)
      const every = layer === 'far' ? 4 : 1, m = Math.ceil(n / every);
      const pick = (from: Float32Array, size: number): Float32Array => {
        if (every === 1) return from;
        const to = new Float32Array(m * size);
        for (let k = 0; k < m; k++) for (let c = 0; c < size; c++) to[k * size + c] = from[k * every * size + c];
        return to;
      };
      const own: [string, Float32Array, number][] = [['aCentre', pick(centres, 3), 3], ['aAt', pick(stands, 4), 4]];
      if (trees) own.push(['aTree', pick(trees, 4), 4]);
      if (thinned) own.push(['aRank', Float32Array.from({ length: n }, (_, k) => k / n), 1]);
      packCards(geometry, own, m);
      const mesh = new InstancedMesh(geometry, material, m);
      mesh.instanceMatrix.setUsage(StaticDrawUsage);
      (mesh.instanceMatrix.array as Float32Array).set(pick(matrices, 16));
      mesh.instanceColor = new InstancedBufferAttribute(pick(colours, 3), 3);
      mesh.name = `cards:${set.kind}`;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.castShadow = set.shadow;
      mesh.matrixAutoUpdate = false;
      mesh.userData.ground = ground;
      mesh.userData.layer = layer === 'far' ? 'far' : split ? layer : sprigs ? 'sprays' : 'whole';
      if (levelled) mesh.userData.level = levelled;
      if (thinned && layer === 'painted') mesh.userData.thin = m;
      meshes.push(mesh);
    }
  }
  if (sprigs) meshes.push(nearSprigs(set, set.kind === 'needle' ? boughSprig() : sprigClump(), materialFor('sprigs')));
  return meshes;
}

/**
 * What each card of a block has of its own (its crown's centre, where it stands, its tree, its rank), kept together in one buffer, a
 * card at a time, rather than each in a buffer of its own. A graphics card takes eight buffers to a draw at the most (WebGPU's limit),
 * and a card's shape has three or four, its matrices and colours two more; where the picture also keeps how each point moved since
 * the last frame (for a blur of what moves), the matrices of the frame before are one more: with three or four of a card's own besides,
 * nine and ten, the draw could not be made, its trees' leaves were not drawn, and every frame that tried was thrown away whole.
 */
function packCards(geometry: BufferGeometry, own: [string, Float32Array, number][], count: number): InstancedInterleavedBuffer {
  const stride = own.reduce((a, [, , size]) => a + size, 0), packed = new Float32Array(count * stride), buffer = new InstancedInterleavedBuffer(packed, stride);
  let offset = 0;
  for (const [name, from, size] of own) {
    for (let k = 0; k < count; k++) for (let c = 0; c < size; c++) packed[k * stride + offset + c] = from[k * size + c];
    geometry.setAttribute(name, new InterleavedBufferAttribute(buffer, size, offset));
    offset += size;
  }
  return buffer;
}

/**
 * The sprigs of a kind of leaf: one mesh holding those near the eye, and only those. A sprig is a hundred-odd triangles where a
 * painted spray is two, and sprigs are drawn only within `sprigRange`; beyond it each shrinks to a point. They were sorted into
 * blocks of ground as the sprays are, forty-eight metres square, and a block was drawn whole if any of it was within the range:
 * by a wood, fifty thousand sprigs and more than five million triangles in a frame, most of them shrunk to nothing, and as many
 * again in the mirror of a pond. Now the sprigs within the range and a few metres more are gathered into this mesh whenever the eye
 * has gone a few metres from where they were last gathered (the cards are kept sorted into cells of ground, so that only those in
 * the cells about the eye are looked at). It is not drawn into the sun's shadow: that is drawn from far off, where every sprig has
 * shrunk to nothing anyway, and the sprays throw the shade.
 */
function nearSprigs(set: CardSet, base: BufferGeometry, material: MeshStandardNodeMaterial): InstancedMesh {
  const count = set.matrices.length / 16;
  const geometry = new BufferGeometry();
  geometry.setIndex(base.getIndex());
  for (const name of ['position', 'normal', 'uv', 'color']) if (base.getAttribute(name)) geometry.setAttribute(name, base.getAttribute(name));
  // (Each sprig's centre and where it stands, in one buffer: `packCards`.)
  packCards(geometry, [['aCentre', new Float32Array(count * 3), 3], ['aAt', new Float32Array(count * 4), 4]], count);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.count = 0;
  mesh.name = `cards:${set.kind}`;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.ground = false;
  mesh.userData.layer = 'sprigs';
  const cells = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const key = `${Math.floor(set.matrices[i * 16 + 12] / NEAR_CELL)},${Math.floor(set.matrices[i * 16 + 14] / NEAR_CELL)}`;
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(i);
  }
  mesh.userData.near = { set, cells, x: NaN, z: NaN };
  return mesh;
}
/** How large the cells are that sprigs are sorted into; how much further than the range they are gathered; how far the eye goes before they are gathered again. */
const NEAR_CELL = 8, NEAR_MARGIN = 5, NEAR_MOVE = 3.5;

/** Gathers the sprigs near the eye into their mesh, if the eye has gone far enough since they were last gathered. */
function gatherSprigs(mesh: InstancedMesh, eye: { x: number; y: number; z: number }): void {
  const near = mesh.userData.near as { set: CardSet; cells: Map<string, number[]>; x: number; z: number };
  if (Math.hypot(eye.x - near.x, eye.z - near.z) < NEAR_MOVE) return;
  near.x = eye.x; near.z = eye.z;
  const { set, cells } = near, reach = sprigRange + NEAR_MARGIN;
  const matrices = mesh.instanceMatrix.array as Float32Array, colours = mesh.instanceColor!.array as Float32Array;
  // (Each sprig's own, a sprig at a time: its centre, then where it stands and how large it is.)
  const own = (mesh.geometry.getAttribute('aCentre') as InterleavedBufferAttribute).data, oA = own.array as Float32Array, OWN = own.stride;
  let n = 0;
  const c0 = Math.floor((eye.x - reach) / NEAR_CELL), c1 = Math.floor((eye.x + reach) / NEAR_CELL);
  const r0 = Math.floor((eye.z - reach) / NEAR_CELL), r1 = Math.floor((eye.z + reach) / NEAR_CELL);
  for (let cx = c0; cx <= c1; cx++) for (let cz = r0; cz <= r1; cz++) {
    const list = cells.get(`${cx},${cz}`);
    if (!list) continue;
    for (const i of list) {
      const m = set.matrices, x = m[i * 16 + 12], y = m[i * 16 + 13], z = m[i * 16 + 14];
      // (Height counts as well: a crown overhead is as near as one beside the eye.)
      if ((x - eye.x) ** 2 + (y - eye.y) ** 2 + (z - eye.z) ** 2 > reach * reach) continue;
      for (let c = 0; c < 16; c++) matrices[n * 16 + c] = m[i * 16 + c];
      oA[n * OWN + 3] = x; oA[n * OWN + 4] = y; oA[n * OWN + 5] = z;
      oA[n * OWN + 6] = Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2]);
      for (let c = 0; c < 3; c++) { colours[n * 3 + c] = set.colours[i * 3 + c]; oA[n * OWN + c] = set.centres[i * 3 + c]; }
      n++;
    }
  }
  mesh.count = n;
  // (Only what was gathered is sent to the graphics card.)
  const send = (a: InstancedBufferAttribute | InstancedInterleavedBuffer, size: number) => { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, n) * size); a.needsUpdate = true; };
  send(mesh.instanceMatrix, 16); send(mesh.instanceColor!, 3); send(own as InstancedInterleavedBuffer, OWN);
}

/**
 * Hides blocks of grass and flowers that are wholly beyond the range at which they are drawn;
 * and, where grass comes in two kinds, blades beyond the blade range and tufts wholly inside it.
 */
export function cullCards(meshes: InstancedMesh[], eye: { x: number; y: number; z: number }): void {
  (leafEye.value as Vector3).set(eye.x, eye.y, eye.z);
  for (const m of meshes) {
    if (m.userData.layer === 'sprigs') { gatherSprigs(m, eye); m.visible = m.count > 0; continue; }
    const s = m.boundingSphere!;
    const d = Math.hypot(s.center.x - eye.x, s.center.y - eye.y, s.center.z - eye.z);
    // (A block of leaves thinned with distance draws only as many of its cards as its nearest point keeps: the rest are shrunk away.)
    if (m.userData.thin) m.count = Math.min(m.userData.thin, Math.ceil(m.userData.thin * leafShare(Math.max(0, d - s.radius)) + 1));
    // Leaves: the sprigs gathered about the eye (above), and the painted sprays unless all of the block is within the sprigs' range.
    if (m.userData.layer === 'sprays') { m.visible = d + s.radius > sprigRange * 0.78; continue; }
    if (m.userData.layer === 'far') { m.visible = d + s.radius > vegetationRange.value * 0.4 && d - s.radius < vegetationRange.value * FAR_GRASS; continue; }
    if (!m.userData.ground) continue;
    let show = d - s.radius < vegetationRange.value;
    // (With room for the belt in which the two give way to each other, tuft by tuft.)
    if (m.userData.layer === 'blades') show = show && d - s.radius < bladeRange * 1.15;
    else if (m.userData.layer === 'painted') show = show && d + s.radius > bladeRange * 0.25;
    m.visible = show;
  }
}
