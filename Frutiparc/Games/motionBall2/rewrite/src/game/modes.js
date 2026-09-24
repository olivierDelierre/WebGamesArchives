/**
 * The rules of each game mode, in one place.
 *
 * Everything that differs between the modes is a field here, so the game
 * code asks `game.rules.xxx` instead of testing the mode.
 */

import { Mode } from "../data/enums.js";
import { loadDungeon } from "../data/dungeon.js";
import { generateChallenge, ClassicDungeon } from "../data/generator/index.js";

const MINUTES = 60;

export const MODES = {

	[Mode.CHALLENGE]: {
		title: "Challenge",
		dungeon: () => generateChallenge(),
		startTime: 15 * MINUTES,     // countdown
		lives: 3,                    // yellow balls at the start
		ballSwitch: true,            // can change ball
		// time pastille, clock bumper
		bluePastille: +10,
		clockBumper: -5,
		itemTime: true               // item boxes can give time
	},

	[Mode.ADVENTURE]: {
		title: "Aventure",
		dungeon: n => loadDungeon("adv_" + (n + 1)),
		startTime: 18 * MINUTES,
		lives: 5,
		ballSwitch: true,
		bluePastille: +10,
		clockBumper: -5,
		itemTime: true
	},

	[Mode.COURSE]: {
		title: "Course",
		dungeon: n => loadDungeon("course_" + (n + 1)),
		chrono: true,                // the time counts up
		startTime: 0,
		laps: 3,
		lives: 1,
		freeYellow: true,            // losing the yellow ball costs nothing
		ballSwitch: true,
		bluePastille: -1,
		clockBumper: +5,
		itemTime: false,
		checkpoints: true            // the zappers are checkpoints
	},

	[Mode.CLASSIC]: {
		title: "Classique",
		dungeon: () => new ClassicDungeon(5),
		startTime: 60,
		maxTime: 100,
		levelBonus: 5,               // seconds won at each level
		lives: 1,
		ballSwitch: false,
		bluePastille: +2,
		clockBumper: -5,
		itemTime: true,
		openEverywhere: true,        // the ball may leave a room by any side
		randomStartRow: true
	},

	[Mode.TUTORIAL]: {
		title: "Aide",
		dungeon: () => loadDungeon("tuto"),
		startTime: 15 * MINUTES,
		lives: 3,
		noLoss: true,                // dying costs nothing
		ballSwitch: true,
		bluePastille: +10,
		clockBumper: -5,
		itemTime: true,
		endsAtBoss: true             // reaching the boss room ends the tutorial
	}
};
