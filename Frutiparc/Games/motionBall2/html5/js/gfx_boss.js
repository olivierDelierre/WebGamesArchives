// MotionBall 2 - HTML5 port : graphics of the bosses and their effects
"use strict";

(function () {

const SYM = MB2.SYMBOLS, G = MB2.G;
const stopAt = n => c => c.gotoAndStop(n);
const TAU = Math.PI * 2;

// zapper beams (faint, so that the player sees which ball colour is needed)
SYM.zaplines = {
	draw(ctx, c) {
		const t = (MB2.frameCount || 0) / 6;
		ctx.save();
		ctx.lineWidth = 2;
		ctx.setLineDash([4, 6]);
		ctx.lineDashOffset = -t * 2;
		for (const l of c.lines) {
			const a = l.z1.clip, b = l.z2.clip;
			if (!a || !b || a.removed || b.removed) continue;
			const col = MB2.Manager.play_mode === MB2.Const.MODE_COURSE ? ["#ffffff"] : MB2.BALL_COLORS[l.phase];
			ctx.strokeStyle = col[0];
			ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t);
			ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
		}
		ctx.restore();
	}
};

// ---------------------------------------------------------------------------
// Octopus (challenge boss)
SYM.boss = {
	w: 100, h: 90, frames: 110,
	labels: { dodo: 1, normal: 2, aspire: 3, tir: 13, looseEye: 23, newEye: 31, eat: 41, "throw": 56, death: 71 },
	actions: {
		1: c => c.stop(), 2: c => c.stop(), 12: c => c.gotoAndPlay(3), 22: c => c.stop(), 30: c => c.stop(),
		40: stopAt(2), 55: c => c.stop(), 70: stopAt(2), 110: c => c.stop()
	},
	init(c) {
		c.oeil = {
			p: { x: 0, y: 0, xscale: 100, yscale: 100 },
			lid: 0, anim: 0,
			play() { if (!this.anim) this.anim = 12; },
			gotoAndPlay() { this.anim = 12; }
		};
		c.b = { p1: { rotation: 0 }, p2: { rotation: 0 } };
		c.souffle = { xscale: 0, yscale: 0 };
		c.jump = 0;
		c.dodo = true;
	},
	update(c) {
		const o = c.oeil;
		if (o.anim > 0) o.anim--;
	},
	draw(ctx, c) {
		const f = c.frame;
		const t = (MB2.frameCount || 0) / 8;
		let scale = 1, alpha = 1;
		if (f >= 71) { const k = (f - 71) / 39; scale = 1 + k * 0.6; alpha = 1 - k; }
		if (f >= 41 && f <= 55) scale = 1 + 0.12 * Math.sin((f - 41) / 14 * Math.PI);
		if (f >= 56 && f <= 70) scale = 1 + 0.15 * Math.sin((f - 56) / 14 * Math.PI);
		ctx.globalAlpha *= alpha;
		ctx.scale(scale, scale);
		// suction
		const s = c.souffle.xscale / 100;
		if (s > 0.05) {
			ctx.save();
			ctx.strokeStyle = "rgba(255,255,255,0.5)";
			ctx.lineWidth = 2;
			for (let i = 0; i < 3; i++) {
				const k = ((t * 0.5 + i / 3) % 1);
				ctx.globalAlpha *= 1;
				ctx.beginPath();
				ctx.arc(0, 25, (60 - k * 50) * s, 0.2 * Math.PI, 0.8 * Math.PI);
				ctx.stroke();
			}
			ctx.restore();
		}
		// tentacles
		ctx.strokeStyle = "#7a36b0";
		ctx.lineCap = "round";
		for (let i = 0; i < 6; i++) {
			const bx = -30 + i * 12;
			const w = Math.sin(t + i) * 6;
			ctx.lineWidth = 9 - Math.abs(i - 2.5);
			ctx.beginPath();
			ctx.moveTo(bx, 10);
			ctx.quadraticCurveTo(bx * 1.3 + w, 30, bx * 1.5 - w, 40 + (i % 2) * 4);
			ctx.stroke();
		}
		// pincers
		for (const side of [-1, 1]) {
			ctx.save();
			ctx.translate(side * 24, 18);
			ctx.rotate((side < 0 ? c.b.p1.rotation : c.b.p2.rotation) * Math.PI / 180);
			ctx.fillStyle = "#d06ae0";
			ctx.strokeStyle = "#5a1a78";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.quadraticCurveTo(side * 16, 6, side * 10, 20);
			ctx.quadraticCurveTo(side * 4, 12, 0, 8);
			ctx.closePath();
			ctx.fill(); ctx.stroke();
			ctx.restore();
		}
		// head
		const g = ctx.createRadialGradient(-12, -22, 5, 0, -5, 48);
		g.addColorStop(0, "#e2a4ff");
		g.addColorStop(0.5, "#a650dc");
		g.addColorStop(1, "#5a1a8a");
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(0, -6, 42, 34, 0, 0, TAU);
		ctx.fill();
		ctx.strokeStyle = "#4a1070"; ctx.lineWidth = 2; ctx.stroke();
		// spots
		ctx.fillStyle = "rgba(255,255,255,0.18)";
		for (const [x, y, r] of [[-26, -18, 5], [24, -22, 4], [30, 2, 3], [-30, 4, 3]]) { G.circle(ctx, x, y, r); ctx.fill(); }
		// eye
		const eyeless = (f >= 23 && f <= 30) || (f >= 13 && f <= 22 && f > 20);
		const growing = f >= 31 && f <= 40 ? (f - 31) / 9 : 1;
		const bulge = f >= 13 && f <= 22 ? 1 + (f - 13) / 9 * 0.3 : 1;
		if (eyeless) {
			ctx.fillStyle = "#3a0858";
			ctx.beginPath(); ctx.ellipse(0, -6, 16, 13, 0, 0, TAU); ctx.fill();
		} else {
			ctx.save();
			ctx.translate(0, -6);
			ctx.scale(growing * bulge, growing * bulge);
			G.ball(ctx, 0, 0, 16, "#ffffff", "#c8b8d8", "#ffffff");
			const p = c.oeil.p;
			ctx.save();
			ctx.translate(p.x * 0.3, p.y * 0.5);
			ctx.scale(Math.max(0.3, p.xscale / 100), Math.max(0.3, p.yscale / 100));
			G.ball(ctx, 0, 0, 8, "#e0304a", "#6a0010");
			ctx.fillStyle = "#000"; G.circle(ctx, 0, 0, 3.5); ctx.fill();
			ctx.restore();
			// eyelid
			let lid = 0;
			if (f === 1) lid = 1;
			else if (c.oeil.anim > 0) lid = Math.sin(c.oeil.anim / 12 * Math.PI);
			if (lid > 0) {
				ctx.fillStyle = "#9a48cc";
				ctx.beginPath();
				ctx.ellipse(0, -16 + 16 * lid, 17, 16 * lid + 0.1, 0, Math.PI, TAU);
				ctx.rect(-17, -17, 34, 1 + 16 * lid);
				ctx.fill();
				if (lid === 1) {
					ctx.strokeStyle = "#4a1070"; ctx.lineWidth = 2;
					ctx.beginPath(); ctx.arc(0, -2, 12, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
				}
			}
			ctx.restore();
		}
		if (f === 1) G.text(ctx, "z", 30 + Math.sin(t) * 3, -40 - (t * 4 % 12), 14, "#fff");
	}
};
SYM["boss shade"] = {
	draw(ctx) {
		ctx.fillStyle = "rgba(40,0,60,0.3)";
		ctx.beginPath(); ctx.ellipse(0, 28, 44, 14, 0, 0, TAU); ctx.fill();
	}
};
SYM["boss tir"] = {
	w: 30, h: 30,
	draw(ctx, c) {
		G.ball(ctx, 0, 0, 13, "#ffffff", "#b8a8c8");
		const a = Math.atan2(c.sy || 0, c.sx || 1);
		G.ball(ctx, Math.cos(a) * 5, Math.sin(a) * 5, 6, "#e0304a", "#6a0010");
		ctx.fillStyle = "#000"; G.circle(ctx, Math.cos(a) * 6, Math.sin(a) * 6, 2.5); ctx.fill();
		ctx.strokeStyle = "rgba(200,40,60,0.5)"; ctx.lineWidth = 1;
		for (let i = 0; i < 4; i++) {
			const b = a + Math.PI + (i - 1.5) * 0.4;
			ctx.beginPath(); ctx.moveTo(Math.cos(b) * 12, Math.sin(b) * 12); ctx.lineTo(Math.cos(b) * 5, Math.sin(b) * 5); ctx.stroke();
		}
	}
};
SYM.bossParticule = {
	w: 20, h: 20,
	draw(ctx) { G.ball(ctx, 0, 0, 10, "#c070f0", "#5a1a8a", "#f0d0ff"); }
};

// floor tile falling in a new hole (registration : top-left of the cell)
SYM.dalle = {
	w: 40, h: 40, frames: 24,
	init(c) { c.playing = true; },
	actions: { 24: c => c.removeMovieClip() },
	draw(ctx, c) {
		const k = (c.frame - 1) / 23;
		ctx.translate(20, 20);
		ctx.rotate(k * 0.8);
		ctx.scale(1 - k * 0.8, 1 - k * 0.8);
		ctx.globalAlpha *= 1 - k * 0.6;
		ctx.fillStyle = "#c9a2e6";
		ctx.strokeStyle = "#8a5ab0";
		ctx.lineWidth = 2;
		G.rrect(ctx, -19, -19, 38, 38, 4); ctx.fill(); ctx.stroke();
	}
};
// floor cracking before becoming a hole
SYM.FXDalleCut = {
	w: 40, h: 40, frames: 50,
	init(c) { c.playing = true; },
	actions: { 50: c => c.removeMovieClip() },
	draw(ctx, c) {
		const k = (c.frame - 1) / 49;
		ctx.strokeStyle = (c.frame >> 2) % 2 ? "rgba(60,0,80,0.9)" : "rgba(255,255,255,0.8)";
		ctx.lineWidth = 1 + k * 2;
		ctx.beginPath();
		ctx.moveTo(4, 20); ctx.lineTo(14, 16); ctx.lineTo(20, 24); ctx.lineTo(30, 14); ctx.lineTo(37, 18);
		ctx.moveTo(20, 4); ctx.lineTo(18, 14); ctx.lineTo(24, 22); ctx.lineTo(20, 36);
		ctx.stroke();
		ctx.strokeStyle = "rgba(255,80,80," + (0.3 + 0.4 * k) + ")";
		ctx.strokeRect(1, 1, 38, 38);
	}
};

// ---------------------------------------------------------------------------
// Snake (adventure bosses) : bitmaps from the .fla tinted by element
// 1 eau, 2 feu, 3 vent, 4 terre
const ELT_COLORS = [null, "#8fd8ff", "#ff7a3a", "#e9f4ff", "#a6d25a"];
MB2.tinted = function (name, elt) {
	const key = name + "_" + elt;
	const C = MB2.G._tinted || (MB2.G._tinted = {});
	if (C[key]) return C[key];
	const i = MB2.img[name];
	if (!i || !i.naturalWidth) return null;
	const c = document.createElement("canvas");
	c.width = i.naturalWidth; c.height = i.naturalHeight;
	const x = c.getContext("2d");
	x.drawImage(i, 0, 0);
	x.globalCompositeOperation = "multiply";
	x.fillStyle = ELT_COLORS[elt] || "#fff";
	x.fillRect(0, 0, c.width, c.height);
	x.globalCompositeOperation = "destination-in";
	x.drawImage(i, 0, 0);
	C[key] = c;
	return c;
};
SYM.snake = {
	w: 100, h: 100, frames: 3,
	init(c) { c.eyes = 2; c.snap = 0; c.elt = 1; },
	update(c) { if (c.snap > 0) c.snap--; },
	draw(ctx, c) {
		const name = ["snake_head", "snake_body", "snake_tail"][c.frame - 1];
		const im = MB2.tinted(name, c.elt);
		if (!im) return;
		if (c.frame === 3) {
			// tail : the spikes point backward (the image is centered on its ball)
			ctx.drawImage(im, -26, -im.height / 2);
			return;
		}
		if (c.frame === 1) {
			const sn = c.snap > 0 ? Math.sin(c.snap / 10 * Math.PI) * 6 : 0;
			ctx.drawImage(im, -im.width / 2 + sn, -im.height / 2);
			const col = c.eyes === 1 ? "#ff3020" : c.eyes === 3 ? "#ffea00" : "#40ff60";
			for (const s of [-1, 1]) {
				G.ball(ctx, -38 + sn, s * 24, 5, col, "#202020", "#ffffff");
			}
			return;
		}
		ctx.drawImage(im, -im.width / 2, -im.height / 2);
	}
};
SYM.snakePart = {
	w: 10, h: 10, frames: 4,
	draw(ctx, c) {
		ctx.fillStyle = ELT_COLORS[c.frame] || "#fff";
		ctx.strokeStyle = "rgba(0,0,0,0.3)";
		ctx.lineWidth = 0.5;
		ctx.beginPath();
		ctx.moveTo(0, -5); ctx.quadraticCurveTo(5, -2, 3, 4); ctx.quadraticCurveTo(0, 6, -3, 4); ctx.quadraticCurveTo(-5, -2, 0, -5);
		ctx.fill(); ctx.stroke();
	}
};
SYM.logoBg = {
	frames: 4,
	draw(ctx, c) {
		const n = ["logo_eau", "logo_feu", "logo_vent", "logo_terre"][c.frame - 1];
		const i = MB2.img[n];
		if (!i || !i.naturalWidth) return;
		const s = 1.3;
		ctx.drawImage(i, 305 - i.naturalWidth * s / 2, 205 - i.naturalHeight * s / 2, i.naturalWidth * s, i.naturalHeight * s);
	}
};

// ---------------------------------------------------------------------------
// elemental powers
SYM.FXWater = {
	w: 20, h: 20,
	draw(ctx) {
		const t = (MB2.frameCount || 0) / 5;
		ctx.fillStyle = "rgba(120,200,255,0.5)";
		G.circle(ctx, 0, 0, 13 + Math.sin(t) * 2); ctx.fill();
		ctx.fillStyle = "#6ac8ff";
		ctx.beginPath();
		ctx.moveTo(0, -12); ctx.quadraticCurveTo(9, 0, 7, 5); ctx.arc(0, 5, 7, 0, Math.PI); ctx.quadraticCurveTo(-9, 0, 0, -12);
		ctx.fill();
		G.shine(ctx, 0, 3, 7, 0.8);
	}
};
SYM.FXWaterParticule = {
	w: 8, h: 8, frames: 3,
	draw(ctx, c) { G.ball(ctx, 0, 0, 2 + c.frame, "#9adcff", "#2a7ac8", "#fff"); }
};
SYM.FXWaterQueue = {
	w: 10, h: 10, frames: 10,
	init(c) { c.playing = true; },
	actions: { 10: c => c.removeMovieClip() },
	draw(ctx, c) {
		ctx.globalAlpha *= 0.5 * (1 - (c.frame - 1) / 10);
		ctx.fillStyle = "#6ac8ff";
		ctx.beginPath(); ctx.ellipse(5, 0, 5, 4, 0, 0, TAU); ctx.fill();
	}
};
SYM.FXFire = {
	w: 30, h: 60, frames: 55,
	init(c) { c.playing = true; c.flLoopv = true; },
	actions: { 40: c => { if (c.flLoopv) c.gotoAndPlay(16); }, 55: c => c.removeMovieClip() },
	draw(ctx, c) {
		const f = c.frame;
		const t = (MB2.frameCount || 0) / 3;
		let h;
		if (f < 16) h = f / 15 * 0.35;
		else if (f <= 40) h = 1;
		else h = 1 - (f - 40) / 15;
		ctx.fillStyle = "rgba(60,0,0,0.3)";
		ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, 0, 0, TAU); ctx.fill();
		if (f < 16) {
			ctx.fillStyle = "rgba(255," + (100 + f * 8) + ",0,0.8)";
			for (let i = 0; i < 5; i++) { G.circle(ctx, Math.cos(i * 1.3 + t) * 8, Math.sin(i * 1.3 + t) * 3, 2); ctx.fill(); }
			return;
		}
		for (let i = 0; i < 3; i++) {
			const w = [14, 10, 6][i] * (0.8 + 0.2 * Math.sin(t + i));
			const hh = [48, 38, 26][i] * h;
			ctx.fillStyle = ["#ff4a10", "#ff9a20", "#ffe860"][i];
			ctx.beginPath();
			ctx.moveTo(-w, 0);
			ctx.quadraticCurveTo(-w, -hh * 0.5, Math.sin(t + i) * 4, -hh);
			ctx.quadraticCurveTo(w, -hh * 0.5, w, 0);
			ctx.ellipse(0, 0, w, w * 0.45, 0, 0, Math.PI);
			ctx.fill();
		}
	}
};
SYM.FXbourgeon = {
	w: 30, h: 30, frames: 40, labels: { explode: 10, death: 25 },
	init(c) { c.playing = true; },
	actions: { 9: c => c.gotoAndPlay(1), 24: c => c.stop(), 40: c => c.removeMovieClip() },
	draw(ctx, c) {
		const f = c.frame;
		let s = 1, a = 1;
		if (f < 10) s = 1 + 0.08 * Math.sin(f / 9 * TAU);
		else if (f < 25) s = 1 + (f - 10) / 14 * 0.4;
		else { s = 1.4 - (f - 25) / 15 * 1.2; a = 1 - (f - 25) / 15; }
		ctx.globalAlpha *= a;
		ctx.fillStyle = "rgba(60,30,0,0.35)";
		ctx.beginPath(); ctx.ellipse(0, 4, 16 * s, 7 * s, 0, 0, TAU); ctx.fill();
		ctx.scale(s, s);
		ctx.fillStyle = "#6a9a2a";
		for (let i = 0; i < 4; i++) {
			ctx.save();
			ctx.rotate(i * Math.PI / 2 + (f >= 10 ? 0.4 : 0));
			ctx.beginPath(); ctx.ellipse(0, -9, 5, 10, 0, 0, TAU); ctx.fill();
			ctx.restore();
		}
		G.ball(ctx, 0, 0, 7, "#b8e070", "#3a6a10");
	}
};
SYM.FXLiane = {
	draw(ctx, c) {
		const l = c.len || 5;
		ctx.strokeStyle = "#5a8a1a";
		ctx.lineWidth = 4;
		ctx.lineCap = "round";
		ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l, 0); ctx.stroke();
		ctx.fillStyle = "#8ac040";
		ctx.beginPath(); ctx.ellipse(l / 2, -4, 4, 2, 0.5, 0, TAU); ctx.fill();
	}
};
SYM.FXWind = {
	w: 40, h: 20,
	draw(ctx) {
		ctx.strokeStyle = "rgba(255,255,255,0.8)";
		ctx.lineWidth = 3;
		ctx.lineCap = "round";
		ctx.beginPath(); ctx.arc(-10, 12, 22, -1.6, -0.6); ctx.stroke();
		ctx.lineWidth = 2;
		ctx.beginPath(); ctx.arc(-14, 18, 24, -1.5, -0.8); ctx.stroke();
	}
};

