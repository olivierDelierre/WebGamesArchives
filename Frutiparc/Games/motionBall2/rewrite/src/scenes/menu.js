/**
 * The menu of the original (Menu.as), with its symbols : the balls of the
 * page ("menu balls") turn around the hole of "fondMenu" ; the mouse on the
 * left or the right turns them. Choosing a mode makes the balls fly away and
 * the hole grow ; choosing a page makes them fly out and back with the new
 * page. "cadreInfo" slides up with the description of the mode.
 *
 * Also playable with the keyboard, a gamepad or a touch screen : left / right
 * go around the balls, "confirm" enters, "back" goes back.
 *
 * The options page also has two volume sliders in the hole (music, sound
 * effects) : dragged with the mouse or a finger, or up / down on the ball of
 * the music or of the sounds.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { Mode } from "../data/enums.js";
import { clip } from "../gfx/xfl/index.js";
import { text, roundRect, circle } from "../gfx/draw.js";
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

/** The volume sliders of the options page : the setting, and where they are drawn. */
const SLIDERS = [
	{ key: "music", label: "Musique", y: 190 },
	{ key: "sounds", label: "Sons", y: 238 }
];
const SLIDER_X = 250;
const SLIDER_W = 110;
const VOLUME_STEP = 0.1;

/**
 * Left / right (or up / down) go around the ring ; on the options page, up /
 * down change the volume of the focused ball (`adjust`).
 */
class Ring extends ButtonGroup {

	move(dx, dy) {
		const n = this.buttons.length;
		if (!n)
			return;
		if (dy && this.adjust && this.adjust(-dy))
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
		this.dragging = null;
		if (page === "options")
			this.group.adjust = way => {
				const key = this.group.focused.name;
				if (key !== "music" && key !== "sounds")
					return false;
				this.setVolume(key, app.save.settings[key + "Volume"] + way * VOLUME_STEP, true);
				return true;
			};
		if (page === "main")
			this.group.focus = mainFocus;
		const n = this.group.buttons.length;
		this.group.buttons.forEach((b, i) => {
			b.ang = i * 2 * Math.PI / n;
			b.w = b.h = 100;
		});
		this.place();
		for (const b of this.group.buttons) {
			b.px = b.x;
			b.py = b.y;
		}
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

	/**
	 * Sets the volume of the music or of the sounds (0 .. 1). `done` : saves it
	 * (and plays a sound, to hear the new volume of the sounds).
	 */
	setVolume(key, v, done) {
		const s = app.save.settings;
		s[key + "Volume"] = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
		applySettings();
		if (done) {
			app.save.save();
			if (key === "sounds")
				app.audio.play("menuMove");
		}
	}

	/** Dragging a slider (the mouse or a finger). */
	updateSliders() {
		const d = app.input.drag ? app.input.drag() : null;
		if (!d) {
			if (this.dragging)
				this.setVolume(this.dragging, app.save.settings[this.dragging + "Volume"], true);
			this.dragging = null;
			return;
		}
		if (!this.dragging) {
			const hit = SLIDERS.find(sl => Math.abs(d.y - sl.y) < 16 && d.x > SLIDER_X - 12 && d.x < SLIDER_X + SLIDER_W + 12);
			if (!hit)
				return;
			this.dragging = hit.key;
			// (the ring follows : its ball gets the focus)
			const i = this.group.buttons.findIndex(b => b.name === hit.key);
			if (i >= 0)
				this.group.focus = i;
		}
		this.setVolume(this.dragging, (d.x - SLIDER_X) / SLIDER_W, false);
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
			if (this.page === "options")
				this.updateSliders();
		}
		this.clock += dt;
		while (this.clock >= FRAME) {
			this.clock -= FRAME;
			this.step();
		}
		// (the symbols play with the real time : their tweens are drawn between frames)
		this.bg.update(dt);
		for (const b of this.group.buttons)
			b.art.update(dt);
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
		// (the places of the previous step, to draw in between)
		for (const b of this.group.buttons) {
			b.px = b.x;
			b.py = b.y;
		}
		if (this.info)
			this.info.py = this.info.y;
		this.prevHole = this.holeScale;
		this.menuTime += 1 / 30;

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

	/** Between the previous step (0) and the last one (1). */
	get k() {
		return Math.min(1, this.clock / FRAME);
	}

	render(ctx) {
		const k = this.k;
		const hole = this.prevHole === undefined ? this.holeScale : this.prevHole + (this.holeScale - this.prevHole) * k;
		this.bg.set("hole", { xscale: hole, yscale: hole });
		this.bg.draw(ctx);
		this.group.render(ctx);

		// (a record, or the result of a dungeon, in the hole)
		const b = this.group.focused;
		if (this.phase <= 1 && b && b.enabled && b.info)
			text(ctx, b.info(), CX, CY, { size: 15, color: "#fff", outline: "#4a1470" });

		if (this.page === "options" && this.phase <= 1)
			this.renderSliders(ctx);

		if (this.info) {
			const py = this.info.py ?? this.info.y;
			ctx.save();
			ctx.translate(W / 2, py + (this.info.y - py) * k);
			this.info.art.draw(ctx);
			ctx.restore();
		}
	}

	/** The two volume sliders, in the hole. */
	renderSliders(ctx) {
		const s = app.save.settings;
		const focused = this.group.focused && this.group.focused.name;
		for (const sl of SLIDERS) {
			const on = s[sl.key];
			const v = s[sl.key + "Volume"];
			const active = focused === sl.key || this.dragging === sl.key;
			ctx.save();
			ctx.globalAlpha = on ? 1 : 0.5;
			text(ctx, sl.label + " " + (on ? Math.round(v * 100) + " %" : ": coupé"), CX, sl.y - 16,
				{ size: 14, color: active ? "#ffe060" : "#fff", outline: "#4a1470" });
			ctx.fillStyle = "rgba(40,0,70,0.6)";
			roundRect(ctx, SLIDER_X, sl.y - 4, SLIDER_W, 8, 4);
			ctx.fill();
			ctx.fillStyle = active ? "#ffe060" : "#b4f08a";
			roundRect(ctx, SLIDER_X, sl.y - 4, Math.max(8, SLIDER_W * v), 8, 4);
			ctx.fill();
			ctx.fillStyle = "#fff";
			circle(ctx, SLIDER_X + SLIDER_W * v, sl.y, active ? 8 : 6);
			ctx.fill();
			ctx.strokeStyle = "#4a1470";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.restore();
		}
		if (focused === "music" || focused === "sounds")
			text(ctx, "\u2191 \u2193 : volume", CX, 268, { size: 11, color: "rgba(255,255,255,0.8)", weight: "700" });
	}

	drawBall(ctx, b) {
		const k = this.k;
		ctx.save();
		ctx.translate(b.px + (b.x - b.px) * k, b.py + (b.y - b.py) * k);
		b.art.draw(ctx);
		ctx.restore();
	}
}

/** Applies the sound settings. */
export function applySettings() {
	const s = app.save.settings;
	app.audio.setMusicEnabled(s.music);
	app.audio.setSoundsEnabled(s.sounds);
	app.audio.setMusicVolume(s.musicVolume);
	app.audio.setSoundsVolume(s.soundsVolume);
}
