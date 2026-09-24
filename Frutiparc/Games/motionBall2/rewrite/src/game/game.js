/**
 * A game : the dungeon, the current room, the ball, the clock, the lives,
 * and the rules of the mode (modes.js).
 *
 * The game is driven by the play scene (scenes/play.js), which calls
 * update(dt) / render(ctx) and receives the events :
 *   onPause(tab)      the game asks for the pause screen (the map was found...)
 *   onEnd(result)     the game is over (see end())
 *
 * States :
 *   play      normal
 *   scroll    moving to the next room : the two rooms slide, nothing else moves
 *   over      the game is over (the scene shows the result)
 */

import { WIDTH as W, HEIGHT as H, BORDER as B, BALL_RADIUS, ROOM_SCROLL_TIME } from "../config.js";
import { Mode, Exit, BallType, DIR_DX, DIR_DY, OPPOSITE, Dir } from "../data/enums.js";
import { MODES } from "./modes.js";
import { Inventory } from "./inventory.js";
import { Ball } from "./ball.js";
import { Room } from "./room.js";
import { Hud } from "./hud.js";
import { createBoss } from "../bosses/index.js";
import { ease, randInt } from "../engine/math.js";
import { GAME_MUSIC, MUSIC_VOLUME } from "../sounds.js";
import { app } from "../app.js";

export class Game {

	/**
	 * @param mode    Mode
	 * @param param   the adventure / course number
	 * @param events  { onPause(tab), onEnd(result) }
	 */
	constructor(mode, param, events) {
		this.mode = mode;
		this.param = param;
		this.rules = MODES[mode];
		this.events = events;

		this.dungeon = this.rules.dungeon(param);
		this.time = this.rules.startTime;
		this.inventory = new Inventory(this.rules.lives);
		this.ball = new Ball();
		this.boss = null;
		this.switchOn = false;          // state of the pink / blue switches
		this.laps = this.rules.laps || 0;
		this.lapValidated = false;      // Course : a one-way door was crossed since the last lap
		this.level = 0;                 // Classique : level reached
		this.bossDone = false;
		this.invincible = false;       // set by a dying boss
		this.state = "play";
		this.scroll = null;
		this.hud = new Hud(this);
		this.stats = { lost: 0 };        // for the achievements

		// the first room
		let x = this.dungeon.start.x;
		let y = this.dungeon.start.y;
		if (this.rules.randomStartRow)
			y = randInt(this.dungeon.height);
		this.room = new Room(this, x, y, -1);
		this.ball.placeAt(W / 2, H / 2);
		this.ball.setSpawn();

		app.audio.startLayers(GAME_MUSIC.layers, GAME_MUSIC.volumes);
	}

	// ----- queries for the entities -----

	colliders() {
		const list = this.room.colliders();
		if (this.boss && this.boss.colliders)
			list.push(...this.boss.colliders());
		return list;
	}

	neighbour(rx, ry, dir) {
		return this.dungeon.room(rx + DIR_DX[dir], ry + DIR_DY[dir]);
	}

	/** Is the ball completely inside the room (past the doors) ? */
	ballInside() {
		const m = B + BALL_RADIUS;
		const b = this.ball;
		return b.x > m && b.y > m && b.x < W - m && b.y < H - m;
	}

	// ----- actions for the entities -----

	/** Tells the achievements what happened (see achievements.js). */
	achieve(event, data) {
		if (app.achievements)
			app.achievements.event(event, this, data);
	}

	/** Adds time : in chrono mode, it counts the other way. */
	addTime(seconds) {
		this.time += seconds;
		if (this.rules.maxTime)
			this.time = Math.min(this.time, this.rules.maxTime);
		this.time = Math.max(0, this.time);
		this.hud.timeChanged(seconds);
	}

	/** A ball was found : it is selected, and the music gets richer the first time. */
	collectBall(type) {
		const inv = this.inventory;
		inv.balls[type] = 1;
		this.ball.setType(type);
		if (!inv.found.has(type)) {
			inv.found.add(type);
			app.audio.setLayer(Math.min(inv.found.size, GAME_MUSIC.layers.length - 1));
		}
		this.achieve("ball", type);
	}

