#!/usr/bin/env node
// Checks the level data layer without a browser : decodes all the hand-made
// dungeons and generates random Challenge / Classique dungeons.
// Usage (from html5/) : node tools/test_levels.js [count]
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const FILES = [
	"core/mb2.js", "core/const.js", "core/std.js",
	"data/bitcodec.js", "data/level_format.js", "data/assemble.js", "data/levels.js",
	"data/generator/common.js", "data/generator/dungeon.js", "data/generator/rooms.js",
	"data/generator/challenge.js", "data/generator/classic.js"
];

// run the browser scripts in this context (MB2 becomes a global)
const source = FILES.map(f => fs.readFileSync(path.join(root, "js", f), "utf8")).join("\n;\n");
vm.runInThisContext(source.replace("var MB2 = {};", "globalThis.MB2 = {};"));
const MB2 = globalThis.MB2;

function checkLevel(name, level) {
	assert.ok(level.width > 0 && level.height > 0, name + " : size");
	const start = level.dungeon[level.start_x][level.start_y];
	assert.notStrictEqual(start.rtype, MB2.Room.NONE, name + " : the start is a room");

	let rooms = 0, items = 0, ends = 0;
	for (let x = 0; x < level.width; x++) {
		for (let y = 0; y < level.height; y++) {
			const r = level.dungeon[x] && level.dungeon[x][y];
			if (!r)
				continue;   // classic : not generated yet
			if (r.rtype === MB2.Room.NONE)
				continue;
			rooms++;
			if (r.rtype === MB2.Room.END)
				ends++;
			assert.strictEqual(r.paths.length, 4, name + " : 4 exits");
			for (const b of r.bdata || []) {
				assert.ok(b.btype >= 1 && b.btype <= 15, name + " : item type " + b.btype);
				assert.ok(b.x >= 0 && b.x < MB2.Const.LVL_CWIDTH && b.y >= 0 && b.y < MB2.Const.LVL_CHEIGHT, name + " : item position");
				items++;
			}
		}
	}
	return { rooms: rooms, items: items, ends: ends };
}

// hand-made dungeons
for (const name in MB2.LEVEL_FILES) {
	const r = checkLevel(name, MB2.assembleDungeon(MB2.LEVEL_FILES[name]));
	assert.ok(name.startsWith("course") || r.ends === 1, name + " : one boss room");
	console.log(name.padEnd(10), "rooms", r.rooms, "items", r.items);
}

// random dungeons
const count = +process.argv[2] || 3;
let t = Date.now();
for (let i = 0; i < count; i++) {
	const r = checkLevel("challenge", MB2.generateChallenge());
	assert.strictEqual(r.ends, 1, "challenge : one boss room");
	console.log("challenge  rooms", r.rooms, "items", r.items);
}
console.log("challenge  " + ((Date.now() - t) / count | 0) + " ms per dungeon");

t = Date.now();
const classic = new MB2.ClassicDungeon(5);
classic.ensure(20);
checkLevel("classic", classic);
console.log("classique  21 levels in " + (Date.now() - t) + " ms");

console.log("OK");
