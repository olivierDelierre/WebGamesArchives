/**
 * The octopus, boss of the Challenge mode.
 *
 * It sleeps a moment, then alternates between jumping toward the ball and
 * an attack chosen at random :
 *   - one big jump that breaks the floor (new holes spreading from the
 *     lower corners) ;
 *   - sucking the ball : if it catches it, it eats it and spits it out ;
 *   - a shout (nothing) ;
 *   - throwing its eye at the ball. This is the only way to hurt it : hit
 *     the eye with the ball to send it back into the octopus.
 * After 3 hits it goes mad (many fast jumps), then dies.
 *
 * The ball has no speed limit during the fight (the octopus throws it hard).
 */

import { WIDTH as W, HEIGHT as H, TILES_X, TILES_Y } from "../config.js";
import { Boss, breakFloor, ARENA } from "./common.js";
import { clip, drawClip } from "../gfx/xfl/index.js";
import { angleDiff, dist2, decay, randInt, TAU } from "../engine/math.js";
import { app } from "../app.js";

/** The original counted its waits in units of 25 frames. */
const U = 25 / 40;

export class Octopus extends Boss {

	constructor(game) {
		super(W / 2, H / 2);
		this.hits = 0;
		this.alpha = 0;
		this.jumpNext = false;      // alternates the jumps and the attacks
		this.jumpHeight = 0;
		this.eye = null;            // the thrown eye
		this.hurt = 0;              // red flash time left

		// what it does : a "state" with its own fields (see the update* methods)
		this.state = { name: "sleep", time: 5 * U, then: "attack" };

		// animation
		this.anim = { name: "sleep", time: 0 };
		this.pupil = { x: 0, y: 0 };
		this.pincers = 0;           // opening angle, degrees
		this.suction = 0;           // size of the suction effect
		this.particles = null;
		this.art = clip("boss");
		this.art.gotoAndStop("dodo");

		game.ball.speedLimit = false;
		app.audio.play("bossDeath");
	}

	/**
	 * The animations of the "boss" symbol (Boss.as) : sleep = "dodo",
	 * suck = "aspire" (loops), eat, spit = "throw", eyeless = "looseEye",
	 * newEye, death ; the others show "normal".
	 */
	play(anim) {
		this.anim = { name: anim, time: 0 };
		const a = this.art;
		switch (anim) {
		case "sleep": a.gotoAndStop("dodo"); break;
		case "suck": a.gotoAndPlay("aspire"); break;
		case "eat": a.gotoAndPlay("eat"); break;
		case "spit": a.gotoAndPlay("throw"); break;
		case "eyeless": a.gotoAndPlay("looseEye"); break;
		case "newEye": a.gotoAndPlay("newEye"); break;
		case "death": a.gotoAndPlay("death"); break;
		default:
			a.gotoAndStop("normal");
		}
	}

	// ----- every step -----

	update(dt, game) {
		this.anim.time += dt;
		this.updateArt(dt);
		this.alpha = Math.min(1, this.alpha + dt * 4);
		this.lookAt(game.ball, dt);

		if (this.particles) {
			this.updateDeath(dt, game);
			return;
		}
		if (this.eye)
			this.updateEye(dt, game);
		if (this.hurt > 0) {
			this.hurt -= dt;
			if (this.hurt <= 0 && this.hits >= 4)
				this.die(game);
			return;
		}

		const s = this.state;
		switch (s.name) {
		case "sleep":
		case "wait":
			this.updateWait(dt, game);
			break;
		case "jumps":
			this.updateJumps(dt, game);
			break;
		case "suck":
			this.updateSuck(dt, game);
			break;
		case "shoot":
			this.collide(dt, game);
			break;
		}

		if (s.name !== "suck") {
			this.pincers *= decay(0.6, dt);
			this.suction *= decay(0.8, dt);
		}
	}

	/** Waiting (and asleep at the start : it wakes up a bit before the end). */
	updateWait(dt, game) {
		const s = this.state;
		s.time -= dt;
		this.collide(dt, game);
		if (s.name === "sleep" && s.time <= 3 * U && this.anim.name === "sleep") {
			this.play("normal");
			const eye = this.art.child("oeil");
			if (eye)
				eye.gotoAndPlay("close");
		}
		if (s.time <= 0)
			s.then === "attack" ? this.nextPattern(game) : s.then(game);
	}

