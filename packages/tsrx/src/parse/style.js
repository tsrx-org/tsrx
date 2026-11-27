/** @import * as AST from 'estree' */
/** @import { NonEmptyString } from '../../types/helpers' */

import { strong_hash } from '../utils/hashing.js';
import { DIAGNOSTIC_CODES } from '../diagnostics.js';

const REGEX_MATCHER = /^[~^$*|]?=/;
const REGEX_ATTRIBUTE_FLAGS = /^[a-zA-Z]+/;
const REGEX_COMMENT_CLOSE = /\*\//;
const REGEX_HTML_COMMENT_CLOSE = /-->/;
const REGEX_PERCENTAGE = /^\d+(\.\d+)?%/;
const REGEX_COMBINATOR = /^(\+|~|>|\|\|)/;
const REGEX_VALID_IDENTIFIER_CHAR = /[a-zA-Z0-9_-]/;
const REGEX_LEADING_HYPHEN_OR_DIGIT = /^-?\d/;
const REGEX_WHITESPACE_OR_COLON = /[\s:]/;
// An escape, and the one space that ends a hex escape (`\r\n` too).
const REGEX_VALUE_ESCAPE = /\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[ \t\n\r\f])?|[^\n\r\f])/y;
// `--` and a name (letters, digits, `-`, `_`, non-ASCII, escapes), then `:`.
const REGEX_CUSTOM_PROPERTY_START = /^--(?:[\w-]|[^\x00-\x7f]|\\[^\n])*\s*:/;
// A name, a `:` and a `{`: a declaration whose value may be a `{}` block. The
// name starts as an identifier does and takes no escapes, which the
// declaration's reader reads differently (`a\:b`), and the whitespace is
// CSS's, so a `\u00a0`, part of a name, isn't.
const REGEX_BLOCK_VALUE_START =
	/^-?(?:[a-zA-Z_]|[^\x00-\x7f\s])(?:[\w-]|[^\x00-\x7f\s])*[ \t\n\r\f]*:[ \t\n\r\f]*(?=\{)/;
const REGEX_NTH_OF =
	/^(even|odd|\+?(\d+|\d*n(\s*[+-]\s*\d+)?)|-\d*n(\s*\+\s*\d+))((?=\s*[,)])|\s+of\s+)/;
// Up to six hex digits, then one optional whitespace that ends the escape
// https://www.w3.org/TR/css-syntax-3/#consume-escaped-code-point
const REGEX_HEX_ESCAPE = /^[0-9a-fA-F]{1,6}(\r\n|[ \t\n\r\f])?/;
// In a string, an escaped newline is a line continuation and decodes to nothing
const REGEX_ESCAPE = /\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\n\r\f])?|(\r\n|[\n\r\f])|([\s\S]))/g;

const regex_whitespace = /\s/;

class Parser {
	index = 0;
	// Whether, in loose mode, an at-rule's prelude has left a `(` or `[` open,
	// so its read ran to the end of the sheet.
	unclosed_prelude = false;
	// Whether the selector being read is one, as a rule's or an `:is()`'s are,
	// where `check_type_selector_placement` applies; not in the argument of a
	// pseudo-element (`::part(a b)`) or of another pseudo-class (an An+B), but
	// again in an `:is()` in one of those.
	selector = true;

	/**
	 * @param {string} template
	 * @param {boolean} loose
	 */
	constructor(template, loose) {
		if (typeof template !== 'string') {
			throw new TypeError('Template must be a string');
		}

		this.loose = loose;
		this.template_untrimmed = template;
		this.template = template.trimEnd();
	}

	/** @param {string} str */
	match(str) {
		const length = str.length;
		if (length === 1) {
			// more performant than slicing
			return this.template[this.index] === str;
		}

		return this.template.slice(this.index, this.index + length) === str;
	}

	/**
	 * @param {string} str
	 * @param {boolean} required
	 * @param {boolean} required_in_loose
	 */
	eat(str, required = false, required_in_loose = true) {
		if (this.match(str)) {
			this.index += str.length;
			return true;
		}

		if (required && (!this.loose || required_in_loose)) {
			throw new Error(`Expected ${str}`);
		}

		return false;
	}

	/**
	 * Match a regex at the current index
	 * @param {RegExp} pattern  Should have a ^ anchor at the start so the regex doesn't search past the beginning, resulting in worse performance
	 */
	match_regex(pattern) {
		const match = pattern.exec(this.template.slice(this.index));
		if (!match || match.index !== 0) return null;

		return match[0];
	}

	/**
	 * Search for a regex starting at the current index and return the result if it matches
	 * @param {RegExp} pattern  Should have a ^ anchor at the start so the regex doesn't search past the beginning, resulting in worse performance
	 */
	read(pattern) {
		const result = this.match_regex(pattern);
		if (result) this.index += result.length;
		return result;
	}

	allow_whitespace() {
		while (this.index < this.template.length && regex_whitespace.test(this.template[this.index])) {
			this.index++;
		}
	}

	/** @param {RegExp} pattern */
	read_until(pattern) {
		if (this.index >= this.template.length) {
			if (this.loose) return '';
			throw new Error('Unexpected end of input');
		}

		const start = this.index;
		const match = pattern.exec(this.template.slice(start));

		if (match) {
			this.index = start + match.index;
			return this.template.slice(start, this.index);
		}

		this.index = this.template.length;
		return this.template.slice(start);
	}
}

