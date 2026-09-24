// MotionBall 2 - HTML5 port : graphics (game symbols)
// Bitmaps come from mb2.fla (tools/extract_fla.py). The vector symbols of the
// .fla can't be extracted, so they are redrawn here with the canvas API.
"use strict";

MB2.IMAGES = [
	"bg01.jpg", "bg02.jpg", "bg03.jpg", "bg04.jpg", "bgHole.jpg", "map.png", "roue.png", "circle.png",
	"normal_base.png", "normal_top.png", "time_base.png", "time_needle.png", "time_tip.png", "death_base.png",
	"magnet_base.png", "magnet_top.png", "magnet_plus.png", "magnet_minus.png",
	"inter_low_blue.png", "inter_low_pink.png", "inter_high_blue.png", "inter_high_pink.png",
	"snake_head.png", "snake_body.png", "snake_tail.png",
	"help_bleue.png", "help_jaune.png", "help_metal.png", "help_orange.png", "help_rouge.png",
	"help_verte.png", "help_violette.png",
	"donjon_eau.png", "donjon_feu.png", "donjon_terre.png", "donjon_vent.png",
	"logo_eau.png", "logo_feu.png", "logo_terre.png", "logo_vent.png",
	"menu_challenge.png", "menu_course.png", "menu_aventure.png", "menu_classique.png",
	"menu_options.png", "menu_aide.png"
];
MB2.img = {};
MB2.loadImages = function (onProgress) {
	let done = 0;
	return Promise.all(MB2.IMAGES.map(f => new Promise(ok => {
		const i = new Image();
		i.onload = i.onerror = () => { done++; if (onProgress) onProgress(done / MB2.IMAGES.length); ok(); };
		i.src = "assets/img/" + f;
		MB2.img[f.replace(/\.(png|jpg)$/, "")] = i;
	})));
};

MB2.FONT = "'Baloo 2', 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif";

MB2.G = {
	img(ctx, name, w, h, x, y) {
		const i = MB2.img[name];
		if (!i || !i.complete || !i.naturalWidth) return;
		w = w || i.naturalWidth; h = h || i.naturalHeight;
		ctx.drawImage(i, x === undefined ? -w / 2 : x, y === undefined ? -h / 2 : y, w, h);
	},
	circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); },
	ball(ctx, x, y, r, c1, c2, c3) {
		const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
		g.addColorStop(0, c3 || "#fff");
		g.addColorStop(0.35, c1);
		g.addColorStop(1, c2);
		ctx.fillStyle = g;
		MB2.G.circle(ctx, x, y, r);
		ctx.fill();
	},
	shine(ctx, x, y, r, a) {
		ctx.fillStyle = "rgba(255,255,255," + (a === undefined ? 0.7 : a) + ")";
		ctx.beginPath();
		ctx.ellipse(x - r * 0.3, y - r * 0.45, r * 0.45, r * 0.25, -0.5, 0, Math.PI * 2);
		ctx.fill();
	},
	rrect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		MB2.Tools.smoothSquarePath(ctx, { x: x, y: y, w: w, h: h }, r);
		ctx.closePath();
	},
	text(ctx, txt, x, y, size, fill, stroke, align, weight) {
		ctx.font = (weight || "800") + " " + size + "px " + MB2.FONT;
		ctx.textAlign = align || "center";
		ctx.textBaseline = "middle";
		const lines = String(txt).split("\n");
		const lh = size * 1.15;
		let yy = y - (lines.length - 1) * lh / 2;
		for (const l of lines) {
			if (stroke) {
				ctx.lineJoin = "round";
				ctx.lineWidth = Math.max(2, size / 5);
				ctx.strokeStyle = stroke;
				ctx.strokeText(l, x, yy);
			}
			ctx.fillStyle = fill;
			ctx.fillText(l, x, yy);
			yy += lh;
		}
	},
	// cached offscreen drawing (drawn at 2x for crispness)
	cache(key, w, h, fn) {
		const C = MB2.G._cache || (MB2.G._cache = {});
		if (!C[key]) {
			const c = document.createElement("canvas");
			c.width = Math.ceil(w * 2); c.height = Math.ceil(h * 2);
			const x = c.getContext("2d");
			x.scale(2, 2);
			fn(x);
			C[key] = c;
		}
		return C[key];
	}
};

// ball colours : jaune, verte, rouge, orange, bleue, metal, violette
MB2.BALL_COLORS = [
	["#ffd41c", "#b87a00", "#fffbd0"],
	["#95e04c", "#3a8a14", "#efffd8"],
	["#ee4a22", "#7a1004", "#ffc4a8"],
	["#ffa01e", "#c04c00", "#fff0b8"],
	["#a8e2ff", "#3c86c4", "#ffffff"],
	["#d2d6dc", "#646e7a", "#ffffff"],
	["#bf84ea", "#6a2a9c", "#f6e6ff"]
];

