/**
 * The elemental powers of the snakes (and of the final boss) :
 *   Water   a drop thrown at the ball : the floor becomes slippery ;
 *   Fire    a fire pillar left on the floor : touching it kills ;
 *   Earth   a bud : when the ball touches it, a vine ties the ball to it ;
 *   Wind    a whirlwind blowing the ball away.
 *
 * Each power is an entity added to the room. Its boss keeps a list of them to
 * limit how many are active ; `destroy()` ends a power early (the boss died).
 * `strong` powers are the final boss's : faster, curving drops, stronger wind.
 */

import { TILE, TILE_ORIGIN, WIDTH as W, HEIGHT as H, ORIGINAL_FPS } from "../config.js";
import { Entity, Layer } from "../game/entity.js";
import { clip } from "../gfx/xfl/index.js";
import { decay, dist, randInt, TAU } from "../engine/math.js";

const FRAME = 1 / ORIGINAL_FPS;

/**
 * Runs `step` at the rate of the original game (40 times per second),
 * whatever the simulation rate : used by the effects tuned per frame.
 */
class FrameClock {

	constructor() {
		this.time = 0;
	}

	run(dt, step) {
		this.time += dt;
		while (this.time >= FRAME) {
			this.time -= FRAME;
			step();
		}
	}
}

export class Power extends Entity {

	constructor(x, y, layer) {
		super(x, y, layer);
	}

	destroy() {
		this.dead = true;
	}
}

// ----- water -----

export class Water extends Power {

	constructor(boss, strong) {
		super(boss.x, boss.y, Layer.EFFECT);
		this.angle = boss.angleToBall();
		this.speed = 40;                     // px/s
		this.turn = strong ? 0.4 : 0;        // rad/s (the drop curves)
		this.accel = strong ? 1.03 : 1;      // speed x accel per frame
		this.wet = 0;                        // seconds of slippery floor left
		this.hit = false;
		this.drops = [];                     // the splash
		this.trail = [];                     // wet marks behind the ball
		this.clock = new FrameClock();
		this.art = clip("FXWater");
	}

	update(dt, game) {
		const ball = game.ball;
		this.art.update(dt);
		this.updateSplash(dt);

		if (this.hit) {
			this.wet -= dt;
			ball.water = this.wet > 0;
			// wet marks behind the ball
			this.clock.run(dt, () => {
				if (this.wet > 0 && !ball.falling && ball.speed > 20)
					// (original : a mark 0.3 x the speed long, every frame)
					this.trail.push({ x: ball.x + 2, y: ball.y + 2, a: Math.atan2(ball.vy, ball.vx) + Math.PI, len: ball.speed / 40 * 0.3, alpha: Math.min(this.wet, 1), art: clip("FXWaterQueue") });
			});
			if (this.wet <= 0 && this.drops.length === 0 && this.trail.length === 0) {
				ball.water = false;
				this.dead = true;
			}
			return;
		}

		// the drop flies
		this.angle += this.turn * dt;
		this.speed *= decay(this.accel, dt);
		this.x += Math.cos(this.angle) * this.speed * dt;
		this.y += Math.sin(this.angle) * this.speed * dt;
		if (this.x < -50 || this.y < -50 || this.x > W + 50 || this.y > H + 50) {
			this.dead = true;
			return;
		}
		if (dist(this.x, this.y, ball.x, ball.y) < 25)
			this.splash();
	}

	splash() {
		this.hit = true;
		this.wet = 10 + randInt(5);
		for (const dx of [-1, -2, 1, 2])
			this.drops.push({ x: this.x, y: this.y, vx: dx * 40, vy: -(3 + randInt(2)) * 40, size: 1, frame: randInt(3) });
	}

	updateSplash(dt) {
		for (const d of this.drops) {
			d.x += d.vx * dt;
			d.y += d.vy * dt;
			d.vy += 0.4 * 1600 * dt;
			d.size -= 2 * dt;
		}
		this.drops = this.drops.filter(d => d.size > 0.05);
		// ("FXWaterQueue" removes itself)
		for (const t of this.trail)
			t.art.update(dt);
		this.trail = this.trail.filter(t => !t.art.removed);
	}

	destroy() {
		this.wet = 0;
		if (!this.hit)
			this.dead = true;
	}

