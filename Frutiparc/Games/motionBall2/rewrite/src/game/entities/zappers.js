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
import { BALL_COLORS } from "../../gfx/draw.js";
import { clip, drawClip } from "../../gfx/xfl/index.js";
import { drawItemShadow } from "./bumpers.js";
import { app } from "../../app.js";
import { Spark, BeamFlash } from "./effects.js";

export class Zapper extends Entity {

	/**
	 * @param cellX, cellY  the position in the level data (gives the phase)
	 * @param cells         the size of the symbol in cells
	 */
	constructor(x, y, cellX, cellY, cells, checkpoint) {
		super(x, y, Layer.OBJECT);
		this.itemType = Item.ZAPPER;
		this.shape = { kind: "circle", x, y, r: 14 };
		this.solid = true;
		this.bounce = BOUNCE.zapper;
		this.checkpoint = checkpoint;
		// the colour depends on the position (original : ((x - w/2) + (y - h/2)) % 7)
		const p = (cellX - cells.w / 2) + (cellY - cells.h / 2);
		this.phase = checkpoint ? 0 : ((p % BALL_TYPE_COUNT) + BALL_TYPE_COUNT) % BALL_TYPE_COUNT;
	}

	onHit(game, contact) {
		app.audio.play("metal");
		game.room.add(new Spark(contact.x, contact.y));
	}

	renderShadow(ctx) {
		drawItemShadow(ctx, Item.ZAPPER, this.x, this.y);
	}

	/** The "zapper" symbol : a frame per colour ; in Course mode, "checkpoint". */
	render(ctx) {
		if (!this.art) {
			this.art = clip(this.checkpoint ? "checkpoint" : "zapper");
			this.art.gotoAndStop(this.checkpoint ? "off" : this.phase);
		}
		drawClip(ctx, this.art, this.x, this.y);
	}

	update(dt) {
		if (this.art)
			this.art.update(dt);
	}
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
