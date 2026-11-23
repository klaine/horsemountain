/**
 * The site document: what a generated place is, independent of how it is drawn.
 *
 * A site is a set of rectangular places, joined by ways. In the first version of this document
 * every place stood on one shared plan and every way went through the wall between two of them.
 * In the second, places may also lie one above another, on storeys, and a way may be a stair
 * that climbs from a place to the one over it. Axes: +x east, +y up, +z south; lengths in metres.
 */

export type Side = 'n' | 's' | 'e' | 'w';

export type Roof =
  /** A half-round stone vault along the place's long axis. */
  | 'barrel'
  /** A flat ceiling of boards on beams. */
  | 'timber'
  /** Open to the sky. */
  | 'sky'
  /** Not built at all: a natural cave, with rock for walls, floor and ceiling. */
  | 'cave';

export type Role = 'approach' | 'entrance' | 'passage' | 'court' | 'reward' | 'goal';

/**
 * How a place is lit. Darkness is a choice the generator makes, not a failure to place lights:
 * a dark room is somewhere the player's own light matters.
 */
export type Lighting =
  /** Open to the sky, or lit through windows and arches from a court. */
  | 'day'
  /** Torches on the walls. */
  | 'torch'
  /** Nothing. Only what the player carries, and what spills in through the doors. */
  | 'dark'
  /** In a cave: growths on the rock that give a faint light of their own. */
  | 'glow';

export interface Place {
  id: number;
  role: Role;
  roof: Roof;
  light: Lighting;
  /** Interior extent. Walls lie outside it. */
  x0: number; x1: number; z0: number; z1: number;
  /** Floor height. */
  floor: number;
  /** Height of the walls above the floor: to the springing of a vault, or to a flat ceiling. */
  wall: number;
  /** Direction a barrel vault runs. */
  axis: 'x' | 'z';
  /** Steps from the entrance, counted in places. */
  depth: number;
  /** What the place is in the fiction. Furnishing follows from it. */
  name: string;
  /** The roof has come down: open to the sky, with what fell still lying there. */
  fallen?: boolean;
  /** In a cave: a hole in the roof, open to the sky above the hill, that lets daylight down. */
  shaft?: { x: number; z: number; r: number };
  /**
   * Which storey the place is on: 0, or left out, for the ground storey that all the places of
   * version 1 stand on; 1 for a room over one of those; -1 for a cellar under one. A place on
   * another storey has the same outline as the place it is over or under, and is reached from
   * it by a stair. (In a cathedral, storeys go further: a tower's rooms are 1 to 3 over its foot,
   * and the rooms under the church are reached from one another as well as by stairs, so that a
   * cell of its dungeon lies under part of a transept, and not under the whole of any one place.)
   */
  level?: number;
  /**
   * Of a vaulted place (`barrel`): that its vault is pointed, two arcs of a circle half as broad
   * again as the place meeting along its crown, as a Gothic vault is, and not half round. Its crown
   * then stands half as high again over its springing as a half-round vault's would.
   */
  pointed?: boolean;
  /**
   * Of a vaulted place (`barrel`): how many vaults side by side carry its ceiling, each running its
   * length, carried between them on rows of columns, as in a crypt. Left out, one across its whole span.
   */
  spans?: number;
}

/** Keys are told apart by their metal. */
export type KeyId = 'iron' | 'gold';

/** A door leaf hung in a doorway, and what stops it opening. */
export interface DoorSpec {
  /**
   * Shut doors open when approached, unless something holds them. Open ones are just standing open.
   * A gate is a portcullis: it can be seen through, and only its lever raises it. A secret door
   * is faced in stone to pass for wall, and gives way when pressed.
   */
  leaf: 'shut' | 'open' | 'gate' | 'secret';
  /** Index into the site's levers of the one that raises this gate. */
  lever?: number;
  /** Needs this key. */
  lock?: KeyId;
  /** Barred on the side of this place: it opens only from there, and stays open afterwards. */
  barredFrom?: number;
}

/** Something to pick up. */
export interface Item {
  kind: 'key';
  key: KeyId;
  place: number;
}

/** A lever standing on the floor of a place, which raises a gate somewhere. */
export interface Lever {
  place: number;
  /** Index into the site's ways of the gate it raises. */
  opens: number;
  x: number;
  z: number;
}

export interface Way {
  /** Place ids. `side` is the wall of place `a` that the way passes through. */
  a: number;
  b: number;
  side: Side;
  door?: DoorSpec;
  /**
   * A door is a person-sized arch; an arch is a wide open bay; a window cannot be walked through.
   * A stair does not go through a wall at all. It joins a place (`a`, the lower) to the place
   * directly over it (`b`): a straight flight inside the lower place, hard against its `side`
   * wall, rising from `at` along that wall to `to`, where it comes up through the floor above.
   * `halfWidth` is half the breadth of the flight.
   */
  kind: 'door' | 'arch' | 'window' | 'stair';
  /** Position of the centre along the wall: an x coordinate for north and south walls, z for east and west. */
  at: number;
  halfWidth: number;
  /** For a stair: where along the wall its head is, as `at` is where its foot is. */
  to?: number;
  /**
   * A way between two chambers of a cave: a cleft in the rock, not something built. It has no
   * door and no steps; its floor slopes from the one chamber's level to the other's.
   */
  natural?: boolean;
  /**
   * Of an arch or a door, how high over the higher of its two floors its arch springs, where that is
   * not a doorway's height: the arcades of a church, the arch into its crossing. A window in a church
   * says the same of its own place's floor, and `sill` where it begins.
   */
  spring?: number;
  sill?: number;
  /** That its arch is pointed (two arcs, each as broad as the opening, meeting at its head), as a Gothic arch is. */
  pointed?: boolean;
  /**
   * Of a stair: that it climbs round the walls of the lower place, as a tower's stair does, and does
   * not go straight up one of them. It starts at `at` along `side` and climbs along that wall the way
   * of the sun seen from above (along `n` towards greater x, then `e` towards greater z, `s` towards
   * lesser x, `w` towards lesser z), turning at each corner onto the next wall by a square landing as
   * broad as the flight, until it reaches the floor over it; it comes up through that floor along the
   * wall it ends on, at `to`. Its steps are a step high and a quarter of a metre deep, and nothing is
   * under them but the wall they are set in. See `roundStair`.
   */
  round?: boolean;
}

/** Something out in the valley. */
export interface Feature {
  /**
   * A pond lies in a hollow, with a landing stage built out into it from the side nearest the
   * track. Stones are a ring of standing stones on a low rise, with a flat stone in the middle.
   * A ruin is what is left of a small stone hut: broken walls, and a doorway on the side of the track.
   */
  kind: 'pond' | 'stones' | 'ruin';
  x: number;
  z: number;
  /** Radius: of the hollow the pond lies in, of the ring, or of the ground the ruin stands on. */
  r: number;
  /**
   * For a pond: its outline. How far the edge of its hollow lies from the middle in each of an
   * even ring of directions, starting towards +x and turning towards +z, as a share of `r`.
   * Left out, the pond is round. A pond may be a pool a few paces across or a lake that fills
   * its side of the valley; its shore bends away from the track and from whatever else is there.
   */
  shore?: number[];
  /** For a lake: a small island in it, as where its middle is and how far it is across its top. */
  isle?: { x: number; z: number; r: number };
}

/**
 * Running water. It rises at a spring under the rock, or runs out of a pond; it ends in a pond,
 * or goes to ground in a sink at the foot of the rim. The builder cuts it a bed that falls all
 * the way, so it never runs uphill, however the ground lies.
 */
/**
 * A terrace: a shelf of level ground standing out from one of the valley's side walls, part-way
 * up it, with a cliff of its own below and the rest of the wall behind. It is reached by a
 * ledge that rises along the wall from the valley floor, beginning beyond one end of it. From
 * the top the whole valley can be seen, and something has been left at its far end.
 */
/**
 * A camp of charcoal burners: a clearing `r` metres across the half of it, off the track, with a footpath to it.
 * In it stand clamps (round stacks of wood covered with earth and turf, in which the wood is charred): one
 * `burning`, which smokes; one `building`, the wood stacked on end and not yet covered; and one `spent`, opened
 * and raked out, a ring of earth with charcoal lying in it. The burners' `hut` is a cone of poles covered with
 * turf, its door looking `facing` (radians, 0 towards greater x); they must watch a clamp night and day.
 * `stacks` are cordwood, `turn` being the way each runs. `props` are the smaller things of the trade.
 */
export interface Camp {
  x: number; z: number; r: number;
  clamps: { x: number; z: number; r: number; state: 'burning' | 'building' | 'spent' }[];
  hut: { x: number; z: number; r: number; facing: number };
  stacks: { x: number; z: number; turn: number; length: number }[];
  props: { kind: 'block' | 'barrel' | 'sacks' | 'sledge' | 'hearth'; x: number; z: number; turn: number }[];
}

export interface Terrace {
  /** Which side wall it stands against: `w` is the side of lesser x. */
  side: 'w' | 'e';
  /** Its level part lies from `z0` to `z1` along the valley. */
  z0: number;
  z1: number;
  /** How far it stands out from the foot of the wall, and how high above the valley floor, in metres. */
  depth: number;
  height: number;
  /** Which end the way up is at (`n` is towards the house), and how far the way up runs along the wall beyond that end. */
  rise: 'n' | 's';
  run: number;
  /** What the way up is: a ledge the rock happens to offer, or steps somebody cut in it, which are steeper and shorter. */
  way: 'ledge' | 'steps';
  /** Whether the lookout at its far end is a shrine, which pilgrims climb to, with wayside crosses up the way to it; otherwise there is a cairn. */
  shrine?: boolean;
  /** Whether this is the promontory a village's keep stands on; then it has no cairn or shrine. */
  keep?: boolean;
}

/**
 * A grotto: a cave in one of the valley's side walls. Most are small and natural; some are halls cut by hand (see `hall`). Its mouth is at the foot of the
 * wall, at `z` along the valley; a passage runs in under the hill to a chamber about `r` across
 * the half of it. It has nothing to do with the house. Something glows in it, and something was left there.
 */
