/**
 * The player's ball : controls, movement, holes, the blue ball's jump, and
 * the "falling" animation (in a hole, through the hatch, or killed).
 *
 * Movement : the wanted direction accelerates the ball, and its speed is
 * multiplied by `inertia` every original frame (1/40 s). Each ball colour has
 * its own acceleration and inertia (config.js BALLS). Above the maximum
 * speed (after a bumper kicked it) the ball brakes hard.
 *
 * The ball moves in sub-steps of at most 4 pixels, and collides with the
 * room after each sub-step (physics.js).
 */

import { BALLS, BALL_RADIUS, PHYSICS, WATER, INVULNERABLE_TIME, TILE, TILE_ORIGIN, ORIGINAL_FPS } from "../config.js";
import { BallType, Item } from "../data/enums.js";
import { Entity, Layer } from "./entity.js";
import { collideBall } from "./physics.js";
import { decay, randInt, TAU } from "../engine/math.js";
import { clip, drawClip } from "../gfx/xfl/index.js";
import { app } from "../app.js";

const MAX_SUBSTEP = 4;

/** The rolling spots of each colour : count and distance from the centre. */
const SPOTS = [
	{ count: 6, min: 10, max: 20, color: "#fff4a0" },
	{ count: 20, min: 0, max: 20, color: "#2a7a10" },
	{ count: 4, min: 14, max: 14, color: "#ffd0b0" },
	{ count: 10, min: 0, max: 12, color: "#ffe070" },
	{ count: 10, min: 6, max: 20, color: "#ffffff" },
	{ count: 0, min: 0, max: 20, color: "#ffffff" },
	{ count: 20, min: 0, max: 20, color: "#f0d0ff" }
];

export class Ball extends Entity {

	constructor() {
		super(0, 0, Layer.BALL);
		this.radius = BALL_RADIUS;
		this.type = BallType.YELLOW;
		this.vx = 0;
		this.vy = 0;

		// where the ball comes back after losing a life
		this.spawnX = 0;
		this.spawnY = 0;

		this.controlled = true;       // false while a boss holds it
		this.speedLimit = true;       // false while a boss throws it
		this.water = false;           // slippery floor (water snake)
		this.invulnerable = 0;        // seconds left

		// falling : null, or { kind: "hole" | "hatch" | "death", scale, speed, clip }
		this.fall = null;

		// the blue ball's jump over the holes
		this.jump = null;             // null, or { size, way }
		this.justLanded = false;
		this.height = 0;              // jump height, in pixels

		this.hidden = false;
		this.spots = [];
		this.setType(BallType.YELLOW);
	}

	get speed() {
		return Math.hypot(this.vx, this.vy);
	}

	get specs() {
		return BALLS[this.type];
	}

	/**
	 * Changes the colour : the "marble" symbol shows it, and a few "stone"
	 * clips roll on it (frames random(4) + 10 x colour), like Ball.as.
	 */
	setType(type) {
		this.type = type;
		const s = SPOTS[type];
		this.spots = [];
		for (let i = 0; i < s.count; i++) {
			const art = clip("stone");
			art.gotoAndStop(randInt(4) + type * 10);
			if (type === BallType.VIOLET) {
				const sparkle = art.child("eclat");
				if (sparkle)
					sparkle.gotoAndPlay(randInt(30));
			}
			this.spots.push({
				u: Math.random() * TAU,
				v: Math.random() * TAU,
				ray: s.min + randInt(s.max - s.min + 1),
				rotation: Math.random() * TAU,
				art
			});
		}
	}

	placeAt(x, y) {
		this.x = x;
		this.y = y;
		this.vx = 0;
		this.vy = 0;
	}

	/** Remembers the current position as the place to come back to after a death. */
	setSpawn() {
		this.spawnX = this.x;
		this.spawnY = this.y;
	}

	get falling() {
		return this.fall !== null;
	}

	// ----- every step -----

	update(dt, game) {
		if (this.invulnerable > 0)
			this.invulnerable = Math.max(0, this.invulnerable - dt);

		this.updateJump(dt);

		if (this.fall) {
			this.updateFall(dt, game);
			return;
		}

		this.steer(dt, game);
		this.move(dt, game);
		this.roll(dt);
	}

