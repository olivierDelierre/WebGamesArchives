/*
 * The player's ball.
 *
 * In the original, the ball was built from 4 symbols : "marble" (the coloured
 * sphere), "stone" (little spots, masked by "round", moved to fake the
 * rolling) and "light". Here "marble" draws everything, reading the state of
 * the Ball object (game/ball.js) : c.ball.btype and c.ball.stoneList.
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;

	/** The ball's shadow on the floor. */
	SYM.shadow = {
		draw(ctx) {
			ctx.fillStyle = "rgba(40,0,60,0.3)";
			ctx.beginPath();
			ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	SYM.marble = {
		w: 18, h: 18,
		draw(ctx, c) {
			const ball = c.ball;
			const col = MB2.BALL_COLORS[ball.btype] || MB2.BALL_COLORS[0];
			const R = 9;

			G.ball(ctx, 0, 0, R, col[0], col[1], col[2]);

			// rolling spots (Ball.move_stones computes their position and alpha)
			ctx.save();
			G.circle(ctx, 0, 0, R - 0.5);
			ctx.clip();
			for (const stone of ball.stoneList) {
				if (stone.alpha <= 0)
					continue;
				ctx.globalAlpha = Math.min(1, stone.alpha / 100) * 0.55;
				ctx.fillStyle = stone.col;
				G.circle(ctx, stone.x, stone.y, stone.size);
				ctx.fill();
			}
			ctx.restore();

			// light
			G.shine(ctx, 0, 0, R, 0.75);
			ctx.strokeStyle = "rgba(0,0,0,0.25)";
			ctx.lineWidth = 1;
			G.circle(ctx, 0, 0, R);
			ctx.stroke();
		}
	};

})();
