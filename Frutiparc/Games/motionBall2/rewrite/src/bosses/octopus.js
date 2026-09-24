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
import { Boss, drawTinted, breakFloor, ARENA } from "./common.js";
import { angleDiff, dist2, decay, randInt, TAU } from "../engine/math.js";
import { circle, sphere, text } from "../gfx/draw.js";
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
		this.blink = 0;
		this.pincers = 0;           // opening angle, degrees
		this.suction = 0;           // size of the suction effect
		this.particles = null;

		game.ball.speedLimit = false;
		app.audio.play("bossDeath");
	}

	play(anim) {
		this.anim = { name: anim, time: 0 };
	}

	// ----- every step -----

	update(dt, game) {
		this.anim.time += dt;
		this.alpha = Math.min(1, this.alpha + dt * 4);
		this.blink = Math.max(0, this.blink - dt);
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
			this.blink = 0.3;
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
		if (this.anim.name !== "sleep" && this.blink <= 0 && Math.random() < dt)
			this.blink = 0.3;
	}

	renderShadow(ctx) {
		if (this.particles && this.anim.time > 0.3)
			return;
		const s = 1 + this.jumpHeight / 300;
		ctx.fillStyle = "rgba(40,0,60," + 0.3 * this.alpha + ")";
		ctx.beginPath();
		ctx.ellipse(this.x, this.y + 28, 44 * s, 14 * s, 0, 0, TAU);
		ctx.fill();
	}

	render(ctx, game) {
		const a = this.anim;
		let scale = 1;
		let alpha = this.alpha;
		if (a.name === "death") {
			const k = Math.min(1, a.time / 1);
			scale = 1 + k * 0.6;
			alpha *= 1 - k;
		} else if ((a.name === "eat" || a.name === "spit") && a.time < 0.35) {
			scale = 1 + 0.13 * Math.sin(a.time / 0.35 * Math.PI);
		}

		if (alpha > 0) {
			ctx.globalAlpha = alpha;
			const redness = (this.hits * 40 + Math.max(0, this.hurt / U) * 100) / 255;
			drawTinted(ctx, this.x, this.y - this.jumpHeight, 70, this.hits || this.hurt > 0 ? redness : 0, c => {
				c.scale(scale, scale);
				this.drawBody(c);
			});
			ctx.globalAlpha = 1;
		}

		if (this.eye)
			drawThrownEye(ctx, this.eye, this.hits);
		if (this.particles)
			for (const p of this.particles)
				sphere(ctx, p.x, p.y, 10 * p.scale, "#c070f0", "#5a1a8a", "#f0d0ff");
	}

	drawBody(ctx) {
		const t = app.time * 5;
		const name = this.anim.name;

		// suction
		if (this.suction > 0.05) {
			ctx.strokeStyle = "rgba(255,255,255,0.5)";
			ctx.lineWidth = 2;
			for (let i = 0; i < 3; i++) {
				const k = (t * 0.5 + i / 3) % 1;
				ctx.beginPath();
				ctx.arc(0, 25, (60 - k * 50) * this.suction, 0.2 * Math.PI, 0.8 * Math.PI);
				ctx.stroke();
			}
		}

		// tentacles
		ctx.strokeStyle = "#7a36b0";
		ctx.lineCap = "round";
		for (let i = 0; i < 6; i++) {
			const bx = -30 + i * 12;
			const wave = Math.sin(t + i) * 6;
			ctx.lineWidth = 9 - Math.abs(i - 2.5);
			ctx.beginPath();
			ctx.moveTo(bx, 10);
			ctx.quadraticCurveTo(bx * 1.3 + wave, 30, bx * 1.5 - wave, 40 + (i % 2) * 4);
			ctx.stroke();
		}

		// pincers
		for (const side of [-1, 1]) {
			ctx.save();
			ctx.translate(side * 24, 18);
			ctx.rotate(-side * this.pincers * Math.PI / 180);
			ctx.fillStyle = "#d06ae0";
			ctx.strokeStyle = "#5a1a78";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(side * 16, 6, side * 10, 20);
			ctx.quadraticCurveTo(side * 4, 12, 0, 8);
			ctx.closePath();
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}

		// head
		const g = ctx.createRadialGradient(-12, -22, 5, 0, -5, 48);
		g.addColorStop(0, "#e2a4ff");
		g.addColorStop(0.5, "#a650dc");
		g.addColorStop(1, "#5a1a8a");
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(0, -6, 42, 34, 0, 0, TAU);
		ctx.fill();
		ctx.strokeStyle = "#4a1070";
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.fillStyle = "rgba(255,255,255,0.18)";
		for (const [x, y, r] of [[-26, -18, 5], [24, -22, 4], [30, 2, 3], [-30, 4, 3]]) {
			circle(ctx, x, y, r);
			ctx.fill();
		}

		this.drawEye(ctx, name);

		if (name === "sleep")
			text(ctx, "z", 30 + Math.sin(t) * 3, -40 - (t * 4 % 12), { size: 14, color: "#fff" });
	}

	drawEye(ctx, name) {
		if (this.eye || name === "eyeless") {
			ctx.fillStyle = "#3a0858";
			ctx.beginPath();
			ctx.ellipse(0, -6, 16, 13, 0, 0, TAU);
			ctx.fill();
			return;
		}
		const grow = name === "newEye" ? Math.min(1, this.anim.time / 0.25) : 1;
		ctx.save();
		ctx.translate(0, -6);
		ctx.scale(grow, grow);
		sphere(ctx, 0, 0, 16, "#ffffff", "#c8b8d8", "#ffffff");

		const p = this.pupil;
		ctx.save();
		ctx.translate(p.x * 0.3, p.y * 0.5);
		ctx.scale(Math.max(0.3, 1 - Math.abs(p.x) / 100), Math.max(0.3, 1 - Math.abs(p.y) * 1.5 / 100));
		sphere(ctx, 0, 0, 8, "#e0304a", "#6a0010");
		ctx.fillStyle = "#000";
		circle(ctx, 0, 0, 3.5);
		ctx.fill();
		ctx.restore();

		// eyelid : closed when asleep, or blinking
		const lid = name === "sleep" ? 1 : this.blink > 0 ? Math.sin(this.blink / 0.3 * Math.PI) : 0;
		if (lid > 0) {
			ctx.fillStyle = "#9a48cc";
			ctx.beginPath();
			ctx.ellipse(0, -16 + 16 * lid, 17, 16 * lid + 0.1, 0, Math.PI, TAU);
			ctx.rect(-17, -17, 34, 1 + 16 * lid);
			ctx.fill();
			if (lid === 1) {
				ctx.strokeStyle = "#4a1070";
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(0, -2, 12, 0.15 * Math.PI, 0.85 * Math.PI);
				ctx.stroke();
			}
		}
		ctx.restore();
	}
}

/** The thrown eye, looking where it goes. */
function drawThrownEye(ctx, eye, hits) {
	const a = Math.atan2(eye.vy, eye.vx);
	drawTinted(ctx, eye.x, eye.y, 16, hits * 40 / 255, c => {
		sphere(c, 0, 0, 13, "#ffffff", "#b8a8c8");
		sphere(c, Math.cos(a) * 5, Math.sin(a) * 5, 6, "#e0304a", "#6a0010");
		c.fillStyle = "#000";
		circle(c, Math.cos(a) * 6, Math.sin(a) * 6, 2.5);
		c.fill();
		c.strokeStyle = "rgba(200,40,60,0.5)";
		c.lineWidth = 1;
		for (let i = 0; i < 4; i++) {
			const b = a + Math.PI + (i - 1.5) * 0.4;
			c.beginPath();
			c.moveTo(Math.cos(b) * 12, Math.sin(b) * 12);
			c.lineTo(Math.cos(b) * 5, Math.sin(b) * 5);
			c.stroke();
		}
	});
}

