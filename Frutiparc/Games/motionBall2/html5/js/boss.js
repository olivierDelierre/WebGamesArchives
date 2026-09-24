// MotionBall 2 - HTML5 port : bosses
// Port of mb2/Boss.as (challenge octopus), BossSerpent.as (adventure 1-4),
// BossTB.as (adventure 5) and the BossPow*.as elemental powers.
"use strict";

(function () {

const Const = MB2.Const, Tools = MB2.Tools, Std = MB2.Std, Sound = MB2.Sound;

// additive red colour transform (Flash Color.setTransform with rb > 0)
function redTint(amount) {
	if (amount <= 0) return null;
	return { r: 255, g: 40, b: 40, k: Math.min(0.85, amount / 255) };
}

// ===========================================================================
// Boss : the octopus of the challenge mode
MB2.Boss = class {
	constructor(game) {
		this.game = game;
		this.mc = game.dmanager.attach("boss", Const.BOSS_PLAN);
		this.mc.alpha = 0;
		this.mc.control = this;
		this.shade = game.dmanager.attach("boss shade", Const.SHADE_PLAN);
		this.shade.alpha = 0;
		this.px = Const.LVL_WIDTH / 2;
		this.py = Const.LVL_HEIGHT / 2;
		this.hits = 0;
		this.pat_jmp = false;
		this.wait = 5;
		this.change_pattern = true;
		this.jump_pos = 0;
		this.njumps = 0;
		this.ang_speed = 0;
		this.aspire_time = 0;
		this.hit_time = 0;
		this.ang = 0;
		this.particules = [];
		this.on_update();
		game.ball.max_speed_enabled = false;
		this.mc.gotoAndStop("dodo");
		this.dodo = true;
		this.mc.dodo = true;
		Sound.play(Sound.POULPE);
	}

	casse() {
		const wt = this.game.level.interf.walltable;
		let px = random(2) === 0 ? 0 : 13;
		let py = 8;
		const b = wt[px][py];
		let n = 0;
		while (wt[px][py] != null && n++ < 10000) {
			switch (random(4)) {
			case 0: if (px > 0) px--; break;
			case 1: if (py > 0) py--; break;
			case 2: if (px < 13) px++; break;
			case 3: if (py < 8) py++; break;
			}
		}
		wt[px][py] = b;
		this.game.level.interf.update_walls();
		const dmc = this.game.dmanager.attach("dalle", Const.BONUS_PLAN);
		dmc.x = px * 10 * Const.DELTA + Const.BORDER_SIZE;
		dmc.y = py * 10 * Const.DELTA + Const.BORDER_SIZE;
	}

	death() {
		const game = this.game;
		Sound.play(Sound.POULPE);
		this.mc.gotoAndPlay("death");
		for (let j = 0; j < 3; j++)
			for (let i = 0; i < 8; i++) {
				const p = game.dmanager.attach("bossParticule", Const.BOSS_PLAN);
				p.x = this.mc.x;
				p.y = this.mc.y;
				p.ang = (i / 8) * Math.PI * 2 + j * 0.5;
				p.dist = 0;
				p.speed = (j + 1) * 2.5;
				p.scale = 200 + j * 50;
				this.particules.push(p);
			}
		game.ball.sx = 0;
		game.ball.sy = 0;
		game.ball.speed = 0;
		game.ball.control = false;
		game.can_loose = false;
		this.shade.visible = false;
		this.wait = 0xFFFFF;
	}

	move_particules() {
		if (this.particules.length === 0) return;
		for (let i = 0; i < this.particules.length; i++) {
			const p = this.particules[i];
			p.ang += Std.tmod * 0.1 * p.speed / 5;
			p.dist += Std.tmod * p.speed;
			p.x = this.mc.x + Math.cos(p.ang) * p.dist;
			p.y = this.mc.y + Math.sin(p.ang) * p.dist;
			p.scale -= Std.tmod * 5;
			p.xscale = p.scale;
			p.yscale = p.scale;
			const w = 20 * p.scale / 100;
			if (p.x < -w || p.y < -w || p.x > Const.LVL_WIDTH + w || p.y > Const.LVL_HEIGHT + w || p.scale <= 0) {
				p.removeMovieClip();
				this.particules.splice(i, 1);
				i--;
			}
		}
		if (this.particules.length === 0) {
			this.game.boss_update = null;
			this.game.gameOver(Const.CAUSE_WINS);
		}
	}

	setColor(rb) { this.mc.tint = redTint(rb); }

	on_update() {
		const tmod = Std.tmod;
		const game = this.game;
		const mc = this.mc;
		this.move_particules();
		this.move_eye();

		if (mc.alpha < 100) {
			mc.alpha += 10 * tmod;
			this.shade.alpha += 10 * tmod;
			if (mc.alpha >= 100) {
				mc.alpha = 100;
				this.shade.alpha = 100;
			}
		}

		if (this.wait > 0) {
			this.wait -= tmod / 25;
			mc.x = this.px;
			mc.y = this.py;
			this.shade.x = this.px;
			this.shade.y = this.py;
			if (this.collide) this.do_collide();
			if (this.dodo && this.wait <= 3) {
				this.dodo = false;
				mc.dodo = false;
				mc.gotoAndStop("normal");
				mc.oeil.gotoAndPlay("close");
			}
			if (this.wait <= 0) {
				mc.gotoAndPlay(this.next_frame);
				this.wait = 0;
			}
			return;
		}

		if (this.hit_time > 0) {
			this.hit_time -= tmod / 25;
			if (this.hit_time <= 0) {
				this.setColor(40 * this.hits);
				if (this.hits >= 4) {
					this.death();
					return;
				}
			} else
				this.setColor(60 * this.hits + this.hit_time * 100);
			return;
		}
		if (this.change_pattern) {
			this.change_pattern = false;
			this.do_change_pattern();
			return;
		}
		if (this.njumps > 0) {
			this.jump_time += Std.deltaT;
			this.jump_pos = this.jump_size * Math.sin(this.jump_time * this.jump_speed / this.jump_size);
			if (this.jump_pos < 10) this.do_collide();
			if (this.jump_pos < 0) {
				this.jump_pos = 0;
				this.jump_time = 0;
				this.njumps--;
				while (this.jump_casse-- > 0) {
					Sound.play(Sound.CASSE);
					this.casse();
				}
				if (this.njumps === 0) {
					this.do_change_pattern();
					return;
				} else
					Sound.play(Sound.BOSS_JUMP);
			}
		}
		if (this.ang_speed !== 0) {
			const bang = Math.atan2(game.ball.y - this.py, game.ball.x - this.px);
			const adif = Tools.rad_dif(this.ang, bang);
			if (Math.abs(adif) > this.ang_speed) {
				if (adif < 0) this.ang -= this.ang_speed * tmod;
				else this.ang += this.ang_speed * tmod;
			} else
				this.ang = bang + (random(3) - 1) / 100;
			this.px += Math.cos(this.ang) * this.speed * tmod;
			this.py += Math.sin(this.ang) * this.speed * tmod;
			mc.x = this.px;
			mc.y = this.py - this.jump_pos;
			mc.jump = this.jump_pos;
			this.shade.x = this.px;
			this.shade.y = this.py;
			this.shade.xscale = 100 + this.jump_pos / 3;
			this.shade.yscale = 100 + this.jump_pos / 3;
			let whit = false;
			if (this.px < Const.BOSS_MIN_X) { this.px = Const.BOSS_MIN_X; whit = true; }
			if (this.py < Const.BOSS_MIN_Y) { this.py = Const.BOSS_MIN_Y; whit = true; }
			if (this.px > Const.LVL_WIDTH - Const.BOSS_MIN_X) { this.px = Const.LVL_WIDTH - Const.BOSS_MIN_X; whit = true; }
			if (this.py > Const.LVL_HEIGHT - Const.BOSS_MAX_Y) { this.py = Const.LVL_HEIGHT - Const.BOSS_MAX_Y; whit = true; }
			if (whit) this.ang += Math.PI * 3 / 4 + random(45) * Math.PI / 180;
		}
		if (!game.ball.hole_death && this.aspire_time > 0) {
			this.aspire_time -= tmod / 25;
			const d = Tools.dist2(game.ball.mc, mc);
			if (d < 500) {
				game.ball.control = false;
				game.ball.sx = 0;
				game.ball.sy = 0;
				game.ball.x = this.px;
				game.ball.y = this.py + 22;
				this.aspire_time = 0;
				mc.gotoAndPlay("eat");
				this.wait = 1;
				this.collide = false;
				this.next_frame = "throw";
				this.eat_done = true;
				return;
			}
			// pincers opening
			let c = Math.pow(0.6, tmod);
			mc.b.p1.rotation = mc.b.p1.rotation * c + 45 * (1 - c);
			mc.b.p2.rotation = mc.b.p2.rotation * c - 45 * (1 - c);
			// suction size
			c = Math.pow(0.95, tmod);
			const scale = mc.souffle.xscale * c + (100 + (this.hits * 20)) * (1 - c);
			mc.souffle.xscale = scale;
			mc.souffle.yscale = scale;
			const dx = (this.px - game.ball.mc.x) / d;
			const dy = (this.py - game.ball.mc.y) / d;
			game.ball.sx += dx * (120 + this.hits * 20) * tmod;
			game.ball.sy += dy * (120 + this.hits * 20) * tmod;
			if (this.aspire_time <= 0) {
				this.do_change_pattern();
				return;
			}
		} else if (this.eat_done) {
			const ang = (random(100) + 40) * Math.PI / 180;
			game.ball.sx = 60 * Math.cos(ang);
			game.ball.sy = 60 * Math.sin(ang);
			game.ball.control = true;
			this.eat_done = false;
			this.wait = 0.5;
			this.change_pattern = true;
			return;
		} else {
			// pincers closing
			const c = Math.pow(0.6, tmod);
			mc.b.p1.rotation *= c;
			mc.b.p2.rotation *= c;
			mc.souffle.xscale *= 0.8;
			mc.souffle.yscale *= 0.8;
		}

		if (this.do_tir) {
			if (this.tir == null) {
				Sound.play(Sound.BOSS_EYE);
				mc.gotoAndPlay("looseEye");
				const tir = this.tir = game.dmanager.attach("boss tir", Const.BOSS_PLAN);
				tir.px = this.px;
				tir.py = this.py - 10;
				tir.activated = false;
				tir.tint = redTint(40 * this.hits);
				const ang = Math.atan2(game.ball.mc.y - (this.py - 100), game.ball.mc.x - this.px);
				const m_speed = 5 + this.hits * 1.5;
				tir.sx = m_speed * Math.cos(ang);
				tir.sy = m_speed * Math.sin(ang);
			}
			const tir = this.tir;
			let d = Tools.dist2(game.ball.mc, tir);
			if (!game.ball.hole_death && d < 38 * 38) {
				Sound.play(Sound.WALL_HIT);
				d = Math.sqrt(d);
				tir.sx = (7 + this.hits * 1.5) * (tir.px - game.ball.mc.x) / d;
				tir.sy = (7 + this.hits * 1.5) * (tir.py - game.ball.mc.y) / d;
				if (game.ball.speed < 25) game.ball.speed = 25;
				game.ball.sx = game.ball.speed * (game.ball.mc.x - tir.px) / d;
				game.ball.sy = game.ball.speed * (game.ball.mc.y - tir.py) / d;
				tir.activated = true;
			}
			if (tir.activated && Tools.dist2(mc, tir) < 50 * 50) {
				tir.removeMovieClip();
				this.tir = null;
				this.hit_time = 1;
				Sound.play(Sound.BOSS_NEW_EYE);
				mc.gotoAndPlay("newEye");
				Sound.play(Sound.POULPE);
				this.hits++;
				this.do_tir = false;
				return;
			}
			tir.px += tir.sx * tmod;
			tir.py += tir.sy * tmod;
			tir.x = tir.px;
			tir.y = tir.py;
			if (tir.x < -30 || tir.y < -30 || tir.x > Const.LVL_WIDTH + 30 || tir.y > Const.LVL_HEIGHT + 30) {
				Sound.play(Sound.BOSS_NEW_EYE);
				mc.gotoAndPlay("newEye");
				tir.removeMovieClip();
				this.tir = null;
				this.do_tir = false;
				return;
			}
			this.do_collide();
		}
	}

	do_collide() {
		const game = this.game;
		const dist = (game.ball.x - this.px) * (game.ball.x - this.px) + (game.ball.y - this.py) * (game.ball.y - this.py) * 2;
		if (dist < 2000) {
			const ang = Math.atan2(game.ball.y - this.py, game.ball.x - this.px);
			game.ball.sx += 30 * Math.cos(ang);
			game.ball.sy += 30 * Math.sin(ang);
			Sound.play(Sound.WALL_HIT);
		}
	}

	do_change_pattern() {
		this.collide = true;
		this.pat_jmp = !this.pat_jmp;
		this.jump_pos = 0;
		this.mc.jump = 0;
		this.jump_casse = 0;
		this.jump_time = 0;
		this.njumps = 0;
		this.ang_speed = 0;
		this.do_tir = false;
		this.wait = 0;
		this.aspire_time = 0;
		this.hit_time = 0;
		const mc = this.mc;
		if (this.pat_jmp) {
			this.jump_speed = 300;
			this.njumps = 3 + this.hits * 2;
			Sound.play(Sound.BOSS_JUMP);
			if (this.hits === 3) {
				this.njumps *= 5;
				this.hits++;
			}
			this.jump_size = 75 - this.hits * 10;
			this.ang_speed = 0.1 + 0.02 * this.hits;
			this.speed = 2 + this.hits * 1.5;
			mc.gotoAndStop("normal");
		} else {
			if (this.hits >= 4) {
				this.hit_time = 1;
				return;
			}
			switch (random(8)) {
			case 0:
			case 1:
				this.jump_casse = 1 + random(3);
				this.jump_speed = 1500;
				this.jump_size = 300;
				this.njumps = 1;
				Sound.play(Sound.BOSS_JUMP);
				this.ang_speed = 0.1 + 0.02 * this.hits;
				this.speed = 10;
				mc.gotoAndStop("normal");
				break;
			case 4:
				this.wait = 0.5;
				this.change_pattern = true;
				Sound.play(Sound.POULPE);
				break;
			case 2:
			case 3:
				this.wait = 1 + random(100) / 100;
				this.next_frame = "aspire";
				this.aspire_time = 2 + 0.5 * this.hits;
				break;
			default:
				this.wait = 0.7 + random(50) / 50;
				this.next_frame = "tir";
				this.do_tir = true;
				this.tir = null;
				break;
			}
		}
	}

	move_eye() {
		const mc = this.mc;
		const game = this.game;
		const a = Math.atan2(game.ball.mc.y - mc.y, game.ball.mc.x - mc.x);
		const x = Math.cos(a) * 28;
		const y = Math.sin(a) * 7 + 8 * Math.abs(Math.sin(a));
		const c = 0.9;
		const p = mc.oeil.p;
		p.x = p.x * c + x * (1 - c);
		p.y = p.y * c + y * (1 - c);
		p.xscale = 100 - Math.abs(p.x);
		p.yscale = 100 - Math.abs(p.y) * 1.5;
		if (!mc.dodo && !random(40)) mc.oeil.play();
	}

	onPause() { }
};

// ===========================================================================
// BossSerpent
const STATE_PROBAS = [[1, 5, 2, 2, 5], [2, 0, 0, 10, 2]];
const EAU = 1, FEU = 2, VENT = 3, TERRE = 4;
const ST_WAIT = 0, ST_SEARCH = 1, ST_FONCE = 2, ST_EVADE = 3, ST_POWER = 4, ST_RECALL = 5;

function normalize(a) {
	a %= (Math.PI * 2);
	if (a <= -Math.PI) a += Math.PI * 2;
	else if (a > Math.PI) a -= Math.PI * 2;
	return a;
}

MB2.BossSerpent = class {
	constructor(game) {
		this.elt = MB2.Manager.play_mode_param + 1;
		const lbg = game.dmanager.attach("logoBg", Const.BG_PLAN);
		lbg.gotoAndStop(this.elt);
		this.lbg = lbg;
		this.game = game;
		this.powers = [];
		this.ecailles = [];
		this.power = 3;
		this.dying = false;
		this.excite = 0;
		this.target_speed = 0;
		this.berserk_time = 0;
		this.speed = 0;
		this.ang = 0;
		this.rot_ang = 0;
		this.timer = 0;
		this.x = Const.LVL_WIDTH / 2;
		this.y = Const.LVL_HEIGHT / 2;
		this.initSerpent();
		this.change_pattern();
		this.setExcite(false);
		for (let i = 0; i < 5; i++) this.on_update();
	}

	updateScales() {
		const parts = this.parts;
		for (let i = 1; i < parts.length - 1; i++) {
			const s = 1 - (i / parts.length);
			const p = parts[i];
			p.xscale = s * 100;
			p.yscale = s * 100;
			p.ray = s * 50;
			p.rsq = (p.ray + Const.BALL_RAYSIZE / 2) * (p.ray + Const.BALL_RAYSIZE / 2);
		}
	}

	initSerpent() {
		const NHITS = 3;
		this.parts = [];
		// the head is drawn over the rest : attach in reverse order
		const tmp = [];
		for (let i = 0; i < NHITS + 2; i++) {
			const p = new MB2.Clip("snake");
			p.elt = this.elt;
			if (i === 0) { p.gotoAndStop(1); p.ray = 20; }
			else if (i === NHITS + 1) { p.gotoAndStop(3); p.ray = 25; }
			else p.gotoAndStop(2);
			p.ang = this.ang;
			p.rsq = (p.ray + Const.BALL_RAYSIZE / 2) * (p.ray + Const.BALL_RAYSIZE / 2);
			p.pos = { x: this.x, y: this.y, a: this.ang };
			p.x = this.x; p.y = this.y;
			this.parts.push(p);
			tmp.push(p);
		}
		for (let i = tmp.length - 1; i >= 0; i--) this.game.dmanager.add(tmp[i], Const.BOSS_PLAN);
		this.updateScales();
		this.histo = [{ x: this.x, y: this.y, a: this.ang }];
	}

	toBall() { return Math.atan2(this.game.ball.y - this.y, this.game.ball.x - this.x); }

	recall() {
		this.hit = false;
		const d = 60;
		if (this.x < Const.BOSS_MIN_X + d) { this.x = Const.BOSS_MIN_X + d; this.hit = true; }
		if (this.y < Const.BOSS_MIN_Y + d) { this.y = Const.BOSS_MIN_Y + d; this.hit = true; }
		if (this.x > Const.LVL_WIDTH - Const.BOSS_MIN_X - d) { this.x = Const.LVL_WIDTH - Const.BOSS_MIN_X - d; this.hit = true; }
		if (this.y > Const.LVL_HEIGHT - Const.BOSS_MAX_Y - d) { this.y = Const.LVL_HEIGHT - Const.BOSS_MAX_Y - d; this.hit = true; }
		if (this.hit && this.state !== ST_RECALL) {
			this.delta = 0.3;
			if (random(2) === 0) this.delta *= -1;
			this.state = ST_RECALL;
			this.timer = 1;
		}
	}

	setExcite(b) {
		const p = this.parts[0];
		p.eyes = this.berserk_time > 0 ? 3 : (b ? 1 : 2);
	}

	updateEcailles() {
		for (let i = 0; i < this.ecailles.length; i++) {
			const e = this.ecailles[i];
			e.x += Math.cos(e.ang) * Std.tmod * 10;
			e.y += Math.sin(e.ang) * Std.tmod * 10;
			e.rotation += 5 * Std.tmod;
			e.xscale -= 15 * Std.tmod;
			e.yscale -= 15 * Std.tmod;
			if (e.xscale < 10) {
				this.ecailles.splice(i, 1);
				e.removeMovieClip();
				i--;
			}
		}
	}

	on_update() {
		const tmod = Std.tmod;
		const game = this.game;
		if (this.berserk_time === 0 && this.excite > 0) {
			this.excite -= Std.deltaT;
			if (this.excite <= 0) {
				this.excite = 0;
				this.setExcite(false);
				this.change_pattern();
			}
		}
		if (this.berserk_time > 0 && !game.ball.hole_death) {
			this.berserk_time -= Std.deltaT;
			if (this.berserk_time <= 0) {
				for (const p of this.powers.slice()) p.destroy();
				this.dying = true;
			}
		}
		for (let i = 0; i < this.powers.length; i++) {
			const p = this.powers[i];
			p.update();
			if (this.powers[i] !== p) i--;
		}
		this.updateEcailles();

		if (this.dying) {
			let cont = false;
			for (const p of this.parts) {
				p.rotation += 30 * Std.tmod;
				if (p.xscale > 0) {
					p.xscale -= Std.deltaT * 100;
					p.yscale -= Std.deltaT * 100;
					cont = cont || (p.xscale > 0);
				}
			}
			if (!cont) {
				for (const p of this.parts) p.removeMovieClip();
				game.boss_update = null;
				game.gameOver(Const.CAUSE_WINS);
			}
			return;
		}

		this.timer -= Std.deltaT;
		if (this.timer <= 0) this.change_pattern();

		if (this.speed > this.target_speed) {
			this.speed *= Math.pow(0.97, tmod);
			if (this.speed < this.target_speed) this.speed = this.target_speed;
		} else if (this.speed < this.target_speed) {
			if (this.speed <= 1) this.speed = 1;
			this.speed *= Math.pow(this.accel, tmod);
			if (this.speed > this.target_speed) this.speed = this.target_speed;
		}

		switch (this.state) {
		case ST_SEARCH: {
			const ca = normalize(this.toBall() - this.ang);
			const da = Math.asin(Math.max(-1, Math.min(1, ca)));
			if (da > 0) this.ang += this.delta * tmod;
			else this.ang -= this.delta * tmod;
			break;
		}
		case ST_EVADE: {
			const ca = normalize(this.toBall() + Math.PI - this.ang);
			const da = Math.asin(Math.max(-1, Math.min(1, ca)));
			if (da > 0) this.ang += this.delta * tmod;
			else this.ang -= this.delta * tmod;
			break;
		}
		case ST_RECALL:
			this.delta *= Math.pow(0.97, tmod);
			if (Math.abs(this.delta) < 0.1) this.delta = this.delta < 0 ? -0.1 : 0.1;
			this.ang += this.delta * tmod;
			if (!this.hit) this.change_pattern();
			break;
		}

		let ds = this.speed * Std.tmod;
		this.ang = normalize(this.ang);
		if (ds <= 0) {
			this.collide();
			this.histo.push({ x: this.x, y: this.y, a: this.ang });
		}
		while (ds > 0) {
			const s = Math.min(ds, 1);
			ds -= 1;
			this.x += Math.cos(this.ang) * s;
			this.y += Math.sin(this.ang) * s;
			this.recall();
			this.histo.push({ x: this.x, y: this.y, a: this.ang });
			this.collide();
		}
		if (this.histo.length > 2000) this.histo.splice(0, this.histo.length - 1000);

		let p = this.histo.length - 1 + this.parts[0].ray;
		for (const mc of this.parts) {
			p -= mc.ray;
			mc.pos = this.histo[Math.max(p, 0) | 0];
			const dif = normalize(mc.pos.a - mc.ang);
			mc.ang += dif * ((this.excite > 0) ? 0.4 : 0.3) * tmod;
			mc.rotation = mc.ang * 180 / Math.PI + 180;
			mc.x = mc.pos.x;
			mc.y = mc.pos.y;
			p -= mc.ray;
		}
	}

	collideBall(n) {
		const game = this.game;
		const p = this.parts[n];
		let dx = p.pos.x - game.ball.x;
		let dy = p.pos.y - game.ball.y;
		const d = Math.sqrt(dx * dx + dy * dy);
		if (d !== 0) { dx /= d; dy /= d; }
		game.ball.sx -= this.power * dx;
		game.ball.sy -= this.power * dy;
		Sound.play(Sound.SERPENT_COLLIDE);
	}

	explode() {
		if (this.parts.length <= 2) return;
		const p = this.parts[1];
		Sound.play(Sound.SERPENT_HIT);
		for (let i = 0; i < 5; i++) {
			const e = this.game.dmanager.attach("snakePart", Const.BOSS_PLAN);
			const ray = random(p.ray / 2) + p.ray / 2;
			e.gotoAndStop(this.elt);
			e.rotation = random(360);
			e.ang = i * Math.PI / 2.5;
			e.x = p.x + Math.cos(e.ang) * ray;
			e.y = p.y + Math.sin(e.ang) * ray;
			e.xscale = 300;
			e.yscale = 300;
			this.ecailles.push(e);
		}
		MB2.removeFrom(this.parts, p);
		this.updateScales();
		p.removeMovieClip();
		this.excite = 1;
		if (this.parts.length === 2) {
			this.berserk_time = 10;
			this.setExcite(true);
		}
		this.change_pattern(ST_FONCE);
	}

	// hitTest on the head / tail symbols
	hitPart(p, bx, by, rx, ry, ox) {
		const a = p.rotation * Math.PI / 180;
		const dx = bx - p.x, dy = by - p.y;
		const lx = (dx * Math.cos(a) + dy * Math.sin(a)) / (p.xscale / 100) - ox;
		const ly = (-dx * Math.sin(a) + dy * Math.cos(a)) / (p.yscale / 100);
		return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) < 1;
	}

	collide() {
		const game = this.game;
		if (game.ball.hole_death) return false;
		const bx = game.ball.x, by = game.ball.y;
		let p = this.parts[0];
		if (this.hitPart(p, bx, by, 42, 34, 0)) {
			if (Math.abs(normalize(this.ang - this.toBall())) < 0.3) {
				p.snap = 10;
				this.setExcite(true);
				if (this.excite === 0) this.explode();
				this.excite = 6 + random(4);
			}
			this.collideBall(0);
			return true;
		}
		p = this.parts[this.parts.length - 1];
		if (this.hitPart(p, bx, by, 40, 14, 12) && game.ball.clign_count <= 0) {
			Sound.play(Sound.BUMPER_DEATH);
			game.ball.die();
			return true;
		}
		for (let i = 1; i < this.parts.length; i++) {
			p = this.parts[i];
			const dx = bx - p.pos.x, dy = by - p.pos.y;
			if (dx * dx + dy * dy < p.rsq) {
				this.collideBall(i);
				return true;
			}
		}
		return false;
	}

	change_pattern(s) {
		const is_excite = (this.excite > 0) || (this.berserk_time > 0);
		if (s !== undefined) this.state = s;
		else this.state = Std.randomProbas(STATE_PROBAS[is_excite ? 0 : 1]);
		this.accel = 1.05;
		this.delta = is_excite ? 0.05 : 0.03;
		const game = this.game;
		switch (this.state) {
		case ST_WAIT:
			this.timer = 0.5;
			this.target_speed = 0;
			break;
		case ST_SEARCH:
			this.timer = 1 + random(100) / 100;
			this.target_speed = 5;
			break;
		case ST_FONCE:
			this.accel = 1.15;
			this.timer = 0.5;
			this.ang = this.toBall();
			this.target_speed = 15;
			break;
		case ST_EVADE:
			this.accel = 1.1;
			this.timer = 1 + random(100) / 100;
			this.target_speed = is_excite ? 8 : 4;
			break;
		case ST_POWER:
			switch (this.elt) {
			case VENT:
				if (this.powers.length < 1) { Sound.play(Sound.POWER_WIND); this.powers.push(new MB2.BossPowVent(game, this)); }
				break;
			case FEU:
				if (this.powers.length < 3) { Sound.play(Sound.POWER_FIRE); this.powers.push(new MB2.BossPowFeu(game, this)); }
				break;
			case EAU:
				if (this.powers.length < 2) { Sound.play(Sound.POWER_WATER); this.powers.push(new MB2.BossPowEau(game, this)); }
				break;
			case TERRE:
				if (this.powers.length < 3) { Sound.play(Sound.POWER_EARTH); this.powers.push(new MB2.BossPowTerre(game, this)); }
				break;
			}
			this.change_pattern();
			break;
		}
		if (this.berserk_time > 0) {
			this.timer /= 2;
			this.target_speed *= 1.3;
			this.delta *= 2;
		}
	}

	onPause() { }
};

// ===========================================================================
// Powers
MB2.BossPowEau = class {
	constructor(g, b) {
		this.game = g;
		this.boss = b;
		this.active = false;
		this.mc = g.dmanager.attach("FXWater", Const.DUMMY_PLAN);
		this.x = b.x;
		this.y = b.y;
		this.parts = [];
		this.ang = b.toBall();
		this.speed = 1;
		this.gliss_time = 0;
		this.da = b.tb ? 0.01 : 0;
		this.acc = b.tb ? 1.03 : 1;
		this.started = false;
	}
	genParts() {
		const ddx = [-1, -2, 1, 2];
		for (let i = 0; i < 4; i++) {
			const p = this.game.dmanager.attach("FXWaterParticule", Const.DUMMY_PLAN);
			p.dx = ddx[i];
			p.dy = -(3 + random(2));
			p.x = this.x;
			p.y = this.y;
			p.gotoAndStop(1 + random(3));
			this.parts.push(p);
		}
	}
	updateParts() {
		for (let i = 0; i < this.parts.length; i++) {
			const p = this.parts[i];
			p.x += p.dx * Std.tmod;
			p.y += p.dy * Std.tmod;
			p.dy += 0.4 * Std.tmod;
			p.xscale -= 200 * Std.deltaT;
			p.yscale -= 200 * Std.deltaT;
			if (p.xscale < 5) {
				this.parts.splice(i--, 1);
				p.removeMovieClip();
			}
		}
	}
	updateTrainee() {
		if (!this.active) return;
		const game = this.game;
		if (game.ball.hole_death) { this.gliss_time = 0; return; }
		const t = game.dmanager.attach("FXWaterQueue", Const.BONUS_PLAN);
		t.x = game.ball.x + 2;
		t.y = game.ball.y + 2;
		t.rotation = (Math.atan2(game.ball.sy, game.ball.sx) + Math.PI) * 180 / Math.PI;
		t.xscale = game.ball.speed * 3;
		t.alpha = Math.min(this.gliss_time, 1) * 100;
	}
	update() {
		this.updateParts();
		this.updateTrainee();
		const game = this.game;
		if (this.active) {
			this.gliss_time -= Std.deltaT;
			game.ball.water = true;
			if (this.gliss_time < 0 && this.parts.length === 0) {
				this.active = false;
				game.ball.water = false;
				MB2.removeFrom(this.boss.powers, this);
			}
			return;
		}
		this.ang += this.da * Std.tmod;
		this.speed *= Math.pow(this.acc, Std.tmod);
		this.x += Math.cos(this.ang) * Std.tmod * this.speed;
		this.y += Math.sin(this.ang) * Std.tmod * this.speed;
		if (this.x < -50 || this.y < -50 || this.x > Const.LVL_WIDTH + 50 || this.y > Const.LVL_HEIGHT + 50) {
			this.mc.removeMovieClip();
			MB2.removeFrom(this.boss.powers, this);
			return;
		}
		this.mc.x = this.x;
		this.mc.y = this.y;
		const d = Math.sqrt(Tools.dist2(game.ball.mc, this.mc));
		if (d < 25) this.explode();
	}
	explode() {
		this.mc.removeMovieClip();
		this.gliss_time = 10 + random(5);
		this.genParts();
		this.active = true;
		this.update();
	}
	destroy() {
		if (!this.active) this.explode();
		this.gliss_time = 0;
		this.update();
	}
};

MB2.BossPowFeu = class {
	constructor(g, b) {
		this.game = g;
		this.boss = b;
		this.mc = g.dmanager.attach("FXFire", Const.DUMMY_PLAN);
		this.mc.flLoopv = true;
		this.mc.x = b.x;
		this.mc.y = b.y;
		this.time = 10 + random(10);
	}
	update() {
		const game = this.game;
		this.time -= Std.deltaT;
		if (this.time < 0) {
			this.mc.flLoopv = false;
			MB2.removeFrom(this.boss.powers, this);
		}
		if (game.ball.hole_death || game.ball.clign_count > 0 || this.mc.frame < 16 || !this.mc.flLoopv) return;
		const dx = this.mc.x - game.ball.mc.x;
		const dy = this.mc.y - game.ball.mc.y;
		const d = Math.sqrt(dx * dx + (dy * dy) / 3);
		if (d < 15) {
			this.time = 0;
			game.ball.kill();
		}
	}
	destroy() { this.time = 0; }
};

MB2.BossPowTerre = class {
	constructor(g, b) {
		this.game = g;
		this.boss = b;
		this.tied = false;
		this.casse = false;
		this.mc = g.dmanager.attach("FXbourgeon", Const.BONUS_PLAN);
		let px = (b.x / Const.DELTA) - Const.BORDER_CSIZE;
		let py = (b.y / Const.DELTA) - Const.BORDER_CSIZE;
		px -= px % 10;
		py -= py % 10;
		this.mc.x = px * Const.DELTA + Const.BORDER_SIZE + 20;
		this.mc.y = py * Const.DELTA + Const.BORDER_SIZE + 20;
		this.time = 10 + random(10);
		this.moveList = [];
	}
	initLiane() {
		const game = this.game;
		let prev = null;
		this.mc.gotoAndPlay("explode");
		for (let i = 0; i < 10; i++) {
			const m = game.dmanager.attach("FXLiane", Const.BONUS_PLAN);
			m.x = this.mc.x;
			m.y = this.mc.y;
			m.sx = 0;
			m.sy = 0;
			m.link = prev;
			if (i === 0) m.flFixe = true;
			prev = m;
			this.moveList.push(m);
		}
		game.ball.link = prev;
		this.moveList.push(game.ball);
	}
	updateLiane() {
		const game = this.game;
		if (this.casse) {
			for (let i = 0; i < this.moveList.length - 1; i++) {
				const m = this.moveList[i];
				m.alpha -= 10 * Std.tmod;
				if (m.alpha <= 0) {
					this.moveList.splice(i--, 1);
					m.removeMovieClip();
				}
			}
			if (this.moveList.length <= 1) {
				game.ball.link = null;
				this.moveList = [];
				this.casse = false;
				this.tied = false;
				this.time = 0;
			}
			return;
		}
		const ropeBasicLength = 5;
		for (const m of this.moveList) {
			if (m.link != null) {
				let dx = m.link.x - m.x;
				let dy = m.link.y - m.y;
				const d = Math.sqrt(dx * dx + dy * dy);
				if (d > ropeBasicLength) {
					const c = (d / ropeBasicLength) - 1;
					dx *= c * 0.01;
					dy *= c * 0.01;
					m.sx += dx;
					m.sy += dy;
					m.link.sx -= dx;
					m.link.sy -= dy;
				}
			}
			if (m === game.ball) continue;
			m.sx *= Math.pow(0.95, Std.tmod);
			m.sy *= Math.pow(0.95, Std.tmod);
			if (!m.flFixe) {
				m.x += m.sx * Std.tmod;
				m.y += m.sy * Std.tmod;
			}
		}
		for (let i = 0; i < this.moveList.length - 1; i++) {
			const m1 = this.moveList[i];
			const m2 = this.moveList[i + 1];
			const dy = m2.y - m1.y, dx = m2.x - m1.x;
			m1.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
			m1.len = Math.sqrt(dx * dx + dy * dy);
		}
		const dx = this.mc.x - game.ball.x;
		const dy = this.mc.y - game.ball.y;
		const d = Math.sqrt(dx * dx + dy * dy);
		if (d > 225 || game.ball.hole_death) this.casse = true;
	}
	update() {
		this.time -= Std.deltaT;
		if (this.tied) this.updateLiane();
		else {
			if (this.time < 0) {
				this.mc.gotoAndPlay("death");
				MB2.removeFrom(this.boss.powers, this);
				return;
			}
			const d = Math.sqrt(Tools.dist2(this.mc, this.game.ball.mc));
			if (d < 30) {
				this.casse = false;
				this.tied = true;
				this.initLiane();
				this.updateLiane();
			}
		}
	}
	destroy() {
		this.time = 0;
		this.casse = true;
	}
};

MB2.BossPowVent = class {
	constructor(g, b) {
		this.game = g;
		this.boss = b;
		this.ray = 0;
		this.ang = 0;
		this.hit = 0;
		this.x = b.x;
		this.y = b.y;
		this.parts = [];
		const nparts = 5;
		for (let i = 0; i < nparts; i++) {
			const p = g.dmanager.attach("FXWind", Const.BOSS_PLAN);
			p.ang = Math.PI * 2 * i / nparts;
			p.time = 2;
			p.ox = this.x;
			p.oy = this.y;
			this.parts.push(p);
		}
	}
	update() {
		const game = this.game;
		this.ray += 5 * Std.tmod;
		this.ang += Std.tmod / 12;
		for (let i = 0; i < this.parts.length; i++) {
			const p = this.parts[i];
			p.time -= Std.deltaT;
			if (p.time < 0) {
				p.removeMovieClip();
				this.parts.splice(i--, 1);
			} else {
				const s = Math.min(Math.max(this.ray, 0), 100);
				p.xscale = s;
				p.yscale = s;
				const a = p.ang + this.ang;
				const px = Math.cos(a) * this.ray + this.x;
				const py = Math.sin(a) * this.ray + this.y;
				p.x = px;
				p.y = py;
				p.rotation = Math.atan2(py - p.oy, px - p.ox) * 180 / Math.PI;
				p.ox = px;
				p.oy = py;
			}
		}
		if (this.hit === 0) {
			let dx = this.x - game.ball.x;
			let dy = this.y - game.ball.y;
			let d = Math.sqrt(dx * dx + dy * dy);
			if (d < 10) d = 10;
			if (d < this.ray) {
				dx /= d;
				dy /= d;
				const pow = (this.boss.tb ? 30 : 10) / Math.sqrt(d);
				game.ball.sx -= dx * pow;
				game.ball.sy -= dy * pow;
			}
		} else {
			this.hit -= Std.deltaT;
			if (this.hit <= 0) this.hit = 0;
		}
		if (this.parts.length === 0) MB2.removeFrom(this.boss.powers, this);
	}
	destroy() { }
};

// ===========================================================================
// BossTB : "Tourneboule", final boss of the 5th adventure dungeon.
// Its behaviour was driven by the timeline of the "tourneboule" symbol
// (animDone / kataDone callbacks) : the symbol in gfx2.js reproduces them.
const NHITS = 4;
const TB_APPEAR = 0, TB_FLYING = 1, TB_MOVING = 2, TB_DROPING = 3, TB_WAITING = 4, TB_KATA = 5, TB_COMEBACK = 6, TB_DEATH = 7;

MB2.BossTB = class {
	constructor(game) {
		this.game = game;
		this.powers = [];
		this.dalles = [];
		this.x = Const.LVL_WIDTH / 2;
		this.y = Const.LVL_HEIGHT / 2;
		this.initTB();
		this.on_update();
	}

	initTB() {
		const game = this.game;
		this.tb = true;
		this.mc = game.dmanager.attach("tourneboule", Const.BOSS_PLAN);
		this.bulle = game.dmanager.attach("forceBubble", Const.BOSS_PLAN);
		this.shade = game.dmanager.attach("TBShadow", Const.SHADE_PLAN);
		this.shade.gotoAndPlay("stopFly");
		this.mc.gotoAndPlay("stopFly");
		this.hit_time = 0;
		this.state = TB_APPEAR;
		this.speed = 0;
		this.ncasses = 0;
		this.nblocks = 0;
		this.hits = 0;
		this.target_speed = 0;
		this.timer = 0;
		this.bulle.visible = false;
		this.bulle.alpha = 0;
		this.mc.animDone = () => this.animDone();
		this.mc.kataDone = () => this.kataDone();
	}

	fly() {
		this.mc.gotoAndPlay("startFly");
		this.shade.gotoAndPlay("startFly");
		this.state = TB_FLYING;
		this.fly_loops = Math.round(3 / Std.tmod);
	}

	move() {
		Sound.play(Sound.TB_HIDE);
		const fx = this.game.dmanager.attach("TBVanish", Const.BOSS_PLAN);
		fx.x = this.mc.x;
		fx.y = this.mc.y;
		this.mc.gotoAndPlay("flyVanish");
		this.shade.gotoAndPlay("flyVanish");
		this.state = TB_MOVING;
		this.accel = 1.05;
		this.target_speed = 10 + random(3);
		while (true) {
			this.tx = 50 + random(Const.LVL_WIDTH - 100);
			this.ty = 50 + random(Const.LVL_HEIGHT - 100);
			const dx = this.x - this.tx, dy = this.y - this.ty;
			if (Math.sqrt(dx * dx + dy * dy) > 200) break;
		}
	}

	moveDone() {
		const fx = this.game.dmanager.attach("TBSpawn", Const.BOSS_PLAN);
		this.mc.stop();
		fx.x = this.mc.x;
		fx.y = this.mc.y;
		fx.animDone = () => this.animDone();
		this.state = TB_COMEBACK;
	}

	visibleDone() {
		Sound.play(Sound.TB_HIDE);
		this.mc.gotoAndPlay("stopFly");
		this.shade.gotoAndPlay("stopFly");
		this.speed = 0;
		this.target_speed = 0;
		this.state = TB_DROPING;
		this.mc.alpha = 100;
		this.shade.alpha = 100;
		this.mc.visible = true;
		this.shade.visible = true;
	}

	wait() {
		this.bulle_active = true;
		this.mc.gotoAndStop(1);
		this.shade.gotoAndStop(1);
		this.state = TB_WAITING;
		this.timer = [0.5, 0.2, 0.1][this.hits] || 0;
	}

	randomFreeCell() {
		const wt = this.game.level.interf.walltable;
		let px, py;
		for (let n = 0; n < 1000; n++) {
			px = random(14);
			py = random(9);
			if ((px === 0 && py === 0) || (px === 13 && py === 0) || (px === 6 && py === 4) || (px === 7 && py === 4) || (px === 6 && py === 5) || (px === 7 && py === 5))
				continue;
			if (wt[px][py] == null) return { x: px, y: py };
		}
		return null;
	}

	kataDone() {
		if (this.nkatas !== 0) return;
		const game = this.game;
		switch (this.target_power) {
		case 0: {
			Sound.play(Sound.POWER_WIND);
			this.powers.push(new MB2.BossPowVent(game, this));
			const p = new MB2.BossPowVent(game, this);
			p.ray = -50;
			this.powers.push(p);
			break;
		}
		case 1: {
			const delta = 80;
			Sound.play(Sound.POWER_FIRE);
			const add = (dx, dy) => {
				const p = new MB2.BossPowFeu(game, this);
				p.mc.x += dx;
				p.mc.y += dy;
				p.mc.gotoAndPlay(1 + random(5));
				this.powers.push(p);
			};
			if (this.x > delta) add(-50, 0);
			if (this.x < Const.LVL_WIDTH - delta) add(50, 0);
			if (this.y > delta) add(0, -50);
			if (this.y < Const.LVL_HEIGHT - delta) add(0, 50);
			break;
		}
		case 2: {
			Sound.play(Sound.POWER_WATER);
			for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4]) {
				const p = new MB2.BossPowEau(game, this);
				p.ang = a;
				this.powers.push(p);
			}
			break;
		}
		case 3:
			Sound.play(Sound.POWER_EARTH);
			this.powers.push(new MB2.BossPowTerre(game, this));
			break;
		case 4: {
			const n = random(3) + 1;
			this.ncasses += n;
			for (let i = 0; i < n; i++) {
				const c = this.randomFreeCell();
				if (!c) break;
				game.level.interf.walltable[c.x][c.y] = { btype: -1 };
				const dmc = game.dmanager.attach("FXDalleCut", Const.BONUS_PLAN);
				dmc.x = c.x * 10 * Const.DELTA + Const.BORDER_SIZE;
				dmc.y = c.y * 10 * Const.DELTA + Const.BORDER_SIZE;
				this.dalles.push({ mc: dmc, px: c.x, py: c.y });
			}
			break;
		}
		case 5: {
			const c = this.randomFreeCell();
			this.nblocks++;
			if (!c) break;
			const b = game.level.gen_bumper({ btype: 6, x: c.x * 10 + Const.BORDER_CSIZE, y: c.y * 10 + Const.BORDER_CSIZE });
			if (b) game.level.objects.push(b);
			game.level.interf.update_walls();
			break;
		}
		}
	}

	die() {
		this.mc.gotoAndPlay("death");
		this.shade.gotoAndPlay("death");
		this.state = TB_DEATH;
		for (const p of this.powers.slice()) p.destroy();
	}

	nextKata() {
		if (this.nkatas === 0) {
			if (this.hits >= 20) this.die();
			else if (this.hits >= NHITS) {
				this.hit_time = 1;
				this.hits++;
				this.waitDone();
			} else
				this.fly();
			return;
		}
		let k, sk;
		if (this.nkatas === 3) k = this.target_power + 1;
		else {
			do { k = random(6) + 1; } while (k === this.prev_kata);
		}
		if (this.nkatas === 1) sk = 4;
		else sk = 1 + random(3);
		Sound.play("kata" + sk);
		this.prev_kata = k;
		this.mc.gotoAndStop("kata" + k);
		this.shade.gotoAndStop("kata" + k);
		this.nkatas--;
		this.state = TB_KATA;
	}

	waitDone() {
		const wt = this.game.level.interf.walltable;
		this.nkatas = 3;
		for (let n = 0; n < 1000; n++) {
			this.target_power = random(6);
			if (this.hits >= NHITS && (this.target_power === 1 || this.target_power === 3)) continue;
			if (this.target_power === 4 && this.ncasses > 20) continue;
			if (this.target_power === 5 && this.nblocks > 20) continue;
			if (this.target_power === 3) {
				const px = (((this.x / Const.DELTA) - Const.BORDER_CSIZE) / 10) | 0;
				const py = (((this.y / Const.DELTA) - Const.BORDER_CSIZE) / 10) | 0;
				if (wt[px] && wt[px][py] && wt[px][py].btype === 7) continue;
			}
			break;
		}
		this.timer = 0;
		this.nextKata();
		if (this.hits >= NHITS) this.nkatas = 0;
	}

	animDone() {
		if (this.game.game_over_flag) {
			this.mc.stop();
			this.shade.stop();
			return;
		}
		switch (this.state) {
		case TB_APPEAR: this.fly(); break;
		case TB_FLYING:
			if (this.fly_loops-- <= 0) this.move();
			else {
				this.mc.gotoAndPlay("fly");
				this.shade.gotoAndPlay("fly");
			}
			break;
		case TB_DROPING: this.wait(); break;
		case TB_KATA: this.nextKata(); break;
		case TB_COMEBACK: this.visibleDone(); break;
		case TB_DEATH:
			this.mc.stop();
			this.shade.stop();
			this.game.boss_update = null;
			this.game.gameOver(Const.CAUSE_WINS);
			break;
		}
	}

	toBall() { return Math.atan2(this.game.ball.y - this.y, this.game.ball.x - this.x); }

	onPause() { }

	on_update() {
		const tmod = Std.tmod;
		const game = this.game;
		const mc = this.mc;
		if (this.speed > this.target_speed) {
			this.speed *= Math.pow(0.97, tmod);
			if (this.speed < this.target_speed) this.speed = this.target_speed;
		} else if (this.speed < this.target_speed) {
			if (this.speed <= 1) this.speed = 1;
			this.speed *= Math.pow(this.accel, tmod);
			if (this.speed > this.target_speed) this.speed = this.target_speed;
		}
		for (let i = 0; i < this.powers.length; i++) {
			const p = this.powers[i];
			p.update();
			if (this.powers[i] !== p) i--;
		}
		for (let i = 0; i < this.dalles.length; i++) {
			const d = this.dalles[i];
			if (d.mc.removed) {
				this.dalles.splice(i--, 1);
				const wt = game.level.interf.walltable;
				wt[d.px][d.py] = wt[0][8];
				const dmc = game.dmanager.attach("dalle", Const.BONUS_PLAN);
				dmc.x = d.px * 10 * Const.DELTA + Const.BORDER_SIZE;
				dmc.y = d.py * 10 * Const.DELTA + Const.BORDER_SIZE;
				if (this.dalles.length === 0) {
					Sound.play(Sound.CASSE);
					game.level.interf.update_walls();
				}
			}
		}
		switch (this.state) {
		case TB_MOVING: {
			let dx = this.tx - this.x, dy = this.ty - this.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d > 0) { dx /= d; dy /= d; }
			const s = Math.min(this.speed * Std.tmod, d);
			this.x += dx * s;
			this.y += dy * s;
			if (game.ball.btype === 6) {
				const bx = game.ball.x - this.x, by = game.ball.y - this.y;
				const a = (200000 / (bx * bx + by * by)) | 0;
				mc.alpha = a;
				this.shade.alpha = a;
				mc.visible = true;
				this.shade.visible = true;
			} else {
				mc.visible = false;
				this.shade.visible = false;
			}
			if (s === d && mc.frame >= mc.sym.labels.flyVanish && mc.frame <= mc.sym.labels.flyVanishEnd)
				this.moveDone();
			break;
		}
		case TB_KATA:
			this.timer += Math.pow(Std.tmod, 1.3);
			while (this.timer > 1 && this.state === TB_KATA) {
				this.timer--;
				mc.nextFrame();
				this.shade.nextFrame();
			}
			break;
		case TB_WAITING:
			this.timer -= Std.deltaT;
			if (this.timer <= 0) this.waitDone();
			break;
		}
		if (this.state === TB_WAITING || this.state === TB_KATA) this.collide();
		if (this.bulle.alpha > 0) {
			this.bulle.alpha -= Std.deltaT * 200;
			if (this.bulle.alpha < 0) {
				this.bulle.alpha = 0;
				this.bulle.visible = false;
			}
		}
		if (this.hit_time > 0) {
			this.hit_time -= Std.deltaT;
			if (this.hit_time < 0) {
				this.hit_time = 0;
				mc.tint = null;
			} else
				mc.tint = redTint(this.hit_time * 300);
		}
		mc.x = this.x;
		mc.y = this.y;
		this.shade.x = this.x;
		this.shade.y = this.y;
		this.bulle.x = this.x;
		this.bulle.y = this.y;
	}

	collide() {
		const game = this.game;
		let dx = game.ball.x - this.x, dy = game.ball.y - this.y;
		const d = Math.sqrt(dx * dx + dy * dy);
		if (d < 30) {
			if (this.bulle_active) {
				this.bulle.visible = true;
				this.bulle.alpha = 100;
				this.bulle_active = false;
			} else if (this.hit_time === 0) {
				Sound.play(Sound.TB_HIT);
				this.hit_time = 1;
				this.hits++;
			}
			if (d !== 0) { dx /= d; dy /= d; }
			game.ball.sx += 30 * dx;
			game.ball.sy += 30 * dy;
		}
	}
};

})();
