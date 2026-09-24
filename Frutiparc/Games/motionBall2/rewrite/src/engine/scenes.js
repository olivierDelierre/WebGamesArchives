/**
 * Scenes : the screens of the game (title, menu, play, game over...).
 *
 * A scene is an object with optional methods :
 *   enter()           when it becomes the current scene
 *   exit()            when it is replaced
 *   update(dt)        one simulation step
 *   render(ctx)       draws it (in game coordinates)
 *
 * `goto(scene)` replaces the current scene behind a short fade to black and
 * back ; during the fade out the old scene keeps being drawn (not updated).
 */

import { WIDTH, HEIGHT } from "../config.js";

const FADE_TIME = 0.35;

export class SceneManager {

	constructor() {
		this.current = null;
		this.next = null;
		this.fade = 0;         // 0 = no fade, 1 = black
		this.fadeDir = 0;      // +1 fading out, -1 fading in
	}

	/** Switches scene. `instant` skips the fade (for the first scene). */
	goto(scene, instant = false) {
		if (instant || !this.current) {
			this.swap(scene);
			return;
		}
		this.next = scene;
		this.fadeDir = 1;
	}

	get busy() {
		return this.fadeDir !== 0;
	}

	swap(scene) {
		if (this.current && this.current.exit)
			this.current.exit();
		this.current = scene;
		if (scene.enter)
			scene.enter();
	}

	update(dt) {
		if (this.fadeDir > 0) {
			this.fade += dt / FADE_TIME;
			if (this.fade >= 1) {
				this.fade = 1;
				this.swap(this.next);
				this.next = null;
				this.fadeDir = -1;
			}
			return;
		}
		if (this.fadeDir < 0) {
			this.fade -= dt / FADE_TIME;
			if (this.fade <= 0) {
				this.fade = 0;
				this.fadeDir = 0;
			}
		}
		if (this.current && this.current.update)
			this.current.update(dt);
	}

	render(ctx) {
		if (this.current && this.current.render)
			this.current.render(ctx);
		if (this.fade > 0) {
			ctx.fillStyle = "rgba(20, 4, 36, " + this.fade + ")";
			ctx.fillRect(0, 0, WIDTH, HEIGHT);
		}
	}
}
