#!/usr/bin/env node
/**
 * Converts the XFL exports of the original .fla files (../xfl/<name>/) into
 * a library the game draws at run time (src/gfx/xfl/) :
 *
 *   assets/xfl/<name>.json      symbols, shapes, bitmaps index
 *   assets/xfl/<name>/*.png|jpg the bitmaps
 *
 * Usage : npm run xfl        (converts mb2 and title)
 *
 * XFL in brief (see docs/XFL.md for more) :
 *   - DOMDocument.xml lists the library ; each symbol is LIBRARY/<name>.xml ;
 *   - a symbol has a timeline : layers (top first) of frames ; a keyframe
 *     holds elements : shapes, symbol instances, bitmaps, texts, groups ;
 *   - shapes are lists of edges with a fill on each side (fillStyle0 on the
 *     left, fillStyle1 on the right) : the fills are rebuilt by chaining the
 *     edges of each fill into closed loops ;
 *   - coordinates in edges are twips (1/20 pixel), as decimals or "#hex.hh" ;
 *   - bitmaps are in bin/*.dat : JPEG files, or zlib-compressed ARGB.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseXml, kids, child } from "./xml.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const XFL_DIR = path.join(ROOT, "..", "xfl");
const OUT_DIR = path.join(ROOT, "assets", "xfl");

const round = v => Math.round(v * 100) / 100;

// ----- numbers, colours, matrices -----

/** A number of an edge string : decimal, or "#HEX.HH" (signed 24.8 fixed point). */
function edgeNumber(s) {
	if (s[0] !== "#")
		return parseFloat(s);
	const [int, frac = "0"] = s.slice(1).split(".");
	let v = parseInt(int, 16);
	if (v >= 0x800000)
		v -= 0x1000000;
	return v + parseInt(frac, 16) / 256;
}

function rgba(color = "#000000", alpha = 1) {
	const n = parseInt(color.slice(1), 16);
	const a = Math.round(alpha * 1000) / 1000;
	return a >= 1
		? "#" + color.slice(1).toLowerCase()
		: "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
}

/** [a, b, c, d, tx, ty] of a <matrix> child (identity when missing). */
function matrixOf(el) {
	const m = child(el, "matrix/Matrix");
	if (!m)
		return null;
	const v = k => m.attrs[k] !== undefined ? parseFloat(m.attrs[k]) : null;
	return [v("a") ?? 1, v("b") ?? 0, v("c") ?? 0, v("d") ?? 1, round(v("tx") ?? 0), round(v("ty") ?? 0)];
}

/**
 * A colour transform, as multipliers and offsets :
 * { am, rm, gm, bm (0..1), ao, ro, go, bo (-255..255) }.
 */
function colorOf(el) {
	const c = child(el, "color/Color");
	if (!c)
		return null;
	const a = c.attrs;
	const f = (k, d) => a[k] !== undefined ? parseFloat(a[k]) : d;
	const t = { am: f("alphaMultiplier", 1), rm: f("redMultiplier", 1), gm: f("greenMultiplier", 1), bm: f("blueMultiplier", 1),
		ao: f("alphaOffset", 0), ro: f("redOffset", 0), go: f("greenOffset", 0), bo: f("blueOffset", 0) };
	if (a.tintColor !== undefined) {
		const k = f("tintMultiplier", 0);
		const n = parseInt(a.tintColor.slice(1), 16);
		t.rm = t.gm = t.bm = 1 - k;
		t.ro = (n >> 16 & 255) * k;
		t.go = (n >> 8 & 255) * k;
		t.bo = (n & 255) * k;
	}
	if (a.brightness !== undefined) {
		const b = f("brightness", 0);
		t.rm = t.gm = t.bm = 1 - Math.abs(b);
		t.ro = t.go = t.bo = b > 0 ? 255 * b : 0;
	}
	for (const k of Object.keys(t))
		t[k] = round(t[k]);
	return t;
}

// ----- shapes -----

