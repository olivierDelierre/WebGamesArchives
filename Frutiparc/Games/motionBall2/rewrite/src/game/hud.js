/**
 * The in-game display, with the original symbols (Interf.as, Options.as) :
 *   - "time counter", top right : the time left in tenths of seconds
 *     (label "score"), the level and the time in Classique ("classic"), the
 *     chronometer and the laps in Course ("time" ; a lap plays its animation,
 *     the chronometer is frozen during it and 1.5 s after) ;
 *   - "ball icon", bottom right : one per ball owned, the current one "on" ;
 *   - "icon grelot" above them : the keys ("hit" when one is used).
 */

import { WIDTH as W } from "../config.js";
import { BALL_TYPE_COUNT } from "../data/enums.js";
import { clip, drawClip } from "../gfx/xfl/index.js";

const pad = n => String(n).padStart(2, "0");

export class Hud {

	constructor(game) {
		this.game = game;
		const r = game.rules;
		this.counter = clip("time counter");
		this.counter.gotoAndStop(r.laps ? "time" : game.mode === "classic" ? "classic" : "score");
		this.frozen = 0;           // Course : the chronometer waits after a lap
		this.icons = [];           // { type, art }
		this.iconsKey = "";
		this.keys = [];            // the key icons
	}

	/** (kept for the game's calls : the original shows no popup) */
	timeChanged() { }

	/** Course : a lap is done, the counter plays its animation. */
	lapDone() {
		this.counter.play();
	}

	update(dt) {
		const g = this.game;
		const c = this.counter;
		c.update(dt);

		if (g.rules.laps) {
			c.setText("lap_txt", Math.max(0, g.laps - 1));
			if (c.frame !== c.frameOf("time")) {
				this.frozen = 1.5;
			} else if (this.frozen > 0) {
				this.frozen -= dt;
			} else {
				c.setText("min_txt", pad(Math.floor(g.time / 60)));
				c.setText("sec_txt", pad(Math.floor(g.time) % 60));
				c.setText("mil_txt", pad(Math.floor(g.time * 100) % 100));
			}
		} else {
			// (tenths of seconds)
			c.setText("tview_txt", Math.floor(g.time * 10));
			c.setText("niv_txt", g.level + 1);
		}

		this.updateIcons();
		for (const i of this.icons)
			i.art.update(dt);
		for (const k of this.keys)
			k.update(dt);
		this.keys = this.keys.filter(k => !k.removed);
	}

	/** Rebuilds the ball icons when the balls or the current ball change. */
	updateIcons() {
		const g = this.game;
		if (!g.rules.ballSwitch)
			return;
		const inv = g.inventory;
		const key = inv.balls.join(",") + "/" + g.ball.type + "/" + g.ball.hidden;
		if (key !== this.iconsKey) {
			this.iconsKey = key;
			this.icons = [];
			// (original : from the violet ball, right to left, the current one last)
			for (let type = BALL_TYPE_COUNT - 1; type >= 0; type--) {
				for (let n = 0; n < inv.balls[type]; n++) {
					const art = clip("ball icon");
					const current = g.ball.type === type && n === inv.balls[type] - 1 && !g.ball.hidden;
					art.gotoAndStop(current ? "on" : "select");
					const ball = art.child("ball");
					if (ball)
						ball.gotoAndStop(type);
					this.icons.push({ type, art });
				}
			}
		}

		// keys : new ones appear, used ones play "hit" and remove themselves
		const alive = this.keys.filter(k => !k.leaving);
		if (alive.length < inv.keys) {
			for (let i = alive.length; i < inv.keys; i++) {
				const k = clip("icon grelot");
				this.keys.push(k);
			}
		} else {
			for (let i = alive.length - 1; i >= inv.keys; i--) {
				alive[i].leaving = true;
				alive[i].gotoAndPlay("hit");
			}
		}
	}

	render(ctx) {
		drawClip(ctx, this.counter, W, 0);
		this.icons.forEach((icon, i) => drawClip(ctx, icon.art, 585 - 25 * i, 390));
		this.keys.forEach((k, i) => drawClip(ctx, k, 575 - 25 * i, 355));
	}
}
