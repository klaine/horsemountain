# Grand Horse Mountain

A horse and its rider skiing down a mountain in winter: watched, or ridden. Play it at
**https://horsemountain.klaine.net** (GitHub Pages, from `main`).

It opens on its title over the demo run, and asks: *Watch demo run*, or *Send it myself!* Until then, while it loads, a screen says
how far it has got: a bar that fills as its files come in (all fetched at once, some 5.5 MB: the slice of the mountain, the figures'
clips, the rider's body), and as the run is made, stage by stage (painting the snow and rock, laying the snow, teaching the rider to
ski, dressing the rider and saddling the horse, flying the demo run, making the shaders), with what is being done and how much has
come under it.

- **The demo run** goes down the mountain from beside its highest summit, carving between seven kickers built on the snow and taking a
  trick off each (a 720, a backflip, a backflip 360, a ski jumper's flight, a cork 540 that lands it switch, a switch 540 that brings
  it round again, a superman whip), with turns on the snow to switch and back on the way to the foot; filmed by a cinematic camera
  that cuts from shot to shot, cameras set down by each kicker for its jump.
- **The orc hunt**, on a computer, once *Orcs & tommy gun* is on in the menu (*Orc hunt* there, or `O`): a second demo run, the horse
  and its rider, the wildest trick each kicker will give them (a cork 720, a backflip 720, a 900 and a switch 900, a superman whip
  backflip 360, a 1080...), and the rider shooting down the orcs coming up the run with a tommy gun as they go.
- **Riding it yourself**, seen from behind: on a touch screen, the stick at the lower left steers, to either side to turn (carved, or
  skidded out at its rim), up to tuck, down to stand straight. With a mouse or a touchpad, the pointer steers from wherever it is over
  the picture, no button held: to either side of the middle to turn (skidded out at the sides of the faint guide drawn about the skier),
  above it to tuck, below to stand straight; it takes the skier once it is brought within the guide, and lets it go, running straight,
  when it leaves the picture. Held down, its button brakes; a right click (a tap with two fingers) turns you round; scrolled or
  pinched, the view comes nearer or goes further off. The arrow keys too, and Shift to brake. You make no tricks: line up on a kicker
  and one is done for you, chosen at random among those that should come round in the time that jump will keep you in the air at your
  speed, milder or wilder as the *Mild*–*Wild* slider at the lower right says. Under it, *To switch* (or *To regular*, `X`) turns you
  round on the snow, each time the next of a pop 180, a nose butter, a smooth 180 and a tail butter. A fall, or the foot of the run,
  counts down five seconds to a new run (or Enter, or a click). On a computer, with *Orcs & tommy gun* on in the menu (off at first),
  the skier alone or the horse's rider carries a tommy gun in place of its poles, aimed at the guide's mark: held down, the button
  fires it (and Shift brakes), and orcs come up the run in hordes to be shot down, red blood on the snow, how many counted at the top
  left.

*Menu* (or `H`), at the top right, opens everything else: beside the picture on a computer or a phone held sideways, as a sheet from
the foot on a phone held upright, the picture sliding aside so that the skier stays in sight. In it, *Play* (watch the demo or ride;
watching, pause, its speed and its timeline, which names its parts and can be dragged along; riding, restart the run, which is held
while the menu is open), *Slope* (two runs down the mountain, *Silent Warden* from beside its highest summit along a crest, or *Pale
Crown*, longer, down a spur into the wooded foothills above a bay; or a groomed slope going on for ever), *Skier* (the horse with its
rider, the horse alone, or a person on skis, an adventurer with a sword on its back; the horse's skis, two long or four short),
*Camera* (*Cinema*, *Behind*, *Beside*, *Above*, or *Free*, turned by hand; `C`, `B`, `S`, `A`, `F`; watching begins in *Cinema* and
riding from behind, and each keeps the one it was last left in; and its distance) and *Picture* (the game's snow or plain, how finely
the picture is drawn, the blur). Escape or `H` closes it. `R` switches between watching and riding; `Space` pauses the demo.

In the address: `?nointro` (no title, no question), `?skier=person` or `?skier=horse`, `?skis=four`, `#w2-3` (the second run), `?land=groomed`, `?snow=plain`, `?orcs=1` (*Orcs & tommy gun* on), `?coat=plain` (the horse's coat as it is drawn on a phone; `?coat=hair`, as on a computer), `?trees=plain` (the snowy firs, as on a phone; `?trees=game`, the game's own trees, as on a computer),
`?view=behind` (or `beside`, `above`; watching), `?rideView=cinema` (or another; riding), `?menus=1` (the menu open), `?blur=0` to `2`, `?res=1` (or `0.75`, `0.5`; otherwise drawn finer or coarser as
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

- `game.html`, `game/slope.ts`: the page and its program (the loading screen, the opening, watching and riding, the demo run's pilot, the tricks given a
  rider, the views, the sky and the light, the picture's blur, grade and resolution); `game/slopeLand.ts`: the land it goes down, the slice of the mountain or the
  groomed slope, its snow, firs, piste poles and the country round about; `game/slopeTrees.ts`: on a computer, the woods of the land
  about the run as the game grows them (its walk over the world's `treesIn` and `growTrees`, in winter, and spruce where it would grow
  oaks and ashes), whole near the eye, more simply further off and painted beyond, grown in blocks about the eye as it goes;
  `game/slopeGun.ts`, the tommy gun, its tracers, flash and sound; `game/slopeOrcs.ts`, the orcs coming up the run;
  `game/slopeSplatter.ts`, their blood on the snow.
- `src/figures/`: the figures: the person (`alpine.ts`, posed by a handful of numbers, on the ground and in the air), the horse
  (`horse.ts`, made in code on a skeleton of its own; `horseBody.ts`, `horseSculpt.ts`, how it looks; `horseCoat.ts`, its coat as hair, on a computer), the adventurer's clothes and
  sword (`outfit.ts`), skis and poles (`gear.ts`), a body gone limp (`ragdoll.ts`), posing (`posing.ts`), and the figures' files
  (`library.ts`).
- `src/render/`: the game's materials for snow, rock and the far country (`siteMaterial.ts`), the textures they are painted from
  (`textures.ts`), meshes (`geom/meshBuilder.ts`); the game's trees, grown (`planting.ts`) and drawn as cards in levels
  (`vegetation.ts`); `scene.ts` holds only the two types those name.
- `src/core/`: the slice of the mountain as it is kept and read (`skiSlice.ts`), and the seeded random numbers (`rng.ts`).
- `figures/`: the figures, by Quaternius, CC0 (see `figures/LICENSE.txt`): `clips.glb` (the mannequin and the clips), and
  `superhero-male.glb` (the body the adventurer is dressed on).
- `slopes/w2.json`, `slopes/w2-3.json`: the slices of the mountain: two runs found in a generated world, the first and the third its
  search kept, and the land about each, a metre apart near the run (each fetched only when it is skied).

## Where it came from

Split from [klaine/dungeons](https://github.com/klaine/dungeons), where it is `lab/slope.html` and grew alongside the game: these
are the files that page needs, as they were at its commit `4137fd8`, with `lab/` as `game/`. The world the run is found in, and
`tools/skiRun.ts`, which finds it and writes its slice, stay there; the whole story of how it was built, asked for step by step, is in
that repository's `docs/03-plan.md` (items 64 to 83). The titles are set in Cinzel and Cormorant Garamond, from Google Fonts (SIL Open
Font License).