MB2.SYMBOLS = {};
const SYM = MB2.SYMBOLS;
const G = MB2.G;

SYM.empty = { draw() { } };

// ---------------------------------------------------------------------------
// room background / border / holes
SYM.background = {
	frames: 4,
	draw(ctx, c) { G.img(ctx, "bg0" + c.frame, 610, 410, 0, 0); }
};

// the room border : a flat green "pipe" (colours taken from game screenshots)
MB2.BORDER_COL = { body: "#7dd64e", dark: "#4fa628", light: "#b4f08a" };
MB2.borderCanvas = function (gaps) {
	return G.cache("border" + gaps, 610, 410, x => {
		const B = MB2.Const.BORDER_SIZE, C = MB2.BORDER_COL;
		const inner = { x: B, y: B, w: 610 - 2 * B, h: 410 - 2 * B };
		x.beginPath();
		x.rect(0, 0, 610, 410);
		MB2.Tools.smoothSquarePath(x, inner, 22);
		x.closePath();
		x.fillStyle = C.body;
		x.fill("evenodd");
		// light stripe along the pipe, dark edge on the room side
		x.beginPath();
		MB2.Tools.smoothSquarePath(x, { x: B - 9, y: B - 9, w: inner.w + 18, h: inner.h + 18 }, 28);
		x.strokeStyle = C.light;
		x.lineWidth = 3;
		x.stroke();
		x.beginPath();
		MB2.Tools.smoothSquarePath(x, { x: B - 1.5, y: B - 1.5, w: inner.w + 3, h: inner.h + 3 }, 23);
		x.strokeStyle = C.dark;
		x.lineWidth = 3;
		x.stroke();
		if (gaps) {
			x.globalCompositeOperation = "destination-out";
			const D = MB2.Const.DOOR_SIZE;
			x.fillRect(305 - D / 2, 0, D, B + 4);
			x.fillRect(305 - D / 2, 410 - B - 4, D, B + 4);
			x.fillRect(0, 205 - D / 2, B + 4, D);
			x.fillRect(610 - B - 4, 205 - D / 2, B + 4, D);
		}
	});
};
SYM.border = {
	draw(ctx) { ctx.drawImage(MB2.borderCanvas(true), 0, 0, 610, 410); }
};

