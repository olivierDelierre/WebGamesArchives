/*
 * TItems : the trophies of Frutiparc. Port of mb2/TItems.as.
 * They are kept in the card ($items[index] = true).
 */
"use strict";

MB2.TItems = {

	TITEMS: [
		"$c1or", "$c1argent", "$c1",      // course 1 : gold, silver, bronze
		"$c2or", "$c2argent", "$c2",
		"$c3or", "$c3argent", "$c3",
		"$c4or", "$c4argent", "$c4",
		"$c5or", "$c5argent", "$c5",
		"$c6or", "$c6argent", "$c6",
		"$c7or", "$c7argent", "$c7",
		"$bfacettes",                        // classique : level 40
		"$bnormal", "$btime", "$bdeath", "$bmagnet", "$bshadow", "$oeil", "$masque",   // final dungeon (random)
		"$eca0", "$eca1", "$eca2", "$eca3",  // snake scales (0 water, 1 fire, 2 wind, 3 earth)
		"$symb0", "$symb1", "$symb2", "$symb3"   // element symbols
	],

	TITEMS_COURSE: 0,
	TITEM_CLASSIC: 21,
	TITEMS_END: 22,
	TITEMS_SERPENT: 29,
	TITEMS_SYMBOL: 33,

	/** Beating CPU time `inb` of course `cnb` gives its medal and the lower ones. Returns the count. */
	giveCourse(cnb, inb) {
		const T = MB2.TItems;
		let count = 0;
		if (T.giveItem(T.TITEMS_COURSE + inb + cnb * 3))
			count++;
		if (inb < 2)
			count += T.giveCourse(cnb, inb + 1);
		return count;
	},

	giveClassic(level) {
		if (level < 40)
			return false;
		return MB2.TItems.giveItem(MB2.TItems.TITEM_CLASSIC);
	},

	/** An adventure won : the element symbol, then the scale ; the final dungeon gives a random one. */
	giveAventure(av) {
		const T = MB2.TItems;
		if (av < 4) {
			if (T.giveItem(T.TITEMS_SYMBOL + av))
				return true;
			return T.giveItem(T.TITEMS_SERPENT + av);
		}
		for (let tries = 100; tries > 0; tries--) {
			if (T.giveItem(T.TITEMS_END + random(7)))
				return true;
		}
		return false;
	},

	/** Gives a TItem if not owned yet. */
	giveItem(i) {
		const T = MB2.TItems;
		const owned = MB2.Manager.client.fcard.$items;
		if (owned[i] || T.TITEMS[i] === "")
			return false;
		owned[i] = true;
		MB2.Manager.client.giveItem(T.TITEMS[i]);
		MB2.Manager.client.saveSlot(0);
		return true;
	}
};
