// TSRX syntax, which Prettier's own tests don't cover.

import * as prettier from 'prettier';
import * as standalone from 'prettier/standalone';
import { describe, expect, test } from 'vitest';
import plugin from '../src/index.js';

/**
 * @param {string} code
 * @param {prettier.Options} [options]
 */
async function format(code, options = {}) {
	return prettier.format(code, { parser: 'tsrx', plugins: [plugin], ...options });
}

/**
 * Formatting `input` gives `expected`, and formatting that again changes nothing.
 * @param {string} input
 * @param {string} expected
 * @param {prettier.Options} [options]
 */
async function expectFormat(input, expected, options) {
	const output = await format(input, options);
	expect(output).toBe(expected);
	expect(await format(output, options)).toBe(expected);
}

describe('code blocks', () => {
	test('function body with setup and output', async () => {
		await expectFormat(
			`export function App(props: {name:string}) @{ const greeting = 'Hello ' + props.name
<p class="greeting">{greeting}</p> }`,
			`export function App(props: { name: string }) @{
  const greeting = "Hello " + props.name;
  <p class="greeting">{greeting}</p>
}
`,
		);
	});

	test('an arrow body stays on the arrow line; an assigned or returned value gets parentheses like JSX', async () => {
		await expectFormat(
			`const A = () => @{ const a = 1
<b>{a}</b> }
const c = @{ <i /> }
function f() { return @{ <i /> } }`,
			`const A = () => @{
  const a = 1;
  <b>{a}</b>
};
const c = (
  @{
    <i />
  }
);
function f() {
  return (
    @{
      <i />
    }
  );
}
`,
		);
	});

	test('a nested `@{ … }` in a template is a statement, without parentheses (#504)', async () => {
		await expectFormat(
			`export function App() @{ @{ const x = 2; <b>{x}</b> } }`,
			`export function App() @{
  @{
    const x = 2;
    <b>{x}</b>
  }
}
`,
		);
	});

	test('keeps comments and blank lines between setup statements', async () => {
		await expectFormat(
			`function App() @{
  // setup
  const a = 1 // one


  const b = 2
  <p>{a + b}</p>
}`,
			`function App() @{
  // setup
  const a = 1; // one

  const b = 2;
  <p>{a + b}</p>
}
`,
		);
	});
});

