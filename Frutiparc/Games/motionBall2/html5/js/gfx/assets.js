/*
 * Bitmaps. They were extracted from mb2.fla by tools/extract_fla.py
 * (see the README), and are loaded once at startup.
 */
"use strict";

MB2.IMAGES = [
	// rooms
	"bg01.jpg", "bg02.jpg", "bg03.jpg", "bg04.jpg", "bgHole.jpg",
	// bumpers
	"normal_base.png", "normal_top.png",
	"time_base.png", "time_needle.png", "time_tip.png",
	"death_base.png",
	"magnet_base.png", "magnet_top.png", "magnet_plus.png", "magnet_minus.png",
	"inter_low_blue.png", "inter_low_pink.png", "inter_high_blue.png", "inter_high_pink.png",
	// snake boss
	"snake_head.png", "snake_body.png", "snake_tail.png",
	"logo_eau.png", "logo_feu.png", "logo_terre.png", "logo_vent.png",
	// menus
	"roue.png", "circle.png", "map.png",
	"menu_challenge.png", "menu_course.png", "menu_aventure.png", "menu_classique.png",
	"menu_options.png", "menu_aide.png",
	"donjon_eau.png", "donjon_feu.png", "donjon_terre.png", "donjon_vent.png",
	// help screen (not used yet)
	"help_bleue.png", "help_jaune.png", "help_metal.png", "help_orange.png", "help_rouge.png",
	"help_verte.png", "help_violette.png"
];

/** Loaded images, by file name without extension : MB2.img.bg01 ... */
MB2.img = {};

/** Loads all the images. Missing images are ignored. onProgress(0..1). */
MB2.loadImages = function (onProgress) {
	let done = 0;
	return Promise.all(MB2.IMAGES.map(file => new Promise(resolve => {
		const image = new Image();
		image.onload = image.onerror = () => {
			done++;
			if (onProgress)
				onProgress(done / MB2.IMAGES.length);
			resolve();
		};
		image.src = "assets/img/" + file;
		MB2.img[file.replace(/\.(png|jpg)$/, "")] = image;
	})));
};
