/**
 * Short visual effects, played with the original symbols : they remove
 * themselves at the end of their animation (a "removeMovieClip" script).
 */

import { Entity, Layer } from "../entity.js";
import { clip, drawClip } from "../../gfx/xfl/index.js";

/** An entity that plays a symbol once, and disappears when the symbol removes itself. */
export class ClipEffect extends Entity {

	constructor(symbol, x, y, layer = Layer.EFFECT, maxTime = 5) {
		super(x, y, layer);
		this.art = clip(symbol);
		this.rotation = 0;
		this.scaleX = 1;
		this.scaleY = 1;
		this.maxTime = maxTime;
	}

	update(dt) {
		this.art.update(dt);
		this.maxTime -= dt;
		if (this.art.removed || this.maxTime <= 0)
			this.dead = true;
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(this.rotation);
		ctx.scale(this.scaleX, this.scaleY);
		this.art.draw(ctx);
		ctx.restore();
	}
}

/** The little star where the ball hits a wall ("hit"). */
export class Spark extends ClipEffect {

	constructor(x, y) {
		super("hit", x, y);
	}
}

/**
 * A piece of a destroyed green block ("wallpart"), flying and shrinking
 * (Collide.wall_dummy_on_update : 30 frames, 5 degrees per frame).
 */
export class Debris extends ClipEffect {

	constructor(x, y, vx, vy) {
		super("wallpart", x, y);
		this.vx = vx;
		this.vy = vy;
		this.rotation = Math.random() * Math.PI * 2;
		this.time = 0;
	}

	update(dt) {
		this.art.update(dt);
		this.time += dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.rotation += 200 * Math.PI / 180 * dt;
		// (original : scale = time left x 200 / 50 %, from 30 frames)
		this.scaleX = this.scaleY = 1.2 * Math.max(0, 1 - this.time / 0.75);
		if (this.time >= 0.75)
			this.dead = true;
	}
}

/**
 * The flash of a laser beam that killed the ball ("flashLine", 100 pixels
 * long : stretched between the two posts ; its child "gfx" has a frame per
 * colour).
 */
export class BeamFlash extends ClipEffect {

	constructor(x1, y1, x2, y2, phase) {
		super("flashLine", x1, y1);
		this.rotation = Math.atan2(y2 - y1, x2 - x1);
		this.scaleX = Math.hypot(x2 - x1, y2 - y1) / 100;
		const gfx = this.art.child("gfx");
		if (gfx)
			gfx.gotoAndStop(phase);
	}
}

export { drawClip };
