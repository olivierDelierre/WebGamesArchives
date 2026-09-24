/*
 * The Manager : holds the current screen ("mode") and switches between them.
 * Port of mb2/Manager.as (and Loader.as / LevelLoader.as).
 *
 * Screens : Intro -> Menu -> Loader -> Game -> GameOver -> Menu ...
 * Changing screen goes through a Transition (see screens/transition.js) :
 *   setNextMode(i)    starts a transition toward screen i (0 menu, 2 error, 3 game)
 *   forceNextMode(i)  the same, even if a transition is already running
 *   nextMode()        creates screen next_mode (called by the transition)
 *   switchMode(m)     the transition is over : m becomes the current screen
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const Sound = MB2.Sound;

	const NEXT_MENU = 0;
	const NEXT_ERROR = 2;
	const NEXT_GAME = 3;

	/** Builds the level of a game (a fresh copy : the game modifies it). */
	function levelData(mode, param) {
		switch (mode) {
		case Const.MODE_CHALLENGE:
			return MB2.generateChallenge();
		case Const.MODE_CLASSIC:
			return new MB2.ClassicDungeon(5);
		case Const.MODE_AIDE:
			return MB2.assembleDungeon(MB2.LEVEL_FILES.tuto);
		case Const.MODE_AVENTURE:
			return MB2.assembleDungeon(MB2.LEVEL_FILES["adv_" + (param + 1)]);
		case Const.MODE_COURSE:
			return MB2.assembleDungeon(MB2.LEVEL_FILES["course_" + (param + 1)]);
		}
		return null;
	}

	/**
	 * Shows "Chargement..." while the level is built. The original downloaded
	 * the .dat file here ; the random levels take up to a few hundred
	 * milliseconds to generate, so the message is drawn first.
	 */
	class Loader {
		constructor(mode, param) {
			this.text = new MB2.Text("Chargement...");
			this.mode = mode;
			this.param = param;
			this.frames = 0;
		}
		main() {
			this.text.main();
			// wait for the message to be drawn
			if (++this.frames !== 3)
				return;
			try {
				M.level_data = levelData(this.mode, this.param);
				M.loadDone();
			} catch (e) {
				console.error(e);
				M.error();
			}
		}
		draw(ctx) {
			this.text.draw(ctx);
		}
		destroy() { }
	}

	const M = MB2.Manager = {

		play_mode: 0,
		play_mode_param: 0,
		mode: null,           // the current screen
		next_mode: -1,        // the screen a transition goes to (-1 : none)
		client: null,
		level_data: null,     // the level of the game being started
		lastTItem: null,

		init() {
			Sound.init();
			M.client = new MB2.Client();
			M.client.connect();
			M.next_mode = -1;
			M.mode = new MB2.Intro();
		},

		/** One logic frame (40 per second). */
		main() {
			MB2.Collide.frame_nb++;
			Sound.main();
			if (M.mode)
				M.mode.main();
			if (M.mode && M.mode.tick)
				M.mode.tick();
		},

		// ----- screens -----

		nextMode() {
			switch (M.next_mode) {
			case NEXT_MENU:
				return new MB2.Menu();
			case NEXT_ERROR:
				return new MB2.Text(" ERREUR ");
			case NEXT_GAME:
				return new MB2.Game();
			}
			return null;
		},

		setNextMode(i) {
			if (M.next_mode === -1) {
				M.mode = new MB2.Transition(M.mode);
				M.next_mode = i;
			}
		},

		forceNextMode(i) {
			if (M.next_mode === -1) {
				M.setNextMode(i);
				return;
			}
			if (!(M.mode instanceof MB2.Transition)) {
				M.next_mode = -1;
				M.setNextMode(i);
				return;
			}
			// a transition is running : change its target
			M.mode.reversed = false;
			M.next_mode = i;
		},

		switchMode(m) {
			if (M.mode)
				M.mode.destroy();
			M.next_mode = -1;
			M.mode = m;
		},

		gotoMenu() {
			M.setNextMode(NEXT_MENU);
		},

		error() {
			M.setNextMode(NEXT_ERROR);
		},

		// ----- games -----

		/** Called by the menu : builds the level, then starts the game. */
		startGame(gameMode, modeParam) {
			M.play_mode = gameMode;
			M.play_mode_param = modeParam;
			M.lastTItem = null;
			if (M.mode)
				M.mode.destroy();
			M.mode = new Loader(gameMode, modeParam);
		},

		loadDone() {
			M.forceNextMode(NEXT_GAME);
		},

		/** The game over panel was clicked. */
		gameFinished() {
			Sound.stopMix();
			Sound.playMusic(Sound.MUSIC_MENU);
			M.forceNextMode(NEXT_MENU);
		},

		/** The game is over : saves the progression and shows the result over the game. */
		gameOver(cause) {
			const game = M.mode;
			const score = game.calcScore(cause);
			const card = M.client.fcard;

			switch (M.play_mode) {
			case Const.MODE_CHALLENGE: {
				M.mode = new MB2.GameOver(game, cause);
				const old = M.client.saveChallengeScore(score);
				M.mode.onScore(score, old, 0, 0, false);
				break;
			}

			case Const.MODE_AVENTURE: {
				const dungeon = M.play_mode_param;
				if (cause === Const.CAUSE_WINS && !card.$dungeons_done[dungeon]) {
					card.$dungeons_done[dungeon] = true;
					// the 4 elemental dungeons done : the final one opens
					if ([0, 1, 2, 3].every(i => card.$dungeons_done[i]))
						card.$dungeons[4] = true;
					M.client.saveSlot(0);
				}
				const titem = (cause === Const.CAUSE_WINS) ? MB2.TItems.giveAventure(dungeon) : false;
				M.mode = new MB2.GameOver(game, cause);
				M.mode.onScore(score, MB2.scoreDonjon(card, score), 0, 0, titem);
				break;
			}

			case Const.MODE_AIDE:
				// the tutorial ends in the boss room
				M.forceNextMode(NEXT_MENU);
				break;

			case Const.MODE_COURSE:
				M.mode = new MB2.GameOverCourse(game, score);
				break;

			case Const.MODE_CLASSIC: {
				const record = M.client.saveClassicScore(score);
				M.mode = new MB2.GameOver(game, cause);
				M.mode.onClassicScore(score, record, MB2.TItems.giveClassic(score));
				break;
			}
			}
		}
	};

})();
