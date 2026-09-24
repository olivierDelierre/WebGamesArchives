// MotionBall 2 - HTML5 port : screens
// Port of mb2/Intro.as, Menu.as, Transition.as, Text.as, Pause.as, GameOver.as, GameOverCourse.as
"use strict";

(function () {

const Const = MB2.Const, Std = MB2.Std, Sound = MB2.Sound, G = MB2.G;
const TAU = Math.PI * 2;

function drawSunburst(ctx, rot, scale) {
	ctx.fillStyle = "#6e32a0";
	ctx.fillRect(0, 0, 610, 410);
	const i = MB2.img.roue;
	if (i && i.naturalWidth) {
		ctx.save();
		ctx.translate(305, 205);
		ctx.rotate(rot);
		const s = 1.2 * (scale || 1);
		ctx.drawImage(i, -351 * s, -351 * s, 702 * s, 702 * s);
		ctx.restore();
	}
	const g = ctx.createRadialGradient(305, 205, 60, 305, 205, 380);
	g.addColorStop(0, "rgba(255,255,255,0.15)");
	g.addColorStop(1, "rgba(40,0,70,0.5)");
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 610, 410);
}

// bubbly title letters
function drawLetter(ctx, ch, size) {
	ctx.font = "800 " + size + "px " + MB2.FONT;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.lineJoin = "round";
	ctx.lineWidth = size / 5;
	ctx.strokeStyle = "#4a1470";
	ctx.strokeText(ch, 0, 0);
	ctx.lineWidth = size / 9;
	ctx.strokeStyle = "#ffffff";
	ctx.strokeText(ch, 0, 0);
	const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
	g.addColorStop(0, "#e9c4ff");
	g.addColorStop(0.5, "#b060e8");
	g.addColorStop(1, "#7a2ab8");
	ctx.fillStyle = g;
	ctx.fillText(ch, 0, 0);
	ctx.fillStyle = "rgba(255,255,255,0.45)";
	ctx.fillText(ch, 0, -size * 0.06);
	ctx.fillStyle = g;
	ctx.fillText(ch, 0, size * 0.03);
}

// ===========================================================================
// Text (connexion / loading message)
MB2.Text = class {
	constructor(txt) { this.txt = txt; this.t = 0; }
	setText(t) { this.txt = t; }
	main() { this.t++; }
	draw(ctx) {
		drawSunburst(ctx, this.t / 200);
		MB2.drawPanel(ctx, 305, 205, 300, 110, 1);
		G.text(ctx, this.txt, 305, 205, 18, "#7a3a00");
	}
	destroy() { }
};

// yellow rounded panel (panGameOver)
MB2.drawPanel = function (ctx, x, y, w, h, s) {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(s, s);
	ctx.fillStyle = "rgba(90,40,0,0.3)";
	G.rrect(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 22); ctx.fill();
	const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
	g.addColorStop(0, "#ffe04a");
	g.addColorStop(1, "#ffb400");
	ctx.fillStyle = g;
	G.rrect(ctx, -w / 2, -h / 2, w, h, 22); ctx.fill();
	ctx.lineWidth = 4; ctx.strokeStyle = "#e08a00"; ctx.stroke();
	ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.6)";
	G.rrect(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 17); ctx.stroke();
	ctx.restore();
};
function bubbleTitle(ctx, txt, x, y, size) {
	ctx.save();
	ctx.translate(x, y);
	ctx.font = "800 " + size + "px " + MB2.FONT;
	ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
	ctx.lineWidth = size / 4; ctx.strokeStyle = "#c86a00"; ctx.strokeText(txt, 0, 0);
	ctx.lineWidth = size / 9; ctx.strokeStyle = "#fff6c0"; ctx.strokeText(txt, 0, 0);
	const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
	g.addColorStop(0, "#fff7a0"); g.addColorStop(1, "#ffc000");
	ctx.fillStyle = g; ctx.fillText(txt, 0, 0);
	ctx.restore();
}

