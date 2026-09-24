/**
 * Image loading (the bitmaps of the original symbols). Images are loaded once
 * at startup and then looked up by path with `images.get(path)`.
 */

export class ImageStore {

	constructor() {
		this.images = new Map();
	}

	/**
	 * @param {string[]} files  paths, e.g. "assets/xfl/mb2/b3.png"
	 * @param {(p: number) => void} progress
	 */
	load(files, progress) {
		let done = 0;
		return Promise.all(files.map(file => new Promise(resolve => {
			const img = new Image();
			const finish = () => {
				progress(++done / files.length);
				resolve();
			};
			img.onload = () => {
				this.images.set(file, img);
				finish();
			};
			img.onerror = () => {
				console.warn("image", file, "not loaded");
				finish();
			};
			img.src = file;
		})));
	}

	/** The image, or null when it could not be loaded. */
	get(name) {
		return this.images.get(name) || null;
	}
}
