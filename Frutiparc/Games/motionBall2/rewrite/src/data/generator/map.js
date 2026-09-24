/**
 * The random dungeon map (Challenge mode). Follows mb2gen/dungeon.ml.
 *
 * Builds an 8 x 8 grid of rooms connected by exits :
 *   1. carve a random tree of rooms from the start (genRoom), pick a random
 *      boss room, add random extra openings / walls (genPath), and keep only
 *      the rooms reachable from the start ;
 *   2. put the 4 balls (green, blue, metal, violet) in dead ends, and the
 *      rooms / doors that need them further on (genObjects) ;
 *   3. check that the boss room is far enough and needs the 4 balls
 *      (checkDifficulty) ;
 *   4. put the bonuses (map, radar, keys, time...) in the remaining dead
 *      ends, some behind hidden exits (genObjectsFinal).
 * A failed check throws Retry and the whole map is generated again.
 *
 * The map has its own structure (rooms with rup / rdown / rleft / rright
 * exits and a typed rtype) : index.js converts it to the game format.
 */

import { DungeonBall as Obj, DungeonBonus as Bonus } from "../enums.js";
import { Retry, rnd, rbool, shuffle, newTable, retry } from "./util.js";

// ----- directions and paths -----

export const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;
export const DIRS = [UP, DOWN, LEFT, RIGHT];
const FIELD = ["rup", "rdown", "rleft", "rright"];
const opposite = d => [DOWN, UP, RIGHT, LEFT][d];

// path = { t: "open" | "closed" | "invisible" | "need", o: object needed }
const OPENED = { t: "open" };
export const CLOSED = { t: "closed" };
const INVISIBLE = { t: "invisible" };
const needs = o => ({ t: "need", o: o });
export const isClosed = p => p.t === "closed";

// room types : rtype = null (no room) or { k: kind, o: object, b: bonus }
//   kinds : start, normal, end, objfound, objneed, bonus

const OBJECTS_COUNT = 4;

// per bonus (DungeonBonus order) : [min, max] count, then probability
const BONUS_COUNTS = [[1, 1], [1, 1], [1, 1], [1, 1], [0, 99], [0, 99], [0, 2]];
const BONUS_PROBAS = [10, 10, 10, 10, 6, 7, 2];
const BONUS_MIN_COUNT = 4;

/** Green and blue balls may block a single door instead of a whole room. */
function canBlockOnlyDoor(o) {
	return (o === Obj.GREEN || o === Obj.BLUE) ? rbool() : false;
}

/** Some bonus rooms get an invisible entrance. */
function canHaveInvisibleDoor(b) {
	switch (b) {
	case Bonus.ORANGE:
	case Bonus.RED:
		return rbool();
	case Bonus.MAP:
		return false;
	case Bonus.BIG_TIME:
		return true;
	default:
		return rnd(4) === 0;
	}
}

// ----- map helpers -----

function newDungeon(w, h) {
	const map = [];
	for (let x = 0; x < w; x++) {
		map[x] = [];
		for (let y = 0; y < h; y++)
			map[x][y] = { rtype: null, rup: CLOSED, rdown: CLOSED, rleft: CLOSED, rright: CLOSED, x: x, y: y };
	}
	return { dmap: map, dwidth: w, dheight: h, dstart: null, dexit: null, dist_table: null };
}

const room = (d, p) => d.dmap[p.x][p.y];
const posEq = (a, b) => a.x === b.x && a.y === b.y;
const randPos = d => ({ x: rnd(d.dwidth), y: rnd(d.dheight) });
export const getPath = (d, p, dir) => room(d, p)[FIELD[dir]];
const setPath = (d, p, dir, v) => { room(d, p)[FIELD[dir]] = v; };

/** The neighbour position in a direction, or null outside the map. */
export function move(d, p, dir) {
	switch (dir) {
	case UP:
		return p.y === 0 ? null : { x: p.x, y: p.y - 1 };
	case DOWN:
		return p.y === d.dheight - 1 ? null : { x: p.x, y: p.y + 1 };
	case LEFT:
		return p.x === 0 ? null : { x: p.x - 1, y: p.y };
	default:
		return p.x === d.dwidth - 1 ? null : { x: p.x + 1, y: p.y };
	}
}

// ----- step 1 : the rooms -----

/** Closes all the exits of a room but one (the exit room has a single entrance). */
function almostClose(d, p) {
	let kept = false;
	for (const dir of shuffle(DIRS.slice())) {
		if (isClosed(getPath(d, p, dir)))
			continue;
		if (kept) {
			setPath(d, p, dir, CLOSED);
			setPath(d, move(d, p, dir), opposite(dir), CLOSED);
		} else
			kept = true;
	}
}