/** Parses an "edges" string into segments { x0, y0, x1, y1, cx?, cy? } (pixels). */
function parseEdges(str) {
	const tokens = str.replace(/S\d/g, " ").match(/[!|/\[\]]|[^\s!|/\[\]]+/g) || [];
	const segs = [];
	let x = 0;
	let y = 0;
	let i = 0;
	const num = () => edgeNumber(tokens[i++]) / 20;
	while (i < tokens.length) {
		const cmd = tokens[i++];
		if (cmd === "!") {
			x = num();
			y = num();
		} else if (cmd === "|" || cmd === "/") {
			const nx = num();
			const ny = num();
			segs.push({ x0: x, y0: y, x1: nx, y1: ny });
			x = nx;
			y = ny;
		} else if (cmd === "[" || cmd === "]") {
			const cx = num();
			const cy = num();
			const nx = num();
			const ny = num();
			segs.push({ x0: x, y0: y, cx, cy, x1: nx, y1: ny });
			x = nx;
			y = ny;
		}
	}
	return segs;
}

const reverse = s => s.cx === undefined
	? { x0: s.x1, y0: s.y1, x1: s.x0, y1: s.y0 }
	: { x0: s.x1, y0: s.y1, cx: s.cx, cy: s.cy, x1: s.x0, y1: s.y0 };

const key = (x, y) => Math.round(x * 20) + "," + Math.round(y * 20);

/** Chains segments into closed loops ; returns an SVG path string. */
function loops(segs) {
	const byStart = new Map();
	for (const s of segs) {
		const k = key(s.x0, s.y0);
		if (!byStart.has(k))
			byStart.set(k, []);
		byStart.get(k).push(s);
	}
	const used = new Set();
	let d = "";
	for (const first of segs) {
		if (used.has(first))
			continue;
		d += "M" + round(first.x0) + " " + round(first.y0);
		let s = first;
		const startKey = key(first.x0, first.y0);
		while (s) {
			used.add(s);
			d += s.cx === undefined
				? "L" + round(s.x1) + " " + round(s.y1)
				: "Q" + round(s.cx) + " " + round(s.cy) + " " + round(s.x1) + " " + round(s.y1);
			const k = key(s.x1, s.y1);
			if (k === startKey)
				break;
			const next = (byStart.get(k) || []).find(n => !used.has(n));
			s = next || null;
		}
		d += "Z";
	}
	return d;
}

/** An open path of segments (for the strokes). */
function strokePath(segs) {
	let d = "";
	let px = null;
	let py = null;
	for (const s of segs) {
		if (px === null || Math.abs(px - s.x0) > 0.01 || Math.abs(py - s.y0) > 0.01)
			d += "M" + round(s.x0) + " " + round(s.y0);
		d += s.cx === undefined
			? "L" + round(s.x1) + " " + round(s.y1)
			: "Q" + round(s.cx) + " " + round(s.cy) + " " + round(s.x1) + " " + round(s.y1);
		px = s.x1;
		py = s.y1;
	}
	return d;
}

function fillOf(style, ctx) {
	const solid = child(style, "SolidColor");
	if (solid)
		return { t: "solid", c: rgba(solid.attrs.color, solid.attrs.alpha !== undefined ? parseFloat(solid.attrs.alpha) : 1) };
	for (const kind of ["LinearGradient", "RadialGradient"]) {
		const g = child(style, kind);
		if (!g)
			continue;
		return {
			t: kind === "LinearGradient" ? "linear" : "radial",
			m: matrixOf(g) || [1, 0, 0, 1, 0, 0],
			focal: g.attrs.focalPointRatio ? parseFloat(g.attrs.focalPointRatio) : 0,
			stops: kids(g, "GradientEntry").map(e => [
				round(parseFloat(e.attrs.ratio || 0)),
				rgba(e.attrs.color, e.attrs.alpha !== undefined ? parseFloat(e.attrs.alpha) : 1)
			])
		};
	}
	const bmp = child(style, "BitmapFill");
	if (bmp) {
		ctx.useBitmap(bmp.attrs.bitmapPath);
		return { t: "bitmap", b: bmp.attrs.bitmapPath, m: matrixOf(bmp) || [1, 0, 0, 1, 0, 0] };
	}
	return { t: "solid", c: "#000" };
}

