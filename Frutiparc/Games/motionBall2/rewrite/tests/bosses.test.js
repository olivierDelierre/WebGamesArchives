/**
 * The bosses : they appear when the ball is in the boss room, can be hurt,
 * die, and the game is then won. Also their powers.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setup, newGame, run, runUntil, enterRoom, findRoom, testRoom, app, STEP } from "./helpers.js";
import { Mode, RoomType, BallType } from "../src/data/enums.js";
import { Octopus } from "../src/bosses/octopus.js";
import { Snake } from "../src/bosses/snake.js";
import { Tourneboule } from "../src/bosses/tourneboule.js";
import { Water, Fire, Earth, Wind } from "../src/bosses/powers.js";

/** A game in its boss room, the boss started. */
function bossGame(mode, param = 0) {
	const g = newGame(mode, param);
	const r = findRoom(g, r => r.type === RoomType.BOSS);
	enterRoom(g, r.x, r.y);
	g.ball.placeAt(305, 330);
	run(g, STEP);
	return g;
}

/** Keeps the ball alive (the tests are about the boss). */
const invulnerable = g => {
	g.ball.invulnerable = 1;
};

test("each dungeon has its boss ; the doors close behind the ball", () => {
	const cases = [[Mode.CHALLENGE, 0, Octopus], [Mode.ADVENTURE, 0, Snake], [Mode.ADVENTURE, 3, Snake], [Mode.ADVENTURE, 4, Tourneboule]];
	for (const [mode, param, Boss] of cases) {
		setup();
		const g = bossGame(mode, param);
		assert.ok(g.boss instanceof Boss, mode + " " + param);
		assert.equal(app.audio.music, "musicBoss");
		run(g, 0.5);
		assert.ok(g.room.doors.every(d => d.solid), "doors closed");
	}
});

// ----- octopus -----

test("octopus : sending its eye back hurts it", () => {
	setup(3);
	const g = bossGame(Mode.CHALLENGE);
	const o = g.boss;
	runUntil(g, g => g.boss.eye, 60);
	// let it fly away from the octopus, then the ball meets it head on
	run(g, 0.3, invulnerable);
	const eye = o.eye;
	const d = Math.hypot(eye.vx, eye.vy);
	g.ball.fall = null;
	g.ball.placeAt(eye.x + eye.vx / d * 30, eye.y + eye.vy / d * 30);
	g.ball.vx = -eye.vx;
	g.ball.vy = -eye.vy;
	run(g, STEP);
	assert.ok(!o.eye || o.eye.back, "sent back");
	runUntil(g, () => o.hits === 1, 5);
	assert.ok(o.hurt > 0);
});

test("octopus : it can catch the ball, and spits it out", () => {
	setup(5);
	const g = bossGame(Mode.CHALLENGE);
	const o = g.boss;
	o.state = { name: "suck", time: 10 };
	g.ball.placeAt(o.x, o.y + 10);
	run(g, STEP);
	assert.equal(g.ball.controlled, false);
	assert.ok(g.ball.hidden);
	runUntil(g, g => g.ball.controlled, 3);
	assert.ok(!g.ball.hidden);
	assert.ok(Math.hypot(g.ball.vx, g.ball.vy) > 1000, "thrown hard");
});

test("octopus : its big jump breaks the floor", () => {
	setup(2);
	const g = bossGame(Mode.CHALLENGE);
	const o = g.boss;
	const holes = g.room.holes.length;
	o.state = { name: "jumps", count: 1, breaks: 2, time: 0, height: 300, speed: 1500, turn: 4, move: 400, angle: 0 };
	run(g, 1, invulnerable);
	assert.equal(g.room.holes.length, holes + 2);
});

test("octopus : after 4 hits it dies and the game is won", () => {
	setup();
	const g = bossGame(Mode.CHALLENGE);
	g.boss.hits = 4;
	g.boss.hurt = STEP;
	runUntil(g, g => g.state === "over", 5);
	assert.equal(g.log.ends[0].cause, "win");
});

// ----- snakes -----

test("snake : hitting its head from the front breaks a ring", () => {
	setup(4);
	const g = bossGame(Mode.ADVENTURE, 1);
	const s = g.boss;
	const parts = s.parts.length;
	const head = s.parts[0];
	g.ball.placeAt(head.x + Math.cos(s.angle) * 20, head.y + Math.sin(s.angle) * 20);
	s.collide(g);
	assert.equal(s.parts.length, parts - 1);
	assert.ok(s.angry > 0);
	// angry : no more damage
	s.collide(g);
	assert.equal(s.parts.length, parts - 1);
});

test("snake : its tail kills", () => {
	setup(4);
	const g = bossGame(Mode.ADVENTURE, 1);
	const s = g.boss;
	// let it stretch out (at first all its parts are in the middle)
	run(g, 3, g => {
		invulnerable(g);
		g.ball.placeAt(305, 380);
	});
	const tail = s.parts[s.parts.length - 1];
	// (away from the head, which is tested first)
	s.parts[0].x = tail.x + 500;
	g.ball.invulnerable = 0;
	g.ball.fall = null;
	g.ball.placeAt(tail.x, tail.y);
	s.collide(g);
	assert.ok(g.ball.falling);
});

