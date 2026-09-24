/*
 * Effects of the bosses : the elemental powers (boss/powers/) and the floor
 * breaking (octopus and final boss).
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;
	const TAU = Math.PI * 2;

	// ----- floor -----

	/** A floor tile falling into a new hole. Registration : top-left of the 40 x 40 cell. Plays once. */
	SYM.dalle = {
		w: 40, h: 40,
		frames: 24,
		actions: { 24: F.remove },
		init(c) {
			c.playing = true;
		},
		draw(ctx, c) {
			const k = (c.frame - 1) / 23;
			ctx.translate(20, 20);
			ctx.rotate(k * 0.8);
			ctx.scale(1 - k * 0.8, 1 - k * 0.8);
			ctx.globalAlpha *= 1 - k * 0.6;
			ctx.fillStyle = "#c9a2e6";
			ctx.strokeStyle = "#8a5ab0";
			ctx.lineWidth = 2;
			G.rrect(ctx, -19, -19, 38, 38, 4);
			ctx.fill();
			ctx.stroke();
		}
	};

	/**
	 * The floor cracking before it becomes a hole (final boss). Registration :
	 * top-left of the cell. The boss waits for this clip to be removed to make
	 * the hole (BossTB.on_update) : it must remove itself at its end.
	 */
	SYM.FXDalleCut = {
		w: 40, h: 40,
		frames: 50,
		actions: { 50: F.remove },
		init(c) {
			c.playing = true;
		},
		draw(ctx, c) {
			const k = (c.frame - 1) / 49;
			ctx.strokeStyle = (c.frame >> 2) % 2 ? "rgba(60,0,80,0.9)" : "rgba(255,255,255,0.8)";
			ctx.lineWidth = 1 + k * 2;
			ctx.beginPath();
			ctx.moveTo(4, 20);
			ctx.lineTo(14, 16);
			ctx.lineTo(20, 24);
			ctx.lineTo(30, 14);
			ctx.lineTo(37, 18);
			ctx.moveTo(20, 4);
			ctx.lineTo(18, 14);
			ctx.lineTo(24, 22);
			ctx.lineTo(20, 36);
			ctx.stroke();
			ctx.strokeStyle = "rgba(255,80,80," + (0.3 + 0.4 * k) + ")";
			ctx.strokeRect(1, 1, 38, 38);
		}
	};


	// ----- water -----

	/** The water drop thrown by the boss. */
	SYM.FXWater = {
		w: 20, h: 20,
		draw(ctx) {
			const t = (MB2.frameCount || 0) / 5;
			ctx.fillStyle = "rgba(120,200,255,0.5)";
			G.circle(ctx, 0, 0, 13 + Math.sin(t) * 2);
			ctx.fill();

			ctx.fillStyle = "#6ac8ff";
			ctx.beginPath();
			ctx.moveTo(0, -12);
			ctx.quadraticCurveTo(9, 0, 7, 5);
			ctx.arc(0, 5, 7, 0, Math.PI);
			ctx.quadraticCurveTo(-9, 0, 0, -12);
			ctx.fill();
			G.shine(ctx, 0, 3, 7, 0.8);
		}
	};

	/** Splash droplets (3 sizes). */
	SYM.FXWaterParticule = {
		w: 8, h: 8,
		frames: 3,
		draw(ctx, c) {
			G.ball(ctx, 0, 0, 2 + c.frame, "#9adcff", "#2a7ac8", "#fff");
		}
	};

	/** The wet trail of the ball (stretched by the game with xscale). Plays once. */
	SYM.FXWaterQueue = {
		w: 10, h: 10,
		frames: 10,
		actions: { 10: F.remove },
		init(c) {
			c.playing = true;
		},
		draw(ctx, c) {
			ctx.globalAlpha *= 0.5 * (1 - (c.frame - 1) / 10);
			ctx.fillStyle = "#6ac8ff";
			ctx.beginPath();
			ctx.ellipse(5, 0, 5, 4, 0, 0, TAU);
			ctx.fill();
		}
	};


	// ----- fire -----

	/**
	 * A fire pillar. Frames 1-15 : embers (harmless : the game checks frame < 16),
	 * 16-40 : burning, looping while `flLoopv` is true, 41-55 : dying, then removed.
	 */
	SYM.FXFire = {
		w: 30, h: 60,
		frames: 55,
		actions: {
			40: c => {
				if (c.flLoopv)
					c.gotoAndPlay(16);
			},
			55: F.remove
		},
		init(c) {
			c.playing = true;
			c.flLoopv = true;
		},
		draw(ctx, c) {
			const f = c.frame;
			const t = (MB2.frameCount || 0) / 3;

			ctx.fillStyle = "rgba(60,0,0,0.3)";
			ctx.beginPath();
			ctx.ellipse(0, 0, 16, 7, 0, 0, TAU);
			ctx.fill();

			if (f < 16) {
				ctx.fillStyle = "rgba(255," + (100 + f * 8) + ",0,0.8)";
				for (let i = 0; i < 5; i++) {
					G.circle(ctx, Math.cos(i * 1.3 + t) * 8, Math.sin(i * 1.3 + t) * 3, 2);
					ctx.fill();
				}
				return;
			}

			const height = f <= 40 ? 1 : 1 - (f - 40) / 15;
			const WIDTHS = [14, 10, 6];
			const HEIGHTS = [48, 38, 26];
			const COLORS = ["#ff4a10", "#ff9a20", "#ffe860"];
			for (let i = 0; i < 3; i++) {
				const w = WIDTHS[i] * (0.8 + 0.2 * Math.sin(t + i));
				const h = HEIGHTS[i] * height;
				ctx.fillStyle = COLORS[i];
				ctx.beginPath();
				ctx.moveTo(-w, 0);
				ctx.quadraticCurveTo(-w, -h * 0.5, Math.sin(t + i) * 4, -h);
				ctx.quadraticCurveTo(w, -h * 0.5, w, 0);
				ctx.ellipse(0, 0, w, w * 0.45, 0, 0, Math.PI);
				ctx.fill();
			}
		}
	};


	// ----- earth -----

	/**
	 * A bud on the floor. Frames 1-9 : idle loop, "explode" (10-24) : it grabs
	 * the ball with a vine, "death" (25-40) : it withers and is removed.
	 */
	SYM.FXbourgeon = {
		w: 30, h: 30,
		frames: 40,
		labels: { explode: 10, death: 25 },
		actions: { 9: F.loop(1), 24: F.stop, 40: F.remove },
		init(c) {
			c.playing = true;
		},
		draw(ctx, c) {
			const f = c.frame;
			let s = 1;
			let alpha = 1;
			if (f < 10) {
				s = 1 + 0.08 * Math.sin(f / 9 * TAU);
			} else if (f < 25) {
				s = 1 + (f - 10) / 14 * 0.4;
			} else {
				s = 1.4 - (f - 25) / 15 * 1.2;
				alpha = 1 - (f - 25) / 15;
			}
			ctx.globalAlpha *= alpha;

			ctx.fillStyle = "rgba(60,30,0,0.35)";
			ctx.beginPath();
			ctx.ellipse(0, 4, 16 * s, 7 * s, 0, 0, TAU);
			ctx.fill();

			ctx.scale(s, s);
			ctx.fillStyle = "#6a9a2a";
			for (let i = 0; i < 4; i++) {
				ctx.save();
				ctx.rotate(i * Math.PI / 2 + (f >= 10 ? 0.4 : 0));
				ctx.beginPath();
				ctx.ellipse(0, -9, 5, 10, 0, 0, TAU);
				ctx.fill();
				ctx.restore();
			}
			G.ball(ctx, 0, 0, 7, "#b8e070", "#3a6a10");
		}
	};

	/** A segment of the vine, from the clip position, `len` pixels along its rotation. */
	SYM.FXLiane = {
		draw(ctx, c) {
			const len = c.len || 5;
			ctx.strokeStyle = "#5a8a1a";
			ctx.lineWidth = 4;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(len, 0);
			ctx.stroke();
			ctx.fillStyle = "#8ac040";
			ctx.beginPath();
			ctx.ellipse(len / 2, -4, 4, 2, 0.5, 0, TAU);
			ctx.fill();
		}
	};


	// ----- wind -----

	/** A gust of the whirlwind, oriented along its movement. */
	SYM.FXWind = {
		w: 40, h: 20,
		draw(ctx) {
			ctx.strokeStyle = "rgba(255,255,255,0.8)";
			ctx.lineCap = "round";
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(-10, 12, 22, -1.6, -0.6);
			ctx.stroke();
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(-14, 18, 24, -1.5, -0.8);
			ctx.stroke();
		}
	};

})();