export interface Grotto {
  side: 'w' | 'e';
  z: number;
  r: number;
  /**
   * If present, this is no natural cave but a hall hewn under the hill, and `r` is not used.
   * A squared doorway in the rock face opens on a broad stair that goes down `drop` metres, and
   * at its foot is the hall: `length` metres on from there, `width` across, `height` to the
   * crown of its roof, with two rows of pillars down it and a tomb on a dais at the far end.
   * It is lit by torches on the pillars and by nothing else.
   */
  /**
   * If present, this is a mine and `r` is not used: an adit driven level into the hill from the foot of the wall, `length`
   * metres of timbered drift to a working at its end, with a crosscut off it part way in (`cross.at` metres in, `cross.length`
   * long, towards greater z if `cross.side` is 1) that was given up. Out of doors, before its mouth: a tramway of wooden rails
   * runs out along the adit's line to the tip of a spoil heap `heap` metres long; and the miners' shed stands beside the
   * mouth, on the side of `shed` (1 is greater z).
   */
  mine?: { length: number; cross: { at: number; length: number; side: -1 | 1 }; heap: number; shed: -1 | 1 };
  hall?: {
    length: number; width: number; height: number; drop: number;
    /**
     * If present, the hall is one of the great ones, and the stair does not come down to its
     * floor but out onto a ledge across its near end, `deep` metres above the floor: the hall
     * is first seen from above, whole. (`height` is still from the floor to the crown.) From the
     * ledge a stair goes down along one side wall; along the other, the side named by `gallery`
     * (`n` is the side of lesser z), runs a gallery behind an arcade at the ledge's level, with
     * an aisle under it. A chasm crosses the floor from `chasm.at` metres into the hall, `width`
     * across and `depth` deep, with a bridge over it at the floor and another at the level of
     * the gallery; steps cut in its far side climb out of it. Daylight comes down a shaft in
     * the roof and falls where the lower bridge begins.
     */
    great?: { deep: number; gallery: 'n' | 's'; chasm: { at: number; width: number; depth: number } };
  };
}

/**
 * A building that stands by itself in the valley and is seen from outside: a house, an inn, a
 * lodge. It has a style, which decides how it is made and of what, and a few measures; the rest
 * (where each timber goes, what stands in each window) is worked out by whoever builds it, from
 * these and from the site's seed. Its doors are shut: nothing in it is part of the house's mission.
 *
 * `x`, `z` is the middle of the ground it stands on; `w` is its breadth along its front and `d`
 * its depth from front to back, both outside its walls. `faces` is the way its front looks: `e`
 * towards greater x, `w` towards lesser. `storeys` counts the ground storey; the roof is above the
 * last. `heights` is how high each storey is, from its floor to the floor above, the ground storey
 * first; they differ from building to building and from storey to storey, as they do in a real
 * street. `bays` is how many windows stand in a row across the front. `colour` is the wash on its
 * walls, or what fills the spaces between its timbers.
 *
 * Of the style `timber`: a framed house of posts, rails and braces on a ground storey of plastered
 * stone, as in the old towns of Alsace and the Moselle. Each upper storey stands `jetty` metres
 * further out over the street than the one below; `gable` says whether a gable of the steep tiled
 * roof faces the street (true) or its eaves do, with dormers in the roof (false).
 *
 * Of the style `imperial`: a stuccoed classical building of the early nineteenth century, as on
 * the market squares of the northern capitals. A rusticated ground storey, tall windows in even
 * rows above it, a heavy cornice and a low metal roof; with `portico`, the middle bays stand
 * forward under pilasters and a pediment.
 *
 * Of the style `brick`: a building of the brick towns of the Baltic and the North Sea coasts, as
 * along the Trave in Lübeck or the harbours of Stralsund and Wismar; `brick` says which of that
 * family it is and how it is made (see `BrickWork`). `colour` is the wash on a rendered front.
 *
 * Of the style `canal`: a canal house, as along the canals of Amsterdam: narrow, tall and deep,
 * its front to the water, its gable in one of the outlines the city built over two centuries;
 * `canalwork` says how it is made (see `CanalWork`). `colour` is the paint on a painted front.
 */
/**
 * How a building of brick is made. There are four kinds:
 *  - `gabled`: a merchant's house, narrow and deep, its steep gable to the street, a tall hall
 *    for goods on the ground storey behind a broad door, living storeys over it, and lofts in
 *    the roof reached by a hoist from the street;
 *  - `eaves`: a broader house of later date with its eaves to the street, its front rendered and
 *    washed, and over its middle bays a small gable of its own rising through the roof;
 *  - `store`: a warehouse, gable to the street, of many low storeys, with a column of loading
 *    doors up its middle under a hoist;
 *  - `church`: a church of the brick Gothic, standing with its long side to the street: a nave
 *    of `bays` bays (its length is the building's `w`, its breadth `d`, and `heights[0]` how high
 *    its walls stand), buttressed, with tall pointed windows; a tower or two at one end, and a
 *    choir at the other.
 * Measures not given here follow by rule from these (see `src/core/brick.ts`).
 */
export interface BrickWork {
  kind: 'gabled' | 'eaves' | 'store' | 'church';
  /**
   * The outline of the gable to the street (of an eaves house, of the small gable over its
   * middle; of a church, of the gable at its east end): in `steps` steps a side; with piers that
   * rise through it into pinnacles, `steps` spaces either side of the middle one; in `steps`
   * tiers that narrow upward with scrolls at their sides; or a plain triangle.
   */
  gable: 'stepped' | 'piers' | 'volute' | 'plain';
  steps: number;
  /** The front is rendered and washed with the building's `colour`, and what is moulded on it is white; otherwise it is bare brick. */
  rendered: boolean;
  /**
   * The clay the brick was burnt from, dug near the town as brick clay always was: `red` from clays with iron in them, as
   * along the Baltic, or `buff`, pale yellow to ochre, from clays with lime in them, as in limestone country.
   */
  clay: 'red' | 'buff';
  /** The brick's tone: its colour is multiplied by this, from dark brown to orange. */
  tone: [number, number, number];
  /** Bands of dark glazed brick run across the front, at the floors and under the gable. */
  glazed: boolean;
  /** The upper windows stand in tall pointed recesses, and the gable has rows of them: with their backs plastered white, of brick, or none. */
  niches: 'white' | 'brick' | 'none';
  /** Where the door is across the front, as a share of its breadth from its left end as one stands before it. */
  door: number;
  /** How steep the roof is, in degrees. */
  pitch: number;
  /** What the roof is covered with: red clay tiles, tiles glazed nearly black, or copper gone green. */
  roof: 'red' | 'dark' | 'copper';
  /**
   * Of a church. `end` is the end its tower stands at (-1 the left as one stands before it, 1 the
   * right): one tower, `side` metres square, in the middle of that end, or two filling it; the
   * tower's walls stand `height` metres, and over them a `spire` of `spireHeight`: a tall
   * octagonal needle; a pyramid with a spirelet at each corner; or a ridged roof between two
   * gables. At the other end stands the choir, `choirLength` long and narrower than the nave,
   * ending in a half-polygon (`apse`) or a flat wall with a gable (`flat`).
   */
  church?: {
    end: -1 | 1; towers: 1 | 2; side: number; height: number; spire: 'needle' | 'corners' | 'saddle'; spireHeight: number;
    choir: 'apse' | 'flat'; choirLength: number;
  };
}

/**
 * How a classical building (style `imperial`) is dressed, from a plain block to a palace on a sloping square: what stands forward
 * and what carries it, the heads of its windows, its ornament, and how it meets the ground. A building without it is dressed as the
 * first of them were: the middle three bays standing forward under pilasters where there is a portico, a rusticated ground storey
 * with flat arches over its windows, a cornice over every window of the principal storey and a pediment over every other, a small
 * window in the pediment, one door, and a plinth of half a metre on level ground.
 */
export interface ClassicalDress {
  /** How many bays of the middle stand forward, where there is a portico: three, five, seven or nine. */
  centre: number;
  /**
   * What carries the middle's pediment: pilasters against its wall, or columns standing clear of it through the storeys over the
   * ground storey, on the ground storey of the middle brought forward as their base, its doors and windows deep in it.
   */
  order: 'pilasters' | 'columns';
  /** How many bays at each end stand forward as pavilions, under pilasters of their own: none, or one to three. */
  pavilions: number;
  /** Which storeys have windows with round heads: none, the ground storey, or it and the one over it. */
  arches: 0 | 1 | 2;
  /** Over the windows of the principal storey: the surround alone; a cornice; a cornice, and a pediment over every other; or a pediment over every one. */
  heads: 'plain' | 'cornice' | 'alternate' | 'pediments';
  /** The render of the ground storey cut in courses. */
  rusticated: boolean;
  /** Wreaths along the frieze under the cornice, one over each window. */
  frieze: boolean;
  /** A balustrade along the top of the cornice, before the roof. */
  balustrade: boolean;
  /** In the pediment: a small window, a round one, a clock, or nothing. */
  tympanum: 'window' | 'oculus' | 'clock' | 'plain';
  /** A flagpole over the middle. */
  flag: boolean;
  /** What the roof is covered with: sheet metal of the tone dealt, or grey, green, red-brown or black; copper gone green; red clay tiles, or dark ones. */
  roof: 'dealt' | 'grey' | 'green' | 'red' | 'black' | 'copper' | 'tiles' | 'dark';
  /**
   * How richly its walls are dressed. `empire`: strips at the corners over the ground storey, surrounds to the windows with sills on
   * blocks and heads as `heads` says, three bands over the ground storey, a deep cornice on blocks. `quoins`: as the Renaissance did,
   * stones laid long and short up the corners in place of the strips, and the surrounds eared at their tops. `lesenes`: plainer, as
   * Nordic classicism was: flat strips up the corners from the plinth, plain frames to the windows with no heads, one band, a lighter
   * cornice with no blocks, and the order of the middle flat strips too. `bare`: nothing but the openings, their sills, one band and a
   * slim cornice.
   */
  style: 'empire' | 'quoins' | 'lesenes' | 'bare';
  /** Doors in the middle: one, or three side by side into the one hall (where the middle is three bays broad or more). */
  doors: 1 | 3;
  /** How high the floor of the ground storey stands over the ground before the door: half a metre of plinth, or more, a basement with small windows of its own. */
  plinth: number;
  /**
   * How much lower the ground stands at the right end of the front than at the left, as one stands before it (less than nothing
   * where the left is lower). The building stands level, and the granite of its base shows the more the further the ground falls
   * away. Never more than the plinth allows: the ground at the upper end stays under the floor.
   */
  fall: number;
}

