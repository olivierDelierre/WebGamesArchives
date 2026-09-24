/**
 * Drawing of the converted Flash content : shapes (solid, gradient and bitmap
 * fills, strokes), texts, colour transforms and masks ; and the maths of the
 * motion tweens.
 *
 * Canvas has no per-drawing colour transform (Flash's Color.setTransform) :
 * `withColor` draws into an offscreen canvas and transforms it there
 * (multiply the channels, add the offsets). Only a few effects use it (hit
 * flashes, tints) ; a transform of the alpha alone just sets globalAlpha.
 */

import { FONT } from "../draw.js";

/** Flash gradients are defined on a square of -819.2 .. 819.2 pixels. */
const GRADIENT_SIZE = 819.2;

// ----- shapes -----

export function drawShape(ctx, lib, shape) {
	if (!shape)
		return;
	for (const f of shape.fills) {
		const path = lib.path(f.d);
		if (!path)
			continue;
		if (f.t === "solid") {
			ctx.fillStyle = f.c;
			ctx.fill(path, "evenodd");
		} else {
			// gradient / bitmap : clipped to the shape, in the space of the fill
			const style = fillStyle(ctx, lib, f);
			if (!style)
				continue;
			ctx.save();
			ctx.clip(path, "evenodd");
			ctx.transform(f.m[0], f.m[1], f.m[2], f.m[3], f.m[4], f.m[5]);
			ctx.fillStyle = style;
			ctx.fillRect(-1e5, -1e5, 2e5, 2e5);
			ctx.restore();
		}
	}
	for (const s of shape.strokes) {
		const path = lib.path(s.d);
		if (!path)
			continue;
		ctx.lineWidth = Math.max(0.5, s.w);
		ctx.lineCap = s.cap;
		ctx.lineJoin = s.join;
		ctx.strokeStyle = s.fill.t === "solid" ? s.fill.c : "#000";
		ctx.stroke(path);
	}
}

/** The canvas style of a gradient or bitmap fill (cached on the fill). */
function fillStyle(ctx, lib, f) {
	if (f._style)
		return f._style;
	let style = null;
	if (f.t === "linear") {
		style = ctx.createLinearGradient(-GRADIENT_SIZE, 0, GRADIENT_SIZE, 0);
	} else if (f.t === "radial") {
		style = ctx.createRadialGradient(f.focal * GRADIENT_SIZE, 0, 0, 0, 0, GRADIENT_SIZE);
	} else if (f.t === "bitmap") {
		const b = lib.bitmap(f.b);
		if (!b || !b.img || !b.img.complete)
			return null;
		// (a bitmap fill matrix is in twips per pixel)
		const m = f.m;
		f.m = [m[0] / 20, m[1] / 20, m[2] / 20, m[3] / 20, m[4], m[5]];
		style = ctx.createPattern(b.img, "repeat");
	}
	if (style && f.stops) {
		for (const [ratio, color] of f.stops)
			style.addColorStop(Math.max(0, Math.min(1, ratio)), color);
	}
	f._style = style;
	return style;
}

// ----- texts -----

/** A text field : `value` replaces the text of a dynamic field. */
export function drawText(ctx, el, value) {
	const runs = el.runs;
	if (!runs.length)
		return;
	const r = runs[0];
	const str = value !== null && value !== undefined ? String(value) : runs.map(x => x.s).join("");
	ctx.font = (r.italic ? "italic " : "") + (r.bold ? "bold " : "") + r.size + "px " + FONT;
	ctx.fillStyle = r.color;
	ctx.textBaseline = "alphabetic";
	const align = r.align === "center" ? "center" : r.align === "right" ? "right" : "left";
	ctx.textAlign = align;
	const x = (el.left || 0) + (align === "center" ? el.w / 2 : align === "right" ? el.w : 0) + 2;
	const lineHeight = r.size * 1.15 + (r.spacing || 0);
	str.split("\n").forEach((line, i) => ctx.fillText(line, x, 2 + r.size * 0.95 + i * lineHeight));
}

// ----- colour transforms -----

export const IDENTITY_COLOR = { am: 1, rm: 1, gm: 1, bm: 1, ao: 0, ro: 0, go: 0, bo: 0 };

export function isIdentityColor(c) {
	return !c || (c.am === 1 && c.rm === 1 && c.gm === 1 && c.bm === 1 && !c.ao && !c.ro && !c.go && !c.bo);
}

const isAlphaOnly = c => c.rm === 1 && c.gm === 1 && c.bm === 1 && !c.ro && !c.go && !c.bo;

