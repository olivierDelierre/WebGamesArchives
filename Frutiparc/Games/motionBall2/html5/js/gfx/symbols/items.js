/*
 * Symbols of the things the ball collects : pastilles, item boxes, balls,
 * the Classique mode hatch, and the collision spark.
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;

	/** Red pastille : collect them all to open the doors. 6 x 6 cells. */
	SYM.red = {
		w: 24, h: 24,
		frames: 12,
		labels: { hit: 2 },
		actions: { 1: F.stop, 12: F.remove },
		draw(ctx, c) {
			if (c.frame > 1) {
				G.sparkle(ctx, (c.frame - 2) / 10, "#ff5040");
				return;
			}
			const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 12);
			halo.addColorStop(0, "rgba(255,255,255,0.9)");
			halo.addColorStop(1, "rgba(255,255,255,0)");
			ctx.fillStyle = halo;
			G.circle(ctx, 0, 0, 12);
			ctx.fill();
			G.ball(ctx, 0, 0, 7, "#ff2a2a", "#8a0000", "#ffd0d0");
		}
	};

	/**
	 * Time pastille ("blue" in the code). Its colour in the original is unknown :
	 * the screenshots show gold dots, used here.
	 */
	SYM.blue = {
		w: 24, h: 24,
		frames: 12,
		labels: { hit: 2 },
		actions: { 1: F.stop, 12: F.remove },
		draw(ctx, c) {
			if (c.frame > 1) {
				G.sparkle(ctx, (c.frame - 2) / 10, "#ffd040");
				return;
			}
			ctx.fillStyle = "rgba(60,0,60,0.25)";
			G.circle(ctx, 2, 2, 6);
			ctx.fill();
			G.ball(ctx, 0, 0, 6, "#ffcc22", "#b06a00", "#fff6c0");
		}
	};

	/** Spark where the ball hits a wall (plays once). */
	SYM.hit = {
		w: 16, h: 16,
		frames: 8,
		actions: { 8: F.remove },
		init(c) {
			c.playing = true;
		},
		draw(ctx, c) {
			const t = (c.frame - 1) / 7;
			ctx.globalAlpha *= 1 - t;
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 1.5;
			for (let i = 0; i < 4; i++) {
				const a = i * Math.PI / 2 + Math.PI / 4;
				ctx.beginPath();
				ctx.moveTo(Math.cos(a) * (2 + t * 6), Math.sin(a) * (2 + t * 6));
				ctx.lineTo(Math.cos(a) * (4 + t * 10), Math.sin(a) * (4 + t * 10));
				ctx.stroke();
			}
		}
	};


	// ----- Classique mode -----

	/**
	 * The hatch of the Classique rooms. "anim_open" opens it (when the red
	 * pastilles are collected) ; at its end `flOpen` becomes true and the ball
	 * can fall into it (Collide.classic_exit_on_hit).
	 */
	SYM.exit = {
		w: 40, h: 40,
		frames: 14,
		labels: { anim_open: 2 },
		actions: {
			1: F.stop,
			14: c => {
				c.stop();
				c.flOpen = true;
			}
		},
		init(c) {
			c.flOpen = false;
		},
		draw(ctx, c) {
			ctx.fillStyle = "#2a0c40";
			G.rrect(ctx, -17, -17, 34, 34, 8);
			ctx.fill();

			const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
			g.addColorStop(0, "#000");
			g.addColorStop(1, "#4a1a6a");
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, 14);
			ctx.fill();

			// the two flaps slide apart
			const open = c.frame === 1 ? 0 : (c.frame - 1) / 13;
			if (open < 1) {
				ctx.save();
				ctx.beginPath();
				ctx.rect(-17, -17, 34, 34);
				ctx.clip();
				ctx.fillStyle = "#d8a8f0";
				ctx.strokeStyle = "#7a3a9a";
				ctx.lineWidth = 1.5;
				G.rrect(ctx, -17 - open * 17, -17, 17, 34, 5);
				ctx.fill();
				ctx.stroke();
				G.rrect(ctx, open * 17, -17, 17, 34, 5);
				ctx.fill();
				ctx.stroke();
				ctx.restore();
			}

			ctx.strokeStyle = c.flOpen ? "#7cff4a" : "#b070d8";
			ctx.lineWidth = 2;
			G.rrect(ctx, -18, -18, 36, 36, 8);
			ctx.stroke();
		}
	};

	/** The mask of the ball falling through the hatch : replaced by a circle in Collide.classic_exit_on_hit. */
	SYM.maskHole = {
		w: 40, h: 40,
		draw() { }
	};


	// ----- item box -----

	/** Icon of an item : 0 map, 1 radar, 2 small time, 3 big time, 4 key (a bell). */
	MB2.drawItemIcon = function (ctx, item, scale) {
		ctx.save();
		ctx.scale(scale, scale);

		switch (item) {
		case 0: // map
			ctx.fillStyle = "#ffe07a";
			ctx.strokeStyle = "#b07a00";
			ctx.lineWidth = 1.5;
			G.rrect(ctx, -11, -8, 22, 16, 3);
			ctx.fill();
			ctx.stroke();
			ctx.strokeStyle = "#c0902a";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(-4, -8);
			ctx.lineTo(-4, 8);
			ctx.moveTo(4, -8);
			ctx.lineTo(4, 8);
			ctx.moveTo(-11, 0);
			ctx.lineTo(11, 0);
			ctx.stroke();
			ctx.fillStyle = "#e0301a";
			G.circle(ctx, 6, -4, 2);
			ctx.fill();
			break;

		case 1: // radar
			G.ball(ctx, 0, 0, 10, "#2a9a4a", "#0a3a1a", "#8affa0");
			ctx.strokeStyle = "rgba(160,255,170,0.8)";
			ctx.lineWidth = 1;
			G.circle(ctx, 0, 0, 6);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(8, -5);
			ctx.stroke();
			ctx.fillStyle = "#ff4040";
			G.circle(ctx, -4, 3, 1.8);
			ctx.fill();
			break;

		case 2: // small time
		case 3: { // big time
			const r = item === 2 ? 8 : 11;
			G.ball(ctx, 0, 0, r, item === 2 ? "#9ad8ff" : "#4aa8ff", "#1a4a9a", "#fff");
			ctx.strokeStyle = "#0a2a6a";
			ctx.lineWidth = 1.5;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(0, -r * 0.7);
			ctx.moveTo(0, 0);
			ctx.lineTo(r * 0.5, 0);
			ctx.stroke();
			break;
		}

		case 4: // key
			MB2.drawGrelot(ctx, 1);
			break;
		}

		ctx.restore();
	};

	/** The "grelot" (bell) : the key of the game, it opens a door. */
	MB2.drawGrelot = function (ctx, scale) {
		ctx.save();
		ctx.scale(scale, scale);
		G.ball(ctx, 0, 1, 8, "#ffd84a", "#a86a00", "#fff8c0");
		ctx.fillStyle = "#6a4000";
		ctx.fillRect(-5, 2, 10, 1.5);
		G.circle(ctx, 0, 5, 1.8);
		ctx.fill();
		ctx.strokeStyle = "#a86a00";
		ctx.lineWidth = 1.5;
		G.circle(ctx, 0, -8, 2.5);
		ctx.stroke();
		ctx.restore();
	};

	/** Item box of the bonus rooms : a bubble with an item (child `item`, frame = item + 1). */
	SYM.itembox = {
		w: 48, h: 48,
		frames: 16,
		labels: { hit: 2 },
		actions: { 1: F.stop, 16: F.stop },
		init(c) {
			c.item = MB2.frameHolder();
		},
		draw(ctx, c) {
			const item = c.item.frame - 1;

			if (c.frame === 1) {
				const t = (MB2.frameCount || 0) / 20;
				const g = ctx.createRadialGradient(-6, -8, 3, 0, 0, 23);
				g.addColorStop(0, "rgba(255,255,255,0.9)");
				g.addColorStop(0.6, "rgba(200,240,255,0.35)");
				g.addColorStop(1, "rgba(120,200,255,0.6)");
				ctx.fillStyle = g;
				G.circle(ctx, 0, 0, 23);
				ctx.fill();
				ctx.strokeStyle = "rgba(255,255,255,0.8)";
				ctx.lineWidth = 1.5;
				ctx.stroke();
				MB2.drawItemIcon(ctx, item, 1 + 0.08 * Math.sin(t * 3));
				G.shine(ctx, 0, 0, 22, 0.55);
			} else {
				// taken : the bubble bursts and the item grows
				const k = (c.frame - 2) / 14;
				ctx.globalAlpha *= 1 - k;
				ctx.strokeStyle = "#fff";
				ctx.lineWidth = 2;
				G.circle(ctx, 0, 0, 23 + k * 20);
				ctx.stroke();
				MB2.drawItemIcon(ctx, item, 1 + k);
			}
		}
	};

	/** A ball to collect (child `ball`, frame = ball type + 1). */
	SYM.ballbox = {
		w: 48, h: 48,
		frames: 16,
		labels: { hit: 2 },
		actions: { 1: F.stop, 16: F.remove },
		init(c) {
			c.ball = MB2.frameHolder();
		},
		draw(ctx, c) {
			const t = (MB2.frameCount || 0) / 15;
			const k = c.frame === 1 ? 0 : (c.frame - 2) / 14;
			const col = MB2.BALL_COLORS[c.ball.frame - 1] || MB2.BALL_COLORS[0];

			ctx.globalAlpha *= 1 - k;

			// aura
			const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 24 + k * 20);
			g.addColorStop(0, "rgba(255,255,255,0.8)");
			g.addColorStop(0.5, "rgba(255,255,255,0.25)");
			g.addColorStop(1, "rgba(255,255,255,0)");
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, 24 + k * 20);
			ctx.fill();

			ctx.strokeStyle = "rgba(255,255,255,0.6)";
			ctx.lineWidth = 1.5;
			G.circle(ctx, 0, 0, 20 + Math.sin(t) * 2);
			ctx.stroke();

			// the ball floats
			const y = Math.sin(t * 1.3) * 2;
			G.ball(ctx, 0, y, 9, col[0], col[1], col[2]);
			G.shine(ctx, 0, y, 9, 0.7);
		}
	};

})();
