/*
 * The elemental snakes, bosses of the adventure dungeons 1 to 4.
 * Port of mb2/BossSerpent.as.
 *
 * The snake is a chain of parts following the path of its head : every
 * position of the head is recorded in `histo`, and each part is placed further
 * back in that history (by the sum of the rays of the parts before it).
 *
 * To hurt it, the ball must hit its head from the front while it is calm :
 * it loses a body ring (explode). When only the head and the tail are left,
 * it goes berserk for 10 seconds, then dies. Its tail kills the ball.
 * Its states are chosen at random (change_pattern) ; it also casts the power
 * of its element (boss/powers/).
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;
	const Sound = MB2.Sound;
	const { normalize, approachSpeed, updatePowers } = MB2.BossTools;

	// elements (= adventure number + 1)
	const EAU = 1, FEU = 2, VENT = 3, TERRE = 4;

	// states
	const ST_WAIT = 0, ST_SEARCH = 1, ST_FONCE = 2, ST_EVADE = 3, ST_POWER = 4, ST_RECALL = 5;

	/** Probabilities of the states [wait, search, charge, evade, power] when excited / calm. */
	const STATE_PROBAS = [
		[1, 5, 2, 2, 5],
		[2, 0, 0, 10, 2]
	];

	/** Number of body rings = hits needed. */
	const NHITS = 3;

	MB2.BossSerpent = class {

		constructor(game) {
			this.game = game;
			this.elt = MB2.Manager.play_mode_param + 1;

			const logo = game.dmanager.attach("logoBg", Const.BG_PLAN);
			logo.gotoAndStop(this.elt);
			this.lbg = logo;

			this.powers = [];
			this.ecailles = [];       // scales flying away
			this.power = 3;           // strength of the push on the ball
			this.dying = false;
			this.excite = 0;          // seconds of excitement left after a hit on the head
			this.berserk_time = 0;
			this.state = ST_WAIT;
			this.timer = 0;
			this.speed = 0;
			this.target_speed = 0;
			this.accel = 1.05;
			this.delta = 0.03;        // turning speed
			this.ang = 0;
			this.hit = false;
			this.x = Const.LVL_WIDTH / 2;
			this.y = Const.LVL_HEIGHT / 2;

			this.initSerpent();
			this.change_pattern();
			this.setExcite(false);
			for (let i = 0; i < 5; i++)
				this.on_update();
		}

		/** Creates the parts : head, NHITS body rings, tail. */
		initSerpent() {
			this.parts = [];
			for (let i = 0; i < NHITS + 2; i++) {
				const p = new MB2.Clip("snake");
				p.elt = this.elt;
				if (i === 0) {
					p.gotoAndStop(1);
					p.ray = 20;
				} else if (i === NHITS + 1) {
					p.gotoAndStop(3);
					p.ray = 25;
				} else
					p.gotoAndStop(2);
				p.ang = this.ang;
				p.rsq = (p.ray + Const.BALL_RAYSIZE / 2) * (p.ray + Const.BALL_RAYSIZE / 2);
				p.pos = { x: this.x, y: this.y, a: this.ang };
				p.x = this.x;
				p.y = this.y;
				this.parts.push(p);
			}
			// the head must be drawn over the rest : add the clips from the tail
			for (let i = this.parts.length - 1; i >= 0; i--)
				this.game.dmanager.add(this.parts[i], Const.BOSS_PLAN);

			this.updateScales();
			this.histo = [{ x: this.x, y: this.y, a: this.ang }];
		}

		/** The body rings get smaller toward the tail. */
		updateScales() {
			const parts = this.parts;
			for (let i = 1; i < parts.length - 1; i++) {
				const s = 1 - (i / parts.length);
				const p = parts[i];
				p.xscale = s * 100;
				p.yscale = s * 100;
				p.ray = s * 50;
				p.rsq = (p.ray + Const.BALL_RAYSIZE / 2) * (p.ray + Const.BALL_RAYSIZE / 2);
			}
		}

		toBall() {
			return Math.atan2(this.game.ball.y - this.y, this.game.ball.x - this.x);
		}

		/** Keeps the head away from the walls ; hitting one makes it turn (ST_RECALL). */
		recall() {
			const d = 60;
			this.hit = false;
			if (this.x < Const.BOSS_MIN_X + d) {
				this.x = Const.BOSS_MIN_X + d;
				this.hit = true;
			}
			if (this.y < Const.BOSS_MIN_Y + d) {
				this.y = Const.BOSS_MIN_Y + d;
				this.hit = true;
			}
			if (this.x > Const.LVL_WIDTH - Const.BOSS_MIN_X - d) {
				this.x = Const.LVL_WIDTH - Const.BOSS_MIN_X - d;
				this.hit = true;
			}
			if (this.y > Const.LVL_HEIGHT - Const.BOSS_MAX_Y - d) {
				this.y = Const.LVL_HEIGHT - Const.BOSS_MAX_Y - d;
				this.hit = true;
			}
			if (this.hit && this.state !== ST_RECALL) {
				this.delta = random(2) === 0 ? 0.3 : -0.3;
				this.state = ST_RECALL;
				this.timer = 1;
			}
		}

		/** Eyes : 1 excited (red), 2 calm (green), 3 berserk (yellow). */
		setExcite(excited) {
			this.parts[0].eyes = this.berserk_time > 0 ? 3 : (excited ? 1 : 2);
		}

		updateEcailles() {
			for (let i = 0; i < this.ecailles.length; i++) {
				const e = this.ecailles[i];
				e.x += Math.cos(e.ang) * Std.tmod * 10;
				e.y += Math.sin(e.ang) * Std.tmod * 10;
				e.rotation += 5 * Std.tmod;
				e.xscale -= 15 * Std.tmod;
				e.yscale -= 15 * Std.tmod;
				if (e.xscale < 10) {
					this.ecailles.splice(i--, 1);
					e.removeMovieClip();
				}
			}
		}

		on_update() {
			const tmod = Std.tmod;
			const game = this.game;

			// excitement fades
			if (this.berserk_time === 0 && this.excite > 0) {
				this.excite -= Std.deltaT;
				if (this.excite <= 0) {
					this.excite = 0;
					this.setExcite(false);
					this.change_pattern();
				}
			}

			// end of the berserk time : it dies
			if (this.berserk_time > 0 && !game.ball.hole_death) {
				this.berserk_time -= Std.deltaT;
				if (this.berserk_time <= 0) {
					for (const p of this.powers.slice())
						p.destroy();
					this.dying = true;
				}
			}

			updatePowers(this.powers);
			this.updateEcailles();

			if (this.dying) {
				this.update_death();
				return;
			}

			this.timer -= Std.deltaT;
			if (this.timer <= 0)
				this.change_pattern();

			approachSpeed(this);
			this.steer(tmod);
			this.move();
			this.place_parts(tmod);
		}

		/** All the parts spin and shrink ; the game is won when they are gone. */
		update_death() {
			let remaining = false;
			for (const p of this.parts) {
				p.rotation += 30 * Std.tmod;
				if (p.xscale > 0) {
					p.xscale -= Std.deltaT * 100;
					p.yscale -= Std.deltaT * 100;
					remaining = remaining || p.xscale > 0;
				}
			}
			if (!remaining) {
				for (const p of this.parts)
					p.removeMovieClip();
				this.game.boss_update = null;
				this.game.gameOver(Const.CAUSE_WINS);
			}
		}

		/** Turns according to the state. */
		steer(tmod) {
			// turn toward (sign of the sine of the angle difference) a target angle
			const turnTo = target => {
				const diff = normalize(target - this.ang);
				const side = Math.asin(Math.max(-1, Math.min(1, diff)));
				this.ang += (side > 0 ? 1 : -1) * this.delta * tmod;
			};

			switch (this.state) {
			case ST_SEARCH:
				turnTo(this.toBall());
				break;
			case ST_EVADE:
				turnTo(this.toBall() + Math.PI);
				break;
			case ST_RECALL:
				this.delta *= Math.pow(0.97, tmod);
				if (Math.abs(this.delta) < 0.1)
					this.delta = this.delta < 0 ? -0.1 : 0.1;
				this.ang += this.delta * tmod;
				if (!this.hit)
					this.change_pattern();
				break;
			}
		}

		/** Moves the head pixel by pixel, recording its path and colliding at each step. */
		move() {
			let ds = this.speed * Std.tmod;
			this.ang = normalize(this.ang);

			if (ds <= 0) {
				this.collide();
				this.histo.push({ x: this.x, y: this.y, a: this.ang });
			}
			while (ds > 0) {
				const step = Math.min(ds, 1);
				ds -= 1;
				this.x += Math.cos(this.ang) * step;
				this.y += Math.sin(this.ang) * step;
				this.recall();
				this.histo.push({ x: this.x, y: this.y, a: this.ang });
				this.collide();
			}
			// only the recent path is needed
			if (this.histo.length > 2000)
				this.histo.splice(0, this.histo.length - 1000);
		}

		/** Places each part at its distance back along the path of the head. */
		place_parts(tmod) {
			let p = this.histo.length - 1 + this.parts[0].ray;
			for (const mc of this.parts) {
				p -= mc.ray;
				mc.pos = this.histo[Math.max(p, 0) | 0];
				const diff = normalize(mc.pos.a - mc.ang);
				mc.ang += diff * ((this.excite > 0) ? 0.4 : 0.3) * tmod;
				mc.rotation = mc.ang * 180 / Math.PI + 180;   // the bitmaps face left
				mc.x = mc.pos.x;
				mc.y = mc.pos.y;
				p -= mc.ray;
			}
		}

		// ----- collisions -----

		/** Pushes the ball away from part n. */
		collideBall(n) {
			const ball = this.game.ball;
			const p = this.parts[n];
			let dx = p.pos.x - ball.x;
			let dy = p.pos.y - ball.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d !== 0) {
				dx /= d;
				dy /= d;
			}
			ball.sx -= this.power * dx;
			ball.sy -= this.power * dy;
			Sound.play(Sound.SERPENT_COLLIDE);
		}

		/** Loses a body ring (its scales fly away). */
		explode() {
			if (this.parts.length <= 2)
				return;
			const p = this.parts[1];
			Sound.play(Sound.SERPENT_HIT);

			for (let i = 0; i < 5; i++) {
				const e = this.game.dmanager.attach("snakePart", Const.BOSS_PLAN);
				const ray = random(p.ray / 2) + p.ray / 2;
				e.gotoAndStop(this.elt);
				e.rotation = random(360);
				e.ang = i * Math.PI / 2.5;
				e.x = p.x + Math.cos(e.ang) * ray;
				e.y = p.y + Math.sin(e.ang) * ray;
				e.xscale = 300;
				e.yscale = 300;
				this.ecailles.push(e);
			}

			MB2.removeFrom(this.parts, p);
			this.updateScales();
			p.removeMovieClip();
			this.excite = 1;
			if (this.parts.length === 2) {
				this.berserk_time = 10;
				this.setExcite(true);
			}
			this.change_pattern(ST_FONCE);
		}

		/**
		 * Is the ball inside the ellipse (rx, ry) of a head / tail part (the
		 * original used hitTest on the symbol) ? ox = offset of the ellipse along
		 * the part.
		 */
		hitPart(p, bx, by, rx, ry, ox) {
			const a = p.rotation * Math.PI / 180;
			const dx = bx - p.x;
			const dy = by - p.y;
			const lx = (dx * Math.cos(a) + dy * Math.sin(a)) / (p.xscale / 100) - ox;
			const ly = (-dx * Math.sin(a) + dy * Math.cos(a)) / (p.yscale / 100);
			return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) < 1;
		}

		collide() {
			const ball = this.game.ball;
			if (ball.hole_death)
				return false;
			const bx = ball.x;
			const by = ball.y;

			// the head : hurt when hit from the front while calm
			let p = this.parts[0];
			if (this.hitPart(p, bx, by, 42, 34, 0)) {
				if (Math.abs(normalize(this.ang - this.toBall())) < 0.3) {
					p.snap = 10;
					this.setExcite(true);
					if (this.excite === 0)
						this.explode();
					this.excite = 6 + random(4);
				}
				this.collideBall(0);
				return true;
			}

			// the tail : kills
			p = this.parts[this.parts.length - 1];
			if (this.hitPart(p, bx, by, 40, 14, 12) && ball.clign_count <= 0) {
				Sound.play(Sound.BUMPER_DEATH);
				ball.die();
				return true;
			}

			// the body
			for (let i = 1; i < this.parts.length; i++) {
				p = this.parts[i];
				const dx = bx - p.pos.x;
				const dy = by - p.pos.y;
				if (dx * dx + dy * dy < p.rsq) {
					this.collideBall(i);
					return true;
				}
			}
			return false;
		}

		// ----- behaviour -----

		change_pattern(forcedState) {
			const excited = this.excite > 0 || this.berserk_time > 0;
			this.state = (forcedState !== undefined) ? forcedState : Std.randomProbas(STATE_PROBAS[excited ? 0 : 1]);
			this.accel = 1.05;
			this.delta = excited ? 0.05 : 0.03;

			switch (this.state) {
			case ST_WAIT:
				this.timer = 0.5;
				this.target_speed = 0;
				break;
			case ST_SEARCH:
				this.timer = 1 + random(100) / 100;
				this.target_speed = 5;
				break;
			case ST_FONCE:
				// charge
				this.accel = 1.15;
				this.timer = 0.5;
				this.ang = this.toBall();
				this.target_speed = 15;
				break;
			case ST_EVADE:
				this.accel = 1.1;
				this.timer = 1 + random(100) / 100;
				this.target_speed = excited ? 8 : 4;
				break;
			case ST_POWER:
				this.cast_power();
				this.change_pattern();
				break;
			}

			if (this.berserk_time > 0) {
				this.timer /= 2;
				this.target_speed *= 1.3;
				this.delta *= 2;
			}
		}

		/** The power of the element, if not too many are active. */
		cast_power() {
			const game = this.game;
			const n = this.powers.length;
			switch (this.elt) {
			case VENT:
				if (n < 1) {
					Sound.play(Sound.POWER_WIND);
					this.powers.push(new MB2.BossPowVent(game, this));
				}
				break;
			case FEU:
				if (n < 3) {
					Sound.play(Sound.POWER_FIRE);
					this.powers.push(new MB2.BossPowFeu(game, this));
				}
				break;
			case EAU:
				if (n < 2) {
					Sound.play(Sound.POWER_WATER);
					this.powers.push(new MB2.BossPowEau(game, this));
				}
				break;
			case TERRE:
				if (n < 3) {
					Sound.play(Sound.POWER_EARTH);
					this.powers.push(new MB2.BossPowTerre(game, this));
				}
				break;
			}
		}

		onPause() { }
	};

})();
