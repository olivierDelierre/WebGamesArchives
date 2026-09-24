/**
 * The round bumpers : normal, clock, death, magnet and invisible ("ghost").
 *
 * They share a "hit" animation (a quick swell and a white flash), a shadow,
 * and a circular collision shape.
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { BallType, Item } from "../../data/enums.js";
import { image, circle, sphere, dropShadow, sprite, drawSprite } from "../../gfx/draw.js";
import { dist2, perFrameChance, smooth } from "../../engine/math.js";
import { app } from "../../app.js";
import { Spark } from "./effects.js";

const HIT_TIME = 0.25;

class RoundBumper extends Entity {

	/**
	 * @param x, y        centre
	 * @param radius      collision radius
	 * @param shadow      radius of the drop shadow (0 = none)
	 */
	constructor(x, y, radius, bounce, shadow) {
		super(x, y, Layer.OBJECT);
		this.shape = { kind: "circle", x, y, r: radius };
		this.solid = true;
		this.bounce = bounce;
		this.shadowRadius = shadow;
		this.hitTime = -1;     // seconds since the last hit, -1 = idle
	}

	/** Starts the hit animation ; returns false if it is already playing. */
	animateHit() {
		if (this.hitTime >= 0)
			return false;
		this.hitTime = 0;
		return true;
	}

	update(dt) {
		if (this.hitTime >= 0) {
			this.hitTime += dt;
			if (this.hitTime > HIT_TIME)
				this.hitTime = -1;
		}
	}

	/** Swell of the hit animation. */
	get pulse() {
		return this.hitTime < 0 ? 1 : 1 + Math.sin(this.hitTime / HIT_TIME * Math.PI) * 0.18;
	}

	renderShadow(ctx) {
		if (this.shadowRadius)
			dropShadow(ctx, this.x, this.y, this.shadowRadius);
	}

	flash(ctx, radius) {
		if (this.hitTime < 0)
			return;
		ctx.fillStyle = "rgba(255,255,255," + 0.6 * (1 - this.hitTime / HIT_TIME) + ")";
		circle(ctx, this.x, this.y, radius * this.pulse);
		ctx.fill();
	}
}

/** The normal bumper : kicks the ball away. */
export class Bumper extends RoundBumper {

	constructor(x, y) {
		super(x, y, 20, BOUNCE.bumper, 22);
		this.itemType = Item.BUMPER;
	}

	onHit() {
		if (this.animateHit())
			app.audio.play("metal");
	}

	render(ctx) {
		const s = this.pulse;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.scale(s, s);
		image(ctx, "normal_base", 46, 46);
		image(ctx, "normal_top", 23, 23);
		ctx.restore();
		this.flash(ctx, 22);
	}
}

/**
 * The clock bumper : each hit costs time (or adds time to the chronometer
 * in Course mode). Its hands show the remaining time.
 */
export class ClockBumper extends RoundBumper {

	constructor(x, y, game) {
		super(x, y, 28, BOUNCE.clock, 27);
		this.itemType = Item.CLOCK;
		this.shownTime = game.time;
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
	}

