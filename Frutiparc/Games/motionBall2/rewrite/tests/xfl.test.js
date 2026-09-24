/**
 * The original art : the XFL converter (tools/xfl/convert.js) and the
 * symbols it produced, played by Clip (src/gfx/xfl/clip.js).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { setup, fakeContext } from "./helpers.js";
import { edgeNumber, colorOf, parseEdges, loops, translateScript, decodeBitmap } from "../tools/xfl/convert.js";
import { symbols, clip, symbolCells, xflBitmapFiles } from "../src/gfx/xfl/index.js";
import { combineColor, isIdentityColor, interpolateMatrix } from "../src/gfx/xfl/render.js";

/** Runs a clip for `frames` frames of the original (40 per second). */
const frames = (c, n) => {
	for (let i = 0; i < n; i++)
		c.update(1 / 40);
};

// ----- the converter -----

test("converter : the numbers of the edges (decimal, and #hex fixed point)", () => {
	assert.equal(edgeNumber("200"), 200);
	assert.equal(edgeNumber("#1A.80"), 26.5);
	assert.equal(edgeNumber("#FFFFF6"), -10, "signed 24 bits");
});

test("converter : edges become segments in pixels, and a fill's edges a closed loop", () => {
	const segs = parseEdges("!0 0|200 0|200 200S2|0 200|0 0");
	assert.equal(segs.length, 4);
	assert.deepEqual(segs[0], { x0: 0, y0: 0, x1: 10, y1: 0 });
	const curve = parseEdges("!0 0[100 0 200 200");
	assert.deepEqual(curve[0], { x0: 0, y0: 0, cx: 5, cy: 0, x1: 10, y1: 10 });
	// the segments given out of order are chained
	const d = loops([segs[2], segs[0], segs[3], segs[1]]);
	assert.equal(d, "M10 10L0 10L0 0L10 0L10 10Z", "one loop, from the first segment given");
});

test("converter : colour transforms, tints and brightness", () => {
	const el = attrs => ({ name: "x", attrs: {}, children: [{ name: "color", attrs: {}, children: [{ name: "Color", attrs, children: [] }] }] });
	assert.deepEqual(colorOf(el({ alphaMultiplier: "0.5", redOffset: "-56" })),
		{ am: 0.5, rm: 1, gm: 1, bm: 1, ao: 0, ro: -56, go: 0, bo: 0 });
	const tint = colorOf(el({ tintColor: "#FF0000", tintMultiplier: "0.5" }));
	assert.equal(tint.rm, 0.5);
	assert.equal(tint.ro, 127.5);
	assert.equal(tint.go, 0);
	assert.equal(colorOf(el({ brightness: "-0.5" })).rm, 0.5);
});

test("converter : frame scripts become operations, or stay as text", () => {
	const report = { scripts: [] };
	assert.deepEqual(translateScript("stop();", report, "a").ops, [["stop"]]);
	assert.deepEqual(translateScript('gotoAndPlay("loop");', report, "a").ops, [["goto", "loop", true]]);
	assert.deepEqual(translateScript("_parent.animDone();\nremoveMovieClip();", report, "a").ops, [["call", "animDone"], ["remove"]]);
	assert.deepEqual(translateScript("if (flLoopv) gotoAndPlay(\"loop\");", report, "a").ops, [["loopIf", "flLoopv", "loop"]]);
	const raw = translateScript("var x = new Game();", report, "b");
	assert.ok(raw.raw, "kept as text");
	assert.equal(report.scripts.length, 1);
});

test("converter : lossless bitmaps are unpacked (ARGB, premultiplied, zlib chunks) into PNG", () => {
	// a 2 x 1 bitmap : an opaque red pixel, a half transparent white one (premultiplied)
	const argb = Buffer.from([255, 255, 0, 0, 128, 128, 128, 128]);
	const z = zlib.deflateSync(argb);
	const head = Buffer.alloc(26);
	head[0] = 0x03;
	head[1] = 0x05;
	head.writeUInt16LE(8, 2);          // bytes per row
	head.writeUInt16LE(2, 4);          // width
	head.writeUInt16LE(1, 6);          // height
	head[24] = 1;                      // has alpha
	head[25] = 1;                      // compressed
	const chunk = Buffer.alloc(2);
	chunk.writeUInt16LE(z.length);
	const bmp = decodeBitmap(Buffer.concat([head, chunk, z, Buffer.from([0, 0])]));
	assert.equal(bmp.ext, "png");
	assert.equal(bmp.w, 2);
	const pixels = zlib.inflateSync(bmp.data.subarray(bmp.data.indexOf("IDAT") + 4));
	// (a filter byte, then the pixels : the second one un-premultiplied)
	assert.deepEqual([...pixels.subarray(1, 9)], [255, 0, 0, 255, 255, 255, 255, 128]);
	// JPEGs are kept as they are
	assert.equal(decodeBitmap(Buffer.from([0xFF, 0xD8, 0xFF])).ext, "jpg");
});

// ----- the converted symbols -----