function randomRoom(d, rtype) {
	while (true) {
		const p = randPos(d);
		if (room(d, p).rtype === null) {
			room(d, p).rtype = rtype;
			return p;
		}
	}
}

/** Random depth-first carving from p. Returns the last room created. */
function genRoom(d, p) {
	let last = p;
	for (const dir of shuffle(DIRS.slice())) {
		const np = move(d, p, dir);
		if (!np || room(d, np).rtype !== null)
			continue;
		room(d, np).rtype = { k: "normal" };
		setPath(d, p, dir, OPENED);
		setPath(d, np, opposite(dir), OPENED);
		last = genRoom(d, np);
		// usually a single branch, sometimes several
		if (rnd(3) !== 0)
			return last;
	}
	return last;
}

/** Sets a random exit of a random existing room to `s` (open or closed). */
function genPath(d, s) {
	while (true) {
		const p = randPos(d);
		if (room(d, p).rtype === null)
			continue;
		for (const dir of shuffle(DIRS.slice())) {
			const np = move(d, p, dir);
			if (!np || getPath(d, p, dir) === s)
				continue;
			setPath(d, p, dir, s);
			setPath(d, np, opposite(dir), s);
			return;
		}
	}
}

/** Distance (in rooms) of each room from sp, -1 when unreachable. */
function genPathMap(d, sp) {
	const m = newTable(d.dwidth, d.dheight, -1);
	function visit(p, n) {
		m[p.x][p.y] = n;
		for (const dir of DIRS) {
			if (isClosed(getPath(d, p, dir)))
				continue;
			const p2 = move(d, p, dir);
			const n2 = m[p2.x][p2.y];
			if (n2 === -1 || n2 > n + 1)
				visit(p2, n + 1);
		}
	}
	visit(sp, 0);
	return m;
}

// ----- step 2 : the balls -----

class ExitFound { }

/**
 * Walks the map from the start (a random depth-first walk that goes away from
 * the start). The first 4 dead ends get a ball ; after a ball has been found,
 * the exits taken may randomly "need" it : either the room or the door.
 * `acc` is the list of balls found so far that can still be required
 * (a ball is added 1 to 3 times to make it more likely).
 */
function genObjects(d, m) {
	let totDist = 0;
	let objCount = 0;
	const objectsFound = [];
	const objectsRooms = [];
	const visited = newTable(d.dwidth, d.dheight, -1);

	function walk(p, acc) {
		const n = m[p.x][p.y];
		visited[p.x][p.y] = totDist++;
		if (posEq(p, d.dexit))
			throw new ExitFound();

		let flag = false;
		for (const dir of shuffle(DIRS.slice())) {
			if (isClosed(getPath(d, p, dir)))
				continue;
			const p2 = move(d, p, dir);
			if (visited[p2.x][p2.y] !== -1)
				continue;
			const n2 = m[p2.x][p2.y];

			// this exit may require one of the balls found before
			if (acc.length > 0 && rnd(6) === 0) {
				shuffle(acc);
				objectsRooms.push({ p: p, dir: dir, n: acc[0] });
				acc = acc.slice(1);
			}

			if (n2 > n && (!flag || rnd(4) !== 0)) {
				acc = walk(p2, acc);
				totDist++;
			}
			flag = true;
		}

		// a dead end : put a ball here
		let nways = 0;
		for (const dir of DIRS)
			if (!isClosed(getPath(d, p, dir)))
				nways++;
		if (nways === 1 && objCount < OBJECTS_COUNT) {
			objectsFound.push({ p: p, n: objCount });
			const copies = [];
			for (let i = rnd(3) + 1; i > 0; i--)
				copies.push(objCount);
			objCount++;
			acc = copies.concat(acc);
		}
		return acc;
	}

	try {
		walk(d.dstart, []);
		throw new Retry("exit not found");
	} catch (e) {
		if (!(e instanceof ExitFound))
			throw e;
	}

	if (objCount !== OBJECTS_COUNT)
		throw new Retry("not enough objects found");
	for (let i = 0; i < OBJECTS_COUNT; i++)
		if (!objectsRooms.some(o => o.n === i))
			throw new Retry("not enough objects used");

	// which ball is which
	const otable = shuffle([Obj.GREEN, Obj.BLUE, Obj.METAL, Obj.VIOLET]);
	for (const o of objectsRooms) {
		const obj = otable[o.n];
		if (canBlockOnlyDoor(obj)) {
			setPath(d, o.p, o.dir, needs(obj));
			setPath(d, move(d, o.p, o.dir), opposite(o.dir), needs(obj));
		} else
			room(d, o.p).rtype = { k: "objneed", o: obj };
	}
	for (const o of objectsFound)
		room(d, o.p).rtype = { k: "objfound", o: otable[o.n] };
}

