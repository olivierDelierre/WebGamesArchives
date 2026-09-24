/*
 * The level data structure, shared by the hand-made dungeons (assemble.js)
 * and the random ones (generator/).
 *
 * It is the structure that mb2/LevelLoader.as decoded from the .dat files
 * produced by mb2gen :
 *
 *   level = {
 *     width, height,        size of the dungeon, in rooms
 *     start_x, start_y,     starting room
 *     dungeon[x][y] = room
 *   }
 *
 *   room = {
 *     rtype,                MB2.Room
 *     rdata,                MB2.DungeonObject / MB2.DungeonBonus, depending on rtype
 *     paths[4],             exits : left, right, up, down = { ptype: MB2.Path, pdata }
 *                           (null when rtype is Room.NONE)
 *     bdata,                list of items { btype: MB2.Bumper, x, y } (cell coordinates
 *                           of the top-left corner), or null
 *     visited               set by the game
 *   }
 *
 * The game modifies this structure while playing (opened doors, destroyed
 * blocks...), so a fresh copy must be built for each game.
 */
"use strict";

MB2.LevelFormat = {

	/** Creates a room. `paths` may contain MB2.Path values or { ptype, pdata } objects. */
	newRoom(rtype, rdata, paths, bdata) {
		const room = {
			rtype: rtype,
			rdata: rdata,
			paths: null,
			bdata: bdata || null
		};
		if (rtype !== MB2.Room.NONE) {
			room.paths = paths.map(p => {
				if (typeof p === "object")
					return p;
				// a one-way door of the hand-made dungeons is encoded as "needs the green ball"
				return { ptype: p, pdata: (p === MB2.Path.SPECIAL) ? MB2.DungeonObject.GREEN : undefined };
			});
		}
		return room;
	},

	/**
	 * Decodes a room made with the level editor (the "DATA=..." lines of
	 * ../dungeon/*.txt) :
	 *   4 x 2 bits   exits left, right, up, down (editor encoding, see below)
	 *   1 bit        unused (always 1)
	 *   repeated :   4 bits item type (0 = end of the list), 8 bits x, 8 bits y
	 */
	decodeRoomData(str) {
		const b = new MB2.BitCodec(str);

		// editor encoding : 0 closed, 1 opened, 2 invisible, 3 one-way
		const EDITOR_PATHS = [MB2.Path.WALL, MB2.Path.DOOR, MB2.Path.INVISIBLE, MB2.Path.SPECIAL];
		const paths = [];
		for (let i = 0; i < 4; i++)
			paths.push(EDITOR_PATHS[b.read(2)]);

		b.read(1);

		const bumpers = [];
		while (true) {
			const btype = b.read(4);
			if (btype === 0 || b.error)
				break;
			const x = b.read(MB2.Const.POS_NBITS);
			const y = b.read(MB2.Const.POS_NBITS);
			bumpers.push({ btype: btype, x: x, y: y });
		}

		return { paths: paths, bumpers: bumpers };
	}
};
