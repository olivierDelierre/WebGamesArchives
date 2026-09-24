/*
 * The player's inventory : balls left, keys, map and radar.
 * Port of mb2/Options.as.
 */
"use strict";

MB2.Options = class {

	/** nballs = number of yellow balls at the start (the "lives"). */
	constructor(game, nballs) {
		this.game = game;

		// number of balls of each type (MB2.BallType)
		this.ball_types = [0, 0, 0, 0, 0, 0, 0];
		this.ball_types[MB2.BallType.YELLOW] = nballs;
		// the ball colours found at least once (for the music, see Sound.nextMix)
		this.ball_flags = [];
		// total of ball_types : the original used it as a cheat detection
		this.ball_types_chk = nballs;
		this.cur_ball = 0;

		this.icons = [];
		this.grelots = [];
		this.has_map = false;
		this.has_radar = false;
		this.grelot_count = 0;   // keys
	}

	/**
	 * Rebuilds the icons of the balls (bottom right, the current one highlighted)
	 * and of the keys (above them). There are no icons in Classique mode.
	 */
	update_icons() {
		if (MB2.Manager.play_mode === MB2.Const.MODE_CLASSIC)
			return;

		const dm = this.game.dmanager;
		const plane = MB2.Const.ICON_PLAN;

		this.clean_icons();
		let x = 585;
		for (let type = 6; type >= 0; type--) {
			for (let n = 0; n < this.ball_types[type]; n++) {
				const icon = dm.attach("ball icon", plane);
				this.icons.push(icon);
				icon.x = x;
				icon.y = 390;
				icon.ball.gotoAndStop(type + 1);
				const current = this.game.ball.btype === type && n === this.ball_types[type] - 1;
				icon.gotoAndStop(current ? "on" : "select");
				x -= 25;
			}
		}

		// keys : add the new ones, or play the "used" animation of the last ones
		if (this.grelots.length < this.grelot_count) {
			let xx = 575 - 25 * this.grelots.length;
			while (this.grelots.length < this.grelot_count) {
				const icon = dm.attach("icon grelot", plane);
				this.grelots.push(icon);
				icon.x = xx;
				icon.y = 355;
				xx -= 25;
			}
		} else {
			while (this.grelots.length > this.grelot_count)
				this.grelots.pop().gotoAndPlay("hit");
		}
	}

	/** Removes the ball icons (not the key icons). */
	clean_icons() {
		for (const icon of this.icons)
			icon.removeMovieClip();
		this.icons = [];
	}
};
