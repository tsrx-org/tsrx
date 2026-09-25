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
  return <{Child} {...props} class="card">
    <span>Hello</span>
  </{Child}>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats dynamic element tag expressions', async () => {
		const input = `function App(){return <><{registry.item}/><{items[0]}/><{'section'}/><{\`article\`}/></>;}`;
		const expected = `function App() {
  return <>
    <{registry.item} />
    <{items[0]} />
    <{"section"} />
    <{\`article\`} />
  </>;
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
  return <>@{
    const items = [1, 2, 3];
    @for (const item of items; index i; key item) {
      <div>
        {i}
        {item}
      </div>
    }
  }</>;
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
  return <>@{
    let items = new ReactiveSet([1, 2, 3]);
    const hasValue = track(() => items.has(2));
    <>
      <button onClick={() => items.delete(2)}>{"delete"}</button>
      <pre>{hasValue.value}</pre>
    </>
  }</>;
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
  return <>@{
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
  }</>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats template for-of expressions without adding a semicolon before of', async () => {
		const input = `const App=()=> <><ul>@for (const item of items) {<li>{item.label}</li>}</ul></>;`;
		const expected = `const App = () => <>
  <ul>
    @for (const item of items) {
      <li>{item.label}</li>
    }
  </ul>
</>;`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats line comments before template children', async () => {
		const input = `const App=()=> <>
// keep the status visible
<span>Ready</span>
</>;`;
		const expected = `const App = () => <>
  // keep the status visible
  <span>Ready</span>
