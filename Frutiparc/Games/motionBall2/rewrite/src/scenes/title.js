/**
 * The title screen, the intro of the original (Intro.as) with its symbols :
 * the letters "Motion" grow, "Ball" rolls in, they fly away, the big "2"
 * ("deux") falls and cracks the screen ("fissure"), the letters come back and
 * "press start" appears. Waits for a key, a click or a tap (which also allows
 * the browser to play sound), then goes to the menu.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { clip } from "../gfx/xfl/index.js";
import { randInt } from "../engine/math.js";
import { MUSIC_VOLUME } from "../sounds.js";
import { app } from "../app.js";
import { MenuScene } from "./menu.js";

const FRAME = 1 / 40;

/** A colour transform replacing the colour (Color.setRGB). */
const rgb = (r, g, b) => ({ am: 1, rm: 0, gm: 0, bm: 0, ao: 0, ro: r, go: g, bo: b });

/**
 * A symbol placed like a movie clip (x, y, rotation in degrees, scale in %).
 * It keeps its place of the previous step : it is drawn in between, so that
 * it moves smoothly on any screen although the intro runs 40 steps per second.
 */
class Mc {

	constructor(name, frame = 0) {
		this.art = clip(name);
		this.art.gotoAndStop(frame);
		this.x = 0;
		this.y = 0;
		this.rotation = 0;
		this.xscale = 100;
		this.yscale = 100;
		this.color = null;
		this.prev = null;
	}

	/** Keeps the place of this step. */
	snapshot() {
		this.prev = { x: this.x, y: this.y, rotation: this.rotation, xscale: this.xscale, yscale: this.yscale };
	}

	/** Draws between the previous step (k = 0) and this one (k = 1). */
	draw(ctx, k = 1) {
		const p = this.prev || this;
		const lerp = (a, b) => a + (b - a) * k;
		// (the rotation takes the short way, it wraps around at 180)
		const dr = ((this.rotation - p.rotation + 540) % 360) - 180;
		ctx.save();
		ctx.translate(lerp(p.x, this.x), lerp(p.y, this.y));
		ctx.rotate((p.rotation + dr * k) * Math.PI / 180);
		ctx.scale(lerp(p.xscale, this.xscale) / 100, lerp(p.yscale, this.yscale) / 100);
		this.art.draw(ctx, this.color);
		ctx.restore();
	}
}

export class TitleScene {

	constructor() {
		this.leaving = false;
		this.clock = 0;
		this.totTime = 0;
		this.menuTime = 0;
		this.phase = 0;
		this.scaleFactor = 10;
		this.scaleWay = true;
		this.shake = 0;

		this.bg = new Mc("intro_bg");
		this.letters = [];
		this.fissures = [];
		this.shadeDeux = null;
		this.deux = null;
		this.pressStart = null;
		for (let i = 0; i < 10; i++) {
			const t = new Mc("title", i);
			if (i < 6) {
				t.x = i * 80 + 110;
				t.y = 100 + randInt(10);
				t.baseY = t.y;
				t.xscale = t.yscale = 0;
			} else {
				t.dx = (i - 6) * 70 + 200;
				t.dy = 280 + randInt(10);
				t.baseY = t.dy;
				t.sx = (t.dx - 305) * 10 + 305;
				t.sy = 400 + randInt(100);
				t.x = t.sx;
				t.y = t.sy;
			}
			this.letters.push(t);
		}
	}

	update(dt) {
		const input = app.input;
		if (!this.leaving && (input.pressed("confirm") || input.pressed("pause") || input.pointer)) {
			this.leaving = true;
			app.audio.unlock();
			app.audio.play("menuEnter");
			app.audio.playMusic("musicMenu", MUSIC_VOLUME);
			app.scenes.goto(new MenuScene());
			return;
		}
		// (the original was tuned per frame, at 40 frames per second)
		this.clock += dt;
		while (this.clock >= FRAME) {
			this.clock -= FRAME;
			this.step();
		}
	}

	/** The breathing of the letters. */
	breathe(t, i) {
		return 100 + this.scaleFactor * Math.cos(i + this.totTime / 20);
	}

	/** Everything drawn by the intro. */
	get all() {
		return [this.bg, this.shadeDeux, ...this.fissures, this.deux, this.pressStart, ...this.letters].filter(Boolean);
	}