// door : frames off(1) on(2) open(3-14) opened(15) nodoor0-3(16-19)
// A closed door is made of two pieces of border with rounded tips meeting in the
// middle ; they slide into the border when the door opens.
SYM.door = {
	frames: 19,
	labels: { off: 1, on: 2, open: 3, opened: 15, nodoor0: 16, nodoor1: 17, nodoor2: 18, nodoor3: 19 },
	actions: { 1: c => c.stop(), 2: c => c.stop(), 15: c => c.stop(), 16: c => c.stop(), 17: c => c.stop(), 18: c => c.stop(), 19: c => c.stop() },
	draw(ctx, c) {
		const D = MB2.Const.DOOR_SIZE, B = MB2.Const.BORDER_SIZE, C = MB2.BORDER_COL;
		if (c.frame >= 16) {
			// wall piece of the border (drawn in room coordinates)
			const d = c.frame - 16;
			const r = [[0, 205 - D / 2, B + 4, D], [610 - B - 4, 205 - D / 2, B + 4, D], [305 - D / 2, 0, D, B + 4], [305 - D / 2, 410 - B - 4, D, B + 4]][d];
			const home = [[B / 2, 205], [610 - B / 2, 205], [305, B / 2], [305, 410 - B / 2]][d];
			ctx.rotate(-c.rotation * Math.PI / 180);
			ctx.translate(-home[0], -home[1]);
			ctx.drawImage(MB2.borderCanvas(false), r[0] * 2, r[1] * 2, r[2] * 2, r[3] * 2, r[0], r[1], r[2], r[3]);
			return;
		}
		if (c.frame === 15) return;
		const open = c.frame >= 3 ? (c.frame - 2) / 12 : 0;
		// local coords : the room is toward +y, the pipe spans y in [-B/2-2, B/2+2]
		const top = -B / 2 - 2, bot = B / 2 + 2, h = bot - top;
		ctx.save();
		ctx.beginPath();
		ctx.rect(-D / 2 - 1, top - 1, D + 2, h + 2);
		ctx.clip();
		const half = D / 2;
		const slide = open * (half + 4);
		for (const s of [-1, 1]) {
			const tip = s * (1.5 + slide); // x of the rounded tip
			const far = s * (half + 30);
			const R = h / 2;
			const cx = tip + s * R;
			ctx.beginPath();
			ctx.moveTo(far, top);
			ctx.lineTo(cx, top);
			ctx.arc(cx, 0, R, -Math.PI / 2, Math.PI / 2, s > 0);
			ctx.lineTo(far, bot);
			ctx.closePath();
			ctx.fillStyle = C.body;
			ctx.fill();
			// light stripe and dark room-side edge, as on the border
			ctx.save();
			ctx.clip();
			ctx.strokeStyle = C.light;
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.moveTo(far, 3.5);
			ctx.lineTo(cx - s * 2, 3.5);
			ctx.stroke();
			ctx.strokeStyle = C.dark;
			ctx.beginPath();
			ctx.arc(cx, 0, R - 1.5, Math.PI / 2 + s * 1.3, Math.PI / 2, s > 0);
			ctx.lineTo(far, R - 1.5);
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();
	}
};
// holes : bgHole bitmap masked by the room holes (see Interf.update_walls)
SYM.ground = {
	draw(ctx, c) {
		const holes = c.holes;
		if (!holes || !holes.rects.length) return;
		ctx.save();
		ctx.beginPath();
		for (const r of holes.rects) ctx.rect(r[0], r[1], r[2], r[3]);
		ctx.clip();
		G.img(ctx, "bgHole", 610, 410, 0, 0);
		// inner shadow on top of each hole
		ctx.fillStyle = "rgba(40,10,60,0.35)";
		for (const r of holes.rects) if (r[4]) ctx.fillRect(r[0], r[1], r[2], 6);
		ctx.restore();
	}
};
SYM.holes = { init(c) { c.rects = []; }, draw() { } };
SYM.shades = {
	init(c) { c.ops = []; },
	draw(ctx, c) {
		for (const o of c.ops) {
			if (o.t === "rect") {
				ctx.fillStyle = o.col;
				ctx.fillRect(o.x, o.y, o.w, o.h);
			} else {
				ctx.fillStyle = "rgba(0,0,0," + o.a + ")";
				ctx.beginPath();
				MB2.Tools.smoothSquarePath(ctx, o, o.curve);
				ctx.fill();
			}
		}
	}
};

// ---------------------------------------------------------------------------
// bumpers
function pulse(c, start, len) {
	if (c.frame < start || c.frame >= start + len) return 1;
	const t = (c.frame - start) / len;
	return 1 + Math.sin(t * Math.PI) * 0.18;
}
function stopAt(n) { return c => c.gotoAndStop(n); }

// shade under bumpers (frame = btype)
SYM.ombre = {
	frames: 14,
	draw(ctx, c) {
		const R = [0, 22, 27, 17, 17, 22, 18, 18, 8, 8, 20, 14, 18, 18, 14][c.frame] || 18;
		ctx.fillStyle = "rgba(40,0,70,0.22)";
		ctx.beginPath();
		ctx.ellipse(4, 5, R, R * 0.9, 0, 0, Math.PI * 2);
		ctx.fill();
	}
};

SYM.bnormal = {
	w: 48, h: 48, frames: 10, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 10: stopAt(1) },
	draw(ctx, c) {
		const s = pulse(c, 2, 9);
		ctx.scale(s, s);
		G.img(ctx, "normal_base", 46, 46);
		G.img(ctx, "normal_top", 23, 23);
		if (c.frame > 1) {
			ctx.globalAlpha *= 1 - (c.frame - 2) / 8;
			ctx.fillStyle = "rgba(255,255,255,0.6)";
			G.circle(ctx, 0, 0, 22); ctx.fill();
		}
	}
};

SYM.btime = {
	w: 64, h: 64, frames: 10, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 10: stopAt(1) },
	init(c) { c.aig = { rotation: 0 }; c.aig2 = { rotation: 0 }; },
	draw(ctx, c) {
		const s = pulse(c, 2, 9);
		ctx.scale(s, s);
		// green bumps around the clock
		ctx.fillStyle = "#6cc93a";
		for (let i = 0; i < 8; i++) {
			const a = i * Math.PI / 4;
			G.circle(ctx, Math.cos(a) * 26, Math.sin(a) * 26, 6);
			ctx.fill();
		}
		G.img(ctx, "time_base", 54, 54);
		ctx.fillStyle = "#7a2aa0";
		for (const [rot, len] of [[c.aig.rotation, 12], [c.aig2.rotation, 17]]) {
			ctx.save();
			ctx.rotate(rot * Math.PI / 180);
			ctx.beginPath();
			ctx.ellipse(0, -len / 2, 2.8, len / 2, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		G.ball(ctx, 0, 0, 2.5, "#c05ae0", "#5a1a78");
		if (c.frame > 1) {
			ctx.globalAlpha *= 1 - (c.frame - 2) / 8;
			ctx.fillStyle = "rgba(255,255,255,0.6)";
			G.circle(ctx, 0, 0, 28); ctx.fill();
		}
	}
};

SYM.bdeath = {
	w: 40, h: 40, frames: 12, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 12: stopAt(1) },
	draw(ctx, c) {
		const s = pulse(c, 2, 11);
		ctx.scale(s, s);
		if (c.frame > 1) ctx.rotate((c.frame - 2) * 0.2);
		G.img(ctx, "death_base", 38, 39);
	}
};

