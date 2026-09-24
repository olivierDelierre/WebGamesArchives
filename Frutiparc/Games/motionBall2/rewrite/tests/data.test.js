/**
 * Data layer : the hand-made dungeons decode, and the generator produces
 * valid dungeons. Run with `npm test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadDungeon } from "../src/data/dungeon.js";
import { generateChallenge, ClassicDungeon } from "../src/data/generator/index.js";
import { RoomType, Item } from "../src/data/enums.js";
import LEVEL_FILES from "../src/data/levels.generated.js";

function check(name, dungeon) {
	const start = dungeon.room(dungeon.start.x, dungeon.start.y);
	assert.ok(start, name + " : the start is a room");
	let rooms = 0;
	let bosses = 0;
	for (const { room } of dungeon.allRooms()) {
		rooms++;
		if (room.type === RoomType.BOSS)
			bosses++;
		assert.equal(room.exits.length, 4, name + " : 4 exits");
		for (const it of room.items) {
			assert.ok(it.type >= Item.BUMPER && it.type <= Item.HATCH, name + " : item type " + it.type);
			assert.ok(it.x >= 0 && it.x < 152 && it.y >= 0 && it.y < 102, name + " : item position");
		}
	}
	return { rooms, bosses };
}

test("hand-made dungeons", () => {
	for (const name of Object.keys(LEVEL_FILES)) {
		const r = check(name, loadDungeon(name));
		if (!name.startsWith("course"))
			assert.equal(r.bosses, 1, name + " : one boss room");
	}
});

test("challenge dungeons", () => {
	for (let i = 0; i < 3; i++) {
		const r = check("challenge", generateChallenge());
		assert.equal(r.bosses, 1);
		assert.ok(r.rooms >= 48);
	}
});

test("classique dungeon", () => {
	const d = new ClassicDungeon(5);
	d.ensure(10);
	check("classic", d);
	for (let x = 0; x <= 10; x++)
		for (let y = 0; y < 5; y++)
			assert.equal(d.room(x, y).items.filter(i => i.type === Item.HATCH).length, 1);
});
