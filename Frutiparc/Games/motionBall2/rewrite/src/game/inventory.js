/**
 * What the player owns : balls of each colour, keys, map and radar.
 */

import { BallType, BALL_TYPE_COUNT } from "../data/enums.js";

export class Inventory {

	/** @param lives  yellow balls at the start */
	constructor(lives) {
		this.balls = new Array(BALL_TYPE_COUNT).fill(0);
		this.balls[BallType.YELLOW] = lives;
		this.found = new Set();     // colours found at least once (the music grows with them)
		this.keys = 0;
		this.map = false;
		this.radar = false;
	}

	get total() {
		return this.balls.reduce((a, b) => a + b, 0);
	}

	/** The next colour owned after `type` (cycling), or -1 when none is left. */
	next(type, includeSelf = false) {
		for (let i = includeSelf ? 0 : 1; i <= BALL_TYPE_COUNT; i++) {
			const t = (type + i) % BALL_TYPE_COUNT;
			if (this.balls[t] > 0)
				return t;
		}
		return -1;
	}
}