test("snake : without rings it goes berserk, then dies", () => {
	setup();
	const g = bossGame(Mode.ADVENTURE, 2);
	const s = g.boss;
	while (s.parts.length > 2) {
		s.angry = 0;
		s.loseRing(g);
	}
	assert.equal(s.berserk, 10);
	run(g, 12, invulnerable);
	runUntil(g, g => g.state === "over", 5);
	assert.equal(g.log.ends[0].cause, "win");
});

test("snake : each element casts its power, a limited number of times", () => {
	const powers = [Water, Fire, Wind, Earth];
	const max = [2, 3, 1, 3];
	for (let e = 0; e < 4; e++) {
		setup();
		const g = bossGame(Mode.ADVENTURE, e);
		for (let i = 0; i < 5; i++)
			g.boss.castPower(g);
		const cast = g.room.entities.filter(x => x instanceof powers[e]);
		assert.equal(cast.length, max[e], "element " + e);
	}
});

// ----- final boss -----

test("Tourneboule : the first touch pops its shield, the next one hurts", () => {
	setup();
	const g = bossGame(Mode.ADVENTURE, 4);
	const t = g.boss;
	runUntil(g, () => t.state.name === "wait", 5);
	assert.ok(t.shield);
	g.ball.placeAt(t.x + 20, t.y);
	t.collide(STEP, g);
	assert.equal(t.shield, false);
	assert.equal(t.hits, 0);
	t.collide(STEP, g);
	assert.equal(t.hits, 1);
	t.collide(STEP, g);
	assert.equal(t.hits, 1, "not hurt twice in a row");
});

test("Tourneboule : its cycle goes through all its states", () => {
	setup(9);
	const g = bossGame(Mode.ADVENTURE, 4);
	const seen = new Set();
	run(g, 30, g => {
		invulnerable(g);
		// keep the ball away from it (and from the holes in the lower corners)
		g.ball.placeAt(g.boss.x < 305 ? 450 : 160, g.boss.y < 205 ? 300 : 80);
		seen.add(g.boss.state.name);
	});
	for (const s of ["land", "wait", "kata", "takeoff", "fly", "hidden", "appear"])
		assert.ok(seen.has(s), s);
	assert.equal(g.state, "play");
});

test("Tourneboule : every power works", () => {
	for (let power = 0; power < 6; power++) {
		setup(power + 1);
		const g = bossGame(Mode.ADVENTURE, 4);
		const t = g.boss;
		t.ball = g.ball;
		const holes = g.room.holes.length;
		const blocks = g.room.blocks.length;
		t.cast(power, g);
		run(g, 2, invulnerable);
		if (power === 4)
			assert.ok(g.room.holes.length > holes, "new holes");
		else if (power === 5)
			assert.equal(g.room.blocks.length, blocks + 1, "a new block");
		else
			assert.ok(t.powers.length > 0 || g.room.entities.some(e => e.constructor.name === ["Wind", "Fire", "Water", "Earth"][power]), "power " + power);
	}
});

test("Tourneboule : after 4 hits it stays on the floor, and dies at 20", () => {
	setup();
	const g = bossGame(Mode.ADVENTURE, 4);
	const t = g.boss;
	t.hits = 4;
	t.startKatas(g);
	runUntil(g, g => g.state === "over", 60);
	assert.equal(g.log.ends[0].cause, "win");
	assert.ok(t.hits >= 20);
});

// ----- powers on the ball -----

test("water makes the floor slippery for a while", () => {
	setup();
	const g = bossGame(Mode.ADVENTURE, 0);
	const w = new Water(g.boss, false);
	g.room.add(w);
	w.x = g.ball.x;
	w.y = g.ball.y;
	run(g, STEP * 2, invulnerable);
	assert.ok(g.ball.water);
	w.destroy();
	run(g, 1, invulnerable);
	assert.equal(g.ball.water, false);
});

test("fire kills when burning, not while it starts", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, []);
	const fire = new Fire({ x: 305, y: 205 });
	g.room.add(fire);
	run(g, 0.1);
	assert.ok(!g.ball.falling, "harmless embers");
	runUntil(g, g => g.ball.falling, 1);
	run(g, 1);
	assert.equal(g.inventory.balls[BallType.YELLOW], 2);
});

test("the earth vine holds the ball, and breaks when pulled far", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, []);
	const bud = new Earth({ x: 305, y: 205 });
	g.room.add(bud);
	g.ball.placeAt(bud.x, bud.y);
	run(g, STEP);
	assert.ok(bud.vine, "tied");
	g.ball.placeAt(bud.x + 240, bud.y);
	run(g, 0.5);
	assert.equal(bud.vine, null, "broken");
});

test("the whirlwind blows the ball away", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, []);
	g.room.add(new Wind({ x: 280, y: 205 }, false));
	run(g, 0.5);
	assert.ok(g.ball.x > 310);
});

test("the metal ball is not sucked by the magnets but the octopus still sucks it", () => {
	setup();
	const g = bossGame(Mode.CHALLENGE);
	g.ball.setType(BallType.METAL);
	g.boss.state = { name: "suck", time: 5 };
	g.ball.placeAt(g.boss.x, g.boss.y + 100);
	run(g, 0.3, invulnerable);
	assert.ok(g.ball.y < g.boss.y + 100);
});
