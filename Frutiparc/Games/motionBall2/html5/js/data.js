// MotionBall 2 - level data
//  - BitCodec : the Motion Twin base64 bit codec (ext.util.MTBitcodec)
//  - Assemble : port of mb2gen/assemble.ml (hand made dungeons: tuto, adventure, courses)
//  - Generator: port of mb2gen/dungeon.ml + level.ml (random dungeons: challenge, classic)
// All of them produce the structure that mb2/LevelLoader.as used to decode :
//   { width, height, start_x, start_y, dungeon[x][y] = { rtype, rdata, paths[4], bdata } }
// paths are ordered left, right, up, down.
"use strict";

MB2.BitCodec = class {
	constructor(str) {
		this.data = str || "";
		this.pos = 0;
		this.nbits = 0;
		this.bits = 0;
		this.error = false;
	}
	read(n) {
		while (this.nbits < n) {
			const c = MB2.BitCodec.CHARS.indexOf(this.data.charAt(this.pos++));
			if (c < 0) { this.error = true; return 0; }
			this.bits = ((this.bits << 6) | c) & 0xFFFFFF;
			this.nbits += 6;
		}
		this.nbits -= n;
		return (this.bits >> this.nbits) & ((1 << n) - 1);
	}
};
MB2.BitCodec.CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";

// room types (as decoded by LevelLoader)
MB2.R_NONE = 0; MB2.R_NORMAL = 1; MB2.R_END = 2; MB2.R_OBJFOUND = 3; MB2.R_BONUS = 4; MB2.R_OBJNEED = 5;
// path types
MB2.P_OPENED = 0; MB2.P_CLOSED = 1; MB2.P_INVISIBLE = 2; MB2.P_NEED = 3;
// objects / bonuses
MB2.O_GREEN = 0; MB2.O_BLUE = 1; MB2.O_METAL = 2; MB2.O_VIOLET = 3;
MB2.B_ORANGE = 0; MB2.B_RED = 1; MB2.B_MAP = 2; MB2.B_RADAR = 3; MB2.B_KEY = 4; MB2.B_SMALLTIME = 5; MB2.B_BIGTIME = 6;

MB2.POS_NBITS = 8;

// Decode a room made with mb2edit (DATA=...)
MB2.decodeRoomData = function (str) {
	const b = new MB2.BitCodec(str);
	// editor encoding : 0 closed, 1 opened, 2 invisible, 3 one-way
	const PATHS = [MB2.P_CLOSED, MB2.P_OPENED, MB2.P_INVISIBLE, MB2.P_NEED];
	const paths = [];
	for (let i = 0; i < 4; i++) paths.push(PATHS[b.read(2)]);
	b.read(1);
	const bumpers = [];
	while (true) {
		const t = b.read(4);
		if (t === 0 || b.error) break;
		const x = b.read(MB2.POS_NBITS);
		const y = b.read(MB2.POS_NBITS);
		bumpers.push({ btype: t, x: x, y: y });
	}
	return { paths: paths, bumpers: bumpers };
};

MB2.newRoom = function (rtype, rdata, paths, bdata) {
	const r = { rtype: rtype, rdata: rdata, paths: null, bdata: bdata || null };
	if (rtype !== MB2.R_NONE)
		r.paths = paths.map(p => (typeof p === "object") ? p : { ptype: p, pdata: (p === MB2.P_NEED) ? MB2.O_GREEN : undefined });
	return r;
};

// ---------------------------------------------------------------------------
// assemble.ml
MB2.assembleDungeon = function (lines) {
	const W = 8, H = 8;
	const ITEMS = {
		KEY: ["bonus", MB2.B_KEY], ORANGE: ["bonus", MB2.B_ORANGE], RED: ["bonus", MB2.B_RED],
		MAP: ["bonus", MB2.B_MAP], RADAR: ["bonus", MB2.B_RADAR], BIGTIME: ["bonus", MB2.B_BIGTIME],
		SMALLTIME: ["bonus", MB2.B_SMALLTIME],
		BLUE: ["obj", MB2.O_BLUE], METAL: ["obj", MB2.O_METAL], VIOLET: ["obj", MB2.O_VIOLET], GREEN: ["obj", MB2.O_GREEN]
	};
	const rooms = [];
	let start = null;
	for (let x = 0; x < W; x++) rooms[x] = [];
	for (let i = 0; i < W * H; i++) {
		const x = i % W, y = (i / W) | 0;
		const l = lines[i];
		const p = l.indexOf("=");
		const rt = p < 0 ? l : l.substr(0, p);
		const rd = p < 0 ? "" : l.substr(p + 1);
		let r = null;
		switch (rt) {
		case "NONE": break;
		case "START": start = { x: x, y: y }; // fallthrough
		case "DATA": r = { kind: "data", d: MB2.decodeRoomData(rd) }; break;
		case "ITEM":
			if (!ITEMS[rd]) throw new Error("Invalid item : " + rd);
			r = { kind: ITEMS[rd][0], v: ITEMS[rd][1] };
			break;
		case "END": r = { kind: "end" }; break;
		default: throw new Error("Invalid room type : " + rt);
		}
		rooms[x][y] = r;
	}
	if (!start) throw new Error("No start !");
	// path of the neighbour room facing us (for item rooms)
	const OPP = [1, 0, 3, 2];
	const DX = [-1, 1, 0, 0], DY = [0, 0, -1, 1];
	function neighbourPath(x, y, d) {
		const nx = x + DX[d], ny = y + DY[d];
		if (nx < 0 || ny < 0 || nx >= W || ny >= H) return MB2.P_CLOSED;
		const r = rooms[nx][ny];
		if (!r || r.kind !== "data") return MB2.P_CLOSED;
		return r.d.paths[OPP[d]] === MB2.P_CLOSED ? MB2.P_CLOSED : MB2.P_OPENED;
	}
	const dungeon = [];
	for (let x = 0; x < W; x++) {
		dungeon[x] = [];
		for (let y = 0; y < H; y++) {
			const r = rooms[x][y];
			let room;
			if (!r)
				room = MB2.newRoom(MB2.R_NONE);
			else if (r.kind === "data")
				room = MB2.newRoom(MB2.R_NORMAL, undefined, r.d.paths, r.d.bumpers);
			else {
				const paths = [0, 1, 2, 3].map(d => neighbourPath(x, y, d));
				if (r.kind === "end") room = MB2.newRoom(MB2.R_END, undefined, paths);
				else if (r.kind === "obj") room = MB2.newRoom(MB2.R_OBJFOUND, r.v, paths);
				else room = MB2.newRoom(MB2.R_BONUS, r.v, paths);
			}
			dungeon[x][y] = room;
		}
	}
	return { width: W, height: H, start_x: start.x, start_y: start.y, dungeon: dungeon };
};

