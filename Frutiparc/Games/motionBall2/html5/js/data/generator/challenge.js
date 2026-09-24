/*
 * Random dungeon of the Challenge mode, converted to the level format of the
 * game (data/level_format.js) : MB2.generateChallenge(), port of Level.make
 * (mb2gen/level.ml).
 */
"use strict";

(function () {

	const Gen = MB2.Gen;
	const D = Gen.Dungeon;
	const Path = MB2.Path;

	const WIDTH = 8;
	const HEIGHT = 8;

	/** Distance of every room from the start, and the average distance. */
	function computeDists(d) {
		const m = Gen.newTable(WIDTH, HEIGHT, -1);

		function visit(p, n) {
			m[p.x][p.y] = n;
			for (const dir of D.DIRS) {
				if (D.isClosed(D.getPath(d, p, dir)))
					continue;
				const p2 = D.move(d, p, dir);
				const n2 = m[p2.x][p2.y];
				if (n2 === -1 || n2 > n + 1)
					visit(p2, n + 1);
			}
		}
		visit(d.dstart, 0);

		let total = 0;
		let count = 0;
		for (let x = 0; x < WIDTH; x++) {
			for (let y = 0; y < HEIGHT; y++) {
				if (m[x][y] !== -1) {
					count++;
					total += m[x][y];
				}
			}
		}
		return { m: m, average: (total / count) | 0 };
	}

	// ----- conversion to the game format (Dungeon.encode + LevelLoader) -----

	function convertPath(p) {
		switch (p.t) {
		case "open":
			return { ptype: Path.DOOR };
		case "closed":
			return { ptype: Path.WALL };
		case "invisible":
			return { ptype: Path.INVISIBLE };
		default:
			return { ptype: Path.SPECIAL, pdata: p.o };
		}
	}

	Gen.convertRoom = function (r, items) {
		const F = MB2.LevelFormat;
		const rt = r.rtype;
		if (rt === null)
			return F.newRoom(MB2.Room.NONE);

		const paths = [r.rleft, r.rright, r.rup, r.rdown].map(convertPath);
		const bdata = items ? items.map(([t, p]) => ({ btype: t, x: p.x, y: p.y })) : null;

		switch (rt.k) {
		case "normal":
		case "start":
			return F.newRoom(MB2.Room.NORMAL, undefined, paths, bdata);
		case "end":
			return F.newRoom(MB2.Room.END, undefined, paths, bdata);
		case "objfound":
			return F.newRoom(MB2.Room.OBJECT_FOUND, rt.o, paths, bdata);
		case "bonus":
			return F.newRoom(MB2.Room.BONUS, rt.b, paths, bdata);
		case "objneed":
			return F.newRoom(MB2.Room.OBJECT_NEEDED, rt.o, paths, bdata);
		}
		return null;
	};

	// ----- challenge -----

	function generateOnce() {
		const d = D.generate(WIDTH, HEIGHT);
		const dists = computeDists(d);
		const dungeon = [];

		for (let x = 0; x < WIDTH; x++) {
			dungeon[x] = [];
			for (let y = 0; y < HEIGHT; y++) {
				const r = d.dmap[x][y];
				// the difficulty grows with the distance from the start (0 .. ~20)
				const lvl = (dists.m[x][y] * 10 / dists.average) | 0;
				const ctx = { dungeon: d, pos: { x: x, y: y }, classic: null };
				dungeon[x][y] = Gen.convertRoom(r, Gen.Rooms.generate(ctx, r, lvl));
			}
		}

		return { width: WIDTH, height: HEIGHT, start_x: d.dstart.x, start_y: d.dstart.y, dungeon: dungeon };
	}

	MB2.generateChallenge = function () {
		// a room that can't be generated (very rare) makes a new dungeon
		return Gen.retry(Infinity, generateOnce);
	};

})();
