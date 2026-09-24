/**
 * "Tourneboule", the final boss of the 5th adventure.
 *
 * Its cycle (one state each) :
 *   land      comes down (0.5 s)
 *   wait      on the floor, vulnerable ; the first touch only pops its shield
 *   kata      3 katas of 0.6 s ; the first one shows the power to come, the
 *             last one casts it (wind, fire, water, earth, broken floor, a new
 *             block)
 *   takeoff / fly    flies a few loops
 *   hidden    invisible, it flies to a random place (the violet ball sees it)
 *   appear    a puff of smoke, then it lands again
 * Each touch while it is on the floor hurts it. After 4 hits it stops flying
 * and chains katas, each one hurting it a bit more ; at 20 it dies.
 */

import { WIDTH as W, HEIGHT as H, TILE, TILE_ORIGIN, TILES_X, TILES_Y } from "../config.js";
import { BallType, Item } from "../data/enums.js";
import { Boss, drawTinted, CrackingTile, breakFloor } from "./common.js";
import { Water, Fire, Earth, Wind } from "./powers.js";
import { Effect, Layer } from "../game/entity.js";
import { dist, decay, randInt, TAU } from "../engine/math.js";
import { circle, sphere } from "../gfx/draw.js";
import { app } from "../app.js";

const HITS_TO_GROUND = 4;
const HITS_TO_DIE = 20;
const FLY_HEIGHT = 60;

const Power = { WIND: 0, FIRE: 1, WATER: 2, EARTH: 3, HOLES: 4, BLOCK: 5 };

/** Aura colour of each kata (the kata of a power has its colour). */
const KATA_COLORS = ["#e8fff0", "#ff6a2a", "#5ac8ff", "#b08a4a", "#b070ff", "#7ad84a"];

/** Angles of the two hands during each kata, k = 0..1. */
const KATA_HANDS = [
	k => [-Math.PI / 2 - k * 3, -Math.PI / 2 + k * 3],
	k => [k * TAU, Math.PI + k * TAU],
	k => [-0.3 - Math.sin(k * Math.PI) * 1.2, Math.PI + 0.3 + Math.sin(k * Math.PI) * 1.2],
	k => [Math.PI / 2 + Math.sin(k * TAU) * 1.5, Math.PI / 2 - Math.sin(k * TAU) * 1.5],
	k => [-Math.PI / 2 + Math.sin(k * 3 * Math.PI) * 0.8, Math.PI / 2 - Math.sin(k * 3 * Math.PI) * 0.8],
	k => [Math.PI + k * Math.PI, -k * Math.PI]
];

const KATA_TIME = 0.6;
const KATA_CAST = 0.35;     // when the last kata casts the power

export class Tourneboule extends Boss {

	constructor(game) {
		super(W / 2, H / 2);
		this.powers = [];
		this.hits = 0;
		this.hurt = 0;             // red flash time left (also : can't be hurt again)
		this.shield = false;       // up when it lands
		this.shieldFlash = 0;
		this.speed = 0;
		this.alpha = 1;
		this.spinTime = 0;
		this.holesMade = 0;
		this.blocksMade = 0;
		this.previousKata = -1;
		this.set("land");
	}

	/** Changes state ; `data` gives the fields of the new state. */
	set(name, data = {}) {
		this.state = { name, time: 0, ...data };
	}

	angleToBall() {
		return Math.atan2(this.ball.y - this.y, this.ball.x - this.x);
	}

	// ----- every step -----

	update(dt, game) {
		this.ball = game.ball;
		this.powers = this.powers.filter(p => !p.dead);
		this.spinTime += dt;
		this.shieldFlash = Math.max(0, this.shieldFlash - dt * 5);
		this.hurt = Math.max(0, this.hurt - dt);

		const s = this.state;
		s.time += dt;
		switch (s.name) {
		case "land":
			if (s.time >= 0.5)
				this.startWait();
			break;
		case "wait":
			this.collide(dt, game);
			if (s.time >= s.duration)
				this.startKatas(game);
			break;
		case "kata":
			this.collide(dt, game);
			this.updateKata(game);
			break;
		case "takeoff":
			if (s.time >= 0.375)
				this.set("fly", { loops: 3 });
			break;
		case "fly":
			if (s.time >= 0.5) {
				if (s.loops-- <= 0)
					this.vanish(game);
				else
					s.time = 0;
			}
			break;
		case "hidden":
			this.updateHidden(dt, game);
			break;
		case "appear":
			if (s.time >= 0.5)
				this.set("land");
			break;
		case "death":
			if (s.time >= 1) {
				this.dead = true;
				game.bossBeaten();
			}
			break;
		}
	}

