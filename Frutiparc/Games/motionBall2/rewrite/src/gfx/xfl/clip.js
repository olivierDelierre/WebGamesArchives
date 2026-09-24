/**
 * A playing instance of a symbol of the original Flash files : its timeline
 * (frame, playing or stopped, frame scripts), its nested movie clips, and its
 * drawing.
 *
 *   const clip = new Clip(library, "bnormal");
 *   clip.gotoAndPlay("hit");       // labels or frame numbers (0-based)
 *   clip.update(dt);               // advances at the frame rate of the file (40 / s)
 *   clip.draw(ctx);                // draws at the origin of ctx
 *
 * The game drives the named parts of a symbol like the original code did
 * (`clip.set("aig", { rotation: 90 })`), reads its variables (`clip.vars`,
 * e.g. flOpen), and hears its callbacks (`clip.on = name => ...`, e.g.
 * "animDone"). Unlike Flash, only the scripts translated by the converter
 * run (see tools/xfl/convert.js translateScript).
 *
 * Nested movie clips play by themselves ; graphic symbols follow the frame of
 * their parent. A motion tween interpolates the matrix and colour of the
 * elements between two keyframes (with the easing of the tween).
 */

import { drawShape, drawText, withColor, isIdentityColor, combineColor, lerpColor, interpolateMatrix, clipToMask, unionBounds } from "./render.js";

const MAX_GOTO_DEPTH = 8;

export class Clip {

	/**
	 * @param lib     the XflLibrary
	 * @param name    symbol name or linkage
	 * @param parent  (internal) the clip containing this one
	 */
	constructor(lib, name, parent = null) {
		this.lib = lib;
		this.name = name;
		this.symbol = lib.symbol(name);
		if (!this.symbol)
			throw new Error("unknown symbol " + name);
		this.parent = parent;
		this.frame = 0;
		this.playing = true;
		this.removed = false;
		this.vars = {};
		this.overrides = {};         // instance name -> { x, y, rotation, xscale, yscale, alpha, visible }
		this.texts = {};             // dynamic texts : variable or instance name -> string
		this.children = new Map();   // nested clips, by depth
		this.on = null;              // (event, clip) => void : callbacks of the scripts
		this.time = 0;
		this.enter(0, 0);
		this.syncChildren(false);
	}

	get totalFrames() {
		return this.symbol.frames;
	}

	/** Frame number of a label (or the number itself). */
	frameOf(target) {
		if (typeof target === "number")
			return Math.max(0, Math.min(this.totalFrames - 1, target));
		const f = this.symbol.labels[target];
		if (f === undefined)
			throw new Error(this.name + " : no label " + target);
		return f;
	}

	hasLabel(label) {
		return this.symbol.labels[label] !== undefined;
	}

	/** Is the playhead inside the animation starting at `label` (up to the next label) ? */
	inLabel(label) {
		const start = this.symbol.labels[label];
		if (start === undefined || this.frame < start)
			return false;
		const next = Object.values(this.symbol.labels).filter(f => f > start).sort((a, b) => a - b)[0];
		return next === undefined || this.frame < next;
	}

	// ----- timeline control -----

	gotoAndPlay(target) {
		this.playing = true;
		this.enter(this.frameOf(target), 0);
		this.syncChildren(false);
	}

	gotoAndStop(target) {
		this.playing = false;
		this.enter(this.frameOf(target), 0);
		this.syncChildren(false);
	}

	play() {
		this.playing = true;
	}

	stop() {
		this.playing = false;
	}

	/** Advances the timeline by `dt` seconds (whole frames, at the frame rate of the file). */
	update(dt) {
		this.time += dt;
		const step = 1 / (this.lib.data.frameRate || 40);
		while (this.time >= step) {
			this.time -= step;
			this.tick();
		}
	}

	/** One frame. */
	tick() {
		if (this.removed)
			return;
		if (this.playing && this.totalFrames > 1)
			this.enter(this.frame + 1 >= this.totalFrames ? 0 : this.frame + 1, 0);
		this.syncChildren(true);
	}