	/** The ball has finished falling (hole, hatch) or dying. */
	ballFell(kind) {
		if (kind === "hatch") {
			this.nextClassicLevel();
			return;
		}
		const ball = this.ball;
		const inv = this.inventory;
		if (kind === "hole")
			this.achieve("fall");
		const free = this.rules.noLoss || (this.rules.freeYellow && ball.type === BallType.YELLOW);
		if (!free) {
			inv.balls[ball.type]--;
			this.achieve("lost");
		}

		const next = inv.next(ball.type, true);
		if (next < 0) {
			ball.hidden = true;
			this.end("balls");
			return;
		}
		if (next !== ball.type)
			ball.setType(next);
		ball.respawn();
	}

	/** Course : a one-way door was crossed. */
	oneWayCrossed() {
		this.lapValidated = true;
	}

	/**
	 * Course : the ball crossed a checkpoint beam. It is a lap if a one-way
	 * door was crossed since the last one. The other rooms are then reset
	 * (doors closed, blocks and pastilles back).
	 */
	checkpoint() {
		if (!this.lapValidated)
			return;
		this.lapValidated = false;
		this.laps--;
		this.hud.lapDone();
		if (this.laps === 0) {
			this.end("win");
			return;
		}
		for (const { x, y, room } of this.dungeon.allRooms()) {
			if (x === this.room.rx && y === this.room.ry)
				continue;
			room.visited = false;
			for (const exit of room.exits)
				if (exit.type === Exit.OPEN)
					exit.type = Exit.DOOR;
			for (const item of room.items) {
				item.destroyed = false;
				item.taken = false;
			}
		}
	}

	/** Asks for the pause screen, on the map. */
	showMap() {
		this.events.onPause("map");
	}

	// ----- every step -----

	update(dt) {
		if (this.state === "scroll") {
			this.updateScroll(dt);
			return;
		}
		if (this.state === "over") {
			this.room.update(dt, this);
			return;
		}

		this.updateTime(dt);
		if (this.state !== "play")
			return;

		if (this.rules.ballSwitch && app.input.pressed("switchBall"))
			this.switchBall();

		this.room.update(dt, this);
		this.ball.update(dt, this);
		if (this.boss)
			this.boss.update(dt, this);
		this.hud.update(dt);

		if (this.state === "play" && !this.ball.falling) {
			this.checkBossRoom();
			this.checkExits();
		}
	}

	updateTime(dt) {
		if (this.rules.chrono) {
			this.time += dt;
			return;
		}
		this.time -= dt;
		if (this.time <= 0) {
			this.time = 0;
			if (!this.ball.falling)
				this.end("time");
		}
	}

	switchBall() {
		const next = this.inventory.next(this.ball.type);
		if (next < 0 || next === this.ball.type)
			return;
		this.ball.setType(next);
		app.audio.play("ballChange");
	}

	/** Once the ball is inside the boss room, its doors close and the boss comes. */
	checkBossRoom() {
		if (!this.room.isBossRoom || this.boss || this.bossDone || !this.ballInside())
			return;
		this.room.closeDoors();
		this.ball.spawnX = W / 2;
		this.ball.spawnY = H / 2;
		if (this.rules.endsAtBoss) {
			this.end("win");
			return;
		}
		app.audio.playMusic("musicBoss", MUSIC_VOLUME);
		this.boss = createBoss(this);
	}

	/** Called by the boss when it is beaten. */
	bossBeaten() {
		this.bossDone = true;
		this.end("win");
	}

	/** The ball left the room : go to the next room, or stay inside. */
	checkExits() {
		const b = this.ball;
		let dir = -1;
		if (b.x < 0) dir = Dir.LEFT;
		else if (b.x > W) dir = Dir.RIGHT;
		else if (b.y < 0) dir = Dir.UP;
		else if (b.y > H) dir = Dir.DOWN;
		if (dir < 0)
			return;

		const next = this.neighbour(this.room.rx, this.room.ry, dir);
		if (!next) {
			b.x = Math.max(5, Math.min(W - 5, b.x));
			b.y = Math.max(5, Math.min(H - 5, b.y));
			return;
		}
		this.goToRoom(this.room.rx + DIR_DX[dir], this.room.ry + DIR_DY[dir], dir);
	}

