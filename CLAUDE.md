# Grand Horse Mountain

A browser game: a horse and its rider, or a skier, down a winter mountain, watched or ridden. TypeScript, Vite, three.js (its WebGPU
renderer, which falls back to WebGL 2 by itself; materials in three's shading language, `three/tsl`). No server. See `README.md`.

- `index.html` is the game built (`npm run build`), served by GitHub Pages from the top of `main`: rebuild it and commit it in the
  same commit as any change to `game.html`, `game/` or `src/`. `npm run typecheck` and `npm run build` must pass before a commit.
- `npm run dev` serves `game.html` for working on it. `__slope` (in the page's console) drives it for scripts: `demo()`, `setLand`,
  `setSkier`, `setMode`, `steer`, `step`, `wild`, `trick`, `bench`, `lookSide`, `slain`, `trigger` and `swingAt` (the weapons), `showcase` and `show` (the opening's demo), `offPiste` (off the marked piste), `stones` (where the snow gives way to stone), `treeAhead` (the nearest tree ahead), `flights` (the
  kickers' sizes), `cave`, `goCave` and `faceTo` (the cave halfway down the run: `goCave('ride' | 'camp' | 'gate' | 'tomb' | 'room' | 'stair', n)`; `?tags=` and `?dungeon=` choose the dungeon) and more (see the end of `game/slope.ts`). `step` moves the ride only: the weapons and the orcs go on with the frames.
- After any change to the ride, the kickers, the tricks or the poses, check that the demo run still lands every trick for every skier
  on both slopes: `__slope.demo()` says what it landed and how each kicker went (`landed`, `tries`, `fell`).
- This game was split from klaine/dungeons (`lab/slope.html` there, `lab/` here as `game/`); the files are kept the same as there,
  so that a change made in either can be carried to the other; the world the runs are found in, and the finding (`src/core/`), too, and the world's ink map
  (`src/maps/inkWorld.ts`). `src/render/scene.ts`, `src/core/runMap.ts`, `game/slopeMap.ts`, `game/slopeArms.ts`, `game/slopeMini.ts`, `game/slopePlane.ts`, `game/slopeIce.ts`, `game/slopeDungeon.ts`, `game/slopeFoot.ts`, `game/slopeProps.ts` and `tools/skiRun.ts` are this repository's own.
- `npm run skirun -- w2 [n ...]` finds the runs down the world, lists them, and writes the slices of the `n`th into `slopes/` (a run
  named in `RAISED` in `tools/skiRun.ts` carried further up than the search began it, as Lake Wall is);
  `--map 1,3,8,10,2,14,17,25` writes the map of the runs the game offers (`slopes/w2-map.json`): remake it when a run is added.
- Comments say why, in plain prose; random choices go through `Rng.fork(label)`.
