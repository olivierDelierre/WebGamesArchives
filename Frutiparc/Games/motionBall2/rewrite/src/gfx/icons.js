/**
 * Small icons shared by the rooms, the HUD and the map : the items of the
 * item boxes, and the key ("grelot", a little bell).
 */

import { circle, roundRect, sphere } from "./draw.js";

/** The items of the item boxes. */
export const Icon = Object.freeze({ MAP: 0, RADAR: 1, SMALL_TIME: 2, BIG_TIME: 3, KEY: 4 });

/** Draws an item icon centred on (0, 0). */
export function drawItemIcon(ctx, icon, scale = 1) {
	ctx.save();
	ctx.scale(scale, scale);

	switch (icon) {
	case Icon.MAP:
		ctx.fillStyle = "#ffe07a";
		ctx.strokeStyle = "#b07a00";
		ctx.lineWidth = 1.5;
		roundRect(ctx, -11, -8, 22, 16, 3);
		ctx.fill();
		ctx.stroke();
		ctx.strokeStyle = "#c0902a";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(-4, -8);
		ctx.lineTo(-4, 8);
		ctx.moveTo(4, -8);
		ctx.lineTo(4, 8);
		ctx.moveTo(-11, 0);
		ctx.lineTo(11, 0);
		ctx.stroke();
		ctx.fillStyle = "#e0301a";
		circle(ctx, 6, -4, 2);
		ctx.fill();
		break;

	case Icon.RADAR:
		sphere(ctx, 0, 0, 10, "#2a9a4a", "#0a3a1a", "#8affa0");
		ctx.strokeStyle = "rgba(160,255,170,0.8)";
		ctx.lineWidth = 1;
		circle(ctx, 0, 0, 6);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(8, -5);
		ctx.stroke();
		ctx.fillStyle = "#ff4040";
		circle(ctx, -4, 3, 1.8);
		ctx.fill();
		break;

	case Icon.SMALL_TIME:
	case Icon.BIG_TIME: {
		const r = icon === Icon.SMALL_TIME ? 8 : 11;
		sphere(ctx, 0, 0, r, icon === Icon.SMALL_TIME ? "#9ad8ff" : "#4aa8ff", "#1a4a9a", "#fff");
		ctx.strokeStyle = "#0a2a6a";
		ctx.lineWidth = 1.5;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(0, -r * 0.7);
		ctx.moveTo(0, 0);
		ctx.lineTo(r * 0.5, 0);
		ctx.stroke();
		break;
	}

	case Icon.KEY:
		drawKey(ctx, 1);
		break;
	}
	ctx.restore();
}

/** The key : a golden bell that opens one door. */
export function drawKey(ctx, scale = 1) {
	ctx.save();
	ctx.scale(scale, scale);
	sphere(ctx, 0, 1, 8, "#ffd84a", "#a86a00", "#fff8c0");
	ctx.fillStyle = "#6a4000";
	ctx.fillRect(-5, 2, 10, 1.5);
	circle(ctx, 0, 5, 1.8);
	ctx.fill();
	ctx.strokeStyle = "#a86a00";
	ctx.lineWidth = 1.5;
	circle(ctx, 0, -8, 2.5);
	ctx.stroke();
	ctx.restore();
}