// ===========================================================================
// Intro
MB2.Intro = class {
	constructor() {
		this.letters = [];
		const CH = "MOTIONBALL";
		for (let i = 0; i < 10; i++) {
			const t = { ch: CH[i], x: 0, y: 0, rotation: 0, xscale: 100, yscale: 100 };
			if (i < 6) {
				t.x = i * 80 + 105;
				t.y = 100 + random(10);
				t.base_y = t.y;
				t.xscale = 0;
				t.yscale = 0;
			} else {
				t.dx = (i - 6) * 70 + 200;
				t.dy = 280 + random(10);
				t.base_y = t.dy;
				t.sx = (t.dx - 305) * 10 + 305;
				t.sy = 400 + random(100);
				t.x = t.sx;
				t.y = t.sy;
			}
			this.letters[i] = t;
		}
		this.fissures = [];
		this.tot_time = 0;
		this.menu_time = 0;
		this.menu_phase = 0;
		this.scale_factor = 10;
		this.scale_factor_way = true;
		this.shake = 0;
		this.shade_deux = null;
		this.deux = null;
		this.press_start = false;
		Sound.playMusic(Sound.MUSIC_INTRO);
	}

	onMouseDown() {
		if (!this.clicked) {
			this.clicked = true;
			MB2.Manager.gotoMenu();
		}
	}

	main() {
		const tmod = Std.tmod;
		const L = this.letters;
		this.tot_time += tmod;
		this.menu_time += tmod / 30;
		if (this.menu_time > 1) this.menu_time = 1;
		switch (this.menu_phase) {
		case 0:
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
			if (this.menu_time === 1) this.menu_phase++;
			break;
		case 1:
			for (let i = 0; i < 10; i++) {
				const t = L[i];
				const s = 100 + this.scale_factor * Math.cos(i + this.tot_time / 20);
				t.y = t.base_y + (s - 100) / 2;
				t.xscale = s;
				t.yscale = s;
				if (t.retrot) {
					t.rotation = (t.rotation + tmod * t.rotfactor * t.rotspeed) % 360;
					if (Math.abs(t.rotation) < 5 || Math.abs(t.rotation - 360) < 5) { t.retrot = false; t.rotation = 0; }
				}
			}
			if (this.shade_deux) this.shade_deux.alpha += tmod / 2;
			if (this.tot_time > 80 && !this.shade_deux)
				this.shade_deux = { x: 305, y: 205, xscale: 300, yscale: 300, time: 1, alpha: 0 };
			if (this.tot_time > 100) {
				for (const t of L) {
					t.sx = t.x;
					t.sy = t.y;
					t.dx = t.sx - 305;
					t.dy = t.sy - 205;
					t.sy /= 2;
					const l = Math.sqrt(t.dx * t.dx + t.dy * t.dy) || 1;
					t.dx /= l;
					t.dy /= l;
				}
				this.menu_phase++;
			}
			break;
		case 2: {
			const sd = this.shade_deux;
			sd.xscale += tmod;
			sd.yscale += tmod;
			sd.time -= tmod / 70;
			let b = true;
			for (const t of L) {
				t.x += t.dx * 10;
				t.y += t.dy * 10;
				t.dx *= Math.pow(1.2, tmod);
				t.dy *= Math.pow(1.2, tmod);
				if (t.x > -50 && t.x < 660) b = false;
			}
			if (b) {
				this.deux = { x: 305, y: 800, xscale: 800, yscale: 800, color: 0 };
				this.deux_speed = 3;
				this.menu_phase++;
			}
			break;
		}
		case 3: {
			const d = this.deux, sd = this.shade_deux;
			this.deux_speed *= Math.pow(1.06, tmod);
			if (d.y >= sd.y) {
				d.y -= tmod * this.deux_speed;
				if (d.y < sd.y) d.y = sd.y;
			}
			if (d.xscale >= sd.xscale) {
				d.xscale -= tmod * this.deux_speed / 1.2;
				d.yscale -= tmod * this.deux_speed / 1.2;
			} else {
				this.shade_deux = null;
				d.sy = d.y;
				this.menu_phase++;
				this.menu_trembl = 5;
				this.menu_trembl_way = 1;
				for (let i = 0; i < 20; i++)
					this.fissures.push({ rot: TAU * i / 20 + Math.random() * 0.2, len: 120 + random(150), seed: random(1000), w: 1 + Math.random() * 2 });
			}
			break;
		}
		case 4:
			this.shake = this.menu_trembl * this.menu_trembl_way;
			this.menu_trembl -= 0.3;
			if (this.menu_trembl <= 0) this.menu_phase++;
			this.menu_trembl_way *= -1;
			break;
		case 5: {
			this.shake = 0;
			let b = true;
			for (let i = 0; i < 10; i++) {
				const t = L[i];
				const s = 100 + this.scale_factor * Math.cos(i + this.tot_time / 20);
				t.x += (t.sx - t.x) / 10;
				t.y += (t.sy - t.y) / 10;
				t.xscale = s;
				t.yscale = s;
				if (Math.abs(t.x - t.sx) + Math.abs(t.y - t.sy) > 3) b = false;
			}
			if (b) {
				this.menu_phase++;
				this.fade_time = 0;
				this.press_start = true;
			}
			break;
		}
		case 6:
			this.fade_time += tmod * 10;
			if (this.fade_time > 255) this.fade_time = 255;
			this.deux.color = this.fade_time / 255;
			for (let i = 0; i < 10; i++) {
				const t = L[i];
				const s = 100 + this.scale_factor * Math.cos(i + this.tot_time / 20);
				t.y = (t.base_y / 2) + (s - 100) / 2;
				t.xscale = s;
				t.yscale = s;
				if (!t.hasrot && !t.retrot && random(1000) === 0) {
					t.rotfactor = 5 + random(2);
					t.rotspeed = 1;
					t.hasrot = true;
				}
				if (t.hasrot) {
					t.rotspeed *= Math.pow(1.03, tmod);
					t.rotation += tmod * t.rotfactor * t.rotspeed;
					if (t.rotspeed > 3) t.rotfactor *= Math.pow(0.95, tmod);
					if (t.rotspeed * t.rotfactor < 4) {
						t.hasrot = false;
						t.retrot = true;
					}
				}
				if (t.retrot) {
					t.rotation = (t.rotation + tmod * t.rotfactor * t.rotspeed) % 360;
					if (Math.abs(t.rotation) < 5 || Math.abs(t.rotation - 360) < 5) { t.retrot = false; t.rotation = 0; }
				}
			}
			if (random(30) === 0 || this.scale_factor < 5 || this.scale_factor > 15)
				this.scale_factor_way = !this.scale_factor_way;
			this.scale_factor += this.scale_factor_way ? 0.1 : -0.1;
			break;
		}
	}

	drawDeux(ctx, d, fill, alpha) {
		ctx.save();
		ctx.translate(d.x, d.y);
		ctx.scale(d.xscale / 100, d.yscale / 100);
		ctx.globalAlpha *= alpha;
		ctx.font = "800 64px " + MB2.FONT;
		ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fillText("2", 0, 4);
		} else {
			ctx.lineWidth = 10; ctx.strokeStyle = "#3a0a58"; ctx.strokeText("2", 0, 4);
			ctx.lineWidth = 4; ctx.strokeStyle = "#ffffff"; ctx.strokeText("2", 0, 4);
			const g = ctx.createLinearGradient(0, -30, 0, 34);
			g.addColorStop(0, "#fff38a"); g.addColorStop(1, "#ffb000");
			ctx.fillStyle = g;
			ctx.fillText("2", 0, 4);
			// fade toward purple (setTransform of phase 6)
			if (d.color > 0) {
				ctx.globalAlpha *= d.color * 0.55;
				ctx.fillStyle = "#cc66ff";
				ctx.fillText("2", 0, 4);
			}
		}
		ctx.restore();
	}

	draw(ctx) {
		ctx.save();
		ctx.translate(0, this.shake);
		drawSunburst(ctx, this.tot_time / 300);
		const sd = this.shade_deux;
		if (sd) {
			const k = Math.max(0, sd.time);
			const col = "rgb(" + ((0x92 * k) | 0) + "," + ((0x41 * k) | 0) + "," + ((0xC2 * k) | 0) + ")";
			this.drawDeux(ctx, sd, col, Math.min(1, sd.alpha / 100));
		}
		if (this.deux) {
			// cracks
			ctx.strokeStyle = "rgba(40,0,60,0.7)";
			for (const f of this.fissures) {
				ctx.lineWidth = f.w;
				ctx.beginPath();
				let x = this.deux.x, y = this.deux.y;
				ctx.moveTo(x, y);
				let a = f.rot;
				const n = 6;
				for (let k = 1; k <= n; k++) {
					a += Math.sin(f.seed + k * 7) * 0.35;
					x += Math.cos(a) * f.len / n;
					y += Math.sin(a) * f.len / n;
					ctx.lineTo(x, y);
				}
				ctx.stroke();
			}
			this.drawDeux(ctx, this.deux, null, 1);
		}
		for (let i = 0; i < 10; i++) {
			const t = this.letters[i];
			ctx.save();
			ctx.translate(t.x, t.y + 30);
			ctx.rotate(t.rotation * Math.PI / 180);
			ctx.scale(Math.max(0.001, t.xscale / 100), Math.max(0.001, t.yscale / 100));
			drawLetter(ctx, t.ch, 66);
			ctx.restore();
		}
		if (this.press_start && ((this.tot_time / 12) | 0) % 2 === 0)
			G.text(ctx, "Cliquez pour commencer", 305, 375, 22, "#ffffff", "#4a1470");
		ctx.restore();
	}
	destroy() { }
};

