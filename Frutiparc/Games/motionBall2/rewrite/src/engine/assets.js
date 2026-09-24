/**
 * Image loading. Images are loaded once at startup and then looked up by
 * name with `images.get(name)`.
 */

export class ImageStore {

	constructor(basePath) {
		this.basePath = basePath;
		this.images = new Map();
	}

	/**
	 * @param {string[]} files  file names of the base folder, e.g. "bg01.jpg" (the name is the file
	 *                          name without extension), or paths with a folder, e.g.
	 *                          "assets/xfl/mb2/b3.png" (the name is the path itself)
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
			const isPath = file.includes("/");
			img.onload = () => {
				this.images.set(isPath ? file : file.replace(/\.[a-z]+$/, ""), img);
				finish();
			};
			img.onerror = () => {
				console.warn("image", file, "not loaded");
				finish();
			};
			img.src = isPath ? file : this.basePath + file;
		})));
	}

	/** The image, or null when it could not be loaded. */
	get(name) {
		return this.images.get(name) || null;
	}
}
