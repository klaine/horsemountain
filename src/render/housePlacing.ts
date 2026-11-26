import { footprintOf, inPart, offPart } from '../core/building';
import type { Building } from '../core/site';
import { MeshBuilder } from './geom/meshBuilder';

/**
 * Lays a building made by `buildBuilding` into the meshes of the place, from the meshes it was made in (`local`), turned by `turn`
 * about its own middle (nothing for a building made where it stands, as the valley's are; a town's are made facing west at the
 * middle of the world and turned to their street), and marks two things on it as it goes, for what lies beyond the site is not
 * baked and is lit by the open sky wherever it is:
 *
 * Its rooms are indoors. The rooms of the houses, which can be walked into, were lit as if they stood out of doors, every wall and
 * floor in the full blue light of the sky. So each face, judged at its middle (a face's corners lie on the lines of the walls,
 * where one the breadth of the house has no depth inside it at all), is marked as indoors, a share of sky less than nothing, which
 * the program reads so: a wall that looks into the house (a step of sixty centimetres the way it faces is still within the walls),
 * a floor within the walls or a ceiling well within them (a jetty's underside, over the street, is not), below the walls' tops,
 * and not glass or the roof's covering; but a point of it that lies outside the walls, as the end of a joist that carries a jetty
 * does, is out of doors. And a wall that looks out of the house into the next, where houses stand wall to wall (`neighbour`).
 *
 * Damp rises in the foot of its outer walls from the ground they stand in, and the rain splashes the lowest of them with dirt.
 * (Nothing had marked where walls meet the ground, and every house stood clean, as if set down that morning.) It is drawn by the
 * material, which needs to know how high the ground at the wall's foot is: a wall of plaster is one face from its footing to its
 * beam, and damp marked at its corners was smeared over the whole of it with no line to it. So each point of a wall of plaster,
 * stone or brick of any clay that looks out of the house carries the height of the ground at its foot, plus a thousand, in the fourth number
 * of its field (see `makeSiteMaterial`).
 */
