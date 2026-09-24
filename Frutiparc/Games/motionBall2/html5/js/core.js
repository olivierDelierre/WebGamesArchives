// MotionBall 2 - HTML5 port : core helpers
// Emulates the small part of the Flash / asml runtime the game relied on :
// MovieClip-like "Clip" objects with a timeline, DepthManager, Key, Std.
"use strict";

// MB2 namespace is created in index.html

// ---------------------------------------------------------------------------
// Const (mb2/Const.as)
MB2.Const = (function () {
	const C = {
		POS_X: 0, POS_Y: 0,
		MODE_CHALLENGE: 1, MODE_CLASSIC: 3, MODE_COURSE: 10, MODE_AVENTURE: 20, MODE_AIDE: 100,
		TIME_CHALLENGE: 15 * 60 * 1000, TIME_CLASSIC: 60 * 1000, TIME_CLASSIC_EXTENDED: 5 * 1000,
		DELTA: 4, LVL_WIDTH: 610, LVL_HEIGHT: 410, MAX_BUMPERS: 50, BORDER_SIZE: 25, BALL_RAYSIZE: 8,
		HOLE_BORDER_SIZE: 7, DOOR_SIZE: 110, DOOR_COLLIDE_DELTA: 5,
		CAUSE_NOTIME: 1, CAUSE_NOBALLS: 2, CAUSE_WINS: 3,
		BG_PLAN: 0, SHADE_PLAN: 1, DECOR_PLAN: 2, DOOR_PLAN: 2, HOLE_PLAN: 3, BONUS_PLAN: 4, BALL_PLAN: 5,
		BUMPER_PLAN: 6, DUMMY_PLAN: 7, BOSS_PLAN: 8, ICON_PLAN: 9
	};
	C.LVL_CWIDTH = (C.LVL_WIDTH / C.DELTA) | 0;
	C.LVL_CHEIGHT = (C.LVL_HEIGHT / C.DELTA) | 0;
	C.BORDER_CSIZE = (C.BORDER_SIZE / C.DELTA) | 0;
	C.DOOR_CSIZE = Math.ceil(C.DOOR_SIZE / C.DELTA);
	C.DOOR_CXPOS = ((C.LVL_CWIDTH - C.DOOR_CSIZE) / 2) | 0;
	C.DOOR_CYPOS = ((C.LVL_CHEIGHT - C.DOOR_CSIZE) / 2) | 0;
	C.POS_NBITS = Math.ceil(Math.log(Math.max(C.LVL_CWIDTH, C.LVL_CHEIGHT)) / Math.LN2);
	C.BOSS_MIN_X = C.BORDER_SIZE * 2;
	C.BOSS_MIN_Y = C.BORDER_SIZE;
	C.BOSS_MAX_Y = C.BORDER_SIZE;
	return C;
})();

// ---------------------------------------------------------------------------
// Std (the MotionTwin AS2 std lib)
MB2.Std = {
	FPS: 40,
	tmod: 1,
	deltaT: 1 / 40,
	random(n) { return n > 0 ? Math.floor(Math.random() * n) : 0; },
	randomProbas(a) {
		let tot = 0;
		for (const p of a) tot += p;
		let r = Math.floor(Math.random() * tot);
		for (let i = 0; i < a.length; i++) {
			r -= a[i];
			if (r < 0) return i;
		}
		return 0;
	},
	xmouse: 0,
	ymouse: 0
};
const random = MB2.Std.random;

// Array helper used all around the AS2 code (asml added Array.remove)
MB2.removeFrom = function (a, v) {
	const i = a.indexOf(v);
	if (i >= 0) { a.splice(i, 1); return true; }
	return false;
};

