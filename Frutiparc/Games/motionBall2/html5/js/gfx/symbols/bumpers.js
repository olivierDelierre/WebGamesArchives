/*
 * Symbols of the bumpers and obstacles of the rooms.
 *
 * Sizes matter : `w` / `h` give the size in cells (Tools.mc_size) used to
 * place the bumper from its level position, and must match the hitmaps
 * (game/collide.js).
 *
 * Most bumpers have an idle frame 1 (stopped) and a "hit" animation that goes
 * back to frame 1 : the game only plays the hit animation when the bumper is
 * on frame 1 (see Collide.bumper_normal_on_hit).
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;

	/** White flash of the hit animations (frames 2..). */
	function hitFlash(ctx, c, radius) {
		if (c.frame <= 1)
			return;
		ctx.globalAlpha *= 1 - (c.frame - 2) / 8;
		ctx.fillStyle = "rgba(255,255,255,0.6)";
		G.circle(ctx, 0, 0, radius);
		ctx.fill();
	}


	/** Shadow below a bumper, frame = bumper type (MB2.Bumper). */
	SYM.ombre = {
		frames: 14,
		draw(ctx, c) {
			const RADIUS = [0, 22, 27, 17, 17, 22, 18, 18, 8, 8, 20, 14, 18, 18, 14];
			const r = RADIUS[c.frame] || 18;
			ctx.fillStyle = "rgba(40,0,70,0.22)";
			ctx.beginPath();
			ctx.ellipse(4, 5, r, r * 0.9, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	};

	/** Normal bumper : 12 x 12 cells. */
	SYM.bnormal = {
		w: 48, h: 48,
		frames: 10,
		labels: { hit: 2 },
		actions: { 1: F.stop, 10: F.goto(1) },
		draw(ctx, c) {
			const s = G.pulse(c, 2, 9);
			ctx.scale(s, s);
			G.img(ctx, "normal_base", 46, 46);
			G.img(ctx, "normal_top", 23, 23);
			hitFlash(ctx, c, 22);
		}
	};

	/** Clock bumper : 16 x 16 cells. Its hands `aig` / `aig2` show the remaining time. */
	SYM.btime = {
		w: 64, h: 64,
		frames: 10,
		labels: { hit: 2 },
		actions: { 1: F.stop, 10: F.goto(1) },
		init(c) {
			c.aig = { rotation: 0 };
			c.aig2 = { rotation: 0 };
		},
		draw(ctx, c) {
			const s = G.pulse(c, 2, 9);
			ctx.scale(s, s);

			// green bumps around the clock
			ctx.fillStyle = "#6cc93a";
			for (let i = 0; i < 8; i++) {
				const a = i * Math.PI / 4;
				G.circle(ctx, Math.cos(a) * 26, Math.sin(a) * 26, 6);
				ctx.fill();
			}

			G.img(ctx, "time_base", 54, 54);

			// hands : purple leaves
			ctx.fillStyle = "#7a2aa0";
			for (const [rotation, length] of [[c.aig.rotation, 12], [c.aig2.rotation, 17]]) {
				ctx.save();
				ctx.rotate(rotation * Math.PI / 180);
				ctx.beginPath();
				ctx.ellipse(0, -length / 2, 2.8, length / 2, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.restore();
			}
			G.ball(ctx, 0, 0, 2.5, "#c05ae0", "#5a1a78");

			hitFlash(ctx, c, 28);
		}
	};

	/** Death bumper : 10 x 10 cells. */
	SYM.bdeath = {
		w: 40, h: 40,
		frames: 12,
		labels: { hit: 2 },
		actions: { 1: F.stop, 12: F.goto(1) },
		draw(ctx, c) {
			const s = G.pulse(c, 2, 11);
			ctx.scale(s, s);
			if (c.frame > 1)
				ctx.rotate((c.frame - 2) * 0.2);
			G.img(ctx, "death_base", 38, 39);
		}
	};

	/**
	 * Magnet : 10 x 10 cells. Two looping animations : "plus" (attracts the ball,
	 * happy face) and "neg" (repels it for a while after a hit, unhappy face).
	 */
	SYM.bmagnet = {
		w: 40, h: 40,
		frames: 40,
		labels: { plus: 1, neg: 21 },
		actions: { 20: F.loop(1), 40: F.loop(21) },
		draw(ctx, c) {
			const neg = c.frame > 20;
			const t = ((c.frame - 1) % 20) / 20;

			// field ring, going in (attract) or out (repel)
			ctx.strokeStyle = neg
				? "rgba(255,90,60," + (0.5 * (1 - t)) + ")"
				: "rgba(120,255,90," + (0.5 * t) + ")";
			ctx.lineWidth = 2;
			G.circle(ctx, 0, 0, neg ? 18 + t * 18 : 36 - t * 18);
			ctx.stroke();

			G.img(ctx, "magnet_base", 38, 38);
			G.img(ctx, "magnet_top", 24, 24);
			G.img(ctx, neg ? "magnet_minus" : "magnet_plus", 15, neg ? 11 : 14);
		}
	};

	/** Invisible bumper : 14 x 14 cells. Its alpha is driven by Collide.bumper_shadow_on_update. */
	SYM.bshadow = {
		w: 56, h: 56,
		frames: 10,
		labels: { hit: 2 },
		actions: { 1: F.stop, 10: F.goto(1) },
		draw(ctx, c) {
			const s = G.pulse(c, 2, 9);
			ctx.scale(s, s);

			const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 27);
			g.addColorStop(0, "#2a0a40");
			g.addColorStop(0.55, "#5a2a84");
			g.addColorStop(0.8, "#8a58b8");
			g.addColorStop(1, "rgba(60,20,90,0)");
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, 27);
			ctx.fill();

			ctx.strokeStyle = "rgba(220,180,255,0.6)";
			ctx.lineWidth = 2;
			G.circle(ctx, 0, 0, 17);
			ctx.stroke();

			G.ball(ctx, 0, 0, 9, "#6a3a9a", "#200834", "#c8a0f0");
		}
	};


	// ----- blocks -----

	/**
	 * Green block : 10 x 10 cells. 16 frames = 1 + mask of the neighbouring
	 * blocks (1 left, 2 up, 4 right, 8 down) computed by Interf.update_walls :
	 * sides touching another block are extended so the blocks merge.
	 */
	SYM.wall = {
		w: 40, h: 40,
		frames: 16,
		draw(ctx, c) {
			const f = c.frame - 1;
			const EXT = 6;
			const left = (f & 1) ? -20 - EXT : -19;
			const up = (f & 2) ? -20 - EXT : -19;
			const right = (f & 4) ? 20 + EXT : 19;
			const down = (f & 8) ? 20 + EXT : 19;

			ctx.save();
			ctx.beginPath();
			ctx.rect(-20, -20, 40, 40);
			ctx.clip();

			const g = ctx.createLinearGradient(-20, -20, 20, 20);
			g.addColorStop(0, "#b4f0a0");
			g.addColorStop(1, "#8fdc78");
			ctx.fillStyle = g;
			G.rrect(ctx, left, up, right - left, down - up, 8);
			ctx.fill();
			ctx.lineWidth = 1.5;
			ctx.strokeStyle = "#62b24a";
			ctx.stroke();

			// soft highlight in the top-left corner of a group of blocks
			if (!(f & 1) && !(f & 2)) {
				ctx.strokeStyle = "rgba(255,255,255,0.75)";
				ctx.lineWidth = 2.5;
				ctx.lineCap = "round";
				ctx.beginPath();
				ctx.moveTo(left + 4, up + 16);
				ctx.lineTo(left + 4, up + 10);
				ctx.quadraticCurveTo(left + 4, up + 4, left + 10, up + 4);
				ctx.lineTo(left + 16, up + 4);
				ctx.stroke();
			}
			ctx.restore();
		}
	};

	/** A piece of a destroyed green block (Collide.wall_dummy_on_update moves it). */
	SYM.wallpart = {
		w: 12, h: 12,
		draw(ctx) {
			ctx.fillStyle = "#a6e67c";
			ctx.strokeStyle = "#5cae34";
			ctx.lineWidth = 1.5;
			G.rrect(ctx, -6, -6, 12, 12, 3);
			ctx.fill();
			ctx.stroke();
		}
	};

	/*
	 * Pink / blue blocks, toggled by the switch. The labels keep the Flash names :
	 *   "off" (frame 1) = raised (solid), "on" (frame 8) = lowered,
	 *   "playOn" = lowering animation, "playOff" = raising animation.
	 */
	function interBlock(color) {
		return {
			w: 40, h: 40,
			frames: 16,
			labels: { off: 1, on: 8, playOn: 2, playOff: 9 },
			actions: { 1: F.stop, 8: F.stop, 16: F.goto(1) },
			draw(ctx, c) {
				// raised = 1 .. lowered = 0
				let raised;
				if (c.frame === 1)
					raised = 1;
				else if (c.frame <= 8)
					raised = 1 - (c.frame - 1) / 7;
				else
					raised = (c.frame - 8) / 8;

				G.img(ctx, "inter_low_" + color, 40, 40);
				if (raised > 0) {
					ctx.globalAlpha *= raised;
					G.img(ctx, "inter_high_" + color, 40, 40, -20, -20 - 3 * raised);
				}
			}
		};
	}
	SYM.interred = interBlock("pink");
	SYM.interblue = interBlock("blue");

	/** The switch : same labels as the blocks. Hitmap : a circle (game/collide.js). */
	SYM.interupt = {
		w: 32, h: 32,
		frames: 16,
		labels: { off: 1, on: 8, playOn: 2, playOff: 9 },
		actions: { 1: F.stop, 7: F.goto(8), 8: F.stop, 16: F.goto(1) },
		draw(ctx, c) {
			// the pink / blue disc turns half a turn at each toggle
			const f = c.frame;
			const rotation = f === 1 ? 0
				: f <= 8 ? (f - 1) / 7 * Math.PI
				: Math.PI + (f - 8) / 8 * Math.PI;

			G.ball(ctx, 0, 0, 15, "#e8e4f0", "#7a7288");

			ctx.save();
			ctx.rotate(rotation);
			ctx.fillStyle = "#ff6ec8";
			ctx.beginPath();
			ctx.arc(0, 0, 10, -Math.PI / 2, Math.PI / 2);
			ctx.fill();
			ctx.fillStyle = "#5a6cff";
			ctx.beginPath();
			ctx.arc(0, 0, 10, Math.PI / 2, Math.PI * 1.5);
			ctx.fill();
			ctx.restore();

			ctx.strokeStyle = "#4a4458";
			ctx.lineWidth = 1.5;
			G.circle(ctx, 0, 0, 10);
			ctx.stroke();
			G.shine(ctx, 0, 0, 14, 0.5);
		}
	};


	// ----- zappers -----

	/**
	 * Zapper post : frame = 1 + phase. The posts of a same phase are linked by
	 * a laser that only the ball of the same colour can cross.
	 */
	SYM.zapper = {
		w: 32, h: 32,
		frames: 7,
		draw(ctx, c) {
			const col = MB2.BALL_COLORS[c.frame - 1];
			G.ball(ctx, 0, 0, 14, "#dcdce6", "#4a4a5a");
			ctx.strokeStyle = "#3a3a48";
			ctx.lineWidth = 1;
			G.circle(ctx, 0, 0, 14);
			ctx.stroke();

			G.ball(ctx, 0, 0, 8, col[0], col[1], col[2]);

			// blinking light (the offset desynchronises the posts)
			const t = (MB2.frameCount || 0) * 0.15 + c.x;
			ctx.fillStyle = "rgba(255,255,255," + (0.3 + 0.3 * Math.sin(t)) + ")";
			G.circle(ctx, 0, 0, 9);
			ctx.fill();
		}
	};

	/** In Course mode the zappers are checkpoints : crossing their line counts a lap. */
	SYM.checkpoint = {
		w: 32, h: 32,
		draw(ctx) {
			G.ball(ctx, 0, 0, 14, "#fff4b0", "#b08400");
			ctx.strokeStyle = "#7a5a00";
			ctx.lineWidth = 1;
			G.circle(ctx, 0, 0, 14);
			ctx.stroke();

			// chequered flag
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 3; j++) {
					ctx.fillStyle = (i + j) % 2 ? "#222" : "#fff";
					ctx.fillRect(-6 + i * 3, -5 + j * 3, 3, 3);
				}
			}
		}
	};

	/**
	 * The lasers between the posts. Not a symbol of the original : added so that
	 * the player sees the lines (c.lines = the "zapper line" collision objects
	 * of Level.trace_zappers).
	 */
	SYM.zaplines = {
		draw(ctx, c) {
			const t = (MB2.frameCount || 0) / 6;
			const course = MB2.Manager.play_mode === MB2.Const.MODE_COURSE;

			ctx.save();
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 6]);
			ctx.lineDashOffset = -t * 2;
			for (const line of c.lines) {
				const a = line.z1.clip;
				const b = line.z2.clip;
				if (!a || !b || a.removed || b.removed)
					continue;
				ctx.strokeStyle = course ? "#ffffff" : MB2.BALL_COLORS[line.phase][0];
				ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t);
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			}
			ctx.restore();
		}
	};

	/**
	 * The laser flash when the ball dies on a zapper line. Stretched by the game
	 * (xscale = length) : drawn 100 px long from its origin. Child `gfx` = phase + 1.
	 */
	SYM.flashLine = {
		w: 100, h: 10,
		frames: 12,
		actions: { 12: F.remove },
		init(c) {
			c.gfx = MB2.frameHolder();
			c.playing = true;
		},
		draw(ctx, c) {
			const col = MB2.BALL_COLORS[(c.gfx.frame - 1) % 7];
			ctx.globalAlpha *= 1 - (c.frame - 1) / 12;
			ctx.fillStyle = col[0];
			ctx.fillRect(0, -3, 100, 6);
			ctx.fillStyle = "rgba(255,255,255,0.9)";
			ctx.fillRect(0, -1, 100, 2);
		}
	};


	// ----- teleport -----

	/**
	 * Teleport : 5 rotating circles c0..c4, animated by
	 * Collide.bumper_teleport_on_update (rotation / scales), each with a
	 * random offset and angle (gfx).
	 */
	SYM.bteleport = {
		w: 48, h: 48,
		init(c) {
			c.num = 5;
			c.circles = [];
			for (let i = 0; i < c.num; i++) {
				const circle = {
					gfx: { y: random(6), rotation: random(360) },
					rotation: 0,
					xscale: 100,
					yscale: 100,
					rot: 3 + random(3),
					c: random(628)
				};
				c.circles.push(circle);
				c["c" + i] = circle;
			}
		},
		draw(ctx, c) {
			const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
			g.addColorStop(0, "rgba(255,255,255,0.95)");
			g.addColorStop(0.4, "rgba(210,150,255,0.6)");
			g.addColorStop(1, "rgba(120,40,200,0)");
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, 24);
			ctx.fill();

			ctx.strokeStyle = "rgba(255,255,255,0.75)";
			ctx.lineWidth = 1.5;
			for (const k of c.circles) {
				ctx.save();
				ctx.rotate(k.rotation * Math.PI / 180);
				ctx.scale(k.xscale / 100, k.yscale / 100);
				ctx.rotate(k.gfx.rotation * Math.PI / 180);
				ctx.beginPath();
				ctx.ellipse(0, k.gfx.y, 14, 8, 0, 0, Math.PI * 1.3);
				ctx.stroke();
				ctx.restore();
			}
		}
	};

})();