	/** Controls and speed. */
	steer(dt, game) {
		const specs = this.specs;
		let accel = specs.accel;
		let inertia = specs.inertia;
		if (this.water) {
			accel *= WATER.accelFactor;
			inertia = WATER.inertia;
		}

		// friction
		const k = decay(inertia, dt);
		this.vx *= k;
		this.vy *= k;
		// (the original threshold is per 1/40 s frame : smaller for shorter steps,
		// or weak forces such as a distant magnet could never move the ball)
		const rest = PHYSICS.restSpeed * dt * ORIGINAL_FPS;
		if (Math.abs(this.vx) < rest)
			this.vx = 0;
		if (Math.abs(this.vy) < rest)
			this.vy = 0;

		// the player (not while a boss holds the ball, nor in the air)
		if (this.controlled && !this.jump) {
			const axis = app.input.axis();
			this.vx += axis.x * accel * dt;
			this.vy += axis.y * accel * dt;
		}

		// above the maximum speed : brake hard
		const max = specs.maxSpeed;
		let speed = this.speed;
		if (this.speedLimit && speed > max) {
			let f = decay(PHYSICS.overSpeedDamping, dt);
			if (speed > 3 * max)
				f /= 3;
			this.vx *= f;
			this.vy *= f;
		}

		if (this.type === BallType.RED)
			this.attractReds(dt, game);
	}

	/** Moves in sub-steps, testing the holes and the collisions. */
	move(dt, game) {
		const dx = this.vx * dt;
		const dy = this.vy * dt;
		const steps = 1 + Math.floor(Math.hypot(dx, dy) / MAX_SUBSTEP);
		const colliders = game.colliders();

		for (let i = 0; i < steps; i++) {
			this.x += dx / steps;
			this.y += dy / steps;
			collideBall(this, colliders, game);
			game.room.touchBeams(this, game);
			if (this.testHole(dt / steps, game))
				return;
		}
	}

	/** The red ball attracts the red pastilles within 200 pixels. */
	attractReds(dt, game) {
		for (const e of game.room.entities) {
			if (e.itemType !== Item.RED || e.taken)
				continue;
			const dx = this.x - e.x;
			const dy = this.y - e.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < 200 * 200 && d2 > 1) {
				// (original : 150 / distance pixels per frame)
				const pull = 150 * 40 * dt / d2;
				e.x += dx * pull;
				e.y += dy * pull;
			}
		}
	}

	/** Fakes the rolling : each spot turns around the ball with the speed. */
	roll(dt) {
		for (const s of this.spots) {
			s.art.update(dt);
			// (original : 10 x the speed per frame, on a circle of 628 = 2 PI x 100)
			s.u = (s.u + this.vx * dt * 0.1) % TAU;
			s.v = (s.v + this.vy * dt * 0.1) % TAU;
		}
	}

	// ----- holes -----

	/**
	 * Holes are 40 x 40 tiles of the room. On a hole, the ball is pulled toward
	 * the middle of the hole, away from the edges touching the floor. Once it
	 * is far enough from those edges, it falls. The blue ball jumps instead.
	 * Returns true when the ball starts falling.
	 */
	testHole(dt, game) {
		const tiles = game.room.tiles;
		const tx = Math.floor((this.x - TILE_ORIGIN) / TILE);
		const ty = Math.floor((this.y - TILE_ORIGIN) / TILE);
		const isHole = (x, y) => tiles.get(x, y) === Item.HOLE;

		if (!isHole(tx, ty) || this.jump) {
			this.justLanded = false;
			return false;
		}

		const cx = TILE_ORIGIN + (tx + 0.5) * TILE;
		const cy = TILE_ORIGIN + (ty + 0.5) * TILE;
		const half = TILE / 2;
		const R = this.radius;

		// the ball speeds up on a hole
		const boost = decay(PHYSICS.holeBoost, dt);
		this.vx *= boost;
		this.vy *= boost;

		// the edges of this tile that touch the floor, on the ball's side
		let left = this.x < cx && !isHole(tx - 1, ty);
		let right = this.x > cx && !isHole(tx + 1, ty);
		let up = this.y < cy && !isHole(tx, ty - 1);
		let down = this.y > cy && !isHole(tx, ty + 1);
		if (left && right && up && down)
			left = right = up = down = false;

		const pull = PHYSICS.holePull * dt;
		if (left) this.vx += pull;
		if (right) this.vx -= pull;
		if (up) this.vy += pull;
		if (down) this.vy -= pull;

		const inside =
			this.x > cx - half + (left ? R : 0) &&
			this.x < cx + half - (right ? R : 0) &&
			this.y > cy - half + (up ? R : 0) &&
			this.y < cy + half - (down ? R : 0);

		if (inside) {
			this.startFall("hole", 1, game.room.holeClip());
			return true;
		}
		if (this.type === BallType.BLUE && !this.justLanded)
			this.jump = { size: 0, way: 1 };
		return false;
	}

	/** The blue ball's jump : it goes up and down in ~0.17 s, higher when fast. */
	updateJump(dt) {
		const j = this.jump;
		if (!j) {
			this.height = 0;
			return;
		}
		// (original : 60 per frame up to 200, then back to 0)
		j.size += j.way * 60 * 40 * dt;
		if (j.size > 200)
			j.way = -1;
		if (j.size < 0) {
			this.jump = null;
			this.height = 0;
			this.justLanded = true;
			return;
		}
		this.height = Math.sqrt(Math.max(0, j.size * this.speed / 40)) / 6;
	}

	// ----- falling and dying -----

	/**
	 * Starts falling : the ball shrinks, clipped by `clip` (a function adding
	 * the visible area to a path), then game.ballFell(kind) is called.
	 */
	startFall(kind, speed, clip) {
		this.fall = { kind, scale: 1, speed, clip };
		this.jump = null;
		this.height = 0;
		this.invulnerable = 0;
	}

	/** Killed (death bumper, laser, boss...). Ignored while invulnerable. */
	die() {
		if (this.invulnerable > 0 || this.fall)
			return false;
		this.vx = 0;
		this.vy = 0;
		this.startFall("death", 5, null);
		return true;
	}

	updateFall(dt, game) {
		const f = this.fall;
		const k = decay(0.9, dt);
		this.vx *= k;
		this.vy *= k;
		this.x += this.vx * dt / 5;
		this.y += this.vy * dt / 5;
		f.scale *= decay(Math.pow(0.92, f.speed), dt);
		if (f.scale >= 0.03)
			return;
		this.fall = null;
		game.ballFell(f.kind);
	}

	/** Back to the entrance of the room, blinking. */
	respawn() {
		this.placeAt(this.spawnX, this.spawnY);
		this.fall = null;
		this.jump = null;
		this.height = 0;
		this.invulnerable = INVULNERABLE_TIME;
	}

	// ----- drawing -----

	renderShadow(ctx) {
		if (this.hidden || this.fall)
			return;
		drawClip(ctx, shadowClip || (shadowClip = clip("shadow")), this.x + 3, this.y + 3);
	}

	render(ctx) {
		if (this.hidden)
			return;
		// blinking while invulnerable
		if (this.invulnerable > 0 && Math.floor(this.invulnerable * 40) % 2 === 0)
			ctx.globalAlpha = 0.3;
		else if (this.invulnerable > 0)
			ctx.globalAlpha = 0.6;

		ctx.save();
		if (this.fall && this.fall.clip) {
			ctx.beginPath();
			this.fall.clip(ctx);
			ctx.clip();
		}
		// (original : x / y scale 100 % + 3 % per pixel of jump)
		const scale = (this.fall ? this.fall.scale : 1) * (1 + this.height * 0.03);
		ctx.translate(this.x, this.y - this.height);
		ctx.scale(scale, scale);
		drawBall(ctx, this.type, 1, this.spots);
		ctx.restore();
		ctx.globalAlpha = 1;
	}
}

