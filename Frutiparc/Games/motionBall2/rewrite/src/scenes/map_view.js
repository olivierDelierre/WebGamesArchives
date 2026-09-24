/**
 * The map of the dungeon, shown in the pause.
 *
 *   with the map item    the known rooms, and the passages between them
 *   with the radar       where the start, the boss, the balls and the bonuses are
 *   without either       only the current room
 */

import { RoomType, Exit, DungeonBonus, BallType } from "../data/enums.js";
import { ballSphere, circle, image, roundRect, text } from "../gfx/draw.js";
import { drawItemIcon, Icon } from "../gfx/icons.js";

const MAP_W = 440;
const MAP_H = 360;
const GRID_X = 18;
const GRID_Y = 40;
const CELL_W = 48;
const CELL_H = 36;

const BALL_OF_OBJECT = [BallType.GREEN, BallType.BLUE, BallType.METAL, BallType.VIOLET];
const BONUS_ICONS = {
	[DungeonBonus.MAP]: [Icon.MAP, 0.7],
	[DungeonBonus.KEY]: [Icon.KEY, 0.8],
	[DungeonBonus.SMALL_TIME]: [Icon.SMALL_TIME, 0.8],
	[DungeonBonus.BIG_TIME]: [Icon.BIG_TIME, 0.7]
};

/** Is exit `dir` of a room a visible passage ? */
function passage(room, dir) {
	if (!room)
		return false;
	const t = room.exits[dir].type;
	return t !== Exit.WALL && t !== Exit.HIDDEN;
}

/** Draws the map with its top-left corner at (x, y). `time` animates the current room. */
export function drawMap(ctx, game, x, y, time) {
	const d = game.dungeon;
	const inv = game.inventory;
	const cur = game.room;

	ctx.save();
	ctx.translate(x, y);
	image(ctx, "map", MAP_W, MAP_H, 0, 0);

	const cols = Math.min(8, d.width);
	const rows = Math.min(8, d.height);
	for (let rx = 0; rx < cols; rx++) {
		for (let ry = 0; ry < rows; ry++) {
			const room = d.room(rx, ry);
			const cx = GRID_X + CELL_W * rx + CELL_W / 2;
			const cy = GRID_Y + CELL_H * ry + CELL_H / 2;

			if (!room) {
				if (inv.map) {
					// rocks in the empty places
					const k = (rx * 7 + ry * 3) % 4;
					ctx.fillStyle = "rgba(160,100,0,0.25)";
					circle(ctx, cx - 8 + k * 4, cy - 4 + (k % 2) * 6, 4 + k);
					ctx.fill();
				}
				continue;
			}

			const current = rx === cur.rx && ry === cur.ry;
			const known = current || (room.visited && inv.map);
			if (known) {
				ctx.fillStyle = current ? "#ff6a2a" : "#e0a020";
				roundRect(ctx, cx - 16, cy - 11, 32, 22, 6);
				ctx.fill();
				ctx.strokeStyle = current ? "#a02a00" : "#a06a00";
				ctx.lineWidth = 1.5;
				ctx.stroke();
			} else if (inv.map) {
				ctx.strokeStyle = "rgba(160,100,0,0.6)";
				ctx.lineWidth = 1.5;
				roundRect(ctx, cx - 16, cy - 11, 32, 22, 6);
				ctx.stroke();
			}

			// passages toward the left and upper rooms (the others are drawn by those rooms)
			if (inv.map) {
				ctx.strokeStyle = "#a06a00";
				ctx.lineWidth = 5;
				ctx.lineCap = "round";
				if (rx > 0 && passage(room, 0) && passage(d.room(rx - 1, ry), 1)) {
					ctx.beginPath();
					ctx.moveTo(cx - 17, cy);
					ctx.lineTo(cx - 31, cy);
					ctx.stroke();
				}
				if (ry > 0 && passage(room, 2) && passage(d.room(rx, ry - 1), 3)) {
					ctx.beginPath();
					ctx.moveTo(cx, cy - 12);
					ctx.lineTo(cx, cy - 24);
					ctx.stroke();
				}
			}

			if (inv.radar)
				drawRadarIcon(ctx, d, room, rx, ry, cx, cy);

			if (current) {
				ctx.strokeStyle = "rgba(255,255,255," + (0.5 + 0.5 * Math.sin(time * 6)) + ")";
				ctx.lineWidth = 2;
				roundRect(ctx, cx - 18, cy - 13, 36, 26, 7);
				ctx.stroke();
			}
		}
	}
	ctx.restore();
}

/** What the radar shows in a room. */
function drawRadarIcon(ctx, d, room, rx, ry, cx, cy) {
	switch (room.type) {
	case RoomType.BOSS:
		text(ctx, "☠", cx, cy, { size: 18, color: "#fff", outline: "#5a0a0a" });
		return;
	case RoomType.BALL:
		ballSphere(ctx, cx, cy, 7, BALL_OF_OBJECT[room.content]);
		return;
	case RoomType.BONUS:
		if (room.content === DungeonBonus.ORANGE || room.content === DungeonBonus.RED) {
			ballSphere(ctx, cx, cy, 7, room.content === DungeonBonus.ORANGE ? BallType.ORANGE : BallType.RED);
		} else if (!room.taken && BONUS_ICONS[room.content]) {
			const [icon, scale] = BONUS_ICONS[room.content];
			ctx.save();
			ctx.translate(cx, cy);
			drawItemIcon(ctx, icon, scale);
			ctx.restore();
		}
		return;
	default:
		if (rx === d.start.x && ry === d.start.y)
			text(ctx, "D", cx, cy, { size: 14, color: "#fff", outline: "#205a10" });
	}
}

export const MAP_SIZE = { w: MAP_W, h: MAP_H };
