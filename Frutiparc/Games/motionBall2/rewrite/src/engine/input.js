/**
 * Input : keyboard, gamepad, touch and mouse, mapped to game actions.
 *
 * The game never looks at keys directly. It asks for :
 *   - `axis()`       the wanted direction of the ball, a vector of length <= 1
 *                    (arrows / WASD / ZQSD, the left stick or d-pad of a
 *                    gamepad, or a virtual joystick dragged on the screen) ;
 *   - `pressed(a)`   whether an action was triggered since the last
 *                    simulation step (edge triggered : holding a key down
 *                    triggers it once) ;
 *   - `pointer`      the last click / tap, in game coordinates, for the menus.
 *
 * Actions : "up", "down", "left", "right" (menus), "confirm", "back",
 * "switchBall", "pause".
 *
 * TRICKY : events arrive between frames, while the simulation runs several
 * fixed steps per frame. Triggered actions are queued, and `endStep()` (called
 * by the main loop after every step) clears them, so that each press is seen
 * by exactly one step.
 */

const KEY_ACTIONS = {
	ArrowUp: ["up"], KeyW: ["up"], KeyZ: ["up"],
	ArrowDown: ["down"], KeyS: ["down"],
	ArrowLeft: ["left"], KeyA: ["left"], KeyQ: ["left"],
	ArrowRight: ["right"], KeyD: ["right"],
	Enter: ["confirm"], NumpadEnter: ["confirm"],
	Space: ["confirm", "switchBall"],
	Escape: ["pause", "back"], KeyP: ["pause"], Backspace: ["back"]
};

// standard gamepad mapping
const PAD_BUTTONS = {
	0: ["confirm", "switchBall"],   // A / cross
	1: ["back"],                    // B / circle
	2: ["switchBall"],              // X / square
	9: ["pause"],                   // start
	12: ["up"], 13: ["down"], 14: ["left"], 15: ["right"]
};

const STICK_DEAD_ZONE = 0.2;
const TOUCH_STICK_RADIUS = 40;   // game pixels of drag for full speed
const TAP_MAX_MOVE = 12;
const TAP_MAX_TIME = 350;

export class Input {

	/** @param {import("./screen.js").Screen} screen */
	constructor(screen) {
		this.screen = screen;
		this.down = new Set();         // actions held (keyboard)
		this.queue = new Set();        // actions triggered, not yet seen by a step
		this.padPrevious = new Set();
		this.pointer = null;           // { x, y } of the last tap / click, until endStep
		this.hover = null;             // mouse position, for the menus
		this.mouseHeld = false;        // the mouse button is down (to drag the sliders)
		this.touchStick = null;        // { id, x0, y0, x, y, t0 }
		this.listeners = [];

		this.bindKeyboard();
		this.bindPointer();
	}

	// ----- queries -----

	/** Where the mouse (button held) or a finger drags, in game coordinates, or null. */
	drag() {
		if (this.mouseHeld && this.hover)
			return this.hover;
		const t = this.touchStick;
		return t ? { x: t.x, y: t.y } : null;
	}

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

		// keyboard (and d-pad)
		if (this.held("left")) x -= 1;
		if (this.held("right")) x += 1;
		if (this.held("up")) y -= 1;
		if (this.held("down")) y += 1;

		// gamepad stick
		const pad = this.gamepad();
		if (pad && pad.axes.length >= 2) {
			const sx = pad.axes[0];
			const sy = pad.axes[1];
			if (Math.hypot(sx, sy) > STICK_DEAD_ZONE) {
				x += sx;
				y += sy;
			}
		}

		// virtual joystick
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
		const now = new Set();
		if (pad) {
			for (const [index, actions] of Object.entries(PAD_BUTTONS)) {
				const b = pad.buttons[index];
				if (b && b.pressed)
					actions.forEach(a => now.add(a));
			}
			// the stick also moves in the menus
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
		this.on(window, "keydown", e => {
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
		this.on(window, "keyup", e => {
			const actions = KEY_ACTIONS[e.code];
			if (actions)
				actions.forEach(a => this.down.delete(a));
		});
		// keys released while the window had no focus would stay down
		this.on(window, "blur", () => this.down.clear());
	}

	bindPointer() {
		const canvas = this.screen.canvas;

		this.on(canvas, "pointerdown", e => {
			const p = this.screen.toGame(e.clientX, e.clientY);
			if (e.pointerType === "mouse") {
				this.pointer = p;
				this.hover = p;
				this.mouseHeld = true;
				return;
			}
			if (!this.touchStick) {
				canvas.setPointerCapture(e.pointerId);
				this.touchStick = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t0: performance.now() };
			}
		});

		this.on(canvas, "pointermove", e => {
			const p = this.screen.toGame(e.clientX, e.clientY);
			if (e.pointerType === "mouse")
				this.hover = p;
			const t = this.touchStick;
			if (t && t.id === e.pointerId) {
				t.x = p.x;
				t.y = p.y;
			}
		});

		const release = e => {
			if (e.pointerType === "mouse")
				this.mouseHeld = false;
			const t = this.touchStick;
			if (!t || t.id !== e.pointerId)
				return;
			// a short touch without moving is a tap
			const moved = Math.hypot(t.x - t.x0, t.y - t.y0);
			if (moved < TAP_MAX_MOVE && performance.now() - t.t0 < TAP_MAX_TIME)
				this.pointer = { x: t.x0, y: t.y0 };
			this.touchStick = null;
		};
		this.on(canvas, "pointerup", release);
		// (the mouse button may be released outside of the canvas)
		if (typeof window !== "undefined" && window.addEventListener)
			this.on(window, "pointerup", e => {
				if (e.pointerType === "mouse")
					this.mouseHeld = false;
			});
		this.on(canvas, "pointercancel", release);
		this.on(canvas, "contextmenu", e => e.preventDefault());
	}

	on(target, type, fn) {
		target.addEventListener(type, fn, { passive: false });
		this.listeners.push(() => target.removeEventListener(type, fn));
	}

	destroy() {
		this.listeners.forEach(off => off());
	}
}