// magnet : "plus" (attracts) / "neg" (repels)
SYM.bmagnet = {
	w: 40, h: 40, frames: 40, labels: { plus: 1, neg: 21 },
	actions: { 20: c => c.gotoAndPlay(1), 40: c => c.gotoAndPlay(21) },
	draw(ctx, c) {
		const neg = c.frame > 20;
		const t = ((c.frame - 1) % 20) / 20;
		// field ring
		ctx.strokeStyle = neg ? "rgba(255,90,60," + (0.5 * (1 - t)) + ")" : "rgba(120,255,90," + (0.5 * t) + ")";
		ctx.lineWidth = 2;
		G.circle(ctx, 0, 0, neg ? 18 + t * 18 : 36 - t * 18);
		ctx.stroke();
		G.img(ctx, "magnet_base", 38, 38);
		G.img(ctx, "magnet_top", 24, 24);
		G.img(ctx, neg ? "magnet_minus" : "magnet_plus", 15, neg ? 11 : 14);
	}
};

SYM.bshadow = {
	w: 56, h: 56, frames: 10, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 10: stopAt(1) },
	draw(ctx, c) {
		const s = pulse(c, 2, 9);
		ctx.scale(s, s);
		const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 27);
		g.addColorStop(0, "#2a0a40");
		g.addColorStop(0.55, "#5a2a84");
		g.addColorStop(0.8, "#8a58b8");
		g.addColorStop(1, "rgba(60,20,90,0)");
		ctx.fillStyle = g;
		G.circle(ctx, 0, 0, 27); ctx.fill();
		ctx.strokeStyle = "rgba(220,180,255,0.6)";
		ctx.lineWidth = 2;
		G.circle(ctx, 0, 0, 17); ctx.stroke();
		G.ball(ctx, 0, 0, 9, "#6a3a9a", "#200834", "#c8a0f0");
	}
};

// green block (16 frames according to the neighbours : 1 left, 2 up, 4 right, 8 down)
SYM.wall = {
	w: 40, h: 40, frames: 16,
	draw(ctx, c) {
		const f = c.frame - 1;
		const e = 6;
		const l = (f & 1) ? -20 - e : -19, u = (f & 2) ? -20 - e : -19, r = (f & 4) ? 20 + e : 19, d = (f & 8) ? 20 + e : 19;
		ctx.save();
		ctx.beginPath(); ctx.rect(-20, -20, 40, 40); ctx.clip();
		const g = ctx.createLinearGradient(-20, -20, 20, 20);
		g.addColorStop(0, "#b4f0a0");
		g.addColorStop(1, "#8fdc78");
		ctx.fillStyle = g;
		G.rrect(ctx, l, u, r - l, d - u, 8);
		ctx.fill();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = "#62b24a";
		ctx.stroke();
		// soft highlight in the top-left corner of each block
		if (!(f & 1) && !(f & 2)) {
			ctx.strokeStyle = "rgba(255,255,255,0.75)";
			ctx.lineWidth = 2.5;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(l + 4, u + 16);
			ctx.lineTo(l + 4, u + 10);
			ctx.quadraticCurveTo(l + 4, u + 4, l + 10, u + 4);
			ctx.lineTo(l + 16, u + 4);
			ctx.stroke();
		}
		ctx.restore();
	}
};

SYM.wallpart = {
	w: 12, h: 12,
	draw(ctx) {
		ctx.fillStyle = "#a6e67c";
		ctx.strokeStyle = "#5cae34";
		ctx.lineWidth = 1.5;
		G.rrect(ctx, -6, -6, 12, 12, 3);
		ctx.fill(); ctx.stroke();
	}
};