	/** The next pattern : jumps and attacks in turn. */
	nextPattern(game) {
		this.jumpHeight = 0;
		this.jumpNext = !this.jumpNext;

		if (this.jumpNext) {
			// jumps toward the ball (many, fast, when it is angry after the 3rd hit)
			let count = 3 + this.hits * 2;
			if (this.hits === 3) {
				count *= 5;
				this.hits++;
			}
			app.audio.play("bossJump");
			this.play("normal");
			this.state = {
				name: "jumps", count, breaks: 0, time: 0,
				height: 75 - this.hits * 10, speed: 300,
				turn: (0.1 + 0.02 * this.hits) * 40, move: (2 + this.hits * 1.5) * 40,
				angle: Math.atan2(game.ball.y - this.y, game.ball.x - this.x)
			};
			return;
		}

		if (this.hits >= 4) {
			this.hurt = U;
			return;
		}

		switch (randInt(8)) {
		case 0:
		case 1:
			// one big jump breaking the floor
			app.audio.play("bossJump");
			this.state = {
				name: "jumps", count: 1, breaks: 1 + randInt(3), time: 0,
				height: 300, speed: 1500, turn: (0.1 + 0.02 * this.hits) * 40, move: 10 * 40,
				angle: Math.atan2(game.ball.y - this.y, game.ball.x - this.x)
			};
			break;
		case 2:
		case 3:
			this.state = {
				name: "wait", time: (1 + Math.random()) * U,
				then: () => {
					this.play("suck");
					this.state = { name: "suck", time: (2 + 0.5 * this.hits) * U };
				}
			};
			break;
		case 4:
			// just a shout
			app.audio.play("bossDeath");
			this.state = { name: "wait", time: 0.5 * U, then: "attack" };
			break;
		default:
			this.state = {
				name: "wait", time: (0.7 + Math.random()) * U,
				then: g => this.throwEye(g)
			};
		}
	}

	/** Jumps toward the ball, bouncing on the walls. The last landing may break the floor. */
	updateJumps(dt, game) {
		const s = this.state;
		s.time += dt;
		this.jumpHeight = s.height * Math.sin(s.time * s.speed / s.height);
		if (this.jumpHeight < 10)
			this.collide(dt, game);

		if (this.jumpHeight < 0) {
			// landing
			this.jumpHeight = 0;
			s.time = 0;
			s.count--;
			for (; s.breaks > 0; s.breaks--) {
				app.audio.play("crash");
				this.breakFloor(game);
			}
			if (s.count === 0) {
				this.nextPattern(game);
				return;
			}
			app.audio.play("bossJump");
		}

		// turn toward the ball, and move
		const toBall = Math.atan2(game.ball.y - this.y, game.ball.x - this.x);
		const diff = angleDiff(s.angle, toBall);
		const step = s.turn * dt;
		s.angle = Math.abs(diff) > step ? s.angle + Math.sign(diff) * step : toBall + (randInt(3) - 1) / 100;
		this.x += Math.cos(s.angle) * s.move * dt;
		this.y += Math.sin(s.angle) * s.move * dt;

		const x = Math.max(ARENA.minX, Math.min(ARENA.maxX, this.x));
		const y = Math.max(ARENA.minY, Math.min(ARENA.maxY, this.y));
		if (x !== this.x || y !== this.y) {
			s.angle += Math.PI * 3 / 4 + randInt(45) * Math.PI / 180;
			this.x = x;
			this.y = y;
		}
	}

	/** A new hole, at the end of a random walk from a lower corner hole. */
	breakFloor(game) {
		const tiles = game.room.tiles;
		let tx = randInt(2) === 0 ? 0 : TILES_X - 1;
		let ty = TILES_Y - 1;
		for (let n = 0; tiles.get(tx, ty) != null && n < 10000; n++) {
			switch (randInt(4)) {
			case 0: tx = Math.max(0, tx - 1); break;
			case 1: ty = Math.max(0, ty - 1); break;
			case 2: tx = Math.min(TILES_X - 1, tx + 1); break;
			default: ty = Math.min(TILES_Y - 1, ty + 1);
			}
		}
		breakFloor(game, tx, ty);
	}

