> **Update :** the XFL exports are now in the repository (`../xfl/mb2`,
> `../xfl/title`, `../xfl/mb2edit`). The rewrite (`../rewrite/`) converts them
> (`npm run xfl`) and draws every original symbol and animation ; see
> `../rewrite/docs/XFL_INTEGRATION.md`. This port (`html5/`) still uses its
> redrawn symbols.

# Decoding the .fla files

The HTML5 port already uses every bitmap and sound stored in the `.fla` files (`tools/extract_fla.py`). The **vector symbols** can't be extracted: Flash MX 2004 saved them in an undocumented binary format. They were redrawn by hand in `js/gfx/symbols/*.js` and `js/screens/*.js`.

This file explains how to get the real vector content, and where it has to go in the port.

---

## 1. The .fla files

| File | Contents | Needed? |
| --- | --- | --- |
| `Frutiparc/Games/motionBall2/mb2.fla` | **The game.** All symbols: room, bumpers, ball, HUD, menus, intro, bosses, effects. | **Yes. This is the important one.** |
| `Frutiparc/Games/motionBall2/goodies/title/title.fla` | The "MotionBall" title logo (the `title.png` next to it is its export). | Useful for the intro letters and the "2". |
| `Frutiparc/Games/motionBall2/mb2edit.fla` | The level editor (mb2edit). It probably contains copies of the bumper symbols. | Only if a symbol is missing or broken in `mb2.fla`. |
| `Frutiparc/Games/motionBall2/swfIcon/mb2_ball.fla` | The Frutiparc desktop icon of the game. | No (could be used as a favicon). |
| `Frutiparc/frutiparc/swf/game/mb2/mb2_ball.fla` | Probably the same icon, from the Frutiparc site sources. | No. |

---

## 2. Option 1: open the file in Flash or Animate and save it as XFL

### What you need

One of these:

- **Flash CS5, CS5.5 or CS6.** They open Flash MX 2004 files and can save XFL.
- **Adobe Animate** (a free trial is available). Animate should open Flash MX 2004 files, but this is unconfirmed for a file this old; if it refuses, use Flash CS5–CS6. Flash CS3–CS4 open the file too, but can't save XFL.

### Steps

1. Open `mb2.fla`.
   - If Flash asks for missing fonts, keep the default replacement. Write down the font names it reports: the port will need a matching web font.
   - Ignore warnings about the AS2 class path (`./class;./;..\ext\class\asml`). The code isn't needed from the `.fla`.
2. **Save as uncompressed XFL:**
   - In Animate: *File › Save As…* › type **"Animate Uncompressed Document (\*.xfl)"**.
   - In Flash CS5/CS6: *File › Save As…* › **"Flash CS5 Uncompressed Document (\*.xfl)"**.
3. Put the result in the repo, next to the originals. Don't touch the original `.fla` files.
   ```
   Frutiparc/Games/motionBall2/xfl/mb2/          <- DOMDocument.xml, LIBRARY/*.xml, bin/*
   Frutiparc/Games/motionBall2/xfl/title/
   Frutiparc/Games/motionBall2/xfl/mb2edit/      (optional)
   ```
4. Commit and push, then ask Claude to write the converter (section 4).

### Optional extras

These are nice to have, not required:

