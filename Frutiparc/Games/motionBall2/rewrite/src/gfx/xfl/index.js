/**
 * The original art : the symbols of mb2.fla and title.fla, converted by
 * tools/xfl/convert.js, drawn by Clip (clip.js).
 *
 *   import { symbols, clip } from "../gfx/xfl/index.js";
 *   const c = clip("bnormal");        // a new instance of a symbol
 *
 * The JSON is bundled with the game (so it also works from file://) ; its
 * bitmaps are loaded at startup with the other images (main.js).
 */

import mb2 from "../../../assets/xfl/mb2.json" with { type: "json" };
import title from "../../../assets/xfl/title.json" with { type: "json" };
import { XflLibrary } from "./library.js";
import { Clip } from "./clip.js";
import { app } from "../../app.js";

// the bitmaps are looked up in the game's image store, by file
const images = { get: src => app.images ? app.images.get(src) : null };

export const symbols = new XflLibrary(mb2, images);
export const titleSymbols = new XflLibrary(title, images);

/** A new instance of a symbol of mb2.fla (by linkage or library name). */
export function clip(name) {
	return new Clip(symbols, name);
}

/** Every bitmap file of the converted libraries (to preload). */
export function xflBitmapFiles() {
	return [...symbols.bitmapFiles(), ...titleSymbols.bitmapFiles()];
}

export { Clip };

/** Draws a clip at (x, y), with an optional rotation (radians), scale and alpha. */
export function drawClip(ctx, c, x, y, rotation = 0, scale = 1, alpha = 1) {
	if (!c || alpha <= 0)
		return;
	ctx.save();
	ctx.translate(x, y);
	if (rotation)
		ctx.rotate(rotation);
	if (scale !== 1)
		ctx.scale(scale, scale);
	if (alpha < 1)
		ctx.globalAlpha *= alpha;
	c.draw(ctx);
	ctx.restore();
}

/**
 * The size of a symbol in cells of 4 pixels, rounded up to an even number,
 * like the original Tools.mc_size : the original placed the items of the
 * rooms (and their collision maps) with it.
 */
export function symbolCells(name) {
	const s = symbols.symbol(name);
	const b = s && s.bounds ? s.bounds : [-20, -20, 20, 20];
	return {
		w: Math.ceil((b[2] - b[0]) / 2 / 4) * 2,
		h: Math.ceil((b[3] - b[1]) / 2 / 4) * 2
	};
}
