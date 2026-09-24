/**
 * What the ball collects : pastilles, balls, item boxes, and the Classique
 * hatch. Also the teleports.
 *
 * Pastilles and balls are collected by distance (the ball rolls over them),
 * item boxes by collision.
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { Item } from "../../data/enums.js";
import { circle, roundRect, sphere, shine, sprite, drawSprite, dropShadow } from "../../gfx/draw.js";
import { drawItemIcon } from "../../gfx/icons.js";
import { drawBall } from "../ball.js";
import { dist2, ease } from "../../engine/math.js";
import { app } from "../../app.js";
import { Burst, Ring } from "./effects.js";

/** Distance (squared) under which the ball takes a pastille (original : 300). */
const TAKE_DIST2 = 300;

/**
 * A red pastille (take them all to open the doors) or a time pastille.
 */
export class Pastille extends Entity {

	/** @param data  the item of the level data (to remember it was taken) */
	constructor(x, y, red, data) {
		super(x, y, Layer.ITEM);
		this.itemType = red ? Item.RED : Item.BLUE;
		this.red = red;
		this.data = data;
		this.taken = false;
	}

	update(dt, game) {
		const ball = game.ball;
		if (this.taken || ball.falling || dist2(this.x, this.y, ball.x, ball.y) >= TAKE_DIST2)
			return;
		this.taken = true;
		this.dead = true;
		this.data.taken = true;
		game.room.add(new Burst(this.x, this.y, this.red ? "#ff5040" : "#ffd040"));
		if (this.red) {
			app.audio.play("red");
			game.room.redTaken(game);
		} else {
			app.audio.play("blue");
			game.addTime(game.rules.bluePastille);
		}
	}

	render(ctx) {
		drawSprite(ctx, this.red ? redSprite() : blueSprite(), this.x, this.y);
	}
}

function redSprite() {
	return sprite("red", 26, 26, ctx => {
		const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 12);
		halo.addColorStop(0, "rgba(255,255,255,0.9)");
		halo.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = halo;
		circle(ctx, 0, 0, 12);
		ctx.fill();
		sphere(ctx, 0, 0, 7, "#ff2a2a", "#8a0000", "#ffd0d0");
	});
}

function blueSprite() {
	return sprite("blue", 26, 26, ctx => {
		ctx.fillStyle = "rgba(60,0,60,0.25)";
		circle(ctx, 2, 2, 6);
		ctx.fill();
		sphere(ctx, 0, 0, 6, "#ffcc22", "#b06a00", "#fff6c0");
	});
}

/**
 * The hatch of the Classique rooms : it opens when the red pastilles are
 * taken, then the ball can fall through it to the next level.
 */
export class Hatch extends Entity {

	constructor(x, y) {
		super(x, y, Layer.ITEM);
		this.itemType = Item.HATCH;
		this.open = 0;          // 0 closed .. 1 open
		this.opening = false;
	}

	update(dt, game) {
		if (this.opening)
			this.open = Math.min(1, this.open + dt / 0.33);

		const ball = game.ball;
		if (this.open < 1 || ball.falling || dist2(this.x, this.y, ball.x, ball.y) >= TAKE_DIST2)
			return;
		const { x, y } = this;
		ball.startFall("hatch", 3, ctx => ctx.arc(x, y, 16, 0, Math.PI * 2));
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.fillStyle = "#2a0c40";
		roundRect(ctx, -17, -17, 34, 34, 8);
		ctx.fill();
		const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
		g.addColorStop(0, "#000");
		g.addColorStop(1, "#4a1a6a");
		ctx.fillStyle = g;
		circle(ctx, 0, 0, 14);
		ctx.fill();

		// the two flaps slide apart
		const open = ease.inOutQuad(this.open);
		if (open < 1) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(-17, -17, 34, 34);
			ctx.clip();
			ctx.fillStyle = "#d8a8f0";
			ctx.strokeStyle = "#7a3a9a";
			ctx.lineWidth = 1.5;
			roundRect(ctx, -17 - open * 17, -17, 17, 34, 5);
			ctx.fill();
			ctx.stroke();
			roundRect(ctx, open * 17, -17, 17, 34, 5);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}

		ctx.strokeStyle = this.open >= 1 ? "#7cff4a" : "#b070d8";
		ctx.lineWidth = 2;
		roundRect(ctx, -18, -18, 36, 36, 8);
		ctx.stroke();
		ctx.restore();
	}
}

/** A ball to collect, floating in the middle of a room. */
export class BallPickup extends Entity {

	constructor(x, y, ballType) {
		super(x, y, Layer.ITEM);
		this.ballType = ballType;
		this.taken = -1;       // seconds since taken, -1 = not yet
	}

	update(dt, game) {
		if (this.taken >= 0) {
			this.taken += dt;
			if (this.taken > 0.4)
				this.dead = true;
			return;
		}
		const ball = game.ball;
		if (!ball.falling && dist2(this.x, this.y, ball.x, ball.y) < 24 * 24) {
			this.taken = 0;
			app.audio.play("found");
			game.collectBall(this.ballType);
		}
	}

