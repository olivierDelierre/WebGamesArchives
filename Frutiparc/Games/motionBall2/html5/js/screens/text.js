/*
 * A screen showing a message ("Chargement...", " ERREUR "). Port of mb2/Text.as.
 */
"use strict";

MB2.Text = class {

	constructor(txt) {
		this.txt = txt;
		this.t = 0;
	}

	setText(txt) {
		this.txt = txt;
	}

	main() {
		this.t++;
	}

	draw(ctx) {
		MB2.ScreenGfx.drawSunburst(ctx, this.t / 200);
		MB2.ScreenGfx.drawPanel(ctx, 305, 205, 300, 110, 1);
		MB2.G.text(ctx, this.txt, 305, 205, 18, "#7a3a00");
	}

	destroy() { }
};
