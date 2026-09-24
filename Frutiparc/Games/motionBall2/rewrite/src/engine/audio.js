/**
 * Audio : sound effects, music with cross-fades, and layered music.
 *
 * Two back-ends, chosen at load time :
 *   - Web Audio, when the page is served over http(s) : sounds are decoded
 *     once, loops are gapless and the music layers start exactly together ;
 *   - <audio> elements, when the page is opened from the disk (file://),
 *     where the files cannot be fetched and decoded.
 * Both give "voices" with a volume and a stop() : the fades are done here, by
 * `update(dt)`, the same way for both.
 *
 * Layered music : the in-game music is made of several loops of the same
 * length, each one richer than the previous. They all play together and in
 * sync, but only one is audible ; `setLayer(i)` cross-fades to another one.
 *
 * Browsers only allow sound after a user gesture : `unlock()` is called on
 * the first key press / click (see main.js).
 */

class WebAudioBackend {

	constructor() {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		this.ctx = new Ctx();
		this.out = this.ctx.createGain();
		this.out.connect(this.ctx.destination);
		// one volume for the music, one for the effects
		this.buses = { music: this.ctx.createGain(), sfx: this.ctx.createGain() };
		for (const bus of Object.values(this.buses))
			bus.connect(this.out);
		this.buffers = new Map();
	}

	async load(name, url) {
		const response = await fetch(url);
		if (!response.ok)
			throw new Error(url + " : " + response.status);
		const data = await response.arrayBuffer();
		this.buffers.set(name, await this.ctx.decodeAudioData(data));
	}

	unlock() {
		if (this.ctx.state === "suspended")
			this.ctx.resume();
	}

	now() {
		return this.ctx.currentTime;
	}

	/** Starts a sound ; `when` (seconds, audio clock) lets several loops start together. */
	start(name, volume, loop, bus, when) {
		const buffer = this.buffers.get(name);
		if (!buffer)
			return null;
		const gain = this.ctx.createGain();
		gain.gain.value = volume;
		gain.connect(this.buses[bus]);
		const source = this.ctx.createBufferSource();
		source.buffer = buffer;
		source.loop = loop;
		source.connect(gain);
		source.start(when || 0);
		const voice = {
			volume,
			ended: false,
			setVolume: v => {
				voice.volume = v;
				gain.gain.value = v;
			},
			stop: () => {
				try {
					source.stop();
				} catch (e) {
					// already stopped
				}
				voice.ended = true;
			}
		};
		source.onended = () => {
			voice.ended = true;
			gain.disconnect();
		};
		return voice;
	}

	setMaster(v) {
		this.out.gain.value = v;
	}

	setBus(bus, v) {
		this.buses[bus].gain.value = v;
	}
}

class ElementBackend {

	constructor() {
		this.sources = new Map();
		this.master = 1;
		this.buses = { music: 1, sfx: 1 };
		this.voices = new Set();
	}

	load(name, url) {
		return new Promise(resolve => {
			const a = new Audio();
			a.preload = "auto";
			a.src = url;
			this.sources.set(name, url);
			// don't wait for the whole file : it can take long, and failing is not fatal
			const done = () => resolve();
			a.addEventListener("canplaythrough", done, { once: true });
			a.addEventListener("error", done, { once: true });
			setTimeout(done, 3000);
		});
	}

	unlock() { }

	now() {
		return 0;
	}

	start(name, volume, loop, bus) {
		const url = this.sources.get(name);
		if (!url)
			return null;
		const a = new Audio(url);
		a.loop = loop;
		a.volume = Math.min(1, volume * this.master * this.buses[bus]);
		a.play().catch(() => { });
		const voice = {
			volume,
			ended: false,
			setVolume: v => {
				voice.volume = v;
				a.volume = Math.min(1, Math.max(0, v * this.master * this.buses[bus]));
			},
			stop: () => {
				a.pause();
				voice.ended = true;
				this.voices.delete(voice);
			}
		};
		a.addEventListener("ended", () => {
			voice.ended = true;
			this.voices.delete(voice);
		});
		this.voices.add(voice);
		return voice;
	}

	setMaster(v) {
		this.master = v;
		for (const voice of this.voices)
			voice.setVolume(voice.volume);
	}

	setBus(bus, v) {
		this.buses[bus] = v;
		for (const voice of this.voices)
			voice.setVolume(voice.volume);
	}
}

/** A volume change over time. */
class Fade {
	constructor(voice, to, duration, stopAtEnd) {
		this.voice = voice;
		this.from = voice.volume;
		this.to = to;
		this.duration = Math.max(0.001, duration);
		this.time = 0;
		this.stopAtEnd = stopAtEnd;
	}

