/**
 * Drawing helpers for what the original symbols don't cover : the texts of
 * the rewrite, its buttons, the touch joystick, the laser beams.
 */

export const FONT = "'Baloo 2', 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif";

/** Colours of the balls (the laser beams) : main, dark edge, highlight. Indexed by BallType. */
export const BALL_COLORS = [
	["#ffd41c", "#b87a00", "#fffbd0"],   // yellow
	["#95e04c", "#3a8a14", "#efffd8"],   // green
	["#ee4a22", "#7a1004", "#ffc4a8"],   // red
	["#ffa01e", "#c04c00", "#fff0b8"],   // orange
	["#a8e2ff", "#3c86c4", "#ffffff"],   // blue
	["#d2d6dc", "#646e7a", "#ffffff"],   // metal
	["#bf84ea", "#6a2a9c", "#f6e6ff"]    // violet
];

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
