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
describe('parseStyle empty declarations', function () {
	/** @param {string} css */
	function blocks(css) {
		return parseStyle(css, LOCATION, {}).children.map((rule) =>
			/** @type {any} */ (rule).block.children.map((/** @type {any} */ child) =>
				child.type === 'Declaration' ? [child.property, child.value] : child.type,
			),
		);
	}

	it.each([
		['.a { color: red;; }', [[['color', 'red']]]],
		[
			'.a { color: red;/* c */; padding: 0 }',
			[
				[
					['color', 'red'],
					['padding', '0'],
				],
			],
		],
		// An empty one before another was read as a declaration of `;`.
		['.a { ; animation: spin 1s }', [[['animation', 'spin 1s']]]],
		['.a { color: red; ; .b { color: blue } }', [[['color', 'red'], 'Rule']]],
		[
			'@font-face { font-family: x;; src: url(a.woff) }',
			[
				[
					['font-family', 'x'],
					['src', 'url(a.woff)'],
				],
			],
		],
	])('skips the empty declarations in %j', function (css, expected) {
		expect(blocks(css)).toEqual(expected);
	});
});

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

describe('parseStyle declaration values', function () {
	/** @param {string} css */
	function blocks(css) {
		return parseStyle(css, LOCATION, {}).children.map((rule) =>
			/** @type {any} */ (rule).block.children.map((/** @type {any} */ child) =>
				child.type === 'Declaration' ? [child.property, child.value] : child.type,
			),
		);
	}

	it.each([
		// A `}` or `;` in a comment ended the value, and the rule with it.
		['.a { color: red /* } */ }', [[['color', 'red /* } */']]]],
		[
			'.a { color: red /* ; */ } .b { color: blue }',
			[[['color', 'red /* ; */']], [['color', 'blue']]],
		],
		['.a { color: /* { */ red; .b /* } */ { color: blue } }', [[['color', '/* { */ red'], 'Rule']]],
		['.a { animation: spin /* } */ 1s; }', [[['animation', 'spin /* } */ 1s']]]],
		// A comment in a string or an unquoted url() is text.
		[".a { content: '/* } */'; }", [[['content', "'/* } */'"]]]],
		['.a { background: url(/* x */a.png); }', [[['background', 'url(/* x */a.png)']]]],
		// url is a name, so URL( is one too.
		[
			'.a{background:URL(/*x)}.b{color:red/* } */}',
			[[['background', 'URL(/*x)']], [['color', 'red/* } */']]],
		],
	])('reads past a comment in %j', function (css, expected) {
		expect(blocks(css)).toEqual(expected);
	});

	it.each([
		// A hex escape ends at a space, or a \r\n, which is part of it.
		['.a{background:ur\\6c (/*x)}.b{color:red/* } */}', 2],
		['.a{background:ur\\6c\r\n(/*x)}.b{color:red/* } */}', 2],
		// In a string, URL( is text.
		['.a{content:"URL("}.b{color:red}', 2],
		// A ; in a function's parentheses doesn't end the value; myurl( isn't url(.
		['.a{--x:myurl(a;b)}.b{color:blue}', 2],
		['.a{color:f(a;b)}.b{color:blue}', 2],
		['.a{--x:/*"*/myurl(/*"*/)}.b{color:blue}', 2],
		// A \ and a newline isn't an escape, so it ends the name.
		['.a{--x:ur\\\nl(/*"*/x)}.b{color:red}', 2],
	])('reads the url( name of %j as CSS does', function (css, rules) {
		expect(blocks(css)).toHaveLength(rules);
	});

	it('reads a long run of escapes before a ( in linear time', function () {
		const css = '.a{--x:' + String.raw`\000061`.repeat(14) + '  (x)}';
		const start = performance.now();
		parseStyle(css, LOCATION, {});
		expect(performance.now() - start).toBeLessThan(1000);
	});

	it('reads an escaped url( as url(', function () {
		const rules = blocks(String.raw`.a{background:u\72l(/*x)}.b{color:red}`);

		expect(
			rules.map((declarations) => declarations.map((/** @type {any} */ item) => item[0])),
		).toEqual([['background'], ['color']]);
	});

	it('reports a comment a value leaves open, unless loose', function () {
		expect(function () {
			parseStyle('.a { color: red /* open }', LOCATION, {});
		}).toThrow(/Unexpected end of input/);
		expect(function () {
			parseStyle('.a { color: red /* open }', LOCATION, { loose: true });
		}).not.toThrow();
	});

	it.each([
		// Each escaped character was doubled, with its `\`.
		[String.raw`.a { content: "\2713"; }`, String.raw`"\2713"`],
		[String.raw`.a { content: "a\"b"; }`, String.raw`"a\"b"`],
		[String.raw`.a { font-family: \31 x, \\; }`, String.raw`\31 x, \\`],
		// The space a `\` escapes is part of the value, as is the one that ends
		// a hex escape; a `\` before a newline escapes nothing.
		[String.raw`.a { font-family: a\ ; }`, String.raw`a\ `],
		['.a { font-family: a\\\t; }', 'a\\\t'],
		[String.raw`.a { font-family: a\\ ; }`, String.raw`a\\`],
		[String.raw`.a { --x: a\ ; }`, String.raw`a\ `],
		[String.raw`.a { font-family: a\31  ; }`, String.raw`a\31 `],
		[String.raw`.a { --x: a\31 ; }`, String.raw`a\31 `],
		['.a { --x: a\\31\r\n; }', 'a\\31\r\n'],
		['.a { --x: a\\\n; }', 'a\\'],
		['.a { font-family: a\\\r\n; }', 'a\\'],
	])('keeps the escapes in %j as written', function (css, value) {
		expect(blocks(css)).toEqual([[[css.slice(5, css.indexOf(':')), value]]]);
	});

	it('keeps the escapes in an at-rule prelude as written', function () {
		const sheet = parseStyle(
			String.raw`@supports (content: "\2713") and (--x: \31 ) { .a { color: red } }`,
			LOCATION,
			{},
		);

		expect(/** @type {any} */ (sheet.children[0]).prelude).toBe(
			String.raw`(content: "\2713") and (--x: \31 )`,
		);
		expect(
			/** @type {any} */ (parseStyle(String.raw`@keyframes a\31 { }`, LOCATION, {}).children[0])
				.prelude,
		).toBe(String.raw`a\31 `);
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

describe('parseStyle url( and unclosed preludes', function () {
	it.each([
		// After # or @ the name is a hash or an at-keyword, so the ( opens a
		// block, and a comment in it is one: a browser reads .b into it.
		['.a { color: #url(/*x); } .b { color: red /*c*/ }', 1],
		['.a { color: @url(/*x); } .b { color: red /*c*/ }', 1],
		['.a { color: #\\75rl(/*x); } .b { color: red /*c*/ }', 1],
		['.a { color: url(/*x); } .b { color: red /*c*/ }', 2],
		['.a { color: \\000075\r\n\\000072\r\n\\00006c\r\n(/*x); } .b { color: red /*c*/ }', 2],
		['.a { color: <!--url(/*x); } .b { color: red /*c*/ }', 2],
		// A quote after url( makes it a function, and one in an unquoted url()
		// doesn't open a string.
		['.a { background: url("a)b"); } .b { color: red }', 2],
		['.a { background: url(a"b); } .b { color: red }', 2],
	])('reads %j as %i rule(s)', function (css, rules) {
		expect(parseStyle(css, LOCATION, {}).children).toHaveLength(rules);
	});

	it.each([
		// <!-- is a token of its own, and url( after it a url(); an escaped < is
		// no <!--, so the name is --url, and /* opens a comment.
		['.a { --x: <!--url(/*); color: blue */); }', 2],
		['.a { --x: \\<!--url(/*); color: blue */); }', 1],
		['.a { --x: \\\\<!--url(/*); color: blue */); }', 2],
		['.a { color: \\<!--url(/*); color: blue */); }', 1],
	])('reads %j as %i declaration(s)', function (css, declarations) {
		const [rule] = parseStyle(css, LOCATION, {}).children;

		expect(/** @type {any} */ (rule).block.children).toHaveLength(declarations);
	});

	it.each([
		'@supports (--x: {a}) { .a { color: red } } .b { color: blue }',
		'@supports (--x: {a)}) { .a { color: red } } .b { color: blue }',
		'@supports (--x: #url({a})) { .a { color: red } } .b { color: blue }',
		'@supports (--x: f(<!--url(/*) } */)) { .a { color: red } } .b { color: blue }',
	])('reads the {} and } in the brackets of the prelude of %j', function (css) {
		const sheet = parseStyle(css, LOCATION, {});

		expect(sheet.children.map((node) => node.type)).toEqual(['Atrule', 'Rule']);
	});

	it.each([
		['@media (min-width: 600px { .a { color: red } } .b { color: blue }', '('],
		['.x { @media (min-width: 600px { color: red } } .b { color: blue }', '('],
		['@supports (background: url("a)b") { .a { color: red } }', '('],
		['@media [x { .a { color: red } }', '['],
		['@supports (display: grid] { .a { color: red } }', '('],
	])('reports the bracket %j leaves open in a prelude, at the bracket', function (css, bracket) {
		let thrown;
		try {
			parseStyle(css, LOCATION, {});
		} catch (error) {
			thrown = /** @type {Error & { pos?: number }} */ (error);
		}
		const closer = bracket === '(' ? ')' : ']';
		expect(thrown?.message).toBe(
			`Expected ${closer} to close this ${bracket} in the at-rule's prelude`,
		);
		expect(thrown?.pos).toBe(css.indexOf(bracket));
	});

	it.each([
		[
			'.a { color: red }\n@media (width: 600px { .b { color: blue } }\n.c { color: green }',
			['Rule', 'Atrule', 'Rule'],
		],
		['@media (width: 600px; .b { color: blue }', ['Atrule', 'Rule']],
		[
			'@media (a { .b { color: red } } @media (c { .d { color: red } } .e { color: blue }',
			['Atrule', 'Atrule', 'Rule'],
		],
		// A comment still open at the end doesn't take the rules before it.
		['@media (width: 600px { .a { color: red } }\n.b { color: blue } /*', ['Atrule', 'Rule']],
	])('ends such a prelude where it did before in loose mode: %j', function (css, types) {
		const sheet = parseStyle(css, LOCATION, { loose: true });

		expect(sheet.children.map((node) => node.type)).toEqual(types);
	});

	it.each([
		['nested', '@media (a { '.repeat(20000) + '.b { color: red }'],
		['in a row', '@media (x;'.repeat(20000) + '.a { color: red }'],
	])('reads 20,000 unclosed preludes %s in loose mode in linear time', function (_, css) {
		const start = performance.now();
		parseStyle(css, LOCATION, { loose: true });
		expect(performance.now() - start).toBeLessThan(1000);
	});
});
