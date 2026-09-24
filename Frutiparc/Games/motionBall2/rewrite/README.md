# MotionBall 2 — HTML5 rewrite

A rewrite of **MotionBall 2** (Motion Twin, Frutiparc, 2005) for modern browsers.

`../html5/` holds a faithful, line-by-line port of the Flash game, which emulates the
Flash runtime (movie clips, timelines, depths). This folder is different: a new
codebase with the same rules, levels and graphics, organised as a modern game:

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
| `tests/physics.test.js` | the collision shapes and the bounce |
| `tests/data.test.js` | the hand-made dungeons and the random generator |

`npm run test:browser` (`tests/browser/smoke.js`) opens the built game in
Chromium, goes through the title and the menu, starts every mode and every
boss, and fails on any error or missing file. It needs Playwright
(`npm install --no-save playwright && npx playwright install chromium`, or
`CHROMIUM_PATH` pointing to a Chromium), and skips itself otherwise.

## Differences with the original

- Collisions are geometric: the ball bounces on the real shapes of the bumpers
  and slides along the walls instead of sampling 16 points on a grid.
- The ball's speed and bounces use the original tuning, converted from "pixels
  per frame at 40 frames per second" to pixels per second.
- The final boss is a state machine with the durations of its animations (the
  original was driven by its Flash timeline).
- Losing the Frutiparc network: rankings and trophies are replaced by local
  records (kept in `localStorage`).
- The redrawn art (bumpers, bosses, doors...) comes from the port; the bitmaps
  are the original ones (`assets/`).
