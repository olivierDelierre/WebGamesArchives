/**
 * The elemental snakes, bosses of the adventures 1 to 4.
 *
 * The snake is a chain of parts following the path of its head : the head
 * records its path (one point per pixel), and each part is placed further
 * back on that path.
 *
 * To hurt it, hit its head from the front while it is calm (green eyes) :
 * it loses a ring of its body and gets angry (red eyes) for a few seconds.
 * With only the head and the tail left, it goes berserk (yellow eyes) for
 * 10 seconds, then dies. Its tail kills the ball. It also casts the power of
 * its element (powers.js).
 */

import { WIDTH as W, HEIGHT as H, BALL_RADIUS } from "../config.js";
import { Boss, ARENA } from "./common.js";
import { Water, Fire, Earth, Wind } from "./powers.js";
import { Entity, Layer } from "../game/entity.js";
import { angleDiff, decay, weightedIndex, randInt, TAU } from "../engine/math.js";
import { clip } from "../gfx/xfl/index.js";
import { app } from "../app.js";

/** The elements, in the order of the adventures. */
export const Element = Object.freeze({ WATER: 0, FIRE: 1, WIND: 2, EARTH: 3 });

const ELEMENTS = [
	{ power: Water, max: 2, sound: "water" },
	{ power: Fire, max: 3, sound: "crash" },
	{ power: Wind, max: 1, sound: "wind" },
	{ power: Earth, max: 3, sound: "earth" }
];

/** Body rings = hits needed. */
const RINGS = 3;

/** What the snake does, and how likely each thing is, [angry, calm]. */
const STATES = ["wait", "search", "charge", "evade", "power"];
const STATE_WEIGHTS = { angry: [1, 5, 2, 2, 5], calm: [2, 0, 0, 10, 2] };

/** The original tuning was per frame : x 40 per second. */
const PER_SECOND = 40;

export class Snake extends Boss {

	constructor(game, element) {
		super(W / 2, H / 2);
		this.element = ELEMENTS[element];
		this.elementIndex = element;
		this.powers = [];
		this.push = 3;               // strength of the push on the ball (px / frame^2)
		this.angle = 0;
		this.speed = 0;              // px/s
		this.targetSpeed = 0;
		this.accel = 1.05;           // speed x accel per frame when accelerating
		this.turn = 0.03;            // rad per frame
		this.state = "wait";
		this.timer = 0;
		this.angry = 0;              // seconds of anger left after a hit
		this.berserk = 0;            // seconds left before dying
		this.dying = false;
		this.bite = 0;               // bite animation of the head
		this.againstWall = false;
		this.idleClock = 0;

		// the parts : head, rings, tail. `r` = half the space it takes on the path.
		this.parts = [];
		for (let i = 0; i < RINGS + 2; i++) {
			const kind = i === 0 ? "head" : i === RINGS + 1 ? "tail" : "ring";
			this.parts.push({ kind, r: kind === "head" ? 20 : 25, scale: 1, x: this.x, y: this.y, angle: 0, spin: 0, art: this.makePartArt(kind, element) });
		}
		this.resizeRings();
		this.path = [{ x: this.x, y: this.y, a: 0 }];
		this.scales = [];            // scales flying away from a lost ring

		game.room.add(new ElementLogo(element));
		this.choose(game);
		for (let i = 0; i < 5; i++)
			this.update(1 / 40, game);
	}

	angleToBall(ball = this.ball) {
		return Math.atan2(ball.y - this.y, ball.x - this.x);
	}

	/** The rings get smaller toward the tail. */
	resizeRings() {
		const n = this.parts.length;
		for (let i = 1; i < n - 1; i++) {
			const s = 1 - i / n;
			this.parts[i].scale = s;
			this.parts[i].r = s * 50;
		}
	}

	/**
	 * A part : the "snake" symbol, frame head / ring / tail, its "gfx" at the
	 * frame of the element (the head's skull "crane" too).
	 */
	makePartArt(kind, element) {
		const art = clip("snake");
		art.gotoAndStop(kind === "head" ? 0 : kind === "ring" ? 1 : 2);
		art.child("gfx")?.gotoAndStop(element);
		art.child("crane")?.gotoAndStop(element);
		return art;
	}

	/** The eyes "o1", "o2" : red when angry, green when calm, yellow when berserk. */
	get eyes() {
		return this.berserk > 0 ? 2 : this.angry > 0 ? 0 : 1;
	}

	// ----- every step -----

	update(dt, game) {
		this.ball = game.ball;
		this.powers = this.powers.filter(p => !p.dead);
		this.updateScales(dt);
		for (const p of this.parts)
			p.art.update(dt);
		this.bite = Math.max(0, this.bite - dt);

		if (this.dying) {
			this.updateDeath(dt, game);
			return;
		}

		// anger fades
		if (this.berserk === 0 && this.angry > 0) {
			this.angry -= dt;
			if (this.angry <= 0) {
				this.angry = 0;
				this.choose(game);
			}
		}

		// the end of the berserk time : it dies
		if (this.berserk > 0 && !game.ball.falling) {
			this.berserk -= dt;
			if (this.berserk <= 0) {
				this.berserk = 0;
				this.powers.forEach(p => p.destroy());
				this.dying = true;
				game.invincible = true;
			}
		}

		this.timer -= dt;
		if (this.timer <= 0)
			this.choose(game);

		this.updateSpeed(dt);
		this.steer(dt, game);
		this.move(dt, game);
		this.placeParts(dt);
	}

