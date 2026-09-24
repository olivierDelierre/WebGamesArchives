/**
 * The screens : navigation, pause, end of game ; and every drawing path run
 * on a fake canvas (it draws nothing, but an error in the drawing code
 * would throw).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setup, run, fakeContext, findRoom, enterRoom, app, STEP } from "./helpers.js";
import { TitleScene } from "../src/scenes/title.js";
import { MenuScene } from "../src/scenes/menu.js";
import { PlayScene } from "../src/scenes/play.js";
import { Mode, RoomType } from "../src/data/enums.js";

/** Runs a scene for `seconds`, drawing it every step. */
function play(scene, seconds, each) {
	const ctx = fakeContext();
	const steps = Math.round(seconds / STEP);
	for (let i = 0; i < steps; i++) {
		if (each)
			each(i);
		app.time += STEP;
		scene.update(STEP);
		app.input.endStep();
		scene.render(ctx);
	}
}

function press(scene, action) {
	app.input.trigger(action);
	play(scene, STEP);
}

// ----- navigation -----

test("title : a key goes to the menu, with its music", () => {
	setup();
	const title = new TitleScene();
	play(title, 0.5);
	press(title, "confirm");
	assert.ok(app.scenes.current instanceof MenuScene);
	assert.equal(app.audio.music, "musicMenu");
});

test("title : a tap goes to the menu too", () => {
	setup();
	const title = new TitleScene();
	app.input.pointer = { x: 100, y: 100 };
	play(title, STEP);
	assert.ok(app.scenes.current instanceof MenuScene);
});

test("menu : the arrows move between the modes, confirm opens them", () => {
	setup();
	const menu = new MenuScene();
	assert.equal(menu.group.focused.name, "challenge");
	press(menu, "right");
	assert.equal(menu.group.focused.name, "course");
	press(menu, "down");
	assert.equal(menu.group.focused.name, "options");
	press(menu, "up");
	press(menu, "confirm");
	assert.equal(menu.page, "course");
	press(menu, "back");
	assert.equal(menu.page, "main");
	assert.equal(menu.group.focused.name, "course", "the focus stays on the mode");
});

test("menu : clicking a mode starts it", () => {
	setup();
	const menu = new MenuScene();
	const classic = menu.group.buttons.find(b => b.name === "classique");
	app.input.pointer = { x: classic.x, y: classic.y };
	play(menu, STEP);
	assert.ok(app.scenes.current instanceof PlayScene);
	assert.equal(app.scenes.current.mode, Mode.CLASSIC);
	assert.ok(app.scenes.current.game, "the game is created");
});

test("menu : locked adventures and courses can't be started", () => {
	setup();
	const menu = new MenuScene("adventure");
	menu.group.focus = 4;
	press(menu, "confirm");
	assert.ok(!(app.scenes.current instanceof PlayScene));
	menu.group.focus = 0;
	press(menu, "confirm");
	assert.ok(app.scenes.current instanceof PlayScene);
	assert.equal(app.scenes.current.mode, Mode.ADVENTURE);
});

test("menu : the options toggle the music and the sounds", () => {
	setup();
	const menu = new MenuScene("options");
	press(menu, "confirm");
	assert.equal(app.save.settings.music, false);
	press(menu, "down");
	press(menu, "confirm");
	assert.equal(app.save.settings.sounds, false);
});

// ----- playing -----

test("pause : the game stops, and goes on after the pause", () => {
	setup();
	const scene = new PlayScene(Mode.CHALLENGE);
	scene.enter();
	play(scene, 0.2);
	press(scene, "pause");
	assert.ok(scene.paused);
	const t = scene.game.time;
	play(scene, 1);
	assert.equal(scene.game.time, t, "no time passes");
	press(scene, "pause");
	assert.equal(scene.paused, null);
	play(scene, 0.5);
	assert.ok(scene.game.time < t);
});

test("pause : quitting goes back to the menu", () => {
	setup();
	const scene = new PlayScene(Mode.CHALLENGE);
	scene.enter();
	press(scene, "pause");
	press(scene, "down");
	press(scene, "confirm");
	assert.ok(app.scenes.current instanceof MenuScene);
});

test("end of the game : the panel, then back to the menu", () => {
	setup();
	const scene = new PlayScene(Mode.CLASSIC);
	scene.enter();
	scene.game.time = 0.1;
	play(scene, 0.5);
	assert.ok(scene.ending);
	press(scene, "confirm");
	assert.ok(!(app.scenes.current instanceof MenuScene), "not before the panel is shown");
	play(scene, 1);
	press(scene, "confirm");
	assert.ok(app.scenes.current instanceof MenuScene);
});

// ----- drawing -----

test("drawing : every menu page", () => {
	setup();
	play(new TitleScene(), 0.2);
	for (const page of ["main", "adventure", "course", "options", "help"]) {
		const menu = new MenuScene(page);
		for (let i = 0; i < menu.group.buttons.length; i++) {
			menu.group.focus = i;
			play(menu, STEP * 2);
		}
	}
});

test("drawing : every mode, while playing, scrolling, paused (with the map) and at the end", () => {
	for (const [mode, param] of [[Mode.CHALLENGE, 0], [Mode.ADVENTURE, 1], [Mode.COURSE, 0], [Mode.CLASSIC, 0], [Mode.TUTORIAL, 0]]) {
		setup(3);
		const scene = new PlayScene(mode, param);
		scene.enter();
		const g = scene.game;
		app.input.dir = { x: 0.6, y: -0.8 };
		app.input.stick = { x0: 100, y0: 100, x: 120, y: 90 };
		play(scene, 3);

		// every room of the dungeon (the first 12 columns in Classique)
		for (const { x, y } of g.dungeon.allRooms()) {
			if (x > 12)
				continue;
			enterRoom(g, x, y);
			play(scene, STEP * 2);
		}

		g.inventory.map = true;
		g.inventory.radar = true;
		press(scene, "pause");
		play(scene, 0.2);
		press(scene, "pause");

		g.end("time");
		play(scene, 1);
	}
});

test("drawing : every boss, through its fight", () => {
	for (const [mode, param] of [[Mode.CHALLENGE, 0], [Mode.ADVENTURE, 0], [Mode.ADVENTURE, 1], [Mode.ADVENTURE, 2], [Mode.ADVENTURE, 3], [Mode.ADVENTURE, 4]]) {
		setup(11);
		const scene = new PlayScene(mode, param);
		scene.enter();
		const g = scene.game;
		const r = findRoom(g, r => r.type === RoomType.BOSS);
		enterRoom(g, r.x, r.y);
		play(scene, 25, i => {
			g.ball.invulnerable = 1;
			// the boss casts its powers now and then
			if (i % 400 === 0 && g.boss && g.boss.castPower)
				g.boss.castPower(g);
			if (i % 400 === 0 && g.boss && g.boss.cast) {
				g.boss.ball = g.ball;
				g.boss.cast(Math.floor(i / 400) % 6, g);
			}
		});
		assert.ok(g.boss, mode + " " + param);
		// its death
		if (g.boss && g.state === "play") {
			if (g.boss.parts) {
				g.boss.parts.splice(1, g.boss.parts.length - 2);
				g.boss.berserk = STEP;
			} else if (g.boss.hurt !== undefined && g.boss.eye !== undefined) {
				g.boss.hits = 4;
				g.boss.hurt = STEP;
			} else {
				g.boss.die(g);
			}
		}
		play(scene, 15, () => {
			g.ball.invulnerable = 1;
		});
		assert.equal(g.state, "over", mode + " " + param);
	}
});
