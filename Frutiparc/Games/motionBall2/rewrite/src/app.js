/**
 * The services shared by the whole game, set up once by main.js :
 *
 *   app.screen   the canvas (engine/screen.js)
 *   app.input    keyboard / gamepad / touch (engine/input.js)
 *   app.audio    sounds and music (engine/audio.js)
 *   app.images   the bitmaps (engine/assets.js)
 *   app.save     the saved progression and settings (progress.js)
 *   app.scenes   the current screen (engine/scenes.js)
 *   app.time     seconds since the start (for idle animations)
 *
 * Game code imports `app` instead of passing these objects around.
 */

export const app = {
	screen: null,
	input: null,
	audio: null,
	images: null,
	save: null,
	scenes: null,
	time: 0
};