/**
 * @template {string} T
 * @param {string} content
 * @param {{
 *   filename: NonEmptyString<T>,
 *   line: number,
 *   column: number,
 *   body?: { start: number, line: number, column: number },
 * }} location position of the `<style>` tag in the source file, and optionally
 * `body`, the file offset and 1-based line / 0-based column of the style body's
 * first character. With `body`, the sheet records `sourceStart` and a
 * file-relative `loc`, and diagnostics on its nodes carry file positions, as
 * does a syntax error it throws.
 * @param {{ loose?: boolean }} options
 * @returns {AST.CSS.StyleSheet}
 */
export function parse_style(content, location, options) {
	const parser = new Parser(content, options.loose || false);

	// The filename and the position of the `<style>` tag keep the hash unique
	// when identical content appears in multiple style blocks within a file or
	// across files. The filename may be an absolute path, so this must be a
	// pre-image-resistant hash to avoid leaking file structure into the bundle.
	const hash_source = `${location.filename}:${location.line}:${location.column}:${content}`;

	/** @type {AST.CSS.StyleSheet} */
	const sheet = {
		source: content,
		hash: `tsrx-${strong_hash(hash_source)}`,
		type: 'StyleSheet',
		children: [],
		start: 0,
		end: content.length,
		filename: location.filename,
	};

	if (location.body) {
		sheet.sourceStart = location.body.start;
		sheet.loc = {
			start: { line: location.body.line, column: location.body.column },
			end: css_position(sheet, content.length, location.body),
		};
	}

	sheet.children = read_css_body(parser, sheet);

	return sheet;
}

/**
 * The rules of a style body. A CSS syntax error gets its code
 * (`DIAGNOSTIC_CODES.CSS_SYNTAX`) and the position where the parser stopped:
 * `pos`, its offset in the file, and `loc`, its line and column, for a sheet
 * with a `body` origin, and `pos` in the body for one without.
 * @param {Parser} parser
 * @param {AST.CSS.StyleSheet} sheet
 * @returns {Array<AST.CSS.Rule | AST.CSS.Atrule>}
 */
function read_css_body(parser, sheet) {
	try {
		return read_body(parser);
	} catch (error) {
		if (error instanceof Error && !(/** @type {{ code?: string }} */ (error).code)) {
			const css_error = /** @type {Error & {
				code?: string,
				pos?: number,
				loc?: { line: number, column: number },
			}} */ (error);
			css_error.code = DIAGNOSTIC_CODES.CSS_SYNTAX;
			css_error.pos = (sheet.sourceStart ?? 0) + parser.index;
			if (sheet.loc) css_error.loc = css_position(sheet, parser.index, sheet.loc.start);
		}
		throw error;
	}
}

/**
 * Map a style-body offset to a file line / column, given the file position of
 * the body's first character.
 *
 * @param {AST.CSS.StyleSheet} sheet
 * @param {number} offset
 * @param {{ line: number, column: number }} origin
 * @returns {{ line: number, column: number }}
 */
function css_position(sheet, offset, origin) {
	const source = sheet.source;
	let line = origin.line;
	let line_start = -1;
	for (let i = 0; i < offset; i++) {
		const ch = source.charCodeAt(i);
		if (ch === 13 && source.charCodeAt(i + 1) === 10) {
			i++;
		} else if (ch !== 10 && ch !== 13 && ch !== 0x2028 && ch !== 0x2029) {
			continue;
		}
		line++;
		line_start = i;
	}
	return {
		line,
		column: line_start === -1 ? origin.column + offset : offset - line_start - 1,
	};
}

/**
 * The file-relative `start` / `end` / `loc` of a CSS node in a sheet parsed
 * with a `body` origin; the node itself when the sheet has none. CSS node
 * offsets are relative to the style body, so this is what a diagnostic on a
 * CSS node has to be anchored on.
 *
 * @param {AST.CSS.StyleSheet | null | undefined} sheet
 * @param {AST.CSS.Node} node
 * @returns {AST.Node | AST.NodeWithLocation}
 */
export function css_node_source_position(sheet, node) {
	if (sheet?.sourceStart === undefined || !sheet.loc) {
		return /** @type {AST.Node} */ (/** @type {unknown} */ (node));
	}
	const origin = sheet.loc.start;
	return /** @type {AST.NodeWithLocation} */ (
		/** @type {unknown} */ ({
			start: node.start + sheet.sourceStart,
			end: node.end + sheet.sourceStart,
			loc: {
				start: css_position(sheet, node.start, origin),
				end: css_position(sheet, node.end, origin),
			},
		})
	);
}

/** @param {Parser} parser */
function allow_comment_or_whitespace(parser) {
	parser.allow_whitespace();
	while (parser.match('/*') || parser.match('<!--')) {
		if (parser.eat('/*')) {
			parser.read_until(REGEX_COMMENT_CLOSE);
			parser.eat('*/', true);
		}

		if (parser.eat('<!--')) {
			parser.read_until(REGEX_HTML_COMMENT_CLOSE);
			parser.eat('-->', true);
		}

		parser.allow_whitespace();
	}
}

/**
 * @param {Parser} parser
 * @returns {Array<AST.CSS.Rule | AST.CSS.Atrule>}
 */