- **Publish a SWF** (*File › Publish*, Flash Player 7 or 8, ActionScript 2). The SWF can be opened in [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) to export every shape and every animation frame as SVG or PNG. This is a useful visual reference to check the converter against. Commit it as `Frutiparc/Games/motionBall2/xfl/mb2.swf`.
- **Run the original game.** The game code is in the separate `mb2/*.as` files, not in the `.fla`. To run it in [Ruffle](https://ruffle.rs), a Flash emulator, the published SWF must also be compiled with the `.as` classes using MTASC (see the `Makefile`). `mb2/Client.as` already has a `STANDALONE` mode that works without the Frutiparc server. Ruffle side-by-side comparison with the port would be the best way to check behaviour.

### What XFL gives us

- `LIBRARY/<symbol>.xml`: one file per symbol, with:
  - its layers and frames, and the **frame labels** (`hit`, `open`, `kata1`…);
  - the **frame scripts** (`stop();`, `gotoAndPlay(...)`, calls such as `animDone()`);
  - its child instances and **instance names** (`aig`, `oeil`, `porteA`…);
  - its **shapes as readable path strings**, with fills, gradients and strokes;
  - its motion tweens.
- `DOMDocument.xml`: the library list with the **linkage names**, which are the names used by `attachMovie` in the AS code and by `MB2.SYMBOLS` in the port.

---

## 3. Symbols to decode, and where they are in the port

Symbols are listed by their **linkage name**. It's the key used in the AS code (`dmanager.attach("bnormal", …)`) and in the port (`MB2.SYMBOLS.bnormal`, or `"time counter"` for names with a space). The "Library item" column is the name shown in the Flash library. It was read from the `.fla` metadata; it's only an aid for finding the symbol.

For each symbol, the port defines:
- **`w`, `h`**: the size in pixels;
- **`labels`**: the frame labels, mapped to frame numbers;
- **`actions`**: the frame scripts;
- **`draw(ctx, clip)`**: the drawing code.

**Contract:** the game code relies on the labels, child names and sizes listed under "Contract". The real timeline can replace the frame numbers, but it must keep that contract, or the matching game code must be adapted at the same time.

### 3.1 Room and gameplay (`js/gfx/symbols/room.js`, `bumpers.js`, `items.js`, `ball.js`, `hud.js`)

| Linkage | Library item | Port | Contract / notes |
| --- | --- | --- | --- |
| `background` | background | `js/gfx/symbols/room.js:26` | 4 frames = bg01–bg04 (the bitmaps are already the real ones). |
| `border` | border | `js/gfx/symbols/room.js:87` (with `MB2.BORDER_COL` and `MB2.borderCanvas` just above) | The room frame. It must leave **gaps for the 4 doors**, because the doors are drawn under it (see the `Interf` constructor, `js/game/interf.js`). |
| `door` | door | `js/gfx/symbols/room.js:113` (with `drawBorderPiece` and `drawDoorHalves`) | Labels `off`, `on`, `open` (animated) → `opened`, `nodoor0`–`nodoor3`. Children `porteA`, `porteB` (door halves, frames 1–4 by side, see `mb2/Interf.as` `init_doors`). Rotated by −90/90/0/180 for left/right/up/down. |
| `ground` | ground | `js/gfx/symbols/room.js:197` | The bgHole bitmap, masked by the holes. Its shape isn't important. |
| `ombre` | ombre | `js/gfx/symbols/bumpers.js:32` | The shadow under a bumper; frame = bumper type (1–14). |
| `bnormal` | bnormal | `js/gfx/symbols/bumpers.js:45` | 48×48 (12×12 cells). Frame 1 = idle (`stop()`); label `hit` plays, then returns to 1. **The game tests `frame === 1`.** |
| `btime` | btime | `js/gfx/symbols/bumpers.js:60` | 64×64. Same `hit` contract. Children **`aig`** and **`aig2`** (clock hands), whose rotation is set by `Collide.bumper_time_on_update`. |
| `bdeath` | bdeath | `js/gfx/symbols/bumpers.js:100` | 40×40. Label `hit`. |
| `bmagnet` | bmagnet | `js/gfx/symbols/bumpers.js:118` | 40×40. Looping labels **`plus`** (attracts) and **`neg`** (repels). |
| `bshadow` | bshadow | `js/gfx/symbols/bumpers.js:142` | 56×56. Label `hit`. Its alpha is driven by code. |
| `wall` | wall | `js/gfx/symbols/bumpers.js:177` | 40×40, **16 frames** = neighbour mask + 1 (1 left, 2 up, 4 right, 8 down). |
| `wallpart` | wallpart | `js/gfx/symbols/bumpers.js:220` | A debris piece of a destroyed green block. |
| `interred`, `interblue` | interred, interblue | `js/gfx/symbols/bumpers.js:237` (`interBlock`) | 40×40. Labels `off` (raised), `on` (lowered), `playOn`, `playOff`. The inter_* bitmaps are already the real ones. |
| `interupt` | interupt | `js/gfx/symbols/bumpers.js:265` | Labels `on`, `off`, `playOn`, `playOff`. Its **hitmap** is approximated at `js/game/collide.js:63` (`circle_hitmap(8, 15)`). |
| `zapper` | zapper | `js/gfx/symbols/bumpers.js:306` | 7 frames = phase / ball colour. Hitmap approximated at `js/game/collide.js:66`. |
| `checkpoint` | checkpoint | `js/gfx/symbols/bumpers.js:328` | Replaces `zapper` in Course mode. |
| `flashLine` | flashLine | `js/gfx/symbols/bumpers.js:381` | Child `gfx`, frame = phase + 1. Stretched with `xscale` = length. |
| `bteleport` | bteleport | `js/gfx/symbols/bumpers.js:407` | Child `c0`, duplicated into `c0`…`c4`; each has a `gfx` child (see `mb2/Level.as`). |
| `red` | red | `js/gfx/symbols/items.js:14` | Label `hit` (collect animation, then removed). |
| `blue` | blue | `js/gfx/symbols/items.js:38` | Label `hit`. **Its real colour is unknown**: the port uses gold. |
| `hit` | hit | `js/gfx/symbols/items.js:56` | The wall-impact spark. It plays once, then is removed. |
| `exit` | trappe | `js/gfx/symbols/items.js:86` | The Classique mode hatch. Label `anim_open`; at the end it sets **`flOpen = true`**. |
| `maskHole` | maskHole | `js/gfx/symbols/items.js:139` | The mask of the ball falling through the hatch. The port uses a circle (`Collide.classic_exit_on_hit`, `js/game/collide.js`). |
| `itembox` | itembox | `js/gfx/symbols/items.js:231` (with `MB2.drawItemIcon` at `js/gfx/symbols/items.js:148`) | 48×48. Child **`item`**, frames 1–5 = map, radar, small time, big time, key. Label `hit`. Hitmap approximated at `js/game/collide.js:62`. |
| `ballbox` | ballbox | `js/gfx/symbols/items.js:270` | Child **`ball`**, frame = ball type + 1. Label `hit`. |
| `shadow` | shadow | `js/gfx/symbols/ball.js:17` | The ball's shadow. |
| (ball) | marble, stone, light, round | `js/gfx/symbols/ball.js:26` (`SYM.marble`) and `STONE_STYLE` at `js/game/ball.js:20` | The original ball is made of **4 symbols**: `marble` (7 frames = colours), `stone` (frame = random(4) + 1 + btype × 10, masked by `round`), `light`. See `mb2/Ball.as` `gen_stones` / `move_stones`. `MB2.BALL_COLORS` is at `js/gfx/draw.js:13`. |
| `time counter` | Time Counter | `js/gfx/symbols/hud.js:22` (with `drawClockIcon`, `drawLapIcon` just below) | Frame 1 = challenge, label `classic`, label `time` (Course, animated up to frame 11). `play()` is called on each lap. Text fields `tview_txt`, `niv_txt`, `lap_txt`, `timerPanel.min_txt/sec_txt/mil_txt`, stored in the port as `txt`, `niv`, `lap`, `min`, `sec`, `mil`. |
| `ball icon` | ball icon | `js/gfx/symbols/hud.js:110` | Labels `select` and `on`. Child `ball`, frame = colour. |
| `icon grelot` | icon grelot | `js/gfx/symbols/hud.js:136` (with `MB2.drawGrelot` at `js/gfx/symbols/items.js:215`) | Label `hit` (lost key). |

### 3.2 Bosses and effects (`js/gfx/symbols/boss_*.js`)

| Linkage | Library item | Port | Contract / notes |
| --- | --- | --- | --- |
| (no symbol) | | `js/gfx/symbols/bumpers.js:352` (`zaplines`) | Invented for the port: the faint zapper beams. Remove it if the original didn't show beams. |
| `boss` | boss (bossGFX, oeil, pupille, paupiere, pince, tentacule…) | `js/gfx/symbols/boss_octopus.js:27` | Labels **`dodo`, `normal`, `aspire`, `tir`, `looseEye`, `newEye`, `eat`, `throw`, `death`**. Children **`oeil`** (with `p` = pupil, and label `close`), **`b`** (frame = jump height; children **`p1`**, **`p2`** = pincers, rotated by code), **`souffle`** (scaled by code). See `mb2/Boss.as`. |
| `boss shade` | boss shade | `js/gfx/symbols/boss_octopus.js:217` | |
| `boss tir` | boss tir | `js/gfx/symbols/boss_octopus.js:227` | The eye projectile. |
| `bossParticule` | bossParticule | `js/gfx/symbols/boss_octopus.js:251` | |
| `dalle` | dalle | `js/gfx/symbols/boss_effects.js:17` | Registration point at the **top-left** of the 40×40 cell. It plays once, then is removed. |
| `FXDalleCut` | FXDalleCut | `js/gfx/symbols/boss_effects.js:44` | Registration at the top-left. **The final boss waits for this clip to remove itself** (`BossTB.update_dalles`). |
| `snake` | snake (headGFX, anoGFX, queueGFX, crane, oeil…) | `js/gfx/symbols/boss_snake.js:51`; tint colours `ELEMENT_COLORS` at `js/gfx/symbols/boss_snake.js:15`, `MB2.tinted` at `js/gfx/symbols/boss_snake.js:18` | Frame 1 head, 2 body, 3 tail. Children `gfx` (frame = element 1–4), `crane` (frame = element, child `anim` played on a hit), **`o1`, `o2`** (eyes, frames 1 excited, 2 normal, 3 berserk). The head bitmaps are real; the per-element **colours were guessed**. The head and tail hit areas are approximated by ellipses in `BossSerpent.hitPart` (`js/boss/serpent.js`). |
| `snakePart` | snakePart | `js/gfx/symbols/boss_snake.js:89` | Scale pieces; frame = element. |
| `logoBg` | logoBg | `js/gfx/symbols/boss_snake.js:110` | Frame = element. The logos are real bitmaps, but their **position and scale were guessed**. |
| `FXWater` | FXWater | `js/gfx/symbols/boss_effects.js:75` | |
| `FXWaterParticule` | FXWaterParticule | `js/gfx/symbols/boss_effects.js:95` | 3 frames. |
| `FXWaterQueue` | FXWaterQueue | `js/gfx/symbols/boss_effects.js:104` | |
| `FXFire` | FXFire | `js/gfx/symbols/boss_effects.js:127` | **Frames 1–15 = warm-up** (harmless; the code checks `frame < 16`). It loops while `flLoopv` is true, then plays its ending and removes itself. |
| `FXbourgeon` | FXbourgeon | `js/gfx/symbols/boss_effects.js:184` | Labels `explode` and `death`. |
| `FXLiane` | FXLiane | `js/gfx/symbols/boss_effects.js:226` | Child `liane` whose `xscale` = segment length (the port uses `len`). |
| `FXWind` | FXWind | `js/gfx/symbols/boss_effects.js:247` | |
| `tourneboule` | tourneboule (tourn/boul, visage, main, manche, jambe, base…) | `js/gfx/symbols/boss_tourneboule.js:33` onwards (`TB`, `pose`, `KATA_COLORS`, `KATA_HANDS`, `SYM.tourneboule` at `js/gfx/symbols/boss_tourneboule.js:111`) | **The most important one.** Its timeline drives the boss logic: labels `stopFly`, `startFly`, `fly`, `flyVanish` (the original loops frames **169–177**), `kata1`–`kata6`, `death`. Its frame scripts call **`animDone()`** at the end of each animation and **`kataDone()`** in the middle of each kata. The port reinvented those frame numbers; the real ones must be copied into `BossTB` (`js/boss/tourneboule.js`), in `update_moving` and `nextKata`. |
| `TBShadow` | TBShadow | `js/gfx/symbols/boss_tourneboule.js:194` | Same labels as `tourneboule`. |
| `forceBubble` | forceBubble | `js/gfx/symbols/boss_tourneboule.js:210` | |
| `TBVanish`, `TBSpawn` | TBVanish, TBSpawn | `js/gfx/symbols/boss_tourneboule.js:227` (`puff`) | `TBSpawn` calls **`animDone()`** at its end. |

### 3.3 Screens (`js/screens/*.js`)

These screens don't use `MB2.SYMBOLS`: they draw directly with the canvas API. Decoded symbols can be drawn from these functions instead.

| Linkage | Library item | Port | Notes |
| --- | --- | --- | --- |
| `intro_bg` | intro_bg | `MB2.ScreenGfx.drawSunburst`, `js/screens/common.js:19` | Uses the real `roue` bitmap. |
| `title` | title (10 frames = the letters M O T I O N B A L L) | `MB2.ScreenGfx.drawLetter`, `js/screens/common.js:41`; used in `Intro.draw` | See also `goodies/title/title.fla`. |
| `deux` | deux | `Intro.drawDeux`, `js/screens/intro.js:293` | The big "2". |
| `fissure` | fissure | `Intro.drawFissures`, `js/screens/intro.js:328` | Random frame, rotated around the "2". |
| `press start` | press start | inside `Intro.draw` (`js/screens/intro.js`) | The port uses the text "Cliquez pour commencer". |
| `fondMenu` | fondMenu (+ child `hole`) | `drawSunburst` + the hole in `Menu.draw` (`js/screens/menu.js`) | |
| `menu balls` | menu balls, menu balls title, bouleMenu | `Menu.drawBall`, `js/screens/menu.js:423` | Labels `normal`, `selected`, `disable`. Children `title` and `ball`, frame = menu id (1–7, 20–24, 40–47, 60–65). For dungeons, `ball.mask` has frame 2 = dungeon completed, and `ball.logo` is the final dungeon logo. **Only the 6 main balls are real bitmaps**; the course, adventure and options balls were invented. |
| `cadreInfo` | cadreInfo | inside `Menu.draw`; its texts are the `INFOS` constant at `js/screens/menu.js:40` | Frames 1–4. **The port's texts were written for it**: copy the real texts from this symbol. |
| `panGameOver` | panGameOver (gameOverText, victoire text) | `MB2.ScreenGfx.drawPanel` at `js/screens/common.js:68`, `bubbleTitle` at `js/screens/common.js:96`, `GameOver.draw`, `GameOverCourse.draw` (`js/screens/game_over.js`) | Labels `victory`, `gameOver`, `records` (rows `s1`–`s4` with children `slot.time_text`, `b1`, `b2`, frames 1–5), `texte`, `aide`. Text field `mainField`. |
| `pause` | pause | `Pause.draw` (`js/screens/pause.js`) | |
| `carte` | carte (carteFonds, carteGrillet) | `Pause.drawMap`, `js/screens/pause.js:83` (grid position: `GRID_X` / `GRID_Y` at the top of the file) | The `map` bitmap is real. `carte.grille` is the grid overlay. |
| `room` | room | `Pause.drawRoom`, `drawPassages`, `drawRadarIcon` (`js/screens/pause.js`) | **34 frames**, listed in `mb2/Pause.as`: 1–12 passages (+4 visited, +8 current), 14–17 empty rooms, 19/22/23/24 objects, 20/21/27–30 bonuses, 26 start, 31 exit, 33 visited room, 34 current room. |
| `loading` | loading (chargement) | `Loader` in `js/app/manager.js` (uses `MB2.Text`) | Not important: levels load instantly. |
| `Help retour button`, `ballHelpGFX`, `aide retour` | | not ported | The `Aide` help screen (`mb2/Aide.as`) is unused by the menu. The `help_*.png` bitmaps are extracted in `assets/img` but not used yet. |

---

## 4. How to plug in the decoded content

Planned approach, once the XFL is in the repo:

1. **Write a converter** `html5/tools/xfl_to_js.js` (Node). For each symbol in section 3, it:
   - reads `LIBRARY/*.xml`;
   - turns the edges into canvas paths (the XFL edge format is well documented: `!x y` moveTo, `|x y` lineTo, `[cx cy x y` quadratic curve; coordinates in twips, with `#hex` values for decimals). Gradients and bitmap fills become canvas gradients and patterns;
   - generates **`html5/js/gfx/symbols/xfl.js`** containing symbol objects with the same shape as `MB2.SYMBOLS` entries: `w`, `h`, `frames`, `labels`, `actions` (translated from the frame scripts: `stop()`, `gotoAndPlay`, `animDone`/`kataDone` callbacks…), `init` (creating the named children) and `draw`.
2. **Load it last** in `html5/index.html`, after the other `js/gfx/symbols/*.js` files:
   ```html
   <script src="js/gfx/symbols/xfl.js"></script>
   ```
   Each generated entry **overrides** the hand-made one of the same name. Symbols that failed to convert keep the redrawn version.
3. **Check the contracts** listed in section 3, and adapt the code where the real timelines differ:
   - `js/boss/tourneboule.js`: `BossTB` (the `flyVanish` frame range in `update_moving`, and the kata frames advanced with `nextFrame`). `js/boss/octopus.js`: `Boss` (child names).
   - `js/game/collide.js`: `Collide.init`. Replace `circle_hitmap(...)` with hitmaps sampled from the real `itembox`, `interupt` and `zapper` shapes, as `Collide.gen_hitmap` did with `hitTest`. Keep the symbol `w`/`h` consistent: `Tools.mc_size` derives cell sizes from them.
   - `js/screens/*.js`: `Intro`, `Menu`, `GameOver*` and `Pause` can call the generated symbols instead of drawing by hand. Also copy the real texts (menu info panel, press start).
4. **Fonts:** if Flash reported fonts in step 2.1, add the matching web fonts, or convert the static texts to paths. The font stack is `MB2.FONT` in `js/gfx/draw.js`.
5. **Update `html5/README.md`**, "Known differences" section.

Bitmaps (`assets/img`) and sounds (`assets/snd`) don't need to change: they are already the original data.
