/*
 * Random level generator - shared helpers.
 *
 * The generator is a port of the OCaml tool mb2gen (mb2gen/dungeon.ml and
 * mb2gen/level.ml) that produced the .dat files of the Challenge and Classique
 * modes. In the port it runs in the browser when a game starts.
 *
 * Files :
 *   common.js     helpers + the bumper collision tables of mb2gen/bumpers.txt
 *   dungeon.js    dungeon.ml : the 8 x 8 map (rooms, exits, balls, bonuses)
 *   rooms.js      level.ml   : the content of each room (bumpers, pastilles...)
 *   challenge.js  Level.make : a whole Challenge dungeon
 *   classic.js    Level.make_classic : the endless Classique mode
 *
 * The OCaml code signals a failed attempt with the Retry exception, catches it
 * and starts again : the port keeps that design (throw new Gen.Retry(...)).
 * The random numbers differ from OCaml's, so the levels are not the same as
 * the original .dat files, but they follow the same rules.
 */
"use strict";

MB2.Gen = {};

(function () {

	const Gen = MB2.Gen;

	/** Thrown when a generation step fails and must be retried. */
	Gen.Retry = class {
		constructor(msg) {
			this.msg = msg;
		}
	};

	/** Random integer in [0, n[ (OCaml Random.int). */
	Gen.rnd = n => Math.floor(Math.random() * n);

	/** Random boolean (OCaml Random.bool). */
	Gen.rbool = () => Math.random() < 0.5;

	/** Random integer in [min, max] ; max when the range is empty. */
	Gen.random2 = (min, max) => (max <= min) ? max : Gen.rnd(max - min + 1) + min;

	/** Shuffles an array in place and returns it. */
	Gen.shuffle = function (a) {
		for (let i = 0; i < a.length; i++) {
			const p = Gen.rnd(a.length - i) + i;
			const t = a[p];
			a[p] = a[i];
			a[i] = t;
		}
		return a;
	};

	/** A w x h table (t[x][y]) filled with v. */
	Gen.newTable = function (w, h, v) {
		const t = [];
		for (let x = 0; x < w; x++) {
			t[x] = [];
			for (let y = 0; y < h; y++)
				t[x][y] = v;
		}
		return t;
	};

	/**
	 * Runs fn until it doesn't throw Retry, at most `count` times.
	 * Returns fn's result ; throws the last Retry when all attempts failed.
	 */
	Gen.retry = function (count, fn) {
		for (let n = 1; ; n++) {
			try {
				return fn();
			} catch (e) {
				if (!(e instanceof Gen.Retry) || n >= count)
					throw e;
			}
		}
	};


	/*
	 * mb2gen/bumpers.txt : room dimensions and the collision shape of the
	 * bumpers, exported from the Flash symbols by the level editor.
	 *
	 *   5 bits delta (cell size), 10 bits width, 10 bits height (in cells),
	 *   5 bits border, 5 + 5 bits size of a pastille, 8 bits ball ray x 10,
	 *   then 7 tables : 5 + 5 bits size, then 1 bit per cell (column by column)
	 *   for normal, time, death, magnet, shadow, block, (hole) bumpers.
	 *
	 * These tables are also the hitmaps used by the game (game/collide.js).
	 */
	const BUMPERS_DATA = "itaZgmzqyWaaFG_X_5_5_5_5_5_4_WFGaceaaaddaF-b_4h_G_-h_-_____3_-p_GF-b_Wh_GmmaaauOaaWlr_J-pX_I0daafkda_h-_7____5_J8dbZGaaFWp_h_X_-F_V_7_-F_N_5_8p_b_aaauR_V______________Zg______";

	const L = Gen.L = {};
	const b = new MB2.BitCodec(BUMPERS_DATA);

	L.delta = b.read(5);        // 4
	L.cwidth = b.read(10);      // 152
	L.cheight = b.read(10);     // 102
	L.cborder = b.read(5);      // 6
	L.red_cwidth = b.read(5);   // 6
	L.red_cheight = b.read(5);  // 6
	L.ball_ray = b.read(8) / 10 * 1.3;

	L.bumpers = [];
	for (let i = 0; i < 7; i++) {
		const w = b.read(5);
		const h = b.read(5);
		const table = Gen.newTable(w, h, false);
		for (let x = 0; x < w; x++)
			for (let y = 0; y < h; y++)
				table[x][y] = b.read(1) === 1;
		L.bumpers.push(table);
	}

	// a pastille occupies a full 6 x 6 square
	L.red_ctbl = Gen.newTable(L.red_cwidth, L.red_cheight, true);

	/** Hitmaps of the bumpers, indexed like mb2gen's table (see game/collide.js). */
	MB2.BUMPER_HITMAPS = L.bumpers;

})();
