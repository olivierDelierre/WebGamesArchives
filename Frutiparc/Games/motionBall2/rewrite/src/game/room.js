/**
 * A room being played : built from its data (data/dungeon.js RoomData), it
 * holds the entities, the tiles (green blocks and holes), the doors, and
 * draws the whole room.
 *
 * Positions in the data are cells of 4 x 4 pixels, for the top-left corner of
 * the item ; the entities use the centre, in pixels. SIZES gives the size of
 * each item to convert one into the other.
 */

import { WIDTH as W, HEIGHT as H, CELL, TILE, TILE_ORIGIN, TILES_X, TILES_Y } from "../config.js";
import { Item, RoomType, Exit, Mode, DungeonBonus, BallType } from "../data/enums.js";
import { Layer } from "./entity.js";
import { circleTouchesSegment } from "./physics.js";
import { Door, borderColliders, drawBorder } from "./doors.js";
import { Bumper, ClockBumper, DeathBumper, Magnet, GhostBumper } from "./entities/bumpers.js";
import { GreenBlock, SwitchBlock, Switch } from "./entities/blocks.js";
import { Pastille, Hatch, BallPickup, ItemBox, Teleport } from "./entities/pickups.js";
import { Zapper, makeBeams } from "./entities/zappers.js";
import { roundRect } from "../gfx/draw.js";
import { clip, drawClip } from "../gfx/xfl/index.js";
import { Icon } from "../gfx/icons.js";
import { app } from "../app.js";

/** Size of each item, in pixels (the symbols of the original, rounded to even cells). */
const SIZES = {
	[Item.BUMPER]: 48, [Item.CLOCK]: 64, [Item.DEATH]: 40, [Item.MAGNET]: 40,
	[Item.GHOST]: 56, [Item.BLOCK]: 40, [Item.HOLE]: 40, [Item.RED]: 24,
	[Item.BLUE]: 24, [Item.TELEPORT]: 48, [Item.SWITCH]: 32, [Item.PINK_BLOCK]: 40,
	[Item.BLUE_BLOCK]: 40, [Item.ZAPPER]: 32, [Item.HATCH]: 40
};

/** Centre of an item of the data. */
const centreOf = item => ({
	x: item.x * CELL + SIZES[item.type] / 2,
	y: item.y * CELL + SIZES[item.type] / 2
});

/** The ball colour given by each DungeonBall / bonus ball. */
const BALL_OF_OBJECT = [BallType.GREEN, BallType.BLUE, BallType.METAL, BallType.VIOLET];

/**
 * The 14 x 9 grid of tiles : what occupies each 40 x 40 tile (Item.BLOCK,
 * Item.HOLE or null). Used by the holes and to merge the green blocks.
 */
class TileGrid {

	constructor() {
		this.cells = new Array(TILES_X * TILES_Y).fill(null);
	}

	get(tx, ty) {
		if (tx < 0 || ty < 0 || tx >= TILES_X || ty >= TILES_Y)
			return undefined;
		return this.cells[tx + ty * TILES_X];
	}

	set(tx, ty, v) {
		if (tx >= 0 && ty >= 0 && tx < TILES_X && ty < TILES_Y)
			this.cells[tx + ty * TILES_X] = v;
	}

	/** Tile of a pixel position (the top-left corner of a block or a hole). */
	static at(x, y) {
		return { tx: Math.floor((x - TILE_ORIGIN) / TILE), ty: Math.floor((y - TILE_ORIGIN) / TILE) };
	}
}

export class Room {

	/**
	 * @param game
	 * @param rx, ry     position in the dungeon
	 * @param enteredBy  the side the ball comes in by (Dir), or -1
	 */
	constructor(game, rx, ry, enteredBy) {
		this.rx = rx;
		this.ry = ry;
		this.data = game.dungeon.room(rx, ry);
		this.background = "bg0" + (1 + (rx + ry) % 4);
		this.entities = [];
		this.tiles = new TileGrid();
		this.holes = [];            // { tx, ty } of each hole
		this.blocks = [];           // green blocks (merged shapes, shadows)
		this.beams = [];
		this.redsLeft = 0;
		this.hatch = null;
		this.reserved = new Set();  // tiles about to become holes ("tx,ty")
		this.isBossRoom = this.data.type === RoomType.BOSS;
		this.fixedColliders = borderColliders();

		this.data.visited = true;
		this.build(game);
		this.doors = this.makeDoors(game, enteredBy);
		this.updateTiles();
		if (this.redsLeft === 0 && !this.isBossRoom)
			this.openDoors(game, false);
	}

