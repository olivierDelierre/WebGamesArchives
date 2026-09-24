/**
 * The sounds of the game : what each event plays, and the files.
 * (The file names are those of the original game's library.)
 */

const dir = "assets/snd/";

/** Sound name -> file. */
export const SOUND_FILES = {
	ballChange: dir + "bonus_blip2.wav",
	menuEnter: dir + "menu_enter.wav",
	menuMove: dir + "menu_change.wav",
	eye: dir + "oeil.wav",
	newEye: dir + "oeilnew.wav",
	bossJump: dir + "boss_saut.wav",
	bossDeath: dir + "mort_monstre07.wav",
	crash: dir + "fireball03.wav",
	wall: dir + "wall_bump.wav",
	metal: dir + "bumper_metal.wav",
	death: dir + "superpouvoir02.wav",
	laser: dir + "traverse_laser07.wav",
	found: dir + "object_found.wav",
	red: dir + "bonus_blip.wav",
	blue: dir + "bonus_blip3.wav",
	key: dir + "ramasse_option01.wav",
	doors: dir + "doors_open.wav",
	gameOver: dir + "game_over.wav",
	wind: dir + "wind.wav",
	water: dir + "water.wav",
	earth: dir + "earth.wav",
	touched: dir + "touched.wav",
	hide: dir + "hide.wav",
	kata1: dir + "kata1.wav",
	kata2: dir + "kata2.wav",
	kata3: dir + "kata3.wav",
	musicMenu: dir + "menu.wav",
	musicBoss: dir + "boss.wav",
	loop1: dir + "loop1.wav",
	loop2: dir + "loop2.wav",
	loop3: dir + "loop3.wav",
	loop4: dir + "loop4.wav",
	loop5: dir + "loop5.wav"
};

/** The layers of the in-game music, and their volume (the richer, the louder). */
export const GAME_MUSIC = {
	layers: ["loop1", "loop2", "loop3", "loop4", "loop5"],
	volumes: [0.2, 0.3, 0.4, 0.5, 0.6]
};

export const MUSIC_VOLUME = 0.25;
