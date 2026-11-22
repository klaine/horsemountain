// The game as one page, `index.html` at the top of the repository, which GitHub Pages serves from `main`: `game.html` built with its
// program and three.js as a single script written into it, finding its figures (`figures/`) and its slices of the world (`slopes/`)
// beside it, wherever the page is served from.
//
//   npm run build        (node tools/build.mjs [out.html], by default index.html)
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(root, 'index.html'));
const tmp = mkdtempSync(join(tmpdir(), 'horsemountain-'));
try {
  await build({
    root, configFile: false, base: './', logLevel: 'warn',
    build: {
      outDir: tmp, emptyOutDir: true, target: 'es2022', modulePreload: false, assetsInlineLimit: 1e9, cssCodeSplit: false,
      // (One input and its imports in one chunk, written into the page.)
      rollupOptions: { input: { game: join(root, 'game.html') }, output: { inlineDynamicImports: true } },
    },
  });
  let html = readFileSync(join(tmp, 'game.html'), 'utf8');
  html = html.replace(/<link rel="modulepreload"[^>]*>\s*/g, '');
  const scripts = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
  if (scripts.length !== 1) throw new Error(`expected one script in the built page, found ${scripts.length}`);
  let code = readFileSync(join(tmp, scripts[0][1]), 'utf8');
  // (Inside an inline script the page's parser stops at the first `</script`; written `<\/script` it means the same to the program.)
  code = code.replace(/<\/script/gi, '<\\/script');
  if (code.includes('<!--')) throw new Error('the program has "<!--" in it, which an inline script cannot carry safely');
  html = html.replace(scripts[0][0], '');
  // (Its figures and slices beside it: so it finds them wherever it is served from, at the top of a domain or in a folder of one.)
  const carried = `window.__figureBase = 'figures/'; window.__slopeBase = 'slopes/';`;
  html = html.replace('</body>', () => `<script>${carried}</script>\n<script type="module">${code}</script>\n</body>`);
  writeFileSync(out, html);
  console.log(`${out}: ${(html.length / 1e6).toFixed(2)} MB`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
