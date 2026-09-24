/*
 * The octopus, boss of the Challenge mode. Port of mb2/Boss.as.
 *
 * It sleeps, then alternates between patterns (do_change_pattern) :
 *   - jumps toward the ball (the collision pushes the ball away) ;
 *   - one big jump that breaks the floor (new holes spreading from the corners) ;
 *   - sucking the ball (aspire) : if it gets the ball, it eats and throws it ;
 *   - throwing its eye (tir) : the only way to hurt it is to send the eye back
 *     into it by hitting the eye with the ball.
 * After 4 hits it dies.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Tools = MB2.Tools;
	const Std = MB2.Std;
	const Sound = MB2.Sound;
	const redTint = MB2.BossTools.redTint;

	MB2.Boss = class {

		constructor(game) {
			this.game = game;

			this.mc = game.dmanager.attach("boss", Const.BOSS_PLAN);
			this.mc.alpha = 0;
			this.mc.control = this;
			this.shade = game.dmanager.attach("boss shade", Const.SHADE_PLAN);
			this.shade.alpha = 0;

			this.px = Const.LVL_WIDTH / 2;
			this.py = Const.LVL_HEIGHT / 2;
			this.hits = 0;
			this.pat_jmp = false;      // alternates jumping and special patterns
			this.wait = 5;             // seconds (x 25 frames) before the next action
			this.next_frame = null;    // animation played when the wait ends
			this.change_pattern = true;
			this.collide = false;

			this.jump_pos = 0;
			this.jump_time = 0;
			this.jump_speed = 0;
			this.jump_size = 0;
			this.jump_casse = 0;       // holes made at the end of the jump
			this.njumps = 0;
			this.ang = 0;
			this.ang_speed = 0;
			this.speed = 0;
			this.aspire_time = 0;
			this.eat_done = false;
			this.do_tir = false;
			this.tir = null;           // the thrown eye
			this.hit_time = 0;
			this.particules = [];

			this.on_update();
			game.ball.max_speed_enabled = false;
			this.mc.gotoAndStop("dodo");
			this.dodo = true;
			this.mc.dodo = true;
			Sound.play(Sound.POULPE);
		}

		/** A new hole, spreading randomly from a bottom corner hole. */
		casse() {
			const wt = this.game.level.interf.walltable;
			let px = random(2) === 0 ? 0 : 13;
			let py = 8;
			const hole = wt[px][py];

			for (let n = 0; wt[px][py] != null && n < 10000; n++) {
				switch (random(4)) {
				case 0:
					if (px > 0)
						px--;
					break;
				case 1:
					if (py > 0)
						py--;
					break;
				case 2:
					if (px < 13)
						px++;
					break;
				case 3:
					if (py < 8)
						py++;
					break;
				}
			}
			wt[px][py] = hole;
			this.game.level.interf.update_walls();

			const tile = this.game.dmanager.attach("dalle", Const.BONUS_PLAN);
			tile.x = px * 10 * Const.DELTA + Const.BORDER_SIZE;
			tile.y = py * 10 * Const.DELTA + Const.BORDER_SIZE;
		}

		death() {
			const game = this.game;
			Sound.play(Sound.POULPE);
			this.mc.gotoAndPlay("death");

			for (let ring = 0; ring < 3; ring++) {
				for (let i = 0; i < 8; i++) {
					const p = game.dmanager.attach("bossParticule", Const.BOSS_PLAN);
					p.x = this.mc.x;
					p.y = this.mc.y;
					p.ang = (i / 8) * Math.PI * 2 + ring * 0.5;
					p.dist = 0;
					p.speed = (ring + 1) * 2.5;
					p.scale = 200 + ring * 50;
					this.particules.push(p);
				}
			}

			game.ball.sx = 0;
			game.ball.sy = 0;
			game.ball.speed = 0;
			game.ball.control = false;
			game.can_loose = false;
			this.shade.visible = false;
			this.wait = 0xFFFFF;
		}

		/** The death particles spiral out ; the game is won when they are all gone. */
		move_particules() {
			if (this.particules.length === 0)
				return;

			for (let i = 0; i < this.particules.length; i++) {
				const p = this.particules[i];
				p.ang += Std.tmod * 0.1 * p.speed / 5;
				p.dist += Std.tmod * p.speed;
				p.x = this.mc.x + Math.cos(p.ang) * p.dist;
				p.y = this.mc.y + Math.sin(p.ang) * p.dist;
				p.scale -= Std.tmod * 5;
				p.xscale = p.scale;
				p.yscale = p.scale;

				const w = 20 * p.scale / 100;
				const out = p.x < -w || p.y < -w || p.x > Const.LVL_WIDTH + w || p.y > Const.LVL_HEIGHT + w;
				if (out || p.scale <= 0) {
					p.removeMovieClip();
					this.particules.splice(i--, 1);
				}
			}

			if (this.particules.length === 0) {
				this.game.boss_update = null;
				this.game.gameOver(Const.CAUSE_WINS);
			}
		}

		setColor(redOffset) {
			this.mc.tint = redTint(redOffset);
		}

		on_update() {
			const tmod = Std.tmod;
			const mc = this.mc;

			this.move_particules();
			this.move_eye();
			this.fade_in();

			if (this.wait > 0) {
				this.update_wait();
				return;
			}
			if (this.hit_time > 0) {
				this.update_hit();
				return;
			}
			if (this.change_pattern) {
				this.change_pattern = false;
				this.do_change_pattern();
				return;
			}
			if (this.njumps > 0 && this.update_jump())
				return;
			if (this.ang_speed !== 0)
				this.update_move();

			// suction / eating
			if (!this.game.ball.hole_death && this.aspire_time > 0) {
				if (this.update_aspire())
					return;
			} else if (this.eat_done) {
				this.throw_ball();
				return;
			} else {
				// pincers closing
				const c = Math.pow(0.6, tmod);
				mc.b.p1.rotation *= c;
				mc.b.p2.rotation *= c;
				mc.souffle.xscale *= 0.8;
				mc.souffle.yscale *= 0.8;
			}

			if (this.do_tir)
				this.update_tir();
		}

		fade_in() {
			if (this.mc.alpha >= 100)
				return;
			this.mc.alpha += 10 * Std.tmod;
			this.shade.alpha += 10 * Std.tmod;
			if (this.mc.alpha >= 100) {
				this.mc.alpha = 100;
				this.shade.alpha = 100;
			}
		}

		/** Waiting (asleep at the start) : it wakes up 3 seconds before the end. */
		update_wait() {
			const mc = this.mc;
			this.wait -= Std.tmod / 25;
			mc.x = this.px;
			mc.y = this.py;
			this.shade.x = this.px;
			this.shade.y = this.py;
			if (this.collide)
				this.do_collide();

			if (this.dodo && this.wait <= 3) {
				this.dodo = false;
				mc.dodo = false;
				mc.gotoAndStop("normal");
				mc.oeil.gotoAndPlay("close");
			}
			if (this.wait <= 0) {
				mc.gotoAndPlay(this.next_frame);
				this.wait = 0;
			}
		}

		/** Red flash after a hit ; it dies after the 4th. */
		update_hit() {
			this.hit_time -= Std.tmod / 25;
			if (this.hit_time > 0) {
				this.setColor(60 * this.hits + this.hit_time * 100);
				return;
			}
			this.setColor(40 * this.hits);
			if (this.hits >= 4)
				this.death();
		}

		/** Returns true when the pattern changed. */
		update_jump() {
			this.jump_time += Std.deltaT;
			this.jump_pos = this.jump_size * Math.sin(this.jump_time * this.jump_speed / this.jump_size);
			if (this.jump_pos < 10)
				this.do_collide();
			if (this.jump_pos >= 0)
				return false;

			// landing
			this.jump_pos = 0;
			this.jump_time = 0;
			this.njumps--;
			while (this.jump_casse-- > 0) {
				Sound.play(Sound.CASSE);
				this.casse();
			}
			if (this.njumps === 0) {
				this.do_change_pattern();
				return true;
			}
			Sound.play(Sound.BOSS_JUMP);
			return false;
		}

		/** Turns toward the ball and moves, bouncing on the walls. */
		update_move() {
			const tmod = Std.tmod;
			const game = this.game;
			const mc = this.mc;

			const toBall = Math.atan2(game.ball.y - this.py, game.ball.x - this.px);
			const diff = Tools.rad_dif(this.ang, toBall);
			if (Math.abs(diff) > this.ang_speed)
				this.ang += (diff < 0 ? -1 : 1) * this.ang_speed * tmod;
			else
				this.ang = toBall + (random(3) - 1) / 100;

			this.px += Math.cos(this.ang) * this.speed * tmod;
			this.py += Math.sin(this.ang) * this.speed * tmod;
			mc.x = this.px;
			mc.y = this.py - this.jump_pos;
			mc.jump = this.jump_pos;
			this.shade.x = this.px;
			this.shade.y = this.py;
			this.shade.xscale = 100 + this.jump_pos / 3;
			this.shade.yscale = 100 + this.jump_pos / 3;

			let wallHit = false;
			if (this.px < Const.BOSS_MIN_X) {
				this.px = Const.BOSS_MIN_X;
				wallHit = true;
			}
			if (this.py < Const.BOSS_MIN_Y) {
				this.py = Const.BOSS_MIN_Y;
				wallHit = true;
			}
			if (this.px > Const.LVL_WIDTH - Const.BOSS_MIN_X) {
				this.px = Const.LVL_WIDTH - Const.BOSS_MIN_X;
				wallHit = true;
			}
			if (this.py > Const.LVL_HEIGHT - Const.BOSS_MAX_Y) {
				this.py = Const.LVL_HEIGHT - Const.BOSS_MAX_Y;
				wallHit = true;
			}
			if (wallHit)
				this.ang += Math.PI * 3 / 4 + random(45) * Math.PI / 180;
		}

		/** Sucks the ball. Returns true when the ball is caught. */
		update_aspire() {
			const tmod = Std.tmod;
			const game = this.game;
			const mc = this.mc;

			this.aspire_time -= tmod / 25;
			const d = Tools.dist2(game.ball.mc, mc);

			if (d < 500) {
				// caught : eaten, then thrown (throw_ball, after the wait)
				game.ball.control = false;
				game.ball.sx = 0;
				game.ball.sy = 0;
				game.ball.x = this.px;
				game.ball.y = this.py + 22;
				this.aspire_time = 0;
				mc.gotoAndPlay("eat");
				this.wait = 1;
				this.collide = false;
				this.next_frame = "throw";
				this.eat_done = true;
				return true;
			}

			// pincers opening, suction growing
			let c = Math.pow(0.6, tmod);
			mc.b.p1.rotation = mc.b.p1.rotation * c + 45 * (1 - c);
			mc.b.p2.rotation = mc.b.p2.rotation * c - 45 * (1 - c);
			c = Math.pow(0.95, tmod);
			const scale = mc.souffle.xscale * c + (100 + this.hits * 20) * (1 - c);
			mc.souffle.xscale = scale;
			mc.souffle.yscale = scale;

			const force = (120 + this.hits * 20) * tmod;
			game.ball.sx += (this.px - game.ball.mc.x) / d * force;
			game.ball.sy += (this.py - game.ball.mc.y) / d * force;

			if (this.aspire_time <= 0) {
				this.do_change_pattern();
				return true;
			}
			return false;
		}

		throw_ball() {
			const game = this.game;
			const ang = (random(100) + 40) * Math.PI / 180;
			game.ball.sx = 60 * Math.cos(ang);
			game.ball.sy = 60 * Math.sin(ang);
			game.ball.control = true;
			this.eat_done = false;
			this.wait = 0.5;
			this.change_pattern = true;
		}

		/**
		 * The eye : thrown toward the ball. When the ball hits it, it is sent back
		 * ("activated") ; if it reaches the octopus, the octopus is hurt.
		 */
		update_tir() {
			const tmod = Std.tmod;
			const game = this.game;
			const mc = this.mc;

			if (this.tir == null) {
				Sound.play(Sound.BOSS_EYE);
				mc.gotoAndPlay("looseEye");
				const tir = this.tir = game.dmanager.attach("boss tir", Const.BOSS_PLAN);
				tir.px = this.px;
				tir.py = this.py - 10;
				tir.activated = false;
				tir.tint = redTint(40 * this.hits);
				const ang = Math.atan2(game.ball.mc.y - (this.py - 100), game.ball.mc.x - this.px);
				const speed = 5 + this.hits * 1.5;
				tir.sx = speed * Math.cos(ang);
				tir.sy = speed * Math.sin(ang);
			}
			const tir = this.tir;

			// the ball hits the eye : both bounce
			let d = Tools.dist2(game.ball.mc, tir);
			if (!game.ball.hole_death && d < 38 * 38) {
				Sound.play(Sound.WALL_HIT);
				d = Math.sqrt(d);
				tir.sx = (7 + this.hits * 1.5) * (tir.px - game.ball.mc.x) / d;
				tir.sy = (7 + this.hits * 1.5) * (tir.py - game.ball.mc.y) / d;
				if (game.ball.speed < 25)
					game.ball.speed = 25;
				game.ball.sx = game.ball.speed * (game.ball.mc.x - tir.px) / d;
				game.ball.sy = game.ball.speed * (game.ball.mc.y - tir.py) / d;
				tir.activated = true;
			}

			// the eye comes back into the octopus : hit
			if (tir.activated && Tools.dist2(mc, tir) < 50 * 50) {
				tir.removeMovieClip();
				this.tir = null;
				this.hit_time = 1;
				Sound.play(Sound.BOSS_NEW_EYE);
				mc.gotoAndPlay("newEye");
				Sound.play(Sound.POULPE);
				this.hits++;
				this.do_tir = false;
				return;
			}

			tir.px += tir.sx * tmod;
			tir.py += tir.sy * tmod;
			tir.x = tir.px;
			tir.y = tir.py;

			// lost out of the room : a new eye grows
			if (tir.x < -30 || tir.y < -30 || tir.x > Const.LVL_WIDTH + 30 || tir.y > Const.LVL_HEIGHT + 30) {
				Sound.play(Sound.BOSS_NEW_EYE);
				mc.gotoAndPlay("newEye");
				tir.removeMovieClip();
				this.tir = null;
				this.do_tir = false;
				return;
			}
			this.do_collide();
		}

		/** Pushes the ball away when it touches the octopus (an elliptic shape). */
		do_collide() {
			const ball = this.game.ball;
			const dx = ball.x - this.px;
			const dy = ball.y - this.py;
			if (dx * dx + dy * dy * 2 < 2000) {
				const ang = Math.atan2(dy, dx);
				ball.sx += 30 * Math.cos(ang);
				ball.sy += 30 * Math.sin(ang);
				Sound.play(Sound.WALL_HIT);
			}
		}

		do_change_pattern() {
			const mc = this.mc;
			this.collide = true;
			this.pat_jmp = !this.pat_jmp;
			this.jump_pos = 0;
			mc.jump = 0;
			this.jump_casse = 0;
			this.jump_time = 0;
			this.njumps = 0;
			this.ang_speed = 0;
			this.do_tir = false;
			this.wait = 0;
			this.aspire_time = 0;
			this.hit_time = 0;

			if (this.pat_jmp) {
				// jumps toward the ball (many more after the 3rd hit : the hits count
				// goes to 4, it dies at the end of this pattern)
				this.jump_speed = 300;
				this.njumps = 3 + this.hits * 2;
				Sound.play(Sound.BOSS_JUMP);
				if (this.hits === 3) {
					this.njumps *= 5;
					this.hits++;
				}
				this.jump_size = 75 - this.hits * 10;
				this.ang_speed = 0.1 + 0.02 * this.hits;
				this.speed = 2 + this.hits * 1.5;
				mc.gotoAndStop("normal");
				return;
			}

			if (this.hits >= 4) {
				this.hit_time = 1;
				return;
			}

			switch (random(8)) {
			case 0:
			case 1:
				// one big jump breaking the floor
				this.jump_casse = 1 + random(3);
				this.jump_speed = 1500;
				this.jump_size = 300;
				this.njumps = 1;
				Sound.play(Sound.BOSS_JUMP);
				this.ang_speed = 0.1 + 0.02 * this.hits;
				this.speed = 10;
				mc.gotoAndStop("normal");
				break;
			case 2:
			case 3:
				this.wait = 1 + random(100) / 100;
				this.next_frame = "aspire";
				this.aspire_time = 2 + 0.5 * this.hits;
				break;
			case 4:
				// just a shout
				this.wait = 0.5;
				this.change_pattern = true;
				Sound.play(Sound.POULPE);
				break;
			default:
				this.wait = 0.7 + random(50) / 50;
				this.next_frame = "tir";
				this.do_tir = true;
				this.tir = null;
				break;
			}
		}

		/** The pupil follows the ball ; random blinks. */
		move_eye() {
			const mc = this.mc;
			const ball = this.game.ball;
			const a = Math.atan2(ball.mc.y - mc.y, ball.mc.x - mc.x);
			const x = Math.cos(a) * 28;
			const y = Math.sin(a) * 7 + 8 * Math.abs(Math.sin(a));

			const p = mc.oeil.p;
			const c = 0.9;
			p.x = p.x * c + x * (1 - c);
			p.y = p.y * c + y * (1 - c);
			p.xscale = 100 - Math.abs(p.x);
			p.yscale = 100 - Math.abs(p.y) * 1.5;

			if (!mc.dodo && !random(40))
				mc.oeil.play();
		}

		onPause() { }
	};

})();