/**
 * How a canal house is made: the measures of the house are the building's (`w`, `d`, `storeys`,
 * `heights`, `bays`); this is the rest. Everything here is chosen independently, so that one house
 * may be a narrow front of one window with a bell gable and the next a double house of seven
 * under a raised cornice; but the dealer (`src/core/canal.ts`) keeps them to the combinations the
 * city built.
 */
export interface CanalWork {
  /** A dwelling, with a stoop and tall windows; or a warehouse, of lower storeys, with a column of loading doors under the hoist and shutters to its windows. */
  kind: 'house' | 'warehouse';
  /**
   * The outline of the front over the eaves, from the oldest to the latest: `spout`, a narrow
   * upright strip in the middle rising over the roof, the slopes either side boarded; `stepped`, in
   * `tiers` steps a side; `neck`, a narrow upright neck over shoulders, with carved claw pieces filling
   * the corners between (with `tiers` 2, a broader neck first and a narrower one on it); `bell`, the
   * outline curving in from the shoulders to a narrow top as a bell does; `cornice`, a straight
   * cornice across the whole front, the roof behind it; `raised`, such a cornice with a panel rising
   * over its middle.
   */
  gable: 'spout' | 'stepped' | 'neck' | 'bell' | 'cornice' | 'raised';
  /** Of a stepped gable, its steps a side (2 to 5); of a neck gable, its tiers (1 or 2). */
  tiers: number;
  /** What stands on the top of the gable or the raised panel: a triangular pediment, a segmental one, a curved crest with scrolls, or a flat cap with a ball. */
  crown: 'triangle' | 'segment' | 'scroll' | 'flat';
  /** The front is bare brick, or painted over in the building's `colour`. */
  front: 'brick' | 'painted';
  /** The clay of the brick, as for `BrickWork`; and its tone, by which its colour is multiplied. */
  clay: 'red' | 'buff';
  tone: [number, number, number];
  /** The colour of what is dressed: sandstone, or paint. */
  trim: [number, number, number];
  /**
   * How much is carved and moulded: 0, a plain front, the windows under flat arches of brick; 1,
   * bands of stone at the floors, keystones, a moulded door case; 2, besides, garlands under the
   * windows, crowned windows, vases and scrolls on the gable, an oval window under its crown; 3,
   * besides, pilasters between the bays storey over storey and a balustrade or a crest at the top.
   */
  ornament: 0 | 1 | 2 | 3;
  /** The windows: `cross`, a mullion and a transom with small panes above and shutters below; `small`, sashes of many small panes; `large`, sashes of one or two panes. */
  windows: 'cross' | 'small' | 'large';
  /** Paint: of the window frames; of the shutters, if there are any (a warehouse always has them); of the door. */
  frame: [number, number, number];
  shutters: [number, number, number] | null;
  paint: [number, number, number];
  /** A timber front to the ground storey, painted this colour, with great windows and the door in it; or none, the brick going down to the plinth. */
  pui: [number, number, number] | null;
  /**
   * How high the floor of the ground storey stands over the street, up a stoop of steps and a landing; and whether under it there
   * is a basement, half under the street, lit by low windows at the foot of the front.
   */
  stoop: number;
  basement: boolean;
  /** How far the front leans out over the street for each metre of its height, as the fronts on the canals do so that goods hoisted clear it. */
  lean: number;
  /** The bay the door is in, counted from 0 at the left as one stands before the front. */
  door: number;
  /** How steep the roof is, in degrees, and what it is covered with: red clay tiles or tiles glazed nearly black. */
  pitch: number;
  roof: 'red' | 'dark';
  /** A hoist beam with its hook over the top hatch. */
  hoist: boolean;
}

/**
 * The plan of a building's rooms: alike on every storey, except where a room or a door names the
 * one `storey` it is on (a timber house is planned storey by storey). Everything is in the building's own
 * measures: `u` across the front from its middle, to the right as seen from outside; `v` back
 * from the face of the front wall. A room is its clear floor, inside its walls.
 */
export interface BuildingPlan {
  /**
   * `linings` is how far each of the room's walls reaches out from its floor before it meets the
   * next room's or the rendered skin outside, in the order front, back, left, right (as `v0`,
   * `v1`, `u0`, `u1`): half a wall between rooms, all of an outer wall within its skin.
   */
  rooms: { kind: 'hall' | 'stair' | 'passage' | 'front' | 'back' | 'wing' | 'carriage' | 'office' | 'loft'; u0: number; u1: number; v0: number; v1: number; linings: [number, number, number, number]; storey?: number }[];
  /** Doorways between rooms: in the wall whose middle line is at `at` (a `u` if `line` is `u`, a `v` if `v`), centred at `c` along it, `w` wide; `tall` for an arch into a stair hall. */
  doors: { line: 'u' | 'v'; at: number; c: number; w: number; tall?: boolean; through?: number; storey?: number }[];
  /** The thickness of the outer walls, of the wall down the middle of the depth, and of the walls between rooms. */
  walls: { outer: number; spine: number; cross: number };
  /**
   * Of a house of brick or a canal house: where its stair stands, the same on every storey. Its flights stand one over another in
   * this footprint, each rising from the floor below at `v0` toward `v1`, the longest filling it; `wall` is the side that stands
   * against a wall (-1 the `u0` side, 1 the `u1`), the other side open, with a rail. The steps follow by rule from the storeys'
   * heights (`steepFlights` in `src/core/interior.ts`). Every storey but the top has a flight up from it.
   */
  stair?: { u0: number; u1: number; v0: number; v1: number; wall: -1 | 1 };
}

export interface Building {
  /**
   * Timber-framed (`timber`), stuccoed classical (`imperial`), a classical house of weatherboards on a stone basement (`wooden`),
   * Hanseatic brick (`brick`), a canal house (`canal`), a village's church of stone (`chapel`, with `chapel`), or a shed of boards (`shed`).
   */
  style: 'timber' | 'imperial' | 'wooden' | 'brick' | 'canal' | 'chapel' | 'shed';
  x: number;
  z: number;
  w: number;
  d: number;
  faces: 'e' | 'w';
  /**
   * Of a building in a town, which stands along a street whichever way it runs: the bearing its front faces, in radians from the
   * direction of greater x towards greater z (so `faces` is not read); and the height of the ground it stands on.
   */
  turn?: number;
  y?: number;
  storeys: number;
  heights: number[];
  bays: number;
  colour: [number, number, number];
  jetty?: number;
  gable?: boolean;
  /** Of a timber house: where its door is in the front, as a share of the front's breadth from its left end as one stands before it. */
  door?: number;
  /**
   * Of a mill: its waterwheel, standing in the stream beside its back wall: where the wheel's
   * middle is (`x`, `z`, and `y` above the ground before the mill's door), and its radius. The
   * axle runs through the back wall, square to it.
   */
  wheel?: { x: number; z: number; y: number; r: number };
  /** Of a timber house: burnt out. Its roof and glass are gone, its timbers charred and its walls smoke-blackened; its stone chimney stands. */
  burnt?: boolean;
  portico?: boolean;
  /**
   * Of a classical building in a closed block: a carriage way through its ground storey from the street to the yard behind, under a
   * round arch in the front and the back, through the two bays at its left end (-1) or its right (1) as one stands before it.
   */
  arch?: { side: -1 | 1 };
  /**
   * Of a broad classical building: the bays its front doors are in, counted from 0 at the left as one stands before it, if it has more
   * than the one in its middle bay. Each is an entrance with a stair of its own.
   */
  entrances?: number[];
  /**
   * Of a wooden house: how high its basement of rough granite stands over the ground before its front (its floor is that high), the end
   * its door is in (-1 the left as one stands before the front, 1 the right), up steps under a little roof, near the front; and how
   * many half-round dormers light its attic from the front's slope of the roof.
   */
  basement?: number;
  endDoor?: -1 | 1;
  dormers?: number;
  /** Of a classical building whose middle stands forward: false if no pediment stands over that middle, the cornice running straight across it. */
  pediment?: boolean;
  /** Of a classical building: how it is dressed, from a plain block to a palace on a sloping square (see `ClassicalDress`). Without it, as the first of them were. */
  dress?: ClassicalDress;
  /**
   * What stands close about the building, in its own measures (across its front, and back from it): the outline of each such thing,
   * and how high its walls rise over the ground before this one's door. A window that would look into one from nearer than a few
   * metres, and under its top, is left out and the wall is blank there, as it is where houses stand against one another.
   */
  near?: { at: [number, number][]; top: number }[];
  /**
   * Of a classical building: walls of bare brown brick instead of a wash. `stucco`: its dressings (cornices, bands, surrounds,
   * pilasters, corner strips) stay stuccoed white, and its ground storey is stucco the colour of stone, rusticated; `bare`: all of it
   * is brick, dressings included, laid a little paler as moulded brick is.
   */
  brick?: 'stucco' | 'bare';
  /**
   * Of a classical building with wings: towers at its corners, rising `extra` storeys over its cornice, each `size` metres square
   * and standing on the corner named: the ends of the front (`front`), the far ends of the wings (`wing`), or the back corner of an end
   * that has no wing (`back`), on the left (-1) or right (1) as one stands before the front.
   */
  towers?: { corner: 'front' | 'wing' | 'back'; side: -1 | 1; size: number; extra: number }[];
  /**
   * For a building set into rising ground: how much higher the ground stands at its back than
   * before its door. Its lowest storey is then half a basement, open to the front and buried at
   * the back, and it has a second door in the back wall, at `backDoor` across it, onto the ground there.
   * Of a timber house, a village's on its hillside: its stone ground storey is the half basement, its windows to the street alone, and
   * its first framed storey has the second door, in the middle bay of its back wall, onto a yard levelled there.
   */
  sunk?: number;
  backDoor?: number;
  /**
   * Of a timber house on a hillside that falls away behind it: a cellar under it, as deep as this below its floor, its walls of rough
   * stone, open to the ground behind the house by a door and a barred window in its back wall, onto a yard levelled there.
   */
  cellar?: number;
  /**
   * Of a village's church (style `chapel`): its nave is `w` long, along its front, and `d` broad, its walls `heights[0]` high, its door in
   * the middle of its front's half towards the tower. At one end (`end`, -1 for the left as one stands before the front) a square
   * tower `tower` metres a side, its walls rising to `height` over the ground before the door, under a spire: `pyramid`, `needle` (eight
   * sides, tall) or `saddle` (a ridged roof between two gables); at the other a choir `choir` metres long, narrower and lower than the
   * nave, ending in a half-round apse where `apse`.
   */
  chapel?: { end: -1 | 1; tower: number; height: number; spire: 'pyramid' | 'needle' | 'saddle'; spireHeight: number; choir: number; apse: boolean };
  /**
   * Wings reaching back from the ends of the main block, making the building an L (one) or a U
   * (two) about a court behind it. `side` is -1 for the left end as one stands before it and 1
   * for the right; `width` is how much of the main block's breadth the wing takes, from its end
   * inward; `length` is how far it reaches back beyond the main block. It has the main block's storeys.
   */
  wings?: { side: -1 | 1; width: number; length: number }[];
  /** Of the style `brick`: which of the family it is, and how it is made. */
  brickwork?: BrickWork;
  /** Of the style `canal`: how it is made. */
  canalwork?: CanalWork;
  /** Its rooms, if it has any that can be gone into. */
  plan?: BuildingPlan;
}

