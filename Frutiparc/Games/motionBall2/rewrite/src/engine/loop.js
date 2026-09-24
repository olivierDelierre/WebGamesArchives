/**
 * The main loop : a fixed simulation step, decoupled from the display rate.
 *
 * The game logic always advances by steps of exactly 1 / SIM_RATE second, so
 * the physics behave the same on a 60 Hz and on a 144 Hz screen. After the
 * steps due for the elapsed time, the frame is drawn once.
 *
 * A long pause of the page (background tab, debugger) would otherwise ask
 * for hundreds of steps at once : the elapsed time is capped, and the time
 * that could not be simulated is dropped.
 */

import { SIM_RATE } from "../config.js";

const STEP = 1 / SIM_RATE;
const MAX_FRAME_TIME = 0.25;
const MAX_STEPS = 16;

export class Loop {

	/**
	 * @param {(dt: number) => void} update  one simulation step
	 * @param {() => void} render            draws the current state
	 */
	constructor(update, render) {
		this.update = update;
		this.render = render;
		this.accumulated = 0;
		this.last = 0;
		this.running = false;
		this.frame = this.frame.bind(this);
	}

	start() {
		if (this.running)
			return;
		this.running = true;
		this.last = performance.now();
		requestAnimationFrame(this.frame);
	}

	stop() {
		this.running = false;
	}

	frame(now) {
		if (!this.running)
			return;

		this.accumulated += Math.min(MAX_FRAME_TIME, (now - this.last) / 1000);
		this.last = now;

		let steps = 0;
		while (this.accumulated >= STEP && steps < MAX_STEPS) {
			this.update(STEP);
			this.accumulated -= STEP;
			steps++;
		}
		if (steps === MAX_STEPS)
			this.accumulated = 0;

		this.render();
		requestAnimationFrame(this.frame);
	}
}

export const SIM_STEP = STEP;