// inter blocks : on = raised (solid), off = lowered
function interBlock(color) {
	return {
		// "off" = raised (solid), "on" = lowered
		w: 40, h: 40, frames: 16, labels: { off: 1, on: 8, playOn: 2, playOff: 9 },
		actions: { 1: c => c.stop(), 8: c => c.stop(), 16: stopAt(1) },
		draw(ctx, c) {
			// progress 1 = raised
			let p;
			if (c.frame === 1) p = 1;
			else if (c.frame <= 8) p = 1 - (c.frame - 1) / 7;
			else p = (c.frame - 8) / 8;
			G.img(ctx, "inter_low_" + color, 40, 40);
			if (p > 0) {
				ctx.globalAlpha *= p;
				G.img(ctx, "inter_high_" + color, 40, 40, -20, -20 - 3 * p);
			}
		}
	};
}
SYM.interred = interBlock("pink");
SYM.interblue = interBlock("blue");

// switch toggling the inter blocks
SYM.interupt = {
	w: 32, h: 32, frames: 16, labels: { off: 1, on: 8, playOn: 2, playOff: 9 },
	actions: { 1: c => c.stop(), 7: stopAt(8), 8: c => c.stop(), 16: stopAt(1) },
	draw(ctx, c) {
		const f = c.frame;
		const rot = f === 1 ? 0 : f <= 8 ? (f - 1) / 7 * Math.PI : Math.PI + (f - 8) / 8 * Math.PI;
		G.ball(ctx, 0, 0, 15, "#e8e4f0", "#7a7288");
		ctx.save();
		ctx.rotate(rot);
		ctx.fillStyle = "#ff6ec8";
		ctx.beginPath(); ctx.arc(0, 0, 10, -Math.PI / 2, Math.PI / 2); ctx.fill();
		ctx.fillStyle = "#5a6cff";
		ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI / 2, Math.PI * 1.5); ctx.fill();
		ctx.restore();
		ctx.strokeStyle = "#4a4458"; ctx.lineWidth = 1.5;
		G.circle(ctx, 0, 0, 10); ctx.stroke();
		G.shine(ctx, 0, 0, 14, 0.5);
	}
};

// zappers : a post coloured like the ball colour that can cross the beam
SYM.zapper = {
	w: 32, h: 32, frames: 7,
	draw(ctx, c) {
		const col = MB2.BALL_COLORS[c.frame - 1];
		G.ball(ctx, 0, 0, 14, "#dcdce6", "#4a4a5a");
		ctx.strokeStyle = "#3a3a48"; ctx.lineWidth = 1;
		G.circle(ctx, 0, 0, 14); ctx.stroke();
		G.ball(ctx, 0, 0, 8, col[0], col[1], col[2]);
		const t = (MB2.frameCount || 0) * 0.15 + c.x;
		ctx.fillStyle = "rgba(255,255,255," + (0.3 + 0.3 * Math.sin(t)) + ")";
		G.circle(ctx, 0, 0, 9); ctx.fill();
	}
};
SYM.checkpoint = {
	w: 32, h: 32,
	draw(ctx, c) {
		G.ball(ctx, 0, 0, 14, "#fff4b0", "#b08400");
		ctx.strokeStyle = "#7a5a00"; ctx.lineWidth = 1;
		G.circle(ctx, 0, 0, 14); ctx.stroke();
		// chequered flag
		for (let i = 0; i < 4; i++)
			for (let j = 0; j < 3; j++) {
				ctx.fillStyle = (i + j) % 2 ? "#222" : "#fff";
				ctx.fillRect(-6 + i * 3, -5 + j * 3, 3, 3);
			}
	}
};
// the laser drawn when the ball dies on a zapper line
SYM.flashLine = {
	w: 100, h: 10, frames: 12,
	init(c) { c.gfx = { frame: 1, gotoAndStop(f) { this.frame = f; } }; c.playing = true; },
	actions: { 12: c => c.removeMovieClip() },
	draw(ctx, c) {
		const col = MB2.BALL_COLORS[(c.gfx.frame - 1) % 7];
		const a = 1 - (c.frame - 1) / 12;
		ctx.globalAlpha *= a;
		ctx.fillStyle = col[0];
		ctx.fillRect(0, -3, 100, 6);
		ctx.fillStyle = "rgba(255,255,255,0.9)";
		ctx.fillRect(0, -1, 100, 2);
	}
};