	startWait() {
		this.shield = true;
		this.set("wait", { duration: [0.5, 0.2, 0.1][this.hits] || 0 });
	}

	/** Chooses the power of the next katas. */
	startKatas(game) {
		let power;
		for (let n = 0; n < 1000; n++) {
			power = randInt(6);
			// once grounded, no more fire nor earth
			if (this.hits >= HITS_TO_GROUND && (power === Power.FIRE || power === Power.EARTH))
				continue;
			if (power === Power.HOLES && this.holesMade > 20)
				continue;
			if (power === Power.BLOCK && this.blocksMade > 20)
				continue;
			if (power === Power.EARTH && game.room.tiles.get(...tileOf(this.x, this.y)) === Item.HOLE)
				continue;
			break;
		}
		// grounded : a single kata, which casts the power
		this.startKata(power, this.hits >= HITS_TO_GROUND ? 0 : 2, true);
	}

	/**
	 * A kata. `left` = katas after this one ; the first one shows the power
	 * (its colour), the others are random, the last one casts it.
	 */
	startKata(power, left, first = false) {
		let kata = power;
		if (!first) {
			do {
				kata = randInt(6);
			} while (kata === this.previousKata);
		}
		this.previousKata = kata;
		app.audio.play(left === 0 ? "kata3" : "kata" + (1 + randInt(3)));
		this.set("kata", { kata, power, left, cast: false });
	}

	updateKata(game) {
		const s = this.state;
		if (s.left === 0 && !s.cast && s.time >= KATA_CAST) {
			s.cast = true;
			this.cast(s.power, game);
		}
		if (s.time < KATA_TIME)
			return;

		if (s.left > 0) {
			this.startKata(s.power, s.left - 1);
		} else if (this.hits >= HITS_TO_DIE) {
			this.die(game);
		} else if (this.hits >= HITS_TO_GROUND) {
			// grounded : each kata hurts it
			this.hurt = 1;
			this.hits++;
			this.startKatas(game);
		} else {
			this.set("takeoff");
		}
	}

	/** Flies invisibly to a place at least 200 pixels away. */
	vanish(game) {
		app.audio.play("hide");
		game.room.add(new Puff(this.x, this.y, false));
		let tx;
		let ty;
		do {
			tx = 50 + randInt(W - 100);
			ty = 50 + randInt(H - 100);
		} while (dist(this.x, this.y, tx, ty) <= 200);
		this.speed = 0;
		this.set("hidden", { tx, ty, target: (10 + randInt(3)) * 40 });
	}

	updateHidden(dt, game) {
		const s = this.state;
		// accelerates by 5% per frame, from 1 px/frame
		this.speed = Math.min(s.target, Math.max(40, this.speed) * decay(1.05, dt));
		const d = dist(this.x, this.y, s.tx, s.ty);
		const step = Math.min(this.speed * dt, d);
		if (d > 0) {
			this.x += (s.tx - this.x) / d * step;
			this.y += (s.ty - this.y) / d * step;
		}

		// the violet ball sees it when close
		const ball = game.ball;
		this.alpha = ball.type === BallType.VIOLET
			? Math.min(1, 2000 / Math.max(1, (ball.x - this.x) ** 2 + (ball.y - this.y) ** 2))
			: 0;

		if (step >= d) {
			app.audio.play("hide");
			game.room.add(new Puff(this.x, this.y, true));
			this.alpha = 1;
			this.set("appear");
		}
	}

	/** Touched by the ball : pops the shield, or is hurt. The ball bounces. */
	collide(dt, game) {
		const ball = game.ball;
		if (ball.falling)
			return;
		const dx = ball.x - this.x;
		const dy = ball.y - this.y;
		const d = Math.hypot(dx, dy);
		if (d >= 30)
			return;

		if (this.shield) {
			this.shield = false;
			this.shieldFlash = 1;
		} else if (this.hurt === 0) {
			app.audio.play("touched");
			this.hurt = 1;
			this.hits++;
		}
		// (original : 30 px per frame, every frame of contact)
		const push = 30 * 1600 * dt;
		ball.vx += dx / (d || 1) * push;
		ball.vy += dy / (d || 1) * push;
	}