	/** "FXWater" (the drop), "FXWaterParticule" (the splash), "FXWaterQueue" (the marks). */
	render(ctx) {
		for (const t of this.trail) {
			ctx.save();
			ctx.translate(t.x, t.y);
			ctx.rotate(t.a);
			// (original : xscale = 3 x the speed in px / frame)
			ctx.scale(t.len * 10 / 100, 1);
			ctx.globalAlpha = t.alpha;
			t.art.draw(ctx);
			ctx.restore();
		}
		for (const d of this.drops) {
			const art = drop(d.frame);
			ctx.save();
			ctx.translate(d.x, d.y);
			ctx.scale(d.size, d.size);
			art.draw(ctx);
			ctx.restore();
		}
		if (this.hit)
			return;
		ctx.save();
		ctx.translate(this.x, this.y);
		this.art.draw(ctx);
		ctx.restore();
	}
}

/** The three frames of "FXWaterParticule" (still images, shared). */
const drops = [];
function drop(frame) {
	if (!drops[frame]) {
		drops[frame] = clip("FXWaterParticule");
		drops[frame].gotoAndStop(frame);
	}
	return drops[frame];
}

// ----- fire -----

/** A fire pillar : embers (harmless), then it burns for 10-20 s, then it dies down. */
export class Fire extends Power {

	constructor(boss) {
		super(boss.x, boss.y, Layer.OBJECT);
		this.age = 0;
		this.life = 10 + randInt(10);
		this.ending = -1;       // seconds since it started dying down
		// ("FXFire" : starts, loops while flLoopv, then dies down and removes itself)
		this.art = clip("FXFire");
		this.art.vars.flLoopv = true;
	}

	get burning() {
		return this.age > 0.375 && this.ending < 0;
	}

	update(dt, game) {
		this.age += dt;
		this.art.update(dt);
		if (this.ending >= 0) {
			this.art.vars.flLoopv = false;
			this.ending += dt;
			if (this.art.removed || this.ending > 1)
				this.dead = true;
			return;
		}
		if (this.age > this.life)
			this.ending = 0;

		const ball = game.ball;
		if (!this.burning || ball.falling || ball.invulnerable > 0)
			return;
		const dx = this.x - ball.x;
		const dy = this.y - ball.y;
		if (Math.sqrt(dx * dx + dy * dy / 3) < 15) {
			this.ending = 0;
			ball.die();
		}
	}

	destroy() {
		if (this.ending < 0)
			this.ending = 0;
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		this.art.draw(ctx);
		ctx.restore();
	}
}

// ----- earth -----

const VINE_SEGMENTS = 10;
const VINE_REST = 5;
const VINE_BREAK = 225;

/**
 * A bud on the floor, in the middle of the tile under the boss. When the
 * ball touches it, a vine (a chain of springs) ties the ball to it, until the
 * ball gets far enough to break it.
 */
export class Earth extends Power {

	constructor(boss) {
		const tx = Math.floor((boss.x - TILE_ORIGIN) / TILE);
		const ty = Math.floor((boss.y - TILE_ORIGIN) / TILE);
		super(TILE_ORIGIN + 1 + tx * TILE + TILE / 2, TILE_ORIGIN + 1 + ty * TILE + TILE / 2, Layer.ITEM);
		this.life = 10 + randInt(10);
		this.age = 0;
		this.vine = null;        // the segments { x, y, vx, vy } (px / frame)
		this.breaking = -1;      // the vine fades out
		this.withering = -1;
		this.clock = new FrameClock();
		// ("FXbourgeon" : grows, "explode" when it ties the ball, "death")
		this.art = clip("FXbourgeon");
		this.links = [];         // the "FXLiane" of the vine
	}

	update(dt, game) {
		this.age += dt;
		const ball = game.ball;
		this.art.update(dt);

		if (this.withering >= 0) {
			if (this.withering === 0)
				this.art.gotoAndPlay("death");
			this.withering += dt;
			if (this.art.removed || this.withering > 1)
				this.dead = true;
			return;
		}

		if (this.vine) {
			if (this.breaking >= 0) {
				this.breaking += dt;
				if (this.breaking > 0.25) {
					this.vine = null;
					this.withering = 0;
				}
				return;
			}
			this.clock.run(dt, () => this.pullVine(ball));
			if (dist(this.x, this.y, ball.x, ball.y) > VINE_BREAK || ball.falling)
				this.breaking = 0;
			return;
		}

		if (this.age > this.life) {
			this.withering = 0;
			return;
		}
		if (dist(this.x, this.y, ball.x, ball.y) < 30) {
			this.vine = [];
			this.links = [];
			for (let i = 0; i < VINE_SEGMENTS; i++) {
				this.vine.push({ x: this.x, y: this.y, vx: 0, vy: 0 });
				this.links.push(clip("FXLiane"));
			}
			this.art.gotoAndPlay("explode");
		}
	}

