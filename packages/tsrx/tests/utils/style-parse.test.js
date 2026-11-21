import { describe, expect, it } from 'vitest';
import { parseStyle } from '../../src/index.js';
import { unescape_css } from '../../src/parse/style.js';

const LOCATION = { filename: 'App.tsrx', line: 1, column: 0 };

describe('parseStyle loose recovery', function () {
	it('does not throw on leftover markup after an unclosed style body', function () {
		expect(function () {
			parseStyle('\n\t\t<div />\n\t</>\n}', LOCATION, { loose: true });
		}).not.toThrow();
	});

	it('does not throw on a partial rule', function () {
		const sheet = parseStyle('.foo', LOCATION, { loose: true });

		expect(sheet.type).toBe('StyleSheet');
		expect(sheet.source).toBe('.foo');
	});

	it('keeps the rules parsed before a partial one', function () {
		const sheet = parseStyle('.foo { color: red; }\n.bar { color', LOCATION, { loose: true });

		expect(sheet.children).toHaveLength(1);
		expect(sheet.children[0].type).toBe('Rule');
	});

	it('keeps the rules parsed before an unclosed comment', function () {
		const sheet = parseStyle('.foo { color: red; }\n/* typing a comment', LOCATION, {
			loose: true,
		});

		expect(sheet.children).toHaveLength(1);
		expect(sheet.children[0].type).toBe('Rule');
	});

	it.each(['/* comment', '<!-- comment', '.foo { color: red; } <!--', '.foo { /* comment'])(
		'does not throw on an unclosed comment %j',
		function (css) {
			expect(function () {
				parseStyle(css, LOCATION, { loose: true });
			}).not.toThrow();
		},
	);

	it.each([
		'.foo {',
		'.foo { color',
		'.foo { color: red',
		'@media (max-width: 10px) {',
		'.foo { &:hover {',
	])('does not throw or hang on %j', function (css) {
		expect(function () {
			parseStyle(css, LOCATION, { loose: true });
		}).not.toThrow();
	});

	it('still throws on partial input when loose is off', function () {
		expect(function () {
			parseStyle('\n\t\t<div />\n\t</>\n}', LOCATION, { loose: false });
		}).toThrow('Expected identifier');
	});

	it('still parses a balanced rule', function () {
		const sheet = parseStyle('.foo { color: red; }', LOCATION, { loose: false });

		expect(sheet.children).toHaveLength(1);
		expect(sheet.children[0].type).toBe('Rule');
	});
});

// A syntax error gets where the parser stopped (#1306).
describe('parseStyle syntax errors', function () {
	it('gives the offset in the body', function () {
		expect(function () {
			parseStyle('.a { color: red; } }', LOCATION, { loose: false });
		}).toThrow(expect.objectContaining({ code: 'TSRX3013', pos: 19 }));
	});

	it('gives the position in the file with a body origin', function () {
		const body = { start: 100, line: 3, column: 9 };
		expect(function () {
			parseStyle('\n\t.a { color: red; }\n\t}', { ...LOCATION, body }, { loose: false });
		}).toThrow(
			expect.objectContaining({ code: 'TSRX3013', pos: 122, loc: { line: 5, column: 1 } }),
		);
	});
});

describe('parseStyle escapes', function () {
	/**
	 * @param {string} css
	 */
	function first_selector(css) {
		const sheet = parseStyle(css, LOCATION, { loose: false });
		const rule = /** @type {any} */ (sheet.children[0]);
		return rule.prelude.children[0];
	}

	it('reads a hex escape through the whitespace that ends it', function () {
		const selector = first_selector(String.raw`.\31 23 { color: red; }`);

		expect(selector.children).toHaveLength(1);
		expect(selector.children[0].selectors).toMatchObject([
			{ type: 'ClassSelector', name: String.raw`\31 23` },
		]);
	});

	it('keeps a compound selector after a hex escape that ends in whitespace', function () {
		const selector = first_selector(String.raw`.\31 .card { color: red; }`);

		expect(selector.children).toHaveLength(1);
		expect(selector.children[0].selectors).toMatchObject([
			{ type: 'ClassSelector', name: String.raw`\31 ` },
			{ type: 'ClassSelector', name: 'card' },
		]);
	});

	it('reads a second whitespace after a hex escape as a descendant combinator', function () {
		const selector = first_selector(String.raw`.\31  .card { color: red; }`);

		expect(selector.children).toHaveLength(2);
		expect(selector.children[1].combinator).toMatchObject({ name: ' ' });
	});

	it('reads an unquoted attribute value through a hex escape', function () {
		const selector = first_selector(String.raw`[data-x=\31 23 i] { color: red; }`);

		expect(selector.children[0].selectors).toMatchObject([
			{ type: 'AttributeSelector', name: 'data-x', value: String.raw`\31 23`, flags: 'i' },
		]);
	});

	it.each([
		[String.raw`[title=" a "]`, ' a '],
		[String.raw`[title=a\ ]`, String.raw`a\ `],
	])('keeps the edge whitespace of the attribute value in %j', function (css, value) {
		const selector = first_selector(`${css} { color: red; }`);

		expect(selector.children[0].selectors[0].value).toBe(value);
	});

	it.each([
		[String.raw`foo\:bar`, 'foo:bar'],
		[String.raw`\31 23`, '123'],
		['\\31\r\n23', '123'],
		['\\31\t', '1'],
		[String.raw`\0000312`, '12'],
		[String.raw`\E9t\E9 `, 'été'],
		[String.raw`\1F600`, '😀'],
		[String.raw`\0`, '\uFFFD'],
		[String.raw`\D800`, '\uFFFD'],
		[String.raw`\110000`, '\uFFFD'],
		['a\\\nb', 'ab'],
		['a\\\r\nb', 'ab'],
	])('unescapes %j to %j', function (value, expected) {
		expect(unescape_css(value)).toBe(expected);
	});
});