function read_body(parser) {
	/** @type {Array<AST.CSS.Rule | AST.CSS.Atrule>} */
	const children = [];

	while (parser.index < parser.template.length) {
		try {
			allow_comment_or_whitespace(parser);

			if (parser.index >= parser.template.length) {
				break;
			}

			if (parser.match('@')) {
				children.push(read_at_rule(parser));
			} else {
				children.push(read_rule(parser));
			}
		} catch (error) {
			if (!parser.loose) {
				throw error;
			}
			// Partial CSS while typing (`.foo {`, `/*`), or whatever follows an
			// unclosed module-scope `<style>`, must not take the whole file down in
			// loose mode: keep the rules parsed so far and drop the rest.
			break;
		}
	}

	return children;
}

/**
 * @param {Parser} parser
 * @returns {AST.CSS.Atrule}
 */
function read_at_rule(parser) {
	const start = parser.index;
	parser.eat('@', true);

	const name = read_identifier(parser);

	const prelude = read_value(parser, true);

	/** @type {AST.CSS.Block | null} */
	let block = null;

	if (parser.match('{')) {
		// e.g. `@media (...) {...}`
		block = read_block(parser);
	} else {
		// e.g. `@import '...'`
		parser.eat(';', true);
	}

	return {
		type: 'Atrule',
		start,
		end: parser.index,
		name,
		prelude,
		block,
	};
}

/**
 * @param {Parser} parser
 * @returns {AST.CSS.Rule}
 */
function read_rule(parser) {
	const start = parser.index;

	return {
		type: 'Rule',
		prelude: read_selector_list(parser),
		block: read_block(parser),
		start,
		end: parser.index,
		metadata: {
			parent_rule: null,
			has_local_selectors: false,
			is_global_block: false,
		},
	};
}

/**
 * @param {Parser} parser
 * @returns {AST.CSS.Block}
 */
function read_block(parser) {
	const start = parser.index;

	parser.eat('{', true);

	/** @type {Array<AST.CSS.Declaration | AST.CSS.Rule | AST.CSS.Atrule>} */
	const children = [];

	while (parser.index < parser.template.length) {
		allow_comment_or_whitespace(parser);

		if (parser.match('}')) {
			break;
		} else if (parser.eat(';')) {
			// An empty declaration, as in `color: red;;`, which CSS allows.
			continue;
		} else {
			children.push(read_block_item(parser));
		}
	}

	parser.eat('}', true);

	return {
		type: 'Block',
		start,
		end: parser.index,
		children,
	};
}

/**
 * Reads a declaration, rule or at-rule
 *
 * @param {Parser} parser
 * @returns {AST.CSS.Declaration | AST.CSS.Rule | AST.CSS.Atrule}
 */
function read_block_item(parser) {
	if (parser.match('@')) {
		return read_at_rule(parser);
	}

	// A custom property's value may hold `{}` blocks (`--x: {a}`), which the
	// read-ahead below would take for a nested rule's. CSS reads an item that
	// starts with a custom property name and a `:` as a declaration.
	if (parser.match_regex(REGEX_CUSTOM_PROPERTY_START)) {
		return read_declaration(parser);
	}

	// So may another declaration's, if the block is all of it (CSS Syntax 3):
	// `initial-value: {a}` in a `@property` is a declaration, `a:{b} c {}` no
	// rule either, but `a:{b} c` isn't one.
	const head = parser.match_regex(REGEX_BLOCK_VALUE_START);
	if (head) {
		const start = parser.index;
		parser.index += head.length;
		const block = read_custom_property_value(parser, true);
		// Only whitespace and comments may follow; `<!--` and `-->` are tokens.
		while (parser.index < parser.template.length) {
			if (parser.eat('/*')) {
				const close = parser.template.indexOf('*/', parser.index);
				parser.index = close === -1 ? parser.template.length : close + 2;
			} else if (' \t\n\r\f'.includes(parser.template[parser.index])) {
				parser.index++;
			} else {
				break;
			}
		}
		const block_value = block !== '' && (parser.match(';') || parser.match('}'));
		parser.index = start;
		if (block_value) return read_declaration(parser, true);
	}

	// read ahead to understand whether we're dealing with a declaration or a nested rule.
	// this involves some duplicated work, but avoids a try-catch that would disguise errors
	const start = parser.index;
	read_value(parser);
	const char = parser.template[parser.index];
	parser.index = start;

	return char === '{' ? read_rule(parser) : read_declaration(parser);
}

/**
 * @param {Parser} parser
 * @param {boolean} [block_value] whether the value is a `{}` block, read as a
 *   custom property's is
 * @returns {AST.CSS.Declaration}
 */
function read_declaration(parser, block_value = false) {
	const start = parser.index;

	const property = parser.read_until(REGEX_WHITESPACE_OR_COLON);
	parser.allow_whitespace();
	parser.eat(':');
	let index = parser.index;
	parser.allow_whitespace();

	const value =
		block_value || property.startsWith('--')
			? read_custom_property_value(parser)
			: read_value(parser);

	if (!value && !property.startsWith('--') && !parser.loose) {
		throw new Error('CSS Declaration cannot be empty');
	}

	const end = parser.index;

	if (!parser.match('}')) {
		parser.eat(';', true);
	}

	return {
		type: 'Declaration',
		start,
		end,
		property,
		value,
	};
}