// ---------------------------------------------------------------------------
// dungeon.ml + level.ml
(function () {

	class Retry { constructor(msg) { this.msg = msg; } }

	const rnd = n => Math.floor(Math.random() * n);
	const rbool = () => Math.random() < 0.5;
	const random2 = (min, max) => (max <= min) ? max : rnd(max - min + 1) + min;
	function ashuffle(a) {
		for (let i = 0; i < a.length; i++) {
			const p = rnd(a.length - i) + i;
			const t = a[p]; a[p] = a[i]; a[i] = t;
		}
		return a;
	}
	const newTable = (w, h, v) => { const t = []; for (let x = 0; x < w; x++) { t[x] = []; for (let y = 0; y < h; y++) t[x][y] = v; } return t; };

	// ------------------------------------------------------------ dungeon.ml
	const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;
	const DIRS = [UP, DOWN, LEFT, RIGHT];
	const dinv = d => [DOWN, UP, RIGHT, LEFT][d];
	// paths : { t : "open" | "closed" | "invisible" | "need", o : obj }
	const OPENED = { t: "open" }, CLOSED = { t: "closed" }, INVISIBLE = { t: "invisible" };
	const need = o => ({ t: "need", o: o });
	const FIXED_W = 8, FIXED_H = 8;
	const OBJECTS_COUNT = 4;
	const BONUS_COUNTS = [[1, 1], [1, 1], [1, 1], [1, 1], [0, 99], [0, 99], [0, 2]];
	const BONUS_PROBAS = [10, 10, 10, 10, 6, 7, 2];
	const BONUS_MIN_COUNT = 4;

	const canBlockOnlyDoor = o => (o === MB2.O_GREEN || o === MB2.O_BLUE) ? rbool() : false;
	function canHaveInvisibleDoor(b) {
		switch (b) {
		case MB2.B_ORANGE: case MB2.B_RED: return rbool();
		case MB2.B_MAP: return false;
		case MB2.B_BIGTIME: return true;
		default: return rnd(4) === 0;
		}
	}

	function newDungeon(w, h) {
		const m = [];
		for (let x = 0; x < w; x++) {
			m[x] = [];
			for (let y = 0; y < h; y++)
				m[x][y] = { rtype: null, rup: CLOSED, rdown: CLOSED, rleft: CLOSED, rright: CLOSED, x: x, y: y };
		}
		return { dmap: m, dwidth: w, dheight: h, dstart: null, dexit: null, dist_table: null };
	}
	const room = (d, p) => d.dmap[p.x][p.y];
	const posEq = (a, b) => a.x === b.x && a.y === b.y;
	const randPos = d => ({ x: rnd(d.dwidth), y: rnd(d.dheight) });
	function move(d, p, dir) {
		switch (dir) {
		case UP: if (p.y === 0) return null; return { x: p.x, y: p.y - 1 };
		case DOWN: if (p.y === d.dheight - 1) return null; return { x: p.x, y: p.y + 1 };
		case LEFT: if (p.x === 0) return null; return { x: p.x - 1, y: p.y };
		default: if (p.x === d.dwidth - 1) return null; return { x: p.x + 1, y: p.y };
		}
	}
	const FIELD = ["rup", "rdown", "rleft", "rright"];
	const getRoomPath = (r, dir) => r[FIELD[dir]];
	const getPath = (d, p, dir) => room(d, p)[FIELD[dir]];
	const setPath = (d, p, dir, v) => { room(d, p)[FIELD[dir]] = v; };
	const isClosed = p => p.t === "closed";

	function almostClose(d, p) {
		let b = false;
		for (const dir of ashuffle(DIRS.slice())) {
			if (isClosed(getPath(d, p, dir))) continue;
			if (b) {
				setPath(d, p, dir, CLOSED);
				setPath(d, move(d, p, dir), dinv(dir), CLOSED);
			} else
				b = true;
		}
	}

	function randomRoom(d, rt) {
		while (true) {
			const p = randPos(d);
			if (room(d, p).rtype === null) { room(d, p).rtype = rt; return p; }
		}
	}

	function genRoom(d, p) {
		let ep = p;
		for (const dir of ashuffle(DIRS.slice())) {
			const np = move(d, p, dir);
			if (!np || room(d, np).rtype !== null) continue;
			room(d, np).rtype = { k: "normal" };
			setPath(d, p, dir, OPENED);
			setPath(d, np, dinv(dir), OPENED);
			const np2 = genRoom(d, np);
			ep = np2;
			if (rnd(3) !== 0) return np2;
		}
		return ep;
	}

	function genPath(d, s) {
		while (true) {
			const p = randPos(d);
			if (room(d, p).rtype === null) continue;
			for (const dir of ashuffle(DIRS.slice())) {
				const np = move(d, p, dir);
				if (!np) continue;
				if (getPath(d, p, dir) === s) continue;
				setPath(d, p, dir, s);
				setPath(d, np, dinv(dir), s);
				return;
			}
		}
	}

	function genPathMap(d, sp) {
		const m = newTable(d.dwidth, d.dheight, -1);
		function loop(p, n) {
			m[p.x][p.y] = n;
			for (const dir of DIRS) {
				if (!isClosed(getPath(d, p, dir))) {
					const p2 = move(d, p, dir);
					const n2 = m[p2.x][p2.y];
					if (n2 === -1 || n2 > n + 1) loop(p2, n + 1);
				}
			}
		}
		loop(sp, 0);
		return m;
	}

	class ExitFound { }

	function genObjects(d, m) {
		let totDist = 0;
		let objCount = 0;
		const objectsFound = [];
		const objectsRooms = [];
		const mtbl = newTable(d.dwidth, d.dheight, -1);
		function loop(p, acc) {
			const n = m[p.x][p.y];
			mtbl[p.x][p.y] = totDist++;
			if (posEq(p, d.dexit)) throw new ExitFound();
			const dirs = ashuffle(DIRS.slice());
			let flag = false;
			for (const dir of dirs) {
				if (isClosed(getPath(d, p, dir))) continue;
				const p2 = move(d, p, dir);
				if (mtbl[p2.x][p2.y] !== -1) continue;
				const n2 = m[p2.x][p2.y];
				if (acc.length > 0 && rnd(6) === 0) {
					ashuffle(acc);
					objectsRooms.push({ p: p, dir: dir, n: acc[0] });
					acc = acc.slice(1);
				}
				if (n2 > n && (!flag || rnd(4) !== 0)) {
					acc = loop(p2, acc);
					totDist++;
				}
				flag = true;
			}
			let nways = 0;
			for (const dir of DIRS) if (!isClosed(getPath(d, p, dir))) nways++;
			if (nways === 1 && objCount < OBJECTS_COUNT) {
				objectsFound.push({ p: p, n: objCount });
				const pl = [];
				for (let i = rnd(3) + 1; i > 0; i--) pl.push(objCount);
				objCount++;
				acc = pl.concat(acc);
			}
			return acc;
		}
		try {
			loop(d.dstart, []);
			throw new Retry("exit not found");
		} catch (e) {
			if (!(e instanceof ExitFound)) throw e;
		}
		if (objCount !== OBJECTS_COUNT) throw new Retry("not enough objects found");
		for (let i = 0; i < OBJECTS_COUNT; i++)
			if (!objectsRooms.some(o => o.n === i)) throw new Retry("not enough objects used");
		const otable = ashuffle([0, 1, 2, 3]);
		for (const o of objectsRooms) {
			const obj = otable[o.n];
			if (canBlockOnlyDoor(obj)) {
				setPath(d, o.p, o.dir, need(obj));
				setPath(d, move(d, o.p, o.dir), dinv(o.dir), need(obj));
			} else
				room(d, o.p).rtype = { k: "objneed", o: obj };
		}
		for (const o of objectsFound)
			room(d, o.p).rtype = { k: "objfound", o: otable[o.n] };
	}

	function distObjectsMin(d, p) {
		const l = d.dist_table[p.x][p.y];
		let min = [-1, []];
		let i = 0;
		while (i < l.length) {
			const x = l[i];
			if (min[0] === -1) { min = x; i++; }
			else if (min[0] > x[0]) min = [x[0], min[1]];
			else if (x[1].length < min[1].length) min = [min[0], x[1]];
			else if (x[0] === min[0] && x[1].length === min[1].length) { min = x; i++; }
			else i++;
		}
		return min;
	}

	function checkDifficulty(d) {
		const m = newTable(d.dwidth, d.dheight, null);
		for (let x = 0; x < d.dwidth; x++) for (let y = 0; y < d.dheight; y++) m[x][y] = [];
		function linclude(l1, l2) {
			let i = 0, j = 0;
			while (true) {
				if (i >= l1.length) return true;
				if (j >= l2.length) return false;
				if (l2[j] < l1[i]) { j++; continue; }
				if (l2[j] === l1[i]) { i++; j++; continue; }
				return false;
			}
		}
		function addSort(x, l) {
			const r = l.slice();
			for (let i = 0; i < r.length; i++) {
				if (r[i] === x) return r;
				if (r[i] > x) { r.splice(i, 0, x); return r; }
			}
			r.push(x);
			return r;
		}
		const leq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
		function loop(objs, dist, p) {
			const rt = room(d, p).rtype;
			if (rt && rt.k === "objfound") objs = addSort(rt.o, objs);
			m[p.x][p.y].unshift([dist, objs]);
			if (rt && rt.k === "objneed" && objs.indexOf(rt.o) < 0) return;
			for (const dir of DIRS) {
				const path = getPath(d, p, dir);
				if (isClosed(path)) continue;
				if (path.t === "need" && objs.indexOf(path.o) < 0) continue;
				const p2 = move(d, p, dir);
				const l2 = m[p2.x][p2.y];
				if (l2.every(e => !linclude(objs, e[1])) || !l2.some(e => leq(objs, e[1]) && e[0] <= dist + 1))
					loop(objs, dist + 1, p2);
			}
		}
		loop([], 0, d.dstart);
		d.dist_table = m;
		const r = distObjectsMin(d, d.dexit);
		if (r[0] < d.dwidth * d.dheight * 40 / 100) throw new Retry("not enough difficulty");
		if (r[1].length !== OBJECTS_COUNT) throw new Retry("not enough objects for ending level");
	}

	function genObjectsFinal(d) {
		const impList = [];
		// returns -1 : NotYet, -2 : TooMuch, dir : Path dir
		function isImpass(p, exclDir) {
			const rt = room(d, p).rtype;
			let tpath = (rt && rt.k === "normal") ? -1 : -2;
			for (const dir of DIRS) {
				if (dir === exclDir) continue;
				if (isClosed(getPath(d, p, dir))) continue;
				if (tpath === -1) tpath = dir;
				else return -2;
			}
			return tpath;
		}
		function impassStart(p, dir) {
			while (true) {
				const p2 = move(d, p, dir);
				const dir2 = dinv(dir);
				const r = isImpass(p2, dir2);
				if (r === -1) throw new Retry("impass");
				if (r === -2) return { sp: p2, dir: dir2 };
				p = p2; dir = r;
			}
		}
		for (let x = 0; x < d.dwidth; x++)
			for (let y = 0; y < d.dheight; y++) {
				const p = { x: x, y: y };
				for (const dir of DIRS) {
					const path = getPath(d, p, dir);
					if (path.t === "need") {
						const p2 = move(d, p, dir);
						if (distObjectsMin(d, p)[0] < distObjectsMin(d, p2)[0]) setPath(d, p2, dinv(dir), OPENED);
					}
				}
				const r = isImpass(p);
				if (r >= 0) impList.unshift({ p: p, s: impassStart(p, r) });
			}
		const imps = ashuffle(impList);
		if (imps.length < BONUS_MIN_COUNT) throw new Retry("not enough impass for bonuses");
		const bonusTbl = [];
		let probaTot = 0;
		let bpos = 0;
		const counts = BONUS_COUNTS.map((mm, n) => {
			for (let i = 1; i <= mm[0]; i++) {
				bonusTbl[bpos] = n;
				if (n === MB2.B_MAP && distObjectsMin(d, imps[bpos].p)[0] > 10) throw new Retry("map is too far");
				bpos++;
			}
			if (mm[1] > mm[0]) probaTot += BONUS_PROBAS[n];
			return mm[1] - mm[0];
		});
		while (bpos < imps.length) {
			let p = rnd(probaTot);
			let pos = 0;
			while (p > BONUS_PROBAS[pos] || counts[pos] === 0) {
				while (counts[pos] === 0) { pos++; if (pos >= counts.length) throw new Retry("bonus"); }
				if (p > BONUS_PROBAS[pos]) {
					p -= BONUS_PROBAS[pos];
					pos++;
					if (pos >= counts.length) throw new Retry("bonus");
				}
			}
			bonusTbl[bpos] = pos;
			counts[pos]--;
			if (counts[pos] === 0) probaTot -= BONUS_PROBAS[pos];
			bpos++;
		}
		imps.forEach((imp, n) => {
			const b = bonusTbl[n];
			room(d, imp.p).rtype = { k: "bonus", b: b };
			if (canHaveInvisibleDoor(b)) setPath(d, imp.s.sp, imp.s.dir, INVISIBLE);
		});
	}

	function genDungeon(w, h) {
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
		const m = genPathMap(d, sp);
		let count = 0;
		for (let x = 0; x < w; x++)
			for (let y = 0; y < h; y++) {
				if (m[x][y] === -1) d.dmap[x][y].rtype = null;
				else {
					if (d.dmap[x][y].rtype === null) d.dmap[x][y].rtype = { k: "normal" };
					count++;
				}
			}
		const ert = room(d, ep).rtype, srt = room(d, sp).rtype;
		if (!ert || ert.k !== "end" || !srt || srt.k !== "start") throw new Retry("exit or start erased");
		if (count < w * h * 3 / 4) throw new Retry("not enough superficy");
		for (let counter = 0; ; counter++) {
			try {
				genObjects(d, m);
				break;
			} catch (e) {
				if (!(e instanceof Retry) || counter >= 50) throw e;
			}
		}
		checkDifficulty(d);
		genObjectsFinal(d);
		return d;
	}

	// ------------------------------------------------------------ level.ml
	const BUMPERS_DATA = "itaZgmzqyWaaFG_X_5_5_5_5_5_4_WFGaceaaaddaF-b_4h_G_-h_-_____3_-p_GF-b_Wh_GmmaaauOaaWlr_J-pX_I0daafkda_h-_7____5_J8dbZGaaFWp_h_X_-F_V_7_-F_N_5_8p_b_aaauR_V______________Zg______";
	const L = {};
	(function loadBumpers() {
		const b = new MB2.BitCodec(BUMPERS_DATA);
		L.delta = b.read(5);
		L.cwidth = b.read(10);
		L.cheight = b.read(10);
		L.cborder = b.read(5);
		L.red_cwidth = b.read(5);
		L.red_cheight = b.read(5);
		L.ball_ray = b.read(8) / 10 * 1.3;
		L.bumpers = [];
		for (let i = 0; i < 7; i++) {
			const w = b.read(5), h = b.read(5);
			const t = newTable(w, h, false);
			for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) t[x][y] = b.read(1) === 1;
			L.bumpers.push(t);
		}
		L.red_ctbl = newTable(L.red_cwidth, L.red_cheight, true);
	})();
	MB2.BUMPER_HITMAPS = L.bumpers;

	// item codes (as encoded for the game)
	const BNORMAL = 1, BTIME = 2, BDEATH = 3, BMAGNET = 4, BSHADOW = 5, BBLOCK = 6, BHOLE = 7, BRED = 8, BBLUE = 9, CLASSICEXIT = 15;
	// collide
	const CNONE = 0, CBORDER = 1, CBUMPER = 2, CREDBLUE = 3, CBLOCK = 4, CHOLE = 5;
	const DOOR_SIZE = 110;
	const BLOCK_MASK = 1 << 16, HOLE_MASK = 1 << 17, BIT_MASK = 0xFFFF;
	const MAX_BUMPER_TIME = 3;

	const S = { classic: false, classic_enter: null, classic_exit: null };
	const CLASSIC_EXIT_TBL = newTable(10, 10, true);

	const bumperForObject = o => (o === MB2.O_GREEN) ? BBLOCK : (o === MB2.O_BLUE) ? BHOLE : (o === MB2.O_METAL) ? BMAGNET : BSHADOW;
	const collideForObject = o => (o === MB2.O_GREEN) ? CBLOCK : CHOLE;

	function newColTable() {
		const c = newTable(L.cwidth, L.cheight, CNONE);
		for (let x = 0; x < L.cborder; x++)
			for (let y = 0; y < L.cheight; y++) { c[x][y] = CBORDER; c[L.cwidth - x - 1][y] = CBORDER; }
		for (let y = 0; y < L.cborder; y++)
			for (let x = 0; x < L.cwidth; x++) { c[x][y] = CBORDER; c[x][L.cheight - y - 1] = CBORDER; }
		return c;
	}

	function genPos(ctbl, btbl, txt) {
		for (let n = 0; n < 100; n++) {
			const px = random2(L.cborder, L.cwidth - L.cborder * 2 - btbl.length);
			const py = random2(L.cborder, L.cheight - L.cborder * 2 - btbl[0].length);
			let ok = true;
			for (let x = 0; x < btbl.length && ok; x++)
				for (let y = 0; y < btbl[x].length; y++)
					if (btbl[x][y] && ctbl[px + x][py + y] !== CNONE) { ok = false; break; }
			if (ok) return { x: px, y: py };
		}
		throw new Retry(txt);
	}

	function computeRoomTbl(ctbl, spos) {
		const delta = L.delta, demi = delta / 2;
		const bray = L.ball_ray + demi;
		const cb = (L.cborder / 2) | 0;
		const m = newTable(L.cwidth, L.cheight, -1);
		const ANG = [];
		for (let n = 0; n < 32; n++) { const a = n * 2 * 3.14159 / 32; ANG.push([Math.cos(a) * bray, Math.sin(a) * bray]); }
		for (let y = cb; y <= L.cheight - 1 - cb; y++)
			for (let x = cb; x <= L.cwidth - 1 - cb; x++) {
				const sx = (x + 0.5) * delta, sy = (y + 0.5) * delta;
				let acc = 0;
				for (let n = 0; n < 32; n++) {
					const px = Math.trunc((sx + ANG[n][0]) / delta);
					const py = Math.trunc((sy + ANG[n][1]) / delta);
					const c = ctbl[px][py];
					if (c === CNONE || c === CREDBLUE) continue;
					if (c === CHOLE) { acc |= HOLE_MASK; continue; }
					if (c === CBLOCK) { acc |= BLOCK_MASK; continue; }
					acc = -1;
					break;
				}
				m[x][y] = acc;
			}
		// flood fill (iterative version of the recursive OCaml one, same visiting order)
		const get = (x, y) => (m[x] === undefined || m[x][y] === undefined) ? -1 : m[x][y];
		const NX = [-1, 1, 0, 0], NY = [0, 0, -1, 1];
		const stack = [];
		function enter(x, y, acc) {
			const b = get(x, y);
			acc = acc | (b & (HOLE_MASK | BLOCK_MASK));
			m[x][y] = (b === -1) ? 1 : ((b + 1) | acc);
			stack.push({ x: x, y: y, acc: acc, k: 0 });
		}
		enter(spos.x, spos.y, 0);
		while (stack.length) {
			const f = stack[stack.length - 1];
			if (f.k === 4) { stack.pop(); continue; }
			const k = f.k++;
			const nx = f.x + NX[k], ny = f.y + NY[k];
			if ((get(nx, ny) & BIT_MASK) === 0) enter(nx, ny, f.acc);
		}
		return m;
	}

	function fillPos(ctbl, btbl, p, v) {
		for (let x = 0; x < btbl.length; x++)
			for (let y = 0; y < btbl[x].length; y++)
				if (btbl[x][y]) ctbl[p.x + x][p.y + y] = v;
	}

	function fillDoors(r, ctbl) {
		let spos = null;
		const blist = [];
		function fillDoor(path, sx, sy, dx, dy, dpx, dpy) {
			if (isClosed(path)) return;
			for (let x = 0; x < dx; x++) for (let y = 0; y < dy; y++) ctbl[x + sx][y + sy] = CNONE;
			if (path.t === "open" || path.t === "invisible") spos = { x: sx + dpx, y: sy + dpy };
		}
		const wallXmax = ((L.cwidth - L.cborder * 2) / 10 | 0) - 1;
		const wallYmax = ((L.cheight - L.cborder * 2) / 10 | 0) - 1;
		function fillBlock(path, sx, sy, ex, ey) {
			if (path.t !== "need") return;
			const c = collideForObject(path.o);
			const b = bumperForObject(path.o);
			for (let x = sx; x <= ex; x++)
				for (let y = sy; y <= ey; y++) {
					const px = L.cborder + x * 10, py = L.cborder + y * 10;
					blist.unshift([b, { x: px, y: py }]);
					for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) ctbl[px + i][py + j] = c;
				}
		}
		const cb = L.cborder - 1;
		const doorCsize = ((DOOR_SIZE + L.delta - 1) / L.delta) | 0;
		const doorX = ((L.cwidth - doorCsize) / 2) | 0;
		const doorY = ((L.cheight - doorCsize) / 2) | 0;
		const half = (doorCsize / 2) | 0;
		fillDoor(r.rleft, 1, doorY, cb, doorCsize, cb - 1, half);
		fillDoor(r.rright, L.cwidth - L.cborder, doorY, cb, doorCsize, 1 - cb, half);
		fillDoor(r.rup, doorX, 1, doorCsize, cb, half, cb - 1);
		fillDoor(r.rdown, doorX, L.cheight - L.cborder, doorCsize, cb, half, 1 - cb);
		fillBlock(r.rleft, 1, 0, 1, wallYmax);
		fillBlock(r.rright, wallXmax - 1, 0, wallXmax - 1, wallYmax);
		fillBlock(r.rup, 0, 1, wallXmax, 1);
		fillBlock(r.rdown, 0, wallYmax - 1, wallXmax, wallYmax - 1);
		if (spos === null) throw new Retry("no entrance");
		return { spos: spos, blist: blist };
	}

	const calcMask = obj => 0xFFFFFF - ((obj === null || obj === undefined) ? 0 : (obj === MB2.O_GREEN) ? BLOCK_MASK : HOLE_MASK);

	function checkRed(p, mtbl, obj) {
		const mask = calcMask(obj);
		for (let x = 0; x < L.red_cwidth; x++)
			for (let y = 0; y < L.red_cheight; y++)
				if ((mtbl[p.x + x][p.y + y] & mask) !== 1) throw new Retry("check red");
	}

	function putRedBlue(mtbl, ctbl, obj) {
		for (let n = 100; n > 0; n--) {
			const p = genPos(ctbl, L.red_ctbl, "redblue");
			try {
				checkRed(p, mtbl, obj);
				fillPos(ctbl, L.red_ctbl, p, CREDBLUE);
				return p;
			} catch (e) {
				if (!(e instanceof Retry)) throw e;
			}
		}
		throw new Retry("put redblue");
	}

	function genRedBlues(mtbl, ctbl, obj, n, t) {
		const l = [];
		for (; n > 0; n--) l.push([t, putRedBlue(mtbl, ctbl, obj)]);
		return l;
	}

	function checkDoors(r, mtbl, obj) {
		const mask0 = calcMask(obj);
		function checkDoor(path, sx, sy, dx, dy) {
			if (isClosed(path)) return;
			const mask = (path.t === "need") ? (mask0 & calcMask(path.o)) : mask0;
			for (let x = 0; x < dx; x++)
				for (let y = 0; y < dy; y++)
					if ((mtbl[x + sx][y + sy] & mask) !== 1) throw new Retry("check door");
		}
		const cb = L.cborder - 1;
		const doorCsize = (((DOOR_SIZE + L.delta - 1) / L.delta) | 0) - 6;
		const doorX = ((L.cwidth - doorCsize) / 2) | 0;
		const doorY = ((L.cheight - doorCsize) / 2) | 0;
		checkDoor(r.rleft, cb, doorY, 1, doorCsize);
		checkDoor(r.rright, L.cwidth - L.cborder, doorY, 1, doorCsize);
		checkDoor(r.rup, doorX, cb, doorCsize, 1);
		checkDoor(r.rdown, doorX, L.cheight - L.cborder, doorCsize, 1);
	}

	function fillWall(blist, x, y, ctbl, c, btype) {
		const sx = L.cborder + x * 10, sy = L.cborder + y * 10;
		if (ctbl[sx][sy] === CNONE) {
			blist.unshift([btype, { x: sx, y: sy }]);
			for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) ctbl[i + sx][j + sy] = c;
		}
	}

	function objectNeeded(dp, obj) {
		const l = dp.d.dist_table[dp.p.x][dp.p.y];
		return l.every(e => e[1].indexOf(obj) >= 0);
	}

	function genSeparators(r, ctbl, btype, ecart) {
		const xmin = 0, ymin = 0;
		const xmax = (L.cwidth - L.cborder * 2) / 10 | 0;
		const ymax = (L.cheight - L.cborder * 2) / 10 | 0;
		const xdoor = (xmax / 2 | 0) - 1, xdoor2 = (xmax / 2 | 0) + 1;
		const ydoor = (ymax / 2 | 0) - 1, ydoor2 = (ymax / 2 | 0) + 1;
		const half = ecart / 2 | 0, half2 = (ecart - 1) / 2 | 0;
		const blist = [];
		const op = p => !isClosed(p);
		function loop(horiz, n) {
			while (n > 0) {
				const yp = random2(ymin + 1 + half, ymax - 2 - half2);
				const xp = random2(xmin + 1 + half, xmax - 2 - half2);
				if (!horiz && xp >= xdoor && xp <= xdoor2 && (op(r.rup) || op(r.rdown))) { n--; continue; }
				if (horiz && yp >= ydoor && yp <= ydoor2 && (op(r.rleft) || op(r.rright))) { n--; continue; }
				if (!horiz && !((xp >= xdoor2 && op(r.rright)) || (xp <= xdoor && op(r.rleft)))) { n--; continue; }
				if (horiz && !((yp >= ydoor2 && op(r.rdown)) || (yp <= ydoor && op(r.rup)))) { n--; continue; }
				if (horiz) {
					for (let x = xmin; x < xmax; x++)
						if (x < xp - half || x > xp + half2) fillWall(blist, x, yp, ctbl, CBORDER, btype);
				} else {
					for (let y = ymin; y < ymax; y++)
						if (y < yp - half || y > yp + half2) fillWall(blist, xp, y, ctbl, CBORDER, btype);
				}
				return;
			}
		}
		const horiz = rbool();
		loop(horiz, 2);
		if (blist.length) loop(!horiz, 2);
		return blist;
	}

	function genObjectNeed(ctbl, obj) {
		const blist = [];
		const c = collideForObject(obj);
		const b = bumperForObject(obj);
		const xmax = ((L.cwidth - L.cborder * 2) / 10 | 0) - 1;
		const ymax = ((L.cheight - L.cborder * 2) / 10 | 0) - 1;
		const xsize = random2(obj === MB2.O_BLUE ? 4 : 3, xmax - 2) - 1;
		const ysize = random2(obj === MB2.O_BLUE ? 4 : 3, ymax - 2) - 1;
		const xp = random2(1, xmax - 1 - xsize);
		const yp = random2(1, ymax - 1 - ysize);
		for (let i = xp; i <= xp + xsize; i++) {
			fillWall(blist, i, yp, ctbl, c, b);
			fillWall(blist, i, yp + ysize, ctbl, c, b);
		}
		for (let j = yp; j <= yp + ysize; j++) {
			fillWall(blist, xp, j, ctbl, c, b);
			fillWall(blist, xp + xsize, j, ctbl, c, b);
		}
		const p = {
			x: xp * 10 + (xsize + 1) * 5 + (L.red_cwidth / 2 | 0),
			y: yp * 10 + (ysize + 1) * 5 + (L.red_cheight / 2 | 0)
		};
		fillPos(ctbl, L.red_ctbl, p, CREDBLUE);
		return [[BRED, p]].concat(blist);
	}

	function genExit(ctbl) {
		const p = S.classic_exit;
		for (let x = 0; x < 10; x++)
			for (let y = 0; y < 10; y++)
				if (ctbl[p.x + x][p.y + y] !== CNONE) throw new Error("cannot put exit");
		fillPos(ctbl, CLASSIC_EXIT_TBL, p, CHOLE);
	}

	function genNormalRoom(dp, r, lvl, obj) {
		const minBumpers = ((lvl * 1 / 3) | 0) + 5;
		const maxBumpers = lvl + 7;
		const nbumpers = Math.min(random2(minBumpers, maxBumpers), 30);
		let availableBtime = MAX_BUMPER_TIME;
		let availableMagnet = (objectNeeded(dp, MB2.O_METAL) && rnd(2) === 0) ? Math.min(random2(0, 4), random2(0, 4)) : Math.min(random2(0, 1), random2(0, 1));
		let availableShadow = (objectNeeded(dp, MB2.O_VIOLET) && rnd(3) === 0) ? Math.min(random2(0, 2), random2(0, 2)) : 0;
		const ctbl = newColTable();
		let spos, blist;
		if (!S.classic) {
			const fd = fillDoors(r, ctbl);
			spos = (lvl === 0) ? { x: L.cwidth / 2 | 0, y: L.cheight / 2 | 0 } : fd.spos;
			blist = fd.blist;
		} else {
			const p = S.classic_enter;
			if (random2(0, 5) !== 0) { availableMagnet = 0; availableShadow = 0; }
			spos = { x: p.x + 5, y: p.y + 5 };
			blist = [];
		}
		if (S.classic) {
			genExit(ctbl);
			blist.unshift([CLASSICEXIT, S.classic_exit]);
		}
		if (obj !== null && obj !== undefined) blist = blist.concat(genObjectNeed(ctbl, obj));
		if (!S.classic) blist = blist.concat(genSeparators(r, ctbl, rnd(3) === 0 ? BHOLE : BBLOCK, Math.max(5 - (lvl / 4 | 0), 1)));
		const bumpers = [];
		for (let i = 0; i < nbumpers; i++) {
			if (rnd(100) < ((lvl * 100 / 40) | 0)) {
				if (availableMagnet > 0) { availableMagnet--; bumpers.push([BMAGNET, L.bumpers[3]]); }
				else if (availableShadow > 0) { availableShadow--; bumpers.push([BSHADOW, L.bumpers[4]]); }
				else if (availableBtime > 0 && rnd(5) !== 0) { availableBtime--; bumpers.push([BTIME, L.bumpers[1]]); }
				else bumpers.push([BDEATH, L.bumpers[2]]);
			} else
				bumpers.push([BNORMAL, L.bumpers[0]]);
		}
		for (const [btype, btbl] of bumpers) {
			let pos;
			while (true) {
				pos = genPos(ctbl, btbl, "bumper");
				if ((btype === BMAGNET || btype === BDEATH) && (pos.x < 15 || pos.y < 15 || pos.x > L.cwidth - 15 || pos.y > L.cheight - 15)) continue;
				break;
			}
			fillPos(ctbl, btbl, pos, CBUMPER);
			blist.unshift([btype, pos]);
		}
		const minReds = (lvl / 3 | 0) + 1;
		const maxReds = (lvl * 2 / 3 | 0) + 1;
		const mtbl = computeRoomTbl(ctbl, spos);
		let nblues, nreds;
		if (!S.classic) {
			nblues = Math.min(random2(0, 4), random2(0, 4)) - 1;
			nreds = Math.min(random2(minReds, maxReds), 10);
		} else {
			nblues = Math.min(random2(0, 3), random2(0, 3)) - 1;
			nreds = Math.min(random2(lvl * 2 / 3 | 0, lvl), 10);
		}
		for (const [t, p] of blist) if (t === BRED) checkRed(p, mtbl, obj);
		checkDoors(r, mtbl, obj);
		return blist.concat(genRedBlues(mtbl, ctbl, obj, nreds, BRED)).concat(genRedBlues(mtbl, ctbl, obj, nblues, BBLUE));
	}

	function genSpecialRoom(r, obj) {
		const ctbl = newColTable();
		const btype = (obj === MB2.O_METAL) ? BMAGNET : BSHADOW;
		const btbl = (obj === MB2.O_METAL) ? L.bumpers[3] : L.bumpers[4];
		const nbumpers = 20;
		const fd = fillDoors(r, ctbl);
		let blist = fd.blist.concat(genSeparators(r, ctbl, BHOLE, 3));
		for (let i = 1; i <= nbumpers; i++) {
			const pos = genPos(ctbl, btbl, "spe-bumper");
			fillPos(ctbl, btbl, pos, CBUMPER);
			blist.unshift([btype, pos]);
		}
		const ndeaths = random2(2, 5);
		for (let i = 1; i <= ndeaths; i++) {
			const pos = genPos(ctbl, L.bumpers[2], "death");
			fillPos(ctbl, L.bumpers[2], pos, CBUMPER);
			blist.unshift([BDEATH, pos]);
		}
		const nreds = random2(4, 10);
		const mtbl = computeRoomTbl(ctbl, fd.spos);
		for (const [t, p] of blist) if (t === BRED) checkRed(p, mtbl, null);
		checkDoors(r, mtbl, null);
		return blist.concat(genRedBlues(mtbl, ctbl, null, nreds, BRED));
	}

	function genRoomBumpers(dp, lvl, r) {
		const rt = r.rtype;
		if (rt === null) return null;
		switch (rt.k) {
		case "end": case "objfound": case "bonus": return null;
		case "start": case "normal": return genNormalRoom(dp, r, lvl, null);
		case "objneed":
			if (rt.o === MB2.O_GREEN || rt.o === MB2.O_BLUE) return genNormalRoom(dp, r, lvl, rt.o);
			if (rt.o === MB2.O_VIOLET && rnd(4) !== 0) return genSpecialRoom(r, rt.o);
			if (rt.o === MB2.O_METAL && rnd(3) !== 0) return genSpecialRoom(r, rt.o);
			return genNormalRoom(dp, r, lvl, null);
		}
		return null;
	}

	function genRoomRetry(dp, lvl, r) {
		for (let count = 1000; count > 0; count--) {
			try {
				return genRoomBumpers(dp, lvl, r);
			} catch (e) {
				if (!(e instanceof Retry)) throw e;
			}
		}
		throw new Retry("room aborted");
	}

	function computeDists(d) {
		const m = newTable(FIXED_W, FIXED_H, -1);
		function loop(p, n) {
			m[p.x][p.y] = n;
			for (const dir of DIRS) {
				if (!isClosed(getPath(d, p, dir))) {
					const p2 = move(d, p, dir);
					const n2 = m[p2.x][p2.y];
					if (n2 === -1 || n2 > n + 1) loop(p2, n + 1);
				}
			}
		}
		loop(d.dstart, 0);
		let tot = 0, nroom = 0;
		for (let x = 0; x < FIXED_W; x++) for (let y = 0; y < FIXED_H; y++) if (m[x][y] !== -1) { nroom++; tot += m[x][y]; }
		return { m: m, moy: (tot / nroom) | 0 };
	}

	// convert to the game structure (Dungeon.encode + LevelLoader.decode)
	function convertPath(p) {
		switch (p.t) {
		case "open": return { ptype: MB2.P_OPENED };
		case "closed": return { ptype: MB2.P_CLOSED };
		case "invisible": return { ptype: MB2.P_INVISIBLE };
		default: return { ptype: MB2.P_NEED, pdata: p.o };
		}
	}
	function convertRoom(r, bl) {
		const rt = r.rtype;
		if (rt === null) return MB2.newRoom(MB2.R_NONE);
		const paths = [r.rleft, r.rright, r.rup, r.rdown].map(convertPath);
		const bdata = bl ? bl.map(([t, p]) => ({ btype: t, x: p.x, y: p.y })) : null;
		switch (rt.k) {
		case "normal": case "start": return MB2.newRoom(MB2.R_NORMAL, undefined, paths, bdata);
		case "end": return MB2.newRoom(MB2.R_END, undefined, paths, bdata);
		case "objfound": return MB2.newRoom(MB2.R_OBJFOUND, rt.o, paths, bdata);
		case "bonus": return MB2.newRoom(MB2.R_BONUS, rt.b, paths, bdata);
		case "objneed": return MB2.newRoom(MB2.R_OBJNEED, rt.o, paths, bdata);
		}
	}

	// Level.make : a random 8x8 challenge dungeon
	MB2.generateChallenge = function () {
		S.classic = false;
		while (true) {
			try {
				let d;
				while (true) {
					try { d = genDungeon(FIXED_W, FIXED_H); break; }
					catch (e) { if (!(e instanceof Retry)) throw e; }
				}
				const dists = computeDists(d);
				const dungeon = [];
				for (let x = 0; x < FIXED_W; x++) {
					dungeon[x] = [];
					for (let y = 0; y < FIXED_H; y++) {
						const r = d.dmap[x][y];
						const lvl = (dists.m[x][y] * 10 / dists.moy) | 0;
						dungeon[x][y] = convertRoom(r, genRoomRetry({ d: d, p: { x: x, y: y } }, lvl, r));
					}
				}
				return { width: FIXED_W, height: FIXED_H, start_x: d.dstart.x, start_y: d.dstart.y, dungeon: dungeon };
			} catch (e) {
				if (!(e instanceof Retry)) throw e;
			}
		}
	};

	function randomExit() {
		const xmax = ((L.cwidth - L.cborder * 2) / 10 | 0) - 1;
		const ymax = ((L.cheight - L.cborder * 2) / 10 | 0) - 1;
		return { x: L.cborder + random2(0, xmax) * 10, y: L.cborder + random2(0, ymax) * 10 };
	}

	// Level.make_classic : nrooms columns of <choices> rooms, one exit hole per room.
	// Rooms are generated lazily (column by column) since the player rarely goes far.
	MB2.ClassicDungeon = class {
		constructor(choices) {
			this.width = 100;
			this.height = choices;
			this.start_x = 0;
			this.start_y = 0;
			this.dungeon = [];
			this.generated = 0;
			this.enter = { x: (L.cwidth / 2 | 0) - 3, y: (L.cheight / 2 | 0) - 3 };
			this.exit = randomExit();
			for (let x = 0; x < this.width; x++) this.dungeon[x] = [];
			this.ensure(2);
		}
		ensure(col) {
			col = Math.min(col, this.width - 1);
			while (this.generated <= col) {
				const j = this.generated++;
				S.classic = true;
				S.classic_enter = this.enter;
				S.classic_exit = this.exit;
				const dist = [];
				for (let i = 0; i < this.height; i++) dist[i] = [];
				const fake = { dist_table: [] };
				fake.dist_table[j] = dist;
				for (let i = 0; i < this.height; i++) {
					const r = { rtype: { k: "normal" }, rup: CLOSED, rdown: CLOSED, rleft: CLOSED, rright: CLOSED };
					let bl = null;
					while (bl === null) {
						try { bl = genRoomRetry({ d: fake, p: { x: j, y: i } }, j / 2 | 0, r); }
						catch (e) { if (!(e instanceof Retry)) throw e; }
					}
					this.dungeon[j][i] = convertRoom(r, bl);
				}
				S.classic = false;
				this.enter = this.exit;
				this.exit = randomExit();
			}
		}
	};

})();
