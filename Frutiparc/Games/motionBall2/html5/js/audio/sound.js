/*
 * The sounds and musics of the game (port of mb2/Sound.as).
 *
 * The in-game music is made of 5 loops of the same length (loop1..loop5.wav),
 * each one richer than the previous. They all play together, in sync, on
 * channels 3 to 7, but only one is audible : each new ball found cross-fades
 * to the next loop (nextMix), so the music grows with the progression.
 */
"use strict";

MB2.Sound = {

	// sound names (see MB2.SOUND_FILES)
	BALL_CHANGE: "bonus_blip2",
	MENU_ENTER: "menu_enter",
	MENU_SELECT: "menu_select",
	BOSS_EYE: "eye",
	BOSS_JUMP: "sound_boss_saut",
	BOSS_NEW_EYE: "eye_new",
	POULPE: "sound_poulpe",
	CASSE: "sound_casse",
	WALL_HIT: "wall_bump",
	BUMPER_NORMAL: "bumper_metal",
	BUMPER_TIME: "wall_bump",
	BUMPER_DEATH: "sound_bdeath",
	BUMPER_DEATH_PROTECT: "bumper_metal",
	BUMPER_MAGNET: "bumper_metal",
	BUMPER_SHADOW: "bumper_metal",
	GREEN_BLOCK_HIT: "wall_bump",
	INTER_BLOCK_HIT: "wall_bump",
	INTERUPT_HIT: "bumper_metal",
	ZAPPER_HIT: "bumper_metal",
	ZAPPER_ACTIVATE: "sound_zapper",
	GREEN_BLOCK_DESTROY: "wall_bump",
	GET_ITEM: "object_found",
	GET_BALL: "object_found",
	GET_RED: "bonus_blip",
	GET_BLUE: "bonus_blip3",
	GRELOT: "sound_grelot",
	OPEN_DOOR: "door_open",
	GAME_OVER: "game_over",
	POWER_WIND: "wind",
	POWER_FIRE: "sound_casse",
	POWER_WATER: "water",
	POWER_EARTH: "earth",
	SERPENT_HIT: "touched",
	SERPENT_COLLIDE: "wall_bump",
	TB_HIT: "touched",
	TB_HIDE: "hide",

	// musics
	MUSIC_MENU: "menu",
	MUSIC_INTRO: "menu",
	MUSIC_BOSS: "boss_loop",
	MUSIC_GAME_OVER: "",

	MIX_VOLUME: 20,
	MUSIC_VOLUME: 20,
	MUSIC_NLOOPS: 5,

	smanager: null,
	time: 0,
	mix_nb: undefined,       // index of the audible mix loop
	channel_music: true,     // which of the channels 1 / 2 holds the current music
	last_sound: undefined,
	last_time: undefined,

	init() {
		const S = MB2.Sound;
		if (!S.smanager)
			S.smanager = new MB2.SoundManager();
		S.smanager.setVolume(1, S.MUSIC_VOLUME);
		S.smanager.setVolume(2, S.MUSIC_VOLUME);
		S.time = 0;
		S.mix_nb = undefined;
		S.last_time = undefined;
		S.last_sound = undefined;
		S.channel_music = true;
	},

	destroy() {
		MB2.Sound.smanager.destroy();
	},

	/** Called every frame. */
	main() {
		const S = MB2.Sound;
		S.time += MB2.Std.deltaT;
		S.smanager.main(MB2.Std.deltaT);
	},

	/** Plays a sound effect ; the same sound is played only once per frame. */
	play(name) {
		const S = MB2.Sound;
		if (name !== S.last_sound || S.time !== S.last_time) {
			S.smanager.play(name);
			S.last_sound = name;
			S.last_time = S.time;
		}
	},

	/** Switches to another music, cross-fading channels 1 and 2. */
	playMusic(name) {
		const S = MB2.Sound;
		const sm = S.smanager;
		S.stopMix();
		if (sm.isPlaying(name, S.channel_music ? 1 : 2))
			return;

		S.channel_music = !S.channel_music;
		const cur = S.channel_music ? 1 : 2;
		const old = S.channel_music ? 2 : 1;
		sm.setVolume(cur, 0);
		// the fade target is the volume of the old channel : make sure it is not 0
		// (it is when the old music was already faded out by startMix)
		sm.vol[old] = S.MUSIC_VOLUME;
		sm.fade(old, cur, 1);
		sm.loop(name, cur);
	},

	/** Starts the in-game music : the 5 loops together, only the first one audible. */
	startMix() {
		const S = MB2.Sound;
		const sm = S.smanager;
		S.stopMix();
		for (let i = 0; i < S.MUSIC_NLOOPS; i++)
			sm.setVolume(i + 3, 0);

		const music = S.channel_music ? 1 : 2;
		sm.setVolume(music, S.MIX_VOLUME);
		sm.fade(music, 3);

		const when = sm.now() + 0.05;
		for (let i = 0; i < S.MUSIC_NLOOPS; i++)
			sm.loop("loop$" + (i + 1), i + 3, when);
		S.mix_nb = 0;
	},

	/** A new ball was found : fade to the next (richer and louder) loop. */
	nextMix() {
		const S = MB2.Sound;
		const sm = S.smanager;
		if (S.mix_nb < 4) {
			sm.setVolume(S.mix_nb + 3, S.MIX_VOLUME + (S.mix_nb + 1) * 10);
			sm.fade(S.mix_nb + 3, S.mix_nb + 4);
			S.mix_nb++;
		}
	},

	/** Fades the in-game music into another music (boss, menu, game over = silence). */
	fadeMix(name) {
		const S = MB2.Sound;
		const sm = S.smanager;
		S.channel_music = true;
		const mix = (S.mix_nb === undefined ? 0 : S.mix_nb) + 3;
		sm.setVolume(mix, S.MUSIC_VOLUME);
		sm.setVolume(1, 0);
		sm.fade(mix, 1, 2.0);
		sm.loop(name, 1);
		// the other (silent) mix loops are not needed anymore
		for (let i = 3; i < 8; i++) {
			if (i !== mix)
				sm.stop(i);
		}
	},

	stopMix() {
		const sm = MB2.Sound.smanager;
		// (the original only stopped 4 of the 5 loops)
		for (let i = 3; i < 8; i++)
			sm.stop(i);
	}
};
