/**
 * "Tourneboule", the final boss of the 5th adventure.
 *
 * Its cycle follows its animation, as in BossTB.as (the symbol calls
 * `kataDone` and `animDone`) :
 *   land      comes down ("stopFly")
 *   wait      on the floor, vulnerable ; the first touch only pops its shield
 *   kata      3 katas ("kata1".."kata6") ; the first one shows the power to
 *             come, the last one casts it (wind, fire, water, earth, broken
 *             floor, a new block)
 *   takeoff / fly    flies a few loops ("startFly", "fly")
 *   hidden    invisible, it flies to a random place ("flyVanish" ; the violet
 *             ball sees it)
 *   appear    a puff of smoke ("TBSpawn"), then it lands again
 * Each touch while it is on the floor hurts it. After 4 hits it stops flying
 * and chains katas, each one hurting it a bit more ; at 20 it dies ("death").
 */

import { WIDTH as W, HEIGHT as H, TILE, TILE_ORIGIN, TILES_X, TILES_Y } from "../config.js";
import { BallType, Item } from "../data/enums.js";
import { Boss, CrackingTile, breakFloor, redOffset } from "./common.js";
import { Water, Fire, Earth, Wind } from "./powers.js";
import { Layer } from "../game/entity.js";
import { ClipEffect } from "../game/entities/effects.js";
import { dist, decay, randInt } from "../engine/math.js";
import { clip } from "../gfx/xfl/index.js";
import { app } from "../app.js";

const HITS_TO_GROUND = 4;
const HITS_TO_DIE = 20;

const Power = { WIND: 0, FIRE: 1, WATER: 2, EARTH: 3, HOLES: 4, BLOCK: 5 };

export class Tourneboule extends Boss {

	constructor(game) {
		super(W / 2, H / 2);
		this.game = game;
		this.powers = [];
		this.hits = 0;
		this.hurt = 0;             // red flash time left (also : can't be hurt again)
		this.shield = false;       // up when it lands
		this.shieldFlash = 0;      // the "forceBubble" fading
		this.speed = 0;
		this.alpha = 1;
		this.holesMade = 0;
		this.blocksMade = 0;
		this.previousKata = -1;

		this.art = clip("tourneboule");
		this.shade = clip("TBShadow");
		this.bubble = clip("forceBubble");
		this.art.on = event => this.onArt(event);
		this.land();
	}

	/** Changes state ; `data` gives the fields of the new state. */
	set(name, data = {}) {
		this.state = { name, time: 0, ...data };
	}

	/** Plays a label on the boss and its shadow. */
	anim(label, stop = false) {
		for (const c of [this.art, this.shade]) {
			if (stop)
				c.gotoAndStop(label);
			else
				c.gotoAndPlay(label);
		}
	}

	angleToBall() {
		return Math.atan2(this.ball.y - this.y, this.ball.x - this.x);
	}

	// ----- every step -----

	update(dt, game) {
		this.game = game;
		this.ball = game.ball;
		this.powers = this.powers.filter(p => !p.dead);
		this.shieldFlash = Math.max(0, this.shieldFlash - dt * 2);
		this.hurt = Math.max(0, this.hurt - dt);

		const s = this.state;
		s.time += dt;
		if (s.name === "hidden")
			this.updateHidden(dt, game);
		if (s.name === "wait" && s.time >= s.duration)
			this.startKatas(game);
		if (s.name === "wait" || s.name === "kata")
			this.collide(dt, game);

		// (the animation calls kataDone / animDone, see onArt)
		this.art.update(dt);
		this.shade.update(dt);
	}

	/** The calls of the animation. */
	onArt(event) {
		const game = this.game;
		const s = this.state;
		if (event === "kataDone") {
			if (s.name === "kata" && s.left === 0 && !s.cast) {
				s.cast = true;
				this.cast(s.power, game);
			}
			return;
		}
		if (event !== "animDone")
			return;
		switch (s.name) {
		case "land":
			this.startWait();
			break;
		case "kata":
			this.kataEnd(game);
			break;
		case "takeoff":
		case "fly":
			if (s.loops-- <= 0) {
				this.vanish(game);
			} else {
				this.state.name = "fly";
				this.anim("fly");
			}
			break;
		case "death":
			if (!this.dead) {
				this.art.stop();
				this.shade.stop();
				this.dead = true;
				game.bossBeaten();
			}
			break;
		}
	}

	land() {
		this.speed = 0;
		this.alpha = 1;
		this.anim("stopFly");
		this.set("land");
	}

	startWait() {
		this.shield = true;
		this.anim(0, true);
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
	 * (the kata of the same number), the others are random, the last one
	 * casts it.
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
		this.anim("kata" + (kata + 1));
	}

	/** The end of a kata's animation. */
	kataEnd(game) {
		const s = this.state;
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
			this.anim("startFly");
			this.set("takeoff", { loops: 3 });
		}
	}

	/** Flies invisibly to a place more than 200 pixels away. */
	vanish(game) {
		app.audio.play("hide");
		game.room.add(new ClipEffect("TBVanish", this.x, this.y, Layer.BOSS));
		this.anim("flyVanish");
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

		// arrived : waits for the right moment of the flight loop to appear
		const f = this.art.frame - this.art.frameOf("flyVanish");
		if (step >= d && f >= 2 && f <= 10) {
			this.art.stop();
			this.shade.stop();
			const spawn = new ClipEffect("TBSpawn", this.x, this.y, Layer.BOSS);
			spawn.art.on = event => {
				if (event === "animDone" && this.state.name === "appear") {
					app.audio.play("hide");
					this.land();
				}
			};
			game.room.add(spawn);
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
		this.anim("death");
		this.set("death");
		this.powers.forEach(p => p.destroy());
		game.invincible = true;
	}

	// ----- drawing -----

	renderShadow(ctx) {
		if (this.alpha <= 0.01)
			return;
		ctx.save();
		ctx.globalAlpha *= this.alpha;
		ctx.translate(this.x, this.y);
		this.shade.draw(ctx);
		ctx.restore();
	}

	render(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		if (this.alpha > 0.01) {
			ctx.globalAlpha *= this.alpha;
			// (original : red offset = hurt time x 300)
			this.art.draw(ctx, this.hurt > 0 ? redOffset(this.hurt * 300) : null);
			ctx.globalAlpha = 1;
		}
		// the shield, when it pops
		if (this.shieldFlash > 0) {
			ctx.globalAlpha = this.shieldFlash;
			this.bubble.draw(ctx);
		}
		ctx.restore();
	}
}

/** Tile of a position. */
function tileOf(x, y) {
	return [Math.floor((x - TILE_ORIGIN) / TILE), Math.floor((y - TILE_ORIGIN) / TILE)];
}