	/** Brakes smoothly, or accelerates by `accel` (from 1 px/frame). */
	updateSpeed(dt) {
		if (this.speed > this.targetSpeed) {
			this.speed = Math.max(this.targetSpeed, this.speed * decay(0.97, dt));
		} else if (this.speed < this.targetSpeed) {
			this.speed = Math.min(this.targetSpeed, Math.max(PER_SECOND, this.speed) * decay(this.accel, dt));
		}
	}

	/** Turns according to the state. */
	steer(dt, game) {
		const turnTo = target => {
			const diff = angleDiff(this.angle, target);
			this.angle += Math.sign(diff) * this.turn * PER_SECOND * dt;
		};
		switch (this.state) {
		case "search":
			turnTo(this.angleToBall());
			break;
		case "evade":
			turnTo(this.angleToBall() + Math.PI);
			break;
		case "recall":
			// turning away from a wall
			this.turn *= decay(0.97, dt);
			if (Math.abs(this.turn) < 0.1)
				this.turn = Math.sign(this.turn) * 0.1;
			this.angle += this.turn * PER_SECOND * dt;
			if (!this.againstWall)
				this.choose(game);
			break;
		}
	}

	/** Moves the head pixel by pixel, recording its path, colliding with the ball. */
	move(dt, game) {
		let distance = this.speed * dt;
		if (distance <= 0) {
			this.collide(game);
			// still : the body slowly gathers behind the head (a point per original frame)
			this.idleClock += dt;
			if (this.idleClock >= 1 / 40) {
				this.idleClock = 0;
				this.path.push({ x: this.x, y: this.y, a: this.angle });
			}
		}
		while (distance > 0) {
			const step = Math.min(distance, 1);
			distance -= 1;
			this.x += Math.cos(this.angle) * step;
			this.y += Math.sin(this.angle) * step;
			this.keepInside();
			this.path.push({ x: this.x, y: this.y, a: this.angle });
			this.collide(game);
		}
		// only the recent path is needed
		if (this.path.length > 2000)
			this.path.splice(0, this.path.length - 1000);
	}

	/** Keeps the head away from the walls ; hitting one makes it turn away. */
	keepInside() {
		const m = 60;
		const x = Math.max(ARENA.minX + m, Math.min(ARENA.maxX - m, this.x));
		const y = Math.max(ARENA.minY + m, Math.min(ARENA.maxY - m, this.y));
		this.againstWall = x !== this.x || y !== this.y;
		this.x = x;
		this.y = y;
		if (this.againstWall && this.state !== "recall") {
			this.turn = randInt(2) === 0 ? 0.3 : -0.3;
			this.state = "recall";
			this.timer = 1;
		}
	}

	/** Places each part further back on the path of the head. */
	placeParts(dt) {
		let p = this.path.length - 1 + this.parts[0].r;
		const k = 1 - decay(1 - (this.angry > 0 ? 0.4 : 0.3), dt);
		for (const part of this.parts) {
			p -= part.r;
			const pos = this.path[Math.max(0, Math.floor(p))];
			part.x = pos.x;
			part.y = pos.y;
			part.angle += angleDiff(part.angle, pos.a) * k;
			p -= part.r;
		}
	}

	// ----- the ball -----

	collide(game) {
		const ball = game.ball;
		if (ball.falling)
			return;

		// the head : hurt when hit from the front while calm
		const head = this.parts[0];
		if (this.inEllipse(head, ball, 42, 34, 0)) {
			if (Math.abs(angleDiff(this.angle, this.angleToBall())) < 0.3) {
				this.bite = 0.25;
				this.parts[0].art.child("crane")?.child("anim")?.play();
				if (this.angry === 0)
					this.loseRing(game);
				this.angry = 6 + randInt(4);
			}
			this.pushBall(head);
			return;
		}

		// the tail : kills
		const tail = this.parts[this.parts.length - 1];
		if (this.inEllipse(tail, ball, 40, 14, 12) && ball.invulnerable <= 0) {
			app.audio.play("death");
			ball.die();
			return;
		}

		// the body
		for (let i = 1; i < this.parts.length; i++) {
			const part = this.parts[i];
			const r = part.r + BALL_RADIUS / 2;
			if ((ball.x - part.x) ** 2 + (ball.y - part.y) ** 2 < r * r) {
				this.pushBall(part);
				return;
			}
		}
	}

	/**
	 * Is the ball in the ellipse (rx, ry) of a part ? `ox` moves the ellipse
	 * along the part. (The parts are drawn facing backward, see render.)
	 */
	inEllipse(part, ball, rx, ry, ox) {
		const a = part.angle + Math.PI;
		const dx = ball.x - part.x;
		const dy = ball.y - part.y;
		const lx = (dx * Math.cos(a) + dy * Math.sin(a)) / part.scale - ox;
		const ly = (-dx * Math.sin(a) + dy * Math.cos(a)) / part.scale;
		return lx * lx / (rx * rx) + ly * ly / (ry * ry) < 1;
	}