export function placeHouse(
  bd: Building, y: number, local: Map<string, MeshBuilder>, into: (material: string) => MeshBuilder,
  o: { facing: number; foot: (x: number, z: number) => number; turn?: { angle: number; x: number; z: number }; neighbour?: (x: number, z: number) => boolean; fine?: (material: string) => MeshBuilder; indoor?: (material: string) => MeshBuilder },
): void {
  const c = Math.cos(o.turn?.angle ?? 0), s = Math.sin(o.turn?.angle ?? 0), ox = o.turn?.x ?? 0, oz = o.turn?.z ?? 0;
  const fp = footprintOf(bd), fax = Math.cos(o.facing), faz = Math.sin(o.facing);
  /** How far a point is outside the walls (nothing within), and how far within them (less than nothing outside). */
  const outOf = (x: number, z: number) => {
    const dx = x - bd.x, dz = z - bd.z, u = dx * faz - dz * fax, w = bd.d / 2 - (dx * fax + dz * faz);
    let best = Infinity;
    for (const r of fp) best = Math.min(best, offPart(r, u, w));
    return best;
  };
  const inDepth = (x: number, z: number) => {
    const dx = x - bd.x, dz = z - bd.z, u = dx * faz - dz * fax, w = bd.d / 2 - (dx * fax + dz * faz);
    let best = -Infinity;
    for (const r of fp) best = Math.max(best, inPart(r, u, w));
    return best;
  };
  const wallTop = y + bd.heights.reduce((a, h) => a + h, 0) + (bd.basement ?? 0) + 1.2;
  for (const [m, src] of local) {
    // (`castle` is the coursed stone of a village church's walls, weathered as the castle's own walls are.)
    const weathers = m === 'plaster' || m === 'stone' || m === 'castle' || /brick/i.test(m), roofOrGlass = /^(tile|thatch|glass|window|pane|paneLit|leaf)$/.test(m);
    const indoors = new Uint8Array(roofOrGlass ? 0 : src.vertexCount);
    if (!roofOrGlass) src.eachTriangle((a, b, cc, mx, my, mz, nx0, ny0, nz0) => {
      if (my > wallTop) return;
      const wx = ox + mx * c - mz * s, wz = oz + mx * s + mz * c, wnx = nx0 * c - nz0 * s, wnz = nx0 * s + nz0 * c;
      const inside = Math.abs(ny0) < 0.5 ? outOf(wx + wnx * 0.6, wz + wnz * 0.6) < 0.02 : inDepth(wx, wz) > (ny0 < 0 ? 0.7 : 0.05);
      if (inside) indoors[a] = indoors[b] = indoors[cc] = 1;
    });
    // Timber out of doors (`wood` not marked indoors, and lying no more than a third of a metre within the walls' line: the frame of
    // a wall, its doors, shutters and windows, the boards along a roof's edge), judged at each face's middle so that a face is all one
    // or the other, carries the height of the ground at its foot as a wall does, made negative where it is painted, so that the
    // material can weather it: bare timber faded and checked, paint worn and peeling (see `makeSiteMaterial`).
    const woodOut = new Uint8Array(m === 'wood' ? src.vertexCount : 0);
    if (m === 'wood') src.eachTriangle((a, b, cc, mx, my, mz) => {
      if (indoors[a] && indoors[b] && indoors[cc]) return;
      const wx = ox + mx * c - mz * s, wz = oz + mx * s + mz * c;
      if (my < y + 120 && inDepth(wx, wz) < 0.35) woodOut[a] = woodOut[b] = woodOut[cc] = 1;
    });
    const place = (v: { p: number[]; n: number[]; colour: number[]; field: number[]; open: number }, i: number) => {
      const x = v.p[0], z = v.p[2], nx = v.n[0], nz = v.n[2];
      v.p[0] = ox + x * c - z * s; v.p[2] = oz + x * s + z * c;
      v.n[0] = nx * c - nz * s; v.n[2] = nx * s + nz * c;
      if (indoors[i] && outOf(v.p[0], v.p[2]) < 0.05) v.open = -1;
      if (woodOut[i]) { v.field[3] = (paintedWood(v.colour) ? -1 : 1) * (1000 + o.foot(v.p[0], v.p[2])); return; }
      // Only a wall that looks out of the house: and if it looks into the next house, it is indoors, and has no damp.
      if (Math.abs(v.n[1]) > 0.5 || outOf(v.p[0] + v.n[0] * 0.4, v.p[2] + v.n[2] * 0.4) < 0.2) return;
      if (!roofOrGlass && v.p[1] < wallTop && o.neighbour?.(v.p[0] + v.n[0] * 0.8, v.p[2] + v.n[2] * 0.8)) { v.open = -1; return; }
      // (A church's tower is weathered to its top as its walls are.)
      if (!weathers || v.p[1] > y + 120) return;
      v.field[3] = 1000 + o.foot(v.p[0] + v.n[0] * 0.3, v.p[2] + v.n[2] * 0.3);
    };
    if (!o.fine && !o.indoor) { into(m).append(src, place); continue; }
    // Where the caller has somewhere for them, two shares are laid apart, to be left out of the picture from a distance: what is
    // slight (a glazing bar, a window's frame, a baluster: `fine`), less than a point of the picture across from some sixty metres;
    // and what is indoors (`indoor`), seen only through the windows, which from a distance hide it (`makePaneMaterial`). But not
    // the inner faces of the outer walls: with those kept, an open door from far off shows a room's walls and not the street behind.
    // (Laid whole first, so that each triangle is judged where it lies; then shared out triangle by triangle, so that none falls
    // between two shares.)
    const laid = new MeshBuilder();
    laid.append(src, place);
    const share = new Uint8Array(laid.triangleCount);
    let t = 0;
    laid.eachTriangle((a, b, cc, mx, _my, mz, _nx, ny) => {
      const k = t++;
      if (o.indoor && laid.openAt(a) < 0 && laid.openAt(b) < 0 && laid.openAt(cc) < 0 && !(Math.abs(ny) < 0.5 && inDepth(mx, mz) < SHELL)) { share[k] = 2; return; }
      if (o.fine) {
        const da = laid.detailAt(a), db = laid.detailAt(b), dc = laid.detailAt(cc);
        if (da > 0 && da <= FINE && db > 0 && db <= FINE && dc > 0 && dc <= FINE) share[k] = 1;
      }
    });
    const as = () => {};
    into(m).append(laid, as, (k) => share[k] === 0);
    if (o.fine) o.fine(m).append(laid, as, (k) => share[k] === 1);
    if (o.indoor) o.indoor(m).append(laid, as, (k) => share[k] === 2);
  }
}

/** How far within the walls' line a wall's face that looks into the house may lie and still be the house's shell (`placeHouse`). */
const SHELL = 0.6;

/** The second least measure, in centimetres, at or below which a solid is slight (`placeHouse`): a window's frame, and not a shutter. */
export const FINE = 7.5;

/**
 * Whether timber of this colour is painted, and not bare or stained: bare timber is of the oak's brown, a red brown with little
 * blue in it (`OAK` in `buildings.ts`, and the boards' browns, which are near it whatever their shade); shutters, doors and frames are
 * green, blue, red or white. (A brown paint near the oak's is taken for oak, which it looks like.)
 */
function paintedWood(col: number[]): boolean {
  const sum = col[0] + col[1] + col[2] || 1, r = col[0] / sum, g = col[1] / sum;
  return Math.hypot(r - 0.475, g - 0.315) > 0.06 || sum / 3 > 0.45;
}
