# Grand Horse Mountain

A horse and its rider skiing down a mountain in winter: watched, or ridden. Play it at
**https://horsemountain.klaine.net** (GitHub Pages, from `main`).

It opens on its title over the demo run, and asks: *Watch demo run*, or *Send it myself!*

- **The demo run** goes down the mountain from beside its highest summit, carving between seven kickers built on the snow and taking a
  trick off each (a 720, a backflip, a backflip 360, a ski jumper's flight, a cork 540 that lands it switch, a switch 540 that brings
  it round again, a superman whip), with turns on the snow to switch and back on the way to the foot; filmed by a cinematic camera
  that cuts from shot to shot, cameras set down by each kicker for its jump.
- **Riding it yourself**: the stick at the lower left steers, to either side to turn (carved, or skidded out at its rim), up to tuck,
  down to stand straight; the arrow keys too, and Shift to brake. You make no tricks: line up on a kicker and one is done for you,
  chosen at random among those that should come round in the time that jump will keep you in the air at your speed, milder or wilder as
  the *Mild*–*Wild* slider at the lower right says. Under it, *To switch* (or *To regular*, `X`) turns you round on the snow, each time
  the next of a pop 180, a nose butter, a smooth 180 and a tail butter. A fall, or the foot of the run, counts down five seconds to a
  new run (or Enter).

*Show menus* (or `H`), at the top right, shows the rest: who goes down (the horse with its rider, the horse alone, or a person on
skis, an adventurer with a sword on its back), the horse's skis (two long, or four short), the slope (the run down the mountain, or a
groomed slope going on for ever), the snow (the game's materials, or plain), the view (*Cinema*, behind, beside, above, or turned by
hand; `C`, `B`, `S`, `A`, `F`) and its distance, the blur, and how finely the picture is drawn. `R` switches between watching and
riding; `Space` pauses the demo; its timeline names its parts and can be dragged along.

In the address: `?nointro` (no title, no question), `?skier=person` or `?skier=horse`, `?skis=four`, `?land=groomed`, `?snow=plain`,
`?view=behind` (or `beside`, `above`), `?menus=1`, `?blur=0` to `2`, `?res=1` (or `0.75`, `0.5`; otherwise drawn finer or coarser as
frames come), `?webgl` (WebGL 2 rather than WebGPU).

## Working on it

```bash
npm install
```

```bash
npm run dev
```

serves `game.html`, the page the game is written in, with its figures and its slice of the mountain from `figures/` and `slopes/`.

```bash
npm run typecheck
```

```bash
npm run build
```

writes `index.html`: the game as one page, its program and three.js written into it, finding `figures/` and `slopes/` beside it.
GitHub Pages serves it from the top of `main` (with `.nojekyll`, and `CNAME` for the domain), so rebuild it and commit it with any
change to the game.

## What is here

- `game.html`, `game/slope.ts`: the page and its program (the opening, watching and riding, the demo run's pilot, the tricks given a
  rider, the views, the picture's blur and resolution); `game/slopeLand.ts`: the land it goes down, the slice of the mountain or the
  groomed slope, its snow, firs, piste poles and the country round about.
- `src/figures/`: the figures: the person (`alpine.ts`, posed by a handful of numbers, on the ground and in the air), the horse
  (`horse.ts`, made in code on a skeleton of its own; `horseBody.ts`, `horseSculpt.ts`, how it looks), the adventurer's clothes and
  sword (`outfit.ts`), skis and poles (`gear.ts`), a body gone limp (`ragdoll.ts`), posing (`posing.ts`), and the figures' files
  (`library.ts`).
- `src/render/`: the game's materials for snow, rock and the far country (`siteMaterial.ts`), the textures they are painted from
  (`textures.ts`), meshes (`geom/meshBuilder.ts`); `scene.ts` holds only the one type the materials name.
- `src/core/`: the slice of the mountain as it is kept and read (`skiSlice.ts`), and the seeded random numbers (`rng.ts`).
- `figures/`: the figures, by Quaternius, CC0 (see `figures/LICENSE.txt`): `clips.glb` (the mannequin and the clips), and
  `superhero-male.glb` (the body the adventurer is dressed on).
- `slopes/w2.json`: the slice of the mountain: a run found in a generated world and the land about it, a metre apart near the run.

## Where it came from

Split from [klaine/dungeons](https://github.com/klaine/dungeons), where it is `lab/slope.html` and grew alongside the game: these
are the files that page needs, as they were at its commit `4137fd8`, with `lab/` as `game/`. The world the run is found in, and
`tools/skiRun.ts`, which finds it and writes its slice, stay there; the whole story of how it was built, asked for step by step, is in
that repository's `docs/03-plan.md` (items 64 to 83). The titles are set in Cinzel and Cormorant Garamond, from Google Fonts (SIL Open
Font License).