	/**
	 * Starts the scrolling to the room (rx, ry). `dir` is the direction of the
	 * scrolling (the side of the current room the ball leaves by).
	 */
	goToRoom(rx, ry, dir, entryDoor = OPPOSITE[dir]) {
		this.dungeon.ensure(rx + 2);
		const data = this.dungeon.room(rx, ry);

		// the door the ball comes in by opens (one-way doors : see Room.makeDoors)
		if (entryDoor >= 0) {
			const exit = data.exits[entryDoor];
			const challenge = this.mode === Mode.CHALLENGE;
			if (exit.type === Exit.DOOR || (exit.type === Exit.SPECIAL && challenge))
				exit.type = Exit.OPEN;
		}

		const to = new Room(this, rx, ry, entryDoor);
		this.scroll = { from: this.room, to, dir, t: 0 };
		this.state = "scroll";
	}

	updateScroll(dt) {
		const s = this.scroll;
		s.t += dt / ROOM_SCROLL_TIME;
		if (s.t < 1)
			return;

		// the new room becomes the current one
		const b = this.ball;
		b.x -= DIR_DX[s.dir] * W;
		b.y -= DIR_DY[s.dir] * H;
		b.vx /= 3;
		b.vy /= 3;
		b.setSpawn();
		this.room = s.to;
		this.scroll = null;
		this.state = "play";
	}

	/**
	 * Classique : the ball fell through the hatch. It lands in a random room
	 * of the next level, where the hatch was, and wins a few seconds.
	 */
	nextClassicLevel() {
		const b = this.ball;
		this.level++;
		this.achieve("level", this.level + 1);
		this.addTime(this.rules.levelBonus);
		b.vx = 0;
		b.vy = 0;
		// placed one room below, so that the scrolling brings it in
		b.y += H;
		this.goToRoom(this.room.rx + 1, randInt(this.dungeon.height), Dir.DOWN, -1);
	}

	/**
	 * The game is over. cause : "win", "time" (no time left) or "balls" (no
	 * ball left).
	 */
	end(cause) {
		// (while the boss dies, the game can only be won)
		if (this.state === "over" || (this.invincible && cause !== "win"))
			return;
		this.state = "over";
		app.audio.stopLayers(1);
		if (cause !== "win")
			app.audio.play("gameOver");
		this.events.onEnd(this.result(cause));
	}

	/** Everything the end screen and the records need. */
	result(cause) {
		let rooms = 0;
		let visited = 0;
		for (const { room } of this.dungeon.allRooms()) {
			rooms++;
			if (room.visited)
				visited++;
		}
		return {
			mode: this.mode,
			param: this.param,
			cause,
			time: this.time,
			level: this.level + 1,
			explored: rooms ? Math.floor(visited * 100 / rooms) : 0
		};
	}

	// ----- drawing -----

	render(ctx) {
		if (this.state === "scroll") {
			this.renderScroll(ctx);
		} else {
			const extras = [this.ball];
			if (this.boss)
				extras.push(this.boss);
			this.room.render(ctx, this, extras);
			this.room.renderBorder(ctx, this);
			if (this.boss && this.boss.renderTop)
				this.boss.renderTop(ctx, this);
		}
		this.hud.render(ctx);
	}

	/** The two rooms slide ; the ball goes with them. */
	renderScroll(ctx) {
		const s = this.scroll;
		const k = ease.inOutQuad(Math.min(1, s.t));
		const dx = DIR_DX[s.dir] * W;
		const dy = DIR_DY[s.dir] * H;
		ctx.save();
		ctx.translate(-dx * k, -dy * k);
		s.from.render(ctx, this);
		s.from.renderBorder(ctx, this);
		ctx.translate(dx, dy);
		s.to.render(ctx, this);
		s.to.renderBorder(ctx, this);
		// the ball is in the coordinates of the room it leaves
		ctx.translate(-dx, -dy);
		this.ball.renderShadow(ctx);
		this.ball.render(ctx);
		ctx.restore();
	}
}
