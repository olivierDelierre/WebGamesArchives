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
import { Dir } from "../data/enums.js";
import { BOUNCE } from "./physics.js";
import { BORDER_COLORS, roundRectPath } from "../gfx/draw.js";
import { app } from "../app.js";
import { Spark } from "./entities/effects.js";

const OPEN_TIME = 0.3;
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

	render(ctx) {
		if (this.state === "wall" || this.state === "hidden") {
			// the piece of plain border cut out of the border picture
			// (1 px wider on each side, so that no seam shows)
			const gap = GAPS[this.dir];
			const across = this.dir < 2 ? 0 : 1;
			ctx.save();
			ctx.beginPath();
			ctx.rect(gap.x - across, gap.y - (1 - across), gap.w + 2 * across, gap.h + 2 * (1 - across));
			ctx.clip();
			ctx.drawImage(borderCanvas(false), 0, 0, W, H);
			ctx.restore();
			return;
		}
		if (this.progress >= 1)
			return;
		const f = DOOR_FRAMES[this.dir];
		ctx.save();
		ctx.translate(f.x, f.y);
		ctx.rotate(f.angle);
		drawDoorHalves(ctx, this.progress);
		ctx.restore();
	}
}

/**
 * The two halves of a closed door (in door coordinates : centred, the room
 * toward +y), `open` = 0 (closed) .. 1 (open). They slide into the border.
 */
function drawDoorHalves(ctx, open) {
	const col = BORDER_COLORS;
	const top = -B / 2 - 2;
	const bottom = B / 2 + 2;
	const R = (bottom - top) / 2;
	const half = D / 2;
	const slide = open * (half + 4);

	ctx.save();
	ctx.beginPath();
	ctx.rect(-D / 2 - 1, top - 1, D + 2, bottom - top + 2);
	ctx.clip();

	for (const side of [-1, 1]) {
		const tip = side * (1.5 + slide);
		const far = side * (half + 30);
		const cx = tip + side * R;

		ctx.beginPath();
		ctx.moveTo(far, top);
		ctx.lineTo(cx, top);
		ctx.arc(cx, 0, R, -Math.PI / 2, Math.PI / 2, side > 0);
		ctx.lineTo(far, bottom);
		ctx.closePath();
		ctx.fillStyle = col.body;
		ctx.fill();

		ctx.save();
		ctx.clip();
		ctx.lineWidth = 3;
		ctx.strokeStyle = col.light;
		ctx.beginPath();
		ctx.moveTo(far, 3.5);
		ctx.lineTo(cx - side * 2, 3.5);
		ctx.stroke();
		ctx.strokeStyle = col.dark;
		ctx.beginPath();
		ctx.arc(cx, 0, R - 1.5, Math.PI / 2 + side * 1.3, Math.PI / 2, side > 0);
		ctx.lineTo(far, R - 1.5);
		ctx.stroke();
		ctx.restore();
	}
	ctx.restore();
}

// ----- the border picture -----

const borders = {};

/** The border, drawn once. With `gaps`, the door openings are cut out. */
export function borderCanvas(gaps) {
	const key = gaps ? "gaps" : "full";
	if (borders[key])
		return borders[key];

	const scale = 3;
	const canvas = document.createElement("canvas");
	canvas.width = W * scale;
	canvas.height = H * scale;
	const ctx = canvas.getContext("2d");
	ctx.scale(scale, scale);
	const col = BORDER_COLORS;

	// the frame : the whole room minus the rounded inner rectangle
	ctx.beginPath();
	ctx.rect(0, 0, W, H);
	roundRectPath(ctx, B, B, W - 2 * B, H - 2 * B, CORNER);
	ctx.closePath();
	ctx.fillStyle = col.body;
	ctx.fill("evenodd");

	// light stripe along the pipe
	ctx.beginPath();
	roundRectPath(ctx, B - 9, B - 9, W - 2 * B + 18, H - 2 * B + 18, 28);
	ctx.strokeStyle = col.light;
	ctx.lineWidth = 3;
	ctx.stroke();

	// dark edge on the room side
	ctx.beginPath();
	roundRectPath(ctx, B - 1.5, B - 1.5, W - 2 * B + 3, H - 2 * B + 3, CORNER + 1);
	ctx.strokeStyle = col.dark;
	ctx.lineWidth = 3;
	ctx.stroke();

	if (gaps) {
		ctx.globalCompositeOperation = "destination-out";
		for (let d = 0; d < 4; d++) {
			const g = GAPS[d];
			// only the part inside the picture (+4 px into the room for the door tips)
			const x = Math.max(0, g.x) - (d === Dir.RIGHT ? 4 : 0);
			const y = Math.max(0, g.y) - (d === Dir.DOWN ? 4 : 0);
			const w = d < 2 ? B + 4 : g.w;
			const h = d < 2 ? g.h : B + 4;
			ctx.fillRect(x, y, w, h);
		}
	}
	borders[key] = canvas;
	return canvas;
}
