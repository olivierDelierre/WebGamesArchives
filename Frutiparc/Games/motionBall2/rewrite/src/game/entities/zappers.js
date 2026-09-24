/**
 * Zappers : laser posts. The posts of the same colour ("phase") are linked by
 * laser beams that only the ball of that colour can cross ; any other ball
 * dies. The phase of a post comes from its position in the room.
 *
 * In Course mode the posts are checkpoints : crossing their beam counts a
 * lap (see Game.checkpoint).
 */

import { Entity, Layer } from "../entity.js";
import { BOUNCE } from "../physics.js";
import { Item, BALL_TYPE_COUNT } from "../../data/enums.js";
import { BALL_COLORS, circle, sphere, sprite, drawSprite, dropShadow } from "../../gfx/draw.js";
import { app } from "../../app.js";
import { Spark, BeamFlash } from "./effects.js";

export class Zapper extends Entity {

	/** @param cellX, cellY  the position in the level data (gives the phase) */
	constructor(x, y, cellX, cellY, checkpoint) {
		super(x, y, Layer.OBJECT);
		this.itemType = Item.ZAPPER;
		this.shape = { kind: "circle", x, y, r: 14 };
		this.solid = true;
		this.bounce = BOUNCE.zapper;
		this.checkpoint = checkpoint;
		// the colour depends on the position (4 = half the size of the post, in cells)
		this.phase = checkpoint ? 0 : (((cellX - 4) + (cellY - 4)) % BALL_TYPE_COUNT + BALL_TYPE_COUNT) % BALL_TYPE_COUNT;
		this.blink = x;   // desynchronises the lights
	}

	onHit(game, contact) {
		app.audio.play("metal");
		game.room.add(new Spark(contact.x, contact.y));
	}

	renderShadow(ctx) {
		dropShadow(ctx, this.x, this.y, 14);
	}

	render(ctx) {
		if (this.checkpoint) {
			drawSprite(ctx, checkpointSprite(), this.x, this.y);
			return;
		}
		drawSprite(ctx, postSprite(this.phase), this.x, this.y);
		const t = app.time * 6 + this.blink;
		ctx.fillStyle = "rgba(255,255,255," + (0.3 + 0.3 * Math.sin(t)) + ")";
		circle(ctx, this.x, this.y, 9);
		ctx.fill();
	}
}

function postSprite(phase) {
	return sprite("zapper" + phase, 32, 32, ctx => {
		const col = BALL_COLORS[phase];
		sphere(ctx, 0, 0, 14, "#dcdce6", "#4a4a5a");
		ctx.strokeStyle = "#3a3a48";
		ctx.lineWidth = 1;
		circle(ctx, 0, 0, 14);
		ctx.stroke();
		sphere(ctx, 0, 0, 8, col[0], col[1], col[2]);
	});
}

function checkpointSprite() {
	return sprite("checkpoint", 32, 32, ctx => {
		sphere(ctx, 0, 0, 14, "#fff4b0", "#b08400");
		ctx.strokeStyle = "#7a5a00";
		ctx.lineWidth = 1;
		circle(ctx, 0, 0, 14);
		ctx.stroke();
		// chequered flag
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 3; j++) {
				ctx.fillStyle = (i + j) % 2 ? "#222" : "#fff";
				ctx.fillRect(-6 + i * 3, -5 + j * 3, 3, 3);
			}
		}
	});
}

/** A laser beam between two posts of the same phase. */
export class Beam extends Entity {

	constructor(a, b) {
		super(a.x, a.y, Layer.FLOOR);
		this.a = a;
		this.b = b;
		this.phase = a.phase;
		this.checkpoint = a.checkpoint;
	}

	/** The ball touches the beam. */
	touch(game) {
		if (this.checkpoint) {
			game.checkpoint();
			return;
		}
		if (game.ball.type === this.phase)
			return;
		if (game.ball.die()) {
			app.audio.play("laser");
			game.room.add(new BeamFlash(this.a.x, this.a.y, this.b.x, this.b.y, this.phase));
		}
	}

	render(ctx) {
		const t = app.time * 6.7;
		ctx.save();
		ctx.lineWidth = 2;
		ctx.setLineDash([4, 6]);
		ctx.lineDashOffset = -t * 2;
		ctx.strokeStyle = this.checkpoint ? "#ffffff" : BALL_COLORS[this.phase][0];
		ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t);
		ctx.beginPath();
		ctx.moveTo(this.a.x, this.a.y);
		ctx.lineTo(this.b.x, this.b.y);
		ctx.stroke();
		ctx.restore();
	}
}

/** Links every pair of posts of the same phase. */
export function makeBeams(zappers) {
	const beams = [];
	for (let i = 0; i < zappers.length; i++)
		for (let j = i + 1; j < zappers.length; j++)
			if (zappers[i].phase === zappers[j].phase)
				beams.push(new Beam(zappers[i], zappers[j]));
	return beams;
}