describe('parseStyle custom properties', function () {
	/** @param {string} css */
	function blocks(css) {
		return parseStyle(css, LOCATION, {}).children.map((rule) =>
			/** @type {any} */ (rule).block.children.map((/** @type {any} */ child) =>
				child.type === 'Declaration' ? [child.property, child.value] : child.type,
			),
		);
	}

	it.each([
		// The read-ahead took the `{` for a nested rule's.
		['.a { --x: {a} }', [[['--x', '{a}']]]],
		[
			'.a { --x: { a: b; c }; color: red }',
			[
				[
					['--x', '{ a: b; c }'],
					['color', 'red'],
				],
			],
		],
		['.a { --x: a {b} c; .b { color: blue } }', [[['--x', 'a {b} c'], 'Rule']]],
		['.a { --x : {a} {b} }', [[['--x', '{a} {b}']]]],
		// A ; or } in a block, a string or a comment doesn't end the value.
		[
			'.a { --x: [a; b]; --y: (c; d) }',
			[
				[
					['--x', '[a; b]'],
					['--y', '(c; d)'],
				],
			],
		],
		[
			'.a { --x: "}" /* } */; color: red }',
			[
				[
					['--x', '"}" /* } */'],
					['color', 'red'],
				],
			],
		],
		// CSS reads an item that starts with a custom property name and a `:` as
		// a declaration, so this is one, not a rule.
		['.a { --x:hover { color: red } }', [[['--x', 'hover { color: red }']]]],
		[
			'.a { --empty:; color: red }',
			[
				[
					['--empty', ''],
					['color', 'red'],
				],
			],
		],
		// In an unquoted url(), a `{`, `[` or `/*` is part of the URL.
		[
			'.a { --x: url(/a{.svg); --y: url(/*b[.svg); color: red }',
			[
				[
					['--x', 'url(/a{.svg)'],
					['--y', 'url(/*b[.svg)'],
					['color', 'red'],
				],
			],
		],
		// url is a name, read case-insensitively, with escapes; éurl isn't url.
		[
			String.raw`.a { --x: URL(/a{.svg); --y: ur\6c (/b[.svg); color: red }`,
			[
				[
					['--x', 'URL(/a{.svg)'],
					['--y', String.raw`ur\6c (/b[.svg)`],
					['color', 'red'],
				],
			],
		],
		['.a { --x: éurl((a); b) }', [[['--x', 'éurl((a); b)']]]],
		// #url( and @url( aren't url(, nor is u, a \ and a newline, then rl(.
		[
			'.a { --x: #url(a")"b); --y: @url(c")"d); color: red }',
			[
				[
					['--x', '#url(a")"b)'],
					['--y', '@url(c")"d)'],
					['color', 'red'],
				],
			],
		],
		[
			'.a { --x: u\\\nrl(a")"b); color: red }',
			[
				[
					['--x', 'u\\\nrl(a")"b)'],
					['color', 'red'],
				],
			],
		],
		// A selector that starts with a custom property name, but isn't one before
		// its `:`, is still a rule's.
		['.a { --w,i:hover { color: red } --w[x]:hover { color: red } }', [['Rule', 'Rule']]],
		// <!-- is a token of its own, and a NUL a name character.
		[
			'.a { --x: <!--url(a[.svg); color: red }',
			[
				[
					['--x', '<!--url(a[.svg)'],
					['color', 'red'],
				],
			],
		],
		[
			'.a { --x: \0url(a")"b); color: red }',
			[
				[
					['--x', '\0url(a")"b)'],
					['color', 'red'],
				],
			],
		],
	])('reads %j', function (css, expected) {
		expect(blocks(css)).toEqual(expected);
	});

	it('reports a block the value leaves open', function () {
		expect(function () {
			parseStyle('.a { --x: {a; }', LOCATION, {});
		}).toThrow(/Unexpected end of input/);
	});
});