/** Converts a DOMShape (or a MorphShape's start) into { fills, paths, strokes }. */
function convertShape(el, ctx) {
	const fills = kids(child(el, "fills"), "FillStyle").map(f => ({ index: +f.attrs.index, fill: fillOf(f, ctx) }));
	const strokes = kids(child(el, "strokes"), "StrokeStyle").map(s => {
		const st = s.children[0];
		const f = st ? child(st, "fill") : null;
		return {
			index: +s.attrs.index,
			w: st ? parseFloat(st.attrs.weight || 1) : 1,
			fill: f ? fillOf(f, ctx) : { t: "solid", c: "#000" },
			cap: st && st.attrs.caps === "none" ? "butt" : st && st.attrs.caps === "square" ? "square" : "round",
			join: st && st.attrs.joints === "miter" ? "miter" : st && st.attrs.joints === "bevel" ? "bevel" : "round"
		};
	});

	const byFill = new Map();
	const byStroke = new Map();
	for (const e of kids(child(el, "edges"), "Edge")) {
		if (!e.attrs.edges)
			continue;
		const segs = parseEdges(e.attrs.edges);
		const f0 = e.attrs.fillStyle0 ? +e.attrs.fillStyle0 : 0;
		const f1 = e.attrs.fillStyle1 ? +e.attrs.fillStyle1 : 0;
		const st = e.attrs.strokeStyle ? +e.attrs.strokeStyle : 0;
		const add = (map, k, list) => {
			if (!map.has(k))
				map.set(k, []);
			map.get(k).push(...list);
		};
		if (f1)
			add(byFill, f1, segs);
		if (f0)
			add(byFill, f0, segs.map(reverse).reverse());
		if (st)
			add(byStroke, st, segs);
	}

	const out = { fills: [], strokes: [], bounds: null };
	const grow = (x, y, pad = 0) => {
		const b = out.bounds || (out.bounds = [Infinity, Infinity, -Infinity, -Infinity]);
		b[0] = Math.min(b[0], x - pad);
		b[1] = Math.min(b[1], y - pad);
		b[2] = Math.max(b[2], x + pad);
		b[3] = Math.max(b[3], y + pad);
	};
	const growSegments = (segs, pad) => {
		for (const sg of segs) {
			grow(sg.x0, sg.y0, pad);
			grow(sg.x1, sg.y1, pad);
			if (sg.cx !== undefined) {
				// the extremum of the curve on each axis
				for (const [a, c, b, axis] of [[sg.x0, sg.cx, sg.x1, 0], [sg.y0, sg.cy, sg.y1, 1]]) {
					const den = a - 2 * c + b;
					const t = den ? (a - c) / den : -1;
					if (t > 0 && t < 1) {
						const v = (1 - t) * (1 - t) * a + 2 * t * (1 - t) * c + t * t * b;
						if (axis === 0)
							grow(v, sg.y0, pad);
						else
							grow(sg.x0, v, pad);
					}
				}
			}
		}
	};
	for (const segs of byFill.values())
		growSegments(segs, 0);
	for (const [k, segs] of byStroke.entries()) {
		const st = strokes.find(x => x.index === k);
		growSegments(segs, st ? st.w / 2 : 0);
	}
	if (out.bounds)
		out.bounds = out.bounds.map(round);
	for (const f of fills) {
		const segs = byFill.get(f.index);
		if (segs && segs.length)
			out.fills.push({ ...f.fill, d: loops(segs) });
	}
	for (const s of strokes) {
		const segs = byStroke.get(s.index);
		if (segs && segs.length)
			out.strokes.push({ w: s.w, fill: s.fill, cap: s.cap, join: s.join, d: strokePath(segs) });
	}
	return out;
}

// ----- frame scripts -----

/**
 * Translates the frame scripts the renderer understands into operations ;
 * the others are kept as text (`raw`) and listed in the report.
 */