// ---------------------------------------------------------------------------
// Tools (mb2/Tools.as)
MB2.Tools = {
	mc_size(mc) {
		const C = MB2.Const;
		return {
			w: Math.ceil((mc.width / 2) / C.DELTA) * 2,
			h: Math.ceil((mc.height / 2) / C.DELTA) * 2
		};
	},
	set_mcpos(mc, p) {
		const s = MB2.Tools.mc_size(mc);
		mc.x = (p.x + s.w / 2) * MB2.Const.DELTA;
		mc.y = (p.y + s.h / 2) * MB2.Const.DELTA;
	},
	pos_center(mc) {
		const C = MB2.Const;
		const s = MB2.Tools.mc_size(mc);
		return {
			x: (((C.LVL_CWIDTH - C.BORDER_CSIZE * 2) / 2 + C.BORDER_CSIZE) | 0) - s.w / 2,
			y: (((C.LVL_CHEIGHT - C.BORDER_CSIZE * 2) / 2 + C.BORDER_CSIZE) | 0) - s.h / 2
		};
	},
	rad_dif(a, b) {
		let d = b - a;
		d -= Math.trunc(d / (2 * Math.PI)) * Math.PI * 2;
		if (d > Math.PI) return d - Math.PI * 2;
		if (d <= -Math.PI) return d + Math.PI * 2;
		return d;
	},
	dist2(a, b) {
		const dx = a.x - b.x, dy = a.y - b.y;
		return dx * dx + dy * dy;
	},
	smoothSquarePath(ctx, p, curve) {
		ctx.moveTo(p.x + curve, p.y);
		ctx.lineTo(p.x + p.w - curve, p.y);
		ctx.quadraticCurveTo(p.x + p.w, p.y, p.x + p.w, p.y + curve);
		ctx.lineTo(p.x + p.w, p.y + p.h - curve);
		ctx.quadraticCurveTo(p.x + p.w, p.y + p.h, p.x + p.w - curve, p.y + p.h);
		ctx.lineTo(p.x + curve, p.y + p.h);
		ctx.quadraticCurveTo(p.x, p.y + p.h, p.x, p.y + p.h - curve);
		ctx.lineTo(p.x, p.y + curve);
		ctx.quadraticCurveTo(p.x, p.y, p.x + curve, p.y);
	}
};

// ---------------------------------------------------------------------------
// Clip : a MovieClip instance of a symbol (see gfx.js for the symbols).
// A symbol is { w, h, frames, labels:{name:frame}, actions:{frame:fn(clip)}, init(clip), draw(ctx,clip) }
MB2.Clip = class {
	constructor(sym) {
		if (typeof sym === "string") {
			const s = MB2.SYMBOLS[sym];
			if (!s) throw new Error("Unknown symbol " + sym);
			sym = s;
		}
		this.sym = sym;
		this.x = 0; this.y = 0;
		this.rotation = 0;
		this.xscale = 100; this.yscale = 100;
		this.alpha = 100;
		this.visible = true;
		this.frame = 1;
		this.playing = false;
		this.removed = false;
		this.mask = null;
		this.tint = null; // { r, g, b, k } additive colour
		this.width = sym.w || 0;
		this.height = sym.h || 0;
		if (sym.init) sym.init(this);
	}
	get totalframes() { return this.sym.frames || 1; }
	resolve(f) {
		if (typeof f === "number") return f;
		const l = this.sym.labels && this.sym.labels[f];
		if (l === undefined) return this.frame;
		return l;
	}
	gotoAndStop(f) { this.playing = false; this.setFrame(this.resolve(f)); }
	gotoAndPlay(f) { this.playing = true; this.setFrame(this.resolve(f)); }
	play() { this.playing = true; }
	stop() { this.playing = false; }
	nextFrame() { this.playing = false; this.setFrame(this.frame < this.totalframes ? this.frame + 1 : this.frame); }
	setFrame(f) {
		this.frame = f;
		const a = this.sym.actions && this.sym.actions[f];
		if (a) a(this);
	}
	tick() {
		if (this.sym.update) this.sym.update(this);
		if (this.playing && !this.removed) {
			let f = this.frame + 1;
			if (f > this.totalframes) f = 1;
			this.setFrame(f);
		}
	}
	removeMovieClip() { this.removed = true; }
	draw(ctx) {
		if (!this.visible || this.removed || this.alpha <= 0) return;
		ctx.save();
		if (this.mask) this.mask(ctx);
		ctx.translate(this.x, this.y);
		if (this.rotation) ctx.rotate(this.rotation * Math.PI / 180);
		if (this.xscale !== 100 || this.yscale !== 100) {
			const sx = this.xscale / 100, sy = this.yscale / 100;
			if (Math.abs(sx) < 1e-4 || Math.abs(sy) < 1e-4) { ctx.restore(); return; }
			ctx.scale(sx, sy);
		}
		if (this.alpha < 100) ctx.globalAlpha *= Math.max(0, this.alpha / 100);
		if (this.tint) MB2.drawTinted(ctx, this, this.tint);
		else this.sym.draw(ctx, this);
		ctx.restore();
	}
};