	/** Goes to a frame and runs its script. */
	enter(frame, depth) {
		this.frame = frame;
		const ops = this.symbol.scripts[frame];
		if (!ops || depth > MAX_GOTO_DEPTH || this.controlled)
			return;
		for (const op of ops) {
			if (this.run(op, depth))
				return;
		}
	}

	/** Runs one operation of a frame script ; returns true when it jumped to another frame. */
	run(op, depth) {
		const v = this.vars;
		const jump = (target, play) => {
			this.playing = play;
			this.enter(this.frameOf(target), depth + 1);
			return true;
		};
		switch (op[0]) {
		case "stop":
			this.playing = false;
			return false;
		case "play":
			this.playing = true;
			return false;
		case "goto":
			return jump(op[1], op[2]);
		case "gotoRel":
			return jump(this.frame + op[1], op[2]);
		case "randomFrame":
			return jump(Math.floor(Math.random() * this.totalFrames), false);
		case "remove":
			this.removed = true;
			this.emit("remove");
			return true;
		case "removeParent":
			if (this.parent) {
				this.parent.removed = true;
				this.parent.emit("remove");
			}
			return true;
		case "call":
			this.emit(op[1]);
			return false;
		case "set":
			v[op[1]] = op[2];
			return false;
		case "setParent":
			if (this.parent)
				this.parent.vars[op[1]] = op[2];
			return false;
		case "counter":
			v.compt = op[1];
			return false;
		case "counterRandom":
			v.compt = Math.floor(Math.random() * op[1]);
			return false;
		case "countdown":
			if ((v.compt = (v.compt || 0) - 1) >= 0)
				return jump(this.frame + op[1], true);
			return false;
		case "loopUnlessRandom":
			if (Math.floor(Math.random() * op[1]) > 0)
				return jump(this.frame + op[2], true);
			return false;
		case "stopUnlessRandom":
			if (Math.floor(Math.random() * op[1]) > 0)
				this.playing = false;
			return false;
		case "loopIf":
			if (v[op[1]])
				return jump(op[2], true);
			return false;
		case "randomFlipY":
			v._flipY = Math.random() < 0.5 ? -1 : 1;
			return false;
		case "randomRotate":
			v._rotate = (v._rotate || 0) + Math.floor(Math.random() * op[1]);
			return false;
		case "childPlay": {
			const c = this.child(op[1]);
			if (c)
				c.play();
			return false;
		}
		case "childGoto": {
			const c = this.child(op[1]);
			if (c)
				c.gotoAndPlay(op[2]);
			return false;
		}
		default:
			return false;
		}
	}

	/** Sends a script callback to the first clip up the tree that listens. */
	emit(event) {
		for (let c = this; c; c = c.parent) {
			if (c.on) {
				c.on(event, this);
				return;
			}
		}
	}

	// ----- the elements of the current frame -----

	/**
	 * The elements of a layer at the current frame (interpolated during a
	 * motion tween). Returns { els, start } or null.
	 */
	layerElements(layer, frame = this.frame) {
		const frames = layer.frames;
		let k = -1;
		for (let i = 0; i < frames.length; i++) {
			if (frames[i].i <= frame && frame < frames[i].i + frames[i].n) {
				k = i;
				break;
			}
		}
		if (k < 0)
			return null;
		const fr = frames[k];
		const next = frames[k + 1];
		if (fr.tw === undefined || !next || next.i !== fr.i + fr.n || frame === fr.i)
			return { els: fr.els, start: fr.i };

		// motion tween : Flash easing, -100 (ease in) .. 100 (ease out)
		let t = (frame - fr.i) / fr.n;
		t += (fr.tw / 100) * t * (1 - t);
		const els = fr.els.map((a, i) => {
			const b = next.els[i];
			if (!b || b.t !== a.t || a.t !== "sym" || b.s !== a.s)
				return a;
			return {
				...a,
				m: interpolateMatrix(a.m, b.m, t),
				c: (a.c || b.c) ? lerpColor(a.c, b.c, t) : undefined
			};
		});
		return { els, start: fr.i };
	}