describe('directives', () => {
	// A comment in an empty `@switch` body stays in it, as Prettier keeps it in
	// a `switch`: the comment handlers see the `@switch` as a `switch` (#835)
	test.each([
		[
			'function App() @{\n  @switch (a) {\n    // c\n  }\n}',
			'function App() @{\n  @switch (a) {\n    // c\n  }\n}\n',
		],
		[
			'function App() @{\n  @switch (a) { /* c */ }\n}',
			'function App() @{\n  @switch (a) {\n    /* c */\n  }\n}\n',
		],
		[
			'function App() @{\n  @switch (a) {\n    // c\n    // d\n  }\n}',
			'function App() @{\n  @switch (a) {\n    // c\n    // d\n  }\n}\n',
		],
		[
			'function App() @{\n  <div>\n    @switch (a) {\n      // c\n    }\n  </div>\n}',
			'function App() @{\n  <div>\n    @switch (a) {\n      // c\n    }\n  </div>\n}\n',
		],
	])('keeps the comment in the empty @switch body of %j', async (input, expected) => {
		await expectFormat(input, expected);
	});

	// A comment in each place of each directive prints as Prettier prints it
	// in the same statement: the directive in TypeScript, with `<b />` as `b;`
	// (#835). Where Prettier's own output changes on a second format (a line
	// comment in `for`'s parentheses, or between `case 1:` and its `{`), both
	// formats match it; those are on #852's list of Prettier bugs.
	describe('comments in directives print like the same statement', () => {
		/** @type {Array<[string, string]>} */
		const places = [];
		for (const [kind, c, nl] of [
			['a line', '// c', '\n'],
			['a block', '/* c */', ' '],
		]) {
			places.push(
				[`${kind} comment in an empty @if`, `@if (a) {${nl}${c}${nl}}`],
				[`${kind} comment in @if's parentheses`, `@if (a ${c}${nl}) { <b /> }`],
				[`${kind} comment between @if's ) and {`, `@if (a) ${c}${nl}{ <b /> }`],
				[`${kind} comment before @else`, `@if (a) { <b /> } ${c}${nl}@else { <i /> }`],
				[`${kind} comment in an empty @else`, `@if (a) { <b /> } @else {${nl}${c}${nl}}`],
				[`${kind} comment in an empty @else if`, `@if (a) { <b /> } @else if (c) {${nl}${c}${nl}}`],
				[`${kind} comment after @if's last child`, `@if (a) { <b />${nl}${c}${nl}}`],
				[`${kind} comment in an empty @for of`, `@for (const x of xs) {${nl}${c}${nl}}`],
				[`${kind} comment in @for of's parentheses`, `@for (const x of xs ${c}${nl}) { <b /> }`],
				[`${kind} comment in an empty @for in`, `@for (const k in o) {${nl}${c}${nl}}`],
				[
					`${kind} comment in an empty classic @for`,
					`@for (let i = 0; i < n; i++) {${nl}${c}${nl}}`,
				],
				[`${kind} comment between @for's ) and {`, `@for (const x of xs) ${c}${nl}{ <b /> }`],
				[`${kind} comment after @for's (`, `@for (${c}${nl}const x of xs) { <b /> }`],
				[
					`${kind} comment before @for's first child`,
					`@for (const x of xs) {${nl}${c}${nl}<b /> }`,
				],
				[`${kind} comment after @for's last child`, `@for (const x of xs) { <b />${nl}${c}${nl}}`],
				[`${kind} comment in @for in's parentheses`, `@for (const k in o ${c}${nl}) { <b /> }`],
				[
					`${kind} comment in a classic @for's init`,
					`@for (let i = 0 ${c}${nl}; i < n; i++) { <b /> }`,
				],
				[
					`${kind} comment in a classic @for's test`,
					`@for (let i = 0; i < n ${c}${nl}; i++) { <b /> }`,
				],
				[
					`${kind} comment in a classic @for's update`,
					`@for (let i = 0; i < n; i++ ${c}${nl}) { <b /> }`,
				],
				[`${kind} comment in an empty @switch`, `@switch (a) {${nl}${c}${nl}}`],
				[`${kind} comment in @switch's parentheses`, `@switch (a ${c}${nl}) {}`],
				[`${kind} comment in an empty @case`, `@switch (a) { @case 1: {${nl}${c}${nl}} }`],
				[`${kind} comment after an @case test`, `@switch (a) { @case 1: ${c}${nl}{ <b /> } }`],
				[`${kind} comment in an empty @default`, `@switch (a) { @default: {${nl}${c}${nl}} }`],
				[
					`${kind} comment alone in an @case block with a test in parentheses`,
					`@switch (role) { @case (admin + "_1"): {${nl}${c}${nl}} @case "editor": { <e /> } }`,
				],
				[
					`${kind} comment before a child of an @case with a test in parentheses`,
					`@switch (role) { @case (admin + "_1"): {${nl}${c}${nl}<b /> } }`,
				],
				[
					`${kind} comment after an @case test in parentheses`,
					`@switch (role) { @case (admin + "_1"): ${c}${nl}{ <b /> } }`,
				],
				[
					`${kind} comment between an @case test's ) and :`,
					`@switch (role) { @case (admin + "_1") ${c}${nl}: { <b /> } }`,
				],
				[
					`${kind} comment first in an @case test's parentheses`,
					`@switch (role) { @case (${c}${nl}admin + "_1"): { <b /> } }`,
				],
				[
					`${kind} comment in the middle of an @case test in parentheses`,
					`@switch (role) { @case (admin ${c}${nl}+ "_1"): { <b /> } }`,
				],
				[
					`${kind} comment last in an @case test's parentheses`,
					`@switch (role) { @case (admin + "_1" ${c}${nl}): { <b /> } }`,
				],
				[`${kind} comment after the last @case`, `@switch (a) { @case 1: { <b /> }${nl}${c}${nl}}`],
				[
					`${kind} comment before the first @case`,
					`@switch (a) {${nl}${c}${nl}@case 1: { <b /> } }`,
				],
				[`${kind} comment in an empty @try`, `@try {${nl}${c}${nl}} @catch (e) { <i /> }`],
				[`${kind} comment before @catch`, `@try { <b /> } ${c}${nl}@catch (e) { <i /> }`],
				[`${kind} comment in an empty @catch`, `@try { <b /> } @catch (e) {${nl}${c}${nl}}`],
				[
					`${kind} comment in @catch's parentheses`,
					`@try { <b /> } @catch (e ${c}${nl}) { <i /> }`,
				],
			);
		}
		/** @param {string} code */
		const asStatement = (code) =>
			code
				.replace(/^function App\(\) @\{/, 'function f() {')
				.replace(/@(if|else|for|switch|case|default|try|catch)\b/g, '$1')
				.replace(/<(\w) \/>/g, '$1;');

		test.each(places)('prints %s', async (_label, body) => {
			const first = await format(`function App() @{\n  ${body}\n}\n`);
			const second = await format(first);
			const expected = await prettier.format(asStatement(`function App() @{\n  ${body}\n}\n`), {
				parser: 'typescript',
			});
			expect(asStatement(first)).toBe(expected);
			expect(asStatement(second)).toBe(await prettier.format(expected, { parser: 'typescript' }));
		});

		// TSRX-only places, with no statement to compare with: the comment stays
		// where it was written, and a second format changes nothing
		/** @param {string} body */
		const app = (body) => `function App() @{\n  ${body}\n}\n`;
		test.each([
			[
				'@for (const x of xs) { <b /> } // c\n@empty { <i /> }',
				'@for (const x of xs) {\n    <b />\n  } // c\n  @empty {\n    <i />\n  }',
			],
			[
				'@for (const x of xs) { <b /> } @empty {\n// c\n}',
				'@for (const x of xs) {\n    <b />\n  } @empty {\n    // c\n  }',
			],
			[
				'@for (const x of xs) { <b /> } @empty { <i /> /* c */ }',
				'@for (const x of xs) {\n    <b />\n  } @empty {\n    <i /> /* c */\n  }',
			],
			[
				'@for (const x of xs; index i // c\n) { <b /> }',
				'@for (\n    const x of xs;\n    index i // c\n  ) {\n    <b />\n  }',
			],
			[
				'@for (const x of xs; key x.id /* c */) { <b /> }',
				'@for (const x of xs; key x.id /* c */) {\n    <b />\n  }',
			],
			[
				'@for (const x of xs; // c\nindex i) { <b /> }',
				'@for (\n    const x of xs; // c\n    index i\n  ) {\n    <b />\n  }',
			],
			[
				'@try { <b /> } @pending {\n// c\n} @catch (e) { <i /> }',
				'@try {\n    <b />\n  } @pending {\n    // c\n  } @catch (e) {\n    <i />\n  }',
			],
			[
				'@try { <b /> } /* c */ @pending { <i /> } @catch (e) { <i /> }',
				'@try {\n    <b />\n  } /* c */ @pending {\n    <i />\n  } @catch (e) {\n    <i />\n  }',
			],
		])('keeps the comment of %j', async (input, expected) => {
			await expectFormat(app(input), app(expected));
		});
	});

	test('@if, @else if, and @else', async () => {
		await expectFormat(
			`const A = () => <div>@if (a) { <b /> } @else if (c) { <d /> } @else { <e /> }</div>`,
			`const A = () => (
  <div>
    @if (a) {
      <b />
    } @else if (c) {
      <d />
    } @else {
      <e />
    }
  </div>
);
`,
		);
	});

	test('@if breaks a long condition like Prettier breaks an if', async () => {
		await expectFormat(
			`const A = () => @if (someCondition && anotherCondition && yetAnotherCondition && oneMoreCondition) { <b /> }`,
			`const A = () => (
  @if (
    someCondition &&
    anotherCondition &&
    yetAnotherCondition &&
    oneMoreCondition
  ) {
    <b />
  }
);
`,
		);
	});

	test('@for with index, key, and @empty', async () => {
		await expectFormat(
			`const L = (props) => <ul>@for (const item of props.items; index i; key item.id) { <li>{i}: {item.name}</li> } @empty { <li>None</li> }</ul>`,
			`const L = (props) => (
  <ul>
    @for (const item of props.items; index i; key item.id) {
      <li>
        {i}: {item.name}
      </li>
    } @empty {
      <li>None</li>
    }
  </ul>
);
`,
		);
	});

	test('@for await and a classic for header', async () => {
		await expectFormat(
			`async function A() @{ <>@for await (const x of stream) { <i>{x}</i> }@for (let i = 0; i < 3; i++) { <b>{i}</b> }</> }`,
			`async function A() @{
  <>
    @for await (const x of stream) {
      <i>{x}</i>
    }
    @for (let i = 0; i < 3; i++) {
      <b>{i}</b>
    }
  </>
}
`,
		);
	});

	test('@switch with @case and @default', async () => {
		await expectFormat(
			`const S = ({ status }) => @switch (status) { @case 'loading': { <Spinner /> } @default: { <p>Done</p> } }`,
			`const S = ({ status }) => (
  @switch (status) {
    @case "loading": {
      <Spinner />
    }
    @default: {
      <p>Done</p>
    }
  }
);
`,
		);
	});

	test("@case bodies are blocks: blank lines, comments, and an empty body like Prettier's `case x: {}`", async () => {
		await expectFormat(
			`const S = ({ status }) => @switch (status) {
  @case 'a': {
    // first
    <A />
  }

  @case 'b': {}
  @default: { <p>Done</p> }
}`,
			`const S = ({ status }) => (
  @switch (status) {
    @case "a": {
      // first
      <A />
    }

    @case "b": {
    }
    @default: {
      <p>Done</p>
    }
  }
);
`,
		);
	});

	test('directives get parentheses like JSX where assigned, thrown, or a last-argument arrow body', async () => {
		await expectFormat(
			`const x = @if (a) { <b /> };
function g() { throw @if (a) { <b /> } }
list.map((item) => /* one */ @if (item.ok) { <A {item} /> } @else { <B /> });`,
			`const x = (
  @if (a) {
    <b />
  }
);
function g() {
  throw (
    @if (a) {
      <b />
    }
  );
}
list.map((item) => (
  /* one */ @if (item.ok) {
    <A {item} />
  } @else {
    <B />
  }
));
`,
		);
	});

	// As Prettier places the same comments before `catch` and `else`.
	test('comments before @catch, @else, and @empty (#505)', async () => {
		await expectFormat(
			`function A() @{ @try { <b /> } /* one */ @catch (error) { <i /> } }
function B() @{ @try { <b /> } // two
@catch (error) { <i /> } }
function C() @{ @if (a) { <b /> } // three
@else { <i /> } }
function D() @{ @for (const x of xs) { <b /> } // four
@empty { <i /> } }`,
			`function A() @{
  @try {
    <b />
  } /* one */ @catch (error) {
    <i />
  }
}
function B() @{
  @try {
    <b />
  } @catch (error) {
    // two
    <i />
  }
}
function C() @{
  @if (a) {
    <b />
  } // three
  @else {
    <i />
  }
}
function D() @{
  @for (const x of xs) {
    <b />
  } // four
  @empty {
    <i />
  }
}
`,
		);
	});

	// As Prettier keeps a blank line after a comment that ends a `case`.
	test('a blank line after an @case arm that ends with a comment stays (#837)', async () => {
		const source = `function App() @{
  @switch (x) {
    @case 1: {
      <a />
    } // after one

    @case 2: {
      <b />
    }
  }
}
`;
		await expectFormat(source, source);
	});

	test('a brace in a comment before an @case body (#509)', async () => {
		await expectFormat(
			`const S = () => @switch (1) { @case 1: /* { */ { <b /> } @default: /* } */ { <i /> } }`,
			`const S = () => (
  @switch (1) {
    @case 1: /* { */ {
      <b />
    }
    @default: /* } */ {
      <i />
    }
  }
);
`,
		);
	});

	test('@try with @pending and @catch (error, reset)', async () => {
		await expectFormat(
			`export const App = () => @try { <Child /> } @pending { <Loading /> } @catch (e, reset) { <button onClick={reset}>{String(e)}</button> }`,
			`export const App = () => (
  @try {
    <Child />
  } @pending {
    <Loading />
  } @catch (e, reset) {
    <button onClick={reset}>{String(e)}</button>
  }
);
`,
		);
	});

	// Like an element, a `@{ … }` value or a directive isn't a left-hand-side
	// expression (#426): it hugs its parentheses as a callee, and breaks inside
	// them before a member access, index, non-null assertion, or tag.
	// An assigned `a && <jsx>` stays on the `=` line (Prettier's
	// `shouldInlineLogicalExpression`), and so does a value there (#899).
	test('a value on the right of an assigned logical expression stays on the `=` line', async () => {
		await expectFormat(
			`const logical = a && @if (b) { <c /> };
const x = a || @{ const y = 1; <b>{y}</b> };
x = a ?? @for (const i of items) { <li /> };
const o = { k: a && @if (b) { <c /> } };
const chain = a && b && @if (c) { <d /> };`,
			`const logical = a && (
  @if (b) {
    <c />
  }
);
const x = a || (
  @{
    const y = 1;
    <b>{y}</b>
  }
);
x = a ?? (
  @for (const i of items) {
    <li />
  }
);
const o = {
  k: a && (
    @if (b) {
      <c />
    }
  ),
};
const chain = a && b && (
  @if (c) {
    <d />
  }
);
`,
		);
	});

	test('a value before a subscript keeps its parentheses', async () => {
		for (const [input, expected] of [
			['const a = (@{ <b /> })(x);', 'const a = (@{\n  <b />\n})(x);\n'],
			[
				'const a = (@for (const x of xs) { <b /> })(x);',
				'const a = (@for (const x of xs) {\n  <b />\n})(x);\n',
			],
			[
				'const a = (@switch (x) { @case 1: { <b /> } })(x);',
				'const a = (@switch (x) {\n  @case 1: {\n    <b />\n  }\n})(x);\n',
			],
			[
				'const a = (@try { <b /> } @catch { <i /> })(x);',
				'const a = (@try {\n  <b />\n} @catch {\n  <i />\n})(x);\n',
			],
			['const a = new (@{ <b /> })();', 'const a = new (@{\n  <b />\n})();\n'],
			['const a = (@{ <b /> }).foo;', 'const a = (\n  @{\n    <b />\n  }\n).foo;\n'],
			['const a = (@{ <b /> })`t`;', 'const a = (\n  @{\n    <b />\n  }\n)`t`;\n'],
			['const a = (@if (x) { <b /> })!;', 'const a = (\n  @if (x) {\n    <b />\n  }\n)!;\n'],
			['const a = (@if (x) { <b /> })[0];', 'const a = (\n  @if (x) {\n    <b />\n  }\n)[0];\n'],
		]) {
			await expectFormat(input, expected);
		}
	});

	test('`yield` takes a value as its argument (#547)', async () => {
		await expectFormat(
			'export function* nodes() { yield @{ <div /> }; yield @if (ok) { <b /> }; }',
			`export function* nodes() {
  yield (
    @{
      <div />
    }
  );
  yield (
    @if (ok) {
      <b />
    }
  );
}
`,
		);
	});

	test('a comment after a directive keyword stays where Prettier keeps it after the statement keyword (#477)', async () => {
		await expectFormat(
			'function A() @{\n  @try /* c */ {\n    @if /* d */ (x) {\n      <b />\n    }\n  } @catch (e) {\n    <p />\n  }\n}',
			'function A() @{\n  @try /* c */ {\n    @if (/* d */ x) {\n      <b />\n    }\n  } @catch (e) {\n    <p />\n  }\n}\n',
		);
	});
});

describe('elements', () => {
	test('shorthand props stay shorthand', async () => {
		await expectFormat(
			`const i = <Input {value} {onChange} {...rest} />;`,
			`const i = <Input {value} {onChange} {...rest} />;\n`,
		);
	});

	// A comment in a shorthand's braces stays there, laid out as Prettier lays
	// out the braces of `name={name /* c */}` (#834)
	test.each([
		['const a = <div {name /* c */} />;', 'const a = <div {name /* c */} />;\n'],
		['const a = <div {name/* c */} />;', 'const a = <div {name /* c */} />;\n'],
		['const a = <div {/* c */ name} />;', 'const a = <div {/* c */ name} />;\n'],
		[
			'const a = <div {name\n  // c\n} />;',
			'const a = (\n  <div\n    {\n      name\n      // c\n    }\n  />\n);\n',
		],
		[
			'x = <div {name\n/* c */\n} x="1" />;',
			'x = (\n  <div\n    {\n      name\n      /* c */\n    }\n    x="1"\n  />\n);\n',
		],
		[
			'export function App() @{\n  <div {name /* c */} />\n}',
			'export function App() @{\n  <div {name /* c */} />\n}\n',
		],
	])('keeps the comment in the shorthand of %j', async (input, expected) => {
		await expectFormat(input, expected);
	});

	test('dynamic tags', async () => {
		await expectFormat(`const d = <{Tag} a="1">x</{Tag}>;`, `const d = <{Tag} a="1">x</{Tag}>;\n`);
	});

	// A dynamic tag expression other than an identifier, a member access, or a
	// string literal is reported (#737), but the tree is complete, so the file
	// is formatted.
	test('dynamic tags that are only reported', async () => {
		await expectFormat(
			`export function App({ c }) @{ <main><{c?A:B}   title="t"><p>{c}</p></{c?A:B}><{getTag()}/></main> }`,
			`export function App({ c }) @{
  <main>
    <{c ? A : B} title="t">
      <p>{c}</p>
    </{c ? A : B}>
    <{getTag()} />
  </main>
}
`,
		);
	});

	test('<style> bodies are formatted as CSS, with their comments', async () => {
		await expectFormat(
			`function App() @{ <div><style>/* theme */ .a { color: red } .b{margin:0}</style><p class="a" /></div> }`,
			`function App() @{
  <div>
    <style>
      /* theme */
      .a {
        color: red;
      }
      .b {
        margin: 0;
      }
    </style>
    <p class="a" />
  </div>
}
`,
		);
	});

	test('<style apply /> and assigned styles', async () => {
		await expectFormat(
			`const theme = <style>.card { padding: 1px }</style>;
const A = () => <><style apply={theme} /><div class={theme.$class} /></>;`,
			`const theme = (
  <style>
    .card {
      padding: 1px;
    }
  </style>
);
const A = () => (
  <>
    <style apply={theme} />
    <div class={theme.$class} />
  </>
);
`,
		);
	});

	test('<script> bodies are formatted as TypeScript, with their comments', async () => {
		await expectFormat(
			`const s = <><script lang="ts">const x:number=1 // one
</script></>;`,
			`const s = (
  <>
    <script lang="ts">
      const x: number = 1; // one
    </script>
  </>
);
`,
		);
	});

	// An element isn't a left-hand-side expression, as in TypeScript (#426).
	test('a `(`, `[`, or template literal on the line after an element starts a statement', async () => {
		const input = 'const a = <b>x</b>\n(foo)\nconst c = <b />\n[1].map(f)\nconst d = <b />\n`t`\n';
		const expected =
			'const a = <b>x</b>;\nfoo;\nconst c = <b />;\n[1].map(f);\nconst d = <b />;\n`t`;\n';
		await expectFormat(input, expected);
		expect(await prettier.format(input, { parser: 'typescript', filepath: 'a.tsx' })).toBe(
			expected,
		);
	});

	test('an element before a subscript keeps its parentheses', async () => {
		for (const source of [
			'const a = (<b>x</b>)(foo);\n',
			'const c = (<b />)[1].map(f);\n',
			'const d = (<b />)`t`;\n',
			'const e = (<b />)?.foo;\n',
			'(<b />)(x);\n',
			'const a = (<div>\n  <b>x</b>\n</div>)(foo);\n',
		]) {
			await expectFormat(source, source);
			expect(await prettier.format(source, { parser: 'typescript', filepath: 'a.tsx' })).toBe(
				source,
			);
		}
	});
});

describe('text keeps its characters as written', () => {
	// A `>` in an element in a container failed after a child container (#694),
	// and the text of an element in a spread argument or an unbraced attribute
	// value in a container was read with its character references decoded
	// (#693). Since #656 those are template text; only an element in a dynamic
	// tag name is read that way. A text prints from its `raw`.
	test.each([
		[
			'a `>` in an element in a container',
			`export function App() @{
  <main>{c && <b>a > b</b>}</main>
}
`,
		],
		[
			'a `>` after a child container',
			`export function App() @{
  <main>{c && <b>{y} a > b</b>}</main>
}
`,
		],
		[
			'an arrow in an element in a container',
			`export function App() @{
  <main>{c && <b>a => b</b>}</main>
}
`,
		],
		[
			"references in a spread attribute's argument",
			`export function App() @{
  <div {...{ title: <b>&#123;x&#125; &amp;lt; &gt;</b> }} />
}
`,
		],
		[
			'references in an unbraced attribute value in a container',
			`export function App() @{
  <main>{c && <div title=<b>&#123;x&#125; &amp;lt; &gt;</b> />}</main>
}
`,
		],
		[
			"a `>` in a spread attribute's argument",
			`export function App() @{
  <div {...{ title: <b>a > b</b> }} />
}
`,
		],
		[
			'a `>` first in an unbraced attribute value in a container',
			`export function App() @{
  <main>{c && <div title=<b>> b &#123;x&#125;</b> />}</main>
}
`,
		],
		[
			'references in an element in a reported dynamic tag name',
			`export function App() @{
  <{c ? <b>&#123;x&#125; &amp;lt; &gt;</b> : "i"} />
}
`,
		],
		[
			'references and a comment in template text',
			`export function App() @{
  <p>a &amp; b /* c */ &#123;x&#125;</p>
}
`,
		],
	])('keeps the text of %s', async (_label, source) => {
		await expectFormat(source, source);
	});
});

// `//` and `/* */` between JSX children are comments in TSRX, where TSX reads
// them as text. They keep their place among the children.
describe('comments between JSX children', () => {
	test('own-line, trailing, and after-text comments stay where they are', async () => {
		await expectFormat(
			`export function App() @{
  <div>
    // before a child
    <span>{a}</span>
    <b /> // after an element
    /* on its own line */
    text here // after text
    {value} // after an expression
    @if (a) {
      <i />
    } // after a directive
    // last
  </div>
}`,
			`export function App() @{
  <div>
    // before a child
    <span>{a}</span>
    <b /> // after an element
    /* on its own line */
    text here // after text
    {value} // after an expression
    @if (a) {
      <i />
    } // after a directive
    // last
  </div>
}
`,
		);
	});

	test('a comment as the only child keeps the element open', async () => {
		await expectFormat(
			`const a = <div>// only
</div>;`,
			`const a = (
  <div>
    // only
  </div>
);
`,
		);
	});

	test('text after a line comment stays on its own line', async () => {
		await expectFormat(
			`const a = <p>
  // note
  x
</p>;`,
			`const a = (
  <p>
    // note
    x
  </p>
);
`,
		);
	});

	test('blank lines around a comment are kept', async () => {
		await expectFormat(
			`const a = <div>
  <a />

  // section

  <b />
</div>;`,
			`const a = (
  <div>
    <a />

    // section

    <b />
  </div>
);
`,
		);
	});

	// Laid out as Prettier lays out `{/* c */}`: without text, each child on its
	// own line.
	test('inline block comments lay out like {/* c */}', async () => {
		await expectFormat(
			`const a = <p>one /* two */ three</p>;
const b = <p><a />/* c */<b /></p>;`,
			`const a = <p>one /* two */ three</p>;
const b = (
  <p>
    <a />
    /* c */
    <b />
  </p>
);
`,
		);
	});

	test('a comment after wrapped text stays at the end of its line', async () => {
		await expectFormat(
			`const a = <p>
  This is a long sentence that keeps going and going until it needs to wrap onto more lines // end
</p>;`,
			`const a = (
  <p>
    This is a long sentence that keeps going and going until it needs to wrap
    onto more lines // end
  </p>
);
`,
		);
	});

	// A comment renders like `{/* c */}`: the text on each side of it follows
	// JSX's whitespace rules on its own, and Prettier's layout of `{/* c */}`
	// keeps what it renders (#639).
	test('the whitespace around a comment renders the same after formatting (#639)', async () => {
		await expectFormat(
			`export function App() @{
  <>
    <div><b>t</b> /* c */ </div>
    <div> /* c */ <i /></div>
    <div>
      /* c */ 2</div>
    <div>{x} /* c */
    </div>
    <p><i /> {" "}// c
    </p>
  </>
}`,
			`export function App() @{
  <>
    <div>
      <b>t</b> /* c */{" "}
    </div>
    <div>
      {" "}
      /* c */ <i />
    </div>
    <div>/* c */ 2</div>
    <div>
      {x} /* c */
    </div>
    <p>
      <i /> // c
    </p>
  </>
}
`,
		);
	});

	// A `{" "}` beside a comment is a space, as beside `{/* c */}`; before a line
	// comment that starts its line, it's written out.
	test('a {" "} beside a comment keeps its space', async () => {
		await expectFormat(
			`export function App() @{
  <>
    <p>one{" "}/* c */two</p>
    <p><b />{" "}/* c */<i /></p>
    <p><b />/* c */{" "}<i /></p>
    <p>one{" "}/* c */
      <b /></p>
    <p>one{" "}
      // c
      two</p>
  </>
}`,
			`export function App() @{
  <>
    <p>one /* c */two</p>
    <p>
      <b /> /* c */
      <i />
    </p>
    <p>
      <b />
      /* c */ <i />
    </p>
    <p>
      one /* c */
      <b />
    </p>
    <p>
      one // c
      two
    </p>
  </>
}
`,
		);
	});

	test('a {" "} with a comment inside is printed with its comment', async () => {
		await expectFormat(
			`const a = <p>one /* c */{/* d */ " "}two</p>;`,
			`const a = (
  <p>
    one /* c */
    {/* d */ " "}two
  </p>
);
`,
		);
	});

	test('a group of comments lays out like {/* c */} children', async () => {
		await expectFormat(
			`const a = <p>one /* c */ /* d */ <b /></p>;`,
			`const a = (
  <p>
    one /* c */{" "}
    /* d */ <b />
  </p>
);
`,
			{ printWidth: 20 },
		);
	});

	test('in a fragment, and a JSDoc-style block comment is re-indented', async () => {
		await expectFormat(
			`const a = <>
  // in a fragment
      /*
       * several
       * lines
       */
  <b />
</>;`,
			`const a = (
  <>
    // in a fragment
    /*
     * several
     * lines
     */
    <b />
  </>
);
`,
		);
	});
});

// Elements this plugin prints itself (with comment children, `<script>`, and
// `<style>`) get what Prettier's `printJsxElement` and `print` add around every
// element: the parentheses `needsParens` asks for, and their own comments inside
// the layout parentheses.
describe('elements the plugin prints itself (#836)', () => {
	test('keep the parentheses Prettier needs around an element', async () => {
		await expectFormat(
			`const a = (<div>/* c */</div>).props;
const b = (<script></script>).props;
async function f() {
  return await <div>/* c */</div>;
}
const d = <div>/* c */</div> as Node;
const v = !<div>/* c */</div>;
class A extends (<div>/* c */</div>) {}`,
			`const a = (<div>/* c */</div>).props;
const b = (<script></script>).props;
async function f() {
  return await (<div>/* c */</div>);
}
const d = (<div>/* c */</div>) as Node;
const v = !(<div>/* c */</div>);
class A extends (<div>/* c */</div>) {}
`,
		);
	});

	test('print their own comments inside the layout parentheses', async () => {
		await expectFormat(
			`const e = (
  // lead
  <div>
    // c
    <b />
  </div>
);
const s = (
  // lead
  <script>let a = 1;</script>
);
const t = (
  /* lead */
  <style>.b { color: red }</style>
);
const u = <div>/* c */</div> /* trail */;`,
			`const e = (
  // lead
  <div>
    // c
    <b />
  </div>
);
const s = (
  // lead
  <script>
    let a = 1;
  </script>
);
const t = (
  /* lead */
  <style>
    .b {
      color: red;
    }
  </style>
);
const u = <div>/* c */</div>; /* trail */
`,
		);
	});
});

// A `//` is a comment when whitespace comes right before it, it starts a line,
// or it comes right after a tag, `}`, or a block; it runs to the end of its
// line. Touching other text or a block comment, it's text (as in `https://…`).
// As `{/* prettier-ignore */}` keeps the next child as written in Prettier.
describe('prettier-ignore between children', () => {
	test('keeps the next child as written', async () => {
		await expectFormat(
			`export function A() @{
  <div>
    // prettier-ignore
    <span   a="1"   b="2" />
    <p   x="1" />
  </div>
}`,
			`export function A() @{
  <div>
    // prettier-ignore
    <span   a="1"   b="2" />
    <p x="1" />
  </div>
}
`,
		);
	});
});

describe('// in text', () => {
	test('touching text, it is a word, as in Prettier', async () => {
		await expectFormat(
			`const a = <p>see https://example.com/docs and a//b, which are text and wrap like words</p>;`,
			`const a = (
  <p>
    see https://example.com/docs and a//b, which are text and wrap like words
  </p>
);
`,
		);
	});

	test('after whitespace, it is a comment, laid out as Prettier lays out {// …}', async () => {
		await expectFormat(
			`const a = <p>a word // a comment
</p>;
const b = (
  <p>
    Our docs live at the project site and the API reference is at the same host // see below
  </p>
);`,
			`const a = (
  <p>
    a word // a comment
  </p>
);
const b = (
  <p>
    Our docs live at the project site and the API reference is at the same host{" "}
    // see below
  </p>
);
`,
		);
	});

	test('text that starts with // right after a block comment stays on its line', async () => {
		await expectFormat(
			`const a = <p>one /* x */// two three</p>;`,
			`const a = (
  <p>
    one{" "}
    /* x *///
    two three
  </p>
);
`,
			{ printWidth: 14 },
		);
	});

	test('a comment takes a closing tag on its line with it', async () => {
		await expect(format(`const a = <p>a //comment </p>;`)).rejects.toThrow(/Unclosed tag '<p>'/);
	});
});

describe('comments before a tag name', () => {
	// Prettier prints `<// note` with the name below it at the same indentation,
	// which TSX can't parse.
	test('a line comment goes on its own line after `<`, like in a closing tag', async () => {
		await expectFormat(
			`const a = <
  // note
  div className="x">text</div>;
const b = <// note
  br />;
function App() @{
  @if (x) {
    <// note
      span />
  }
}`,
			`const a = (
  <
    // note
    div
    className="x"
  >
    text
  </div>
);
const b = (
  <
    // note
    br
  />
);
function App() @{
  @if (x) {
    <
      // note
      span
    />
  }
}
`,
		);
	});

	// A `<` followed by a line break in an element's children is text.
	test("an element's direct child keeps the comment right after `<`", async () => {
		await expectFormat(
			`const a = <div>
  <// note
    span />
</div>;`,
			`const a = (
  <div>
    <// note
    span
    />
  </div>
);
`,
		);
	});

	test('a dynamic tag name keeps its comments the same way', async () => {
		await expectFormat(
			`const a = <
  // c
  {Tag} x={1}>y</{Tag}>;
const b = </* c */ {Tag} />;
const c = <{Tag}>x</ /* c */ {Tag}>;`,
			`const a = (
  <
    // c
    {Tag}
    x={1}
  >
    y
  </{Tag}>
);
const b = </* c */ {Tag} />;
const c = <{Tag}>x</ /* c */ {Tag}>;
`,
		);
	});

	// Prettier prints this on its second format; its first keeps the line breaks.
	test('a block comment on its own line prints straight after `<` or `</`', async () => {
		await expectFormat(
			`const a = <
  /* note */
  div className="x">text</div>;
const b = <div>text</
  /* note */
  div>;`,
			`const a = </* note */ div className="x">text</div>;
const b = <div>text</ /* note */ div>;
`,
		);
	});
});

// Like Prettier's HTML formatter (#900).
describe('<script> bodies', () => {
	test('with embedded formatting off, <style> bodies are kept as written and <script> bodies on their own lines (#503)', async () => {
		await expectFormat(
			`function App() @{ <><style>.x {  color: red }</style><script>const  x=1</script></> }`,
			`function App() @{
  <>
    <style>.x {  color: red }</style>
    <script>
      const  x=1
    </script>
  </>
}
`,
			{ embeddedLanguageFormatting: 'off' },
		);
	});

	test('a JavaScript or TypeScript body is formatted with the options', async () => {
		await expectFormat(
			`export function App() @{ <>
<script>const i = 2</script>
<script type="module">import a from "a"</script>
<script type="">let   a = 1</script>
<script type="application/x-typescript">let   a: number = 1</script>
<script lang="ts">const n:number=1<2?3:4;
if(n<2){go("now")}</script>
<script lang="tsx">const a=<div/></script>
</> }`,
			`export function App() @{
  <>
    <script>
      const i = 2
    </script>
    <script type="module">
      import a from 'a'
    </script>
    <script type="">
      let a = 1
    </script>
    <script type="application/x-typescript">
      let a: number = 1
    </script>
    <script lang="ts">
      const n: number = 1 < 2 ? 3 : 4
      if (n < 2) {
        go('now')
      }
    </script>
    <script lang="tsx">
      const a = <div />
    </script>
  </>
}
`,
			{ semi: false, singleQuote: true },
		);
	});

	test('a JSON, import map, or speculation rules body is formatted as JSON', async () => {
		await expectFormat(
			`export function App() @{
  <div>
    <script type="application/json">[1,2]</script>
    <script type="application/json">"on"</script>
    <script type="importmap">{"imports":{"a":"./a.js"}}</script>
    <script type="application/ld+json">
      { "@context": "https://schema.org",
        "name": 'x' }
    </script>
    <script type="speculationrules">{"prerender":[{"source":"list"}]}</script>
    <script type="application/json">true</script>
    <script lang="json">{"a":1}</script>
  </div>
}`,
			`export function App() @{
  <div>
    <script type="application/json">
      [1, 2]
    </script>
    <script type="application/json">
      "on"
    </script>
    <script type="importmap">
      { "imports": { "a": "./a.js" } }
    </script>
    <script type="application/ld+json">
      { "@context": "https://schema.org", "name": "x" }
    </script>
    <script type="speculationrules">
      { "prerender": [{ "source": "list" }] }
    </script>
    <script type="application/json">
      true
    </script>
    <script lang="json">
      { "a": 1 }
    </script>
  </div>
}
`,
		);
	});

	test('a Markdown or HTML body is formatted as Markdown or HTML', async () => {
		await expectFormat(
			`export function App() @{
  <div>
    <script type="text/markdown">
      #   Title
      * one
    </script>
    <script type="text/html"><div><p>hi</p></div></script>
  </div>
}`,
			`export function App() @{
  <div>
    <script type="text/markdown">
      # Title

      - one
    </script>
    <script type="text/html">
      <div><p>hi</p></div>
    </script>
  </div>
}
`,
		);
	});

	test("a body without a parser, or that its parser can't read, is kept on its own lines", async () => {
		await expectFormat(
			`export function App() @{
  <div>
    <script type="text/template">
          <div>
            x   y
          </div>
    </script>
    <script type="text/typescript">let   a: number = 1</script>
    <script src="x.js">let   a = 1</script>
    <script type={kind}>[1,2]</script>
    <script type="application/json">[1,2</script>
    <script>const broken = ;</script>
    <script type="text/x-foo">   </script>
  </div>
}`,
			`export function App() @{
  <div>
    <script type="text/template">
      <div>
        x   y
      </div>
    </script>
    <script type="text/typescript">
      let   a: number = 1
    </script>
    <script src="x.js">
      let   a = 1
    </script>
    <script type={kind}>
      [1,2]
    </script>
    <script type="application/json">
      [1,2
    </script>
    <script>
      const broken = ;
    </script>
    <script type="text/x-foo"></script>
  </div>
}
`,
		);
	});

	test('a kept body loses its first blank line and shared indentation, not its relative indentation', async () => {
		await expectFormat(
			`export function App() @{
  <div>
    <script>

            const a = 1;
            const broken = ;
              if (a) {
                go();
              }

    </script>
  </div>
}`,
			`export function App() @{
  <div>
    <script>

      const a = 1;
      const broken = ;
        if (a) {
          go();
        }
    </script>
  </div>
}
`,
		);
	});

	test('a kept body is indented with tabs under useTabs', async () => {
		await expectFormat(
			`export function App() @{\n  <script>\n    const broken = ;\n      go();\n  </script>\n}`,
			`export function App() @{\n\t<script>\n\t\tconst broken = ;\n\t\t  go();\n\t</script>\n}\n`,
			{ useTabs: true },
		);
	});

	test('a kept body with CRLF line endings keeps the line endings clean', async () => {
		const source =
			'export function App() @{\r\n  <script>\r\n    const a = 1;\r\n    const broken = ;\r\n      go();\r\n  </script>\r\n}\r\n';
		const lf =
			'export function App() @{\n  <script>\n    const a = 1;\n    const broken = ;\n      go();\n  </script>\n}\n';
		for (const endOfLine of /** @type {const} */ (['auto', 'lf', 'crlf'])) {
			await expectFormat(source, endOfLine === 'lf' ? lf : lf.replace(/\n/g, '\r\n'), {
				endOfLine,
			});
		}
	});
});

// Prettier's own pragma functions, so the options work as with Prettier's
// `typescript` parser.
describe('pragmas (#830)', () => {
	test('insertPragma adds @format', async () => {
		expect(await format(`const a  =  1;`, { insertPragma: true })).toBe(`/** @format */

const a = 1;
`);
	});

	test('requirePragma formats only a file with @format or @prettier', async () => {
		const plain = `const a  =  1;
`;
		expect(await format(plain, { requirePragma: true })).toBe(plain);
		expect(
			await format(
				`/** @format */
const a  =  1;
`,
				{ requirePragma: true },
			),
		).toBe(`/** @format */
const a = 1;
`);
	});

	test('checkIgnorePragma leaves a file with @noformat as written', async () => {
		const source = `/** @noformat */
const a  =  1;
`;
		expect(await format(source, { checkIgnorePragma: true })).toBe(source);
	});
});

describe('prettier/standalone', () => {
	test('formats with only this plugin, including <style> and <script> bodies', async () => {
		const source = `export function App() @{ <div class="x"><style>.x{color:red}</style><script>let  y = 2</script></div> }`;
		const options = { parser: 'tsrx', plugins: [plugin] };
		const output = await standalone.format(source, options);
		expect(output).toBe(`export function App() @{
  <div class="x">
    <style>
      .x {
        color: red;
      }
    </style>
    <script>
      let y = 2;
    </script>
  </div>
}
`);
		expect(output).toBe(await prettier.format(source, options));
	});

	test('formats JSON, HTML, and Markdown <script> bodies only with the plugins that parse them', async () => {
		const source = `export function App() @{ <div><script type="application/json">[1,2]</script><script type="text/html"><p>hi</p></script><script type="text/markdown">*  a</script></div> }`;
		expect(await standalone.format(source, { parser: 'tsrx', plugins: [plugin] })).toBe(
			`export function App() @{
  <div>
    <script type="application/json">
      [1,2]
    </script>
    <script type="text/html">
      <p>hi</p>
    </script>
    <script type="text/markdown">
      *  a
    </script>
  </div>
}
`,
		);
		const plugins = await Promise.all([
			import('prettier/plugins/babel'),
			import('prettier/plugins/estree'),
			import('prettier/plugins/html'),
			import('prettier/plugins/markdown'),
		]);
		expect(await standalone.format(source, { parser: 'tsrx', plugins: [plugin, ...plugins] }))
			.toBe(`export function App() @{
  <div>
    <script type="application/json">
      [1, 2]
    </script>
    <script type="text/html">
      <p>hi</p>
    </script>
    <script type="text/markdown">
      - a
    </script>
  </div>
}
`);
	});
});

// Where core's tree differs from typescript-estree's, the adapter reshapes it.
describe('the typescript-estree shape', () => {
	// typescript-estree has no parenthesized expressions, so Prettier's
	// `typescript` parser drops a JSDoc cast's parentheses; TypeScript applies
	// the cast only in JavaScript files (decision 39 in #852).
	test('a JSDoc type cast loses its parentheses, as with the typescript parser (#844)', async () => {
		await expectFormat(
			`const y = /** @type {Label} */ (value);
const s = /** @satisfies {Config} */ ({ a: 1 });
const a = <div x={/** @type {T} */ (y)}>{/** @type {T} */ (z)}</div>;`,
			`const y = /** @type {Label} */ value;
const s = /** @satisfies {Config} */ { a: 1 };
const a = <div x={/** @type {T} */ y}>{/** @type {T} */ z}</div>;
`,
		);
	});

	test("a comment in a class method's type parameters stays in them (#630)", async () => {
		await expectFormat(
			`class A {
  m</* c */ T>(a: T) {}
  n<
    // c
    T,
  >(a: T) {}
  static async *o /* a */ <T>(a: T) {}
}`,
			`class A {
  m</* c */ T>(a: T) {}
  n<
    // c
    T,
  >(a: T) {}
  static async *o/* a */ <T>(a: T) {}
}
`,
		);
	});
});

describe('type parameter modifiers', () => {
	// The name follows the modifiers and the comments between them (#839)
	test.each([
		['function f<const /* c */ T>() {}', 'function f<const /* c */ T>() {}\n'],
		['class A<in /* c */ out T> {}', 'class A<in out /* c */ T> {}\n'],
		['class B<in out /* c */ T> {}', 'class B<in out /* c */ T> {}\n'],
		['function h<const/* c */T>() {}', 'function h<const /* c */ T>() {}\n'],
		[
			'function k<const /* c */ T extends string = "a">() {}',
			'function k<const /* c */ T extends string = "a">() {}\n',
		],
		['const l = <const /* c */ T,>(x: T) => x;', 'const l = <const /* c */ T,>(x: T) => x;\n'],
	])('formats %j as Prettier does', async (input, expected) => {
		await expectFormat(input, expected);
	});
});

describe('a comment between an enum name and its `{` (#840)', () => {
	// The enum's body starts at the `{`, as in typescript-estree, so the
	// comment is Prettier's to place
	test.each([
		['enum E /* c */ { A }', 'enum E /* c */ {\n  A,\n}\n'],
		['const enum G /* c */ { A, B }', 'const enum G /* c */ {\n  A,\n  B,\n}\n'],
		['declare enum H /* c */ {}', 'declare enum H /* c */ {}\n'],
		['export enum J /* a */ /* b */ { A = 1 }', 'export enum J /* a */ /* b */ {\n  A = 1,\n}\n'],
	])(
		'keeps the block comment of %j outside the body, as Prettier does',
		async (input, expected) => {
			await expectFormat(input, expected);
		},
	);

	// Prettier moves a line comment there into the body, and its second format
	// moves it again (decision 48 in #852: printed as Prettier prints it, and on
	// the list of Prettier bugs to report)
	test('moves a line comment into the body on each format, as Prettier does', async () => {
		const first = await format('enum F // c\n{ A }');
		expect(first).toBe('enum F { // c\n  A,\n}\n');
		expect(await format(first)).toBe('enum F {\n  // c\n  A,\n}\n');
		for (const output of [first, 'enum F {\n  // c\n  A,\n}\n']) {
			const typescript = await prettier.format(output === first ? 'enum F // c\n{ A }' : first, {
				parser: 'typescript',
			});
			expect(typescript).toBe(output);
		}
	});
});

describe('parse errors', () => {
	test('unclosed or mismatched tags are errors, not guessed markup', async () => {
		await expect(format('const x = 1;\nconst y = <div>\n')).rejects.toThrow(/Unclosed tag '<div>'/);
		await expect(format('const a = <div></span>;\n')).rejects.toThrow();
	});

	test("errors are reported like Prettier's parsers report them", async () => {
		for (const [source, message, start] of [
			[
				'function App() @{\n  @if (x) {\n    <b />\n',
				"'}' expected. (4:1)",
				{ line: 4, column: 1 },
			],
			[
				'const y = <div>\n',
				"Unclosed tag '<div>'. Expected '</div>' before end of template. (2:1)",
				{ line: 2, column: 1 },
			],
			// Prettier's typescript parser: `Property assignment expected. (1:13)`.
			['const o = { @dec m() {} };', 'Unexpected token (1:13)', { line: 1, column: 13 }],
			// `index` belongs to `@for`: the output used to drop it (#896).
			['for (const item of []; index i) {}', "')' expected. (1:22)", { line: 1, column: 22 }],
			// Prettier's typescript parser: `';' expected. (1:25)`.
			[
				'const f = (x as number) => x;',
				'Unexpected type cast in parameter position. (1:12)',
				{ line: 1, column: 12 },
			],
			// Prettier's typescript parser: `';' expected. (1:23)`.
			['const k = async(a)(b) => 1;', 'Unexpected token (1:23)', { line: 1, column: 23 }],
			// Prettier's typescript parser: `Expression expected. (1:31)`.
			['const g = <T,>(x: T) => { x = ; };', 'Unexpected token (1:31)', { line: 1, column: 31 }],
			// Prettier's typescript parser: `'=>' expected. (1:22)`.
			[
				'const a = (x: number);',
				'Did not expect a type annotation here. (1:13)',
				{ line: 1, column: 13 },
			],
			// Prettier's typescript parser: `Expression expected. (1:15)`.
			['const c = f(x?);', 'Unexpected token (1:14)', { line: 1, column: 14 }],
		]) {
			const error = await format(/** @type {string} */ (source)).catch((/** @type {any} */ e) => e);
			expect(error).toBeInstanceOf(SyntaxError);
			expect(error.message.split('\n')[0]).toBe(message);
			expect(error.loc).toEqual({ start });
		}
	});

	test('mistakes TypeScript only reports as diagnostics still format', async () => {
		await expectFormat('let a = 1;\nlet a = 2;', 'let a = 1;\nlet a = 2;\n');
		await expectFormat(
			"function f() {\n  import a from 'a';\n  export const b = a;\n}",
			'function f() {\n  import a from "a";\n  export const b = a;\n}\n',
		);
		await expectFormat('function f() {\n  let\n}', 'function f() {\n  let;\n}\n');
		// Prettier's typescript parser formats these the same way: a repeated
		// modifier and an optional rest parameter's `?` aren't printed.
		await expectFormat('class A { readonly readonly x = 1; }', 'class A {\n  readonly x = 1;\n}\n');
		await expectFormat('declare declare class A {}', 'declare class A {}\n');
		await expectFormat('type A<in in T> = T;', 'type A<in T> = T;\n');
		await expectFormat('function f(...a?: number[]) {}', 'function f(...a: number[]) {}\n');
		// Nor a rest parameter's default, a modifier in a block, or `declare`
		// before an import.
		await expectFormat('function f(...a = []) {}', 'function f(...a) {}\n');
		await expectFormat(
			'const g = (...a: number[] = []) => a;',
			'const g = (...a: number[]) => a;\n',
		);
		await expectFormat('const h = async (...a = []) => a;', 'const h = async (...a) => a;\n');
		await expectFormat('type H = (...a = []) => void;', 'type H = (...a) => void;\n');
		await expectFormat(
			`function f() {
  public class A {}
}`,
			`function f() {
  class A {}
}
`,
		);
		await expectFormat('declare import x from "m";', 'import x from "m";\n');
		// Prettier's typescript parser formats an arrow function's optional rest
		// parameter the same way, async too.
		await expectFormat('const f = (...a?: number[]) => a;', 'const f = (...a: number[]) => a;\n');
		await expectFormat(
			'const f = async (x, ...a?: number[]) => a;',
			'const f = async (x, ...a: number[]) => a;\n',
		);
		// And a parameter's default in a signature.
		await expectFormat('type F = (a = 1) => void;', 'type F = (a = 1) => void;\n');
		await expectFormat(
			'interface I { m(a: number = 1): void; new ({ b } = { b: 2 }): I }',
			`interface I {
  m(a: number = 1): void;
  new ({ b } = { b: 2 }): I;
}
`,
		);
		// Prettier's typescript parser formats `let` as a name the same way.
		await expectFormat('var let = 1;\nclass let {}', 'var let = 1;\nclass let {}\n');
		// And a parameter after an arrow function's rest parameter.
		await expectFormat('const f = (...a, b) => [a, b];', 'const f = (...a, b) => [a, b];\n');
		await expectFormat(
			'const g = async (x, ...rest: string[], y) => x;',
			'const g = async (x, ...rest: string[], y) => x;\n',
		);
	});

	test("mistakes Prettier's typescript parser rejects are errors, not left out", async () => {
		for (const [source, message] of [
			['function f() {\n  const\n}', 'Variable declaration list cannot be empty. (2:8)'],
			['for (var; ;) {}', 'Variable declaration list cannot be empty. (1:9)'],
			['for (const of x) {}', 'Variable declaration list cannot be empty. (1:11)'],
			[
				'export function App() @{\n  var\n  <div />\n}',
				'Variable declaration list cannot be empty. (2:6)',
			],
			[
				'interface I { private x: number }',
				"'private' modifier cannot appear on a type member. (1:15)",
			],
			['interface I<public T> {}', "'public' modifier cannot appear on a type parameter. (1:13)"],
			[
				'class C { in x = 1 }',
				"'in' modifier can only appear on a type parameter of a class, interface or type alias. (1:11)",
			],
			['class A { public protected x = 1; }', 'Accessibility modifier already seen. (1:18)'],
			[
				'class A {\n  constructor(public ...rest: number[]) {}\n}',
				'A parameter property cannot be declared using a rest parameter. (2:15)',
			],
			[
				'const f = (a: number, public ...rest: number[]) => a;',
				'A parameter property cannot be declared using a rest parameter. (1:23)',
			],
			[
				'function f(private readonly x: number) {}',
				'A parameter property is only allowed in a constructor implementation. (1:12)',
			],
			[
				'type F = (public x: number) => void;',
				'A parameter property is only allowed in a constructor implementation. (1:11)',
			],
			[
				'const f = async (a, readonly [b]: number[]) => a;',
				'A parameter property is only allowed in a constructor implementation. (1:21)',
			],
			[
				'class A { constructor(public [a]: number[]) {} }',
				'A parameter property may not be declared using a binding pattern. (1:23)',
			],
			[
				'class A { constructor(public [a] = [1]) {} }',
				'A parameter property may not be declared using a binding pattern. (1:23)',
			],
			['import.source("x");', "The only valid meta property for import is 'import.meta' (1:8)"],
			['@dec function f() {}', 'Leading decorators must be attached to a class declaration. (1:1)'],
			[
				`class A {
  @dec constructor() {}
}`,
				"Decorators can't be used with a constructor. Did you mean '@dec class { ... }'? (2:3)",
			],
			[
				'export @dec const x = 1;',
				'Leading decorators must be attached to a class declaration. (1:8)',
			],
			[
				'export default @dec function f() {}',
				'Leading decorators must be attached to a class declaration. (1:16)',
			],
			[
				'@dec export function f() {}',
				'Leading decorators must be attached to a class declaration. (1:1)',
			],
			[
				'export abstract function f() {}',
				"'abstract' modifier can only appear on a class, method, or property declaration. (1:8)",
			],
			[
				'export abstract const x = 1;',
				"'abstract' modifier can only appear on a class, method, or property declaration. (1:8)",
			],
			// #697: `abstract` before an interface was kept without an error, and
			// before a function outside an export failed to parse.
			[
				'abstract interface I {}',
				"'abstract' modifier can only appear on a class, method, or property declaration. (1:1)",
			],
			[
				'export abstract interface I {}',
				"'abstract' modifier can only appear on a class, method, or property declaration. (1:8)",
			],
			[
				'abstract function f() {}',
				"'abstract' modifier can only appear on a class, method, or property declaration. (1:1)",
			],
			// #719: modifiers the tree has no place for, which TypeScript reports from
			// its checker, and which the output would leave out.
			[
				'public class A {}',
				"'public' modifier cannot appear on a module or namespace element. (1:1)",
			],
			[
				'export static let x = 1;',
				"'static' modifier cannot appear on a module or namespace element. (1:8)",
			],
			[
				'readonly function f() {}',
				"'readonly' modifier can only appear on a property declaration or index signature. (1:1)",
			],
			[
				'accessor class A {}',
				"'accessor' modifier can only appear on a property declaration. (1:1)",
			],
			['async class A {}', "'async' modifier cannot be used here. (1:1)"],
			['declare using x = y;', "'declare' modifier cannot appear on a 'using' declaration. (1:1)"],
			// Prettier reports the `public` (1:17); the plugin reports the first
			// mistake, the modifier before `export` (#902).
			[
				'abstract export public class A {}',
				"'export' modifier must precede 'abstract' modifier. (1:10)",
			],
			// #902: `async` in an ambient context (TS1040).
			[
				'export declare async function f(): void;',
				"'async' modifier cannot be used in an ambient context. (1:16)",
			],
			[
				'declare async function f(): void;',
				"'async' modifier cannot be used in an ambient context. (1:9)",
			],
			[
				'namespace N {\n  declare async function f(): void;\n}',
				"'async' modifier cannot be used in an ambient context. (2:11)",
			],
			// #902: a modifier before `export` (TS1029), where Prettier's output drops
			// the `export` (decision 60 of #852).
			['abstract export class A {}', "'export' modifier must precede 'abstract' modifier. (1:10)"],
			['declare export class A {}', "'export' modifier must precede 'declare' modifier. (1:9)"],
			[
				'declare export function f(): void;',
				"'export' modifier must precede 'declare' modifier. (1:9)",
			],
			['async export function f() {}', "'export' modifier must precede 'async' modifier. (1:7)"],
			[
				'declare export const x: number;',
				"'export' modifier must precede 'declare' modifier. (1:9)",
			],
			[
				'abstract export default class A {}',
				"'export' modifier must precede 'abstract' modifier. (1:10)",
			],
		]) {
			const error = await format(source).catch((/** @type {any} */ e) => e);
			expect(error, source).toBeInstanceOf(SyntaxError);
			expect(error.message.split('\n')[0], source).toBe(message);
		}
	});
});

// Prettier's typescript parser prints a class member's modifiers in order, and
// so does the plugin; only a modifier before `export` is an error (#902).
test("a class member's or parameter property's modifiers out of order print in order", async () => {
	await expectFormat(
		`class A extends B {
  static public a = 1;
  readonly static b = 1;
  override static c = 1;
  constructor(readonly public x: number) {
    super();
  }
}`,
		`class A extends B {
  public static a = 1;
  static readonly b = 1;
  static override c = 1;
  constructor(public readonly x: number) {
    super();
  }
}
`,
	);
});

// Prettier's typescript parser formats these the same way.
describe('rest parameters and `for` heads', () => {
	// An async arrow function's rest parameter ended before its type annotation,
	// so a comment between them moved after the annotation (#725).
	test("a comment before a rest parameter's type annotation stays there", async () => {
		await expectFormat(
			'const f = async (...a /* c */: number[]) => a;',
			'const f = async (...a /* c */ : number[]) => a;\n',
		);
		await expectFormat(
			'const g = (...a /* c */: number[]) => a;',
			'const g = (...a /* c */ : number[]) => a;\n',
		);
		await expectFormat(
			`const h = async (
  x,
  // rest
  ...rest: string[] // after
) => x;`,
			`const h = async (
  x,
  // rest
  ...rest: string[] // after
) => x;
`,
		);
	});

	// A type assertion in a `for…in` or `for…of` head failed to parse (#723).
	test('a type assertion in a `for…in` or `for…of` head', async () => {
		await expectFormat('for ((a as number) of x);', 'for (a as number of x);\n');
		await expectFormat('for ([a as number, b!] of x);', 'for ([a as number, b!] of x);\n');
		await expectFormat('for ({ a: b! } in {});', 'for ({ a: b! } in {});\n');
		await expectFormat('for ((a!) in {});', 'for (a! in {});\n');
	});

	// Without its parentheses, which Prettier drops, one in a `for await` head
	// failed to parse again (#769).
	test('a type assertion in a `for await` head', async () => {
		await expectFormat(
			`async function f(x) {
  for await ((a as number) of x);
  for await (a satisfies unknown of x);
}`,
			`async function f(x) {
  for await (a as number of x);
  for await (a satisfies unknown of x);
}
`,
		);
	});
});

// `abstract` before a line break after `export default` is the exported value,
// and the class on the next line a declaration of its own (#608).
describe('`abstract` before a line break after `export default`', () => {
	test.each([
		['export default abstract\nclass A {}', 'export default abstract;\nclass A {}\n'],
		[
			'declare module "m" {\n  export default abstract\n  class A {}\n}',
			'declare module "m" {\n  export default abstract;\n  class A {}\n}\n',
		],
	])('formats %j like Prettier', async (input, expected) => {
		await expectFormat(input, expected);
		expect(expected).toBe(await prettier.format(input, { parser: 'typescript' }));
	});
});

// Declarations that TypeScript reads and the parser failed on: `abstract
// declare class` (#697), `export default interface` with the name on the next
// line (#698), a type alias named `as` or `satisfies` (#699), and a global
// augmentation after `export` (#700), which TypeScript reports from its
// checker and Prettier's `typescript` parser prints.
describe('declarations after TypeScript keywords', () => {
	test.each([
		['abstract declare class A {}', 'declare abstract class A {}\n'],
		['export abstract declare class A {}', 'export declare abstract class A {}\n'],
		[
			`export default interface
I {}`,
			'export default interface I {}\n',
		],
		[
			`declare module "m" {
  export default interface
  I {}
}`,
			`declare module "m" {
  export default interface I {}
}
`,
		],
		['type as = 1;', 'type as = 1;\n'],
		['type satisfies<T> = T;', 'type satisfies<T> = T;\n'],
		['export global {}', 'export global {}\n'],
		['export declare global {}', 'export declare global {}\n'],
		// #716, #717, #718 and #720.
		[
			'type Uppercase<S extends string> = intrinsic;',
			'type Uppercase<S extends string> = intrinsic;\n',
		],
		[
			'let x: import("m", { with: { "resolution-mode": "import" } }).X;',
			'let x: import("m", { with: { "resolution-mode": "import" } }).X;\n',
		],
		['import \\u0074ype { a } from "m";', 'import type { a } from "m";\n'],
		['import { \\u0074ype a } from "m";', 'import { type a } from "m";\n'],
		[
			'export default @dec declare abstract class A {}',
			`export default
@dec
declare abstract class A {}
`,
		],
	])('formats %j like Prettier', async (input, expected) => {
		await expectFormat(input, expected);
		expect(expected).toBe(await prettier.format(input, { parser: 'typescript' }));
	});
});

// A `<` after a line break or a `}` reads as a tag start in TSRX, except
// where type arguments follow a superclass (#545) or a class or function
// expression (#578). A `const` type parameter on an object method failed to
// parse too (#631). They print as Prettier's `typescript` parser prints them.
describe('type arguments and parameters the parser used to reject', () => {
	test.each([
		['class A extends B\n<T> {}', 'class A extends B<T> {}\n'],
		[
			'class A extends B.C\n  <T, U>\n  implements I\n{}',
			'class A extends B.C<T, U> implements I {}\n',
		],
		['((class<T> { x?: T })<string>).name', '(class<T> {\n  x?: T;\n}<string>).name;\n'],
		['const A = class<T> { x?: T }<string>;', 'const A = class<T> {\n  x?: T;\n}<string>;\n'],
		[
			'const f = function <T>(x: T) { return x; }<string>(1);',
			'const f = (function <T>(x: T) {\n  return x;\n})<string>(1);\n',
		],
		['const v = new class<T> {}<string>();', 'const v = new (class<T> {})<string>();\n'],
		[
			'const o = { m<const T>(x: T) { return x; } };',
			'const o = {\n  m<const T>(x: T) {\n    return x;\n  },\n};\n',
		],
	])('formats %j like Prettier', async (input, expected) => {
		await expectFormat(input, expected);
		expect(expected).toBe(await prettier.format(input, { parser: 'typescript' }));
	});
});

/**
 * Format the part of `marked` between `«` and `»`, as an editor's "Format
 * Selection" does.
 * @param {string} marked
 * @param {prettier.Options} [options]
 */
async function formatSelection(marked, options = {}) {
	const rangeStart = marked.indexOf('«');
	const rangeEnd = marked.indexOf('»') - 1;
	return format(marked.replace('«', '').replace('»', ''), { ...options, rangeStart, rangeEnd });
}

describe('range formatting (#831)', () => {
	test('formats the statements in the range', async () => {
		expect(
			await formatSelection(`export function App() @{
  const a  =  1;
  «const b  =  2;»
  <div   class="x">{a  +  b}</div>
}
`),
		).toBe(`export function App() @{
  const a  =  1;
  const b = 2;
  <div   class="x">{a  +  b}</div>
}
`);
	});

	test("formats a template's output without a semicolon", async () => {
		expect(
			await formatSelection(`export function App() @{
  const a  =  1;
  @if (a) {
    «<b>{a  +  1}</b>»
  }
}
`),
		).toBe(`export function App() @{
  const a  =  1;
  @if (a) {
    <b>{a + 1}</b>
  }
}
`);
		// A range inside markup grows to the output, as it grows to the statement
		// in JavaScript.
		expect(
			await formatSelection(`export function App() @{
  const a  =  1;
  <div   class="x">«{a  +  b}»</div>
}
`),
		).toBe(`export function App() @{
  const a  =  1;
  <div class="x">{a + b}</div>
}
`);
	});

	test('formats a directive, its branches and its bodies where they are', async () => {
		expect(
			await formatSelection(`export function App() @{
  const a  =  1;
  «@if (a) {
    const y  =  2;
    <b>{y  +  1}</b>
  } @else {
    <i   />
  }»
}
`),
		).toBe(`export function App() @{
  const a  =  1;
  @if (a) {
    const y = 2;
    <b>{y + 1}</b>
  } @else {
    <i />
  }
}
`);
		expect(
			await formatSelection(`export function App() @{
  <>
    @if (a) {
      <b>1</b>
    } @else «if (b) {
      <i  >2</i>
    }»
  </>
}
`),
		).toBe(`export function App() @{
  <>
    @if (a) {
      <b>1</b>
    } @else if (b) {
      <i>2</i>
    }
  </>
}
`);
		expect(
			await formatSelection(`export function App() @{
  @try {
    <Child   />
  } @pending «{}»
}
`),
		).toBe(`export function App() @{
  @try {
    <Child   />
  } @pending {}
}
`);
	});

	test('formats a `@{ … }` value without adding its parentheses again', async () => {
		expect(
			await formatSelection(`const inner = («@{
    const x  =  1;
    <p>{x}</p>
  }»);
`),
		).toBe(`const inner = (@{
  const x = 1;
  <p>{x}</p>
});
`);
	});

	test('formats a statement that only parses where it is', async () => {
		expect(
			await formatSelection(`function* g(x) {
  «return x ? <input title={yield   x} /> : null;»
}
`),
		).toBe(`function* g(x) {
  return x ? <input title={yield x} /> : null;
}
`);
	});

	test('keeps the text of a range that is several children of an element', async () => {
		// Prettier 3.9 grows this range to the two `@if` children, which print only
		// with the element's layout between them.
		const source = `export function App() @{
  <ul>
    @if (a) {
      «<li   />
    }
    @if (b) {
      <li   />»
    }
  </ul>
}
`;
		expect(await formatSelection(source)).toBe(source.replace('«', '').replace('»', ''));
	});

	test('formats a `<script>` body in the range as its own code', async () => {
		expect(
			await formatSelection(`const a  =  1;
«function Page() @{
  <script>const b  =  2;</script>
}»
const c  =  3;
`),
		).toBe(`const a  =  1;
function Page() @{
  <script>
    const b = 2;
  </script>
}
const c  =  3;
`);
	});

	test('keeps the cursor on the same text', async () => {
		const source = `export function App() @{
  @if (a) {
    <b>{a  +  1}</b>
  }
}
`;
		const rangeStart = source.indexOf('<b>');
		const result = await prettier.formatWithCursor(source, {
			parser: 'tsrx',
			plugins: [plugin],
			rangeStart,
			rangeEnd: source.indexOf('\n  }'),
			cursorOffset: source.indexOf('1'),
		});
		expect(result.formatted.slice(result.cursorOffset)).toMatch(/^1\}<\/b>/u);
	});

	test("leaves Prettier's own typescript parser to other files", async () => {
		const source = 'const a  =  1;\nconst b  =  2;\n';
		const options = {
			plugins: [plugin],
			rangeStart: source.indexOf('const b'),
			rangeEnd: source.length,
		};
		await format('export function App() @{ <p   /> }', { ...options, rangeStart: 0, rangeEnd: 10 });
		expect(await prettier.format(source, { ...options, parser: 'typescript' })).toBe(
			'const a  =  1;\nconst b = 2;\n',
		);
	});
});

