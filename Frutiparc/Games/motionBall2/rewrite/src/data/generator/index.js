/**
 * Random dungeons : a whole Challenge dungeon, and the endless column of
 * rooms of the Classique mode. Both are returned as a data/dungeon.js Dungeon.
 */

import { RoomType, Exit } from "../enums.js";
import { Dungeon, makeRoom } from "../dungeon.js";
import { newTable, retry, Retry, Layout } from "./util.js";
import { generateMap, emptyMap, DIRS, isClosed, getPath, move } from "./map.js";
import { generateRoom, randomHatch } from "./rooms.js";

const SIZE = 8;

// ----- conversion of the generator structures to the game format -----

function convertExit(p) {
	switch (p.t) {
	case "open":
		return { type: Exit.DOOR };
	case "closed":
		return { type: Exit.WALL };
	case "invisible":
		return { type: Exit.HIDDEN };
	default:
		return { type: Exit.SPECIAL, needs: p.o };
	}
}

const ROOM_KINDS = {
	start: RoomType.NORMAL,
	normal: RoomType.NORMAL,
	end: RoomType.BOSS,
	objfound: RoomType.BALL,
	bonus: RoomType.BONUS,
	objneed: RoomType.NEEDS_BALL
};

function convertRoom(r, items) {
	if (r.rtype === null)
		return null;
	const kind = r.rtype;
	const content = kind.k === "bonus" ? kind.b : kind.o;
	// the game order of the exits is left, right, up, down
	const exits = [r.rleft, r.rright, r.rup, r.rdown].map(convertExit);
	const list = items ? items.map(([type, p]) => ({ type, x: p.x, y: p.y })) : [];
	return makeRoom(ROOM_KINDS[kind.k], content, exits, list);
}

/** Distance of every room from the start, and the average distance. */
function distances(d) {
	const m = newTable(SIZE, SIZE, -1);
	const visit = (p, n) => {
		m[p.x][p.y] = n;
		for (const dir of DIRS) {
			if (isClosed(getPath(d, p, dir)))
				continue;
			const p2 = move(d, p, dir);
			if (m[p2.x][p2.y] === -1 || m[p2.x][p2.y] > n + 1)
				visit(p2, n + 1);
		}
	};
	visit(d.dstart, 0);

	let total = 0;
	let count = 0;
	for (const column of m) {
		for (const n of column) {
			if (n !== -1) {
				total += n;
				count++;
			}
		}
	}
	return { m, average: Math.floor(total / count) };
}

// ----- Challenge -----

function generateChallengeOnce() {
	const map = generateMap(SIZE, SIZE);
	const dist = distances(map);
	const dungeon = new Dungeon(SIZE, SIZE);
	dungeon.start = { ...map.dstart };

	for (let x = 0; x < SIZE; x++) {
		for (let y = 0; y < SIZE; y++) {
			const r = map.dmap[x][y];
			// the difficulty grows with the distance from the start (0 .. ~20)
			const level = Math.floor(dist.m[x][y] * 10 / dist.average);
			const ctx = { dungeon: map, pos: { x, y }, classic: null };
			dungeon.rooms[x][y] = convertRoom(r, generateRoom(ctx, r, level));
		}
	}
	return dungeon;
}

/** A new random Challenge dungeon (takes ~0.2 s). */
export function generateChallenge() {
	// a room that can't be generated (very rare) makes a whole new dungeon
	return retry(Infinity, generateChallengeOnce);
}

// ----- Classique -----

/**
 * The Classique mode : 100 levels of `choices` rooms each. The rooms have no
 * doors : the ball falls through the hatch, and lands in a random room of the
 * next level, at the place of the hatch it fell in. Levels are generated when
 * needed (`ensure`) : nobody plays 100 levels.
 */
export class ClassicDungeon extends Dungeon {

	constructor(choices = 5) {
		super(100, choices);
		this.map = emptyMap(this.width, this.height);
		this.generated = 0;
		this.enter = { x: Math.floor(Layout.cwidth / 2) - 3, y: Math.floor(Layout.cheight / 2) - 3 };
		this.hatch = this.newHatch();
		this.ensure(2);
	}

	ensure(column) {
		column = Math.min(column, this.width - 1);
		while (this.generated <= column) {
			const x = this.generated;
			// a level that can't be generated gets another hatch
			retry(Infinity, () => this.generateLevel(x));
			this.generated++;
			this.enter = this.hatch;
			this.hatch = this.newHatch();
		}
	}

	generateLevel(x) {
		const classic = { enter: this.enter, exit: this.hatch };
		for (let y = 0; y < this.height; y++) {
			const r = this.map.dmap[x][y];
			const ctx = { dungeon: this.map, pos: { x, y }, classic };
			try {
				this.rooms[x][y] = convertRoom(r, generateRoom(ctx, r, Math.floor(x / 2), 100));
			} catch (e) {
				if (e instanceof Retry)
					this.hatch = this.newHatch();
				throw e;
			}
		}
	}

	/**
	 * The hatch of the next level, not next to where the ball lands (the
	 * entrance) : such levels are very hard or impossible to generate (the
	 * original tool could loop forever).
	 */
	newHatch() {
		let h;
		do {
			h = randomHatch();
		} while (Math.abs(h.x - this.enter.x) <= 10 && Math.abs(h.y - this.enter.y) <= 10);
		return h;
	}
}
