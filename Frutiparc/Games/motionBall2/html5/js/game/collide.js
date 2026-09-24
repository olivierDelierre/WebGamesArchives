/*
 * Collisions and item behaviours. Port of mb2/Collide.as.
 *
 * HOW COLLISIONS WORK
 *
 * The room is a grid of 152 x 102 cells of 4 x 4 pixels : Level.coltable.
 * Each cell is empty, or points to the object occupying it :
 *   { on_hit(game, obj, px, py), hit_coef, hit_min, is_event, ... }
 * Bumpers fill the cells of their shape (a "hitmap", see init), the border
 * fills the cells around the room, doors fill the border cells of their side.
 *
 * Every frame, Level.col_test samples 16 points on the circle of the ball :
 * - cells holding an `is_event` object only trigger their on_hit (the zapper
 *   lines : they don't block the ball) ;
 * - when 2 points or more hit solid cells, the ball bounces : the average
 *   direction of the hit points gives the normal of the collision, and the
 *   new speed is the ball speed x hit_coef (at least hit_min).
 * The on_hit callbacks give the effect of the object (sound, animation, time
 * bonus, death...).
 *
 * The *_on_update functions are called every frame for the objects of
 * Level.updates (magnets, clocks, teleports...).
 *
 * The names are those of the original code, to compare it easily.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Tools = MB2.Tools;
	const Std = MB2.Std;
	const Sound = MB2.Sound;
	const Ball = MB2.BallType;
	const Bumper = MB2.Bumper;

	const isMode = mode => MB2.Manager.play_mode === mode;

	const Collide = MB2.Collide = {

		game: null,
		hitmap: null,                    // hitmap[btype - 1] = table[x][y] of booleans
		border_collide: null,            // the border : pushes the ball back into the room
		border_collide_no_recal: null,   // the border around open doors : no push back
		frame_nb: 0,                     // incremented every frame by the Manager
		interupt_flag: false,            // state of the pink / blue switches

		init(game) {
			Collide.game = game;

			// The original computed the hitmaps with hitTest on the symbols ; the port
			// uses the tables of mb2gen/bumpers.txt, and circles for the missing ones.
			const H = MB2.BUMPER_HITMAPS;
			const hm = [];
			hm[Bumper.NORMAL - 1] = H[0];
			hm[Bumper.TIME - 1] = H[1];
			hm[Bumper.DEATH - 1] = H[2];
			hm[Bumper.MAGNET - 1] = H[3];
			hm[Bumper.SHADOW - 1] = H[4];
			hm[Bumper.WALL - 1] = H[5];
			hm[Bumper.HOLE - 1] = H[5];
			hm[7] = Collide.circle_hitmap(12, 22);                  // item box
			hm[Bumper.SWITCH - 1] = Collide.circle_hitmap(8, 15);
			hm[Bumper.BLOCK_RED - 1] = H[5];
			hm[Bumper.BLOCK_BLUE - 1] = H[5];
			hm[Bumper.ZAPPER - 1] = Collide.circle_hitmap(8, 14);
			Collide.hitmap = hm;

			Collide.interupt_flag = false;

			Collide.border_collide = {
				on_hit: Collide.border_on_hit,
				is_border: true,
				hit_min: 4,
				hit_coef: 1.1
			};
			Collide.border_collide_no_recal = {
				on_hit: Collide.border_on_hit_no_recal,
				is_border: true,
				hit_min: 4,
				hit_coef: 1.1
			};
		},

		/** The hitmap of a round symbol : n x n cells, inside a circle of `ray` pixels. */
		circle_hitmap(n, ray) {
			const table = [];
			const offset = Const.DELTA / 2 - (n / 2) * Const.DELTA;
			for (let x = 0; x < n; x++) {
				table[x] = [];
				for (let y = 0; y < n; y++) {
					const px = x * Const.DELTA + offset;
					const py = y * Const.DELTA + offset;
					table[x][y] = px * px + py * py <= ray * ray;
				}
			}
			return table;
		},


		// ----- items of the item boxes -----

		on_get_map(game) {
			game.options.has_map = true;
			game.setPause();
		},

		on_get_radar(game) {
			game.options.has_radar = true;
			game.setPause(true);
		},

		on_get_key(game) {
			game.options.grelot_count += 3;
			game.options.update_icons();
		},

		on_get_small_blue(game) {
			if (!isMode(Const.MODE_COURSE))
				game.curtime += 60 * 1000;
		},

		on_get_big_blue(game) {
			if (!isMode(Const.MODE_COURSE))
				game.curtime += 3 * 60 * 1000;
		},


		// ----- walls -----

		/** A spark at the collision cell. */
		gen_hit(game, px, py) {
			const hit = game.dmanager.attach("hit", Const.DUMMY_PLAN);
			hit.x = px * Const.DELTA + Const.DELTA / 2;
			hit.y = py * Const.DELTA + Const.DELTA / 2;
			// (sic : sy twice in the original)
			hit.rotation = Math.atan2(game.ball.sy, game.ball.sy) * 180 / Math.PI;
		},

		/** The border : also puts the ball back inside the room if it went through. */
		border_on_hit(game, mc, px, py) {
			Collide.gen_hit(game, px, py);
			let size = Const.BORDER_SIZE + Const.DELTA;
			if (game.ball.x < size)
				game.ball.x = size;
			if (game.ball.y < size)
				game.ball.y = size;

			size += Const.DELTA * 2;
			if (game.ball.x > Const.LVL_WIDTH - size)
				game.ball.x = Const.LVL_WIDTH - size;
			if (game.ball.y > Const.LVL_HEIGHT - size)
				game.ball.y = Const.LVL_HEIGHT - size;
			Sound.play(Sound.WALL_HIT);
		},

		border_on_hit_no_recal(game, mc, px, py) {
			Collide.gen_hit(game, px, py);
			Sound.play(Sound.WALL_HIT);
		},

		/** A closed door : a key (grelot) opens it, else it is a wall. */
		door_on_hit(game, mc, px, py) {
			const room = game.level.dungeon[game.level.pos_x][game.level.pos_y];
			if (game.options.grelot_count > 0 && room.paths[mc.d].ptype !== MB2.Path.OPEN) {
				game.options.grelot_count--;
				game.options.update_icons();
				Sound.play(Sound.GRELOT);
				game.level.interf.open_door(mc.d);
			} else
				Collide.border_on_hit(game, mc, px, py);
		},

		/** Green block : destroyed by the green ball (4 debris fly away). */
		wall_on_hit(game, mc, px, py) {
			if (game.ball.btype !== Ball.GREEN) {
				Sound.play(Sound.GREEN_BLOCK_HIT);
				Collide.gen_hit(game, px, py);
				return;
			}
			if (mc.btype === Bumper.NONE)
				return;

			Sound.play(Sound.GREEN_BLOCK_DESTROY);
			game.level.erase_pos(mc);
			game.level.interf.fill_wall(mc, null);
			game.level.interf.update_walls();
			if (mc.shade)
				mc.shade.removeMovieClip();
			mc.clip.removeMovieClip();
			// remembered to rebuild the block at the next lap of a course
			mc.old_btype = mc.btype;
			mc.btype = Bumper.NONE;

			const ballAngle = Math.atan2(game.ball.sy, game.ball.sx);
			const ballSpeed = game.ball.speed;
			for (let i = 0; i < 4; i++) {
				const speed = (Math.random() * (ballSpeed / 2) + ballSpeed / 2) / 4 + 1;
				const angle = (Math.random() - 0.5) + ballAngle;
				const p = {
					clip: game.dmanager.attach("wallpart", Const.DUMMY_PLAN),
					x: random(10 * Const.DELTA) + mc.x * Const.DELTA,
					y: random(10 * Const.DELTA) + mc.y * Const.DELTA,
					rspeed: speed,
					sx: Math.cos(angle) * speed,
					sy: Math.sin(angle) * speed,
					on_update: Collide.wall_dummy_on_update,
					stime: 50,
					time: 30
				};
				p.clip.rotation = random(360);
				game.level.updates.push(p);
				game.level.dummies.push(p);
			}
		},

		wall_dummy_on_update(game, mc) {
			const tmod = Std.tmod;
			mc.x += mc.sx;
			mc.y += mc.sy;
			mc.clip.x = mc.x;
			mc.clip.y = mc.y;
			mc.clip.xscale = mc.time * 200 / mc.stime;
			mc.clip.yscale = mc.time * 200 / mc.stime;
			mc.clip.rotation += 5 * tmod;
			mc.time -= tmod;
			if (mc.time < 0) {
				MB2.removeFrom(game.level.updates, mc);
				MB2.removeFrom(game.level.dummies, mc);
				mc.clip.removeMovieClip();
			}
		},


		// ----- pastilles and item boxes -----

		item_box_on_hit(game, mc, px, py) {
			if (mc.item === -1)
				return;
			Sound.play(Sound.GET_ITEM);
			Collide.gen_hit(game, px, py);
			game.level.fill_pos(mc.pos, Collide.hitmap[7], null);
			mc.clip.gotoAndPlay("hit");
			// the item is taken for good (not shown on the radar anymore)
			game.level.dungeon[game.level.pos_x][game.level.pos_y].rdata = -1;
			mc.on_get_item(game);
			mc.item = -1;
			game.options.update_icons();
		},

		/** Red pastille : the doors open when the last one is taken. Returns true = taken. */
		red_on_hit(game, mc) {
			game.level.bonus_reds--;
			if (game.level.bonus_reds === 0) {
				game.level.interf.open_doors();
				Sound.play(Sound.OPEN_DOOR);
			}
			mc.clip.gotoAndPlay("hit");
			Sound.play(Sound.GET_RED);
			return true;
		},

		/** Time pastille. */
		blue_on_hit(game, mc) {
			if (isMode(Const.MODE_COURSE))
				game.curtime -= 1;            // (Course : curtime is in seconds)
			else if (isMode(Const.MODE_CLASSIC))
				game.curtime += 2 * 1000;
			else
				game.curtime += 10 * 1000;
			mc.clip.gotoAndPlay("hit");
			Sound.play(Sound.GET_BLUE);
			return true;
		},

		/** The Classique hatch, once open : the ball falls in (see Ball.update_hole). */
		classic_exit_on_hit(game, mc) {
			if (!mc.clip.flOpen)
				return false;

			const cx = mc.clip.x;
			const cy = mc.clip.y;
			game.ball.classic_mask = { x: cx, y: cy };
			game.ball.mc.mask = ctx => {
				ctx.beginPath();
				ctx.arc(cx, cy, 16, 0, Math.PI * 2);
				ctx.clip();
			};
			game.ball.hole_death_speed = 3;
			game.ball.death_hit = false;
			game.ball.hole_death = true;
			game.ball.shadow.visible = false;
			return true;
		},


		// ----- bumpers -----

		bumper_normal_on_hit(game, mc) {
			if (mc.clip.frame === 1) {
				mc.clip.gotoAndPlay("hit");
				Sound.play(Sound.BUMPER_NORMAL);
			}
		},

		/** Clock bumper : costs 5 seconds (adds 5 seconds to the chronometer in Course mode). */
		bumper_time_on_hit(game, mc) {
			if (mc.clip.frame !== 1)
				return;
			mc.clip.gotoAndPlay("hit");
			Sound.play(Sound.BUMPER_TIME);
			if (isMode(Const.MODE_COURSE))
				game.curtime += 5;
			else
				game.curtime -= 5000;
		},

		/** The clock hands follow the remaining time, smoothly. */
		bumper_time_on_update(game, mc) {
			mc.curtime = mc.curtime * 0.95 + game.curtime * 0.05;
			mc.clip.aig.rotation = -(mc.curtime / 3600);
			mc.clip.aig2.rotation = -(mc.curtime % 3600) / 10;
		},

		/** Kills the ball, unless it is the metal one or it is blinking after a death. */
		bumper_death_on_hit(game, mc) {
			if (game.ball.btype !== Ball.METAL && game.ball.clign_count <= 0) {
				Sound.play(Sound.BUMPER_DEATH);
				mc.clip.gotoAndPlay("hit");
				game.ball.die();
			} else
				Sound.play(Sound.BUMPER_DEATH_PROTECT);
		},

		/** A hit magnet repels the ball for a while. */
		bumper_magnet_on_hit(game, mc) {
			if (mc.way) {
				mc.way = false;
				Sound.play(Sound.BUMPER_MAGNET);
				mc.clip.gotoAndPlay("neg");
			}
		},

		/** Attracts (or repels) the ball within ~170 pixels. Ignores the metal ball. */
		bumper_magnet_on_update(game, mc) {
			if (game.ball.btype === Ball.METAL)
				return;
			const tmod = Std.tmod;
			const d = Tools.dist2(game.ball.mc, mc.clip);
			if (d < 30000) {
				const way = mc.way ? 1 : -1;
				const dx = (mc.clip.x - game.ball.mc.x) / d;
				const dy = (mc.clip.y - game.ball.mc.y) / d;
				game.ball.sx += way * dx * 30 * tmod;
				game.ball.sy += way * dy * 30 * tmod;
			}
			// back to attracting, at random (~ every 25 seconds)
			if (mc.way === false && random(1000 / Std.tmod) === 0) {
				mc.way = true;
				mc.clip.gotoAndPlay("plus");
			}
		},

		/** Invisible bumper : shows up when hit (except for the violet ball, which always sees it). */
		bumper_shadow_on_hit(game, mc) {
			if (mc.clip.frame !== 1)
				return;
			Sound.play(Sound.BUMPER_SHADOW);
			mc.clip.gotoAndPlay("hit");
			if (game.ball.btype !== Ball.VIOLET) {
				mc.alpha = 100;
				mc.clip.alpha = 100;
				mc.clip.visible = true;
			}
		},

		/** The violet ball sees the invisible bumpers when close ; else they fade out. */
		bumper_shadow_on_update(game, mc) {
			const tmod = Std.tmod;
			if (game.ball.btype === Ball.VIOLET) {
				const d = Tools.dist2(game.ball.mc, mc.clip);
				mc.alpha = Math.max(0, Math.min(100, (200000 / d) | 0));
				mc.clip.visible = mc.alpha > 0;
				mc.clip.alpha = mc.alpha;
			} else if (mc.alpha > 0) {
				mc.alpha -= tmod * 4;
				if (mc.alpha <= 0) {
					mc.alpha = 0;
					mc.clip.visible = false;
				}
				mc.clip.alpha = mc.alpha;
			}
		},


		// ----- zappers -----

		zapper_on_hit(game, mc, px, py) {
			Sound.play(Sound.ZAPPER_HIT);
			Collide.gen_hit(game, px, py);
		},

		/**
		 * The line between two zappers of the same phase (an `is_event` object).
		 * Kills a ball of another colour. In Course mode, it counts a lap.
		 */
		zapper_line_on_hit(game, mc, px, py) {
			if (isMode(Const.MODE_COURSE)) {
				game.course_turn_done();
				return;
			}
			if (game.ball.btype === mc.phase)
				return;

			const flash = game.dmanager.attach("flashLine", Const.DUMMY_PLAN);
			flash.x = mc.z1.clip.x;
			flash.y = mc.z1.clip.y;
			flash.gfx.gotoAndStop(mc.phase + 1);
			const dx = mc.z2.clip.x - mc.z1.clip.x;
			const dy = mc.z2.clip.y - mc.z1.clip.y;
			flash.xscale = Math.sqrt(dx * dx + dy * dy);
			flash.rotation = Math.atan2(dy, dx) / (Math.PI / 180);

			Sound.play(Sound.ZAPPER_ACTIVATE);
			game.ball.die();
		},


		// ----- switch and pink / blue blocks -----

		interblock_on_hit(game, mc, px, py) {
			Sound.play(Sound.INTER_BLOCK_HIT);
			Collide.gen_hit(game, px, py);
		},

		/**
		 * The switch toggles all the pink / blue blocks of the room : pink blocks
		 * are solid when the flag is on, blue blocks when it is off.
		 * (At most once every 20 frames, the ball touches it several frames in a row.)
		 */
		interupt_on_hit(game, mc, px, py) {
			if (mc.last_frame_hit != null && mc.last_frame_hit >= Collide.frame_nb - 20)
				return;
			mc.last_frame_hit = Collide.frame_nb;
			Sound.play(Sound.INTERUPT_HIT);
			Collide.gen_hit(game, px, py);

			Collide.interupt_flag = !Collide.interupt_flag;
			const on = Collide.interupt_flag;

			for (const b of game.level.objects) {
				if (!b)
					continue;
				switch (b.btype) {
				case Bumper.SWITCH:
					b.clip.gotoAndPlay(on ? "playOn" : "playOff");
					break;
				case Bumper.BLOCK_BLUE:
					b.clip.gotoAndPlay(on ? "playOn" : "playOff");
					b.on_hit = on ? null : Collide.interblock_on_hit;
					break;
				case Bumper.BLOCK_RED:
					b.clip.gotoAndPlay(on ? "playOff" : "playOn");
					b.on_hit = on ? Collide.interblock_on_hit : null;
					break;
				}
			}
		},


		// ----- teleports -----

		/** Animates the circles, and sends the ball to the other teleport of the room. */
		bumper_teleport_on_update(game, mc) {
			const d = Math.sqrt(Tools.dist2(mc.clip, game.ball.mc)) + 0.1;

			for (let i = 0; i < mc.clip.num; i++) {
				const circle = mc.clip["c" + i];
				circle.rotation += circle.rot * Std.tmod * (1 + (60 / d));
				circle.c += Std.tmod * (20 + (200 / d));
				const a = circle.c / 100;
				circle.xscale = 100 + Math.cos(a) * 50;
				circle.yscale = 100 + Math.sin(a) * 50;
			}

			if (d >= Const.BALL_RAYSIZE) {
				mc.teleport = false;
				return;
			}
			// `teleport` is set on both ends so the ball doesn't bounce back and forth
			if (mc.teleport)
				return;
			const other = game.level.updates.find(u => u.btype === Bumper.TELEPORT && u !== mc);
			if (!other)
				return;
			mc.teleport = true;
			other.teleport = true;
			game.ball.x = other.clip.x;
			game.ball.y = other.clip.y;
			game.ball.mc.x = game.ball.x;
			game.ball.mc.y = game.ball.y;
		},


		// ----- balls to collect -----

		/** Takes the ball of an object room : it becomes available and selected. */
		ball_object_on_update(game, mc) {
			const d = Math.sqrt(Tools.dist2(mc.clip, game.ball.mc));
			if (d >= Const.BALL_RAYSIZE * 3)
				return;

			MB2.removeFrom(game.level.updates, mc);
			mc.clip.gotoAndPlay("hit");
			Sound.play(Sound.GET_BALL);

			const o = game.options;
			o.ball_types_chk -= o.ball_types[mc.obj];
			o.ball_types[mc.obj] = 1;
			o.ball_types_chk++;
			game.ball.btype = mc.obj;
			o.update_icons();
			game.ball.update_skin();

			// the first time a ball colour is found, the music gets richer
			if (!o.ball_flags[mc.obj]) {
				o.ball_flags[mc.obj] = true;
				Sound.nextMix();
			}
		},


		// ----- special rooms -----

		/**
		 * Boss room : when the ball is fully inside, the doors close and the boss
		 * appears (the tutorial ends here).
		 */
		boss_room_on_update(game, mc) {
			const sz = Const.BORDER_SIZE + Const.BALL_RAYSIZE;
			const ball = game.ball;
			if (!(ball.x > sz && ball.y > sz && ball.x < Const.LVL_WIDTH - sz && ball.y < Const.LVL_HEIGHT - sz))
				return;

			MB2.removeFrom(game.level.updates, mc);
			const room = game.level.dungeon[game.level.pos_x][game.level.pos_y];
			for (let d = 0; d < 4; d++) {
				if (room.paths[d].ptype === MB2.Path.OPEN) {
					game.level.interf.doors[d].gotoAndStop("off");
					game.level.set_door_collide(d, Collide.border_collide);
				}
			}
			ball.start_x = Const.LVL_WIDTH / 2;
			ball.start_y = Const.LVL_HEIGHT / 2;

			if (isMode(Const.MODE_AIDE)) {
				Sound.fadeMix(Sound.MUSIC_MENU);
				MB2.Manager.gameOver(true);
				return;
			}

			Sound.fadeMix(Sound.MUSIC_BOSS);
			let boss;
			if (isMode(Const.MODE_AVENTURE))
				boss = (MB2.Manager.play_mode_param === 4) ? new MB2.BossTB(game) : new MB2.BossSerpent(game);
			else
				boss = new MB2.Boss(game);
			game.boss_update = boss;
		},

		/**
		 * One-way door : closes behind the ball once it is inside the room.
		 * In Course mode, crossing a "validating" one-way door allows the next
		 * checkpoint to count a lap.
		 */
		autoclose_door_on_update(game, mc) {
			const sz = Const.BORDER_SIZE + Const.BALL_RAYSIZE;
			const ball = game.ball;
			if (!(ball.x > sz && ball.y > sz && ball.x < Const.LVL_WIDTH - sz && ball.y < Const.LVL_HEIGHT - sz))
				return;

			MB2.removeFrom(game.level.updates, mc);
			game.level.interf.doors[mc.d].gotoAndStop("off");
			game.level.set_door_collide(mc.d, Collide.border_collide);
			if (mc.validate)
				game.course_validated = true;
		}
	};

})();
