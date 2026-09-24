/**
 * The menu of the original (Menu.as), with its symbols : the balls of the
 * page ("menu balls") turn around the hole of "fondMenu" ; the mouse on the
 * left or the right turns them. Choosing a mode makes the balls fly away and
 * the hole grow ; choosing a page makes them fly out and back with the new
 * page. "cadreInfo" slides up with the description of the mode.
 *
 * Also playable with the keyboard, a gamepad or a touch screen : left / right
 * go around the balls, "confirm" enters, "back" goes back.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { Mode } from "../data/enums.js";
import { clip } from "../gfx/xfl/index.js";
import { text } from "../gfx/draw.js";
import { formatTime } from "../engine/math.js";
import { app } from "../app.js";
import { ButtonGroup } from "./widgets.js";
import { PlayScene } from "./play.js";

const FRAME = 1 / 40;
const CX = 305;
const CY = 205;
const RADIUS = 136;

/** The frame of "cadreInfo" of each main mode. */
const INFOS = { challenge: 0, aventure: 1, course: 2, classique: 3 };

/** Left / right (or up / down) go around the ring. */
class Ring extends ButtonGroup {

	move(dx, dy) {
		const n = this.buttons.length;
		if (!n)
			return;
		this.focus = (this.focus + (dx + dy > 0 ? 1 : n - 1)) % n;
		app.audio.play("menuMove");
	}
}

export class MenuScene {

	constructor(page = "main") {
		this.time = 0;
		this.clock = 0;
		this.bg = clip("fondMenu");
		this.holeScale = 1;
		this.info = null;           // { art, y, dy, frame }

		// the ring (original : it comes in from 450 px, accelerating)
		this.ray = 450;
		this.ang = 0;
		this.raySpeed = -1;
		this.rayAcc = 1.05;
		this.angSpeed = 0.05;
		this.angAcc = 1.01;
		this.cosRay = 0;
		this.cosSpeed = 0;
		this.phase = 0;
		this.menuTime = 0;
		this.goHole = false;
		this.next = null;

		this.open(page);
	}

	/** Shows the balls of a page. */
	open(page) {
		// back on the main page, the focus stays on the mode that was opened
		const mainFocus = this.page === "main" ? this.group.focus : this.mainFocus || 0;
		this.mainFocus = mainFocus;
		this.page = page;
		this.group = new Ring(this[page + "Page"](), page === "main" ? null : () => this.goto("main"));
		if (page === "main")
			this.group.focus = mainFocus;
		const n = this.group.buttons.length;
		this.group.buttons.forEach((b, i) => {
			b.ang = i * 2 * Math.PI / n;
			b.w = b.h = 100;
		});
		this.place();
	}

	/**
	 * A ball of the menu : `id` is its frame in the original (its title and
	 * its picture).
	 */
	ball(id, name, action, enabled = true) {
		const art = clip("menu balls");
		art.gotoAndStop(enabled ? "normal" : "disable");
		art.child("title")?.gotoAndStop(id - 1);
		art.child("ball")?.gotoAndStop(id - 1);
		const b = { name, id, art, enabled, action, x: CX, y: CY, selected: false };
		b.draw = (ctx, focused) => this.drawBall(ctx, b, focused);
		return b;
	}

	// ----- pages -----

	mainPage() {
		return [
			this.ball(1, "challenge", () => this.play(Mode.CHALLENGE)),
			this.ball(2, "course", () => this.goto("course")),
			this.ball(3, "aventure", () => this.goto("adventure")),
			this.ball(4, "classique", () => this.play(Mode.CLASSIC)),
			this.ball(5, "options", () => this.goto("options")),
			this.ball(6, "aide", () => this.play(Mode.TUTORIAL))
		];
	}

	coursePage() {
		const balls = [];
		for (let i = 0; i < 7; i++) {
			const b = this.ball(40 + i, "course" + i, () => this.play(Mode.COURSE, i), app.save.courseUnlocked(i));
			b.info = () => "Record " + formatTime(app.save.data.courses.records[i][0].time, true);
			balls.push(b);
		}
		balls.push(this.ball(47, "back", () => this.goto("main")));
		return balls;
	}

	adventurePage() {
		const balls = [];
		const adventures = app.save.data.adventures;
		for (let i = 0; i < 5; i++) {
			const b = this.ball(60 + i, "adventure" + i, () => this.play(Mode.ADVENTURE, i), app.save.adventureUnlocked(i));
			const ball = b.art.child("ball");
			// the dungeons done are marked ; the final one's logo waits until it is open
			if (i < 4)
				ball?.child("mask")?.gotoAndStop(adventures.won[i] ? 1 : 0);
			if (i === 4 && !b.enabled)
				ball?.child("logo")?.stop();
			if (adventures.won[i])
				b.info = () => "Gagné " + adventures.best[i] + " %";
			balls.push(b);
		}
		balls.push(this.ball(65, "back", () => this.goto("main")));
		return balls;
	}

	optionsPage() {
		const s = app.save.settings;
		const toggle = key => {
			s[key] = !s[key];
			app.save.save();
			applySettings();
			this.goto("options");
		};
		return [
			this.ball(s.music ? 20 : 21, "music", () => toggle("music")),
			this.ball(s.sounds ? 22 : 23, "sounds", () => toggle("sounds")),
			this.ball(24, "back", () => this.goto("main"))
		];
	}

	// ----- transitions -----

