# MotionBall 2 — HTML5 rewrite

A rewrite of **MotionBall 2** (Motion Twin, Frutiparc, 2005) for modern browsers.

`../html5/` holds a faithful, line-by-line port of the Flash game, which emulates the
Flash runtime (movie clips, timelines, depths). This folder is different: a new
codebase with the same rules, levels and graphics, organised as a modern game:

- the original art and animations: every symbol of `mb2.fla`, converted from
  its XFL export (`npm run xfl`, see [docs/XFL_INTEGRATION.md](docs/XFL_INTEGRATION.md))
  and played by a small timeline player;

- ES modules, bundled into a single file (`dist/motionball2.js`) by esbuild;
- a fixed-step simulation (120 steps per second) independent of the screen rate;
- geometric collisions (circles, boxes and rounded corners) instead of the
  4 x 4 pixel collision grid of the original;
- entities that update and draw themselves, bosses written as state machines;
- keyboard, gamepad and touch (virtual joystick) controls;
- sound with separate music and effect volumes.

## Play

Open `index.html` in a browser: it loads the prebuilt `dist/motionball2.js`, so no
build is needed (it also works from the disk, with the sounds played by `<audio>`
elements).

Controls: arrows / WASD / ZQSD (or a gamepad stick, or drag a finger on the screen)
to roll the ball, Space to change ball, Escape or P for the pause and the map.

## Develop

```sh
npm install        # esbuild
npm run serve      # http://localhost:8000, rebuilds on reload
npm run build      # writes dist/motionball2.js (commit it : index.html uses it)
npm test           # the tests (Node 20+, about 10 s), see below
npm run test:browser   # loads the built game in Chromium (needs Playwright)
npm run levels     # regenerates src/data/levels.generated.js from ../dungeon/*.txt
```

`motionball` is exposed in the browser console: `motionball.play("adventure", 4)`
starts a game, `motionball.scenes.current.game` is the game being played.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised.

## Tests

`npm test` runs the game in Node, without a browser (the canvas, sound and input
are replaced by fakes, see `tests/helpers.js`, and the random numbers are seeded) :

| file | covers |
| --- | --- |
| `tests/game.test.js` | the ball, every kind of item, doors and keys, room changes, holes, deaths, time, the rules of each mode, long random games |
| `tests/bosses.test.js` | the three bosses : how each one is hurt, its attacks, its death ; the four powers |
| `tests/scenes.test.js` | menus, pause, end of game ; every screen, room and boss fight is also drawn on a fake canvas |
| `tests/progress.test.js` | unlocks, records, saving |
| `tests/engine.test.js` | input, audio mixing, main loop, transitions, math |
| `tests/xfl.test.js` | the XFL converter (edges, colours, scripts, bitmaps), the converted symbols, the timeline player |
| `tests/physics.test.js` | the collision shapes and the bounce |
| `tests/data.test.js` | the hand-made dungeons and the random generator |

`npm run test:browser` (`tests/browser/smoke.js`) opens the built game in
Chromium, goes through the title and the menu, starts every mode and every
boss, and fails on any error or missing file. It needs Playwright
(`npm install --no-save playwright && npx playwright install chromium`, or
`CHROMIUM_PATH` pointing to a Chromium), and skips itself otherwise.

## Differences with the original

The rules, levels, tuning, art and animations are the original ones. What
differs:

- Collisions are geometric: the ball bounces on the real shapes of the bumpers
  and slides along the walls instead of sampling 16 points on a 4 x 4 grid.
- A fixed 120 steps per second simulation; the original's per-frame tuning
  (40 frames per second) is converted to pixels per second.
- Keyboard, gamepad and touch controls: the menu's ring of balls can be walked
  with the arrows, the pause has "Continuer" / "Abandonner" buttons, a finger
  drives the ball with a virtual joystick.
- The laser beams between the posts of the same colour are drawn (the
  original only showed the posts).
- The records of a course and of a dungeon are shown in the menu, and a line
  under the end panel says to click to go on.
- Losing the Frutiparc network: rankings, trophies ("TItems") and the
  "disc" and "white" variants are gone; the records are local
  (`localStorage`).
- The fonts of the original (Kiloton, Polo, Pleasantly Plump...) are not
  embedded in the XFL: the texts use a web font instead.
