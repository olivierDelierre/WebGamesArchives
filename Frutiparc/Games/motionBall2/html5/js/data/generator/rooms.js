/*
 * Random room content. Port of the room part of mb2gen/level.ml.
 *
 * A room is generated on a collision table of the room cells (152 x 102),
 * like the one of the game, where each cell holds what occupies it :
 * border, bumper, pastille, green block or hole.
 *
 * The generator places, in order :
 *   - the doors (clearing the border) and the blocks of the doors needing a ball,
 *   - the classic mode exit hatch,
 *   - the wall / hole enclosing the ball needed by the room (genObjectNeed),
 *   - random separating walls (genSeparators),
 *   - the bumpers, their kind depending on the room level,
 * then computes which cells the ball can reach from the entrance
 * (computeRoomTbl) to place the red and blue pastilles only where they can be
 * collected, and to check that every exit is reachable.
 *
 * The result is a list of [btype, { x, y }] items (MB2.Bumper, cell of the
 * top-left corner), converted to the game format in challenge.js.
 */
"use strict";

(function () {

	const Gen = MB2.Gen;
	const L = Gen.L;
	const B = MB2.Bumper;
	const Obj = MB2.DungeonObject;
	const { Retry, rnd, rbool, random2, newTable } = Gen;
	const isClosed = p => p.t === "closed";

	// content of a collision cell
	const CNONE = 0, CBORDER = 1, CBUMPER = 2, CREDBLUE = 3, CBLOCK = 4, CHOLE = 5;

	// flags of computeRoomTbl : the way to the cell crosses a green block / a hole
	const BLOCK_MASK = 1 << 16;
	const HOLE_MASK = 1 << 17;
	const BIT_MASK = 0xFFFF;

	const DOOR_SIZE = 110;
	const MAX_BUMPER_TIME = 3;
	const CLASSIC_EXIT_TBL = newTable(10, 10, true);

	// the items blocking the way for a ball : green blocks (green ball) or holes (blue ball)
	const bumperForObject = o => (o === Obj.GREEN) ? B.WALL : (o === Obj.BLUE) ? B.HOLE : (o === Obj.METAL) ? B.MAGNET : B.SHADOW;
	const collideForObject = o => (o === Obj.GREEN) ? CBLOCK : CHOLE;

	// room size in wall cells (10 x 10 collision cells)
	const WALL_W = (L.cwidth - L.cborder * 2) / 10 | 0;   // 14
	const WALL_H = (L.cheight - L.cborder * 2) / 10 | 0;  // 9

	// ----- collision table helpers -----

	function newColTable() {
		const c = newTable(L.cwidth, L.cheight, CNONE);
		for (let x = 0; x < L.cborder; x++) {
			for (let y = 0; y < L.cheight; y++) {
				c[x][y] = CBORDER;
				c[L.cwidth - x - 1][y] = CBORDER;
			}
		}
		for (let y = 0; y < L.cborder; y++) {
			for (let x = 0; x < L.cwidth; x++) {
				c[x][y] = CBORDER;
				c[x][L.cheight - y - 1] = CBORDER;
			}
		}
		return c;
	}

	/** A random free position for the shape btbl (100 tries). */
	function genPos(ctbl, btbl, txt) {
		for (let n = 0; n < 100; n++) {
			const px = random2(L.cborder, L.cwidth - L.cborder * 2 - btbl.length);
			const py = random2(L.cborder, L.cheight - L.cborder * 2 - btbl[0].length);
			if (isFree(ctbl, btbl, px, py))
				return { x: px, y: py };
		}
		throw new Retry(txt);
	}

	function isFree(ctbl, btbl, px, py) {
		for (let x = 0; x < btbl.length; x++)
			for (let y = 0; y < btbl[x].length; y++)
				if (btbl[x][y] && ctbl[px + x][py + y] !== CNONE)
					return false;
		return true;
	}

	function fillPos(ctbl, btbl, p, v) {
		for (let x = 0; x < btbl.length; x++)
			for (let y = 0; y < btbl[x].length; y++)
				if (btbl[x][y])
					ctbl[p.x + x][p.y + y] = v;
	}

	/** Fills a 10 x 10 wall cell (x, y in wall cells) if it is free. */
	function fillWall(blist, x, y, ctbl, c, btype) {
		const sx = L.cborder + x * 10;
		const sy = L.cborder + y * 10;
		if (ctbl[sx][sy] !== CNONE)
			return;
		blist.unshift([btype, { x: sx, y: sy }]);
		for (let i = 0; i < 10; i++)
			for (let j = 0; j < 10; j++)
				ctbl[i + sx][j + sy] = c;
	}

	/**
	 * Which cells can the ball reach from spos ?
	 *
	 * First, each cell gets :
	 *   -1                 the ball can't be there (a border or a bumper is too close)
	 *   0 | flags          it can, flags telling if a block / hole is close
	 * Then a flood fill from spos replaces the reached cells by
	 *   (cell value + 1) | flags accumulated along the way
	 * so a reached cell is 1 when no block / hole is on the way. The flags let
	 * the checks accept the cells that are only reachable with the ball of the room.
	 */
	function computeRoomTbl(ctbl, spos) {
		const delta = L.delta;
		const bray = L.ball_ray + delta / 2;
		const cb = (L.cborder / 2) | 0;
		const m = newTable(L.cwidth, L.cheight, -1);

		// offsets of 32 points around the ball (plain arrays : this loop runs ~500 000 times per room)
		const AX = [];
		const AY = [];
		for (let n = 0; n < 32; n++) {
			const a = n * 2 * 3.14159 / 32;
			AX.push(Math.cos(a) * bray);
			AY.push(Math.sin(a) * bray);
		}

		for (let y = cb; y <= L.cheight - 1 - cb; y++) {
			for (let x = cb; x <= L.cwidth - 1 - cb; x++) {
				const sx = (x + 0.5) * delta;
				const sy = (y + 0.5) * delta;
				let acc = 0;
				for (let n = 0; n < 32; n++) {
					const c = ctbl[Math.trunc((sx + AX[n]) / delta)][Math.trunc((sy + AY[n]) / delta)];
					if (c === CNONE || c === CREDBLUE)
						continue;
					if (c === CHOLE) {
						acc |= HOLE_MASK;
						continue;
					}
					if (c === CBLOCK) {
						acc |= BLOCK_MASK;
						continue;
					}
					acc = -1;
					break;
				}
				m[x][y] = acc;
			}
		}

		// Flood fill. The OCaml version is recursive (too deep for JavaScript) :
		// this explicit stack visits the cells in exactly the same order, which
		// matters because the flags accumulate along the way.
		const get = (x, y) => (m[x] === undefined || m[x][y] === undefined) ? -1 : m[x][y];
		const NX = [-1, 1, 0, 0];
		const NY = [0, 0, -1, 1];
		const stack = [];

		function enter(x, y, acc) {
			const b = get(x, y);
			acc = acc | (b & (HOLE_MASK | BLOCK_MASK));
			m[x][y] = (b === -1) ? 1 : ((b + 1) | acc);
			stack.push({ x: x, y: y, acc: acc, next: 0 });
		}

		enter(spos.x, spos.y, 0);
		while (stack.length) {
			const f = stack[stack.length - 1];
			if (f.next === 4) {
				stack.pop();
				continue;
			}
			const k = f.next++;
			const nx = f.x + NX[k];
			const ny = f.y + NY[k];
			if ((get(nx, ny) & BIT_MASK) === 0)
				enter(nx, ny, f.acc);
		}
		return m;
	}

	/** Mask of the flags that are allowed when the room holds the ball `obj`. */
	const calcMask = obj => 0xFFFFFF - ((obj === null || obj === undefined) ? 0 : (obj === Obj.GREEN) ? BLOCK_MASK : HOLE_MASK);

	// ----- doors -----

	/**
	 * Opens the border at the doors, fills the doors needing a ball with a line
	 * of blocks / holes, and returns the entrance position (spos).
	 */
	function fillDoors(r, ctbl) {
		let spos = null;
		const blist = [];

		function fillDoor(path, sx, sy, dx, dy, dpx, dpy) {
			if (isClosed(path))
				return;
			for (let x = 0; x < dx; x++)
				for (let y = 0; y < dy; y++)
					ctbl[x + sx][y + sy] = CNONE;
			if (path.t === "open" || path.t === "invisible")
				spos = { x: sx + dpx, y: sy + dpy };
		}

		const wallXmax = WALL_W - 1;
		const wallYmax = WALL_H - 1;

		function fillBlock(path, sx, sy, ex, ey) {
			if (path.t !== "need")
				return;
			const c = collideForObject(path.o);
			const b = bumperForObject(path.o);
			for (let x = sx; x <= ex; x++) {
				for (let y = sy; y <= ey; y++) {
					const px = L.cborder + x * 10;
					const py = L.cborder + y * 10;
					blist.unshift([b, { x: px, y: py }]);
					for (let i = 0; i < 10; i++)
						for (let j = 0; j < 10; j++)
							ctbl[px + i][py + j] = c;
				}
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

		// (an assert in the OCaml code)
		if (spos === null)
			throw new Retry("no entrance");
		return { spos: spos, blist: blist };
	}

	/** Every exit must be reachable (with the ball of the room, and the ball of the door). */
	function checkDoors(r, mtbl, obj) {
		const roomMask = calcMask(obj);

		function checkDoor(path, sx, sy, dx, dy) {
			if (isClosed(path))
				return;
			const mask = (path.t === "need") ? (roomMask & calcMask(path.o)) : roomMask;
			for (let x = 0; x < dx; x++)
				for (let y = 0; y < dy; y++)
					if ((mtbl[x + sx][y + sy] & mask) !== 1)
						throw new Retry("check door");
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

	// ----- pastilles -----

	function checkRed(p, mtbl, obj) {
		const mask = calcMask(obj);
		for (let x = 0; x < L.red_cwidth; x++)
			for (let y = 0; y < L.red_cheight; y++)
				if ((mtbl[p.x + x][p.y + y] & mask) !== 1)
					throw new Retry("check red");
	}

	function putRedBlue(mtbl, ctbl, obj) {
		for (let n = 100; n > 0; n--) {
			// (a failure of genPos itself is not retried here, like in the OCaml code)
			const p = genPos(ctbl, L.red_ctbl, "redblue");
			try {
				checkRed(p, mtbl, obj);
				fillPos(ctbl, L.red_ctbl, p, CREDBLUE);
				return p;
			} catch (e) {
				if (!(e instanceof Retry))
					throw e;
			}
		}
		throw new Retry("put redblue");
	}

	function genRedBlues(mtbl, ctbl, obj, n, btype) {
		const list = [];
		for (; n > 0; n--)
			list.push([btype, putRedBlue(mtbl, ctbl, obj)]);
		return list;
	}

	// ----- walls -----

	/**
	 * Up to two lines of walls (or holes) crossing the room, with a gap of
	 * `gap` cells, placed so that they don't cut the room between its doors.
	 */
	function genSeparators(r, ctbl, btype, gap) {
		const xdoor = (WALL_W / 2 | 0) - 1;
		const xdoor2 = (WALL_W / 2 | 0) + 1;
		const ydoor = (WALL_H / 2 | 0) - 1;
		const ydoor2 = (WALL_H / 2 | 0) + 1;
		const half = gap / 2 | 0;
		const half2 = (gap - 1) / 2 | 0;
		const open = p => !isClosed(p);
		const blist = [];

		function separator(horiz, tries) {
			for (; tries > 0; tries--) {
				const yp = random2(1 + half, WALL_H - 2 - half2);
				const xp = random2(1 + half, WALL_W - 2 - half2);

				// don't block a door, and keep a door on each side
				if (!horiz && xp >= xdoor && xp <= xdoor2 && (open(r.rup) || open(r.rdown)))
					continue;
				if (horiz && yp >= ydoor && yp <= ydoor2 && (open(r.rleft) || open(r.rright)))
					continue;
				if (!horiz && !((xp >= xdoor2 && open(r.rright)) || (xp <= xdoor && open(r.rleft))))
					continue;
				if (horiz && !((yp >= ydoor2 && open(r.rdown)) || (yp <= ydoor && open(r.rup))))
					continue;

				if (horiz) {
					for (let x = 0; x < WALL_W; x++)
						if (x < xp - half || x > xp + half2)
							fillWall(blist, x, yp, ctbl, CBORDER, btype);
				} else {
					for (let y = 0; y < WALL_H; y++)
						if (y < yp - half || y > yp + half2)
							fillWall(blist, xp, y, ctbl, CBORDER, btype);
				}
				return;
			}
		}

		const horiz = rbool();
		separator(horiz, 2);
		if (blist.length)
			separator(!horiz, 2);
		return blist;
	}

	/** A rectangle of blocks (or holes) around a red pastille : the room needs the green (blue) ball. */
	function genObjectNeed(ctbl, obj) {
		const blist = [];
		const c = collideForObject(obj);
		const b = bumperForObject(obj);
		const xmax = WALL_W - 1;
		const ymax = WALL_H - 1;
		const xsize = random2(obj === Obj.BLUE ? 4 : 3, xmax - 2) - 1;
		const ysize = random2(obj === Obj.BLUE ? 4 : 3, ymax - 2) - 1;
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
		return [[B.RED, p]].concat(blist);
	}

	function genExit(ctbl, exit) {
		for (let x = 0; x < 10; x++)
			for (let y = 0; y < 10; y++)
				if (ctbl[exit.x + x][exit.y + y] !== CNONE)
					throw new Error("cannot put exit");
		fillPos(ctbl, CLASSIC_EXIT_TBL, exit, CHOLE);
	}

	// ----- rooms -----

	/** Is the ball `obj` owned on every way leading to this room ? */
	function objectNeeded(ctx, obj) {
		const list = ctx.dungeon.dist_table[ctx.pos.x][ctx.pos.y];
		return list.every(e => e[1].indexOf(obj) >= 0);
	}

	/**
	 * A normal room. `lvl` (0..~20) is the difficulty : it gives more bumpers,
	 * more dangerous ones and more red pastilles. `obj` is the ball needed
	 * inside the room (green / blue), or null.
	 */
	function genNormalRoom(ctx, r, lvl, obj) {
		const classic = ctx.classic;

		const minBumpers = ((lvl * 1 / 3) | 0) + 5;
		const maxBumpers = lvl + 7;
		const nbumpers = Math.min(random2(minBumpers, maxBumpers), 30);

		let availableBtime = MAX_BUMPER_TIME;
		let availableMagnet = (objectNeeded(ctx, Obj.METAL) && rnd(2) === 0)
			? Math.min(random2(0, 4), random2(0, 4))
			: Math.min(random2(0, 1), random2(0, 1));
		let availableShadow = (objectNeeded(ctx, Obj.VIOLET) && rnd(3) === 0)
			? Math.min(random2(0, 2), random2(0, 2))
			: 0;

		const ctbl = newColTable();
		let spos, blist;

		if (!classic) {
			const doors = fillDoors(r, ctbl);
			spos = (lvl === 0) ? { x: L.cwidth / 2 | 0, y: L.cheight / 2 | 0 } : doors.spos;
			blist = doors.blist;
		} else {
			if (random2(0, 5) !== 0) {
				availableMagnet = 0;
				availableShadow = 0;
			}
			spos = { x: classic.enter.x + 5, y: classic.enter.y + 5 };
			blist = [];
			genExit(ctbl, classic.exit);
			blist.unshift([B.CLASSIC_EXIT, classic.exit]);
		}

		if (obj !== null && obj !== undefined)
			blist = blist.concat(genObjectNeed(ctbl, obj));

		if (!classic)
			blist = blist.concat(genSeparators(r, ctbl, rnd(3) === 0 ? B.HOLE : B.WALL, Math.max(5 - (lvl / 4 | 0), 1)));

		// choose the bumpers
		const bumpers = [];
		for (let i = 0; i < nbumpers; i++) {
			if (rnd(100) < ((lvl * 100 / 40) | 0)) {
				if (availableMagnet > 0) {
					availableMagnet--;
					bumpers.push([B.MAGNET, L.bumpers[3]]);
				} else if (availableShadow > 0) {
					availableShadow--;
					bumpers.push([B.SHADOW, L.bumpers[4]]);
				} else if (availableBtime > 0 && rnd(5) !== 0) {
					availableBtime--;
					bumpers.push([B.TIME, L.bumpers[1]]);
				} else {
					bumpers.push([B.DEATH, L.bumpers[2]]);
				}
			} else {
				bumpers.push([B.NORMAL, L.bumpers[0]]);
			}
		}

		// place them (magnets and death bumpers away from the doors)
		for (const [btype, btbl] of bumpers) {
			let pos;
			while (true) {
				pos = genPos(ctbl, btbl, "bumper");
				const nearBorder = pos.x < 15 || pos.y < 15 || pos.x > L.cwidth - 15 || pos.y > L.cheight - 15;
				if ((btype === B.MAGNET || btype === B.DEATH) && nearBorder)
					continue;
				break;
			}
			fillPos(ctbl, btbl, pos, CBUMPER);
			blist.unshift([btype, pos]);
		}

		// pastilles
		const mtbl = computeRoomTbl(ctbl, spos);
		let nblues, nreds;
		if (!classic) {
			nblues = Math.min(random2(0, 4), random2(0, 4)) - 1;
			nreds = Math.min(random2((lvl / 3 | 0) + 1, (lvl * 2 / 3 | 0) + 1), 10);
		} else {
			nblues = Math.min(random2(0, 3), random2(0, 3)) - 1;
			nreds = Math.min(random2(lvl * 2 / 3 | 0, lvl), 10);
		}

		for (const [t, p] of blist)
			if (t === B.RED)
				checkRed(p, mtbl, obj);
		checkDoors(r, mtbl, obj);

		return blist
			.concat(genRedBlues(mtbl, ctbl, obj, nreds, B.RED))
			.concat(genRedBlues(mtbl, ctbl, obj, nblues, B.BLUE));
	}

	/** A room full of magnets (needs the metal ball) or invisible bumpers (needs the violet one). */
	function genSpecialRoom(r, obj) {
		const ctbl = newColTable();
		const btype = (obj === Obj.METAL) ? B.MAGNET : B.SHADOW;
		const btbl = (obj === Obj.METAL) ? L.bumpers[3] : L.bumpers[4];

		const doors = fillDoors(r, ctbl);
		let blist = doors.blist.concat(genSeparators(r, ctbl, B.HOLE, 3));

		for (let i = 1; i <= 20; i++) {
			const pos = genPos(ctbl, btbl, "spe-bumper");
			fillPos(ctbl, btbl, pos, CBUMPER);
			blist.unshift([btype, pos]);
		}

		const ndeaths = random2(2, 5);
		for (let i = 1; i <= ndeaths; i++) {
			const pos = genPos(ctbl, L.bumpers[2], "death");
			fillPos(ctbl, L.bumpers[2], pos, CBUMPER);
			blist.unshift([B.DEATH, pos]);
		}

		const nreds = random2(4, 10);
		const mtbl = computeRoomTbl(ctbl, doors.spos);
		for (const [t, p] of blist)
			if (t === B.RED)
				checkRed(p, mtbl, null);
		checkDoors(r, mtbl, null);
		return blist.concat(genRedBlues(mtbl, ctbl, null, nreds, B.RED));
	}

	function genRoomOnce(ctx, r, lvl) {
		const rt = r.rtype;
		if (rt === null)
			return null;

		switch (rt.k) {
		case "end":
		case "objfound":
		case "bonus":
			return null;
		case "start":
		case "normal":
			return genNormalRoom(ctx, r, lvl, null);
		case "objneed":
			if (rt.o === Obj.GREEN || rt.o === Obj.BLUE)
				return genNormalRoom(ctx, r, lvl, rt.o);
			if (rt.o === Obj.VIOLET && rnd(4) !== 0)
				return genSpecialRoom(r, rt.o);
			if (rt.o === Obj.METAL && rnd(3) !== 0)
				return genSpecialRoom(r, rt.o);
			return genNormalRoom(ctx, r, lvl, null);
		}
		return null;
	}

	Gen.Rooms = {

		/**
		 * Content of a room of the map (1000 tries).
		 *   ctx = { dungeon, pos, classic }  where classic is null, or
		 *         { enter, exit } (cell positions of the entrance / exit hatch)
		 *   r   = the room of the map, lvl = its difficulty
		 */
		generate(ctx, r, lvl) {
			return Gen.retry(1000, () => genRoomOnce(ctx, r, lvl));
		},

		/** A random position for the hatch of a classic room. */
		randomExit() {
			return {
				x: L.cborder + random2(0, WALL_W - 1) * 10,
				y: L.cborder + random2(0, WALL_H - 1) * 10
			};
		}
	};

})();