// ===========================================================================
// Menu
const MENU_IDS = [
	[1, 2, 3, 4, 5, 6],
	[40, 41, 42, 43, 44, 45, 46, 47],
	[60, 61, 62, 63, 64, 65],
	[20, 22, 24]
];
const INFOS = [
	"",
	"CHALLENGE : explorez un donjon genere au hasard, trouvez les billes\net vainquez le monstre avant la fin du temps imparti !",
	"AVENTURE : quatre donjons elementaires gardes par des serpents,\npuis le donjon final... Qui s'y cache ?",
	"COURSE : faites trois tours de circuit le plus vite possible\nen passant les points de controle.",
	"CLASSIQUE : descendez de salle en salle par les trappes.\nChaque trappe rapporte quelques secondes !"
];
const DONJON_ICONS = ["donjon_eau", "donjon_feu", "donjon_vent", "donjon_terre"];
const DONJON_COLORS = [["#7ad0ff", "#1a5aa0"], ["#ff8a4a", "#a02a00"], ["#e8f4ff", "#7a8aa0"], ["#b8d86a", "#4a6a10"], ["#c080f0", "#4a1a78"]];

MB2.Menu = class {
	constructor() {
		this.balls = [];
		this.show(0);
		Sound.play(Sound.MENU_ENTER);
		this.cur_ray = 450;
		this.cur_ang = 0;
		this.ray_speed = -1.0;
		this.ray_acc = 1.05;
		this.ang_speed = 0.05;
		this.ang_acc = 1.01;
		this.cos_ray = 0;
		this.cos_speed = 0;
		this.menu_phase = 0;
		this.menu_time = 0;
		this.go_hole = false;
		this.hole = 0;
		this.infos = null;
		this.mouse_enabled = false;
		this.kb_sel = -1;
		this.bgrot = 0;
		Sound.playMusic(Sound.MUSIC_MENU);
	}

	show(n) {
		const P = MB2.Prefs, M = MB2.Manager;
		this.balls = [];
		const m = MENU_IDS[n];
		if (!m) return;
		for (let i = 0; i < m.length; i++) {
			let id = m[i];
			const b = { state: 1, x: -500, y: -500, sel: 0 };
			switch (id) {
			case 1: if (!P.challenge_mode_enabled) b.state = 0; break;
			case 2: if (!P.courses.some(x => x)) b.state = 0; break;
			case 3: if (!P.dungeons.some(x => x)) b.state = 0; break;
			case 4: if (!P.classic_mode_enabled) b.state = 0; break;
			case 20: if (!P.music_enabled) id += 1; break;
			case 22: if (!P.sound_enabled) id += 1; break;
			}
			if (id >= 40 && id <= 46 && !P.courses[id - 40]) b.state = 0;
			if (id >= 60 && id <= 64 && !P.dungeons[id - 60]) b.state = 0;
			if (id >= 60 && id <= 63) b.done = !!M.client.fcard.$dungeons_done[id - 60];
			switch (id) {
			case 1: b.infos = 1; break;
			case 2: b.infos = 3; break;
			case 3: b.infos = 2; break;
			case 4: b.infos = 4; break;
			}
			b.ang = i * 2 * Math.PI / m.length;
			b.id = id;
			this.balls.push(b);
		}
	}

	showInfos(i) {
		if (i === undefined) {
			if (this.infos) this.infos.dy = 10;
			return;
		}
		if (this.infos == null) this.infos = { frame: i, y: Const.LVL_HEIGHT + 50, dy: -10 };
		else { this.infos.dy = -10; this.infos.frame = i; }
	}

	select(b) {
		if (b.state === 1) {
			Sound.play(Sound.MENU_SELECT);
			b.state = 2;
			this.showInfos(b.infos);
		}
	}
	unselect(b) {
		if (b.state === 2) {
			b.state = 1;
			this.showInfos(undefined);
		}
	}
	enter(b) {
		if (this.menu_phase === 1 && b.state === 2) {
			Sound.play(Sound.MENU_ENTER);
			this.start(b.id);
		}
	}

	run_menu(n) {
		this.menu_phase = 3;
		this.next_menu_id = n;
		this.ray_speed = -5.0;
		this.ray_acc = 1.1;
		this.ang_speed = 0.2;
		this.ang_acc = 1.02;
		this.cos_speed = 0;
		this.cos_ray = 0;
		this.mouse_enabled = false;
	}

	run_mode(mname, mparam) {
		this.menu_phase = 2;
		this.next_mode = mname;
		this.next_mode_param = mparam;
		this.ray_speed = 7.0;
		this.ray_acc = 1.05;
		this.ang_speed = 0.1;
		this.ang_acc = 1.05;
		this.cos_speed = 0;
		this.cos_ray = 0;
		this.go_hole = true;
		this.mouse_enabled = false;
	}

	start(id) {
		const P = MB2.Prefs;
		switch (id) {
		case 1: case 7: this.run_mode(Const.MODE_CHALLENGE); break;
		case 2: this.run_menu(1); break;
		case 3: this.run_menu(2); break;
		case 4: this.run_mode(Const.MODE_CLASSIC); break;
		case 5: this.run_menu(3); break;
		case 6: this.run_mode(Const.MODE_AIDE); break;
		case 40: case 41: case 42: case 43: case 44: case 45: case 46:
			this.run_mode(Const.MODE_COURSE, id - 40); break;
		case 60: case 61: case 62: case 63: case 64:
			this.run_mode(Const.MODE_AVENTURE, id - 60); break;
		case 47: case 65: this.run_menu(0); break;
		case 20: case 21: P.toggleMusic(); this.run_menu(3); break;
		case 22: case 23: P.toggleSounds(); this.run_menu(3); break;
		case 24: MB2.Manager.client.savePrefs(); this.run_menu(0); break;
		}
	}

	change(xm) {
		const delta = Math.min(200, Math.abs(305 - xm));
		if (xm > 305) this.ang_speed = delta * 0.05 / 100;
		else this.ang_speed = -delta * 0.05 / 100;
	}

	ballAt(x, y) {
		for (const b of this.balls) {
			const dx = x - b.x, dy = y - b.y;
			if (dx * dx + dy * dy < 46 * 46) return b;
		}
		return null;
	}
	onMouseMove(x, y) {
		if (this.mouse_enabled) this.change(x);
		const h = this.ballAt(x, y);
		for (const b of this.balls) if (b !== h) this.unselect(b);
		if (h) this.select(h);
		this.kb_sel = -1;
	}
	onMouseDown(x, y) {
		const h = this.ballAt(x, y);
		if (h) { this.select(h); this.enter(h); }
	}
	onKey(k) {
		if (this.menu_phase !== 1 || !this.balls.length) return;
		const K = MB2.Key;
		if (k === K.LEFT || k === K.RIGHT || k === K.UP || k === K.DOWN) {
			const n = this.balls.length;
			let i = this.kb_sel;
			for (let tries = 0; tries < n; tries++) {
				i = (i < 0) ? 0 : (i + ((k === K.RIGHT || k === K.DOWN) ? 1 : n - 1)) % n;
				if (this.balls[i].state !== 0) break;
			}
			this.kb_sel = i;
			for (const b of this.balls) this.unselect(b);
			this.select(this.balls[i]);
		} else if ((k === K.ENTER || k === K.SPACE) && this.kb_sel >= 0)
			this.enter(this.balls[this.kb_sel]);
		else if (k === K.ESCAPE && MENU_IDS[0].indexOf(this.balls[0].id) < 0)
			this.start(this.balls[this.balls.length - 1].id);
	}

	main() {
		const tmod = Std.tmod;
		this.menu_time += tmod / 30;
		this.ray_speed *= Math.pow(this.ray_acc, tmod);
		this.bgrot += tmod / 400;
		const inf = this.infos;
		if (inf) {
			inf.y += inf.dy * tmod;
			if (inf.y > Const.LVL_HEIGHT + 50) this.infos = null;
			else if (inf.y < Const.LVL_HEIGHT - 40) inf.y = Const.LVL_HEIGHT - 40;
		}
		if (this.menu_phase > 1 && Math.abs(this.ray_speed) < 3) this.ray_speed = this.ray_speed < 0 ? -3 : 3;
		this.ang_speed *= Math.pow(this.ang_acc, tmod);
		this.cos_ray += this.cos_speed;
		this.cur_ray += this.ray_speed;
		this.cur_ang += this.ang_speed;
		if (this.cur_ang > Math.PI) this.cur_ang -= Math.trunc(this.cur_ang / TAU) * TAU;
		for (const b of this.balls) {
			const a = b.ang + this.cur_ang;
			const r = Math.cos(b.ang + this.menu_time) * this.cos_ray;
			b.x = Math.cos(a) * (this.cur_ray + r) + 305;
			b.y = Math.sin(a) * (this.cur_ray + r) + 205;
			b.sel += ((b.state === 2 ? 1 : 0) - b.sel) * 0.3;
		}
		switch (this.menu_phase) {
		case 0:
			if (this.cur_ray <= 136) {
				this.cur_ray = 136;
				this.ray_speed = 0.0;
				this.ang_acc = 0.99;
				this.cos_speed = 0.1;
				this.mouse_enabled = true;
				this.menu_phase++;
			}
			break;
		case 1:
			if (Math.abs(this.cos_ray) > 10) this.cos_speed *= -1;
			break;
		case 2:
			if (this.cur_ray > 450) {
				this.balls = [];
				this.menu_phase = 99;
				MB2.Manager.startGame(this.next_mode, this.next_mode_param);
			}
			break;
		case 3:
			if (this.cur_ray < this.ray_speed) {
				this.show(this.next_menu_id);
				this.ang_speed *= -1;
				this.ray_speed *= -1;
				this.ray_acc = 1 / this.ray_acc;
				this.ang_acc = 0.97;
				this.menu_phase++;
				this.main();
			}
			break;
		case 4:
			if (this.cur_ray >= 130) {
				this.ray_speed = 0;
				this.cur_ray = 135;
				this.menu_phase = 0;
			}
			break;
		}
		if (this.go_hole) this.hole = Math.max(this.hole, 10) * Math.pow(1.1, tmod);
	}

	drawBall(ctx, b) {
		const disabled = b.state === 0;
		const s = 96 + b.sel * 16;
		ctx.save();
		ctx.translate(b.x, b.y);
		if (disabled) ctx.globalAlpha *= 0.45;
		ctx.fillStyle = "rgba(30,0,50,0.3)";
		G.circle(ctx, 5, 7, s / 2 - 4); ctx.fill();
		if (b.sel > 0.05) {
			ctx.fillStyle = "rgba(255,255,255," + (0.35 * b.sel) + ")";
			G.circle(ctx, 0, 0, s / 2 + 5); ctx.fill();
		}
		const MAIN = { 1: "menu_challenge", 7: "menu_challenge", 2: "menu_course", 3: "menu_aventure", 4: "menu_classique", 5: "menu_options", 6: "menu_aide" };
		const r = s / 2 - 5;
		if (MAIN[b.id]) {
			G.img(ctx, MAIN[b.id], s, s);
		} else if (b.id >= 40 && b.id <= 46) {
			G.ball(ctx, 0, 0, r, "#9ae860", "#3a9a1a", "#f4ffe0");
			G.text(ctx, "course", 0, -14, 17, "#2a6a0a", "rgba(255,255,255,0.7)");
			G.text(ctx, "" + (b.id - 39), 0, 14, 30, "#ffffff", "#2a6a0a");
			G.shine(ctx, 0, 0, r, 0.45);
		} else if (b.id >= 60 && b.id <= 64) {
			const col = DONJON_COLORS[b.id - 60];
			G.ball(ctx, 0, 0, r, col[0], col[1], "#ffffff");
			if (b.id < 64) G.img(ctx, DONJON_ICONS[b.id - 60], 44, 44);
			else G.text(ctx, "?", 0, 2, 40, "#ffffff", col[1]);
			G.shine(ctx, 0, 0, r, 0.45);
			if (b.done) {
				ctx.strokeStyle = "#ffd82a"; ctx.lineWidth = 4;
				G.circle(ctx, 0, 0, r); ctx.stroke();
				G.text(ctx, "✔", r * 0.6, r * 0.6, 22, "#ffd82a", "#7a4a00");
			}
		} else {
			// options / back
			const labels = { 20: "musique\non", 21: "musique\noff", 22: "sons\non", 23: "sons\noff", 24: "retour", 47: "retour", 65: "retour" };
			G.ball(ctx, 0, 0, r, "#eef2f6", "#8a96a6", "#ffffff");
			G.text(ctx, labels[b.id] || "", 0, 0, 19, "#3a4a6a", "rgba(255,255,255,0.8)");
			G.shine(ctx, 0, 0, r, 0.4);
		}
		if (disabled) {
			ctx.globalAlpha = 1;
			G.text(ctx, "🔒", 0, 0, 26, "#fff");
		}
		ctx.restore();
	}

	draw(ctx) {
		drawSunburst(ctx, this.bgrot);
		if (this.hole > 0) {
			const g = ctx.createRadialGradient(305, 205, 0, 305, 205, this.hole);
			g.addColorStop(0, "#000");
			g.addColorStop(0.8, "#1a0030");
			g.addColorStop(1, "rgba(40,0,70,0)");
			ctx.fillStyle = g;
			G.circle(ctx, 305, 205, this.hole); ctx.fill();
		}
		for (const b of this.balls) this.drawBall(ctx, b);
		const inf = this.infos;
		if (inf) {
			ctx.save();
			ctx.fillStyle = "rgba(40,90,20,0.85)";
			G.rrect(ctx, 55, inf.y - 34, 500, 64, 16); ctx.fill();
			ctx.strokeStyle = "#a6ec6e"; ctx.lineWidth = 2; ctx.stroke();
			G.text(ctx, INFOS[inf.frame] || "", 305, inf.y - 2, 14, "#ffffff");
			ctx.restore();
		}
	}
	destroy() { }
};