SYM.bteleport = {
	w: 48, h: 48,
	init(c) {
		c.num = 5;
		c.circles = [];
		for (let i = 0; i < c.num; i++)
			c.circles.push({ gfx: { y: random(6), rotation: random(360) }, rotation: 0, xscale: 100, yscale: 100, rot: 3 + random(3), c: random(628) });
		for (let i = 0; i < c.num; i++) c["c" + i] = c.circles[i];
	},
	draw(ctx, c) {
		const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
		g.addColorStop(0, "rgba(255,255,255,0.95)");
		g.addColorStop(0.4, "rgba(210,150,255,0.6)");
		g.addColorStop(1, "rgba(120,40,200,0)");
		ctx.fillStyle = g;
		G.circle(ctx, 0, 0, 24); ctx.fill();
		for (const k of c.circles) {
			ctx.save();
			ctx.rotate(k.rotation * Math.PI / 180);
			ctx.scale(k.xscale / 100, k.yscale / 100);
			ctx.rotate(k.gfx.rotation * Math.PI / 180);
			ctx.strokeStyle = "rgba(255,255,255,0.75)";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.ellipse(0, k.gfx.y, 14, 8, 0, 0, Math.PI * 1.3);
			ctx.stroke();
			ctx.restore();
		}
	}
};

// pastilles
SYM.red = {
	w: 24, h: 24, frames: 12, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 12: c => c.removeMovieClip() },
	draw(ctx, c) {
		if (c.frame > 1) { sparkle(ctx, (c.frame - 2) / 10, "#ff5040"); return; }
		const h = ctx.createRadialGradient(0, 0, 4, 0, 0, 12);
		h.addColorStop(0, "rgba(255,255,255,0.9)");
		h.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = h;
		G.circle(ctx, 0, 0, 12); ctx.fill();
		G.ball(ctx, 0, 0, 7, "#ff2a2a", "#8a0000", "#ffd0d0");
	}
};
SYM.blue = {
	w: 24, h: 24, frames: 12, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 12: c => c.removeMovieClip() },
	draw(ctx, c) {
		if (c.frame > 1) { sparkle(ctx, (c.frame - 2) / 10, "#ffd040"); return; }
		ctx.fillStyle = "rgba(60,0,60,0.25)";
		G.circle(ctx, 2, 2, 6); ctx.fill();
		G.ball(ctx, 0, 0, 6, "#ffcc22", "#b06a00", "#fff6c0");
	}
};
function sparkle(ctx, t, col) {
	ctx.globalAlpha *= 1 - t;
	ctx.strokeStyle = col;
	ctx.lineWidth = 2;
	for (let i = 0; i < 6; i++) {
		const a = i * Math.PI / 3;
		ctx.beginPath();
		ctx.moveTo(Math.cos(a) * (3 + t * 10), Math.sin(a) * (3 + t * 10));
		ctx.lineTo(Math.cos(a) * (6 + t * 16), Math.sin(a) * (6 + t * 16));
		ctx.stroke();
	}
	ctx.fillStyle = "#fff";
	G.circle(ctx, 0, 0, 4 * (1 - t)); ctx.fill();
}

