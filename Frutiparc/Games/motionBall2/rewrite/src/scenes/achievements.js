/**
 * The achievements screen (from the menu) : every achievement, unlocked or
 * not, with its progress when it counts something. Any key, a click or a tap
 * goes back to the menu.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { ACHIEVEMENTS } from "../achievements.js";
import { clip } from "../gfx/xfl/index.js";
import { roundRect, text } from "../gfx/draw.js";
import { app } from "../app.js";
import { MenuScene } from "./menu.js";

const COLUMNS = 2;
const TOP = 58;
const ROW = 38;
const CELL_W = 285;
const LEFT = (W - CELL_W * COLUMNS - 10) / 2;

/** "12/09/2026" */
const day = ms => {
	const d = new Date(ms);
	const two = n => String(n).padStart(2, "0");
	return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear();
};

export class AchievementsScene {

	constructor() {
		this.time = 0;
		this.bg = clip("fondMenu");
		this.icons = new Map();      // ball type -> "marble" clip at that frame
	}

	update(dt) {
		this.time += dt;
		const input = app.input;
		if (this.time > 0.3 && !app.scenes.busy
			&& (input.pressed("back") || input.pressed("confirm") || input.pressed("pause") || input.pointer)) {
			app.audio.play("menuEnter");
			this.back();
		}
	}

	back() {
		app.scenes.goto(new MenuScene("main", "succes"));
	}

	icon(type) {
		if (!this.icons.has(type)) {
			const c = clip("marble");
			c.gotoAndStop(type);
			this.icons.set(type, c);
		}
		return this.icons.get(type);
	}

	render(ctx) {
		this.bg.draw(ctx);
		ctx.fillStyle = "rgba(40,0,70,0.45)";
		ctx.fillRect(0, 0, W, H);

		const ach = app.achievements;
		text(ctx, "Succès  " + ach.unlockedCount + " / " + ACHIEVEMENTS.length, W / 2, 28,
			{ size: 24, color: "#ffe060", outline: "#4a1470" });

		ACHIEVEMENTS.forEach((a, i) => {
			const x = LEFT + (i % COLUMNS) * (CELL_W + 10);
			const y = TOP + Math.floor(i / COLUMNS) * ROW;
			const done = ach.isUnlocked(a.id);
			const hidden = a.secret && !done;

			ctx.fillStyle = done ? "rgba(255,255,255,0.22)" : "rgba(20,0,40,0.45)";
			roundRect(ctx, x, y, CELL_W, ROW - 4, 10);
			ctx.fill();

			// the icon : a marble of the achievement's colour, dim while locked
			ctx.save();
			ctx.globalAlpha = done ? 1 : 0.3;
			ctx.translate(x + 18, y + (ROW - 4) / 2);
			ctx.scale(1.15, 1.15);
			this.icon(a.ball).draw(ctx);
			ctx.restore();

			const name = hidden ? "???" : a.name;
			const desc = hidden ? "Un succès secret." : a.text;
			text(ctx, name, x + 38, y + 11, { size: 13, color: done ? "#ffe060" : "#e8dcf4", align: "left" });
			text(ctx, desc, x + 38, y + 25, { size: 10, color: done ? "#fff" : "#c8b8d8", align: "left", weight: "600" });

			if (done) {
				text(ctx, day(ach.date(a.id)), x + CELL_W - 8, y + 11, { size: 10, color: "#fff", align: "right", weight: "600" });
			} else {
				const p = ach.progress(a);
				if (p) {
					text(ctx, p.value + " / " + p.goal, x + CELL_W - 8, y + 11, { size: 10, color: "#e8dcf4", align: "right", weight: "600" });
					ctx.fillStyle = "rgba(0,0,0,0.35)";
					ctx.fillRect(x + CELL_W - 70, y + 20, 62, 4);
					ctx.fillStyle = "#b4f08a";
					ctx.fillRect(x + CELL_W - 70, y + 20, 62 * p.value / p.goal, 4);
				}
			}
		});

		if (this.time > 0.3)
			text(ctx, "Clique ou appuie sur une touche pour revenir", W / 2, H - 8,
				{ size: 11, color: "rgba(255,255,255,0.75)", weight: "700" });
	}
}