	// ----- powers -----

	cast(power, game) {
		const room = game.room;
		const add = p => {
			this.powers.push(p);
			room.add(p);
			return p;
		};

		switch (power) {
		case Power.WIND:
			app.audio.play("wind");
			add(new Wind(this, true));
			add(new Wind(this, true, 50));
			break;

		case Power.FIRE: {
			// fire pillars around it, except toward the walls
			app.audio.play("crash");
			const MARGIN = 80;
			const pillar = (dx, dy) => {
				const p = add(new Fire(this));
				p.x += dx;
				p.y += dy;
				p.age = randInt(5) / 40;
			};
			if (this.x > MARGIN) pillar(-50, 0);
			if (this.x < W - MARGIN) pillar(50, 0);
			if (this.y > MARGIN) pillar(0, -50);
			if (this.y < H - MARGIN) pillar(0, 50);
			break;
		}

		case Power.WATER:
			// 4 drops in diagonal
			app.audio.play("water");
			for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4])
				add(new Water(this, true)).angle = a;
			break;

		case Power.EARTH:
			app.audio.play("earth");
			add(new Earth(this));
			break;

		case Power.HOLES: {
			// 1 to 3 floor tiles crack, then fall
			const n = randInt(3) + 1;
			this.holesMade += n;
			for (let i = 0; i < n; i++) {
				const cell = this.freeTile(room);
				if (!cell)
					break;
				room.reserved.add(cell.tx + "," + cell.ty);
				room.add(new CrackingTile(cell.tx, cell.ty, 1.25, (g, tx, ty) => {
					room.reserved.delete(tx + "," + ty);
					app.audio.play("crash");
					breakFloor(g, tx, ty);
				}));
			}
			break;
		}

