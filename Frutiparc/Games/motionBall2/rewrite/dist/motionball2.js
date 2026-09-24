(() => {
  // src/config.js
  var WIDTH = 610;
  var HEIGHT = 410;
  var BORDER = 25;
  var DOOR_SIZE = 110;
  var CELL = 4;
  var BORDER_CELLS = 6;
  var TILE = 40;
  var TILE_ORIGIN = BORDER_CELLS * CELL;
  var TILES_X = 14;
  var TILES_Y = 9;
  var BALL_RADIUS = 8;
  var SIM_RATE = 120;
  var ORIGINAL_FPS = 40;
  var ROOM_SCROLL_TIME = 0.5;
  var PHYSICS = {
    // maximum speed before the "over speed" brake (20 px/frame)
    maxSpeed: 800,
    // "over speed" brake : speed x 0.8 per original frame
    overSpeedDamping: 0.8,
    // speeds under this are set to 0 (0.1 px/frame)
    restSpeed: 4,
    // pull toward the centre of a hole, and toward its far side (1 px/frame^2)
    holePull: 1600,
    // the ball is also accelerated by 10% per frame on a hole
    holeBoost: 1.1
  };
  var BALLS = [
    { name: "Jaune", color: "#ffd21e", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 },
    { name: "Verte", color: "#3fbf2a", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 },
    { name: "Rouge", color: "#e8302a", accel: 0.6 * 1600, inertia: 0.95, maxSpeed: 800 },
    { name: "Orange", color: "#ff8c1a", accel: 2.1 * 1600, inertia: 0.85, maxSpeed: 800 },
    { name: "Bleue", color: "#3aa0ff", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 },
    { name: "M\xE9tal", color: "#c8ccd6", accel: 0.2 * 1600, inertia: 0.98, maxSpeed: 280 },
    { name: "Violette", color: "#a64dff", accel: 0.85 * 1600, inertia: 0.94, maxSpeed: 800 }
  ];
  var WATER = { inertia: 0.98, accelFactor: 2 };
  var INVULNERABLE_TIME = 0.4;

  // src/app.js
  var app = {
    screen: null,
    input: null,
    audio: null,
    images: null,
    save: null,
    scenes: null,
    time: 0
  };

  // src/engine/screen.js
  var Screen = class {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.scale = 1;
      this.pixelRatio = 1;
      this.resize = this.resize.bind(this);
      window.addEventListener("resize", this.resize);
      this.resize();
    }
    resize() {
      const parent = this.canvas.parentElement;
      const reserved = parseFloat(getComputedStyle(this.canvas).getPropertyValue("--reserved-height")) || 0;
      const availableW = parent.clientWidth;
      const availableH = window.innerHeight - reserved;
      const scale = Math.max(0.3, Math.min(availableW / WIDTH, availableH / HEIGHT));
      this.scale = scale;
      this.pixelRatio = Math.min(3, window.devicePixelRatio || 1);
      this.canvas.style.width = Math.floor(WIDTH * scale) + "px";
      this.canvas.style.height = Math.floor(HEIGHT * scale) + "px";
      this.canvas.width = Math.floor(WIDTH * scale * this.pixelRatio);
      this.canvas.height = Math.floor(HEIGHT * scale * this.pixelRatio);
    }
    /** Resets the context for a new frame, in game coordinates. */
    begin() {
      const ctx = this.ctx;
      ctx.setTransform(this.canvas.width / WIDTH, 0, 0, this.canvas.height / HEIGHT, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      return ctx;
    }
    /** Number of device pixels per game pixel (to render sprites at the right resolution). */
    get resolution() {
      return this.canvas.width / WIDTH;
    }
    /** Converts a pointer event position to game coordinates. */
    toGame(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) * WIDTH / r.width,
        y: (clientY - r.top) * HEIGHT / r.height
      };
    }
  };

  // src/engine/input.js
  var KEY_ACTIONS = {
    ArrowUp: ["up"],
    KeyW: ["up"],
    KeyZ: ["up"],
    ArrowDown: ["down"],
    KeyS: ["down"],
    ArrowLeft: ["left"],
    KeyA: ["left"],
    KeyQ: ["left"],
    ArrowRight: ["right"],
    KeyD: ["right"],
    Enter: ["confirm"],
    NumpadEnter: ["confirm"],
    Space: ["confirm", "switchBall"],
    Escape: ["pause", "back"],
    KeyP: ["pause"],
    Backspace: ["back"]
  };
  var PAD_BUTTONS = {
    0: ["confirm", "switchBall"],
    // A / cross
    1: ["back"],
    // B / circle
    2: ["switchBall"],
    // X / square
    9: ["pause"],
    // start
    12: ["up"],
    13: ["down"],
    14: ["left"],
    15: ["right"]
  };
  var STICK_DEAD_ZONE = 0.2;
  var TOUCH_STICK_RADIUS = 40;
  var TAP_MAX_MOVE = 12;
  var TAP_MAX_TIME = 350;
  var Input = class {
    /** @param {import("./screen.js").Screen} screen */
    constructor(screen) {
      this.screen = screen;
      this.down = /* @__PURE__ */ new Set();
      this.queue = /* @__PURE__ */ new Set();
      this.padPrevious = /* @__PURE__ */ new Set();
      this.pointer = null;
      this.hover = null;
      this.touchStick = null;
      this.listeners = [];
      this.bindKeyboard();
      this.bindPointer();
    }
    // ----- queries -----
    /** Was the action triggered since the last step ? */
    pressed(action) {
      return this.queue.has(action);
    }
    /** Is the action held ? (keyboard and gamepad) */
    held(action) {
      return this.down.has(action) || this.padHeld(action);
    }
    /** Wanted direction, a vector of length <= 1. */
    axis() {
      let x = 0;
      let y = 0;
      if (this.held("left")) x -= 1;
      if (this.held("right")) x += 1;
      if (this.held("up")) y -= 1;
      if (this.held("down")) y += 1;
      const pad = this.gamepad();
      if (pad && pad.axes.length >= 2) {
        const sx = pad.axes[0];
        const sy = pad.axes[1];
        if (Math.hypot(sx, sy) > STICK_DEAD_ZONE) {
          x += sx;
          y += sy;
        }
      }
      const t = this.touchStick;
      if (t) {
        x += (t.x - t.x0) / TOUCH_STICK_RADIUS;
        y += (t.y - t.y0) / TOUCH_STICK_RADIUS;
      }
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      return { x, y };
    }
    /** The virtual joystick, to draw it : { x0, y0, x, y } or null. */
    get stick() {
      return this.touchStick;
    }
    /** Must be called after every simulation step. */
    endStep() {
      this.queue.clear();
      this.pointer = null;
    }
    /** Must be called once per frame, before the steps : polls the gamepad. */
    poll() {
      const pad = this.gamepad();
      const now = /* @__PURE__ */ new Set();
      if (pad) {
        for (const [index, actions] of Object.entries(PAD_BUTTONS)) {
          const b = pad.buttons[index];
          if (b && b.pressed)
            actions.forEach((a) => now.add(a));
        }
        if (pad.axes[1] < -0.6) now.add("up");
        if (pad.axes[1] > 0.6) now.add("down");
        if (pad.axes[0] < -0.6) now.add("left");
        if (pad.axes[0] > 0.6) now.add("right");
      }
      for (const a of now)
        if (!this.padPrevious.has(a))
          this.queue.add(a);
      this.padPrevious = now;
    }
    /** Programmatic trigger (on-screen buttons). */
    trigger(action) {
      this.queue.add(action);
    }
    // ----- sources -----
    gamepad() {
      if (!navigator.getGamepads)
        return null;
      for (const pad of navigator.getGamepads())
        if (pad && pad.connected)
          return pad;
      return null;
    }
    padHeld(action) {
      return this.padPrevious.has(action) && ["up", "down", "left", "right"].includes(action);
    }
    bindKeyboard() {
      this.on(window, "keydown", (e) => {
        const actions = KEY_ACTIONS[e.code];
        if (!actions)
          return;
        e.preventDefault();
        for (const a of actions) {
          if (!e.repeat)
            this.queue.add(a);
          this.down.add(a);
        }
      });
      this.on(window, "keyup", (e) => {
        const actions = KEY_ACTIONS[e.code];
        if (actions)
          actions.forEach((a) => this.down.delete(a));
      });
      this.on(window, "blur", () => this.down.clear());
    }
    bindPointer() {
      const canvas = this.screen.canvas;
      this.on(canvas, "pointerdown", (e) => {
        const p = this.screen.toGame(e.clientX, e.clientY);
        if (e.pointerType === "mouse") {
          this.pointer = p;
          return;
        }
        if (!this.touchStick) {
          canvas.setPointerCapture(e.pointerId);
          this.touchStick = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now() };
        }
      });
      this.on(canvas, "pointermove", (e) => {
        const p = this.screen.toGame(e.clientX, e.clientY);
        if (e.pointerType === "mouse")
          this.hover = p;
        const t = this.touchStick;
        if (t && t.id === e.pointerId) {
          t.x = p.x;
          t.y = p.y;
        }
      });
      const release = (e) => {
        const t = this.touchStick;
        if (!t || t.id !== e.pointerId)
          return;
        const moved = Math.hypot(t.x - t.x0, t.y - t.y0);
        if (moved < TAP_MAX_MOVE && performance.now() - t.t0 < TAP_MAX_TIME)
          this.pointer = { x: t.x0, y: t.y0 };
        this.touchStick = null;
      };
      this.on(canvas, "pointerup", release);
      this.on(canvas, "pointercancel", release);
      this.on(canvas, "contextmenu", (e) => e.preventDefault());
    }
    on(target, type, fn) {
      target.addEventListener(type, fn, { passive: false });
      this.listeners.push(() => target.removeEventListener(type, fn));
    }
    destroy() {
      this.listeners.forEach((off) => off());
    }
  };

  // src/engine/audio.js
  var WebAudioBackend = class {
    constructor() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      this.buses = { music: this.ctx.createGain(), sfx: this.ctx.createGain() };
      for (const bus of Object.values(this.buses))
        bus.connect(this.out);
      this.buffers = /* @__PURE__ */ new Map();
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
        setVolume: (v) => {
          voice.volume = v;
          gain.gain.value = v;
        },
        stop: () => {
          try {
            source.stop();
          } catch (e) {
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
  };
  var ElementBackend = class {
    constructor() {
      this.sources = /* @__PURE__ */ new Map();
      this.master = 1;
      this.buses = { music: 1, sfx: 1 };
      this.voices = /* @__PURE__ */ new Set();
    }
    load(name, url) {
      return new Promise((resolve) => {
        const a = new Audio();
        a.preload = "auto";
        a.src = url;
        this.sources.set(name, url);
        const done = () => resolve();
        a.addEventListener("canplaythrough", done, { once: true });
        a.addEventListener("error", done, { once: true });
        setTimeout(done, 3e3);
      });
    }
    unlock() {
    }
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
      a.play().catch(() => {
      });
      const voice = {
        volume,
        ended: false,
        setVolume: (v) => {
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
  };
  var Fade = class {
    constructor(voice, to, duration, stopAtEnd) {
      this.voice = voice;
      this.from = voice.volume;
      this.to = to;
      this.duration = Math.max(1e-3, duration);
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
  };
  var AudioEngine = class {
    /** @param {Object<string, string>} files  sound name -> url */
    constructor(files) {
      this.files = files;
      this.backend = null;
      this.fades = [];
      this.music = null;
      this.layers = null;
      this.lastPlayed = /* @__PURE__ */ new Map();
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
      await Promise.all(names.map(async (name) => {
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
      this.fades = this.fades.filter((f) => !f.update(dt));
    }
    fade(voice, to, duration, stopAtEnd = false) {
      this.fades = this.fades.filter((f) => f.voice !== voice);
      this.fades.push(new Fade(voice, to, duration, stopAtEnd));
    }
    // ----- effects -----
    /** Plays a sound effect. The same sound is not played twice within 25 ms. */
    play(name, volume = 1) {
      if (!this.backend || !name)
        return;
      const last = this.lastPlayed.get(name);
      if (last !== void 0 && this.time - last < 0.025)
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
      const voices = names.map((n) => this.backend.start(n, 0, true, "music", when));
      this.layers = { voices, volumes, current: 0 };
      if (voices[0])
        this.fade(voices[0], volumes[0], fadeTime);
    }
    /** Cross-fades to another layer. */
    setLayer(index, fadeTime = 1) {
      const L2 = this.layers;
      if (!L2 || index === L2.current || index >= L2.voices.length)
        return;
      const from = L2.voices[L2.current];
      const to = L2.voices[index];
      if (from)
        this.fade(from, 0, fadeTime);
      if (to)
        this.fade(to, L2.volumes[index], fadeTime);
      L2.current = index;
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
  };

  // src/engine/assets.js
  var ImageStore = class {
    constructor(basePath) {
      this.basePath = basePath;
      this.images = /* @__PURE__ */ new Map();
    }
    /**
     * @param {string[]} files  file names, e.g. "bg01.jpg" (the name is the file name without extension)
     * @param {(p: number) => void} progress
     */
    load(files, progress) {
      let done = 0;
      return Promise.all(files.map((file) => new Promise((resolve) => {
        const img = new Image();
        const finish = () => {
          progress(++done / files.length);
          resolve();
        };
        img.onload = () => {
          this.images.set(file.replace(/\.[a-z]+$/, ""), img);
          finish();
        };
        img.onerror = () => {
          console.warn("image", file, "not loaded");
          finish();
        };
        img.src = this.basePath + file;
      })));
    }
    /** The image, or null when it could not be loaded. */
    get(name) {
      return this.images.get(name) || null;
    }
  };

  // src/engine/scenes.js
  var FADE_TIME = 0.35;
  var SceneManager = class {
    constructor() {
      this.current = null;
      this.next = null;
      this.fade = 0;
      this.fadeDir = 0;
    }
    /** Switches scene. `instant` skips the fade (for the first scene). */
    goto(scene, instant = false) {
      if (instant || !this.current) {
        this.swap(scene);
        return;
      }
      this.next = scene;
      this.fadeDir = 1;
    }
    get busy() {
      return this.fadeDir !== 0;
    }
    swap(scene) {
      if (this.current && this.current.exit)
        this.current.exit();
      this.current = scene;
      if (scene.enter)
        scene.enter();
    }
    update(dt) {
      if (this.fadeDir > 0) {
        this.fade += dt / FADE_TIME;
        if (this.fade >= 1) {
          this.fade = 1;
          this.swap(this.next);
          this.next = null;
          this.fadeDir = -1;
        }
        return;
      }
      if (this.fadeDir < 0) {
        this.fade -= dt / FADE_TIME;
        if (this.fade <= 0) {
          this.fade = 0;
          this.fadeDir = 0;
        }
      }
      if (this.current && this.current.update)
        this.current.update(dt);
    }
    render(ctx) {
      if (this.current && this.current.render)
        this.current.render(ctx);
      if (this.fade > 0) {
        ctx.fillStyle = "rgba(20, 4, 36, " + this.fade + ")";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }
  };

  // src/engine/loop.js
  var STEP = 1 / SIM_RATE;
  var MAX_FRAME_TIME = 0.25;
  var MAX_STEPS = 16;
  var Loop = class {
    /**
     * @param {(dt: number) => void} update  one simulation step
     * @param {() => void} render            draws the current state
     */
    constructor(update, render2) {
      this.update = update;
      this.render = render2;
      this.accumulated = 0;
      this.last = 0;
      this.running = false;
      this.frame = this.frame.bind(this);
    }
    start() {
      if (this.running)
        return;
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    }
    stop() {
      this.running = false;
    }
    frame(now) {
      if (!this.running)
        return;
      this.accumulated += Math.min(MAX_FRAME_TIME, (now - this.last) / 1e3);
      this.last = now;
      let steps = 0;
      while (this.accumulated >= STEP && steps < MAX_STEPS) {
        this.update(STEP);
        this.accumulated -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS)
        this.accumulated = 0;
      this.render();
      requestAnimationFrame(this.frame);
    }
  };

  // src/engine/storage.js
  var Storage = class {
    constructor(key, defaults) {
      this.key = key;
      this.data = structuredClone(defaults);
      try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (saved && typeof saved === "object")
          this.data = deepMerge(this.data, saved);
      } catch (e) {
      }
    }
    save() {
      try {
        localStorage.setItem(this.key, JSON.stringify(this.data));
      } catch (e) {
      }
    }
  };
  function deepMerge(defaults, saved) {
    if (Array.isArray(defaults) || typeof defaults !== "object" || defaults === null)
      return saved === void 0 ? defaults : saved;
    const out = { ...defaults };
    for (const k of Object.keys(saved)) {
      out[k] = k in defaults && typeof defaults[k] === "object" && defaults[k] !== null && !Array.isArray(defaults[k]) ? deepMerge(defaults[k], saved[k]) : saved[k];
    }
    return out;
  }

  // src/progress.js
  var time = (min, sec) => min * 60 + sec;
  var cpu = (a, b, c) => [a, b, c].map((t) => ({ time: t, cpu: true }));
  var DEFAULTS = {
    version: 1,
    settings: {
      music: true,
      sounds: true
    },
    adventures: {
      won: [false, false, false, false, false],
      best: [0, 0, 0, 0, 0]
    },
    courses: {
      unlocked: [true, false, false, false, false, false, false],
      records: [
        cpu(time(3, 0), time(3, 40), time(4, 20)),
        cpu(time(4, 0), time(4, 40), time(5, 20)),
        cpu(time(4, 30), time(5, 15), time(6, 0)),
        cpu(time(2, 30), time(3, 0), time(3, 30)),
        cpu(time(3, 0), time(3, 30), time(4, 0)),
        cpu(time(4, 0), time(4, 40), time(5, 20)),
        cpu(time(4, 0), time(4, 40), time(5, 20))
      ]
    },
    challengeBest: 0,
    classicBest: 0
  };
  var Progress = class {
    constructor() {
      this.store = new Storage("motionball2.rewrite", DEFAULTS);
    }
    get data() {
      return this.store.data;
    }
    get settings() {
      return this.data.settings;
    }
    save() {
      this.store.save();
    }
    adventureUnlocked(i) {
      return i < 4 || this.data.adventures.won.slice(0, 4).every(Boolean);
    }
    courseUnlocked(i) {
      return !!this.data.courses.unlocked[i];
    }
    /** An adventure was won ; returns the previous best score. */
    winAdventure(i, score) {
      const a = this.data.adventures;
      const previous = a.best[i];
      a.won[i] = true;
      a.best[i] = Math.max(previous, score);
      this.save();
      return previous;
    }
    /** Keeps the best score of an adventure ; returns the previous one. */
    adventureScore(i, score) {
      const a = this.data.adventures;
      const previous = a.best[i];
      a.best[i] = Math.max(previous, score);
      this.save();
      return previous;
    }
    /**
     * Inserts a course time in its table of 3 best times.
     * Returns { rank (0..2, or -1 when not ranked), table (the 3 rows, with
     * `mine` on the new one), unlockedNext }.
     */
    courseTime(i, seconds) {
      const c = this.data.courses;
      const table = c.records[i];
      const rank = table.findIndex((r) => seconds < r.time);
      let unlockedNext = false;
      if (rank >= 0) {
        table.splice(rank, 0, { time: seconds, cpu: false });
        table.length = 3;
        if (i + 1 < c.unlocked.length && !c.unlocked[i + 1]) {
          c.unlocked[i + 1] = true;
          unlockedNext = true;
        }
        this.save();
      }
      return {
        rank,
        table: table.map((r, n) => ({ ...r, mine: n === rank })),
        unlockedNext
      };
    }
    /** Keeps a best score ; returns the previous one. */
    best(key, score) {
      const previous = this.data[key];
      if (score > previous) {
        this.data[key] = score;
        this.save();
      }
      return previous;
    }
  };

  // src/sounds.js
  var dir = "assets/snd/";
  var SOUND_FILES = {
    ballChange: dir + "bonus_blip2.wav",
    menuEnter: dir + "menu_enter.wav",
    menuMove: dir + "menu_change.wav",
    eye: dir + "oeil.wav",
    newEye: dir + "oeilnew.wav",
    bossJump: dir + "boss_saut.wav",
    bossDeath: dir + "mort_monstre07.wav",
    crash: dir + "fireball03.wav",
    wall: dir + "wall_bump.wav",
    metal: dir + "bumper_metal.wav",
    death: dir + "superpouvoir02.wav",
    laser: dir + "traverse_laser07.wav",
    found: dir + "object_found.wav",
    red: dir + "bonus_blip.wav",
    blue: dir + "bonus_blip3.wav",
    key: dir + "ramasse_option01.wav",
    doors: dir + "doors_open.wav",
    gameOver: dir + "game_over.wav",
    wind: dir + "wind.wav",
    water: dir + "water.wav",
    earth: dir + "earth.wav",
    touched: dir + "touched.wav",
    hide: dir + "hide.wav",
    kata1: dir + "kata1.wav",
    kata2: dir + "kata2.wav",
    kata3: dir + "kata3.wav",
    musicMenu: dir + "menu.wav",
    musicBoss: dir + "boss.wav",
    loop1: dir + "loop1.wav",
    loop2: dir + "loop2.wav",
    loop3: dir + "loop3.wav",
    loop4: dir + "loop4.wav",
    loop5: dir + "loop5.wav"
  };
  var GAME_MUSIC = {
    layers: ["loop1", "loop2", "loop3", "loop4", "loop5"],
    volumes: [0.2, 0.3, 0.4, 0.5, 0.6]
  };
  var MUSIC_VOLUME = 0.25;

  // src/gfx/draw.js
  var FONT = "'Baloo 2', 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif";
  var BALL_COLORS = [
    ["#ffd41c", "#b87a00", "#fffbd0"],
    // yellow
    ["#95e04c", "#3a8a14", "#efffd8"],
    // green
    ["#ee4a22", "#7a1004", "#ffc4a8"],
    // red
    ["#ffa01e", "#c04c00", "#fff0b8"],
    // orange
    ["#a8e2ff", "#3c86c4", "#ffffff"],
    // blue
    ["#d2d6dc", "#646e7a", "#ffffff"],
    // metal
    ["#bf84ea", "#6a2a9c", "#f6e6ff"]
    // violet
  ];
  var BORDER_COLORS = { body: "#7dd64e", dark: "#4fa628", light: "#b4f08a" };
  function image(ctx, name, w, h, x, y) {
    const img = app.images.get(name);
    if (!img)
      return;
    w = w || img.naturalWidth;
    h = h || img.naturalHeight;
    ctx.drawImage(img, x === void 0 ? -w / 2 : x, y === void 0 ? -h / 2 : y, w, h);
  }
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.closePath();
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
  function sphere(ctx, x, y, r, main, edge, highlight = "#fff") {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, highlight);
    g.addColorStop(0.35, main);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    circle(ctx, x, y, r);
    ctx.fill();
  }
  function shine(ctx, x, y, r, alpha = 0.7) {
    ctx.fillStyle = "rgba(255,255,255," + alpha + ")";
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, y - r * 0.45, r * 0.45, r * 0.25, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  function ballSphere(ctx, x, y, r, type) {
    const c = BALL_COLORS[type] || BALL_COLORS[0];
    sphere(ctx, x, y, r, c[0], c[1], c[2]);
  }
  function dropShadow(ctx, x, y, r, alpha = 0.22) {
    ctx.fillStyle = "rgba(40,0,70," + alpha + ")";
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 5, r, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function text(ctx, str, x, y, options = {}) {
    const size = options.size || 16;
    ctx.font = (options.weight || "800") + " " + size + "px " + FONT;
    ctx.textAlign = options.align || "center";
    ctx.textBaseline = options.baseline || "middle";
    const lines = String(str).split("\n");
    const lineHeight = size * 1.15;
    let yy = y - (lines.length - 1) * lineHeight / 2;
    for (const line of lines) {
      if (options.outline) {
        ctx.lineJoin = "round";
        ctx.lineWidth = options.outlineWidth || Math.max(2, size / 5);
        ctx.strokeStyle = options.outline;
        ctx.strokeText(line, x, yy);
      }
      ctx.fillStyle = options.color || "#fff";
      ctx.fillText(line, x, yy);
      yy += lineHeight;
    }
  }
  function sparkle(ctx, x, y, t, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= 1 - t;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (3 + t * 10), Math.sin(a) * (3 + t * 10));
      ctx.lineTo(Math.cos(a) * (6 + t * 16), Math.sin(a) * (6 + t * 16));
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    circle(ctx, 0, 0, 4 * (1 - t));
    ctx.fill();
    ctx.restore();
  }
  var cache = /* @__PURE__ */ new Map();
  var SPRITE_RESOLUTION = 3;
  function sprite(key, w, h, draw) {
    let s = cache.get(key);
    if (!s) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(w * SPRITE_RESOLUTION);
      canvas.height = Math.ceil(h * SPRITE_RESOLUTION);
      const c = canvas.getContext("2d");
      c.scale(SPRITE_RESOLUTION, SPRITE_RESOLUTION);
      c.translate(w / 2, h / 2);
      draw(c);
      s = { canvas, w, h };
      cache.set(key, s);
    }
    return s;
  }
  function drawSprite(ctx, s, x, y, scale = 1) {
    ctx.drawImage(s.canvas, x - s.w * scale / 2, y - s.h * scale / 2, s.w * scale, s.h * scale);
  }

  // src/gfx/ui.js
  function sunburst(ctx, rotation, scale = 1) {
    ctx.fillStyle = "#6e32a0";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const img = app.images.get("roue");
    if (img) {
      const s = 1.2 * scale;
      ctx.save();
      ctx.translate(WIDTH / 2, HEIGHT / 2);
      ctx.rotate(rotation);
      ctx.drawImage(img, -351 * s, -351 * s, 702 * s, 702 * s);
      ctx.restore();
    }
    const g = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 60, WIDTH / 2, HEIGHT / 2, 380);
    g.addColorStop(0, "rgba(255,255,255,0.15)");
    g.addColorStop(1, "rgba(40,0,70,0.5)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  function titleLetter(ctx, ch, size) {
    ctx.font = "800 " + size + "px " + FONT;
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
  function title(ctx, word, x, y, size, time2 = 0) {
    ctx.font = "800 " + size + "px " + FONT;
    const widths = [...word].map((ch) => ctx.measureText(ch).width * 0.92);
    let cx = x - widths.reduce((a, b) => a + b, 0) / 2;
    [...word].forEach((ch, i) => {
      ctx.save();
      ctx.translate(cx + widths[i] / 2, y + Math.sin(time2 * 3 + i * 0.6) * 3);
      ctx.rotate(Math.sin(time2 * 2 + i) * 0.05);
      titleLetter(ctx, ch, size);
      ctx.restore();
      cx += widths[i];
    });
  }
  function panel(ctx, x, y, w, h, s = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = "rgba(90,40,0,0.3)";
    roundRect(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 22);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, "#ffe04a");
    g.addColorStop(1, "#ffb400");
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, 22);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#e08a00";
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    roundRect(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 17);
    ctx.stroke();
    ctx.restore();
  }
  function bubbleTitle(ctx, str, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.font = "800 " + size + "px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size / 4;
    ctx.strokeStyle = "#c86a00";
    ctx.strokeText(str, 0, 0);
    ctx.lineWidth = size / 9;
    ctx.strokeStyle = "#fff6c0";
    ctx.strokeText(str, 0, 0);
    const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
    g.addColorStop(0, "#fff7a0");
    g.addColorStop(1, "#ffc000");
    ctx.fillStyle = g;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }
  function button(ctx, label, x, y, w, h, state = "idle") {
    const focus = state === "focus";
    const disabled = state === "disabled";
    ctx.save();
    ctx.translate(x, y);
    if (focus)
      ctx.scale(1.06, 1.06);
    ctx.fillStyle = "rgba(40,0,70,0.35)";
    roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, h / 2);
    ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    if (disabled) {
      g.addColorStop(0, "#b8a8c4");
      g.addColorStop(1, "#8a7a98");
    } else if (focus) {
      g.addColorStop(0, "#c8ff9a");
      g.addColorStop(1, "#5cc22c");
    } else {
      g.addColorStop(0, "#a6ec6e");
      g.addColorStop(1, "#3c8f1d");
    }
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = focus ? "#fff" : "rgba(255,255,255,0.6)";
    ctx.stroke();
    text(ctx, label, 0, 1, { size: Math.min(20, h * 0.55), color: disabled ? "#e8e0f0" : "#fff", outline: "rgba(20,60,0,0.5)" });
    ctx.restore();
  }
  var Pop = class {
    constructor() {
      this.value = 0;
      this.speed = 0;
    }
    update(dt) {
      const frames = dt * 40;
      this.speed += (1 - this.value) * 0.35 * frames;
      this.speed *= Math.pow(0.6, frames);
      this.value += this.speed * frames;
      return this.value;
    }
  };

  // src/data/enums.js
  var BallType = Object.freeze({
    YELLOW: 0,
    // the default ball
    GREEN: 1,
    // destroys the green blocks
    RED: 2,
    // attracts the red pastilles
    ORANGE: 3,
    // fast
    BLUE: 4,
    // jumps over the holes
    METAL: 5,
    // heavy, immune to the death bumpers and to the magnets
    VIOLET: 6
    // sees the invisible bumpers
  });
  var BALL_TYPE_COUNT = 7;
  var Item = Object.freeze({
    NONE: 0,
    // removed (destroyed block, collected pastille)
    BUMPER: 1,
    CLOCK: 2,
    // costs 5 seconds when hit
    DEATH: 3,
    // kills the ball, except the metal one
    MAGNET: 4,
    GHOST: 5,
    // invisible bumper
    BLOCK: 6,
    // green block, destroyed by the green ball
    HOLE: 7,
    RED: 8,
    // red pastille : collect them all to open the doors
    BLUE: 9,
    // time pastille
    TELEPORT: 10,
    SWITCH: 11,
    // toggles the pink and blue blocks
    PINK_BLOCK: 12,
    // solid while the switch is on
    BLUE_BLOCK: 13,
    // solid while the switch is off
    ZAPPER: 14,
    // laser post (a checkpoint in Course mode)
    HATCH: 15
    // exit of the Classique rooms
  });
  var RoomType = Object.freeze({
    NONE: 0,
    NORMAL: 1,
    BOSS: 2,
    BALL: 3,
    // holds a ball to collect (data : DungeonObject)
    BONUS: 4,
    // holds an item box or a bonus ball (data : DungeonBonus)
    NEEDS_BALL: 5
    // a room that can only be crossed with a given ball
  });
  var Exit = Object.freeze({
    DOOR: 0,
    // opens when every red pastille is collected
    WALL: 1,
    HIDDEN: 2,
    // open, but looks like a wall
    SPECIAL: 3,
    // Challenge : a door needing a ball ; other modes : a one-way door
    OPEN: -1,
    // a door that has been opened
    ONE_WAY: -2
    // a one-way door that has been crossed
  });
  var Dir = Object.freeze({ LEFT: 0, RIGHT: 1, UP: 2, DOWN: 3 });
  var DIR_DX = [-1, 1, 0, 0];
  var DIR_DY = [0, 0, -1, 1];
  var OPPOSITE = [1, 0, 3, 2];
  var DungeonBall = Object.freeze({ GREEN: 0, BLUE: 1, METAL: 2, VIOLET: 3 });
  var DungeonBonus = Object.freeze({
    ORANGE: 0,
    RED: 1,
    MAP: 2,
    RADAR: 3,
    KEY: 4,
    SMALL_TIME: 5,
    BIG_TIME: 6
  });
  var Mode = Object.freeze({
    CHALLENGE: "challenge",
    ADVENTURE: "adventure",
    COURSE: "course",
    CLASSIC: "classic",
    TUTORIAL: "tutorial"
  });

  // src/game/entity.js
  var Layer = Object.freeze({
    FLOOR: 0,
    // holes, teleports, lowered blocks, beams
    SHADOW: 1,
    // shadows of the objects
    ITEM: 2,
    // pastilles, hatch, balls to collect
    BLOCK: 3,
    // green, pink and blue blocks
    BALL: 4,
    // the player's ball
    OBJECT: 5,
    // bumpers (above the ball, as in the original)
    EFFECT: 6,
    // sparks, debris
    BOSS: 7,
    TOP: 8
  });
  var Entity = class {
    constructor(x = 0, y = 0, layer = Layer.OBJECT) {
      this.x = x;
      this.y = y;
      this.layer = layer;
      this.dead = false;
      this.shape = null;
      this.solid = false;
      this.bounce = null;
    }
    update(dt, game) {
    }
    render(ctx, game) {
    }
  };
  var Effect = class extends Entity {
    constructor(x, y, duration, layer = Layer.EFFECT) {
      super(x, y, layer);
      this.duration = duration;
      this.age = 0;
    }
    get t() {
      return Math.min(1, this.age / this.duration);
    }
    update(dt) {
      this.age += dt;
      if (this.age >= this.duration)
        this.dead = true;
    }
  };

  // src/game/physics.js
  function circleContact(cx, cy, radius, shape) {
    if (shape.kind === "circle") {
      const dx2 = cx - shape.x;
      const dy2 = cy - shape.y;
      const d22 = dx2 * dx2 + dy2 * dy2;
      const r = radius + shape.r;
      if (d22 >= r * r)
        return null;
      const d = Math.sqrt(d22);
      if (d < 1e-6)
        return { nx: 0, ny: -1, depth: r };
      return { nx: dx2 / d, ny: dy2 / d, depth: r - d };
    }
    if (shape.kind === "arc")
      return arcContact(cx, cy, radius, shape);
    const px = Math.max(shape.x, Math.min(cx, shape.x + shape.w));
    const py = Math.max(shape.y, Math.min(cy, shape.y + shape.h));
    const dx = cx - px;
    const dy = cy - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1e-9) {
      if (d2 >= radius * radius)
        return null;
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, depth: radius - d };
    }
    const left = cx - shape.x;
    const right = shape.x + shape.w - cx;
    const top = cy - shape.y;
    const bottom = shape.y + shape.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left)
      return { nx: -1, ny: 0, depth: left + radius };
    if (m === right)
      return { nx: 1, ny: 0, depth: right + radius };
    if (m === top)
      return { nx: 0, ny: -1, depth: top + radius };
    return { nx: 0, ny: 1, depth: bottom + radius };
  }
  function arcContact(cx, cy, radius, arc) {
    const dx = cx - arc.x;
    const dy = cy - arc.y;
    if (dx * arc.sx <= 0 || dy * arc.sy <= 0)
      return null;
    const d = Math.hypot(dx, dy);
    const max = arc.r - radius;
    if (d <= max)
      return null;
    return { nx: -dx / d, ny: -dy / d, depth: d - max };
  }
  function circleTouchesSegment(cx, cy, radius, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + dx * t - cx;
    const py = y1 + dy * t - cy;
    return px * px + py * py < radius * radius;
  }
  function collideBall(ball, colliders, game) {
    let contacts = 0;
    for (const c of colliders) {
      if (!c.solid || !c.shape)
        continue;
      const hit = circleContact(ball.x, ball.y, ball.radius, c.shape);
      if (!hit)
        continue;
      contacts++;
      ball.x += hit.nx * hit.depth;
      ball.y += hit.ny * hit.depth;
      const vn = ball.vx * hit.nx + ball.vy * hit.ny;
      if (vn >= 0)
        continue;
      const speed = Math.hypot(ball.vx, ball.vy);
      let rx = ball.vx - 2 * vn * hit.nx;
      let ry = ball.vy - 2 * vn * hit.ny;
      const rlen = Math.hypot(rx, ry) || 1;
      const bounce = c.bounce || DEFAULT_BOUNCE;
      const out = Math.max(speed * bounce.coef, bounce.min);
      ball.vx = rx / rlen * out;
      ball.vy = ry / rlen * out;
      if (c.onHit)
        c.onHit(game, { x: ball.x - hit.nx * ball.radius, y: ball.y - hit.ny * ball.radius, nx: hit.nx, ny: hit.ny, speed });
    }
    return contacts;
  }
  var DEFAULT_BOUNCE = { coef: 1, min: 0 };
  var BOUNCE = {
    border: { coef: 1.1, min: 160 },
    bumper: { coef: 1.5, min: 800 },
    clock: { coef: 1.5, min: 600 },
    death: { coef: 1.2, min: 200 },
    magnet: { coef: 1, min: 200 },
    ghost: { coef: 3, min: 600 },
    block: { coef: 1.2, min: 0 },
    zapper: { coef: 1.1, min: 400 },
    itemBox: { coef: 0.1, min: 0 },
    boss: { coef: 1.2, min: 300 }
  };

  // src/engine/math.js
  var TAU = Math.PI * 2;
  var dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  var dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI)
      d -= TAU;
    else if (d <= -Math.PI)
      d += TAU;
    return d;
  }
  var decay = (k, dt) => Math.pow(k, dt * ORIGINAL_FPS);
  var smooth = (x, target, k, dt) => target + (x - target) * decay(1 - k, dt);
  var randInt = (n) => Math.floor(Math.random() * n);
  function weightedIndex(weights) {
    let total = 0;
    for (const w of weights)
      total += w;
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0)
        return i;
    }
    return weights.length - 1;
  }
  var perFrameChance = (n, dt) => 1 - Math.pow(1 - 1 / n, dt * ORIGINAL_FPS);
  var ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
    outElastic: (t) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * TAU / 3) + 1
  };
  function formatTime(seconds, withHundredths) {
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s) % 60;
    const pad = (n) => String(n).padStart(2, "0");
    if (withHundredths)
      return pad(m) + ":" + pad(sec) + ":" + pad(Math.floor(s * 100) % 100);
    return m + ":" + pad(sec);
  }

  // src/game/ball.js
  var MAX_SUBSTEP = 4;
  var SPOTS = [
    { count: 6, min: 10, max: 20, color: "#fff4a0" },
    { count: 20, min: 0, max: 20, color: "#2a7a10" },
    { count: 4, min: 14, max: 14, color: "#ffd0b0" },
    { count: 10, min: 0, max: 12, color: "#ffe070" },
    { count: 10, min: 6, max: 20, color: "#ffffff" },
    { count: 0, min: 0, max: 20, color: "#ffffff" },
    { count: 20, min: 0, max: 20, color: "#f0d0ff" }
  ];
  var Ball = class extends Entity {
    constructor() {
      super(0, 0, Layer.BALL);
      this.radius = BALL_RADIUS;
      this.type = BallType.YELLOW;
      this.vx = 0;
      this.vy = 0;
      this.spawnX = 0;
      this.spawnY = 0;
      this.controlled = true;
      this.speedLimit = true;
      this.water = false;
      this.invulnerable = 0;
      this.fall = null;
      this.jump = null;
      this.justLanded = false;
      this.height = 0;
      this.hidden = false;
      this.spots = [];
      this.setType(BallType.YELLOW);
    }
    get speed() {
      return Math.hypot(this.vx, this.vy);
    }
    get specs() {
      return BALLS[this.type];
    }
    setType(type) {
      this.type = type;
      const s = SPOTS[type];
      this.spots = [];
      for (let i = 0; i < s.count; i++) {
        this.spots.push({
          u: Math.random() * TAU,
          v: Math.random() * TAU,
          ray: s.min + randInt(s.max - s.min + 1),
          size: 1 + Math.random() * 1.6
        });
      }
    }
    placeAt(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
    }
    /** Remembers the current position as the place to come back to after a death. */
    setSpawn() {
      this.spawnX = this.x;
      this.spawnY = this.y;
    }
    get falling() {
      return this.fall !== null;
    }
    // ----- every step -----
    update(dt, game) {
      if (this.invulnerable > 0)
        this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.updateJump(dt);
      if (this.fall) {
        this.updateFall(dt, game);
        return;
      }
      this.steer(dt, game);
      this.move(dt, game);
      this.roll(dt);
    }
    /** Controls and speed. */
    steer(dt, game) {
      const specs = this.specs;
      let accel = specs.accel;
      let inertia = specs.inertia;
      if (this.water) {
        accel *= WATER.accelFactor;
        inertia = WATER.inertia;
      }
      const k = decay(inertia, dt);
      this.vx *= k;
      this.vy *= k;
      if (Math.abs(this.vx) < PHYSICS.restSpeed)
        this.vx = 0;
      if (Math.abs(this.vy) < PHYSICS.restSpeed)
        this.vy = 0;
      if (this.controlled && !this.jump) {
        const axis = app.input.axis();
        this.vx += axis.x * accel * dt;
        this.vy += axis.y * accel * dt;
      }
      const max = specs.maxSpeed;
      let speed = this.speed;
      if (this.speedLimit && speed > max) {
        let f = decay(PHYSICS.overSpeedDamping, dt);
        if (speed > 3 * max)
          f /= 3;
        this.vx *= f;
        this.vy *= f;
      }
      if (this.type === BallType.RED)
        this.attractReds(dt, game);
    }
    /** Moves in sub-steps, testing the holes and the collisions. */
    move(dt, game) {
      const dx = this.vx * dt;
      const dy = this.vy * dt;
      const steps = 1 + Math.floor(Math.hypot(dx, dy) / MAX_SUBSTEP);
      const colliders = game.colliders();
      for (let i = 0; i < steps; i++) {
        this.x += dx / steps;
        this.y += dy / steps;
        collideBall(this, colliders, game);
        game.room.touchBeams(this, game);
        if (this.testHole(dt / steps, game))
          return;
      }
    }
    /** The red ball attracts the red pastilles within 200 pixels. */
    attractReds(dt, game) {
      for (const e of game.room.entities) {
        if (e.itemType !== Item.RED || e.taken)
          continue;
        const dx = this.x - e.x;
        const dy = this.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 200 * 200 && d2 > 1) {
          const pull = 150 * 40 * dt / d2;
          e.x += dx * pull;
          e.y += dy * pull;
        }
      }
    }
    /** Fakes the rolling : each spot turns around the ball with the speed. */
    roll(dt) {
      for (const s of this.spots) {
        s.u = (s.u + this.vx * dt * 0.1) % TAU;
        s.v = (s.v + this.vy * dt * 0.1) % TAU;
      }
    }
    // ----- holes -----
    /**
     * Holes are 40 x 40 tiles of the room. On a hole, the ball is pulled toward
     * the middle of the hole, away from the edges touching the floor. Once it
     * is far enough from those edges, it falls. The blue ball jumps instead.
     * Returns true when the ball starts falling.
     */
    testHole(dt, game) {
      const tiles = game.room.tiles;
      const tx = Math.floor((this.x - TILE_ORIGIN) / TILE);
      const ty = Math.floor((this.y - TILE_ORIGIN) / TILE);
      const isHole = (x, y) => tiles.get(x, y) === Item.HOLE;
      if (!isHole(tx, ty) || this.jump) {
        this.justLanded = false;
        return false;
      }
      const cx = TILE_ORIGIN + (tx + 0.5) * TILE;
      const cy = TILE_ORIGIN + (ty + 0.5) * TILE;
      const half = TILE / 2;
      const R = this.radius;
      const boost = decay(PHYSICS.holeBoost, dt);
      this.vx *= boost;
      this.vy *= boost;
      let left = this.x < cx && !isHole(tx - 1, ty);
      let right = this.x > cx && !isHole(tx + 1, ty);
      let up = this.y < cy && !isHole(tx, ty - 1);
      let down = this.y > cy && !isHole(tx, ty + 1);
      if (left && right && up && down)
        left = right = up = down = false;
      const pull = PHYSICS.holePull * dt;
      if (left) this.vx += pull;
      if (right) this.vx -= pull;
      if (up) this.vy += pull;
      if (down) this.vy -= pull;
      const inside = this.x > cx - half + (left ? R : 0) && this.x < cx + half - (right ? R : 0) && this.y > cy - half + (up ? R : 0) && this.y < cy + half - (down ? R : 0);
      if (inside) {
        this.startFall("hole", 1, game.room.holeClip());
        return true;
      }
      if (this.type === BallType.BLUE && !this.justLanded)
        this.jump = { size: 0, way: 1 };
      return false;
    }
    /** The blue ball's jump : it goes up and down in ~0.17 s, higher when fast. */
    updateJump(dt) {
      const j = this.jump;
      if (!j) {
        this.height = 0;
        return;
      }
      j.size += j.way * 60 * 40 * dt;
      if (j.size > 200)
        j.way = -1;
      if (j.size < 0) {
        this.jump = null;
        this.height = 0;
        this.justLanded = true;
        return;
      }
      this.height = Math.sqrt(Math.max(0, j.size * this.speed / 40)) / 6;
    }
    // ----- falling and dying -----
    /**
     * Starts falling : the ball shrinks, clipped by `clip` (a function adding
     * the visible area to a path), then game.ballFell(kind) is called.
     */
    startFall(kind, speed, clip) {
      this.fall = { kind, scale: 1, speed, clip };
      this.jump = null;
      this.height = 0;
      this.invulnerable = 0;
    }
    /** Killed (death bumper, laser, boss...). Ignored while invulnerable. */
    die() {
      if (this.invulnerable > 0 || this.fall)
        return false;
      this.vx = 0;
      this.vy = 0;
      this.startFall("death", 5, null);
      return true;
    }
    updateFall(dt, game) {
      const f = this.fall;
      const k = decay(0.9, dt);
      this.vx *= k;
      this.vy *= k;
      this.x += this.vx * dt / 5;
      this.y += this.vy * dt / 5;
      f.scale *= decay(Math.pow(0.92, f.speed), dt);
      if (f.scale >= 0.03)
        return;
      this.fall = null;
      game.ballFell(f.kind);
    }
    /** Back to the entrance of the room, blinking. */
    respawn() {
      this.placeAt(this.spawnX, this.spawnY);
      this.fall = null;
      this.jump = null;
      this.height = 0;
      this.invulnerable = INVULNERABLE_TIME;
    }
    // ----- drawing -----
    renderShadow(ctx) {
      if (this.hidden || this.fall)
        return;
      ctx.fillStyle = "rgba(40,0,70,0.3)";
      circle(ctx, this.x + 3, this.y + 3, this.radius);
      ctx.fill();
    }
    render(ctx) {
      if (this.hidden)
        return;
      if (this.invulnerable > 0 && Math.floor(this.invulnerable * 40) % 2 === 0)
        ctx.globalAlpha = 0.3;
      else if (this.invulnerable > 0)
        ctx.globalAlpha = 0.6;
      ctx.save();
      if (this.fall && this.fall.clip) {
        ctx.beginPath();
        this.fall.clip(ctx);
        ctx.clip();
      }
      const scale = (this.fall ? this.fall.scale : 1) * (1 + this.height * 0.03);
      ctx.translate(this.x, this.y - this.height);
      ctx.scale(scale, scale);
      drawBall(ctx, this.type, this.radius, this.spots);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  };
  function drawBall(ctx, type, r, spots) {
    const col = BALL_COLORS[type];
    sphere(ctx, 0, 0, r + 1, col[0], col[1], col[2]);
    if (spots && spots.length) {
      ctx.save();
      circle(ctx, 0, 0, r);
      ctx.clip();
      ctx.fillStyle = SPOTS[type].color;
      for (const s of spots) {
        const x = Math.cos(s.u) * s.ray / 2;
        const y = Math.sin(s.v) * s.ray / 2;
        const front = Math.cos(s.u + Math.PI / 2) + Math.cos(s.v + Math.PI / 2);
        const alpha = 0.5 + front * (s.ray / BALL_RADIUS) * 0.5;
        if (alpha <= 0.05)
          continue;
        ctx.globalAlpha = Math.min(1, alpha) * 0.8;
        circle(ctx, x, y, s.size);
        ctx.fill();
      }
      ctx.restore();
    }
    if (type === BallType.METAL) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      circle(ctx, 0, 0, r * 0.6);
      ctx.stroke();
    }
    shine(ctx, 0, 0, r, 0.75);
  }

  // src/scenes/widgets.js
  var DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  var ButtonGroup = class {
    constructor(buttons = [], onBack = null) {
      this.buttons = buttons;
      this.onBack = onBack;
      this.focus = 0;
      this.lastHover = null;
    }
    get focused() {
      return this.buttons[this.focus];
    }
    hit(p) {
      return this.buttons.findIndex((b) => Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2);
    }
    /** Handles the input of one step. */
    update() {
      const input = app.input;
      const hover = input.hover;
      if (hover && hover !== this.lastHover) {
        this.lastHover = hover;
        const i = this.hit(hover);
        if (i >= 0 && i !== this.focus) {
          this.focus = i;
          app.audio.play("menuMove");
        }
      }
      if (input.pointer) {
        const i = this.hit(input.pointer);
        if (i >= 0) {
          this.focus = i;
          this.trigger();
          return;
        }
      }
      for (const [name, [dx, dy]] of Object.entries(DIRS)) {
        if (input.pressed(name))
          this.move(dx, dy);
      }
      if (input.pressed("confirm"))
        this.trigger();
      else if (input.pressed("back") && this.onBack)
        this.onBack();
    }
    /** Moves the focus to the closest button in the direction (dx, dy). */
    move(dx, dy) {
      const from = this.focused;
      if (!from)
        return;
      let best = -1;
      let bestScore = Infinity;
      this.buttons.forEach((b, i) => {
        const vx = b.x - from.x;
        const vy = b.y - from.y;
        const along = vx * dx + vy * dy;
        if (i === this.focus || along <= 1)
          return;
        const across = Math.abs(vx * dy - vy * dx);
        const score = along + across * 2;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best >= 0) {
        this.focus = best;
        app.audio.play("menuMove");
      }
    }
    trigger() {
      const b = this.focused;
      if (!b || b.enabled === false)
        return;
      app.audio.play("menuEnter");
      b.action();
    }
    render(ctx) {
      this.buttons.forEach((b, i) => b.draw(ctx, i === this.focus));
    }
  };

  // src/data/bitcodec.js
  var ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_";
  var BitReader = class {
    constructor(text2) {
      this.text = text2 || "";
      this.pos = 0;
      this.nbits = 0;
      this.bits = 0;
      this.ended = false;
    }
    /** Reads an unsigned integer of n bits (n <= 18). */
    read(n) {
      while (this.nbits < n) {
        const c = ALPHABET.indexOf(this.text.charAt(this.pos++));
        if (c < 0) {
          this.ended = true;
          return 0;
        }
        this.bits = (this.bits << 6 | c) & 16777215;
        this.nbits += 6;
      }
      this.nbits -= n;
      return this.bits >> this.nbits & (1 << n) - 1;
    }
  };

  // src/data/levels.generated.js
  var levels_generated_default = {
    "tuto": [
      "START=eiIImiOkc8cGVcneyya",
      "DATA=qCjjlcMyWFMmjj6sgva",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=GREEN",
      "DATA=rjPjyGsQiebcq4qKoQWjIeIsFmciXaQmjzTcwtqPL0izCa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBaXCWGxmnfZeHCXCxmCfZirCYyxmRfZmbCZuxm6fZpXC0qxckIGT4PcsDWKOmjkpcsNqKQSj6LcONqHkmhQAa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=BLUE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBGXC4GxoihdGXW40ConfZKHC5iCoxhdLXC5WxoChdOrW6exoMfZPHW6SCoRfZSbC7aCo1hdTrC7Oxo6hdVXW78xpefZXbXcsSWKQKjkFcsLqKOSiQTccPqNk0kkKa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=VIOLET",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bAMi2RoEQ3gkUPkPmkkmIYH4-QwrkRdAR4IRmdkEKsGYgOKFkpNILHYPYEkIOcQkiQ8JG",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=METAL",
      "DATA=ukd6IG-EOqbIqG-KgFg-gXVHnekyqqPmeqUHapG",
      "DATA=ulKIS5iMositKHW5ixoseJKG05iiosaZLYS5CMoxitLXW5CxoxeJLW05CioxaZmcSZaMm1jJnsSZuHmWitmbWZuCm1fZmbCZasm1eJnq0ZanmWcdnqGZudmWa0djHa8yqCgeiPHcKyq7MeqrHcYyrfMerbveisXdMSqzYa",
      "END=qia",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "adv_1": [
      "ITEM=GREEN",
      "DATA=eBmcSXCRcwPyR6w0qHnedqVQcl6mXcQBPHC6exoMhdOrW6SCoRfZQXi6ysoHeJNbi5WxoChdTrW7aCoWeJTri7axo1fZLXC5CCoxeJKHi5ixoshdaYeWmnchOiH4YjAhIwGOR4Ek-cIJdiOWFb6jqQIqa",
      "DATA=yBLYS5CMoxitSce7aMoWkZLXW5iCoshdSbW7uCo6hdJrWiCBI-M7LXC7axcwKyR5gIehOMb4JkwlMLWtiKeYXdyIq2ldIaG4GdodaZGWG78io_aZXaG8qda",
      "DATA=KiLQwjgGIrJiLOEk-hI0JiTkck-LIJkOOWkjAwIVLQhO0IIniEOskkeiYwI6fRGWm4miodjJGYS8qMpekZXaG8qdccOiGOYmomJdiia",
      "ITEM=BLUE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=flLWm5idonaZIam4mdodcdGXW4mxodeJGW04mHodkZGYy4GRonkZKIS5CRoCkZOsS6yRoRkZScS7uRo6kZVYS8qRpejJXce8qnpecdXam7udoWaZUGm78dqjcucsDeaNracsVbaRyukmgALYqPUskIfsP5cQkgQ1O6QkkRkiQSMAKbqPUAQwccJa2a",
      "DATA=rBVYS7uRo1jJUIy78MpekZXcy7udo1cdTq07uso1fZUHC7Oso6dtUGG7OdddLOVOYmocXablUISWmHmiitdseWmnmxdteIeXCHmxfZfXiWGnoxjJLYS5iRosjJJsy4GModjJJsS4GRodkZScy7aRoWfZSbi7anoWcdSam4mdoicdIam4micGOiPzAkcmIQPyM5gkQhcBPyQPAjAhSxhaa",
      "DATA=fBLWG5CdoWcdSam5CRoxjJLYe7aHoWjJScTPWHAHiwPIfQSHoscdKGm4GdodaZGWG4GioncdJqm7uio1aZUGm7Oio_cdVWm8qipeaWGQcjgGI0OiW6daAPWlQCekNdIPW9QCqQMiOuc8LebPdekqIJfeh5RcspcVJiLOZcMAG",
      "DATA=uofYfHCCyxeMfW1HCimsaZdqmWmdmiaZaYSWGRmnkZeITHCMmHkZjISYSRmWkZnsSZORm_kZkWmYedmMaZmamZudm6aZpWm5WioHcdPGG7aioRcdTqG7Oio_cdNcy6eMoMjJQYy7aMo1jJUIy78McwLOM5AjgwImKyJjUkcBIGKyW6wmohXflerqqXWdmxaZfYSXWRa",
      "DATA=ulGYe4GHonitLYe5iHoCitOse6yHoRitUIe78HpeitTse7aHoddtIa040nosdtLW06enoCdtPG06SnoWdtTq07Ono_dtXa08qio_cdUGG7uioWcdQWG6yioHcdNaG5iioncdIaG4miodaZIam5CdoxcdKGm40doCaZOqm6SdoMaZSam78dpeaZUGm7udpejJXcS78Mo_kZUIS7OMo1jJTsS7aMoRjJScS6yMoRkZPIS6eRoHkZOsy5WMoCkZLYy5CRoskZKIy40MonkZIcS4GModjJGYTaqyqjgedHHbmyqygehrHciyqNgelbHdeyq2geoXHeayrfMaa",
      "DATA=ulGYe4GModjJGYS4GRonkZUIS78RpekZQYS6yRoCkZJse4GHo6itVYe8qHpejJVYy4mnondtIa04mdodcdIaG5CdoxcdNam6ydoRaZUG078npecdXam78do6aZVWG8qnoHaZOsS7aMoWkZSaG7adoHfZPHC5WxoRfZOri6ysoHhdPHW5CRoxjJKIy7uMo1cdKGG40donaZIam7uRo6jJKIS40MoncdKGm7udo6cejqVcsLqyh8gbddeqWXN8k6pb4JWEdmk4Zbmyq2gaM5UkQBIQKyM5ga",
      "DATA=ulGW040noidtKG06eno1dtVW08qno6dtQW06ynoxdtNa07anpecdUGG78do6aZSam6SdoMaZOqm5WdoxaZIam4GdodaZGWG4GioscdKGm40doCcdPGG7aio1aZXam4mRodjJIcS4GMonkZKIy5iRoxkZNcy5WRonitGYe4GHositOse5CHoCitOse6yHoMjJOsS6yRoRitQYS7aRoWjJSce7uRo6kZVYS8qRpejJUIe7uHo_itXce7OMc-PyVOEJuMi1caQQwkQhOHjIiqGjALIwH7Jsy40iqjgedHHbmyqygehrHciyqNgelbHdgyq2geoXHeayrfgebbGa",
      "END=qia",
      "ITEM=VIOLET",
      "DATA=bBLWm5CioxdtLXi5CxoxhdLYe5CMoxkZSam7aioWdtSbi7aCoWfZSce7aRoWjJKIS5iHosfZKG05idoscdKIy5iCoseJJqm40xonitJsS4GRodkZGYy4GMonjJIce4mHodhdIbW40CoieJGXC4msoifZJri4mnodcdIam4mdo1aZTqG7OdpecdXam78dpedtXbi78so6eJTrC7Oxo_fZXbC8qCo_hdUHW7uCo1dtTri7uHo1jJTsS7OMo6itVYe78Mo_kZUIS8qRpejJXcetQiKiIiQOOjUkqKQKjktcsFWKMSjjxcsqWKI8jiAa",
      "DATA=bFeAxZsLImOiH5UikwI5OiVPUmowUxcdLW05CsoxfZNa05WsoCfZNbW6SnoReJQXC6SCoWfZSbi7anoWcdLWm7adiiccpWG5idonaZIam4mdo1aZUGm78dpea0dG5dSoa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bAOPyPSGQQikTbyPgwkIH4JiYiYcI5GOUyYa",
      "DATA=fEra1J8ny_iwrcelMGI5JlJq040sonfZJrW40HoCitLYe5iHoMitOse6SCoRfZQXi6enoCdtLW05inoMdtPHi6esoHhdOrC6yxoMhfLHykQGIQJlUHW7Oxo6eMJszO0RAncgJqniAPYgPmHP_iAAYgLKHPfiAmsgHSm5_doqWZMaa",
      "DATA=vlha0YenmMdtkW0ZasmWfZmbWZaCmRitjIeYeHmCivOPy6SsoRfZQXWZaHmWdqa",
      "DATA=ulGYe4GHoijJIcS4mModkZGW04GnoicdIam4mdodcdLW05inoseJKHW5iCosfZKIe5CHoxhdLXi5CxoMaZPGm6edoHcdOq06ynoMcdOse6eRoHjJPIe6yMoMkZSa07asoWfZSbW7aHo1dtTri7uxo1hdTse78io_aZXam8qio_jJVYS8qRpejKfANdogQtbkSAGa",
      "ITEM=SMALLTIME",
      "NONE",
      "NONE",
      "NONE",
      "START=fofXjHCxyxhgfYfHCMyWeMmbDJaCyWiwmczJaRyxk1OQFPCiAxa2SanRaiyHeMjHjHWsyReJLW05WnoHdtPG07anoRdqa",
      "DATA=vyLOEjAGIVPyR4ZPCMAxk2SaHRadoCfZOrC6yxoRfZPHi6esoHhdPHWjSCcReqQXWjSra",
      "DATA=uiLQck-GIwJiR4Y5WnoHdtQW06ynoCitOse6yHoRitVYe8qHo_dtXa04GnoddtGYe4GHcmOiJiYlMmI5OmbQPaAgXcHSqYOQkwa",
      "DATA=uleISXiMmsdteGmXiimsitfYeXWHmHitfW0XWnmHdwirjIexyHhdVW07Ono6itVYe7ORo_kZUGm78dpeaZXcTQSsARf2QXXRaCAWeMSbC7uno1itQW07anoRitScelsQI0GOQOEkQLWAQCgOAa",
      "DATA=qiNbAk-w2LfGPAckwmG",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=MAP",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "adv_2": [
      "START=ayI4Gjsycmj4U4Iluyc7QecPNeiAqMQqa",
      "DATA=eyHi8jeeI1G4WG0moIc1kOKkSioIMgQXbqsuaOhbbudkHd0MWnc8VyMIAxOHL8jrZcuua",
      "DATA=ulaYeW0HmiiteIeXCHmxjJaW0WGnmndteG0XCnmxcdra0Z8nm6dtnq0ZanmWcdrceZ8Hm1itoIeZaHmWjJirCYeCmMhdjHCYysmHeHqkEuaeKfbjbAGPaxkZL0esPbehW5b0oAPculIJHiPcRcuLG",
      "DATA=unbzKWmsmieJaYeWGHpedtUG078no1dtTri7uxoWfZPHC6SxoHfZNbC5CxosfZKHi5inondtIa04mnuJJ5k46rOoIBcaWywAYjggbKeiDdKhqLHWKYsksPI3jejAzbEIW1Oqa",
      "DATA=qyHyGi0icuIaNaGkoicRcaSOGlOidbIcIi6PGoQNdQUa6Heei2beePdciqWXKmqPeq-HeGOjmQdbQKqSPaa",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bAPrAkumILOyMPFcczqSMqSjEt6gKgjYbOAKgQqreeoIAa",
      "DATA=fzO5KlSMcAMaQPIRKzQkfYOO6QkFIkIXcQutMkWTe0hrnbYHWTOGa",
      "DATA=ulaXiWGsmneJeHiXinmscddqGWGimdcdhaGYeimMcdkWGZuimWcdoGGZ8im_dtpXi0qsmCdthbiXWxmChdhceYeHmRitjIeZaHm1itnrWZuxm1eJoHjkCqYOJSQO5k0osUJ8R5hk4tsRLeQPzkQysQMKQP0QkzQUgzOXoA-uMZdHUq2W0nmddtca1ewoWfblaYeWGHmnitdsyW0RmikZaYSWmMmijGH5WjiwIxkWPQyBwRK7MmfAbcETrakia",
      "ITEM=ORANGE",
      "DATA=flLWm5CioxdtKG040noidtGW04mioicdJqG5iiosaZJqm4GdodaZSam7aioWdtTq07OnpedtVW08qio_cdUGG7uio1aZUGm78dpeaZXce78Ho6itTse7aHoWjJScS7aRo1kZUIS78RpekZXcy78Mo6jJTsy5CHoxjJKIS5CRositKIy40HoiitGYe4mMoijJJsy40RoikZGYSsmwIgfYO6IlsBI_KGPa3cwLqtgmlXHekBG",
      "ITEM=VIOLET",
      "NONE",
      "NONE",
      "DATA=flTsy7OMpedtUG078io_cdVW08qdo_aZXaG7Oio6aZTqm7ado1cdSaG7anodaZKG040noncdJqm4GdoicdGWG4GnoddtLWG5iiosaZLWm5CnoCcdQWG6SnoCdtNbi5CsoseJJri4GsodeJOrC6yxoCfZQXC7uno1eJTrC7uCo1itScy6SMoHjJPIy5WMoxjJLXC5iMonjJIcy7OCo6fZUHi7OHejM4OjikyiqLdSkIaAiHMxNme6laszqNRuLcZmctG",
      "DATA=vBLW05CsoxfZLXW5CHoCitOse6yHoRitSce7aCoWeJSbC7anoWcdQWG6yioHcdNaG5CisIK8Ny7kEyYSNCRi7kEtYIMmNz2AqocJM5csAqEgK9HzpABbkiqsjCoaFdKLa",
      "DATA=uCjAPmozk1imbXMPiHeIL5cWAt0gIxeqTbcAugWLKia",
      "DATA=qBaW0WGnmndteG0XCnmCdtiq0YynmRdtma0Zuxm1hdnseZuMm1kZfYSXCMmxitdseXiHmiitaYeGSPOqbIjayJYgO9fApsrd4pq-h0gWDdqhdcJiWP0jGtcUK0eIOP2IQTQzjbJa0zm1eJnq0a",
      "DATA=eDbQNugeUWkZScy7aHoWhdSbi7axoWdtSaG7adodeJIbi40soseJLXi5WsoHeJPHjaMjWDIAKqEHkRK7jursYlYpq-gWJcQjGRqyOia",
      "ITEM=BLUE",
      "NONE",
      "END=aya",
      "NONE",
      "ITEM=MAP",
      "DATA=bAa4oGonOdL6a6gGoRPePQrjYKssPeImHcFistZfbuXIitqEeqJHKP6BwrcMiqOrCkynWNMmeWJdAmq2QueYuWGRmijJcceWGCmifZcbiWGnmicdcamW0xmsfZfXCXWxmChdhceXWsmCdtkYeYSCmRfZkW0Zaxm1fZoHCYSsm_kZpYyZ8Hm_hdpXCZ8sm_dtpWGZ8da",
      "DATA=fyMGSkolcUcWVral0zc9iORIokqJIzi5i5yiYIImgyJbfb0zWXgCn6xdGmWtdme6yywQggHPWywCoQG",
      "DATA=rmrAZeweWeHmbkXcAyUChdOrW6yCoRhdSbW7asoReJPHi5WsoHeJGW04GnondtGYe4GHonitXce78Ho6itXa078no6duVzKucwIzb4SqAlkNIzPOa",
      "NONE",
      "NONE",
      "DATA=bEaYfGGHyniweIfHCHyCiwisfIyHyRiwmcfJuHy6iwpYfKqHckkaVsGskjKILHMPiASscsGWI4Wi2xIZbaUi4lAyWKQ0frLbIjWUcKmzEa",
      "NONE",
      "NONE",
      "DATA=byMyojYicGI4Pa-kKqIUKiTbclMqISG4SGulEfc9bqWWulMwI5hdGW04GnondubODbghksMcKQwqAEWjLSckPdMmqOObpYAa",
      "DATA=fBNa06enoMdtQW07ano1dtUG07Oso6fZUHW7OHo1itSce6yHoRitOse5WHoxitLXW5CxoxeJLW0AgCMWNjQjlcuyWVMkHqwOuPJdHiWYQiwIIfJubXPcwSqLb0qXQa",
      "DATA=ulaYyWGMmnjJeIyXWMmxjJisyYyMmRjJmcyZuMm6jJpYy0qMmddtca0W0nmsdtfW0XWnmHdtjG0YSnmWdtnq0ZOnm_dtra0G2Si6Q6gIUJkROlbQhOwI4gi9bHeXmsiDKYe5pj3doFWLe8fQhaKvrbLya",
      "ITEM=SMALLTIME",
      "NONE",
      "DATA=bAcWQHOliUIQpqSJAuOVjQpICHkyikPQgYytsCKrhPeq2tslMLcXjbAa",
      "NONE",
      "DATA=ezc6oqUjK4cHocukmpIAMiOYbcsmqKPKLXOkKtcCKONb4kMEcQMmmjOyYAgJHaa",
      "DATA=rAIOQRYjk9jAIAAQoxcxeGLQeleGcYerpbCqOxMfHzHkQCmRhdHuhHPcUAW_eCpQfaUHYmeWa",
      "DATA=bDi4oXWdmCcdkWmYSimRdtkXiYSxmRhdkYeYSMmRk1qsMtsNVehdUHW78Co1hboOXeofq3LSnaCGWkilQedrpa0IMlMOa",
      "NONE",
      "NONE",
      "DATA=eyLkQjKMcDiyOz0kyyIRfiSbclsmI6daWaXaWlWmQHczGucOe4kbmcHdqGrdObMPca",
      "DATA=riUiYi6ncoPyPjMjAzceHiHkQmmedcQySrMlOJqLQCqzNaGAWLdmlrRb-AIBkOQYQmksJdhOa",
      "DATA=eBUGm7Ono6fZUIe7ORoWjJSbW7asoWcdPGG5WiosaZKG05ixositJsS4GHoifZIa04GdodjJGYTaMTqee8nOuscrWJhaOAia",
      "DATA=rAa6UGIROea6cioJ-dPeG6rkUJ-RK3i5oaKq4ieni5NjEAgxMML5Q5ElCxIof0fHLdiyXdgubXLcumWLPya",
      "ITEM=RADAR",
      "DATA=bBaYeWGHmniteIeXCHmCitiseYyHmRitmceZuHm_itoIfbOQq5QtrbCZ8xm6fZnrCZaxmRfZjHCXWxmHfZfXCXixmnfZcbCWmnmidtdq0XinmCdtfW0YenmMdtkW0Zanm6dtnq0Z8nqNK8jX2lOdcTb4MaoiKhYeIrdYEl-RcKjOa",
      "NONE",
      "NONE",
      "DATA=bEaYfGGHyniweIfHCHyCiwisfISHyWiwnsfJOHy_iwjIfKqHwiQepIPOmsAieMJrjPisAxeMNbjQesAMeMQXjRasA1eMUHjR8sBeeKczUCiBhcQnUHRcmCqmJepG0kikMfc5WOXywea",
      "NONE",
      "ITEM=KEY",
      "ITEM=GREEN",
      "NONE",
      "DATA=fiI6uiSlc_cGPcwkokKJfPc5AtGwdaPCgOZdgzqzQKrjMa",
      "DATA=ulOqm6eioHdtOri6exoHhdOse6eMoHkWJiqiWQQwJILYgRyxM-czVYyk0fcTkmmcfdonWsI8eYWa",
      "DATA=ukIIoOYxQncsNyOQUlQ8JAUHSPAsQJfcSjwQGDMBM5SP8PyIgMkQOsmRAPM2bHL4sa",
      "DATA=rjiW0smHKvLPl5FcuAqTK8hjlc8IqAOYbcSGqejeG6rkUa",
      "NONE"
    ],
    "adv_3": [
      "END=aya",
      "ITEM=SMALLTIME",
      "DATA=Koma1JasyWf2mbXJaHyRiwjIfHWHyHiwfYfHCCyxf2fXjHCnyCdwjG1IenyRduOHHkCysNe0OHnkiDsNhuNr1j0ysDe0RbnkWysShteIeW0HmiitaYeWmnmidtdq0Xinm1dtoG0Z8nnedtnseZ8Hm6itrcea",
      "DATA=uzizuj4pcOJWO4MjMvITLJJri40xonhdJse40MonkZUHi7Oxo6hdUIe7OMo6k0qYPaAQcmGOUyka",
      "DATA=qlLWG5CdoxeJNbi6esoHdtOqG6yioMdtQW07ano1dwLXDPCCoxitNce6eHoHjJOsS7uso1fZTrW7uHoWitQYe7Ono_dtVXC8qxoWaZTqm7Odo_aZXankCtsSe0SrnleysSgePXHkCDsShuSr0XWMmCkZfYyXidmscdeIyScOa",
      "NONE",
      "NONE",
      "NONE",
      "DATA=fBfXiXWsmWeJjHiYesmWeJkXi5CCoChdOrW6SCoMhdSbWZusm1dtnqGZOim_cdraG7uHo1hdTsy7OMo_jJXcy5iConhdeHiW0skhfKdPHaqyqygeiHHcWyqedKbaraqIWelcJaoOWkW2gaQQwjULG",
      "DATA=qBmcSZaMmWitmbWZaxmWeJaW0WGnmndtfW0XinoiitJse4GMoikZJsS5iRositGYe4mModk0dICjAQIwOiM4Yk-mUWcdSam5WioCaYpWmJ8io1dtUG078npeduHOBiUgYqHQVcblIQs9QKWQPlSStalgJrjO0xAnhaa",
      "DATA=enOPyk-rIRdiM4YjArIwM4M6ckQGIVM4a",
      "DATA=vBOri6exoHhdPHW6yxoMeJQXi6SxoRhdNbW5WxoCeGKyElshI0PqKAwa",
      "DATA=qBdq0W0smnfZdrWW0HcBOiM4Zb0tqDhunGLdyNc0OiTiYlsrI0M7UHi78speeJUHW78CpehdXbDeayo6itUIy7ORo_kZXcS8qMo_jJVYe8qHo6dtUGG78do_cdVW08qipeaZXa07Oda",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBKHi5ixoshdTri7uxo1hdTq05inositTsejgLIrH4TiElsLUnfZUHCqove_Lucq5eaokINGLPAk-wIAeGQ5ij2nIOdCjjya",
      "DATA=fBTrC6SxoWfZoHCZOCm6eJPHC6exoCfZLXCXismsfZeHW5iRoscdKGm5iMcmM4Jjha4ygdjHGWGZadmWcdmcyZaRmHhdiseYesmHdtoIeZOnmHcdiszbQGqAKoPIzQSMyMcgkWGa",
      "DATA=umiG5ciIcBOiM4YYSHmRjJkYSYSnmRcdkWm7aio1cdTq07anoWitScy7uMo1itScS7uRoWaZTqml6hI-PyH4EiErIhM4H6wa",
      "START=rBdq0XinmscdnqGZunm6dtdseXiHmsjJnsyZuHm6iqa",
      "ITEM=MAP",
      "NONE",
      "NONE",
      "ITEM=BLUE",
      "DATA=bFnkxXgLUsfZLXC5WxoMfZOrC6SxoWfZTrC7uCo1itTsS5iCositKISXism1eJoHiZOxmneJdrDa4Sq7laJiklMcWocuoWLGGsydeMpXjKqsAxhgNbXQyCAHhgQXXRaCqKPWOW-kmkqDdKla4ymRhekWa",
      "DATA=fiR4kkwmIBLGKAciEQQmjsObeQOhc5GOTiYk-wIQOiPAQRgrkNPsRjS4GnoicdJqHaqeo6jJVYy78Hrflia",
      "ITEM=VIOLET",
      "DATA=fiLOEjArIzg4OkckQGI0iiVQc40doncdJq040sonfZJrW40HosjJLYy5WRoHkZQYS6yRoWkZTsS7ORo_kZXcS5CRonjJKIS40RoikZIcy4GCoieJIa04GdodaZGWG4mxodkZGYy4mnodeJGXW4mHoiitIbC4Gio_aZXam8qio_cdXa07Odo1aZSam7Oio_dtUG07uioWcdTq05WMoshdKIe5CHosfZOsya",
      "DATA=uyOrgIoxcMgWNi2kMFIViiLWUlsGcrJiT5Ui4rcnLOUjzbGwqWMGa",
      "DATA=uBKIS5iMositNce5CHoRitSce7uHo6jJUIS7uRo1jJJsy40RoWjJLYyYeCmHeJjGGYenmHcdjHCYysmMheiHJcCoqLkBOse6yHosaZKGG7uio1aXqikqkda",
      "DATA=ujfiSs4FcwLOR5A40CoshdLXW5CHoxjJLYTPiHAsjMKITO0HqXkKf4BaCPWlQAo4ReseXaIbVkoa",
      "DATA=rlGYe4GHonitKIe5iCosfZKHi5CsoCeJNbC5WHoChdOse6yHoMhdPHC6ysoMdtPGG6eioCcdLWG5iioncdIaG4GnoieJIbDciDqygdGYS4GRonkZKIS5CRoCkZOsS6yRoRkZScS7aMoWitSbW7axoWeJSa07aioWaZTqG7uno1eJTrC7uCo1itTsy7OHo6hdUHC7Oso6dtVXDmkgZdkCTQXlyetfgaVPUl6rG",
      "DATA=fErcfJ8Ho1eJTse7uCo1fZTsy7uRoWkZUIy7ORo6itUHW7Oxo6eJSbC7aCoxkZKIy5iRoskZJsy40RixjImcyAoMgxirSce5iHoshdLXW5CxyCeMirjIysyReJKHC5isonitJrW40xoneMccfGmHcBM4QPUjArIVKCHQNiuOsikeIcTiuRtcQCWsHmqOtek0WsSiYmI5JiOWEa",
      "DATA=ukeGmJudiskYnsS4mHoiitJse5iHoxitNce6eHoRitPIe7uHoWitUIe78HpeitVW08qno6dtTq07anoMdtQW06enoCdtLW05inondtIa04mnqte0nH1b2AWSfCjjHbGxqXMtGYy4GMonjJKIy5CMoMjJQYy7uMo_jJXcy7OMoWjJOsy5WMoxkZNcS6yRoWkZQYS6eRonkZIcS4mRo6kZVYS8qRpecdXam78do_cdUGG7Odo1cdSaG7adoRaZQWG6yioMaZOqm6eioCcdNam5CdoxcdKGG40ionaZIam4GiodcdGWma",
      "DATA=ulTri7uxo1hdfYeYeHmCitjIeYSHmWitnseXCnmCdtiq0YynmRdtma0ZunmsdteIe5isosfZKHWiYGIrPyJiYjghI0H4UyYlMGI0PyM6QkQQIBGOQOlaKyraMcOPya",
      "DATA=uBra0Z8nm6dtrceZ8Hm6itaW0WGnmndtaYeWGHmniteIeXinm1dtnseRqzQ0eROq06esoHfZOrW6eHoMitPHW6yxoMeJPG1eayqAQClQNc8gWAHSlXGPIGqjgegPG4mModkZIcy40RonjJIcS5iRosjJKGG40ioicdIam4mdodcdKGm40do6aZTqm7uio_cdUGG78dpecdXam7uMo1kZUIS7OMo_jJVYS8qMpekWa",
      "DATA=vEfYTHCMyxiwra1J8ny6dwhbXIexyMeMkW1Jany1duc6NbcPUsitJse4GHoditGYy4mRoshdLXW5CxoCfZNbi6esoHdtPG1yCwoncdIaG4mioscaa",
      "DATA=vyLOYlamIJfULWHQeiACcgPGHQSiAWcaLOkk-cIwQOLQck-GIVQUfYzHWMyHjMkYzIyMyWjKgPHc6yoijJIaG78io_jKbcXaqeXfbersYa",
      "DATA=uiJiZbmtc5JmnHmAqxgKePPbXbQyqUMenH1bmDcmOiUAckmQIJG0jqNcsNodaZGYS8qRpeaZVWm7Odo_kZUIS40RoikZIam40da",
      "DATA=qnOXzXCm8VJpmcfXCHG",
      "ITEM=GREEN",
      "DATA=uBmamZaimRdtjHiXWxmRcdhbWYexmHeJnqmYynmxfZhbiXWnmxaZeGmXWdmCcdiq0YedmHcdjGGYydmRaZeHiXCsyxhgfYzHCRmsfZeHXHCHstdKMa5jGjYtcCLyUa",
      "DATA=ulXce78Ho6itSce7uHoRitOse6yHoCitKIe40HoiitGYe5CHoddtJq04GnosdtLW05WnoHdtPG07anoWdtQW07uno_dtUG08qnqgHSdaBbegWgQCc6NbcPW4QCpINemPW4HSpGBeogUxaZLWG5CMoxkZSaG7adoWjJScS5isosfZKHW7uso1fZTrXbQyqFM0h5tcOBqQfmlXHcsykCbcOOqQKea",
      "DATA=vBfWmXCimxdtfXCXCsmxitfXWXCRmxjJmcSZaMmWitmbWZaxmWeJma0ZaimWa1ozBqYwG",
      "DATA=rELWnPCnAxcgLXDPCsAxhgLYfPCRAxjGUzAlswIVLOVPAkQwILLOQbSkGscRdyQ58iEhIhPCiHGa",
      "ITEM=ORANGE",
      "NONE",
      "NONE",
      "ITEM=METAL",
      "DATA=vBdqmW0imndteG0XCsmseJhbiZusm1dtnqGZudmReJmbiZOdm6dtoGGXiimsaZOqG6enoHeJPHi6ynoMcebOBekgS1jJnsSXiRmsjJdsSW0MmsitfYeXWHmRitmceZuHm6jJoISXCnmCdtkW0ZanmniteHWXCCmChdkXWZaCm1hdoIe6eCoHitPIe6yCoHjJPIzc6gWAHSgQNc6PWgQKqYOOCwk-fGa",
      "DATA=uiLOYjALIGM4OqkiYrImGOJkcjAwIGQOQPgkQhIQOiTkQlsBI0JiVOkl6rI-PCqb1dyeqIdKlcXbGSqocqa",
      "DATA=vBfYSXCMmxitfXWXCsmxfZfW0XCimxaZmamZaimWdtmbiZaxmWhdmceZaMmWk1pavqOOoditIce40HositTse7OHo_itXcflIPY-kCW6M5inondtIa04mno1dtUG078npeduHOBiUgYrbOa",
      "DATA=vELWnPCiAxdwLXjPCxAxhgLYfPCMAxkWR5gk-wIVM4R6ck-LIRiWTcmlGGcMOaR4YiEhIhPCmsWa",
      "DATA=uiKyYjqrIwLOM6cjKBIQOiRrUk-wIYeyTiYj4LIOjBKGG5CioCcdQWG7aio1cdTqm7adosaZLWnb0eqSbcrcSGmRoncdJqm7Oio6aZVWG4GiqjbeqaqAoxa",
      "ITEM=RADAR",
      "NONE",
      "NONE",
      "DATA=flJqm40iondtJri40xonhdJsy40HonkZKIS5CRoCkZOsS6yRoRkZTsS7aRo6kZVYS7OdpeaZVWm8qRoikZGYS4GModjJGYe4GHodhdGXi4miodaZIam4GioidtIbi4GCoifZGXC4mnqDiKgb1bGtqycumqLdyoqNiKmsjdUIcwOiLPAjAmIVJiUyYlsGIQOiOkca",
      "DATA=ulfW0YenmWitkYeYyHmHitirWYynmMeJirCYyxqIe2LYfPWHAxjMLYTISnyWdwmaHJadcwGOR6QXWnqNhqH6wl6hYeReXqqa",
      "DATA=vlfWGXCdmxdtfXiXCxmxhdfYeXCMmxkZmcSZaMmWhdmceZaxmWeJma0ZaimWaZXa08qHoddtGYel6mI-OiH6ciEm1bknbsJemgWgHTOQwa",
      "DATA=vjiz8sgqoxeJLXC5CCoxitLYS5CMoWkZScy7aHoWhdSbC7asiskYnsSXiMmsiteHWXixmseJnriZuxm1hdnseZuMcrJiTiZcsQqKMOGQQmoQG",
      "DATA=qnPrAPSwkBhsMW8P0iQDO7UG07Oso6fZUHW7OHo_itVYy8qMpekZVW078ipecdXam8qnpeeJXbC8qHpehdVXW78xo_eJGWG4mdoiaZJqm4mnoditGYy4mRoikZJsSjgQIrGOa",
      "NONE",
      "NONE"
    ],
    "adv_4": [
      "ITEM=ORANGE",
      "DATA=qRLYS5iRonkZIcS4mRoWkZTsS7ORpekZVYS5CMosjJJsy4GModjJSce7aMoWhdSbC7asosdtSa06enoHdtPG05WnoxdtIa040noddtGWG4mdpejJTsy7uxo1dtTri7uCo6jJVYy78Ho1itUIe8qCpeitXbC78xo6fZVXW7Ono_eJXa078no6eJXbi4GioiaZJqm40ioscdKGm5CioCcdLWm5WdoHcdPGm6edoRdtQWG6yioRaZTqG7aioWaZTqm7Odo6cdVWG78dpeaZXaG4mHoiitJse5iHoxitUHWa",
      "NONE",
      "DATA=eRScS7aMoWitSbW6SCoMhdNbW6eCoxhdLYey2MMnKRVW07Ono1dtSa07asoWfZTse7OHo_itXce5WHoHitPIe6SHo1hdTrC7uso1kZTsy7OMo_jJXcy8qRo_kZUIS6yxoHfZNbC5CxoRfZQXi6SnoRcdSaG7uioxjJLYS8qngsNjIjYyosMxJzJyIAgiMxG5HcUa",
      "ITEM=BIGTIME",
      "DATA=eBXce7OHo_itTse7aHoWjJScS8qno_dtUG06SnoWdtTq06ynoHdtNa05CnoxeJLXW5CHoxjJLYTaMNIda4KGGkedcRceq4CludcihcJYIa",
      "DATA=qAKAMRsPUshdLXW5WCoMhdSbW6SCo1hdTqG6SioWcdPGG6eioCcdLWG5iik6G8nOtcYeXbbkKAeSivQlH6LPgRqnQlM0dcFemQqLjCiOs6eCa",
      "NONE",
      "ITEM=VIOLET",
      "DATA=wlOri6ysoRhdSbW7axoWeJNbi5CsoxfZLXW5CMoxitNcy6yMoHjJQYy7aMoWdtSaG6SioMcdOqG5WioxcdKGG40iondtJri40xonhdJse40MonkZTsy7OMo6itUHW7Oxo6eJUG07Oio6aZVW08qnpecdVWG78dpeaZIcS4mRodjJIcy4GHoditPHW6eCa",
      "DATA=uiTrCluCcWiqPIyXWHmCjJhcSXWCqIORfXWXiCmnhceQAiGMqoP6JiYPMmQGdkPOY40dosaZLWm5WdoHaZPGm6Sdo6aZSam7udpeaZVWm4GdqeHjVAteuSJecaVWGlOic1ceMkljISQtdia",
      "DATA=sBaYeXiHmnitcceXCHmxjJfYSWmnmidtdq0Xinmxdtha0YenmMdtkW0ZanmWeJmbCZaCmWitmcyZaRkChcQrka",
      "START=ayLW0lanmHitjIeXCHmWitnseXiHmnhddrCXWHmRitoHWZOxcdfWXbCZOHmniqa",
      "DATA=bBLWm5CsoxfZLXW5CRoWaZSbi7aCoWfZScS7uxpefZKHC4mxoCfZQXCGodPeG6rkUGoRW-jCpGXaWmqmjsOYmXismshdnrWZusa",
      "DATA=bAOYmQmzkJdXLsqzuAgvebSXaBmAgZjcVjKOOzqDfKhsbc6wqViaG5aiKqdeeaVPbauxXfMcJGqRGeqhb0qWDaCQrdkGa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bALQwQ-LQwH6SaEOEhQhPAVQwR6hInfWUHClaCcxhaOsekyHdeeGGXjbeGW5imgjxdgvWGI8kyVbehq5HWa",
      "DATA=byLWGjCsIxhaLYAlcicWKGSbYlaLWLdejsxcuza",
      "ITEM=BLUE",
      "DATA=bANksQmKQPPkKkMPUwQqhkOaORKykgKIV4MPyeQOeQSPwQ6qk1kzRjMy4KgoeHTaAACng5jmjGJcuGqhN4a",
      "NONE",
      "ITEM=GREEN",
      "DATA=ukOWoQmkkJkAOYmiMJiZecmX6i8pIejWIq-impWhIudkQzwqWwkOa",
      "DATA=ulOqm6eioHdtOsS6eMoHitPIS6yMoMcdPGm6ynoMitOrW6yCoMeJOri5CCoshdLXi5isiCNkhjk5CnoCdtLYe5WHositKG06SnoRhdQYei0icnjJSce7aCoWeJSa0lunc1eGTrWluHodaZGWG4mRodjKcytaMSSscdfWGXCMmsjJhaGXWMa",
      "DATA=vkQOYQmokBJmjqC4mMoijJJsy5iMoxjJNcy6eMoMjJQYy7uMo6jJScy78MpejJfYeXWHmHitjIeYSHmWiteIeZuHmnitGYS8qRm6iuNAZkkSYNRmRkYi0xc6f0biNewjIicaVWHlgSYyRia",
      "DATA=vBcceW0HmsitfYyXWMmMjJisyYSMmWjJnseZ8Hm6itpYy0qMmijJaYyG2MO6PRnsyXiMgxOzSkgjCxcWfWIaGl8iqeHmrysjCncWdqa",
      "DATA=ulha0XWsmCfZhbWXWHmRitkXWYSxmReJkW1ckDWNNzPcgjCHcWiqUHil8HcfbGKHsjePcdPiO4va4iqTHKoWZdQJqLQKXsZmueG",
      "DATA=vAWsISefkeHsHsI6ysoHeJNbi5WCoHhdQXi6SCoWhdSbC5CsoxfZLXW6exoWeIhjEIUxUMhdPHCa",
      "ITEM=MAP",
      "NONE",
      "NONE",
      "DATA=aBdqGW0nmneJdrCXiimxdtfWGXCCmChdirWYSCmRitkYyYyMmMdtma0YSnm1dtoG0ZOsm6fZnrDkEIY2K8K46uaNSMhaa",
      "NONE",
      "DATA=bBfWmXCimxdtha0YenmMdtkW0ZadmWcdma0YesmMeJKGm5iioseJKG05CsoCeJNbC5WCoRfZQXW6SsoWeJTri7uno1cdTqm5WHoCjJLYy6SHoRjJScy7uMosjJiseYeMmMjJjIeYyCmMfZirCYeCqXMmgjIi0Cc6hcH4ZaMhraHWGXCmqxcikWVYTewSWeRia",
      "NONE",
      "DATA=fBXa078no1dtUG07ano1eJTrC7uCoWhdQXW4mCoihdPHW7axoifZGXC40xoxfZKHC6SxoHfZPHC5WxoWeJLXi4GsodeJJri5isoCeJOri6ysoReJQW06ynoHdtNa05CnosdtIa04mnondtTqG7Oio_cdXaG7udo6aZXam78doWcdSam6eCoChdKHW40CoxhaUHjaChqrb0gWCiQMqgj4Tsyl8Ma",
      "ITEM=RADAR",
      "NONE",
      "NONE",
      "DATA=fBmcSXCRneitra0XCdmWaZaW0WmHoxeJLXC5CCoxitOse5WHoMitSce6SHoWhdSbC7asoMdtOq05WnoxdtSa06SncCeGNbWkSCcReIa4oGoRPeQ6ripAkwa",
      "DATA=ulXa078noWdtTq08qHo6itVYe7aHo1itPIe6ysoMdtOq05WnoxdtKG05isosfZKHW5iHoxitNce6eHoHkZOqG7udo1cdXaG8qdoCkZLYS5iRoditJse4mnondtJqm40ioscdKGm6SHoHjJQW07OnoidtIce7uMo6jKkIRemQW-bZJri40xonhdLXi5CxoxhebYRaChoMcdOri5CioxaZQWG6SsoHfZQXC6yxqDHmhzoluxc_fWa",
      "DATA=vyNcykUMcCcaKG0jiHc1iqTq0kSicniqJq0lOnc6iqScSjCRcWaWLWmkoxodaZGWG4Gdo_aZXam8qio_kZXcS8qModjJGYS4GRraP8qiNaMjWjP4a",
      "DATA=ukf42HEHQIQAmkgJcnSidtdq0ZOnmsdtnq0Z8nnedsWqw0qHm_itoIeZuHmsitdseWGHrdkJaW0WmHqhkSbWCjiicsjGTsyluia",
      "DATA=rBLXi5CxoxhdLYe5CnoxcdKG05isosfZKHW40sonfZKIe5CMonhdNa05WHoRitOse6yHoWitNcy6eMoMjJOq06ynoCcdOqG5WsoChdQW07ano1dtTse7OHo6dtPGG6SioRjKhzIkyxkeksHaqluRc1aWVWGl8McWhaSbia",
      "NONE",
      "NONE",
      "NONE",
      "DATA=fiM4YkcmILJiQOY7uHoWitUIe78HpeitNcS6SRoCeJNbC6SxoReLOPi4mHoiitKIe40HonjJKIy5CMoxitScy7uMo6jKbcZaKSXalmrsY40RoskZLYS7uRo6kZScS5WCoRhdNce6SHoCjJQYyZasmWfZmbWXCsmxfZfXXPCnAxcgLWnRadAWcgSa1GGMydjMpYzKqMa",
      "ITEM=RED",
      "DATA=bBLWm5CioxdtLXi5CxoxhdLYe5CMoxkZJsS40MonitJrW40xoneJJq040ionaZKGm5inoseJKHW5iHoskZKIy5ixoscdSam7udo6aZTqG7aioWkZScy7aCoWfZSa07aso1jJTsS7ORo6jJUIe7OCo6fZUHi7Ono6cdTq07uso1fZTrW7uHqeICbjpasDWeP8rAFewDXfK8ryM78io_eJVXW78MoijJIbW4GsoicdNaG5WsoChdNcy6SMoRhdQXi6SioWiqa",
      "NONE",
      "DATA=fjpbylYlc8O4P44iYyIyQaR6KkezcocaIjkiMOcVgHfW4IAJjckAqGvbqIqNRmni5aClqIcubQtkUzYwg8T4zlUSa",
      "ITEM=SMALLTIME",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "END=_4a",
      "NONE",
      "NONE",
      "NONE"
    ],
    "adv_5": [
      "ITEM=BIGTIME",
      "DATA=qyPHDckDU1aZUGm78dpeaZXaG8qnpeitXcy8qMpekZVYS7ORpeeJXbW7uRo1jHTzE7uiqIKYRsJbAhqwkHG6UyodQeOkNyuiYGIBOiM4YiYmXfMeqaLeaNa",
      "DATA=eyKIyjiCcseKe6lboyUCeJNbC5WHoWitSbW7axoWeJNa05WioCaZSa1d4he7i7Ncy6eMoMjJScy6SnoMdtPHi6yCqtJOKGHboTodkZGYy4mHodhdGXC4msoddtGWG4mdiia0lbklMmI-JlQYy5WCoMfWa",
      "DATA=uSiP3cktmxhdeHiXiCmnfZdrWW0sm6hdoHCZOsm6dtoGGZuim6itoIyZuMmWjJkYyZaimRccS5-GodOdQ7fXjbmyq2gbOseAexgHdsS40a",
      "DATA=uBScS7aMoWitSbW7axoWeJSa07aioWa1bsI4mHoiitKIeXiMmskZJsesaFUshdKHC5isoxeJNbjjIyIhH4PyFaqjqjbelaLcCec8eyVbVtUh27PCMPBjAAG",
      "DATA=uiVPgl6BI0OiTiZYqQ4HiwKIfPCHACiwOsfQyHARixpIRZ8dCDLVjqnWoHCdJESanRaiyWjMmcTJaHysdwha1HWnyxdwiq1ISnyRdwjG1Rana",
      "DATA=ulIa040noxdtLW05inoCdtOq06ynoRdtSa07uno6dtVW0iEhIrGOM4EkwcIVH4UykrmyeXgeebtdKuWBLmlHs6ysoMfZPHW6yHoMjJPIS6eRoHjJOse6eCoHfZOrjrKOuTkcMkaRmOA_k2VYzR8HA_hgVXDR8sAik2IczOGHAihgIbDOGsa",
      "DATA=qBjIeYeHmCcdfWGXiimsdtkWGZuimWcdnq0ZusmseJdq0WGnm_dtoG0XWMmRjJfYSZaRm1fZfYyZaMmRithceXixmshdfXWXWCmHcdjGGYSCmWhdnrW6enoHeJOrC6yxoMeJPG06SnoWdtSbi7axoRfZNbC5CxoxeJLW05WniCeIkXjciDqNhtKGm5CdoWaZTqnj0esIbePWrkUeqlHSpyBdcIqyiGa",
      "DATA=eEScfQSHAMiwOsfPWHoditIce40HonjJJsS5CMoxitLXW5CxosfZJrC4GxeIIChzncYtqSHmhysZOnm_dtra07Oio_cdXaHmweZaHmU4sjgrIrGOIyOlsGI0PyTkQGmMiijIccSGmRa",
      "DATA=vBScS7aMo6fZUHiQwnk5QQUzWCqKheIYUySRMekUfIPAcBciUnaZJqG40nktdlJsS40MonirNPEPmGMnL6OaEPEMqtQej4LdyyqjQeIAZyufIhOia",
      "DATA=rBaYeWGHmniteIeXCHugkoLYzPCRnedtpW0ZOnmWdtnq1JaiyWa1qyxa8OqpleeQPdGhq7Iuo4u7ORo6jJUHiBcCU6irSjERMzondtJri40xonhbL4ozEiG",
      "DATA=cRhbiYSsmRfZjHWYeCmCithcyYeMmMjJkYyZusm1fZnrWZuHm1jJeHCXiCmsiteIyZunmseJeG0YenmMdtdq0ZOninKQoPlksvsIK8PPBkAtYILOa",
      "DATA=bBfWmXCimxdtfXiXCxoxkZScTcuQe7IJLYy7aMc0LOW5BaAmqlJeeiWOMrMdaXKGmGGRi_k0qOy5WnoHdtQW06ynoRhdOrW5WCoCfZNbi6SsoRfZfXXkgyYHLCOzlkEyYNLCP5lkssYKLCPjI6yCa",
      "ITEM=VIOLET",
      "DATA=eBJqG40doiaZIaG4miodaZLWm5CioCcdOqG6edoCaZSaG7uio1aZSam6SiAMfYhbCJaxosjJLYy5WMoHjJQYy6yMoWjJTsy7OMo_jJVW078iondtIa04mnoscdKGm7adoRaZPGG6ydo6cdUGm78dpeaZXaG8qnqjgaGQc78HonjJJsfSqHyiiwfXDHCsyCeMirjIexyHhghbXHCCyMf2kXDISsyRhgmbXJuCy1f2nrjJasy6f2UHXROHAWiwTsfQSHAMiwPHXQeHACiwKIfPCHAshgKHjPinACdwLW1QenAMeMPG1RanA1dwUG1ROsARdweHCa",
      "DATA=rBLYS5CdcmQOJikjgmIrOkOiCQcLoHfZPHC6SxoWfZUHC7uxpefZVXC78CpehdVXi8qspedtXce8qRo_kZUIS8qdo_aZUGm7OMo6cerqLeuNcLM4Pzgk-GIVJodq1G0synf2drXG0HAxjMLYfPCCAxf2LXjPCnAxcaa",
      "DATA=bBfYyXCHmxdtfWGXCxmWfZma0ZaimWitmcyW0nmneJdrCW0CmnitoG0ZOsm6fZoHWZOHqeRmbiteweXfRjPbEl6mJefOVQciEmIcLOH6dkMzsGMuPrtkuDsHLKQjxkICsIhaa",
      "DATA=bzPPkBcsMxKPOzkzYCgRNjOAAAAMOdQ6rkUiGRcdjGVYSmqMqjP8bkla6SW7RmqkFewIUsaZJqm4GdodaZTqm78do6aZXam4mioddtXaG8qnpeeJVWG7Oio_dtJqG4GnoicdLWm5iiondtIbi4msodfZSam7uio6dtVXi8qxa",
      "DATA=fkKzgQcLmMhdirWXWCmCfZhbiXWnqeNCmAZbojWtOSgkYRod85IhoArasSQ5kIJcM6exoHeJOq06yxoRfZSbC7aCoHcdNaHcCtkcetkXWa",
      "DATA=wiUIekyMcMcaUG1cYNWSICiONckNUHfZPHC6SxoCfZLXC5ixonfZSbC7uxo6fZJrW40HonjJJri40noncdGYy4miq2NCnPoPkCQsKmHkZiseTecdrcya",
      "DATA=vBfYeZaHACiwOsfQyHARiteIeW0HmiitaYeZaMmWkZfXiXWsmHeJjHiZasmReMmbXJaxmseJdrjR8xA_hdrceZ8HnedtpW1R8syndwdqHG0dmshfKrzekPQ1kCqOAWGMwhkOa",
      "DATA=rnVGC7adoWcdTqm7uio1dtSa07aso1eJSbC7uxAWhgScfRuHA1hgmcTJaMy1jMnsSB8RhejIrcSWmnmndtca0XinmxdtfWGXCdmditdseWGHmsitfYeXCMmxkWM6c4mRodjJIcy40RonjJIcS5iRosjJKGG40ioicdGWG4mdonaZIam5idyCdwiq1IyncBQShsDISna",
      "DATA=bBLYe5iHonhdJrC40sosdtLW07aHoWdtTq07Oso6fZUHW6SHoRdtNce5WnoseJKHC5iCo1eJTrC7uCo1itGYS4mdpeaZXcSHWsiChckXWIUsoxeJLXC5CCoWhdSbC7asqggmqXJPCRAxjMLWHPCdAWa2SaHRaMAWkWa",
      "ITEM=BIGTIME",
      "DATA=fEnsfJOHy_iwrcfdUyW2IBSa06ynoRdtNa06enoCeJNbC5CxosfZJrC4mHoiitJse5CHoCitOse6yHoRitSce40CvbQofYTHCMqhkUnq1JOny_dwra1qwzIfIOJqQkyBIRLWa",
      "DATA=roJq1O0sAnf2JrXO0HkkbsIII5CdoxcdLW05CRoxjJLYfHWnyHdwjG1ISnyWdwnq1JOny6eMoHDJOCy6iwoIzHWHyHiwjIfISHyRjGVW0l8MdegChAEAgRKVfKjqDemhqZQSgjIa",
      "DATA=eBjIeYSHmCitfYeXiHmnitdrCW0CmneJdq0XWimCaZhbiXWnm_dtra0YSMmRkZoIeZOCm6fZoHiZOnmRhdkXCYSsmRdujjRbyAWhkCbOBbwgWZHSjqBdqPXcQBVWG78dpeaZXaG7Oio6aZisea",
      "ITEM=GREEN",
      "DATA=bAOXAyoRMdGXXioCsRIxiqLW0lancWiujsbcurmdfZcbCW0xmsfZfXCZaxm1fZoHCZ8xnefWa",
      "ITEM=ORANGE",
      "DATA=vCh5fcMFWPKuh5-5CdoxcdLW05CsoxfZLXW5CMoxkZLYe4mMoijJJsy5iMoscdJqG4GiodcdSam7aioWeJSa07aCoWfZSce7aRoWjJTqG7Oio_cdXaG7uMo6jJVYy8qMeIfyM4YkQmIBOiQQckmfcJkbJrWW0smnfZdrWZOCm6fZoHi40RonaZUGm7ORzeiwpYfJOHy1iwnrXJuxy1eMnq1JOny_dwra1GmHyniwccfHiHyshgeHDHisysdwdq1GGnyddqa",
      "END=qia",
      "DATA=fBaW0WGnmndtjIeYSHmWitmcyZaRmsdtfW0XCsmxfZfXWXCHmCitise4GxoihdJrW40xcHcaVYeluxc6dqQW0ludcMfWXaGlORcsa0KYjiqIYee0KXnb0yqIhubOBeaerdkzNbXiUtsegSK5RiUIG",
      "DATA=uocaHGGnyieMcbXGGG4if2eIe40xosfZLXC5WxoHfZPHDQyMARjMSczRuMA6jMVYzR8HA_hgVXDR8sA_dwVWHROiAWcgTqHQSiAMcgOqHGGL4xdweG1HCHyxk2fYzO0RAnjMJsfO0CAneMJq1O0iAna2oITJOHy6hgoHDJOsy6dwoGnIydyMhgjHjIynyxa2fWHIyHqIK8iP3JaHy1iwkW1Jany1duR5nkWwsSe0TPnlAws2MCRbPkWDs2NuS51k-DsZKZSbDIyRyRiwOszdeSqXbaa",
      "DATA=vBGW04GnondtKG05CnoditIce40HositLYeOWLqeP0baK6ynoMitQYe7aHoRdtSa07uno6dtTse7OHo6cdUGm7OMo6k0nIDdyjkVbWLPgjABILKyPzUjALIwH4PyEkwLI0LOIbB0iP9bG4a",
      "DATA=uBfYSXCMmxitmceZaMmWkZnseZOHm_iteIeW0HmiiuekPdIQgijHVYyXWHmRiujkMjABIVM4M5gkQrIJaYOPfcIlWGI7GW04GnondtKG05iioxcdLWm5WdoRaZSaG7ado1cdTq07Ono_dtXa078io6cdXaG7Odo1aZXam78doncdIaG4mionaZKGm4mdoiaZJri7Osa",
      "DATA=vBfYSXCMmxhdfYeXCxmxeJfW0XCimxaZmamZaimWdtmbiZaxmWhdmceZaMmWk0JaNiMnYoJCVGNmcnY7JCjsFcuDWLe8jqMiOJI8i4a",
      "DATA=uBGWG4GioncdKGG5WioxcdOqG6SioMcdSaG7uio6cdVWG8qipejJVYy7OMo1jJKIy40MoijJGYyWmHmiitdseXiHmxithceYeHmMitkYeZaHm1itoIeZ8Hneitra0Z8nm6dtnq0ZanmRdtjG0YenmCdtfW0XinmndtaW0WGnmseJeHCXiCm1hdkXWZaCmMhdfXWXWCmHhdfXCXWxmHfZjHCYSxmWfZnrCZusmReJjHiYesmCeJfXiZasqjMmqjIGodPeG6hioIUdOCQ6k6UKsROdQ7fYSXCMmWjJmcTcuQa",
      "DATA=vBJqG5iioxcdLW05WnoHdtPG06SnoWdtSaG7uio6cdVWG8qionjJKIy5CMoxitNce6eHoMitSce7aMo1jJUIy78MpejJKGm4GMoicgfXjHCxyxhgmbjJaxyWhgXa06SHq2K8nP2OYw6_dwUG1RunARcgPGHQeiACcgKG1O0nAidwIcfO0HAsiwTsfROHA_iwXcfPWMAHjMPIzQSModjMGYfyiQwmaJLWma",
      "ITEM=KEY",
      "DATA=bANPAQEwWLgkOXSQmsmidtdqGXiimxdtfXiXixmnhddrCW0MmWdtnqGZOim_dtpXiZOxm1fZnrWZuMsqKmUrea",
      "DATA=eEhcfIeHyMiwkYfJaHyWhgmbDJasyReMjHjIesyCeMfXjHCxyxf2fXXHCHsDNCNzJkkyYINCP5JkEDYSNCRjIXiHmshdeHCXism1eJnrCZuCm1iwVXjR8xA_hgVYfR8MA_kZVWG7Oio6aZXaG8qdodaZGWG4GioncdJqmGId6ieMIbDOGCAihgIcfOGMAik0bkZewTi_G4a",
      "DATA=vlGWG4GiondtGYy4GMonitJri40CosdtKHi6esoCeJLXi6SsoMeJSbi7usoncdJsy8qMo_jJUIy7OHo6hdKHW5CCoHhdNbW6yCoRhdSbW7uCositTse7Oso6dtTq078io6cdXaG4GnoiitVW078HodaZIam4mRoikZVYS8qRo_aZXanb2jWSIziOMHEHOWOAjchj2NYSP8PsYjghI0H4LOYk-mImGOUylaKtqjhuqbneaDa",
      "DATA=vFccRWGeoxaZLWG5CnoHdtNa06ynoRdtSa07adoWcdLXi5CxoxhdLYe7aHoWhdSbC7asqKMRhceXWCmCfZhbiYesmMeJkXiYSxmRhdkYfkagYPHOW6cmomI0JiVjBdIgXdbSnOteueQhLGTkca",
      "DATA=vENczQeMAMjMQYyXCRmxjJmcyZaRmxaZfWGZaimWa2haHIeiyMcgkWGIoxcEfOQbAkmBWFK0h51cODqQeWOXgimGIcJiW4YmoGWjlecqteaeraliKIcjgmI0JiTkea",
      "DATA=vBGYS4GRpeaZVWm5CMoxitJsS5iRoxkZNbW6exoMeJQW07ado1aZUGm7aioCitOrW6yxoReJSa1OmnAxa0HiNPiiAicgJqnOmdsjHmK4ti6j6ndwIbjPCnAseKIy7jooYyICJPpO0xACcgrcTJORy_jMrcfJOHy_hgnszJaRy1hgmcfISMy6f0TQZlgNY2OSU53mcIY7P8WkZmwNUsjJTqG40MoijJGYy7Oio_cdVWG8qia",
      "DATA=vEfW1IynyHdwha1ISnyWdtKGG5ino1dtTqHHCiyxa2manJaiy1a2eGnOmnAidwJq1ROnBedwVW0zWsgReJOrW6yCoHitKHW5iHonitJrW7uCo1itUIe7OCoMisaWmKqdsecuIqrmaetfcqGYQmoQWoleoYXc6FWAN5LYSBaRa",
      "DATA=qEKIzPCMACjMOszQyMARjMSczRuMACdwOq1QynARdwJrjO0xAnhgJsfO0MAxhgLXDPCsAxdwSa1RasAWf2SbXROMA6iwUHXROxA6eJGWG4GioncdKGG5WioxcdOqG6yioWcdQWG7uio6cdVWG8qiinG6oWpGGsyif2cbXGmnkhJkJkRAkwydiuHbGa",
      "DATA=fBScy7aHoRitOseXWCmCfZLXi5isoneJIbi4msoHeJPHi5CHoCitKIe6SsoWeJTriJOsUCeJScSQEOcidqJqGjCdcCcebi7asjWeHiQWGladmHhdirC40HmMfZjHWXCCmxfWVYzdUNUMiqa",
      "DATA=rBaW0WGnmndtaYeWGHmnitKIS5iMositKG05iiosaZTq07udo1cdoG0Z8nnedtTse7uMo1kZoIeZ8Hneixb6L0af4xiwhcfIeHyMiwkYfJaHAxdwOq1PWnAMdwQW1RanqjH9VQGa",
      "DATA=eBOrW6exoHeJPHi6SsoRfZQXW6yCo1kZTsy7uHo6itVYe78Mo_kZUIS7Odo6cdUG078npedtXaG8qdo_aZQWG6yioWcdSam6ydoxkZLYy5iMonjJJsS6eMoMjJQYy7aMonitJrW40xoneJKHi5CsoCeJIbC4mxodhdGYe4GHo6eJUHC7asodeJIbi5inosaZKGHbIDUndtJqG40doiaZIa04mnodcdGWm4GioijJIcS4mRodjKhytbIjWDJSiONzUhOskYcbWISdi_ccoIyIyxa",
      "START=rpqsRWocSsdtfW0XWnmHdtjG0ZanmRdtfYeXWHmHitjIeYSHmWitnseZuMmscaTkQjgcIriiTiYa",
      "ITEM=MAP",
      "DATA=bBJrW5iCoxhdLYe5CMonitJsy4GMoCjJGYzboIVejJVYy7OMo6itUHW7uCoWhdSce7aMoRjKnQkRsQUxdtNa06SnoWdwiq1IynyscgeGnJuiy1aZOrC6yCAndwIa1OmnA6dwVW1SqnqLb0rAZasSUMfZOrXiAgYlHSVGBiKiZaImWWAjgmI0Jia",
      "DATA=flLW05CsoxfZLXW5CHoCitOse6yHoRitSce7uHo1hdTrC7uso1dtSa06SnoHdtNa06yncLLOM5Ak-wWIgmlbIQaLQQjBeIeXiCmsfZeHiXinmscdeGmXiMmskZJqm40iondtJri40ConitJsy40RoikZGYS4GdodaZcbiWmsmddtca0WGHmditaXWWGCqecCcqNaqNqiPZoGmZOim6dtoHiZOxm6hdoIeZOMm6kZVW078io_aZXam8qipedtVYe78Mo_kZXcS8qMpeiqa",
      "DATA=rlGYe4mModkZIcy4GRonkZJq040soseJKHC5CCoxfZNbW5WxoHfZOri6ysoMkZQYS6SMoWitScy7aRo1hdTsy7uRo1itUHW7OxoRdtVXi78Co6itUIy7ORo_kZVYy78HpeitXbW78xpefZXbi8qRpejJXa08qipeaZNbi5CsosdtNa06enoMdtLW0kcQILPyQQck-BI0LOUzhOmiAda2IanOGikVb0eqBcsgG",
      "ITEM=METAL",
      "DATA=flLWm5CioxdtLXi5CxoWitUIe78Ho_dtUG07unoWdtSaG7adkdeAKzgyodMsG6IGNaWe8dg_iARWWQWeRlLXW5CHoRitPIe5WHoHixmbhXSBVeiuTGrlKes8beTGJlKiY8cia",
      "DATA=vlLWG5CnoxeJLXC5iCoxhdLYe5CMoWaZSam7anoWcdSbi7aCoWitScy5ixoseJTri7uCositJse4GHoditKG040noidtGW07uno6dtVW078no1itUIe78HqjMlScSkoncJOubWBaCQcmQOJikl6hI-PCoiBdKPG",
      "DATA=ukJiYOYGSxdtfXiXCxmxhdfYe4miodaZIam5idonaZLWm5WdoHaZQWm6ydoWaZTqm7Odo_aZXam8qRo_kZUIS7uRoWkZQYS6yRoHkZNcS5CRoskZJsS4GRodjJGYS5ixqtNCe5o4mnodisRq8Q0EiKf6obDc8yQGHYUyCQcLk5jqa",
      "DATA=ulGYS4GRonkZKIS5WRoxkZOsS6yRoRkZScS7uRo6kZVYS8qRodaZIam40dosaZLWm5WdoMaZOqm6SdoWaZTqm7udo6aZVWm8qdyxcgfW1HCsyxf2fXXHCCyxiwfYzOmHAiiwJsfO0MAddwIa1O0nAncebkFaMNWeICcyNROiA6dwVW1SqnBeiwVYfROHA6jKqkFewNXfICqqNJaiyWdwmbjJaxyWhgmcfJaMkJfTU5yiYwG",
      "DATA=voLW1PWnAHdwPG1QSnyWeMmbDJaCAsdwJq1OGnAddwmczJaRA1dwUG1R8nBedwmaHJadyxk2fYzHCCyxf2fXjHCiyxa2GYfOGHAniwKIfPWHAHiwPIfQSHA1iwVYfROHBeiudbJcuy4WiuJcPkuQs-kKVODiWhsLb0VHIjAGIVJia",
      "DATA=ulJri40xonhdLXi5CxoxhgGYfOGHAniwGWHOGiAscgLWHO0MoHitOrW6exoHeJOq1RaioReJQXC6SCo1eJTrC7uCARcgTqHRuMA1iwJsTPiRAxk2OsTPWRAWk2TsS5CHoHjJQYe5CnoRdtOqHQSdAxa2UGHR8iBecgXcfO0iA6iwPITB4QARk0HcFiKNYeleIsWa",
      "ITEM=BLUE"
    ],
    "course_1": [
      "NONE",
      "NONE",
      "END=aia",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=eyR6Qj6BcJhyQb8k8LISOqMHIjCucydWM4SkcjcLIyQGWk4pcXeWTjBcgNqDjugcjboEqqguh4pcwdW1cCmiBcUeW6dudPpbOeqoJSfqBbeki6gaa",
      "START=0laYeWGHmidtaW0WmimdjNiQNYmcG",
      "DATA=umbbHaKyqogeeXHbGyqDgeiHHcCyqSgemrHdyyq7geqbHeuychOiVQcl6mIhJia",
      "DATA=qCbbHcsSqlMeiQxbkyWFiegzSikmImJiLy6j4tcKgGQsikYPIoh4Hz8jwJUdaZIam5idonaZNam5CdoHaZPGm6SdoWaZTqm7OdpeaZVWG78dpecdXbi8qxpeitXcy8qRo_kZVYy78Ho_eJVW078xo_hdXbW8qno6cdUG07Oso6fZUIe7ORo6jJUHW7uHo1jJTsS7uCo1eJTrC7uno1cdSaG7anoRcdPGG6SnoWeJOqG6ynoReJSbC7aCoCcaMAMa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBjHWZuMmHeJhbWYSnmWdtfWmXCimHcdfXWXCxmRhdkYeZasm6eJpXiZ8nm1aZnrWZOCm1kZhcyYeMmnitdsyWGMmdfZcbCW0nmidtcaGYenm_jJrczcCSqNiSiHHbmoq2e0rsZaqNqedGa",
      "NONE",
      "NONE",
      "DATA=bCePna8yqpNKe6ijozczbGRqAlizcSQqMILbKJWFjmi6DckjWEdCga-4GRoijJIce4GCoifZIbi4GnoicdIam4mdodcdGW04msodfZGXW4mHodkZGYy78Ho_hdVWm78io_dtVXi78xo_jJVYS8qRpejJXce8qxpedtXaG8qdpeeJXbWa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=byM6wkQLIQM4M5UjUrIReyQOEjUhWKRmjisjgmIrLOKAclsGI0LOTiYl6rI-M4H5giEBWKKCjj8Qkwa",
      "NONE",
      "NONE",
      "DATA=bAi5DcsgWKKmjkbcslWKPmjkM78do_cdVW078so_fZVXW78Ho_jJVYS8qRpejJXce8qCpefZXbi8qnpecdXam4mdodcdGW04msodfZGXW4mHodjJGYS4GRoijJIce4GCoifZIbi4GnoicdIama",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=fmqbHdSyq2gemrLcYBWPN0kcpcMOIUjmlQVdqQW2jKnIhdyCW2e8nG7dykq2bumqLc2mqOJmjaTckgINHqRH8k4qI3QOPcQjSfodfZIbC40xosfZLXC5iCositKIy5iRonkZIcS4mRodjJGXW4mHoihdIce4GMonjJJse40ConeJKHi5iiosaZKG040nonaZJqG4GsoicdIa04msodcdGWm4GdoddqLPgjABU_dtXa08qio_cdVWm8qda",
      "DATA=ulGWG4mdoiaZJqm40iosaZLWm5CioCaZOqm6eioMaZQWm6SioWaZTqm7uio6aZVWm78ipeaZGYy4mRoikZJsS5iRoxkZNcS6yRoRkZUIS78RpekZTsS7aRoMkZOsS40MoxjJOsy6SMo1jJVYyjULIrPyH6wiEhIrH4M4EkwhIVH4UyEmohJdPyUAwk-LILPyJjAkcwI0LSgbHcWyragmbbGa",
      "DATA=ulVWG8qipeaZVWm7Odo1aZLWm5CioscdKGm7aCo1itUIe8qMo_jJUIy7aHondtKG05CsoxdtJqG40doiaZIaG4mdodcdGYy4mRoikZJsS5iRoijJScy7aRo1kZTsy7ORpekZVYTaAyWqNCgQlcsIWKMeji7c6oW4K0qXIikGIhOiJkwjgLIwQOM6QkcQILQOQQwkQGIQM4QPAk-wI0M4UzUl6GJdOiW4Yl6mI5H4TiEk-cIQGOPykkccIBH4M4YjUrIBLOLPAjgrImKyH4YikmURkZNama",
      "DATA=rlSam7aioWdtSbi7axoWjJSbW7aHoWkZTsS7ORo_kZXcS8qMpehdXbi8qnpecdXam78do6aZTqm7uno1eJTrC7uCo1itTsy7OMo_jJVYe8qHo6itUHW78Co_fZXbC7Oxo6eJVW07Ono_eJVWG7Oio1cdQYS6yRoikZGYS40RoCkZOsS5CRoskZGW05CnosdtJq04GnoxcdLWm4mdodcdJqG40doicdIam5idoscdGYy4GMonjJKIy5WMoxjJNcy6yMoHjJQYyjUrIBOiQQckQrImOiJjhcsgWKI8jjdbSAWGgCjbzbwAWqMSbPRaUAG",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "course_2": [
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "END=aia",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=eCjkPcoLWGiSg6fbCFWuheeHFbisWuJSgiTb4kWJJejW_cItWPMmlbZc-FWZOCokjd2HrbNKrjQjYoIGKOLrujCpIALaMzOj8yUskZKIy40HoiitIbW4GxoieJIa040ioicdIam5idoHaZOqm6ydonaZNam5CdoRaZQWG7aso1eJSa07uno6eJVXi8qio_dtUG07ado1cdXam78do6aZUGG8qno_cdTqm7aio1fZUHC5CMoxkZTsS7uMo6kZUIy7aMoWkZVYy78RpejJXcS8qHonjJIcy40RoikZGYy4mHodhdGXi4mdodcdGW04mxodkWa",
      "ITEM=GREEN",
      "START=0lcaGW0imxcdhaGW0nmsdtfW0XismneJdrWXiCmsfZfXiXCCmxitdseW0MmsitccyXCMmCjNjOlYuQG",
      "DATA=ulaW0WGnmndteG0XCnmCdtiq0YynmRdtma0Zunm6dtpW00qnmditcceXiHmnitfYeXWHmMitiseZaHmRitoIeZuHm_itrcfbGyqtgedHHaKyqegehrHckyqSgejXHdeyq2geoXHeayrfgaa",
      "DATA=uldrWW0HmnkZdsyXiCmxhddriXismxeJeG0W0nmncddqmXiHmsjJeGGZOdm6cdoG0ZOsm1eJmbiZunm1cdmbWZuCm6hdoIeZOMm6kZnsyZuHoHitOsy6eRoMkZPIy6yHoHdtOqG6edoMaZPGG6ynqlMebPHbcyqvMegPHb4BqUMeiH1cCDqRM0m5HdIyq9MeqPG4GRodkZGWm4Gdo_aZXam78RpekWOXma",
      "DATA=ulaW0XCsmCfZaYeWGHmnjJeISW0RmijJaYyWGRmikZaYSYyRmRkZkYyXWsmHeJnq0ZOnmWjJmcSZuMm1kZnseZOMm6kZpYS0qRnejJrceYSnmMdtiq0XWnmxdteG0WmimdaZcamW0imscddqmXWimxcdeGmXCdmCaZiqGYydmHaZjGGYSdmRcdmaGZadm1aZnqGZOdm6cdpWGZ8dnecdranayyq1MepbHegyqogel5GXWCmCkWa",
      "DATA=ulaW0WmHmiiteHWWGimnhdeHCW0dmsaZfWmWGdmdcdhaGYeHmHhdirCYesmHcdiq0XWdmWeJmbCZaCm1dtpW0W0Hm6dubPDaStqpJ0fi7bSwWBhmg6ldUAW5MepzGZuHm6itpYe0qHq7LChsFcMwWPNmkAncCOWIkSgzeZaHmWdqa",
      "DATA=qBaW0WmHmiitca0XCRmxjJmcSZaMmnitdq0XCnmsdtha0ZaHmRhdkXCYesmMeJeIyXiHmHdtmbWYyxqgMec5Hbcyqwgmg5Rb-EqIiKjcVcqMG",
      "DATA=flra0Z8nm1dtoG00qHm1itoIeZ8HmWdtmamZaimxaZfWGXCnmxeJfXWXCxmxithceYeHmWitjIeYSHixjAisyISMi1jIpYyHiCiseJKHC5inosaZKIe5iMoCjJPIy7aMo6jJXcy8qRo_kZUIS7uRoWkZQYS6eRoMkZNcS5CRoskZJsS4GRodkZGYy4GMoiitJse40MoiaZJqm40ioneJJrW4GCoditGXW4GxonfZIa04mxodeJIbi40noicdGWm4mioddseGG7udo1cdUGm7Oio_cdVWm8qipea0qXHdIyqUMejiZcseWNK4a",
      "DATA=ulaYyW0MmijJaWGW0imicdeIyXiieqd5ebS6eMoHkZOqG6edcGJiOkcWmRmikZdsSXiRmsaZdqmWGdmdaZmamZaim1aZnqGZOdm6dtoGGZ8dm_cdram0qimWjJmcSZ8Rm6kZoIyZuMnejJrcSZuRm_jJoIeZOCm6eJnseZunm_itpW1d2yqZMekzHbQyqrgebPHaUyqwgaa",
      "DATA=ulra0Z8nm6dtnq0Zusm1fZnrWWmHmiitdseXiHmshdeHCXiscrJiTkc6esoHhdPHW6ysmHitjIeYenmMdtiqmYydmHkZjISXWRmRkZhamYSdqFMekrHc6DqAK4OQwkmhG",
      "DATA=ulIaG40ioscdNaG6eioMcdTqG7Oio_cdQWGWGdmnaZeGmXCdmCaZiqmYydmWaZoGmZudmRaZpWmG0Ri6kZfW0Zanc-LOH5AjArIVKBfWGZaieWNjePYIoHa",
      "DATA=ulNbC6SxoMfZOrCXCsmxfZfXWZaCmWfZmbiXWsmHeJjHiYSsmChdirWYyCmRhdfYyXWMmHjJjIyYSMmWjJfWGXWimHcdjGGYSimWcdfYSZaRmxaZmamW0nmneJdrCW0CmnitdsyW0Rm6aZoGGZOsm6fZoHWZOHcmHWUAxekyqgMdIcS4mRodjJIcy78do_cdXam8qimiitaYeZOnm_dtra0a",
      "DATA=ulaYeWGHmnitdrWXiCmxhdhbWWmnmndtca0W0smseJfXiXWsm1fZnriZunm1aZnqGZuCm1iqTkwjALIwH7fW0XCHq8QmpIrd8FXaM8rbJdyTq6RemAXc-OWUPelP_c0BWQgmjzHccyqCgefXHbiyqnMecjGkwBILKBirWYesqegaa",
      "DATA=yBrcS0qHnejJrbW0qsnefZra00qim_hdoHWZuCmWhdkXWYyCmHhdhbWXCCmshaJbUXismxeJhbiYesmMeJkXiZasm1eJoHiZ8sm_cdoGGZuimWcdkWGYyimHcdhaGXCimscaJjgiYhXageqa4Z8Hm6itpYyZuHmWiqa",
      "DATA=HBaW0WGnmndtdriW0xmnhddseWGHmditaXWWmsmdfZcbiWGxmihdaWGWmdmiaZdqGWGimnaZdsyW0RmikZccyWmMmdkZoGmZOim6dtoHiZOxm6hdoIeZORm6jJpYSZ8MnekZrcyZ8HnehdpXW0qHnefZpXCZ8sneeJpW00qnm_cdpWm0qdnecaOiEkwrIGM4PAxcCjqIe8jX1ciNqMduiW_cmxWMgCjQfcmJqJQ0jisXCnmxeJfXCXCCmxitma0ZaCmWeJmceZaxm1fZeHCa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=flra0Z8nm6dtnq0Zusm1fZnrWZaxmMfZkXCXWxmHfZfXCXixmnhddrCYeRmneJhanekgXeIeqiHecfreHqJkciYmIBH4OkwlsGG",
      "DATA=rlfWmXCimWaZmaGkQmSddtca0WmHmiiqJjXcseWKIuji5cssWNf8j51coHWEiKgr_aOyqfgefrXbcyIFjGRHkk8yIRNWPQqjiHcyjtIam4GiodaZGWG5iioncdJqm5idodkZIcy4mMoikZJsS7ORo_kZXcS8qMo_jJXce8qCpefZXbi8qnpecdXam78do_cdUGm7udo1cdUGG78no6dtVXi78xo_hdVYej4yG",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "course_3": [
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=ezT5CBsAgXNrRYaAWIM1ibUckBSLhdNXSQVdgtqSgejX0ZOim1cdmaGlErI3JlkWGYyimHcdhaGXCimscddqGAGKmditcceW0HmsiqO6uj6MSxithbWYeCmHfZjHCYysmReJfXWjcmIpKyJryikposjJKIS40RonjJIcy4GRodkZGYyCqRa",
      "DATA=ukiriIeCiMfYhbCIexqUMefzHciKWIc8p5Hc6Iq1henrjc6jWKbmgqDbilWoeKdzVbeJWxkmicXcSRW3PSpj_d8pq5bSc4BaotqPeugHfbMFW2L4a",
      "DATA=qBfYSXCMmxitfXWXWCmHhdjHWYSCmWhdnrWZusmWeJkXiYysmHeJhbiXCsmseJdriW0xmnhddseW0Mmnk0eYXbmKWthmgrHccyqOMemrHeayqLQSlAxdILXaiCpGZdokWPcShWRbokWidebrC7aRo1kZUIS78RpekZXcy8qHpehdXbC8qspedtXaG8qdo_aZUGm7udoWaZQWm6ydoCaZOqm5CdosaZJqm4GdodaZGYe4GHoijJGYy4GRodkWa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=byK4kjohIvdaMbajYrcHKGPPkkUtcWK4TzklOqI5LyVHol2yI5MOTrEjmrcpfaJbGiSDclOGJIAjeQUWaZTqm7OdpeaZVWm8qipejJXcS78Ro6kZTsS7aRoWjJQYy6SHoMitOse6yMoCiuh4DcyoqXJ0pi5euwXaOenb7cQzWHMmgHVbKJqFQOa",
      "NONE",
      "DATA=bCgIJbmLqlOeb5JaOrWqJSfW7bWrqFLKiHTcuFqROunr_dYBXaLCqa7dUkq0ImlaHcAePeQ6aWmPcvQPfYTO64GdoicdGWG4mnonaZVYS78MpejJXce7ORpeaZVWm8qiodjJIcS4mRa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=eBGXW4mxodeJGW04GnondtKG05CnoditIce40HositLYe5CioxaZKGm5iioncdJqm4GdoicdGWG4mdodjJIcy40MosjJLYy5CRoskZJsS4GRoikZGYS5WnoCcdNam6edoHcdPGm6SdoWaZTqm7Odo_aZXam8qio_cdUGG7uioWcdQWG6yioHdtPG06SnoWdtTq07Ono_dtXa07aRo1kZUIS8qRo_kZVYy8qMpeitVYe7OMo1jJUIejAwWtgdJri4GsoifZIbW40ConfWa",
      "DATA=rmhWBbMmqxLmgHZb-HWMPel6tdEIq-NmpPzdGsWXe8k5BcKAWOOukQJdqRq-kSqYzeuEXff0qy7dSlWYI0kq1cqrqFfCgjJbeAqjMKbbIj0ncGg4UQqmefc0G4P4wk2CIYgOTPGjesIthWHz6iyqa",
      "NONE",
      "DATA=bBGWm4GdonaZKGm7udo6aZVWm8qdpecdVWG7Oio1cdQWG5WioscdJqG4GiodcdGW04GnondtKG05WnoRdtTq07Ono_dtXa08qso_eJUHi7usoReJNbi5isoseJJri4msoieJGXC4GxonfZKHC5WxoRfZTrC7Oxo_fZXbC8qCo_hdUHW7uCoRhdNbW5iConhdIbW4mCoditIce40HositNce7uHo6itVYe8qHpejJVYy7OMo1jJQYy5WMosjJJsy40MoijJGYy4mRoikZJsS5iRo1kZUIS78RpekZQYfcsKWKMSjjdcsgWyjmgbRbGqWybSmstdeAWXemmqAa",
      "NONE",
      "NONE",
      "NONE",
      "END=aia",
      "ITEM=RED",
      "START=0pikHYcfcLkONcQkucIBGUrbDKqCy_iwoIzJ8sy6dqa",
      "DATA=uiKzAlswIJfScrJbmDWCgejrjc2yq2NCqjGAmkgNc5KImy4HMwizNWUBuJg5izSsg4mioicdJqG5iioxcdGWm40doiaZKGm5CdoCaZOqm6ydoRaZTqm7adoWcdTqG7Oio_cdXaG8qdo_aZUGm4mMoijJJsS4mRoikZKIS5WRoxkZOsS5WMoHjJPIy6yRoRkZQYy7aRo1kZUIS78RpekZVYy8qMa",
      "DATA=riGOYiEmImJqKq5aGyqthmgYvcuRqVP4N5UIoFINhdGYe4GHoijJJsy5iRonkZIcS4mRodjJUIS78MpeitXcy8qRo_kWQ5MRawc1K4Ui_dqGqSKujOAlacUMfZOri5WnoxcdKGm4mdoiaZJqm4mioicdJqG5iioxdtNbi6excCgaMrqjwqG",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "course_4": [
      "NONE",
      "NONE",
      "NONE",
      "DATA=eCqPHd2yq4L0m5xc6tqQcukyrcUom1dtoG0Z8nnedtUGm7Oio_cdVWm8qipeaZnseZuMm6itpYe0qHo6jJUIS78Mo_kZXcy8qRo1kZmcyZaRmWaZmaG7udmxkZfYyXiMmsitdseWGHmditnqGXCdmxcdeGGXinmndtca0WmnosaZJqm4GdodaZGWG4GioncdKIS40RonjJIcy4mModkZIcTaAyqlMeejHcsSqvMmiQhbOAWENCjcAsgva",
      "ITEM=ORANGE",
      "DATA=qCjkPcsKWKOejjTcsvqMdSkyRc4hWZHKoyDd4kXad0jXHciyqDgegbHbmyqogecrHcWyqXgenHHdSxq_fdLYy5CHositKIe4GHoditJse40MonkZIcS4GModjJGYS5CRoskZKIy7aHoWkZScy7uHo6jJUIS7uRo1jJUIe78HpejJXce8qRo_kZVYy4mnondtIa05inoxdtLWG5CdonaZIam4mdodcdIaG40ioscdKGmjUGIBJjmqWa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=byLPUjAwIVLOR5UkchILH4R5gjArWSbClONcYnWNeejbpckyWINmjkfcGKWSP0mAFdALW7iCpjVdonW5KmpjxckoqDdKga5bmoqnJ8cjnawyqKReg6JccPqwkmecJcCeosaZJqm5iioncdIaG4mdodcdIam7udo1cdUGG7Odo_cdVWm8qdpecaR4kjAcI-OiIcdayNqeiSbb1aSPa",
      "NONE",
      "DATA=jCjkPcCKWQielPZd-yrggejizcMqqMc8oHMmopddNOOXBdOwq0g0nbvc6toxaZLWG5CnoxeJLXC5CCoxitLYy5CRoskZKIy5iHosfZKHi5inoscdKGm40doiaZGWm4miodeJGXC4mCoditGYy4mRoikZJsS40CoihdGW04GnondtJqG4GioijJJsy40HoiitIbC40xoneJIbi5iCo1cdUGG7Odo1aZVWm78ipecdXam7uMo1kZUIy7ORpekZVYy78RpejGa",
      "DATA=OlccyWmMmdcdcaGW0imnjHIceyGCgifXIbiyGnmnitdrWW0xmneJdq0a",
      "DATA=GmPjxkMvYPMKPjPkCysHM0NPLkossLJ0Rjtk-wsRhuQr-a",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bENcfQeHAMiwQYeXCHmWiteIeW0HmiitnseZOHm_itca0WGsmifZdrCXixmscddqGWGiwodRfXCZaxm1fZoHCZ8xm_eJpW0Z8im6cdnqHBAoWKHSjiVcsqWKLCjjRcsPG",
      "DATA=eBXa078no_itXce7uCoWhdPHW6eCoHhdNbW5CCoshdJrW4mHodfZGXW4msoieJJri5isoxeJTri7OsodjJIcy40MosjJLYy4GRodkZJsS5iRoxkZScy7aRoWitTsS7uMo1itUIy7ORo6hdUIe78Mo_kZXcy8qRoWeJSa07aioRaZPGm6edoCaZLWm5CioxdtOrC6esoHdtPG06ysoMfZKGm5iiosdtJqm40noncdIa04GnoddtTq07Ono_cdXaG7Oio1cdSam7udo6aZVWm8qdodcdGWm4GdchH7QXXeayq7MenHHdeyqSgelaLcCjqIcuhqLb0oqSdKlbnb0tqDgegbHbmyqogecrHaKDqjiKdIjbmIqyiKhsjcgIIEkaQcHcsPWKPyVPgl6BG",
      "DATA=vBXa07Ono_dtTq07anoWcdSam5CdoxcdLW05CsoxfZLXW5CHoWitTse7OHo_itXcfQSnAMdwOq1PWnyCiwjIfISHyMiwise7uio1aZUGG7OdpeaZVWm78ipecdScy7aRo1kZTsy7OMo6kZVYS8qRpejJVYyjALIhOiJkciYmIhJia",
      "DATA=qCjsPaAyqlMejstcmFWFM8gHLbayqvggSczRaHAWhgSa1RasAWfZKIe5iMoskZJsS40HonjJIcS4GMoiitGYy4mRoidtGWG4GioiaZGWm5idoxaZLWG5inondtKGG40ionaZLYy5CRcwJiLQcikmIcOoSaHRuiA6cgVWHR8nA_eMVXDR8CA_iwTszROMA_jJTse7OHo1dtUG1lIvY4MSUjHlAxs6L0TPNlQzY2LmTPXlQCs6Lia",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=fyRqkk0hITdiRrgmomI-JiUy0lupcXKWRzAmoGIUkOSAClwKc6iyVYcjAcIwH4LOYjArIwLOLPUjAGIwPyLQQscAG",
      "DATA=rmjipcshqLc0jW5cQpWVd8m4_dEpW3JuoG_dEsq6duoHjdYsq8J8pi1dOvW6gCoH3dOHW6juoIFdOQq8QKpkvdYNW3P8n6vdEQq0j8l6FcSNWMjSiYpcaGqChufXRbizWmMmbXIlitIYiiVXol6GmditaYyWmRmikZccyWGHmnjJdsSWmdmdcdaW0WGnmicdcamW0dmncdeGmXCdmskZfYSa",
      "DATA=hnGIOGmHinkWJkciEwIwPBSam7aio6cdTqG7udo6aZVWG8qipeaZVWm8qMpekZVYS78Mo6kZTsS7uMo6jJLWm5CioscdIaG4miodaZIam5idoncdJqmWmnmidtdq0XinmWitmcyZaRmWdtkW0XCnmCdtnq0ZOnm_dtra0ZuHm6itrceZ8Ha",
      "DATA=XCjkXcsNqKHejiLb8KWQjmkGXb8mqZMefzHbAtqAd0lW9dktqwhugAhdmDWVOJOrC6yxcQLOM5AkmFcJdGUyElMLImPyJiEa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bCjircoiWHdmhi9bEpWsKmdHnaSxWnheez5bADqCgSizHcyvWRe8mjrduxq2NensddiJWTPmksrcgOWKPrkXKrct6_dwXa1GmHyiiwcczGGRA_cgVWm4mModkZXaG8qda",
      "NONE",
      "NONE",
      "DATA=byOYwj4BIJb4QjhbODqVe0hWLbWHqOMeg5Lb-yqKgelrDcIoqTdSja7canqHbukIHcMJWLOKisjcCSosaZKGG5inosfZKHW5iHosjJKIS5iso1dtTri7uxo1hdTse7uMo1kZUIS78RpekZVYy7OMpeaZVWm7udo6aZVWG7uio6cdUG07Oso6itUHW4mdonaZIam40ioicdJq040sonjJJsS40HonhdIcS4mRoijJUHC40xccPyW6wmohIcH7GXC4msodhdXbi8qxpehaa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=fmqXHcsgUHeJOrC6yxoMeJPHW6eCoCfZQXCHWsiReKbPJcuQiChckXWiEhI-H4VQwiELG",
      "START=0pi55YoqcrLOTjAymRgdaXXamCqRa",
      "DATA=umbPJaUyWpMKeX3bsIqtPWJkfa6PqjQmb6paKEWoNugr3b4BWHgeiPpckoWFcOMW5bMkWwJSf5pb0vWOeClrddisW0LSnjUk2yWPL8krXcYFWXN8lztdyqregmqPrd-qW7dWa",
      "DATA=zmbPJaWyWrMefXzbWsWFJ0iGPcofeZgJSbC7usoWeJSce7aMo1jJUIy7OHo6eJUHC78xo_hdVYe6SxoRhdQYekQrI-KyVQwkOLIQH4VOE7aio1cdUGGa",
      "ITEM=GREEN",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "END=aia",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "course_5": [
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=eia",
      "NONE",
      "NONE",
      "DATA=eBScS7aMoWitSbC7uHo6itQXC6yxoHfZSbi5WxoxfZKHC4mxodeJGXW5isoHeJKHW6eCoHitKIe5inoHdtGW04mHoWhdSa1cMFWAN8kzfbQrqlN8c5daUycrPyOkwkchIrH4R4El6GIcH4GQxBAOa",
      "DATA=ulGWm4mioiaZIaG7uio_cdXaG8qdo_aZTqm7adoRaZJqm5idoxaZNam7Oio6aZGYe4GCoiitJrW5ixodjJGYS6eCoCitOsy6yMoMitOse6yCoRitXcS8qMo_itXce7OCo_hdXbW7uxo6fWOXykmronfZIcy4GRonkZVYS78Mo6kZJqG5iiqgLKc5fbkqqzemhjvbQAWvN8fszbORqGRekkXc8QW0jCm59c6AqRLCl5ddApW9eeqXq5CioCcdOqG6yioRcdSaG6edoMaZOq06yna",
      "DATA=qBaYeW0HmiiteIeXCHoMitOseZuHmddtca0W0nmsdtfW05WHm6itoHWZOxm6eJoG0XWnmHdtjG0YSnc5H8bPHaUyqqMefzHbQyqFMejjHcsNqKRejjYl6GJdLOVOYmoQI5PyW4k6SHmWiqa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBOse6yHoCfZNbW5WHoRitQXW6SxcBKyQPg40sonfZJrW40HonjJJsS7ORo6jJUHi7Oxo6hdUIe4GRodkZGWm4mioddtGXi4mxodhdGYe4mMoiitIbi78RpekZXbW8qxpeeJXam8qipedtXcy8qHo_eJVYe5iioxcdOqG5WioRcdPGG7uioWcejjRcmyWMgmiXZmaDtagmIr1iKyWMhiKzglsrImH4UyEl6LIhPya",
      "DATA=imLzdjwAYMemOXdkyAYOMmQjlkcsYGMmN5xjGqYygSRPdleqYZKmSrplexsUMSSrRloAYJgSMPdjQAYyf0Mboa",
      "DATA=HBNbC6exoMfZQXCJaxixfWJkciYBImKyJiYlMmI5KyUzUlMGI3jqTWGi6icpjujiBcslWKQCjkvksFYKKia",
      "NONE",
      "NONE",
      "NONE",
      "DATA=eBLXi5CxoHhdPHW7OHoiaZIa04GiodhdIbi4GCoifZIce4GMoikZGYy4msodcdVYe8qHccQOGQcikwIcJqGOk7axoRfZSbi7uxo6hdPIe6SHoxhdLW040RonjJJse40ConfZJri40noncdJqnkits2e0OIjlyIoHdtOqG6yioMdqa",
      "DATA=ulGW040noidtKG05CnoCdtOq06ynoRdtSa07unpedtXce78HoCitOse6SHoMitKIe5CHoditSce7OHo1itLXi5CCoxfZSbi7axoWhfbivueOIrM4KAwlshI0KCc5zaUAqnMeczHaUyq-fCpHFd4zW8f8qbEjUcIQQRGYy4mRpecdXama",
      "DATA=vBfW0ZanmxitmcfPCRAxjMLXXPCxAxeMLWHPCdAWa2SaHRasAWf2SbXRaMAWk2aYfGGHyniweIfHWHyHiwkYfIyHy1iwoIfJ8Hzeiwnq1J8ny6dwra1ISnyMdwiq1HWnysdwdq1GGnyddrizua",
      "DATA=ulGW04GnosdtJq05CnoCdtSa06enoRdtPG07uno6dtVW08qnoditJse4GHositLYe5WHoHitQYe7aHoRitPIe7OHo1itVYe8qHrcMepzHdIyqZMelPHcMyqKMeh5HbQyqvMeejHaAyqlMeSYNkMPYFQCLIMlWOckkiIGulWfswbSOaBkOgYZHRGYy4mRpejJXcS8qipeaZGWm4mioHhdPHW6esoMeJQXW6SsoCeJNbW5CsoxhdSbi7aCsLbSPkNk6PYAQCMWBk6gG",
      "DATA=rlOq06SnoMdtJq05inoidtPHi6exo_eJUHC7uCoWitTse7OCo_fZXbi8qnoHeJJri40ionaZIam4mdodcdIaG5ixoseJUIe78Ho_hdXbW8qxpeitScS7aMo1jJTsS7OMo_kZXcy8qRo_jJQYS6SMoMkWW4EmocIrH4Kyk40RoikZIcy4mRodjJGYe5WCoxhdUISkcBILLOQPek-mIrMWJjyiErccJiM6EjANG",
      "NONE",
      "NONE",
      "NONE",
      "DATA=byLQQjAGIwJiLOkk-cIVJiR6ck-Q2hfLVHzPCCAxf2LXjRaCAWf2SbiiYLImH4UyElMLG",
      "DATA=imM5Pj6AsHMKM5DjUusBKuPXPkCxsNfeQrfkWrsUL0RPrk6AsQLGa",
      "DATA=HBLYe5WHoMitOse6SHoWitSa06SnoMdtOq05Wnoxdujj1csyqKK8jiLcseqKP8jkWjgGI0JiVOYmoGI5OiH6cikmImJlKG08qno1itGYea",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=BLUE",
      "START=0piGpYiQoijJGYS4GRonkZKIS5CRoCjJNcS5CMosjJJsy6SRo1jJScS7aMo6jJTsS7ORo_jJVYS8qdo6aZVWm78io6cdTqG7aioRcdQWm7ado1aZNaG5CioCaZLWm5idoscdJqm40ioiaZIaG4mdondtJse5iHosdtLW05WnoCeJLXi5CHoxhdNce5WCoRhdQYy6SHoReJQW07anoWeJSce7aCo1itUIe7uno6dtXcSikLIcH4W4EmoLG",
      "DATA=rmdHHaKyqegefj5bwIWyj0hcPcgQqMjSkchcICqOfKjHjckoWGcSiaBcidoCitNbW6eCoHitJsy40RoikZIcy4GHoihdJrW40Ho1hdTse7adoWdtSaG7uio1aZTq07aCoWitUHW7OHo_itVXW8qCpeiuePK7OnoWjJNbC40noncdJqm5idosdtKGG5CncGLGLOElsLI5H9Wisl6rI1fOa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "END=aya",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "course_6": [
      "NONE",
      "DATA=eyScwk2HcQhqPzQkeycCfOLjoHavirKcfO8HOsIWkOLXGjizmRaZkWGYSnmWdtnq0ZOnm_dtra0lMrJdkQUzC4miodaZIam40donkZIcS4mRodjJGYea",
      "DATA=uiGW0i2mcsIGLWGjUfIMa4QWwlypI7eqWbemmnccOiH6dGGsyif2cbXQeiAHdwOrikacIiJwpXDJ8Cy_iqSWUk-h2vLvjO4jQz1ckJdseW0MmnkZirWYeHmHjJeISZaMmRjJjIyZuMm6jJpYy0qMiBLsibCa",
      "DATA=uOGOWiEmcdh4Ij-i4FcsNGLXWjUzIBNOMIojCOcskJNam6edoMaZQWm7ado1aWUqkmoQIWfqRP2kOFIOgWRjKQisINfJKGG5CdoxcdKGm40noncdJqmmoIdajGVcMmmmI-cOUyEIWuOYMGa",
      "DATA=qyGWWiGmcndiKG2jCpcBKqN5skmycMM4Qz-kWKcUQiSYQikGIwQOK6AjaJcmh4HX9kCeYPHCPixkohYJcKOWZksoYMJ8Qq9kMnsPI0P4TlaeYYHmRGzk2isTIKRyXk4osVJ8SG_loos0bKTiHlsks0JeVaZlWkY7cuVqLlShs9b0UWvl0fs8a8VbblQrs8eKVzflOAY8gSVHRl4CY-hSVIdl4IY6hmUH7lOGY6iSVcFl2Ms_jmWknmiHY6PKUstlEJs2iAdcsHejiViaa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBOse5CHoWdtPG0kwGIUQOOiWkKCI0eyTiWlohonkZJsy40HonhdJrC5isosfZNbi5WnoCcdKHW5iRcwLWKPSjUvcFeqNGEjSdcuQGKIujgGosdtKGm40doiaZIbi4GxodfZGXW4GCoiitGYe4mMoijJIcS4mRo6aZVWm8qdpecdXa08qspeitVXi78no_cdUGG7Ono6eJSce7aCo1aWRQukQIcTMySak4GnoncdJrjOmsAddwGWHOmdAicgJq1PiiAxa2LWHPCnAxeJTsS78Mo1jJTse78Co1hdTrClewy6k2oIzJOHy6hgoHDJ8xzehgpYfKqMy_k2rcS8qxa",
      "NONE",
      "DATA=bBGWm4mioddtGXi4mxodhdGYe4mModkZIcS4GMoiitIbW4GxoieJIa04GioiaZNbC5CsoncdLXW40MonitJrW40xoneJJq05CxoRfZSbi7Oio_aZXam8qipeeJXa08qxpehdXce8qMpekZVYS7OMoWhdSbC7Ono6eJUHC7OCo6itVYe78Mo_hdVXC78so_dtVWGJaHiWdsnriJuxi1hcnseJuniVIclGmI-MiTQRNbW5WsoCdtNaG5WdoCitNcy5WRoxkZLYy5CHosjJKIS40RositKHW5ixoseJKG05CnoxcdLWm5iiosaZJqm6SioRdtQXi6SCoRitQYy7ORo1kZTsy7Odo1aZTqGa",
      "DATA=byRymkYicPdaPq8kktIKMaP5WkQGcSPqRsQjAdctb4KaWi4rcoLOJ5WjgHcujyLYOG6iikLia",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "START=b_dPDZIxglgXH52yoGg8MXWb2CoGcoKyJOYi6hIoGOUjglImI4H4UilIedyMa2kWHHWiyWdwfW0P0IQPiQUIKOUOG",
      "DATA=ezW42B-lM7cHTWUCqFhaijVciBGGgZNGSOIlgdcUQPRXWASAmMdtjHiAGwIJfOPHQk2GIPNGRIwJOuSxaZfWGXCnmxeJfXCXCCmxitfYyXCRa",
      "DATA=FiWOYl0mI3JjNbaz0ugGfWQ4Ik6dMPdqSOYI4nIQetfXiXCnmxcdfWmzUigBJaMjAjWAcHgWPHUXiRmxkZhcSYeRmMkZkYSZaRisjJJse4GHoditJsy40RoddtGWG4mdoiaZJqm5idoscdKG040noidtJqGGGic0P4Usul4JJdiOa",
      "DATA=riLykjChIVMGTjMlEDI1OGSkkk0EIQMGPPAkksIEJWMOUk-dcDkOMIAjCIIqGOIWkiAfcdcqIbYimEOYNOKX8jaBclMqTiulMhc-IaW4Ia",
      "NONE",
      "NONE",
      "NONE",
      "END=aia",
      "DATA=n7LWm5iiondqRakkWhIPI4OHkj2vIdgaMHMjyDcTQAaQSyCRgcPJGXi4mnodcdGWm4GdonaZIaG4GnoncdKGmIApUMfZQXi7ano1cdTqm7OdoHhdXce78Ho6hdUIe7uCo1itSbW7aHoRitTsy7OMo_jJXcy8qRo_kZUIS7uRc8KiM4Ya",
      "DATA=rDqWkjKcIzH4MOYjYrIokOJkwGsdugbJnqG0qim_cdoGGZaimRccq42I0QSMhdkXWZaCm1hdoHWlMGIDLRdriW0nmnfWJjUiYGSHitirW7uno6dtVW08qspefZXbW8qHodjJIcyGiRihQZUGm7udoWaWa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=bBLYS5iMonitIbW4GxoxaZKGG40noieJKGm40doiaZIaG40ioidtIce4GMoikZJsS40MoskZSam7uio6dtVWG7Oio_dtTqm7Odo_aZVYe7OHo1jJScS7uRo6jJVYy7ORo_kYdrCjgGIwPyKyYjAhIVH4TiYlsGIVPAoHC78so_fZVXWKqRjejIrceKqCjefYrbiKqnjeccramGmRidjIaYeGmCidfYaXiGmnidccaWma",
      "DATA=byGO6iCrImeWW5wmocIlQGHYcikDI_MBkWmYSimMcdiqGXWimxcdeGGGmdddhGW6oKoRcijBjHCYexmCfZfXCXixmRfWIbUiYygdcbLPWHgCgsirJr4AuLMOkjQ6Sk-wIYKOSrUa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "ITEM=METAL",
      "DATA=bAeISHiMisiseHWHixiseIeG0HiiisaYnsSJuMi1isnrWJuxi1eInq0Juii1aXLYSzCMgxirLXWzCxgxeHLW0zCigxaXSamBaigWdrSbiBaxgWhbSceBaLMWkOa",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=fiWYcl4GI5iiTcak8EIQNaPHKkivIEKyM42jMjcvHGKykmmncTGWSiClqkI4JqVy2IAEOxdya",
      "DATA=rkaWmHididdsdqmyGngicbJqGzihMxb-hanHWiyCdwfW1HinyndwdrjGGsydeJjGGYynmMeJjHCYexmCfZfXCXCCmnhdkWGZaijeaXVWmB8ihecaR4Yk-rI0KyUzgmoGI-iiUkclmGITOiQcckkGIDiiL6dzUBMxaZdrCXCMmxk1GQPG0HyiiwaYeGmia",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ],
    "course_7": [
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=eAR5SQKBkPfkR5sQWGQSJYTrGQoxVekZVYS7ORo1kZUIy78HpeitXcyJ8MUdkZIcS40RoxkZKIS5CMosjJJsy4GModjJGYe4GHonitKIe40CoihdGXW4GxonfZGXC4msoieJJri5inondtIa04mnodcdIaG40ioscdLWG5CdosaZJqm4GdodaZNam7Odo_cdXa08qipeaZVWma",
      "START=0piAQYyimRcdmaGZuim1dtoG0Z8nnedtjIyYSMmWjJnsyZuHm6itpYe0qHmdcdcaGW0imscdfWGXWimdjJccyW0MmsjJfYyXWMCHHgma1Jusy6f2nrXJaHkrfGa",
      "DATA=ulaYeWGHmniteIeXCHmCitiseYyHmRitmceZuHm6itpYe0qHmddtca0W0nmsdtfW0XWnmHdtjG0YSnmWdtnq0ZOnm_dtra0O2AkFeISbOa",
      "DATA=qBaW0WGnmndteG0ZaRmWjJmce5CnoCdtOq06esoMeJPHC6SxoRhdSbW4mdoiaZKGm40dodcdIaG40ioscdLWG5WioHcdPGG6edoCaZLWm6ydoMdtQW06SioRaZSam7aioWdtSbi6SsoWfZTrC7uso1dtTqG7udo6aZUGG7Ono6eJUHC7OCo1hdTse7OHo1jJUIy7uRo6kZVYS78MpekZXcy8qHo_itVXW8qCpefZVXi8qso_fZVW08qno_cdXaG78dpeaWGQaiEHIzQOLAEjgLcmOYLIga",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "DATA=n7GWm7ado1aZUGm8qdo_aZVWG7OioMcdOqG5iiodcdLWG5WioxdtKG04GnodeJGW05isoieJLXi5WsoCdtQXi7aso6dtVW078Mo_itVXW7OHo6jJTsy6yxoMhdOrW5WCoCjJLYy5CCosjJKIS5iConjJJsS4GRoijJIbW4GxodfZGXW4mHodjJGYTIeMyMjMkYzJaHy1hgoHDJOsy_f2pXjAMv6HiwNcfPCHAsiwJrXO0HA1dwTqHRaiARcgQW1QynAHdwOrjQexkJJ-NbDPCxAsf2JrDO0sAndwJqHyEcysa2fWnJaMy6hgnsfRusA1f2PIfQSHyRa2jGmOCi2wkJXaGa",
      "DATA=ukWGMRUkk1c6R48QUuQPMQQYcJekRcksQOSQAgkGGYLbWPsvQrecG4mOmpUdjJIcy40MonkZGYS5iRosjILsKPqIOikWa",
      "ITEM=VIOLET",
      "DATA=fiRakmonI-JyUGYk4gIXIyTyUlcwddOOVQolMJI0ORNbC6eCoMitScy5WCoHitNce5WMoHjJPIy6SMpekZVYS7ORo1kZScS6SRoMkZOsS5WRoxkZKIS40RoikZGYS4mMoijJJsy5iMoxjJLYe5iHonitJse4GHoditGXW4GConhdKHW5CCoxfZKHC40xoifZGXC4msoieJJri5isoxeJKG05CnoscdJqG40noidtGW04mioicdGWm4GdonaZKGm5CdoxcaMqkjMhIAdiM5gQWBa",
      "DATA=ulaYeWGHmniteIeWmnmidtdq0XinodcdIaG40ioscdLWG5WioHcdPGG6SioWcdTqG7Oio_cdXaG8qdo_aZUGm7udoWaZQWm6ydoHaZNam5CdosaZJqm4GdodaZGYy4GMonjJKIy5CMoCjJOsy6yMoWjJQYy7uMo6jJVYy8qMpekZVYS7uRo6kZScS6SRoMkZOsS5WRoxkZKIS40RoikZGYS0qHm_itoIeZuHnedtpW0ZOnm1dsObwa",
      "DATA=qyGX-iGEInhtGW04GionaZIam4mdodcaKHUjCAcCgiOjAQOrQWdZJqG5idoxaZNam6edoMaZQWm8qdpecdXa08qspefZXbW78CpeitVYe7OHo6jJVYy8qMpekZVYS7ORo1jJTsS7aRcyQGMYwj4HILLqPbMkeDUscdLWG4Gno_fZVXi78no_cdVWm7Odo1aZSama",
      "NONE",
      "NONE",
      "DATA=bBOse6yHoMhdOrW6exoMfZPHi6esoHdtPG05iRonjJJse40ConfZJri40noncdKGm40dodaZGWG4mnodeJGXC4mCoditGYy4mRoikZIcy40RoiitIbW4GxoieJIa04GioiaZXam8qipedtXbi8qxpehdXce8qMpekZVYS78Mo_itVXW78xo_eJVW078io6aZVWm7Oio6eJUG07Oxo6hdUIe7OMo6kZTsS7udkYhsSG4PMDkzJGa",
      "END=aia",
      "DATA=bBGWm4GdonaZKGm5CdoWaZTqm78ioMcdOqG5WioxcdGWG4mnondtPG07ano6dtVW07asoCeJLXi4msodfZIbC5ixoxfZNbC6yxoRfZSbC7Oxo_fZXbC8qCodhdGYe5iHonitLYe5WHoHitPIe6SHoWitTse8qHo6itXcy8qRo_kZTsS7ORoWkZLYS5iRonkZIcS4mRodjIKjcQUBkGfIUyAa",
      "DATA=eBdsSW0MmsjJeIeXCHmxhdhbWXWxmHfZiriYysmMdtkW0YSimWcdmamZudlcaYWQKQUtQwQsTzYRUokWP6O6ya",
      "DATA=ulVWm8qdpecdXcy8qRo_kZIcS4mRodjJGWG4mdoiaZVXC7Oxo1fZUHi7OCo1aZSam7aio1kZScS7aMoMfZOrC5WxoHeJOrW40xoifZGXC4GsoihdQWG6SdoMaZNam5CdosaZLWG5iionaZLYS5iRonkZNcS5iMoxjJQYS6SMoMkYUskOWmkGcyUAQlMcIGQOOika",
      "DATA=riMakjMhICdaPjokMuIULqQ5KlazIGjyM6ojAIcsiiJsaiGFIdhZSam7udo6aZUGG78io_aZXam8qipedtXbi8qxpehdXce8qMpekZUIS78Ro1kZScS6SRoMkZOsS78no_jJVXi78xo_hdVYe7Ono1cdUIyRqEa",
      "NONE",
      "NONE",
      "DATA=flra0ZOnm_dtnq0ZanmRdtkXiYysmMfZirCYeCmChcPHW8qHpejJXcS78Ro_jJUIS78Ho6jJTsS7OHo1jJScS6SRkJQsLr2O8GQdLIIHmP6qkAcZIam40dodaZGWG4mnodeJIa04Gia",
      "DATA=ukLj-RoBkUJYOYOPWkQkL6WOmOmdkKMkJaIa",
      "DATA=vlGWG4GioscdJqG4mdoiaZJqm5idoxaZLWG5WioCaZQWm6yioMaZQWG7aioWaZTqm7uio6cdUGm78do_cdXaG8qdodjJGYS4GMoikZJsS5iRoxkZNcS6eRoRkZScS7uRo6kZVYS8qRpejJVYy7OMo1jJScy6SMoHjJNcy5CMosjJJsyJuHoMdtQW07ano1dtUG078npedtNce5CHonitKIe4GHodisTjiRSskUeId5WOKAQoLALbQ6yRoMjGa",
      "DATA=rkLGmPSoQGeYPzCQUAkXNkJG6PspQdaZSam7udo1cdUGG7Ono_dtVXi8qspedtXbC8qipeaZVWm7Odo_cdXcS6yRoHkZLYS5WRoskZJsS4GRodkZGYy4mHoijJJsy5iMoxjJIce78Ra",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE",
      "NONE"
    ]
  };

  // src/data/dungeon.js
  var POS_BITS = 8;
  function makeRoom(type, content, exits, items) {
    return {
      type,
      content,
      exits: exits.map((e) => typeof e === "object" ? e : { type: e, needs: void 0 }),
      items: items || [],
      visited: false
    };
  }
  var Dungeon = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.start = { x: 0, y: 0 };
      this.rooms = [];
      for (let x = 0; x < width; x++)
        this.rooms.push(new Array(height).fill(null));
    }
    room(x, y) {
      return this.rooms[x] && this.rooms[x][y] || null;
    }
    ensure() {
    }
    /** Every existing room. */
    *allRooms() {
      for (let x = 0; x < this.width; x++)
        for (let y = 0; y < this.height; y++)
          if (this.rooms[x][y])
            yield { x, y, room: this.rooms[x][y] };
    }
  };
  function decodeEditorRoom(text2) {
    const EDITOR_EXITS = [Exit.WALL, Exit.DOOR, Exit.HIDDEN, Exit.SPECIAL];
    const r = new BitReader(text2);
    const exits = [];
    for (let i = 0; i < 4; i++)
      exits.push(EDITOR_EXITS[r.read(2)]);
    r.read(1);
    const items = [];
    for (; ; ) {
      const type = r.read(4);
      if (type === 0 || r.ended)
        break;
      const x = r.read(POS_BITS);
      const y = r.read(POS_BITS);
      items.push({ type, x, y });
    }
    return { exits, items };
  }
  var ITEM_ROOMS = {
    KEY: [RoomType.BONUS, DungeonBonus.KEY],
    ORANGE: [RoomType.BONUS, DungeonBonus.ORANGE],
    RED: [RoomType.BONUS, DungeonBonus.RED],
    MAP: [RoomType.BONUS, DungeonBonus.MAP],
    RADAR: [RoomType.BONUS, DungeonBonus.RADAR],
    BIGTIME: [RoomType.BONUS, DungeonBonus.BIG_TIME],
    SMALLTIME: [RoomType.BONUS, DungeonBonus.SMALL_TIME],
    BLUE: [RoomType.BALL, DungeonBall.BLUE],
    METAL: [RoomType.BALL, DungeonBall.METAL],
    VIOLET: [RoomType.BALL, DungeonBall.VIOLET],
    GREEN: [RoomType.BALL, DungeonBall.GREEN]
  };
  function loadDungeon(name) {
    const lines = levels_generated_default[name];
    if (!lines)
      throw new Error("unknown dungeon " + name);
    const W = 8;
    const H = 8;
    const parsed = [];
    for (let x = 0; x < W; x++)
      parsed.push([]);
    let start2 = null;
    lines.forEach((line, i) => {
      const x = i % W;
      const y = Math.floor(i / W);
      const [kind, value] = line.split("=");
      switch (kind) {
        case "NONE":
          parsed[x][y] = null;
          break;
        case "START":
          start2 = { x, y };
          parsed[x][y] = { kind: "editor", ...decodeEditorRoom(value) };
          break;
        case "DATA":
          parsed[x][y] = { kind: "editor", ...decodeEditorRoom(value) };
          break;
        case "ITEM":
          if (!ITEM_ROOMS[value])
            throw new Error(name + " : unknown item " + value);
          parsed[x][y] = { kind: "item", type: ITEM_ROOMS[value][0], content: ITEM_ROOMS[value][1] };
          break;
        case "END":
          parsed[x][y] = { kind: "item", type: RoomType.BOSS };
          break;
        default:
          throw new Error(name + " : unknown room " + kind);
      }
    });
    if (!start2)
      throw new Error(name + " : no start");
    const neighbourExit = (x, y, d) => {
      const n = parsed[x + DIR_DX[d]] && parsed[x + DIR_DX[d]][y + DIR_DY[d]];
      if (!n || n.kind !== "editor")
        return Exit.WALL;
      return n.exits[OPPOSITE[d]] === Exit.WALL ? Exit.WALL : Exit.DOOR;
    };
    const dungeon = new Dungeon(W, H);
    dungeon.start = start2;
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const p = parsed[x][y];
        if (!p)
          continue;
        if (p.kind === "editor") {
          const exits = p.exits.map((e) => ({ type: e, needs: e === Exit.SPECIAL ? DungeonBall.GREEN : void 0 }));
          dungeon.rooms[x][y] = makeRoom(RoomType.NORMAL, void 0, exits, p.items);
        } else {
          const exits = [0, 1, 2, 3].map((d) => neighbourExit(x, y, d));
          dungeon.rooms[x][y] = makeRoom(p.type, p.content, exits);
        }
      }
    }
    return dungeon;
  }

  // src/data/generator/util.js
  var Retry = class {
    constructor(reason) {
      this.reason = reason;
    }
  };
  var rnd = (n) => Math.floor(Math.random() * n);
  var rbool = () => Math.random() < 0.5;
  var random2 = (min, max) => max <= min ? max : rnd(max - min + 1) + min;
  function shuffle(a) {
    for (let i = 0; i < a.length; i++) {
      const p = rnd(a.length - i) + i;
      [a[i], a[p]] = [a[p], a[i]];
    }
    return a;
  }
  function newTable(w, h, v) {
    const t = [];
    for (let x = 0; x < w; x++)
      t.push(new Array(h).fill(v));
    return t;
  }
  function retry(count, fn) {
    for (let n = 1; ; n++) {
      try {
        return fn();
      } catch (e) {
        if (!(e instanceof Retry) || n >= count)
          throw e;
      }
    }
  }
  var SHAPES_DATA = "itaZgmzqyWaaFG_X_5_5_5_5_5_4_WFGaceaaaddaF-b_4h_G_-h_-_____3_-p_GF-b_Wh_GmmaaauOaaWlr_J-pX_I0daafkda_h-_7____5_J8dbZGaaFWp_h_X_-F_V_7_-F_N_5_8p_b_aaauR_V______________Zg______";
  function readLayout() {
    const r = new BitReader(SHAPES_DATA);
    const L2 = {
      delta: r.read(5),
      // 4
      cwidth: r.read(10),
      // 152
      cheight: r.read(10),
      // 102
      cborder: r.read(5),
      // 6
      redWidth: r.read(5),
      // 6
      redHeight: r.read(5),
      // 6
      ballRadius: r.read(8) / 10 * 1.3,
      shapes: []
    };
    for (let i = 0; i < 7; i++) {
      const w = r.read(5);
      const h = r.read(5);
      const t = newTable(w, h, false);
      for (let x = 0; x < w; x++)
        for (let y = 0; y < h; y++)
          t[x][y] = r.read(1) === 1;
      L2.shapes.push(t);
    }
    L2.redShape = newTable(L2.redWidth, L2.redHeight, true);
    return L2;
  }
  var Layout = readLayout();
  var Shape = { BUMPER: 0, CLOCK: 1, DEATH: 2, MAGNET: 3, GHOST: 4, BLOCK: 5 };

  // src/data/generator/map.js
  var UP = 0;
  var DOWN = 1;
  var LEFT = 2;
  var RIGHT = 3;
  var DIRS2 = [UP, DOWN, LEFT, RIGHT];
  var FIELD = ["rup", "rdown", "rleft", "rright"];
  var opposite = (d) => [DOWN, UP, RIGHT, LEFT][d];
  var OPENED = { t: "open" };
  var CLOSED = { t: "closed" };
  var INVISIBLE = { t: "invisible" };
  var needs = (o) => ({ t: "need", o });
  var isClosed = (p) => p.t === "closed";
  var OBJECTS_COUNT = 4;
  var BONUS_COUNTS = [[1, 1], [1, 1], [1, 1], [1, 1], [0, 99], [0, 99], [0, 2]];
  var BONUS_PROBAS = [10, 10, 10, 10, 6, 7, 2];
  var BONUS_MIN_COUNT = 4;
  function canBlockOnlyDoor(o) {
    return o === DungeonBall.GREEN || o === DungeonBall.BLUE ? rbool() : false;
  }
  function canHaveInvisibleDoor(b) {
    switch (b) {
      case DungeonBonus.ORANGE:
      case DungeonBonus.RED:
        return rbool();
      case DungeonBonus.MAP:
        return false;
      case DungeonBonus.BIG_TIME:
        return true;
      default:
        return rnd(4) === 0;
    }
  }
  function newDungeon(w, h) {
    const map = [];
    for (let x = 0; x < w; x++) {
      map[x] = [];
      for (let y = 0; y < h; y++)
        map[x][y] = { rtype: null, rup: CLOSED, rdown: CLOSED, rleft: CLOSED, rright: CLOSED, x, y };
    }
    return { dmap: map, dwidth: w, dheight: h, dstart: null, dexit: null, dist_table: null };
  }
  var room = (d, p) => d.dmap[p.x][p.y];
  var posEq = (a, b) => a.x === b.x && a.y === b.y;
  var randPos = (d) => ({ x: rnd(d.dwidth), y: rnd(d.dheight) });
  var getPath = (d, p, dir2) => room(d, p)[FIELD[dir2]];
  var setPath = (d, p, dir2, v) => {
    room(d, p)[FIELD[dir2]] = v;
  };
  function move(d, p, dir2) {
    switch (dir2) {
      case UP:
        return p.y === 0 ? null : { x: p.x, y: p.y - 1 };
      case DOWN:
        return p.y === d.dheight - 1 ? null : { x: p.x, y: p.y + 1 };
      case LEFT:
        return p.x === 0 ? null : { x: p.x - 1, y: p.y };
      default:
        return p.x === d.dwidth - 1 ? null : { x: p.x + 1, y: p.y };
    }
  }
  function almostClose(d, p) {
    let kept = false;
    for (const dir2 of shuffle(DIRS2.slice())) {
      if (isClosed(getPath(d, p, dir2)))
        continue;
      if (kept) {
        setPath(d, p, dir2, CLOSED);
        setPath(d, move(d, p, dir2), opposite(dir2), CLOSED);
      } else
        kept = true;
    }
  }
  function randomRoom(d, rtype) {
    while (true) {
      const p = randPos(d);
      if (room(d, p).rtype === null) {
        room(d, p).rtype = rtype;
        return p;
      }
    }
  }
  function genRoom(d, p) {
    let last = p;
    for (const dir2 of shuffle(DIRS2.slice())) {
      const np = move(d, p, dir2);
      if (!np || room(d, np).rtype !== null)
        continue;
      room(d, np).rtype = { k: "normal" };
      setPath(d, p, dir2, OPENED);
      setPath(d, np, opposite(dir2), OPENED);
      last = genRoom(d, np);
      if (rnd(3) !== 0)
        return last;
    }
    return last;
  }
  function genPath(d, s) {
    while (true) {
      const p = randPos(d);
      if (room(d, p).rtype === null)
        continue;
      for (const dir2 of shuffle(DIRS2.slice())) {
        const np = move(d, p, dir2);
        if (!np || getPath(d, p, dir2) === s)
          continue;
        setPath(d, p, dir2, s);
        setPath(d, np, opposite(dir2), s);
        return;
      }
    }
  }
  function genPathMap(d, sp) {
    const m = newTable(d.dwidth, d.dheight, -1);
    function visit(p, n) {
      m[p.x][p.y] = n;
      for (const dir2 of DIRS2) {
        if (isClosed(getPath(d, p, dir2)))
          continue;
        const p2 = move(d, p, dir2);
        const n2 = m[p2.x][p2.y];
        if (n2 === -1 || n2 > n + 1)
          visit(p2, n + 1);
      }
    }
    visit(sp, 0);
    return m;
  }
  var ExitFound = class {
  };
  function genObjects(d, m) {
    let totDist = 0;
    let objCount = 0;
    const objectsFound = [];
    const objectsRooms = [];
    const visited = newTable(d.dwidth, d.dheight, -1);
    function walk(p, acc) {
      const n = m[p.x][p.y];
      visited[p.x][p.y] = totDist++;
      if (posEq(p, d.dexit))
        throw new ExitFound();
      let flag = false;
      for (const dir2 of shuffle(DIRS2.slice())) {
        if (isClosed(getPath(d, p, dir2)))
          continue;
        const p2 = move(d, p, dir2);
        if (visited[p2.x][p2.y] !== -1)
          continue;
        const n2 = m[p2.x][p2.y];
        if (acc.length > 0 && rnd(6) === 0) {
          shuffle(acc);
          objectsRooms.push({ p, dir: dir2, n: acc[0] });
          acc = acc.slice(1);
        }
        if (n2 > n && (!flag || rnd(4) !== 0)) {
          acc = walk(p2, acc);
          totDist++;
        }
        flag = true;
      }
      let nways = 0;
      for (const dir2 of DIRS2)
        if (!isClosed(getPath(d, p, dir2)))
          nways++;
      if (nways === 1 && objCount < OBJECTS_COUNT) {
        objectsFound.push({ p, n: objCount });
        const copies = [];
        for (let i = rnd(3) + 1; i > 0; i--)
          copies.push(objCount);
        objCount++;
        acc = copies.concat(acc);
      }
      return acc;
    }
    try {
      walk(d.dstart, []);
      throw new Retry("exit not found");
    } catch (e) {
      if (!(e instanceof ExitFound))
        throw e;
    }
    if (objCount !== OBJECTS_COUNT)
      throw new Retry("not enough objects found");
    for (let i = 0; i < OBJECTS_COUNT; i++)
      if (!objectsRooms.some((o) => o.n === i))
        throw new Retry("not enough objects used");
    const otable = shuffle([DungeonBall.GREEN, DungeonBall.BLUE, DungeonBall.METAL, DungeonBall.VIOLET]);
    for (const o of objectsRooms) {
      const obj = otable[o.n];
      if (canBlockOnlyDoor(obj)) {
        setPath(d, o.p, o.dir, needs(obj));
        setPath(d, move(d, o.p, o.dir), opposite(o.dir), needs(obj));
      } else
        room(d, o.p).rtype = { k: "objneed", o: obj };
    }
    for (const o of objectsFound)
      room(d, o.p).rtype = { k: "objfound", o: otable[o.n] };
  }
  function distObjectsMin(d, p) {
    const list = d.dist_table[p.x][p.y];
    let min = [-1, []];
    let i = 0;
    while (i < list.length) {
      const e = list[i];
      if (min[0] === -1) {
        min = e;
        i++;
      } else if (min[0] > e[0]) {
        min = [e[0], min[1]];
      } else if (e[1].length < min[1].length) {
        min = [min[0], e[1]];
      } else if (e[0] === min[0] && e[1].length === min[1].length) {
        min = e;
        i++;
      } else
        i++;
    }
    return min;
  }
  function checkDifficulty(d) {
    const m = newTable(d.dwidth, d.dheight, null);
    for (let x = 0; x < d.dwidth; x++)
      for (let y = 0; y < d.dheight; y++)
        m[x][y] = [];
    function included(l1, l2) {
      let i = 0, j = 0;
      while (true) {
        if (i >= l1.length)
          return true;
        if (j >= l2.length)
          return false;
        if (l2[j] < l1[i]) {
          j++;
        } else if (l2[j] === l1[i]) {
          i++;
          j++;
        } else
          return false;
      }
    }
    function addSorted(x, l) {
      const r2 = l.slice();
      for (let i = 0; i < r2.length; i++) {
        if (r2[i] === x)
          return r2;
        if (r2[i] > x) {
          r2.splice(i, 0, x);
          return r2;
        }
      }
      r2.push(x);
      return r2;
    }
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    function explore(objs, dist3, p) {
      const rt = room(d, p).rtype;
      if (rt && rt.k === "objfound")
        objs = addSorted(rt.o, objs);
      m[p.x][p.y].unshift([dist3, objs]);
      if (rt && rt.k === "objneed" && objs.indexOf(rt.o) < 0)
        return;
      for (const dir2 of DIRS2) {
        const path = getPath(d, p, dir2);
        if (isClosed(path))
          continue;
        if (path.t === "need" && objs.indexOf(path.o) < 0)
          continue;
        const p2 = move(d, p, dir2);
        const known = m[p2.x][p2.y];
        if (known.every((e) => !included(objs, e[1])) || !known.some((e) => same(objs, e[1]) && e[0] <= dist3 + 1))
          explore(objs, dist3 + 1, p2);
      }
    }
    explore([], 0, d.dstart);
    d.dist_table = m;
    const r = distObjectsMin(d, d.dexit);
    if (r[0] < d.dwidth * d.dheight * 40 / 100)
      throw new Retry("not enough difficulty");
    if (r[1].length !== OBJECTS_COUNT)
      throw new Retry("not enough objects for ending level");
  }
  function genObjectsFinal(d) {
    const NO_EXIT = -1, SEVERAL = -2;
    function isImpass(p, exclDir) {
      const rt = room(d, p).rtype;
      let result = rt && rt.k === "normal" ? NO_EXIT : SEVERAL;
      for (const dir2 of DIRS2) {
        if (dir2 === exclDir || isClosed(getPath(d, p, dir2)))
          continue;
        if (result === NO_EXIT)
          result = dir2;
        else
          return SEVERAL;
      }
      return result;
    }
    function impassStart(p, dir2) {
      while (true) {
        const p2 = move(d, p, dir2);
        const back = opposite(dir2);
        const r = isImpass(p2, back);
        if (r === NO_EXIT)
          throw new Retry("impass");
        if (r === SEVERAL)
          return { sp: p2, dir: back };
        p = p2;
        dir2 = r;
      }
    }
    const deadEnds = [];
    for (let x = 0; x < d.dwidth; x++) {
      for (let y = 0; y < d.dheight; y++) {
        const p = { x, y };
        for (const dir2 of DIRS2) {
          if (getPath(d, p, dir2).t !== "need")
            continue;
          const p2 = move(d, p, dir2);
          if (distObjectsMin(d, p)[0] < distObjectsMin(d, p2)[0])
            setPath(d, p2, opposite(dir2), OPENED);
        }
        const r = isImpass(p);
        if (r >= 0)
          deadEnds.unshift({ p, s: impassStart(p, r) });
      }
    }
    const imps = shuffle(deadEnds);
    if (imps.length < BONUS_MIN_COUNT)
      throw new Retry("not enough impass for bonuses");
    const bonusTbl = [];
    let probaTot = 0;
    let bpos = 0;
    const counts = BONUS_COUNTS.map(([min, max], n) => {
      for (let i = 1; i <= min; i++) {
        bonusTbl[bpos] = n;
        if (n === DungeonBonus.MAP && distObjectsMin(d, imps[bpos].p)[0] > 10)
          throw new Retry("map is too far");
        bpos++;
      }
      if (max > min)
        probaTot += BONUS_PROBAS[n];
      return max - min;
    });
    while (bpos < imps.length) {
      let p = rnd(probaTot);
      let pos = 0;
      while (p > BONUS_PROBAS[pos] || counts[pos] === 0) {
        while (counts[pos] === 0) {
          pos++;
          if (pos >= counts.length)
            throw new Retry("bonus");
        }
        if (p > BONUS_PROBAS[pos]) {
          p -= BONUS_PROBAS[pos];
          pos++;
          if (pos >= counts.length)
            throw new Retry("bonus");
        }
      }
      bonusTbl[bpos] = pos;
      counts[pos]--;
      if (counts[pos] === 0)
        probaTot -= BONUS_PROBAS[pos];
      bpos++;
    }
    imps.forEach((imp, n) => {
      const b = bonusTbl[n];
      room(d, imp.p).rtype = { k: "bonus", b };
      if (canHaveInvisibleDoor(b))
        setPath(d, imp.s.sp, imp.s.dir, INVISIBLE);
    });
  }
  function genDungeonOnce(w, h) {
    const d = newDungeon(w, h);
    const sp = randomRoom(d, { k: "start" });
    genRoom(d, sp);
    const ep = randPos(d);
    d.dstart = sp;
    d.dexit = ep;
    room(d, ep).rtype = { k: "end" };
    for (let i = 0; i <= w * h / 6; i++) {
      genPath(d, OPENED);
      genPath(d, CLOSED);
    }
    almostClose(d, ep);
    const m = genPathMap(d, sp);
    let count = 0;
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        if (m[x][y] === -1) {
          d.dmap[x][y].rtype = null;
        } else {
          if (d.dmap[x][y].rtype === null)
            d.dmap[x][y].rtype = { k: "normal" };
          count++;
        }
      }
    }
    const ert = room(d, ep).rtype;
    const srt = room(d, sp).rtype;
    if (!ert || ert.k !== "end" || !srt || srt.k !== "start")
      throw new Retry("exit or start erased");
    if (count < w * h * 3 / 4)
      throw new Retry("not enough superficy");
    retry(51, () => genObjects(d, m));
    checkDifficulty(d);
    genObjectsFinal(d);
    return d;
  }
  function generateMap(w, h) {
    return retry(Infinity, () => genDungeonOnce(w, h));
  }
  function emptyMap(w, h) {
    const d = newDungeon(w, h);
    d.dstart = { x: 0, y: 0 };
    d.dexit = { x: 0, y: 0 };
    d.dist_table = newTable(w, h, null);
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        d.dist_table[x][y] = [];
        d.dmap[x][y].rtype = { k: "normal" };
      }
    return d;
  }

  // src/data/generator/rooms.js
  var L = Layout;
  var isClosed2 = (p) => p.t === "closed";
  var CNONE = 0;
  var CBORDER = 1;
  var CBUMPER = 2;
  var CREDBLUE = 3;
  var CBLOCK = 4;
  var CHOLE = 5;
  var BLOCK_MASK = 1 << 16;
  var HOLE_MASK = 1 << 17;
  var BIT_MASK = 65535;
  var DOOR_SIZE2 = 110;
  var MAX_BUMPER_TIME = 3;
  var CLASSIC_EXIT_TBL = newTable(10, 10, true);
  var bumperForObject = (o) => o === DungeonBall.GREEN ? Item.BLOCK : o === DungeonBall.BLUE ? Item.HOLE : o === DungeonBall.METAL ? Item.MAGNET : Item.GHOST;
  var collideForObject = (o) => o === DungeonBall.GREEN ? CBLOCK : CHOLE;
  var WALL_W = (L.cwidth - L.cborder * 2) / 10 | 0;
  var WALL_H = (L.cheight - L.cborder * 2) / 10 | 0;
  function newColTable() {
    const c = newTable(L.cwidth, L.cheight, CNONE);
    for (let x = 0; x < L.cborder; x++) {
      for (let y = 0; y < L.cheight; y++) {
        c[x][y] = CBORDER;
        c[L.cwidth - x - 1][y] = CBORDER;
      }
    }
    for (let y = 0; y < L.cborder; y++) {
      for (let x = 0; x < L.cwidth; x++) {
        c[x][y] = CBORDER;
        c[x][L.cheight - y - 1] = CBORDER;
      }
    }
    return c;
  }
  function genPos(ctbl, btbl, txt) {
    for (let n = 0; n < 100; n++) {
      const px = random2(L.cborder, L.cwidth - L.cborder * 2 - btbl.length);
      const py = random2(L.cborder, L.cheight - L.cborder * 2 - btbl[0].length);
      if (isFree(ctbl, btbl, px, py))
        return { x: px, y: py };
    }
    throw new Retry(txt);
  }
  function isFree(ctbl, btbl, px, py) {
    for (let x = 0; x < btbl.length; x++)
      for (let y = 0; y < btbl[x].length; y++)
        if (btbl[x][y] && ctbl[px + x][py + y] !== CNONE)
          return false;
    return true;
  }
  function fillPos(ctbl, btbl, p, v) {
    for (let x = 0; x < btbl.length; x++)
      for (let y = 0; y < btbl[x].length; y++)
        if (btbl[x][y])
          ctbl[p.x + x][p.y + y] = v;
  }
  function fillWall(blist, x, y, ctbl, c, btype) {
    const sx = L.cborder + x * 10;
    const sy = L.cborder + y * 10;
    if (ctbl[sx][sy] !== CNONE)
      return;
    blist.unshift([btype, { x: sx, y: sy }]);
    for (let i = 0; i < 10; i++)
      for (let j = 0; j < 10; j++)
        ctbl[i + sx][j + sy] = c;
  }
  function computeRoomTbl(ctbl, spos) {
    const delta = L.delta;
    const bray = L.ballRadius + delta / 2;
    const cb = L.cborder / 2 | 0;
    const m = newTable(L.cwidth, L.cheight, -1);
    const AX = [];
    const AY = [];
    for (let n = 0; n < 32; n++) {
      const a = n * 2 * 3.14159 / 32;
      AX.push(Math.cos(a) * bray);
      AY.push(Math.sin(a) * bray);
    }
    for (let y = cb; y <= L.cheight - 1 - cb; y++) {
      for (let x = cb; x <= L.cwidth - 1 - cb; x++) {
        const sx = (x + 0.5) * delta;
        const sy = (y + 0.5) * delta;
        let acc = 0;
        for (let n = 0; n < 32; n++) {
          const c = ctbl[Math.trunc((sx + AX[n]) / delta)][Math.trunc((sy + AY[n]) / delta)];
          if (c === CNONE || c === CREDBLUE)
            continue;
          if (c === CHOLE) {
            acc |= HOLE_MASK;
            continue;
          }
          if (c === CBLOCK) {
            acc |= BLOCK_MASK;
            continue;
          }
          acc = -1;
          break;
        }
        m[x][y] = acc;
      }
    }
    const get = (x, y) => m[x] === void 0 || m[x][y] === void 0 ? -1 : m[x][y];
    const NX = [-1, 1, 0, 0];
    const NY = [0, 0, -1, 1];
    const stack = [];
    function enter(x, y, acc) {
      const b = get(x, y);
      acc = acc | b & (HOLE_MASK | BLOCK_MASK);
      m[x][y] = b === -1 ? 1 : b + 1 | acc;
      stack.push({ x, y, acc, next: 0 });
    }
    enter(spos.x, spos.y, 0);
    while (stack.length) {
      const f = stack[stack.length - 1];
      if (f.next === 4) {
        stack.pop();
        continue;
      }
      const k = f.next++;
      const nx = f.x + NX[k];
      const ny = f.y + NY[k];
      if ((get(nx, ny) & BIT_MASK) === 0)
        enter(nx, ny, f.acc);
    }
    return m;
  }
  var calcMask = (obj) => 16777215 - (obj === null || obj === void 0 ? 0 : obj === DungeonBall.GREEN ? BLOCK_MASK : HOLE_MASK);
  function fillDoors(r, ctbl) {
    let spos = null;
    const blist = [];
    function fillDoor(path, sx, sy, dx, dy, dpx, dpy) {
      if (isClosed2(path))
        return;
      for (let x = 0; x < dx; x++)
        for (let y = 0; y < dy; y++)
          ctbl[x + sx][y + sy] = CNONE;
      if (path.t === "open" || path.t === "invisible")
        spos = { x: sx + dpx, y: sy + dpy };
    }
    const wallXmax = WALL_W - 1;
    const wallYmax = WALL_H - 1;
    function fillBlock(path, sx, sy, ex, ey) {
      if (path.t !== "need")
        return;
      const c = collideForObject(path.o);
      const b = bumperForObject(path.o);
      for (let x = sx; x <= ex; x++) {
        for (let y = sy; y <= ey; y++) {
          const px = L.cborder + x * 10;
          const py = L.cborder + y * 10;
          blist.unshift([b, { x: px, y: py }]);
          for (let i = 0; i < 10; i++)
            for (let j = 0; j < 10; j++)
              ctbl[px + i][py + j] = c;
        }
      }
    }
    const cb = L.cborder - 1;
    const doorCsize = (DOOR_SIZE2 + L.delta - 1) / L.delta | 0;
    const doorX = (L.cwidth - doorCsize) / 2 | 0;
    const doorY = (L.cheight - doorCsize) / 2 | 0;
    const half = doorCsize / 2 | 0;
    fillDoor(r.rleft, 1, doorY, cb, doorCsize, cb - 1, half);
    fillDoor(r.rright, L.cwidth - L.cborder, doorY, cb, doorCsize, 1 - cb, half);
    fillDoor(r.rup, doorX, 1, doorCsize, cb, half, cb - 1);
    fillDoor(r.rdown, doorX, L.cheight - L.cborder, doorCsize, cb, half, 1 - cb);
    fillBlock(r.rleft, 1, 0, 1, wallYmax);
    fillBlock(r.rright, wallXmax - 1, 0, wallXmax - 1, wallYmax);
    fillBlock(r.rup, 0, 1, wallXmax, 1);
    fillBlock(r.rdown, 0, wallYmax - 1, wallXmax, wallYmax - 1);
    if (spos === null)
      throw new Retry("no entrance");
    return { spos, blist };
  }
  function checkDoors(r, mtbl, obj) {
    const roomMask = calcMask(obj);
    function checkDoor(path, sx, sy, dx, dy) {
      if (isClosed2(path))
        return;
      const mask = path.t === "need" ? roomMask & calcMask(path.o) : roomMask;
      for (let x = 0; x < dx; x++)
        for (let y = 0; y < dy; y++)
          if ((mtbl[x + sx][y + sy] & mask) !== 1)
            throw new Retry("check door");
    }
    const cb = L.cborder - 1;
    const doorCsize = ((DOOR_SIZE2 + L.delta - 1) / L.delta | 0) - 6;
    const doorX = (L.cwidth - doorCsize) / 2 | 0;
    const doorY = (L.cheight - doorCsize) / 2 | 0;
    checkDoor(r.rleft, cb, doorY, 1, doorCsize);
    checkDoor(r.rright, L.cwidth - L.cborder, doorY, 1, doorCsize);
    checkDoor(r.rup, doorX, cb, doorCsize, 1);
    checkDoor(r.rdown, doorX, L.cheight - L.cborder, doorCsize, 1);
  }
  function checkRed(p, mtbl, obj) {
    const mask = calcMask(obj);
    for (let x = 0; x < L.redWidth; x++)
      for (let y = 0; y < L.redHeight; y++)
        if ((mtbl[p.x + x][p.y + y] & mask) !== 1)
          throw new Retry("check red");
  }
  function putRedBlue(mtbl, ctbl, obj) {
    for (let n = 100; n > 0; n--) {
      const p = genPos(ctbl, L.redShape, "redblue");
      try {
        checkRed(p, mtbl, obj);
        fillPos(ctbl, L.redShape, p, CREDBLUE);
        return p;
      } catch (e) {
        if (!(e instanceof Retry))
          throw e;
      }
    }
    throw new Retry("put redblue");
  }
  function genRedBlues(mtbl, ctbl, obj, n, btype) {
    const list = [];
    for (; n > 0; n--)
      list.push([btype, putRedBlue(mtbl, ctbl, obj)]);
    return list;
  }
  function genSeparators(r, ctbl, btype, gap) {
    const xdoor = (WALL_W / 2 | 0) - 1;
    const xdoor2 = (WALL_W / 2 | 0) + 1;
    const ydoor = (WALL_H / 2 | 0) - 1;
    const ydoor2 = (WALL_H / 2 | 0) + 1;
    const half = gap / 2 | 0;
    const half2 = (gap - 1) / 2 | 0;
    const open = (p) => !isClosed2(p);
    const blist = [];
    function separator(horiz2, tries) {
      for (; tries > 0; tries--) {
        const yp = random2(1 + half, WALL_H - 2 - half2);
        const xp = random2(1 + half, WALL_W - 2 - half2);
        if (!horiz2 && xp >= xdoor && xp <= xdoor2 && (open(r.rup) || open(r.rdown)))
          continue;
        if (horiz2 && yp >= ydoor && yp <= ydoor2 && (open(r.rleft) || open(r.rright)))
          continue;
        if (!horiz2 && !(xp >= xdoor2 && open(r.rright) || xp <= xdoor && open(r.rleft)))
          continue;
        if (horiz2 && !(yp >= ydoor2 && open(r.rdown) || yp <= ydoor && open(r.rup)))
          continue;
        if (horiz2) {
          for (let x = 0; x < WALL_W; x++)
            if (x < xp - half || x > xp + half2)
              fillWall(blist, x, yp, ctbl, CBORDER, btype);
        } else {
          for (let y = 0; y < WALL_H; y++)
            if (y < yp - half || y > yp + half2)
              fillWall(blist, xp, y, ctbl, CBORDER, btype);
        }
        return;
      }
    }
    const horiz = rbool();
    separator(horiz, 2);
    if (blist.length)
      separator(!horiz, 2);
    return blist;
  }
  function genObjectNeed(ctbl, obj) {
    const blist = [];
    const c = collideForObject(obj);
    const b = bumperForObject(obj);
    const xmax = WALL_W - 1;
    const ymax = WALL_H - 1;
    const xsize = random2(obj === DungeonBall.BLUE ? 4 : 3, xmax - 2) - 1;
    const ysize = random2(obj === DungeonBall.BLUE ? 4 : 3, ymax - 2) - 1;
    const xp = random2(1, xmax - 1 - xsize);
    const yp = random2(1, ymax - 1 - ysize);
    for (let i = xp; i <= xp + xsize; i++) {
      fillWall(blist, i, yp, ctbl, c, b);
      fillWall(blist, i, yp + ysize, ctbl, c, b);
    }
    for (let j = yp; j <= yp + ysize; j++) {
      fillWall(blist, xp, j, ctbl, c, b);
      fillWall(blist, xp + xsize, j, ctbl, c, b);
    }
    const p = {
      x: xp * 10 + (xsize + 1) * 5 + (L.redWidth / 2 | 0),
      y: yp * 10 + (ysize + 1) * 5 + (L.redHeight / 2 | 0)
    };
    fillPos(ctbl, L.redShape, p, CREDBLUE);
    return [[Item.RED, p]].concat(blist);
  }
  function genExit(ctbl, exit) {
    for (let x = 0; x < 10; x++)
      for (let y = 0; y < 10; y++)
        if (ctbl[exit.x + x][exit.y + y] !== CNONE)
          throw new Error("cannot put exit");
    fillPos(ctbl, CLASSIC_EXIT_TBL, exit, CHOLE);
  }
  function objectNeeded(ctx, obj) {
    const list = ctx.dungeon.dist_table[ctx.pos.x][ctx.pos.y];
    return list.every((e) => e[1].indexOf(obj) >= 0);
  }
  function genNormalRoom(ctx, r, lvl, obj) {
    const classic = ctx.classic;
    const minBumpers = (lvl * 1 / 3 | 0) + 5;
    const maxBumpers = lvl + 7;
    const nbumpers = Math.min(random2(minBumpers, maxBumpers), 30);
    let availableBtime = MAX_BUMPER_TIME;
    let availableMagnet = objectNeeded(ctx, DungeonBall.METAL) && rnd(2) === 0 ? Math.min(random2(0, 4), random2(0, 4)) : Math.min(random2(0, 1), random2(0, 1));
    let availableShadow = objectNeeded(ctx, DungeonBall.VIOLET) && rnd(3) === 0 ? Math.min(random2(0, 2), random2(0, 2)) : 0;
    const ctbl = newColTable();
    let spos, blist;
    if (!classic) {
      const doors = fillDoors(r, ctbl);
      spos = lvl === 0 ? { x: L.cwidth / 2 | 0, y: L.cheight / 2 | 0 } : doors.spos;
      blist = doors.blist;
    } else {
      if (random2(0, 5) !== 0) {
        availableMagnet = 0;
        availableShadow = 0;
      }
      spos = { x: classic.enter.x + 5, y: classic.enter.y + 5 };
      blist = [];
      genExit(ctbl, classic.exit);
      blist.unshift([Item.HATCH, classic.exit]);
    }
    if (obj !== null && obj !== void 0)
      blist = blist.concat(genObjectNeed(ctbl, obj));
    if (!classic)
      blist = blist.concat(genSeparators(r, ctbl, rnd(3) === 0 ? Item.HOLE : Item.BLOCK, Math.max(5 - (lvl / 4 | 0), 1)));
    const bumpers = [];
    for (let i = 0; i < nbumpers; i++) {
      if (rnd(100) < (lvl * 100 / 40 | 0)) {
        if (availableMagnet > 0) {
          availableMagnet--;
          bumpers.push([Item.MAGNET, L.shapes[Shape.MAGNET]]);
        } else if (availableShadow > 0) {
          availableShadow--;
          bumpers.push([Item.GHOST, L.shapes[Shape.GHOST]]);
        } else if (availableBtime > 0 && rnd(5) !== 0) {
          availableBtime--;
          bumpers.push([Item.CLOCK, L.shapes[Shape.CLOCK]]);
        } else {
          bumpers.push([Item.DEATH, L.shapes[Shape.DEATH]]);
        }
      } else {
        bumpers.push([Item.BUMPER, L.shapes[Shape.BUMPER]]);
      }
    }
    for (const [btype, btbl] of bumpers) {
      let pos;
      for (let tries = 0; ; tries++) {
        if (tries === 100)
          throw new Retry("bumper away from the border");
        pos = genPos(ctbl, btbl, "bumper");
        const nearBorder = pos.x < 15 || pos.y < 15 || pos.x > L.cwidth - 15 || pos.y > L.cheight - 15;
        if ((btype === Item.MAGNET || btype === Item.DEATH) && nearBorder)
          continue;
        break;
      }
      fillPos(ctbl, btbl, pos, CBUMPER);
      blist.unshift([btype, pos]);
    }
    const mtbl = computeRoomTbl(ctbl, spos);
    let nblues, nreds;
    if (!classic) {
      nblues = Math.min(random2(0, 4), random2(0, 4)) - 1;
      nreds = Math.min(random2((lvl / 3 | 0) + 1, (lvl * 2 / 3 | 0) + 1), 10);
    } else {
      nblues = Math.min(random2(0, 3), random2(0, 3)) - 1;
      nreds = Math.min(random2(lvl * 2 / 3 | 0, lvl), 10);
    }
    for (const [t, p] of blist)
      if (t === Item.RED)
        checkRed(p, mtbl, obj);
    checkDoors(r, mtbl, obj);
    return blist.concat(genRedBlues(mtbl, ctbl, obj, nreds, Item.RED)).concat(genRedBlues(mtbl, ctbl, obj, nblues, Item.BLUE));
  }
  function genSpecialRoom(r, obj) {
    const ctbl = newColTable();
    const btype = obj === DungeonBall.METAL ? Item.MAGNET : Item.GHOST;
    const btbl = obj === DungeonBall.METAL ? L.shapes[Shape.MAGNET] : L.shapes[Shape.GHOST];
    const doors = fillDoors(r, ctbl);
    let blist = doors.blist.concat(genSeparators(r, ctbl, Item.HOLE, 3));
    for (let i = 1; i <= 20; i++) {
      const pos = genPos(ctbl, btbl, "spe-bumper");
      fillPos(ctbl, btbl, pos, CBUMPER);
      blist.unshift([btype, pos]);
    }
    const ndeaths = random2(2, 5);
    for (let i = 1; i <= ndeaths; i++) {
      const pos = genPos(ctbl, L.shapes[Shape.DEATH], "death");
      fillPos(ctbl, L.shapes[Shape.DEATH], pos, CBUMPER);
      blist.unshift([Item.DEATH, pos]);
    }
    const nreds = random2(4, 10);
    const mtbl = computeRoomTbl(ctbl, doors.spos);
    for (const [t, p] of blist)
      if (t === Item.RED)
        checkRed(p, mtbl, null);
    checkDoors(r, mtbl, null);
    return blist.concat(genRedBlues(mtbl, ctbl, null, nreds, Item.RED));
  }
  function genRoomOnce(ctx, r, lvl) {
    const rt = r.rtype;
    if (rt === null)
      return null;
    switch (rt.k) {
      case "end":
      case "objfound":
      case "bonus":
        return null;
      case "start":
      case "normal":
        return genNormalRoom(ctx, r, lvl, null);
      case "objneed":
        if (rt.o === DungeonBall.GREEN || rt.o === DungeonBall.BLUE)
          return genNormalRoom(ctx, r, lvl, rt.o);
        if (rt.o === DungeonBall.VIOLET && rnd(4) !== 0)
          return genSpecialRoom(r, rt.o);
        if (rt.o === DungeonBall.METAL && rnd(3) !== 0)
          return genSpecialRoom(r, rt.o);
        return genNormalRoom(ctx, r, lvl, null);
    }
    return null;
  }
  function generateRoom(ctx, r, lvl, tries = 1e3) {
    return retry(tries, () => genRoomOnce(ctx, r, lvl));
  }
  function randomHatch() {
    return {
      x: L.cborder + random2(0, WALL_W - 1) * 10,
      y: L.cborder + random2(0, WALL_H - 1) * 10
    };
  }

  // src/data/generator/index.js
  var SIZE = 8;
  function convertExit(p) {
    switch (p.t) {
      case "open":
        return { type: Exit.DOOR };
      case "closed":
        return { type: Exit.WALL };
      case "invisible":
        return { type: Exit.HIDDEN };
      default:
        return { type: Exit.SPECIAL, needs: p.o };
    }
  }
  var ROOM_KINDS = {
    start: RoomType.NORMAL,
    normal: RoomType.NORMAL,
    end: RoomType.BOSS,
    objfound: RoomType.BALL,
    bonus: RoomType.BONUS,
    objneed: RoomType.NEEDS_BALL
  };
  function convertRoom(r, items) {
    if (r.rtype === null)
      return null;
    const kind = r.rtype;
    const content = kind.k === "bonus" ? kind.b : kind.o;
    const exits = [r.rleft, r.rright, r.rup, r.rdown].map(convertExit);
    const list = items ? items.map(([type, p]) => ({ type, x: p.x, y: p.y })) : [];
    return makeRoom(ROOM_KINDS[kind.k], content, exits, list);
  }
  function distances(d) {
    const m = newTable(SIZE, SIZE, -1);
    const visit = (p, n) => {
      m[p.x][p.y] = n;
      for (const dir2 of DIRS2) {
        if (isClosed(getPath(d, p, dir2)))
          continue;
        const p2 = move(d, p, dir2);
        if (m[p2.x][p2.y] === -1 || m[p2.x][p2.y] > n + 1)
          visit(p2, n + 1);
      }
    };
    visit(d.dstart, 0);
    let total = 0;
    let count = 0;
    for (const column of m) {
      for (const n of column) {
        if (n !== -1) {
          total += n;
          count++;
        }
      }
    }
    return { m, average: Math.floor(total / count) };
  }
  function generateChallengeOnce() {
    const map = generateMap(SIZE, SIZE);
    const dist3 = distances(map);
    const dungeon = new Dungeon(SIZE, SIZE);
    dungeon.start = { ...map.dstart };
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const r = map.dmap[x][y];
        const level = Math.floor(dist3.m[x][y] * 10 / dist3.average);
        const ctx = { dungeon: map, pos: { x, y }, classic: null };
        dungeon.rooms[x][y] = convertRoom(r, generateRoom(ctx, r, level));
      }
    }
    return dungeon;
  }
  function generateChallenge() {
    return retry(Infinity, generateChallengeOnce);
  }
  var ClassicDungeon = class extends Dungeon {
    constructor(choices = 5) {
      super(100, choices);
      this.map = emptyMap(this.width, this.height);
      this.generated = 0;
      this.enter = { x: Math.floor(Layout.cwidth / 2) - 3, y: Math.floor(Layout.cheight / 2) - 3 };
      this.hatch = this.newHatch();
      this.ensure(2);
    }
    ensure(column) {
      column = Math.min(column, this.width - 1);
      while (this.generated <= column) {
        const x = this.generated;
        retry(Infinity, () => this.generateLevel(x));
        this.generated++;
        this.enter = this.hatch;
        this.hatch = this.newHatch();
      }
    }
    generateLevel(x) {
      const classic = { enter: this.enter, exit: this.hatch };
      for (let y = 0; y < this.height; y++) {
        const r = this.map.dmap[x][y];
        const ctx = { dungeon: this.map, pos: { x, y }, classic };
        try {
          this.rooms[x][y] = convertRoom(r, generateRoom(ctx, r, Math.floor(x / 2), 100));
        } catch (e) {
          if (e instanceof Retry)
            this.hatch = this.newHatch();
          throw e;
        }
      }
    }
    /**
     * The hatch of the next level, not next to where the ball lands (the
     * entrance) : such levels are very hard or impossible to generate (the
     * original tool could loop forever).
     */
    newHatch() {
      let h;
      do {
        h = randomHatch();
      } while (Math.abs(h.x - this.enter.x) <= 10 && Math.abs(h.y - this.enter.y) <= 10);
      return h;
    }
  };

  // src/game/modes.js
  var MINUTES = 60;
  var MODES = {
    [Mode.CHALLENGE]: {
      title: "Challenge",
      dungeon: () => generateChallenge(),
      startTime: 15 * MINUTES,
      // countdown
      lives: 3,
      // yellow balls at the start
      ballSwitch: true,
      // can change ball
      // time pastille, clock bumper
      bluePastille: 10,
      clockBumper: -5,
      itemTime: true
      // item boxes can give time
    },
    [Mode.ADVENTURE]: {
      title: "Aventure",
      dungeon: (n) => loadDungeon("adv_" + (n + 1)),
      startTime: 18 * MINUTES,
      lives: 5,
      ballSwitch: true,
      bluePastille: 10,
      clockBumper: -5,
      itemTime: true
    },
    [Mode.COURSE]: {
      title: "Course",
      dungeon: (n) => loadDungeon("course_" + (n + 1)),
      chrono: true,
      // the time counts up
      startTime: 0,
      laps: 3,
      lives: 1,
      freeYellow: true,
      // losing the yellow ball costs nothing
      ballSwitch: true,
      bluePastille: -1,
      clockBumper: 5,
      itemTime: false,
      checkpoints: true
      // the zappers are checkpoints
    },
    [Mode.CLASSIC]: {
      title: "Classique",
      dungeon: () => new ClassicDungeon(5),
      startTime: 60,
      maxTime: 100,
      levelBonus: 5,
      // seconds won at each level
      lives: 1,
      ballSwitch: false,
      bluePastille: 2,
      clockBumper: -5,
      itemTime: true,
      openEverywhere: true,
      // the ball may leave a room by any side
      randomStartRow: true
    },
    [Mode.TUTORIAL]: {
      title: "Aide",
      dungeon: () => loadDungeon("tuto"),
      startTime: 15 * MINUTES,
      lives: 3,
      noLoss: true,
      // dying costs nothing
      ballSwitch: true,
      bluePastille: 10,
      clockBumper: -5,
      itemTime: true,
      endsAtBoss: true
      // reaching the boss room ends the tutorial
    }
  };

  // src/game/inventory.js
  var Inventory = class {
    /** @param lives  yellow balls at the start */
    constructor(lives) {
      this.balls = new Array(BALL_TYPE_COUNT).fill(0);
      this.balls[BallType.YELLOW] = lives;
      this.found = /* @__PURE__ */ new Set();
      this.keys = 0;
      this.map = false;
      this.radar = false;
    }
    get total() {
      return this.balls.reduce((a, b) => a + b, 0);
    }
    /** The next colour owned after `type` (cycling), or -1 when none is left. */
    next(type, includeSelf = false) {
      for (let i = includeSelf ? 0 : 1; i <= BALL_TYPE_COUNT; i++) {
        const t = (type + i) % BALL_TYPE_COUNT;
        if (this.balls[t] > 0)
          return t;
      }
      return -1;
    }
  };

  // src/game/entities/effects.js
  var Spark = class extends Effect {
    constructor(x, y) {
      super(x, y, 0.2);
    }
    render(ctx) {
      const t = this.t;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (2 + t * 6), Math.sin(a) * (2 + t * 6));
        ctx.lineTo(Math.cos(a) * (4 + t * 10), Math.sin(a) * (4 + t * 10));
        ctx.stroke();
      }
      ctx.restore();
    }
  };
  var Burst = class extends Effect {
    constructor(x, y, color) {
      super(x, y, 0.3, Layer.ITEM);
      this.color = color;
    }
    render(ctx) {
      sparkle(ctx, this.x, this.y, this.t, this.color);
    }
  };
  var Debris = class extends Effect {
    constructor(x, y, vx, vy) {
      super(x, y, 0.75);
      this.vx = vx;
      this.vy = vy;
      this.angle = Math.random() * Math.PI * 2;
    }
    update(dt) {
      super.update(dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle += 5 * dt;
    }
    render(ctx) {
      const s = 1.2 * (1 - this.t);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.scale(s, s);
      ctx.fillStyle = "#a6e67c";
      ctx.strokeStyle = "#5cae34";
      ctx.lineWidth = 1.5;
      roundRect(ctx, -6, -6, 12, 12, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };
  var BeamFlash = class extends Effect {
    constructor(x1, y1, x2, y2, phase) {
      super(x1, y1, 0.3);
      this.x2 = x2;
      this.y2 = y2;
      this.color = BALL_COLORS[phase][0];
    }
    render(ctx) {
      ctx.save();
      ctx.globalAlpha = 1 - this.t;
      ctx.lineCap = "round";
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x2, this.y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  };
  var Ring = class extends Effect {
    constructor(x, y, radius, color, duration = 0.4) {
      super(x, y, duration);
      this.radius = radius;
      this.color = color;
    }
    render(ctx) {
      ctx.save();
      ctx.globalAlpha = 1 - this.t;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3 * (1 - this.t) + 1;
      circle(ctx, this.x, this.y, this.radius * ease.outQuad(this.t));
      ctx.stroke();
      ctx.restore();
    }
  };

  // src/game/doors.js
  var OPEN_TIME = 0.3;
  var CORNER = 22;
  var OUT = 200;
  var GAPS = [
    { x: -OUT, y: HEIGHT / 2 - DOOR_SIZE / 2, w: BORDER + OUT, h: DOOR_SIZE },
    { x: WIDTH - BORDER, y: HEIGHT / 2 - DOOR_SIZE / 2, w: BORDER + OUT, h: DOOR_SIZE },
    { x: WIDTH / 2 - DOOR_SIZE / 2, y: -OUT, w: DOOR_SIZE, h: BORDER + OUT },
    { x: WIDTH / 2 - DOOR_SIZE / 2, y: HEIGHT - BORDER, w: DOOR_SIZE, h: BORDER + OUT }
  ];
  var JAMBS = [
    [{ x: -OUT, y: -OUT, w: BORDER + OUT, h: HEIGHT / 2 - DOOR_SIZE / 2 + OUT }, { x: -OUT, y: HEIGHT / 2 + DOOR_SIZE / 2, w: BORDER + OUT, h: HEIGHT / 2 - DOOR_SIZE / 2 + OUT }],
    [{ x: WIDTH - BORDER, y: -OUT, w: BORDER + OUT, h: HEIGHT / 2 - DOOR_SIZE / 2 + OUT }, { x: WIDTH - BORDER, y: HEIGHT / 2 + DOOR_SIZE / 2, w: BORDER + OUT, h: HEIGHT / 2 - DOOR_SIZE / 2 + OUT }],
    [{ x: -OUT, y: -OUT, w: WIDTH / 2 - DOOR_SIZE / 2 + OUT, h: BORDER + OUT }, { x: WIDTH / 2 + DOOR_SIZE / 2, y: -OUT, w: WIDTH / 2 - DOOR_SIZE / 2 + OUT, h: BORDER + OUT }],
    [{ x: -OUT, y: HEIGHT - BORDER, w: WIDTH / 2 - DOOR_SIZE / 2 + OUT, h: BORDER + OUT }, { x: WIDTH / 2 + DOOR_SIZE / 2, y: HEIGHT - BORDER, w: WIDTH / 2 - DOOR_SIZE / 2 + OUT, h: BORDER + OUT }]
  ];
  var CORNERS = [
    { kind: "arc", x: BORDER + CORNER, y: BORDER + CORNER, r: CORNER, sx: -1, sy: -1 },
    { kind: "arc", x: WIDTH - BORDER - CORNER, y: BORDER + CORNER, r: CORNER, sx: 1, sy: -1 },
    { kind: "arc", x: BORDER + CORNER, y: HEIGHT - BORDER - CORNER, r: CORNER, sx: -1, sy: 1 },
    { kind: "arc", x: WIDTH - BORDER - CORNER, y: HEIGHT - BORDER - CORNER, r: CORNER, sx: 1, sy: 1 }
  ];
  var DOOR_FRAMES = [
    { x: BORDER / 2, y: HEIGHT / 2, angle: -Math.PI / 2 },
    { x: WIDTH - BORDER / 2, y: HEIGHT / 2, angle: Math.PI / 2 },
    { x: WIDTH / 2, y: BORDER / 2, angle: 0 },
    { x: WIDTH / 2, y: HEIGHT - BORDER / 2, angle: Math.PI }
  ];
  function borderColliders() {
    const list = [];
    for (const jambs of JAMBS)
      for (const shape of jambs)
        list.push({ shape, solid: true, bounce: BOUNCE.border, onHit: wallHit });
    for (const shape of CORNERS)
      list.push({ shape, solid: true, bounce: BOUNCE.border, onHit: wallHit });
    return list;
  }
  function wallHit(game, contact) {
    app.audio.play("wall");
    game.room.add(new Spark(contact.x, contact.y));
  }
  var Door = class {
    constructor(dir2, state) {
      this.dir = dir2;
      this.state = state;
      this.progress = state === "open" ? 1 : 0;
      this.shape = GAPS[dir2];
      this.bounce = BOUNCE.border;
      this.closeWhenInside = false;
    }
    /** Can the ball go through ? */
    get solid() {
      return !(this.state === "open" || this.state === "hidden" || this.state === "opening");
    }
    /** Can the red pastilles or a key open it ? */
    get openable() {
      return this.state === "closed";
    }
    open(sound = true) {
      if (this.state !== "closed")
        return;
      this.state = "opening";
      if (sound)
        app.audio.play("doors");
    }
    close() {
      if (this.state === "open" || this.state === "opening")
        this.state = "closing";
    }
    /** A closed door : a key opens it. */
    onHit(game, contact) {
      if (this.state === "closed" && game.inventory.keys > 0) {
        game.inventory.keys--;
        app.audio.play("key");
        game.room.openDoor(this.dir, game);
        return;
      }
      wallHit(game, contact);
    }
    update(dt, game) {
      if (this.state === "opening") {
        this.progress = Math.min(1, this.progress + dt / OPEN_TIME);
        if (this.progress >= 1)
          this.state = "open";
      } else if (this.state === "closing") {
        this.progress = Math.max(0, this.progress - dt / OPEN_TIME);
        if (this.progress <= 0)
          this.state = "locked";
      }
      if (this.closeWhenInside && game.ballInside()) {
        this.closeWhenInside = false;
        this.close();
        game.oneWayCrossed();
      }
    }
    render(ctx) {
      if (this.state === "wall" || this.state === "hidden") {
        const gap = GAPS[this.dir];
        const across = this.dir < 2 ? 0 : 1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(gap.x - across, gap.y - (1 - across), gap.w + 2 * across, gap.h + 2 * (1 - across));
        ctx.clip();
        ctx.drawImage(borderCanvas(false), 0, 0, WIDTH, HEIGHT);
        ctx.restore();
        return;
      }
      if (this.progress >= 1)
        return;
      const f = DOOR_FRAMES[this.dir];
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      drawDoorHalves(ctx, this.progress);
      ctx.restore();
    }
  };
  function drawDoorHalves(ctx, open) {
    const col = BORDER_COLORS;
    const top = -BORDER / 2 - 2;
    const bottom = BORDER / 2 + 2;
    const R = (bottom - top) / 2;
    const half = DOOR_SIZE / 2;
    const slide = open * (half + 4);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-DOOR_SIZE / 2 - 1, top - 1, DOOR_SIZE + 2, bottom - top + 2);
    ctx.clip();
    for (const side of [-1, 1]) {
      const tip = side * (1.5 + slide);
      const far = side * (half + 30);
      const cx = tip + side * R;
      ctx.beginPath();
      ctx.moveTo(far, top);
      ctx.lineTo(cx, top);
      ctx.arc(cx, 0, R, -Math.PI / 2, Math.PI / 2, side > 0);
      ctx.lineTo(far, bottom);
      ctx.closePath();
      ctx.fillStyle = col.body;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.lineWidth = 3;
      ctx.strokeStyle = col.light;
      ctx.beginPath();
      ctx.moveTo(far, 3.5);
      ctx.lineTo(cx - side * 2, 3.5);
      ctx.stroke();
      ctx.strokeStyle = col.dark;
      ctx.beginPath();
      ctx.arc(cx, 0, R - 1.5, Math.PI / 2 + side * 1.3, Math.PI / 2, side > 0);
      ctx.lineTo(far, R - 1.5);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  var borders = {};
  function borderCanvas(gaps) {
    const key = gaps ? "gaps" : "full";
    if (borders[key])
      return borders[key];
    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    const col = BORDER_COLORS;
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, HEIGHT);
    roundRectPath(ctx, BORDER, BORDER, WIDTH - 2 * BORDER, HEIGHT - 2 * BORDER, CORNER);
    ctx.closePath();
    ctx.fillStyle = col.body;
    ctx.fill("evenodd");
    ctx.beginPath();
    roundRectPath(ctx, BORDER - 9, BORDER - 9, WIDTH - 2 * BORDER + 18, HEIGHT - 2 * BORDER + 18, 28);
    ctx.strokeStyle = col.light;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    roundRectPath(ctx, BORDER - 1.5, BORDER - 1.5, WIDTH - 2 * BORDER + 3, HEIGHT - 2 * BORDER + 3, CORNER + 1);
    ctx.strokeStyle = col.dark;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (gaps) {
      ctx.globalCompositeOperation = "destination-out";
      for (let d = 0; d < 4; d++) {
        const g = GAPS[d];
        const x = Math.max(0, g.x) - (d === Dir.RIGHT ? 4 : 0);
        const y = Math.max(0, g.y) - (d === Dir.DOWN ? 4 : 0);
        const w = d < 2 ? BORDER + 4 : g.w;
        const h = d < 2 ? g.h : BORDER + 4;
        ctx.fillRect(x, y, w, h);
      }
    }
    borders[key] = canvas;
    return canvas;
  }

  // src/game/entities/bumpers.js
  var HIT_TIME = 0.25;
  var RoundBumper = class extends Entity {
    /**
     * @param x, y        centre
     * @param radius      collision radius
     * @param shadow      radius of the drop shadow (0 = none)
     */
    constructor(x, y, radius, bounce, shadow) {
      super(x, y, Layer.OBJECT);
      this.shape = { kind: "circle", x, y, r: radius };
      this.solid = true;
      this.bounce = bounce;
      this.shadowRadius = shadow;
      this.hitTime = -1;
    }
    /** Starts the hit animation ; returns false if it is already playing. */
    animateHit() {
      if (this.hitTime >= 0)
        return false;
      this.hitTime = 0;
      return true;
    }
    update(dt) {
      if (this.hitTime >= 0) {
        this.hitTime += dt;
        if (this.hitTime > HIT_TIME)
          this.hitTime = -1;
      }
    }
    /** Swell of the hit animation. */
    get pulse() {
      return this.hitTime < 0 ? 1 : 1 + Math.sin(this.hitTime / HIT_TIME * Math.PI) * 0.18;
    }
    renderShadow(ctx) {
      if (this.shadowRadius)
        dropShadow(ctx, this.x, this.y, this.shadowRadius);
    }
    flash(ctx, radius) {
      if (this.hitTime < 0)
        return;
      ctx.fillStyle = "rgba(255,255,255," + 0.6 * (1 - this.hitTime / HIT_TIME) + ")";
      circle(ctx, this.x, this.y, radius * this.pulse);
      ctx.fill();
    }
  };
  var Bumper = class extends RoundBumper {
    constructor(x, y) {
      super(x, y, 20, BOUNCE.bumper, 22);
      this.itemType = Item.BUMPER;
    }
    onHit() {
      if (this.animateHit())
        app.audio.play("metal");
    }
    render(ctx) {
      const s = this.pulse;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      image(ctx, "normal_base", 46, 46);
      image(ctx, "normal_top", 23, 23);
      ctx.restore();
      this.flash(ctx, 22);
    }
  };
  var ClockBumper = class extends RoundBumper {
    constructor(x, y, game) {
      super(x, y, 28, BOUNCE.clock, 27);
      this.itemType = Item.CLOCK;
      this.shownTime = game.time;
    }
    onHit(game) {
      if (!this.animateHit())
        return;
      app.audio.play("wall");
      game.addTime(game.rules.clockBumper);
    }
    update(dt, game) {
      super.update(dt);
      this.shownTime = smooth(this.shownTime, game.time, 0.05, dt);
    }
    render(ctx) {
      const s = this.pulse;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(s, s);
      drawSprite(ctx, clockFace(), 0, 0);
      const ms = this.shownTime * 1e3;
      ctx.fillStyle = "#7a2aa0";
      for (const [angle, length] of [[-ms / 3600, 12], [-(ms % 3600) / 10, 17]]) {
        ctx.save();
        ctx.rotate(angle * Math.PI / 180);
        ctx.beginPath();
        ctx.ellipse(0, -length / 2, 2.8, length / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      sphere(ctx, 0, 0, 2.5, "#c05ae0", "#5a1a78");
      ctx.restore();
      this.flash(ctx, 28);
    }
  };
  function clockFace() {
    return sprite("clock", 66, 66, (ctx) => {
      ctx.fillStyle = "#6cc93a";
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        circle(ctx, Math.cos(a) * 26, Math.sin(a) * 26, 6);
        ctx.fill();
      }
      image(ctx, "time_base", 54, 54);
    });
  }
  var DeathBumper = class extends RoundBumper {
    constructor(x, y) {
      super(x, y, 15, BOUNCE.death, 17);
      this.itemType = Item.DEATH;
    }
    onHit(game) {
      const ball = game.ball;
      if (ball.type === BallType.METAL || ball.invulnerable > 0) {
        app.audio.play("metal");
        return;
      }
      app.audio.play("death");
      this.animateHit();
      ball.die();
    }
    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.pulse, this.pulse);
      if (this.hitTime >= 0)
        ctx.rotate(this.hitTime * 8);
      image(ctx, "death_base", 38, 39);
      ctx.restore();
    }
  };
  var Magnet = class extends RoundBumper {
    constructor(x, y) {
      super(x, y, 20, BOUNCE.magnet, 17);
      this.itemType = Item.MAGNET;
      this.attracting = true;
      this.phase = Math.random();
    }
    onHit() {
      if (this.attracting) {
        this.attracting = false;
        app.audio.play("metal");
      }
    }
    update(dt, game) {
      super.update(dt);
      this.phase = (this.phase + dt * 2) % 1;
      const ball = game.ball;
      if (ball.type !== BallType.METAL && !ball.falling) {
        const d2 = dist2(this.x, this.y, ball.x, ball.y);
        if (d2 < 3e4) {
          const way = this.attracting ? 1 : -1;
          const f = way * 30 * 1600 * dt / d2;
          ball.vx += (this.x - ball.x) * f;
          ball.vy += (this.y - ball.y) * f;
        }
      }
      if (!this.attracting && Math.random() < perFrameChance(1e3, dt))
        this.attracting = true;
    }
    render(ctx) {
      const neg = !this.attracting;
      const t = this.phase;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = neg ? "rgba(255,90,60," + 0.5 * (1 - t) + ")" : "rgba(120,255,90," + 0.5 * t + ")";
      ctx.lineWidth = 2;
      circle(ctx, 0, 0, neg ? 18 + t * 18 : 36 - t * 18);
      ctx.stroke();
      image(ctx, "magnet_base", 38, 38);
      image(ctx, "magnet_top", 24, 24);
      image(ctx, neg ? "magnet_minus" : "magnet_plus", 15, neg ? 11 : 14);
      ctx.restore();
    }
  };
  var GhostBumper = class extends RoundBumper {
    constructor(x, y) {
      super(x, y, 24, BOUNCE.ghost, 0);
      this.itemType = Item.GHOST;
      this.alpha = 0;
    }
    onHit(game) {
      if (!this.animateHit())
        return;
      app.audio.play("metal");
      if (game.ball.type !== BallType.VIOLET)
        this.alpha = 1;
    }
    update(dt, game) {
      super.update(dt);
      const ball = game.ball;
      if (ball.type === BallType.VIOLET) {
        this.alpha = Math.min(1, 2e3 / Math.max(1, dist2(this.x, this.y, ball.x, ball.y)));
      } else if (this.alpha > 0) {
        this.alpha = Math.max(0, this.alpha - dt * 1.6);
      }
    }
    render(ctx) {
      if (this.alpha <= 0.01)
        return;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(this.pulse, this.pulse);
      drawSprite(ctx, ghostSprite(), 0, 0);
      ctx.restore();
    }
  };
  function ghostSprite() {
    return sprite("ghost", 56, 56, (ctx) => {
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 27);
      g.addColorStop(0, "#2a0a40");
      g.addColorStop(0.55, "#5a2a84");
      g.addColorStop(0.8, "#8a58b8");
      g.addColorStop(1, "rgba(60,20,90,0)");
      ctx.fillStyle = g;
      circle(ctx, 0, 0, 27);
      ctx.fill();
      ctx.strokeStyle = "rgba(220,180,255,0.6)";
      ctx.lineWidth = 2;
      circle(ctx, 0, 0, 17);
      ctx.stroke();
      sphere(ctx, 0, 0, 9, "#6a3a9a", "#200834", "#c8a0f0");
    });
  }

  // src/game/entities/blocks.js
  var GreenBlock = class extends Entity {
    /** x, y = top-left corner, `data` = the item of the level data (to remember it is gone). */
    constructor(x, y, data) {
      super(x + TILE / 2, y + TILE / 2, Layer.BLOCK);
      this.itemType = Item.BLOCK;
      this.data = data;
      this.left = x;
      this.top = y;
      this.shape = { kind: "box", x, y, w: TILE, h: TILE };
      this.solid = true;
      this.bounce = BOUNCE.block;
      this.neighbours = 0;
    }
    onHit(game, contact) {
      if (game.ball.type !== BallType.GREEN || this.dead) {
        app.audio.play("wall");
        game.room.add(new Spark(contact.x, contact.y));
        return;
      }
      app.audio.play("wall");
      this.dead = true;
      this.solid = false;
      this.data.destroyed = true;
      game.room.removeTile(this);
      const ball = game.ball;
      const angle = Math.atan2(ball.vy, ball.vx);
      const speed = contact.speed;
      for (let i = 0; i < 4; i++) {
        const s = (Math.random() * speed / 2 + speed / 2) / 4 + 40;
        const a = angle + Math.random() - 0.5;
        game.room.add(new Debris(this.left + Math.random() * TILE, this.top + Math.random() * TILE, Math.cos(a) * s, Math.sin(a) * s));
      }
    }
    render(ctx) {
      const f = this.neighbours;
      const EXT = 6;
      const x0 = this.left;
      const y0 = this.top;
      const left = f & 1 ? -EXT : 1;
      const up = f & 2 ? -EXT : 1;
      const right = f & 4 ? TILE + EXT : TILE - 1;
      const down = f & 8 ? TILE + EXT : TILE - 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, TILE, TILE);
      ctx.clip();
      const g = ctx.createLinearGradient(x0, y0, x0 + TILE, y0 + TILE);
      g.addColorStop(0, "#b4f0a0");
      g.addColorStop(1, "#8fdc78");
      ctx.fillStyle = g;
      roundRect(ctx, x0 + left, y0 + up, right - left, down - up, 8);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#62b24a";
      ctx.stroke();
      if (!(f & 1) && !(f & 2)) {
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x0 + left + 4, y0 + up + 16);
        ctx.lineTo(x0 + left + 4, y0 + up + 10);
        ctx.quadraticCurveTo(x0 + left + 4, y0 + up + 4, x0 + left + 10, y0 + up + 4);
        ctx.lineTo(x0 + left + 16, y0 + up + 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
  var SwitchBlock = class extends Entity {
    constructor(x, y, pink) {
      super(x + TILE / 2, y + TILE / 2, Layer.FLOOR);
      this.itemType = pink ? Item.PINK_BLOCK : Item.BLUE_BLOCK;
      this.pink = pink;
      this.left = x;
      this.top = y;
      this.shape = { kind: "box", x, y, w: TILE, h: TILE };
      this.bounce = BOUNCE.block;
      this.raised = 0;
    }
    isUp(game) {
      return this.pink === game.switchOn;
    }
    update(dt, game) {
      const up = this.isUp(game);
      this.solid = up;
      this.raised = Math.max(0, Math.min(1, this.raised + (up ? dt : -dt) * 5));
      this.layer = this.raised > 0.5 ? Layer.BLOCK : Layer.FLOOR;
    }
    onHit(game, contact) {
      app.audio.play("wall");
      game.room.add(new Spark(contact.x, contact.y));
    }
    render(ctx) {
      const color = this.pink ? "pink" : "blue";
      image(ctx, "inter_low_" + color, TILE, TILE, this.left, this.top);
      if (this.raised > 0) {
        ctx.globalAlpha = this.raised;
        image(ctx, "inter_high_" + color, TILE, TILE, this.left, this.top - 3 * this.raised);
        ctx.globalAlpha = 1;
      }
    }
  };
  var Switch = class extends Entity {
    constructor(x, y) {
      super(x, y, Layer.OBJECT);
      this.itemType = Item.SWITCH;
      this.shape = { kind: "circle", x, y, r: 15 };
      this.solid = true;
      this.bounce = BOUNCE.block;
      this.cooldown = 0;
      this.angle = 0;
    }
    onHit(game, contact) {
      if (this.cooldown > 0)
        return;
      this.cooldown = 0.5;
      app.audio.play("metal");
      game.room.add(new Spark(contact.x, contact.y));
      game.switchOn = !game.switchOn;
    }
    update(dt, game) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      const target = game.switchOn ? Math.PI : 0;
      this.angle += (target - this.angle) * Math.min(1, dt * 10);
    }
    renderShadow(ctx) {
      ctx.fillStyle = "rgba(40,0,70,0.22)";
      circle(ctx, this.x + 4, this.y + 5, 14);
      ctx.fill();
    }
    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      sphere(ctx, 0, 0, 15, "#e8e4f0", "#7a7288");
      ctx.rotate(this.angle);
      ctx.fillStyle = "#ff6ec8";
      ctx.beginPath();
      ctx.arc(0, 0, 10, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = "#5a6cff";
      ctx.beginPath();
      ctx.arc(0, 0, 10, Math.PI / 2, Math.PI * 1.5);
      ctx.fill();
      ctx.rotate(-this.angle);
      ctx.strokeStyle = "#4a4458";
      ctx.lineWidth = 1.5;
      circle(ctx, 0, 0, 10);
      ctx.stroke();
      shine(ctx, 0, 0, 14, 0.5);
      ctx.restore();
    }
  };

  // src/gfx/icons.js
  var Icon = Object.freeze({ MAP: 0, RADAR: 1, SMALL_TIME: 2, BIG_TIME: 3, KEY: 4 });
  function drawItemIcon(ctx, icon, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    switch (icon) {
      case Icon.MAP:
        ctx.fillStyle = "#ffe07a";
        ctx.strokeStyle = "#b07a00";
        ctx.lineWidth = 1.5;
        roundRect(ctx, -11, -8, 22, 16, 3);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "#c0902a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4, -8);
        ctx.lineTo(-4, 8);
        ctx.moveTo(4, -8);
        ctx.lineTo(4, 8);
        ctx.moveTo(-11, 0);
        ctx.lineTo(11, 0);
        ctx.stroke();
        ctx.fillStyle = "#e0301a";
        circle(ctx, 6, -4, 2);
        ctx.fill();
        break;
      case Icon.RADAR:
        sphere(ctx, 0, 0, 10, "#2a9a4a", "#0a3a1a", "#8affa0");
        ctx.strokeStyle = "rgba(160,255,170,0.8)";
        ctx.lineWidth = 1;
        circle(ctx, 0, 0, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(8, -5);
        ctx.stroke();
        ctx.fillStyle = "#ff4040";
        circle(ctx, -4, 3, 1.8);
        ctx.fill();
        break;
      case Icon.SMALL_TIME:
      case Icon.BIG_TIME: {
        const r = icon === Icon.SMALL_TIME ? 8 : 11;
        sphere(ctx, 0, 0, r, icon === Icon.SMALL_TIME ? "#9ad8ff" : "#4aa8ff", "#1a4a9a", "#fff");
        ctx.strokeStyle = "#0a2a6a";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -r * 0.7);
        ctx.moveTo(0, 0);
        ctx.lineTo(r * 0.5, 0);
        ctx.stroke();
        break;
      }
      case Icon.KEY:
        drawKey(ctx, 1);
        break;
    }
    ctx.restore();
  }
  function drawKey(ctx, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    sphere(ctx, 0, 1, 8, "#ffd84a", "#a86a00", "#fff8c0");
    ctx.fillStyle = "#6a4000";
    ctx.fillRect(-5, 2, 10, 1.5);
    circle(ctx, 0, 5, 1.8);
    ctx.fill();
    ctx.strokeStyle = "#a86a00";
    ctx.lineWidth = 1.5;
    circle(ctx, 0, -8, 2.5);
    ctx.stroke();
    ctx.restore();
  }

  // src/game/entities/pickups.js
  var TAKE_DIST2 = 300;
  var Pastille = class extends Entity {
    /** @param data  the item of the level data (to remember it was taken) */
    constructor(x, y, red, data) {
      super(x, y, Layer.ITEM);
      this.itemType = red ? Item.RED : Item.BLUE;
      this.red = red;
      this.data = data;
      this.taken = false;
    }
    update(dt, game) {
      const ball = game.ball;
      if (this.taken || ball.falling || dist2(this.x, this.y, ball.x, ball.y) >= TAKE_DIST2)
        return;
      this.taken = true;
      this.dead = true;
      this.data.taken = true;
      game.room.add(new Burst(this.x, this.y, this.red ? "#ff5040" : "#ffd040"));
      if (this.red) {
        app.audio.play("red");
        game.room.redTaken(game);
      } else {
        app.audio.play("blue");
        game.addTime(game.rules.bluePastille);
      }
    }
    render(ctx) {
      drawSprite(ctx, this.red ? redSprite() : blueSprite(), this.x, this.y);
    }
  };
  function redSprite() {
    return sprite("red", 26, 26, (ctx) => {
      const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 12);
      halo.addColorStop(0, "rgba(255,255,255,0.9)");
      halo.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = halo;
      circle(ctx, 0, 0, 12);
      ctx.fill();
      sphere(ctx, 0, 0, 7, "#ff2a2a", "#8a0000", "#ffd0d0");
    });
  }
  function blueSprite() {
    return sprite("blue", 26, 26, (ctx) => {
      ctx.fillStyle = "rgba(60,0,60,0.25)";
      circle(ctx, 2, 2, 6);
      ctx.fill();
      sphere(ctx, 0, 0, 6, "#ffcc22", "#b06a00", "#fff6c0");
    });
  }
  var Hatch = class extends Entity {
    constructor(x, y) {
      super(x, y, Layer.ITEM);
      this.itemType = Item.HATCH;
      this.open = 0;
      this.opening = false;
    }
    update(dt, game) {
      if (this.opening)
        this.open = Math.min(1, this.open + dt / 0.33);
      const ball = game.ball;
      if (this.open < 1 || ball.falling || dist2(this.x, this.y, ball.x, ball.y) >= TAKE_DIST2)
        return;
      const { x, y } = this;
      ball.startFall("hatch", 3, (ctx) => ctx.arc(x, y, 16, 0, Math.PI * 2));
    }
    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = "#2a0c40";
      roundRect(ctx, -17, -17, 34, 34, 8);
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
      g.addColorStop(0, "#000");
      g.addColorStop(1, "#4a1a6a");
      ctx.fillStyle = g;
      circle(ctx, 0, 0, 14);
      ctx.fill();
      const open = ease.inOutQuad(this.open);
      if (open < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-17, -17, 34, 34);
        ctx.clip();
        ctx.fillStyle = "#d8a8f0";
        ctx.strokeStyle = "#7a3a9a";
        ctx.lineWidth = 1.5;
        roundRect(ctx, -17 - open * 17, -17, 17, 34, 5);
        ctx.fill();
        ctx.stroke();
        roundRect(ctx, open * 17, -17, 17, 34, 5);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = this.open >= 1 ? "#7cff4a" : "#b070d8";
      ctx.lineWidth = 2;
      roundRect(ctx, -18, -18, 36, 36, 8);
      ctx.stroke();
      ctx.restore();
    }
  };
  var BallPickup = class extends Entity {
    constructor(x, y, ballType) {
      super(x, y, Layer.ITEM);
      this.ballType = ballType;
      this.taken = -1;
    }
    update(dt, game) {
      if (this.taken >= 0) {
        this.taken += dt;
        if (this.taken > 0.4)
          this.dead = true;
        return;
      }
      const ball = game.ball;
      if (!ball.falling && dist2(this.x, this.y, ball.x, ball.y) < 24 * 24) {
        this.taken = 0;
        app.audio.play("found");
        game.collectBall(this.ballType);
      }
    }
    render(ctx) {
      const t = app.time * 2.7;
      const k = this.taken < 0 ? 0 : this.taken / 0.4;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = 1 - k;
      const r = 24 + k * 20;
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r);
      g.addColorStop(0, "rgba(255,255,255,0.8)");
      g.addColorStop(0.5, "rgba(255,255,255,0.25)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      circle(ctx, 0, 0, r);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.5;
      circle(ctx, 0, 0, 20 + Math.sin(t) * 2);
      ctx.stroke();
      ctx.translate(0, Math.sin(t * 1.3) * 2);
      drawBall(ctx, this.ballType, 9, null);
      ctx.restore();
    }
  };
  var ItemBox = class extends Entity {
    /**
     * @param icon    the item shown (gfx/icons.js Icon)
     * @param give    (game) => void : gives the item
     */
    constructor(x, y, icon, give) {
      super(x, y, Layer.OBJECT);
      this.icon = icon;
      this.give = give;
      this.shape = { kind: "circle", x, y, r: 22 };
      this.solid = true;
      this.bounce = BOUNCE.itemBox;
      this.burst = -1;
    }
    onHit(game) {
      if (this.burst >= 0)
        return;
      this.burst = 0;
      this.solid = false;
      app.audio.play("found");
      game.room.add(new Ring(this.x, this.y, 40, "#fff"));
      this.give(game);
    }
    update(dt) {
      if (this.burst >= 0) {
        this.burst += dt;
        if (this.burst > 0.4)
          this.dead = true;
      }
    }
    renderShadow(ctx) {
      if (this.burst < 0)
        dropShadow(ctx, this.x, this.y, 20, 0.15);
    }
    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.burst < 0) {
        const g = ctx.createRadialGradient(-6, -8, 3, 0, 0, 23);
        g.addColorStop(0, "rgba(255,255,255,0.9)");
        g.addColorStop(0.6, "rgba(200,240,255,0.35)");
        g.addColorStop(1, "rgba(120,200,255,0.6)");
        ctx.fillStyle = g;
        circle(ctx, 0, 0, 23);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        drawItemIcon(ctx, this.icon, 1 + 0.08 * Math.sin(app.time * 6));
        shine(ctx, 0, 0, 22, 0.55);
      } else {
        const k = this.burst / 0.4;
        ctx.globalAlpha = 1 - k;
        drawItemIcon(ctx, this.icon, 1 + k);
      }
      ctx.restore();
    }
  };
  var Teleport = class _Teleport extends Entity {
    constructor(x, y) {
      super(x, y, Layer.FLOOR);
      this.itemType = Item.TELEPORT;
      this.busy = false;
      this.circles = [];
      for (let i = 0; i < 5; i++) {
        this.circles.push({
          offset: Math.random() * 6,
          tilt: Math.random() * Math.PI * 2,
          angle: 0,
          speed: 3 + Math.floor(Math.random() * 3),
          phase: Math.random() * Math.PI * 2
        });
      }
    }
    update(dt, game) {
      const ball = game.ball;
      const d = Math.sqrt(dist2(this.x, this.y, ball.x, ball.y)) + 0.1;
      for (const c of this.circles) {
        c.angle += c.speed * (1 + 60 / d) * dt * 40 * Math.PI / 180;
        c.phase += (20 + 200 / d) * dt * 40 / 100;
      }
      if (d >= ball.radius) {
        this.busy = false;
        return;
      }
      if (this.busy || ball.falling)
        return;
      const other = game.room.entities.find((e) => e instanceof _Teleport && e !== this);
      if (!other)
        return;
      this.busy = true;
      other.busy = true;
      ball.x = other.x;
      ball.y = other.y;
    }
    render(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.4, "rgba(210,150,255,0.6)");
      g.addColorStop(1, "rgba(120,40,200,0)");
      ctx.fillStyle = g;
      circle(ctx, 0, 0, 24);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.5;
      for (const c of this.circles) {
        ctx.save();
        ctx.rotate(c.angle);
        ctx.scale(1 + Math.cos(c.phase) * 0.5, 1 + Math.sin(c.phase) * 0.5);
        ctx.rotate(c.tilt);
        ctx.beginPath();
        ctx.ellipse(0, c.offset, 14, 8, 0, 0, Math.PI * 1.3);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  };

  // src/game/entities/zappers.js
  var Zapper = class extends Entity {
    /** @param cellX, cellY  the position in the level data (gives the phase) */
    constructor(x, y, cellX, cellY, checkpoint) {
      super(x, y, Layer.OBJECT);
      this.itemType = Item.ZAPPER;
      this.shape = { kind: "circle", x, y, r: 14 };
      this.solid = true;
      this.bounce = BOUNCE.zapper;
      this.checkpoint = checkpoint;
      this.phase = checkpoint ? 0 : ((cellX - 4 + (cellY - 4)) % BALL_TYPE_COUNT + BALL_TYPE_COUNT) % BALL_TYPE_COUNT;
      this.blink = x;
    }
    onHit(game, contact) {
      app.audio.play("metal");
      game.room.add(new Spark(contact.x, contact.y));
    }
    renderShadow(ctx) {
      dropShadow(ctx, this.x, this.y, 14);
    }
    render(ctx) {
      if (this.checkpoint) {
        drawSprite(ctx, checkpointSprite(), this.x, this.y);
        return;
      }
      drawSprite(ctx, postSprite(this.phase), this.x, this.y);
      const t = app.time * 6 + this.blink;
      ctx.fillStyle = "rgba(255,255,255," + (0.3 + 0.3 * Math.sin(t)) + ")";
      circle(ctx, this.x, this.y, 9);
      ctx.fill();
    }
  };
  function postSprite(phase) {
    return sprite("zapper" + phase, 32, 32, (ctx) => {
      const col = BALL_COLORS[phase];
      sphere(ctx, 0, 0, 14, "#dcdce6", "#4a4a5a");
      ctx.strokeStyle = "#3a3a48";
      ctx.lineWidth = 1;
      circle(ctx, 0, 0, 14);
      ctx.stroke();
      sphere(ctx, 0, 0, 8, col[0], col[1], col[2]);
    });
  }
  function checkpointSprite() {
    return sprite("checkpoint", 32, 32, (ctx) => {
      sphere(ctx, 0, 0, 14, "#fff4b0", "#b08400");
      ctx.strokeStyle = "#7a5a00";
      ctx.lineWidth = 1;
      circle(ctx, 0, 0, 14);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = (i + j) % 2 ? "#222" : "#fff";
          ctx.fillRect(-6 + i * 3, -5 + j * 3, 3, 3);
        }
      }
    });
  }
  var Beam = class extends Entity {
    constructor(a, b) {
      super(a.x, a.y, Layer.FLOOR);
      this.a = a;
      this.b = b;
      this.phase = a.phase;
      this.checkpoint = a.checkpoint;
    }
    /** The ball touches the beam. */
    touch(game) {
      if (this.checkpoint) {
        game.checkpoint();
        return;
      }
      if (game.ball.type === this.phase)
        return;
      if (game.ball.die()) {
        app.audio.play("laser");
        game.room.add(new BeamFlash(this.a.x, this.a.y, this.b.x, this.b.y, this.phase));
      }
    }
    render(ctx) {
      const t = app.time * 6.7;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.lineDashOffset = -t * 2;
      ctx.strokeStyle = this.checkpoint ? "#ffffff" : BALL_COLORS[this.phase][0];
      ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t);
      ctx.beginPath();
      ctx.moveTo(this.a.x, this.a.y);
      ctx.lineTo(this.b.x, this.b.y);
      ctx.stroke();
      ctx.restore();
    }
  };
  function makeBeams(zappers) {
    const beams = [];
    for (let i = 0; i < zappers.length; i++)
      for (let j = i + 1; j < zappers.length; j++)
        if (zappers[i].phase === zappers[j].phase)
          beams.push(new Beam(zappers[i], zappers[j]));
    return beams;
  }

  // src/game/room.js
  var SIZES = {
    [Item.BUMPER]: 48,
    [Item.CLOCK]: 64,
    [Item.DEATH]: 40,
    [Item.MAGNET]: 40,
    [Item.GHOST]: 56,
    [Item.BLOCK]: 40,
    [Item.HOLE]: 40,
    [Item.RED]: 24,
    [Item.BLUE]: 24,
    [Item.TELEPORT]: 48,
    [Item.SWITCH]: 32,
    [Item.PINK_BLOCK]: 40,
    [Item.BLUE_BLOCK]: 40,
    [Item.ZAPPER]: 32,
    [Item.HATCH]: 40
  };
  var centreOf = (item) => ({
    x: item.x * CELL + SIZES[item.type] / 2,
    y: item.y * CELL + SIZES[item.type] / 2
  });
  var BALL_OF_OBJECT = [BallType.GREEN, BallType.BLUE, BallType.METAL, BallType.VIOLET];
  var TileGrid = class {
    constructor() {
      this.cells = new Array(TILES_X * TILES_Y).fill(null);
    }
    get(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= TILES_X || ty >= TILES_Y)
        return void 0;
      return this.cells[tx + ty * TILES_X];
    }
    set(tx, ty, v) {
      if (tx >= 0 && ty >= 0 && tx < TILES_X && ty < TILES_Y)
        this.cells[tx + ty * TILES_X] = v;
    }
    /** Tile of a pixel position (the top-left corner of a block or a hole). */
    static at(x, y) {
      return { tx: Math.floor((x - TILE_ORIGIN) / TILE), ty: Math.floor((y - TILE_ORIGIN) / TILE) };
    }
  };
  var Room = class {
    /**
     * @param game
     * @param rx, ry     position in the dungeon
     * @param enteredBy  the side the ball comes in by (Dir), or -1
     */
    constructor(game, rx, ry, enteredBy) {
      this.rx = rx;
      this.ry = ry;
      this.data = game.dungeon.room(rx, ry);
      this.background = "bg0" + (1 + (rx + ry) % 4);
      this.entities = [];
      this.tiles = new TileGrid();
      this.holes = [];
      this.blocks = [];
      this.beams = [];
      this.redsLeft = 0;
      this.hatch = null;
      this.reserved = /* @__PURE__ */ new Set();
      this.isBossRoom = this.data.type === RoomType.BOSS;
      this.fixedColliders = borderColliders();
      this.data.visited = true;
      this.build(game);
      this.doors = this.makeDoors(game, enteredBy);
      this.updateTiles();
      if (this.redsLeft === 0 && !this.isBossRoom)
        this.openDoors(game, false);
    }
    // ----- building -----
    build(game) {
      const d = this.data;
      switch (d.type) {
        case RoomType.BOSS:
          this.buildBossRoom();
          break;
        case RoomType.BALL:
          this.add(new BallPickup(WIDTH / 2, HEIGHT / 2, BALL_OF_OBJECT[d.content]));
          this.addCornerBumpers(game);
          break;
        case RoomType.BONUS:
          this.buildBonusRoom(game, d.content);
          break;
        default:
          for (const item of d.items)
            this.addItem(game, item);
          this.beams = makeBeams(this.entities.filter((e) => e instanceof Zapper));
          this.beams.forEach((b) => this.add(b));
      }
    }
    addItem(game, item) {
      if (item.destroyed || item.taken)
        return;
      const { x, y } = centreOf(item);
      const left = item.x * CELL;
      const top = item.y * CELL;
      switch (item.type) {
        case Item.BUMPER:
          return this.add(new Bumper(x, y));
        case Item.CLOCK:
          return this.add(new ClockBumper(x, y, game));
        case Item.DEATH:
          return this.add(new DeathBumper(x, y));
        case Item.MAGNET:
          return this.add(new Magnet(x, y));
        case Item.GHOST:
          return this.add(new GhostBumper(x, y));
        case Item.TELEPORT:
          return this.add(new Teleport(x, y));
        case Item.SWITCH:
          return this.add(new Switch(x, y));
        case Item.PINK_BLOCK:
          return this.add(new SwitchBlock(left, top, true));
        case Item.BLUE_BLOCK:
          return this.add(new SwitchBlock(left, top, false));
        case Item.ZAPPER:
          return this.add(new Zapper(x, y, item.x, item.y, game.rules.checkpoints));
        case Item.BLOCK: {
          const block = this.add(new GreenBlock(left, top, item));
          const { tx, ty } = TileGrid.at(left, top);
          this.tiles.set(tx, ty, Item.BLOCK);
          this.blocks.push(block);
          return block;
        }
        case Item.HOLE: {
          const { tx, ty } = TileGrid.at(left, top);
          this.tiles.set(tx, ty, Item.HOLE);
          this.holes.push({ tx, ty });
          return null;
        }
        case Item.RED:
          this.redsLeft++;
          return this.add(new Pastille(x, y, true, item));
        case Item.BLUE:
          return this.add(new Pastille(x, y, false, item));
        case Item.HATCH:
          this.hatch = this.add(new Hatch(x + 2, y + 2));
          return this.hatch;
      }
      return null;
    }
    add(entity) {
      this.entities.push(entity);
      return entity;
    }
    /** The boss room : holes in the lower corners, two death bumpers at the top. */
    buildBossRoom() {
      for (const [tx, ty] of [[0, 8], [1, 8], [0, 7], [13, 8], [12, 8], [13, 7]]) {
        this.tiles.set(tx, ty, Item.HOLE);
        this.holes.push({ tx, ty });
      }
      this.add(new DeathBumper(48, 48));
      this.add(new DeathBumper(WIDTH - 50, 48));
    }
    /** The decoration of the ball and bonus rooms : 4 clocks and 4 bumpers. */
    addCornerBumpers(game) {
      for (const [x, y] of [[60, 60], [WIDTH - 60, 60], [60, HEIGHT - 60], [WIDTH - 60, HEIGHT - 60]])
        this.add(new ClockBumper(x, y, game));
      for (const [x, y] of [[224, 144], [WIDTH - 224, 144], [224, HEIGHT - 144], [WIDTH - 224, HEIGHT - 144]])
        this.add(new Bumper(x, y));
    }
    buildBonusRoom(game, bonus) {
      const d = this.data;
      if (bonus === DungeonBonus.ORANGE || bonus === DungeonBonus.RED) {
        this.add(new BallPickup(WIDTH / 2, HEIGHT / 2, bonus === DungeonBonus.ORANGE ? BallType.ORANGE : BallType.RED));
      } else if (!d.taken) {
        const [icon, give] = BONUS_ITEMS[bonus];
        this.add(new ItemBox(WIDTH / 2, HEIGHT / 2, icon, (g) => {
          d.taken = true;
          give(g);
        }));
      }
      this.addCornerBumpers(game);
    }
    // ----- doors -----
    /**
     * The door of each side, from the exits of the data. The door the ball
     * comes in by is open (a one-way door closes behind it).
     */
    makeDoors(game, enteredBy) {
      const challenge = game.mode === Mode.CHALLENGE;
      return this.data.exits.map((exit, dir2) => {
        let type = exit.type;
        if (type === Exit.SPECIAL && !challenge)
          type = Exit.ONE_WAY;
        switch (type) {
          case Exit.WALL:
            return new Door(dir2, "wall");
          case Exit.HIDDEN:
            return new Door(dir2, "hidden");
          case Exit.OPEN:
            return new Door(dir2, "open");
          case Exit.ONE_WAY: {
            if (dir2 !== enteredBy)
              return new Door(dir2, "locked");
            const door = new Door(dir2, "open");
            door.closeWhenInside = true;
            return door;
          }
          default:
            return new Door(dir2, "closed");
        }
      });
    }
    /** Opens the door on side `dir` (red pastilles taken, or a key). */
    openDoor(dir2, game, sound = true) {
      const door = this.doors[dir2];
      if (!door.openable)
        return;
      door.open(sound);
      this.data.exits[dir2].type = Exit.OPEN;
    }
    openDoors(game, sound = true) {
      let opened = false;
      for (const door of this.doors) {
        if (door.openable) {
          this.openDoor(door.dir, game, false);
          opened = true;
        }
      }
      if (opened && sound)
        app.audio.play("doors");
      if (this.hatch)
        this.hatch.opening = true;
    }
    /** Closes every door (the boss room, once the ball is inside). */
    closeDoors() {
      for (const door of this.doors)
        door.close();
    }
    redTaken(game) {
      this.redsLeft--;
      if (this.redsLeft === 0)
        this.openDoors(game);
    }
    // ----- tiles -----
    /** A new hole (the bosses break the floor). */
    addHole(tx, ty) {
      if (this.tiles.get(tx, ty) === Item.HOLE)
        return;
      this.tiles.set(tx, ty, Item.HOLE);
      this.holes.push({ tx, ty });
    }
    /** A new green block (the final boss makes some). */
    addBlock(tx, ty) {
      const block = this.add(new GreenBlock(TILE_ORIGIN + tx * TILE, TILE_ORIGIN + ty * TILE, {}));
      this.tiles.set(tx, ty, Item.BLOCK);
      this.blocks.push(block);
      this.updateTiles();
    }
    /** A green block was destroyed. */
    removeTile(block) {
      const { tx, ty } = TileGrid.at(block.left, block.top);
      this.tiles.set(tx, ty, null);
      this.blocks = this.blocks.filter((b) => b !== block);
      this.updateTiles();
    }
    /** Recomputes which green blocks touch each other. */
    updateTiles() {
      for (const b of this.blocks) {
        const { tx, ty } = TileGrid.at(b.left, b.top);
        const same = (x, y) => this.tiles.get(x, y) === Item.BLOCK;
        b.neighbours = (same(tx - 1, ty) ? 1 : 0) | (same(tx, ty - 1) ? 2 : 0) | (same(tx + 1, ty) ? 4 : 0) | (same(tx, ty + 1) ? 8 : 0);
      }
    }
    /** Adds the visible area of the holes to the current path (the falling ball is clipped to it). */
    holeClip() {
      const holes = this.holes.slice();
      return (ctx) => {
        for (const h of holes)
          ctx.rect(TILE_ORIGIN + h.tx * TILE + 1, TILE_ORIGIN + h.ty * TILE + 1, TILE, TILE);
      };
    }
    // ----- every step -----
    update(dt, game) {
      for (const door of this.doors)
        door.update(dt, game);
      for (const e of this.entities.slice())
        if (!e.dead)
          e.update(dt, game);
      if (this.entities.some((e) => e.dead))
        this.entities = this.entities.filter((e) => !e.dead);
    }
    /** Every collider of the room. */
    colliders() {
      const list = this.fixedColliders.slice();
      for (const door of this.doors)
        list.push(door);
      for (const e of this.entities)
        if (e.shape)
          list.push(e);
      return list;
    }
    /** The laser beams touched by the ball. */
    touchBeams(ball, game) {
      for (const beam of this.beams) {
        if (circleTouchesSegment(ball.x, ball.y, ball.radius, beam.a.x, beam.a.y, beam.b.x, beam.b.y))
          beam.touch(game);
      }
    }
    // ----- drawing -----
    /**
     * Draws the room ; `extras` are entities of the game drawn with the room
     * (the ball, the boss), sorted by layer with the others.
     */
    render(ctx, game, extras = []) {
      image(ctx, this.background, WIDTH, HEIGHT, 0, 0);
      this.renderHoles(ctx);
      this.renderBlockShadows(ctx);
      const all = this.entities.concat(extras);
      all.sort((a, b) => a.layer - b.layer);
      let i = 0;
      for (; i < all.length && all[i].layer <= Layer.FLOOR; i++)
        all[i].render(ctx, game);
      for (let j = i; j < all.length; j++)
        if (all[j].renderShadow)
          all[j].renderShadow(ctx, game);
      for (; i < all.length; i++)
        all[i].render(ctx, game);
    }
    /** The border and the doors (drawn over the room). */
    renderBorder(ctx, game) {
      for (const door of this.doors)
        door.render(ctx, game);
      ctx.drawImage(borderCanvas(true), 0, 0, WIDTH, HEIGHT);
    }
    /**
     * The holes show the "bgHole" picture (the floor far below), with a back
     * wall on their top edge when there is floor above them.
     */
    renderHoles(ctx) {
      if (!this.holes.length)
        return;
      const HOLE_WALL = 7;
      const rect = (h) => ({ x: TILE_ORIGIN + h.tx * TILE + 1, y: TILE_ORIGIN + h.ty * TILE + 1 });
      ctx.save();
      ctx.beginPath();
      for (const h of this.holes) {
        const r = rect(h);
        ctx.rect(r.x, r.y, TILE, TILE);
      }
      ctx.clip();
      image(ctx, "bgHole", WIDTH, HEIGHT, 0, 0);
      for (const h of this.holes) {
        if (h.ty === 0 || this.tiles.get(h.tx, h.ty - 1) === Item.HOLE)
          continue;
        const r = rect(h);
        ctx.fillStyle = "#9B76BC";
        ctx.fillRect(r.x, r.y, TILE, HOLE_WALL);
        ctx.fillStyle = "rgba(40,10,60,0.35)";
        ctx.fillRect(r.x, r.y + HOLE_WALL, TILE, 6);
      }
      ctx.restore();
    }
    /** The drop shadow of each run of green blocks. */
    renderBlockShadows(ctx) {
      if (!this.blocks.length)
        return;
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      for (const b of this.blocks)
        roundRectPath(ctx, b.left + 4, b.top + 4, TILE, TILE, 8);
      ctx.fill();
    }
  };
  var BONUS_ITEMS = {
    [DungeonBonus.MAP]: [Icon.MAP, (game) => {
      game.inventory.map = true;
      game.showMap();
    }],
    [DungeonBonus.RADAR]: [Icon.RADAR, (game) => {
      game.inventory.radar = true;
      game.showMap();
    }],
    [DungeonBonus.KEY]: [Icon.KEY, (game) => {
      game.inventory.keys += 3;
    }],
    [DungeonBonus.SMALL_TIME]: [Icon.SMALL_TIME, (game) => {
      if (game.rules.itemTime)
        game.addTime(60);
    }],
    [DungeonBonus.BIG_TIME]: [Icon.BIG_TIME, (game) => {
      if (game.rules.itemTime)
        game.addTime(180);
    }]
  };

  // src/game/hud.js
  var Hud = class {
    constructor(game) {
      this.game = game;
      this.popups = [];
      this.lapFlash = -1;
    }
    timeChanged(seconds) {
      if (!seconds)
        return;
      const good = this.game.rules.chrono ? seconds < 0 : seconds > 0;
      const txt = (seconds > 0 ? "+" : "") + seconds + " s";
      this.popups.push({ text: txt, color: good ? "#b6ff7a" : "#ff8a7a", age: 0 });
    }
    lapDone() {
      this.lapFlash = 0;
    }
    update(dt) {
      for (const p of this.popups)
        p.age += dt;
      this.popups = this.popups.filter((p) => p.age < 1.2);
      if (this.lapFlash >= 0) {
        this.lapFlash += dt;
        if (this.lapFlash > 1.2)
          this.lapFlash = -1;
      }
    }
    render(ctx) {
      const g = this.game;
      const r = g.rules;
      let x = 1;
      if (r.laps) {
        x = pill(ctx, x, 112, formatTime(g.time, true));
        x = pill(ctx, x + 4, 56, Math.min(r.laps, r.laps - g.laps + 1) + "/" + r.laps, drawLapIcon);
      } else {
        if (g.mode === "classic")
          x = pill(ctx, x, 64, "Niv. " + (g.level + 1)) + 4;
        const low = g.time < 30;
        x = pill(ctx, x, 84, formatTime(g.time), drawClockIcon, low && Math.floor(g.time * 4) % 2 === 0 ? "#ffb0a0" : "#fff");
      }
      for (const p of this.popups) {
        const t = p.age / 1.2;
        ctx.globalAlpha = 1 - t;
        text(ctx, p.text, x + 24, 14 + t * 14, { size: 16, color: p.color, outline: "rgba(60,20,80,0.6)" });
        ctx.globalAlpha = 1;
      }
      if (this.lapFlash >= 0) {
        const t = this.lapFlash / 1.2;
        ctx.globalAlpha = Math.sin(t * Math.PI);
        text(ctx, g.laps > 0 ? "TOUR !" : "ARRIV\xC9E !", WIDTH / 2, 120, { size: 40 + ease.outQuad(t) * 12, color: "#ffe060", outline: "#7a3a00" });
        ctx.globalAlpha = 1;
      }
      if (g.rules.ballSwitch)
        this.renderBalls(ctx);
    }
    /** The balls left (right to left from yellow), and the keys above them. */
    renderBalls(ctx) {
      const g = this.game;
      const inv = g.inventory;
      let x = WIDTH - 25;
      for (let type = 0; type < BALL_TYPE_COUNT; type++) {
        for (let n = 0; n < inv.balls[type]; n++) {
          const current = g.ball.type === type && n === 0 && !g.ball.hidden;
          const col = BALL_COLORS[type];
          const r = 11.5;
          ctx.fillStyle = current ? "#ffffff" : "rgba(60,110,30,0.5)";
          circle(ctx, x, HEIGHT - 20, r + 1.5);
          ctx.fill();
          const grad = ctx.createRadialGradient(x - 3, HEIGHT - 24, 1, x, HEIGHT - 20, r);
          grad.addColorStop(0, col[2]);
          grad.addColorStop(0.45, col[0]);
          grad.addColorStop(1, col[1]);
          ctx.fillStyle = grad;
          circle(ctx, x, HEIGHT - 20, r);
          ctx.fill();
          x -= 25;
        }
      }
      for (let k = 0; k < inv.keys; k++) {
        ctx.save();
        ctx.translate(WIDTH - 35 - k * 25, HEIGHT - 55);
        drawKey(ctx, 1);
        ctx.restore();
      }
    }
  };
  function pill(ctx, x, w, label, icon, color = "#fff") {
    ctx.fillStyle = "rgba(230,255,215,0.45)";
    roundRect(ctx, x, 1, w, 24, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    let tx = x + w / 2;
    if (icon) {
      icon(ctx, x + 14, 13);
      tx += 9;
    }
    text(ctx, label, tx, 14, { size: 20, color, outline: "rgba(70,150,40,0.55)" });
    return x + w;
  }
  function drawClockIcon(ctx, x, y) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    circle(ctx, x, y, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 4);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 3, y);
    ctx.stroke();
  }
  function drawLapIcon(ctx, x, y) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, -Math.PI * 0.2, Math.PI * 1.5);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 8);
    ctx.lineTo(x + 6, y - 5);
    ctx.lineTo(x + 1, y - 3);
    ctx.fill();
  }

  // src/bosses/common.js
  var Boss = class extends Entity {
    constructor(x, y) {
      super(x, y, Layer.BOSS);
    }
    onPause() {
    }
  };
  var tintCanvas = null;
  function drawTinted(ctx, x, y, size, amount, draw) {
    if (amount <= 0.01) {
      ctx.save();
      ctx.translate(x, y);
      draw(ctx);
      ctx.restore();
      return;
    }
    const scale = 2;
    const px = size * 2 * scale;
    if (!tintCanvas || tintCanvas.width < px) {
      tintCanvas = document.createElement("canvas");
      tintCanvas.width = tintCanvas.height = px;
    }
    const c = tintCanvas.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, px, px);
    c.setTransform(scale, 0, 0, scale, size * scale, size * scale);
    draw(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.globalAlpha = Math.min(0.85, amount);
    c.fillStyle = "rgb(255,40,40)";
    c.fillRect(0, 0, px, px);
    ctx.drawImage(tintCanvas, 0, 0, px, px, x - size, y - size, size * 2, size * 2);
  }
  var FallingTile = class extends Effect {
    constructor(tx, ty) {
      super(TILE_ORIGIN + tx * TILE + 1 + TILE / 2, TILE_ORIGIN + ty * TILE + 1 + TILE / 2, 0.6, Layer.ITEM);
    }
    render(ctx) {
      const k = this.t;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(k * 0.8);
      ctx.scale(1 - k * 0.8, 1 - k * 0.8);
      ctx.globalAlpha = 1 - k * 0.6;
      ctx.fillStyle = "#c9a2e6";
      ctx.strokeStyle = "#8a5ab0";
      ctx.lineWidth = 2;
      roundRect(ctx, -19, -19, 38, 38, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  };
  var CrackingTile = class extends Effect {
    constructor(tx, ty, duration, onDone) {
      super(TILE_ORIGIN + tx * TILE + 1, TILE_ORIGIN + ty * TILE + 1, duration, Layer.FLOOR);
      this.tx = tx;
      this.ty = ty;
      this.onDone = onDone;
    }
    update(dt, game) {
      super.update(dt);
      if (this.dead)
        this.onDone(game, this.tx, this.ty);
    }
    render(ctx) {
      const k = this.t;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = Math.floor(this.age * 10) % 2 ? "rgba(60,0,80,0.9)" : "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1 + k * 2;
      ctx.beginPath();
      ctx.moveTo(4, 20);
      ctx.lineTo(14, 16);
      ctx.lineTo(20, 24);
      ctx.lineTo(30, 14);
      ctx.lineTo(37, 18);
      ctx.moveTo(20, 4);
      ctx.lineTo(18, 14);
      ctx.lineTo(24, 22);
      ctx.lineTo(20, 36);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,80,80," + (0.3 + 0.4 * k) + ")";
      ctx.strokeRect(1, 1, 38, 38);
      ctx.restore();
    }
  };
  function breakFloor(game, tx, ty) {
    game.room.addHole(tx, ty);
    game.room.add(new FallingTile(tx, ty));
  }
  var ARENA = { minX: BORDER * 2, maxX: WIDTH - BORDER * 2, minY: BORDER, maxY: HEIGHT - BORDER };

  // src/bosses/octopus.js
  var U = 25 / 40;
  var Octopus = class extends Boss {
    constructor(game) {
      super(WIDTH / 2, HEIGHT / 2);
      this.hits = 0;
      this.alpha = 0;
      this.jumpNext = false;
      this.jumpHeight = 0;
      this.eye = null;
      this.hurt = 0;
      this.state = { name: "sleep", time: 5 * U, then: "attack" };
      this.anim = { name: "sleep", time: 0 };
      this.pupil = { x: 0, y: 0 };
      this.blink = 0;
      this.pincers = 0;
      this.suction = 0;
      this.particles = null;
      game.ball.speedLimit = false;
      app.audio.play("bossDeath");
    }
    play(anim) {
      this.anim = { name: anim, time: 0 };
    }
    // ----- every step -----
    update(dt, game) {
      this.anim.time += dt;
      this.alpha = Math.min(1, this.alpha + dt * 4);
      this.blink = Math.max(0, this.blink - dt);
      this.lookAt(game.ball, dt);
      if (this.particles) {
        this.updateDeath(dt, game);
        return;
      }
      if (this.eye)
        this.updateEye(dt, game);
      if (this.hurt > 0) {
        this.hurt -= dt;
        if (this.hurt <= 0 && this.hits >= 4)
          this.die(game);
        return;
      }
      const s = this.state;
      switch (s.name) {
        case "sleep":
        case "wait":
          this.updateWait(dt, game);
          break;
        case "jumps":
          this.updateJumps(dt, game);
          break;
        case "suck":
          this.updateSuck(dt, game);
          break;
        case "shoot":
          this.collide(dt, game);
          break;
      }
      if (s.name !== "suck") {
        this.pincers *= decay(0.6, dt);
        this.suction *= decay(0.8, dt);
      }
    }
    /** Waiting (and asleep at the start : it wakes up a bit before the end). */
    updateWait(dt, game) {
      const s = this.state;
      s.time -= dt;
      this.collide(dt, game);
      if (s.name === "sleep" && s.time <= 3 * U && this.anim.name === "sleep") {
        this.play("normal");
        this.blink = 0.3;
      }
      if (s.time <= 0)
        s.then === "attack" ? this.nextPattern(game) : s.then(game);
    }
    /** The next pattern : jumps and attacks in turn. */
    nextPattern(game) {
      this.jumpHeight = 0;
      this.jumpNext = !this.jumpNext;
      if (this.jumpNext) {
        let count = 3 + this.hits * 2;
        if (this.hits === 3) {
          count *= 5;
          this.hits++;
        }
        app.audio.play("bossJump");
        this.play("normal");
        this.state = {
          name: "jumps",
          count,
          breaks: 0,
          time: 0,
          height: 75 - this.hits * 10,
          speed: 300,
          turn: (0.1 + 0.02 * this.hits) * 40,
          move: (2 + this.hits * 1.5) * 40,
          angle: Math.atan2(game.ball.y - this.y, game.ball.x - this.x)
        };
        return;
      }
      if (this.hits >= 4) {
        this.hurt = U;
        return;
      }
      switch (randInt(8)) {
        case 0:
        case 1:
          app.audio.play("bossJump");
          this.state = {
            name: "jumps",
            count: 1,
            breaks: 1 + randInt(3),
            time: 0,
            height: 300,
            speed: 1500,
            turn: (0.1 + 0.02 * this.hits) * 40,
            move: 10 * 40,
            angle: Math.atan2(game.ball.y - this.y, game.ball.x - this.x)
          };
          break;
        case 2:
        case 3:
          this.state = {
            name: "wait",
            time: (1 + Math.random()) * U,
            then: () => {
              this.play("suck");
              this.state = { name: "suck", time: (2 + 0.5 * this.hits) * U };
            }
          };
          break;
        case 4:
          app.audio.play("bossDeath");
          this.state = { name: "wait", time: 0.5 * U, then: "attack" };
          break;
        default:
          this.state = {
            name: "wait",
            time: (0.7 + Math.random()) * U,
            then: (g) => this.throwEye(g)
          };
      }
    }
    /** Jumps toward the ball, bouncing on the walls. The last landing may break the floor. */
    updateJumps(dt, game) {
      const s = this.state;
      s.time += dt;
      this.jumpHeight = s.height * Math.sin(s.time * s.speed / s.height);
      if (this.jumpHeight < 10)
        this.collide(dt, game);
      if (this.jumpHeight < 0) {
        this.jumpHeight = 0;
        s.time = 0;
        s.count--;
        for (; s.breaks > 0; s.breaks--) {
          app.audio.play("crash");
          this.breakFloor(game);
        }
        if (s.count === 0) {
          this.nextPattern(game);
          return;
        }
        app.audio.play("bossJump");
      }
      const toBall = Math.atan2(game.ball.y - this.y, game.ball.x - this.x);
      const diff = angleDiff(s.angle, toBall);
      const step2 = s.turn * dt;
      s.angle = Math.abs(diff) > step2 ? s.angle + Math.sign(diff) * step2 : toBall + (randInt(3) - 1) / 100;
      this.x += Math.cos(s.angle) * s.move * dt;
      this.y += Math.sin(s.angle) * s.move * dt;
      const x = Math.max(ARENA.minX, Math.min(ARENA.maxX, this.x));
      const y = Math.max(ARENA.minY, Math.min(ARENA.maxY, this.y));
      if (x !== this.x || y !== this.y) {
        s.angle += Math.PI * 3 / 4 + randInt(45) * Math.PI / 180;
        this.x = x;
        this.y = y;
      }
    }
    /** A new hole, at the end of a random walk from a lower corner hole. */
    breakFloor(game) {
      const tiles = game.room.tiles;
      let tx = randInt(2) === 0 ? 0 : TILES_X - 1;
      let ty = TILES_Y - 1;
      for (let n = 0; tiles.get(tx, ty) != null && n < 1e4; n++) {
        switch (randInt(4)) {
          case 0:
            tx = Math.max(0, tx - 1);
            break;
          case 1:
            ty = Math.max(0, ty - 1);
            break;
          case 2:
            tx = Math.min(TILES_X - 1, tx + 1);
            break;
          default:
            ty = Math.min(TILES_Y - 1, ty + 1);
        }
      }
      breakFloor(game, tx, ty);
    }
    /** Sucks the ball in : if it gets it, eats it, then spits it out. */
    updateSuck(dt, game) {
      const s = this.state;
      const ball = game.ball;
      s.time -= dt;
      this.pincers = this.pincers * decay(0.6, dt) + 45 * (1 - decay(0.6, dt));
      this.suction = this.suction * decay(0.95, dt) + (1 + this.hits * 0.2) * (1 - decay(0.95, dt));
      if (ball.falling) {
        this.nextPattern(game);
        return;
      }
      const d2 = dist2(ball.x, ball.y, this.x, this.y);
      if (d2 < 500) {
        ball.controlled = false;
        ball.placeAt(this.x, this.y + 22);
        ball.hidden = true;
        this.play("eat");
        this.state = { name: "wait", time: U, then: (g) => this.spit(g) };
        return;
      }
      const force = (120 + this.hits * 20) * 1600 * dt / d2;
      ball.vx += (this.x - ball.x) * force;
      ball.vy += (this.y - ball.y) * force;
      if (s.time <= 0)
        this.nextPattern(game);
    }
    spit(game) {
      const ball = game.ball;
      const a = (randInt(100) + 40) * Math.PI / 180;
      ball.hidden = false;
      ball.vx = 2400 * Math.cos(a);
      ball.vy = 2400 * Math.sin(a);
      ball.controlled = true;
      this.play("spit");
      this.state = { name: "wait", time: 0.5 * U, then: "attack" };
    }
    // ----- the eye -----
    throwEye(game) {
      app.audio.play("eye");
      this.play("eyeless");
      const ball = game.ball;
      const a = Math.atan2(ball.y - (this.y - 100), ball.x - this.x);
      const speed = (5 + this.hits * 1.5) * 40;
      this.eye = { x: this.x, y: this.y - 10, vx: speed * Math.cos(a), vy: speed * Math.sin(a), back: false };
      this.state = { name: "shoot" };
    }
    /**
     * The eye flies ; the ball hitting it sends it back. If it comes back into
     * the octopus, the octopus is hurt ; if it leaves the room, a new eye grows.
     */
    updateEye(dt, game) {
      const eye = this.eye;
      const ball = game.ball;
      let d2 = dist2(ball.x, ball.y, eye.x, eye.y);
      if (!ball.falling && d2 < 38 * 38) {
        app.audio.play("wall");
        const d = Math.sqrt(d2) || 1;
        const eyeSpeed = (7 + this.hits * 1.5) * 40;
        eye.vx = eyeSpeed * (eye.x - ball.x) / d;
        eye.vy = eyeSpeed * (eye.y - ball.y) / d;
        const speed = Math.max(1e3, ball.speed);
        ball.vx = speed * (ball.x - eye.x) / d;
        ball.vy = speed * (ball.y - eye.y) / d;
        eye.back = true;
      }
      if (eye.back && dist2(this.x, this.y - this.jumpHeight, eye.x, eye.y) < 50 * 50) {
        this.eye = null;
        this.hits++;
        this.hurt = U;
        app.audio.play("newEye");
        app.audio.play("bossDeath");
        this.play("newEye");
        this.state = { name: "wait", time: 0, then: "attack" };
        return;
      }
      eye.x += eye.vx * dt;
      eye.y += eye.vy * dt;
      if (eye.x < -30 || eye.y < -30 || eye.x > WIDTH + 30 || eye.y > HEIGHT + 30) {
        this.eye = null;
        app.audio.play("newEye");
        this.play("newEye");
        this.state = { name: "wait", time: 0.5 * U, then: "attack" };
      }
    }
    // ----- contact -----
    /** Pushes the ball away when it touches the octopus (an elliptic shape). */
    collide(dt, game) {
      const ball = game.ball;
      if (ball.falling || ball.hidden)
        return;
      const dx = ball.x - this.x;
      const dy = ball.y - this.y;
      if (dx * dx + dy * dy * 2 < 2e3) {
        const a = Math.atan2(dy, dx);
        const push = 30 * 1600 * dt;
        ball.vx += push * Math.cos(a);
        ball.vy += push * Math.sin(a);
        app.audio.play("wall");
      }
    }
    // ----- death -----
    die(game) {
      app.audio.play("bossDeath");
      this.play("death");
      const ball = game.ball;
      ball.vx = 0;
      ball.vy = 0;
      ball.controlled = false;
      game.invincible = true;
      this.particles = [];
      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < 8; i++) {
          this.particles.push({
            angle: i / 8 * TAU + ring * 0.5,
            dist: 0,
            speed: (ring + 1) * 2.5 * 40,
            scale: 2 + ring * 0.5
          });
        }
      }
    }
    /** The blobs spiral out ; the game is won when they are gone. */
    updateDeath(dt, game) {
      for (const p of this.particles) {
        p.angle += 0.1 * p.speed / 5 * dt;
        p.dist += p.speed * dt;
        p.scale -= 5 / 100 * 40 * dt;
        p.x = this.x + Math.cos(p.angle) * p.dist;
        p.y = this.y + Math.sin(p.angle) * p.dist;
      }
      this.particles = this.particles.filter((p) => {
        const w = 20 * p.scale;
        return p.scale > 0 && p.x > -w && p.y > -w && p.x < WIDTH + w && p.y < HEIGHT + w;
      });
      if (this.particles.length === 0 && this.anim.time > 0.5) {
        this.particles = [];
        this.dead = true;
        game.bossBeaten();
      }
    }
    // ----- drawing -----
    /** The pupil follows the ball ; random blinks. */
    lookAt(ball, dt) {
      const a = Math.atan2(ball.y - this.y, ball.x - this.x);
      const x = Math.cos(a) * 28;
      const y = Math.sin(a) * 7 + 8 * Math.abs(Math.sin(a));
      const k = decay(0.9, dt);
      this.pupil.x = this.pupil.x * k + x * (1 - k);
      this.pupil.y = this.pupil.y * k + y * (1 - k);
      if (this.anim.name !== "sleep" && this.blink <= 0 && Math.random() < dt)
        this.blink = 0.3;
    }
    renderShadow(ctx) {
      if (this.particles && this.anim.time > 0.3)
        return;
      const s = 1 + this.jumpHeight / 300;
      ctx.fillStyle = "rgba(40,0,60," + 0.3 * this.alpha + ")";
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 28, 44 * s, 14 * s, 0, 0, TAU);
      ctx.fill();
    }
    render(ctx, game) {
      const a = this.anim;
      let scale = 1;
      let alpha = this.alpha;
      if (a.name === "death") {
        const k = Math.min(1, a.time / 1);
        scale = 1 + k * 0.6;
        alpha *= 1 - k;
      } else if ((a.name === "eat" || a.name === "spit") && a.time < 0.35) {
        scale = 1 + 0.13 * Math.sin(a.time / 0.35 * Math.PI);
      }
      if (alpha > 0) {
        ctx.globalAlpha = alpha;
        const redness = (this.hits * 40 + Math.max(0, this.hurt / U) * 100) / 255;
        drawTinted(ctx, this.x, this.y - this.jumpHeight, 70, this.hits || this.hurt > 0 ? redness : 0, (c) => {
          c.scale(scale, scale);
          this.drawBody(c);
        });
        ctx.globalAlpha = 1;
      }
      if (this.eye)
        drawThrownEye(ctx, this.eye, this.hits);
      if (this.particles)
        for (const p of this.particles)
          sphere(ctx, p.x, p.y, 10 * p.scale, "#c070f0", "#5a1a8a", "#f0d0ff");
    }
    drawBody(ctx) {
      const t = app.time * 5;
      const name = this.anim.name;
      if (this.suction > 0.05) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.5 + i / 3) % 1;
          ctx.beginPath();
          ctx.arc(0, 25, (60 - k * 50) * this.suction, 0.2 * Math.PI, 0.8 * Math.PI);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = "#7a36b0";
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const bx = -30 + i * 12;
        const wave = Math.sin(t + i) * 6;
        ctx.lineWidth = 9 - Math.abs(i - 2.5);
        ctx.beginPath();
        ctx.moveTo(bx, 10);
        ctx.quadraticCurveTo(bx * 1.3 + wave, 30, bx * 1.5 - wave, 40 + i % 2 * 4);
        ctx.stroke();
      }
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * 24, 18);
        ctx.rotate(-side * this.pincers * Math.PI / 180);
        ctx.fillStyle = "#d06ae0";
        ctx.strokeStyle = "#5a1a78";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * 16, 6, side * 10, 20);
        ctx.quadraticCurveTo(side * 4, 12, 0, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      const g = ctx.createRadialGradient(-12, -22, 5, 0, -5, 48);
      g.addColorStop(0, "#e2a4ff");
      g.addColorStop(0.5, "#a650dc");
      g.addColorStop(1, "#5a1a8a");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, -6, 42, 34, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#4a1070";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (const [x, y, r] of [[-26, -18, 5], [24, -22, 4], [30, 2, 3], [-30, 4, 3]]) {
        circle(ctx, x, y, r);
        ctx.fill();
      }
      this.drawEye(ctx, name);
      if (name === "sleep")
        text(ctx, "z", 30 + Math.sin(t) * 3, -40 - t * 4 % 12, { size: 14, color: "#fff" });
    }
    drawEye(ctx, name) {
      if (this.eye || name === "eyeless") {
        ctx.fillStyle = "#3a0858";
        ctx.beginPath();
        ctx.ellipse(0, -6, 16, 13, 0, 0, TAU);
        ctx.fill();
        return;
      }
      const grow = name === "newEye" ? Math.min(1, this.anim.time / 0.25) : 1;
      ctx.save();
      ctx.translate(0, -6);
      ctx.scale(grow, grow);
      sphere(ctx, 0, 0, 16, "#ffffff", "#c8b8d8", "#ffffff");
      const p = this.pupil;
      ctx.save();
      ctx.translate(p.x * 0.3, p.y * 0.5);
      ctx.scale(Math.max(0.3, 1 - Math.abs(p.x) / 100), Math.max(0.3, 1 - Math.abs(p.y) * 1.5 / 100));
      sphere(ctx, 0, 0, 8, "#e0304a", "#6a0010");
      ctx.fillStyle = "#000";
      circle(ctx, 0, 0, 3.5);
      ctx.fill();
      ctx.restore();
      const lid = name === "sleep" ? 1 : this.blink > 0 ? Math.sin(this.blink / 0.3 * Math.PI) : 0;
      if (lid > 0) {
        ctx.fillStyle = "#9a48cc";
        ctx.beginPath();
        ctx.ellipse(0, -16 + 16 * lid, 17, 16 * lid + 0.1, 0, Math.PI, TAU);
        ctx.rect(-17, -17, 34, 1 + 16 * lid);
        ctx.fill();
        if (lid === 1) {
          ctx.strokeStyle = "#4a1070";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -2, 12, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  };
  function drawThrownEye(ctx, eye, hits) {
    const a = Math.atan2(eye.vy, eye.vx);
    drawTinted(ctx, eye.x, eye.y, 16, hits * 40 / 255, (c) => {
      sphere(c, 0, 0, 13, "#ffffff", "#b8a8c8");
      sphere(c, Math.cos(a) * 5, Math.sin(a) * 5, 6, "#e0304a", "#6a0010");
      c.fillStyle = "#000";
      circle(c, Math.cos(a) * 6, Math.sin(a) * 6, 2.5);
      c.fill();
      c.strokeStyle = "rgba(200,40,60,0.5)";
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const b = a + Math.PI + (i - 1.5) * 0.4;
        c.beginPath();
        c.moveTo(Math.cos(b) * 12, Math.sin(b) * 12);
        c.lineTo(Math.cos(b) * 5, Math.sin(b) * 5);
        c.stroke();
      }
    });
  }

  // src/bosses/powers.js
  var FRAME = 1 / ORIGINAL_FPS;
  var FrameClock = class {
    constructor() {
      this.time = 0;
    }
    run(dt, step2) {
      this.time += dt;
      while (this.time >= FRAME) {
        this.time -= FRAME;
        step2();
      }
    }
  };
  var Power = class extends Entity {
    constructor(x, y, layer) {
      super(x, y, layer);
    }
    destroy() {
      this.dead = true;
    }
  };
  var Water = class extends Power {
    constructor(boss, strong) {
      super(boss.x, boss.y, Layer.EFFECT);
      this.angle = boss.angleToBall();
      this.speed = 40;
      this.turn = strong ? 0.4 : 0;
      this.accel = strong ? 1.03 : 1;
      this.wet = 0;
      this.hit = false;
      this.drops = [];
      this.trail = [];
      this.clock = new FrameClock();
    }
    update(dt, game) {
      const ball = game.ball;
      this.updateSplash(dt);
      if (this.hit) {
        this.wet -= dt;
        ball.water = this.wet > 0;
        this.clock.run(dt, () => {
          if (this.wet > 0 && !ball.falling && ball.speed > 20)
            this.trail.push({ x: ball.x + 2, y: ball.y + 2, a: Math.atan2(ball.vy, ball.vx) + Math.PI, len: ball.speed / 40 * 0.3, age: 0, alpha: Math.min(this.wet, 1) });
        });
        if (this.wet <= 0 && this.drops.length === 0 && this.trail.length === 0) {
          ball.water = false;
          this.dead = true;
        }
        return;
      }
      this.angle += this.turn * dt;
      this.speed *= decay(this.accel, dt);
      this.x += Math.cos(this.angle) * this.speed * dt;
      this.y += Math.sin(this.angle) * this.speed * dt;
      if (this.x < -50 || this.y < -50 || this.x > WIDTH + 50 || this.y > HEIGHT + 50) {
        this.dead = true;
        return;
      }
      if (dist(this.x, this.y, ball.x, ball.y) < 25)
        this.splash();
    }
    splash() {
      this.hit = true;
      this.wet = 10 + randInt(5);
      for (const dx of [-1, -2, 1, 2])
        this.drops.push({ x: this.x, y: this.y, vx: dx * 40, vy: -(3 + randInt(2)) * 40, size: 1, r: 3 + randInt(3) });
    }
    updateSplash(dt) {
      for (const d of this.drops) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 0.4 * 1600 * dt;
        d.size -= 2 * dt;
      }
      this.drops = this.drops.filter((d) => d.size > 0.05);
      for (const t of this.trail)
        t.age += dt;
      this.trail = this.trail.filter((t) => t.age < 0.25);
    }
    destroy() {
      this.wet = 0;
      if (!this.hit)
        this.dead = true;
    }
    render(ctx) {
      for (const t of this.trail) {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.a);
        ctx.globalAlpha = 0.5 * (1 - t.age / 0.25) * t.alpha;
        ctx.fillStyle = "#6ac8ff";
        ctx.beginPath();
        ctx.ellipse(t.len / 2, 0, t.len / 2 + 2, 4, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      for (const d of this.drops)
        sphere(ctx, d.x, d.y, d.r * d.size, "#9adcff", "#2a7ac8", "#fff");
      if (this.hit)
        return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = "rgba(120,200,255,0.5)";
      circle(ctx, 0, 0, 13 + Math.sin(app.time * 8) * 2);
      ctx.fill();
      ctx.fillStyle = "#6ac8ff";
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.quadraticCurveTo(9, 0, 7, 5);
      ctx.arc(0, 5, 7, 0, Math.PI);
      ctx.quadraticCurveTo(-9, 0, 0, -12);
      ctx.fill();
      shine(ctx, 0, 3, 7, 0.8);
      ctx.restore();
    }
  };
  var Fire = class extends Power {
    constructor(boss) {
      super(boss.x, boss.y, Layer.OBJECT);
      this.age = 0;
      this.life = 10 + randInt(10);
      this.ending = -1;
    }
    get burning() {
      return this.age > 0.375 && this.ending < 0;
    }
    update(dt, game) {
      this.age += dt;
      if (this.ending >= 0) {
        this.ending += dt;
        if (this.ending > 0.375)
          this.dead = true;
        return;
      }
      if (this.age > this.life)
        this.ending = 0;
      const ball = game.ball;
      if (!this.burning || ball.falling || ball.invulnerable > 0)
        return;
      const dx = this.x - ball.x;
      const dy = this.y - ball.y;
      if (Math.sqrt(dx * dx + dy * dy / 3) < 15) {
        this.ending = 0;
        ball.die();
      }
    }
    destroy() {
      if (this.ending < 0)
        this.ending = 0;
    }
    render(ctx) {
      const t = app.time * 13;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = "rgba(60,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 7, 0, 0, TAU);
      ctx.fill();
      if (this.age < 0.375) {
        ctx.fillStyle = "rgba(255," + (100 + this.age * 320) + ",0,0.8)";
        for (let i = 0; i < 5; i++) {
          circle(ctx, Math.cos(i * 1.3 + t) * 8, Math.sin(i * 1.3 + t) * 3, 2);
          ctx.fill();
        }
      } else {
        const height = this.ending < 0 ? 1 : 1 - this.ending / 0.375;
        const WIDTHS = [14, 10, 6];
        const HEIGHTS = [48, 38, 26];
        const COLORS = ["#ff4a10", "#ff9a20", "#ffe860"];
        for (let i = 0; i < 3; i++) {
          const w = WIDTHS[i] * (0.8 + 0.2 * Math.sin(t + i));
          const h = HEIGHTS[i] * height;
          ctx.fillStyle = COLORS[i];
          ctx.beginPath();
          ctx.moveTo(-w, 0);
          ctx.quadraticCurveTo(-w, -h * 0.5, Math.sin(t + i) * 4, -h);
          ctx.quadraticCurveTo(w, -h * 0.5, w, 0);
          ctx.ellipse(0, 0, w, w * 0.45, 0, 0, Math.PI);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  };
  var VINE_SEGMENTS = 10;
  var VINE_REST = 5;
  var VINE_BREAK = 225;
  var Earth = class extends Power {
    constructor(boss) {
      const tx = Math.floor((boss.x - TILE_ORIGIN) / TILE);
      const ty = Math.floor((boss.y - TILE_ORIGIN) / TILE);
      super(TILE_ORIGIN + 1 + tx * TILE + TILE / 2, TILE_ORIGIN + 1 + ty * TILE + TILE / 2, Layer.ITEM);
      this.life = 10 + randInt(10);
      this.age = 0;
      this.vine = null;
      this.breaking = -1;
      this.withering = -1;
      this.clock = new FrameClock();
    }
    update(dt, game) {
      this.age += dt;
      const ball = game.ball;
      if (this.withering >= 0) {
        this.withering += dt;
        if (this.withering > 0.4)
          this.dead = true;
        return;
      }
      if (this.vine) {
        if (this.breaking >= 0) {
          this.breaking += dt;
          if (this.breaking > 0.25) {
            this.vine = null;
            this.withering = 0;
          }
          return;
        }
        this.clock.run(dt, () => this.pullVine(ball));
        if (dist(this.x, this.y, ball.x, ball.y) > VINE_BREAK || ball.falling)
          this.breaking = 0;
        return;
      }
      if (this.age > this.life) {
        this.withering = 0;
        return;
      }
      if (dist(this.x, this.y, ball.x, ball.y) < 30) {
        this.vine = [];
        for (let i = 0; i < VINE_SEGMENTS; i++)
          this.vine.push({ x: this.x, y: this.y, vx: 0, vy: 0 });
      }
    }
    /**
     * One frame of the vine : every element is pulled toward the previous one
     * (a spring, stiffer when stretched). The ball receives the pull too.
     */
    pullVine(ball) {
      const b = { x: ball.x, y: ball.y, vx: ball.vx / 40, vy: ball.vy / 40 };
      const chain = this.vine.concat([b]);
      for (let i = 1; i < chain.length; i++) {
        const m = chain[i];
        const link = chain[i - 1];
        let dx = link.x - m.x;
        let dy = link.y - m.y;
        const d = Math.hypot(dx, dy);
        if (d > VINE_REST) {
          const c = d / VINE_REST - 1;
          dx *= c * 0.01;
          dy *= c * 0.01;
          m.vx += dx;
          m.vy += dy;
          link.vx -= dx;
          link.vy -= dy;
        }
      }
      for (let i = 1; i < this.vine.length; i++) {
        const m = this.vine[i];
        m.vx *= 0.95;
        m.vy *= 0.95;
        m.x += m.vx;
        m.y += m.vy;
      }
      ball.vx = b.vx * 40;
      ball.vy = b.vy * 40;
    }
    destroy() {
      if (this.vine && this.breaking < 0)
        this.breaking = 0;
      else if (!this.vine && this.withering < 0)
        this.withering = 0;
    }
    render(ctx, game) {
      if (this.vine) {
        ctx.save();
        ctx.globalAlpha = this.breaking < 0 ? 1 : 1 - this.breaking / 0.25;
        const points = this.vine.concat([game.ball]);
        ctx.strokeStyle = "#5a8a1a";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const p of points)
          ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = "#8ac040";
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i];
          const b = points[i + 1];
          ctx.save();
          ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
          ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
          ctx.beginPath();
          ctx.ellipse(0, -4, 4, 2, 0.5, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        ctx.restore();
      }
      let s = 1 + 0.08 * Math.sin(this.age / 0.225 * TAU);
      let alpha = 1;
      if (this.vine)
        s = 1.4;
      if (this.withering >= 0) {
        const k = Math.min(1, this.withering / 0.4);
        s = 1.4 - k * 1.2;
        alpha = 1 - k;
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(60,30,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 16 * s, 7 * s, 0, 0, TAU);
      ctx.fill();
      ctx.scale(s, s);
      ctx.fillStyle = "#6a9a2a";
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI / 2 + (this.vine ? 0.4 : 0));
        ctx.beginPath();
        ctx.ellipse(0, -9, 5, 10, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      sphere(ctx, 0, 0, 7, "#b8e070", "#3a6a10");
      ctx.restore();
    }
  };
  var Wind = class extends Power {
    constructor(boss, strong, delay = 0) {
      super(boss.x, boss.y, Layer.BOSS);
      this.radius = -delay;
      this.angle = 0;
      this.time = 2;
      this.strength = strong ? 30 : 10;
      this.gusts = [0, 1, 2, 3, 4].map((i) => ({ a: TAU * i / 5 }));
    }
    update(dt, game) {
      this.radius += 200 * dt;
      this.angle += 40 / 12 * dt;
      this.time -= dt;
      if (this.time < 0) {
        this.dead = true;
        return;
      }
      const ball = game.ball;
      let dx = this.x - ball.x;
      let dy = this.y - ball.y;
      const d = Math.max(10, Math.hypot(dx, dy));
      if (d < this.radius) {
        const push = this.strength / Math.sqrt(d) * 1600 * dt;
        ball.vx -= dx / d * push;
        ball.vy -= dy / d * push;
      }
    }
    render(ctx) {
      if (this.radius <= 0)
        return;
      const s = Math.min(this.radius, 100) / 100;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineCap = "round";
      for (const g of this.gusts) {
        const a = g.a + this.angle;
        ctx.save();
        ctx.translate(this.x + Math.cos(a) * this.radius, this.y + Math.sin(a) * this.radius);
        ctx.rotate(a + Math.PI / 2 - 0.3);
        ctx.scale(s, s);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-10, 12, 22, -1.6, -0.6);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-14, 18, 24, -1.5, -0.8);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  };

  // src/bosses/snake.js
  var Element = Object.freeze({ WATER: 0, FIRE: 1, WIND: 2, EARTH: 3 });
  var ELEMENTS = [
    { color: "#8fd8ff", logo: "logo_eau", power: Water, max: 2, sound: "water" },
    { color: "#ff7a3a", logo: "logo_feu", power: Fire, max: 3, sound: "crash" },
    { color: "#e9f4ff", logo: "logo_vent", power: Wind, max: 1, sound: "wind" },
    { color: "#a6d25a", logo: "logo_terre", power: Earth, max: 3, sound: "earth" }
  ];
  var RINGS = 3;
  var STATES = ["wait", "search", "charge", "evade", "power"];
  var STATE_WEIGHTS = { angry: [1, 5, 2, 2, 5], calm: [2, 0, 0, 10, 2] };
  var PER_SECOND = 40;
  var Snake = class extends Boss {
    constructor(game, element) {
      super(WIDTH / 2, HEIGHT / 2);
      this.element = ELEMENTS[element];
      this.powers = [];
      this.push = 3;
      this.angle = 0;
      this.speed = 0;
      this.targetSpeed = 0;
      this.accel = 1.05;
      this.turn = 0.03;
      this.state = "wait";
      this.timer = 0;
      this.angry = 0;
      this.berserk = 0;
      this.dying = false;
      this.bite = 0;
      this.againstWall = false;
      this.idleClock = 0;
      this.parts = [];
      for (let i = 0; i < RINGS + 2; i++) {
        const kind = i === 0 ? "head" : i === RINGS + 1 ? "tail" : "ring";
        this.parts.push({ kind, r: kind === "head" ? 20 : 25, scale: 1, x: this.x, y: this.y, angle: 0, spin: 0 });
      }
      this.resizeRings();
      this.path = [{ x: this.x, y: this.y, a: 0 }];
      this.scales = [];
      game.room.add(new ElementLogo(this.element.logo));
      this.choose(game);
      for (let i = 0; i < 5; i++)
        this.update(1 / 40, game);
    }
    angleToBall(ball = this.ball) {
      return Math.atan2(ball.y - this.y, ball.x - this.x);
    }
    /** The rings get smaller toward the tail. */
    resizeRings() {
      const n = this.parts.length;
      for (let i = 1; i < n - 1; i++) {
        const s = 1 - i / n;
        this.parts[i].scale = s;
        this.parts[i].r = s * 50;
      }
    }
    get eyes() {
      return this.berserk > 0 ? "#ffea00" : this.angry > 0 ? "#ff3020" : "#40ff60";
    }
    // ----- every step -----
    update(dt, game) {
      this.ball = game.ball;
      this.powers = this.powers.filter((p) => !p.dead);
      this.updateScales(dt);
      this.bite = Math.max(0, this.bite - dt);
      if (this.dying) {
        this.updateDeath(dt, game);
        return;
      }
      if (this.berserk === 0 && this.angry > 0) {
        this.angry -= dt;
        if (this.angry <= 0) {
          this.angry = 0;
          this.choose(game);
        }
      }
      if (this.berserk > 0 && !game.ball.falling) {
        this.berserk -= dt;
        if (this.berserk <= 0) {
          this.berserk = 0;
          this.powers.forEach((p) => p.destroy());
          this.dying = true;
          game.invincible = true;
        }
      }
      this.timer -= dt;
      if (this.timer <= 0)
        this.choose(game);
      this.updateSpeed(dt);
      this.steer(dt, game);
      this.move(dt, game);
      this.placeParts(dt);
    }
    /** Brakes smoothly, or accelerates by `accel` (from 1 px/frame). */
    updateSpeed(dt) {
      if (this.speed > this.targetSpeed) {
        this.speed = Math.max(this.targetSpeed, this.speed * decay(0.97, dt));
      } else if (this.speed < this.targetSpeed) {
        this.speed = Math.min(this.targetSpeed, Math.max(PER_SECOND, this.speed) * decay(this.accel, dt));
      }
    }
    /** Turns according to the state. */
    steer(dt, game) {
      const turnTo = (target) => {
        const diff = angleDiff(this.angle, target);
        this.angle += Math.sign(diff) * this.turn * PER_SECOND * dt;
      };
      switch (this.state) {
        case "search":
          turnTo(this.angleToBall());
          break;
        case "evade":
          turnTo(this.angleToBall() + Math.PI);
          break;
        case "recall":
          this.turn *= decay(0.97, dt);
          if (Math.abs(this.turn) < 0.1)
            this.turn = Math.sign(this.turn) * 0.1;
          this.angle += this.turn * PER_SECOND * dt;
          if (!this.againstWall)
            this.choose(game);
          break;
      }
    }
    /** Moves the head pixel by pixel, recording its path, colliding with the ball. */
    move(dt, game) {
      let distance = this.speed * dt;
      if (distance <= 0) {
        this.collide(game);
        this.idleClock += dt;
        if (this.idleClock >= 1 / 40) {
          this.idleClock = 0;
          this.path.push({ x: this.x, y: this.y, a: this.angle });
        }
      }
      while (distance > 0) {
        const step2 = Math.min(distance, 1);
        distance -= 1;
        this.x += Math.cos(this.angle) * step2;
        this.y += Math.sin(this.angle) * step2;
        this.keepInside();
        this.path.push({ x: this.x, y: this.y, a: this.angle });
        this.collide(game);
      }
      if (this.path.length > 2e3)
        this.path.splice(0, this.path.length - 1e3);
    }
    /** Keeps the head away from the walls ; hitting one makes it turn away. */
    keepInside() {
      const m = 60;
      const x = Math.max(ARENA.minX + m, Math.min(ARENA.maxX - m, this.x));
      const y = Math.max(ARENA.minY + m, Math.min(ARENA.maxY - m, this.y));
      this.againstWall = x !== this.x || y !== this.y;
      this.x = x;
      this.y = y;
      if (this.againstWall && this.state !== "recall") {
        this.turn = randInt(2) === 0 ? 0.3 : -0.3;
        this.state = "recall";
        this.timer = 1;
      }
    }
    /** Places each part further back on the path of the head. */
    placeParts(dt) {
      let p = this.path.length - 1 + this.parts[0].r;
      const k = 1 - decay(1 - (this.angry > 0 ? 0.4 : 0.3), dt);
      for (const part of this.parts) {
        p -= part.r;
        const pos = this.path[Math.max(0, Math.floor(p))];
        part.x = pos.x;
        part.y = pos.y;
        part.angle += angleDiff(part.angle, pos.a) * k;
        p -= part.r;
      }
    }
    // ----- the ball -----
    collide(game) {
      const ball = game.ball;
      if (ball.falling)
        return;
      const head = this.parts[0];
      if (this.inEllipse(head, ball, 42, 34, 0)) {
        if (Math.abs(angleDiff(this.angle, this.angleToBall())) < 0.3) {
          this.bite = 0.25;
          if (this.angry === 0)
            this.loseRing(game);
          this.angry = 6 + randInt(4);
        }
        this.pushBall(head);
        return;
      }
      const tail = this.parts[this.parts.length - 1];
      if (this.inEllipse(tail, ball, 40, 14, 12) && ball.invulnerable <= 0) {
        app.audio.play("death");
        ball.die();
        return;
      }
      for (let i = 1; i < this.parts.length; i++) {
        const part = this.parts[i];
        const r = part.r + BALL_RADIUS / 2;
        if ((ball.x - part.x) ** 2 + (ball.y - part.y) ** 2 < r * r) {
          this.pushBall(part);
          return;
        }
      }
    }
    /**
     * Is the ball in the ellipse (rx, ry) of a part ? `ox` moves the ellipse
     * along the part. (The parts are drawn facing backward, see render.)
     */
    inEllipse(part, ball, rx, ry, ox) {
      const a = part.angle + Math.PI;
      const dx = ball.x - part.x;
      const dy = ball.y - part.y;
      const lx = (dx * Math.cos(a) + dy * Math.sin(a)) / part.scale - ox;
      const ly = (-dx * Math.sin(a) + dy * Math.cos(a)) / part.scale;
      return lx * lx / (rx * rx) + ly * ly / (ry * ry) < 1;
    }
    pushBall(part) {
      const ball = this.ball;
      const d = Math.hypot(part.x - ball.x, part.y - ball.y) || 1;
      ball.vx -= this.push * PER_SECOND * (part.x - ball.x) / d;
      ball.vy -= this.push * PER_SECOND * (part.y - ball.y) / d;
      app.audio.play("wall");
    }
    /** Loses the first ring : its scales fly away. */
    loseRing(game) {
      if (this.parts.length <= 2)
        return;
      const ring = this.parts[1];
      app.audio.play("touched");
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI / 2.5;
        const d = ring.r / 2 + Math.random() * ring.r / 2;
        this.scales.push({ x: ring.x + Math.cos(a) * d, y: ring.y + Math.sin(a) * d, a, rot: Math.random() * TAU, size: 3 });
      }
      this.parts.splice(1, 1);
      this.resizeRings();
      this.angry = 1;
      if (this.parts.length === 2)
        this.berserk = 10;
      this.choose(game, "charge");
    }
    updateScales(dt) {
      for (const s of this.scales) {
        s.x += Math.cos(s.a) * 400 * dt;
        s.y += Math.sin(s.a) * 400 * dt;
        s.rot += 3.5 * dt;
        s.size -= 6 * dt;
      }
      this.scales = this.scales.filter((s) => s.size > 0.1);
    }
    // ----- behaviour -----
    choose(game, forced) {
      const angry = this.angry > 0 || this.berserk > 0;
      this.state = forced || STATES[weightedIndex(angry ? STATE_WEIGHTS.angry : STATE_WEIGHTS.calm)];
      this.accel = 1.05;
      this.turn = angry ? 0.05 : 0.03;
      switch (this.state) {
        case "wait":
          this.timer = 0.5;
          this.targetSpeed = 0;
          break;
        case "search":
          this.timer = 1 + Math.random();
          this.targetSpeed = 5 * PER_SECOND;
          break;
        case "charge":
          this.accel = 1.15;
          this.timer = 0.5;
          this.angle = this.angleToBall(game.ball);
          this.targetSpeed = 15 * PER_SECOND;
          break;
        case "evade":
          this.accel = 1.1;
          this.timer = 1 + Math.random();
          this.targetSpeed = (angry ? 8 : 4) * PER_SECOND;
          break;
        case "power":
          this.castPower(game);
          this.choose(game);
          return;
      }
      if (this.berserk > 0) {
        this.timer /= 2;
        this.targetSpeed *= 1.3;
        this.turn *= 2;
      }
    }
    castPower(game) {
      const e = this.element;
      if (this.powers.length >= e.max)
        return;
      this.ball = game.ball;
      app.audio.play(e.sound);
      const power = new e.power(this, false);
      this.powers.push(power);
      game.room.add(power);
    }
    // ----- death -----
    /** Every part spins and shrinks ; the game is won when they are gone. */
    updateDeath(dt, game) {
      let left = false;
      for (const p of this.parts) {
        p.spin += 30 * PER_SECOND * Math.PI / 180 * dt;
        p.scale -= dt;
        left = left || p.scale > 0;
      }
      if (!left) {
        this.dead = true;
        game.bossBeaten();
      }
    }
    // ----- drawing -----
    render(ctx) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        if (p.scale <= 0)
          continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle + Math.PI + p.spin);
        ctx.scale(p.scale, p.scale);
        this.drawPart(ctx, p);
        ctx.restore();
      }
      for (const s of this.scales) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.scale(s.size, s.size);
        ctx.fillStyle = this.element.color;
        ctx.strokeStyle = "rgba(0,0,0,0.3)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(5, -2, 3, 4);
        ctx.quadraticCurveTo(0, 6, -3, 4);
        ctx.quadraticCurveTo(-5, -2, 0, -5);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    drawPart(ctx, p) {
      const img = tinted("snake_" + p.kind.replace("ring", "body"), this.element.color);
      if (!img)
        return;
      if (p.kind === "tail") {
        ctx.drawImage(img, -26, -img.height / 2);
        return;
      }
      if (p.kind === "head") {
        const bite = this.bite > 0 ? Math.sin(this.bite / 0.25 * Math.PI) * 6 : 0;
        ctx.drawImage(img, -img.width / 2 + bite, -img.height / 2);
        for (const side of [-1, 1])
          sphere(ctx, -38 + bite, side * 24, 5, this.eyes, "#202020", "#ffffff");
        return;
      }
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
  };
  var ElementLogo = class extends Entity {
    constructor(name) {
      super(WIDTH / 2, HEIGHT / 2, Layer.FLOOR);
      this.name = name;
      this.alpha = 0;
    }
    update(dt) {
      this.alpha = Math.min(1, this.alpha + dt);
    }
    render(ctx) {
      const img = app.images.get(this.name);
      if (!img)
        return;
      const w = img.naturalWidth * 1.3;
      const h = img.naturalHeight * 1.3;
      ctx.globalAlpha = this.alpha;
      ctx.drawImage(img, WIDTH / 2 - w / 2, HEIGHT / 2 - h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  };
  var tintCache = /* @__PURE__ */ new Map();
  function tinted(name, color) {
    const key = name + color;
    if (tintCache.has(key))
      return tintCache.get(key);
    const img = app.images.get(name);
    if (!img)
      return null;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(img, 0, 0);
    tintCache.set(key, canvas);
    return canvas;
  }

  // src/bosses/tourneboule.js
  var HITS_TO_GROUND = 4;
  var HITS_TO_DIE = 20;
  var FLY_HEIGHT = 60;
  var Power2 = { WIND: 0, FIRE: 1, WATER: 2, EARTH: 3, HOLES: 4, BLOCK: 5 };
  var KATA_COLORS = ["#e8fff0", "#ff6a2a", "#5ac8ff", "#b08a4a", "#b070ff", "#7ad84a"];
  var KATA_HANDS = [
    (k) => [-Math.PI / 2 - k * 3, -Math.PI / 2 + k * 3],
    (k) => [k * TAU, Math.PI + k * TAU],
    (k) => [-0.3 - Math.sin(k * Math.PI) * 1.2, Math.PI + 0.3 + Math.sin(k * Math.PI) * 1.2],
    (k) => [Math.PI / 2 + Math.sin(k * TAU) * 1.5, Math.PI / 2 - Math.sin(k * TAU) * 1.5],
    (k) => [-Math.PI / 2 + Math.sin(k * 3 * Math.PI) * 0.8, Math.PI / 2 - Math.sin(k * 3 * Math.PI) * 0.8],
    (k) => [Math.PI + k * Math.PI, -k * Math.PI]
  ];
  var KATA_TIME = 0.6;
  var KATA_CAST = 0.35;
  var Tourneboule = class extends Boss {
    constructor(game) {
      super(WIDTH / 2, HEIGHT / 2);
      this.powers = [];
      this.hits = 0;
      this.hurt = 0;
      this.shield = false;
      this.shieldFlash = 0;
      this.speed = 0;
      this.alpha = 1;
      this.spinTime = 0;
      this.holesMade = 0;
      this.blocksMade = 0;
      this.previousKata = -1;
      this.set("land");
    }
    /** Changes state ; `data` gives the fields of the new state. */
    set(name, data = {}) {
      this.state = { name, time: 0, ...data };
    }
    angleToBall() {
      return Math.atan2(this.ball.y - this.y, this.ball.x - this.x);
    }
    // ----- every step -----
    update(dt, game) {
      this.ball = game.ball;
      this.powers = this.powers.filter((p) => !p.dead);
      this.spinTime += dt;
      this.shieldFlash = Math.max(0, this.shieldFlash - dt * 5);
      this.hurt = Math.max(0, this.hurt - dt);
      const s = this.state;
      s.time += dt;
      switch (s.name) {
        case "land":
          if (s.time >= 0.5)
            this.startWait();
          break;
        case "wait":
          this.collide(dt, game);
          if (s.time >= s.duration)
            this.startKatas(game);
          break;
        case "kata":
          this.collide(dt, game);
          this.updateKata(game);
          break;
        case "takeoff":
          if (s.time >= 0.375)
            this.set("fly", { loops: 3 });
          break;
        case "fly":
          if (s.time >= 0.5) {
            if (s.loops-- <= 0)
              this.vanish(game);
            else
              s.time = 0;
          }
          break;
        case "hidden":
          this.updateHidden(dt, game);
          break;
        case "appear":
          if (s.time >= 0.5)
            this.set("land");
          break;
        case "death":
          if (s.time >= 1) {
            this.dead = true;
            game.bossBeaten();
          }
          break;
      }
    }
    startWait() {
      this.shield = true;
      this.set("wait", { duration: [0.5, 0.2, 0.1][this.hits] || 0 });
    }
    /** Chooses the power of the next katas. */
    startKatas(game) {
      let power;
      for (let n = 0; n < 1e3; n++) {
        power = randInt(6);
        if (this.hits >= HITS_TO_GROUND && (power === Power2.FIRE || power === Power2.EARTH))
          continue;
        if (power === Power2.HOLES && this.holesMade > 20)
          continue;
        if (power === Power2.BLOCK && this.blocksMade > 20)
          continue;
        if (power === Power2.EARTH && game.room.tiles.get(...tileOf(this.x, this.y)) === Item.HOLE)
          continue;
        break;
      }
      this.startKata(power, this.hits >= HITS_TO_GROUND ? 0 : 2, true);
    }
    /**
     * A kata. `left` = katas after this one ; the first one shows the power
     * (its colour), the others are random, the last one casts it.
     */
    startKata(power, left, first = false) {
      let kata = power;
      if (!first) {
        do {
          kata = randInt(6);
        } while (kata === this.previousKata);
      }
      this.previousKata = kata;
      app.audio.play(left === 0 ? "kata3" : "kata" + (1 + randInt(3)));
      this.set("kata", { kata, power, left, cast: false });
    }
    updateKata(game) {
      const s = this.state;
      if (s.left === 0 && !s.cast && s.time >= KATA_CAST) {
        s.cast = true;
        this.cast(s.power, game);
      }
      if (s.time < KATA_TIME)
        return;
      if (s.left > 0) {
        this.startKata(s.power, s.left - 1);
      } else if (this.hits >= HITS_TO_DIE) {
        this.die(game);
      } else if (this.hits >= HITS_TO_GROUND) {
        this.hurt = 1;
        this.hits++;
        this.startKatas(game);
      } else {
        this.set("takeoff");
      }
    }
    /** Flies invisibly to a place at least 200 pixels away. */
    vanish(game) {
      app.audio.play("hide");
      game.room.add(new Puff(this.x, this.y, false));
      let tx;
      let ty;
      do {
        tx = 50 + randInt(WIDTH - 100);
        ty = 50 + randInt(HEIGHT - 100);
      } while (dist(this.x, this.y, tx, ty) <= 200);
      this.speed = 0;
      this.set("hidden", { tx, ty, target: (10 + randInt(3)) * 40 });
    }
    updateHidden(dt, game) {
      const s = this.state;
      this.speed = Math.min(s.target, Math.max(40, this.speed) * decay(1.05, dt));
      const d = dist(this.x, this.y, s.tx, s.ty);
      const step2 = Math.min(this.speed * dt, d);
      if (d > 0) {
        this.x += (s.tx - this.x) / d * step2;
        this.y += (s.ty - this.y) / d * step2;
      }
      const ball = game.ball;
      this.alpha = ball.type === BallType.VIOLET ? Math.min(1, 2e3 / Math.max(1, (ball.x - this.x) ** 2 + (ball.y - this.y) ** 2)) : 0;
      if (step2 >= d) {
        app.audio.play("hide");
        game.room.add(new Puff(this.x, this.y, true));
        this.alpha = 1;
        this.set("appear");
      }
    }
    /** Touched by the ball : pops the shield, or is hurt. The ball bounces. */
    collide(dt, game) {
      const ball = game.ball;
      if (ball.falling)
        return;
      const dx = ball.x - this.x;
      const dy = ball.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d >= 30)
        return;
      if (this.shield) {
        this.shield = false;
        this.shieldFlash = 1;
      } else if (this.hurt === 0) {
        app.audio.play("touched");
        this.hurt = 1;
        this.hits++;
      }
      const push = 30 * 1600 * dt;
      ball.vx += dx / (d || 1) * push;
      ball.vy += dy / (d || 1) * push;
    }
    // ----- powers -----
    cast(power, game) {
      const room2 = game.room;
      const add = (p) => {
        this.powers.push(p);
        room2.add(p);
        return p;
      };
      switch (power) {
        case Power2.WIND:
          app.audio.play("wind");
          add(new Wind(this, true));
          add(new Wind(this, true, 50));
          break;
        case Power2.FIRE: {
          app.audio.play("crash");
          const MARGIN = 80;
          const pillar = (dx, dy) => {
            const p = add(new Fire(this));
            p.x += dx;
            p.y += dy;
            p.age = randInt(5) / 40;
          };
          if (this.x > MARGIN) pillar(-50, 0);
          if (this.x < WIDTH - MARGIN) pillar(50, 0);
          if (this.y > MARGIN) pillar(0, -50);
          if (this.y < HEIGHT - MARGIN) pillar(0, 50);
          break;
        }
        case Power2.WATER:
          app.audio.play("water");
          for (const a of [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4])
            add(new Water(this, true)).angle = a;
          break;
        case Power2.EARTH:
          app.audio.play("earth");
          add(new Earth(this));
          break;
        case Power2.HOLES: {
          const n = randInt(3) + 1;
          this.holesMade += n;
          for (let i = 0; i < n; i++) {
            const cell = this.freeTile(room2);
            if (!cell)
              break;
            room2.reserved.add(cell.tx + "," + cell.ty);
            room2.add(new CrackingTile(cell.tx, cell.ty, 1.25, (g, tx, ty) => {
              room2.reserved.delete(tx + "," + ty);
              app.audio.play("crash");
              breakFloor(g, tx, ty);
            }));
          }
          break;
        }
        case Power2.BLOCK: {
          this.blocksMade++;
          const cell = this.freeTile(room2);
          if (cell)
            room2.addBlock(cell.tx, cell.ty);
          break;
        }
      }
    }
    /** A random empty tile, away from the corners and the centre. */
    freeTile(room2) {
      const FORBIDDEN = ["0,0", "13,0", "6,4", "7,4", "6,5", "7,5"];
      for (let n = 0; n < 1e3; n++) {
        const tx = randInt(TILES_X);
        const ty = randInt(TILES_Y);
        const key = tx + "," + ty;
        if (!FORBIDDEN.includes(key) && room2.tiles.get(tx, ty) == null && !room2.reserved.has(key))
          return { tx, ty };
      }
      return null;
    }
    die(game) {
      this.set("death");
      this.powers.forEach((p) => p.destroy());
      game.invincible = true;
    }
    // ----- drawing -----
    /** Height above the floor, and spinning speed, of the current state. */
    pose() {
      const s = this.state;
      switch (s.name) {
        case "land": {
          const k = Math.min(1, s.time / 0.5);
          return { alt: FLY_HEIGHT * (1 - k) * (1 - k), spin: (1 - k) * 3 };
        }
        case "takeoff": {
          const k = Math.min(1, s.time / 0.375);
          return { alt: FLY_HEIGHT * k * k, spin: 1 + k * 2 };
        }
        case "fly":
          return { alt: FLY_HEIGHT + Math.sin(s.time / 0.5 * TAU) * 6, spin: 3 };
        case "hidden":
        case "appear":
          return { alt: FLY_HEIGHT, spin: 3 };
        case "kata":
          return { alt: 0, spin: 0, kata: s.kata, k: Math.min(1, s.time / KATA_TIME) };
        case "death":
          return { alt: 0, spin: 4, death: Math.min(1, s.time) };
        default:
          return { alt: 0, spin: 0 };
      }
    }
    renderShadow(ctx) {
      if (this.alpha <= 0)
        return;
      const p = this.pose();
      const s = 1 - p.alt / 150;
      ctx.fillStyle = "rgba(40,0,60," + 0.3 * s * this.alpha * (p.death !== void 0 ? 1 - p.death : 1) + ")";
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 18, 26 * s, 9 * s, 0, 0, TAU);
      ctx.fill();
    }
    render(ctx) {
      if (this.alpha <= 0.01)
        return;
      const p = this.pose();
      ctx.globalAlpha = this.alpha;
      drawTinted(ctx, this.x, this.y - p.alt, 60, this.hurt * 300 / 255, (c) => this.drawBody(c, p));
      ctx.globalAlpha = 1;
      if (this.shieldFlash > 0) {
        ctx.save();
        ctx.globalAlpha = this.shieldFlash;
        ctx.translate(this.x, this.y);
        const g = ctx.createRadialGradient(-10, -14, 4, 0, 0, 38);
        g.addColorStop(0, "rgba(255,255,255,0.8)");
        g.addColorStop(0.7, "rgba(160,220,255,0.25)");
        g.addColorStop(1, "rgba(120,180,255,0.7)");
        ctx.fillStyle = g;
        circle(ctx, 0, 0, 38);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
    drawBody(ctx, p) {
      if (p.death !== void 0) {
        ctx.globalAlpha *= 1 - p.death;
        ctx.scale(1 + p.death, 1 - p.death * 0.8);
      }
      const spin = p.spin ? this.spinTime * 10 * p.spin : 0;
      if (p.kata !== void 0) {
        const r = 26 + Math.sin(p.k * Math.PI) * 14;
        const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r + 8);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.7, KATA_COLORS[p.kata]);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        circle(ctx, 0, 0, r + 8);
        ctx.fill();
      }
      const hands = p.kata !== void 0 ? KATA_HANDS[p.kata](p.k) : [spin + 0.3, spin + Math.PI + 0.3];
      for (const a of hands)
        sphere(ctx, Math.cos(a) * 30, Math.sin(a) * 30, 6, "#ffffff", "#9a90b0");
      ctx.save();
      ctx.rotate(spin);
      sphere(ctx, 0, 0, 22, "#ffffff", "#8a84a0", "#ffffff");
      ctx.strokeStyle = "rgba(120,110,150,0.6)";
      ctx.lineWidth = 1.5;
      circle(ctx, 0, 0, 15);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#7a2ab0";
      ctx.beginPath();
      ctx.moveTo(-21, -8);
      ctx.quadraticCurveTo(0, -14, 21, -8);
      ctx.lineTo(19, 2);
      ctx.quadraticCurveTo(0, -3, -19, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.ellipse(-8, -5, 4, 2.5, 0.2, 0, TAU);
      ctx.ellipse(8, -5, 4, 2.5, -0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#000";
      circle(ctx, -7, -5, 1.6);
      ctx.fill();
      circle(ctx, 7, -5, 1.6);
      ctx.fill();
      const wave = Math.sin(this.spinTime * 10) * 4;
      ctx.strokeStyle = "#7a2ab0";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(20, -6);
      ctx.quadraticCurveTo(30, -10 + wave, 36, -4 - wave);
      ctx.stroke();
    }
  };
  function tileOf(x, y) {
    return [Math.floor((x - TILE_ORIGIN) / TILE), Math.floor((y - TILE_ORIGIN) / TILE)];
  }
  var Puff = class extends Effect {
    constructor(x, y, reverse) {
      super(x, y, 0.5, Layer.BOSS);
      this.reverse = reverse;
    }
    render(ctx) {
      const k = this.reverse ? 1 - this.t : this.t;
      ctx.save();
      ctx.globalAlpha = this.reverse ? k : 1 - k;
      ctx.fillStyle = "rgba(230,220,255,0.9)";
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7;
        circle(ctx, this.x + Math.cos(a) * 30 * k, this.y + Math.sin(a) * 30 * k - 20, 10 + 10 * k);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  // src/bosses/index.js
  function createBoss(game) {
    if (game.mode === Mode.ADVENTURE)
      return game.param === 4 ? new Tourneboule(game) : new Snake(game, game.param);
    return new Octopus(game);
  }

  // src/game/game.js
  var Game = class {
    /**
     * @param mode    Mode
     * @param param   the adventure / course number
     * @param events  { onPause(tab), onEnd(result) }
     */
    constructor(mode, param, events) {
      this.mode = mode;
      this.param = param;
      this.rules = MODES[mode];
      this.events = events;
      this.dungeon = this.rules.dungeon(param);
      this.time = this.rules.startTime;
      this.inventory = new Inventory(this.rules.lives);
      this.ball = new Ball();
      this.boss = null;
      this.switchOn = false;
      this.laps = this.rules.laps || 0;
      this.lapValidated = false;
      this.level = 0;
      this.bossDone = false;
      this.invincible = false;
      this.state = "play";
      this.scroll = null;
      this.hud = new Hud(this);
      let x = this.dungeon.start.x;
      let y = this.dungeon.start.y;
      if (this.rules.randomStartRow)
        y = randInt(this.dungeon.height);
      this.room = new Room(this, x, y, -1);
      this.ball.placeAt(WIDTH / 2, HEIGHT / 2);
      this.ball.setSpawn();
      app.audio.startLayers(GAME_MUSIC.layers, GAME_MUSIC.volumes);
    }
    // ----- queries for the entities -----
    colliders() {
      const list = this.room.colliders();
      if (this.boss && this.boss.colliders)
        list.push(...this.boss.colliders());
      return list;
    }
    neighbour(rx, ry, dir2) {
      return this.dungeon.room(rx + DIR_DX[dir2], ry + DIR_DY[dir2]);
    }
    /** Is the ball completely inside the room (past the doors) ? */
    ballInside() {
      const m = BORDER + BALL_RADIUS;
      const b = this.ball;
      return b.x > m && b.y > m && b.x < WIDTH - m && b.y < HEIGHT - m;
    }
    // ----- actions for the entities -----
    /** Adds time : in chrono mode, it counts the other way. */
    addTime(seconds) {
      this.time += seconds;
      if (this.rules.maxTime)
        this.time = Math.min(this.time, this.rules.maxTime);
      this.time = Math.max(0, this.time);
      this.hud.timeChanged(seconds);
    }
    /** A ball was found : it is selected, and the music gets richer the first time. */
    collectBall(type) {
      const inv = this.inventory;
      inv.balls[type] = 1;
      this.ball.setType(type);
      if (!inv.found.has(type)) {
        inv.found.add(type);
        app.audio.setLayer(Math.min(inv.found.size, GAME_MUSIC.layers.length - 1));
      }
    }
    /** The ball has finished falling (hole, hatch) or dying. */
    ballFell(kind) {
      if (kind === "hatch") {
        this.nextClassicLevel();
        return;
      }
      const ball = this.ball;
      const inv = this.inventory;
      const free = this.rules.noLoss || this.rules.freeYellow && ball.type === BallType.YELLOW;
      if (!free)
        inv.balls[ball.type]--;
      const next = inv.next(ball.type, true);
      if (next < 0) {
        ball.hidden = true;
        this.end("balls");
        return;
      }
      if (next !== ball.type)
        ball.setType(next);
      ball.respawn();
    }
    /** Course : a one-way door was crossed. */
    oneWayCrossed() {
      this.lapValidated = true;
    }
    /**
     * Course : the ball crossed a checkpoint beam. It is a lap if a one-way
     * door was crossed since the last one. The other rooms are then reset
     * (doors closed, blocks and pastilles back).
     */
    checkpoint() {
      if (!this.lapValidated)
        return;
      this.lapValidated = false;
      this.laps--;
      this.hud.lapDone();
      if (this.laps === 0) {
        this.end("win");
        return;
      }
      for (const { x, y, room: room2 } of this.dungeon.allRooms()) {
        if (x === this.room.rx && y === this.room.ry)
          continue;
        room2.visited = false;
        for (const exit of room2.exits)
          if (exit.type === Exit.OPEN)
            exit.type = Exit.DOOR;
        for (const item of room2.items) {
          item.destroyed = false;
          item.taken = false;
        }
      }
    }
    /** Asks for the pause screen, on the map. */
    showMap() {
      this.events.onPause("map");
    }
    // ----- every step -----
    update(dt) {
      if (this.state === "scroll") {
        this.updateScroll(dt);
        return;
      }
      if (this.state === "over") {
        this.room.update(dt, this);
        return;
      }
      this.updateTime(dt);
      if (this.state !== "play")
        return;
      if (this.rules.ballSwitch && app.input.pressed("switchBall"))
        this.switchBall();
      this.room.update(dt, this);
      this.ball.update(dt, this);
      if (this.boss)
        this.boss.update(dt, this);
      this.hud.update(dt);
      if (this.state === "play" && !this.ball.falling) {
        this.checkBossRoom();
        this.checkExits();
      }
    }
    updateTime(dt) {
      if (this.rules.chrono) {
        this.time += dt;
        return;
      }
      this.time -= dt;
      if (this.time <= 0) {
        this.time = 0;
        if (!this.ball.falling)
          this.end("time");
      }
    }
    switchBall() {
      const next = this.inventory.next(this.ball.type);
      if (next < 0 || next === this.ball.type)
        return;
      this.ball.setType(next);
      app.audio.play("ballChange");
    }
    /** Once the ball is inside the boss room, its doors close and the boss comes. */
    checkBossRoom() {
      if (!this.room.isBossRoom || this.boss || this.bossDone || !this.ballInside())
        return;
      this.room.closeDoors();
      this.ball.spawnX = WIDTH / 2;
      this.ball.spawnY = HEIGHT / 2;
      if (this.rules.endsAtBoss) {
        this.end("win");
        return;
      }
      app.audio.playMusic("musicBoss", MUSIC_VOLUME);
      this.boss = createBoss(this);
    }
    /** Called by the boss when it is beaten. */
    bossBeaten() {
      this.bossDone = true;
      this.end("win");
    }
    /** The ball left the room : go to the next room, or stay inside. */
    checkExits() {
      const b = this.ball;
      let dir2 = -1;
      if (b.x < 0) dir2 = Dir.LEFT;
      else if (b.x > WIDTH) dir2 = Dir.RIGHT;
      else if (b.y < 0) dir2 = Dir.UP;
      else if (b.y > HEIGHT) dir2 = Dir.DOWN;
      if (dir2 < 0)
        return;
      const next = this.neighbour(this.room.rx, this.room.ry, dir2);
      if (!next) {
        b.x = Math.max(5, Math.min(WIDTH - 5, b.x));
        b.y = Math.max(5, Math.min(HEIGHT - 5, b.y));
        return;
      }
      this.goToRoom(this.room.rx + DIR_DX[dir2], this.room.ry + DIR_DY[dir2], dir2);
    }
    /**
     * Starts the scrolling to the room (rx, ry). `dir` is the direction of the
     * scrolling (the side of the current room the ball leaves by).
     */
    goToRoom(rx, ry, dir2, entryDoor = OPPOSITE[dir2]) {
      this.dungeon.ensure(rx + 2);
      const data = this.dungeon.room(rx, ry);
      if (entryDoor >= 0) {
        const exit = data.exits[entryDoor];
        const challenge = this.mode === Mode.CHALLENGE;
        if (exit.type === Exit.DOOR || exit.type === Exit.SPECIAL && challenge)
          exit.type = Exit.OPEN;
      }
      const to = new Room(this, rx, ry, entryDoor);
      this.scroll = { from: this.room, to, dir: dir2, t: 0 };
      this.state = "scroll";
    }
    updateScroll(dt) {
      const s = this.scroll;
      s.t += dt / ROOM_SCROLL_TIME;
      if (s.t < 1)
        return;
      const b = this.ball;
      b.x -= DIR_DX[s.dir] * WIDTH;
      b.y -= DIR_DY[s.dir] * HEIGHT;
      b.vx /= 3;
      b.vy /= 3;
      b.setSpawn();
      this.room = s.to;
      this.scroll = null;
      this.state = "play";
    }
    /**
     * Classique : the ball fell through the hatch. It lands in a random room
     * of the next level, where the hatch was, and wins a few seconds.
     */
    nextClassicLevel() {
      const b = this.ball;
      this.level++;
      this.addTime(this.rules.levelBonus);
      b.vx = 0;
      b.vy = 0;
      b.y += HEIGHT;
      this.goToRoom(this.room.rx + 1, randInt(this.dungeon.height), Dir.DOWN, -1);
    }
    /**
     * The game is over. cause : "win", "time" (no time left) or "balls" (no
     * ball left).
     */
    end(cause) {
      if (this.state === "over" || this.invincible && cause !== "win")
        return;
      this.state = "over";
      app.audio.stopLayers(1);
      if (cause !== "win")
        app.audio.play("gameOver");
      this.events.onEnd(this.result(cause));
    }
    /** Everything the end screen and the records need. */
    result(cause) {
      let rooms = 0;
      let visited = 0;
      for (const { room: room2 } of this.dungeon.allRooms()) {
        rooms++;
        if (room2.visited)
          visited++;
      }
      return {
        mode: this.mode,
        param: this.param,
        cause,
        time: this.time,
        level: this.level + 1,
        explored: rooms ? Math.floor(visited * 100 / rooms) : 0
      };
    }
    // ----- drawing -----
    render(ctx) {
      if (this.state === "scroll") {
        this.renderScroll(ctx);
      } else {
        const extras = [this.ball];
        if (this.boss)
          extras.push(this.boss);
        this.room.render(ctx, this, extras);
        this.room.renderBorder(ctx, this);
        if (this.boss && this.boss.renderTop)
          this.boss.renderTop(ctx, this);
      }
      this.hud.render(ctx);
    }
    /** The two rooms slide ; the ball goes with them. */
    renderScroll(ctx) {
      const s = this.scroll;
      const k = ease.inOutQuad(Math.min(1, s.t));
      const dx = DIR_DX[s.dir] * WIDTH;
      const dy = DIR_DY[s.dir] * HEIGHT;
      ctx.save();
      ctx.translate(-dx * k, -dy * k);
      s.from.render(ctx, this);
      s.from.renderBorder(ctx, this);
      ctx.translate(dx, dy);
      s.to.render(ctx, this);
      s.to.renderBorder(ctx, this);
      ctx.translate(-dx, -dy);
      this.ball.renderShadow(ctx);
      this.ball.render(ctx);
      ctx.restore();
    }
  };

  // src/scenes/map_view.js
  var MAP_W = 440;
  var MAP_H = 360;
  var GRID_X = 18;
  var GRID_Y = 40;
  var CELL_W = 48;
  var CELL_H = 36;
  var BALL_OF_OBJECT2 = [BallType.GREEN, BallType.BLUE, BallType.METAL, BallType.VIOLET];
  var BONUS_ICONS = {
    [DungeonBonus.MAP]: [Icon.MAP, 0.7],
    [DungeonBonus.KEY]: [Icon.KEY, 0.8],
    [DungeonBonus.SMALL_TIME]: [Icon.SMALL_TIME, 0.8],
    [DungeonBonus.BIG_TIME]: [Icon.BIG_TIME, 0.7]
  };
  function passage(room2, dir2) {
    if (!room2)
      return false;
    const t = room2.exits[dir2].type;
    return t !== Exit.WALL && t !== Exit.HIDDEN;
  }
  function drawMap(ctx, game, x, y, time2) {
    const d = game.dungeon;
    const inv = game.inventory;
    const cur = game.room;
    ctx.save();
    ctx.translate(x, y);
    image(ctx, "map", MAP_W, MAP_H, 0, 0);
    const cols = Math.min(8, d.width);
    const rows = Math.min(8, d.height);
    for (let rx = 0; rx < cols; rx++) {
      for (let ry = 0; ry < rows; ry++) {
        const room2 = d.room(rx, ry);
        const cx = GRID_X + CELL_W * rx + CELL_W / 2;
        const cy = GRID_Y + CELL_H * ry + CELL_H / 2;
        if (!room2) {
          if (inv.map) {
            const k = (rx * 7 + ry * 3) % 4;
            ctx.fillStyle = "rgba(160,100,0,0.25)";
            circle(ctx, cx - 8 + k * 4, cy - 4 + k % 2 * 6, 4 + k);
            ctx.fill();
          }
          continue;
        }
        const current = rx === cur.rx && ry === cur.ry;
        const known = current || room2.visited && inv.map;
        if (known) {
          ctx.fillStyle = current ? "#ff6a2a" : "#e0a020";
          roundRect(ctx, cx - 16, cy - 11, 32, 22, 6);
          ctx.fill();
          ctx.strokeStyle = current ? "#a02a00" : "#a06a00";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (inv.map) {
          ctx.strokeStyle = "rgba(160,100,0,0.6)";
          ctx.lineWidth = 1.5;
          roundRect(ctx, cx - 16, cy - 11, 32, 22, 6);
          ctx.stroke();
        }
        if (inv.map) {
          ctx.strokeStyle = "#a06a00";
          ctx.lineWidth = 5;
          ctx.lineCap = "round";
          if (rx > 0 && passage(room2, 0) && passage(d.room(rx - 1, ry), 1)) {
            ctx.beginPath();
            ctx.moveTo(cx - 17, cy);
            ctx.lineTo(cx - 31, cy);
            ctx.stroke();
          }
          if (ry > 0 && passage(room2, 2) && passage(d.room(rx, ry - 1), 3)) {
            ctx.beginPath();
            ctx.moveTo(cx, cy - 12);
            ctx.lineTo(cx, cy - 24);
            ctx.stroke();
          }
        }
        if (inv.radar)
          drawRadarIcon(ctx, d, room2, rx, ry, cx, cy);
        if (current) {
          ctx.strokeStyle = "rgba(255,255,255," + (0.5 + 0.5 * Math.sin(time2 * 6)) + ")";
          ctx.lineWidth = 2;
          roundRect(ctx, cx - 18, cy - 13, 36, 26, 7);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  function drawRadarIcon(ctx, d, room2, rx, ry, cx, cy) {
    switch (room2.type) {
      case RoomType.BOSS:
        text(ctx, "\u2620", cx, cy, { size: 18, color: "#fff", outline: "#5a0a0a" });
        return;
      case RoomType.BALL:
        ballSphere(ctx, cx, cy, 7, BALL_OF_OBJECT2[room2.content]);
        return;
      case RoomType.BONUS:
        if (room2.content === DungeonBonus.ORANGE || room2.content === DungeonBonus.RED) {
          ballSphere(ctx, cx, cy, 7, room2.content === DungeonBonus.ORANGE ? BallType.ORANGE : BallType.RED);
        } else if (!room2.taken && BONUS_ICONS[room2.content]) {
          const [icon, scale] = BONUS_ICONS[room2.content];
          ctx.save();
          ctx.translate(cx, cy);
          drawItemIcon(ctx, icon, scale);
          ctx.restore();
        }
        return;
      default:
        if (rx === d.start.x && ry === d.start.y)
          text(ctx, "D", cx, cy, { size: 14, color: "#fff", outline: "#205a10" });
    }
  }

  // src/scenes/play.js
  var MEDALS = [["#ffd82a", "#a07000"], ["#e4e8ee", "#7a8494"], ["#e8a070", "#8a4a1a"]];
  var PlayScene = class {
    constructor(mode, param = 0) {
      this.mode = mode;
      this.param = param;
      this.game = null;
      this.paused = null;
      this.ending = null;
      this.time = 0;
    }
    enter() {
      this.game = new Game(this.mode, this.param, {
        onPause: () => this.pause(),
        onEnd: (result) => this.end(result)
      });
    }
    // ----- pause -----
    pause() {
      if (this.paused || this.ending)
        return;
      const withMap = this.game.inventory.map || this.game.inventory.radar;
      const x = withMap ? 527 : WIDTH / 2;
      const y = withMap ? 190 : 250;
      const buttons = [
        {
          x,
          y,
          w: 150,
          h: 40,
          action: () => this.resume(),
          draw: (ctx, f) => button(ctx, "Continuer", x, y, 150, 40, f ? "focus" : "idle")
        },
        {
          x,
          y: y + 56,
          w: 150,
          h: 40,
          action: () => this.quit(),
          draw: (ctx, f) => button(ctx, "Abandonner", x, y + 56, 150, 40, f ? "focus" : "idle")
        }
      ];
      this.paused = { group: new ButtonGroup(buttons, () => this.resume()), withMap, time: 0 };
      if (this.game.boss && this.game.boss.onPause)
        this.game.boss.onPause(true);
    }
    resume() {
      this.paused = null;
      if (this.game.boss && this.game.boss.onPause)
        this.game.boss.onPause(false);
    }
    quit() {
      app.audio.stopLayers(0.5);
      app.audio.playMusic("musicMenu", MUSIC_VOLUME);
      app.scenes.goto(new MenuScene());
    }
    // ----- end of the game -----
    /** Saves the result, and prepares the lines of the end panel. */
    end(result) {
      const save = app.save;
      const win = result.cause === "win";
      const lines = [];
      let heading = win ? "Victoire !" : result.cause === "time" ? "Temps \xE9coul\xE9 !" : "Plus de billes !";
      let table = null;
      switch (result.mode) {
        case Mode.CHALLENGE:
        case Mode.ADVENTURE: {
          const score = result.explored + (win ? Math.floor(result.time) : 0);
          lines.push("Donjon explor\xE9 : " + result.explored + " %");
          if (win)
            lines.push("Temps restant : " + formatTime(result.time));
          lines.push("Score : " + score);
          const previous = result.mode === Mode.CHALLENGE ? save.best("challengeBest", score) : win ? save.winAdventure(result.param, score) : save.adventureScore(result.param, score);
          lines.push(score > previous ? "Nouveau record !" : "Record : " + previous);
          if (win && result.mode === Mode.ADVENTURE && result.param < 4 && save.adventureUnlocked(4))
            lines.push("Le donjon final est ouvert !");
          break;
        }
        case Mode.COURSE: {
          if (win) {
            heading = "Arriv\xE9e !";
            const r = save.courseTime(result.param, result.time);
            table = r.table;
            lines.push("Temps : " + formatTime(result.time, true));
            lines.push(r.rank < 0 ? "Pas de record..." : "Record battu !");
            if (r.unlockedNext)
              lines.push("Circuit " + (result.param + 2) + " ouvert !");
          }
          break;
        }
        case Mode.CLASSIC: {
          const previous = save.best("classicBest", result.level);
          lines.push("Niveau atteint : " + result.level);
          lines.push(result.level > previous ? "Nouveau record !" : "Record : niveau " + Math.max(previous, result.level));
          break;
        }
        case Mode.TUTORIAL:
          heading = win ? "Bravo !" : heading;
          lines.push(win ? "Tu connais les bases : \xE0 toi de jouer !" : "Essaie encore !");
          break;
      }
      this.ending = { heading, lines, table, pop: new Pop(), scale: 0, time: 0 };
      if (win)
        app.audio.playMusic("musicMenu", MUSIC_VOLUME);
    }
    // ----- every step -----
    update(dt) {
      this.time += dt;
      const input = app.input;
      if (this.ending) {
        const e = this.ending;
        e.time += dt;
        e.scale = e.pop.update(dt);
        this.game.update(dt);
        if (e.time > 0.8 && (input.pressed("confirm") || input.pressed("back") || input.pointer)) {
          this.ending.time = -1e3;
          this.quit();
        }
        return;
      }
      if (this.paused) {
        this.paused.time += dt;
        if (input.pressed("pause"))
          this.resume();
        else
          this.paused.group.update();
        return;
      }
      if (input.pressed("pause") && this.game.state === "play") {
        this.pause();
        return;
      }
      this.game.update(dt);
    }
    // ----- drawing -----
    render(ctx) {
      if (!this.game)
        return;
      this.game.render(ctx);
      this.renderStick(ctx);
      if (this.paused)
        this.renderPause(ctx);
      if (this.ending)
        this.renderEnd(ctx);
    }
    /** The virtual joystick, while a finger drives the ball. */
    renderStick(ctx) {
      const s = app.input.stick;
      if (!s || this.paused || this.ending)
        return;
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      circle(ctx, s.x0, s.y0, 40);
      ctx.fill();
      const dx = s.x - s.x0;
      const dy = s.y - s.y0;
      const k = Math.min(1, 40 / (Math.hypot(dx, dy) || 1));
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      circle(ctx, s.x0 + dx * k, s.y0 + dy * k, 16);
      ctx.fill();
    }
    renderPause(ctx) {
      const p = this.paused;
      ctx.fillStyle = "rgba(30,0,40,0.5)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (p.withMap) {
        drawMap(ctx, this.game, 10, 40, p.time);
        text(ctx, "PAUSE", 527, 120, { size: 32, color: "#fff", outline: "#4a1470" });
      } else {
        text(ctx, "PAUSE", WIDTH / 2, 170, { size: 56, color: "#fff", outline: "#4a1470" });
      }
      p.group.render(ctx);
    }
    renderEnd(ctx) {
      const e = this.ending;
      ctx.fillStyle = "rgba(30,0,40," + Math.min(0.45, e.time) + ")";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      const h = e.table ? 300 : 110 + e.lines.length * 26;
      panel(ctx, WIDTH / 2, HEIGHT / 2, 380, h, e.scale);
      if (e.scale < 0.5)
        return;
      ctx.save();
      ctx.translate(WIDTH / 2, HEIGHT / 2);
      ctx.scale(e.scale, e.scale);
      let y = -h / 2 + 34;
      bubbleTitle(ctx, e.heading, 0, y, 34);
      y += 42;
      for (const line of e.lines) {
        text(ctx, line, 0, y, { size: 17, color: "#6a3a00", weight: "700" });
        y += 26;
      }
      if (e.table) {
        y += 6;
        e.table.forEach((row, i) => {
          const [c1, c2] = MEDALS[i];
          ctx.fillStyle = row.mine ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.25)";
          ctx.fillRect(-120, y - 12, 240, 24);
          ctx.fillStyle = c1;
          circle(ctx, -100, y, 9);
          ctx.fill();
          ctx.strokeStyle = c2;
          ctx.lineWidth = 2;
          ctx.stroke();
          text(ctx, String(i + 1), -100, y + 1, { size: 12, color: c2 });
          text(ctx, formatTime(row.time, true), 10, y, { size: 16, color: row.mine ? "#c03000" : "#6a3a00" });
          text(ctx, row.mine ? "toi" : row.cpu ? "CPU" : "", 90, y, { size: 13, color: "#8a5a10", weight: "700" });
          y += 28;
        });
      }
      if (e.time > 0.8) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(e.time * 4);
        text(ctx, "Clique ou appuie sur une touche", 0, h / 2 - 22, { size: 13, color: "#8a5a10", weight: "700" });
      }
      ctx.restore();
    }
  };

  // src/scenes/menu.js
  var MODE_INFO = {
    challenge: "Un donjon au hasard : trouve les 4 billes\net bats le poulpe en moins de 15 minutes.",
    course: "Trois tours de circuit, le plus vite possible.\nBats un record pour ouvrir le circuit suivant.",
    aventure: "Cinq donjons faits main,\ngard\xE9s par les serpents des \xE9l\xE9ments.",
    classique: "Descends le plus bas possible : prends les pastilles\nrouges et plonge dans la trappe avant la fin du temps.",
    options: "La musique et les sons.",
    aide: "Le tutoriel, et le r\xF4le de chaque bille."
  };
  var BALL_HELP = [
    "La bille de d\xE9part.",
    "Casse les blocs verts.",
    "Attire les pastilles rouges.",
    "Tr\xE8s rapide... et difficile \xE0 tenir !",
    "Saute par-dessus les trous.",
    "Lourde : ne craint ni les bumpers mortels,\nni les aimants.",
    "Voit les bumpers invisibles."
  ];
  var BALL_IMAGES = ["help_jaune", "help_verte", "help_rouge", "help_orange", "help_bleue", "help_metal", "help_violette"];
  var ADVENTURES = [
    { name: "Eau", icon: "donjon_eau" },
    { name: "Feu", icon: "donjon_feu" },
    { name: "Vent", icon: "donjon_vent" },
    { name: "Terre", icon: "donjon_terre" },
    { name: "Final", icon: null }
  ];
  var MenuScene = class {
    constructor(page = "main") {
      this.time = 0;
      this.open(page);
    }
    open(page) {
      const mainFocus = this.page === "main" ? this.group.focus : this.mainFocus || 0;
      this.mainFocus = mainFocus;
      this.page = page;
      this.group = this[page + "Page"]();
      if (page === "main")
        this.group.focus = mainFocus;
    }
    start(mode, param = 0) {
      if (app.scenes.busy)
        return;
      app.scenes.goto(new PlayScene(mode, param));
    }
    // ----- pages -----
    mainPage() {
      const modes = [
        ["challenge", () => this.start(Mode.CHALLENGE)],
        ["course", () => this.open("course")],
        ["aventure", () => this.open("adventure")],
        ["classique", () => this.start(Mode.CLASSIC)],
        ["options", () => this.open("options")],
        ["aide", () => this.open("help")]
      ];
      const buttons = modes.map(([name, action], i) => ({
        name,
        x: 155 + i % 3 * 150,
        y: 155 + Math.floor(i / 3) * 128,
        w: 112,
        h: 112,
        action,
        draw: (ctx, focused) => {
          const b = buttons[i];
          const bounce = focused ? 1.12 + Math.sin(this.time * 6) * 0.03 : 1;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.scale(bounce, bounce);
          if (focused) {
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            circle(ctx, 0, 0, 62);
            ctx.fill();
          }
          image(ctx, "menu_" + name, 112, 112);
          ctx.restore();
        }
      }));
      return new ButtonGroup(buttons);
    }
    adventurePage() {
      const save = app.save;
      const buttons = ADVENTURES.map((a, i) => {
        const unlocked = save.adventureUnlocked(i);
        return {
          x: 95 + i * 105,
          y: 185,
          w: 96,
          h: 120,
          enabled: unlocked,
          action: () => this.start(Mode.ADVENTURE, i),
          draw: (ctx, focused) => this.drawAdventure(ctx, a, i, unlocked, focused)
        };
      });
      buttons.push(this.backButton());
      return new ButtonGroup(buttons, () => this.open("main"));
    }
    coursePage() {
      const save = app.save;
      const buttons = [];
      for (let i = 0; i < 7; i++) {
        const unlocked = save.courseUnlocked(i);
        const best = save.data.courses.records[i][0];
        buttons.push({
          x: 110 + i % 4 * 130,
          y: 150 + Math.floor(i / 4) * 110,
          w: 112,
          h: 90,
          enabled: unlocked,
          action: () => this.start(Mode.COURSE, i),
          draw: (ctx, focused) => {
            const b = buttons[i];
            ctx.save();
            ctx.translate(b.x, b.y);
            if (focused)
              ctx.scale(1.07, 1.07);
            ctx.fillStyle = unlocked ? focused ? "#c8ff9a" : "#a6ec6e" : "rgba(60,20,90,0.6)";
            roundRect(ctx, -56, -45, 112, 90, 18);
            ctx.fill();
            ctx.strokeStyle = focused ? "#fff" : "rgba(255,255,255,0.5)";
            ctx.lineWidth = 2;
            ctx.stroke();
            text(ctx, "Circuit " + (i + 1), 0, -20, { size: 18, color: "#fff", outline: "rgba(20,60,0,0.5)" });
            text(
              ctx,
              unlocked ? "Record " + formatTime(best.time, true) : "Ferm\xE9",
              0,
              14,
              { size: 13, color: unlocked ? "#2a5a10" : "#d0c0e0", weight: "700" }
            );
            ctx.restore();
          }
        });
      }
      buttons.push(this.backButton());
      return new ButtonGroup(buttons, () => this.open("main"));
    }
    optionsPage() {
      const s = app.save.settings;
      const toggle = (key, label, y) => ({
        x: WIDTH / 2,
        y,
        w: 260,
        h: 44,
        action: () => {
          s[key] = !s[key];
          app.save.save();
          applySettings();
        },
        draw: (ctx, focused) => button(ctx, label + (s[key] ? " : oui" : " : non"), WIDTH / 2, y, 260, 44, focused ? "focus" : "idle")
      });
      const buttons = [toggle("music", "Musique", 170), toggle("sounds", "Sons", 230), this.backButton()];
      return new ButtonGroup(buttons, () => this.open("main"));
    }
    helpPage() {
      const buttons = BALLS.map((b, i) => ({
        x: 70 + i * 78,
        y: 150,
        w: 70,
        h: 70,
        action: () => {
        },
        draw: (ctx, focused) => {
          ctx.save();
          ctx.translate(70 + i * 78, 150);
          ctx.scale(focused ? 1.1 : 0.9, focused ? 1.1 : 0.9);
          image(ctx, BALL_IMAGES[i], 70, 70);
          ctx.restore();
        }
      }));
      buttons.push({
        x: WIDTH / 2 - 100,
        y: 360,
        w: 180,
        h: 40,
        action: () => this.start(Mode.TUTORIAL),
        draw: (ctx, focused) => button(ctx, "Tutoriel", WIDTH / 2 - 100, 360, 180, 40, focused ? "focus" : "idle")
      });
      const back = this.backButton();
      back.x = WIDTH / 2 + 100;
      buttons.push(back);
      return new ButtonGroup(buttons, () => this.open("main"));
    }
    backButton() {
      const b = {
        x: WIDTH / 2,
        y: 360,
        w: 180,
        h: 40,
        action: () => this.open("main"),
        draw: (ctx, focused) => button(ctx, "Retour", b.x, b.y, 180, 40, focused ? "focus" : "idle")
      };
      return b;
    }
    // ----- every step -----
    update(dt) {
      this.time += dt;
      if (!app.scenes.busy)
        this.group.update();
    }
    render(ctx) {
      sunburst(ctx, this.time * 0.1);
      const heading = { main: "MotionBall 2", adventure: "Aventure", course: "Course", options: "Options", help: "Aide" }[this.page];
      title(ctx, heading, WIDTH / 2, 48, this.page === "main" ? 44 : 40, this.time);
      this.group.render(ctx);
      if (this.page === "main")
        this.renderInfo(ctx);
      if (this.page === "help")
        this.renderHelp(ctx);
    }
    renderInfo(ctx) {
      const b = this.group.focused;
      panel(ctx, WIDTH / 2, 372, 470, 58);
      text(ctx, MODE_INFO[b.name], WIDTH / 2, 372, { size: 14, color: "#6a3a00", weight: "700" });
      const save = app.save.data;
      if (b.name === "challenge" && save.challengeBest > 0)
        badge(ctx, "Record : " + save.challengeBest);
      if (b.name === "classique" && save.classicBest > 0)
        badge(ctx, "Record : niveau " + save.classicBest);
    }
    renderHelp(ctx) {
      const i = this.group.focus;
      if (i >= BALLS.length)
        return;
      panel(ctx, WIDTH / 2, 262, 440, 110);
      ctx.save();
      ctx.translate(WIDTH / 2 - 170, 262);
      ctx.scale(2.4, 2.4);
      drawBall(ctx, i, 9, null);
      ctx.restore();
      text(ctx, "Bille " + BALLS[i].name.toLowerCase(), WIDTH / 2 + 30, 235, { size: 22, color: "#fff", outline: "#c86a00" });
      text(ctx, BALL_HELP[i], WIDTH / 2 + 30, 280, { size: 15, color: "#6a3a00", weight: "700" });
    }
    drawAdventure(ctx, a, i, unlocked, focused) {
      const b = this.group ? this.group.buttons[i] : { x: 95 + i * 105, y: 185 };
      const won = app.save.data.adventures.won[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      if (focused)
        ctx.scale(1.08, 1.08);
      ctx.fillStyle = !unlocked ? "rgba(60,20,90,0.6)" : focused ? "#fff2a8" : "#ffe04a";
      roundRect(ctx, -48, -60, 96, 120, 20);
      ctx.fill();
      ctx.strokeStyle = focused ? "#fff" : "#e08a00";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (a.icon) {
        ctx.globalAlpha = unlocked ? 1 : 0.3;
        image(ctx, a.icon, 64, 56, -32, -48);
        ctx.globalAlpha = 1;
      } else {
        text(ctx, unlocked ? "!" : "?", 0, -20, { size: 48, color: unlocked ? "#e03a00" : "#d0c0e0", outline: "#fff" });
      }
      text(ctx, a.name, 0, 28, { size: 18, color: unlocked ? "#6a3a00" : "#d0c0e0" });
      if (won)
        text(ctx, "Gagn\xE9 " + app.save.data.adventures.best[i] + " %", 0, 48, { size: 12, color: "#2a7a10", weight: "700" });
      ctx.restore();
    }
  };
  function badge(ctx, str) {
    ctx.fillStyle = "rgba(40,0,70,0.6)";
    roundRect(ctx, WIDTH / 2 - 90, 322, 180, 22, 11);
    ctx.fill();
    text(ctx, str, WIDTH / 2, 333, { size: 13, color: "#ffe060", weight: "700" });
  }
  function applySettings() {
    const s = app.save.settings;
    app.audio.setMusicEnabled(s.music);
    app.audio.setSoundsEnabled(s.sounds);
  }

  // src/scenes/title.js
  var TitleScene = class {
    constructor() {
      this.time = 0;
      this.leaving = false;
    }
    update(dt) {
      this.time += dt;
      const input = app.input;
      if (this.leaving)
        return;
      if (input.pressed("confirm") || input.pressed("pause") || input.pointer) {
        this.leaving = true;
        app.audio.unlock();
        app.audio.play("menuEnter");
        app.audio.playMusic("musicMenu", MUSIC_VOLUME);
        app.scenes.goto(new MenuScene());
      }
    }
    render(ctx) {
      const t = this.time;
      sunburst(ctx, t * 0.15);
      for (let i = 0; i < 7; i++) {
        const a = t * 0.6 + i * Math.PI * 2 / 7;
        ctx.save();
        ctx.translate(WIDTH / 2 + Math.cos(a) * 230, 150 + Math.sin(a) * 90);
        const s = 1.2 + Math.sin(a) * 0.4;
        ctx.scale(s, s);
        drawBall(ctx, i, 9, null);
        ctx.restore();
      }
      title(ctx, "MotionBall", WIDTH / 2, 140, 64, t);
      title(ctx, "2", WIDTH / 2, 205, 70, t + 1);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
      text(ctx, "Appuie sur une touche", WIDTH / 2, 300, { size: 24, color: "#fff", outline: "#4a1470" });
      ctx.globalAlpha = 1;
      text(ctx, "Motion Twin / Frutiparc 2005 \u2014 version HTML5", WIDTH / 2, HEIGHT - 16, { size: 12, color: "rgba(255,255,255,0.7)", weight: "600" });
    }
  };

  // src/main.js
  var IMAGES = [
    "bg01.jpg",
    "bg02.jpg",
    "bg03.jpg",
    "bg04.jpg",
    "bgHole.jpg",
    "normal_base.png",
    "normal_top.png",
    "time_base.png",
    "death_base.png",
    "magnet_base.png",
    "magnet_top.png",
    "magnet_plus.png",
    "magnet_minus.png",
    "inter_low_blue.png",
    "inter_low_pink.png",
    "inter_high_blue.png",
    "inter_high_pink.png",
    "snake_head.png",
    "snake_body.png",
    "snake_tail.png",
    "snake_head_dark.png",
    "snake_body_dark.png",
    "snake_tail_dark.png",
    "logo_eau.png",
    "logo_feu.png",
    "logo_terre.png",
    "logo_vent.png",
    "roue.png",
    "map.png",
    "menu_challenge.png",
    "menu_course.png",
    "menu_aventure.png",
    "menu_classique.png",
    "menu_options.png",
    "menu_aide.png",
    "donjon_eau.png",
    "donjon_feu.png",
    "donjon_terre.png",
    "donjon_vent.png",
    "help_jaune.png",
    "help_verte.png",
    "help_rouge.png",
    "help_orange.png",
    "help_bleue.png",
    "help_metal.png",
    "help_violette.png"
  ];
  function start() {
    const canvas = document.getElementById("game");
    app.screen = new Screen(canvas);
    app.input = new Input(app.screen);
    app.audio = new AudioEngine(SOUND_FILES);
    app.images = new ImageStore("assets/img/");
    app.save = new Progress();
    app.scenes = new SceneManager();
    const bindButton = (id, action) => {
      const el = document.getElementById(id);
      if (el)
        el.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          app.audio.unlock();
          app.input.trigger(action);
        });
    };
    bindButton("tbBall", "switchBall");
    bindButton("tbPause", "pause");
    const unlock = () => app.audio.unlock();
    window.addEventListener("keydown", unlock);
    window.addEventListener("pointerdown", unlock);
    let images = 0;
    let sounds = 0;
    const drawLoading = () => {
      const ctx = app.screen.begin();
      ctx.fillStyle = "#4a1a70";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      text(ctx, "MotionBall 2", WIDTH / 2, 170, { size: 40, color: "#fff", outline: "#2a0a40" });
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(155, 230, 300, 14);
      ctx.fillStyle = "#9ae860";
      ctx.fillRect(155, 230, 300 * (images + sounds) / 2, 14);
    };
    drawLoading();
    const fonts = document.fonts ? document.fonts.ready.catch(() => {
    }) : Promise.resolve();
    Promise.all([
      app.images.load(IMAGES, (p) => {
        images = p;
        drawLoading();
      }),
      app.audio.load((p) => {
        sounds = p;
        drawLoading();
      }),
      fonts
    ]).then(() => {
      applySettings();
      app.scenes.goto(new TitleScene(), true);
      new Loop(step, render).start();
    });
  }
  function step(dt) {
    app.time += dt;
    app.audio.update(dt);
    app.scenes.update(dt);
    app.input.endStep();
  }
  function render() {
    app.input.poll();
    app.scenes.render(app.screen.begin());
  }
  start();
  window.motionball = app;
  app.play = (mode, param = 0) => app.scenes.goto(new PlayScene(mode, param), true);
})();
