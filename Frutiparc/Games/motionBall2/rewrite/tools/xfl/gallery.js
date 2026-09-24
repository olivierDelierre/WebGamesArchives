/**
 * The symbol gallery (xfl-gallery.html) : every exported symbol of mb2.fla,
 * playing, to check the conversion. Click a symbol to step through its labels.
 * Build : npm run gallery
 */
import { app } from "../../src/app.js";
import { ImageStore } from "../../src/engine/assets.js";
import { symbols, xflBitmapFiles, Clip } from "../../src/gfx/xfl/index.js";

const params = new URLSearchParams(location.search);
const ZOOM = +(params.get("zoom") || 1);
const CELL = 150 * ZOOM;
const COLS = +(params.get("cols") || 8);

app.images = new ImageStore("assets/img/");
app.images.load(xflBitmapFiles(), () => { }).then(start);

function start() {
	const names = Object.keys(symbols.data.linkage).sort();
	const only = params.get("only");
	const list = only ? names.filter(n => only.split(",").includes(n)) : names;
	const canvas = document.getElementById("c");
	const rows = Math.ceil(list.length / COLS);
	canvas.width = COLS * CELL;
	canvas.height = rows * CELL;
	const ctx = canvas.getContext("2d");
	const clips = list.map(n => {
		const c = new Clip(symbols, n);
		c.labelIndex = -1;
		return c;
	});
	window.gallery = { clips, list };

	canvas.addEventListener("click", e => {
		const r = canvas.getBoundingClientRect();
		const i = Math.floor((e.clientY - r.top) / CELL) * COLS + Math.floor((e.clientX - r.left) / CELL);
		const c = clips[i];
		if (!c)
			return;
		const labels = Object.keys(c.symbol.labels);
		c.labelIndex = (c.labelIndex + 1) % (labels.length + 1);
		if (c.labelIndex === labels.length)
			c.gotoAndPlay(0);
		else
			c.gotoAndPlay(labels[c.labelIndex]);
	});

	let last = performance.now();
	const frame = now => {
		const dt = Math.min(0.1, (now - last) / 1000);
		last = now;
		ctx.fillStyle = "#ADE67D";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		clips.forEach((c, i) => {
			const x = (i % COLS) * CELL;
			const y = Math.floor(i / COLS) * CELL;
			if (!window.frozen)
				c.update(dt);
			ctx.save();
			ctx.beginPath();
			ctx.rect(x, y, CELL, CELL);
			ctx.clip();
			ctx.strokeStyle = "rgba(0,0,0,0.15)";
			ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
			ctx.translate(x + CELL / 2, y + CELL / 2 + 8);
			ctx.scale(ZOOM, ZOOM);
			const big = ["background", "border", "ground", "fondMenu", "intro_bg", "carte", "pause", "loading", "cadreInfo", "panGameOver", "title", "logoBg"];
			if (big.includes(list[i]))
				ctx.scale(0.22, 0.22);
			if (list[i] === "background" || list[i] === "border" || list[i] === "ground")
				ctx.translate(-305, -205);
			c.draw(ctx);
			ctx.restore();
			ctx.fillStyle = "#000";
			ctx.font = "11px sans-serif";
			ctx.fillText(list[i] + " " + (c.frame + 1) + "/" + c.totalFrames, x + 4, y + 12);
		});
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}
