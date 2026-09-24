/*
 * Keyboard state, polled by the game like the AS2 Key.isDown().
 */
"use strict";

MB2.Key = {

	LEFT: 37,
	UP: 38,
	RIGHT: 39,
	DOWN: 40,
	SPACE: 32,
	ESCAPE: 27,
	ENTER: 13,
	P: 80,

	/** keyCode -> pressed. Also written by the touch buttons (app/input.js). */
	down: {},

	isDown(code) {
		return !!this.down[code];
	},

	/**
	 * Translates a key event into the game key code :
	 * - WASD (by physical position, so also ZQSD on AZERTY keyboards) = arrows
	 * - P = Escape (pause)
	 */
	codeOf(e) {
		const PHYSICAL = { KeyW: this.UP, KeyS: this.DOWN, KeyA: this.LEFT, KeyD: this.RIGHT };
		let code = e.keyCode;
		if (PHYSICAL[e.code] && !e.ctrlKey && !e.metaKey)
			code = PHYSICAL[e.code];
		if (code === this.P)
			code = this.ESCAPE;
		return code;
	},

	init(target) {
		const GAME_KEYS = [this.SPACE, this.LEFT, this.UP, this.RIGHT, this.DOWN, this.ESCAPE];

		const set = (e, pressed) => {
			const code = this.codeOf(e);
			// don't scroll the page with the arrows / space
			if (GAME_KEYS.indexOf(code) >= 0)
				e.preventDefault();
			this.down[code] = pressed;
		};

		target.addEventListener("keydown", e => set(e, true));
		target.addEventListener("keyup", e => set(e, false));
		// keys released while the window is not focused would stay "down"
		window.addEventListener("blur", () => { this.down = {}; });
	}
};
