#!/usr/bin/env node
/**
 * Browser smoke test : loads the built game (dist/) in Chromium, goes from
 * the title to the menu, starts every mode and every boss fight, and fails on
 * any error in the page.
 *
 * Needs Playwright : `npm install --no-save playwright && npx playwright install chromium`
 * (or set CHROMIUM_PATH to an installed Chromium). Run `npm run build` first.
 * Usage : npm run test:browser
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let chromium;
try {
	({ chromium } = await import("playwright"));
} catch (e) {
	console.log("skipped : playwright is not installed (npm install --no-save playwright)");
	process.exit(0);
}

// ----- a static server for the game folder -----

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".wav": "audio/wav" };
const server = http.createServer((req, res) => {
	const file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
	if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
		res.writeHead(404);
		res.end();
		return;
	}
	res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
	fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, resolve));
const url = "http://localhost:" + server.address().port + "/index.html";

// ----- the test -----

const browser = await chromium.launch({
	executablePath: process.env.CHROMIUM_PATH || undefined,
	args: ["--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage({ viewport: { width: 640, height: 440 } });
const errors = [];
page.on("pageerror", e => errors.push("page error : " + e.message));
page.on("console", m => {
	// (failed loads are checked below, by their address)
	if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
		errors.push("console : " + m.text());
});
// every file of the game must load (the web font may not, without network access)
page.on("response", r => {
	if (r.status() >= 400 && r.url().startsWith("http://localhost"))
		errors.push("missing file : " + r.url());
});
page.on("requestfailed", r => {
	if (r.url().startsWith("http://localhost"))
		errors.push("failed load : " + r.url());
});

const wait = ms => page.waitForTimeout(ms);
const check = (ok, what) => {
	if (!ok)
		errors.push("failed : " + what);
	console.log((ok ? "ok      " : "FAILED  ") + what);
};

await page.goto(url);
await page.waitForFunction(() => window.motionball && window.motionball.scenes && window.motionball.scenes.current, null, { timeout: 15000 });
check(await page.evaluate(() => motionball.scenes.current.constructor.name) === "TitleScene", "title screen");

await page.mouse.click(300, 200);
await wait(800);
check(await page.evaluate(() => motionball.scenes.current.constructor.name) === "MenuScene", "menu after a click");

const modes = [["challenge", 0], ["adventure", 0], ["adventure", 4], ["course", 0], ["classic", 0], ["tutorial", 0]];
for (const [mode, param] of modes) {
	await page.evaluate(([m, p]) => motionball.play(m, p), [mode, param]);
	await page.keyboard.down("ArrowRight");
	await wait(600);
	await page.keyboard.up("ArrowRight");
	const state = await page.evaluate(() => {
		const g = motionball.scenes.current.game;
		return { state: g.state, x: g.ball.x };
	});
	check(state.state === "play" && state.x !== 305, mode + " " + param + " : playing, the ball moves");

	// the boss fight (none in Course mode)
	const boss = await page.evaluate(() => {
		const g = motionball.scenes.current.game;
		for (const { x, y, room } of g.dungeon.allRooms()) {
			if (room.type === 2) {
				g.room = new g.room.constructor(g, x, y, -1);
				g.ball.placeAt(305, 300);
				return true;
			}
		}
		return false;
	});
	if (boss) {
		await wait(2500);
		const b = await page.evaluate(() => {
			const g = motionball.scenes.current.game;
			return { boss: g.boss ? g.boss.constructor.name : null, state: g.state };
		});
		check(mode === "tutorial" ? b.state === "over" : !!b.boss, mode + " " + param + " : boss room (" + (b.boss || b.state) + ")");
	}

	// the pause
	await page.keyboard.press("Escape");
	await wait(200);
	check(await page.evaluate(() => !!motionball.scenes.current.paused || !!motionball.scenes.current.ending), mode + " : pause");
}

// something is drawn
const drawn = await page.evaluate(() => {
	const c = document.getElementById("game");
	const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
	const colours = new Set();
	for (let i = 0; i < data.length; i += 4 * 97)
		colours.add(data[i] + "," + data[i + 1] + "," + data[i + 2]);
	return colours.size;
});
check(drawn > 20, "the canvas is drawn (" + drawn + " colours)");

await browser.close();
server.close();

if (errors.length) {
	console.log("\n" + errors.join("\n"));
	process.exit(1);
}
console.log("\nall good");
