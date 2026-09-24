/**
 * The enumerations stored in the level data. Their numeric values are part
 * of the data format of the original game, so they must not change.
 */

/** Ball colours. Also the order of the ball icons and of the zapper phases. */
export const BallType = Object.freeze({
	YELLOW: 0,   // the default ball
	GREEN: 1,    // destroys the green blocks
	RED: 2,      // attracts the red pastilles
	ORANGE: 3,   // fast
	BLUE: 4,     // jumps over the holes
	METAL: 5,    // heavy, immune to the death bumpers and to the magnets
	VIOLET: 6    // sees the invisible bumpers
});

export const BALL_TYPE_COUNT = 7;

/** Items of a room ("btype" in the data). */
export const Item = Object.freeze({
	NONE: 0,          // removed (destroyed block, collected pastille)
	BUMPER: 1,
	CLOCK: 2,         // costs 5 seconds when hit
	DEATH: 3,         // kills the ball, except the metal one
	MAGNET: 4,
	GHOST: 5,         // invisible bumper
	BLOCK: 6,         // green block, destroyed by the green ball
	HOLE: 7,
	RED: 8,           // red pastille : collect them all to open the doors
	BLUE: 9,          // time pastille
	TELEPORT: 10,
	SWITCH: 11,       // toggles the pink and blue blocks
	PINK_BLOCK: 12,   // solid while the switch is on
	BLUE_BLOCK: 13,   // solid while the switch is off
	ZAPPER: 14,       // laser post (a checkpoint in Course mode)
	HATCH: 15         // exit of the Classique rooms
});

/** Room types. */
export const RoomType = Object.freeze({
	NONE: 0,
	NORMAL: 1,
	BOSS: 2,
	BALL: 3,          // holds a ball to collect (data : DungeonObject)
	BONUS: 4,         // holds an item box or a bonus ball (data : DungeonBonus)
	NEEDS_BALL: 5     // a room that can only be crossed with a given ball
});

/**
 * Exits of a room, in the order left, right, up, down.
 * 0..3 come from the data, the negative values are set while playing.
 */
export const Exit = Object.freeze({
	DOOR: 0,        // opens when every red pastille is collected
	WALL: 1,
	HIDDEN: 2,      // open, but looks like a wall
	SPECIAL: 3,     // Challenge : a door needing a ball ; other modes : a one-way door
	OPEN: -1,       // a door that has been opened
	ONE_WAY: -2     // a one-way door that has been crossed
});

/** Directions of the exits. */
export const Dir = Object.freeze({ LEFT: 0, RIGHT: 1, UP: 2, DOWN: 3 });
export const DIR_DX = [-1, 1, 0, 0];
export const DIR_DY = [0, 0, -1, 1];
export const OPPOSITE = [1, 0, 3, 2];

/** Balls found in the dungeons. */
export const DungeonBall = Object.freeze({ GREEN: 0, BLUE: 1, METAL: 2, VIOLET: 3 });

/** Bonuses found in the dungeons. */
export const DungeonBonus = Object.freeze({
	ORANGE: 0, RED: 1, MAP: 2, RADAR: 3, KEY: 4, SMALL_TIME: 5, BIG_TIME: 6
});

/** Game modes. */
export const Mode = Object.freeze({
	CHALLENGE: "challenge",
	ADVENTURE: "adventure",
	COURSE: "course",
	CLASSIC: "classic",
	TUTORIAL: "tutorial"
});

/** The items of the item boxes (the frames of the "itembox" symbol's "item"). */
export const Icon = Object.freeze({ MAP: 0, RADAR: 1, SMALL_TIME: 2, BIG_TIME: 3, KEY: 4 });
