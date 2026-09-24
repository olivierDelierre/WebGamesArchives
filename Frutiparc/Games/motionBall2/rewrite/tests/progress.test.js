/**
 * The saved progression : unlocks and records, and the saving done at the
 * end of a game by the play scene.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setup, app } from "./helpers.js";
import { Progress } from "../src/progress.js";
import { Storage } from "../src/engine/storage.js";
import { PlayScene } from "../src/scenes/play.js";
import { Mode } from "../src/data/enums.js";

/** A localStorage in memory. */
function fakeLocalStorage() {
	const data = new Map();
	globalThis.localStorage = {
		getItem: k => data.has(k) ? data.get(k) : null,
		setItem: (k, v) => data.set(k, String(v)),
		removeItem: k => data.delete(k)
	};
	return data;
}

test("defaults : 4 adventures and the first course open", () => {
	const p = new Progress();
	assert.deepEqual([0, 1, 2, 3, 4].map(i => p.adventureUnlocked(i)), [true, true, true, true, false]);
	assert.deepEqual([0, 1, 2].map(i => p.courseUnlocked(i)), [true, false, false]);
});

test("the final adventure opens once the 4 others are won", () => {
	const p = new Progress();
	for (let i = 0; i < 3; i++)
		p.winAdventure(i, 50);
	assert.equal(p.adventureUnlocked(4), false);
	p.winAdventure(3, 50);
	assert.equal(p.adventureUnlocked(4), true);
});

test("adventure scores : the best one is kept", () => {
	const p = new Progress();
	assert.equal(p.winAdventure(0, 300), 0);
	assert.equal(p.adventureScore(0, 100), 300);
	assert.equal(p.data.adventures.best[0], 300);
});

test("course times : ranked among the 3 best, beating one opens the next course", () => {
	const p = new Progress();
	const slow = p.courseTime(0, 10 * 60);
	assert.equal(slow.rank, -1);
	assert.equal(p.courseUnlocked(1), false);

	const r = p.courseTime(0, 3 * 60 + 10);   // between gold (3:00) and silver (3:40)
	assert.equal(r.rank, 1);
	assert.ok(r.unlockedNext);
	assert.ok(p.courseUnlocked(1));
	assert.deepEqual(r.table.map(x => [x.time, x.cpu, x.mine]), [[180, true, false], [190, false, true], [220, true, false]]);

	const again = p.courseTime(0, 100);
	assert.equal(again.rank, 0);
	assert.equal(again.unlockedNext, false, "already open");
	assert.equal(p.data.courses.records[0].length, 3);
});

test("best scores : only a better one replaces the record", () => {
	const p = new Progress();
	assert.equal(p.best("classicBest", 5), 0);
	assert.equal(p.best("classicBest", 3), 5);
	assert.equal(p.data.classicBest, 5);
});

test("the progression is saved and read back", () => {
	fakeLocalStorage();
	const p = new Progress();
	p.winAdventure(2, 77);
	p.settings.music = false;
	p.save();
	const q = new Progress();
	assert.equal(q.data.adventures.best[2], 77);
	assert.equal(q.settings.music, false);
	assert.equal(q.settings.sounds, true);
	delete globalThis.localStorage;
});

test("a broken or old save falls back to the defaults", () => {
	const data = fakeLocalStorage();
	data.set("k", "not json");
	assert.deepEqual(new Storage("k", { a: 1 }).data, { a: 1 });
	data.set("k", JSON.stringify({ b: 2, nested: { y: 3 } }));
	assert.deepEqual(new Storage("k", { a: 1, nested: { x: 1, y: 1 } }).data, { a: 1, b: 2, nested: { x: 1, y: 3 } });
	delete globalThis.localStorage;
});

test("without localStorage, saving does not fail", () => {
	delete globalThis.localStorage;
	const p = new Progress();
	p.best("classicBest", 9);
	assert.equal(p.data.classicBest, 9);
});

// ----- end of a game -----

function endGame(mode, param, result) {
	setup();
	const scene = new PlayScene(mode, param);
	scene.enter();
	scene.end({ mode, param, time: 0, level: 1, explored: 0, ...result });
	return scene;
}

test("end of a game : the records are saved", () => {
	let s = endGame(Mode.CHALLENGE, 0, { cause: "win", explored: 40, time: 120 });
	assert.equal(app.save.data.challengeBest, 160);
	assert.equal(s.ending.heading, "Victoire !");

	s = endGame(Mode.CLASSIC, 0, { cause: "time", level: 7 });
	assert.equal(app.save.data.classicBest, 7);
	assert.equal(s.ending.heading, "Temps écoulé !");

	s = endGame(Mode.COURSE, 2, { cause: "win", time: 100 });
	assert.ok(app.save.courseUnlocked(3));
	assert.equal(s.ending.table.length, 3);

	s = endGame(Mode.ADVENTURE, 1, { cause: "win", explored: 10, time: 5 });
	assert.ok(app.save.data.adventures.won[1]);

	s = endGame(Mode.ADVENTURE, 1, { cause: "balls" });
	assert.equal(s.ending.heading, "Plus de billes !");
});