	render(ctx) {
		const t = app.time * 2.7;
		const k = this.taken < 0 ? 0 : this.taken / 0.4;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.globalAlpha = 1 - k;

		const r = 24 + k * 20;
		const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
		g.addColorStop(0, "rgba(255,255,255,0.8)");
		g.addColorStop(0.5, "rgba(255,255,255,0.25)");
		g.addColorStop(1, "rgba(255,255,255,0)");
		ctx.fillStyle = g;
		circle(ctx, 0, 0, r);
		ctx.fill();

		ctx.strokeStyle = "rgba(255,255,255,0.6)";
		ctx.lineWidth = 1.5;
		circle(ctx, 0, 0, 20 + Math.sin(t) * 2);
		ctx.stroke();

		ctx.translate(0, Math.sin(t * 1.3) * 2);
		drawBall(ctx, this.ballType, 9, null);
		ctx.restore();
	}
}

/** An item box : a bubble holding an item, which bursts when hit. */
export class ItemBox extends Entity {

	/**
	 * @param icon    the item shown (gfx/icons.js Icon)
	 * @param give    (game) => void : gives the item
	 */
	constructor(x, y, icon, give) {
		super(x, y, Layer.OBJECT);
		this.icon = icon;
		this.give = give;
		this.shape = { kind: "circle", x, y, r: 22 };
		this.solid = true;
		this.bounce = BOUNCE.itemBox;
		this.burst = -1;
	}

	onHit(game) {
		if (this.burst >= 0)
			return;
		this.burst = 0;
		this.solid = false;
		app.audio.play("found");
		game.room.add(new Ring(this.x, this.y, 40, "#fff"));
		this.give(game);
	}

	update(dt) {
		if (this.burst >= 0) {
			this.burst += dt;
			if (this.burst > 0.4)
				this.dead = true;
		}
	}

	renderShadow(ctx) {
		if (this.burst < 0)
			dropShadow(ctx, this.x, this.y, 20, 0.15);
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		if (this.burst < 0) {
			const g = ctx.createRadialGradient(-6, -8, 3, 0, 0, 23);
			g.addColorStop(0, "rgba(255,255,255,0.9)");
			g.addColorStop(0.6, "rgba(200,240,255,0.35)");
			g.addColorStop(1, "rgba(120,200,255,0.6)");
			ctx.fillStyle = g;
			circle(ctx, 0, 0, 23);
			ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.8)";
			ctx.lineWidth = 1.5;
			ctx.stroke();
			drawItemIcon(ctx, this.icon, 1 + 0.08 * Math.sin(app.time * 6));
			shine(ctx, 0, 0, 22, 0.55);
		} else {
			// the item grows and fades
			const k = this.burst / 0.4;
			ctx.globalAlpha = 1 - k;
			drawItemIcon(ctx, this.icon, 1 + k);
		}
		ctx.restore();
	}
}

/**
 * A teleport : the ball rolling on it is sent to the other teleport of the
 * room. Both ends then wait for the ball to leave them, so that it doesn't
 * bounce back and forth.
 */
export class Teleport extends Entity {

	constructor(x, y) {
		super(x, y, Layer.FLOOR);
		this.itemType = Item.TELEPORT;
		this.busy = false;
		this.circles = [];
		for (let i = 0; i < 5; i++) {
			this.circles.push({
				offset: Math.random() * 6,
				tilt: Math.random() * Math.PI * 2,
				angle: 0,
				speed: 3 + Math.floor(Math.random() * 3),
				phase: Math.random() * Math.PI * 2
			});
		}
	}

	update(dt, game) {
		const ball = game.ball;
		const d = Math.sqrt(dist2(this.x, this.y, ball.x, ball.y)) + 0.1;

		// the circles turn faster when the ball is close
		for (const c of this.circles) {
			c.angle += c.speed * (1 + 60 / d) * dt * 40 * Math.PI / 180;
			c.phase += (20 + 200 / d) * dt * 40 / 100;
		}

		if (d >= ball.radius) {
			this.busy = false;
			return;
		}
		if (this.busy || ball.falling)
			return;
		const other = game.room.entities.find(e => e instanceof Teleport && e !== this);
		if (!other)
			return;
		this.busy = true;
		other.busy = true;
		ball.x = other.x;
		ball.y = other.y;
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
		g.addColorStop(0, "rgba(255,255,255,0.95)");
		g.addColorStop(0.4, "rgba(210,150,255,0.6)");
		g.addColorStop(1, "rgba(120,40,200,0)");
		ctx.fillStyle = g;
		circle(ctx, 0, 0, 24);
		ctx.fill();

		ctx.strokeStyle = "rgba(255,255,255,0.75)";
		ctx.lineWidth = 1.5;
		for (const c of this.circles) {
			ctx.save();
			ctx.rotate(c.angle);
			ctx.scale(1 + Math.cos(c.phase) * 0.5, 1 + Math.sin(c.phase) * 0.5);
			ctx.rotate(c.tilt);
			ctx.beginPath();
			ctx.ellipse(0, c.offset, 14, 8, 0, 0, Math.PI * 1.3);
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();
	}
}