/**
 * Read a custom property's value, which may hold `{}`, `()` and `[]` blocks
 * (`--x: {a}`): it ends at a `;` or a `}` outside every block, string and
 * comment.
 *
 * @param {Parser} parser
 * @param {boolean} [one_block] read only the block the value starts with, to
 *   just after its `}`; or nothing, if a string in it ends at a newline, which
 *   CSS reads as a bad string
 * @returns {string}
 */
function read_custom_property_value(parser, one_block = false) {
	const start = parser.index;
	/** @type {string[]} */
	const closers = [];
	/** @type {null | '"' | "'"} */
	let quote_mark = null;
	const name = create_name_tracker();

	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];

		if (char === '\\') {
			// An escape, read whole, and the one space that ends a hex escape
			// (`\r\n` too); a `\` and a newline isn't one.
			const escape = /^\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[ \t\n\r\f])?|[^\n\r\f]?)/.exec(
				parser.template.slice(parser.index, parser.index + 9),
			);
			const text = escape?.[0] ?? char;
			if (quote_mark === null) {
				if (text.length > 1) track_escape(name, parser.template, parser.index, text);
				else track_name(name, parser.template, parser.index);
			}
			parser.index += text.length;
			// In a string, a `\` before a newline goes on to the next line.
			const next = parser.template[parser.index];
			if (
				one_block &&
				quote_mark !== null &&
				text.length === 1 &&
				(next === '\n' || next === '\r' || next === '\f')
			) {
				parser.index += parser.template.startsWith('\r\n', parser.index) ? 2 : 1;
			}
			continue;
		}
		const url =
			quote_mark === null && char === '(' && is_unquoted_url(name, parser.template, parser.index);
		if (quote_mark === null) track_name(name, parser.template, parser.index);
		if (quote_mark !== null) {
			if (char === quote_mark) quote_mark = null;
			else if (one_block && (char === '\n' || char === '\r' || char === '\f')) return '';
		} else if (char === '"' || char === "'") {
			quote_mark = char;
		} else if (char === '/' && parser.template[parser.index + 1] === '*') {
			const close = parser.template.indexOf('*/', parser.index + 2);
			if (close === -1) break;
			parser.index = close + 2;
			reset_name(name);
			continue;
		} else if (url) {
			// An unquoted url(), where `{`, `[` and `/*` are part of the URL: it
			// ends at the first `)` that isn't escaped.
			parser.index++;
			while (parser.index < parser.template.length && parser.template[parser.index] !== ')') {
				parser.index += parser.template[parser.index] === '\\' ? 2 : 1;
			}
			if (parser.index >= parser.template.length) {
				parser.index = parser.template.length;
				break;
			}
		} else if (char === '{' || char === '(' || char === '[') {
			closers.push(char === '{' ? '}' : char === '(' ? ')' : ']');
		} else if (closers.length > 0 && char === closers.at(-1)) {
			closers.pop();
			if (one_block && closers.length === 0) {
				parser.index++;
				return parser.template.slice(start, parser.index);
			}
		} else if (closers.length === 0 && (char === ';' || char === '}')) {
			return trim_value(parser.template.slice(start, parser.index));
		}

		parser.index++;
	}

	throw new Error('Unexpected end of input');
}

/**
 * The name a value has read up to the current character, as CSS's tokenizer
 * reads it, for telling an unquoted `url(`: `URL(`, `u\72l(` and `ur\6c (` are
 * one, `#url(`, `@url(`, `-url(`, `myurl(` and `<!--url(` aren't.
 *
 * @typedef {{ name: string, hex: number, escaped: boolean, after_cr: boolean, prefixed: boolean }} NameTracker
 */

/** @returns {NameTracker} */
function create_name_tracker() {
	return { name: '', hex: 0, escaped: false, after_cr: false, prefixed: false };
}

/**
 * Read `source[index]`, which is outside a string, a comment and a url(), into
 * the tracker.
 *
 * @param {NameTracker} tracker
 * @param {string} source
 * @param {number} index
 */
function track_name(tracker, source, index) {
	const code = source.charCodeAt(index);
	const after_cr = tracker.after_cr;
	tracker.after_cr = false;
	if (after_cr && code === 10) {
		// `\r\n` is the one space that ends a hex escape.
		tracker.name += '\n';
	} else if (tracker.escaped) {
		tracker.escaped = false;
		if (code === 10 || code === 12 || code === 13) {
			// A `\` and a newline isn't an escape: it ends the name.
			reset_name(tracker);
		} else {
			if (tracker.name === '') tracker.prefixed = is_hash_or_at(source, index - 2);
			tracker.name += '\\' + source[index];
			tracker.hex = is_hex_digit(code) ? 1 : 0;
		}
	} else if (code === 92) {
		// A `\`: the next character goes with it.
		tracker.escaped = true;
	} else if (tracker.hex > 0 && tracker.hex < 6 && is_hex_digit(code)) {
		tracker.name += source[index];
		tracker.hex++;
	} else if (
		tracker.hex > 0 &&
		(code === 32 || code === 9 || code === 10 || code === 12 || code === 13)
	) {
		tracker.name += source[index];
		tracker.hex = 0;
		tracker.after_cr = code === 13;
	} else if (is_name_code(code)) {
		if (tracker.name === '') tracker.prefixed = is_hash_or_at(source, index - 1);
		tracker.name += source[index];
		tracker.hex = 0;
		// `<!--` is a token of its own, not the start of a name; `\<!--` isn't one.
		if (tracker.name === '--' && source.slice(index - 3, index - 1) === '<!') {
			let backslashes = 0;
			while (source[index - 4 - backslashes] === '\\') backslashes++;
			if (backslashes % 2 === 0) reset_name(tracker);
		}
	} else if (tracker.name !== '' || tracker.hex !== 0) {
		reset_name(tracker);
	}
}