	step() {
		for (const mc of this.all)
			mc.snapshot();
		this.totTime++;
		this.menuTime = Math.min(1, this.menuTime + 1 / 30);
		const L = this.letters;

		switch (this.phase) {
		case 0:
			// "Motion" grows, "Ball" rolls in
			for (let i = 0; i < 6; i++) {
				const t = L[i];
				const s = this.menuTime * 100 + this.scaleFactor * Math.cos(i + this.totTime / 20);
				t.y = t.baseY + (s - 100) / 2;
				t.xscale = t.yscale = s;
			}
			for (let i = 6; i < 10; i++) {
				const t = L[i];
				t.x = (t.dx - t.sx) * this.menuTime + t.sx;
				t.y = (t.dy - t.sy) * this.menuTime + t.sy;
				t.rotation += 10 + randInt(3);
				t.retrot = true;
				t.rotspeed = 1;
				t.rotfactor = 2;
			}
			if (this.menuTime === 1)
				this.phase++;
			break;

		case 1:
			for (let i = 0; i < 10; i++) {
				const t = L[i];
				const s = this.breathe(t, i);
				t.y = t.baseY + (s - 100) / 2;
				t.xscale = t.yscale = s;
				this.unroll(t);
			}
			// the shadow of the "2"
			if (this.totTime > 80 && !this.shadeDeux) {
				const d = this.shadeDeux = new Mc("deux");
				d.color = rgb(0x92, 0x41, 0xC2);
				d.time = 1;
				d.x = 305;
				d.y = 205;
				d.xscale = d.yscale = 300;
			}
			if (this.totTime > 100) {
				// the letters fly away from the centre
				for (const t of L) {
					t.sx = t.x;
					t.sy = t.y / 2;
					t.dx = t.x - 305;
					t.dy = t.y - 205;
					const l = Math.hypot(t.dx, t.dy);
					t.dx /= l;
					t.dy /= l;
				}
				this.phase++;
			}
			break;

		case 2: {
			const d = this.shadeDeux;
			d.xscale++;
			d.yscale++;
			d.time -= 1 / 70;
			d.color = rgb(0x92 * d.time, 0x41 * d.time, 0xC2 * d.time);
			let gone = true;
			for (const t of L) {
				t.x += t.dx * 10;
				t.y += t.dy * 10;
				t.dx *= 1.2;
				t.dy *= 1.2;
				if (t.x > -50 && t.x < 660)
					gone = false;
			}
			if (gone) {
				const deux = this.deux = new Mc("deux");
				deux.x = 305;
				deux.y = 800;
				deux.xscale = deux.yscale = 800;
				this.deuxSpeed = 3;
				this.phase++;
			}
			break;
		}

		case 3: {
			// the "2" falls on its shadow
			const deux = this.deux;
			const shade = this.shadeDeux;
			this.deuxSpeed *= 1.06;
			if (deux.y >= shade.y)
				deux.y = Math.max(shade.y, deux.y - this.deuxSpeed);
			if (deux.xscale >= shade.xscale) {
				deux.xscale -= this.deuxSpeed / 1.2;
				deux.yscale -= this.deuxSpeed / 1.2;
			} else {
				// it lands : the screen shakes and cracks
				this.shadeDeux = null;
				deux.sy = deux.y;
				this.phase++;
				this.shake = 5;
				this.shakeWay = 1;
				for (let i = 0; i < 20; i++) {
					const f = new Mc("fissure", randInt(3));
					f.rotation = 360 * i / 20;
					f.xscale = 100 + randInt(50);
					f.yscale = 100 + randInt(50);
					f.x = deux.x;
					f.y = deux.y;
					this.fissures.push(f);
				}
			}
			break;
		}

		case 4:
			this.shakeY = this.shake * this.shakeWay;
			this.shake -= 0.3;
			if (this.shake <= 0)
				this.phase++;
			this.shakeWay *= -1;
			break;

		case 5: {
			// the letters come back, higher
			this.shakeY = 0;
			let back = true;
			L.forEach((t, i) => {
				const s = this.breathe(t, i);
				t.x += (t.sx - t.x) / 10;
				t.y += (t.sy - t.y) / 10;
				t.xscale = t.yscale = s;
				if (Math.abs(t.x - t.sx) + Math.abs(t.y - t.sy) > 3)
					back = false;
			});
			if (back) {
				this.phase++;
				this.fade = 0;
				this.pressStart = new Mc("press start");
			}
			break;
		}

		case 6: {
			// the "2" fades to a violet tint ; the letters breathe and sometimes spin
			this.fade = Math.min(255, this.fade + 10);
			const k = 1 - this.fade / 255;
			this.deux.color = { am: 1, rm: k, gm: k, bm: k, ao: 0, ro: this.fade * 0.4, go: 0, bo: this.fade * 0.5 };
			L.forEach((t, i) => {
				const s = this.breathe(t, i);
				t.y = t.baseY / 2 + (s - 100) / 2;
				t.xscale = t.yscale = s;
				if (!t.hasrot && !t.retrot && randInt(1000) === 0) {
					t.rotfactor = 5 + randInt(2);
					t.rotspeed = 1;
					t.hasrot = true;
				}
				if (t.hasrot) {
					t.rotspeed *= 1.03;
					t.rotation += t.rotfactor * t.rotspeed;
					if (t.rotspeed > 3)
						t.rotfactor *= 0.95;
					if (t.rotspeed * t.rotfactor < 4) {
						t.hasrot = false;
						t.retrot = true;
					}
				}
				this.unroll(t);
			});
			if (randInt(30) === 0 || this.scaleFactor < 5 || this.scaleFactor > 15)
				this.scaleWay = !this.scaleWay;
			this.scaleFactor += this.scaleWay ? 0.1 : -0.1;
			break;
		}
		}
	}

	/** A letter that spun turns on until it is upright again. */
	unroll(t) {
		if (t.retrot) {
			t.rotation += t.rotfactor * t.rotspeed;
			t.rotation = ((t.rotation + 180) % 360 + 360) % 360 - 180;
			if (Math.abs(t.rotation) < 5)
				t.retrot = false;
		}
	}

	render(ctx) {
		// (between the last two steps)
		const k = Math.min(1, this.clock / FRAME);
		ctx.fillStyle = "#000";
		ctx.fillRect(0, 0, W, H);
		ctx.save();
		ctx.translate(0, this.shakeY || 0);
		// (the depths of the original : background, shadow and cracks, the "2", the letters)
		for (const mc of this.all)
			mc.draw(ctx, k);
		ctx.restore();
	}
}
