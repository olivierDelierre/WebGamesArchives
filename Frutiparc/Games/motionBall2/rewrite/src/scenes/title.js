/**
 * The title screen : waits for a key, a click or a tap (which also allows
 * the browser to play sound), then goes to the menu.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { sunburst, title } from "../gfx/ui.js";
import { text } from "../gfx/draw.js";
import { drawBall } from "../game/ball.js";
import { MUSIC_VOLUME } from "../sounds.js";
import { app } from "../app.js";
import { MenuScene } from "./menu.js";

export class TitleScene {

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

		// a few balls turning around the title
		for (let i = 0; i < 7; i++) {
			const a = t * 0.6 + i * Math.PI * 2 / 7;
			ctx.save();
			ctx.translate(W / 2 + Math.cos(a) * 230, 150 + Math.sin(a) * 90);
			const s = 1.2 + Math.sin(a) * 0.4;
			ctx.scale(s, s);
			drawBall(ctx, i, 0.8);
			ctx.restore();
		}

		title(ctx, "MotionBall", W / 2, 140, 64, t);
		title(ctx, "2", W / 2, 205, 70, t + 1);

		ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
		text(ctx, "Appuie sur une touche", W / 2, 300, { size: 24, color: "#fff", outline: "#4a1470" });
		ctx.globalAlpha = 1;
		text(ctx, "Motion Twin / Frutiparc 2005 — version HTML5", W / 2, H - 16, { size: 12, color: "rgba(255,255,255,0.7)", weight: "600" });
	}
}