/**
 * Read a whole escape, `\` and at least one more character, into the tracker.
 *
 * @param {NameTracker} tracker
 * @param {string} source
 * @param {number} index where the `\` is
 * @param {string} text
 */
function track_escape(tracker, source, index, text) {
	if (tracker.name === '') tracker.prefixed = is_hash_or_at(source, index - 1);
	tracker.name += text;
	tracker.hex = 0;
	tracker.escaped = false;
	tracker.after_cr = false;
}

/**
 * A name character: a letter, a digit, `_`, `-`, a non-ASCII character, or a
 * NUL, which reads as U+FFFD.
 *
 * @param {number} code
 */
function is_name_code(code) {
	return (
		(code >= 97 && code <= 122) ||
		(code >= 65 && code <= 90) ||
		(code >= 48 && code <= 57) ||
		code === 95 ||
		code === 45 ||
		code === 0 ||
		code >= 0x80
	);
}

/** @param {number} code */
function is_hex_digit(code) {
	return (code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
}

/**
 * @param {string} source
 * @param {number} index
 */
function is_hash_or_at(source, index) {
	return source[index] === '#' || source[index] === '@';
}

/** @param {NameTracker} tracker */
function reset_name(tracker) {
	tracker.name = '';
	tracker.hex = 0;
	tracker.prefixed = false;
}

/**
 * Whether the `(` at `index` starts an unquoted url(), which runs to the first
 * `)` that isn't escaped: the tracker has read `url`, not after a `#` or `@`,
 * where it is a hash or an at-keyword, and no quote follows, which makes it
 * an ordinary function (`url("a)b")`).
 *
 * @param {NameTracker} tracker
 * @param {string} source
 * @param {number} index
 */
function is_unquoted_url(tracker, source, index) {
	if (!is_url_name(tracker)) return false;
	let i = index + 1;
	while (' \t\n\r\f'.includes(source[i] || '-')) i++;
	return source[i] !== '"' && source[i] !== "'";
}

/** @param {NameTracker} tracker */
function is_url_name(tracker) {
	// `url` with each letter escaped as `\00006c` and a `\r\n` is 27 characters
	// long.
	return (
		!tracker.prefixed &&
		tracker.name.length >= 3 &&
		tracker.name.length <= 27 &&
		unescape_css(tracker.name).toLowerCase() === 'url'
	);
}

/**
 * `value` without the whitespace around it, but with the whitespace an escape
 * at its end holds: `a\ ` is the identifier `a `, and the space that ends the
 * hex escape `\31 ` is part of it. A `\` before a newline is no escape.
 *
 * @param {string} value
 * @returns {string}
 */
function trim_value(value) {
	const start = value.length - value.trimStart().length;
	let end = value.trimEnd().length;
	if (end === value.length) return value.slice(start, end);
	// Only an escape that ends where the whitespace starts can hold it: the
	// last `\` before it, followed by nothing (`a\ `) or by up to six hex
	// digits (`a\31 `). Anything else after that `\` ends the escape first.
	const from = Math.max(start, end - 7);
	let escape = end - 1;
	while (escape >= from && value[escape] !== '\\') escape -= 1;
	if (escape < from || !/^[0-9a-fA-F]*$/.test(value.slice(escape + 1, end))) {
		return value.slice(start, end);
	}
	// That `\` starts an escape after an even number of `\` (`\\` is one).
	let run = 0;
	while (escape - run > start && value[escape - run - 1] === '\\') run += 1;
	if (run % 2 === 0) {
		REGEX_VALUE_ESCAPE.lastIndex = escape;
		const match = REGEX_VALUE_ESCAPE.exec(value);
		if (match) end = Math.max(end, escape + match[0].length);
	}
	return value.slice(start, end);
}

/**
 * @param {Parser} parser
 * @param {boolean} [prelude] whether this is an at-rule's prelude: a `{` in
 *   its brackets is a block, a `}` in them part of them, and a `(` or `[` it
 *   leaves open is reported
 * @returns {string}
 */
function read_value(parser, prelude = false) {
	let value = '';
	let escaped = false;
	let in_url = false;
	const name = create_name_tracker();
	// The closers of the `(` and `[` still open, and in a prelude of the `{}`
	// blocks in them: a `;` or `{` in them, as in `f(a;b)`, doesn't end the
	// value.
	/** @type {string[]} */
	const closers = [];
	// Where the outermost of them opens.
	let open = -1;
	// In a prelude, the first `;`, `{` or `}` inside the outermost one still
	// open, where the prelude ended before they were tracked, and the value
	// before it.
	let stop = -1;
	let before_stop = '';

	/** @type {null | '"' | "'"} */
	let quote_mark = null;

	/**
	 * A prelude's `(` or `[` is left open: report it at the bracket, or in loose
	 * mode, while the `)` is still to be typed, end the prelude at the first
	 * `;`, `{` or `}` inside it, as before.
	 */
	const unclosed = () => {
		if (parser.loose) {
			parser.unclosed_prelude = true;
			if (stop === -1) return trim_value(value);
			parser.index = stop;
			return trim_value(before_stop);
		}
		const bracket = parser.template[open];
		parser.index = open;
		throw new Error(
			`Expected ${bracket === '(' ? ')' : ']'} to close this ${bracket} in the at-rule's prelude`,
		);
	};

	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];
		const outside = quote_mark === null && !in_url;
		const url = outside && char === '(' && is_unquoted_url(name, parser.template, parser.index);
		if (outside) track_name(name, parser.template, parser.index);

		if (escaped) {
			// The `\` is already in the value.
			escaped = false;
		} else if (char === '\\') {
			escaped = true;
		} else if (outside && char === '/' && parser.template[parser.index + 1] === '*') {
			// A comment, which can hold a `;`, `{` or `}` (`color: red /* } */`).
			const close = parser.template.indexOf('*/', parser.index + 2);
			if (close === -1) {
				if (prelude && closers.length > 0) return unclosed();
				throw new Error('Unexpected end of input');
			}
			value += parser.template.slice(parser.index, close + 2);
			parser.index = close + 2;
			reset_name(name);
			continue;
		} else if (char === quote_mark) {
			quote_mark = null;
		} else if (char === ')' && in_url) {
			in_url = false;
		} else if (outside) {
			if (prelude && stop === -1 && closers.length > 0 && /[;{}]/.test(char)) {
				// Once one read has run to the end of the sheet, end the later ones
				// here, as before, rather than read it again for each.
				if (parser.unclosed_prelude) return trim_value(value);
				stop = parser.index;
				before_stop = value;
			}
			if (char === '"' || char === "'") {
				quote_mark = char;
			} else if (char === '(' || char === '[' || (prelude && closers.length > 0 && char === '{')) {
				if (url) {
					in_url = true;
				} else {
					if (closers.length === 0) open = parser.index;
					closers.push(char === '(' ? ')' : char === '[' ? ']' : '}');
				}
			} else if (
				closers.length > 0 &&
				// In a prelude a closer closes only its own bracket, as in CSS; in a
				// declaration a `)` or `]` closes either, as before.
				(prelude ? char === closers.at(-1) : char === ')' || char === ']')
			) {
				closers.pop();
				if (closers.length === 0) stop = -1;
			} else if (char === '}') {
				// In a prelude's brackets a `}` is part of them, as in CSS; in a
				// declaration's it ends the value, before the next rule is read in.
				if (!prelude || closers.length === 0) return trim_value(value);
			} else if (closers.length === 0 && (char === ';' || char === '{')) {
				return trim_value(value);
			}
		}

		value += char;

		parser.index++;
	}

	if (prelude && closers.length > 0) return unclosed();
	throw new Error('Unexpected end of input');
}

