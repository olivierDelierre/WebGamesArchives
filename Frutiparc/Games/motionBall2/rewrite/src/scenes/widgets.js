/**
 * Navigation between the buttons of a screen, with every input :
 *   - the mouse moves the focus, a click triggers ;
 *   - a tap triggers ;
 *   - the arrows / d-pad / stick move the focus to the nearest button in
 *     that direction, "confirm" triggers, "back" calls onBack.
 *
 * A button : { x, y, w, h (centre and size), enabled, action(), draw(ctx, focused) }.
 */

import { app } from "../app.js";

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export class ButtonGroup {

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
		return this.buttons.findIndex(b => Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2);
	}

	/** Handles the input of one step. */
	update() {
		const input = app.input;

		// mouse hover (only when the mouse moves : the keyboard keeps the focus otherwise)
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
}