// collision spark
SYM.hit = {
	w: 16, h: 16, frames: 8,
	init(c) { c.playing = true; },
	actions: { 8: c => c.removeMovieClip() },
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

// classic mode exit hatch
SYM.exit = {
	w: 40, h: 40, frames: 14, labels: { anim_open: 2 },
	init(c) { c.flOpen = false; },
	actions: { 1: c => c.stop(), 14: c => { c.stop(); c.flOpen = true; } },
	draw(ctx, c) {
		ctx.fillStyle = "#2a0c40";
		G.rrect(ctx, -17, -17, 34, 34, 8); ctx.fill();
		const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
		g.addColorStop(0, "#000");
		g.addColorStop(1, "#4a1a6a");
		ctx.fillStyle = g;
		G.circle(ctx, 0, 0, 14); ctx.fill();
		const open = c.frame === 1 ? 0 : (c.frame - 1) / 13;
		if (open < 1) {
			ctx.save();
			ctx.beginPath(); ctx.rect(-17, -17, 34, 34); ctx.clip();
			ctx.fillStyle = "#d8a8f0";
			ctx.strokeStyle = "#7a3a9a";
			ctx.lineWidth = 1.5;
			G.rrect(ctx, -17 - open * 17, -17, 17, 34, 5); ctx.fill(); ctx.stroke();
			G.rrect(ctx, 0 + open * 17, -17, 17, 34, 5); ctx.fill(); ctx.stroke();
			ctx.restore();
		}
		ctx.strokeStyle = c.flOpen ? "#7cff4a" : "#b070d8";
		ctx.lineWidth = 2;
		G.rrect(ctx, -18, -18, 36, 36, 8); ctx.stroke();
	}
};
SYM.maskHole = { w: 40, h: 40, draw() { } };

// item box : frames 1-5 are the items (map, radar, small time, big time, key)
MB2.drawItemIcon = function (ctx, item, s) {
	ctx.save();
	ctx.scale(s, s);
	switch (item) {
	case 0: // map
		ctx.fillStyle = "#ffe07a"; ctx.strokeStyle = "#b07a00"; ctx.lineWidth = 1.5;
		G.rrect(ctx, -11, -8, 22, 16, 3); ctx.fill(); ctx.stroke();
		ctx.strokeStyle = "#c0902a"; ctx.lineWidth = 1;
		ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-4, 8); ctx.moveTo(4, -8); ctx.lineTo(4, 8); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke();
		ctx.fillStyle = "#e0301a"; G.circle(ctx, 6, -4, 2); ctx.fill();
		break;
	case 1: // radar
		G.ball(ctx, 0, 0, 10, "#2a9a4a", "#0a3a1a", "#8affa0");
		ctx.strokeStyle = "rgba(160,255,170,0.8)"; ctx.lineWidth = 1;
		G.circle(ctx, 0, 0, 6); ctx.stroke();
		ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, -5); ctx.stroke();
		ctx.fillStyle = "#ff4040"; G.circle(ctx, -4, 3, 1.8); ctx.fill();
		break;
	case 2: // small time
	case 3: // big time
		const r = item === 2 ? 8 : 11;
		G.ball(ctx, 0, 0, r, item === 2 ? "#9ad8ff" : "#4aa8ff", "#1a4a9a", "#fff");
		ctx.strokeStyle = "#0a2a6a"; ctx.lineWidth = 1.5; ctx.lineCap = "round";
		ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.7); ctx.moveTo(0, 0); ctx.lineTo(r * 0.5, 0); ctx.stroke();
		break;
	case 4: // key : a grelot (bell)
		MB2.drawGrelot(ctx, 1);
		break;
	}
	ctx.restore();
};
MB2.drawGrelot = function (ctx, s) {
	ctx.save();
	ctx.scale(s, s);
	G.ball(ctx, 0, 1, 8, "#ffd84a", "#a86a00", "#fff8c0");
	ctx.fillStyle = "#6a4000";
	ctx.fillRect(-5, 2, 10, 1.5);
	G.circle(ctx, 0, 5, 1.8); ctx.fill();
	ctx.strokeStyle = "#a86a00"; ctx.lineWidth = 1.5;
	G.circle(ctx, 0, -8, 2.5); ctx.stroke();
	ctx.restore();
};
SYM.itembox = {
	w: 48, h: 48, frames: 16, labels: { hit: 2 },
	init(c) { c.item = { frame: 1, gotoAndStop(f) { this.frame = f; } }; },
	actions: { 1: c => c.stop(), 16: c => c.stop() },
	draw(ctx, c) {
		const t = (MB2.frameCount || 0) / 20;
		if (c.frame === 1) {
			const g = ctx.createRadialGradient(-6, -8, 3, 0, 0, 23);
			g.addColorStop(0, "rgba(255,255,255,0.9)");
			g.addColorStop(0.6, "rgba(200,240,255,0.35)");
			g.addColorStop(1, "rgba(120,200,255,0.6)");
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, 23); ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 1.5; ctx.stroke();
			MB2.drawItemIcon(ctx, c.item.frame - 1, 1 + 0.08 * Math.sin(t * 3));
			G.shine(ctx, 0, 0, 22, 0.55);
		} else {
			// opened box : bubble bursts
			const k = (c.frame - 2) / 14;
			ctx.globalAlpha *= 1 - k;
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 2;
			G.circle(ctx, 0, 0, 23 + k * 20); ctx.stroke();
			MB2.drawItemIcon(ctx, c.item.frame - 1, 1 + k);
		}
	}
};

// ball box (object rooms)
SYM.ballbox = {
	w: 48, h: 48, frames: 16, labels: { hit: 2 },
	init(c) { c.ball = { frame: 1, gotoAndStop(f) { this.frame = f; } }; },
	actions: { 1: c => c.stop(), 16: c => c.removeMovieClip() },
	draw(ctx, c) {
		const t = (MB2.frameCount || 0) / 15;
		const k = c.frame === 1 ? 0 : (c.frame - 2) / 14;
		ctx.globalAlpha *= 1 - k;
		const col = MB2.BALL_COLORS[c.ball.frame - 1] || MB2.BALL_COLORS[0];
		// aura
		const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 24 + k * 20);
		g.addColorStop(0, "rgba(255,255,255,0.8)");
		g.addColorStop(0.5, "rgba(255,255,255,0.25)");
		g.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = g;
		G.circle(ctx, 0, 0, 24 + k * 20); ctx.fill();
		ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5;
		G.circle(ctx, 0, 0, 20 + Math.sin(t) * 2); ctx.stroke();
		const y = Math.sin(t * 1.3) * 2;
		G.ball(ctx, 0, y, 9, col[0], col[1], col[2]);
		G.shine(ctx, 0, y, 9, 0.7);
	}
};

