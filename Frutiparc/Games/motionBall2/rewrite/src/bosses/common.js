/**
 * What the bosses share : the base class, the red flash of a hit, and the
 * floor tiles falling into new holes.
 *
 * A boss is an entity of the BOSS layer created by bosses/index.js when the
 * ball enters the boss room. The game calls update(dt, game) every step
 * (render with the room), and onPause(paused). A boss calls
 * game.bossBeaten() when it is dead.
 */

import { WIDTH as W, HEIGHT as H, TILE, TILE_ORIGIN, BORDER } from "../config.js";
import { Entity, Effect, Layer } from "../game/entity.js";
import { roundRect } from "../gfx/draw.js";

export class Boss extends Entity {

	constructor(x, y) {
		super(x, y, Layer.BOSS);
	}

	onPause() { }
}

// ----- red flash -----

let tintCanvas = null;

/**
 * Draws with a red tint (the boss is hurt) : `draw(ctx)` draws around (0, 0)
 * within `size` pixels, amount in [0, 1].
 * The drawing goes through an offscreen canvas, so the tint only covers it.
 */
export function drawTinted(ctx, x, y, size, amount, draw) {
	if (amount <= 0.01) {
		ctx.save();
		ctx.translate(x, y);
		draw(ctx);
		ctx.restore();
		return;
	}
	const scale = 2;
	const px = size * 2 * scale;
	if (!tintCanvas || tintCanvas.width < px) {
		tintCanvas = document.createElement("canvas");
		tintCanvas.width = tintCanvas.height = px;
	}
	const c = tintCanvas.getContext("2d");
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.globalCompositeOperation = "source-over";
	c.globalAlpha = 1;
	c.clearRect(0, 0, px, px);
	c.setTransform(scale, 0, 0, scale, size * scale, size * scale);
	draw(c);
	c.setTransform(1, 0, 0, 1, 0, 0);
	c.globalCompositeOperation = "source-atop";
	c.globalAlpha = Math.min(0.85, amount);
	c.fillStyle = "rgb(255,40,40)";
	c.fillRect(0, 0, px, px);
	ctx.drawImage(tintCanvas, 0, 0, px, px, x - size, y - size, size * 2, size * 2);
}

// ----- new holes -----

/** A floor tile falling into a new hole. */
export class FallingTile extends Effect {

	constructor(tx, ty) {
		super(TILE_ORIGIN + tx * TILE + 1 + TILE / 2, TILE_ORIGIN + ty * TILE + 1 + TILE / 2, 0.6, Layer.ITEM);
	}

	render(ctx) {
		const k = this.t;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(k * 0.8);
		ctx.scale(1 - k * 0.8, 1 - k * 0.8);
		ctx.globalAlpha = 1 - k * 0.6;
		ctx.fillStyle = "#c9a2e6";
		ctx.strokeStyle = "#8a5ab0";
		ctx.lineWidth = 2;
		roundRect(ctx, -19, -19, 38, 38, 4);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}
}

/**
 * The floor cracking : after `duration` seconds the tile falls and becomes
 * a hole (`onDone`).
 */
export class CrackingTile extends Effect {

	constructor(tx, ty, duration, onDone) {
		super(TILE_ORIGIN + tx * TILE + 1, TILE_ORIGIN + ty * TILE + 1, duration, Layer.FLOOR);
		this.tx = tx;
		this.ty = ty;
		this.onDone = onDone;
	}

	update(dt, game) {
		super.update(dt);
		if (this.dead)
			this.onDone(game, this.tx, this.ty);
	}

	render(ctx) {
		const k = this.t;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.strokeStyle = Math.floor(this.age * 10) % 2 ? "rgba(60,0,80,0.9)" : "rgba(255,255,255,0.8)";
		ctx.lineWidth = 1 + k * 2;
		ctx.beginPath();
		ctx.moveTo(4, 20);
		ctx.lineTo(14, 16);
		ctx.lineTo(20, 24);
		ctx.lineTo(30, 14);
		ctx.lineTo(37, 18);
		ctx.moveTo(20, 4);
		ctx.lineTo(18, 14);
		ctx.lineTo(24, 22);
		ctx.lineTo(20, 36);
		ctx.stroke();
		ctx.strokeStyle = "rgba(255,80,80," + (0.3 + 0.4 * k) + ")";
		ctx.strokeRect(1, 1, 38, 38);
		ctx.restore();
	}
}

/** Makes a hole at tile (tx, ty), with a falling tile. */
export function breakFloor(game, tx, ty) {
	game.room.addHole(tx, ty);
	game.room.add(new FallingTile(tx, ty));
}

/** Where a boss can move (the room minus a margin). */
export const ARENA = { minX: BORDER * 2, maxX: W - BORDER * 2, minY: BORDER, maxY: H - BORDER };
