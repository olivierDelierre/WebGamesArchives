/*
 * A game : the main loop of a play session. Port of mb2/Game.as.
 *
 * The Game is a "mode" of the Manager (see app/manager.js) : it has main()
 * (one logic frame), tick() (advances the animations), draw(ctx) and destroy().
 *
 * curtime is the remaining time in milliseconds, except in Course mode where
 * it is the chronometer, in seconds.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;
	const Key = MB2.Key;
	const Sound = MB2.Sound;
	const Path = MB2.Path;

	MB2.Game = class {

		constructor() {
			const mode = MB2.Manager.play_mode;

			this.dmanager = new MB2.DepthManager();
			this.can_loose = true;
			this.course_validated = false;
			this.course_nturns = 0;
			this.scroll_on = false;
			this.pause = null;
			this.boss_update = null;
			this.game_over_flag = false;
			this.pause_key_flag = false;
			this.space_key_flag = false;

			MB2.Collide.init(this);
			this.level = new MB2.Level(this);
			this.ball = new MB2.Ball(this);

			switch (mode) {
			case Const.MODE_CLASSIC:
				this.curtime = Const.TIME_CLASSIC;
				this.options = new MB2.Options(this, 1);
				this.level.pos_x = 0;
				this.level.pos_y = random(this.level.height);
				break;
			case Const.MODE_AIDE:
				this.curtime = Const.TIME_CHALLENGE;
				this.options = new MB2.Options(this, 3);
				break;
			case Const.MODE_COURSE:
				this.course_nturns = 3;
				this.curtime = 0;
				this.options = new MB2.Options(this, 1);
				break;
			case Const.MODE_AVENTURE:
				this.curtime = Const.TIME_CHALLENGE * 1.2;
				this.options = new MB2.Options(this, 5);
				break;
			default:
				this.curtime = Const.TIME_CHALLENGE;
				this.options = new MB2.Options(this, 3);
				break;
			}

			this.ball.update_skin();
			this.options.update_icons();
			this.next_room();
			Sound.startMix();
		}

		/**
		 * Score of the game :
		 *   Classique  the level reached
		 *   Course     the time, in hundredths of seconds
		 *   others     percentage of rooms visited - 1, + the remaining time (in
		 *              tenths of seconds, rounded to 100) when the boss is beaten
		 *              (GameOver.onScore splits it back)
		 */
		calcScore(cause) {
			const mode = MB2.Manager.play_mode;
			if (mode === Const.MODE_CLASSIC)
				return this.level.pos_x + 1;
			if (mode === Const.MODE_COURSE)
				return (this.curtime * 100) | 0;

			let rooms = 0;
			let visited = 0;
			for (let x = 0; x < this.level.width; x++) {
				for (let y = 0; y < this.level.height; y++) {
					const r = this.level.dungeon[x][y];
					if (r.rtype !== MB2.Room.NONE)
						rooms++;
					if (r.visited)
						visited++;
				}
			}
			let score = ((visited * 100 / rooms) | 0) - 1;
			if (cause === Const.CAUSE_WINS)
				score += ((this.curtime / 100) | 0) * 100;
			return score;
		}

		/**
		 * Course mode : a checkpoint line was crossed. It counts as a lap only after
		 * a validating one-way door. Then all the other rooms are reset (doors
		 * closed, destroyed blocks back).
		 */
		course_turn_done() {
			if (!this.course_validated)
				return;
			this.level.interf.tview.play();
			this.course_nturns--;
			if (this.course_nturns === 0)
				this.gameOver(Const.CAUSE_WINS);
			this.course_validated = false;

			for (let x = 0; x < this.level.width; x++) {
				for (let y = 0; y < this.level.height; y++) {
					if (x === this.level.pos_x && y === this.level.pos_y)
						continue;
					const r = this.level.dungeon[x][y];
					r.visited = false;
					if (r.paths) {
						for (const p of r.paths)
							if (p.ptype === Path.OPEN)
								p.ptype = Path.DOOR;
					}
					if (r.bdata) {
						for (const b of r.bdata)
							if (b.old_btype)
								b.btype = b.old_btype;
					}
				}
			}
		}

		/** Builds the current room (at the start and after each scrolling). */
		next_room() {
			this.level.init_room();
			this.ball.sx /= 3;
			this.ball.sy /= 3;
			this.ball.speed /= 3;
			// the ball comes back here when it dies
			this.ball.start_x = this.ball.x;
			this.ball.start_y = this.ball.y;
			this.level.interf.tview.niv = this.level.pos_x + 1;
		}

		gameOver(cause) {
			if (cause !== Const.CAUSE_WINS && !this.can_loose)
				return;
			if (this.game_over_flag)
				return;
			this.game_over_flag = true;
			MB2.Manager.gameOver(cause);
		}

		/** Can the ball leave the room through this exit ? */
		is_door_opened(path) {
			switch (path.ptype) {
			case Path.OPEN:
			case Path.ONE_WAY:
			case Path.INVISIBLE:
				return true;
			case Path.SPECIAL:
				return MB2.Manager.play_mode !== Const.MODE_CHALLENGE;
			default:
				return false;
			}
		}

		/** One logic frame. */
		main() {
			const mode = MB2.Manager.play_mode;

			if (this.game_over_flag)
				return;
			if (this.scroll_on) {
				this.level.interf.scroll_room();
				return;
			}
			if (this.pause != null) {
				this.pause.main();
				return;
			}

			this.update_time();
			this.level.interf.update();
			this.ball.update_jump();

			for (let i = 0; i < this.level.updates.length; i++) {
				const u = this.level.updates[i];
				u.on_update(this, u);
			}
			if (this.game_over_flag)
				return;

			// while the ball falls / dies, only the boss moves
			if (this.ball.update_hole()) {
				if (this.boss_update)
					this.boss_update.on_update(this, this.boss_update);
				return;
			}

			this.handle_keys();
			if (this.pause != null)
				return;

			this.ball.update();
			if (this.boss_update)
				this.boss_update.on_update(this, this.boss_update);

			this.collect_bonus();
			this.check_exits(mode === Const.MODE_CLASSIC);
		}

		update_time() {
			if (MB2.Manager.play_mode === Const.MODE_COURSE) {
				if (this.curtime < 0)
					this.curtime = 0;
				this.curtime += Std.deltaT;
				return;
			}
			this.curtime -= Std.tmod * 1000 / 40;
			if (this.curtime < 0) {
				this.curtime = 0;
				if (!this.ball.hole_death)
					this.gameOver(Const.CAUSE_NOTIME);
			} else if (MB2.Manager.play_mode === Const.MODE_CLASSIC && this.curtime > 100000) {
				this.curtime = 100000;
			}
		}

		/** Space : next available ball. Escape : pause. */
		handle_keys() {
			if (Key.isDown(Key.SPACE) && MB2.Manager.play_mode !== Const.MODE_CLASSIC) {
				if (!this.space_key_flag) {
					this.space_key_flag = true;
					do {
						this.ball.btype = (this.ball.btype + 1) % 7;
					} while (!this.options.ball_types[this.ball.btype]);
					this.options.update_icons();
					this.ball.update_skin();
					Sound.play(Sound.BALL_CHANGE);
				}
			} else
				this.space_key_flag = false;

			if (Key.isDown(Key.ESCAPE)) {
				if (!this.pause_key_flag) {
					this.pause_key_flag = true;
					this.setPause();
				}
			} else
				this.pause_key_flag = false;
		}

		/** The pastilles are collected by distance (not by collision). */
		collect_bonus() {
			const bonus = this.level.bonus;
			for (let i = 0; i < bonus.length; i++) {
				const b = bonus[i];
				if (b && MB2.Tools.dist2(b.clip, this.ball.mc) < 300 && b.on_hit(this, b)) {
					b.old_btype = b.btype;
					b.btype = MB2.Bumper.NONE;
					bonus[i] = null;
				}
			}
		}

		/** Out of the room : go to the next room if the exit is open, else stay in. */
		check_exits(isClassic) {
			const level = this.level;
			const room = level.dungeon[level.pos_x][level.pos_y];
			const paths = room.paths || [{ ptype: Path.WALL }, { ptype: Path.WALL }, { ptype: Path.WALL }, { ptype: Path.WALL }];
			const ball = this.ball;
			const canExit = d => isClassic || this.is_door_opened(paths[d]);

			if (ball.x < 0) {
				if (canExit(0))
					level.change_room(-1, 0);
				else
					ball.x = 5;
			} else if (ball.x > Const.LVL_WIDTH) {
				if (canExit(1))
					level.change_room(1, 0);
				else
					ball.x = Const.LVL_WIDTH - 5;
			} else if (ball.y < 0) {
				if (canExit(2))
					level.change_room(0, -1);
				else
					ball.y = 5;
			} else if (ball.y > Const.LVL_HEIGHT) {
				if (canExit(3))
					level.change_room(0, 1);
				else
					ball.y = Const.LVL_HEIGHT - 5;
			}
		}

		setPause() {
			this.pause = new MB2.Pause(this);
			if (this.boss_update && this.boss_update.onPause)
				this.boss_update.onPause(true);
		}

		/** Advances the animations (frozen during the pause). */
		tick() {
			if (this.pause == null)
				this.dmanager.tick();
			MB2.frameCount = (MB2.frameCount || 0) + 1;
		}

		draw(ctx) {
			this.dmanager.draw(ctx);
			if (this.pause)
				this.pause.draw(ctx);
		}

		destroy() {
			if (this.pause)
				this.pause.destroy();
			this.dmanager.destroy();
		}
	};

})();
