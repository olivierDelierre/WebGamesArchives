/**
 * The achievements : what the game tells them, what unlocks each one, their
 * counters, the banner, and their screen.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setup, newGame, run, testRoom, item, tileItem, fakeContext, app, STEP } from "./helpers.js";
import { Mode, Item, BallType } from "../src/data/enums.js";
import { TILE, TILE_ORIGIN } from "../src/config.js";
import { ACHIEVEMENTS, Achievements } from "../src/achievements.js";
import { PlayScene } from "../src/scenes/play.js";
import { MenuScene } from "../src/scenes/menu.js";
import { AchievementsScene } from "../src/scenes/achievements.js";

const tileCentre = (tx, ty) => ({ x: TILE_ORIGIN + tx * TILE + TILE / 2, y: TILE_ORIGIN + ty * TILE + TILE / 2 });
const unlocked = id => app.achievements.isUnlocked(id);

/** Runs a scene, drawing it on a fake canvas. */
function play(scene, seconds) {
	const ctx = fakeContext();
	for (let i = 0; i < Math.round(seconds / STEP); i++) {
		app.time += STEP;
		scene.update(STEP);
		app.achievements.update(STEP);
		app.input.endStep();
		scene.render(ctx);
		app.achievements.render(ctx);
	}
}

/** Ends a game the way the play screen does (records, then achievements). */
function endGame(mode, param, result) {
	const scene = new PlayScene(mode, param);
	scene.enter();
	scene.end({ mode, param, time: 0, level: 1, explored: 0, ...result });
	return scene;
}

test("achievements : each has an id, a name, a text, and a goal when it counts", () => {
	const ids = new Set(ACHIEVEMENTS.map(a => a.id));
	assert.equal(ids.size, ACHIEVEMENTS.length, "unique ids");
	for (const a of ACHIEVEMENTS) {
		assert.ok(a.name && a.text, a.id);
		assert.ok(!a.counter || a.goal > 0, a.id);
	}
});

test("achievements : taking red pastilles, breaking green blocks and falling are counted", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	testRoom(g, [item(Item.RED, 305, 205, 24), tileItem(Item.BLOCK, 8, 4), tileItem(Item.HOLE, 3, 4)]);
	run(g, STEP * 2);
	const c = app.achievements.data.counters;
	assert.equal(c.pastilles, 1);

	g.ball.setType(BallType.GREEN);
	g.ball.placeAt(tileCentre(8, 4).x - 40, tileCentre(8, 4).y);
	g.ball.vx = 300;
	run(g, 0.2);
	assert.equal(c.blocks, 1);

	g.ball.placeAt(tileCentre(3, 4).x, tileCentre(3, 4).y);
	run(g, 1.5);
	assert.equal(c.falls, 1);
	assert.equal(g.stats.lost, 1, "a ball lost");
});

test("achievements : the counters unlock at their goal, with a banner", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	app.achievements.data.counters.pastilles = 498;
	g.achieve("pastille");
	assert.ok(!unlocked("pastilles"));
	g.achieve("pastille");
	assert.ok(unlocked("pastilles"));
	assert.equal(app.achievements.banners.length, 1);
	g.achieve("pastille");
	assert.equal(app.achievements.banners.length, 1, "only once");
	app.achievements.render(fakeContext());
	app.achievements.update(5);
	assert.equal(app.achievements.banners.length, 0, "the banner goes away");
});

test("achievements : a Challenge won quickly and without losing a ball", () => {
	setup();
	endGame(Mode.CHALLENGE, 0, { cause: "win", time: 400 });
	assert.ok(unlocked("octopus") && unlocked("flawless") && unlocked("express"));

	setup();
	const scene = new PlayScene(Mode.CHALLENGE, 0);
	scene.enter();
	scene.game.achieve("lost");
	scene.end({ mode: Mode.CHALLENGE, param: 0, cause: "win", time: 100, level: 1, explored: 50 });
	assert.ok(unlocked("octopus"));
	assert.ok(!unlocked("flawless"), "a ball was lost");
	assert.ok(!unlocked("express"), "less than 5 minutes left");

	setup();
	endGame(Mode.CHALLENGE, 0, { cause: "time" });
	assert.ok(!unlocked("octopus"), "a lost game unlocks nothing");
});

