/**
 * The symbols of the original Flash files, converted by tools/xfl/convert.js
 * (assets/xfl/*.json) : looking them up, and the cached canvas objects of
 * their shapes (paths, gradients).
 *
 * Symbols are named by their library path ("_gfx/_bumpers/_normal/bnormal")
 * or by their linkage name ("bnormal"), the name the original code used.
 */

export class XflLibrary {

	/**
	 * @param data    the converted JSON
	 * @param images  gives the loaded bitmaps : images.get(src) -> HTMLImageElement
	 */
	constructor(data, images) {
		this.data = data;
		this.images = images;
		this.paths = new Map();
	}

	/** A symbol, by library name or linkage name (null when unknown). */
	symbol(name) {
		const d = this.data;
		return d.symbols[name] || d.symbols[d.linkage[name]] || null;
	}

	has(name) {
		return this.symbol(name) !== null;
	}

	/** The bitmap files, to load them at startup : [{ name, src }]. */
	bitmapFiles() {
		return Object.values(this.data.bitmaps).map(b => b.src);
	}

	bitmap(name) {
		const b = this.data.bitmaps[name];
		return b ? { ...b, img: this.images ? this.images.get(b.src) : null } : null;
	}

	shape(id) {
		return this.data.shapes[id];
	}

	/** A Path2D for an SVG path string (cached ; null without Path2D, e.g. in the tests). */
	path(d) {
		if (typeof Path2D === "undefined")
			return null;
		let p = this.paths.get(d);
		if (!p) {
			p = new Path2D(d);
			this.paths.set(d, p);
		}
		return p;
	}
}
