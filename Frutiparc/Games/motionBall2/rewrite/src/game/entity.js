/**
 * Base class of everything that lives in a room.
 *
 * An entity has a position (x, y : its centre), a drawing layer, and
 * optionally a collision shape :
 *   shape    { kind: "circle", x, y, r } or { kind: "box", x, y, w, h }
 *   solid    whether the ball bounces on it
 *   bounce   { coef, min } (see physics.js)
 *   onHit(game, contact)   when the ball hits it
 *
 * The room calls update(dt, game) every step and render(ctx, game) every
 * frame, sorted by layer. An entity sets `dead = true` to be removed.
 */

/** Drawing order, from the floor up. */
export const Layer = Object.freeze({
	FLOOR: 0,      // holes, teleports, lowered blocks, beams
	SHADOW: 1,     // shadows of the objects
	ITEM: 2,       // pastilles, hatch, balls to collect
	BLOCK: 3,      // green, pink and blue blocks
	BALL: 4,       // the player's ball
	OBJECT: 5,     // bumpers (above the ball, as in the original)
	EFFECT: 6,     // sparks, debris
	BOSS: 7,
	TOP: 8
});

export class Entity {

	constructor(x = 0, y = 0, layer = Layer.OBJECT) {
		this.x = x;
		this.y = y;
		this.layer = layer;
		this.dead = false;
		this.shape = null;
		this.solid = false;
		this.bounce = null;
	}

	update(dt, game) { }

	render(ctx, game) { }
}

/**
 * A short effect : lives `duration` seconds, `t` goes from 0 to 1.
 * Subclasses draw with `this.t`.
 */
export class Effect extends Entity {

	constructor(x, y, duration, layer = Layer.EFFECT) {
		super(x, y, layer);
		this.duration = duration;
		this.age = 0;
	}

	get t() {
		return Math.min(1, this.age / this.duration);
	}

	update(dt) {
		this.age += dt;
		if (this.age >= this.duration)
			this.dead = true;
	}
}
