/**
 * The check that keeps a name the compiler generates apart from the names a
 * module's source already uses.
 */

/**
 * Whether `source` has `name` as a whole identifier anywhere, so a generated
 * binding of that name could shadow or redeclare one the author wrote. An
 * identifier can spell its characters with Unicode escapes
 * (`App__st\u0061tic1` is `App__static1`), so the source is also read with
 * its escapes decoded. Decoding an escape in a string or a comment can only
 * make a name count as used when it isn't, which costs nothing.
 *
 * @param {string} source
 * @param {string} name a name of identifier characters only
 * @returns {boolean}
 */
export function source_mentions_identifier(source, name) {
	if (typeof source === 'string' && WORD.test(name)) {
		return read_source(source).words.has(name);
	}
	// `$` is an identifier character and a regex anchor.
	const escaped = name.replace(/\$/g, '\\$');
	const pattern = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
	return (
		pattern.test(source) ||
		(typeof source === 'string' &&
			source.includes('\\u') &&
			pattern.test(read_source(source).decoded))
	);
}

/** A name of the characters `read_source` splits on */
const WORD = /^[\w$]+$/;
const WORDS = /[\w$]+/g;
/** The last source `read_source` read */
let source_read = {
	source: '',
	decoded: '',
	words: /** @type {Set<string>} */ (new Set()),
};

/**
 * `source` with its escapes decoded, and the runs of `[\w$]` characters in
 * both. A name of those characters is one of them exactly when the regular
 * expression `(?<![\w$])name(?![\w$])` finds it, so each check is a lookup
 * instead of a scan of the source. A module's generated names are checked one
 * after another against the same source, so the last one read is kept.
 *
 * @param {string} source
 */
function read_source(source) {
	if (source_read.source !== source) {
		const decoded = source.includes('\\u') ? decode_unicode_escapes(source) : source;
		const words = new Set(source.match(WORDS));
		if (decoded !== source) for (const word of decoded.match(WORDS) ?? []) words.add(word);
		source_read = { source, decoded, words };
	}
	return source_read;
}

const UNICODE_ESCAPE = /\\u(?:\{([\da-fA-F]+)\}|([\da-fA-F]{4}))/g;

/**
 * `source` with each `\uXXXX` and `\u{X…}` escape replaced by its character.
 *
 * @param {string} source
 * @returns {string}
 */
function decode_unicode_escapes(source) {
	return source.replace(UNICODE_ESCAPE, (escape, braced, short) => {
		const code = parseInt(braced ?? short, 16);
		return code <= 0x10ffff ? String.fromCodePoint(code) : escape;
	});
}