/**
 * A harbour town on a coast, in a bay between headlands, with the mountains behind it. The land
 * was found (`coastland.ts`) and the town laid on it: the sea lies south, and everything is in the
 * site's measures. The house stands at the head of the market square on a terrace, its forecourt
 * the terrace's top; a broad stair comes down from it into the square, which opens at its foot
 * onto the waterfront and the quay. Blocks of buildings stand about the square in streets laid
 * square to it: the classical buildings nearest the square and the harbour, timber houses beyond,
 * and on the fringes, along the shore and up the slopes, shacks. Outside the town are fields, and
 * woods up the hills.
 */
export interface Town {
  /**
   * Where the land was found: the frame's seed, the point of the frame under the middle of the quay's edge, how far the frame is
   * turned, and the height in the frame of the house's ground; and the lattice, in metres, that the town's own land is made on.
   */
  terrain: { seed: number; u: number; v: number; turn: number; base: number; cell: number; world?: string };
  /** The sea's level. */
  sea: number;
  /** The box the town's own land is made over: beyond it the country is the frame's, seen and not walked. */
  land: { x0: number; x1: number; z0: number; z1: number };
  /** The house's level ground, at the forecourt's floor: the terrace at the head of the square. */
  level: { x0: number; x1: number; z0: number; z1: number };
  /** The quay: its edge runs along `x` at `z`, from `x0` to `x1`, its top at `y`; the waterfront behind it is `apron` deep. */
  quay: { x0: number; x1: number; z: number; y: number; apron: number };
  /** The market square: its ground falls from `yN` at its north side to `yS` at its south, where it opens onto the waterfront. */
  square: { x0: number; x1: number; z0: number; z1: number; yN: number; yS: number };
  /** The stair from the forecourt down into the square: `x0` to `x1` broad, from the forecourt's edge at `z0` to its foot at `z1`. */
  stair: { x0: number; x1: number; z0: number; z1: number };
  /** The moles that close the harbour: each a line of points from where it leaves the quay, `width` across, its top at `y`. */
  moles: { line: [number, number][]; width: number; y: number }[];
  /** The harbour light at the end of a mole, which can be climbed. */
  light?: { x: number; z: number; y: number; r: number; height: number; door: number };
  /** Streets, lanes, stepped lanes and tracks, as lines of points `[x, z, y]`, `width` across. */
  /**
   * The ways of the town: `street`s and `lane`s at their own levels, `track`s and `path`s cut to the land; and what each is laid with,
   * if not what its kind is usually laid with (setts for a street or a lane, beaten earth for a track, a trodden line for a path):
   * `flags` (dressed stone, as beside the classical quarter), `setts`, `gravel`, or `dirt` (beaten earth, with ruts).
   */
  streets: { line: [number, number, number][]; width: number; kind: 'street' | 'lane' | 'track' | 'path'; surface?: 'flags' | 'setts' | 'gravel' | 'dirt' }[];
  /** Blocks of the town between its streets, and which of its three kinds of building each is built up with. */
  /** The form of the harbour: two arms curving towards each other, one long breakwater, straight piers, a breakwater standing off with two mouths, or a mole bent square. */
  harbourForm?: 'arms' | 'breakwater' | 'piers' | 'detached' | 'dogleg';
  /**
   * A river, if the town has one: its middle line from the hills down to the harbour, each point `[x, z, y]` with the level of its
   * water there (never falling as it goes up; a step where it rises sharply is a weir, or in the hills a fall); its breadth at each
   * point; whether it runs between stone walls there (in the town) or between banks of earth; the breadth of the quay along the top of
   * each wall; the side of the square it runs down (-1 west, 1 east); and its bridges, each at a way's crossing, at the way's level,
   * facing along the way, spanning the water, as broad as the way, of stone or of timber.
   */
  river?: {
    line: [number, number, number][]; width: number[]; walled: boolean[]; quay: number; side: -1 | 1;
    bridges: { x: number; z: number; y: number; heading: number; span: number; width: number; kind: 'stone' | 'timber' }[];
  };
  /** The outline of the harbour's water: the quay's edge, the moles' lines and the mouths between their heads. */
  harbour?: [number, number][];
  /** What kind of plan the town's streets are laid on: square and straight, following the shore, fanning out from the harbour, or crooked as an old town's. */
  plan?: 'planned' | 'shore' | 'fan' | 'old';
  /** The blocks of buildings: each its four corners, south-west, south-east, north-east, north-west (south being towards the sea), and the box about them. */
  blocks: { x0: number; x1: number; z0: number; z1: number; kind: 'classical' | 'timber'; corners?: [number, number][] }[];
  /** The buildings of the blocks and the farms: each with its `turn` and its `y`. */
  buildings: Building[];
  /**
   * Shacks: one room of boards under a roof of tarred boards, tin or turf, on the fringes of the town and along the shore; each
   * `w` across its front by `d` deep, its front facing the bearing `turn`, its floor at `y`; `stilts` if it stands on posts over
   * low ground or the water's edge, `lean` if its roof is one slope.
   */
  shacks: { x: number; z: number; y: number; w: number; d: number; turn: number; roof: 'boards' | 'tin' | 'turf'; lean: boolean; stilts: number; colour: [number, number, number] }[];
  /**
   * Storehouses along the shore beyond the harbour, in a row, their gable ends to the water: each `w` across its gable by `d` deep,
   * its gable facing the bearing `turn`, its floor at `y`, its walls `height` high to the eaves, of upright boards with battens over
   * the joints painted the red of iron ochre (or another `colour`), or of logs; a door and a hatch for loading in its gable.
   */
  storehouses: { x: number; z: number; y: number; w: number; d: number; turn: number; height: number; colour: [number, number, number]; logs: boolean }[];
  /** The stone quays the storehouses stand on: each a line of points along the water's edge, the sea on its right hand going along it, its top at `y`. */
  wharves: { line: [number, number][]; y: number }[];
  /** Stalls on the market square, each `w` by `d`, its counter facing `turn`, its awning's colours. */
  stalls: { x: number; z: number; w: number; d: number; turn: number; awning: [number, number, number]; goods: 'fish' | 'fruit' | 'cloth' | 'pots' | 'bread' }[];
  /** The fountain in the square. */
  fountain?: { x: number; z: number; r: number };
  /** Boats: open ones rowed or sailed from the beach; and, with `masts`, decked vessels (a smack of one mast, a schooner of two). */
  boats: { x: number; z: number; heading: number; length: number; afloat: boolean; masts?: number }[];
  /** Fields outside the town: each a four-cornered parcel and what is grown in it. */
  fields: { corners: [number, number][]; crop: 'wheat' | 'barley' | 'oats' | 'fallow' | 'pasture' | 'roots' | 'orchard' | 'vines' }[];
  /** Walls of dry stone about the fields, as the island's are. */
  walls: { line: [number, number][]; gaps: [number, number][]; fallen: [number, number][]; height: number }[];
  /** The outlook on the headland beside the town: a level place at the cliff's edge, with a parapet towards the sea and a belvedere. */
  outlook?: { x: number; z: number; y: number; facing: number };
  /**
   * A great hall cut in the rock of a hill or a headland outside the town, of the same make as a mountain top's (see `Mountain`):
   * where a cliff stands high over the sea, its windows look out through the cliff's face; deep in a hill it has none. Its stair comes
   * down to it from a portal in the open ground, which a path leads to.
   */
  hall?: NonNullable<Mountain['hall']>;
}

/**
 * A tower: a square building of stone standing by itself in the valley, not far from the track.
 * Inside it is one room to a storey, `half` metres from its middle to each wall, and a stair
 * from each storey to the next, the flights against the north and south walls by turns. The
 * last flight comes out on a flat roof with a parapet. The door is in the wall named, on the
 * ground; there are slit windows above. It is no part of the house and has nothing to do with
 * its doors and keys.
 */
import type { Castle } from './castle';

export interface Tower {
  x: number;
  z: number;
  half: number;
  storeys: number;
  door: 'e' | 'w';
  /** One of the castle's towers, standing astride its curtain wall. */
  castle?: boolean;
}

export interface Stream {
  /** The line it follows, in order from where it begins to where it ends. */
  course: [number, number][];
  /** How broad it is, in metres: a brook is one or two, a small river three or four. */
  width: number;
  /** Where it begins: at a spring under the rim, over the rim as a waterfall, or out of the pond. */
  from: 'spring' | 'fall' | 'pond';
  /** Where it ends: in the pond; going to ground in a sink at the foot of the rock; or out of the valley by the gap at its foot, beside the track (`out`). */
  to: 'pond' | 'sink' | 'out';
  /** Where it crosses the track, if it does, and how the track gets over: stepping stones through a brook, a timber bridge over a river. */
  crossing?: { x: number; z: number; by: 'ford' | 'bridge' };
}

