/**
 * Gameplay : the ball, the items of the rooms, the doors, the room changes,
 * and the rules of each mode.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setup, newGame, run, runUntil, testRoom, enterRoom, findRoom, item, tileItem, app, STEP } from "./helpers.js";
import { Mode, Item, Exit, BallType, RoomType, Dir } from "../src/data/enums.js";
import { WIDTH as W, HEIGHT as H, BORDER as B, TILE, TILE_ORIGIN } from "../src/config.js";

const RIGHT = { x: 1, y: 0 };
const tileCentre = (tx, ty) => ({ x: TILE_ORIGIN + tx * TILE + TILE / 2, y: TILE_ORIGIN + ty * TILE + TILE / 2 });

// ----- start -----

test("a Challenge game starts in its first room", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	assert.equal(g.state, "play");
	assert.equal(g.time, 15 * 60);
	assert.deepEqual(g.inventory.balls, [3, 0, 0, 0, 0, 0, 0]);
	assert.equal(g.room.rx, g.dungeon.start.x);
	assert.equal(g.room.ry, g.dungeon.start.y);
	assert.deepEqual([g.ball.x, g.ball.y], [W / 2, H / 2]);
	assert.equal(app.audio.layer, 0, "the in-game music starts");
});

test("every mode starts, with its own rules", () => {
	const expected = {
		[Mode.CHALLENGE]: { time: 900, balls: 3 },
		[Mode.ADVENTURE]: { time: 1080, balls: 5 },
		[Mode.COURSE]: { time: 0, balls: 1 },
		[Mode.CLASSIC]: { time: 60, balls: 1 },
		[Mode.TUTORIAL]: { time: 900, balls: 3 }
	};
	for (const [mode, e] of Object.entries(expected)) {
		setup();
		const g = newGame(mode);
		assert.equal(g.time, e.time, mode);
		assert.equal(g.inventory.balls[BallType.YELLOW], e.balls, mode);
		run(g, 1);
		assert.equal(g.state, "play", mode);
	}
});

// ----- the ball -----

test("the ball rolls where the player steers, and stops at the border", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [], [Exit.WALL, Exit.WALL, Exit.WALL, Exit.WALL]);
	app.input.dir = RIGHT;
	run(g, 0.3);
	assert.ok(g.ball.x > W / 2 + 20, "moved right");
	assert.ok(g.ball.vx > 0);
	run(g, 3);
	assert.ok(g.ball.x <= W - B - g.ball.radius + 0.01, "stays inside the room");
	assert.equal(g.room.rx, 1, "same room");
});

test("the ball slows down and stops without input", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [], [Exit.WALL, Exit.WALL, Exit.WALL, Exit.WALL]);
	g.ball.vx = 300;
	run(g, 3);
	assert.equal(g.ball.vx, 0);
});

test("each ball has its own speed : orange is faster than yellow, metal slower", () => {
	const distance = type => {
		setup();
		const g = newGame(Mode.CHALLENGE);
		testRoom(g, [], [Exit.WALL, Exit.WALL, Exit.WALL, Exit.WALL]);
		g.ball.setType(type);
		g.ball.placeAt(60, 205);
		app.input.dir = RIGHT;
		run(g, 0.25);
		return g.ball.x - 60;
	};
	const yellow = distance(BallType.YELLOW);
	assert.ok(distance(BallType.ORANGE) > yellow);
	assert.ok(distance(BallType.METAL) < yellow);
});

test("space changes the ball, among the balls owned", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	g.inventory.balls[BallType.GREEN] = 1;
	g.inventory.balls[BallType.METAL] = 1;
	const order = [];
	for (let i = 0; i < 3; i++) {
		app.input.trigger("switchBall");
		run(g, STEP);
		order.push(g.ball.type);
	}
	assert.deepEqual(order, [BallType.GREEN, BallType.METAL, BallType.YELLOW]);
});

test("no ball change in Classique", () => {
	setup();
	const g = newGame(Mode.CLASSIC);
	g.inventory.balls[BallType.GREEN] = 1;
	app.input.trigger("switchBall");
	run(g, STEP);
	assert.equal(g.ball.type, BallType.YELLOW);
});

// ----- losing balls -----

test("dying costs a ball ; the ball comes back where it entered, blinking", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, []);
	g.ball.placeAt(100, 100);
	assert.ok(g.ball.die());
	run(g, 1.5);
	assert.equal(g.inventory.balls[BallType.YELLOW], 2);
	assert.deepEqual([g.ball.x, g.ball.y], [305, 205]);
	assert.ok(g.ball.invulnerable > 0 || g.ball.falling === false);
	assert.equal(g.ball.die(), g.ball.invulnerable <= 0, "no death while blinking");
});

test("losing the last ball of a colour switches to another colour", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, []);
	g.inventory.balls[BallType.GREEN] = 1;
	g.ball.setType(BallType.GREEN);
	g.ball.die();
	run(g, 1.5);
	assert.equal(g.inventory.balls[BallType.GREEN], 0);
	assert.equal(g.ball.type, BallType.YELLOW);
});

test("no ball left : the game is over", () => {
	setup();
	const g = newGame(Mode.CLASSIC);
	testRoom(g, []);
	g.ball.die();
	run(g, 1.5);
	assert.equal(g.state, "over");
	assert.equal(g.log.ends[0].cause, "balls");
});

test("no loss in the tutorial, nor for the yellow ball in Course mode", () => {
	for (const mode of [Mode.TUTORIAL, Mode.COURSE]) {
		setup();
		const g = newGame(mode);
		testRoom(g, []);
		const before = g.inventory.balls[BallType.YELLOW];
		g.ball.die();
		run(g, 1.5);
		assert.equal(g.inventory.balls[BallType.YELLOW], before, mode);
		assert.equal(g.state, "play", mode);
	}
});

// ----- time -----

test("no time left : the game is over", () => {
	setup();
	const g = newGame(Mode.CLASSIC);
	testRoom(g, []);
	g.time = 0.5;
	run(g, 1);
	assert.equal(g.state, "over");
	assert.equal(g.log.ends[0].cause, "time");
});

test("the Course chronometer counts up", () => {
	setup();
	const g = newGame(Mode.COURSE);
	run(g, 2);
	assert.ok(Math.abs(g.time - 2) < 0.02);
});

test("Classique : the time is capped at 100 seconds", () => {
	setup();
	const g = newGame(Mode.CLASSIC);
	g.addTime(500);
	assert.equal(g.time, 100);
});

// ----- pastilles and doors -----

test("taking every red pastille opens the doors", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const room = testRoom(g, [item(Item.RED, 100, 100, 24), item(Item.RED, 500, 300, 24)],
		[Exit.DOOR, Exit.WALL, Exit.HIDDEN, Exit.DOOR]);
	assert.equal(room.redsLeft, 2);
	assert.deepEqual(room.doors.map(d => d.state), ["closed", "wall", "hidden", "closed"]);

	g.ball.placeAt(100, 100);
	run(g, STEP * 2);
	assert.equal(room.redsLeft, 1);
	assert.equal(room.doors[0].state, "closed");

	g.ball.placeAt(500, 300);
	run(g, 0.5);
	assert.equal(room.redsLeft, 0);
	assert.equal(room.doors[0].state, "open");
	assert.equal(room.doors[3].state, "open");
	assert.equal(g.dungeon.room(1, 1).exits[0].type, Exit.OPEN, "stays open");
	assert.ok(app.audio.played.includes("doors"));
});

test("a taken pastille does not come back", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [item(Item.RED, 100, 100, 24), item(Item.RED, 500, 300, 24)]);
	g.ball.placeAt(100, 100);
	run(g, STEP * 2);
	enterRoom(g, 1, 1);
	assert.equal(g.room.redsLeft, 1);
});

test("the red ball attracts the red pastilles", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const room = testRoom(g, [item(Item.RED, 400, 205, 24)]);
	const red = room.entities.find(e => e.itemType === Item.RED);
	const x0 = red.x;
	g.ball.setType(BallType.RED);
	run(g, 0.5);
	assert.ok(red.x < x0, "the pastille moved toward the ball");
});

test("time pastilles : +10 s, +2 s in Classique, -1 s on the chronometer", () => {
	for (const [mode, delta] of [[Mode.CHALLENGE, 10], [Mode.CLASSIC, 2], [Mode.COURSE, -1]]) {
		setup();
		const g = newGame(mode);
		testRoom(g, [item(Item.BLUE, 305, 205, 24)]);
		g.time = 30;   // (the chronometer can't go below 0)
		const t0 = g.time;
		run(g, STEP);
		const chrono = g.rules.chrono ? STEP : -STEP;
		assert.ok(Math.abs(g.time - (t0 + delta + chrono)) < 1e-6, mode);
	}
});

test("a key opens a closed door", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const room = testRoom(g, [item(Item.RED, 100, 100, 24)], [Exit.DOOR, Exit.WALL, Exit.WALL, Exit.WALL]);
	g.inventory.keys = 1;
	g.ball.placeAt(40, 205);
	g.ball.vx = -300;
	run(g, 0.5);
	assert.equal(g.inventory.keys, 0);
	assert.equal(room.doors[0].state, "open");
});

test("without key, a closed door is a wall", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const room = testRoom(g, [item(Item.RED, 100, 100, 24)], [Exit.DOOR, Exit.WALL, Exit.WALL, Exit.WALL]);
	g.ball.placeAt(60, 205);
	app.input.dir = { x: -1, y: 0 };
	run(g, 2);
	assert.equal(room.doors[0].state, "closed");
	assert.ok(g.ball.x > B, "still inside");
	assert.equal(g.room, room);
});

// ----- room changes -----

test("going through an open door scrolls to the next room", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, []);
	g.ball.placeAt(W - 40, 205);
	app.input.dir = RIGHT;
	runUntil(g, g => g.state === "scroll", 2);
	app.input.dir = { x: 0, y: 0 };
	runUntil(g, g => g.state === "play", 2);
	assert.deepEqual([g.room.rx, g.room.ry], [2, 1]);
	assert.ok(g.ball.x >= 0 && g.ball.x < 60, "enters by the left side");
	assert.equal(g.room.doors[Dir.LEFT].state, "open", "the door it came in by is open");
	assert.ok(g.dungeon.room(2, 1).visited);
	assert.deepEqual([g.ball.spawnX, g.ball.spawnY], [g.ball.x, g.ball.y], "comes back here after a death");
});

test("hidden exits let the ball through", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [item(Item.RED, 100, 100, 24)], [Exit.WALL, Exit.WALL, Exit.HIDDEN, Exit.WALL]);
	g.ball.placeAt(305, 40);
	app.input.dir = { x: 0, y: -1 };
	runUntil(g, g => g.state === "scroll", 2);
});

// ----- holes -----

test("falling in a hole costs a ball", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [tileItem(Item.HOLE, 3, 4)]);
	const c = tileCentre(3, 4);
	g.ball.placeAt(c.x, c.y);
	run(g, STEP);
	assert.equal(g.ball.fall && g.ball.fall.kind, "hole");
	run(g, 1.5);
	assert.equal(g.inventory.balls[BallType.YELLOW], 2);
});

test("the ball is pulled back from the edge of a hole", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [tileItem(Item.HOLE, 3, 4)]);
	const c = tileCentre(3, 4);
	// just over the left edge : pulled toward the middle (+x), not falling yet
	g.ball.placeAt(c.x - TILE / 2 + 2, c.y);
	run(g, STEP);
	assert.ok(g.ball.vx > 0);
	assert.equal(g.ball.fall, null);
});

test("the blue ball jumps over a row of holes", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const holes = [];
	for (let tx = 0; tx < 14; tx++)
		holes.push(tileItem(Item.HOLE, tx, 2));
	testRoom(g, holes);
	g.inventory.balls[BallType.BLUE] = 1;
	g.ball.setType(BallType.BLUE);
	g.ball.placeAt(305, 205);
	g.ball.vy = -700;
	run(g, 0.8);
	assert.equal(g.inventory.balls[BallType.BLUE], 1, "did not fall");
	assert.ok(g.ball.y < TILE_ORIGIN + 2 * TILE, "crossed the holes");
});

// ----- obstacles -----

test("a bumper throws the ball back hard", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [item(Item.BUMPER, 400, 205, 48)]);
	g.ball.placeAt(360, 205);
	g.ball.vx = 300;
	runUntil(g, g => g.ball.vx < 0, 1);
	assert.ok(g.ball.vx < -700, "bounced at the bumper's minimum speed");
	assert.ok(app.audio.played.includes("metal"));
});

test("a death bumper kills, except the metal ball", () => {
	for (const [type, dies] of [[BallType.YELLOW, true], [BallType.METAL, false]]) {
		setup();
		const g = newGame(Mode.CHALLENGE);
		testRoom(g, [item(Item.DEATH, 400, 205, 40)]);
		g.inventory.balls[type] = 1;
		g.ball.setType(type);
		g.ball.placeAt(370, 205);
		g.ball.vx = 200;
		run(g, 0.1);
		assert.equal(g.ball.falling, dies, "type " + type);
	}
});

test("a clock bumper costs 5 seconds (adds 5 to the chronometer)", () => {
	for (const [mode, sign] of [[Mode.CHALLENGE, -1], [Mode.COURSE, 1]]) {
		setup();
		const g = newGame(mode);
		testRoom(g, [item(Item.CLOCK, 400, 205, 64)]);
		g.ball.placeAt(355, 205);
		g.ball.vx = 200;
		const t0 = g.time;
		run(g, 0.1);
		const change = g.time - t0 - (g.rules.chrono ? 0.1 : -0.1);
		assert.ok(Math.abs(change - sign * 5) < 0.02, mode + " " + change);
	}
});

test("a magnet attracts the ball, but not the metal one", () => {
	for (const [type, attracted] of [[BallType.YELLOW, true], [BallType.METAL, false]]) {
		setup();
		const g = newGame(Mode.CHALLENGE);
		testRoom(g, [item(Item.MAGNET, 420, 205, 40)]);
		g.ball.setType(type);
		g.ball.placeAt(305, 205);
		run(g, 0.2);
		assert.equal(g.ball.x > 306, attracted, "type " + type);
	}
});

test("the green ball breaks the green blocks, the others bounce on them", () => {
	for (const [type, breaks] of [[BallType.YELLOW, false], [BallType.GREEN, true]]) {
		setup();
		const g = newGame(Mode.CHALLENGE);
		const data = tileItem(Item.BLOCK, 8, 4);
		const room = testRoom(g, [data]);
		g.ball.setType(type);
		g.ball.placeAt(tileCentre(8, 4).x - 40, tileCentre(8, 4).y);
		g.ball.vx = 300;
		run(g, 0.2);
		assert.equal(room.tiles.get(8, 4) === null, breaks, "type " + type);
		assert.equal(!!data.destroyed, breaks);
		if (!breaks)
			assert.ok(g.ball.vx < 0, "bounced");
	}
});

test("the switch toggles the pink and blue blocks", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const room = testRoom(g, [item(Item.SWITCH, 305, 100, 32), tileItem(Item.PINK_BLOCK, 2, 6), tileItem(Item.BLUE_BLOCK, 10, 6)]);
	const pink = room.entities.find(e => e.itemType === Item.PINK_BLOCK);
	const blue = room.entities.find(e => e.itemType === Item.BLUE_BLOCK);
	run(g, STEP);
	assert.deepEqual([pink.solid, blue.solid], [false, true]);
	g.ball.placeAt(305, 140);
	g.ball.vy = -300;
	run(g, 0.2);
	assert.equal(g.switchOn, true);
	assert.deepEqual([pink.solid, blue.solid], [true, false]);
});

test("a teleport sends the ball to the other one", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [item(Item.TELEPORT, 100, 100, 48), item(Item.TELEPORT, 500, 300, 48)]);
	g.ball.placeAt(100, 100);
	run(g, STEP);
	assert.deepEqual([Math.round(g.ball.x), Math.round(g.ball.y)], [500, 300]);
	run(g, 0.2);
	assert.ok(Math.abs(g.ball.x - 500) < 20, "does not bounce back and forth");
});

test("a laser beam kills the balls of another colour", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	// two posts of the same phase ((x - 4) + (y - 4)) % 7 : cells (20, 40) and (27, 40)... same row, 7 apart
	const room = testRoom(g, [{ type: Item.ZAPPER, x: 30, y: 40 }, { type: Item.ZAPPER, x: 100, y: 40 }]);
	assert.equal(room.beams.length, 1);
	const beam = room.beams[0];
	const y = beam.a.y;
	g.ball.setType(beam.phase === BallType.YELLOW ? BallType.GREEN : BallType.YELLOW);
	g.ball.placeAt((beam.a.x + beam.b.x) / 2, y);
	run(g, STEP);
	assert.ok(g.ball.falling);
});

test("an item box gives its item", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const d = g.dungeon;
	const bonus = findRoom(g, r => r.type === RoomType.BONUS && r.content === 4 /* key */);
	if (!bonus)
		return;
	enterRoom(g, bonus.x, bonus.y);
	g.ball.placeAt(305, 150);
	g.ball.vy = 400;
	run(g, 0.3);
	assert.equal(g.inventory.keys, 3);
	assert.ok(d.room(bonus.x, bonus.y).taken);
});

