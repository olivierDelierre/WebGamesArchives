// MotionBall 2 - HTML5 port : sounds (mb2/Sound.as + asml.SoundManager)
// Channel 0 : sound effects, 1-2 : music, 3-7 : the in-game music "mix" loops.
// Uses Web Audio when the files can be fetched (http), else <audio> elements.
"use strict";

MB2.SOUND_FILES = {
	bonus_blip2: "bonus_blip2", menu_enter: "menu_enter", menu_select: "menu_change",
	eye: "oeil", sound_boss_saut: "boss_saut", eye_new: "oeilnew", sound_poulpe: "mort_monstre07",
	sound_casse: "fireball03", wall_bump: "wall_bump", bumper_metal: "bumper_metal",
	sound_bdeath: "superpouvoir02", sound_zapper: "traverse_laser07", object_found: "object_found",
	bonus_blip: "bonus_blip", bonus_blip3: "bonus_blip3", sound_grelot: "ramasse_option01",
	door_open: "doors_open", game_over: "game_over", wind: "wind", water: "water", earth: "earth",
	touched: "touched", hide: "hide", kata1: "kata1", kata2: "kata2", kata3: "kata3", kata4: "kata3",
	menu: "menu", boss_loop: "boss",
	"loop$1": "loop1", "loop$2": "loop2", "loop$3": "loop3", "loop$4": "loop4", "loop$5": "loop5"
};

MB2.SoundManager = class {
	constructor() {
		this.nchan = 8;
		this.vol = [];
		this.enabled = [];
		this.fades = [];
		this.playing = []; // channel -> { name, node|audio }
		for (let i = 0; i < this.nchan; i++) { this.vol[i] = 100; this.enabled[i] = true; }
		this.buffers = {};
		this.ctx = null;
		this.useWA = false;
		this.pendingLoops = [];
		const AC = window.AudioContext || window.webkitAudioContext;
		if (AC && location.protocol !== "file:") {
			try {
				this.ctx = new AC();
				this.useWA = true;
				this.gains = [];
				for (let i = 0; i < this.nchan; i++) {
					const g = this.ctx.createGain();
					g.connect(this.ctx.destination);
					this.gains.push(g);
				}
			} catch (e) { this.useWA = false; }
		}
		this.elements = {};
	}
	url(name) { return "assets/snd/" + (MB2.SOUND_FILES[name] || name) + ".wav"; }
	load(onProgress) {
		const names = Object.keys(MB2.SOUND_FILES);
		if (!this.useWA) return Promise.resolve();
		let done = 0;
		return Promise.all(names.map(n =>
			fetch(this.url(n)).then(r => r.arrayBuffer())
				.then(b => new Promise((ok, ko) => this.ctx.decodeAudioData(b, ok, ko)))
				.then(buf => { this.buffers[n] = buf; })
				.catch(() => { })
				.then(() => { done++; if (onProgress) onProgress(done / names.length); })
		));
	}
	resume() {
		if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
		if (!this.useWA) {
			for (const k in this.playing) {
				const p = this.playing[k];
				if (p && p.audio && p.audio.paused) p.audio.play().catch(() => { });
			}
		}
	}
	gainOf(ch) { return this.enabled[ch] ? this.vol[ch] / 100 : 0; }
	applyVolume(ch) {
		const v = this.gainOf(ch);
		if (this.useWA) this.gains[ch].gain.value = v;
		else {
			const p = this.playing[ch];
			if (p && p.audio) p.audio.volume = Math.max(0, Math.min(1, v));
		}
	}
	setVolume(ch, v) { this.vol[ch] = v; this.applyVolume(ch); }
	getVolume(ch) { return this.vol[ch]; }
	enable(ch, f) { this.enabled[ch] = f; this.applyVolume(ch); }
	play(name) {
		if (!this.enabled[0]) return;
		if (this.useWA) {
			const b = this.buffers[name];
			if (!b) return;
			const s = this.ctx.createBufferSource();
			s.buffer = b;
			s.connect(this.gains[0]);
			s.start();
		} else {
			const a = new Audio(this.url(name));
			a.volume = this.gainOf(0);
			a.play().catch(() => { });
		}
	}
	loop(name, ch, when) {
		this.stop(ch);
		if (!name) return;
		if (this.useWA) {
			const b = this.buffers[name];
			if (!b) return;
			const s = this.ctx.createBufferSource();
			s.buffer = b;
			s.loop = true;
			s.connect(this.gains[ch]);
			s.start(when || 0);
			this.playing[ch] = { name: name, node: s };
		} else {
			let a = this.elements[name];
			if (!a) { a = new Audio(this.url(name)); a.loop = true; this.elements[name] = a; }
			a.currentTime = 0;
			a.volume = this.gainOf(ch);
			a.play().catch(() => { });
			this.playing[ch] = { name: name, audio: a };
		}
	}
	stop(ch) {
		const p = this.playing[ch];
		if (!p) return;
		if (p.node) { try { p.node.stop(); } catch (e) { } }
		if (p.audio) p.audio.pause();
		this.playing[ch] = null;
	}
	isPlaying(name, ch) { const p = this.playing[ch]; return !!p && p.name === name; }
	// cross-fade the volume of channel a into channel b
	fade(a, b, speed) {
		this.fades = this.fades.filter(f => f.a !== a && f.b !== b && f.a !== b && f.b !== a);
		this.fades.push({ a: a, b: b, target: this.vol[a], from: this.vol[b], speed: speed || 1, t: 0 });
	}
	main(dt) {
		for (let i = 0; i < this.fades.length; i++) {
			const f = this.fades[i];
			f.t = Math.min(1, f.t + dt * f.speed);
			this.setVolume(f.a, f.target * (1 - f.t));
			this.setVolume(f.b, f.from + (f.target - f.from) * f.t);
			if (f.t >= 1) {
				this.stop(f.a);
				this.fades.splice(i--, 1);
			}
		}
	}
	now() { return this.ctx ? this.ctx.currentTime : 0; }
	destroy() { for (let i = 0; i < this.nchan; i++) this.stop(i); }
};