// ===========================================================================
// Transition : a rotating shape mask closing on the old mode and opening on the new one
MB2.Transition = class {
	constructor(mode) {
		this.mode = mode;
		this.reversed = false;
		this.mask_size = 350;
		this.rotation = 0;
		this.diag = 0.3 + random(300) / 100;
		this.main();
	}
	main() {
		this.mask_size -= Std.tmod * 15;
		this.rotation += Std.tmod * 3;
		if (this.mode) this.mode.main();
		if (!this.reversed && this.mask_size < 0) {
			this.reversed = true;
			if (this.mode) this.mode.destroy();
			this.mode = MB2.Manager.nextMode();
		}
		if (this.mask_size < -400) {
			const m = this.mode;
			this.mode = null;
			MB2.Manager.switchMode(m);
		}
	}
	tick() { if (this.mode && this.mode.tick) this.mode.tick(); }
	draw(ctx) {
		ctx.fillStyle = "#1e0632";
		ctx.fillRect(0, 0, 610, 410);
		if (!this.mode) return;
		const s = Math.abs(this.mask_size);
		const d = s * this.diag;
		ctx.save();
		ctx.translate(305, 205);
		ctx.rotate(this.rotation * Math.PI / 180);
		ctx.beginPath();
		ctx.moveTo(0, -s);
		ctx.quadraticCurveTo(d, -d, s, 0);
		ctx.quadraticCurveTo(d, d, 0, s);
		ctx.quadraticCurveTo(-d, d, -s, 0);
		ctx.quadraticCurveTo(-d, -d, 0, -s);
		ctx.rotate(-this.rotation * Math.PI / 180);
		ctx.translate(-305, -205);
		ctx.clip();
		this.mode.draw(ctx);
		ctx.restore();
	}
	destroy() {
		if (this.mode) this.mode.destroy();
	}
};

