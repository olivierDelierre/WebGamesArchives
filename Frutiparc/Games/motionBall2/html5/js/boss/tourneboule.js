/*
 * "Tourneboule", the final boss of the 5th adventure dungeon.
 * Port of mb2/BossTB.as.
 *
 * Its cycle :
 *   APPEAR   lands in the middle
 *   FLYING   takes off and flies a few loops
 *   MOVING   vanishes and flies invisibly to a random place (the violet ball sees it)
 *   COMEBACK reappears
 *   DROPING  lands
 *   WAITING  waits a moment : vulnerable (the first touch only pops its shield)
 *   KATA     3 katas ; the last one casts a power (wind, fire, water, earth,
 *            broken floor, new blocks), then it flies again.
 * Each hit makes it red. After 4 hits it stops flying and chains katas ;
 * at 20 hits it dies.
 *
 * TRICKY : most transitions happen when an animation of its symbol ends
 * (animDone) or reaches the middle of a kata (kataDone) : see
 * gfx/symbols/boss_tourneboule.js.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;
	const Sound = MB2.Sound;
	const { redTint, approachSpeed, updatePowers } = MB2.BossTools;

	const NHITS = 4;

	const ST_APPEAR = 0;
	const ST_FLYING = 1;
	const ST_MOVING = 2;
	const ST_DROPING = 3;
	const ST_WAITING = 4;
	const ST_KATA = 5;
	const ST_COMEBACK = 6;
	const ST_DEATH = 7;

	// powers (target_power)
	const POW_WIND = 0, POW_FIRE = 1, POW_WATER = 2, POW_EARTH = 3, POW_HOLES = 4, POW_BLOCK = 5;

	MB2.BossTB = class {

		constructor(game) {
			this.game = game;
			this.tb = true;         // tells the powers that they are cast by this boss
			this.powers = [];
			this.dalles = [];       // floor tiles about to become holes
			this.x = Const.LVL_WIDTH / 2;
			this.y = Const.LVL_HEIGHT / 2;
			this.tx = 0;
			this.ty = 0;

			this.mc = game.dmanager.attach("tourneboule", Const.BOSS_PLAN);
			this.bulle = game.dmanager.attach("forceBubble", Const.BOSS_PLAN);
			this.shade = game.dmanager.attach("TBShadow", Const.SHADE_PLAN);
			this.shade.gotoAndPlay("stopFly");
			this.mc.gotoAndPlay("stopFly");
			this.mc.animDone = () => this.animDone();
			this.mc.kataDone = () => this.kataDone();

			this.state = ST_APPEAR;
			this.hits = 0;
			this.hit_time = 0;
			this.bulle_active = false;   // the shield is up
			this.bulle.visible = false;
			this.bulle.alpha = 0;

			this.speed = 0;
			this.target_speed = 0;
			this.accel = 1.05;
			this.timer = 0;
			this.fly_loops = 0;
			this.nkatas = 0;
			this.prev_kata = 0;
			this.target_power = 0;
			this.ncasses = 0;
			this.nblocks = 0;

			this.on_update();
		}

		// ----- the cycle -----

		fly() {
			this.mc.gotoAndPlay("startFly");
			this.shade.gotoAndPlay("startFly");
			this.state = ST_FLYING;
			this.fly_loops = Math.round(3 / Std.tmod);
		}

		/** Vanishes and chooses a destination at least 200 pixels away. */
		move() {
			Sound.play(Sound.TB_HIDE);
			const fx = this.game.dmanager.attach("TBVanish", Const.BOSS_PLAN);
			fx.x = this.mc.x;
			fx.y = this.mc.y;
			this.mc.gotoAndPlay("flyVanish");
			this.shade.gotoAndPlay("flyVanish");
			this.state = ST_MOVING;
			this.accel = 1.05;
			this.target_speed = 10 + random(3);
			do {
				this.tx = 50 + random(Const.LVL_WIDTH - 100);
				this.ty = 50 + random(Const.LVL_HEIGHT - 100);
			} while (Math.hypot(this.x - this.tx, this.y - this.ty) <= 200);
		}

		/** Arrived : a smoke puff, which calls animDone at its end. */
		moveDone() {
			const fx = this.game.dmanager.attach("TBSpawn", Const.BOSS_PLAN);
			this.mc.stop();
			fx.x = this.mc.x;
			fx.y = this.mc.y;
			fx.animDone = () => this.animDone();
			this.state = ST_COMEBACK;
		}

		visibleDone() {
			Sound.play(Sound.TB_HIDE);
			this.mc.gotoAndPlay("stopFly");
			this.shade.gotoAndPlay("stopFly");
			this.speed = 0;
			this.target_speed = 0;
			this.state = ST_DROPING;
			this.mc.alpha = 100;
			this.shade.alpha = 100;
			this.mc.visible = true;
			this.shade.visible = true;
		}

		/** Landed : shield up, waits a bit (less after each hit). */
		wait() {
			this.bulle_active = true;
			this.mc.gotoAndStop(1);
			this.shade.gotoAndStop(1);
			this.state = ST_WAITING;
			this.timer = [0.5, 0.2, 0.1][this.hits] || 0;
		}

		/** Chooses the power of the next 3 katas. */
		waitDone() {
			const wt = this.game.level.interf.walltable;
			this.nkatas = 3;
			for (let n = 0; n < 1000; n++) {
				this.target_power = random(6);
				// once hurt, no more fire / earth
				if (this.hits >= NHITS && (this.target_power === POW_FIRE || this.target_power === POW_EARTH))
					continue;
				if (this.target_power === POW_HOLES && this.ncasses > 20)
					continue;
				if (this.target_power === POW_BLOCK && this.nblocks > 20)
					continue;
				if (this.target_power === POW_EARTH) {
					// no bud over a hole
					const px = (((this.x / Const.DELTA) - Const.BORDER_CSIZE) / 10) | 0;
					const py = (((this.y / Const.DELTA) - Const.BORDER_CSIZE) / 10) | 0;
					if (wt[px] && wt[px][py] && wt[px][py].btype === MB2.Bumper.HOLE)
						continue;
				}
				break;
			}
			this.timer = 0;
			this.nextKata();
			if (this.hits >= NHITS)
				this.nkatas = 0;
		}

		/** Starts the next kata, or flies away / dies after the last one. */
		nextKata() {
			if (this.nkatas === 0) {
				if (this.hits >= 20) {
					this.die();
				} else if (this.hits >= NHITS) {
					// hurt : no more flights, katas in a row
					this.hit_time = 1;
					this.hits++;
					this.waitDone();
				} else
					this.fly();
				return;
			}

			// the first kata shows the power to come, the others are random
			let kata;
			if (this.nkatas === 3) {
				kata = this.target_power + 1;
			} else {
				do {
					kata = random(6) + 1;
				} while (kata === this.prev_kata);
			}
			const sound = (this.nkatas === 1) ? 4 : 1 + random(3);
			Sound.play("kata" + sound);

			this.prev_kata = kata;
			this.mc.gotoAndStop("kata" + kata);
			this.shade.gotoAndStop("kata" + kata);
			this.nkatas--;
			this.state = ST_KATA;
		}

		/** Middle of a kata : the last kata casts the power. */
		kataDone() {
			if (this.nkatas !== 0)
				return;
			const game = this.game;

			switch (this.target_power) {
			case POW_WIND: {
				Sound.play(Sound.POWER_WIND);
				this.powers.push(new MB2.BossPowVent(game, this));
				const delayed = new MB2.BossPowVent(game, this);
				delayed.ray = -50;
				this.powers.push(delayed);
				break;
			}

			case POW_FIRE: {
				// fire pillars around it (except toward the walls)
				const MARGIN = 80;
				Sound.play(Sound.POWER_FIRE);
				const pillar = (dx, dy) => {
					const p = new MB2.BossPowFeu(game, this);
					p.mc.x += dx;
					p.mc.y += dy;
					p.mc.gotoAndPlay(1 + random(5));
					this.powers.push(p);
				};
				if (this.x > MARGIN)
					pillar(-50, 0);
				if (this.x < Const.LVL_WIDTH - MARGIN)
					pillar(50, 0);
				if (this.y > MARGIN)
					pillar(0, -50);
				if (this.y < Const.LVL_HEIGHT - MARGIN)
					pillar(0, 50);
				break;
			}

			case POW_WATER:
				// 4 drops in diagonal
				Sound.play(Sound.POWER_WATER);
				for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
					const p = new MB2.BossPowEau(game, this);
					p.ang = a;
					this.powers.push(p);
				}
				break;

			case POW_EARTH:
				Sound.play(Sound.POWER_EARTH);
				this.powers.push(new MB2.BossPowTerre(game, this));
				break;

			case POW_HOLES: {
				// 1 to 3 floor tiles crack, then fall (see on_update)
				const n = random(3) + 1;
				this.ncasses += n;
				for (let i = 0; i < n; i++) {
					const cell = this.randomFreeCell();
					if (!cell)
						break;
					game.level.interf.walltable[cell.x][cell.y] = { btype: -1 };  // reserved
					const fx = game.dmanager.attach("FXDalleCut", Const.BONUS_PLAN);
					fx.x = cell.x * 10 * Const.DELTA + Const.BORDER_SIZE;
					fx.y = cell.y * 10 * Const.DELTA + Const.BORDER_SIZE;
					this.dalles.push({ mc: fx, px: cell.x, py: cell.y });
				}
				break;
			}

			case POW_BLOCK: {
				const cell = this.randomFreeCell();
				this.nblocks++;
				if (!cell)
					break;
				const block = game.level.gen_bumper({
					btype: MB2.Bumper.WALL,
					x: cell.x * 10 + Const.BORDER_CSIZE,
					y: cell.y * 10 + Const.BORDER_CSIZE
				});
				if (block)
					game.level.objects.push(block);
				game.level.interf.update_walls();
				break;
			}
			}
		}

		/** A random empty wall cell, away from the corners holes and the center. */
		randomFreeCell() {
			const wt = this.game.level.interf.walltable;
			const FORBIDDEN = [[0, 0], [13, 0], [6, 4], [7, 4], [6, 5], [7, 5]];
			for (let n = 0; n < 1000; n++) {
				const px = random(14);
				const py = random(9);
				if (FORBIDDEN.some(([x, y]) => x === px && y === py))
					continue;
				if (wt[px][py] == null)
					return { x: px, y: py };
			}
			return null;
		}

		die() {
			this.mc.gotoAndPlay("death");
			this.shade.gotoAndPlay("death");
			this.state = ST_DEATH;
			for (const p of this.powers.slice())
				p.destroy();
		}

		/** End of an animation of the symbol : next step of the cycle. */
		animDone() {
			if (this.game.game_over_flag) {
				this.mc.stop();
				this.shade.stop();
				return;
			}

			switch (this.state) {
			case ST_APPEAR:
				this.fly();
				break;
			case ST_FLYING:
				if (this.fly_loops-- <= 0) {
					this.move();
				} else {
					this.mc.gotoAndPlay("fly");
					this.shade.gotoAndPlay("fly");
				}
				break;
			case ST_DROPING:
				this.wait();
				break;
			case ST_KATA:
				this.nextKata();
				break;
			case ST_COMEBACK:
				this.visibleDone();
				break;
			case ST_DEATH:
				this.mc.stop();
				this.shade.stop();
				this.game.boss_update = null;
				this.game.gameOver(Const.CAUSE_WINS);
				break;
			}
		}

		toBall() {
			return Math.atan2(this.game.ball.y - this.y, this.game.ball.x - this.x);
		}

		/** (The original paused its timeline here : the port freezes all the animations instead.) */
		onPause() { }

		// ----- every frame -----

		on_update() {
			const mc = this.mc;

			approachSpeed(this);
			updatePowers(this.powers);
			this.update_dalles();

			switch (this.state) {
			case ST_MOVING:
				this.update_moving();
				break;
			case ST_KATA:
				// the katas are played frame by frame, a bit faster when the game lags
				this.timer += Math.pow(Std.tmod, 1.3);
				while (this.timer > 1 && this.state === ST_KATA) {
					this.timer--;
					mc.nextFrame();
					this.shade.nextFrame();
				}
				break;
			case ST_WAITING:
				this.timer -= Std.deltaT;
				if (this.timer <= 0)
					this.waitDone();
				break;
			}

			if (this.state === ST_WAITING || this.state === ST_KATA)
				this.collide();

			// the shield fades
			if (this.bulle.alpha > 0) {
				this.bulle.alpha -= Std.deltaT * 200;
				if (this.bulle.alpha < 0) {
					this.bulle.alpha = 0;
					this.bulle.visible = false;
				}
			}

			// red flash after a hit
			if (this.hit_time > 0) {
				this.hit_time -= Std.deltaT;
				if (this.hit_time < 0) {
					this.hit_time = 0;
					mc.tint = null;
				} else
					mc.tint = redTint(this.hit_time * 300);
			}

			mc.x = this.x;
			mc.y = this.y;
			this.shade.x = this.x;
			this.shade.y = this.y;
			this.bulle.x = this.x;
			this.bulle.y = this.y;
		}

		/** When a cracking tile animation ends, the tile becomes a hole. */
		update_dalles() {
			const game = this.game;
			const wt = game.level.interf.walltable;
			for (let i = 0; i < this.dalles.length; i++) {
				const d = this.dalles[i];
				if (!d.mc.removed)
					continue;
				this.dalles.splice(i--, 1);
				wt[d.px][d.py] = wt[0][8];   // a copy of a corner hole
				const tile = game.dmanager.attach("dalle", Const.BONUS_PLAN);
				tile.x = d.px * 10 * Const.DELTA + Const.BORDER_SIZE;
				tile.y = d.py * 10 * Const.DELTA + Const.BORDER_SIZE;
				if (this.dalles.length === 0) {
					Sound.play(Sound.CASSE);
					game.level.interf.update_walls();
				}
			}
		}

		/** Invisible flight toward (tx, ty). */
		update_moving() {
			const mc = this.mc;
			const ball = this.game.ball;

			let dx = this.tx - this.x;
			let dy = this.ty - this.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d > 0) {
				dx /= d;
				dy /= d;
			}
			const s = Math.min(this.speed * Std.tmod, d);
			this.x += dx * s;
			this.y += dy * s;

			// the violet ball sees it when close
			if (ball.btype === MB2.BallType.VIOLET) {
				const bx = ball.x - this.x;
				const by = ball.y - this.y;
				const alpha = (200000 / (bx * bx + by * by)) | 0;
				mc.alpha = alpha;
				this.shade.alpha = alpha;
				mc.visible = true;
				this.shade.visible = true;
			} else {
				mc.visible = false;
				this.shade.visible = false;
			}

			const labels = mc.sym.labels;
			if (s === d && mc.frame >= labels.flyVanish && mc.frame <= labels.flyVanishEnd)
				this.moveDone();
		}

		/** Touched by the ball : pops the shield, or is hurt. The ball bounces. */
		collide() {
			const ball = this.game.ball;
			let dx = ball.x - this.x;
			let dy = ball.y - this.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d >= 30)
				return;

			if (this.bulle_active) {
				this.bulle.visible = true;
				this.bulle.alpha = 100;
				this.bulle_active = false;
			} else if (this.hit_time === 0) {
				Sound.play(Sound.TB_HIT);
				this.hit_time = 1;
				this.hits++;
			}
			if (d !== 0) {
				dx /= d;
				dy /= d;
			}
			ball.sx += 30 * dx;
			ball.sy += 30 * dy;
		}
	};

})();
