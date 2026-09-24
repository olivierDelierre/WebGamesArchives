// MotionBall 2 - HTML5 port : the game itself
// Straight port of mb2/Game.as, Level.as, Interf.as, Ball.as, Collide.as, Options.as
"use strict";

(function () {

const Const = MB2.Const, Tools = MB2.Tools, Std = MB2.Std, Key = MB2.Key;
const Sound = MB2.Sound;
const Manager = () => MB2.Manager;

// ===========================================================================
// Collide
const Collide = MB2.Collide = {
	game: null,
	hitmap: null,
	border_collide: null,
	border_collide_no_recal: null,
	frame_nb: 0,
	interupt_flag: false,

	init(game) {
		Collide.game = game;
		const H = MB2.BUMPER_HITMAPS;
		const hm = [];
		hm[0] = H[0]; hm[1] = H[1]; hm[2] = H[2]; hm[3] = H[3]; hm[4] = H[4];
		hm[5] = H[5]; hm[6] = H[5];
		hm[7] = Collide.circle_hitmap(12, 22);
		hm[10] = Collide.circle_hitmap(8, 15);
		hm[11] = hm[5];
		hm[12] = hm[5];
		hm[13] = Collide.circle_hitmap(8, 14);
		Collide.hitmap = hm;
		Collide.interupt_flag = false;
		Collide.border_collide = { on_hit: Collide.border_on_hit, is_border: true, hit_min: 4, hit_coef: 1.1 };
		Collide.border_collide_no_recal = { on_hit: Collide.border_on_hit_no_recal, is_border: true, hit_min: 4, hit_coef: 1.1 };
	},

	// equivalent of gen_hitmap (hitTest on each cell) for round symbols
	circle_hitmap(n, ray) {
		const t = [];
		const d = Const.DELTA / 2 - (n / 2) * Const.DELTA;
		for (let x = 0; x < n; x++) {
			t[x] = [];
			for (let y = 0; y < n; y++) {
				const px = x * Const.DELTA + d, py = y * Const.DELTA + d;
				t[x][y] = px * px + py * py <= ray * ray;
			}
		}
		return t;
	},

	on_get_map(game) { game.options.has_map = true; game.setPause(); },
	on_get_radar(game) { game.options.has_radar = true; game.setPause(true); },
	on_get_key(game) { game.options.grelot_count += 3; game.options.update_icons(); },
	on_get_small_blue(game) { if (Manager().play_mode !== Const.MODE_COURSE) game.curtime += 60 * 1000; },
	on_get_big_blue(game) { if (Manager().play_mode !== Const.MODE_COURSE) game.curtime += 3 * 60 * 1000; },

	gen_hit(game, px, py) {
		const hit = game.dmanager.attach("hit", Const.DUMMY_PLAN);
		hit.x = px * Const.DELTA + Const.DELTA / 2;
		hit.y = py * Const.DELTA + Const.DELTA / 2;
		hit.rotation = Math.atan2(game.ball.sy, game.ball.sy) * 180 / Math.PI;
	},

	border_on_hit(game, mc, px, py) {
		Collide.gen_hit(game, px, py);
		let size = Const.BORDER_SIZE + Const.DELTA;
		if (game.ball.x < size) game.ball.x = size;
		if (game.ball.y < size) game.ball.y = size;
		size += Const.DELTA * 2;
		if (game.ball.x > Const.LVL_WIDTH - size) game.ball.x = Const.LVL_WIDTH - size;
		if (game.ball.y > Const.LVL_HEIGHT - size) game.ball.y = Const.LVL_HEIGHT - size;
		Sound.play(Sound.WALL_HIT);
	},

	border_on_hit_no_recal(game, mc, px, py) {
		Collide.gen_hit(game, px, py);
		Sound.play(Sound.WALL_HIT);
	},

	item_box_on_hit(game, mc, px, py) {
		if (mc.item === -1) return;
		Sound.play(Sound.GET_ITEM);
		Collide.gen_hit(game, px, py);
		game.level.fill_pos(mc.pos, Collide.hitmap[7], null);
		mc.clip.gotoAndPlay("hit");
		game.level.dungeon[game.level.pos_x][game.level.pos_y].rdata = -1;
		mc.on_get_item(game);
		mc.item = -1;
		game.options.update_icons();
	},

	red_on_hit(game, mc) {
		game.level.bonus_reds--;
		if (game.level.bonus_reds === 0) {
			game.level.interf.open_doors();
			Sound.play(Sound.OPEN_DOOR);
		}
		mc.clip.gotoAndPlay("hit");
		Sound.play(Sound.GET_RED);
		return true;
	},

	classic_exit_on_hit(game, mc) {
		if (!mc.clip.flOpen) return false;
		const cx = mc.clip.x, cy = mc.clip.y;
		game.ball.classic_mask = { x: cx, y: cy };
		game.ball.mc.mask = ctx => { ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.clip(); };
		game.ball.hole_death_speed = 3;
		game.ball.death_hit = false;
		game.ball.hole_death = true;
		game.ball.shadow.visible = false;
		return true;
	},

	blue_on_hit(game, mc) {
		if (Manager().play_mode === Const.MODE_COURSE) game.curtime -= 1;
		else if (Manager().play_mode === Const.MODE_CLASSIC) game.curtime += 2 * 1000;
		else game.curtime += 10 * 1000;
		mc.clip.gotoAndPlay("hit");
		Sound.play(Sound.GET_BLUE);
		return true;
	},

	bumper_normal_on_hit(game, mc) {
		if (mc.clip.frame === 1) {
			mc.clip.gotoAndPlay("hit");
			Sound.play(Sound.BUMPER_NORMAL);
		}
	},

	bumper_time_on_hit(game, mc) {
		if (mc.clip.frame === 1) {
			mc.clip.gotoAndPlay("hit");
			Sound.play(Sound.BUMPER_TIME);
			if (Manager().play_mode === Const.MODE_COURSE) game.curtime += 5;
			else game.curtime -= 5000;
		}
	},

	bumper_death_on_hit(game, mc) {
		if (game.ball.btype !== 5 && game.ball.clign_count <= 0) {
			Sound.play(Sound.BUMPER_DEATH);
			mc.clip.gotoAndPlay("hit");
			game.ball.die();
		} else
			Sound.play(Sound.BUMPER_DEATH_PROTECT);
	},

	bumper_magnet_on_hit(game, mc) {
		if (mc.way) {
			mc.way = false;
			Sound.play(Sound.BUMPER_MAGNET);
			mc.clip.gotoAndPlay("neg");
		}
	},

	bumper_shadow_on_hit(game, mc) {
		if (mc.clip.frame === 1) {
			Sound.play(Sound.BUMPER_SHADOW);
			mc.clip.gotoAndPlay("hit");
			if (game.ball.btype !== 6) {
				mc.alpha = 100;
				mc.clip.alpha = 100;
				mc.clip.visible = true;
			}
		}
	},

	door_on_hit(game, mc, px, py) {
		if (game.options.grelot_count > 0 && game.level.dungeon[game.level.pos_x][game.level.pos_y].paths[mc.d].ptype !== -1) {
			game.options.grelot_count--;
			game.options.update_icons();
			Sound.play(Sound.GRELOT);
			game.level.interf.open_door(mc.d);
		} else
			Collide.border_on_hit(game, mc, px, py);
	},

	wall_on_hit(game, mc, px, py) {
		if (game.ball.btype === 1) { // VERTE
			if (mc.btype === 0) return;
			Sound.play(Sound.GREEN_BLOCK_DESTROY);
			game.level.erase_pos(mc);
			game.level.interf.fill_wall(mc, null);
			game.level.interf.update_walls();
			if (mc.shade) mc.shade.removeMovieClip();
			mc.clip.removeMovieClip();
			mc.old_btype = mc.btype;
			mc.btype = 0;
			const ballang = Math.atan2(game.ball.sy, game.ball.sx);
			const sfact = game.ball.speed;
			for (let i = 0; i < 4; i++) {
				const p = {};
				const speed = (Math.random() * (sfact / 2) + sfact / 2) / 4 + 1;
				const ang = (Math.random() - 0.5) + ballang;
				p.clip = game.dmanager.attach("wallpart", Const.DUMMY_PLAN);
				p.clip.rotation = random(360);
				p.x = random(10 * Const.DELTA) + mc.x * Const.DELTA;
				p.y = random(10 * Const.DELTA) + mc.y * Const.DELTA;
				p.rspeed = speed;
				p.sx = Math.cos(ang) * speed;
				p.sy = Math.sin(ang) * speed;
				p.on_update = Collide.wall_dummy_on_update;
				p.stime = 50;
				p.time = 30;
				game.level.updates.push(p);
				game.level.dummies.push(p);
			}
		} else {
			Sound.play(Sound.GREEN_BLOCK_HIT);
			Collide.gen_hit(game, px, py);
		}
	},

	zapper_on_hit(game, mc, px, py) {
		Sound.play(Sound.ZAPPER_HIT);
		Collide.gen_hit(game, px, py);
	},

	zapper_line_on_hit(game, mc, px, py) {
		if (Manager().play_mode === Const.MODE_COURSE) {
			game.course_turn_done();
			return;
		}
		if (game.ball.btype !== mc.phase) {
			const flashLine = game.dmanager.attach("flashLine", Const.DUMMY_PLAN);
			flashLine.x = mc.z1.clip.x;
			flashLine.y = mc.z1.clip.y;
			flashLine.gfx.gotoAndStop(mc.phase + 1);
			const difx = mc.z2.clip.x - mc.z1.clip.x;
			const dify = mc.z2.clip.y - mc.z1.clip.y;
			flashLine.xscale = Math.sqrt(difx * difx + dify * dify);
			flashLine.rotation = Math.atan2(dify, difx) / (Math.PI / 180);
			Sound.play(Sound.ZAPPER_ACTIVATE);
			game.ball.die();
		}
	},

	interblock_on_hit(game, mc, px, py) {
		Sound.play(Sound.INTER_BLOCK_HIT);
		Collide.gen_hit(game, px, py);
	},

	interupt_on_hit(game, mc, px, py) {
		if (mc.last_frame_hit == null || mc.last_frame_hit < Collide.frame_nb - 20) {
			mc.last_frame_hit = Collide.frame_nb;
			Sound.play(Sound.INTERUPT_HIT);
			Collide.gen_hit(game, px, py);
			Collide.interupt_flag = !Collide.interupt_flag;
			const f = Collide.interupt_flag;
			for (const b of game.level.objects) {
				if (!b) continue;
				const t = b.btype;
				if (t === 11) b.clip.gotoAndPlay(f ? "playOn" : "playOff");
				else if (t === 13) {
					b.clip.gotoAndPlay(f ? "playOn" : "playOff");
					b.on_hit = f ? null : Collide.interblock_on_hit;
				} else if (t === 12) {
					b.clip.gotoAndPlay(f ? "playOff" : "playOn");
					b.on_hit = f ? Collide.interblock_on_hit : null;
				}
			}
		}
	},

	bumper_magnet_on_update(game, mc) {
		if (game.ball.btype === 5) return;
		const tmod = Std.tmod;
		const d = Tools.dist2(game.ball.mc, mc.clip);
		if (d < 30000) {
			const w = mc.way ? 1 : -1;
			const dx = (mc.clip.x - game.ball.mc.x) / d;
			const dy = (mc.clip.y - game.ball.mc.y) / d;
			game.ball.sx += w * dx * 30 * tmod;
			game.ball.sy += w * dy * 30 * tmod;
		}
		if (mc.way === false && random(1000 / Std.tmod) === 0) {
			mc.way = true;
			mc.clip.gotoAndPlay("plus");
		}
	},

	bumper_shadow_on_update(game, mc) {
		const tmod = Std.tmod;
		if (game.ball.btype === 6) { // VIOLET
			const d = Tools.dist2(game.ball.mc, mc.clip);
			mc.alpha = (200000 / d) | 0;
			if (mc.alpha <= 0) mc.alpha = 0;
			if (mc.alpha > 100) mc.alpha = 100;
			mc.clip.visible = mc.alpha > 0;
			mc.clip.alpha = mc.alpha;
		} else if (mc.alpha > 0) {
			mc.alpha -= tmod * 4;
			if (mc.alpha <= 0) {
				mc.alpha = 0;
				mc.clip.visible = false;
			}
			mc.clip.alpha = mc.alpha;
		}
	},

	bumper_time_on_update(game, mc) {
		mc.curtime = mc.curtime * 0.95 + game.curtime * 0.05;
		mc.clip.aig.rotation = -(mc.curtime / 3600);
		mc.clip.aig2.rotation = -(mc.curtime % 3600) / 10;
	},

	wall_dummy_on_update(game, mc) {
		const tmod = Std.tmod;
		mc.x += mc.sx;
		mc.y += mc.sy;
		mc.clip.x = mc.x;
		mc.clip.y = mc.y;
		mc.clip.xscale = mc.time * 200 / mc.stime;
		mc.clip.yscale = mc.time * 200 / mc.stime;
		mc.clip.rotation += 5 * tmod;
		mc.time -= tmod;
		if (mc.time < 0) {
			MB2.removeFrom(game.level.updates, mc);
			MB2.removeFrom(game.level.dummies, mc);
			mc.clip.removeMovieClip();
		}
	},

	ball_object_on_update(game, mc) {
		const d = Math.sqrt(Tools.dist2(mc.clip, game.ball.mc));
		if (d < Const.BALL_RAYSIZE * 3) {
			MB2.removeFrom(game.level.updates, mc);
			mc.clip.gotoAndPlay("hit");
			const o = game.options;
			o.ball_types_chk -= o.ball_types[mc.obj];
			Sound.play(Sound.GET_BALL);
			o.ball_types[mc.obj] = 1;
			o.ball_types_chk++;
			game.ball.btype = mc.obj;
			o.update_icons();
			game.ball.update_skin();
			if (!o.ball_flags[mc.obj]) {
				o.ball_flags[mc.obj] = true;
				Sound.nextMix();
			}
		}
	},

	bumper_teleport_on_update(game, mc) {
		let d = Math.sqrt(Tools.dist2(mc.clip, game.ball.mc));
		d += 0.1;
		for (let i = 0; i < mc.clip.num; i++) {
			const circle = mc.clip["c" + i];
			circle.rotation += circle.rot * Std.tmod * (1 + (60 / d));
			circle.c += Std.tmod * (20 + (200 / d));
			const a = circle.c / 100;
			circle.xscale = 100 + Math.cos(a) * 50;
			circle.yscale = 100 + Math.sin(a) * 50;
		}
		if (d < Const.BALL_RAYSIZE) {
			if (!mc.teleport) {
				const bumpers = game.level.updates;
				let i;
				for (i = 0; i < bumpers.length; i++)
					if (bumpers[i].btype === 10 && bumpers[i] !== mc) break;
				if (i === bumpers.length) return;
				mc.teleport = true;
				bumpers[i].teleport = true;
				game.ball.x = bumpers[i].clip.x;
				game.ball.y = bumpers[i].clip.y;
				game.ball.mc.x = game.ball.x;
				game.ball.mc.y = game.ball.y;
			}
		} else
			mc.teleport = false;
	},

	boss_room_on_update(game, mc) {
		const sz = Const.BORDER_SIZE + Const.BALL_RAYSIZE;
		const bpos = game.ball;
		if (bpos.x > sz && bpos.y > sz && bpos.x < Const.LVL_WIDTH - sz && bpos.y < Const.LVL_HEIGHT - sz) {
			MB2.removeFrom(game.level.updates, mc);
			for (let d = 0; d < 4; d++) {
				const door = game.level.interf.doors[d];
				if (game.level.dungeon[game.level.pos_x][game.level.pos_y].paths[d].ptype === -1) {
					door.gotoAndStop("off");
					game.level.set_door_collide(d, Collide.border_collide);
				}
			}
			game.ball.start_x = Const.LVL_WIDTH / 2;
			game.ball.start_y = Const.LVL_HEIGHT / 2;

			if (Manager().play_mode === Const.MODE_AIDE) {
				Sound.fadeMix(Sound.MUSIC_MENU);
				Manager().gameOver(true);
				return;
			}
			let boss;
			Sound.fadeMix(Sound.MUSIC_BOSS);
			if (Manager().play_mode === Const.MODE_AVENTURE) {
				if (Manager().play_mode_param === 4) boss = new MB2.BossTB(game);
				else boss = new MB2.BossSerpent(game);
			} else
				boss = new MB2.Boss(game);
			game.boss_update = boss;
		}
	},

	autoclose_door_on_update(game, mc) {
		const sz = Const.BORDER_SIZE + Const.BALL_RAYSIZE;
		const bpos = game.ball;
		if (bpos.x > sz && bpos.y > sz && bpos.x < Const.LVL_WIDTH - sz && bpos.y < Const.LVL_HEIGHT - sz) {
			MB2.removeFrom(game.level.updates, mc);
			game.level.interf.doors[mc.d].gotoAndStop("off");
			game.level.set_door_collide(mc.d, Collide.border_collide);
			if (mc.validate) game.course_validated = true;
		}
	}
};

// ===========================================================================
// Options
MB2.Options = class {
	constructor(game, nballs) {
		this.game = game;
		this.ball_types = [0, 0, 0, 0, 0, 0, 0];
		this.ball_flags = [];
		this.ball_types[0] = nballs;
		this.ball_types_chk = nballs;
		this.cur_ball = 0;
		this.icons = [];
		this.grelots = [];
		this.has_map = false;
		this.has_radar = false;
		this.grelot_count = 0;
	}
	update_icons() {
		if (Manager().play_mode === Const.MODE_CLASSIC) return;
		let x = 585;
		this.clean_icons();
		for (let i = 6; i >= 0; i--) {
			for (let n = 0; n < this.ball_types[i]; n++) {
				const ico = this.game.dmanager.attach("ball icon", Const.ICON_PLAN);
				this.icons.push(ico);
				ico.x = x;
				ico.y = 390;
				ico.ball.gotoAndStop(i + 1);
				if (this.game.ball.btype === i && n === this.ball_types[i] - 1) ico.gotoAndStop("on");
				else ico.gotoAndStop("select");
				x -= 25;
			}
		}
		if (this.grelots.length < this.grelot_count) {
			let xx = 575 - 25 * this.grelots.length;
			while (this.grelots.length < this.grelot_count) {
				const ico = this.game.dmanager.attach("icon grelot", Const.ICON_PLAN);
				this.grelots.push(ico);
				ico.x = xx;
				ico.y = 355;
				xx -= 25;
			}
		} else {
			while (this.grelots.length > this.grelot_count) {
				const g = this.grelots.pop();
				g.gotoAndPlay("hit");
			}
		}
	}
	clean_icons() {
		for (const i of this.icons) i.removeMovieClip();
		this.icons = [];
	}
};

// ===========================================================================
// Ball
const STONE_STYLE = [
	{ MAX: 6, RAYMIN: 10, RAYMAX: 20 },
	{ MAX: 20, RAYMIN: 0, RAYMAX: 20 },
	{ MAX: 4, RAYMIN: 14, RAYMAX: 14 },
	{ MAX: 10, RAYMIN: 0, RAYMAX: 12 },
	{ MAX: 10, RAYMIN: 6, RAYMAX: 20 },
	{ MAX: 0, RAYMIN: 0, RAYMAX: 20 },
	{ MAX: 20, RAYMIN: 0, RAYMAX: 20 }
];
const STONE_COLORS = ["#fff4a0", "#2a7a10", "#ffd0b0", "#ffe070", "#ffffff", "#fff", "#f0d0ff"];

MB2.Ball = class {
	constructor(game) {
		this.game = game;
		this.btype = 0;
		this.mc = game.dmanager.attach("marble", Const.BALL_PLAN);
		this.mc.ball = this;
		this.shadow = game.dmanager.attach("shadow", Const.DECOR_PLAN);
		this.stoneList = [];
		this.gen_stones();
		this.clign_count = 0;
		this.col_count = 0;
		this.x = Const.LVL_CWIDTH / 2;
		this.y = Const.LVL_CHEIGHT / 2;
		this.sx = 0;
		this.sy = 0;
		this.speed = 0;
		Tools.set_mcpos(this.mc, this);
		this.x = this.mc.x;
		this.y = this.mc.y;
		this.start_x = this.x;
		this.start_y = this.y;
		this.control = true;
		this.max_speed_enabled = true;
		this.jump_delta = 0;
		this.hole_death = false;
		this.jump = false;
		this.last_jump = false;
		this.water = false;
	}

	gen_stones() {
		this.stoneList = [];
		const SS = STONE_STYLE[this.btype] || STONE_STYLE[0];
		for (let i = 0; i < SS.MAX; i++) {
			this.stoneList.push({
				dx: random(628), dy: random(628),
				rayon: SS.RAYMIN + random(SS.RAYMAX - SS.RAYMIN),
				size: 1 + Math.random() * 1.6,
				col: STONE_COLORS[this.btype] || "#fff",
				x: 0, y: 0, alpha: 0
			});
		}
	}

	remove_stones() { this.stoneList = []; }

	move_stones() {
		const tmod = Std.tmod;
		for (const s of this.stoneList) {
			s.dx = s.dx + this.sx * 10 * tmod;
			s.dy = s.dy + this.sy * 10 * tmod;
			if (s.dx > 628) s.dx -= 628;
			if (s.dx < 0) s.dx += 628;
			if (s.dy > 628) s.dy -= 628;
			if (s.dy < 0) s.dy += 628;
			s.x = Math.cos(s.dx / 100) * s.rayon / 2;
			s.y = Math.sin(s.dy / 100) * s.rayon / 2;
			const xc = Math.cos((s.dx + 157) / 100);
			const yc = Math.cos((s.dy + 157) / 100);
			const max = (s.rayon / Const.BALL_RAYSIZE) * 50;
			s.alpha = 50 + (xc + yc) * max;
		}
	}

	update_skin() {
		this.remove_stones();
		this.gen_stones();
	}

	update_jump() {
		const tmod = Std.tmod;
		if (this.jump) {
			this.jump_size += tmod * this.jump_way * 60;
			this.jump_delta = Math.sqrt(Math.max(0, this.jump_size * this.speed)) / 6;
			this.mc.xscale = 100 + this.jump_delta * 3;
			this.mc.yscale = 100 + this.jump_delta * 3;
			if (this.jump_size > 200)
				this.jump_way *= -1;
			else if (this.jump_size < 0) {
				this.jump_delta = 0;
				this.jump = false;
				this.mc.xscale = 100;
				this.mc.yscale = 100;
				this.last_jump = true;
			}
		}
	}

	update_hole() {
		if (!this.hole_death) return false;
		this.sx *= 0.9;
		this.sy *= 0.9;
		this.mc.xscale *= Math.pow(0.92, Std.tmod * this.hole_death_speed);
		this.mc.yscale *= Math.pow(0.92, Std.tmod * this.hole_death_speed);
		this.mc.x += this.sx / 5;
		this.mc.y += this.sy / 5;
		if (this.mc.xscale < 3) {
			this.hole_death = false;
			this.mc.mask = null;
			this.classic_mask = null;
			this.hole_mask = null;
			const game = this.game;
			if (Manager().play_mode === Const.MODE_CLASSIC && !this.death_hit) {
				game.curtime += Const.TIME_CLASSIC_EXTENDED;
				this.x = game.level.exit.clip.x;
				this.y = game.level.exit.clip.y + Const.LVL_HEIGHT; // will scroll room down
				game.level.pos_y = random(game.level.height) - 1;
				game.level.pos_x++;
				this.sx = 0;
				this.sy = 0;
				this.mc.xscale = 100;
				this.mc.yscale = 100;
				this.mc.x = this.x;
				this.mc.y = this.y;
				this.shadow.visible = true;
				this.shadow.x = this.x;
				this.shadow.y = this.y;
			} else
				this.kill();
		}
		return true;
	}

	update() {
		const tmod = Std.tmod;
		const game = this.game;
		if (this.clign_count > 0) {
			this.clign_count -= tmod * 1000 / 40;
			this.clign_flag = !this.clign_flag;
			this.mc.alpha = this.clign_flag ? 30 : 60;
			if (this.clign_count <= 0) this.mc.alpha = 100;
		}

		let dx = 0, dy = 0;
		if (this.control && !this.jump) {
			if (Key.isDown(Key.DOWN)) dy++;
			if (Key.isDown(Key.UP)) dy--;
			if (Key.isDown(Key.LEFT)) dx--;
			if (Key.isDown(Key.RIGHT)) dx++;
			if (MB2.Touch) { dx += MB2.Touch.dx; dy += MB2.Touch.dy; }
		}

		let speed_coef = 0.6;
		let inertia = 0.95;
		this.maxspeed = 20;
		switch (this.btype) {
		case 3: // ORANGE
			speed_coef = 2.1;
			inertia = 0.85;
			break;
		case 2: // RED
			speed_coef = 0.6;
			inertia = 0.95;
			for (const b of game.level.bonus) {
				if (b && b.bname === "red") {
					const d = Tools.dist2(this.mc, b.clip);
					if (d < 40000) {
						b.clip.x += (this.mc.x - b.clip.x) * 150 * tmod / d;
						b.clip.y += (this.mc.y - b.clip.y) * 150 * tmod / d;
					}
				}
			}
			break;
		case 5: // METAL
			this.maxspeed = 7;
			speed_coef = 0.2;
			inertia = 0.98;
			break;
		default:
			speed_coef = 0.85;
			inertia = 0.94;
			break;
		}
		if (this.water) {
			inertia = 0.98;
			speed_coef *= 2;
		}
		if (dx !== 0 && dy !== 0 && Math.abs(dx) === 1 && Math.abs(dy) === 1) {
			const sq2 = Math.sqrt(2);
			dx /= sq2;
			dy /= sq2;
		}
		this.sx *= Math.pow(inertia, tmod);
		this.sy *= Math.pow(inertia, tmod);
		if (Math.abs(this.sx) < 0.1) this.sx = 0;
		if (Math.abs(this.sy) < 0.1) this.sy = 0;
		this.sx += speed_coef * dx * tmod;
		this.sy += speed_coef * dy * tmod;
		this.speed = Math.sqrt(this.sx * this.sx + this.sy * this.sy);
		if (this.max_speed_enabled && this.speed > this.maxspeed) {
			if (this.speed > 3 * this.maxspeed) {
				this.speed /= 3;
				this.sx /= 3;
				this.sy /= 3;
			}
			this.speed *= Math.pow(0.8, tmod);
			this.sx *= Math.pow(0.8, tmod);
			this.sy *= Math.pow(0.8, tmod);
		}

		// COLLIDE
		dx = this.sx * tmod;
		dy = this.sy * tmod;
		const ncol = 1 + ((Math.sqrt(dx * dx + dy * dy) / Const.DELTA) | 0);
		dx /= ncol;
		dy /= ncol;
		let i;
		for (i = 0; i < ncol; i++) {
			this.hole_test();
			const c = game.level.col_test(this.x + dx, this.y + dy, true);
			if (c) {
				this.col_count++;
				break;
			}
			this.x += dx;
			this.y += dy;
		}
		if (i === ncol)
			this.col_count = 0;
		else if (this.col_count >= 20) {
			this.sx = 0;
			this.sy = 0;
			this.recall();
		}
		this.mc.x = this.x + Const.DELTA / 2;
		this.mc.y = this.y + Const.DELTA / 2 - this.jump_delta;
		this.shadow.x = this.mc.x + MB2.Ball.SHADOW_DECAL;
		this.shadow.y = this.mc.y + MB2.Ball.SHADOW_DECAL + this.jump_delta;
		this.move_stones();
	}

	recall() {
		for (let ray = 1; ray < 30; ray += 2) {
			for (let a = 0; a < 8; a++) {
				const ang = a * Math.PI / 4;
				const dx = Math.cos(ang) * ray;
				const dy = Math.sin(ang) * ray;
				if (!this.game.level.col_test(this.x + dx, this.y + dy, false)) {
					this.x += dx;
					this.y += dy;
					return;
				}
			}
		}
	}

	hole_test() {
		const dx = (((this.x / Const.DELTA) | 0) - Const.BORDER_CSIZE) / 10 | 0;
		const dy = (((this.y / Const.DELTA) | 0) - Const.BORDER_CSIZE) / 10 | 0;
		const wt = this.game.level.interf.walltable;
		const cell = (x, y) => (wt[x] && wt[x][y]) ? wt[x][y].btype : undefined;
		if (cell(dx, dy) === 7 && !this.jump) { // TROU
			const px = ((dx + 0.5) * 10 + Const.BORDER_CSIZE) * Const.DELTA;
			const py = ((dy + 0.5) * 10 + Const.BORDER_CSIZE) * Const.DELTA;
			const delt = 5 * Const.DELTA;
			let d = 0;
			this.sx *= 1.1;
			this.sy *= 1.1;
			this.speed *= 1.1;
			if (this.x < px && cell(dx - 1, dy) !== 7) d |= 1;
			else if (this.x > px && cell(dx + 1, dy) !== 7) d |= 2;
			if (this.y < py && cell(dx, dy - 1) !== 7) d |= 4;
			else if (this.y > py && cell(dx, dy + 1) !== 7) d |= 8;
			if (d === 15) d = 0;
			if (d & 1) this.sx++;
			if (d & 2) this.sx--;
			if (d & 4) this.sy++;
			if (d & 8) this.sy--;
			if (this.x > (px - delt + ((d & 1) ? Const.BALL_RAYSIZE : 0)) &&
				this.x < (px + delt - ((d & 2) ? Const.BALL_RAYSIZE : 0)) &&
				this.y > (py - delt + ((d & 4) ? Const.BALL_RAYSIZE : 0)) &&
				this.y < (py + delt - ((d & 8) ? Const.BALL_RAYSIZE : 0))) {
				const rects = this.game.level.interf.holes.rects.slice();
				this.hole_mask = rects;
				this.mc.mask = ctx => {
					ctx.beginPath();
					for (const r of rects) ctx.rect(r[0], r[1], r[2], r[3]);
					ctx.clip();
				};
				this.shadow.visible = false;
				this.clign_count = 0;
				this.mc.alpha = 100;
				this.hole_death_speed = 1;
				this.death_hit = false;
				this.hole_death = true;
				return;
			} else if (this.btype === 4 && !this.last_jump) { // BLUE
				this.jump = true;
				this.jump_way = 1;
				this.jump_size = 0;
				this.jump_delta = 0;
				return;
			}
		} else if (this.last_jump)
			this.last_jump = false;
	}

	die() {
		if (this.clign_count > 0) return;
		if (!this.hole_death) {
			this.mc.alpha = 100;
			this.hole_death = true;
			this.death_hit = true;
			this.hole_death_speed = 5;
			this.shadow.visible = false;
			this.sx = 0;
			this.sy = 0;
		}
	}

	kill() {
		const game = this.game;
		this.sx = 0;
		this.sy = 0;
		this.x = this.start_x;
		this.y = this.start_y;
		this.mc.xscale = 100;
		this.mc.yscale = 100;
		this.mc.x = this.x;
		this.mc.y = this.y;
		this.mc.visible = true;
		this.mc.alpha = 100;
		this.shadow.visible = true;
		this.shadow.x = this.x;
		this.shadow.y = this.y;
		this.jump = false;
		this.jump_delta = 0;
		if (Manager().play_mode !== Const.MODE_AIDE) {
			if (this.btype !== 0 || Manager().play_mode !== Const.MODE_COURSE) {
				game.options.ball_types[this.btype]--;
				game.options.ball_types_chk--;
			}
		}
		this.clign_count = 400;
		this.clign_flag = true;
		const last = this.btype;
		while (!(game.options.ball_types[this.btype] > 0)) {
			this.btype++;
			this.btype %= 7;
			if (this.btype === last) {
				game.options.update_icons();
				this.shadow.visible = false;
				this.mc.visible = false;
				game.gameOver(Const.CAUSE_NOBALLS);
				return;
			}
		}
		game.options.update_icons();
		this.update_skin();
	}
};
MB2.Ball.SHADOW_DECAL = 3;

// ===========================================================================
// Interf
MB2.Interf = class {
	constructor(game) {
		this.game = game;
		const dm = game.dmanager;
		this.doors = [];
		for (let d = 0; d < 4; d++) {
			let door = dm.attach("door", Const.DOOR_PLAN);
			this.doors[d] = door;
			door.d = d;
			const b = Const.BORDER_SIZE / 2;
			switch (d) {
			case 0: door.sx = b; door.sy = Const.LVL_HEIGHT / 2; door.rotation = -90; break;
			case 1: door.sx = Const.LVL_WIDTH - b; door.sy = Const.LVL_HEIGHT / 2; door.rotation = 90; break;
			case 2: door.sx = Const.LVL_WIDTH / 2; door.sy = b; break;
			case 3: door.sx = Const.LVL_WIDTH / 2; door.sy = Const.LVL_HEIGHT - b; door.rotation = 180; break;
			}
			door.x = door.sx;
			door.y = door.sy;
			door.stop();
			door = dm.attach("door", Const.DOOR_PLAN);
			door.d = d;
			door.stop();
			this.doors[d + 4] = door;
			door.rotation = this.doors[d].rotation;
			door.visible = false;
		}
		this.bg1 = dm.attach("background", Const.BG_PLAN);
		this.bg2 = dm.attach("background", Const.BG_PLAN);
		this.ground = dm.attach("ground", Const.HOLE_PLAN);
		this.holes = dm.attach("holes", Const.HOLE_PLAN);
		this.shades = dm.attach("shades", Const.SHADE_PLAN - 1);
		this.decor1 = dm.attach("border", Const.DECOR_PLAN);
		this.decor2 = dm.attach("border", Const.DECOR_PLAN);
		this.tview = dm.attach("time counter", Const.ICON_PLAN);
		switch (Manager().play_mode) {
		case Const.MODE_CLASSIC: this.tview.gotoAndStop("classic"); break;
		case Const.MODE_COURSE: this.tview.gotoAndPlay("time"); break;
		default: this.tview.gotoAndStop(1); break;
		}
		this.tview.x = Const.LVL_WIDTH;
		this.bg2.stop();
		this.bg2.visible = false;
		this.decor2.visible = false;
		this.ground.holes = this.holes;
		this.ground.visible = false;
		this.scroll_x = 0;
		this.scroll_y = 0;
	}

	init_room() {
		const WWIDTH = (Const.LVL_CWIDTH / 10) | 0;
		this.walltable = [];
		for (let x = 0; x < WWIDTH; x++) this.walltable[x] = [];
		this.bg1.gotoAndStop(this.selectBg(this.game.level.pos_x, this.game.level.pos_y));
	}

	init_doors(ddelta) {
		const game = this.game;
		const room = game.level.dungeon[game.level.pos_x][game.level.pos_y];
		for (let d = 0; d < 4; d++) {
			const p = room.paths ? room.paths[d] : { ptype: 1 };
			const door = this.doors[ddelta + d];
			let pt = p.ptype;
			if (pt === 3 && Manager().play_mode !== Const.MODE_CHALLENGE) pt = -2;
			switch (pt) {
			case -2: { // ONE-WAY
				if ((d === 0 && this.scroll_dx === 1) ||
					(d === 1 && this.scroll_dx === -1) ||
					(d === 2 && this.scroll_dy === 1) ||
					(d === 3 && this.scroll_dy === -1)) {
					if (ddelta === 0) {
						const o = { d: d, validate: (p.ptype === -2), on_update: Collide.autoclose_door_on_update };
						game.level.updates.push(o);
					}
					door.gotoAndStop("opened");
					game.level.set_door_collide(d, Collide.border_collide_no_recal, Const.DOOR_COLLIDE_DELTA);
					game.level.set_door_collide(d, null);
				} else {
					door.gotoAndStop("off");
					game.level.set_door_collide(d, Collide.border_collide);
				}
				break;
			}
			case -1: // OPEN
				door.gotoAndStop("opened");
				game.level.set_door_collide(d, Collide.border_collide_no_recal, Const.DOOR_COLLIDE_DELTA);
				game.level.set_door_collide(d, null);
				break;
			case 0: // DOOR
			case 3: { // NEED
				door.gotoAndStop(game.level.bonus_reds ? "off" : "on");
				const o = {
					on_hit: Collide.door_on_hit,
					hit_coef: Collide.border_collide.hit_coef,
					hit_min: Collide.border_collide.hit_min,
					d: d
				};
				game.level.set_door_collide(d, o);
				break;
			}
			case 2: // INVISIBLE
				door.gotoAndStop("nodoor" + d);
				game.level.set_door_collide(d, Collide.border_collide_no_recal, Const.DOOR_COLLIDE_DELTA);
				game.level.set_door_collide(d, null);
				break;
			default: // NO DOOR / NO ROOM
				door.gotoAndStop("nodoor" + d);
				game.level.set_door_collide(d, Collide.border_collide);
				break;
			}
		}
	}

	open_doors() {
		const exit = this.game.level.exit;
		if (exit != null) exit.clip.gotoAndPlay("anim_open");
		for (let d = 0; d < 4; d++) this.open_door(d);
	}

	open_door(d) {
		const game = this.game;
		const room = game.level.dungeon[game.level.pos_x][game.level.pos_y];
		if (!room.paths) return;
		const p = room.paths[d];
		if (p.ptype === 0 || p.ptype === 3) { // DOOR | NEED
			if (p.ptype === 3 && Manager().play_mode !== Const.MODE_CHALLENGE) {
				p.ptype = -2;
				return;
			} else
				p.ptype = -1;
			this.doors[d].gotoAndPlay("open");
			game.level.set_door_collide(d, Collide.border_collide_no_recal, Const.DOOR_COLLIDE_DELTA);
			game.level.set_door_collide(d, null);
		}
	}

	update_walls() {
		const WWIDTH = (Const.LVL_CWIDTH / 10) | 0;
		const WHEIGHT = (Const.LVL_CHEIGHT / 10) | 0;
		const wt = this.walltable;
		const bt = (x, y) => (wt[x] && wt[x][y]) ? wt[x][y].btype : undefined;
		this.holes.rects = [];
		this.shades.ops = [];
		for (let x = 0; x < WWIDTH; x++)
			for (let y = 0; y < WHEIGHT; y++) {
				const b = wt[x][y];
				if (!b) continue;
				let frame = 0;
				if (bt(x - 1, y) === b.btype) frame += 1;
				if (bt(x, y - 1) === b.btype) frame += 2;
				if (bt(x + 1, y) === b.btype) frame += 4;
				if (bt(x, y + 1) === b.btype) frame += 8;
				if (b.btype === 7) { // HOLE
					const w = Const.DELTA * 10;
					let h = 0;
					const px = (Const.BORDER_CSIZE + x * 10) * Const.DELTA + 1;
					const py = (Const.BORDER_CSIZE + y * 10) * Const.DELTA + 1;
					if (y > 0 && (frame & 2) === 0) {
						h = Const.HOLE_BORDER_SIZE;
						this.shades.ops.push({ t: "rect", col: "#9B76BC", x: px, y: py, w: w, h: Const.HOLE_BORDER_SIZE });
					}
					this.holes.rects.push([px, py + h, w, w - h, (frame & 2) === 0]);
				}
				b.frame = frame;
				if (b.clip) b.clip.gotoAndStop(frame + 1);
			}
		const decal = 4;
		for (let x = 0; x < WWIDTH; x++)
			for (let y = 0; y < WHEIGHT; y++) {
				const b = wt[x][y];
				if (!b || b.btype !== 6) continue;
				let p = null;
				if ((b.frame & 2) === 0) {
					let dy = 1;
					while (bt(x, y + dy) === 6) dy++;
					p = {
						t: "smooth", a: 0.2, curve: 8,
						x: (Const.BORDER_CSIZE + x * 10) * Const.DELTA + decal,
						y: (Const.BORDER_CSIZE + y * 10) * Const.DELTA + decal,
						w: 10 * Const.DELTA, h: dy * 10 * Const.DELTA
					};
					this.shades.ops.push(p);
				}
				if ((b.frame & 1) === 0) {
					let dx = 1;
					while (bt(x + dx, y) === 6) dx++;
					const q = {
						t: "smooth", a: 0.2, curve: 8,
						x: (Const.BORDER_CSIZE + x * 10) * Const.DELTA + decal,
						y: (Const.BORDER_CSIZE + y * 10) * Const.DELTA + decal,
						w: dx * 10 * Const.DELTA, h: 10 * Const.DELTA
					};
					this.shades.ops.push(q);
				}
			}
		this.ground.visible = this.holes.rects.length > 0;
	}

	fill_wall(b, v) {
		const x = ((b.x - Const.BORDER_CSIZE) / 10) | 0;
		const y = ((b.y - Const.BORDER_CSIZE) / 10) | 0;
		if (this.walltable[x]) this.walltable[x][y] = v;
	}

	scroll_room() {
		const tmod = Std.tmod;
		const game = this.game;
		this.scroll_x -= this.scroll_dx * tmod * (Const.LVL_WIDTH / 20);
		this.scroll_y -= this.scroll_dy * tmod * (Const.LVL_HEIGHT / 20);
		if (this.scroll_end) {
			game.scroll_on = false;
			this.bg2.visible = false;
			this.decor2.visible = false;
			for (let d = 0; d < 4; d++) this.doors[d + 4].visible = false;
			game.ball.x -= this.scroll_dx * Const.LVL_WIDTH;
			game.ball.y -= this.scroll_dy * Const.LVL_HEIGHT;
			this.scroll_x = 0;
			this.scroll_y = 0;
			game.next_room();
		}
		if (Math.abs(this.scroll_x) >= Math.abs(this.scroll_dx * Const.LVL_WIDTH) && Math.abs(this.scroll_y) >= Math.abs(this.scroll_dy * Const.LVL_HEIGHT)) {
			this.scroll_end = true;
			this.scroll_x = -this.scroll_dx * Const.LVL_WIDTH;
			this.scroll_y = -this.scroll_dy * Const.LVL_HEIGHT;
		}
		if (!game.scroll_on) {
			this.scroll_x = 0; this.scroll_y = 0;
		}
		this.bg2.x = this.scroll_dx * Const.LVL_WIDTH + this.scroll_x;
		this.bg2.y = this.scroll_dy * Const.LVL_HEIGHT + this.scroll_y;
		this.decor2.x = this.bg2.x;
		this.decor2.y = this.bg2.y;
		this.bg1.x = this.scroll_x;
		this.bg1.y = this.scroll_y;
		this.decor1.x = this.scroll_x;
		this.decor1.y = this.scroll_y;
		game.ball.mc.x = game.ball.x + this.scroll_x;
		game.ball.mc.y = game.ball.y + this.scroll_y;
		game.ball.shadow.x = game.ball.mc.x + MB2.Ball.SHADOW_DECAL;
		game.ball.shadow.y = game.ball.mc.y + MB2.Ball.SHADOW_DECAL;
		for (let d = 0; d < 4; d++) {
			const door = this.doors[d];
			door.x = door.sx + this.scroll_x;
			door.y = door.sy + this.scroll_y;
		}
		for (let d = 0; d < 4; d++) {
			const door = this.doors[d + 4];
			door.x = this.doors[d].sx + this.scroll_x + this.scroll_dx * Const.LVL_WIDTH;
			door.y = this.doors[d].sy + this.scroll_y + this.scroll_dy * Const.LVL_HEIGHT;
		}
	}

	update() {
		const game = this.game;
		const tv = this.tview;
		if (Manager().play_mode === Const.MODE_COURSE) {
			tv.lap = game.course_nturns - 1;
			if (tv.frame !== 11) {
				this.old_time = 1.5;
				return;
			}
			if (this.old_time > 0) {
				this.old_time -= Std.deltaT;
				return;
			}
			tv.min = MB2.Interf.padNumber((game.curtime / 60) | 0, 2);
			tv.sec = MB2.Interf.padNumber(((game.curtime) | 0) % 60, 2);
			tv.mil = MB2.Interf.padNumber(((game.curtime * 100) | 0) % 100, 2);
		} else {
			const t = (game.curtime / 100) | 0;
			if (this.old_time !== t) {
				this.old_time = t;
				tv.txt = t;
			}
		}
	}

	selectBg(x, y) { return 1 + (x + y) % 4; }

	change_room(dx, dy) {
		const game = this.game;
		this.scroll_x = 0;
		this.scroll_y = 0;
		this.scroll_dx = dx;
		this.scroll_dy = dy;
		this.bg2.visible = true;
		this.decor2.visible = true;
		this.bg2.x = -1000;
		this.decor2.x = -1000;
		for (let d = 0; d < 4; d++) {
			const door = this.doors[d + 4];
			door.visible = true;
			door.x = -1000;
			door.y = -1000;
		}
		game.level.pos_x += this.scroll_dx;
		game.level.pos_y += this.scroll_dy;
		game.level.prepare_room();
		this.bg2.gotoAndStop(this.selectBg(game.level.pos_x, game.level.pos_y));
		let dir;
		if (dx < 0) dir = 1;
		else if (dx > 0) dir = 0;
		else if (dy < 0) dir = 3;
		else dir = 2;
		this.open_door(dir);
		// don't open doors automaticly :)
		game.level.bonus_reds = 1;
		this.init_doors(4);
		game.scroll_on = true;
		this.scroll_end = false;
		this.scroll_room();
	}
};
MB2.Interf.makeTime = function (t) {
	const P = MB2.Interf.padNumber;
	t = Math.round(t);
	return P((t / 6000) | 0, 2) + ":" + P(((t / 100) | 0) % 60, 2) + ":" + P(t % 100, 2);
};
MB2.Interf.padNumber = function (x, n) {
	x = "" + x;
	while (x.length < n) x = "0" + x;
	return x;
};

// ===========================================================================
// Level
MB2.Level = class {
	constructor(game) {
		this.game = game;
		this.dmanager = game.dmanager;
		const data = MB2.Manager.level_data;
		this.data = data;
		this.width = data.width;
		this.height = data.height;
		this.start_x = data.start_x;
		this.start_y = data.start_y;
		this.dungeon = data.dungeon;
		this.pos_x = this.start_x;
		this.pos_y = this.start_y;
		this.exit = null;
		this.interf = new MB2.Interf(game);
	}

	// classic dungeons are generated column after column
	prepare_room() {
		if (this.data.ensure) this.data.ensure(this.pos_x + 2);
		if (this.pos_x < 0 || this.pos_y < 0 || this.pos_x >= this.width || this.pos_y >= this.height) {
			this.pos_x = Math.max(0, Math.min(this.width - 1, this.pos_x));
			this.pos_y = Math.max(0, Math.min(this.height - 1, this.pos_y));
		}
	}

	init_room() {
		this.prepare_room();
		this.interf.init_room();
		this.bonus = [];
		this.updates = [];
		this.objects = [];
		this.coltable = [];
		this.dummies = [];
		for (let x = 0; x < Const.LVL_CWIDTH; x++) this.coltable[x] = [];
		const B = Collide.border_collide;
		for (let x = 0; x < Const.BORDER_CSIZE; x++)
			for (let y = 0; y < Const.LVL_CHEIGHT; y++) {
				this.coltable[x][y] = B;
				this.coltable[Const.LVL_CWIDTH - 1 - x][y] = B;
			}
		for (let y = 0; y < Const.BORDER_CSIZE; y++)
			for (let x = 0; x < Const.LVL_CWIDTH; x++) {
				this.coltable[x][y] = B;
				this.coltable[x][Const.LVL_CHEIGHT - 1 - y] = B;
			}
		this.gen_room();
		return true;
	}

	free_pos(px, py, msize) {
		for (let x = 0; x < msize.w; x++)
			for (let y = 0; y < msize.h; y++)
				if (this.coltable[x + px][y + py]) return false;
		return true;
	}

	fill_pos(p, map, v) {
		if (!map) return;
		const w = map.length, h = map[0].length;
		for (let x = 0; x < w; x++) {
			const col = this.coltable[x + p.x];
			if (!col) continue;
			for (let y = 0; y < h; y++)
				if (map[x][y]) col[y + p.y] = v;
		}
	}

	erase_pos(b) {
		const msize = Tools.mc_size(b.clip);
		msize.w += b.x;
		msize.h += b.y;
		for (let x = b.x; x < msize.w; x++)
			for (let y = b.y; y < msize.h; y++)
				if (this.coltable[x] && this.coltable[x][y] === b) this.coltable[x][y] = null;
	}

	gen_room() {
		const room = this.dungeon[this.pos_x][this.pos_y];
		room.visited = true;
		this.bonus_reds = 0;
		switch (room.rtype) {
		case 2: this.gen_boss_room(room); break;
		case 3: this.gen_object_room(room.rdata); break;
		case 4: this.gen_bonus_room(room.rdata); break;
		default: this.gen_normal_room(room.bdata || []); break;
		}
		this.interf.init_doors(0);
		if (this.bonus_reds === 0) this.interf.open_doors();
		this.interf.update_walls();
	}

	gen_boss_room(r) {
		this.bonus_reds = 1;
		this.updates.push({ on_update: Collide.boss_room_on_update });
		const W = Const.LVL_CWIDTH, H = Const.LVL_CHEIGHT, B = Const.BORDER_CSIZE;
		this.gen_bumper({ btype: 7, x: B + 1, y: H - 10 });
		this.gen_bumper({ btype: 7, x: B + 11, y: H - 10 });
		this.gen_bumper({ btype: 7, x: B + 1, y: H - 20 });
		this.gen_bumper({ btype: 7, x: W - 10, y: H - 10 });
		this.gen_bumper({ btype: 7, x: W - 20, y: H - 10 });
		this.gen_bumper({ btype: 7, x: W - 10, y: H - 20 });
		this.objects.push(this.gen_bumper({ btype: 3, x: 7, y: 7 }));
		this.objects.push(this.gen_bumper({ btype: 3, x: W - 17, y: 7 }));
	}

	gen_corner_bumpers() {
		const W = Const.LVL_CWIDTH, H = Const.LVL_CHEIGHT;
		this.objects.push(this.gen_bumper({ btype: 2, x: 7, y: 7 }));
		this.objects.push(this.gen_bumper({ btype: 2, x: W - 23, y: 7 }));
		this.objects.push(this.gen_bumper({ btype: 2, x: 7, y: H - 23 }));
		this.objects.push(this.gen_bumper({ btype: 2, x: W - 23, y: H - 23 }));
		this.objects.push(this.gen_bumper({ btype: 1, x: 50, y: 30 }));
		this.objects.push(this.gen_bumper({ btype: 1, x: W - 62, y: 30 }));
		this.objects.push(this.gen_bumper({ btype: 1, x: 50, y: H - 42 }));
		this.objects.push(this.gen_bumper({ btype: 1, x: W - 62, y: H - 42 }));
	}

	gen_object_room(o) {
		let obj;
		switch (o) {
		case 0: obj = 1; break; // VERTE
		case 1: obj = 4; break; // BLEUE
		case 2: obj = 5; break; // METAL
		case 3: obj = 6; break; // VIOLET
		case 4: obj = 3; break; // ORANGE
		case 5: obj = 2; break; // ROUGE
		}
		if (obj !== undefined) {
			const clip = this.dmanager.attach("ballbox", Const.BONUS_PLAN);
			Tools.set_mcpos(clip, Tools.pos_center(clip));
			clip.ball.gotoAndStop(obj + 1);
			const oo = { on_update: Collide.ball_object_on_update, obj: obj, clip: clip };
			this.updates.push(oo);
			this.objects.push(oo);
		}
		this.gen_corner_bumpers();
	}

	gen_bonus_room(bt) {
		let item, on_get_item;
		switch (bt) {
		case 0: this.gen_object_room(4); return; // B.ORANGE
		case 1: this.gen_object_room(5); return; // B.ROUGE
		case 2: item = 0; on_get_item = Collide.on_get_map; break;
		case 3: item = 1; on_get_item = Collide.on_get_radar; break;
		case 4: item = 4; on_get_item = Collide.on_get_key; break;
		case 5: item = 2; on_get_item = Collide.on_get_small_blue; break;
		case 6: item = 3; on_get_item = Collide.on_get_big_blue; break;
		}
		if (bt !== -1 && item !== undefined) {
			const clip = this.dmanager.attach("itembox", Const.BUMPER_PLAN);
			const b = { clip: clip, pos: Tools.pos_center(clip), hit_coef: 0.1, hit_min: 0 };
			this.fill_pos(b.pos, Collide.hitmap[7], b);
			Tools.set_mcpos(clip, b.pos);
			b.on_hit = Collide.item_box_on_hit;
			b.on_get_item = on_get_item;
			clip.item.gotoAndStop(item + 1);
			this.objects.push(b);
		}
		this.gen_corner_bumpers();
	}

	gen_normal_room(blist) {
		for (const b of blist) {
			switch (b.btype) {
			case 0: break;
			case 8:
				this.bonus.push(this.gen_bonus("red", b, Collide.red_on_hit));
				this.bonus_reds++;
				break;
			case 9:
				this.bonus.push(this.gen_bonus("blue", b, Collide.blue_on_hit));
				break;
			case 15:
				this.exit = this.gen_bonus("exit", b, Collide.classic_exit_on_hit);
				this.exit.clip.x += 2;
				this.exit.clip.y += 2;
				this.bonus.push(this.exit);
				this.exit.clip.stop();
				break;
			default:
				this.objects.push(this.gen_bumper(b));
				break;
			}
		}
		this.finalize_zappers();
	}

	finalize_zappers() {
		const zappers = [];
		let sx, sy;
		for (const b of this.objects) {
			if (b && b.btype === 14) {
				let zaps = zappers[b.phase];
				if (zaps == null) {
					zaps = [];
					zappers[b.phase] = zaps;
					if (sx === undefined) {
						const s = Tools.mc_size(b.clip);
						sx = s.w / 2;
						sy = s.h / 2;
					}
				}
				zaps.push(b);
			}
		}
		this.zap_lines = [];
		for (const zaps of zappers) {
			if (!zaps) continue;
			for (let j = 0; j < zaps.length; j++)
				for (let k = j + 1; k < zaps.length; k++)
					this.trace_zappers(zaps[j], zaps[k], sx, sy);
		}
		if (this.zap_lines.length) {
			const zl = this.dmanager.attach("zaplines", Const.SHADE_PLAN);
			zl.lines = this.zap_lines;
			this.dummies.push({ clip: zl });
		}
	}

	trace_zappers(z1, z2, sx, sy) {
		const col = { phase: z1.phase, on_hit: Collide.zapper_line_on_hit, is_event: true, z1: z1, z2: z2 };
		this.zap_lines.push(col);
		let dx = z2.x - z1.x;
		let dy = z2.y - z1.y;
		const d = Math.sqrt(dx * dx + dy * dy);
		dx /= d;
		dy /= d;
		const len = (d | 0) + 1;
		let x = z1.x + sx;
		let y = z1.y + sy;
		for (let l = 0; l < len; l++) {
			const c = this.coltable[x | 0];
			if (c) c[y | 0] = col;
			x += dx;
			y += dy;
		}
	}

	gen_bumper(b) {
		let bname;
		let upper = true;
		const game = this.game;
		switch (b.btype) {
		case 1: bname = "bnormal"; b.on_hit = Collide.bumper_normal_on_hit; b.hit_coef = 1.5; b.hit_min = 20; break;
		case 2: bname = "btime"; b.on_hit = Collide.bumper_time_on_hit; b.hit_coef = 1.5; b.hit_min = 15; break;
		case 3: bname = "bdeath"; b.on_hit = Collide.bumper_death_on_hit; b.hit_coef = 1.2; b.hit_min = 5; break;
		case 4: bname = "bmagnet"; b.on_hit = Collide.bumper_magnet_on_hit; b.hit_coef = 1.0; b.hit_min = 5; break;
		case 5: bname = "bshadow"; b.on_hit = Collide.bumper_shadow_on_hit; b.hit_coef = 3.0; b.hit_min = 15; break;
		case 6:
			bname = "wall"; b.on_hit = Collide.wall_on_hit; b.hit_coef = 1.2; b.hit_min = 0;
			this.interf.fill_wall(b, b);
			break;
		case 10: upper = false; bname = "bteleport"; break;
		case 11: bname = "interupt"; b.on_hit = Collide.interupt_on_hit; b.hit_coef = 1.2; b.hit_min = 0; break;
		case 12:
			upper = false; bname = "interred";
			b.on_hit = Collide.interupt_flag ? Collide.interblock_on_hit : null;
			b.hit_coef = 1.2; b.hit_min = 0;
			break;
		case 13:
			upper = false; bname = "interblue";
			b.on_hit = Collide.interupt_flag ? null : Collide.interblock_on_hit;
			b.hit_coef = 1.2; b.hit_min = 0;
			break;
		case 14:
			bname = (Manager().play_mode === Const.MODE_COURSE) ? "checkpoint" : "zapper";
			b.on_hit = Collide.zapper_on_hit; b.hit_coef = 1.1; b.hit_min = 10;
			break;
		case 7:
			// TROU
			this.interf.ground.visible = true;
			this.interf.fill_wall(b, b);
			return null;
		default:
			return null;
		}
		const clip = this.dmanager.attach(bname, upper ? Const.BUMPER_PLAN : Const.SHADE_PLAN);
		this.fill_pos(b, Collide.hitmap[b.btype - 1], b);
		Tools.set_mcpos(clip, b);
		b.clip = clip;
		if (b.btype !== 5 && b.btype !== 6 && b.btype !== 10 && b.btype !== 12 && b.btype !== 13) {
			b.shade = this.dmanager.attach("ombre", Const.SHADE_PLAN);
			b.shade.x = b.clip.x;
			b.shade.y = b.clip.y;
			b.shade.gotoAndStop(b.btype);
		}
		switch (b.btype) {
		case 4:
			b.way = true;
			b.clip.gotoAndPlay("plus");
			b.on_update = Collide.bumper_magnet_on_update;
			this.updates.push(b);
			break;
		case 5:
			b.clip.visible = false;
			b.clip.alpha = 0;
			b.alpha = 0;
			b.on_update = Collide.bumper_shadow_on_update;
			this.updates.push(b);
			break;
		case 2:
			b.on_update = Collide.bumper_time_on_update;
			b.curtime = game.curtime;
			b.on_update(game, b);
			this.updates.push(b);
			break;
		case 10:
			b.on_update = Collide.bumper_teleport_on_update;
			this.updates.push(b);
			break;
		case 11:
		case 13:
			b.clip.gotoAndStop(Collide.interupt_flag ? "on" : "off");
			break;
		case 12:
			b.clip.gotoAndStop(Collide.interupt_flag ? "off" : "on");
			break;
		case 14: {
			const s = Tools.mc_size(b.clip);
			if (Manager().play_mode === Const.MODE_COURSE)
				b.phase = 0;
			else {
				b.phase = ((b.x - s.w / 2) + (b.y - s.h / 2)) % 7;
				if (b.phase < 0) b.phase += 7;
				b.clip.gotoAndStop(1 + b.phase);
			}
			break;
		}
		}
		return b;
	}

	gen_bonus(bname, b, on_hit) {
		const clip = this.dmanager.attach(bname, Const.BONUS_PLAN);
		Tools.set_mcpos(clip, b);
		b.bname = bname;
		b.clip = clip;
		b.on_hit = on_hit;
		return b;
	}

	set_door_collide(d, v, delta) {
		if (delta === undefined) delta = 0;
		const ct = this.coltable;
		switch (d) {
		case 0:
			for (let x = 0; x < Const.BORDER_CSIZE; x++)
				for (let y = -delta; y < Const.DOOR_CSIZE + delta; y++)
					ct[x][y + Const.DOOR_CYPOS] = v;
			break;
		case 1:
			for (let x = 0; x < Const.BORDER_CSIZE; x++)
				for (let y = -delta; y < Const.DOOR_CSIZE + delta; y++)
					ct[Const.LVL_CWIDTH - 1 - x][y + Const.DOOR_CYPOS] = v;
			break;
		case 2:
			for (let x = -delta; x < Const.DOOR_CSIZE + delta; x++)
				for (let y = 0; y < Const.BORDER_CSIZE; y++)
					ct[x + Const.DOOR_CXPOS][y] = v;
			break;
		case 3:
			for (let x = -delta; x < Const.DOOR_CSIZE + delta; x++)
				for (let y = 0; y < Const.BORDER_CSIZE; y++)
					ct[x + Const.DOOR_CXPOS][Const.LVL_CHEIGHT - 1 - y] = v;
			break;
		}
	}

	clean_room() {
		for (const o of this.objects) {
			if (!o) continue;
			if (o.clip) o.clip.removeMovieClip();
			if (o.shade) o.shade.removeMovieClip();
		}
		for (const b of this.bonus) if (b && b.clip) b.clip.removeMovieClip();
		for (const d of this.dummies) if (d && d.clip) d.clip.removeMovieClip();
		if (this.exit) this.exit.clip.removeMovieClip();
		this.exit = null;
		this.interf.holes.rects = [];
		this.interf.shades.ops = [];
		this.interf.ground.visible = false;
	}

	change_room(dx, dy) {
		this.clean_room();
		this.interf.change_room(dx, dy);
	}

	col_test(x, y, side_effects) {
		const game = this.game;
		const asteps = 16;
		let first_col = 0, n_col = 0, tot = 0, hit_coef = 0, hit_min = 0;
		let first_ct, fpx, fpy;
		const in_ang = Math.atan2(game.ball.sy, game.ball.sx);
		for (let i = 0; i < asteps; i++) {
			const ang = (Math.PI * 2) * i / asteps;
			const px = ((x + Math.cos(ang) * Const.BALL_RAYSIZE + Const.DELTA / 2) / Const.DELTA) | 0;
			const py = ((y + Math.sin(ang) * Const.BALL_RAYSIZE + Const.DELTA / 2) / Const.DELTA) | 0;
			const col = this.coltable[px];
			const ct = col ? col[py] : undefined;
			if (ct && ct.on_hit) {
				if (ct.is_event) {
					if (side_effects) ct.on_hit(game, ct, px, py);
				} else {
					if (!side_effects) return true;
					hit_coef = Math.max(ct.hit_coef, hit_coef);
					hit_min = Math.max(ct.hit_min, hit_min);
					if (n_col === 0) {
						first_col = i;
						first_ct = ct;
						fpx = px;
						fpy = py;
					} else {
						first_ct.on_hit(game, first_ct, fpx, fpy);
						ct.on_hit(game, ct, px, py);
						if (i - first_col < asteps / 2) tot += i - first_col;
						else tot += i - asteps - first_col;
					}
					n_col++;
				}
			}
		}
		if (n_col > 1) {
			tot /= n_col;
			tot += first_col;
			if (tot < 0) tot += asteps;
			const ang = (Math.PI * 2) * tot / asteps - Math.PI;
			let speed = game.ball.speed * hit_coef;
			if (speed < hit_min) speed = hit_min;
			const out_ang = ang + Math.PI - (in_ang - ang) + Math.random() / 100;
			if (Math.abs(Tools.rad_dif(in_ang, ang)) > Math.PI / 2 + 0.05) {
				game.ball.sx = speed * Math.cos(out_ang);
				game.ball.sy = speed * Math.sin(out_ang);
				game.ball.x += Math.cos(out_ang) * Std.tmod * Math.min(n_col * n_col / 10, 3);
				game.ball.y += Math.sin(out_ang) * Std.tmod * Math.min(n_col * n_col / 10, 3);
				return true;
			}
		}
		return false;
	}
};

// ===========================================================================
// Game
MB2.Game = class {
	constructor() {
		const M = MB2.Manager;
		this.can_loose = true;
		this.course_validated = false;
		this.dmanager = new MB2.DepthManager();
		this.scroll_on = false;
		this.pause = null;
		this.boss_update = null;
		Collide.init(this);
		this.level = new MB2.Level(this);
		this.ball = new MB2.Ball(this);
		switch (M.play_mode) {
		case Const.MODE_CLASSIC:
			this.curtime = Const.TIME_CLASSIC;
			this.options = new MB2.Options(this, 1);
			this.level.pos_x = 0;
			this.level.pos_y = random(this.level.height);
			break;
		case Const.MODE_AIDE:
			this.curtime = Const.TIME_CHALLENGE;
			this.options = new MB2.Options(this, 3);
			break;
		case Const.MODE_COURSE:
			this.course_nturns = 3;
			this.curtime = 0;
			this.options = new MB2.Options(this, 1);
			break;
		case Const.MODE_AVENTURE:
			this.curtime = Const.TIME_CHALLENGE * 1.2;
			this.options = new MB2.Options(this, 5);
			break;
		default:
			this.curtime = Const.TIME_CHALLENGE;
			this.options = new MB2.Options(this, 3);
			break;
		}
		this.game_over_flag = false;
		this.ball.update_skin();
		this.options.update_icons();
		this.next_room();
		Sound.startMix();
	}

	calcScore(cause) {
		const M = MB2.Manager;
		if (M.play_mode === Const.MODE_CLASSIC) return this.level.pos_x + 1;
		if (M.play_mode === Const.MODE_COURSE) return (this.curtime * 100) | 0;
		let score = 0, trooms = 0, vrooms = 0;
		for (let x = 0; x < this.level.width; x++)
			for (let y = 0; y < this.level.height; y++) {
				const r = this.level.dungeon[x][y];
				if (r.rtype !== 0) trooms++;
				if (r.visited) vrooms++;
			}
		score += ((vrooms * 100 / trooms) | 0) - 1;
		if (cause === Const.CAUSE_WINS) score += ((this.curtime / 100) | 0) * 100;
		return score;
	}

	course_turn_done() {
		if (!this.course_validated) return;
		this.level.interf.tview.play();
		this.course_nturns--;
		if (this.course_nturns === 0) this.gameOver(Const.CAUSE_WINS);
		this.course_validated = false;
		for (let x = 0; x < this.level.width; x++)
			for (let y = 0; y < this.level.height; y++)
				if (x !== this.level.pos_x || y !== this.level.pos_y) {
					const r = this.level.dungeon[x][y];
					r.visited = false;
					if (r.paths)
						for (let i = 0; i < 4; i++)
							if (r.paths[i].ptype === -1) r.paths[i].ptype = 0;
					if (r.bdata)
						for (const b of r.bdata)
							if (b.old_btype) b.btype = b.old_btype;
				}
	}

	next_room() {
		this.level.init_room();
		this.ball.sx /= 3;
		this.ball.sy /= 3;
		this.ball.speed /= 3;
		this.ball.start_x = this.ball.x;
		this.ball.start_y = this.ball.y;
		this.level.interf.tview.niv = this.level.pos_x + 1;
	}

	gameOver(cause) {
		if (cause !== Const.CAUSE_WINS && !this.can_loose) return;
		if (!this.game_over_flag) {
			this.game_over_flag = true;
			MB2.Manager.gameOver(cause);
		}
	}

	is_door_opened(p) {
		return p.ptype === -1 || p.ptype === -2 || (p.ptype === 3 && MB2.Manager.play_mode !== Const.MODE_CHALLENGE) || p.ptype === 2;
	}

	main() {
		const M = MB2.Manager;
		const tmod = Std.tmod;
		if (this.game_over_flag) return;
		if (this.scroll_on) {
			this.level.interf.scroll_room();
			return;
		}
		if (this.pause != null) {
			this.pause.main();
			return;
		}
		if (M.play_mode === Const.MODE_COURSE) {
			if (this.curtime < 0) this.curtime = 0;
			this.curtime += Std.deltaT;
		} else {
			this.curtime -= tmod * 1000 / 40;
			if (this.curtime < 0) {
				this.curtime = 0;
				if (!this.ball.hole_death) this.gameOver(Const.CAUSE_NOTIME);
			} else if (M.play_mode === Const.MODE_CLASSIC && this.curtime > 100000)
				this.curtime = 100000;
		}
		this.level.interf.update();
		this.ball.update_jump();

		// UPDATES
		for (let i = 0; i < this.level.updates.length; i++) {
			const u = this.level.updates[i];
			u.on_update(this, u);
		}
		if (this.game_over_flag) return;

		if (this.ball.update_hole()) {
			if (this.boss_update) this.boss_update.on_update(this, this.boss_update);
			return;
		}

		if (Key.isDown(Key.SPACE) && M.play_mode !== Const.MODE_CLASSIC) {
			if (!this.space_key_flag) {
				this.space_key_flag = true;
				do {
					this.ball.btype++;
					this.ball.btype %= 7;
				} while (!this.options.ball_types[this.ball.btype]);
				this.options.update_icons();
				this.ball.update_skin();
				Sound.play(Sound.BALL_CHANGE);
			}
		} else
			this.space_key_flag = false;

		if (Key.isDown(Key.ESCAPE)) {
			if (!this.pause_key_flag) {
				this.pause_key_flag = true;
				this.setPause();
				return;
			}
		} else
			this.pause_key_flag = false;

		this.ball.update();
		if (this.boss_update) this.boss_update.on_update(this, this.boss_update);

		// GET BONUS
		for (let i = 0; i < this.level.bonus.length; i++) {
			const b = this.level.bonus[i];
			if (b && Tools.dist2(b.clip, this.ball.mc) < 300 && b.on_hit(this, b)) {
				b.old_btype = b.btype;
				b.btype = 0;
				this.level.bonus[i] = null;
			}
		}

		const room = this.level.dungeon[this.level.pos_x][this.level.pos_y];
		const is_classic = (M.play_mode === Const.MODE_CLASSIC);
		const paths = room.paths || [{ ptype: 1 }, { ptype: 1 }, { ptype: 1 }, { ptype: 1 }];
		const ball = this.ball;
		if (ball.x < 0) {
			if (is_classic || this.is_door_opened(paths[0])) this.level.change_room(-1, 0);
			else ball.x = 5;
		} else if (ball.x > Const.LVL_WIDTH) {
			if (is_classic || this.is_door_opened(paths[1])) this.level.change_room(1, 0);
			else ball.x = Const.LVL_WIDTH - 5;
		} else if (ball.y < 0) {
			if (is_classic || this.is_door_opened(paths[2])) this.level.change_room(0, -1);
			else ball.y = 5;
		} else if (ball.y > Const.LVL_HEIGHT) {
			if (is_classic || this.is_door_opened(paths[3])) this.level.change_room(0, 1);
			else ball.y = Const.LVL_HEIGHT - 5;
		}
	}

	setPause(radar) {
		this.pause = new MB2.Pause(this);
		if (this.boss_update && this.boss_update.onPause) this.boss_update.onPause(true);
	}

	// animations run with the game (but not during the pause)
	tick() {
		if (this.pause == null) this.dmanager.tick();
		MB2.frameCount = (MB2.frameCount || 0) + 1;
	}

	draw(ctx) {
		this.dmanager.draw(ctx);
		if (this.pause) this.pause.draw(ctx);
	}

	destroy() {
		if (this.pause) this.pause.destroy();
		this.dmanager.destroy();
	}
};

})();
