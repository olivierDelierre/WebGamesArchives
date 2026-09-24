/**
 * What the ball collects : pastilles, balls, item boxes, and the Classique
 * hatch. Also the teleports. All drawn with the original symbols.
 *
 * Pastilles and balls are collected by distance (the ball rolls over them),
 * item boxes by collision.
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { Item } from "../../data/enums.js";
import { dist2 } from "../../engine/math.js";
import { clip, drawClip } from "../../gfx/xfl/index.js";
import { app } from "../../app.js";

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
		// "red" / "blue" : stopped, then "hit" plays and removes itself
		this.art = clip(red ? "red" : "blue");
	}

	update(dt, game) {
		this.art.update(dt);
		if (this.art.removed)
			this.dead = true;
		const ball = game.ball;
		if (this.taken || ball.falling || dist2(this.x, this.y, ball.x, ball.y) >= TAKE_DIST2)
			return;
		this.taken = true;
		this.data.taken = true;
		this.art.gotoAndPlay("hit");
		if (this.red) {
			app.audio.play("red");
			game.room.redTaken(game);
		} else {
			app.audio.play("blue");
			game.addTime(game.rules.bluePastille);
		}
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
	}
}

/**
 * The hatch of the Classique rooms : it opens when the red pastilles are
 * taken, then the ball can fall through it to the next level.
 */
export class Hatch extends Entity {

	constructor(x, y) {
		super(x, y, Layer.ITEM);
		this.itemType = Item.HATCH;
		this.open = 0;          // 1 once open
		this.opening = false;
		// "exit" : "close", then "anim_open" ; its script sets flOpen at the end
		this.art = clip("exit");
		this.art.stop();
	}

	update(dt, game) {
		if (this.opening && !this.started) {
			this.started = true;
			this.art.gotoAndPlay("anim_open");
		}
		this.art.update(dt);
		if (this.art.vars.flOpen)
			this.open = 1;

		const ball = game.ball;
		if (this.open < 1 || ball.falling || dist2(this.x, this.y, ball.x, ball.y) >= TAKE_DIST2)
			return;
		const { x, y } = this;
		ball.startFall("hatch", 3, ctx => ctx.arc(x, y, 16, 0, Math.PI * 2));
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
	}
}

/** A ball to collect, in the middle of a room ("ballbox" ; its child "ball" shows the colour). */
export class BallPickup extends Entity {

	constructor(x, y, ballType) {
		super(x, y, Layer.ITEM);
		this.ballType = ballType;
		this.taken = false;
		this.art = clip("ballbox");
		const ball = this.art.child("ball");
		if (ball)
			ball.gotoAndStop(ballType);
	}

	update(dt, game) {
		this.art.update(dt);
		if (this.art.removed)
			this.dead = true;
		if (this.taken)
			return;
		const ball = game.ball;
		if (!ball.falling && dist2(this.x, this.y, ball.x, ball.y) < 24 * 24) {
			this.taken = true;
			this.art.gotoAndPlay("hit");
			app.audio.play("found");
			game.collectBall(this.ballType);
		}
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
	}
}

/**
 * An item box ("itembox" ; its child "item" shows the item) : it bursts when
 * the ball hits it, and gives its item.
 */
export class ItemBox extends Entity {

	/**
	 * @param icon    the item : 0 map, 1 radar, 2 small time, 3 big time, 4 key
	 * @param give    (game) => void : gives the item
	 */
	constructor(x, y, icon, give) {
		super(x, y, Layer.OBJECT);
		this.icon = icon;
		this.give = give;
		this.shape = { kind: "circle", x, y, r: 22 };
		this.solid = true;
		this.bounce = BOUNCE.itemBox;
		this.art = clip("itembox");
		const item = this.art.child("item");
		if (item)
			item.gotoAndStop(icon);
	}

	onHit(game) {
		if (!this.solid)
			return;
		this.solid = false;
		this.art.gotoAndPlay("hit");
		app.audio.play("found");
		this.give(game);
	}

	update(dt) {
		this.art.update(dt);
		if (this.art.removed)
			this.dead = true;
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
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
		if (!this.art) {
			this.art = clip("bteleport");
			this.art.set("c0", { visible: false });
		}
		this.art.update(dt);
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

	/**
	 * "bteleport", whose circle "c0" the original duplicated 5 times and
	 * turned / stretched by code (Level.as, Collide.bumper_teleport_on_update).
	 */
	render(ctx) {
		if (!this.art)
			return;
		drawClip(ctx, this.art, this.x, this.y);
		const circle = this.art.child("c0");
		if (!circle || this.art.frame >= 48)
			return;
		for (const c of this.circles) {
			ctx.save();
			ctx.translate(this.x, this.y);
			ctx.rotate(c.angle);
			ctx.scale(1 + Math.cos(c.phase) * 0.5, 1 + Math.sin(c.phase) * 0.5);
			ctx.rotate(c.tilt);
			ctx.translate(0, c.offset);
			circle.draw(ctx);
			ctx.restore();
		}
	}
}
