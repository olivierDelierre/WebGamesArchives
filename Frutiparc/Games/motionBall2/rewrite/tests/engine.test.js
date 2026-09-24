/**
 * The engine : input, audio mixing, main loop, scene transitions, math.
 * The browser APIs they use are replaced by small fakes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Input } from "../src/engine/input.js";
import { AudioEngine } from "../src/engine/audio.js";
import { Loop } from "../src/engine/loop.js";
import { SceneManager } from "../src/engine/scenes.js";
import { angleDiff, decay, formatTime, clamp, weightedIndex, perFrameChance } from "../src/engine/math.js";

// ----- input -----

/** An input bound to a fake window, canvas and gamepad. */
function makeInput() {
	globalThis.window = new EventTarget();
	const pad = { connected: false, buttons: [], axes: [0, 0] };
	for (let i = 0; i < 16; i++)
		pad.buttons.push({ pressed: false });
	Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [pad] }, configurable: true });
	globalThis.performance = globalThis.performance || { now: () => Date.now() };

	const canvas = new EventTarget();
	canvas.setPointerCapture = () => { };
	const screen = { canvas, toGame: (x, y) => ({ x, y }) };
	const input = new Input(screen);

	const key = (type, code, repeat = false) => {
		const e = new Event(type);
		e.code = code;
		e.repeat = repeat;
		window.dispatchEvent(e);
	};
	const pointer = (type, x, y, pointerType = "touch", id = 1) => {
		const e = new Event(type);
		Object.assign(e, { clientX: x, clientY: y, pointerType, pointerId: id });
		canvas.dispatchEvent(e);
	};
	return { input, key, pointer, pad };
}

test("input : the keys give a direction, normalised in diagonal", () => {
	const { input, key } = makeInput();
	key("keydown", "ArrowRight");
	assert.deepEqual(input.axis(), { x: 1, y: 0 });
	key("keydown", "KeyW");
	const a = input.axis();
	assert.ok(Math.abs(Math.hypot(a.x, a.y) - 1) < 1e-9 && a.x > 0 && a.y < 0);
	key("keyup", "ArrowRight");
	key("keyup", "KeyW");
	assert.deepEqual(input.axis(), { x: 0, y: 0 });
	input.destroy();
});

test("input : an action is seen by one step only, and not repeated when held", () => {
	const { input, key } = makeInput();
	key("keydown", "Space");
	assert.ok(input.pressed("switchBall") && input.pressed("confirm"));
	input.endStep();
	assert.ok(!input.pressed("switchBall"));
	key("keydown", "Space", true);
	assert.ok(!input.pressed("switchBall"), "auto-repeat ignored");
	input.destroy();
});

test("input : losing the focus releases the keys", () => {
	const { input, key } = makeInput();
	key("keydown", "ArrowLeft");
	window.dispatchEvent(new Event("blur"));
	assert.deepEqual(input.axis(), { x: 0, y: 0 });
	input.destroy();
});

test("input : dragging a finger is a joystick, a short touch is a tap", () => {
	const { input, pointer } = makeInput();
	pointer("pointerdown", 100, 100);
	pointer("pointermove", 120, 100);
	assert.deepEqual(input.axis(), { x: 0.5, y: 0 });
	pointer("pointermove", 300, 100);
	assert.deepEqual(input.axis(), { x: 1, y: 0 }, "full speed at most");
	pointer("pointerup", 300, 100);
	assert.deepEqual(input.axis(), { x: 0, y: 0 });
	assert.equal(input.pointer, null, "a drag is not a tap");

	pointer("pointerdown", 50, 60);
	pointer("pointerup", 52, 61);
	assert.deepEqual(input.pointer, { x: 50, y: 60 });
	input.destroy();
});

test("input : the mouse clicks and hovers", () => {
	const { input, pointer } = makeInput();
	pointer("pointermove", 10, 20, "mouse");
	assert.deepEqual(input.hover, { x: 10, y: 20 });
	pointer("pointerdown", 30, 40, "mouse");
	assert.deepEqual(input.pointer, { x: 30, y: 40 });
	assert.equal(input.stick, null);
	input.destroy();
});

test("input : gamepad buttons (edge triggered) and stick", () => {
	const { input, pad } = makeInput();
	pad.connected = true;
	pad.buttons[9].pressed = true;
	input.poll();
	assert.ok(input.pressed("pause"));
	input.endStep();
	input.poll();
	assert.ok(!input.pressed("pause"), "held : once");
	pad.axes = [0.1, 0.1];
	assert.deepEqual(input.axis(), { x: 0, y: 0 }, "dead zone");
	pad.axes = [0, 0.9];
	assert.ok(input.axis().y > 0.8);
	input.destroy();
});

// ----- audio -----

/** An audio engine with a backend recording the voices. */
function makeAudio() {
	const audio = new AudioEngine({});
	const voices = [];
	audio.backend = {
		now: () => 0,
		unlock() { },
		setMaster() { },
		setBus(bus, v) {
			this.buses = { ...this.buses, [bus]: v };
		},
		start(name, volume, loop, bus) {
			const v = { name, volume, loop, bus, stopped: false, setVolume(x) { this.volume = x; }, stop() { this.stopped = true; } };
			voices.push(v);
			return v;
		}
	};
	return { audio, voices };
}

