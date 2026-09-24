/*
 * The menu : balls turning around the center. Port of mb2/Menu.as.
 *
 * Menu ids :
 *   main      1 challenge, 2 course, 3 aventure, 4 classique, 5 options, 6 aide
 *   courses   40-46 the 7 courses, 47 back
 *   aventure  60-64 the 5 dungeons, 65 back
 *   options   20/21 music on/off, 22/23 sounds on/off, 24 back (saves the preferences)
 *
 * The ring animation uses menu_phase :
 *   0 the balls come in (the ring shrinks), 1 idle (the mouse turns the ring),
 *   2 a mode was chosen (the ring grows, a hole opens), 3 leaving to a sub-menu,
 *   4 the sub-menu comes in.
 * Keyboard (an addition of the port) : arrows select, Enter validates,
 * Escape goes back.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Std = MB2.Std;
	const Sound = MB2.Sound;
	const G = MB2.G;
	const TAU = Math.PI * 2;
	const CX = 305;
	const CY = 205;

	const MENU_IDS = [
		[1, 2, 3, 4, 5, 6],
		[40, 41, 42, 43, 44, 45, 46, 47],
		[60, 61, 62, 63, 64, 65],
		[20, 22, 24]
	];

	/**
	 * Texts of the info panel (the "cadreInfo" symbol, frames 1-4). The original
	 * texts are in mb2.fla : these were written for the port.
	 */
	const INFOS = [
		"",
		"CHALLENGE : explorez un donjon genere au hasard, trouvez les billes\net vainquez le monstre avant la fin du temps imparti !",
		"AVENTURE : quatre donjons elementaires gardes par des serpents,\npuis le donjon final... Qui s'y cache ?",
		"COURSE : faites trois tours de circuit le plus vite possible\nen passant les points de controle.",
		"CLASSIQUE : descendez de salle en salle par les trappes.\nChaque trappe rapporte quelques secondes !"
	];

	/** Bitmaps of the main menu balls (the others are drawn). */
	const MAIN_BALLS = {
		1: "menu_challenge", 7: "menu_challenge", 2: "menu_course", 3: "menu_aventure",
		4: "menu_classique", 5: "menu_options", 6: "menu_aide"
	};
	const OPTION_LABELS = {
		20: "musique\non", 21: "musique\noff", 22: "sons\non", 23: "sons\noff",
		24: "retour", 47: "retour", 65: "retour"
	};
	const DONJON_ICONS = ["donjon_eau", "donjon_feu", "donjon_vent", "donjon_terre"];
	const DONJON_COLORS = [
		["#7ad0ff", "#1a5aa0"],
		["#ff8a4a", "#a02a00"],
		["#e8f4ff", "#7a8aa0"],
		["#b8d86a", "#4a6a10"],
		["#c080f0", "#4a1a78"]
	];

	// ball states
	const DISABLED = 0, NORMAL = 1, SELECTED = 2;

	MB2.Menu = class {

		constructor() {
			this.balls = [];
			this.show(0);
			Sound.play(Sound.MENU_ENTER);

			// the ring
			this.cur_ray = 450;
			this.cur_ang = 0;
			this.ray_speed = -1.0;
			this.ray_acc = 1.05;
			this.ang_speed = 0.05;
			this.ang_acc = 1.01;
			this.cos_ray = 0;      // "breathing" of the ring
			this.cos_speed = 0;

			this.menu_phase = 0;
			this.menu_time = 0;
			this.go_hole = false;
			this.hole = 0;
			this.infos = null;
			this.mouse_enabled = false;
			this.kb_sel = -1;
			this.bgrot = 0;
			this.next_menu_id = 0;
			this.next_mode = 0;
			this.next_mode_param = undefined;

			Sound.playMusic(Sound.MUSIC_MENU);
		}

		/** Creates the balls of a menu (MENU_IDS index). */
		show(menu) {
			const P = MB2.Prefs;
			const fcard = MB2.Manager.client.fcard;
			this.balls = [];
			const ids = MENU_IDS[menu];
			if (!ids)
				return;

			ids.forEach((baseId, i) => {
				let id = baseId;
				const b = { state: NORMAL, x: -500, y: -500, sel: 0 };

				switch (id) {
				case 1:
					if (!P.challenge_mode_enabled)
						b.state = DISABLED;
					b.infos = 1;
					break;
				case 2:
					if (!P.courses.some(x => x))
						b.state = DISABLED;
					b.infos = 3;
					break;
				case 3:
					if (!P.dungeons.some(x => x))
						b.state = DISABLED;
					b.infos = 2;
					break;
				case 4:
					if (!P.classic_mode_enabled)
						b.state = DISABLED;
					b.infos = 4;
					break;
				case 20:
					if (!P.music_enabled)
						id += 1;
					break;
				case 22:
					if (!P.sound_enabled)
						id += 1;
					break;
				}
				if (id >= 40 && id <= 46 && !P.courses[id - 40])
					b.state = DISABLED;
				if (id >= 60 && id <= 64 && !P.dungeons[id - 60])
					b.state = DISABLED;
				if (id >= 60 && id <= 63)
					b.done = !!fcard.$dungeons_done[id - 60];

				b.ang = i * TAU / ids.length;
				b.id = id;
				this.balls.push(b);
			});
		}

		/** Shows (or hides, with no argument) the info panel. */
		showInfos(frame) {
			if (frame === undefined) {
				if (this.infos)
					this.infos.dy = 10;
				return;
			}
			if (this.infos == null) {
				this.infos = { frame: frame, y: Const.LVL_HEIGHT + 50, dy: -10 };
			} else {
				this.infos.dy = -10;
				this.infos.frame = frame;
			}
		}

		select(b) {
			if (b.state !== NORMAL)
				return;
			Sound.play(Sound.MENU_SELECT);
			b.state = SELECTED;
			this.showInfos(b.infos);
		}

		unselect(b) {
			if (b.state !== SELECTED)
				return;
			b.state = NORMAL;
			this.showInfos(undefined);
		}

		enter(b) {
			if (this.menu_phase === 1 && b.state === SELECTED) {
				Sound.play(Sound.MENU_ENTER);
				this.start(b.id);
			}
		}

		/** Leaves to a sub-menu. */
		run_menu(menu) {
			this.menu_phase = 3;
			this.next_menu_id = menu;
			this.ray_speed = -5.0;
			this.ray_acc = 1.1;
			this.ang_speed = 0.2;
			this.ang_acc = 1.02;
			this.cos_speed = 0;
			this.cos_ray = 0;
			this.mouse_enabled = false;
		}

		/** Starts a game when the balls are out of the screen. */
		run_mode(mode, param) {
			this.menu_phase = 2;
			this.next_mode = mode;
			this.next_mode_param = param;
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
			if (id >= 40 && id <= 46) {
				this.run_mode(Const.MODE_COURSE, id - 40);
				return;
			}
			if (id >= 60 && id <= 64) {
				this.run_mode(Const.MODE_AVENTURE, id - 60);
				return;
			}
			switch (id) {
			case 1:
			case 7:
				this.run_mode(Const.MODE_CHALLENGE);
				break;
			case 2:
				this.run_menu(1);
				break;
			case 3:
				this.run_menu(2);
				break;
			case 4:
				this.run_mode(Const.MODE_CLASSIC);
				break;
			case 5:
				this.run_menu(3);
				break;
			case 6:
				this.run_mode(Const.MODE_AIDE);
				break;
			case 47:
			case 65:
				this.run_menu(0);
				break;
			case 20:
			case 21:
				P.toggleMusic();
				this.run_menu(3);
				break;
			case 22:
			case 23:
				P.toggleSounds();
				this.run_menu(3);
				break;
			case 24:
				MB2.Manager.client.savePrefs();
				this.run_menu(0);
				break;
			}
		}

		// ----- input -----

		/** The ring turns toward the mouse side, faster when far from the center. */
		change(xm) {
			const delta = Math.min(200, Math.abs(CX - xm));
			this.ang_speed = (xm > CX ? 1 : -1) * delta * 0.05 / 100;
		}

		ballAt(x, y) {
			for (const b of this.balls) {
				const dx = x - b.x;
				const dy = y - b.y;
				if (dx * dx + dy * dy < 46 * 46)
					return b;
			}
			return null;
		}

		onMouseMove(x, y) {
			if (this.mouse_enabled)
				this.change(x);
			const hovered = this.ballAt(x, y);
			for (const b of this.balls)
				if (b !== hovered)
					this.unselect(b);
			if (hovered)
				this.select(hovered);
			this.kb_sel = -1;
		}

		onMouseDown(x, y) {
			const b = this.ballAt(x, y);
			if (b) {
				this.select(b);
				this.enter(b);
			}
		}

		onKey(code) {
			if (this.menu_phase !== 1 || !this.balls.length)
				return;
			const K = MB2.Key;
			const n = this.balls.length;

			if (code === K.LEFT || code === K.RIGHT || code === K.UP || code === K.DOWN) {
				const step = (code === K.RIGHT || code === K.DOWN) ? 1 : n - 1;
				let i = this.kb_sel;
				for (let tries = 0; tries < n; tries++) {
					i = (i < 0) ? 0 : (i + step) % n;
					if (this.balls[i].state !== DISABLED)
						break;
				}
				this.kb_sel = i;
				for (const b of this.balls)
					this.unselect(b);
				this.select(this.balls[i]);
			} else if ((code === K.ENTER || code === K.SPACE) && this.kb_sel >= 0) {
				this.enter(this.balls[this.kb_sel]);
			} else if (code === K.ESCAPE && MENU_IDS[0].indexOf(this.balls[0].id) < 0) {
				// in a sub-menu, the last ball is "back"
				this.start(this.balls[n - 1].id);
			}
		}

		// ----- animation -----

		main() {
			const tmod = Std.tmod;
			this.menu_time += tmod / 30;
			this.ray_speed *= Math.pow(this.ray_acc, tmod);
			this.bgrot += tmod / 400;

			const infos = this.infos;
			if (infos) {
				infos.y += infos.dy * tmod;
				if (infos.y > Const.LVL_HEIGHT + 50)
					this.infos = null;
				else if (infos.y < Const.LVL_HEIGHT - 40)
					infos.y = Const.LVL_HEIGHT - 40;
			}

			// (fixed in the original : the animation could get stuck when the frame rate dropped)
			if (this.menu_phase > 1 && Math.abs(this.ray_speed) < 3)
				this.ray_speed = this.ray_speed < 0 ? -3 : 3;

			this.ang_speed *= Math.pow(this.ang_acc, tmod);
			this.cos_ray += this.cos_speed;
			this.cur_ray += this.ray_speed;
			this.cur_ang += this.ang_speed;
			if (this.cur_ang > Math.PI)
				this.cur_ang -= Math.trunc(this.cur_ang / TAU) * TAU;

			for (const b of this.balls) {
				const a = b.ang + this.cur_ang;
				const r = this.cur_ray + Math.cos(b.ang + this.menu_time) * this.cos_ray;
				b.x = Math.cos(a) * r + CX;
				b.y = Math.sin(a) * r + CY;
				// smooth selection zoom
				b.sel += ((b.state === SELECTED ? 1 : 0) - b.sel) * 0.3;
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
				if (Math.abs(this.cos_ray) > 10)
					this.cos_speed *= -1;
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
					// the ring is closed : show the sub-menu, the ring opens again
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

			if (this.go_hole)
				this.hole = Math.max(this.hole, 10) * Math.pow(1.1, tmod);
		}

		// ----- drawing -----

		drawBall(ctx, b) {
			const disabled = b.state === DISABLED;
			const size = 96 + b.sel * 16;
			const r = size / 2 - 5;

			ctx.save();
			ctx.translate(b.x, b.y);
			if (disabled)
				ctx.globalAlpha *= 0.45;

			// shadow and selection halo
			ctx.fillStyle = "rgba(30,0,50,0.3)";
			G.circle(ctx, 5, 7, size / 2 - 4);
			ctx.fill();
			if (b.sel > 0.05) {
				ctx.fillStyle = "rgba(255,255,255," + (0.35 * b.sel) + ")";
				G.circle(ctx, 0, 0, size / 2 + 5);
				ctx.fill();
			}

			if (MAIN_BALLS[b.id]) {
				G.img(ctx, MAIN_BALLS[b.id], size, size);
			} else if (b.id >= 40 && b.id <= 46) {
				G.ball(ctx, 0, 0, r, "#9ae860", "#3a9a1a", "#f4ffe0");
				G.text(ctx, "course", 0, -14, 17, "#2a6a0a", "rgba(255,255,255,0.7)");
				G.text(ctx, "" + (b.id - 39), 0, 14, 30, "#ffffff", "#2a6a0a");
				G.shine(ctx, 0, 0, r, 0.45);
			} else if (b.id >= 60 && b.id <= 64) {
				const col = DONJON_COLORS[b.id - 60];
				G.ball(ctx, 0, 0, r, col[0], col[1], "#ffffff");
				if (b.id < 64)
					G.img(ctx, DONJON_ICONS[b.id - 60], 44, 44);
				else
					G.text(ctx, "?", 0, 2, 40, "#ffffff", col[1]);
				G.shine(ctx, 0, 0, r, 0.45);
				if (b.done) {
					ctx.strokeStyle = "#ffd82a";
					ctx.lineWidth = 4;
					G.circle(ctx, 0, 0, r);
					ctx.stroke();
					G.text(ctx, "✔", r * 0.6, r * 0.6, 22, "#ffd82a", "#7a4a00");
				}
			} else {
				G.ball(ctx, 0, 0, r, "#eef2f6", "#8a96a6", "#ffffff");
				G.text(ctx, OPTION_LABELS[b.id] || "", 0, 0, 19, "#3a4a6a", "rgba(255,255,255,0.8)");
				G.shine(ctx, 0, 0, r, 0.4);
			}

			if (disabled) {
				ctx.globalAlpha = 1;
				G.text(ctx, "🔒", 0, 0, 26, "#fff");
			}
			ctx.restore();
		}

		draw(ctx) {
			MB2.ScreenGfx.drawSunburst(ctx, this.bgrot);

			// the hole the balls fall into when a game starts
			if (this.hole > 0) {
				const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, this.hole);
				g.addColorStop(0, "#000");
				g.addColorStop(0.8, "#1a0030");
				g.addColorStop(1, "rgba(40,0,70,0)");
				ctx.fillStyle = g;
				G.circle(ctx, CX, CY, this.hole);
				ctx.fill();
			}

			for (const b of this.balls)
				this.drawBall(ctx, b);

			const infos = this.infos;
			if (infos) {
				ctx.save();
				ctx.fillStyle = "rgba(40,90,20,0.85)";
				G.rrect(ctx, 55, infos.y - 34, 500, 64, 16);
				ctx.fill();
				ctx.strokeStyle = "#a6ec6e";
				ctx.lineWidth = 2;
				ctx.stroke();
				G.text(ctx, INFOS[infos.frame] || "", CX, infos.y - 2, 14, "#ffffff");
				ctx.restore();
			}
		}

		destroy() { }
	};

})();
