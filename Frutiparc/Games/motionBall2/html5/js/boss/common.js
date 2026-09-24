/*
 * Helpers shared by the bosses.
 *
 * A boss is created by Collide.boss_room_on_update and stored in
 * game.boss_update. The game calls boss.on_update() every frame (also while
 * the ball is dying) and boss.onPause(flag) when the game is paused.
 * A boss ends the game with game.gameOver(CAUSE_WINS) when it dies.
 */
"use strict";

MB2.BossTools = {

	/**
	 * The red flash of a hit boss : Flash's Color.setTransform with a red
	 * offset (0..255), as a Clip.tint.
	 */
	redTint(amount) {
		if (amount <= 0)
			return null;
		return { r: 255, g: 40, b: 40, k: Math.min(0.85, amount / 255) };
	},

	/** An angle in ]-PI, PI]. */
	normalize(a) {
		a %= Math.PI * 2;
		if (a <= -Math.PI)
			a += Math.PI * 2;
		else if (a > Math.PI)
			a -= Math.PI * 2;
		return a;
	},

	/**
	 * Moves `speed` toward `target_speed` : slows down smoothly, or accelerates
	 * by the factor `accel` (from at least 1).
	 */
	approachSpeed(boss) {
		const tmod = MB2.Std.tmod;
		if (boss.speed > boss.target_speed) {
			boss.speed *= Math.pow(0.97, tmod);
			if (boss.speed < boss.target_speed)
				boss.speed = boss.target_speed;
		} else if (boss.speed < boss.target_speed) {
			if (boss.speed <= 1)
				boss.speed = 1;
			boss.speed *= Math.pow(boss.accel, tmod);
			if (boss.speed > boss.target_speed)
				boss.speed = boss.target_speed;
		}
	},

	/** Updates the powers of a boss (a power removes itself from the list when it ends). */
	updatePowers(powers) {
		for (let i = 0; i < powers.length; i++) {
			const p = powers[i];
			p.update();
			if (powers[i] !== p)
				i--;
		}
	}
};