	/**
	 * Creates / updates the nested clips of the current frame. Movie clips
	 * play by themselves (`tick`), graphics follow this clip's frame.
	 */
	syncChildren(tick) {
		const alive = new Set();
		this.symbol.layers.forEach((layer, li) => {
			const cur = this.layerElements(layer);
			if (!cur)
				return;
			cur.els.forEach((el, ei) => {
				if (el.t !== "sym")
					return;
				const key = li + ":" + ei + ":" + el.s;
				alive.add(key);
				let c = this.children.get(key);
				const created = !c;
				if (created) {
					c = new Clip(this.lib, el.s, this);
					c.instanceName = el.n;
					if (el.g)
						c.controlled = true;
					this.children.set(key, c);
				}
				if (el.g) {
					// a graphic : its frame follows ours
					const total = c.totalFrames;
					let f = el.g.first + (this.frame - cur.start);
					if (el.g.loop === "single frame")
						f = el.g.first;
					else if (el.g.loop === "play once")
						f = Math.min(f, total - 1);
					else
						f = ((f % total) + total) % total;
					c.frame = f;
					c.syncChildren(tick);
				} else if (tick && !created) {
					c.tick();
				}
			});
		});
		for (const k of this.children.keys())
			if (!alive.has(k))
				this.children.delete(k);
	}

	/** The nested clip with this instance name, in the current frame (or null). */
	child(name) {
		for (const c of this.children.values())
			if (c.instanceName === name)
				return c;
		for (const c of this.children.values()) {
			const found = c.controlled ? c.child(name) : null;
			if (found)
				return found;
		}
		return null;
	}

	/**
	 * Overrides properties of a named part : x, y, rotation (degrees), xscale,
	 * yscale (1 = 100 %), alpha, visible. The part may be inside a nested clip.
	 */
	set(name, props) {
		this.overrides[name] = { ...this.overrides[name], ...props };
	}

	/** Sets the text of a dynamic text field (by variable or instance name ; in nested clips too). */
	setText(name, text) {
		this.texts[name] = String(text);
	}

	/** A value set on this clip or on a clip containing it (overrides, texts). */
	lookup(table, name) {
		if (name === undefined)
			return undefined;
		for (let c = this; c; c = c.parent) {
			const v = c[table][name];
			if (v !== undefined)
				return v;
		}
		return undefined;
	}

	// ----- drawing -----

	/** Draws the clip at the origin of ctx, with an optional colour transform. */
	draw(ctx, color = null) {
		if (this.removed)
			return;
		if (color && !isIdentityColor(color)) {
			withColor(ctx, color, lc => this.draw(lc), this.bounds());
			return;
		}
		const lib = this.lib;
		const layers = this.symbol.layers;
		const v = this.vars;
		if (v._flipY || v._rotate) {
			ctx.save();
			if (v._rotate)
				ctx.rotate(v._rotate * Math.PI / 180);
			if (v._flipY)
				ctx.scale(1, v._flipY);
		}

		layers.forEach((layer, li) => {
			if (layer.mask)
				return;
			const cur = this.layerElements(layer);
			if (!cur || !cur.els.length)
				return;
			const masked = layer.maskedBy !== undefined;
			if (masked) {
				ctx.save();
				const mask = this.layerElements(layers[layer.maskedBy]);
				if (mask)
					clipToMask(ctx, lib, mask.els, this, layer.maskedBy);
			}
			cur.els.forEach((el, ei) => this.drawElement(ctx, el, li, ei));
			if (masked)
				ctx.restore();
		});

		if (v._flipY || v._rotate)
			ctx.restore();
	}

