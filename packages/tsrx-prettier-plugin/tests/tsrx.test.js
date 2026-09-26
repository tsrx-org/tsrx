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

	test('dynamic tags', async () => {
		await expectFormat(`const d = <{Tag} a="1">x</{Tag}>;`, `const d = <{Tag} a="1">x</{Tag}>;\n`);
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
			`const s = <><script type="text/typescript">const x:number=1 // one
</script></>;`,
			`const s = (
  <>
    <script type="text/typescript">
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
			'references in an element in a dynamic tag name',
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

	test('inline block comments keep the spacing around them', async () => {
		await expectFormat(
			`const a = <p>one /* two */ three</p>;
const b = <p><a />/* c */<b /></p>;`,
			`const a = <p>one /* two */ three</p>;
const b = (
  <p>
    <a />/* c */<b />
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

	// A comment adds nothing to the text around it: the whitespace on its two
	// sides is one run, which renders a space without a line break, and nothing
	// with one beside an element or the start or end of the children (#639).
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
    <div>
      /* c */ 2
    </div>
    <div>
      {x} /* c */
    </div>
    <p>
      <i />{" "}// c
    </p>
  </>
}
`,
		);
	});

	// A `{" "}` is the space in the run, but it is not a space or tab touching
	// the comment, and a comment inside it is that expression's.
	test('a {" "} beside a comment keeps its space, and a comment inside it', async () => {
		await expectFormat(
			`export function App() @{
  <>
    <div>hello{" "}/* c */world</div>
    <div>hello/* c */{" "}world</div>
    <div><b />{" "}/* c */<i /></div>
    <div><b />/* c */{" "}<i /></div>
    <div>hello{" "}// c
    world</div>
    <div>hello{" " /* note */}/* c */world</div>
    <div>hello/* c */{" " /* note */}world</div>
    <div>{/* note */ " "}/* c */x</div>
  </>
}`,
			`export function App() @{
  <>
    <div>hello /* c */world</div>
    <div>hello/* c */ world</div>
    <div>
      <b /> /* c */<i />
    </div>
    <div>
      <b />/* c */ <i />
    </div>
    <div>
      hello{" "}// c
      world
    </div>
    <div>hello{" " /* note */}/* c */world</div>
    <div>hello/* c */{" " /* note */}world</div>
    <div>{/* note */ " "}/* c */x</div>
  </>
}
`,
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

describe('<script> bodies', () => {
	test('with embedded formatting off, <style> and <script> bodies are kept as written (#503)', async () => {
		await expectFormat(
			`function App() @{ <><style>.x {  color: red }</style><script>const  x=1</script></> }`,
			`function App() @{
  <>
    <style>.x {  color: red }</style>
    <script>const  x=1</script>
  </>
}
`,
			{ embeddedLanguageFormatting: 'off' },
		);
	});

	test('only JavaScript and TypeScript bodies are formatted', async () => {
		await expectFormat(
			`const s = <>
<script>let  y = 2</script>
<script type="module">import a from "a"</script>
<script type="application/json">[1,2]</script>
</>;`,
			`const s = (
  <>
    <script>
      let y = 2;
    </script>
    <script type="module">
      import a from "a";
    </script>
    <script type="application/json">[1,2]</script>
  </>
);
`,
		);
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
});

// Where core's tree differs from typescript-estree's, the adapter reshapes it.
describe('the typescript-estree shape', () => {
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
		await expectFormat('function f(...a?: number[]) {}', 'function f(...a: number[]) {}\n');
		// The tree keeps the decorator, which Prettier's parsers reject.
		await expectFormat(
			'class A { @dec constructor() {} }',
			'class A {\n  @dec constructor() {}\n}\n',
		);
		// The tree keeps these too, which Prettier's typescript parser rejects: a
		// parameter property with a pattern, and one on a function's parameter.
		await expectFormat(
			'class A { constructor(public [a]: number[]) {} }',
			'class A {\n  constructor(public [a]: number[]) {}\n}\n',
		);
		await expectFormat(
			'function f(private readonly x: number) {}',
			'function f(private readonly x: number) {}\n',
		);
		// And a parameter property on a signature's or an arrow function's
		// parameter, and one with a pattern and a default.
		await expectFormat(
			'type F = (public x: number) => void;',
			'type F = (public x: number) => void;\n',
		);
		await expectFormat(
			'const f = async (a, readonly [b]: number[]) => a;',
			'const f = async (a, readonly [b]: number[]) => a;\n',
		);
		await expectFormat(
			'class A { constructor(public [a] = [1]) {} }',
			'class A {\n  constructor(public [a] = [1]) {}\n}\n',
		);
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
			['@dec function f() {}', 'Leading decorators must be attached to a class declaration. (1:1)'],
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
		]) {
			const error = await format(source).catch((/** @type {any} */ e) => e);
			expect(error, source).toBeInstanceOf(SyntaxError);
			expect(error.message.split('\n')[0], source).toBe(message);
		}
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