</>;`;

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
		const expected = `const App = () => <>
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
</>;`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('preserves fragment shorthand for simple returned TSRX expressions', async () => {
		const input = `const App=()=> <><span>{"Ready"}</span></>;`;
		const expected = `const App = () => <><span>{"Ready"}</span></>;`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps native fragments expression based', async () => {
		const input = `function App(){return <><div>Hello world</div>{value}</>}`;
		const expected = `function App() {
  return <>
    <div>Hello world</div>
    {value}
  </>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats style tags inside returned TSRX', async () => {
		const input = `export default function App(){return <><style>div{color:red}</style></>}`;
		const expected = `export default function App() {
  return <>
    <style>
      div {
        color: red;
      }
    </style>
  </>;
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
  return <div>
    <p>Count: {count}</p>
    <p>Count: {count}</p>
    <button onClick={() => count++}>Increment</button>
  </div>;
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
		const expected = `export function App() @{
  <h2
    firstLongAttributeName={firstLongAttributeValue}
    secondLongAttributeName={secondLongAttributeValue}
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
  return <div>
    <p class="status">Visible: {String(visible)}</p>
    <p>{name} is visible</p>
    <p>Hello {name}!</p>
  </div>;
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
  return <a href={x}>
    {state.owner}/{state.repoName}
    <ExternalLink className="w-3 h-3" />
  </a>;
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
  return <div>
    {a}some words here{b}
    <Foo />
  </div>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('keeps whitespace-separated and directly adjacent expressions on their own lines', async () => {
		const input = `function Test() {
  return <div>
    {a} / {b}
    {c}{d}
    <Foo />
  </div>;
}`;
		const expected = `function Test() {
  return <div>
    {a}
    /
    {b}
    {c}
    {d}
    <Foo />
  </div>;
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
  return <>
    {state.owner}/{state.repoName}
    <Foo />
  </>;
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
  return <div>
    <p class="status">
      Visible:
      {String(visible)}
    </p>
    <p>
      {name}
      is visible
    </p>
    <p>Hello {name}!</p>
  </div>;
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
  return <div>
    <p>
      "Count: "
      {count}
    </p>
  </div>;
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
  return <div>
    {(child("value") as any)!}
    {(child("ok") satisfies any)!}
  </div>;
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
		expect(result).toBeWithNewline(`function App() {
  return <><div /></>;
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
  return <div>@{
    const x = 1;
    <span>{x}</span>
  }</div>;
}`;

		const result = await format(input);
		expect(result).toBeWithNewline(expected);
	});

	it('formats a code-only `@{ }` block', async () => {
		const input = `function App(){return <div>@{let count=track(0);effect(()=>log(count));}</div>}`;
		const expected = `function App() {
  return <div>@{
    let count = track(0);
    effect(() => log(count));
  }</div>;
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
		const expected = `const App = () => <div>
  @if (ready) {
    <span>Ready</span>
  } @else {
    <span>Waiting</span>
  }
</div>;`;

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
  const content = <>@{
    const label = 'Hi';
    <>
      <div>Hello {label}</div>
      {content}
    </>
  }</>;
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('should format direct @{} assignment formatting with fragments', async () => {
		const input = `function App(){const content=@{const label="Hi";<><div>Hello {label}</div>{content}</>};}`;
		const expected = `function App() {
  const content = @{
    const label = 'Hi';
    <>
      <div>Hello {label}</div>
      {content}
    </>
  };
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('should format direct @if assignment formatting with fragments', async () => {
		const input = `function App(){const content=@if(a>b){const label="Hi";<><div>Hello {label}</div>{content}</>};}`;
		const expected = `function App() {
  const content = @if (a > b) {
    const label = 'Hi';
    <>
      <div>Hello {label}</div>
      {content}
    </>
  };
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
  return <>
    <div>Hello</div>
    <div>{p1}</div>
    <div>{p2}</div>
  </>;
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
  return <>@{
    let count = 0;
    // comment
    <>
      <div>{'Hello'}</div>
      <div>@{
        let two = 2;
        <>
          {'Hello'}
        </>
      }</div>
    </>
  }</>;
}`;
		const result = await format(input, { singleQuote: true });
		expect(result).toBeWithNewline(expected);
	});

	it('keeps fitting tsrx arrow returns inline in declarations and attributes', async () => {
		const input = `function Test(props){const func=(item)=><><Item {item}/></>;<List renderItem={(item)=><><Item {item}/></>} />}`;
		const expected = `function Test(props) {
  const func = (item) => <><Item {item} /></>;
  <List renderItem={(item) => <><Item {item} /></>} />
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
  const func = (item) =>
    <><ItemView {item} onSelect={props.onSelect} /></>;
  <List
    items={props.items}
    renderItem={(item) =>
      <><ItemView {item} onSelect={props.onSelect} /></>}
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
  const func = (item) => <><ItemView {item} onSelect={props.onSelect} /></>;
  <List
    items={props.items}
    renderItem={(item) => <><ItemView {item} onSelect={props.onSelect} /></>}
  />
}`;
		const result = await format(input, { singleQuote: true, printWidth: 80 });
		expect(result).toBeWithNewline(expected);
	});

	it('keeps fitting single-child fragments inline and expands non-fitting single-child fragments', async () => {
		const input = `function Test(){const short=<><span>Ready</span></>;const long=<><ReallyLongComponentName first={alpha} second={beta} third={gamma}/></>;}`;
		const expected = `function Test() {
  const short = <><span>Ready</span></>;
  const long = <>
    <ReallyLongComponentName
      first={alpha}
      second={beta}
      third={gamma}
    />
  </>;
}`;

		const result = await format(input, { printWidth: 60 });
		expect(result).toBeWithNewline(expected);
	});

	it('expands multi-child fragments while keeping fitting openers on the first line', async () => {
		const input = `function Test(){const short=<><div>A</div><div>B</div></>;const thisNameIsRidiculouslyLongEnoughToMissThePrintWidth=<><div>A</div><div>B</div></>;}`;
		const expected = `function Test() {
  const short = <>
    <div>A</div>
    <div>B</div>
  </>;
  const thisNameIsRidiculouslyLongEnoughToMissThePrintWidth =
    <>
      <div>A</div>
      <div>B</div>
    </>;
}`;

		const result = await format(input, { printWidth: 60 });
		expect(result).toBeWithNewline(expected);
	});

	it('should preserve comments before expressions after nested tsx and tsrx blocks', async () => {
		const expected = `function App() {
  const content = <>
    <span class="nested-tsx">{'inside nested tsx'}</span>
    <div class="native">{nested}</div>
    // const content =
    //   <div>{hey()}</div>
    // ;
    {content}
  </>;
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
  return <>@{
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
        <>
          {'Hello'}
        </>
      }</div>
    </>
  }</>;
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
  return <>
    <div>Hello</div>
    <div>{p1}</div>
    <div>{p2}</div>
  </>;
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
  <button class="test another" onClick={handler}>{'Click Me'}</button>
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
    return <>
      {'Hello'}
    </>;
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

		it('expands empty braces to new lines for for statements', async () => {
			const expected = `for (let i = 0; i < 10; i++) {
}`;
			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('expands empty braces to new lines for while statements', async () => {
			const expected = `while (true) {
}`;
			const result = await format(expected);
			expect(result).toBeWithNewline(expected);
		});

		it('expands empty braces to new lines for do-while statements', async () => {
			const expected = `do {
} while (true);`;
			const result = await format(expected);
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
			const expected = `const App = () => <>
  @if (ready) {
  } @else {
  }
  @for (const item of items) {
  } @empty {
  }
</>;`;
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
  } catch {
  }
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

		it('should preserve comment if the whole function code is commented out, including blank lines', async () => {
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

			const result = await format(expected, { singleQuote: true });
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
	<button class={props.variant} onClick={props.onClick}>{props.label}</button>
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
			const expected = `type ExplicitReadonlyOptional<T> = { readonly [K in keyof T]?: T[K] };`;
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
  <RenderProp<User>>
    {(item) => item.name}
  </RenderProp>
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
  const func = (item) =>
    <><ItemView item={item} onSelect={props.onSelect} /></>;

  <List
    items={props.items}
    renderItem={(item) =>
      <><ItemView item={item} onSelect={props.onSelect} /></>}
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
  const view = <>
    <List
      items={props.items}
      renderItem={(item) =>
        <><ItemView item={item} onSelect={props.onSelect} /></>}
    />
  </>;
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
const foo = <><Bar {...props} /></>;`;

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
    id="this-is-a-button">{'this is a button'}</button>
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
  >{'this is a button'}</button>
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
  <button
    class="some-class"
    something="should"
    not="go"
    wrong="at all"
    id="this-is-a-button"
  >{'this is a button'}</button>
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
  <button
    class="test another"
    onClick={{ handleEvent: handler }}
  >{'Click Me'}</button>
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
  <div class={styles.item} data-active={state.active ? 'true' : 'false'} style={{ gridTemplateColumns: Icon ? '16px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}>{'content'}</div>
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
  <div class={styles.item} data-active={state.active ? 'true' : 'false'} style={{ gridTemplateColumns: Icon ? '16px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}>{'content'}</div>
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
    return <>
      {'Hello'}
    </>;
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
  return <span class={styles.notificationMessage}>
    The report is ready. Review the summary before sharing it with the team.
  </span>;
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
  >{'Click'}</button>
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should break up attributes on new lines if line length exceeds printWidth', async () => {
			const expected = `function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button"
  >{'this is a button'}</button>
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 40 });
			expect(result).toBeWithNewline(expected);
		});

		it('properly formats for of loops where the parent has no attributes', async () => {
			const expected = `<tbody>
  for (const [key, value] of Object.entries(attributes).filter(([_key, value]) => value !== ''))
  {<tr class="not-last:border-b border-border/50">
    <td class="py-2 font-mono w-48">
      <Kbd>{key}</Kbd>
    </td>
    <td class="py-2">{value}</td>
  </tr>}
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
  return <>
    <Card>@{
      function children() {
        <p class="highlighted">{'Card content here'}</p>
      }
    }</Card>

    <div>{test}</div>
  </>;
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
			const expected = `<div class="container">
  {/* Dynamic SVG - the original problem case */}
</div>`;

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
  >{count}</button>
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
  >{'Nonexistent'}</button>
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
  <div>
    {/* 'This is visible text' */}
  </div>
  <div>
    {/* <div>{'Card Component'}</div> */}
  </div>
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

  return @try {
    items = ReactiveArray.fromAsync(throwingIterable());
    @for (const item of items) {
      <li>{item}</li>
    }
  } @pending {
    <div>{'Loading...'}</div>
  } @catch (e) {
    error = (e as Error).message;
  };
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve the exact order with a commented out function a text literal sibling', async () => {
			const expected = `function Something({ children }) {
  const test = 'yo';
  return <Another>
    {\`Content inside \${test} Another component\`}
    // function children() {
    // 	<span>{'Child Component'}</span>
    // }
  </Another>;
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve the blank line between a commented out function and text literal sibling', async () => {
			const expected = `function Something({ children }) {
  const test = 'yo';
  return <Another>
    {\`Content inside \${test} Another component\`}

    // function children() {
    // 	<span>{'Child Component'}</span>
    // }
  </Another>;
}`;

			const result = await format(expected, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments before closing tag in elements', async () => {
			const expected = `function App() {
  return <div id="second-top-block">@{
    @if (true) {
      <div>{'b is true'}</div>
    }
    // <div>
    // 	<div />
    // </div>
    // <div id="sibling-block">{'Sibling'}</div>
  }</div>;
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
  }</div>;
}`;

			const result = await format(input, { singleQuote: true });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments above attributes on dom elements', async () => {
			const expected = `function App() {
  return <div
    // @tsrx-ignore
    something="test"
  >
    test
  </div>;
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should preserve comments above attributes on components', async () => {
			const expected = `function App() {
  return <Child
    // @tsrx-ignore
    something="test"
  >
    test
  </Child>;
}
function Child({ something }) {
  return <div>{something}</div>;
}`;

			const result = await format(expected, { singleQuote: true, printWidth: 100 });
			expect(result).toBeWithNewline(expected);
		});

		it('should format catch block with reset param and type annotation', async () => {
			const expected = `function Test() {
  return @try {
    const data = fetchData();
    <div>{data}</div>
  } @pending {
    <div>Loading...</div>
  } @catch (error: Error, reset: () => void) {
    <>
      <div>{error.message}</div>
      <button onClick={reset}>Retry</button>
    </>
  };
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
  return @switch (props.status) {
    @case 'ok': {
      <div>ok</div>
    }
    @case 'error': {
      <div>error</div>
    }
    @default: {
      props.status satisfies never;
    }
  };
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
  return <p class="lede">
    Set up TSRX with React, Preact, Solid, Vue, or Ripple and then wire in the editor tooling that
    makes
    <code class="inline-code">.tsrx</code>
    files feel native in the rest of your repo.
  </p>;
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
  return <span class={styles.notificationMessage}>
    The report is ready. Review the summary before sharing it with the
    team.
  </span>;
}`;
			const expectedPrintWidth40 = `function App() {
  return <span
    class={styles.notificationMessage}
  >
    The report is ready. Review the
    summary before sharing it with the
    team.
  </span>;
}`;

			const resultPrintWidth70 = await format(input, { printWidth: 70 });
			expect(resultPrintWidth70).toBeWithNewline(expectedPrintWidth70);

			const resultPrintWidth40 = await format(input, { printWidth: 40 });
			expect(resultPrintWidth40).toBeWithNewline(expectedPrintWidth40);
		});

		it('properly formats components markup and new lines and leaves one new line between components and <style> if one or more exists', async () => {
			const expected = `export function App() {
  return <div>
    <RowList rows={[{ id: 'a' }, { id: 'b' }, { id: 'c' }]}>@{
      function Row({ id, index, isHighlighted = (index) => index % 2 === 0 }) {
        return <>
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
        </>;
      }
    }</RowList>
  </div>;
}

function RowList({ rows, Row }) {
  return @for (const { id } of rows; index i) {
    <Row index={i} {id} />
  };
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

		it('escapes only the enclosing quote', async () => {
			const input = `const a = 'say "hi"';
const b = "it's";
const c = 'it\\'s';`;

			expect(await format(input)).toBeWithNewline(`const a = "say \\"hi\\"";
const b = "it's";
const c = "it's";`);
			expect(await format(input, { singleQuote: true })).toBeWithNewline(`const a = 'say "hi"';
const b = 'it\\'s';
const c = 'it\\'s';`);
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
			[`title={"It's \\"both\\""}`, `title={"It's \\"both\\""}`],
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

			// The multiline param type used to hide its hardlines from enclosing
			// groups (fits() short-circuits on hardlines inside conditionalGroup
			// states), so the body printed flat past printWidth.
			const result = await format(input, {
				useTabs: true,
				singleQuote: true,
				printWidth: 100,
			});
			expect(result).toBeWithNewline(input);
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
			await expectUnchanged(`export class Model { value!: string; }`);
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
			await expectUnchanged('class Registry { [name: string]: number; count = 1; }');
			await expectUnchanged('class Registry { static [name: string]: number; }');
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
  constructor(private readonly x: number, public y: string) {}
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
			await expectUnchanged(`class Keyed { [key] = 1; readonly [other] = 2; }`);
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
			'class Point { x = 1 }',
			'class List { first() {} last() {} }',
			'class Lazy { static {} value = 1 }',
		])('keeps a class on one line when no member needs a line break: %s', async (source) => {
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
			'const Title = styled.h1<Props>`color: red;`;',
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
			['for (i = 0, j = 0; i < 1; i++, j++) {}', 'for (i = 0, j = 0; i < 1; i++, j++) {\n}'],
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
			'for (i = ("key" in store) ? 1 : 0; i < 1; i++) {\n}',
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

		it('keeps the parentheses of a prettier-ignored operand', async () => {
			const result = await format(`const list = [
  // prettier-ignore
  (a   +   b),
];
const called = (
  // prettier-ignore
  a   ||   b
)();`);
			expect(result).toContain('  (a   +   b),\n');
			expect(result).toContain('(a   ||   b)();');
		});

		it('keeps a parenthesized nested ternary branch as written', async () => {
			await expectUnchanged('x = a ? (b ? c : d) : e;\ny = a ? b : (c ? d : e);');
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
  >{"Hi"}</button>
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

		it('moves a comment after the braces inside them', async () => {
			const result = await format(`import { a } /* after */ from 'mod';`);
			expect(result).toBeWithNewline(`import { a /* after */ } from "mod";`);
		});

		// Prettier prints `/* d */` after the `;`. It stays next to the source here.
		it('keeps a comment after the module source', async () => {
			await expectUnchanged('import a from /* c */ "mod" /* d */;');
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
			const expected = `@dec
export default class Named {}`;

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

		it('hoists decorators written after the export keyword', async () => {
			const input = `export @sealed class Widget {}`;
			const expected = `@sealed
export class Widget {}`;

			const result = await format(input);
			expect(result).toBeWithNewline(expected);
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
  return <>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>;
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
  return <>
    <style apply={a} />
    <style apply={b}>
      p {
        margin: 0;
      }
    </style>
    <p>{"x"}</p>
  </>;
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