test("finding a ball selects it, and makes the music richer the first time", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const r = findRoom(g, r => r.type === RoomType.BALL);
	enterRoom(g, r.x, r.y);
	run(g, STEP * 2);
	assert.notEqual(g.ball.type, BallType.YELLOW);
	assert.equal(g.inventory.balls[g.ball.type], 1);
	assert.equal(app.audio.layer, 1);
});

// ----- modes -----

test("Course : a lap counts after a one-way door and a checkpoint", () => {
	setup();
	const g = newGame(Mode.COURSE, 0);
	// course 1 : the start room (2, 1) has the checkpoint and a one-way door on its left
	enterRoom(g, 1, 1);
	g.ball.placeAt(W + 5, 205);
	g.goToRoom(2, 1, Dir.RIGHT);
	runUntil(g, g => g.state === "play", 2);
	assert.equal(g.room.doors[Dir.LEFT].state, "open");
	g.ball.placeAt(100, 205);
	run(g, 0.5);
	assert.ok(g.lapValidated, "the one-way door validates the lap");
	assert.notEqual(g.room.doors[Dir.LEFT].state, "open", "and closes behind the ball");

	const beam = g.room.beams[0];
	g.ball.placeAt(beam.a.x, (beam.a.y + beam.b.y) / 2);
	run(g, STEP);
	assert.equal(g.laps, 2);
	assert.equal(g.lapValidated, false);
	run(g, STEP);
	assert.equal(g.laps, 2, "one lap per validation");
});

