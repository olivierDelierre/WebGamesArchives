// MotionBall 2 - HTML5 port : Manager, save data and main loop
// Port of mb2/Manager.as, Prefs.as, Client.as, Card.as, TItems.as
// The Frusion game client (server slots, ranking, titems) is replaced by localStorage.
"use strict";

(function () {

const Const = MB2.Const, Std = MB2.Std, Sound = MB2.Sound, Key = MB2.Key;

// ===========================================================================
// Card : the player save (mb2/Card.as)
function time(m, s) { return (m * 60 + s) * 100; }
function times_cpu(t1, t2, t3) { return [{ $t: t1, $c: true }, { $t: t2, $c: true }, { $t: t3, $c: true }]; }
function newCard() {
	return {
		$items: [],
		$challenge: true,
		$classic: true,
		$dungeons: [true, true, true, true],
		$dungeons_done: [],
		$courses: [true],
		$classic_score: 0,
		$challenge_score: 0,
		$dtimes: [],
		$records: [
			times_cpu(time(3, 0), time(3, 40), time(4, 20)),
			times_cpu(time(4, 0), time(4, 40), time(5, 20)),
			times_cpu(time(4, 30), time(5, 15), time(6, 0)),
			times_cpu(time(2, 30), time(3, 0), time(3, 30)),
			times_cpu(time(3, 0), time(3, 30), time(4, 0)),
			times_cpu(time(4, 0), time(4, 40), time(5, 20)),
			times_cpu(time(4, 0), time(4, 40), time(5, 20))
		]
	};
}
MB2.scoreDonjon = function (c, score) {
	const id = MB2.Manager.play_mode_param;
	let old = c.$dtimes[id];
	if (old == null) old = 0;
	if (old < score) {
		c.$dtimes[id] = score;
		MB2.Manager.client.saveSlot(0);
	}
	return old;
};

// ===========================================================================
// Prefs
MB2.Prefs = {
	challenge_mode_enabled: true,
	classic_mode_enabled: true,
	courses: [],
	dungeons: [],
	sound_enabled: true,
	music_enabled: true,
	toggleMusic() {
		const P = MB2.Prefs;
		P.music_enabled = !P.music_enabled;
		for (let i = 1; i < Sound.MUSIC_NLOOPS + 3; i++) Sound.smanager.enable(i, P.music_enabled);
	},
	toggleSounds() {
		const P = MB2.Prefs;
		P.sound_enabled = !P.sound_enabled;
		Sound.smanager.enable(0, P.sound_enabled);
	}
};

// ===========================================================================
// Client : local save instead of the Frusion server
const SAVE_KEY = "motionball2.save";
MB2.Client = class {
	constructor() {
		this.slots = [];
		try {
			const s = JSON.parse(localStorage.getItem(SAVE_KEY));
			if (s && s.slots) this.slots = s.slots;
		} catch (e) { }
	}
	saveSlot() {
		try { localStorage.setItem(SAVE_KEY, JSON.stringify({ slots: this.slots })); } catch (e) { }
	}
	savePrefs() {
		this.slots[1] = { $music: MB2.Prefs.music_enabled, $sounds: MB2.Prefs.sound_enabled };
		this.saveSlot(1);
	}
	saveClassicScore(score) {
		let record = this.slots[0].$classic_score || 0;
		if (score > record) {
			record = score;
			this.slots[0].$classic_score = record;
			this.saveSlot(0);
		}
		return record;
	}
	saveChallengeScore(score) {
		const old = this.slots[0].$challenge_score || 0;
		if (score > old) {
			this.slots[0].$challenge_score = score;
			this.saveSlot(0);
		}
		return old;
	}
	giveItem(name) { MB2.Manager.lastTItem = name; }
	connect() {
		let k = this.slots[1];
		if (k == null) { k = { $music: true, $sounds: true }; this.slots[1] = k; }
		let card = this.slots[0];
		if (card == null) { card = newCard(); this.slots[0] = card; }
		// fill missing fields of older saves
		const def = newCard();
		for (const f in def) if (card[f] === undefined) card[f] = def[f];
		this.fcard = card;
		const P = MB2.Prefs;
		P.challenge_mode_enabled = card.$challenge;
		P.classic_mode_enabled = card.$classic;
		P.courses = card.$courses;
		P.dungeons = card.$dungeons;
		P.music_enabled = !k.$music;
		P.sound_enabled = !k.$sounds;
		P.toggleMusic();
		P.toggleSounds();
	}
};

// ===========================================================================
// TItems (Frutiparc trophies) : kept in the save
MB2.TItems = {
	TITEMS: [
		"$c1or", "$c1argent", "$c1", "$c2or", "$c2argent", "$c2", "$c3or", "$c3argent", "$c3",
		"$c4or", "$c4argent", "$c4", "$c5or", "$c5argent", "$c5", "$c6or", "$c6argent", "$c6",
		"$c7or", "$c7argent", "$c7", "$bfacettes",
		"$bnormal", "$btime", "$bdeath", "$bmagnet", "$bshadow", "$oeil", "$masque",
		"$eca0", "$eca1", "$eca2", "$eca3", "$symb0", "$symb1", "$symb2", "$symb3"
	],
	TITEMS_COURSE: 0, TITEM_CLASSIC: 21, TITEMS_END: 22, TITEMS_SERPENT: 29, TITEMS_SYMBOL: 33,
	giveCourse(cnb, inb) {
		const T = MB2.TItems;
		let t = 0;
		if (T.giveItem(T.TITEMS_COURSE + inb + cnb * 3)) t++;
		if (inb < 2) t += T.giveCourse(cnb, inb + 1);
		return t;
	},
	giveClassic(lvl) {
		if (lvl < 40) return false;
		return MB2.TItems.giveItem(MB2.TItems.TITEM_CLASSIC);
	},
	giveAventure(av) {
		const T = MB2.TItems;
		if (av < 4) {
			if (T.giveItem(T.TITEMS_SYMBOL + av)) return true;
			return T.giveItem(T.TITEMS_SERPENT + av);
		}
		for (let ntry = 100; ntry > 0; ntry--)
			if (T.giveItem(T.TITEMS_END + random(7))) return true;
		return false;
	},
	giveItem(i) {
		const T = MB2.TItems;
		const fc = MB2.Manager.client.fcard.$items;
		if (fc[i] || T.TITEMS[i] === "") return false;
		fc[i] = true;
		MB2.Manager.client.giveItem(T.TITEMS[i]);
		MB2.Manager.client.saveSlot(0);
		return true;
	}
};

// ===========================================================================
// Level data (replaces Loader.as / LevelLoader.as)
function levelData(mode, param) {
	switch (mode) {
	case Const.MODE_CHALLENGE: return MB2.generateChallenge();
	case Const.MODE_CLASSIC: return new MB2.ClassicDungeon(5);
	case Const.MODE_AIDE: return MB2.assembleDungeon(MB2.LEVEL_FILES.tuto);
	case Const.MODE_AVENTURE: return MB2.assembleDungeon(MB2.LEVEL_FILES["adv_" + (param + 1)]);
	case Const.MODE_COURSE: return MB2.assembleDungeon(MB2.LEVEL_FILES["course_" + (param + 1)]);
	}
	return null;
}

class Loader {
	constructor(mode, param) {
		this.text = new MB2.Text("Chargement...");
		this.mode = mode;
		this.param = param;
		this.frames = 0;
	}
	main() {
		this.text.main();
		if (++this.frames === 3) {
			try {
				MB2.Manager.level_data = levelData(this.mode, this.param);
				MB2.Manager.loadDone();
			} catch (e) {
				console.error(e);
				MB2.Manager.error();
			}
		}
	}
	draw(ctx) { this.text.draw(ctx); }
	destroy() { }
}

// ===========================================================================
// Manager
const M = MB2.Manager = {
	play_mode: 0,
	play_mode_param: 0,
	mode: null,
	next_mode: -1,
	client: null,
	level_data: null,

	init() {
		Sound.init();
		M.client = new MB2.Client();
		M.client.connect();
		M.next_mode = -1;
		M.mode = new MB2.Intro();
	},

	main() {
		Collide().frame_nb++;
		Sound.main();
		if (M.mode) M.mode.main();
		if (M.mode && M.mode.tick) M.mode.tick();
	},

	nextMode() {
		switch (M.next_mode) {
		case 0: return new MB2.Menu();
		case 2: return new MB2.Text(" ERREUR ");
		case 3: return new MB2.Game();
		default: return null;
		}
	},
	setNextMode(i) {
		if (M.next_mode === -1) {
			M.mode = new MB2.Transition(M.mode);
			M.next_mode = i;
		}
	},
	forceNextMode(i) {
		if (M.next_mode === -1) M.setNextMode(i);
		else {
			const trans = M.mode;
			if (!(trans instanceof MB2.Transition)) {
				M.next_mode = -1;
				M.setNextMode(i);
				return;
			}
			trans.reversed = false;
			M.next_mode = i;
		}
	},
	switchMode(m) {
		if (M.mode) M.mode.destroy();
		M.next_mode = -1;
		M.mode = m;
	},
	startGame(gameMode, modeParam) {
		M.play_mode = gameMode;
		M.play_mode_param = modeParam;
		M.lastTItem = null;
		if (M.mode) M.mode.destroy();
		M.mode = new Loader(gameMode, modeParam);
	},
	gotoMenu() { M.setNextMode(0); },
	error() { M.setNextMode(2); },
	loadDone() { M.forceNextMode(3); },

	gameFinished() {
		Sound.stopMix();
		Sound.playMusic(Sound.MUSIC_MENU);
		M.forceNextMode(0);
	},

	gameOver(cause) {
		const game = M.mode;
		const score = game.calcScore(cause);
		const fc = M.client.fcard;
		switch (M.play_mode) {
		case Const.MODE_CHALLENGE: {
			M.mode = new MB2.GameOver(game, cause);
			const old = M.client.saveChallengeScore(score);
			M.mode.onScore(score, old, 0, 0, false);
			break;
		}
		case Const.MODE_AVENTURE: {
			const p = M.play_mode_param;
			if (cause === Const.CAUSE_WINS && !fc.$dungeons_done[p]) {
				fc.$dungeons_done[p] = true;
				let i;
				for (i = 0; i < 4; i++) if (!fc.$dungeons_done[i]) break;
				if (i === 4) fc.$dungeons[4] = true;
				M.client.saveSlot(0);
			}
			let ti = false;
			if (cause === Const.CAUSE_WINS) ti = MB2.TItems.giveAventure(p);
			M.mode = new MB2.GameOver(game, cause);
			M.mode.onScore(score, MB2.scoreDonjon(fc, score), 0, 0, ti);
			break;
		}
		case Const.MODE_AIDE:
			M.forceNextMode(0);
			break;
		case Const.MODE_COURSE:
			M.mode = new MB2.GameOverCourse(game, score);
			break;
		case Const.MODE_CLASSIC: {
			const record = M.client.saveClassicScore(score);
			M.mode = new MB2.GameOver(game, cause);
			M.mode.onClassicScore(score, record, MB2.TItems.giveClassic(score));
			break;
		}
		}
	}
};
const Collide = () => MB2.Collide;

// ===========================================================================
// Main loop, rendering and input
MB2.start = function () {
	const canvas = document.getElementById("game");
	const ctx = canvas.getContext("2d");
	const W = Const.LVL_WIDTH, H = Const.LVL_HEIGHT;
	let scale = 1;

	function resize() {
		const wrap = canvas.parentElement;
		const aw = wrap.clientWidth, ah = window.innerHeight - (document.getElementById("touch").offsetHeight || 0) - 8;
		scale = Math.max(0.3, Math.min(aw / W, ah / H));
		const dpr = window.devicePixelRatio || 1;
		canvas.style.width = Math.floor(W * scale) + "px";
		canvas.style.height = Math.floor(H * scale) + "px";
		canvas.width = Math.floor(W * scale * dpr);
		canvas.height = Math.floor(H * scale * dpr);
	}
	window.addEventListener("resize", resize);
	resize();

	// loading screen
	let progress = 0;
	function drawLoading() {
		ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
		ctx.fillStyle = "#4a1a70";
		ctx.fillRect(0, 0, W, H);
		MB2.G.text(ctx, "MotionBall 2", W / 2, 170, 40, "#fff", "#2a0a40");
		ctx.fillStyle = "rgba(255,255,255,0.25)";
		ctx.fillRect(155, 230, 300, 14);
		ctx.fillStyle = "#9ae860";
		ctx.fillRect(155, 230, 300 * progress, 14);
	}
	drawLoading();

	Key.init(window);
	MB2.Sound.init();
	let pi = 0, ps = 0;
	const upd = () => { progress = (pi + ps) / 2; drawLoading(); };
	const fontReady = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(() => { }) : Promise.resolve();
	Promise.all([
		MB2.loadImages(p => { pi = p; upd(); }),
		MB2.Sound.smanager.load(p => { ps = p; upd(); }),
		fontReady
	]).then(() => {
		M.init();
		let last = performance.now();
		let acc = 0;
		const STEP = 1000 / Std.FPS;
		function frame(now) {
			acc += Math.min(250, now - last);
			last = now;
			let n = 0;
			while (acc >= STEP && n < 6) {
				M.main();
				acc -= STEP;
				n++;
			}
			if (n === 6) acc = 0;
			ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
			ctx.globalAlpha = 1;
			if (M.mode) M.mode.draw(ctx);
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);
	});

	// ----- mouse
	function pos(e) {
		const r = canvas.getBoundingClientRect();
		return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
	}
	function current() {
		let m = M.mode;
		if (m instanceof MB2.Transition) return null;
		if (m instanceof MB2.Game && m.pause) return m.pause;
		return m;
	}
	canvas.addEventListener("mousemove", e => {
		const p = pos(e);
		Std.xmouse = p.x; Std.ymouse = p.y;
		const m = current();
		if (m && m.onMouseMove) m.onMouseMove(p.x, p.y);
	});
	canvas.addEventListener("mousedown", e => {
		Sound.smanager.resume();
		const p = pos(e);
		const m = current();
		if (m && m.onMouseDown) m.onMouseDown(p.x, p.y);
	});
	window.addEventListener("keydown", e => {
		Sound.smanager && Sound.smanager.resume();
		const m = current();
		let k = e.keyCode;
		if (k === Key.P) k = Key.ESCAPE;
		if (m && m.onKey && !e.repeat) m.onKey(k);
		if (m instanceof MB2.Intro && !e.repeat) m.onMouseDown();
	});

	// ----- touch : drag anywhere on the game to roll the ball
	MB2.Touch = { dx: 0, dy: 0 };
	let origin = null, touchId = null;
	canvas.addEventListener("touchstart", e => {
		Sound.smanager.resume();
		const t = e.changedTouches[0];
		const p = pos(t);
		const m = current();
		if (m instanceof MB2.Game) {
			if (touchId === null) { touchId = t.identifier; origin = p; }
			e.preventDefault();
			return;
		}
		if (m && m.onMouseMove) m.onMouseMove(p.x, p.y);
		if (m && m.onMouseDown) m.onMouseDown(p.x, p.y);
		e.preventDefault();
	}, { passive: false });
	canvas.addEventListener("touchmove", e => {
		for (const t of e.changedTouches) {
			if (t.identifier !== touchId) continue;
			const p = pos(t);
			let dx = (p.x - origin.x) / 35, dy = (p.y - origin.y) / 35;
			const l = Math.sqrt(dx * dx + dy * dy);
			if (l > 1) { dx /= l; dy /= l; }
			if (l < 0.15) { dx = 0; dy = 0; }
			MB2.Touch.dx = dx; MB2.Touch.dy = dy;
		}
		e.preventDefault();
	}, { passive: false });
	const end = e => {
		for (const t of e.changedTouches) if (t.identifier === touchId) {
			touchId = null;
			MB2.Touch.dx = 0; MB2.Touch.dy = 0;
		}
	};
	canvas.addEventListener("touchend", end);
	canvas.addEventListener("touchcancel", end);
	const press = (k, down) => { Key.down[k] = down; };
	for (const [id, k] of [["tbBall", Key.SPACE], ["tbPause", Key.ESCAPE]]) {
		const b = document.getElementById(id);
		if (!b) continue;
		b.addEventListener("touchstart", e => { press(k, true); e.preventDefault(); }, { passive: false });
		b.addEventListener("touchend", e => { press(k, false); e.preventDefault(); }, { passive: false });
		b.addEventListener("mousedown", () => press(k, true));
		b.addEventListener("mouseup", () => press(k, false));
	}
};

})();
