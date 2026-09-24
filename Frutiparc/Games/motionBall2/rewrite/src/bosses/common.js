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
import { Entity, Layer } from "../game/entity.js";
import { ClipEffect } from "../game/entities/effects.js";

export class Boss extends Entity {

	constructor(x, y) {
		super(x, y, Layer.BOSS);
	}

	onPause() { }
}

// ----- red flash -----

/** The colour transform of a hurt boss : a red offset (0..255). */
export const redOffset = red => ({ am: 1, rm: 1, gm: 1, bm: 1, ao: 0, ro: Math.min(255, red), go: 0, bo: 0 });

// ----- new holes -----

/** A floor tile falling into a new hole ("dalle", it removes itself). */
export class FallingTile extends ClipEffect {

	constructor(tx, ty) {
		super("dalle", TILE_ORIGIN + tx * TILE, TILE_ORIGIN + ty * TILE, Layer.ITEM, 1);
	}
}

/**
 * The floor cracking ("FXDalleCut") : when its animation ends, the tile falls
 * and becomes a hole (`onDone`).
 */
export class CrackingTile extends ClipEffect {

	constructor(tx, ty, onDone) {
		super("FXDalleCut", TILE_ORIGIN + tx * TILE, TILE_ORIGIN + ty * TILE, Layer.FLOOR);
		this.tx = tx;
		this.ty = ty;
		this.onDone = onDone;
	}

	update(dt, game) {
		super.update(dt);
		if (this.dead)
			this.onDone(game, this.tx, this.ty);
	}
}

/** Makes a hole at tile (tx, ty), with a falling tile. */
export function breakFloor(game, tx, ty) {
	game.room.addHole(tx, ty);
	game.room.add(new FallingTile(tx, ty));
}

/** Where a boss can move (the room minus a margin). */
export const ARENA = { minX: BORDER * 2, maxX: W - BORDER * 2, minY: BORDER, maxY: H - BORDER };
