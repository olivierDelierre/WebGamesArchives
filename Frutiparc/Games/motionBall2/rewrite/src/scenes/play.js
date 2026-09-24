/**
 * The play screen : runs a Game, and shows the pause (with the map) and the
 * end of the game panel over it.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { Mode } from "../data/enums.js";
import { Game } from "../game/game.js";
import { panel, bubbleTitle, button, Pop } from "../gfx/ui.js";
import { text, circle } from "../gfx/draw.js";
import { formatTime } from "../engine/math.js";
import { MUSIC_VOLUME } from "../sounds.js";
import { app } from "../app.js";
import { ButtonGroup } from "./widgets.js";
import { drawMap } from "./map_view.js";
import { MenuScene } from "./menu.js";

const MEDALS = [["#ffd82a", "#a07000"], ["#e4e8ee", "#7a8494"], ["#e8a070", "#8a4a1a"]];

export class PlayScene {

	constructor(mode, param = 0) {
		this.mode = mode;
		this.param = param;
		this.game = null;
		this.paused = null;      // { group, time }
		this.ending = null;      // { result, lines, pop, time }
		this.time = 0;
	}

	enter() {
		this.game = new Game(this.mode, this.param, {
			onPause: () => this.pause(),
			onEnd: result => this.end(result)
		});
	}

	// ----- pause -----

	pause() {
		if (this.paused || this.ending)
			return;
		const withMap = this.game.inventory.map || this.game.inventory.radar;
		const x = withMap ? 527 : W / 2;
		const y = withMap ? 190 : 250;
		const buttons = [
			{ x, y, w: 150, h: 40, action: () => this.resume(),
				draw: (ctx, f) => button(ctx, "Continuer", x, y, 150, 40, f ? "focus" : "idle") },
			{ x, y: y + 56, w: 150, h: 40, action: () => this.quit(),
				draw: (ctx, f) => button(ctx, "Abandonner", x, y + 56, 150, 40, f ? "focus" : "idle") }
		];
		this.paused = { group: new ButtonGroup(buttons, () => this.resume()), withMap, time: 0 };
		if (this.game.boss && this.game.boss.onPause)
			this.game.boss.onPause(true);
	}

	resume() {
		this.paused = null;
		if (this.game.boss && this.game.boss.onPause)
			this.game.boss.onPause(false);
	}

	quit() {
		app.audio.stopLayers(0.5);
		app.audio.playMusic("musicMenu", MUSIC_VOLUME);
		app.scenes.goto(new MenuScene());
	}

	// ----- end of the game -----

	/** Saves the result, and prepares the lines of the end panel. */
	end(result) {
		const save = app.save;
		const win = result.cause === "win";
		const lines = [];
		let heading = win ? "Victoire !" : result.cause === "time" ? "Temps écoulé !" : "Plus de billes !";
		let table = null;

		switch (result.mode) {
		case Mode.CHALLENGE:
		case Mode.ADVENTURE: {
			// the explored part of the dungeon, + the seconds left when the boss is beaten
			const score = result.explored + (win ? Math.floor(result.time) : 0);
			lines.push("Donjon exploré : " + result.explored + " %");
			if (win)
				lines.push("Temps restant : " + formatTime(result.time));
			lines.push("Score : " + score);
			const previous = result.mode === Mode.CHALLENGE
				? save.best("challengeBest", score)
				: (win ? save.winAdventure(result.param, score) : save.adventureScore(result.param, score));
			lines.push(score > previous ? "Nouveau record !" : "Record : " + previous);
			if (win && result.mode === Mode.ADVENTURE && result.param < 4 && save.adventureUnlocked(4))
				lines.push("Le donjon final est ouvert !");
			break;
		}
		case Mode.COURSE: {
			if (win) {
				heading = "Arrivée !";
				const r = save.courseTime(result.param, result.time);
				table = r.table;
				lines.push("Temps : " + formatTime(result.time, true));
				lines.push(r.rank < 0 ? "Pas de record..." : "Record battu !");
				if (r.unlockedNext)
					lines.push("Circuit " + (result.param + 2) + " ouvert !");
			}
			break;
		}
		case Mode.CLASSIC: {
			const previous = save.best("classicBest", result.level);
			lines.push("Niveau atteint : " + result.level);
			lines.push(result.level > previous ? "Nouveau record !" : "Record : niveau " + Math.max(previous, result.level));
			break;
		}
		case Mode.TUTORIAL:
			heading = win ? "Bravo !" : heading;
			lines.push(win ? "Tu connais les bases : à toi de jouer !" : "Essaie encore !");
			break;
		}
		this.ending = { heading, lines, table, pop: new Pop(), scale: 0, time: 0 };
		if (win)
			app.audio.playMusic("musicMenu", MUSIC_VOLUME);
	}

	// ----- every step -----

	update(dt) {
		this.time += dt;
		const input = app.input;

		if (this.ending) {
			const e = this.ending;
			e.time += dt;
			e.scale = e.pop.update(dt);
			this.game.update(dt);
			if (e.time > 0.8 && (input.pressed("confirm") || input.pressed("back") || input.pointer)) {
				this.ending.time = -1000;
				this.quit();
			}
			return;
		}

		if (this.paused) {
			this.paused.time += dt;
			if (input.pressed("pause"))
				this.resume();
			else
				this.paused.group.update();
			return;
		}

		if (input.pressed("pause") && this.game.state === "play") {
			this.pause();
			return;
		}
		this.game.update(dt);
	}

	// ----- drawing -----

	render(ctx) {
		if (!this.game)
			return;
		this.game.render(ctx);
		this.renderStick(ctx);
		if (this.paused)
			this.renderPause(ctx);
		if (this.ending)
			this.renderEnd(ctx);
	}

	/** The virtual joystick, while a finger drives the ball. */
	renderStick(ctx) {
		const s = app.input.stick;
		if (!s || this.paused || this.ending)
			return;
		ctx.fillStyle = "rgba(255,255,255,0.15)";
		circle(ctx, s.x0, s.y0, 40);
		ctx.fill();
		const dx = s.x - s.x0;
		const dy = s.y - s.y0;
		const k = Math.min(1, 40 / (Math.hypot(dx, dy) || 1));
		ctx.fillStyle = "rgba(255,255,255,0.35)";
		circle(ctx, s.x0 + dx * k, s.y0 + dy * k, 16);
		ctx.fill();
	}

	renderPause(ctx) {
		const p = this.paused;
		ctx.fillStyle = "rgba(30,0,40,0.5)";
		ctx.fillRect(0, 0, W, H);
		if (p.withMap) {
			drawMap(ctx, this.game, 10, 40, p.time);
			text(ctx, "PAUSE", 527, 120, { size: 32, color: "#fff", outline: "#4a1470" });
		} else {
			text(ctx, "PAUSE", W / 2, 170, { size: 56, color: "#fff", outline: "#4a1470" });
		}
		p.group.render(ctx);
	}

	renderEnd(ctx) {
		const e = this.ending;
		ctx.fillStyle = "rgba(30,0,40," + Math.min(0.45, e.time) + ")";
		ctx.fillRect(0, 0, W, H);

		const h = e.table ? 300 : 110 + e.lines.length * 26;
		panel(ctx, W / 2, H / 2, 380, h, e.scale);
		if (e.scale < 0.5)
			return;
		ctx.save();
		ctx.translate(W / 2, H / 2);
		ctx.scale(e.scale, e.scale);
		let y = -h / 2 + 34;
		bubbleTitle(ctx, e.heading, 0, y, 34);
		y += 42;
		for (const line of e.lines) {
			text(ctx, line, 0, y, { size: 17, color: "#6a3a00", weight: "700" });
			y += 26;
		}
		if (e.table) {
			y += 6;
			e.table.forEach((row, i) => {
				const [c1, c2] = MEDALS[i];
				ctx.fillStyle = row.mine ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";
				ctx.fillRect(-120, y - 12, 240, 24);
				ctx.fillStyle = c1;
				circle(ctx, -100, y, 9);
				ctx.fill();
				ctx.strokeStyle = c2;
				ctx.lineWidth = 2;
				ctx.stroke();
				text(ctx, String(i + 1), -100, y + 1, { size: 12, color: c2 });
				text(ctx, formatTime(row.time, true), 10, y, { size: 16, color: row.mine ? "#c03000" : "#6a3a00" });
				text(ctx, row.mine ? "toi" : row.cpu ? "CPU" : "", 90, y, { size: 13, color: "#8a5a10", weight: "700" });
				y += 28;
			});
		}
		if (e.time > 0.8) {
			ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.time * 4);
			text(ctx, "Clique ou appuie sur une touche", 0, h / 2 - 22, { size: 13, color: "#8a5a10", weight: "700" });
		}
		ctx.restore();
	}
}
