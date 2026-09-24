/**
 * The saved data : settings, unlocked modes and records.
 *
 * Unlocking follows the original game :
 *   - the 4 elemental adventures are open, the 5th opens once they are all won ;
 *   - the first course is open, beating any time of a course opens the next.
 * Each course starts with 3 "CPU" times to beat (gold, silver, bronze).
 */

import { Storage } from "./engine/storage.js";

const time = (min, sec) => min * 60 + sec;
const cpu = (a, b, c) => [a, b, c].map(t => ({ time: t, cpu: true }));

const DEFAULTS = {
	version: 1,
	settings: {
		music: true,
		sounds: true,
		// (0 .. 1, while switched on)
		musicVolume: 1,
		soundsVolume: 1
	},
	adventures: {
		won: [false, false, false, false, false],
		best: [0, 0, 0, 0, 0]
	},
	courses: {
		unlocked: [true, false, false, false, false, false, false],
		records: [
			cpu(time(3, 0), time(3, 40), time(4, 20)),
			cpu(time(4, 0), time(4, 40), time(5, 20)),
			cpu(time(4, 30), time(5, 15), time(6, 0)),
			cpu(time(2, 30), time(3, 0), time(3, 30)),
			cpu(time(3, 0), time(3, 30), time(4, 0)),
			cpu(time(4, 0), time(4, 40), time(5, 20)),
			cpu(time(4, 0), time(4, 40), time(5, 20))
		]
	},
	challengeBest: 0,
	classicBest: 0
};

export class Progress {

	constructor() {
		this.store = new Storage("motionball2.rewrite", DEFAULTS);
	}

	get data() {
		return this.store.data;
	}

	get settings() {
		return this.data.settings;
	}

	save() {
		this.store.save();
	}

	adventureUnlocked(i) {
		return i < 4 || this.data.adventures.won.slice(0, 4).every(Boolean);
	}

	courseUnlocked(i) {
		return !!this.data.courses.unlocked[i];
	}

	/** An adventure was won ; returns the previous best score. */
	winAdventure(i, score) {
		const a = this.data.adventures;
		const previous = a.best[i];
		a.won[i] = true;
		a.best[i] = Math.max(previous, score);
		this.save();
		return previous;
	}

	/** Keeps the best score of an adventure ; returns the previous one. */
	adventureScore(i, score) {
		const a = this.data.adventures;
		const previous = a.best[i];
		a.best[i] = Math.max(previous, score);
		this.save();
		return previous;
	}

	/**
	 * Inserts a course time in its table of 3 best times.
	 * Returns { rank (0..2, or -1 when not ranked), table (the 3 rows, with
	 * `mine` on the new one), unlockedNext }.
	 */
	courseTime(i, seconds) {
		const c = this.data.courses;
		const table = c.records[i];
		const rank = table.findIndex(r => seconds < r.time);
		let unlockedNext = false;
		if (rank >= 0) {
			table.splice(rank, 0, { time: seconds, cpu: false });
			table.length = 3;
			if (i + 1 < c.unlocked.length && !c.unlocked[i + 1]) {
				c.unlocked[i + 1] = true;
				unlockedNext = true;
			}
			this.save();
		}
		return {
			rank,
			table: table.map((r, n) => ({ ...r, mine: n === rank })),
			unlockedNext
		};
	}

	/** Keeps a best score ; returns the previous one. */
	best(key, score) {
		const previous = this.data[key];
		if (score > previous) {
			this.data[key] = score;
			this.save();
		}
		return previous;
	}
}
