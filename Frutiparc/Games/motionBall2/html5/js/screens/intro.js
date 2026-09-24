/*
 * The title screen. Port of mb2/Intro.as.
 *
 * Phases (menu_phase) :
 *   0  "MOTION" grows, "BALL" flies in spinning
 *   1  the letters wave ; the shadow of the "2" appears
 *   2  the letters fly away
 *   3  a huge "2" falls on its shadow
 *   4  impact : the screen shakes, cracks appear
 *   5  the letters come back
 *   6  idle ("Cliquez pour commencer"), letters spin from time to time
 * A click (or a key) goes to the menu.
 */
"use strict";

(function () {

	const Std = MB2.Std;
	const Sound = MB2.Sound;
	const G = MB2.G;
	const SG = MB2.ScreenGfx;
	const TAU = Math.PI * 2;
	const CX = 305;
	const CY = 205;

	const LETTER_SIZE = 66;

	MB2.Intro = class {

		constructor() {
			this.letters = [];
			const TITLE = "MOTIONBALL";
			for (let i = 0; i < 10; i++) {
				const t = { ch: TITLE[i], x: 0, y: 0, rotation: 0, xscale: 100, yscale: 100 };
				if (i < 6) {
					// MOTION : grows in place
					t.x = i * 80 + 105;
					t.y = 100 + random(10);
					t.base_y = t.y;
					t.xscale = 0;
					t.yscale = 0;
				} else {
					// BALL : comes from far below (sx, sy) to (dx, dy)
					t.dx = (i - 6) * 70 + 200;
					t.dy = 280 + random(10);
					t.base_y = t.dy;
					t.sx = (t.dx - CX) * 10 + CX;
					t.sy = 400 + random(100);
					t.x = t.sx;
					t.y = t.sy;
				}
				this.letters[i] = t;
			}

			this.fissures = [];
			this.tot_time = 0;
			this.menu_time = 0;       // 0..1 progress of the first phase
			this.menu_phase = 0;
			this.scale_factor = 10;   // amplitude of the waving
			this.scale_factor_way = true;
			this.shake = 0;
			this.shade_deux = null;   // the shadow of the "2"
			this.deux = null;         // the "2"
			this.press_start = false;
			this.clicked = false;

			Sound.playMusic(Sound.MUSIC_INTRO);
		}

		onMouseDown() {
			if (!this.clicked) {
				this.clicked = true;
				MB2.Manager.gotoMenu();
			}
		}

		onKey() {
			this.onMouseDown();
		}

		/** Waving scale of letter i. */
		wave(i) {
			return 100 + this.scale_factor * Math.cos(i + this.tot_time / 20);
		}

		/** Rotation of a letter back to 0 after a spin. */
		spinBack(t, tmod) {
			if (!t.retrot)
				return;
			t.rotation = (t.rotation + tmod * t.rotfactor * t.rotspeed) % 360;
			if (Math.abs(t.rotation) < 5 || Math.abs(t.rotation - 360) < 5) {
				t.retrot = false;
				t.rotation = 0;
			}
		}

		main() {
			const tmod = Std.tmod;
			this.tot_time += tmod;
			this.menu_time = Math.min(1, this.menu_time + tmod / 30);

			switch (this.menu_phase) {
			case 0:
				this.phase_appear(tmod);
				break;
			case 1:
				this.phase_wave(tmod);
				break;
			case 2:
				this.phase_fly_away(tmod);
				break;
			case 3:
				this.phase_fall(tmod);
				break;
			case 4:
				this.shake = this.menu_trembl * this.menu_trembl_way;
				this.menu_trembl -= 0.3;
				if (this.menu_trembl <= 0)
					this.menu_phase++;
				this.menu_trembl_way *= -1;
				break;
			case 5:
				this.phase_come_back();
				break;
			case 6:
				this.phase_idle(tmod);
				break;
			}
		}

		phase_appear(tmod) {
			const L = this.letters;
			for (let i = 0; i < 6; i++) {
				const t = L[i];
				const s = this.menu_time * 100 + this.scale_factor * Math.cos(i + this.tot_time / 20);
				t.y = t.base_y + (s - 100) / 2;
				t.xscale = s;
				t.yscale = s;
			}
			for (let i = 6; i < 10; i++) {
				const t = L[i];
				t.x = (t.dx - t.sx) * this.menu_time + t.sx;
				t.y = (t.dy - t.sy) * this.menu_time + t.sy;
				t.rotation += 10 * tmod + random(3);
				t.retrot = true;
				t.rotspeed = 1;
				t.rotfactor = 2;
			}
			if (this.menu_time === 1)
				this.menu_phase++;
		}

		phase_wave(tmod) {
			const L = this.letters;
			for (let i = 0; i < 10; i++) {
				const t = L[i];
				const s = this.wave(i);
				t.y = t.base_y + (s - 100) / 2;
				t.xscale = s;
				t.yscale = s;
				this.spinBack(t, tmod);
			}

			if (this.shade_deux)
				this.shade_deux.alpha += tmod / 2;
			if (this.tot_time > 80 && !this.shade_deux)
				this.shade_deux = { x: CX, y: CY, xscale: 300, yscale: 300, time: 1, alpha: 0 };

			if (this.tot_time > 100) {
				// each letter flies away from the center ; it will come back at (sx, sy)
				for (const t of L) {
					t.sx = t.x;
					t.sy = t.y / 2;
					t.dx = t.x - CX;
					t.dy = t.y - CY;
					const l = Math.sqrt(t.dx * t.dx + t.dy * t.dy) || 1;
					t.dx /= l;
					t.dy /= l;
				}
				this.menu_phase++;
			}
		}

		phase_fly_away(tmod) {
			const sd = this.shade_deux;
			sd.xscale += tmod;
			sd.yscale += tmod;
			sd.time -= tmod / 70;   // the shadow darkens

			let allGone = true;
			for (const t of this.letters) {
				t.x += t.dx * 10;
				t.y += t.dy * 10;
				t.dx *= Math.pow(1.2, tmod);
				t.dy *= Math.pow(1.2, tmod);
				if (t.x > -50 && t.x < 660)
					allGone = false;
			}
			if (allGone) {
				this.deux = { x: CX, y: 800, xscale: 800, yscale: 800, color: 0 };
				this.deux_speed = 3;
				this.menu_phase++;
			}
		}

		phase_fall(tmod) {
			const d = this.deux;
			const sd = this.shade_deux;
			this.deux_speed *= Math.pow(1.06, tmod);
			if (d.y >= sd.y) {
				d.y = Math.max(sd.y, d.y - tmod * this.deux_speed);
			}
			if (d.xscale >= sd.xscale) {
				d.xscale -= tmod * this.deux_speed / 1.2;
				d.yscale -= tmod * this.deux_speed / 1.2;
				return;
			}

			// impact
			this.shade_deux = null;
			d.sy = d.y;
			this.menu_phase++;
			this.menu_trembl = 5;
			this.menu_trembl_way = 1;
			for (let i = 0; i < 20; i++) {
				this.fissures.push({
					rot: TAU * i / 20 + Math.random() * 0.2,
					len: 120 + random(150),
					seed: random(1000),
					w: 1 + Math.random() * 2
				});
			}
		}

		phase_come_back() {
			this.shake = 0;
			let arrived = true;
			for (let i = 0; i < 10; i++) {
				const t = this.letters[i];
				const s = this.wave(i);
				t.x += (t.sx - t.x) / 10;
				t.y += (t.sy - t.y) / 10;
				t.xscale = s;
				t.yscale = s;
				if (Math.abs(t.x - t.sx) + Math.abs(t.y - t.sy) > 3)
					arrived = false;
			}
			if (arrived) {
				this.menu_phase++;
				this.fade_time = 0;
				this.press_start = true;
			}
		}

		phase_idle(tmod) {
			this.fade_time = Math.min(255, this.fade_time + tmod * 10);
			this.deux.color = this.fade_time / 255;

			for (let i = 0; i < 10; i++) {
				const t = this.letters[i];
				const s = this.wave(i);
				t.y = (t.base_y / 2) + (s - 100) / 2;
				t.xscale = s;
				t.yscale = s;

				// sometimes a letter spins : it accelerates, slows down, then goes back to 0
				if (!t.hasrot && !t.retrot && random(1000) === 0) {
					t.rotfactor = 5 + random(2);
					t.rotspeed = 1;
					t.hasrot = true;
				}
				if (t.hasrot) {
					t.rotspeed *= Math.pow(1.03, tmod);
					t.rotation += tmod * t.rotfactor * t.rotspeed;
					if (t.rotspeed > 3)
						t.rotfactor *= Math.pow(0.95, tmod);
					if (t.rotspeed * t.rotfactor < 4) {
						t.hasrot = false;
						t.retrot = true;
					}
				}
				this.spinBack(t, tmod);
			}

			if (random(30) === 0 || this.scale_factor < 5 || this.scale_factor > 15)
				this.scale_factor_way = !this.scale_factor_way;
			this.scale_factor += this.scale_factor_way ? 0.1 : -0.1;
		}

		// ----- drawing -----

		/** The "2" : either a flat colour (its shadow) or the yellow digit. */
		drawDeux(ctx, d, fill, alpha) {
			ctx.save();
			ctx.translate(d.x, d.y);
			ctx.scale(d.xscale / 100, d.yscale / 100);
			ctx.globalAlpha *= alpha;
			ctx.font = "800 64px " + MB2.FONT;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.lineJoin = "round";

			if (fill) {
				ctx.fillStyle = fill;
				ctx.fillText("2", 0, 4);
			} else {
				ctx.lineWidth = 10;
				ctx.strokeStyle = "#3a0a58";
				ctx.strokeText("2", 0, 4);
				ctx.lineWidth = 4;
				ctx.strokeStyle = "#ffffff";
				ctx.strokeText("2", 0, 4);
				const g = ctx.createLinearGradient(0, -30, 0, 34);
				g.addColorStop(0, "#fff38a");
				g.addColorStop(1, "#ffb000");
				ctx.fillStyle = g;
				ctx.fillText("2", 0, 4);
				// in the idle phase it turns purple-ish
				if (d.color > 0) {
					ctx.globalAlpha *= d.color * 0.55;
					ctx.fillStyle = "#cc66ff";
					ctx.fillText("2", 0, 4);
				}
			}
			ctx.restore();
		}

		drawFissures(ctx) {
			ctx.strokeStyle = "rgba(40,0,60,0.7)";
			for (const f of this.fissures) {
				ctx.lineWidth = f.w;
				ctx.beginPath();
				let x = this.deux.x;
				let y = this.deux.y;
				ctx.moveTo(x, y);
				let a = f.rot;
				const STEPS = 6;
				for (let k = 1; k <= STEPS; k++) {
					a += Math.sin(f.seed + k * 7) * 0.35;
					x += Math.cos(a) * f.len / STEPS;
					y += Math.sin(a) * f.len / STEPS;
					ctx.lineTo(x, y);
				}
				ctx.stroke();
			}
		}

		draw(ctx) {
			ctx.save();
			ctx.translate(0, this.shake);
			SG.drawSunburst(ctx, this.tot_time / 300);

			const sd = this.shade_deux;
			if (sd) {
				const k = Math.max(0, sd.time);
				const color = "rgb(" + ((0x92 * k) | 0) + "," + ((0x41 * k) | 0) + "," + ((0xC2 * k) | 0) + ")";
				this.drawDeux(ctx, sd, color, Math.min(1, sd.alpha / 100));
			}
			if (this.deux) {
				this.drawFissures(ctx);
				this.drawDeux(ctx, this.deux, null, 1);
			}

			for (const t of this.letters) {
				ctx.save();
				// (the letters of the original had their registration point on top)
				ctx.translate(t.x, t.y + 30);
				ctx.rotate(t.rotation * Math.PI / 180);
				ctx.scale(Math.max(0.001, t.xscale / 100), Math.max(0.001, t.yscale / 100));
				SG.drawLetter(ctx, t.ch, LETTER_SIZE);
				ctx.restore();
			}

			if (this.press_start && ((this.tot_time / 12) | 0) % 2 === 0)
				G.text(ctx, "Cliquez pour commencer", CX, 375, 22, "#ffffff", "#4a1470");

			ctx.restore();
		}

		destroy() { }
	};

})();