/** How far the edge of a pond's hollow is from its middle in the direction of (dx, dz), in metres. */
export function shoreOf(f: Feature, dx: number, dz: number): number {
  if (!f.shore || !f.shore.length) return f.r;
  const n = f.shore.length, a = ((Math.atan2(dz, dx) / (Math.PI * 2)) * n + n) % n;
  const i = Math.floor(a), t = a - i, u = t * t * (3 - 2 * t);
  return f.r * (f.shore[i % n] + (f.shore[(i + 1) % n] - f.shore[i % n]) * u);
}

/**
 * The shape of the valley: where its two sides lie, the west (lesser x) and the east, at every
 * `step` metres down its length from `z0`, which is the front of the house. The rock rises from
 * those lines. `mouth` is how far down the gap is by which the track leaves; what is recorded
 * beyond it is the country outside, which is seen and not walked.
 */
export interface Valley {
  z0: number;
  step: number;
  west: number[];
  east: number[];
  mouth: number;
  /**
   * The ridge the house is built into: high ground from `x0` to `x1` across, from the house front
   * at `z` northward without end. The valley does not stop at the house: where a side lies
   * further out than the ridge north of the house front, the valley runs on past the house on
   * that side as an arm, which closes at its head where the side comes back to the ridge.
   */
  ridge?: { x0: number; x1: number; z: number };
  /**
   * If present, the valley was found, not drawn: in an upland made by noise and worn by water and frost (`highlands.ts`, from the
   * stream `seed`), the point (`u`, `v`) of that land's own frame lies under the middle of the meadow, the frame is turned by
   * `turn` so that the valley runs south, and the land's height there, `base`, is the meadow's floor. The line down its middle is
   * its stream's, and its sides lie where the land has risen four metres over that; its floor, its walls and the hills beyond are
   * that land. Recorded so that whoever builds the place makes the same land.
   *
   * With `world`, it was found in that world instead (`world.ts`, `worldLand.ts`): `u`, `v` are the world's own coordinates, its
   * land is read at its own height (not a share of it), and `seed` is not used.
   */
  terrain?: { seed: number; u: number; v: number; turn: number; base: number; world?: string };
}

/**
 * An island: the other kind of place there is besides a valley. The house stands on high ground
 * at one end of it, and the rest is turf and heather falling to the sea in cliffs, except where a
 * cove is cut into its side, round as a bowl, with a narrow mouth to the open sea and a beach at
 * its head, where boats come in. Everything is measured from `x`, `z`, the island's middle.
 *
 * `coast` is how far the top of the cliffs lies from the middle in each of an even ring of
 * directions, starting towards +x and turning towards +z. `sea` is the level of the sea; the
 * house's forecourt is at its own floor, some way above it. The cove is a disc of water `r`
 * across the half of it, joined to the open sea by a channel `mouth` wide, which leaves it at
 * the bearing `out` (radians, measured as `coast` is). Its beach is the part of its rim facing
 * back into the island, `beach` radians to either side of that.
 */
export interface Island {
  x: number;
  z: number;
  coast: number[];
  sea: number;
  cove: { x: number; z: number; r: number; out: number; mouth: number; beach: number };
  /**
   * How the island is come to. At a `beach`, the land comes down to the head of the cove through a
   * hollow, and a jetty runs out from the sand. At a `stair`, the cove is walled all round by cliff:
   * a stone quay stands at the foot of it, and a stair cut in the rock (`stair`) climbs the cove's
   * wall from the quay to the top, turning back on itself where it runs out of room.
   */
  landing?: 'beach' | 'stair';
  /** The stair cut in the cliff, as points `[x, z, y]` from its foot on the quay to its head on the top, a stride or so apart. */
  stair?: [number, number, number][];
  /**
   * The way from the door to the landing (to the head of the stair, or the head of the jetty), as
   * points `[x, z, y]`: the ground is cut and made up to this level along it, so that it never
   * climbs more steeply than a path can, whatever the land does about it.
   */
  way?: [number, number, number][];
  /** Summits: high ground rising `height` metres over the forecourt's floor about `x`, `z`, falling away over `r`, steep and broken. */
  peaks?: { x: number; z: number; r: number; height: number }[];
  /** How far the land comes down towards the sea near the coast in each of the directions `coast` is given for, 0 to 1: at 1 it runs down to a low rocky shore, at 0 it ends in the full height of the cliff. */
  edge?: number[];
  /**
   * If present, the island was found, not drawn: in a sea of islands made by noise and worn by water and frost (`archipelago.ts`,
   * from the stream `seed`), the point (`u`, `v`) of that land's own frame lies under the middle of the house's level ground,
   * the frame is turned by `turn`, and the land's height there, `base`, is the forecourt's floor; the sea stands at `shore` in the
   * frame. The island's own land is that
   * land made fine on a lattice `cell` metres fine and worn again; its coast is read off it, and the land across the water is
   * the rest of that sea. Recorded so that whoever builds the place makes the same land.
   *
   * With `world`, it was found in that world instead (`world.ts`, `worldLand.ts`): `u`, `v` are the world's own coordinates, the
   * sea stands at its level, nought, and the land across the water is the rest of the world; `seed` is then only for the detail.
   */
  terrain?: { seed: number; cell: number; u: number; v: number; turn: number; base: number; shore: number; world?: string };
  /** The island's back, a rise of `height` metres over the forecourt's level, round `x`, `z`, falling away over `r`. */
  crown: { x: number; z: number; r: number; height: number };
  /** How far up from the beach the land comes down to it, in metres: the hollow the village stands in. */
  combe: number;
  /** The ground about the house, kept level at the forecourt's floor: the house and its forecourt, with room to walk round. */
  level: { x0: number; x1: number; z0: number; z1: number };
  /** A jetty of stone from the beach out into the cove, from `from` to `to`, `width` across, on which the player arrives. */
  jetty: { from: [number, number]; to: [number, number]; width: number };
  /**
   * A lighthouse on a headland: a round tower `r` across the half of it at its foot, `height` to
   * the gallery round its lantern, its door towards `door` (radians), with a keeper's cottage
   * against it, on ground levelled at `y`. It can be gone into, and a stair winds up inside it to the gallery.
   */
  lighthouse?: { x: number; z: number; y: number; r: number; height: number; door: number };
  /** The ruin of a castle on another headland, facing `facing` (radians), solid and walked round, not gone into. */
  castle?: { x: number; z: number; y: number; facing: number };
  /**
   * Or a mansion: a stuccoed classical house of the kind a valley may have for its manor, made by
   * the same rules (see `Building`, style `imperial`), standing back from a headland with its
   * front to the sea, on ground levelled for it at `y`. It can be gone into.
   */
  mansion?: { building: Building; y: number };
  /** Or, on an island with no castle, the ruin of a chapel on that headland: its west front standing and its walls broken down, its east end towards `facing`. */
  chapel?: { x: number; z: number; y: number; facing: number };
  /**
   * The monks' burial ground, beside the house on the forecourt's level: a walled rectangle
   * `w` along z and `d` along x, its middle at `x`, `z`, with a gap in its wall on the side
   * towards the house, headstones in rows, and a high cross of stone.
   */
  graveyard?: { x: number; z: number; w: number; d: number };
  /**
   * Fishermen's cottages on the slope above the beach: low, of whitewashed rubble, thatched or
   * slated, a chimney at one gable. `w` along the front and `d` deep, outside the walls; the front
   * looks towards `faces` (radians); `y` is the ground levelled for it. Each is one room, and its door stands open.
   */
  cottages: { x: number; z: number; y: number; w: number; d: number; faces: number; roof: 'thatch' | 'slate'; wash: [number, number, number] }[];
  /** Boats drawn up on the beach, or moored in the cove: where, which way the bow points, and how long. */
  /** Boats: open ones rowed or sailed from the beach; and, with `masts`, decked vessels (a smack of one mast, a schooner of two). */
  boats: { x: number; z: number; heading: number; length: number; afloat: boolean; masts?: number }[];
  /** Pillars of rock standing out of the sea off the cliffs: where, how broad at the foot, how high their tops stand over the sea. */
  stacks: { x: number; z: number; r: number; height: number }[];
  /**
   * Now and then a natural arch: a span of rock from the cliff top at `from` (a point `[x, z]`) out to a stack at `to`, `width`
   * across, its top at the level `top`, and under it the sea cut through in an opening whose crown stands `under` metres over the sea.
   */
  arch?: { from: [number, number]; to: [number, number]; width: number; top: number; under: number };
  /**
   * Streams, on an island that was found: where its land drains to the sea, from a spring to the coast. `course` is the line of
   * the bed as points `[x, z, y]`, falling all the way; `width` how broad the water is; `fall`, if present, how far it drops from
   * the cliff top to the sea where it goes over.
   */
  streams?: { course: [number, number, number][]; width: number; fall?: number }[];
  /**
   * Dry-stone walls, on an island that was found: the head dyke, from coast to coast between the ground about the houses and the
   * open hill, and field walls off it. `line` is the wall's foot as points `[x, z]` about two metres apart; `gaps` are stretches of
   * it, from one point's number to another's, where there is no wall (a gateway, where a way goes through); `fallen` those where it
   * has tumbled to half its height and lies about its foot; `height` how high it stands.
   */
  walls?: { line: [number, number][]; gaps: [number, number][]; fallen: [number, number][]; height: number }[];
  /** A cave in the cliff of the cove, entered dry-shod from the end of its beach at `x`, `z`, running in towards `heading` for `length` metres. */
  seaCave?: { x: number; z: number; heading: number; length: number };
  /**
   * The strand of shingle to the sea cave, from the end of the beach or from the quay: a line of points `[x, z, y]` along the foot
   * of the cove's cliff, each with the strand's level there. The ground is raised to it a couple of metres either side.
   */
  strand?: [number, number, number][];
  /**
   * Caverns under the island, where it has a sea cave: from the end of the sea cave a passage (`lower`, points `[x, z, y]`) climbs
   * gently inland to a cavern under the hill (`hall`: its middle, its floor `y`, its half-breadths `rx` and `rz` turned by `turn`,
   * its roof `high` over the floor at its highest, with columns of dripstone in it), and from the cavern another (`upper`) climbs to
   * come out in the open ground of the island, near something built, through a cutting.
   */
  caverns?: { lower: [number, number, number][]; hall: { x: number; z: number; y: number; rx: number; rz: number; turn: number; high: number }; upper: [number, number, number][] };
  /** The mainland, seen across the water: its nearest shore lies `distance` metres off at the bearing `bearing` (radians), and it spans `spread` radians either way. `height` scales its hills and mountains: low green country at 0.3, a snowy range at 1. */
  mainland: { bearing: number; spread: number; distance: number; height?: number };
  /** Small islands between, seen and not reached. */
  islets: { x: number; z: number; r: number; height: number }[];
}