		case Power.BLOCK: {
			this.blocksMade++;
			const cell = this.freeTile(room);
			if (cell)
				room.addBlock(cell.tx, cell.ty);
			break;
		}
		}
	}

	/** A random empty tile, away from the corners and the centre. */
	freeTile(room) {
		const FORBIDDEN = ["0,0", "13,0", "6,4", "7,4", "6,5", "7,5"];
		for (let n = 0; n < 1000; n++) {
			const tx = randInt(TILES_X);
			const ty = randInt(TILES_Y);
			const key = tx + "," + ty;
			if (!FORBIDDEN.includes(key) && room.tiles.get(tx, ty) == null && !room.reserved.has(key))
				return { tx, ty };
		}
		return null;
	}

	die(game) {
		this.set("death");
		this.powers.forEach(p => p.destroy());
		game.invincible = true;
	}

	// ----- drawing -----

	/** Height above the floor, and spinning speed, of the current state. */
	pose() {
		const s = this.state;
		switch (s.name) {
		case "land": {
			const k = Math.min(1, s.time / 0.5);
			return { alt: FLY_HEIGHT * (1 - k) * (1 - k), spin: (1 - k) * 3 };
		}
		case "takeoff": {
			const k = Math.min(1, s.time / 0.375);
			return { alt: FLY_HEIGHT * k * k, spin: 1 + k * 2 };
		}
		case "fly":
			return { alt: FLY_HEIGHT + Math.sin(s.time / 0.5 * TAU) * 6, spin: 3 };
		case "hidden":
		case "appear":
			return { alt: FLY_HEIGHT, spin: 3 };
		case "kata":
			return { alt: 0, spin: 0, kata: s.kata, k: Math.min(1, s.time / KATA_TIME) };
		case "death":
			return { alt: 0, spin: 4, death: Math.min(1, s.time) };
		default:
			return { alt: 0, spin: 0 };
		}
	}

	renderShadow(ctx) {
		if (this.alpha <= 0)
			return;
		const p = this.pose();
		const s = 1 - p.alt / 150;
		ctx.fillStyle = "rgba(40,0,60," + 0.3 * s * this.alpha * (p.death !== undefined ? 1 - p.death : 1) + ")";
		ctx.beginPath();
		ctx.ellipse(this.x, this.y + 18, 26 * s, 9 * s, 0, 0, TAU);
		ctx.fill();
	}

	render(ctx) {
		if (this.alpha <= 0.01)
			return;
		const p = this.pose();
		ctx.globalAlpha = this.alpha;
		drawTinted(ctx, this.x, this.y - p.alt, 60, this.hurt * 300 / 255, c => this.drawBody(c, p));
		ctx.globalAlpha = 1;

		// the shield, when it pops
		if (this.shieldFlash > 0) {
			ctx.save();
			ctx.globalAlpha = this.shieldFlash;
			ctx.translate(this.x, this.y);
			const g = ctx.createRadialGradient(-10, -14, 4, 0, 0, 38);
			g.addColorStop(0, "rgba(255,255,255,0.8)");
			g.addColorStop(0.7, "rgba(160,220,255,0.25)");
			g.addColorStop(1, "rgba(120,180,255,0.7)");
			ctx.fillStyle = g;
			circle(ctx, 0, 0, 38);
			ctx.fill();
			ctx.strokeStyle = "rgba(255,255,255,0.9)";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.restore();
		}
	}

	drawBody(ctx, p) {
		if (p.death !== undefined) {
			ctx.globalAlpha *= 1 - p.death;
			ctx.scale(1 + p.death, 1 - p.death * 0.8);
		}
		const spin = p.spin ? this.spinTime * 10 * p.spin : 0;

		// kata aura
		if (p.kata !== undefined) {
			const r = 26 + Math.sin(p.k * Math.PI) * 14;
			const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r + 8);
			g.addColorStop(0, "rgba(255,255,255,0)");
			g.addColorStop(0.7, KATA_COLORS[p.kata]);
			g.addColorStop(1, "rgba(255,255,255,0)");
			ctx.fillStyle = g;
			circle(ctx, 0, 0, r + 8);
			ctx.fill();
		}

		// hands
		const hands = p.kata !== undefined ? KATA_HANDS[p.kata](p.k) : [spin + 0.3, spin + Math.PI + 0.3];
		for (const a of hands)
			sphere(ctx, Math.cos(a) * 30, Math.sin(a) * 30, 6, "#ffffff", "#9a90b0");

		// body : a spinning ball
		ctx.save();
		ctx.rotate(spin);
		sphere(ctx, 0, 0, 22, "#ffffff", "#8a84a0", "#ffffff");
		ctx.strokeStyle = "rgba(120,110,150,0.6)";
		ctx.lineWidth = 1.5;
		circle(ctx, 0, 0, 15);
		ctx.stroke();
		ctx.restore();

		// mask
		ctx.fillStyle = "#7a2ab0";
		ctx.beginPath();
		ctx.moveTo(-21, -8);
		ctx.quadraticCurveTo(0, -14, 21, -8);
		ctx.lineTo(19, 2);
		ctx.quadraticCurveTo(0, -3, -19, 2);
		ctx.closePath();
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.beginPath();
		ctx.ellipse(-8, -5, 4, 2.5, 0.2, 0, TAU);
		ctx.ellipse(8, -5, 4, 2.5, -0.2, 0, TAU);
		ctx.fill();
		ctx.fillStyle = "#000";
		circle(ctx, -7, -5, 1.6);
		ctx.fill();
		circle(ctx, 7, -5, 1.6);
		ctx.fill();

		// ribbon of the mask
		const wave = Math.sin(this.spinTime * 10) * 4;
		ctx.strokeStyle = "#7a2ab0";
		ctx.lineWidth = 3;
		ctx.lineCap = "round";
		ctx.beginPath();
		ctx.moveTo(20, -6);
		ctx.quadraticCurveTo(30, -10 + wave, 36, -4 - wave);
		ctx.stroke();
	}
}

/** Tile of a position. */
function tileOf(x, y) {
	return [Math.floor((x - TILE_ORIGIN) / TILE), Math.floor((y - TILE_ORIGIN) / TILE)];
}

/** A puff of smoke : it vanishes, or appears (reverse). */
class Puff extends Effect {

	constructor(x, y, reverse) {
		super(x, y, 0.5, Layer.BOSS);
		this.reverse = reverse;
	}

	render(ctx) {
		const k = this.reverse ? 1 - this.t : this.t;
		ctx.save();
		ctx.globalAlpha = this.reverse ? k : 1 - k;
		ctx.fillStyle = "rgba(230,220,255,0.9)";
		for (let i = 0; i < 7; i++) {
			const a = i * TAU / 7;
			circle(ctx, this.x + Math.cos(a) * 30 * k, this.y + Math.sin(a) * 30 * k - 20, 10 + 10 * k);
			ctx.fill();
		}
		ctx.restore();
	}
}
