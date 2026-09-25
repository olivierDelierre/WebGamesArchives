/**
 * Entry point : sets up the services (app.js), loads the assets while
 * showing the original "loading" screen, then starts the main loop on the
 * title screen.
 */

import { WIDTH as W, HEIGHT as H } from "./config.js";
import { app } from "./app.js";
import { Screen } from "./engine/screen.js";
import { Input } from "./engine/input.js";
import { AudioEngine } from "./engine/audio.js";
import { ImageStore } from "./engine/assets.js";
import { SceneManager } from "./engine/scenes.js";
import { Loop } from "./engine/loop.js";
import { Progress } from "./progress.js";
import { Achievements } from "./achievements.js";
import { SOUND_FILES } from "./sounds.js";
import { TitleScene } from "./scenes/title.js";
import { applySettings } from "./scenes/menu.js";
import { PlayScene } from "./scenes/play.js";
import { xflBitmapFiles, clip } from "./gfx/xfl/index.js";


function start() {
	const canvas = document.getElementById("game");
	app.screen = new Screen(canvas);
	app.input = new Input(app.screen);
	app.audio = new AudioEngine(SOUND_FILES);
	app.images = new ImageStore();
	app.save = new Progress();
	app.achievements = new Achievements(app.save);
	app.scenes = new SceneManager();

	// the on-screen buttons of the touch screens
	const bindButton = (id, action) => {
		const el = document.getElementById(id);
		if (el)
			el.addEventListener("pointerdown", e => {
				e.preventDefault();
				app.audio.unlock();
				app.input.trigger(action);
			});
	};
	bindButton("tbBall", "switchBall");
	bindButton("tbPause", "pause");

	// browsers only allow sound after a user gesture
	const unlock = () => app.audio.unlock();
	window.addEventListener("keydown", unlock);
	window.addEventListener("pointerdown", unlock);

	// ----- loading -----

	// ("loading" plays its animation, waits at "loadReady" until everything is
	// loaded, then plays its end and calls "loadFinish")
	let images = 0;
	let sounds = 0;
	let ready = false;
	let finished = false;
	const loading = clip("loading");
	loading.on = event => {
		if (event === "loadFinish")
			finished = true;
	};
	let last = performance.now();
	const drawLoading = now => {
		loading.update(Math.min(0.1, (now - last) / 1000));
		last = now;
		loading.setText("progress", Math.floor((images + sounds) / 2 * 100) + " %");
		if (ready && loading.frame >= loading.frameOf(10))
			loading.play();
		const ctx = app.screen.begin();
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, W, H);
		loading.draw(ctx);
		if (finished) {
			applySettings();
			app.scenes.goto(new TitleScene(), true);
			new Loop(step, render).start();
		} else {
			requestAnimationFrame(drawLoading);
		}
	};
	requestAnimationFrame(drawLoading);

	const fonts = document.fonts ? document.fonts.ready.catch(() => { }) : Promise.resolve();
	Promise.all([
		app.images.load(xflBitmapFiles(), p => {
			images = p;
		}),
		app.audio.load(p => {
			sounds = p;
		}),
		fonts
	]).then(() => {
		ready = true;
	});
}

/** One simulation step. */
function step(dt) {
	app.time += dt;
	app.audio.update(dt);
	app.scenes.update(dt);
	app.achievements.update(dt);
	app.input.endStep();
}

/** One displayed frame. */
function render() {
	app.input.poll();
	const ctx = app.screen.begin();
	app.scenes.render(ctx);
	app.achievements.render(ctx);
}

start();

// handy in the browser console, and for the tests :
//   motionball.scenes.current.game                  the game being played
//   motionball.play("adventure", 2)                 starts a game
window.motionball = app;
app.play = (mode, param = 0) => app.scenes.goto(new PlayScene(mode, param), true);
