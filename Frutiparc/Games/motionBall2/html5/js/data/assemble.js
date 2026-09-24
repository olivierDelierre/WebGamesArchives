/*
 * Builds a hand-made dungeon (tutorial, adventures, courses) from its text
 * file. Port of mb2gen/assemble.ml.
 *
 * The source files are ../dungeon/*.txt, packed into js/data/levels.js by
 * tools/build_levels.js. Each file has 64 lines (8 x 8 rooms, row by row) :
 *
 *   NONE          no room
 *   DATA=<data>   a room made with the level editor (see LevelFormat.decodeRoomData)
 *   START=<data>  the same, and the dungeon starts here
 *   ITEM=<name>   a room holding an item (KEY, ORANGE, BLUE, METAL, VIOLET,
 *                 GREEN, RED, MAP, RADAR, SMALLTIME, BIGTIME)
 *   END           the boss room
 *
 * Item and end rooms have no exits of their own : an exit is created where
 * the neighbouring editor room has one facing them.
 */
"use strict";

MB2.assembleDungeon = function (lines) {

	const W = 8;
	const H = 8;
	const Path = MB2.Path;
	const Obj = MB2.DungeonObject;
	const Bonus = MB2.DungeonBonus;

	const ITEMS = {
		KEY: ["bonus", Bonus.KEY],
		ORANGE: ["bonus", Bonus.ORANGE],
		RED: ["bonus", Bonus.RED],
		MAP: ["bonus", Bonus.MAP],
		RADAR: ["bonus", Bonus.RADAR],
		BIGTIME: ["bonus", Bonus.BIG_TIME],
		SMALLTIME: ["bonus", Bonus.SMALL_TIME],
		BLUE: ["object", Obj.BLUE],
		METAL: ["object", Obj.METAL],
		VIOLET: ["object", Obj.VIOLET],
		GREEN: ["object", Obj.GREEN]
	};

	// ----- read the lines -----

	const rooms = [];
	for (let x = 0; x < W; x++)
		rooms[x] = [];

	let start = null;

	for (let i = 0; i < W * H; i++) {
		const x = i % W;
		const y = (i / W) | 0;
		const line = lines[i];
		const eq = line.indexOf("=");
		const kind = eq < 0 ? line : line.substr(0, eq);
		const value = eq < 0 ? "" : line.substr(eq + 1);

		let room = null;
		switch (kind) {
		case "NONE":
			break;
		case "START":
			start = { x: x, y: y };
			room = { kind: "data", data: MB2.LevelFormat.decodeRoomData(value) };
			break;
		case "DATA":
			room = { kind: "data", data: MB2.LevelFormat.decodeRoomData(value) };
			break;
		case "ITEM":
			if (!ITEMS[value])
				throw new Error("Invalid item : " + value);
			room = { kind: ITEMS[value][0], value: ITEMS[value][1] };
			break;
		case "END":
			room = { kind: "end" };
			break;
		default:
			throw new Error("Invalid room type : " + kind);
		}
		rooms[x][y] = room;
	}

	if (!start)
		throw new Error("No start !");

	// ----- exits of the item / end rooms -----

	const OPPOSITE = [1, 0, 3, 2];
	const DX = [-1, 1, 0, 0];
	const DY = [0, 0, -1, 1];

	function neighbourPath(x, y, d) {
		const nx = x + DX[d];
		const ny = y + DY[d];
		if (nx < 0 || ny < 0 || nx >= W || ny >= H)
			return Path.WALL;
		const r = rooms[nx][ny];
		if (!r || r.kind !== "data")
			return Path.WALL;
		return r.data.paths[OPPOSITE[d]] === Path.WALL ? Path.WALL : Path.DOOR;
	}

	// ----- build the level -----

	const F = MB2.LevelFormat;
	const dungeon = [];

	for (let x = 0; x < W; x++) {
		dungeon[x] = [];
		for (let y = 0; y < H; y++) {
			const r = rooms[x][y];
			let room;

			if (!r) {
				room = F.newRoom(MB2.Room.NONE);
			} else if (r.kind === "data") {
				room = F.newRoom(MB2.Room.NORMAL, undefined, r.data.paths, r.data.bumpers);
			} else {
				const paths = [0, 1, 2, 3].map(d => neighbourPath(x, y, d));
				if (r.kind === "end")
					room = F.newRoom(MB2.Room.END, undefined, paths);
				else if (r.kind === "object")
					room = F.newRoom(MB2.Room.OBJECT_FOUND, r.value, paths);
				else
					room = F.newRoom(MB2.Room.BONUS, r.value, paths);
			}
			dungeon[x][y] = room;
		}
	}

	return { width: W, height: H, start_x: start.x, start_y: start.y, dungeon: dungeon };
};