// draw a clip with an additive colour (Flash Color.setTransform on a clip)
MB2.drawTinted = (function () {
	let canvas = null, c2 = null;
	return function (ctx, clip, t) {
		const w = Math.ceil(clip.width * 2 + 40), h = Math.ceil(clip.height * 2 + 40);
		if (!canvas) { canvas = document.createElement("canvas"); c2 = canvas.getContext("2d"); }
		if (canvas.width < w) canvas.width = w;
		if (canvas.height < h) canvas.height = h;
		c2.setTransform(1, 0, 0, 1, 0, 0);
		c2.globalCompositeOperation = "source-over";
		c2.globalAlpha = 1;
		c2.clearRect(0, 0, canvas.width, canvas.height);
		c2.translate(w / 2, h / 2);
		clip.sym.draw(c2, clip);
		c2.setTransform(1, 0, 0, 1, 0, 0);
		c2.globalCompositeOperation = "source-atop";
		c2.globalAlpha = Math.min(1, t.k === undefined ? 1 : t.k);
		c2.fillStyle = "rgb(" + (t.r | 0) + "," + (t.g | 0) + "," + (t.b | 0) + ")";
		c2.fillRect(0, 0, w, h);
		ctx.drawImage(canvas, 0, 0, w, h, -w / 2, -h / 2, w, h);
	};
})();

// ---------------------------------------------------------------------------
// DepthManager (asml.DepthManager) : planes of clips drawn in order
MB2.DepthManager = class {
	constructor() {
		this.planes = [];
		this.offset = { x: 0, y: 0 };
	}
	add(clip, plane) {
		if (!this.planes[plane]) this.planes[plane] = [];
		this.planes[plane].push(clip);
		return clip;
	}
	attach(name, plane) { return this.add(new MB2.Clip(name), plane); }
	empty(plane) { return this.add(new MB2.Clip(MB2.SYMBOLS.empty), plane); }
	tick() {
		for (const p of this.planes) {
			if (!p) continue;
			for (let i = 0; i < p.length; i++) {
				const c = p[i];
				if (!c.removed) c.tick();
			}
		}
		this.clean();
	}
	clean() {
		for (let k = 0; k < this.planes.length; k++) {
			const p = this.planes[k];
			if (!p) continue;
			let j = 0;
			for (let i = 0; i < p.length; i++) if (!p[i].removed) p[j++] = p[i];
			p.length = j;
		}
	}
	draw(ctx) {
		for (const p of this.planes) {
			if (!p) continue;
			for (const c of p) c.draw(ctx);
		}
	}
	destroy() {
		for (const p of this.planes) if (p) for (const c of p) c.removed = true;
		this.planes = [];
	}
};

// ---------------------------------------------------------------------------
// Key
MB2.Key = {
	LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32, ESCAPE: 27, P: 80, ENTER: 13,
	down: {},
	isDown(k) { return !!this.down[k]; },
	init(target) {
		// physical WASD position (ZQSD on AZERTY keyboards)
		const map = { KeyW: 38, KeyS: 40, KeyA: 37, KeyD: 39 };
		const set = (e, v) => {
			let k = e.keyCode;
			if (map[e.code] && !e.ctrlKey && !e.metaKey) k = map[e.code];
			if (k === MB2.Key.P) k = MB2.Key.ESCAPE;
			if ([32, 37, 38, 39, 40, 27].indexOf(k) >= 0) e.preventDefault();
			this.down[k] = v;
		};
		target.addEventListener("keydown", e => set(e, true));
		target.addEventListener("keyup", e => set(e, false));
		window.addEventListener("blur", () => { this.down = {}; });
	}
};