	/**
	 * One frame of the vine : every element is pulled toward the previous one
	 * (a spring, stiffer when stretched). The ball receives the pull too.
	 */
	pullVine(ball) {
		// the ball is the last element (its speed in pixels per frame)
		const b = { x: ball.x, y: ball.y, vx: ball.vx / 40, vy: ball.vy / 40 };
		const chain = this.vine.concat([b]);
		for (let i = 1; i < chain.length; i++) {
			const m = chain[i];
			const link = chain[i - 1];
			let dx = link.x - m.x;
			let dy = link.y - m.y;
			const d = Math.hypot(dx, dy);
			if (d > VINE_REST) {
				const c = d / VINE_REST - 1;
				dx *= c * 0.01;
				dy *= c * 0.01;
				m.vx += dx;
				m.vy += dy;
				link.vx -= dx;
				link.vy -= dy;
			}
		}
		// the first segment is fixed on the bud ; the ball moves by itself
		for (let i = 1; i < this.vine.length; i++) {
			const m = this.vine[i];
			m.vx *= 0.95;
			m.vy *= 0.95;
			m.x += m.vx;
			m.y += m.vy;
		}
		ball.vx = b.vx * 40;
		ball.vy = b.vy * 40;
	}

	destroy() {
		if (this.vine && this.breaking < 0)
			this.breaking = 0;
		else if (!this.vine && this.withering < 0)
			this.withering = 0;
	}

	render(ctx, game) {
		ctx.save();
		ctx.translate(this.x, this.y);
		this.art.draw(ctx);
		ctx.restore();

		// the vine : each "FXLiane" turned toward the next one, its "liane" stretched
		if (this.vine) {
			ctx.save();
			// (original : -10 % alpha per frame when it breaks)
			ctx.globalAlpha = this.breaking < 0 ? 1 : Math.max(0, 1 - this.breaking / 0.25);
			const points = this.vine.concat([game.ball]);
			for (let i = 0; i < this.vine.length; i++) {
				const a = points[i];
				const b = points[i + 1];
				const link = this.links[i];
				link.set("liane", { xscale: Math.hypot(b.x - a.x, b.y - a.y) / 100 });
				ctx.save();
				ctx.translate(a.x, a.y);
				ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
				link.draw(ctx);
				ctx.restore();
			}
			ctx.restore();
		}
	}
}

// ----- wind -----

/** A whirlwind growing from the boss for 2 seconds, pushing the ball away from its centre. */
export class Wind extends Power {

	constructor(boss, strong, delay = 0) {
		super(boss.x, boss.y, Layer.BOSS);
		this.radius = -delay;      // a negative radius delays the whirlwind
		this.angle = 0;
		this.time = 2;
		this.strength = strong ? 30 : 10;
		// the 5 "FXWind" turning around (their previous position gives their direction)
		this.gusts = [0, 1, 2, 3, 4].map(i => ({ a: TAU * i / 5, ox: this.x, oy: this.y, rot: 0, art: clip("FXWind") }));
	}

	update(dt, game) {
		// (original : the radius grows by 5 px, the angle by 1/12 rad per frame)
		this.radius += 200 * dt;
		this.angle += 40 / 12 * dt;
		this.time -= dt;
		if (this.time < 0) {
			this.dead = true;
			return;
		}

		const ball = game.ball;
		let dx = this.x - ball.x;
		let dy = this.y - ball.y;
		const d = Math.max(10, Math.hypot(dx, dy));
		if (d < this.radius) {
			// (original : strength / sqrt(distance) px per frame^2)
			const push = this.strength / Math.sqrt(d) * 1600 * dt;
			ball.vx -= dx / d * push;
			ball.vy -= dy / d * push;
		}
	}

	render(ctx) {
		if (this.radius <= 0)
			return;
		const scale = Math.min(this.radius, 100) / 100;
		for (const g of this.gusts) {
			const a = g.a + this.angle;
			const x = this.x + Math.cos(a) * this.radius;
			const y = this.y + Math.sin(a) * this.radius;
			if (x !== g.ox || y !== g.oy)
				g.rot = Math.atan2(y - g.oy, x - g.ox);
			g.ox = x;
			g.oy = y;
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(g.rot);
			ctx.scale(scale, scale);
			g.art.draw(ctx);
			ctx.restore();
		}
	}
}
