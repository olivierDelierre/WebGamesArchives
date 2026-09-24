# Using the decoded .fla (XFL) in the rewrite — status and what's left

The original Flash files, saved as uncompressed XFL, are in `../xfl/` (`mb2/`,
`title/`, `mb2edit/`). This note says how they are turned into art the
rewrite draws, what is done, and what remains.

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

## Done in the game (uses the original symbols)

- Room: `background` (frame = (x+y)%4), holes (`ground` clipped to the hole
  tiles + #9B76BC back wall), `border`, `door` (frames off / open…opened /
  nodoor0-3; the halves `porteA/B` are stopped), block drop shadows as in the
  original (one rounded rect per vertical and per horizontal run).
- Bumpers (`src/game/entities/bumpers.js`): `bnormal`, `btime` (hands `aig`,
  `aig2`), `bdeath`, `bmagnet` (`plus` / `neg`), `bshadow`; shadows with
  `ombre` (frame = item type − 1).
- Blocks (`blocks.js`): `wall` (frame = neighbour mask), `interred` /
  `interblue` (`off` = up, `on` = down, `playOff` / `playOn`), `interupt`.

Build and the 102 tests pass in this state.

## Remaining

1. **Item placement like the original** (started): in `src/game/room.js`, replace
   the `SIZES` table by `symbolCells(symbol)` of each item's symbol
   (bnormal, btime, bdeath, bmagnet, bshadow, wall, red, blue, bteleport,
   interupt, interred, interblue, zapper / checkpoint in Course, exit):
   centre = (x + cells.w / 2) × 4. Real sizes differ from the port's guesses
   for btime (18 cells, not 16), interupt (14, not 8), interred/interblue
   (12, not 10), zapper (12, not 8). Also, from Level.as: the switch and the
   blue block are drawn 2 px up-left (`_x -= 2`), the hatch 2 px down-right;
   pink/blue blocks keep the wall collision box (40×40 from x×4, y×4);
   zapper phase = ((x − w/2) + (y − h/2)) % 7 with the real w, h (= 12).
   Then fix the tests that depend on positions (tests/game.test.js "laser beam").
2. **Pickups** (`pickups.js`): `red` / `blue` (play "hit", the entity dies
   when the clip is `removed`); `exit` (`anim_open`, open when
   `art.vars.flOpen`; keep `hatch.open` = 1 then, the tests use it);
   `ballbox` (child `ball` frame = ball type; "hit"); `itembox` (child `item`
   frame = icon; "hit" then "opened"); teleport: `bteleport` with its `c0`
   hidden and 5 `_gfx/_bumpers/_teleport/teleCercle` clips drawn like
   Level.as / Collide.bumper_teleport_on_update (gfx y = random(6),
   rotation random, rot 3..5 °/frame, x/yscale 1 ± cos/sin 0.5).
3. **Zappers** (`zappers.js`): `zapper` gotoAndStop(phase) (its `reflet` plays),
   `checkpoint` in Course; laser flash `flashLine` (child `gfx` frame = phase,
   xscale = length, rotation). The beams drawn between posts are a port
   addition (keep, or make optional).
4. **Effects** (`effects.js`): `hit` (spark, removes itself), `wallpart`
   (debris), `dalle` / `FXDalleCut` (floor breaking, in bosses/common.js).
5. **Ball** (`ball.js`): like Ball.as — `marble` frame = type; 6–20 `stone`
   clips at frame (random(4) + type × 10) placed/alpha'd by move_stones,
   clipped by `round` (a circle of radius 12); `light` on top; `shadow`
   symbol under it. HUD icons: `ball icon` (off / on / select, child `ball`
   frame = type), `icon grelot` ("hit" when a key is used).
6. **HUD** (`hud.js`): `time counter` at x = 610 (labels score / time /
   classic; texts `tview_txt`, `niv_txt`, `lap_txt`, and in `timerPanel`:
   `min_txt`, `sec_txt`, `mil_txt`). See Interf.update in the port.
7. **Bosses**: octopus `boss` (labels normal, aspire, eat, throw, newEye,
   looseEye, death, dodo; parts `b` (pincers `p1`, `p2`), `souffle`, `oeil`
   (pupil `p`); script calls `change_pattern`), `boss shade`, `boss tir`
   ("shrink"), `bossParticule`; `snake` (frames head/body/tail…, parts `gfx`,
   `crane`, eyes `o1`, `o2`), `snakePart`, `logoBg` (frame = element);
   `tourneboule` / `TBShadow` (labels kata1-6, startFly, fly, stopFly,
   flyVanish, death; it calls `kataDone` / `animDone` — the rewrite's state
   machine can follow these events or keep its durations), `TBSpawn`,
   `TBVanish`, `forceBubble`; powers `FXWater`, `FXWaterParticule`,
   `FXWaterQueue`, `FXFire` (label loop, var flLoopv), `FXbourgeon`
   (explode, death), `FXLiane`, `FXWind`. The original code for each is in
   `../mb2/Boss*.as`, the port's version in `../html5/js/boss/`.
8. **Screens**: `title` / `deux` / `fissure` / `intro_bg` / `press start`
   (Intro.as), `fondMenu` + `menu balls` (normal / disable / selected) +
   `cadreInfo` (Menu.as), `pause`, `carte` + `room` (Pause.as), `panGameOver`
   (gameOver / victory / texte / records…, text `mainField`, `scoreText`;
   GameOver.as), `loading`. `../xfl/title` has the title.fla animation.
9. Then: remove the now unused redrawn art (gfx/draw.js sprites, gfx/icons.js,
   the old assets/img bitmaps that the symbols replace), update
   docs/ARCHITECTURE.md and README, `../html5/FLA_DECODING.md` (the XFL is now
   in the repo and used by the rewrite), add tests (converter: a symbol's
   frames/labels/bounds; Clip: goto/labels/scripts/tweens), check every screen
   with the gallery and screenshots, commit.

Performance to watch: every entity draws its clip each frame (Path2D and
gradients are cached). If needed, cache still frames of static symbols as
bitmaps (gfx/draw.js `sprite()` does this for the redrawn art).
