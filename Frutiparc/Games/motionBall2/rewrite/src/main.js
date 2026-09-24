/**
 * Entry point : sets up the services (app.js), loads the assets while
 * showing a loading bar, then starts the main loop on the title screen.
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
import { SOUND_FILES } from "./sounds.js";
import { text } from "./gfx/draw.js";
import { TitleScene } from "./scenes/title.js";
import { applySettings } from "./scenes/menu.js";
import { PlayScene } from "./scenes/play.js";

const IMAGES = [
	"bg01.jpg", "bg02.jpg", "bg03.jpg", "bg04.jpg", "bgHole.jpg",
	"normal_base.png", "normal_top.png", "time_base.png", "death_base.png",
	"magnet_base.png", "magnet_top.png", "magnet_plus.png", "magnet_minus.png",
	"inter_low_blue.png", "inter_low_pink.png", "inter_high_blue.png", "inter_high_pink.png",
	"snake_head.png", "snake_body.png", "snake_tail.png",
	"snake_head_dark.png", "snake_body_dark.png", "snake_tail_dark.png",
	"logo_eau.png", "logo_feu.png", "logo_terre.png", "logo_vent.png",
	"roue.png", "map.png",
	"menu_challenge.png", "menu_course.png", "menu_aventure.png", "menu_classique.png",
	"menu_options.png", "menu_aide.png",
	"donjon_eau.png", "donjon_feu.png", "donjon_terre.png", "donjon_vent.png",
	"help_jaune.png", "help_verte.png", "help_rouge.png", "help_orange.png",
	"help_bleue.png", "help_metal.png", "help_violette.png"
];

function start() {
	const canvas = document.getElementById("game");
	app.screen = new Screen(canvas);
	app.input = new Input(app.screen);
	app.audio = new AudioEngine(SOUND_FILES);
	app.images = new ImageStore("assets/img/");
	app.save = new Progress();
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

	let images = 0;
	let sounds = 0;
	const drawLoading = () => {
		const ctx = app.screen.begin();
		ctx.fillStyle = "#4a1a70";
		ctx.fillRect(0, 0, W, H);
		text(ctx, "MotionBall 2", W / 2, 170, { size: 40, color: "#fff", outline: "#2a0a40" });
		ctx.fillStyle = "rgba(255,255,255,0.25)";
		ctx.fillRect(155, 230, 300, 14);
		ctx.fillStyle = "#9ae860";
		ctx.fillRect(155, 230, 300 * (images + sounds) / 2, 14);
	};
	drawLoading();

	const fonts = document.fonts ? document.fonts.ready.catch(() => { }) : Promise.resolve();
	Promise.all([
		app.images.load(IMAGES, p => {
			images = p;
			drawLoading();
		}),
		app.audio.load(p => {
			sounds = p;
			drawLoading();
		}),
		fonts
	]).then(() => {
		applySettings();
		app.scenes.goto(new TitleScene(), true);
		new Loop(step, render).start();
	});
}

/** One simulation step. */
function step(dt) {
	app.time += dt;
	app.audio.update(dt);
	app.scenes.update(dt);
	app.input.endStep();
}

/** One displayed frame. */
function render() {
	app.input.poll();
	app.scenes.render(app.screen.begin());
}

start();

// handy in the browser console, and for the tests :
//   motionball.scenes.current.game                  the game being played
//   motionball.play("adventure", 2)                 starts a game
window.motionball = app;
app.play = (mode, param = 0) => app.scenes.goto(new PlayScene(mode, param), true);
