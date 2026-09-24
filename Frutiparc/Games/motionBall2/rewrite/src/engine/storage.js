/**
 * Persistent storage in localStorage, as JSON.
 *
 * localStorage can be missing or throw (private mode, blocked cookies, file://
 * in some browsers) : the game must work without it, so every access is
 * guarded and falls back to the in-memory copy.
 */

export class Storage {

	constructor(key, defaults) {
		this.key = key;
		this.data = structuredClone(defaults);
		try {
			const saved = JSON.parse(localStorage.getItem(key));
			if (saved && typeof saved === "object")
				this.data = deepMerge(this.data, saved);
		} catch (e) {
			// nothing saved, or no storage : keep the defaults
		}
	}

	save() {
		try {
			localStorage.setItem(this.key, JSON.stringify(this.data));
		} catch (e) {
			// no storage : the progression only lasts for this session
		}
	}
}

/** Copies the values of `saved` over `defaults`, keeping the keys of `defaults` that `saved` lacks. */
function deepMerge(defaults, saved) {
	if (Array.isArray(defaults) || typeof defaults !== "object" || defaults === null)
		return saved === undefined ? defaults : saved;
	const out = { ...defaults };
	for (const k of Object.keys(saved)) {
		out[k] = (k in defaults && typeof defaults[k] === "object" && defaults[k] !== null && !Array.isArray(defaults[k]))
			? deepMerge(defaults[k], saved[k])
			: saved[k];
	}
	return out;
}
