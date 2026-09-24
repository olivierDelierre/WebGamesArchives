/*
 * Drawing helpers shared by the symbols and the screens.
 *
 * All the drawing is done in "game coordinates" : the room is 610 x 410, the
 * canvas transform (set in app/main.js) scales it to the window size.
 */
"use strict";

/** Font stack of all the texts (Baloo 2 is loaded from Google Fonts when available). */
MB2.FONT = "'Baloo 2', 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif";

/** Colours of the balls : [main, dark edge, highlight], indexed by MB2.BallType. */
MB2.BALL_COLORS = [
	["#ffd41c", "#b87a00", "#fffbd0"],  // yellow
	["#95e04c", "#3a8a14", "#efffd8"],  // green
	["#ee4a22", "#7a1004", "#ffc4a8"],  // red
	["#ffa01e", "#c04c00", "#fff0b8"],  // orange
	["#a8e2ff", "#3c86c4", "#ffffff"],  // blue
	["#d2d6dc", "#646e7a", "#ffffff"],  // metal
	["#bf84ea", "#6a2a9c", "#f6e6ff"]   // violet
];


/*
 * Frame scripts for the symbols' `actions` (see core/clip.js).
 */
MB2.Frames = {
	/** stop(); */
	stop: c => c.stop(),
	/** gotoAndStop(n); (typically : back to the idle frame at the end of an animation) */
	goto: n => c => c.gotoAndStop(n),
	/** gotoAndPlay(n); (a loop) */
	loop: n => c => c.gotoAndPlay(n),
	/** removeMovieClip(); (a one-shot effect) */
	remove: c => c.removeMovieClip()
};


MB2.G = {

	/**
	 * Draws a loaded bitmap (MB2.img[name]) at (x, y) with size w x h.
	 * Without x / y the image is centered on (0, 0), the registration point of
	 * most symbols. Does nothing if the image failed to load.
	 */
	img(ctx, name, w, h, x, y) {
		const image = MB2.img[name];
		if (!image || !image.complete || !image.naturalWidth)
			return;
		w = w || image.naturalWidth;
		h = h || image.naturalHeight;
		ctx.drawImage(image, x === undefined ? -w / 2 : x, y === undefined ? -h / 2 : y, w, h);
	},

	/** Starts a new path with a circle. */
	circle(ctx, x, y, r) {
		ctx.beginPath();
		ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
	},

	/** A shaded sphere : colour c1, dark edge c2, highlight c3. */
	ball(ctx, x, y, r, c1, c2, c3) {
		const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
		g.addColorStop(0, c3 || "#fff");
		g.addColorStop(0.35, c1);
		g.addColorStop(1, c2);
		ctx.fillStyle = g;
		MB2.G.circle(ctx, x, y, r);
		ctx.fill();
	},

	/** The white reflection on the top-left of a sphere. */
	shine(ctx, x, y, r, alpha) {
		ctx.fillStyle = "rgba(255,255,255," + (alpha === undefined ? 0.7 : alpha) + ")";
		ctx.beginPath();
		ctx.ellipse(x - r * 0.3, y - r * 0.45, r * 0.45, r * 0.25, -0.5, 0, Math.PI * 2);
		ctx.fill();
	},

	/** Starts a new path with a rounded rectangle. */
	rrect(ctx, x, y, w, h, r) {
		ctx.beginPath();
		MB2.Tools.smoothSquarePath(ctx, { x: x, y: y, w: w, h: h }, r);
		ctx.closePath();
	},

	/**
	 * Draws a text centered on (x, y) (multi-line with "\n"), with an optional
	 * outline colour.
	 */
	text(ctx, txt, x, y, size, fill, stroke, align, weight) {
		ctx.font = (weight || "800") + " " + size + "px " + MB2.FONT;
		ctx.textAlign = align || "center";
		ctx.textBaseline = "middle";

		const lines = String(txt).split("\n");
		const lineHeight = size * 1.15;
		let yy = y - (lines.length - 1) * lineHeight / 2;

		for (const line of lines) {
			if (stroke) {
				ctx.lineJoin = "round";
				ctx.lineWidth = Math.max(2, size / 5);
				ctx.strokeStyle = stroke;
				ctx.strokeText(line, x, yy);
			}
			ctx.fillStyle = fill;
			ctx.fillText(line, x, yy);
			yy += lineHeight;
		}
	},

	/**
	 * Draws something once in an offscreen canvas and keeps it (drawn at 2x
	 * for crispness : draw it back with a size of w x h).
	 */
	cache(key, w, h, drawFn) {
		const cache = MB2.G._cache || (MB2.G._cache = {});
		if (!cache[key]) {
			const canvas = document.createElement("canvas");
			canvas.width = Math.ceil(w * 2);
			canvas.height = Math.ceil(h * 2);
			const ctx = canvas.getContext("2d");
			ctx.scale(2, 2);
			drawFn(ctx);
			cache[key] = canvas;
		}
		return cache[key];
	},

	/**
	 * Scale of the small "boing" of a bumper hit animation : 1, except while
	 * the frame is in [start, start + len[.
	 */
	pulse(clip, start, len) {
		if (clip.frame < start || clip.frame >= start + len)
			return 1;
		const t = (clip.frame - start) / len;
		return 1 + Math.sin(t * Math.PI) * 0.18;
	},

	/** Star-shaped burst of a collected pastille, t = 0..1. */
	sparkle(ctx, t, color) {
		ctx.globalAlpha *= 1 - t;
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		for (let i = 0; i < 6; i++) {
			const a = i * Math.PI / 3;
			ctx.beginPath();
			ctx.moveTo(Math.cos(a) * (3 + t * 10), Math.sin(a) * (3 + t * 10));
			ctx.lineTo(Math.cos(a) * (6 + t * 16), Math.sin(a) * (6 + t * 16));
			ctx.stroke();
		}
		ctx.fillStyle = "#fff";
		MB2.G.circle(ctx, 0, 0, 4 * (1 - t));
		ctx.fill();
	}
};
