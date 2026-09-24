/**
 * Drawing helpers shared by every visual of the game.
 *
 * Everything is drawn in game coordinates (see engine/screen.js). The art is
 * drawn with the canvas API ; the original bitmaps (backgrounds, bumper
 * parts, snake...) are drawn with `image()`.
 */

import { app } from "../app.js";

export const FONT = "'Baloo 2', 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif";

/** Colours of the balls : main, dark edge, highlight. Indexed by BallType. */
export const BALL_COLORS = [
	["#ffd41c", "#b87a00", "#fffbd0"],   // yellow
	["#95e04c", "#3a8a14", "#efffd8"],   // green
	["#ee4a22", "#7a1004", "#ffc4a8"],   // red
	["#ffa01e", "#c04c00", "#fff0b8"],   // orange
	["#a8e2ff", "#3c86c4", "#ffffff"],   // blue
	["#d2d6dc", "#646e7a", "#ffffff"],   // metal
	["#bf84ea", "#6a2a9c", "#f6e6ff"]    // violet
];

/** The green "pipe" of the room border. */
export const BORDER_COLORS = { body: "#7dd64e", dark: "#4fa628", light: "#b4f08a" };

/** Draws a loaded image. Without x / y it is centred on (0, 0). */
export function image(ctx, name, w, h, x, y) {
	const img = app.images.get(name);
	if (!img)
		return;
	w = w || img.naturalWidth;
	h = h || img.naturalHeight;
	ctx.drawImage(img, x === undefined ? -w / 2 : x, y === undefined ? -h / 2 : y, w, h);
}

/** Starts a new path with a circle. */
export function circle(ctx, x, y, r) {
	ctx.beginPath();
	ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

/** Starts a new path with a rounded rectangle. */
export function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	roundRectPath(ctx, x, y, w, h, r);
	ctx.closePath();
}

/** Adds a rounded rectangle (with soft, quadratic corners) to the current path. */
export function roundRectPath(ctx, x, y, w, h, r) {
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y, x + r, y);
}

/** A shaded sphere : main colour, dark edge, highlight. */
export function sphere(ctx, x, y, r, main, edge, highlight = "#fff") {
	const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
	g.addColorStop(0, highlight);
	g.addColorStop(0.35, main);
	g.addColorStop(1, edge);
	ctx.fillStyle = g;
	circle(ctx, x, y, r);
	ctx.fill();
}

/** The white reflection on the top-left of a sphere. */
export function shine(ctx, x, y, r, alpha = 0.7) {
	ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
	ctx.beginPath();
	ctx.ellipse(x - r * 0.3, y - r * 0.45, r * 0.45, r * 0.25, -0.5, 0, Math.PI * 2);
	ctx.fill();
}

/** A sphere of a ball colour. */
export function ballSphere(ctx, x, y, r, type) {
	const c = BALL_COLORS[type] || BALL_COLORS[0];
	sphere(ctx, x, y, r, c[0], c[1], c[2]);
}

/** The soft shadow of an object on the floor. */
export function dropShadow(ctx, x, y, r, alpha = 0.22) {
	ctx.fillStyle = "rgba(40,0,70," + alpha + ")";
	ctx.beginPath();
	ctx.ellipse(x + 4, y + 5, r, r * 0.9, 0, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * Draws a text centred on (x, y) ; "\n" makes several lines.
 * options : { size, color, outline, align, weight, baseline }
 */
export function text(ctx, str, x, y, options = {}) {
	const size = options.size || 16;
	ctx.font = (options.weight || "800") + " " + size + "px " + FONT;
	ctx.textAlign = options.align || "center";
	ctx.textBaseline = options.baseline || "middle";

	const lines = String(str).split("\n");
	const lineHeight = size * 1.15;
	let yy = y - (lines.length - 1) * lineHeight / 2;
	for (const line of lines) {
		if (options.outline) {
			ctx.lineJoin = "round";
			ctx.lineWidth = options.outlineWidth || Math.max(2, size / 5);
			ctx.strokeStyle = options.outline;
			ctx.strokeText(line, x, yy);
		}
		ctx.fillStyle = options.color || "#fff";
		ctx.fillText(line, x, yy);
		yy += lineHeight;
	}
}

/** Star burst of a collected pastille, t = 0 .. 1. */
export function sparkle(ctx, x, y, t, color) {
	ctx.save();
	ctx.translate(x, y);
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
	circle(ctx, 0, 0, 4 * (1 - t));
	ctx.fill();
	ctx.restore();
}

// ----- sprite cache -----

const cache = new Map();
const SPRITE_RESOLUTION = 3;

/**
 * Draws something once in an offscreen canvas, and returns it. Use it for
 * the static parts of the art (drawn with many paths and gradients) :
 * `drawSprite(ctx, sprite(...), x, y)` is then a single drawImage.
 *
 * @param {string} key   identifies the drawing
 * @param {number} w     size, in game pixels, around the origin (-w/2 .. w/2)
 * @param {number} h
 * @param {(ctx) => void} draw   draws centred on (0, 0)
 */
export function sprite(key, w, h, draw) {
	let s = cache.get(key);
	if (!s) {
		const canvas = document.createElement("canvas");
		canvas.width = Math.ceil(w * SPRITE_RESOLUTION);
		canvas.height = Math.ceil(h * SPRITE_RESOLUTION);
		const c = canvas.getContext("2d");
		c.scale(SPRITE_RESOLUTION, SPRITE_RESOLUTION);
		c.translate(w / 2, h / 2);
		draw(c);
		s = { canvas, w, h };
		cache.set(key, s);
	}
	return s;
}

/** Draws a sprite centred on (x, y). */
export function drawSprite(ctx, s, x, y, scale = 1) {
	ctx.drawImage(s.canvas, x - s.w * scale / 2, y - s.h * scale / 2, s.w * scale, s.h * scale);
}
