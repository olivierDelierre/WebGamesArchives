/*
 * The room display : background, border, doors, holes, walls, the scrolling
 * between rooms and the time counter. Port of mb2/Interf.as.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;
	const Path = MB2.Path;
	const Bumper = MB2.Bumper;

	// the room in "wall cells" of 10 x 10 collision cells (walltable)
	const WALL_COLUMNS = (Const.LVL_CWIDTH / 10) | 0;
	const WALL_ROWS = (Const.LVL_CHEIGHT / 10) | 0;

	MB2.Interf = class {

		constructor(game) {
			this.game = game;
			const dm = game.dmanager;

			/*
			 * doors[0..3] : the doors of the current room (left, right, up, down).
			 * doors[4..7] : the doors of the next room, only visible while scrolling.
			 * A door clip is placed on the middle of its side and rotated so that
			 * the room is toward its +y (see gfx/symbols/room.js).
			 */
			this.doors = [];
			const b = Const.BORDER_SIZE / 2;
			const HOME = [
				[b, Const.LVL_HEIGHT / 2, -90],
				[Const.LVL_WIDTH - b, Const.LVL_HEIGHT / 2, 90],
				[Const.LVL_WIDTH / 2, b, 0],
				[Const.LVL_WIDTH / 2, Const.LVL_HEIGHT - b, 180]
			];
			for (let d = 0; d < 4; d++) {
				const door = dm.attach("door", Const.DOOR_PLAN);
				door.d = d;
				door.sx = HOME[d][0];
				door.sy = HOME[d][1];
				door.rotation = HOME[d][2];
				door.x = door.sx;
				door.y = door.sy;
				door.stop();
				this.doors[d] = door;

				const next = dm.attach("door", Const.DOOR_PLAN);
				next.d = d;
				next.rotation = door.rotation;
				next.visible = false;
				next.stop();
				this.doors[d + 4] = next;
			}

			// bg1 / decor1 : the current room, bg2 / decor2 : the next one while scrolling
			this.bg1 = dm.attach("background", Const.BG_PLAN);
			this.bg2 = dm.attach("background", Const.BG_PLAN);
			this.ground = dm.attach("ground", Const.HOLE_PLAN);
			this.holes = dm.attach("holes", Const.HOLE_PLAN);
			this.shades = dm.attach("shades", Const.SHADE_PLAN - 1);
			this.decor1 = dm.attach("border", Const.DECOR_PLAN);
			this.decor2 = dm.attach("border", Const.DECOR_PLAN);
			this.tview = dm.attach("time counter", Const.ICON_PLAN);

			switch (MB2.Manager.play_mode) {
			case Const.MODE_CLASSIC:
				this.tview.gotoAndStop("classic");
				break;
			case Const.MODE_COURSE:
				this.tview.gotoAndPlay("time");
				break;
			default:
				this.tview.gotoAndStop(1);
				break;
			}
			this.tview.x = Const.LVL_WIDTH;

			this.bg2.stop();
			this.bg2.visible = false;
			this.decor2.visible = false;
			this.ground.holes = this.holes;
			this.ground.visible = false;

			this.scroll_x = 0;
			this.scroll_y = 0;
			this.scroll_dx = 0;
			this.scroll_dy = 0;
			this.scroll_end = false;
			this.old_time = undefined;
			this.walltable = [];
		}

		init_room() {
			// walltable[x][y] : the wall / hole / block occupying each wall cell
			this.walltable = [];
			for (let x = 0; x < WALL_COLUMNS; x++)
				this.walltable[x] = [];
			this.bg1.gotoAndStop(this.selectBg(this.game.level.pos_x, this.game.level.pos_y));
		}

		selectBg(x, y) {
			return 1 + (x + y) % 4;
		}

		// ----- doors -----

		/**
		 * Shows the doors of the current room (ddelta = 0) or of the next room
		 * during the scrolling (ddelta = 4), and sets their collisions.
		 */
		init_doors(ddelta) {
			const game = this.game;
			const level = game.level;
			const room = level.dungeon[level.pos_x][level.pos_y];

			for (let d = 0; d < 4; d++) {
				const path = room.paths ? room.paths[d] : { ptype: Path.WALL };
				const door = this.doors[ddelta + d];

				// out of the challenge, a "special" door is a one-way door
				let type = path.ptype;
				if (type === Path.SPECIAL && MB2.Manager.play_mode !== Const.MODE_CHALLENGE)
					type = Path.ONE_WAY;

				switch (type) {
				case Path.ONE_WAY: {
					// open only when entering the room through it, then it closes behind
					const enteringHere =
						(d === 0 && this.scroll_dx === 1) ||
						(d === 1 && this.scroll_dx === -1) ||
						(d === 2 && this.scroll_dy === 1) ||
						(d === 3 && this.scroll_dy === -1);
					if (enteringHere) {
						if (ddelta === 0) {
							level.updates.push({
								d: d,
								validate: (path.ptype === Path.ONE_WAY),
								on_update: MB2.Collide.autoclose_door_on_update
							});
						}
						door.gotoAndStop("opened");
						this.set_open_door_collide(d);
					} else {
						door.gotoAndStop("off");
						level.set_door_collide(d, MB2.Collide.border_collide);
					}
					break;
				}

				case Path.OPEN:
					door.gotoAndStop("opened");
					this.set_open_door_collide(d);
					break;

				case Path.DOOR:
				case Path.SPECIAL:
					door.gotoAndStop(level.bonus_reds ? "off" : "on");
					level.set_door_collide(d, {
						on_hit: MB2.Collide.door_on_hit,
						hit_coef: MB2.Collide.border_collide.hit_coef,
						hit_min: MB2.Collide.border_collide.hit_min,
						d: d
					});
					break;

				case Path.INVISIBLE:
					door.gotoAndStop("nodoor" + d);
					this.set_open_door_collide(d);
					break;

				default: // WALL
					door.gotoAndStop("nodoor" + d);
					level.set_door_collide(d, MB2.Collide.border_collide);
					break;
				}
			}
		}

		/** An open door : free cells, with a "no recal" border on its sides. */
		set_open_door_collide(d) {
			const level = this.game.level;
			level.set_door_collide(d, MB2.Collide.border_collide_no_recal, Const.DOOR_COLLIDE_DELTA);
			level.set_door_collide(d, null);
		}

		/** All the red pastilles are collected. */
		open_doors() {
			const exit = this.game.level.exit;
			if (exit != null)
				exit.clip.gotoAndPlay("anim_open");
			for (let d = 0; d < 4; d++)
				this.open_door(d);
		}

		open_door(d) {
			const game = this.game;
			const room = game.level.dungeon[game.level.pos_x][game.level.pos_y];
			if (!room.paths)
				return;
			const path = room.paths[d];
			if (path.ptype !== Path.DOOR && path.ptype !== Path.SPECIAL)
				return;

			if (path.ptype === Path.SPECIAL && MB2.Manager.play_mode !== Const.MODE_CHALLENGE) {
				// a one-way door : becomes a crossed one-way door, but isn't opened
				path.ptype = Path.ONE_WAY;
				return;
			}
			path.ptype = Path.OPEN;
			this.doors[d].gotoAndPlay("open");
			this.set_open_door_collide(d);
		}

		// ----- walls and holes -----

		/** Sets the content of the wall cell of item b (b.x / b.y in collision cells). */
		fill_wall(b, value) {
			const x = ((b.x - Const.BORDER_CSIZE) / 10) | 0;
			const y = ((b.y - Const.BORDER_CSIZE) / 10) | 0;
			if (this.walltable[x])
				this.walltable[x][y] = value;
		}

		/**
		 * Recomputes the look of the walls and holes from walltable :
		 * - the frame of each block (which neighbours are blocks too),
		 * - the hole rectangles (the "ground" symbol shows the bgHole bitmap
		 *   there) with a back wall strip on their top edge,
		 * - the drop shadows of the groups of blocks.
		 */
		update_walls() {
			const wt = this.walltable;
			const typeAt = (x, y) => (wt[x] && wt[x][y]) ? wt[x][y].btype : undefined;
			const CELL = Const.DELTA * 10;
			const cellX = x => (Const.BORDER_CSIZE + x * 10) * Const.DELTA;
			const cellY = y => (Const.BORDER_CSIZE + y * 10) * Const.DELTA;

			this.holes.rects = [];
			this.shades.ops = [];

			for (let x = 0; x < WALL_COLUMNS; x++) {
				for (let y = 0; y < WALL_ROWS; y++) {
					const b = wt[x][y];
					if (!b)
						continue;

					let frame = 0;
					if (typeAt(x - 1, y) === b.btype)
						frame += 1;
					if (typeAt(x, y - 1) === b.btype)
						frame += 2;
					if (typeAt(x + 1, y) === b.btype)
						frame += 4;
					if (typeAt(x, y + 1) === b.btype)
						frame += 8;

					if (b.btype === Bumper.HOLE) {
						const px = cellX(x) + 1;
						const py = cellY(y) + 1;
						const topEdge = y > 0 && (frame & 2) === 0;
						let h = 0;
						if (topEdge) {
							h = Const.HOLE_BORDER_SIZE;
							this.shades.ops.push({ t: "rect", col: "#9B76BC", x: px, y: py, w: CELL, h: h });
						}
						this.holes.rects.push([px, py + h, CELL, CELL - h, (frame & 2) === 0]);
					}

					b.frame = frame;
					if (b.clip)
						b.clip.gotoAndStop(frame + 1);
				}
			}

			// shadows : one rounded rectangle per vertical and per horizontal run of blocks
			const DECAL = 4;
			for (let x = 0; x < WALL_COLUMNS; x++) {
				for (let y = 0; y < WALL_ROWS; y++) {
					const b = wt[x][y];
					if (!b || b.btype !== Bumper.WALL)
						continue;

					if ((b.frame & 2) === 0) {
						let dy = 1;
						while (typeAt(x, y + dy) === Bumper.WALL)
							dy++;
						this.shades.ops.push({
							t: "smooth", a: 0.2, curve: 8,
							x: cellX(x) + DECAL, y: cellY(y) + DECAL,
							w: CELL, h: dy * CELL
						});
					}
					if ((b.frame & 1) === 0) {
						let dx = 1;
						while (typeAt(x + dx, y) === Bumper.WALL)
							dx++;
						this.shades.ops.push({
							t: "smooth", a: 0.2, curve: 8,
							x: cellX(x) + DECAL, y: cellY(y) + DECAL,
							w: dx * CELL, h: CELL
						});
					}
				}
			}

			this.ground.visible = this.holes.rects.length > 0;
		}

		// ----- changing room -----

		/**
		 * Starts the scrolling toward the neighbouring room (dx, dy = -1 / 0 / 1).
		 * The level is already cleaned : only the backgrounds, borders, doors and
		 * the ball scroll. The new room is built at the end (Game.next_room).
		 */
		change_room(dx, dy) {
			const game = this.game;
			this.scroll_x = 0;
			this.scroll_y = 0;
			this.scroll_dx = dx;
			this.scroll_dy = dy;

			this.bg2.visible = true;
			this.decor2.visible = true;
			this.bg2.x = -1000;
			this.decor2.x = -1000;
			for (let d = 0; d < 4; d++) {
				const door = this.doors[d + 4];
				door.visible = true;
				door.x = -1000;
				door.y = -1000;
			}

			game.level.pos_x += dx;
			game.level.pos_y += dy;
			game.level.prepare_room();
			this.bg2.gotoAndStop(this.selectBg(game.level.pos_x, game.level.pos_y));

			// the door we come through is open in the new room
			let dir;
			if (dx < 0)
				dir = 1;
			else if (dx > 0)
				dir = 0;
			else if (dy < 0)
				dir = 3;
			else
				dir = 2;
			this.open_door(dir);

			// show the other doors of the new room closed ("don't open doors automaticly :)")
			game.level.bonus_reds = 1;
			this.init_doors(4);

			game.scroll_on = true;
			this.scroll_end = false;
			this.scroll_room();
		}

		/** One frame of scrolling (a room in 20 frames). */
		scroll_room() {
			const game = this.game;
			const tmod = Std.tmod;
			const W = Const.LVL_WIDTH;
			const H = Const.LVL_HEIGHT;

			this.scroll_x -= this.scroll_dx * tmod * (W / 20);
			this.scroll_y -= this.scroll_dy * tmod * (H / 20);

			if (this.scroll_end) {
				// done : the next room becomes the current one
				game.scroll_on = false;
				this.bg2.visible = false;
				this.decor2.visible = false;
				for (let d = 0; d < 4; d++)
					this.doors[d + 4].visible = false;
				game.ball.x -= this.scroll_dx * W;
				game.ball.y -= this.scroll_dy * H;
				this.scroll_x = 0;
				this.scroll_y = 0;
				game.next_room();
			}

			if (Math.abs(this.scroll_x) >= Math.abs(this.scroll_dx * W) && Math.abs(this.scroll_y) >= Math.abs(this.scroll_dy * H)) {
				// last frame (the room is built on the next frame)
				this.scroll_end = true;
				this.scroll_x = -this.scroll_dx * W;
				this.scroll_y = -this.scroll_dy * H;
			}
			if (!game.scroll_on) {
				this.scroll_x = 0;
				this.scroll_y = 0;
			}

			this.bg2.x = this.scroll_dx * W + this.scroll_x;
			this.bg2.y = this.scroll_dy * H + this.scroll_y;
			this.decor2.x = this.bg2.x;
			this.decor2.y = this.bg2.y;
			this.bg1.x = this.scroll_x;
			this.bg1.y = this.scroll_y;
			this.decor1.x = this.scroll_x;
			this.decor1.y = this.scroll_y;

			game.ball.mc.x = game.ball.x + this.scroll_x;
			game.ball.mc.y = game.ball.y + this.scroll_y;
			game.ball.shadow.x = game.ball.mc.x + MB2.Ball.SHADOW_DECAL;
			game.ball.shadow.y = game.ball.mc.y + MB2.Ball.SHADOW_DECAL;

			for (let d = 0; d < 4; d++) {
				const door = this.doors[d];
				door.x = door.sx + this.scroll_x;
				door.y = door.sy + this.scroll_y;
				const next = this.doors[d + 4];
				next.x = door.sx + this.scroll_x + this.scroll_dx * W;
				next.y = door.sy + this.scroll_y + this.scroll_dy * H;
			}
		}

		// ----- time counter -----

		/** Updates the texts of the counter (see the "time counter" symbol). */
		update() {
			const game = this.game;
			const tv = this.tview;
			const pad = MB2.Interf.padNumber;

			if (MB2.Manager.play_mode === Const.MODE_COURSE) {
				tv.lap = game.course_nturns - 1;
				// the chronometer is frozen during the counter animations, and 1.5 s after
				if (tv.frame !== 11) {
					this.old_time = 1.5;
					return;
				}
				if (this.old_time > 0) {
					this.old_time -= Std.deltaT;
					return;
				}
				tv.min = pad((game.curtime / 60) | 0, 2);
				tv.sec = pad((game.curtime | 0) % 60, 2);
				tv.mil = pad(((game.curtime * 100) | 0) % 100, 2);
			} else {
				const t = (game.curtime / 100) | 0;
				if (this.old_time !== t) {
					this.old_time = t;
					tv.txt = t;
				}
			}
		}
	};

	/** Formats hundredths of seconds as mm:ss:hh. */
	MB2.Interf.makeTime = function (t) {
		const pad = MB2.Interf.padNumber;
		t = Math.round(t);
		return pad((t / 6000) | 0, 2) + ":" + pad(((t / 100) | 0) % 60, 2) + ":" + pad(t % 100, 2);
	};

	MB2.Interf.padNumber = function (x, n) {
		x = "" + x;
		while (x.length < n)
			x = "0" + x;
		return x;
	};

})();
