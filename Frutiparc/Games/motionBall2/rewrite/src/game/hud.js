/**
 * The in-game display over the room :
 *   - top left : the time (and the level in Classique, the laps in Course),
 *     with a popup when time is won or lost ;
 *   - bottom right : the balls left, the current one highlighted, and the keys.
 */

import { WIDTH as W, HEIGHT as H } from "../config.js";
import { BALL_TYPE_COUNT } from "../data/enums.js";
import { BALL_COLORS, circle, roundRect, text } from "../gfx/draw.js";
import { drawKey } from "../gfx/icons.js";
import { ease, formatTime } from "../engine/math.js";

export class Hud {

	constructor(game) {
		this.game = game;
		this.popups = [];      // { text, color, age }
		this.lapFlash = -1;    // seconds since a lap, -1 = none
	}

	timeChanged(seconds) {
		if (!seconds)
			return;
		const good = this.game.rules.chrono ? seconds < 0 : seconds > 0;
		const txt = (seconds > 0 ? "+" : "") + seconds + " s";
		this.popups.push({ text: txt, color: good ? "#b6ff7a" : "#ff8a7a", age: 0 });
	}

	lapDone() {
		this.lapFlash = 0;
	}

	update(dt) {
		for (const p of this.popups)
			p.age += dt;
		this.popups = this.popups.filter(p => p.age < 1.2);
		if (this.lapFlash >= 0) {
			this.lapFlash += dt;
			if (this.lapFlash > 1.2)
				this.lapFlash = -1;
		}
	}

	render(ctx) {
		const g = this.game;
		const r = g.rules;
		let x = 1;

		if (r.laps) {
			x = pill(ctx, x, 112, formatTime(g.time, true));
			x = pill(ctx, x + 4, 56, Math.min(r.laps, r.laps - g.laps + 1) + "/" + r.laps, drawLapIcon);
		} else {
			if (g.mode === "classic")
				x = pill(ctx, x, 64, "Niv. " + (g.level + 1)) + 4;
			const low = g.time < 30;
			x = pill(ctx, x, 84, formatTime(g.time), drawClockIcon, low && Math.floor(g.time * 4) % 2 === 0 ? "#ffb0a0" : "#fff");
		}

		// time won / lost
		for (const p of this.popups) {
			const t = p.age / 1.2;
			ctx.globalAlpha = 1 - t;
			text(ctx, p.text, x + 24, 14 + t * 14, { size: 16, color: p.color, outline: "rgba(60,20,80,0.6)" });
			ctx.globalAlpha = 1;
		}

		if (this.lapFlash >= 0) {
			const t = this.lapFlash / 1.2;
			ctx.globalAlpha = Math.sin(t * Math.PI);
			text(ctx, g.laps > 0 ? "TOUR !" : "ARRIVÉE !", W / 2, 120, { size: 40 + ease.outQuad(t) * 12, color: "#ffe060", outline: "#7a3a00" });
			ctx.globalAlpha = 1;
		}

		if (g.rules.ballSwitch)
			this.renderBalls(ctx);
	}

	/** The balls left (right to left from yellow), and the keys above them. */
	renderBalls(ctx) {
		const g = this.game;
		const inv = g.inventory;
		let x = W - 25;
		for (let type = 0; type < BALL_TYPE_COUNT; type++) {
			for (let n = 0; n < inv.balls[type]; n++) {
				const current = g.ball.type === type && n === 0 && !g.ball.hidden;
				const col = BALL_COLORS[type];
				const r = 11.5;
				ctx.fillStyle = current ? "#ffffff" : "rgba(60,110,30,0.5)";
				circle(ctx, x, H - 20, r + 1.5);
				ctx.fill();
				const grad = ctx.createRadialGradient(x - 3, H - 24, 1, x, H - 20, r);
				grad.addColorStop(0, col[2]);
				grad.addColorStop(0.45, col[0]);
				grad.addColorStop(1, col[1]);
				ctx.fillStyle = grad;
				circle(ctx, x, H - 20, r);
				ctx.fill();
				x -= 25;
			}
		}
		for (let k = 0; k < inv.keys; k++) {
			ctx.save();
			ctx.translate(W - 35 - k * 25, H - 55);
			drawKey(ctx, 1);
			ctx.restore();
		}
	}
}

/** A translucent box of the counter, with a text and an optional icon ; returns its right edge. */
function pill(ctx, x, w, label, icon, color = "#fff") {
	ctx.fillStyle = "rgba(230,255,215,0.45)";
	roundRect(ctx, x, 1, w, 24, 6);
	ctx.fill();
	ctx.strokeStyle = "rgba(255,255,255,0.5)";
	ctx.lineWidth = 1;
	ctx.stroke();
	let tx = x + w / 2;
	if (icon) {
		icon(ctx, x + 14, 13);
		tx += 9;
	}
	text(ctx, label, tx, 14, { size: 20, color, outline: "rgba(70,150,40,0.55)" });
	return x + w;
}

function drawClockIcon(ctx, x, y) {
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 1.5;
	circle(ctx, x, y, 6);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(x, y - 4);
	ctx.moveTo(x, y);
	ctx.lineTo(x + 3, y);
	ctx.stroke();
}

function drawLapIcon(ctx, x, y) {
	ctx.strokeStyle = "#fff";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(x, y, 5.5, -Math.PI * 0.2, Math.PI * 1.5);
	ctx.stroke();
	ctx.fillStyle = "#fff";
	ctx.beginPath();
	ctx.moveTo(x + 2, y - 8);
	ctx.lineTo(x + 6, y - 5);
	ctx.lineTo(x + 1, y - 3);
	ctx.fill();
}
