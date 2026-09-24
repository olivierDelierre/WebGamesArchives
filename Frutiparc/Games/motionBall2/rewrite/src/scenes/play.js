/**
 * The play screen : runs a Game, and shows the pause (with the map) and the
 * end of the game panel over it, with the original symbols : the game tinted
 * and "pause" (Pause.as), "panGameOver" (GameOver.as, GameOverCourse.as).
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { Mode } from "../data/enums.js";
import { Game } from "../game/game.js";
import { button, Pop } from "../gfx/ui.js";
import { text, circle } from "../gfx/draw.js";
import { clip } from "../gfx/xfl/index.js";
import { withColor } from "../gfx/xfl/render.js";
import { formatTime } from "../engine/math.js";
import { MUSIC_VOLUME } from "../sounds.js";
import { app } from "../app.js";
import { ButtonGroup } from "./widgets.js";
import { drawMap } from "./map_view.js";
import { MenuScene } from "./menu.js";

/** The colour of the game during the pause (original : Pause.as). */
const PAUSE_COLOR = { am: 1, rm: 0.5, gm: 0.7, bm: 0.5, ao: 0, ro: 30, go: 0, bo: 30 };

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
		// (for the touch screens and the gamepads : the original only had Escape)
		const y = 393;
		const buttons = [
			{ x: 70, y, w: 120, h: 28, action: () => this.resume(),
				draw: (ctx, f) => button(ctx, "Continuer", 70, y, 120, 28, f ? "focus" : "idle") },
			{ x: 200, y, w: 120, h: 28, action: () => this.quit(),
				draw: (ctx, f) => button(ctx, "Abandonner", 200, y, 120, 28, f ? "focus" : "idle") }
		];
		this.paused = { group: new ButtonGroup(buttons, () => this.resume()), withMap, time: 0, art: clip("pause") };
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
		// (the panel shows "victory" or "game over" ; the heading tells why)
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
		this.ending = { heading, lines, table, pop: new Pop(), scale: 0, time: 0, art: this.endPanel(win, lines, table) };
		if (win)
			app.audio.playMusic("musicMenu", MUSIC_VOLUME);
	}

	/**
	 * "panGameOver" : "victory" or "gameOver", the lines in "mainField" ;
	 * the records of a course ("records" : a slot per time, its balls
	 * showing whose time it is).
	 */
	endPanel(win, lines, table) {
		const art = clip("panGameOver");
		if (table) {
			art.gotoAndStop("records");
			let cpu = 0;
			for (let i = 0; i < 4; i++) {
				const slot = art.child("s" + (i + 1));
				const row = table[i];
				if (!slot)
					continue;
				if (!row) {
					art.set("s" + (i + 1), { visible: false });
					continue;
				}
				slot.setText("time_text", formatTime(row.time, true));
				// (original : the CPU's times 1-3, the player's new one 4, another 5)
				const type = row.cpu ? ++cpu : row.mine ? 4 : 5;
				slot.child("b1")?.gotoAndStop(type - 1);
				slot.child("b2")?.gotoAndStop(type - 1);
			}
			// (one line under the times : a new circuit, or the record)
			art.setText("mainField", lines[lines.length - 1]);
			art.set("mainField", { y: 121 });
		} else {
			art.gotoAndStop(win ? "victory" : "gameOver");
			art.setText("mainField", lines.join("\n"));
			// (original : centred on y = 30)
			art.set("mainField", { y: 30 - lines.length * 32 / 2 });
		}
		return art;
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
		if (this.paused)
			withColor(ctx, PAUSE_COLOR, c => this.game.render(c));
		else
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
		if (p.withMap)
			drawMap(ctx, this.game);
		p.art.draw(ctx);
		p.group.render(ctx);
	}

	renderEnd(ctx) {
		const e = this.ending;
		ctx.save();
		ctx.translate(W / 2, H / 2);
		ctx.scale(e.scale, e.scale);
		e.art.draw(ctx);
		ctx.restore();
		if (e.time > 0.8) {
			ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.time * 4);
			text(ctx, "Clique ou appuie sur une touche", W / 2, H - 14, { size: 13, color: "#fff", outline: "#4a1470" });
			ctx.globalAlpha = 1;
		}
	}
}
