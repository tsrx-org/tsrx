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
		['.a { --x: a\\00003A\r\n  ; }', 'a\\00003A\r\n'],
		[String.raw`.a { --x: a\1 ; }`, String.raw`a\1 `],
		[String.raw`.a { --x: a\123456 ; }`, String.raw`a\123456 `],
		// A seventh hex digit is no part of the escape, nor the space after it.
		[String.raw`.a { --x: a\1234567 ; }`, String.raw`a\1234567`],
		// In a run of `\`, every other one starts an escape, however long the run.
		[String.raw`.a { font-family: a\\\ ; }`, String.raw`a\\\ `],
		[String.raw`.a { font-family: a\\\\ ; }`, String.raw`a\\\\`],
		[`.a { font-family: a${'\\'.repeat(11)} ; }`, `a${'\\'.repeat(11)} `],
		[`.a { font-family: a${'\\'.repeat(12)} ; }`, `a${'\\'.repeat(12)}`],
		[String.raw`.a { --x: a /* \\\ */ ; }`, String.raw`a /* \\\ */`],
		[String.raw`.a { font-family: a\\\31 ; }`, String.raw`a\\\31 `],
		[String.raw`.a { font-family: a\\31 ; }`, String.raw`a\\31`],
		[String.raw`.a { font-family: /* \\\ */ a\31 ; }`, String.raw`/* \\\ */ a\31 `],
		[String.raw`.a { font-family: /* \\\ */ a ; }`, String.raw`/* \\\ */ a`],
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

	it.each([
		// Another declaration whose whole value is a `{}` block is one too, as
		// `@property`'s initial-value: the read-ahead took it for a nested rule.
		[
			'@property --x { syntax: "*"; initial-value: { a; b }; inherits: false }',
			[
				['syntax', '"*"'],
				['initial-value', '{ a; b }'],
				['inherits', 'false'],
			],
		],
		['@property --x { initial-value: {a} /* c */ }', [['initial-value', '{a} /* c */']]],
		['@property --x { initial-value : {a}; }', [['initial-value', '{a}']]],
	])('reads %j', function (css, declarations) {
		const property = /** @type {any} */ (parseStyle(css, LOCATION, {}).children[0]);
		expect(
			property.block.children.map((/** @type {any} */ child) => [child.property, child.value]),
		).toEqual(declarations);
	});

	it('reads a rule, not a declaration, where more follows the block', function () {
		expect(blocks('.a { b:hover { color: red } }')).toEqual([['Rule']]);
		// In a style rule, CSS reads no declaration there.
		expect(function () {
			parseStyle('.a { b: {a} c; }', LOCATION, {});
		}).toThrow(/Expected identifier/);
	});

	it('reads no declaration where a string in the block ends at a newline', function () {
		// CSS ends a string at a newline (a bad string), so `.a` is a rule of its own.
		expect(function () {
			parseStyle(
				'@property --x { initial-value: {"\n}} .a { color: red } /*"*/ }; }',
				LOCATION,
				{},
			);
		}).toThrow(/Expected identifier/);
		// A `\` before the newline goes on to the next line.
		const property = /** @type {any} */ (
			parseStyle('@property --x { initial-value: {"a\\\nb"} } .a {}', LOCATION, {}).children[0]
		);
		expect(property.block.children[0].value).toBe('{"a\\\nb"}');
	});

	it('reads no declaration where more than a comment follows the block', function () {
		// `<!--` and `-->` are tokens there, not a comment around the rule.
		expect(function () {
			parseStyle(
				'@property --x { initial-value: {}<!--"\n} .a { color: red } /*"*/-->; }',
				LOCATION,
				{},
			);
		}).toThrow(/Expected identifier/);
		// Nor where an escape ends right before the newline that ends a string,
		// though a hex escape takes the newline as its end.
		expect(function () {
			parseStyle(
				'@property --x { initial-value: {"\\g\n}} .a { color: red } /*"*/; }',
				LOCATION,
				{},
			);
		}).toThrow(/Expected identifier/);
		const hex = /** @type {any} */ (
			parseStyle('@property --x { initial-value: {"\\a\nb"}; }', LOCATION, {}).children[0]
		);
		expect(hex.block.children[0].value).toBe('{"\\a\nb"}');
		// A name starts as an identifier does.
		expect(function () {
			parseStyle('a { 1: {} }', LOCATION, {});
		}).toThrow();
	});

	it('reports a string left open at the end of the sheet within it', function () {
		expect(function () {
			parseStyle('a{b:{"\\', LOCATION, {});
		}).toThrow(expect.objectContaining({ pos: 7 }));
	});

	it('reads a declaration name with whitespace in it in linear time', function () {
		for (const css of [
			`.x { a${'\u00a0'.repeat(40_000)}x { color: red } }`,
			// A `\u00a0` is part of a name, not whitespace before a block.
			`.x { ${'a:\u00a0{'.repeat(400)}--x: ${'a'.repeat(40_000)}; ${'} b {}'.repeat(400)} }`,
		]) {
			const start = performance.now();
			parseStyle(css, LOCATION, {});
			expect(performance.now() - start).toBeLessThan(1000);
		}
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

describe('parseStyle comments in selectors', function () {
	/**
	 * The compounds of the first selector of `css`'s first rule, each as its
	 * combinator and its simple selectors.
	 *
	 * @param {string} css
	 */
	function compounds(css) {
		const sheet = parseStyle(css, LOCATION, { loose: false });
		const rule = /** @type {any} */ (sheet.children[0]);
		return rule.prelude.children[0].children.map(
			(/** @type {any} */ relative) =>
				`${relative.combinator?.name ?? ''}[${relative.selectors.map((/** @type {any} */ simple) => css.slice(simple.start, simple.end)).join('|')}]`,
		);
	}

	it.each([
		// A comment is no whitespace: one with none around it joins the compound.
		['.a/* c */.b { color: red; }', ['[.a|.b]']],
		['div/* c */:hover { color: red; }', ['[div|:hover]']],
		['.a /* c */ .b { color: red; }', ['[.a]', ' [.b]']],
		['.a/* c */ .b { color: red; }', ['[.a]', ' [.b]']],
		['.a /* c */.b { color: red; }', ['[.a]', ' [.b]']],
		['.a/* c */>.b { color: red; }', ['[.a]', '>[.b]']],
		['.a /* c */ > /* d */ .b { color: red; }', ['[.a]', '>[.b]']],
		['.a/* c *//* d */.b { color: red; }', ['[.a|.b]']],
		['.a:is(.b/* c */.d) .e { color: red; }', ['[.a|:is(.b/* c */.d)]', ' [.e]']],
	])('reads %j', function (css, expected) {
		expect(compounds(css)).toEqual(expected);
	});

	it('reports a comment a selector leaves open', function () {
		expect(function () {
			parseStyle('.a /* c { color: red; }', LOCATION, {});
		}).toThrow();
	});
});

describe('parseStyle type selectors', function () {
	it.each([
		// CSS reads no rule with one after another simple selector, and a comment
		// with no whitespace around it is no combinator.
		['[x]div { color: red; }', 3],
		['.wrap* { color: red; }', 5],
		['.wrap/**/div { color: red; }', 9],
		['.wrap/**/* { color: red; }', 9],
		[':hover*.a { color: red; }', 6],
		['.a .b/**/svg|a { color: red; }', 9],
		['.wrap::before/* c */div { color: red; }', 20],
		// Nor after an `&`, which CSS Nesting writes after it: `div&`.
		['.p { &div { color: red; } }', 6],
		['.p { &&* { color: red; } }', 7],
		['.p { .a&div { color: red; } }', 8],
		// In the argument of a pseudo-class that takes selectors too, even a
		// forgiving one, where a browser drops just that selector.
		['div:is(.a*, .b) { color: red; }', 9],
		[':not(.a*) { color: red; }', 7],
		[':host(.a*) { color: red; }', 8],
		// In any case, and in an :is() in another argument.
		[':HOST-CONTEXT(.a*) { color: red; }', 16],
		[':nth-child(2n of :not(.a*)) { color: red; }', 24],
		// There the parser reads a name such as odd as an An+B.
		[':is([x]odd) { color: red; }', 7],
	])('reports the type selector in %j', function (css, pos) {
		expect(function () {
			parseStyle(css, LOCATION, { loose: false });
		}).toThrow(
			expect.objectContaining({
				code: 'TSRX3013',
				pos,
				message:
					'A type selector or * must come first in its compound selector, as in div.x or div&',
			}),
		);
	});

	it.each([
		'div.a { color: red; }',
		'*.a { color: red; }',
		'.a div, .a > *, .a /**/ div { color: red; }',
		'*|div, svg|a { color: red; }',
		'.p { div&, *&, div&& { color: red; } }',
		// After bare :globals, which the output drops, and a :global(...), which
		// the output puts it in an :is() after.
		':global*, :global/**/div, :global(.x)div, :global(.x)* { color: red; }',
		// Not in an argument that isn't a selector: a pseudo-element's (part
		// names), or an An+B's, which the parser reads in parts around comments.
		'::part(foo/**/bar), ::part(foo/**/odd) { color: red; }',
		':nth-child(2n of div), :nth-child(odd), :nth-child(n/**/of div) { color: red; }',
		':nth-child(n of/**/div), :nth-of-type(n/**/- 1) { color: red; }',
	])('reads %j', function (css) {
		expect(function () {
			parseStyle(css, LOCATION, { loose: false });
		}).not.toThrow();
	});
});