describe('decorator arguments', () => {
	test('break with a trailing comma, which parses again (#773)', async () => {
		await expectFormat(
			`@Component(someLongDecoratorArgumentName, anotherLongDecoratorArgumentName, third)
class A {}
`,
			`@Component(
  someLongDecoratorArgumentName,
  anotherLongDecoratorArgumentName,
  third,
)
class A {}
`,
		);
		await expectFormat(
			`@dec(/* e */ {
  // c
})
class A {}
`,
			`@dec(
  /* e */ {
    // c
  },
)
class A {}
`,
		);
	});
});

// An empty directive body prints as the statement the directive is written like
// prints it: on two lines, except a `@catch` body, which stays `{}` as a
// `catch` without `finally` does (#897). From `@tsrx/prettier-plugin`'s
// "expands empty braces" tests.
describe('empty directive bodies', () => {
	test('@if, @else, @for and @empty', async () => {
		await expectFormat(
			`export function App() @{
  <>
    @if (ready) {} @else {}
    @if (a) {} @else if (b) {} @else {}
    @for (const item of items) {} @empty {}
  </>
}`,
			`export function App() @{
  <>
    @if (ready) {
    } @else {
    }
    @if (a) {
    } @else if (b) {
    } @else {
    }
    @for (const item of items) {
    } @empty {
    }
  </>
}
`,
		);
	});

	test('@try, @pending and @catch', async () => {
		await expectFormat(
			`function Foo() @{
  @try {} @pending {} @catch {}
}
function Bar() @{
  @try {} @catch (e, reset) {}
}`,
			`function Foo() @{
  @try {
  } @pending {
  } @catch {}
}
function Bar() @{
  @try {
  } @catch (e, reset) {}
}
`,
		);
	});
});

