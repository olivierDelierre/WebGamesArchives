/*
 * Water power : a drop thrown toward the ball. When it touches the ball, the
 * floor gets slippery for 10-15 seconds (Ball.water). Port of mb2/BossPowEau.as.
 *
 * A power has update() (every frame, from its boss) and destroy() (the boss
 * dies). It removes itself from boss.powers when it ends. The final boss
 * (boss.tb) throws faster, curving drops.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;

	MB2.BossPowEau = class {

		constructor(game, boss) {
			this.game = game;
			this.boss = boss;
			this.active = false;    // the ball is wet
			this.mc = game.dmanager.attach("FXWater", Const.DUMMY_PLAN);
			this.x = boss.x;
			this.y = boss.y;
			this.parts = [];
			this.ang = boss.toBall();
			this.speed = 1;
			this.gliss_time = 0;
			this.da = boss.tb ? 0.01 : 0;
			this.acc = boss.tb ? 1.03 : 1;
		}

		/** The splash. */
		genParts() {
			const DX = [-1, -2, 1, 2];
			for (let i = 0; i < 4; i++) {
				const p = this.game.dmanager.attach("FXWaterParticule", Const.DUMMY_PLAN);
				p.dx = DX[i];
				p.dy = -(3 + random(2));
				p.x = this.x;
				p.y = this.y;
				p.gotoAndStop(1 + random(3));
				this.parts.push(p);
			}
		}

		updateParts() {
			for (let i = 0; i < this.parts.length; i++) {
				const p = this.parts[i];
				p.x += p.dx * Std.tmod;
				p.y += p.dy * Std.tmod;
				p.dy += 0.4 * Std.tmod;
				p.xscale -= 200 * Std.deltaT;
				p.yscale -= 200 * Std.deltaT;
				if (p.xscale < 5) {
					this.parts.splice(i--, 1);
					p.removeMovieClip();
				}
			}
		}

		/** The wet trail behind the ball. */
		updateTrainee() {
			if (!this.active)
				return;
			const ball = this.game.ball;
			if (ball.hole_death) {
				this.gliss_time = 0;
				return;
			}
			const trail = this.game.dmanager.attach("FXWaterQueue", Const.BONUS_PLAN);
			trail.x = ball.x + 2;
			trail.y = ball.y + 2;
			trail.rotation = (Math.atan2(ball.sy, ball.sx) + Math.PI) * 180 / Math.PI;
			trail.xscale = ball.speed * 3;
			trail.alpha = Math.min(this.gliss_time, 1) * 100;
		}

		update() {
			this.updateParts();
			this.updateTrainee();

			if (this.active) {
				this.gliss_time -= Std.deltaT;
				this.game.ball.water = true;
				if (this.gliss_time < 0 && this.parts.length === 0) {
					this.active = false;
					this.game.ball.water = false;
					MB2.removeFrom(this.boss.powers, this);
				}
				return;
			}

			// the drop flies
			this.ang += this.da * Std.tmod;
			this.speed *= Math.pow(this.acc, Std.tmod);
			this.x += Math.cos(this.ang) * Std.tmod * this.speed;
			this.y += Math.sin(this.ang) * Std.tmod * this.speed;
			if (this.x < -50 || this.y < -50 || this.x > Const.LVL_WIDTH + 50 || this.y > Const.LVL_HEIGHT + 50) {
				this.mc.removeMovieClip();
				MB2.removeFrom(this.boss.powers, this);
				return;
			}
			this.mc.x = this.x;
			this.mc.y = this.y;

			if (Math.sqrt(MB2.Tools.dist2(this.game.ball.mc, this.mc)) < 25)
				this.explode();
		}

		explode() {
			this.mc.removeMovieClip();
			this.gliss_time = 10 + random(5);
			this.genParts();
			this.active = true;
			this.update();
		}

		destroy() {
			if (!this.active)
				this.explode();
			this.gliss_time = 0;
			this.update();
		}
	};

})();