	render(ctx) {
		const s = this.pulse;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.scale(s, s);
		drawSprite(ctx, clockFace(), 0, 0);

		// hands : purple leaves (1 turn of the small one = 1 hour, of the big one = 1 minute)
		const ms = this.shownTime * 1000;
		ctx.fillStyle = "#7a2aa0";
		for (const [angle, length] of [[-ms / 3600, 12], [-(ms % 3600) / 10, 17]]) {
			ctx.save();
			ctx.rotate(angle * Math.PI / 180);
			ctx.beginPath();
			ctx.ellipse(0, -length / 2, 2.8, length / 2, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
		sphere(ctx, 0, 0, 2.5, "#c05ae0", "#5a1a78");
		ctx.restore();
		this.flash(ctx, 28);
	}
}

function clockFace() {
	return sprite("clock", 66, 66, ctx => {
		ctx.fillStyle = "#6cc93a";
		for (let i = 0; i < 8; i++) {
			const a = i * Math.PI / 4;
			circle(ctx, Math.cos(a) * 26, Math.sin(a) * 26, 6);
			ctx.fill();
		}
		image(ctx, "time_base", 54, 54);
	});
}

/** The death bumper : kills the ball, except the metal one. */
export class DeathBumper extends RoundBumper {

	constructor(x, y) {
		super(x, y, 15, BOUNCE.death, 17);
		this.itemType = Item.DEATH;
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

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.scale(this.pulse, this.pulse);
		if (this.hitTime >= 0)
			ctx.rotate(this.hitTime * 8);
		image(ctx, "death_base", 38, 39);
		ctx.restore();
	}
}

/**
 * The magnet : attracts the ball (not the metal one). When hit, it repels
 * the ball for a while (about 25 s on average), then attracts again.
 */
export class Magnet extends RoundBumper {

	constructor(x, y) {
		super(x, y, 20, BOUNCE.magnet, 17);
		this.itemType = Item.MAGNET;
		this.attracting = true;
		this.phase = Math.random();
	}

	onHit() {
		if (this.attracting) {
			this.attracting = false;
			app.audio.play("metal");
		}
	}

	update(dt, game) {
		super.update(dt);
		this.phase = (this.phase + dt * 2) % 1;

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
		if (!this.attracting && Math.random() < perFrameChance(1000, dt))
			this.attracting = true;
	}

	render(ctx) {
		const neg = !this.attracting;
		const t = this.phase;
		ctx.save();
		ctx.translate(this.x, this.y);

		// field ring, going in (attracts) or out (repels)
		ctx.strokeStyle = neg ? "rgba(255,90,60," + 0.5 * (1 - t) + ")" : "rgba(120,255,90," + 0.5 * t + ")";
		ctx.lineWidth = 2;
		circle(ctx, 0, 0, neg ? 18 + t * 18 : 36 - t * 18);
		ctx.stroke();

		image(ctx, "magnet_base", 38, 38);
		image(ctx, "magnet_top", 24, 24);
		image(ctx, neg ? "magnet_minus" : "magnet_plus", 15, neg ? 11 : 14);
		ctx.restore();
	}
}

/**
 * The invisible bumper ("ghost") : it shows up for a moment when hit.
 * The violet ball sees it when close.
 */
export class GhostBumper extends RoundBumper {

	constructor(x, y) {
		super(x, y, 24, BOUNCE.ghost, 0);
		this.itemType = Item.GHOST;
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
			// fades out in ~0.6 s
			this.alpha = Math.max(0, this.alpha - dt * 1.6);
		}
	}

	render(ctx) {
		if (this.alpha <= 0.01)
			return;
		ctx.save();
		ctx.globalAlpha = this.alpha;
		ctx.translate(this.x, this.y);
		ctx.scale(this.pulse, this.pulse);
		drawSprite(ctx, ghostSprite(), 0, 0);
		ctx.restore();
	}
}

function ghostSprite() {
	return sprite("ghost", 56, 56, ctx => {
		const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 27);
		g.addColorStop(0, "#2a0a40");
		g.addColorStop(0.55, "#5a2a84");
		g.addColorStop(0.8, "#8a58b8");
		g.addColorStop(1, "rgba(60,20,90,0)");
		ctx.fillStyle = g;
		circle(ctx, 0, 0, 27);
		ctx.fill();
		ctx.strokeStyle = "rgba(220,180,255,0.6)";
		ctx.lineWidth = 2;
		circle(ctx, 0, 0, 17);
		ctx.stroke();
		sphere(ctx, 0, 0, 9, "#6a3a9a", "#200834", "#c8a0f0");
	});
}

/** Adds a spark where the ball hit. */
export function spark(game, contact) {
	game.room.add(new Spark(contact.x, contact.y));
}