function translateScript(src, report, where) {
	const ops = [];
	let s = src.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
	const rules = [
		[/^stop\(\);?/, () => ["stop"]],
		[/^play\(\);?/, () => ["play"]],
		[/^(gotoAndPlay|gotoAndStop)\((\d+)\);?/, m => ["goto", +m[2] - 1, m[1] === "gotoAndPlay"]],
		[/^(gotoAndPlay|gotoAndStop)\("([^"]+)"\);?/, m => ["goto", m[2], m[1] === "gotoAndPlay"]],
		[/^(gotoAndPlay|gotoAndStop)\(_currentframe ?- ?(\d+)\);?/, m => ["gotoRel", -(+m[2]), m[1] === "gotoAndPlay"]],
		[/^gotoAndStop\(random\(_totalframes\) ?\+ ?1\);?/, () => ["randomFrame"]],
		[/^(this\.)?removeMovieClip\((this|"")?\);?/, () => ["remove"]],
		[/^_parent\.removeMovieClip\(\);?/, () => ["removeParent"]],
		[/^(_parent\.)?(\w+)\(\);?/, m => ["call", m[2]]],
		// "wait a random / fixed number of frames" loops
		[/^compt ?= ?random\((\d+)\) ?if ?\(compt-- ?> ?0\) ?gotoAndPlay\(_currentframe-1\);?/, m => ["waitRandom", +m[1]]],
		[/^compt ?= ?(\d+) ?if ?\(compt-- ?> ?0\) ?gotoAndPlay\(_currentframe-2\);?/, m => ["repeat", +m[1], -2]],
		[/^if ?\(random\(100\) ?> ?0\) ?\{ ?stop\(\);? ?\}/, () => ["stopUnlessRandom", 100]],
		[/^if ?\(flLoop\) ?gotoAndPlay\(1\);?/, () => ["loopIf", "flLoop", 0]],
		[/^if ?\(flLoopv\) ?gotoAndPlay\("(\w+)"\);?/, m => ["loopIf", "flLoopv", m[1]]],
		[/^this\._yscale ?= ?\(\(random\(2\) ?\* ?2\) ?- ?1\) ?\* ?100;?/, () => ["randomFlipY"]],
		[/^_rotation ?\+= ?random\((\d+)\);?/, m => ["randomRotate", +m[1]]],
		[/^(\w+)\.play\(\);?/, m => ["childPlay", m[1]]],
		[/^(\w+)\.gotoAndPlay\((\d+)\);?/, m => ["childGoto", m[1], +m[2] - 1]],
		[/^flOpen ?= ?true;?/, () => ["set", "flOpen", true]],
		// frame counters spread over several frames : "compt = N" ... "if (compt-- > 0) go back"
		[/^compt ?= ?(\d+);?/, m => ["counter", +m[1]]],
		[/^compt ?= ?random\((\d+)\);?/, m => ["counterRandom", +m[1]]],
		[/^if ?\(compt-- ?> ?0\) ?gotoAndPlay\(_currentframe ?- ?(\d+)\);?/, m => ["countdown", -(+m[1])]],
		[/^compt ?-= ?(_global\.)?tmod;? ?if ?\( ?compt ?> ?0 ?\) ?gotoAndPlay\(_currentframe ?- ?(\d+)\);?/, m => ["countdown", -(+m[2])]],
		[/^if ?\(random\((\d+)\) ?> ?0\) ?\{ ?gotoAndPlay\(_currentframe ?- ?(\d+)\);? ?\}/, m => ["loopUnlessRandom", +m[1], -(+m[2])]],
		// properties the game code sets itself
		[/^\w+\._[xy]scale ?= ?[\d.]+;?/, () => ["noop"]],
		[/^control\.(\w+) ?= ?true;?/, m => ["call", m[1]]],
		[/^_parent\.(\w+) ?= ?true;?/, m => ["setParent", m[1], true]]
	];
	while (s.length) {
		let matched = false;
		for (const [re, fn] of rules) {
			const m = re.exec(s);
			if (m) {
				ops.push(fn(m));
				s = s.slice(m[0].length).trim();
				matched = true;
				break;
			}
		}
		if (!matched) {
			report.scripts.push(where + " : " + s.slice(0, 80));
			return { ops, raw: src.trim() };
		}
	}
	return { ops };
}

// ----- timelines -----

