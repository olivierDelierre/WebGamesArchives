/*
 * Earth power : a bud grows on the floor for 10-20 seconds. When the ball
 * touches it, a vine ties the ball to it ; the vine breaks when the ball gets
 * more than 225 pixels away. Port of mb2/BossPowTerre.as.
 *
 * The vine is a chain of 10 segments linked by springs (a verlet-like rope),
 * the last one being linked to the ball.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;

	const SEGMENTS = 10;
	const ROPE_LENGTH = 5;   // rest length of a segment
	const BREAK_DISTANCE = 225;

	MB2.BossPowTerre = class {

		constructor(game, boss) {
			this.game = game;
			this.boss = boss;
			this.tied = false;
			this.casse = false;     // the vine is breaking
			this.moveList = [];     // the segments, then the ball

			// the bud is placed in the middle of the wall cell under the boss
			this.mc = game.dmanager.attach("FXbourgeon", Const.BONUS_PLAN);
			let px = (boss.x / Const.DELTA) - Const.BORDER_CSIZE;
			let py = (boss.y / Const.DELTA) - Const.BORDER_CSIZE;
			px -= px % 10;
			py -= py % 10;
			this.mc.x = px * Const.DELTA + Const.BORDER_SIZE + 20;
			this.mc.y = py * Const.DELTA + Const.BORDER_SIZE + 20;

			this.time = 10 + random(10);
		}

		initLiane() {
			const game = this.game;
			let prev = null;
			this.mc.gotoAndPlay("explode");

			for (let i = 0; i < SEGMENTS; i++) {
				const segment = game.dmanager.attach("FXLiane", Const.BONUS_PLAN);
				segment.x = this.mc.x;
				segment.y = this.mc.y;
				segment.sx = 0;
				segment.sy = 0;
				segment.link = prev;
				segment.flFixe = (i === 0);   // the first one is fixed on the bud
				prev = segment;
				this.moveList.push(segment);
			}
			game.ball.link = prev;
			this.moveList.push(game.ball);
		}

		updateLiane() {
			const ball = this.game.ball;

			if (this.casse) {
				// the segments fade out
				for (let i = 0; i < this.moveList.length - 1; i++) {
					const m = this.moveList[i];
					m.alpha -= 10 * Std.tmod;
					if (m.alpha <= 0) {
						this.moveList.splice(i--, 1);
						m.removeMovieClip();
					}
				}
				if (this.moveList.length <= 1) {
					ball.link = null;
					this.moveList = [];
					this.casse = false;
					this.tied = false;
					this.time = 0;
				}
				return;
			}

			// springs : each element is pulled toward the element it is linked to
			for (const m of this.moveList) {
				if (m.link != null) {
					let dx = m.link.x - m.x;
					let dy = m.link.y - m.y;
					const d = Math.sqrt(dx * dx + dy * dy);
					if (d > ROPE_LENGTH) {
						const c = (d / ROPE_LENGTH) - 1;
						dx *= c * 0.01;
						dy *= c * 0.01;
						m.sx += dx;
						m.sy += dy;
						m.link.sx -= dx;
						m.link.sy -= dy;
					}
				}
				// the ball moves by itself (it only receives the forces)
				if (m === ball)
					continue;
				m.sx *= Math.pow(0.95, Std.tmod);
				m.sy *= Math.pow(0.95, Std.tmod);
				if (!m.flFixe) {
					m.x += m.sx * Std.tmod;
					m.y += m.sy * Std.tmod;
				}
			}

			// orient the segments toward the next element
			for (let i = 0; i < this.moveList.length - 1; i++) {
				const m1 = this.moveList[i];
				const m2 = this.moveList[i + 1];
				const dx = m2.x - m1.x;
				const dy = m2.y - m1.y;
				m1.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
				m1.len = Math.sqrt(dx * dx + dy * dy);
			}

			const dx = this.mc.x - ball.x;
			const dy = this.mc.y - ball.y;
			if (Math.sqrt(dx * dx + dy * dy) > BREAK_DISTANCE || ball.hole_death)
				this.casse = true;
		}

		update() {
			this.time -= Std.deltaT;

			if (this.tied) {
				this.updateLiane();
				return;
			}
			if (this.time < 0) {
				this.mc.gotoAndPlay("death");
				MB2.removeFrom(this.boss.powers, this);
				return;
			}
			if (Math.sqrt(MB2.Tools.dist2(this.mc, this.game.ball.mc)) < 30) {
				this.casse = false;
				this.tied = true;
				this.initLiane();
				this.updateLiane();
			}
		}

		destroy() {
			this.time = 0;
			this.casse = true;
		}
	};

})();