/** The transform of a child inside a parent transform. */
export function combineColor(parent, child) {
	if (!parent)
		return child;
	if (!child)
		return parent;
	return {
		am: parent.am * child.am, rm: parent.rm * child.rm, gm: parent.gm * child.gm, bm: parent.bm * child.bm,
		ao: parent.am * child.ao + parent.ao, ro: parent.rm * child.ro + parent.ro,
		go: parent.gm * child.go + parent.go, bo: parent.bm * child.bo + parent.bo
	};
}

export function lerpColor(a, b, t) {
	a = a || IDENTITY_COLOR;
	b = b || IDENTITY_COLOR;
	const out = {};
	for (const k of Object.keys(IDENTITY_COLOR))
		out[k] = a[k] + (b[k] - a[k]) * t;
	return out;
}

// offscreen canvases, one per nesting level of colour transforms ; they only
// grow, and each use works in their top-left `w` x `h` corner
const pool = [];
let poolDepth = 0;

function offscreen(w, h) {
	let c = pool[poolDepth];
	if (!c) {
		c = document.createElement("canvas");
		pool[poolDepth] = c;
	}
	if (c.width < w || c.height < h) {
		c.width = Math.max(c.width, w);
		c.height = Math.max(c.height, h);
	}
	poolDepth++;
	return c;
}

/** The rectangle of the canvas (device pixels) covered by local `bounds` under ctx's transform. */
function deviceRect(ctx, t, bounds) {
	const w = ctx.canvas.width;
	const h = ctx.canvas.height;
	if (!bounds)
		return { x: 0, y: 0, w, h };
	const [x0, y0, x1, y1] = bounds;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
		const dx = t.a * x + t.c * y + t.e;
		const dy = t.b * x + t.d * y + t.f;
		minX = Math.min(minX, dx);
		minY = Math.min(minY, dy);
		maxX = Math.max(maxX, dx);
		maxY = Math.max(maxY, dy);
	}
	// (a margin for the strokes and the antialiasing)
	const rx = Math.max(0, Math.floor(minX) - 2);
	const ry = Math.max(0, Math.floor(minY) - 2);
	return { x: rx, y: ry, w: Math.min(w, Math.ceil(maxX) + 2) - rx, h: Math.min(h, Math.ceil(maxY) + 2) - ry };
}

/**
 * Draws `draw(ctx)` with a colour transform : new = colour x multiplier +
 * offset, per channel. The drawing goes through an offscreen canvas, only as
 * big as `bounds` (the local bounds of what is drawn ; the whole canvas
 * without them).
 */
export function withColor(ctx, c, draw, bounds = null) {
	const alpha = Math.max(0, Math.min(1, c.am + c.ao / 255));
	const t = typeof document !== "undefined" && ctx.getTransform ? ctx.getTransform() : null;
	if (isAlphaOnly(c) || !t) {
		const a = ctx.globalAlpha;
		ctx.globalAlpha = a * alpha;
		draw(ctx);
		ctx.globalAlpha = a;
		return;
	}

	const r = deviceRect(ctx, t, bounds);
	if (r.w <= 0 || r.h <= 0)
		return;
	const w = r.w;
	const h = r.h;
	const layer = offscreen(w, h);
	const lc = layer.getContext("2d");
	lc.setTransform(1, 0, 0, 1, 0, 0);
	lc.globalCompositeOperation = "source-over";
	lc.globalAlpha = 1;
	lc.clearRect(0, 0, w, h);
	lc.setTransform(t.a, t.b, t.c, t.d, t.e - r.x, t.f - r.y);
	draw(lc);
	lc.setTransform(1, 0, 0, 1, 0, 0);

	// a silhouette of what is drawn, in a colour
	const silhouette = (sc, color) => {
		sc.setTransform(1, 0, 0, 1, 0, 0);
		sc.globalCompositeOperation = "copy";
		sc.drawImage(layer, 0, 0, w, h, 0, 0, w, h);
		sc.globalCompositeOperation = "source-in";
		sc.fillStyle = color;
		sc.fillRect(0, 0, w, h);
	};
	const channel = v => Math.round(Math.max(0, Math.min(255, v)));

	// multipliers : multiply, then restore the transparency
	if (c.rm < 1 || c.gm < 1 || c.bm < 1) {
		const copy = offscreen(w, h);
		const cc = copy.getContext("2d");
		cc.setTransform(1, 0, 0, 1, 0, 0);
		cc.globalCompositeOperation = "copy";
		cc.drawImage(layer, 0, 0, w, h, 0, 0, w, h);
		lc.globalCompositeOperation = "multiply";
		lc.fillStyle = "rgb(" + [c.rm, c.gm, c.bm].map(v => channel(v * 255)).join(",") + ")";
		lc.fillRect(0, 0, w, h);
		lc.globalCompositeOperation = "destination-in";
		lc.drawImage(copy, 0, 0, w, h, 0, 0, w, h);
		poolDepth--;
	}

	// positive offsets : add a silhouette of the offset colour
	const ro = Math.max(0, c.ro);
	const go = Math.max(0, c.go);
	const bo = Math.max(0, c.bo);
	if (ro || go || bo) {
		const sil = offscreen(w, h);
		silhouette(sil.getContext("2d"), "rgb(" + [ro, go, bo].map(channel).join(",") + ")");
		lc.globalCompositeOperation = "lighter";
		lc.drawImage(sil, 0, 0, w, h, 0, 0, w, h);
		poolDepth--;
	}

	// negative offsets : c - k = 255 - ((255 - c) + k), inverting with a
	// white silhouette ("difference") around the addition
	const rn = Math.max(0, -c.ro);
	const gn = Math.max(0, -c.go);
	const bn = Math.max(0, -c.bo);
	if (rn || gn || bn) {
		const sil = offscreen(w, h);
		const sc = sil.getContext("2d");
		const invert = () => {
			silhouette(sc, "#fff");
			lc.globalCompositeOperation = "difference";
			lc.drawImage(sil, 0, 0, w, h, 0, 0, w, h);
		};
		invert();
		silhouette(sc, "rgb(" + [rn, gn, bn].map(channel).join(",") + ")");
		lc.globalCompositeOperation = "lighter";
		lc.drawImage(sil, 0, 0, w, h, 0, 0, w, h);
		invert();
		poolDepth--;
	}

	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.globalAlpha *= alpha;
	ctx.drawImage(layer, 0, 0, w, h, r.x, r.y, w, h);
	ctx.restore();
	poolDepth--;
}