// ===========================================================================
// PopupFX (asml) : elastic popup of a panel
class PopupFX {
	constructor() { this.s = 0; this.v = 0; }
	main() {
		this.v += (100 - this.s) * 0.35;
		this.v *= 0.6;
		this.s += this.v;
		return this.s / 100;
	}
}

// ===========================================================================
// GameOver
MB2.GameOver = class {
	constructor(mode, cause) {
		this.mode = mode;
		this.cause = cause;
		Sound.fadeMix(Sound.MUSIC_GAME_OVER);
		Sound.play(Sound.GAME_OVER);
		this.victory = cause === Const.CAUSE_WINS;
		this.text = "Connexion en cours...";
		this.clickable = false;
		this.fx = new PopupFX();
		this.scale = 0;
	}
	onClassicScore(score, record, titem) {
		this.setText("Votre score : niveau " + score + "\nVotre record : niveau " + record + (titem ? "\nTItem gagne !!" : ""));
	}
	onScore(score, old_score, old_pos, new_pos, ti) {
		let txt = "";
		if (old_score < score && old_score > 0) txt += "Record battu !\n";
		if (old_pos > new_pos && old_pos > 0) txt += "Vous avez gagne " + (old_pos - new_pos) + " places.\n";
		txt += ((score % 100) + 1) + " pourcent du niveau accomplis\n";
		txt += "Votre score : " + ((score / 100) | 0) + "\n";
		if (new_pos > 0) txt += "Votre classement : " + new_pos;
		if (ti) txt += "Nouveau TItem gagne !";
		this.setText(txt);
	}
	setText(txt) {
		this.text = txt;
		this.clickable = true;
	}
	onMouseDown() {
		if (!this.clickable) return;
		this.clickable = false;
		MB2.Manager.gameFinished();
	}
	onKey(k) { if (k === MB2.Key.ENTER || k === MB2.Key.SPACE || k === MB2.Key.ESCAPE) this.onMouseDown(); }
	main() {
		this.scale = this.fx.main();
		this.mode.main();
	}
	tick() { if (this.mode.tick) this.mode.tick(); }
	draw(ctx) {
		this.mode.draw(ctx);
		const s = this.scale;
		if (s <= 0.01) return;
		MB2.drawPanel(ctx, 305, 205, 360, 230, s);
		ctx.save();
		ctx.translate(305, 205);
		ctx.scale(s, s);
		bubbleTitle(ctx, this.victory ? "VICTOIRE !" : "GAME OVER", 0, -80, 44);
		G.text(ctx, this.text, 0, 12, 17, "#6a3000");
		if (this.clickable && (((MB2.frameCount || 0) / 15) | 0) % 2 === 0)
			G.text(ctx, "cliquez pour continuer", 0, 95, 13, "#a05a00");
		ctx.restore();
	}
	destroy() { this.mode.destroy(); }
};