	/** The balls fly away, the hole grows, the game starts. */
	play(mode, param = 0) {
		if (this.phase > 1)
			return;
		this.phase = 2;
		this.next = () => {
			if (!app.scenes.busy)
				app.scenes.goto(new PlayScene(mode, param));
		};
		this.raySpeed = 7;
		this.rayAcc = 1.05;
		this.angSpeed = 0.1;
		this.angAcc = 1.05;
		this.cosSpeed = 0;
		this.cosRay = 0;
		this.goHole = true;
		this.showInfo(null);
	}

	/** The balls fly to the centre, and come back with another page. */
	goto(page) {
		if (this.phase > 1)
			return;
		this.phase = 3;
		this.nextPage = page;
		this.raySpeed = -5;
		this.rayAcc = 1.1;
		this.angSpeed = 0.2;
		this.angAcc = 1.02;
		this.cosSpeed = 0;
		this.cosRay = 0;
		this.showInfo(null);
	}

	// ----- every step -----

	update(dt) {
		this.time += dt;
		if (this.phase <= 1 && !app.scenes.busy) {
			const hover = app.input.hover;
			if (this.phase === 1 && hover && hover !== this.group.lastHover)
				this.steer(hover.x);
			this.group.update();
		}
		this.clock += dt;
		while (this.clock >= FRAME) {
			this.clock -= FRAME;
			this.step();
		}
		this.select();
	}

	/** The mouse on the left or on the right turns the ring. */
	steer(x) {
		const delta = Math.min(200, Math.abs(CX - x));
		this.angSpeed = (x > CX ? 1 : -1) * delta * 0.05 / 100;
	}

	/** The focused ball is "selected", its description comes up. */
	select() {
		this.group.buttons.forEach((b, i) => {
			const selected = i === this.group.focus && b.enabled && this.phase <= 1;
			if (selected !== b.selected) {
				b.selected = selected;
				b.art.gotoAndStop(selected ? "selected" : b.enabled ? "normal" : "disable");
				if (this.page === "main")
					this.showInfo(selected ? INFOS[b.name] : null);
			}
		});
	}

	showInfo(frame) {
		if (frame === null || frame === undefined) {
			if (this.info)
				this.info.dy = 10;
			return;
		}
		if (!this.info)
			this.info = { art: clip("cadreInfo"), y: H + 50 };
		this.info.art.gotoAndStop(frame);
		this.info.dy = -10;
	}

	/** One frame of the original (40 per second). */
	step() {
		this.menuTime += 1 / 30;
		this.bg.update(FRAME);
		for (const b of this.group.buttons)
			b.art.update(FRAME);

		const info = this.info;
		if (info) {
			info.y += info.dy;
			if (info.y > H + 50)
				this.info = null;
			else if (info.y < H - 40)
				info.y = H - 40;
		}

		this.raySpeed *= this.rayAcc;
		// (original : a minimum speed while leaving)
		if (this.phase > 1 && Math.abs(this.raySpeed) < 3)
			this.raySpeed = this.raySpeed < 0 ? -3 : 3;
		this.angSpeed *= this.angAcc;
		this.cosRay += this.cosSpeed;
		this.ray += this.raySpeed;
		this.ang = (this.ang + this.angSpeed) % (Math.PI * 2);
		this.place();

		switch (this.phase) {
		case 0:
			if (this.ray <= RADIUS) {
				this.ray = RADIUS;
				this.raySpeed = 0;
				this.angAcc = 0.99;
				this.cosSpeed = 0.1;
				this.phase = 1;
			}
			break;
		case 1:
			if (Math.abs(this.cosRay) > 10)
				this.cosSpeed *= -1;
			break;
		case 2:
			if (this.ray > 450) {
				this.phase = 5;
				this.next();
			}
			break;
		case 3:
			if (this.ray < this.raySpeed || this.ray < 0) {
				this.open(this.nextPage);
				this.angSpeed *= -1;
				this.raySpeed *= -1;
				this.rayAcc = 1 / this.rayAcc;
				this.angAcc = 0.97;
				this.phase = 4;
			}
			break;
		case 4:
			if (this.ray >= 130) {
				this.raySpeed = 0;
				this.ray = RADIUS;
				this.phase = 0;
			}
			break;
		}
		if (this.goHole)
			this.holeScale *= 1.1;
	}

	/** The positions of the balls on the ring. */
	place() {
		for (const b of this.group.buttons) {
			const a = b.ang + this.ang;
			const r = Math.cos(b.ang + this.menuTime) * this.cosRay;
			b.x = Math.cos(a) * (this.ray + r) + CX;
			b.y = Math.sin(a) * (this.ray + r) + CY;
		}
	}

	// ----- drawing -----

	render(ctx) {
		this.bg.set("hole", { xscale: this.holeScale, yscale: this.holeScale });
		this.bg.draw(ctx);
		this.group.render(ctx);

		// (a record, or the result of a dungeon, in the hole)
		const b = this.group.focused;
		if (this.phase <= 1 && b && b.enabled && b.info)
			text(ctx, b.info(), CX, CY, { size: 15, color: "#fff", outline: "#4a1470" });

		if (this.info) {
			ctx.save();
			ctx.translate(W / 2, this.info.y);
			this.info.art.draw(ctx);
			ctx.restore();
		}
	}

	drawBall(ctx, b) {
		ctx.save();
		ctx.translate(b.x, b.y);
		b.art.draw(ctx);
		ctx.restore();
	}
}

/** Applies the sound settings. */
export function applySettings() {
	const s = app.save.settings;
	app.audio.setMusicEnabled(s.music);
	app.audio.setSoundsEnabled(s.sounds);
}