let shadowClip = null;
const marbles = [];
let light = null;

/**
 * A ball, centred on (0, 0) (also used by the menus) : the "marble" symbol
 * (a frame per colour), the rolling stones clipped to its "round" mask
 * (radius 12), and the "light" reflection on top. `scale` : 1 = the size of
 * the game's ball.
 */
export function drawBall(ctx, type, scale = 1, spots = null) {
	const marble = marbles[type] || (marbles[type] = clip("marble"));
	marble.gotoAndStop(type);
	ctx.save();
	if (scale !== 1)
		ctx.scale(scale, scale);
	marble.draw(ctx);

	if (spots && spots.length) {
		ctx.save();
		ctx.beginPath();
		ctx.arc(0, 0, 12, 0, TAU);
		ctx.clip();
		for (const s of spots) {
			// (original : alpha = 50 + (xc + yc) x ray / BALL_RAYSIZE x 50 %)
			const front = Math.cos(s.u + Math.PI / 2) + Math.cos(s.v + Math.PI / 2);
			const alpha = 0.5 + front * (s.ray / BALL_RADIUS) * 0.5;
			if (alpha <= 0.01)
				continue;
			ctx.save();
			ctx.globalAlpha *= Math.min(1, alpha);
			ctx.translate(Math.cos(s.u) * s.ray / 2, Math.sin(s.v) * s.ray / 2);
			ctx.rotate(s.rotation);
			s.art.draw(ctx);
			ctx.restore();
		}
		ctx.restore();
	}
	(light || (light = clip("light"))).draw(ctx);
	ctx.restore();
}
