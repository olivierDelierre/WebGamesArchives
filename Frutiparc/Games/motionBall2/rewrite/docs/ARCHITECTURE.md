# MotionBall 2 rewrite — architecture

This document explains how the rewrite is organised, the few ideas that hold it
together, and where to look to change something. It assumes you know the game
(roll a ball through a dungeon of rooms, collect the red pastilles to open the
doors, find the coloured balls, beat the boss).

## Principles

- **Modules with one job.** Each file is an ES module with a short header
  comment saying what it is for. Nothing is global, except the few shared
  services in `app.js`.
- **The rules live in data.** Everything that differs between the game modes is
  a field of `game/modes.js`; the game code asks `game.rules.xxx` instead of
  testing the mode.
- **Entities draw and update themselves.** A bumper, a pastille, a door or a
  boss is an object with `update(dt, game)` and `render(ctx, game)`. The room
  just keeps a list of them.
- **Real units.** Distances are pixels of the 610 x 410 room, durations are
  seconds, speeds are pixels per second. Values that come from the original
  game (which counted in pixels per frame at 40 frames per second) are
  converted, and the comment gives the original value.
- **The original art, the rewrite's code.** Everything on screen is an
  original symbol of `mb2.fla` (converted from its XFL export, see
  [XFL_INTEGRATION.md](XFL_INTEGRATION.md)), played by a small timeline player
  (`gfx/xfl/clip.js`). The game code drives the symbols the way the original
  ActionScript did (`gotoAndPlay("hit")`, a needle's rotation, a text), but the
  rules are the rewrite's own code : the original ActionScript (`../mb2/`) is
  a reference, it is not run.

## Layout

```
index.html            the page (loads dist/motionball2.js)
package.json          esbuild ; scripts build / serve / test / levels
assets/xfl           the symbols of mb2.fla and title.fla (JSON) and their bitmaps (generated)
assets/snd           the original sounds
dist/                 the bundle built from src/ (committed : the game runs without a build)
tools/build_levels.js packs ../dungeon/*.txt into src/data/levels.generated.js
tools/xfl/           convert.js : ../xfl/ (XFL) -> assets/xfl ; gallery.js : xfl-gallery.html
tests/                Node tests (see "Tests" below) ; browser/smoke.js : Chromium smoke test

src/
  main.js             entry point : creates the services, loads, starts the loop
  app.js              the shared services (screen, input, audio, images, save, scenes)
  config.js           sizes, physics tuning, ball specs
  sounds.js           sound names -> files, music layers
  progress.js         saved settings, unlocks and records
  achievements.js     the achievements : the list, what unlocks them, the banner

  engine/             game-independent code
    loop.js           fixed-step main loop
    screen.js         canvas sizing, game coordinates
    input.js          keyboard / gamepad / touch -> actions and a direction
    audio.js          effects, cross-faded music, layered music (Web Audio or <audio>)
    assets.js         image loading (the bitmaps of the symbols)
    storage.js        localStorage with fallbacks
    scenes.js         current screen + fade transitions
    math.js           helpers (angles, frame-rate independent decay, random, easing)

  data/               the levels
    enums.js          the values stored in the level data (items, rooms, exits...)
    bitcodec.js       decoder of the Motion Twin bit strings
    dungeon.js        the dungeon model, and the hand-made dungeons reader
    levels.generated.js   the hand-made dungeons (generated, do not edit)
    generator/        random dungeons (Challenge, Classique), after mb2gen (OCaml)
      util.js         Retry, random helpers, the item shapes of mb2gen/bumpers.txt
      map.js          the 8 x 8 map : rooms, exits, balls, bonuses
      rooms.js        the content of a room
      index.js        generateChallenge(), ClassicDungeon

  game/               a game being played
    game.js           the session : rooms, time, lives, room changes, end
    modes.js          the rules of each mode
    room.js           builds a room from its data, holds its entities, draws it
    doors.js          the border and its four doors
    ball.js           the player's ball
    physics.js        collision shapes and the ball's bounces
    entity.js         Entity / Effect base classes, drawing layers
    inventory.js      balls, keys, map, radar
    hud.js            time, laps, balls left
    entities/         what a room contains
      bumpers.js      normal, clock, death, magnet, invisible bumpers
      blocks.js       green blocks, pink / blue blocks and their switch
      pickups.js      pastilles, balls, item boxes, hatch, teleports
      zappers.js      laser posts and beams (checkpoints in Course mode)
      effects.js      symbols that play once (sparks, debris, laser flash)

  bosses/
    index.js          which boss for which dungeon
    common.js         base class, red "hurt" colour, breaking floor
    octopus.js        Challenge boss
    snake.js          the 4 elemental snakes (adventures 1-4)
    powers.js         water, fire, earth, wind powers
    tourneboule.js    final boss (adventure 5)

  gfx/
    xfl/              the original symbols
      index.js        clip(name), drawClip, symbolCells (the original item sizes)
      library.js      the converted library : symbols, shapes, bitmaps
      clip.js         Clip : a playing symbol instance (timeline, scripts, nested clips)
      render.js       shapes, texts, masks, colour transforms, tweens
    draw.js           text and shape helpers (for what the symbols don't cover)
    ui.js             the pause buttons, the "pop" of the end panel

  scenes/
    title.js          the original intro (Intro.as), "press a key"
    menu.js           the ring of balls of the original menu (Menu.as)
    widgets.js        button navigation (mouse, touch, keyboard, gamepad)
    play.js           runs a Game ; pause and end-of-game panels
    achievements.js   the achievements screen
    map_view.js       the dungeon map of the pause ("carte", "room")
```

## The main loop

`engine/loop.js` runs the simulation in fixed steps of 1/120 s and draws once
per displayed frame:

```
every animation frame:
    input.poll()                         gamepad buttons -> actions
    while enough time has passed:        (at most 16 steps, the rest is dropped)
        step(1/120)                      audio fades, scenes.update(dt), input.endStep()
    scenes.render(ctx)
```

Fixed steps make the game behave the same on every screen, and keep the
collisions stable (the ball moves at most a few pixels per step).

Input actions ("confirm", "pause", "switchBall"...) are *edge triggered*: a
key press is queued, seen by the next step, then cleared by `endStep()`. The
direction of the ball (`input.axis()`) is read continuously; it combines the
keys, the gamepad stick and the virtual joystick of touch screens.

## Scenes

A scene is an object with `enter()`, `exit()`, `update(dt)` and `render(ctx)`.
`app.scenes.goto(scene)` fades to black, swaps, and fades back.

```
TitleScene -> MenuScene -> PlayScene -> (end panel) -> MenuScene
```

`PlayScene` owns a `Game` and two overlays: the pause (with the map when the
map or the radar was found) and the end-of-game panel, which also saves the
records (`progress.js`).

## A game

`Game` (`game/game.js`) holds:

| field | |
| --- | --- |
| `rules` | the mode's rules (`modes.js`) |
| `dungeon` | the level data, modified while playing (opened doors, destroyed blocks...) |
| `room` | the `Room` being played |
| `ball` | the player's `Ball` (it lives across rooms) |
| `boss` | the boss, once the ball is in the boss room |
| `time` | seconds left (or elapsed, in Course mode) |
| `inventory` | balls of each colour, keys, map, radar |
| `state` | `play`, `scroll` (changing room) or `over` |

Each step in `play`: time, ball switch, `room.update`, `ball.update`,
`boss.update`, then the boss room trigger and the exits.

**Changing room.** When the ball leaves the room (its centre crosses an edge)
and a room exists there, `goToRoom` builds the next room right away and the
game enters the `scroll` state: both rooms slide for 0.5 s, then the new room
becomes current and the ball's position is shifted by one room. The door the
ball comes in by is opened in the data first, so that it is open in the new
room.

**Losing a ball.** `ball.die()` (or falling in a hole) starts the ball's
shrinking animation; at its end `game.ballFell()` removes one ball of that
colour (unless the rules say otherwise), picks another colour if needed, or
ends the game. The ball comes back to where it entered the room.

**Classique.** Falling through the hatch calls `nextClassicLevel()`: the next
level is the next column of the dungeon, a random row, and the ball lands where
the hatch was (the scrolling goes down).

**Course.** Crossing a one-way door validates the lap; crossing a checkpoint
beam then counts it and resets the other rooms (doors closed, blocks and
pastilles back).

## Rooms

`Room` (`game/room.js`) turns a room of the data into entities:

- level items (`{ type, x, y }` in 4 x 4 pixel cells, top-left corner) become
  entities centred on their symbol, sized like the original did it
  (`symbolCells`, from the symbol's bounds) ;
- green blocks and holes also go into a 14 x 9 grid of 40 x 40 tiles
  (`room.tiles`): holes are only tiles, blocks use it to merge their shapes ;
- ball rooms, bonus rooms and the boss room have a fixed layout ;
- the zappers of the same colour are linked by beams.

Drawing, back to front: the `background` symbol, holes (the `ground` symbol
clipped to the hole tiles, with a back wall on their top edge), block shadows,
then the entities sorted by layer (`entity.js` `Layer`), their shadows first,
and finally the `border` and the `door` symbols on top.

## The original art

`gfx/xfl/` plays the symbols converted from the XFL export of `mb2.fla`
(`npm run xfl`, see [XFL_INTEGRATION.md](XFL_INTEGRATION.md)). An entity keeps
a `Clip` (`clip("bnormal")`), updates it (`art.update(dt)`, 40 frames per
second like the original) and draws it (`drawClip(ctx, art, x, y)`). The game
drives it like the original ActionScript : `gotoAndPlay("hit")`,
`art.set("aig", { rotation })`, `art.setText("tview_txt", "123")`,
`art.child("ball").gotoAndStop(type)` ; the frame scripts of the symbols run
(stops, loops, `removeMovieClip`), and their calls reach the game through
`art.on = event => ...` (the final boss follows its `kataDone` / `animDone`
like BossTB.as).

**Smooth on any screen.** The symbols' timelines, the intro and the menu keep
the original 40 frames per second (their scripts and tuning are per frame),
but they are *drawn* between their last two frames: `Clip.drawFrame()` gives a
fractional frame, so motion tweens are interpolated at the display rate (not
across a stop or a jump of the timeline), and the intro, the menu ring and the
earth power's vine keep their previous step's places to draw in between.
Only the frame-by-frame drawings of the original stay at 40 per second.

## Physics

The ball is a circle; everything solid has a shape (`game/physics.js`):
`circle` (bumpers, posts), `box` (blocks, border, door openings) or `arc` (the
rounded inside corners of the room).

`Ball.move` advances in sub-steps of at most 4 pixels. After each one,
`collideBall` pushes the ball out of every shape it overlaps and, if it was
moving toward it, reflects its velocity on the contact normal. The new speed is
`max(speed x coef, min)` — `BOUNCE` gives these per obstacle, from the original
game: bumpers throw the ball harder than it came. Then the obstacle's
`onHit(game, contact)` gives its effect (sound, spark, death, time...).

Things the ball only *touches* are tested by distance in their own `update`:
pastilles, balls, the hatch, teleports, laser beams.

**Holes** (`Ball.testHole`): on a hole tile the ball speeds up and is pulled
away from the edges that touch the floor; once it is far enough from those
edges it falls. The blue ball jumps instead.

**Ball specs** (`config.js` `BALLS`): acceleration, inertia (the speed is
multiplied by it every 1/40 s: `decay(inertia, dt)`), maximum speed. The metal
ball is slow and heavy, the orange one fast, etc.

## Doors

Each side of the border is made of two fixed boxes around the opening and a
`Door` (`game/doors.js`) filling it. A door is solid unless it is `open`,
`opening` or `hidden`. States: `wall` (no door), `hidden`, `closed` (opens when
the red pastilles are taken, or with a key), `locked` (a one-way door seen from
the wrong side), `opening`, `open`, `closing`. Opening a door writes `Exit.OPEN`
into the dungeon data, so it stays open.

## Bosses

A boss is an entity of the `BOSS` layer, created by `bosses/index.js` when the
ball is fully inside the boss room (the doors close). The game calls its
`update(dt, game)` and adds its colliders if it has some; it calls
`game.bossBeaten()` when its death animation is over. While a boss dies,
`game.invincible` prevents losing.

Each boss is a **state machine**: `this.state = { name, time, ...fields }`,
and one `update...` method per state. For example the octopus:

```
sleep -> jumps <-> (big jump | suck -> spit | shout | throw eye) -> ... -> dying
```

The elemental powers (`powers.js`) are entities added to the room; the boss
keeps a list of them to limit how many are active. Some effects tuned "per
frame" in the original (the earth vine, the water trail) run at 40 Hz through a
small `FrameClock`, whatever the simulation rate.

## Level data

- **Hand-made dungeons** (tutorial, 5 adventures, 7 courses) are the
  `../dungeon/*.txt` files of the original level editor, packed into
  `levels.generated.js` by `npm run levels`. Each line is a room: `NONE`,
  `DATA=<bits>` (an editor room), `START=<bits>`, `ITEM=<name>`, `END`.
  `data/dungeon.js` decodes them.
- **Random dungeons** (Challenge, Classique) are generated with the rules of
  the original OCaml tool. A failed generation step throws `Retry` and is done
  again (see `generator/util.js`). Two loops of the original could never end;
  they are bounded here (see the comments in `rooms.js` and `index.js`).

## Audio

`engine/audio.js` plays effects (`app.audio.play("red")`), a music with
cross-fades (`playMusic`), and the **layered** in-game music: 5 loops of the
same length play together and in sync, only one is audible; each new ball
colour found cross-fades to a richer one (`setLayer`). Music and effects have
separate volumes (the options). The names of the sounds are in `sounds.js`.

## Saving

`progress.js` keeps, in `localStorage` (key `motionball2.rewrite`): the settings,
the adventures won (the 5th opens after the 4 others), the unlocked courses
and their 3 best times (starting with 3 "CPU" times), the best Challenge score
and Classique level.

## Tests

The game logic doesn't need the browser : it only draws through the canvas
context it is given, and reaches the sound, the input and the images through
`app`. The tests (`npm test`) replace those with fakes (`tests/helpers.js`):

- `setup(seed)` installs a fake input (the test sets `app.input.dir` and
  triggers actions), a fake audio recording the sounds, no images, a fake
  `document` / canvas context, and seeds `Math.random` ;
- `newGame(mode)` starts a game, `run(game, seconds)` / `runUntil(game, cond)`
  advance it by simulation steps ;
- `testRoom(game, items, exits)` puts the ball in a room made for the test
  (items placed by their centre with `item()` / `tileItem()`).

The drawing code is run on the fake context too (`scenes.test.js`), so an error
in it fails the tests even though nothing is drawn. `tests/browser/smoke.js`
checks the real page in Chromium.

## Common tasks

| to... | look at |
| --- | --- |
| tune the ball | `config.js` (`BALLS`, `PHYSICS`) |
| change a mode's rules (time, lives...) | `game/modes.js` |
| change a bumper's bounce | `game/physics.js` `BOUNCE` |
| add an item type | `data/enums.js`, `Room.addItem` + `ITEM_SYMBOLS` in `game/room.js`, a class in `game/entities/` |
| change what a boss does | its state methods in `bosses/` |
| change a sound | `sounds.js` |
| add a screen | a scene in `scenes/`, then `app.scenes.goto(new MyScene())` |
| edit a hand-made dungeon | `../dungeon/*.txt`, then `npm run levels` and `npm run build` |

After a change in `src/`, run `npm test` and `npm run build` (the page loads
`dist/`). A new behaviour deserves a test in `tests/game.test.js` : most are a
few lines with `testRoom`.
