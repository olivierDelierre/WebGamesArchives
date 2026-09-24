/*
 * The transition between two screens : a rotating rounded diamond closes on
 * the old screen, then opens on the new one. Port of mb2/Transition.as.
 *
 * TRICKY : the Manager creates the transition when a new screen is asked
 * (Manager.setNextMode). When the shape is closed (mask_size < 0), the old
 * screen is destroyed and the new one is created by Manager.nextMode() ;
 * once the shape is fully open again, the Manager switches to the new screen.
 * Manager.forceNextMode may change the target while the transition runs.
 */
"use strict";

MB2.Transition = class {

	constructor(mode) {
		this.mode = mode;              // the old screen, then the new one
		this.reversed = false;         // true once the new screen is shown
		this.mask_size = 350;          // shrinks to 0 then "grows" to -400
		this.rotation = 0;
		this.diag = 0.3 + random(300) / 100;   // roundness of the shape
		this.main();
	}

	main() {
		this.mask_size -= MB2.Std.tmod * 15;
		this.rotation += MB2.Std.tmod * 3;

		if (this.mode)
			this.mode.main();

		if (!this.reversed && this.mask_size < 0) {
			this.reversed = true;
			if (this.mode)
				this.mode.destroy();
			this.mode = MB2.Manager.nextMode();
		}

		if (this.mask_size < -400) {
			const next = this.mode;
			this.mode = null;
			MB2.Manager.switchMode(next);
		}
	}

	tick() {
		if (this.mode && this.mode.tick)
			this.mode.tick();
	}

	draw(ctx) {
		ctx.fillStyle = "#1e0632";
		ctx.fillRect(0, 0, MB2.Const.LVL_WIDTH, MB2.Const.LVL_HEIGHT);
		if (!this.mode)
			return;

		// a negative size draws the same shape (it is symmetric)
		const s = Math.abs(this.mask_size);
		const d = s * this.diag;
		const angle = this.rotation * Math.PI / 180;

		ctx.save();
		ctx.translate(305, 205);
		ctx.rotate(angle);
		ctx.beginPath();
		ctx.moveTo(0, -s);
		ctx.quadraticCurveTo(d, -d, s, 0);
		ctx.quadraticCurveTo(d, d, 0, s);
		ctx.quadraticCurveTo(-d, d, -s, 0);
		ctx.quadraticCurveTo(-d, -d, 0, -s);
		// back to the screen coordinates : the clip keeps the rotated shape
		ctx.rotate(-angle);
		ctx.translate(-305, -205);
		ctx.clip();
		this.mode.draw(ctx);
		ctx.restore();
	}

	destroy() {
		if (this.mode)
			this.mode.destroy();
	}
};