/**
 * @param {Parser} parser
 * @param {boolean} [inside_pseudo_class]
 * @returns {AST.CSS.SelectorList}
 */
function read_selector_list(parser, inside_pseudo_class = false) {
	/** @type {AST.CSS.ComplexSelector[]} */
	const children = [];

	allow_comment_or_whitespace(parser);

	const start = parser.index;

	while (parser.index < parser.template.length) {
		children.push(read_selector(parser, inside_pseudo_class));

		const end = parser.index;

		allow_comment_or_whitespace(parser);

		if (inside_pseudo_class ? parser.match(')') : parser.match('{')) {
			return {
				type: 'SelectorList',
				start,
				end,
				children,
			};
		} else {
			parser.eat(',', true);
			allow_comment_or_whitespace(parser);
		}
	}

	throw new Error('Unexpected end of input');
}

/**
 * The pseudo-classes the compiler tells apart. CSS reads a pseudo-class name
 * in any case and with escapes, so `:ROOT`, `:r\6f ot` and `:IS()` are these.
 */
const KNOWN_PSEUDO_CLASSES = new Set(['root', 'host', 'is', 'where', 'not', 'has']);

/**
 * The name of a pseudo-class as written, or, for one the compiler tells
 * apart, as CSS reads it (`:ROOT` is `root`). `:global` is TSRX's own and
 * stays as written.
 *
 * @param {string} name
 * @returns {string}
 */
function pseudo_class_name(name) {
	if (!/[A-Z\\]/.test(name)) return name;
	const decoded = unescape_css(name).replace(/[A-Z]/g, (letter) => letter.toLowerCase());
	return KNOWN_PSEUDO_CLASSES.has(decoded) ? decoded : name;
}

/**
 * @param {Parser} parser
 * @returns {AST.CSS.Combinator | null}
 */
function read_combinator(parser) {
	const start = parser.index;
	const spaced = allow_selector_comments(parser);

	const index = parser.index;
	const name = parser.read(REGEX_COMBINATOR);

	if (name) {
		const end = parser.index;
		allow_selector_comments(parser);

		return {
			type: 'Combinator',
			name,
			start: index,
			end,
		};
	}

	if (spaced) {
		return {
			type: 'Combinator',
			name: ' ',
			start,
			end: parser.index,
		};
	}

	// A comment with no whitespace around it is no combinator: `.a/* c */.b`
	// is `.a.b`, and the selector goes on after it.
	return null;
}

/**
 * Skip the whitespace and the comments between the parts of a selector.
 * A comment is no whitespace: `.a/* c *\/.b` is `.a.b`, `.a /* c *\/.b` is
 * `.a .b`.
 *
 * @param {Parser} parser
 * @returns {boolean} whether any of it was whitespace
 */
