/*
 * Drawing helpers shared by the screens (intro, menu, game over...).
 *
 * A "screen" (or mode) is an object with main() (one logic frame),
 * draw(ctx), destroy(), and optionally tick(), onMouseMove(x, y),
 * onMouseDown(x, y), onKey(code). See app/manager.js.
 */
"use strict";

(function () {

	const G = MB2.G;
	const W = MB2.Const.LVL_WIDTH;
	const H = MB2.Const.LVL_HEIGHT;

	MB2.ScreenGfx = {

		/** Purple background with the rotating sunburst (the "roue" bitmap). */
		drawSunburst(ctx, rotation, scale) {
			ctx.fillStyle = "#6e32a0";
			ctx.fillRect(0, 0, W, H);

			const image = MB2.img.roue;
			if (image && image.naturalWidth) {
				const s = 1.2 * (scale || 1);
				ctx.save();
				ctx.translate(W / 2, H / 2);
				ctx.rotate(rotation);
				ctx.drawImage(image, -351 * s, -351 * s, 702 * s, 702 * s);
				ctx.restore();
			}

			const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 380);
			g.addColorStop(0, "rgba(255,255,255,0.15)");
			g.addColorStop(1, "rgba(40,0,70,0.5)");
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, W, H);
		},

		/** A purple bubbly letter of the title, centered on (0, 0). */
		drawLetter(ctx, ch, size) {
			ctx.font = "800 " + size + "px " + MB2.FONT;
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
			// a light edge on top
			ctx.fillStyle = "rgba(255,255,255,0.45)";
			ctx.fillText(ch, 0, -size * 0.06);
			ctx.fillStyle = g;
			ctx.fillText(ch, 0, size * 0.03);
		},

		/** The yellow rounded panel of the game over screens (panGameOver), scaled by s. */
		drawPanel(ctx, x, y, w, h, s) {
			ctx.save();
			ctx.translate(x, y);
			ctx.scale(s, s);

			ctx.fillStyle = "rgba(90,40,0,0.3)";
			G.rrect(ctx, -w / 2 + 6, -h / 2 + 8, w, h, 22);
			ctx.fill();

			const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
			g.addColorStop(0, "#ffe04a");
			g.addColorStop(1, "#ffb400");
			ctx.fillStyle = g;
			G.rrect(ctx, -w / 2, -h / 2, w, h, 22);
			ctx.fill();
			ctx.lineWidth = 4;
			ctx.strokeStyle = "#e08a00";
			ctx.stroke();

			ctx.lineWidth = 2;
			ctx.strokeStyle = "rgba(255,255,255,0.6)";
			G.rrect(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 17);
			ctx.stroke();

			ctx.restore();
		},

		/** A yellow bubbly title ("VICTOIRE !"). */
		bubbleTitle(ctx, txt, x, y, size) {
			ctx.save();
			ctx.translate(x, y);
			ctx.font = "800 " + size + "px " + MB2.FONT;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.lineJoin = "round";

			ctx.lineWidth = size / 4;
			ctx.strokeStyle = "#c86a00";
			ctx.strokeText(txt, 0, 0);
			ctx.lineWidth = size / 9;
			ctx.strokeStyle = "#fff6c0";
			ctx.strokeText(txt, 0, 0);

			const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
			g.addColorStop(0, "#fff7a0");
			g.addColorStop(1, "#ffc000");
			ctx.fillStyle = g;
			ctx.fillText(txt, 0, 0);
			ctx.restore();
		}
	};

	/**
	 * Elastic "pop" of a panel (asml.PopupFX) : main() returns the scale,
	 * from 0 to 1 with a bounce.
	 */
	MB2.PopupFX = class {
		constructor() {
			this.scale = 0;
			this.speed = 0;
		}
		main() {
			this.speed += (100 - this.scale) * 0.35;
			this.speed *= 0.6;
			this.scale += this.speed;
			return this.scale / 100;
		}
	};

	/** Keys that validate a screen. */
	MB2.isValidateKey = function (code) {
		const K = MB2.Key;
		return code === K.ENTER || code === K.SPACE || code === K.ESCAPE;
	};

})();