/**
 * The top of a mountain: the third kind of place. The house is a hospice on a shoulder of it,
 * under its summit, and the rest is bare rock, scree and thin turf (or snow, in winter) ending
 * all round in precipices that fall away into a sea of cloud. A ridge runs out from the top and
 * down into the cloud, and the way up it is how anyone comes; the summit can be climbed. Other
 * peaks stand out of the cloud far off. Everything is measured from `x`, `z`, the top's middle.
 *
 * `rim` is how far the top of the precipice lies from the middle in each of an even ring of
 * directions, starting towards +x and turning towards +z, as an island's `coast` is; `drop` is
 * how high the precipice is in each of them before the slope below it.
 */
export interface Mountain {
  x: number;
  z: number;
  rim: number[];
  drop: number[];
  /**
   * Buttresses and gullies too small for `rim`'s ring to hold: the rim is pushed out in fins and drawn in between them by rule
   * (`rimAt` in `mountain.ts`), from this seed, `out` metres at the most, a fin every `apart` metres or so.
   */
  ribs?: { seed: number; out: number; apart: number };
  /**
   * If present, the land is not the plain shape alone but that shape given fractal detail and worn by water and frost on a lattice
   * `cell` metres fine, from the stream `seed` (see `terrain.ts`). Recorded so that whoever builds the place makes the same land.
   */
  terrain?: {
    seed: number; cell: number;
    /**
     * If present, the top stands on a summit of that world (`world.ts`): the middle of `level` lies over the world's point `u`, `v`,
     * the site turned by `turn` so that the ridge it comes up runs south, and the world's land there is `base` high. The country
     * round about is then the world's own, at its own height, unworn here (it is worn already), with no `range` drawn; the drawn top
     * stands on it, its summit where the world's is.
     */
    world?: string; u?: number; v?: number; turn?: number; base?: number;
  };
  /** The level of the top of the sea of cloud, and how high its billows rise above it and sink below it. */
  deck: number;
  billow: number;
  /** How broken the sea of cloud is, from 0 for unbroken to 1 for as much gap as cloud: through its breaks, far from the mountain, the valleys under it are seen. */
  breaks?: number;
  /**
   * The ridge the way comes up: its crest runs from `from`, on the rim, out to `to`, `width`
   * across its top, falling from `y0` there to `y1` at its far end, which is in or near the cloud.
   * It does not run straight: `crest` is its line as points `[x, z, y]` from `from` to `to`, swinging one way and then the other,
   * `y` the height of the crest at each, which falls unevenly, over knolls and through saddles. It is narrow, a crest with a drop on either hand; at `swell` of the way along it (0 to 1) it broadens into a shoulder, where the shelter stands.
   */
  spur: { from: [number, number]; to: [number, number]; width: number; y0: number; y1: number; swell?: number; crest?: [number, number, number][]; notch?: { at: number; wide: number; deep: number } };
  /** Summits, the highest first: rising `height` metres over the forecourt's floor about `x`, `z`, falling away over `r`, steep and broken. */
  peaks: { x: number; z: number; r: number; height: number }[];
  /** The ground about the house, kept level at the forecourt's floor. */
  level: { x0: number; x1: number; z0: number; z1: number };
  /** The way from the door down the ridge to where the player arrives, as points `[x, z, y]`: the ground is cut and made up to it. */
  way?: [number, number, number][];
  /** The path up to the summit from beside the house, as points `[x, z, y]`, cut into the rock where it must be. */
  climb?: [number, number, number][];
  /** How far up the climb, in metres along it from where it leaves the level ground, its last stretch becomes a stair cut in the rock, if it does. */
  climbStair?: number;
  /**
   * A bridge of timber over the cleft in the ridge (`spur.notch`: a gap cut clean across the crest `at` metres along it, `wide` at
   * its lips and `deep`): its deck runs from `a` to `b`, points `[x, z, y]` on the rock at either lip, `width` across, and the way goes over it.
   */
  bridge?: { a: [number, number, number]; b: [number, number, number]; width: number };
  /** A gateway of stone where the way comes off the ridge onto the top: two piers and an arch over the way, a cross on it, seen on the skyline from all down the ridge. The way goes through it towards `heading` (radians). */
  gate?: { x: number; z: number; y: number; heading: number };
  /** The hospice's kitchen chimney: a stack of stone built against the outside of the house's wall at `x`, `z`, on the side `out` (the unit step away from the wall), rising over the roofline. Smoke comes from it. */
  hearth?: { x: number; z: number; out: [number, number] };
  /**
   * The wall of the hospice's yard: a low wall along the south edge of the level ground, where the way comes in, from `x0` to `x1` at `z`,
   * with a gap for the way at `gap`; and a tall cross of stone on steps at its end, at `cross`.
   */
  yard?: { x0: number; x1: number; z: number; gap: number; cross: [number, number] };
  /** A bell tower standing by itself beside the hospice's forecourt, on the level ground: square, `height` to the eaves of its roof, the bell hung in its open top stage. Rung in cloud, to bring travellers in. */
  belfry?: { x: number; z: number; y: number; height: number };
  /** A shelter of dry stone beside the way on the ridge, a little above the cloud, its door towards `facing` (radians), on ground levelled at `y`. */
  shelter?: { x: number; z: number; y: number; facing: number };
  /**
   * Stopping places on the climb, at the outer side of its bends: ground widened and levelled at
   * `y`, `r` across the half of it, where the view opens; `out` is the bearing (radians) out of the
   * bend. Beside each, on the inner side, a crag stands up from the ridge, `height` over the
   * landing, `cr` across the half of it, at `cx`, `cz`. `what` is what is there besides: a
   * stone seat, a cairn, a wayside cross, or nothing but the view.
   */
  landings?: { x: number; z: number; y: number; r: number; out: number; cx: number; cz: number; cr: number; height: number; what: 'seat' | 'cairn' | 'cross' | 'view' }[];
  /**
   * Another way up, if there is one: the gallery way, along the mountainside. It leaves the way on
   * the ridge near its head, goes round the mountain below the rim on a ledge cut in the face,
   * rising, through tunnels where a buttress stands in its way, and comes up through the rock onto
   * the climb, which it joins at the point of the climb numbered `joins`. `line` is its points
   * `[x, z, y]`, a couple of metres apart. `under` says which stretches of it are tunnels, as pairs
   * of the first and last point of each; everywhere else it is open to the sky, a ledge or a
   * cutting. `windows` are openings cut from a tunnel out through the face, for light and the
   * view: where on the tunnel's line, how high, the bearing out (radians), and how far out the face is.
   */
  gallery?: { line: [number, number, number][]; under: [number, number][]; windows: { x: number; z: number; y: number; out: number; reach: number }[]; joins: number };
  /**
   * A third way up, the scramble: it leaves the climb at the point of it numbered `branch`, goes round the summit's flank, and
   * comes up the summit's far ridge straight to the top, from its point numbered `steep` on as a stair cut in the rock with an iron
   * chain to hold. `line` is its points `[x, z, y]`, a couple of metres apart; it ends on the summit's platform.
   */
  scramble?: { line: [number, number, number][]; branch: number; steep: number };
  /**
   * A great hall cut in the rock under the top, on some mountains: its far end `out` stands a few metres in from the rim, and tall
   * windows are cut from it through the face, looking out over the cloud; it runs in from there `long` metres along its middle line
   * to its near end `in`, `wide` across, its floor at `floor`, its vault's crown `high` over the floor, with two rows of great pillars
   * of the rock left standing. It is come down to by a stair cut in the rock, `stair`, as points `[x, z, y]`: from a cutting in the
   * ground of the top, which deepens into a tunnel, down with one turn to the hall's near end.
   */
  hall?: {
    out: [number, number]; in: [number, number]; floor: number; wide: number; high: number; long: number; stair: [number, number, number][];
    /** The windows in its far end, each as how far across the hall from its middle line it is (`v`, metres). */
    windows: number[];
    /** A chasm across the hall, `at` metres in from the window end, `width` across and `depth` deep, with a bridge over its middle. */
    chasm: { at: number; width: number; depth: number };
    /**
     * Side halls opening off it through arches: `at` metres in, on `side` (-1 to the left looking in, 1 to the right), `long` deep into
     * the rock and `wide` across, vaulted; one may have a shaft open to the sky over its middle (`shaft`, its radius).
     */
    sides: { at: number; side: -1 | 1; long: number; wide: number; shaft?: number }[];
    /** A gallery cut into one long wall (`side`) eleven metres up, opening on the hall through an arcade, and reached by a stair inside that wall from the hall's near end. */
    gallery: { side: -1 | 1 };
  };
  /** The cairn on the summit, with a cross of timber beside it, at the end of the climb. */
  cairn?: { x: number; z: number; y: number };
  /** Tors: knobs and low crags of bare rock standing out of the ground of the top, `height` high and `r` across the half. They are the land's own shape, and are carved as rock. */
  tors?: { x: number; z: number; r: number; height: number }[];
  /** Needles of rock standing out of the cloud close beside the mountain, off its precipices: where, how broad at the cloud's level, and how high their tops stand over the cloud. Seen and not reached. */
  needles?: { x: number; z: number; r: number; height: number }[];
  /**
   * Things standing in the country round about, to be seen from the top through the cloud's breaks and over it: a castle on a
   * spur, a lone tower, the ruin of an abbey, a monument, each on a crest near the cloud's level, at `x`, `z`, on ground at `y`.
   */
  sights?: { kind: 'castle' | 'tower' | 'ruin' | 'monument'; x: number; z: number; y: number }[];
  /** Other mountains, seen standing out of the cloud and not reached: where, how far they spread at the foot, how high their tops stand over the cloud. */
  range: { x: number; z: number; r: number; height: number }[];
}

