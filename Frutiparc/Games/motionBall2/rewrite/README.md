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
npm test           # tests of the level data and the physics (Node 20+)
npm run levels     # regenerates src/data/levels.generated.js from ../dungeon/*.txt
```

`motionball` is exposed in the browser console: `motionball.play("adventure", 4)`
starts a game, `motionball.scenes.current.game` is the game being played.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code is organised.

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
