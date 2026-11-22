/**
 * Of the game's scene (klaine/dungeons, `src/render/scene.ts`), only what this game's materials and its trees name: the frame a town's
 * paving is laid in, which `siteMaterial.ts` takes as a type; and a set of cards, which `planting.ts` and `vegetation.ts` plant and draw
 * the woods with. (Kept at the same path, so that those files are the game's own, unchanged.)
 */
export interface PaveFrame {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  data: Float32Array;
}

/**
 * Flat cards drawn many times over: grass, flowers, leaves. Each is a small textured sheet; a
 * crown of a tree is a few hundred of them. They are placed by the mesher and drawn by the
 * renderer, and take no part in the bake or in collision.
 */
export interface CardSet {
  /** What is painted on the cards. */
  kind: 'grass' | 'flower' | 'fern' | 'herb' | 'reed' | 'leaf' | 'needle' | 'pine' | 'fir' | 'tree' | 'thrift' | 'marram' | 'gorse' | 'bloom';
  /** A tuft is three upright sheets crossed, standing on its base; a card is one sheet about its middle. */
  shape: 'tuft' | 'card';
  /** Whether the cards cast shadows. */
  shadow: boolean;
  /** Per card: a 4 by 4 transform (column-major), a colour, and the point its shading curves about. */
  matrices: number[];
  colours: number[];
  centres: number[];
  /**
   * Per card, where some draw trees in levels (the walk page: whole near by, more simply further off, one painted card beyond): the
   * foot of the tree it belongs to and a number of the tree's own, 0 to 1, four to a card. With them `makeCards` lets the levels give
   * way to one another tree by tree (`treeShare`). Not given, nothing changes.
   */
  trees?: number[];
}
