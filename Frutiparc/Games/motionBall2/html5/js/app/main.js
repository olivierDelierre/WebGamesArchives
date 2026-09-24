/*
 * Entry point : canvas setup, loading screen and main loop.
 *
 * TRICKY : the game logic must run at exactly 40 frames per second (all the
 * movements of the original are per frame). The loop below accumulates the
 * real time and runs as many 1/40 s logic steps as needed (at most 6 per
 * displayed frame, to survive a background tab), then draws once.
 *
 * Drawing is done in game coordinates (610 x 410) ; the canvas transform
 * scales them to the size of the window and to the pixel density.
 */
"use strict";

(function () {

	const Const = MB2.Const;
	const W = Const.LVL_WIDTH;
	const H = Const.LVL_HEIGHT;
	const MAX_STEPS = 6;

	MB2.start = function () {
		const canvas = document.getElementById("game");
		const ctx = canvas.getContext("2d");

		// ----- size -----

		function resize() {
			const wrap = canvas.parentElement;
			const buttons = document.getElementById("touch");
			const availableHeight = window.innerHeight - (buttons ? buttons.offsetHeight : 0) - 8;
			const scale = Math.max(0.3, Math.min(wrap.clientWidth / W, availableHeight / H));
			const dpr = window.devicePixelRatio || 1;
			canvas.style.width = Math.floor(W * scale) + "px";
			canvas.style.height = Math.floor(H * scale) + "px";
			canvas.width = Math.floor(W * scale * dpr);
			canvas.height = Math.floor(H * scale * dpr);
		}
		window.addEventListener("resize", resize);
		resize();

		const setGameTransform = () => {
			ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
			ctx.globalAlpha = 1;
		};

		// ----- loading -----

		let imagesProgress = 0;
		let soundsProgress = 0;

		function drawLoading() {
			setGameTransform();
			ctx.fillStyle = "#4a1a70";
			ctx.fillRect(0, 0, W, H);
			MB2.G.text(ctx, "MotionBall 2", W / 2, 170, 40, "#fff", "#2a0a40");
			ctx.fillStyle = "rgba(255,255,255,0.25)";
			ctx.fillRect(155, 230, 300, 14);
			ctx.fillStyle = "#9ae860";
			ctx.fillRect(155, 230, 300 * (imagesProgress + soundsProgress) / 2, 14);
		}
		drawLoading();

		MB2.Input.init(canvas);
		MB2.Sound.init();

		const fontsReady = (document.fonts && document.fonts.ready)
			? document.fonts.ready.catch(() => { })
			: Promise.resolve();

		Promise.all([
			MB2.loadImages(p => {
				imagesProgress = p;
				drawLoading();
			}),
			MB2.Sound.smanager.load(p => {
				soundsProgress = p;
				drawLoading();
			}),
			fontsReady
		]).then(() => {
			MB2.Manager.init();
			last = performance.now();
			requestAnimationFrame(frame);
		});

		// ----- main loop -----

		const STEP = 1000 / MB2.Std.FPS;
		let last = performance.now();
		let accumulated = 0;

		function frame(now) {
			accumulated += Math.min(250, now - last);
			last = now;

			let steps = 0;
			while (accumulated >= STEP && steps < MAX_STEPS) {
				MB2.Manager.main();
				accumulated -= STEP;
				steps++;
			}
			if (steps === MAX_STEPS)
				accumulated = 0;   // too late : drop the time instead of catching up

			setGameTransform();
			if (MB2.Manager.mode)
				MB2.Manager.mode.draw(ctx);

			requestAnimationFrame(frame);
		}
	};

})();
