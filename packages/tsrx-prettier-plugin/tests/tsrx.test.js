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
	});

	test("mistakes Prettier's typescript parser rejects are errors, not left out", async () => {
		for (const [source, message] of [
			['function f() {\n  const\n}', 'Variable declaration list cannot be empty. (2:8)'],
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
		]) {
			const error = await format(source).catch((/** @type {any} */ e) => e);
			expect(error, source).toBeInstanceOf(SyntaxError);
			expect(error.message.split('\n')[0], source).toBe(message);
		}
	});
});
