/*
 * Mouse, keyboard and touch input of the screens.
 *
 * The game itself polls the keyboard (MB2.Key.isDown, core/keyboard.js) and
 * MB2.Touch. The screens receive events : onMouseMove(x, y), onMouseDown(x, y)
 * and onKey(code), in game coordinates.
 *
 * Touch : on the game, dragging a finger rolls the ball like a joystick
 * (MB2.Touch.dx / dy, -1..1) ; on the other screens a tap is a click. The
 * buttons below the canvas stand for Space and Escape.
 */
"use strict";

(function () {

	const Key = MB2.Key;
	const Const = MB2.Const;

	/** Distance of the finger (in game pixels) for a full-speed push. */
	const JOYSTICK_RANGE = 35;

	MB2.Touch = { dx: 0, dy: 0 };

	/** The screen receiving the events (none during the transitions). */
	function currentScreen() {
		const mode = MB2.Manager.mode;
		if (!mode || mode instanceof MB2.Transition)
			return null;
		if (mode instanceof MB2.Game && mode.pause)
			return mode.pause;
		return mode;
	}

	MB2.Input = {

		init(canvas) {
			const pos = e => {
				const r = canvas.getBoundingClientRect();
				return {
					x: (e.clientX - r.left) * Const.LVL_WIDTH / r.width,
					y: (e.clientY - r.top) * Const.LVL_HEIGHT / r.height
				};
			};
			// browsers only allow sounds after a user action
			const resumeAudio = () => {
				if (MB2.Sound.smanager)
					MB2.Sound.smanager.resume();
			};

			// ----- mouse -----

			canvas.addEventListener("mousemove", e => {
				const p = pos(e);
				MB2.Std.xmouse = p.x;
				MB2.Std.ymouse = p.y;
				const screen = currentScreen();
				if (screen && screen.onMouseMove)
					screen.onMouseMove(p.x, p.y);
			});

			canvas.addEventListener("mousedown", e => {
				resumeAudio();
				const p = pos(e);
				const screen = currentScreen();
				if (screen && screen.onMouseDown)
					screen.onMouseDown(p.x, p.y);
			});

			// ----- keyboard (the game polls MB2.Key ; screens get onKey) -----

			Key.init(window);
			window.addEventListener("keydown", e => {
				resumeAudio();
				if (e.repeat)
					return;
				const screen = currentScreen();
				if (screen && screen.onKey)
					screen.onKey(Key.codeOf(e));
			});

			// ----- touch -----

			let touchId = null;
			let origin = null;

			canvas.addEventListener("touchstart", e => {
				resumeAudio();
				e.preventDefault();
				const t = e.changedTouches[0];
				const p = pos(t);
				const screen = currentScreen();

				if (MB2.Manager.mode instanceof MB2.Game && screen === MB2.Manager.mode) {
					if (touchId === null) {
						touchId = t.identifier;
						origin = p;
					}
					return;
				}
				if (screen && screen.onMouseMove)
					screen.onMouseMove(p.x, p.y);
				if (screen && screen.onMouseDown)
					screen.onMouseDown(p.x, p.y);
			}, { passive: false });

			canvas.addEventListener("touchmove", e => {
				e.preventDefault();
				for (const t of e.changedTouches) {
					if (t.identifier !== touchId)
						continue;
					const p = pos(t);
					let dx = (p.x - origin.x) / JOYSTICK_RANGE;
					let dy = (p.y - origin.y) / JOYSTICK_RANGE;
					const length = Math.sqrt(dx * dx + dy * dy);
					if (length > 1) {
						dx /= length;
						dy /= length;
					}
					if (length < 0.15) {
						// dead zone
						dx = 0;
						dy = 0;
					}
					MB2.Touch.dx = dx;
					MB2.Touch.dy = dy;
				}
			}, { passive: false });

			const touchEnd = e => {
				for (const t of e.changedTouches) {
					if (t.identifier === touchId) {
						touchId = null;
						MB2.Touch.dx = 0;
						MB2.Touch.dy = 0;
					}
				}
			};
			canvas.addEventListener("touchend", touchEnd);
			canvas.addEventListener("touchcancel", touchEnd);

			// ----- on-screen buttons -----

			const bind = (id, code) => {
				const button = document.getElementById(id);
				if (!button)
					return;
				const press = pressed => e => {
					if (e.cancelable)
						e.preventDefault();
					Key.down[code] = pressed;
					if (pressed) {
						const screen = currentScreen();
						if (screen && screen.onKey)
							screen.onKey(code);
					}
				};
				button.addEventListener("touchstart", press(true), { passive: false });
				button.addEventListener("touchend", press(false), { passive: false });
				button.addEventListener("mousedown", press(true));
				button.addEventListener("mouseup", press(false));
			};
			bind("tbBall", Key.SPACE);
			bind("tbPause", Key.ESCAPE);
		}
	};

})();
