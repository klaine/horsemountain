/**
 * Of the game's scene (klaine/dungeons, `src/render/scene.ts`), only what this game's materials name: the frame a town's paving is laid
 * in, which `siteMaterial.ts` takes as a type. (Kept at the same path, so that `siteMaterial.ts` is the game's own, unchanged.)
 */
export interface PaveFrame {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  data: Float32Array;
}
