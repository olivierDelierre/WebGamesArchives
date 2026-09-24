/**
 * The canvas : keeps it as large as the window allows (keeping the aspect
 * ratio of the game), sharp on high density screens, and converts pointer
 * positions to game coordinates.
 *
 * All the drawing code works in game coordinates (WIDTH x HEIGHT) : call
 * `begin()` at the start of each frame to set the matching transform.
 */

import { WIDTH, HEIGHT } from "../config.js";

export class Screen {

	constructor(canvas) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.scale = 1;
		this.pixelRatio = 1;
		this.resize = this.resize.bind(this);
		window.addEventListener("resize", this.resize);
		this.resize();
	}

	resize() {
		const parent = this.canvas.parentElement;
		const reserved = parseFloat(getComputedStyle(this.canvas).getPropertyValue("--reserved-height")) || 0;
		const availableW = parent.clientWidth;
		const availableH = window.innerHeight - reserved;
		const scale = Math.max(0.3, Math.min(availableW / WIDTH, availableH / HEIGHT));

		this.scale = scale;
		this.pixelRatio = Math.min(3, window.devicePixelRatio || 1);
		this.canvas.style.width = Math.floor(WIDTH * scale) + "px";
		this.canvas.style.height = Math.floor(HEIGHT * scale) + "px";
		this.canvas.width = Math.floor(WIDTH * scale * this.pixelRatio);
		this.canvas.height = Math.floor(HEIGHT * scale * this.pixelRatio);
	}

	/** Resets the context for a new frame, in game coordinates. */
	begin() {
		const ctx = this.ctx;
		ctx.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
		ctx.globalAlpha = 1;
		ctx.globalCompositeOperation = "source-over";
		return ctx;
	}

	/** Number of device pixels per game pixel (to render sprites at the right resolution). */
	get resolution() {
		return this.canvas.width / WIDTH;
	}

	/** Converts a pointer event position to game coordinates. */
	toGame(clientX, clientY) {
		const r = this.canvas.getBoundingClientRect();
		return {
			x: (clientX - r.left) * WIDTH / r.width,
			y: (clientY - r.top) * HEIGHT / r.height
		};
	}
}
