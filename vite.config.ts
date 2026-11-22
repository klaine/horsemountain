import { defineConfig } from 'vite';

// For working on the game: `npm run dev` serves `game.html`, the page it is written in, with its figures and its slices of the world
// from `figures/` and `slopes/` where they lie. (`index.html` is the game as built, `npm run build`, which GitHub Pages serves.)
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
