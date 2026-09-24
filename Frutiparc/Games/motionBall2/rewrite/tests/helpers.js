/**
 * Test helpers : run the game in Node, without a browser.
 *
 * The game only needs the browser to draw, to play sound and to read input.
 * `setup()` replaces those services (src/app.js) with fakes :
 *   - input : the tests set the direction (`input.dir`) and trigger actions ;
 *   - audio : records the sounds played ;
 *   - images : none (drawing code skips missing images) ;
 *   - a fake `document` and 2D context, so that the drawing code can run too
 *     (it draws nothing, but a typo in it would throw).
 * `Math.random` is replaced by a seeded generator : the tests are repeatable.
 */

import { app } from "../src/app.js";
import { Progress } from "../src/progress.js";
import { Game } from "../src/game/game.js";
import { Room } from "../src/game/room.js";
import { Dungeon, makeRoom } from "../src/data/dungeon.js";
import { RoomType, Exit } from "../src/data/enums.js";
import { CELL } from "../src/config.js";

export const STEP = 1 / 120;

// ----- seeded random -----

/** mulberry32 : a small seeded generator. */
export function seedRandom(seed) {
	let a = seed >>> 0;
	Math.random = () => {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ----- fake services -----

export class FakeInput {

	constructor() {
		this.dir = { x: 0, y: 0 };
		this.queue = new Set();
		this.pointer = null;
		this.hover = null;
		this.stick = null;
	}

	axis() {
		return this.dir;
	}

	pressed(action) {
		return this.queue.has(action);
	}

	held() {
		return false;
	}

	trigger(action) {
		this.queue.add(action);
	}

	endStep() {
		this.queue.clear();
		this.pointer = null;
	}

	poll() { }
}

export class FakeAudio {

	constructor() {
		this.played = [];
		this.music = null;
		this.layer = -1;
	}

	play(name) {
		this.played.push(name);
	}

	playMusic(name) {
		this.music = name;
	}

	startLayers() {
		this.layer = 0;
	}

	setLayer(i) {
		this.layer = i;
	}

	stopLayers() {
		this.layer = -1;
	}

	unlock() { }
	update() { }
	setMusicEnabled() { }
	setSoundsEnabled() { }

	/** How many times a sound was played since the last call. */
	count(name) {
		const n = this.played.filter(s => s === name).length;
		this.played = [];
		return n;
	}
}

/** A 2D context that accepts every call (and a canvas that returns it). */
export function fakeContext() {
	const gradient = { addColorStop() { } };
	const target = {
		canvas: { width: 610, height: 410 },
		createRadialGradient: () => gradient,
		createLinearGradient: () => gradient,
		measureText: s => ({ width: String(s).length * 8 }),
		getLineDash: () => []
	};
	return new Proxy(target, {
		get(t, key) {
			if (key in t)
				return t[key];
			return () => { };
		},
		set(t, key, value) {
			t[key] = value;
			return true;
		}
	});
}

function installFakeDocument() {
	globalThis.document = {
		createElement: () => ({ width: 0, height: 0, getContext: () => fakeContext() })
	};
}

/** Installs the fakes ; call it before each test. */
export function setup(seed = 1) {
	seedRandom(seed);
	installFakeDocument();
	app.input = new FakeInput();
	app.audio = new FakeAudio();
	app.images = { get: () => null };
	app.save = new Progress();
	app.scenes = { busy: false, current: null, goto(scene) { this.current = scene; if (scene.enter) scene.enter(); } };
	app.time = 0;
}

// ----- games -----

/** Starts a game ; `game.log` records its events. */
export function newGame(mode, param = 0) {
	const log = { pauses: [], ends: [] };
	const game = new Game(mode, param, {
		onPause: tab => log.pauses.push(tab),
		onEnd: result => log.ends.push(result)
	});
	game.log = log;
	return game;
}

/** Runs the game for `seconds` of game time ; `each(game)` is called before each step. */
export function run(game, seconds, each) {
	const steps = Math.round(seconds / STEP);
	for (let i = 0; i < steps; i++) {
		if (each)
			each(game, i);
		app.time += STEP;
		game.update(STEP);
		app.input.endStep();
	}
}

/** Runs until `condition(game)` is true (or fails after `max` seconds). Returns the time taken. */
export function runUntil(game, condition, max = 10) {
	let t = 0;
	while (!condition(game)) {
		if (t > max)
			throw new Error("condition not reached after " + max + " s");
		run(game, STEP);
		t += STEP;
	}
	return t;
}

// ----- custom rooms -----

/**
 * An item of the level data centred on (x, y) pixels (the data uses the
 * top-left cell). `size` is the size of the item in pixels (see room.js SIZES).
 */
export function item(type, x, y, size) {
	return { type, x: Math.round((x - size / 2) / CELL), y: Math.round((y - size / 2) / CELL) };
}

/** An item on the tile (tx, ty) (blocks, holes). */
export function tileItem(type, tx, ty) {
	return { type, x: 6 + tx * 10, y: 6 + ty * 10 };
}

/**
 * Puts the game in a room made for the test : a 3 x 3 dungeon whose middle
 * room has `items` and `exits` (left, right, up, down), surrounded by empty
 * rooms with doors. The ball is placed in the middle.
 */
export function testRoom(game, items, exits = [Exit.DOOR, Exit.DOOR, Exit.DOOR, Exit.DOOR], type = RoomType.NORMAL) {
	const d = new Dungeon(3, 3);
	for (let x = 0; x < 3; x++)
		for (let y = 0; y < 3; y++)
			d.rooms[x][y] = makeRoom(RoomType.NORMAL, undefined, [Exit.DOOR, Exit.DOOR, Exit.DOOR, Exit.DOOR], []);
	d.rooms[1][1] = makeRoom(type, undefined, exits, items);
	d.start = { x: 1, y: 1 };
	game.dungeon = d;
	game.room = new Room(game, 1, 1, -1);
	game.ball.placeAt(305, 205);
	game.ball.setSpawn();
	return game.room;
}

/** Enters the room (x, y) of the game's dungeon directly (no scrolling). */
export function enterRoom(game, x, y) {
	game.room = new Room(game, x, y, -1);
	game.ball.placeAt(305, 205);
	game.ball.setSpawn();
	return game.room;
}

/** The first room of the dungeon matching `pred(room)`. */
export function findRoom(game, pred) {
	for (const r of game.dungeon.allRooms())
		if (pred(r.room))
			return r;
	return null;
}

export { app };
