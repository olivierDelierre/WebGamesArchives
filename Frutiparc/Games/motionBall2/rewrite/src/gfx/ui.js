/**
 * Visual elements of the menus and panels.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { FONT, roundRect, text } from "./draw.js";
import { app } from "../app.js";

/** The purple background of the menus, with its turning sunburst. */
export function sunburst(ctx, rotation, scale = 1) {
	ctx.fillStyle = "#6e32a0";
	ctx.fillRect(0, 0, W, H);
	const img = app.images.get("roue");
	if (img) {
		const s = 1.2 * scale;
		ctx.save();
		ctx.translate(W / 2, H / 2);
		ctx.rotate(rotation);
		ctx.drawImage(img, -351 * s, -351 * s, 702 * s, 702 * s);
		ctx.restore();
	}
	const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 380);
	g.addColorStop(0, "rgba(255,255,255,0.15)");
	g.addColorStop(1, "rgba(40,0,70,0.5)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, W, H);
}

/** A bubbly purple letter of the title, centred on (0, 0). */
export function titleLetter(ctx, ch, size) {
	ctx.font = "800 " + size + "px " + FONT;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.lineJoin = "round";
	ctx.lineWidth = size / 5;
	ctx.strokeStyle = "#4a1470";
	ctx.strokeText(ch, 0, 0);
	ctx.lineWidth = size / 9;
	ctx.strokeStyle = "#ffffff";
	ctx.strokeText(ch, 0, 0);
	const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
	g.addColorStop(0, "#e9c4ff");
	g.addColorStop(0.5, "#b060e8");
	g.addColorStop(1, "#7a2ab8");
	ctx.fillStyle = g;
	ctx.fillText(ch, 0, 0);
	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.fillText(ch, 0, -size * 0.06);
	ctx.fillStyle = g;
	ctx.fillText(ch, 0, size * 0.03);
}

/** A word of bubbly letters, each one bouncing with time. */
export function title(ctx, word, x, y, size, time = 0) {
	ctx.font = "800 " + size + "px " + FONT;
	const widths = [...word].map(ch => ctx.measureText(ch).width * 0.92);
	let cx = x - widths.reduce((a, b) => a + b, 0) / 2;
	[...word].forEach((ch, i) => {
		ctx.save();
		ctx.translate(cx + widths[i] / 2, y + Math.sin(time * 3 + i * 0.6) * 3);
		ctx.rotate(Math.sin(time * 2 + i) * 0.05);
		titleLetter(ctx, ch, size);
		ctx.restore();
		cx += widths[i];
	});
}

/** The yellow rounded panel, centred on (x, y), scaled by s. */
export function panel(ctx, x, y, w, h, s = 1) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	ctx.fillStyle = "rgba(90,40,0,0.3)";
	roundRect(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 22);
	ctx.fill();
	const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
	g.addColorStop(0, "#ffe04a");
	g.addColorStop(1, "#ffb400");
	ctx.fillStyle = g;
	roundRect(ctx, -w / 2, -h / 2, w, h, 22);
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = "#e08a00";
	ctx.stroke();
	ctx.lineWidth = 2;
	ctx.strokeStyle = "rgba(255,255,255,0.6)";
	roundRect(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 17);
	ctx.stroke();
	ctx.restore();
}

/** A yellow bubbly title ("VICTOIRE !"). */
export function bubbleTitle(ctx, str, x, y, size) {
	ctx.save();
	ctx.translate(x, y);
	ctx.font = "800 " + size + "px " + FONT;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.lineJoin = "round";
	ctx.lineWidth = size / 4;
	ctx.strokeStyle = "#c86a00";
	ctx.strokeText(str, 0, 0);
	ctx.lineWidth = size / 9;
	ctx.strokeStyle = "#fff6c0";
	ctx.strokeText(str, 0, 0);
	const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
	g.addColorStop(0, "#fff7a0");
	g.addColorStop(1, "#ffc000");
	ctx.fillStyle = g;
	ctx.fillText(str, 0, 0);
	ctx.restore();
}

/**
 * A text button. `state` : "idle", "focus" (keyboard / mouse over) or
 * "disabled".
 */
export function button(ctx, label, x, y, w, h, state = "idle") {
	const focus = state === "focus";
	const disabled = state === "disabled";
	ctx.save();
	ctx.translate(x, y);
	if (focus)
		ctx.scale(1.06, 1.06);
	ctx.fillStyle = "rgba(40,0,70,0.35)";
	roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, h / 2);
	ctx.fill();
	const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
	if (disabled) {
		g.addColorStop(0, "#b8a8c4");
		g.addColorStop(1, "#8a7a98");
	} else if (focus) {
		g.addColorStop(0, "#c8ff9a");
		g.addColorStop(1, "#5cc22c");
	} else {
		g.addColorStop(0, "#a6ec6e");
		g.addColorStop(1, "#3c8f1d");
	}
	ctx.fillStyle = g;
	roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = focus ? "#fff" : "rgba(255,255,255,0.6)";
	ctx.stroke();
	text(ctx, label, 0, 1, { size: Math.min(20, h * 0.55), color: disabled ? "#e8e0f0" : "#fff", outline: "rgba(20,60,0,0.5)" });
	ctx.restore();
}

/** The elastic "pop" of a panel : value goes 0 -> 1 with a bounce. */
export class Pop {

	constructor() {
		this.value = 0;
		this.speed = 0;
	}

	update(dt) {
		// a damped spring (the original PopupFX, per 1/40 s frame)
		const frames = dt * 40;
		this.speed += (1 - this.value) * 0.35 * frames;
		this.speed *= Math.pow(0.6, frames);
		this.value += this.speed * frames;
		return this.value;
	}
}

