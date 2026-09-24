/**
 * The dungeon model, and the reader of the hand-made dungeons.
 *
 *   Dungeon {
 *     width, height        size, in rooms
 *     start: { x, y }      the first room
 *     rooms[x][y]          a RoomData, or null
 *     ensure(x)            makes sure the column x exists (Classique mode
 *                          generates its rooms on demand ; a no-op elsewhere)
 *   }
 *
 *   RoomData {
 *     type                 RoomType
 *     content              DungeonBall / DungeonBonus, for the BALL / BONUS rooms
 *     exits[4]             { type: Exit, needs: DungeonBall }, left, right, up, down
 *     items[]              { type: Item, x, y }, x / y = the top-left cell (4 px grid)
 *     visited
 *   }
 *
 * A game modifies its dungeon (opened doors, destroyed blocks, collected
 * pastilles) : each game gets a new one.
 */

import { BitReader } from "./bitcodec.js";
import { RoomType, Exit, DungeonBall, DungeonBonus, OPPOSITE, DIR_DX, DIR_DY } from "./enums.js";
import LEVEL_FILES from "./levels.generated.js";

const POS_BITS = 8;

export function makeRoom(type, content, exits, items) {
	return {
		type,
		content,
		exits: exits.map(e => typeof e === "object" ? e : { type: e, needs: undefined }),
		items: items || [],
		visited: false
	};
}

export class Dungeon {

	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.start = { x: 0, y: 0 };
		this.rooms = [];
		for (let x = 0; x < width; x++)
			this.rooms.push(new Array(height).fill(null));
	}

	room(x, y) {
		return (this.rooms[x] && this.rooms[x][y]) || null;
	}

	ensure() { }

	/** Every existing room. */
	*allRooms() {
		for (let x = 0; x < this.width; x++)
			for (let y = 0; y < this.height; y++)
				if (this.rooms[x][y])
					yield { x, y, room: this.rooms[x][y] };
	}
}

/**
 * Decodes a room made with the level editor (the DATA= lines) :
 *   4 x 2 bits   exits (0 wall, 1 door, 2 hidden, 3 one-way)
 *   1 bit        unused
 *   then items : 4 bits type (0 ends the list), 8 bits x, 8 bits y
 */
export function decodeEditorRoom(text) {
	const EDITOR_EXITS = [Exit.WALL, Exit.DOOR, Exit.HIDDEN, Exit.SPECIAL];
	const r = new BitReader(text);

	const exits = [];
	for (let i = 0; i < 4; i++)
		exits.push(EDITOR_EXITS[r.read(2)]);
	r.read(1);

	const items = [];
	for (;;) {
		const type = r.read(4);
		if (type === 0 || r.ended)
			break;
		const x = r.read(POS_BITS);
		const y = r.read(POS_BITS);
		items.push({ type, x, y });
	}
	return { exits, items };
}

const ITEM_ROOMS = {
	KEY: [RoomType.BONUS, DungeonBonus.KEY],
	ORANGE: [RoomType.BONUS, DungeonBonus.ORANGE],
	RED: [RoomType.BONUS, DungeonBonus.RED],
	MAP: [RoomType.BONUS, DungeonBonus.MAP],
	RADAR: [RoomType.BONUS, DungeonBonus.RADAR],
	BIGTIME: [RoomType.BONUS, DungeonBonus.BIG_TIME],
	SMALLTIME: [RoomType.BONUS, DungeonBonus.SMALL_TIME],
	BLUE: [RoomType.BALL, DungeonBall.BLUE],
	METAL: [RoomType.BALL, DungeonBall.METAL],
	VIOLET: [RoomType.BALL, DungeonBall.VIOLET],
	GREEN: [RoomType.BALL, DungeonBall.GREEN]
};

/**
 * Builds a hand-made dungeon ("tuto", "adv_1".."adv_5", "course_1".."course_7").
 *
 * The file is 64 lines, the 8 x 8 rooms row by row :
 *   NONE | DATA=<room> | START=<room> | ITEM=<name> | END (the boss room)
 * The item and boss rooms have no exits of their own : they get a door
 * wherever the neighbouring room has an exit facing them.
 */
export function loadDungeon(name) {
	const lines = LEVEL_FILES[name];
	if (!lines)
		throw new Error("unknown dungeon " + name);

	const W = 8;
	const H = 8;
	const parsed = [];
	for (let x = 0; x < W; x++)
		parsed.push([]);
	let start = null;

	lines.forEach((line, i) => {
		const x = i % W;
		const y = Math.floor(i / W);
		const [kind, value] = line.split("=");
		switch (kind) {
		case "NONE":
			parsed[x][y] = null;
			break;
		case "START":
			start = { x, y };
			parsed[x][y] = { kind: "editor", ...decodeEditorRoom(value) };
			break;
		case "DATA":
			parsed[x][y] = { kind: "editor", ...decodeEditorRoom(value) };
			break;
		case "ITEM":
			if (!ITEM_ROOMS[value])
				throw new Error(name + " : unknown item " + value);
			parsed[x][y] = { kind: "item", type: ITEM_ROOMS[value][0], content: ITEM_ROOMS[value][1] };
			break;
		case "END":
			parsed[x][y] = { kind: "item", type: RoomType.BOSS };
			break;
		default:
			throw new Error(name + " : unknown room " + kind);
		}
	});
	if (!start)
		throw new Error(name + " : no start");

	// the exit of an item room toward (x, y) + direction d
	const neighbourExit = (x, y, d) => {
		const n = parsed[x + DIR_DX[d]] && parsed[x + DIR_DX[d]][y + DIR_DY[d]];
		if (!n || n.kind !== "editor")
			return Exit.WALL;
		return n.exits[OPPOSITE[d]] === Exit.WALL ? Exit.WALL : Exit.DOOR;
	};

	const dungeon = new Dungeon(W, H);
	dungeon.start = start;
	for (let x = 0; x < W; x++) {
		for (let y = 0; y < H; y++) {
			const p = parsed[x][y];
			if (!p)
				continue;
			if (p.kind === "editor") {
				// the one-way doors of the hand-made dungeons are stored as "needs the green ball"
				const exits = p.exits.map(e => ({ type: e, needs: e === Exit.SPECIAL ? DungeonBall.GREEN : undefined }));
				dungeon.rooms[x][y] = makeRoom(RoomType.NORMAL, undefined, exits, p.items);
			} else {
				const exits = [0, 1, 2, 3].map(d => neighbourExit(x, y, d));
				dungeon.rooms[x][y] = makeRoom(p.type, p.content, exits);
			}
		}
	}
	return dungeon;
}