function convertElements(els, ctx, out) {
	for (const el of els) {
		switch (el.name) {
		case "DOMShape":
			if (el.attrs.isFloating === "true" && !child(el, "edges"))
				break;
		{
			// (a shape's matrix places its edges ; in a group, the members carry
			// their own matrices, the group's matrix is only a summary)
			const e = { t: "shape", id: ctx.addShape(convertShape(el, ctx)) };
			const m = matrixOf(el);
			if (m)
				e.m = m;
			out.push(e);
			break;
		}
		case "DOMGroup":
			convertElements(child(el, "members") ? child(el, "members").children : [], ctx, out);
			break;
		case "DOMSymbolInstance": {
			const e = { t: "sym", s: el.attrs.libraryItemName };
			const m = matrixOf(el);
			if (m)
				e.m = m;
			const c = colorOf(el);
			if (c)
				e.c = c;
			if (el.attrs.name)
				e.n = el.attrs.name;
			if (el.attrs.symbolType === "graphic") {
				e.g = { first: el.attrs.firstFrame ? +el.attrs.firstFrame : 0, loop: el.attrs.loop || "loop" };
			}
			ctx.useSymbol(e.s);
			out.push(e);
			break;
		}
		case "DOMBitmapInstance": {
			ctx.useBitmap(el.attrs.libraryItemName);
			const e = { t: "bmp", b: el.attrs.libraryItemName };
			const m = matrixOf(el);
			if (m)
				e.m = m;
			out.push(e);
			break;
		}
		case "DOMStaticText":
		case "DOMDynamicText": {
			const runs = kids(child(el, "textRuns"), "DOMTextRun").map(r => {
				const a = child(r, "textAttrs/DOMTextAttrs") ? child(r, "textAttrs/DOMTextAttrs").attrs : {};
				return {
					s: (child(r, "characters") ? child(r, "characters").text : "").replace(/\r/g, "\n"),
					size: a.size ? +a.size : 12,
					face: a.face || "Arial",
					color: rgba(a.fillColor || "#000000"),
					align: a.alignment || "left",
					bold: a.bold === "true",
					italic: a.italic === "true",
					spacing: a.lineSpacing ? +a.lineSpacing : 2
				};
			});
			const e = { t: "text", w: round(+el.attrs.width || 0), h: round(+el.attrs.height || 0), runs };
			const m = matrixOf(el);
			if (m)
				e.m = m;
			if (el.attrs.left)
				e.left = round(+el.attrs.left);
			if (el.name === "DOMDynamicText") {
				e.dyn = true;
				if (el.attrs.variableName)
					e.v = el.attrs.variableName;
				if (el.attrs.name)
					e.n = el.attrs.name;
			}
			out.push(e);
			break;
		}
		case "MorphShape":
			// (a shape tween : its first shape is in the DOMShape of the frame)
			break;
		default:
			ctx.report.elements.add(el.name);
		}
	}
	return out;
}

function convertTimeline(tl, name, ctx) {
	const layersXml = kids(child(tl, "layers"), "DOMLayer");
	const labels = {};
	const scripts = {};
	let frameCount = 1;

	// XFL lists the layers from the top : the output goes from the bottom
	const layers = [];
	layersXml.forEach((l, index) => {
		const type = l.attrs.layerType || "normal";
		if (type === "guide" || type === "folder" || l.attrs.visible === "false")
			return;
		const parent = l.attrs.parentLayerIndex !== undefined ? +l.attrs.parentLayerIndex : -1;
		const parentType = parent >= 0 ? (layersXml[parent].attrs.layerType || "normal") : "";
		const layer = { index, frames: [] };
		if (type === "mask")
			layer.mask = true;
		if (parentType === "mask")
			layer.maskedBy = parent;

		for (const f of kids(child(l, "frames"), "DOMFrame")) {
			const start = +f.attrs.index;
			const duration = f.attrs.duration ? +f.attrs.duration : 1;
			frameCount = Math.max(frameCount, start + duration);
			if (f.attrs.name && f.attrs.labelType !== "comment")
				labels[f.attrs.name] = start;
			const as = child(f, "Actionscript/script");
			if (as && as.text.trim()) {
				const s = translateScript(as.text, ctx.report, name + " frame " + (start + 1));
				scripts[start] = (scripts[start] || []).concat(s.ops);
				if (s.raw)
					(ctx.raw[name] = ctx.raw[name] || {})[start] = s.raw;
			}
			const frame = { i: start, n: duration, els: convertElements(child(f, "elements") ? child(f, "elements").children : [], ctx, []) };
			if (f.attrs.tweenType === "motion") {
				frame.tw = f.attrs.acceleration ? +f.attrs.acceleration : 0;
			}
			layer.frames.push(frame);
		}
		layers.push(layer);
	});

	// masks are referred to by their position in the output
	const pos = new Map(layers.map((l, i) => [l.index, i]));
	for (const l of layers) {
		if (l.maskedBy !== undefined) {
			l.maskedBy = pos.get(l.maskedBy);
			if (l.maskedBy === undefined)
				delete l.maskedBy;
		}
	}
	layers.reverse();
	for (const l of layers)
		delete l.index;
	// (after the reverse, maskedBy must point to the new positions)
	const n = layers.length;
	for (const l of layers)
		if (l.maskedBy !== undefined)
			l.maskedBy = n - 1 - l.maskedBy;

	return { frames: frameCount, labels, scripts, layers };
}

