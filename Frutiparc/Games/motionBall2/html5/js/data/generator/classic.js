/*
 * Random rooms of the Classique mode. Port of Level.make_classic (mb2gen/level.ml).
 */
"use strict";

(function () {

	const Gen = MB2.Gen;
	const D = Gen.Dungeon;

	/*
	 * The Classique mode is a column of `choices` rooms per level, 100 levels.
	 * The rooms have no doors : the ball goes down through the hatch, and
	 * arrives in a random room of the next level, at the position of the hatch
	 * of the previous one (hence `enter`).
	 *
	 * The original tool generated the 500 rooms at once. Here the columns are
	 * generated on demand (ensure()), as players rarely go very far.
	 */
	MB2.ClassicDungeon = class {

		constructor(choices) {
			this.width = 100;
			this.height = choices;
			this.start_x = 0;
			this.start_y = 0;

			this.map = D.empty(this.width, this.height);
			this.dungeon = [];
			for (let x = 0; x < this.width; x++)
				this.dungeon[x] = [];

			this.generated = 0;
			this.enter = { x: (Gen.L.cwidth / 2 | 0) - 3, y: (Gen.L.cheight / 2 | 0) - 3 };
			this.exit = Gen.Rooms.randomExit();
			this.ensure(2);
		}

		/** Generates the levels up to column `col`. */
		ensure(col) {
			col = Math.min(col, this.width - 1);

			while (this.generated <= col) {
				const x = this.generated++;
				const classic = { enter: this.enter, exit: this.exit };

				for (let y = 0; y < this.height; y++) {
					const r = this.map.dmap[x][y];
					const ctx = { dungeon: this.map, pos: { x: x, y: y }, classic: classic };
					const items = Gen.retry(Infinity, () => Gen.Rooms.generate(ctx, r, x / 2 | 0));
					this.dungeon[x][y] = Gen.convertRoom(r, items);
				}

				this.enter = this.exit;
				this.exit = Gen.Rooms.randomExit();
			}
		}
	};

})();
