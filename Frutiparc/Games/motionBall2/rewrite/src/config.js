/**
 * Game-wide constants.
 *
 * Every distance is in pixels of the 610 x 410 room (the logical size of the
 * canvas), every duration in seconds, every speed in pixels per second.
 *
 * The original game ran at 40 frames per second and expressed its tuning per
 * frame. Where a value comes from the original, the comment gives the
 * original per-frame value so it can be compared.
 */

/** Size of the room, which is also the logical size of the screen. */
export const WIDTH = 610;
export const HEIGHT = 410;

/** Thickness of the green border around the room. */
export const BORDER = 25;

/** Width of the door openings, centred on each side of the room. */
export const DOOR_SIZE = 110;

/**
 * The level data places items on a grid of 4 x 4 pixel cells (152 x 102
 * cells). Only the data layer and the room builder use it.
 */
export const CELL = 4;
export const CELLS_X = 152;
export const CELLS_Y = 102;
export const BORDER_CELLS = 6;

/**
 * Green blocks and holes sit on a coarser grid of 40 x 40 pixel tiles
 * (10 x 10 cells), starting at the inner corner of the border.
 */
export const TILE = 40;
export const TILE_ORIGIN = BORDER_CELLS * CELL;   // 24
export const TILES_X = 14;
export const TILES_Y = 9;

/** Radius of the player's ball. */
export const BALL_RADIUS = 8;

/** Rate of the fixed simulation step (see engine/loop.js). */
export const SIM_RATE = 120;

/** The original frame rate, used to convert the original tuning. */
export const ORIGINAL_FPS = 40;

/** Time needed to scroll from one room to the next. */
export const ROOM_SCROLL_TIME = 0.5;

/** Physics of the balls, see game/ball.js. */
export const PHYSICS = {
	// maximum speed before the "over speed" brake (20 px/frame)
	maxSpeed: 800,
	// "over speed" brake : speed x 0.8 per original frame
	overSpeedDamping: 0.8,
	// speeds under this are set to 0 (0.1 px/frame)
	restSpeed: 4,
	// pull toward the centre of a hole, and toward its far side (1 px/frame^2)
	holePull: 1600,
	// the ball is also accelerated by 10% per frame on a hole
	holeBoost: 1.1
};

/**
 * Each ball type : acceleration (px/s^2, the original speed coefficient x 1600),
 * inertia (the speed is multiplied by it every original frame), max speed.
 */
export const BALLS = [
	{ name: "Jaune",    color: "#ffd21e", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 },
	{ name: "Verte",    color: "#3fbf2a", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 },
	{ name: "Rouge",    color: "#e8302a", accel: 0.60 * 1600, inertia: 0.95, maxSpeed: 800 },
	{ name: "Orange",   color: "#ff8c1a", accel: 2.10 * 1600, inertia: 0.85, maxSpeed: 800 },
	{ name: "Bleue",    color: "#3aa0ff", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 },
	{ name: "Métal",    color: "#c8ccd6", accel: 0.20 * 1600, inertia: 0.98, maxSpeed: 280 },
	{ name: "Violette", color: "#a64dff", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 }
];

/** Slippery floor (water power of the snakes). */
export const WATER = { inertia: 0.98, accelFactor: 2 };

/** Time the ball blinks, invulnerable, after losing a life. */
export const INVULNERABLE_TIME = 0.4;
