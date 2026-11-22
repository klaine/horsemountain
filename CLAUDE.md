# Grand Horse Mountain

A browser game: a horse and its rider, or a skier, down a winter mountain, watched or ridden. TypeScript, Vite, three.js (its WebGPU
renderer, which falls back to WebGL 2 by itself; materials in three's shading language, `three/tsl`). No server. See `README.md`.

- `index.html` is the game built (`npm run build`), served by GitHub Pages from the top of `main`: rebuild it and commit it in the
  same commit as any change to `game.html`, `game/` or `src/`. `npm run typecheck` and `npm run build` must pass before a commit.
- `npm run dev` serves `game.html` for working on it. `__slope` (in the page's console) drives it for scripts: `demo()`, `setLand`,
  `setSkier`, `setMode`, `steer`, `step`, `wild`, `trick`, `bench`, `lookSide` and more (see the end of `game/slope.ts`).
- After any change to the ride, the kickers, the tricks or the poses, check that the demo run still lands every trick for every skier
  on both slopes: `__slope.demo()` says what it landed and how each kicker went (`landed`, `tries`, `fell`).
- This game was split from klaine/dungeons (`lab/slope.html` there, `lab/` here as `game/`); the files are kept the same as there,
  so that a change made in either can be carried to the other. `src/render/scene.ts` is the one file of this repository's own.
- Comments say why, in plain prose; random choices go through `Rng.fork(label)`.
