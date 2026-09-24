/*
 * The current dungeon and room : builds the objects of a room from the level
 * data, and holds the collision table. Port of mb2/Level.as.
 *
 * Main fields :
 *   dungeon[x][y], pos_x / pos_y   the level data and the current room
 *   coltable[x][y]                 collision cells (see game/collide.js)
 *   objects    the bumpers of the room (solid items)
 *   bonus      the pastilles (collected by distance, see Game.main)
 *   updates    objects with an on_update(game, obj) called every frame
 *   dummies    temporary effects removed with the room
 *   bonus_reds red pastilles left : the doors open at 0
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Tools = MB2.Tools;
	const Std = MB2.Std;
	const Bumper = MB2.Bumper;
	const Room = MB2.Room;
	const Collide = () => MB2.Collide;

	/** Symbol, callback and bounce of each bumper type. `under` = drawn below the ball. */
	const BUMPER_DEFS = {
		[Bumper.NORMAL]: { symbol: "bnormal", hit: "bumper_normal_on_hit", coef: 1.5, min: 20 },
		[Bumper.TIME]: { symbol: "btime", hit: "bumper_time_on_hit", coef: 1.5, min: 15 },
		[Bumper.DEATH]: { symbol: "bdeath", hit: "bumper_death_on_hit", coef: 1.2, min: 5 },
		[Bumper.MAGNET]: { symbol: "bmagnet", hit: "bumper_magnet_on_hit", coef: 1.0, min: 5 },
		[Bumper.SHADOW]: { symbol: "bshadow", hit: "bumper_shadow_on_hit", coef: 3.0, min: 15 },
		[Bumper.WALL]: { symbol: "wall", hit: "wall_on_hit", coef: 1.2, min: 0 },
		[Bumper.TELEPORT]: { symbol: "bteleport", under: true },
		[Bumper.SWITCH]: { symbol: "interupt", hit: "interupt_on_hit", coef: 1.2, min: 0 },
		[Bumper.BLOCK_RED]: { symbol: "interred", coef: 1.2, min: 0, under: true },
		[Bumper.BLOCK_BLUE]: { symbol: "interblue", coef: 1.2, min: 0, under: true },
		[Bumper.ZAPPER]: { symbol: "zapper", hit: "zapper_on_hit", coef: 1.1, min: 10 }
	};

	/** Bumpers that have no shadow. */
	const NO_SHADE = [Bumper.SHADOW, Bumper.WALL, Bumper.TELEPORT, Bumper.BLOCK_RED, Bumper.BLOCK_BLUE];

	MB2.Level = class {

		constructor(game) {
			this.game = game;
			this.dmanager = game.dmanager;

			const data = MB2.Manager.level_data;
			this.data = data;
			this.width = data.width;
			this.height = data.height;
			this.start_x = data.start_x;
			this.start_y = data.start_y;
			this.dungeon = data.dungeon;
			this.pos_x = this.start_x;
			this.pos_y = this.start_y;

			this.exit = null;
			this.bonus = [];
			this.updates = [];
			this.objects = [];
			this.dummies = [];
			this.coltable = [];
			this.bonus_reds = 0;

			this.interf = new MB2.Interf(game);
		}

		/**
		 * Makes sure the current room exists : the Classique dungeon is generated
		 * column by column, and the position is kept inside the dungeon.
		 */
		prepare_room() {
			if (this.data.ensure)
				this.data.ensure(this.pos_x + 2);
			this.pos_x = Math.max(0, Math.min(this.width - 1, this.pos_x));
			this.pos_y = Math.max(0, Math.min(this.height - 1, this.pos_y));
		}

		/** Builds the current room. */
		init_room() {
			this.prepare_room();
			this.interf.init_room();

			this.bonus = [];
			this.updates = [];
			this.objects = [];
			this.dummies = [];

			// collision table : empty, with the border all around
			this.coltable = [];
			for (let x = 0; x < Const.LVL_CWIDTH; x++)
				this.coltable[x] = [];
			const border = Collide().border_collide;
			for (let x = 0; x < Const.BORDER_CSIZE; x++) {
				for (let y = 0; y < Const.LVL_CHEIGHT; y++) {
					this.coltable[x][y] = border;
					this.coltable[Const.LVL_CWIDTH - 1 - x][y] = border;
				}
			}
			for (let y = 0; y < Const.BORDER_CSIZE; y++) {
				for (let x = 0; x < Const.LVL_CWIDTH; x++) {
					this.coltable[x][y] = border;
					this.coltable[x][Const.LVL_CHEIGHT - 1 - y] = border;
				}
			}

			this.gen_room();
			return true;
		}

		gen_room() {
			const room = this.dungeon[this.pos_x][this.pos_y];
			room.visited = true;
			this.bonus_reds = 0;

			switch (room.rtype) {
			case Room.END:
				this.gen_boss_room(room);
				break;
			case Room.OBJECT_FOUND:
				this.gen_object_room(room.rdata);
				break;
			case Room.BONUS:
				this.gen_bonus_room(room.rdata);
				break;
			default:
				this.gen_normal_room(room.bdata || []);
				break;
			}

			this.interf.init_doors(0);
			if (this.bonus_reds === 0)
				this.interf.open_doors();
			this.interf.update_walls();
		}

		// ----- the kinds of rooms -----

		/** Boss room : holes in the corners, two death bumpers, and the boss (Collide.boss_room_on_update). */
		gen_boss_room() {
			// keeps the doors closed
			this.bonus_reds = 1;
			this.updates.push({ on_update: Collide().boss_room_on_update });

			const W = Const.LVL_CWIDTH;
			const H = Const.LVL_CHEIGHT;
			const B = Const.BORDER_CSIZE;
			for (const [x, y] of [[B + 1, H - 10], [B + 11, H - 10], [B + 1, H - 20], [W - 10, H - 10], [W - 20, H - 10], [W - 10, H - 20]])
				this.gen_bumper({ btype: Bumper.HOLE, x: x, y: y });

			this.objects.push(this.gen_bumper({ btype: Bumper.DEATH, x: 7, y: 7 }));
			this.objects.push(this.gen_bumper({ btype: Bumper.DEATH, x: W - 17, y: 7 }));
		}

		/** The fixed decoration of the object and bonus rooms. */
		gen_corner_bumpers() {
			const W = Const.LVL_CWIDTH;
			const H = Const.LVL_CHEIGHT;
			for (const [x, y] of [[7, 7], [W - 23, 7], [7, H - 23], [W - 23, H - 23]])
				this.objects.push(this.gen_bumper({ btype: Bumper.TIME, x: x, y: y }));
			for (const [x, y] of [[50, 30], [W - 62, 30], [50, H - 42], [W - 62, H - 42]])
				this.objects.push(this.gen_bumper({ btype: Bumper.NORMAL, x: x, y: y }));
		}

		/** A ball to collect, in the middle. `o` : MB2.DungeonObject, or 4 orange, 5 red (bonus balls). */
		gen_object_room(o) {
			const Ball = MB2.BallType;
			const BALL_OF_OBJECT = [Ball.GREEN, Ball.BLUE, Ball.METAL, Ball.VIOLET, Ball.ORANGE, Ball.RED];
			const ball = BALL_OF_OBJECT[o];

			if (ball !== undefined) {
				const clip = this.dmanager.attach("ballbox", Const.BONUS_PLAN);
				Tools.set_mcpos(clip, Tools.pos_center(clip));
				clip.ball.gotoAndStop(ball + 1);
				const obj = { on_update: Collide().ball_object_on_update, obj: ball, clip: clip };
				this.updates.push(obj);
				this.objects.push(obj);
			}
			this.gen_corner_bumpers();
		}

		/** An item box in the middle (the orange / red balls are object rooms). */
		gen_bonus_room(bonus) {
			const Bonus = MB2.DungeonBonus;
			const C = Collide();
			let item;
			let on_get_item;

			switch (bonus) {
			case Bonus.ORANGE:
				this.gen_object_room(4);
				return;
			case Bonus.RED:
				this.gen_object_room(5);
				return;
			case Bonus.MAP:
				item = 0;
				on_get_item = C.on_get_map;
				break;
			case Bonus.RADAR:
				item = 1;
				on_get_item = C.on_get_radar;
				break;
			case Bonus.KEY:
				item = 4;
				on_get_item = C.on_get_key;
				break;
			case Bonus.SMALL_TIME:
				item = 2;
				on_get_item = C.on_get_small_blue;
				break;
			case Bonus.BIG_TIME:
				item = 3;
				on_get_item = C.on_get_big_blue;
				break;
			}

			// (rdata is -1 once the item is taken)
			if (item !== undefined) {
				const clip = this.dmanager.attach("itembox", Const.BUMPER_PLAN);
				const box = { clip: clip, pos: Tools.pos_center(clip), hit_coef: 0.1, hit_min: 0 };
				this.fill_pos(box.pos, C.hitmap[7], box);
				Tools.set_mcpos(clip, box.pos);
				box.on_hit = C.item_box_on_hit;
				box.on_get_item = on_get_item;
				clip.item.gotoAndStop(item + 1);
				this.objects.push(box);
			}
			this.gen_corner_bumpers();
		}

		/** A room made with the editor / the generator. */
		gen_normal_room(items) {
			const C = Collide();
			for (const b of items) {
				switch (b.btype) {
				case Bumper.NONE:
					break;
				case Bumper.RED:
					this.bonus.push(this.gen_bonus("red", b, C.red_on_hit));
					this.bonus_reds++;
					break;
				case Bumper.BLUE:
					this.bonus.push(this.gen_bonus("blue", b, C.blue_on_hit));
					break;
				case Bumper.CLASSIC_EXIT:
					this.exit = this.gen_bonus("exit", b, C.classic_exit_on_hit);
					this.exit.clip.x += 2;
					this.exit.clip.y += 2;
					this.bonus.push(this.exit);
					this.exit.clip.stop();
					break;
				default:
					this.objects.push(this.gen_bumper(b));
					break;
				}
			}
			this.finalize_zappers();
		}

		// ----- items -----

		/**
		 * Creates a bumper from an item of the level data (b = { btype, x, y },
		 * the object itself becomes the collision object) and fills its cells.
		 * Holes only go in the walltable. Returns b, or null for holes.
		 */
		gen_bumper(b) {
			const C = Collide();
			const game = this.game;
			const def = BUMPER_DEFS[b.btype];

			if (b.btype === Bumper.HOLE) {
				this.interf.ground.visible = true;
				this.interf.fill_wall(b, b);
				return null;
			}
			if (!def)
				return null;

			let symbol = def.symbol;
			if (b.btype === Bumper.ZAPPER && MB2.Manager.play_mode === Const.MODE_COURSE)
				symbol = "checkpoint";

			b.on_hit = def.hit ? C[def.hit] : undefined;
			b.hit_coef = def.coef;
			b.hit_min = def.min;
			if (b.btype === Bumper.WALL)
				this.interf.fill_wall(b, b);
			// the pink blocks are solid when the switch is on, the blue ones when it is off
			if (b.btype === Bumper.BLOCK_RED)
				b.on_hit = C.interupt_flag ? C.interblock_on_hit : null;
			if (b.btype === Bumper.BLOCK_BLUE)
				b.on_hit = C.interupt_flag ? null : C.interblock_on_hit;

			const clip = this.dmanager.attach(symbol, def.under ? Const.SHADE_PLAN : Const.BUMPER_PLAN);
			this.fill_pos(b, C.hitmap[b.btype - 1], b);
			Tools.set_mcpos(clip, b);
			b.clip = clip;

			if (NO_SHADE.indexOf(b.btype) < 0) {
				b.shade = this.dmanager.attach("ombre", Const.SHADE_PLAN);
				b.shade.x = clip.x;
				b.shade.y = clip.y;
				b.shade.gotoAndStop(b.btype);
			}

			switch (b.btype) {
			case Bumper.MAGNET:
				b.way = true;   // attracting
				clip.gotoAndPlay("plus");
				b.on_update = C.bumper_magnet_on_update;
				this.updates.push(b);
				break;

			case Bumper.SHADOW:
				clip.visible = false;
				clip.alpha = 0;
				b.alpha = 0;
				b.on_update = C.bumper_shadow_on_update;
				this.updates.push(b);
				break;

			case Bumper.TIME:
				b.on_update = C.bumper_time_on_update;
				b.curtime = game.curtime;
				b.on_update(game, b);
				this.updates.push(b);
				break;

			case Bumper.TELEPORT:
				b.on_update = C.bumper_teleport_on_update;
				this.updates.push(b);
				break;

			case Bumper.SWITCH:
			case Bumper.BLOCK_BLUE:
				clip.gotoAndStop(C.interupt_flag ? "on" : "off");
				break;

			case Bumper.BLOCK_RED:
				clip.gotoAndStop(C.interupt_flag ? "off" : "on");
				break;

			case Bumper.ZAPPER: {
				// the phase (colour) of a zapper depends on its position
				const s = Tools.mc_size(clip);
				if (MB2.Manager.play_mode === Const.MODE_COURSE) {
					b.phase = 0;
				} else {
					b.phase = ((b.x - s.w / 2) + (b.y - s.h / 2)) % 7;
					if (b.phase < 0)
						b.phase += 7;
					clip.gotoAndStop(1 + b.phase);
				}
				break;
			}
			}
			return b;
		}

		/** A pastille / the hatch (collected by distance, not by collision). */
		gen_bonus(symbol, b, on_hit) {
			const clip = this.dmanager.attach(symbol, Const.BONUS_PLAN);
			Tools.set_mcpos(clip, b);
			b.bname = symbol;
			b.clip = clip;
			b.on_hit = on_hit;
			return b;
		}

		// ----- zappers -----

		/** Links all the zappers of the same phase two by two with a laser line. */
		finalize_zappers() {
			const byPhase = [];
			let sx, sy;
			for (const b of this.objects) {
				if (!b || b.btype !== Bumper.ZAPPER)
					continue;
				if (!byPhase[b.phase]) {
					byPhase[b.phase] = [];
					if (sx === undefined) {
						const s = Tools.mc_size(b.clip);
						sx = s.w / 2;
						sy = s.h / 2;
					}
				}
				byPhase[b.phase].push(b);
			}

			this.zap_lines = [];
			for (const zaps of byPhase) {
				if (!zaps)
					continue;
				for (let j = 0; j < zaps.length; j++)
					for (let k = j + 1; k < zaps.length; k++)
						this.trace_zappers(zaps[j], zaps[k], sx, sy);
			}

			// display of the lines (an addition of the port)
			if (this.zap_lines.length) {
				const clip = this.dmanager.attach("zaplines", Const.SHADE_PLAN);
				clip.lines = this.zap_lines;
				this.dummies.push({ clip: clip });
			}
		}

		/** Fills the cells between two zappers with a line object (sx / sy = offset to their center). */
		trace_zappers(z1, z2, sx, sy) {
			const line = {
				phase: z1.phase,
				on_hit: Collide().zapper_line_on_hit,
				is_event: true,
				z1: z1,
				z2: z2
			};
			this.zap_lines.push(line);

			let dx = z2.x - z1.x;
			let dy = z2.y - z1.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			dx /= d;
			dy /= d;
			let x = z1.x + sx;
			let y = z1.y + sy;
			const len = (d | 0) + 1;
			for (let l = 0; l < len; l++) {
				const column = this.coltable[x | 0];
				if (column)
					column[y | 0] = line;
				x += dx;
				y += dy;
			}
		}

		// ----- collision table -----

		/** Sets the cells of `map` (a hitmap) at cell position p to v. */
		fill_pos(p, map, v) {
			if (!map)
				return;
			for (let x = 0; x < map.length; x++) {
				const column = this.coltable[x + p.x];
				if (!column)
					continue;
				for (let y = 0; y < map[0].length; y++)
					if (map[x][y])
						column[y + p.y] = v;
			}
		}

		/** Clears the cells occupied by b. */
		erase_pos(b) {
			const size = Tools.mc_size(b.clip);
			for (let x = b.x; x < b.x + size.w; x++)
				for (let y = b.y; y < b.y + size.h; y++)
					if (this.coltable[x] && this.coltable[x][y] === b)
						this.coltable[x][y] = null;
		}

		free_pos(px, py, size) {
			for (let x = 0; x < size.w; x++)
				for (let y = 0; y < size.h; y++)
					if (this.coltable[x + px][y + py])
						return false;
			return true;
		}

		/**
		 * The cells of the door d : `delta` extends the door by some cells on both
		 * sides. Doors are set to null (open), or to a border / door object.
		 */
		set_door_collide(d, value, delta) {
			delta = delta || 0;
			const ct = this.coltable;
			const W = Const.LVL_CWIDTH;
			const H = Const.LVL_CHEIGHT;

			for (let a = 0; a < Const.BORDER_CSIZE; a++) {
				for (let b = -delta; b < Const.DOOR_CSIZE + delta; b++) {
					switch (d) {
					case 0:
						ct[a][b + Const.DOOR_CYPOS] = value;
						break;
					case 1:
						ct[W - 1 - a][b + Const.DOOR_CYPOS] = value;
						break;
					case 2:
						ct[b + Const.DOOR_CXPOS][a] = value;
						break;
					case 3:
						ct[b + Const.DOOR_CXPOS][H - 1 - a] = value;
						break;
					}
				}
			}
		}

		/**
		 * Collision test of the ball at (x, y) : see game/collide.js.
		 * With side_effects = false, only tells if the position is free (used to
		 * unstick the ball). Returns true when the ball bounced / is blocked.
		 */
		col_test(x, y, side_effects) {
			const game = this.game;
			const STEPS = 16;
			let firstCol = 0;
			let nCol = 0;
			let total = 0;
			let hitCoef = 0;
			let hitMin = 0;
			let first = null;
			let fpx = 0;
			let fpy = 0;
			const inAngle = Math.atan2(game.ball.sy, game.ball.sx);

			for (let i = 0; i < STEPS; i++) {
				const a = (Math.PI * 2) * i / STEPS;
				const px = ((x + Math.cos(a) * Const.BALL_RAYSIZE + Const.DELTA / 2) / Const.DELTA) | 0;
				const py = ((y + Math.sin(a) * Const.BALL_RAYSIZE + Const.DELTA / 2) / Const.DELTA) | 0;
				const column = this.coltable[px];
				const ct = column ? column[py] : undefined;
				if (!ct || !ct.on_hit)
					continue;

				if (ct.is_event) {
					if (side_effects)
						ct.on_hit(game, ct, px, py);
					continue;
				}
				if (!side_effects)
					return true;

				hitCoef = Math.max(ct.hit_coef, hitCoef);
				hitMin = Math.max(ct.hit_min, hitMin);
				if (nCol === 0) {
					firstCol = i;
					first = ct;
					fpx = px;
					fpy = py;
				} else {
					// (the first object is called again for each other hit point, like the original)
					first.on_hit(game, first, fpx, fpy);
					ct.on_hit(game, ct, px, py);
					// angular distance to the first hit point, in ]-8, 8]
					if (i - firstCol < STEPS / 2)
						total += i - firstCol;
					else
						total += i - STEPS - firstCol;
				}
				nCol++;
			}

			// a single hit point is ignored (grazing)
			if (nCol <= 1)
				return false;

			// average direction of the hit points = normal of the collision
			total = total / nCol + firstCol;
			if (total < 0)
				total += STEPS;
			const normal = (Math.PI * 2) * total / STEPS - Math.PI;

			let speed = game.ball.speed * hitCoef;
			if (speed < hitMin)
				speed = hitMin;
			const outAngle = normal + Math.PI - (inAngle - normal) + Math.random() / 100;

			// only bounce when the ball goes toward the obstacle
			if (Math.abs(Tools.rad_dif(inAngle, normal)) <= Math.PI / 2 + 0.05)
				return false;

			game.ball.sx = speed * Math.cos(outAngle);
			game.ball.sy = speed * Math.sin(outAngle);
			// push the ball out, more when the contact is large
			const push = Std.tmod * Math.min(nCol * nCol / 10, 3);
			game.ball.x += Math.cos(outAngle) * push;
			game.ball.y += Math.sin(outAngle) * push;
			return true;
		}

		// ----- leaving the room -----

		/** Removes everything of the current room (the room data is kept). */
		clean_room() {
			for (const o of this.objects) {
				if (!o)
					continue;
				if (o.clip)
					o.clip.removeMovieClip();
				if (o.shade)
					o.shade.removeMovieClip();
			}
			for (const b of this.bonus)
				if (b && b.clip)
					b.clip.removeMovieClip();
			for (const d of this.dummies)
				if (d && d.clip)
					d.clip.removeMovieClip();
			if (this.exit)
				this.exit.clip.removeMovieClip();
			this.exit = null;
			this.interf.holes.rects = [];
			this.interf.shades.ops = [];
			this.interf.ground.visible = false;
		}

		change_room(dx, dy) {
			this.clean_room();
			this.interf.change_room(dx, dy);
		}
	};

})();