/** Union of rectangles [x0, y0, x1, y1] ; `m` transforms `b` first. */
export function unionBounds(acc, b, m) {
	if (!b)
		return acc;
	let r = b;
	if (m) {
		const [a, bb, c, d, tx, ty] = m;
		const xs = [];
		const ys = [];
		for (const [x, y] of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]]) {
			xs.push(a * x + c * y + tx);
			ys.push(bb * x + d * y + ty);
		}
		r = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
	}
	return acc ? [Math.min(acc[0], r[0]), Math.min(acc[1], r[1]), Math.max(acc[2], r[2]), Math.max(acc[3], r[3])] : r;
}

// ----- masks -----

/**
 * Clips ctx to the shapes of a mask layer's elements (the shapes, and the
 * shapes inside the symbols of the mask, at their current frame).
 */
export function clipToMask(ctx, lib, els, clip, maskLayerIndex) {
	if (typeof Path2D === "undefined" || typeof DOMMatrix === "undefined")
		return;
	const region = new Path2D();
	const add = (elements, matrix, owner, layerIndex) => {
		elements.forEach((el, ei) => {
			const m = el.m ? matrix.multiply(new DOMMatrix(el.m)) : matrix;
			if (el.t === "shape") {
				const shape = lib.shape(el.id);
				for (const f of shape.fills) {
					const p = lib.path(f.d);
					if (p)
						region.addPath(p, m);
				}
			} else if (el.t === "sym" && owner) {
				const c = owner.children.get(layerIndex + ":" + ei + ":" + el.s);
				if (!c)
					return;
				c.symbol.layers.forEach((l, li) => {
					const cur = c.layerElements(l);
					if (cur && !l.mask)
						add(cur.els, m, c, li);
				});
			}
		});
	};
	add(els, new DOMMatrix(), clip, maskLayerIndex);
	ctx.clip(region, "nonzero");
}

// ----- tweens -----

/** Interpolates two matrices like Flash : scale, rotation / skew and position separately. */
export function interpolateMatrix(a, b, t) {
	a = a || [1, 0, 0, 1, 0, 0];
	b = b || [1, 0, 0, 1, 0, 0];
	const dec = m => ({
		sx: Math.hypot(m[0], m[1]),
		sy: Math.hypot(m[2], m[3]),
		r1: Math.atan2(m[1], m[0]),
		r2: Math.atan2(-m[2], m[3])
	});
	const A = dec(a);
	const B = dec(b);
	const angle = (x, y) => {
		let d = y - x;
		while (d > Math.PI)
			d -= 2 * Math.PI;
		while (d < -Math.PI)
			d += 2 * Math.PI;
		return x + d * t;
	};
	const sx = A.sx + (B.sx - A.sx) * t;
	const sy = A.sy + (B.sy - A.sy) * t;
	const r1 = angle(A.r1, B.r1);
	const r2 = angle(A.r2, B.r2);
	return [
		sx * Math.cos(r1), sx * Math.sin(r1),
		-sy * Math.sin(r2), sy * Math.cos(r2),
		a[4] + (b[4] - a[4]) * t,
		a[5] + (b[5] - a[5]) * t
	];
}
