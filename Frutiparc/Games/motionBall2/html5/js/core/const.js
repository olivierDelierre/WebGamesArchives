/*
 * Game constants (port of mb2/Const.as) and the enumerations used by the
 * level data and the game code.
 *
 * Distances are in pixels. The room is also divided in "cells" of DELTA x DELTA
 * pixels : collisions, bumper positions and level data use cell coordinates.
 */
"use strict";

MB2.Const = (function () {

	const C = {

		// game modes (Manager.play_mode)
		MODE_CHALLENGE: 1,
		MODE_CLASSIC: 3,
		MODE_COURSE: 10,
		MODE_AVENTURE: 20,
		MODE_AIDE: 100,

		// times, in milliseconds
		TIME_CHALLENGE: 15 * 60 * 1000,
		TIME_CLASSIC: 60 * 1000,
		TIME_CLASSIC_EXTENDED: 5 * 1000,

		// room geometry
		DELTA: 4,               // size of a collision cell, in pixels
		LVL_WIDTH: 610,         // room size, in pixels (also the canvas size)
		LVL_HEIGHT: 410,
		BORDER_SIZE: 25,        // thickness of the room border
		BALL_RAYSIZE: 8,        // ball radius used by the collisions
		HOLE_BORDER_SIZE: 7,    // height of the "back wall" drawn on top of the holes
		DOOR_SIZE: 110,         // width of a door
		DOOR_COLLIDE_DELTA: 5,  // extra cells of "no recal" border around open doors
		MAX_BUMPERS: 50,

		// Game.gameOver causes
		CAUSE_NOTIME: 1,
		CAUSE_NOBALLS: 2,
		CAUSE_WINS: 3,

		// display planes (depths of the DepthManager), from back to front
		BG_PLAN: 0,
		SHADE_PLAN: 1,
		DECOR_PLAN: 2,
		DOOR_PLAN: 2,
		HOLE_PLAN: 3,
		BONUS_PLAN: 4,
		BALL_PLAN: 5,
		BUMPER_PLAN: 6,
		DUMMY_PLAN: 7,
		BOSS_PLAN: 8,
		ICON_PLAN: 9
	};

	// the same values expressed in cells
	C.LVL_CWIDTH = (C.LVL_WIDTH / C.DELTA) | 0;      // 152
	C.LVL_CHEIGHT = (C.LVL_HEIGHT / C.DELTA) | 0;    // 102
	C.BORDER_CSIZE = (C.BORDER_SIZE / C.DELTA) | 0;  // 6
	C.DOOR_CSIZE = Math.ceil(C.DOOR_SIZE / C.DELTA);
	C.DOOR_CXPOS = ((C.LVL_CWIDTH - C.DOOR_CSIZE) / 2) | 0;
	C.DOOR_CYPOS = ((C.LVL_CHEIGHT - C.DOOR_CSIZE) / 2) | 0;

	// number of bits used to store a cell coordinate in the level data (8)
	C.POS_NBITS = Math.ceil(Math.log(Math.max(C.LVL_CWIDTH, C.LVL_CHEIGHT)) / Math.LN2);

	// area where the bosses can move
	C.BOSS_MIN_X = C.BORDER_SIZE * 2;
	C.BOSS_MIN_Y = C.BORDER_SIZE;
	C.BOSS_MAX_Y = C.BORDER_SIZE;

	return C;
})();


/*
 * Ball types. Also used as the index of the ball colours, of the zapper phases
 * and of Options.ball_types.
 */
MB2.BallType = {
	YELLOW: 0,  // jaune : the default ball
	GREEN: 1,   // verte : destroys the green blocks
	RED: 2,     // rouge : attracts the red pastilles
	ORANGE: 3,  // orange : fast
	BLUE: 4,    // bleue : jumps over holes
	METAL: 5,   // metal : heavy, immune to death bumpers and magnets
	VIOLET: 6   // violette : sees the invisible bumpers
};


/*
 * Items of a room, as stored in the level data ("btype" of each bumper).
 */
MB2.Bumper = {
	NONE: 0,          // an item that was removed (destroyed block, taken pastille)
	NORMAL: 1,
	TIME: 2,          // clock bumper : costs 5 seconds
	DEATH: 3,         // kills the ball (except the metal one)
	MAGNET: 4,
	SHADOW: 5,        // invisible bumper
	WALL: 6,          // green block (destroyed by the green ball)
	HOLE: 7,
	RED: 8,           // red pastille : collect them all to open the doors
	BLUE: 9,          // time pastille
	TELEPORT: 10,
	SWITCH: 11,       // toggles the pink / blue blocks
	BLOCK_RED: 12,    // pink block, solid when the switch is on
	BLOCK_BLUE: 13,   // blue block, solid when the switch is off
	ZAPPER: 14,       // laser post (checkpoint in Course mode)
	CLASSIC_EXIT: 15  // hatch of the Classique mode
};


/*
 * Room types of the level data (room.rtype).
 */
MB2.Room = {
	NONE: 0,          // no room
	NORMAL: 1,
	END: 2,           // the boss room
	OBJECT_FOUND: 3,  // a ball to collect (rdata = MB2.DungeonObject)
	BONUS: 4,         // an item box (rdata = MB2.DungeonBonus)
	OBJECT_NEEDED: 5  // a room that needs a ball to be crossed (normal room in the game)
};


/*
 * State of a room exit (room.paths[d].ptype), d = 0 left, 1 right, 2 up, 3 down.
 * Values 0..3 come from the level data, negative values are set while playing.
 */
MB2.Path = {
	DOOR: 0,       // a door, opened when all the red pastilles are collected
	WALL: 1,       // no exit
	INVISIBLE: 2,  // open, but looks like a wall
	SPECIAL: 3,    // challenge : a door needing an object ; other modes : a one-way door
	OPEN: -1,      // a door that has been opened
	ONE_WAY: -2    // a one-way door that has been crossed
};


/*
 * Objects and bonuses found in the dungeons (room.rdata).
 */
MB2.DungeonObject = { GREEN: 0, BLUE: 1, METAL: 2, VIOLET: 3 };

MB2.DungeonBonus = { ORANGE: 0, RED: 1, MAP: 2, RADAR: 3, KEY: 4, SMALL_TIME: 5, BIG_TIME: 6 };
