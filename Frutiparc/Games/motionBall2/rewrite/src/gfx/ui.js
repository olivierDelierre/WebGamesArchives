/**
 * The buttons of the rewrite (the pause, for the touch screens and the
 * gamepads), and the "pop" of the end panel.
 */

import { roundRect, text } from "./draw.js";

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

