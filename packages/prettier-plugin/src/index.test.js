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
  return <Box<string> value={"hello"} />;
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
		const result = await format(input);
		expect(result).toBeWithNewline(input);
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

		it('still formats an element whose only comment is its child', async () => {
			// Like a JSX comment child, the comment doesn't dangle on the element
			const result = await format(`function App() @{
  const  x = 1;
  <div   a="1">
    // prettier-ignore
  </div>
}`);
			expect(result).toBeWithNewline(`function App() @{
  const x = 1;
  <div a="1">
    // prettier-ignore
  </div>
}`);
		});

		it('keeps the last node of a code block that an own-line prettier-ignore follows', async () => {
			// Like the last statement of a block, and not the whole code block
			const result = await format(`function App() @{
  const  x = 1;
  <span   a="1" />
  // prettier-ignore
}
function Setup() @{
  const  x = 1;
  const  y = 2;;
  // note
  // prettier-ignore
}
function Branch() @{
  @if (x) {
    <span   a="1" />
    // prettier-ignore
  }
}`);
			expect(result).toBeWithNewline(`function App() @{
  const x = 1;
  <span   a="1" />
  // prettier-ignore
}
function Setup() @{
  const x = 1;
  const  y = 2;
  // note
  // prettier-ignore
}
function Branch() @{
  @if (x) {
    <span   a="1" />
    // prettier-ignore
  }
}`);
		});

		it('still formats the last node of a code block that another comment follows', async () => {
			const result = await format(`function App() @{
  <span   a="1" />
  // prettier-ignore-start
}`);
			expect(result).toBeWithNewline(`function App() @{
  <span a="1" />
  // prettier-ignore-start
}`);
		});

		it('keeps an element after a prettier-ignore JSX comment child as written', async () => {
			// Prettier's \`hasJsxIgnoreComment\`, past whitespace with a line break
			const source = `function App() {
  return (
    <div>
      {/* prettier-ignore */}
      <span   a = "1"
        b =  "2">
          text   here
      </span>
      <b c="3" />
      {/* note */ /* prettier-ignore */}

      <>
        <i   x = "1" />
      </>
    </div>
  );
}
function Template() @{
  <div>
    {/* prettier-ignore */}
    <span   a = "1">
      {x}
    </span>
    <p> hi </p>
  </div>
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('still formats an element after a space or a {…} child that a prettier-ignore comment is in', async () => {
			const result = await format(`function App() {
  return (
    <div>
      {/* prettier-ignore */} <span   a = "1" />
      {/* prettier-ignore */}
      {x   +   y}
      {x /* prettier-ignore */}
      <b   c = "1" />
    </div>
  );
}`);
			expect(result).toBeWithNewline(`function App() {
  return (
    <div>
      {/* prettier-ignore */} <span a="1" />
      {/* prettier-ignore */}
      {x + y}
      {x /* prettier-ignore */}
      <b c="1" />
    </div>
  );
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

		// Like Prettier's `locStart`, an ignored parameter starts at its first
		// decorator, which the parser keeps outside its span
		it.each([
			'class A {\n  m(\n    // prettier-ignore\n    @a   x  : T,\n  ) {}\n}',
			'class A {\n  constructor(\n    // prettier-ignore\n    @a  @b()   private   x  : T,\n  ) {}\n}',
			// The parameter property prints the decorators and the modifiers
			'class A {\n  constructor(@dec private /* prettier-ignore */ x  : T) {}\n}',
		])('keeps the decorators of an ignored parameter in %j', async (source) => {
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

		it('drops the trailing comma of a dynamic import and keeps its options once', async () => {
			const input = `const a=import("./a.js",)
const data=import("./data.json",{with:{type:"json"}},)`;
			const expected = `const a = import("./a.js");
const data = import("./data.json", { with: { type: "json" } });`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		it('formats import attributes with more than one quoted key', async () => {
			const input = `import a from './a' with { 'a': 'x', 'b': 'y' };`;
			const expected = `import a from "./a" with { a: "x", b: "y" };`;
			const result = await format(input);
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

		// Prettier's `babel` parser keeps a JSDoc cast's parentheses as a
		// `ParenthesizedExpression`, whose expression prints the comments after
		// it inside them. They used to print after the parentheses, where a
		// comment after an element moved again on the next format (#521).
		it.each([
			[
				'const a = /** @type {X} */ (foo /* note */);',
				'const a = /** @type {X} */ (foo /* note */);',
			],
			[
				'const b = /** @type {X} */ (foo // note\n);',
				'const b = /** @type {X} */ (\n  foo // note\n);',
			],
			[
				'const d = /** @type {A} */ (/** @type {B} */ (foo /* b */) /* a */); /* z */',
				'const d = /** @type {A} */ (/** @type {B} */ (foo /* b */) /* a */); /* z */',
			],
			[
				'const e = /** @type {X} */ (foo /* in */) /* out */;',
				'const e = /** @type {X} */ (foo /* in */); /* out */',
			],
			['x = /** @type {X} */ (node /* c */).start;', 'x = /** @type {X} */ (node /* c */).start;'],
			['x = /** @type {X} */ (a + b /* c */) * 2;', 'x = /** @type {X} */ (a + b /* c */) * 2;'],
			['x = /** @type {X} */ (await foo /* c */);', 'x = /** @type {X} */ (await foo /* c */);'],
			['x = /** @type {X} */ ({ a: 1 } /* c */);', 'x = /** @type {X} */ ({ a: 1 } /* c */);'],
			['f(/** @type {X} */ (foo /* c */), b);', 'f(/** @type {X} */ (foo /* c */), b);'],
			[
				'function f() {\n  return /** @type {X} */ (foo /* note */);\n}',
				'function f() {\n  return /** @type {X} */ (foo /* note */);\n}',
			],
			[
				'function f() {\n  throw /** @type {X} */ (foo // note\n  );\n}',
				'function f() {\n  throw /** @type {X} */ (\n    foo // note\n  );\n}',
			],
			[
				'export default /** @type {X} */ (foo // note\n);',
				'export default /** @type {X} */ (\n  foo // note\n);',
			],
			[
				'x = <div a={/** @type {X} */ (a // c\n)} />;',
				'x = (\n  <div\n    a={\n      /** @type {X} */ (\n        a // c\n      )\n    }\n  />\n);',
			],
			[
				'const a = /** @type {X} */ (\n  // prettier-ignore\n  foo(  a  ) /* c */\n);',
				'const a = /** @type {X} */ (\n  // prettier-ignore\n  foo(  a  ) /* c */\n);',
			],
			[
				'const c = /** @type {X} */ (\n  foo\n  // note\n);',
				'const c = /** @type {X} */ (\n  foo\n  // note\n);',
			],
			// Pin: one after the parentheses stays after them
			[
				'const e = /** @type {X} */ (foo) /* note */;',
				'const e = /** @type {X} */ (foo); /* note */',
			],
		])('keeps the comments inside the parentheses of a cast in %j', async (input, expected) => {
			const once = await format(input);
			expect(once).toBeWithNewline(expected);
			expect(await format(once)).toBe(once);
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

		// Like Prettier, only an object or mapped type hugs a lone parameter's
		// parentheses, so props typed as a generic with an object type argument
		// break the parameter list
		it('should break the parameters around a lone object type argument of the props type', async () => {
			const input = `function Button(props: PropsWithExtras<{
	variant: string;
	label: string;
	onClick: EventListener;
}>) @{
	<button class={props.variant} onClick={props.onClick}>
		{props.label}
	</button>
}`;
			const expected = `function Button(
	props: PropsWithExtras<{
		variant: string;
		label: string;
		onClick: EventListener;
	}>,
) @{
	<button class={props.variant} onClick={props.onClick}>
		{props.label}
	</button>
}`;
			const options = { useTabs: true, tabWidth: 2, singleQuote: true, printWidth: 100 };
			const result = await format(input, options);
			expect(result).toBeWithNewline(expected);
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
			const expected = `<script lang="ts">
  const n: number = 1 < 2 ? 3 : 4;
  if (n < 2) {
    go('now');
  }
</script>`;

			const source = `<script lang="ts">const n:number=1<2?3:4;
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

		it('formats a JSON <script> body as JSON, like Prettier', async () => {
			// Prettier's HTML `inferScriptParser`: JSON, an import map, or speculation rules
			const result = await format(`export function App() @{
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
  </div>
}`);
			expect(result).toBeWithNewline(`export function App() @{
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
  </div>
}`);
		});

		it('keeps a <script> body of another type, or with src, as written', async () => {
			// Like Prettier's HTML printer, which has no parser for them
			const result = await format(`export function App() @{
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
  </div>
}`);
			expect(result).toBeWithNewline(`export function App() @{
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
  </div>
}`);
		});

		it('formats a <script> body of a code, Markdown, or HTML type like Prettier', async () => {
			const result = await format(`export function App() @{
  <div>
    <script type="module">let   a = 1</script>
    <script type="">let   a = 1</script>
    <script type="text/markdown">
      #   Title
    </script>
    <script type="text/html"><div><p>hi</p></div></script>
  </div>
}`);
			expect(result).toBeWithNewline(`export function App() @{
  <div>
    <script type="module">
      let a = 1;
    </script>
    <script type="">
      let a = 1;
    </script>
    <script type="text/markdown">
      # Title
    </script>
    <script type="text/html">
      <div><p>hi</p></div>
    </script>
  </div>
}`);
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

	// Like Prettier's `printCommentsForFunction`, a function called right away
	// or used as a template tag prints its comments inside its parentheses,
	// which break around them where nothing groups them. They used to print
	// outside (#482).
	describe('comments on a function called right away or used as a tag', () => {
		it.each([
			['(/* c */ function () {})();', '(\n  /* c */ function () {}\n)();'],
			['(/* c */ () => {})();', '(\n  /* c */ () => {}\n)();'],
			['(function () {} /* c */)();', '(\n  function () {} /* c */\n)();'],
			['(m => m /* c */)(x);', '(\n  (m) => m /* c */\n)(x);'],
			['(function () {} /* a */ /* b */)(x);', '(\n  function () {} /* a */ /* b */\n)(x);'],
			['(m => m /* c */)`x`;', '(\n  (m) => m /* c */\n)`x`;'],
			['x = (m => m /* c */)(x);', 'x = ((m) => m /* c */)(x);'],
			['(/* c */ function () {})`x`;', '(\n  /* c */ function () {}\n)`x`;'],
			['(/* c */ async () => {})?.();', '(\n  /* c */ async () => {}\n)?.();'],
			['(function () {} // c\n)();', '(\n  function () {} // c\n)();'],
			['!(/* c */ function () {})();', '!(\n  /* c */ function () {}\n)();'],
			['x = (/* c */ function () {})();', 'x = (/* c */ function () {})();'],
			['x = (/* c */ () => {})`x`;', 'x = (/* c */ () => {})`x`;'],
			[
				'(/* c */ function () {\n  run();\n})();',
				'(\n  /* c */ function () {\n    run();\n  }\n)();',
			],
			[
				'(\n  // prettier-ignore\n  function () {  }\n)();',
				'(\n  // prettier-ignore\n  function () {  }\n)();',
			],
		])('prints %j like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'(\n  // c\n  function () {}\n)();',
			'x = (\n  // c\n  function () {}\n)();',
			'const y = (\n  // c\n  () => {\n    run();\n  }\n)();',
			'foo((/* c */ () => {})());',
			'export default (\n  /* c */ function () {}\n)();',
			// Like Prettier's `returnArgumentHasLeadingComment`, a `return` counts
			// the comments of the leftmost operand
			'function g() {\n  return (\n    (\n      // c\n      function () {}\n    )()\n  );\n}',
			'function* g() {\n  yield (\n    // c\n    function () {}\n  )();\n}',
			'a;\n(\n  /* c */ function () {}\n)();',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('puts the leading semicolon before the parentheses with semi: false', async () => {
			expect(await format('a\n;(/* c */ function () {})()', { semi: false })).toBeWithNewline(
				'a\n;(\n  /* c */ function () {}\n)()',
			);
		});

		// Prettier prints the parentheses around the arrow function's body as
		// nothing, with the comment in them before the `)` around the arrow
		// function, and its next pass gives the comment to the arrow function,
		// which prints it inside those parentheses. The formatter prints the
		// fixpoint (#634).
		it.each([
			['((a) => (b /* c */))(1);', '(\n  (a) => b /* c */\n)(1);'],
			['((a) => ((b /* c */)))(1);', '(\n  (a) => b /* c */\n)(1);'],
			['((a) => (b /* c */\n))(1);', '(\n  (a) => b /* c */\n)(1);'],
			['((a) => (b.c /* c */))(1);', '(\n  (a) => b.c /* c */\n)(1);'],
			['((a) => ({} /* c */))(1);', '(\n  (a) => ({}) /* c */\n)(1);'],
			['((a) => (b /* c */))`x`;', '(\n  (a) => b /* c */\n)`x`;'],
			['((a) => (b // c\n))(1);', '(\n  (a) => b // c\n)(1);'],
			['const x = ((a) => (b // c\n))(1);', 'const x = (\n  (a) => b // c\n)(1);'],
		])('prints %j in one pass', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'const x = ((a) => b /* c */)(1);',
			'((a) => (b, c /* c */))(1);',
			'((a) => (a ? b : c /* c */))(1);',
			'(\n  (a) => b /* c */ /* d */\n)(1);',
			'f((a) => b /* c */);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// A comment on a line of its own after the body isn't one of these,
		// and keeps the place it had, which the next pass keeps too
		it.each([
			['((a) => (b\n  /* c */))(1);', '((a) => b)(/* c */ 1);'],
			['((a) => (b\n  // c\n))(1);', '((a) => b)(\n  // c\n  1,\n);'],
		])('formats %j as before', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Only a call's callee or a tag counts: the comments of a function
		// that is a member object or a `new` callee print outside
		it.each([
			'/* c */ (function () {}).call(this);',
			'new /* c */ (function () {})();',
			'x = /* c */ function () {};',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier, which keeps the key's range as a node of the mapped
		// type, a comment after it stays there. The formatter used to delete it
		// (#484).
		it('keeps a comment after the type a mapped type ranges over', async () => {
			const source = `type M = { [K in keyof T /* c */]: T[K] };
type N = { [K in T /* c */]: T[K] };
type O = { [K in keyof T /* c */ as X]: T[K] };`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'type U = {\n  [K in T // c\n  ]: T[K];\n};',
				'type U = {\n  [\n    K in T // c\n  ]: T[K];\n};',
			],
			['type X = { [K in T] /* c */ : T[K] };', 'type X = { [K in T /* c */]: T[K] };'],
			[
				'type E = {\n  [K in T] // c\n  : T[K];\n};',
				'type E = {\n  [\n    K in T // c\n  ]: T[K];\n};',
			],
		])('moves the comment in %j after the type the key ranges over', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Prettier prints an own-line comment before the `]` after the `:`, and
		// its next pass moves it back before the `]`, at the end of the key's
		// line. It stays on its own line before the `]`.
		it('keeps an own-line comment before the ] of a mapped type key there', async () => {
			const input = 'type U = {\n  [K in T\n  // c\n  ]: T[K];\n};';
			const expected = 'type U = {\n  [\n    K in T\n    // c\n  ]: T[K];\n};';
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A comment after the `[` used to move before it
		it.each([
			'type V = { [/* c */ K in T]: T[K] };',
			'type A = {\n  [\n    // c\n    K in T\n  ]: T[K];\n};',
			`type Q = { [K in /* c */ T]: T[K] };
type R = { [K in T as /* c */ X]: T[K] };
type S = { [K in T as X /* c */]: T[K] };
type W = { /* c */ [K in T]: T[K] };
type Y = { [K in T]: /* c */ T[K] };
type Z = { [K in T]: T[K] /* c */ };`,
		])('keeps the comments of %j in a mapped type', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

	// Prettier's `printKey` with the `typescript` parser: `quoteProps` decides
	// which keys lose or gain quotes, for objects, classes, interfaces, type
	// literals, enums, and import attributes alike.
	describe('property keys are quoted like Prettier', () => {
		/**
		 * Assert the input is already formatted and comes back byte-identical.
		 * @param {string} source
		 */
		const expectKeysUnchanged = async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		};

		it('unquotes the keys that are identifiers with quoteProps as-needed', async () => {
			const input = `interface A {
  "a": string;
  readonly "b-c"?: number;
  "m"(): void;
  get "g"(): string;
  "1": boolean;
}
type B = { "c": boolean; "d-e": string };
enum E {
  "x" = 1,
  "y-z" = 2,
  "w",
}
const o = { "a": 1, "b"() {}, get "c"() { return 1; }, "café": 2 };
const { "p": q, "r-s": t } = o;
import data from "./data.json" with { "type": "json" };`;

			expect(await format(input)).toBeWithNewline(`interface A {
  a: string;
  readonly "b-c"?: number;
  m(): void;
  get g(): string;
  "1": boolean;
}
type B = { c: boolean; "d-e": string };
enum E {
  x = 1,
  "y-z" = 2,
  w,
}
const o = {
  a: 1,
  b() {},
  get c() {
    return 1;
  },
  café: 2,
};
const { p: q, "r-s": t } = o;
import data from "./data.json" with { type: "json" };`);
		});

		// `{ 1: a }` and `{ "1": a }` have different `keyof` types, `new(): T` is
		// a construct signature, an escape stays as written, and a letter outside
		// ES5's identifiers (Unicode 9, no astral planes) keeps its quotes
		it('keeps the quotes that change a key or that ES5 needs', async () => {
			await expectKeysUnchanged(`interface A {
  "new"(): A;
  "1": string;
  2: string;
}
const o = { "\\u0061": 1, "1": 2, 1.5: 3, "𝒶": 4 };`);
		});

		// With `strictPropertyInitialization`, TypeScript reports a field named
		// by an identifier that isn't assigned (`d: number` without a value), but
		// not a field named by a string (`"d": number`, microsoft/TypeScript#20075).
		// Unquoting it would add that error, so class fields keep their quotes,
		// like Prettier with the `typescript` parser. Methods and abstract
		// fields, which TypeScript never checks, unquote.
		it('keeps the quotes of class fields, which TypeScript checks differently', async () => {
			const input = `class C {
  "d": number;
  "e" = 1;
  static "f" = 2;
  declare "g": string;
  "h"() {}
  get "i"() { return 1; }
}
abstract class D {
  abstract "j": string;
  private "k" = 1;
}`;

			expect(await format(input)).toBeWithNewline(`class C {
  "d": number;
  "e" = 1;
  static "f" = 2;
  declare "g": string;
  h() {}
  get i() {
    return 1;
  }
}
abstract class D {
  abstract j: string;
  private "k" = 1;
}`);
		});

		// Unlike Prettier, which unquotes it: TypeScript checks that an `accessor`
		// field named by an identifier is assigned, like any other field
		it('keeps the quotes of an accessor field', async () => {
			await expectKeysUnchanged(`class C {
  accessor "a": number;
  accessor b = 1;
}`);
		});

		it('quotes every key it can when one needs quotes with quoteProps consistent', async () => {
			const input = `const o = { a: 1, "b-c": 2, 1: 3, "d": 4 };
const p = { "a": 1, b: 2 };
interface I {
  a: string;
  "b-c": number;
}
enum E {
  a = 1,
  "b" = 2,
}`;

			expect(await format(input, { quoteProps: 'consistent' }))
				.toBeWithNewline(`const o = { "a": 1, "b-c": 2, 1: 3, "d": 4 };
const p = { a: 1, b: 2 };
interface I {
  "a": string;
  "b-c": number;
}
enum E {
  a = 1,
  b = 2,
}`);
			expect(await format(input, { quoteProps: 'consistent', singleQuote: true }))
				.toBeWithNewline(`const o = { 'a': 1, 'b-c': 2, 1: 3, 'd': 4 };
const p = { a: 1, b: 2 };
interface I {
  'a': string;
  'b-c': number;
}
enum E {
  a = 1,
  b = 2,
}`);
		});

		// Unlike Prettier, which quotes `a` too: quoting a field changes what
		// TypeScript checks just like unquoting it does
		it('quotes the methods of a class but not its fields with quoteProps consistent', async () => {
			const input = `class C {
  a = 1;
  "b-c" = 2;
  m() {}
}`;

			expect(await format(input, { quoteProps: 'consistent' })).toBeWithNewline(`class C {
  a = 1;
  "b-c" = 2;
  "m"() {}
}`);
		});

		it('keeps every key as written with quoteProps preserve', async () => {
			const source = `interface A {
  "a": string;
  b: number;
}
enum E {
  "x" = 1,
  y = 2,
}
const o = { "a": 1, b: 2 };
import data from "./data.json" with { "type": "json" };`;

			expect(await format(source, { quoteProps: 'preserve' })).toBeWithNewline(source);
		});

		it('keeps the comments of a key it unquotes', async () => {
			const input = `const o = {
  // leading
  "a": 1,
  "b" /* after the key */: 2,
  /* before the key */ "c": 3,
};
enum E {
  "x" /* after the key */ = 1,
}`;

			expect(await format(input)).toBeWithNewline(`const o = {
  // leading
  a: 1,
  b /* after the key */: 2,
  /* before the key */ c: 3,
};
enum E {
  x /* after the key */ = 1,
}`);
		});

		it('keeps the comment of a key after a modifier, get, async, or a decorator', async () => {
			await expectKeysUnchanged(`class A {
  @dec /* a */ "a-b" = 1;
  static /* b */ "c-d" = 1;
  get /* c */ "e-f"() {
    return 1;
  }
}
const o = {
  async /* d */ "g-h"() {},
};`);
			const input = `class A {
  static /* b */ "cd" = 1;
  get /* c */ "ef"() {
    return 1;
  }
}
interface I {
  readonly /* d */ "gh": string;
}`;

			expect(await format(input)).toBeWithNewline(`class A {
  static /* b */ "cd" = 1;
  get /* c */ ef() {
    return 1;
  }
}
interface I {
  readonly /* d */ gh: string;
}`);
		});

		// Without semicolons, a member named `get` or `in` needs one where it
		// would read as a modifier or an operator, also when it's unquoted
		it('keeps the semicolon a key needs once it is unquoted', async () => {
			const input = `interface I {
  "get"
  a: string
}
class C {
  x = a
  "in"() {}
}`;

			expect(await format(input, { semi: false })).toBeWithNewline(`interface I {
  get;
  a: string
}
class C {
  x = a;
  in() {}
}`);
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

		// Like Prettier, a string in braces stays an expression container, and
		// its quotes follow `singleQuote` rather than `jsxSingleQuote` (#408)
		it.each([
			[`title={'Say "hello"'}`, `title={'Say "hello"'}`],
			[`title="Say &quot;hello&quot;"`, `title='Say "hello"'`],
			[`title='x "y" &apos;z&apos;'`, `title="x &quot;y&quot; 'z'"`],
			[`title="&amp;amp;"`, `title="&amp;amp;"`],
			[`title="a &#34;b&#34;"`, `title="a &#34;b&#34;"`],
			[`title={'&amp;'}`, `title={"&amp;"}`],
			[`title={"It's \\"both\\""}`, `title={'It\\'s "both"'}`],
			[`title={'\\ud800'}`, `title={"\\ud800"}`],
			[`title={'a\\nb'}`, `title={"a\\nb"}`],
			[`title={'It\\'s'}`, `title={"It's"}`],
			[`title={'hello'}`, `title={"hello"}`],
			[`title={/* c */ 'x'} alt={'y' /* d */}`, `title={/* c */ "x"} alt={"y" /* d */}`],
		])('prints %s as %s', async (input, expected) => {
			const result = await format(wrap(input));
			expect(result).toBeWithNewline(wrap(expected));
		});

		it('keeps the braces around a string with jsxSingleQuote', async () => {
			const result = await format(wrap(`title={"It's ready"} alt="Say &apos;hi&apos;"`), {
				jsxSingleQuote: true,
			});
			expect(result).toBeWithNewline(wrap(`title={"It's ready"} alt="Say 'hi'"`));
		});

		it('keeps the braces around a string in a template', async () => {
			const input = `export function App() @{
  <div class={"foo"} title={'It\\'s'}>{"text"}</div>
}`;
			const expected = `export function App() @{
  <div class={'foo'} title={"It's"}>
    {'text'}
  </div>
}`;
			expect(await format(input, { singleQuote: true })).toBeWithNewline(expected);
		});

		// Prettier keeps an opening element with one string attribute on one
		// line, but not one with a string in braces, which breaks like any
		// other expression container
		it('breaks a long string in braces like an expression container', async () => {
			const input = `export function App() {
  return <div title={"a very long string value that goes on and on and on and on and on and on and on"}>x</div>;
}
export function B() {
  return <div title={"a very long string value that goes on and on and on and on and on and on and on and on"}>x</div>;
}
export function C() {
  return <div title="a very long string value that goes on and on and on and on and on and on and on and on">x</div>;
}`;
			const expected = `export function App() {
  return (
    <div title={"a very long string value that goes on and on and on and on and on and on and on"}>
      x
    </div>
  );
}
export function B() {
  return (
    <div
      title={
        "a very long string value that goes on and on and on and on and on and on and on and on"
      }
    >
      x
    </div>
  );
}
export function C() {
  return (
    <div title="a very long string value that goes on and on and on and on and on and on and on and on">
      x
    </div>
  );
}`;
			expect(await format(input, { printWidth: 100 })).toBeWithNewline(expected);
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
			// value in a call or an array, stays bare. A conditional branch breaks
			// inside the parentheses of the conditional's JSX mode, like an element.
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
const cond = a ? (
  @if (b) {
    <c />
  }
) : null;
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

		// A comment before a child is a child of its own in TSX, `{/* c */}`, so
		// whether the text after the child starts a line depends on the child
		// alone. A comment on a line of its own before a child that breaks kept
		// that text on the child's last line, and a comment that joined the
		// opening tag's line moved it on the next format (#640).
		it.each([
			'<div>\n\t/* c */\n\t<span>\n\t\t<b>1</b>\n\t</span> 3\n</div>',
			'<div>\n\t/* a */\n\t/* b */\n\t<span>\n\t\t<b>1</b>\n\t</span> 3\n</div>',
			'<div>\n\t/* c */\n\t{cond && (\n\t\t<b>\n\t\t\t<i />\n\t\t</b>\n\t)} 3\n</div>',
			'<main>\n\t{x && (\n\t\t<div>\n\t\t\t/* c */\n\t\t\t<span>\n\t\t\t\t<b>1</b>\n\t\t\t</span> 3\n\t\t</div>\n\t)}\n</main>',
			// A child that fits keeps the text on its line
			'<div>\n\t/* c */\n\t<i /> 3\n</div>',
		])(
			'lays out the text after the child with a comment before it in %j like TSX',
			async (element) => {
				const template = await format(
					`export function Page() @{\n\t${element.replace(/\n/g, '\n\t')}\n}`,
					repoOptions,
				);
				const tsx = await prettier.format(
					`export function Page() {\n\t${element.replace(/\/\* \w \*\//g, '{$&}').replace(/\n/g, '\n\t')};\n}`,
					{ parser: 'typescript', ...repoOptions },
				);
				expect(template).toBe(
					tsx
						.replace('Page() {', 'Page() @{')
						.replace(/;\n}\n$/, '\n}\n')
						.replace(/\{(\/\* \w \*\/)\}/g, '$1'),
				);
			},
		);

		it.each([
			[
				'export function App() @{\n  <div> /* c */\n    <span>\n      <b>1</b>\n    </span> 3</div>\n}',
				'export function App() @{\n  <div>\n    /* c */\n    <span>\n      <b>1</b>\n    </span>{" "}\n    3\n  </div>\n}',
			],
			[
				'export function App() @{\n  <div>\n    /* c */\n    <span>\n      <b>1</b>\n    </span> 3</div>\n}',
				'export function App() @{\n  <div>\n    /* c */\n    <span>\n      <b>1</b>\n    </span>{" "}\n    3\n  </div>\n}',
			],
			[
				'export function App() @{\n  <div>\n    // c\n    <span>\n      <b>1</b>\n    </span> 3</div>\n}',
				'export function App() @{\n  <div>\n    // c\n    <span>\n      <b>1</b>\n    </span>{" "}\n    3\n  </div>\n}',
			],
			[
				'const a = <div>\n  // c\n  {cond && (\n    <b>\n      <i />\n    </b>\n  )} 3</div>;',
				'const a = (\n  <div>\n    // c\n    {cond && (\n      <b>\n        <i />\n      </b>\n    )}{" "}\n    3\n  </div>\n);',
			],
		])(
			'starts the text after the multi-line child with a comment before it in %j on a line',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// Comments before a child are `{/* c */}` children in TSX: a line break
		// in the source after one keeps the next child on a line of its own, and
		// a blank line after one is kept only when the element has no text. A
		// comment that ended its line after other code joined the next line when
		// the element had text, and the child after it on the next format (#669).
		// A blank line after a comment stayed in an element with text (#684). The
		// comments before a `{…}` child took a line each, and a blank line after
		// them was dropped even without text (#736).
		it.each([
			'<div>/* a */\n/* b */\n<i /> 3</div>',
			'<div>\n/* a */ /* b */\n\n<i /> 3</div>',
			'<div>/* a */\n<i /> 3</div>',
			'<div>\n/* a */ /* b */\n<i /> 3</div>',
			'<div>\n/* c */\n\n<b /> text\n</div>',
			'<div>\n/* a */\n\n/* b */\n<b /> text\n</div>',
			'<div>\n<i />\n/* c */\n\n<b /> text\n</div>',
			'<div>\n/* c */\n\n{x}\n</div>',
			'<div>\n/* a */ /* b */\n{x} text\n</div>',
			'<div>\n/* c */ {x}\n</div>',
			'<div>\n/* a */\n/* b */ {x} 3\n</div>',
			'<div>\n/* a */ /* b */{x}\n</div>',
			// Already like TSX
			'<div>/* a */\n/* b */\n<i /></div>',
			'<div>\n/* c */\n\n<b />\n</div>',
			'<div>\n/* c */\n\n{x} text\n</div>',
			'<div>\n/* a */\n/* b */ <i /> 3</div>',
			'<div>\n<i /> /* a */\n/* b */\n<b /> text\n</div>',
			'<p>/* c */{name}</p>',
		])('lays out the comments before the child in %j like TSX', async (element) => {
			const template = await format(
				`export function Page() @{\n\t${element.replace(/\n/g, '\n\t')}\n}`,
				repoOptions,
			);
			const tsx = await prettier.format(
				`export function Page() {\n\t${element.replace(/\/\* \w \*\//g, '{$&}').replace(/\n/g, '\n\t')};\n}`,
				{ parser: 'typescript', ...repoOptions },
			);
			expect(template).toBe(
				tsx
					.replace('Page() {', 'Page() @{')
					.replace(/;\n}\n$/, '\n}\n')
					.replace(/\{(\/\* \w \*\/)\}/g, '$1'),
			);
		});

		it.each([
			[
				'const a = <div>/* a */\n/* b */\n<i /> 3</div>;',
				'const a = (\n  <div>\n    /* a */\n    /* b */\n    <i /> 3\n  </div>\n);',
			],
			[
				'const b = <div>\n/* a */ /* b */\n\n<i /> 3</div>;',
				'const b = (\n  <div>\n    /* a */ /* b */\n    <i /> 3\n  </div>\n);',
			],
			[
				'export function App() @{ <div>/* a */\n/* b */\n<i /> 3</div> }',
				'export function App() @{\n  <div>\n    /* a */\n    /* b */\n    <i /> 3\n  </div>\n}',
			],
			[
				'const a = (\n  <div>\n    // c\n\n    <b /> text\n  </div>\n);',
				'const a = (\n  <div>\n    // c\n    <b /> text\n  </div>\n);',
			],
			[
				'const a = (\n  <div>\n    {y}\n    // c\n\n    {z} text\n  </div>\n);',
				'const a = (\n  <div>\n    {y}\n    // c\n    {z} text\n  </div>\n);',
			],
			[
				'const a = (\n  <div>\n    // a\n    /* b */ {z} text\n  </div>\n);',
				'const a = (\n  <div>\n    // a\n    /* b */ {z} text\n  </div>\n);',
			],
		])(
			'keeps the line breaks after the comments before the child in %j like TSX',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// Without text, a blank line after a line comment stays, as between
		// children
		it.each([
			'const a = (\n  <div>\n    // c\n\n    <b />\n  </div>\n);',
			'const a = (\n  <div>\n    {y}\n    // c\n\n    {z}\n  </div>\n);',
		])('keeps the blank line after the comment before the child in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// A comment in text adds nothing to it, so the whitespace on its sides is
		// one run, significant at the text's edge. It keeps its meaning where the
		// body breaks around the comment.
		it('renders the same markup with comments in text after formatting', async () => {
			const input = `export function EdgeStart() @{
  <div>/* c */ x<b /></div>
}
export function EdgeEnd() @{
  <div><b />x /* c */</div>
}
export function BeforeChild() @{
  <div>text /* c */<b /></div>
}
export function Between() @{
  <p>a /* c */ b<i /></p>
}
export function OwnLine() @{
  <p>
    a
    // c
    b
    <i />
  </p>
}
export function Glued() @{
  <p>a/* c */b<i /></p>
}
export function Long() @{
  <p>
    Some text that goes past the print width once it is indented /* a comment */<b>bold</b>
  </p>
}
export function AfterChild() @{
  <p>{'x'}/* c */cc</p>
}
export function AfterLastChild() @{
  <p>{'x'}/* c */</p>
}
export function LineAfterChild() @{
  <p><b>t</b>// c
    c</p>
}
export function SpaceBeforeComment() @{
  <p>{'a'}{' '}
    // c
    {'b'}</p>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(`export function EdgeStart() @{
  <div>
    {" "}
    /* c */ x<b />
  </div>
}
export function EdgeEnd() @{
  <div>
    <b />x /* c */{" "}
  </div>
}
export function BeforeChild() @{
  <div>
    text /* c */<b />
  </div>
}
export function Between() @{
  <p>
    a /* c */ b<i />
  </p>
}
export function OwnLine() @{
  <p>
    a
    // c
    b
    <i />
  </p>
}
export function Glued() @{
  <p>
    a/* c */b<i />
  </p>
}
export function Long() @{
  <p>
    Some text that goes past the print width once it is indented /* a comment */<b>
      bold
    </b>
  </p>
}
export function AfterChild() @{
  <p>{"x"}/* c */cc</p>
}
export function AfterLastChild() @{
  <p>
    {"x"} /* c */
  </p>
}
export function LineAfterChild() @{
  <p>
    <b>t</b>// c
    c
  </p>
}
export function SpaceBeforeComment() @{
  <p>
    {"a"}{" "}
    // c
    {"b"}
  </p>
}`);
			expect(await render(result)).toEqual(await render(input));
			expect(await render(input)).toEqual([
				'<div> x<b></b></div>',
				'<div><b></b>x </div>',
				'<div>text <b></b></div>',
				'<p>a b<i></i></p>',
				'<p>a b<i></i></p>',
				'<p>ab<i></i></p>',
				'<p>Some text that goes past the print width once it is indented <b>bold</b></p>',
				'<p>xcc</p>',
				'<p>x</p>',
				'<p><b>t</b>c</p>',
				'<p>a b</p>',
			]);
		});

		// The text after a closing tag starts at the tag, so the parser keeps a
		// space there (#442), and a comment on the next line leaves the line
		// break in the text (#540)
		it('renders the same markup with text after closing tags after formatting', async () => {
			const input = `export function NestedClose() @{
  <div>
    <span>
      <b>1</b>
    </span> 2
  </div>
}
export function CommentAfterClose() @{
  <div>
    <b>t</b>
    /* c */<i />
  </div>
}`;
			const result = await format(input);
			expect(result).toBeWithNewline(`export function NestedClose() @{
  <div>
    <span>
      <b>1</b>
    </span>{" "}
    2
  </div>
}
export function CommentAfterClose() @{
  <div>
    <b>t</b>
    /* c */ <i />
  </div>
}`);
			expect(await render(result)).toEqual(await render(input));
			expect(await render(input)).toEqual([
				'<div><span><b>1</b></span> 2</div>',
				'<div><b>t</b><i></i></div>',
			]);
		});

		// A non-breaking space is text, not JSX whitespace, so it stays when the
		// body breaks and it starts a line (#444)
		it('keeps a non-breaking space that starts a line after formatting', async () => {
			expect(
				await format('export function App() @{\n  <div>\u00a0<b>x</b></div>\n}'),
			).toBeWithNewline('export function App() @{\n  <div>\n    \u00a0<b>x</b>\n  </div>\n}');
		});

		// `//` at the start of a line of text is a comment, so a word that starts
		// with it stays on the line of the word before it, where it is text. It
		// used to wrap to the start of a line, and the rest of the line was lost
		// (#541).
		it('renders a word that starts with // the same after formatting', async () => {
			const input = `export function Wrapped() @{
	<div>${'a'.repeat(40)} ${'b'.repeat(53)} // ${'c'.repeat(16)} dddd</div>
}
export function AfterComment() @{
	<div>${'a'.repeat(40)} ${'b'.repeat(45)} /* c */ //x dddd</div>
}
export function Short() @{
	<div>a // b</div>
}`;
			const result = await format(input, { useTabs: true, printWidth: 100 });
			expect(result).toBeWithNewline(`export function Wrapped() @{
	<div>
		${'a'.repeat(40)}
		${'b'.repeat(53)} // ${'c'.repeat(16)} dddd
	</div>
}
export function AfterComment() @{
	<div>
		${'a'.repeat(40)} ${'b'.repeat(45)} /* c */ //x
		dddd
	</div>
}
export function Short() @{
	<div>a // b</div>
}`);
			expect(await render(result)).toEqual(await render(input));
			expect(await render(input)).toEqual([
				`<div>${'a'.repeat(40)} ${'b'.repeat(53)} // ${'c'.repeat(16)} dddd</div>`,
				`<div>${'a'.repeat(40)} ${'b'.repeat(45)} //x dddd</div>`,
				'<div>a // b</div>',
			]);
		});

		// Right after a child, `//` is a comment too, so such a word is text only
		// after a comment there. A `{" "}` keeps that comment, and the JSX space
		// before the word broke the line before it.
		it('renders a word that starts with // after a child the same after formatting', async () => {
			const text = 'Some text that goes past the print width once it is indented, and then more';
			const input = `export function AfterSpace() @{
	<p>${text} {' '}/* c */ //xxxxxxxxxx ends here</p>
}
export function AfterSpaceGlued() @{
	<p>${text} {' '}/* c *///xxxxxxxxxxx ends here</p>
}
export function AfterElement() @{
	<p>${text} <b>t</b>/* c */ //xxxxxxxxxx ends here</p>
}
export function AfterSelfClosing() @{
	<p>${text} <br />/* c */ //xxxxxxxxxx ends here</p>
}
export function AfterExpression() @{
	<p>${text} {'t'}/* c */ //xxxxxxxxxx ends here</p>
}
export function AfterFragment() @{
	<p>${text} <>t</>/* c */ //xxxxxxxxxx ends here</p>
}`;
			const result = await format(input, { useTabs: true, singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(`export function AfterSpace() @{
	<p>
		${text}{' '}
		{' '}/* c */ //xxxxxxxxxx ends here
	</p>
}
export function AfterSpaceGlued() @{
	<p>
		${text}{' '}
		{' '}/* c *///xxxxxxxxxxx ends here
	</p>
}
export function AfterElement() @{
	<p>
		${text} <b>t</b>/* c */ //xxxxxxxxxx
		ends here
	</p>
}
export function AfterSelfClosing() @{
	<p>
		${text} <br />/* c */ //xxxxxxxxxx
		ends here
	</p>
}
export function AfterExpression() @{
	<p>
		${text} {'t'}/* c */ //xxxxxxxxxx
		ends here
	</p>
}
export function AfterFragment() @{
	<p>
		${text} <>t</>/* c */ //xxxxxxxxxx
		ends here
	</p>
}`);
			expect(await render(result)).toEqual(await render(input));
			expect(await render(input)).toEqual([
				`<p>${text} //xxxxxxxxxx ends here</p>`,
				`<p>${text} //xxxxxxxxxxx ends here</p>`,
				`<p>${text} <b>t</b> //xxxxxxxxxx ends here</p>`,
				`<p>${text} <br></br> //xxxxxxxxxx ends here</p>`,
				`<p>${text} t //xxxxxxxxxx ends here</p>`,
				`<p>${text} t //xxxxxxxxxx ends here</p>`,
			]);
		});

		it('keeps a word that starts with // off the start of a line in JSX text', async () => {
			const input = `const a = <div>${'a'.repeat(40)} ${'b'.repeat(53)} // cc dd</div>;`;
			expect(await format(input, { useTabs: true, printWidth: 100 })).toBeWithNewline(
				`const a = (\n\t<div>\n\t\t${'a'.repeat(40)}\n\t\t${'b'.repeat(53)} // cc dd\n\t</div>\n);`,
			);
		});

		// A block comment after a `{" "}` keeps the spaces around it (#542)
		it('renders the same markup with a block comment after a {" "}', async () => {
			const input = `export function Glued() @{
	<div>x{' '}/* c */y</div>
}
export function LineAfter() @{
	<div>
		x{' '} /* c */
		y
	</div>
}
export function Spaced() @{
	<div>x{' '} /* c */ y</div>
}`;
			const result = await format(input, { useTabs: true, singleQuote: true });
			expect(result).toBeWithNewline(`export function Glued() @{
	<div>x{' '}/* c */y</div>
}
export function LineAfter() @{
	<div>x{' '}/* c */y</div>
}
export function Spaced() @{
	<div>x{' '} /* c */ y</div>
}`);
			expect(await render(result)).toEqual(await render(input));
			expect(await render(input)).toEqual(['<div>x y</div>', '<div>x y</div>', '<div>x y</div>']);
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

		// Like Prettier's `shouldHugTheOnlyFunctionParameter`, only an object or
		// mapped type hugs a lone parameter's parentheses, not an intersection or
		// a generic type that ends in one
		it('breaks the parameters around a lone parameter typed as an intersection or generic with an object type', async () => {
			const input = `function g(e: E & { currentTarget: Tttttttttttttttttt; target: Tttttttttttttttttttttttttttttt }) {}
function f(args: VoidIfEmpty<{ readonly aaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number }>) {}
const h = (args: VoidIfEmpty<{ readonly aaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number }>) => {};
type H = { (e: E & { currentTarget: Tttttttttttttttttt; target: Tttttttttttttttttttttttttttttt }): void };
type F = (args: VoidIfEmpty<{ readonly aaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number }>) => A;`;
			const expected = `function g(
  e: E & {
    currentTarget: Tttttttttttttttttt;
    target: Tttttttttttttttttttttttttttttt;
  },
) {}
function f(
  args: VoidIfEmpty<{
    readonly aaaaaaaaaaaaa: string;
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
  }>,
) {}
const h = (
  args: VoidIfEmpty<{
    readonly aaaaaaaaaaaaa: string;
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
  }>,
) => {};
type H = {
  (
    e: E & {
      currentTarget: Tttttttttttttttttt;
      target: Tttttttttttttttttttttttttttttt;
    },
  ): void;
};
type F = (
  args: VoidIfEmpty<{
    readonly aaaaaaaaaaaaa: string;
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
  }>,
) => A;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('hugs a lone parameter typed as an object or mapped type, or destructured', async () => {
			const source = `function g(props: {
  readonly aaaaaaaaaaaaa: string;
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
}) {}
function m(props: {
  [Key in keyof Aaaaaaaaaaaaaaaaaaaaaa]: Bbbbbbbbbbbbbbbbbbbbbbbbb<Key>;
}) {}
function d({
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
}: Props & { extra: string }) {}`;
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier's `printTypeParameter`, a constraint or default that
		// doesn't fit moves to the next line after `extends` or `=`, indented,
		// before it breaks inside (#485)
		it.each([
			[
				'declare function f<RuntimePropsOptions extends ComponentObjectPropsOptions = ComponentObjectPropsOptions, B = 1>(): void;',
				'declare function f<\n  RuntimePropsOptions extends ComponentObjectPropsOptions =\n    ComponentObjectPropsOptions,\n  B = 1,\n>(): void;',
			],
			[
				'type Fooooooooooooo<Tttttttttttttttttttttttt extends Recordddddddddddddddddddddddddddddddddddddddddd<string, unknown>> = 1;',
				'type Fooooooooooooo<\n  Tttttttttttttttttttttttt extends\n    Recordddddddddddddddddddddddddddddddddddddddddd<string, unknown>,\n> = 1;',
			],
			[
				'type Barrrrrrrrrrrr<Tttttttttttttttttttttttt = Recordddddddddddddddddddddddddddddddddddddddddddddd<string>> = 1;',
				'type Barrrrrrrrrrrr<\n  Tttttttttttttttttttttttt =\n    Recordddddddddddddddddddddddddddddddddddddddddddddd<string>,\n> = 1;',
			],
			[
				'class Foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>> {}',
				'class Foo<\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends\n    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,\n> {}',
			],
			[
				'interface Foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>> {}',
				'interface Foo<\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends\n    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,\n> {}',
			],
			[
				'function foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() {}',
				'function foo<\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends\n    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,\n>() {}',
			],
			// A lone arrow type parameter breaks its brackets too (#531)
			[
				'const foo = <TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() => {};',
				'const foo = <\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends\n    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,\n>() => {};',
			],
			[
				'const f = <T = Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,>() => {};',
				'const f = <\n  T =\n    Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,\n>() => {};',
			],
			// With a constraint, the comma isn't needed to tell the list from JSX (#531)
			['const f = <T extends X,>() => {};', 'const f = <T extends X>() => {};'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'type A<\n  T extends {\n    aaaaaaaaaaaaaaaa: string;\n    bbbbbbbbbbbbbbbbbbbbbbb: number;\n    ccccccccccccccccc: boolean;\n  },\n> = T;',
			'type A<\n  T extends\n    | "aaaaaaaaaaaaaaa"\n    | "bbbbbbbbbbbbbbbbbbbbb"\n    | "cccccccccccccccccccccc"\n    | "ddddddddddddddd",\n> = T;',
			'type A<\n  T =\n    | "aaaaaaaaaaaaaaa"\n    | "bbbbbbbbbbbbbbbbbbbbb"\n    | "cccccccccccccccccccccc"\n    | "ddddddddddddddd"\n    | "eeeeeeeeeeeeeeeeeeeeeeee",\n> = T;',
			'type A<\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT = Recorddddddddddddddddddddddddddddddddddddddddd<\n    string,\n    unknown\n  >,\n> = T;',
			'function useThing<\n  TData extends Record<string, unknown> = Record<string, unknown>,\n  TError = Error,\n>(options: UseThingOptions<TData, TError>): UseThingResult<TData, TError> {}',
			'type X<T> =\n  T extends Array<\n    infer Uuuuuuuuuuuuuuuuuuuuuuuuuuu extends Recordddddddddddddddddddddddddd<\n      string,\n      unknown\n    >\n  >\n    ? Uuuuuuuuuuuuuuuuuuuuuuuuuuu\n    : never;',
			'type A<T extends /* c */ Foo> = T;',
			'const f = <T = X,>() => {};',
			'const f = <T extends X>() => {};',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('breaks a lone arrow type parameter without a trailing comma when trailingComma is none', async () => {
			const source =
				'const foo = <TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() => {};';
			const expected =
				'const foo = <\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends\n    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>\n>() => {};';
			expect(await format(source, { trailingComma: 'none' })).toBeWithNewline(expected);
		});

		// Like Prettier's `shouldForceTrailingComma`, the comma tells the list
		// from JSX, so it prints whatever the trailingComma option (#531)
		it.each(['all', 'none'])(
			'breaks a long lone arrow type parameter with a comma when trailingComma is %s',
			async (trailingComma) => {
				const source =
					'const f2 = <Tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt>() => 1;';
				const expected =
					'const f2 = <\n  Tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt,\n>() => 1;';
				expect(
					await format(source, {
						trailingComma: /** @type {'all' | 'none'} */ (trailingComma),
					}),
				).toBeWithNewline(expected);
			},
		);
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

		// An object method's function started at its `(`, after its type
		// parameters, so a comment in them trailed the key or led the function,
		// which printed nothing of it (#458)
		it.each([
			'const o = {\n  m</* c */ T>(b: T): T {\n    return b;\n  },\n};',
			'const o = { async m</* c */ T>(b: T) {} };',
			'const o = { *m</* c */ T>(b: T) {} };',
			'const o = { async *m</* c */ T>(b: T) {} };',
			'const o = { get m</* c */ T>() {} };',
			'const o = { set m</* c */ T>(v: T) {} };',
			'const o = { [k]</* c */ T>(b: T) {} };',
			'const o = { m<T /* c */>(b: T) {} };',
			'const o = {\n  m<\n    // c\n    T,\n  >(b: T) {},\n};',
			'const o = {\n  m<\n    T,\n    // c\n  >(b: T) {},\n};',
		])('keeps the comment in the type parameters of the object method in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'const o = { m</* c */ T>(b: T): T { return b; } };',
				'const o = {\n  m</* c */ T>(b: T): T {\n    return b;\n  },\n};',
			],
			[
				'const o = { m<\n// c\nT,\n>(b: T) {} };',
				'const o = {\n  m<\n    // c\n    T,\n  >(b: T) {},\n};',
			],
			// Like Prettier, a comment before the type parameters leads the
			// function, which prints it after the key
			['const o = { m /* a */ <T>(b: T) {} };', 'const o = { m/* a */ <T>(b: T) {} };'],
			['const o = { "m" /* a */ <T>(b: T) {} };', 'const o = { m/* a */ <T>(b: T) {} };'],
			[
				'const o = { m /* a */ </* c */ T /* d */> /* e */ (b: T) {} };',
				'const o = { m/* a */ </* c */ T /* d */> /* e */(b: T) {} };',
			],
		])(
			'formats the comments of the generic object method in %j like Prettier',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// Prettier's parsers keep a type parameter's name as a node, which the
		// comments around it lead or trail, so they stay before the `extends`,
		// `=`, or mapped type's `in` and after a `const`, `in`, or `out` modifier
		it.each([
			'function f<T /* a */ extends U, K /* b */ = V>() {}',
			'class A<T /* a */ /* b */ extends U> {}',
			'const f = <T /* a */ extends U>() => {};',
			'function f<T /* a */ extends /* b */ U /* c */ = /* d */ V /* e */>() {}',
			'function f<const /* c */ T extends U>() {}',
			'interface I<in /* i */ K /* b */ = V, out /* o */ X> {}',
			'type A<in out /* c */ T> = T;',
			'type M = { [K /* a */ in T]: T[K] };',
			'type M = { readonly [K /* a */ in keyof T as `get${K}`]?: T[K] };',
			'type X<A> = A extends [infer T /* a */ extends string] ? T : never;',
		])('keeps the comment around the type parameter name in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'function f<\n  T // a\n    extends U,\n  K // b\n    = V,\n>() {}',
				'function f<\n  T extends // a\n    U,\n  K = // b\n    V,\n>() {}',
			],
			[
				'function f<T /* a */ extends Uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu>() {}',
				'function f<\n  T /* a */ extends\n    Uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu,\n>() {}',
			],
			[
				'type M = {\n  [K // a\n    in T]: T[K];\n};',
				'type M = {\n  [\n    K in T // a\n  ]: T[K];\n};',
			],
			// On its own line, the comment leads the type after the keyword
			['function f<\n  T\n  /* a */ extends U,\n>() {}', 'function f<T extends /* a */ U>() {}'],
			[
				'type A<\n  B = // inline\n  // above\n  C\n> = R;',
				'type A<\n  B = // inline\n    // above\n    C,\n> = R;',
			],
			[
				'type M = {\n  [\n    A in\n    // prettier-ignore\n    B\n  ]: C;\n};',
				'type M = {\n  [\n    A in // prettier-ignore\n    B\n  ]: C;\n};',
			],
		])(
			'formats the comment around the type parameter name in %j like Prettier',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// Prettier prints these after the keyword, where they end the line, and
		// moves them after the name on the next pass. The formatter prints the
		// fixpoint.
		it.each([
			[
				'function f<\n  T\n  // a\n  extends U,\n  K\n  /* b */\n  = V,\n>() {}',
				'function f<\n  T extends // a\n    U,\n  K /* b */ = V,\n>() {}',
			],
			[
				'function f<\n  T extends\n  // a\n  U,\n>() {}',
				'function f<\n  T extends // a\n    U,\n>() {}',
			],
			[
				'type M = {\n  [K\n    // a\n    in T]: T[K];\n};',
				'type M = {\n  [\n    K in T // a\n  ]: T[K];\n};',
			],
		])(
			'formats the comment around the type parameter name in %j in one pass',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// Prettier's next pass gives this `prettier-ignore` comment to the key,
		// where it no longer ignores the type after `in`
		it('keeps a prettier-ignore comment at the end of the line of a mapped type key on the type after it', async () => {
			const source = 'type M = {\n  [\n    A in // prettier-ignore\n    B\n  ]: C;\n};';
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's default for a comment at the end of a line, one after
		// the `=` of a type parameter with a constraint trails the constraint,
		// and the default moves to the next line, indented. It used to lead the
		// default, which printed at the indentation of the name, and one before
		// the `=` moved after it on the next pass (#569).
		it.each([
			['type A<B extends C = // c\n  D> = R;', 'type A<\n  B extends C = // c\n    D,\n> = R;'],
			['type A<B extends C // c\n  = D> = R;', 'type A<\n  B extends C = // c\n    D,\n> = R;'],
			[
				'function f<T extends C = // c\n  D>() {}',
				'function f<\n  T extends C = // c\n    D,\n>() {}',
			],
			[
				'type A<B extends C = // c\n  // d\n  D> = R;',
				'type A<\n  B extends C = // c\n    // d\n    D,\n> = R;',
			],
			[
				'type A<B extends C = // c\n  VeryLongTypeName<WithArguments, AndMoreArguments, AndEvenMoreArguments, AndMore>> = R;',
				'type A<\n  B extends C = // c\n    VeryLongTypeName<\n      WithArguments,\n      AndMoreArguments,\n      AndEvenMoreArguments,\n      AndMore\n    >,\n> = R;',
			],
			['type A<B extends C = /* c */\n  D> = R;', 'type A<B extends C /* c */ = D> = R;'],
		])(
			'formats the comment around the = of a type parameter in %j like Prettier',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		it.each([
			'type A<B extends C /* c */ = D> = R;',
			'type A<B extends C = /* c */ D> = R;',
			'type A<\n  B = // c\n    D,\n> = R;',
			'type A<\n  B extends C = D, // c\n> = R;',
			// Like the ones after the name, a `prettier-ignore` comment after the
			// `=` keeps ignoring the default
			'type A<\n  B extends C = // prettier-ignore\n  D<  E  >,\n> = R;',
		])('keeps the comment around the = of a type parameter in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier leads the default with these and prints them after the `=`,
		// where they end the line, and its next pass trails the constraint with
		// them, like the ones around the name. The formatter prints the
		// fixpoint.
		it.each([
			['type A<B extends C =\n  // c\n  D> = R;', 'type A<\n  B extends C = // c\n    D,\n> = R;'],
			['type A<B extends C\n  // c\n  = D> = R;', 'type A<\n  B extends C = // c\n    D,\n> = R;'],
			['type A<B extends C =\n  /* c */\n  D> = R;', 'type A<B extends C /* c */ = D> = R;'],
			['type A<B extends C\n  /* c */\n  = D> = R;', 'type A<B extends C /* c */ = D> = R;'],
			[
				'type A<B extends C /* a */\n  // b\n  = D> = R;',
				'type A<\n  B extends C /* a */ = // b\n    D,\n> = R;',
			],
		])(
			'formats the comment around the = of a type parameter in %j in one pass',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		it('keeps a prettier-ignore comment on its own line after the = of a type parameter on the default like Prettier', async () => {
			expect(
				await format('type A<B extends C =\n  // prettier-ignore\n  D<  E  >> = R;'),
			).toBeWithNewline('type A<\n  B extends C = // prettier-ignore\n  D<  E  >,\n> = R;');
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

		// A field keeps its quotes (see 'keeps the quotes of class fields, which
		// TypeScript checks differently'), so only a method's key prints as a keyword
		it('keeps the semicolon when a quoted key prints as a keyword', async () => {
			const input = `class A { "static"; run() {} x = a; 'in'() {} y = b; 'in' = 1 }`;
			const result = await format(input, { semi: false });
			expect(result).toBeWithNewline(`class A {
  "static"
  run() {}
  x = a;
  in() {}
  y = b
  "in" = 1
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

		// Like Prettier, the module specifier of an import type lays out like a
		// call argument, so the parentheses break around a comment on its own
		// line. The comment used to stay after the `(`, and join the specifier
		// on the next format, and a line comment after it moved past the `;`
		// (#621).
		it('breaks the parentheses of an import type around a comment like call arguments', async () => {
			const input = `type X = import(
  /* c */
  'a');
type Y = import(
  "a" // c
).B;`;
			const expected = `type X = import(
  /* c */
  "a"
);
type Y = import(
  "a" // c
).B;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'type X = import(/* c */ "a");',
			'type Y = import("a" /* c */).B<T>;',
			'type Z =\n  import("./long/long/long/long/long/long/long/long/long/long/long/path/to/module");',
		])('keeps %j', async (source) => {
			await expectUnchanged(source);
		});

		// Like Prettier's `printTypePredicate`, a type predicate prints its
		// parameter name as a node, with its comments. They were deleted (#620).
		it.each([
			'function f(x): asserts /* c */ x {}',
			'function f(x): x /* c */ is T {}',
			'function f(this: A): this /* c */ is T {}',
			'function f(x): asserts x /* c */ is T {}',
			'function f(x): asserts /* c */ this is T {}',
			'function f(): asserts this /* c */ {}',
			'type F = (x: unknown) => x /* c */ is string;',
			'class A {\n  isB(): this /* c */ is B {\n    return true;\n  }\n}',
			'interface I {\n  isB(x): x /* c */ is B;\n}',
		])('keeps the comment next to the parameter name of a type predicate in %j', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			'function f(x): /* c */ x is T {}',
			'function f(x): x is /* c */ T {}',
			'function f(x): asserts x is /* c */ T {}',
		])('keeps the comment around a type predicate in %j', async (source) => {
			await expectUnchanged(source);
		});

		// Like Prettier, the module specifier and the import attributes of an
		// import type lay out like call arguments, without a trailing comma (#422).
		describe('import attributes in import types', () => {
			it.each([
				'type A = import("foo", { with: { type: "json" } });',
				'type B = import("foo", { with: { "resolution-mode": "import" } }).Bar;',
				'let c: typeof import("foo", { with: { type: "json" } });',
				'type D = typeof import("foo", { with: { type: "json" } }).value<string>;',
				'type E = import("foo", { assert: { "resolution-mode": "require" } }).ns.Bar<T>;',
			])('keeps them: %s', async (source) => {
				await expectUnchanged(source);
			});

			it('adds the spaces inside the braces', async () => {
				const result = await format('type A = import("foo", {with: {type: "json"}})');
				expect(result).toBeWithNewline('type A = import("foo", { with: { type: "json" } });');
			});

			it('keeps an object broken where it was written broken', async () => {
				const input = `type A = import("foo", {
  with: {
  type: "json",}})
type B = import("foo", {
  with: {
  type: "json"},})`;
				const expected = `type A = import("foo", {
  with: {
    type: "json",
  },
});
type B = import("foo", {
  with: {
    type: "json",
  },
});`;
				expect(await format(input)).toBeWithNewline(expected);
				expect(await format(input, { trailingComma: 'none' })).toBeWithNewline(
					expected.replace(/,\n/g, '\n'),
				);
			});

			it('breaks a long import type like call arguments, without a trailing comma', async () => {
				const input = `type A = import("./long/long/long/long/long/long/long/long/long/long/path/to/module")
type B = import("./long/long/long/long/long/long/long/long/long/long/path/to/module",{with:{type:'json'}})
type C = import("./long/long/long/long/long/long/long/long/long/long/path/to/module",{with:{
type:'json'}})
type D = import("./long/long/long/long/long/long/long/long/long/long/path/to/module",{
with:{type:'json'}})`;
				const expected = `type A =
  import("./long/long/long/long/long/long/long/long/long/long/path/to/module");
type B = import(
  "./long/long/long/long/long/long/long/long/long/long/path/to/module",
  { with: { type: "json" } }
);
type C = import(
  "./long/long/long/long/long/long/long/long/long/long/path/to/module",
  {
    with: {
      type: "json",
    },
  }
);
type D = import(
  "./long/long/long/long/long/long/long/long/long/long/path/to/module",
  {
    with: { type: "json" },
  }
);`;
				expect(await format(input, { trailingComma: 'all' })).toBeWithNewline(expected);
			});

			it('hugs the import attributes when only they break', async () => {
				const result = await format(
					'type Mode = import("pkg", { with: { "resolution-mode": "require" } }).Mode<string>;',
					{ printWidth: 40, singleQuote: true },
				);
				expect(result).toBeWithNewline(`type Mode = import('pkg', {
  with: {
    'resolution-mode': 'require',
  },
}).Mode<string>;`);
			});

			it('keeps them in a template body', async () => {
				await expectUnchanged(`export function App() {
  const data: import("./data.json", { with: { type: "json" } }).Data = load();
  <div>{data.name}</div>
}`);
			});
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

		// Like Prettier's `printUnionType`, a union prints its trailing comments
		// inside its indentation too, so a line comment after a type
		// parameter's union constraint moves the union to the line after
		// `extends`. They printed after it, and the union stayed on the line of
		// `extends` (#623).
		it.each([
			[
				'type A<R extends B | C // c\n  = D> = R;',
				'type A<\n  R extends\n    B | C = // c\n    D,\n> = R;',
			],
			[
				'type A<R extends B | C = // c\n  D> = R;',
				'type A<\n  R extends\n    B | C = // c\n    D,\n> = R;',
			],
		])('formats %j like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Prettier leads the default with a line comment on its own line before
		// the `=`, and its next pass moves the comment after the union like above
		it('formats a line comment on its own line after a union constraint in one pass', async () => {
			expect(await format('type A<R extends B | C\n  // c\n  = D> = R;')).toBeWithNewline(
				'type A<\n  R extends\n    B | C = // c\n    D,\n> = R;',
			);
		});

		it.each([
			'type A<R extends B | C /* c */ = D> = R;',
			'type A<\n  R extends B | C, // c\n> = R;',
			'type A<T> = T extends\n  B | C // c\n  ? D\n  : E;',
			'type A = Foo<\n  B | C // c\n>;',
			'type A = [\n  B | C, // c\n  D,\n];',
			'type A = [B | C /* c */, D];',
			'function f(\n  a: B | C, // c\n) {}',
			'let x: B | C = // c\n  y;',
			'interface I {\n  a: B | C; // c\n  b: D;\n}',
			'type A = /* c */ B | C;',
			'type A =\n  // c\n  B | C;',
			'type A = X & (/* c */ B | C);',
			'type A = (B | C /* c */)[];',
			'type T = keyof (B | C /* c */);',
		])('keeps the comments of %j where they are, like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier's parser postprocess, an intersection or union of one
		// type is that type, so a comment after its leading `&` or `|` leads the
		// value, which moves below the `=` with it. It used to print on the `=`
		// line, with the type at the start of the next line, and move again on
		// the next format, and after a `|` it stayed there (#603).
		it('prints a one-member intersection or union as its type, with its comments', async () => {
			const input = `type A = & // Comment
"VALUE";
type F = &
/* Comment */
"VALUE";
type U = | // Comment
"VALUE";
type O = & // Comment
  { a: 1 };`;
			const expected = `type A =
  // Comment
  "VALUE";
type F =
  /* Comment */
  "VALUE";
type U =
  // Comment
  "VALUE";
type O =
  // Comment
  { a: 1 };`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		// The parentheses around it no longer count as the parentheses of a
		// union or intersection, and a long member breaks on its own
		it('drops the parentheses around a one-member intersection or union', async () => {
			const input = `type G = (| A)[];
type H = | (A | B);
interface X { a: | (() => void); b: & ((x: string) => void) }
type C = | { a: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number; ccccccccccccccccccccccccc: boolean }[];
type D = /* c */ | B;
let x: | A = 1;`;
			const expected = `type G = A[];
type H = A | B;
interface X {
  a: () => void;
  b: (x: string) => void;
}
type C = {
  a: string;
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
  ccccccccccccccccccccccccc: boolean;
}[];
type D = /* c */ B;
let x: A = 1;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Like Prettier's `handleUnionTypeLeadingComments`, a one-line block
		// comment right before a union leads its first member, through any
		// wrappers. Prettier's first format of the nested unions from its
		// `union/consistent-with-flow/single-type.ts` test prints the comment
		// before the `|`, and its next format moves it after the `|`: the
		// formatter prints that form at once.
		it('moves a comment before one-member unions around a union after its first |', async () => {
			const input = `type A6 = | (
  /*1*/ | (
    | (
          | A
          // A comment to force break
          | B
        )
  )
  );
type C = /* c */ | (| D | E);`;
			const expected = `type A6 =
  | /*1*/ A
    // A comment to force break
  | B;
type C = /* c */ D | E;`;
			expect(await format(input)).toBeWithNewline(expected);
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

		// Like Prettier, an element keeps its parentheses in a class heading, as
		// it does in any parent that doesn't print it bare. TypeScript doesn't
		// read `class A extends <div /> {}` (#680).
		it.each([
			'class Derived extends (<div />) {}',
			'class Derived extends (<></>) {}',
			'class Derived extends (<style>{css}</style>) {}',
			'class Derived extends (<div />)<T> {}',
			'class Derived extends (<div />) implements Contract {}',
			'const Derived = class extends (<div />) {};',
			'export default class extends (<></>) {}',
			'class Derived extends (<div />).Base {}',
		])('keeps the parentheses around the element in %s', async (source) => {
			await expectUnchanged(source);
		});

		it.each([
			['class Derived extends <div /> {}', 'class Derived extends (<div />) {}'],
			['class Derived extends <></> {}', 'class Derived extends (<></>) {}'],
		])('adds the parentheses around the element in %s', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Like Prettier's `maybeWrapJsxElementInParens`, an element that breaks
		// starts on a line of its own inside them
		it.each([
			'class Derived extends (\n  <div\n    className="aaaaaaaaaaaaaaaaaaaaaaaa"\n    id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"\n  />\n) {}',
			'class Derived extends (\n  <div>\n    <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>\n    <span>bbbbbbbbbbbbbbbbbbbbbbbbbb</span>\n  </div>\n) {}',
			'x = class extends (\n  (\n    <div\n      className="aaaaaaaaaaaaaaaaaaaaaaaa"\n      id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"\n    />\n  )\n) {};',
		])('breaks the element inside the parentheses in %j', async (source) => {
			await expectUnchanged(source);
		});

		// Prettier prints these comments twice, once more on each pass. Like
		// the comments of any other superclass, they print outside the
		// parentheses.
		it.each([
			['class A extends (/* c */ <div />) {}', 'class A extends /* c */ (<div />) {}'],
			['class A extends (<div /> /* c */) {}', 'class A extends (<div />) /* c */ {}'],
		])('prints the comment of the element in %j once', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Like Prettier's `babel` output, a JSDoc cast's parentheses are enough.
		// The class used to add a second pair around them (#519).
		it.each([
			'class Store extends /** @type {Base} */ (new Base()) {}',
			'class Derived extends /** @type {Constructor} */ (Base || Object) {}',
			'class Derived extends /** @type {A} */ (/** @type {B} */ (Base || Object)) {}',
			'class Derived extends /* note */ /** @type {Constructor} */ (Base || Object) {}',
		])('adds no parentheses around the cast in %s', async (source) => {
			await expectUnchanged(source);
		});

		it('drops parentheses around a cast', async () => {
			const result = await format('class Derived extends (/** @type {C} */ (Base || Object)) {}');
			expect(result).toBeWithNewline('class Derived extends /** @type {C} */ (Base || Object) {}');
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

		// Prettier's AST has a member expression there, which breaks before a
		// `.` like a superclass's does, so the type parameters stay on the line
		it('breaks a dotted interface extends or class implements name before a dot', async () => {
			const input = `interface ReadableStream<R = any> extends Bun.__internal.LibEmptyOrNodeReadableStream<R> {}
class WritableStream<W = any> implements Bun.__internal.LibEmptyOrNodeWritableStream<W> {}
const Stream = class<W = any> implements Bun.__internal.LibEmptyOrNodeWritableStream<W> {};
interface A extends a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.aa.bb.cc.dd.ee.ff.gg.hh {}`;

			expect(await format(input))
				.toBeWithNewline(`interface ReadableStream<R = any> extends Bun.__internal
  .LibEmptyOrNodeReadableStream<R> {}
class WritableStream<W = any> implements Bun.__internal
  .LibEmptyOrNodeWritableStream<W> {}
const Stream = class<W = any> implements Bun.__internal
  .LibEmptyOrNodeWritableStream<W> {};
interface A
  extends a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.aa.bb.cc.dd.ee.ff
    .gg.hh {}`);
		});

		// A lone `a.b` stays together, like a member expression, and a type
		// reference prints its qualified name on one line
		it.each([
			`interface ReadableStream<
  R = any,
> extends Bun.LibEmptyOrNodeReadableStreamLongNameForThisTestOnly<R> {}`,
			`type T =
  | Bun.__internal.LibEmptyOrNodeReadableStream<R>
  | Bun.__internal.LibEmptyOrNodeReadableStream<R>;`,
		])('keeps a qualified name that Prettier keeps together: %s', async (source) => {
			await expectUnchanged(source);
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

		// A JSDoc cast before the parenthesized operand a value starts with casts
		// that operand. Parentheses printed around the value, or around a part
		// of it that starts with the operand, go around the cast too, which keeps
		// it at the operand's `(`. Prettier's `babel` parser prints them between
		// the two, so the cast takes the whole value, and its next pass drops the
		// operand's parentheses (#548).
		it.each([
			['f(.../** @type {T} */ (node) ?? b);', 'f(...(/** @type {T} */ (node) ?? b));'],
			[
				'x = { .../** @type {T} */ (node).a ?? b };',
				'x = { ...(/** @type {T} */ (node).a ?? b) };',
			],
			[
				'y = [.../** @type {T} */ (node).innerComments ?? []];',
				'y = [...(/** @type {T} */ (node).innerComments ?? [])];',
			],
			[
				'f(.../* a */ /** @type {T} */ (node) ?? b);',
				'f(.../* a */ (/** @type {T} */ (node) ?? b));',
			],
			['x = /** @type {T} */ (a) % b * c;', 'x = (/** @type {T} */ (a) % b) * c;'],
			['x = /** @type {T} */ (a) * b % c;', 'x = (/** @type {T} */ (a) * b) % c;'],
			[
				'const x = (/** @type {T} */ (aaaaaaaaaaaaaaaaaaaaaaaaa) || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb).c;',
				'const x = (\n  /** @type {T} */ (aaaaaaaaaaaaaaaaaaaaaaaaa) ||\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n).c;',
			],
			// Pins: the value keeps its parentheses around the cast
			['(/** @type {T} */ (a) || b)();', '(/** @type {T} */ (a) || b)();'],
			['(/** @type {T} */ (a) || b).c;', '(/** @type {T} */ (a) || b).c;'],
			['new (/** @type {T} */ (a) || b)();', 'new (/** @type {T} */ (a) || b)();'],
			['x = (/** @type {T} */ (a), b);', 'x = (/** @type {T} */ (a), b);'],
			['g = (/** @type {T} */ (a) ?? b) || c;', 'g = (/** @type {T} */ (a) ?? b) || c;'],
			['h = (/** @type {T} */ (a) || b)`x`;', 'h = (/** @type {T} */ (a) || b)`x`;'],
			[
				'async function f() {\n  await (/** @type {T} */ (a) || b);\n}',
				'async function f() {\n  await (/** @type {T} */ (a) || b);\n}',
			],
			[
				'class A extends (/** @type {T} */ (b) ?? c) {}',
				'class A extends (/** @type {T} */ (b) ?? c) {}',
			],
			// Pins: without parentheses around it, the cast stays ahead of the value
			['x = /** @type {T} */ (a) || b;', 'x = /** @type {T} */ (a) || b;'],
			['x = /** @type {T} */ (a).b ?? c;', 'x = /** @type {T} */ (a).b ?? c;'],
			['!(/** @type {T} */ (a) || b);', '!(/** @type {T} */ (a) || b);'],
		])(
			'keeps the cast of the operand %j starts with at its parentheses',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		// The statement starts with the parentheses around the cast, so without
		// semicolons it needs the `;` ahead of them
		it('puts the leading semicolon before the parentheses around an operand cast', async () => {
			const input = `a;
/** @type {T} */ (b) % c * d;
// note
/** @type {T} */ (b) % c * d;
(/** @type {T} */ (b)?.c).d();`;
			const expected = `a
;(/** @type {T} */ (b) % c) * d
// note
;(/** @type {T} */ (b) % c) * d
;(/** @type {T} */ (b)?.c).d()`;
			expect(await format(input, { semi: false })).toBeWithNewline(expected);
		});

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

		// An element isn't a left-hand-side expression, as in TypeScript (#426):
		// a `(`, `[`, or template literal on the next line starts a statement of
		// its own, as Prettier's `typescript` parser reads it, and an element
		// called, indexed, or used as a tag keeps its parentheses.
		// Unlike in TSX, an element alone at the start of a statement is a
		// template element, and the `;` after it an empty statement, so an
		// element that is an expression statement keeps its parentheses, and
		// its `;`. In a template body, an operator after the element doesn't
		// continue the statement either (#625). The statements compared leave
		// out the empty ones, like the `;` that starts a line with semi: false.
		/** @param {string} text */
		const parseStatements = (text) =>
			JSON.stringify(
				/** @type {any[]} */ (/** @type {any} */ (parsers)?.tsrx.parse(text, {}).body).filter(
					(node) => node.type !== 'EmptyStatement',
				),
				(key, value) =>
					['start', 'end', 'loc', 'range', 'metadata', 'raw'].includes(key) ||
					key.endsWith('Comments')
						? undefined
						: value,
			);
		it.each([
			['(<div />);', '(<div />);'],
			['(<></>);', '(<></>);'],
			['(<style>{css}</style>);', '(<style>{css}</style>);'],
			['(<div>\n<span />\n</div>);', '(\n  <div>\n    <span />\n  </div>\n);'],
			['function f() {\n  (<div />);\n}', 'function f() {\n  (<div />);\n}'],
			['if (a) (<div />);\nelse (<span />);', 'if (a) (<div />);\nelse (<span />);'],
			['for (const a of b) (<div />);', 'for (const a of b) (<div />);'],
			['label: (<div />);', 'label: (<div />);'],
			[
				'function C() @{\n  (<div />);\n  (<div />) + 1;\n  (<div />) || x;\n  (<div />) ? a : b;\n  <i />\n}',
				'function C() @{\n  (<div />);\n  (<div />) + 1;\n  (<div />) || x;\n  (<div />) ? a : b;\n  <i />\n}',
			],
			[
				'function C() @{\n  @if (a) {\n    (<div />) + 1;\n    <i />\n  } @else {\n    (<div />) + 1;\n    <i />\n  }\n}',
				'function C() @{\n  @if (a) {\n    (<div />) + 1;\n    <i />\n  } @else {\n    (<div />) + 1;\n    <i />\n  }\n}',
			],
			[
				'function C() @{\n  @for (const a of b) {\n    (<div />) * 2;\n    <i />\n  }\n}',
				'function C() @{\n  @for (const a of b) {\n    (<div />) * 2;\n    <i />\n  }\n}',
			],
			[
				'function C() @{\n  @switch (x) {\n    @case 1: {\n      (<div />) + 1;\n      <i />\n    }\n  }\n}',
				'function C() @{\n  @switch (x) {\n    @case 1: {\n      (<div />) + 1;\n      <i />\n    }\n  }\n}',
			],
			[
				'function C() @{\n  @try {\n    (<div />) + 1;\n    <i />\n  } @catch (e) {\n    (<div />) + 1;\n    <i />\n  }\n}',
				'function C() @{\n  @try {\n    (<div />) + 1;\n    <i />\n  } @catch (e) {\n    (<div />) + 1;\n    <i />\n  }\n}',
			],
			// Like Prettier, which gives a comment after the expression in the
			// parentheses to the statement, it moves after the `;`
			['(<div /> /* c */);', '(<div />); /* c */'],
			['(<div /> // c\n);', '(<div />); // c'],
			['(<div>\n<span />\n</div> /* c */);', '(\n  <div>\n    <span />\n  </div>\n); /* c */'],
			// An element prints its other comments inside the parentheses
			['(\n// c\n<div />);', '(\n  // c\n  <div />\n);'],
			['(<div />\n// c\n);', '(\n  <div />\n  // c\n);'],
		])('keeps the parentheses around the element statement in %j', async (input, expected) => {
			const output = await format(input);
			expect(output).toBeWithNewline(expected);
			expect(parseStatements(output)).toBe(parseStatements(input));
		});

		it.each([
			['(<div />);', ';(<div />)'],
			['a;\n(<div />);', 'a\n;(<div />)'],
		])(
			'puts the leading semicolon before the element statement %j with semi: false',
			async (input, expected) => {
				const output = await format(input, { semi: false });
				expect(output).toBeWithNewline(expected);
				expect(parseStatements(output)).toBe(parseStatements(input));
			},
		);

		// A template value that is an expression statement reads the same
		// without its parentheses, and a comment after it moves after the `;`
		// as it does on the next pass
		it.each([
			['(@{ <div /> });', '@{\n  <div />\n};'],
			['(@if (a) { <div /> });', '@if (a) {\n  <div />\n};'],
			['(@{ <div /> } /* c */);', '@{\n  <div />\n}; /* c */'],
			['(@if (a) { <div /> } /* c */);', '@if (a) {\n  <div />\n}; /* c */'],
		])('prints the template statement %j without parentheses', async (input, expected) => {
			const output = await format(input);
			expect(output).toBeWithNewline(expected);
			expect(parseStatements(output)).toBe(parseStatements(input));
		});

		// Outside a template body, an operator after an element that starts a
		// statement continues it, as in TSX
		it.each([
			['(<div />) + 1;', '<div /> + 1;'],
			['function f() {\n  (<div />) ? a : b;\n}', 'function f() {\n  <div /> ? a : b;\n}'],
			[
				'function C() @{\n  if (a) {\n    (<div />) + 1;\n  }\n  <i />\n}',
				'function C() @{\n  if (a) {\n    <div /> + 1;\n  }\n  <i />\n}',
			],
		])('prints the element that starts %j bare like Prettier', async (input, expected) => {
			const output = await format(input);
			expect(output).toBeWithNewline(expected);
			expect(parseStatements(output)).toBe(parseStatements(input));
		});

		it('starts a statement at a `(`, `[`, or template literal on the line after an element', async () => {
			const input =
				'const a = <b>x</b>\n(foo)\nconst c = <b />\n[1].map(f)\nconst d = <b />\n`t`\n';
			const expected =
				'const a = <b>x</b>;\nfoo;\nconst c = <b />;\n[1].map(f);\nconst d = <b />;\n`t`;';
			expect(await format(input)).toBeWithNewline(expected);
			expect(await normalize(input)).toBeWithNewline(expected);
		});

		it.each([
			'const a = (<b>x</b>)(foo);',
			'const c = (<b />)[1].map(f);',
			'const d = (<b />)`t`;',
			'const e = (<b />)?.foo;',
			'(<b />)(x);',
			'const a = (<div>\n  <b>x</b>\n</div>)(foo);',
		])('keeps the parentheses around an element before a subscript in %s', async (source) => {
			await expectUnchanged(source);
			expect(await normalize(source)).toBeWithNewline(source);
		});

		// A `@{ … }` value or a directive isn't one either, so it keeps its
		// parentheses there too: hugging them as a callee, like an element, and
		// inside them before a member access, index, non-null assertion, or tag.
		it.each([
			['const a = (@{ <b /> })(x);', 'const a = (@{\n  <b />\n})(x);'],
			[
				'const a = (@for (const x of xs) { <b /> })(x);',
				'const a = (@for (const x of xs) {\n  <b />\n})(x);',
			],
			[
				'const a = (@switch (x) { @case 1: { <b /> } })(x);',
				'const a = (@switch (x) {\n  @case 1: {\n    <b />\n  }\n})(x);',
			],
			[
				'const a = (@try { <b /> } @catch { <i /> })(x);',
				'const a = (@try {\n  <b />\n} @catch {\n  <i />\n})(x);',
			],
			['const a = new (@{ <b /> })();', 'const a = new (@{\n  <b />\n})();'],
			['const a = (@{ <b /> }).foo;', 'const a = (\n  @{\n    <b />\n  }\n).foo;'],
			['const a = (@{ <b /> })`t`;', 'const a = (\n  @{\n    <b />\n  }\n)`t`;'],
			['const a = (@if (x) { <b /> })!;', 'const a = (\n  @if (x) {\n    <b />\n  }\n)!;'],
			['const a = (@if (x) { <b /> })[0];', 'const a = (\n  @if (x) {\n    <b />\n  }\n)[0];'],
		])(
			'keeps the parentheses around a TSRX value before a subscript in %s',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		// `yield` takes a TSRX expression as its argument (#547)
		it('keeps a TSRX expression after yield', async () => {
			expect(
				await format('export function* nodes() { yield @{ <div /> }; yield @if (ok) { <b /> }; }'),
			).toBeWithNewline(
				'export function* nodes() {\n  yield (\n    @{\n      <div />\n    }\n  );\n  yield (\n    @if (ok) {\n      <b />\n    }\n  );\n}',
			);
		});

		// A comment after a directive's keyword is kept where Prettier keeps it
		// after the statement's keyword: `try /* c */ {`, `if (/* c */ x)` (#477)
		it('keeps a comment after a directive keyword', async () => {
			expect(
				await format(
					'function A() @{\n  @try /* c */ {\n    @if /* d */ (x) {\n      <b />\n    }\n  } @catch (e) {\n    <p />\n  }\n}',
				),
			).toBeWithNewline(
				'function A() @{\n  @try /* c */ {\n    @if (/* d */ x) {\n      <b />\n    }\n  } @catch (e) {\n    <p />\n  }\n}',
			);
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

		// Prettier's `babel` parser keeps a JSDoc cast's parentheses as a node of
		// their own, so an object, array, or element in them on the right of a
		// logical operator doesn't stay on the operator's line: the expression
		// breaks after the `=` and before the cast (#580)
		it.each([
			[
				'x = aaaaaaaaaaaaaaaaaaaaaa && /** @type {X} */ ({ aaaaaaaaaaaa: 1, bbbbbbbbbbbb: 2 });',
				'x =\n  aaaaaaaaaaaaaaaaaaaaaa &&\n  /** @type {X} */ ({ aaaaaaaaaaaa: 1, bbbbbbbbbbbb: 2 });',
			],
			[
				'const x = aaaaaaaaaaaaaaaaaaaaaa || /** @type {X} */ ([aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbb]);',
				'const x =\n  aaaaaaaaaaaaaaaaaaaaaa ||\n  /** @type {X} */ ([aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbb]);',
			],
			[
				'x = aaaaaaaaaaaaaaaaaaaaaa && /** @type {X} */ (<Note aaaaaaaaaaaaaa="1" bbbbbbbbbbbbbb="2" />);',
				'x =\n  aaaaaaaaaaaaaaaaaaaaaa &&\n  /** @type {X} */ (<Note aaaaaaaaaaaaaa="1" bbbbbbbbbbbbbb="2" />);',
			],
			[
				'const x = { key: aaaaaaaaaaaaaaaaaaaaaa && /** @type {X} */ ({ aaaaaaaaaaaa: 1, bbbbbbbbb: 2 }) };',
				'const x = {\n  key:\n    aaaaaaaaaaaaaaaaaaaaaa &&\n    /** @type {X} */ ({ aaaaaaaaaaaa: 1, bbbbbbbbb: 2 }),\n};',
			],
			[
				'foo(aaaaaaaaaaaaaaaaaaaaaa && /** @type {X} */ ({ aaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbb: 2 }));',
				'foo(\n  aaaaaaaaaaaaaaaaaaaaaa &&\n    /** @type {X} */ ({ aaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbb: 2 }),\n);',
			],
			[
				'foo(aaaaaaaaaaaaaaaaaaaaaaaaaaa && /** @type {X} */ (<Note aaaaaaaaaaaaaa="1" bbbbbbbbbbbbbbbbbbb="2" />));',
				'foo(\n  aaaaaaaaaaaaaaaaaaaaaaaaaaa &&\n    /** @type {X} */ (<Note aaaaaaaaaaaaaa="1" bbbbbbbbbbbbbbbbbbb="2" />),\n);',
			],
			[
				'x = a && /** @type {X} */ (\n  // prettier-ignore\n  <Note   />\n);',
				'x =\n  a &&\n  /** @type {X} */ (\n    // prettier-ignore\n    <Note   />\n  );',
			],
		])('breaks before a JSDoc-cast right operand in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'x = aaaaaaaaaaaaaaaaaaaaaa && {\n  aaaaaaaaaaaa: 1,\n  bbbbbbbbbbbbbbbbbbbbb: 2,\n  ccccccccccccccc: 3,\n};',
			'x = aaaaaaaaaaaaaaaaaaaaaa && /** @type {X} */ ({ a: 1 });',
			'x =\n  aaaaaaaaaaaaaaaaaaaaaa &&\n  /** @type {X} */ (bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccc);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Nor is a cast operand binaryish or of its parent's type to Prettier, so
		// an object on the right of one with the same operator hugs it without
		// extra indentation, and a short right operand keeps its own group (#597)
		it.each([
			[
				'x = /** @type {X} */ (aaaaaaaaaaaaa && bbbbbbbbbbbbbb) && { aaaaaaaaaaaa: 1, bbbbbbbbbbbbbbb: 2 };',
				'x = /** @type {X} */ (aaaaaaaaaaaaa && bbbbbbbbbbbbbb) && {\n  aaaaaaaaaaaa: 1,\n  bbbbbbbbbbbbbbb: 2,\n};',
			],
			[
				'foo(/** @type {X} */ (aaaaaaaaaaaaa && bbbbbbbbbbbbbb) && { aaaaaaaaaaaa: 1, bbbbbbbbbbbbb: 2 });',
				'foo(\n  /** @type {X} */ (aaaaaaaaaaaaa && bbbbbbbbbbbbbb) && {\n    aaaaaaaaaaaa: 1,\n    bbbbbbbbbbbbb: 2,\n  },\n);',
			],
			[
				'foo(/** @type {X} */ (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) && c);',
				'foo(\n  /** @type {X} */ (\n    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n  ) && c,\n);',
			],
			[
				'const x = /** @type {X} */ (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa - bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) - 1;',
				'const x =\n  /** @type {X} */ (\n    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa - bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n  ) - 1;',
			],
		])('lays out a JSDoc-cast operand as its own node in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A line comment inside the left operand's cast parentheses trails the
		// expression in Prettier's `ParenthesizedExpression`, not the operand,
		// so the right operand stays on the line of the `)`. It used to break
		// the line after the operator (#692).
		it.each([
			'x =\n  /** @type {T} */ (\n    a && b // c\n  ) || d;',
			'x =\n  /** @type {T} */ (\n    a + b // c\n  ) * d;',
			'x =\n  /** @type {T} */ (\n    a // c\n  ) ?? d;',
			'x =\n  /** @type {T} */ (\n    a // c\n  ) instanceof D;',
			'x =\n  /** @type {A} */ (\n    /** @type {B} */ (\n      a // c\n    )\n  ) || d;',
			'x =\n  /** @type {T} */ (\n    a && b /* c */ // d\n  ) || e;',
			'x =\n  /** @type {T} */ (\n    a && b // c\n  ) /* d */ || e;',
			'f(\n  /** @type {T} */ (\n    a && b // c\n  ) || d,\n);',
			'function f() {\n  return (\n    /** @type {T} */ (\n      a && b // c\n    ) || d\n  );\n}',
		])('keeps the operator after the cast parentheses in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Pins: a line comment after the parentheses still breaks the line after
		// the operator, and so does a broken operand list
		it.each([
			'x =\n  /** @type {T} */ (a && b) || // c\n  d;',
			'x =\n  a ||\n  /** @type {T} */ (\n    b // c\n  ) ||\n  d;',
			'x =\n  /** @type {T} */ (\n    a // c\n  ) +\n  /** @type {U} */ (b) +\n  d;',
			'x =\n  (y &&\n    /** @type {T} */ (\n      a && b // c\n    )) ||\n  d;',
			'if (\n  /** @type {T} */ (\n    a && b // c\n  ) ||\n  d\n) {\n}',
			'x =\n  /** @type {T} */ (\n    // c\n    a\n  ) || d;',
		])('keeps %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier prints a line comment before the `)` of the parentheses
		// around an operand after the operator that follows them, and breaks
		// the operator before them with its line break. Its next pass gives the
		// comment to the operand before the operator, which joins the operator
		// before them again. The formatter prints the fixpoint (#626).
		it.each([
			['x = 30 * (month - 1 // c\n) + day;', 'x =\n  30 * (month - 1) + // c\n  day;'],
			['x = 30 * ((month - 1 // c\n)) + day;', 'x =\n  30 * (month - 1) + // c\n  day;'],
			['x = 30 * (2 * (month - 1 // c\n)) + day;', 'x =\n  30 * (2 * (month - 1)) + // c\n  day;'],
			['x = 30 * (month - (1 // c\n)) + day;', 'x =\n  30 * (month - 1) + // c\n  day;'],
			['f(30 * (month - 1 // c\n) + day);', 'f(\n  30 * (month - 1) + // c\n    day,\n);'],
			[
				'const jd = Math.floor(\n  30 * (month - 1 // c\n  ) + day\n);',
				'const jd = Math.floor(\n  30 * (month - 1) + // c\n    day,\n);',
			],
			[
				'x = 30 * (month - 1 /* c */ // d\n) + day;',
				'x =\n  30 * (month - 1) /* c */ + // d\n  day;',
			],
			// Prettier's next pass takes a block comment out of the parentheses
			// that print around the operand too (#673)
			['x = (a && (b /* c */)) || d;', 'x = (a && b) /* c */ || d;'],
			['x = (a && (b /* c */ /* d */)) || e;', 'x = (a && b) /* c */ /* d */ || e;'],
			['if ((a && (b /* c */)) || d) {\n}', 'if ((a && b) /* c */ || d) {\n}'],
			[
				'function isHexCode(c) {\n  return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) ||\n         ((0x41/* A */ <= c) && (c <= 0x46/* F */)) ||\n         ((0x61/* a */ <= c) && (c <= 0x66/* f */));\n}',
				'function isHexCode(c) {\n  return (\n    (0x30 /* 0 */ <= c && c <= 0x39) /* 9 */ ||\n    (0x41 /* A */ <= c && c <= 0x46) /* F */ ||\n    (0x61 /* a */ <= c && c <= 0x66) /* f */\n  );\n}',
			],
		])('formats %j in one pass', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'x =\n  a &&\n  (b || c) && // c\n  d;',
			'x =\n  (a || b) + // c\n  d;',
			'x =\n  f(\n    a, // c\n  ) + d;',
			'x = 30 * (month - 1) /* c */ + day;',
			'x = a || b /* c */ || d;',
			'x = f(a && b /* c */, x);',
			'x =\n  a && (\n    <Note /> // note\n  ) &&\n  b;',
		])('keeps %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

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

		// Prettier's JSX mode (#446): a conditional chain with an element in it
		// doesn't indent, and each branch but \`null\`, \`undefined\`, and a nested
		// alternate breaks inside parentheses of its own
		it('breaks the branches of a conditional with an element inside parentheses', async () => {
			const input = `const a = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaa</span> : <span>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</span>;
const b = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : null;
const c = cond ? undefined : <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>;
const d = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : "";
const animal = isBird ? "bird" : isCat ? "cat" : <span className="warning">Unknown animal type</span>;
const shape = isA ? <b>A</b> : isB ? <b>BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB</b> : null;`;
			expect(await format(input)).toBeWithNewline(`const a = cond ? (
  <span>aaaaaaaaaaaaaaaaaaaaaaaa</span>
) : (
  <span>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</span>
);
const b = cond ? (
  <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
) : null;
const c = cond ? undefined : (
  <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
);
const d = cond ? (
  <span>
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  </span>
) : (
  ""
);
const animal = isBird ? (
  "bird"
) : isCat ? (
  "cat"
) : (
  <span className="warning">Unknown animal type</span>
);
const shape = isA ? (
  <b>A</b>
) : isB ? (
  <b>BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB</b>
) : null;`);
		});

		it('breaks a conditional with an element in JSX mode in children, attributes, returns, arrows, arguments, and member objects', async () => {
			const input = `function List({ items, filter }) {
  return <ul title={filter ? <span>filtered by {filter.name} and {filter.value}</span> : <span>all</span>}>{items.length ? items.map((item) => <li>{item}</li>) : <li className="empty">Nothing to show here yet</li>}</ul>;
}
function F() {
  return cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaa</div> : <div className="b">bbbbbbbbb</div>;
}
const G = () => cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaa</div> : <div className="b">bb</div>;
foo(cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaaaaaaa</div> : <div className="b">bbbbbbbbbbbbb</div>);
const props = (cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaaaaaaa</div> : <div className="b">bbb</div>).props;`;
			expect(await format(input)).toBeWithNewline(`function List({ items, filter }) {
  return (
    <ul
      title={
        filter ? (
          <span>
            filtered by {filter.name} and {filter.value}
          </span>
        ) : (
          <span>all</span>
        )
      }
    >
      {items.length ? (
        items.map((item) => <li>{item}</li>)
      ) : (
        <li className="empty">Nothing to show here yet</li>
      )}
    </ul>
  );
}
function F() {
  return cond ? (
    <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaa</div>
  ) : (
    <div className="b">bbbbbbbbb</div>
  );
}
const G = () =>
  cond ? (
    <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaa</div>
  ) : (
    <div className="b">bb</div>
  );
foo(
  cond ? (
    <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaaaaaaa</div>
  ) : (
    <div className="b">bbbbbbbbbbbbb</div>
  ),
);
const props = (
  cond ? (
    <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaaaaaaa</div>
  ) : (
    <div className="b">bbb</div>
  )
).props;`);
		});

		it('keeps comments after the ? of a conditional in JSX mode like Prettier', async () => {
			const input = `const x = cond ? // why
  <div /> : null;
const y = cond ?
  // own line
  <div /> : <span />;`;
			expect(await format(input)).toBeWithNewline(`const x = cond ? ( // why
  <div />
) : null;
const y = cond ? (
  // own line
  <div />
) : (
  <span />
);`);
		});

		it('breaks template values in conditional branches and template children in JSX mode', async () => {
			const input = `export function App({ cond, items }) @{
  const label = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : <span>bbbbbbbbbbbbbbbbbbbbbbbb</span>;
  <div>{cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : <span>bbbbbbbbbbbbbbbbbbbbbbbbbbbbb</span>}</div>
}
const x = cond ? @{ const a = 1; <div>{a}</div> } : null;
const y = cond ? <div /> : @for (const a of b) { <div>{a}</div> };`;
			expect(await format(input)).toBeWithNewline(`export function App({ cond, items }) @{
  const label = cond ? (
    <span>aaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
  ) : (
    <span>bbbbbbbbbbbbbbbbbbbbbbbb</span>
  );
  <div>
    {cond ? (
      <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
    ) : (
      <span>bbbbbbbbbbbbbbbbbbbbbbbbbbbbb</span>
    )}
  </div>
}
const x = cond ? (
  @{
    const a = 1;
    <div>{a}</div>
  }
) : null;
const y = cond ? (
  <div />
) : (
  @for (const a of b) {
    <div>{a}</div>
  }
);`);
		});

		it('breaks a conditional without an element in normal mode in children and attributes', async () => {
			const input = `function F({ cond, items }) {
  return (
    <div className={cond ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}>
      {cond ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
      {items.map((item) => (item.done ? <li className="done">{item.label}</li> : null))}
    </div>
  );
}`;
			expect(await format(input)).toBeWithNewline(`function F({ cond, items }) {
  return (
    <div
      className={
        cond
          ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    >
      {cond
        ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
      {items.map((item) =>
        item.done ? <li className="done">{item.label}</li> : null,
      )}
    </div>
  );
}`);
		});

		it('keeps a conditional with an element that fits on one line', async () => {
			const source = `const a = cond ? <span>a</span> : null;
const b = cond ? <b /> : isOther ? <i /> : undefined;
const c = <div>{cond ? <span>a</span> : <span>b</span>}</div>;`;
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier, a comment in a `${…}` never goes to the template's text,
		// which prints as written
		it('keeps a comment on its own line after the expression in its ${…}', async () => {
			const source = `x = \`\${
  foo
  /* comment */
}\`;
y = \`a \${
  foo
  // comment
} b \${bar}\`;`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a comment beside the expression or on its own line before it', async () => {
			const source = `z = \`\${foo /* c */} and \${
  // lead
  bar
}\`;`;
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps comments in the ${…} of CSS and GraphQL templates', async () => {
			const source = `const Box = styled.div\`
  color: \${
    foo
    // comment
  };
\`;
const query = gql\`
  query {
    user(id: \${
      id
      /* the id */
    }) {
      name
    }
  }
\`;`;
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier keeps a comment in a template literal's ${…}, but not in a
		// template literal type's: an own-line one leads the next type
		it('moves a comment on its own line to the next type of a template literal type', async () => {
			const result = await format(`type A = \`\${
  B
  // b
}x\${C}\${
  D
  // d
}\`;`);
			expect(result).toBeWithNewline(`type A = \`\${B}x\${
  // b
  C
}\${
  D
  // d
}\`;`);
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

		// Prettier's `babel` parser keeps a JSDoc cast's parentheses as a node,
		// so a comment inside them doesn't trail the head and break the chain
		// (#521). One after them does.
		it.each([
			'x = /** @type {X} */ (a /* c */).b.c().d().e().f();',
			'x = /** @type {X} */ (a /* c */)?.b.c().d();',
			'x = /** @type {X} */ (a) /* c */.b\n  .c()\n  .d()\n  .e()\n  .f();',
		])('keeps %j', async (source) => {
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

		// Like Prettier's default for a comment at the end of a line, one after
		// a `;` of a for header trails the clause before it. It used to move to
		// its own line before the next clause (#660).
		it('keeps a comment at the end of the line after a ; of a for header after it', async () => {
			const input = `for (let i = 0; // start
  i < 1; // bound
  i++) {}
for (let j = // c
  0; j < 1; j++) {}`;
			const expected = `for (
  let i = 0; // start
  i < 1; // bound
  i++
) {}
for (
  let j = 0; // c
  j < 1;
  j++
) {}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'for (\n  // c\n  let i = 0;\n  i < 1;\n  i++\n) {}',
			'for (\n  let i = 0;\n  // c\n  i < 1;\n  i++\n) {}',
			'for (let i = 0; i < 1; i++)\n  // c\n  foo();',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier's tie-break, a comment with code on both sides leads the
		// type annotation after it. It used to trail the name and print against
		// the `:` (#460), or move into the parameter list's parentheses (#479).
		it.each([
			'class A {\n  x /* c */ : T;\n}',
			'function f(...x /* c */ : T) {}',
			'type F = (a: T) /* c */ => void;',
			'type G = new (a: T) /* c */ => void;',
			'interface I {\n  (a: T) /* c */ : void;\n  new (a: T) /* c */ : X;\n  m(a: T) /* c */ : void;\n}',
			'declare function f(a: T) /* c */ : void;',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			'const [a, ...rest /* c */] = y;',
			'type F = (a: T /* c */) => void;',
			'interface I {\n  x /* c */: T;\n}',
		])('keeps the comment of %j before its closing bracket or colon', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's default for a comment at the end of a line, one after a
		// parameter list's `)` trails the last parameter, which breaks the list,
		// or the name when there are none. It used to print after the `:` (#479).
		it.each([
			['function f(a) // c\n  : T {}', 'function f(\n  a, // c\n): T {}'],
			['const f = (a) // c\n  : T => a;', 'const f = (\n  a, // c\n): T => a;'],
			['class A {\n  m(a) // c\n  : T {}\n}', 'class A {\n  m(\n    a, // c\n  ): T {}\n}'],
			['function f() // c\n  : T {}', 'function f(): T {} // c'],
			['function f(a) /* c */\n  : T {}', 'function f(a /* c */): T {}'],
			['type F = (a: T) // c\n  => void;', 'type F = (\n  a: T, // c\n) => void;'],
		])(
			'moves the comment at the end of the line in %j before the return type',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// The last parameter of a function type used to lose a comment after its
		// trailing comma to the return type on the next pass
		it('keeps the comments after the last parameter of a function type before the )', async () => {
			const expected = 'type F = (\n  a: T /* c */, // d\n) => void;';
			expect(await format('type F = (a: T) /* c */ // d\n  => void;')).toBeWithNewline(expected);
			expect(await format(expected)).toBeWithNewline(expected);
		});
	});

	// Prettier prints a block comment on a line of its own before a type after
	// a keyword or colon at the end of that keyword's line, with the type on
	// the next line, and its next pass joins the type, since the comment no
	// longer starts its line. The formatter prints that fixpoint, which keeps
	// the comment where it was written, in one pass (#570).
	describe('block comments on their own line before a type after a keyword or colon', () => {
		it.each([
			['type X = keyof\n  /* c */\n  T;', 'type X = keyof /* c */ T;'],
			['function f(a:\n  /* c */\n  T) {}', 'function f(a: /* c */ T) {}'],
			['type T = A extends\n  /* c */\n  B ? C : D;', 'type T = A extends /* c */ B ? C : D;'],
			[
				'type M = {\n  [\n    A in\n    /* prettier-ignore */\n    B\n  ]: C;\n};',
				'type M = {\n  [A in /* prettier-ignore */ B]: C;\n};',
			],
			['type X = typeof\n  /* c */\n  y;', 'type X = typeof /* c */ y;'],
			['type X = readonly\n  /* c */\n  T[];', 'type X = readonly /* c */ T[];'],
			[
				'type X = T extends infer\n  /* c */\n  U ? U : never;',
				'type X = T extends infer /* c */ U ? U : never;',
			],
			['function f(x): x is\n  /* c */\n  T {}', 'function f(x): x is /* c */ T {}'],
			['function f(x):\n  /* c */\n  T {}', 'function f(x): /* c */ T {}'],
			['const x = y as\n  /* c */\n  T;', 'const x = y as /* c */ T;'],
			['const x = y satisfies\n  /* c */\n  T;', 'const x = y satisfies /* c */ T;'],
			['let a:\n  /* c */\n  T;', 'let a: /* c */ T;'],
			['type X = T[\n  /* c */\n  K];', 'type X = T[/* c */ K];'],
			['type X = () =>\n  /* c */\n  T;', 'type X = () => /* c */ T;'],
			['type T = A extends B ?\n  /* c */\n  C : D;', 'type T = A extends B ? /* c */ C : D;'],
			['type T = A extends B ? C :\n  /* c */\n  D;', 'type T = A extends B ? C : /* c */ D;'],
			['type M = { [K in T as\n  /* c */\n  U]: V };', 'type M = { [K in T as /* c */ U]: V };'],
			['type T = [a:\n  /* c */\n  T];', 'type T = [a: /* c */ T];'],
			['type T = [...\n  /* c */\n  T];', 'type T = [.../* c */ T];'],
			['type X = keyof\n  /* a */\n  /* b */\n  T;', 'type X = keyof /* a */ /* b */ T;'],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A type that doesn't fit after the comment still starts the next line,
		// and so does one after a blank line or a line comment
		it.each([
			'let x: keyof /* c */\nVeryLongTypeNameThatKeepsGoingAndGoingAndGoingAndGoingAndGoingAndGoingAndGoing;',
			'type X = keyof /* c */\n\nT;',
			'type X = keyof // c\nT;',
			'type X = keyof /* c */ T;',
			'type X =\n  /* c */\n  T;',
			'type T = A &\n  /* c */\n  B;',
		])('keeps %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// An interface member breaks after the comment anyway
		it('formats a block comment on its own line after the colon of an interface member like Prettier', async () => {
			expect(await format('interface I {\n  a:\n    /* c */\n    T;\n}')).toBeWithNewline(
				'interface I {\n  a: /* c */\n  T;\n}',
			);
		});
	});

	// Like the types above, an expression after `new`, `await`, `yield*`, a
	// spread's `...`, or a conditional's `?` or `:` prints right after them, so
	// a block comment on its own line before it stays on their line. Prettier
	// breaks the line after the comment, and its next pass joins it, which the
	// formatter did too (#619).
	describe('block comments on their own line before an expression after a keyword or operator', () => {
		it.each([
			['const x = new\n  /* c */\n  Foo();', 'const x = new /* c */ Foo();'],
			['const x = new\n\n  /* c */\n  Foo();', 'const x = new /* c */ Foo();'],
			[
				'async function f() {\n  const x = await\n    /* c */\n    foo();\n}',
				'async function f() {\n  const x = await /* c */ foo();\n}',
			],
			[
				'function* g() {\n  const x = yield*\n    /* c */\n    a;\n}',
				'function* g() {\n  const x = yield* /* c */ a;\n}',
			],
			['f(...\n  /* c */\n  a);', 'f(.../* c */ a);'],
			['const x = [ ...\n  /* c */\n  a ];', 'const x = [.../* c */ a];'],
			['const { ...\n  /* c */\n  a } = x;', 'const { .../* c */ a } = x;'],
			['function f(...\n  /* c */\n  a) {}', 'function f(.../* c */ a) {}'],
			['const x = a ?\n  /* c */\n  b : c;', 'const x = a ? /* c */ b : c;'],
			['const x = a ? b :\n  /* c */\n  c;', 'const x = a ? b : /* c */ c;'],
			['const x = a ? b : c ?\n  /* c */\n  d : e;', 'const x = a ? b : c ? /* c */ d : e;'],
			['const x = a ?\n  /* c */\n  b ? d : e : c;', 'const x = a ? (/* c */ b ? d : e) : c;'],
			['const x = (await\n  /* c */\n  foo()).bar;', 'const x = (await /* c */ foo()).bar;'],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Prettier's line break after the comment breaks an object around a
		// spread, and the object then stays expanded. An expression that doesn't
		// fit after the comment still starts the next line, and so does one
		// after a line comment. A branch of a conditional in JSX mode starts a
		// line in its parentheses.
		it.each([
			'const x = {\n  .../* c */\n  a,\n};',
			'const x = {\n  b,\n  .../* c */\n  a,\n};',
			'const x = new /* c */\nFoo(\n  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,\n  ccccccccccccc,\n);',
			'const x = new // c\nFoo();',
			'const x = a ? (\n  /* c */\n  <div />\n) : null;',
			'const x = a ? (\n  <div />\n) : (\n  /* c */\n  foo()\n);',
			'const x = a ? (\n  /* c */\n  b\n) : (\n  <div />\n);',
			'function* g() {\n  yield (\n    /* c */\n    a\n  );\n}',
		])('keeps %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier's `printClass`, the class prints the comments of the
		// superclass around the parentheses it adds and the type arguments. They
		// used to print inside the parentheses (#483).
		it.each([
			['class A extends (/* c */ a || b) {}', 'class A extends /* c */ (a || b) {}'],
			['class D extends (a || b /* c */) {}', 'class D extends (a || b) /* c */ {}'],
			['class J extends (/* c */ a || b)<T> {}', 'class J extends /* c */ (a || b)<T> {}'],
			['class J extends (a || b /* c */)<T> {}', 'class J extends (a || b)<T> /* c */ {}'],
			[
				'class L extends (/* c */ a || b) implements X {}',
				'class L extends /* c */ (a || b) implements X {}',
			],
			['x = class extends (/* c */ a || b) {};', 'x = class extends /* c */ (a || b) {};'],
			[
				'class A extends (/* c */ (/* d */ a || b)) {}',
				'class A extends /* c */ /* d */ (a || b) {}',
			],
			[
				'class K extends (/* c */ @dec class {}) {}',
				'class K\n  extends /* c */ (\n    @dec\n    class {}\n  ) {}',
			],
			[
				'x = class extends /* c */ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc {};',
				'x = class\n  extends /* c */ (\n    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n      .bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc\n  ) {};',
			],
			[
				'x = class extends aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc /* c */ {};',
				'x = class extends (\n  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n    .bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc\n) /* c */ {};',
			],
			[
				'class A extends (/* prettier-ignore */ a   ||   b) {}',
				'class A extends /* prettier-ignore */ (a   ||   b) {}',
			],
		])('prints the comment of the superclass in %j like Prettier', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'class B extends /* c */ (a || b) {}',
			'class G extends (a || b) /* c */ {}',
			'class L extends (a || b) /* c */ implements X {}',
			'class E extends /* c */ a {}',
			'class F extends a /* c */ {}',
			'class H\n  // c\n  extends (a || b) {}',
			// A `prettier-ignore` after it stays inside the parentheses, where it
			// keeps ignoring it on the next format
			'class A extends (a   ||   b /* prettier-ignore */) {}',
			'class A extends (a   ||   b /* prettier-ignore */)<T> {\n  x = 1;\n}',
			// The comments of an arrow body that is an arrow are its own
			'class D extends (() => /* c */ /** @type {X} */ (() => Base)) {}',
			'class D extends (() => /* prettier-ignore */ () =>   Base) {}',
		])('keeps the comment of the superclass in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier's output for these changes when it formats it again: the
		// comment breaks the heading, and a nonempty body starts on the line
		// after it, which moves the comment into the body. Here a comment after
		// the superclass doesn't break the heading, and the body stays on the
		// comment's line, so the output is stable (#520).
		it.each([
			[
				'class D extends (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */) {}',
				'class D extends (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) /* c */ {}',
			],
			[
				'class D extends (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */)<T> {\n  x = 1;\n}',
				'class D extends (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)<T> /* c */ {\n  x = 1;\n}',
			],
			[
				'class D extends aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */ {\n  x = 1;\n}',
				'class D\n  extends aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */ {\n  x = 1;\n}',
			],
			// The comment leads the body here, and prints before its `{`
			[
				'class A implements Iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii, Jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj /* c */ {\n  x = 1;\n}',
				'class A\n  implements\n    Iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii,\n    Jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj /* c */ {\n  x = 1;\n}',
			],
		])('keeps the comment after the superclass in %j stable', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A line comment between the superclass and its type arguments ends the
		// heading after them. Prettier prints it there, with a nonempty body on
		// the next line, and its next pass moves the comment into the body, as
		// the parser does with one before the body, so it prints there. On a
		// line of its own before the type arguments, Prettier's first pass keeps
		// it there (#652).
		it.each([
			[
				'class A extends (a || b // c\n)<T> {\n  x = 1;\n}',
				'class A extends (a || b)<T> {\n  // c\n  x = 1;\n}',
			],
			['class A extends B // c\n<T> {\n  x = 1;\n}', 'class A extends B<T> {\n  // c\n  x = 1;\n}'],
			[
				'class A extends B\n// c\n<T> {\n  x = 1;\n}',
				'class A extends B<T> {\n  // c\n  x = 1;\n}',
			],
			[
				'class A extends (a || b // c\n)<T> {\n  // d\n}',
				'class A extends (a || b)<T> {\n  // c\n  // d\n}',
			],
			['class A extends B<T> // c\n{}', 'class A extends B<T> {\n  // c\n}'],
			[
				'x = class extends (a || b // c\n)<T> {\n  x = 1;\n};',
				'x = class extends (a || b)<T> {\n  // c\n  x = 1;\n};',
			],
			[
				'class A extends (a || b /* e */ // c\n)<T> {\n  x = 1;\n}',
				'class A extends (a || b)<T> /* e */ {\n  // c\n  x = 1;\n}',
			],
			['class A extends (B) // c\n{\n  x = 1;\n}', 'class A extends B {\n  // c\n  x = 1;\n}'],
		])(
			'moves the line comment after the superclass in %j into the body',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		// With an empty body, Prettier's next pass finds the comment after the
		// class's `{}`, where the body doesn't take it, so it prints there. Two
		// comments stay in their order on lines of their own, where Prettier
		// joins them in the opposite order (`// d // c`) (#652).
		it.each([
			['class A extends B // c\n<T> {}', 'class A extends B<T> {} // c'],
			['class A extends (a || b // c\n)<T> {}', 'class A extends (a || b)<T> {} // c'],
			['class A extends B\n// c\n<T> {}', 'class A extends B<T> {} // c'],
			['class A extends (a || b\n// c\n)<T> {}', 'class A extends (a || b)<T> {} // c'],
			['class A extends B /* d */ // c\n<T> {}', 'class A extends B<T> /* d */ {} // c'],
			['class A extends B // c\n<T> {} // d', 'class A extends B<T> {} // c // d'],
			['class A extends B // c\n// d\n<T> {}', 'class A extends B<T> {} // c\n// d'],
			['const X = class extends B // c\n<T> {};', 'const X = class extends B<T> {}; // c'],
			['export default class extends B // c\n<T> {}', 'export default class extends B<T> {} // c'],
			['(class extends B // c\n<T> {}).foo();', '(class extends B<T> {}).foo(); // c'],
			['foo(class extends B // c\n<T> {}, d);', 'foo(\n  class extends B<T> {}, // c\n  d,\n);'],
		])('prints the line comment of %j after the empty class', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A comment inside a JSDoc cast's parentheses stays there, like in
		// Prettier's `babel-ts` output, which keeps them as a node. It isn't after
		// the superclass, so a line comment doesn't move into the body (#521).
		// With type arguments, the body's `{` on its own line reparses them as
		// an instantiation expression (#523).
		it.each([
			[
				'class A extends /** @type {X} */ (a // c\n)<T> {\n  x = 1;\n}',
				'class A\n  extends /** @type {X} */ (\n    a // c\n  )<T>\n{\n  x = 1;\n}',
			],
			[
				'class A extends /** @type {X} */ (a // c\n) {\n  x = 1;\n}',
				'class A\n  extends /** @type {X} */ (\n    a // c\n  )\n{\n  x = 1;\n}',
			],
			[
				'class A extends /** @type {X} */ (a /* c */) {}',
				'class A extends /** @type {X} */ (a /* c */) {}',
			],
			[
				'class A extends /** @type {X} */ (a) /* c */ {}',
				'class A extends /** @type {X} */ (a) /* c */ {}',
			],
		])('keeps the comment inside the cast of the superclass in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
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
			// Prettier's first pass prints it before the type arguments (#652)
			[
				'class A extends B\n// c\n<T> implements C {}',
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

	// Like Prettier's `handleMethodNameComments`, a line comment or an own-line
	// comment after a class member's or a parameter property's decorator
	// trails it, so it stays before the modifiers. After them, it would break
	// the line after `static`, which the parser then reads as a field (#535).
	// Like Prettier's `locStart`, a parameter starts at its first decorator, so
	// the comments after one stay after it.
	describe('comments between decorators and the modifiers of a class member or parameter', () => {
		/**
		 * The class members of a source's first class, as `static name`
		 * @param {string} source
		 * @returns {string[]}
		 */
		const membersOf = (source) => {
			const ast = /** @type {any} */ (parsers.tsrx.parse(source, /** @type {any} */ ({})));
			return ast.body[0].body.body.map(
				(/** @type {any} */ member) => `${member.static ? 'static ' : ''}${member.key.name}`,
			);
		};

		it.each([
			'class A {\n  @dec()\n  // comment\n  static b;\n}',
			'class A {\n  @dec()\n  /* comment */\n  static b;\n}',
			'class A {\n  @dec()\n  // comment\n  accessor b;\n}',
			'class A {\n  @dec()\n  // comment\n  readonly b: number;\n}',
			'class A {\n  @dec()\n  // comment\n  public static m() {}\n}',
			'class A {\n  @dec()\n  // comment\n  static async *m() {}\n}',
			'class A {\n  @dec()\n  // comment\n  get x() {\n    return 1;\n  }\n}',
			'class A {\n  @dec()\n  // comment\n  [computed] = 1;\n}',
			'class A {\n  // lead\n  @dec()\n  // comment\n  static b;\n}',
			'class A {\n  constructor(\n    @inject(Bar)\n    // c\n    private readonly bar: IBar,\n  ) {}\n}',
			'class A {\n  constructor(\n    @a\n    /* c */\n    private x = 1,\n  ) {}\n}',
			'class A {\n  constructor(\n    @a // c\n    private x: T,\n  ) {}\n}',
			'class A {\n  constructor(@a /* c */ private x: T) {}\n}',
			'class A {\n  constructor(@inject(/* c */ Bar) private bar: IBar) {}\n}',
			'class A {\n  m(@a /* c */ @b x: T) {}\n}',
			'class A {\n  m(\n    @a // c\n    x: T,\n  ) {}\n}',
			'class A {\n  m(\n    @a\n    // c\n    x,\n  ) {}\n}',
			// A comment between a parameter property's modifiers and its name stays there
			'class A {\n  constructor(@dec private /* c */ x: T) {}\n}',
			'class A {\n  constructor(@a /* a */ @b /* b */ private /* c */ x) {}\n}',
			'class A {\n  constructor(@dec private /* c */ x = 1) {}\n}',
		])('keeps %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'class A {\n  @dec()\n  /* c */ static b;\n}',
				'class A {\n  @dec()\n  /* c */\n  static b;\n}',
			],
			[
				'class A {\n  @dec()\n\n  // comment\n\n  static b;\n}',
				'class A {\n  @dec()\n\n  // comment\n  static b;\n}',
			],
			// A comment between two modifiers moves before them, like the tie-break
			// with the name after it in Prettier
			[
				'class A {\n  constructor(@dec /* a */ private /* b */ readonly /* c */ x: T) {}\n}',
				'class A {\n  constructor(@dec /* a */ /* b */ private readonly /* c */ x: T) {}\n}',
			],
			// Prettier's own layout for an own-line comment before a parameter's type
			[
				'class A {\n  m(\n    @a\n    // c\n    x: T,\n  ) {}\n}',
				'class A {\n  m(\n    @a\n    x // c\n    : T,\n  ) {}\n}',
			],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'class A {\n  @dec() // comment\n  static b;\n}',
			'class A {\n  @dec() /* comment */ static b;\n}',
			'class A {\n  @dec() /* a */ /* b */ static x;\n}',
			'class A {\n  @dec() static /* c */ b;\n}',
			'class A {\n  @a\n  // c\n  @b\n  static x;\n}',
			'class A {\n  @dec()\n  // comment\n  m() {}\n}',
			'class A {\n  @dec()\n  // comment\n  #priv = 1;\n}',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a static field static on every pass', async () => {
			const source =
				'class A {\n  @dec()\n  // comment\n  static b;\n  @dec() /* c */ static c;\n}';
			const once = await format(source);

			expect(membersOf(once)).toEqual(['static b', 'static c']);
			expect(membersOf(await format(once))).toEqual(membersOf(source));
		});

		it('keeps the modifiers and decorators of a parameter property on every pass', async () => {
			/**
			 * The first constructor's parameter properties, as `@decorators modifiers name`
			 * @param {string} source
			 * @returns {string[]}
			 */
			const parametersOf = (source) => {
				const ast = /** @type {any} */ (parsers.tsrx.parse(source, /** @type {any} */ ({})));
				return ast.body[0].body.body[0].value.params.map(
					(/** @type {any} */ { accessibility, readonly, parameter }) =>
						[
							...parameter.decorators.map((/** @type {any} */ d) => `@${d.expression.name}`),
							accessibility,
							readonly && 'readonly',
							parameter.name,
						]
							.filter(Boolean)
							.join(' '),
				);
			};
			const source =
				'class A {\n  constructor(\n    @a\n    // a\n    private readonly x: T,\n    @b /* b */ protected /* c */ y: T,\n  ) {}\n}';
			const once = await format(source);

			expect(parametersOf(once)).toEqual(['@a private readonly x', '@b protected y']);
			expect(parametersOf(await format(once))).toEqual(parametersOf(source));
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

		// Like Prettier's `handleCommentInEmptyParens`, the comment stays in the
		// empty parentheses before a return type, and in those of a function type
		// or signature. It used to move after the `)` (#479).
		it.each([
			'function f(/* none */): T {}',
			'const g = (/* none */): T => a;',
			'class A {\n  m(/* none */): T {}\n}',
			'type F = (/* none */) => void;',
			'type G = new (/* none */) => void;',
			'interface I {\n  (/* none */): void;\n  new (/* none */): X;\n  m(/* none */): void;\n  n(/* none */);\n}',
			'declare function f(/* none */): void;',
			'type F = (\n  // none\n) => void;',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// A comment right after an opening tag belongs to the element's body,
		// even on the tag's line. It used to trail the opening tag, which
		// doesn't print its comments, and was deleted (#498).
		it.each([
			'const el = <div>/* c */x</div>;',
			'const el = <>/* c */ x</>;',
			'const el = <div>/* c */ text</div>;',
			'export function App() @{\n  <div>/* c */x</div>\n}',
		])('keeps the comment after the opening tag of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['<div>/* c */x</div>;', '<div>/* c */x</div>'],
			['<>/* c */ x</>;', '<>/* c */ x</>'],
			// Like Prettier's `<p>{/* c */}{name}</p>`
			[
				'const el = <p>/* c */{name}</p>;',
				'const el = (\n  <p>\n    /* c */\n    {name}\n  </p>\n);',
			],
			[
				'export function App() @{\n  <p>// c\n    text\n  </p>\n}',
				'export function App() @{\n  <p>\n    // c\n    text\n  </p>\n}',
			],
			[
				'export function App() @{\n  <div> // c\n    <b />\n  </div>\n}',
				'export function App() @{\n  <div>\n    // c\n    <b />\n  </div>\n}',
			],
		])('keeps the comment after the opening tag of %j in the body', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// The parser keeps JSX text whole around a comment in it, so no child
		// starts after the comment. It used to move to the closing tag (#388).
		it.each([
			'const el = (\n  <div>\n    /* c */\n    text here\n  </div>\n);',
			'const el = (\n  <div>\n    // c\n    text here\n  </div>\n);',
			'const el = (\n  <div>\n    text here\n    /* c */\n    more\n  </div>\n);',
			'const el = (\n  <div>\n    text here\n    // c\n    more\n  </div>\n);',
			'const el = (\n  <div>\n    text here /* c */\n    more\n  </div>\n);',
			'const el = (\n  <div>\n    text here\n    /* c */ more\n  </div>\n);',
			'const el = <div>text here /* c */ more</div>;',
			'const el = <div>a/* c */b</div>;',
			'const el = (\n  <div>\n    <b />\n    /* c */ text\n  </div>\n);',
			'const el = (\n  <div>\n    {value}\n    // c\n    text\n  </div>\n);',
			'export function App() @{\n  <div>\n    text here\n    // c\n    more\n  </div>\n}',
			'export function App() @{\n  <p>\n    a\n    /* b */\n    c\n  </p>\n}',
			// A comment that starts or ends a line keeps the line break, which
			// makes the spaces next to it insignificant
			'export function App() @{\n  <div>\n    /* a */ text /* b */ more /* c */\n  </div>\n}',
		])('keeps the comment in the text of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'const el = <div>\n  text here\n  /* c */\n  more\n</div>;',
				'const el = (\n  <div>\n    text here\n    /* c */\n    more\n  </div>\n);',
			],
		])('keeps the comment in the text of %j in place', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Comments that a child takes stay with it, as before
		it.each([
			'const el = (\n  <div>\n    // c\n    <b />\n  </div>\n);',
			'const el = (\n  <div>\n    /* c */ <b />\n  </div>\n);',
			'const el = (\n  <div>\n    <b /> /* c */ text\n  </div>\n);',
			'const el = (\n  <div>\n    {a} // c\n    text\n  </div>\n);',
			'const el = (\n  <div>\n    text\n    <b /> // c\n  </div>\n);',
			'const el = (\n  <div>\n    text\n    {/* c */}\n    more\n  </div>\n);',
			'export function App() @{\n  <div>\n    <b />\n    // c\n  </div>\n}',
			// A `prettier-ignore` after text still keeps the next child as written
			'const el = (\n  <div>\n    text\n    // prettier-ignore\n    <b   a="1" />\n  </div>\n);',
			'export function App() @{\n  <div>\n    text\n    /* prettier-ignore */\n    <b   a="1" />\n  </div>\n}',
		])('keeps the comment next to a child of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// In an element in a `{…}` container, a comment before the first child,
		// or after a `{…}` child, went to the element's body, which printed it
		// before the closing tag. It stays before the child after it, as in a
		// template (#637).
		it.each([
			'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {" "}\n        /* c */ <i />\n      </div>\n    )}\n  </main>\n}',
			'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {y}\n        /* c */\n        <i />\n      </div>\n    )}\n  </main>\n}',
			'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {y}\n        // c\n        {z}\n      </div>\n    )}\n  </main>\n}',
			'export function App() @{\n  <main>\n    {x && (\n      <div>\n        /* c */\n        <i />\n      </div>\n    )}\n  </main>\n}',
			'export function App() @{\n  <main>\n    {x && (\n      <div>\n        // c\n        <i />\n      </div>\n    )}\n  </main>\n}',
			'export function App() @{\n  <main\n    a={\n      <b>\n        {" "}\n        /* c */ <i />\n      </b>\n    }\n  />\n}',
			'export function App() @{\n  @switch (x) {\n    @case 1: {\n      <p>\n        {y && (\n          <div>\n            {z}\n            // c\n            <i />\n          </div>\n        )}\n      </p>\n    }\n  }\n}',
			// After the last child, as before
			'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {y}\n        // c\n      </div>\n    )}\n  </main>\n}',
		])(
			'keeps the comment between the children of the element in a container of %j',
			async (source) => {
				expect(await format(source)).toBeWithNewline(source);
			},
		);

		it.each([
			[
				'export function App() @{\n  <main>{x && <div> /* c */ <i /></div>}</main>\n}',
				'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {" "}\n        /* c */ <i />\n      </div>\n    )}\n  </main>\n}',
			],
			[
				'export function App() @{\n  <main a={<b> /* c */ <i /></b>} />\n}',
				'export function App() @{\n  <main\n    a={\n      <b>\n        {" "}\n        /* c */ <i />\n      </b>\n    }\n  />\n}',
			],
			[
				'export function App() @{\n  <main>{x && <div>/* c */<i /></div>}</main>\n}',
				'export function App() @{\n  <main>\n    {x && (\n      <div>\n        /* c */ <i />\n      </div>\n    )}\n  </main>\n}',
			],
		])(
			'formats the comment in the element in a container of %j like in a template',
			async (source, expected) => {
				expect(await format(source)).toBeWithNewline(expected);
			},
		);

		// A block comment after a child used to print after a space, which was
		// new text on the child's line (#538)
		it.each([
			'const a = <div>{x}/* c */cc</div>;',
			'const a = <div>{x} /* c */ cc</div>;',
			'const a = <div>{x /* c */}</div>;',
			'export function App() @{\n  <p>\n    <b>t</b> // c\n    c\n  </p>\n}',
		])('keeps the spaces around the comment after a child of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'const a = <div><b /> /* c */\n  c</div>;',
				'const a = (\n  <div>\n    <b /> /* c */\n    c\n  </div>\n);',
			],
			['const a = <div>{x}/* c */</div>;', 'const a = (\n  <div>\n    {x} /* c */\n  </div>\n);'],
			[
				'const a = <div>{x} /* c */\n</div>;',
				'const a = (\n  <div>\n    {x} /* c */\n  </div>\n);',
			],
		])('ends the line after the comment after a child of %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A line comment after a child used to join a one-letter word on the next
		// line, which made it text, and a `{" "}` before a comment on its own
		// line was lost (#539). A line comment glued to a closing tag is in the
		// text after it, as after a self-closing tag, and stays glued (#442).
		it.each([
			[
				'const a = <div><b>t</b>// c\n  c</div>;',
				'const a = (\n  <div>\n    <b>t</b>// c\n    c\n  </div>\n);',
			],
			[
				'const a = <div><b />// c\n  c</div>;',
				'const a = (\n  <div>\n    <b />// c\n    c\n  </div>\n);',
			],
			[
				'const a = <div>{a}{" "}\n// c\n{b}</div>;',
				'const a = (\n  <div>\n    {a}{" "}\n    // c\n    {b}\n  </div>\n);',
			],
			[
				'const a = <div>{a}{" "}\n/* c */\n<b /></div>;',
				'const a = (\n  <div>\n    {a}{" "}\n    /* c */\n    <b />\n  </div>\n);',
			],
		])('keeps the line break of the comment next to a child of %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A `{" "}` keeps a block comment on its line even in the text after it,
		// where a space printed before the comment is text. It printed one
		// either way, which the next format read as the text's leading space
		// (#542).
		it.each([
			['const a = <div>{" "}/* c */y</div>;', 'const a = <div>{" "}/* c */y</div>;'],
			['const a = <div>x{" "}/* c */\n  y</div>;', 'const a = <div>x{" "}/* c */y</div>;'],
			['const a = <div>x{" "} /* c */\n  y</div>;', 'const a = <div>x{" "}/* c */y</div>;'],
			[
				'export function App() @{\n  <p>{a}{" "}/* c */y</p>\n}',
				'export function App() @{\n  <p>\n    {a}\n    {" "}/* c */y\n  </p>\n}',
			],
		])('keeps the block comment after the {" "} of %j in place', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'const a = <div>x{" "} /* c */ y</div>;',
			'const a = <div>x{" "}/* c */ y</div>;',
			'const a = <div>x{" "} /* c */ /* d */ y</div>;',
		])('keeps the spaces around the block comment after the {" "} of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// In an element in a `{…}` container, the parser keeps no text for the
		// space between a `{" "}` and a block comment that a tag or the closing
		// tag follows (#667), which then starts a line of its own after the
		// comment. A space printed before the comment was read as a line's
		// trailing space on the next format, which dropped it.
		it.each([
			[
				'export function App() @{\n  <main>{x && <div>{" "} /* c */</div>}</main>\n}',
				'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {" "}/* c */\n      </div>\n    )}\n  </main>\n}',
			],
			[
				'export function App() @{\n  <main>{x && <div>a{" "} /* c */</div>}</main>\n}',
				'export function App() @{\n  <main>\n    {x && (\n      <div>\n        a{" "}/* c */\n      </div>\n    )}\n  </main>\n}',
			],
			[
				'export function App() @{\n  <main>{x && <div>{" "} /* a */ /* b */<i /></div>}</main>\n}',
				'export function App() @{\n  <main>\n    {x && (\n      <div>\n        {" "}/* a *//* b */\n        <i />\n      </div>\n    )}\n  </main>\n}',
			],
			// Outside a container the space is text, and stays
			[
				'export function App() @{\n  <div>{" "} /* c */<i /></div>\n}',
				'export function App() @{\n  <div>\n    {" "} /* c */ <i />\n  </div>\n}',
			],
		])('prints the block comment after the {" "} of %j against it', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Like Prettier's `printJsxClosingElement` and
		// `printJsxOpeningClosingFragment`. They used to be deleted, and the one
		// in a closing fragment moved to the next statement (#499).
		it.each([
			'const el = <div>x</div /* c */>;',
			'const el = <div>x</ /* c */ div>;',
			'const el = <>x</ /* c */>;\nfoo();',
			'export function App() @{\n  <div>x</ /* c */ div>\n}',
		])('keeps the comment in the closing tag of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['<div>x</ /* c */ div>;', '<div>x</ /* c */ div>'],
			['<>x</ // c\n>;', '<>x</\n  // c\n>'],
			['<div>x</\n// c\ndiv>;', '<div>x</\n  // c\n  div\n>'],
			// Like Prettier, which prints `<div>x</div>; // c`
			['<div>x</div // c\n>;', '<div>x</div> // c'],
			['const el = <div>x</div // c\n>;', 'const el = <div>x</div>; // c'],
			['const el = (\n  <>\n    x\n  </\n    // c\n  >\n);', 'const el = <>x</\n    // c\n  >;'],
			[
				'const el = (\n  <div>\n    x\n  </\n    // c\n    div\n  >\n);',
				'const el = <div>x</\n    // c\n    div\n  >;',
			],
		])('formats the comment in the closing tag of %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Each tag of a dynamic tag prints its own expression, with the comments
		// written in its braces. The closing tag printed the opening tag's
		// comments again and dropped its own, and a comment on its own line in
		// the opening tag moved into the children (#573).
		it.each([
			'const a = <{Comp /* c */}>text</{Comp}>;',
			'const a = <{/* c */ Comp}>text</{Comp}>;',
			'const a = <{Comp /* c */}>text</{Comp /* d */}>;',
			'const a = <{Comp /* c */} x="1">text</{Comp}>;',
			'const a = <{Comp /* c */}></{Comp}>;',
			'export function App() @{\n  <{Comp /* c */}>text</{Comp}>\n}',
		])('keeps the comments of the dynamic tag of %j once', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'const a = <{Comp // c\n}>text</{Comp}>;',
				'const a = (\n  <{\n    Comp // c\n  }>\n    text\n  </{Comp}>\n);',
			],
			[
				'const a = <{// c\nComp}>text</{Comp}>;',
				'const a = (\n  <{\n    // c\n    Comp\n  }>\n    text\n  </{Comp}>\n);',
			],
			[
				'const b = <{Comp\n// c\n}>text</{Comp}>;',
				'const b = (\n  <{\n    Comp\n    // c\n  }>\n    text\n  </{Comp}>\n);',
			],
			[
				'const a = <{Comp\n// c\n} a="1" b="2">text</{Comp}>;',
				'const a = (\n  <{\n    Comp\n    // c\n  }\n    a="1"\n    b="2"\n  >\n    text\n  </{Comp}>\n);',
			],
			// Like a line comment in a closing tag, as in `</\n// c\ndiv>`
			[
				'const a = <{Comp}>text</{Comp // d\n}>;',
				'const a = <{Comp}>text</{\n    Comp // d\n  }>;',
			],
			[
				'const a = <{Comp}>text</{Comp\n// d\n}>;',
				'const a = <{Comp}>text</{\n    Comp\n    // d\n  }>;',
			],
			[
				'export function App() @{ <{Comp\n// c\n}>text</{Comp}> }',
				'export function App() @{\n  <{\n    Comp\n    // c\n  }>\n    text\n  </{Comp}>\n}',
			],
			// A comment inside the expression is in both tags
			[
				'const a = <{a /* x */ .b}>text</{a /* x */ .b}>;',
				'const a = <{a /* x */.b}>text</{a /* x */.b}>;',
			],
		])('formats the comments in the braces of the dynamic tag of %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A comment in a shorthand attribute prints inside its braces, like the
		// one in the container of `key={/* c */ key}`. It used to be deleted
		// (#462).
		it.each([
			'function A(key) @{\n  <div {/* c */ key} />\n}',
			'function A(key) @{\n  <div {key /* c */} />\n}',
			'function A(key) @{\n  <div\n    {\n      // c\n      key\n    }\n  />\n}',
			'const el = <div {key /* c */} title="x" />;',
			'const el = <div a="1" {/* c */ key} b="2" />;',
			'const el = <div {key} />;',
		])('keeps the comment in the shorthand attribute of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			[
				'function A(key) @{\n  <div {\n    // c\n    key} />\n}',
				'function A(key) @{\n  <div\n    {\n      // c\n      key\n    }\n  />\n}',
			],
			['<div {key // c\n} />;', '<div\n  {\n    key // c\n  }\n/>'],
		])('breaks the shorthand attribute of %j around its line comment', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Like Prettier, a block comment between an attribute's `=` and its value
		// prints before the value. They used to be deleted (#514).
		it.each([
			[
				'const el = <div attr=/* comment */"foo" b=/* c */{x}></div>;',
				'const el = <div attr=/* comment */ "foo" b=/* c */ {x}></div>;',
			],
			[
				'export function App() @{\n  <div attr=/* c */"foo">text</div>\n}',
				'export function App() @{\n  <div attr=/* c */ "foo">text</div>\n}',
			],
			// Prettier moves one that ends its line before the `=` on the next
			// format; it stays before the value
			['const el = <div attr=/* c */\n"foo"></div>;', 'const el = <div attr=/* c */ "foo"></div>;'],
			['const el = <div attr=\n/* c */\n{x}></div>;', 'const el = <div attr=/* c */ {x}></div>;'],
		])('keeps the comment before the value of %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'const el = <div attr=/* a */ <i /> c=/* d */ <></>></div>;',
			'const el = <div attr="foo" /* c */ b="2"></div>;',
		])('keeps the comments around the value of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// A line comment there prints where Prettier's output settles: after a
		// string or element value, like a trailing comment of the attribute, and
		// inside the braces of a container. Prettier prints one on a line of its
		// own before the value first, which isn't idempotent, and moves one after
		// the `=` to the end of the element, or into its children, where it
		// becomes text; here the opening tag breaks so it stays after the
		// attribute.
		it.each([
			[
				'const el = <div attr= // comment\n"foo" b="2"></div>;',
				'const el = (\n  <div\n    attr="foo" // comment\n    b="2"\n  ></div>\n);',
			],
			[
				'const el = <div attr=\n// comment\n"foo"></div>;',
				'const el = (\n  <div\n    attr="foo" // comment\n  ></div>\n);',
			],
			[
				'const el = <div attr= // c\n"foo">text</div>;',
				'const el = (\n  <div\n    attr="foo" // c\n  >\n    text\n  </div>\n);',
			],
			[
				'const el = <div attr=/* a */ // c\n"foo" b="1"></div>;',
				'const el = (\n  <div\n    attr=/* a */ "foo" // c\n    b="1"\n  ></div>\n);',
			],
			[
				'const el = <div attr= // c\n<i />></div>;',
				'const el = (\n  <div\n    attr=<i /> // c\n  ></div>\n);',
			],
			[
				'const el = <div attr=\n// comment\n{x} b="2"></div>;',
				'const el = (\n  <div\n    attr={\n      // comment\n      x\n    }\n    b="2"\n  ></div>\n);',
			],
			[
				'export function App() @{\n  <div attr= // c\n  "foo">text</div>\n}',
				'export function App() @{\n  <div\n    attr="foo" // c\n  >\n    text\n  </div>\n}',
			],
		])('formats the line comment before the value of %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Like Prettier's `print("name")`, an attribute's name prints with its
		// comments, which were deleted (#575)
		it.each([
			'const el = <div attr /* a */="x"></div>;',
			'const el = <div attr /* a */="x" b /* c */></div>;',
		])('keeps the comment after the name of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it('keeps a line comment after the name of an attribute in the opening tag', async () => {
			expect(await format('const el = <div attr // a\n="x">text</div>;')).toBeWithNewline(
				'const el = (\n  <div\n    attr="x" // a\n  >\n    text\n  </div>\n);',
			);
		});

		// Like Prettier, a comment in a spread's braces before its argument leads
		// the argument and prints before the `...`. It trailed the spread, or led
		// the next attribute, so it moved out of the braces, and a
		// `prettier-ignore` printed again after the ignored spread (#489).
		it.each([
			['a = <div {.../* note */b}/>;', 'a = <div {/* note */ ...b} />;'],
			['a = <div {/* note */...b}/>;', 'a = <div {/* note */ ...b} />;'],
			['a = <div {.../* prettier-ignore */b}/>;', 'a = <div {/* prettier-ignore */ ...b} />;'],
			['a = <div {... /* note */ b} c="1"/>;', 'a = <div {/* note */ ...b} c="1" />;'],
			['a = <div c="1" {.../* note */b} d />;', 'a = <div c="1" {/* note */ ...b} d />;'],
			[
				'a = <div {...// note\nb}/>;',
				'a = (\n  <div\n    {\n      // note\n      ...b\n    }\n  />\n);',
			],
			[
				'a = <div {...\n  // prettier-ignore\n  b}/>;',
				'a = (\n  <div\n    {\n      // prettier-ignore\n      ...b\n    }\n  />\n);',
			],
			[
				'export function App(props) @{\n  <div {.../* prettier-ignore */props} />\n}',
				'export function App(props) @{\n  <div {/* prettier-ignore */ ...props} />\n}',
			],
		])('keeps the comment before the argument of the spread in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Like Prettier, a comment after a spread's argument stays in its braces.
		// Before another attribute, it was deleted, and otherwise it moved after
		// the `}` (#517).
		it.each([
			[
				'c = <div {...a\n// e\n} b="1" />;',
				'c = (\n  <div\n    {\n      ...a\n      // e\n    }\n    b="1"\n  />\n);',
			],
			[
				'd = <div {...a\n// f\n} />;',
				'd = (\n  <div\n    {\n      ...a\n      // f\n    }\n  />\n);',
			],
			[
				'const el = <div {...a // s\n} />;',
				'const el = (\n  <div\n    {\n      ...a // s\n    }\n  />\n);',
			],
			[
				'export function App(props) @{\n  <div {...props\n  // c\n  } class="x">text</div>\n}',
				'export function App(props) @{\n  <div\n    {\n      ...props\n      // c\n    }\n    class="x"\n  >\n    text\n  </div>\n}',
			],
			// The braces break with the opening tag
			[
				'const el = <div {...a /* s */} bbbbbbbbbbbbbb="1" ccccccccccccccccc="2" dddddddddddddddddddd="3" />;',
				'const el = (\n  <div\n    {\n      ...a /* s */\n    }\n    bbbbbbbbbbbbbb="1"\n    ccccccccccccccccc="2"\n    dddddddddddddddddddd="3"\n  />\n);',
			],
			// Prettier's `jsx/ignore/spread.js`, which lost its `prettier-ignore`
			[
				'function HelloWorld() {\n  return (\n    <div\n      {...{} /*\n      // @ts-ignore */ /* prettier-ignore */}\n      invalidProp="HelloWorld"\n    >\n      test\n    </div>\n  );\n}',
				'function HelloWorld() {\n  return (\n    <div\n      {\n        ...{} /*\n      // @ts-ignore */ /* prettier-ignore */\n      }\n      invalidProp="HelloWorld"\n    >\n      test\n    </div>\n  );\n}',
			],
		])('keeps the comment after the argument of the spread in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each(['const el = <div {...a /* s */} b="1" />;', 'const el = <div {...a} b="1" />;'])(
			'keeps the spread attribute of %j',
			async (source) => {
				expect(await format(source)).toBeWithNewline(source);
			},
		);

		// Like Prettier, a comment after the expression of a `{…}` stays in its
		// braces. It moved after the `}`, or, before another attribute, was
		// deleted (#574).
		it.each([
			[
				'e = <div>{a\n// g\n}</div>;',
				'e = (\n  <div>\n    {\n      a\n      // g\n    }\n  </div>\n);',
			],
			[
				'f = <div b={a\n// g\n} c="1" />;',
				'f = (\n  <div\n    b={\n      a\n      // g\n    }\n    c="1"\n  />\n);',
			],
			[
				'e = <div>{a\n/* g */\n}</div>;',
				'e = (\n  <div>\n    {\n      a\n      /* g */\n    }\n  </div>\n);',
			],
			[
				'e = <div b={a\n/* g */\n} />;',
				'e = (\n  <div\n    b={\n      a\n      /* g */\n    }\n  />\n);',
			],
			[
				'e = <div>{a\n// g\n// h\n}</div>;',
				'e = (\n  <div>\n    {\n      a\n      // g\n      // h\n    }\n  </div>\n);',
			],
			[
				'e = <div>text {a\n// g\n} more</div>;',
				'e = (\n  <div>\n    text{" "}\n    {\n      a\n      // g\n    }{" "}\n    more\n  </div>\n);',
			],
			[
				'e = <div a={<b />\n// c\n} />;',
				'e = (\n  <div\n    a={\n      <b />\n      // c\n    }\n  />\n);',
			],
			[
				'e = <div>{f(a)\n// g\n}</div>;',
				'e = (\n  <div>\n    {\n      f(a)\n      // g\n    }\n  </div>\n);',
			],
			[
				'e = <div>{" "\n// c\n}text</div>;',
				'e = (\n  <div>\n    {\n      " "\n      // c\n    }\n    text\n  </div>\n);',
			],
			// Prettier's `jsx/comments/eslint-disable.js`
			[
				'const render = items => (\n  <div>{ /* eslint-disable */\n    \t items.map(item => null)\n      /* eslint-enable */    }</div>\n)',
				'const render = (items) => (\n  <div>\n    {\n      /* eslint-disable */\n      items.map((item) => null)\n      /* eslint-enable */\n    }\n  </div>\n);',
			],
			[
				'export function App() @{\n  <div>\n    {a}\n    {b\n    // c\n    }\n  </div>\n}',
				'export function App() @{\n  <div>\n    {a}\n    {\n      b\n      // c\n    }\n  </div>\n}',
			],
			[
				'export function App() @{ <div a={x\n/* c */} b={y} /> }',
				'export function App() @{\n  <div\n    a={\n      x\n      /* c */\n    }\n    b={y}\n  />\n}',
			],
			[
				'export function App() @{\n  const a = 1;\n  <div>\n    text {a\n    // g\n    } more\n  </div>\n}',
				'export function App() @{\n  const a = 1;\n  <div>\n    text{" "}\n    {\n      a\n      // g\n    }{" "}\n    more\n  </div>\n}',
			],
		])('keeps the comment after the expression of the braces in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			['e = <div>{a // g\n}</div>;', 'e = (\n  <div>\n    {\n      a // g\n    }\n  </div>\n);'],
			['e = <div b={a // g\n} />;', 'e = (\n  <div\n    b={\n      a // g\n    }\n  />\n);'],
			// After the `}`, it stays there
			['e = <div>{a}\n// g\n</div>;', 'e = (\n  <div>\n    {a}\n    // g\n  </div>\n);'],
		])('formats the comment after the expression of %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Like Prettier's `printJsxEmptyExpression`, the comments alone in braces
		// print on lines of their own when one of them is a line comment, and the
		// `}` on the next line. The `}` joined the line comment, which then didn't
		// parse (#572).
		it.each([
			[
				'const c = <div>{\n// only\n}</div>;',
				'const c = (\n  <div>\n    {\n      // only\n    }\n  </div>\n);',
			],
			[
				'const d = <div a={\n// only\n} />;',
				'const d = (\n  <div\n    a={\n      // only\n    }\n  />\n);',
			],
			[
				'const a = <div a={// a\n} b="1">x</div>;',
				'const a = (\n  <div\n    a={\n      // a\n    }\n    b="1"\n  >\n    x\n  </div>\n);',
			],
			[
				'const a = <div>{/* a */ // b\n}</div>;',
				'const a = (\n  <div>\n    {\n      /* a */\n      // b\n    }\n  </div>\n);',
			],
			[
				'const a = <div>{\n// a\n// b\n}</div>;',
				'const a = (\n  <div>\n    {\n      // a\n      // b\n    }\n  </div>\n);',
			],
			[
				'const a = <div>text {// a\n} more</div>;',
				'const a = (\n  <div>\n    text{" "}\n    {\n      // a\n    }{" "}\n    more\n  </div>\n);',
			],
			['const a = <>{// a\n}</>;', 'const a = (\n  <>\n    {\n      // a\n    }\n  </>\n);'],
			// Block comments go on consecutive lines
			[
				'const a = <div>{/* a */ /* b */}</div>;',
				'const a = (\n  <div>\n    {/* a */\n    /* b */}\n  </div>\n);',
			],
			['const a = <div>{\n/* a */\n}</div>;', 'const a = <div>{/* a */}</div>;'],
			[
				'export function App() @{ <div>{\n// only\n}</div> }',
				'export function App() @{\n  <div>\n    {\n      // only\n    }\n  </div>\n}',
			],
			[
				'export function App() @{\n  @if (x) { <div a={// a\n  }>{// b\n  }</div> }\n}',
				'export function App() @{\n  @if (x) {\n    <div\n      a={\n        // a\n      }\n    >\n      {\n        // b\n      }\n    </div>\n  }\n}',
			],
		])('formats the comments alone in the braces of %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'const a = <div>{/* a */}</div>;',
			'const a = <div a={/* a */} />;',
			'export function App() @{\n  <div>{/* a */}</div>\n}',
		])('keeps the block comment alone in the braces of %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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
			// A comment on its own line after the expression moved after the `}`
			// (#517)
			[
				'const x = <div>{...a\n// c\n}</div>;',
				'const x = (\n  <div>\n    {\n      ...a\n      // c\n    }\n  </div>\n);',
			],
			[
				'export function App(props) @{\n  <div>{...props\n  // c\n  }</div>\n}',
				'export function App(props) @{\n  <div>\n    {\n      ...props\n      // c\n    }\n  </div>\n}',
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

		// Like Prettier's `mergeNestledJsdocComments`, two JSDoc comments that
		// touch (`*//**`), each over several lines with every line starting with
		// `*`, are one comment, which prints as written. The second one used to
		// print after a space, or on a line of its own when the parser gave it
		// to the next node (#689).
		it.each([
			[
				'/**\n * @param {A} a\n *//**\n * @param {B} b\n */\nfunction f(a) {}',
				'/**\n * @param {A} a\n *//**\n * @param {B} b\n */\nfunction f(a) {}',
			],
			[
				'function f() {}\n\n/** Trailing nestled comment 1\n *//** Trailing nestled comment 2\n *//** Trailing nestled comment 3\n */',
				'function f() {}\n\n/** Trailing nestled comment 1\n *//** Trailing nestled comment 2\n *//** Trailing nestled comment 3\n */',
			],
			[
				'{{\no={\n  /**\n   * A\n   *//**\n   * B\n   */\n\n}\n}}',
				'{\n  {\n    o = {\n      /**\n       * A\n       *//**\n       * B\n       */\n    };\n  }\n}',
			],
			[
				'class A {\n    /**\n     * x\n     *//**\n     * y\n     */\n  m() {}\n}',
				'class A {\n  /**\n   * x\n   *//**\n   * y\n   */\n  m() {}\n}',
			],
			[
				'f(a, /**\n * x\n *//**\n * y\n */ b);',
				'f(\n  a,\n  /**\n   * x\n   *//**\n   * y\n   */ b,\n);',
			],
			// The parser gives the first one to the node before and the second
			// one to the next node, and the merged one stays with the first
			['a; /**\n * x\n *//**\n * y\n */\nb;', 'a; /**\n * x\n *//**\n * y\n */\nb;'],
			[
				'const o = {\n  a: 1, /**\n   * x\n   *//**\n   * y\n   */\n  b: 2,\n};',
				'const o = {\n  a: 1 /**\n   * x\n   *//**\n   * y\n   */,\n  b: 2,\n};',
			],
			[
				'if (a) {\n  b();\n} /**\n * x\n *//**\n * y\n */\nelse {\n  c();\n}',
				'if (a) {\n  b();\n} /**\n * x\n *//**\n * y\n */\nelse {\n  c();\n}',
			],
			[
				'export function App() @{\n  <div>\n    {/**\n      * x\n      *//**\n      * y\n      */}\n  </div>\n}',
				'export function App() @{\n  <div>\n    {/**\n     * x\n     *//**\n     * y\n     */}\n  </div>\n}',
			],
		])('keeps the touching JSDoc comments of %j together', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A JSDoc cast in either one makes the merged comment a cast, like
		// Prettier's, so the parentheses stay. They used to be dropped when only
		// the first one had `@type`, which TypeScript doesn't read as a cast.
		it.each([
			[
				'x = /**\n * @type {A}\n *//**\n * y\n */ (b);',
				'x =\n  /**\n   * @type {A}\n   *//**\n   * y\n   */ (b);',
			],
			[
				'x = /**\n * y\n *//**\n * @type {A}\n */ (b);',
				'x =\n  /**\n   * y\n   *//**\n   * @type {A}\n   */ (b);',
			],
			[
				'x = /**\n * y\n *//**\n * @type {A}\n */ (b // c\n);',
				'x =\n  /**\n   * y\n   *//**\n   * @type {A}\n   */ (\n    b // c\n  );',
			],
			[
				'foo(/**\n * @type {A}\n *//**\n * @type {B}\n */ (b), c);',
				'foo(\n  /**\n   * @type {A}\n   *//**\n   * @type {B}\n   */ (b),\n  c,\n);',
			],
		])(
			'keeps the cast parentheses after the touching JSDoc comments of %j',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		// Pins: like Prettier, a comment on one line, or one whose lines don't
		// all start with `*`, stays a comment of its own
		it.each([
			['/** a *//**\n * b\n */\nx;', '/** a */ /**\n * b\n */\nx;'],
			['/**\n * a\n *//* b *//**\n * c\n */\nx;', '/**\n * a\n */ /* b */ /**\n * c\n */\nx;'],
			[
				'/**\n * a\n *//*\n b\n*//**\n * c\n */\nx;',
				'/**\n * a\n */ /*\n b\n*/ /**\n * c\n */\nx;',
			],
		])('prints a space between the touching comments of %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// A statement used to take only the first comment after it on its line
		it.each([
			'{\n  a(); /* c */ /* d */\n  b();\n}',
			'const x = 1; /* c */ /* d */\nconst y = 2;',
			'a(); /* c */ // d\nb();',
		])('keeps every comment after %j on its line', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's tie-break, a comment between a tag and its template
		// leads the template, which prints a space before it, or a line break
		// that fits on one line when the comment starts a line. The comment used
		// to trail the tag and print against the backtick (#460).
		it.each([
			['tag/* c */`x`;', 'tag /* c */ `x`;'],
			['tag<T>/* c */`x`;', 'tag<T> /* c */ `x`;'],
			['tag /* c */ /* d */ `x`;', 'tag /* c */ /* d */ `x`;'],
			['tag\n/* c */ `x`;', 'tag\n/* c */ `x`;'],
			// Prettier prints `tag/* c */ \`x\``, and its next pass adds the space
			['const x = tag\n/* c */ `x`;', 'const x = tag /* c */ `x`;'],
			['foo(tag<T>\n/* c */ `x`);', 'foo(tag<T> /* c */ `x`);'],
		])('prints a space before the comment in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Prettier's handlers give a comment before the `(` of a function or
		// method to the name, and its tie-break gives one between two operands to
		// the side the operator doesn't separate it from
		it.each([
			'a /* a */ + /* b */ b;',
			'function f /* c */(a) {}',
			'const o = { m /* c */(a) {} };',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['interface I {\n  m /* c */ (a): void;\n}', 'interface I {\n  m(/* c */ a): void;\n}'],
			['foo /* c */ (a);', 'foo(/* c */ a);'],
			// Prettier's handler for a comment before the `(` covers functions and
			// methods, not declared functions
			['declare function f /* c */ (a): void;', 'declare function f(/* c */ a): void;'],
		])('moves the comment in %j into the parentheses', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
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
			// The parentheses around an arrow function's body print as nothing,
			// or, around an object, before the comment
			['const f = () => (\n  a /* c */\n);', 'const f = () => a; /* c */'],
			['const f = () => (\n  a // c\n);', 'const f = () => a; // c'],
			['x = () => (a.b /* c */);', 'x = () => a.b; /* c */'],
			['const f = () => (a + b /* c */);', 'const f = () => a + b; /* c */'],
			['const f = () => ({ a } /* c */);', 'const f = () => ({ a }); /* c */'],
			['export default () => (\n  call(x) // c\n);', 'export default () => call(x); // c'],
			['const f = (() => (\n  a // c\n));', 'const f = () => a; // c'],
			[
				'function g() {\n  return () => () => (a /* c */);\n}',
				'function g() {\n  return () => () => a; /* c */\n}',
			],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			// An arrow function's body in a call's parentheses keeps its comments
			'f(() => a /* c */);',
			'const f = () => a /* x */ + 1;',
			// A conditional body prints in parentheses that keep the comment
			'const f = () => (a ? b : c /* c */);',
			'const f = () => (\n  <div /> // c\n);',
			'import /* a */ Alias /* b */ = /* c */ Foo /* d */;',
			'if (x) /* c */ ;',
			'class A {\n  a = 1; // c\n  b = 2;\n}',
			'foo(a /* c */);',
			'x = foo(a /* c */);',
			'do x();\nwhile (a /* c */);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's `handleParenthesizedExpressionTrailingComment`, a
		// comment after a sequence or assignment in the parentheses around an
		// arrow function's body, a declarator's value, a `return` argument, or
		// an assignment's right side trails its last expression or right side,
		// inside those parentheses. It used to print after them, and move after
		// the `;` on the next pass (#560). After an expression statement's
		// expression, it trails the statement.
		it.each([
			'const f = () => (a = b /* note */);',
			'const f = () => (a, b /* note */);',
			'const x = (a, b /* note */);',
			'const x = (a = b /* note */);',
			'function f() {\n  return (a, b /* note */);\n}',
			'function f() {\n  return (a = b /* note */);\n}',
			'x = (a, b /* note */);',
			'x = y = (z, w /* note */);',
			'f(() => (a, b /* note */));',
			'const x = (a, b /* note */),\n  y = 1;',
			'for (let i = (a, b /* note */); ;) {}',
			'function f() {\n  return (\n    a,\n    b // note\n  );\n}',
			'f(\n  () => (\n    a,\n    b // note\n  ),\n);',
		])('keeps the comment inside the parentheses of %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		it.each([
			['(a, b /* note */);', '(a, b); /* note */'],
			['(a + b /* note */);', 'a + b; /* note */'],
			['(function () {} /* note */);', '(function () {}); /* note */'],
			['if (a) (b, c /* note */);', 'if (a) (b, c); /* note */'],
			// In an arrow function's body, inside the arrow function's own
			// parentheses
			['(() => (a, b /* note */));', '() => (a, b /* note */);'],
			['(() => a /* note */);', '() => a; /* note */'],
			// Parentheses inside the value keep the comment
			['const v = f((a, b /* note */));', 'const v = f((a, b) /* note */);'],
			['x = (a, (b /* note */));', 'x = (a, b /* note */);'],
			['x = (y = (a, b /* note */));', 'x = y = (a, b /* note */);'],
			[
				'function f() {\n  return (a, b // note\n  );\n}',
				'function f() {\n  return (\n    a,\n    b // note\n  );\n}',
			],
			['f(() => (a, b // note\n));', 'f(\n  () => (\n    a,\n    b // note\n  ),\n);'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Prettier prints these after the parentheses, or, in a chain of
		// assignments, the value without them, and moves the comment after the
		// `;` on the next pass. The formatter prints the fixpoint.
		it.each([
			[
				'function f() {\n  throw (a, b /* note */);\n}',
				'function f() {\n  throw (a, b); /* note */\n}',
			],
			['export default (a, b /* note */);', 'export default (a, b); /* note */'],
			['x = (y = z /* note */);', 'x = y = z; /* note */'],
			// The parentheses around the arrow function's body print as nothing,
			// as they do without the ones around the arrow function (#529), and
			// so do the ones around the expression's right operand
			['(() => (a /* note */));', '() => a; /* note */'],
			['(a + (b /* note */));', 'a + b; /* note */'],
			['((a, b) + (c /* note */));', '(a, b) + c; /* note */'],
			['const x = (a, b // note\n);', 'const x = (a, b); // note'],
			['x = (a, b // note\n);', 'x = (a, b); // note'],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'function f() {\n  return !(a && b /* note */);\n}',
			'function f() {\n  return (a, b); /* note */\n}',
			'function f() {\n  throw (a, b); // note\n}',
			'const x = (a = b); // note',
			'const f = () => (a = b); // note',
			'x = a = b; /* note */',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier prints a comment in the parentheses around the last operand
		// of a statement's binary or logical value after them, where they print
		// as nothing or not, and moves it after the `;` on the next pass. The
		// formatter prints the fixpoint (#622).
		it.each([
			['const x = a || (b /* c */);', 'const x = a || b; /* c */'],
			['x = a + (b /* c */);', 'x = a + b; /* c */'],
			['x = a * (b + c /* c */);', 'x = a * (b + c); /* c */'],
			['x = a || (b && c /* c */);', 'x = a || (b && c); /* c */'],
			['x = a || b && (c /* c */);', 'x = a || (b && c); /* c */'],
			// Prettier takes the comment out of one pair of parentheses a pass
			['x = a * (b + (c /* c */));', 'x = a * (b + c); /* c */'],
			['x = a || (b + (c /* c */));', 'x = a || b + c; /* c */'],
			// After the parentheses of a JSDoc cast, which keep the ones in them
			['x = a || (/** @type {T} */ (b) /* c */);', 'x = a || /** @type {T} */ (b); /* c */'],
			[
				'const x = (/** @type {T} */ (a || b) /* c */);',
				'const x = /** @type {T} */ (a || b); /* c */',
			],
			[
				'x = a || /** @type {T} */ (b && (c /* c */));',
				'x = a || /** @type {T} */ (b && c /* c */);',
			],
			[
				'x = a || /** @type {T} */ (b && (c // c\n));',
				'x =\n  a ||\n  /** @type {T} */ (\n    b && c // c\n  );',
			],
			['x = a || (await b /* c */);', 'x = a || (await b); /* c */'],
			['x = a ?? (b ? c : d /* c */);', 'x = a ?? (b ? c : d); /* c */'],
			['const x = (a || b /* c */);', 'const x = a || b; /* c */'],
			['a || (b /* c */);', 'a || b; /* c */'],
			['export default a || (b /* c */);', 'export default a || b; /* c */'],
			['const f = () => a || (b /* c */);', 'const f = () => a || b; /* c */'],
			['if (a) x = a || (b /* c */);', 'if (a) x = a || b; /* c */'],
			// A line comment, which Prettier's line break after it breaks the
			// operator before
			['const x = a || (b // c\n);', 'const x = a || b; // c'],
			['x = a + (b // c\n);', 'x = a + b; // c'],
			['const x = (a || b // c\n);', 'const x = a || b; // c'],
			['const x = a || (b /* c */ // d\n);', 'const x = a || b; /* c */ // d'],
			// A `return` or `throw` argument that fits
			[
				'function f(c) {\n  return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);\n}',
				'function f(c) {\n  return c === 0x0a /* LF */ || c === 0x0d; /* CR */\n}',
			],
			[
				'function f() {\n  return (a || b /* c */);\n}',
				'function f() {\n  return a || b; /* c */\n}',
			],
			[
				'function f() {\n  throw a || (b /* c */);\n}',
				'function f() {\n  throw a || b; /* c */\n}',
			],
			[
				'function f() {\n  return (a || b /* c */) /* d */;\n}',
				'function f() {\n  return a || b; /* c */ /* d */\n}',
			],
			[
				'function f() {\n  if (x) return a || (b /* c */);\n  else return 1;\n}',
				'function f() {\n  if (x) return a || b; /* c */\n  else return 1;\n}',
			],
			// A line comment breaks the parentheses, outside the argument
			[
				'function f() {\n  return a || (b // c\n  );\n}',
				'function f() {\n  return (\n    a || b // c\n  );\n}',
			],
			[
				'function f() {\n  return a || (b /* c */ // d\n  );\n}',
				'function f() {\n  return (\n    a || b /* c */ // d\n  );\n}',
			],
			// Without a `;`, at the end of the statement, where the `;` goes (#672)
			['const x = a || (b /* c */)\nfoo()', 'const x = a || b; /* c */\nfoo();'],
			['const x = (b /* c */)\nfoo()', 'const x = b; /* c */\nfoo();'],
			['function f() {\n  return (b /* c */)\n}', 'function f() {\n  return b; /* c */\n}'],
			['const x = a || (b // c\n)', 'const x = a || b; // c'],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			// In the parentheses the argument breaks in, like Prettier
			'function is_WS_OR_EOL(c) {\n  return (\n    c === 0x09 /* Tab */ ||\n    c === 0x20 /* Space */ ||\n    c === 0x0a /* LF */ ||\n    c === 0x0d /* CR */\n  );\n}',
			'function f() {\n  return (\n    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||\n    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */\n  ); /* d */\n}',
			// In parentheses that print, around an operand before the last one
			'x = a * (b + c) /* c */ + d;',
			// In a JSDoc cast's parentheses
			'x = a || /** @type {T} */ (b /* c */);',
			'function f() {\n  return /** @type {T} */ (a || b /* c */);\n}',
			'x = a || (b && /** @type {T} */ (c /* c */));',
			'x = a || /** @type {T} */ (b && c /* c */);',
			'x = (a && /** @type {T} */ (b /* c */)) || d;',
			'((a) => /** @type {T} */ (b /* c */))(1);',
			'x = !(a || b /* c */);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier prints the block comments in the parentheses of a
		// declarator's or an assignment's sequence, and breaks them with the
		// line comment after them, which its next pass moves after the `;`.
		// The formatter prints the fixpoint (#624).
		it.each([
			['const x = (a, b /* c */ // d\n);', 'const x = (a, b /* c */); // d'],
			['const x = (a, b /* c */ /* e */ // d\n);', 'const x = (a, b /* c */ /* e */); // d'],
			['x = (a, b /* c */ // d\n);', 'x = (a, b /* c */); // d'],
			['const x = (a, b.c /* c */ // d\n);', 'const x = (a, b.c /* c */); // d'],
		])('formats %j in one pass', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'const x = (a = b /* c */); // d',
			'(a, b); /* c */ // d',
			'const f = () => (\n  a,\n  b /* c */ // d\n);',
			'function f() {\n  return (\n    a,\n    b /* c */ // d\n  );\n}',
		])('keeps %j like Prettier', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier, which measures from the end of the statement, the
		// blank line after a statement stays when the comment that moves after
		// its `;` was written on a line before it. It used to measure from the
		// comment and lose the blank line (#627).
		it.each([
			['let x = 1 // c\n;\n\nb();', 'let x = 1; // c\n\nb();'],
			['(foo() /* c */\n);\n\nb();', 'foo(); /* c */\n\nb();'],
			['({ a } = c /* c */\n);\n\nb();', '({ a } = c); /* c */\n\nb();'],
		])('keeps the blank line after %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A `continue`, `break`, `debugger`, or `return` that is only its keyword
		// holds the comment before its `;` itself. The comment used to lead the
		// next statement (#628).
		it.each([
			['for (;;) continue // comment\n;\nfoo();', 'for (;;) continue; // comment\nfoo();'],
			['while (a) break /* comment */\n;\nfoo();', 'while (a) break; /* comment */\nfoo();'],
			['for (;;) continue // comment\n;\nfoo() // x', 'for (;;) continue; // comment\nfoo(); // x'],
			[
				'for (;;) {\n  continue // comment\n  ;\n  foo();\n}',
				'for (;;) {\n  continue; // comment\n  foo();\n}',
			],
			[
				'function f() {\n  return // c\n  ;\n  foo();\n}',
				'function f() {\n  return; // c\n  foo();\n}',
			],
			['debugger /* c */ /* d */\n;\nfoo();', 'debugger; /* c */ /* d */\nfoo();'],
			['for (;;) continue /* c */;\nfoo();', 'for (;;) continue; /* c */\nfoo();'],
			[
				'switch (a) {\n  case 1:\n    break // c\n    ;\n  case 2:\n}',
				'switch (a) {\n  case 1:\n    break; // c\n  case 2:\n}',
			],
			[
				'while (a) break /* comment */\n  /* d */ ;\nfoo();',
				'while (a) break; /* comment */\n/* d */ foo();',
			],
			['do continue // c\n; while (a);', 'do\n  continue; // c\nwhile (a);'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			['for (;;) continue // comment\n;', 'for (;;) continue; // comment'],
			['a: for (;;) break a // c\n;\nfoo();', 'a: for (;;) break a; // c\nfoo();'],
			['while (a) break\n  /* comment */\n  ;\nfoo();', 'while (a) break;\n/* comment */\nfoo();'],
		])('formats %j like Prettier, as before', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// Like Prettier's `printTrailingComment`, a comment after a line comment
		// goes on a line of its own, even when it shared its line with the
		// `;`, and a block comment after one keeps its place. The line comment
		// used to take in the comment after it, and a block comment moved before
		// it (#670).
		it.each([
			['foo() // a\n; // b\nbar();', 'foo(); // a\n// b\nbar();'],
			[
				'function f() {\n  return x // a\n  ; // b\n}',
				'function f() {\n  return x; // a\n  // b\n}',
			],
			['let x = 1 // a\n; /* b */', 'let x = 1; // a\n/* b */'],
			['for (;;) continue // a\n; // b\nfoo();', 'for (;;) continue; // a\n// b\nfoo();'],
		])('formats %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// A block comment after one on a line of its own followed it on its
		// line, ahead of it, and ended it early, so the output didn't parse.
		// Like Prettier, touching JSDoc comments over several lines are one
		// comment (#689).
		it.each([
			[
				'const o = {\n  a: 1\n  /** b *//**\n  * c\n  */\n};',
				'const o = {\n  a: 1,\n  /** b */ /**\n   * c\n   */\n};',
			],
			['function f() {}\n/** a\n *//** b\n */', 'function f() {}\n/** a\n *//** b\n */'],
			[
				'const o = {\n  a: 1,\n  /** b *//** c */\n};',
				'const o = {\n  a: 1,\n  /** b */ /** c */\n};',
			],
		])('keeps the comments of %j in order', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			['let x = 1 /* a */ // b\n;', 'let x = 1; /* a */ // b'],
			['foo() /* a */ /* b */;', 'foo(); /* a */ /* b */'],
			['foo(); // a\n// b', 'foo(); // a\n// b'],
		])('keeps the comments of %j on their lines like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		// With no line break after the `;` that ends the file, the program ends
		// at the `;`, and the comment was deleted (#488)
		it.each([
			['const x = 1\n// c\n;', 'const x = 1;\n// c'],
			['foo()\n// c\n;', 'foo();\n// c'],
			['const maps = {\n}\n// c\n;', 'const maps = {};\n// c'],
			['const x = 1\n/* c */\n;', 'const x = 1;\n/* c */'],
			['const x = 1\n// prettier-ignore\n;', 'const x = 1;\n// prettier-ignore'],
			['if (a) b()\n// c\n;', 'if (a) b();\n// c'],
			['export default foo\n// c\n;', 'export default foo;\n// c'],
		])('keeps the comment before the ; that ends the file in %j', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
			expect(await format(`${source}\n`)).toBeWithNewline(expected);
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

	// A block comment over several lines ends a `return`, `throw`, or `yield`
	// like a line break does, so, like Prettier's
	// `returnArgumentHasLeadingComment`, an argument that starts with one keeps
	// its parentheses. They used to be dropped, and the function returned
	// `undefined` (#473). Each case also parses the output and checks that the
	// syntax tree is unchanged.
	describe('return, throw, and yield arguments that start with a comment over several lines', () => {
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
			[
				'function g() {\n  return (/* a\n    b */ foo);\n}',
				'function g() {\n  return (\n    /* a\n    b */ foo\n  );\n}',
			],
			[
				'function g() {\n  throw (/* a\n    b */ foo);\n}',
				'function g() {\n  throw (\n    /* a\n    b */ foo\n  );\n}',
			],
			[
				'function h() {\n  return (\n    /**\n     * doc\n     */ "result"\n  );\n}',
				'function h() {\n  return (\n    /**\n     * doc\n     */ "result"\n  );\n}',
			],
			[
				'function g() {\n  return (/* a\n    b */ a ? b : c);\n}',
				'function g() {\n  return (\n    /* a\n    b */ a ? b : c\n  );\n}',
			],
			[
				'function g() {\n  return (/* a\n    b */ a, b);\n}',
				'function g() {\n  return (\n    /* a\n    b */ a, b\n  );\n}',
			],
		])('prints %j like Prettier', async (input, expected) => {
			await expectFormatted(input, expected);
		});

		// Prettier looks only at the argument's own comments, so it drops these
		// parentheses and returns or yields `undefined`
		it.each([
			[
				'function* g() {\n  yield (/* a\n    b */ foo);\n}',
				'function* g() {\n  yield (\n    /* a\n    b */ foo\n  );\n}',
			],
			[
				'function g() {\n  return (/* a\n    b */ foo).bar;\n}',
				'function g() {\n  return (\n    /* a\n    b */ foo.bar\n  );\n}',
			],
			[
				'function g() {\n  return (/* a\n    b */ foo)();\n}',
				'function g() {\n  return (\n    /* a\n    b */ foo()\n  );\n}',
			],
			[
				'function g() {\n  throw (/* a\n    b */ a || b).c;\n}',
				'function g() {\n  throw (\n    /* a\n    b */ (a || b).c\n  );\n}',
			],
		])('keeps the parentheses of %j', async (input, expected) => {
			await expectFormatted(input, expected);
		});

		it.each([
			'function g() {\n  return /* a b */ foo;\n}',
			'function g() {\n  return (\n    /* a\n    b */ foo + bar\n  );\n}',
			'function g() {\n  return (\n    /* a\n    b */ <div />\n  );\n}',
			'function g() {\n  return /** @type {X} */ (\n    /* a\n    b */ foo\n  );\n}',
			'function g() {\n  return (\n    /**\n     * @type {X}\n     */ (foo)\n  );\n}',
			'function* g() {\n  yield* /* a\n    b */ foo;\n}',
			// A function called right away prints the comment inside its parentheses
			'function g() {\n  return (\n    /* a\n    b */ function () {}\n  )();\n}',
			'function* g() {\n  yield (\n    /* a\n    b */ function () {}\n  )();\n}',
		])('keeps %j', async (source) => {
			await expectFormatted(source);
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
			'const f = () => (\n  <Note /> // note\n);',
		])('keeps the trailing comment inside the parentheses in %j', async (source) => {
			await expectFormatted(source);
		});

		// Like Prettier, a comment after an arrow's element body trails it. It
		// used to move out of the arrow, after the statement (#475).
		it.each([
			'const f = () => (\n  <Note />\n  // note\n);',
			'const f = () => (\n  <>\n    <Note />\n  </>\n  /* note */\n);',
			'foo(() => (\n  <Note />\n  // note\n));',
			'function App() {\n  return (\n    <ul>\n      {items.map((item) => (\n        <li>{item}</li>\n        // note\n      ))}\n    </ul>\n  );\n}',
			'function App() {\n  return (\n    <Button\n      onClick={() => (\n        <a />\n        // note\n      )}\n    />\n  );\n}',
			'function C() @{\n  const f = () => (\n    @if (a) {\n      <Note />\n    }\n    // note\n  );\n  <div />\n}',
		])('keeps the comment after the arrow body inside the parentheses in %j', async (source) => {
			await expectFormatted(source);
		});

		// Prettier moves the comment after any other body into the arrow too, but
		// prints the body without the parentheses, so its next pass moves the
		// comment after the statement. It goes there at once.
		it('moves a comment after an arrow body that is not an element after the statement', async () => {
			// The source ends with a line break: without it, the comment is lost
			// (#488)
			await expectFormatted(
				'const f = () => (\n  a\n  // note\n);\n',
				'const f = () => a;\n// note',
			);
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

		// Prettier's `babel` parser keeps a JSDoc cast's parentheses as a
		// `ParenthesizedExpression`, which isn't a parent that prints an element
		// bare, so an element that breaks, or has a comment that breaks the line,
		// prints in parentheses of its own inside the innermost cast's (#476)
		it.each([
			'function g() {\n  return /** @type {X} */ (\n    (\n      // note\n      <Note />\n    )\n  );\n}',
			'const a = /** @type {X} */ (\n  (\n    /* note */\n    <Note />\n  )\n);',
			'const a = /** @type {X} */ (\n  /** @type {Y} */ (\n    (\n      // note\n      <Note />\n    )\n  )\n);',
			'f(\n  /** @type {X} */ (\n    (\n      // note\n      <Note />\n    )\n  ),\n);',
			'const a = (\n  <b\n    x={\n      /** @type {X} */ (\n        (\n          // note\n          <Note />\n        )\n      )\n    }\n  />\n);',
			'function g() {\n  return /** @type {X} */ (\n    (\n      <div>\n        <a />\n        <b />\n      </div>\n    )\n  );\n}',
			'const a = /** @type {X} */ (/* note */ <Note />);',
			'const a = /** @type {X} */ (<Note />);',
			'const a = /** @type {X} */ (\n  (\n    // note\n    <Note />\n  ).props\n);',
			// A comment after the element stays inside the cast's parentheses (#521)
			'function g() {\n  return /** @type {X} */ (<Note /> /* note */);\n}',
			'function g() {\n  return /** @type {X} */ (\n    (\n      <Note /> // note\n    )\n  );\n}',
		])('keeps the element in a cast in %j', async (source) => {
			await expectFormatted(source);
		});

		it.each([
			[
				'function g() {\n  return /** @type {X} */ (\n    // note\n    <Note />\n  );\n}',
				'function g() {\n  return /** @type {X} */ (\n    (\n      // note\n      <Note />\n    )\n  );\n}',
			],
			[
				'const a = /** @type {X} */ (\n  // note\n  <>\n    <a />\n  </>\n);',
				'const a = /** @type {X} */ (\n  (\n    // note\n    <>\n      <a />\n    </>\n  )\n);',
			],
			[
				'function g() {\n  return /** @type {X} */ (<div>\n    <a />\n    <b />\n  </div>);\n}',
				'function g() {\n  return /** @type {X} */ (\n    (\n      <div>\n        <a />\n        <b />\n      </div>\n    )\n  );\n}',
			],
		])('prints the element in a cast in %j like Prettier', async (input, expected) => {
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

		// Like Prettier's `isObjectPropertyWithShortKey`, a key is short by its
		// width, where a CJK character counts twice
		it('measures a short key by its width', async () => {
			const source = `const o = {
  古今: "https://prettier.io/docs/en/rationale.html#what-prettier-is-concerned-about",
  古体诗:
    "https://prettier.io/docs/en/rationale.html#what-prettier-is-concerned-about",
};`;
			expect(await format(source)).toBeWithNewline(source);
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

		// Prettier's `babel` parser keeps a JSDoc cast's parentheses as a node of
		// their own, so a conditional whose test is a cast binary or logical
		// expression stays after the operator and breaks inside the cast's
		// parentheses (#582)
		it.each([
			[
				'const fooooba3 = /** @type {Array.<fooo.barr.baaaaaaz>} */ (fooobaarbazzItems || foo) ? foo : bar;',
				'const fooooba3 = /** @type {Array.<fooo.barr.baaaaaaz>} */ (\n  fooobaarbazzItems || foo\n)\n  ? foo\n  : bar;',
			],
			[
				'fooooba3 = /** @type {Array.<fooo.barr.baaaaaaz>} */ (fooobaarbazzItems + fooo) ? foo : bar;',
				'fooooba3 = /** @type {Array.<fooo.barr.baaaaaaz>} */ (fooobaarbazzItems + fooo)\n  ? foo\n  : bar;',
			],
			[
				'const o = { fooooba3: /** @type {Array.<fooo.barr.baaaaaaz>} */ (fooobaarbazzItems || foo) ? foo : bar };',
				'const o = {\n  fooooba3: /** @type {Array.<fooo.barr.baaaaaaz>} */ (fooobaarbazzItems || foo)\n    ? foo\n    : bar,\n};',
			],
		])(
			'keeps a conditional with a JSDoc-cast test after the operator in %j',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		it.each([
			'const fooooba3 =\n  /** @type {Array.<fooo.barr.baaaaaaz>} */ (fooobaarbazzItems) || foo\n    ? foo\n    : bar;',
			'const fooooba3 =\n  fooobaarbazzItemsssssssssssssssssssssssssssssssss || fooooooooooooo\n    ? foo\n    : bar;',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier's `break-after-operator` layout, a block comment that
		// ends the line after the operator stays there only when the value fits
		// after it, and otherwise moves below the operator with the value (#581)
		it.each([
			[
				'const test = /* some comment here */\n  goog.partial(NewThing.onTemplateChange, rationaleField, typeField);',
				'const test =\n  /* some comment here */\n  goog.partial(NewThing.onTemplateChange, rationaleField, typeField);',
			],
			[
				'const cast = /** @type {X} */\n  (goog.partial(NewThing.onTemplateChange, rationaleField, typeFieldd));',
				'const cast =\n  /** @type {X} */\n  (goog.partial(NewThing.onTemplateChange, rationaleField, typeFieldd));',
			],
			[
				'test = /* some comment here */\n  someCondition ? someValueeeeeeeeeeeeeeeeeee : someOtherValueeeeeeeeeeeeeeeeeeeeee;',
				'test =\n  /* some comment here */\n  someCondition\n    ? someValueeeeeeeeeeeeeeeeeee\n    : someOtherValueeeeeeeeeeeeeeeeeeeeee;',
			],
			[
				'type A = /* some comment here */\n  Foooooooooooooooooooooooooo<Barrrrrrrrrrrrrrrrr, Bazzzzzzzzzzzzzzzzzzzz>;',
				'type A =\n  /* some comment here */\n  Foooooooooooooooooooooooooo<Barrrrrrrrrrrrrrrrr, Bazzzzzzzzzzzzzzzzzzzz>;',
			],
			['const foo = /** @type {string} */\n  (bar);', 'const foo = /** @type {string} */ (bar);'],
			[
				'const test = /* some comment here */\n  goog;',
				'const test = /* some comment here */ goog;',
			],
		])(
			'breaks after the operator before a block comment that ends its line in %j',
			async (input, expected) => {
				expect(await format(input)).toBeWithNewline(expected);
			},
		);

		// In an assignment chain, Prettier prints the comment and the value in the
		// chain's own layout. The comment used to stay on the `=` line, where a
		// value that fits joined it and moved below the `=` on the next format
		// (#591). A line comment there trails the left side in Prettier, so it
		// stays on the line.
		it.each([
			[
				'a = b = c = /* note */\n  compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);',
				'a =\n  b =\n  c =\n    /* note */\n    compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);',
			],
			[
				'a = b = /* note */\n  c = compute(aaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccc);',
				'a =\n  b =\n  /* note */\n  c =\n    compute(aaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccc);',
			],
			[
				'a = b = c = // note\n  compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);',
				'a =\n  b =\n  c = // note\n    compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);',
			],
			['a = b = c = /* note */\n  goog;', 'a = b = c = /* note */ goog;'],
		])('prints a comment after the = of a chain link in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps a type cast comment on the = line', async () => {
			await expect(format('const value = /** @type {Entry} */ (cache.entry);')).resolves.toBe(
				'const value = /** @type {Entry} */ (cache.entry);\n',
			);
		});

		// A `prettier-ignore` inside a JSDoc cast's parentheses doesn't start the
		// value, which Prettier's `babel` parser keeps as the cast's
		// `ParenthesizedExpression`, so an ignored element stays after the `=`
		// like any other ignored value (#522)
		it.each([
			'const a = /** @type {X} */ (\n  // prettier-ignore\n  <Note   />\n);',
			'a = /** @type {X} */ (\n  // prettier-ignore\n  <Note   />\n);',
			'x = {\n  k: /** @type {X} */ (\n    // prettier-ignore\n    <Note   />\n  ),\n};',
			'class A {\n  k = /** @type {X} */ (\n    // prettier-ignore\n    <Note   />\n  );\n}',
			'const a = /** @type {X} */ (\n  // prettier-ignore\n  foo(  a  )\n);',
			'const a = /** @type {X} */ (\n  (\n    // c\n    <Note />\n  )\n);',
			'const a =\n  // prettier-ignore\n  /** @type {X} */ (<Note   />);',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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
		// argument's parentheses itself must still print them. Like Prettier's
		// `babel` output, a superclass needs no others around them.
		it('keeps a type cast inside parentheses that return or throw add, and a superclass cast in its own', async () => {
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
class Store extends /** @type {Base} */ (new Base()) {}`;
			const result = await format(input);
			expect(result).toBeWithNewline(expected);
		});

		// Like Prettier's `handleAssignmentPatternComments`, an own-line comment
		// in a default value moves before the parameter or property. It used to
		// stay after the `=`, with the value on the next line (#474).
		it('moves an own-line comment in a default value before the parameter or property', async () => {
			const input = `function f(
  a = (
    // c
    1
  ),
) {}
function g(
  a
  // c
  = 1,
) {}
const {
  a = (
    // c
    1
  ),
  b,
} = x;
const [
  c = (
    // c
    1
  ),
] = x;`;
			const expected = `function f(
  // c
  a = 1,
) {}
function g(
  // c
  a = 1,
) {}
const {
  // c
  a = 1,
  b,
} = x;
const [
  // c
  c = 1,
] = x;`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Prettier prints the comment after the modifier (`private // c`), which
		// no longer parses as the same parameter
		it('moves an own-line comment in the default value of a parameter property before it', async () => {
			const input = `class A {
  constructor(
    private a = (
      // c
      1
    ),
  ) {}
}`;
			const expected = `class A {
  constructor(
    // c
    private a = 1,
  ) {}
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Like Prettier's default for a comment at the end of a line, it trails
		// the parameter before the `=`, and prints after the value
		it('keeps a comment at the end of the line after the = of a default value on that line', async () => {
			const input = 'function f(\n  a = // c\n  1,\n) {}';
			expect(await format(input)).toBeWithNewline('function f(\n  a = 1, // c\n) {}');
		});

		it.each(['function f(a = /* c */ 1, b /* c */ = 2) {}', 'function f(\n  // c\n  a = 1,\n) {}'])(
			'keeps %j',
			async (source) => {
				expect(await format(source)).toBeWithNewline(source);
			},
		);

		// Like Prettier's `handleAssignmentLikeComments`, a comment that ends its
		// line before the value of a type alias, or before an object, array,
		// template, or type literal value of a declaration or assignment, leads
		// the value, which moves below the `=` with it. A line comment there
		// used to stay on the `=` line (#598).
		it.each([
			['type A = // Comment\n  B | C;', 'type A =\n  // Comment\n  B | C;'],
			['const a = // Comment\n  { a: 1 };', 'const a =\n  // Comment\n  { a: 1 };'],
			['b = // Comment\n  [1, 2];', 'b =\n  // Comment\n  [1, 2];'],
			['a.b += // c\n  `x`;', 'a.b +=\n  // c\n  `x`;'],
			['const t = // c\n  tag`x`;', 'const t =\n  // c\n  tag`x`;'],
			['let c: T = // c\n  { a: 1 };', 'let c: T =\n  // c\n  { a: 1 };'],
			['type D<T> = // c\n  { a: T };', 'type D<T> =\n  // c\n  { a: T };'],
			['const e = /* a */ // b\n  { a: 1 };', 'const e =\n  /* a */ // b\n  { a: 1 };'],
			['type F = /* a */ // b\n  B | C;', 'type F =\n  /* a */ // b\n  B | C;'],
			// Before the `=` too. Prettier's first format of the type aliases
			// leaves the comment after the `=`, and its next format moves it below.
			['let obj // Comment\n= { a: 1 };', 'let obj =\n  // Comment\n  { a: 1 };'],
			['x // c\n= [1];', 'x =\n  // c\n  [1];'],
			['type G // Comment\n= B;', 'type G =\n  // Comment\n  B;'],
			['type H // c\n  <T> = T;', 'type H<T> =\n  // c\n  T;'],
		])('moves a comment at the end of the = line below it in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Like Prettier, a JSDoc cast value isn't an object for this: its
		// parentheses are a node of their own in Prettier's `babel` parser
		it.each([
			'const a = // c\n  /** @type {X} */ ({});',
			'x = // c\n  /** @type {X} */ ([]);',
			'type A = /* c */ B;',
			'let obj =\n  // c\n  { a: 1 };',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Prettier's default gives a line comment at the end of the `=` line
		// before any other value to the left side, which prints it at the end of
		// the statement when the value stays on the `=` line. A block comment
		// there leads the value, so it prints after a line comment beside it.
		// Both used to lead the value in their written order and stay on the
		// `=` line (#593).
		it.each([
			['const a = // Comment\n  b || c;', 'const a = b || c; // Comment'],
			['const a = // c\n  "str";', 'const a = "str"; // c'],
			['a = // c\n  b || c;', 'a = b || c; // c'],
			['const test = /* a */ // b\n  value;', 'const test = // b\n  /* a */ value;'],
			['let a: number = // c\n  1, b = 2;', 'let a: number = 1, // c\n  b = 2;'],
			['const h = // c\n  class {};', 'const h = class {}; // c'],
		])('trails the left side with a line comment after the = in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		it.each([
			'const f = // c\n  () => {};',
			'const g = // c\n  function () {};',
			'const n = // c\n  new Foo(a);',
			'let obj = // c\n  foo();',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's `handlePropertyComments`, a comment at the end of a
		// line inside an object property leads the property, and like its
		// default, one after a class field's `=` trails the key. Both used to
		// lead the value (#593).
		it('moves a comment at the end of the line after a key before the key or the =', async () => {
			const input = `const o = {
  key: /* note */
    compute(aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccc),
  other: // note
    value,
  [computed]: // note
    { a: 1 },
  cast: // note
    /** @type {X} */ (b),
};
const { a: // c
  b = 1 } = x;
class A {
  field = /* note */
    value;
  f2 = /* note */ // n2
    value;
  f3 = // note
    b || c;
  static readonly f4 = // note
    1;
}`;
			const expected = `const o = {
  /* note */
  key: compute(
    aaaaaaaaaaaaaaaaaaaaaaaaa,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
    ccccccccccccc,
  ),
  // note
  other: value,
  // note
  [computed]: { a: 1 },
  // note
  cast: /** @type {X} */ (b),
};
const {
  // c
  a: b = 1,
} = x;
class A {
  field /* note */ = value;
  f2 /* note */ = // n2
    value;
  f3 = b || c; // note
  static readonly f4 = 1; // note
}`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps the comments in object properties and class fields that Prettier keeps', async () => {
			const source = `const o = {
  k: /* c */ v,
  k2 /* c */: v,
  k3:
    // c
    v,
  m() {}, // c
};
class A {
  field = // note
    value;
  f2 = // note
    { a: 1 };
  f3 =
    // note
    value;
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's output for the same TSX, an element after a line
		// comment at the end of the `=` line prints below it, in parentheses
		// when it breaks. The comment used to move into the parentheses.
		it('keeps a line comment on the = line before an element', async () => {
			const source = `function App() {
  const el = // c
    (
      <div>
        <span />
      </div>
    );
  const e2 = // c
    <div />;
  return el;
}`;
			expect(await format(source)).toBeWithNewline(source);
		});

		// Like Prettier's `printCallee`, the line ends after a callee or its type
		// arguments with a line comment. The comment used to move after the
		// arguments (#658).
		it.each([
			'foo // c\n(a);',
			'const x = require // c\n("x");',
			'new Foo<T> // c\n(a);',
			'foo<T> // c\n(a);',
			'export default foo // c\n(a);',
			'const x =\n  foo<T> // c\n  (a);',
		])('keeps the line comment after the callee in %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

		// Like Prettier, the module name of a `require(…)` lays out like a call
		// argument. A comment on its own line used to stay after the `(`, with
		// the name unindented, and a line comment after the name moved past the
		// `;` (#659).
		it('breaks the parentheses of a require around a comment like call arguments', async () => {
			const input = `import A = require(
  /* c */
  "a");
import B = require(
  "b" // c
);`;
			const expected = `import A = require(
  /* c */
  "a"
);
import B = require(
  "b" // c
);`;
			expect(await format(input)).toBeWithNewline(expected);
			await expectUnchanged(
				'import C = require("./long/long/long/long/long/long/long/long/long/long/long/path/to/module");',
			);
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

		// Like Prettier, an import attribute prints as an assignment, so a
		// comment on its own line before the value moves below the `:` with the
		// value, and one at the end of the line after the `:` trails the key.
		// The first used to move to the key's line, with the value unindented,
		// and the second to stay there (#604).
		it('moves the comments between an import attribute key and its value like Prettier', async () => {
			const input = `import a from "./a.json" with {
  type:
  // comment
  "json"
};
import b from "./b.json" with {
  type:
  /* comment */
  "json"
};
import c from "./c.json" with {
  type: // comment
  "json"
};
import d from "./d.json" with {
  type: /* comment */
  "json"
};`;
			const expected = `import a from "./a.json" with {
  type:
    // comment
    "json",
};
import b from "./b.json" with {
  type:
    /* comment */
    "json",
};
import c from "./c.json" with {
  type: "json", // comment
};
import d from "./d.json" with {
  type /* comment */: "json",
};`;
			expect(await format(input)).toBeWithNewline(expected);
		});

		it('keeps a comment between an import attribute key and its value on their line', async () => {
			await expectUnchanged(`import a from "./a.json" with { type: /* c */ "json" };
import b from "./b.json" with { type /* c */: "json" };`);
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
			'x = (a /* c */, b);',
			'x = (a, /* c */ b);',
			'const { a /* c */ = 1 } = x;',
			'function f({ a /* c */ = 1 }) {}',
		])('keeps %s', async (source) => {
			const result = await format(source);
			expect(result).toBeWithNewline(source);
		});

		// A JSDoc cast after a comma leads the element it casts, even when its
		// parentheses break. It used to trail the element before the comma, which
		// dropped the parentheses and the cast (#579).
		it.each([
			['x = [1, /** @type {X} */ (\n  foo\n)];', 'x = [1, /** @type {X} */ (foo)];'],
			['f(a, /** @type {X} */ (\n  foo\n));', 'f(a, /** @type {X} */ (foo));'],
			['new F(a, /** @type {X} */ (\n  foo\n));', 'new F(a, /** @type {X} */ (foo));'],
			[
				'x = [1, /** @type {X} */ (\n  // c\n  foo\n)];',
				'x = [\n  1,\n  /** @type {X} */ (\n    // c\n    foo\n  ),\n];',
			],
			[
				'f(1, /** @type {X} */ (\n  // c\n  foo\n));',
				'f(\n  1,\n  /** @type {X} */ (\n    // c\n    foo\n  ),\n);',
			],
			// Pins
			[
				'x = [1 /* a */, /** @type {X} */ (\n  foo\n)];',
				'x = [1 /* a */, /** @type {X} */ (foo)];',
			],
			['x = [1, /** not a cast */ (\n  foo\n)];', 'x = [1, /** not a cast */ foo];'],
		])('keeps the cast after the comma in %j', async (input, expected) => {
			expect(await format(input)).toBeWithNewline(expected);
		});

		// Like Prettier's tie-break, a comment after the comma trails the default
		// import when the `{` of the named ones sits between it and the next
		// specifier. It used to move into the braces (#460).
		it('keeps a comment before the { of the named imports with the default import', async () => {
			const result = await format('import d, /* c */ { a } from "mod";');
			expect(result).toBeWithNewline('import d /* c */, { a } from "mod";');
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

		// Prettier's `shouldWrapFunctionForExportDefault`: after `export default`,
		// a function or class would start a declaration, so an expression that
		// starts with one prints in parentheses
		it('wraps the whole expression that starts with a function or class', async () => {
			const input = `export default (class {}).getInstance();
export default (function () {}).toString();
export default (function log() {}) as typeof console.log;
export default (class {})[1] = 1;
export default (async function () {}) ? a : b;
export default (function () {}).call(thisIsAVeryLongArgumentNameNumberOne, thisIsAVeryLongArgumentNameNumberTwo);`;

			expect(await format(input)).toBeWithNewline(`export default (class {}.getInstance());
export default (function () {}.toString());
export default (function log() {} as typeof console.log);
export default (class {}[1] = 1);
export default (async function () {} ? a : b);
export default (function () {}.call(
  thisIsAVeryLongArgumentNameNumberOne,
  thisIsAVeryLongArgumentNameNumberTwo,
));`);
		});

		it.each([
			'export default (function foo() {})();',
			'export default (function templ() {})`foo`;',
			'export default (function () {} + foo)``;',
			'export default new (class {})();',
			'export default (function () {}, b);',
			// `(class {}<T>)` doesn't parse
			'export default (class {})<string>;',
		])('keeps the parentheses of a function or class that prints its own: %s', async (source) => {
			await expectUnchanged(source);
		});

		// Prettier prints the comments inside the parentheses, and moves them out
		// on its next pass
		it('prints the comments of the function or class ahead of the parentheses', async () => {
			const input = `export default (/* a */ class {}).x;
export default (
  // b
  function () {}
).call(x);
export default (/* c */ (class {}).x).y;
export default (/* d */ (function () {}).call(x)).y();`;

			expect(await format(input)).toBeWithNewline(`export default /* a */ (class {}.x);
export default // b
(function () {}.call(x));
export default /* c */ (class {}.x.y);
export default /* d */ (function () {}.call(x).y());`);
		});

		// A JSDoc cast's comment stays right before its parenthesis
		it('keeps the comments of the function or class inside the parentheses of a cast', async () => {
			const input = `export default /** @type {X} */ ((/* a */ class {}).x);`;

			expect(await format(input)).toBeWithNewline(
				`export default /** @type {X} */ (/* a */ class {}.x);`,
			);
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

		// Like Prettier's `printDecorators`, a parameter's decorators group with
		// the parameter: a line break written after one of them stays, and the
		// parameter starts a new line when they break or don't fit (#534)
		it.each([
			[
				'class A {\n  m(@inject({ aaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbb: 2, cccccccccccccc: 3 }) bar: IBar) {}\n}',
				'class A {\n  m(\n    @inject({\n      aaaaaaaaaaaaaaaaaaa: 1,\n      bbbbbbbbbbbbbbbbbbbbbb: 2,\n      cccccccccccccc: 3,\n    })\n    bar: IBar,\n  ) {}\n}',
			],
			[
				'class A {\n  constructor(@Inject(forwardRef(() => SomeVeryLongServiceNameHereToForceBreak)) private readonly service: SomeService) {}\n}',
				'class A {\n  constructor(\n    @Inject(forwardRef(() => SomeVeryLongServiceNameHereToForceBreak))\n    private readonly service: SomeService,\n  ) {}\n}',
			],
			['class A {\n  m(@a\n    @b x) {}\n}', 'class A {\n  m(\n    @a\n    @b\n    x,\n  ) {}\n}'],
			[
				'class A {\n  m(@a\n  x: T, y) {}\n}',
				'class A {\n  m(\n    @a\n    x: T,\n    y,\n  ) {}\n}',
			],
			[
				'class A {\n  m(@a() { bbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccccccccccccccc, ddddddddddddddddddd }: T) {}\n}',
				'class A {\n  m(\n    @a()\n    {\n      bbbbbbbbbbbbbbbbbbbbbbbbbbbbb,\n      ccccccccccccccccccccccccccccc,\n      ddddddddddddddddddd,\n    }: T,\n  ) {}\n}',
			],
		])('breaks the parameter decorators of %j like Prettier', async (source, expected) => {
			expect(await format(source)).toBeWithNewline(expected);
		});

		it.each([
			'class A {\n  constructor(\n    @inject(Bar)\n    private readonly bar: IBar,\n  ) {}\n}',
			'class Foo {\n  constructor(\n    @inject(Bar)\n    private readonly bar: IBar,\n\n    @inject(MyProcessor)\n    private readonly myProcessor: IMyProcessor,\n  ) {}\n}',
			'class A {\n  m(\n    @a\n    @b()\n    x: T,\n  ) {}\n}',
			'class A {\n  m(@a @b x, @c y) {}\n}',
			'class A {\n  m(@a({ b: 1 }) { c }: T) {}\n}',
		])('keeps the parameter decorators of %j', async (source) => {
			await expectUnchanged(source);
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

		// Prettier prints an `import()` with `printCallArguments`: its source and
		// options break like call arguments, with no trailing comma, and a lone
		// string source stays on the line (#553)
		it('breaks between the source and options of an import() like call arguments', async () => {
			const input = `await import("./long/long/long/long/long/long/long/long/long/path/to/module.js", options);
const m = import.defer("./long/long/long/long/long/long/long/long/long/path/to/module.js", options);
const n = import(/* webpackChunkName: "fooooooooooooooooooooo" */ "./long/long/long/path.js");
const o = import(someVeryLongVariableNameeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
const p = import(
  // comment
  "./foo"
);`;
			const expected = `await import(
  "./long/long/long/long/long/long/long/long/long/path/to/module.js",
  options
);
const m = import.defer(
  "./long/long/long/long/long/long/long/long/long/path/to/module.js",
  options
);
const n = import(
  /* webpackChunkName: "fooooooooooooooooooooo" */ "./long/long/long/path.js"
);
const o = import(
  someVeryLongVariableNameeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
);
const p = import(
  // comment
  "./foo"
);`;
			expect(await format(input)).toBeWithNewline(expected);
			expect(await format(input, { trailingComma: 'all' })).toBeWithNewline(expected);
		});

		it('breaks an import() with a long source and import attributes like Prettier', async () => {
			const input = `const data = import("./long/long/long/long/long/long/long/long/long/path/to/data.json", { with: { type: "json" } });`;
			const expected = `const data = import(
  "./long/long/long/long/long/long/long/long/long/path/to/data.json",
  { with: { type: "json" } }
);`;
			expect(await format(input, { trailingComma: 'all' })).toBeWithNewline(expected);
		});

		it.each([
			'const data = import("./data.json", { with: { type: "json" } });',
			'const data = import("./data.json", {\n  with: { type: "json", integrity: "sha384-abcdefghijk" },\n});',
			'const m =\n  import("./long/long/long/long/long/long/long/long/long/long/long/long/path.js");',
			'const m = import(/* webpackChunkName: "foo" */ "./foo");',
		])('keeps %j', async (source) => {
			expect(await format(source)).toBeWithNewline(source);
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

	// `abstract` before a line break after `export default` is the exported
	// value, and the class on the next line a declaration of its own (#608).
	describe('`abstract` before a line break after `export default`', () => {
		it.each([
			['export default abstract\nclass A {}', 'export default abstract;\nclass A {}\n'],
			[
				'declare module "m" {\n  export default abstract\n  class A {}\n}',
				'declare module "m" {\n  export default abstract;\n  class A {}\n}\n',
			],
		])('formats %j like Prettier', async (input, expected) => {
			const output = await format(input);
			expect(output).toBe(expected);
			expect(output).toBe(await prettier.format(input, { parser: 'typescript' }));
			expect(await format(output)).toBe(output);
		});

		// #651: `abstract` before a function or variable used to be left out.
		it.each(['export abstract function f() {}', 'export abstract const x = 1;'])(
			'refuses %j',
			async (input) => {
				await expect(format(input)).rejects.toThrow(
					"'abstract' modifier can only appear on a class, method, or property declaration.",
				);
			},
		);
	});

	// Declarations that TypeScript reads and the parser failed on: `abstract
	// declare class` (#697), `export default interface` with the name on the
	// next line (#698), and a type alias named `as` or `satisfies` (#699).
	describe('declarations after TypeScript keywords', () => {
		it.each([
			['abstract declare class A {}', 'declare abstract class A {}\n'],
			['export abstract declare class A {}', 'export declare abstract class A {}\n'],
			[
				`export default interface
I {}`,
				'export default interface I {}\n',
			],
			['type as = 1;', 'type as = 1;\n'],
			['type satisfies<T> = T;', 'type satisfies<T> = T;\n'],
		])('formats %j like Prettier', async (input, expected) => {
			const output = await format(input);
			expect(output).toBe(expected);
			expect(output).toBe(await prettier.format(input, { parser: 'typescript' }));
		});

		// #697: `abstract` before an interface was left out. A global augmentation
		// after `export` (#700) is an error that TypeScript reports from its
		// checker, which a strict parse throws.
		it.each([
			[
				'export abstract interface I {}',
				"'abstract' modifier can only appear on a class, method, or property declaration.",
			],
			[
				'abstract function f() {}',
				"'abstract' modifier can only appear on a class, method, or property declaration.",
			],
			[
				'export global {}',
				"'export' modifier cannot be applied to ambient modules and module augmentations since they are always visible.",
			],
		])('refuses %j', async (input, message) => {
			await expect(format(input)).rejects.toThrow(message);
		});
	});

	// Type arguments on the line after a superclass (#545), right after a class
	// or function expression (#578), and a `const` type parameter on an object
	// method (#631) failed to parse; the output of the first two failed on the
	// next pass. They print as Prettier's `typescript` parser prints them.
	describe('text keeps its characters as written', () => {
		// A `>` in an element in a container dropped the text before it, or
		// failed after a child container (#694). In an element in a spread
		// argument or an unbraced attribute value in a container, character
		// references were printed decoded: `&#123;x&#125;` became `{x}` (#693).
		// Since #656 those are template text; only an element in a dynamic tag
		// name is read that way. A text prints from its `raw`, the text as
		// written.
		it.each([
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
			expect(await format(source)).toBe(source);
		});
	});

	describe('type arguments and parameters the parser used to reject', () => {
		it.each([
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
			const output = await format(input);
			expect(output).toBe(expected);
			expect(output).toBe(await prettier.format(input, { parser: 'typescript' }));
			expect(await format(output)).toBe(output);
		});
	});
});
