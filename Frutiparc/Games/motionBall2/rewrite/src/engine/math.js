/**
 * Small math helpers.
 */

import { ORIGINAL_FPS } from "../config.js";

export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => v < min ? min : v > max ? max : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));

/** Signed difference b - a between two angles, in ]-PI, PI]. */
export function angleDiff(a, b) {
	let d = (b - a) % TAU;
	if (d > Math.PI)
		d -= TAU;
	else if (d <= -Math.PI)
		d += TAU;
	return d;
}

/** Moves an angle toward a target by at most `step` radians. */
export function approachAngle(a, target, step) {
	const d = angleDiff(a, target);
	return Math.abs(d) <= step ? target : a + Math.sign(d) * step;
}

/**
 * Frame-rate independent version of the original "value *= k every frame" :
 * the factor to apply for a time step of dt seconds.
 */
export const decay = (k, dt) => Math.pow(k, dt * ORIGINAL_FPS);

/**
 * Frame-rate independent version of "x += (target - x) * k every frame"
 * (exponential smoothing).
 */
export const smooth = (x, target, k, dt) => target + (x - target) * decay(1 - k, dt);

/** Random helpers. */
export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = n => Math.floor(Math.random() * n);
export const chance = p => Math.random() < p;
export const pick = list => list[randInt(list.length)];

/** Random index, weighted by the values of the array. */
export function weightedIndex(weights) {
	let total = 0;
	for (const w of weights)
		total += w;
	let r = Math.random() * total;
	for (let i = 0; i < weights.length; i++) {
		r -= weights[i];
		if (r < 0)
			return i;
	}
	return weights.length - 1;
}

/**
 * The per-frame random events of the original ("1 chance in N every frame")
 * as a probability for a time step dt.
 */
export const perFrameChance = (n, dt) => 1 - Math.pow(1 - 1 / n, dt * ORIGINAL_FPS);

/** Easing curves, t in [0, 1]. */
export const ease = {
	linear: t => t,
	inQuad: t => t * t,
	outQuad: t => t * (2 - t),
	inOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
	outBack: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
	outElastic: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * TAU / 3) + 1
};

/** Formats a number of seconds as m:ss or mm:ss:cc. */
export function formatTime(seconds, withHundredths) {
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	const sec = Math.floor(s) % 60;
	const pad = n => String(n).padStart(2, "0");
	if (withHundredths)
		return pad(m) + ":" + pad(sec) + ":" + pad(Math.floor(s * 100) % 100);
	return m + ":" + pad(sec);
}
