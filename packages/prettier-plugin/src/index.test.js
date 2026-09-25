import { describe, it, expect } from 'vitest';
import prettier from 'prettier';
import standalonePrettier from 'prettier/standalone';
import estreePlugin from 'prettier/plugins/estree';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { languages, parsers, printers } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

expect.extend({
	toBeWithNewline(received, expected) {
		const expectedWithNewline = expected.endsWith('\n') ? expected : expected + '\n';
		const pass = received === expectedWithNewline;

		return {
			pass,
			message: () => {
				const { matcherHint, EXPECTED_COLOR, RECEIVED_COLOR } = this.utils;

				/**
				 * @param {string} str
				 * @param {(str: string) => string} colorFn
				 */
				const formatWithColor = (str, colorFn) => {
					return colorFn(str);
				};

				// Just apply color without modifying the string
				return (
					matcherHint('toBeWithNewline') +
					'\n\nExpected:\n' +
					formatWithColor(expectedWithNewline, EXPECTED_COLOR) +
					'\nReceived:\n' +
					formatWithColor(received, RECEIVED_COLOR)
				);
			},
		};
	},
});

describe('prettier-plugin', () => {
	it('registers .tsrx as a supported file extension', () => {
		const tsrx_language = languages?.[0];

		if (!tsrx_language) {
			throw new Error('Missing TSRX language metadata');
		}

		expect(tsrx_language.extensions).toContain('.tsrx');
		expect(tsrx_language.parsers).toContain('tsrx');
		expect(parsers?.tsrx).toBeDefined();
		expect(parsers?.ripple).toBeUndefined();
	});

	/**
	 * Format tsrx source. Every call also verifies the output is a fixpoint:
	 * formatting must be single-pass idempotent (a second pass may not change
	 * a single byte), so the whole suite doubles as an idempotence corpus.
	 * @param {string} code
	 * @param {import('prettier').Options} [options]
	 */
	const format = async (code, options = {}) => {
		/** @type {import('prettier').Options} */
		const resolvedOptions = {
			parser: 'tsrx',
			plugins: [join(__dirname, 'index.js')],
			...options,
		};
		const once = await prettier.format(code, resolvedOptions);
		const twice = await prettier.format(once, resolvedOptions);
		expect(twice, 'formatting must be idempotent (second pass changed the output)').toBe(once);
		return once;
	};

	it('formats functions that return native elements', async () => {
		const input = `export function App(){return <div id="app">{"Hello"}</div>}`;
		const expected = `export function App() {
  return <div id="app">{"Hello"}</div>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats dynamic element tags', async () => {
		const input = `function App(props){const Child='div';return <{Child} {...props} class="card"><span>Hello</span></{Child}>}`;
		const expected = `function App(props) {
  const Child = "div";
  return (
    <{Child} {...props} class="card">
      <span>Hello</span>
    </{Child}>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats dynamic element tag expressions', async () => {
		const input = `function App(){return <><{registry.item}/><{items[0]}/><{'section'}/><{\`article\`}/></>;}`;
		const expected = `function App() {
  return (
    <>
      <{registry.item} />
      <{items[0]} />
      <{"section"} />
      <{\`article\`} />
    </>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats a fragment code block with setup and template control flow', async () => {
		const input = `function App(){return <>@{
const items=[1,2,3];
@for(const item of items; index i; key item){<div>{i}{item}</div>}
}</>}`;
		const expected = `function App() {
  return (
    <>@{
      const items = [1, 2, 3];
      @for (const item of items; index i; key item) {
        <div>
          {i}
          {item}
        </div>
      }
    }</>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats setup statements and wrapped render output in a fragment code block', async () => {
		const input = `function SetTest() {
    return <>@{
        let items = new ReactiveSet([1, 2, 3]);
        const hasValue = track(() => items.has(2));
        <>
            <button onClick={() => items.delete(2)}>{'delete'}</button>
            <pre>{hasValue.value}</pre>
        </>
    }</>;
}`;
		const expected = `function SetTest() {
  return (
    <>@{
      let items = new ReactiveSet([1, 2, 3]);
      const hasValue = track(() => items.has(2));
      <>
        <button onClick={() => items.delete(2)}>{"delete"}</button>
        <pre>{hasValue.value}</pre>
      </>
    }</>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps nested code-only fragments multiline', async () => {
		const input = `function App() {
    return <>@{
        MyContext.set(4);
        <>
            <h3>
                {MyContext.get()}
            </h3>
            <h4>
                {'2x:'}
                {doubleContext()}
            </h4>
            <>@{ MyContext.set(8); }</>
        </>
    }</>;
}`;
		const expected = `function App() {
  return (
    <>@{
      MyContext.set(4);
      <>
        <h3>{MyContext.get()}</h3>
        <h4>
          {"2x:"}
          {doubleContext()}
        </h4>
        <>@{
          MyContext.set(8);
        }</>
      </>
    }</>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats template for-of expressions without adding a semicolon before of', async () => {
		const input = `const App=()=> <><ul>@for (const item of items) {<li>{item.label}</li>}</ul></>;`;
		const expected = `const App = () => (
  <>
    <ul>
      @for (const item of items) {
        <li>{item.label}</li>
      }
    </ul>
  </>
);`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats line comments before template children', async () => {
		const input = `const App=()=> <>
// keep the status visible
<span>Ready</span>
</>;`;
		const expected = `const App = () => (
  <>
    // keep the status visible
    <span>Ready</span>
  </>
);`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats line comments before template text in control flow', async () => {
		const input = `const App=()=> <>
@switch (value) {
@case 'a': {
// explain case a
<>A</>
}
@default: {
<>Fallback</>
}
}
@try {
// render the panel when ready
<Panel />
} @catch (error) {
// render plain text fallback
<>Error</>
}
</>;`;
		const expected = `const App = () => (
  <>
    @switch (value) {
      @case "a": {
        // explain case a
        <>A</>
      }
      @default: {
        <>Fallback</>
      }
    }
    @try {
      // render the panel when ready
      <Panel />
    } @catch (error) {
      // render plain text fallback
      <>Error</>
    }
  </>
);`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('preserves fragment shorthand for simple returned TSRX expressions', async () => {
		const input = `const App=()=> <><span>{"Ready"}</span></>;`;
		const expected = `const App = () => (
  <>
    <span>{"Ready"}</span>
  </>
);`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps native fragments expression based', async () => {
		const input = `function App(){return <><div>Hello world</div>{value}</>}`;
		const expected = `function App() {
  return (
    <>
      <div>Hello world</div>
      {value}
    </>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats style tags inside returned TSRX', async () => {
		const input = `export default function App(){return <><style>div{color:red}</style></>}`;
		const expected = `export default function App() {
  return (
    <>
      <style>
        div {
          color: red;
        }
      </style>
    </>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats style tags with standalone Prettier', async () => {
		const input = `export default function App() @{
	<style>
		.demo { display: grid; gap: 0.5rem; justify-items: start; }
		button { padding: 0.4rem 0.9rem; color: inherit; }
	</style>
}`;
		const expected = `export default function App() @{
	<style>
		.demo {
			display: grid;
			gap: 0.5rem;
			justify-items: start;
		}
		button {
			padding: 0.4rem 0.9rem;
			color: inherit;
		}
	</style>
}`;
		const options = {
			parser: 'tsrx',
			plugins: [{ languages, parsers, printers }, estreePlugin],
			useTabs: true,
			tabWidth: 2,
			singleQuote: true,
			printWidth: 100,
		};

		const result = await standalonePrettier.format(input, options);
		expect(result).toBeWithNewline(expected);
		expect(await standalonePrettier.format(result, options)).toBe(result);
	});

	it('preserves style lines when embedded formatting is disabled', async () => {
		const input = `export default function App() @{
	<style>
		.demo {
			display: grid;
			gap: 0.5rem;
		}
		button {
			color: inherit;
		}
	</style>
}`;

		const options = {
			useTabs: true,
			singleQuote: true,
			embeddedLanguageFormatting: 'off',
		};
		const result = await format(input, options);

		expect(result).toBeWithNewline(input);
		expect(await format(result, options)).toBe(result);
	});

	it('preserves style lines when embedded formatting fails', async () => {
		const input = `export default function App() @{
	<style>
		.demo {
			color red;
		}
	</style>
}`;
		const options = { useTabs: true, singleQuote: true };
		const result = await format(input, options);

		expect(result).toBeWithNewline(input);
		expect(await format(result, options)).toBe(result);
	});

	it('formats setup statements before the TSRX return', async () => {
		const input = `function Counter(){let count=track(0);const increment=()=>count++;return <button onClick={increment}>{count}</button>}`;
		const expected = `function Counter() {
  let count = track(0);
  const increment = () => count++;
  return <button onClick={increment}>{count}</button>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps single-line text and expression children inline when they fit', async () => {
		const input = `export function App() {
  let [count] = track(0);
  return <div>
    <p>Count: {count}</p>
    <p>Count: {count}</p>
    <button onClick={() => count++}>Increment</button>
  </div>;
}`;
		const expected = `export function App() {
  let [count] = track(0);
  return (
    <div>
      <p>Count: {count}</p>
      <p>Count: {count}</p>
      <button onClick={() => count++}>Increment</button>
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps a lone binary expression child inline when it fits', async () => {
		const input = `export function App() @{
  <h2>{'Count: ' + count}</h2>
}`;
		const expected = `export function App() @{
  <h2>{'Count: ' + count}</h2>
}`;

		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('indents a lone binary expression child when it wraps', async () => {
		const input = `export function App() @{
  <h2>{firstLongIdentifier + secondLongIdentifier + thirdLongIdentifier}</h2>
}`;
		const expected = `export function App() @{
  <h2>
    {firstLongIdentifier +
      secondLongIdentifier +
      thirdLongIdentifier}
  </h2>
}`;

		const result = await format(input, { printWidth: 40 });
		expect(result).toBeWithNewline(expected);
	});

	it('indents a lone binary expression child after wrapped attributes', async () => {
		const input = `export function App() @{
  <h2 firstLongAttributeName={firstLongAttributeValue} secondLongAttributeName={secondLongAttributeValue}>{a + b}</h2>
}`;
		// Like Prettier, an attribute value that doesn't fit breaks inside its braces.
		const expected = `export function App() @{
  <h2
    firstLongAttributeName={
      firstLongAttributeValue
    }
    secondLongAttributeName={
      secondLongAttributeValue
    }
  >
    {a + b}
  </h2>
}`;

		const result = await format(input, { printWidth: 50 });
		expect(result).toBeWithNewline(expected);
	});

	it('preserves authored multiline whitespace around a single JSXText child', async () => {
		const input = `function Foo() @{
  @if (props.onRemove) {
    <button
      class={\`\${styles.actionButton} \${styles.actionButtonDanger}\`}
      type="button"
      onClick={() => {
        void props.onRemove?.();
      }}
    >
      Remove shortcut
    </button>
  }
}`;

		const expected = `function Foo() @{
  @if (props.onRemove) {
    <button
      class={\`\${styles.actionButton} \${styles.actionButtonDanger}\`}
      type="button"
      onClick={() => {
        void props.onRemove?.();
      }}
    >
      Remove shortcut
    </button>
  }
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('preserves inline text spaces around expression children', async () => {
		const input = `function Test(){return <div><p class="status">Visible: {String(visible)}</p><p>{name} is visible</p><p>Hello {name}!</p></div>}`;
		const expected = `function Test() {
  return (
    <div>
      <p class="status">Visible: {String(visible)}</p>
      <p>{name} is visible</p>
      <p>Hello {name}!</p>
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps expression children glued across whitespace-free text', async () => {
		const input = `function Test() {
  return <a href={x}>
    {state.owner}/{state.repoName}
    <ExternalLink className="w-3 h-3" />
  </a>;
}`;
		const expected = `function Test() {
  return (
    <a href={x}>
      {state.owner}/{state.repoName}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps expression siblings glued across multi-word text', async () => {
		const input = `function Test() {
  return <div>
    {a}some words here{b}
    <Foo />
  </div>;
}`;
		const expected = `function Test() {
  return (
    <div>
      {a}some words here{b}
      <Foo />
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps space-separated children on one line and directly adjacent expressions on their own lines', async () => {
		// The spaces around the slash render, so a line break there would drop them.
		const input = `function Test() {
  return <div>
    {a} / {b}
    {c}{d}
    <Foo />
  </div>;
}`;
		const expected = `function Test() {
  return (
    <div>
      {a} / {b}
      {c}
      {d}
      <Foo />
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps fragment expression children glued across whitespace-free text', async () => {
		const input = `function Test() {
  return <>
    {state.owner}/{state.repoName}
    <Foo />
  </>;
}`;
		const expected = `function Test() {
  return (
    <>
      {state.owner}/{state.repoName}
      <Foo />
    </>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats text line breaks properly', async () => {
		const input = `function Test() {
  return <div>
    <p class="status">Visible:

      {String(visible)}</p>
    <p>{name}

      is visible</p>
    <p>Hello {name}!</p>
  </div>;
}`;

		const expected = `function Test() {
  return (
    <div>
      <p class="status">
        Visible:
        {String(visible)}
      </p>
      <p>
        {name}
        is visible
      </p>
      <p>Hello {name}!</p>
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('preserves multiline text and expression children', async () => {
		const input = `export function App() {
  let [count] = track(0);
  return <div>
    <p>
      "Count: "
      {count}
    </p>
  </div>;
}`;
		const expected = `export function App() {
  let [count] = track(0);
  return (
    <div>
      <p>"Count: "{count}</p>
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats async component functions that await before returning TSRX', async () => {
		const input = `export async function App(){const data=await fetchData();return <pre>{data}</pre>}`;
		const expected = `export async function App() {
  const data = await fetchData();
  return <pre>{data}</pre>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats object methods that return TSRX', async () => {
		const input = `const UI={Button({children}:{children:any}){return <button>{children}</button>}};`;
		const expected = `const UI = {
  Button({ children }: { children: any }) {
    return <button>{children}</button>;
  },
};`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats generic function components and generic tags', async () => {
		const input = `function Box<T>({value}:{value:T}){return <div>{value}</div>}function App(){return <Box<string> value={"hello"}/>}`;
		const expected = `function Box<T>({ value }: { value: T }) {
  return <div>{value}</div>;
}
function App() {
  return <Box<string> value="hello" />;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats raw HTML props inside native elements', async () => {
		const input = `function App(){return <article innerHTML={source}/>}`;
		const expected = `function App() {
  return <article innerHTML={source} />;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps TypeScript assertion expressions parenthesized before non-null assertions', async () => {
		const input = `function App(){return <div>{(child("value") as any)!}{(child("ok") satisfies any)!}</div>}`;
		const expected = `function App() {
  return (
    <div>
      {(child("value") as any)!}
      {(child("ok") satisfies any)!}
    </div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats construct signatures inside chained type assertions', async () => {
		const input = `const Constructed = function Constructed(label: string) {
  return child(label);
} as unknown as {
  new (label: string): ReturnType<typeof child>;
};`;
		const expected = `const Constructed = function Constructed(label: string) {
  return child(label);
} as unknown as {
  new (label: string): ReturnType<typeof child>;
};`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats returned TSRX fragments', async () => {
		const result = await format('function App() { return <> <div /> </>; }');
		// The spaces around <div /> render, so they print as {" "} on broken lines.
		expect(result).toBeWithNewline(`function App() {
  return (
    <>
      {" "}
      <div />{" "}
    </>
  );
}`);
	});

	it('formats a multiline parenthesized self-closing expression', async () => {
		const result = await format(`const value = (
  <Item />
);`);

		expect(result).toBeWithNewline('const value = <Item />;');
	});

	it('formats a return ternary from a self-closing element to a fragment', async () => {
		const input = `function ElementToFragment(condition) {
  return condition ? (
    <Item />
  ) : (
    <>
      <Item />
    </>
  );
}`;
		const expected = `function ElementToFragment(condition) {
  return condition
    ? <Item />
    : <>
        <Item />
      </>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
		expect(await format(result)).toBe(result);
	});

	it('formats a return ternary from a self-closing element to an array', async () => {
		const input = `function ElementToArray(condition) {
  return condition ? (
    <Item />
  ) : (
    [<Item />]
  );
}`;
		const expected = `function ElementToArray(condition) {
  return condition ? <Item /> : [<Item />];
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
		expect(await format(result)).toBe(result);
	});

	it('hugs a `@{ }` code block to an element body', async () => {
		const input = `function App(){return <div>@{const x=1;<span>{x}</span>}</div>}`;
		const expected = `function App() {
  return (
    <div>@{
      const x = 1;
      <span>{x}</span>
    }</div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats a code-only `@{ }` block', async () => {
		const input = `function App(){return <div>@{let count=track(0);effect(()=>log(count));}</div>}`;
		const expected = `function App() {
  return (
    <div>@{
      let count = track(0);
      effect(() => log(count));
    }</div>
  );
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats a `@{ }` block returned directly from an arrow body', async () => {
		const input = `const G=()=>@{const a=5;<div>{a}</div>}`;
		const expected = `const G = () => @{
  const a = 5;
  <div>{a}</div>
};`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats a function declaration with a `@{ }` body', async () => {
		const input = `function Something() @{const a=5;<div>{a}</div>}`;
		const expected = `function Something() @{
  const a = 5;
  <div>{a}</div>
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats @if/else directive bodies in a plain JSX body', async () => {
		const input = `const App=()=> <div>@if(ready){<span>Ready</span>}@else{<span>Waiting</span>}</div>;`;
		const expected = `const App = () => (
  <div>
    @if (ready) {
      <span>Ready</span>
    } @else {
      <span>Waiting</span>
    }
  </div>
);`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats `@{ }` blocks idempotently', async () => {
		const input = `function App(){return <>@{
const items=[1,2,3];
@for(const item of items; index i; key item){<div>{i}{item}</div>}
}</>}`;
		const once = await format(input);
		const twice = await format(once);
		expect(twice).toBe(once);
	});

	it('should format a simple function', async () => {
		const input = `export function Test(){let count=0;<div>{"Hello"}</div>}`;
		const expected = `export function Test() {
  let count = 0;
  <div>{'Hello'}</div>
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('should format tsrx expression fragments', async () => {
		const input = `function App(){const content=<>@{const label="Hi";<><div>Hello {label}</div>{content}</>}</>;}`;
		const expected = `function App() {
  const content = (
    <>@{
      const label = 'Hi';
      <>
        <div>Hello {label}</div>
        {content}
      </>
    }</>
  );
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('should format direct @{} assignment formatting with fragments', async () => {
		const input = `function App(){const content=@{const label="Hi";<><div>Hello {label}</div>{content}</>};}`;
		const expected = `function App() {
  const content = (
    @{
      const label = 'Hi';
      <>
        <div>Hello {label}</div>
        {content}
      </>
    }
  );
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('should format direct @if assignment formatting with fragments', async () => {
		const input = `function App(){const content=@if(a>b){const label="Hi";<><div>Hello {label}</div>{content}</>};}`;
		const expected = `function App() {
  const content = (
    @if (a > b) {
      const label = 'Hi';
      <>
        <div>Hello {label}</div>
        {content}
      </>
    }
  );
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('keeps ordinary single-expression blocks expanded', async () => {
		const input = `function Test(){ {value} }`;
		const expected = `function Test() {
  {
    value;
  }
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('should keep sibling children in tsrx expression fragments on separate lines', async () => {
		const input = `function Test(p1,p2){return <><div>Hello</div><div>{p1}</div><div>{p2}</div></>}`;
		const expected = `function Test(p1, p2) {
  return (
    <>
      <div>Hello</div>
      <div>{p1}</div>
      <div>{p2}</div>
    </>
  );
}`;
		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('should format whitespace correctly', async () => {
		const input = `export function Test(){
  return <>@{
        let count=0
        // comment
        <>
        <div>{"Hello"}</div>
        <div>@{
          let two=2
          <>{"Hello"}</>
        }</div>
        </>
  }</>;
    }`;
		const expected = `export function Test() {
  return (
    <>@{
      let count = 0;
      // comment
      <>
        <div>{'Hello'}</div>
        <div>@{
          let two = 2;
          <>{'Hello'}</>
        }</div>
      </>
    }</>
  );
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('keeps fitting tsrx arrow returns inline in declarations and attributes', async () => {
		const input = `function Test(props){const func=(item)=><><Item {item}/></>;<List renderItem={(item)=><><Item {item}/></>} />}`;
		const expected = `function Test(props) {
  const func = (item) => (
    <>
      <Item {item} />
    </>
  );
  <List
    renderItem={(item) => (
      <>
        <Item {item} />
      </>
    )}
  />
}`;

		const result = await format(input, { printWidth: 60 });
		expect(result).toBeWithNewline(expected);
	});

	it('breaks non-fitting tsrx arrow returns after the arrow in declarations and attributes - printWidth: 60', async () => {
		const input = `function Test(props) {
  const func = (item) => <><ItemView {item} onSelect={props.onSelect} /></>;
  <List
    items={props.items}
    renderItem={(item) => <><ItemView {item} onSelect={props.onSelect} /></>}
  />
}`;
		const expected = `function Test(props) {
  const func = (item) => (
    <>
      <ItemView {item} onSelect={props.onSelect} />
    </>
  );
  <List
    items={props.items}
    renderItem={(item) => (
      <>
        <ItemView {item} onSelect={props.onSelect} />
      </>
    )}
  />
}`;
		const result = await format(input, { singleQuote: true, printWidth: 60 });
		expect(result).toBeWithNewline(expected);
	});

	it('breaks non-fitting tsrx arrow returns after the arrow in declarations and attributes - printWidth: 80', async () => {
		const input = `function Test(props) {
  const func = (item) => <><ItemView {item} onSelect={props.onSelect} /></>;
  <List
    items={props.items}
    renderItem={(item) => <><ItemView {item} onSelect={props.onSelect} /></>}
  />
}`;
		const expected = `function Test(props) {
  const func = (item) => (
    <>
      <ItemView {item} onSelect={props.onSelect} />
    </>
  );
  <List
    items={props.items}
    renderItem={(item) => (
      <>
        <ItemView {item} onSelect={props.onSelect} />
      </>
    )}
  />
}`;
		const result = await format(input, { singleQuote: true, printWidth: 80 });
		expect(result).toBeWithNewline(expected);
	});

	it('keeps fitting single-child fragments inline and expands non-fitting single-child fragments', async () => {
		const input = `function Test(){const short=<><span>Ready</span></>;const long=<><ReallyLongComponentName first={alpha} second={beta} third={gamma}/></>;}`;
		const expected = `function Test() {
  const short = (
    <>
      <span>Ready</span>
    </>
  );
  const long = (
    <>
      <ReallyLongComponentName
        first={alpha}
        second={beta}
        third={gamma}
      />
    </>
  );
}`;

		const result = await format(input, { printWidth: 60 });
		expect(result).toBeWithNewline(expected);
	});

	it('expands multi-child fragments while keeping fitting openers on the first line', async () => {
		const input = `function Test(){const short=<><div>A</div><div>B</div></>;const thisNameIsRidiculouslyLongEnoughToMissThePrintWidth=<><div>A</div><div>B</div></>;}`;
		const expected = `function Test() {
  const short = (
    <>
      <div>A</div>
      <div>B</div>
    </>
  );
  const thisNameIsRidiculouslyLongEnoughToMissThePrintWidth =
    (
      <>
        <div>A</div>
        <div>B</div>
      </>
    );
}`;

		const result = await format(input, { printWidth: 60 });
		expect(result).toBeWithNewline(expected);
	});

	it('should preserve comments before expressions after nested tsx and tsrx blocks', async () => {
		const expected = `function App() {
  const content = (
    <>
      <span class="nested-tsx">{'inside nested tsx'}</span>
      <div class="native">{nested}</div>
      // const content =
      //   <div>{hey()}</div>
      // ;
      {content}
    </>
  );
  return content;
}`;
		const result = await format(expected, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('should format whitespace correctly #2', async () => {
		const input = `export function Test(){
    return <>@{
        let count=0
          const x = () => {
            console.log("test");
            if (x) {
              console.log('test');
              return null;
            }
            if (y) {
              return null;
            }
            return x;
          }
        <>
        <div>{"Hello"}</div>
        <div>@{
          let two=2
          <>{"Hello"}</>
        }</div>
        </>
    }</>;
    }`;
		const expected = `export function Test() {
  return (
    <>@{
      let count = 0;
      const x = () => {
        console.log('test');
        if (x) {
          console.log('test');
          return null;
        }
        if (y) {
          return null;
        }
        return x;
      };
      <>
        <div>{'Hello'}</div>
        <div>@{
          let two = 2;
          <>{'Hello'}</>
        }</div>
      </>
    }</>
  );
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	describe('prettier-ignore', () => {
		it('preserves a statement verbatim after a line directive', async () => {
			const input = `export function App() {
	// prettier-ignore
	const matrix = [1,0,0,
		0,1,0,
		0,0,1];
	return <div>{matrix.length}</div>;
}`;
			const expected = `export function App() {
  // prettier-ignore
  const matrix = [1,0,0,
		0,1,0,
		0,0,1];
  return <div>{matrix.length}</div>;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('preserves a statement verbatim after a block directive', async () => {
			const input = `export function App() {
	/* prettier-ignore */
	const obj = {a:1,     b:2};
	return <div>{obj.a}</div>;
}`;
			const expected = `export function App() {
  /* prettier-ignore */
  const obj = {a:1,     b:2};
  return <div>{obj.a}</div>;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('preserves a JSX element verbatim', async () => {
			const input = `export function App() @{
	// prettier-ignore
	<div   class="x"     id="y">
		hello
	</div>
}`;
			const expected = `export function App() @{
  // prettier-ignore
  <div   class="x"     id="y">
		hello
	</div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('preserves a whitespace-only fragment verbatim', async () => {
			const input = `function WhitespaceOnlyApp() @{
	// prettier-ignore
	<>
	</>
}`;
			const expected = `function WhitespaceOnlyApp() @{
  // prettier-ignore
  <>
	</>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('still formats when the comment is not a prettier-ignore directive', async () => {
			const input = `export function App() {
	// this is a normal comment
	const obj = {a:1,     b:2};
	return <div>{obj.a}</div>;
}`;
			const expected = `export function App() {
  // this is a normal comment
  const obj = { a: 1, b: 2 };
  return <div>{obj.a}</div>;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		// Like Prettier's `hasNodeIgnoreComment`, any comment attached to the node
		// counts, not only the last leading one
		it('keeps a statement that a prettier-ignore comment trails on its line', async () => {
			const source = `foo(  a,b  ); // prettier-ignore
matrix = [1,0,
          0,1]; // prettier-ignore
function f() {
  return   [1,2,
    3]; // prettier-ignore
}
if (a)
  b(  1 ); // prettier-ignore
else c(2);
for (const  x of y) foo( x ); // prettier-ignore
foo(  a,b  ); /* prettier-ignore */`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps members that a prettier-ignore comment trails on their line', async () => {
			const source = `const x = {
  a:   1, // prettier-ignore
  b: 2,
};
class A {
  x   =  1; // prettier-ignore
  m(  a ) { } // prettier-ignore
}
type T = {
  a:   string; // prettier-ignore
  b: number;
};`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps an element that a prettier-ignore comment trails on its line', async () => {
			const source = `export function App() @{
  <div>
    <span   a="1" /> // prettier-ignore
    <b />
  </div>
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps the last statement of a block that an own-line prettier-ignore follows', async () => {
			// Prettier attaches the comment to the statement before it
			const source = `{
  foo(  1 );
  // prettier-ignore
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a node whose prettier-ignore comment another comment follows', async () => {
			const source = `foo(
  // prettier-ignore
  /* #__PURE__ */ bar(  1,2 ),
);
const o = {
  // prettier-ignore
  /* keep */ a:   [1,2],
  b: 1,
};`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a node whose dangling comment is prettier-ignore', async () => {
			const source = `for (let i = 0; i < 1; i++) { /* prettier-ignore */ }`;
			expect(await format(source)).toBeWithNewline(source);
			expect(await format('\n\n// prettier-ignore\n\n\n')).toBe('\n\n// prettier-ignore\n\n\n');
		});

		it('still formats an element or code block whose only comments are its children', async () => {
			// Like a JSX comment child, the comment doesn't dangle on the element
			const result = await format(`function App() @{
  const  x = 1;
  <div   a="1">
    // prettier-ignore
  </div>
  // prettier-ignore
}`);
			expect(result).toBeWithNewline(`function App() @{
  const x = 1;
  <div a="1">
    // prettier-ignore
  </div>
  // prettier-ignore
}`);
		});

		it('keeps the decorators written before export', async () => {
			const source = `// prettier-ignore
@dec
export   class  A {}
// prettier-ignore
@dec
export default   class  B {}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		// The decorators print once, where they were written, as in Prettier
		it.each([
			'// prettier-ignore\n@dec export class A {  }',
			'// prettier-ignore\nexport @dec class A {  }',
			'// prettier-ignore\n@dec export default class {  }',
			'// prettier-ignore\n@dec class A {  }',
			'export /* prettier-ignore */ @dec class A {  }',
			'export default /* prettier-ignore */ @dec class {  }',
			'@a @b\nexport class A {  } // prettier-ignore',
			'class B {\n  // prettier-ignore\n  @dec   m(  ) {}\n}',
		])('keeps an ignored decorated declaration as written in %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier, a comment between the decorators and `export` trails
		// the last decorator, so it ignores only the decorator (#445)
		it('prints a comment between the decorators and export once', async () => {
			const source = `@dec
// prettier-ignore
export class A {  }
@dec /* prettier-ignore */
export default class {  }`;
			expect(await format(source)).toBeWithNewline(`@dec
// prettier-ignore
export class A {}
@dec /* prettier-ignore */
export default class {}`);
		});

		it.each([
			'class A<T  > // prettier-ignore\n  extends B {}',
			'type T = A /* prettier-ignore */ | B;',
			'type T =\n  | A<  1 > // prettier-ignore\n  | B;',
		])(
			'prints the trailing comments of an ignored node once when its parent prints them in %s',
			async (source) => {
				expect(await format(source)).toBeWithNewline(source);
			},
		);

		// Like Prettier's `handleUnionTypeComments`, an own-line `prettier-ignore`
		// between union members ignores the member after it and stays before its `|`
		it('keeps the union member after an own-line prettier-ignore as written', async () => {
			const source = `type A =
  | B<  1 >
  // prettier-ignore
  | {  a:1 };
type C =
  // prettier-ignore
  | D<  1 >
  | E<  2 >;
type F =
  | G<  1 > // prettier-ignore
  | H<  2 >;`;
			expect(await format(source)).toBeWithNewline(`type A =
  | B<1>
  // prettier-ignore
  | {  a:1 };
type C =
  // prettier-ignore
  D<  1 > | E<2>;
type F =
  | G<  1 > // prettier-ignore
  | H<2>;`);
		});

		// Prettier's parsers keep no node for the parentheses, so the union
		// inside them is the node after the comment
		it('ignores the first member of a union written in parentheses', async () => {
			const source = `type A =
  // prettier-ignore
  (B   |   C);
type D =
  // prettier-ignore
  ((E<  1 >   |   F<  2 >));
let x:
  // prettier-ignore
  (B   |   C);
type G = {
  a:
    // prettier-ignore
    (B   |   C);
};`;
			expect(await format(source)).toBeWithNewline(`type A =
  // prettier-ignore
  B | C;
type D =
  // prettier-ignore
  E<  1 > | F<2>;
let x:
  // prettier-ignore
  B | C;
type G = {
  a:
    // prettier-ignore
    B | C;
};`);
		});

		it("doesn't break the list around an ignored node over several lines", async () => {
			// Prettier prints the ignored source as a plain string
			const source = `foo(/* prettier-ignore */ [1,
   2], b);
const x = { a: /* prettier-ignore */ [1,
   2], b: 2 };`;
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's `printIgnored`, a statement's source ends before its `;`,
		// which prints by the `semi` option
		it('prints the semicolon of an ignored statement like Prettier', async () => {
			const source = `// prettier-ignore
let a  = 1
// prettier-ignore
foo(  1 )
// prettier-ignore
foo(  2 ) /* c */;
// prettier-ignore
foo(  3 ) // c
;
// prettier-ignore
if (a) foo(  4 ) /* c */;
switch (x) {
  case 1:
    // prettier-ignore
    foo(  5 ) /* c */;
}
while (x) {
  // prettier-ignore
  break
}
// prettier-ignore
type A =   B;
for (/* prettier-ignore */ let i  = 0; i < 1; i++) {}`;
			expect(await format(source)).toBeWithNewline(`// prettier-ignore
let a  = 1;
// prettier-ignore
foo(  1 )
// prettier-ignore
foo(  2 ); /* c */
// prettier-ignore
foo(  3 ); // c
// prettier-ignore
if (a) foo(  4 ); /* c */
switch (x) {
  case 1:
    // prettier-ignore
    foo(  5 ); /* c */
}
while (x) {
  // prettier-ignore
  break;
}
// prettier-ignore
type A =   B;
for (/* prettier-ignore */ let i  = 0; i < 1; i++) {}`);
		});

		it('drops the semicolon of an ignored statement without semi', async () => {
			const source = `// prettier-ignore
let a  = 1;
// prettier-ignore
foo(  1 );
// prettier-ignore
foo(  2 ) /* c */;
foo(  a,b  ); // prettier-ignore
while (x) {
  // prettier-ignore
  break;
}
// prettier-ignore
type A =   B;
// prettier-ignore
export type C =   D;`;
			expect(await format(source, { semi: false })).toBeWithNewline(`// prettier-ignore
let a  = 1
// prettier-ignore
foo(  1 )
// prettier-ignore
foo(  2 ) /* c */
foo(  a,b  ) // prettier-ignore
while (x) {
  // prettier-ignore
  break
}
// prettier-ignore
type A =   B;
// prettier-ignore
export type C =   D`);
		});
	});

	describe('recovered', () => {
		/**
		 * @param {string} code
		 * @param {import('prettier').Options} [options]
		 */
		const format = async (code, options = {}) => {
			return await prettier.format(code, {
				parser: 'tsrx',
				plugins: [join(__dirname, 'index.js')],
				...options,
			});
		};

		/**
		 * @param {string} code
		 * @param {import('prettier').CursorOptions} options
		 * @returns Promise<import('prettier').CursorOptions}>
		 */
		const formatWithCursorHelper = async (code, options) =>
			await prettier.formatWithCursor(code, {
				parser: 'tsrx',
				plugins: [join(__dirname, 'index.js')],
				...options,
			});

		it('collapses multiple blank lines in element children', async () => {
			const input = `export function App() {
  <div>
    <span>{'First'}</span>


    <span>{'Second'}</span>
  </div>
}`;

			const expected = `export function App() {
  <div>
    <span>{'First'}</span>

    <span>{'Second'}</span>
  </div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between JSX element children', async () => {
			const input = `export function App() {
  <div>
    <span>{'First'}</span>

    <span>{'Second'}</span>

    <span>{'Third'}</span>
  </div>
}`;

			const expected = `export function App() {
  <div>
    <span>{'First'}</span>

    <span>{'Second'}</span>

    <span>{'Third'}</span>
  </div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('registers .tsrx as a supported file extension', () => {
			const tsrx_language = languages?.[0];

			if (!tsrx_language) {
				throw new Error('Missing TSRX language metadata');
			}

			expect(tsrx_language.extensions).toContain('.tsrx');
			expect(tsrx_language.parsers).toContain('tsrx');
		});

		it('should format a simple component', async () => {
			const input = `export function Test()@{let count=0;<div>{"Hello"}</div>}`;
			const expected = `export function Test() @{
  let count = 0;
  <div>{'Hello'}</div>
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format a simple function with cursorOffset', async () => {
			const input = `export function Test()@{let count=0;<div>{"Hello"}</div>}`;
			const expected = `export function Test() @{
  let count = 0;
  <div>{'Hello'}</div>
}`;
			const result = await formatWithCursorHelper(input, {
				singleQuote: true,
				cursorOffset: 50,
			});
			expect(result.formatted).toBeWithNewline(expected);
			expect(typeof result.cursorOffset).toBe('number');
		});

		it('should format shorthand tsx fragments like JSX fragments', async () => {
			const input = `function Test(p1,p2){return <><div>Hello</div><div>{p1}</div><div>{p2}</div></>}`;
			const expected = `function Test(p1, p2) {
  return (
    <>
      <div>Hello</div>
      <div>{p1}</div>
      <div>{p2}</div>
    </>
  );
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format import.meta expressions correctly', async () => {
			const input = `export function Test(){if(import.meta.env.SSR){<div>{'Server'}</div>}}`;
			const expected = `export function Test() {
  if (import.meta.env.SSR) {
    <div>{'Server'}</div>
  }
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format dynamic import() expressions correctly', async () => {
			const input = `const mod = await import('@codemirror/state');`;
			const expected = `const mod = await import("@codemirror/state");`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve and format dynamic deferred imports', async () => {
			const input = `const feature=import.defer("./feature.js")`;
			const expected = `const feature = import.defer('./feature.js');`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve dynamic deferred import options', async () => {
			const input = `const data=import.defer("./feature.json",{with:{type:"json"}})`;
			const expected = `const data = import.defer('./feature.json', { with: { type: 'json' } });`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format destructured dynamic import() in Promise.all', async () => {
			const input = `const [{ EditorState }, { oneDark }] = await Promise.all([import('@codemirror/state'), import('@codemirror/theme-one-dark')]);`;
			const expected = `const [{ EditorState }, { oneDark }] = await Promise.all([
  import("@codemirror/state"),
  import("@codemirror/theme-one-dark"),
]);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format a function with an object property notation function markup', async () => {
			const expected = `function Card(props) {
  <div class="card">
    <props.children />
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should respect print width when using ternary expressions', async () => {
			const input = `function printMemberExpressionSimple(node, options, computed = false) {
  if (node.type === 'MemberExpression') {
    const prop = node.computed
      ? (node.optional ? '?.[' : '[') + printMemberExpressionSimple(node.property, options, node.computed) + ']'
      : (node.optional ? '?.' : '.') + printMemberExpressionSimple(node.property, options, node.computed);
  }
}`;

			const expected = `function printMemberExpressionSimple(
  node,
  options,
  computed = false,
) {
  if (node.type === 'MemberExpression') {
    const prop = node.computed
      ? (node.optional ? '?.[' : '[') +
        printMemberExpressionSimple(
          node.property,
          options,
          node.computed,
        ) +
        ']'
      : (node.optional ? '?.' : '.') +
        printMemberExpressionSimple(
          node.property,
          options,
          node.computed,
        );
  }
}`;

			const result = await format(input, { singleQuote: true, printWidth: 70 });
			expect(result).toBeWithNewline(expected);
		});

		it('should print nested ternary expressions with indentation', async () => {
			const input = `const children_fn = b.arrow(
    [b.id('__compat')],
    needs_fragment
        ? b.call(
            '__compat._jsxs',
            b.id('__compat.Fragment'),
            b.object([
                b.prop(
                    'init',
                    b.id('children'),
                    b.array(normalized_children.map((child) => visit(child, state))),
                ),
            ]),
        )
        : visit(normalized_children[0], state),
);`;

			const expected = `const children_fn = b.arrow(
  [b.id('__compat')],
  needs_fragment
    ? b.call(
        '__compat._jsxs',
        b.id('__compat.Fragment'),
        b.object([
          b.prop(
            'init',
            b.id('children'),
            b.array(normalized_children.map((child) => visit(child, state))),
          ),
        ]),
      )
    : visit(normalized_children[0], state),
);`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should properly format template literals with ternaries', async () => {
			const input = `const handle_static_attr = (name, value) => {
  const attr_str = \` \${name}\${is_boolean_attribute(name) && value === true
      ? ''
      : \`="\${value === true ? '' : escape_html(value, true)}"\`
    }\`;

  if (is_spreading) {
    // For spread attributes, store just the actual value, not the full attribute string
    const actual_value =
      is_boolean_attribute(name) && value === true
        ? b.literal(true)
        : b.literal(value === true ? '' : value);
    spread_attributes.push(b.prop('init', b.literal(name), actual_value));
  } else {
    state.init.push(b.stmt(b.call(b.member(b.id('__output'), b.id('push')), b.literal(attr_str))));
  }
};`;

			const expected = `const handle_static_attr = (name, value) => {
  const attr_str = \` \${name}\${
    is_boolean_attribute(name) && value === true
      ? ''
      : \`="\${value === true ? '' : escape_html(value, true)}"\`
  }\`;

  if (is_spreading) {
    // For spread attributes, store just the actual value, not the full attribute string
    const actual_value =
      is_boolean_attribute(name) && value === true
        ? b.literal(true)
        : b.literal(value === true ? '' : value);
    spread_attributes.push(b.prop('init', b.literal(name), actual_value));
  } else {
    state.init.push(b.stmt(b.call(b.member(b.id('__output'), b.id('push')), b.literal(attr_str))));
  }
};`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format conditional expressions correctly', async () => {
			const expected = `const consequentDoc =
  hasUnparenthesizedNestedConditional &&
  node.consequent.type === 'ConditionalExpression' &&
  !node.consequent.metadata?.parenthesized
    ? path.call(
        (childPath) => print(childPath, { isNestedConditional: true }),
        'consequent',
      )
    : path.call(print, 'consequent');
const alternateDoc =
  hasUnparenthesizedNestedConditional &&
  node.alternate.type === 'ConditionalExpression' &&
  !node.alternate.metadata?.parenthesized
    ? path.call(
        (childPath) => print(childPath, { isNestedConditional: true }),
        'alternate',
      )
    : path.call(print, 'alternate');`;

			const result = await format(expected, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format nested template literals correctly', async () => {
			const expected = `const handle_static_attr = (name, value) => {
  const attr_str = \` \${name}\${
    is_boolean_attribute(name) && value === true
      ? ''
      : \`="\${value === true ? '' : escape_html(value, true)}"\`
  }\`;
};`;

			const result = await format(expected, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should respect print width when using conditional expressions with arrays', async () => {
			const input = `const openingTag = group([
    '<',
    tagName,
    hasAttributes
        ? indent(
            concat([
                ...path.map((attrPath) => {
                    return concat([attrLineBreak, print(attrPath)]);
                }, 'attributes'),
            ]),
        )
        : '',
    shouldUseSelfClosingSyntax
        ? hasAttributes
            ? line
            : ''
        : hasAttributes && !options.bracketSameLine
            ? softline
            : '',
    shouldUseSelfClosingSyntax ? (hasAttributes ? '/>' : ' />') : '>',
]);`;

			const expected = `const openingTag = group([
  '<',
  tagName,
  hasAttributes
    ? indent(
        concat([
          ...path.map((attrPath) => {
            return concat([attrLineBreak, print(attrPath)]);
          }, 'attributes'),
        ]),
      )
    : '',
  shouldUseSelfClosingSyntax
    ? hasAttributes
      ? line
      : ''
    : hasAttributes && !options.bracketSameLine
      ? softline
      : '',
  shouldUseSelfClosingSyntax ? (hasAttributes ? '/>' : ' />') : '>',
]);`;

			const result = await format(input, { singleQuote: true, printWidth: 70 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep jsdoc on same line, spaces between, and parentheses', async () => {
			const input = `/** @type {import('prettier').CursorOptions} */({});
const start = /** @type {any} */ (node).start;
/** @type {SomeType} */ (a) = 5;
function test() {
  /** @type {SomeType} */ (a) = 5;
}
(node.trailingComments ||= []).push(
  /** @type {CommentWithLocation} */(comments.shift()),
);
/** @type {number} */ (char.codePointAt(0)) >= 160`;
			const expected = `/** @type {import('prettier').CursorOptions} */ ({});
const start = /** @type {any} */ (node).start;
/** @type {SomeType} */ (a) = 5;
function test() {
  /** @type {SomeType} */ (a) = 5;
}
(node.trailingComments ||= []).push(
  /** @type {CommentWithLocation} */ (comments.shift()),
);
/** @type {number} */ (char.codePointAt(0)) >= 160;`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		// Both comments of a stacked cast lead the innermost node, and without
		// its own parentheses the outer comment stops being a cast
		it('keeps one pair of parentheses per stacked JSDoc cast', async () => {
			const input = `const entry = /** @type {Entry} */ (/** @type {unknown} */ (node));
console.log(/** @type {Entry} */ (/** @type {unknown} */ (node)));
const three = /** @type {A} */ (/** @type {B} */ (/** @type {C} */ (node)));
const config = /** @type {Config} */ (/** @type {unknown} */ ({ a: 1 }));
const extra = /** @type {A} */ ((/** @type {B} */ (node)));
function unwrap(node) {
  return /** @type {Entry} */ (/** @type {unknown} */ (node));
}
const long = /** @type {Entry} */ (/** @type {unknown} */ (createEntry(firstArgument, secondArgument)));`;
			const expected = `const entry = /** @type {Entry} */ (/** @type {unknown} */ (node));
console.log(/** @type {Entry} */ (/** @type {unknown} */ (node)));
const three = /** @type {A} */ (/** @type {B} */ (/** @type {C} */ (node)));
const config = /** @type {Config} */ (/** @type {unknown} */ ({ a: 1 }));
const extra = /** @type {A} */ (/** @type {B} */ (node));
function unwrap(node) {
  return /** @type {Entry} */ (/** @type {unknown} */ (node));
}
const long = /** @type {Entry} */ (
  /** @type {unknown} */ (createEntry(firstArgument, secondArgument))
);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a cast whose parentheses hold a comment or another cast', async () => {
			const input = `const member = /** @type {A} */ (/** @type {B} */ (node).y).z;
const outer = /** @type {A} */ (/** @type {B} */ (node)).z;
const plain = /** @type {A} */ (/* plain */ (node));
const chained = /** @type {A} */ (/* note */ node.y);
const commented = /** @type {A} */ (
  // why
  node
);
const kept =
  // prettier-ignore
  /** @type {A} */ (/** @type {B} */ (node));`;
			const expected = `const member = /** @type {A} */ (/** @type {B} */ (node).y).z;
const outer = /** @type {A} */ (/** @type {B} */ (node)).z;
const plain = /** @type {A} */ (/* plain */ node);
const chained = /** @type {A} */ (/* note */ node.y);
const commented = /** @type {A} */ (
  // why
  node
);
const kept =
  // prettier-ignore
  /** @type {A} */ (/** @type {B} */ (node));`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps stacked casts in a JSX attribute', async () => {
			const input = `export function Link(props) {
  return <a title={/** @type {string} */ (/** @type {unknown} */ (props.t))} />;
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		// The parentheses of the argument list are the call's, so the comment
		// before them does not cast the argument
		it('does not turn a comment before call parentheses into a cast', async () => {
			const result = await format('foo /** @type {A} */ ((node));');
			expect(result).toBeWithNewline('foo(/** @type {A} */ node);');
		});

		it('puts the leading semicolon before a stacked cast that starts a statement', async () => {
			const input = `run();
/** @type {A} */ (/** @type {B} */ (node)).start();
run();
// note
/** @type {A} */ (/** @type {B} */ (node).y).z();`;
			const expected = `run()
;/** @type {A} */ (/** @type {B} */ (node)).start()
run()
// note
;/** @type {A} */ (/** @type {B} */ (node).y).z()`;

			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve required parentheses around assignment expressions', async () => {
			const input = `const openSignal = useRef<Signal<boolean> | null>(null)
const open = props.open ?? (openSignal.current ??= signal(false))
const sum = a + (b = c)
const condition = (a = b) ? c : d
const called = (factory = getFactory())()
async function load() {
  await (promise = getPromise())
}`;
			const expected = `const openSignal = useRef<Signal<boolean> | null>(null);
const open = props.open ?? (openSignal.current ??= signal(false));
const sum = a + (b = c);
const condition = (a = b) ? c : d;
const called = (factory = getFactory())();
async function load() {
  await (promise = getPromise());
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps the parentheses of an object destructuring assignment statement', async () => {
			const input = `function swap() {
  ({ other } = { other: 'y' });
  [label] = ['b'];
  ({ other } = source).other;
}
export function Pair() @{
  const swap = () => {
    ({ other } = { other: 'y' });
  };
  <span onClick={swap}>{other}</span>
}`;
			const expected = `function swap() {
  ({ other } = { other: 'y' });
  [label] = ['b'];
  ({ other } = source).other;
}
export function Pair() @{
  const swap = () => {
    ({ other } = { other: 'y' });
  };
  <span onClick={swap}>{other}</span>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not change formatting for function object properties and properties in square brackets', async () => {
			const expected = `export function App() {
  const SYMBOL_PROP = Symbol();

  const obj = {
    count: 0,
    increment() {
      this.count++;
    },
    [SYMBOL_PROP]() {
      this.count++;
    },
  };
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle arrow functions with block bodies', async () => {
			const input = `export function Test(){const handler=()=>{};handler}`;
			const expected = `export function Test() {
  const handler = () => {};
  handler;
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle style tags inside function body', async () => {
			const input = `export function Test()@{<><div>{"Test"}</div><style>div{color:red}</style></>}`;
			const expected = `export function Test() @{
  <>
    <div>{'Test'}</div>
    <style>
      div {
        color: red;
      }
    </style>
  </>
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle TypeScript types and interfaces', async () => {
			const input = `export function Test(){interface User{id:number;name:string}let user:User={id:1,name:"test"};user}`;
			const expected = `export function Test() {
  interface User {
    id: number;
    name: string;
  }
  let user: User = { id: 1, name: 'test' };
  user;
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle for...of loops in function body', async () => {
			const input = `export function Test()@{const items=[1,2,3];@for(const item of items){<li>{item}</li>}}`;
			const expected = `export function Test() @{
  const items = [1, 2, 3];
  @for (const item of items) {
    <li>{item}</li>
  }
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle empty fallbacks for for...of loops', async () => {
			const input = `export function Test()@{const items=[];@for(const item of items){<li>{item}</li>}@empty{<li>No items</li>}}`;
			const expected = `export function Test() @{
  const items = [];
  @for (const item of items) {
    <li>{item}</li>
  } @empty {
    <li>No items</li>
  }
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps await on for await loops and @for await directives', async () => {
			const input = `async function read(stream){for await(const chunk of stream){use(chunk)}}
async function App({ items }) @{
<ul>@for await(const item of items; index i){<li>{item}</li>}@empty{<li>none</li>}</ul>
}`;
			const expected = `async function read(stream) {
  for await (const chunk of stream) {
    use(chunk);
  }
}
async function App({ items }) @{
  <ul>
    @for await (const item of items; index i) {
      <li>{item}</li>
    } @empty {
      <li>none</li>
    }
  </ul>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should handle TypeScript function return type', async () => {
			const input = `export function FooBar() { function Foo() : string { return ""; }}`;
			const expected = `export function FooBar() {
  function Foo(): string {
    return '';
  }
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle TypeScript method return type', async () => {
			const input = `class Foo { bar() : number { return 1; }}`;
			const expected = `class Foo {
  bar(): number {
    return 1;
  }
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle import type statements', async () => {
			const input = `import { type Component } from '@example/runtime';
import { Something, type Props, track } from '@example/runtime';`;
			const expected = `import { type Component } from '@example/runtime';
import { Something, type Props, track } from '@example/runtime';`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve and format static deferred imports', async () => {
			const input = `import defer*as feature from "./feature.json" with{type:"json"};`;
			const expected = `import defer * as feature from './feature.json' with { type: 'json' };`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		// Regressed in 0.3.97: the printer dropped the `type` keyword from
		// type-only re-exports and inline export specifiers, turning them into
		// runtime re-exports of bindings that only exist as types (a module-load
		// failure once compiled).
		it('should keep the type keyword on export type statements', async () => {
			const input = `export type { Config } from './types.js';
export { type Extra, realValue } from './mixed.js';`;
			const expected = `export type { Config } from './types.js';
export { type Extra, realValue } from './mixed.js';`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		// Regressed in 0.3.97: `declare module 'name' { … }` lost its `declare`
		// keyword, leaving invalid `module 'name' { … }` output.
		// Regression: TSTypePredicate had no printer case, so predicate return
		// types (`(v): v is string =>`, `asserts x is T`) printed as
		// `/* Unknown: TSTypePredicate */`.
		it('should print type predicate return types', async () => {
			const input = `const isString = (value: unknown): value is string => typeof value === 'string';
function assertUser(x: unknown): asserts x is User {}
function isSelf(this: Node): this is Element {
  return true;
}
function assertTruthy(x: unknown): asserts x {}`;
			const expected = `const isString = (value: unknown): value is string => typeof value === 'string';
function assertUser(x: unknown): asserts x is User {}
function isSelf(this: Node): this is Element {
  return true;
}
function assertTruthy(x: unknown): asserts x {}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep the declare keyword on ambient module declarations', async () => {
			const input = `declare module 'some-module' {
  interface Thing {
    x: number;
  }
}`;
			const expected = `declare module 'some-module' {
  interface Thing {
    x: number;
  }
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format long import statements correctly', async () => {
			const input = `import { flushSync, track, effect, bindValue, bindChecked, bindGroup, bindClientWidth, bindClientHeight, bindOffsetWidth, bindOffsetHeight, bindContentRect, bindContentBoxSize, bindBorderBoxSize, bindDevicePixelContentBoxSize, bindInnerHTML, bindInnerText, bindTextContent, bindNode } from '@example/runtime';`;
			const expected = `import {
  flushSync,
  track,
  effect,
  bindValue,
  bindChecked,
  bindGroup,
  bindClientWidth,
  bindClientHeight,
  bindOffsetWidth,
  bindOffsetHeight,
  bindContentRect,
  bindContentBoxSize,
  bindBorderBoxSize,
  bindDevicePixelContentBoxSize,
  bindInnerHTML,
  bindInnerText,
  bindTextContent,
  bindNode,
} from '@example/runtime';`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle type annotations in object params', async () => {
			const input = `interface Props {
  a: number;
  b: string;
}

export function Test({ a, b }: Props) {}`;

			const expected = `interface Props {
  a: number;
  b: string;
}

export function Test({ a, b }: Props) {}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle inline type annotations in object params', async () => {
			const input = `export function Test({ a, b}: { a: number; b: string }) {}`;
			const expected = `export function Test({ a, b }: { a: number; b: string }) {}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not force attribute-less elements to break with singleAttributePerLine', async () => {
			const input = `function One() @{
  <div>Hello</div>
}`;

			const expected = `function One() @{
  <div>Hello</div>
}`;

			const result = await format(input, {
				singleQuote: true,
				printWidth: 100,
				singleAttributePerLine: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should keep attributes on same line when no attribute value breaks', async () => {
			const input = `function App() {
  <button class="test another" onClick={handler}>
    {'Click Me'}
  </button>
}`;
			const expected = `function App() {
  <button class="test another" onClick={handler}>
    {'Click Me'}
  </button>
}`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep short top-level ternary attributes inline when they fit', async () => {
			const input = `function App() {
  <div class={selected === 0 ? "selected" : ""}>{\`div 1\`}</div>
}`;
			const expected = `function App() {
  <div class={selected === 0 ? 'selected' : ''}>{\`div 1\`}</div>
}`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not format function parameter spread', async () => {
			const expected = `function Two({ arg1, ...rest }) {}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should break up long function parameter spread on new lines if line length exceeds printWidth', async () => {
			const input = `function Three({ argumentOne, argumentTwo, ArgumentThree, ArgumentFour, ArgumentFive, ArgumentSix, ArgumentSeven }) {}`;
			const expected = `function Three({
  argumentOne,
  argumentTwo,
  ArgumentThree,
  ArgumentFour,
  ArgumentFive,
  ArgumentSix,
  ArgumentSeven,
}) {}`;

			const result = await format(input, { singleQuote: true, printWidth: 60 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not include a comma after the last rest parameter', async () => {
			const expected = `function Foo({
  lorem,
  ipsum,
  dolor,
  sit,
  amet,
  consectetur,
  adipiscing,
  ...rest
}) {}`;

			const result = await format(expected, { singleQuote: true, printWidth: 60 });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a new line between comments above and code if one is present', async () => {
			const expected = `// comment

import { useCount, incrementCount } from './useCount';
import { effect, track } from '@example/runtime';`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format properly an array of objects', async () => {
			const expected = `obj = {
  test: [
    { a: 1, b: 2, c: 3, d: 4 },
    { a: 1, b: 2 },
    { c: 3, d: 4 },
  ],
};`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep chained expression intact', async () => {
			const expected = `const doc = getRootNode?.()?.ownerDocument ?? document;`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should break arrow before a long generic optional call with nullish fallback', async () => {
			const input = `const test = () => menuRef.current?.querySelector<HTMLElement>(
        "[role=\\"menuitem\\"]:not([aria-disabled=\\"true\\"])",
      ) ??
        null`;
			const expected = `const test = () =>
  menuRef.current?.querySelector<HTMLElement>(
    '[role="menuitem"]:not([aria-disabled="true"])',
  ) ?? null;`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps nullish fallback inline in a conditional test', async () => {
			const input = `const test = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? null ? a : b;`;
			const expected = `const test =
  (menuRef.current?.querySelector<HTMLElement>(
    '[role="menuitem"]:not([aria-disabled="true"])',
  ) ?? null)
    ? a
    : b;`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('does not add spaces around inlined array elements in destructured arguments', async () => {
			const expected = `for (const [key, value] of Object.entries(attributes).filter(([_key, value]) => value !== '')) {
}
const [obj1, obj2] = arrayOfObjects;`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep a new line between elements or function if provided', async () => {
			const expected = `<>
  <Something>
    <div>{'Hello'}</div>
  </Something>

  <Child class="test" />
</>`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep proper formatting between css declarations', async () => {
			const expected = `export function App() {
  <style>
    div {
      background-color: red;
    }
    .even-class {
      color: green;
    }
    .odd-class {
      color: blue;
    }
  </style>
}`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep one new line between css declarations if one or more is provided', async () => {
			const input = `export function App() {
  <style>
    div {
      background-color: red;
    }

    .even-class {
      color: green;
    }


    .odd-class {
      color: blue;
    }
  </style>
}`;

			const expected = `export function App() {
  <style>
    div {
      background-color: red;
    }

    .even-class {
      color: green;
    }

    .odd-class {
      color: blue;
    }
  </style>
}`;
			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep style tag intact when wrapped in parent outside a component', async () => {
			const expected = `<head>
  <style>
    div {
      background: purple;
    }
    p {
      background: blue;
    }
    .div {
      color: red;
    }
    .p {
      color: green;
    }
  </style>
</head>`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('formats top-level markup with a style or script block to a fixpoint', async () => {
			for (const source of [
				`<head>
  <style>
    div {
      color: red;
    }
  </style>
</head>
`,
				`<div>
  <script>
    const a = 1;
  </script>
</div>
`,
			]) {
				expect(await format(source)).toBe(source);
			}
		});

		it('should keep style tag intact when wrapped in parent inside component', async () => {
			const expected = `function App() {
  <head>
    <style>
      div {
        background: purple;
      }
      p {
        background: blue;
      }
      .div {
        color: red;
      }
      .p {
        color: green;
      }
    </style>
  </head>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep css siblings formatting intact', async () => {
			const expected = `export function App() {
  <style>
    div + .div > div,
    p,
    #id + .div ~ div,
    #id {
      color: red;
    }
  </style>
}`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format & parent nested selector correctly', async () => {
			const expected = `export function App() @{
  <>
    <div>
      <h1>{'Hello'}</h1>
    </div>
    <style>
      div {
        & > * {
          color: blue;
        }
      }
    </style>
  </>
}`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep css @keyframes syntax intact', async () => {
			const input = `export function App() {
  <style>
    /* Scoped keyframe - only usable within Parent */
    @keyframes slideIn {
      from { transform: translateX(-100%); }
      to { transform: translateX(0); }
    }

    /* Global keyframe - usable in any function */
    @keyframes -global-fadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }

    .parent {
      animation: slideIn 1s;
    }
  </style>
}`;

			const expected = `export function App() {
  <style>
    /* Scoped keyframe - only usable within Parent */
    @keyframes slideIn {
      from {
        transform: translateX(-100%);
      }
      to {
        transform: translateX(0);
      }
    }

    /* Global keyframe - usable in any function */
    @keyframes -global-fadeIn {
      0% {
        opacity: 0;
      }
      100% {
        opacity: 1;
      }
    }

    .parent {
      animation: slideIn 1s;
    }
  </style>
}`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not mangle empty stylesheet tags <style></style>', async () => {
			const input = `function App() {
  <style>

  </style>
}`;

			const expected = `function App() {
  <style></style>
}`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep ReactiveMap short syntax intact', async () => {
			const input = `const map = new ReactiveMap([['key1', 'value1'], ['key2', 'value2']]);
const set = new ReactiveSet([1, 2, 3]);`;

			// Like Prettier, a matrix of arrays prints one entry per line
			const expected = `const map = new ReactiveMap([
  ['key1', 'value1'],
  ['key2', 'value2'],
]);
const set = new ReactiveSet([1, 2, 3]);`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not remove blank lines between components and types if provided', async () => {
			const expected = `export function App() {
  console.log('test');
}

type RootNode = ShadowRoot | Document | Node;
type GetRootNode = () => RootNode;`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not remove async from arrow functions', async () => {
			const expected = `describe('compat-react', async () => {
  const something = 10;
});`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve blank lines between components and various TS declarations', async () => {
			const expected = `export function App() {
  console.log('test');
}

interface Props {
  value: string;
}

type Result = string | number;

enum Status {
  Active,
  Inactive,
  Pending,
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve blank lines between ts and import statements', async () => {
			const expected = `export interface PortalActionProps {
  disabled?: boolean | undefined;
  container?: HTMLElement | undefined;
  getRootNode?: GetRootNode | undefined;
}

import { Portal as RuntimePortal } from '@example/runtime';`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve blank lines between export statements and import statements or comments', async () => {
			const expected = `export { handler } from './test.tsrx';

import { Portal as RuntimePortal } from '@example/runtime';

// export { something } from './test.tsrx;

import { GetRootNode } from './somewhere';`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('adds no blank line after an import that the source does not have', async () => {
			const expected = `import a from "a";
b();
import c from "c";
// note
d();
function f() {}
import e from "e";
export { e };
import g from "g";

g();`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve export interface with extends as provided', async () => {
			const expected = `export interface ReactiveArray<T> extends Array<T> {}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve ternaries and jsdoc type assertions with parens and space', async () => {
			const expected = `/**
 * @param {unknown} maybe_tracked
 * @param {'contentRect' | 'contentBoxSize' | 'borderBoxSize' | 'devicePixelContentBoxSize'} type
 */
function bind_element_rect(maybe_tracked, type) {
  if (!is_tsrx_object(maybe_tracked)) {
    throw not_tracked_type_error(\`bind\${type.charAt(0).toUpperCase() + type.slice(1)}()\`);
  }

  var tracked = /** @type {Tracked<any>} */ (maybe_tracked);
  var observer =
    type === 'contentRect' || type === 'contentBoxSize'
      ? resize_observer_content_box
      : type === 'borderBoxSize'
        ? resize_observer_border_box
        : resize_observer_device_pixel_content_box;

  return (/** @type {HTMLElement} */ element) => {
    var unsubscribe = observer.observe(
      element,
      /** @param {any} entry */ (entry) => set(tracked, entry[type]),
    );

    effect(() => unsubscribe);
  };
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve block comments formatting inside curly braces and inside nested markup', async () => {
			const expected = `<div class="container">
  {/* Dynamic SVG - the original problem case */}
  <span>{'Content'}</span>
  {/* Static SVG - always worked */}
  <span>{'More Content'}</span>
</div>`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format function calls with long string literals correctly', async () => {
			const input = `for (const quasi of template.quasis) {
    quasi.value.raw = sanitize_template_string(/** @type {string} */(quasi.value.cooked));
}`;

			const expected = `for (const quasi of template.quasis) {
  quasi.value.raw = sanitize_template_string(
    /** @type {string} */ (quasi.value.cooked),
  );
}`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep a single object argument attached when the object breaks', async () => {
			const input = `foo({ a: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz' });`;

			const expected = `foo({
  a: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
});`;

			const result = await format(input, { singleQuote: true, printWidth: 85 });
			expect(result).toBeWithNewline(expected);
		});

		it('should break up call expressions on new lines with inline jsdoc comments with printWidth 100', async () => {
			const input = `for (const quasi of template.quasis) {
  quasi.value.raw = sanitize_template_string(/** @type {string} */ (quasi.value.cooked));
}

const program = /** @type {Program} */ (walk(/** @type {Node} */ (analysis.ast), { ...state, namespace: 'html' }, visitors));`;

			const expected = `for (const quasi of template.quasis) {
  quasi.value.raw = sanitize_template_string(/** @type {string} */ (quasi.value.cooked));
}

const program = /** @type {Program} */ (
  walk(/** @type {Node} */ (analysis.ast), { ...state, namespace: 'html' }, visitors)
);`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should break up call expressions on new lines with inline jsdoc comments with printWidth 30', async () => {
			const input = `for (const quasi of template.quasis) {
  quasi.value.raw = sanitize_template_string(/** @type {string} */ (quasi.value.cooked));
}

const program = /** @type {Program} */ (walk(/** @type {Node} */ (analysis.ast), { ...state, namespace: 'html' }, visitors));`;

			const expected = `for (const quasi of template.quasis) {
  quasi.value.raw =
    sanitize_template_string(
      /** @type {string} */ (
        quasi.value.cooked
      ),
    );
}

const program =
  /** @type {Program} */ (
    walk(
      /** @type {Node} */ (
        analysis.ast
      ),
      {
        ...state,
        namespace: 'html',
      },
      visitors,
    )
  );`;

			const result = await format(input, { singleQuote: true, printWidth: 30 });
			expect(result).toBeWithNewline(expected);
		});

		it('should properly format long jsdoc with call expressions', async () => {
			const input = `const js = /** @type {ReturnType<typeof print> & { post_processing_changes?: PostProcessingChanges, line_offsets?: number[] }} */ (
  print(program, language_handler, {
    sourceMapContent: source,
    sourceMapSource: path.basename(filename),
  })
);`;

			const expected = `const js =
  /** @type {ReturnType<typeof print> & { post_processing_changes?: PostProcessingChanges, line_offsets?: number[] }} */ (
    print(program, language_handler, {
      sourceMapContent: source,
      sourceMapSource: path.basename(filename),
    })
  );`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should expand call arguments containing a regex literal with a block callback', async () => {
			const input = String.raw`js.code = js.code.replace(/^(export\s+)declare\s+(function\s+\w+[^{\n]*;)$/gm, (match, p1, p2, offset) => {
  const replacement = p1 + p2;
  const line = offset_to_line(offset);
  const delta = replacement.length - match.length; // negative (removing 'declare ')

  // Track first change offset and total delta per line
  if (!line_deltas.has(line)) {
	line_deltas.set(line, { offset, delta });
  } else {
    // Additional change on same line - accumulate delta
    // @ts-ignore
    line_deltas.get(line).delta += delta;
  }
  return replacement;
});`;

			const expected = String.raw`js.code = js.code.replace(
  /^(export\s+)declare\s+(function\s+\w+[^{\n]*;)$/gm,
  (match, p1, p2, offset) => {
    const replacement = p1 + p2;
    const line = offset_to_line(offset);
    const delta = replacement.length - match.length; // negative (removing 'declare ')

    // Track first change offset and total delta per line
    if (!line_deltas.has(line)) {
      line_deltas.set(line, { offset, delta });
    } else {
      // Additional change on same line - accumulate delta
      // @ts-ignore
      line_deltas.get(line).delta += delta;
    }
    return replacement;
  },
);`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should expand call arguments containing a regex literal with a block callback printWidth 40', async () => {
			const input = String.raw`js.code = js.code.replace(/^(export\s+)declare\s+(function\s+\w+[^{\n]*;)$/gm, (match, p1, p2, offset) => {
  const replacement = p1 + p2;
  const line = offset_to_line(offset);
  const delta = replacement.length - match.length; // negative (removing 'declare ')

  // Track first change offset and total delta per line
  if (!line_deltas.has(line)) {
	line_deltas.set(line, { offset, delta });
  } else {
    // Additional change on same line - accumulate delta
    // @ts-ignore
    line_deltas.get(line).delta += delta;
  }
  return replacement;
});`;

			const expected = String.raw`js.code = js.code.replace(
  /^(export\s+)declare\s+(function\s+\w+[^{\n]*;)$/gm,
  (match, p1, p2, offset) => {
    const replacement = p1 + p2;
    const line = offset_to_line(offset);
    const delta =
      replacement.length - match.length; // negative (removing 'declare ')

    // Track first change offset and total delta per line
    if (!line_deltas.has(line)) {
      line_deltas.set(line, {
        offset,
        delta,
      });
    } else {
      // Additional change on same line - accumulate delta
      // @ts-ignore
      line_deltas.get(line).delta +=
        delta;
    }
    return replacement;
  },
);`;

			const result = await format(input, { singleQuote: true, printWidth: 40 });
			expect(result).toBeWithNewline(expected);
		});

		it('should expand call arguments containing a regex literal with a block callback printWidth 30', async () => {
			const input = String.raw`js.code = js.code.replace(/^(export\s+)declare\s+(function\s+\w+[^{\n]*;)$/gm, (match, p1, p2, offset) => {
  const replacement = p1 + p2;
  const line = offset_to_line(offset);
  const delta = replacement.length - match.length; // negative (removing 'declare ')

  // Track first change offset and total delta per line
  if (!line_deltas.has(line)) {
	line_deltas.set(line, { offset, delta });
  } else {
    // Additional change on same line - accumulate delta
    // @ts-ignore
    line_deltas.get(line).delta += delta;
  }
  return replacement;
});`;

			const expected = String.raw`js.code = js.code.replace(
  /^(export\s+)declare\s+(function\s+\w+[^{\n]*;)$/gm,
  (match, p1, p2, offset) => {
    const replacement =
      p1 + p2;
    const line =
      offset_to_line(offset);
    const delta =
      replacement.length -
      match.length; // negative (removing 'declare ')

    // Track first change offset and total delta per line
    if (
      !line_deltas.has(line)
    ) {
      line_deltas.set(line, {
        offset,
        delta,
      });
    } else {
      // Additional change on same line - accumulate delta
      // @ts-ignore
      line_deltas.get(
        line,
      ).delta += delta;
    }
    return replacement;
  },
);`;

			const result = await format(input, { singleQuote: true, printWidth: 30 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep blank lines between commented out block and markup', async () => {
			const expected = `function CounterWrapper(props) {
  const more = {
    double: track(() => props.count * 2),
    another: track(0),
    onemore: 100,
  };

  // if (props.count > 1) {
  // 	delete more.another;
  // }

  <div>
    <Counter {...props} {...more} />
  </div>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep parens around negating key in object expression', async () => {
			const input = `effect(() => {
  props.count;
  if (props.count > 1 && 'another' in more) {
  	untrack(() => delete more.another);
  } else if (props.count > 2 && !('another' in more)) {
  	untrack(() => more.another = 0);
  }
  untrack(() => console.log(more));
});`;

			const expected = `effect(() => {
  props.count;
  if (props.count > 1 && 'another' in more) {
    untrack(() => delete more.another);
  } else if (props.count > 2 && !('another' in more)) {
    untrack(() => (more.another = 0));
  }
  untrack(() => console.log(more));
});`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep parents in math subtraction and multiplication', async () => {
			const expected = `let offset = track(() => (page - 1) * limit);`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep parens around the right operand of a same-operator subtraction', async () => {
			const expected = `const d = a - (b - c);`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep parens around the right operand of a same-operator division', async () => {
			const expected = `const d = a / (b / c);`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep parens around a right-side addition under string concatenation', async () => {
			const expected = `const s = 'x' + (n + 1);`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should drop redundant parens around the left operand of a same-operator addition', async () => {
			const input = `const s = (a + b) + c;`;
			const expected = `const s = a + b + c;`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep parens around the left operand of exponentiation', async () => {
			const expected = `const p = (a ** b) ** c;`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should have parents around low-precedence logical expression', async () => {
			const input = `files = [...files ?? [], ...dt.files];
files = [...(files ?? []), ...dt.files];`;
			const expected = `files = [...(files ?? []), ...dt.files];
files = [...(files ?? []), ...dt.files];`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should drop redundant parentheses around an identifier callee', async () => {
			const result = await format(`const s = (foo)();`, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(`const s = foo();`);
		});

		it('should preserve parentheses around IIFE arrow function callee', async () => {
			const expected = `const s = (() => {
  return true;
})();`;

			const result = await format(expected, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve parentheses around IIFE function expression callee', async () => {
			const expected = `const s = (function () {
  return true;
})();`;

			const result = await format(expected, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should recognize and preserve class assignments to variables', async () => {
			const expected = `let test = class MediaQueryList {};`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve class computed method', async () => {
			const expected = `class TestClass {
  ['something']() {
    const i = 10;
  }
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve explicit tsx blocks in class methods', async () => {
			const input = `class Foo {
	bar() {
	return <>{"Hello"}</>;
	}
}`;

			const expected = `class Foo {
  bar() {
    return <>{'Hello'}</>;
  }
}`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve object computed methods', async () => {
			const expected = `const obj = {
  ['something']() {
    const i = 10;
  },
};`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should print class constructor method only once', async () => {
			const expected = `class TestClass {
  constructor(value: T) {
    this.value = value;
  }
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not remove comments when stylesheet contains some sort of combination of selectors', async () => {
			const expected = `function Editor() {
  <div class="editor-mockup">
    <div class="editor-header">
      <div class="editor-dots">
        // <div class="editor-dot red" />
        // <div class="editor-dot yellow" />
        <div class="editor-dot green" />
      </div>
      <div class="editor-tab">{'Examples.tsrx'}</div>
    </div>
    <div class="editor-content">
      <pre class="editor-code">
        <span class="editor-loader">{'Loading...'}</span>
      </pre>
    </div>
  </div>

  <style>
    @keyframes editorSlideIn {
      0% {
        opacity: 0;
        transform: translateY(30px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .editor-mockup {
      max-width: 700px;
      margin: 1rem auto;
      background: rgba(30, 30, 35, 0.98);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      text-align: left;
      opacity: 1;
      transform: translateY(30px);
      animation: editorSlideIn 1s ease-out 0.5s forwards;
    }

    .editor-header {
      background: rgba(20, 20, 25, 0.9);
      padding: 0.75rem 1rem 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: flex-start;
      gap: 1rem;
    }

    .editor-dots {
      display: flex;
      gap: 0.5rem;
      align-self: center;
      margin-top: -7px;
    }

    .editor-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .editor-dot.red {
      background: #ff5f57;
    }
    .editor-dot.yellow {
      background: #ffbd2e;
    }
    .editor-dot.green {
      background: #28ca42;
    }

    .editor-loader {
      display: 'flex';
      align-items: center;
      justify-content: center;
    }

    .editor-tab {
      background: rgba(25, 25, 30, 0.95);
      padding: 0.5rem 1rem;
      border-radius: 6px 6px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      font-size: 0.75rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-bottom: none;
      margin-bottom: -1px;
      align-self: flex-end;
    }

    .editor-content {
      background: rgba(25, 25, 30, 0.95);
      padding: 0;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      font-size: 0.8rem;
      line-height: 1.5;
      color: #e1e4e8;
      overflow-x: auto;
      text-align: left;
      height: 800px;
    }

    .editor-code {
      margin: 0;
      padding: 1.5rem;
      background: none;
      color: inherit;
      font: inherit;
      white-space: pre;
      overflow-x: auto;
    }

    :global(.editor-line) {
      display: block;
    }

    :global(.line-number) {
      color: rgba(255, 255, 255, 0.3);
      display: inline-block;
      width: 1rem;
      text-align: right;
      margin-right: 0.75rem;
      user-select: none;
    }

    :global(.keyword) {
      color: #569cd6;
    }
    :global(.export-keyword) {
      color: #c586c0;
    }
    :global(.string) {
      color: #ce9178;
    }
    :global(.component) {
      color: #4ec9b0;
    }
    :global(.function) {
      color: #dcdcaa;
    }
    :global(.property) {
      color: #9cdcfe;
    }
    :global(.css-selector) {
      color: #d7ba7d;
    }
    :global(.control-keyword) {
      color: #c586c0;
    }
    :global(.block-brace) {
      color: #c586c0;
    }
    :global(.tag) {
      color: #569cd6;
    }
    :global(.attribute) {
      color: #92c5f8;
    }
    :global(.value) {
      color: #b5cea8;
    }
    :global(.comment) {
      color: #6a9955;
      font-style: italic;
    }
    :global(.brace) {
      color: #ffd700;
    }
    :global(.css-brace) {
      color: #d4d4d4;
    }
    :global(.template-brace) {
      color: #ffd700;
    }
    :global(.tsrx-syntax) {
      color: #4fc1ff;
    }
    :global(.bracket) {
      color: #808080;
    }
    :global(.reactive-var) {
      color: #9cdcfe;
      font-weight: bold;
    }
  </style>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps parens in place when necessary for logical reasons with && and || operators', async () => {
			const expected = `function App() {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  }
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('expands empty braces to new lines for for-in statements', async () => {
			const expected = `for (const key in obj) {
}`;
			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('prints empty for, while, and do-while bodies as {} like Prettier', async () => {
			const input = `for (let i = 0; i < 10; i++) {
}
for (;;) {
}
while (true) {
}
do {
} while (true);`;
			const expected = `for (let i = 0; i < 10; i++) {}
for (;;) {}
while (true) {}
do {} while (true);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('expands an empty block in a statement list like Prettier', async () => {
			const input = `{}
function f() {
  {}
  label: {}
}
const g = () => {};
class K {
  static {}
  m() {}
}
namespace N {}`;
			const expected = `{
}
function f() {
  {
  }
  label: {
  }
}
const g = () => {};
class K {
  static {}
  m() {}
}
namespace N {}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('adds semicolon after do-while when semi option is true', async () => {
			const input = `do { console.log('x') } while (true)`;
			const expected = `do {
  console.log("x");
} while (true);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('omits semicolon after do-while when semi option is false', async () => {
			const input = `do { console.log('x') } while (true);`;
			const expected = `do {
  console.log("x")
} while (true)`;
			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(expected);
		});

		it('expands empty braces to new lines for switch case blocks', async () => {
			const expected = `switch (x) {
  case 1: {
  }
}`;
			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('expands empty braces for template control-flow blocks', async () => {
			const input = `const App=()=> <>@if (ready) {} @else {}@for (const item of items) {} @empty {}</>;`;
			const expected = `const App = () => (
  <>
    @if (ready) {
    } @else {
    }
    @for (const item of items) {
    } @empty {
    }
  </>
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('expands empty braces for try family blocks', async () => {
			const input = `function Foo() @{ @try {} @pending {} @catch {} }
function Bar() @{ @try {} @catch {} }
function Baz() { try {} catch {} finally {} }
function Qux() { try {} catch {} }`;
			const expected = `function Foo() @{
  @try {
  } @pending {
  } @catch {
  }
}
function Bar() @{
  @try {
  } @catch {
  }
}
function Baz() {
  try {
  } catch {
  } finally {
  }
}
function Qux() {
  try {
  } catch {}
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('prints function with a rest parameter correctly', async () => {
			const expected = `function TestRest(...args: string[]) {
  console.log(args);
}`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps parens around as ts expression and optional calling', async () => {
			const expected = `(resolve_fn as () => void)?.();`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps dynamic import TSImportType intact', async () => {
			const expected = `let streamed_error: Error | null = null;
const sink: import('@example/runtime/server').SSRStreamSink = {
  push(_chunk: string) {},
  close() {},
  error(reason: unknown) {
    streamed_error = reason as Error;
  },
};`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle empty component', async () => {
			const input = 'export function Empty() {}';
			const result = await format(input);
			expect(result).toBeWithNewline('export function Empty() {}');
		});

		it('should handle function with only style', async () => {
			const input = `export function Styled(){<style>body{background:#fff}</style>}`;
			const expected = `export function Styled() {
  <style>
    body {
      background: #fff;
    }
  </style>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should handle empty function using cursor', async () => {
			const input = 'export function Empty() {}';
			const result = await format(input);
			expect(result).toBeWithNewline('export function Empty() {}');
		});

		it('should correctly handle call expressions', async () => {
			const input = `export function App() {
	const context = track(globalContext.get().theme);
	<div>
	<TypedComponent />
	{context.value}
	</div>
}`;

			const expected = `export function App() {
  const context = track(globalContext.get().theme);
  <div>
    <TypedComponent />
    {context.value}
  </div>
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly handle TS syntax', async () => {
			const input = `type User = { name: string; age: number };
let message: string[] = [];

// comments should be preserved

message.push(greet(\`TSRX\`));
message.push(\`User: \${JSON.stringify({ name: 'Alice', age: 30 } as User)}\`);`;

			const expected = `type User = { name: string; age: number };
let message: string[] = [];

// comments should be preserved

message.push(greet(\`TSRX\`));
message.push(\`User: \${JSON.stringify({ name: "Alice", age: 30 } as User)}\`);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly handle inline jsx like comments', async () => {
			const input = `let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet(\`TSRX\`));
`;

			const expected = `let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet(\`TSRX\`));`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly handle inline document like comments', async () => {
			const input = `let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet( /* Some text */ \`TSRX\`));
`;

			const expected = `let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet(/* Some text */ \`TSRX\`));`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should keep comments inside function with one statement at the top', async () => {
			const expected = `function App() {
  const something = 5;
  // comment
}

function test() {
  const something = 5;
  // comment
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve block comments before closing tag in elements', async () => {
			const expected = `function App() {
  <div>
    <span>{'child'}</span>
    /* block comment */
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve template comments and blank lines from unformatted input', async () => {
			const input = `function TodoList() @{
<>
  /* world 0 */
  // hello
  /* world 1 */
  <ul>
  // hello
  /* world 2 */

  </ul>

  <ul>
  // hello
  /* world 3 */
  // hello
  </ul>
  /* world 4 */
  </>
}`;

			const expected = `function TodoList() @{
  <>
    /* world 0 */
    // hello
    /* world 1 */
    <ul>
      // hello
      /* world 2 */
    </ul>

    <ul>
      // hello
      /* world 3 */
      // hello
    </ul>
    /* world 4 */
  </>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
			// Reformatting the output must be stable.
			expect(await format(result, { singleQuote: true })).toBeWithNewline(expected);
		});

		it('should preserve block comments before a closing fragment', async () => {
			const expected = `function App() @{
  <>
    <span>{'child'}</span>

    /* block comment */
  </>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve a blank line before a trailing block comment in elements', async () => {
			const expected = `function App() {
  <div>
    <span>{'child'}</span>

    /* block comment */
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve a comment-only fragment body', async () => {
			const expected = `function App() @{
  <>
    /* only */
  </>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep blank lines around comments between template siblings', async () => {
			const expected = `function App() @{
  <>
    <ul></ul>

    /* between */

    <ul></ul>
  </>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep a trailing line comment after an expression container child', async () => {
			const expected = `function App() @{
  <>
    {q} // hey
    // hello
  </>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep a trailing block comment after an expression container child', async () => {
			const expected = `function App() {
  <div>
    {x} /* note */
    <span>{'tail'}</span>
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve trailing comments in function parameters', async () => {
			const expected = `function test(
  // comment in params
  a,
  // comment in params
  b,
  // comment in params
  c,
  // comment in params
) {}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve trailing comments in call arguments', async () => {
			const expected = `fn(
  arg1,
  // comment in args
  arg2,
  // comment in args
  arg3,
  // comment in args
);`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve trailing comments in arrow function parameters', async () => {
			const expected = `const test = (
  // comment in params
  a,
  // comment in params
  b,
  // comment in params
  c,
  // comment in params
) => {};`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve trailing comments in class body', async () => {
			const expected = `class MyClass {
  /* comment 1 */
  method1() {}
  //comment 2

  method2() {}
  // comment 3
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('puts every class member on its own line and keeps one blank line between members', async () => {
			const input = `class A { a = 1; b = 2; }
class B {
  a = 1;


  b = 2;
}
class C {
  a = 1; /* note */
  b = 2;
}
foo(class { a = 1 });`;
			const expected = `class A {
  a = 1;
  b = 2;
}
class B {
  a = 1;

  b = 2;
}
class C {
  a = 1; /* note */
  b = 2;
}
foo(
  class {
    a = 1;
  },
);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments in object expressions', async () => {
			const expected = `const obj = {
  /* comment 1 */
  a: 1,

  // comment 2
  b: 2,
  // comment 3
};`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments in switch statement cases', async () => {
			const input = `switch (x) {
  case 1:
    foo();
    // comment 1
  case 2:
    bar();
    // comment 2
}`;

			const expected = `switch (x) {
  case 1:
    foo();
  // comment 1
  case 2:
    bar();
  // comment 2
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps blank lines between the statements of a switch case', async () => {
			const expected = `switch (x) {
  case 1:
    a();

    // lead b
    b();
    break;

  default:
    c();

    d();
}`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('drops a blank line after a case label or a stray semicolon line in a switch case', async () => {
			const input = `switch (x) {
  case 1:

    a();
    ;
    b();
}`;
			const expected = `switch (x) {
  case 1:
    a();
    b();
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps same-line comments in switch cases on their line', async () => {
			const expected = `switch (x) {
  case 1: // after the label
    a(); // after a statement
  case 2: // after an empty case
  case 3 /* before the colon */:
    b(); /* block */
  case 4 /* a */: // b
    c();
  default: /* d */
    d(); // last
  // own line
}`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a comment after a case label with its first statement below it', async () => {
			const input = `switch (x) {
  case 1: // c
    // d
    a();
  default: // e
    b();
  case 2: /* f */ c();
  case 3 /* g */: d();
  case 4: /* h */ /* i */
    e();
}`;
			const expected = `switch (x) {
  case 1: // c
    // d
    a();
  default: // e
    b();
  case 2:
    /* f */ c();
  case 3 /* g */:
    d();
  case 4 /* h */ /* i */:
    e();
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('moves a line comment after a case label into the lone block that follows', async () => {
			// Prettier prints \`case 1: { // c\` and then, on a second pass, this
			const input = `switch (x) {
  case 1: // c
    {
      a();
    }
  case 2: /* d */
  {}
  default: // e
    {
    }
}`;
			const expected = `switch (x) {
  case 1: {
    // c
    a();
  }
  case 2 /* d */: {
  }
  default: {
    // e
  }
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps blank lines and comments around @case bodies', async () => {
			const expected = `function App() @{
  <div>
    @switch (x) {
      // before case
      @case 1: {
        const a = 1;

        <span>{a}</span>
      } // after case

      /* before default */
      @default: {
        <b />
      }
    }
  </div>
}`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('should not add an extra new line above a comment inside objects and in between properties', async () => {
			const expected = `let obj = {
  ['hey']: function () {
    const i = 'yo';
  },
  // <div>{'Weird name component'}</div>
  normal() {
    const b = 'hey';
  },
};`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not add an extra blank line before a comment inside element children', async () => {
			const expected = `function App() {
  <div id="second-top-block">
    <div>
      let x = 1;
      // comment
      <div>{'Test'}</div>
    </div>
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comment if the whole function code is commented out', async () => {
			const expected = `export function Test() {
  // thing
  // thing
  // thing
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('prints the comments of a commented-out function body on consecutive lines', async () => {
			const input = `export function Test() {
  // thing
  // thing
  /* thing */
  // thing

  /* thing */
  // thing

  /* thing */
  // thing
}`;
			const expected = `export function Test() {
  // thing
  // thing
  /* thing */
  // thing
  /* thing */
  // thing
  /* thing */
  // thing
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments in arrays with width 80', async () => {
			const input = `const arr = [
  1,
  /* comment 1 */
  2,
  3,
  // comment 2
];`;

			const expected = `const arr = [
  1,
  /* comment 1 */
  2, 3,
  // comment 2
];`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should properly format array with various sized strings and 100 printWidth', async () => {
			const expected = `function App() {
  const d = [
    'm14 12 4 4 4-4',
    'M18 16V7',
    'm2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16',
    'M3.304 13h6.392',
  ];
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly handle for loops with variable declarations', async () => {
			const input = `for (let i = 0, len = array.length; i < len; i++) {
  console.log(i);
}`;
			const expected = `for (let i = 0, len = array.length; i < len; i++) {
  console.log(i);
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('puts each clause of a long for header on its own line', async () => {
			const input = `for (let index = 0, length = items.length; index < length && !found; index += step) {
  visit(items[index]);
}
label: for (let someLongVariableName = 0; someLongVariableName < limit; someLongVariableName++) {}
function App() @{
  <ul>
    @for (let someLongVariableName = 0; someLongVariableName < limit; someLongVariableName++) {
      <li />
    }
  </ul>
}`;
			const expected = `for (
  let index = 0, length = items.length;
  index < length && !found;
  index += step
) {
  visit(items[index]);
}
label: for (
  let someLongVariableName = 0;
  someLongVariableName < limit;
  someLongVariableName++
) {}
function App() @{
  <ul>
    @for (
      let someLongVariableName = 0;
      someLongVariableName < limit;
      someLongVariableName++
    ) {
      <li />
    }
  </ul>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('prints the empty clauses of a for header like Prettier', async () => {
			const input = `for (;;) {}
for (; i < n;) {}
for (;; i++) {}
for (let i = 0;;) {}
for (let i = 0; i < n;) {}`;
			const expected = `for (;;) {}
for (; i < n;) {}
for (; ; i++) {}
for (let i = 0; ;) {}
for (let i = 0; i < n;) {}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly render attributes in template', async () => {
			const input = `export function App() {
  <div>
   <Expand name='' startingLength={20} />
  </div>
}`;

			const expected = `export function App() {
  <div>
    <Expand name="" startingLength={20} />
  </div>
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should handle different attribute value types correctly', async () => {
			const input = `export function Test() {
  <div
    stringProp="hello"
    numberProp={42}
    booleanProp={true}
    falseProp={false}
    nullProp={null}
    expression={x + 1}
  />
}`;

			const expected = `export function Test() {
  <div stringProp="hello" numberProp={42} booleanProp={true} falseProp={false} nullProp={null} expression={x + 1} />
}`;

			const result = await format(input, { singleQuote: true, printWidth: 120 });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle default arguments correctly in functions', async () => {
			const input = `function expand({ name, startingLength = 10 }: { name: string; startingLength?: number }) {
  return null;
}`;

			const expected = `function expand({
  name,
  startingLength = 10,
}: {
  name: string;
  startingLength?: number;
}) {
  return null;
}`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle default arguments correctly in arrow functions', async () => {
			const input = `const expand = ({ name, startingLength = 10 }: { name: string; startingLength?: number }) => {
  return null;
};`;

			const expected = `const expand = ({
  name,
  startingLength = 10,
}: {
  name: string;
  startingLength?: number;
}) => {
  return null;
};`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle array and object patterns correctly', async () => {
			const input = `for (const [i = 0, item] of items.entries()) {}
for (const {i = 0, item} of items.entries()) {}`;

			const expected = `for (const [i = 0, item] of items.entries()) {
}
for (const { i = 0, item } of items.entries()) {
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should handle various other TS things', async () => {
			const input = `const globalContext = new Context<{ theme: string, array: number[] }>({ theme: 'light', array: [] });
const items = [] as unknown[];`;

			const expected = `const globalContext = new Context<{ theme: string; array: number[] }>({
  theme: 'light',
  array: [],
});
const items = [] as unknown[];`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly handle for loop with index syntax, plus comments', async () => {
			const input = `const test = () => {
  // some comments
  for (const item of []; index i) {
    // comment
  }
  debugger;

  // some comments
  const test = ""; // some comments 2
};`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('should not format html elements that fit on one line', async () => {
			const expected = `export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('should format html elements that fit on one line', async () => {
			const input = `export function App() {
  <div class="container">
    <p>
      {'Some Random text'}
    </p>
  </div>
}`;

			const expected = `export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`;

			const result = await format(input, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('should support jsxSingleQuote option', async () => {
			const input = `export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`;

			const expected = `export function App() {
  <div class='container'>
    <p>{'Some Random text'}</p>
  </div>
}`;
			const result = await format(input, { singleQuote: true, jsxSingleQuote: true });

			expect(result).toBeWithNewline(expected);
		});

		it('should format all basic TypeScript primitive types', async () => {
			const input = `function TypeTest() {
        type t0 = undefined;
        type t1 = number;
        type t2 = string;
        type t3 = boolean;
        type t4 = null;
        type t5 = symbol;
        type t6 = bigint;
        type t7 = any;
        type t8 = unknown;
        type t9 = never;
        type t10 = void;
        <div>{"test"}</div>
      }`;

			const expected = `function TypeTest() {
  type t0 = undefined;
  type t1 = number;
  type t2 = string;
  type t3 = boolean;
  type t4 = null;
  type t5 = symbol;
  type t6 = bigint;
  type t7 = any;
  type t8 = unknown;
  type t9 = never;
  type t10 = void;
  <div>{'test'}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript utility types', async () => {
			const input = `function UtilityTypeTest() {
        type t11 = { a: number; b: string };
        type t12 = keyof t11;
        const T0: t17 = { x: 1 };
        type t13 = typeof T0;
        type t14 = Partial<t11>;
        type t15 = Required<t14>;
        type t16 = Readonly<t15>;
        type t17 = Record<string, number>;
        type t18 = Pick<t11, 'a'>;
        type t19 = Omit<t11, 'b'>;
        type t20 = ReturnType<() => string>;
        type t21 = Parameters<(x: number, y: string) => void>;
        type t27 = new () => object;
        type t41 = ReturnType<typeof Math.max>;
        <div>{"test"}</div>
      }`;

			const expected = `function UtilityTypeTest() {
  type t11 = { a: number; b: string };
  type t12 = keyof t11;
  const T0: t17 = { x: 1 };
  type t13 = typeof T0;
  type t14 = Partial<t11>;
  type t15 = Required<t14>;
  type t16 = Readonly<t15>;
  type t17 = Record<string, number>;
  type t18 = Pick<t11, 'a'>;
  type t19 = Omit<t11, 'b'>;
  type t20 = ReturnType<() => string>;
  type t21 = Parameters<(x: number, y: string) => void>;
  type t27 = new () => object;
  type t41 = ReturnType<typeof Math.max>;
  <div>{'test'}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript generics in variable declarations', async () => {
			const input = `function GenericTest() {
        let open: Tracked<boolean> = track(false);
        let items: Array<string> = [];
        let map: Map<string, number> = new Map();
        <div>{"test"}</div>
      }`;

			const expected = `function GenericTest() {
  let open: Tracked<boolean> = track(false);
  let items: Array<string> = [];
  let map: Map<string, number> = new Map();
  <div>{'test'}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript union and intersection types', async () => {
			const input = `function UnionTest() {
        type StringOrNumber = string | number;
        type Props = { a: string } & { b: number };
        let value: string | null = null;
        <div>{"test"}</div>
      }`;

			const expected = `function UnionTest() {
  type StringOrNumber = string | number;
  type Props = { a: string } & { b: number };
  let value: string | null = null;
  <div>{'test'}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should normalize simple cast union types at print width 100', async () => {
			const input = `const alphaLink = container.querySelector('[data-route-id="alpha"]') as HTMLAnchorElement | null;
const saveButton = container.querySelector('[data-action-id="save"]') as HTMLButtonElement | null;
const deleteButton = container.querySelector('[data-action-id="delete"]') as | HTMLButtonElement
| null;`;

			const expected = `const alphaLink = container.querySelector('[data-route-id="alpha"]') as HTMLAnchorElement | null;
const saveButton = container.querySelector('[data-action-id="save"]') as HTMLButtonElement | null;
const deleteButton = container.querySelector(
  '[data-action-id="delete"]',
) as HTMLButtonElement | null;`;

			const result = await format(input, { printWidth: 100, singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should normalize simple cast union types at print width 80', async () => {
			const input = `const alphaLink = container.querySelector('[data-route-id="alpha"]') as HTMLAnchorElement | null;
const saveButton = container.querySelector('[data-action-id="save"]') as HTMLButtonElement | null;
const deleteButton = container.querySelector('[data-action-id="delete"]') as | HTMLButtonElement
| null;`;

			const expected = `const alphaLink = container.querySelector(
  '[data-route-id="alpha"]',
) as HTMLAnchorElement | null;
const saveButton = container.querySelector(
  '[data-action-id="save"]',
) as HTMLButtonElement | null;
const deleteButton = container.querySelector(
  '[data-action-id="delete"]',
) as HTMLButtonElement | null;`;

			const result = await format(input, { printWidth: 80, singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format multiline TypeScript union object types like Prettier TypeScript', async () => {
			const input = `type SvgIconSource = { name: SvgIconName; data?: never } | {
    data: SvgIconData;
    name?: never;
 }`;

			const expected = `type SvgIconSource =
  | { name: SvgIconName; data?: never }
  | {
      data: SvgIconData;
      name?: never;
    };`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should break long TypeScript union types with leading operators', async () => {
			const input = `type Source = SomeVeryLongTypeNameThatWillDefinitelyNotFit | AnotherVeryLongTypeNameThatWillDefinitelyNotFit;`;

			const expected = `type Source =
  | SomeVeryLongTypeNameThatWillDefinitelyNotFit
  | AnotherVeryLongTypeNameThatWillDefinitelyNotFit;`;

			const result = await format(input, { printWidth: 50 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep comments attached to their type arguments and stay idempotent', async () => {
			const input = `interface Props {
	form: AppFieldExtendedReactFormApi<
		unknown,
		| undefined
		| FormAsyncValidateOrFn<unknown>, // this types it as 'never' in the render prop. It should prevent any
		// untyped meta passed to the handleSubmit by accident.
		NoInfer<TSubmitMeta>
	>;
}`;
			// Matches vanilla prettier's typescript parser output for the same input.
			const expected = `interface Props {
	form: AppFieldExtendedReactFormApi<
		unknown,
		undefined | FormAsyncValidateOrFn<unknown>, // this types it as 'never' in the render prop. It should prevent any
		// untyped meta passed to the handleSubmit by accident.
		NoInfer<TSubmitMeta>
	>;
}`;
			const options = { useTabs: true, tabWidth: 2, singleQuote: true, printWidth: 100 };
			const result = await format(input, options);
			expect(result).toBeWithNewline(expected);
			expect(await format(result, options)).toBe(result);
		});

		it('should hug a lone object type argument against the angle brackets', async () => {
			const input = `function Button(props: PropsWithExtras<{
	variant: string;
	label: string;
	onClick: EventListener;
}>) @{
	<button class={props.variant} onClick={props.onClick}>
		{props.label}
	</button>
}`;
			const options = { useTabs: true, tabWidth: 2, singleQuote: true, printWidth: 100 };
			const result = await format(input, options);
			expect(result).toBeWithNewline(input);
			expect(await format(result, options)).toBe(result);
		});

		it('should not overindent multiline object type aliases', async () => {
			const input = `type ModuleShape = {
  default: ComponentType<{ value: string }>;
}`;
			const expected = `type ModuleShape = {
  default: ComponentType<{ value: string }>;
};`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript tuple types (TSTupleType)', async () => {
			const input = `type T = [string, number, boolean];`;
			const expected = `type T = [string, number, boolean];`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve named optional TypeScript tuple members', async () => {
			const input = `export type OptionalTuple = [bar: string, baz?: string];`;
			const expected = `export type OptionalTuple = [bar: string, baz?: string];`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript index signatures (TSIndexSignature)', async () => {
			const input = `interface Dict { [key: string]: number; readonly [id: number]: string }`;
			const expected = `interface Dict {
  [key: string]: number;
  readonly [id: number]: string;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript constructor types (TSConstructorType)', async () => {
			const input = `type Ctor = new (x: number, y: string) => Foo;`;
			const expected = `type Ctor = new (x: number, y: string) => Foo;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript conditional types (TSConditionalType)', async () => {
			const input = `type T = string extends string ? number : boolean;`;
			const expected = `type T = string extends string ? number : boolean;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should break long nested TypeScript conditional type aliases', async () => {
			const input = `type PageModelValue<Value> = Value extends ReadonlySignal<unknown> ? Value : Value extends (...args: any[]) => any ? Value : Value extends object ? { [Key in keyof Value]: PageModelValue<Value[Key]> } : never;`;
			const expected = `type PageModelValue<Value> =
  Value extends ReadonlySignal<unknown>
    ? Value
    : Value extends (...args: any[]) => any
      ? Value
      : Value extends object
        ? { [Key in keyof Value]: PageModelValue<Value[Key]> }
        : never;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript mapped types (TSMappedType)', async () => {
			const input = `type ReadonlyPartial<T> = { readonly [K in keyof T]?: T[K] }`;
			const expected = `type ReadonlyPartial<T> = { readonly [K in keyof T]?: T[K] };`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve minus mapped modifiers in TypeScript mapped types', async () => {
			const input = `type MutableRequired<T> = { -readonly [K in keyof T]-?: T[K] }`;
			const expected = `type MutableRequired<T> = { -readonly [K in keyof T]-?: T[K] };`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve explicit plus mapped modifiers in TypeScript mapped types', async () => {
			const input = `type ExplicitReadonlyOptional<T> = { +readonly [K in keyof T]+?: T[K] }`;
			const expected = `type ExplicitReadonlyOptional<T> = { +readonly [K in keyof T]+?: T[K] };`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript qualified names (TSQualifiedName)', async () => {
			const input = `type T = Foo.Bar;`;
			const expected = `type T = Foo.Bar;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript indexed access types (TSIndexedAccessType)', async () => {
			const input = `type V = Props["value"]; type W = Map<string, number>["size"]; type X = T[K];`;
			const expected = `type V = Props["value"];
type W = Map<string, number>["size"];
type X = T[K];`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should properly format TSParenthesizedType', async () => {
			const expected = `const logs: (number | undefined)[] = [];`;
			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TSMethodSignature in interfaces', async () => {
			const input = `interface API{get(path:string):Promise<Response>;post<T>(path:string,data:T):Promise<Response>;delete?(id:number):void}`;
			const expected = `interface API {
  get(path: string): Promise<Response>;
  post<T>(path: string, data: T): Promise<Response>;
  delete?(id: number): void;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TSMethodSignature with type parameters', async () => {
			const input = `interface Collection{map<U>(fn:(item:T)=>U):U[];filter(predicate:(item:T)=>boolean):T[]}`;
			const expected = `interface Collection {
  map<U>(fn: (item: T) => U): U[];
  filter(predicate: (item: T) => boolean): T[];
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve TSCallSignatureDeclaration with conditional types', async () => {
			const expected = `interface TrackedCallable<V> {
  (props: V extends Component<infer P> ? P : never): V extends Component ? void : never;
}`;
			const result = await format(expected, { printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TSNonNullExpression', async () => {
			const input = `function Test(){let value:string|null=null;let length=value!.length;<div>{length}</div>}`;
			const expected = `function Test() {
  let value: string | null = null;
  let length = value!.length;
  <div>{length}</div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should keep the TSInstantiationExpression ', async () => {
			const expected = `function Test() {
  const items = (Promise<string[]>).reject(new Error('Async error'));
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TSNonNullExpression in complex expressions', async () => {
			const input = `function getValue(x?:string){return x!.toUpperCase()}`;
			const expected = `function getValue(x?: string) {
  return x!.toUpperCase();
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format TSDeclareFunction (function overload signatures)', async () => {
			const input = `export function test(arg: string): string;
export function test(arg: number): string;
export function test(arg: string | number): string {
  return String(arg);
}`;
			const expected = `export function test(arg: string): string;
export function test(arg: number): string;
export function test(arg: string | number): string {
  return String(arg);
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve declare modifier on ambient function declarations', async () => {
			const input = `declare function doSomething(x: string): void;
declare function processData<T>(data: T): Promise<T>;`;
			const expected = `declare function doSomething(x: string): void;
declare function processData<T>(data: T): Promise<T>;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve generics on method shorthand in object literals', async () => {
			const input = `function getBuilder() {
  return {
    build<T>(): T {
      return 'test' as unknown as T;
    },
  };
}`;
			const expected = `function getBuilder() {
  return {
    build<T>(): T {
      return 'test' as unknown as T;
    },
  };
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve generic type arguments on JSX function tags', async () => {
			const input = `type User = { name: string };
function RenderProp<Item>(props: { children: (item: Item) => any }) {}
export function App() {
	<RenderProp<User>>
	{(item) => item.name}
	</RenderProp>
}`;

			const expected = `type User = { name: string };
function RenderProp<Item>(props: { children: (item: Item) => any }) {}
export function App() {
  <RenderProp<User>>{(item) => item.name}</RenderProp>
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve multiple generics on method shorthand', async () => {
			const input = `const obj = {
  method<V, T, U>(): { build: () => V; data: T; key: U } {
    return null as any;
  },
};`;
			const expected = `const obj = {
  method<V, T, U>(): { build: () => V; data: T; key: U } {
    return null as any;
  },
};`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should retain templated declarations', async () => {
			const expected = `function Wrapper() {
  return {
    unwrap: function <T>() {
      return null as unknown as T;
    },
  };
}

class Box<T> {
  value: T;

  method<T>(): T {
    return this.value;
  }
}

function Wrapper2<T>(arg: T) {
  let x: T = arg;
  return {
    unwrap: function <T>() {
      return null as unknown as T;
    },
    do: function (): T {
      return x;
    },
  };
}

const fn = <T>(arg: T): T => arg;`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('respects arrowParens option', async () => {
			const input = `function inputRef(node) {
	const removeListener = on(node, 'input', e => { value = e.target.value; console.log(value) });

	return () => { removeListener(); }
}`;

			const expected = `function inputRef(node) {
  const removeListener = on(node, 'input', (e) => {
    value = e.target.value;
    console.log(value);
  });

  return () => {
    removeListener();
  };
}`;

			const result = await format(input, {
				singleQuote: true,
				arrowParens: 'always',
			});
			expect(result).toBeWithNewline(expected);
		});

		it('keeps one new line between comment blocks and code if 1 or more exist', async () => {
			const input = `// comments
//comments


//comments
function inputRef(node) {
  console.log('ref called');
  const removeListener = on(node, 'input', (e) => { value = e.target.value; console.log(value) });
  return () => {
    removeListener();
  }
}

// some comment
// more comments here

//now more comments
// and some more








//yet more`;

			const expected = `// comments
//comments

//comments
function inputRef(node) {
  console.log('ref called');
  const removeListener = on(node, 'input', (e) => {
    value = e.target.value;
    console.log(value);
  });
  return () => {
    removeListener();
  };
}

// some comment
// more comments here

//now more comments
// and some more

//yet more`;

			const result = await format(input, {
				singleQuote: true,
				arrowParens: 'always',
			});
			expect(result).toBeWithNewline(expected);
		});

		it('keeps one new line comments and functions when 1 or more exist', async () => {
			const input = `export function App() {
  // try {
    doSomething()
  // } catch {
  //   somethingElse()
  // }



try {
	doSomething();
  } catch {
	somethingElse();
  }
}`;

			const expected = `export function App() {
  // try {
  doSomething();
  // } catch {
  //   somethingElse()
  // }

  try {
    doSomething();
  } catch {
    somethingElse();
  }
}`;

			const result = await format(input, {
				singleQuote: true,
				arrowParens: 'always',
			});
			expect(result).toBeWithNewline(expected);
		});

		it('correctly formats array of objects and keys as either literals or identifiers', async () => {
			const input = `const tt = [
  {
    "id": "toast:2",
    "stacked": false,
  },
  {
    "id": "toast:3",
    "stacked": false,
  },
  {
    "id": "toast:4",
    "stacked": false,
  },
  {
    "id-literal": "toast:5",
    "stacked": false,
  },
  {
    "id": "toast:6",
    "stacked": false,
  },
  {
    ["id"]: "toast:6",
    ["stacked"]: false,
  }
];`;

			const expected = `const tt = [
  {
    id: 'toast:2',
    stacked: false,
  },
  {
    id: 'toast:3',
    stacked: false,
  },
  {
    id: 'toast:4',
    stacked: false,
  },
  {
    'id-literal': 'toast:5',
    stacked: false,
  },
  {
    id: 'toast:6',
    stacked: false,
  },
  {
    ['id']: 'toast:6',
    ['stacked']: false,
  },
];`;

			const result = await format(input, {
				singleQuote: true,
				arrowParens: 'always',
			});
			expect(result).toBeWithNewline(expected);
		});

		it('preserves typescript parameter types with a default value', async () => {
			const expected = `function getString(e: string = 'test') {
  return e;
}`;
			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript enums', async () => {
			const input = `enum Color{Red,Green,Blue}`;
			const expected = `enum Color {
  Red,
  Green,
  Blue,
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format TypeScript enums with values', async () => {
			const input = `enum Status{Active=1,Inactive=0,Pending=2}`;
			const expected = `enum Status {
  Active = 1,
  Inactive = 0,
  Pending = 2,
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format const enums', async () => {
			const input = `const enum Direction{Up,Down,Left,Right}`;
			const expected = `const enum Direction {
  Up,
  Down,
  Left,
  Right,
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should respect trailingComma option for enums', async () => {
			const input = `enum Size{Small,Medium,Large}`;
			const expected = `enum Size {
  Small,
  Medium,
  Large
}`;
			const result = await format(input, {
				singleQuote: true,
				trailingComma: 'none',
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should format enums with string values', async () => {
			const input = `enum Colors{Red='red',Green='green',Blue='blue'}`;
			const expected = `enum Colors {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep the return type annotation intact on an arrow function', async () => {
			const expected = `const getParams = (): Params<T> => ({});
interface Params<T> {}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves multiple regex patterns', async () => {
			const expected = `export function App() {
  let html = '<div>Hello</div><span>World</span>';
  let divMatch = html.match(/<div>/g);
  let spanReplace = html.replace(/<span>/g, '[SPAN]');
  let allTags = html.split(/<br>/);
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('preserves regex literals in variable assignments', async () => {
			const expected = `export function App() {
  let spanRegex = /<span>/g;
  let divRegex = /<div>/;
  let simpleRegex = /<br>/g;
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('distinguishes regex from JSX', async () => {
			const expected = `export function App() {
  let htmlString = '<p>Paragraph</p>';
  let paragraphs = htmlString.match(/<p>/g);
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('should handle edge case regex patterns', async () => {
			const expected = `export function Test() {
  let text = '<<test>> <span>content</span>';
  let multiAngle = text.match(/<span>/);
  let simplePattern = text.match(/<>/);
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('collapses multiple blank lines between statements', async () => {
			const input = `export function App() {
  let a = 1;


  let b = 2;
}`;

			const expected = `export function App() {
  let a = 1;

  let b = 2;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('remove all blank lines in empty statement', async () => {
			const input = `export function App() {



}`;

			const expected = `export function App() {}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes leading blank line at file start', async () => {
			const input = `

export function App() {
  let x = 1;
}`;

			const expected = `export function App() {
  let x = 1;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes trailing blank line at file end (preserves single newline)', async () => {
			const input = `export function App() {
  let x = 1;
}

`;

			const expected = `export function App() {
  let x = 1;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank lines immediately after opening brace', async () => {
			const input = `export function App() {

  let x = 1;
  let y = 2;
}`;

			const expected = `export function App() {
  let x = 1;
  let y = 2;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank lines immediately before closing brace', async () => {
			const input = `export function App() {
  let x = 1;
  let y = 2;

}`;

			const expected = `export function App() {
  let x = 1;
  let y = 2;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes leading blank line inside if block', async () => {
			const input = `export function App() {
  if (true) {

    console.log('test');
  }
}`;

			const expected = `export function App() {
  if (true) {
    console.log('test');
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes trailing blank line inside if block', async () => {
			const input = `export function App() {
  if (true) {
    console.log('test');

  }
}`;

			const expected = `export function App() {
  if (true) {
    console.log('test');
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between array elements when multi-line', async () => {
			const input = `export function App() {
  let arr = [
    1,

    2,

    3
  ];
}`;

			const expected = `export function App() {
  let arr = [
    1,

    2,

    3,
  ];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('respects trailingComma none in arrays with blank lines between elements', async () => {
			const input = `const values = [
  1,

  2,
];
const pairs = [
  1, 2,

  3, 4,
];
const commented = [
  1,

  2, // last
];
const holed = [
  1,

  2, ,
];`;

			const expected = `const values = [
  1,

  2
];
const pairs = [
  1, 2,

  3, 4
];
const commented = [
  1,

  2 // last
];
const holed = [1, 2, ,];`;

			const result = await format(input, { trailingComma: 'none' });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between object properties when multi-line', async () => {
			const input = `export function App() {
  let obj = {
    a: 1,

    b: 2,

    c: 3
  };
}`;

			const expected = `export function App() {
  let obj = {
    a: 1,

    b: 2,

    c: 3,
  };
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between function parameters when multi-line', async () => {
			const input = `export function App() {
  function test(
    a,

    b,

    c
  ) {
    return a + b + c;
  }
}`;

			const expected = `export function App() {
  function test(
    a,

    b,

    c,
  ) {
    return a + b + c;
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between call arguments when multi-line', async () => {
			const input = `export function App() {
  console.log(
    'first',

    'second',

    'third',
  );
}`;

			const expected = `export function App() {
  console.log(
    'first',

    'second',

    'third',
  );
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately after opening paren in params', async () => {
			const input = `export function App() {
  function foo(

    a,
    b
  ) {
    return a + b;
  }
}`;

			const expected = `export function App() {
  function foo(a, b) {
    return a + b;
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately before closing paren in params', async () => {
			const input = `export function App() {
  function foo(
    a,
    b

  ) {
    return a + b;
  }
}`;

			const expected = `export function App() {
  function foo(a, b) {
    return a + b;
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately after opening paren in call', async () => {
			const input = `export function App() {
  foo(

    'a',
    'b'
  );
}`;

			const expected = `export function App() {
  foo('a', 'b');
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately after opening bracket in array', async () => {
			const input = `export function App() {
  let arr = [

    1,
    2,
    3
  ];
}`;

			const expected = `export function App() {
  let arr = [1, 2, 3];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately before closing bracket in array', async () => {
			const input = `export function App() {
  let arr = [
    1,
    2,
    3

  ];
}`;

			const expected = `export function App() {
  let arr = [1, 2, 3];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately after opening brace in object', async () => {
			const input = `export function App() {
  let obj = {

    a: 1,
    b: 2
  };
}`;

			const expected = `export function App() {
  let obj = {
    a: 1,
    b: 2,
  };
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('removes blank line immediately before closing brace in object', async () => {
			const input = `export function App() {
  let obj = {
    a: 1,
    b: 2

  };
}`;

			const expected = `export function App() {
  let obj = {
    a: 1,
    b: 2,
  };
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves internal blank lines but removes leading/trailing in params', async () => {
			const input = `export function App() {
  function foo(

    a,

    b,

    c

  ) {
    return a + b + c;
  }
}`;

			const expected = `export function App() {
  function foo(
    a,

    b,

    c,
  ) {
    return a + b + c;
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves internal blank lines but removes leading/trailing in arrays', async () => {
			const input = `export function App() {
  let arr = [

    1,

    2,

    3

  ];
}`;

			const expected = `export function App() {
  let arr = [
    1,

    2,

    3,
  ];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves internal blank lines but removes leading/trailing in objects', async () => {
			const input = `export function App() {
  let obj = {

    a: 1,

    b: 2,

    c: 3

  };
}`;

			const expected = `export function App() {
  let obj = {
    a: 1,

    b: 2,

    c: 3,
  };
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between top-level statements', async () => {
			const input = `export function App() {
  let x = 1;

  let y = 2;

  console.log(x, y);
}`;

			const expected = `export function App() {
  let x = 1;

  let y = 2;

  console.log(x, y);
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves blank lines between class members', async () => {
			const input = `class Foo {
  method1() {
    return 1;
  }

  method2() {
    return 2;
  }

  method3() {
    return 3;
  }
}`;

			const expected = `class Foo {
  method1() {
    return 1;
  }

  method2() {
    return 2;
  }

  method3() {
    return 3;
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep blank line between components with a trailing comment at the end of the first', async () => {
			const expected = `function SVG({ children }) {
  <svg width={20} height={20} fill="blue" viewBox="0 0 30 10" preserveAspectRatio="none">
    let test = track(8);
    {test}
    <polygon points="0,0 30,0 15,10" />
  </svg>
  // <div>{children}</div>
}

function Polygon() {
  <polygon points="0,0 30,0 15,10" />
}`;

			const result = await format(expected, {
				singleQuote: true,
				printWidth: 100,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve blank line between commented out block and following element', async () => {
			const expected = `function App() @{
  <>
    <div id="second-top-block">
      <div>
        <div />
      </div>
      <div id="sibling-block">{"Sibling"}</div>
    </div>

    // if (show) {
    // 	<div id="third-top-block">{"Top Scope - Show is true"}</div>
    // }

    <button onClick={() => (b = !b)}>{"Toggle b"}</button>
  </>
}`;

			const result = await format(expected, { printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('inlines array elements when they fit within printWidth', async () => {
			const input = `export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`;

			const expected = `export function App() {
  let arr = [
    1, 2, 3, 4, 5,

    6, 7,

    8,
  ];
}`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('breaks array elements when they exceed printWidth 10', async () => {
			const input = `export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`;

			// With printWidth 10, all elements break to separate lines
			// Because even "6, 7," is 5 chars + indentation = exceeds 10
			const expected = `export function App() {
  let arr =
    [
      1,
      2,
      3,
      4,
      5,

      6,
      7,

      8,
    ];
}`;

			const result = await format(input, { singleQuote: true, printWidth: 10 });
			expect(result).toBeWithNewline(expected);
		});

		it('fits elements on same line with printWidth 11', async () => {
			const input = `export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`;

			// With printWidth 11: "    6, 7," is exactly 9 chars, should fit
			const expected = `export function App() {
  let arr =
    [
      1, 2,
      3, 4,
      5,

      6, 7,

      8,
    ];
}`;

			const result = await format(input, { singleQuote: true, printWidth: 11 });
			expect(result).toBeWithNewline(expected);
		});

		it('fits more elements with printWidth 15', async () => {
			const input = `export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`;

			// With printWidth 15: "    1, 2, 3," is 12 chars, should fit 1, 2, 3 together
			const expected = `export function App() {
  let arr = [
    1, 2, 3, 4,
    5,

    6, 7,

    8,
  ];
}`;

			const result = await format(input, { singleQuote: true, printWidth: 15 });
			expect(result).toBeWithNewline(expected);
		});

		it('fits even more elements with printWidth 18', async () => {
			const input = `export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`;

			// With printWidth 18: "    1, 2, 3, 4," is 15 chars, should fit 1, 2, 3, 4 together
			const expected = `export function App() {
  let arr = [
    1, 2, 3, 4, 5,

    6, 7,

    8,
  ];
}`;

			const result = await format(input, { singleQuote: true, printWidth: 18 });
			expect(result).toBeWithNewline(expected);
		});

		it('places each object on its own line when array contains objects where each has multiple properties', async () => {
			const input = `export function App() {
  let arr = [{ a: 1, b: 2 }, { c: 3, d: 4 }, { e: 5, f: 6 }];
}`;

			// Each object should be on its own line when all objects have >1 property
			const expected = `export function App() {
  let arr = [
    { a: 1, b: 2 },
    { c: 3, d: 4 },
    { e: 5, f: 6 },
  ];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('allows inline when array has single-property objects', async () => {
			const input = `export function App() {
  let arr = [{ a: 1 }, { b: 2 }, { c: 3 }];
}`;

			// Single-property objects can stay inline
			const expected = `export function App() {
  let arr = [{ a: 1 }, { b: 2 }, { c: 3 }];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('allows inline when array has mix of single and multi-property objects', async () => {
			const input = `export function App() {
  let arr = [{ a: 1 }, { b: 2, c: 3 }, { d: 4 }];
}`;

			// Mixed property counts - can stay inline (rule only applies when ALL objects have >1 property)
			const expected = `export function App() {
  let arr = [{ a: 1 }, { b: 2, c: 3 }, { d: 4 }];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('respects original formatting when array has mixture of inline and multi-line objects', async () => {
			const input = `export function App() {
  let arr = [{ a: 1, b: 2 }, {
    c: 3,
    d: 4
  }, { e: 5, f: 6 }];
}`;

			// Objects originally inline stay inline, originally multi-line stay multi-line
			// Each object on its own line because all have >1 property
			const expected = `export function App() {
  let arr = [
    { a: 1, b: 2 },
    {
      c: 3,
      d: 4,
    },
    { e: 5, f: 6 },
  ];
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve get and set keywords in object methods', async () => {
			const input = `const foo = {
    get bar() {
        return 0
    },

    set baz(arg: 0) {
        //
    }
}`;
			const expected = `const foo = {
  get bar() {
    return 0;
  },

  set baz(arg: 0) {
    //
  },
};`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format simple if statement with non-block body', async () => {
			const input = `function Test() {
  let x = 0;
  if (x === 0) x = 1;
  <div>{x}</div>
}`;
			const expected = `function Test() {
  let x = 0;
  if (x === 0) x = 1;
  <div>{x}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format if-else with non-block bodies', async () => {
			const input = `function Test() {
  let x = 0;
  if (x === 0) x = 1; else x = 2;
  <div>{x}</div>
}`;
			const expected = `function Test() {
  let x = 0;
  if (x === 0) x = 1;
  else x = 2;
  <div>{x}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format nested if statements with non-block bodies', async () => {
			const input = `function Test() {
  let x = 0;
  if (x === 0) if (x === 1) x = 2; else x = 3;
  <div>{x}</div>
}`;
			const expected = `function Test() {
  let x = 0;
  if (x === 0)
    if (x === 1) x = 2;
    else x = 3;
  <div>{x}</div>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not move comments before while statement into the test condition', async () => {
			const input = `function test() {
  let i = 0;
  // comment before while
  while (i < 10) {
    i++;
  }
}`;
			const expected = `function test() {
  let i = 0;
  // comment before while
  while (i < 10) {
    i++;
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not move comments before for-of statement into the right expression', async () => {
			const input = `function test() {
  // comment before for-of
  for (const item of items) {
    console.log(item);
  }
}`;
			const expected = `function test() {
  // comment before for-of
  for (const item of items) {
    console.log(item);
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not move comments before switch statement into the discriminant', async () => {
			const input = `function test() {
  let x = 1;
  // comment before switch
  switch (x) {
    case 1:
      console.log('one');
  }
}`;
			const expected = `function test() {
  let x = 1;
  // comment before switch
  switch (x) {
    case 1:
      console.log('one');
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle multiple comments before if statement', async () => {
			const input = `function test() {
  // comment 1
  // comment 2
  if (true) {
    console.log('test');
  }
}`;
			const expected = `function test() {
  // comment 1
  // comment 2
  if (true) {
    console.log('test');
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle comments before try/catch blocks', async () => {
			const input = `function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  }
}`;
			const expected = `function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle comments before try/catch/finally blocks', async () => {
			const input = `function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  } finally {
    cleanup();
  }
}`;
			const expected = `function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  } finally {
    cleanup();
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle comments inside try/catch blocks', async () => {
			const input = `function test() {
  try {
    // comment inside try
    doSomething();
  } catch (e) {
    // comment inside catch
    console.error(e);
  }
}`;
			const expected = `function test() {
  try {
    // comment inside try
    doSomething();
  } catch (e) {
    // comment inside catch
    console.error(e);
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle block comments with try/catch', async () => {
			const input = `function test() {
  /* block comment before try */
  try {
    doSomething();
  } catch (e) {
    /* block comment in catch */
    console.error(e);
  }
}`;
			const expected = `function test() {
  /* block comment before try */
  try {
    doSomething();
  } catch (e) {
    /* block comment in catch */
    console.error(e);
  }
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should format explicit tsx arrow returns like tsrx blocks', async () => {
			const input = `function Test(props) {
	const func = (item) => <><ItemView item={item} onSelect={props.onSelect} /></>;

	<List
	items={props.items}
	renderItem={(item) => <><ItemView item={item} onSelect={props.onSelect} /></>}
	/>
}`;
			const expected = `function Test(props) {
  const func = (item) => (
    <>
      <ItemView item={item} onSelect={props.onSelect} />
    </>
  );

  <List
    items={props.items}
    renderItem={(item) => (
      <>
        <ItemView item={item} onSelect={props.onSelect} />
      </>
    )}
  />
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format template arrow returns in TSX attributes like TSRX attributes', async () => {
			const input = `function Test(props) {
	const view = <>
	<List
		items={props.items}
		renderItem={(item) => <><ItemView item={item} onSelect={props.onSelect} /></>}
	/>
	</>;
}`;
			const expected = `function Test(props) {
  const view = (
    <>
      <List
        items={props.items}
        renderItem={(item) => (
          <>
            <ItemView item={item} onSelect={props.onSelect} />
          </>
        )}
      />
    </>
  );
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format JSX attributes with tracked values', async () => {
			const input = `function App() {
	const count = track(0);

	<Counter count={count.value} />
	<Counter {count} />
}`;

			const expected = `function App() {
  const count = track(0);

  <Counter count={count.value} />
  <Counter {count} />
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve JSX spread attributes inside explicit tsx blocks', async () => {
			const input = `const props = {};
const foo = <><Bar {...props} /></>;`;

			const expected = `const props = {};
const foo = (
  <>
    <Bar {...props} />
  </>
);`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('respects the semi false option', async () => {
			const input = `export function Test() {
  const a = 1
  const b = 2
  <div>{a + b}</div>
}`;
			const expected = `export function Test() {
  const a = 1
  const b = 2
  <div>{a + b}</div>
}`;
			const result = await format(input, { singleQuote: true, semi: false });
			expect(result).toBeWithNewline(expected);
		});

		it('respects the semi true option', async () => {
			const input = `export function Test() {
  const a = 1
  const b = 2
  <div>{a + b}</div>
}`;
			const expected = `export function Test() {
  const a = 1;
  const b = 2;
  <div>{a + b}</div>
}`;
			const result = await format(input, { singleQuote: true, semi: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle bracketSameLine correctly', async () => {
			const input = `function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`;

			const expected = `function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button">
    {'this is a button'}
  </button>
}`;

			const result = await format(input, {
				singleQuote: true,
				printWidth: 40,
				bracketSameLine: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should respect singleAttributePerLine set to true setting', async () => {
			const input = `function One() {
  <button
    class="some-class" something="should" not="go" wrong="at all"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`;

			const expected = `function One() {
  <button
    class="some-class"
    something="should"
    not="go"
    wrong="at all"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`;

			const result = await format(input, {
				singleQuote: true,
				printWidth: 100,
				singleAttributePerLine: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should respect singleAttributePerLine set to false setting', async () => {
			const input = `function One() {
  <button
    class="some-class"
    something="should"
    not="go"
    wrong="at all"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`;

			const expected = `function One() {
  <button class="some-class" something="should" not="go" wrong="at all" id="this-is-a-button">
    {'this is a button'}
  </button>
}`;

			const result = await format(input, {
				singleQuote: true,
				printWidth: 100,
				singleAttributePerLine: false,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should format object in attribute with spaces at each side', async () => {
			const input = `function App() {
  <button
  class="test another"
  onClick={{handleEvent: handler}}>{'Click Me'}</button>
}`;
			const expected = `function App() {
  <button class="test another" onClick={{ handleEvent: handler }}>
    {'Click Me'}
  </button>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should prefer breaking attributes over inline breakable object values', async () => {
			const input = `function App() {
  <div class={styles.item} data-active={state.active ? "true" : "false"} style={{ gridTemplateColumns: Icon ? "16px minmax(0, 1fr) auto" : "minmax(0, 1fr) auto" }}>
    {'content'}
  </div>
}`;
			const expected = `function App() {
  <div class={styles.item} data-active={state.active ? 'true' : 'false'} style={{ gridTemplateColumns: Icon ? '16px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}>
    {'content'}
  </div>
}`;

			const result = await format(input, { singleQuote: true, printWidth: 200 });
			expect(result).toBeWithNewline(expected);
		});

		it('should prefer breaking attributes over inline breakable object values (bracketSameLine)', async () => {
			const input = `function App() {
  <div class={styles.item} data-active={state.active ? "true" : "false"} style={{ gridTemplateColumns: Icon ? "16px minmax(0, 1fr) auto" : "minmax(0, 1fr) auto" }}>
    {'content'}
  </div>
}`;
			const expected = `function App() {
  <div class={styles.item} data-active={state.active ? 'true' : 'false'} style={{ gridTemplateColumns: Icon ? '16px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}>
    {'content'}
  </div>
}`;

			const result = await format(input, {
				singleQuote: true,
				printWidth: 200,
				bracketSameLine: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve fragment shorthand in class methods', async () => {
			const input = `class Foo {
	bar() {
	return <>{"Hello"}</>;
	}
}`;

			const expected = `class Foo {
  bar() {
    return <>{'Hello'}</>;
  }
}`;

			const result = await format(input, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle default arguments correctly', async () => {
			const input = `function Expand({ name, startingLength = 10 }: { name: string; startingLength?: number }) {
  <div></div>
}`;

			const expected = `function Expand({
  name,
  startingLength = 10,
}: {
  name: string;
  startingLength?: number;
}) {
  <div></div>
}`;

			const result = await format(input, { singleQuote: true, printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should break long direct text children after inline attributes', async () => {
			const input = `function App() {
  return <span
      class={styles.notificationMessage}
  >The report is ready. Review the summary before sharing it with the team.</span>
}`;

			const expected = `function App() {
  return (
    <span class={styles.notificationMessage}>
      The report is ready. Review the summary before sharing it with the team.
    </span>
  );
}`;

			const result = await format(input, { printWidth: 80 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve generic type arguments on self-closing JSX function tags', async () => {
			const input = `function Box<T>({ value }: { value: T }) {
	<div>{String(value)}</div>
}
export function App() {
	<Box<string> value="hi" />
}`;

			const expected = `function Box<T>({ value }: { value: T }) {
  <div>{String(value)}</div>
}
export function App() {
  <Box<string> value="hi" />
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('should format chained if-else statements with non-block bodies on separate lines', async () => {
			const input = `function Test() {
  <button
    onClick={() => {
if (status === 'a') status = 'b'; else if (status === 'b') status = 'c'; else status =
  'a';
}}
  >
    {'Click'}
  </button>
}`;
			const expected = `function Test() {
  <button
    onClick={() => {
      if (status === 'a') status = 'b';
      else if (status === 'b') status = 'c';
      else status = 'a';
    }}
  >
    {'Click'}
  </button>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should break up attributes on new lines if line length exceeds printWidth', async () => {
			const expected = `function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 40 });
			expect(result).toBeWithNewline(expected);
		});

		it('properly formats for of loops where the parent has no attributes', async () => {
			const expected = `<tbody>
  for (const [key, value] of Object.entries(attributes).filter(([_key, value]) => value !== ''))
  {
    <tr class="not-last:border-b border-border/50">
      <td class="py-2 font-mono w-48">
        <Kbd>{key}</Kbd>
      </td>
      <td class="py-2">{value}</td>
    </tr>
  }
</tbody>`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep ReactiveSet parents with short syntax and no args intact', async () => {
			const expected = `function SetTest() @{
  let items = new ReactiveSet();

  <>
    <button onClick={() => items.add(1)}>{'add'}</button>
    <pre>{items.size}</pre>
  </>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep ReactiveMap parents with short syntax and no args intact', async () => {
			const expected = `function MapTest() @{
  let items = new ReactiveMap();

  <>
    <button onClick={() => items.set('key', 1)}>{'add'}</button>
    <pre>{items.size}</pre>
  </>
}`;
			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve a blank line between components and js declarations if one is provided', async () => {
			const expected = `export function App() {
  return (
    <>
      <Card>@{
        function children() {
          <p class="highlighted">{'Card content here'}</p>
        }
      }</Card>

      <div>{test}</div>
    </>
  );
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve blank line between function with nested markup and js', async () => {
			const expected = `function App() @{
  <>
    <div>
      const a = 1;
      <div>const b = 1;</div>
      <div>const b = 1;</div>
    </div>
    <div>
      const a = 2;
      <div>const b = 1;</div>
    </div>
  </>
}

render(App);`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve block comments formatting inside curly braces and inside markup', async () => {
			const expected = `<div class="container">{/* Dynamic SVG - the original problem case */}</div>`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format <script> bodies as JS in a block layout', async () => {
			const expected = `<script>
  const i = 2;
</script>`;

			const result = await format(`<script>const i = 2;</script>`, {
				singleQuote: true,
				printWidth: 100,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should format a TypeScript <script> body with prettier options applied', async () => {
			const expected = `<script type="text/typescript">
  const n: number = 1 < 2 ? 3 : 4;
  if (n < 2) {
    go('now');
  }
</script>`;

			const source = `<script type="text/typescript">const n:number=1<2?3:4;
if(n<2){go("now")}</script>`;

			const result = await format(source, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should be idempotent when reformatting a formatted <script> body', async () => {
			const once = await format(`<script>const i = 2;</script>`, {
				singleQuote: true,
				printWidth: 100,
			});
			const twice = await format(once, { singleQuote: true, printWidth: 100 });
			expect(twice).toBe(once);
		});

		it('should keep an unparseable <script> body verbatim', async () => {
			const expected = `<script>const broken = ;</script>`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toContain('const broken = ;');
		});

		it('keeps an unparseable <script> body on its own lines without adding blank lines', async () => {
			const result = await format(`export function App() @{
  <script>const broken = ;</script>
}`);
			expect(result).toBeWithNewline(`export function App() @{
  <script>
    const broken = ;
  </script>
}`);
			expect(await format(result)).toBe(result);
		});

		it('re-indents an unparseable <script> body and keeps its relative indentation', async () => {
			// Like Prettier's HTML printer: the indentation the lines share is
			// replaced with the element's, and a second pass reads back the same lines.
			const result = await format(`export function App() @{
  <div>
    <script>

            const a = 1;
            const broken = ;
              if (a) {
                go();
              }

    </script>
  </div>
}`);
			expect(result).toBeWithNewline(`export function App() @{
  <div>
    <script>

      const a = 1;
      const broken = ;
        if (a) {
          go();
        }
    </script>
  </div>
}`);
			expect(await format(result)).toBe(result);
		});

		it('keeps an unparseable <script> body with CRLF line endings clean', async () => {
			const source =
				'export function App() @{\r\n  <script>\r\n    const a = 1;\r\n    const broken = ;\r\n      go();\r\n  </script>\r\n}\r\n';
			const lf =
				'export function App() @{\n  <script>\n    const a = 1;\n    const broken = ;\n      go();\n  </script>\n}';
			for (const endOfLine of /** @type {const} */ (['auto', 'lf', 'crlf'])) {
				const result = await format(source, { endOfLine });
				expect(result).toBe(endOfLine === 'lf' ? lf + '\n' : lf.replace(/\n/g, '\r\n') + '\r\n');
				expect(await format(result, { endOfLine })).toBe(result);
			}
		});

		it('indents an unparseable <script> body with tabs under useTabs', async () => {
			const result = await format(
				`export function App() @{\n  <script>\n    const broken = ;\n      go();\n  </script>\n}`,
				{ useTabs: true },
			);
			expect(result).toBeWithNewline(
				`export function App() @{\n\t<script>\n\t\tconst broken = ;\n\t\t  go();\n\t</script>\n}`,
			);
			expect(await format(result, { useTabs: true })).toBe(result);
		});

		it('should preserve the blank line between a function and text literal sibling inside element', async () => {
			const expected = `function Something({ children }) {
  const test = 'yo';
  <Another>
    {\`Content inside \${test} Another component\`}
    function children()
    {<span>{'Child Component'}</span>}
  </Another>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments in destructured typed function parameters', async () => {
			const expected = `function Child({
  tr: [count, tr],
  // test,
}: {
  tr: [number, Tracked<number>];
  // test: (node: HTMLDivElement) => void;
}) {
  <button
    onClick={() => {
      count++;
      tr[0]++;
    }}
  >
    {count}
  </button>
}`;

			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve an existing blank line before a comment inside element children', async () => {
			const expected = `function App() {
  <div>
    let x = 1;
    // comment
    <div>{'Test'}</div>
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments inside js/ts blocks inside markup', async () => {
			const expected = `function App() {
  <button
    onClick={() => {
      hasError = false;
      try {
        hasError = false;
        // @ts-ignore
        obj['nonexistent']();
      } catch {
        // hasError = true;
      }
    }}
  >
    {'Nonexistent'}
  </button>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should not insert a new line between js and jsx if not provided', async () => {
			const expected = `export function App() {
  let text = 'something';
  <div>{String(text)}</div>
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should keep a new line between js and jsx if provided', async () => {
			const expected = `export function App() {
  let text = 'something';
  <div>{String(text)}</div>
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve inline comments inside jsx expressions', async () => {
			const expected = `<>
  <div>{/* 'This is visible text' */}</div>
  <div>{/* <div>{'Card Component'}</div> */}</div>
</>`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('preserves regex literals in method calls', async () => {
			const expected = `export function App() {
  let text = 'Hello <span>world</span>';
  let result = text.match(/<span>/);
  <div>{String(result)}</div>
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});

			expect(result).toBeWithNewline(expected);
		});

		it('should preserve blank line after multi-line comment block followed by element in function body', async () => {
			const expected = `function App() @{
  <>
    <div>
      <div>
        let x = 1;
        // inner comment
        <div />
      </div>
      <div>{"Sibling"}</div>
    </div>

    // if (show) {
    // 	<div>{"Top Scope - Show is true"}</div>
    // }

    <button onClick={() => (b = !b)}>{"Toggle b"}</button>
  </>
}`;

			const result = await format(expected, { printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve trailing comments after last child element before closing tag', async () => {
			const expected = `function App() {
  <div>
    <span>{'first'}</span>
    <span>{'second'}</span>
    // trailing comment 1
    // trailing comment 2
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should correctly handle comments in TSRX syntax', async () => {
			const input = `// input
<>
  <section>
    // TODO
    {'Hello'}
  </section>

  // input
  <section>
    // TODO
  </section>

  // input
  <section>
        // TODO
    <span>{'Hello'}</span>
  </section>
</>`;

			const expected = `// input
<>
  <section>
    // TODO
    {'Hello'}
  </section>

  // input
  <section>
    // TODO
  </section>

  // input
  <section>
    // TODO
    <span>{'Hello'}</span>
  </section>
</>`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not move commented composite elements to the outside of parent element', async () => {
			const expected = `function Child({ children, NonExistent, ...props }) {
  <div {...props}>
    // {children}
    // <NonExistent />
  </div>
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve an existing blank line before a comment inside an element code block', async () => {
			const input = `function App() {
  <div>@{
    let x = 1;

    // comment
    <div>{'Test'}</div>
  }</div>
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(input);
		});

		it('should handle async/await in function body', async () => {
			const input = `export async function Test(){const data=await fetchData();data}`;
			const expected = `export async function Test() {
  const data = await fetchData();
  data;
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should keep semi with tables in a for of loop', async () => {
			const expected = `<table>
  <tbody>
    @for (const row of items) {
      const id = row.id;

      <tr>
        <td class="col-md-6" />
      </tr>
    }
  </tbody>
</table>`;

			const result = await format(expected, { singleQuote: true, semi: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve function properties in named, legacy anonymous, and arrow forms', async () => {
			const expected = `const UI = {
  span: function Span() {
    return <span>{'Hello from Span'}</span>;
  },
  button: function ({ children }) {
    return <button>{children}</button>;
  },
  arrowButton: ({ children }) => {
    return <button>{children}</button>;
  },
};`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve the order of try / pending / catch blocks', async () => {
			const expected = `function Test() {
  let items: ReactiveArray<string> | null = null;
  let error: string | null = null;

  async function* throwingIterable() {
    throw new Error('Async error');
  }

  return (
    @try {
      items = ReactiveArray.fromAsync(throwingIterable());
      @for (const item of items) {
        <li>{item}</li>
      }
    } @pending {
      <div>{'Loading...'}</div>
    } @catch (e) {
      error = (e as Error).message;
    }
  );
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve the exact order with a commented out function a text literal sibling', async () => {
			const expected = `function Something({ children }) {
  const test = 'yo';
  return (
    <Another>
      {\`Content inside \${test} Another component\`}
      // function children() {
      // 	<span>{'Child Component'}</span>
      // }
    </Another>
  );
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve the blank line between a commented out function and text literal sibling', async () => {
			const expected = `function Something({ children }) {
  const test = 'yo';
  return (
    <Another>
      {\`Content inside \${test} Another component\`}

      // function children() {
      // 	<span>{'Child Component'}</span>
      // }
    </Another>
  );
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments before closing tag in elements', async () => {
			const expected = `function App() {
  return (
    <div id="second-top-block">@{
      @if (true) {
        <div>{'b is true'}</div>
      }
      // <div>
      // 	<div />
      // </div>
      // <div id="sibling-block">{'Sibling'}</div>
    }</div>
  );
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve direct double-quoted text children', async () => {
			const input = `export function App(){return <div>Hello & 'TSRX'</div>}`;

			const expected = `export function App() {
  return <div>Hello & 'TSRX'</div>;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should not move comments before if statement into the test condition', async () => {
			const input = `function App() {
  return <div id="second-top-block">@{
    // <div>
    @if (true) {
      <div>{'b is true'}</div>
    }
    // <div>
    // <div>
    // @if (b) {
    // <span>nested</span>
    // }
    // </div>
    // </div>
    // <div />
    // </div>
    // <div id="sibling-block">{'Sibling'}</div>
  }</div>;
}`;
			const expected = `function App() {
  return (
    <div id="second-top-block">@{
      // <div>
      @if (true) {
        <div>{'b is true'}</div>
      }
      // <div>
      // <div>
      // @if (b) {
      // <span>nested</span>
      // }
      // </div>
      // </div>
      // <div />
      // </div>
      // <div id="sibling-block">{'Sibling'}</div>
    }</div>
  );
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should handle comments before try block in a function', async () => {
			const input = `function App() {
  return <div id="second-top-block">@{
    // <div>
    @try {
      <div>b is true</div>
    } @catch (e) {
    }
    // 	<div>
    // 		<div>
    // 			@if (b) {
    // 				return;
    // 			}
    // 		</div>
    // 	</div>
    // 	<div />
    // </div>
    // <div id="sibling-block">{'Sibling'}</div>
  }</div>
}`;
			const expected = `function App() {
  return (
    <div id="second-top-block">@{
      // <div>
      @try {
        <div>b is true</div>
      } @catch (e) {
      }
      // 	<div>
      // 		<div>
      // 			@if (b) {
      // 				return;
      // 			}
      // 		</div>
      // 	</div>
      // 	<div />
      // </div>
      // <div id="sibling-block">{'Sibling'}</div>
    }</div>
  );
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments above attributes on dom elements', async () => {
			const expected = `function App() {
  return (
    <div
      // @tsrx-ignore
      something="test"
    >
      test
    </div>
  );
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments above attributes on components', async () => {
			const expected = `function App() {
  return (
    <Child
      // @tsrx-ignore
      something="test"
    >
      test
    </Child>
  );
}
function Child({ something }) {
  return <div>{something}</div>;
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format catch block with reset param and type annotation', async () => {
			const expected = `function Test() {
  return (
    @try {
      const data = fetchData();
      <div>{data}</div>
    } @pending {
      <div>Loading...</div>
    } @catch (error: Error, reset: () => void) {
      <>
        <div>{error.message}</div>
        <button onClick={reset}>Retry</button>
      </>
    }
  );
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('prints satisfies expressions in switch default cases', async () => {
			const input = `export function Test(props: { status: "ok" | "error" }) {
  return @switch (props.status) {
    @case "ok": {
      <div>ok</div>
    }
    @case "error": {
      <div>error</div>
    }
    @default: {
      props.status satisfies never
    }
  }
}`;
			const expected = `export function Test(props: { status: 'ok' | 'error' }) {
  return (
    @switch (props.status) {
      @case 'ok': {
        <div>ok</div>
      }
      @case 'error': {
        <div>error</div>
      }
      @default: {
        props.status satisfies never;
      }
    }
  );
}`;
			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should wrap direct double-quoted text children idempotently', async () => {
			const input = `function App() {
  return <p class="lede">
    Set up TSRX with React, Preact, Solid, Vue, or Ripple and then wire in the editor tooling that makes
    <code class="inline-code">.tsrx</code>
    files feel native in the rest of your repo.
  </p>
}`;

			const expected = `function App() {
  return (
    <p class="lede">
      Set up TSRX with React, Preact, Solid, Vue, or Ripple and then wire in the editor tooling that
      makes
      <code class="inline-code">.tsrx</code>
      files feel native in the rest of your repo.
    </p>
  );
}
`;

			const result = await format(input, { printWidth: 100 });
			const secondResult = await format(result, { printWidth: 100 });
			expect(result).toBeWithNewline(expected);
			expect(secondResult).toBeWithNewline(expected);
		});

		it('should wrap long direct text children when elements break', async () => {
			const input = `function App() {
  return <span class={styles.notificationMessage}>The report is ready. Review the summary before sharing it with the team.</span>
}`;

			const expectedPrintWidth70 = `function App() {
  return (
    <span class={styles.notificationMessage}>
      The report is ready. Review the summary before sharing it with
      the team.
    </span>
  );
}`;
			const expectedPrintWidth40 = `function App() {
  return (
    <span
      class={styles.notificationMessage}
    >
      The report is ready. Review the
      summary before sharing it with the
      team.
    </span>
  );
}`;

			const resultPrintWidth70 = await format(input, { printWidth: 70 });
			expect(resultPrintWidth70).toBeWithNewline(expectedPrintWidth70);

			const resultPrintWidth40 = await format(input, { printWidth: 40 });
			expect(resultPrintWidth40).toBeWithNewline(expectedPrintWidth40);
		});

		it('properly formats components markup and new lines and leaves one new line between components and <style> if one or more exists', async () => {
			const expected = `export function App() {
  return (
    <div>
      <RowList rows={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]}>@{
        function Row({ id, index, isHighlighted = (index) => index % 2 === 0 }) {
          return (
            <>
              <div class={{ highlighted: isHighlighted(index) }}>
                {index}
                {' - '}
                {id}
              </div>

              <style>
                .highlighted {
                  background-color: lightgray;
                  color: black;
                }
              </style>
            </>
          );
        }
      }</RowList>
    </div>
  );
}

function RowList({ rows, Row }) {
  return (
    @for (const { id } of rows; index i) {
      <Row index={i} {id} />
    }
  );
}`;

			const result = await format(expected, {
				singleQuote: true,
				arrowParens: 'always',
				printWidth: 100,
			});
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('parens around as-cast operands', () => {
		it('keeps parens around a nullish coalescing operand of an as-cast', async () => {
			const input = `function App() {
  return <span>{(activeAuthor ?? "All authors") as string}</span>;
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('keeps parens around logical and equality operands of as-casts', async () => {
			const input = `function App() {
  const a = (x || y) as string;
  const b = (x == y) as boolean;
  const c = (x ?? y) satisfies string;
  return <div>{a}</div>;
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('adds parens around binary operands of as-casts like Prettier', async () => {
			const input = `function App() {
  const a = x + y as string;
  const b = x < y as unknown;
  return <div>{a}</div>;
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(`function App() {
  const a = (x + y) as string;
  const b = (x < y) as unknown;
  return <div>{a}</div>;
}`);
		});
	});

	// Prettier's `printAwaitExpression` and `printBinaryCastExpression`: an
	// await or a cast that is called or accessed breaks onto its own line
	// inside its parentheses.
	describe('parenthesized callees and member objects break inside their parentheses', () => {
		it('moves a broken await onto its own line inside its parentheses', async () => {
			const input = `async function load() {
  const value = (await loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)).value;
  const exportsOfModule = (await dynamicImport(pathToTheModule, { with: { type: "json" } })).exports;
  const handler = (await getHandlerForTheCurrentRequest(requestIdentifier, anotherArgument))(event);
  const optional = (await loadTheConfigurationFileFromDiskAndMore(somePathVariable, anotherArgum))?.value;
}`;
			const expected = `async function load() {
  const value = (
    await loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)
  ).value;
  const exportsOfModule = (
    await dynamicImport(pathToTheModule, { with: { type: "json" } })
  ).exports;
  const handler = (
    await getHandlerForTheCurrentRequest(requestIdentifier, anotherArgument)
  )(event);
  const optional = (
    await loadTheConfigurationFileFromDiskAndMore(
      somePathVariable,
      anotherArgum,
    )
  )?.value;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps await (await together and leaves new, non-null, and yield as they were', async () => {
			const input = `async function load() {
  const value = await (await loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)).json();
  const instance = new (await loadTheConfigurationFileFromDiskAndMore(somePathVariable, anotherArgument))();
  const asserted = (await loadTheConfigurationFileFromDiskAndMore(somePathVariable, anotherArgum))!.value;
}
function* generate() {
  const value = (yield loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)).value;
}`;
			const expected = `async function load() {
  const value = await (
    await loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)
  ).json();
  const instance = new (await loadTheConfigurationFileFromDiskAndMore(
    somePathVariable,
    anotherArgument,
  ))();
  const asserted = (await loadTheConfigurationFileFromDiskAndMore(
    somePathVariable,
    anotherArgum,
  ))!.value;
}
function* generate() {
  const value = (yield loadTheConfigurationFileFromDisk(
    somePathVariable,
    anotherArgument,
  )).value;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('moves a broken as or satisfies cast onto its own line inside its parentheses', async () => {
			const input = `const value = (someObject.someLongPropertyName as SomeVeryLongInterfaceName<WithTypeArgs>).value;
const result = (handlerForTheRequest satisfies RequestHandlerFunctionType<Context>)(event, ctx);
const inst = new (someFactoryFunctionResult as unknown as ConstructorTypeForTheThing<Aaaa>)();
const short = (value as Entry).name;`;
			const expected = `const value = (
  someObject.someLongPropertyName as SomeVeryLongInterfaceName<WithTypeArgs>
).value;
const result = (
  handlerForTheRequest satisfies RequestHandlerFunctionType<Context>
)(event, ctx);
const inst = new (
  someFactoryFunctionResult as unknown as ConstructorTypeForTheThing<Aaaa>
)();
const short = (value as Entry).name;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('definite assignment assertions', () => {
		it('keeps the definite assignment assertion on variable declarations', async () => {
			const input = `function App() {
  let cleanup!: () => void;
  var count!: number;
  return <div />;
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});
	});

	describe('numeric literals', () => {
		it('prints bigint literals instead of crashing on JSON.stringify', async () => {
			const input = `const total = 1n;
const mask = 0xffn;`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('prints bigint literals inside templates', async () => {
			const input = `function App() @{
  const label = "big:";
  <div>
    {label}
    {1n}
  </div>
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('keeps the authored radix, separators, and exponent of numeric literals', async () => {
			const input = `const a = 0xFF;
const b = 1_000_000;
const c = .5;
const d = 1e21;
const e = 1E3;
const f = 1.50;`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const a = 0xff;
const b = 1_000_000;
const c = 0.5;
const d = 1e21;
const e = 1e3;
const f = 1.5;`);
		});
	});

	// Arrays follow Prettier's `printArray`: the source layout doesn't matter,
	// only whether the array fits and what its elements are.
	describe('arrays lay out like Prettier', () => {
		it('collapses a multiline array that fits', async () => {
			const input = `const letters = [
  'x',
  'y',
];
foo([
  'a',
  'b',
]);
const list = [
  first,

  ...rest,
];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const letters = ["x", "y"];
foo(["a", "b"]);
const list = [first, ...rest];`);
		});

		it('keeps a blank line between elements when the array breaks', async () => {
			const input = `const names = [
  'aaaaaaaaaaaaaaaaaaaa',

  'bbbbbbbbbbbbbbbbbbbb',
  'cccccccccccccccccccc',
  'dddddddddddddddddddd',
];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const names = [
  "aaaaaaaaaaaaaaaaaaaa",

  "bbbbbbbbbbbbbbbbbbbb",
  "cccccccccccccccccccc",
  "dddddddddddddddddddd",
];`);
		});

		it('packs number arrays several elements per line', async () => {
			const input = `const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const signed = [
  -1,
  +2,

  3.5,
];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const numbers = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27,
];
const signed = [
  -1, +2,

  3.5,
];`);
		});

		it('breaks a matrix of arrays or of objects with several properties', async () => {
			const input = `const matrix = [[1, 2], [3, 4]];
const rows = [{ id: 1, name: "one" }, { id: 2, name: "two" }];
const mixed = [[1, 2], { id: 1, name: "one" }];
const single = [[1], [2]];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const matrix = [
  [1, 2],
  [3, 4],
];
const rows = [
  { id: 1, name: "one" },
  { id: 2, name: "two" },
];
const mixed = [[1, 2], { id: 1, name: "one" }];
const single = [[1], [2]];`);
		});

		it('prints objects in arrays like any other object', async () => {
			const input = `const broken = [{
  a: 1,
}];
const inline = [{ a: 1, b: 2 }];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const broken = [
  {
    a: 1,
  },
];
const inline = [{ a: 1, b: 2 }];`);
		});

		it('breaks out a dependency or number array instead of expanding it', async () => {
			const input = `const value = useMemo(() => compute(), [firstDependency, secondDependency, thirdDependency]);
const sum = add(first, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const value = useMemo(
  () => compute(),
  [firstDependency, secondDependency, thirdDependency],
);
const sum = add(
  first,
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
);`);
		});

		it('keeps a comment before an element with that element', async () => {
			const input = `const cast = [first, /** @type {Entry} */ (second)];
const note = [
  first,
  /* note */ second,
];
const own = [
  "a",
  /* lead b */
  "b",
];
const line = [
  first,
  // lead second
  second,
];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const cast = [first, /** @type {Entry} */ (second)];
const note = [first, /* note */ second];
const own = [
  "a",
  /* lead b */
  "b",
];
const line = [
  first,
  // lead second
  second,
];`);
		});

		it('keeps JSDoc casts in a number array', async () => {
			const input = `const first = [/** @type {Port} */ (80), 443];
const own = [
  80,
  /** @type {Port} */ (443),
];
const commented = [
  80,
  // secure
  /** @type {Port} */ (443),
];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const first = [/** @type {Port} */ (80), 443];
const own = [80, /** @type {Port} */ (443)];
const commented = [
  80,
  // secure
  /** @type {Port} */ (443),
];`);
		});

		it('breaks an array around a call whose callback body breaks', async () => {
			const input = `const handlers = [on("click", () => {
  run();
})];`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const handlers = [
  on("click", () => {
    run();
  }),
];`);
		});

		it('breaks array patterns one element per line when they do not fit', async () => {
			const input = `const [aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccc] = useThing();
function f([aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccc, ddddd]) {}
[aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc] = [1, 2, 3];`;
			const expected = `const [
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccc,
] = useThing();
function f([
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccc,
  ddddd,
]) {}
[
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
] = [1, 2, 3];`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('prints no trailing comma after a rest element and the type annotation after the brackets', async () => {
			const input = `const [aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb, ...ccccccccccccccccccccccccccccccc] = useThing();
function g([aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb]: [Aaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbb]) {}`;
			const expected = `const [
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ...ccccccccccccccccccccccccccccccc
] = useThing();
function g([aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb]: [
  Aaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbb,
]) {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks tuple types one member per line, keeping the comma after a rest type', async () => {
			const input = `let t: [Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ...Ccccccccccccccccccccccc[]];
function h(row: [aaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbb: number, ccccccccccccc: boolean]) {}`;
			const expected = `let t: [
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ...Ccccccccccccccccccccccc[],
];
function h(
  row: [
    aaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
    ccccccccccccc: boolean,
  ],
) {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps short patterns and tuples on one line', async () => {
			const source = `const [a, , b] = x;
const [c, ,] = y;
let u: [a?: string, ...rest: number[]] = [];
const {
  aaaaaaaaaaaaaaaaaa: [
    bbbbbbbbbbbbbbbbbbbbbbbbbbbb,
    ccccccccccccccccccccccccccccccccc,
  ],
} = x;`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('objects lay out like Prettier', () => {
		it('keeps an object expanded only when a line break follows its {', async () => {
			const input = `const o = { a: 1,
  b: 2 };
const p = { list: [
  'a',
  'b',
] };
const q = {
  a: 1, b: 2 };
foo({ a: 1,
  b: 2 });`;
			const expected = `const o = { a: 1, b: 2 };
const p = { list: ["a", "b"] };
const q = {
  a: 1,
  b: 2,
};
foo({ a: 1, b: 2 });`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('collapses every object that fits with objectWrap collapse', async () => {
			const input = `const o = {
  a: 1, b: 2 };
type U = {
  a: string; b: number };
let m: {
  [K in keyof T]: T[K] } = x;`;
			const expected = `const o = { a: 1, b: 2 };
type U = { a: string; b: number };
let m: { [K in keyof T]: T[K] } = x;`;
			expect(await format(input, { objectWrap: 'collapse' })).toBeWithNewline(expected);
		});

		it('keeps a blank line after a property, past its comments', async () => {
			const source = `const r = {
  a: 1,

  b: 2, // trailing

  // leading
  c: 3,
};`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('breaks a pattern that destructures a nested pattern, except in parameters', async () => {
			const input = `const { a, b: { c } } = x;
function f({ a, b: { c } }) {}
const fn = ({ a, b: [c] }) => a;`;
			const expected = `const {
  a,
  b: { c },
} = x;
function f({ a, b: { c } }) {}
const fn = ({ a, b: [c] }) => a;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a complex destructuring pattern before the value on its right', async () => {
			const input = `const { aaaa, bbbb: cccc, dddd = 1 } = getOptions(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbb, ccc);
({ aaaa, bbbb: cccc, dddd } = getOptions(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccc));
const { aaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbb } = await someFunctionCall(aaaaaaaaaaa, bbbbbbbbbbb);`;
			const expected = `const {
  aaaa,
  bbbb: cccc,
  dddd = 1,
} = getOptions(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbb, ccc);
({
  aaaa,
  bbbb: cccc,
  dddd,
} = getOptions(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccc));
const { aaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbb } = await someFunctionCall(
  aaaaaaaaaaa,
  bbbbbbbbbbb,
);`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a nested pattern among the parameters of a TypeScript signature', async () => {
			// Prettier's printObject only skips the break for patterns whose parent
			// is a function with a body, so signatures and function types expand
			const input = `type F = (a: string, { b: { c } }: T) => void;
declare function f(a, { b: { c } }): void;
interface I {
  m(a: string, { b: { c } }: T): void;
}
function g(a: string, { b: { c } }: T): void {}`;
			const expected = `type F = (
  a: string,
  {
    b: { c },
  }: T,
) => void;
declare function f(
  a,
  {
    b: { c },
  },
): void;
interface I {
  m(
    a: string,
    {
      b: { c },
    }: T,
  ): void;
}
function g(a: string, { b: { c } }: T): void {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('hugs a destructured parameter with a default or an object type', async () => {
			const input = `function foo({ aaaaaaaaaaaa, bbbbbbbbbbbbbbbb, ccccccccccccccccccc, dddddddddddddddd } = {}) {}
function bar({ aaaaaaaaaaaa, bbbbbbbbbbbbbbbb, ccccccccccccccccccc }: { aaaaaaaaaaaa: string }) {}`;
			const expected = `function foo({
  aaaaaaaaaaaa,
  bbbbbbbbbbbbbbbb,
  ccccccccccccccccccc,
  dddddddddddddddd,
} = {}) {}
function bar({
  aaaaaaaaaaaa,
  bbbbbbbbbbbbbbbb,
  ccccccccccccccccccc,
}: {
  aaaaaaaaaaaa: string;
}) {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('follows bracketSpacing in object patterns, type literals, and mapped types', async () => {
			const input = `type M = { [K in keyof T]: T[K] };
const { a, b } = obj;
function f({ a }: { a: string }) {}
let t: { a: string; b: number } = x;`;
			const expected = `type M = {[K in keyof T]: T[K]};
const {a, b} = obj;
function f({a}: {a: string}) {}
let t: {a: string; b: number} = x;`;
			expect(await format(input, { bracketSpacing: false })).toBeWithNewline(expected);
		});

		it('breaks mapped types like Prettier and keeps their modifiers and comments', async () => {
			const input = `let g: { readonly [K in keyof Tttttttttttttttttttttttttt as \`get\${Capitalize<K & string>}\`]-?: () => T[K] };
let m: {
  [K in keyof T]: T[K];
} = x;
type P = { +readonly [K in keyof T]+?: T[K] };
let c: {
  // note
  [K in keyof T]: T[K];
} = x;
let d: { /* note */ [K in keyof T]: T[K] } = x;`;
			const expected = `let g: {
  readonly [
    K in keyof Tttttttttttttttttttttttttt as \`get\${Capitalize<K & string>}\`
  ]-?: () => T[K];
};
let m: {
  [K in keyof T]: T[K];
} = x;
type P = { +readonly [K in keyof T]+?: T[K] };
let c: {
  // note
  [K in keyof T]: T[K];
} = x;
let d: { /* note */ [K in keyof T]: T[K] } = x;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a union only for a member that must break, not for how the source wrapped it', async () => {
			const input = `let x: { a: string;
  b: number } | { c: string } = v;`;
			expect(await format(input)).toBeWithNewline(
				'let x: { a: string; b: number } | { c: string } = v;',
			);
		});

		it('keeps a type literal expanded only when a line break follows its {', async () => {
			const input = `type T = { a: string;
  b: number };
type U = {
  a: string; b: number };
function g(options: {
  a: string; b: number }) {}
let m: {
  [K in keyof T]: T[K] } = x;`;
			const expected = `type T = { a: string; b: number };
type U = {
  a: string;
  b: number;
};
function g(options: { a: string; b: number }) {}
let m: {
  [K in keyof T]: T[K];
} = x;`;
			expect(await format(input)).toBeWithNewline(expected);
		});
	});

	describe('comments in empty arrays and objects', () => {
		it('keeps a line comment inside an empty array or object', async () => {
			const source = `const a = [
  // pending
];
const o = {
  // pending
};
foo([
  // pending
]);
const x = {
  a: [], // trailing
  b: {
    // inner
  },
};`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a block comment inline between the brackets', async () => {
			const source = `const a = [/* pending */];
const o = {/* pending */};
const { /* c */ } = x;
function f([/* c */]) {}`;
			const expected = `const a = [/* pending */];
const o = {/* pending */};
const {/* c */} = x;
function f([/* c */]) {}`;
			expect(await format(source)).toBeWithNewline(expected);
		});

		it('puts several comments on their own lines', async () => {
			const input = `const a = [/* a */ /* b */];
const b = [ // one

  // two
];`;
			const expected = `const a = [
  /* a */
  /* b */
];
const b = [
  // one
  // two
];`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the call arguments around an object with a line comment', async () => {
			const input = `foo({
  // pending
}, 1);`;
			const expected = `foo(
  {
    // pending
  },
  1,
);`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps comments in empty arrays and objects in templates', async () => {
			const input = `export function App() @{
  const none = {/* x */};
  <div list={[
    // nothing
  ]} />
}`;
			// Like Prettier, an array with a comment doesn't hug the braces.
			const expected = `export function App() @{
  const none = {/* x */};
  <div
    list={
      [
        // nothing
      ]
    }
  />
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});
	});

	// The comma after a trailing hole creates an array slot (or an iterator
	// step in a pattern); it is not an optional trailing comma.
	describe('trailing array holes survive formatting', () => {
		it.each(['all', 'none'])(
			'keeps trailing holes with trailingComma %s',
			async (trailingComma) => {
				const input = `const one = [1,,];
const two = [,,];
const inner = [1,,2];
const [,] = values();
const [first, ,] = values();
function f([a, ,], [,]) {}`;

				const result = await format(input, { trailingComma: /** @type {any} */ (trailingComma) });
				expect(result).toBeWithNewline(`const one = [1, ,];
const two = [, ,];
const inner = [1, , 2];
const [,] = values();
const [first, ,] = values();
function f([a, ,], [,]) {}`);
			},
		);

		it.each(['all', 'none'])(
			'keeps a trailing hole in a multiline array with trailingComma %s',
			async (trailingComma) => {
				const input = `const values = [
  1, // one
  2,
  ,
];`;

				const result = await format(input, { trailingComma: /** @type {any} */ (trailingComma) });
				expect(result).toBeWithNewline(input);
			},
		);

		it('keeps a trailing hole when the array breaks to fit', async () => {
			const input = `const values = [aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccc,,];`;

			const result = await format(input, { trailingComma: 'none' });
			expect(result).toBeWithNewline(`const values = [
  aaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccc,
  ,
];`);
		});
	});

	// String literals print from their source text: only the quotes change, so
	// escapes the author wrote stay escapes.
	describe('string literal escapes survive formatting', () => {
		it('keeps an escaped lone surrogate as an escape', async () => {
			const input = `const keys = { '\\ud800': 1, '\\ufffd': 2 };`;

			const result = await format(input);
			expect(result).toBeWithNewline(`const keys = { "\\ud800": 1, "\\ufffd": 2 };`);
		});

		it('keeps escapes in every string position', async () => {
			const input = `import data from '\\u0061.json' with { type: '\\u006a' };

export { '\\u0062' as b } from './b';
type Lone = '\\udc00';
enum Keys {
  '\\ud800' = 1,
}
const text = '\\x1b[31m' + '\\u00e9' + '\\0';`;

			const result = await format(input);
			expect(result).toBeWithNewline(`import data from "\\u0061.json" with { type: "\\u006a" };

export { "\\u0062" as b } from "./b";
type Lone = "\\udc00";
enum Keys {
  "\\ud800" = 1,
}
const text = "\\x1b[31m" + "\\u00e9" + "\\0";`);
		});

		// Like Prettier's `printString`: the configured quote, unless the string
		// holds more of it than of the other one, and only the chosen quote is
		// escaped.
		it('switches to the other quote when the string holds more of the configured one', async () => {
			const input = String.raw`const a = "\"";
const b = "say \"hi\"";
const c = 'it\'s';
const d = "it's \"x\"";
const e = 'say "hi"';
const f = "it's";`;

			expect(await format(input)).toBeWithNewline(String.raw`const a = '"';
const b = 'say "hi"';
const c = "it's";
const d = 'it\'s "x"';
const e = 'say "hi"';
const f = "it's";`);
			expect(await format(input, { singleQuote: true })).toBeWithNewline(String.raw`const a = '"';
const b = 'say "hi"';
const c = "it's";
const d = 'it\'s "x"';
const e = 'say "hi"';
const f = "it's";`);
		});

		it('keeps the configured quote on a tie', async () => {
			const input = String.raw`const a = 'a"b\'c';
const b = "a\"b'c";`;

			expect(await format(input)).toBeWithNewline(String.raw`const a = "a\"b'c";
const b = "a\"b'c";`);
			expect(await format(input, { singleQuote: true }))
				.toBeWithNewline(String.raw`const a = 'a"b\'c';
const b = 'a"b\'c';`);
		});

		it('keeps a string as written when its quote does not change', async () => {
			const input = String.raw`const a = "it\'s";
const b = 'a\"b';
const c = '\d\n\\"';
const d = "\\\"";`;

			expect(await format(input)).toBeWithNewline(String.raw`const a = "it\'s";
const b = 'a\"b';
const c = '\d\n\\"';
const d = '\\"';`);
		});

		it('picks the quote of keys, module names, and literal types the same way', async () => {
			const input = String.raw`import x from 'it\'s.js';
const o = { 'it\'s': 1, "say \"hi\"": 2 };
type T = 'it\'s' | "say \"hi\"";
enum E {
  'it\'s' = 1,
}`;

			expect(await format(input)).toBeWithNewline(String.raw`import x from "it's.js";
const o = { "it's": 1, 'say "hi"': 2 };
type T = "it's" | 'say "hi"';
enum E {
  "it's" = 1,
}`);
		});

		// Like Prettier's `replaceEndOfLine(printString(…))`: the line break in a
		// string continued with a backslash breaks the groups around it
		it('breaks the code around a string that continues onto the next line', async () => {
			const input = `const message = "first line \\
second line";
foo("first line \\
second line", other);
x = ["a\\
b", c];
function f() { return "a \\
b" + c; }`;

			expect(await format(input)).toBeWithNewline(`const message =
  "first line \\
second line";
foo(
  "first line \\
second line",
  other,
);
x = [
  "a\\
b",
  c,
];
function f() {
  return (
    "a \\
b" + c
  );
}`);
		});

		it('breaks an object around a key that continues onto the next line', async () => {
			const input = `const o = { "a \\
b": 1, c: 2 };
type T = "a \\
b";`;

			expect(await format(input)).toBeWithNewline(`const o = {
  "a \\
b": 1,
  c: 2,
};
type T = "a \\
b";`);
		});
	});

	// A JSX attribute string has no escapes and decodes HTML entities, so it is
	// printed from its source text, and a string expression container only
	// loses its braces when the value moves over unchanged.
	describe('JSX attribute strings survive formatting', () => {
		/**
		 * @param {string} attribute
		 */
		const wrap = (attribute) => `export function App() {
  return <input ${attribute} />;
}`;

		it.each([
			[`title={'Say "hello"'}`, `title='Say "hello"'`],
			[`title="Say &quot;hello&quot;"`, `title='Say "hello"'`],
			[`title='x "y" &apos;z&apos;'`, `title="x &quot;y&quot; 'z'"`],
			[`title="&amp;amp;"`, `title="&amp;amp;"`],
			[`title="a &#34;b&#34;"`, `title="a &#34;b&#34;"`],
			[`title={'&amp;'}`, `title={"&amp;"}`],
			[`title={"It's \\"both\\""}`, `title={'It\\'s "both"'}`],
			[`title={'\\ud800'}`, `title={"\\ud800"}`],
			[`title={'a\\nb'}`, `title={"a\\nb"}`],
			[`title={'It\\'s'}`, `title="It's"`],
			[`title={'hello'}`, `title="hello"`],
		])('prints %s as %s', async (input, expected) => {
			const result = await format(wrap(input));
			expect(result).toBeWithNewline(wrap(expected));
		});

		it('switches quotes instead of breaking the attribute with jsxSingleQuote', async () => {
			const result = await format(wrap(`title={"It's ready"} alt="Say &apos;hi&apos;"`), {
				jsxSingleQuote: true,
			});
			expect(result).toBeWithNewline(wrap(`title="It's ready" alt="Say 'hi'"`));
		});
	});

	// Prettier's printJsxExpressionContainer: an attribute value that can break
	// after its first token hugs the braces, and any other value that doesn't
	// fit breaks onto its own lines inside them.
	describe('JSX attribute values break like Prettier', () => {
		it('breaks a value that does not fit onto its own lines inside the braces', async () => {
			const input = `export function App(props) @{
  <div
    class={props.items.length > 0 && props.filter.length > 0 && visible.length > 0 ? 'some-long-class-name' : 'other-class'}
    title={aaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb + cccccccccccccccccccccc}
    hidden={props.someVeryLongConditionName || props.anotherVeryLongConditionName || props.x}
    data={someObject.someProperty.anotherProperty.yetAnotherProperty.finalPropertyName}
    icon={<Icon name="something" size="large" color="red" onClick={handleClickEvent} />}
  />
}`;
			const expected = `export function App(props) @{
  <div
    class={
      props.items.length > 0 && props.filter.length > 0 && visible.length > 0
        ? "some-long-class-name"
        : "other-class"
    }
    title={
      aaaaaaaaaaaaaaaaaaaaaaaaaa +
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb +
      cccccccccccccccccccccc
    }
    hidden={
      props.someVeryLongConditionName ||
      props.anotherVeryLongConditionName ||
      props.x
    }
    data={
      someObject.someProperty.anotherProperty.yetAnotherProperty
        .finalPropertyName
    }
    icon={
      <Icon
        name="something"
        size="large"
        color="red"
        onClick={handleClickEvent}
      />
    }
  />
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps a value that can break after its first token against the braces', async () => {
			const input = `export function App(props) @{
  <div
    onClick={() => {
      doSomething(props.first, props.second);
    }}
    style={{ color: "red", backgroundColor: "blue", borderColor: "green", margin: 0 }}
    items={[aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccc]}
    value={computeSomething(aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cc)}
    label={\`template \${aaaaaaaaaaaaaaaaaaaaaaaaa} with \${bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb} parts\`}
  />
}`;
			const expected = `export function App(props) @{
  <div
    onClick={() => {
      doSomething(props.first, props.second);
    }}
    style={{
      color: "red",
      backgroundColor: "blue",
      borderColor: "green",
      margin: 0,
    }}
    items={[
      aaaaaaaaaaaaaaaaaaaaaaaa,
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
      ccccccccccccccccc,
    ]}
    value={computeSomething(
      aaaaaaaaaaaaaaaaaaaaaaaaa,
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
      cc,
    )}
    label={\`template \${aaaaaaaaaaaaaaaaaaaaaaaaa} with \${bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb} parts\`}
  />
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks new, import(), and await of a fragment inside the braces like Prettier', async () => {
			// Prettier's shouldInline hugs calls, not `new` or `import()`, and only
			// `await` of an element
			const input = `f(<div aaaa={new SomeConstructorName(aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbb)} />);
f(<div aaaa={import("some-very-long-module-specifier-name/that/does/not/fit/on/one/line")} />);
f(<div aaaa={await (<>
<b>1</b>
</>)} />);`;
			expect(await format(input)).toBeWithNewline(`f(
  <div
    aaaa={
      new SomeConstructorName(
        aaaaaaaaaaaaaaaaaaaaaaaaa,
        bbbbbbbbbbbbbbbbbbbbbbbbbbbb,
      )
    }
  />,
);
f(
  <div
    aaaa={
      import("some-very-long-module-specifier-name/that/does/not/fit/on/one/line")
    }
  />,
);
f(
  <div
    aaaa={
      await (
        <>
          <b>1</b>
        </>
      )
    }
  />,
);`);
		});

		it('keeps a comment inside the braces', async () => {
			const input = `export function App(props) @{
  <div
    value={props.value // why
    }
    list={[1, 2] // how
    }
    note={/* what */ props.someVeryLongValueNameThatDoesNotFitOnTheLineWithTheAttribute}
  />
}`;
			const expected = `export function App(props) @{
  <div
    value={
      props.value // why
    }
    list={
      [1, 2] // how
    }
    note={
      /* what */ props.someVeryLongValueNameThatDoesNotFitOnTheLineWithTheAttribute
    }
  />
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps an element written as an attribute value without braces', async () => {
			const result = await format(`const a = <Foo prop=<Bar><Baz /></Bar> />;
const c = <LeftRight left=<a /> right=<b>monkeys</b> />;`);
			expect(result).toBeWithNewline(`const a = (
  <Foo
    prop=<Bar>
      <Baz />
    </Bar>
  />
);
const c = <LeftRight left=<a /> right=<b>monkeys</b> />;`);
		});

		it('breaks TSRX attribute values the same way', async () => {
			const input = `export function App(props) @{
  const theme = <style>.card { color: red; }</style>;
  <>
    <style apply={[theme, props.someOtherThemeWithAVeryLongName, props.yetAnotherThemeName]} />
    <div class={theme.$class} ref={props.someVeryLongReferenceName ?? props.fallbackReferenceNameHere} />
    <div {...props.spread} class={props.isActiveAndHighlighted ? theme.$class : props.inactiveClassName} />
  </>
}`;
			const expected = `export function App(props) @{
  const theme = <style>
    .card {
      color: red;
    }
  </style>;
  <>
    <style
      apply={[
        theme,
        props.someOtherThemeWithAVeryLongName,
        props.yetAnotherThemeName,
      ]}
    />
    <div
      class={theme.$class}
      ref={props.someVeryLongReferenceName ?? props.fallbackReferenceNameHere}
    />
    <div
      {...props.spread}
      class={
        props.isActiveAndHighlighted ? theme.$class : props.inactiveClassName
      }
    />
  </>
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});
	});

	// A template lays out its children the way Prettier lays out the same JSX
	// in a TSX file (\`printJsxChildren\` and \`printJsxElementInternal\`): text
	// and the children next to it fill the lines, a child that renders glued to
	// text stays glued, and a line breaks at a space as {" "}.
	describe('template children lay out like the same JSX in TSX', () => {
		const repoOptions = { useTabs: true, singleQuote: true, printWidth: 100 };

		/**
		 * Format an element as a template body, and with Prettier's TypeScript
		 * parser as an expression statement, which gets no parentheses either.
		 * @param {string} element
		 */
		const formatBoth = async (element) => {
			const body = element.replace(/\n/g, '\n\t');
			const template = await format(`export function Page() @{\n\t${body}\n}`, repoOptions);
			const tsx = await prettier.format(`export function Page() {\n\t${body};\n}`, {
				parser: 'typescript',
				...repoOptions,
			});
			return {
				template,
				tsx: tsx.replace('Page() {', 'Page() @{').replace(/;\n}\n$/, '\n}\n'),
			};
		};

		// Website sections as written on main
		it.each([
			[
				'features: components',
				`<section class="doc-section" id="components">
	<h2 class="section-heading">Components</h2>
	<p class="section-body">
		A TSRX component is just a TypeScript function that produces JSX. Use a
		statement-container body for component-shaped templates, especially when local
		setup, comments, scoped styles, or multiple rendered children belong with the
		markup.
	</p>
	<p class="section-body">
		In practice, components are ordinary TypeScript functions or
		{' '}
		<code class="inline-code">const</code>
		{' '}
		values. A component can use
		{' '}
		<code class="inline-code">{'@{...}'}</code>
		{' '}
		as the function body, giving you one place for local state, derived values, template
		control flow, rendered elements, and scoped styles.
	</p>
	<pre class="code-block">
		<code innerHTML={COMPONENT_HTML} />
	</pre>
	<p class="section-body">
		Export them like any other function:
		{' '}
		<code class="inline-code">{'export function Name() @{ <div /> }'}</code>
		. The compiler turns that into the right component shape for the target you're
		using.
	</p>
	<p class="section-body">
		When a bit of logic should stay plain JavaScript rather than render into the
		template, put it in a normal function beside the markup. Use
		{' '}
		<code class="inline-code">{'function fn() { ... }'}</code>
		{' '}
		for ordinary control flow, then call helpers from event handlers or expressions:
		{' '}
		<code class="inline-code">{'onClick={fn}'}</code>
		.
	</p>
	<pre class="code-block">
		<code innerHTML={BAILOUT_HTML} />
	</pre>
</section>`,
			],
			[
				'features: statement containers',
				`<section class="doc-section" id="template-structure">
	<h2 class="section-heading">Statement containers</h2>
	<p class="section-body">
		When a template scope mixes TypeScript setup with rendered output, wrap the setup in
		<code class="inline-code">{'@{...}'}</code>
		. TSRX treats everything before the final renderable child as script, then the
		container must finish with exactly one output node.
	</p>
	<p class="section-body muted">
		That final output can be a JSX element, a JSX fragment, or JSX control flow like
		{' '}
		<code class="inline-code">{'@if'}</code>
		,
		{' '}
		<code class="inline-code">{'@for'}</code>
		,
		{' '}
		<code class="inline-code">{'@switch'}</code>
		, or
		{' '}
		<code class="inline-code">{'@try'}</code>
		. It cannot be a bare expression container, and no script statements can appear
		after it.
	</p>
	<p class="section-body muted">
		If the rendered part needs multiple siblings or text next to elements, wrap those
		children in a fragment so they become one output. The rule applies locally to
		component bodies, element children, and control-flow branches, so setup can stay
		close to the markup that uses it without turning ordinary template text into
		JavaScript.
	</p>
	<p class="section-body muted">
		Control-flow bodies are implicit statement containers too:
		<code class="inline-code">@if</code>
		,
		<code class="inline-code">@for</code>
		,
		<code class="inline-code">@switch</code>
		, and
		<code class="inline-code">@try</code>
		arms all use
		<code class="inline-code">{'{}'}</code>
		blocks.
	</p>
	<p class="section-body muted">
		If you write setup statements and then a bare JSX element inside a normal
		<code class="inline-code">{'{}'}</code>
		function body, the compiler will ask you to add the missing
		<code class="inline-code">@</code>
		. Plain braces are JavaScript; statement-container braces are
		<code class="inline-code">{'@{...}'}</code>
		.
	</p>
	<pre class="code-block">
		<code innerHTML={TEMPLATE_STRUCTURE_HTML} />
	</pre>
</section>`,
			],
			[
				'getting started: Zed',
				`<section class="doc-section" id="zed">
	<h2 class="section-heading">Zed</h2>
	<p class="section-body">
		Install the
		{' '}
		<a
			class="inline-link"
			href="https://zed.dev/extensions/tsrx"
			target="_blank"
			rel="noopener noreferrer"
		>TSRX extension for Zed</a>
		{' '}
		from the Zed Extension Marketplace for syntax highlighting and language-server
		support. Open Zed's Extensions view and search for
		{' '}
		<code class="inline-code">TSRX</code>
		{' '}
		to install it.
	</p>
	<p class="section-body">
		The extension uses a project-local
		{' '}
		<code class="inline-code">@tsrx/language-server</code>
		{' '}
		when available and otherwise downloads its pinned language-server version
		automatically.
	</p>
</section>`,
			],
			[
				'index: beta notice',
				`<aside class="alpha-notice" role="note" aria-label="Beta release notice">
	<span class="alpha-badge">Beta</span>
	<p class="alpha-notice-body">
		TSRX is in active beta development. Feedback on the
		{' '}
		<a
			class="alpha-notice-link"
			href="https://github.com/tsrx-org/tsrx/issues"
			target="_blank"
			rel="noopener noreferrer"
		>issue tracker</a>
		{' '}
		is very welcome.
	</p>
</aside>`,
			],
		])('formats the %s section like Prettier', async (_, element) => {
			const { template, tsx } = await formatBoth(element);
			expect(template).toBe(tsx);
		});

		it('breaks inside the braces of a {…} child that starts with a comment', async () => {
			const input = `const a = <div>
{
  /* prettier-ignore */
  foo ( )
}
</div>;
const b = <div>{// note
foo()}</div>;`;
			expect(await format(input)).toBeWithNewline(`const a = (
  <div>
    {
      /* prettier-ignore */
      foo ( )
    }
  </div>
);
const b = (
  <div>
    {
      // note
      foo()
    }
  </div>
);`);
		});

		it('prints the comments of a multi-line element inside its parentheses', async () => {
			// A line break after `return` would end the statement, so the comment
			// has to open the parentheses (#456)
			const input = `const aDiv = (
  /* $FlowFixMe */
  <div className="foo">
    Foo bar
  </div>
);
function f() {
  return (
    // note
    <JSX />
  );
}
function g() {
  throw (
    // note
    <JSX />
  );
}`;
			expect(await format(input)).toBeWithNewline(`const aDiv = (
  /* $FlowFixMe */
  <div className="foo">Foo bar</div>
);
function f() {
  return (
    // note
    <JSX />
  );
}
function g() {
  throw (
    // note
    <JSX />
  );
}`);
		});

		it('keeps the parentheses of a returned template that starts with a comment', async () => {
			// A line break after `return`, `throw`, or `yield` would end the
			// statement, so a <style> block or template control flow keeps its
			// parentheses like an element does
			const input = `function f() {
  return (
    // note
    <style>.a { color: red; }</style>
  );
}
function g(rows) {
  throw (
    // note
    @for (const row of rows) {
      <li>{row}</li>
    }
  );
}
function* h() {
  yield (
    // note
    <style>.a { color: red; }</style>
  );
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(`function f() {
  return (
    // note
    <style>
      .a {
        color: red;
      }
    </style>
  );
}
function g(rows) {
  throw (
    // note
    @for (const row of rows) {
      <li>{row}</li>
    }
  );
}
function* h() {
  yield (
    // note
    <style>
      .a {
        color: red;
      }
    </style>
  );
}`);
		});

		it('puts a multi-line template value in parentheses like an element', async () => {
			// A user decision: `@if`, `@for`, `@switch`, `@try`, and a `@{ … }` value get
			// the parentheses Prettier gives a multi-line element after `=`, `return`,
			// `throw`, an expression-bodied `=>`, a class field, an object value,
			// `export default`, and `&&`. A code block that is a function body, and a
			// value in a call, an array, or a conditional branch, stays bare.
			const input = `const x = @if (something === true) { <div>Hello</div> };
function f(p) { return @{ const a = p.a; <div>{a}</div> }; }
function g(items) { throw @for (const i of items) { <li>{i}</li> }; }
const h = (p) => @{ const a = 1; <div>{a}</div> };
const k = (p) => (@{ const a = 1; <div>{a}</div> });
const m = (p) => @if (p.a) { <b /> };
function A() @{ <div /> }
const s = @switch (v) { @case 1: { <b /> } };
const t = @try { <b /> } @catch (e) { <i /> };
class C { field = @if (a) { <div /> }; render() @{ <div /> } }
const o = { a: @if (a) { <div /> }, b: @{ <i /> } };
let z; z = @if (a) { <div /> };
export default @if (a) { <div /> };
foo(@if (a) { <div /> });
const arr = [@if (a) { <div /> }];
const cond = a ? @if (b) { <c /> } : null;
const logical = a && @if (b) { <c /> };
items.map((i) => @if (i) { <c /> });`;
			const expected = `const x = (
  @if (something === true) {
    <div>Hello</div>
  }
);
function f(p) {
  return (
    @{
      const a = p.a;
      <div>{a}</div>
    }
  );
}
function g(items) {
  throw (
    @for (const i of items) {
      <li>{i}</li>
    }
  );
}
const h = (p) => @{
  const a = 1;
  <div>{a}</div>
};
const k = (p) => (
  @{
    const a = 1;
    <div>{a}</div>
  }
);
const m = (p) => (
  @if (p.a) {
    <b />
  }
);
function A() @{
  <div />
}
const s = (
  @switch (v) {
    @case 1: {
      <b />
    }
  }
);
const t = (
  @try {
    <b />
  } @catch (e) {
    <i />
  }
);
class C {
  field = (
    @if (a) {
      <div />
    }
  );
  render() @{
    <div />
  }
}
const o = {
  a: (
    @if (a) {
      <div />
    }
  ),
  b: (
    @{
      <i />
    }
  ),
};
let z;
z = (
  @if (a) {
    <div />
  }
);
export default (
  @if (a) {
    <div />
  }
);
foo(
  @if (a) {
    <div />
  },
);
const arr = [
  @if (a) {
    <div />
  },
];
const cond = a
  ? @if (b) {
      <c />
    }
  : null;
const logical = a && (
  @if (b) {
    <c />
  }
);
items.map((i) => (
  @if (i) {
    <c />
  }
));`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
			/** @param {unknown} node */
			const strip = (node) =>
				JSON.stringify(node, (key, value) =>
					['start', 'end', 'loc', 'range', 'metadata', 'raw'].includes(key) ||
					key.endsWith('Comments')
						? undefined
						: value,
				);
			/** @param {string} text */
			const parse = (text) => /** @type {any} */ (parsers)?.tsrx.parse(text, {}).body;
			expect(strip(parse(result))).toBe(strip(parse(input)));
		});

		it('wraps a commented element after return or throw in one pair of parentheses', async () => {
			// One wrap puts the comments inside the parentheses: a \`return\` that
			// opens them isn't wrapped again, and each comment prints once
			const input = `function g() {
  return (
    // lead
    <Note /> // trail
  );
}
function h() {
  throw (
    /* lead */
    <Note />
    // trail
  );
}
function k() {
  return (
    // lead
    <div>
      <b />
    </div>
  ); // after
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(input);
			expect(result).not.toContain('((');
			for (const comment of ['// lead', '/* lead */', '// trail', '// after']) {
				expect(result.split(comment).length - 1).toBe(input.split(comment).length - 1);
			}
			/** @param {string} text */
			const parse = (text) =>
				JSON.stringify(/** @type {any} */ (parsers)?.tsrx.parse(text, {}).body, (key, value) =>
					['start', 'end', 'loc', 'range', 'metadata', 'raw'].includes(key) ? undefined : value,
				);
			expect(parse(result)).toBe(parse(input));
		});

		it('joins text to the element it touches and fills the lines', async () => {
			// A line break between `</code>` and `.` renders as nothing, so the
			// period stays against the element, and `{' '}` ends a line.
			const result = await format(
				`export function Page() @{
	<>
		<p>
			Export them like any other function:
			{' '}
			<code class="inline-code">{'export function Name() @{ <div /> }'}</code>
			. The compiler turns that into the right component shape for the target you're
			using.
		</p>
		<p>
			That final output can be a JSX element, a JSX fragment, or JSX control flow like
			{' '}
			<code class="inline-code">{'@if'}</code>
			,
			{' '}
			<code class="inline-code">{'@for'}</code>
			, or
			{' '}
			<code class="inline-code">{'@try'}</code>
			. It cannot be a bare expression container.
		</p>
	</>
}`,
				repoOptions,
			);
			expect(result).toBeWithNewline(`export function Page() @{
	<>
		<p>
			Export them like any other function:{' '}
			<code class="inline-code">{'export function Name() @{ <div /> }'}</code>. The compiler turns
			that into the right component shape for the target you're using.
		</p>
		<p>
			That final output can be a JSX element, a JSX fragment, or JSX control flow like{' '}
			<code class="inline-code">{'@if'}</code>, <code class="inline-code">{'@for'}</code>, or{' '}
			<code class="inline-code">{'@try'}</code>. It cannot be a bare expression container.
		</p>
	</>
}`);
		});
	});

	// A space at a template child boundary renders, like in JSX, while
	// whitespace with a line break is layout. A significant space stays a space
	// when its neighbors share a line and prints as {" "} where a line breaks,
	// like Prettier's jsxWhitespace.
	describe('significant spaces between template children survive formatting', () => {
		/**
		 * Render each exported component of a module compiled with @tsrx/react
		 * to markup, with whitespace runs collapsed the way the page shows them.
		 * @param {string} source
		 * @returns {Promise<string[]>}
		 */
		const render = async (source) => {
			const [{ compile }, { default: ts }] = await Promise.all([
				import('@tsrx/react'),
				import('typescript'),
			]);
			const { outputText } = ts.transpileModule(compile(source, 'App.tsrx').code, {
				compilerOptions: {
					jsx: ts.JsxEmit.ReactJSX,
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ES2022,
				},
			});
			const Fragment = Symbol('Fragment');
			/**
			 * @param {unknown} type
			 * @param {Record<string, unknown>} props
			 */
			const jsx = (type, props) => ({ type, props });
			/** @type {Record<string, (props: object) => unknown>} */
			const exports = {};
			new Function('require', 'exports', outputText)(() => ({ jsx, jsxs: jsx, Fragment }), exports);
			/**
			 * @param {any} node
			 * @returns {string}
			 */
			const toMarkup = (node) => {
				if (node == null || typeof node === 'boolean') return '';
				if (Array.isArray(node)) return node.map(toMarkup).join('');
				if (typeof node !== 'object') return String(node);
				const children = toMarkup(node.props.children);
				return node.type === Fragment ? children : `<${node.type}>${children}</${node.type}>`;
			};
			return Object.values(exports).map((component) =>
				toMarkup(component({})).replace(/[ \t\r\n]+/g, ' '),
			);
		};

		it('renders the same markup after formatting', async () => {
			const input = `export function Between() @{
  <div>
    <b>1</b> <b>2</b>
  </div>
}
export function Edges() @{
  <div> <b>1</b> </div>
}
export function Text() @{
  <p>hello <b>x</b> world</p>
}
export function Wrapped() @{
  <p>
    Some text that goes past the print width once it is indented, <b>bold</b> and more text.
  </p>
}
export function TextEdges() @{
  <span> hello </span>
}
export function Lone() @{
  <span> </span>
}
export function Fragment() @{
  <>a <b>1</b> b</>
}
export function CodeBlock() @{
  <>   @{<b>123</b>}   </>
}`;
			const result = await format(input);
			expect(await render(result)).toEqual(await render(input));
			expect(await render(input)).toEqual([
				'<div><b>1</b> <b>2</b></div>',
				'<div> <b>1</b> </div>',
				'<p>hello <b>x</b> world</p>',
				'<p>Some text that goes past the print width once it is indented, <b>bold</b> and more text.</p>',
				'<span> hello </span>',
				'<span> </span>',
				'a <b>1</b> b',
				' <b>123</b> ',
			]);
		});

		it('renders website sections the same after formatting', async () => {
			const input = `export function Structure() @{
	<section class="doc-section" id="template-structure">
		<h2 class="section-heading">Statement containers</h2>
		<p class="section-body">
			When a template scope mixes TypeScript setup with rendered output, wrap the setup in
			<code class="inline-code">{'@{...}'}</code>
			. TSRX treats everything before the final renderable child as script, then the
			container must finish with exactly one output node.
		</p>
		<p class="section-body muted">
			That final output can be a JSX element, a JSX fragment, or JSX control flow like
			{' '}
			<code class="inline-code">{'@if'}</code>
			,
			{' '}
			<code class="inline-code">{'@for'}</code>
			,
			{' '}
			<code class="inline-code">{'@switch'}</code>
			, or
			{' '}
			<code class="inline-code">{'@try'}</code>
			. It cannot be a bare expression container, and no script statements can appear
			after it.
		</p>
		<p class="section-body muted">
			If the rendered part needs multiple siblings or text next to elements, wrap those
			children in a fragment so they become one output. The rule applies locally to
			component bodies, element children, and control-flow branches, so setup can stay
			close to the markup that uses it without turning ordinary template text into
			JavaScript.
		</p>
		<p class="section-body muted">
			Control-flow bodies are implicit statement containers too:
			<code class="inline-code">@if</code>
			,
			<code class="inline-code">@for</code>
			,
			<code class="inline-code">@switch</code>
			, and
			<code class="inline-code">@try</code>
			arms all use
			<code class="inline-code">{'{}'}</code>
			blocks.
		</p>
		<p class="section-body muted">
			If you write setup statements and then a bare JSX element inside a normal
			<code class="inline-code">{'{}'}</code>
			function body, the compiler will ask you to add the missing
			<code class="inline-code">@</code>
			. Plain braces are JavaScript; statement-container braces are
			<code class="inline-code">{'@{...}'}</code>
			.
		</p>
	</section>
}
export function Zed() @{
	<section class="doc-section" id="zed">
		<h2 class="section-heading">Zed</h2>
		<p class="section-body">
			Install the
			{' '}
			<a
				class="inline-link"
				href="https://zed.dev/extensions/tsrx"
				target="_blank"
				rel="noopener noreferrer"
			>TSRX extension for Zed</a>
			{' '}
			from the Zed Extension Marketplace for syntax highlighting and language-server
			support. Open Zed's Extensions view and search for
			{' '}
			<code class="inline-code">TSRX</code>
			{' '}
			to install it.
		</p>
		<p class="section-body">
			The extension uses a project-local
			{' '}
			<code class="inline-code">@tsrx/language-server</code>
			{' '}
			when available and otherwise downloads its pinned language-server version
			automatically.
		</p>
	</section>
}
export function Notice() @{
	<aside class="alpha-notice" role="note" aria-label="Beta release notice">
		<span class="alpha-badge">Beta</span>
		<p class="alpha-notice-body">
			TSRX is in active beta development. Feedback on the
			{' '}
			<a
				class="alpha-notice-link"
				href="https://github.com/tsrx-org/tsrx/issues"
				target="_blank"
				rel="noopener noreferrer"
			>issue tracker</a>
			{' '}
			is very welcome.
		</p>
	</aside>
}`;
			const result = await format(input, { useTabs: true, singleQuote: true, printWidth: 100 });
			expect(result).not.toBe(input);
			const markup = await render(input);
			expect(markup.join('')).toContain(
				'Install the <a>TSRX extension for Zed</a> from the Zed Extension Marketplace',
			);
			expect(markup.join('')).toContain('Feedback on the <a>issue tracker</a> is very welcome.');
			expect(await render(result)).toEqual(markup);
		});

		it('renders template values in parentheses the same', async () => {
			const input = `export function Returned() {
  return @{ const label = 'a'; <div>{label}</div> };
}
export const Arrow = () => (@if (true) { <b>yes</b> } @else { <i>no</i> });
export function Assigned() {
  const view = @switch ('b') { @case 'a': { <i>a</i> } @default: { <b>other</b> } };
  return <p>{view}</p>;
}`;
			const result = await format(input);
			expect(result).toContain('return (\n    @{');
			expect(await render(result)).toEqual(await render(input));
			expect((await render(input)).toSorted()).toEqual([
				'<b>yes</b>',
				'<div>a</div>',
				'<p><b>other</b></p>',
			]);
		});

		it('keeps a space between children on their line', async () => {
			const input = `export function App() @{
  <div>
    <b>1</b> <b>2</b>
  </div>
}`;
			expect(await format(input)).toBeWithNewline(input);
		});

		it('keeps text and elements separated by spaces on one line', async () => {
			const result = await format(`const a = <div>hello <b>x</b> world</div>;
const b = <>a <b>1</b> b</>;`);
			expect(result).toBeWithNewline(`const a = (
  <div>
    hello <b>x</b> world
  </div>
);
const b = (
  <>
    a <b>1</b> b
  </>
);`);
		});

		it('prints a space against a broken tag as {" "}', async () => {
			const result = await format(`const a = <div> <b>1</b> </div>;
const b = <> <b>1</b></>;`);
			expect(result).toBeWithNewline(`const a = (
  <div>
    {" "}
    <b>1</b>{" "}
  </div>
);
const b = (
  <>
    {" "}
    <b>1</b>
  </>
);`);
		});

		it('keeps a lone space', async () => {
			// Repeated {" "} render one space, like Prettier prints them.
			const result = await format(`export function App() @{
  <>
    <> </>
    <span> </span>
    <span>{" "}</span>
    <span>
      {" "}{" "}
    </span>
    <>{" "}{" "}</>
  </>
}`);
			expect(result).toBeWithNewline(`export function App() @{
  <>
    <> </>
    <span> </span>
    <span> </span>
    <span> </span>
    <> </>
  </>
}`);
		});

		it('keeps the spaces around text that fits against its tags', async () => {
			const input = `const a = <div> hello</div>;
const b = <div>hello </div>;
const c = <> hi </>;
const d = <p> {a} </p>;`;
			expect(await format(input)).toBeWithNewline(input);
		});

		it('prints the spaces around text that moves onto its own lines as {" "}', async () => {
			const result = await format(
				`const a = <div> This is some long text that will not fit on one line because it is long </div>;`,
			);
			expect(result).toBeWithNewline(`const a = (
  <div>
    {" "}
    This is some long text that will not fit on one line because it is long{" "}
  </div>
);`);
		});

		it('breaks a line at a space as {" "} when the children do not fit', async () => {
			const result = await format(`export function App() @{
  <p>
    Some very long text here that goes past the print width for sure, <b>bold</b> and more.
  </p>
}`);
			expect(result).toBeWithNewline(`export function App() @{
  <p>
    Some very long text here that goes past the print width for sure,{" "}
    <b>bold</b> and more.
  </p>
}`);
		});

		it('joins {" "} with its neighbors when they fit on one line', async () => {
			const result = await format(`const a = <div>
  <b>1</b>{" "}
  <b>2</b>
</div>;
const b = <p>hello {" "}{a}</p>;`);
			expect(result).toBeWithNewline(`const a = (
  <div>
    <b>1</b> <b>2</b>
  </div>
);
const b = <p>hello {a}</p>;`);
		});

		it('keeps the spaces around a code block', async () => {
			const result = await format(`let a = <>   @{<b>123</b>}   </>;`);
			expect(result).toBeWithNewline(`let a = (
  <>
    {" "}
    @{
      <b>123</b>
    }{" "}
  </>
);`);
		});

		it('fills text across a blank line or an unindented line', async () => {
			// A line break in text renders as one space, however many there are.
			const result = await format(`export function App() @{
  <p>
    hi
    there

    are you fine today? This line is long enough that Prettier breaks the element too.
  </p>
}
export function Unindented() @{
  <div>
hello
world, a longer line of text that will not fit on one line with the div around it
</div>
}`);
			expect(result).toBeWithNewline(`export function App() @{
  <p>
    hi there are you fine today? This line is long enough that Prettier breaks
    the element too.
  </p>
}
export function Unindented() @{
  <div>
    hello world, a longer line of text that will not fit on one line with the
    div around it
  </div>
}`);
		});

		it('keeps non-breaking spaces as text', async () => {
			// U+00A0 is text in JSX, not whitespace, so it is neither collapsed
			// into a plain space nor dropped.
			const input = `const a = <div>a  b</div>;
const b = (
  <div>
    <b>x</b> <b>y</b>
  </div>
);
const c = <> hi </>;
const d = <div> hi </div>;
const e = (
  <p>
    hello <b>x</b>
  </p>
);`;
			expect(await format(input)).toBeWithNewline(input);
		});

		it('prints {" "} with the singleQuote quote', async () => {
			const result = await format(`const a = <div> <b>1</b> </div>;`, { singleQuote: true });
			expect(result).toBeWithNewline(`const a = (
  <div>
    {' '}
    <b>1</b>{' '}
  </div>
);`);
		});
	});

	// A directive is the exact text of its string, so printing it from the
	// cooked value could turn `"use\x20strict"` into a real strict-mode directive.
	describe('directives keep their meaning', () => {
		it('keeps an escaped directive as written', async () => {
			const input = `function run(value = 1) {
  "use\\x20strict";
  return value;
}`;

			expect(await format(input)).toBeWithNewline(input);
			expect(await format(input, { singleQuote: true })).toBeWithNewline(`function run(value = 1) {
  'use\\x20strict';
  return value;
}`);
		});

		it('swaps the quotes of a directive only when it contains neither kind', async () => {
			const input = `function f() {
  'it\\'s';
  'use strict';
}`;

			expect(await format(input)).toBeWithNewline(`function f() {
  'it\\'s';
  "use strict";
}`);
		});

		it('keeps an empty directive unparenthesized so the prologue continues', async () => {
			await expect(
				format(`function f() {
  "";
  "use strict";
  return 1;
}`),
			).resolves.toBeWithNewline(`function f() {
  "";
  "use strict";
  return 1;
}`);
		});
	});

	describe('idempotence', () => {
		/**
		 * @param {string} code
		 * @param {import('prettier').Options} [options]
		 */
		const expectStable = async (code, options = {}) => {
			const once = await format(code, options);
			const twice = await format(once, options);
			expect(twice).toBe(once);
			return once;
		};

		it('moves mixed text and expression children below the tags when the element does not fit', async () => {
			const input = `function App() { return <div title="aaaaaaaa" alt="bbbbbbbbbb">xxxxx yyyyy zzzzzzzzzzzzzzzzzzzzz {"x"}</div>; }
function Long() { return <div title="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" alt="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">text {x} more</div>; }`;
			const expected = `function App() {
  return (
    <div title="aaaaaaaa" alt="bbbbbbbbbb">
      xxxxx yyyyy zzzzzzzzzzzzzzzzzzzzz {"x"}
    </div>
  );
}
function Long() {
  return (
    <div
      title="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      alt="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    >
      text {x} more
    </div>
  );
}`;
			expect(await expectStable(input)).toBeWithNewline(expected);
		});

		it('keeps mixed text and expression children on the line when the element fits', async () => {
			const source = `function App() {
  return <div title="a">Hello {name}!</div>;
}`;
			expect(await expectStable(source)).toBeWithNewline(source);
		});

		it('keeps a return argument with leading line comments after the return keyword', async () => {
			const input = `function isXOrYInValid(xOrY: string | number | undefined) {
	return (
		// number that is not NaN or Infinity
		(typeof xOrY === 'number' && Number.isFinite(xOrY)) ||
		// for percentage
		typeof xOrY === 'string'
	);
}`;

			const once = await expectStable(input, {
				useTabs: true,
				singleQuote: true,
				printWidth: 100,
			});
			// The argument must stay attached to the return; printing the comment
			// between `return` and the expression triggers ASI and returns undefined.
			expect(once).not.toMatch(/return[;\s]*\/\//);
		});

		it('does not double-wrap self-parenthesizing return and throw arguments', async () => {
			const input = `function f() {
  return (
    // pick the fallback
    cond ? a : b
  );
}

function g() {
  throw (
    // wrap the cause
    makeError(cause)
  );
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('breaks long logical arrow bodies after multiline type-literal params', async () => {
			const input = `function f() {
	const mapping = result.mappings.find(
		(mapping: {
			sourceOffsets: number[];
			generatedOffsets: number[];
		}) =>
			mapping.sourceOffsets[0] === source_offset &&
			mapping.generatedOffsets[0] === generated_offset &&
			mapping.lengths[0] === identifier.length,
	);
}`;
			// Like Prettier, the type of a hugged only parameter joins the
			// parameter list and collapses when it fits.
			const expected = `function f() {
	const mapping = result.mappings.find(
		(mapping: { sourceOffsets: number[]; generatedOffsets: number[] }) =>
			mapping.sourceOffsets[0] === source_offset &&
			mapping.generatedOffsets[0] === generated_offset &&
			mapping.lengths[0] === identifier.length,
	);
}`;

			// The multiline param type used to hide its hardlines from enclosing
			// groups (fits() short-circuits on hardlines inside conditionalGroup
			// states), so the body printed flat past printWidth.
			const result = await format(input, {
				useTabs: true,
				singleQuote: true,
				printWidth: 100,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('stabilizes long arrow bodies with logical expressions in one pass', async () => {
			const input = `function useStack() {
	return horizontal
		? {
				defined: (d: AreaStackDatum<XScale, YScale>) =>
					isValidNumber(yScale(getStackValue(d.data))) && isValidNumber(xScale(getSecondItem(d))),
			}
		: null;
}`;

			await expectStable(input, {
				useTabs: true,
				singleQuote: true,
				printWidth: 100,
			});
		});

		it('stabilizes deeply nested JSX attribute arrows returning JSX in one pass', async () => {
			const input = `function Parent() {
	return <div>
		<section>
			<article>
				<fieldset>
					<group.Subscribe
						children={(state) => (
							<span data-testid="state-lastName">{state.values.lastName}</span>
						)}
					/>
				</fieldset>
			</article>
		</section>
	</div>;
}`;

			await expectStable(input, {
				useTabs: true,
				singleQuote: true,
				printWidth: 100,
			});
		});
	});

	describe('parameter lists of methods, signatures, and function types', () => {
		const params =
			'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number';

		it('breaks the parameters of every kind of class method', async () => {
			const input = `class C {
  constructor(${params}) {}
  method(${params}): void {}
  set value(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string) {}
  static method2(${params}): void {}
  *gen(${params}) {}
  #priv(${params}) {}
}`;
			const expected = `class C {
  constructor(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) {}
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void {}
  set value(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  ) {}
  static method2(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void {}
  *gen(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) {}
  #priv(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) {}
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parameters before type parameters or return type arguments', async () => {
			const input = `class G {
  method<T>(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: T, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) {}
  async load(${params}): Promise<void> {}
}`;
			const expected = `class G {
  method<T>(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: T,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) {}
  async load(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): Promise<void> {}
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a lone method parameter and keeps an object return type hugged', async () => {
			const input = `class Q {
  async load(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): Promise<void> {}
  m<T>(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): { aaaaaaaaaaa: string; b: number } {}
  x(...rest: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa[]) {}
}`;
			const expected = `class Q {
  async load(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  ): Promise<void> {}
  m<T>(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): {
    aaaaaaaaaaa: string;
    b: number;
  } {}
  x(
    ...rest: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa[]
  ) {}
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('always breaks a constructor with parameter properties and more than one parameter', async () => {
			const input = `class D {
  constructor(private readonly a: string, public b: number) {}
}
class E {
  constructor(@Inject() private readonly a: string) {
    init();
  }
}`;
			const expected = `class D {
  constructor(
    private readonly a: string,
    public b: number,
  ) {}
}
class E {
  constructor(@Inject() private readonly a: string) {
    init();
  }
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parameters of abstract methods, overloads, and declared classes', async () => {
			const input = `abstract class A {
  abstract method(${params}): void;
  overload(${params}): void;
  overload(a: string): void;
  overload(a: any) {}
}
declare class X {
  method(${params}): void;
}`;
			const expected = `abstract class A {
  abstract method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  overload(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  overload(a: string): void;
  overload(a: any) {}
}
declare class X {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parameters of object methods before their return type', async () => {
			const input = `const o = {
  method(${params}): void {},
  m(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): Promise<Aaaaaaaaaaaaaaaaaaaaaaaaa> {},
  async *gen<T>(a: T): AsyncGenerator<T> {},
};`;
			const expected = `const o = {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void {},
  m(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  ): Promise<Aaaaaaaaaaaaaaaaaaaaaaaaa> {},
  async *gen<T>(a: T): AsyncGenerator<T> {},
};`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parameters of interface signatures', async () => {
			const input = `interface I {
  method(${params}): void;
  method2?(${params}): void;
  set x(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string);
  (${params}): void;
  new (${params}): I;
  <T>(aaaaaaaaaaaaaaaaaaaaaaaa: T, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  n(options: { aaaaaaaaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbb: number; cccccccccccccc: boolean }): void;
}`;
			const expected = `interface I {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  method2?(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  set x(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  );
  (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  new (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): I;
  <T>(
    aaaaaaaaaaaaaaaaaaaaaaaa: T,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  n(options: {
    aaaaaaaaaaaaaaaaaaa: string;
    bbbbbbbbbbbbbbbbbbbbbbbbb: number;
    cccccccccccccc: boolean;
  }): void;
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parameters of type literal methods and function-typed properties', async () => {
			const input = `type T = {
  method(${params}): void;
  prop: (${params}) => void;
};`;
			const expected = `type T = {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  prop: (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) => void;
};`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parameters of function and constructor types', async () => {
			const input = `let fn: (${params}) => void;
let ctor: new (${params}) => I;
let actor: abstract new (${params}) => I;
function f(cb: (${params}) => void) {}`;
			const expected = `let fn: (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
) => void;
let ctor: new (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
) => I;
let actor: abstract new (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
) => I;
function f(
  cb: (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) => void,
) {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('leaves out the parameter trailing comma unless trailingComma is all', async () => {
			const input = `interface I {
  method(${params}): void;
}
let fn: (${params}) => void;`;
			const expected = `interface I {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number
  ): void;
}
let fn: (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number
) => void;`;
			expect(await format(input, { trailingComma: 'es5' })).toBeWithNewline(expected);
		});

		it('keeps short signatures and hugged parameters on one line', async () => {
			const source = `class C {
  method(a: string): void {
    run(a);
  }
  m2({ a, b }: Props) {}
}
interface I {
  method(a: string): void;
  (b: number): void;
  new (c: string): I;
}
type Fn = () => void;
let x: (a: string) => void = (a) => {};
let y: abstract new () => Foo;`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('type parameter declarations', () => {
		it.each([
			'type Select<T> = <K extends keyof T>(value: T[K]) => T[K];',
			'type Mapper = <T, U = T>(value: T) => U;',
			'type Factory = <T = unknown>() => <U extends T>(value: U) => U;',
			`interface Api {
  select: <T>(value: T) => T;
}`,
		])('preserves generic function type declarations: %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			'type Constructor = new <T>(value: T) => Box<T>;',
			'type Constructor = abstract new <T, U = T>(value: U) => Box<T>;',
		])('preserves generic constructor type declarations: %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		/**
		 * Formats twice and asserts the output is stable (idempotent).
		 * @param {string} code
		 * @param {import('prettier').Options} [options]
		 */
		const formatStable = async (code, options = {}) => {
			const once = await format(code, options);
			const twice = await format(once, options);
			expect(twice).toBe(once);
			return once;
		};

		it('breaks long interface type parameter lists one per line with a trailing comma', async () => {
			const input = `export interface WithFieldGroupProps<TFieldGroupData, TFieldComponents extends Record<string, HookComponentType<any>>, TFormComponents extends Record<string, HookComponentType<any>>, TSubmitMeta, TRenderProps extends object = Record<string, never>> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
	props?: TRenderProps;
}`;
			const expected = `export interface WithFieldGroupProps<
	TFieldGroupData,
	TFieldComponents extends Record<string, HookComponentType<any>>,
	TFormComponents extends Record<string, HookComponentType<any>>,
	TSubmitMeta,
	TRenderProps extends object = Record<string, never>,
> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
	props?: TRenderProps;
}`;

			const result = await formatStable(input, {
				printWidth: 100,
				useTabs: true,
				singleQuote: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('prefers breaking the function parameter list over the type parameter list', async () => {
			const input = `export default function useStateWithCallback<State>(initialState: State): [State, SetStateWithCallback<State>] {
	return null;
}`;
			const expected = `export default function useStateWithCallback<State>(
	initialState: State,
): [State, SetStateWithCallback<State>] {
	return null;
}`;

			const result = await formatStable(input, {
				printWidth: 100,
				useTabs: true,
				singleQuote: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('breaks function type parameter lists that overflow on their own', async () => {
			const input = `function useAppForm<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TSubmitMeta>(props: FormOptions<TFormData, TOnMount, TOnChange, TSubmitMeta>): void {
	return;
}`;
			const expected = `function useAppForm<
	TFormData,
	TOnMount extends undefined | FormValidateOrFn<TFormData>,
	TOnChange extends undefined | FormValidateOrFn<TFormData>,
	TSubmitMeta,
>(props: FormOptions<TFormData, TOnMount, TOnChange, TSubmitMeta>): void {
	return;
}`;

			const result = await formatStable(input, {
				printWidth: 100,
				useTabs: true,
				singleQuote: true,
			});
			expect(result).toBeWithNewline(expected);
		});

		it('stays idempotent when a single type parameter has to break', async () => {
			const input = `interface Container<TExtremelyLongParameterName extends Record<string, unknown>> {
	value: TExtremelyLongParameterName;
}`;
			const expected = `interface Container<
  TExtremelyLongParameterName extends Record<string, unknown>,
> {
  value: TExtremelyLongParameterName;
}`;

			const result = await formatStable(input);
			expect(result).toBeWithNewline(expected);
		});

		it('preserves the trailing comma of single-param arrow function generics', async () => {
			const expected = `const identity = <T,>(value: T): T => value;`;

			const result = await formatStable(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps single-param arrow function generics without a trailing comma as-is', async () => {
			const expected = `const identity = <T>(value: T): T => value;`;

			const result = await formatStable(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('drops meaningless trailing commas from non-arrow type parameter lists', async () => {
			const input = `function pick<State,>(value: State): State {
	return value;
}`;
			const expected = `function pick<State>(value: State): State {
  return value;
}`;

			const result = await formatStable(input);
			expect(result).toBeWithNewline(expected);
		});

		it('omits the trailing comma in broken type parameter lists when trailingComma is none', async () => {
			const input = `interface Container<TExtremelyLongParameterName extends Record<string, unknown>> {
	value: TExtremelyLongParameterName;
}`;
			const expected = `interface Container<
  TExtremelyLongParameterName extends Record<string, unknown>
> {
  value: TExtremelyLongParameterName;
}`;

			const result = await formatStable(input, { trailingComma: 'none' });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps the trailing comma in broken type parameter lists when trailingComma is es5', async () => {
			const input = `interface Container<TExtremelyLongParameterName extends Record<string, unknown>> {
	value: TExtremelyLongParameterName;
}`;
			const expected = `interface Container<
  TExtremelyLongParameterName extends Record<string, unknown>,
> {
  value: TExtremelyLongParameterName;
}`;

			const result = await formatStable(input, { trailingComma: 'es5' });
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('type argument lists', () => {
		it('keeps a lone simple type argument against its brackets', async () => {
			const input = `const w = (a) => a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbb>;
function f(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbbbbbb> {}
foo(bar as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbb>);
function g() {
  return value satisfies Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string>;
}
const q = useMemo<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa>(() => compute(aaaaaaa, bbbbbbbbbb), []);`;
			const expected = `const w = (a) =>
  a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbb>;
function f(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbbbbbb> {}
foo(
  bar as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbb>,
);
function g() {
  return value satisfies Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string>;
}
const q = useMemo<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa>(
  () => compute(aaaaaaa, bbbbbbbbbb),
  [],
);`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps a lone object type or a hugged union against its brackets', async () => {
			const input = `let o: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<{ aaaaaaaaaa: string; bbbbbbbbbbbbbb: number }> = v;
function h(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbb | null> {}`;
			const expected = `let o: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<{
  aaaaaaaaaa: string;
  bbbbbbbbbbbbbb: number;
}> = v;
function h(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbb | null> {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks lists of several types, nested type arguments, and other unions', async () => {
			const input = `let y: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccc> = v;
let z: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbb<Cccc>> = v;
let u: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<"aaaaaa" | "bbbbbbb"> = v;`;
			const expected = `let y: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccc
> = v;
let z: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  Bbbbbbbbbbb<Cccc>
> = v;
let u: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  "aaaaaa" | "bbbbbbb"
> = v;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the brackets around a lone array type, which is not simple', async () => {
			const input = `let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string[]> = value;
const w = (a) => a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string[]>;`;
			const expected = `let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  string[]
> = value;
const w = (a) =>
  a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
    string[]
  >;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a lone type argument in the type of an arrow function variable', async () => {
			const input = `const fn: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbb> = () => {};`;
			const expected = `const fn: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  Bbbbbbbbbbbbbbbbbbbb
> = () => {};`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a lone type argument with a line comment', async () => {
			const source = `let k: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  // comment
  string
> = value;
let m: Map<string /* key */, number> = new Map<string, number>();`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// The parser adds some keys out of source order: a call's type arguments
	// after its arguments, a switch case's test after its body, and a generic
	// arrow function's type parameters after its body. The comments in them
	// stay where they are (#389).
	describe('comments in type arguments, type parameters, and case tests stay there', () => {
		it.each([
			'const z = f<\n  // only\n  A\n>(1);',
			'const x = dual<\n  /** a */\n  A,\n  /** b */\n  B\n>(2, f);',
			'f</* c */ T>(1);',
			'f<T /* c */>(1);',
			'new Foo</* c */ T>(1);',
			'tag</* c */ T>`x`;',
			'const f = </* c */ T,>(a: T): T => a;',
			'const f = <T,>(/* c */ a: T): T => a;',
			'const f = <T,>(a: T /* c */, b): T => a;',
			'switch (x) {\n  case /* c */ 1:\n    y;\n}',
			'class A {\n  m</* c */ T>(a: T): T {\n    return a;\n  }\n}',
		])('keeps the comment in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// The parser adds a template `@try`'s `@catch` before its `@pending`,
		// whose comments the `@catch` took and never printed
		it.each([
			'function A() @{\n  @try {\n    <B />\n  } @pending {\n    // loading\n    <p>{"loading"}</p>\n  } @catch (e) {\n    <p>{"error"}</p>\n  }\n}',
			'function A() @{\n  @try {\n    <B />\n  } @pending {\n    <p>{"loading"}</p>\n    // after loading\n  } @catch (e) {\n    <p>{"error"}</p>\n  }\n}',
			'function A() @{\n  @try {\n    <B />\n  } @pending {\n    <p>{"loading"}</p>\n  } /* after pending */ @catch (e) {\n    <p>{"error"}</p>\n  }\n}',
			'function A(x) @{\n  @switch (x) {\n    @case /* c */ 1: {\n      <p>{"one"}</p>\n    }\n  }\n}',
		])('keeps the comment in the template %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// A formatter may never change what the source declares. Every modifier
	// below is load-bearing: dropping it silently retypes or redefines the
	// member, and the result still compiles, so nothing catches it downstream.
	describe('TypeScript modifiers survive formatting', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it.each([
			'type Setter<in T> = (value: T) => void;',
			'type Getter<out T> = () => T;',
			'type Cell<in out T> = { value: T };',
			`interface Cell<in out T extends object = object> {
  value: T;
}`,
		])('keeps type parameter variance: %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			`function identity<const T>(value: T): T {
  return value;
}`,
			'const identity = <const T,>(value: T): T => value;',
			'class Box<const T> {}',
			'class Box<const in out T> {}',
		])('keeps const type parameters: %s', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps readonly on interface members', async () => {
			await expectUnchanged(`export interface BenchRow {
  readonly id: number;
  readonly label: string;
  mutable: string;
}`);
		});

		it('keeps readonly on type literal members', async () => {
			await expectUnchanged(`type Row = {
  readonly id: number;
  readonly label?: string;
  mutable: string;
};`);
		});

		it('keeps readonly on nested type literal members', async () => {
			await expectUnchanged(`interface Outer {
  readonly inner: {
    readonly deep: number;
  };
}`);
		});

		it('keeps readonly on index signatures', async () => {
			await expectUnchanged(`interface Bag {
  readonly [key: string]: number;
}`);
		});

		it('keeps readonly array and tuple type operators', async () => {
			await expectUnchanged(`interface Lists {
  xs: readonly string[];
  ys: ReadonlyArray<number>;
  pair: readonly [number, string];
}`);
		});

		it('keeps get and set accessor kinds on method signatures', async () => {
			await expectUnchanged(`interface Box {
  get value(): number;
  set value(next: number);
}`);
		});

		it('keeps class field modifiers', async () => {
			await expectUnchanged(`class Fields {
  readonly a = 1;
  static readonly b = 2;
  private readonly c = 3;
  protected d = 4;
  public e = 5;
  declare f: number;
  accessor g = 6;
}`);
		});

		it('keeps abstract on classes and their members', async () => {
			await expectUnchanged(`abstract class Shape {
  abstract area(): number;
  abstract readonly sides: number;
  protected abstract render(): void;
}`);
		});

		it('keeps the optional marker on class methods', async () => {
			await expectUnchanged(`declare class Hook {
  onMount?(): void;
  onUpdate?<T>(value: T): T;
  [Symbol.dispose]?(): void;
}`);
			await expectUnchanged(`abstract class Lifecycle {
  abstract onMount?(): void;
  static async *stream?() {}
  onUnmount?() {
    return;
  }
}`);
		});

		it('keeps the definite-assignment assertion on class fields', async () => {
			await expectUnchanged(`export class Model {
  value!: string;
}`);
			await expectUnchanged(`class Store extends Base {
  #id!: number;
  static instance!: Store;
  private readonly items!: Item[];
  [key]!: string;
  override name!: string;
  accessor state!: State;
}`);
		});

		it('keeps static and the member separator on class index signatures', async () => {
			await expectUnchanged(`class Registry {
  [name: string]: number;
  count = 1;
}`);
			await expectUnchanged(`class Registry {
  static [name: string]: number;
}`);
			await expectUnchanged(`class Cache {
  static readonly [key: string]: number;
  readonly [index: number]: string;
  [key: symbol]: unknown;
  size = 0;
  clear() {}
}`);

			const result = await format(
				`class Cache {
  static [key: string]: number;
  [index: number]: string;
  clearAllEntriesFromTheCacheAndResetTheSize() {}
}`,
				{ semi: false },
			);
			expect(result).toBeWithNewline(`class Cache {
  static [key: string]: number
  [index: number]: string
  clearAllEntriesFromTheCacheAndResetTheSize() {}
}`);
		});

		it('keeps override on class members', async () => {
			await expectUnchanged(`class Derived extends Base {
  override toString(): string {
    return "";
  }
  override readonly tag: string = "derived";
}`);
		});

		it('keeps modifiers on constructor parameter properties', async () => {
			await expectUnchanged(`class Point {
  readonly origin = 0;
  constructor(
    private readonly x: number,
    public y: string,
  ) {}
}`);
		});

		it('keeps declare on ambient declarations', async () => {
			await expectUnchanged(`declare const version: number;
declare function init(): void;
declare class Ambient {}
declare enum Level {
  A = 1,
}`);
		});

		it('keeps declare global rather than declaring a module named global', async () => {
			await expectUnchanged(`declare global {
  interface Window {
    readonly octane: number;
  }
}`);
		});

		it('keeps declare module', async () => {
			await expectUnchanged(`declare module "octane" {
  const x: number;
}`);
		});

		it('keeps const enum', async () => {
			await expectUnchanged(`const enum Flags {
  None = 0,
}`);
		});

		it('keeps abstract on constructor types', async () => {
			await expectUnchanged(`type Ctor = abstract new () => object;`);
		});

		it('keeps class static blocks', async () => {
			await expectUnchanged(`class WithStatic {
  static {
    console.log(1);
  }
}`);
		});

		it('keeps readonly through the mapped type modifier forms', async () => {
			await expectUnchanged(`type Frozen = { readonly [K in keyof T]: T[K] };`);
			await expectUnchanged(`type Thawed = { -readonly [K in keyof T]: T[K] };`);
		});

		it('terminates bodiless class members with a semicolon, not an empty body', async () => {
			const input = `abstract class Shape {
	abstract area(): number;
}`;

			const result = await format(input);
			expect(result).not.toContain('{}');
		});

		it('keeps brackets on computed signature keys', async () => {
			await expectUnchanged(`interface Iterable {
  readonly [Symbol.iterator]: () => void;
  [Symbol.asyncIterator](): void;
}`);
		});

		it('keeps brackets on computed class field keys', async () => {
			await expectUnchanged(`class Keyed {
  [key] = 1;
  readonly [other] = 2;
}`);
		});

		it('normalises readonly onto reformatted interface members', async () => {
			const input = `interface Row {readonly   id:number
      readonly label : string}`;
			const expected = `interface Row {
  readonly id: number;
  readonly label: string;
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// With `semi: false` only a line break ends a class field, and a few next
	// members still read as its continuation, so those keep a semicolon.
	describe('class members without semicolons', () => {
		/**
		 * Assert the input is already formatted without semicolons and comes
		 * back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source, { semi: false });
			expect(result).toBeWithNewline(source);
		};

		it('puts members that end without a block on their own lines', async () => {
			const result = await format(
				'class Registry { [name: string]: number; count = 1; reset(): void; clear() {} }',
				{ semi: false },
			);
			expect(result).toBeWithNewline(`class Registry {
  [name: string]: number
  count = 1
  reset(): void
  clear() {}
}`);
		});

		it.each([
			`class Point {
  x = 1
}`,
			`class List {
  first() {}
  last() {}
}`,
			`class Lazy {
  static {}
  value = 1
}`,
		])('puts every member of a class on its own line: %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			`class A {
  x = a;
  [k] = 1
}`,
			`class A {
  x: string;
  [k] = 1
}`,
			`class A {
  x = a;
  [k: string]: unknown
}`,
			`class A {
  x = a;
  *gen() {}
}`,
			`class A {
  x = a;
  [k]() {}
}`,
			`class A {
  x = a;
  in = 1
}`,
			`class A {
  x = a;
  instanceof = 1
}`,
			`class A {
  static;
  run() {}
}`,
			`class A {
  get;
  set;
  value = 1
}`,
		])('keeps the semicolon the next member depends on: %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			`class A {
  x = a
  static [k] = 1
}`,
			`class A {
  x = a
  private [k] = 1
}`,
			`class A {
  x = a
  readonly [k: string]: unknown
}`,
			`class A {
  x = a
  async *gen() {}
}`,
			`class A {
  x = a
  get [k]() {}
}`,
			`class A {
  x = a
  #p = 1
}`,
			`class A {
  x = a
  static {}
}`,
			`class A {
  [k: string]: unknown
  [j] = 1
}`,
			`class A {
  x = a
  as = 1
}`,
			`class A {
  x = a
  satisfies: T
}`,
		])('omits the semicolon before a member that cannot continue: %s', async (source) => {
			await expectUnchanged(source);
		});

		// Unlike `static`, `get` and `set`, these only modify a member that
		// starts on the same line
		it.each([
			`class A {
  readonly
  value = 1
}`,
			`class A {
  declare
  value: string
}`,
			`class A {
  private
  run() {}
}`,
			`class A {
  async
  run() {}
}`,
		])('omits the semicolon after a field named like a same-line modifier: %s', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps the semicolon when a quoted key prints as a keyword', async () => {
			const result = await format(`class A { "static"; run() {} x = a; 'in' = 1 }`, {
				semi: false,
			});
			expect(result).toBeWithNewline(`class A {
  static;
  run() {}
  x = a;
  in = 1
}`);
		});

		it('keeps the semicolon ahead of a trailing comment', async () => {
			await expectUnchanged(`class A {
  x = a; // first
  [k] = 1
}`);
		});
	});

	// With `semi: false` a statement that starts with `(`, `[`, `` ` ``, `/`,
	// `+`, `-` or `<` would continue the one before it, so it starts with `;`
	// like Prettier prints it.
	describe('statements without semicolons', () => {
		/**
		 * Assert the input is already formatted without semicolons and comes
		 * back byte-identical.
		 * @param {string} source
		 * @param {import('prettier').Options} [options]
		 */
		const expectUnchanged = async (source, options = {}) => {
			const result = await format(source, { semi: false, ...options });
			expect(result).toBeWithNewline(source);
		};

		it('keeps an immediately invoked function a statement of its own', async () => {
			const result = await format(
				`let calls = 0;
const value = 1;
(() => { calls++; })();
calls;`,
				{ semi: false },
			);
			expect(result).toBeWithNewline(`let calls = 0
const value = 1
;(() => {
  calls++
})()
calls`);
		});

		it.each([
			';(function () {})()',
			';(async () => {})()',
			';(<T,>(value: T) => value)(1)',
			';[1, 2].forEach(log)',
			';[first, second] = [second, first]',
			';/pattern/.test(text)',
			';`template`.trim()',
			';+value',
			';-value',
			';(primary || fallback).run()',
			';(first, second)',
			';({}).toString()',
			';(value as any).name = 1',
		])('starts the statement with a semicolon: %s', async (statement) => {
			await expectUnchanged(`const value = 1\n${statement}`);
		});

		// Without a `;`, a statement whose value ends in parentheses ends at
		// the `)`. Like Prettier, a comment after it trails the statement, so it
		// doesn't break the value (#366).
		it.each([
			['const x = a | (b >> 6) // c\nconst y = 1', 'const x = a | (b >> 6); // c\nconst y = 1;'],
			['const x = (a >> 6) // c\nconst y = 1', 'const x = a >> 6; // c\nconst y = 1;'],
			['const x = !(a) // c\nconst y = 1', 'const x = !a; // c\nconst y = 1;'],
			['const f = () => (a >> 6) // c\nfoo()', 'const f = () => a >> 6; // c\nfoo();'],
			['function f() {\n  return (a >> 6) // c\n}', 'function f() {\n  return a >> 6; // c\n}'],
			[
				'function f() {\n  throw (a >> 6) // c\n  x()\n}',
				'function f() {\n  throw a >> 6; // c\n  x();\n}',
			],
			['const o = {\n  a: (b >> 6) // c\n}', 'const o = {\n  a: b >> 6, // c\n};'],
			['class A {\n  x = (a >> 6) // c\n  y = 1\n}', 'class A {\n  x = a >> 6; // c\n  y = 1;\n}'],
			[
				'const x = a | (b >> 6) /* c */\nconst y = 1',
				'const x = a | (b >> 6); /* c */\nconst y = 1;',
			],
		])(
			'trails the statement with the comment after the ) that ends %j',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
				await expectUnchanged(expected.replaceAll(';', ''));
			},
		);

		it('adds no semicolon before statements that cannot continue the previous one', async () => {
			await expectUnchanged(`const value = 1
!value
++count
count++
new Widget()
items = [1]
typeof value`);
		});

		it('prints an arrow without parentheses unguarded', async () => {
			await expectUnchanged('const value = 1\nvalue => value', { arrowParens: 'avoid' });
		});

		it('guards statements in every statement list', async () => {
			await expectUnchanged(`function run() {
  ;[1].forEach(log)
  log()
  ;(first || second)()
}
switch (key) {
  case 1:
    log()
    ;[2].forEach(log)
}
class Registry {
  static {
    log()
    ;[3].forEach(log)
  }
}
namespace Tools {
  log()
  ;[4].forEach(log)
}
export function App() @{
  ;[0].forEach(log)
  const count = 1
  ;[count].forEach(log)
  <>
    @if (count) {
      const next = count
      ;(next || count).toString()
      <span />
    }
  </>
}`);
		});

		it('guards statements in @switch case bodies', async () => {
			const source = `export function App() @{
  <>
    @switch (count) {
      @case 1: {
        ;/a/.test(text)
        const half = count / 2
        ;\`x\`.trim()
        ;(first || second).run()
        <span />
      }
      @default: {
        const next = count
        ;\`y\${next}\`.trim()
        <i />
      }
    }
  </>
}`;
			await expectUnchanged(source);
			const with_semicolons = source
				.replace(/^(\s*);/gm, '$1')
				.replace(/^(\s*(?:const|\/|`|\().*)$/gm, '$1;');
			expect(await format(with_semicolons)).toBeWithNewline(with_semicolons);
			expect(await format(with_semicolons, { semi: false })).toBeWithNewline(source);
		});

		it('starts no guard before a template element after a comment', async () => {
			await expectUnchanged(`export function App() @{
  const x = a
  /* render */ <div />
}
function render() {
  const x = a
  /* render */ <div />
}`);
			expect(
				await format(
					`export function App() @{
  const x = a;
  /* render */ <div />
}`,
					{ semi: false },
				),
			).toBeWithNewline(`export function App() @{
  const x = a
  /* render */ <div />
}`);
		});

		it('keeps a return of an element after an element with children', async () => {
			await expectUnchanged(`function Field() {
  const field = <span>{label}</span>
  return <div>{field}</div>
}`);
			expect(
				await format(
					`function Field() {
  const field = <span>{label}</span>;
  throw <div>{field}</div>;
}`,
					{ semi: false },
				),
			).toBeWithNewline(`function Field() {
  const field = <span>{label}</span>
  throw <div>{field}</div>
}`);
		});

		it('keeps an element with attributes after an element with children', async () => {
			const source = `function Test(props) {
  const render = (item) => (
    <>
      <Item />
    </>
  )
  <List renderItem={render} />
  const field = <b>{label}</b>
  <List renderItem={render} key="a" />
}
const render = <b>x</b>
<List renderItem={render} />`;
			await expectUnchanged(source);
			// The parentheses around the multi-line element end its statement
			const with_semicolons = source.replace(/(^ {2}\)|<\/b>)$/gm, '$1;');
			expect(await format(with_semicolons)).toBeWithNewline(with_semicolons);
			expect(await format(with_semicolons, { semi: false })).toBeWithNewline(source);
		});

		it('keeps an element after a statement that ends with a type', async () => {
			const source = `export function App() @{
  const x = y as Foo
  const z = y satisfies Foo
  let w: Foo
  type T = Foo
  <Bar />
}
function render() {
  const x = y as Map<A, B>
  <Bar a={1} />
}
let v: Foo
<Bar />`;
			await expectUnchanged(source);
			const with_semicolons = source.replace(/^(\s*(?:const|let|type) .*)$/gm, '$1;');
			expect(await format(with_semicolons)).toBeWithNewline(with_semicolons);
			expect(await format(with_semicolons, { semi: false })).toBeWithNewline(source);
		});

		it('guards a template literal after an element with children', async () => {
			expect(
				await format('function f() {\n  const a = <b>x</b>;\n  `t`;\n}', { semi: false }),
			).toBeWithNewline('function f() {\n  const a = <b>x</b>\n  ;`t`\n}');
		});

		it('divides after an element and in code block setup statements', async () => {
			await expectUnchanged(`const half = <span /> / 2
const third = <span>x</span> / 3
function f() {
  return <>x</> / 2
}
export function App() @{
  total / count > 1 && log()
  a / b
  <>
    @if (x) {
      a / b
      <span />
    }
  </>
}`);
		});

		// Prettier prints `await (<div />)` (#425); the output must
		// parse again either way.
		it('formats an awaited element', async () => {
			for (const semi of [true, false]) {
				await format(
					'async function f() {\n  await (<div />);\n  const view = await <b>a</b>;\n}',
					{
						semi,
					},
				);
			}
		});

		it('puts the semicolon after comments and before a JSDoc cast', async () => {
			await expectUnchanged(`log()
// note
;[1].forEach(log)
;/** @type {any} */ (value).run()`);
		});

		it('guards a statement kept verbatim by prettier-ignore', async () => {
			await expectUnchanged(`log()
// prettier-ignore
;(new  Widget).run()`);
		});

		it('keeps the blank line before a guarded statement', async () => {
			await expectUnchanged(`const value = 1

;[1].forEach(log)
log()

;(first || second)()`);
		});

		it.each([
			'if (ready) run()',
			'if (ready) run()\nelse stop()',
			'for (const item of items) run(item)',
			'while (ready) run()',
			'debugger',
			'export { value }',
		])('keeps the blank line before a guarded statement after %s', async (statement) => {
			await expectUnchanged(`const value = 1\n${statement}\n\n;[1].forEach(log)`);
		});

		it('keeps the blank line before a guarded statement after continue', async () => {
			await expectUnchanged(`for (const item of items) {
  continue

  ;[item].forEach(log)
}`);
		});

		it('keeps the blank line before a comment that leads a guarded statement', async () => {
			await expectUnchanged(`const value = 1

// note
;[1].forEach(log)
log()

/* note */
;(first || second)()`);
		});

		it('drops empty statements from statement lists', async () => {
			expect(await format(';log();;\nrun();')).toBeWithNewline('log();\nrun();');
			expect(await format('function f() { ; }')).toBeWithNewline('function f() {}');
			expect(await format('class A { static { ;log() } }')).toBeWithNewline(`class A {
  static {
    log();
  }
}`);
		});
	});

	// An empty statement prints as nothing, so like Prettier its comments go to
	// the statements around it, or to its block when it has no neighbors.
	describe('comments around empty statements', () => {
		it.each([
			['a; ; // c\nb;', 'a; // c\nb;'],
			['a; ; ; /* c */\nb;', 'a; /* c */\nb;'],
			['a; /* c */ ;\nb;', 'a; /* c */\nb;'],
			['; // c\nb;', '// c\nb;'],
			['; /* c */ b;', '/* c */ b;'],
			['; // c', '// c'],
			['function f() {\n  a; ; // c\n  b;\n}', 'function f() {\n  a; // c\n  b;\n}'],
			['function f() {\n  a; ; // c\n}', 'function f() {\n  a; // c\n}'],
			['function f() {\n  ; // c\n}', 'function f() {\n  // c\n}'],
			[
				'switch (x) {\n  case 1:\n    a; ; // c\n    b;\n}',
				'switch (x) {\n  case 1:\n    a; // c\n    b;\n}',
			],
			[
				'class C {\n  static {\n    a; ; // c\n  }\n}',
				'class C {\n  static {\n    a; // c\n  }\n}',
			],
			['class C {\n  static {\n    ; // c\n  }\n}', 'class C {\n  static {\n    // c\n  }\n}'],
			['namespace N {\n  a; ; // c\n  b;\n}', 'namespace N {\n  a; // c\n  b;\n}'],
			['namespace N {\n  ; // c\n}', 'namespace N {\n  // c\n}'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			['; // c\n[1].forEach(log)', '// c\n;[1].forEach(log)'],
			['a; ; // c\nb', 'a // c\nb'],
			['a\n; // c\n[1].forEach(log)', 'a // c\n;[1].forEach(log)'],
		])('formats %j like Prettier with semi: false', async (source, expected) => {
			expect(await format(source, { semi: false })).toBeWithNewline(expected);
		});

		it('keeps a comment on an empty statement body', async () => {
			const source = 'if (x); // c\nelse y;';
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// A line that holds only an empty statement prints as nothing, not as a
	// blank line. Like Prettier, a blank line is kept only when the line right
	// after a statement or leading comment, or right before a trailing
	// comment, is empty.
	describe('lines with only a semicolon', () => {
		it.each([
			['a();\n;\nb();', 'a();\nb();'],
			['a();\n;;\n;\nb();', 'a();\nb();'],
			['a();\n;\n\nb();', 'a();\nb();'],
			['a();\n\n;\nb();', 'a();\n\nb();'],
			['a(); // c\n;\nb();', 'a(); // c\nb();'],
			['a();\n; // c\nb();', 'a(); // c\nb();'],
			['a();\n// c\n;\nb();', 'a();\n// c\nb();'],
			['a();\n;\n// c\nb();', 'a();\n// c\nb();'],
			['a();\n// c\n;\n// d\nb();', 'a();\n// c\n// d\nb();'],
			['a();\n/* c */\n;\nb();', 'a();\n/* c */\nb();'],
			['a();\n;\n// c', 'a();\n// c'],
			['a();\n;\n\n// c', 'a();\n\n// c'],
			['function f() {\n  a();\n  ;\n  b();\n}', 'function f() {\n  a();\n  b();\n}'],
			['function f() {\n  a();\n  ;\n  // c\n}', 'function f() {\n  a();\n  // c\n}'],
			[
				'class A {\n  static {\n    a();\n    ;\n    b();\n  }\n}',
				'class A {\n  static {\n    a();\n    b();\n  }\n}',
			],
			['namespace N {\n  a();\n  ;\n  b();\n}', 'namespace N {\n  a();\n  b();\n}'],
			[
				'class A {\n  first() {\n    return 1;\n  }\n  ;\n  second() {\n    return 2;\n  }\n}',
				'class A {\n  first() {\n    return 1;\n  }\n  second() {\n    return 2;\n  }\n}',
			],
			[
				'switch (x) {\n  case 1:\n    a();\n    ;\n    // c\n}',
				'switch (x) {\n  case 1:\n    a();\n  // c\n}',
			],
			[
				'switch (x) {\n  case 1:\n    a();\n\n\n    // c\n}',
				'switch (x) {\n  case 1:\n    a();\n\n  // c\n}',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			['a()\n;\n\nb()', 'a()\n\nb()'],
			['a\n;\n;[b].c()', 'a\n;[b].c()'],
		])('formats %j like Prettier with semi: false', async (source, expected) => {
			expect(await format(source, { semi: false })).toBeWithNewline(expected);
		});

		it.each([
			[
				'function App() @{\n  a();\n  ;\n  b();\n  <div />\n}',
				'function App() @{\n  a();\n  b();\n  <div />\n}',
			],
			['function App() @{\n  a();\n  ;\n  <div />\n}', 'function App() @{\n  a();\n  <div />\n}'],
			[
				'function App() @{\n  a();\n  // c\n  ;\n  <div />\n}',
				'function App() @{\n  a();\n  // c\n  <div />\n}',
			],
			['function App() @{\n  <div />\n  ;\n  // c\n}', 'function App() @{\n  <div />\n  // c\n}'],
			[
				'function App() @{\n  <div />\n\n  // c\n  ;\n  // d\n}',
				'function App() @{\n  <div />\n\n  // c\n  // d\n}',
			],
		])('formats %j in a code block', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});
	});

	describe('comment-only files', () => {
		it.each(['// only', '// a\n\n// b', '/* block */', '/**\n * License\n */'])(
			'keeps %j',
			async (source) => {
				expect(await format(source)).toBeWithNewline(source);
			},
		);

		it('prints the comments of a file with only empty statements on consecutive lines', async () => {
			expect(await format('// a\n\n// b\n;\n')).toBeWithNewline('// a\n// b');
			expect(await format(';\n// a\n\n// b\n')).toBeWithNewline('// a\n// b');
		});
	});

	// The parser reports a hashbang as a line comment at offset 0; like Prettier,
	// print it back as written
	describe('hashbangs', () => {
		it.each([
			'#!/usr/bin/env node',
			'#!/usr/bin/env node\n// A comment',
			'#!/usr/bin/env node\nconsole.log(1);',
			'#!/usr/bin/env node\n\nimport { x } from "./x";',
			'#!/usr/bin/env -S node --no-warnings\n/** Docs */\nexport function App() @{\n  <div />\n}',
			'#!/usr/bin/env node\n"use strict";\nconsole.log(1);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps the hashbang of a file with only empty statements', async () => {
			expect(await format('#!/usr/bin/env node\n;\n')).toBeWithNewline('#!/usr/bin/env node');
		});

		// Empty statements take no comments, so the parser attaches the hashbang
		// to the first statement after them
		it.each([
			['#!/usr/bin/env node\n;\nconsole.log(1);', '#!/usr/bin/env node\nconsole.log(1);'],
			[
				'#!/usr/bin/env node\n;\n// A comment\nconsole.log(1);',
				'#!/usr/bin/env node\n// A comment\nconsole.log(1);',
			],
			[
				'#!/usr/bin/env node\n;;\n"use strict";\nconsole.log(1);',
				'#!/usr/bin/env node\n("use strict");\nconsole.log(1);',
			],
			[
				'#!/usr/bin/env node\n;\nexport function App() @{\n  <div />\n}',
				'#!/usr/bin/env node\nexport function App() @{\n  <div />\n}',
			],
		])('keeps the hashbang before empty statements in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it('keeps a line comment that starts with a slash a comment', async () => {
			const source = '///usr/bin/env node\nconsole.log(1);';
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('using declarations', () => {
		it('keeps using and await using declarations', async () => {
			const source = `using moduleHandle = open();

async function run(items: Iterable<Disposable>) {
  using handle: Disposable = open();
  await using connection = await connect();
  for (using item of items) {
    use(item);
  }
  for await (await using item of stream) {
    use(item);
  }
}

export function App() @{
  using handle = open();
  <div>{handle.name}</div>
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('puts each declarator on its own line once one has a value', async () => {
			expect(await format('using a = open(), b = open();')).toBeWithNewline(
				'using a = open(),\n  b = open();',
			);
		});
	});

	describe('regular expressions', () => {
		it('keeps the v flag and modifiers', async () => {
			const source = 'const set = /[\\p{L}--[a-z]]/v;\nconst modified = /(?i:a)b/;';
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Like Prettier's `printDanglingComments`, the comments of a body with no
	// statements or members print on consecutive lines
	describe('comments in empty bodies', () => {
		it('drops the blank lines between the comments of an empty body', async () => {
			const input = `{
  // a

  // b
}
function f() {
  // a

  /* b */
}
const g = () => {
  // a
  ;
  // b
};
for (;;) {
  // a

  // b
}
interface A {
  // a

  // b
}
enum E {
  // a

  // b
}
type T = {
  // a

  // b
};
namespace N {
  // a

  // b
}`;
			const expected = `{
  // a
  // b
}
function f() {
  // a
  /* b */
}
const g = () => {
  // a
  // b
};
for (;;) {
  // a
  // b
}
interface A {
  // a
  // b
}
enum E {
  // a
  // b
}
type T = {
  // a
  // b
};
namespace N {
  // a
  // b
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps the comments of a class body with no members inside it', async () => {
			const input = `class A {
  // a

  // b
}
const C = class {
  /* only */
};
class D { /* x */ }`;
			const expected = `class A {
  // a
  // b
}
const C = class {
  /* only */
};
class D {
  /* x */
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('starts the comments of a code block with no statements on its first line', async () => {
			const input = `function App() @{
  // note
}
const Arrow = () => @{
  /* note */
};
function Two() @{
  // a

  // b
}`;
			const expected = `function App() @{
  // note
}
const Arrow = () => @{
  /* note */
};
function Two() @{
  // a
  // b
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// Type arguments, `this` types, and heritage clauses decide what a
	// declaration means. Dropping one either breaks the file or quietly
	// widens a type, so each must come back exactly as written.
	describe('TypeScript types survive formatting', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it.each([
			'const upper: typeof identity<string> = (value) => value.toUpperCase();',
			'type Pair = typeof ns.pair<number, string>;',
			'type Loaded = typeof import("./module").load<string>;',
		])('keeps type arguments on typeof type queries: %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			'const query = sql<Row>`select 1`;',
			'const Title = styled.h1<Props>`\n  color: red;\n`;',
			'const nested = tag<Map<string, number>, Key>`a${value}c`;',
			'const explicit = (tag<T>)<U>`x`;',
		])('keeps type arguments on tagged templates: %s', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps type arguments on import types', async () => {
			await expectUnchanged('type Entry = import("./module").Entry<string>;');
		});

		it('keeps polymorphic this types', async () => {
			await expectUnchanged(`interface Builder {
  self: this;
  next(): this;
  all: this[];
}`);
			await expectUnchanged(`class Chain {
  clone(): this {
    return this;
  }
}`);
		});

		it.each([
			'class Derived extends Base<string> implements Contract<string> {}',
			'class Derived extends ns.Base<Map<string, number>> {}',
			'class Derived implements Contract<string>, ns.Other {}',
			'const Derived = class extends Base<number> implements Contract<number> {};',
			'abstract class Derived<T> extends Base<T> implements Contract<T> {}',
			'export default class Derived extends Base<string> implements Contract<string> {}',
		])('keeps superclass type arguments and implements clauses: %s', async (source) => {
			await expectUnchanged(source);
		});
	});

	// Like Prettier, the parentheses written around a type are dropped, and a
	// type prints with the ones its parent needs: the ones the grammar
	// requires and the ones Prettier adds where the type parses the same
	// without them.
	describe('type parentheses follow Prettier', () => {
		it.each([
			[
				'const f = (journal: Journal): () => void => {\n  return () => {};\n};',
				'const f = (journal: Journal): (() => void) => {\n  return () => {};\n};',
			],
			[
				'class C {\n  m = <T,>(): <U>(u: U) => T => null!;\n}',
				'class C {\n  m = <T,>(): (<U>(u: U) => T) => null!;\n}',
			],
			['type A = typeof a[];', 'type A = (typeof a)[];'],
			['type A = typeof a[number];', 'type A = (typeof a)[number];'],
			['type A = keyof keyof T;', 'type A = keyof (keyof T);'],
			['type A = [...A | B];', 'type A = [...(A | B)];'],
			[
				'type A = <X extends B extends C ? D : E>() => X;',
				'type A = <X extends (B extends C ? D : E)>() => X;',
			],
		])('prints %s as %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'const f = (): (() => void) => () => {};',
			'const f = (): (() => void) | null => null;',
			'const f = (): Promise<() => void> => load();',
			'const f = (): new () => Foo => Foo;',
			'const f = (): A extends B ? C : D => value;',
			'const f = (): value is () => void => true;',
			'function f(): () => void {}',
			'const f = function (): () => void {};',
			'let callback: () => void;',
			'type A = (keyof T)[];',
			'type A = keyof T[];',
			'type A = readonly (typeof a)[];',
			'type A = keyof typeof a;',
			'type A = (() => void)[];',
			'type A = [(() => void)?];',
			'type A = [...infer U];',
			'type A = B extends (C extends D ? E : F) ? G : H;',
			'type A = (B extends C ? D : E) extends F ? G : H;',
			'type A = B extends (() => infer R extends string) ? R : never;',
			'type A = B extends () => infer R ? R : never;',
			'type A = { [K in B extends "" ? "index" : B]: 1 };',
			'type A<T> = T extends [infer U extends (B extends C ? D : E)] ? U : never;',
		])('keeps %s as written', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['type A = (B | C);', 'type A = B | C;'],
			['let x: (A | B) = 1;', 'let x: A | B = 1;'],
			['type D = ((E));', 'type D = E;'],
			['type A = (string);', 'type A = string;'],
			['type A = Foo<(B | C)>;', 'type A = Foo<B | C>;'],
			['type A = ReturnType<(typeof f)>;', 'type A = ReturnType<typeof f>;'],
			['type A = { [K in (keyof T)]: T[K] };', 'type A = { [K in keyof T]: T[K] };'],
			[
				'type A = B extends C ? D : (E extends F ? G : H);',
				'type A = B extends C ? D : E extends F ? G : H;',
			],
			[
				'type A = (B | C) extends (D | E) ? (F | G) : H;',
				'type A = B | C extends D | E ? F | G : H;',
			],
			['type A = ({ a: string }) | null;', 'type A = { a: string } | null;'],
			['const g = (): (A | B) => x;', 'const g = (): A | B => x;'],
			['function f(): (() => void) {}', 'function f(): () => void {}'],
			[
				'function f(a: (A | B), b: ((x: string) => void)) {}',
				'function f(a: A | B, b: (x: string) => void) {}',
			],
			['let v = x as (A | B);', 'let v = x as A | B;'],
			['let v = x satisfies (A);', 'let v = x satisfies A;'],
			[
				'class C<T extends (A | B) = (C)> implements I<(X)> {}',
				'class C<T extends A | B = C> implements I<X> {}',
			],
			[
				'interface I { a: (string | number); b(): (A | B); }',
				'interface I {\n  a: string | number;\n  b(): A | B;\n}',
			],
		])('drops the redundant parentheses in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'type A = (B | C)[];',
			'type A = (B & C) | D;',
			'type A = B & (C | D);',
			'type A = keyof (B | C);',
			'type A = (new () => X) | Y;',
			'type A = (abstract new () => void) | X;',
			'type A = ((a: string) => void) | null;',
			'type A = (B extends C ? D : E)[];',
			'type A = B extends (infer U)[] ? U : never;',
			'type A = [(B | C)?];',
			'type A = (B | C)["x"];',
			'type A = (readonly string[])[];',
			'const x = y as (typeof z)[number];',
		])('keeps the needed parentheses in %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('lays out a type as if its parentheses were not written', async () => {
			const input = `type A = (Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccccccccccccccccccccccccccccccccc);
type B = (Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccccccccccccccccccccccccccccccccc)[];
type C = [(Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb), (Cccccccccccccccccccccccc | D)];
function foo(a: (Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)) {}
type D = (
  | { kind: "a"; value: string }
  | { kind: "b"; value: number }
);`;

			expect(await format(input)).toBeWithNewline(`type A =
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  | Cccccccccccccccccccccccccccccccccccccccccc;
type B = (
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  | Cccccccccccccccccccccccccccccccccccccccccc
)[];
type C = [
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccccccccccccccccccccccc | D,
];
function foo(
  a:
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
) {}
type D = { kind: "a"; value: string } | { kind: "b"; value: number };`);
		});

		// The layout checks look through a parameter or declarator into its type
		it('picks the layout from the type inside the parentheses', async () => {
			const input = `function foo(options: ({ aaaaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbb: number; ccccccccc: boolean })) {}
const fooooooooooooooooooooooooo = (aaaaaaa: string, bbbbbbbbbbbbbbb: number): ({ a: string; b: number }) => {};
export const selectorByInstance: (Map<Selector, WeakMap<Instance, Value>>) = new Map();
foo(x as (A)[], b);`;

			expect(await format(input)).toBeWithNewline(`function foo(options: {
  aaaaaaaaaaaaaaa: string;
  bbbbbbbbbbbbbbbbbbbbbbbb: number;
  ccccccccc: boolean;
}) {}
const fooooooooooooooooooooooooo = (
  aaaaaaa: string,
  bbbbbbbbbbbbbbb: number,
): { a: string; b: number } => {};
export const selectorByInstance: Map<
  Selector,
  WeakMap<Instance, Value>
> = new Map();
foo(x as A[], b);`);
		});

		it('keeps the parentheses of a type kept by prettier-ignore', async () => {
			const input = `type A = keyof /* prettier-ignore */ (B   |   C);
type D = [/* prettier-ignore */ (B   |   C)?];
type E =
  | B
  // prettier-ignore
  | (C   &   D)
  | E;`;

			expect(await format(input)).toBeWithNewline(input);
		});

		// Like Prettier's ternaries, only on one line
		it('parenthesizes a conditional true type that stays on one line', async () => {
			const input = `type A<T> = T extends string ? T extends "a" ? 1 : 2 : 3;
type B<T> = T extends string ? (T extends "aaaaaaaaaaaaaaaaaaaaaa" ? "bbbbbbbbbbbbbbbbbbbbbbbbbb" : "cccccccccccccccccccccc") : never;
type C = IfAny<T, false, T extends object ? (keyof T extends K ? true : false) : false>;`;

			expect(await format(input))
				.toBeWithNewline(`type A<T> = T extends string ? (T extends "a" ? 1 : 2) : 3;
type B<T> = T extends string
  ? T extends "aaaaaaaaaaaaaaaaaaaaaa"
    ? "bbbbbbbbbbbbbbbbbbbbbbbbbb"
    : "cccccccccccccccccccccc"
  : never;
type C = IfAny<
  T,
  false,
  T extends object ? (keyof T extends K ? true : false) : false
>;`);
		});

		it('keeps the comments around dropped parentheses', async () => {
			const input = `type A = /* c */ (B | C);
type D = (/* c */ B | C);
type E = (B | C) /* c */;
type X = (
  /* leading */ A
);
type Y = (A // trailing
);`;

			expect(await format(input)).toBeWithNewline(`type A = /* c */ B | C;
type D = /* c */ B | C;
type E = B | C /* c */;
type X = /* leading */ A;
type Y = A; // trailing`);
		});
	});

	// Prettier's `printUnionType`: a union that doesn't fit moves to its own
	// indented lines, one member per line after a leading `|`, unless its
	// context already indents it or keeps it in place.
	describe('union types break like Prettier', () => {
		// A comment between members used to print after the next member's `|`,
		// and a block comment before a union before its first `|` (#397)
		it.each([
			'type Kind =\n  | "first" // the first kind\n  // the second kind, on its own line\n  | "second"\n  | "third";',
			'type Kind =\n  | "first"\n  /* the second kind */\n  | "second";',
			'type Kind =\n  | "first"\n\n  // the second kind\n  | "second";',
			'type K = (\n  | "first"\n  // the second kind\n  | "second"\n)[];',
			'function f(\n  kind:\n    | "first"\n    // the second kind\n    | "second",\n) {}',
			'type A =\n  | B // c\n  | C;',
			'let value: /* either */ A | B;',
		])('keeps the comments of %j where they are', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'interface Props {\n  value: /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbb;\n}',
				'interface Props {\n  value:\n    | /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n    | Bbbbbbbbbbbbbbbbbbb;\n}',
			],
			[
				'type T = /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;',
				'type T =\n  | /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;',
			],
			['type A = B | // c\n  C;', 'type A =\n  | B // c\n  | C;'],
			['type A =\n  | B | // c\n  C', 'type A =\n  | B // c\n  | C;'],
			[
				'type Kind =\n  | "first"\n  // the second kind\n\n  | "second";',
				'type Kind =\n  | "first"\n  // the second kind\n  | "second";',
			],
		])('prints the comments of %j before the next |, like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('moves a broken union in a type annotation to its own indented lines', async () => {
			const input = `let x: Foooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo | null | undefined = 1;
interface I { value: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbb }`;
			const expected = `let x:
  | Foooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo
  | null
  | undefined = 1;
interface I {
  value:
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbb;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('indents a broken union in parameters, return types, and class fields', async () => {
			const input = `function f(value: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Ccccc) {}
function g(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb {}
class C {
  value: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | null = null;
}`;
			const expected = `function f(
  value:
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    | Ccccc,
) {}
function g():
  | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb {}
class C {
  value:
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    | null = null;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks a union in place in type arguments and conditional type branches', async () => {
			const input = `let list: Array<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb>;
type Pick<T> = T extends string ? Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb : never;
type K<T> = T extends string ? Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Ccccccccccc : never;`;
			const expected = `let list: Array<
  | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
>;
type Pick<T> = T extends string
  ? Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb
  : never;
type K<T> = T extends string
  ? | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    | Ccccccccccc
  : never;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks a parenthesized union inside its parentheses', async () => {
			const input = `type Items = (Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)[];`;
			const expected = `type Items = (
  | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)[];`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('moves a cast union below as or satisfies, and keeps a hugged one inline', async () => {
			const input = `const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
const value = options satisfies Aaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccc;
const target = event.target as HTMLElement | null;`;
			const expected = `const input = element as
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
const value = options satisfies
  Aaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccc;
const target = event.target as HTMLElement | null;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('prints the comments before a union inside its indentation', async () => {
			const input = `interface Props {
  // What the field holds
  value: // Either kind of value
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb;
  items: (// Either kind of item
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb)[];
  short: string | null;
  config: { enabled: boolean; name: string } | null;
}`;
			const expected = `interface Props {
  // What the field holds
  value:
    // Either kind of value
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb;
  items: (
    // Either kind of item
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb
  )[];
  short: string | null;
  config: { enabled: boolean; name: string } | null;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// Prettier's `printIntersectionType`: types that aren't object types break
	// after the `&` between them; an object type stays on the line of its `&`.
	describe('intersection types break like Prettier', () => {
		it('breaks a long intersection after each &', async () => {
			const input = `type MethodsType = typeof Attributes & typeof Traversing & typeof Manipulation & typeof Css & typeof Forms;
type Merged = FirstVeryLongTypeName<WithArgument> & SecondVeryLongTypeName & ThirdTypeName<X>;`;
			const expected = `type MethodsType = typeof Attributes &
  typeof Traversing &
  typeof Manipulation &
  typeof Css &
  typeof Forms;
type Merged = FirstVeryLongTypeName<WithArgument> &
  SecondVeryLongTypeName &
  ThirdTypeName<X>;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps an object type on the line of its &', async () => {
			const input = `type Props = BaseProps & { aaaaaaaaaaaaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number };
type Props2 = BaseProps & OtherPropsWithAVeryLongName & { aaaaaaaaaaaaaaaaaaaaaaa: string; bbbbbbbbbbb: number };
type Props3 = { aaaaaaaaaaaaaaaaaaaaaaa: string } & { bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number };
type Props4 = { aaaaaaaaaaaaaaaaaaaaaaa: string } & BaseProps & { bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number };`;
			const expected = `type Props = BaseProps & {
  aaaaaaaaaaaaaaaaaaaaaaa: string;
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
};
type Props2 = BaseProps &
  OtherPropsWithAVeryLongName & {
    aaaaaaaaaaaaaaaaaaaaaaa: string;
    bbbbbbbbbbb: number;
  };
type Props3 = { aaaaaaaaaaaaaaaaaaaaaaa: string } & {
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
};
type Props4 = { aaaaaaaaaaaaaaaaaaaaaaa: string } & BaseProps & {
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
  };`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks an intersection in a parameter, an annotation, or a union member', async () => {
			const input = `function f(options: Aaaaaaaaaaaaaaaaaaaaaaaaaaaa & Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb & Cccccccccccccccccc) {}
let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa & Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb & Ccccccccccc = y;
type U =
  | (ManagedIdentityCredentialClientIdOptions & ManagedIdentityDisableProbeOptions)
  | (ManagedIdentityCredentialResourceIdOptions & ManagedIdentityDisableProbeOptions);`;
			const expected = `function f(
  options: Aaaaaaaaaaaaaaaaaaaaaaaaaaaa &
    Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb &
    Cccccccccccccccccc,
) {}
let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb &
  Ccccccccccc = y;
type U =
  | (ManagedIdentityCredentialClientIdOptions &
      ManagedIdentityDisableProbeOptions)
  | (ManagedIdentityCredentialResourceIdOptions &
      ManagedIdentityDisableProbeOptions);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('moves a type after an own-line comment to the next line', async () => {
			const input = `type A = B &
// comment
C;
type D = { a: string } &
// comment
E;`;
			const expected = `type A = B &
  // comment
  C;
type D = { a: string } &
  // comment
  E;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// `extends` only takes a left-hand-side expression, so a superclass that
	// binds looser than that is a syntax error without its parens.
	describe('superclass expressions keep required parentheses', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 * @param {import('prettier').Options} [options]
		 */
		const expectUnchanged = async (source, options) => {
			const result = await format(source, options);
			expect(result).toBeWithNewline(source);
		};

		it.each([
			'class Derived extends (Base || Object) {}',
			'class Derived extends (Base && Object) {}',
			'class Derived extends (Base ?? Object) {}',
			'class Derived extends (left + right) {}',
			'class Derived extends (key in registry) {}',
			'class Derived extends (cached = Base) {}',
			'class Derived extends (() => Base) {}',
			'class Derived extends (Base as Constructor) {}',
			'class Derived extends (Base satisfies Constructor) {}',
			'class Derived extends (typeof Base) {}',
			'class Derived extends (count++) {}',
			'class Derived extends (useBase ? Base : Object) {}',
			'class Derived extends (0, Base) {}',
			'const Derived = class extends (Base || Object) {};',
			'export default class extends (Base || Object) {}',
			'class Derived extends (Base || Object)<string> implements Contract {}',
		])('keeps the parentheses in %s', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps the parentheses with semi: false', async () => {
			await expectUnchanged('class Derived extends (Base ?? Object) {}', { semi: false });
		});

		it('keeps the parentheses around await and yield superclasses', async () => {
			await expectUnchanged(`async function load() {
  class Derived extends (await Base) {}
}`);
			await expectUnchanged(`function* load() {
  class Derived extends (yield Base) {}
}`);
		});

		it('keeps the parentheses around a decorated class expression', async () => {
			await expectUnchanged(`class Derived extends (
  @sealed
  class {}
) {}`);
		});

		it('hugs the parentheses when the superclass breaks', async () => {
			await expectUnchanged(`class Derived extends (SomeVeryLongBaseClassName ||
  AnotherVeryLongFallbackClassName ||
  Object) {}`);
		});

		it.each([
			'class Derived extends Base.Mixin {}',
			'class Derived extends Mixin(Base) {}',
			'class Derived extends class {} {}',
			'class Derived extends Base! {}',
		])('does not add parentheses in %s', async (source) => {
			await expectUnchanged(source);
		});
	});

	// Like Prettier's `printClass`: the heading groups its heritage clauses
	// when it has more than one heritage type or a single qualified name, and
	// a class whose heading breaks starts its body on a new line.
	describe('class and interface headings break like Prettier', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		};

		it('puts each class heritage clause on its own line and { on the next', async () => {
			const input = `export class BrowserPerformanceClient extends PerformanceClient implements IPerformanceClient, IDisposable {
  x = 1;
}`;

			expect(await format(input)).toBeWithNewline(`export class BrowserPerformanceClient
  extends PerformanceClient
  implements IPerformanceClient, IDisposable
{
  x = 1;
}`);
		});

		it('keeps { on the heading line of a class with an empty body', async () => {
			const input = `export class VeryLongClassNameForTestingPurposesOnlyHereAbc extends Base implements One {}`;

			expect(await format(input))
				.toBeWithNewline(`export class VeryLongClassNameForTestingPurposesOnlyHereAbc
  extends Base
  implements One {}`);
		});

		it('breaks a heading with one qualified heritage name', async () => {
			await expectUnchanged(`export class VeryLongClassNameForTestingPurposesOnlyHere
  extends SomeNamespace.BaseClass
{
  x = 1;
}`);
			await expectUnchanged(`export class VeryLongClassNameForTesting
  implements SomeNamespace.SomeInterfaceName.Deep
{
  x = 1;
}`);
			await expectUnchanged(`export interface VeryLongInterfaceNameForTestingPurposes
  extends SomeNamespace.BaseInterface {
  x: 1;
}`);
		});

		// Prettier's `printSuperClass`: only the value of an assignment expression
		it('moves a long superclass of an assigned class expression into parentheses', async () => {
			const input = `Foo = class extends SomeNamespace.VeryLongBaseClassNameForTestingPurposesOnlyAbc.Def {
  x = 1;
};
module.exports = class extends mixin(SomeVeryLongBaseClassName, AnotherVeryLongMixinClassName) {
  x = 1;
};
a.b = class extends (SomeVeryLongBaseClassNameThatIsReallyLong || SomeOtherBaseClassName) {
  x = 1;
};
Foo = class extends SomeNamespace.VeryLongBaseClassNameForTestingPurposes<TypeArg> {
  x = 1;
};`;

			expect(await format(input)).toBeWithNewline(`Foo = class extends (
  SomeNamespace.VeryLongBaseClassNameForTestingPurposesOnlyAbc.Def
) {
  x = 1;
};
module.exports = class extends (
  mixin(SomeVeryLongBaseClassName, AnotherVeryLongMixinClassName)
) {
  x = 1;
};
a.b = class extends (
  (SomeVeryLongBaseClassNameThatIsReallyLong || SomeOtherBaseClassName)
) {
  x = 1;
};
Foo = class extends (
  SomeNamespace.VeryLongBaseClassNameForTestingPurposes
)<TypeArg> {
  x = 1;
};`);
		});

		it.each([
			'Foo = class extends Base {};',
			'Foo = class extends (Base || Object) {};',
			`const Foo = class extends SomeVeryLongBaseClassNameThatIsReallyLongForTestingAbcdef {
  x = 1;
};`,
		])('keeps the superclass of %s as it is', async (source) => {
			await expectUnchanged(source);
		});

		it('breaks the heading of a class expression', async () => {
			const input = `const Foo = class VeryLongClassNameForTestingPurposesOnly extends Base implements IFoo, IBar {
  x = 1;
};`;

			expect(await format(input))
				.toBeWithNewline(`const Foo = class VeryLongClassNameForTestingPurposesOnly
  extends Base
  implements IFoo, IBar
{
  x = 1;
};`);
		});

		it('keeps declare and abstract on the heading line', async () => {
			const input = `declare abstract class VeryLongClassNameForTestingPurposesOnly extends Base implements One {
  x: 1;
}`;

			expect(await format(input))
				.toBeWithNewline(`declare abstract class VeryLongClassNameForTestingPurposesOnly
  extends Base
  implements One
{
  x: 1;
}`);
		});

		it('puts interface extends on its own line and each type on its own line when they do not fit', async () => {
			const input = `interface AbortSignal extends EventTarget, InternalEventTargetEventProperties<AbortSignalEventMap> {
  readonly aborted: boolean;
}
export interface SectionProps<T> extends Omit<SharedSectionProps<T>, "children" | "title">, StyleProps, GlobalDOMAttributes<HTMLElement> {
  id?: Key;
}`;

			expect(await format(input)).toBeWithNewline(`interface AbortSignal
  extends EventTarget, InternalEventTargetEventProperties<AbortSignalEventMap> {
  readonly aborted: boolean;
}
export interface SectionProps<T>
  extends
    Omit<SharedSectionProps<T>, "children" | "title">,
    StyleProps,
    GlobalDOMAttributes<HTMLElement> {
  id?: Key;
}`);
		});

		it.each([
			'class A extends B implements C, D {}',
			'interface I extends J, K {}',
			'const X = class extends B implements C, D {};',
			`export class VeryLongClassNameForTestingPurposesOnlyHere extends SomeBaseClassNameThatIsLong {
  x = 1;
}`,
			`class Foo extends aVeryLongFunctionCallThatReturnsAClass(
  withSomeArguments,
  andMore,
  andMoreArgs,
) {
  x = 1;
}`,
			`export class VeryLongClassNameForTestingPurposesOnly<
  TypeParameterOne,
  TypeParameterTwo,
> extends Base<TypeParameterOne> {
  x = 1;
}`,
		])('keeps a heading that fits or has one simple clause: %s', async (source) => {
			await expectUnchanged(source);
		});
	});

	describe('expression parentheses follow Prettier', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		/**
		 * Parse with Prettier's own TypeScript printer to compare syntax trees:
		 * two sources print the same exactly when they parse the same.
		 * @param {string} source
		 */
		const normalize = (source) => prettier.format(source, { parser: 'typescript' });

		it.each([
			'const result = (primary || fallback)();',
			'const result = (primary ?? fallback)();',
			'const result = (primary && fallback)?.();',
			'const result = (left + right)(1, 2)();',
			'const result = new (primary || fallback)();',
			'const result = (primary || fallback)`template`;',
			'const result = (primary || fallback)!;',
			'const result = (primary || fallback).name;',
			'class Derived extends (primary || fallback)() {}',
			'class Derived extends (primary ?? fallback)().Mixin {}',
		])('keeps the parentheses around a logical or binary callee in %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			`async function run() {
  return (await Promise.resolve(() => 42))();
}`,
			`async function run() {
  return new (await load())();
}`,
			`async function run() {
  return (await load())\`template\`;
}`,
			`async function run() {
  return (await load()) ** 2;
}`,
			`async function run() {
  return !(await load());
}`,
			`function* run() {
  return (yield 2) + 1;
}`,
			`function* run() {
  return (yield 2) ? left : right;
}`,
			`function* run() {
  return (yield 2).value;
}`,
			`function* run() {
  return (yield 2)!;
}`,
			`function* run() {
  return (yield 2) as number;
}`,
		])('keeps the parentheses around await and yield in %s', async (source) => {
			await expectUnchanged(source);
		});

		// Prettier parenthesizes an element unless its parent prints it bare
		it.each([
			['async function f() {\n  await <div />;\n}', 'async function f() {\n  await (<div />);\n}'],
			['x = !<div />;', 'x = !(<div />);'],
			['x = typeof <div />;', 'x = typeof (<div />);'],
			['x = -<b />;', 'x = -(<b />);'],
			['x = void <></>;', 'x = void (<></>);'],
			['x = <b /> as any;', 'x = (<b />) as any;'],
			['x = <b /> satisfies T;', 'x = (<b />) satisfies T;'],
			['x = [...<b />];', 'x = [...(<b />)];'],
			['x = { ...<b /> };', 'x = { ...(<b />) };'],
			['x = <div {...<b />} />;', 'x = <div {...(<b />)} />;'],
			['x = `${<b />}`;', 'x = `${(<b />)}`;'],
			['x = a[<b />];', 'x = a[(<b />)];'],
			['x = (a, <b />);', 'x = (a, (<b />));'],
			['x = import(<b />);', 'x = import((<b />));'],
			['class A {\n  p = <b />;\n}', 'class A {\n  p = (<b />);\n}'],
			['for (const x of <b />) {\n}', 'for (const x of (<b />)) {\n}'],
			['const a = (<style>.a {}</style>).a;', 'const a = (<style>\n  .a {\n  }\n</style>).a;'],
		])('parenthesizes the element operand in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'x = <div />;',
			'x = [<b />, <i />];',
			'x = () => <b />;',
			'x = a ?? <b />;',
			'x = <b /> + 1;',
			'x = cond ? <b /> : <i />;',
			'x = { a: <b />, [<i />]: 1 };',
			'f(<a />, new F(<b />));',
			'let y = <b />;',
			'function f(a = <b />) {\n  return <b />;\n}',
			'export default <div />;',
			'x = <div c={<d />} />;',
			'async function f() {\n  await (<div />);\n}',
			'x = (<b />).props;',
			'x = (<b />)!;',
			'x = new (<b />)();',
			`function* g() {
  yield <div />;
}`,
		])('keeps the element bare or parenthesized as Prettier does in %s', async (source) => {
			await expectUnchanged(source);
		});

		// A template element is a statement of its own, with no
		// `ExpressionStatement` around it. `path.key` is the list's name
		// (`body`), not the element's index, and a directive body is always a
		// block.
		it.each([
			['a program', '<div />\n<span />'],
			['a block', 'function C() @{\n  if (x) {\n    <div />\n  }\n  <span />\n}'],
			['an if and else body', 'function C() @{\n  if (x) <div />\n  else <b />\n  <span />\n}'],
			['a case', 'function C() @{\n  switch (x) {\n    case 1:\n      <div />\n  }\n  <span />\n}'],
			[
				'a loop body',
				'function C() @{\n  for (const a of b) <div />\n  while (x) <i />\n  <span />\n}',
			],
			['a labeled statement', 'function C() @{\n  label: <div />\n  <span />\n}'],
			['a static block', 'class K {\n  static {\n    <div />\n  }\n}'],
			['a namespace', 'namespace N {\n  <div />\n}'],
			[
				'@for, @empty, @try, @pending, and @catch bodies',
				`function C() @{
  <div>
    @for (const i of items) {
      <span />
    } @empty {
      <b />
    }
    @try {
      <i />
    } @pending {
      <u />
    } @catch (e) {
      <s />
    }
  </div>
}`,
			],
		])('keeps an element bare as a statement of %s', async (_, source) => {
			await expectUnchanged(source);
		});

		it('keeps template elements, code blocks, and style blocks bare', async () => {
			await expectUnchanged(`export function Button({ label }) @{
  const theme = <style>
    .btn {
      padding: 0;
    }
  </style>;
  if (label) {
    <span />
  }
  <>
    <button class="btn">{label}</button>
    <div>
      {@{
        const a = 1;
        <b>{a}</b>
      }}
    </div>
    @if (label) {
      <i />
    } @else {
      <u />
    }
    @switch (label) {
      @case "a": {
        <p />
      }
    }
    <style>
      .btn {
        color: red;
      }
    </style>
  </>
}`);
		});

		it.each([
			'const result = new (a?.b)();',
			'const result = (a?.b)`x`;',
			'const result = (a?.b)();',
			'const result = (a?.b)!();',
			'const result = (a?.b)!.c;',
			'const result = (a?.b)<T>();',
			'const result = (a?.b.c)();',
			'const result = (a?.[k])();',
			'const result = (a?.())();',
			'const result = (a?.b)(1, 2);',
			'const result = (a?.b)()();',
			'const result = (a?.b).c;',
			'const result = (a?.b)[0];',
		])('keeps the parentheses that end an optional chain in %s', async (source) => {
			await expectUnchanged(source);
		});

		it('drops the parentheses before an optional continuation of a chain', async () => {
			const result = await format('const result = (a?.b)?.();\nconst next = (a?.b)?.c;');
			expect(result).toBeWithNewline('const result = a?.b?.();\nconst next = a?.b?.c;');
		});

		it.each([
			['const x = (a);', 'const x = a;'],
			['const y = (a.b);', 'const y = a.b;'],
			['const z = (f());', 'const z = f();'],
			['foo((a));', 'foo(a);'],
			['const v = (a) + 1;', 'const v = a + 1;'],
			['const w = (a.b)();', 'const w = a.b();'],
			['const u = !(a);', 'const u = !a;'],
			['const t = (a ? b : c);', 'const t = a ? b : c;'],
			['const s = <div class={(a)}>{(b)}</div>;', 'const s = <div class={a}>{b}</div>;'],
			['class D extends (Base) {}', 'class D extends Base {}'],
			['class D extends (Mixin(Base)) {}', 'class D extends Mixin(Base) {}'],
			['const fn = function () {}.call(null);', 'const fn = function () {}.call(null);'],
			['const seq = ((a, b)).c;', 'const seq = (a, b).c;'],
			['const body = () => (a, b);', 'const body = () => (a, b);'],
			['for (i = 0, j = 0; i < 1; i++, j++) {}', 'for (i = 0, j = 0; i < 1; i++, j++) {}'],
		])('drops redundant parentheses: %s', async (source, expected) => {
			const result = await format(source);
			expect(result).toBeWithNewline(expected);
		});

		it.each([
			['class D extends new Base() {}', 'class D extends (new Base()) {}'],
			['class D extends {} {}', 'class D extends ({}) {}'],
			['class D extends tag`x` {}', 'class D extends (tag`x`) {}'],
			['const a = x + y as string;', 'const a = (x + y) as string;'],
			['const b = a * b / c;', 'const b = (a * b) / c;'],
			['const c = a & b | c;', 'const c = (a & b) | c;'],
			['const d = a + b << c;', 'const d = (a + b) << c;'],
			['e = a ?? b ? c : d;', 'e = (a ?? b) ? c : d;'],
			['const f = -(-a);', 'const f = -(-a);'],
			['const g = - -a;', 'const g = -(-a);'],
			['f(a = 1);', 'f((a = 1));'],
			['const h = [...a ?? []];', 'const h = [...(a ?? [])];'],
			['const i = <div {...a && b} />;', 'const i = <div {...(a && b)} />;'],
		])('adds the parentheses Prettier adds: %s', async (source, expected) => {
			const result = await format(source);
			expect(result).toBeWithNewline(expected);
		});

		it.each([
			'(function () {}).call(this);',
			'(class {}).name;',
			'({}).toString.call(value);',
			'({ a } = source);',
			'const head = () => ({}).toString();',
			'export default (function () {}).call(this);',
			'const created = new (factory())();',
			'const created = new (factory().Widget)();',
			'const created = new (class {})();',
			'const called = (function () {})();',
			'const called = (() => {})();',
			'const called = (async () => {})();',
			'const tagged = (() => {})`x`;',
			'const fallback = a || (() => 1);',
			'const power = (-a) ** 2;',
			'const typed = (!a) in b;',
			'const text = (1).toString();',
			'for (i = ("key" in store) ? 1 : 0; i < 1; i++) {}',
			'const mixed = (a ?? b) || c;',
			'const other = a ?? (b || c);',
			'const regrouped = a - (b - c);',
			'(a as any) = 1;',
		])('keeps the parentheses the grammar requires in %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			'class Derived extends ({}).Base {}',
			'class Derived extends ({}).mixin(Base) {}',
			'class Derived extends ({})[0] {}',
			'class Derived extends ({}).Base! {}',
			'class Derived extends ({})`t`.Base {}',
			'const Derived = class extends ({}).Base {};',
		])(
			'keeps an object literal at the start of a superclass parenthesized in %s',
			async (source) => {
				// TypeScript reads the `{` of `extends {}.Base {}` as the class body
				await expectUnchanged(source);
			},
		);

		it('drops the parentheses around a class or function at the start of a superclass', async () => {
			const result = await format(
				'class A extends (class {}).Base {}\nclass B extends (function () {}).Base {}',
			);
			expect(result).toBeWithNewline(
				'class A extends class {}.Base {}\nclass B extends function () {}.Base {}',
			);
		});

		it.each([
			'const a = (make<T>)!;',
			'const b = (make<T>)!.value;',
			'const c = (make<T>)<U>;',
			'const d = (make<T>)<U>();',
			'const e = new (make<T>)<U>();',
			'const f = (make<T>).value;',
		])('keeps the parentheses around an instantiation expression in %s', async (source) => {
			await expectUnchanged(source);
		});

		it('drops the parentheses around an instantiation expression that is called', async () => {
			const result = await format('const a = (make<T>)();');
			expect(result).toBeWithNewline('const a = make<T>();');
		});

		// Like Prettier, which prints the ignored source in the parentheses that
		// `needsParens` decides, not the ones it was written with
		it('prints a prettier-ignored operand in the parentheses it needs', async () => {
			const result = await format(`const list = [
  // prettier-ignore
  (a   +   b),
];
const called = (
  // prettier-ignore
  a   ||   b
)();`);
			expect(result).toContain('  a   +   b,\n');
			expect(result).toContain('(a   ||   b)();');
		});

		it.each([
			['foo(/* prettier-ignore */ (a  +  b));', 'foo(/* prettier-ignore */ a  +  b);'],
			[
				'const w = [\n  // prettier-ignore\n  (b  ?  c : d),\n];',
				'const w = [\n  // prettier-ignore\n  b  ?  c : d,\n];',
			],
			['const t = /* prettier-ignore */ ((a  +  b));', 'const t = /* prettier-ignore */ a  +  b;'],
			['!(/* prettier-ignore */ a  &&  b);', '!(/* prettier-ignore */ a  &&  b);'],
			['(/* prettier-ignore */ a  =  b);', '/* prettier-ignore */ a  =  b;'],
			['({ a } = /* prettier-ignore */ (b  ||  c));', '({ a } = /* prettier-ignore */ b  ||  c);'],
			[
				'a ? /* prettier-ignore */ (b  ?  c : d) : e;',
				'a ? (/* prettier-ignore */ b  ?  c : d) : e;',
			],
			['type A = /* prettier-ignore */ (B   |   C);', 'type A = /* prettier-ignore */ B   |   C;'],
		])(
			'drops the parentheses a prettier-ignored node does not need: %s',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it('adds the parentheses a prettier-ignored node needs', async () => {
			// Without a `;`, the array is a lookup in `1` with a sequence in it
			const result = await format('let x = 1\n// prettier-ignore\n[1,  2].forEach(f)');
			expect(result).toBeWithNewline(`let x = (1)[
  // prettier-ignore
  (1,  2)
].forEach(f);`);
		});

		it.each([
			'f(/* prettier-ignore */ (a,  b));',
			'const y = /* prettier-ignore */ (a,  b);',
			'x = /* prettier-ignore */ (a  +  b) * c;',
			'const z = /* prettier-ignore */ (a  ??  b) || c;',
			'let v = /* prettier-ignore */ (a  as  B).c;',
			'const g = () => /* prettier-ignore */ ({a:  1});',
			'const h = () => /* prettier-ignore */ (a,  b);',
			'export default /* prettier-ignore */ (a,  b);',
			'x = a[/* prettier-ignore */ (b,  c)];',
			'for (/* prettier-ignore */ i = 0,  j = 0; ;) {}',
			'async function k() {\n  await /* prettier-ignore */ (a  ||  b);\n}',
			'function r() {\n  return /* prettier-ignore */ (a,  b);\n}',
		])('keeps the parentheses a prettier-ignored node needs: %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('parenthesizes a nested ternary consequent, not an alternate, like Prettier', async () => {
			const result = await format('x = a ? (b ? c : d) : e;\ny = a ? b : (c ? d : e);');
			expect(result).toBeWithNewline('x = a ? (b ? c : d) : e;\ny = a ? b : c ? d : e;');
		});

		it('preserves execution when formatting parenthesized operands', async () => {
			const operands = [
				'a || b',
				'a ?? b',
				'a + b',
				'a ? b : c',
				'a = b',
				'-a',
				'typeof a',
				'a++',
				'x => x',
				'function () {}',
				'class {}',
				'a as F',
				'a?.b',
				'a?.()',
				'new a()',
				'a()',
				'{}',
			];
			const positions = [
				(/** @type {string} */ e) => `(${e})();`,
				(/** @type {string} */ e) => `new (${e})();`,
				(/** @type {string} */ e) => `(${e})\`t\`;`,
				(/** @type {string} */ e) => `x = (${e}).p;`,
				(/** @type {string} */ e) => `x = (${e})!;`,
				(/** @type {string} */ e) => `x = (${e}) * 2;`,
				(/** @type {string} */ e) => `x = (${e}) ? 1 : 2;`,
				(/** @type {string} */ e) => `x = !(${e});`,
				(/** @type {string} */ e) => `x = [...(${e})];`,
				(/** @type {string} */ e) => `x = () => (${e});`,
			];

			for (const position of positions) {
				for (const operand of operands) {
					const source = position(operand);
					/** @type {string} */
					let expected;
					try {
						expected = await normalize(source);
					} catch {
						// Not a valid program (e.g. `new (a?.b)` inputs Prettier rejects)
						continue;
					}
					const formatted = await format(source);
					expect(await normalize(formatted), source).toBe(expected);
				}
			}
		});
	});

	describe('binary and logical expressions lay out like Prettier', () => {
		// A comment that ends the line of an operator used to lead the next
		// operand and move to a line of its own (#371)
		it.each([
			'const total =\n  first + // the base\n  second;\nconst ok =\n  isReady || // cached\n  isLoading;',
			'function f() {\n  return (\n    a + // x\n    b + // y\n    c\n  );\n}',
			'if (\n  a || // first\n  b\n) {\n  run();\n}',
			'foo(\n  first + // the base\n    second,\n);',
			'x = !(\n  cond1 || // foo\n  cond2 || // bar\n  cond3 // baz\n);',
			'const total =\n  first +\n  // own line\n  second;',
			'const total = first + /* inline */ second;',
		])('keeps the comments of %j where they are, like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'const ok = a && // first\n  b && // second\n  c;',
				'const ok =\n  a && // first\n  b && // second\n  c;',
			],
			['const x = a + /* c */\n  b;', 'const x = a /* c */ + b;'],
			['x = a ?? // fallback\n  b;', 'x =\n  a ?? // fallback\n  b;'],
			['const x = (a + // c\n  b) * c;', 'const x =\n  (a + // c\n    b) *\n  c;'],
		])(
			'keeps a comment that ends the line of an operator after it in %j',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it('parenthesizes a logical operand of another logical operator', async () => {
			const result = await format(`const z = a && b || c;
const y = a || b && c;
const q = aaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb || cccccccccccccccccccccccccc && ddddddddddddddd;`);
			expect(result).toBeWithNewline(`const z = (a && b) || c;
const y = a || (b && c);
const q =
  (aaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) ||
  (cccccccccccccccccccccccccc && ddddddddddddddd);`);
		});

		it.each([
			[
				'const ok = isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession && isOnline;',
				`const ok =
  isEnabledForTheCurrentUser &&
  hasPermissionToEdit &&
  !isLockedByAnotherSession &&
  isOnline;`,
			],
			[
				'const total = firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName;',
				`const total =
  firstOperandWithALongName +
  secondOperandWithALongName +
  thirdOperandWithALongName;`,
			],
			[
				'const value = firstFallbackWithALongName ?? secondFallbackWithALongName ?? thirdFallbackWithALongName;',
				`const value =
  firstFallbackWithALongName ??
  secondFallbackWithALongName ??
  thirdFallbackWithALongName;`,
			],
			[
				'const flags = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | ccccccccccccccccccccccccccccc;',
				`const flags =
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb |
  ccccccccccccccccccccccccccccc;`,
			],
			[
				'foo(firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName, other);',
				`foo(
  firstOperandWithALongName +
    secondOperandWithALongName +
    thirdOperandWithALongName,
  other,
);`,
			],
		])('breaks before every operand of a same-precedence chain in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks a mixed-precedence chain only at its loosest operator', async () => {
			const result = await format(`const short = a + b * c - d;
const mixed = aaaaaaaaaaaaaaaaaaaaaaa * bbbbbbbbbbbbbbbbbbbbbbbbbbb + ccccccccccccccccccccccc * dddddddddddddddd;`);
			expect(result).toBeWithNewline(`const short = a + b * c - d;
const mixed =
  aaaaaaaaaaaaaaaaaaaaaaa * bbbbbbbbbbbbbbbbbbbbbbbbbbb +
  ccccccccccccccccccccccc * dddddddddddddddd;`);
		});

		it.each([
			[
				'const f = (resolve) => aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;',
				`const f = (resolve) =>
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;`,
			],
			[
				'const x = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;',
				`const x =
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;`,
			],
			[
				'if (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) {\n  run();\n}',
				`if (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
) {
  run();
}`,
			],
			[
				'const b = Boolean(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);',
				`const b = Boolean(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
);`,
			],
		])(
			'lines up the operands where Prettier does not indent them in %s',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it('lines up the operands of an assigned value after the operator breaks', async () => {
			const result =
				await format(`total = firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName;
const options = { enabled: isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession };
class Session { ready = isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession; }`);
			expect(result).toBeWithNewline(`total =
  firstOperandWithALongName +
  secondOperandWithALongName +
  thirdOperandWithALongName;
const options = {
  enabled:
    isEnabledForTheCurrentUser &&
    hasPermissionToEdit &&
    !isLockedByAnotherSession,
};
class Session {
  ready =
    isEnabledForTheCurrentUser &&
    hasPermissionToEdit &&
    !isLockedByAnotherSession;
}`);
		});

		it.each([
			[
				'const b = !!(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);',
				`const b = !!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);`,
			],
			[
				'const b = typeof (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);',
				`const b = typeof (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);`,
			],
			[
				'const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb).length;',
				`const b = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
).length;`,
			],
			[
				'const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)();',
				`const b = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)();`,
			],
		])('breaks after the opening parenthesis in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('indents the operands of a call argument and a computed member object', async () => {
			const source = `foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  c,
);
const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)[0];`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'function g() {\n  return aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;\n}',
				`function g() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}`,
			],
			[
				'function g() {\n  throw aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;\n}',
				`function g() {
  throw (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}`,
			],
			[
				'function g() {\n  return (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa instanceof bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);\n}',
				`function g() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa instanceof
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}`,
			],
			[
				'function g() {\n  return (first ?? second);\n}',
				`function g() {
  return first ?? second;
}`,
			],
		])(
			'wraps a return or throw argument in parentheses only when it breaks in %s',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it('keeps a JSDoc cast around a broken return argument as the only parentheses', async () => {
			const source = `function g() {
  return /** @type {Foo} */ (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('statement conditions lay out like Prettier', () => {
		it.each([
			[
				'while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) {\n  step();\n}',
				`while (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
) {
  step();
}`,
			],
			[
				'do {\n  step();\n} while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);',
				`do {
  step();
} while (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);`,
			],
			[
				'while (someObject.someMethodWithAVeryLongName(argumentNumberOne, argumentNumberTwo, three)) {\n  step();\n}',
				`while (
  someObject.someMethodWithAVeryLongName(
    argumentNumberOne,
    argumentNumberTwo,
    three,
  )
) {
  step();
}`,
			],
			[
				'while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) {\n  step();\n}',
				`while (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
) {
  step();
}`,
			],
		])('moves a long condition onto its own lines in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			`if (!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)) {
  step();
}`,
			`while (!!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)) {
  step();
}`,
			`if (
  !(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  )
) {
  step();
}`,
			`while (ready && count < limit) {
  step();
}`,
		])('keeps only a negated logical condition on the keyword line in %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('sequence expressions lay out like Prettier', () => {
		it.each([
			[
				'const f = (a) => (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);',
				`const f = (a) => (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);`,
			],
			[
				'function g() {\n  return (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);\n}',
				`function g() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}`,
			],
			[
				'function g() {\n  throw (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);\n}',
				`function g() {
  throw (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}`,
			],
			[
				'firstVariableWithLongName = computeSomething(), secondVariableWithLongName = computeOther();',
				`((firstVariableWithLongName = computeSomething()),
  (secondVariableWithLongName = computeOther()));`,
			],
			[
				'foo((aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));',
				`foo(
  (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb),
);`,
			],
		])('breaks after the commas in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps a sequence that fits on one line', async () => {
			const source = `(a, b);
const f = (a) => (a, b);
for (i = 0, j = 1; i < 10; i++, j++) {
  step();
}`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Prettier prints conditional types with the ternary printer: a chain of
	// nested conditional types breaks as one group
	describe('conditional types lay out like Prettier', () => {
		it('breaks every conditional type of a chain together', async () => {
			const input = `type C<T> = T extends string ? "a" : T extends number ? "b" : T extends boolean ? "c" : T extends undefined ? "dddddddddd" : never;
type TypeEquality<T, E> = [T] extends [E] ? ([E] extends [T] ? true : false) : false;
type IsUnion<T, U = T> = (T extends any ? ([U] extends [T] ? false : true) : never) extends infer Result ? Result : never;`;
			expect(await format(input)).toBeWithNewline(`type C<T> = T extends string
  ? "a"
  : T extends number
    ? "b"
    : T extends boolean
      ? "c"
      : T extends undefined
        ? "dddddddddd"
        : never;
type TypeEquality<T, E> = [T] extends [E]
  ? [E] extends [T]
    ? true
    : false
  : false;
type IsUnion<T, U = T> = (
  T extends any ? ([U] extends [T] ? false : true) : never
) extends infer Result
  ? Result
  : never;`);
		});

		it('breaks a chain of conditional types with tabs', async () => {
			const input = `type C<T> = T extends string ? "a" : T extends number ? "b" : T extends boolean ? "c" : never;
type E<T, E> = [T] extends [E] ? ([E] extends [T] ? true : false) : false;`;
			expect(await format(input, { useTabs: true, printWidth: 40 }))
				.toBeWithNewline(`type C<T> = T extends string
	? "a"
	: T extends number
		? "b"
		: T extends boolean
			? "c"
			: never;
type E<T, E> = [T] extends [E]
	? [E] extends [T]
		? true
		: false
	: false;`);
		});

		it('breaks a conditional extends type inside its parentheses', async () => {
			const input = `type P<T> = T extends (T extends any ? ([T] extends [any] ? true : false) : never) ? "aaaaaaaaaaaaaaaaaa" : "b";`;
			expect(await format(input)).toBeWithNewline(`type P<T> = T extends (
  T extends any ? ([T] extends [any] ? true : false) : never
)
  ? "aaaaaaaaaaaaaaaaaa"
  : "b";`);
		});

		it('breaks a chain of conditional types in a return type and a mapped type', async () => {
			const input = `function f<T>(x: T): T extends string ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : T extends number ? "bbbbbbbbbbbbb" : never {}
type N<T> = { [K in keyof T]: T[K] extends Function ? K : T[K] extends object ? NNNNNNNNNNN<T[K]> : never }[keyof T];`;
			expect(await format(input)).toBeWithNewline(`function f<T>(
  x: T,
): T extends string
  ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  : T extends number
    ? "bbbbbbbbbbbbb"
    : never {}
type N<T> = {
  [K in keyof T]: T[K] extends Function
    ? K
    : T[K] extends object
      ? NNNNNNNNNNN<T[K]>
      : never;
}[keyof T];`);
		});

		it.each([
			'type A<T> = T extends (infer U extends string ? U : never) ? T : never;',
			'type Y<T> = (T extends string ? "a" : "b")[];',
			`type Z<T> = Foo<
  T extends string
    ? "aaaaaaaaaaaaaaaaaaaaaaaaaaa"
    : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  T
>;`,
			`type M<T> = keyof (T extends string
  ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");`,
			`type O<T> =
  | A
  | (T extends string
      ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");`,
			`type K<T> = T extends string
  ? // comment
    "a"
  : "b";`,
			'type L<T> = T extends string ? "a" : /* c */ T extends number ? "b" : "c";',
		])('keeps a conditional type laid out like Prettier: %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('conditional expressions lay out like Prettier', () => {
		it('keeps a nested conditional that fits on one line after return, throw, and export default', async () => {
			const source = `function pick() {
  return a ? b : c ? d : e;
}
function fail() {
  throw a ? b : c ? d : e;
}
a ? b() : c ? d() : e();
export default a ? b : c ? d : e;`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('breaks every branch of a chain that does not fit', async () => {
			const source = `const animal = isBird
  ? "bird"
  : isCat
    ? "cat"
    : isDog
      ? "dog"
      : isFish
        ? "fish"
        : "unknown animal type";`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('parenthesizes a nested consequent only on one line', async () => {
			const result = await format(
				'const value = aaaaaaaaaaaaaaaaaaaaaaaa ? (bbbbbbbbbbbbbbbbbbbbbbbbbbbb ? ccccccccccccccccccccc : ddddddddddddd) : eeeee;',
			);
			expect(result).toBeWithNewline(`const value = aaaaaaaaaaaaaaaaaaaaaaaa
  ? bbbbbbbbbbbbbbbbbbbbbbbbbbbb
    ? ccccccccccccccccccccc
    : ddddddddddddd
  : eeeee;`);
		});

		it('breaks inside the parentheses of a conditional test', async () => {
			const result = await format(
				'const value = (aaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbb : ccccccccccccccccccccccccccc) ? d : e;',
			);
			expect(result).toBeWithNewline(`const value = (
  aaaaaaaaaaaaaaaaaaaaaaaaaa
    ? bbbbbbbbbbbbbbbbbbbbbbbbbbb
    : ccccccccccccccccccccccccccc
)
  ? d
  : e;`);
		});

		it.each([
			[
				'const x = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc).prop;',
				`const x = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    : cccccccccccccccccccccccccc
).prop;`,
			],
			[
				'const x = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc).prop.call();',
				`const x = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    : cccccccccccccccccccccccccc
).prop.call();`,
			],
		])(
			'breaks before the closing parenthesis of a member object in %s',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it('aligns a broken branch with the text after `? `', async () => {
			const source = `const value = test
  ? aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  : c;`;
			expect(await format(source)).toBeWithNewline(source);
			const tabbed = `function f() {
\tconst value = test
\t\t? aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
\t\t\tbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
\t\t: c;
}`;
			expect(await format(tabbed, { useTabs: true })).toBeWithNewline(tabbed);
		});
	});

	// Like Prettier's `handleConditionalExpressionComments`, a comment on its
	// own line leads the branch after it, and one at the end of the line of
	// the node before it trails that node, before the `?` or `:` (#465)
	describe('comments after the ? or : of a conditional', () => {
		it.each([
			['const x = cond ? // why\n  a : b;', 'const x = cond // why\n  ? a\n  : b;'],
			['const x = cond\n  ? a : // why\n  b;', 'const x = cond\n  ? a // why\n  : b;'],
			['type X = A extends B ? // why\n  C : D;', 'type X = A extends B // why\n  ? C\n  : D;'],
			['type X = A extends B\n  ? C : // why\n  D;', 'type X = A extends B\n  ? C // why\n  : D;'],
			['foo(cond ? // why\n  a : b);', 'foo(\n  cond // why\n    ? a\n    : b,\n);'],
			[
				'function f() {\n  return cond ? // why\n    a : b;\n}',
				'function f() {\n  return cond // why\n    ? a\n    : b;\n}',
			],
			[
				'const x = cond ? // why\n  a : c2 ? // two\n  b : d;',
				'const x = cond // why\n  ? a\n  : c2 // two\n    ? b\n    : d;',
			],
			[
				'type X<T> = T extends string ? // str\n  "a" : T extends number ? // num\n  "b" : never;',
				'type X<T> = T extends string // str\n  ? "a"\n  : T extends number // num\n    ? "b"\n    : never;',
			],
			[
				'const x = cond ?\n  // own line\n  a : b;',
				'const x = cond\n  ? // own line\n    a\n  : b;',
			],
			[
				'const x = cond ? a :\n  // own line\n  b;',
				'const x = cond\n  ? a\n  : // own line\n    b;',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'const x = cond // why\n  ? a\n  : b;',
			'const x = cond\n  ? a // why\n  : b;',
			'const x = cond\n  ? // why\n    a\n  : b;',
			'const x = cond\n  ? a\n  : // why\n    b;',
			'const x = cond ? /* c */ a : b;',
			'const x = cond ? a /* c */ : b;',
			'const x = cond ? a : /* c */ b;',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	describe('template literal expressions stay as written', () => {
		it.each([
			'const message = `Projects: ${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.`;',
			`throw new Error(
  \`Projects select multiple platforms for \${integration}: \${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.\`,
);`,
			'const s = `${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc}`;',
			`function f() {
  const q = \`
    select * from \${table}
    where \${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}
  \`;
}`,
		])('keeps an expression written on one line on one line in %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps the line breaks of an expression written across lines', async () => {
			const source = `const s = \`\${
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
} and \${bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}\`;`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('indents a breaking expression from the template line it starts on', async () => {
			const result = await format(`const s = \`a \${foo(() => {
  return 1;
})} b\`;
function f() {
  const q = \`
    list:
    \${items.map((item) => {
      return item.name;
    })}
  \`;
}`);
			expect(result).toBeWithNewline(`const s = \`a \${foo(() => {
  return 1;
})} b\`;
function f() {
  const q = \`
    list:
    \${items.map((item) => {
      return item.name;
    })}
  \`;
}`);
		});
	});

	// Like Prettier, a line break in a template's text is a `literalline`, which
	// breaks the groups around the template
	describe('multi-line template literals break the lists around them', () => {
		it('breaks the call arguments and array around a template over several lines', async () => {
			const result = await format(`foo(\`line one
line two \${x}\`, second);
const values = [\`first
second\`, other];`);
			expect(result).toBeWithNewline(`foo(
  \`line one
line two \${x}\`,
  second,
);
const values = [
  \`first
second\`,
  other,
];`);
		});

		it.each([
			[
				'x = { a: `a\nb`, b: 1 };',
				`x = {
  a: \`a
b\`,
  b: 1,
};`,
			],
			[
				'foo(tag`a\nb ${c}`, d);',
				`foo(
  tag\`a
b \${c}\`,
  d,
);`,
			],
			['foo(\n  `first\nsecond`);', 'foo(\n  `first\nsecond`,\n);'],
			[
				'const s = cond ? `first\nsecond` : other;',
				'const s = cond\n  ? `first\nsecond`\n  : other;',
			],
			['const a = b || `x\ny`;', 'const a =\n  b ||\n  `x\ny`;'],
			[
				'function f() {\n  return `a\nb` + c;\n}',
				'function f() {\n  return (\n    `a\nb` + c\n  );\n}',
			],
			[
				'if (x) throw new Error(`line one\nline two ${value}`);',
				'if (x)\n  throw new Error(`line one\nline two ${value}`);',
			],
			['f(`a ${b(`c\nd`)} e`);', 'f(\n  `a ${b(`c\nd`)} e`,\n);'],
			// Prettier keeps only a call printed on its own on the template's line,
			// not one in a member chain
			['foo.bar(`a\nb`).baz(1);', 'foo\n  .bar(\n    `a\nb`,\n  )\n  .baz(1);'],
		])('breaks around the template in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'run(`first\nsecond`);',
			'const s = `first\nsecond`;',
			'const fn = () => `a\nb`;',
			'const x = tag`a\nb ${c}`;',
			'describe(`a\nb`, () => {});',
			'foo(`a\nb`)(c);',
			'type T = `a\n${B}`;',
		])(
			'keeps a template that starts on the line of the code before it there in %s',
			async (source) => {
				expect(await format(source)).toBeWithNewline(source);
			},
		);
	});

	// Like Prettier's JS `embed`, with `embeddedLanguageFormatting: "auto"`
	describe('code embedded in template literals formats like Prettier', () => {
		it.each([
			[
				'CSS in styled-components and GraphQL in gql templates',
				'const Button = styled.button`\ncolor:red;padding:0 4px;\n`;\nconst query = gql`\n  query { user(id: 1) { name } }\n`;',
				`const Button = styled.button\`
  color: red;
  padding: 0 4px;
\`;
const query = gql\`
  query {
    user(id: 1) {
      name
    }
  }
\`;`,
			],
			[
				'CSS in styled(Component), .attrs(), and typed tags',
				'const Link = styled(Anchor)`color:${(props) => props.color};`;\nconst Input = styled.input.attrs({ type: "text" })`border:0;`;\nconst Title = styled.h1<Props>`color: red;`;',
				`const Link = styled(Anchor)\`
  color: \${(props) => props.color};
\`;
const Input = styled.input.attrs({ type: "text" })\`
  border: 0;
\`;
const Title = styled.h1<Props>\`
  color: red;
\`;`,
			],
			[
				'CSS with placeholders, comments, and a nested css template',
				'const Box = styled.div`\n  ${Child}:hover & { color:red }\n  margin:${(props) => props.gap}px 0;\n  /* a comment */\n  ${(props) => props.active && css`font-weight:bold;`}\n`;',
				`const Box = styled.div\`
  \${Child}:hover & {
    color: red;
  }
  margin: \${(props) => props.gap}px 0;
  /* a comment */
  \${(props) =>
    props.active &&
    css\`
      font-weight: bold;
    \`}
\`;`,
			],
			[
				'CSS in styled-jsx css.global',
				'const global = css.global`body{margin:0}`;',
				`const global = css.global\`
  body {
    margin: 0;
  }
\`;`,
			],
			[
				'GraphQL in graphql(), and marked with a comment',
				'const query = graphql(schema, `{ user { ...UserParts } }`);\nconst other = /* GraphQL */ `\n  query Q { user { ...UserParts } }\n  ${fragment}\n`;',
				`const query = graphql(
  schema,
  \`
    {
      user {
        ...UserParts
      }
    }
  \`,
);
const other = /* GraphQL */ \`
  query Q {
    user {
      ...UserParts
    }
  }
  \${fragment}
\`;`,
			],
			[
				'HTML in html templates and marked with a comment',
				'const view = html`<div><p>${message}</p><span>hello</span></div>`;\nconst marked = /* HTML */ `<ul><li>one</li><li>two</li></ul>`;',
				`const view = html\`<div>
  <p>\${message}</p>
  <span>hello</span>
</div>\`;
const marked = /* HTML */ \`<ul>
  <li>one</li>
  <li>two</li>
</ul>\`;`,
			],
			[
				'Markdown in markdown templates',
				'const doc = markdown`\n  # Title\n  Some *text*   here.\n`;',
				`const doc = markdown\`
  # Title

  Some _text_ here.
\`;`,
			],
			['a whitespace-only CSS template', 'const empty = css`   `;', 'const empty = css``;'],
			[
				'a template after a line comment on its tag',
				'const t = styled.div // comment\n`color:red;`;',
				`const t = styled.div // comment
\`
  color: red;
\`;`,
			],
		])('formats %s', async (_, input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			[
				'an arrow body stays on the arrow line',
				'const f = () => css`color:red;`;',
				'const f = () => css`\n  color: red;\n`;',
			],
			[
				'a lone argument hugs the parentheses',
				'foo(css`color:red;`);\nfoo.bar(gql`query { a }`);',
				'foo(css`\n  color: red;\n`);\nfoo.bar(gql`\n  query {\n    a\n  }\n`);',
			],
			[
				'a call with a lone template on its line prints in its member chain',
				"wrapper.find('SomeSelector').first().props().style(css`\n  color: red;\n`);",
				`wrapper
  .find("SomeSelector")
  .first()
  .props()
  .style(css\`
    color: red;
  \`);`,
			],
			[
				'HTML without whitespace at its ends does not hug',
				'render(html`<div>${a}</div><span>${b}</span>`);\nrender(html` <div>${a}</div><span>${b}</span> `);',
				`render(
  html\`<div>\${a}</div>
    <span>\${b}</span>\`,
);
render(html\`
  <div>\${a}</div>
  <span>\${b}</span>
\`);`,
			],
			[
				'an HTML arrow body without whitespace at its ends breaks after the arrow',
				'const view = (items) => html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul><p>${footer}</p>`;',
				`const view = (items) =>
  html\`<ul>
      \${items.map((item) => html\`<li>\${item}</li>\`)}
    </ul>
    <p>\${footer}</p>\`;`,
			],
		])('lays out embedded code like Prettier: %s', async (_, input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			['CSS that does not parse', 'const stays = css`color:red;${x}{color:blue`;'],
			['a template with an invalid escape', 'const bad = css`color: \\u{zz};`;'],
			[
				'createGlobalStyle and keyframes, which Prettier 3.9.6 does not format',
				'const G = createGlobalStyle`body{margin:0}`;\nconst fade = keyframes`from{opacity:0}to{opacity:1}`;',
			],
			[
				'templates kept by prettier-ignore',
				'foo(/* prettier-ignore */ css`color:red;`);\n// prettier-ignore\nconst kept = gql`query { a }`;',
			],
			['a plain template in a call', 'foo(`\ncolor:red;\n`);'],
		])('keeps %s as written', async (_, source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps templates as written when embedded formatting is disabled', async () => {
			const source =
				'const Button = styled.button`\ncolor:red;padding:0 4px;\n`;\nconst f = () => css`color:red;`;\nfoo(gql`query { a }`);';
			expect(await format(source, { embeddedLanguageFormatting: 'off' })).toBeWithNewline(source);
		});

		it('formats CSS in template attributes and code blocks like the equivalent TSX', async () => {
			const input = `function StyledApp() @{
	const color = css\`
	color: red;
\`;
	<div>
		<Style />
		<div
			class={css\`
			color: red;
		\`}
		>{'styled'}</div>
		<p css={\`margin:0;padding:\${pad}px\`} />
		<style jsx>{\`div{color:green}\`}</style>
	</div>
}

function Toggle(props) @{
	@if (props.on) {
		<div class={css\`color:red;\`} />
	} @else {
		<>
			<div class="off" />
			<style>
				.off{color:blue}
			</style>
		</>
	}
}`;
			const expected = `function StyledApp() @{
	const color = css\`
		color: red;
	\`;
	<div>
		<Style />
		<div
			class={css\`
				color: red;
			\`}
		>
			{'styled'}
		</div>
		<p
			css={\`
				margin: 0;
				padding: \${pad}px;
			\`}
		/>
		<style jsx>{\`
			div {
				color: green;
			}
		\`}</style>
	</div>
}

function Toggle(props) @{
	@if (props.on) {
		<div
			class={css\`
				color: red;
			\`}
		/>
	} @else {
		<>
			<div class="off" />
			<style>
				.off {
					color: blue;
				}
			</style>
		</>
	}
}`;
			const result = await format(input, { useTabs: true, singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('member chains break like Prettier', () => {
		// A comment before the `.name` of a lookup used to print after the `.`
		// (#377). Like Prettier, it leads the lookup, and the chain breaks.
		it.each([
			'item\n  // explain the call\n  .foo()\n  .bar();\nconst x = item\n  /* note */ .foo()\n  .bar();',
			'const x = item\n  // one\n  .foo()\n  // two\n  .bar();',
			'promise\n  .then((result) => result.value)\n  // handle errors\n  .catch((error) => console.error(error));',
			'x = this\n  // c\n  .foo();',
			'obj = {\n  key: item\n    // c\n    .foo(),\n};',
			'function f() {\n  return (\n    this\n      // c\n      .foo()\n  );\n}',
			'export default item\n  // c\n  .foo();',
			'z.object({ a: 1 })\n  // c\n  .strict();',
			'x = item // c\n  .foo()\n  .bar();',
		])('keeps the comments of %j before their lookups', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['x = item.\n  // c\n  foo();', 'x = item\n  // c\n  .foo();'],
			// Outside a member chain, the lookup prints its comment before itself
			['const x = item\n  // why\n  .foo;', 'const x =\n  // why\n  item.foo;'],
			['x = a[\n  // c\n  b\n];', 'x =\n  // c\n  a[b];'],
			[
				"wrapper.find('SomeSelector')\n  // assert the prop\n  .prop('children')(1);",
				'wrapper\n  .find("SomeSelector")\n  // assert the prop\n  .prop("children")(1);',
			],
		])('prints the comment of %j before its lookup, like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps a JSDoc cast in a computed lookup with its parentheses', async () => {
			const source = `function replace(value) {
  return (
    "&" +
    characterReferences[
      /** @type {keyof typeof characterReferences} */ (value)
    ] +
    ";"
  );
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'promise.then((result) => result.value).catch((error) => console.error(error)).finally(() => done());',
				`promise
  .then((result) => result.value)
  .catch((error) => console.error(error))
  .finally(() => done());`,
			],
			[
				'const names = users.filter((user) => user.isActive).map((user) => user.name).join(", ");',
				`const names = users
  .filter((user) => user.isActive)
  .map((user) => user.name)
  .join(", ");`,
			],
			[
				'function load() {\n  return fetch(url).then((response) => response.json()).then((data) => data.items);\n}',
				`function load() {
  return fetch(url)
    .then((response) => response.json())
    .then((data) => data.items);
}`,
			],
			[
				'async function load() {\n  const data = await fetch(url).then((response) => response.json()).then((data) => data.items);\n}',
				`async function load() {
  const data = await fetch(url)
    .then((response) => response.json())
    .then((data) => data.items);
}`,
			],
			[
				'array.map((element) => element * 2).filter(Boolean)[0].toString().padStart(someWidth, "0");',
				`array
  .map((element) => element * 2)
  .filter(Boolean)[0]
  .toString()
  .padStart(someWidth, "0");`,
			],
			[
				'const handler = event.target.closest("[data-some-attribute]")?.getAttribute("data-some-attribute");',
				`const handler = event.target
  .closest("[data-some-attribute]")
  ?.getAttribute("data-some-attribute");`,
			],
		])('puts each call of a long chain on its own line in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			[
				'const schema = z.object({ name: z.string(), email: z.string().email(), age: z.number().int().positive() }).strict().optional();',
				`const schema = z
  .object({
    name: z.string(),
    email: z.string().email(),
    age: z.number().int().positive(),
  })
  .strict()
  .optional();`,
			],
			[
				'const result = Object.keys(someObjectWithALongName).filter((key) => key.startsWith("a")).map((key) => key.toUpperCase());',
				`const result = Object.keys(someObjectWithALongName)
  .filter((key) => key.startsWith("a"))
  .map((key) => key.toUpperCase());`,
			],
			[
				'd3.scaleLinear().domain([0, 100]).range([0, width]).clamp(true).nice().ticks(someTickCount);',
				`d3.scaleLinear()
  .domain([0, 100])
  .range([0, width])
  .clamp(true)
  .nice()
  .ticks(someTickCount);`,
			],
			[
				'this.server.listen(port).on("error", (error) => handleTheError(error)).on("close", () => cleanup());',
				`this.server
  .listen(port)
  .on("error", (error) => handleTheError(error))
  .on("close", () => cleanup());`,
			],
		])(
			'keeps a factory or short head on the first line only where Prettier does in %s',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it('keeps the head of a chain on the = line and breaks after = before a chain of lookups', async () => {
			const result =
				await format(`const x = aaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccc().dddddddddddddddddd().eeeeeee();
const value = someObject.someMethod().someProperty.someOtherProperty.yetAnotherProperty;`);
			expect(result).toBeWithNewline(`const x = aaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbb
  .cccccccccccccccccc()
  .dddddddddddddddddd()
  .eeeeeee();
const value =
  someObject.someMethod().someProperty.someOtherProperty.yetAnotherProperty;`);
		});

		it('keeps test and require calls on a member out of the member chain', async () => {
			const source = `describe.only("does something really interesting with the value that it receives", () => {
  run();
});
const policy =
  require.resolve("./policies/a/very/long/path/to/some/module/decompressResponsePolicy.js");`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('breaks at non-null lookups but not at non-null callees, like Prettier', async () => {
			const source = `foo.bar!(firstArgumentWithALongName).baz!(secondArgumentWithALongName).qux!(
  thirdArgumentName,
);
someObject!
  .someMethod(firstArgumentWithALongName)
  .other(secondArgumentWithALongName)
  .last(x);
promise
  .then((result) => result.value)!
  .catch((error) => console.error(error))!
  .finally(() => done());
a!.b().c();
x.y!.z();`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps short chains and chains that break inside a call on one line', async () => {
			const source = `const x = a.b().c().d();
wrapper.find("SomeSelector").prop("children")(defaultValue).toBe(1);
object.foo.bar.baz.qux();
expect(
  screen.getByRole("button", { name: "Submit the form now please" }),
).toBeInTheDocument();`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps each line comment of a chain after its own call', async () => {
			const result = await format(`const b = value.replace(a, '-') // first
  .replace(b, '_') // second
  .replace(c, '');
const c = value // first
  .trim() // second
  .toLowerCase();`);
			expect(result).toBeWithNewline(`const b = value
  .replace(a, "-") // first
  .replace(b, "_") // second
  .replace(c, "");
const c = value // first
  .trim() // second
  .toLowerCase();`);
		});

		it('keeps a blank line and a trailing comment inside a chain', async () => {
			const source = `app
  .use(express.json())

  .use(cors());
item
  .foo() // trailing
  .bar()
  .baz();`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('breaks a long chain of property lookups before its last lookup', async () => {
			const result = await format(
				'foo(someObject.someProperty.someOtherProperty.yetAnotherProperty.finalProperty.last);',
			);
			expect(result).toBeWithNewline(`foo(
  someObject.someProperty.someOtherProperty.yetAnotherProperty.finalProperty
    .last,
);`);
		});

		it('keeps a component template chain idempotent', async () => {
			const result = await format(`export function List(props) @{
  const visible = props.items.filter((item) => item.includes(props.filter)).map((item) => item.toUpperCase()).slice(0, 10);
  <ul>
    @for (const item of visible) {
      <li>{item.toUpperCase().split("").reverse().join("")}</li>
    }
  </ul>
}`);
			expect(result).toBeWithNewline(`export function List(props) @{
  const visible = props.items
    .filter((item) => item.includes(props.filter))
    .map((item) => item.toUpperCase())
    .slice(0, 10);
  <ul>
    @for (const item of visible) {
      <li>{item.toUpperCase().split("").reverse().join("")}</li>
    }
  </ul>
}`);
		});
	});

	describe('unary operands with comments print in their own parentheses', () => {
		it.each([
			['x = !/* c */ a;', 'x = !(/* c */ a);'],
			['x = !(a || b /* c */);', 'x = !(a || b /* c */);'],
			['x = typeof (/* c */ a + b);', 'x = typeof (/* c */ a + b);'],
			// Prettier keeps the operand's own parentheses inside the unary's
			['x = !(/* c */ a ? b : c);', 'x = !(/* c */ (a ? b : c));'],
			['x = -(/* c */ (a = b));', 'x = -(/* c */ (a = b));'],
			[
				'async function f() {\n  x = !/* c */ (await x);\n}',
				'async function f() {\n  x = !(/* c */ (await x));\n}',
			],
			[
				'function* g() {\n  x = !(/* c */ yield y);\n}',
				'function* g() {\n  x = !(/* c */ (yield y));\n}',
			],
		])('prints %s like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A comment after the last operand, below it, used to leave the
		// parentheses and trail the statement or lead the next node (#372)
		it.each([
			[
				'x = !(\n  (\n    ready ||\n    waiting\n  ) // why\n);',
				'x = !(\n  ready || waiting // why\n);',
			],
			['x = -(\n  a\n  // c\n);', 'x = -(\n  a\n  // c\n);'],
			['a = [\n  !(\n    b\n    // c\n  ),\n];', 'a = [\n  !(\n    b\n    // c\n  ),\n];'],
			['x = {\n  a: !(\n    b\n    // c\n  ),\n};', 'x = {\n  a: !(\n    b\n    // c\n  ),\n};'],
			[
				'foo(\n  !(\n    (\n      ready ||\n      waiting\n    ) // why\n  ),\n);',
				'foo(\n  !(\n    ready || waiting // why\n  ),\n);',
			],
		])('keeps the comment inside the parentheses of %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('breaks the parentheses around a long commented operand', async () => {
			const source = `function f() {
  return !(
    (before >= 48 /* 0 */ && before <= 57) ||
    (before >= 65 /* A */ && before <= 90) ||
    before === 36 /* $ */ ||
    before === 95 /* _ */
  );
}`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Dropping the `;` of an empty body makes the next statement the body, so the
	// formatted program runs different code and a trailing loop stops parsing.
	describe('empty statement bodies keep their semicolon', () => {
		it.each([
			'if (a);\ncount++;',
			'while (next());\ncount++;',
			'for (const k of list);\ncount++;',
			'for (const k in obj);\ncount++;',
			'for (;;);',
			'for (let i = 0; i < n; i++);\ncount++;',
			'do;\nwhile (next());',
			'if (a) b();\nelse;',
			'if (a);\nelse if (b);\nelse c();',
		])('keeps the empty body of %s', async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps the empty body with semi: false', async () => {
			const source = 'if (a);\ncount++\nwhile (next());\ndo;\nwhile (next())';
			const result = await format(source, { semi: false });
			expect(result).toBeWithNewline(source);
		});

		it('puts while on its own line after a non-block do body', async () => {
			const result = await format('do count++; while (next());');
			expect(result).toBeWithNewline('do count++;\nwhile (next());');
		});

		// The comments of an empty body print around its `;`, as in Prettier.
		// A trailing block comment used to move in front of the `;`, and the
		// next pass moved it again.
		it.each([
			['if (x) ; /* c */ else y();', 'if (x); /* c */\nelse y();'],
			['do ; /* c */ while (x);', 'do; /* c */\nwhile (x);'],
			['while (x) ; /* c */', 'while (x); /* c */'],
			['for (;;) ; /* c */', 'for (;;); /* c */'],
			['if (x) ; // c', 'if (x); // c'],
			['if (x) /* c */ ;', 'if (x) /* c */ ;'],
			['for (;;) /* c */ ;', 'for (;;) /* c */ ;'],
			['label: /* c */ ;', 'label: /* c */ ;'],
		])('keeps the comments of the empty body in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});
	});

	// Like Prettier, a body without braces stays on the header's line only
	// while the whole statement fits. A comment that starts it on its own line
	// or after a line comment moves it to its own indented line.
	describe('unbraced bodies lay out like Prettier', () => {
		it.each([
			'if (a) b();\nelse c();',
			'if (a) if (b) c();',
			'if (a) b();\nelse if (c) d();\nelse e();',
			'while (a) b();',
			'for (const x of xs) b(x);',
			'for (const k in obj) b(k);',
			'for (let i = 0; i < n; i++) b(i);',
			'do b();\nwhile (a);',
			'if (a) /* note */ b();',
		])('keeps %j on one line', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['if (a) foo(() => { x(); });', 'if (a)\n  foo(() => {\n    x();\n  });'],
			[
				'while (a) someVeryLongFunctionCallName(argument1, argument2, argument3, argument4, arg5);',
				'while (a)\n  someVeryLongFunctionCallName(\n    argument1,\n    argument2,\n    argument3,\n    argument4,\n    arg5,\n  );',
			],
			[
				'for (const item of items) process(function () { return item; });',
				'for (const item of items)\n  process(function () {\n    return item;\n  });',
			],
			[
				'if (a) b();\nelse foo(() => { x(); });',
				'if (a) b();\nelse\n  foo(() => {\n    x();\n  });',
			],
			['do foo(() => { x(); });\nwhile (a);', 'do\n  foo(() => {\n    x();\n  });\nwhile (a);'],
		])('moves the body of %j to its own line when it breaks', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			['if (a) // note\n  b();', 'if (a)\n  // note\n  b();'],
			['if (a)\n  // note\n  b();'],
			['if (a)\n  /* note */\n  b();'],
			['if (a) b();\nelse // note\n  c();', 'if (a) b();\nelse\n  // note\n  c();'],
			['while (a) // note\n  b();', 'while (a)\n  // note\n  b();'],
			['for (const x of xs) // note\n  b(x);', 'for (const x of xs)\n  // note\n  b(x);'],
			['if (a)\n// note\n{\n  b();\n}'],
			['if (a) // note\n{\n  b();\n}'],
		])('indents the body under a comment that starts it: %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected ?? source);
		});
	});

	// A comment inside a statement's parentheses stays there, as in Prettier,
	// so a JSDoc cast keeps its parentheses and its meaning.
	describe('comments in if, loop, and switch headers stay inside the parentheses', () => {
		it.each([
			'if (/** @type {Node} */ (node).end > limit) {\n  stop();\n}',
			'if (done) {\n  stop();\n} else if (/** @type {Node} */ (node).end > limit) {\n  skip();\n}',
			'if (/** @type {boolean} */ (ready)) run();',
			'if (a) run();\nelse if (/** @type {number} */ (count) > 1) stop();',
			'while (/** @type {Node} */ (node).next) {\n  step();\n}',
			'while (/** @type {boolean} */ (ready)) run();',
			'do {\n  step();\n} while (/** @type {boolean} */ (ready));',
			'switch (/** @type {Kind} */ (kind)) {\n  case 1:\n    break;\n}',
			'if (/* note */ ready) run();',
			'if (ready /* note */) run();',
			'if (a /* one */ && /* two */ b) run();',
			'do {\n  step();\n} while (/* note */ ready);',
			'if (\n  // note\n  ready\n) {\n  run();\n}',
			'switch (\n  // note\n  kind\n) {\n  case 1:\n    break;\n}',
			'while (\n  // note\n  ready\n) {\n  run();\n}',
			'do {\n  run();\n} while (\n  // note\n  ready\n);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// A comment before the `)` of a condition, on a line after it, used to
		// lead the body and print between `)` and `{` (#372)
		it.each([
			'if (\n  ready\n  // why\n) {\n  run();\n}',
			'while (\n  ready\n  // why\n) {\n  run();\n}',
			'if (\n  !(\n    ready // why\n  )\n) {\n  run();\n}',
		])('keeps the comment before the ) of %j inside the parentheses', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a comment after the parenthesized operand of a condition inside it', async () => {
			expect(
				await format(`if (
  !(
    (
      ready ||
      waiting
    ) // why
  )
) {
  run();
}`),
			).toBeWithNewline(`if (!(
  ready || waiting // why
)) {
  run();
}`);
		});

		it('moves a comment between the keyword and ( inside the parentheses', async () => {
			expect(await format('if /* note */ (ready) run();')).toBeWithNewline(
				'if (/* note */ ready) run();',
			);
		});

		it('keeps comments inside @if and @switch tests', async () => {
			const source = `export function App(props) @{
  <div>
    @if (/* note */ props.open) {
      <span />
    } @else if (/** @type {boolean} */ (props.closed)) {
      <b />
    }
    @switch (/* kind */ props.kind) {
      @case 'a': {
        <i />
      }
    }
  </div>
}`;
			expect(await format(source, { singleQuote: true })).toBeWithNewline(source);
		});

		// A comment after the `)` of the header starts the body. It used to
		// trail the condition and move inside the parentheses.
		it.each([
			'if (ready) /** @type {Api} */ (api).insert(value);',
			'while (ready) /** @type {Api} */ (api).insert(value);',
			'for (const value of values) /** @type {Api} */ (api).insert(value);',
			'for (const key in values) /** @type {Api} */ (api).insert(key);',
			'for (let i = 0; i < n; i++) /** @type {Api} */ (api).insert(i);',
			'if (a) /* note */ b();',
			'if (x) /* note */ {\n  y();\n}',
			'while (x) /* note */ {\n  y();\n}',
			'for (const v of vs) /* note */ {\n  y();\n}',
			'try {\n  x();\n} catch (error) /* note */ {\n  y();\n}',
		])('keeps a comment after the header of %j in the body', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a comment inside the parentheses of the condition', async () => {
			expect(await format('if ((a) /* note */) b();')).toBeWithNewline('if (a /* note */) b();');
		});

		it('keeps a comment after the ) of a do…while test after the statement', async () => {
			expect(await format('do x(); while (a) /* note */')).toBeWithNewline(
				'do x();\nwhile (a); /* note */',
			);
		});

		it('keeps a comment between a switch test and { inside the parentheses, like Prettier', async () => {
			expect(await format('switch (a) /* note */ {\n  case 1:\n    break;\n}')).toBeWithNewline(
				'switch (a /* note */) {\n  case 1:\n    break;\n}',
			);
		});
	});

	// A comment before `else` used to become a trailing comment of the block
	// before it, or a leading comment of the `else` branch, and print after
	// the `else` keyword.
	describe('comments before else stay before it', () => {
		it.each([
			'if (a) {\n  b();\n} // c\nelse {\n  d();\n}',
			'if (a) {\n  b();\n}\n// c\nelse {\n  d();\n}',
			'if (a) {\n  b();\n}\n\n// c\nelse {\n  d();\n}',
			'if (a) {\n  b();\n} /* c */ else {\n  d();\n}',
			'if (a) b();\n// c\nelse d();',
			'if (a) b(); /* c */\nelse d();',
			'if (a) {\n  b();\n} else if (c) {\n  d();\n}\n// e\nelse {\n  f();\n}',
			'if (a) {\n  b();\n} else /* c */ {\n  d();\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['if (a) b(); // c\nelse d();', 'if (a)\n  b(); // c\nelse d();'],
			[
				'if (a) {\n  b();\n} /* c */\nelse {\n  d();\n}',
				'if (a) {\n  b();\n} /* c */\nelse {\n  d();\n}',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it('keeps a comment before @else', async () => {
			const source = `export function App(props) @{
  <div>
    @if (props.a) {
      <b />
    }
    // c
    @else {
      <i />
    }
    @if (props.b) {
      <b />
    } // d
    @else if (props.c) {
      <i />
    }
  </div>
}`;
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Like Prettier's `handleTryStatementComments`, a comment on its own line
	// or at the end of a line before a block of a `try` moves into that block,
	// and one after a `catch` parameter trails it (#464)
	describe('comments between the blocks of a try statement', () => {
		it.each([
			[
				'try {\n  a();\n}\n// c\ncatch (e) {\n  b();\n}',
				'try {\n  a();\n} catch (e) {\n  // c\n  b();\n}',
			],
			[
				'try {\n  a();\n} // c\ncatch (e) {\n  b();\n}',
				'try {\n  a();\n} catch (e) {\n  // c\n  b();\n}',
			],
			[
				'try {\n  a();\n}\n// c\n// d\ncatch {\n  ;b();\n}',
				'try {\n  a();\n} catch {\n  // c\n  // d\n  b();\n}',
			],
			['try {\n  a();\n} // c\ncatch {\n}', 'try {\n  a();\n} catch {\n  // c\n}'],
			[
				'try {\n  a();\n} catch (e) {\n  b();\n} // c\nfinally {\n  d();\n}',
				'try {\n  a();\n} catch (e) {\n  b();\n} finally {\n  // c\n  d();\n}',
			],
			[
				'try {\n  a();\n}\n// c\nfinally {\n  d();\n}',
				'try {\n  a();\n} finally {\n  // c\n  d();\n}',
			],
			['try // c\n{\n  a();\n} catch {}', 'try {\n  // c\n  a();\n} catch {}'],
			['try\n/* c */\n{\n  a();\n} catch {}', 'try {\n  /* c */\n  a();\n} catch {}'],
			[
				'try {\n  a();\n} catch (e) // c\n{\n  b();\n}',
				'try {\n  a();\n} catch (\n  e // c\n) {\n  b();\n}',
			],
			[
				'try {\n  a();\n} catch (e)\n// c\n{\n  b();\n}',
				'try {\n  a();\n} catch (\n  e\n  // c\n) {\n  b();\n}',
			],
			[
				'try {\n  a();\n} catch\n// c\n(e) {\n  b();\n}',
				'try {\n  a();\n} catch (\n  // c\n  e\n) {\n  b();\n}',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'try /* c */ {\n  a();\n} catch {}',
			'try {\n  a();\n} /* c */ catch (e) {\n  b();\n}',
			'try {\n  a();\n} catch (/* c */ e) {\n  b();\n}',
			'try {\n  a();\n} catch (e /* c */) {\n  b();\n}',
			'try {\n  a();\n} catch (e) {\n  b();\n} /* c */ finally {\n  d();\n}',
			'try {\n  a();\n} finally /* c */ {\n  d();\n}',
			'try {\n  a();\n} catch (e) {\n  b();\n} // c',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'function A() @{\n  @try {\n    <B />\n  } // c\n  @pending {\n    <p>{"loading"}</p>\n  } @catch (e) {\n    <p>{"error"}</p>\n  }\n}',
				'function A() @{\n  @try {\n    <B />\n  } @pending {\n    // c\n    <p>{"loading"}</p>\n  } @catch (e) {\n    <p>{"error"}</p>\n  }\n}',
			],
			[
				'function A() @{\n  @try {\n    <B />\n  } @pending {\n    <p>{"loading"}</p>\n  }\n  // c\n  @catch (e) {\n    <p>{"error"}</p>\n  }\n}',
				'function A() @{\n  @try {\n    <B />\n  } @pending {\n    <p>{"loading"}</p>\n  } @catch (e) {\n    // c\n    <p>{"error"}</p>\n  }\n}',
			],
			[
				'function A() @{\n  @try {\n    <B />\n  } // c\n  @catch (e, reset) {\n  }\n}',
				'function A() @{\n  @try {\n    <B />\n  } @catch (e, reset) {\n    // c\n  }\n}',
			],
			[
				'function A() @{\n  @try {\n    <B />\n  } @catch (e, reset) // c\n  {\n    <p>{"error"}</p>\n  }\n}',
				'function A() @{\n  @try {\n    <B />\n  } @catch (\n    e,\n    reset // c\n  ) {\n    <p>{"error"}</p>\n  }\n}',
			],
		])('formats the template %j like a try statement', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});
	});

	// A comment in a function's body used to become a trailing comment of the
	// function's last parameter, or of its name when it had none.
	describe('comments in function bodies stay in the body', () => {
		it.each([
			'function named() {\n  check(value /* kept */);\n}',
			'function withParams(a, b) {\n  check(value /* kept */);\n}',
			'const anonymous = function () {\n  check(value /* kept */);\n};',
			'const arrow = (a) => {\n  check(value /* kept */);\n};',
			'class A {\n  method(a) {\n    check(value /* kept */);\n  }\n}',
			'function generic<T>() {\n  check(value /* kept */);\n}',
			'function deep(a) {\n  for (const x of xs) {\n    if (x) {\n      check(x /* kept */);\n    }\n  }\n}',
			'function f(a /* param */) {}',
			'function f(a /* one */, b /* two */) {}',
			'function f(a: string /* typed */) {}',
			'function f(\n  a, // first\n  b, // second\n) {}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// An arrow's lone parameter without parentheses used to take the body's
		// comments up to the end of the arrow
		it.each(['always', 'avoid'])(
			'keeps body comments out of an unparenthesized arrow parameter with arrowParens: %s',
			async (arrowParens) => {
				const x = arrowParens === 'always' ? '(x)' : 'x';
				for (const source of [
					`const f = ${x} => check(value /* c */);`,
					`const f = ${x} => {\n  check(value /* c */);\n};`,
					`const f = async ${x} => {\n  check(value /* c */);\n};`,
					`foo(${x} => check(value /* c */));`,
					`const f = ${x} =>\n  check(\n    value, // c\n  );`,
					`const f = ${x} => /* c */ x;`,
					`const f = ${x} =>\n  // c\n  x;`,
					`const f = async ${x} => {\n  /* c */\n};`,
				]) {
					expect(await format(source.replace(/\(x\)/g, 'x'), { arrowParens })).toBeWithNewline(
						source,
					);
				}
			},
		);

		// Like Prettier's `canPrintParamsWithoutParens`
		it('keeps the parentheses of a parameter with a comment before =>', async () => {
			expect(await format('const f = x /* c */ => x;', { arrowParens: 'avoid' })).toBeWithNewline(
				'const f = (x) /* c */ => x;',
			);
		});

		// A comment before `=>` must leave `=>` on its line: Babel parses the
		// output, and a second pass changes nothing (`format` checks that).
		// Prettier puts a line break between two comments there, before `=>`.
		it.each(['always', 'avoid'])(
			'keeps => after the comments before it with arrowParens: %s',
			async (arrowParens) => {
				for (const [source, expected] of [
					['const f = (a) /* c */ => a;', 'const f = (a) /* c */ => a;'],
					['const f = () /* c */ => a;', 'const f = () /* c */ => a;'],
					['const f = x /* c */ => x;', 'const f = (x) /* c */ => x;'],
					[
						'const f = async (a) /* b */ /* c */ => a;',
						'const f = async (a) /* b */ /* c */ => a;',
					],
				]) {
					const result = await format(source, { arrowParens });
					expect(result).toBeWithNewline(expected);
					await expect(prettier.format(result, { parser: 'babel' })).resolves.toContain('=>');
				}
			},
		);

		// No line break may come between an arrow's parameters and `=>`, so the
		// comments before `=>` are always one-line block comments. A line comment
		// or a multi-line block comment there doesn't parse, as in Babel and Node.
		it.each([
			'const f = (a) // c\n  => a;',
			'const f = () // c\n  => a;',
			'const f = (a) /* c\n */ => a;',
		])('rejects %j, which has a line break before =>', async (source) => {
			await expect(format(source)).rejects.toThrow(/Unexpected token/);
		});

		it('keeps a component body comment out of the parameter list', async () => {
			const source = `function Component(props) @{
  <div>{sum(props.items /* kept */)}</div>
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			'foo(/* none */);',
			'new Foo(/* none */);',
			'foo(\n  // none\n);',
			'foo /* callee */();',
			'foo(a, b /* last */);',
		])('keeps the comment of %j where it is, like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// The printers used to print a declaration's name as a string, dropping
	// the comments attached to it.
	describe('comments after declaration names', () => {
		it.each([
			'function f /* note */() {}',
			'const g = function h /* note */() {};',
			'function /* note */ f() {}',
			'declare function f /* note */(): void;',
			'class C /* note */ extends B {}',
			'class C /* note */ {}',
			'abstract class C /* note */ {}',
			'const e = class C /* note */ {};',
			'class /* note */ C {}',
			'enum E /* note */ {\n  A,\n}',
			'enum E {\n  A /* note */ = 1,\n  B,\n}',
			'interface I /* note */ {\n  a: 1;\n}',
			'interface I /* note */ extends J {\n  a: 1;\n}',
			'interface /* note */ I {\n  a: 1;\n}',
			'type T /* note */ = { a: 1 };',
			'type T<U> /* note */ = { a: U };',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('moves a comment between a function name and ( against the (, like Prettier', async () => {
			expect(await format('function f /* note */ (a) {}')).toBeWithNewline(
				'function f /* note */(a) {}',
			);
		});
	});

	// Like Prettier's `printTypeAnnotationProperty`, a type annotation prints
	// its own `:` (or `=>`), after its leading comments (#461)
	describe('comments before the colon of a type annotation', () => {
		it.each([
			'let x /* c */ : T = 1;',
			'function f(a /* c */ : T) {}',
			'function f(a) /* c */ : T {}',
			'const f = (a) /* c */ : T => a;',
			'const f = <T,>(a: T) /* c */ : T => a;',
			'const f = function (a) /* c */ : T {};',
			'class A {\n  m() /* c */ : T {}\n}',
			'const o = { m() /* c */ : T {} };',
			'interface I {\n  m() /* c */ : T;\n}',
			'declare function f() /* c */ : T;',
			'type F = (a /* c */ : T) => void;',
			'function f(a? /* c */ : T) {}',
			'function f(a) /* c */ : asserts a is T {}',
			'class A {\n  constructor(private a /* c */ : T) {}\n}',
			'const { a } /* c */ : T = o;',
			'function f({ a } /* c */ : T) {}',
			'const [a] /* c */ : T = o;',
			'let x: /* c */ T = 1;',
			'function f(a): /* c */ T {}',
			'const { a /* c */ }: T = o;',
			'interface I {\n  x /* c */: T;\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a line comment before the colon on its line, like Prettier', async () => {
			expect(await format('let x // c\n  : T = 1;')).toBeWithNewline('let x // c\n: T = 1;');
		});
	});

	// A comment between a class or interface heading and its body used to trail
	// the heading and print after the {, or before it on the next pass (#406).
	// Like Prettier's handleClassComments, it moves into the body.
	describe('comments in class and interface headings', () => {
		it.each([
			[
				'class A extends B // extends B\n{\n  x = 1;\n}\ninterface I extends J // extends J\n{\n  x: 1;\n}',
				'class A extends B {\n  // extends B\n  x = 1;\n}\ninterface I extends J {\n  // extends J\n  x: 1;\n}',
			],
			['class A extends B\n// c\n{\n  x = 1;\n}', 'class A extends B {\n  // c\n  x = 1;\n}'],
			['class A\n// c\n{}', 'class A {\n  // c\n}'],
			['interface I\n// c\n{}', 'interface I {\n  // c\n}'],
			['export class A extends B // c\n{}', 'export class A extends B {\n  // c\n}'],
			['export default class extends B // c\n{}', 'export default class extends B {\n  // c\n}'],
			[
				'const X = class extends B // c\n{\n  y() {}\n};',
				'const X = class extends B {\n  // c\n  y() {}\n};',
			],
			[
				'class A extends B // one\n// two\n{\n  x = 1;\n}',
				'class A extends B {\n  // one\n  // two\n  x = 1;\n}',
			],
			// With decorators, a comment in the heading trails the last one
			['@dec\nclass A extends B // c\n{}', '@dec // c\nclass A extends B {}'],
		])('moves the comment of %j like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'class A extends B /* c */ {}',
			'class A /* c */ extends B {}',
			'@dec\nclass A /* c */ extends B {}',
			'@dec\n// c\nclass A extends B {}',
			'class A extends B {\n  // c\n}',
			'class A implements B /* c */, C {}',
		])('keeps the comment of %j where it is', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// A comment before a heritage clause trails the name, the type
		// parameters, or the superclass before it, so it doesn't print after
		// `implements` or `extends`, and the heading breaks
		it.each([
			[
				'class C implements\n  // the interfaces\n  D, E {}',
				'class C\n  // the interfaces\n  implements D, E {}',
			],
			[
				'class C implements\n  // the interface\n  D {}',
				'class C\n  // the interface\n  implements D {}',
			],
			['class A extends B // c\n  implements C {}', 'class A\n  extends B // c\n  implements C {}'],
			[
				'class A extends B<T>\n  // c\n  implements C {}',
				'class A\n  extends B<T>\n  // c\n  implements C {}',
			],
			['interface I extends\n  // c\n  J, K {}', 'interface I\n  // c\n  extends J, K {}'],
		])('moves the comment of %j before the heritage clause', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'class A\n  // c\n  extends B {}',
			'class A<T>\n  // c\n  extends B {}',
			'class A // c\n  extends B {}',
			'interface I\n  // c\n  extends J {}',
			'interface I<T> // c\n  extends J {}',
			// With nothing before the clause, the comment dangles on the class,
			// which prints it before the keyword (#434)
			'const X = class\n  // c\n  implements D, E {};',
			'const X = class\n  /* c */\n  implements D, E {};',
			'const X = class\n  // c\n  // d\n  implements D, E\n{\n  x = 1;\n};',
			'const X = class\n  // c\n  implements\n    VeryLongInterfaceNameNumberOne,\n    VeryLongInterfaceNameNumberTwo,\n    VeryLongInterfaceNameNumberThree {};',
		])('keeps the comment of %j before the heritage clause', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// With one type, Prettier prints the comment after the keyword and the
		// type right after it, which comments the type out after a line comment
		// (`implements // cD`), and runs a block comment into it (`/* c */D`).
		// A line comment ends its line instead, and a block comment is followed
		// by a space, as it is when Prettier formats its output again.
		it.each([
			['const X = class\n  // c\n  implements D {};', 'const X = class implements // c\nD {};'],
			[
				'const X = class\n  /* c */\n  implements D {};',
				'const X = class implements /* c */ D {};',
			],
			[
				'const X = class\n  // c\n  implements D.E {};',
				'const X = class\n  implements // c\n  D.E {};',
			],
		])(
			'prints the comment of %j after the keyword of one heritage type',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);
	});

	// Like Prettier, whose export starts at the decorators written before it,
	// a comment between them and the class keyword trails the last decorator,
	// which prints it before `export` (#445)
	describe('comments between the decorators of an exported class and the class keyword', () => {
		it.each([
			['@dec export /* c */ class A {}', '@dec /* c */\nexport class A {}'],
			['@dec\nexport\n// c\nclass B {}', '@dec\n// c\nexport class B {}'],
			['@dec\nexport // c\nclass B {}', '@dec // c\nexport class B {}'],
			['@dec export default /* c */ class A {}', '@dec /* c */\nexport default class A {}'],
			['@dec export default /* c */ class {}', '@dec /* c */\nexport default class {}'],
			['@dec /* c */ export class A {}', '@dec /* c */\nexport class A {}'],
			['@a @b export /* c */ class A {}', '@a\n@b /* c */\nexport class A {}'],
			[
				'@dec\nexport\n/** doc */\nabstract class A {}',
				'@dec\n/** doc */\nexport abstract class A {}',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'@dec\n// c\nexport class A {}',
			'@dec\n/** doc */\nexport class A {}',
			'// c\n@dec\nexport class A {}',
			'foo();\n@dec // c\nexport class A {}',
			'@a // c\n@b\nexport class A {}',
			'@dec\nexport class /* c */ A {}',
			'export /* c */ class A {}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// These comments sit where no node took them, so the parser gave them to
	// the function, which never printed them.
	describe('comments between function parameters and bodies', () => {
		it.each([
			'function f(/* none */) {}',
			'function f(\n  // none\n) {}',
			'async function f(/* none */) {}',
			'const g = (/* none */) => {};',
			'const g = async (/* none */) => {};',
			'const o = {\n  m(/* none */) {},\n};',
			'function f(a) /* body */ {}',
			'function f(a): T /* body */ {}',
			'function f<T> /* params */() {}',
			'const g = (a) /* arrow */ => {};',
			'const g = () /* arrow */ => {};',
			'const g = (a): T /* arrow */ => {};',
			'const g = (a) /* arrow */ => a;',
			'const g = (a) => /* body */ {};',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps the comment in the empty parameter list of a class method', async () => {
			const source = 'class A {\n  m(/* none */) {\n    run();\n  }\n}';
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['function f(a) // body\n{\n  x();\n}', 'function f(a) {\n  // body\n  x();\n}'],
			['function f() // body\n{}', 'function f() {\n  // body\n}'],
		])('moves a line comment before the body of %j into it', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});
	});

	// A stray `;` in a class body isn't a node, so the member before it used
	// to miss the comment after it, which then led the next member.
	describe('comments after a stray semicolon in a class body', () => {
		it.each([
			['class A {\n  a = 1; ; // c\n  b = 2;\n}', 'class A {\n  a = 1; // c\n  b = 2;\n}'],
			['class A {\n  a = 1;;; // c\n  b = 2;\n}', 'class A {\n  a = 1; // c\n  b = 2;\n}'],
			['class A {\n  m() {}; // c\n  b = 2;\n}', 'class A {\n  m() {} // c\n  b = 2;\n}'],
			['class A {\n  a = 1;\n  ; // c\n  b = 2;\n}', 'class A {\n  a = 1; // c\n  b = 2;\n}'],
			['class A {\n  a = 1; ; // c\n}', 'class A {\n  a = 1; // c\n}'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'class A {\n  a = 1;\n  // c\n  b = 2;\n}',
			'class A {\n  a = 1;\n\n  // c\n  b = 2;\n}',
			'class A {\n  // c\n  b = 2;\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// The parser visited an element's children before its opening tag, and a
	// tag's attributes before its name, so a comment in an attribute held up
	// the comments after it until the closing tag took them.
	describe('comments in JSX opening tags and children stay there', () => {
		it.each([
			'const el = <div title={/* a */ title}>{/* b */ label}</div>;',
			'const el = <div title={title /* a */}>{label /* b */}</div>;',
			'const el = <b title={/** @type {X} */ (title)}>{/** @type {X} */ (label)}</b>;',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps every comment of nested elements with attributes', async () => {
			const source = `export function App() @{
  <div a={/* a */ x} b={/* b */ y}>
    <span c={/* c */ z}>{/* d */ w}</span>
    {/* e */ v}
  </div>
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			'function App() {\n  return (\n    <div a="1" /* c */ b="2">\n      test\n    </div>\n  );\n}',
			'function App() {\n  return (\n    <div {...props} /* c */ a="1">\n      test\n    </div>\n  );\n}',
			'function App() {\n  return (\n    <div\n      a="1"\n      // c\n    >\n      test\n    </div>\n  );\n}',
			'function App() {\n  return (\n    <div // c\n      a="1"\n    >\n      test\n    </div>\n  );\n}',
			'function App() {\n  return (\n    <div\n      something="test" // after\n    >\n      test\n    </div>\n  );\n}',
			'function App() {\n  return (\n    <div\n      a="1"\n      // c\n    />\n  );\n}',
			'function App() {\n  return </* c */ div>test</div>;\n}',
			'function App() {\n  return </* a */ /* b */ div a="1" />;\n}',
			'function App() {\n  return </* c */>test</>;\n}',
			'function App() {\n  return (\n    <\n      // c\n    >\n      test\n    </>\n  );\n}',
		])('keeps the comment in the opening tag of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier, a comment between `<` and the tag name, or between a
		// fragment's `<` and `>`, stays there.
		it.each([
			[
				'function App() {\n  return <\n    /* c */ div\n  >test</div>;\n}',
				'function App() {\n  return </* c */ div>test</div>;\n}',
			],
			['const a = <\n  // c\n>\n  x\n</>;', 'const a = (\n  <\n    // c\n  >\n    x\n  </>\n);'],
		])('keeps the comment after the `<` of %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A line comment before the tag name, or a block comment on a line of its
		// own, starts on the line after the `<`: right after it, `<//` would read
		// as a closing tag in TSX, and the block comment would join the `<`'s line
		// on the next format. (Prettier prints both right after the `<`.)
		it.each([
			'function App() {\n  return (\n    <\n      // c\n      div\n      a="1"\n    >\n      test\n    </div>\n  );\n}',
			'function App() {\n  return (\n    <\n      // c\n      // d\n      Foo.Bar\n    />\n  );\n}',
			'function App() {\n  return (\n    <\n      // c\n      Foo<T>\n    />\n  );\n}',
			'function App() {\n  return (\n    <\n      // c\n      {Tag}\n    >\n      test\n    </{Tag}>\n  );\n}',
			'function App() {\n  return (\n    <\n      /* c */\n      div\n    />\n  );\n}',
			'function App() @{\n  <\n    // c\n    div\n  >\n    test\n  </div>\n}',
		])('starts a line comment before the tag name of %j on its own line', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'const a = <// c\ndiv id="x" title="y" />;',
				'const a = (\n  <\n    // c\n    div\n    id="x"\n    title="y"\n  />\n);',
			],
			[
				'const a = < // c\n  Foo>x</Foo>;',
				'const a = (\n  <\n    // c\n    Foo\n  >\n    x\n  </Foo>\n);',
			],
			['const a = <\n  /* c */\n  div />;', 'const a = (\n  <\n    /* c */\n    div\n  />\n);'],
		])('moves a line comment after the `<` of %j to its own line', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it('joins an operator on the next line to the element it continues, like Prettier', async () => {
			const source = '<div />\n+ 1;\n\nfunction f() {\n  <div />\n  > 5;\n}';
			expect(await format(source)).toBeWithNewline(
				'<div /> + 1;\n\nfunction f() {\n  <div /> > 5;\n}',
			);
			expect(await format(source, { semi: false })).toBeWithNewline(
				';<div /> + 1\n\nfunction f() {\n  ;<div /> > 5\n}',
			);
		});
	});

	// A spread child (`{...children}`) prints like an expression container
	// child. Like Prettier, the comments of its expression print around the
	// `...` inside the braces.
	// TSRX reports spread children (`{...children}`) as unsupported, but they
	// parse, so the formatter prints them like Prettier's JSX spread printer:
	// the expression's comments go inside the braces around the `...`.
	describe('JSX spread children', () => {
		it.each([
			'const x = <div>{...a}</div>;',
			'function f() {\n  return <div>{...children}</div>;\n}',
			'const x = <div>text {...a} more</div>;',
			'const x = <>{...a}</>;',
			'const x = <div>{/* c */ ...a}</div>;',
			'const x = <div>{...a /* c */}</div>;',
			'const x = <div>{.../** @type {any[]} */ (a)}</div>;',
			'export function App({ items }: { items: any[] }) @{\n  <div>{...items}</div>\n}',
			'export function App({ items }: { items: any[] }) @{\n  <div>\n    {...items}\n    <span />\n  </div>\n}',
			'export function App({ items }: { items: any[] }) @{\n  <>{...items}</>\n}',
			'export function App({ items }: { items: any[] }) @{\n  <div>\n    // before\n    {...items}\n  </div>\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['const x = <div>{... /* c */ a}</div>;', 'const x = <div>{/* c */ ...a}</div>;'],
			[
				'const x = <div>{// c\n...a}</div>;',
				'const x = (\n  <div>\n    {\n      // c\n      ...a\n    }\n  </div>\n);',
			],
			[
				'const x = <div>{...a // c\n}</div>;',
				'const x = (\n  <div>\n    {\n      ...a // c\n    }\n  </div>\n);',
			],
			[
				'const x = <div>{...a}{...b}</div>;',
				'const x = (\n  <div>\n    {...a}\n    {...b}\n  </div>\n);',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});
	});

	// Like Prettier's `printLeadingComment`, a block comment keeps what follows
	// it on its line. The formatter used to break the line after every block
	// comment but the last one before a node.
	describe('block comments that share a line', () => {
		it.each([
			'/* a */ /* b */ run();',
			'const v = /* a */ /* b */ x;',
			'function f() {\n  return /* a */ /* b */ x;\n}',
			'function f() {\n  throw /* a */ /* b */ new Error();\n}',
			'const a = [/* a */ /* b */ 1, 2];',
			'call(/* a */ /* b */ x);',
			'/* a */ /* b */\nrun();',
			'/* a */\n/* b */ run();',
			'/* a */\n\n/* b */ run();',
			'const v = /** @type {A} */ (/** @type {B} */ (x));',
			'/** @type {A} */ /** @type {B} */ (x).y();',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('joins a value to a comment that ends the line after = when it fits', async () => {
			expect(await format('const x = /* c */\n  5;')).toBeWithNewline('const x = /* c */ 5;');
		});

		// A statement used to take only the first comment after it on its line
		it.each([
			'{\n  a(); /* c */ /* d */\n  b();\n}',
			'const x = 1; /* c */ /* d */\nconst y = 2;',
			'a(); /* c */ // d\nb();',
		])('keeps every comment after %j on its line', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Like Prettier, which ends a statement before its `;`, a comment between
	// the two prints after the `;`. One before a `;` on the next line used to
	// trail the expression inside and break the unbraced body around it.
	describe("comments before a statement's semicolon", () => {
		it.each([
			['const x = 1 /* c */;', 'const x = 1; /* c */'],
			['foo() /* c */;', 'foo(); /* c */'],
			['function f() {\n  return x /* c */;\n}', 'function f() {\n  return x; /* c */\n}'],
			['let x = 1 // c\n;', 'let x = 1; // c'],
			['if (a) return -1 // c\n;\nb();', 'if (a) return -1; // c\nb();'],
			['while (a) foo() // c\n;', 'while (a) foo(); // c'],
			[
				'function f() {\n  return x // a\n  // b\n  ;\n}',
				'function f() {\n  return x; // a\n  // b\n}',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Prettier prints these with the comment before the `;` and moves it
		// after the `;` on the next pass. The formatter prints the fixpoint.
		it.each([
			['function f() {\n  return (a /* c */);\n}', 'function f() {\n  return a; /* c */\n}'],
			['x = (a /* c */);', 'x = a; /* c */'],
			['export default (a /* c */);', 'export default a; /* c */'],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'import /* a */ Alias /* b */ = /* c */ Foo /* d */;',
			'if (x) /* c */ ;',
			'class A {\n  a = 1; // c\n  b = 2;\n}',
			'foo(a /* c */);',
			'x = foo(a /* c */);',
			'do x();\nwhile (a /* c */);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Like Prettier's `printIndentableBlockComment`, a multi-line block comment
	// whose lines all start with `*` takes the indentation of where it prints.
	// Any other block comment prints as written.
	describe('multi-line block comments keep their indentation', () => {
		it.each([
			'function save() {\n  if (dirty) {\n    /*\n     * Flush before closing.\n     */\n    flush();\n  }\n}',
			'class A {\n  /**\n   * Doc.\n   * @param {string} a\n   */\n  m(a) {}\n}',
			'const o = {\n  /**\n   * Doc.\n   */\n  a: 1,\n};',
			'function f() {\n  const x = 1; /*\n   * trailing\n   */\n  return x;\n}',
			'function save() {\n  if (dirty) {\n    /* not\n       indentable\n         at all */\n    flush();\n  }\n}',
			'function f() {\n  /**\n   * Markdown break  \n   * next line\n   */\n  x();\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('lines up a misaligned comment under its first line', async () => {
			const source =
				'function save() {\n  if (dirty) {\n      /*\n         * Misaligned.\n             */\n    flush();\n  }\n}';
			expect(await format(source)).toBeWithNewline(
				'function save() {\n  if (dirty) {\n    /*\n     * Misaligned.\n     */\n    flush();\n  }\n}',
			);
		});

		it('reindents a comment in a template expression container', async () => {
			const source = `export function App() @{
  <div>
    {/*
      * inside
      */}
  </div>
}`;
			expect(await format(source)).toBeWithNewline(`export function App() @{
  <div>
    {/*
     * inside
     */}
  </div>
}`);
		});
	});

	// The parser used the cases as the discriminant's siblings, so with no
	// cases it took the body's comments and printed them in the parentheses.
	describe('comments in a switch with no cases', () => {
		it.each([
			'switch (x) {\n  // a\n}',
			'switch (x) {\n  /* a */\n}',
			'switch (x) {\n  // a\n  // b\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a comment between ) and { inside the parentheses, like Prettier', async () => {
			expect(await format('switch (x) /* c */ {\n}')).toBeWithNewline('switch (x /* c */) {\n}');
		});
	});

	// `yield` ends at a line break, like `return`, so an argument that starts
	// with a comment ending its line keeps its parentheses. Prettier drops
	// them here and yields `undefined`.
	describe('yield arguments that start with a comment', () => {
		it.each([
			'function* values() {\n  yield (\n    // the next value\n    42\n  );\n}',
			'function* values() {\n  yield (\n    /* own line */\n    42\n  );\n}',
			'function* values() {\n  const x = yield (\n    // pick one\n    a || b\n  );\n}',
		])('keeps the parentheses of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps the parentheses when the comment belongs to the leftmost operand', async () => {
			const source = 'function* values() {\n  yield (\n    // the next value\n    a\n  ).b;\n}';
			expect(await format(source)).toBeWithNewline(
				'function* values() {\n  yield (\n    // the next value\n    a.b\n  );\n}',
			);
		});

		it.each([
			'function* values() {\n  yield /* inline */ 42;\n}',
			'function* values() {\n  yield* // delegate\n  other();\n}',
		])('prints %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// Like Prettier's `printJsxElement`, an element prints its comments inside
	// its own parentheses, and a comment that breaks the line breaks them onto
	// lines of their own. The element used to print right after a `return`,
	// `throw`, `yield`, or `await` with the comment in between, so the
	// statement ended at the comment and returned `undefined` (#456). Each case
	// also parses the output and checks that the syntax tree is unchanged.
	describe('elements print comments that break the line inside their parentheses', () => {
		const positionKeys = new Set([
			'start',
			'end',
			'loc',
			'range',
			'metadata',
			'leadingComments',
			'trailingComments',
			'innerComments',
			'comments',
		]);

		/**
		 * The syntax tree without positions, comments, or parser metadata.
		 * @param {string} code
		 */
		const parseShape = (code) =>
			JSON.stringify(parsers?.tsrx.parse(code, /** @type {any} */ ({})), (key, value) =>
				positionKeys.has(key) ? undefined : value,
			);

		/**
		 * @param {string} input
		 * @param {string} [expected]
		 */
		const expectFormatted = async (input, expected = input) => {
			const output = await format(input);
			expect(output).toBeWithNewline(expected);
			expect(parseShape(output)).toBe(parseShape(input));
		};

		it.each([
			'function g() {\n  return (\n    // note\n    <Note />\n  );\n}',
			'function g() {\n  throw (\n    // note\n    <Note />\n  );\n}',
			'function g() {\n  return (\n    /* note */\n    <Note />\n  );\n}',
			'function g() {\n  return (\n    // note\n    <>\n      <a />\n    </>\n  );\n}',
			'function g() {\n  throw (\n    /* note */\n    <>\n      <a />\n    </>\n  );\n}',
			'function g() {\n  return (\n    // note\n    <div>\n      @if (x) {\n        <a />\n      }\n    </div>\n  );\n}',
			'function* g() {\n  yield (\n    // note\n    <Note />\n  );\n}',
			'async function g() {\n  await (\n    // note\n    <Note />\n  );\n}',
			'export default (\n  // note\n  <Note />\n);',
			'x = a && (\n  // note\n  <Note />\n);',
			'function g() {\n  return (\n    // note\n    <Note />\n  ).props;\n}',
			'function g() {\n  return (// note\n  <Note />)();\n}',
			'function g() {\n  return (\n    // note\n    /** @type {X} */ (<Note />)\n  );\n}',
			// A block comment over several lines on the element's line
			'function g() {\n  return (\n    /**\n     * note\n     */ <Note />\n  );\n}',
			'function g() {\n  throw (\n    /* note\n    more */ <Note />\n  );\n}',
			'function* g() {\n  yield (\n    /**\n     * note\n     */ <></>\n  );\n}',
		])('keeps %j', async (source) => {
			await expectFormatted(source);
		});

		it.each([
			'const x = (\n  <Note />\n  // note\n);',
			'const x = (\n  <Note />\n  /* note */\n);',
			'x = a && (\n  <Note /> // note\n);',
			'x = a && (\n  <Note /> /* note\n  more */\n);',
		])('keeps the trailing comment inside the parentheses in %j', async (source) => {
			await expectFormatted(source);
		});

		it.each([
			[
				'function g() {\n  return ( // note\n    <Note />\n  );\n}',
				'function g() {\n  return (\n    // note\n    <Note />\n  );\n}',
			],
			[
				'function g() {\n  return (\n    (\n      // note\n      <Note />\n    )\n  );\n}',
				'function g() {\n  return (\n    // note\n    <Note />\n  );\n}',
			],
			[
				'function g() {\n  throw (\n    (\n      /* note */\n      <Note />\n    )\n  );\n}',
				'function g() {\n  throw (\n    /* note */\n    <Note />\n  );\n}',
			],
			[
				'function g() {\n  return (\n    // note\n    (<Note />)\n  );\n}',
				'function g() {\n  return (\n    // note\n    <Note />\n  );\n}',
			],
			[
				'function* g() {\n  yield (\n    (\n      /* note */\n      <></>\n    )\n  );\n}',
				'function* g() {\n  yield (\n    /* note */\n    <></>\n  );\n}',
			],
			['const f = () =>\n  // note\n  <Note />;', 'const f = () => (\n  // note\n  <Note />\n);'],
			[
				'const f = (a) => (b) =>\n  // note\n  <Note />;',
				'const f = (a) => (b) => (\n  // note\n  <Note />\n);',
			],
			['const x =\n  // note\n  <Note />;', 'const x = (\n  // note\n  <Note />\n);'],
			[
				'x = {\n  a:\n    // note\n    <Note />,\n};',
				'x = {\n  a: (\n    // note\n    <Note />\n  ),\n};',
			],
			[
				'class A {\n  x =\n    // note\n    <Note />;\n}',
				'class A {\n  x = (\n    // note\n    <Note />\n  );\n}',
			],
			[
				'function g() {\n  return (\n    (\n      // note\n      <Note />\n    ).props\n  );\n}',
				'function g() {\n  return (\n    // note\n    <Note />\n  ).props;\n}',
			],
			[
				'function g() {\n  return (\n    (\n      // note\n      <Note />\n    )()\n  );\n}',
				'function g() {\n  return (// note\n  <Note />)();\n}',
			],
			[
				'function g() {\n  return (/**\n   * note\n   */ <Note />);\n}',
				'function g() {\n  return (\n    /**\n     * note\n     */ <Note />\n  );\n}',
			],
			[
				'const f = () => (/**\n * note\n */ <Note />);',
				'const f = () => (\n  /**\n   * note\n   */ <Note />\n);',
			],
		])('prints %j like Prettier', async (input, expected) => {
			await expectFormatted(input, expected);
		});

		it('keeps the elements of a component body', async () => {
			await expectFormatted(
				'function C() @{\n  const render = () =>\n    // note\n    <a />;\n  function other() {\n    return (\n      // note\n      <b />\n    );\n  }\n  // note\n  <div>{render()}</div>\n}',
				'function C() @{\n  const render = () => (\n    // note\n    <a />\n  );\n  function other() {\n    return (\n      // note\n      <b />\n    );\n  }\n  // note\n  <div>{render()}</div>\n}',
			);
		});

		// Prettier prints these without parentheses around the element
		it.each([
			'function g() {\n  return /* note */ <Note />;\n}',
			'foo(\n  // note\n  <Note />,\n);',
			'const x = [\n  // note\n  <Note />,\n];',
			'const x =\n  // note\n  /** @type {X} */ (<Note />);',
			'x = a && <Note />; // note',
			'const x = <Note />; /* note */',
			'function C() @{\n  const a = 1;\n  <>\n    @if (a) {\n      // note\n      <a />\n    }\n    // note\n    <b />\n  </>\n}',
		])('prints %j without parentheses of its own', async (source) => {
			await expectFormatted(source);
		});
	});

	// A labeled statement used to print as an `Unknown` comment, deleting the
	// loop or block it labels.
	describe('labeled statements', () => {
		it('keeps labeled loops and blocks', async () => {
			const source = `outer: for (const row of rows) {
  for (const cell of row) {
    if (cell) continue outer;
  }
}
block: {
  break block;
}
label:;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it.each([
			'a: b: while (true) break a;',
			'loop: do {\n  continue loop;\n} while (next());',
			'check: if (a) {\n  break check;\n}',
			'attempt: try {\n  break attempt;\n} finally {\n  done();\n}',
			'count: n++;',
			'switch (x) {\n  case 1:\n    inner: for (;;) break inner;\n}',
		])('keeps the labeled statement %s', async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps labels with semi: false', async () => {
			const source = 'outer: for (;;) {\n  continue outer\n}\nlabel:;';
			const result = await format(source, { semi: false });
			expect(result).toBeWithNewline(source);
		});

		it('expands an empty labeled block like Prettier', async () => {
			const result = await format('empty: {}');
			expect(result).toBeWithNewline('empty: {\n}');
		});

		it('keeps a labeled loop in a component body', async () => {
			const source = `function Grid({ rows }) @{
  let first = -1;
  outer: for (const row of rows) {
    for (const cell of row) {
      if (cell > 0) {
        first = cell;
        break outer;
      }
    }
  }
  <div>{first}</div>
}`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('moves a comment that starts or ends its line above the label', async () => {
			const input = `a: // empty
;
b: // loop

for (;;) {
  break b;
}
c:
// call
run();
// lead
d: // one

// two
while (next()) {
  break d;
}`;
			const expected = `// empty
a:;
// loop

b: for (;;) {
  break b;
}
// call
c: run();
// lead
// one

// two
d: while (next()) {
  break d;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps an inline comment on its side of the colon', async () => {
			const source = `a /* before */: for (;;) {
  break a;
}
b: /* after */ run();
c: /* empty */ ;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps an own-line block comment on the label line when the body follows it', async () => {
			const result = await format('a:\n/* call */ run();');
			expect(result).toBeWithNewline('/* call */ a: run();');
		});

		it('keeps the source of a statement whose label is followed by prettier-ignore', async () => {
			const source = `a: // prettier-ignore
for (  ;; ) {  break a }
b:   for (;;) {  break b }`;
			const result = await format(source);
			expect(result).toBeWithNewline(`a: // prettier-ignore
for (  ;; ) {  break a }
b: for (;;) {
  break b;
}`);
		});
	});

	describe('variable initializer layouts follow Prettier', () => {
		it.each([
			'const g = a || b ? c : d;',
			'const i = a > 1 ? b : c;',
			'const x = a ? (b ? c : d) : e;',
			'const y = a ? b : c ? d : e;',
			'const w = cond ? call(argumentOne, argumentTwo) : other;',
		])('keeps the short conditional initializer %s on one line', async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('breaks after = before a conditional with a binary test', async () => {
			const source = `const z =
  isSomethingVeryLong || otherCondition
    ? someVeryLongValueNameHere
    : anotherLongValue;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps any other conditional test on the = line', async () => {
			const source = `const v = cond
  ? call(argumentOne, argumentTwo, argumentThree, argumentFour)
  : otherValueHere;
const u = cond
  ? () => {
      run();
    }
  : null;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});
	});

	// Like Prettier's `printVariableDeclaration`: once a declarator has a value,
	// every declarator after the first starts its own line.
	describe('declarations with several declarators', () => {
		it('puts each declarator on its own line once one has a value', async () => {
			const input = `const a = 1, b = 2, c = 3;
var g = 1, h;
export const i = 1, j = 2;
let x = {
  a: 1,
}, y = [1, 2];`;
			const expected = `const a = 1,
  b = 2,
  c = 3;
var g = 1,
  h;
export const i = 1,
  j = 2;
let x = {
    a: 1,
  },
  y = [1, 2];`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks declarators without values only when they do not fit', async () => {
			const input = `let d, e, f;
declare const k: string, l: number;
let aaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccccc;`;
			const expected = `let d, e, f;
declare const k: string, l: number;
let aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccccc;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a line comment after a declarator in place', async () => {
			const source = `const first = 1, // one
  second = 2;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		// Prettier ignores a statement that a `prettier-ignore` comment trails
		it('keeps a declaration with a trailing prettier-ignore comment as written', async () => {
			const source = `function g(a, x) {
  const Xl = msg[x], Xh = msg[x + 1]; // prettier-ignore
  let Al = BBUF[2 * a],   Ah = BBUF[2 * a + 1]; // prettier-ignore
}
export const b = 1,   c = 2; // prettier-ignore
let   q = [1,2,
  3]; // prettier-ignore`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps the comments between declarators in order', async () => {
			const source = `var a, // first
  // second
  b;
var c = 1, // first
  // second
  d = 2;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps the declarators of a for head on one line while they fit', async () => {
			const source = `for (let i = 0, j = 10; i < j; i++) {
  run(i, j);
}`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});
	});

	// Prettier's `chooseLayout` picks one layout for declarators, assignments,
	// class fields, object properties, and type aliases.
	describe('assignment layouts follow Prettier', () => {
		it('breaks after = before a string or a member chain that does not fit', async () => {
			const input = `const message = "a long string value that does not fit on one line with the declaration";
class A {
  static message = "a long string value that does not fit on one line with the field";
}
const value = someObject.someProperty.anotherProperty.yetAnotherProperty.finalProp;
message = "a long string value that does not fit on one line with the assignment exp";`;
			const expected = `const message =
  "a long string value that does not fit on one line with the declaration";
class A {
  static message =
    "a long string value that does not fit on one line with the field";
}
const value =
  someObject.someProperty.anotherProperty.yetAnotherProperty.finalProp;
message =
  "a long string value that does not fit on one line with the assignment exp";`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks after = before an awaited, negated, or short-argument call chain', async () => {
			const input = `const entries = await someObject.someProperty.anotherProperty.collectAllEntries();
const negated = !someObject.someProperty.anotherProperty.yetAnotherProperty.flag;
const count = someObject.someProperty.anotherProperty.yetAnotherProperty.count(id);`;
			const expected = `const entries =
  await someObject.someProperty.anotherProperty.collectAllEntries();
const negated =
  !someObject.someProperty.anotherProperty.yetAnotherProperty.flag;
const count =
  someObject.someProperty.anotherProperty.yetAnotherProperty.count(id);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks after : or = before a binary value without indenting it twice', async () => {
			const input = `const options = {
  description: someVeryLongVariableNameNumberOne + someVeryLongVariableNameNumberTwoooooooo,
};
class A {
  description = someVeryLongVariableNameNumberOne + someVeryLongVariableNameNumberTwoooooooo;
}`;
			const expected = `const options = {
  description:
    someVeryLongVariableNameNumberOne +
    someVeryLongVariableNameNumberTwoooooooo,
};
class A {
  description =
    someVeryLongVariableNameNumberOne +
    someVeryLongVariableNameNumberTwoooooooo;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks after : or = before a logical value without indenting it twice', async () => {
			const input = `class A {
  enabled = someVeryLongVariableNameNumberOne && someVeryLongVariableNameNumberTwoooooooo;
}
const options = {
  enabled: someVeryLongVariableNameNumberOne || someVeryLongVariableNameNumberTwoooooooo,
};
options.enabled = someVeryLongVariableNameNumberOne ?? someVeryLongVariableNameNumberTwoooooooooo;
const enabled = someVeryLongVariableNameNumberOne && someVeryLongVariableNameNumberTwoooooooooooo;`;
			const expected = `class A {
  enabled =
    someVeryLongVariableNameNumberOne &&
    someVeryLongVariableNameNumberTwoooooooo;
}
const options = {
  enabled:
    someVeryLongVariableNameNumberOne ||
    someVeryLongVariableNameNumberTwoooooooo,
};
options.enabled =
  someVeryLongVariableNameNumberOne ??
  someVeryLongVariableNameNumberTwoooooooooo;
const enabled =
  someVeryLongVariableNameNumberOne &&
  someVeryLongVariableNameNumberTwoooooooooooo;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a value that can break by itself on the operator line', async () => {
			const source = `const result = someFunction(
  argumentNumberOne,
  argumentNumberTwo,
  argumentNumber3,
);
const greeting = \`a long template literal value that does not fit on one line \${name}\`;
const options = {
  id: "a long string value that does not fit on one line with the short key",
};
const {
  aaaaaaaaaa,
  bbbbbbbbbb = 1,
  cccccccccc: renamed,
} = someObject.withSomeProperty;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('lays out a chain of three or more assignments', async () => {
			const input = `window.aaaaaaaaaaaaaaaaaa = window.bbbbbbbbbbbbbbbbbbbbbbbb = window.cccccccccccccccccccc = someValue;
a = b = c;`;
			const expected = `window.aaaaaaaaaaaaaaaaaa =
  window.bbbbbbbbbbbbbbbbbbbbbbbb =
  window.cccccccccccccccccccc =
    someValue;
a = b = c;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks a type alias inside its type when the type can break', async () => {
			const input = `type T = Foo<aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc>;
type Pair<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccccccccccccc> = Foo<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa>;
type Props = BaseProps & { children: string; onClick: () => void; className: string };`;
			const expected = `type T = Foo<
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
>;
type Pair<
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccccccccccccc,
> = Foo<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa>;
type Props = BaseProps & {
  children: string;
  onClick: () => void;
  className: string;
};`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks a type alias after = before a union or a generic conditional type', async () => {
			const input = `type Choice = "aaaaaaaaaaaaaaaaaaaa" | "bbbbbbbbbbbbbbbbbbbbbbbb" | "cccccccccccccccccccccccccc";
type Unwrapped<T> = T extends Promise<infer U> ? UnwrapTheValueOfThisPromise<U> : NotAPromise<T>;
type Checked<T> = T extends string ? SomeVeryLongTypeNameForStrings<T> : SomeOtherVeryLongType<T>;`;
			const expected = `type Choice =
  | "aaaaaaaaaaaaaaaaaaaa"
  | "bbbbbbbbbbbbbbbbbbbbbbbb"
  | "cccccccccccccccccccccccccc";
type Unwrapped<T> =
  T extends Promise<infer U> ? UnwrapTheValueOfThisPromise<U> : NotAPromise<T>;
type Checked<T> = T extends string
  ? SomeVeryLongTypeNameForStrings<T>
  : SomeOtherVeryLongType<T>;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		// Prettier keeps a JSDoc cast's parentheses as a node of their own, so
		// the cast value lays out like any parenthesized value: it stays on the
		// operator's line and breaks inside its parentheses.
		it('keeps a JSDoc-cast value on the operator line and breaks inside its parentheses', async () => {
			const input = `const x = /** @type {Foo} */ (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
const sum = /** @type {number} */ (firstValueWithALongName + secondValueWithALongName + third);
y = /** @type {Foo} */ (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
const obj = { key: /** @type {Foo} */ (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) };
class A { field = /** @type {Foo} */ (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb); }
const message = /** @type {string} */ ("a long string value that does not fit on one line with the declaration");
const value = /** @type {Value} */ (someObject.someProperty.anotherProperty.yetAnotherProperty.finalProp);
const conf = /** @type {Config} */ (await loadTheConfigurationFileFromDisk(somePathVariable));
const short = /** @type {Foo} */ (a && b);`;
			const expected = `const x = /** @type {Foo} */ (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);
const sum = /** @type {number} */ (
  firstValueWithALongName + secondValueWithALongName + third
);
y = /** @type {Foo} */ (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);
const obj = {
  key: /** @type {Foo} */ (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  ),
};
class A {
  field = /** @type {Foo} */ (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}
const message = /** @type {string} */ (
  "a long string value that does not fit on one line with the declaration"
);
const value = /** @type {Value} */ (
  someObject.someProperty.anotherProperty.yetAnotherProperty.finalProp
);
const conf = /** @type {Config} */ (
  await loadTheConfigurationFileFromDisk(somePathVariable)
);
const short = /** @type {Foo} */ (a && b);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps declare on type aliases and interfaces', async () => {
			const input = `declare type A = string;
export declare type B = number;
declare interface I { a: string }`;
			const expected = `declare type A = string;
export declare type B = number;
declare interface I {
  a: string;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// Prettier's `printArrowFunction`: a chain of arrows prints its signatures
	// together, and an expression body moves below the `=>` as a whole.
	describe('arrow function chains and bodies follow Prettier', () => {
		it('moves an arrow chain that does not fit below the operator', async () => {
			const input = `export const parseWithLongName = (_Err) => (schema, value, _ctx, _params, other, more, evenMore) => { return run(schema); };
export const _parse: (_Err: $ZodErrorClass) => $Parse = (_Err) => (schema, value, _ctx, _params) => { return run(schema, value); };
obj.parse = (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => { return run(schema); };
class Parser {
  parse = (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => { return run(schema); };
}`;
			const expected = `export const parseWithLongName =
  (_Err) => (schema, value, _ctx, _params, other, more, evenMore) => {
    return run(schema);
  };
export const _parse: (_Err: $ZodErrorClass) => $Parse =
  (_Err) => (schema, value, _ctx, _params) => {
    return run(schema, value);
  };
obj.parse =
  (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => {
    return run(schema);
  };
class Parser {
  parse =
    (_Err) =>
    (schema, value, _ctx, _params, other, more, evenMore, andMore) => {
      return run(schema);
    };
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('gives each arrow of a chain its own line outside an assignment', async () => {
			const input = `export default (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => { return run(schema); };
compose((aaaaaaaaaaaaaaaaa) => (bbbbbbbbbbbbbbbbbbbbbbbb) => (cccccccccccccccccccccc) => { return 1; });
function curry() {
  return (aaaaaaaaaaaaaaaaaaaaaa) => (bbbbbbbbbbbbbbbbbbbbbbbbbb) => (ccccccccccccccccccccc) => 1;
}`;
			const expected = `export default (_Err) =>
  (schema, value, _ctx, _params, other, more, evenMore, andMore) => {
    return run(schema);
  };
compose(
  (aaaaaaaaaaaaaaaaa) =>
    (bbbbbbbbbbbbbbbbbbbbbbbb) =>
    (cccccccccccccccccccccc) => {
      return 1;
    },
);
function curry() {
  return (aaaaaaaaaaaaaaaaaaaaaa) =>
    (bbbbbbbbbbbbbbbbbbbbbbbbbb) =>
    (ccccccccccccccccccccc) =>
      1;
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('always breaks a chain with a return type or a pattern parameter', async () => {
			const input = `const typed = (a) => (b): string => a + b;
const destructured = ({ a }) => (b) => a + b;`;
			const expected = `const typed =
  (a) =>
  (b): string =>
    a + b;
const destructured =
  ({ a }) =>
  (b) =>
    a + b;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a chain that fits and prints the comments inside it', async () => {
			const input = `const middleware = (store) => (next) => (action) => { return next(action); };
export const parseExpression = (_Err) => (schema, value, _ctx, _params) => run(schema, value, _ctx);
const curried = (a) =>
  // explain the inner function
  (b) => a + b;`;
			const expected = `const middleware = (store) => (next) => (action) => {
  return next(action);
};
export const parseExpression = (_Err) => (schema, value, _ctx, _params) =>
  run(schema, value, _ctx);
const curried =
  (a) =>
  // explain the inner function
  (b) =>
    a + b;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks after => before an expression body that does not fit', async () => {
			const input = `const create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
kmac.create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
const api = { create: (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key) };
const handler = async (resolve) => await setTimeout(resolve, 1000000000000000000000000000000000000000);
const check = (value) => !isValidValueForThisParticularCheck(value, someOtherArgument, more);
function make() {
  return (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
}`;
			const expected = `const create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) =>
  makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
kmac.create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) =>
  makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
const api = {
  create: (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) =>
    makeKmac(blockLen, chooseLen(opts, outputLen), xof, key),
};
const handler = async (resolve) =>
  await setTimeout(resolve, 1000000000000000000000000000000000000000);
const check = (value) =>
  !isValidValueForThisParticularCheck(value, someOtherArgument, more);
function make() {
  return (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) =>
    makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks inside the body after => when it does not fit on its own line either', async () => {
			const input = `const build = (value) => someFunctionWithALongName(value, anotherArgument, yetAnotherArgument, more, andMore);
foo((a) => setTimeout(aaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb), b);`;
			const expected = `const build = (value) =>
  someFunctionWithALongName(
    value,
    anotherArgument,
    yetAnotherArgument,
    more,
    andMore,
  );
foo(
  (a) =>
    setTimeout(
      aaaaaaaaaaaaaaaaaaaaaaaaaaa,
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
    ),
  b,
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps an object, array, or member body on its line after =>', async () => {
			const input = `const pick = (item) => item.someProperty.anotherProperty.yetAnotherProperty.finalProperty;
const make = (item) => ({ id: item.id, label: item.label, description: item.description });
const list = (item) => [item.id, item.label, item.description, item.somethingElse, item.more];`;
			const expected = `const pick = (item) =>
  item.someProperty.anotherProperty.yetAnotherProperty.finalProperty;
const make = (item) => ({
  id: item.id,
  label: item.label,
  description: item.description,
});
const list = (item) => [
  item.id,
  item.label,
  item.description,
  item.somethingElse,
  item.more,
];`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('parenthesizes a conditional body only while it fits', async () => {
			const input = `const f = (a) => a ? b : c;
const g = (a) => (a ? b : c);
const h = (resolve) => (condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) : rejectIt(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));
const i = (resolve) => condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) : rejectIt(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
foo((resolve) => (condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) : rejectIt(bbbbbbbbbbbb)), b);`;
			const expected = `const f = (a) => (a ? b : c);
const g = (a) => (a ? b : c);
const h = (resolve) =>
  condition
    ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
    : rejectIt(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
const i = (resolve) =>
  condition
    ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
    : rejectIt(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
foo(
  (resolve) =>
    condition
      ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)
      : rejectIt(bbbbbbbbbbbb),
  b,
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('adds no parentheses around a conditional body that starts with an object', async () => {
			const source = `const h = (a) => ({ x: 1 }).x ? b : c;`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('breaks after => in a JSX attribute and puts the closing brace on its own line', async () => {
			const input = `function App(props) @{
  <button onClick={() => doSomethingWithAVeryLongName(props.value, props.otherValue, more)}>{'Hi'}</button>
}`;
			const expected = `function App(props) @{
  <button
    onClick={() =>
      doSomethingWithAVeryLongName(props.value, props.otherValue, more)
    }
  >
    {"Hi"}
  </button>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('comments that start an assigned value', () => {
		it('prints an own-line comment below the = with the value indented', async () => {
			const input = `const value = (
  // pick the cached entry
  cache.entry
);
const block = (
  /* pick the cached entry */
  cache.entry
);`;
			const expected = `const value =
  // pick the cached entry
  cache.entry;
const block =
  /* pick the cached entry */
  cache.entry;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a comment on the = line and indents the value below it', async () => {
			const source = `const value = // pick the cached entry
  cache.entry;
const call = // compute it
  compute(a);`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('indents the value in assignments, class fields, and object properties', async () => {
			const source = `value =
  // pick the cached entry
  cache.entry;
total += // running sum
  next;
class Store {
  value =
    // pick the cached entry
    cache.entry;
}
const options = {
  value:
    // pick the cached entry
    cache.entry,
};`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('sees a comment that belongs to the leftmost operand', async () => {
			const input = `const called = (
  // pick the handler
  primary || fallback
)();
const member = (
  // pick the cache
  cache
).entry;`;
			const expected = `const called =
  // pick the handler
  (primary || fallback)();
const member =
  // pick the cache
  cache.entry;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a type cast comment on the = line', async () => {
			await expect(format('const value = /** @type {Entry} */ (cache.entry);')).resolves.toBe(
				'const value = /** @type {Entry} */ (cache.entry);\n',
			);
		});

		// A line break between `return` or `throw` and its argument ends the
		// statement, so the argument would no longer be returned or thrown.
		it('keeps a return or throw argument whose leftmost operand has an own-line comment', async () => {
			const input = `function run() {
  return (
    // pick the handler
    primary || fallback
  )();
}
function fail() {
  throw (
    // pick the error
    errors
  ).first;
}`;
			const expected = `function run() {
  return (
    // pick the handler
    (primary || fallback)()
  );
}
function fail() {
  throw (
    // pick the error
    errors.first
  );
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		// A JSDoc cast needs its own parentheses, so a parent that lays out the
		// argument's parentheses itself must still print them.
		it('keeps a type cast inside parentheses that return, throw, or a superclass add', async () => {
			const input = `function unwrap(node) {
  return (
    // unwrap the entry
    /** @type {Entry} */ (/** @type {unknown} */ (node))
  );
}
function pick(node) {
  return (
    // pick the entry
    /** @type {Entry} */ (node)
  );
}
function fail(error) {
  throw (
    // rethrow as an Error
    /** @type {Error} */ (error)
  );
}
class Store extends /** @type {Base} */ (new Base()) {}`;
			const expected = `function unwrap(node) {
  return (
    // unwrap the entry
    /** @type {Entry} */ (/** @type {unknown} */ (node))
  );
}
function pick(node) {
  return (
    // pick the entry
    /** @type {Entry} */ (node)
  );
}
function fail(error) {
  throw (
    // rethrow as an Error
    /** @type {Error} */ (error)
  );
}
class Store extends (/** @type {Base} */ (new Base())) {}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// Static blocks, namespaces, and code blocks are statement lists like a
	// function body, so their comments stay where a function body keeps them.
	describe('comments in static blocks, namespaces, and code blocks', () => {
		it('keeps a JSDoc cast with the statement it starts', async () => {
			const input = `function f() { a; /** @type {Foo} */ (x).y(); }
class C { static { a; /** @type {Foo} */ (x).y(); } }
namespace N { a; /** @type {Foo} */ (x).y(); }
export function App() @{
  const a = 1; /** @type {Foo} */ (x).y();
  <div />
}`;
			const expected = `function f() {
  a;
  /** @type {Foo} */ (x).y();
}
class C {
  static {
    a;
    /** @type {Foo} */ (x).y();
  }
}
namespace N {
  a;
  /** @type {Foo} */ (x).y();
}
export function App() @{
  const a = 1;
  /** @type {Foo} */ (x).y();
  <div />
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		// The `;` guard prints before the cast, on the cast's line, so the next
		// pass must still read the cast as the start of the guarded statement.
		it('keeps a JSDoc cast with the statement it starts without semicolons', async () => {
			const input = `class C { static { a; /** @type {Foo} */ (x).y(); } }
namespace N { a; /** @type {Foo} */ (x).y(); }
export function App() @{
  const a = 1; /** @type {Foo} */ (x).y();
  <div />
}`;
			const expected = `class C {
  static {
    a
    ;/** @type {Foo} */ (x).y()
  }
}
namespace N {
  a
  ;/** @type {Foo} */ (x).y()
}
export function App() @{
  const a = 1
  ;/** @type {Foo} */ (x).y()
  <div />
}`;
			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a block comment with the render output on its line', async () => {
			const input = `export function App() @{
  const a = 1; /* the output */ <div />
}`;
			const expected = `export function App() @{
  const a = 1;
  /* the output */ <div />
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps comments after the last statement inside the block', async () => {
			const source = `class C {
  static {
    a; // a
    // after a
  }
  x = 1;
}
namespace N {
  a; // a
  // after a
}
declare module "m" {
  export const a: 1;
  // after a
}`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps the comments of an empty static block or namespace inside it', async () => {
			const input = `class C {
  static {
    // one

    /* two */
  }
  static { /* only */ }
}
namespace N {
  // only
}
declare global {
  // only
}`;
			const expected = `class C {
  static {
    // one
    /* two */
  }
  static {
    /* only */
  }
}
namespace N {
  // only
}
declare global {
  // only
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps blank lines between the statements of a static block', async () => {
			const source = `class C {
  static {
    a;

    // b

    b;
  }
}`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});
	});

	// A JSDoc tag documents the member it leads, so moving it to the member
	// before changes what the tag applies to.
	describe('comments in interfaces, enums, and type literals', () => {
		it('keeps a JSDoc comment with the member it starts', async () => {
			const input = `interface I { a: 1; /** @deprecated */ b: 2; }
enum E { A, /** @deprecated */ B }
type T = { a: 1; /** @deprecated */ b: 2 };`;
			const expected = `interface I {
  a: 1;
  /** @deprecated */ b: 2;
}
enum E {
  A,
  /** @deprecated */ B,
}
type T = { a: 1; /** @deprecated */ b: 2 };`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps comments after the last member inside the body', async () => {
			const source = `interface I {
  a: 1; // a
  // after a
}
enum E {
  A, // a
  // after a
}
type T = {
  a: 1; // a
  // after a
};`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps the comments of an empty interface, enum, or type literal inside it', async () => {
			const input = `interface I {
  // interface
}
enum E {
  // enum
}
type T = {
  // type
};
interface J { /* interface */ }
enum F { /* enum */ }
type U = { /* type */ };`;
			const expected = `interface I {
  // interface
}
enum E {
  // enum
}
type T = {
  // type
};
interface J {
  /* interface */
}
enum F {/* enum */}
type U = {/* type */};`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('interface, enum, and type literal members lay out like Prettier', () => {
		it('keeps one blank line between members where the source has one', async () => {
			const input = `interface I {
  a: 1;


  b(): void;

  // c
  [k: string]: unknown;
}
type T = {
  a: 1;

  // group

  b: 2;
};
enum E {
  A = 1, // one

  // lead
  B,

  C,
}
let x: {
  a: 1;

  b: 2;
} = null;`;
			const expected = `interface I {
  a: 1;

  b(): void;

  // c
  [k: string]: unknown;
}
type T = {
  a: 1;

  // group

  b: 2;
};
enum E {
  A = 1, // one

  // lead
  B,

  C,
}
let x: {
  a: 1;

  b: 2;
} = null;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('prints a trailing comment after the semicolon of an interface or type literal member', async () => {
			const expected = `interface I {
  a: 1; /* note */
  b(): void; // line
  (x: number): string; /* call */
  new (x: number): I; /* construct */
  [k: string]: unknown; /* index */
}
type T = {
  a: 1; /* note */
  b: 2; // line
};
type U = { a: 1 /* c */; b: 2 };
enum E {
  A /* c */,
  B, // d
}`;
			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('prints the member semicolons of interfaces and type literals like Prettier without semicolons', async () => {
			const input = `interface I {
  a;
  (): void;
  get;
  x: 1; /* note */
  y: 2;
}
type T = {
  a;
  (): void;
  get;
  x: 1; /* note */
  y: 2;
};
type U = { a: 1; b: 2 };
function f({ a, b }: { a: string; b: number }) {}`;
			const expected = `interface I {
  a;
  (): void
  get;
  x: 1 /* note */
  y: 2
}
type T = {
  a;
  (): void
  get;
  x: 1 /* note */
  y: 2
}
type U = { a: 1; b: 2 }
function f({ a, b }: { a: string; b: number }) {}`;
			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(expected);
		});
	});

	// Import aliases and export assignments are runtime bindings. Dropping one
	// leaves every later reference dangling, and the file still compiles, so the
	// break only surfaces when the module runs.
	describe('TypeScript module declarations survive formatting', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it.each([
			'import Alias = Foo;',
			'import Alias = Foo.Bar.Baz;',
			'import fs = require("fs");',
			'import type Types = require("./types");',
			'export import Alias = Foo.Bar;',
			'export import type Types = require("./types");',
			'export = value;',
			'export as namespace Library;',
		])('keeps %s', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps import aliases and export assignments inside namespaces and modules', async () => {
			await expectUnchanged(`namespace Outer {
  export import Alias = Foo;
  import fs = require("fs");
}`);
			await expectUnchanged(`declare module "library" {
  const value: number;
  export = value;
}`);
		});

		it('keeps the import alias a module reads from', async () => {
			const input = `namespace Foo { export const answer = 1; }
import Alias = Foo;
export const x = Alias.answer;`;
			const expected = `namespace Foo {
  export const answer = 1;
}
import Alias = Foo;
export const x = Alias.answer;`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps comments inside import aliases', async () => {
			await expectUnchanged('import /* a */ Alias /* b */ = /* c */ Foo /* d */;');
			await expectUnchanged('import fs = require(/* why */ "fs");');
		});

		it('follows quote and semicolon options', async () => {
			const result = await format(`import fs = require("fs");\nexport = fs;`, {
				singleQuote: true,
				semi: false,
			});
			expect(result).toBeWithNewline(`import fs = require('fs')\nexport = fs`);
		});

		// A dotted name parses as nested declarations. Printing the keyword for
		// each part gave `namespace A namespace B { … }`, which no longer parses.
		it.each([
			`namespace A.B {
  export const value = 1;
}`,
			`declare namespace A.B.C {
  const value: number;
}`,
			'export namespace A.B {}',
			'export declare namespace A.B {}',
			'module A.B {}',
			'namespace A./* between */ B {}',
		])('keeps dotted namespace names: %s', async (source) => {
			await expectUnchanged(source);
		});

		it('formats the body of a dotted namespace', async () => {
			const result = await format('namespace A.B { export const value = 1; }');
			expect(result).toBeWithNewline(`namespace A.B {
  export const value = 1;
}`);
		});

		it('keeps the semicolon on shorthand ambient modules', async () => {
			await expectUnchanged(`declare module "untyped-a";
declare module "untyped-b";`);
			const result = await format(`declare module "untyped";`, { semi: false });
			expect(result).toBeWithNewline(`declare module "untyped"`);
		});
	});

	// Export clauses decide what a module exposes. Printing `export {};` as a
	// bare `export` made the next declaration public, and a dropped
	// `export * from` or import attribute changed what the module loads.
	describe('export clauses survive formatting', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it.each([
			'export {};',
			'export type {};',
			'export {} from "./side-effect";',
			'export type {} from "./types";',
			'export * from "./module";',
			'export * as ns from "./module";',
			'export type * from "./types";',
			'export type * as Types from "./types";',
			'export { a } from "./data.json" with { type: "json" };',
			'export * from "./data.json" with { type: "json" };',
			'export { "a-b" as ab, c as "c-d" } from "./module";',
			'export { "a-b" } from "./module";',
			'export * as "a-b" from "./module";',
			'import { "a-b" as ab } from "./module";',
		])('keeps %s', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps the declaration after an empty export local', async () => {
			await expectUnchanged(`export {};
const internal = 42;`);
			await expectUnchanged(`export {};
declare global {
  interface Window {
    value: number;
  }
}`);
		});

		it('follows quote and semicolon options', async () => {
			const result = await format(`export {};\nexport {} from "a";\nexport * as ns from "b";`, {
				singleQuote: true,
				semi: false,
			});
			expect(result).toBeWithNewline(`export {}\nexport {} from 'a'\nexport * as ns from 'b'`);
		});
	});

	describe('import and export specifier lists lay out like Prettier', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 * @param {import('prettier').Options} [options]
		 */
		const expectUnchanged = async (source, options) => {
			const result = await format(source, options);
			expect(result).toBeWithNewline(source);
		};

		it('breaks a long export list one specifier per line', async () => {
			const names =
				'aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccc';
			const list = `{
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccc,
}`;

			const reexports = await format(`export { ${names} } from 'mod';
export type { ${names} } from 'mod';`);
			expect(reexports).toBeWithNewline(`export ${list} from "mod";
export type ${list} from "mod";`);

			const local = await format(`const aaaaaaaaaaaaaaaaaaaaaa = 1;
const bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb = 2;
const cccccccccccccccccccccccccc = 3;
export { ${names} };`);
			expect(local).toBeWithNewline(`const aaaaaaaaaaaaaaaaaaaaaa = 1;
const bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb = 2;
const cccccccccccccccccccccccccc = 3;
export ${list};`);
		});

		it('keeps a lone named import on the line with a long source', async () => {
			await expectUnchanged(
				'import { a } from "./a-module-with-a-long-name/that-lives/in-a-deeply-nested/folder-structure";',
			);
			await expectUnchanged(
				'import type { A } from "./a-module-with-a-long-name/that-lives/in-a-deeply-nested/folder-structure";',
			);
		});

		it('breaks the braces of a default import with named imports', async () => {
			const result = await format(
				`import aaaaaaaaaaaaaaaaaaaaaaaaaaaaa, { bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccccccccccc } from 'mod';`,
			);
			expect(result).toBeWithNewline(`import aaaaaaaaaaaaaaaaaaaaaaaaaaaaa, {
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccccccccccccc,
} from "mod";`);
		});

		it('follows bracketSpacing in import and export lists', async () => {
			await expectUnchanged(`import {a} from "mod";\nimport b, {c, d} from "mod";`, {
				bracketSpacing: false,
			});
			await expectUnchanged(`const a = 1;\nexport {a};\nexport {b as c, d} from "mod";`, {
				bracketSpacing: false,
			});
		});

		it('follows bracketSpacing in import attributes', async () => {
			const input = `export * from './b.json' with { type: 'json' };
export { x } from './x.json' with { type: 'json', other: 'x' };
import a from './a.json' with { type: 'json' };`;
			const expected = `export * from "./b.json" with {type: "json"};
export {x} from "./x.json" with {type: "json", other: "x"};
import a from "./a.json" with {type: "json"};`;
			expect(await format(input, { bracketSpacing: false })).toBeWithNewline(expected);
		});

		it('breaks long import attributes like an object, but never a lone type attribute', async () => {
			const input = `import data from './data.json' with { type: 'json', integrity: 'sha384-0123456789abcdef' };
import e from './eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.json' with { type: 'json' };
import c from './c' with {
  type: 'json' };`;
			const expected = `import data from "./data.json" with {
  type: "json",
  integrity: "sha384-0123456789abcdef",
};
import e from "./eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.json" with { type: "json" };
import c from "./c" with { type: "json" };`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps import attributes expanded when a line break follows their {', async () => {
			const input = `import d from './d' with {
  type: 'json', other: 'x' };`;
			expect(await format(input)).toBeWithNewline(`import d from "./d" with {
  type: "json",
  other: "x",
};`);
			expect(await format(input, { objectWrap: 'collapse' })).toBeWithNewline(
				`import d from "./d" with { type: "json", other: "x" };`,
			);
		});

		it('keeps the assert keyword and an empty attribute list', async () => {
			await expectUnchanged(`import a from "./a.json" assert { type: "json" };
import b from "./b" with {};
import f from "./f" /* c */ with { type: "json" };`);
		});

		it('keeps an alias that repeats the name', async () => {
			await expectUnchanged('import { a as a } from "mod";');
			await expectUnchanged('const b = 1;\nexport { b as b };');
		});

		it.each([
			'import {} from "mod";',
			'import type {} from "mod";',
			'import {} from "./a.json" with { type: "json" };',
			'import "side-effect";',
		])('keeps %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			['a trailing line comment', 'import {\n  a, // first\n  b,\n} from "mod";'],
			['an own-line comment', 'export {\n  a,\n  // own line\n  b,\n} from "mod";'],
			['a comment after the last specifier', 'import {\n  a,\n  b,\n  // after b\n} from "mod";'],
			['block comments', 'import { /* x */ a, b /* y */ } from "mod";'],
			[
				'comments on default and namespace imports',
				'import /* d */ a, * as /* ns */ b from "mod";',
			],
			['a comment before a comma', 'import def /* d */, { a } from "mod";'],
			// Like Prettier, the first comment trails the default import (#384)
			[
				'a line comment after the brace of the named imports',
				'import d, { // first\n  // second\n  a,\n} from "mod";',
			],
			[
				'line comments after the brace and after a named import',
				'import d, { // first\n  a, // second\n  b,\n} from "mod";',
			],
			['a comment before from', 'import a /* c */ from "mod";'],
			['a comment on an alias', 'export { a as /* c */ b } from "mod";'],
			['a comment on a namespace re-export', 'export * as ns /* c */ from "mod";'],
			['a comment before the source', 'import {} from /* nothing */ "mod";'],
			[
				'a block comment on an attribute',
				'import a from "./a.json" with { /* c */ type: "json" };',
			],
			[
				'a line comment on an attribute',
				'import a from "./a.json" with {\n  // c\n  type: "json",\n};',
			],
		])('keeps %s', async (_, source) => {
			await expectUnchanged(source);
		});

		// Prettier trails the default import with the first comment and prints
		// it after the `{`, where it trails the default import again (#384)
		it.each([
			[
				'import d, // first\n// second\n{ a } from "mod";',
				'import d, { // first\n  // second\n  a,\n} from "mod";',
			],
			['import d, { // first\n  a,\n} from "mod";', 'import d, { a } from "mod"; // first'],
		])('prints the comments of %j where Prettier does', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('moves a comment after the braces inside them', async () => {
			const result = await format(`import { a } /* after */ from 'mod';`);
			expect(result).toBeWithNewline(`import { a /* after */ } from "mod";`);
		});

		// Like Prettier, which ends the statement before its `;`, a comment
		// between the source and the `;` prints after the `;`
		it('keeps a comment after the module source', async () => {
			expect(await format('import a from /* c */ "mod" /* d */;')).toBeWithNewline(
				'import a from /* c */ "mod"; /* d */',
			);
		});
	});

	describe('comments on either side of a comma stay there', () => {
		it.each([
			'const x = [a /* c */, b];',
			'foo(a /* c */, b);',
			'new Foo(a /* c */, b);',
			'const o = { a: 1 /* c */, b: 2 };',
			'function f(a /* c */, b) {}',
			'const { a /* c */, b } = o;',
			'import a /* c */, { b } from "mod";',
			'const x = [a /* c */ /* d */, b];',
			'const x = [a, /* c */ b];',
			'foo(a, /** @type {T} */ (b));',
		])('keeps %s', async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps a comment before the comma in an enum', async () => {
			const result = await format('enum E { A /* c */, B }');
			expect(result).toBeWithNewline(`enum E {
  A /* c */,
  B,
}`);
		});

		it('keeps a comment before the comma when the list collapses', async () => {
			const result = await format(`const y = [
  a /* c */,
  b,
];`);
			expect(result).toBeWithNewline('const y = [a /* c */, b];');
		});

		// Type argument and parameter lists and tuple types are comma lists too
		it.each([
			'type F = Foo<A, /* y */ B>;',
			'let v: Map<A, /* y */ B>;',
			'new Map<A, /* y */ B>();',
			'f<A, /* y */ B>();',
			'class C<A, /* y */ B> {}',
			'interface I<A, /* y */ B> {}',
			'function f<A, /* y */ B>() {}',
			'type T = [A, /* y */ B];',
			'type T = [a: A, /* y */ b: B];',
			'type T = [A, /* y */ ...B];',
			'type F = Foo<A, /* y */ B>[];',
			'type F = Foo<A /* y */, B>;',
			'type T = [A /* a */ /* b */, /* c */ B];',
			'type F = Foo<A, B /* y */>;',
			'type T = [A, B /* y */];',
			'function f<A /* a */, B /* b */>() {}',
		])('keeps the comment on its side of the comma in %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a comment after the comma next to a type written in parentheses', async () => {
			const result = await format(`type F = Foo<(A), /* y */ B>;
type G = Foo<A, /* y */ (B)>;
let v: Map<(A), /* y */ B>;
type T = [(A), /* y */ B];`);
			expect(result).toBeWithNewline(`type F = Foo<A, /* y */ B>;
type G = Foo<A, /* y */ B>;
let v: Map<A, /* y */ B>;
type T = [A, /* y */ B];`);
		});

		it.each([
			`type F = Foo<
  A, // a
  B // b
>;`,
			`type T = [
  A, // a
  B, // b
];`,
			`type T = [
  A,
  // own line
  B,
];`,
			`function f<
  A, // a
  B, // b
>() {}`,
		])('keeps the line comments of a broken type list: %s', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier, the comments before the `)` trail the last parameter
		// or argument, even with a trailing comma or another comment between
		// (#435)
		it.each([
			['function f(\n  a,\n  b /* c */,\n) {}', 'function f(a, b /* c */) {}'],
			['const f = (\n  a,\n  b /* c */,\n) => {};', 'const f = (a, b /* c */) => {};'],
			['class A {\n  m(\n    a,\n    b /* c */,\n  ) {}\n}', 'class A {\n  m(a, b /* c */) {}\n}'],
			['function f(\n  a,\n  b /* c */,\n): void {}', 'function f(a, b /* c */): void {}'],
			['function f<T>(\n  a,\n  b = 1 /* c */,\n) {}', 'function f<T>(a, b = 1 /* c */) {}'],
			['function f(\n  a,\n  b /* c */, /* d */\n) {}', 'function f(a, b /* c */ /* d */) {}'],
			['function f(\n  a,\n  b /* c */, // d\n) {}', 'function f(\n  a,\n  b /* c */, // d\n) {}'],
			['const x = run(\n  a,\n  b /* c */,\n);', 'const x = run(a, b /* c */);'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'function f(a, b /* c */ /* d */) {}',
			'const f = (a /* c */ /* d */) => a;',
			'run(a, b /* c */ /* d */);',
			'function f(\n  a,\n  b, // c\n) {}',
			'function f(\n  a,\n  b,\n  // c\n) {}',
			'function f(a, ...b /* c */) {}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});
	});

	// `export default (class Named {})` is an expression: `Named` is bound only
	// inside the class body. `export default class Named {}` is a declaration:
	// `Named` becomes a module-scoped binding. Dropping the parens swaps one for
	// the other, and the file still compiles, so nothing catches it downstream.
	describe('export default parentheses survive formatting', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it('keeps parens around a named class expression', async () => {
			await expectUnchanged(`export default (class Named {});`);
		});

		it('keeps parens around an anonymous class expression', async () => {
			await expectUnchanged(`export default (class {});`);
		});

		it('keeps parens around a class expression with a superclass', async () => {
			await expectUnchanged(`export default (class Named extends Base {});`);
		});

		it('keeps parens around a named function expression', async () => {
			await expectUnchanged(`export default (function foo() {});`);
		});

		it('keeps parens around an anonymous function expression', async () => {
			await expectUnchanged(`export default (function () {});`);
		});

		it('does not leak the class expression name into module scope', async () => {
			const input = `export default (class Named {});
export const alias = Named;`;

			await expectUnchanged(input);
		});

		it('collapses redundant parens down to one pair', async () => {
			const input = `export default ((class Named {}));`;
			const expected = `export default (class Named {});`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('collapses a multiline parenthesized class expression', async () => {
			const input = `export default (
  class Named {}
);`;
			const expected = `export default (class Named {});`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('omits the terminator when semi is disabled', async () => {
			const input = `export default (class Named {});`;
			const expected = `export default (class Named {})`;

			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(expected);
		});

		it('leaves an unparenthesized class declaration alone', async () => {
			await expectUnchanged(`export default class Named {}`);
		});

		it('leaves an unparenthesized function declaration alone', async () => {
			await expectUnchanged(`export default function foo() {}`);
		});

		it('does not invent parens around other default exports', async () => {
			const input = `export default (0);`;
			const expected = `export default 0;`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// `export default <expression>` is a statement and terminates; only the
	// declaration forms end at their closing brace. Dropping the `;` lets ASI
	// pull the next line into the exported expression.
	describe('export default terminators', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it('terminates an identifier export', async () => {
			await expectUnchanged(`export default foo;`);
		});

		it('terminates an object export', async () => {
			await expectUnchanged(`export default { a: 1 };`);
		});

		it('terminates an array export', async () => {
			await expectUnchanged(`export default [1, 2];`);
		});

		it('terminates a numeric literal export', async () => {
			await expectUnchanged(`export default 42;`);
		});

		it('terminates an arrow function export', async () => {
			await expectUnchanged(`export default (a, b) => a + b;`);
		});

		it('terminates a call expression export', async () => {
			await expectUnchanged(`export default createStore();`);
		});

		it('terminates an `as` expression export', async () => {
			await expectUnchanged(`export default foo as Bar;`);
		});

		// Without the terminator these two lines reparse as the single call
		// `export default foo(function () {})();`.
		it('does not let a following paren line join the exported expression', async () => {
			await expectUnchanged(`export default foo;
(function () {})();`);
		});

		it('does not let a following bracket line join the exported expression', async () => {
			await expectUnchanged(`export default foo;
[1, 2].forEach(log);`);
		});

		it('does not let a following template line join the exported expression', async () => {
			await expectUnchanged('export default foo;\n`side effect`;');
		});

		it('omits the terminator when semi is disabled', async () => {
			const input = `export default foo;`;
			const expected = `export default foo`;

			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(expected);
		});

		it('leaves a class declaration unterminated', async () => {
			await expectUnchanged(`export default class Named {}`);
		});

		it('leaves an abstract class declaration unterminated', async () => {
			await expectUnchanged(`export default abstract class A {}`);
		});

		it('leaves a function declaration unterminated', async () => {
			await expectUnchanged(`export default function foo() {}`);
		});

		it('leaves an interface declaration unterminated', async () => {
			await expectUnchanged(`export default interface Foo {}`);
		});

		// A decorated default export parses as a ClassExpression but is still a
		// declaration, so it must not pick up a terminator.
		it('leaves a decorated class declaration unterminated', async () => {
			const input = `export default @dec class Named {}`;
			const expected = `export default
@dec
class Named {}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	// `export default function () {}` is the one position where a
	// FunctionDeclaration may be anonymous.
	describe('anonymous default-exported function declarations', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it('prints an anonymous function declaration', async () => {
			await expectUnchanged(`export default function () {}`);
		});

		it('prints an anonymous async function declaration', async () => {
			await expectUnchanged(`export default async function () {}`);
		});

		it('prints an anonymous generator declaration', async () => {
			await expectUnchanged(`export default function* () {}`);
		});

		it('prints an anonymous function declaration with parameters', async () => {
			await expectUnchanged(`export default function (a, b) {
  return a + b;
}`);
		});
	});

	describe('decorators survive formatting', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it('keeps decorators in every position', async () => {
			await expectUnchanged(`@sealed
class A {
  @log
  method() {}
  @inject accessor x = 1;
  m(@param() a: number) {}
}`);
		});

		it('keeps a decorator on a class declaration', async () => {
			await expectUnchanged(`@sealed
class Widget {
  render() {
    return 1;
  }
}`);
		});

		it('gives each class decorator its own line', async () => {
			const input = `@first @second class Widget {}`;
			const expected = `@first
@second
class Widget {}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a class member decorator on its own line', async () => {
			await expectUnchanged(`class Store {
  @observable
  count = 0;

  @action
  increment() {
    this.count++;
  }
}`);
		});

		it('keeps a class member decorator inline when it was written inline', async () => {
			await expectUnchanged(`class Store {
  @observable count = 0;
  @inject accessor service = null;

  @action increment() {
    this.count++;
  }
}`);
		});

		it('keeps several inline decorators on one member', async () => {
			await expectUnchanged(`class Store {
  @first @second count = 0;

  ping() {
    return 1;
  }
}`);
		});

		it('moves an inline decorator too long for the line onto its own line', async () => {
			const input = `class Store {
  @veryLongDecoratorNameHere({ option: 1, another: 2, third: 3, fourth: 4 }) method() {
    return 1;
  }
}`;
			const expected = `class Store {
  @veryLongDecoratorNameHere({ option: 1, another: 2, third: 3, fourth: 4 })
  method() {
    return 1;
  }
}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps decorators alongside other member modifiers', async () => {
			await expectUnchanged(`class Store {
  @dec static base = 1;
  @dec declare readonly id: number;

  @dec
  @other
  private static async *walk() {
    yield 1;
  }
}`);
		});

		it('keeps decorators on accessors and computed keys', async () => {
			await expectUnchanged(`class Store {
  @dec ["computed"] = 1;

  @dec
  @other()
  get value() {
    return 1;
  }

  @dec set value(next) {
    this.inner = next;
  }
}`);
		});

		it('keeps decorators built from member and call expressions', async () => {
			await expectUnchanged(`@dec.nested.deep({ a: 1 })
class Widget {}`);
		});

		it('keeps parameter decorators inline', async () => {
			await expectUnchanged(`class Store {
  handle(@inject() service: Service, @body() payload: Payload) {
    return service;
  }
}`);
		});

		it('keeps parameter decorators before parameter property modifiers', async () => {
			await expectUnchanged(`class Store {
  constructor(@inject private readonly service: Service) {
    this.ready = true;
  }
}`);
		});

		it('keeps decorators above the export keyword', async () => {
			await expectUnchanged(`@sealed
export class Widget {}`);
		});

		// Like Prettier's `hasDecoratorsBeforeExport`, decorators written after
		// `export` stay after it, and `export`, each decorator, and `class` get a
		// line each (#478)
		it.each([
			['export @sealed class Widget {}', 'export\n@sealed\nclass Widget {}'],
			['export default @sealed class Widget {}', 'export default\n@sealed\nclass Widget {}'],
			['export default @sealed class {}', 'export default\n@sealed\nclass {}'],
			['export @a @b() @c.d(1, 2) class A {}', 'export\n@a\n@b()\n@c.d(1, 2)\nclass A {}'],
			['export @dec abstract class A {}', 'export\n@dec\nabstract class A {}'],
			['export @dec @dec2\nclass A {\n  x = 1;\n}', 'export\n@dec\n@dec2\nclass A {\n  x = 1;\n}'],
			[
				'export @dec() @withLongArguments({ a: 1, bbbbbbbbbbbbbbbb: 2, cccccccccccccccccccc: 3, ddddddddddd: 4 }) class A {}',
				'export\n@dec()\n@withLongArguments({\n  a: 1,\n  bbbbbbbbbbbbbbbb: 2,\n  cccccccccccccccccccc: 3,\n  ddddddddddd: 4,\n})\nclass A {}',
			],
			['export @dec /* c */ class A {}', 'export\n@dec /* c */\nclass A {}'],
			['export @dec // c\nclass A {}', 'export\n@dec // c\nclass A {}'],
			['export /* c */ @dec class A {}', 'export /* c */\n@dec\nclass A {}'],
			['export default /* c */ @dec class {}', 'export default /* c */\n@dec\nclass {}'],
			['/* x */ export @dec class A {}', '/* x */ export\n@dec\nclass A {}'],
		])('keeps the decorators of %j after export like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Prettier breaks the line after such a comment a second time, which
		// adds a blank line on every pass
		it.each([
			['export // c\n@dec class A {}', 'export // c\n@dec\nclass A {}'],
			['export default // c\n@dec class {}', 'export default // c\n@dec\nclass {}'],
			['export /* a */\n// b\n@dec class A {}', 'export /* a */\n// b\n@dec\nclass A {}'],
			['export /* c */\n@dec\nclass A {}', 'export /* c */\n@dec\nclass A {}'],
			['export // c\n\n@dec\nclass A {}', 'export // c\n\n@dec\nclass A {}'],
		])(
			'breaks the line once after the comment before the decorators of %j',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		it.each([
			'// prettier-ignore\nexport @dec   class A   {}',
			'// prettier-ignore\n@dec   export class A   {}',
			'export // prettier-ignore\n@dec   class A   {}',
			'@dec\nexport class A {}\n@dec\nexport default class B {}',
		])('keeps %j', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps decorators on a default-exported class', async () => {
			await expectUnchanged(`@sealed
export default class Widget {}`);
		});

		// Hoisting these above `export default` would change what they decorate
		// and strand the parens, which a second pass then drops — turning the
		// class expression into a declaration and leaking its name into module
		// scope.
		it('keeps decorators inside a parenthesized default export', async () => {
			await expectUnchanged(`export default (
  @sealed
  class Named {}
);`);
		});

		it('does not hoist decorators out of a parenthesized default export', async () => {
			const input = `export default (@sealed class Named {});`;
			const expected = `export default (
  @sealed
  class Named {}
);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps decorators on a class expression', async () => {
			await expectUnchanged(`const Widget =
  @sealed
  class {};`);
		});

		// Like Prettier's `printClass`, the decorators of a class expression
		// in parentheses go on their own lines inside them (#532)
		it.each([
			['(@deco class Foo {});', '(\n  @deco\n  class Foo {}\n);'],
			['(@deco class {}).name;', '(\n  @deco\n  class {}\n).name;'],
			['new (@dec class {})();', 'new (\n  @dec\n  class {}\n)();'],
			['(@dec class {})();', '(\n  @dec\n  class {}\n)();'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it('breaks inside the parentheses of a decorated class expression with semi: false', async () => {
			expect(await format('(@deco class Foo {}).name', { semi: false })).toBeWithNewline(
				';(\n  @deco\n  class Foo {}\n).name',
			);
		});

		it.each([
			'class A extends (\n  @dec\n  class {}\n) {}',
			'foo(\n  @dec\n  class {},\n);',
			'const b = /** @type {X} */ (\n  @dec\n  class {}\n);',
		])('keeps %j', async (source) => {
			await expectUnchanged(source);
		});

		it('keeps decorators alongside leading comments', async () => {
			await expectUnchanged(`// widget entry point
@sealed
class Widget {
  // the counter
  @observable
  count = 0;

  ping() {
    return 1;
  }
}`);
		});

		it('keeps blank lines between decorated classes', async () => {
			await expectUnchanged(`@first
class A {}

@second
class B {}`);
		});
	});

	// Prettier's `printCallArguments` hugs a function or a literal as the first
	// or last argument only in a few shapes, and otherwise breaks every argument.
	describe('call arguments hug like Prettier', () => {
		it('breaks after => in a last-argument arrow with an expression body', async () => {
			const input = `const p2 = makePromise<void>((resolve) => setTimeout(resolve, 1000000000000000000000000000000000000000));
const p6 = runLater(firstArgument, secondArgument, (resolve) => setTimeout(resolve, 100000000000000000000));
const p3 = makePromise<void>((resolve) => resolve?.(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbb));
const p4 = makePromise<void>((resolve) => setTimeout(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbb)!);
const p5 = makePromise<void>((resolve) => (condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaa) : reject(bbbbbbbbbbbb)));
const p9 = new Promise((resolve) => setTimeout(resolve, 100000000000000000000000000000000000000000));`;
			const expected = `const p2 = makePromise<void>((resolve) =>
  setTimeout(resolve, 1000000000000000000000000000000000000000),
);
const p6 = runLater(firstArgument, secondArgument, (resolve) =>
  setTimeout(resolve, 100000000000000000000),
);
const p3 = makePromise<void>((resolve) =>
  resolve?.(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbb),
);
const p4 = makePromise<void>((resolve) =>
  setTimeout(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbb)!,
);
const p5 = makePromise<void>((resolve) =>
  condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaa) : reject(bbbbbbbbbbbb),
);
const p9 = new Promise((resolve) =>
  setTimeout(resolve, 100000000000000000000000000000000000000000),
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps the opening of an object or array body on the call line', async () => {
			const input = `const p7 = items.map((item) => ({ id: item.id, label: item.label, description: item.description, x: 1 }));
const p8 = items.map((item) => [item.id, item.label, item.description, item.somethingElse, item.more]);`;
			const expected = `const p7 = items.map((item) => ({
  id: item.id,
  label: item.label,
  description: item.description,
  x: 1,
}));
const p8 = items.map((item) => [
  item.id,
  item.label,
  item.description,
  item.somethingElse,
  item.more,
]);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks every argument when a last-argument function would break its parameters', async () => {
			const input = `const p10 = items.map((item) => item.someProperty.anotherProperty.yetAnotherProperty.finalProperty);
template = template.replace(/\\{([^\\{\\}]+)\\}|([^\\{\\}]+)/g, function (_, expression, literal) {
  return 1;
});
const runConfig = makeWeakCache(function* runConfigWithAVeryLongName(options, cache) {
  return 1;
});`;
			const expected = `const p10 = items.map(
  (item) => item.someProperty.anotherProperty.yetAnotherProperty.finalProperty,
);
template = template.replace(
  /\\{([^\\{\\}]+)\\}|([^\\{\\}]+)/g,
  function (_, expression, literal) {
    return 1;
  },
);
const runConfig = makeWeakCache(
  function* runConfigWithAVeryLongName(options, cache) {
    return 1;
  },
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks every argument around a leading function unless one short argument follows', async () => {
			const input = `const obs = makeObserver((entries) => { for (const entry of entries) console.log(entry); }, { threshold: 0.5 });
foo(() => { doSomething(); }, a, b);
foo(a, () => { doSomething(); }, { x: 1 });
useCallback((event) => { handle(event); }, [a, b]);
foo(() => { doSomething(); }, cond ? a : b);
foo(() => { doSomething(); }, bar(a, b));`;
			const expected = `const obs = makeObserver(
  (entries) => {
    for (const entry of entries) console.log(entry);
  },
  { threshold: 0.5 },
);
foo(
  () => {
    doSomething();
  },
  a,
  b,
);
foo(
  a,
  () => {
    doSomething();
  },
  { x: 1 },
);
useCallback(
  (event) => {
    handle(event);
  },
  [a, b],
);
foo(
  () => {
    doSomething();
  },
  cond ? a : b,
);
foo(
  () => {
    doSomething();
  },
  bar(a, b),
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks every argument rather than breaking the parameter type of a hugged callback', async () => {
			const input = `cluster.on('open', (tunnel: { destroy: () => void; once: (event: string, handler: () => void) => void }) => {
  count++;
});
emitter.on("change", (value: { a: string; b: number }) => {
  count++;
});`;
			const expected = `cluster.on(
  "open",
  (tunnel: {
    destroy: () => void;
    once: (event: string, handler: () => void) => void;
  }) => {
    count++;
  },
);
emitter.on("change", (value: { a: string; b: number }) => {
  count++;
});`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('hugs a leading function followed by one short argument', async () => {
			const source = `setTimeout(() => {
  doSomething();
}, 500);
fn(() => {
  doSomething();
}, options);
fn(() => {
  doSomething();
}, bar(a));
fn(function () {
  doSomething();
}, 500);`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('lets the dependency array of a React hook break by itself', async () => {
			const input = `useEffect(() => { doSomething(); }, [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]);
useImperativeHandle(ref, () => { return api; }, [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]);
useMemo(async () => { await doSomething(); }, [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]);
useEffect(() => { doSomething(); }, [a, b]);`;
			const expected = `useEffect(() => {
  doSomething();
}, [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
]);
useImperativeHandle(ref, () => {
  return api;
}, [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
]);
useMemo(async () => {
  await doSomething();
}, [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
]);
useEffect(() => {
  doSomething();
}, [a, b]);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks every argument of function compositions', async () => {
			const input = `source.pipe(map((x) => x + x), filter((x) => x % 2 === 0));`;
			const expected = `source.pipe(
  map((x) => x + x),
  filter((x) => x % 2 === 0),
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		// The object stays on one line in the first pass. That the second pass
		// keeps it there too depends on the object's own layout (#314).
		it('breaks every argument instead of hugging a function after a broken object', async () => {
			const input = `function plugin() {
  return {
    setup(build) {
      build.onLoad({ filter: TSRX_EXTENSION_PATTERN, namespace: "file" }, async (args) => {
        return readFile(args.path, "utf-8");
      });
    },
  };
}
build.onLoad({ filter: TSRX_EXTENSION_PATTERN, namespace: "file" }, async (args) => {
  return readFile(args.path, "utf-8");
});`;
			const expected = `function plugin() {
  return {
    setup(build) {
      build.onLoad(
        { filter: TSRX_EXTENSION_PATTERN, namespace: "file" },
        async (args) => {
          return readFile(args.path, "utf-8");
        },
      );
    },
  };
}
build.onLoad(
  { filter: TSRX_EXTENSION_PATTERN, namespace: "file" },
  async (args) => {
    return readFile(args.path, "utf-8");
  },
);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('hugs a function after a short object', async () => {
			const source = `build.onLoad({ filter: PATTERN }, async (args) => {
  return readFile(args.path, "utf-8");
});`;
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('keeps the arguments of test calls, require calls, and AMD definitions on one line', async () => {
			const input = `it("does something really interesting with the value that it receives", async () => {
  expect(await run()).toBe(true);
});
describe.only("a long description of the behavior that this suite covers", () => {
  it("works", (done) => done());
});
it("encodes emojis", () => expect(entities.encodeNonAsciiHTML("aaaaaaaa")).toBe("bbbbbbbbbbbb"));
const policy = require("./policies/a/very/long/path/to/some/module/decompressResponsePolicy.js");
const resolved = require.resolve("./policies/a/very/long/path/to/some/module/that/does/not/fit.js");
define(["some/lib", "some/other/lib", "yet/another/lib/with/a/long/name"], (lib, other, yet) => {
  return lib;
});`;
			const expected = `it("does something really interesting with the value that it receives", async () => {
  expect(await run()).toBe(true);
});
describe.only("a long description of the behavior that this suite covers", () => {
  it("works", (done) => done());
});
it("encodes emojis", () =>
  expect(entities.encodeNonAsciiHTML("aaaaaaaa")).toBe("bbbbbbbbbbbb"));
const policy = require("./policies/a/very/long/path/to/some/module/decompressResponsePolicy.js");
const resolved =
  require.resolve("./policies/a/very/long/path/to/some/module/that/does/not/fit.js");
define(["some/lib", "some/other/lib", "yet/another/lib/with/a/long/name"], (
  lib,
  other,
  yet,
) => {
  return lib;
});`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks the arguments of a long curried call before the call on it', async () => {
			const input = `export default connect(mapStateToPropsWithAVeryLongName, mapDispatchToPropsWithALongName)(Component);`;
			const expected = `export default connect(
  mapStateToPropsWithAVeryLongName,
  mapDispatchToPropsWithALongName,
)(Component);`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});

	describe('new expression arguments break like call arguments', () => {
		it('puts each argument on its own line when they do not fit', async () => {
			const input = `const x = new Foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);`;
			const expected = `const x = new Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks a lone argument that cannot break by itself', async () => {
			const input = `throw new Error(\`Something went terribly wrong with the value \${value} and \${otherValue}\`);`;
			const expected = `throw new Error(
  \`Something went terribly wrong with the value \${value} and \${otherValue}\`,
);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a blank line between arguments', async () => {
			const input = `const x = new Foo(
  a,

  b,
);`;

			const result = await format(input);
			expect(result).toBeWithNewline(input);
		});

		it('expands a last object argument and hugs a lone callback', async () => {
			const input = `const formatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module", name: "background" });
const promise = new Promise<void>((resolve) => { setTimeout(resolve, 1000); });
const set = new Set([aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc]);`;
			const expected = `const formatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
  name: "background",
});
const promise = new Promise<void>((resolve) => {
  setTimeout(resolve, 1000);
});
const set = new Set([
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
]);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps short argument lists on one line', async () => {
			const source = `const a = new Foo();
const b = new Foo(first, second);
const c = new (getClass())(first, second);`;

			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		it('expands a last object or array argument through an as or satisfies cast', async () => {
			const input = `throw new MalformedNodeError({ type: NodeType.IndexedValue, index: id, other: somethingElse } as SerovalNode);
report({ type: NodeType.IndexedValue, index: id, other: somethingElseHere, more: 1 } satisfies Report);
const pair = new Pair(first, [aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccc] as const);`;
			const expected = `throw new MalformedNodeError({
  type: NodeType.IndexedValue,
  index: id,
  other: somethingElse,
} as SerovalNode);
report({
  type: NodeType.IndexedValue,
  index: id,
  other: somethingElseHere,
  more: 1,
} satisfies Report);
const pair = new Pair(first, [
  aaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccc,
] as const);`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('parenthesizes an optional chain only as the callee', async () => {
			const source = `const client = new HttpClient(system?.proxyUrl, options?.agent);
const widget = new (registry?.Widget)();`;

			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});
	});

	// Like Prettier, \`es5\` leaves out the commas ES5 cannot parse (after the
	// last argument or parameter), and \`all\` adds them.
	describe('trailing commas follow the trailingComma option', () => {
		const input = `foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
new Foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
function bar(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc) {}
const baz = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccc) => {};
interface Triple<Aaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccccccccccccc> {}
const values = [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc];
const object = { aaaaaaaaaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2, cccccc: 3 };`;

		/**
		 * @param {string} argumentComma - comma after the last argument or parameter
		 * @param {string} listComma - comma after the last type parameter, element, or property
		 */
		const expected = (argumentComma, listComma) => `foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc${argumentComma}
);
new Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc${argumentComma}
);
function bar(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc${argumentComma}
) {}
const baz = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccc${argumentComma}
) => {};
interface Triple<
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccccccccccccc${listComma}
> {}
const values = [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc${listComma}
];
const object = {
  aaaaaaaaaaaaaaaaaaaaaaaaaa: 1,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2,
  cccccc: 3${listComma}
};`;

		it.each([
			['all', ',', ','],
			['es5', '', ','],
			['none', '', ''],
		])('with trailingComma %s', async (trailingComma, argumentComma, listComma) => {
			const result = await format(input, {
				trailingComma: /** @type {'all' | 'es5' | 'none'} */ (trailingComma),
			});
			expect(result).toBeWithNewline(expected(argumentComma, listComma));
		});
	});

	describe('scoped <style> blocks with apply', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * `format` also checks the second pass is a fixpoint, so every case here
		 * doubles as an idempotence check.
		 * @param {string} source
		 */
		const expectUnchanged = async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		};

		it('formats a body-less <style apply={theme} /> inside a fragment', async () => {
			const input = `export function App(){return <><style apply={theme} /><div>{"hi"}</div></>}`;
			const expected = `export function App() {
  return (
    <>
      <style apply={theme} />
      <div>{"hi"}</div>
    </>
  );
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats a fragment holding <style apply={theme} /> and the output node in a @{} body', async () => {
			const input = `export function App()@{<><style apply={theme} /><div>{"hi"}</div></>}`;
			const expected = `export function App() @{
  <>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('does not expand a body-less block into <style></style>', async () => {
			// A lone block as the output of a @{} body parses (the analyzer
			// reports it); the formatter keeps the self-closing form.
			const result = await format(`export function Only()@{<style apply={theme} />}`);
			expect(result).toBeWithNewline(`export function Only() @{
  <style apply={theme} />
}`);
			expect(result).not.toContain('</style>');
		});

		it('keeps an explicitly empty <style apply={theme}></style> as authored', async () => {
			await expectUnchanged(`export function App() @{
  <>
    <style apply={theme}></style>
    <div>{"hi"}</div>
  </>
}`);
		});

		it('formats <style apply={[a, b]}> with a CSS body', async () => {
			const input = `export function App()@{<><style apply={[a,b]}>div{color:red}</style><div>{"hi"}</div></>}`;
			const expected = `export function App() @{
  <>
    <style apply={[a, b]}>
      div {
        color: red;
      }
    </style>
    <div>{"hi"}</div>
  </>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('breaks a long apply list across lines like any other attribute', async () => {
			const input = `export function App()@{<><style apply={[someVeryLongThemeName, anotherVeryLongThemeName, yetAnotherVeryLongThemeName]} /><div>{"hi"}</div></>}`;
			const expected = `export function App() @{
  <>
    <style
      apply={[
        someVeryLongThemeName,
        anotherVeryLongThemeName,
        yetAnotherVeryLongThemeName,
      ]}
    />
    <div>{"hi"}</div>
  </>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('preserves other attributes such as ref alongside apply', async () => {
			await expectUnchanged(`export function App() @{
  <>
    <style ref={x} apply={theme} />
    <div>{"hi"}</div>
  </>
}`);
		});

		it('formats multiple <style> blocks in one fragment of a @{} body', async () => {
			const input = `export function App()@{<><style>div{color:red}</style><style apply={theme} /><div>{"hi"}</div></>}`;
			const expected = `export function App() @{
  <>
    <style>
      div {
        color: red;
      }
    </style>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats multiple <style> blocks in one fragment', async () => {
			const input = `export function App(){return <><style apply={a} /><style apply={b}>p{margin:0}</style><p>{"x"}</p></>}`;
			const expected = `export function App() {
  return (
    <>
      <style apply={a} />
      <style apply={b}>
        p {
          margin: 0;
        }
      </style>
      <p>{"x"}</p>
    </>
  );
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('preserves authored blank lines between style blocks and their siblings', async () => {
			const input = `export function App()@{<>
<style apply={theme} />

<style>div{color:red}</style>


<div>{"hi"}</div></>}`;
			const expected = `export function App() @{
  <>
    <style apply={theme} />

    <style>
      div {
        color: red;
      }
    </style>

    <div>{"hi"}</div>
  </>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('keeps a blank line between setup statements and the fragment holding a style block', async () => {
			await expectUnchanged(`export function App() @{
  const x = 1;

  <>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}`);
		});

		it('keeps the lines after an assigned block as authored', async () => {
			const module_source = `const theme = <style>
  .card {
    color: red;
  }
</style>;
export { theme };`;
			const spaced_module_source = module_source.replace('\nexport', '\n\nexport');
			const component_source = `export function Themed() @{
  const theme = <style>
    .card {
      color: red;
    }
  </style>;

  <div class={theme.card}>{"card"}</div>
}`;
			for (const source of [module_source, spaced_module_source, component_source]) {
				await expectUnchanged(source);
				const without_semicolons = source.replace(/(<\/style>|\{ theme \});$/gm, '$1');
				expect(await format(without_semicolons, { semi: false })).toBeWithNewline(
					without_semicolons,
				);
				expect(await format(source, { semi: false })).toBeWithNewline(without_semicolons);
			}
		});

		it('keeps a leading comment on a style block', async () => {
			await expectUnchanged(`export function App() @{
  <>
    // theme
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}`);
		});

		it('formats a style block inside a fragment of a nested @{} block', async () => {
			const input = `export function App()@{<div>@{<><style apply={inner} /><span>{"x"}</span></>}</div>}`;
			const expected = `export function App() @{
  <div>@{
    <>
      <style apply={inner} />
      <span>{"x"}</span>
    </>
  }</div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats style blocks in fragments of @if and @else bodies', async () => {
			const input = `export function App()@{<div>@if(cond){<><style apply={a} /><span>{"x"}</span></>}@else{<><style apply={b} /><em>{"y"}</em></>}</div>}`;
			const expected = `export function App() @{
  <div>
    @if (cond) {
      <>
        <style apply={a} />
        <span>{"x"}</span>
      </>
    } @else {
      <>
        <style apply={b} />
        <em>{"y"}</em>
      </>
    }
  </div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats style blocks in fragments of @for bodies', async () => {
			const input = `export function App()@{<div>@for(const item of items){<><style apply={a} /><span>{item}</span></>}</div>}`;
			const expected = `export function App() @{
  <div>
    @for (const item of items) {
      <>
        <style apply={a} />
        <span>{item}</span>
      </>
    }
  </div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats style blocks in fragments of @switch case bodies', async () => {
			const input = `export function App()@{<div>@switch(v){@case 1: {<><style apply={a} /><span>{"x"}</span></>}@default: {<><style apply={b} /><em>{"y"}</em></>}}</div>}`;
			const expected = `export function App() @{
  <div>
    @switch (v) {
      @case 1: {
        <>
          <style apply={a} />
          <span>{"x"}</span>
        </>
      }
      @default: {
        <>
          <style apply={b} />
          <em>{"y"}</em>
        </>
      }
    }
  </div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats style blocks in fragments of @try and @catch bodies', async () => {
			const input = `export function App()@{<div>@try{<><style apply={a} /><span>{"x"}</span></>}@catch(e){<><style apply={b} /><em>{"err"}</em></>}</div>}`;
			const expected = `export function App() @{
  <div>
    @try {
      <>
        <style apply={a} />
        <span>{"x"}</span>
      </>
    } @catch (e) {
      <>
        <style apply={b} />
        <em>{"err"}</em>
      </>
    }
  </div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats a module-scope body-less bundle export', async () => {
			const result = await format(`export const bundle = <style apply={[a,b]} />;`);
			expect(result).toBeWithNewline(`export const bundle = <style apply={[a, b]} />;`);
		});

		it('formats a module-scope assigned block with a CSS body', async () => {
			const input = `const theme = <style apply={base}>div{color:red}</style>;`;
			const expected = `const theme = <style apply={base}>
  div {
    color: red;
  }
</style>;`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});
	});
});