// ----- step 3 : difficulty -----

/**
 * Smallest [distance, balls] entry of the dist_table of a room : the shortest
 * way to reach it, preferring the ways that need fewer balls.
 * (A direct transcription of a tricky OCaml pattern match : some cases
 * update `min` and look at the same entry again.)
 */
function distObjectsMin(d, p) {
	const list = d.dist_table[p.x][p.y];
	let min = [-1, []];
	let i = 0;
	while (i < list.length) {
		const e = list[i];
		if (min[0] === -1) {
			min = e;
			i++;
		} else if (min[0] > e[0]) {
			min = [e[0], min[1]];
		} else if (e[1].length < min[1].length) {
			min = [min[0], e[1]];
		} else if (e[0] === min[0] && e[1].length === min[1].length) {
			min = e;
			i++;
		} else
			i++;
	}
	return min;
}

/**
 * Explores every way through the dungeon, remembering for each room the
 * [distance, sorted list of balls owned] pairs it can be reached with.
 * Rejects the map when the exit is too close or doesn't need the 4 balls.
 */
function checkDifficulty(d) {
	const m = newTable(d.dwidth, d.dheight, null);
	for (let x = 0; x < d.dwidth; x++)
		for (let y = 0; y < d.dheight; y++)
			m[x][y] = [];

	// is the sorted list l1 included in the sorted list l2 ?
	function included(l1, l2) {
		let i = 0, j = 0;
		while (true) {
			if (i >= l1.length)
				return true;
			if (j >= l2.length)
				return false;
			if (l2[j] < l1[i]) {
				j++;
			} else if (l2[j] === l1[i]) {
				i++;
				j++;
			} else
				return false;
		}
	}
	function addSorted(x, l) {
		const r = l.slice();
		for (let i = 0; i < r.length; i++) {
			if (r[i] === x)
				return r;
			if (r[i] > x) {
				r.splice(i, 0, x);
				return r;
			}
		}
		r.push(x);
		return r;
	}
	const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

	function explore(objs, dist, p) {
		const rt = room(d, p).rtype;
		if (rt && rt.k === "objfound")
			objs = addSorted(rt.o, objs);
		m[p.x][p.y].unshift([dist, objs]);

		if (rt && rt.k === "objneed" && objs.indexOf(rt.o) < 0)
			return;

		for (const dir of DIRS) {
			const path = getPath(d, p, dir);
			if (isClosed(path))
				continue;
			if (path.t === "need" && objs.indexOf(path.o) < 0)
				continue;
			const p2 = move(d, p, dir);
			const known = m[p2.x][p2.y];
			// go on if this set of balls is new there, or the way is shorter
			if (known.every(e => !included(objs, e[1])) || !known.some(e => same(objs, e[1]) && e[0] <= dist + 1))
				explore(objs, dist + 1, p2);
		}
	}

	explore([], 0, d.dstart);
	d.dist_table = m;

	const r = distObjectsMin(d, d.dexit);
	if (r[0] < d.dwidth * d.dheight * 40 / 100)
		throw new Retry("not enough difficulty");
	if (r[1].length !== OBJECTS_COUNT)
		throw new Retry("not enough objects for ending level");
}

// ----- step 4 : the bonuses -----

