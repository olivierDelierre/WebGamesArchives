/**
 * The map of the dungeon, shown in the pause, as in Pause.as : the "carte"
 * symbol, and a "room" symbol per thing to show (its frames : the rooms,
 * the passages, the rocks, the radar icons).
 *
 *   with the map item    the known rooms, and the passages between them
 *   with the radar       where the start, the boss, the balls and the bonuses are
 *   without either       only the current room
 */

import { RoomType, Exit } from "../data/enums.js";
import { clip } from "../gfx/xfl/index.js";

/** The frames of "room" (as in the original, from 1). */
const CURRENT = 34;
const VISITED = 33;
const ROCKS = 14;          // + 0..3
const START = 26;
const BOSS = 31;
const OBJECT_FRAMES = [19, 22, 23, 24];
const BONUS_FRAMES = [21, 20, 28, 0, 27, 29, 30];

/** Is exit `dir` of a room a visible passage ? */
function passage(room, dir) {
	if (!room)
		return false;
	const t = room.exits[dir].type;
	return t !== Exit.WALL && t !== Exit.HIDDEN;
}

let carte = null;
const frames = new Map();

/** A still "room" symbol at a frame (shared). */
function roomArt(frame) {
	if (!frames.has(frame)) {
		const c = clip("room");
		c.gotoAndStop(frame - 1);
		frames.set(frame, c);
	}
	return frames.get(frame);
}

/** Draws the map at its place in the pause (the original : at 95, 55). */
export function drawMap(ctx, game) {
	const d = game.dungeon;
	const inv = game.inventory;
	const cur = game.room;
	const under = [];      // (original : the rocks and the icons go under the rooms)
	const over = [];
	const add = (px, py, frame) => {
		if (frame)
			(frame > 14 ? under : over).push([px, py, frame]);
	};

	for (let x = 0; x < Math.min(8, d.width); x++) {
		for (let y = 0; y < Math.min(8, d.height); y++) {
			const room = d.room(x, y);
			const px = 18 + 48 * x;
			const py = 16 + 36 * y;
			const isCurrent = (rx, ry) => rx === cur.rx && ry === cur.ry;

			if (room) {
				let t = 0;
				if (isCurrent(x, y)) {
					add(px, py, CURRENT);
					t = 8;
				} else if (room.visited && inv.map) {
					add(px, py, VISITED);
					t = 4;
				}
				// the passages toward the left and upper rooms, coloured like the brighter room
				if (inv.map) {
					const link = (other, ox, oy, frame) => {
						if (!other)
							return;
						let k = t;
						if (isCurrent(ox, oy))
							k = 8;
						else if (k !== 8 && other.visited)
							k = 4;
						add(px, py, frame + k);
					};
					if (x > 0 && passage(room, 0) && passage(d.room(x - 1, y), 1))
						link(d.room(x - 1, y), x - 1, y, 1);
					if (y > 0 && passage(room, 2) && passage(d.room(x, y - 1), 3))
						link(d.room(x, y - 1), x, y - 1, 2);
				}
			}

			if (!room) {
				if (inv.map)
					add(px, py, ROCKS + (x * 7 + y * 3) % 4);
				continue;
			}
			if (!inv.radar)
				continue;
			switch (room.type) {
			case RoomType.BOSS:
				add(px, py, BOSS);
				break;
			case RoomType.BALL:
				if (!room.taken)
					add(px, py, OBJECT_FRAMES[room.content]);
				break;
			case RoomType.BONUS:
				if (!room.taken)
					add(px, py, BONUS_FRAMES[room.content]);
				break;
			default:
				if (x === d.start.x && y === d.start.y)
					add(px, py, START);
			}
		}
	}

	ctx.save();
	ctx.translate(95, 55);
	(carte || (carte = clip("carte"))).draw(ctx);
	for (const [px, py, frame] of under.concat(over)) {
		ctx.save();
		ctx.translate(px, py);
		roomArt(frame).draw(ctx);
		ctx.restore();
	}
	ctx.restore();
}
