/*
 * Symbols of the room itself : background, border, doors, holes and shades.
 *
 * These are redrawn versions of the vector symbols of mb2.fla (see
 * FLA_DECODING.md). The background bitmaps are the original ones.
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;
	const F = MB2.Frames;
	const C = MB2.Const;

	const W = C.LVL_WIDTH;
	const H = C.LVL_HEIGHT;
	const B = C.BORDER_SIZE;
	const D = C.DOOR_SIZE;

	SYM.empty = {
		draw() { }
	};

	/** Room background : frames 1-4 = bg01..bg04 (Interf.selectBg). Registration : top-left. */
	SYM.background = {
		frames: 4,
		draw(ctx, c) {
			G.img(ctx, "bg0" + c.frame, W, H, 0, 0);
		}
	};


	// ----- border -----

	/** Colours of the border "pipe", taken from screenshots of the game. */
	MB2.BORDER_COL = { body: "#7dd64e", dark: "#4fa628", light: "#b4f08a" };

	/** Rectangle of each door in the border, in room coordinates (left, right, up, down). */
	const DOOR_RECTS = [
		[0, H / 2 - D / 2, B + 4, D],
		[W - B - 4, H / 2 - D / 2, B + 4, D],
		[W / 2 - D / 2, 0, D, B + 4],
		[W / 2 - D / 2, H - B - 4, D, B + 4]
	];

	/**
	 * The border, drawn once in a cached canvas. With `gaps`, the door areas
	 * are cut out : the doors are drawn below the border and show through.
	 */
	MB2.borderCanvas = function (gaps) {
		return G.cache("border" + gaps, W, H, ctx => {
			const col = MB2.BORDER_COL;
			const inner = { x: B, y: B, w: W - 2 * B, h: H - 2 * B };

			// the frame : the whole room minus the rounded inner rectangle
			ctx.beginPath();
			ctx.rect(0, 0, W, H);
			MB2.Tools.smoothSquarePath(ctx, inner, 22);
			ctx.closePath();
			ctx.fillStyle = col.body;
			ctx.fill("evenodd");

			// light stripe along the pipe
			ctx.beginPath();
			MB2.Tools.smoothSquarePath(ctx, { x: B - 9, y: B - 9, w: inner.w + 18, h: inner.h + 18 }, 28);
			ctx.strokeStyle = col.light;
			ctx.lineWidth = 3;
			ctx.stroke();

			// dark edge on the room side
			ctx.beginPath();
			MB2.Tools.smoothSquarePath(ctx, { x: B - 1.5, y: B - 1.5, w: inner.w + 3, h: inner.h + 3 }, 23);
			ctx.strokeStyle = col.dark;
			ctx.lineWidth = 3;
			ctx.stroke();

			if (gaps) {
				ctx.globalCompositeOperation = "destination-out";
				for (const r of DOOR_RECTS)
					ctx.fillRect(r[0], r[1], r[2], r[3]);
			}
		});
	};

	/** Registration : top-left. */
	SYM.border = {
		draw(ctx) {
			ctx.drawImage(MB2.borderCanvas(true), 0, 0, W, H);
		}
	};


	// ----- doors -----

	/*
	 * A door is drawn in "door coordinates" : the clip is placed on the middle
	 * of the border side and rotated (-90 left, 90 right, 0 up, 180 down), so
	 * that the room is always toward +y.
	 *
	 * Frames :
	 *   1  off       closed, red pastilles remaining
	 *   2  on        closed, ready to open
	 *   3-14 open    opening animation
	 *   15 opened
	 *   16-19 nodoor0..3   no door on side 0..3 : the plain border
	 *
	 * A closed door is two pieces of border with rounded tips meeting in the
	 * middle ; they slide into the border while opening.
	 */
	const DOOR_HOME = [[B / 2, H / 2], [W - B / 2, H / 2], [W / 2, B / 2], [W / 2, H - B / 2]];

	SYM.door = {
		frames: 19,
		labels: { off: 1, on: 2, open: 3, opened: 15, nodoor0: 16, nodoor1: 17, nodoor2: 18, nodoor3: 19 },
		actions: { 1: F.stop, 2: F.stop, 15: F.stop, 16: F.stop, 17: F.stop, 18: F.stop, 19: F.stop },

		draw(ctx, c) {
			if (c.frame >= 16)
				drawBorderPiece(ctx, c, c.frame - 16);
			else if (c.frame < 15)
				drawDoorHalves(ctx, c.frame >= 3 ? (c.frame - 2) / 12 : 0);
		}
	};

	/**
	 * "No door" : copy the piece of the (gapless) border that the gap removed.
	 * The copy is done in room coordinates, so the rotation of the clip is undone.
	 * (The clip position still applies : the piece follows the room scrolling.)
	 */
	function drawBorderPiece(ctx, c, side) {
		const r = DOOR_RECTS[side];
		const home = DOOR_HOME[side];
		ctx.rotate(-c.rotation * Math.PI / 180);
		ctx.translate(-home[0], -home[1]);
		// the cached canvas is drawn at 2x
		ctx.drawImage(MB2.borderCanvas(false), r[0] * 2, r[1] * 2, r[2] * 2, r[3] * 2, r[0], r[1], r[2], r[3]);
	}

	/** The two halves of a closed door, `open` = 0 (closed) .. 1 (opened). */
	function drawDoorHalves(ctx, open) {
		const col = MB2.BORDER_COL;
		const top = -B / 2 - 2;
		const bottom = B / 2 + 2;
		const R = (bottom - top) / 2;   // radius of the rounded tips
		const half = D / 2;
		const slide = open * (half + 4);

		ctx.save();
		ctx.beginPath();
		ctx.rect(-D / 2 - 1, top - 1, D + 2, bottom - top + 2);
		ctx.clip();

		for (const side of [-1, 1]) {
			const tip = side * (1.5 + slide);   // x of the rounded end
			const far = side * (half + 30);      // x of the other end (hidden in the border)
			const cx = tip + side * R;           // center of the rounded end

			ctx.beginPath();
			ctx.moveTo(far, top);
			ctx.lineTo(cx, top);
			ctx.arc(cx, 0, R, -Math.PI / 2, Math.PI / 2, side > 0);
			ctx.lineTo(far, bottom);
			ctx.closePath();
			ctx.fillStyle = col.body;
			ctx.fill();

			// the same light stripe and dark edge as the border
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


	// ----- holes and shades (see Interf.update_walls) -----

	/**
	 * The holes : the bgHole bitmap, visible only inside the hole rectangles.
	 * c.holes is the "holes" clip, whose `rects` are [x, y, w, h, hasTopWall].
	 */
	SYM.ground = {
		draw(ctx, c) {
			const holes = c.holes;
			if (!holes || !holes.rects.length)
				return;

			ctx.save();
			ctx.beginPath();
			for (const r of holes.rects)
				ctx.rect(r[0], r[1], r[2], r[3]);
			ctx.clip();

			G.img(ctx, "bgHole", W, H, 0, 0);

			// inner shadow below the top edge of each hole
			ctx.fillStyle = "rgba(40,10,60,0.35)";
			for (const r of holes.rects) {
				if (r[4])
					ctx.fillRect(r[0], r[1], r[2], 6);
			}
			ctx.restore();
		}
	};

	/** Only holds the hole rectangles (it was the mask of "ground" in Flash). */
	SYM.holes = {
		init(c) {
			c.rects = [];
		},
		draw() { }
	};

	/**
	 * Drawn on the floor : the back wall of the holes and the drop shadows of
	 * the green blocks. c.ops = { t: "rect", col, x, y, w, h }
	 *                        | { t: "smooth", a (alpha), curve, x, y, w, h }
	 */
	SYM.shades = {
		init(c) {
			c.ops = [];
		},
		draw(ctx, c) {
			for (const o of c.ops) {
				if (o.t === "rect") {
					ctx.fillStyle = o.col;
					ctx.fillRect(o.x, o.y, o.w, o.h);
				} else {
					ctx.fillStyle = "rgba(0,0,0," + o.a + ")";
					ctx.beginPath();
					MB2.Tools.smoothSquarePath(ctx, o, o.curve);
					ctx.fill();
				}
			}
		}
	};

})();
