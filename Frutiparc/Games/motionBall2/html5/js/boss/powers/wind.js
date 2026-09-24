/*
 * Wind power : a growing whirlwind that blows the ball away for 2 seconds.
 * Port of mb2/BossPowVent.as.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;

	const NPARTS = 5;

	MB2.BossPowVent = class {

		constructor(game, boss) {
			this.game = game;
			this.boss = boss;
			this.ray = 0;        // radius of the whirlwind (the final boss starts one at -50 : a delayed one)
			this.ang = 0;
			this.hit = 0;
			this.x = boss.x;
			this.y = boss.y;

			this.parts = [];
			for (let i = 0; i < NPARTS; i++) {
				const p = game.dmanager.attach("FXWind", Const.BOSS_PLAN);
				p.ang = Math.PI * 2 * i / NPARTS;
				p.time = 2;
				p.ox = this.x;
				p.oy = this.y;
				this.parts.push(p);
			}
		}

		update() {
			const ball = this.game.ball;

			this.ray += 5 * Std.tmod;
			this.ang += Std.tmod / 12;

			// the gusts turn around the center, oriented along their movement
			for (let i = 0; i < this.parts.length; i++) {
				const p = this.parts[i];
				p.time -= Std.deltaT;
				if (p.time < 0) {
					p.removeMovieClip();
					this.parts.splice(i--, 1);
					continue;
				}
				const s = Math.min(Math.max(this.ray, 0), 100);
				p.xscale = s;
				p.yscale = s;
				const a = p.ang + this.ang;
				const px = Math.cos(a) * this.ray + this.x;
				const py = Math.sin(a) * this.ray + this.y;
				p.x = px;
				p.y = py;
				p.rotation = Math.atan2(py - p.oy, px - p.ox) * 180 / Math.PI;
				p.ox = px;
				p.oy = py;
			}

			// inside the whirlwind, the ball is pushed away from its center
			if (this.hit === 0) {
				let dx = this.x - ball.x;
				let dy = this.y - ball.y;
				const d = Math.max(10, Math.sqrt(dx * dx + dy * dy));
				if (d < this.ray) {
					dx /= d;
					dy /= d;
					const pow = (this.boss.tb ? 30 : 10) / Math.sqrt(d);
					ball.sx -= dx * pow;
					ball.sy -= dy * pow;
				}
			} else {
				this.hit = Math.max(0, this.hit - Std.deltaT);
			}

			if (this.parts.length === 0)
				MB2.removeFrom(this.boss.powers, this);
		}

		destroy() { }
	};

})();