	/** Sucks the ball in : if it gets it, eats it, then spits it out. */
	updateSuck(dt, game) {
		const s = this.state;
		const ball = game.ball;
		s.time -= dt;

		this.pincers = this.pincers * decay(0.6, dt) + 45 * (1 - decay(0.6, dt));
		this.suction = this.suction * decay(0.95, dt) + (1 + this.hits * 0.2) * (1 - decay(0.95, dt));

		if (ball.falling) {
			this.nextPattern(game);
			return;
		}

		const d2 = dist2(ball.x, ball.y, this.x, this.y);
		if (d2 < 500) {
			// caught
			ball.controlled = false;
			ball.placeAt(this.x, this.y + 22);
			ball.hidden = true;
			this.play("eat");
			this.state = { name: "wait", time: U, then: g => this.spit(g) };
			return;
		}

		// (original : (120 + 20 x hits) / distance^2 pixels per frame^2)
		const force = (120 + this.hits * 20) * 1600 * dt / d2;
		ball.vx += (this.x - ball.x) * force;
		ball.vy += (this.y - ball.y) * force;

		if (s.time <= 0)
			this.nextPattern(game);
	}

	spit(game) {
		const ball = game.ball;
		const a = (randInt(100) + 40) * Math.PI / 180;
		ball.hidden = false;
		ball.vx = 2400 * Math.cos(a);
		ball.vy = 2400 * Math.sin(a);
		ball.controlled = true;
		this.play("spit");
		this.state = { name: "wait", time: 0.5 * U, then: "attack" };
	}

	// ----- the eye -----

	throwEye(game) {
		app.audio.play("eye");
		this.play("eyeless");
		const ball = game.ball;
		const a = Math.atan2(ball.y - (this.y - 100), ball.x - this.x);
		const speed = (5 + this.hits * 1.5) * 40;
		this.eye = { x: this.x, y: this.y - 10, vx: speed * Math.cos(a), vy: speed * Math.sin(a), back: false };
		this.state = { name: "shoot" };
	}

	/**
	 * The eye flies ; the ball hitting it sends it back. If it comes back into
	 * the octopus, the octopus is hurt ; if it leaves the room, a new eye grows.
	 */
	updateEye(dt, game) {
		const eye = this.eye;
		const ball = game.ball;

		let d2 = dist2(ball.x, ball.y, eye.x, eye.y);
		if (!ball.falling && d2 < 38 * 38) {
			app.audio.play("wall");
			const d = Math.sqrt(d2) || 1;
			const eyeSpeed = (7 + this.hits * 1.5) * 40;
			eye.vx = eyeSpeed * (eye.x - ball.x) / d;
			eye.vy = eyeSpeed * (eye.y - ball.y) / d;
			const speed = Math.max(1000, ball.speed);
			ball.vx = speed * (ball.x - eye.x) / d;
			ball.vy = speed * (ball.y - eye.y) / d;
			eye.back = true;
		}

		if (eye.back && dist2(this.x, this.y - this.jumpHeight, eye.x, eye.y) < 50 * 50) {
			this.eye = null;
			this.hits++;
			this.hurt = U;
			app.audio.play("newEye");
			app.audio.play("bossDeath");
			this.play("newEye");
			this.state = { name: "wait", time: 0, then: "attack" };
			return;
		}

		eye.x += eye.vx * dt;
		eye.y += eye.vy * dt;
		if (eye.x < -30 || eye.y < -30 || eye.x > W + 30 || eye.y > H + 30) {
			this.eye = null;
			app.audio.play("newEye");
			this.play("newEye");
			this.state = { name: "wait", time: 0.5 * U, then: "attack" };
		}
	}

	// ----- contact -----

	/** Pushes the ball away when it touches the octopus (an elliptic shape). */
	collide(dt, game) {
		const ball = game.ball;
		if (ball.falling || ball.hidden)
			return;
		const dx = ball.x - this.x;
		const dy = ball.y - this.y;
		if (dx * dx + dy * dy * 2 < 2000) {
			// (original : 30 pixels per frame, every frame of contact)
			const a = Math.atan2(dy, dx);
			const push = 30 * 1600 * dt;
			ball.vx += push * Math.cos(a);
			ball.vy += push * Math.sin(a);
			app.audio.play("wall");
		}
	}

	// ----- death -----