function allow_selector_comments(parser) {
	let spaced = false;
	while (parser.index < parser.template.length) {
		const start = parser.index;
		parser.allow_whitespace();
		spaced ||= parser.index > start;
		if (!parser.eat('/*')) break;
		parser.read_until(REGEX_COMMENT_CLOSE);
		parser.eat('*/', true);
	}
	return spaced;
}

// An An+B that is a name, as `odd` and `n-1` are, which a type selector can be.
const REGEX_NAME = /^-?[a-z_][\w-]*$/i;

/**
 * The pseudo-classes whose argument is a selector or a list of them, where a
 * type selector has to start its compound as in a rule's.
 */
const SELECTOR_PSEUDO_CLASSES = new Set([
	'is',
	'where',
	'not',
	'has',
	'global',
	'host',
	'host-context',
]);

/**
 * Throw for a type selector (`div`, `*`, `svg|a`) at `start` that doesn't
 * start its compound, which CSS reads no rule with: `.a*`, `[x]div`, `&div`
 * (CSS Nesting wants `div&`), and `.a/* c *\/div`, where the comment is no
 * combinator. One may follow only bare `:global`s, which the output drops,
 * a `:global(...)`, after which the output puts it in an `:is()`
 * (`:global(.x)div`), or an An+B, as the parser reads `2n of` before a
 * selector list.
 *
 * @param {Parser} parser
 * @param {AST.CSS.SimpleSelector[]} selectors the compound's selectors before it
 * @param {number} start
 */
function check_type_selector_placement(parser, selectors, start) {
	const previous = selectors.at(-1);
	if (
		!parser.selector ||
		previous === undefined ||
		selectors.every(
			(selector) =>
				selector.type === 'PseudoClassSelector' && selector.name === 'global' && !selector.args,
		) ||
		(previous.type === 'PseudoClassSelector' && previous.name === 'global' && previous.args) ||
		previous.type === 'Nth'
	) {
		return;
	}
	parser.index = start;
	throw new Error(
		'A type selector or * must come first in its compound selector, as in div.x or div&',
	);
}

/**
 * @param {Parser} parser
 * @param {boolean} [inside_pseudo_class]
 * @returns {AST.CSS.ComplexSelector}
 */
function read_selector(parser, inside_pseudo_class = false) {
	const list_start = parser.index;

	/** @type {AST.CSS.RelativeSelector[]} */
	const children = [];

	/**
	 * @param {AST.CSS.Combinator | null} combinator
	 * @param {number} start
	 * @returns {AST.CSS.RelativeSelector}
	 */
	function create_selector(combinator, start) {
		return {
			type: 'RelativeSelector',
			combinator,
			selectors: [],
			start,
			end: -1,
			metadata: {
				is_global: false,
				is_global_like: false,
				scoped: false,
			},
		};
	}

	/** @type {AST.CSS.RelativeSelector} */
	let relative_selector = create_selector(null, parser.index);

	while (parser.index < parser.template.length) {
		let start = parser.index;

		if (parser.eat('&')) {
			relative_selector.selectors.push({
				type: 'NestingSelector',
				name: '&',
				start,
				end: parser.index,
			});
		} else if (parser.eat('*')) {
			check_type_selector_placement(parser, relative_selector.selectors, start);
			let name = '*';

			if (parser.eat('|')) {
				// * is the namespace (which we ignore)
				name = read_identifier(parser);
			}

			relative_selector.selectors.push({
				type: 'TypeSelector',
				name,
				start,
				end: parser.index,
			});
		} else if (parser.eat('#')) {
			relative_selector.selectors.push({
				type: 'IdSelector',
				name: read_identifier(parser),
				start,
				end: parser.index,
			});
		} else if (parser.eat('.')) {
			relative_selector.selectors.push({
				type: 'ClassSelector',
				name: read_identifier(parser),
				start,
				end: parser.index,
			});
		} else if (parser.eat('::')) {
			relative_selector.selectors.push({
				type: 'PseudoElementSelector',
				name: read_identifier(parser),
				start,
				end: parser.index,
			});
			// We read the inner selectors of a pseudo element to ensure it parses correctly,
			// but we don't do anything with the result.
			if (parser.eat('(')) {
				const selector = parser.selector;
				parser.selector = false;
				try {
					read_selector_list(parser, true);
				} finally {
					parser.selector = selector;
				}
				parser.eat(')', true);
			}
		} else if (parser.eat(':')) {
			const name = pseudo_class_name(read_identifier(parser));

			/** @type {null | AST.CSS.SelectorList} */
			let args = null;

			if (parser.eat('(')) {
				const selector = parser.selector;
				parser.selector = SELECTOR_PSEUDO_CLASSES.has(
					unescape_css(name).replace(/[A-Z]/g, (c) => c.toLowerCase()),
				);
				try {
					args = read_selector_list(parser, true);
				} finally {
					parser.selector = selector;
				}
				parser.eat(')', true);
			}

			relative_selector.selectors.push({
				type: 'PseudoClassSelector',
				name,
				args,
				start,
				end: parser.index,
			});
		} else if (parser.eat('[')) {
			parser.allow_whitespace();
			const name = read_identifier(parser);
			parser.allow_whitespace();

			/** @type {string | null} */
			let value = null;

			const matcher = parser.read(REGEX_MATCHER);

			if (matcher) {
				parser.allow_whitespace();
				value = read_attribute_value(parser);
			}

			parser.allow_whitespace();

			const flags = parser.read(REGEX_ATTRIBUTE_FLAGS);

			parser.allow_whitespace();
			parser.eat(']', true);

			relative_selector.selectors.push({
				type: 'AttributeSelector',
				start,
				end: parser.index,
				name,
				matcher,
				value,
				flags,
			});
		} else if (inside_pseudo_class && parser.match_regex(REGEX_NTH_OF)) {
			// nth of matcher must come before combinator matcher to prevent collision else the '+' in '+2n-1' would be parsed as a combinator

			const value = /**@type {string} */ (parser.read(REGEX_NTH_OF));
			// One that is a name (`odd`, `n-1`) after another selector is a type
			// selector (`[x]odd`).
			if (REGEX_NAME.test(value)) {
				check_type_selector_placement(parser, relative_selector.selectors, start);
			}

			relative_selector.selectors.push({
				type: 'Nth',
				value,
				start,
				end: parser.index,
			});
		} else if (parser.match_regex(REGEX_PERCENTAGE)) {
			relative_selector.selectors.push({
				type: 'Percentage',
				value: /** @type {string} */ (parser.read(REGEX_PERCENTAGE)),
				start,
				end: parser.index,
			});
		} else if (!parser.match_regex(REGEX_COMBINATOR)) {
			let name = read_identifier(parser);
			check_type_selector_placement(parser, relative_selector.selectors, start);

			if (parser.eat('|')) {
				// we ignore the namespace when trying to find matching element classes
				name = read_identifier(parser);
			}

			relative_selector.selectors.push({
				type: 'TypeSelector',
				name,
				start,
				end: parser.index,
			});
		}

		const index = parser.index;
		allow_comment_or_whitespace(parser);

		if (parser.match(',') || (inside_pseudo_class ? parser.match(')') : parser.match('{'))) {
			// rewind, so we know whether to continue building the selector list
			parser.index = index;

			relative_selector.end = index;
			children.push(relative_selector);

			return {
				type: 'ComplexSelector',
				start: list_start,
				end: index,
				children,
				metadata: {
					rule: null,
					used: false,
				},
			};
		}

		parser.index = index;
		const combinator = read_combinator(parser);

		if (combinator) {
			if (relative_selector.selectors.length > 0) {
				relative_selector.end = index;
				children.push(relative_selector);
			}

			// ...and start a new one
			relative_selector = create_selector(combinator, combinator.start);

			parser.allow_whitespace();

			if (parser.match(',') || (inside_pseudo_class ? parser.match(')') : parser.match('{'))) {
				throw new Error(`Invalid selector at parser.index: ${parser.index}`);
			}
		}
	}

	throw new Error('Unexpected end of input');
}

