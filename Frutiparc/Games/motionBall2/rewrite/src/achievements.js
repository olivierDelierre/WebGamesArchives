/**
 * The achievements (a feature of the rewrite : the original had the
 * Frutiparc trophies instead).
 *
 * The game tells what happens (`app.achievements.event(name, game, data)`) :
 *   "pastille"   a red pastille is taken
 *   "block"      a green block is broken
 *   "fall"       the ball falls in a hole
 *   "ball"       a ball is found (data : its type)
 *   "item"       an item box gives the map or the radar
 *   "level"      Classique : a level is reached (data : the level)
 *   "lost"       a ball is lost
 *   "end"        the game is over (data : the result, and `courseRank`)
 * The counters (pastilles, blocks, falls) and the unlocked achievements, with
 * their date, are kept in the save. A banner shows each new one for a while.
 */

import { WIDTH as W } from "./config.js";
import { Mode, BallType } from "./data/enums.js";
import { roundRect, text } from "./gfx/draw.js";

/** The dungeon balls of a Challenge : green, blue, metal, violet. */
const DUNGEON_BALLS = [BallType.GREEN, BallType.BLUE, BallType.METAL, BallType.VIOLET];

/**
 * Each achievement : id, name, text, the ball colour of its icon, and a
 * `counter` + `goal` when it counts something. A `secret` one shows "???"
 * until it is unlocked.
 */
export const ACHIEVEMENTS = [
	{ id: "tutorial", name: "Premier pas", text: "Terminer le tutoriel.", ball: BallType.YELLOW },
	{ id: "octopus", name: "Poulpe frit", text: "Battre le poulpe du Challenge.", ball: BallType.RED },
	{ id: "flawless", name: "Sans une égratignure", text: "Gagner un Challenge sans perdre de bille.", ball: BallType.METAL },
	{ id: "express", name: "Express", text: "Gagner un Challenge avec plus de 5 min restantes.", ball: BallType.ORANGE },
	{ id: "collector", name: "Collectionneur", text: "Trouver les 4 billes d'un donjon du Challenge.", ball: BallType.GREEN },
	{ id: "rainbow", name: "Arc-en-ciel", text: "Avoir les 7 billes dans une même partie.", ball: BallType.VIOLET },
	{ id: "cartographer", name: "Cartographe", text: "Trouver la carte et le radar dans une même partie.", ball: BallType.BLUE },
	{ id: "adventure", name: "Premier donjon", text: "Gagner une aventure.", ball: BallType.GREEN },
	{ id: "elements", name: "Maître des éléments", text: "Gagner les quatre aventures des éléments.", ball: BallType.RED },
	{ id: "final", name: "Le dernier donjon", text: "Gagner l'aventure finale.", ball: BallType.VIOLET, secret: true },
	{ id: "driver", name: "Pilote", text: "Terminer un circuit.", ball: BallType.ORANGE },
	{ id: "champion", name: "Champion", text: "Prendre la première place d'un circuit.", ball: BallType.YELLOW },
	{ id: "diver", name: "Plongeur", text: "Atteindre le niveau 10 en Classique.", ball: BallType.BLUE },
	{ id: "abyss", name: "Abysses", text: "Atteindre le niveau 25 en Classique.", ball: BallType.VIOLET },
	{ id: "pastilles", name: "Pastilleur", text: "Ramasser 500 pastilles rouges.", ball: BallType.RED, counter: "pastilles", goal: 500 },
	{ id: "bricks", name: "Casse-briques", text: "Casser 100 blocs verts.", ball: BallType.GREEN, counter: "blocks", goal: 100 },
	{ id: "clumsy", name: "Maladroit", text: "Tomber 25 fois dans un trou.", ball: BallType.METAL, counter: "falls", goal: 25 }
];

const BANNER_TIME = 3.5;

export class Achievements {

	/** @param save  the Progress (its data keeps `achievements`) */
	constructor(save) {
		this.save = save;
		this.banners = [];         // { achievement, time } : new ones, shown one after the other
		const d = save.data;
		if (!d.achievements || typeof d.achievements !== "object")
			d.achievements = {};
		d.achievements.unlocked = d.achievements.unlocked || {};
		d.achievements.counters = d.achievements.counters || {};
	}

