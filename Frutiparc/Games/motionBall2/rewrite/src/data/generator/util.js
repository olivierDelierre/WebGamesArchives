/**
 * Shared helpers of the random level generator.
 *
 * The generator follows the rules of the original OCaml tool (mb2gen), which
 * produced the dungeons of the Challenge and Classique modes :
 *   map.js      the 8 x 8 map : rooms, exits, balls and bonuses (dungeon.ml)
 *   rooms.js    the content of each room (level.ml)
 *   index.js    whole Challenge dungeons, and the endless Classique column
 *
 * TRICKY : like the OCaml code, a generation step that fails throws `Retry`,
 * and the caller starts that step (or the whole map) again. See `retry()`.
 */

import { BitReader } from "../bitcodec.js";

/**
 * Thrown when a generation step fails and must be done again.
 * (Not an Error : they are thrown thousands of times, and capturing a stack
 * trace each time would slow the generator down a lot.)
 */
export class Retry {
	constructor(reason) {
		this.reason = reason;
	}
}

/** Random integer in [0, n[. */
export const rnd = n => Math.floor(Math.random() * n);

export const rbool = () => Math.random() < 0.5;

/** Random integer in [min, max] ; max when the range is empty. */
export const random2 = (min, max) => max <= min ? max : rnd(max - min + 1) + min;

/** Shuffles an array in place and returns it. */
export function shuffle(a) {
	for (let i = 0; i < a.length; i++) {
		const p = rnd(a.length - i) + i;
		[a[i], a[p]] = [a[p], a[i]];
	}
	return a;
}

/** A w x h table, t[x][y] = v. */
export function newTable(w, h, v) {
	const t = [];
	for (let x = 0; x < w; x++)
		t.push(new Array(h).fill(v));
	return t;
}

/**
 * Calls fn until it doesn't throw Retry, at most `count` times ; rethrows
 * the last Retry when every attempt failed.
 */
export function retry(count, fn) {
	for (let n = 1; ; n++) {
		try {
			return fn();
		} catch (e) {
			if (!(e instanceof Retry) || n >= count)
				throw e;
		}
	}
}

/*
 * mb2gen/bumpers.txt : the room dimensions and the shape of the bumpers,
 * exported from the Flash symbols by the original level editor :
 *   5 bits cell size, 10 + 10 bits room size (cells), 5 bits border,
 *   5 + 5 bits size of a pastille, 8 bits ball radius x 10,
 *   then 7 shapes : 5 + 5 bits size, 1 bit per cell, column by column
 *   (bumper, clock, death, magnet, ghost, block, hole).
 * The generator places the items with these shapes, so that they don't overlap.
 */
const SHAPES_DATA = "itaZgmzqyWaaFG_X_5_5_5_5_5_4_WFGaceaaaddaF-b_4h_G_-h_-_____3_-p_GF-b_Wh_GmmaaauOaaWlr_J-pX_I0daafkda_h-_7____5_J8dbZGaaFWp_h_X_-F_V_7_-F_N_5_8p_b_aaauR_V______________Zg______";

function readLayout() {
	const r = new BitReader(SHAPES_DATA);
	const L = {
		delta: r.read(5),       // 4
		cwidth: r.read(10),     // 152
		cheight: r.read(10),    // 102
		cborder: r.read(5),     // 6
		redWidth: r.read(5),    // 6
		redHeight: r.read(5),   // 6
		ballRadius: r.read(8) / 10 * 1.3,
		shapes: []
	};
	for (let i = 0; i < 7; i++) {
		const w = r.read(5);
		const h = r.read(5);
		const t = newTable(w, h, false);
		for (let x = 0; x < w; x++)
			for (let y = 0; y < h; y++)
				t[x][y] = r.read(1) === 1;
		L.shapes.push(t);
	}
	// a pastille fills a whole square
	L.redShape = newTable(L.redWidth, L.redHeight, true);
	return L;
}

/** The room layout and the item shapes, see above. */
export const Layout = readLayout();

/** Index of each item in Layout.shapes. */
export const Shape = { BUMPER: 0, CLOCK: 1, DEATH: 2, MAGNET: 3, GHOST: 4, BLOCK: 5 };