// ---------------------------------------------------------------------------
// Tourneboule (final boss). The timeline drives the boss logic :
// animDone() at the end of each animation, kataDone() in the middle of a kata.
const TB = { idle: 1, stopFly: 2, startFly: 22, fly: 37, flyVanish: 57, flyVanishEnd: 65, kata: 66, death: 210 };
const KATA_LEN = 24;
const tbLabels = { stopFly: TB.stopFly, startFly: TB.startFly, fly: TB.fly, flyVanish: TB.flyVanish, flyVanishEnd: TB.flyVanishEnd, death: TB.death };
for (let k = 1; k <= 6; k++) tbLabels["kata" + k] = TB.kata + (k - 1) * KATA_LEN;
const tbActions = {
	1: c => c.stop(),
	21: c => { c.stop(); c.animDone && c.animDone(); },
	36: c => { c.animDone && c.animDone(); },
	56: c => { c.animDone && c.animDone(); },
	65: c => c.gotoAndPlay(TB.flyVanish),
	249: c => { c.stop(); c.animDone && c.animDone(); }
};
for (let k = 1; k <= 6; k++) {
	const s = TB.kata + (k - 1) * KATA_LEN;
	tbActions[s + 14] = c => { c.kataDone && c.kataDone(); };
	tbActions[s + KATA_LEN - 1] = c => { c.animDone && c.animDone(); };
}
function tbPose(f) {
	// returns { alt, spin, kata, k }
	if (f >= TB.stopFly && f < TB.startFly) { const k = (f - TB.stopFly) / 19; return { alt: 60 * (1 - k) * (1 - k), spin: (1 - k) * 3 }; }
	if (f >= TB.startFly && f < TB.fly) { const k = (f - TB.startFly) / 14; return { alt: 60 * k * k, spin: 1 + k * 2 }; }
	if (f >= TB.fly && f < TB.flyVanish) return { alt: 60 + Math.sin((f - TB.fly) / 20 * TAU) * 6, spin: 3 };
	if (f >= TB.flyVanish && f < TB.kata) return { alt: 60, spin: 3 };
	if (f >= TB.kata && f < TB.death) {
		const i = f - TB.kata;
		return { alt: 0, spin: 0, kata: 1 + ((i / KATA_LEN) | 0), k: (i % KATA_LEN) / (KATA_LEN - 1) };
	}
	if (f >= TB.death) return { alt: 0, spin: 4, death: (f - TB.death) / 39 };
	return { alt: 0, spin: 0 };
}
const KATA_COLORS = ["#ffffff", "#e8fff0", "#ff6a2a", "#5ac8ff", "#b08a4a", "#b070ff", "#7ad84a"];
SYM.tourneboule = {
	w: 70, h: 70, frames: 249, labels: tbLabels, actions: tbActions,
	draw(ctx, c) {
		const p = tbPose(c.frame);
		const t = (MB2.frameCount || 0);
		if (p.death !== undefined) {
			ctx.globalAlpha *= 1 - p.death;
			ctx.scale(1 + p.death, 1 - p.death * 0.8);
		}
		ctx.translate(0, -p.alt);
		const rot = p.spin ? t * 0.25 * p.spin : 0;
		// kata aura
		if (p.kata) {
			const col = KATA_COLORS[p.kata];
			const r = 26 + Math.sin(p.k * Math.PI) * 14;
			const g = ctx.createRadialGradient(0, 0, 10, 0, 0, r + 8);
			g.addColorStop(0, "rgba(255,255,255,0)");
			g.addColorStop(0.7, col);
			g.addColorStop(1, "rgba(255,255,255,0)");
			ctx.globalAlpha *= 0.9;
			ctx.fillStyle = g;
			G.circle(ctx, 0, 0, r + 8); ctx.fill();
			ctx.globalAlpha /= 0.9;
		}
		// hands
		const hand = (a, d) => G.ball(ctx, Math.cos(a) * d, Math.sin(a) * d, 6, "#ffffff", "#9a90b0");
		if (p.kata) {
			const k = p.k;
			const poses = [
				null,
				[-Math.PI / 2 - k * 3, -Math.PI / 2 + k * 3],
				[k * TAU, Math.PI + k * TAU],
				[-0.3 - Math.sin(k * Math.PI) * 1.2, Math.PI + 0.3 + Math.sin(k * Math.PI) * 1.2],
				[Math.PI / 2 + Math.sin(k * TAU) * 1.5, Math.PI / 2 - Math.sin(k * TAU) * 1.5],
				[-Math.PI / 2 + Math.sin(k * 3 * Math.PI) * 0.8, Math.PI / 2 - Math.sin(k * 3 * Math.PI) * 0.8],
				[Math.PI + k * Math.PI, -k * Math.PI]
			][p.kata];
			hand(poses[0], 30);
			hand(poses[1], 30);
		} else {
			hand(rot + 0.3, 29);
			hand(rot + Math.PI + 0.3, 29);
		}
		// body : a spinning top ball
		ctx.save();
		ctx.rotate(rot);
		G.ball(ctx, 0, 0, 22, "#ffffff", "#8a84a0", "#ffffff");
		ctx.strokeStyle = "rgba(120,110,150,0.6)";
		ctx.lineWidth = 1.5;
		ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.stroke();
		ctx.restore();
		// mask
		ctx.fillStyle = "#7a2ab0";
		ctx.beginPath();
		ctx.moveTo(-21, -8); ctx.quadraticCurveTo(0, -14, 21, -8); ctx.lineTo(19, 2); ctx.quadraticCurveTo(0, -3, -19, 2); ctx.closePath();
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.beginPath(); ctx.ellipse(-8, -5, 4, 2.5, 0.2, 0, TAU); ctx.ellipse(8, -5, 4, 2.5, -0.2, 0, TAU); ctx.fill();
		ctx.fillStyle = "#000";
		G.circle(ctx, -7, -5, 1.6); ctx.fill();
		G.circle(ctx, 7, -5, 1.6); ctx.fill();
		// ribbon
		ctx.strokeStyle = "#7a2ab0"; ctx.lineWidth = 3; ctx.lineCap = "round";
		const w = Math.sin(t / 4) * 4;
		ctx.beginPath(); ctx.moveTo(20, -6); ctx.quadraticCurveTo(30, -10 + w, 36, -4 - w); ctx.stroke();
	}
};
SYM.TBShadow = {
	w: 70, h: 30, frames: 249, labels: tbLabels,
	actions: { 1: c => c.stop(), 21: c => c.stop(), 65: c => c.gotoAndPlay(TB.flyVanish), 249: c => c.stop() },
	draw(ctx, c) {
		const p = tbPose(c.frame);
		const s = 1 - p.alt / 150;
		ctx.fillStyle = "rgba(40,0,60," + (0.3 * s) + ")";
		ctx.beginPath(); ctx.ellipse(0, 18, 26 * s, 9 * s, 0, 0, TAU); ctx.fill();
	}
};
SYM.forceBubble = {
	w: 80, h: 80,
	draw(ctx) {
		const g = ctx.createRadialGradient(-10, -14, 4, 0, 0, 38);
		g.addColorStop(0, "rgba(255,255,255,0.8)");
		g.addColorStop(0.7, "rgba(160,220,255,0.25)");
		g.addColorStop(1, "rgba(120,180,255,0.7)");
		ctx.fillStyle = g;
		G.circle(ctx, 0, 0, 38); ctx.fill();
		ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke();
	}
};
function puff(reverse) {
	return {
		w: 60, h: 60, frames: 20,
		init(c) { c.playing = true; },
		actions: { 20: c => { c.removeMovieClip(); if (c.animDone) c.animDone(); } },
		draw(ctx, c) {
			let k = (c.frame - 1) / 19;
			if (reverse) k = 1 - k;
			ctx.globalAlpha *= reverse ? k : 1 - k;
			ctx.fillStyle = "rgba(230,220,255,0.9)";
			for (let i = 0; i < 7; i++) {
				const a = i * TAU / 7;
				G.circle(ctx, Math.cos(a) * 30 * k, Math.sin(a) * 30 * k - 20, 10 + 10 * k);
				ctx.fill();
			}
		}
	};
}
SYM.TBVanish = puff(false);
SYM.TBSpawn = puff(true);

})();