	get data() {
		return this.save.data.achievements;
	}

	isUnlocked(id) {
		return !!this.data.unlocked[id];
	}

	/** The date (ms) it was unlocked, or 0. */
	date(id) {
		return this.data.unlocked[id] || 0;
	}

	/** { value, goal } of a counting achievement, or null. */
	progress(a) {
		return a.counter ? { value: Math.min(a.goal, this.data.counters[a.counter] || 0), goal: a.goal } : null;
	}

	get unlockedCount() {
		return ACHIEVEMENTS.filter(a => this.isUnlocked(a.id)).length;
	}

	unlock(id) {
		if (this.isUnlocked(id))
			return false;
		this.data.unlocked[id] = Date.now();
		this.save.save();
		const a = ACHIEVEMENTS.find(x => x.id === id);
		if (a)
			this.banners.push({ achievement: a, time: 0 });
		return true;
	}

	count(counter, n = 1) {
		const c = this.data.counters;
		c[counter] = (c[counter] || 0) + n;
		for (const a of ACHIEVEMENTS)
			if (a.counter === counter && c[counter] >= a.goal)
				this.unlock(a.id);
		// (saved with the next unlock or the end of the game)
	}

	/** Something happened in `game`. */
	event(name, game, data) {
		const stats = game.stats || (game.stats = { lost: 0 });
		switch (name) {
		case "pastille":
			this.count("pastilles");
			break;
		case "block":
			this.count("blocks");
			break;
		case "fall":
			this.count("falls");
			break;
		case "lost":
			stats.lost++;
			break;
		case "ball": {
			const found = game.inventory.found;
			if (game.mode === Mode.CHALLENGE && DUNGEON_BALLS.every(t => found.has(t)))
				this.unlock("collector");
			if (new Set([BallType.YELLOW, ...found]).size === 7)
				this.unlock("rainbow");
			break;
		}
		case "item":
			if (game.inventory.map && game.inventory.radar)
				this.unlock("cartographer");
			break;
		case "level":
			if (data >= 10)
				this.unlock("diver");
			if (data >= 25)
				this.unlock("abyss");
			break;
		case "end":
			this.gameOver(game, data);
			this.save.save();
			break;
		}
	}

	gameOver(game, result) {
		if (result.cause !== "win")
			return;
		switch (result.mode) {
		case Mode.TUTORIAL:
			this.unlock("tutorial");
			break;
		case Mode.CHALLENGE:
			this.unlock("octopus");
			if (!game.stats || game.stats.lost === 0)
				this.unlock("flawless");
			if (result.time > 5 * 60)
				this.unlock("express");
			break;
		case Mode.ADVENTURE:
			this.unlock("adventure");
			if (result.param === 4)
				this.unlock("final");
			if (this.save.data.adventures.won.slice(0, 4).every(Boolean))
				this.unlock("elements");
			break;
		case Mode.COURSE:
			this.unlock("driver");
			if (result.courseRank === 0)
				this.unlock("champion");
			break;
		}
	}

	// ----- the banner of a new achievement -----

	update(dt) {
		const b = this.banners[0];
		if (b) {
			b.time += dt;
			if (b.time >= BANNER_TIME)
				this.banners.shift();
		}
	}

	/** Draws the banner of the new achievement, over everything. */
	render(ctx) {
		const b = this.banners[0];
		if (!b)
			return;
		// slides in from the top, and back
		const t = b.time;
		const k = Math.min(1, t / 0.3, (BANNER_TIME - t) / 0.3);
		const y = -30 + 52 * Math.max(0, k);
		ctx.save();
		ctx.fillStyle = "rgba(40,0,70,0.85)";
		roundRect(ctx, W / 2 - 150, y - 20, 300, 42, 14);
		ctx.fill();
		ctx.strokeStyle = "#ffe060";
		ctx.lineWidth = 2;
		ctx.stroke();
		text(ctx, "Succès débloqué !", W / 2, y - 7, { size: 12, color: "#ffe060", weight: "700" });
		text(ctx, b.achievement.name, W / 2, y + 9, { size: 16, color: "#fff" });
		ctx.restore();
	}
}