	// ----- building -----

	build(game) {
		const d = this.data;
		switch (d.type) {
		case RoomType.BOSS:
			this.buildBossRoom();
			break;
		case RoomType.BALL:
			this.add(new BallPickup(W / 2, H / 2, BALL_OF_OBJECT[d.content]));
			this.addCornerBumpers(game);
			break;
		case RoomType.BONUS:
			this.buildBonusRoom(game, d.content);
			break;
		default:
			for (const item of d.items)
				this.addItem(game, item);
			this.beams = makeBeams(this.entities.filter(e => e instanceof Zapper));
			this.beams.forEach(b => this.add(b));
		}
	}

	addItem(game, item) {
		if (item.destroyed || item.taken)
			return;
		const { x, y } = centreOf(item);
		const left = item.x * CELL;
		const top = item.y * CELL;

		switch (item.type) {
		case Item.BUMPER: return this.add(new Bumper(x, y));
		case Item.CLOCK: return this.add(new ClockBumper(x, y, game));
		case Item.DEATH: return this.add(new DeathBumper(x, y));
		case Item.MAGNET: return this.add(new Magnet(x, y));
		case Item.GHOST: return this.add(new GhostBumper(x, y));
		case Item.TELEPORT: return this.add(new Teleport(x, y));
		case Item.SWITCH: return this.add(new Switch(x, y));
		case Item.PINK_BLOCK: return this.add(new SwitchBlock(left, top, true));
		case Item.BLUE_BLOCK: return this.add(new SwitchBlock(left, top, false));
		case Item.ZAPPER: return this.add(new Zapper(x, y, item.x, item.y, game.rules.checkpoints));

		case Item.BLOCK: {
			const block = this.add(new GreenBlock(left, top, item));
			const { tx, ty } = TileGrid.at(left, top);
			this.tiles.set(tx, ty, Item.BLOCK);
			this.blocks.push(block);
			return block;
		}

		case Item.HOLE: {
			const { tx, ty } = TileGrid.at(left, top);
			this.tiles.set(tx, ty, Item.HOLE);
			this.holes.push({ tx, ty });
			return null;
		}

		case Item.RED:
			this.redsLeft++;
			return this.add(new Pastille(x, y, true, item));

		case Item.BLUE:
			return this.add(new Pastille(x, y, false, item));

		case Item.HATCH:
			// (the original hatch is 2 pixels off)
			this.hatch = this.add(new Hatch(x + 2, y + 2));
			return this.hatch;
		}
		return null;
	}

	add(entity) {
		this.entities.push(entity);
		return entity;
	}

	/** The boss room : holes in the lower corners, two death bumpers at the top. */
	buildBossRoom() {
		for (const [tx, ty] of [[0, 8], [1, 8], [0, 7], [13, 8], [12, 8], [13, 7]]) {
			this.tiles.set(tx, ty, Item.HOLE);
			this.holes.push({ tx, ty });
		}
		this.add(new DeathBumper(48, 48));
		this.add(new DeathBumper(W - 50, 48));
	}

