/**
 * Collision shapes, and the collision of the ball against them.
 *
 * The original game tested 16 points around the ball on a grid of 4 x 4
 * pixel cells filled with bitmap masks of the bumpers. Here every solid thing
 * has a geometric shape :
 *   { kind: "circle", x, y, r }      bumpers, posts, boss parts
 *   { kind: "box", x, y, w, h }      blocks, the border, the doors
 *   { kind: "arc", ... }             the rounded inner corners of the room
 * and the ball (a circle) is tested against them exactly.
 *
 * A collider is an object with :
 *   shape                  its shape (updated by its owner when it moves)
 *   solid                  false to ignore it (e.g. an open switch block)
 *   bounce: { coef, min }  the speed after a bounce is max(speed x coef, min)
 *   onHit(game, contact)   optional : called when the ball hits it
 */

/**
 * Contact between a circle (cx, cy, radius) and a shape.
 * Returns null, or { nx, ny, depth } : the normal points from the shape
 * toward the circle, depth is the overlap.
 */
export function circleContact(cx, cy, radius, shape) {
	if (shape.kind === "circle") {
		const dx = cx - shape.x;
		const dy = cy - shape.y;
		const d2 = dx * dx + dy * dy;
		const r = radius + shape.r;
		if (d2 >= r * r)
			return null;
		const d = Math.sqrt(d2);
		if (d < 1e-6)
			return { nx: 0, ny: -1, depth: r };
		return { nx: dx / d, ny: dy / d, depth: r - d };
	}

	if (shape.kind === "arc")
		return arcContact(cx, cy, radius, shape);

	// box : closest point of the box to the centre
	const px = Math.max(shape.x, Math.min(cx, shape.x + shape.w));
	const py = Math.max(shape.y, Math.min(cy, shape.y + shape.h));
	const dx = cx - px;
	const dy = cy - py;
	const d2 = dx * dx + dy * dy;

	if (d2 > 1e-9) {
		if (d2 >= radius * radius)
			return null;
		const d = Math.sqrt(d2);
		return { nx: dx / d, ny: dy / d, depth: radius - d };
	}

	// the centre is inside the box : push out through the nearest side
	const left = cx - shape.x;
	const right = shape.x + shape.w - cx;
	const top = cy - shape.y;
	const bottom = shape.y + shape.h - cy;
	const m = Math.min(left, right, top, bottom);
	if (m === left)
		return { nx: -1, ny: 0, depth: left + radius };
	if (m === right)
		return { nx: 1, ny: 0, depth: right + radius };
	if (m === top)
		return { nx: 0, ny: -1, depth: top + radius };
	return { nx: 0, ny: 1, depth: bottom + radius };
}

/**
 * A rounded inside corner : { kind: "arc", x, y, r, sx, sy }. In the quarter
 * of plane on the (sx, sy) side of the centre, the circle must stay within
 * r of the centre.
 */
function arcContact(cx, cy, radius, arc) {
	const dx = cx - arc.x;
	const dy = cy - arc.y;
	if (dx * arc.sx <= 0 || dy * arc.sy <= 0)
		return null;
	const d = Math.hypot(dx, dy);
	const max = arc.r - radius;
	if (d <= max)
		return null;
	return { nx: -dx / d, ny: -dy / d, depth: d - max };
}

/** Does a circle overlap a segment ? (the zapper beams) */
export function circleTouchesSegment(cx, cy, radius, x1, y1, x2, y2) {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const len2 = dx * dx + dy * dy;
	let t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
	t = Math.max(0, Math.min(1, t));
	const px = x1 + dx * t - cx;
	const py = y1 + dy * t - cy;
	return px * px + py * py < radius * radius;
}

/**
 * Resolves the collisions of the ball with a list of colliders :
 * pushes it out of each shape it overlaps, and bounces it off the shapes it
 * moves toward. Returns the number of contacts.
 *
 * The bounce reflects the velocity on the contact normal ; the new speed is
 * max(speed x coef, min) : bumpers push the ball away harder than it came.
 */
export function collideBall(ball, colliders, game) {
	let contacts = 0;
	for (const c of colliders) {
		if (!c.solid || !c.shape)
			continue;
		const hit = circleContact(ball.x, ball.y, ball.radius, c.shape);
		if (!hit)
			continue;
		contacts++;

		ball.x += hit.nx * hit.depth;
		ball.y += hit.ny * hit.depth;

		const vn = ball.vx * hit.nx + ball.vy * hit.ny;
		if (vn >= 0)
			continue;   // already moving away

		const speed = Math.hypot(ball.vx, ball.vy);
		let rx = ball.vx - 2 * vn * hit.nx;
		let ry = ball.vy - 2 * vn * hit.ny;
		const rlen = Math.hypot(rx, ry) || 1;
		const bounce = c.bounce || DEFAULT_BOUNCE;
		const out = Math.max(speed * bounce.coef, bounce.min);
		ball.vx = rx / rlen * out;
		ball.vy = ry / rlen * out;

		if (c.onHit)
			c.onHit(game, { x: ball.x - hit.nx * ball.radius, y: ball.y - hit.ny * ball.radius, nx: hit.nx, ny: hit.ny, speed });
	}
	return contacts;
}

const DEFAULT_BOUNCE = { coef: 1, min: 0 };

/**
 * The bounce of each kind of obstacle, from the original game
 * (the original minimum speeds were in pixels per frame, x 40 here).
 */
export const BOUNCE = {
	border: { coef: 1.1, min: 160 },
	bumper: { coef: 1.5, min: 800 },
	clock: { coef: 1.5, min: 600 },
	death: { coef: 1.2, min: 200 },
	magnet: { coef: 1.0, min: 200 },
	ghost: { coef: 3.0, min: 600 },
	block: { coef: 1.2, min: 0 },
	zapper: { coef: 1.1, min: 400 },
	itemBox: { coef: 0.1, min: 0 },
	boss: { coef: 1.2, min: 300 }
};
