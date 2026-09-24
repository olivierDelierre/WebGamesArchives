/*
 * The snakes, bosses of the 4 elemental dungeons (logic : boss/serpent.js).
 *
 * The head, body and tail are the original bitmaps (white versions),
 * tinted with the colour of the element. The colours were guessed.
 * Elements : 1 eau (water), 2 feu (fire), 3 vent (wind), 4 terre (earth).
 */
"use strict";

(function () {

	const SYM = MB2.SYMBOLS;
	const G = MB2.G;

	const ELEMENT_COLORS = [null, "#8fd8ff", "#ff7a3a", "#e9f4ff", "#a6d25a"];

	/** A bitmap multiplied by the colour of an element (cached). */
	MB2.tinted = function (name, element) {
		const key = name + "_" + element;
		const cache = MB2.G._tinted || (MB2.G._tinted = {});
		if (cache[key])
			return cache[key];

		const image = MB2.img[name];
		if (!image || !image.naturalWidth)
			return null;

		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const ctx = canvas.getContext("2d");
		ctx.drawImage(image, 0, 0);
		// multiply by the colour, then restore the transparency of the image
		ctx.globalCompositeOperation = "multiply";
		ctx.fillStyle = ELEMENT_COLORS[element] || "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = "destination-in";
		ctx.drawImage(image, 0, 0);

		cache[key] = canvas;
		return canvas;
	};

	/*
	 * A part of the snake : frame 1 head, 2 body ring, 3 tail.
	 * The bitmaps face left : the game rotates the parts by angle + 180 degrees.
	 *   elt    element (1..4)
	 *   eyes   1 excited (red), 2 normal (green), 3 berserk (yellow)
	 *   snap   frames left of the "bite" animation of the head (set on a hit)
	 */
	SYM.snake = {
		w: 100, h: 100,
		frames: 3,
		init(c) {
			c.eyes = 2;
			c.snap = 0;
			c.elt = 1;
		},
		update(c) {
			if (c.snap > 0)
				c.snap--;
		},
		draw(ctx, c) {
			const name = ["snake_head", "snake_body", "snake_tail"][c.frame - 1];
			const image = MB2.tinted(name, c.elt);
			if (!image)
				return;

			if (c.frame === 3) {
				// tail : the registration point is on its ball, the spikes point backward
				ctx.drawImage(image, -26, -image.height / 2);
				return;
			}

			if (c.frame === 1) {
				const bite = c.snap > 0 ? Math.sin(c.snap / 10 * Math.PI) * 6 : 0;
				ctx.drawImage(image, -image.width / 2 + bite, -image.height / 2);
				const color = c.eyes === 1 ? "#ff3020" : c.eyes === 3 ? "#ffea00" : "#40ff60";
				for (const side of [-1, 1])
					G.ball(ctx, -38 + bite, side * 24, 5, color, "#202020", "#ffffff");
				return;
			}

			ctx.drawImage(image, -image.width / 2, -image.height / 2);
		}
	};

	/** Scales flying away when the snake loses a ring (frame = element). */
	SYM.snakePart = {
		w: 10, h: 10,
		frames: 4,
		draw(ctx, c) {
			ctx.fillStyle = ELEMENT_COLORS[c.frame] || "#fff";
			ctx.strokeStyle = "rgba(0,0,0,0.3)";
			ctx.lineWidth = 0.5;
			ctx.beginPath();
			ctx.moveTo(0, -5);
			ctx.quadraticCurveTo(5, -2, 3, 4);
			ctx.quadraticCurveTo(0, 6, -3, 4);
			ctx.quadraticCurveTo(-5, -2, 0, -5);
			ctx.fill();
			ctx.stroke();
		}
	};

	/**
	 * The logo of the element on the floor of the boss room (frame = element).
	 * Registration : top-left of the room. Position and scale were guessed.
	 */
	SYM.logoBg = {
		frames: 4,
		draw(ctx, c) {
			const name = ["logo_eau", "logo_feu", "logo_vent", "logo_terre"][c.frame - 1];
			const image = MB2.img[name];
			if (!image || !image.naturalWidth)
				return;
			const s = 1.3;
			const w = image.naturalWidth * s;
			const h = image.naturalHeight * s;
			ctx.drawImage(image, MB2.Const.LVL_WIDTH / 2 - w / 2, MB2.Const.LVL_HEIGHT / 2 - h / 2, w, h);
		}
	};

})();