// ----- bitmaps -----

const CRC_TABLE = new Int32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++)
		c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
	return c;
});

function crc32(buf) {
	let c = -1;
	for (const b of buf)
		c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function png(w, h, rgba) {
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(td));
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const raw = Buffer.alloc((w * 4 + 1) * h);
	for (let y = 0; y < h; y++)
		rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0))
	]);
}

function readChunks(d, p) {
	const parts = [];
	for (;;) {
		const n = d.readUInt16LE(p);
		p += 2;
		if (n === 0)
			return zlib.inflateSync(Buffer.concat(parts));
		parts.push(d.subarray(p, p + n));
		p += n;
	}
}

/** Decodes a bin/*.dat bitmap : { ext, data, w, h }. */
function decodeBitmap(d) {
	if (d[0] === 0xFF && d[1] === 0xD8)
		return { ext: "jpg", data: d };
	const rowBytes = d.readUInt16LE(2);
	const w = d.readUInt16LE(4);
	const h = d.readUInt16LE(6);
	const out = Buffer.alloc(w * h * 4);
	if (d[0] === 0x03 && d[1] === 0x05) {
		const hasAlpha = d[24];
		const raw = d[25] ? readChunks(d, 26) : d.subarray(26);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const i = y * rowBytes + x * 4;
				const a = raw[i];
				let r = raw[i + 1];
				let g = raw[i + 2];
				let b = raw[i + 3];
				if (a > 0 && a < 255) {
					// premultiplied
					r = Math.min(255, Math.floor(r * 255 / a));
					g = Math.min(255, Math.floor(g * 255 / a));
					b = Math.min(255, Math.floor(b * 255 / a));
				}
				const o = (y * w + x) * 4;
				out[o] = r;
				out[o + 1] = g;
				out[o + 2] = b;
				out[o + 3] = hasAlpha ? a : 255;
			}
		}
	} else if (d[0] === 0x03 && d[1] === 0x03) {
		const n = d.readUInt16LE(25);
		const pal = [];
		for (let i = 0; i < n; i++)
			pal.push(d.subarray(27 + 4 * i, 31 + 4 * i));
		const raw = readChunks(d, 27 + 4 * n + 1);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const [a, r, g, b] = pal[raw[y * rowBytes + x]];
				const o = (y * w + x) * 4;
				out[o] = r;
				out[o + 1] = g;
				out[o + 2] = b;
				out[o + 3] = a;
			}
		}
	} else {
		throw new Error("unknown bitmap format " + d[0] + "," + d[1]);
	}
	return { ext: "png", data: png(w, h, out), w, h };
}

// ----- a document -----

