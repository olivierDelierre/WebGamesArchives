/*
 * The few helpers of the Motion Twin AS2 standard library ("Std") and of
 * mb2/Tools.as that the game relies on.
 */
"use strict";

/*
 * Frame timing.
 *
 * The original game ran at 40 frames per second and scaled its movements by
 * Std.tmod (1 at full speed). The port always runs a fixed 40 Hz update loop
 * (see app/main.js), so tmod stays at 1 and deltaT at 1/40 s : the ported code
 * keeps multiplying by them, which keeps it readable next to the original.
 */
MB2.Std = {

	FPS: 40,
	tmod: 1,
	deltaT: 1 / 40,

	// last mouse position, in game coordinates
	xmouse: 0,
	ymouse: 0,

	/** Integer in [0, n[ (AS2 random(n)). */
	random(n) {
		return n > 0 ? Math.floor(Math.random() * n) : 0;
	},

	/** Random index, weighted by the values of the array. */
	randomProbas(probas) {
		let total = 0;
		for (const p of probas)
			total += p;

		let r = Math.floor(Math.random() * total);
		for (let i = 0; i < probas.length; i++) {
			r -= probas[i];
			if (r < 0)
				return i;
		}
		return 0;
	}
};

/** Shortcut used everywhere, like the AS2 global random(). */
const random = MB2.Std.random;


/** Removes a value from an array (asml added Array.remove to AS2). */
MB2.removeFrom = function (array, value) {
	const i = array.indexOf(value);
	if (i < 0)
		return false;
	array.splice(i, 1);
	return true;
};


MB2.Tools = {

	/**
	 * Size of a clip in cells, rounded up to an even number.
	 * This defines how bumpers are positioned from their cell coordinates :
	 * the cell position is the top-left corner, the clip is centered.
	 */
	mc_size(mc) {
		const D = MB2.Const.DELTA;
		return {
			w: Math.ceil((mc.width / 2) / D) * 2,
			h: Math.ceil((mc.height / 2) / D) * 2
		};
	},

	/** Places a clip whose top-left corner is at the cell position p. */
	set_mcpos(mc, p) {
		const s = MB2.Tools.mc_size(mc);
		mc.x = (p.x + s.w / 2) * MB2.Const.DELTA;
		mc.y = (p.y + s.h / 2) * MB2.Const.DELTA;
	},

	/** Cell position that centers a clip in the room. */
	pos_center(mc) {
		const C = MB2.Const;
		const s = MB2.Tools.mc_size(mc);
		return {
			x: (((C.LVL_CWIDTH - C.BORDER_CSIZE * 2) / 2 + C.BORDER_CSIZE) | 0) - s.w / 2,
			y: (((C.LVL_CHEIGHT - C.BORDER_CSIZE * 2) / 2 + C.BORDER_CSIZE) | 0) - s.h / 2
		};
	},

	/** Signed difference b - a between two angles, in ]-PI, PI]. */
	rad_dif(a, b) {
		let d = b - a;
		d -= Math.trunc(d / (2 * Math.PI)) * Math.PI * 2;
		if (d > Math.PI)
			return d - Math.PI * 2;
		if (d <= -Math.PI)
			return d + Math.PI * 2;
		return d;
	},

	/** Squared distance between two objects having x / y. */
	dist2(a, b) {
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return dx * dx + dy * dy;
	},

	/**
	 * Adds a rounded rectangle to the current path (Tools.drawSmoothSquare).
	 * p = { x, y, w, h }, curve = corner radius.
	 */
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
