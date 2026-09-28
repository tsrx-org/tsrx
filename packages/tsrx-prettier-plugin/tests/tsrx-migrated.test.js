// Tests of TSRX syntax migrated from `@tsrx/prettier-plugin`'s suite (#852,
// Phase 2): the ones that exercise TSRX syntax and that this plugin passes.
// Each expects the output the old test expected, and that formatting it again
// changes nothing. A test that compared with Prettier's `typescript` parser
// still does. Kept apart from `tsrx.test.js` and the imported Prettier tests.

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
	expect(await format(input, options)).toBe(expected);
	expect(await format(expected, options)).toBe(expected);
}

describe('migrated from @tsrx/prettier-plugin', () => {
	test('formats dynamic element tags', async () => {
		await expectFormat(
			`function App(props){const Child='div';return <{Child} {...props} class="card"><span>Hello</span></{Child}>}`,
			`function App(props) {
  const Child = "div";
  return (
    <{Child} {...props} class="card">
      <span>Hello</span>
    </{Child}>
  );
}
`,
		);
	});

	test('formats dynamic element tag expressions', async () => {
		await expectFormat(
			`function App(){return <><{registry.item}/><{items[0]}/><{'section'}/><{registry[props.kind]}/></>;}`,
			`function App() {
  return (
    <>
      <{registry.item} />
      <{items[0]} />
      <{"section"} />
      <{registry[props.kind]} />
    </>
  );
}
`,
		);
	});

	test('formats a fragment code block with setup and template control flow', async () => {
		await expectFormat(
			`function App(){return <>@{
const items=[1,2,3];
@for(const item of items; index i; key item){<div>{i}{item}</div>}
}</>}`,
			`function App() {
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
}
`,
		);
	});

	test('formats setup statements and wrapped render output in a fragment code block', async () => {
		await expectFormat(
			`function SetTest() {
    return <>@{
        let items = new ReactiveSet([1, 2, 3]);
        const hasValue = track(() => items.has(2));
        <>
            <button onClick={() => items.delete(2)}>{'delete'}</button>
            <pre>{hasValue.value}</pre>
        </>
    }</>;
}`,
			`function SetTest() {
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
}
`,
		);
	});

	test('keeps nested code-only fragments multiline', async () => {
		await expectFormat(
			`function App() {
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
}`,
			`function App() {
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
}
`,
		);
	});

	test('formats template for-of expressions without adding a semicolon before of', async () => {
		await expectFormat(
			`const App=()=> <><ul>@for (const item of items) {<li>{item.label}</li>}</ul></>;`,
			`const App = () => (
  <>
    <ul>
      @for (const item of items) {
        <li>{item.label}</li>
      }
    </ul>
  </>
);
`,
		);
	});

	test('formats line comments before template children', async () => {
		await expectFormat(
			`const App=()=> <>
// keep the status visible
<span>Ready</span>
</>;`,
			`const App = () => (
  <>
    // keep the status visible
    <span>Ready</span>
  </>
);
`,
		);
	});

	test('formats line comments before template text in control flow', async () => {
		await expectFormat(
			`const App=()=> <>
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
</>;`,
			`const App = () => (
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
);
`,
		);
	});

	test('formats style tags inside returned TSRX', async () => {
		await expectFormat(
			`export default function App(){return <><style>div{color:red}</style></>}`,
			`export default function App() {
  return (
    <>
      <style>
        div {
          color: red;
        }
      </style>
    </>
  );
}
`,
		);
	});

	test('preserves style lines when embedded formatting is disabled', async () => {
		await expectFormat(
			`export default function App() @{
	<style>
		.demo {
			display: grid;
			gap: 0.5rem;
		}
		button {
			color: inherit;
		}
	</style>
}`,
			`export default function App() @{
	<style>
		.demo {
			display: grid;
			gap: 0.5rem;
		}
		button {
			color: inherit;
		}
	</style>
}
`,
			{ useTabs: true, singleQuote: true, embeddedLanguageFormatting: 'off' },
		);
	});

	test('preserves style lines when embedded formatting fails', async () => {
		await expectFormat(
			`export default function App() @{
	<style>
		.demo {
			color red;
		}
	</style>
}`,
			`export default function App() @{
	<style>
		.demo {
			color red;
		}
	</style>
}
`,
			{ useTabs: true, singleQuote: true },
		);
	});

	test('keeps a lone binary expression child inline when it fits', async () => {
		await expectFormat(
			`export function App() @{
  <h2>{'Count: ' + count}</h2>
}`,
			`export function App() @{
  <h2>{'Count: ' + count}</h2>
}
`,
			{ singleQuote: true },
		);
	});

	test('indents a lone binary expression child when it wraps', async () => {
		await expectFormat(
			`export function App() @{
  <h2>{firstLongIdentifier + secondLongIdentifier + thirdLongIdentifier}</h2>
}`,
			`export function App() @{
  <h2>
    {firstLongIdentifier +
      secondLongIdentifier +
      thirdLongIdentifier}
  </h2>
}
`,
			{ printWidth: 40 },
		);
	});

	test('indents a lone binary expression child after wrapped attributes', async () => {
		await expectFormat(
			`export function App() @{
  <h2 firstLongAttributeName={firstLongAttributeValue} secondLongAttributeName={secondLongAttributeValue}>{a + b}</h2>
}`,
			`export function App() @{
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
}
`,
			{ printWidth: 50 },
		);
	});

	test('preserves authored multiline whitespace around a single JSXText child', async () => {
		await expectFormat(
			`function Foo() @{
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
}`,
			`function Foo() @{
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
}
`,
		);
	});

	test('hugs a `@{ }` code block to an element body', async () => {
		await expectFormat(
			`function App(){return <div>@{const x=1;<span>{x}</span>}</div>}`,
			`function App() {
  return (
    <div>@{
      const x = 1;
      <span>{x}</span>
    }</div>
  );
}
`,
		);
	});

	test('formats a code-only `@{ }` block', async () => {
		await expectFormat(
			`function App(){return <div>@{let count=track(0);effect(()=>log(count));}</div>}`,
			`function App() {
  return (
    <div>@{
      let count = track(0);
      effect(() => log(count));
    }</div>
  );
}
`,
		);
	});

	test('formats a `@{ }` block returned directly from an arrow body', async () => {
		await expectFormat(
			`const G=()=>@{const a=5;<div>{a}</div>}`,
			`const G = () => @{
  const a = 5;
  <div>{a}</div>
};
`,
		);
	});

	test('formats a function declaration with a `@{ }` body', async () => {
		await expectFormat(
			`function Something() @{const a=5;<div>{a}</div>}`,
			`function Something() @{
  const a = 5;
  <div>{a}</div>
}
`,
		);
	});

	test('formats @if/else directive bodies in a plain JSX body', async () => {
		await expectFormat(
			`const App=()=> <div>@if(ready){<span>Ready</span>}@else{<span>Waiting</span>}</div>;`,
			`const App = () => (
  <div>
    @if (ready) {
      <span>Ready</span>
    } @else {
      <span>Waiting</span>
    }
  </div>
);
`,
		);
	});

	test('formats `@{ }` blocks idempotently', async () => {
		await expectFormat(
			`function App(){return <>@{
const items=[1,2,3];
@for(const item of items; index i; key item){<div>{i}{item}</div>}
}</>}`,
			`function App() {
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
}
`,
		);
	});

	test('should format tsrx expression fragments', async () => {
		await expectFormat(
			`function App(){const content=<>@{const label="Hi";<><div>Hello {label}</div>{content}</>}</>;}`,
			`function App() {
  const content = (
    <>@{
      const label = 'Hi';
      <>
        <div>Hello {label}</div>
        {content}
      </>
    }</>
  );
}
`,
			{ singleQuote: true },
		);
	});

	test('should format direct @{} assignment formatting with fragments', async () => {
		await expectFormat(
			`function App(){const content=@{const label="Hi";<><div>Hello {label}</div>{content}</>};}`,
			`function App() {
  const content = (
    @{
      const label = 'Hi';
      <>
        <div>Hello {label}</div>
        {content}
      </>
    }
  );
}
`,
			{ singleQuote: true },
		);
	});

	test('should format direct @if assignment formatting with fragments', async () => {
		await expectFormat(
			`function App(){const content=@if(a>b){const label="Hi";<><div>Hello {label}</div>{content}</>};}`,
			`function App() {
  const content = (
    @if (a > b) {
      const label = 'Hi';
      <>
        <div>Hello {label}</div>
        {content}
      </>
    }
  );
}
`,
			{ singleQuote: true },
		);
	});

	test('should format whitespace correctly', async () => {
		await expectFormat(
			`export function Test(){
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
    }`,
			`export function Test() {
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
}
`,
			{ singleQuote: true },
		);
	});

	test('keeps fitting tsrx arrow returns inline in declarations and attributes', async () => {
		await expectFormat(
			`function Test(props){const func=(item)=><><Item {item}/></>;<List renderItem={(item)=><><Item {item}/></>} />}`,
			`function Test(props) {
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
}
`,
			{ printWidth: 60 },
		);
	});

	test('breaks non-fitting tsrx arrow returns after the arrow in declarations and attributes - printWidth: 60', async () => {
		await expectFormat(
			`function Test(props) {
  const func = (item) => <><ItemView {item} onSelect={props.onSelect} /></>;
  <List
    items={props.items}
    renderItem={(item) => <><ItemView {item} onSelect={props.onSelect} /></>}
  />
}`,
			`function Test(props) {
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
}
`,
			{ singleQuote: true, printWidth: 60 },
		);
	});

	test('breaks non-fitting tsrx arrow returns after the arrow in declarations and attributes - printWidth: 80', async () => {
		await expectFormat(
			`function Test(props) {
  const func = (item) => <><ItemView {item} onSelect={props.onSelect} /></>;
  <List
    items={props.items}
    renderItem={(item) => <><ItemView {item} onSelect={props.onSelect} /></>}
  />
}`,
			`function Test(props) {
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
}
`,
			{ singleQuote: true, printWidth: 80 },
		);
	});

	test('should preserve comments before expressions after nested tsx and tsrx blocks', async () => {
		await expectFormat(
			`function App() {
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
}`,
			`function App() {
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
}
`,
			{ singleQuote: true },
		);
	});

	test('should format whitespace correctly #2', async () => {
		await expectFormat(
			`export function Test(){
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
    }`,
			`export function Test() {
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
}
`,
			{ singleQuote: true },
		);
	});

	test('places the comment of the template "@switch (a) {\\n    // c\\n  }" as a switch does', async () => {
		await expectFormat(
			`function App() @{
  @switch (a) {
    // c
  }
}`,
			`function App() @{
  @switch (a) {
    // c
  }
}
`,
		);
	});

	test('places the comment of the template "@switch (a) {\\n    @default: {\\n      // c\\n    }\\n  }" as a switch does', async () => {
		await expectFormat(
			`function App() @{
  @switch (a) {
    @default: {
      // c
    }
  }
}`,
			`function App() @{
  @switch (a) {
    @default: {
      // c
    }
  }
}
`,
		);
	});

	test('places the comment of the template "@switch (a) {\\n    @case 1: {\\n      // c\\n    }\\n  }" as a switch does', async () => {
		await expectFormat(
			`function App() @{
  @switch (a) {
    @case 1: {
      // c
    }
  }
}`,
			`function App() @{
  @switch (a) {
    @case 1: {
      // c
    }
  }
}
`,
		);
	});

	test('places the comment of the template "@switch (a) /* e */ {\\n    @case 1: {\\n      <span />\\n    }\\n  }" as a switch does', async () => {
		await expectFormat(
			`function App() @{
  @switch (a) /* e */ {
    @case 1: {
      <span />
    }
  }
}`,
			`function App() @{
  @switch (a /* e */) {
    @case 1: {
      <span />
    }
  }
}
`,
		);
	});

	test('places the comment of the template "@switch (a) {\\n    @case 1: /* e */ {\\n      <span />\\n    }\\n  }" as a switch does', async () => {
		await expectFormat(
			`function App() @{
  @switch (a) {
    @case 1: /* e */ {
      <span />
    }
  }
}`,
			`function App() @{
  @switch (a) {
    @case 1: /* e */ {
      <span />
    }
  }
}
`,
		);
	});

	test('places the comment of the template "@switch (a) {\\n    @default: /* e */ {\\n      <span />\\n    }\\n  }" as a switch does', async () => {
		await expectFormat(
			`function App() @{
  @switch (a) {
    @default: /* e */ {
      <span />
    }
  }
}`,
			`function App() @{
  @switch (a) {
    @default: /* e */ {
      <span />
    }
  }
}
`,
		);
	});
	describe('prettier-ignore', () => {
		test('preserves a JSX element verbatim', async () => {
			await expectFormat(
				`export function App() @{
	// prettier-ignore
	<div   class="x"     id="y">
		hello
	</div>
}`,
				`export function App() @{
  // prettier-ignore
  <div   class="x"     id="y">
		hello
	</div>
}
`,
			);
		});

		test('preserves a whitespace-only fragment verbatim', async () => {
			await expectFormat(
				`function WhitespaceOnlyApp() @{
	// prettier-ignore
	<>
	</>
}`,
				`function WhitespaceOnlyApp() @{
  // prettier-ignore
  <>
	</>
}
`,
			);
		});

		test('still formats an element whose only comment is its child', async () => {
			await expectFormat(
				`function App() @{
  const  x = 1;
  <div   a="1">
    // prettier-ignore
  </div>
}`,
				`function App() @{
  const x = 1;
  <div a="1">
    // prettier-ignore
  </div>
}
`,
			);
		});

		test('keeps the last node of a code block that an own-line prettier-ignore follows', async () => {
			await expectFormat(
				`function App() @{
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
}`,
				`function App() @{
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
}
`,
			);
		});

		test('still formats the last node of a code block that another comment follows', async () => {
			await expectFormat(
				`function App() @{
  <span   a="1" />
  // prettier-ignore-start
}`,
				`function App() @{
  <span a="1" />
  // prettier-ignore-start
}
`,
			);
		});

		test('keeps an element after a prettier-ignore JSX comment child as written', async () => {
			await expectFormat(
				`function App() {
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
}`,
				`function App() {
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
}
`,
			);
		});
	});

	describe('recovered', () => {
		test('should format a simple component', async () => {
			await expectFormat(
				`export function Test()@{let count=0;<div>{"Hello"}</div>}`,
				`export function Test() @{
  let count = 0;
  <div>{'Hello'}</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('keeps the parentheses of an object destructuring assignment statement', async () => {
			await expectFormat(
				`function swap() {
  ({ other } = { other: 'y' });
  [label] = ['b'];
  ({ other } = source).other;
}
export function Pair() @{
  const swap = () => {
    ({ other } = { other: 'y' });
  };
  <span onClick={swap}>{other}</span>
}`,
				`function swap() {
  ({ other } = { other: 'y' });
  [label] = ['b'];
  ({ other } = source).other;
}
export function Pair() @{
  const swap = () => {
    ({ other } = { other: 'y' });
  };
  <span onClick={swap}>{other}</span>
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle style tags inside function body', async () => {
			await expectFormat(
				`export function Test()@{<><div>{"Test"}</div><style>div{color:red}</style></>}`,
				`export function Test() @{
  <>
    <div>{'Test'}</div>
    <style>
      div {
        color: red;
      }
    </style>
  </>
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle for...of loops in function body', async () => {
			await expectFormat(
				`export function Test()@{const items=[1,2,3];@for(const item of items){<li>{item}</li>}}`,
				`export function Test() @{
  const items = [1, 2, 3];
  @for (const item of items) {
    <li>{item}</li>
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle empty fallbacks for for...of loops', async () => {
			await expectFormat(
				`export function Test()@{const items=[];@for(const item of items){<li>{item}</li>}@empty{<li>No items</li>}}`,
				`export function Test() @{
  const items = [];
  @for (const item of items) {
    <li>{item}</li>
  } @empty {
    <li>No items</li>
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('keeps await on for await loops and @for await directives', async () => {
			await expectFormat(
				`async function read(stream){for await(const chunk of stream){use(chunk)}}
async function App({ items }) @{
<ul>@for await(const item of items; index i){<li>{item}</li>}@empty{<li>none</li>}</ul>
}`,
				`async function read(stream) {
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
}
`,
			);
		});

		test('should not force attribute-less elements to break with singleAttributePerLine', async () => {
			await expectFormat(
				`function One() @{
  <div>Hello</div>
}`,
				`function One() @{
  <div>Hello</div>
}
`,
				{ singleQuote: true, printWidth: 100, singleAttributePerLine: true },
			);
		});

		test('should keep proper formatting between css declarations', async () => {
			await expectFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep one new line between css declarations if one or more is provided', async () => {
			await expectFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep style tag intact when wrapped in parent inside component', async () => {
			await expectFormat(
				`function App() {
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
}`,
				`function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep css siblings formatting intact', async () => {
			await expectFormat(
				`export function App() {
  <style>
    div + .div > div,
    p,
    #id + .div ~ div,
    #id {
      color: red;
    }
  </style>
}`,
				`export function App() {
  <style>
    div + .div > div,
    p,
    #id + .div ~ div,
    #id {
      color: red;
    }
  </style>
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should format & parent nested selector correctly', async () => {
			await expectFormat(
				`export function App() @{
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
}`,
				`export function App() @{
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep css @keyframes syntax intact', async () => {
			await expectFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should not mangle empty stylesheet tags <style></style>', async () => {
			await expectFormat(
				`function App() {
  <style>

  </style>
}`,
				`function App() {
  <style></style>
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should not remove comments when stylesheet contains some sort of combination of selectors', async () => {
			await expectFormat(
				`function Editor() {
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
}`,
				`function Editor() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('expands empty braces for template control-flow blocks', async () => {
			await expectFormat(
				`const App=()=> <>@if (ready) {} @else {}@for (const item of items) {} @empty {}</>;`,
				`const App = () => (
  <>
    @if (ready) {
    } @else {
    }
    @for (const item of items) {
    } @empty {
    }
  </>
);
`,
			);
		});

		test('should handle function with only style', async () => {
			await expectFormat(
				`export function Styled(){<style>body{background:#fff}</style>}`,
				`export function Styled() {
  <style>
    body {
      background: #fff;
    }
  </style>
}
`,
			);
		});

		test('should preserve block comments before closing tag in elements', async () => {
			await expectFormat(
				`function App() {
  <div>
    <span>{'child'}</span>
    /* block comment */
  </div>
}`,
				`function App() {
  <div>
    <span>{'child'}</span>
    /* block comment */
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve template comments and blank lines from unformatted input', async () => {
			await expectFormat(
				`function TodoList() @{
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
}`,
				`function TodoList() @{
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
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve block comments before a closing fragment', async () => {
			await expectFormat(
				`function App() @{
  <>
    <span>{'child'}</span>

    /* block comment */
  </>
}`,
				`function App() @{
  <>
    <span>{'child'}</span>

    /* block comment */
  </>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve a blank line before a trailing block comment in elements', async () => {
			await expectFormat(
				`function App() {
  <div>
    <span>{'child'}</span>

    /* block comment */
  </div>
}`,
				`function App() {
  <div>
    <span>{'child'}</span>

    /* block comment */
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve a comment-only fragment body', async () => {
			await expectFormat(
				`function App() @{
  <>/* only */</>
}`,
				`function App() @{
  <>/* only */</>
}
`,
				{ singleQuote: true },
			);
		});

		test('should keep blank lines around comments between template siblings', async () => {
			await expectFormat(
				`function App() @{
  <>
    <ul></ul>

    /* between */

    <ul></ul>
  </>
}`,
				`function App() @{
  <>
    <ul></ul>

    /* between */

    <ul></ul>
  </>
}
`,
				{ singleQuote: true },
			);
		});

		test('should keep a trailing line comment after an expression container child', async () => {
			await expectFormat(
				`function App() @{
  <>
    {q} // hey
    // hello
  </>
}`,
				`function App() @{
  <>
    {q} // hey
    // hello
  </>
}
`,
				{ singleQuote: true },
			);
		});

		test('should keep a trailing block comment after an expression container child', async () => {
			await expectFormat(
				`function App() {
  <div>
    {x} /* note */
    <span>{'tail'}</span>
  </div>
}`,
				`function App() {
  <div>
    {x} /* note */
    <span>{'tail'}</span>
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('keeps blank lines and comments around @case bodies', async () => {
			await expectFormat(
				`function App() @{
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
}`,
				`function App() @{
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
}
`,
			);
		});

		test('should not add an extra blank line before a comment inside element children', async () => {
			await expectFormat(
				`function App() {
  <div id="second-top-block">
    <div>
      let x = 1;
      // comment
      <div>{'Test'}</div>
    </div>
  </div>
}`,
				`function App() {
  <div id="second-top-block">
    <div>
      let x = 1;
      // comment
      <div>{'Test'}</div>
    </div>
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('puts each clause of a long for header on its own line', async () => {
			await expectFormat(
				`for (let index = 0, length = items.length; index < length && !found; index += step) {
  visit(items[index]);
}
label: for (let someLongVariableName = 0; someLongVariableName < limit; someLongVariableName++) {}
function App() @{
  <ul>
    @for (let someLongVariableName = 0; someLongVariableName < limit; someLongVariableName++) {
      <li />
    }
  </ul>
}`,
				`for (
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
}
`,
			);
		});

		test('should correctly handle for loop with index syntax, plus comments', async () => {
			await expectFormat(
				`export function Test() @{
  // some comments
  <ul>
    @for (const item of items; index i) {
      // comment
      <li>{i}</li>
    }
  </ul>
}

// some comments
const test = ""; // some comments 2`,
				`export function Test() @{
  // some comments
  <ul>
    @for (const item of items; index i) {
      // comment
      <li>{i}</li>
    }
  </ul>
}

// some comments
const test = ""; // some comments 2
`,
			);
		});

		test('should break the parameters around a lone object type argument of the props type', async () => {
			await expectFormat(
				`function Button(props: PropsWithExtras<{
	variant: string;
	label: string;
	onClick: EventListener;
}>) @{
	<button class={props.variant} onClick={props.onClick}>
		{props.label}
	</button>
}`,
				`function Button(
	props: PropsWithExtras<{
		variant: string;
		label: string;
		onClick: EventListener;
	}>,
) @{
	<button class={props.variant} onClick={props.onClick}>
		{props.label}
	</button>
}
`,
				{ useTabs: true, tabWidth: 2, singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve blank line between commented out block and following element', async () => {
			await expectFormat(
				`function App() @{
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
}`,
				`function App() @{
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
}
`,
				{ printWidth: 100 },
			);
		});

		test('should format JSX attributes with tracked values', async () => {
			await expectFormat(
				`function App() {
	const count = track(0);

	<Counter count={count.value} />
	<Counter {count} />
}`,
				`function App() {
  const count = track(0);

  <Counter count={count.value} />
  <Counter {count} />
}
`,
				{ singleQuote: true },
			);
		});

		test('should keep ReactiveSet parents with short syntax and no args intact', async () => {
			await expectFormat(
				`function SetTest() @{
  let items = new ReactiveSet();

  <>
    <button onClick={() => items.add(1)}>{'add'}</button>
    <pre>{items.size}</pre>
  </>
}`,
				`function SetTest() @{
  let items = new ReactiveSet();

  <>
    <button onClick={() => items.add(1)}>{'add'}</button>
    <pre>{items.size}</pre>
  </>
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep ReactiveMap parents with short syntax and no args intact', async () => {
			await expectFormat(
				`function MapTest() @{
  let items = new ReactiveMap();

  <>
    <button onClick={() => items.set('key', 1)}>{'add'}</button>
    <pre>{items.size}</pre>
  </>
}`,
				`function MapTest() @{
  let items = new ReactiveMap();

  <>
    <button onClick={() => items.set('key', 1)}>{'add'}</button>
    <pre>{items.size}</pre>
  </>
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve a blank line between components and js declarations if one is provided', async () => {
			await expectFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve blank line between function with nested markup and js', async () => {
			await expectFormat(
				`function App() @{
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

render(App);`,
				`function App() @{
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

render(App);
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('keeps an unparseable <script> body on its own lines without adding blank lines', async () => {
			await expectFormat(
				`export function App() @{
  <script>const broken = ;</script>
}`,
				`export function App() @{
  <script>
    const broken = ;
  </script>
}
`,
			);
		});

		test('re-indents an unparseable <script> body and keeps its relative indentation', async () => {
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

		test('keeps an unparseable <script> body with CRLF line endings clean', async () => {
			await expectFormat(
				`export function App() @{\r
  <script>\r
    const a = 1;\r
    const broken = ;\r
      go();\r
  </script>\r
}\r
`,
				`export function App() @{\r
  <script>\r
    const a = 1;\r
    const broken = ;\r
      go();\r
  </script>\r
}\r
`,
				{ endOfLine: 'auto' },
			);
			await expectFormat(
				`export function App() @{
  <script>
    const a = 1;
    const broken = ;
      go();
  </script>
}
`,
				`export function App() @{
  <script>
    const a = 1;
    const broken = ;
      go();
  </script>
}
`,
				{ endOfLine: 'lf' },
			);
			await expectFormat(
				`export function App() @{\r
  <script>\r
    const a = 1;\r
    const broken = ;\r
      go();\r
  </script>\r
}\r
`,
				`export function App() @{\r
  <script>\r
    const a = 1;\r
    const broken = ;\r
      go();\r
  </script>\r
}\r
`,
				{ endOfLine: 'crlf' },
			);
		});

		test('indents an unparseable <script> body with tabs under useTabs', async () => {
			await expectFormat(
				`export function App() @{
  <script>
    const broken = ;
      go();
  </script>
}`,
				`export function App() @{
	<script>
		const broken = ;
		  go();
	</script>
}
`,
				{ useTabs: true },
			);
		});

		test('formats a JSON <script> body as JSON, like Prettier', async () => {
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
  </div>
}
`,
			);
		});

		test('keeps a <script> body of another type, or with src, as written', async () => {
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
  </div>
}
`,
			);
		});

		test('formats a <script> body of a code, Markdown, or HTML type like Prettier', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    <script type="module">let   a = 1</script>
    <script type="">let   a = 1</script>
    <script type="text/markdown">
      #   Title
    </script>
    <script type="text/html"><div><p>hi</p></div></script>
  </div>
}`,
				`export function App() @{
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
}
`,
			);
		});

		test('should preserve an existing blank line before a comment inside element children', async () => {
			await expectFormat(
				`function App() {
  <div>
    let x = 1;
    // comment
    <div>{'Test'}</div>
  </div>
}`,
				`function App() {
  <div>
    let x = 1;
    // comment
    <div>{'Test'}</div>
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve blank line after multi-line comment block followed by element in function body', async () => {
			await expectFormat(
				`function App() @{
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
}`,
				`function App() @{
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
}
`,
				{ printWidth: 100 },
			);
		});

		test('should preserve trailing comments after last child element before closing tag', async () => {
			await expectFormat(
				`function App() {
  <div>
    <span>{'first'}</span>
    <span>{'second'}</span>
    // trailing comment 1
    // trailing comment 2
  </div>
}`,
				`function App() {
  <div>
    <span>{'first'}</span>
    <span>{'second'}</span>
    // trailing comment 1
    // trailing comment 2
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should not move commented composite elements to the outside of parent element', async () => {
			await expectFormat(
				`function Child({ children, NonExistent, ...props }) {
  <div {...props}>
    // {children}
    // <NonExistent />
  </div>
}`,
				`function Child({ children, NonExistent, ...props }) {
  <div {...props}>
    // {children}
    // <NonExistent />
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve an existing blank line before a comment inside an element code block', async () => {
			await expectFormat(
				`function App() {
  <div>@{
    let x = 1;

    // comment
    <div>{'Test'}</div>
  }</div>
}`,
				`function App() {
  <div>@{
    let x = 1;

    // comment
    <div>{'Test'}</div>
  }</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve the order of try / pending / catch blocks', async () => {
			await expectFormat(
				`function Test() {
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
}`,
				`function Test() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve the exact order with a commented out function a text literal sibling', async () => {
			await expectFormat(
				`function Something({ children }) {
  const test = 'yo';
  return (
    <Another>
      {\`Content inside \${test} Another component\`}
      // function children() {
      // 	<span>{'Child Component'}</span>
      // }
    </Another>
  );
}`,
				`function Something({ children }) {
  const test = 'yo';
  return (
    <Another>
      {\`Content inside \${test} Another component\`}
      // function children() {
      // 	<span>{'Child Component'}</span>
      // }
    </Another>
  );
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve the blank line between a commented out function and text literal sibling', async () => {
			await expectFormat(
				`function Something({ children }) {
  const test = 'yo';
  return (
    <Another>
      {\`Content inside \${test} Another component\`}

      // function children() {
      // 	<span>{'Child Component'}</span>
      // }
    </Another>
  );
}`,
				`function Something({ children }) {
  const test = 'yo';
  return (
    <Another>
      {\`Content inside \${test} Another component\`}

      // function children() {
      // 	<span>{'Child Component'}</span>
      // }
    </Another>
  );
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve comments before closing tag in elements', async () => {
			await expectFormat(
				`function App() {
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
}`,
				`function App() {
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
}
`,
				{ singleQuote: true },
			);
		});

		test('should not move comments before if statement into the test condition', async () => {
			await expectFormat(
				`function App() {
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
}`,
				`function App() {
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
}
`,
				{ singleQuote: true },
			);
		});

		test('should format catch block with reset param and type annotation', async () => {
			await expectFormat(
				`function Test() {
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
}`,
				`function Test() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('prints satisfies expressions in switch default cases', async () => {
			await expectFormat(
				`export function Test(props: { status: "ok" | "error" }) {
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
}`,
				`export function Test(props: { status: 'ok' | 'error' }) {
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
}
`,
				{ singleQuote: true },
			);
		});

		test('properly formats components markup and new lines and leaves one new line between components and <style> if one or more exists', async () => {
			await expectFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});
	});

	describe('numeric literals', () => {
		test('prints bigint literals inside templates', async () => {
			await expectFormat(
				`function App() @{
  const label = "big:";
  <div>
    {label}
    {1n}
  </div>
}`,
				`function App() @{
  const label = "big:";
  <div>
    {label}
    {1n}
  </div>
}
`,
			);
		});
	});

	describe('comments in empty arrays and objects', () => {
		test('keeps comments in empty arrays and objects in templates', async () => {
			await expectFormat(
				`export function App() @{
  const none = {/* x */};
  <div list={[
    // nothing
  ]} />
}`,
				`export function App() @{
  const none = {/* x */};
  <div
    list={
      [
        // nothing
      ]
    }
  />
}
`,
			);
		});
	});

	describe('JSX attribute strings survive formatting', () => {
		test('keeps the braces around a string in a template', async () => {
			await expectFormat(
				`export function App() @{
  <div class={"foo"} title={'It\\'s'}>{"text"}</div>
}`,
				`export function App() @{
  <div class={'foo'} title={"It's"}>
    {'text'}
  </div>
}
`,
				{ singleQuote: true },
			);
		});
	});

	describe('JSX attribute values break like Prettier', () => {
		test('breaks a value that does not fit onto its own lines inside the braces', async () => {
			await expectFormat(
				`export function App(props) @{
  <div
    class={props.items.length > 0 && props.filter.length > 0 && visible.length > 0 ? 'some-long-class-name' : 'other-class'}
    title={aaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb + cccccccccccccccccccccc}
    hidden={props.someVeryLongConditionName || props.anotherVeryLongConditionName || props.x}
    data={someObject.someProperty.anotherProperty.yetAnotherProperty.finalPropertyName}
    icon={<Icon name="something" size="large" color="red" onClick={handleClickEvent} />}
  />
}`,
				`export function App(props) @{
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
}
`,
			);
		});

		test('keeps a value that can break after its first token against the braces', async () => {
			await expectFormat(
				`export function App(props) @{
  <div
    onClick={() => {
      doSomething(props.first, props.second);
    }}
    style={{ color: "red", backgroundColor: "blue", borderColor: "green", margin: 0 }}
    items={[aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccc]}
    value={computeSomething(aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cc)}
    label={\`template \${aaaaaaaaaaaaaaaaaaaaaaaaa} with \${bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb} parts\`}
  />
}`,
				`export function App(props) @{
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
}
`,
			);
		});

		test('keeps a comment inside the braces', async () => {
			await expectFormat(
				`export function App(props) @{
  <div
    value={props.value // why
    }
    list={[1, 2] // how
    }
    note={/* what */ props.someVeryLongValueNameThatDoesNotFitOnTheLineWithTheAttribute}
  />
}`,
				`export function App(props) @{
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
}
`,
			);
		});
	});

	describe('template children lay out like the same JSX in TSX', () => {
		test('formats the features: components section like Prettier', async () => {
			await expectFormat(
				`export function Page() @{
	<section class="doc-section" id="components">
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
	</section>
}`,
				`export function Page() @{
	<section class="doc-section" id="components">
		<h2 class="section-heading">Components</h2>
		<p class="section-body">
			A TSRX component is just a TypeScript function that produces JSX. Use a statement-container
			body for component-shaped templates, especially when local setup, comments, scoped styles, or
			multiple rendered children belong with the markup.
		</p>
		<p class="section-body">
			In practice, components are ordinary TypeScript functions or{' '}
			<code class="inline-code">const</code> values. A component can use{' '}
			<code class="inline-code">{'@{...}'}</code> as the function body, giving you one place for
			local state, derived values, template control flow, rendered elements, and scoped styles.
		</p>
		<pre class="code-block">
			<code innerHTML={COMPONENT_HTML} />
		</pre>
		<p class="section-body">
			Export them like any other function:{' '}
			<code class="inline-code">{'export function Name() @{ <div /> }'}</code>. The compiler turns
			that into the right component shape for the target you're using.
		</p>
		<p class="section-body">
			When a bit of logic should stay plain JavaScript rather than render into the template, put it
			in a normal function beside the markup. Use{' '}
			<code class="inline-code">{'function fn() { ... }'}</code> for ordinary control flow, then
			call helpers from event handlers or expressions:{' '}
			<code class="inline-code">{'onClick={fn}'}</code>.
		</p>
		<pre class="code-block">
			<code innerHTML={BAILOUT_HTML} />
		</pre>
	</section>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<section class="doc-section" id="components">
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
	</section>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<section class="doc-section" id="components">
		<h2 class="section-heading">Components</h2>
		<p class="section-body">
			A TSRX component is just a TypeScript function that produces JSX. Use a statement-container
			body for component-shaped templates, especially when local setup, comments, scoped styles, or
			multiple rendered children belong with the markup.
		</p>
		<p class="section-body">
			In practice, components are ordinary TypeScript functions or{' '}
			<code class="inline-code">const</code> values. A component can use{' '}
			<code class="inline-code">{'@{...}'}</code> as the function body, giving you one place for
			local state, derived values, template control flow, rendered elements, and scoped styles.
		</p>
		<pre class="code-block">
			<code innerHTML={COMPONENT_HTML} />
		</pre>
		<p class="section-body">
			Export them like any other function:{' '}
			<code class="inline-code">{'export function Name() @{ <div /> }'}</code>. The compiler turns
			that into the right component shape for the target you're using.
		</p>
		<p class="section-body">
			When a bit of logic should stay plain JavaScript rather than render into the template, put it
			in a normal function beside the markup. Use{' '}
			<code class="inline-code">{'function fn() { ... }'}</code> for ordinary control flow, then
			call helpers from event handlers or expressions:{' '}
			<code class="inline-code">{'onClick={fn}'}</code>.
		</p>
		<pre class="code-block">
			<code innerHTML={BAILOUT_HTML} />
		</pre>
	</section>;
}
`);
		});

		test('formats the features: statement containers section like Prettier', async () => {
			await expectFormat(
				`export function Page() @{
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
		<pre class="code-block">
			<code innerHTML={TEMPLATE_STRUCTURE_HTML} />
		</pre>
	</section>
}`,
				`export function Page() @{
	<section class="doc-section" id="template-structure">
		<h2 class="section-heading">Statement containers</h2>
		<p class="section-body">
			When a template scope mixes TypeScript setup with rendered output, wrap the setup in
			<code class="inline-code">{'@{...}'}</code>. TSRX treats everything before the final
			renderable child as script, then the container must finish with exactly one output node.
		</p>
		<p class="section-body muted">
			That final output can be a JSX element, a JSX fragment, or JSX control flow like{' '}
			<code class="inline-code">{'@if'}</code>, <code class="inline-code">{'@for'}</code>,{' '}
			<code class="inline-code">{'@switch'}</code>, or <code class="inline-code">{'@try'}</code>. It
			cannot be a bare expression container, and no script statements can appear after it.
		</p>
		<p class="section-body muted">
			If the rendered part needs multiple siblings or text next to elements, wrap those children in
			a fragment so they become one output. The rule applies locally to component bodies, element
			children, and control-flow branches, so setup can stay close to the markup that uses it
			without turning ordinary template text into JavaScript.
		</p>
		<p class="section-body muted">
			Control-flow bodies are implicit statement containers too:
			<code class="inline-code">@if</code>,<code class="inline-code">@for</code>,
			<code class="inline-code">@switch</code>, and
			<code class="inline-code">@try</code>
			arms all use
			<code class="inline-code">{'{}'}</code>
			blocks.
		</p>
		<p class="section-body muted">
			If you write setup statements and then a bare JSX element inside a normal
			<code class="inline-code">{'{}'}</code>
			function body, the compiler will ask you to add the missing
			<code class="inline-code">@</code>. Plain braces are JavaScript; statement-container braces
			are
			<code class="inline-code">{'@{...}'}</code>.
		</p>
		<pre class="code-block">
			<code innerHTML={TEMPLATE_STRUCTURE_HTML} />
		</pre>
	</section>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
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
		<pre class="code-block">
			<code innerHTML={TEMPLATE_STRUCTURE_HTML} />
		</pre>
	</section>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<section class="doc-section" id="template-structure">
		<h2 class="section-heading">Statement containers</h2>
		<p class="section-body">
			When a template scope mixes TypeScript setup with rendered output, wrap the setup in
			<code class="inline-code">{'@{...}'}</code>. TSRX treats everything before the final
			renderable child as script, then the container must finish with exactly one output node.
		</p>
		<p class="section-body muted">
			That final output can be a JSX element, a JSX fragment, or JSX control flow like{' '}
			<code class="inline-code">{'@if'}</code>, <code class="inline-code">{'@for'}</code>,{' '}
			<code class="inline-code">{'@switch'}</code>, or <code class="inline-code">{'@try'}</code>. It
			cannot be a bare expression container, and no script statements can appear after it.
		</p>
		<p class="section-body muted">
			If the rendered part needs multiple siblings or text next to elements, wrap those children in
			a fragment so they become one output. The rule applies locally to component bodies, element
			children, and control-flow branches, so setup can stay close to the markup that uses it
			without turning ordinary template text into JavaScript.
		</p>
		<p class="section-body muted">
			Control-flow bodies are implicit statement containers too:
			<code class="inline-code">@if</code>,<code class="inline-code">@for</code>,
			<code class="inline-code">@switch</code>, and
			<code class="inline-code">@try</code>
			arms all use
			<code class="inline-code">{'{}'}</code>
			blocks.
		</p>
		<p class="section-body muted">
			If you write setup statements and then a bare JSX element inside a normal
			<code class="inline-code">{'{}'}</code>
			function body, the compiler will ask you to add the missing
			<code class="inline-code">@</code>. Plain braces are JavaScript; statement-container braces
			are
			<code class="inline-code">{'@{...}'}</code>.
		</p>
		<pre class="code-block">
			<code innerHTML={TEMPLATE_STRUCTURE_HTML} />
		</pre>
	</section>;
}
`);
		});

		test('formats the getting started: Zed section like Prettier', async () => {
			await expectFormat(
				`export function Page() @{
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
}`,
				`export function Page() @{
	<section class="doc-section" id="zed">
		<h2 class="section-heading">Zed</h2>
		<p class="section-body">
			Install the{' '}
			<a
				class="inline-link"
				href="https://zed.dev/extensions/tsrx"
				target="_blank"
				rel="noopener noreferrer"
			>
				TSRX extension for Zed
			</a>{' '}
			from the Zed Extension Marketplace for syntax highlighting and language-server support. Open
			Zed's Extensions view and search for <code class="inline-code">TSRX</code> to install it.
		</p>
		<p class="section-body">
			The extension uses a project-local <code class="inline-code">@tsrx/language-server</code> when
			available and otherwise downloads its pinned language-server version automatically.
		</p>
	</section>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
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
	</section>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<section class="doc-section" id="zed">
		<h2 class="section-heading">Zed</h2>
		<p class="section-body">
			Install the{' '}
			<a
				class="inline-link"
				href="https://zed.dev/extensions/tsrx"
				target="_blank"
				rel="noopener noreferrer"
			>
				TSRX extension for Zed
			</a>{' '}
			from the Zed Extension Marketplace for syntax highlighting and language-server support. Open
			Zed's Extensions view and search for <code class="inline-code">TSRX</code> to install it.
		</p>
		<p class="section-body">
			The extension uses a project-local <code class="inline-code">@tsrx/language-server</code> when
			available and otherwise downloads its pinned language-server version automatically.
		</p>
	</section>;
}
`);
		});

		test('formats the index: beta notice section like Prettier', async () => {
			await expectFormat(
				`export function Page() @{
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
}`,
				`export function Page() @{
	<aside class="alpha-notice" role="note" aria-label="Beta release notice">
		<span class="alpha-badge">Beta</span>
		<p class="alpha-notice-body">
			TSRX is in active beta development. Feedback on the{' '}
			<a
				class="alpha-notice-link"
				href="https://github.com/tsrx-org/tsrx/issues"
				target="_blank"
				rel="noopener noreferrer"
			>
				issue tracker
			</a>{' '}
			is very welcome.
		</p>
	</aside>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
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
	</aside>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<aside class="alpha-notice" role="note" aria-label="Beta release notice">
		<span class="alpha-badge">Beta</span>
		<p class="alpha-notice-body">
			TSRX is in active beta development. Feedback on the{' '}
			<a
				class="alpha-notice-link"
				href="https://github.com/tsrx-org/tsrx/issues"
				target="_blank"
				rel="noopener noreferrer"
			>
				issue tracker
			</a>{' '}
			is very welcome.
		</p>
	</aside>;
}
`);
		});

		test('keeps the parentheses of a returned template that starts with a comment', async () => {
			await expectFormat(
				`function f() {
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
}`,
				`function f() {
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
}
`,
			);
		});

		test('joins text to the element it touches and fills the lines', async () => {
			await expectFormat(
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
				`export function Page() @{
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
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});

		test('lays out the text after the child with a comment before it in "<div>\\n\\t/* c */\\n\\t<span>\\n\\t\\t<b>1</b>\\n\\t</span> 3\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
		/* c */
		<span>
			<b>1</b>
		</span> 3
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */
		<span>
			<b>1</b>
		</span>{' '}
		3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
		{/* c */}
		<span>
			<b>1</b>
		</span> 3
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}
		<span>
			<b>1</b>
		</span>{' '}
		3
	</div>;
}
`);
		});

		test('lays out the text after the child with a comment before it in "<div>\\n\\t/* a */\\n\\t/* b */\\n\\t<span>\\n\\t\\t<b>1</b>\\n\\t</span> 3\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
		/* a */
		/* b */
		<span>
			<b>1</b>
		</span> 3
	</div>
}`,
				`export function Page() @{
	<div>
		/* a */
		/* b */
		<span>
			<b>1</b>
		</span>{' '}
		3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
		{/* a */}
		{/* b */}
		<span>
			<b>1</b>
		</span> 3
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		{/* b */}
		<span>
			<b>1</b>
		</span>{' '}
		3
	</div>;
}
`);
		});

		test('lays out the text after the child with a comment before it in "<div>\\n\\t/* c */\\n\\t{cond && (\\n\\t\\t<b>\\n\\t\\t\\t<i />\\n\\t\\t</b>\\n\\t)} 3\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
		/* c */
		{cond && (
			<b>
				<i />
			</b>
		)} 3
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */
		{cond && (
			<b>
				<i />
			</b>
		)}{' '}
		3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
		{/* c */}
		{cond && (
			<b>
				<i />
			</b>
		)} 3
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}
		{cond && (
			<b>
				<i />
			</b>
		)}{' '}
		3
	</div>;
}
`);
		});

		test('lays out the text after the child with a comment before it in "<main>\\n\\t{x && (\\n\\t\\t<div>\\n\\t\\t\\t/* c */\\n\\t\\t\\t<span>\\n\\t\\t\\t\\t<b>1</b>\\n\\t\\t\\t</span> 3\\n\\t\\t</div>\\n\\t)}\\n</main>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<main>
		{x && (
			<div>
				/* c */
				<span>
					<b>1</b>
				</span> 3
			</div>
		)}
	</main>
}`,
				`export function Page() @{
	<main>
		{x && (
			<div>
				/* c */
				<span>
					<b>1</b>
				</span>{' '}
				3
			</div>
		)}
	</main>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<main>
		{x && (
			<div>
				{/* c */}
				<span>
					<b>1</b>
				</span> 3
			</div>
		)}
	</main>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<main>
		{x && (
			<div>
				{/* c */}
				<span>
					<b>1</b>
				</span>{' '}
				3
			</div>
		)}
	</main>;
}
`);
		});

		test('lays out the text after the child with a comment before it in "<div>\\n\\t/* c */\\n\\t<i /> 3\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
		/* c */
		<i /> 3
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */
		<i /> 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
		{/* c */}
		<i /> 3
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}
		<i /> 3
	</div>;
}
`);
		});

		test('starts the text after the multi-line child with a comment before it in "export function App() @{\\n  <div> /* c */\\n    <span>\\n      <b>1</b>\\n    </span> 3</div>\\n}" on a line', async () => {
			await expectFormat(
				`export function App() @{
  <div> /* c */
    <span>
      <b>1</b>
    </span> 3</div>
}`,
				`export function App() @{
  <div>
    {" "}
    /* c */
    <span>
      <b>1</b>
    </span>{" "}
    3
  </div>
}
`,
			);
		});

		test('starts the text after the multi-line child with a comment before it in "export function App() @{\\n  <div>\\n    /* c */\\n    <span>\\n      <b>1</b>\\n    </span> 3</div>\\n}" on a line', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    /* c */
    <span>
      <b>1</b>
    </span> 3</div>
}`,
				`export function App() @{
  <div>
    /* c */
    <span>
      <b>1</b>
    </span>{" "}
    3
  </div>
}
`,
			);
		});

		test('starts the text after the multi-line child with a comment before it in "export function App() @{\\n  <div>\\n    // c\\n    <span>\\n      <b>1</b>\\n    </span> 3</div>\\n}" on a line', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    // c
    <span>
      <b>1</b>
    </span> 3</div>
}`,
				`export function App() @{
  <div>
    // c
    <span>
      <b>1</b>
    </span>{" "}
    3
  </div>
}
`,
			);
		});

		test('starts the text after the multi-line child with a comment before it in "const a = <div>\\n  // c\\n  {cond && (\\n    <b>\\n      <i />\\n    </b>\\n  )} 3</div>;" on a line', async () => {
			await expectFormat(
				`const a = <div>
  // c
  {cond && (
    <b>
      <i />
    </b>
  )} 3</div>;`,
				`const a = (
  <div>
    // c
    {cond && (
      <b>
        <i />
      </b>
    )}{" "}
    3
  </div>
);
`,
			);
		});

		test('lays out the comments before the child in "<div>/* a */\\n/* b */\\n<i /> 3</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>/* a */
	/* b */
	<i /> 3</div>
}`,
				`export function Page() @{
	<div>
		/* a */
		/* b */
		<i /> 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>{/* a */}
	{/* b */}
	<i /> 3</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		{/* b */}
		<i /> 3
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */ /* b */\\n\\n<i /> 3</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */ /* b */
	
	<i /> 3</div>
}`,
				`export function Page() @{
	<div>
		/* a */ /* b */
		<i /> 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */} {/* b */}
	
	<i /> 3</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */} {/* b */}
		<i /> 3
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>/* a */\\n<i /> 3</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>/* a */
	<i /> 3</div>
}`,
				`export function Page() @{
	<div>
		/* a */
		<i /> 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>{/* a */}
	<i /> 3</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		<i /> 3
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */ /* b */\\n<i /> 3</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */ /* b */
	<i /> 3</div>
}`,
				`export function Page() @{
	<div>
		/* a */ /* b */
		<i /> 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */} {/* b */}
	<i /> 3</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */} {/* b */}
		<i /> 3
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* c */\\n\\n<b /> text\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* c */
	
	<b /> text
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */
		<b /> text
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* c */}
	
	<b /> text
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}
		<b /> text
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */\\n\\n/* b */\\n<b /> text\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */
	
	/* b */
	<b /> text
	</div>
}`,
				`export function Page() @{
	<div>
		/* a */
		/* b */
		<b /> text
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */}
	
	{/* b */}
	<b /> text
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		{/* b */}
		<b /> text
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n<i />\\n/* c */\\n\\n<b /> text\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	<i />
	/* c */
	
	<b /> text
	</div>
}`,
				`export function Page() @{
	<div>
		<i />
		/* c */
		<b /> text
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	<i />
	{/* c */}
	
	<b /> text
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		<i />
		{/* c */}
		<b /> text
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* c */\\n\\n{x}\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* c */
	
	{x}
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */

		{x}
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* c */}
	
	{x}
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}

		{x}
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */ /* b */\\n{x} text\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */ /* b */
	{x} text
	</div>
}`,
				`export function Page() @{
	<div>
		/* a */ /* b */
		{x} text
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */} {/* b */}
	{x} text
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */} {/* b */}
		{x} text
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* c */ {x}\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* c */ {x}
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */ {x}
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* c */} {x}
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */} {x}
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */\\n/* b */ {x} 3\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */
	/* b */ {x} 3
	</div>
}`,
				`export function Page() @{
	<div>
		/* a */
		/* b */ {x} 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */}
	{/* b */} {x} 3
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		{/* b */} {x} 3
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */ /* b */{x}\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */ /* b */{x}
	</div>
}`,
				`export function Page() @{
	<div>
		/* a */ /* b */
		{x}
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */} {/* b */}{x}
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */} {/* b */}
		{x}
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>/* a */\\n/* b */\\n<i /></div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>/* a */
	/* b */
	<i /></div>
}`,
				`export function Page() @{
	<div>
		/* a */
		/* b */
		<i />
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>{/* a */}
	{/* b */}
	<i /></div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		{/* b */}
		<i />
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* c */\\n\\n<b />\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* c */
	
	<b />
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */

		<b />
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* c */}
	
	<b />
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}

		<b />
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* c */\\n\\n{x} text\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* c */
	
	{x} text
	</div>
}`,
				`export function Page() @{
	<div>
		/* c */
		{x} text
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* c */}
	
	{x} text
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* c */}
		{x} text
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n/* a */\\n/* b */ <i /> 3</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	/* a */
	/* b */ <i /> 3</div>
}`,
				`export function Page() @{
	<div>
		/* a */
		/* b */ <i /> 3
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	{/* a */}
	{/* b */} <i /> 3</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		{/* a */}
		{/* b */} <i /> 3
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<div>\\n<i /> /* a */\\n/* b */\\n<b /> text\\n</div>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<div>
	<i /> /* a */
	/* b */
	<b /> text
	</div>
}`,
				`export function Page() @{
	<div>
		<i /> /* a */
		/* b */
		<b /> text
	</div>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<div>
	<i /> {/* a */}
	{/* b */}
	<b /> text
	</div>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<div>
		<i /> {/* a */}
		{/* b */}
		<b /> text
	</div>;
}
`);
		});

		test('lays out the comments before the child in "<p>/* c */{name}</p>" like TSX', async () => {
			await expectFormat(
				`export function Page() @{
	<p>/* c */{name}</p>
}`,
				`export function Page() @{
	<p>
		/* c */
		{name}
	</p>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
			expect(
				await prettier.format(
					`export function Page() {
	<p>{/* c */}{name}</p>;
}`,
					{ parser: 'typescript', ...{ useTabs: true, singleQuote: true, printWidth: 100 } },
				),
			).toBe(`export function Page() {
	<p>
		{/* c */}
		{name}
	</p>;
}
`);
		});

		test('keeps the line breaks after the comments before the child in "const a = <div>/* a */\\n/* b */\\n<i /> 3</div>;" like TSX', async () => {
			await expectFormat(
				`const a = <div>/* a */
/* b */
<i /> 3</div>;`,
				`const a = (
  <div>
    /* a */
    /* b */
    <i /> 3
  </div>
);
`,
			);
		});

		test('keeps the line breaks after the comments before the child in "const b = <div>\\n/* a */ /* b */\\n\\n<i /> 3</div>;" like TSX', async () => {
			await expectFormat(
				`const b = <div>
/* a */ /* b */

<i /> 3</div>;`,
				`const b = (
  <div>
    /* a */ /* b */
    <i /> 3
  </div>
);
`,
			);
		});

		test('keeps the line breaks after the comments before the child in "export function App() @{ <div>/* a */\\n/* b */\\n<i /> 3</div> }" like TSX', async () => {
			await expectFormat(
				`export function App() @{ <div>/* a */
/* b */
<i /> 3</div> }`,
				`export function App() @{
  <div>
    /* a */
    /* b */
    <i /> 3
  </div>
}
`,
			);
		});

		test('keeps the line breaks after the comments before the child in "const a = (\\n  <div>\\n    // c\\n\\n    <b /> text\\n  </div>\\n);" like TSX', async () => {
			await expectFormat(
				`const a = (
  <div>
    // c

    <b /> text
  </div>
);`,
				`const a = (
  <div>
    // c
    <b /> text
  </div>
);
`,
			);
		});

		test('keeps the line breaks after the comments before the child in "const a = (\\n  <div>\\n    {y}\\n    // c\\n\\n    {z} text\\n  </div>\\n);" like TSX', async () => {
			await expectFormat(
				`const a = (
  <div>
    {y}
    // c

    {z} text
  </div>
);`,
				`const a = (
  <div>
    {y}
    // c
    {z} text
  </div>
);
`,
			);
		});

		test('keeps the line breaks after the comments before the child in "const a = (\\n  <div>\\n    // a\\n    /* b */ {z} text\\n  </div>\\n);" like TSX', async () => {
			await expectFormat(
				`const a = (
  <div>
    // a
    /* b */ {z} text
  </div>
);`,
				`const a = (
  <div>
    // a
    /* b */ {z} text
  </div>
);
`,
			);
		});

		test('keeps the blank line after the comment before the child in "const a = (\\n  <div>\\n    // c\\n\\n    <b />\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const a = (
  <div>
    // c

    <b />
  </div>
);`,
				`const a = (
  <div>
    // c

    <b />
  </div>
);
`,
			);
		});

		test('keeps the blank line after the comment before the child in "const a = (\\n  <div>\\n    {y}\\n    // c\\n\\n    {z}\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const a = (
  <div>
    {y}
    // c

    {z}
  </div>
);`,
				`const a = (
  <div>
    {y}
    // c

    {z}
  </div>
);
`,
			);
		});
	});

	describe('significant spaces between template children survive formatting', () => {
		test('renders the same markup after formatting', async () => {
			await expectFormat(
				`export function Between() @{
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
}`,
				`export function Between() @{
  <div>
    <b>1</b> <b>2</b>
  </div>
}
export function Edges() @{
  <div>
    {" "}
    <b>1</b>{" "}
  </div>
}
export function Text() @{
  <p>
    hello <b>x</b> world
  </p>
}
export function Wrapped() @{
  <p>
    Some text that goes past the print width once it is indented, <b>bold</b>{" "}
    and more text.
  </p>
}
export function TextEdges() @{
  <span> hello </span>
}
export function Lone() @{
  <span> </span>
}
export function Fragment() @{
  <>
    a <b>1</b> b
  </>
}
export function CodeBlock() @{
  <>
    {" "}
    @{
      <b>123</b>
    }{" "}
  </>
}
`,
			);
		});

		test('renders the same markup with comments in text after formatting', async () => {
			await expectFormat(
				`export function EdgeStart() @{
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
}`,
				`export function EdgeStart() @{
  <div>
    /* c */ x<b />
  </div>
}
export function EdgeEnd() @{
  <div>
    <b />x /* c */
  </div>
}
export function BeforeChild() @{
  <div>
    text /* c */
    <b />
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
    Some text that goes past the print width once it is indented /* a comment */
    <b>bold</b>
  </p>
}
export function AfterChild() @{
  <p>
    {"x"}
    /* c */cc
  </p>
}
export function AfterLastChild() @{
  <p>
    {"x"}
    /* c */
  </p>
}
export function LineAfterChild() @{
  <p>
    <b>t</b>
    // c
    c
  </p>
}
export function SpaceBeforeComment() @{
  <p>
    {"a"} // c
    {"b"}
  </p>
}
`,
			);
		});

		test('renders the same markup with text after closing tags after formatting', async () => {
			await expectFormat(
				`export function NestedClose() @{
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
}`,
				`export function NestedClose() @{
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
    /* c */
    <i />
  </div>
}
`,
			);
		});

		test('keeps a non-breaking space that starts a line after formatting', async () => {
			await expectFormat(
				`export function App() @{
  <div> <b>x</b></div>
}`,
				`export function App() @{
  <div>
     <b>x</b>
  </div>
}
`,
			);
		});

		test('renders // that touches text the same after formatting', async () => {
			await expectFormat(
				`export function Links() @{
	<div>see https://example.com/a/long/path and a//b, which are text and wrap like the words around them</div>
}
export function Note() @{
	<div>a word // a comment
	</div>
}
export function Glued() @{
	<div>one /* x */// two three</div>
}`,
				`export function Links() @{
	<div>
		see
		https://example.com/a/long/path
		and a//b,
		which are text
		and wrap like
		the words
		around them
	</div>
}
export function Note() @{
	<div>
		a word{" "}
		// a comment
	</div>
}
export function Glued() @{
	<div>
		one /* x *///
		two three
	</div>
}
`,
				{ useTabs: true, printWidth: 18 },
			);
		});

		test('reads a // comment to the end of its line, a closing tag included', async () => {
			await expect(format(`const a = <div>a //comment </div>;`)).rejects.toThrow(
				"Unclosed tag '<div>'. Expected '</div>' before end of template.",
			);
		});

		test('renders the same markup with a block comment after a {" "}', async () => {
			await expectFormat(
				`export function Glued() @{
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
}`,
				`export function Glued() @{
	<div>x /* c */y</div>
}
export function LineAfter() @{
	<div>x /* c */y</div>
}
export function Spaced() @{
	<div>x /* c */ y</div>
}
`,
				{ useTabs: true, singleQuote: true },
			);
		});

		test('renders website sections the same after formatting', async () => {
			await expectFormat(
				`export function Structure() @{
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
}`,
				`export function Structure() @{
	<section class="doc-section" id="template-structure">
		<h2 class="section-heading">Statement containers</h2>
		<p class="section-body">
			When a template scope mixes TypeScript setup with rendered output, wrap the setup in
			<code class="inline-code">{'@{...}'}</code>. TSRX treats everything before the final
			renderable child as script, then the container must finish with exactly one output node.
		</p>
		<p class="section-body muted">
			That final output can be a JSX element, a JSX fragment, or JSX control flow like{' '}
			<code class="inline-code">{'@if'}</code>, <code class="inline-code">{'@for'}</code>,{' '}
			<code class="inline-code">{'@switch'}</code>, or <code class="inline-code">{'@try'}</code>. It
			cannot be a bare expression container, and no script statements can appear after it.
		</p>
		<p class="section-body muted">
			If the rendered part needs multiple siblings or text next to elements, wrap those children in
			a fragment so they become one output. The rule applies locally to component bodies, element
			children, and control-flow branches, so setup can stay close to the markup that uses it
			without turning ordinary template text into JavaScript.
		</p>
		<p class="section-body muted">
			Control-flow bodies are implicit statement containers too:
			<code class="inline-code">@if</code>,<code class="inline-code">@for</code>,
			<code class="inline-code">@switch</code>, and
			<code class="inline-code">@try</code>
			arms all use
			<code class="inline-code">{'{}'}</code>
			blocks.
		</p>
		<p class="section-body muted">
			If you write setup statements and then a bare JSX element inside a normal
			<code class="inline-code">{'{}'}</code>
			function body, the compiler will ask you to add the missing
			<code class="inline-code">@</code>. Plain braces are JavaScript; statement-container braces
			are
			<code class="inline-code">{'@{...}'}</code>.
		</p>
	</section>
}
export function Zed() @{
	<section class="doc-section" id="zed">
		<h2 class="section-heading">Zed</h2>
		<p class="section-body">
			Install the{' '}
			<a
				class="inline-link"
				href="https://zed.dev/extensions/tsrx"
				target="_blank"
				rel="noopener noreferrer"
			>
				TSRX extension for Zed
			</a>{' '}
			from the Zed Extension Marketplace for syntax highlighting and language-server support. Open
			Zed's Extensions view and search for <code class="inline-code">TSRX</code> to install it.
		</p>
		<p class="section-body">
			The extension uses a project-local <code class="inline-code">@tsrx/language-server</code> when
			available and otherwise downloads its pinned language-server version automatically.
		</p>
	</section>
}
export function Notice() @{
	<aside class="alpha-notice" role="note" aria-label="Beta release notice">
		<span class="alpha-badge">Beta</span>
		<p class="alpha-notice-body">
			TSRX is in active beta development. Feedback on the{' '}
			<a
				class="alpha-notice-link"
				href="https://github.com/tsrx-org/tsrx/issues"
				target="_blank"
				rel="noopener noreferrer"
			>
				issue tracker
			</a>{' '}
			is very welcome.
		</p>
	</aside>
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});

		test('renders template values in parentheses the same', async () => {
			await expectFormat(
				`export function Returned() {
  return @{ const label = 'a'; <div>{label}</div> };
}
export const Arrow = () => (@if (true) { <b>yes</b> } @else { <i>no</i> });
export function Assigned() {
  const view = @switch ('b') { @case 'a': { <i>a</i> } @default: { <b>other</b> } };
  return <p>{view}</p>;
}`,
				`export function Returned() {
  return (
    @{
      const label = "a";
      <div>{label}</div>
    }
  );
}
export const Arrow = () => (
  @if (true) {
    <b>yes</b>
  } @else {
    <i>no</i>
  }
);
export function Assigned() {
  const view = (
    @switch ("b") {
      @case "a": {
        <i>a</i>
      }
      @default: {
        <b>other</b>
      }
    }
  );
  return <p>{view}</p>;
}
`,
			);
		});

		test('keeps a space between children on their line', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    <b>1</b> <b>2</b>
  </div>
}`,
				`export function App() @{
  <div>
    <b>1</b> <b>2</b>
  </div>
}
`,
			);
		});

		test('keeps a lone space', async () => {
			await expectFormat(
				`export function App() @{
  <>
    <> </>
    <span> </span>
    <span>{" "}</span>
    <span>
      {" "}{" "}
    </span>
    <>{" "}{" "}</>
  </>
}`,
				`export function App() @{
  <>
    <> </>
    <span> </span>
    <span> </span>
    <span> </span>
    <> </>
  </>
}
`,
			);
		});

		test('breaks a line at a space as {" "} when the children do not fit', async () => {
			await expectFormat(
				`export function App() @{
  <p>
    Some very long text here that goes past the print width for sure, <b>bold</b> and more.
  </p>
}`,
				`export function App() @{
  <p>
    Some very long text here that goes past the print width for sure,{" "}
    <b>bold</b> and more.
  </p>
}
`,
			);
		});

		test('keeps the spaces around a code block', async () => {
			await expectFormat(
				`let a = <>   @{<b>123</b>}   </>;`,
				`let a = (
  <>
    {" "}
    @{
      <b>123</b>
    }{" "}
  </>
);
`,
			);
		});

		test('fills text across a blank line or an unindented line', async () => {
			await expectFormat(
				`export function App() @{
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
}`,
				`export function App() @{
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
}
`,
			);
		});
	});

	describe('comments in type arguments, type parameters, and case tests stay there', () => {
		test('keeps the comment in the template "function A() @{\\n  @try {\\n    <B />\\n  } @pending {\\n    // loading\\n    <p>{\\"loading\\"}</p>\\n  } @catch (e) {\\n    <p>{\\"error\\"}</p>\\n  }\\n}"', async () => {
			await expectFormat(
				`function A() @{
  @try {
    <B />
  } @pending {
    // loading
    <p>{"loading"}</p>
  } @catch (e) {
    <p>{"error"}</p>
  }
}`,
				`function A() @{
  @try {
    <B />
  } @pending {
    // loading
    <p>{"loading"}</p>
  } @catch (e) {
    <p>{"error"}</p>
  }
}
`,
			);
		});

		test('keeps the comment in the template "function A() @{\\n  @try {\\n    <B />\\n  } @pending {\\n    <p>{\\"loading\\"}</p>\\n    // after loading\\n  } @catch (e) {\\n    <p>{\\"error\\"}</p>\\n  }\\n}"', async () => {
			await expectFormat(
				`function A() @{
  @try {
    <B />
  } @pending {
    <p>{"loading"}</p>
    // after loading
  } @catch (e) {
    <p>{"error"}</p>
  }
}`,
				`function A() @{
  @try {
    <B />
  } @pending {
    <p>{"loading"}</p>
    // after loading
  } @catch (e) {
    <p>{"error"}</p>
  }
}
`,
			);
		});

		test('keeps the comment in the template "function A() @{\\n  @try {\\n    <B />\\n  } @pending {\\n    <p>{\\"loading\\"}</p>\\n  } /* after pending */ @catch (e) {\\n    <p>{\\"error\\"}</p>\\n  }\\n}"', async () => {
			await expectFormat(
				`function A() @{
  @try {
    <B />
  } @pending {
    <p>{"loading"}</p>
  } /* after pending */ @catch (e) {
    <p>{"error"}</p>
  }
}`,
				`function A() @{
  @try {
    <B />
  } @pending {
    <p>{"loading"}</p>
  } /* after pending */ @catch (e) {
    <p>{"error"}</p>
  }
}
`,
			);
		});

		test('keeps the comment in the template "function A(x) @{\\n  @switch (x) {\\n    @case /* c */ 1: {\\n      <p>{\\"one\\"}</p>\\n    }\\n  }\\n}"', async () => {
			await expectFormat(
				`function A(x) @{
  @switch (x) {
    @case /* c */ 1: {
      <p>{"one"}</p>
    }
  }
}`,
				`function A(x) @{
  @switch (x) {
    @case /* c */ 1: {
      <p>{"one"}</p>
    }
  }
}
`,
			);
		});
	});

	describe('statements without semicolons', () => {
		test('guards statements in every statement list', async () => {
			await expectFormat(
				`function run() {
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
}`,
				`function run() {
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
}
`,
				{ semi: false },
			);
		});

		test('guards statements in @switch case bodies', async () => {
			await expectFormat(
				`export function App() @{
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
}`,
				`export function App() @{
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
}
`,
				{ semi: false },
			);
			await expectFormat(
				`export function App() @{
  <>
    @switch (count) {
      @case 1: {
        /a/.test(text);
        const half = count / 2;
        \`x\`.trim();
        (first || second).run();
        <span />
      }
      @default: {
        const next = count;
        \`y\${next}\`.trim();
        <i />
      }
    }
  </>
}`,
				`export function App() @{
  <>
    @switch (count) {
      @case 1: {
        /a/.test(text);
        const half = count / 2;
        \`x\`.trim();
        (first || second).run();
        <span />
      }
      @default: {
        const next = count;
        \`y\${next}\`.trim();
        <i />
      }
    }
  </>
}
`,
			);
			await expectFormat(
				`export function App() @{
  <>
    @switch (count) {
      @case 1: {
        /a/.test(text);
        const half = count / 2;
        \`x\`.trim();
        (first || second).run();
        <span />
      }
      @default: {
        const next = count;
        \`y\${next}\`.trim();
        <i />
      }
    }
  </>
}`,
				`export function App() @{
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
}
`,
				{ semi: false },
			);
		});

		test('starts no guard before a template element after a comment', async () => {
			await expectFormat(
				`export function App() @{
  const x = a
  /* render */ <div />
}
function render() {
  const x = a
  /* render */ <div />
}`,
				`export function App() @{
  const x = a
  /* render */ <div />
}
function render() {
  const x = a
  /* render */ <div />
}
`,
				{ semi: false },
			);
			await expectFormat(
				`export function App() @{
  const x = a;
  /* render */ <div />
}`,
				`export function App() @{
  const x = a
  /* render */ <div />
}
`,
				{ semi: false },
			);
		});

		test('divides after an element and in code block setup statements', async () => {
			await expectFormat(
				`const half = <span /> / 2
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
}`,
				`const half = <span /> / 2
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
}
`,
				{ semi: false },
			);
		});
	});

	describe('lines with only a semicolon', () => {
		test('formats "function App() @{\\n  a();\\n  ;\\n  b();\\n  <div />\\n}" in a code block', async () => {
			await expectFormat(
				`function App() @{
  a();
  ;
  b();
  <div />
}`,
				`function App() @{
  a();
  b();
  <div />
}
`,
			);
		});

		test('formats "function App() @{\\n  a();\\n  ;\\n  <div />\\n}" in a code block', async () => {
			await expectFormat(
				`function App() @{
  a();
  ;
  <div />
}`,
				`function App() @{
  a();
  <div />
}
`,
			);
		});

		test('formats "function App() @{\\n  a();\\n  // c\\n  ;\\n  <div />\\n}" in a code block', async () => {
			await expectFormat(
				`function App() @{
  a();
  // c
  ;
  <div />
}`,
				`function App() @{
  a();
  // c
  <div />
}
`,
			);
		});

		test('formats "function App() @{\\n  <div />\\n  ;\\n  // c\\n}" in a code block', async () => {
			await expectFormat(
				`function App() @{
  <div />
  ;
  // c
}`,
				`function App() @{
  <div />
  // c
}
`,
			);
		});

		test('formats "function App() @{\\n  <div />\\n\\n  // c\\n  ;\\n  // d\\n}" in a code block', async () => {
			await expectFormat(
				`function App() @{
  <div />

  // c
  ;
  // d
}`,
				`function App() @{
  <div />

  // c
  // d
}
`,
			);
		});
	});

	describe('hashbangs', () => {
		test('keeps "#!/usr/bin/env -S node --no-warnings\\n/** Docs */\\nexport function App() @{\\n  <div />\\n}"', async () => {
			await expectFormat(
				`#!/usr/bin/env -S node --no-warnings
/** Docs */
export function App() @{
  <div />
}`,
				`#!/usr/bin/env -S node --no-warnings
/** Docs */
export function App() @{
  <div />
}
`,
			);
		});

		test('keeps the hashbang before empty statements in "#!/usr/bin/env node\\n;\\nexport function App() @{\\n  <div />\\n}"', async () => {
			await expectFormat(
				`#!/usr/bin/env node
;
export function App() @{
  <div />
}`,
				`#!/usr/bin/env node
export function App() @{
  <div />
}
`,
			);
		});
	});

	describe('using declarations', () => {
		test('keeps using and await using declarations', async () => {
			await expectFormat(
				`using moduleHandle = open();

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
}`,
				`using moduleHandle = open();

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
}
`,
			);
		});
	});

	describe('comments in empty bodies', () => {
		test('starts the comments of a code block with no statements on its first line', async () => {
			await expectFormat(
				`function App() @{
  // note
}
const Arrow = () => @{
  /* note */
};
function Two() @{
  // a

  // b
}`,
				`function App() @{
  // note
}
const Arrow = () => @{
  /* note */
};
function Two() @{
  // a
  // b
}
`,
			);
		});
	});

	describe('expression parentheses follow Prettier', () => {
		test('prints the template statement "(@{ <div /> });" without parentheses', async () => {
			await expectFormat(
				`(@{ <div /> });`,
				`@{
  <div />
};
`,
			);
		});

		test('prints the template statement "(@if (a) { <div /> });" without parentheses', async () => {
			await expectFormat(
				`(@if (a) { <div /> });`,
				`@if (a) {
  <div />
};
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@{ <b /> })(x);', async () => {
			await expectFormat(
				`const a = (@{ <b /> })(x);`,
				`const a = (@{
  <b />
})(x);
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@for (const x of xs) { <b /> })(x);', async () => {
			await expectFormat(
				`const a = (@for (const x of xs) { <b /> })(x);`,
				`const a = (@for (const x of xs) {
  <b />
})(x);
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@switch (x) { @case 1: { <b /> } })(x);', async () => {
			await expectFormat(
				`const a = (@switch (x) { @case 1: { <b /> } })(x);`,
				`const a = (@switch (x) {
  @case 1: {
    <b />
  }
})(x);
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@try { <b /> } @catch { <i /> })(x);', async () => {
			await expectFormat(
				`const a = (@try { <b /> } @catch { <i /> })(x);`,
				`const a = (@try {
  <b />
} @catch {
  <i />
})(x);
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = new (@{ <b /> })();', async () => {
			await expectFormat(
				`const a = new (@{ <b /> })();`,
				`const a = new (@{
  <b />
})();
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@{ <b /> }).foo;', async () => {
			await expectFormat(
				`const a = (@{ <b /> }).foo;`,
				`const a = (
  @{
    <b />
  }
).foo;
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@{ <b /> })`t`;', async () => {
			await expectFormat(
				`const a = (@{ <b /> })\`t\`;`,
				`const a = (
  @{
    <b />
  }
)\`t\`;
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@if (x) { <b /> })!;', async () => {
			await expectFormat(
				`const a = (@if (x) { <b /> })!;`,
				`const a = (
  @if (x) {
    <b />
  }
)!;
`,
			);
		});

		test('keeps the parentheses around a TSRX value before a subscript in const a = (@if (x) { <b /> })[0];', async () => {
			await expectFormat(
				`const a = (@if (x) { <b /> })[0];`,
				`const a = (
  @if (x) {
    <b />
  }
)[0];
`,
			);
		});

		test('keeps a TSRX expression after yield', async () => {
			await expectFormat(
				`export function* nodes() { yield @{ <div /> }; yield @if (ok) { <b /> }; }`,
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

		test('keeps a comment after a directive keyword', async () => {
			await expectFormat(
				`function A() @{
  @try /* c */ {
    @if /* d */ (x) {
      <b />
    }
  } @catch (e) {
    <p />
  }
}`,
				`function A() @{
  @try /* c */ {
    @if (/* d */ x) {
      <b />
    }
  } @catch (e) {
    <p />
  }
}
`,
			);
		});

		test('keeps an element bare as a statement of a block', async () => {
			await expectFormat(
				`function C() @{
  if (x) {
    <div />
  }
  <span />
}`,
				`function C() @{
  if (x) {
    <div />
  }
  <span />
}
`,
			);
		});

		test('keeps an element bare as a statement of a case', async () => {
			await expectFormat(
				`function C() @{
  switch (x) {
    case 1:
      <div />
  }
  <span />
}`,
				`function C() @{
  switch (x) {
    case 1:
      <div />
  }
  <span />
}
`,
			);
		});

		test('keeps an element bare as a statement of @for, @empty, @try, @pending, and @catch bodies', async () => {
			await expectFormat(
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
}
`,
			);
		});
	});

	describe('conditional expressions lay out like Prettier', () => {
		test('breaks template values in conditional branches and template children in JSX mode', async () => {
			await expectFormat(
				`export function App({ cond, items }) @{
  const label = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : <span>bbbbbbbbbbbbbbbbbbbbbbbb</span>;
  <div>{cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : <span>bbbbbbbbbbbbbbbbbbbbbbbbbbbbb</span>}</div>
}
const x = cond ? @{ const a = 1; <div>{a}</div> } : null;
const y = cond ? <div /> : @for (const a of b) { <div>{a}</div> };`,
				`export function App({ cond, items }) @{
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
);
`,
			);
		});
	});

	describe('code embedded in template literals formats like Prettier', () => {
		test('formats CSS in template attributes and code blocks like the equivalent TSX', async () => {
			await expectFormat(
				`function StyledApp() @{
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
}`,
				`function StyledApp() @{
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
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});
	});

	describe('member chains break like Prettier', () => {
		test('keeps a component template chain idempotent', async () => {
			await expectFormat(
				`export function List(props) @{
  const visible = props.items.filter((item) => item.includes(props.filter)).map((item) => item.toUpperCase()).slice(0, 10);
  <ul>
    @for (const item of visible) {
      <li>{item.toUpperCase().split("").reverse().join("")}</li>
    }
  </ul>
}`,
				`export function List(props) @{
  const visible = props.items
    .filter((item) => item.includes(props.filter))
    .map((item) => item.toUpperCase())
    .slice(0, 10);
  <ul>
    @for (const item of visible) {
      <li>{item.toUpperCase().split("").reverse().join("")}</li>
    }
  </ul>
}
`,
			);
		});
	});

	describe('comments before else stay before it', () => {
		test('keeps a comment before @else', async () => {
			await expectFormat(
				`export function App(props) @{
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
}`,
				`export function App(props) @{
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
}
`,
			);
		});
	});

	describe('comments between the blocks of a try statement', () => {
		test('formats the template "function A() @{\\n  @try {\\n    <B />\\n  } // c\\n  @pending {\\n    <p>{\\"loading\\"}</p>\\n  } @catch (e) {\\n    <p>{\\"error\\"}</p>\\n  }\\n}" like a try statement', async () => {
			await expectFormat(
				`function A() @{
  @try {
    <B />
  } // c
  @pending {
    <p>{"loading"}</p>
  } @catch (e) {
    <p>{"error"}</p>
  }
}`,
				`function A() @{
  @try {
    <B />
  } @pending {
    // c
    <p>{"loading"}</p>
  } @catch (e) {
    <p>{"error"}</p>
  }
}
`,
			);
		});

		test('formats the template "function A() @{\\n  @try {\\n    <B />\\n  } @pending {\\n    <p>{\\"loading\\"}</p>\\n  }\\n  // c\\n  @catch (e) {\\n    <p>{\\"error\\"}</p>\\n  }\\n}" like a try statement', async () => {
			await expectFormat(
				`function A() @{
  @try {
    <B />
  } @pending {
    <p>{"loading"}</p>
  }
  // c
  @catch (e) {
    <p>{"error"}</p>
  }
}`,
				`function A() @{
  @try {
    <B />
  } @pending {
    <p>{"loading"}</p>
  } @catch (e) {
    // c
    <p>{"error"}</p>
  }
}
`,
			);
		});

		test('formats the template "function A() @{\\n  @try {\\n    <B />\\n  } // c\\n  @catch (e, reset) {\\n  }\\n}" like a try statement', async () => {
			await expectFormat(
				`function A() @{
  @try {
    <B />
  } // c
  @catch (e, reset) {
  }
}`,
				`function A() @{
  @try {
    <B />
  } @catch (e, reset) {
    // c
  }
}
`,
			);
		});

		test('formats the template "function A() @{\\n  @try {\\n    <B />\\n  } @catch (e, reset) // c\\n  {\\n    <p>{\\"error\\"}</p>\\n  }\\n}" like a try statement', async () => {
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
	});

	describe('comments in function bodies stay in the body', () => {
		test('keeps a component body comment out of the parameter list', async () => {
			await expectFormat(
				`function Component(props) @{
  <div>{sum(props.items /* kept */)}</div>
}`,
				`function Component(props) @{
  <div>{sum(props.items /* kept */)}</div>
}
`,
			);
		});
	});

	describe('comments in JSX opening tags and children stay there', () => {
		test('keeps the comment in the shorthand of "const a = <div {name /* c */} />;"', async () => {
			await expectFormat(
				`const a = <div {name /* c */} />;`,
				`const a = <div {name /* c */} />;
`,
			);
		});

		test('keeps the comment in the shorthand of "x = <div {name\\n// c\\n} x=\\"1\\" />;"', async () => {
			await expectFormat(
				`x = <div {name
// c
} x="1" />;`,
				`x = (
  <div
    {
      name
      // c
    }
    x="1"
  />
);
`,
			);
		});

		test('keeps the comment in the shorthand of "x = <div {name\\n/* c */\\n} x=\\"1\\" />;"', async () => {
			await expectFormat(
				`x = <div {name
/* c */
} x="1" />;`,
				`x = (
  <div
    {
      name
      /* c */
    }
    x="1"
  />
);
`,
			);
		});

		test('keeps every comment of nested elements with attributes', async () => {
			await expectFormat(
				`export function App() @{
  <div a={/* a */ x} b={/* b */ y}>
    <span c={/* c */ z}>{/* d */ w}</span>
    {/* e */ v}
  </div>
}`,
				`export function App() @{
  <div a={/* a */ x} b={/* b */ y}>
    <span c={/* c */ z}>{/* d */ w}</span>
    {/* e */ v}
  </div>
}
`,
			);
		});

		test('starts a line comment before the tag name of "function App() {\\n  return (\\n    <\\n      // c\\n      {Tag}\\n    >\\n      test\\n    </{Tag}>\\n  );\\n}" on its own line', async () => {
			await expectFormat(
				`function App() {
  return (
    <
      // c
      {Tag}
    >
      test
    </{Tag}>
  );
}`,
				`function App() {
  return (
    <
      // c
      {Tag}
    >
      test
    </{Tag}>
  );
}
`,
			);
		});

		test('starts a line comment before the tag name of "function App() @{\\n  <\\n    // c\\n    div\\n  >\\n    test\\n  </div>\\n}" on its own line', async () => {
			await expectFormat(
				`function App() @{
  <
    // c
    div
  >
    test
  </div>
}`,
				`function App() @{
  <
    // c
    div
  >
    test
  </div>
}
`,
			);
		});

		test('keeps the comment after the opening tag of "const el = <div>/* c */x</div>;"', async () => {
			await expectFormat(
				`const el = <div>/* c */x</div>;`,
				`const el = <div>/* c */x</div>;
`,
			);
		});

		test('keeps the comment after the opening tag of "const el = <>/* c */ x</>;"', async () => {
			await expectFormat(
				`const el = <>/* c */ x</>;`,
				`const el = <>/* c */ x</>;
`,
			);
		});

		test('keeps the comment after the opening tag of "const el = <div>/* c */ text</div>;"', async () => {
			await expectFormat(
				`const el = <div>/* c */ text</div>;`,
				`const el = <div>/* c */ text</div>;
`,
			);
		});

		test('keeps the comment after the opening tag of "export function App() @{\\n  <div>/* c */x</div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>/* c */x</div>
}`,
				`export function App() @{
  <div>/* c */x</div>
}
`,
			);
		});

		test('keeps the comment after the opening tag of "const el = <p>/* c */{name}</p>;" in the body', async () => {
			await expectFormat(
				`const el = <p>/* c */{name}</p>;`,
				`const el = (
  <p>
    /* c */
    {name}
  </p>
);
`,
			);
		});

		test('keeps the comment after the opening tag of "export function App() @{\\n  <p>// c\\n    text\\n  </p>\\n}" in the body', async () => {
			await expectFormat(
				`export function App() @{
  <p>// c
    text
  </p>
}`,
				`export function App() @{
  <p>
    // c
    text
  </p>
}
`,
			);
		});

		test('keeps the comment after the opening tag of "export function App() @{\\n  <div> // c\\n    <b />\\n  </div>\\n}" in the body', async () => {
			await expectFormat(
				`export function App() @{
  <div> // c
    <b />
  </div>
}`,
				`export function App() @{
  <div>
    {" "}
    // c
    <b />
  </div>
}
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    /* c */\\n    text here\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    /* c */
    text here
  </div>
);`,
				`const el = (
  <div>
    /* c */
    text here
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    // c\\n    text here\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    // c
    text here
  </div>
);`,
				`const el = (
  <div>
    // c
    text here
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    text here\\n    /* c */\\n    more\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    text here
    /* c */
    more
  </div>
);`,
				`const el = (
  <div>
    text here
    /* c */
    more
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    text here\\n    // c\\n    more\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    text here
    // c
    more
  </div>
);`,
				`const el = (
  <div>
    text here
    // c
    more
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    text here /* c */\\n    more\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    text here /* c */
    more
  </div>
);`,
				`const el = (
  <div>
    text here /* c */
    more
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    text here\\n    /* c */ more\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    text here
    /* c */ more
  </div>
);`,
				`const el = (
  <div>
    text here
    /* c */ more
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = <div>text here /* c */ more</div>;"', async () => {
			await expectFormat(
				`const el = <div>text here /* c */ more</div>;`,
				`const el = <div>text here /* c */ more</div>;
`,
			);
		});

		test('keeps the comment in the text of "const el = <div>a/* c */b</div>;"', async () => {
			await expectFormat(
				`const el = <div>a/* c */b</div>;`,
				`const el = <div>a/* c */b</div>;
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    <b />\\n    /* c */ text\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    <b />
    /* c */ text
  </div>
);`,
				`const el = (
  <div>
    <b />
    /* c */ text
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "const el = (\\n  <div>\\n    {value}\\n    // c\\n    text\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    {value}
    // c
    text
  </div>
);`,
				`const el = (
  <div>
    {value}
    // c
    text
  </div>
);
`,
			);
		});

		test('keeps the comment in the text of "export function App() @{\\n  <div>\\n    text here\\n    // c\\n    more\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    text here
    // c
    more
  </div>
}`,
				`export function App() @{
  <div>
    text here
    // c
    more
  </div>
}
`,
			);
		});

		test('keeps the comment in the text of "export function App() @{\\n  <div>\\n    /* a */ text /* b */ more /* c */\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    /* a */ text /* b */ more /* c */
  </div>
}`,
				`export function App() @{
  <div>
    /* a */ text /* b */ more /* c */
  </div>
}
`,
			);
		});

		test('lays out the comment of "export function App() @{\\n  <p>\\n    a\\n    /* b */\\n    c\\n  </p>\\n}" like a {/* c */} child', async () => {
			await expectFormat(
				`export function App() @{
  <p>
    a
    /* b */
    c
  </p>
}`,
				`export function App() @{
  <p>a/* b */c</p>
}
`,
			);
		});

		test('keeps the comment in the text of "const el = <div>\\n  text here\\n  /* c */\\n  more\\n</div>;" in place', async () => {
			await expectFormat(
				`const el = <div>
  text here
  /* c */
  more
</div>;`,
				`const el = (
  <div>
    text here
    /* c */
    more
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    // c\\n    <b />\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    // c
    <b />
  </div>
);`,
				`const el = (
  <div>
    // c
    <b />
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    /* c */ <b />\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    /* c */ <b />
  </div>
);`,
				`const el = (
  <div>
    /* c */ <b />
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    <b /> /* c */ text\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    <b /> /* c */ text
  </div>
);`,
				`const el = (
  <div>
    <b /> /* c */ text
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    {a} // c\\n    text\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    {a} // c
    text
  </div>
);`,
				`const el = (
  <div>
    {a} // c
    text
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    text\\n    <b /> // c\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    text
    <b /> // c
  </div>
);`,
				`const el = (
  <div>
    text
    <b /> // c
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "export function App() @{\\n  <div>\\n    <b />\\n    // c\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    <b />
    // c
  </div>
}`,
				`export function App() @{
  <div>
    <b />
    // c
  </div>
}
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    text\\n    // prettier-ignore\\n    <b   a=\\"1\\" />\\n  </div>\\n);"', async () => {
			await expectFormat(
				`const el = (
  <div>
    text
    // prettier-ignore
    <b   a="1" />
  </div>
);`,
				`const el = (
  <div>
    text
    // prettier-ignore
    <b   a="1" />
  </div>
);
`,
			);
		});

		test('keeps the comment next to a child of "export function App() @{\\n  <div>\\n    text\\n    /* prettier-ignore */\\n    <b   a=\\"1\\" />\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    text
    /* prettier-ignore */
    <b   a="1" />
  </div>
}`,
				`export function App() @{
  <div>
    text
    /* prettier-ignore */
    <b   a="1" />
  </div>
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main>\\n    {x && (\\n      <div>\\n        {\\" \\"}\\n        /* c */ <i />\\n      </div>\\n    )}\\n  </main>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main>
    {x && (
      <div>
        {" "}
        /* c */ <i />
      </div>
    )}
  </main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        {" "}
        /* c */ <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main>\\n    {x && (\\n      <div>\\n        {y}\\n        /* c */\\n        <i />\\n      </div>\\n    )}\\n  </main>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main>
    {x && (
      <div>
        {y}
        /* c */
        <i />
      </div>
    )}
  </main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        {y}
        /* c */
        <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main>\\n    {x && (\\n      <div>\\n        {y}\\n        // c\\n        {z}\\n      </div>\\n    )}\\n  </main>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main>
    {x && (
      <div>
        {y}
        // c
        {z}
      </div>
    )}
  </main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        {y}
        // c
        {z}
      </div>
    )}
  </main>
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main>\\n    {x && (\\n      <div>\\n        /* c */\\n        <i />\\n      </div>\\n    )}\\n  </main>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main>
    {x && (
      <div>
        /* c */
        <i />
      </div>
    )}
  </main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        /* c */
        <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main>\\n    {x && (\\n      <div>\\n        // c\\n        <i />\\n      </div>\\n    )}\\n  </main>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main>
    {x && (
      <div>
        // c
        <i />
      </div>
    )}
  </main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        // c
        <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main\\n    a={\\n      <b>\\n        {\\" \\"}\\n        /* c */ <i />\\n      </b>\\n    }\\n  />\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main
    a={
      <b>
        {" "}
        /* c */ <i />
      </b>
    }
  />
}`,
				`export function App() @{
  <main
    a={
      <b>
        {" "}
        /* c */ <i />
      </b>
    }
  />
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  @switch (x) {\\n    @case 1: {\\n      <p>\\n        {y && (\\n          <div>\\n            {z}\\n            // c\\n            <i />\\n          </div>\\n        )}\\n      </p>\\n    }\\n  }\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  @switch (x) {
    @case 1: {
      <p>
        {y && (
          <div>
            {z}
            // c
            <i />
          </div>
        )}
      </p>
    }
  }
}`,
				`export function App() @{
  @switch (x) {
    @case 1: {
      <p>
        {y && (
          <div>
            {z}
            // c
            <i />
          </div>
        )}
      </p>
    }
  }
}
`,
			);
		});

		test('keeps the comment between the children of the element in a container of "export function App() @{\\n  <main>\\n    {x && (\\n      <div>\\n        {y}\\n        // c\\n      </div>\\n    )}\\n  </main>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <main>
    {x && (
      <div>
        {y}
        // c
      </div>
    )}
  </main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        {y}
        // c
      </div>
    )}
  </main>
}
`,
			);
		});

		test('formats the comment in the element in a container of "export function App() @{\\n  <main>{x && <div> /* c */ <i /></div>}</main>\\n}" like in a template', async () => {
			await expectFormat(
				`export function App() @{
  <main>{x && <div> /* c */ <i /></div>}</main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        {" "}
        /* c */ <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('formats the comment in the element in a container of "export function App() @{\\n  <main a={<b> /* c */ <i /></b>} />\\n}" like in a template', async () => {
			await expectFormat(
				`export function App() @{
  <main a={<b> /* c */ <i /></b>} />
}`,
				`export function App() @{
  <main
    a={
      <b>
        {" "}
        /* c */ <i />
      </b>
    }
  />
}
`,
			);
		});

		test('formats the comment in the element in a container of "export function App() @{\\n  <main>{x && <div>/* c */<i /></div>}</main>\\n}" like in a template', async () => {
			await expectFormat(
				`export function App() @{
  <main>{x && <div>/* c */<i /></div>}</main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        /* c */
        <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('keeps the spaces around the comment after a child of "export function App() @{\\n  <p>\\n    <b>t</b> // c\\n    c\\n  </p>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <p>
    <b>t</b> // c
    c
  </p>
}`,
				`export function App() @{
  <p>
    <b>t</b> // c
    c
  </p>
}
`,
			);
		});

		test('lays out the comment of "const a = <div>{x}/* c */cc</div>;" like a {/* c */} child', async () => {
			await expectFormat(
				`const a = <div>{x}/* c */cc</div>;`,
				`const a = (
  <div>
    {x}
    /* c */cc
  </div>
);
`,
			);
		});

		test('lays out the comment of "const a = <div>{x} /* c */ cc</div>;" like a {/* c */} child', async () => {
			await expectFormat(
				`const a = <div>{x} /* c */ cc</div>;`,
				`const a = (
  <div>
    {x} /* c */ cc
  </div>
);
`,
			);
		});

		test('ends the line after the comment after a child of "const a = <div><b /> /* c */\\n  c</div>;"', async () => {
			await expectFormat(
				`const a = <div><b /> /* c */
  c</div>;`,
				`const a = (
  <div>
    <b /> /* c */c
  </div>
);
`,
			);
		});

		test('ends the line after the comment after a child of "const a = <div>{x}/* c */</div>;"', async () => {
			await expectFormat(
				`const a = <div>{x}/* c */</div>;`,
				`const a = (
  <div>
    {x}
    /* c */
  </div>
);
`,
			);
		});

		test('ends the line after the comment after a child of "const a = <div>{x} /* c */\\n</div>;"', async () => {
			await expectFormat(
				`const a = <div>{x} /* c */
</div>;`,
				`const a = (
  <div>
    {x} /* c */
  </div>
);
`,
			);
		});

		test('keeps the line break of the comment next to a child of "const a = <div><b>t</b>// c\\n  c</div>;"', async () => {
			await expectFormat(
				`const a = <div><b>t</b>// c
  c</div>;`,
				`const a = (
  <div>
    <b>t</b>
    // c
    c
  </div>
);
`,
			);
		});

		test('keeps the line break of the comment next to a child of "const a = <div><b />// c\\n  c</div>;"', async () => {
			await expectFormat(
				`const a = <div><b />// c
  c</div>;`,
				`const a = (
  <div>
    <b />
    // c
    c
  </div>
);
`,
			);
		});

		test('keeps the line break of the comment next to a child of "const a = <div>{a}{\\" \\"}\\n// c\\n{b}</div>;"', async () => {
			await expectFormat(
				`const a = <div>{a}{" "}
// c
{b}</div>;`,
				`const a = (
  <div>
    {a} // c
    {b}
  </div>
);
`,
			);
		});

		test('keeps the line break of the comment next to a child of "const a = <div>{a}{\\" \\"}\\n/* c */\\n<b /></div>;"', async () => {
			await expectFormat(
				`const a = <div>{a}{" "}
/* c */
<b /></div>;`,
				`const a = (
  <div>
    {a} /* c */
    <b />
  </div>
);
`,
			);
		});

		test('keeps the block comment after the {" "} of "const a = <div>{\\" \\"}/* c */y</div>;" in place', async () => {
			await expectFormat(
				`const a = <div>{" "}/* c */y</div>;`,
				`const a = <div> /* c */y</div>;
`,
			);
		});

		test('keeps the block comment after the {" "} of "const a = <div>x{\\" \\"}/* c */\\n  y</div>;" in place', async () => {
			await expectFormat(
				`const a = <div>x{" "}/* c */
  y</div>;`,
				`const a = <div>x /* c */y</div>;
`,
			);
		});

		test('keeps the block comment after the {" "} of "const a = <div>x{\\" \\"} /* c */\\n  y</div>;" in place', async () => {
			await expectFormat(
				`const a = <div>x{" "} /* c */
  y</div>;`,
				`const a = <div>x /* c */y</div>;
`,
			);
		});

		test('keeps the block comment after the {" "} of "export function App() @{\\n  <p>{a}{\\" \\"}/* c */y</p>\\n}" in place', async () => {
			await expectFormat(
				`export function App() @{
  <p>{a}{" "}/* c */y</p>
}`,
				`export function App() @{
  <p>
    {a} /* c */y
  </p>
}
`,
			);
		});

		test('lays out the comment of "const a = <div>x{\\" \\"} /* c */ y</div>;" like a {/* c */} child', async () => {
			await expectFormat(
				`const a = <div>x{" "} /* c */ y</div>;`,
				`const a = <div>x /* c */ y</div>;
`,
			);
		});

		test('lays out the comment of "const a = <div>x{\\" \\"}/* c */ y</div>;" like a {/* c */} child', async () => {
			await expectFormat(
				`const a = <div>x{" "}/* c */ y</div>;`,
				`const a = <div>x /* c */ y</div>;
`,
			);
		});

		test('lays out the comment of "const a = <div>x{\\" \\"} /* c */ /* d */ y</div>;" like a {/* c */} child', async () => {
			await expectFormat(
				`const a = <div>x{" "} /* c */ /* d */ y</div>;`,
				`const a = (
  <div>
    x /* c */ /* d */ y
  </div>
);
`,
			);
		});

		test('prints the block comment after the {" "} of "export function App() @{\\n  <main>{x && <div>{\\" \\"} /* c */</div>}</main>\\n}" against it', async () => {
			await expectFormat(
				`export function App() @{
  <main>{x && <div>{" "} /* c */</div>}</main>
}`,
				`export function App() @{
  <main>{x && <div> /* c */</div>}</main>
}
`,
			);
		});

		test('prints the block comment after the {" "} of "export function App() @{\\n  <main>{x && <div>a{\\" \\"} /* c */</div>}</main>\\n}" against it', async () => {
			await expectFormat(
				`export function App() @{
  <main>{x && <div>a{" "} /* c */</div>}</main>
}`,
				`export function App() @{
  <main>{x && <div>a /* c */</div>}</main>
}
`,
			);
		});

		test('prints the block comment after the {" "} of "export function App() @{\\n  <main>{x && <div>{\\" \\"} /* a */ /* b */<i /></div>}</main>\\n}" against it', async () => {
			await expectFormat(
				`export function App() @{
  <main>{x && <div>{" "} /* a */ /* b */<i /></div>}</main>
}`,
				`export function App() @{
  <main>
    {x && (
      <div>
        {" "}
        /* a */ /* b */
        <i />
      </div>
    )}
  </main>
}
`,
			);
		});

		test('prints the block comment after the {" "} of "export function App() @{\\n  <div>{\\" \\"} /* c */<i /></div>\\n}" against it', async () => {
			await expectFormat(
				`export function App() @{
  <div>{" "} /* c */<i /></div>
}`,
				`export function App() @{
  <div>
    {" "}
    /* c */
    <i />
  </div>
}
`,
			);
		});

		test('keeps the comment in the closing tag of "export function App() @{\\n  <div>x</ /* c */ div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>x</ /* c */ div>
}`,
				`export function App() @{
  <div>x</ /* c */ div>
}
`,
			);
		});

		test('keeps the comments of the dynamic tag of "const a = <{Comp /* c */}>text</{Comp}>;" once', async () => {
			await expectFormat(
				`const a = <{Comp /* c */}>text</{Comp}>;`,
				`const a = <{Comp /* c */}>text</{Comp}>;
`,
			);
		});

		test('keeps the comments of the dynamic tag of "const a = <{/* c */ Comp}>text</{Comp}>;" once', async () => {
			await expectFormat(
				`const a = <{/* c */ Comp}>text</{Comp}>;`,
				`const a = <{/* c */ Comp}>text</{Comp}>;
`,
			);
		});

		test('keeps the comments of the dynamic tag of "const a = <{Comp /* c */}>text</{Comp /* d */}>;" once', async () => {
			await expectFormat(
				`const a = <{Comp /* c */}>text</{Comp /* d */}>;`,
				`const a = <{Comp /* c */}>text</{Comp /* d */}>;
`,
			);
		});

		test('keeps the comments of the dynamic tag of "const a = <{Comp /* c */} x=\\"1\\">text</{Comp}>;" once', async () => {
			await expectFormat(
				`const a = <{Comp /* c */} x="1">text</{Comp}>;`,
				`const a = <{Comp /* c */} x="1">text</{Comp}>;
`,
			);
		});

		test('keeps the comments of the dynamic tag of "const a = <{Comp /* c */}></{Comp}>;" once', async () => {
			await expectFormat(
				`const a = <{Comp /* c */}></{Comp}>;`,
				`const a = <{Comp /* c */}></{Comp}>;
`,
			);
		});

		test('keeps the comments of the dynamic tag of "export function App() @{\\n  <{Comp /* c */}>text</{Comp}>\\n}" once', async () => {
			await expectFormat(
				`export function App() @{
  <{Comp /* c */}>text</{Comp}>
}`,
				`export function App() @{
  <{Comp /* c */}>text</{Comp}>
}
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const a = <{Comp // c\\n}>text</{Comp}>;"', async () => {
			await expectFormat(
				`const a = <{Comp // c
}>text</{Comp}>;`,
				`const a = (
  <{
    Comp // c
  }>
    text
  </{Comp}>
);
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const a = <{// c\\nComp}>text</{Comp}>;"', async () => {
			await expectFormat(
				`const a = <{// c
Comp}>text</{Comp}>;`,
				`const a = (
  <{
    // c
    Comp
  }>
    text
  </{Comp}>
);
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const b = <{Comp\\n// c\\n}>text</{Comp}>;"', async () => {
			await expectFormat(
				`const b = <{Comp
// c
}>text</{Comp}>;`,
				`const b = (
  <{
    Comp
    // c
  }>
    text
  </{Comp}>
);
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const a = <{Comp\\n// c\\n} a=\\"1\\" b=\\"2\\">text</{Comp}>;"', async () => {
			await expectFormat(
				`const a = <{Comp
// c
} a="1" b="2">text</{Comp}>;`,
				`const a = (
  <{
    Comp
    // c
  }
    a="1"
    b="2"
  >
    text
  </{Comp}>
);
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const a = <{Comp}>text</{Comp // d\\n}>;"', async () => {
			await expectFormat(
				`const a = <{Comp}>text</{Comp // d
}>;`,
				`const a = <{Comp}>text</{
    Comp // d
  }>;
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const a = <{Comp}>text</{Comp\\n// d\\n}>;"', async () => {
			await expectFormat(
				`const a = <{Comp}>text</{Comp
// d
}>;`,
				`const a = <{Comp}>text</{
    Comp
    // d
  }>;
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "export function App() @{ <{Comp\\n// c\\n}>text</{Comp}> }"', async () => {
			await expectFormat(
				`export function App() @{ <{Comp
// c
}>text</{Comp}> }`,
				`export function App() @{
  <{
    Comp
    // c
  }>
    text
  </{Comp}>
}
`,
			);
		});

		test('formats the comments in the braces of the dynamic tag of "const a = <{a /* x */ .b}>text</{a /* x */ .b}>;"', async () => {
			await expectFormat(
				`const a = <{a /* x */ .b}>text</{a /* x */ .b}>;`,
				`const a = <{a /* x */.b}>text</{a /* x */.b}>;
`,
			);
		});

		test('keeps the comment in the shorthand attribute of "function A(key) @{\\n  <div {/* c */ key} />\\n}"', async () => {
			await expectFormat(
				`function A(key) @{
  <div {/* c */ key} />
}`,
				`function A(key) @{
  <div {/* c */ key} />
}
`,
			);
		});

		test('keeps the comment in the shorthand attribute of "function A(key) @{\\n  <div {key /* c */} />\\n}"', async () => {
			await expectFormat(
				`function A(key) @{
  <div {key /* c */} />
}`,
				`function A(key) @{
  <div {key /* c */} />
}
`,
			);
		});

		test('keeps the comment in the shorthand attribute of "function A(key) @{\\n  <div\\n    {\\n      // c\\n      key\\n    }\\n  />\\n}"', async () => {
			await expectFormat(
				`function A(key) @{
  <div
    {
      // c
      key
    }
  />
}`,
				`function A(key) @{
  <div
    {
      // c
      key
    }
  />
}
`,
			);
		});

		test('keeps the comment in the shorthand attribute of "const el = <div {key /* c */} title=\\"x\\" />;"', async () => {
			await expectFormat(
				`const el = <div {key /* c */} title="x" />;`,
				`const el = <div {key /* c */} title="x" />;
`,
			);
		});

		test('keeps the comment in the shorthand attribute of "const el = <div a=\\"1\\" {/* c */ key} b=\\"2\\" />;"', async () => {
			await expectFormat(
				`const el = <div a="1" {/* c */ key} b="2" />;`,
				`const el = <div a="1" {/* c */ key} b="2" />;
`,
			);
		});

		test('keeps the comment in the shorthand attribute of "const el = <div {key} />;"', async () => {
			await expectFormat(
				`const el = <div {key} />;`,
				`const el = <div {key} />;
`,
			);
		});

		test('breaks the shorthand attribute of "function A(key) @{\\n  <div {\\n    // c\\n    key} />\\n}" around its line comment', async () => {
			await expectFormat(
				`function A(key) @{
  <div {
    // c
    key} />
}`,
				`function A(key) @{
  <div
    {
      // c
      key
    }
  />
}
`,
			);
		});

		test('keeps the comment before the value of "export function App() @{\\n  <div attr=/* c */\\"foo\\">text</div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div attr=/* c */"foo">text</div>
}`,
				`export function App() @{
  <div attr=/* c */ "foo">text</div>
}
`,
			);
		});

		test('keeps the comment before the argument of the spread in "export function App(props) @{\\n  <div {.../* prettier-ignore */props} />\\n}"', async () => {
			await expectFormat(
				`export function App(props) @{
  <div {.../* prettier-ignore */props} />
}`,
				`export function App(props) @{
  <div {/* prettier-ignore */ ...props} />
}
`,
			);
		});

		test('keeps the comment after the argument of the spread in "export function App(props) @{\\n  <div {...props\\n  // c\\n  } class=\\"x\\">text</div>\\n}"', async () => {
			await expectFormat(
				`export function App(props) @{
  <div {...props
  // c
  } class="x">text</div>
}`,
				`export function App(props) @{
  <div
    {
      ...props
      // c
    }
    class="x"
  >
    text
  </div>
}
`,
			);
		});

		test('keeps the comment after the expression of the braces in "export function App() @{\\n  <div>\\n    {a}\\n    {b\\n    // c\\n    }\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    {a}
    {b
    // c
    }
  </div>
}`,
				`export function App() @{
  <div>
    {a}
    {
      b
      // c
    }
  </div>
}
`,
			);
		});

		test('keeps the comment after the expression of the braces in "export function App() @{ <div a={x\\n/* c */} b={y} /> }"', async () => {
			await expectFormat(
				`export function App() @{ <div a={x
/* c */} b={y} /> }`,
				`export function App() @{
  <div
    a={
      x
      /* c */
    }
    b={y}
  />
}
`,
			);
		});

		test('keeps the comment after the expression of the braces in "export function App() @{\\n  const a = 1;\\n  <div>\\n    text {a\\n    // g\\n    } more\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  const a = 1;
  <div>
    text {a
    // g
    } more
  </div>
}`,
				`export function App() @{
  const a = 1;
  <div>
    text{" "}
    {
      a
      // g
    }{" "}
    more
  </div>
}
`,
			);
		});

		test('formats the comment after the expression of "e = <div>{a}\\n// g\\n</div>;" like Prettier', async () => {
			await expectFormat(
				`e = <div>{a}
// g
</div>;`,
				`e = (
  <div>
    {a}
    // g
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "export function App() @{ <div>{\\n// only\\n}</div> }" like Prettier', async () => {
			await expectFormat(
				`export function App() @{ <div>{
// only
}</div> }`,
				`export function App() @{
  <div>
    {
      // only
    }
  </div>
}
`,
			);
		});

		test('formats the comments alone in the braces of "export function App() @{\\n  @if (x) { <div a={// a\\n  }>{// b\\n  }</div> }\\n}" like Prettier', async () => {
			await expectFormat(
				`export function App() @{
  @if (x) { <div a={// a
  }>{// b
  }</div> }
}`,
				`export function App() @{
  @if (x) {
    <div
      a={
        // a
      }
    >
      {
        // b
      }
    </div>
  }
}
`,
			);
		});

		test('keeps the block comment alone in the braces of "export function App() @{\\n  <div>{/* a */}</div>\\n}"', async () => {
			await expectFormat(
				`export function App() @{
  <div>{/* a */}</div>
}`,
				`export function App() @{
  <div>{/* a */}</div>
}
`,
			);
		});
	});

	describe('JSX spread children', () => {
		test('keeps "export function App({ items }: { items: any[] }) @{\\n  <div>{...items}</div>\\n}"', async () => {
			await expectFormat(
				`export function App({ items }: { items: any[] }) @{
  <div>{...items}</div>
}`,
				`export function App({ items }: { items: any[] }) @{
  <div>{...items}</div>
}
`,
			);
		});

		test('keeps "export function App({ items }: { items: any[] }) @{\\n  <div>\\n    {...items}\\n    <span />\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App({ items }: { items: any[] }) @{
  <div>
    {...items}
    <span />
  </div>
}`,
				`export function App({ items }: { items: any[] }) @{
  <div>
    {...items}
    <span />
  </div>
}
`,
			);
		});

		test('keeps "export function App({ items }: { items: any[] }) @{\\n  <>{...items}</>\\n}"', async () => {
			await expectFormat(
				`export function App({ items }: { items: any[] }) @{
  <>{...items}</>
}`,
				`export function App({ items }: { items: any[] }) @{
  <>{...items}</>
}
`,
			);
		});

		test('keeps "export function App({ items }: { items: any[] }) @{\\n  <div>\\n    // before\\n    {...items}\\n  </div>\\n}"', async () => {
			await expectFormat(
				`export function App({ items }: { items: any[] }) @{
  <div>
    // before
    {...items}
  </div>
}`,
				`export function App({ items }: { items: any[] }) @{
  <div>
    // before
    {...items}
  </div>
}
`,
			);
		});

		test('formats "export function App(props) @{\\n  <div>{...props\\n  // c\\n  }</div>\\n}" like Prettier', async () => {
			await expectFormat(
				`export function App(props) @{
  <div>{...props
  // c
  }</div>
}`,
				`export function App(props) @{
  <div>
    {
      ...props
      // c
    }
  </div>
}
`,
			);
		});
	});

	describe('block comments that share a line', () => {
		test('keeps the touching JSDoc comments of "export function App() @{\\n  <div>\\n    {/**\\n      * x\\n      *//**\\n      * y\\n      */}\\n  </div>\\n}" together', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    {/**
      * x
      *//**
      * y
      */}
  </div>
}`,
				`export function App() @{
  <div>
    {/**
     * x
     *//**
     * y
     */}
  </div>
}
`,
			);
		});
	});

	describe('multi-line block comments keep their indentation', () => {
		test('reindents a comment in a template expression container', async () => {
			await expectFormat(
				`export function App() @{
  <div>
    {/*
      * inside
      */}
  </div>
}`,
				`export function App() @{
  <div>
    {/*
     * inside
     */}
  </div>
}
`,
			);
		});
	});

	describe('elements print comments that break the line inside their parentheses', () => {
		test('keeps "function g() {\\n  return (\\n    // note\\n    <div>\\n      @if (x) {\\n        <a />\\n      }\\n    </div>\\n  );\\n}"', async () => {
			await expectFormat(
				`function g() {
  return (
    // note
    <div>
      @if (x) {
        <a />
      }
    </div>
  );
}`,
				`function g() {
  return (
    // note
    <div>
      @if (x) {
        <a />
      }
    </div>
  );
}
`,
			);
		});

		test('keeps the comment after the arrow body inside the parentheses in "function C() @{\\n  const f = () => (\\n    @if (a) {\\n      <Note />\\n    }\\n    // note\\n  );\\n  <div />\\n}"', async () => {
			await expectFormat(
				`function C() @{
  const f = () => (
    @if (a) {
      <Note />
    }
    // note
  );
  <div />
}`,
				`function C() @{
  const f = () => (
    @if (a) {
      <Note />
    }
    // note
  );
  <div />
}
`,
			);
		});

		test('prints "function C() @{\\n  const a = 1;\\n  <>\\n    @if (a) {\\n      // note\\n      <a />\\n    }\\n    // note\\n    <b />\\n  </>\\n}" without parentheses of its own', async () => {
			await expectFormat(
				`function C() @{
  const a = 1;
  <>
    @if (a) {
      // note
      <a />
    }
    // note
    <b />
  </>
}`,
				`function C() @{
  const a = 1;
  <>
    @if (a) {
      // note
      <a />
    }
    // note
    <b />
  </>
}
`,
			);
		});
	});

	describe('labeled statements', () => {
		test('keeps a labeled loop in a component body', async () => {
			await expectFormat(
				`function Grid({ rows }) @{
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
}`,
				`function Grid({ rows }) @{
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
}
`,
			);
		});
	});

	describe('arrow function chains and bodies follow Prettier', () => {
		test('breaks after => in a JSX attribute and puts the closing brace on its own line', async () => {
			await expectFormat(
				`function App(props) @{
  <button onClick={() => doSomethingWithAVeryLongName(props.value, props.otherValue, more)}>{'Hi'}</button>
}`,
				`function App(props) @{
  <button
    onClick={() =>
      doSomethingWithAVeryLongName(props.value, props.otherValue, more)
    }
  >
    {"Hi"}
  </button>
}
`,
			);
		});
	});

	describe('comments in static blocks, namespaces, and code blocks', () => {
		test('keeps a block comment with the render output on its line', async () => {
			await expectFormat(
				`export function App() @{
  const a = 1; /* the output */ <div />
}`,
				`export function App() @{
  const a = 1;
  /* the output */ <div />
}
`,
			);
		});
	});

	describe('scoped <style> blocks with apply', () => {
		test('formats a body-less <style apply={theme} /> inside a fragment', async () => {
			await expectFormat(
				`export function App(){return <><style apply={theme} /><div>{"hi"}</div></>}`,
				`export function App() {
  return (
    <>
      <style apply={theme} />
      <div>{"hi"}</div>
    </>
  );
}
`,
			);
		});

		test('formats a fragment holding <style apply={theme} /> and the output node in a @{} body', async () => {
			await expectFormat(
				`export function App()@{<><style apply={theme} /><div>{"hi"}</div></>}`,
				`export function App() @{
  <>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('does not expand a body-less block into <style></style>', async () => {
			await expectFormat(
				`export function Only()@{<style apply={theme} />}`,
				`export function Only() @{
  <style apply={theme} />
}
`,
			);
		});

		test('keeps an explicitly empty <style apply={theme}></style> as authored', async () => {
			await expectFormat(
				`export function App() @{
  <>
    <style apply={theme}></style>
    <div>{"hi"}</div>
  </>
}`,
				`export function App() @{
  <>
    <style apply={theme}></style>
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('formats <style apply={[a, b]}> with a CSS body', async () => {
			await expectFormat(
				`export function App()@{<><style apply={[a,b]}>div{color:red}</style><div>{"hi"}</div></>}`,
				`export function App() @{
  <>
    <style apply={[a, b]}>
      div {
        color: red;
      }
    </style>
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('breaks a long apply list across lines like any other attribute', async () => {
			await expectFormat(
				`export function App()@{<><style apply={[someVeryLongThemeName, anotherVeryLongThemeName, yetAnotherVeryLongThemeName]} /><div>{"hi"}</div></>}`,
				`export function App() @{
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
}
`,
			);
		});

		test('preserves other attributes such as ref alongside apply', async () => {
			await expectFormat(
				`export function App() @{
  <>
    <style ref={x} apply={theme} />
    <div>{"hi"}</div>
  </>
}`,
				`export function App() @{
  <>
    <style ref={x} apply={theme} />
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('formats multiple <style> blocks in one fragment of a @{} body', async () => {
			await expectFormat(
				`export function App()@{<><style>div{color:red}</style><style apply={theme} /><div>{"hi"}</div></>}`,
				`export function App() @{
  <>
    <style>
      div {
        color: red;
      }
    </style>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('formats multiple <style> blocks in one fragment', async () => {
			await expectFormat(
				`export function App(){return <><style apply={a} /><style apply={b}>p{margin:0}</style><p>{"x"}</p></>}`,
				`export function App() {
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
}
`,
			);
		});

		test('preserves authored blank lines between style blocks and their siblings', async () => {
			await expectFormat(
				`export function App()@{<>
<style apply={theme} />

<style>div{color:red}</style>


<div>{"hi"}</div></>}`,
				`export function App() @{
  <>
    <style apply={theme} />

    <style>
      div {
        color: red;
      }
    </style>

    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('keeps a blank line between setup statements and the fragment holding a style block', async () => {
			await expectFormat(
				`export function App() @{
  const x = 1;

  <>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}`,
				`export function App() @{
  const x = 1;

  <>
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('keeps a leading comment on a style block', async () => {
			await expectFormat(
				`export function App() @{
  <>
    // theme
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}`,
				`export function App() @{
  <>
    // theme
    <style apply={theme} />
    <div>{"hi"}</div>
  </>
}
`,
			);
		});

		test('formats a style block inside a fragment of a nested @{} block', async () => {
			await expectFormat(
				`export function App()@{<div>@{<><style apply={inner} /><span>{"x"}</span></>}</div>}`,
				`export function App() @{
  <div>@{
    <>
      <style apply={inner} />
      <span>{"x"}</span>
    </>
  }</div>
}
`,
			);
		});

		test('formats style blocks in fragments of @if and @else bodies', async () => {
			await expectFormat(
				`export function App()@{<div>@if(cond){<><style apply={a} /><span>{"x"}</span></>}@else{<><style apply={b} /><em>{"y"}</em></>}</div>}`,
				`export function App() @{
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
}
`,
			);
		});

		test('formats style blocks in fragments of @for bodies', async () => {
			await expectFormat(
				`export function App()@{<div>@for(const item of items){<><style apply={a} /><span>{item}</span></>}</div>}`,
				`export function App() @{
  <div>
    @for (const item of items) {
      <>
        <style apply={a} />
        <span>{item}</span>
      </>
    }
  </div>
}
`,
			);
		});

		test('formats style blocks in fragments of @switch case bodies', async () => {
			await expectFormat(
				`export function App()@{<div>@switch(v){@case 1: {<><style apply={a} /><span>{"x"}</span></>}@default: {<><style apply={b} /><em>{"y"}</em></>}}</div>}`,
				`export function App() @{
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
}
`,
			);
		});

		test('formats style blocks in fragments of @try and @catch bodies', async () => {
			await expectFormat(
				`export function App()@{<div>@try{<><style apply={a} /><span>{"x"}</span></>}@catch(e){<><style apply={b} /><em>{"err"}</em></>}</div>}`,
				`export function App() @{
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
}
`,
			);
		});

		test('formats a module-scope body-less bundle export', async () => {
			await expectFormat(
				`export const bundle = <style apply={[a,b]} />;`,
				`export const bundle = <style apply={[a, b]} />;
`,
			);
		});
	});

	describe('text keeps its characters as written', () => {
		test('keeps the text of a `>` in an element in a container', async () => {
			await expectFormat(
				`export function App() @{
  <main>{c && <b>a > b</b>}</main>
}
`,
				`export function App() @{
  <main>{c && <b>a > b</b>}</main>
}
`,
			);
		});

		test('keeps the text of a `>` after a child container', async () => {
			await expectFormat(
				`export function App() @{
  <main>{c && <b>{y} a > b</b>}</main>
}
`,
				`export function App() @{
  <main>{c && <b>{y} a > b</b>}</main>
}
`,
			);
		});

		test('keeps the text of an arrow in an element in a container', async () => {
			await expectFormat(
				`export function App() @{
  <main>{c && <b>a => b</b>}</main>
}
`,
				`export function App() @{
  <main>{c && <b>a => b</b>}</main>
}
`,
			);
		});

		test("keeps the text of references in a spread attribute's argument", async () => {
			await expectFormat(
				`export function App() @{
  <div {...{ title: <b>&#123;x&#125; &amp;lt; &gt;</b> }} />
}
`,
				`export function App() @{
  <div {...{ title: <b>&#123;x&#125; &amp;lt; &gt;</b> }} />
}
`,
			);
		});

		test('keeps the text of references in an unbraced attribute value in a container', async () => {
			await expectFormat(
				`export function App() @{
  <main>{c && <div title=<b>&#123;x&#125; &amp;lt; &gt;</b> />}</main>
}
`,
				`export function App() @{
  <main>{c && <div title=<b>&#123;x&#125; &amp;lt; &gt;</b> />}</main>
}
`,
			);
		});

		test("keeps the text of a `>` in a spread attribute's argument", async () => {
			await expectFormat(
				`export function App() @{
  <div {...{ title: <b>a > b</b> }} />
}
`,
				`export function App() @{
  <div {...{ title: <b>a > b</b> }} />
}
`,
			);
		});

		test('keeps the text of a `>` first in an unbraced attribute value in a container', async () => {
			await expectFormat(
				`export function App() @{
  <main>{c && <div title=<b>> b &#123;x&#125;</b> />}</main>
}
`,
				`export function App() @{
  <main>{c && <div title=<b>> b &#123;x&#125;</b> />}</main>
}
`,
			);
		});

		test('keeps the text of references and a comment in template text', async () => {
			await expectFormat(
				`export function App() @{
  <p>a &amp; b /* c */ &#123;x&#125;</p>
}
`,
				`export function App() @{
  <p>a &amp; b /* c */ &#123;x&#125;</p>
}
`,
			);
		});
	});
});