	/**
	 * The local bounds [x0, y0, x1, y1] of what the clip draws at its current
	 * frame (null when it draws nothing) : the colour transforms only work on
	 * that part of the canvas.
	 */
	bounds() {
		if (this.removed)
			return null;
		let acc = null;
		this.symbol.layers.forEach((layer, li) => {
			if (layer.mask)
				return;
			const cur = this.layerElements(layer);
			if (!cur)
				return;
			cur.els.forEach((el, ei) => {
				let m = el.m;
				const o = el.n ? this.lookup("overrides", el.n) : null;
				if (o) {
					if (o.visible === false)
						return;
					m = applyOverride(m, o);
				}
				let b = null;
				switch (el.t) {
				case "shape":
					b = this.lib.shape(el.id)?.bounds;
					break;
				case "bmp": {
					const bmp = this.lib.bitmap(el.b);
					b = bmp ? [0, 0, bmp.w, bmp.h] : null;
					break;
				}
				case "text":
					b = [0, 0, el.w || 0, el.h || 0];
					break;
				case "sym":
					b = this.children.get(li + ":" + ei + ":" + el.s)?.bounds();
					break;
				}
				acc = unionBounds(acc, b, m);
			});
		});
		// (the rotation / flip of the "randomRotate" / "randomFlipY" scripts)
		const v = this.vars;
		if (acc && (v._rotate || v._flipY)) {
			const r = Math.max(...acc.map(Math.abs));
			acc = [-r * 1.5, -r * 1.5, r * 1.5, r * 1.5];
		}
		return acc;
	}

	drawElement(ctx, el, li, ei) {
		const lib = this.lib;
		let m = el.m;
		const o = el.n ? this.lookup("overrides", el.n) : null;
		if (o) {
			if (o.visible === false)
				return;
			m = applyOverride(m, o);
		}

		ctx.save();
		if (m)
			ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);

		switch (el.t) {
		case "shape":
			drawShape(ctx, lib, lib.shape(el.id));
			break;
		case "bmp": {
			const b = lib.bitmap(el.b);
			if (b && b.img) {
				ctx.imageSmoothingEnabled = b.smooth !== false;
				ctx.drawImage(b.img, 0, 0, b.w, b.h);
			}
			break;
		}
		case "text":
			drawText(ctx, el, el.dyn ? (this.lookup("texts", el.v) ?? this.lookup("texts", el.n) ?? this.vars[el.v]) : null);
			break;
		case "sym": {
			const c = this.children.get(li + ":" + ei + ":" + el.s);
			if (!c)
				break;
			// (a nested transform applies over the parent's, drawn offscreen)
			let ct = el.c || null;
			if (o && o.alpha !== undefined)
				ct = combineColor(ct, { am: o.alpha, rm: 1, gm: 1, bm: 1, ao: 0, ro: 0, go: 0, bo: 0 });
			if (ct && !isIdentityColor(ct))
				withColor(ctx, ct, lc => c.draw(lc), c.bounds());
			else
				c.draw(ctx);
			break;
		}
		}
		ctx.restore();
	}
}

/** A matrix with some of its properties replaced by the code (like _x, _rotation...). */
function applyOverride(m, o) {
	const [a, b, c, d, tx, ty] = m || [1, 0, 0, 1, 0, 0];
	let sx = Math.hypot(a, b);
	let sy = Math.hypot(c, d);
	let rot = Math.atan2(b, a);
	const skew = Math.atan2(-c, d) - rot;
	if (o.xscale !== undefined)
		sx = o.xscale;
	if (o.yscale !== undefined)
		sy = o.yscale;
	if (o.rotation !== undefined)
		rot = o.rotation * Math.PI / 180;
	const r2 = rot + skew;
	return [
		sx * Math.cos(rot), sx * Math.sin(rot),
		-sy * Math.sin(r2), sy * Math.cos(r2),
		o.x !== undefined ? o.x : tx,
		o.y !== undefined ? o.y : ty
	];
}
