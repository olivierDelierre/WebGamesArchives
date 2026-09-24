/*
 * The octopus, boss of the Challenge mode (logic : boss/octopus.js).
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;
	const TAU = Math.PI * 2;

	/*
	 * Timeline :
	 *   1 dodo (asleep)  2 normal  3-12 aspire (loop)  13-22 tir (the eye bulges)
	 *   23-30 looseEye (no eye)  31-40 newEye (the eye grows back)
	 *   41-55 eat  56-70 throw  71-110 death
	 *
	 * Children driven by the code (Boss.on_update / move_eye) :
	 *   oeil.p     the pupil : x, y, xscale, yscale
	 *   oeil       play() / gotoAndPlay("close") : blinks (anim counter here)
	 *   b.p1, b.p2 the pincers : rotation
	 *   souffle    the suction effect : xscale / yscale
	 *   jump       height of the jump (set by the code, not used for drawing)
	 *   dodo       asleep
	 */
	SYM.boss = {
		w: 100, h: 90,
		frames: 110,
		labels: { dodo: 1, normal: 2, aspire: 3, tir: 13, looseEye: 23, newEye: 31, eat: 41, "throw": 56, death: 71 },
		actions: {
			1: F.stop,
			2: F.stop,
			12: F.loop(3),
			22: F.stop,
			30: F.stop,
			40: F.goto(2),
			55: F.stop,
			70: F.goto(2),
			110: F.stop
		},

		init(c) {
			c.oeil = {
				p: { x: 0, y: 0, xscale: 100, yscale: 100 },
				anim: 0,  // frames left of the blink animation
				play() {
					if (!this.anim)
						this.anim = 12;
				},
				gotoAndPlay() {
					this.anim = 12;
				}
			};
			c.b = { p1: { rotation: 0 }, p2: { rotation: 0 } };
			c.souffle = { xscale: 0, yscale: 0 };
			c.jump = 0;
			c.dodo = true;
		},

		update(c) {
			if (c.oeil.anim > 0)
				c.oeil.anim--;
		},

		draw(ctx, c) {
			const f = c.frame;
			const t = (MB2.frameCount || 0) / 8;

			// global scale / fade of the eat, throw and death animations
			let scale = 1;
			let alpha = 1;
			if (f >= 71) {
				const k = (f - 71) / 39;
				scale = 1 + k * 0.6;
				alpha = 1 - k;
			} else if (f >= 56) {
				scale = 1 + 0.15 * Math.sin((f - 56) / 14 * Math.PI);
			} else if (f >= 41) {
				scale = 1 + 0.12 * Math.sin((f - 41) / 14 * Math.PI);
			}
			ctx.globalAlpha *= alpha;
			ctx.scale(scale, scale);

			drawSuction(ctx, c.souffle.xscale / 100, t);
			drawTentacles(ctx, t);
			drawPincers(ctx, c);
			drawHead(ctx);
			drawEye(ctx, c, f);

			if (f === 1)
				G.text(ctx, "z", 30 + Math.sin(t) * 3, -40 - (t * 4 % 12), 14, "#fff");
		}
	};

	function drawSuction(ctx, s, t) {
		if (s <= 0.05)
			return;
		ctx.save();
		ctx.strokeStyle = "rgba(255,255,255,0.5)";
		ctx.lineWidth = 2;
		for (let i = 0; i < 3; i++) {
			const k = (t * 0.5 + i / 3) % 1;
			ctx.beginPath();
			ctx.arc(0, 25, (60 - k * 50) * s, 0.2 * Math.PI, 0.8 * Math.PI);
			ctx.stroke();
		}
		ctx.restore();
	}

	function drawTentacles(ctx, t) {
		ctx.strokeStyle = "#7a36b0";
		ctx.lineCap = "round";
		for (let i = 0; i < 6; i++) {
			const bx = -30 + i * 12;
			const wave = Math.sin(t + i) * 6;
			ctx.lineWidth = 9 - Math.abs(i - 2.5);
			ctx.beginPath();
			ctx.moveTo(bx, 10);
			ctx.quadraticCurveTo(bx * 1.3 + wave, 30, bx * 1.5 - wave, 40 + (i % 2) * 4);
			ctx.stroke();
		}
	}

	function drawPincers(ctx, c) {
		for (const side of [-1, 1]) {
			ctx.save();
			ctx.translate(side * 24, 18);
			ctx.rotate((side < 0 ? c.b.p1.rotation : c.b.p2.rotation) * Math.PI / 180);
			ctx.fillStyle = "#d06ae0";
			ctx.strokeStyle = "#5a1a78";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(side * 16, 6, side * 10, 20);
			ctx.quadraticCurveTo(side * 4, 12, 0, 8);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
	}

	function drawHead(ctx) {
		const g = ctx.createRadialGradient(-12, -22, 5, 0, -5, 48);
		g.addColorStop(0, "#e2a4ff");
		g.addColorStop(0.5, "#a650dc");
		g.addColorStop(1, "#5a1a8a");
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(0, -6, 42, 34, 0, 0, TAU);
		ctx.fill();
		ctx.strokeStyle = "#4a1070";
		ctx.lineWidth = 2;
		ctx.stroke();

		// spots
		ctx.fillStyle = "rgba(255,255,255,0.18)";
		for (const [x, y, r] of [[-26, -18, 5], [24, -22, 4], [30, 2, 3], [-30, 4, 3]]) {
			G.circle(ctx, x, y, r);
			ctx.fill();
		}
	}

	function drawEye(ctx, c, f) {
		const eyeless = (f >= 21 && f <= 30);
		if (eyeless) {
			ctx.fillStyle = "#3a0858";
			ctx.beginPath();
			ctx.ellipse(0, -6, 16, 13, 0, 0, TAU);
			ctx.fill();
			return;
		}

		const growing = (f >= 31 && f <= 40) ? (f - 31) / 9 : 1;
		const bulge = (f >= 13 && f <= 22) ? 1 + (f - 13) / 9 * 0.3 : 1;

		ctx.save();
		ctx.translate(0, -6);
		ctx.scale(growing * bulge, growing * bulge);
		G.ball(ctx, 0, 0, 16, "#ffffff", "#c8b8d8", "#ffffff");

		// pupil, looking at the ball
		const p = c.oeil.p;
		ctx.save();
		ctx.translate(p.x * 0.3, p.y * 0.5);
		ctx.scale(Math.max(0.3, p.xscale / 100), Math.max(0.3, p.yscale / 100));
		G.ball(ctx, 0, 0, 8, "#e0304a", "#6a0010");
		ctx.fillStyle = "#000";
		G.circle(ctx, 0, 0, 3.5);
		ctx.fill();
		ctx.restore();

		// eyelid : closed when asleep, or blinking
		let lid = 0;
		if (f === 1)
			lid = 1;
		else if (c.oeil.anim > 0)
			lid = Math.sin(c.oeil.anim / 12 * Math.PI);
		if (lid > 0) {
			ctx.fillStyle = "#9a48cc";
			ctx.beginPath();
			ctx.ellipse(0, -16 + 16 * lid, 17, 16 * lid + 0.1, 0, Math.PI, TAU);
			ctx.rect(-17, -17, 34, 1 + 16 * lid);
			ctx.fill();
			if (lid === 1) {
				ctx.strokeStyle = "#4a1070";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(0, -2, 12, 0.15 * Math.PI, 0.85 * Math.PI);
				ctx.stroke();
			}
		}
		ctx.restore();
	}

	SYM["boss shade"] = {
		draw(ctx) {
			ctx.fillStyle = "rgba(40,0,60,0.3)";
			ctx.beginPath();
			ctx.ellipse(0, 28, 44, 14, 0, 0, TAU);
			ctx.fill();
		}
	};

	/** The eye thrown by the octopus. c.sx / c.sy (its speed) orient the pupil. */
	SYM["boss tir"] = {
		w: 30, h: 30,
		draw(ctx, c) {
			const a = Math.atan2(c.sy || 0, c.sx || 1);
			G.ball(ctx, 0, 0, 13, "#ffffff", "#b8a8c8");
			G.ball(ctx, Math.cos(a) * 5, Math.sin(a) * 5, 6, "#e0304a", "#6a0010");
			ctx.fillStyle = "#000";
			G.circle(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 2.5);
			ctx.fill();

			// veins at the back
			ctx.strokeStyle = "rgba(200,40,60,0.5)";
			ctx.lineWidth = 1;
			for (let i = 0; i < 4; i++) {
				const b = a + Math.PI + (i - 1.5) * 0.4;
				ctx.beginPath();
				ctx.moveTo(Math.cos(b) * 12, Math.sin(b) * 12);
				ctx.lineTo(Math.cos(b) * 5, Math.sin(b) * 5);
				ctx.stroke();
			}
		}
	};

	/** Blobs flying away when the octopus dies. */
	SYM.bossParticule = {
		w: 20, h: 20,
		draw(ctx) {
			G.ball(ctx, 0, 0, 10, "#c070f0", "#5a1a8a", "#f0d0ff");
		}
	};

})();
