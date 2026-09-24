/*
 * The player's ball : controls, physics, holes, jumps and deaths.
 * Port of mb2/Ball.as.
 *
 * Coordinates : x / y is the logical position (pixels, room coordinates),
 * sx / sy the speed (pixels per frame). The clip `mc` is drawn at x / y
 * (minus the jump height), the `shadow` stays on the floor.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Tools = MB2.Tools;
	const Std = MB2.Std;
	const Key = MB2.Key;
	const Type = MB2.BallType;

	/** Rolling spots of each ball type : count and distance from the center. */
	const STONE_STYLE = [
		{ MAX: 6, RAYMIN: 10, RAYMAX: 20 },   // yellow
		{ MAX: 20, RAYMIN: 0, RAYMAX: 20 },   // green
		{ MAX: 4, RAYMIN: 14, RAYMAX: 14 },   // red
		{ MAX: 10, RAYMIN: 0, RAYMAX: 12 },   // orange
		{ MAX: 10, RAYMIN: 6, RAYMAX: 20 },   // blue
		{ MAX: 0, RAYMIN: 0, RAYMAX: 20 },    // metal
		{ MAX: 20, RAYMIN: 0, RAYMAX: 20 }    // violet
	];
	const STONE_COLORS = ["#fff4a0", "#2a7a10", "#ffd0b0", "#ffe070", "#ffffff", "#fff", "#f0d0ff"];

	MB2.Ball = class {

		constructor(game) {
			this.game = game;
			this.btype = Type.YELLOW;

			this.mc = game.dmanager.attach("marble", Const.BALL_PLAN);
			this.mc.ball = this;
			this.shadow = game.dmanager.attach("shadow", Const.DECOR_PLAN);
			this.stoneList = [];
			this.gen_stones();

			this.x = 0;
			this.y = 0;
			this.sx = 0;
			this.sy = 0;
			this.speed = 0;
			this.col_count = 0;       // consecutive frames of collision (stuck detection)
			this.clign_count = 0;     // blinking (invulnerable) time after a death, in ms
			this.control = true;      // false while a boss holds the ball
			this.max_speed_enabled = true;
			this.water = false;       // slides (water power of the bosses)

			// death / falling in a hole
			this.hole_death = false;
			this.hole_death_speed = 1;
			this.death_hit = false;
			this.hole_mask = null;
			this.classic_mask = null;

			// jump of the blue ball over holes
			this.jump = false;
			this.jump_size = 0;
			this.jump_way = 1;
			this.jump_delta = 0;
			this.last_jump = false;

			// start in the middle of the room
			Tools.set_mcpos(this.mc, { x: Const.LVL_CWIDTH / 2, y: Const.LVL_CHEIGHT / 2 });
			this.x = this.mc.x;
			this.y = this.mc.y;
			this.start_x = this.x;
			this.start_y = this.y;
		}

		// ----- look -----

		gen_stones() {
			this.stoneList = [];
			const style = STONE_STYLE[this.btype] || STONE_STYLE[0];
			for (let i = 0; i < style.MAX; i++) {
				this.stoneList.push({
					dx: random(628),
					dy: random(628),
					rayon: style.RAYMIN + random(style.RAYMAX - style.RAYMIN),
					size: 1 + Math.random() * 1.6,
					col: STONE_COLORS[this.btype] || "#fff",
					x: 0,
					y: 0,
					alpha: 0
				});
			}
		}

		/**
		 * Fakes the rolling : each spot moves on an ellipse according to the speed,
		 * and fades when it is "behind" the ball. (628 = 2 PI x 100)
		 */
		move_stones() {
			const tmod = Std.tmod;
			for (const s of this.stoneList) {
				s.dx += this.sx * 10 * tmod;
				s.dy += this.sy * 10 * tmod;
				if (s.dx > 628)
					s.dx -= 628;
				if (s.dx < 0)
					s.dx += 628;
				if (s.dy > 628)
					s.dy -= 628;
				if (s.dy < 0)
					s.dy += 628;

				s.x = Math.cos(s.dx / 100) * s.rayon / 2;
				s.y = Math.sin(s.dy / 100) * s.rayon / 2;

				const xc = Math.cos((s.dx + 157) / 100);
				const yc = Math.cos((s.dy + 157) / 100);
				const max = (s.rayon / Const.BALL_RAYSIZE) * 50;
				s.alpha = 50 + (xc + yc) * max;
			}
		}

		/** To call when btype changes. */
		update_skin() {
			this.gen_stones();
		}

		// ----- every frame -----

		/** The jump of the blue ball : the ball grows while going up. */
		update_jump() {
			if (!this.jump)
				return;
			this.jump_size += Std.tmod * this.jump_way * 60;
			this.jump_delta = Math.sqrt(Math.max(0, this.jump_size * this.speed)) / 6;
			this.mc.xscale = 100 + this.jump_delta * 3;
			this.mc.yscale = 100 + this.jump_delta * 3;
			if (this.jump_size > 200) {
				this.jump_way *= -1;
			} else if (this.jump_size < 0) {
				this.jump_delta = 0;
				this.jump = false;
				this.mc.xscale = 100;
				this.mc.yscale = 100;
				this.last_jump = true;
			}
		}

		/**
		 * The ball falling in a hole / the hatch, or dying (it shrinks).
		 * Returns true while it happens (the game then skips the controls).
		 */
		update_hole() {
			if (!this.hole_death)
				return false;

			this.sx *= 0.9;
			this.sy *= 0.9;
			this.mc.xscale *= Math.pow(0.92, Std.tmod * this.hole_death_speed);
			this.mc.yscale *= Math.pow(0.92, Std.tmod * this.hole_death_speed);
			this.mc.x += this.sx / 5;
			this.mc.y += this.sy / 5;
			if (this.mc.xscale >= 3)
				return true;

			// the fall is over
			this.hole_death = false;
			this.mc.mask = null;
			this.classic_mask = null;
			this.hole_mask = null;

			const game = this.game;
			if (MB2.Manager.play_mode === Const.MODE_CLASSIC && !this.death_hit) {
				// went through the hatch : next level, in a random room. The ball is
				// placed one room lower, so that the game scrolls to the new room.
				game.curtime += Const.TIME_CLASSIC_EXTENDED;
				this.x = game.level.exit.clip.x;
				this.y = game.level.exit.clip.y + Const.LVL_HEIGHT;
				game.level.pos_y = random(game.level.height) - 1;
				game.level.pos_x++;
				this.sx = 0;
				this.sy = 0;
				this.mc.xscale = 100;
				this.mc.yscale = 100;
				this.mc.x = this.x;
				this.mc.y = this.y;
				this.shadow.visible = true;
				this.shadow.x = this.x;
				this.shadow.y = this.y;
			} else
				this.kill();
			return true;
		}

		/** Controls, physics and collisions. */
		update() {
			const tmod = Std.tmod;
			const game = this.game;

			// blinking after a death
			if (this.clign_count > 0) {
				this.clign_count -= tmod * 1000 / 40;
				this.clign_flag = !this.clign_flag;
				this.mc.alpha = this.clign_flag ? 30 : 60;
				if (this.clign_count <= 0)
					this.mc.alpha = 100;
			}

			// ----- controls -----
			let dx = 0;
			let dy = 0;
			if (this.control && !this.jump) {
				if (Key.isDown(Key.DOWN))
					dy++;
				if (Key.isDown(Key.UP))
					dy--;
				if (Key.isDown(Key.LEFT))
					dx--;
				if (Key.isDown(Key.RIGHT))
					dx++;
				if (MB2.Touch) {
					dx += MB2.Touch.dx;
					dy += MB2.Touch.dy;
				}
			}

			// ----- acceleration and inertia of each ball -----
			let speedCoef;
			let inertia;
			this.maxspeed = 20;
			switch (this.btype) {
			case Type.ORANGE:
				speedCoef = 2.1;
				inertia = 0.85;
				break;
			case Type.RED:
				speedCoef = 0.6;
				inertia = 0.95;
				this.attract_reds();
				break;
			case Type.METAL:
				this.maxspeed = 7;
				speedCoef = 0.2;
				inertia = 0.98;
				break;
			default:
				speedCoef = 0.85;
				inertia = 0.94;
				break;
			}
			if (this.water) {
				inertia = 0.98;
				speedCoef *= 2;
			}

			// same speed in diagonal (keyboard only : the touch input is already normalized)
			if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
				dx /= Math.SQRT2;
				dy /= Math.SQRT2;
			}

			this.sx *= Math.pow(inertia, tmod);
			this.sy *= Math.pow(inertia, tmod);
			if (Math.abs(this.sx) < 0.1)
				this.sx = 0;
			if (Math.abs(this.sy) < 0.1)
				this.sy = 0;
			this.sx += speedCoef * dx * tmod;
			this.sy += speedCoef * dy * tmod;
			this.speed = Math.sqrt(this.sx * this.sx + this.sy * this.sy);

			// over the max speed (after a bumper) : slow down quickly
			if (this.max_speed_enabled && this.speed > this.maxspeed) {
				if (this.speed > 3 * this.maxspeed) {
					this.speed /= 3;
					this.sx /= 3;
					this.sy /= 3;
				}
				const k = Math.pow(0.8, tmod);
				this.speed *= k;
				this.sx *= k;
				this.sy *= k;
			}

			// ----- move, in steps of at most one cell -----
			dx = this.sx * tmod;
			dy = this.sy * tmod;
			const nsteps = 1 + ((Math.sqrt(dx * dx + dy * dy) / Const.DELTA) | 0);
			dx /= nsteps;
			dy /= nsteps;

			let step;
			for (step = 0; step < nsteps; step++) {
				this.hole_test();
				if (game.level.col_test(this.x + dx, this.y + dy, true)) {
					this.col_count++;
					break;
				}
				this.x += dx;
				this.y += dy;
			}

			if (step === nsteps) {
				this.col_count = 0;
			} else if (this.col_count >= 20) {
				// stuck in a wall for 20 frames : find a free place around
				this.sx = 0;
				this.sy = 0;
				this.recall();
			}

			this.mc.x = this.x + Const.DELTA / 2;
			this.mc.y = this.y + Const.DELTA / 2 - this.jump_delta;
			this.shadow.x = this.mc.x + MB2.Ball.SHADOW_DECAL;
			this.shadow.y = this.mc.y + MB2.Ball.SHADOW_DECAL + this.jump_delta;
			this.move_stones();
		}

		/** The red ball attracts the red pastilles within 200 pixels. */
		attract_reds() {
			const tmod = Std.tmod;
			for (const b of this.game.level.bonus) {
				if (!b || b.bname !== "red")
					continue;
				const d = Tools.dist2(this.mc, b.clip);
				if (d < 40000) {
					b.clip.x += (this.mc.x - b.clip.x) * 150 * tmod / d;
					b.clip.y += (this.mc.y - b.clip.y) * 150 * tmod / d;
				}
			}
		}

		/** Moves the ball to the closest free position (spiral search). */
		recall() {
			for (let ray = 1; ray < 30; ray += 2) {
				for (let a = 0; a < 8; a++) {
					const angle = a * Math.PI / 4;
					const dx = Math.cos(angle) * ray;
					const dy = Math.sin(angle) * ray;
					if (!this.game.level.col_test(this.x + dx, this.y + dy, false)) {
						this.x += dx;
						this.y += dy;
						return;
					}
				}
			}
		}

		/**
		 * Holes. The holes are 10 x 10 cell squares of Interf.walltable (btype 7).
		 * On a hole cell, the ball is pulled toward the center, and away from the
		 * edges that touch a non-hole cell ; once far enough from those edges it
		 * falls. The blue ball jumps instead.
		 */
		hole_test() {
			const wx = ((((this.x / Const.DELTA) | 0) - Const.BORDER_CSIZE) / 10) | 0;
			const wy = ((((this.y / Const.DELTA) | 0) - Const.BORDER_CSIZE) / 10) | 0;
			const wt = this.game.level.interf.walltable;
			const cellType = (x, y) => (wt[x] && wt[x][y]) ? wt[x][y].btype : undefined;
			const HOLE = MB2.Bumper.HOLE;

			if (cellType(wx, wy) !== HOLE || this.jump) {
				if (this.last_jump)
					this.last_jump = false;
				return;
			}

			// center of the hole cell
			const px = ((wx + 0.5) * 10 + Const.BORDER_CSIZE) * Const.DELTA;
			const py = ((wy + 0.5) * 10 + Const.BORDER_CSIZE) * Const.DELTA;
			const half = 5 * Const.DELTA;

			this.sx *= 1.1;
			this.sy *= 1.1;
			this.speed *= 1.1;

			// which edges of the cell border the floor (1 left, 2 right, 4 up, 8 down)
			let edges = 0;
			if (this.x < px && cellType(wx - 1, wy) !== HOLE)
				edges |= 1;
			else if (this.x > px && cellType(wx + 1, wy) !== HOLE)
				edges |= 2;
			if (this.y < py && cellType(wx, wy - 1) !== HOLE)
				edges |= 4;
			else if (this.y > py && cellType(wx, wy + 1) !== HOLE)
				edges |= 8;
			if (edges === 15)
				edges = 0;

			if (edges & 1)
				this.sx++;
			if (edges & 2)
				this.sx--;
			if (edges & 4)
				this.sy++;
			if (edges & 8)
				this.sy--;

			const R = Const.BALL_RAYSIZE;
			const inside =
				this.x > px - half + ((edges & 1) ? R : 0) &&
				this.x < px + half - ((edges & 2) ? R : 0) &&
				this.y > py - half + ((edges & 4) ? R : 0) &&
				this.y < py + half - ((edges & 8) ? R : 0);

			if (inside) {
				// falls : the ball is only visible inside the holes while it shrinks
				const rects = this.game.level.interf.holes.rects.slice();
				this.hole_mask = rects;
				this.mc.mask = ctx => {
					ctx.beginPath();
					for (const r of rects)
						ctx.rect(r[0], r[1], r[2], r[3]);
					ctx.clip();
				};
				this.shadow.visible = false;
				this.clign_count = 0;
				this.mc.alpha = 100;
				this.hole_death_speed = 1;
				this.death_hit = false;
				this.hole_death = true;
			} else if (this.btype === Type.BLUE && !this.last_jump) {
				this.jump = true;
				this.jump_way = 1;
				this.jump_size = 0;
				this.jump_delta = 0;
			}
		}

		// ----- death -----

		/** Starts the death animation (killed by a bumper, a laser, a boss...). */
		die() {
			if (this.clign_count > 0 || this.hole_death)
				return;
			this.mc.alpha = 100;
			this.hole_death = true;
			this.death_hit = true;
			this.hole_death_speed = 5;
			this.shadow.visible = false;
			this.sx = 0;
			this.sy = 0;
		}

		/**
		 * After the death animation : back to the room entrance, one ball less
		 * (except in the tutorial, and for the yellow ball in Course mode), and
		 * switch to another ball type if none of this type is left.
		 * Game over when no ball is left.
		 */
		kill() {
			const game = this.game;
			const mode = MB2.Manager.play_mode;

			this.sx = 0;
			this.sy = 0;
			this.x = this.start_x;
			this.y = this.start_y;
			this.mc.xscale = 100;
			this.mc.yscale = 100;
			this.mc.x = this.x;
			this.mc.y = this.y;
			this.mc.visible = true;
			this.mc.alpha = 100;
			this.shadow.visible = true;
			this.shadow.x = this.x;
			this.shadow.y = this.y;
			this.jump = false;
			this.jump_delta = 0;

			if (mode !== Const.MODE_AIDE && (this.btype !== Type.YELLOW || mode !== Const.MODE_COURSE)) {
				game.options.ball_types[this.btype]--;
				game.options.ball_types_chk--;
			}

			this.clign_count = 400;
			this.clign_flag = true;

			const last = this.btype;
			while (!(game.options.ball_types[this.btype] > 0)) {
				this.btype = (this.btype + 1) % 7;
				if (this.btype === last) {
					game.options.update_icons();
					this.shadow.visible = false;
					this.mc.visible = false;
					game.gameOver(Const.CAUSE_NOBALLS);
					return;
				}
			}
			game.options.update_icons();
			this.update_skin();
		}
	};

	/** Offset of the shadow, in pixels. */
	MB2.Ball.SHADOW_DECAL = 3;

})();