export interface Site {
  seed: string;
  places: Place[];
  ways: Way[];
  items: Item[];
  levers: Lever[];
  /** A place hidden behind a secret door, with something in it worth finding; -1 if there is none. */
  secret: number;
  /**
   * The open country that can be walked, the approach included: the box that holds the valley,
   * from the house front at its north to the gap at its south. Absent in a site that has no more
   * than its approach.
   */
  grounds?: { x0: number; x1: number; z0: number; z1: number };
  /** The shape of that country, of which `grounds` is only the box that holds it. */
  valley?: Valley;
  /** If present, the site is not a valley at all but an island in the sea, and `valley` is absent. */
  island?: Island;
  /** If present, the site is neither a valley nor an island but the top of a mountain above a sea of cloud; `valley` is absent. */
  mountain?: Mountain;
  /** If present, the site is a harbour town on a coast between the sea and the mountains, and the house stands at the head of its square; `valley` is absent. */
  town?: Town;
  /**
   * How the house stands: built into the end of a ridge, its rooms under the hill with courts
   * open through it (`hill`, and so when absent); standing free in the valley, walled and
   * roofed, with the valley all round it (`free`); or no house at all but a delve (`delve`): the
   * same plan under the same ridge, but its rooms are caves and its courts caverns lit from
   * shafts, and only where something had to be built (the way in, the sanctum, a room with a
   * stair, a secret door, a door to hang) is there masonry. Its front is the rock of the ridge,
   * with a built portal in it for the door.
   */
  stands?: 'hill' | 'free' | 'delve';
  /**
   * The way from the door down the valley, as points from the door outwards. Flags as far as the
   * edge of the approach and a worn track after that. The player arrives at the last point.
   */
  track?: [number, number][];
  /** Things in the valley worth walking to. */
  features?: Feature[];
  /**
   * Footpaths: worn lines in the turf, narrower than the track, from it to something off it.
   * Each is its points in order from where it leaves the track, and what it leads to.
   */
  paths?: { points: [number, number][]; to: 'cave' | 'ruin' | 'stones' | 'pond' | 'tower' | 'keep' | 'mill' | 'shrine' | 'camp' | 'mine' | 'lighthouse' | 'castle' | 'chapel' | 'mansion' | 'summit' | 'gallery' | 'scramble' | 'lane' }[];
  /** A camp of charcoal burners in the valley's woods: see `Camp`. */
  camp?: Camp;
  /** Running water in the valley, if there is any. */
  streams?: Stream[];
  /** Ground in the valley that stands above its floor and can be climbed to. */
  terraces?: Terrace[];
  /** Caves in the valley's own walls, entered from its floor. */
  grottoes?: Grotto[];
  /** Buildings that stand by themselves in the valley. */
  towers?: Tower[];
  /** Buildings standing in the valley, apart from the house: see `Building`. */
  buildings?: Building[];
  /**
   * What kind of settlement the valley has, decided before anything else is put in it: a
   * village along the track with a keep above it, a hamlet of a few houses, a manor house of
   * the classical kind, or none. Or a `town`: a street of brick houses along the track, close
   * against one another, of the kinds in `BrickWork`, and where there is room a church of brick.
   */
  settlement?: 'village' | 'hamlet' | 'manor' | 'town';
  /**
   * A valley's stretches from its head down, each as the range of `z` it spans: the castle about the house at the head, the
   * village below it, then fields and a pasture, and the forest at the foot, where the player arrives.
   */
  zones?: { castle: [number, number]; village: [number, number]; fields: [number, number]; forest: [number, number] };
  /** The castle at a valley's head, about the house, which is its hall and keep, on its hill: see `Castle`. */
  castle?: Castle;
  /**
   * The village at a castle's foot, besides its houses (in `buildings`) and its lanes (in `paths`): its little square beside the road
   * below the gate, as its corners round, with the well in its middle; and the plots behind its houses, each its corners round, walled.
   */
  village?: { square?: [number, number][]; well?: [number, number]; plots: [number, number][][]; churchyard?: { ring: [number, number][]; gate: [number, number] } };
  /** The valley's fields, in their stretch on either side of the track: each its corners and its crop; a pasture among them for the sheep. */
  fields?: Town['fields'];
  /**
   * The keep over a village: a tower, or a tower within the curtain walls of a small castle, on
   * top of a promontory over the valley: the terrace in `terraces` marked `keep`, high and broad,
   * sheer to the valley, reached by its ledge. The tower is in `towers`, and can be gone into and
   * climbed. `x` and `z` are the middle of the castle, whose gate faces the end the ledge comes up at.
   */
  keep?: { x: number; z: number; kind: 'tower' | 'castle' };
  /**
   * Things standing on the hills beyond the valley, to be seen on the skyline: a castle, a lone
   * tower, the ruin of an abbey, or a monument. `angle` is the bearing from the middle of the
   * valley, in degrees from the direction of greater x towards greater z; `range` is `near`
   * for the wooded hills that ring the valley, `far` for the mountains behind them. Whoever
   * builds it puts it on the highest ground at that bearing in that range.
   */
  landmarks?: { kind: 'castle' | 'tower' | 'ruin' | 'monument'; angle: number; range: 'near' | 'far' }[];
  /**
   * A way through the hill: a tunnel from one of the house's cave chambers (`place`) straight
   * out through the ridge to a cave mouth in the ridge's side, in the arm of the valley on that
   * `side`, at `z`. It leaves the chamber through its wall on that side. It is not one of
   * `ways`: it joins a place to the open valley, and no door hangs in it.
   */
  backWay?: {
    place: number; side: 'w' | 'e'; z: number;
    /**
     * A way down from the tunnel: a branch that leaves it `from` metres short of the ridge's side
     * (measured from that side into the ridge), runs `leg` metres along the ridge (towards lesser z
     * if `toward` is -1), turns out under the arm, and comes down into a cavern whose middle is at
     * `x`, `z`, `rx` and `rz` across the halves of it, `height` high, its floor `drop` metres
     * below the tunnel's where the branch leaves it.
     *
     * `join`, if present, is a second way into the cavern: from the back of the cave in the wall
     * of the same arm (the first of `grottoes`), a passage that follows the foot of that wall
     * under the rock for `run` metres (towards lesser z if `toward` is -1), going down all the
     * way, and then turns in under the arm to the cavern's outer rim. So the cave in the arm, the
     * cavern and the house are one system. Its line is `joinLine` in `valley.ts`.
     */
    deep?: { from: number; leg: number; toward: -1 | 1; x: number; z: number; rx: number; rz: number; height: number; drop: number; join?: { toward: -1 | 1; run: number } };
  };
  /** If present, the house is a cathedral: see `Cathedral`. (In a harbour town, at the head of its square.) */
  cathedral?: Cathedral;
  /** Where the player starts. */
  start: number;
  /** Thickness of the walls between places. */
  wallThickness: number;
  /** Height of the roofline; courts are open wells down from it. */
  top: number;
  entrance: number;
  goal: number;
  setting: Setting;
  /** Unit vector towards the sun. */
  sun: [number, number, number];
  /** One sentence describing the place. */
  title: string;
}

/**
 * A cathedral: a great church with its towers, its crypt and dungeon under it and its cloister beside it, built of places as any house
 * is (its nave, aisles, crossing, transepts, choir and shrine are places of the ground storey; its towers' rooms are storeys over their
 * feet). What is here is what its outside is made of, and what was measured to make it as high as it is.
 */
export interface Cathedral {
  /** What each place of the church proper is: its outside is built from these. (The cloister's rooms and those under the church are ordinary rooms.) */
  parts: { place: number; part: CathedralPart }[];
  /**
   * Its towers that can be climbed, each from its foot (`foot`, the place on the ground storey), its rooms one over another, to its top
   * (`roof`, open to the sky, a walk behind a parapet round whatever crowns it). `spire` is what does: a spire of stone, crocketed;
   * of lead or of copper, on a timber frame; or nothing but the parapet and its pinnacles. Its point stands `spireHeight` over the
   * top's floor.
   */
  towers: { foot: number; roof: number; spire: SpireKind; spireHeight: number }[];
  /**
   * A tower over the crossing, which is not climbed: its parapet's top stands `top` metres over the crossing's floor, and its spire's
   * point `spireHeight` over that.
   */
  lantern?: { top: number; spire: SpireKind; spireHeight: number };
  /** Where there is no tower over the crossing: a slender spire of the roofs' metal standing on their ridge over it, so high over the ridge. */
  fleche?: number;
  /** What the roofs are covered with: lead, grey; copper gone green; or glazed tiles, dark. */
  roof: 'lead' | 'copper' | 'tile';
  /** How steep the roofs of the nave, the transepts and the choir are: their rise over half their breadth. */
  pitch: number;
  /** Arched struts over the aisles' roofs, from the buttresses along the aisles' walls to the clerestory, at each bay. */
  flyers: boolean;
  /** A round window in the gable of the west front and at the transepts' ends, over the doors, rather than a tall window of lights. */
  rose: boolean;
  /**
   * How it was made as high as it is: the height of the tallest buildings about the square (`near`, from their own ground to their
   * ridges), and the height of the nave's ridge over the church's floor (`ridge`), at least half as high again as those and at most
   * three times; unless the least that a nave with aisles and a clerestory over them can be (`least`) is more than that.
   */
  measure: { near: number; ridge: number; least: number };
}

export type CathedralPart = 'narthex' | 'tower' | 'chapel' | 'nave' | 'aisle' | 'crossing' | 'transept' | 'choir' | 'choir aisle' | 'shrine';
export type SpireKind = 'stone' | 'lead' | 'copper' | 'none';

export type Stone = 'limestone' | 'sandstone' | 'greystone' | 'basalt';
export type Hour = 'morning' | 'midday' | 'evening' | 'sunset' | 'dusk' | 'night';