/**
 * Read a property that may or may not be quoted, e.g.
 * `foo` or `'foo bar'` or `"foo bar"`
 * @param {Parser} parser
 */
function read_attribute_value(parser) {
	let value = '';
	const quote_mark = parser.eat('"') ? '"' : parser.eat("'") ? "'" : null;

	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];
		if (char === '\\') {
			value += read_escape(parser);
			continue;
		} else if (quote_mark ? char === quote_mark : /[\s\]]/.test(char)) {
			if (quote_mark) {
				parser.eat(quote_mark, true);
			}

			return value;
		} else {
			value += char;
		}

		parser.index++;
	}

	throw new Error('Unexpected end of input');
}

/**
 * https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
 * @param {Parser} parser
 */
function read_identifier(parser) {
	const start = parser.index;

	let identifier = '';

	if (parser.match_regex(REGEX_LEADING_HYPHEN_OR_DIGIT)) {
		throw new Error('Unexpected CSS identifier');
	}

	while (parser.index < parser.template.length) {
		const char = parser.template[parser.index];
		if (char === '\\') {
			identifier += read_escape(parser);
			continue;
		} else if (
			/** @type {number} */ (char.codePointAt(0)) >= 160 ||
			REGEX_VALID_IDENTIFIER_CHAR.test(char)
		) {
			identifier += char;
		} else {
			break;
		}

		parser.index++;
	}

	if (identifier === '') {
		throw new Error('Expected identifier');
	}

	return identifier;
}

/**
 * Read the escape at the parser's backslash and return its source text. A hex
 * escape keeps the whitespace that ends it, so `\31 23` is the one identifier
 * `123`, not `\31` followed by a descendant combinator.
 * @param {Parser} parser
 * @returns {string}
 */
function read_escape(parser) {
	const start = parser.index++;

	if (!parser.read(REGEX_HEX_ESCAPE) && parser.index < parser.template.length) {
		parser.index++;
	}

	return parser.template.slice(start, parser.index);
}

/**
 * Decode the escapes in a CSS identifier or string body as written in source,
 * e.g. `foo\:bar` to `foo:bar` and `\31 23` to `123`.
 * @param {string} value
 * @returns {string}
 */
export function unescape_css(value) {
	return value.replace(REGEX_ESCAPE, (_, hex, newline, char) => {
		if (newline !== undefined) return '';
		if (hex === undefined) return char;

		const code = parseInt(hex, 16);
		// NULL, surrogates, and values past the last code point decode to U+FFFD
		return code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff
			? '\uFFFD'
			: String.fromCodePoint(code);
	});
}
