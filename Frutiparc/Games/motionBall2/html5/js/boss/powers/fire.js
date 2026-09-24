/*
 * Fire power : a fire pillar left on the floor for 10-20 seconds. Touching it
 * (once it burns) costs a ball. Port of mb2/BossPowFeu.as.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;

	MB2.BossPowFeu = class {

		constructor(game, boss) {
			this.game = game;
			this.boss = boss;
			this.mc = game.dmanager.attach("FXFire", Const.DUMMY_PLAN);
			this.mc.flLoopv = true;   // the pillar burns while true (see the FXFire symbol)
			this.mc.x = boss.x;
			this.mc.y = boss.y;
			this.time = 10 + random(10);
		}

		update() {
			const ball = this.game.ball;

			this.time -= Std.deltaT;
			if (this.time < 0) {
				this.mc.flLoopv = false;
				MB2.removeFrom(this.boss.powers, this);
			}

			// harmless while it starts (frames < 16) or ends
			if (ball.hole_death || ball.clign_count > 0 || this.mc.frame < 16 || !this.mc.flLoopv)
				return;

			const dx = this.mc.x - ball.mc.x;
			const dy = this.mc.y - ball.mc.y;
			if (Math.sqrt(dx * dx + (dy * dy) / 3) < 15) {
				this.time = 0;
				ball.kill();
			}
		}

		destroy() {
			this.time = 0;
		}
	};

})();