/** Where and when: what the place is built of, what it is called, and the time of day. */
export interface Setting {
  stone: Stone;
  hour: Hour;
  /** What kind of house it is, for its name. */
  kind: string;
  /** How it has fared: looked after, left to the wet, or abandoned long enough for a roof to fall. */
  condition: 'kept' | 'damp' | 'forsaken';
  /** The time of year, which colours everything that grows. */
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
  /** How much of the sky is cloud, from 0 for clear to 1 for overcast. Clouds drift, and shade what is under them. */
  cloud?: number;
  /** Whether that cloud is heaped up or lies in flat banks. */
  cloudForm?: 'heaped' | 'layered';
  /** How much mist lies in the low ground, from 0 for none to 1 for a morning you cannot see across. */
  mist?: number;
  /** How thick the air is with distance, from 0 for the clearest day to 1 for hills that are barely there. */
  haze?: number;
}

/**
 * The light at each time of day, in the renderer's light units.
 *  - `sun` is where the strongest light comes from, and `colour` and `intensity` what it is: the
 *    sun by day, the glow where it went down at dusk, the moon at night.
 *  - `disc` is where the sun itself stands, for drawing the sky; below the horizon after sunset.
 *    Left out, it is where the light comes from.
 *  - `zenith`, `horizon` and `ground` are how bright the sky is overhead and at its edge, and the
 *    light thrown up by the land.
 *  - `night` is how far the stars are out, 0 to 1, and `eyes` how far eyes open in the dark: the
 *    most that exposure may rise to.
 */
export interface Sky {
  sun: [number, number, number];
  colour: [number, number, number];
  intensity: number;
  zenith: number[];
  horizon: number[];
  ground: number[];
  disc?: [number, number, number];
  night?: number;
  eyes?: number;
}

export const SKIES: Record<Hour, Sky> = {
  morning: { sun: [0.5, 0.62, 0.6], colour: [1.0, 0.88, 0.72], intensity: 11, zenith: [0.16, 0.3, 0.62], horizon: [0.66, 0.72, 0.8], ground: [0.09, 0.08, 0.07] },
  midday: { sun: [-0.12, 0.9, 0.42], colour: [1.0, 0.96, 0.9], intensity: 12.5, zenith: [0.14, 0.28, 0.66], horizon: [0.6, 0.72, 0.88], ground: [0.1, 0.09, 0.08] },
  evening: { sun: [-0.62, 0.5, 0.6], colour: [1.0, 0.7, 0.46], intensity: 9.5, zenith: [0.14, 0.22, 0.5], horizon: [0.8, 0.62, 0.48], ground: [0.08, 0.07, 0.06] },
  // The sun a hand's breadth above the hills: long shadows, red light, a sky going from gold to deep blue.
  sunset: { sun: [-0.8, 0.17, 0.57], colour: [1.0, 0.46, 0.2], intensity: 7.5, zenith: [0.07, 0.1, 0.26], horizon: [0.9, 0.46, 0.24], ground: [0.06, 0.045, 0.035], eyes: 2 },
  // The sun gone: no shadows to speak of, a band of rose where it went down, and the first stars.
  dusk: { sun: [-0.78, 0.26, 0.57], colour: [0.9, 0.55, 0.5], intensity: 0.9, zenith: [0.022, 0.032, 0.085], horizon: [0.2, 0.13, 0.15], ground: [0.02, 0.018, 0.02], disc: [-0.8, -0.07, 0.59], night: 0.35, eyes: 3.2 },
  // Moonlight: cold, faint, with shadows; every lit window and torch counts for much more.
  night: { sun: [0.42, 0.72, 0.55], colour: [0.62, 0.74, 1.0], intensity: 0.5, zenith: [0.006, 0.009, 0.024], horizon: [0.014, 0.018, 0.034], ground: [0.006, 0.006, 0.008], disc: [-0.5, -0.6, 0.62], night: 1, eyes: 4.5 },
};

/** How each time of day is put in a sentence. */
export const WHEN: Record<Hour, string> = { morning: 'in the morning', midday: 'at midday', evening: 'at evening', sunset: 'at sunset', dusk: 'at dusk', night: 'by night' };

export const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };

/** Ways that can be walked through, as an adjacency list. */
export function neighbours(site: Site): Map<number, number[]> {
  const adj = new Map<number, number[]>();
  for (const p of site.places) adj.set(p.id, []);
  for (const w of site.ways) {
    if (w.kind === 'window') continue;
    adj.get(w.a)!.push(w.b);
    adj.get(w.b)!.push(w.a);
  }
  return adj;
}

/**
 * Where a stair is stood at to go up it, and where one stands having come up: a stride before
 * its foot on the lower floor, and a stride beyond its head on the upper, each in the middle of
 * the flight's breadth. Walking from one to the other in a straight line is walking the stair.
 */
export function stairEnds(site: Site, w: Way): { foot: [number, number]; head: [number, number] } {
  const p = site.places[w.a], off = w.halfWidth;
  const at = (side: Side, u: number): [number, number] => (side === 'n' ? [u, p.z0 + off] : side === 's' ? [u, p.z1 - off] : side === 'w' ? [p.x0 + off, u] : [p.x1 - off, u]);
  if (w.round) {
    // (Its foot on the wall it starts on; its head on the wall its last leg runs along, which goes the way of the sun round the room.)
    const { legs } = roundStair(site, w), first = legs[0], last = legs[legs.length - 1];
    const dir = (side: Side) => (side === 'n' || side === 'e' ? 1 : -1);
    return { foot: at(first.side, first.from - dir(first.side) * 0.6), head: at(last.side, last.to + dir(last.side) * 0.6) };
  }
  const to = w.to ?? w.at, dir = to >= w.at ? 1 : -1;
  return { foot: at(w.side, w.at - dir * 0.6), head: at(w.side, to + dir * 0.6) };
}

/** Number of independent loops in the walkable graph: edges minus places plus one, for a connected site. */
export function loopCount(site: Site): number {
  const edges = site.ways.filter((w) => w.kind !== 'window');
  const pairs = new Set(edges.map((w) => `${Math.min(w.a, w.b)}-${Math.max(w.a, w.b)}`));
  return pairs.size - site.places.length + 1;
}

/** Whether every place can be reached on foot from the entrance. */
export function allReachable(site: Site): boolean {
  const adj = neighbours(site);
  const seen = new Set<number>([site.entrance]);
  const queue = [site.entrance];
  while (queue.length) {
    for (const n of adj.get(queue.pop()!)!) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size === site.places.length;
}

/** How high a place's vault (or ceiling) rises over the top of its walls: half its span for a half-round vault, more for a pointed one. */
export function vaultRise(p: Place): number {
  if (p.roof !== 'barrel') return 0;
  const half = (p.axis === 'x' ? p.z1 - p.z0 : p.x1 - p.x0) / 2 / (p.spans ?? 1);
  return p.pointed ? half * POINTED_RISE : half;
}
/**
 * A pointed vault or arch is two arcs of a circle whose radius is so many times half its span (a vault), or its whole span (an arch);
 * its crown stands `POINTED_RISE` times half its span over its springing.
 */
export const POINTED_VAULT = 1.5;
export const POINTED_RISE = Math.sqrt(POINTED_VAULT * POINTED_VAULT - (POINTED_VAULT - 1) * (POINTED_VAULT - 1));

/** The height of a step, and the depth of a tread on a stair that climbs round walls. */
export const STEP_RISE = 0.17;
export const ROUND_TREAD = 0.25;

/** A leg of a stair that climbs round walls: along the wall on `side`, from `from` to `to` along it, from `y0` over the lower floor, `steps` steps. */
export interface StairLeg { side: Side; from: number; to: number; y0: number; steps: number }
/** The next wall round, the way of the sun seen from above. */
export const SUNWISE: Record<Side, Side> = { n: 'e', e: 's', s: 'w', w: 'n' };
/**
 * The legs and the landings of a stair that climbs round the walls of its lower place (`round`): each leg a straight flight against
 * a wall; between each and the next a square landing in the corner, as broad as the flight. Measures are over the lower floor.
 */
export function roundStair(site: Site, w: Way): { legs: StairLeg[]; landings: { x0: number; x1: number; z0: number; z1: number; y: number }[]; width: number } {
  const p = site.places[w.a], q = site.places[w.b];
  return roundLegs(p, Math.max(1, Math.round((q.floor - p.floor) / STEP_RISE)), w.side, w.at, w.halfWidth * 2);
}

/** The same, for a stair of `steps` steps `W` broad starting at `at` along `side` in place `p`, before there is a way for it. */
export function roundLegs(p: { x0: number; x1: number; z0: number; z1: number }, steps: number, side: Side, at: number, W: number): { legs: StairLeg[]; landings: { x0: number; x1: number; z0: number; z1: number; y: number }[]; width: number } {
  let left = steps;
  const legs: StairLeg[] = [], landings: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  let from = at, y = 0;
  for (let guard = 0; guard < 64 && left > 0; guard++) {
    const dir = side === 'n' || side === 'e' ? 1 : -1;
    // (The leg runs to the landing in the corner ahead: a flight's breadth short of the wall it meets.)
    const end = side === 'n' ? p.x1 - W : side === 'e' ? p.z1 - W : side === 's' ? p.x0 + W : p.z0 + W;
    const room = Math.max(0, (end - from) * dir), n = Math.min(left, Math.floor(room / ROUND_TREAD + 1e-6));
    const to = from + dir * n * ROUND_TREAD;
    if (n > 0) legs.push({ side, from, to, y0: y, steps: n });
    left -= n;
    y += n * STEP_RISE;
    if (left <= 0) break;
    // The landing in the corner, and on round onto the next wall.
    const x0 = side === 'n' || side === 'e' ? p.x1 - W : p.x0, z0 = side === 'e' || side === 's' ? p.z1 - W : p.z0;
    landings.push({ x0, x1: x0 + W, z0, z1: z0 + W, y });
    side = SUNWISE[side];
    from = side === 'n' ? p.x0 + W : side === 'e' ? p.z0 + W : side === 's' ? p.x1 - W : p.z1 - W;
  }
  return { legs, landings, width: W };
}

/**
 * The points to walk a stair through, from a stride before its foot to a stride beyond its head: two for a straight stair, and for
 * one that climbs round walls, the middle of each landing between.
 */
export function stairPath(site: Site, w: Way): [number, number][] {
  const { foot, head } = stairEnds(site, w);
  if (!w.round) return [foot, head];
  const { landings } = roundStair(site, w);
  return [foot, ...landings.map((l): [number, number] => [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2]), head];
}