test("Course : the last lap wins", () => {
	setup();
	const g = newGame(Mode.COURSE, 0);
	g.laps = 1;
	g.lapValidated = true;
	g.checkpoint();
	assert.equal(g.state, "over");
	assert.equal(g.log.ends[0].cause, "win");
});

test("Classique : the hatch opens with the red pastilles, and leads to the next level", () => {
	setup();
	const g = newGame(Mode.CLASSIC);
	const room = g.room;
	for (const red of room.entities.filter(e => e.itemType === Item.RED)) {
		g.ball.placeAt(red.x, red.y);
		run(g, STEP * 2);
	}
	run(g, 0.5);
	assert.equal(room.hatch.open, 1);
	g.ball.placeAt(room.hatch.x, room.hatch.y);
	const t0 = g.time;
	runUntil(g, g => g.state === "scroll", 3);
	runUntil(g, g => g.state === "play", 2);
	assert.equal(g.level, 1);
	assert.equal(g.room.rx, 1);
	assert.ok(g.time > t0 + 3, "+5 seconds");
	assert.deepEqual([Math.round(g.ball.x), Math.round(g.ball.y)], [Math.round(room.hatch.x), Math.round(room.hatch.y)], "lands where the hatch was");
});

test("the tutorial ends in the boss room", () => {
	setup();
	const g = newGame(Mode.TUTORIAL);
	const r = findRoom(g, r => r.type === RoomType.BOSS);
	enterRoom(g, r.x, r.y);
	run(g, STEP);
	assert.equal(g.state, "over");
	assert.equal(g.log.ends[0].cause, "win");
	assert.equal(g.boss, null);
});

