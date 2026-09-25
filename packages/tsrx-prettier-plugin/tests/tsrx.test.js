// TSRX syntax, which Prettier's own tests don't cover.

import * as prettier from 'prettier';
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

	test('arrow body and assigned value', async () => {
		await expectFormat(
			`const A = () => @{ const a = 1
<b>{a}</b> }
const c = @{ <i /> }`,
			`const A = () => @{
  const a = 1;
  <b>{a}</b>
};
const c = @{
  <i />
};
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

	test('@if breaks a long condition inside its parentheses', async () => {
		await expectFormat(
			`const A = () => @if (someCondition && anotherCondition && yetAnotherCondition && oneMore) { <b /> }`,
			`const A = () => @if (
  someCondition &&
  anotherCondition &&
  yetAnotherCondition &&
  oneMore
) {
  <b />
};
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
			`const S = ({ status }) => @switch (status) {
  @case "loading": {
    <Spinner />
  }
  @default: {
    <p>Done</p>
  }
};
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
			`const S = ({ status }) => @switch (status) {
  @case "a": {
    // first
    <A />
  }

  @case "b": {
  }
  @default: {
    <p>Done</p>
  }
};
`,
		);
	});

	test('@try with @pending and @catch (error, reset)', async () => {
		await expectFormat(
			`export const App = () => @try { <Child /> } @pending { <Loading /> } @catch (e, reset) { <button onClick={reset}>{String(e)}</button> }`,
			`export const App = () => @try {
  <Child />
} @pending {
  <Loading />
} @catch (e, reset) {
  <button onClick={reset}>{String(e)}</button>
};
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
