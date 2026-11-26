import { MeshBuilder } from './meshBuilder';

type Colour = [number, number, number];

export interface TurnedOptions {
  /** The angles it is swept between: all the way round if left out. */
  from?: number;
  to?: number;
  /** Turned to be looked at from within. */
  inside?: boolean;
  segments?: number;
  /** Changes the radius by angle and height, so that nothing made of earth is a perfect round. */
  swell?: (a: number, h: number) => number;
  /** Asked at every point: the angle, the height, the height as a share of the whole, and where the point is. */
  colour: (a: number, h: number, t: number, x: number, z: number) => Colour;
  scale?: number;
  /** For the ground's own material: how far it is earth and not turf. */
  bare?: number | ((a: number, h: number) => number);
  /** It lies on the ground as the ground lies, and is not set level. */
  follow?: boolean;
  /** If given, its axis does not stand up but lies level, pointing this way (radians, 0 towards greater x): a wheel, a roller, a windlass. */
  lie?: number;
}

/**
 * Makes turned solids: a profile (pairs of radius and height, from the bottom up) swept round a
 * line. A mound of earth, a hut of poles, a barrel, a stump, a sack and a wheel are all this.
 * The side that shows is the one on the left hand going along the profile, looking from the axis
 * outwards; so a hump lying on the ground is given from its outer edge over the top to its inner.
 */
export function turner(mesh: (material: string) => MeshBuilder, ground: (x: number, z: number) => number) {
  return (material: string, x: number, y: number, z: number, profile: [number, number][], o: TurnedOptions) => {
    const m = mesh(material), from = o.from ?? 0, to = o.to ?? Math.PI * 2, n = o.segments ?? 20, rows = profile.length, scale = o.scale ?? 0.5;
    const top = profile[rows - 1][1] || 1, ids: number[] = [];
    // (Lying down: along the axis, across it on the level, and up.)
    const dx = o.lie === undefined ? 0 : Math.cos(o.lie), dz = o.lie === undefined ? 0 : Math.sin(o.lie);
    for (let i = 0; i < rows; i++) {
      const [r, h] = profile[i], [r0, h0] = profile[Math.max(0, i - 1)], [r1, h1] = profile[Math.min(rows - 1, i + 1)];
      // The way the surface faces: square to the profile, turned outwards.
      let nr = h1 - h0, ny = r0 - r1;
      const len = Math.hypot(nr, ny) || 1;
      nr /= len; ny /= len;
      for (let j = 0; j <= n; j++) {
        const a = from + ((to - from) * j) / n, k = o.swell ? o.swell(a, h) : 1, flip = o.inside ? -1 : 1, ca = Math.cos(a), sa = Math.sin(a);
        let vx: number, vy: number, vz: number, nx: number, nyy: number, nz: number;
        if (o.lie === undefined) {
          vx = x + ca * r * k; vz = z + sa * r * k; vy = (o.follow ? ground(vx, vz) : y) + h;
          nx = ca * nr; nyy = ny; nz = sa * nr;
        } else {
          vx = x + dx * h - dz * ca * r * k; vz = z + dz * h + dx * ca * r * k; vy = y + sa * r * k;
          nx = dx * ny - dz * ca * nr; nyy = sa * nr; nz = dz * ny + dx * ca * nr;
        }
        const c = o.colour(a, h, h / top, vx, vz), bare = typeof o.bare === 'function' ? o.bare(a, h) : o.bare ?? 0;
        ids.push(m.addVertex(vx, vy, vz, nx * flip, nyy * flip, nz * flip, a * Math.max(r, 0.4) * scale, h * scale, c[0], c[1], c[2], 0, 0, bare));
      }
    }
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < n; j++) {
      const a = ids[i * (n + 1) + j], b = ids[(i + 1) * (n + 1) + j], c = ids[i * (n + 1) + j + 1], d = ids[(i + 1) * (n + 1) + j + 1];
      if (o.inside) { m.addTriangle(a, c, b); m.addTriangle(c, d, b); } else { m.addTriangle(a, b, c); m.addTriangle(c, b, d); }
    }
  };
}