// ===========================================================================
// GameOverCourse
MB2.GameOverCourse = class {
	constructor(mode, score) {
		this.mode = mode;
		this.score = score;
		Sound.fadeMix(Sound.MUSIC_GAME_OVER);
		Sound.play(Sound.GAME_OVER);
		this.fx = new PopupFX();
		this.scale = 0;
		this.text = "";
		this.saveRecords();
	}
	saveRecords() {
		const M = MB2.Manager;
		const plrecord = { $t: this.score, $c: false };
		const card = M.client.fcard;
		const param = M.play_mode_param;
		const records = card.$records[param];
		let p = 0, cp = 0, titems = 0;
		while (p < 3) {
			if (records[p].$t > this.score) {
				for (let j = p; j < 3; j++)
					if (records[p].$c) {
						titems += MB2.TItems.giveCourse(param, cp);
						cp++;
					}
				if (!card.$courses[param + 1]) card.$courses[param + 1] = true;
				records.splice(p, 0, plrecord);
				break;
			}
			if (records[p].$c) cp++;
			p++;
		}
		this.text = "";
		if (p === 3) {
			if (records.length === 3) records.push(plrecord);
			else this.text = "Vous n'etes pas classe.";
		}
		if (titems > 0) this.text += titems + " titems gagnes !";
		this.rows = [];
		let c2 = 0;
		for (let i = 0; i < 4; i++) {
			const r = records[i];
			let rtype = 5;
			if (r.$c) rtype = ++c2;
			else if (r.$t === this.score) rtype = 4;
			this.rows.push({ time: MB2.Interf.makeTime(r.$t), rtype: rtype });
		}
		records.splice(3, records.length - 3);
		M.client.saveSlot(0);
	}
	onMouseDown() {
		if (this.done) return;
		this.done = true;
		MB2.Manager.gameFinished();
	}
	onKey(k) { if (k === MB2.Key.ENTER || k === MB2.Key.SPACE || k === MB2.Key.ESCAPE) this.onMouseDown(); }
	main() {
		this.scale = this.fx.main();
		this.mode.main();
	}
	tick() { if (this.mode.tick) this.mode.tick(); }
	draw(ctx) {
		this.mode.draw(ctx);
		const s = this.scale;
		if (s <= 0.01) return;
		MB2.drawPanel(ctx, 305, 210, 360, 260, s);
		ctx.save();
		ctx.translate(305, 210);
		ctx.scale(s, s);
		bubbleTitle(ctx, "VICTOIRE !", 0, -100, 44);
		const MED = [null, ["#ffd82a", "#a07000"], ["#e4e8ee", "#7a8494"], ["#e8a070", "#8a4a1a"]];
		for (let i = 0; i < 4; i++) {
			const r = this.rows[i];
			const y = -48 + i * 34;
			ctx.fillStyle = r.rtype === 4 ? "#fff3a0" : "#ffd24a";
			G.rrect(ctx, -80, y - 13, 160, 26, 12); ctx.fill();
			ctx.strokeStyle = "#e08a00"; ctx.lineWidth = 1.5; ctx.stroke();
			G.text(ctx, r.time, 0, y, 18, "#7a3a00");
			for (const sx of [-110, 110]) {
				if (MED[r.rtype]) G.ball(ctx, sx, y, 10, MED[r.rtype][0], MED[r.rtype][1], "#fff");
				else if (r.rtype === 4) {
					ctx.fillStyle = "#e02a2a";
					ctx.beginPath();
					const d = sx < 0 ? 1 : -1;
					ctx.moveTo(sx + 10 * d, y); ctx.lineTo(sx - 6 * d, y - 10); ctx.lineTo(sx - 6 * d, y + 10); ctx.fill();
				}
			}
		}
		G.text(ctx, this.text, 0, 96, 15, "#6a3000");
		ctx.restore();
	}
	destroy() { this.mode.destroy(); }
};