test("the map item opens the pause on the map", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const r = findRoom(g, r => r.type === RoomType.BONUS && r.content === 2 /* map */);
	enterRoom(g, r.x, r.y);
	g.ball.placeAt(305, 150);
	g.ball.vy = 400;
	run(g, 0.3);
	assert.ok(g.inventory.map);
	assert.deepEqual(g.log.pauses, ["map"]);
});

test("the result gives the explored part of the dungeon", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	const rooms = [...g.dungeon.allRooms()].length;
	const r = g.result("time");
	assert.equal(r.explored, Math.floor(100 / rooms));
	assert.equal(r.cause, "time");
});

// ----- robustness -----

test("random play in every mode : no crash, the ball stays sane", () => {
	for (const [mode, param] of [[Mode.CHALLENGE, 0], [Mode.ADVENTURE, 2], [Mode.COURSE, 3], [Mode.CLASSIC, 0], [Mode.TUTORIAL, 0]]) {
		setup(7);
		const g = newGame(mode, param);
		let rooms = 0;
		run(g, 90, (game, i) => {
			if (i % 60 === 0) {
				const a = Math.random() * Math.PI * 2;
				app.input.dir = { x: Math.cos(a), y: Math.sin(a) };
				if (Math.random() < 0.2)
					app.input.trigger("switchBall");
			}
			// visit other rooms now and then
			if (i % 1200 === 0 && game.state === "play") {
				const all = [...game.dungeon.allRooms()];
				const r = all[Math.floor(Math.random() * all.length)];
				enterRoom(game, r.x, r.y);
				rooms++;
			}
			const b = game.ball;
			assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.vx), mode + " : NaN");
			if (game.state === "play" && !b.falling)
				assert.ok(b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20, mode + " : ball out of the room");
		});
		assert.ok(rooms > 0);
	}
});
