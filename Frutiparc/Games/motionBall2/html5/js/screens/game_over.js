/*
 * End of game panels, shown over the frozen game.
 *   MB2.GameOver         victory / game over with the score (mb2/GameOver.as)
 *   MB2.GameOverCourse   Course mode : the table of records (mb2/GameOverCourse.as)
 * A click (or Enter / Space / Escape) goes back to the menu.
 */
"use strict";

(function () {

	const Sound = MB2.Sound;
	const G = MB2.G;
	const SG = MB2.ScreenGfx;

	MB2.GameOver = class {

		/** mode : the Game, still drawn below the panel. */
		constructor(mode, cause) {
			this.mode = mode;
			this.cause = cause;
			this.victory = cause === MB2.Const.CAUSE_WINS;
			this.text = "Connexion en cours...";
			this.clickable = false;
			this.fx = new MB2.PopupFX();
			this.scale = 0;

			Sound.fadeMix(Sound.MUSIC_GAME_OVER);
			Sound.play(Sound.GAME_OVER);
		}

		onClassicScore(score, record, titem) {
			this.setText(
				"Votre score : niveau " + score +
				"\nVotre record : niveau " + record +
				(titem ? "\nTItem gagne !!" : ""));
		}

		/**
		 * Challenge / adventure score : score % 100 = rooms visited (%) - 1,
		 * score / 100 = the points (see Game.calcScore). The positions are 0 :
		 * there is no online ranking anymore.
		 */
		onScore(score, old_score, old_pos, new_pos, titem) {
			let txt = "";
			if (old_score < score && old_score > 0)
				txt += "Record battu !\n";
			if (old_pos > new_pos && old_pos > 0)
				txt += "Vous avez gagne " + (old_pos - new_pos) + " places.\n";
			txt += ((score % 100) + 1) + " pourcent du niveau accomplis\n";
			txt += "Votre score : " + ((score / 100) | 0) + "\n";
			if (new_pos > 0)
				txt += "Votre classement : " + new_pos;
			if (titem)
				txt += "Nouveau TItem gagne !";
			this.setText(txt);
		}

		setText(txt) {
			this.text = txt;
			this.clickable = true;
		}

		onMouseDown() {
			if (!this.clickable)
				return;
			this.clickable = false;
			MB2.Manager.gameFinished();
		}

		onKey(code) {
			if (MB2.isValidateKey(code))
				this.onMouseDown();
		}

		main() {
			this.scale = this.fx.main();
			this.mode.main();
		}

		tick() {
			if (this.mode.tick)
				this.mode.tick();
		}

		draw(ctx) {
			this.mode.draw(ctx);
			const s = this.scale;
			if (s <= 0.01)
				return;

			SG.drawPanel(ctx, 305, 205, 360, 230, s);
			ctx.save();
			ctx.translate(305, 205);
			ctx.scale(s, s);
			SG.bubbleTitle(ctx, this.victory ? "VICTOIRE !" : "GAME OVER", 0, -80, 44);
			G.text(ctx, this.text, 0, 12, 17, "#6a3000");
			if (this.clickable && (((MB2.frameCount || 0) / 15) | 0) % 2 === 0)
				G.text(ctx, "cliquez pour continuer", 0, 95, 13, "#a05a00");
			ctx.restore();
		}

		destroy() {
			this.mode.destroy();
		}
	};


	/** Medal colours of the records : 1 gold, 2 silver, 3 bronze (the CPU times). */
	const MEDALS = [null, ["#ffd82a", "#a07000"], ["#e4e8ee", "#7a8494"], ["#e8a070", "#8a4a1a"]];

	MB2.GameOverCourse = class {

		/** score : the time, in hundredths of seconds. */
		constructor(mode, score) {
			this.mode = mode;
			this.score = score;
			this.fx = new MB2.PopupFX();
			this.scale = 0;
			this.text = "";
			this.rows = [];
			this.done = false;

			Sound.fadeMix(Sound.MUSIC_GAME_OVER);
			Sound.play(Sound.GAME_OVER);
			this.saveRecords();
		}

		/**
		 * Inserts the time in the 3 best times of the course. The table starts
		 * with 3 CPU times ($c = true) : each CPU time beaten gives TItems, and
		 * beating any time unlocks the next course.
		 */
		saveRecords() {
			const M = MB2.Manager;
			const course = M.play_mode_param;
			const card = M.client.fcard;
			const records = card.$records[course];
			const mine = { $t: this.score, $c: false };

			let p = 0;
			let cpuBefore = 0;   // CPU times ranked before the player
			let titems = 0;
			while (p < 3) {
				if (records[p].$t > this.score) {
					// (sic : the original tests records[p] in this loop, not records[j])
					for (let j = p; j < 3; j++) {
						if (records[p].$c) {
							titems += MB2.TItems.giveCourse(course, cpuBefore);
							cpuBefore++;
						}
					}
					if (!card.$courses[course + 1])
						card.$courses[course + 1] = true;
					records.splice(p, 0, mine);
					break;
				}
				if (records[p].$c)
					cpuBefore++;
				p++;
			}

			if (p === 3) {
				if (records.length === 3)
					records.push(mine);
				else
					this.text = "Vous n'etes pas classe.";
			}
			if (titems > 0)
				this.text += titems + " titems gagnes !";

			// rows : 1-3 medals of the CPU times, 4 = the player's time, 5 = an older player time
			let cpu = 0;
			for (let i = 0; i < 4; i++) {
				const r = records[i];
				let rtype = 5;
				if (r.$c)
					rtype = ++cpu;
				else if (r.$t === this.score)
					rtype = 4;
				this.rows.push({ time: MB2.Interf.makeTime(r.$t), rtype: rtype });
			}

			records.splice(3, records.length - 3);
			M.client.saveSlot(0);
		}

		onMouseDown() {
			if (this.done)
				return;
			this.done = true;
			MB2.Manager.gameFinished();
		}

		onKey(code) {
			if (MB2.isValidateKey(code))
				this.onMouseDown();
		}

		main() {
			this.scale = this.fx.main();
			this.mode.main();
		}

		tick() {
			if (this.mode.tick)
				this.mode.tick();
		}

		draw(ctx) {
			this.mode.draw(ctx);
			const s = this.scale;
			if (s <= 0.01)
				return;

			SG.drawPanel(ctx, 305, 210, 360, 260, s);
			ctx.save();
			ctx.translate(305, 210);
			ctx.scale(s, s);
			SG.bubbleTitle(ctx, "VICTOIRE !", 0, -100, 44);

			for (let i = 0; i < 4; i++) {
				const row = this.rows[i];
				const y = -48 + i * 34;

				ctx.fillStyle = row.rtype === 4 ? "#fff3a0" : "#ffd24a";
				G.rrect(ctx, -80, y - 13, 160, 26, 12);
				ctx.fill();
				ctx.strokeStyle = "#e08a00";
				ctx.lineWidth = 1.5;
				ctx.stroke();
				G.text(ctx, row.time, 0, y, 18, "#7a3a00");

				for (const sx of [-110, 110]) {
					if (MEDALS[row.rtype]) {
						G.ball(ctx, sx, y, 10, MEDALS[row.rtype][0], MEDALS[row.rtype][1], "#fff");
					} else if (row.rtype === 4) {
						// red arrows pointing to the player's time
						const d = sx < 0 ? 1 : -1;
						ctx.fillStyle = "#e02a2a";
						ctx.beginPath();
						ctx.moveTo(sx + 10 * d, y);
						ctx.lineTo(sx - 6 * d, y - 10);
						ctx.lineTo(sx - 6 * d, y + 10);
						ctx.fill();
					}
				}
			}

			G.text(ctx, this.text, 0, 96, 15, "#6a3000");
			ctx.restore();
		}

		destroy() {
			this.mode.destroy();
		}
	};

})();
