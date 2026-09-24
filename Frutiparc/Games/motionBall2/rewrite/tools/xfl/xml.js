/**
 * A minimal XML parser, enough for the XFL files : elements, attributes,
 * text and CDATA. Returns { name, attrs, children, text }.
 */

const ENTITIES = { lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'" };

function decode(s) {
	return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
		if (e[0] === "#")
			return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
		return ENTITIES[e] !== undefined ? ENTITIES[e] : m;
	});
}

export function parseXml(src) {
	const root = { name: "#root", attrs: {}, children: [], text: "" };
	const stack = [root];
	let i = 0;
	const n = src.length;

	while (i < n) {
		const lt = src.indexOf("<", i);
		if (lt < 0)
			break;
		if (lt > i)
			stack[stack.length - 1].text += decode(src.slice(i, lt));

		if (src.startsWith("<![CDATA[", lt)) {
			const end = src.indexOf("]]>", lt);
			stack[stack.length - 1].text += src.slice(lt + 9, end);
			i = end + 3;
		} else if (src.startsWith("<!--", lt)) {
			i = src.indexOf("-->", lt) + 3;
		} else if (src[lt + 1] === "?" || src[lt + 1] === "!") {
			i = src.indexOf(">", lt) + 1;
		} else if (src[lt + 1] === "/") {
			stack.pop();
			i = src.indexOf(">", lt) + 1;
		} else {
			// a start tag : name, attributes, maybe self-closing
			let j = lt + 1;
			while (j < n && !/[\s/>]/.test(src[j]))
				j++;
			const el = { name: src.slice(lt + 1, j), attrs: {}, children: [], text: "" };
			const attrRe = /\s*([\w:.-]+)\s*=\s*"([^"]*)"/y;
			for (;;) {
				attrRe.lastIndex = j;
				const m = attrRe.exec(src);
				if (!m)
					break;
				el.attrs[m[1]] = decode(m[2]);
				j = attrRe.lastIndex;
			}
			while (src[j] !== ">" && src[j] !== "/")
				j++;
			stack[stack.length - 1].children.push(el);
			if (src[j] === "/") {
				i = src.indexOf(">", j) + 1;
			} else {
				stack.push(el);
				i = j + 1;
			}
		}
	}
	return root.children[0];
}

/** The children of an element with a given name. */
export const kids = (el, name) => el ? el.children.filter(c => c.name === name) : [];

/** The first child with this name (or a path "a/b/c"). */
export function child(el, path) {
	for (const name of path.split("/")) {
		if (!el)
			return null;
		el = el.children.find(c => c.name === name) || null;
	}
	return el;
}