// ===========================================================================
// Pause (and the map / radar)
const OBJFRAMES = [1, 4, 5, 6]; // ball colours of the objects : verte, bleue, metal, violette
MB2.Pause = class {
	constructor(game) {
		this.game = game;
		this.show_map = game.options.has_map || game.options.has_radar;
		this.t = 0;
		this.rocks = [];
		for (let i = 0; i < 64; i++) this.rocks.push(random(4));
	}
	endPause() {
		const game = this.game;
		if (game.boss_update && game.boss_update.onPause) game.boss_update.onPause(false);
		game.pause = null;
	}
	destroy() { this.game.pause = null; }
	main() {
		const game = this.game;
		this.t++;
		if (MB2.Key.isDown(MB2.Key.ESCAPE)) {
			if (!game.pause_key_flag) {
				game.pause_key_flag = true;
				this.endPause();
			}
		} else
			game.pause_key_flag = false;
	}
	onMouseDown() { if (this.t > 10) this.endPause(); }
	path_open(x, y, n) {
		const r = this.game.level.dungeon[x] && this.game.level.dungeon[x][y];
		if (!r || !r.paths) return false;
		const p = r.paths[n].ptype;
		return p !== 1 && p !== 2;
	}
	draw(ctx) {
		// colour transform of the game (darker, purple)
		ctx.fillStyle = "rgba(30,0,40,0.5)";
		ctx.fillRect(0, 0, 610, 410);
		if (this.show_map) this.drawMap(ctx);
		G.text(ctx, "PAUSE", 305, this.show_map ? 22 : 190, this.show_map ? 22 : 56, "#ffffff", "#4a1470");
		if (!this.show_map) G.text(ctx, "Echap ou P pour reprendre", 305, 240, 16, "#ffffff");
	}
	drawMap(ctx) {
		const game = this.game, lvl = game.level, opt = game.options;
		ctx.save();
		ctx.translate(95, 45);
		G.img(ctx, "map", 440, 360, 0, 0);
		const W = Math.min(8, lvl.width), H = Math.min(8, lvl.height);
		const cell = (x, y) => [18 + 48 * x, 16 + 36 * y];
		// passages & rooms
		for (let x = 0; x < W; x++)
			for (let y = 0; y < H; y++) {
				const room = lvl.dungeon[x][y];
				const [px, py] = cell(x, y);
				const cx = px + 24, cy = py + 18 + 24;
				if (room.rtype === 0) {
					if (opt.has_map) {
						ctx.fillStyle = "rgba(160,100,0,0.25)";
						const k = this.rocks[x * 8 + y];
						G.circle(ctx, cx - 8 + k * 4, cy - 4 + (k % 2) * 6, 4 + k); ctx.fill();
					}
					continue;
				}
				const cur = x === lvl.pos_x && y === lvl.pos_y;
				const known = cur || (room.visited && opt.has_map);
				if (known) {
					ctx.fillStyle = cur ? "#ff6a2a" : "#e0a020";
					G.rrect(ctx, cx - 16, cy - 11, 32, 22, 6); ctx.fill();
					ctx.strokeStyle = cur ? "#a02a00" : "#a06a00"; ctx.lineWidth = 1.5; ctx.stroke();
				} else if (opt.has_map) {
					ctx.strokeStyle = "rgba(160,100,0,0.6)"; ctx.lineWidth = 1.5;
					G.rrect(ctx, cx - 16, cy - 11, 32, 22, 6); ctx.stroke();
				}
				if (opt.has_map) {
					ctx.strokeStyle = "#a06a00";
					ctx.lineWidth = 5;
					ctx.lineCap = "round";
					if (x > 0 && this.path_open(x, y, 0) && this.path_open(x - 1, y, 1)) {
						ctx.beginPath(); ctx.moveTo(cx - 17, cy); ctx.lineTo(cx - 31, cy); ctx.stroke();
					}
					if (y > 0 && this.path_open(x, y, 2) && this.path_open(x, y - 1, 3)) {
						ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy - 24); ctx.stroke();
					}
				}
				if (opt.has_radar) {
					switch (room.rtype) {
					case 1: case 5:
						if (x === lvl.start_x && y === lvl.start_y) G.text(ctx, "D", cx, cy, 14, "#fff", "#205a10");
						break;
					case 2: G.text(ctx, "☠", cx, cy, 18, "#fff", "#5a0a0a"); break;
					case 3:
						if (room.rdata !== -1) {
							const col = MB2.BALL_COLORS[OBJFRAMES[room.rdata]];
							if (col) G.ball(ctx, cx, cy, 7, col[0], col[1], col[2]);
						}
						break;
					case 4:
						if (room.rdata !== -1) {
							ctx.save();
							ctx.translate(cx, cy);
							switch (room.rdata) {
							case 0: G.ball(ctx, 0, 0, 7, MB2.BALL_COLORS[3][0], MB2.BALL_COLORS[3][1]); break;
							case 1: G.ball(ctx, 0, 0, 7, MB2.BALL_COLORS[2][0], MB2.BALL_COLORS[2][1]); break;
							case 2: MB2.drawItemIcon(ctx, 0, 0.7); break;
							case 3: break;
							case 4: MB2.drawItemIcon(ctx, 4, 0.8); break;
							case 5: MB2.drawItemIcon(ctx, 2, 0.8); break;
							case 6: MB2.drawItemIcon(ctx, 3, 0.7); break;
							}
							ctx.restore();
						}
						break;
					}
				}
				if (cur) {
					const t = this.t / 6;
					ctx.strokeStyle = "rgba(255,255,255," + (0.5 + 0.5 * Math.sin(t)) + ")";
					ctx.lineWidth = 2;
					G.rrect(ctx, cx - 18, cy - 13, 36, 26, 7); ctx.stroke();
				}
			}
		ctx.restore();
	}
};

})();
