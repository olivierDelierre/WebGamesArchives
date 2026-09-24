/*
 * The pause, and the map of the dungeon (once the map or the radar is found).
 * Port of mb2/Pause.as.
 *
 *   map    shows the known rooms (visited ones) and the passages between them
 *   radar  shows where the start, the exit, the balls and the bonuses are
 */
"use strict";

(function () {

	const G = MB2.G;
	const Room = MB2.Room;
	const Bonus = MB2.DungeonBonus;

	/** Ball colour of each MB2.DungeonObject. */
	const OBJECT_BALLS = [MB2.BallType.GREEN, MB2.BallType.BLUE, MB2.BallType.METAL, MB2.BallType.VIOLET];

	// the map bitmap and its grid (8 x 8 cells of 48 x 36 pixels)
	const MAP_X = 95;
	const MAP_Y = 45;
	const GRID_X = 18;
	const GRID_Y = 40;
	const CELL_W = 48;
	const CELL_H = 36;

	MB2.Pause = class {

		constructor(game) {
			this.game = game;
			this.show_map = game.options.has_map || game.options.has_radar;
			this.t = 0;
			// random decoration of the empty cells of the map
			this.rocks = [];
			for (let i = 0; i < 64; i++)
				this.rocks.push(random(4));
		}

		endPause() {
			const game = this.game;
			if (game.boss_update && game.boss_update.onPause)
				game.boss_update.onPause(false);
			game.pause = null;
		}

		destroy() {
			this.game.pause = null;
		}

		/** Escape (or P) ends the pause. */
		main() {
			const game = this.game;
			this.t++;
			if (MB2.Key.isDown(MB2.Key.ESCAPE)) {
				if (!game.pause_key_flag) {
					game.pause_key_flag = true;
					this.endPause();
				}
			} else
				game.pause_key_flag = false;
		}

		onMouseDown() {
			if (this.t > 10)
				this.endPause();
		}

		/** Can the ball go through exit n of room (x, y) ? (walls and invisible exits are not shown) */
		path_open(x, y, n) {
			const room = this.game.level.dungeon[x] && this.game.level.dungeon[x][y];
			if (!room || !room.paths)
				return false;
			const p = room.paths[n].ptype;
			return p !== MB2.Path.WALL && p !== MB2.Path.INVISIBLE;
		}

		draw(ctx) {
			// the game is darkened (a colour transform in the original)
			ctx.fillStyle = "rgba(30,0,40,0.5)";
			ctx.fillRect(0, 0, MB2.Const.LVL_WIDTH, MB2.Const.LVL_HEIGHT);

			if (this.show_map) {
				this.drawMap(ctx);
				G.text(ctx, "PAUSE", 305, 22, 22, "#ffffff", "#4a1470");
			} else {
				G.text(ctx, "PAUSE", 305, 190, 56, "#ffffff", "#4a1470");
				G.text(ctx, "Echap ou P pour reprendre", 305, 240, 16, "#ffffff");
			}
		}

		drawMap(ctx) {
			const level = this.game.level;
			const opt = this.game.options;

			ctx.save();
			ctx.translate(MAP_X, MAP_Y);
			G.img(ctx, "map", 440, 360, 0, 0);

			const W = Math.min(8, level.width);
			const H = Math.min(8, level.height);
			for (let x = 0; x < W; x++) {
				for (let y = 0; y < H; y++) {
					const room = level.dungeon[x][y];
					const cx = GRID_X + CELL_W * x + CELL_W / 2;
					const cy = GRID_Y + CELL_H * y + CELL_H / 2;

					if (room.rtype === Room.NONE) {
						if (opt.has_map)
							this.drawRock(ctx, cx, cy, this.rocks[x * 8 + y]);
						continue;
					}

					const current = x === level.pos_x && y === level.pos_y;
					this.drawRoom(ctx, cx, cy, current, current || (room.visited && opt.has_map), opt.has_map);
					if (opt.has_map)
						this.drawPassages(ctx, x, y, cx, cy);
					if (opt.has_radar)
						this.drawRadarIcon(ctx, room, x, y, cx, cy);

					if (current) {
						const blink = 0.5 + 0.5 * Math.sin(this.t / 6);
						ctx.strokeStyle = "rgba(255,255,255," + blink + ")";
						ctx.lineWidth = 2;
						G.rrect(ctx, cx - 18, cy - 13, 36, 26, 7);
						ctx.stroke();
					}
				}
			}
			ctx.restore();
		}

		drawRock(ctx, cx, cy, k) {
			ctx.fillStyle = "rgba(160,100,0,0.25)";
			G.circle(ctx, cx - 8 + k * 4, cy - 4 + (k % 2) * 6, 4 + k);
			ctx.fill();
		}

		drawRoom(ctx, cx, cy, current, known, hasMap) {
			if (known) {
				ctx.fillStyle = current ? "#ff6a2a" : "#e0a020";
				G.rrect(ctx, cx - 16, cy - 11, 32, 22, 6);
				ctx.fill();
				ctx.strokeStyle = current ? "#a02a00" : "#a06a00";
				ctx.lineWidth = 1.5;
				ctx.stroke();
			} else if (hasMap) {
				ctx.strokeStyle = "rgba(160,100,0,0.6)";
				ctx.lineWidth = 1.5;
				G.rrect(ctx, cx - 16, cy - 11, 32, 22, 6);
				ctx.stroke();
			}
		}

		/** Passages to the left and upper rooms (the others are drawn by those rooms). */
		drawPassages(ctx, x, y, cx, cy) {
			ctx.strokeStyle = "#a06a00";
			ctx.lineWidth = 5;
			ctx.lineCap = "round";
			if (x > 0 && this.path_open(x, y, 0) && this.path_open(x - 1, y, 1)) {
				ctx.beginPath();
				ctx.moveTo(cx - 17, cy);
				ctx.lineTo(cx - 31, cy);
				ctx.stroke();
			}
			if (y > 0 && this.path_open(x, y, 2) && this.path_open(x, y - 1, 3)) {
				ctx.beginPath();
				ctx.moveTo(cx, cy - 12);
				ctx.lineTo(cx, cy - 24);
				ctx.stroke();
			}
		}

		/** What the radar reveals. rdata = -1 once the item is taken. */
		drawRadarIcon(ctx, room, x, y, cx, cy) {
			const level = this.game.level;
			switch (room.rtype) {
			case Room.NORMAL:
			case Room.OBJECT_NEEDED:
				if (x === level.start_x && y === level.start_y)
					G.text(ctx, "D", cx, cy, 14, "#fff", "#205a10");
				break;

			case Room.END:
				G.text(ctx, "☠", cx, cy, 18, "#fff", "#5a0a0a");
				break;

			case Room.OBJECT_FOUND:
				if (room.rdata !== -1) {
					const col = MB2.BALL_COLORS[OBJECT_BALLS[room.rdata]];
					if (col)
						G.ball(ctx, cx, cy, 7, col[0], col[1], col[2]);
				}
				break;

			case Room.BONUS:
				if (room.rdata === -1)
					break;
				ctx.save();
				ctx.translate(cx, cy);
				switch (room.rdata) {
				case Bonus.ORANGE:
					G.ball(ctx, 0, 0, 7, MB2.BALL_COLORS[MB2.BallType.ORANGE][0], MB2.BALL_COLORS[MB2.BallType.ORANGE][1]);
					break;
				case Bonus.RED:
					G.ball(ctx, 0, 0, 7, MB2.BALL_COLORS[MB2.BallType.RED][0], MB2.BALL_COLORS[MB2.BallType.RED][1]);
					break;
				case Bonus.MAP:
					MB2.drawItemIcon(ctx, 0, 0.7);
					break;
				case Bonus.KEY:
					MB2.drawItemIcon(ctx, 4, 0.8);
					break;
				case Bonus.SMALL_TIME:
					MB2.drawItemIcon(ctx, 2, 0.8);
					break;
				case Bonus.BIG_TIME:
					MB2.drawItemIcon(ctx, 3, 0.7);
					break;
				// (the radar itself is not shown, like in the original)
				}
				ctx.restore();
				break;
			}
		}
	};

})();
