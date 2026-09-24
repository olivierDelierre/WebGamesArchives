/**
 * The square obstacles : green blocks, and the pink / blue blocks with their
 * switch.
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { BallType, Item } from "../../data/enums.js";
import { TILE } from "../../config.js";
import { image, roundRect, sphere, shine, circle } from "../../gfx/draw.js";
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

	render(ctx) {
		const f = this.neighbours;
		const EXT = 6;
		const x0 = this.left;
		const y0 = this.top;
		// sides touching another block are extended under it, so the blocks merge
		const left = (f & 1) ? -EXT : 1;
		const up = (f & 2) ? -EXT : 1;
		const right = (f & 4) ? TILE + EXT : TILE - 1;
		const down = (f & 8) ? TILE + EXT : TILE - 1;

		ctx.save();
		ctx.beginPath();
		ctx.rect(x0, y0, TILE, TILE);
		ctx.clip();
		const g = ctx.createLinearGradient(x0, y0, x0 + TILE, y0 + TILE);
		g.addColorStop(0, "#b4f0a0");
		g.addColorStop(1, "#8fdc78");
		ctx.fillStyle = g;
		roundRect(ctx, x0 + left, y0 + up, right - left, down - up, 8);
		ctx.fill();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = "#62b24a";
		ctx.stroke();

		// soft highlight in the top-left corner of a group of blocks
		if (!(f & 1) && !(f & 2)) {
			ctx.strokeStyle = "rgba(255,255,255,0.75)";
			ctx.lineWidth = 2.5;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(x0 + left + 4, y0 + up + 16);
			ctx.lineTo(x0 + left + 4, y0 + up + 10);
			ctx.quadraticCurveTo(x0 + left + 4, y0 + up + 4, x0 + left + 10, y0 + up + 4);
			ctx.lineTo(x0 + left + 16, y0 + up + 4);
			ctx.stroke();
		}
		ctx.restore();
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
		this.raised = 0;          // 0 lowered .. 1 raised (animated)
	}

	isUp(game) {
		return this.pink === game.switchOn;
	}

	update(dt, game) {
		const up = this.isUp(game);
		this.solid = up;
		this.raised = Math.max(0, Math.min(1, this.raised + (up ? dt : -dt) * 5));
		this.layer = this.raised > 0.5 ? Layer.BLOCK : Layer.FLOOR;
	}

	onHit(game, contact) {
		app.audio.play("wall");
		game.room.add(new Spark(contact.x, contact.y));
	}

	render(ctx) {
		const color = this.pink ? "pink" : "blue";
		image(ctx, "inter_low_" + color, TILE, TILE, this.left, this.top);
		if (this.raised > 0) {
			ctx.globalAlpha = this.raised;
			image(ctx, "inter_high_" + color, TILE, TILE, this.left, this.top - 3 * this.raised);
			ctx.globalAlpha = 1;
		}
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
		this.angle = 0;
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
		// the disc turns half a turn at each toggle
		const target = game.switchOn ? Math.PI : 0;
		this.angle += (target - this.angle) * Math.min(1, dt * 10);
	}

	renderShadow(ctx) {
		ctx.fillStyle = "rgba(40,0,70,0.22)";
		circle(ctx, this.x + 4, this.y + 5, 14);
		ctx.fill();
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		sphere(ctx, 0, 0, 15, "#e8e4f0", "#7a7288");
		ctx.rotate(this.angle);
		ctx.fillStyle = "#ff6ec8";
		ctx.beginPath();
		ctx.arc(0, 0, 10, -Math.PI / 2, Math.PI / 2);
		ctx.fill();
		ctx.fillStyle = "#5a6cff";
		ctx.beginPath();
		ctx.arc(0, 0, 10, Math.PI / 2, Math.PI * 1.5);
		ctx.fill();
		ctx.rotate(-this.angle);
		ctx.strokeStyle = "#4a4458";
		ctx.lineWidth = 1.5;
		circle(ctx, 0, 0, 10);
		ctx.stroke();
		shine(ctx, 0, 0, 14, 0.5);
		ctx.restore();
	}
}
