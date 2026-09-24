/*
 * SoundManager : a small mixer with numbered channels (port of the parts of
 * asml.SoundManager used by the game).
 *
 *   channel 0      sound effects (one-shot)
 *   channels 1-2   music (the two channels are cross-faded when the music changes)
 *   channels 3-7   the 5 layers of the in-game music (see audio/sound.js)
 *
 * Two back-ends :
 * - Web Audio when the page is served over http(s) : all the sounds are
 *   decoded at startup, loops are sample-accurate and can start together.
 * - <audio> elements when the page is opened from the disk (file://), where
 *   fetch() is not allowed. The music layers may then drift a little.
 *
 * Volumes are in percents, like in Flash.
 */
"use strict";

/** Sound name used by the game -> file of assets/snd (without .wav). */
MB2.SOUND_FILES = {
	bonus_blip2: "bonus_blip2",
	menu_enter: "menu_enter",
	menu_select: "menu_change",
	eye: "oeil",
	sound_boss_saut: "boss_saut",
	eye_new: "oeilnew",
	sound_poulpe: "mort_monstre07",
	sound_casse: "fireball03",
	wall_bump: "wall_bump",
	bumper_metal: "bumper_metal",
	sound_bdeath: "superpouvoir02",
	sound_zapper: "traverse_laser07",
	object_found: "object_found",
	bonus_blip: "bonus_blip",
	bonus_blip3: "bonus_blip3",
	sound_grelot: "ramasse_option01",
	door_open: "doors_open",
	game_over: "game_over",
	wind: "wind",
	water: "water",
	earth: "earth",
	touched: "touched",
	hide: "hide",
	kata1: "kata1",
	kata2: "kata2",
	kata3: "kata3",
	kata4: "kata3",          // the final boss asks for a "kata4" that doesn't exist
	menu: "menu",
	boss_loop: "boss",
	"loop$1": "loop1",
	"loop$2": "loop2",
	"loop$3": "loop3",
	"loop$4": "loop4",
	"loop$5": "loop5"
};

MB2.SoundManager = class {

	constructor() {
		this.nchan = 8;
		this.vol = [];        // volume of each channel (0..100)
		this.enabled = [];    // muted channels (options menu)
		this.fades = [];      // running cross-fades
		this.playing = [];    // channel -> { name, node | audio }
		for (let i = 0; i < this.nchan; i++) {
			this.vol[i] = 100;
			this.enabled[i] = true;
		}

		this.buffers = {};    // Web Audio : decoded sounds
		this.elements = {};   // <audio> fallback : one element per music
		this.ctx = null;
		this.useWebAudio = false;

		const AudioContext = window.AudioContext || window.webkitAudioContext;
		if (AudioContext && location.protocol !== "file:") {
			try {
				this.ctx = new AudioContext();
				this.gains = [];
				for (let i = 0; i < this.nchan; i++) {
					const g = this.ctx.createGain();
					g.connect(this.ctx.destination);
					this.gains.push(g);
				}
				this.useWebAudio = true;
			} catch (e) {
				this.useWebAudio = false;
			}
		}
	}

	url(name) {
		return "assets/snd/" + (MB2.SOUND_FILES[name] || name) + ".wav";
	}

	/** Loads and decodes every sound (Web Audio only). onProgress(0..1). */
	load(onProgress) {
		if (!this.useWebAudio)
			return Promise.resolve();

		const names = Object.keys(MB2.SOUND_FILES);
		let done = 0;
		return Promise.all(names.map(name =>
			fetch(this.url(name))
				.then(r => r.arrayBuffer())
				.then(data => new Promise((ok, ko) => this.ctx.decodeAudioData(data, ok, ko)))
				.then(buffer => { this.buffers[name] = buffer; })
				.catch(() => { /* a missing sound is not fatal */ })
				.then(() => {
					done++;
					if (onProgress)
						onProgress(done / names.length);
				})
		));
	}

	/** Browsers only allow audio after a user gesture : called on each click / key. */
	resume() {
		if (this.ctx && this.ctx.state === "suspended")
			this.ctx.resume();

		if (!this.useWebAudio) {
			for (const p of this.playing) {
				if (p && p.audio && p.audio.paused)
					p.audio.play().catch(() => { });
			}
		}
	}

	// ----- volumes -----

	gainOf(ch) {
		return this.enabled[ch] ? this.vol[ch] / 100 : 0;
	}

	applyVolume(ch) {
		const v = this.gainOf(ch);
		if (this.useWebAudio) {
			this.gains[ch].gain.value = v;
		} else {
			const p = this.playing[ch];
			if (p && p.audio)
				p.audio.volume = Math.max(0, Math.min(1, v));
		}
	}

	setVolume(ch, v) {
		this.vol[ch] = v;
		this.applyVolume(ch);
	}

	getVolume(ch) {
		return this.vol[ch];
	}

	enable(ch, flag) {
		this.enabled[ch] = flag;
		this.applyVolume(ch);
	}

	// ----- playing -----

	/** Plays a sound effect on channel 0. */
	play(name) {
		if (!this.enabled[0])
			return;

		if (this.useWebAudio) {
			const buffer = this.buffers[name];
			if (!buffer)
				return;
			const source = this.ctx.createBufferSource();
			source.buffer = buffer;
			source.connect(this.gains[0]);
			source.start();
		} else {
			const audio = new Audio(this.url(name));
			audio.volume = this.gainOf(0);
			audio.play().catch(() => { });
		}
	}

	/** Loops a sound on a channel. `when` (Web Audio time) lets several loops start together. */
	loop(name, ch, when) {
		this.stop(ch);
		if (!name)
			return;

		if (this.useWebAudio) {
			const buffer = this.buffers[name];
			if (!buffer)
				return;
			const source = this.ctx.createBufferSource();
			source.buffer = buffer;
			source.loop = true;
			source.connect(this.gains[ch]);
			source.start(when || 0);
			this.playing[ch] = { name: name, node: source };
		} else {
			let audio = this.elements[name];
			if (!audio) {
				audio = new Audio(this.url(name));
				audio.loop = true;
				this.elements[name] = audio;
			}
			audio.currentTime = 0;
			audio.volume = this.gainOf(ch);
			audio.play().catch(() => { });
			this.playing[ch] = { name: name, audio: audio };
		}
	}

	stop(ch) {
		const p = this.playing[ch];
		if (!p)
			return;
		if (p.node) {
			try {
				p.node.stop();
			} catch (e) {
				// already stopped
			}
		}
		if (p.audio)
			p.audio.pause();
		this.playing[ch] = null;
	}

	isPlaying(name, ch) {
		const p = this.playing[ch];
		return !!p && p.name === name;
	}

	/**
	 * Cross-fades channel a into channel b : a goes down to 0 (and is stopped),
	 * b goes up to the current volume of a. `speed` = 1 / duration in seconds.
	 */
	fade(a, b, speed) {
		this.fades = this.fades.filter(f => f.a !== a && f.b !== b && f.a !== b && f.b !== a);
		this.fades.push({ a: a, b: b, target: this.vol[a], from: this.vol[b], speed: speed || 1, t: 0 });
	}

	/** Advances the fades (called every frame). */
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

	/** Current Web Audio time (0 with the <audio> fallback). */
	now() {
		return this.ctx ? this.ctx.currentTime : 0;
	}

	destroy() {
		for (let i = 0; i < this.nchan; i++)
			this.stop(i);
	}
};