function genObjectsFinal(d) {

	// Looks at the exits of a normal room :
	// -1 no exit, -2 more than one exit (or not a normal room), else the only direction
	const NO_EXIT = -1, SEVERAL = -2;
	function isImpass(p, exclDir) {
		const rt = room(d, p).rtype;
		let result = (rt && rt.k === "normal") ? NO_EXIT : SEVERAL;
		for (const dir of DIRS) {
			if (dir === exclDir || isClosed(getPath(d, p, dir)))
				continue;
			if (result === NO_EXIT)
				result = dir;
			else
				return SEVERAL;
		}
		return result;
	}

	// follows a dead-end corridor up to the room where it starts
	function impassStart(p, dir) {
		while (true) {
			const p2 = move(d, p, dir);
			const back = opposite(dir);
			const r = isImpass(p2, back);
			if (r === NO_EXIT)
				throw new Retry("impass");
			if (r === SEVERAL)
				return { sp: p2, dir: back };
			p = p2;
			dir = r;
		}
	}

	const deadEnds = [];
	for (let x = 0; x < d.dwidth; x++) {
		for (let y = 0; y < d.dheight; y++) {
			const p = { x: x, y: y };

			// a door needing a ball is only needed from its far side
			for (const dir of DIRS) {
				if (getPath(d, p, dir).t !== "need")
					continue;
				const p2 = move(d, p, dir);
				if (distObjectsMin(d, p)[0] < distObjectsMin(d, p2)[0])
					setPath(d, p2, opposite(dir), OPENED);
			}

			const r = isImpass(p);
			if (r >= 0)
				deadEnds.unshift({ p: p, s: impassStart(p, r) });
		}
	}

	const imps = shuffle(deadEnds);
	if (imps.length < BONUS_MIN_COUNT)
		throw new Retry("not enough impass for bonuses");

	// the bonuses with a minimum count first, then random ones by probability
	const bonusTbl = [];
	let probaTot = 0;
	let bpos = 0;
	const counts = BONUS_COUNTS.map(([min, max], n) => {
		for (let i = 1; i <= min; i++) {
			bonusTbl[bpos] = n;
			if (n === Bonus.MAP && distObjectsMin(d, imps[bpos].p)[0] > 10)
				throw new Retry("map is too far");
			bpos++;
		}
		if (max > min)
			probaTot += BONUS_PROBAS[n];
		return max - min;
	});

	while (bpos < imps.length) {
		let p = rnd(probaTot);
		let pos = 0;
		while (p > BONUS_PROBAS[pos] || counts[pos] === 0) {
			while (counts[pos] === 0) {
				pos++;
				if (pos >= counts.length)
					throw new Retry("bonus");
			}
			if (p > BONUS_PROBAS[pos]) {
				p -= BONUS_PROBAS[pos];
				pos++;
				if (pos >= counts.length)
					throw new Retry("bonus");
			}
		}
		bonusTbl[bpos] = pos;
		counts[pos]--;
		if (counts[pos] === 0)
			probaTot -= BONUS_PROBAS[pos];
		bpos++;
	}

	imps.forEach((imp, n) => {
		const b = bonusTbl[n];
		room(d, imp.p).rtype = { k: "bonus", b: b };
		if (canHaveInvisibleDoor(b))
			setPath(d, imp.s.sp, imp.s.dir, INVISIBLE);
	});
}

// ----- the whole map -----

function genDungeonOnce(w, h) {
	const d = newDungeon(w, h);

	const sp = randomRoom(d, { k: "start" });
	genRoom(d, sp);
	const ep = randPos(d);
	d.dstart = sp;
	d.dexit = ep;
	room(d, ep).rtype = { k: "end" };

	for (let i = 0; i <= (w * h) / 6; i++) {
		genPath(d, OPENED);
		genPath(d, CLOSED);
	}
	almostClose(d, ep);

	// keep the reachable rooms only
	const m = genPathMap(d, sp);
	let count = 0;
	for (let x = 0; x < w; x++) {
		for (let y = 0; y < h; y++) {
			if (m[x][y] === -1) {
				d.dmap[x][y].rtype = null;
			} else {
				if (d.dmap[x][y].rtype === null)
					d.dmap[x][y].rtype = { k: "normal" };
				count++;
			}
		}
	}

	const ert = room(d, ep).rtype;
	const srt = room(d, sp).rtype;
	if (!ert || ert.k !== "end" || !srt || srt.k !== "start")
		throw new Retry("exit or start erased");
	if (count < w * h * 3 / 4)
		throw new Retry("not enough superficy");

	// genObjects only modifies the map when it succeeds : it can be retried on the same map
	retry(51, () => genObjects(d, m));
	checkDifficulty(d);
	genObjectsFinal(d);
	return d;
}

// ----- exports -----

/** A valid random map (retries until one is found). */
export function generateMap(w, h) {
	return retry(Infinity, () => genDungeonOnce(w, h));
}

/** A map of normal rooms without exits (Classique mode). */
export function emptyMap(w, h) {
	const d = newDungeon(w, h);
	d.dstart = { x: 0, y: 0 };
	d.dexit = { x: 0, y: 0 };
	d.dist_table = newTable(w, h, null);
	for (let x = 0; x < w; x++)
		for (let y = 0; y < h; y++) {
			d.dist_table[x][y] = [];
			d.dmap[x][y].rtype = { k: "normal" };
		}
	return d;
}