	/** The decoration of the ball and bonus rooms : 4 clocks and 4 bumpers. */
	addCornerBumpers(game) {
		for (const [x, y] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]])
			this.add(new ClockBumper(x, y, game));
		for (const [x, y] of [[224, 144], [W - 224, 144], [224, H - 144], [W - 224, H - 144]])
			this.add(new Bumper(x, y));
	}

	buildBonusRoom(game, bonus) {
		const d = this.data;
		if (bonus === DungeonBonus.ORANGE || bonus === DungeonBonus.RED) {
			// (like the balls, they are back each time : a way to get a lost one back)
			this.add(new BallPickup(W / 2, H / 2, bonus === DungeonBonus.ORANGE ? BallType.ORANGE : BallType.RED));
		} else if (!d.taken) {
			const [icon, give] = BONUS_ITEMS[bonus];
			this.add(new ItemBox(W / 2, H / 2, icon, g => {
				d.taken = true;
				give(g);
			}));
		}
		this.addCornerBumpers(game);
	}

	// ----- doors -----

	/**
	 * The door of each side, from the exits of the data. The door the ball
	 * comes in by is open (a one-way door closes behind it).
	 */
	makeDoors(game, enteredBy) {
		const challenge = game.mode === Mode.CHALLENGE;
		return this.data.exits.map((exit, dir) => {
			let type = exit.type;
			// out of the Challenge, a "special" exit is a one-way door
			if (type === Exit.SPECIAL && !challenge)
				type = Exit.ONE_WAY;

			switch (type) {
			case Exit.WALL:
				return new Door(dir, "wall");
			case Exit.HIDDEN:
				return new Door(dir, "hidden");
			case Exit.OPEN:
				return new Door(dir, "open");
			case Exit.ONE_WAY: {
				if (dir !== enteredBy)
					return new Door(dir, "locked");
				const door = new Door(dir, "open");
				door.closeWhenInside = true;
				return door;
			}
			default:
				// a door (and in Challenge, a door behind blocks / holes needing a ball)
				return new Door(dir, "closed");
			}
		});
	}

	/** Opens the door on side `dir` (red pastilles taken, or a key). */
	openDoor(dir, game, sound = true) {
		const door = this.doors[dir];
		if (!door.openable)
			return;
		door.open(sound);
		// it stays open for the rest of the game
		this.data.exits[dir].type = Exit.OPEN;
	}

	openDoors(game, sound = true) {
		let opened = false;
		for (const door of this.doors) {
			if (door.openable) {
				this.openDoor(door.dir, game, false);
				opened = true;
			}
		}
		if (opened && sound)
			app.audio.play("doors");
		if (this.hatch)
			this.hatch.opening = true;
	}

	/** Closes every door (the boss room, once the ball is inside). */
	closeDoors() {
		for (const door of this.doors)
			door.close();
	}

	redTaken(game) {
		this.redsLeft--;
		if (this.redsLeft === 0)
			this.openDoors(game);
	}

	// ----- tiles -----

	/** A new hole (the bosses break the floor). */
	addHole(tx, ty) {
		if (this.tiles.get(tx, ty) === Item.HOLE)
			return;
		this.tiles.set(tx, ty, Item.HOLE);
		this.holes.push({ tx, ty });
	}

	/** A new green block (the final boss makes some). */
	addBlock(tx, ty) {
		const block = this.add(new GreenBlock(TILE_ORIGIN + tx * TILE, TILE_ORIGIN + ty * TILE, {}));
		this.tiles.set(tx, ty, Item.BLOCK);
		this.blocks.push(block);
		this.updateTiles();
	}

	/** A green block was destroyed. */
	removeTile(block) {
		const { tx, ty } = TileGrid.at(block.left, block.top);
		this.tiles.set(tx, ty, null);
		this.blocks = this.blocks.filter(b => b !== block);
		this.updateTiles();
	}

	/** Recomputes which green blocks touch each other. */
	updateTiles() {
		for (const b of this.blocks) {
			const { tx, ty } = TileGrid.at(b.left, b.top);
			const same = (x, y) => this.tiles.get(x, y) === Item.BLOCK;
			b.neighbours = (same(tx - 1, ty) ? 1 : 0) | (same(tx, ty - 1) ? 2 : 0)
				| (same(tx + 1, ty) ? 4 : 0) | (same(tx, ty + 1) ? 8 : 0);
		}
	}

	/** Adds the visible area of the holes to the current path (the falling ball is clipped to it). */
	holeClip() {
		const holes = this.holes.slice();
		return ctx => {
			for (const h of holes)
				ctx.rect(TILE_ORIGIN + h.tx * TILE + 1, TILE_ORIGIN + h.ty * TILE + 1, TILE, TILE);
		};
	}

	// ----- every step -----

	update(dt, game) {
		for (const door of this.doors)
			door.update(dt, game);
		// (entities may be added while updating : iterate on a copy)
		for (const e of this.entities.slice())
			if (!e.dead)
				e.update(dt, game);
		if (this.entities.some(e => e.dead))
			this.entities = this.entities.filter(e => !e.dead);
	}

	/** Every collider of the room. */
	colliders() {
		const list = this.fixedColliders.slice();
		for (const door of this.doors)
			list.push(door);
		for (const e of this.entities)
			if (e.shape)
				list.push(e);
		return list;
	}

	/** The laser beams touched by the ball. */
	touchBeams(ball, game) {
		for (const beam of this.beams) {
			if (circleTouchesSegment(ball.x, ball.y, ball.radius, beam.a.x, beam.a.y, beam.b.x, beam.b.y))
				beam.touch(game);
		}
	}

	// ----- drawing -----

	/**
	 * Draws the room ; `extras` are entities of the game drawn with the room
	 * (the ball, the boss), sorted by layer with the others.
	 */
	render(ctx, game, extras = []) {
		if (!this.backgroundClip) {
			// (the original "background" symbol : a frame per floor picture)
			this.backgroundClip = clip("background");
			this.backgroundClip.gotoAndStop((this.rx + this.ry) % 4);
		}
		drawClip(ctx, this.backgroundClip, 0, 0);
		this.renderHoles(ctx);
		this.renderBlockShadows(ctx);

		const all = this.entities.concat(extras);
		all.sort((a, b) => a.layer - b.layer);

		let i = 0;
		// the floor (teleports, beams, lowered blocks)
		for (; i < all.length && all[i].layer <= Layer.FLOOR; i++)
			all[i].render(ctx, game);
		// shadows of everything above the floor
		for (let j = i; j < all.length; j++)
			if (all[j].renderShadow)
				all[j].renderShadow(ctx, game);
		for (; i < all.length; i++)
			all[i].render(ctx, game);
	}

	/** The border and the doors (drawn over the room). */
	renderBorder(ctx, game) {
		for (const door of this.doors)
			door.render(ctx, game);
		drawBorder(ctx);
	}

	/**
	 * The holes show the "ground" symbol (the floor far below), except for a
	 * back wall on their top edge when there is floor above them.
	 */
	renderHoles(ctx) {
		if (!this.holes.length)
			return;
		const HOLE_WALL = 7;
		const rect = h => ({ x: TILE_ORIGIN + h.tx * TILE + 1, y: TILE_ORIGIN + h.ty * TILE + 1 });

		ctx.save();
		ctx.beginPath();
		for (const h of this.holes) {
			const r = rect(h);
			ctx.rect(r.x, r.y, TILE, TILE);
		}
		ctx.clip();
		drawClip(ctx, ground || (ground = clip("ground")), 0, 0);

		for (const h of this.holes) {
			if (h.ty === 0 || this.tiles.get(h.tx, h.ty - 1) === Item.HOLE)
				continue;
			const r = rect(h);
			ctx.fillStyle = "#9B76BC";
			ctx.fillRect(r.x, r.y, TILE, HOLE_WALL);
		}
		ctx.restore();
	}

	/**
	 * The drop shadows of the green blocks, like the original : a rounded
	 * rectangle for each vertical run and each horizontal run of blocks.
	 */
	renderBlockShadows(ctx) {
		if (!this.blocks.length)
			return;
		const isBlock = (x, y) => this.tiles.get(x, y) === Item.BLOCK;
		const SHIFT = 4;
		ctx.fillStyle = "rgba(0,0,0,0.2)";
		for (const b of this.blocks) {
			const tx = Math.round((b.left - TILE_ORIGIN) / TILE);
			const ty = Math.round((b.top - TILE_ORIGIN) / TILE);
			if (!isBlock(tx, ty - 1)) {
				let n = 1;
				while (isBlock(tx, ty + n))
					n++;
				roundRect(ctx, b.left + SHIFT, b.top + SHIFT, TILE, n * TILE, 8);
				ctx.fill();
			}
			if (!isBlock(tx - 1, ty)) {
				let n = 1;
				while (isBlock(tx + n, ty))
					n++;
				roundRect(ctx, b.left + SHIFT, b.top + SHIFT, n * TILE, TILE, 8);
				ctx.fill();
			}
		}
	}
}

/** The floor under the holes (one clip for every room). */
let ground = null;

/** The items of the item boxes : icon, and what they give. */
const BONUS_ITEMS = {
	[DungeonBonus.MAP]: [Icon.MAP, game => {
		game.inventory.map = true;
		game.showMap();
	}],
	[DungeonBonus.RADAR]: [Icon.RADAR, game => {
		game.inventory.radar = true;
		game.showMap();
	}],
	[DungeonBonus.KEY]: [Icon.KEY, game => {
		game.inventory.keys += 3;
	}],
	[DungeonBonus.SMALL_TIME]: [Icon.SMALL_TIME, game => {
		if (game.rules.itemTime)
			game.addTime(60);
	}],
	[DungeonBonus.BIG_TIME]: [Icon.BIG_TIME, game => {
		if (game.rules.itemTime)
			game.addTime(180);
	}]
};