test("achievements : the adventures, the courses, the tutorial, the Classique levels", () => {
	setup();
	for (let i = 0; i < 3; i++)
		endGame(Mode.ADVENTURE, i, { cause: "win", explored: 50, time: 10 });
	assert.ok(unlocked("adventure"));
	assert.ok(!unlocked("elements"));
	endGame(Mode.ADVENTURE, 3, { cause: "win", explored: 50, time: 10 });
	assert.ok(unlocked("elements"), "the four elemental adventures");
	assert.ok(!unlocked("final"));
	endGame(Mode.ADVENTURE, 4, { cause: "win", explored: 50, time: 10 });
	assert.ok(unlocked("final"));

	// a course : first place under every CPU time
	endGame(Mode.COURSE, 0, { cause: "win", time: 60 });
	assert.ok(unlocked("driver") && unlocked("champion"));
	setup();
	endGame(Mode.COURSE, 0, { cause: "win", time: 500 });
	assert.ok(unlocked("driver") && !unlocked("champion"), "not classed");

	endGame(Mode.TUTORIAL, 0, { cause: "win" });
	assert.ok(unlocked("tutorial"));

	const g = newGame(Mode.CLASSIC);
	g.achieve("level", 9);
	assert.ok(!unlocked("diver"));
	g.achieve("level", 10);
	assert.ok(unlocked("diver") && !unlocked("abyss"));
	g.achieve("level", 25);
	assert.ok(unlocked("abyss"));
});

test("achievements : the balls of a game, the map and the radar", () => {
	setup();
	const g = newGame(Mode.CHALLENGE);
	for (const t of [BallType.GREEN, BallType.BLUE, BallType.METAL])
		g.collectBall(t);
	assert.ok(!unlocked("collector"));
	g.collectBall(BallType.VIOLET);
	assert.ok(unlocked("collector"), "the 4 balls of the dungeon");
	assert.ok(!unlocked("rainbow"));
	g.collectBall(BallType.ORANGE);
	g.collectBall(BallType.RED);
	assert.ok(unlocked("rainbow"), "7 balls");

	g.inventory.map = true;
	g.achieve("item");
	assert.ok(!unlocked("cartographer"));
	g.inventory.radar = true;
	g.achieve("item");
	assert.ok(unlocked("cartographer"));
});

test("achievements : they are kept in the save", () => {
	setup();
	endGame(Mode.TUTORIAL, 0, { cause: "win" });
	const again = new Achievements(app.save);
	assert.ok(again.isUnlocked("tutorial"));
	assert.ok(again.date("tutorial") > 0);
	assert.equal(again.unlockedCount, 1);
});

test("achievements : the menu's ball opens their screen, which goes back to the menu", () => {
	setup();
	app.achievements.data.counters.blocks = 40;
	endGame(Mode.TUTORIAL, 0, { cause: "win" });
	const menu = new MenuScene();
	const i = menu.group.buttons.findIndex(b => b.name === "succes");
	assert.ok(i >= 0);
	menu.group.focus = i;
	app.input.trigger("confirm");
	for (let n = 0; n < 400 && !(app.scenes.current instanceof AchievementsScene); n++)
		play(menu, STEP);
	const screen = app.scenes.current;
	assert.ok(screen instanceof AchievementsScene);
	play(screen, 0.5);
	app.input.trigger("back");
	play(screen, STEP);
	assert.ok(app.scenes.current instanceof MenuScene);
	assert.equal(app.scenes.current.group.focused.name, "succes", "back on its ball");
});