// ---------------------------------------------------------------------------
// ball
SYM.shadow = {
	draw(ctx) {
		ctx.fillStyle = "rgba(40,0,60,0.3)";
		ctx.beginPath(); ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
	}
};
SYM.marble = {
	w: 18, h: 18,
	draw(ctx, c) {
		const b = c.ball;
		const col = MB2.BALL_COLORS[b.btype] || MB2.BALL_COLORS[0];
		const R = 9;
		G.ball(ctx, 0, 0, R, col[0], col[1], col[2]);
		// rolling stones
		ctx.save();
		G.circle(ctx, 0, 0, R - 0.5);
		ctx.clip();
		for (const s of b.stoneList) {
			if (s.alpha <= 0) continue;
			ctx.globalAlpha = Math.min(1, s.alpha / 100) * 0.55;
			ctx.fillStyle = s.col;
			G.circle(ctx, s.x, s.y, s.size);
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

// ---------------------------------------------------------------------------
// HUD
SYM["time counter"] = {
	frames: 20, labels: { classic: 2, time: 3 },
	actions: { 1: c => c.stop(), 2: c => c.stop(), 11: c => c.stop(), 20: stopAt(11) },
	init(c) { c.txt = ""; c.niv = ""; c.lap = ""; c.min = "00"; c.sec = "00"; c.mil = "00"; },
	draw(ctx, c) {
		const pill = (x, w) => {
			ctx.fillStyle = "rgba(230,255,215,0.45)";
			G.rrect(ctx, x, 1, w, 24, 6); ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.stroke();
		};
		const txt = (t, x, col) => G.text(ctx, t, x, 14, 20, col || "#ffffff", "rgba(70,150,40,0.55)");
		ctx.save();
		ctx.translate(-610, 0); // registration point on the right (tview._x = LVL_WIDTH)
		if (c.frame === 1) {
			pill(1, 92);
			txt(c.txt, 47);
		} else if (c.frame === 2) {
			pill(1, 64);
			txt(c.niv, 33);
			pill(69, 78);
			MB2.drawClockIcon(ctx, 84, 14);
			txt(c.txt, 118);
		} else {
			const intro = c.frame < 11 ? (c.frame - 3) / 8 : 1;
			const lap = c.frame > 11 ? (c.frame - 11) / 9 : 0;
			ctx.globalAlpha *= intro;
			pill(1, 112);
			txt(c.min + "'" + c.sec + "\"" + c.mil, 57);
			pill(117, 50);
			MB2.drawLapIcon(ctx, 132, 14);
			txt(c.lap, 152, lap > 0 ? "#ffe060" : "#fff");
			if (lap > 0) {
				ctx.globalAlpha = Math.sin(lap * Math.PI);
				G.text(ctx, "TOUR !", 305, 120, 40 + lap * 10, "#ffe060", "#7a3a00");
			}
		}
		ctx.restore();
	}
};
MB2.drawClockIcon = function (ctx, x, y) {
	ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
	G.circle(ctx, x, y, 6); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 4); ctx.moveTo(x, y); ctx.lineTo(x + 3, y); ctx.stroke();
};
MB2.drawLapIcon = function (ctx, x, y) {
	ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.arc(x, y, 5.5, -Math.PI * 0.2, Math.PI * 1.5); ctx.stroke();
	ctx.fillStyle = "#fff";
	ctx.beginPath(); ctx.moveTo(x + 2, y - 8); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x + 1, y - 3); ctx.fill();
};

SYM["ball icon"] = {
	frames: 2, labels: { select: 1, on: 2 },
	init(c) { c.ball = { frame: 1, gotoAndStop(f) { this.frame = f; } }; },
	draw(ctx, c) {
		const col = MB2.BALL_COLORS[c.ball.frame - 1];
		const on = c.frame === 2;
		const r = 11.5;
		ctx.fillStyle = on ? "#ffffff" : "rgba(60,110,30,0.5)";
		G.circle(ctx, 0, 0, r + 1.5); ctx.fill();
		const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, r);
		g.addColorStop(0, col[2]);
		g.addColorStop(0.45, col[0]);
		g.addColorStop(1, col[1]);
		ctx.fillStyle = g;
		G.circle(ctx, 0, 0, r); ctx.fill();
	}
};
SYM["icon grelot"] = {
	frames: 12, labels: { hit: 2 },
	actions: { 1: c => c.stop(), 12: c => c.removeMovieClip() },
	draw(ctx, c) {
		if (c.frame > 1) {
			const t = (c.frame - 2) / 10;
			ctx.globalAlpha *= 1 - t;
			ctx.scale(1 + t, 1 + t);
		}
		MB2.drawGrelot(ctx, 1);
	}
};
