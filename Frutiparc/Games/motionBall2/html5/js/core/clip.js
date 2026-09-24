/*
 * Clip : a minimal emulation of a Flash MovieClip.
 *
 * The original game code drives its graphics through MovieClips :
 *   clip.gotoAndPlay("hit"), clip._currentframe == 1, clip._rotation = 90 ...
 * To keep the ported code close to the original, every graphic object of the
 * port is a Clip, an instance of a "symbol" (the library item of the .fla).
 *
 * A symbol is a plain object, registered in MB2.SYMBOLS (see gfx/symbols/) :
 *
 *   {
 *     w, h       size in pixels (used by Tools.mc_size to place bumpers),
 *     frames     number of frames of its timeline (default 1),
 *     labels     { label: frameNumber } for gotoAndPlay("label"),
 *     actions    { frameNumber: fn(clip) } run when the frame is reached
 *                (the frame scripts : stop(), gotoAndPlay(...), callbacks),
 *     init(clip)    called once at creation (to create named "children"),
 *     update(clip)  called every frame before the timeline advances,
 *     draw(ctx, clip)  draws the current frame, around (0, 0)
 *   }
 *
 * Names follow Flash : x / y / rotation (degrees) / xscale / yscale / alpha
 * (percents) / visible / frame (= _currentframe, starting at 1).
 */
"use strict";

MB2.SYMBOLS = {};

MB2.Clip = class {

	constructor(sym) {
		if (typeof sym === "string") {
			const s = MB2.SYMBOLS[sym];
			if (!s)
				throw new Error("Unknown symbol " + sym);
			sym = s;
		}
		this.sym = sym;

		this.x = 0;
		this.y = 0;
		this.rotation = 0;
		this.xscale = 100;
		this.yscale = 100;
		this.alpha = 100;
		this.visible = true;

		this.frame = 1;
		this.playing = false;
		this.removed = false;

		// optional fn(ctx) setting a clipping region, in parent coordinates
		this.mask = null;
		// optional additive colour { r, g, b, k } (Flash Color.setTransform)
		this.tint = null;

		this.width = sym.w || 0;
		this.height = sym.h || 0;

		if (sym.init)
			sym.init(this);
	}

	get totalframes() {
		return this.sym.frames || 1;
	}

	// ----- timeline -----

	/** Frame number of a label (or the number itself). Unknown labels keep the current frame. */
	resolve(f) {
		if (typeof f === "number")
			return f;
		const l = this.sym.labels && this.sym.labels[f];
		return l === undefined ? this.frame : l;
	}

	gotoAndStop(f) {
		this.playing = false;
		this.setFrame(this.resolve(f));
	}

	gotoAndPlay(f) {
		this.playing = true;
		this.setFrame(this.resolve(f));
	}

	play() {
		this.playing = true;
	}

	stop() {
		this.playing = false;
	}

	nextFrame() {
		this.playing = false;
		this.setFrame(this.frame < this.totalframes ? this.frame + 1 : this.frame);
	}

	/** Enters a frame and runs its frame script. */
	setFrame(f) {
		this.frame = f;
		const action = this.sym.actions && this.sym.actions[f];
		if (action)
			action(this);
	}

	/** Called once per game frame by the DepthManager. */
	tick() {
		if (this.sym.update)
			this.sym.update(this);

		if (this.playing && !this.removed) {
			let f = this.frame + 1;
			if (f > this.totalframes)
				f = 1; // timelines loop, like in Flash
			this.setFrame(f);
		}
	}

	removeMovieClip() {
		this.removed = true;
	}

	// ----- rendering -----

	draw(ctx) {
		if (!this.visible || this.removed || this.alpha <= 0)
			return;

		const sx = this.xscale / 100;
		const sy = this.yscale / 100;
		if (Math.abs(sx) < 1e-4 || Math.abs(sy) < 1e-4)
			return;

		ctx.save();

		if (this.mask)
			this.mask(ctx);

		ctx.translate(this.x, this.y);
		if (this.rotation)
			ctx.rotate(this.rotation * Math.PI / 180);
		if (sx !== 1 || sy !== 1)
			ctx.scale(sx, sy);
		if (this.alpha < 100)
			ctx.globalAlpha *= this.alpha / 100;

		if (this.tint)
			MB2.drawTinted(ctx, this, this.tint);
		else
			this.sym.draw(ctx, this);

		ctx.restore();
	}
};


/*
 * Draws a clip with an additive colour, like Flash's Color.setTransform (used
 * for the red flashes of the bosses when they are hit).
 *
 * The symbol is drawn in an offscreen canvas, then the colour is painted over
 * it with "source-atop" so that it only covers the symbol's own pixels.
 */
MB2.drawTinted = (function () {

	let canvas = null;
	let off = null;

	return function (ctx, clip, tint) {
		const w = Math.ceil(clip.width * 2 + 40);
		const h = Math.ceil(clip.height * 2 + 40);

		if (!canvas) {
			canvas = document.createElement("canvas");
			off = canvas.getContext("2d");
		}
		if (canvas.width < w)
			canvas.width = w;
		if (canvas.height < h)
			canvas.height = h;

		off.setTransform(1, 0, 0, 1, 0, 0);
		off.globalCompositeOperation = "source-over";
		off.globalAlpha = 1;
		off.clearRect(0, 0, canvas.width, canvas.height);

		off.translate(w / 2, h / 2);
		clip.sym.draw(off, clip);

		off.setTransform(1, 0, 0, 1, 0, 0);
		off.globalCompositeOperation = "source-atop";
		off.globalAlpha = Math.min(1, tint.k === undefined ? 1 : tint.k);
		off.fillStyle = "rgb(" + (tint.r | 0) + "," + (tint.g | 0) + "," + (tint.b | 0) + ")";
		off.fillRect(0, 0, w, h);

		ctx.drawImage(canvas, 0, 0, w, h, -w / 2, -h / 2, w, h);
	};
})();


/** A stand-in for a named child clip that only needs a frame (e.g. clip.ball.gotoAndStop(3)). */
MB2.frameHolder = function () {
	return {
		frame: 1,
		gotoAndStop(f) { this.frame = f; }
	};
};
