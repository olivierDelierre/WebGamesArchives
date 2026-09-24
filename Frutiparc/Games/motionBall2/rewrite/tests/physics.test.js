/**
 * The collision functions of src/game/physics.js.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { circleContact, circleTouchesSegment, collideBall, BOUNCE } from "../src/game/physics.js";

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("circle against circle", () => {
	assert.equal(circleContact(0, 0, 8, { kind: "circle", x: 30, y: 0, r: 20 }), null);
	const c = circleContact(0, 0, 8, { kind: "circle", x: 20, y: 0, r: 20 });
	assert.ok(near(c.nx, -1) && near(c.ny, 0) && near(c.depth, 8));
});

test("circle against box : side, corner, inside", () => {
	const box = { kind: "box", x: 10, y: 10, w: 40, h: 40 };
	const side = circleContact(5, 30, 8, box);
	assert.ok(near(side.nx, -1) && near(side.depth, 3));
	const corner = circleContact(5, 5, 8, box);
	assert.ok(near(corner.nx, -Math.SQRT1_2) && near(corner.ny, -Math.SQRT1_2));
	assert.equal(circleContact(0, 0, 8, box), null);
	const inside = circleContact(12, 30, 8, box);
	assert.ok(near(inside.nx, -1) && near(inside.depth, 10));
});

test("rounded inside corner", () => {
	const arc = { kind: "arc", x: 47, y: 47, r: 22, sx: -1, sy: -1 };
	assert.equal(circleContact(40, 40, 8, arc), null);      // well inside
	assert.equal(circleContact(60, 30, 8, arc), null);      // not in the corner quarter
	const c = circleContact(30, 30, 8, arc);                // in the corner, too far
	assert.ok(c && c.nx > 0 && c.ny > 0 && c.depth > 0);
});

test("segment", () => {
	assert.ok(circleTouchesSegment(50, 5, 8, 0, 0, 100, 0));
	assert.ok(!circleTouchesSegment(50, 9, 8, 0, 0, 100, 0));
	assert.ok(!circleTouchesSegment(110, 0, 8, 0, 0, 100, 0));
});

test("bounce : reflection and minimum speed", () => {
	const hits = [];
	const wall = { shape: { kind: "box", x: 100, y: 0, w: 50, h: 200 }, solid: true, bounce: BOUNCE.bumper, onHit: (g, c) => hits.push(c) };
	const ball = { x: 95, y: 100, radius: 8, vx: 100, vy: 50 };
	assert.equal(collideBall(ball, [wall], null), 1);
	assert.ok(ball.x <= 92 + 1e-9, "pushed out");
	assert.ok(ball.vx < 0 && ball.vy > 0, "reflected");
	assert.ok(near(Math.hypot(ball.vx, ball.vy), BOUNCE.bumper.min), "at least the minimum speed");
	assert.equal(hits.length, 1);

	// moving away : pushed out, no bounce
	const away = { x: 95, y: 100, radius: 8, vx: -100, vy: 0 };
	collideBall(away, [wall], null);
	assert.equal(away.vx, -100);
});
