/*
 * The in-game interface : time counter, balls left and keys.
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;

	/*
	 * The counter in the top-left corner.
	 *   frame 1        Challenge / Aventure : time left (in tenths of seconds)
	 *   frame 2        "classic" : level + time left
	 *   frames 3-11    "time" : Course chronometer + laps left (fade in, then stopped on 11)
	 *   frames 12-20   lap animation (play() from frame 11), back to 11
	 *
	 * The texts are set by Interf.update / Game.next_room : txt, niv, lap, min, sec, mil.
	 * The registration point is on the right (the clip is at x = LVL_WIDTH).
	 */
	SYM["time counter"] = {
		frames: 20,
		labels: { classic: 2, time: 3 },
		actions: { 1: F.stop, 2: F.stop, 11: F.stop, 20: F.goto(11) },

		init(c) {
			c.txt = "";
			c.niv = "";
			c.lap = "";
			c.min = "00";
			c.sec = "00";
			c.mil = "00";
		},

		draw(ctx, c) {
			const pill = (x, w) => {
				ctx.fillStyle = "rgba(230,255,215,0.45)";
				G.rrect(ctx, x, 1, w, 24, 6);
				ctx.fill();
				ctx.strokeStyle = "rgba(255,255,255,0.5)";
				ctx.lineWidth = 1;
				ctx.stroke();
			};
			const text = (t, x, color) => G.text(ctx, t, x, 14, 20, color || "#ffffff", "rgba(70,150,40,0.55)");

			ctx.save();
			ctx.translate(-MB2.Const.LVL_WIDTH, 0);

			if (c.frame === 1) {
				pill(1, 92);
				text(c.txt, 47);

			} else if (c.frame === 2) {
				pill(1, 64);
				text(c.niv, 33);
				pill(69, 78);
				MB2.drawClockIcon(ctx, 84, 14);
				text(c.txt, 118);

			} else {
				const fadeIn = c.frame < 11 ? (c.frame - 3) / 8 : 1;
				const lap = c.frame > 11 ? (c.frame - 11) / 9 : 0;

				ctx.globalAlpha *= fadeIn;
				pill(1, 112);
				text(c.min + "'" + c.sec + "\"" + c.mil, 57);
				pill(117, 50);
				MB2.drawLapIcon(ctx, 132, 14);
				text(c.lap, 152, lap > 0 ? "#ffe060" : "#fff");

				if (lap > 0) {
					ctx.globalAlpha = Math.sin(lap * Math.PI);
					G.text(ctx, "TOUR !", 305, 120, 40 + lap * 10, "#ffe060", "#7a3a00");
				}
			}

			ctx.restore();
		}
	};

	MB2.drawClockIcon = function (ctx, x, y) {
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1.5;
		G.circle(ctx, x, y, 6);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x, y - 4);
		ctx.moveTo(x, y);
		ctx.lineTo(x + 3, y);
		ctx.stroke();
	};

	MB2.drawLapIcon = function (ctx, x, y) {
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(x, y, 5.5, -Math.PI * 0.2, Math.PI * 1.5);
		ctx.stroke();
		ctx.fillStyle = "#fff";
		ctx.beginPath();
		ctx.moveTo(x + 2, y - 8);
		ctx.lineTo(x + 6, y - 5);
		ctx.lineTo(x + 1, y - 3);
		ctx.fill();
	};

	/** A ball left, on the bottom border : "select", or "on" for the current ball. Child `ball` = colour. */
	SYM["ball icon"] = {
		frames: 2,
		labels: { select: 1, on: 2 },
		init(c) {
			c.ball = MB2.frameHolder();
		},
		draw(ctx, c) {
			const col = MB2.BALL_COLORS[c.ball.frame - 1];
			const current = c.frame === 2;
			const r = 11.5;

			ctx.fillStyle = current ? "#ffffff" : "rgba(60,110,30,0.5)";
			G.circle(ctx, 0, 0, r + 1.5);
			ctx.fill();

			const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, r);
			g.addColorStop(0, col[2]);
			g.addColorStop(0.45, col[0]);
			g.addColorStop(1, col[1]);
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, r);
			ctx.fill();
		}
	};

	/** A key (bell) owned. "hit" when it is used. */
	SYM["icon grelot"] = {
		frames: 12,
		labels: { hit: 2 },
		actions: { 1: F.stop, 12: F.remove },
		draw(ctx, c) {
			if (c.frame > 1) {
				const t = (c.frame - 2) / 10;
				ctx.globalAlpha *= 1 - t;
				ctx.scale(1 + t, 1 + t);
			}
			MB2.drawGrelot(ctx, 1);
		}
	};

})();
