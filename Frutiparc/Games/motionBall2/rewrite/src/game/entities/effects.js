/**
 * Short visual effects : sparks, debris, bursts, laser flashes.
 */

import { Effect, Layer } from "../entity.js";
import { BALL_COLORS, circle, roundRect, sparkle } from "../../gfx/draw.js";
import { ease } from "../../engine/math.js";

/** The little star where the ball hits a wall. */
export class Spark extends Effect {

	constructor(x, y) {
		super(x, y, 0.2);
	}

	render(ctx) {
		const t = this.t;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.globalAlpha = 1 - t;
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1.5;
		for (let i = 0; i < 4; i++) {
			const a = i * Math.PI / 2 + Math.PI / 4;
			ctx.beginPath();
			ctx.moveTo(Math.cos(a) * (2 + t * 6), Math.sin(a) * (2 + t * 6));
			ctx.lineTo(Math.cos(a) * (4 + t * 10), Math.sin(a) * (4 + t * 10));
			ctx.stroke();
		}
		ctx.restore();
	}
}

/** A star burst (a collected pastille). */
export class Burst extends Effect {

	constructor(x, y, color) {
		super(x, y, 0.3, Layer.ITEM);
		this.color = color;
	}

	render(ctx) {
		sparkle(ctx, this.x, this.y, this.t, this.color);
	}
}

/** A piece of a destroyed green block, flying and shrinking. */
export class Debris extends Effect {

	constructor(x, y, vx, vy) {
		super(x, y, 0.75);
		this.vx = vx;
		this.vy = vy;
		this.angle = Math.random() * Math.PI * 2;
	}

	update(dt) {
		super.update(dt);
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.angle += 5 * dt;
	}

	render(ctx) {
		const s = 1.2 * (1 - this.t);
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(this.angle);
		ctx.scale(s, s);
		ctx.fillStyle = "#a6e67c";
		ctx.strokeStyle = "#5cae34";
		ctx.lineWidth = 1.5;
		roundRect(ctx, -6, -6, 12, 12, 3);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
}

/** The flash of a laser beam that killed the ball. */
export class BeamFlash extends Effect {

	constructor(x1, y1, x2, y2, phase) {
		super(x1, y1, 0.3);
		this.x2 = x2;
		this.y2 = y2;
		this.color = BALL_COLORS[phase][0];
	}

	render(ctx) {
		ctx.save();
		ctx.globalAlpha = 1 - this.t;
		ctx.lineCap = "round";
		ctx.strokeStyle = this.color;
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.moveTo(this.x, this.y);
		ctx.lineTo(this.x2, this.y2);
		ctx.stroke();
		ctx.strokeStyle = "rgba(255,255,255,0.9)";
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.restore();
	}
}

/** An expanding ring (used by several effects). */
export class Ring extends Effect {

	constructor(x, y, radius, color, duration = 0.4) {
		super(x, y, duration);
		this.radius = radius;
		this.color = color;
	}

	render(ctx) {
		ctx.save();
		ctx.globalAlpha = 1 - this.t;
		ctx.strokeStyle = this.color;
		ctx.lineWidth = 3 * (1 - this.t) + 1;
		circle(ctx, this.x, this.y, this.radius * ease.outQuad(this.t));
		ctx.stroke();
		ctx.restore();
	}
}