function convertDocument(name) {
	const dir = path.join(XFL_DIR, name);
	const doc = parseXml(fs.readFileSync(path.join(dir, "DOMDocument.xml"), "utf8"));
	const report = { scripts: [], elements: new Set(), missing: [] };

	const bitmapItems = new Map();
	for (const b of kids(child(doc, "media"), "DOMBitmapItem"))
		bitmapItems.set(b.attrs.name, b.attrs);
	const symbolFiles = new Map();
	for (const inc of kids(child(doc, "symbols"), "Include"))
		symbolFiles.set(inc.attrs.href.replace(/\.xml$/, ""), inc.attrs.href);

	const shapes = [];
	const shapeIds = new Map();
	const usedBitmaps = new Set();
	const toConvert = [];
	const seen = new Set();
	const ctx = {
		report,
		raw: {},
		addShape(s) {
			const k = JSON.stringify(s);
			if (!shapeIds.has(k)) {
				shapeIds.set(k, shapes.length);
				shapes.push(s);
			}
			return shapeIds.get(k);
		},
		useBitmap(n) {
			usedBitmaps.add(n);
		},
		useSymbol(n) {
			if (!seen.has(n)) {
				seen.add(n);
				toConvert.push(n);
			}
		}
	};

	// every symbol (the exported ones are used by the code, the others by them)
	for (const n of symbolFiles.keys())
		ctx.useSymbol(n);

	const symbols = {};
	const linkage = {};
	while (toConvert.length) {
		const n = toConvert.shift();
		const file = symbolFiles.get(n);
		if (!file) {
			report.missing.push(n);
			continue;
		}
		const item = parseXml(fs.readFileSync(path.join(dir, "LIBRARY", file), "utf8"));
		const sym = convertTimeline(child(item, "timeline/DOMTimeline"), n, ctx);
		sym.type = item.attrs.symbolType || "movie clip";
		if (item.attrs.linkageIdentifier) {
			sym.linkage = item.attrs.linkageIdentifier;
			linkage[item.attrs.linkageIdentifier] = n;
		}
		symbols[n] = sym;
	}

	// the bounds of each symbol at its first frame (the original code placed
	// the items with their size : Tools.mc_size)
	const bbox = new Map();
	const transform = (m, b) => {
		if (!m)
			return b;
		const pts = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
		return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
	};
	const union = (a, b) => !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
	const boundsOf = (name, frame, depth) => {
		const sym = symbols[name];
		if (!sym || depth > 12)
			return null;
		const k = name + "@" + frame;
		if (bbox.has(k))
			return bbox.get(k);
		bbox.set(k, null);
		let b = null;
		for (const layer of sym.layers) {
			if (layer.mask)
				continue;
			const fr = layer.frames.find(f => f.i <= frame && frame < f.i + f.n);
			if (!fr)
				continue;
			for (const el of fr.els) {
				let eb = null;
				if (el.t === "shape")
					eb = shapes[el.id].bounds;
				else if (el.t === "bmp") {
					const item = bitmapItems.get(el.b);
					if (item)
						eb = [0, 0, +item.frameRight / 20, +item.frameBottom / 20];
				} else if (el.t === "sym")
					eb = boundsOf(el.s, el.g ? el.g.first : 0, depth + 1);
				else if (el.t === "text")
					eb = [el.left || 0, 0, (el.left || 0) + el.w, el.h];
				if (eb)
					b = union(b, transform(el.m, eb));
			}
		}
		bbox.set(k, b);
		return b;
	};
	for (const n of Object.keys(symbols)) {
		const b = boundsOf(n, 0, 0);
		if (b)
			symbols[n].bounds = b.map(round);
	}

	// the main timeline
	const main = kids(child(doc, "timelines"), "DOMTimeline")[0];
	if (main)
		symbols["#main"] = { ...convertTimeline(main, "#main", ctx), type: "movie clip" };

	// bitmaps
	const outDir = path.join(OUT_DIR, name);
	fs.rmSync(outDir, { recursive: true, force: true });
	fs.mkdirSync(outDir, { recursive: true });
	const bitmaps = {};
	let n = 0;
	for (const b of usedBitmaps) {
		const item = bitmapItems.get(b);
		if (!item) {
			report.missing.push(b);
			continue;
		}
		const data = fs.readFileSync(path.join(dir, "bin", item.bitmapDataHRef));
		const img = decodeBitmap(data);
		const file = "b" + (n++) + "." + img.ext;
		fs.writeFileSync(path.join(outDir, file), img.data);
		bitmaps[b] = {
			src: "assets/xfl/" + name + "/" + file,
			w: +item.frameRight / 20,
			h: +item.frameBottom / 20,
			smooth: item.allowSmoothing === "true"
		};
	}

	const lib = {
		name,
		frameRate: +doc.attrs.frameRate || 40,
		width: +doc.attrs.width,
		height: +doc.attrs.height,
		linkage,
		bitmaps,
		shapes,
		symbols,
		scripts: ctx.raw
	};
	fs.writeFileSync(path.join(OUT_DIR, name + ".json"), JSON.stringify(lib));

	console.log(name + " : " + Object.keys(symbols).length + " symbols, " + shapes.length + " shapes, " + Object.keys(bitmaps).length + " bitmaps");
	if (report.missing.length)
		console.log("  missing : " + report.missing.join(", "));
	if (report.elements.size)
		console.log("  elements not converted : " + [...report.elements].join(", "));
	if (report.scripts.length)
		console.log("  scripts kept as text (" + report.scripts.length + ") :\n    " + report.scripts.join("\n    "));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ["mb2", "title"])
	convertDocument(name);