	pushBall(part) {
		const ball = this.ball;
		const d = Math.hypot(part.x - ball.x, part.y - ball.y) || 1;
		// (called once per pixel moved : the push is per original frame)
		ball.vx -= this.push * PER_SECOND * (part.x - ball.x) / d;
		ball.vy -= this.push * PER_SECOND * (part.y - ball.y) / d;
		app.audio.play("wall");
	}

	/** Loses the first ring : its scales fly away. */
	loseRing(game) {
		if (this.parts.length <= 2)
			return;
		const ring = this.parts[1];
		app.audio.play("touched");
		for (let i = 0; i < 5; i++) {
			const a = i * Math.PI / 2.5;
			const d = ring.r / 2 + Math.random() * ring.r / 2;
			const art = clip("snakePart");
			art.gotoAndStop(this.elementIndex);
			this.scales.push({ x: ring.x + Math.cos(a) * d, y: ring.y + Math.sin(a) * d, a, rot: Math.random() * TAU, size: 3, art });
		}
		this.parts.splice(1, 1);
		this.resizeRings();
		this.angry = 1;
		if (this.parts.length === 2)
			this.berserk = 10;
		this.choose(game, "charge");
	}

	updateScales(dt) {
		for (const s of this.scales) {
			s.x += Math.cos(s.a) * 400 * dt;
			s.y += Math.sin(s.a) * 400 * dt;
			s.rot += 3.5 * dt;
			s.size -= 6 * dt;
		}
		this.scales = this.scales.filter(s => s.size > 0.1);
	}

	// ----- behaviour -----

	choose(game, forced) {
		const angry = this.angry > 0 || this.berserk > 0;
		this.state = forced || STATES[weightedIndex(angry ? STATE_WEIGHTS.angry : STATE_WEIGHTS.calm)];
		this.accel = 1.05;
		this.turn = angry ? 0.05 : 0.03;

		switch (this.state) {
		case "wait":
			this.timer = 0.5;
			this.targetSpeed = 0;
			break;
		case "search":
			this.timer = 1 + Math.random();
			this.targetSpeed = 5 * PER_SECOND;
			break;
		case "charge":
			this.accel = 1.15;
			this.timer = 0.5;
			this.angle = this.angleToBall(game.ball);
			this.targetSpeed = 15 * PER_SECOND;
			break;
		case "evade":
			this.accel = 1.1;
			this.timer = 1 + Math.random();
			this.targetSpeed = (angry ? 8 : 4) * PER_SECOND;
			break;
		case "power":
			this.castPower(game);
			this.choose(game);
			return;
		}

		if (this.berserk > 0) {
			this.timer /= 2;
			this.targetSpeed *= 1.3;
			this.turn *= 2;
		}
	}

	castPower(game) {
		const e = this.element;
		if (this.powers.length >= e.max)
			return;
		this.ball = game.ball;
		app.audio.play(e.sound);
		const power = new e.power(this, false);
		this.powers.push(power);
		game.room.add(power);
	}

	// ----- death -----

	/** Every part spins and shrinks ; the game is won when they are gone. */
	updateDeath(dt, game) {
		let left = false;
		for (const p of this.parts) {
			p.spin += 30 * PER_SECOND * Math.PI / 180 * dt;
			p.scale -= dt;
			left = left || p.scale > 0;
		}
		if (!left) {
			this.dead = true;
			game.bossBeaten();
		}
	}

	// ----- drawing -----

	render(ctx) {
		const head = this.parts[0].art;
		for (const eye of ["o1", "o2"])
			head.child(eye)?.gotoAndStop(this.eyes);
		// from the tail to the head, so that the head is on top
		for (let i = this.parts.length - 1; i >= 0; i--) {
			const p = this.parts[i];
			if (p.scale <= 0)
				continue;
			ctx.save();
			ctx.translate(p.x, p.y);
			// the symbol faces left
			ctx.rotate(p.angle + Math.PI + p.spin);
			ctx.scale(p.scale, p.scale);
			p.art.draw(ctx);
			ctx.restore();
		}
		for (const s of this.scales) {
			ctx.save();
			ctx.translate(s.x, s.y);
			ctx.rotate(s.rot);
			ctx.scale(s.size, s.size);
			s.art.draw(ctx);
			ctx.restore();
		}
	}
}

/** The logo of the element, on the floor of the boss room. */
class ElementLogo extends Entity {

	/** ("logoBg" : a frame per element, placed by the symbol itself) */
	constructor(element) {
		super(0, 0, Layer.FLOOR);
		this.art = clip("logoBg");
		this.art.gotoAndStop(element);
		this.alpha = 0;
	}

	update(dt) {
		this.alpha = Math.min(1, this.alpha + dt);
	}

	render(ctx) {
		ctx.globalAlpha = this.alpha;
		this.art.draw(ctx);
		ctx.globalAlpha = 1;
	}
}