	die(game) {
		app.audio.play("bossDeath");
		this.play("death");
		const ball = game.ball;
		ball.vx = 0;
		ball.vy = 0;
		ball.controlled = false;
		game.invincible = true;
		this.particles = [];
		for (let ring = 0; ring < 3; ring++) {
			for (let i = 0; i < 8; i++) {
				this.particles.push({
					angle: i / 8 * TAU + ring * 0.5,
					dist: 0,
					speed: (ring + 1) * 2.5 * 40,
					scale: 2 + ring * 0.5
				});
			}
		}
	}

	/** The blobs spiral out ; the game is won when they are gone. */
	updateDeath(dt, game) {
		for (const p of this.particles) {
			p.angle += 0.1 * p.speed / 5 * dt;
			p.dist += p.speed * dt;
			p.scale -= 5 / 100 * 40 * dt;
			p.x = this.x + Math.cos(p.angle) * p.dist;
			p.y = this.y + Math.sin(p.angle) * p.dist;
		}
		this.particles = this.particles.filter(p => {
			const w = 20 * p.scale;
			return p.scale > 0 && p.x > -w && p.y > -w && p.x < W + w && p.y < H + w;
		});
		if (this.particles.length === 0 && this.anim.time > 0.5) {
			this.particles = [];
			this.dead = true;
			game.bossBeaten();
		}
	}

	// ----- drawing -----

	/** The pupil follows the ball ; random blinks. */
	lookAt(ball, dt) {
		const a = Math.atan2(ball.y - this.y, ball.x - this.x);
		const x = Math.cos(a) * 28;
		const y = Math.sin(a) * 7 + 8 * Math.abs(Math.sin(a));
		const k = decay(0.9, dt);
		this.pupil.x = this.pupil.x * k + x * (1 - k);
		this.pupil.y = this.pupil.y * k + y * (1 - k);
		// (original : 1 chance in 40 per frame)
		if (this.anim.name !== "sleep" && Math.random() < dt) {
			const eye = this.art.child("oeil");
			if (eye)
				eye.play();
		}
	}

	/** Moves the parts of the symbol that the code drives (Boss.as). */
	updateArt(dt) {
		const a = this.art;
		a.update(dt);
		a.set("p1", { rotation: this.pincers });
		a.set("p2", { rotation: -this.pincers });
		a.set("souffle", { xscale: this.suction, yscale: this.suction });
		const p = this.pupil;
		a.set("p", { x: p.x, y: p.y, xscale: 1 - Math.abs(p.x) / 100, yscale: 1 - Math.abs(p.y) * 1.5 / 100 });
		// the body stretches with the jump
		const body = a.child("b");
		if (body)
			body.gotoAndStop(Math.max(0, Math.round(this.jumpHeight / 5) - 1));
		if (this.eyeArt)
			this.eyeArt.update(dt);
	}

	renderShadow(ctx) {
		if (this.particles && this.anim.time > 0.3)
			return;
		drawClip(ctx, shade || (shade = clip("boss shade")), this.x, this.y, 0, 1 + this.jumpHeight / 300, this.alpha);
	}

	render(ctx) {
		// the red of the hits (original : a red offset of 60 per hit, + 100 while hurt)
		const red = this.hits * 40 + Math.max(0, this.hurt / U) * 100;
		ctx.save();
		ctx.translate(this.x, this.y - this.jumpHeight);
		ctx.globalAlpha *= this.alpha;
		this.art.draw(ctx, red > 0 ? redOffset(red) : null);
		ctx.restore();

		if (this.eye) {
			const e = this.eyeArt || (this.eyeArt = clip("boss tir"));
			ctx.save();
			ctx.translate(this.eye.x, this.eye.y);
			e.draw(ctx, this.hits ? redOffset(this.hits * 40) : null);
			ctx.restore();
		} else {
			this.eyeArt = null;
		}
		if (this.particles) {
			const c = particle || (particle = clip("bossParticule"));
			for (const q of this.particles)
				drawClip(ctx, c, q.x, q.y, 0, q.scale);
		}
	}
}

let shade = null;
let particle = null;

/** A colour transform adding red. */
const redOffset = red => ({ am: 1, rm: 1, gm: 1, bm: 1, ao: 0, ro: Math.min(255, red), go: 0, bo: 0 });
