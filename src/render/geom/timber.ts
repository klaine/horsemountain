import { Vector3 } from 'three';
import { MeshBuilder } from './meshBuilder';

/**
 * Plain squared timber between two points: a rail, a post, a plank. Where masonry is laid stone
 * by stone, a beam is one closed box, turned to lie along its length, which is all a fence rail
 * or the deck of a landing stage needs. Closed on all six sides.
 */

const A = new Vector3(), U = new Vector3(), S = new Vector3(), T = new Vector3(), P = new Vector3();

export function layBeam(
  mesh: MeshBuilder, from: Vector3, to: Vector3, width: number, depth: number, colour: [number, number, number], grain = 0,
): void {
  A.subVectors(to, from);
  const length = A.length();
  if (length < 1e-4) return;
  A.multiplyScalar(1 / length);
  // Across the beam, level if it can be; and the remaining direction, mostly upwards.
  S.set(A.z, 0, -A.x);
  if (S.lengthSq() < 1e-6) S.set(1, 0, 0);
  S.normalize();
  T.crossVectors(S, A).normalize();
  if (T.y < 0) T.negate();
  const hw = width / 2, hd = depth / 2;
  // Six faces, each with its own corners so that its shading is flat.
  const face = (n: Vector3, corners: [number, number, number][], along: number, across: number) => {
    const ids = corners.map(([l, s, t], k) => {
      P.copy(from).addScaledVector(A, l * length).addScaledVector(S, s * hw).addScaledVector(T, t * hd);
      // The grain runs along the length; a little is offset per beam so neighbours do not match.
      const u = (k === 1 || k === 2 ? along : 0) * 0.9 + grain, v = (k >= 2 ? across : 0) * 0.9 + grain * 0.37;
      const tone = 0.86 + 0.28 * (((Math.floor(grain * 97) + k * 3) % 7) / 7);
      return mesh.addVertex(P.x, P.y, P.z, n.x, n.y, n.z, u, v, colour[0] * tone, colour[1] * tone, colour[2] * tone);
    });
    mesh.addTriangle(ids[0], ids[1], ids[2]);
    mesh.addTriangle(ids[0], ids[2], ids[3]);
    mesh.markFace(ids);
  };
  U.copy(T);
  face(U, [[0, -1, 1], [1, -1, 1], [1, 1, 1], [0, 1, 1]], length, width);
  U.copy(T).negate();
  face(U, [[0, 1, -1], [1, 1, -1], [1, -1, -1], [0, -1, -1]], length, width);
  U.copy(S);
  face(U, [[0, 1, 1], [1, 1, 1], [1, 1, -1], [0, 1, -1]], length, depth);
  U.copy(S).negate();
  face(U, [[0, -1, -1], [1, -1, -1], [1, -1, 1], [0, -1, 1]], length, depth);
  U.copy(A);
  face(U, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], width, depth);
  U.copy(A).negate();
  face(U, [[0, -1, 1], [0, 1, 1], [0, 1, -1], [0, -1, -1]], width, depth);
}