// `@catch (error, reset)` breaks its parentheses around a parameter with a
// comment by it, as Prettier's `printCatchClause` breaks `catch (e)`'s (#898).
// A line comment after `)` became the body's on a second format.
describe('@catch parameters with comments', () => {
	test('a line comment after the parameters stays with them', async () => {
		await expectFormat(
			`function A() @{
  @try {
    <B />
  } @catch (e, reset) // c
  {
    <p>{"error"}</p>
  }
}`,
			`function A() @{
  @try {
    <B />
  } @catch (
    e,
    reset // c
  ) {
    <p>{"error"}</p>
  }
}
`,
		);
	});

	test('as Prettier prints one parameter', async () => {
		await expectFormat(
			`function A() @{
  @try {
    <B />
  } @catch (e) // c
  {
    <p />
  }
}`,
			`function A() @{
  @try {
    <B />
  } @catch (
    e // c
  ) {
    <p />
  }
}
`,
		);
		await expectFormat(
			`function A() @{
  @try {
    <B />
  } @catch (
    // a
    e, reset) {
    <p />
  }
}`,
			`function A() @{
  @try {
    <B />
  } @catch (
    // a
    e,
    reset
  ) {
    <p />
  }
}
`,
		);
		// A block comment on the line stays on it, as in Prettier.
		await expectFormat(
			`function A() @{
  @try {
    <B />
  } @catch (e, /* c */ reset) {
    <p />
  }
}`,
			`function A() @{
  @try {
    <B />
  } @catch (e, /* c */ reset) {
    <p />
  }
}
`,
		);
	});
});
