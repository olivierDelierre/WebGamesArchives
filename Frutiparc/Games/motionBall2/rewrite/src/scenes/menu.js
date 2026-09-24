/**
 * The menu : the game modes, then a page per mode that needs a choice
 * (adventures, courses), the options and the help.
 */

import { WIDTH as W, BALLS } from "../config.js";
import { Mode } from "../data/enums.js";
import { sunburst, title, button, panel } from "../gfx/ui.js";
import { text, image, circle, roundRect } from "../gfx/draw.js";
import { formatTime } from "../engine/math.js";
import { drawBall } from "../game/ball.js";
import { app } from "../app.js";
import { ButtonGroup } from "./widgets.js";
import { PlayScene } from "./play.js";

const MODE_INFO = {
	challenge: "Un donjon au hasard : trouve les 4 billes\net bats le poulpe en moins de 15 minutes.",
	course: "Trois tours de circuit, le plus vite possible.\nBats un record pour ouvrir le circuit suivant.",
	aventure: "Cinq donjons faits main,\ngardés par les serpents des éléments.",
	classique: "Descends le plus bas possible : prends les pastilles\nrouges et plonge dans la trappe avant la fin du temps.",
	options: "La musique et les sons.",
	aide: "Le tutoriel, et le rôle de chaque bille."
};

const BALL_HELP = [
	"La bille de départ.",
	"Casse les blocs verts.",
	"Attire les pastilles rouges.",
	"Très rapide... et difficile à tenir !",
	"Saute par-dessus les trous.",
	"Lourde : ne craint ni les bumpers mortels,\nni les aimants.",
	"Voit les bumpers invisibles."
];
const BALL_IMAGES = ["help_jaune", "help_verte", "help_rouge", "help_orange", "help_bleue", "help_metal", "help_violette"];

const ADVENTURES = [
	{ name: "Eau", icon: "donjon_eau" },
	{ name: "Feu", icon: "donjon_feu" },
	{ name: "Vent", icon: "donjon_vent" },
	{ name: "Terre", icon: "donjon_terre" },
	{ name: "Final", icon: null }
];

export class MenuScene {

	constructor(page = "main") {
		this.time = 0;
		this.open(page);
	}

	open(page) {
		// back on the main page, the focus stays on the mode that was opened
		const mainFocus = this.page === "main" ? this.group.focus : this.mainFocus || 0;
		this.mainFocus = mainFocus;
		this.page = page;
		this.group = this[page + "Page"]();
		if (page === "main")
			this.group.focus = mainFocus;
	}

	start(mode, param = 0) {
		if (app.scenes.busy)
			return;
		app.scenes.goto(new PlayScene(mode, param));
	}

	// ----- pages -----

	mainPage() {
		const modes = [
			["challenge", () => this.start(Mode.CHALLENGE)],
			["course", () => this.open("course")],
			["aventure", () => this.open("adventure")],
			["classique", () => this.start(Mode.CLASSIC)],
			["options", () => this.open("options")],
			["aide", () => this.open("help")]
		];
		const buttons = modes.map(([name, action], i) => ({
			name,
			x: 155 + (i % 3) * 150,
			y: 155 + Math.floor(i / 3) * 128,
			w: 112,
			h: 112,
			action,
			draw: (ctx, focused) => {
				const b = buttons[i];
				const bounce = focused ? 1.12 + Math.sin(this.time * 6) * 0.03 : 1;
				ctx.save();
				ctx.translate(b.x, b.y);
				ctx.scale(bounce, bounce);
				if (focused) {
					ctx.fillStyle = "rgba(255,255,255,0.35)";
					circle(ctx, 0, 0, 62);
					ctx.fill();
				}
				image(ctx, "menu_" + name, 112, 112);
				ctx.restore();
			}
		}));
		return new ButtonGroup(buttons);
	}

	adventurePage() {
		const save = app.save;
		const buttons = ADVENTURES.map((a, i) => {
			const unlocked = save.adventureUnlocked(i);
			return {
				x: 95 + i * 105,
				y: 185,
				w: 96,
				h: 120,
				enabled: unlocked,
				action: () => this.start(Mode.ADVENTURE, i),
				draw: (ctx, focused) => this.drawAdventure(ctx, a, i, unlocked, focused)
			};
		});
		buttons.push(this.backButton());
		return new ButtonGroup(buttons, () => this.open("main"));
	}

	coursePage() {
		const save = app.save;
		const buttons = [];
		for (let i = 0; i < 7; i++) {
			const unlocked = save.courseUnlocked(i);
			const best = save.data.courses.records[i][0];
			buttons.push({
				x: 110 + (i % 4) * 130,
				y: 150 + Math.floor(i / 4) * 110,
				w: 112,
				h: 90,
				enabled: unlocked,
				action: () => this.start(Mode.COURSE, i),
				draw: (ctx, focused) => {
					const b = buttons[i];
					ctx.save();
					ctx.translate(b.x, b.y);
					if (focused)
						ctx.scale(1.07, 1.07);
					ctx.fillStyle = unlocked ? (focused ? "#c8ff9a" : "#a6ec6e") : "rgba(60,20,90,0.6)";
					roundRect(ctx, -56, -45, 112, 90, 18);
					ctx.fill();
					ctx.strokeStyle = focused ? "#fff" : "rgba(255,255,255,0.5)";
					ctx.lineWidth = 2;
					ctx.stroke();
					text(ctx, "Circuit " + (i + 1), 0, -20, { size: 18, color: "#fff", outline: "rgba(20,60,0,0.5)" });
					text(ctx, unlocked ? "Record " + formatTime(best.time, true) : "Fermé", 0, 14,
						{ size: 13, color: unlocked ? "#2a5a10" : "#d0c0e0", weight: "700" });
					ctx.restore();
				}
			});
		}
		buttons.push(this.backButton());
		return new ButtonGroup(buttons, () => this.open("main"));
	}