test("symbols : the library has the game's symbols, their labels and sizes", () => {
	assert.ok(symbols.symbol("bnormal"), "by linkage");
	assert.ok(symbols.symbol("_gfx/_bumpers/_normal/bnormal"), "by library name");
	assert.equal(symbols.symbol("bnormal").labels.hit, 1);
	assert.equal(symbols.symbol("tourneboule").labels.kata1, 10);
	// the original placed the items with their size in cells of 4 px
	assert.deepEqual(symbolCells("btime"), { w: 18, h: 18 });
	assert.deepEqual(symbolCells("zapper"), { w: 12, h: 12 });
	// every bitmap file exists
	for (const f of xflBitmapFiles())
		assert.ok(fs.existsSync(new URL("../" + f, import.meta.url)), f);
});

// ----- Clip -----

test("clip : frame scripts stop and loop the timeline", () => {
	const c = clip("bnormal");
	assert.equal(c.frame, 0);
	frames(c, 3);
	assert.equal(c.frame, 0, "stopped by its first frame's script");
	c.gotoAndPlay("hit");
	assert.equal(c.frame, 1);
	frames(c, 3);
	assert.equal(c.frame, 4);
	frames(c, 10);
	assert.equal(c.frame, 0, "back to the first frame, which stops it");
});

test("clip : scripts set variables, call the game, remove the clip", () => {
	const hatch = clip("exit");
	hatch.gotoAndPlay("anim_open");
	frames(hatch, 40);
	assert.equal(hatch.vars.flOpen, true);

	const tb = clip("tourneboule");
	const events = [];
	tb.on = e => events.push(e);
	tb.gotoAndPlay("kata1");
	frames(tb, 20);
	assert.deepEqual(events, ["kataDone", "animDone"]);

	const spark = clip("hit");
	frames(spark, 60);
	assert.ok(spark.removed, "removeMovieClip");
});

test("clip : nested clips, named parts, texts", () => {
	const box = clip("ballbox");
	const ball = box.child("ball");
	assert.ok(ball, "the nested clip by its instance name");
	ball.gotoAndStop(3);
	frames(box, 2);
	assert.equal(box.child("ball").frame, 3, "it keeps its frame");

	setup();
	const counter = clip("time counter");
	counter.gotoAndStop("score");
	counter.setText("tview_txt", "123");
	counter.set("tview_txt", { x: 10 });
	counter.draw(fakeContext());
	assert.equal(counter.lookup("texts", "tview_txt"), "123");
});

test("clip : motion tweens are interpolated", () => {
	const shade = clip("TBShadow");
	const layer = shade.symbol.layers[0];
	const a = layer.frames.find(f => f.tw !== undefined);
	const b = layer.frames[layer.frames.indexOf(a) + 1];
	const mid = shade.layerElements(layer, a.i + a.n / 2).els[0].m;
	const ma = a.els[0].m;
	const mb = b.els[0].m;
	for (const k of [4, 5])
		assert.ok(Math.min(ma[k], mb[k]) - 0.01 <= mid[k] && mid[k] <= Math.max(ma[k], mb[k]) + 0.01, "between the keyframes");
	assert.deepEqual(interpolateMatrix([1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 10, 20], 0.5).slice(4), [5, 10]);
});

test("colour transforms combine like Flash's", () => {
	const red = { am: 1, rm: 1, gm: 1, bm: 1, ao: 0, ro: 100, go: 0, bo: 0 };
	const half = { am: 0.5, rm: 0.5, gm: 0.5, bm: 0.5, ao: 0, ro: 0, go: 0, bo: 0 };
	// child first, then the parent : (c + 100) x 0.5
	const c = combineColor(half, red);
	assert.equal(c.rm, 0.5);
	assert.equal(c.ro, 50);
	assert.ok(isIdentityColor(null));
	assert.ok(!isIdentityColor(red));
});

test("clip : the tweens are drawn between frames, not the jumps nor the stops", () => {
	const shade = clip("TBShadow");
	const layer = shade.symbol.layers[0];
	const tween = layer.frames.find(f => f.tw !== undefined && f.n > 1);
	shade.gotoAndPlay(tween.i);
	shade.update(0.5 / 40);
	assert.ok(Math.abs(shade.drawFrame() - (tween.i + 0.5)) < 0.01, "half way to the next frame");
	const between = shade.layerElements(layer, shade.drawFrame()).els[0].m;
	const now = shade.layerElements(layer).els[0].m;
	const next = shade.layerElements(layer, tween.i + 1).els[0].m;
	assert.ok(Math.abs(between[4] - (now[4] + next[4]) / 2) < 0.5, "the tween's place in between");

	shade.stop();
	assert.equal(shade.drawFrame(), tween.i, "stopped : the frame itself");

	// "bnormal" : its first frame stops the timeline
	const bumper = clip("bnormal");
	bumper.update(0.5 / 40);
	assert.equal(bumper.drawFrame(), 0);
	// "FXWater" : its last frame goes back to the first one
	const water = clip("FXWater");
	water.gotoAndPlay(19);
	water.update(0.5 / 40);
	assert.equal(water.drawFrame(), 19, "no drawing between a frame and a jump");
});