MB2.Sound = {
	BALL_CHANGE: "bonus_blip2",
	MENU_ENTER: "menu_enter", MENU_SELECT: "menu_select",
	BOSS_EYE: "eye", BOSS_JUMP: "sound_boss_saut", BOSS_NEW_EYE: "eye_new",
	POULPE: "sound_poulpe", CASSE: "sound_casse",
	WALL_HIT: "wall_bump", BUMPER_NORMAL: "bumper_metal", BUMPER_TIME: "wall_bump",
	BUMPER_DEATH: "sound_bdeath", BUMPER_DEATH_PROTECT: "bumper_metal", BUMPER_MAGNET: "bumper_metal",
	BUMPER_SHADOW: "bumper_metal", GREEN_BLOCK_HIT: "wall_bump", INTER_BLOCK_HIT: "wall_bump",
	INTERUPT_HIT: "bumper_metal", ZAPPER_HIT: "bumper_metal", ZAPPER_ACTIVATE: "sound_zapper",
	GREEN_BLOCK_DESTROY: "wall_bump",
	GET_ITEM: "object_found", GET_BALL: "object_found", GET_RED: "bonus_blip", GET_BLUE: "bonus_blip3",
	GRELOT: "sound_grelot", OPEN_DOOR: "door_open", GAME_OVER: "game_over",
	POWER_WIND: "wind", POWER_FIRE: "sound_casse", POWER_WATER: "water", POWER_EARTH: "earth",
	SERPENT_HIT: "touched", SERPENT_COLLIDE: "wall_bump", TB_HIT: "touched", TB_HIDE: "hide",
	MUSIC_MENU: "menu", MUSIC_INTRO: "menu", MUSIC_BOSS: "boss_loop", MUSIC_GAME_OVER: "",
	MIX_VOLUME: 20, MUSIC_VOLUME: 20, MUSIC_NLOOPS: 5,

	smanager: null,
	init() {
		const S = MB2.Sound;
		if (!S.smanager) S.smanager = new MB2.SoundManager();
		S.smanager.setVolume(1, S.MUSIC_VOLUME);
		S.smanager.setVolume(2, S.MUSIC_VOLUME);
		S.time = 0;
		S.mix_nb = undefined;
		S.last_time = undefined;
		S.last_sound = undefined;
		S.channel_music = true;
	},
	destroy() { MB2.Sound.smanager.destroy(); },
	main() {
		const S = MB2.Sound;
		S.time += MB2.Std.deltaT;
		S.smanager.main(MB2.Std.deltaT);
	},
	play(name) {
		const S = MB2.Sound;
		if (name !== S.last_sound || S.time !== S.last_time) {
			S.smanager.play(name);
			S.last_sound = name;
			S.last_time = S.time;
		}
	},
	playMusic(name) {
		const S = MB2.Sound, sm = S.smanager;
		S.stopMix();
		if (!sm.isPlaying(name, S.channel_music ? 1 : 2)) {
			S.channel_music = !S.channel_music;
			const cur = S.channel_music ? 1 : 2, old = S.channel_music ? 2 : 1;
			sm.setVolume(cur, 0);
			sm.vol[old] = S.MUSIC_VOLUME;
			sm.fade(old, cur, 1);
			sm.loop(name, cur);
		}
	},
	startMix() {
		const S = MB2.Sound, sm = S.smanager;
		S.stopMix();
		for (let i = 0; i < S.MUSIC_NLOOPS; i++) sm.setVolume(i + 3, 0);
		const mc = S.channel_music ? 1 : 2;
		sm.setVolume(mc, S.MIX_VOLUME);
		sm.fade(mc, 3);
		const when = sm.now() + 0.05;
		for (let i = 0; i < S.MUSIC_NLOOPS; i++) sm.loop("loop$" + (i + 1), i + 3, when);
		S.mix_nb = 0;
	},
	nextMix() {
		const S = MB2.Sound, sm = S.smanager;
		if (S.mix_nb < 4) {
			sm.setVolume(S.mix_nb + 3, S.MIX_VOLUME + (S.mix_nb + 1) * 10);
			sm.fade(S.mix_nb + 3, S.mix_nb + 4);
			S.mix_nb++;
		}
	},
	fadeMix(name) {
		const S = MB2.Sound, sm = S.smanager;
		S.channel_music = true;
		const m = (S.mix_nb === undefined ? 0 : S.mix_nb) + 3;
		sm.setVolume(m, S.MUSIC_VOLUME);
		sm.setVolume(1, 0);
		sm.fade(m, 1, 2.0);
		sm.loop(name, 1);
		// the other mix loops are not needed anymore
		for (let i = 3; i < 8; i++) if (i !== m) sm.stop(i);
	},
	stopMix() {
		const sm = MB2.Sound.smanager;
		for (let i = 3; i < 8; i++) sm.stop(i);
	}
};
