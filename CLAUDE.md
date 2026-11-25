# Grand Horse Mountain

A browser game: a horse and its rider, or a skier, down a winter mountain, watched or ridden. TypeScript, Vite, three.js (its WebGPU
renderer, which falls back to WebGL 2 by itself; materials in three's shading language, `three/tsl`). No server. See `README.md`.

- `index.html` is the game built (`npm run build`), served by GitHub Pages from the top of `main`: rebuild it and commit it in the
  same commit as any change to `game.html`, `game/` or `src/`. `npm run typecheck` and `npm run build` must pass before a commit.
- `npm run dev` serves `game.html` for working on it. `__slope` (in the page's console) drives it for scripts: `demo()`, `setLand`,
  `setSkier`, `setMode`, `steer`, `step`, `wild`, `meter` (how full the trick meter is, with orcs and weapons; `wild(1)` fills it), `trick`, `bench`, `lookSide`, `slain`, `trigger` and `swingAt` (the weapons), `aiming`, `target`, `cycle`, `rolls` and `aimNow` (the foe locked on, the dice, and how the arms are coming onto it), `showcase` and `show` (the opening's demo), `offPiste` (off the marked piste), `foes` (only one kind of foe coming: `foes('yeti', [14, 20])`, and from how near), `orcs` (what is coming), `arena` (the pipe laid where yetis come, riding), `launch` (a beaten yeti being sent off; `launch('saucer')`, the next one's piece), `lookAt` (the view from a point at a point), `stones` (where the snow gives way to stone), `treeAhead` (the nearest tree ahead), `flights` (the
  kickers' sizes), `cave`, `goCave`, `faceTo`, `kickers` and `demoAt` (the cave halfway down the run: `goCave('ride' | 'camp' | 'gate' | 'tomb' | 'room' | 'stair' | 'chest' | 'tunnel', n)`; `?tags=` and `?dungeon=` choose the dungeon), `deeps`, `goDeeps`, `walkTo` and `deepAt` (the deeps between the two caves of a run that parts: `deeps('seed', doors)` lays them anew from another seed, with made-up doors past the dungeons' own if asked; `goDeeps(s)`, on foot `s` metres along them), `loot`, `pack`, `wear`, `emptyPack` and `learned` (what is found: `loot('boss' | 'chest')`, or `loot('boots', 'ancient')` for a slot), `giveMap`, `trail` and `goTrail` (a forgotten slope: `giveMap(run?)` puts a map in the pack, the run ridden laid again with it as it begins again; `goTrail(along)`, on its way so far along it) `loadTimes` and `landTimes` (how long each stage of opening, and each part of laying the run, took), and more (see the end of `game/slope.ts`). `step` moves the ride only: the weapons and the orcs go on with the frames.
- After any change to the ride, the kickers, the tricks or the poses, check that the demo run still lands every trick for every skier
  on both slopes: `__slope.demo()` says what it landed and how each kicker went (`landed`, `tries`, `fell`).
- This game was split from klaine/dungeons (`lab/slope.html` there, `lab/` here as `game/`); the files are kept the same as there,
  so that a change made in either can be carried to the other; the world the runs are found in, and the finding (`src/core/`), too, and the world's ink map
  (`src/maps/inkWorld.ts`). `src/render/scene.ts`, `src/core/runMap.ts`, `game/slopeMap.ts`, `game/slopeArms.ts`, `game/slopeMini.ts`, `game/slopePlane.ts`, `game/slopeIce.ts`, `game/slopeDungeon.ts`, `game/slopeFoot.ts`, `game/slopeProps.ts`, `game/slopeFoes.ts`, `game/slopeArena.ts`, `game/slopeLoot.ts`, `game/slopeDice.ts`, `game/slopeSign.ts`, `game/slopeDeeps.ts`, `game/slopeTrail.ts`, `tools/skiRun.ts` and `tools/trimClips.mjs` are this repository's own (and `game/slopeOrcs.ts`
  has gone its own way since, made a horde of every kind of foe in `slopeFoes.ts`).
- `npm run skirun -- w2 [n ...]` finds the runs down the world, lists them, and writes the slices of the `n`th into `slopes/` (a run
  named in `RAISED` in `tools/skiRun.ts` carried further up than the search began it, as Lake Wall is; one in `LAID` laid, or the rest of it,
  through points given there to another run's foot, as Lake Wall's foot, the eighth run, Ashbridge Bend, and the ninth, Lake Wall East, are;
  a number past the search's own, as Lake Wall East's 40, is a run of its own; one in `TERRACED` has its snow cut and filled into a bench where it is out on its own, as Lake Wall East's is across the far side of its spur; two named together in `FORKS` part from one another,
  each written with the land of both and the other's line as a branch, `branches` in its slice, which the game rides as `Land.ways`:
  `__slope.ways()` and `onWay(w, down)`);
  `--map 1,3,8,10,2,14,17,25,40` writes the map of the runs the game offers (`slopes/w2-map.json`): remake it when a run is added.
- Comments say why, in plain prose; random choices go through `Rng.fork(label)`.
