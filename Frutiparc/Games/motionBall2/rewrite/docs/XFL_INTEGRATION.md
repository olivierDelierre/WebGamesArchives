# Using the decoded .fla (XFL) in the rewrite

The original Flash files, saved as uncompressed XFL, are in `../xfl/` (`mb2/`,
`title/`, `mb2edit/`). This note says how they are turned into art the
rewrite draws, and what uses them.

## How it works

```
../xfl/mb2/ (XFL)  --tools/xfl/convert.js-->  assets/xfl/mb2.json + assets/xfl/mb2/*.png
                                                   |
                         src/gfx/xfl/  (library.js, clip.js, render.js, index.js)
                                                   |
                         entities: clip("bnormal").gotoAndPlay("hit") ... drawClip(ctx, c, x, y)
```

- **Converter** `tools/xfl/convert.js` (`npm run xfl`; XML parser in `tools/xfl/xml.js`,
  no dependencies):
  - shapes: XFL edges (twips, `#hex.hh` numbers, `!` move, `|` line, `[` curve) →
    one SVG path string per fill, by chaining the edges of each fill style
    (fillStyle1 as is, fillStyle0 reversed) into closed loops; strokes too.
    Solid, linear and radial gradients, and bitmap fills are handled.
  - **A DOMShape's own matrix must be applied; a DOMGroup's matrix must be
    ignored** (the members carry their own). Getting that wrong misplaces parts.
  - timelines: layers (bottom→top), keyframes, motion tweens (`tw` = easing),
    labels, masks (`mask` / `maskedBy`), graphic instances (`g`: firstFrame,
    loop mode), instance names (`n`), colour transforms (`c`), texts.
  - frame scripts → small operations (`stop`, `goto`, `gotoRel`, `remove`,
    `call` for `animDone()` / `kataDone()`, frame counters, random loops…).
    Only 11 scripts stay untranslated (the game's main code, a debug helper).
  - bitmaps: `bin/*.dat` → PNG (zlib ARGB, premultiplied) or JPEG.
  - bounds of every symbol at frame 0 (`symbols[x].bounds`), to place items
    like the original `Tools.mc_size`.
  - Output: 234 symbols, 1016 shapes, 49 bitmaps; mb2.json ≈ 2.3 MB, bundled
    into `dist/motionball2.js` (so the game still works from file://).
- **Runtime** `src/gfx/xfl/`:
  - `Clip` (clip.js): a playing symbol instance — `gotoAndPlay/Stop(label|frame)`,
    `update(dt)` (ticks at 40 fps), nested movie clips play by themselves,
    graphics follow their parent's frame, tweens interpolated, script ops run.
    The game drives named parts with `clip.set("aig", { rotation })`, texts with
    `clip.setText("tview_txt", "123")` (both reach nested clips), hears
    `clip.on = (event) => …` (e.g. "animDone"), reads `clip.vars` (e.g. flOpen).
  - `render.js`: shapes (Path2D, cached gradients), texts, masks (Path2D +
    DOMMatrix), colour transforms (offscreen canvas: multiply + add), tweens.
  - `index.js`: `clip(name)`, `drawClip(ctx, c, x, y, rot, scale, alpha)`,
    `symbolCells(name)` (the original mc_size), `xflBitmapFiles()` (preloaded
    by main.js).
- **Gallery** `xfl-gallery.html` (`npm run gallery`, then serve the folder):
  every exported symbol playing; `?only=boss,snake&zoom=2.5&cols=4`; click a
  cell to step through its labels. Use it to check the conversion.

## Status : done

Everything on screen is now an original symbol :

| part | symbols | code |
| --- | --- | --- |
| room | `background` (frame = (x+y)%4), `ground` (holes), `border`, `door` (off / open…opened / nodoor0-3) | `game/room.js`, `game/doors.js` |
| items | `bnormal`, `btime` (hands `aig`, `aig2`), `bdeath`, `bmagnet`, `bshadow`, `ombre`, `wall`, `interred` / `interblue`, `interupt`, `red` / `blue`, `exit`, `ballbox`, `itembox`, `bteleport`, `zapper` / `checkpoint` | `game/entities/` |
| effects | `hit`, `wallpart`, `flashLine`, `dalle`, `FXDalleCut` | `entities/effects.js`, `bosses/common.js` |
| ball | `marble`, `stone` (+ `eclat`), `light`, `shadow` (Ball.as) | `game/ball.js` |
| HUD | `time counter`, `ball icon`, `icon grelot` | `game/hud.js` |
| octopus | `boss`, `boss shade`, `boss tir`, `bossParticule` | `bosses/octopus.js` |
| snakes | `snake` (head / ring / tail, `gfx`, `crane`, eyes `o1` `o2`), `snakePart`, `logoBg` | `bosses/snake.js` |
| final boss | `tourneboule`, `TBShadow`, `forceBubble`, `TBSpawn`, `TBVanish` ; the state machine follows `kataDone` / `animDone` like BossTB.as | `bosses/tourneboule.js` |
| powers | `FXWater`, `FXWaterParticule`, `FXWaterQueue`, `FXFire` (`flLoopv`), `FXbourgeon`, `FXLiane`, `FXWind` | `bosses/powers.js` |
| screens | `loading` ; `intro_bg`, `title`, `deux`, `fissure`, `press start` (Intro.as) ; `fondMenu`, `menu balls`, `cadreInfo` (Menu.as) ; `pause`, `carte`, `room` (Pause.as) ; `panGameOver` (GameOver.as, GameOverCourse.as) | `main.js`, `scenes/` |

The redrawn art of the first rewrite and its bitmaps (`assets/img`,
`gfx/icons.js`, most of `gfx/draw.js` / `gfx/ui.js`) are gone.

Fixed on the way : colour transforms were drawn straight to the screen instead
of the offscreen layer (so they were never applied), and negative colour
offsets were ignored (the snakes' colours use them).

Tests : `tests/xfl.test.js` (converter, library, Clip). `npm test` : 113 tests ;
`npm run test:browser` passes.

## Possible follow-ups

- Performance : every entity draws its clip each frame (Path2D and gradients
  are cached ; colour transforms go through an offscreen canvas). If needed,
  cache the still frames of static symbols as bitmaps.
- The fonts of the texts (Kiloton, Polo, Pleasantly Plump...) are not in the
  XFL ; a web font replaces them.
- `../xfl/mb2edit` (the level editor) is not converted : nothing in the game
  needs it.
