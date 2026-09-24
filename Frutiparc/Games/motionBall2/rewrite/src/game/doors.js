/**
 * The border of the room and its four doors.
 *
 * Collisions : each side of the border is made of two boxes (the "jambs")
 * around the door opening, and a third box filling the opening (the "leaf"),
 * solid unless the door lets the ball through. The inner corners of the
 * border are rounded : an "arc" shape keeps the ball inside them.
 *
 * Door states :
 *   wall      no door : plain border
 *   hidden    looks like the border, but the ball goes through
 *   closed    a closed door (opens when the red pastilles are taken, or with a key)
 *   locked    a one-way door seen from the wrong side : never opens
 *   opening / open / closing
 */

import { WIDTH as W, HEIGHT as H, BORDER as B, DOOR_SIZE as D } from "../config.js";
import { BOUNCE } from "./physics.js";
import { clip, drawClip } from "../gfx/xfl/index.js";
import { app } from "../app.js";
import { Spark } from "./entities/effects.js";

// the opening animation of the door symbol : 12 frames at 40 per second
const OPEN_TIME = 12 / 40;
const CORNER = 22;
const OUT = 200;   // the border boxes extend outside of the room

/** The opening of each door, in room coordinates. */
const GAPS = [
	{ x: -OUT, y: H / 2 - D / 2, w: B + OUT, h: D },
	{ x: W - B, y: H / 2 - D / 2, w: B + OUT, h: D },
	{ x: W / 2 - D / 2, y: -OUT, w: D, h: B + OUT },
	{ x: W / 2 - D / 2, y: H - B, w: D, h: B + OUT }
];

/** The two jambs of each side. */
const JAMBS = [
	[{ x: -OUT, y: -OUT, w: B + OUT, h: H / 2 - D / 2 + OUT }, { x: -OUT, y: H / 2 + D / 2, w: B + OUT, h: H / 2 - D / 2 + OUT }],
	[{ x: W - B, y: -OUT, w: B + OUT, h: H / 2 - D / 2 + OUT }, { x: W - B, y: H / 2 + D / 2, w: B + OUT, h: H / 2 - D / 2 + OUT }],
	[{ x: -OUT, y: -OUT, w: W / 2 - D / 2 + OUT, h: B + OUT }, { x: W / 2 + D / 2, y: -OUT, w: W / 2 - D / 2 + OUT, h: B + OUT }],
	[{ x: -OUT, y: H - B, w: W / 2 - D / 2 + OUT, h: B + OUT }, { x: W / 2 + D / 2, y: H - B, w: W / 2 - D / 2 + OUT, h: B + OUT }]
];

/** The rounded inner corners : the ball must stay inside these arcs. */
const CORNERS = [
	{ kind: "arc", x: B + CORNER, y: B + CORNER, r: CORNER, sx: -1, sy: -1 },
	{ kind: "arc", x: W - B - CORNER, y: B + CORNER, r: CORNER, sx: 1, sy: -1 },
	{ kind: "arc", x: B + CORNER, y: H - B - CORNER, r: CORNER, sx: -1, sy: 1 },
	{ kind: "arc", x: W - B - CORNER, y: H - B - CORNER, r: CORNER, sx: 1, sy: 1 }
];

/** Where each door is drawn : middle of its side, and rotation (the room is toward +y). */
const DOOR_FRAMES = [
	{ x: B / 2, y: H / 2, angle: -Math.PI / 2 },
	{ x: W - B / 2, y: H / 2, angle: Math.PI / 2 },
	{ x: W / 2, y: B / 2, angle: 0 },
	{ x: W / 2, y: H - B / 2, angle: Math.PI }
];

/** Colliders of the parts of the border that never change. */
export function borderColliders() {
	const list = [];
	for (const jambs of JAMBS)
		for (const shape of jambs)
			list.push({ shape, solid: true, bounce: BOUNCE.border, onHit: wallHit });
	for (const shape of CORNERS)
		list.push({ shape, solid: true, bounce: BOUNCE.border, onHit: wallHit });
	return list;
}

function wallHit(game, contact) {
	app.audio.play("wall");
	game.room.add(new Spark(contact.x, contact.y));
}

export class Door {

	constructor(dir, state) {
		this.dir = dir;
		this.state = state;
		this.progress = state === "open" ? 1 : 0;   // 0 closed .. 1 open
		// collider of the opening
		this.shape = GAPS[dir];
		this.bounce = BOUNCE.border;
		// one-way door : closes once the ball is inside
		this.closeWhenInside = false;
	}

	/** Can the ball go through ? */
	get solid() {
		return !(this.state === "open" || this.state === "hidden" || this.state === "opening");
	}

	/** Can the red pastilles or a key open it ? */
	get openable() {
		return this.state === "closed";
	}

	open(sound = true) {
		if (this.state !== "closed")
			return;
		this.state = "opening";
		if (sound)
			app.audio.play("doors");
	}

	close() {
		if (this.state === "open" || this.state === "opening")
			this.state = "closing";
	}

	/** A closed door : a key opens it. */
	onHit(game, contact) {
		if (this.state === "closed" && game.inventory.keys > 0) {
			game.inventory.keys--;
			app.audio.play("key");
			game.room.openDoor(this.dir, game);
			return;
		}
		wallHit(game, contact);
	}

	update(dt, game) {
		if (this.state === "opening") {
			this.progress = Math.min(1, this.progress + dt / OPEN_TIME);
			if (this.progress >= 1)
				this.state = "open";
		} else if (this.state === "closing") {
			this.progress = Math.max(0, this.progress - dt / OPEN_TIME);
			if (this.progress <= 0)
				this.state = "locked";
		}

		// a one-way door closes behind the ball
		if (this.closeWhenInside && game.ballInside()) {
			this.closeWhenInside = false;
			this.close();
			game.oneWayCrossed();
		}
	}

	/**
	 * The original "door" symbol : frames "off" (closed), "open" .. "opened"
	 * (the opening), "nodoor0".."nodoor3" (no door : a piece of border). The
	 * opening and closing follow `progress`.
	 */
	render(ctx) {
		const c = this.clip || (this.clip = makeDoorClip());
		if (this.state === "wall" || this.state === "hidden")
			c.gotoAndStop("nodoor" + this.dir);
		else if (this.progress <= 0)
			c.gotoAndStop("off");
		else
			c.gotoAndStop(Math.min(c.frameOf("opened"), c.frameOf("open") + Math.floor(this.progress * OPEN_FRAMES)));
		const f = DOOR_FRAMES[this.dir];
		drawClip(ctx, c, f.x, f.y, f.angle);
	}
}

/** Frames of the opening animation of the "door" symbol. */
const OPEN_FRAMES = 12;

function makeDoorClip() {
	const c = clip("door");
	c.stop();
	// its two sliding halves only move with the frames of the door
	for (const name of ["porteA", "porteB"]) {
		const half = c.child(name);
		if (half)
			half.stop();
	}
	return c;
}

let border = null;

/** The border of the room (the original "border" symbol, with openings at the doors). */
export function drawBorder(ctx) {
	drawClip(ctx, border || (border = clip("border")), 0, 0);
}
