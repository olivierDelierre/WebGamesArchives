/*
 * DepthManager (port of asml.DepthManager).
 *
 * Holds the clips of a screen in "planes" (see the *_PLAN constants of
 * MB2.Const). Planes are drawn from 0 upwards, and inside a plane the clips
 * are drawn in their creation order, like the original depth allocation.
 */
"use strict";

MB2.DepthManager = class {

	constructor() {
		this.planes = [];
	}

	/** Adds an existing clip on a plane. */
	add(clip, plane) {
		if (!this.planes[plane])
			this.planes[plane] = [];
		this.planes[plane].push(clip);
		return clip;
	}

	/** Creates a clip of the given symbol name on a plane (attachMovie). */
	attach(name, plane) {
		return this.add(new MB2.Clip(name), plane);
	}

	/** Creates an empty clip (createEmptyMovieClip). */
	empty(plane) {
		return this.add(new MB2.Clip(MB2.SYMBOLS.empty), plane);
	}

	/** Advances the timelines of all the clips, then forgets the removed ones. */
	tick() {
		for (const plane of this.planes) {
			if (!plane)
				continue;
			// a clip may add clips while ticking : iterate on the live length
			for (let i = 0; i < plane.length; i++) {
				if (!plane[i].removed)
					plane[i].tick();
			}
		}
		this.clean();
	}

	clean() {
		for (const plane of this.planes) {
			if (!plane)
				continue;
			let j = 0;
			for (let i = 0; i < plane.length; i++) {
				if (!plane[i].removed)
					plane[j++] = plane[i];
			}
			plane.length = j;
		}
	}

	draw(ctx) {
		for (const plane of this.planes) {
			if (!plane)
				continue;
			for (const clip of plane)
				clip.draw(ctx);
		}
	}

	destroy() {
		for (const plane of this.planes) {
			if (!plane)
				continue;
			for (const clip of plane)
				clip.removed = true;
		}
		this.planes = [];
	}
};
