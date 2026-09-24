/*
 * Player data : preferences and progression.
 * Port of mb2/Card.as, Prefs.as and Client.as.
 *
 * The original game was a Frutiparc game : its "Frusion" client stored two
 * save slots on the server (0 = the card, 1 = the preferences), sent the
 * scores to the rankings and gave TItems (trophies). The port keeps the same
 * slots in localStorage. Field names keep the original "$" prefix.
 */
"use strict";

(function () {

	/** A time in hundredths of seconds. */
	const time = (min, sec) => (min * 60 + sec) * 100;

	/** The 3 CPU records of a course (gold, silver, bronze). */
	const cpuTimes = (t1, t2, t3) => [
		{ $t: t1, $c: true },
		{ $t: t2, $c: true },
		{ $t: t3, $c: true }
	];

	/** A new card (slot 0). */
	MB2.newCard = function () {
		return {
			$items: [],                                // TItems won (by index, see TItems)
			$challenge: true,                          // modes available
			$classic: true,
			$dungeons: [true, true, true, true],       // adventures available (the 5th after the 4 others)
			$dungeons_done: [],
			$courses: [true],                          // courses available (the next one when a record is beaten)
			$classic_score: 0,                         // best level in Classique
			$challenge_score: 0,                       // best Challenge score (added by the port)
			$dtimes: [],                               // best adventure scores
			$records: [                                // 3 best times of each course
				cpuTimes(time(3, 0), time(3, 40), time(4, 20)),
				cpuTimes(time(4, 0), time(4, 40), time(5, 20)),
				cpuTimes(time(4, 30), time(5, 15), time(6, 0)),
				cpuTimes(time(2, 30), time(3, 0), time(3, 30)),
				cpuTimes(time(3, 0), time(3, 30), time(4, 0)),
				cpuTimes(time(4, 0), time(4, 40), time(5, 20)),
				cpuTimes(time(4, 0), time(4, 40), time(5, 20))
			]
		};
	};

	/** Keeps the best score of the current adventure ; returns the previous one (Card.scoreDonjon). */
	MB2.scoreDonjon = function (card, score) {
		const id = MB2.Manager.play_mode_param;
		const old = card.$dtimes[id] || 0;
		if (old < score) {
			card.$dtimes[id] = score;
			MB2.Manager.client.saveSlot(0);
		}
		return old;
	};


	/** Options and unlocked modes (set from the card by Client.connect). */
	MB2.Prefs = {
		challenge_mode_enabled: true,
		classic_mode_enabled: true,
		courses: [],
		dungeons: [],
		sound_enabled: true,
		music_enabled: true,

		toggleMusic() {
			const P = MB2.Prefs;
			P.music_enabled = !P.music_enabled;
			// channels 1-2 : music, 3-7 : the in-game mix
			for (let i = 1; i < MB2.Sound.MUSIC_NLOOPS + 3; i++)
				MB2.Sound.smanager.enable(i, P.music_enabled);
		},

		toggleSounds() {
			const P = MB2.Prefs;
			P.sound_enabled = !P.sound_enabled;
			MB2.Sound.smanager.enable(0, P.sound_enabled);
		}
	};


	const SAVE_KEY = "motionball2.save";

	MB2.Client = class {

		constructor() {
			this.slots = [];
			this.fcard = null;
			try {
				const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
				if (saved && saved.slots)
					this.slots = saved.slots;
			} catch (e) {
				// no storage (private mode...) : the progression is not kept
			}
		}

		/** Saves all the slots (the original saved one slot at a time on the server). */
		saveSlot() {
			try {
				localStorage.setItem(SAVE_KEY, JSON.stringify({ slots: this.slots }));
			} catch (e) {
				// ignored
			}
		}

		savePrefs() {
			this.slots[1] = { $music: MB2.Prefs.music_enabled, $sounds: MB2.Prefs.sound_enabled };
			this.saveSlot(1);
		}

		/** Keeps the best Classique level ; returns the record. */
		saveClassicScore(score) {
			let record = this.slots[0].$classic_score || 0;
			if (score > record) {
				record = score;
				this.slots[0].$classic_score = record;
				this.saveSlot(0);
			}
			return record;
		}

		/** Keeps the best Challenge score ; returns the previous one. */
		saveChallengeScore(score) {
			const old = this.slots[0].$challenge_score || 0;
			if (score > old) {
				this.slots[0].$challenge_score = score;
				this.saveSlot(0);
			}
			return old;
		}

		/** A TItem was won (the server was notified in the original). */
		giveItem(name) {
			MB2.Manager.lastTItem = name;
		}

		/** Loads the slots (onServiceConnect in the original). */
		connect() {
			let prefs = this.slots[1];
			if (prefs == null) {
				prefs = { $music: true, $sounds: true };
				this.slots[1] = prefs;
			}

			let card = this.slots[0];
			if (card == null) {
				card = MB2.newCard();
				this.slots[0] = card;
			}
			// cards saved by an older version may miss fields
			const defaults = MB2.newCard();
			for (const field in defaults) {
				if (card[field] === undefined)
					card[field] = defaults[field];
			}
			this.fcard = card;

			const P = MB2.Prefs;
			P.challenge_mode_enabled = card.$challenge;
			P.classic_mode_enabled = card.$classic;
			P.courses = card.$courses;
			P.dungeons = card.$dungeons;
			// the toggles apply the volumes
			P.music_enabled = !prefs.$music;
			P.sound_enabled = !prefs.$sounds;
			P.toggleMusic();
			P.toggleSounds();
		}
	};

})();
