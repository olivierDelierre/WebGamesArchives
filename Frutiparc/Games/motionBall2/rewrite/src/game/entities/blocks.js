/**
 * The square obstacles : green blocks, and the pink / blue blocks with their
 * switch.
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { BallType, Item } from "../../data/enums.js";
import { TILE } from "../../config.js";
import { clip, drawClip } from "../../gfx/xfl/index.js";
import { drawItemShadow } from "./bumpers.js";
import { app } from "../../app.js";
import { Spark, Debris } from "./effects.js";

/**
 * A green block : a 40 x 40 tile, destroyed by the green ball.
 * Neighbouring blocks merge into one shape (see `neighbours`).
 */
export class GreenBlock extends Entity {

	/** x, y = top-left corner, `data` = the item of the level data (to remember it is gone). */
	constructor(x, y, data) {
		super(x + TILE / 2, y + TILE / 2, Layer.BLOCK);
		this.itemType = Item.BLOCK;
		this.data = data;
		this.left = x;
		this.top = y;
		this.shape = { kind: "box", x, y, w: TILE, h: TILE };
		this.solid = true;
		this.bounce = BOUNCE.block;
		// which neighbours are green blocks too : 1 left, 2 up, 4 right, 8 down
		this.neighbours = 0;
	}

	onHit(game, contact) {
		if (game.ball.type !== BallType.GREEN || this.dead) {
			app.audio.play("wall");
			game.room.add(new Spark(contact.x, contact.y));
			return;
		}

		app.audio.play("wall");
		this.dead = true;
		this.solid = false;
		this.data.destroyed = true;
		game.room.removeTile(this);

		// 4 pieces fly away in the direction of the ball
		const ball = game.ball;
		const angle = Math.atan2(ball.vy, ball.vx);
		const speed = contact.speed;
		for (let i = 0; i < 4; i++) {
			const s = ((Math.random() * speed / 2 + speed / 2) / 4 + 40);
			const a = angle + Math.random() - 0.5;
			game.room.add(new Debris(this.left + Math.random() * TILE, this.top + Math.random() * TILE, Math.cos(a) * s, Math.sin(a) * s));
		}
	}

	/** The "wall" symbol : one frame per combination of neighbours, so that they merge. */
	render(ctx) {
		const c = this.art || (this.art = clip("wall"));
		c.gotoAndStop(this.neighbours);
		drawClip(ctx, c, this.x, this.y);
	}
}

/**
 * A pink or blue block. The switch of the room raises one colour and lowers
 * the other : pink blocks are up (solid) while the switch is on, blue blocks
 * while it is off. The state of the switches is kept for the whole game.
 */
export class SwitchBlock extends Entity {

	constructor(x, y, pink) {
		super(x + TILE / 2, y + TILE / 2, Layer.FLOOR);
		this.itemType = pink ? Item.PINK_BLOCK : Item.BLUE_BLOCK;
		this.pink = pink;
		this.left = x;
		this.top = y;
		this.shape = { kind: "box", x, y, w: TILE, h: TILE };
		this.bounce = BOUNCE.block;
		this.solid = null;
		// the symbol : "off" = up, "on" = down, "playOff" / "playOn" go there
		this.art = clip(pink ? "interred" : "interblue");
	}

	isUp(game) {
		return this.pink === game.switchOn;
	}

	update(dt, game) {
		const up = this.isUp(game);
		if (this.solid === null)
			this.art.gotoAndStop(up ? "off" : "on");
		else if (up !== this.solid)
			this.art.gotoAndPlay(up ? "playOff" : "playOn");
		this.solid = up;
		this.layer = up ? Layer.BLOCK : Layer.FLOOR;
		this.art.update(dt);
	}

	onHit(game, contact) {
		app.audio.play("wall");
		game.room.add(new Spark(contact.x, contact.y));
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
	}
}

/** The switch : toggles the pink and blue blocks. */
export class Switch extends Entity {

	constructor(x, y) {
		super(x, y, Layer.OBJECT);
		this.itemType = Item.SWITCH;
		this.shape = { kind: "circle", x, y, r: 15 };
		this.solid = true;
		this.bounce = BOUNCE.block;
		this.cooldown = 0;
		this.on = null;
		this.art = clip("interupt");
	}

	onHit(game, contact) {
		// the ball touches it during several steps : one toggle per touch
		if (this.cooldown > 0)
			return;
		this.cooldown = 0.5;
		app.audio.play("metal");
		game.room.add(new Spark(contact.x, contact.y));
		game.switchOn = !game.switchOn;
	}

	update(dt, game) {
		this.cooldown = Math.max(0, this.cooldown - dt);
		if (this.on === null)
			this.art.gotoAndStop(game.switchOn ? "on" : "off");
		else if (this.on !== game.switchOn)
			this.art.gotoAndPlay(game.switchOn ? "playOn" : "playOff");
		this.on = game.switchOn;
		this.art.update(dt);
	}

	renderShadow(ctx) {
		drawItemShadow(ctx, Item.SWITCH, this.x, this.y);
	}

	render(ctx) {
		drawClip(ctx, this.art, this.x, this.y);
	}
}