	/** Returns true when done. */
	update(dt) {
		this.time += dt;
		const t = Math.min(1, this.time / this.duration);
		this.voice.setVolume(this.from + (this.to - this.from) * t);
		if (t < 1)
			return false;
		if (this.stopAtEnd)
			this.voice.stop();
		return true;
	}
}

export class AudioEngine {

	/** @param {Object<string, string>} files  sound name -> url */
	constructor(files) {
		this.files = files;
		this.backend = null;
		this.fades = [];
		this.music = null;          // { name, voice, volume }
		this.layers = null;         // { voices, volumes, current }
		this.lastPlayed = new Map();
		this.time = 0;
		this.muted = false;
		this.volume = 1;
		this.musicOn = true;
		this.soundsOn = true;
	}

	/** Loads every sound. `progress(p)` is called with p in [0, 1]. */
	async load(progress) {
		const useWebAudio = location.protocol !== "file:" && (window.AudioContext || window.webkitAudioContext);
		this.backend = useWebAudio ? new WebAudioBackend() : new ElementBackend();

		this.setMusicEnabled(this.musicOn);
		this.setSoundsEnabled(this.soundsOn);

		const names = Object.keys(this.files);
		let done = 0;
		await Promise.all(names.map(async name => {
			try {
				await this.backend.load(name, this.files[name]);
			} catch (e) {
				console.warn("sound", name, e);
			}
			progress(++done / names.length);
		}));
	}

	unlock() {
		if (this.backend)
			this.backend.unlock();
	}

	setVolume(volume) {
		this.volume = volume;
		if (this.backend)
			this.backend.setMaster(this.muted ? 0 : volume);
	}

	setMuted(muted) {
		this.muted = muted;
		this.setVolume(this.volume);
	}

	setMusicEnabled(on) {
		this.musicOn = on;
		if (this.backend)
			this.backend.setBus("music", on ? 1 : 0);
	}

	setSoundsEnabled(on) {
		this.soundsOn = on;
		if (this.backend)
			this.backend.setBus("sfx", on ? 1 : 0);
	}

	/** Must be called every simulation step. */
	update(dt) {
		this.time += dt;
		this.fades = this.fades.filter(f => !f.update(dt));
	}

	fade(voice, to, duration, stopAtEnd = false) {
		this.fades = this.fades.filter(f => f.voice !== voice);
		this.fades.push(new Fade(voice, to, duration, stopAtEnd));
	}

	// ----- effects -----

	/** Plays a sound effect. The same sound is not played twice within 25 ms. */
	play(name, volume = 1) {
		if (!this.backend || !name)
			return;
		const last = this.lastPlayed.get(name);
		if (last !== undefined && this.time - last < 0.025)
			return;
		this.lastPlayed.set(name, this.time);
		this.backend.start(name, volume, false, "sfx");
	}

	// ----- music -----

	/** Cross-fades to another music (null = silence). */
	playMusic(name, volume = 0.3, fadeTime = 1) {
		if (!this.backend)
			return;
		this.stopLayers(fadeTime);
		if (this.music && this.music.name === name)
			return;
		if (this.music)
			this.fade(this.music.voice, 0, fadeTime, true);
		this.music = null;
		if (!name)
			return;
		const voice = this.backend.start(name, 0, true, "music");
		if (voice) {
			this.fade(voice, volume, fadeTime);
			this.music = { name, voice, volume };
		}
	}

	/**
	 * Starts layered music : every loop plays, only `volumes[0]` is audible.
	 * @param {string[]} names    the loops, from the poorest to the richest
	 * @param {number[]} volumes  the volume of each loop when audible
	 */
	startLayers(names, volumes, fadeTime = 1) {
		if (!this.backend)
			return;
		this.stopLayers(0);
		if (this.music) {
			this.fade(this.music.voice, 0, fadeTime, true);
			this.music = null;
		}
		const when = this.backend.now() + 0.05;
		const voices = names.map(n => this.backend.start(n, 0, true, "music", when));
		this.layers = { voices, volumes, current: 0 };
		if (voices[0])
			this.fade(voices[0], volumes[0], fadeTime);
	}

	/** Cross-fades to another layer. */
	setLayer(index, fadeTime = 1) {
		const L = this.layers;
		if (!L || index === L.current || index >= L.voices.length)
			return;
		const from = L.voices[L.current];
		const to = L.voices[index];
		if (from)
			this.fade(from, 0, fadeTime);
		if (to)
			this.fade(to, L.volumes[index], fadeTime);
		L.current = index;
	}

	get layer() {
		return this.layers ? this.layers.current : -1;
	}

	stopLayers(fadeTime = 1) {
		if (!this.layers)
			return;
		for (const v of this.layers.voices)
			if (v)
				this.fade(v, 0, fadeTime, true);
		this.layers = null;
	}
}