test("audio : the same effect is not played twice at once", () => {
	const { audio, voices } = makeAudio();
	audio.play("red");
	audio.play("red");
	audio.update(0.05);
	audio.play("red");
	assert.equal(voices.length, 2);
	assert.equal(voices[0].bus, "sfx");
});

test("audio : music cross-fade", () => {
	const { audio, voices } = makeAudio();
	audio.playMusic("a", 0.3, 1);
	audio.update(1);
	assert.equal(voices[0].volume, 0.3);
	audio.playMusic("a");
	assert.equal(voices.length, 1, "already playing");
	audio.playMusic("b", 0.3, 1);
	audio.update(0.5);
	assert.ok(voices[0].volume > 0 && voices[0].volume < 0.3);
	audio.update(0.6);
	assert.ok(voices[0].stopped);
	assert.equal(voices[1].volume, 0.3);
	assert.equal(voices[1].bus, "music");
});

test("audio : layered music, one audible layer at a time", () => {
	const { audio, voices } = makeAudio();
	audio.startLayers(["l1", "l2", "l3"], [0.2, 0.3, 0.4], 1);
	assert.equal(voices.length, 3, "all the layers play");
	audio.update(1);
	assert.deepEqual(voices.map(v => v.volume), [0.2, 0, 0]);
	audio.setLayer(2, 1);
	audio.update(1);
	assert.deepEqual(voices.map(v => v.volume), [0, 0, 0.4]);
	assert.equal(audio.layer, 2);
	audio.stopLayers(0.5);
	audio.update(0.6);
	assert.ok(voices.every(v => v.stopped));
	assert.equal(audio.layer, -1);
});

test("audio : music and effects can be switched off separately", () => {
	const { audio } = makeAudio();
	audio.setMusicEnabled(false);
	audio.setSoundsEnabled(true);
	assert.deepEqual(audio.backend.buses, { music: 0, sfx: 1 });
});

test("audio : music and effects have their own volume, while switched on", () => {
	const { audio } = makeAudio();
	audio.setMusicVolume(0.4);
	audio.setSoundsVolume(0.7);
	assert.deepEqual(audio.backend.buses, { music: 0.4, sfx: 0.7 });
	audio.setMusicEnabled(false);
	assert.deepEqual(audio.backend.buses, { music: 0, sfx: 0.7 });
	audio.setMusicEnabled(true);
	audio.setSoundsVolume(3);
	assert.deepEqual(audio.backend.buses, { music: 0.4, sfx: 1 }, "at most 1");
});

// ----- loop -----

test("loop : fixed steps, whatever the frame rate ; a long pause is not caught up", () => {
	let now = 0;
	let callback = null;
	globalThis.performance = { now: () => now };
	globalThis.requestAnimationFrame = fn => {
		callback = fn;
	};
	let steps = 0;
	let frames = 0;
	const loop = new Loop(dt => {
		steps++;
		assert.equal(dt, 1 / 120);
	}, () => frames++);
	loop.start();

	// one second at 60 frames per second
	for (let i = 1; i <= 60; i++) {
		now = i * 1000 / 60;
		callback(now);
	}
	assert.equal(frames, 60);
	assert.ok(Math.abs(steps - 120) <= 1, steps + " steps");

	// a 10 s pause (background tab) : at most 16 steps
	steps = 0;
	now += 10000;
	callback(now);
	assert.ok(steps <= 16);
	loop.stop();
});

// ----- scenes -----

test("scenes : fade out (the old scene is frozen), swap, fade in (the new one runs)", () => {
	const log = [];
	const scene = name => ({
		enter: () => log.push("enter " + name),
		exit: () => log.push("exit " + name),
		update: () => log.push("update " + name),
		render() { }
	});
	const m = new SceneManager();
	m.goto(scene("a"), true);
	m.update(0.1);
	m.goto(scene("b"));
	assert.ok(m.busy);
	m.update(0.2);
	m.update(0.2);
	m.update(0.4);
	m.update(0.1);
	assert.deepEqual(log, ["enter a", "update a", "exit a", "enter b", "update b", "update b"]);
	assert.equal(m.busy, false);
});

// ----- math -----

test("math helpers", () => {
	assert.ok(Math.abs(angleDiff(0.1, -0.1) + 0.2) < 1e-9);
	assert.ok(Math.abs(angleDiff(3, -3) - (2 * Math.PI - 6)) < 1e-9, "across PI");
	assert.ok(Math.abs(decay(0.9, 1 / 40) - 0.9) < 1e-12, "one original frame");
	assert.ok(Math.abs(decay(0.9, 1 / 120) ** 3 - 0.9) < 1e-12, "same over 3 short steps");
	assert.ok(Math.abs(perFrameChance(1000, 1) - (1 - 0.999 ** 40)) < 1e-12);
	assert.equal(clamp(5, 0, 3), 3);
	assert.equal(formatTime(75.5), "1:15");
	assert.equal(formatTime(75.5, true), "01:15:50");
	assert.equal(formatTime(-3), "0:00");
	assert.equal(weightedIndex([0, 0, 5]), 2);
});
