/**
 * The round bumpers : normal, clock, death, magnet and invisible ("ghost").
 *
 * They are drawn with the original symbols ("bnormal", "btime"...), whose
 * "hit" animation plays when the ball hits them, over the shadow of their
 * type (the "ombre" symbol, one frame per item type).
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { BallType, Item } from "../../data/enums.js";
import { dist2, perFrameChance, smooth } from "../../engine/math.js";
import { clip, drawClip } from "../../gfx/xfl/index.js";
import { app } from "../../app.js";
import { Spark } from "./effects.js";

let shadows = null;

/** The shadow of an item of the level data (frame = its type). */
export function drawItemShadow(ctx, itemType, x, y) {
	const c = shadows || (shadows = clip("ombre"));
	c.gotoAndStop(itemType - 1);
	drawClip(ctx, c, x, y);
}

class RoundBumper extends Entity {

	/**
	 * @param x, y        centre
	 * @param radius      collision radius
	 * @param symbol      the original symbol
	 */
	constructor(x, y, radius, bounce, symbol, itemType) {
		super(x, y, Layer.OBJECT);
		this.itemType = itemType;
		this.shape = { kind: "circle", x, y, r: radius };
		this.solid = true;
		this.bounce = bounce;
		this.art = clip(symbol);
		this.art.stop();
	}

	/** Plays the hit animation, if it is not already playing (returns false then). */
	animateHit() {
		if (this.art.frame !== 0)
			return false;
		this.art.gotoAndPlay("hit");
		return true;
	}

	update(dt) {
		this.art.update(dt);
	}

	renderShadow(ctx) {
		drawItemShadow(ctx, this.itemType, this.x, this.y);
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
	}
}

/** The normal bumper : kicks the ball away. */
export class Bumper extends RoundBumper {

	constructor(x, y) {
		super(x, y, 20, BOUNCE.bumper, "bnormal", Item.BUMPER);
	}

	onHit() {
		if (this.animateHit())
			app.audio.play("metal");
	}
}

/**
 * The clock bumper : each hit costs time (or adds time to the chronometer
 * in Course mode). Its hands ("aig", "aig2") show the time.
 */
export class ClockBumper extends RoundBumper {

	constructor(x, y, game) {
		super(x, y, 28, BOUNCE.clock, "btime", Item.CLOCK);
		this.shownTime = game.time;
		this.setHands();
	}

	onHit(game) {
		if (!this.animateHit())
			return;
		app.audio.play("wall");
		game.addTime(game.rules.clockBumper);
	}

	update(dt, game) {
		super.update(dt);
		this.shownTime = smooth(this.shownTime, game.time, 0.05, dt);
		this.setHands();
	}

	/** (original : one turn of the small hand per hour, of the big one per minute) */
	setHands() {
		const ms = this.shownTime * 1000;
		this.art.set("aig", { rotation: -ms / 3600 });
		this.art.set("aig2", { rotation: -(ms % 3600) / 10 });
	}
}

/** The death bumper : kills the ball, except the metal one. */
export class DeathBumper extends RoundBumper {

	constructor(x, y) {
		super(x, y, 15, BOUNCE.death, "bdeath", Item.DEATH);
	}

	onHit(game) {
		const ball = game.ball;
		if (ball.type === BallType.METAL || ball.invulnerable > 0) {
			app.audio.play("metal");
			return;
		}
		app.audio.play("death");
		this.animateHit();
		ball.die();
	}
}

/**
 * The magnet : attracts the ball (not the metal one). When hit, it repels
 * the ball for a while (about 25 s on average), then attracts again.
 * Its symbol has an animation for each : "plus" and "neg".
 */
export class Magnet extends RoundBumper {

	constructor(x, y) {
		super(x, y, 20, BOUNCE.magnet, "bmagnet", Item.MAGNET);
		this.attracting = true;
		this.art.gotoAndPlay("plus");
	}

	onHit() {
		if (this.attracting) {
			this.attracting = false;
			app.audio.play("metal");
			this.art.gotoAndPlay("neg");
		}
	}

	update(dt, game) {
		super.update(dt);

		const ball = game.ball;
		if (ball.type !== BallType.METAL && !ball.falling) {
			const d2 = dist2(this.x, this.y, ball.x, ball.y);
			if (d2 < 30000) {
				// (original : 30 / distance pixels per frame^2, toward / away from the magnet)
				const way = this.attracting ? 1 : -1;
				const f = way * 30 * 1600 * dt / d2;
				ball.vx += (this.x - ball.x) * f;
				ball.vy += (this.y - ball.y) * f;
			}
		}

		// back to attracting, at random
		if (!this.attracting && Math.random() < perFrameChance(1000, dt)) {
			this.attracting = true;
			this.art.gotoAndPlay("plus");
		}
	}
}

/**
 * The invisible bumper ("ghost") : it shows up for a moment when hit.
 * The violet ball sees it when close.
 */
export class GhostBumper extends RoundBumper {

	constructor(x, y) {
		super(x, y, 24, BOUNCE.ghost, "bshadow", Item.GHOST);
		this.alpha = 0;
	}

	onHit(game) {
		if (!this.animateHit())
			return;
		app.audio.play("metal");
		if (game.ball.type !== BallType.VIOLET)
			this.alpha = 1;
	}

	update(dt, game) {
		super.update(dt);
		const ball = game.ball;
		if (ball.type === BallType.VIOLET) {
			// (original : alpha = 200000 / distance^2 %)
			this.alpha = Math.min(1, 2000 / Math.max(1, dist2(this.x, this.y, ball.x, ball.y)));
		} else if (this.alpha > 0) {
			// (original : -4 % per frame)
			this.alpha = Math.max(0, this.alpha - dt * 1.6);
		}
	}

	renderShadow() { }

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y, 0, 1, this.alpha);
	}
}

/** Adds a spark where the ball hit. */
export function spark(game, contact) {
	game.room.add(new Spark(contact.x, contact.y));
}