	optionsPage() {
		const s = app.save.settings;
		const toggle = (key, label, y) => ({
			x: W / 2, y, w: 260, h: 44,
			action: () => {
				s[key] = !s[key];
				app.save.save();
				applySettings();
			},
			draw: (ctx, focused) => button(ctx, label + (s[key] ? " : oui" : " : non"), W / 2, y, 260, 44, focused ? "focus" : "idle")
		});
		const buttons = [toggle("music", "Musique", 170), toggle("sounds", "Sons", 230), this.backButton()];
		return new ButtonGroup(buttons, () => this.open("main"));
	}

	helpPage() {
		const buttons = BALLS.map((b, i) => ({
			x: 70 + i * 78, y: 150, w: 70, h: 70,
			action: () => { },
			draw: (ctx, focused) => {
				ctx.save();
				ctx.translate(70 + i * 78, 150);
				ctx.scale(focused ? 1.1 : 0.9, focused ? 1.1 : 0.9);
				image(ctx, BALL_IMAGES[i], 70, 70);
				ctx.restore();
			}
		}));
		buttons.push({
			x: W / 2 - 100, y: 360, w: 180, h: 40,
			action: () => this.start(Mode.TUTORIAL),
			draw: (ctx, focused) => button(ctx, "Tutoriel", W / 2 - 100, 360, 180, 40, focused ? "focus" : "idle")
		});
		const back = this.backButton();
		back.x = W / 2 + 100;
		buttons.push(back);
		return new ButtonGroup(buttons, () => this.open("main"));
	}

	backButton() {
		const b = {
			x: W / 2, y: 360, w: 180, h: 40,
			action: () => this.open("main"),
			draw: (ctx, focused) => button(ctx, "Retour", b.x, b.y, 180, 40, focused ? "focus" : "idle")
		};
		return b;
	}

	// ----- every step -----

	update(dt) {
		this.time += dt;
		if (!app.scenes.busy)
			this.group.update();
	}

	render(ctx) {
		sunburst(ctx, this.time * 0.1);
		const heading = { main: "MotionBall 2", adventure: "Aventure", course: "Course", options: "Options", help: "Aide" }[this.page];
		title(ctx, heading, W / 2, 48, this.page === "main" ? 44 : 40, this.time);
		this.group.render(ctx);

		if (this.page === "main")
			this.renderInfo(ctx);
		if (this.page === "help")
			this.renderHelp(ctx);
	}

	renderInfo(ctx) {
		const b = this.group.focused;
		panel(ctx, W / 2, 372, 470, 58);
		text(ctx, MODE_INFO[b.name], W / 2, 372, { size: 14, color: "#6a3a00", weight: "700" });
		const save = app.save.data;
		if (b.name === "challenge" && save.challengeBest > 0)
			badge(ctx, "Record : " + save.challengeBest);
		if (b.name === "classique" && save.classicBest > 0)
			badge(ctx, "Record : niveau " + save.classicBest);
	}

	renderHelp(ctx) {
		const i = this.group.focus;
		if (i >= BALLS.length)
			return;
		panel(ctx, W / 2, 262, 440, 110);
		ctx.save();
		ctx.translate(W / 2 - 170, 262);
		ctx.scale(2.4, 2.4);
		drawBall(ctx, i, 0.8);
		ctx.restore();
		text(ctx, "Bille " + BALLS[i].name.toLowerCase(), W / 2 + 30, 235, { size: 22, color: "#fff", outline: "#c86a00" });
		text(ctx, BALL_HELP[i], W / 2 + 30, 280, { size: 15, color: "#6a3a00", weight: "700" });
	}

	drawAdventure(ctx, a, i, unlocked, focused) {
		const b = this.group ? this.group.buttons[i] : { x: 95 + i * 105, y: 185 };
		const won = app.save.data.adventures.won[i];
		ctx.save();
		ctx.translate(b.x, b.y);
		if (focused)
			ctx.scale(1.08, 1.08);
		ctx.fillStyle = !unlocked ? "rgba(60,20,90,0.6)" : focused ? "#fff2a8" : "#ffe04a";
		roundRect(ctx, -48, -60, 96, 120, 20);
		ctx.fill();
		ctx.strokeStyle = focused ? "#fff" : "#e08a00";
		ctx.lineWidth = 3;
		ctx.stroke();
		if (a.icon) {
			ctx.globalAlpha = unlocked ? 1 : 0.3;
			image(ctx, a.icon, 64, 56, -32, -48);
			ctx.globalAlpha = 1;
		} else {
			text(ctx, unlocked ? "!" : "?", 0, -20, { size: 48, color: unlocked ? "#e03a00" : "#d0c0e0", outline: "#fff" });
		}
		text(ctx, a.name, 0, 28, { size: 18, color: unlocked ? "#6a3a00" : "#d0c0e0" });
		if (won)
			text(ctx, "Gagné " + app.save.data.adventures.best[i] + " %", 0, 48, { size: 12, color: "#2a7a10", weight: "700" });
		ctx.restore();
	}
}

function badge(ctx, str) {
	ctx.fillStyle = "rgba(40,0,70,0.6)";
	roundRect(ctx, W / 2 - 90, 322, 180, 22, 11);
	ctx.fill();
	text(ctx, str, W / 2, 333, { size: 13, color: "#ffe060", weight: "700" });
}

/** Applies the sound settings. */
export function applySettings() {
	const s = app.save.settings;
	app.audio.setMusicEnabled(s.music);
	app.audio.setSoundsEnabled(s.sounds);
}

