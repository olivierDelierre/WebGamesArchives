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
import { circle, sphere, shine } from "../gfx/draw.js";
import { decay, dist, randInt, TAU } from "../engine/math.js";
import { app } from "../app.js";

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
	}

	update(dt, game) {
		const ball = game.ball;
		this.updateSplash(dt);

		if (this.hit) {
			this.wet -= dt;
			ball.water = this.wet > 0;
			// wet marks behind the ball
			this.clock.run(dt, () => {
				if (this.wet > 0 && !ball.falling && ball.speed > 20)
					// (original : a mark 0.3 x the speed long, every frame)
					this.trail.push({ x: ball.x + 2, y: ball.y + 2, a: Math.atan2(ball.vy, ball.vx) + Math.PI, len: ball.speed / 40 * 0.3, age: 0, alpha: Math.min(this.wet, 1) });
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
			this.drops.push({ x: this.x, y: this.y, vx: dx * 40, vy: -(3 + randInt(2)) * 40, size: 1, r: 3 + randInt(3) });
	}

	updateSplash(dt) {
		for (const d of this.drops) {
			d.x += d.vx * dt;
			d.y += d.vy * dt;
			d.vy += 0.4 * 1600 * dt;
			d.size -= 2 * dt;
		}
		this.drops = this.drops.filter(d => d.size > 0.05);
		for (const t of this.trail)
			t.age += dt;
		this.trail = this.trail.filter(t => t.age < 0.25);
	}

	destroy() {
		this.wet = 0;
		if (!this.hit)
			this.dead = true;
	}

	render(ctx) {
		for (const t of this.trail) {
			ctx.save();
			ctx.translate(t.x, t.y);
			ctx.rotate(t.a);
			ctx.globalAlpha = 0.5 * (1 - t.age / 0.25) * t.alpha;
			ctx.fillStyle = "#6ac8ff";
			ctx.beginPath();
			ctx.ellipse(t.len / 2, 0, t.len / 2 + 2, 4, 0, 0, TAU);
			ctx.fill();
			ctx.restore();
		}
		for (const d of this.drops)
			sphere(ctx, d.x, d.y, d.r * d.size, "#9adcff", "#2a7ac8", "#fff");
		if (this.hit)
			return;

		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.fillStyle = "rgba(120,200,255,0.5)";
		circle(ctx, 0, 0, 13 + Math.sin(app.time * 8) * 2);
		ctx.fill();
		ctx.fillStyle = "#6ac8ff";
		ctx.beginPath();
		ctx.moveTo(0, -12);
		ctx.quadraticCurveTo(9, 0, 7, 5);
		ctx.arc(0, 5, 7, 0, Math.PI);
		ctx.quadraticCurveTo(-9, 0, 0, -12);
		ctx.fill();
		shine(ctx, 0, 3, 7, 0.8);
		ctx.restore();
	}
}

// ----- fire -----

/** A fire pillar : embers (harmless), then it burns for 10-20 s, then it dies down. */
export class Fire extends Power {

	constructor(boss) {
		super(boss.x, boss.y, Layer.OBJECT);
		this.age = 0;
		this.life = 10 + randInt(10);
		this.ending = -1;       // seconds since it started dying down
	}

	get burning() {
		return this.age > 0.375 && this.ending < 0;
	}

	update(dt, game) {
		this.age += dt;
		if (this.ending >= 0) {
			this.ending += dt;
			if (this.ending > 0.375)
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
		const t = app.time * 13;
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.fillStyle = "rgba(60,0,0,0.3)";
		ctx.beginPath();
		ctx.ellipse(0, 0, 16, 7, 0, 0, TAU);
		ctx.fill();

		if (this.age < 0.375) {
			ctx.fillStyle = "rgba(255," + (100 + this.age * 320) + ",0,0.8)";
			for (let i = 0; i < 5; i++) {
				circle(ctx, Math.cos(i * 1.3 + t) * 8, Math.sin(i * 1.3 + t) * 3, 2);
				ctx.fill();
			}
		} else {
			const height = this.ending < 0 ? 1 : 1 - this.ending / 0.375;
			const WIDTHS = [14, 10, 6];
			const HEIGHTS = [48, 38, 26];
			const COLORS = ["#ff4a10", "#ff9a20", "#ffe860"];
			for (let i = 0; i < 3; i++) {
				const w = WIDTHS[i] * (0.8 + 0.2 * Math.sin(t + i));
				const h = HEIGHTS[i] * height;
				ctx.fillStyle = COLORS[i];
				ctx.beginPath();
				ctx.moveTo(-w, 0);
				ctx.quadraticCurveTo(-w, -h * 0.5, Math.sin(t + i) * 4, -h);
				ctx.quadraticCurveTo(w, -h * 0.5, w, 0);
				ctx.ellipse(0, 0, w, w * 0.45, 0, 0, Math.PI);
				ctx.fill();
			}
		}
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
	}

	update(dt, game) {
		this.age += dt;
		const ball = game.ball;

		if (this.withering >= 0) {
			this.withering += dt;
			if (this.withering > 0.4)
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
			for (let i = 0; i < VINE_SEGMENTS; i++)
				this.vine.push({ x: this.x, y: this.y, vx: 0, vy: 0 });
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
		if (this.vine) {
			ctx.save();
			ctx.globalAlpha = this.breaking < 0 ? 1 : 1 - this.breaking / 0.25;
			const points = this.vine.concat([game.ball]);
			ctx.strokeStyle = "#5a8a1a";
			ctx.lineWidth = 4;
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);
			for (const p of points)
				ctx.lineTo(p.x, p.y);
			ctx.stroke();
			ctx.fillStyle = "#8ac040";
			for (let i = 0; i < points.length - 1; i++) {
				const a = points[i];
				const b = points[i + 1];
				ctx.save();
				ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
				ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
				ctx.beginPath();
				ctx.ellipse(0, -4, 4, 2, 0.5, 0, TAU);
				ctx.fill();
				ctx.restore();
			}
			ctx.restore();
		}

		// the bud
		let s = 1 + 0.08 * Math.sin(this.age / 0.225 * TAU);
		let alpha = 1;
		if (this.vine)
			s = 1.4;
		if (this.withering >= 0) {
			const k = Math.min(1, this.withering / 0.4);
			s = 1.4 - k * 1.2;
			alpha = 1 - k;
		}
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.globalAlpha = alpha;
		ctx.fillStyle = "rgba(60,30,0,0.35)";
		ctx.beginPath();
		ctx.ellipse(0, 4, 16 * s, 7 * s, 0, 0, TAU);
		ctx.fill();
		ctx.scale(s, s);
		ctx.fillStyle = "#6a9a2a";
		for (let i = 0; i < 4; i++) {
			ctx.save();
			ctx.rotate(i * Math.PI / 2 + (this.vine ? 0.4 : 0));
			ctx.beginPath();
			ctx.ellipse(0, -9, 5, 10, 0, 0, TAU);
			ctx.fill();
			ctx.restore();
		}
		sphere(ctx, 0, 0, 7, "#b8e070", "#3a6a10");
		ctx.restore();
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
		this.gusts = [0, 1, 2, 3, 4].map(i => ({ a: TAU * i / 5 }));
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
		const s = Math.min(this.radius, 100) / 100;
		ctx.save();
		ctx.strokeStyle = "rgba(255,255,255,0.8)";
		ctx.lineCap = "round";
		for (const g of this.gusts) {
			const a = g.a + this.angle;
			ctx.save();
			ctx.translate(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius);
			// oriented along the movement (tangent to the circle, outward)
			ctx.rotate(a + Math.PI / 2 - 0.3);
			ctx.scale(s, s);
			ctx.lineWidth = 3;
			ctx.beginPath();
			ctx.arc(-10, 12, 22, -1.6, -0.6);
			ctx.stroke();
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(-14, 18, 24, -1.5, -0.8);
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();
	}
}
