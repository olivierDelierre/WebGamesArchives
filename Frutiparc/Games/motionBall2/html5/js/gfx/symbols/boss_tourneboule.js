/*
 * "Tourneboule", the final boss (logic : boss/tourneboule.js).
 *
 * TRICKY : in the original, this boss was driven by its own timeline. The
 * frame scripts of the "tourneboule" symbol called back the boss :
 *   animDone()   at the end of every animation (landing, take-off, flight,
 *                kata, death) : the boss then chooses what to do next ;
 *   kataDone()   in the middle of a kata : the boss casts its power.
 * The symbol below rebuilds such a timeline. Its frame numbers are
 * inventions : only the order of the callbacks matters (see FLA_DECODING.md
 * to replace it with the real one).
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;
	const TAU = Math.PI * 2;

	/*
	 * Timeline :
	 *   1              idle (waiting, vulnerable)
	 *   2-21   stopFly     landing                    -> animDone
	 *   22-36  startFly    taking off                 -> animDone
	 *   37-56  fly         flying (replayed by the boss) -> animDone
	 *   57-65  flyVanish   invisible flight (loop) ; the original used frames 169-177
	 *   66-209 kata1..6    6 katas of 24 frames, advanced frame by frame by the boss :
	 *                      kataDone at +14, animDone on the last frame
	 *   210-249 death                                   -> animDone
	 */
	const TB = { stopFly: 2, startFly: 22, fly: 37, flyVanish: 57, flyVanishEnd: 65, kata: 66, death: 210 };
	const KATA_LEN = 24;

	const callAnimDone = c => {
		if (c.animDone)
			c.animDone();
	};
	const callKataDone = c => {
		if (c.kataDone)
			c.kataDone();
	};

	const labels = {
		stopFly: TB.stopFly,
		startFly: TB.startFly,
		fly: TB.fly,
		flyVanish: TB.flyVanish,
		flyVanishEnd: TB.flyVanishEnd,
		death: TB.death
	};
	const actions = {
		1: F.stop,
		21: c => {
			c.stop();
			callAnimDone(c);
		},
		36: callAnimDone,
		56: callAnimDone,
		65: F.loop(TB.flyVanish),
		249: c => {
			c.stop();
			callAnimDone(c);
		}
	};
	for (let k = 1; k <= 6; k++) {
		const start = TB.kata + (k - 1) * KATA_LEN;
		labels["kata" + k] = start;
		actions[start + 14] = callKataDone;
		actions[start + KATA_LEN - 1] = callAnimDone;
	}

	/** Pose of the boss for a frame : altitude, spin speed, kata number and progress, death progress. */
	function pose(f) {
		if (f >= TB.stopFly && f < TB.startFly) {
			const k = (f - TB.stopFly) / 19;
			return { alt: 60 * (1 - k) * (1 - k), spin: (1 - k) * 3 };
		}
		if (f >= TB.startFly && f < TB.fly) {
			const k = (f - TB.startFly) / 14;
			return { alt: 60 * k * k, spin: 1 + k * 2 };
		}
		if (f >= TB.fly && f < TB.flyVanish)
			return { alt: 60 + Math.sin((f - TB.fly) / 20 * TAU) * 6, spin: 3 };
		if (f >= TB.flyVanish && f < TB.kata)
			return { alt: 60, spin: 3 };
		if (f >= TB.kata && f < TB.death) {
			const i = f - TB.kata;
			return { alt: 0, spin: 0, kata: 1 + ((i / KATA_LEN) | 0), k: (i % KATA_LEN) / (KATA_LEN - 1) };
		}
		if (f >= TB.death)
			return { alt: 0, spin: 4, death: (f - TB.death) / 39 };
		return { alt: 0, spin: 0 };
	}

	/** Aura colour of each kata (kata k casts the power k - 1 : wind, fire, water, earth, holes, blocks). */
	const KATA_COLORS = [null, "#e8fff0", "#ff6a2a", "#5ac8ff", "#b08a4a", "#b070ff", "#7ad84a"];

	/** Angles of the two hands during each kata, k = 0..1. */
	const KATA_HANDS = [
		null,
		k => [-Math.PI / 2 - k * 3, -Math.PI / 2 + k * 3],
		k => [k * TAU, Math.PI + k * TAU],
		k => [-0.3 - Math.sin(k * Math.PI) * 1.2, Math.PI + 0.3 + Math.sin(k * Math.PI) * 1.2],
		k => [Math.PI / 2 + Math.sin(k * TAU) * 1.5, Math.PI / 2 - Math.sin(k * TAU) * 1.5],
		k => [-Math.PI / 2 + Math.sin(k * 3 * Math.PI) * 0.8, Math.PI / 2 - Math.sin(k * 3 * Math.PI) * 0.8],
		k => [Math.PI + k * Math.PI, -k * Math.PI]
	];

	SYM.tourneboule = {
		w: 70, h: 70,
		frames: 249,
		labels: labels,
		actions: actions,

		draw(ctx, c) {
			const p = pose(c.frame);
			const t = MB2.frameCount || 0;

			if (p.death !== undefined) {
				ctx.globalAlpha *= 1 - p.death;
				ctx.scale(1 + p.death, 1 - p.death * 0.8);
			}
			ctx.translate(0, -p.alt);
			const spin = p.spin ? t * 0.25 * p.spin : 0;

			// kata aura
			if (p.kata) {
				const r = 26 + Math.sin(p.k * Math.PI) * 14;
				const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r + 8);
				g.addColorStop(0, "rgba(255,255,255,0)");
				g.addColorStop(0.7, KATA_COLORS[p.kata]);
				g.addColorStop(1, "rgba(255,255,255,0)");
				ctx.save();
				ctx.globalAlpha *= 0.9;
				ctx.fillStyle = g;
				G.circle(ctx, 0, 0, r + 8);
				ctx.fill();
				ctx.restore();
			}

			// hands
			const hand = (a, d) => G.ball(ctx, Math.cos(a) * d, Math.sin(a) * d, 6, "#ffffff", "#9a90b0");
			const hands = p.kata ? KATA_HANDS[p.kata](p.k) : [spin + 0.3, spin + Math.PI + 0.3];
			hand(hands[0], p.kata ? 30 : 29);
			hand(hands[1], p.kata ? 30 : 29);

			// body : a spinning ball
			ctx.save();
			ctx.rotate(spin);
			G.ball(ctx, 0, 0, 22, "#ffffff", "#8a84a0", "#ffffff");
			ctx.strokeStyle = "rgba(120,110,150,0.6)";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(0, 0, 15, 0, TAU);
			ctx.stroke();
			ctx.restore();

			// mask
			ctx.fillStyle = "#7a2ab0";
			ctx.beginPath();
			ctx.moveTo(-21, -8);
			ctx.quadraticCurveTo(0, -14, 21, -8);
			ctx.lineTo(19, 2);
			ctx.quadraticCurveTo(0, -3, -19, 2);
			ctx.closePath();
			ctx.fill();

			ctx.fillStyle = "#fff";
			ctx.beginPath();
			ctx.ellipse(-8, -5, 4, 2.5, 0.2, 0, TAU);
			ctx.ellipse(8, -5, 4, 2.5, -0.2, 0, TAU);
			ctx.fill();
			ctx.fillStyle = "#000";
			G.circle(ctx, -7, -5, 1.6);
			ctx.fill();
			G.circle(ctx, 7, -5, 1.6);
			ctx.fill();

			// ribbon of the mask
			const wave = Math.sin(t / 4) * 4;
			ctx.strokeStyle = "#7a2ab0";
			ctx.lineWidth = 3;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(20, -6);
			ctx.quadraticCurveTo(30, -10 + wave, 36, -4 - wave);
			ctx.stroke();
		}
	};

	/** Its shadow : same timeline (without the callbacks), smaller when flying. */
	SYM.TBShadow = {
		w: 70, h: 30,
		frames: 249,
		labels: labels,
		actions: { 1: F.stop, 21: F.stop, 65: F.loop(TB.flyVanish), 249: F.stop },
		draw(ctx, c) {
			const p = pose(c.frame);
			const s = 1 - p.alt / 150;
			ctx.fillStyle = "rgba(40,0,60," + (0.3 * s) + ")";
			ctx.beginPath();
			ctx.ellipse(0, 18, 26 * s, 9 * s, 0, 0, TAU);
			ctx.fill();
		}
	};

	/** The shield that protects it the first time it is touched after landing. */
	SYM.forceBubble = {
		w: 80, h: 80,
		draw(ctx) {
			const g = ctx.createRadialGradient(-10, -14, 4, 0, 0, 38);
			g.addColorStop(0, "rgba(255,255,255,0.8)");
			g.addColorStop(0.7, "rgba(160,220,255,0.25)");
			g.addColorStop(1, "rgba(120,180,255,0.7)");
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, 38);
			ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.9)";
			ctx.lineWidth = 2;
			ctx.stroke();
		}
	};

	/** Smoke puffs : TBVanish (it disappears), TBSpawn (it reappears, then calls animDone). */
	function puff(reverse) {
		return {
			w: 60, h: 60,
			frames: 20,
			actions: {
				20: c => {
					c.removeMovieClip();
					callAnimDone(c);
				}
			},
			init(c) {
				c.playing = true;
			},
			draw(ctx, c) {
				let k = (c.frame - 1) / 19;
				if (reverse)
					k = 1 - k;
				ctx.globalAlpha *= reverse ? k : 1 - k;
				ctx.fillStyle = "rgba(230,220,255,0.9)";
				for (let i = 0; i < 7; i++) {
					const a = i * TAU / 7;
					G.circle(ctx, Math.cos(a) * 30 * k, Math.sin(a) * 30 * k - 20, 10 + 10 * k);
					ctx.fill();
				}
			}
		};
	}
	SYM.TBVanish = puff(false);
	SYM.TBSpawn = puff(true);

})();
