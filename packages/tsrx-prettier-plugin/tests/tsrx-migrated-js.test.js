// Tests of plain JavaScript and TypeScript migrated from
// `@tsrx/prettier-plugin`'s suite (#852, Phase 2): the old tests without TSRX
// syntax that this plugin passes, less inputs the imported Prettier tests
// already have. They cover the TSRX parser and the tree it gives Prettier
// (comments, decorators, types, parentheses), which Prettier's own tests don't
// run through. Where Prettier's `typescript` parser gives the same output, the
// test checks that too; where Prettier's own output changes on a second format
// (a Prettier bug), only the first format is checked.

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

/**
 * `expectFormat`, and Prettier's `typescript` parser prints the same.
 * @param {string} input
 * @param {string} expected
 * @param {prettier.Options} [options]
 */
async function expectPrettierFormat(input, expected, options) {
	await expectFormat(input, expected, options);
	expect(await prettier.format(input, { ...options, parser: 'typescript' })).toBe(expected);
}

/**
 * Formatting `input` gives `expected`, which Prettier itself doesn't keep on a
 * second format (a Prettier bug, #852).
 * @param {string} input
 * @param {string} expected
 * @param {prettier.Options} [options]
 */
async function expectFirstFormat(input, expected, options) {
	expect(await format(input, options)).toBe(expected);
}

/**
 * `expectFirstFormat`, and Prettier's `typescript` parser prints the same.
 * @param {string} input
 * @param {string} expected
 * @param {prettier.Options} [options]
 */
async function expectFirstPrettierFormat(input, expected, options) {
	await expectFirstFormat(input, expected, options);
	expect(await prettier.format(input, { ...options, parser: 'typescript' })).toBe(expected);
}

describe('migrated from @tsrx/prettier-plugin: JavaScript and TypeScript', () => {
	test('formats functions that return native elements', async () => {
		await expectPrettierFormat(
			`export function App(){return <div id="app">{"Hello"}</div>}`,
			`export function App() {
  return <div id="app">{"Hello"}</div>;
}
`,
		);
	});

	test('preserves fragment shorthand for simple returned TSRX expressions', async () => {
		await expectPrettierFormat(
			`const App=()=> <><span>{"Ready"}</span></>;`,
			`const App = () => (
  <>
    <span>{"Ready"}</span>
  </>
);
`,
		);
	});

	test('keeps native fragments expression based', async () => {
		await expectPrettierFormat(
			`function App(){return <><div>Hello world</div>{value}</>}`,
			`function App() {
  return (
    <>
      <div>Hello world</div>
      {value}
    </>
  );
}
`,
		);
	});

	test('formats setup statements before the TSRX return', async () => {
		await expectPrettierFormat(
			`function Counter(){let count=track(0);const increment=()=>count++;return <button onClick={increment}>{count}</button>}`,
			`function Counter() {
  let count = track(0);
  const increment = () => count++;
  return <button onClick={increment}>{count}</button>;
}
`,
		);
	});

	test('keeps single-line text and expression children inline when they fit', async () => {
		await expectPrettierFormat(
			`export function App() {
  let [count] = track(0);
  return <div>
    <p>Count: {count}</p>
    <p>Count: {count}</p>
    <button onClick={() => count++}>Increment</button>
  </div>;
}`,
			`export function App() {
  let [count] = track(0);
  return (
    <div>
      <p>Count: {count}</p>
      <p>Count: {count}</p>
      <button onClick={() => count++}>Increment</button>
    </div>
  );
}
`,
		);
	});

	test('preserves inline text spaces around expression children', async () => {
		await expectPrettierFormat(
			`function Test(){return <div><p class="status">Visible: {String(visible)}</p><p>{name} is visible</p><p>Hello {name}!</p></div>}`,
			`function Test() {
  return (
    <div>
      <p class="status">Visible: {String(visible)}</p>
      <p>{name} is visible</p>
      <p>Hello {name}!</p>
    </div>
  );
}
`,
		);
	});

	test('keeps expression children glued across whitespace-free text', async () => {
		await expectPrettierFormat(
			`function Test() {
  return <a href={x}>
    {state.owner}/{state.repoName}
    <ExternalLink className="w-3 h-3" />
  </a>;
}`,
			`function Test() {
  return (
    <a href={x}>
      {state.owner}/{state.repoName}
      <ExternalLink className="w-3 h-3" />
    </a>
  );
}
`,
		);
	});

	test('keeps expression siblings glued across multi-word text', async () => {
		await expectPrettierFormat(
			`function Test() {
  return <div>
    {a}some words here{b}
    <Foo />
  </div>;
}`,
			`function Test() {
  return (
    <div>
      {a}some words here{b}
      <Foo />
    </div>
  );
}
`,
		);
	});

	test('keeps space-separated children on one line and directly adjacent expressions on their own lines', async () => {
		await expectPrettierFormat(
			`function Test() {
  return <div>
    {a} / {b}
    {c}{d}
    <Foo />
  </div>;
}`,
			`function Test() {
  return (
    <div>
      {a} / {b}
      {c}
      {d}
      <Foo />
    </div>
  );
}
`,
		);
	});

	test('keeps fragment expression children glued across whitespace-free text', async () => {
		await expectPrettierFormat(
			`function Test() {
  return <>
    {state.owner}/{state.repoName}
    <Foo />
  </>;
}`,
			`function Test() {
  return (
    <>
      {state.owner}/{state.repoName}
      <Foo />
    </>
  );
}
`,
		);
	});

	test('formats text line breaks properly', async () => {
		await expectPrettierFormat(
			`function Test() {
  return <div>
    <p class="status">Visible:

      {String(visible)}</p>
    <p>{name}

      is visible</p>
    <p>Hello {name}!</p>
  </div>;
}`,
			`function Test() {
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
}
`,
		);
	});

	test('preserves multiline text and expression children', async () => {
		await expectPrettierFormat(
			`export function App() {
  let [count] = track(0);
  return <div>
    <p>
      "Count: "
      {count}
    </p>
  </div>;
}`,
			`export function App() {
  let [count] = track(0);
  return (
    <div>
      <p>"Count: "{count}</p>
    </div>
  );
}
`,
		);
	});

	test('formats async component functions that await before returning TSRX', async () => {
		await expectPrettierFormat(
			`export async function App(){const data=await fetchData();return <pre>{data}</pre>}`,
			`export async function App() {
  const data = await fetchData();
  return <pre>{data}</pre>;
}
`,
		);
	});

	test('formats object methods that return TSRX', async () => {
		await expectPrettierFormat(
			`const UI={Button({children}:{children:any}){return <button>{children}</button>}};`,
			`const UI = {
  Button({ children }: { children: any }) {
    return <button>{children}</button>;
  },
};
`,
		);
	});

	test('formats generic function components and generic tags', async () => {
		await expectPrettierFormat(
			`function Box<T>({value}:{value:T}){return <div>{value}</div>}function App(){return <Box<string> value={"hello"}/>}`,
			`function Box<T>({ value }: { value: T }) {
  return <div>{value}</div>;
}
function App() {
  return <Box<string> value={"hello"} />;
}
`,
		);
	});

	test('formats raw HTML props inside native elements', async () => {
		await expectPrettierFormat(
			`function App(){return <article innerHTML={source}/>}`,
			`function App() {
  return <article innerHTML={source} />;
}
`,
		);
	});

	test('keeps TypeScript assertion expressions parenthesized before non-null assertions', async () => {
		await expectPrettierFormat(
			`function App(){return <div>{(child("value") as any)!}{(child("ok") satisfies any)!}</div>}`,
			`function App() {
  return (
    <div>
      {(child("value") as any)!}
      {(child("ok") satisfies any)!}
    </div>
  );
}
`,
		);
	});

	test('formats construct signatures inside chained type assertions', async () => {
		await expectPrettierFormat(
			`const Constructed = function Constructed(label: string) {
  return child(label);
} as unknown as {
  new (label: string): ReturnType<typeof child>;
};`,
			`const Constructed = function Constructed(label: string) {
  return child(label);
} as unknown as {
  new (label: string): ReturnType<typeof child>;
};
`,
		);
	});

	test('formats returned TSRX fragments', async () => {
		await expectPrettierFormat(
			`function App() { return <> <div /> </>; }`,
			`function App() {
  return (
    <>
      {" "}
      <div />{" "}
    </>
  );
}
`,
		);
	});

	test('formats a multiline parenthesized self-closing expression', async () => {
		await expectPrettierFormat(
			`const value = (
  <Item />
);`,
			`const value = <Item />;
`,
		);
	});

	test('formats a return ternary from a self-closing element to a fragment', async () => {
		await expectPrettierFormat(
			`function ElementToFragment(condition) {
  return condition ? (
    <Item />
  ) : (
    <>
      <Item />
    </>
  );
}`,
			`function ElementToFragment(condition) {
  return condition ? (
    <Item />
  ) : (
    <>
      <Item />
    </>
  );
}
`,
		);
	});

	test('formats a return ternary from a self-closing element to an array', async () => {
		await expectPrettierFormat(
			`function ElementToArray(condition) {
  return condition ? (
    <Item />
  ) : (
    [<Item />]
  );
}`,
			`function ElementToArray(condition) {
  return condition ? <Item /> : [<Item />];
}
`,
		);
	});

	test('should format a simple function', async () => {
		await expectFormat(
			`export function Test(){let count=0;<div>{"Hello"}</div>}`,
			`export function Test() {
  let count = 0;
  <div>{'Hello'}</div>
}
`,
			{ singleQuote: true },
		);
	});

	test('keeps ordinary single-expression blocks expanded', async () => {
		await expectPrettierFormat(
			`function Test(){ {value} }`,
			`function Test() {
  {
    value;
  }
}
`,
		);
	});

	test('should keep sibling children in tsrx expression fragments on separate lines', async () => {
		await expectPrettierFormat(
			`function Test(p1,p2){return <><div>Hello</div><div>{p1}</div><div>{p2}</div></>}`,
			`function Test(p1, p2) {
  return (
    <>
      <div>Hello</div>
      <div>{p1}</div>
      <div>{p2}</div>
    </>
  );
}
`,
		);
	});

	test('keeps fitting single-child fragments inline and expands non-fitting single-child fragments', async () => {
		await expectPrettierFormat(
			`function Test(){const short=<><span>Ready</span></>;const long=<><ReallyLongComponentName first={alpha} second={beta} third={gamma}/></>;}`,
			`function Test() {
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
}
`,
			{ printWidth: 60 },
		);
	});

	test('expands multi-child fragments while keeping fitting openers on the first line', async () => {
		await expectPrettierFormat(
			`function Test(){const short=<><div>A</div><div>B</div></>;const thisNameIsRidiculouslyLongEnoughToMissThePrintWidth=<><div>A</div><div>B</div></>;}`,
			`function Test() {
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
}
`,
			{ printWidth: 60 },
		);
	});
	describe('prettier-ignore', () => {
		test('preserves a statement verbatim after a line directive', async () => {
			await expectPrettierFormat(
				`export function App() {
	// prettier-ignore
	const matrix = [1,0,0,
		0,1,0,
		0,0,1];
	return <div>{matrix.length}</div>;
}`,
				`export function App() {
  // prettier-ignore
  const matrix = [1,0,0,
		0,1,0,
		0,0,1];
  return <div>{matrix.length}</div>;
}
`,
			);
		});

		test('preserves a statement verbatim after a block directive', async () => {
			await expectPrettierFormat(
				`export function App() {
	/* prettier-ignore */
	const obj = {a:1,     b:2};
	return <div>{obj.a}</div>;
}`,
				`export function App() {
  /* prettier-ignore */
  const obj = {a:1,     b:2};
  return <div>{obj.a}</div>;
}
`,
			);
		});

		test('still formats when the comment is not a prettier-ignore directive', async () => {
			await expectPrettierFormat(
				`export function App() {
	// this is a normal comment
	const obj = {a:1,     b:2};
	return <div>{obj.a}</div>;
}`,
				`export function App() {
  // this is a normal comment
  const obj = { a: 1, b: 2 };
  return <div>{obj.a}</div>;
}
`,
			);
		});

		test('keeps a statement that a prettier-ignore comment trails on its line', async () => {
			await expectPrettierFormat(
				`foo(  a,b  ); // prettier-ignore
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
foo(  a,b  ); /* prettier-ignore */`,
				`foo(  a,b  ); // prettier-ignore
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
foo(  a,b  ); /* prettier-ignore */
`,
			);
		});

		test('keeps members that a prettier-ignore comment trails on their line', async () => {
			await expectPrettierFormat(
				`const x = {
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
};`,
				`const x = {
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
};
`,
			);
		});

		test('keeps the last statement of a block that an own-line prettier-ignore follows', async () => {
			await expectPrettierFormat(
				`{
  foo(  1 );
  // prettier-ignore
}`,
				`{
  foo(  1 );
  // prettier-ignore
}
`,
			);
		});

		test('keeps a node whose prettier-ignore comment another comment follows', async () => {
			await expectPrettierFormat(
				`foo(
  // prettier-ignore
  /* #__PURE__ */ bar(  1,2 ),
);
const o = {
  // prettier-ignore
  /* keep */ a:   [1,2],
  b: 1,
};`,
				`foo(
  // prettier-ignore
  /* #__PURE__ */ bar(  1,2 ),
);
const o = {
  // prettier-ignore
  /* keep */ a:   [1,2],
  b: 1,
};
`,
			);
		});

		test('keeps a node whose dangling comment is prettier-ignore', async () => {
			await expectPrettierFormat(
				`for (let i = 0; i < 1; i++) { /* prettier-ignore */ }`,
				`for (let i = 0; i < 1; i++) { /* prettier-ignore */ }
`,
			);
			await expectPrettierFormat(
				`

// prettier-ignore


`,
				`

// prettier-ignore


`,
			);
		});

		test('still formats an element after a space or a {…} child that a prettier-ignore comment is in', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div>
      {/* prettier-ignore */} <span   a = "1" />
      {/* prettier-ignore */}
      {x   +   y}
      {x /* prettier-ignore */}
      <b   c = "1" />
    </div>
  );
}`,
				`function App() {
  return (
    <div>
      {/* prettier-ignore */} <span a="1" />
      {/* prettier-ignore */}
      {x + y}
      {x /* prettier-ignore */}
      <b c="1" />
    </div>
  );
}
`,
			);
		});

		test('keeps the decorators written before export', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
@dec
export   class  A {}
// prettier-ignore
@dec
export default   class  B {}`,
				`// prettier-ignore
@dec
export   class  A {}
// prettier-ignore
@dec
export default   class  B {}
`,
			);
		});

		test('keeps an ignored decorated declaration as written in // prettier-ignore\n@dec export class A {  }', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
@dec export class A {  }`,
				`// prettier-ignore
@dec export class A {  }
`,
			);
		});

		test('keeps an ignored decorated declaration as written in // prettier-ignore\nexport @dec class A {  }', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
export @dec class A {  }`,
				`// prettier-ignore
export @dec class A {  }
`,
			);
		});

		test('keeps an ignored decorated declaration as written in // prettier-ignore\n@dec export default class {  }', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
@dec export default class {  }`,
				`// prettier-ignore
@dec export default class {  }
`,
			);
		});

		test('keeps an ignored decorated declaration as written in // prettier-ignore\n@dec class A {  }', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
@dec class A {  }`,
				`// prettier-ignore
@dec class A {  }
`,
			);
		});

		test('keeps an ignored decorated declaration as written in export /* prettier-ignore */ @dec class A {  }', async () => {
			await expectPrettierFormat(
				`export /* prettier-ignore */ @dec class A {  }`,
				`export /* prettier-ignore */ @dec class A {  }
`,
			);
		});

		test('keeps an ignored decorated declaration as written in export default /* prettier-ignore */ @dec class {  }', async () => {
			await expectPrettierFormat(
				`export default /* prettier-ignore */ @dec class {  }`,
				`export default /* prettier-ignore */ @dec class {  }
`,
			);
		});

		test('keeps an ignored decorated declaration as written in @a @b\nexport class A {  } // prettier-ignore', async () => {
			await expectPrettierFormat(
				`@a @b
export class A {  } // prettier-ignore`,
				`@a @b
export class A {  } // prettier-ignore
`,
			);
		});

		test('keeps an ignored decorated declaration as written in class B {\n  // prettier-ignore\n  @dec   m(  ) {}\n}', async () => {
			await expectPrettierFormat(
				`class B {
  // prettier-ignore
  @dec   m(  ) {}
}`,
				`class B {
  // prettier-ignore
  @dec   m(  ) {}
}
`,
			);
		});

		test('keeps the decorators of an ignored parameter in "class A {\\n  m(\\n    // prettier-ignore\\n    @a   x  : T,\\n  ) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m(
    // prettier-ignore
    @a   x  : T,
  ) {}
}`,
				`class A {
  m(
    // prettier-ignore
    @a   x  : T,
  ) {}
}
`,
			);
		});

		test('keeps the decorators of an ignored parameter in "class A {\\n  constructor(\\n    // prettier-ignore\\n    @a  @b()   private   x  : T,\\n  ) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(
    // prettier-ignore
    @a  @b()   private   x  : T,
  ) {}
}`,
				`class A {
  constructor(
    // prettier-ignore
    @a  @b()   private   x  : T,
  ) {}
}
`,
			);
		});

		test('keeps the decorators of an ignored parameter in "class A {\\n  constructor(@dec private /* prettier-ignore */ x  : T) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@dec private /* prettier-ignore */ x  : T) {}
}`,
				`class A {
  constructor(@dec private /* prettier-ignore */ x  : T) {}
}
`,
			);
		});

		test('prints a comment between the decorators and export once', async () => {
			await expectPrettierFormat(
				`@dec
// prettier-ignore
export class A {  }
@dec /* prettier-ignore */
export default class {  }`,
				`@dec
// prettier-ignore
export class A {}
@dec /* prettier-ignore */
export default class {}
`,
			);
		});

		test('prints the trailing comments of an ignored node once when its parent prints them in type T = A /* prettier-ignore */ | B;', async () => {
			await expectPrettierFormat(
				`type T = A /* prettier-ignore */ | B;`,
				`type T = A /* prettier-ignore */ | B;
`,
			);
		});

		test('keeps the union member after an own-line prettier-ignore as written', async () => {
			await expectPrettierFormat(
				`type A =
  | B<  1 >
  // prettier-ignore
  | {  a:1 };
type C =
  // prettier-ignore
  | D<  1 >
  | E<  2 >;
type F =
  | G<  1 > // prettier-ignore
  | H<  2 >;`,
				`type A =
  | B<1>
  // prettier-ignore
  | {  a:1 };
type C =
  // prettier-ignore
  D<  1 > | E<2>;
type F =
  | G<  1 > // prettier-ignore
  | H<2>;
`,
			);
		});

		test('ignores the first member of a union written in parentheses', async () => {
			await expectPrettierFormat(
				`type A =
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
};`,
				`type A =
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
};
`,
			);
		});

		test("doesn't break the list around an ignored node over several lines", async () => {
			await expectPrettierFormat(
				`foo(/* prettier-ignore */ [1,
   2], b);
const x = { a: /* prettier-ignore */ [1,
   2], b: 2 };`,
				`foo(/* prettier-ignore */ [1,
   2], b);
const x = { a: /* prettier-ignore */ [1,
   2], b: 2 };
`,
			);
		});

		test('drops the semicolon of an ignored statement without semi', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
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
export type C =   D;`,
				`// prettier-ignore
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
export type C =   D
`,
				{ semi: false },
			);
		});
	});

	describe('prettier-ignore > prints the trailing comments of an ignored node once when its parent prints them in class A<T ', () => {
		test('// prettier-ignore\n  extends B {}', async () => {
			await expectPrettierFormat(
				`class A<T  > // prettier-ignore
  extends B {}`,
				`class A<T  > // prettier-ignore
  extends B {}
`,
			);
		});
	});

	describe('prettier-ignore > prints the trailing comments of an ignored node once when its parent prints them in type T =\n  | A<  1', () => {
		test('// prettier-ignore\n  | B;', async () => {
			await expectPrettierFormat(
				`type T =
  | A<  1 > // prettier-ignore
  | B;`,
				`type T =
  | A<  1 > // prettier-ignore
  | B;
`,
			);
		});
	});

	describe('recovered', () => {
		test('collapses multiple blank lines in element children', async () => {
			await expectFormat(
				`export function App() {
  <div>
    <span>{'First'}</span>


    <span>{'Second'}</span>
  </div>
}`,
				`export function App() {
  <div>
    <span>{'First'}</span>

    <span>{'Second'}</span>
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves blank lines between JSX element children', async () => {
			await expectFormat(
				`export function App() {
  <div>
    <span>{'First'}</span>

    <span>{'Second'}</span>

    <span>{'Third'}</span>
  </div>
}`,
				`export function App() {
  <div>
    <span>{'First'}</span>

    <span>{'Second'}</span>

    <span>{'Third'}</span>
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should format shorthand tsx fragments like JSX fragments', async () => {
			await expectPrettierFormat(
				`function Test(p1,p2){return <><div>Hello</div><div>{p1}</div><div>{p2}</div></>}`,
				`function Test(p1, p2) {
  return (
    <>
      <div>Hello</div>
      <div>{p1}</div>
      <div>{p2}</div>
    </>
  );
}
`,
			);
		});

		test('should format import.meta expressions correctly', async () => {
			await expectFormat(
				`export function Test(){if(import.meta.env.SSR){<div>{'Server'}</div>}}`,
				`export function Test() {
  if (import.meta.env.SSR) {
    <div>{'Server'}</div>
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should format dynamic import() expressions correctly', async () => {
			await expectPrettierFormat(
				`const mod = await import('@codemirror/state');`,
				`const mod = await import("@codemirror/state");
`,
			);
		});

		test('should preserve and format dynamic deferred imports', async () => {
			await expectPrettierFormat(
				`const feature=import.defer("./feature.js")`,
				`const feature = import.defer('./feature.js');
`,
				{ singleQuote: true },
			);
		});

		test('should preserve dynamic deferred import options', async () => {
			await expectPrettierFormat(
				`const data=import.defer("./feature.json",{with:{type:"json"}})`,
				`const data = import.defer('./feature.json', { with: { type: 'json' } });
`,
				{ singleQuote: true },
			);
		});

		test('drops the trailing comma of a dynamic import and keeps its options once', async () => {
			await expectPrettierFormat(
				`const a=import("./a.js",)
const data=import("./data.json",{with:{type:"json"}},)`,
				`const a = import("./a.js");
const data = import("./data.json", { with: { type: "json" } });
`,
			);
		});

		test('formats import attributes with more than one quoted key', async () => {
			await expectPrettierFormat(
				`import a from './a' with { 'a': 'x', 'b': 'y' };`,
				`import a from "./a" with { a: "x", b: "y" };
`,
			);
		});

		test('should format destructured dynamic import() in Promise.all', async () => {
			await expectPrettierFormat(
				`const [{ EditorState }, { oneDark }] = await Promise.all([import('@codemirror/state'), import('@codemirror/theme-one-dark')]);`,
				`const [{ EditorState }, { oneDark }] = await Promise.all([
  import("@codemirror/state"),
  import("@codemirror/theme-one-dark"),
]);
`,
			);
		});

		test('should format a function with an object property notation function markup', async () => {
			await expectFormat(
				`function Card(props) {
  <div class="card">
    <props.children />
  </div>
}`,
				`function Card(props) {
  <div class="card">
    <props.children />
  </div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should respect print width when using ternary expressions', async () => {
			await expectPrettierFormat(
				`function printMemberExpressionSimple(node, options, computed = false) {
  if (node.type === 'MemberExpression') {
    const prop = node.computed
      ? (node.optional ? '?.[' : '[') + printMemberExpressionSimple(node.property, options, node.computed) + ']'
      : (node.optional ? '?.' : '.') + printMemberExpressionSimple(node.property, options, node.computed);
  }
}`,
				`function printMemberExpressionSimple(
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
}
`,
				{ singleQuote: true, printWidth: 70 },
			);
		});

		test('should print nested ternary expressions with indentation', async () => {
			await expectPrettierFormat(
				`const children_fn = b.arrow(
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
);`,
				`const children_fn = b.arrow(
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
);
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should properly format template literals with ternaries', async () => {
			await expectPrettierFormat(
				`const handle_static_attr = (name, value) => {
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
};`,
				`const handle_static_attr = (name, value) => {
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
};
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should format conditional expressions correctly', async () => {
			await expectPrettierFormat(
				`const consequentDoc =
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
    : path.call(print, 'alternate');`,
				`const consequentDoc =
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
    : path.call(print, 'alternate');
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should format nested template literals correctly', async () => {
			await expectPrettierFormat(
				`const handle_static_attr = (name, value) => {
  const attr_str = \` \${name}\${
    is_boolean_attribute(name) && value === true
      ? ''
      : \`="\${value === true ? '' : escape_html(value, true)}"\`
  }\`;
};`,
				`const handle_static_attr = (name, value) => {
  const attr_str = \` \${name}\${
    is_boolean_attribute(name) && value === true
      ? ''
      : \`="\${value === true ? '' : escape_html(value, true)}"\`
  }\`;
};
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should respect print width when using conditional expressions with arrays', async () => {
			await expectPrettierFormat(
				`const openingTag = group([
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
]);`,
				`const openingTag = group([
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
]);
`,
				{ singleQuote: true, printWidth: 70 },
			);
		});

		test('does not turn a comment before call parentheses into a cast', async () => {
			await expectPrettierFormat(
				`foo /** @type {A} */ ((node));`,
				`foo(/** @type {A} */ node);
`,
			);
		});

		test('should preserve required parentheses around assignment expressions', async () => {
			await expectPrettierFormat(
				`const openSignal = useRef<Signal<boolean> | null>(null)
const open = props.open ?? (openSignal.current ??= signal(false))
const sum = a + (b = c)
const condition = (a = b) ? c : d
const called = (factory = getFactory())()
async function load() {
  await (promise = getPromise())
}`,
				`const openSignal = useRef<Signal<boolean> | null>(null);
const open = props.open ?? (openSignal.current ??= signal(false));
const sum = a + (b = c);
const condition = (a = b) ? c : d;
const called = (factory = getFactory())();
async function load() {
  await (promise = getPromise());
}
`,
				{ singleQuote: true },
			);
		});

		test('should not change formatting for function object properties and properties in square brackets', async () => {
			await expectPrettierFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle arrow functions with block bodies', async () => {
			await expectPrettierFormat(
				`export function Test(){const handler=()=>{};handler}`,
				`export function Test() {
  const handler = () => {};
  handler;
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle TypeScript types and interfaces', async () => {
			await expectPrettierFormat(
				`export function Test(){interface User{id:number;name:string}let user:User={id:1,name:"test"};user}`,
				`export function Test() {
  interface User {
    id: number;
    name: string;
  }
  let user: User = { id: 1, name: 'test' };
  user;
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle TypeScript function return type', async () => {
			await expectPrettierFormat(
				`export function FooBar() { function Foo() : string { return ""; }}`,
				`export function FooBar() {
  function Foo(): string {
    return '';
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle TypeScript method return type', async () => {
			await expectPrettierFormat(
				`class Foo { bar() : number { return 1; }}`,
				`class Foo {
  bar(): number {
    return 1;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle import type statements', async () => {
			await expectPrettierFormat(
				`import { type Component } from '@example/runtime';
import { Something, type Props, track } from '@example/runtime';`,
				`import { type Component } from '@example/runtime';
import { Something, type Props, track } from '@example/runtime';
`,
				{ singleQuote: true },
			);
		});

		test('should preserve and format static deferred imports', async () => {
			await expectPrettierFormat(
				`import defer*as feature from "./feature.json" with{type:"json"};`,
				`import defer * as feature from './feature.json' with { type: 'json' };
`,
				{ singleQuote: true },
			);
		});

		test('should keep the type keyword on export type statements', async () => {
			await expectPrettierFormat(
				`export type { Config } from './types.js';
export { type Extra, realValue } from './mixed.js';`,
				`export type { Config } from './types.js';
export { type Extra, realValue } from './mixed.js';
`,
				{ singleQuote: true },
			);
		});

		test('should print type predicate return types', async () => {
			await expectPrettierFormat(
				`const isString = (value: unknown): value is string => typeof value === 'string';
function assertUser(x: unknown): asserts x is User {}
function isSelf(this: Node): this is Element {
  return true;
}
function assertTruthy(x: unknown): asserts x {}`,
				`const isString = (value: unknown): value is string => typeof value === 'string';
function assertUser(x: unknown): asserts x is User {}
function isSelf(this: Node): this is Element {
  return true;
}
function assertTruthy(x: unknown): asserts x {}
`,
				{ singleQuote: true },
			);
		});

		test('should keep the declare keyword on ambient module declarations', async () => {
			await expectPrettierFormat(
				`declare module 'some-module' {
  interface Thing {
    x: number;
  }
}`,
				`declare module 'some-module' {
  interface Thing {
    x: number;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should format long import statements correctly', async () => {
			await expectPrettierFormat(
				`import { flushSync, track, effect, bindValue, bindChecked, bindGroup, bindClientWidth, bindClientHeight, bindOffsetWidth, bindOffsetHeight, bindContentRect, bindContentBoxSize, bindBorderBoxSize, bindDevicePixelContentBoxSize, bindInnerHTML, bindInnerText, bindTextContent, bindNode } from '@example/runtime';`,
				`import {
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
} from '@example/runtime';
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should handle type annotations in object params', async () => {
			await expectPrettierFormat(
				`interface Props {
  a: number;
  b: string;
}

export function Test({ a, b }: Props) {}`,
				`interface Props {
  a: number;
  b: string;
}

export function Test({ a, b }: Props) {}
`,
				{ singleQuote: true },
			);
		});

		test('should handle inline type annotations in object params', async () => {
			await expectPrettierFormat(
				`export function Test({ a, b}: { a: number; b: string }) {}`,
				`export function Test({ a, b }: { a: number; b: string }) {}
`,
				{ singleQuote: true },
			);
		});

		test('should keep attributes on same line when no attribute value breaks', async () => {
			await expectFormat(
				`function App() {
  <button class="test another" onClick={handler}>
    {'Click Me'}
  </button>
}`,
				`function App() {
  <button class="test another" onClick={handler}>
    {'Click Me'}
  </button>
}
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should keep short top-level ternary attributes inline when they fit', async () => {
			await expectFormat(
				`function App() {
  <div class={selected === 0 ? "selected" : ""}>{\`div 1\`}</div>
}`,
				`function App() {
  <div class={selected === 0 ? 'selected' : ''}>{\`div 1\`}</div>
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should not format function parameter spread', async () => {
			await expectPrettierFormat(
				`function Two({ arg1, ...rest }) {}`,
				`function Two({ arg1, ...rest }) {}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should break up long function parameter spread on new lines if line length exceeds printWidth', async () => {
			await expectPrettierFormat(
				`function Three({ argumentOne, argumentTwo, ArgumentThree, ArgumentFour, ArgumentFive, ArgumentSix, ArgumentSeven }) {}`,
				`function Three({
  argumentOne,
  argumentTwo,
  ArgumentThree,
  ArgumentFour,
  ArgumentFive,
  ArgumentSix,
  ArgumentSeven,
}) {}
`,
				{ singleQuote: true, printWidth: 60 },
			);
		});

		test('should not include a comma after the last rest parameter', async () => {
			await expectPrettierFormat(
				`function Foo({
  lorem,
  ipsum,
  dolor,
  sit,
  amet,
  consectetur,
  adipiscing,
  ...rest
}) {}`,
				`function Foo({
  lorem,
  ipsum,
  dolor,
  sit,
  amet,
  consectetur,
  adipiscing,
  ...rest
}) {}
`,
				{ singleQuote: true, printWidth: 60 },
			);
		});

		test('keeps a new line between comments above and code if one is present', async () => {
			await expectPrettierFormat(
				`// comment

import { useCount, incrementCount } from './useCount';
import { effect, track } from '@example/runtime';`,
				`// comment

import { useCount, incrementCount } from './useCount';
import { effect, track } from '@example/runtime';
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should format properly an array of objects', async () => {
			await expectPrettierFormat(
				`obj = {
  test: [
    { a: 1, b: 2, c: 3, d: 4 },
    { a: 1, b: 2 },
    { c: 3, d: 4 },
  ],
};`,
				`obj = {
  test: [
    { a: 1, b: 2, c: 3, d: 4 },
    { a: 1, b: 2 },
    { c: 3, d: 4 },
  ],
};
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep chained expression intact', async () => {
			await expectPrettierFormat(
				`const doc = getRootNode?.()?.ownerDocument ?? document;`,
				`const doc = getRootNode?.()?.ownerDocument ?? document;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should break arrow before a long generic optional call with nullish fallback', async () => {
			await expectPrettierFormat(
				`const test = () => menuRef.current?.querySelector<HTMLElement>(
        "[role=\\"menuitem\\"]:not([aria-disabled=\\"true\\"])",
      ) ??
        null`,
				`const test = () =>
  menuRef.current?.querySelector<HTMLElement>(
    '[role="menuitem"]:not([aria-disabled="true"])',
  ) ?? null;
`,
				{ singleQuote: true },
			);
		});

		test('keeps nullish fallback inline in a conditional test', async () => {
			await expectPrettierFormat(
				`const test = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? null ? a : b;`,
				`const test =
  (menuRef.current?.querySelector<HTMLElement>(
    '[role="menuitem"]:not([aria-disabled="true"])',
  ) ?? null)
    ? a
    : b;
`,
				{ singleQuote: true },
			);
		});

		test('does not add spaces around inlined array elements in destructured arguments', async () => {
			await expectPrettierFormat(
				`for (const [key, value] of Object.entries(attributes).filter(([_key, value]) => value !== '')) {
}
const [obj1, obj2] = arrayOfObjects;`,
				`for (const [key, value] of Object.entries(attributes).filter(([_key, value]) => value !== '')) {
}
const [obj1, obj2] = arrayOfObjects;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep ReactiveMap short syntax intact', async () => {
			await expectPrettierFormat(
				`const map = new ReactiveMap([['key1', 'value1'], ['key2', 'value2']]);
const set = new ReactiveSet([1, 2, 3]);`,
				`const map = new ReactiveMap([
  ['key1', 'value1'],
  ['key2', 'value2'],
]);
const set = new ReactiveSet([1, 2, 3]);
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should not remove blank lines between components and types if provided', async () => {
			await expectPrettierFormat(
				`export function App() {
  console.log('test');
}

type RootNode = ShadowRoot | Document | Node;
type GetRootNode = () => RootNode;`,
				`export function App() {
  console.log('test');
}

type RootNode = ShadowRoot | Document | Node;
type GetRootNode = () => RootNode;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should not remove async from arrow functions', async () => {
			await expectPrettierFormat(
				`describe('compat-react', async () => {
  const something = 10;
});`,
				`describe('compat-react', async () => {
  const something = 10;
});
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve blank lines between components and various TS declarations', async () => {
			await expectPrettierFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve blank lines between ts and import statements', async () => {
			await expectPrettierFormat(
				`export interface PortalActionProps {
  disabled?: boolean | undefined;
  container?: HTMLElement | undefined;
  getRootNode?: GetRootNode | undefined;
}

import { Portal as RuntimePortal } from '@example/runtime';`,
				`export interface PortalActionProps {
  disabled?: boolean | undefined;
  container?: HTMLElement | undefined;
  getRootNode?: GetRootNode | undefined;
}

import { Portal as RuntimePortal } from '@example/runtime';
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve blank lines between export statements and import statements or comments', async () => {
			await expectPrettierFormat(
				`export { handler } from './test.tsrx';

import { Portal as RuntimePortal } from '@example/runtime';

// export { something } from './test.tsrx;

import { GetRootNode } from './somewhere';`,
				`export { handler } from './test.tsrx';

import { Portal as RuntimePortal } from '@example/runtime';

// export { something } from './test.tsrx;

import { GetRootNode } from './somewhere';
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('adds no blank line after an import that the source does not have', async () => {
			await expectPrettierFormat(
				`import a from "a";
b();
import c from "c";
// note
d();
function f() {}
import e from "e";
export { e };
import g from "g";

g();`,
				`import a from "a";
b();
import c from "c";
// note
d();
function f() {}
import e from "e";
export { e };
import g from "g";

g();
`,
			);
		});

		test('should preserve export interface with extends as provided', async () => {
			await expectPrettierFormat(
				`export interface ReactiveArray<T> extends Array<T> {}`,
				`export interface ReactiveArray<T> extends Array<T> {}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep a single object argument attached when the object breaks', async () => {
			await expectPrettierFormat(
				`foo({ a: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz' });`,
				`foo({
  a: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',
});
`,
				{ singleQuote: true, printWidth: 85 },
			);
		});

		test('should expand call arguments containing a regex literal with a block callback', async () => {
			await expectPrettierFormat(
				`js.code = js.code.replace(/^(export\\s+)declare\\s+(function\\s+\\w+[^{\\n]*;)$/gm, (match, p1, p2, offset) => {
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
});`,
				`js.code = js.code.replace(
  /^(export\\s+)declare\\s+(function\\s+\\w+[^{\\n]*;)$/gm,
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
);
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should expand call arguments containing a regex literal with a block callback printWidth 40', async () => {
			await expectPrettierFormat(
				`js.code = js.code.replace(/^(export\\s+)declare\\s+(function\\s+\\w+[^{\\n]*;)$/gm, (match, p1, p2, offset) => {
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
});`,
				`js.code = js.code.replace(
  /^(export\\s+)declare\\s+(function\\s+\\w+[^{\\n]*;)$/gm,
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
);
`,
				{ singleQuote: true, printWidth: 40 },
			);
		});

		test('should expand call arguments containing a regex literal with a block callback printWidth 30', async () => {
			await expectPrettierFormat(
				`js.code = js.code.replace(/^(export\\s+)declare\\s+(function\\s+\\w+[^{\\n]*;)$/gm, (match, p1, p2, offset) => {
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
});`,
				`js.code = js.code.replace(
  /^(export\\s+)declare\\s+(function\\s+\\w+[^{\\n]*;)$/gm,
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
);
`,
				{ singleQuote: true, printWidth: 30 },
			);
		});

		test('should keep blank lines between commented out block and markup', async () => {
			await expectFormat(
				`function CounterWrapper(props) {
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
}`,
				`function CounterWrapper(props) {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep parens around negating key in object expression', async () => {
			await expectPrettierFormat(
				`effect(() => {
  props.count;
  if (props.count > 1 && 'another' in more) {
  	untrack(() => delete more.another);
  } else if (props.count > 2 && !('another' in more)) {
  	untrack(() => more.another = 0);
  }
  untrack(() => console.log(more));
});`,
				`effect(() => {
  props.count;
  if (props.count > 1 && 'another' in more) {
    untrack(() => delete more.another);
  } else if (props.count > 2 && !('another' in more)) {
    untrack(() => (more.another = 0));
  }
  untrack(() => console.log(more));
});
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep parents in math subtraction and multiplication', async () => {
			await expectPrettierFormat(
				`let offset = track(() => (page - 1) * limit);`,
				`let offset = track(() => (page - 1) * limit);
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep parens around the right operand of a same-operator subtraction', async () => {
			await expectPrettierFormat(
				`const d = a - (b - c);`,
				`const d = a - (b - c);
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep parens around the right operand of a same-operator division', async () => {
			await expectPrettierFormat(
				`const d = a / (b / c);`,
				`const d = a / (b / c);
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep parens around a right-side addition under string concatenation', async () => {
			await expectPrettierFormat(
				`const s = 'x' + (n + 1);`,
				`const s = 'x' + (n + 1);
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should drop redundant parens around the left operand of a same-operator addition', async () => {
			await expectPrettierFormat(
				`const s = (a + b) + c;`,
				`const s = a + b + c;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep parens around the left operand of exponentiation', async () => {
			await expectPrettierFormat(
				`const p = (a ** b) ** c;`,
				`const p = (a ** b) ** c;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should have parents around low-precedence logical expression', async () => {
			await expectPrettierFormat(
				`files = [...files ?? [], ...dt.files];
files = [...(files ?? []), ...dt.files];`,
				`files = [...(files ?? []), ...dt.files];
files = [...(files ?? []), ...dt.files];
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should drop redundant parentheses around an identifier callee', async () => {
			await expectPrettierFormat(
				`const s = (foo)();`,
				`const s = foo();
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should preserve parentheses around IIFE arrow function callee', async () => {
			await expectPrettierFormat(
				`const s = (() => {
  return true;
})();`,
				`const s = (() => {
  return true;
})();
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should preserve parentheses around IIFE function expression callee', async () => {
			await expectPrettierFormat(
				`const s = (function () {
  return true;
})();`,
				`const s = (function () {
  return true;
})();
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should recognize and preserve class assignments to variables', async () => {
			await expectPrettierFormat(
				`let test = class MediaQueryList {};`,
				`let test = class MediaQueryList {};
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve class computed method', async () => {
			await expectPrettierFormat(
				`class TestClass {
  ['something']() {
    const i = 10;
  }
}`,
				`class TestClass {
  ['something']() {
    const i = 10;
  }
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve explicit tsx blocks in class methods', async () => {
			await expectPrettierFormat(
				`class Foo {
	bar() {
	return <>{"Hello"}</>;
	}
}`,
				`class Foo {
  bar() {
    return <>{'Hello'}</>;
  }
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve object computed methods', async () => {
			await expectPrettierFormat(
				`const obj = {
  ['something']() {
    const i = 10;
  },
};`,
				`const obj = {
  ['something']() {
    const i = 10;
  },
};
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should print class constructor method only once', async () => {
			await expectPrettierFormat(
				`class TestClass {
  constructor(value: T) {
    this.value = value;
  }
}`,
				`class TestClass {
  constructor(value: T) {
    this.value = value;
  }
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('keeps parens in place when necessary for logical reasons with && and || operators', async () => {
			await expectPrettierFormat(
				`function App() {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  }
}`,
				`function App() {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  }
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('expands empty braces to new lines for for-in statements', async () => {
			await expectPrettierFormat(
				`for (const key in obj) {
}`,
				`for (const key in obj) {
}
`,
			);
		});

		test('prints empty for, while, and do-while bodies as {} like Prettier', async () => {
			await expectPrettierFormat(
				`for (let i = 0; i < 10; i++) {
}
for (;;) {
}
while (true) {
}
do {
} while (true);`,
				`for (let i = 0; i < 10; i++) {}
for (;;) {}
while (true) {}
do {} while (true);
`,
			);
		});

		test('expands an empty block in a statement list like Prettier', async () => {
			await expectPrettierFormat(
				`{}
function f() {
  {}
  label: {}
}
const g = () => {};
class K {
  static {}
  m() {}
}
namespace N {}`,
				`{
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
namespace N {}
`,
			);
		});

		test('adds semicolon after do-while when semi option is true', async () => {
			await expectPrettierFormat(
				`do { console.log('x') } while (true)`,
				`do {
  console.log("x");
} while (true);
`,
			);
		});

		test('omits semicolon after do-while when semi option is false', async () => {
			await expectPrettierFormat(
				`do { console.log('x') } while (true);`,
				`do {
  console.log("x")
} while (true)
`,
				{ semi: false },
			);
		});

		test('expands empty braces to new lines for switch case blocks', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1: {
  }
}`,
				`switch (x) {
  case 1: {
  }
}
`,
			);
		});

		test('prints function with a rest parameter correctly', async () => {
			await expectPrettierFormat(
				`function TestRest(...args: string[]) {
  console.log(args);
}`,
				`function TestRest(...args: string[]) {
  console.log(args);
}
`,
			);
		});

		test('keeps parens around as ts expression and optional calling', async () => {
			await expectPrettierFormat(
				`(resolve_fn as () => void)?.();`,
				`(resolve_fn as () => void)?.();
`,
			);
		});

		test('keeps dynamic import TSImportType intact', async () => {
			await expectPrettierFormat(
				`let streamed_error: Error | null = null;
const sink: import('@example/runtime/server').SSRStreamSink = {
  push(_chunk: string) {},
  close() {},
  error(reason: unknown) {
    streamed_error = reason as Error;
  },
};`,
				`let streamed_error: Error | null = null;
const sink: import('@example/runtime/server').SSRStreamSink = {
  push(_chunk: string) {},
  close() {},
  error(reason: unknown) {
    streamed_error = reason as Error;
  },
};
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should handle empty component', async () => {
			await expectPrettierFormat(
				`export function Empty() {}`,
				`export function Empty() {}
`,
			);
		});

		test('should handle empty function using cursor', async () => {
			await expectPrettierFormat(
				`export function Empty() {}`,
				`export function Empty() {}
`,
			);
		});

		test('should correctly handle call expressions', async () => {
			await expectFormat(
				`export function App() {
	const context = track(globalContext.get().theme);
	<div>
	<TypedComponent />
	{context.value}
	</div>
}`,
				`export function App() {
  const context = track(globalContext.get().theme);
  <div>
    <TypedComponent />
    {context.value}
  </div>
}
`,
			);
		});

		test('should correctly handle TS syntax', async () => {
			await expectPrettierFormat(
				`type User = { name: string; age: number };
let message: string[] = [];

// comments should be preserved

message.push(greet(\`TSRX\`));
message.push(\`User: \${JSON.stringify({ name: 'Alice', age: 30 } as User)}\`);`,
				`type User = { name: string; age: number };
let message: string[] = [];

// comments should be preserved

message.push(greet(\`TSRX\`));
message.push(\`User: \${JSON.stringify({ name: "Alice", age: 30 } as User)}\`);
`,
			);
		});

		test('should correctly handle inline jsx like comments', async () => {
			await expectPrettierFormat(
				`let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet(\`TSRX\`));
`,
				`let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet(\`TSRX\`));
`,
			);
		});

		test('should correctly handle inline document like comments', async () => {
			await expectPrettierFormat(
				`let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet( /* Some text */ \`TSRX\`));
`,
				`let message: string[] = []; // comments should be preserved

message.push(/* Some test comment */ greet(/* Some text */ \`TSRX\`));
`,
			);
		});

		test('should keep comments inside function with one statement at the top', async () => {
			await expectPrettierFormat(
				`function App() {
  const something = 5;
  // comment
}

function test() {
  const something = 5;
  // comment
}`,
				`function App() {
  const something = 5;
  // comment
}

function test() {
  const something = 5;
  // comment
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve trailing comments in function parameters', async () => {
			await expectPrettierFormat(
				`function test(
  // comment in params
  a,
  // comment in params
  b,
  // comment in params
  c,
  // comment in params
) {}`,
				`function test(
  // comment in params
  a,
  // comment in params
  b,
  // comment in params
  c,
  // comment in params
) {}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve trailing comments in call arguments', async () => {
			await expectPrettierFormat(
				`fn(
  arg1,
  // comment in args
  arg2,
  // comment in args
  arg3,
  // comment in args
);`,
				`fn(
  arg1,
  // comment in args
  arg2,
  // comment in args
  arg3,
  // comment in args
);
`,
				{ singleQuote: true },
			);
		});

		test('should preserve trailing comments in arrow function parameters', async () => {
			await expectPrettierFormat(
				`const test = (
  // comment in params
  a,
  // comment in params
  b,
  // comment in params
  c,
  // comment in params
) => {};`,
				`const test = (
  // comment in params
  a,
  // comment in params
  b,
  // comment in params
  c,
  // comment in params
) => {};
`,
				{ singleQuote: true },
			);
		});

		test('should preserve trailing comments in class body', async () => {
			await expectPrettierFormat(
				`class MyClass {
  /* comment 1 */
  method1() {}
  //comment 2

  method2() {}
  // comment 3
}`,
				`class MyClass {
  /* comment 1 */
  method1() {}
  //comment 2

  method2() {}
  // comment 3
}
`,
				{ singleQuote: true },
			);
		});

		test('puts every class member on its own line and keeps one blank line between members', async () => {
			await expectPrettierFormat(
				`class A { a = 1; b = 2; }
class B {
  a = 1;


  b = 2;
}
class C {
  a = 1; /* note */
  b = 2;
}
foo(class { a = 1 });`,
				`class A {
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
);
`,
			);
		});

		test('should preserve comments in object expressions', async () => {
			await expectPrettierFormat(
				`const obj = {
  /* comment 1 */
  a: 1,

  // comment 2
  b: 2,
  // comment 3
};`,
				`const obj = {
  /* comment 1 */
  a: 1,

  // comment 2
  b: 2,
  // comment 3
};
`,
				{ singleQuote: true },
			);
		});

		test('should preserve comments in switch statement cases', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:
    foo();
    // comment 1
  case 2:
    bar();
    // comment 2
}`,
				`switch (x) {
  case 1:
    foo();
  // comment 1
  case 2:
    bar();
  // comment 2
}
`,
				{ singleQuote: true },
			);
		});

		test('keeps blank lines between the statements of a switch case', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:
    a();

    // lead b
    b();
    break;

  default:
    c();

    d();
}`,
				`switch (x) {
  case 1:
    a();

    // lead b
    b();
    break;

  default:
    c();

    d();
}
`,
			);
		});

		test('drops a blank line after a case label or a stray semicolon line in a switch case', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:

    a();
    ;
    b();
}`,
				`switch (x) {
  case 1:
    a();
    b();
}
`,
			);
		});

		test('keeps same-line comments in switch cases on their line', async () => {
			await expectPrettierFormat(
				`switch (x) {
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
}`,
				`switch (x) {
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
}
`,
			);
		});

		test('keeps a comment after a case label with its first statement below it', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1: // c
    // d
    a();
  default: // e
    b();
  case 2: /* f */ c();
  case 3 /* g */: d();
  case 4: /* h */ /* i */
    e();
}`,
				`switch (x) {
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
}
`,
			);
		});

		test('should not add an extra new line above a comment inside objects and in between properties', async () => {
			await expectPrettierFormat(
				`let obj = {
  ['hey']: function () {
    const i = 'yo';
  },
  // <div>{'Weird name component'}</div>
  normal() {
    const b = 'hey';
  },
};`,
				`let obj = {
  ['hey']: function () {
    const i = 'yo';
  },
  // <div>{'Weird name component'}</div>
  normal() {
    const b = 'hey';
  },
};
`,
				{ singleQuote: true },
			);
		});

		test('should preserve comment if the whole function code is commented out', async () => {
			await expectPrettierFormat(
				`export function Test() {
  // thing
  // thing
  // thing
}`,
				`export function Test() {
  // thing
  // thing
  // thing
}
`,
				{ singleQuote: true },
			);
		});

		test('prints the comments of a commented-out function body on consecutive lines', async () => {
			await expectPrettierFormat(
				`export function Test() {
  // thing
  // thing
  /* thing */
  // thing

  /* thing */
  // thing

  /* thing */
  // thing
}`,
				`export function Test() {
  // thing
  // thing
  /* thing */
  // thing
  /* thing */
  // thing
  /* thing */
  // thing
}
`,
				{ singleQuote: true },
			);
		});

		test('should properly format array with various sized strings and 100 printWidth', async () => {
			await expectPrettierFormat(
				`function App() {
  const d = [
    'm14 12 4 4 4-4',
    'M18 16V7',
    'm2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16',
    'M3.304 13h6.392',
  ];
}`,
				`function App() {
  const d = [
    'm14 12 4 4 4-4',
    'M18 16V7',
    'm2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16',
    'M3.304 13h6.392',
  ];
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should correctly handle for loops with variable declarations', async () => {
			await expectPrettierFormat(
				`for (let i = 0, len = array.length; i < len; i++) {
  console.log(i);
}`,
				`for (let i = 0, len = array.length; i < len; i++) {
  console.log(i);
}
`,
			);
		});

		test('prints the empty clauses of a for header like Prettier', async () => {
			await expectPrettierFormat(
				`for (;;) {}
for (; i < n;) {}
for (;; i++) {}
for (let i = 0;;) {}
for (let i = 0; i < n;) {}`,
				`for (;;) {}
for (; i < n;) {}
for (; ; i++) {}
for (let i = 0; ;) {}
for (let i = 0; i < n;) {}
`,
			);
		});

		test('should correctly render attributes in template', async () => {
			await expectFormat(
				`export function App() {
  <div>
   <Expand name='' startingLength={20} />
  </div>
}`,
				`export function App() {
  <div>
    <Expand name="" startingLength={20} />
  </div>
}
`,
			);
		});

		test('should handle different attribute value types correctly', async () => {
			await expectFormat(
				`export function Test() {
  <div
    stringProp="hello"
    numberProp={42}
    booleanProp={true}
    falseProp={false}
    nullProp={null}
    expression={x + 1}
  />
}`,
				`export function Test() {
  <div stringProp="hello" numberProp={42} booleanProp={true} falseProp={false} nullProp={null} expression={x + 1} />
}
`,
				{ singleQuote: true, printWidth: 120 },
			);
		});

		test('should handle default arguments correctly in functions', async () => {
			await expectPrettierFormat(
				`function expand({ name, startingLength = 10 }: { name: string; startingLength?: number }) {
  return null;
}`,
				`function expand({
  name,
  startingLength = 10,
}: {
  name: string;
  startingLength?: number;
}) {
  return null;
}
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should handle default arguments correctly in arrow functions', async () => {
			await expectPrettierFormat(
				`const expand = ({ name, startingLength = 10 }: { name: string; startingLength?: number }) => {
  return null;
};`,
				`const expand = ({
  name,
  startingLength = 10,
}: {
  name: string;
  startingLength?: number;
}) => {
  return null;
};
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should handle array and object patterns correctly', async () => {
			await expectPrettierFormat(
				`for (const [i = 0, item] of items.entries()) {}
for (const {i = 0, item} of items.entries()) {}`,
				`for (const [i = 0, item] of items.entries()) {
}
for (const { i = 0, item } of items.entries()) {
}
`,
			);
		});

		test('should handle various other TS things', async () => {
			await expectPrettierFormat(
				`const globalContext = new Context<{ theme: string, array: number[] }>({ theme: 'light', array: [] });
const items = [] as unknown[];`,
				`const globalContext = new Context<{ theme: string; array: number[] }>({
  theme: 'light',
  array: [],
});
const items = [] as unknown[];
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should not format html elements that fit on one line', async () => {
			await expectFormat(
				`export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`,
				`export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('should format html elements that fit on one line', async () => {
			await expectFormat(
				`export function App() {
  <div class="container">
    <p>
      {'Some Random text'}
    </p>
  </div>
}`,
				`export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('should support jsxSingleQuote option', async () => {
			await expectFormat(
				`export function App() {
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`,
				`export function App() {
  <div class='container'>
    <p>{'Some Random text'}</p>
  </div>
}
`,
				{ singleQuote: true, jsxSingleQuote: true },
			);
		});

		test('should format all basic TypeScript primitive types', async () => {
			await expectFormat(
				`function TypeTest() {
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
      }`,
				`function TypeTest() {
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
}
`,
				{ singleQuote: true },
			);
		});

		test('should format TypeScript utility types', async () => {
			await expectFormat(
				`function UtilityTypeTest() {
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
      }`,
				`function UtilityTypeTest() {
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
}
`,
				{ singleQuote: true },
			);
		});

		test('should format TypeScript generics in variable declarations', async () => {
			await expectFormat(
				`function GenericTest() {
        let open: Tracked<boolean> = track(false);
        let items: Array<string> = [];
        let map: Map<string, number> = new Map();
        <div>{"test"}</div>
      }`,
				`function GenericTest() {
  let open: Tracked<boolean> = track(false);
  let items: Array<string> = [];
  let map: Map<string, number> = new Map();
  <div>{'test'}</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should format TypeScript union and intersection types', async () => {
			await expectFormat(
				`function UnionTest() {
        type StringOrNumber = string | number;
        type Props = { a: string } & { b: number };
        let value: string | null = null;
        <div>{"test"}</div>
      }`,
				`function UnionTest() {
  type StringOrNumber = string | number;
  type Props = { a: string } & { b: number };
  let value: string | null = null;
  <div>{'test'}</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should normalize simple cast union types at print width 100', async () => {
			await expectPrettierFormat(
				`const alphaLink = container.querySelector('[data-route-id="alpha"]') as HTMLAnchorElement | null;
const saveButton = container.querySelector('[data-action-id="save"]') as HTMLButtonElement | null;
const deleteButton = container.querySelector('[data-action-id="delete"]') as | HTMLButtonElement
| null;`,
				`const alphaLink = container.querySelector('[data-route-id="alpha"]') as HTMLAnchorElement | null;
const saveButton = container.querySelector('[data-action-id="save"]') as HTMLButtonElement | null;
const deleteButton = container.querySelector(
  '[data-action-id="delete"]',
) as HTMLButtonElement | null;
`,
				{ printWidth: 100, singleQuote: true },
			);
		});

		test('should normalize simple cast union types at print width 80', async () => {
			await expectPrettierFormat(
				`const alphaLink = container.querySelector('[data-route-id="alpha"]') as HTMLAnchorElement | null;
const saveButton = container.querySelector('[data-action-id="save"]') as HTMLButtonElement | null;
const deleteButton = container.querySelector('[data-action-id="delete"]') as | HTMLButtonElement
| null;`,
				`const alphaLink = container.querySelector(
  '[data-route-id="alpha"]',
) as HTMLAnchorElement | null;
const saveButton = container.querySelector(
  '[data-action-id="save"]',
) as HTMLButtonElement | null;
const deleteButton = container.querySelector(
  '[data-action-id="delete"]',
) as HTMLButtonElement | null;
`,
				{ printWidth: 80, singleQuote: true },
			);
		});

		test('should format multiline TypeScript union object types like Prettier TypeScript', async () => {
			await expectPrettierFormat(
				`type SvgIconSource = { name: SvgIconName; data?: never } | {
    data: SvgIconData;
    name?: never;
 }`,
				`type SvgIconSource =
  | { name: SvgIconName; data?: never }
  | {
      data: SvgIconData;
      name?: never;
    };
`,
			);
		});

		test('should break long TypeScript union types with leading operators', async () => {
			await expectPrettierFormat(
				`type Source = SomeVeryLongTypeNameThatWillDefinitelyNotFit | AnotherVeryLongTypeNameThatWillDefinitelyNotFit;`,
				`type Source =
  | SomeVeryLongTypeNameThatWillDefinitelyNotFit
  | AnotherVeryLongTypeNameThatWillDefinitelyNotFit;
`,
				{ printWidth: 50 },
			);
		});

		test('should keep comments attached to their type arguments and stay idempotent', async () => {
			await expectPrettierFormat(
				`interface Props {
	form: AppFieldExtendedReactFormApi<
		unknown,
		| undefined
		| FormAsyncValidateOrFn<unknown>, // this types it as 'never' in the render prop. It should prevent any
		// untyped meta passed to the handleSubmit by accident.
		NoInfer<TSubmitMeta>
	>;
}`,
				`interface Props {
	form: AppFieldExtendedReactFormApi<
		unknown,
		undefined | FormAsyncValidateOrFn<unknown>, // this types it as 'never' in the render prop. It should prevent any
		// untyped meta passed to the handleSubmit by accident.
		NoInfer<TSubmitMeta>
	>;
}
`,
				{ useTabs: true, tabWidth: 2, singleQuote: true, printWidth: 100 },
			);
		});

		test('should not overindent multiline object type aliases', async () => {
			await expectPrettierFormat(
				`type ModuleShape = {
  default: ComponentType<{ value: string }>;
}`,
				`type ModuleShape = {
  default: ComponentType<{ value: string }>;
};
`,
			);
		});

		test('should format TypeScript tuple types (TSTupleType)', async () => {
			await expectPrettierFormat(
				`type T = [string, number, boolean];`,
				`type T = [string, number, boolean];
`,
			);
		});

		test('should preserve named optional TypeScript tuple members', async () => {
			await expectPrettierFormat(
				`export type OptionalTuple = [bar: string, baz?: string];`,
				`export type OptionalTuple = [bar: string, baz?: string];
`,
			);
		});

		test('should format TypeScript index signatures (TSIndexSignature)', async () => {
			await expectPrettierFormat(
				`interface Dict { [key: string]: number; readonly [id: number]: string }`,
				`interface Dict {
  [key: string]: number;
  readonly [id: number]: string;
}
`,
			);
		});

		test('should format TypeScript constructor types (TSConstructorType)', async () => {
			await expectPrettierFormat(
				`type Ctor = new (x: number, y: string) => Foo;`,
				`type Ctor = new (x: number, y: string) => Foo;
`,
			);
		});

		test('should format TypeScript conditional types (TSConditionalType)', async () => {
			await expectPrettierFormat(
				`type T = string extends string ? number : boolean;`,
				`type T = string extends string ? number : boolean;
`,
			);
		});

		test('should break long nested TypeScript conditional type aliases', async () => {
			await expectPrettierFormat(
				`type PageModelValue<Value> = Value extends ReadonlySignal<unknown> ? Value : Value extends (...args: any[]) => any ? Value : Value extends object ? { [Key in keyof Value]: PageModelValue<Value[Key]> } : never;`,
				`type PageModelValue<Value> =
  Value extends ReadonlySignal<unknown>
    ? Value
    : Value extends (...args: any[]) => any
      ? Value
      : Value extends object
        ? { [Key in keyof Value]: PageModelValue<Value[Key]> }
        : never;
`,
			);
		});

		test('should format TypeScript mapped types (TSMappedType)', async () => {
			await expectPrettierFormat(
				`type ReadonlyPartial<T> = { readonly [K in keyof T]?: T[K] }`,
				`type ReadonlyPartial<T> = { readonly [K in keyof T]?: T[K] };
`,
			);
		});

		test('should preserve minus mapped modifiers in TypeScript mapped types', async () => {
			await expectPrettierFormat(
				`type MutableRequired<T> = { -readonly [K in keyof T]-?: T[K] }`,
				`type MutableRequired<T> = { -readonly [K in keyof T]-?: T[K] };
`,
			);
		});

		test('should preserve explicit plus mapped modifiers in TypeScript mapped types', async () => {
			await expectPrettierFormat(
				`type ExplicitReadonlyOptional<T> = { +readonly [K in keyof T]+?: T[K] }`,
				`type ExplicitReadonlyOptional<T> = { +readonly [K in keyof T]+?: T[K] };
`,
			);
		});

		test('should format TypeScript qualified names (TSQualifiedName)', async () => {
			await expectPrettierFormat(
				`type T = Foo.Bar;`,
				`type T = Foo.Bar;
`,
			);
		});

		test('should format TypeScript indexed access types (TSIndexedAccessType)', async () => {
			await expectPrettierFormat(
				`type V = Props["value"]; type W = Map<string, number>["size"]; type X = T[K];`,
				`type V = Props["value"];
type W = Map<string, number>["size"];
type X = T[K];
`,
			);
		});

		test('should properly format TSParenthesizedType', async () => {
			await expectPrettierFormat(
				`const logs: (number | undefined)[] = [];`,
				`const logs: (number | undefined)[] = [];
`,
			);
		});

		test('should format TSMethodSignature in interfaces', async () => {
			await expectPrettierFormat(
				`interface API{get(path:string):Promise<Response>;post<T>(path:string,data:T):Promise<Response>;delete?(id:number):void}`,
				`interface API {
  get(path: string): Promise<Response>;
  post<T>(path: string, data: T): Promise<Response>;
  delete?(id: number): void;
}
`,
			);
		});

		test('should format TSMethodSignature with type parameters', async () => {
			await expectPrettierFormat(
				`interface Collection{map<U>(fn:(item:T)=>U):U[];filter(predicate:(item:T)=>boolean):T[]}`,
				`interface Collection {
  map<U>(fn: (item: T) => U): U[];
  filter(predicate: (item: T) => boolean): T[];
}
`,
			);
		});

		test('should preserve TSCallSignatureDeclaration with conditional types', async () => {
			await expectPrettierFormat(
				`interface TrackedCallable<V> {
  (props: V extends Component<infer P> ? P : never): V extends Component ? void : never;
}`,
				`interface TrackedCallable<V> {
  (props: V extends Component<infer P> ? P : never): V extends Component ? void : never;
}
`,
				{ printWidth: 100 },
			);
		});

		test('should format TSNonNullExpression', async () => {
			await expectFormat(
				`function Test(){let value:string|null=null;let length=value!.length;<div>{length}</div>}`,
				`function Test() {
  let value: string | null = null;
  let length = value!.length;
  <div>{length}</div>
}
`,
			);
		});

		test('should keep the TSInstantiationExpression ', async () => {
			await expectPrettierFormat(
				`function Test() {
  const items = (Promise<string[]>).reject(new Error('Async error'));
}`,
				`function Test() {
  const items = (Promise<string[]>).reject(new Error('Async error'));
}
`,
				{ singleQuote: true },
			);
		});

		test('should format TSNonNullExpression in complex expressions', async () => {
			await expectPrettierFormat(
				`function getValue(x?:string){return x!.toUpperCase()}`,
				`function getValue(x?: string) {
  return x!.toUpperCase();
}
`,
			);
		});

		test('should format TSDeclareFunction (function overload signatures)', async () => {
			await expectPrettierFormat(
				`export function test(arg: string): string;
export function test(arg: number): string;
export function test(arg: string | number): string {
  return String(arg);
}`,
				`export function test(arg: string): string;
export function test(arg: number): string;
export function test(arg: string | number): string {
  return String(arg);
}
`,
			);
		});

		test('should preserve declare modifier on ambient function declarations', async () => {
			await expectPrettierFormat(
				`declare function doSomething(x: string): void;
declare function processData<T>(data: T): Promise<T>;`,
				`declare function doSomething(x: string): void;
declare function processData<T>(data: T): Promise<T>;
`,
			);
		});

		test('should preserve generics on method shorthand in object literals', async () => {
			await expectPrettierFormat(
				`function getBuilder() {
  return {
    build<T>(): T {
      return 'test' as unknown as T;
    },
  };
}`,
				`function getBuilder() {
  return {
    build<T>(): T {
      return 'test' as unknown as T;
    },
  };
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve generic type arguments on JSX function tags', async () => {
			await expectFormat(
				`type User = { name: string };
function RenderProp<Item>(props: { children: (item: Item) => any }) {}
export function App() {
	<RenderProp<User>>
	{(item) => item.name}
	</RenderProp>
}`,
				`type User = { name: string };
function RenderProp<Item>(props: { children: (item: Item) => any }) {}
export function App() {
  <RenderProp<User>>{(item) => item.name}</RenderProp>
}
`,
			);
		});

		test('should preserve multiple generics on method shorthand', async () => {
			await expectPrettierFormat(
				`const obj = {
  method<V, T, U>(): { build: () => V; data: T; key: U } {
    return null as any;
  },
};`,
				`const obj = {
  method<V, T, U>(): { build: () => V; data: T; key: U } {
    return null as any;
  },
};
`,
				{ singleQuote: true },
			);
		});

		test('respects arrowParens option', async () => {
			await expectPrettierFormat(
				`function inputRef(node) {
	const removeListener = on(node, 'input', e => { value = e.target.value; console.log(value) });

	return () => { removeListener(); }
}`,
				`function inputRef(node) {
  const removeListener = on(node, 'input', (e) => {
    value = e.target.value;
    console.log(value);
  });

  return () => {
    removeListener();
  };
}
`,
				{ singleQuote: true, arrowParens: 'always' },
			);
		});

		test('keeps one new line between comment blocks and code if 1 or more exist', async () => {
			await expectPrettierFormat(
				`// comments
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








//yet more`,
				`// comments
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

//yet more
`,
				{ singleQuote: true, arrowParens: 'always' },
			);
		});

		test('keeps one new line comments and functions when 1 or more exist', async () => {
			await expectPrettierFormat(
				`export function App() {
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
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, arrowParens: 'always' },
			);
		});

		test('correctly formats array of objects and keys as either literals or identifiers', async () => {
			await expectPrettierFormat(
				`const tt = [
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
];`,
				`const tt = [
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
];
`,
				{ singleQuote: true, arrowParens: 'always' },
			);
		});

		test('preserves typescript parameter types with a default value', async () => {
			await expectPrettierFormat(
				`function getString(e: string = 'test') {
  return e;
}`,
				`function getString(e: string = 'test') {
  return e;
}
`,
				{ singleQuote: true },
			);
		});

		test('should format TypeScript enums', async () => {
			await expectPrettierFormat(
				`enum Color{Red,Green,Blue}`,
				`enum Color {
  Red,
  Green,
  Blue,
}
`,
				{ singleQuote: true },
			);
		});

		test('should format TypeScript enums with values', async () => {
			await expectPrettierFormat(
				`enum Status{Active=1,Inactive=0,Pending=2}`,
				`enum Status {
  Active = 1,
  Inactive = 0,
  Pending = 2,
}
`,
				{ singleQuote: true },
			);
		});

		test('should format const enums', async () => {
			await expectPrettierFormat(
				`const enum Direction{Up,Down,Left,Right}`,
				`const enum Direction {
  Up,
  Down,
  Left,
  Right,
}
`,
				{ singleQuote: true },
			);
		});

		test('should respect trailingComma option for enums', async () => {
			await expectPrettierFormat(
				`enum Size{Small,Medium,Large}`,
				`enum Size {
  Small,
  Medium,
  Large
}
`,
				{ singleQuote: true, trailingComma: 'none' },
			);
		});

		test('should format enums with string values', async () => {
			await expectPrettierFormat(
				`enum Colors{Red='red',Green='green',Blue='blue'}`,
				`enum Colors {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
`,
				{ singleQuote: true },
			);
		});

		test('should keep the return type annotation intact on an arrow function', async () => {
			await expectPrettierFormat(
				`const getParams = (): Params<T> => ({});
interface Params<T> {}`,
				`const getParams = (): Params<T> => ({});
interface Params<T> {}
`,
				{ singleQuote: true },
			);
		});

		test('preserves multiple regex patterns', async () => {
			await expectPrettierFormat(
				`export function App() {
  let html = '<div>Hello</div><span>World</span>';
  let divMatch = html.match(/<div>/g);
  let spanReplace = html.replace(/<span>/g, '[SPAN]');
  let allTags = html.split(/<br>/);
}`,
				`export function App() {
  let html = '<div>Hello</div><span>World</span>';
  let divMatch = html.match(/<div>/g);
  let spanReplace = html.replace(/<span>/g, '[SPAN]');
  let allTags = html.split(/<br>/);
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('preserves regex literals in variable assignments', async () => {
			await expectPrettierFormat(
				`export function App() {
  let spanRegex = /<span>/g;
  let divRegex = /<div>/;
  let simpleRegex = /<br>/g;
}`,
				`export function App() {
  let spanRegex = /<span>/g;
  let divRegex = /<div>/;
  let simpleRegex = /<br>/g;
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('distinguishes regex from JSX', async () => {
			await expectFormat(
				`export function App() {
  let htmlString = '<p>Paragraph</p>';
  let paragraphs = htmlString.match(/<p>/g);
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}`,
				`export function App() {
  let htmlString = '<p>Paragraph</p>';
  let paragraphs = htmlString.match(/<p>/g);
  <div class="container">
    <p>{'Some Random text'}</p>
  </div>
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('should handle edge case regex patterns', async () => {
			await expectPrettierFormat(
				`export function Test() {
  let text = '<<test>> <span>content</span>';
  let multiAngle = text.match(/<span>/);
  let simplePattern = text.match(/<>/);
}`,
				`export function Test() {
  let text = '<<test>> <span>content</span>';
  let multiAngle = text.match(/<span>/);
  let simplePattern = text.match(/<>/);
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('collapses multiple blank lines between statements', async () => {
			await expectPrettierFormat(
				`export function App() {
  let a = 1;


  let b = 2;
}`,
				`export function App() {
  let a = 1;

  let b = 2;
}
`,
				{ singleQuote: true },
			);
		});

		test('remove all blank lines in empty statement', async () => {
			await expectPrettierFormat(
				`export function App() {



}`,
				`export function App() {}
`,
				{ singleQuote: true },
			);
		});

		test('removes leading blank line at file start', async () => {
			await expectPrettierFormat(
				`

export function App() {
  let x = 1;
}`,
				`export function App() {
  let x = 1;
}
`,
				{ singleQuote: true },
			);
		});

		test('removes trailing blank line at file end (preserves single newline)', async () => {
			await expectPrettierFormat(
				`export function App() {
  let x = 1;
}

`,
				`export function App() {
  let x = 1;
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank lines immediately after opening brace', async () => {
			await expectPrettierFormat(
				`export function App() {

  let x = 1;
  let y = 2;
}`,
				`export function App() {
  let x = 1;
  let y = 2;
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank lines immediately before closing brace', async () => {
			await expectPrettierFormat(
				`export function App() {
  let x = 1;
  let y = 2;

}`,
				`export function App() {
  let x = 1;
  let y = 2;
}
`,
				{ singleQuote: true },
			);
		});

		test('removes leading blank line inside if block', async () => {
			await expectPrettierFormat(
				`export function App() {
  if (true) {

    console.log('test');
  }
}`,
				`export function App() {
  if (true) {
    console.log('test');
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('removes trailing blank line inside if block', async () => {
			await expectPrettierFormat(
				`export function App() {
  if (true) {
    console.log('test');

  }
}`,
				`export function App() {
  if (true) {
    console.log('test');
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves blank lines between array elements when multi-line', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [
    1,

    2,

    3
  ];
}`,
				`export function App() {
  let arr = [
    1,

    2,

    3,
  ];
}
`,
				{ singleQuote: true },
			);
		});

		test('respects trailingComma none in arrays with blank lines between elements', async () => {
			await expectPrettierFormat(
				`const values = [
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
];`,
				`const values = [
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
const holed = [1, 2, ,];
`,
				{ trailingComma: 'none' },
			);
		});

		test('preserves blank lines between object properties when multi-line', async () => {
			await expectPrettierFormat(
				`export function App() {
  let obj = {
    a: 1,

    b: 2,

    c: 3
  };
}`,
				`export function App() {
  let obj = {
    a: 1,

    b: 2,

    c: 3,
  };
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves blank lines between function parameters when multi-line', async () => {
			await expectPrettierFormat(
				`export function App() {
  function test(
    a,

    b,

    c
  ) {
    return a + b + c;
  }
}`,
				`export function App() {
  function test(
    a,

    b,

    c,
  ) {
    return a + b + c;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves blank lines between call arguments when multi-line', async () => {
			await expectPrettierFormat(
				`export function App() {
  console.log(
    'first',

    'second',

    'third',
  );
}`,
				`export function App() {
  console.log(
    'first',

    'second',

    'third',
  );
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately after opening paren in params', async () => {
			await expectPrettierFormat(
				`export function App() {
  function foo(

    a,
    b
  ) {
    return a + b;
  }
}`,
				`export function App() {
  function foo(a, b) {
    return a + b;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately before closing paren in params', async () => {
			await expectPrettierFormat(
				`export function App() {
  function foo(
    a,
    b

  ) {
    return a + b;
  }
}`,
				`export function App() {
  function foo(a, b) {
    return a + b;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately after opening paren in call', async () => {
			await expectPrettierFormat(
				`export function App() {
  foo(

    'a',
    'b'
  );
}`,
				`export function App() {
  foo('a', 'b');
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately after opening bracket in array', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [

    1,
    2,
    3
  ];
}`,
				`export function App() {
  let arr = [1, 2, 3];
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately before closing bracket in array', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [
    1,
    2,
    3

  ];
}`,
				`export function App() {
  let arr = [1, 2, 3];
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately after opening brace in object', async () => {
			await expectPrettierFormat(
				`export function App() {
  let obj = {

    a: 1,
    b: 2
  };
}`,
				`export function App() {
  let obj = {
    a: 1,
    b: 2,
  };
}
`,
				{ singleQuote: true },
			);
		});

		test('removes blank line immediately before closing brace in object', async () => {
			await expectPrettierFormat(
				`export function App() {
  let obj = {
    a: 1,
    b: 2

  };
}`,
				`export function App() {
  let obj = {
    a: 1,
    b: 2,
  };
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves internal blank lines but removes leading/trailing in params', async () => {
			await expectPrettierFormat(
				`export function App() {
  function foo(

    a,

    b,

    c

  ) {
    return a + b + c;
  }
}`,
				`export function App() {
  function foo(
    a,

    b,

    c,
  ) {
    return a + b + c;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves internal blank lines but removes leading/trailing in arrays', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [

    1,

    2,

    3

  ];
}`,
				`export function App() {
  let arr = [
    1,

    2,

    3,
  ];
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves internal blank lines but removes leading/trailing in objects', async () => {
			await expectPrettierFormat(
				`export function App() {
  let obj = {

    a: 1,

    b: 2,

    c: 3

  };
}`,
				`export function App() {
  let obj = {
    a: 1,

    b: 2,

    c: 3,
  };
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves blank lines between top-level statements', async () => {
			await expectPrettierFormat(
				`export function App() {
  let x = 1;

  let y = 2;

  console.log(x, y);
}`,
				`export function App() {
  let x = 1;

  let y = 2;

  console.log(x, y);
}
`,
				{ singleQuote: true },
			);
		});

		test('preserves blank lines between class members', async () => {
			await expectPrettierFormat(
				`class Foo {
  method1() {
    return 1;
  }

  method2() {
    return 2;
  }

  method3() {
    return 3;
  }
}`,
				`class Foo {
  method1() {
    return 1;
  }

  method2() {
    return 2;
  }

  method3() {
    return 3;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should keep blank line between components with a trailing comment at the end of the first', async () => {
			await expectFormat(
				`function SVG({ children }) {
  <svg width={20} height={20} fill="blue" viewBox="0 0 30 10" preserveAspectRatio="none">
    let test = track(8);
    {test}
    <polygon points="0,0 30,0 15,10" />
  </svg>
  // <div>{children}</div>
}

function Polygon() {
  <polygon points="0,0 30,0 15,10" />
}`,
				`function SVG({ children }) {
  <svg width={20} height={20} fill="blue" viewBox="0 0 30 10" preserveAspectRatio="none">
    let test = track(8);
    {test}
    <polygon points="0,0 30,0 15,10" />
  </svg>
  // <div>{children}</div>
}

function Polygon() {
  <polygon points="0,0 30,0 15,10" />
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('inlines array elements when they fit within printWidth', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`,
				`export function App() {
  let arr = [
    1, 2, 3, 4, 5,

    6, 7,

    8,
  ];
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('breaks array elements when they exceed printWidth 10', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`,
				`export function App() {
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
}
`,
				{ singleQuote: true, printWidth: 10 },
			);
		});

		test('fits elements on same line with printWidth 11', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`,
				`export function App() {
  let arr =
    [
      1, 2,
      3, 4,
      5,

      6, 7,

      8,
    ];
}
`,
				{ singleQuote: true, printWidth: 11 },
			);
		});

		test('fits more elements with printWidth 15', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`,
				`export function App() {
  let arr = [
    1, 2, 3, 4,
    5,

    6, 7,

    8,
  ];
}
`,
				{ singleQuote: true, printWidth: 15 },
			);
		});

		test('fits even more elements with printWidth 18', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [1, 2, 3, 4, 5,

    6, 7,

    8];
}`,
				`export function App() {
  let arr = [
    1, 2, 3, 4, 5,

    6, 7,

    8,
  ];
}
`,
				{ singleQuote: true, printWidth: 18 },
			);
		});

		test('places each object on its own line when array contains objects where each has multiple properties', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [{ a: 1, b: 2 }, { c: 3, d: 4 }, { e: 5, f: 6 }];
}`,
				`export function App() {
  let arr = [
    { a: 1, b: 2 },
    { c: 3, d: 4 },
    { e: 5, f: 6 },
  ];
}
`,
				{ singleQuote: true },
			);
		});

		test('allows inline when array has single-property objects', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [{ a: 1 }, { b: 2 }, { c: 3 }];
}`,
				`export function App() {
  let arr = [{ a: 1 }, { b: 2 }, { c: 3 }];
}
`,
				{ singleQuote: true },
			);
		});

		test('allows inline when array has mix of single and multi-property objects', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [{ a: 1 }, { b: 2, c: 3 }, { d: 4 }];
}`,
				`export function App() {
  let arr = [{ a: 1 }, { b: 2, c: 3 }, { d: 4 }];
}
`,
				{ singleQuote: true },
			);
		});

		test('respects original formatting when array has mixture of inline and multi-line objects', async () => {
			await expectPrettierFormat(
				`export function App() {
  let arr = [{ a: 1, b: 2 }, {
    c: 3,
    d: 4
  }, { e: 5, f: 6 }];
}`,
				`export function App() {
  let arr = [
    { a: 1, b: 2 },
    {
      c: 3,
      d: 4,
    },
    { e: 5, f: 6 },
  ];
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve get and set keywords in object methods', async () => {
			await expectPrettierFormat(
				`const foo = {
    get bar() {
        return 0
    },

    set baz(arg: 0) {
        //
    }
}`,
				`const foo = {
  get bar() {
    return 0;
  },

  set baz(arg: 0) {
    //
  },
};
`,
			);
		});

		test('should format simple if statement with non-block body', async () => {
			await expectFormat(
				`function Test() {
  let x = 0;
  if (x === 0) x = 1;
  <div>{x}</div>
}`,
				`function Test() {
  let x = 0;
  if (x === 0) x = 1;
  <div>{x}</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should format if-else with non-block bodies', async () => {
			await expectFormat(
				`function Test() {
  let x = 0;
  if (x === 0) x = 1; else x = 2;
  <div>{x}</div>
}`,
				`function Test() {
  let x = 0;
  if (x === 0) x = 1;
  else x = 2;
  <div>{x}</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should format nested if statements with non-block bodies', async () => {
			await expectFormat(
				`function Test() {
  let x = 0;
  if (x === 0) if (x === 1) x = 2; else x = 3;
  <div>{x}</div>
}`,
				`function Test() {
  let x = 0;
  if (x === 0)
    if (x === 1) x = 2;
    else x = 3;
  <div>{x}</div>
}
`,
				{ singleQuote: true },
			);
		});

		test('should not move comments before while statement into the test condition', async () => {
			await expectPrettierFormat(
				`function test() {
  let i = 0;
  // comment before while
  while (i < 10) {
    i++;
  }
}`,
				`function test() {
  let i = 0;
  // comment before while
  while (i < 10) {
    i++;
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should not move comments before for-of statement into the right expression', async () => {
			await expectPrettierFormat(
				`function test() {
  // comment before for-of
  for (const item of items) {
    console.log(item);
  }
}`,
				`function test() {
  // comment before for-of
  for (const item of items) {
    console.log(item);
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should not move comments before switch statement into the discriminant', async () => {
			await expectPrettierFormat(
				`function test() {
  let x = 1;
  // comment before switch
  switch (x) {
    case 1:
      console.log('one');
  }
}`,
				`function test() {
  let x = 1;
  // comment before switch
  switch (x) {
    case 1:
      console.log('one');
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle multiple comments before if statement', async () => {
			await expectPrettierFormat(
				`function test() {
  // comment 1
  // comment 2
  if (true) {
    console.log('test');
  }
}`,
				`function test() {
  // comment 1
  // comment 2
  if (true) {
    console.log('test');
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle comments before try/catch blocks', async () => {
			await expectPrettierFormat(
				`function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  }
}`,
				`function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle comments before try/catch/finally blocks', async () => {
			await expectPrettierFormat(
				`function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  } finally {
    cleanup();
  }
}`,
				`function test() {
  // comment before try
  try {
    doSomething();
  } catch (e) {
    console.error(e);
  } finally {
    cleanup();
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle comments inside try/catch blocks', async () => {
			await expectPrettierFormat(
				`function test() {
  try {
    // comment inside try
    doSomething();
  } catch (e) {
    // comment inside catch
    console.error(e);
  }
}`,
				`function test() {
  try {
    // comment inside try
    doSomething();
  } catch (e) {
    // comment inside catch
    console.error(e);
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should handle block comments with try/catch', async () => {
			await expectPrettierFormat(
				`function test() {
  /* block comment before try */
  try {
    doSomething();
  } catch (e) {
    /* block comment in catch */
    console.error(e);
  }
}`,
				`function test() {
  /* block comment before try */
  try {
    doSomething();
  } catch (e) {
    /* block comment in catch */
    console.error(e);
  }
}
`,
				{ singleQuote: true },
			);
		});

		test('should format explicit tsx arrow returns like tsrx blocks', async () => {
			await expectFormat(
				`function Test(props) {
	const func = (item) => <><ItemView item={item} onSelect={props.onSelect} /></>;

	<List
	items={props.items}
	renderItem={(item) => <><ItemView item={item} onSelect={props.onSelect} /></>}
	/>
}`,
				`function Test(props) {
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
}
`,
			);
		});

		test('should format template arrow returns in TSX attributes like TSRX attributes', async () => {
			await expectPrettierFormat(
				`function Test(props) {
	const view = <>
	<List
		items={props.items}
		renderItem={(item) => <><ItemView item={item} onSelect={props.onSelect} /></>}
	/>
	</>;
}`,
				`function Test(props) {
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
}
`,
			);
		});

		test('should preserve JSX spread attributes inside explicit tsx blocks', async () => {
			await expectPrettierFormat(
				`const props = {};
const foo = <><Bar {...props} /></>;`,
				`const props = {};
const foo = (
  <>
    <Bar {...props} />
  </>
);
`,
				{ singleQuote: true },
			);
		});

		test('respects the semi false option', async () => {
			await expectFormat(
				`export function Test() {
  const a = 1
  const b = 2
  <div>{a + b}</div>
}`,
				`export function Test() {
  const a = 1
  const b = 2
  <div>{a + b}</div>
}
`,
				{ singleQuote: true, semi: false },
			);
		});

		test('respects the semi true option', async () => {
			await expectFormat(
				`export function Test() {
  const a = 1
  const b = 2
  <div>{a + b}</div>
}`,
				`export function Test() {
  const a = 1;
  const b = 2;
  <div>{a + b}</div>
}
`,
				{ singleQuote: true, semi: true },
			);
		});

		test('should handle bracketSameLine correctly', async () => {
			await expectFormat(
				`function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`,
				`function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button">
    {'this is a button'}
  </button>
}
`,
				{ singleQuote: true, printWidth: 40, bracketSameLine: true },
			);
		});

		test('should respect singleAttributePerLine set to true setting', async () => {
			await expectFormat(
				`function One() {
  <button
    class="some-class" something="should" not="go" wrong="at all"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`,
				`function One() {
  <button
    class="some-class"
    something="should"
    not="go"
    wrong="at all"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}
`,
				{ singleQuote: true, printWidth: 100, singleAttributePerLine: true },
			);
		});

		test('should respect singleAttributePerLine set to false setting', async () => {
			await expectFormat(
				`function One() {
  <button
    class="some-class"
    something="should"
    not="go"
    wrong="at all"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`,
				`function One() {
  <button class="some-class" something="should" not="go" wrong="at all" id="this-is-a-button">
    {'this is a button'}
  </button>
}
`,
				{ singleQuote: true, printWidth: 100, singleAttributePerLine: false },
			);
		});

		test('should format object in attribute with spaces at each side', async () => {
			await expectFormat(
				`function App() {
  <button
  class="test another"
  onClick={{handleEvent: handler}}>{'Click Me'}</button>
}`,
				`function App() {
  <button class="test another" onClick={{ handleEvent: handler }}>
    {'Click Me'}
  </button>
}
`,
				{ singleQuote: true },
			);
		});

		test('should prefer breaking attributes over inline breakable object values', async () => {
			await expectFormat(
				`function App() {
  <div class={styles.item} data-active={state.active ? "true" : "false"} style={{ gridTemplateColumns: Icon ? "16px minmax(0, 1fr) auto" : "minmax(0, 1fr) auto" }}>
    {'content'}
  </div>
}`,
				`function App() {
  <div class={styles.item} data-active={state.active ? 'true' : 'false'} style={{ gridTemplateColumns: Icon ? '16px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}>
    {'content'}
  </div>
}
`,
				{ singleQuote: true, printWidth: 200 },
			);
		});

		test('should prefer breaking attributes over inline breakable object values (bracketSameLine)', async () => {
			await expectFormat(
				`function App() {
  <div class={styles.item} data-active={state.active ? "true" : "false"} style={{ gridTemplateColumns: Icon ? "16px minmax(0, 1fr) auto" : "minmax(0, 1fr) auto" }}>
    {'content'}
  </div>
}`,
				`function App() {
  <div class={styles.item} data-active={state.active ? 'true' : 'false'} style={{ gridTemplateColumns: Icon ? '16px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}>
    {'content'}
  </div>
}
`,
				{ singleQuote: true, printWidth: 200, bracketSameLine: true },
			);
		});

		test('should preserve fragment shorthand in class methods', async () => {
			await expectPrettierFormat(
				`class Foo {
	bar() {
	return <>{"Hello"}</>;
	}
}`,
				`class Foo {
  bar() {
    return <>{'Hello'}</>;
  }
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should handle default arguments correctly', async () => {
			await expectFormat(
				`function Expand({ name, startingLength = 10 }: { name: string; startingLength?: number }) {
  <div></div>
}`,
				`function Expand({
  name,
  startingLength = 10,
}: {
  name: string;
  startingLength?: number;
}) {
  <div></div>
}
`,
				{ singleQuote: true, printWidth: 80 },
			);
		});

		test('should break long direct text children after inline attributes', async () => {
			await expectPrettierFormat(
				`function App() {
  return <span
      class={styles.notificationMessage}
  >The report is ready. Review the summary before sharing it with the team.</span>
}`,
				`function App() {
  return (
    <span class={styles.notificationMessage}>
      The report is ready. Review the summary before sharing it with the team.
    </span>
  );
}
`,
				{ printWidth: 80 },
			);
		});

		test('should preserve generic type arguments on self-closing JSX function tags', async () => {
			await expectFormat(
				`function Box<T>({ value }: { value: T }) {
	<div>{String(value)}</div>
}
export function App() {
	<Box<string> value="hi" />
}`,
				`function Box<T>({ value }: { value: T }) {
  <div>{String(value)}</div>
}
export function App() {
  <Box<string> value="hi" />
}
`,
			);
		});

		test('should format chained if-else statements with non-block bodies on separate lines', async () => {
			await expectFormat(
				`function Test() {
  <button
    onClick={() => {
if (status === 'a') status = 'b'; else if (status === 'b') status = 'c'; else status =
  'a';
}}
  >
    {'Click'}
  </button>
}`,
				`function Test() {
  <button
    onClick={() => {
      if (status === 'a') status = 'b';
      else if (status === 'b') status = 'c';
      else status = 'a';
    }}
  >
    {'Click'}
  </button>
}
`,
				{ singleQuote: true },
			);
		});

		test('should break up attributes on new lines if line length exceeds printWidth', async () => {
			await expectFormat(
				`function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}`,
				`function One() {
  <button
    class="some-class another-class yet-another-class class-with-a-long-name"
    id="this-is-a-button"
  >
    {'this is a button'}
  </button>
}
`,
				{ singleQuote: true, printWidth: 40 },
			);
		});

		test('should be idempotent when reformatting a formatted <script> body', async () => {
			await expectFormat(
				`<script>const i = 2;</script>`,
				`<script>
  const i = 2;
</script>;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should keep an unparseable <script> body verbatim', async () => {
			await expectFormat(
				`<script>const broken = ;</script>`,
				`<script>
  const broken = ;
</script>;
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve the blank line between a function and text literal sibling inside element', async () => {
			await expectFormat(
				`function Something({ children }) {
  const test = 'yo';
  <Another>
    {\`Content inside \${test} Another component\`}
    function children()
    {<span>{'Child Component'}</span>}
  </Another>
}`,
				`function Something({ children }) {
  const test = 'yo';
  <Another>
    {\`Content inside \${test} Another component\`}
    function children()
    {<span>{'Child Component'}</span>}
  </Another>
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve comments in destructured typed function parameters', async () => {
			await expectFormat(
				`function Child({
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
}`,
				`function Child({
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
}
`,
			);
		});

		test('should preserve comments inside js/ts blocks inside markup', async () => {
			await expectFormat(
				`function App() {
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
}`,
				`function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should not insert a new line between js and jsx if not provided', async () => {
			await expectFormat(
				`export function App() {
  let text = 'something';
  <div>{String(text)}</div>
}`,
				`export function App() {
  let text = 'something';
  <div>{String(text)}</div>
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('should keep a new line between js and jsx if provided', async () => {
			await expectFormat(
				`export function App() {
  let text = 'something';
  <div>{String(text)}</div>
}`,
				`export function App() {
  let text = 'something';
  <div>{String(text)}</div>
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('preserves regex literals in method calls', async () => {
			await expectFormat(
				`export function App() {
  let text = 'Hello <span>world</span>';
  let result = text.match(/<span>/);
  <div>{String(result)}</div>
}`,
				`export function App() {
  let text = 'Hello <span>world</span>';
  let result = text.match(/<span>/);
  <div>{String(result)}</div>
}
`,
				{ singleQuote: true, arrowParens: 'always', printWidth: 100 },
			);
		});

		test('should handle async/await in function body', async () => {
			await expectPrettierFormat(
				`export async function Test(){const data=await fetchData();data}`,
				`export async function Test() {
  const data = await fetchData();
  data;
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve function properties in named, legacy anonymous, and arrow forms', async () => {
			await expectPrettierFormat(
				`const UI = {
  span: function Span() {
    return <span>{'Hello from Span'}</span>;
  },
  button: function ({ children }) {
    return <button>{children}</button>;
  },
  arrowButton: ({ children }) => {
    return <button>{children}</button>;
  },
};`,
				`const UI = {
  span: function Span() {
    return <span>{'Hello from Span'}</span>;
  },
  button: function ({ children }) {
    return <button>{children}</button>;
  },
  arrowButton: ({ children }) => {
    return <button>{children}</button>;
  },
};
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve direct double-quoted text children', async () => {
			await expectPrettierFormat(
				`export function App(){return <div>Hello & 'TSRX'</div>}`,
				`export function App() {
  return <div>Hello & 'TSRX'</div>;
}
`,
				{ singleQuote: true },
			);
		});

		test('should preserve comments above attributes on dom elements', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div
      // @tsrx-ignore
      something="test"
    >
      test
    </div>
  );
}`,
				`function App() {
  return (
    <div
      // @tsrx-ignore
      something="test"
    >
      test
    </div>
  );
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should preserve comments above attributes on components', async () => {
			await expectPrettierFormat(
				`function App() {
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
}`,
				`function App() {
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
}
`,
				{ singleQuote: true, printWidth: 100 },
			);
		});

		test('should wrap direct double-quoted text children idempotently', async () => {
			await expectPrettierFormat(
				`function App() {
  return <p class="lede">
    Set up TSRX with React, Preact, Solid, Vue, or Ripple and then wire in the editor tooling that makes
    <code class="inline-code">.tsrx</code>
    files feel native in the rest of your repo.
  </p>
}`,
				`function App() {
  return (
    <p class="lede">
      Set up TSRX with React, Preact, Solid, Vue, or Ripple and then wire in the editor tooling that
      makes
      <code class="inline-code">.tsrx</code>
      files feel native in the rest of your repo.
    </p>
  );
}
`,
				{ printWidth: 100 },
			);
		});

		test('should wrap long direct text children when elements break', async () => {
			await expectPrettierFormat(
				`function App() {
  return <span class={styles.notificationMessage}>The report is ready. Review the summary before sharing it with the team.</span>
}`,
				`function App() {
  return (
    <span class={styles.notificationMessage}>
      The report is ready. Review the summary before sharing it with
      the team.
    </span>
  );
}
`,
				{ printWidth: 70 },
			);
			await expectPrettierFormat(
				`function App() {
  return <span class={styles.notificationMessage}>The report is ready. Review the summary before sharing it with the team.</span>
}`,
				`function App() {
  return (
    <span
      class={styles.notificationMessage}
    >
      The report is ready. Review the
      summary before sharing it with the
      team.
    </span>
  );
}
`,
				{ printWidth: 40 },
			);
		});
	});

	describe('parens around as-cast operands', () => {
		test('keeps parens around a nullish coalescing operand of an as-cast', async () => {
			await expectPrettierFormat(
				`function App() {
  return <span>{(activeAuthor ?? "All authors") as string}</span>;
}`,
				`function App() {
  return <span>{(activeAuthor ?? "All authors") as string}</span>;
}
`,
			);
		});

		test('keeps parens around logical and equality operands of as-casts', async () => {
			await expectPrettierFormat(
				`function App() {
  const a = (x || y) as string;
  const b = (x == y) as boolean;
  const c = (x ?? y) satisfies string;
  return <div>{a}</div>;
}`,
				`function App() {
  const a = (x || y) as string;
  const b = (x == y) as boolean;
  const c = (x ?? y) satisfies string;
  return <div>{a}</div>;
}
`,
			);
		});

		test('adds parens around binary operands of as-casts like Prettier', async () => {
			await expectPrettierFormat(
				`function App() {
  const a = x + y as string;
  const b = x < y as unknown;
  return <div>{a}</div>;
}`,
				`function App() {
  const a = (x + y) as string;
  const b = (x < y) as unknown;
  return <div>{a}</div>;
}
`,
			);
		});
	});

	describe('parenthesized callees and member objects break inside their parentheses', () => {
		test('moves a broken await onto its own line inside its parentheses', async () => {
			await expectPrettierFormat(
				`async function load() {
  const value = (await loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)).value;
  const exportsOfModule = (await dynamicImport(pathToTheModule, { with: { type: "json" } })).exports;
  const handler = (await getHandlerForTheCurrentRequest(requestIdentifier, anotherArgument))(event);
  const optional = (await loadTheConfigurationFileFromDiskAndMore(somePathVariable, anotherArgum))?.value;
}`,
				`async function load() {
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
}
`,
			);
		});

		test('keeps await (await together and leaves new, non-null, and yield as they were', async () => {
			await expectPrettierFormat(
				`async function load() {
  const value = await (await loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)).json();
  const instance = new (await loadTheConfigurationFileFromDiskAndMore(somePathVariable, anotherArgument))();
  const asserted = (await loadTheConfigurationFileFromDiskAndMore(somePathVariable, anotherArgum))!.value;
}
function* generate() {
  const value = (yield loadTheConfigurationFileFromDisk(somePathVariable, anotherArgument)).value;
}`,
				`async function load() {
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
}
`,
			);
		});

		test('moves a broken as or satisfies cast onto its own line inside its parentheses', async () => {
			await expectPrettierFormat(
				`const value = (someObject.someLongPropertyName as SomeVeryLongInterfaceName<WithTypeArgs>).value;
const result = (handlerForTheRequest satisfies RequestHandlerFunctionType<Context>)(event, ctx);
const inst = new (someFactoryFunctionResult as unknown as ConstructorTypeForTheThing<Aaaa>)();
const short = (value as Entry).name;`,
				`const value = (
  someObject.someLongPropertyName as SomeVeryLongInterfaceName<WithTypeArgs>
).value;
const result = (
  handlerForTheRequest satisfies RequestHandlerFunctionType<Context>
)(event, ctx);
const inst = new (
  someFactoryFunctionResult as unknown as ConstructorTypeForTheThing<Aaaa>
)();
const short = (value as Entry).name;
`,
			);
		});
	});

	describe('comments on a function called right away or used as a tag', () => {
		test('prints "(/* c */ function () {})();" like Prettier', async () => {
			await expectPrettierFormat(
				`(/* c */ function () {})();`,
				`(
  /* c */ function () {}
)();
`,
			);
		});

		test('prints "(/* c */ () => {})();" like Prettier', async () => {
			await expectPrettierFormat(
				`(/* c */ () => {})();`,
				`(
  /* c */ () => {}
)();
`,
			);
		});

		test('prints "(function () {} /* c */)();" like Prettier', async () => {
			await expectPrettierFormat(
				`(function () {} /* c */)();`,
				`(
  function () {} /* c */
)();
`,
			);
		});

		test('prints "(m => m /* c */)(x);" like Prettier', async () => {
			await expectPrettierFormat(
				`(m => m /* c */)(x);`,
				`(
  (m) => m /* c */
)(x);
`,
			);
		});

		test('prints "(function () {} /* a */ /* b */)(x);" like Prettier', async () => {
			await expectPrettierFormat(
				`(function () {} /* a */ /* b */)(x);`,
				`(
  function () {} /* a */ /* b */
)(x);
`,
			);
		});

		test('prints "(m => m /* c */)`x`;" like Prettier', async () => {
			await expectPrettierFormat(
				`(m => m /* c */)\`x\`;`,
				`(
  (m) => m /* c */
)\`x\`;
`,
			);
		});

		test('prints "x = (m => m /* c */)(x);" like Prettier', async () => {
			await expectPrettierFormat(
				`x = (m => m /* c */)(x);`,
				`x = ((m) => m /* c */)(x);
`,
			);
		});

		test('prints "(/* c */ function () {})`x`;" like Prettier', async () => {
			await expectPrettierFormat(
				`(/* c */ function () {})\`x\`;`,
				`(
  /* c */ function () {}
)\`x\`;
`,
			);
		});

		test('prints "(/* c */ async () => {})?.();" like Prettier', async () => {
			await expectPrettierFormat(
				`(/* c */ async () => {})?.();`,
				`(
  /* c */ async () => {}
)?.();
`,
			);
		});

		test('prints "(function () {} // c\\n)();" like Prettier', async () => {
			await expectPrettierFormat(
				`(function () {} // c
)();`,
				`(
  function () {} // c
)();
`,
			);
		});

		test('prints "!(/* c */ function () {})();" like Prettier', async () => {
			await expectPrettierFormat(
				`!(/* c */ function () {})();`,
				`!(
  /* c */ function () {}
)();
`,
			);
		});

		test('prints "x = (/* c */ function () {})();" like Prettier', async () => {
			await expectPrettierFormat(
				`x = (/* c */ function () {})();`,
				`x = (/* c */ function () {})();
`,
			);
		});

		test('prints "x = (/* c */ () => {})`x`;" like Prettier', async () => {
			await expectPrettierFormat(
				`x = (/* c */ () => {})\`x\`;`,
				`x = (/* c */ () => {})\`x\`;
`,
			);
		});

		test('prints "(/* c */ function () {\\n  run();\\n})();" like Prettier', async () => {
			await expectPrettierFormat(
				`(/* c */ function () {
  run();
})();`,
				`(
  /* c */ function () {
    run();
  }
)();
`,
			);
		});

		test('prints "(\\n  // prettier-ignore\\n  function () {  }\\n)();" like Prettier', async () => {
			await expectPrettierFormat(
				`(
  // prettier-ignore
  function () {  }
)();`,
				`(
  // prettier-ignore
  function () {  }
)();
`,
			);
		});

		test('keeps "(\\n  // c\\n  function () {}\\n)();"', async () => {
			await expectPrettierFormat(
				`(
  // c
  function () {}
)();`,
				`(
  // c
  function () {}
)();
`,
			);
		});

		test('keeps "x = (\\n  // c\\n  function () {}\\n)();"', async () => {
			await expectPrettierFormat(
				`x = (
  // c
  function () {}
)();`,
				`x = (
  // c
  function () {}
)();
`,
			);
		});

		test('keeps "const y = (\\n  // c\\n  () => {\\n    run();\\n  }\\n)();"', async () => {
			await expectPrettierFormat(
				`const y = (
  // c
  () => {
    run();
  }
)();`,
				`const y = (
  // c
  () => {
    run();
  }
)();
`,
			);
		});

		test('keeps "foo((/* c */ () => {})());"', async () => {
			await expectPrettierFormat(
				`foo((/* c */ () => {})());`,
				`foo((/* c */ () => {})());
`,
			);
		});

		test('keeps "export default (\\n  /* c */ function () {}\\n)();"', async () => {
			await expectPrettierFormat(
				`export default (
  /* c */ function () {}
)();`,
				`export default (
  /* c */ function () {}
)();
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    (\\n      // c\\n      function () {}\\n    )()\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    (
      // c
      function () {}
    )()
  );
}`,
				`function g() {
  return (
    (
      // c
      function () {}
    )()
  );
}
`,
			);
		});

		test('keeps "function* g() {\\n  yield (\\n    // c\\n    function () {}\\n  )();\\n}"', async () => {
			await expectPrettierFormat(
				`function* g() {
  yield (
    // c
    function () {}
  )();
}`,
				`function* g() {
  yield (
    // c
    function () {}
  )();
}
`,
			);
		});

		test('keeps "a;\\n(\\n  /* c */ function () {}\\n)();"', async () => {
			await expectPrettierFormat(
				`a;
(
  /* c */ function () {}
)();`,
				`a;
(
  /* c */ function () {}
)();
`,
			);
		});

		test('puts the leading semicolon before the parentheses with semi: false', async () => {
			await expectPrettierFormat(
				`a
;(/* c */ function () {})()`,
				`a
;(
  /* c */ function () {}
)()
`,
				{ semi: false },
			);
		});

		test('keeps "const x = ((a) => b /* c */)(1);"', async () => {
			await expectPrettierFormat(
				`const x = ((a) => b /* c */)(1);`,
				`const x = ((a) => b /* c */)(1);
`,
			);
		});

		test('keeps "((a) => (b, c /* c */))(1);"', async () => {
			await expectPrettierFormat(
				`((a) => (b, c /* c */))(1);`,
				`((a) => (b, c /* c */))(1);
`,
			);
		});

		test('keeps "((a) => (a ? b : c /* c */))(1);"', async () => {
			await expectPrettierFormat(
				`((a) => (a ? b : c /* c */))(1);`,
				`((a) => (a ? b : c /* c */))(1);
`,
			);
		});

		test('keeps "(\\n  (a) => b /* c */ /* d */\\n)(1);"', async () => {
			await expectPrettierFormat(
				`(
  (a) => b /* c */ /* d */
)(1);`,
				`(
  (a) => b /* c */ /* d */
)(1);
`,
			);
		});

		test('keeps "f((a) => b /* c */);"', async () => {
			await expectPrettierFormat(
				`f((a) => b /* c */);`,
				`f((a) => b /* c */);
`,
			);
		});

		test('prints "x = ((a) => (<div /> /* c */))(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`x = ((a) => (<div /> /* c */))(1);`,
				`x = ((a) => <div /> /* c */)(1);
`,
			);
		});

		test('prints "g(((a) => (<div /> /* c */))(1));" like Prettier', async () => {
			await expectPrettierFormat(
				`g(((a) => (<div /> /* c */))(1));`,
				`g(((a) => <div /> /* c */)(1));
`,
			);
		});

		test('prints "((a) => (<div /> /* c */))(1)(2);" like Prettier', async () => {
			await expectPrettierFormat(
				`((a) => (<div /> /* c */))(1)(2);`,
				`((a) => <div /> /* c */)(1)(2);
`,
			);
		});

		test('prints "((a) => <div /> /* c */)(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`((a) => <div /> /* c */)(1);`,
				`(
  (a) => <div /> /* c */
)(1);
`,
			);
		});

		test('prints "((a) => (<div id=\\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\" /> /* c */))(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`((a) => (<div id="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" /> /* c */))(1);`,
				`((a) => (
  <div id="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" /> /* c */
))(1);
`,
			);
		});

		test('prints "((a) => (b) => (<div className=\\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\" id=\\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\" /> /* c */))(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`((a) => (b) => (<div className="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" /> /* c */))(1);`,
				`((a) => (b) => (
  <div
    className="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  /> /* c */
))(1);
`,
			);
		});

		test('prints "((a) => (<div /> // c\\n))(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`((a) => (<div /> // c
))(1);`,
				`((a) => (
  <div /> // c
))(1);
`,
			);
		});

		test('prints "((a) => (<><div /></> /* c */))(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`((a) => (<><div /></> /* c */))(1);`,
				`((a) => (
  <>
    <div />
  </> /* c */
))(1);
`,
			);
		});

		test('keeps "((a) => (b) => (c ? d : e /* c */))(1);"', async () => {
			await expectPrettierFormat(
				`((a) => (b) => (c ? d : e /* c */))(1);`,
				`((a) => (b) => (c ? d : e /* c */))(1);
`,
			);
		});

		test('keeps "(\\n  (a) => (b) =>\\n    (x = 1 /* c */)\\n)(1);"', async () => {
			await expectPrettierFormat(
				`(
  (a) => (b) =>
    (x = 1 /* c */)
)(1);`,
				`(
  (a) => (b) =>
    (x = 1 /* c */)
)(1);
`,
			);
		});

		test('prints "new ((a) => (b // c\\n))(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`new ((a) => (b // c
))(1);`,
				`new ((a) =>
  b) // c
(1);
`,
			);
		});

		test('prints "(\\n  // prettier-ignore\\n  (a) => (b /* c */)\\n)(1);" in one pass', async () => {
			await expectPrettierFormat(
				`(
  // prettier-ignore
  (a) => (b /* c */)
)(1);`,
				`(
  // prettier-ignore
  (a) => (b /* c */)
)(1);
`,
			);
		});

		test('prints "new (\\n  // prettier-ignore\\n  (a) => (b /* c */)\\n)(1);" in one pass', async () => {
			await expectPrettierFormat(
				`new (
  // prettier-ignore
  (a) => (b /* c */)
)(1);`,
				`new // prettier-ignore
((a) => (b /* c */))(1);
`,
			);
		});

		test('keeps "/* c */ (function () {}).call(this);"', async () => {
			await expectPrettierFormat(
				`/* c */ (function () {}).call(this);`,
				`/* c */ (function () {}).call(this);
`,
			);
		});

		test('keeps "new /* c */ (function () {})();"', async () => {
			await expectPrettierFormat(
				`new /* c */ (function () {})();`,
				`new /* c */ (function () {})();
`,
			);
		});

		test('keeps "x = /* c */ function () {};"', async () => {
			await expectPrettierFormat(
				`x = /* c */ function () {};`,
				`x = /* c */ function () {};
`,
			);
		});
	});

	describe('definite assignment assertions', () => {
		test('keeps the definite assignment assertion on variable declarations', async () => {
			await expectPrettierFormat(
				`function App() {
  let cleanup!: () => void;
  var count!: number;
  return <div />;
}`,
				`function App() {
  let cleanup!: () => void;
  var count!: number;
  return <div />;
}
`,
			);
		});
	});

	describe('numeric literals', () => {
		test('prints bigint literals instead of crashing on JSON.stringify', async () => {
			await expectPrettierFormat(
				`const total = 1n;
const mask = 0xffn;`,
				`const total = 1n;
const mask = 0xffn;
`,
			);
		});

		test('keeps the authored radix, separators, and exponent of numeric literals', async () => {
			await expectPrettierFormat(
				`const a = 0xFF;
const b = 1_000_000;
const c = .5;
const d = 1e21;
const e = 1E3;
const f = 1.50;`,
				`const a = 0xff;
const b = 1_000_000;
const c = 0.5;
const d = 1e21;
const e = 1e3;
const f = 1.5;
`,
			);
		});
	});

	describe('arrays lay out like Prettier', () => {
		test('collapses a multiline array that fits', async () => {
			await expectPrettierFormat(
				`const letters = [
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
];`,
				`const letters = ["x", "y"];
foo(["a", "b"]);
const list = [first, ...rest];
`,
			);
		});

		test('keeps a blank line between elements when the array breaks', async () => {
			await expectPrettierFormat(
				`const names = [
  'aaaaaaaaaaaaaaaaaaaa',

  'bbbbbbbbbbbbbbbbbbbb',
  'cccccccccccccccccccc',
  'dddddddddddddddddddd',
];`,
				`const names = [
  "aaaaaaaaaaaaaaaaaaaa",

  "bbbbbbbbbbbbbbbbbbbb",
  "cccccccccccccccccccc",
  "dddddddddddddddddddd",
];
`,
			);
		});

		test('packs number arrays several elements per line', async () => {
			await expectPrettierFormat(
				`const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];
const signed = [
  -1,
  +2,

  3.5,
];`,
				`const numbers = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27,
];
const signed = [
  -1, +2,

  3.5,
];
`,
			);
		});

		test('breaks a matrix of arrays or of objects with several properties', async () => {
			await expectPrettierFormat(
				`const matrix = [[1, 2], [3, 4]];
const rows = [{ id: 1, name: "one" }, { id: 2, name: "two" }];
const mixed = [[1, 2], { id: 1, name: "one" }];
const single = [[1], [2]];`,
				`const matrix = [
  [1, 2],
  [3, 4],
];
const rows = [
  { id: 1, name: "one" },
  { id: 2, name: "two" },
];
const mixed = [[1, 2], { id: 1, name: "one" }];
const single = [[1], [2]];
`,
			);
		});

		test('prints objects in arrays like any other object', async () => {
			await expectPrettierFormat(
				`const broken = [{
  a: 1,
}];
const inline = [{ a: 1, b: 2 }];`,
				`const broken = [
  {
    a: 1,
  },
];
const inline = [{ a: 1, b: 2 }];
`,
			);
		});

		test('breaks out a dependency or number array instead of expanding it', async () => {
			await expectPrettierFormat(
				`const value = useMemo(() => compute(), [firstDependency, secondDependency, thirdDependency]);
const sum = add(first, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);`,
				`const value = useMemo(
  () => compute(),
  [firstDependency, secondDependency, thirdDependency],
);
const sum = add(
  first,
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
);
`,
			);
		});

		test('breaks an array around a call whose callback body breaks', async () => {
			await expectPrettierFormat(
				`const handlers = [on("click", () => {
  run();
})];`,
				`const handlers = [
  on("click", () => {
    run();
  }),
];
`,
			);
		});

		test('breaks array patterns one element per line when they do not fit', async () => {
			await expectPrettierFormat(
				`const [aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccc] = useThing();
function f([aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccc, ddddd]) {}
[aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc] = [1, 2, 3];`,
				`const [
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
] = [1, 2, 3];
`,
			);
		});

		test('prints no trailing comma after a rest element and the type annotation after the brackets', async () => {
			await expectPrettierFormat(
				`const [aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb, ...ccccccccccccccccccccccccccccccc] = useThing();
function g([aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb]: [Aaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbb]) {}`,
				`const [
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ...ccccccccccccccccccccccccccccccc
] = useThing();
function g([aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbb]: [
  Aaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbb,
]) {}
`,
			);
		});

		test('breaks tuple types one member per line, keeping the comma after a rest type', async () => {
			await expectPrettierFormat(
				`let t: [Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ...Ccccccccccccccccccccccc[]];
function h(row: [aaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbb: number, ccccccccccccc: boolean]) {}`,
				`let t: [
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
) {}
`,
			);
		});

		test('keeps short patterns and tuples on one line', async () => {
			await expectPrettierFormat(
				`const [a, , b] = x;
const [c, ,] = y;
let u: [a?: string, ...rest: number[]] = [];
const {
  aaaaaaaaaaaaaaaaaa: [
    bbbbbbbbbbbbbbbbbbbbbbbbbbbb,
    ccccccccccccccccccccccccccccccccc,
  ],
} = x;`,
				`const [a, , b] = x;
const [c, ,] = y;
let u: [a?: string, ...rest: number[]] = [];
const {
  aaaaaaaaaaaaaaaaaa: [
    bbbbbbbbbbbbbbbbbbbbbbbbbbbb,
    ccccccccccccccccccccccccccccccccc,
  ],
} = x;
`,
			);
		});
	});

	describe('objects lay out like Prettier', () => {
		test('keeps an object expanded only when a line break follows its {', async () => {
			await expectPrettierFormat(
				`const o = { a: 1,
  b: 2 };
const p = { list: [
  'a',
  'b',
] };
const q = {
  a: 1, b: 2 };
foo({ a: 1,
  b: 2 });`,
				`const o = { a: 1, b: 2 };
const p = { list: ["a", "b"] };
const q = {
  a: 1,
  b: 2,
};
foo({ a: 1, b: 2 });
`,
			);
		});

		test('collapses every object that fits with objectWrap collapse', async () => {
			await expectPrettierFormat(
				`const o = {
  a: 1, b: 2 };
type U = {
  a: string; b: number };
let m: {
  [K in keyof T]: T[K] } = x;`,
				`const o = { a: 1, b: 2 };
type U = { a: string; b: number };
let m: { [K in keyof T]: T[K] } = x;
`,
				{ objectWrap: 'collapse' },
			);
		});

		test('keeps a blank line after a property, past its comments', async () => {
			await expectPrettierFormat(
				`const r = {
  a: 1,

  b: 2, // trailing

  // leading
  c: 3,
};`,
				`const r = {
  a: 1,

  b: 2, // trailing

  // leading
  c: 3,
};
`,
			);
		});

		test('breaks a pattern that destructures a nested pattern, except in parameters', async () => {
			await expectPrettierFormat(
				`const { a, b: { c } } = x;
function f({ a, b: { c } }) {}
const fn = ({ a, b: [c] }) => a;`,
				`const {
  a,
  b: { c },
} = x;
function f({ a, b: { c } }) {}
const fn = ({ a, b: [c] }) => a;
`,
			);
		});

		test('breaks a complex destructuring pattern before the value on its right', async () => {
			await expectPrettierFormat(
				`const { aaaa, bbbb: cccc, dddd = 1 } = getOptions(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbb, ccc);
({ aaaa, bbbb: cccc, dddd } = getOptions(aaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccc));
const { aaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbb } = await someFunctionCall(aaaaaaaaaaa, bbbbbbbbbbb);`,
				`const {
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
);
`,
			);
		});

		test('breaks a nested pattern among the parameters of a TypeScript signature', async () => {
			await expectPrettierFormat(
				`type F = (a: string, { b: { c } }: T) => void;
declare function f(a, { b: { c } }): void;
interface I {
  m(a: string, { b: { c } }: T): void;
}
function g(a: string, { b: { c } }: T): void {}`,
				`type F = (
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
function g(a: string, { b: { c } }: T): void {}
`,
			);
		});

		test('hugs a destructured parameter with a default or an object type', async () => {
			await expectPrettierFormat(
				`function foo({ aaaaaaaaaaaa, bbbbbbbbbbbbbbbb, ccccccccccccccccccc, dddddddddddddddd } = {}) {}
function bar({ aaaaaaaaaaaa, bbbbbbbbbbbbbbbb, ccccccccccccccccccc }: { aaaaaaaaaaaa: string }) {}`,
				`function foo({
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
}) {}
`,
			);
		});

		test('follows bracketSpacing in object patterns, type literals, and mapped types', async () => {
			await expectPrettierFormat(
				`type M = { [K in keyof T]: T[K] };
const { a, b } = obj;
function f({ a }: { a: string }) {}
let t: { a: string; b: number } = x;`,
				`type M = {[K in keyof T]: T[K]};
const {a, b} = obj;
function f({a}: {a: string}) {}
let t: {a: string; b: number} = x;
`,
				{ bracketSpacing: false },
			);
		});

		test('breaks mapped types like Prettier and keeps their modifiers and comments', async () => {
			await expectPrettierFormat(
				`let g: { readonly [K in keyof Tttttttttttttttttttttttttt as \`get\${Capitalize<K & string>}\`]-?: () => T[K] };
let m: {
  [K in keyof T]: T[K];
} = x;
type P = { +readonly [K in keyof T]+?: T[K] };
let c: {
  // note
  [K in keyof T]: T[K];
} = x;
let d: { /* note */ [K in keyof T]: T[K] } = x;`,
				`let g: {
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
let d: { /* note */ [K in keyof T]: T[K] } = x;
`,
			);
		});

		test('keeps a comment after the type a mapped type ranges over', async () => {
			await expectPrettierFormat(
				`type M = { [K in keyof T /* c */]: T[K] };
type N = { [K in T /* c */]: T[K] };
type O = { [K in keyof T /* c */ as X]: T[K] };`,
				`type M = { [K in keyof T /* c */]: T[K] };
type N = { [K in T /* c */]: T[K] };
type O = { [K in keyof T /* c */ as X]: T[K] };
`,
			);
		});

		test('moves the comment in "type U = {\\n  [K in T // c\\n  ]: T[K];\\n};" after the type the key ranges over', async () => {
			await expectPrettierFormat(
				`type U = {
  [K in T // c
  ]: T[K];
};`,
				`type U = {
  [
    K in T // c
  ]: T[K];
};
`,
			);
		});

		test('moves the comment in "type X = { [K in T] /* c */ : T[K] };" after the type the key ranges over', async () => {
			await expectPrettierFormat(
				`type X = { [K in T] /* c */ : T[K] };`,
				`type X = { [K in T /* c */]: T[K] };
`,
			);
		});

		test('moves the comment in "type E = {\\n  [K in T] // c\\n  : T[K];\\n};" after the type the key ranges over', async () => {
			await expectPrettierFormat(
				`type E = {
  [K in T] // c
  : T[K];
};`,
				`type E = {
  [
    K in T // c
  ]: T[K];
};
`,
			);
		});

		test('keeps the comments of "type V = { [/* c */ K in T]: T[K] };" in a mapped type', async () => {
			await expectPrettierFormat(
				`type V = { [/* c */ K in T]: T[K] };`,
				`type V = { [/* c */ K in T]: T[K] };
`,
			);
		});

		test('keeps the comments of "type A = {\\n  [\\n    // c\\n    K in T\\n  ]: T[K];\\n};" in a mapped type', async () => {
			await expectPrettierFormat(
				`type A = {
  [
    // c
    K in T
  ]: T[K];
};`,
				`type A = {
  [
    // c
    K in T
  ]: T[K];
};
`,
			);
		});

		test('keeps the comments of "type Q = { [K in /* c */ T]: T[K] };\\ntype R = { [K in T as /* c */ X]: T[K] };\\ntype S = { [K in T as X /* c */]: T[K] };\\ntype W = { /* c */ [K in T]: T[K] };\\ntype Y = { [K in T]: /* c */ T[K] };\\ntype Z = { [K in T]: T[K] /* c */ };" in a mapped type', async () => {
			await expectPrettierFormat(
				`type Q = { [K in /* c */ T]: T[K] };
type R = { [K in T as /* c */ X]: T[K] };
type S = { [K in T as X /* c */]: T[K] };
type W = { /* c */ [K in T]: T[K] };
type Y = { [K in T]: /* c */ T[K] };
type Z = { [K in T]: T[K] /* c */ };`,
				`type Q = { [K in /* c */ T]: T[K] };
type R = { [K in T as /* c */ X]: T[K] };
type S = { [K in T as X /* c */]: T[K] };
type W = { /* c */ [K in T]: T[K] };
type Y = { [K in T]: /* c */ T[K] };
type Z = { [K in T]: T[K] /* c */ };
`,
			);
		});

		test('breaks a union only for a member that must break, not for how the source wrapped it', async () => {
			await expectPrettierFormat(
				`let x: { a: string;
  b: number } | { c: string } = v;`,
				`let x: { a: string; b: number } | { c: string } = v;
`,
			);
		});

		test('keeps a type literal expanded only when a line break follows its {', async () => {
			await expectPrettierFormat(
				`type T = { a: string;
  b: number };
type U = {
  a: string; b: number };
function g(options: {
  a: string; b: number }) {}
let m: {
  [K in keyof T]: T[K] } = x;`,
				`type T = { a: string; b: number };
type U = {
  a: string;
  b: number;
};
function g(options: { a: string; b: number }) {}
let m: {
  [K in keyof T]: T[K];
} = x;
`,
			);
		});
	});

	describe('property keys are quoted like Prettier', () => {
		test('unquotes the keys that are identifiers with quoteProps as-needed', async () => {
			await expectPrettierFormat(
				`interface A {
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
import data from "./data.json" with { "type": "json" };`,
				`interface A {
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
import data from "./data.json" with { type: "json" };
`,
			);
		});

		test('keeps the quotes that change a key or that ES5 needs', async () => {
			await expectPrettierFormat(
				`interface A {
  "new"(): A;
  "1": string;
  2: string;
}
const o = { "\\u0061": 1, "1": 2, 1.5: 3, "𝒶": 4 };`,
				`interface A {
  "new"(): A;
  "1": string;
  2: string;
}
const o = { "\\u0061": 1, "1": 2, 1.5: 3, "𝒶": 4 };
`,
			);
		});

		test('keeps the quotes of class fields, which TypeScript checks differently', async () => {
			await expectPrettierFormat(
				`class C {
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
}`,
				`class C {
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
}
`,
			);
		});

		test('quotes every key it can when one needs quotes with quoteProps consistent', async () => {
			await expectPrettierFormat(
				`const o = { a: 1, "b-c": 2, 1: 3, "d": 4 };
const p = { "a": 1, b: 2 };
interface I {
  a: string;
  "b-c": number;
}
enum E {
  a = 1,
  "b" = 2,
}`,
				`const o = { "a": 1, "b-c": 2, 1: 3, "d": 4 };
const p = { a: 1, b: 2 };
interface I {
  "a": string;
  "b-c": number;
}
enum E {
  a = 1,
  b = 2,
}
`,
				{ quoteProps: 'consistent' },
			);
			await expectPrettierFormat(
				`const o = { a: 1, "b-c": 2, 1: 3, "d": 4 };
const p = { "a": 1, b: 2 };
interface I {
  a: string;
  "b-c": number;
}
enum E {
  a = 1,
  "b" = 2,
}`,
				`const o = { 'a': 1, 'b-c': 2, 1: 3, 'd': 4 };
const p = { a: 1, b: 2 };
interface I {
  'a': string;
  'b-c': number;
}
enum E {
  a = 1,
  b = 2,
}
`,
				{ quoteProps: 'consistent', singleQuote: true },
			);
		});

		test('keeps every key as written with quoteProps preserve', async () => {
			await expectPrettierFormat(
				`interface A {
  "a": string;
  b: number;
}
enum E {
  "x" = 1,
  y = 2,
}
const o = { "a": 1, b: 2 };
import data from "./data.json" with { "type": "json" };`,
				`interface A {
  "a": string;
  b: number;
}
enum E {
  "x" = 1,
  y = 2,
}
const o = { "a": 1, b: 2 };
import data from "./data.json" with { "type": "json" };
`,
				{ quoteProps: 'preserve' },
			);
		});

		test('keeps the comments of a key it unquotes', async () => {
			await expectPrettierFormat(
				`const o = {
  // leading
  "a": 1,
  "b" /* after the key */: 2,
  /* before the key */ "c": 3,
};
enum E {
  "x" /* after the key */ = 1,
}`,
				`const o = {
  // leading
  a: 1,
  b /* after the key */: 2,
  /* before the key */ c: 3,
};
enum E {
  x /* after the key */ = 1,
}
`,
			);
		});

		test('keeps the comment of a key after a modifier, get, async, or a decorator', async () => {
			await expectPrettierFormat(
				`class A {
  @dec /* a */ "a-b" = 1;
  static /* b */ "c-d" = 1;
  get /* c */ "e-f"() {
    return 1;
  }
}
const o = {
  async /* d */ "g-h"() {},
};`,
				`class A {
  @dec /* a */ "a-b" = 1;
  static /* b */ "c-d" = 1;
  get /* c */ "e-f"() {
    return 1;
  }
}
const o = {
  async /* d */ "g-h"() {},
};
`,
			);
			await expectPrettierFormat(
				`class A {
  static /* b */ "cd" = 1;
  get /* c */ "ef"() {
    return 1;
  }
}
interface I {
  readonly /* d */ "gh": string;
}`,
				`class A {
  static /* b */ "cd" = 1;
  get /* c */ ef() {
    return 1;
  }
}
interface I {
  readonly /* d */ gh: string;
}
`,
			);
		});
	});

	describe('comments in empty arrays and objects', () => {
		test('keeps a line comment inside an empty array or object', async () => {
			await expectPrettierFormat(
				`const a = [
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
};`,
				`const a = [
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
};
`,
			);
		});

		test('keeps a block comment inline between the brackets', async () => {
			await expectPrettierFormat(
				`const a = [/* pending */];
const o = {/* pending */};
const { /* c */ } = x;
function f([/* c */]) {}`,
				`const a = [/* pending */];
const o = {/* pending */};
const {/* c */} = x;
function f([/* c */]) {}
`,
			);
		});

		test('puts several comments on their own lines', async () => {
			await expectPrettierFormat(
				`const a = [/* a */ /* b */];
const b = [ // one

  // two
];`,
				`const a = [
  /* a */
  /* b */
];
const b = [
  // one
  // two
];
`,
			);
		});

		test('breaks the call arguments around an object with a line comment', async () => {
			await expectPrettierFormat(
				`foo({
  // pending
}, 1);`,
				`foo(
  {
    // pending
  },
  1,
);
`,
			);
		});

		test('keeps the comments of an empty container after a comment before it', async () => {
			await expectPrettierFormat(
				`class A /* e */ {
  // c
}`,
				`class A /* e */ {
  // c
}
`,
			);
			await expectPrettierFormat(
				`function f() /* e */ {
  // c
}`,
				`function f() /* e */ {
  // c
}
`,
			);
			await expectPrettierFormat(
				`x = () => /* e */ {
  // c
};`,
				`x = () => /* e */ {
  // c
};
`,
			);
			await expectPrettierFormat(
				`if (a) /* e */ {
  // c
}`,
				`if (a) /* e */ {
  // c
}
`,
			);
			await expectPrettierFormat(
				`// e
{
  // c
}`,
				`// e
{
  // c
}
`,
			);
			await expectPrettierFormat(
				`interface I /* e */ {
  // c
}`,
				`interface I /* e */ {
  // c
}
`,
			);
			await expectPrettierFormat(
				`namespace N /* e */ {
  // c
}`,
				`namespace N /* e */ {
  // c
}
`,
			);
			await expectPrettierFormat(
				`type T = /* e */ {
  // c
};`,
				`type T = /* e */ {
  // c
};
`,
			);
			await expectPrettierFormat(
				`const a = /* e */ [/* c */];`,
				`const a = /* e */ [/* c */];
`,
			);
			await expectPrettierFormat(
				`f(a, /* e */ [
  // c
]);`,
				`f(
  a,
  /* e */ [
    // c
  ],
);
`,
			);
			await expectPrettierFormat(
				`x = // e
[
  // c
];`,
				`x =
  // e
  [
    // c
  ];
`,
			);
		});
	});

	describe('trailing array holes survive formatting', () => {
		test('keeps trailing holes with trailingComma all', async () => {
			await expectPrettierFormat(
				`const one = [1,,];
const two = [,,];
const inner = [1,,2];
const [,] = values();
const [first, ,] = values();
function f([a, ,], [,]) {}`,
				`const one = [1, ,];
const two = [, ,];
const inner = [1, , 2];
const [,] = values();
const [first, ,] = values();
function f([a, ,], [,]) {}
`,
				{ trailingComma: 'all' },
			);
		});

		test('keeps trailing holes with trailingComma none', async () => {
			await expectPrettierFormat(
				`const one = [1,,];
const two = [,,];
const inner = [1,,2];
const [,] = values();
const [first, ,] = values();
function f([a, ,], [,]) {}`,
				`const one = [1, ,];
const two = [, ,];
const inner = [1, , 2];
const [,] = values();
const [first, ,] = values();
function f([a, ,], [,]) {}
`,
				{ trailingComma: 'none' },
			);
		});

		test('keeps a trailing hole in a multiline array with trailingComma all', async () => {
			await expectPrettierFormat(
				`const values = [
  1, // one
  2,
  ,
];`,
				`const values = [
  1, // one
  2,
  ,
];
`,
				{ trailingComma: 'all' },
			);
		});

		test('keeps a trailing hole in a multiline array with trailingComma none', async () => {
			await expectPrettierFormat(
				`const values = [
  1, // one
  2,
  ,
];`,
				`const values = [
  1, // one
  2,
  ,
];
`,
				{ trailingComma: 'none' },
			);
		});

		test('keeps a trailing hole when the array breaks to fit', async () => {
			await expectPrettierFormat(
				`const values = [aaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccc,,];`,
				`const values = [
  aaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccc,
  ,
];
`,
				{ trailingComma: 'none' },
			);
		});
	});

	describe('string literal escapes survive formatting', () => {
		test('keeps an escaped lone surrogate as an escape', async () => {
			await expectPrettierFormat(
				`const keys = { '\\ud800': 1, '\\ufffd': 2 };`,
				`const keys = { "\\ud800": 1, "\\ufffd": 2 };
`,
			);
		});

		test('keeps escapes in every string position', async () => {
			await expectPrettierFormat(
				`import data from '\\u0061.json' with { type: '\\u006a' };

export { '\\u0062' as b } from './b';
type Lone = '\\udc00';
enum Keys {
  '\\ud800' = 1,
}
const text = '\\x1b[31m' + '\\u00e9' + '\\0';`,
				`import data from "\\u0061.json" with { type: "\\u006a" };

export { "\\u0062" as b } from "./b";
type Lone = "\\udc00";
enum Keys {
  "\\ud800" = 1,
}
const text = "\\x1b[31m" + "\\u00e9" + "\\0";
`,
			);
		});

		test('switches to the other quote when the string holds more of the configured one', async () => {
			await expectPrettierFormat(
				`const a = "\\"";
const b = "say \\"hi\\"";
const c = 'it\\'s';
const d = "it's \\"x\\"";
const e = 'say "hi"';
const f = "it's";`,
				`const a = '"';
const b = 'say "hi"';
const c = "it's";
const d = 'it\\'s "x"';
const e = 'say "hi"';
const f = "it's";
`,
			);
			await expectPrettierFormat(
				`const a = "\\"";
const b = "say \\"hi\\"";
const c = 'it\\'s';
const d = "it's \\"x\\"";
const e = 'say "hi"';
const f = "it's";`,
				`const a = '"';
const b = 'say "hi"';
const c = "it's";
const d = 'it\\'s "x"';
const e = 'say "hi"';
const f = "it's";
`,
				{ singleQuote: true },
			);
		});

		test('keeps the configured quote on a tie', async () => {
			await expectPrettierFormat(
				`const a = 'a"b\\'c';
const b = "a\\"b'c";`,
				`const a = "a\\"b'c";
const b = "a\\"b'c";
`,
			);
			await expectPrettierFormat(
				`const a = 'a"b\\'c';
const b = "a\\"b'c";`,
				`const a = 'a"b\\'c';
const b = 'a"b\\'c';
`,
				{ singleQuote: true },
			);
		});

		test('keeps a string as written when its quote does not change', async () => {
			await expectPrettierFormat(
				`const a = "it\\'s";
const b = 'a\\"b';
const c = '\\d\\n\\\\"';
const d = "\\\\\\"";`,
				`const a = "it\\'s";
const b = 'a\\"b';
const c = '\\d\\n\\\\"';
const d = '\\\\"';
`,
			);
		});

		test('picks the quote of keys, module names, and literal types the same way', async () => {
			await expectPrettierFormat(
				`import x from 'it\\'s.js';
const o = { 'it\\'s': 1, "say \\"hi\\"": 2 };
type T = 'it\\'s' | "say \\"hi\\"";
enum E {
  'it\\'s' = 1,
}`,
				`import x from "it's.js";
const o = { "it's": 1, 'say "hi"': 2 };
type T = "it's" | 'say "hi"';
enum E {
  "it's" = 1,
}
`,
			);
		});

		test('breaks the code around a string that continues onto the next line', async () => {
			await expectPrettierFormat(
				`const message = "first line \\
second line";
foo("first line \\
second line", other);
x = ["a\\
b", c];
function f() { return "a \\
b" + c; }`,
				`const message =
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
}
`,
			);
		});

		test('breaks an object around a key that continues onto the next line', async () => {
			await expectPrettierFormat(
				`const o = { "a \\
b": 1, c: 2 };
type T = "a \\
b";`,
				`const o = {
  "a \\
b": 1,
  c: 2,
};
type T = "a \\
b";
`,
			);
		});
	});

	describe('JSX attribute strings survive formatting', () => {
		test('prints title={\'Say "hello"\'} as title={\'Say "hello"\'}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={'Say "hello"'} />;
}`,
				`export function App() {
  return <input title={'Say "hello"'} />;
}
`,
			);
		});

		test('prints title="Say &quot;hello&quot;" as title=\'Say "hello"\'', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title="Say &quot;hello&quot;" />;
}`,
				`export function App() {
  return <input title='Say "hello"' />;
}
`,
			);
		});

		test('prints title=\'x "y" &apos;z&apos;\' as title="x &quot;y&quot; \'z\'"', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title='x "y" &apos;z&apos;' />;
}`,
				`export function App() {
  return <input title="x &quot;y&quot; 'z'" />;
}
`,
			);
		});

		test('prints title="&amp;amp;" as title="&amp;amp;"', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title="&amp;amp;" />;
}`,
				`export function App() {
  return <input title="&amp;amp;" />;
}
`,
			);
		});

		test('prints title="a &#34;b&#34;" as title="a &#34;b&#34;"', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title="a &#34;b&#34;" />;
}`,
				`export function App() {
  return <input title="a &#34;b&#34;" />;
}
`,
			);
		});

		test('prints title={\'&amp;\'} as title={"&amp;"}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={'&amp;'} />;
}`,
				`export function App() {
  return <input title={"&amp;"} />;
}
`,
			);
		});

		test('prints title={"It\'s \\"both\\""} as title={\'It\\\'s "both"\'}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={"It's \\"both\\""} />;
}`,
				`export function App() {
  return <input title={'It\\'s "both"'} />;
}
`,
			);
		});

		test('prints title={\'\\ud800\'} as title={"\\ud800"}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={'\\ud800'} />;
}`,
				`export function App() {
  return <input title={"\\ud800"} />;
}
`,
			);
		});

		test('prints title={\'a\\nb\'} as title={"a\\nb"}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={'a\\nb'} />;
}`,
				`export function App() {
  return <input title={"a\\nb"} />;
}
`,
			);
		});

		test("prints title={'It\\'s'} as title={\"It's\"}", async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={'It\\'s'} />;
}`,
				`export function App() {
  return <input title={"It's"} />;
}
`,
			);
		});

		test('prints title={\'hello\'} as title={"hello"}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={'hello'} />;
}`,
				`export function App() {
  return <input title={"hello"} />;
}
`,
			);
		});

		test('prints title={/* c */ \'x\'} alt={\'y\' /* d */} as title={/* c */ "x"} alt={"y" /* d */}', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={/* c */ 'x'} alt={'y' /* d */} />;
}`,
				`export function App() {
  return <input title={/* c */ "x"} alt={"y" /* d */} />;
}
`,
			);
		});

		test('keeps the braces around a string with jsxSingleQuote', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <input title={"It's ready"} alt="Say &apos;hi&apos;" />;
}`,
				`export function App() {
  return <input title={"It's ready"} alt="Say 'hi'" />;
}
`,
				{ jsxSingleQuote: true },
			);
		});

		test('breaks a long string in braces like an expression container', async () => {
			await expectPrettierFormat(
				`export function App() {
  return <div title={"a very long string value that goes on and on and on and on and on and on and on"}>x</div>;
}
export function B() {
  return <div title={"a very long string value that goes on and on and on and on and on and on and on and on"}>x</div>;
}
export function C() {
  return <div title="a very long string value that goes on and on and on and on and on and on and on and on">x</div>;
}`,
				`export function App() {
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
}
`,
				{ printWidth: 100 },
			);
		});
	});

	describe('JSX attribute values break like Prettier', () => {
		test('breaks new, import(), and await of a fragment inside the braces like Prettier', async () => {
			await expectPrettierFormat(
				`f(<div aaaa={new SomeConstructorName(aaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbb)} />);
f(<div aaaa={import("some-very-long-module-specifier-name/that/does/not/fit/on/one/line")} />);
f(<div aaaa={await (<>
<b>1</b>
</>)} />);`,
				`f(
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
);
`,
			);
		});

		test('keeps an element written as an attribute value without braces', async () => {
			await expectPrettierFormat(
				`const a = <Foo prop=<Bar><Baz /></Bar> />;
const c = <LeftRight left=<a /> right=<b>monkeys</b> />;`,
				`const a = (
  <Foo
    prop=<Bar>
      <Baz />
    </Bar>
  />
);
const c = <LeftRight left=<a /> right=<b>monkeys</b> />;
`,
			);
		});
	});

	describe('template children lay out like the same JSX in TSX', () => {
		test('breaks inside the braces of a {…} child that starts with a comment', async () => {
			await expectPrettierFormat(
				`const a = <div>
{
  /* prettier-ignore */
  foo ( )
}
</div>;
const b = <div>{// note
foo()}</div>;`,
				`const a = (
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
);
`,
			);
		});

		test('prints the comments of a multi-line element inside its parentheses', async () => {
			await expectPrettierFormat(
				`const aDiv = (
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
}`,
				`const aDiv = (
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
}
`,
			);
		});

		test('wraps a commented element after return or throw in one pair of parentheses', async () => {
			await expectPrettierFormat(
				`function g() {
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
}`,
				`function g() {
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
}
`,
			);
		});
	});

	describe('significant spaces between template children survive formatting', () => {
		test('keeps text and elements separated by spaces on one line', async () => {
			await expectPrettierFormat(
				`const a = <div>hello <b>x</b> world</div>;
const b = <>a <b>1</b> b</>;`,
				`const a = (
  <div>
    hello <b>x</b> world
  </div>
);
const b = (
  <>
    a <b>1</b> b
  </>
);
`,
			);
		});

		test('prints a space against a broken tag as {" "}', async () => {
			await expectPrettierFormat(
				`const a = <div> <b>1</b> </div>;
const b = <> <b>1</b></>;`,
				`const a = (
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
);
`,
			);
		});

		test('keeps the spaces around text that fits against its tags', async () => {
			await expectPrettierFormat(
				`const a = <div> hello</div>;
const b = <div>hello </div>;
const c = <> hi </>;
const d = <p> {a} </p>;`,
				`const a = <div> hello</div>;
const b = <div>hello </div>;
const c = <> hi </>;
const d = <p> {a} </p>;
`,
			);
		});

		test('prints the spaces around text that moves onto its own lines as {" "}', async () => {
			await expectPrettierFormat(
				`const a = <div> This is some long text that will not fit on one line because it is long </div>;`,
				`const a = (
  <div>
    {" "}
    This is some long text that will not fit on one line because it is long{" "}
  </div>
);
`,
			);
		});

		test('joins {" "} with its neighbors when they fit on one line', async () => {
			await expectPrettierFormat(
				`const a = <div>
  <b>1</b>{" "}
  <b>2</b>
</div>;
const b = <p>hello {" "}{a}</p>;`,
				`const a = (
  <div>
    <b>1</b> <b>2</b>
  </div>
);
const b = <p>hello {a}</p>;
`,
			);
		});

		test('keeps non-breaking spaces as text', async () => {
			await expectPrettierFormat(
				`const a = <div>a  b</div>;
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
);`,
				`const a = <div>a  b</div>;
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
);
`,
			);
		});

		test('prints {" "} with the singleQuote quote', async () => {
			await expectPrettierFormat(
				`const a = <div> <b>1</b> </div>;`,
				`const a = (
  <div>
    {' '}
    <b>1</b>{' '}
  </div>
);
`,
				{ singleQuote: true },
			);
		});
	});

	describe('directives keep their meaning', () => {
		test('keeps an escaped directive as written', async () => {
			await expectPrettierFormat(
				`function run(value = 1) {
  "use\\x20strict";
  return value;
}`,
				`function run(value = 1) {
  "use\\x20strict";
  return value;
}
`,
			);
			await expectPrettierFormat(
				`function run(value = 1) {
  "use\\x20strict";
  return value;
}`,
				`function run(value = 1) {
  'use\\x20strict';
  return value;
}
`,
				{ singleQuote: true },
			);
		});

		test('swaps the quotes of a directive only when it contains neither kind', async () => {
			await expectPrettierFormat(
				`function f() {
  'it\\'s';
  'use strict';
}`,
				`function f() {
  'it\\'s';
  "use strict";
}
`,
			);
		});

		test('keeps an empty directive unparenthesized so the prologue continues', async () => {
			await expectPrettierFormat(
				`function f() {
  "";
  "use strict";
  return 1;
}`,
				`function f() {
  "";
  "use strict";
  return 1;
}
`,
			);
		});
	});

	describe('idempotence', () => {
		test('moves mixed text and expression children below the tags when the element does not fit', async () => {
			await expectPrettierFormat(
				`function App() { return <div title="aaaaaaaa" alt="bbbbbbbbbb">xxxxx yyyyy zzzzzzzzzzzzzzzzzzzzz {"x"}</div>; }
function Long() { return <div title="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" alt="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb">text {x} more</div>; }`,
				`function App() {
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
}
`,
			);
		});

		test('keeps mixed text and expression children on the line when the element fits', async () => {
			await expectPrettierFormat(
				`function App() {
  return <div title="a">Hello {name}!</div>;
}`,
				`function App() {
  return <div title="a">Hello {name}!</div>;
}
`,
			);
		});

		test('keeps a return argument with leading line comments after the return keyword', async () => {
			await expectPrettierFormat(
				`function isXOrYInValid(xOrY: string | number | undefined) {
	return (
		// number that is not NaN or Infinity
		(typeof xOrY === 'number' && Number.isFinite(xOrY)) ||
		// for percentage
		typeof xOrY === 'string'
	);
}`,
				`function isXOrYInValid(xOrY: string | number | undefined) {
	return (
		// number that is not NaN or Infinity
		(typeof xOrY === 'number' && Number.isFinite(xOrY)) ||
		// for percentage
		typeof xOrY === 'string'
	);
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});

		test('does not double-wrap self-parenthesizing return and throw arguments', async () => {
			await expectPrettierFormat(
				`function f() {
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
}`,
				`function f() {
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
}
`,
			);
		});

		test('breaks long logical arrow bodies after multiline type-literal params', async () => {
			await expectPrettierFormat(
				`function f() {
	const mapping = result.mappings.find(
		(mapping: {
			sourceOffsets: number[];
			generatedOffsets: number[];
		}) =>
			mapping.sourceOffsets[0] === source_offset &&
			mapping.generatedOffsets[0] === generated_offset &&
			mapping.lengths[0] === identifier.length,
	);
}`,
				`function f() {
	const mapping = result.mappings.find(
		(mapping: { sourceOffsets: number[]; generatedOffsets: number[] }) =>
			mapping.sourceOffsets[0] === source_offset &&
			mapping.generatedOffsets[0] === generated_offset &&
			mapping.lengths[0] === identifier.length,
	);
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});

		test('stabilizes long arrow bodies with logical expressions in one pass', async () => {
			await expectPrettierFormat(
				`function useStack() {
	return horizontal
		? {
				defined: (d: AreaStackDatum<XScale, YScale>) =>
					isValidNumber(yScale(getStackValue(d.data))) && isValidNumber(xScale(getSecondItem(d))),
			}
		: null;
}`,
				`function useStack() {
	return horizontal
		? {
				defined: (d: AreaStackDatum<XScale, YScale>) =>
					isValidNumber(yScale(getStackValue(d.data))) && isValidNumber(xScale(getSecondItem(d))),
			}
		: null;
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});

		test('stabilizes deeply nested JSX attribute arrows returning JSX in one pass', async () => {
			await expectPrettierFormat(
				`function Parent() {
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
}`,
				`function Parent() {
	return (
		<div>
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
		</div>
	);
}
`,
				{ useTabs: true, singleQuote: true, printWidth: 100 },
			);
		});
	});

	describe('parameter lists of methods, signatures, and function types', () => {
		test('breaks the parameters of every kind of class method', async () => {
			await expectPrettierFormat(
				`class C {
  constructor(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) {}
  method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void {}
  set value(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string) {}
  static method2(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void {}
  *gen(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) {}
  #priv(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) {}
}`,
				`class C {
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
}
`,
			);
		});

		test('breaks the parameters before type parameters or return type arguments', async () => {
			await expectPrettierFormat(
				`class G {
  method<T>(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: T, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) {}
  async load(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): Promise<void> {}
}`,
				`class G {
  method<T>(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: T,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) {}
  async load(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): Promise<void> {}
}
`,
			);
		});

		test('breaks a lone method parameter and keeps an object return type hugged', async () => {
			await expectPrettierFormat(
				`class Q {
  async load(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): Promise<void> {}
  m<T>(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): { aaaaaaaaaaa: string; b: number } {}
  x(...rest: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa[]) {}
}`,
				`class Q {
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
}
`,
			);
		});

		test('always breaks a constructor with parameter properties and more than one parameter', async () => {
			await expectPrettierFormat(
				`class D {
  constructor(private readonly a: string, public b: number) {}
}
class E {
  constructor(@Inject() private readonly a: string) {
    init();
  }
}`,
				`class D {
  constructor(
    private readonly a: string,
    public b: number,
  ) {}
}
class E {
  constructor(@Inject() private readonly a: string) {
    init();
  }
}
`,
			);
		});

		test('breaks the parameters of abstract methods, overloads, and declared classes', async () => {
			await expectPrettierFormat(
				`abstract class A {
  abstract method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  overload(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  overload(a: string): void;
  overload(a: any) {}
}
declare class X {
  method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
}`,
				`abstract class A {
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
}
`,
			);
		});

		test('breaks the parameters of object methods before their return type', async () => {
			await expectPrettierFormat(
				`const o = {
  method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void {},
  m(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string): Promise<Aaaaaaaaaaaaaaaaaaaaaaaaa> {},
  async *gen<T>(a: T): AsyncGenerator<T> {},
};`,
				`const o = {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void {},
  m(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  ): Promise<Aaaaaaaaaaaaaaaaaaaaaaaaa> {},
  async *gen<T>(a: T): AsyncGenerator<T> {},
};
`,
			);
		});

		test('breaks the parameters of interface signatures', async () => {
			await expectPrettierFormat(
				`interface I {
  method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  method2?(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  set x(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string);
  (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  new (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): I;
  <T>(aaaaaaaaaaaaaaaaaaaaaaaa: T, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  n(options: { aaaaaaaaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbb: number; cccccccccccccc: boolean }): void;
}`,
				`interface I {
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
}
`,
			);
		});

		test('breaks the parameters of type literal methods and function-typed properties', async () => {
			await expectPrettierFormat(
				`type T = {
  method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
  prop: (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) => void;
};`,
				`type T = {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ): void;
  prop: (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number,
  ) => void;
};
`,
			);
		});

		test('breaks the parameters of function and constructor types', async () => {
			await expectPrettierFormat(
				`let fn: (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) => void;
let ctor: new (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) => I;
let actor: abstract new (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) => I;
function f(cb: (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) => void) {}`,
				`let fn: (
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
) {}
`,
			);
		});

		test('leaves out the parameter trailing comma unless trailingComma is all', async () => {
			await expectPrettierFormat(
				`interface I {
  method(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number): void;
}
let fn: (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number) => void;`,
				`interface I {
  method(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number
  ): void;
}
let fn: (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa: string,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number
) => void;
`,
				{ trailingComma: 'es5' },
			);
		});

		test('breaks the parameters around a lone parameter typed as an intersection or generic with an object type', async () => {
			await expectPrettierFormat(
				`function g(e: E & { currentTarget: Tttttttttttttttttt; target: Tttttttttttttttttttttttttttttt }) {}
function f(args: VoidIfEmpty<{ readonly aaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number }>) {}
const h = (args: VoidIfEmpty<{ readonly aaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number }>) => {};
type H = { (e: E & { currentTarget: Tttttttttttttttttt; target: Tttttttttttttttttttttttttttttt }): void };
type F = (args: VoidIfEmpty<{ readonly aaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number }>) => A;`,
				`function g(
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
) => A;
`,
			);
		});

		test('hugs a lone parameter typed as an object or mapped type, or destructured', async () => {
			await expectPrettierFormat(
				`function g(props: {
  readonly aaaaaaaaaaaaa: string;
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
}) {}
function m(props: {
  [Key in keyof Aaaaaaaaaaaaaaaaaaaaaa]: Bbbbbbbbbbbbbbbbbbbbbbbbb<Key>;
}) {}
function d({
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
}: Props & { extra: string }) {}`,
				`function g(props: {
  readonly aaaaaaaaaaaaa: string;
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number;
}) {}
function m(props: {
  [Key in keyof Aaaaaaaaaaaaaaaaaaaaaa]: Bbbbbbbbbbbbbbbbbbbbbbbbb<Key>;
}) {}
function d({
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
}: Props & { extra: string }) {}
`,
			);
		});

		test('keeps short signatures and hugged parameters on one line', async () => {
			await expectPrettierFormat(
				`class C {
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
let y: abstract new () => Foo;`,
				`class C {
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
let y: abstract new () => Foo;
`,
			);
		});
	});

	describe('type parameter declarations', () => {
		test('preserves generic function type declarations: type Select<T> = <K extends keyof T>(value: T[K]) => T[K];', async () => {
			await expectPrettierFormat(
				`type Select<T> = <K extends keyof T>(value: T[K]) => T[K];`,
				`type Select<T> = <K extends keyof T>(value: T[K]) => T[K];
`,
			);
		});

		test('preserves generic function type declarations: type Mapper = <T, U = T>(value: T) => U;', async () => {
			await expectPrettierFormat(
				`type Mapper = <T, U = T>(value: T) => U;`,
				`type Mapper = <T, U = T>(value: T) => U;
`,
			);
		});

		test('preserves generic function type declarations: type Factory = <T = unknown>() => <U extends T>(value: U) => U;', async () => {
			await expectPrettierFormat(
				`type Factory = <T = unknown>() => <U extends T>(value: U) => U;`,
				`type Factory = <T = unknown>() => <U extends T>(value: U) => U;
`,
			);
		});

		test('preserves generic function type declarations: interface Api {\n  select: <T>(value: T) => T;\n}', async () => {
			await expectPrettierFormat(
				`interface Api {
  select: <T>(value: T) => T;
}`,
				`interface Api {
  select: <T>(value: T) => T;
}
`,
			);
		});

		test('preserves generic constructor type declarations: type Constructor = new <T>(value: T) => Box<T>;', async () => {
			await expectPrettierFormat(
				`type Constructor = new <T>(value: T) => Box<T>;`,
				`type Constructor = new <T>(value: T) => Box<T>;
`,
			);
		});

		test('preserves generic constructor type declarations: type Constructor = abstract new <T, U = T>(value: U) => Box<T>;', async () => {
			await expectPrettierFormat(
				`type Constructor = abstract new <T, U = T>(value: U) => Box<T>;`,
				`type Constructor = abstract new <T, U = T>(value: U) => Box<T>;
`,
			);
		});

		test('breaks long interface type parameter lists one per line with a trailing comma', async () => {
			await expectPrettierFormat(
				`export interface WithFieldGroupProps<TFieldGroupData, TFieldComponents extends Record<string, HookComponentType<any>>, TFormComponents extends Record<string, HookComponentType<any>>, TSubmitMeta, TRenderProps extends object = Record<string, never>> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
	props?: TRenderProps;
}`,
				`export interface WithFieldGroupProps<
	TFieldGroupData,
	TFieldComponents extends Record<string, HookComponentType<any>>,
	TFormComponents extends Record<string, HookComponentType<any>>,
	TSubmitMeta,
	TRenderProps extends object = Record<string, never>,
> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
	props?: TRenderProps;
}
`,
				{ printWidth: 100, useTabs: true, singleQuote: true },
			);
		});

		test('prefers breaking the function parameter list over the type parameter list', async () => {
			await expectPrettierFormat(
				`export default function useStateWithCallback<State>(initialState: State): [State, SetStateWithCallback<State>] {
	return null;
}`,
				`export default function useStateWithCallback<State>(
	initialState: State,
): [State, SetStateWithCallback<State>] {
	return null;
}
`,
				{ printWidth: 100, useTabs: true, singleQuote: true },
			);
		});

		test('breaks function type parameter lists that overflow on their own', async () => {
			await expectPrettierFormat(
				`function useAppForm<TFormData, TOnMount extends undefined | FormValidateOrFn<TFormData>, TOnChange extends undefined | FormValidateOrFn<TFormData>, TSubmitMeta>(props: FormOptions<TFormData, TOnMount, TOnChange, TSubmitMeta>): void {
	return;
}`,
				`function useAppForm<
	TFormData,
	TOnMount extends undefined | FormValidateOrFn<TFormData>,
	TOnChange extends undefined | FormValidateOrFn<TFormData>,
	TSubmitMeta,
>(props: FormOptions<TFormData, TOnMount, TOnChange, TSubmitMeta>): void {
	return;
}
`,
				{ printWidth: 100, useTabs: true, singleQuote: true },
			);
		});

		test('stays idempotent when a single type parameter has to break', async () => {
			await expectPrettierFormat(
				`interface Container<TExtremelyLongParameterName extends Record<string, unknown>> {
	value: TExtremelyLongParameterName;
}`,
				`interface Container<
  TExtremelyLongParameterName extends Record<string, unknown>,
> {
  value: TExtremelyLongParameterName;
}
`,
			);
		});

		test('preserves the trailing comma of single-param arrow function generics', async () => {
			await expectPrettierFormat(
				`const identity = <T,>(value: T): T => value;`,
				`const identity = <T,>(value: T): T => value;
`,
			);
		});

		test('drops meaningless trailing commas from non-arrow type parameter lists', async () => {
			await expectPrettierFormat(
				`function pick<State,>(value: State): State {
	return value;
}`,
				`function pick<State>(value: State): State {
  return value;
}
`,
			);
		});

		test('omits the trailing comma in broken type parameter lists when trailingComma is none', async () => {
			await expectPrettierFormat(
				`interface Container<TExtremelyLongParameterName extends Record<string, unknown>> {
	value: TExtremelyLongParameterName;
}`,
				`interface Container<
  TExtremelyLongParameterName extends Record<string, unknown>
> {
  value: TExtremelyLongParameterName;
}
`,
				{ trailingComma: 'none' },
			);
		});

		test('keeps the trailing comma in broken type parameter lists when trailingComma is es5', async () => {
			await expectPrettierFormat(
				`interface Container<TExtremelyLongParameterName extends Record<string, unknown>> {
	value: TExtremelyLongParameterName;
}`,
				`interface Container<
  TExtremelyLongParameterName extends Record<string, unknown>,
> {
  value: TExtremelyLongParameterName;
}
`,
				{ trailingComma: 'es5' },
			);
		});

		test('formats "declare function f<RuntimePropsOptions extends ComponentObjectPropsOptions = ComponentObjectPropsOptions, B = 1>(): void;" like Prettier', async () => {
			await expectPrettierFormat(
				`declare function f<RuntimePropsOptions extends ComponentObjectPropsOptions = ComponentObjectPropsOptions, B = 1>(): void;`,
				`declare function f<
  RuntimePropsOptions extends ComponentObjectPropsOptions =
    ComponentObjectPropsOptions,
  B = 1,
>(): void;
`,
			);
		});

		test('formats "type Fooooooooooooo<Tttttttttttttttttttttttt extends Recordddddddddddddddddddddddddddddddddddddddddd<string, unknown>> = 1;" like Prettier', async () => {
			await expectPrettierFormat(
				`type Fooooooooooooo<Tttttttttttttttttttttttt extends Recordddddddddddddddddddddddddddddddddddddddddd<string, unknown>> = 1;`,
				`type Fooooooooooooo<
  Tttttttttttttttttttttttt extends
    Recordddddddddddddddddddddddddddddddddddddddddd<string, unknown>,
> = 1;
`,
			);
		});

		test('formats "type Barrrrrrrrrrrr<Tttttttttttttttttttttttt = Recordddddddddddddddddddddddddddddddddddddddddddddd<string>> = 1;" like Prettier', async () => {
			await expectPrettierFormat(
				`type Barrrrrrrrrrrr<Tttttttttttttttttttttttt = Recordddddddddddddddddddddddddddddddddddddddddddddd<string>> = 1;`,
				`type Barrrrrrrrrrrr<
  Tttttttttttttttttttttttt =
    Recordddddddddddddddddddddddddddddddddddddddddddddd<string>,
> = 1;
`,
			);
		});

		test('formats "class Foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>> {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class Foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>> {}`,
				`class Foo<
  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends
    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,
> {}
`,
			);
		});

		test('formats "interface Foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>> {}" like Prettier', async () => {
			await expectPrettierFormat(
				`interface Foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>> {}`,
				`interface Foo<
  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends
    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,
> {}
`,
			);
		});

		test('formats "function foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function foo<TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() {}`,
				`function foo<
  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends
    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,
>() {}
`,
			);
		});

		test('formats "const foo = <TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() => {};" like Prettier', async () => {
			await expectPrettierFormat(
				`const foo = <TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() => {};`,
				`const foo = <
  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends
    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>,
>() => {};
`,
			);
		});

		test('formats "const f = <T = Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,>() => {};" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = <T = Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,>() => {};`,
				`const f = <
  T =
    Xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx,
>() => {};
`,
			);
		});

		test('formats "const f = <T extends X,>() => {};" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = <T extends X,>() => {};`,
				`const f = <T extends X>() => {};
`,
			);
		});

		test('keeps "type A<\\n  T extends {\\n    aaaaaaaaaaaaaaaa: string;\\n    bbbbbbbbbbbbbbbbbbbbbbb: number;\\n    ccccccccccccccccc: boolean;\\n  },\\n> = T;"', async () => {
			await expectPrettierFormat(
				`type A<
  T extends {
    aaaaaaaaaaaaaaaa: string;
    bbbbbbbbbbbbbbbbbbbbbbb: number;
    ccccccccccccccccc: boolean;
  },
> = T;`,
				`type A<
  T extends {
    aaaaaaaaaaaaaaaa: string;
    bbbbbbbbbbbbbbbbbbbbbbb: number;
    ccccccccccccccccc: boolean;
  },
> = T;
`,
			);
		});

		test('keeps "type A<\\n  T extends\\n    | \\"aaaaaaaaaaaaaaa\\"\\n    | \\"bbbbbbbbbbbbbbbbbbbbb\\"\\n    | \\"cccccccccccccccccccccc\\"\\n    | \\"ddddddddddddddd\\",\\n> = T;"', async () => {
			await expectPrettierFormat(
				`type A<
  T extends
    | "aaaaaaaaaaaaaaa"
    | "bbbbbbbbbbbbbbbbbbbbb"
    | "cccccccccccccccccccccc"
    | "ddddddddddddddd",
> = T;`,
				`type A<
  T extends
    | "aaaaaaaaaaaaaaa"
    | "bbbbbbbbbbbbbbbbbbbbb"
    | "cccccccccccccccccccccc"
    | "ddddddddddddddd",
> = T;
`,
			);
		});

		test('keeps "type A<\\n  T =\\n    | \\"aaaaaaaaaaaaaaa\\"\\n    | \\"bbbbbbbbbbbbbbbbbbbbb\\"\\n    | \\"cccccccccccccccccccccc\\"\\n    | \\"ddddddddddddddd\\"\\n    | \\"eeeeeeeeeeeeeeeeeeeeeeee\\",\\n> = T;"', async () => {
			await expectPrettierFormat(
				`type A<
  T =
    | "aaaaaaaaaaaaaaa"
    | "bbbbbbbbbbbbbbbbbbbbb"
    | "cccccccccccccccccccccc"
    | "ddddddddddddddd"
    | "eeeeeeeeeeeeeeeeeeeeeeee",
> = T;`,
				`type A<
  T =
    | "aaaaaaaaaaaaaaa"
    | "bbbbbbbbbbbbbbbbbbbbb"
    | "cccccccccccccccccccccc"
    | "ddddddddddddddd"
    | "eeeeeeeeeeeeeeeeeeeeeeee",
> = T;
`,
			);
		});

		test('keeps "type A<\\n  TTTTTTTTTTTTTTTTTTTTTTTTTTT = Recorddddddddddddddddddddddddddddddddddddddddd<\\n    string,\\n    unknown\\n  >,\\n> = T;"', async () => {
			await expectPrettierFormat(
				`type A<
  TTTTTTTTTTTTTTTTTTTTTTTTTTT = Recorddddddddddddddddddddddddddddddddddddddddd<
    string,
    unknown
  >,
> = T;`,
				`type A<
  TTTTTTTTTTTTTTTTTTTTTTTTTTT = Recorddddddddddddddddddddddddddddddddddddddddd<
    string,
    unknown
  >,
> = T;
`,
			);
		});

		test('keeps "function useThing<\\n  TData extends Record<string, unknown> = Record<string, unknown>,\\n  TError = Error,\\n>(options: UseThingOptions<TData, TError>): UseThingResult<TData, TError> {}"', async () => {
			await expectPrettierFormat(
				`function useThing<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TError = Error,
>(options: UseThingOptions<TData, TError>): UseThingResult<TData, TError> {}`,
				`function useThing<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TError = Error,
>(options: UseThingOptions<TData, TError>): UseThingResult<TData, TError> {}
`,
			);
		});

		test('keeps "type X<T> =\\n  T extends Array<\\n    infer Uuuuuuuuuuuuuuuuuuuuuuuuuuu extends Recordddddddddddddddddddddddddd<\\n      string,\\n      unknown\\n    >\\n  >\\n    ? Uuuuuuuuuuuuuuuuuuuuuuuuuuu\\n    : never;"', async () => {
			await expectPrettierFormat(
				`type X<T> =
  T extends Array<
    infer Uuuuuuuuuuuuuuuuuuuuuuuuuuu extends Recordddddddddddddddddddddddddd<
      string,
      unknown
    >
  >
    ? Uuuuuuuuuuuuuuuuuuuuuuuuuuu
    : never;`,
				`type X<T> =
  T extends Array<
    infer Uuuuuuuuuuuuuuuuuuuuuuuuuuu extends Recordddddddddddddddddddddddddd<
      string,
      unknown
    >
  >
    ? Uuuuuuuuuuuuuuuuuuuuuuuuuuu
    : never;
`,
			);
		});

		test('keeps "type A<T extends /* c */ Foo> = T;"', async () => {
			await expectPrettierFormat(
				`type A<T extends /* c */ Foo> = T;`,
				`type A<T extends /* c */ Foo> = T;
`,
			);
		});

		test('keeps "const f = <T = X,>() => {};"', async () => {
			await expectPrettierFormat(
				`const f = <T = X,>() => {};`,
				`const f = <T = X,>() => {};
`,
			);
		});

		test('keeps "const f = <T extends X>() => {};"', async () => {
			await expectPrettierFormat(
				`const f = <T extends X>() => {};`,
				`const f = <T extends X>() => {};
`,
			);
		});

		test('breaks a lone arrow type parameter without a trailing comma when trailingComma is none', async () => {
			await expectPrettierFormat(
				`const foo = <TTTTTTTTTTTTTTTTTTTTTTTTTTT extends Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>>() => {};`,
				`const foo = <
  TTTTTTTTTTTTTTTTTTTTTTTTTTT extends
    Recorddddddddddddddddddddddddddddddddddddddddd<string, unknown>
>() => {};
`,
				{ trailingComma: 'none' },
			);
		});

		test('breaks a long lone arrow type parameter with a comma when trailingComma is all', async () => {
			await expectPrettierFormat(
				`const f2 = <Tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt>() => 1;`,
				`const f2 = <
  Tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt,
>() => 1;
`,
				{ trailingComma: 'all' },
			);
		});

		test('breaks a long lone arrow type parameter with a comma when trailingComma is none', async () => {
			await expectPrettierFormat(
				`const f2 = <Tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt>() => 1;`,
				`const f2 = <
  Tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt,
>() => 1;
`,
				{ trailingComma: 'none' },
			);
		});
	});

	describe('type argument lists', () => {
		test('keeps a lone simple type argument against its brackets', async () => {
			await expectPrettierFormat(
				`const w = (a) => a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbb>;
function f(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbbbbbb> {}
foo(bar as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbb>);
function g() {
  return value satisfies Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string>;
}
const q = useMemo<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa>(() => compute(aaaaaaa, bbbbbbbbbb), []);`,
				`const w = (a) =>
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
);
`,
			);
		});

		test('keeps a lone object type or a hugged union against its brackets', async () => {
			await expectPrettierFormat(
				`let o: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<{ aaaaaaaaaa: string; bbbbbbbbbbbbbb: number }> = v;
function h(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbb | null> {}`,
				`let o: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<{
  aaaaaaaaaa: string;
  bbbbbbbbbbbbbb: number;
}> = v;
function h(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbb | null> {}
`,
			);
		});

		test('breaks lists of several types, nested type arguments, and other unions', async () => {
			await expectPrettierFormat(
				`let y: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccc> = v;
let z: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbb<Cccc>> = v;
let u: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<"aaaaaa" | "bbbbbbb"> = v;`,
				`let y: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccc
> = v;
let z: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  Bbbbbbbbbbb<Cccc>
> = v;
let u: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  "aaaaaa" | "bbbbbbb"
> = v;
`,
			);
		});

		test('breaks the brackets around a lone array type, which is not simple', async () => {
			await expectPrettierFormat(
				`let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string[]> = value;
const w = (a) => a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<string[]>;`,
				`let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  string[]
> = value;
const w = (a) =>
  a as unknown as Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
    string[]
  >;
`,
			);
		});

		test('breaks a lone type argument in the type of an arrow function variable', async () => {
			await expectPrettierFormat(
				`const fn: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<Bbbbbbbbbbbbbbbbbbbb> = () => {};`,
				`const fn: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  Bbbbbbbbbbbbbbbbbbbb
> = () => {};
`,
			);
		});

		test('breaks a lone type argument with a line comment', async () => {
			await expectPrettierFormat(
				`let k: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  // comment
  string
> = value;
let m: Map<string /* key */, number> = new Map<string, number>();`,
				`let k: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa<
  // comment
  string
> = value;
let m: Map<string /* key */, number> = new Map<string, number>();
`,
			);
		});
	});

	describe('comments in type arguments, type parameters, and case tests stay there', () => {
		test('keeps the comment in "const z = f<\\n  // only\\n  A\\n>(1);"', async () => {
			await expectPrettierFormat(
				`const z = f<
  // only
  A
>(1);`,
				`const z = f<
  // only
  A
>(1);
`,
			);
		});

		test('keeps the comment in "const x = dual<\\n  /** a */\\n  A,\\n  /** b */\\n  B\\n>(2, f);"', async () => {
			await expectPrettierFormat(
				`const x = dual<
  /** a */
  A,
  /** b */
  B
>(2, f);`,
				`const x = dual<
  /** a */
  A,
  /** b */
  B
>(2, f);
`,
			);
		});

		test('keeps the comment in "f</* c */ T>(1);"', async () => {
			await expectPrettierFormat(
				`f</* c */ T>(1);`,
				`f</* c */ T>(1);
`,
			);
		});

		test('keeps the comment in "f<T /* c */>(1);"', async () => {
			await expectPrettierFormat(
				`f<T /* c */>(1);`,
				`f<T /* c */>(1);
`,
			);
		});

		test('keeps the comment in "new Foo</* c */ T>(1);"', async () => {
			await expectPrettierFormat(
				`new Foo</* c */ T>(1);`,
				`new Foo</* c */ T>(1);
`,
			);
		});

		test('keeps the comment in "tag</* c */ T>`x`;"', async () => {
			await expectPrettierFormat(
				`tag</* c */ T>\`x\`;`,
				`tag</* c */ T>\`x\`;
`,
			);
		});

		test('keeps the comment in "const f = </* c */ T,>(a: T): T => a;"', async () => {
			await expectPrettierFormat(
				`const f = </* c */ T,>(a: T): T => a;`,
				`const f = </* c */ T,>(a: T): T => a;
`,
			);
		});

		test('keeps the comment in "const f = <T,>(/* c */ a: T): T => a;"', async () => {
			await expectPrettierFormat(
				`const f = <T,>(/* c */ a: T): T => a;`,
				`const f = <T,>(/* c */ a: T): T => a;
`,
			);
		});

		test('keeps the comment in "const f = <T,>(a: T /* c */, b): T => a;"', async () => {
			await expectPrettierFormat(
				`const f = <T,>(a: T /* c */, b): T => a;`,
				`const f = <T,>(a: T /* c */, b): T => a;
`,
			);
		});

		test('keeps the comment in "switch (x) {\\n  case /* c */ 1:\\n    y;\\n}"', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case /* c */ 1:
    y;
}`,
				`switch (x) {
  case /* c */ 1:
    y;
}
`,
			);
		});

		test('keeps the comment in "class A {\\n  m</* c */ T>(a: T): T {\\n    return a;\\n  }\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m</* c */ T>(a: T): T {
    return a;
  }
}`,
				`class A {
  m</* c */ T>(a: T): T {
    return a;
  }
}
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = {\\n  m</* c */ T>(b: T): T {\\n    return b;\\n  },\\n};"', async () => {
			await expectPrettierFormat(
				`const o = {
  m</* c */ T>(b: T): T {
    return b;
  },
};`,
				`const o = {
  m</* c */ T>(b: T): T {
    return b;
  },
};
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { async m</* c */ T>(b: T) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { async m</* c */ T>(b: T) {} };`,
				`const o = { async m</* c */ T>(b: T) {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { *m</* c */ T>(b: T) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { *m</* c */ T>(b: T) {} };`,
				`const o = { *m</* c */ T>(b: T) {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { async *m</* c */ T>(b: T) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { async *m</* c */ T>(b: T) {} };`,
				`const o = { async *m</* c */ T>(b: T) {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { get m</* c */ T>() {} };"', async () => {
			await expectPrettierFormat(
				`const o = { get m</* c */ T>() {} };`,
				`const o = { get m</* c */ T>() {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { set m</* c */ T>(v: T) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { set m</* c */ T>(v: T) {} };`,
				`const o = { set m</* c */ T>(v: T) {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { [k]</* c */ T>(b: T) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { [k]</* c */ T>(b: T) {} };`,
				`const o = { [k]</* c */ T>(b: T) {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = { m<T /* c */>(b: T) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { m<T /* c */>(b: T) {} };`,
				`const o = { m<T /* c */>(b: T) {} };
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = {\\n  m<\\n    // c\\n    T,\\n  >(b: T) {},\\n};"', async () => {
			await expectPrettierFormat(
				`const o = {
  m<
    // c
    T,
  >(b: T) {},
};`,
				`const o = {
  m<
    // c
    T,
  >(b: T) {},
};
`,
			);
		});

		test('keeps the comment in the type parameters of the object method in "const o = {\\n  m<\\n    T,\\n    // c\\n  >(b: T) {},\\n};"', async () => {
			await expectPrettierFormat(
				`const o = {
  m<
    T,
    // c
  >(b: T) {},
};`,
				`const o = {
  m<
    T,
    // c
  >(b: T) {},
};
`,
			);
		});

		test('formats the comments of the generic object method in "const o = { m</* c */ T>(b: T): T { return b; } };" like Prettier', async () => {
			await expectPrettierFormat(
				`const o = { m</* c */ T>(b: T): T { return b; } };`,
				`const o = {
  m</* c */ T>(b: T): T {
    return b;
  },
};
`,
			);
		});

		test('formats the comments of the generic object method in "const o = { m<\\n// c\\nT,\\n>(b: T) {} };" like Prettier', async () => {
			await expectPrettierFormat(
				`const o = { m<
// c
T,
>(b: T) {} };`,
				`const o = {
  m<
    // c
    T,
  >(b: T) {},
};
`,
			);
		});

		test('formats the comments of the generic object method in "const o = { m /* a */ <T>(b: T) {} };" like Prettier', async () => {
			await expectPrettierFormat(
				`const o = { m /* a */ <T>(b: T) {} };`,
				`const o = { m/* a */ <T>(b: T) {} };
`,
			);
		});

		test('formats the comments of the generic object method in "const o = { \\"m\\" /* a */ <T>(b: T) {} };" like Prettier', async () => {
			await expectPrettierFormat(
				`const o = { "m" /* a */ <T>(b: T) {} };`,
				`const o = { m/* a */ <T>(b: T) {} };
`,
			);
		});

		test('formats the comments of the generic object method in "const o = { m /* a */ </* c */ T /* d */> /* e */ (b: T) {} };" like Prettier', async () => {
			await expectPrettierFormat(
				`const o = { m /* a */ </* c */ T /* d */> /* e */ (b: T) {} };`,
				`const o = { m/* a */ </* c */ T /* d */> /* e */(b: T) {} };
`,
			);
		});

		test('keeps the comment around the type parameter name in "function f<T /* a */ extends U, K /* b */ = V>() {}"', async () => {
			await expectPrettierFormat(
				`function f<T /* a */ extends U, K /* b */ = V>() {}`,
				`function f<T /* a */ extends U, K /* b */ = V>() {}
`,
			);
		});

		test('keeps the comment around the type parameter name in "class A<T /* a */ /* b */ extends U> {}"', async () => {
			await expectPrettierFormat(
				`class A<T /* a */ /* b */ extends U> {}`,
				`class A<T /* a */ /* b */ extends U> {}
`,
			);
		});

		test('keeps the comment around the type parameter name in "const f = <T /* a */ extends U>() => {};"', async () => {
			await expectPrettierFormat(
				`const f = <T /* a */ extends U>() => {};`,
				`const f = <T /* a */ extends U>() => {};
`,
			);
		});

		test('keeps the comment around the type parameter name in "function f<T /* a */ extends /* b */ U /* c */ = /* d */ V /* e */>() {}"', async () => {
			await expectPrettierFormat(
				`function f<T /* a */ extends /* b */ U /* c */ = /* d */ V /* e */>() {}`,
				`function f<T /* a */ extends /* b */ U /* c */ = /* d */ V /* e */>() {}
`,
			);
		});

		test('keeps the comment around the type parameter name in "function f<const /* c */ T extends U>() {}"', async () => {
			await expectPrettierFormat(
				`function f<const /* c */ T extends U>() {}`,
				`function f<const /* c */ T extends U>() {}
`,
			);
		});

		test('keeps the comment around the type parameter name in "interface I<in /* i */ K /* b */ = V, out /* o */ X> {}"', async () => {
			await expectPrettierFormat(
				`interface I<in /* i */ K /* b */ = V, out /* o */ X> {}`,
				`interface I<in /* i */ K /* b */ = V, out /* o */ X> {}
`,
			);
		});

		test('keeps the comment around the type parameter name in "type A<in out /* c */ T> = T;"', async () => {
			await expectPrettierFormat(
				`type A<in out /* c */ T> = T;`,
				`type A<in out /* c */ T> = T;
`,
			);
		});

		test('keeps the comment around the type parameter name in "type M = { [K /* a */ in T]: T[K] };"', async () => {
			await expectPrettierFormat(
				`type M = { [K /* a */ in T]: T[K] };`,
				`type M = { [K /* a */ in T]: T[K] };
`,
			);
		});

		test('keeps the comment around the type parameter name in "type M = { readonly [K /* a */ in keyof T as `get${K}`]?: T[K] };"', async () => {
			await expectPrettierFormat(
				`type M = { readonly [K /* a */ in keyof T as \`get\${K}\`]?: T[K] };`,
				`type M = { readonly [K /* a */ in keyof T as \`get\${K}\`]?: T[K] };
`,
			);
		});

		test('keeps the comment around the type parameter name in "type X<A> = A extends [infer T /* a */ extends string] ? T : never;"', async () => {
			await expectPrettierFormat(
				`type X<A> = A extends [infer T /* a */ extends string] ? T : never;`,
				`type X<A> = A extends [infer T /* a */ extends string] ? T : never;
`,
			);
		});

		test('formats the comment around the type parameter name in "function f<\\n  T // a\\n    extends U,\\n  K // b\\n    = V,\\n>() {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f<
  T // a
    extends U,
  K // b
    = V,
>() {}`,
				`function f<
  T extends // a
    U,
  K = // b
    V,
>() {}
`,
			);
		});

		test('formats the comment around the type parameter name in "function f<T /* a */ extends Uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu>() {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f<T /* a */ extends Uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu>() {}`,
				`function f<
  T /* a */ extends
    Uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu,
>() {}
`,
			);
		});

		test('formats the comment around the type parameter name in "type M = {\\n  [K // a\\n    in T]: T[K];\\n};" like Prettier', async () => {
			await expectPrettierFormat(
				`type M = {
  [K // a
    in T]: T[K];
};`,
				`type M = {
  [
    K in T // a
  ]: T[K];
};
`,
			);
		});

		test('formats the comment around the type parameter name in "function f<\\n  T\\n  /* a */ extends U,\\n>() {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f<
  T
  /* a */ extends U,
>() {}`,
				`function f<T extends /* a */ U>() {}
`,
			);
		});

		test('formats the comment around the type parameter name in "type A<\\n  B = // inline\\n  // above\\n  C\\n> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<
  B = // inline
  // above
  C
> = R;`,
				`type A<
  B = // inline
    // above
    C,
> = R;
`,
			);
		});

		test('formats the comment around the = of a type parameter in "type A<B extends C = // c\\n  D> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<B extends C = // c
  D> = R;`,
				`type A<
  B extends C = // c
    D,
> = R;
`,
			);
		});

		test('formats the comment around the = of a type parameter in "type A<B extends C // c\\n  = D> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<B extends C // c
  = D> = R;`,
				`type A<
  B extends C = // c
    D,
> = R;
`,
			);
		});

		test('formats the comment around the = of a type parameter in "function f<T extends C = // c\\n  D>() {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f<T extends C = // c
  D>() {}`,
				`function f<
  T extends C = // c
    D,
>() {}
`,
			);
		});

		test('formats the comment around the = of a type parameter in "type A<B extends C = // c\\n  // d\\n  D> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<B extends C = // c
  // d
  D> = R;`,
				`type A<
  B extends C = // c
    // d
    D,
> = R;
`,
			);
		});

		test('formats the comment around the = of a type parameter in "type A<B extends C = // c\\n  VeryLongTypeName<WithArguments, AndMoreArguments, AndEvenMoreArguments, AndMore>> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<B extends C = // c
  VeryLongTypeName<WithArguments, AndMoreArguments, AndEvenMoreArguments, AndMore>> = R;`,
				`type A<
  B extends C = // c
    VeryLongTypeName<
      WithArguments,
      AndMoreArguments,
      AndEvenMoreArguments,
      AndMore
    >,
> = R;
`,
			);
		});

		test('formats the comment around the = of a type parameter in "type A<B extends C = /* c */\\n  D> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<B extends C = /* c */
  D> = R;`,
				`type A<B extends C /* c */ = D> = R;
`,
			);
		});

		test('keeps the comment around the = of a type parameter in "type A<B extends C /* c */ = D> = R;"', async () => {
			await expectPrettierFormat(
				`type A<B extends C /* c */ = D> = R;`,
				`type A<B extends C /* c */ = D> = R;
`,
			);
		});

		test('keeps the comment around the = of a type parameter in "type A<B extends C = /* c */ D> = R;"', async () => {
			await expectPrettierFormat(
				`type A<B extends C = /* c */ D> = R;`,
				`type A<B extends C = /* c */ D> = R;
`,
			);
		});

		test('keeps the comment around the = of a type parameter in "type A<\\n  B = // c\\n    D,\\n> = R;"', async () => {
			await expectPrettierFormat(
				`type A<
  B = // c
    D,
> = R;`,
				`type A<
  B = // c
    D,
> = R;
`,
			);
		});

		test('keeps the comment around the = of a type parameter in "type A<\\n  B extends C = D, // c\\n> = R;"', async () => {
			await expectPrettierFormat(
				`type A<
  B extends C = D, // c
> = R;`,
				`type A<
  B extends C = D, // c
> = R;
`,
			);
		});
	});

	describe('TypeScript modifiers survive formatting', () => {
		test('keeps type parameter variance: type Setter<in T> = (value: T) => void;', async () => {
			await expectPrettierFormat(
				`type Setter<in T> = (value: T) => void;`,
				`type Setter<in T> = (value: T) => void;
`,
			);
		});

		test('keeps type parameter variance: type Getter<out T> = () => T;', async () => {
			await expectPrettierFormat(
				`type Getter<out T> = () => T;`,
				`type Getter<out T> = () => T;
`,
			);
		});

		test('keeps type parameter variance: type Cell<in out T> = { value: T };', async () => {
			await expectPrettierFormat(
				`type Cell<in out T> = { value: T };`,
				`type Cell<in out T> = { value: T };
`,
			);
		});

		test('keeps type parameter variance: interface Cell<in out T extends object = object> {\n  value: T;\n}', async () => {
			await expectPrettierFormat(
				`interface Cell<in out T extends object = object> {
  value: T;
}`,
				`interface Cell<in out T extends object = object> {
  value: T;
}
`,
			);
		});

		test('keeps const type parameters: function identity<const T>(value: T): T {\n  return value;\n}', async () => {
			await expectPrettierFormat(
				`function identity<const T>(value: T): T {
  return value;
}`,
				`function identity<const T>(value: T): T {
  return value;
}
`,
			);
		});

		test('keeps const type parameters: const identity = <const T,>(value: T): T => value;', async () => {
			await expectPrettierFormat(
				`const identity = <const T,>(value: T): T => value;`,
				`const identity = <const T,>(value: T): T => value;
`,
			);
		});

		test('keeps const type parameters: class Box<const T> {}', async () => {
			await expectPrettierFormat(
				`class Box<const T> {}`,
				`class Box<const T> {}
`,
			);
		});

		test('keeps const type parameters: class Box<const in out T> {}', async () => {
			await expectPrettierFormat(
				`class Box<const in out T> {}`,
				`class Box<const in out T> {}
`,
			);
		});

		test('keeps readonly on interface members', async () => {
			await expectPrettierFormat(
				`export interface BenchRow {
  readonly id: number;
  readonly label: string;
  mutable: string;
}`,
				`export interface BenchRow {
  readonly id: number;
  readonly label: string;
  mutable: string;
}
`,
			);
		});

		test('keeps readonly on type literal members', async () => {
			await expectPrettierFormat(
				`type Row = {
  readonly id: number;
  readonly label?: string;
  mutable: string;
};`,
				`type Row = {
  readonly id: number;
  readonly label?: string;
  mutable: string;
};
`,
			);
		});

		test('keeps readonly on nested type literal members', async () => {
			await expectPrettierFormat(
				`interface Outer {
  readonly inner: {
    readonly deep: number;
  };
}`,
				`interface Outer {
  readonly inner: {
    readonly deep: number;
  };
}
`,
			);
		});

		test('keeps readonly on index signatures', async () => {
			await expectPrettierFormat(
				`interface Bag {
  readonly [key: string]: number;
}`,
				`interface Bag {
  readonly [key: string]: number;
}
`,
			);
		});

		test('keeps readonly array and tuple type operators', async () => {
			await expectPrettierFormat(
				`interface Lists {
  xs: readonly string[];
  ys: ReadonlyArray<number>;
  pair: readonly [number, string];
}`,
				`interface Lists {
  xs: readonly string[];
  ys: ReadonlyArray<number>;
  pair: readonly [number, string];
}
`,
			);
		});

		test('keeps get and set accessor kinds on method signatures', async () => {
			await expectPrettierFormat(
				`interface Box {
  get value(): number;
  set value(next: number);
}`,
				`interface Box {
  get value(): number;
  set value(next: number);
}
`,
			);
		});

		test('keeps class field modifiers', async () => {
			await expectPrettierFormat(
				`class Fields {
  readonly a = 1;
  static readonly b = 2;
  private readonly c = 3;
  protected d = 4;
  public e = 5;
  declare f: number;
  accessor g = 6;
}`,
				`class Fields {
  readonly a = 1;
  static readonly b = 2;
  private readonly c = 3;
  protected d = 4;
  public e = 5;
  declare f: number;
  accessor g = 6;
}
`,
			);
		});

		test('keeps abstract on classes and their members', async () => {
			await expectPrettierFormat(
				`abstract class Shape {
  abstract area(): number;
  abstract readonly sides: number;
  protected abstract render(): void;
}`,
				`abstract class Shape {
  abstract area(): number;
  abstract readonly sides: number;
  protected abstract render(): void;
}
`,
			);
		});

		test('keeps the optional marker on class methods', async () => {
			await expectPrettierFormat(
				`declare class Hook {
  onMount?(): void;
  onUpdate?<T>(value: T): T;
  [Symbol.dispose]?(): void;
}`,
				`declare class Hook {
  onMount?(): void;
  onUpdate?<T>(value: T): T;
  [Symbol.dispose]?(): void;
}
`,
			);
			await expectPrettierFormat(
				`abstract class Lifecycle {
  abstract onMount?(): void;
  static async *stream?() {}
  onUnmount?() {
    return;
  }
}`,
				`abstract class Lifecycle {
  abstract onMount?(): void;
  static async *stream?() {}
  onUnmount?() {
    return;
  }
}
`,
			);
		});

		test('keeps the definite-assignment assertion on class fields', async () => {
			await expectPrettierFormat(
				`export class Model {
  value!: string;
}`,
				`export class Model {
  value!: string;
}
`,
			);
			await expectPrettierFormat(
				`class Store extends Base {
  #id!: number;
  static instance!: Store;
  private readonly items!: Item[];
  [key]!: string;
  override name!: string;
  accessor state!: State;
}`,
				`class Store extends Base {
  #id!: number;
  static instance!: Store;
  private readonly items!: Item[];
  [key]!: string;
  override name!: string;
  accessor state!: State;
}
`,
			);
		});

		test('keeps static and the member separator on class index signatures', async () => {
			await expectPrettierFormat(
				`class Registry {
  [name: string]: number;
  count = 1;
}`,
				`class Registry {
  [name: string]: number;
  count = 1;
}
`,
			);
			await expectPrettierFormat(
				`class Registry {
  static [name: string]: number;
}`,
				`class Registry {
  static [name: string]: number;
}
`,
			);
			await expectPrettierFormat(
				`class Cache {
  static readonly [key: string]: number;
  readonly [index: number]: string;
  [key: symbol]: unknown;
  size = 0;
  clear() {}
}`,
				`class Cache {
  static readonly [key: string]: number;
  readonly [index: number]: string;
  [key: symbol]: unknown;
  size = 0;
  clear() {}
}
`,
			);
			await expectPrettierFormat(
				`class Cache {
  static [key: string]: number;
  [index: number]: string;
  clearAllEntriesFromTheCacheAndResetTheSize() {}
}`,
				`class Cache {
  static [key: string]: number
  [index: number]: string
  clearAllEntriesFromTheCacheAndResetTheSize() {}
}
`,
				{ semi: false },
			);
		});

		test('keeps override on class members', async () => {
			await expectPrettierFormat(
				`class Derived extends Base {
  override toString(): string {
    return "";
  }
  override readonly tag: string = "derived";
}`,
				`class Derived extends Base {
  override toString(): string {
    return "";
  }
  override readonly tag: string = "derived";
}
`,
			);
		});

		test('keeps modifiers on constructor parameter properties', async () => {
			await expectPrettierFormat(
				`class Point {
  readonly origin = 0;
  constructor(
    private readonly x: number,
    public y: string,
  ) {}
}`,
				`class Point {
  readonly origin = 0;
  constructor(
    private readonly x: number,
    public y: string,
  ) {}
}
`,
			);
		});

		test('keeps declare on ambient declarations', async () => {
			await expectPrettierFormat(
				`declare const version: number;
declare function init(): void;
declare class Ambient {}
declare enum Level {
  A = 1,
}`,
				`declare const version: number;
declare function init(): void;
declare class Ambient {}
declare enum Level {
  A = 1,
}
`,
			);
		});

		test('keeps declare global rather than declaring a module named global', async () => {
			await expectPrettierFormat(
				`declare global {
  interface Window {
    readonly octane: number;
  }
}`,
				`declare global {
  interface Window {
    readonly octane: number;
  }
}
`,
			);
		});

		test('keeps declare module', async () => {
			await expectPrettierFormat(
				`declare module "octane" {
  const x: number;
}`,
				`declare module "octane" {
  const x: number;
}
`,
			);
		});

		test('keeps const enum', async () => {
			await expectPrettierFormat(
				`const enum Flags {
  None = 0,
}`,
				`const enum Flags {
  None = 0,
}
`,
			);
		});

		test('keeps abstract on constructor types', async () => {
			await expectPrettierFormat(
				`type Ctor = abstract new () => object;`,
				`type Ctor = abstract new () => object;
`,
			);
		});

		test('keeps class static blocks', async () => {
			await expectPrettierFormat(
				`class WithStatic {
  static {
    console.log(1);
  }
}`,
				`class WithStatic {
  static {
    console.log(1);
  }
}
`,
			);
		});

		test('keeps readonly through the mapped type modifier forms', async () => {
			await expectPrettierFormat(
				`type Frozen = { readonly [K in keyof T]: T[K] };`,
				`type Frozen = { readonly [K in keyof T]: T[K] };
`,
			);
			await expectPrettierFormat(
				`type Thawed = { -readonly [K in keyof T]: T[K] };`,
				`type Thawed = { -readonly [K in keyof T]: T[K] };
`,
			);
		});

		test('terminates bodiless class members with a semicolon, not an empty body', async () => {
			await expectPrettierFormat(
				`abstract class Shape {
	abstract area(): number;
}`,
				`abstract class Shape {
  abstract area(): number;
}
`,
			);
		});

		test('keeps brackets on computed signature keys', async () => {
			await expectPrettierFormat(
				`interface Iterable {
  readonly [Symbol.iterator]: () => void;
  [Symbol.asyncIterator](): void;
}`,
				`interface Iterable {
  readonly [Symbol.iterator]: () => void;
  [Symbol.asyncIterator](): void;
}
`,
			);
		});

		test('keeps brackets on computed class field keys', async () => {
			await expectPrettierFormat(
				`class Keyed {
  [key] = 1;
  readonly [other] = 2;
}`,
				`class Keyed {
  [key] = 1;
  readonly [other] = 2;
}
`,
			);
		});

		test('normalises readonly onto reformatted interface members', async () => {
			await expectPrettierFormat(
				`interface Row {readonly   id:number
      readonly label : string}`,
				`interface Row {
  readonly id: number;
  readonly label: string;
}
`,
			);
		});
	});

	describe('class members without semicolons', () => {
		test('puts members that end without a block on their own lines', async () => {
			await expectPrettierFormat(
				`class Registry { [name: string]: number; count = 1; reset(): void; clear() {} }`,
				`class Registry {
  [name: string]: number
  count = 1
  reset(): void
  clear() {}
}
`,
				{ semi: false },
			);
		});

		test('puts every member of a class on its own line: class Point {\n  x = 1\n}', async () => {
			await expectPrettierFormat(
				`class Point {
  x = 1
}`,
				`class Point {
  x = 1
}
`,
				{ semi: false },
			);
		});

		test('puts every member of a class on its own line: class List {\n  first() {}\n  last() {}\n}', async () => {
			await expectPrettierFormat(
				`class List {
  first() {}
  last() {}
}`,
				`class List {
  first() {}
  last() {}
}
`,
				{ semi: false },
			);
		});

		test('puts every member of a class on its own line: class Lazy {\n  static {}\n  value = 1\n}', async () => {
			await expectPrettierFormat(
				`class Lazy {
  static {}
  value = 1
}`,
				`class Lazy {
  static {}
  value = 1
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x = a;\n  [k] = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a;
  [k] = 1
}`,
				`class A {
  x = a;
  [k] = 1
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x: string;\n  [k] = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x: string;
  [k] = 1
}`,
				`class A {
  x: string;
  [k] = 1
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x = a;\n  [k: string]: unknown\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a;
  [k: string]: unknown
}`,
				`class A {
  x = a;
  [k: string]: unknown
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x = a;\n  *gen() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a;
  *gen() {}
}`,
				`class A {
  x = a;
  *gen() {}
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x = a;\n  [k]() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a;
  [k]() {}
}`,
				`class A {
  x = a;
  [k]() {}
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x = a;\n  in = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a;
  in = 1
}`,
				`class A {
  x = a;
  in = 1
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  x = a;\n  instanceof = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a;
  instanceof = 1
}`,
				`class A {
  x = a;
  instanceof = 1
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  static;\n  run() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  static;
  run() {}
}`,
				`class A {
  static;
  run() {}
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon the next member depends on: class A {\n  get;\n  set;\n  value = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  get;
  set;
  value = 1
}`,
				`class A {
  get;
  set;
  value = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  static [k] = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  static [k] = 1
}`,
				`class A {
  x = a
  static [k] = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  private [k] = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  private [k] = 1
}`,
				`class A {
  x = a
  private [k] = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  readonly [k: string]: unknown\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  readonly [k: string]: unknown
}`,
				`class A {
  x = a
  readonly [k: string]: unknown
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  async *gen() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  async *gen() {}
}`,
				`class A {
  x = a
  async *gen() {}
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  get [k]() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  get [k]() {}
}`,
				`class A {
  x = a
  get [k]() {}
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  #p = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  #p = 1
}`,
				`class A {
  x = a
  #p = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  static {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  static {}
}`,
				`class A {
  x = a
  static {}
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  [k: string]: unknown\n  [j] = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  [k: string]: unknown
  [j] = 1
}`,
				`class A {
  [k: string]: unknown
  [j] = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  as = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  as = 1
}`,
				`class A {
  x = a
  as = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon before a member that cannot continue: class A {\n  x = a\n  satisfies: T\n}', async () => {
			await expectPrettierFormat(
				`class A {
  x = a
  satisfies: T
}`,
				`class A {
  x = a
  satisfies: T
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon after a field named like a same-line modifier: class A {\n  readonly\n  value = 1\n}', async () => {
			await expectPrettierFormat(
				`class A {
  readonly
  value = 1
}`,
				`class A {
  readonly
  value = 1
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon after a field named like a same-line modifier: class A {\n  declare\n  value: string\n}', async () => {
			await expectPrettierFormat(
				`class A {
  declare
  value: string
}`,
				`class A {
  declare
  value: string
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon after a field named like a same-line modifier: class A {\n  private\n  run() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  private
  run() {}
}`,
				`class A {
  private
  run() {}
}
`,
				{ semi: false },
			);
		});

		test('omits the semicolon after a field named like a same-line modifier: class A {\n  async\n  run() {}\n}', async () => {
			await expectPrettierFormat(
				`class A {
  async
  run() {}
}`,
				`class A {
  async
  run() {}
}
`,
				{ semi: false },
			);
		});

		test('keeps the semicolon ahead of a trailing comment', async () => {
			await expectPrettierFormat(
				`class A {
  x = a; // first
  [k] = 1
}`,
				`class A {
  x = a; // first
  [k] = 1
}
`,
				{ semi: false },
			);
		});
	});

	describe('statements without semicolons', () => {
		test('keeps an immediately invoked function a statement of its own', async () => {
			await expectPrettierFormat(
				`let calls = 0;
const value = 1;
(() => { calls++; })();
calls;`,
				`let calls = 0
const value = 1
;(() => {
  calls++
})()
calls
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;(function () {})()', async () => {
			await expectPrettierFormat(
				`const value = 1
;(function () {})()`,
				`const value = 1
;(function () {})()
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;(async () => {})()', async () => {
			await expectPrettierFormat(
				`const value = 1
;(async () => {})()`,
				`const value = 1
;(async () => {})()
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;(<T,>(value: T) => value)(1)', async () => {
			await expectPrettierFormat(
				`const value = 1
;(<T,>(value: T) => value)(1)`,
				`const value = 1
;(<T,>(value: T) => value)(1)
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;[1, 2].forEach(log)', async () => {
			await expectPrettierFormat(
				`const value = 1
;[1, 2].forEach(log)`,
				`const value = 1
;[1, 2].forEach(log)
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;[first, second] = [second, first]', async () => {
			await expectPrettierFormat(
				`const value = 1
;[first, second] = [second, first]`,
				`const value = 1
;[first, second] = [second, first]
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;/pattern/.test(text)', async () => {
			await expectPrettierFormat(
				`const value = 1
;/pattern/.test(text)`,
				`const value = 1
;/pattern/.test(text)
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;`template`.trim()', async () => {
			await expectPrettierFormat(
				`const value = 1
;\`template\`.trim()`,
				`const value = 1
;\`template\`.trim()
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;+value', async () => {
			await expectPrettierFormat(
				`const value = 1
;+value`,
				`const value = 1
;+value
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;-value', async () => {
			await expectPrettierFormat(
				`const value = 1
;-value`,
				`const value = 1
;-value
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;(primary || fallback).run()', async () => {
			await expectPrettierFormat(
				`const value = 1
;(primary || fallback).run()`,
				`const value = 1
;(primary || fallback).run()
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;(first, second)', async () => {
			await expectPrettierFormat(
				`const value = 1
;(first, second)`,
				`const value = 1
;(first, second)
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;({}).toString()', async () => {
			await expectPrettierFormat(
				`const value = 1
;({}).toString()`,
				`const value = 1
;({}).toString()
`,
				{ semi: false },
			);
		});

		test('starts the statement with a semicolon: ;(value as any).name = 1', async () => {
			await expectPrettierFormat(
				`const value = 1
;(value as any).name = 1`,
				`const value = 1
;(value as any).name = 1
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "const x = a | (b >> 6) // c\\nconst y = 1"', async () => {
			await expectPrettierFormat(
				`const x = a | (b >> 6) // c
const y = 1`,
				`const x = a | (b >> 6); // c
const y = 1;
`,
			);
			await expectPrettierFormat(
				`const x = a | (b >> 6) // c
const y = 1`,
				`const x = a | (b >> 6) // c
const y = 1
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "const x = (a >> 6) // c\\nconst y = 1"', async () => {
			await expectPrettierFormat(
				`const x = (a >> 6) // c
const y = 1`,
				`const x = a >> 6; // c
const y = 1;
`,
			);
			await expectPrettierFormat(
				`const x = a >> 6 // c
const y = 1`,
				`const x = a >> 6 // c
const y = 1
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "const x = !(a) // c\\nconst y = 1"', async () => {
			await expectPrettierFormat(
				`const x = !(a) // c
const y = 1`,
				`const x = !a; // c
const y = 1;
`,
			);
			await expectPrettierFormat(
				`const x = !a // c
const y = 1`,
				`const x = !a // c
const y = 1
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "const f = () => (a >> 6) // c\\nfoo()"', async () => {
			await expectPrettierFormat(
				`const f = () => (a >> 6) // c
foo()`,
				`const f = () => a >> 6; // c
foo();
`,
			);
			await expectPrettierFormat(
				`const f = () => a >> 6 // c
foo()`,
				`const f = () => a >> 6 // c
foo()
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "function f() {\\n  return (a >> 6) // c\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  return (a >> 6) // c
}`,
				`function f() {
  return a >> 6; // c
}
`,
			);
			await expectPrettierFormat(
				`function f() {
  return a >> 6 // c
}`,
				`function f() {
  return a >> 6 // c
}
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "function f() {\\n  throw (a >> 6) // c\\n  x()\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  throw (a >> 6) // c
  x()
}`,
				`function f() {
  throw a >> 6; // c
  x();
}
`,
			);
			await expectPrettierFormat(
				`function f() {
  throw a >> 6 // c
  x()
}`,
				`function f() {
  throw a >> 6 // c
  x()
}
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "const o = {\\n  a: (b >> 6) // c\\n}"', async () => {
			await expectPrettierFormat(
				`const o = {
  a: (b >> 6) // c
}`,
				`const o = {
  a: b >> 6, // c
};
`,
			);
			await expectPrettierFormat(
				`const o = {
  a: b >> 6, // c
}`,
				`const o = {
  a: b >> 6, // c
}
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "class A {\\n  x = (a >> 6) // c\\n  y = 1\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  x = (a >> 6) // c
  y = 1
}`,
				`class A {
  x = a >> 6; // c
  y = 1;
}
`,
			);
			await expectPrettierFormat(
				`class A {
  x = a >> 6 // c
  y = 1
}`,
				`class A {
  x = a >> 6 // c
  y = 1
}
`,
				{ semi: false },
			);
		});

		test('trails the statement with the comment after the ) that ends "const x = a | (b >> 6) /* c */\\nconst y = 1"', async () => {
			await expectPrettierFormat(
				`const x = a | (b >> 6) /* c */
const y = 1`,
				`const x = a | (b >> 6); /* c */
const y = 1;
`,
			);
			await expectPrettierFormat(
				`const x = a | (b >> 6) /* c */
const y = 1`,
				`const x = a | (b >> 6) /* c */
const y = 1
`,
				{ semi: false },
			);
		});

		test('adds no semicolon before statements that cannot continue the previous one', async () => {
			await expectPrettierFormat(
				`const value = 1
!value
++count
count++
new Widget()
items = [1]
typeof value`,
				`const value = 1
!value
++count
count++
new Widget()
items = [1]
typeof value
`,
				{ semi: false },
			);
		});

		test('prints an arrow without parentheses unguarded', async () => {
			await expectPrettierFormat(
				`const value = 1
value => value`,
				`const value = 1
value => value
`,
				{ semi: false, arrowParens: 'avoid' },
			);
		});

		test('keeps a return of an element after an element with children', async () => {
			await expectPrettierFormat(
				`function Field() {
  const field = <span>{label}</span>
  return <div>{field}</div>
}`,
				`function Field() {
  const field = <span>{label}</span>
  return <div>{field}</div>
}
`,
				{ semi: false },
			);
			await expectPrettierFormat(
				`function Field() {
  const field = <span>{label}</span>;
  throw <div>{field}</div>;
}`,
				`function Field() {
  const field = <span>{label}</span>
  throw <div>{field}</div>
}
`,
				{ semi: false },
			);
		});

		test('guards a template literal after an element with children', async () => {
			await expectPrettierFormat(
				`function f() {
  const a = <b>x</b>;
  \`t\`;
}`,
				`function f() {
  const a = <b>x</b>
  ;\`t\`
}
`,
				{ semi: false },
			);
		});

		test('formats an awaited element', async () => {
			await expectPrettierFormat(
				`async function f() {
  await (<div />);
  const view = await <b>a</b>;
}`,
				`async function f() {
  await (<div />);
  const view = await (<b>a</b>);
}
`,
				{ semi: true },
			);
			await expectPrettierFormat(
				`async function f() {
  await (<div />);
  const view = await <b>a</b>;
}`,
				`async function f() {
  await (<div />)
  const view = await (<b>a</b>)
}
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement', async () => {
			await expectPrettierFormat(
				`const value = 1

;[1].forEach(log)
log()

;(first || second)()`,
				`const value = 1

;[1].forEach(log)
log()

;(first || second)()
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after if (ready) run()', async () => {
			await expectPrettierFormat(
				`const value = 1
if (ready) run()

;[1].forEach(log)`,
				`const value = 1
if (ready) run()

;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after if (ready) run()\nelse stop()', async () => {
			await expectPrettierFormat(
				`const value = 1
if (ready) run()
else stop()

;[1].forEach(log)`,
				`const value = 1
if (ready) run()
else stop()

;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after for (const item of items) run(item)', async () => {
			await expectPrettierFormat(
				`const value = 1
for (const item of items) run(item)

;[1].forEach(log)`,
				`const value = 1
for (const item of items) run(item)

;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after while (ready) run()', async () => {
			await expectPrettierFormat(
				`const value = 1
while (ready) run()

;[1].forEach(log)`,
				`const value = 1
while (ready) run()

;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after debugger', async () => {
			await expectPrettierFormat(
				`const value = 1
debugger

;[1].forEach(log)`,
				`const value = 1
debugger

;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after export { value }', async () => {
			await expectPrettierFormat(
				`const value = 1
export { value }

;[1].forEach(log)`,
				`const value = 1
export { value }

;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a guarded statement after continue', async () => {
			await expectPrettierFormat(
				`for (const item of items) {
  continue

  ;[item].forEach(log)
}`,
				`for (const item of items) {
  continue

  ;[item].forEach(log)
}
`,
				{ semi: false },
			);
		});

		test('keeps the blank line before a comment that leads a guarded statement', async () => {
			await expectPrettierFormat(
				`const value = 1

// note
;[1].forEach(log)
log()

/* note */
;(first || second)()`,
				`const value = 1

// note
;[1].forEach(log)
log()

/* note */
;(first || second)()
`,
				{ semi: false },
			);
		});

		test('drops empty statements from statement lists', async () => {
			await expectPrettierFormat(
				`;log();;
run();`,
				`log();
run();
`,
			);
			await expectPrettierFormat(
				`function f() { ; }`,
				`function f() {}
`,
			);
			await expectPrettierFormat(
				`class A { static { ;log() } }`,
				`class A {
  static {
    log();
  }
}
`,
			);
		});
	});

	describe('comments around empty statements', () => {
		test('formats "a; ; // c\\nb;" like Prettier', async () => {
			await expectPrettierFormat(
				`a; ; // c
b;`,
				`a; // c
b;
`,
			);
		});

		test('formats "a; ; ; /* c */\\nb;" like Prettier', async () => {
			await expectPrettierFormat(
				`a; ; ; /* c */
b;`,
				`a; /* c */
b;
`,
			);
		});

		test('formats "a; /* c */ ;\\nb;" like Prettier', async () => {
			await expectPrettierFormat(
				`a; /* c */ ;
b;`,
				`a; /* c */
b;
`,
			);
		});

		test('formats "; // c\\nb;" like Prettier', async () => {
			await expectPrettierFormat(
				`; // c
b;`,
				`// c
b;
`,
			);
		});

		test('formats "; /* c */ b;" like Prettier', async () => {
			await expectPrettierFormat(
				`; /* c */ b;`,
				`/* c */ b;
`,
			);
		});

		test('formats "; // c" like Prettier', async () => {
			await expectPrettierFormat(
				`; // c`,
				`// c
`,
			);
		});

		test('formats "function f() {\\n  a; ; // c\\n  b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  a; ; // c
  b;
}`,
				`function f() {
  a; // c
  b;
}
`,
			);
		});

		test('formats "function f() {\\n  a; ; // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  a; ; // c
}`,
				`function f() {
  a; // c
}
`,
			);
		});

		test('formats "function f() {\\n  ; // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  ; // c
}`,
				`function f() {
  // c
}
`,
			);
		});

		test('formats "switch (x) {\\n  case 1:\\n    a; ; // c\\n    b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:
    a; ; // c
    b;
}`,
				`switch (x) {
  case 1:
    a; // c
    b;
}
`,
			);
		});

		test('formats "class C {\\n  static {\\n    a; ; // c\\n  }\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class C {
  static {
    a; ; // c
  }
}`,
				`class C {
  static {
    a; // c
  }
}
`,
			);
		});

		test('formats "class C {\\n  static {\\n    ; // c\\n  }\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class C {
  static {
    ; // c
  }
}`,
				`class C {
  static {
    // c
  }
}
`,
			);
		});

		test('formats "namespace N {\\n  a; ; // c\\n  b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`namespace N {
  a; ; // c
  b;
}`,
				`namespace N {
  a; // c
  b;
}
`,
			);
		});

		test('formats "namespace N {\\n  ; // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`namespace N {
  ; // c
}`,
				`namespace N {
  // c
}
`,
			);
		});

		test('formats "; // c\\n[1].forEach(log)" like Prettier with semi: false', async () => {
			await expectPrettierFormat(
				`; // c
[1].forEach(log)`,
				`// c
;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('formats "a; ; // c\\nb" like Prettier with semi: false', async () => {
			await expectPrettierFormat(
				`a; ; // c
b`,
				`a // c
b
`,
				{ semi: false },
			);
		});

		test('formats "a\\n; // c\\n[1].forEach(log)" like Prettier with semi: false', async () => {
			await expectPrettierFormat(
				`a
; // c
[1].forEach(log)`,
				`a // c
;[1].forEach(log)
`,
				{ semi: false },
			);
		});

		test('keeps a comment on an empty statement body', async () => {
			await expectPrettierFormat(
				`if (x); // c
else y;`,
				`if (x); // c
else y;
`,
			);
		});
	});

	describe('lines with only a semicolon', () => {
		test('formats "a();\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
;
b();`,
				`a();
b();
`,
			);
		});

		test('formats "a();\\n;;\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
;;
;
b();`,
				`a();
b();
`,
			);
		});

		test('formats "a();\\n;\\n\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
;

b();`,
				`a();
b();
`,
			);
		});

		test('formats "a();\\n\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();

;
b();`,
				`a();

b();
`,
			);
		});

		test('formats "a(); // c\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a(); // c
;
b();`,
				`a(); // c
b();
`,
			);
		});

		test('formats "a();\\n; // c\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
; // c
b();`,
				`a(); // c
b();
`,
			);
		});

		test('formats "a();\\n// c\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
// c
;
b();`,
				`a();
// c
b();
`,
			);
		});

		test('formats "a();\\n;\\n// c\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
;
// c
b();`,
				`a();
// c
b();
`,
			);
		});

		test('formats "a();\\n// c\\n;\\n// d\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
// c
;
// d
b();`,
				`a();
// c
// d
b();
`,
			);
		});

		test('formats "a();\\n/* c */\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
/* c */
;
b();`,
				`a();
/* c */
b();
`,
			);
		});

		test('formats "a();\\n;\\n// c" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
;
// c`,
				`a();
// c
`,
			);
		});

		test('formats "a();\\n;\\n\\n// c" like Prettier', async () => {
			await expectPrettierFormat(
				`a();
;

// c`,
				`a();

// c
`,
			);
		});

		test('formats "function f() {\\n  a();\\n  ;\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  a();
  ;
  b();
}`,
				`function f() {
  a();
  b();
}
`,
			);
		});

		test('formats "function f() {\\n  a();\\n  ;\\n  // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  a();
  ;
  // c
}`,
				`function f() {
  a();
  // c
}
`,
			);
		});

		test('formats "class A {\\n  static {\\n    a();\\n    ;\\n    b();\\n  }\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  static {
    a();
    ;
    b();
  }
}`,
				`class A {
  static {
    a();
    b();
  }
}
`,
			);
		});

		test('formats "namespace N {\\n  a();\\n  ;\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`namespace N {
  a();
  ;
  b();
}`,
				`namespace N {
  a();
  b();
}
`,
			);
		});

		test('formats "class A {\\n  first() {\\n    return 1;\\n  }\\n  ;\\n  second() {\\n    return 2;\\n  }\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  first() {
    return 1;
  }
  ;
  second() {
    return 2;
  }
}`,
				`class A {
  first() {
    return 1;
  }
  second() {
    return 2;
  }
}
`,
			);
		});

		test('formats "switch (x) {\\n  case 1:\\n    a();\\n    ;\\n    // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:
    a();
    ;
    // c
}`,
				`switch (x) {
  case 1:
    a();
  // c
}
`,
			);
		});

		test('formats "switch (x) {\\n  case 1:\\n    a();\\n\\n\\n    // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:
    a();


    // c
}`,
				`switch (x) {
  case 1:
    a();

  // c
}
`,
			);
		});

		test('formats "a()\\n;\\n\\nb()" like Prettier with semi: false', async () => {
			await expectPrettierFormat(
				`a()
;

b()`,
				`a()

b()
`,
				{ semi: false },
			);
		});

		test('formats "a\\n;\\n;[b].c()" like Prettier with semi: false', async () => {
			await expectPrettierFormat(
				`a
;
;[b].c()`,
				`a
;[b].c()
`,
				{ semi: false },
			);
		});
	});

	describe('comment-only files', () => {
		test('keeps "// only"', async () => {
			await expectPrettierFormat(
				`// only`,
				`// only
`,
			);
		});

		test('keeps "// a\\n\\n// b"', async () => {
			await expectPrettierFormat(
				`// a

// b`,
				`// a

// b
`,
			);
		});

		test('keeps "/* block */"', async () => {
			await expectPrettierFormat(
				`/* block */`,
				`/* block */
`,
			);
		});

		test('keeps "/**\\n * License\\n */"', async () => {
			await expectPrettierFormat(
				`/**
 * License
 */`,
				`/**
 * License
 */
`,
			);
		});

		test('prints the comments of a file with only empty statements on consecutive lines', async () => {
			await expectPrettierFormat(
				`// a

// b
;
`,
				`// a
// b
`,
			);
			await expectPrettierFormat(
				`;
// a

// b
`,
				`// a
// b
`,
			);
		});
	});

	describe('hashbangs', () => {
		test('keeps "#!/usr/bin/env node\\n// A comment"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
// A comment`,
				`#!/usr/bin/env node
// A comment
`,
			);
		});

		test('keeps "#!/usr/bin/env node\\nconsole.log(1);"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
console.log(1);`,
				`#!/usr/bin/env node
console.log(1);
`,
			);
		});

		test('keeps "#!/usr/bin/env node\\n\\nimport { x } from \\"./x\\";"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node

import { x } from "./x";`,
				`#!/usr/bin/env node

import { x } from "./x";
`,
			);
		});

		test('keeps "#!/usr/bin/env node\\n\\"use strict\\";\\nconsole.log(1);"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
"use strict";
console.log(1);`,
				`#!/usr/bin/env node
"use strict";
console.log(1);
`,
			);
		});

		test('keeps the hashbang of a file with only empty statements', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
;
`,
				`#!/usr/bin/env node
`,
			);
		});

		test('keeps the hashbang before empty statements in "#!/usr/bin/env node\\n;\\nconsole.log(1);"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
;
console.log(1);`,
				`#!/usr/bin/env node
console.log(1);
`,
			);
		});

		test('keeps the hashbang before empty statements in "#!/usr/bin/env node\\n;\\n// A comment\\nconsole.log(1);"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
;
// A comment
console.log(1);`,
				`#!/usr/bin/env node
// A comment
console.log(1);
`,
			);
		});

		test('keeps the hashbang before empty statements in "#!/usr/bin/env node\\n;;\\n\\"use strict\\";\\nconsole.log(1);"', async () => {
			await expectPrettierFormat(
				`#!/usr/bin/env node
;;
"use strict";
console.log(1);`,
				`#!/usr/bin/env node
("use strict");
console.log(1);
`,
			);
		});

		test('keeps a line comment that starts with a slash a comment', async () => {
			await expectPrettierFormat(
				`///usr/bin/env node
console.log(1);`,
				`///usr/bin/env node
console.log(1);
`,
			);
		});
	});

	describe('using declarations', () => {
		test('puts each declarator on its own line once one has a value', async () => {
			await expectPrettierFormat(
				`using a = open(), b = open();`,
				`using a = open(),
  b = open();
`,
			);
		});
	});

	describe('regular expressions', () => {
		test('keeps the v flag and modifiers', async () => {
			await expectPrettierFormat(
				`const set = /[\\p{L}--[a-z]]/v;
const modified = /(?i:a)b/;`,
				`const set = /[\\p{L}--[a-z]]/v;
const modified = /(?i:a)b/;
`,
			);
		});
	});

	describe('comments in empty bodies', () => {
		test('drops the blank lines between the comments of an empty body', async () => {
			await expectPrettierFormat(
				`{
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
}`,
				`{
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
}
`,
			);
		});

		test('keeps the comments of a class body with no members inside it', async () => {
			await expectPrettierFormat(
				`class A {
  // a

  // b
}
const C = class {
  /* only */
};
class D { /* x */ }`,
				`class A {
  // a
  // b
}
const C = class {
  /* only */
};
class D {
  /* x */
}
`,
			);
		});
	});

	describe('TypeScript types survive formatting', () => {
		test('keeps type arguments on typeof type queries: const upper: typeof identity<string> = (value) => value.toUpperCase();', async () => {
			await expectPrettierFormat(
				`const upper: typeof identity<string> = (value) => value.toUpperCase();`,
				`const upper: typeof identity<string> = (value) => value.toUpperCase();
`,
			);
		});

		test('keeps type arguments on typeof type queries: type Pair = typeof ns.pair<number, string>;', async () => {
			await expectPrettierFormat(
				`type Pair = typeof ns.pair<number, string>;`,
				`type Pair = typeof ns.pair<number, string>;
`,
			);
		});

		test('keeps type arguments on typeof type queries: type Loaded = typeof import("./module").load<string>;', async () => {
			await expectPrettierFormat(
				`type Loaded = typeof import("./module").load<string>;`,
				`type Loaded = typeof import("./module").load<string>;
`,
			);
		});

		test('keeps type arguments on tagged templates: const query = sql<Row>`select 1`;', async () => {
			await expectPrettierFormat(
				`const query = sql<Row>\`select 1\`;`,
				`const query = sql<Row>\`select 1\`;
`,
			);
		});

		test('keeps type arguments on tagged templates: const Title = styled.h1<Props>`\n  color: red;\n`;', async () => {
			await expectPrettierFormat(
				`const Title = styled.h1<Props>\`
  color: red;
\`;`,
				`const Title = styled.h1<Props>\`
  color: red;
\`;
`,
			);
		});

		test('keeps type arguments on tagged templates: const nested = tag<Map<string, number>, Key>`a${value}c`;', async () => {
			await expectPrettierFormat(
				`const nested = tag<Map<string, number>, Key>\`a\${value}c\`;`,
				`const nested = tag<Map<string, number>, Key>\`a\${value}c\`;
`,
			);
		});

		test('keeps type arguments on import types', async () => {
			await expectPrettierFormat(
				`type Entry = import("./module").Entry<string>;`,
				`type Entry = import("./module").Entry<string>;
`,
			);
		});

		test('breaks the parentheses of an import type around a comment like call arguments', async () => {
			await expectPrettierFormat(
				`type X = import(
  /* c */
  'a');
type Y = import(
  "a" // c
).B;`,
				`type X = import(
  /* c */
  "a"
);
type Y = import(
  "a" // c
).B;
`,
			);
		});

		test('keeps "type X = import(/* c */ \\"a\\");"', async () => {
			await expectPrettierFormat(
				`type X = import(/* c */ "a");`,
				`type X = import(/* c */ "a");
`,
			);
		});

		test('keeps "type Y = import(\\"a\\" /* c */).B<T>;"', async () => {
			await expectPrettierFormat(
				`type Y = import("a" /* c */).B<T>;`,
				`type Y = import("a" /* c */).B<T>;
`,
			);
		});

		test('keeps "type Z =\\n  import(\\"./long/long/long/long/long/long/long/long/long/long/long/path/to/module\\");"', async () => {
			await expectPrettierFormat(
				`type Z =
  import("./long/long/long/long/long/long/long/long/long/long/long/path/to/module");`,
				`type Z =
  import("./long/long/long/long/long/long/long/long/long/long/long/path/to/module");
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "function f(x): asserts /* c */ x {}"', async () => {
			await expectPrettierFormat(
				`function f(x): asserts /* c */ x {}`,
				`function f(x): asserts /* c */ x {}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "function f(x): x /* c */ is T {}"', async () => {
			await expectPrettierFormat(
				`function f(x): x /* c */ is T {}`,
				`function f(x): x /* c */ is T {}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "function f(this: A): this /* c */ is T {}"', async () => {
			await expectPrettierFormat(
				`function f(this: A): this /* c */ is T {}`,
				`function f(this: A): this /* c */ is T {}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "function f(x): asserts x /* c */ is T {}"', async () => {
			await expectPrettierFormat(
				`function f(x): asserts x /* c */ is T {}`,
				`function f(x): asserts x /* c */ is T {}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "function f(x): asserts /* c */ this is T {}"', async () => {
			await expectPrettierFormat(
				`function f(x): asserts /* c */ this is T {}`,
				`function f(x): asserts /* c */ this is T {}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "function f(): asserts this /* c */ {}"', async () => {
			await expectPrettierFormat(
				`function f(): asserts this /* c */ {}`,
				`function f(): asserts this /* c */ {}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "type F = (x: unknown) => x /* c */ is string;"', async () => {
			await expectPrettierFormat(
				`type F = (x: unknown) => x /* c */ is string;`,
				`type F = (x: unknown) => x /* c */ is string;
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "class A {\\n  isB(): this /* c */ is B {\\n    return true;\\n  }\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  isB(): this /* c */ is B {
    return true;
  }
}`,
				`class A {
  isB(): this /* c */ is B {
    return true;
  }
}
`,
			);
		});

		test('keeps the comment next to the parameter name of a type predicate in "interface I {\\n  isB(x): x /* c */ is B;\\n}"', async () => {
			await expectPrettierFormat(
				`interface I {
  isB(x): x /* c */ is B;
}`,
				`interface I {
  isB(x): x /* c */ is B;
}
`,
			);
		});

		test('keeps the comment around a type predicate in "function f(x): /* c */ x is T {}"', async () => {
			await expectPrettierFormat(
				`function f(x): /* c */ x is T {}`,
				`function f(x): /* c */ x is T {}
`,
			);
		});

		test('keeps the comment around a type predicate in "function f(x): x is /* c */ T {}"', async () => {
			await expectPrettierFormat(
				`function f(x): x is /* c */ T {}`,
				`function f(x): x is /* c */ T {}
`,
			);
		});

		test('keeps the comment around a type predicate in "function f(x): asserts x is /* c */ T {}"', async () => {
			await expectPrettierFormat(
				`function f(x): asserts x is /* c */ T {}`,
				`function f(x): asserts x is /* c */ T {}
`,
			);
		});

		test('keeps polymorphic this types', async () => {
			await expectPrettierFormat(
				`interface Builder {
  self: this;
  next(): this;
  all: this[];
}`,
				`interface Builder {
  self: this;
  next(): this;
  all: this[];
}
`,
			);
			await expectPrettierFormat(
				`class Chain {
  clone(): this {
    return this;
  }
}`,
				`class Chain {
  clone(): this {
    return this;
  }
}
`,
			);
		});

		test('keeps superclass type arguments and implements clauses: class Derived extends Base<string> implements Contract<string> {}', async () => {
			await expectPrettierFormat(
				`class Derived extends Base<string> implements Contract<string> {}`,
				`class Derived extends Base<string> implements Contract<string> {}
`,
			);
		});

		test('keeps superclass type arguments and implements clauses: class Derived extends ns.Base<Map<string, number>> {}', async () => {
			await expectPrettierFormat(
				`class Derived extends ns.Base<Map<string, number>> {}`,
				`class Derived extends ns.Base<Map<string, number>> {}
`,
			);
		});

		test('keeps superclass type arguments and implements clauses: class Derived implements Contract<string>, ns.Other {}', async () => {
			await expectPrettierFormat(
				`class Derived implements Contract<string>, ns.Other {}`,
				`class Derived implements Contract<string>, ns.Other {}
`,
			);
		});

		test('keeps superclass type arguments and implements clauses: const Derived = class extends Base<number> implements Contract<number> {};', async () => {
			await expectPrettierFormat(
				`const Derived = class extends Base<number> implements Contract<number> {};`,
				`const Derived = class extends Base<number> implements Contract<number> {};
`,
			);
		});

		test('keeps superclass type arguments and implements clauses: abstract class Derived<T> extends Base<T> implements Contract<T> {}', async () => {
			await expectPrettierFormat(
				`abstract class Derived<T> extends Base<T> implements Contract<T> {}`,
				`abstract class Derived<T> extends Base<T> implements Contract<T> {}
`,
			);
		});

		test('keeps superclass type arguments and implements clauses: export default class Derived extends Base<string> implements Contract<string> {}', async () => {
			await expectPrettierFormat(
				`export default class Derived extends Base<string> implements Contract<string> {}`,
				`export default class Derived extends Base<string> implements Contract<string> {}
`,
			);
		});
	});

	describe('TypeScript types survive formatting > import attributes in import types', () => {
		test('keeps them: type A = import("foo", { with: { type: "json" } });', async () => {
			await expectPrettierFormat(
				`type A = import("foo", { with: { type: "json" } });`,
				`type A = import("foo", { with: { type: "json" } });
`,
			);
		});

		test('keeps them: type B = import("foo", { with: { "resolution-mode": "import" } }).Bar;', async () => {
			await expectPrettierFormat(
				`type B = import("foo", { with: { "resolution-mode": "import" } }).Bar;`,
				`type B = import("foo", { with: { "resolution-mode": "import" } }).Bar;
`,
			);
		});

		test('keeps them: let c: typeof import("foo", { with: { type: "json" } });', async () => {
			await expectPrettierFormat(
				`let c: typeof import("foo", { with: { type: "json" } });`,
				`let c: typeof import("foo", { with: { type: "json" } });
`,
			);
		});

		test('keeps them: type D = typeof import("foo", { with: { type: "json" } }).value<string>;', async () => {
			await expectPrettierFormat(
				`type D = typeof import("foo", { with: { type: "json" } }).value<string>;`,
				`type D = typeof import("foo", { with: { type: "json" } }).value<string>;
`,
			);
		});

		test('keeps them: type E = import("foo", { assert: { "resolution-mode": "require" } }).ns.Bar<T>;', async () => {
			await expectPrettierFormat(
				`type E = import("foo", { assert: { "resolution-mode": "require" } }).ns.Bar<T>;`,
				`type E = import("foo", { assert: { "resolution-mode": "require" } }).ns.Bar<T>;
`,
			);
		});

		test('keeps an object broken where it was written broken', async () => {
			await expectPrettierFormat(
				`type A = import("foo", {
  with: {
  type: "json",}})
type B = import("foo", {
  with: {
  type: "json"},})`,
				`type A = import("foo", {
  with: {
    type: "json",
  },
});
type B = import("foo", {
  with: {
    type: "json",
  },
});
`,
			);
			await expectPrettierFormat(
				`type A = import("foo", {
  with: {
  type: "json",}})
type B = import("foo", {
  with: {
  type: "json"},})`,
				`type A = import("foo", {
  with: {
    type: "json"
  }
});
type B = import("foo", {
  with: {
    type: "json"
  }
});
`,
				{ trailingComma: 'none' },
			);
		});

		test('hugs the import attributes when only they break', async () => {
			await expectPrettierFormat(
				`type Mode = import("pkg", { with: { "resolution-mode": "require" } }).Mode<string>;`,
				`type Mode = import('pkg', {
  with: {
    'resolution-mode': 'require',
  },
}).Mode<string>;
`,
				{ printWidth: 40, singleQuote: true },
			);
		});

		test('keeps them in a template body', async () => {
			await expectFormat(
				`export function App() {
  const data: import("./data.json", { with: { type: "json" } }).Data = load();
  <div>{data.name}</div>
}`,
				`export function App() {
  const data: import("./data.json", { with: { type: "json" } }).Data = load();
  <div>{data.name}</div>
}
`,
			);
		});
	});

	describe('type parentheses follow Prettier', () => {
		test('prints const f = (journal: Journal): () => void => {\n  return () => {};\n}; as const f = (journal: Journal): (() => void) => {\n  return () => {};\n};', async () => {
			await expectPrettierFormat(
				`const f = (journal: Journal): () => void => {
  return () => {};
};`,
				`const f = (journal: Journal): (() => void) => {
  return () => {};
};
`,
			);
		});

		test('prints class C {\n  m = <T,>(): <U>(u: U) => T => null!;\n} as class C {\n  m = <T,>(): (<U>(u: U) => T) => null!;\n}', async () => {
			await expectPrettierFormat(
				`class C {
  m = <T,>(): <U>(u: U) => T => null!;
}`,
				`class C {
  m = <T,>(): (<U>(u: U) => T) => null!;
}
`,
			);
		});

		test('prints type A = typeof a[]; as type A = (typeof a)[];', async () => {
			await expectPrettierFormat(
				`type A = typeof a[];`,
				`type A = (typeof a)[];
`,
			);
		});

		test('prints type A = typeof a[number]; as type A = (typeof a)[number];', async () => {
			await expectPrettierFormat(
				`type A = typeof a[number];`,
				`type A = (typeof a)[number];
`,
			);
		});

		test('prints type A = keyof keyof T; as type A = keyof (keyof T);', async () => {
			await expectPrettierFormat(
				`type A = keyof keyof T;`,
				`type A = keyof (keyof T);
`,
			);
		});

		test('prints type A = [...A | B]; as type A = [...(A | B)];', async () => {
			await expectPrettierFormat(
				`type A = [...A | B];`,
				`type A = [...(A | B)];
`,
			);
		});

		test('prints type A = <X extends B extends C ? D : E>() => X; as type A = <X extends (B extends C ? D : E)>() => X;', async () => {
			await expectPrettierFormat(
				`type A = <X extends B extends C ? D : E>() => X;`,
				`type A = <X extends (B extends C ? D : E)>() => X;
`,
			);
		});

		test('keeps const f = (): (() => void) => () => {}; as written', async () => {
			await expectPrettierFormat(
				`const f = (): (() => void) => () => {};`,
				`const f = (): (() => void) => () => {};
`,
			);
		});

		test('keeps const f = (): (() => void) | null => null; as written', async () => {
			await expectPrettierFormat(
				`const f = (): (() => void) | null => null;`,
				`const f = (): (() => void) | null => null;
`,
			);
		});

		test('keeps const f = (): Promise<() => void> => load(); as written', async () => {
			await expectPrettierFormat(
				`const f = (): Promise<() => void> => load();`,
				`const f = (): Promise<() => void> => load();
`,
			);
		});

		test('keeps const f = (): new () => Foo => Foo; as written', async () => {
			await expectPrettierFormat(
				`const f = (): new () => Foo => Foo;`,
				`const f = (): new () => Foo => Foo;
`,
			);
		});

		test('keeps const f = (): A extends B ? C : D => value; as written', async () => {
			await expectPrettierFormat(
				`const f = (): A extends B ? C : D => value;`,
				`const f = (): A extends B ? C : D => value;
`,
			);
		});

		test('keeps const f = (): value is () => void => true; as written', async () => {
			await expectPrettierFormat(
				`const f = (): value is () => void => true;`,
				`const f = (): value is () => void => true;
`,
			);
		});

		test('keeps function f(): () => void {} as written', async () => {
			await expectPrettierFormat(
				`function f(): () => void {}`,
				`function f(): () => void {}
`,
			);
		});

		test('keeps const f = function (): () => void {}; as written', async () => {
			await expectPrettierFormat(
				`const f = function (): () => void {};`,
				`const f = function (): () => void {};
`,
			);
		});

		test('keeps let callback: () => void; as written', async () => {
			await expectPrettierFormat(
				`let callback: () => void;`,
				`let callback: () => void;
`,
			);
		});

		test('keeps type A = (keyof T)[]; as written', async () => {
			await expectPrettierFormat(
				`type A = (keyof T)[];`,
				`type A = (keyof T)[];
`,
			);
		});

		test('keeps type A = keyof T[]; as written', async () => {
			await expectPrettierFormat(
				`type A = keyof T[];`,
				`type A = keyof T[];
`,
			);
		});

		test('keeps type A = readonly (typeof a)[]; as written', async () => {
			await expectPrettierFormat(
				`type A = readonly (typeof a)[];`,
				`type A = readonly (typeof a)[];
`,
			);
		});

		test('keeps type A = keyof typeof a; as written', async () => {
			await expectPrettierFormat(
				`type A = keyof typeof a;`,
				`type A = keyof typeof a;
`,
			);
		});

		test('keeps type A = (() => void)[]; as written', async () => {
			await expectPrettierFormat(
				`type A = (() => void)[];`,
				`type A = (() => void)[];
`,
			);
		});

		test('keeps type A = [(() => void)?]; as written', async () => {
			await expectPrettierFormat(
				`type A = [(() => void)?];`,
				`type A = [(() => void)?];
`,
			);
		});

		test('keeps type A = [...infer U]; as written', async () => {
			await expectPrettierFormat(
				`type A = [...infer U];`,
				`type A = [...infer U];
`,
			);
		});

		test('keeps type A = B extends (C extends D ? E : F) ? G : H; as written', async () => {
			await expectPrettierFormat(
				`type A = B extends (C extends D ? E : F) ? G : H;`,
				`type A = B extends (C extends D ? E : F) ? G : H;
`,
			);
		});

		test('keeps type A = (B extends C ? D : E) extends F ? G : H; as written', async () => {
			await expectPrettierFormat(
				`type A = (B extends C ? D : E) extends F ? G : H;`,
				`type A = (B extends C ? D : E) extends F ? G : H;
`,
			);
		});

		test('keeps type A = B extends (() => infer R extends string) ? R : never; as written', async () => {
			await expectPrettierFormat(
				`type A = B extends (() => infer R extends string) ? R : never;`,
				`type A = B extends (() => infer R extends string) ? R : never;
`,
			);
		});

		test('keeps type A = B extends () => infer R ? R : never; as written', async () => {
			await expectPrettierFormat(
				`type A = B extends () => infer R ? R : never;`,
				`type A = B extends () => infer R ? R : never;
`,
			);
		});

		test('keeps type A = { [K in B extends "" ? "index" : B]: 1 }; as written', async () => {
			await expectPrettierFormat(
				`type A = { [K in B extends "" ? "index" : B]: 1 };`,
				`type A = { [K in B extends "" ? "index" : B]: 1 };
`,
			);
		});

		test('keeps type A<T> = T extends [infer U extends (B extends C ? D : E)] ? U : never; as written', async () => {
			await expectPrettierFormat(
				`type A<T> = T extends [infer U extends (B extends C ? D : E)] ? U : never;`,
				`type A<T> = T extends [infer U extends (B extends C ? D : E)] ? U : never;
`,
			);
		});

		test('drops the redundant parentheses in type A = (B | C);', async () => {
			await expectPrettierFormat(
				`type A = (B | C);`,
				`type A = B | C;
`,
			);
		});

		test('drops the redundant parentheses in let x: (A | B) = 1;', async () => {
			await expectPrettierFormat(
				`let x: (A | B) = 1;`,
				`let x: A | B = 1;
`,
			);
		});

		test('drops the redundant parentheses in type D = ((E));', async () => {
			await expectPrettierFormat(
				`type D = ((E));`,
				`type D = E;
`,
			);
		});

		test('drops the redundant parentheses in type A = (string);', async () => {
			await expectPrettierFormat(
				`type A = (string);`,
				`type A = string;
`,
			);
		});

		test('drops the redundant parentheses in type A = Foo<(B | C)>;', async () => {
			await expectPrettierFormat(
				`type A = Foo<(B | C)>;`,
				`type A = Foo<B | C>;
`,
			);
		});

		test('drops the redundant parentheses in type A = ReturnType<(typeof f)>;', async () => {
			await expectPrettierFormat(
				`type A = ReturnType<(typeof f)>;`,
				`type A = ReturnType<typeof f>;
`,
			);
		});

		test('drops the redundant parentheses in type A = { [K in (keyof T)]: T[K] };', async () => {
			await expectPrettierFormat(
				`type A = { [K in (keyof T)]: T[K] };`,
				`type A = { [K in keyof T]: T[K] };
`,
			);
		});

		test('drops the redundant parentheses in type A = B extends C ? D : (E extends F ? G : H);', async () => {
			await expectPrettierFormat(
				`type A = B extends C ? D : (E extends F ? G : H);`,
				`type A = B extends C ? D : E extends F ? G : H;
`,
			);
		});

		test('drops the redundant parentheses in type A = (B | C) extends (D | E) ? (F | G) : H;', async () => {
			await expectPrettierFormat(
				`type A = (B | C) extends (D | E) ? (F | G) : H;`,
				`type A = B | C extends D | E ? F | G : H;
`,
			);
		});

		test('drops the redundant parentheses in type A = ({ a: string }) | null;', async () => {
			await expectPrettierFormat(
				`type A = ({ a: string }) | null;`,
				`type A = { a: string } | null;
`,
			);
		});

		test('drops the redundant parentheses in const g = (): (A | B) => x;', async () => {
			await expectPrettierFormat(
				`const g = (): (A | B) => x;`,
				`const g = (): A | B => x;
`,
			);
		});

		test('drops the redundant parentheses in function f(): (() => void) {}', async () => {
			await expectPrettierFormat(
				`function f(): (() => void) {}`,
				`function f(): () => void {}
`,
			);
		});

		test('drops the redundant parentheses in function f(a: (A | B), b: ((x: string) => void)) {}', async () => {
			await expectPrettierFormat(
				`function f(a: (A | B), b: ((x: string) => void)) {}`,
				`function f(a: A | B, b: (x: string) => void) {}
`,
			);
		});

		test('drops the redundant parentheses in let v = x as (A | B);', async () => {
			await expectPrettierFormat(
				`let v = x as (A | B);`,
				`let v = x as A | B;
`,
			);
		});

		test('drops the redundant parentheses in let v = x satisfies (A);', async () => {
			await expectPrettierFormat(
				`let v = x satisfies (A);`,
				`let v = x satisfies A;
`,
			);
		});

		test('drops the redundant parentheses in class C<T extends (A | B) = (C)> implements I<(X)> {}', async () => {
			await expectPrettierFormat(
				`class C<T extends (A | B) = (C)> implements I<(X)> {}`,
				`class C<T extends A | B = C> implements I<X> {}
`,
			);
		});

		test('drops the redundant parentheses in interface I { a: (string | number); b(): (A | B); }', async () => {
			await expectPrettierFormat(
				`interface I { a: (string | number); b(): (A | B); }`,
				`interface I {
  a: string | number;
  b(): A | B;
}
`,
			);
		});

		test('keeps the needed parentheses in type A = (B | C)[];', async () => {
			await expectPrettierFormat(
				`type A = (B | C)[];`,
				`type A = (B | C)[];
`,
			);
		});

		test('keeps the needed parentheses in type A = (B & C) | D;', async () => {
			await expectPrettierFormat(
				`type A = (B & C) | D;`,
				`type A = (B & C) | D;
`,
			);
		});

		test('keeps the needed parentheses in type A = B & (C | D);', async () => {
			await expectPrettierFormat(
				`type A = B & (C | D);`,
				`type A = B & (C | D);
`,
			);
		});

		test('keeps the needed parentheses in type A = keyof (B | C);', async () => {
			await expectPrettierFormat(
				`type A = keyof (B | C);`,
				`type A = keyof (B | C);
`,
			);
		});

		test('keeps the needed parentheses in type A = (new () => X) | Y;', async () => {
			await expectPrettierFormat(
				`type A = (new () => X) | Y;`,
				`type A = (new () => X) | Y;
`,
			);
		});

		test('keeps the needed parentheses in type A = (abstract new () => void) | X;', async () => {
			await expectPrettierFormat(
				`type A = (abstract new () => void) | X;`,
				`type A = (abstract new () => void) | X;
`,
			);
		});

		test('keeps the needed parentheses in type A = ((a: string) => void) | null;', async () => {
			await expectPrettierFormat(
				`type A = ((a: string) => void) | null;`,
				`type A = ((a: string) => void) | null;
`,
			);
		});

		test('keeps the needed parentheses in type A = (B extends C ? D : E)[];', async () => {
			await expectPrettierFormat(
				`type A = (B extends C ? D : E)[];`,
				`type A = (B extends C ? D : E)[];
`,
			);
		});

		test('keeps the needed parentheses in type A = B extends (infer U)[] ? U : never;', async () => {
			await expectPrettierFormat(
				`type A = B extends (infer U)[] ? U : never;`,
				`type A = B extends (infer U)[] ? U : never;
`,
			);
		});

		test('keeps the needed parentheses in type A = [(B | C)?];', async () => {
			await expectPrettierFormat(
				`type A = [(B | C)?];`,
				`type A = [(B | C)?];
`,
			);
		});

		test('keeps the needed parentheses in type A = (B | C)["x"];', async () => {
			await expectPrettierFormat(
				`type A = (B | C)["x"];`,
				`type A = (B | C)["x"];
`,
			);
		});

		test('keeps the needed parentheses in type A = (readonly string[])[];', async () => {
			await expectPrettierFormat(
				`type A = (readonly string[])[];`,
				`type A = (readonly string[])[];
`,
			);
		});

		test('keeps the needed parentheses in const x = y as (typeof z)[number];', async () => {
			await expectPrettierFormat(
				`const x = y as (typeof z)[number];`,
				`const x = y as (typeof z)[number];
`,
			);
		});

		test('lays out a type as if its parentheses were not written', async () => {
			await expectPrettierFormat(
				`type A = (Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccccccccccccccccccccccccccccccccc);
type B = (Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccccccccccccccccccccccccccccccccc)[];
type C = [(Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb), (Cccccccccccccccccccccccc | D)];
function foo(a: (Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)) {}
type D = (
  | { kind: "a"; value: string }
  | { kind: "b"; value: number }
);`,
				`type A =
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
type D = { kind: "a"; value: string } | { kind: "b"; value: number };
`,
			);
		});

		test('picks the layout from the type inside the parentheses', async () => {
			await expectPrettierFormat(
				`function foo(options: ({ aaaaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbb: number; ccccccccc: boolean })) {}
const fooooooooooooooooooooooooo = (aaaaaaa: string, bbbbbbbbbbbbbbb: number): ({ a: string; b: number }) => {};
export const selectorByInstance: (Map<Selector, WeakMap<Instance, Value>>) = new Map();
foo(x as (A)[], b);`,
				`function foo(options: {
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
foo(x as A[], b);
`,
			);
		});

		test('keeps the parentheses of a type kept by prettier-ignore', async () => {
			await expectPrettierFormat(
				`type A = keyof /* prettier-ignore */ (B   |   C);
type D = [/* prettier-ignore */ (B   |   C)?];
type E =
  | B
  // prettier-ignore
  | (C   &   D)
  | E;`,
				`type A = keyof /* prettier-ignore */ (B   |   C);
type D = [/* prettier-ignore */ (B   |   C)?];
type E =
  | B
  // prettier-ignore
  | (C   &   D)
  | E;
`,
			);
		});

		test('parenthesizes a conditional true type that stays on one line', async () => {
			await expectPrettierFormat(
				`type A<T> = T extends string ? T extends "a" ? 1 : 2 : 3;
type B<T> = T extends string ? (T extends "aaaaaaaaaaaaaaaaaaaaaa" ? "bbbbbbbbbbbbbbbbbbbbbbbbbb" : "cccccccccccccccccccccc") : never;
type C = IfAny<T, false, T extends object ? (keyof T extends K ? true : false) : false>;`,
				`type A<T> = T extends string ? (T extends "a" ? 1 : 2) : 3;
type B<T> = T extends string
  ? T extends "aaaaaaaaaaaaaaaaaaaaaa"
    ? "bbbbbbbbbbbbbbbbbbbbbbbbbb"
    : "cccccccccccccccccccccc"
  : never;
type C = IfAny<
  T,
  false,
  T extends object ? (keyof T extends K ? true : false) : false
>;
`,
			);
		});

		test('keeps the comments around dropped parentheses', async () => {
			await expectPrettierFormat(
				`type A = /* c */ (B | C);
type D = (/* c */ B | C);
type E = (B | C) /* c */;
type X = (
  /* leading */ A
);
type Y = (A // trailing
);`,
				`type A = /* c */ B | C;
type D = /* c */ B | C;
type E = B | C /* c */;
type X = /* leading */ A;
type Y = A; // trailing
`,
			);
		});
	});

	describe('union types break like Prettier', () => {
		test('keeps the comments of "type Kind =\\n  | \\"first\\" // the first kind\\n  // the second kind, on its own line\\n  | \\"second\\"\\n  | \\"third\\";" where they are', async () => {
			await expectPrettierFormat(
				`type Kind =
  | "first" // the first kind
  // the second kind, on its own line
  | "second"
  | "third";`,
				`type Kind =
  | "first" // the first kind
  // the second kind, on its own line
  | "second"
  | "third";
`,
			);
		});

		test('keeps the comments of "type Kind =\\n  | \\"first\\"\\n  /* the second kind */\\n  | \\"second\\";" where they are', async () => {
			await expectPrettierFormat(
				`type Kind =
  | "first"
  /* the second kind */
  | "second";`,
				`type Kind =
  | "first"
  /* the second kind */
  | "second";
`,
			);
		});

		test('keeps the comments of "type Kind =\\n  | \\"first\\"\\n\\n  // the second kind\\n  | \\"second\\";" where they are', async () => {
			await expectPrettierFormat(
				`type Kind =
  | "first"

  // the second kind
  | "second";`,
				`type Kind =
  | "first"

  // the second kind
  | "second";
`,
			);
		});

		test('keeps the comments of "type K = (\\n  | \\"first\\"\\n  // the second kind\\n  | \\"second\\"\\n)[];" where they are', async () => {
			await expectPrettierFormat(
				`type K = (
  | "first"
  // the second kind
  | "second"
)[];`,
				`type K = (
  | "first"
  // the second kind
  | "second"
)[];
`,
			);
		});

		test('keeps the comments of "function f(\\n  kind:\\n    | \\"first\\"\\n    // the second kind\\n    | \\"second\\",\\n) {}" where they are', async () => {
			await expectPrettierFormat(
				`function f(
  kind:
    | "first"
    // the second kind
    | "second",
) {}`,
				`function f(
  kind:
    | "first"
    // the second kind
    | "second",
) {}
`,
			);
		});

		test('keeps the comments of "type A =\\n  | B // c\\n  | C;" where they are', async () => {
			await expectPrettierFormat(
				`type A =
  | B // c
  | C;`,
				`type A =
  | B // c
  | C;
`,
			);
		});

		test('keeps the comments of "let value: /* either */ A | B;" where they are', async () => {
			await expectPrettierFormat(
				`let value: /* either */ A | B;`,
				`let value: /* either */ A | B;
`,
			);
		});

		test('prints the comments of "interface Props {\\n  value: /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbb;\\n}" before the next |, like Prettier', async () => {
			await expectPrettierFormat(
				`interface Props {
  value: /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbb;
}`,
				`interface Props {
  value:
    | /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbb;
}
`,
			);
		});

		test('prints the comments of "type T = /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;" before the next |, like Prettier', async () => {
			await expectPrettierFormat(
				`type T = /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;`,
				`type T =
  | /* either */ Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;
`,
			);
		});

		test('prints the comments of "type A = B | // c\\n  C;" before the next |, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = B | // c
  C;`,
				`type A =
  | B // c
  | C;
`,
			);
		});

		test('prints the comments of "type A =\\n  | B | // c\\n  C" before the next |, like Prettier', async () => {
			await expectPrettierFormat(
				`type A =
  | B | // c
  C`,
				`type A =
  | B // c
  | C;
`,
			);
		});

		test('prints the comments of "type Kind =\\n  | \\"first\\"\\n  // the second kind\\n\\n  | \\"second\\";" before the next |, like Prettier', async () => {
			await expectPrettierFormat(
				`type Kind =
  | "first"
  // the second kind

  | "second";`,
				`type Kind =
  | "first"
  // the second kind
  | "second";
`,
			);
		});

		test('moves a broken union in a type annotation to its own indented lines', async () => {
			await expectPrettierFormat(
				`let x: Foooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo | null | undefined = 1;
interface I { value: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbb }`,
				`let x:
  | Foooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo
  | null
  | undefined = 1;
interface I {
  value:
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbb;
}
`,
			);
		});

		test('indents a broken union in parameters, return types, and class fields', async () => {
			await expectPrettierFormat(
				`function f(value: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Ccccc) {}
function g(): Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb {}
class C {
  value: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | null = null;
}`,
				`function f(
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
}
`,
			);
		});

		test('breaks a union in place in type arguments and conditional type branches', async () => {
			await expectPrettierFormat(
				`let list: Array<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb>;
type Pick<T> = T extends string ? Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb : never;
type K<T> = T extends string ? Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | Ccccccccccc : never;`,
				`let list: Array<
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
  : never;
`,
			);
		});

		test('breaks a parenthesized union inside its parentheses', async () => {
			await expectPrettierFormat(
				`type Items = (Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)[];`,
				`type Items = (
  | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  | Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)[];
`,
			);
		});

		test('moves a cast union below as or satisfies, and keeps a hugged one inline', async () => {
			await expectPrettierFormat(
				`const input = element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
const value = options satisfies Aaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccc;
const target = event.target as HTMLElement | null;`,
				`const input = element as
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
const value = options satisfies
  Aaaaaaaaaaaaaaaaaaaaaaaa | Bbbbbbbbbbbbbbbbbbbbbbbbbb | Cccccccccccc;
const target = event.target as HTMLElement | null;
`,
			);
		});

		test('formats "type A<R extends B | C // c\\n  = D> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<R extends B | C // c
  = D> = R;`,
				`type A<
  R extends
    B | C = // c
    D,
> = R;
`,
			);
		});

		test('formats "type A<R extends B | C = // c\\n  D> = R;" like Prettier', async () => {
			await expectPrettierFormat(
				`type A<R extends B | C = // c
  D> = R;`,
				`type A<
  R extends
    B | C = // c
    D,
> = R;
`,
			);
		});

		test('keeps the comments of "type A<R extends B | C /* c */ = D> = R;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A<R extends B | C /* c */ = D> = R;`,
				`type A<R extends B | C /* c */ = D> = R;
`,
			);
		});

		test('keeps the comments of "type A<\\n  R extends B | C, // c\\n> = R;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A<
  R extends B | C, // c
> = R;`,
				`type A<
  R extends B | C, // c
> = R;
`,
			);
		});

		test('keeps the comments of "type A<T> = T extends\\n  B | C // c\\n  ? D\\n  : E;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A<T> = T extends
  B | C // c
  ? D
  : E;`,
				`type A<T> = T extends
  B | C // c
  ? D
  : E;
`,
			);
		});

		test('keeps the comments of "type A = Foo<\\n  B | C // c\\n>;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = Foo<
  B | C // c
>;`,
				`type A = Foo<
  B | C // c
>;
`,
			);
		});

		test('keeps the comments of "type A = [\\n  B | C, // c\\n  D,\\n];" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = [
  B | C, // c
  D,
];`,
				`type A = [
  B | C, // c
  D,
];
`,
			);
		});

		test('keeps the comments of "type A = [B | C /* c */, D];" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = [B | C /* c */, D];`,
				`type A = [B | C /* c */, D];
`,
			);
		});

		test('keeps the comments of "function f(\\n  a: B | C, // c\\n) {}" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`function f(
  a: B | C, // c
) {}`,
				`function f(
  a: B | C, // c
) {}
`,
			);
		});

		test('keeps the comments of "let x: B | C = // c\\n  y;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`let x: B | C = // c
  y;`,
				`let x: B | C = // c
  y;
`,
			);
		});

		test('keeps the comments of "interface I {\\n  a: B | C; // c\\n  b: D;\\n}" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`interface I {
  a: B | C; // c
  b: D;
}`,
				`interface I {
  a: B | C; // c
  b: D;
}
`,
			);
		});

		test('keeps the comments of "type A = /* c */ B | C;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = /* c */ B | C;`,
				`type A = /* c */ B | C;
`,
			);
		});

		test('keeps the comments of "type A =\\n  // c\\n  B | C;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A =
  // c
  B | C;`,
				`type A =
  // c
  B | C;
`,
			);
		});

		test('keeps the comments of "type A = X & (/* c */ B | C);" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = X & (/* c */ B | C);`,
				`type A = X & (/* c */ B | C);
`,
			);
		});

		test('keeps the comments of "type A = (B | C /* c */)[];" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type A = (B | C /* c */)[];`,
				`type A = (B | C /* c */)[];
`,
			);
		});

		test('keeps the comments of "type T = keyof (B | C /* c */);" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`type T = keyof (B | C /* c */);`,
				`type T = keyof (B | C /* c */);
`,
			);
		});

		test('prints the comments before a union inside its indentation', async () => {
			await expectPrettierFormat(
				`interface Props {
  // What the field holds
  value: // Either kind of value
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb;
  items: (// Either kind of item
    | Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    | Bbbbbbbbbbbbbbbbbbbbbbbbbbbb)[];
  short: string | null;
  config: { enabled: boolean; name: string } | null;
}`,
				`interface Props {
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
}
`,
			);
		});
	});

	describe('intersection types break like Prettier', () => {
		test('breaks a long intersection after each &', async () => {
			await expectPrettierFormat(
				`type MethodsType = typeof Attributes & typeof Traversing & typeof Manipulation & typeof Css & typeof Forms;
type Merged = FirstVeryLongTypeName<WithArgument> & SecondVeryLongTypeName & ThirdTypeName<X>;`,
				`type MethodsType = typeof Attributes &
  typeof Traversing &
  typeof Manipulation &
  typeof Css &
  typeof Forms;
type Merged = FirstVeryLongTypeName<WithArgument> &
  SecondVeryLongTypeName &
  ThirdTypeName<X>;
`,
			);
		});

		test('keeps an object type on the line of its &', async () => {
			await expectPrettierFormat(
				`type Props = BaseProps & { aaaaaaaaaaaaaaaaaaaaaaa: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number };
type Props2 = BaseProps & OtherPropsWithAVeryLongName & { aaaaaaaaaaaaaaaaaaaaaaa: string; bbbbbbbbbbb: number };
type Props3 = { aaaaaaaaaaaaaaaaaaaaaaa: string } & { bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number };
type Props4 = { aaaaaaaaaaaaaaaaaaaaaaa: string } & BaseProps & { bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number };`,
				`type Props = BaseProps & {
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
  };
`,
			);
		});

		test('breaks an intersection in a parameter, an annotation, or a union member', async () => {
			await expectPrettierFormat(
				`function f(options: Aaaaaaaaaaaaaaaaaaaaaaaaaaaa & Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb & Cccccccccccccccccc) {}
let x: Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa & Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb & Ccccccccccc = y;
type U =
  | (ManagedIdentityCredentialClientIdOptions & ManagedIdentityDisableProbeOptions)
  | (ManagedIdentityCredentialResourceIdOptions & ManagedIdentityDisableProbeOptions);`,
				`function f(
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
      ManagedIdentityDisableProbeOptions);
`,
			);
		});

		test('moves a type after an own-line comment to the next line', async () => {
			await expectPrettierFormat(
				`type A = B &
// comment
C;
type D = { a: string } &
// comment
E;`,
				`type A = B &
  // comment
  C;
type D = { a: string } &
  // comment
  E;
`,
			);
		});

		test('prints a one-member intersection or union as its type, with its comments', async () => {
			await expectPrettierFormat(
				`type A = & // Comment
"VALUE";
type F = &
/* Comment */
"VALUE";
type U = | // Comment
"VALUE";
type O = & // Comment
  { a: 1 };`,
				`type A =
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
  { a: 1 };
`,
			);
		});

		test('drops the parentheses around a one-member intersection or union', async () => {
			await expectPrettierFormat(
				`type G = (| A)[];
type H = | (A | B);
interface X { a: | (() => void); b: & ((x: string) => void) }
type C = | { a: string; bbbbbbbbbbbbbbbbbbbbbbbbbbbbb: number; ccccccccccccccccccccccccc: boolean }[];
type D = /* c */ | B;
let x: | A = 1;`,
				`type G = A[];
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
let x: A = 1;
`,
			);
		});
	});

	describe('superclass expressions keep required parentheses', () => {
		test('keeps the parentheses in class Derived extends (Base || Object) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base || Object) {}`,
				`class Derived extends (Base || Object) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (Base && Object) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base && Object) {}`,
				`class Derived extends (Base && Object) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (Base ?? Object) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base ?? Object) {}`,
				`class Derived extends (Base ?? Object) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (left + right) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (left + right) {}`,
				`class Derived extends (left + right) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (key in registry) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (key in registry) {}`,
				`class Derived extends (key in registry) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (cached = Base) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (cached = Base) {}`,
				`class Derived extends (cached = Base) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (() => Base) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (() => Base) {}`,
				`class Derived extends (() => Base) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (Base as Constructor) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base as Constructor) {}`,
				`class Derived extends (Base as Constructor) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (Base satisfies Constructor) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base satisfies Constructor) {}`,
				`class Derived extends (Base satisfies Constructor) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (typeof Base) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (typeof Base) {}`,
				`class Derived extends (typeof Base) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (count++) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (count++) {}`,
				`class Derived extends (count++) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (useBase ? Base : Object) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (useBase ? Base : Object) {}`,
				`class Derived extends (useBase ? Base : Object) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (0, Base) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (0, Base) {}`,
				`class Derived extends (0, Base) {}
`,
			);
		});

		test('keeps the parentheses in const Derived = class extends (Base || Object) {};', async () => {
			await expectPrettierFormat(
				`const Derived = class extends (Base || Object) {};`,
				`const Derived = class extends (Base || Object) {};
`,
			);
		});

		test('keeps the parentheses in export default class extends (Base || Object) {}', async () => {
			await expectPrettierFormat(
				`export default class extends (Base || Object) {}`,
				`export default class extends (Base || Object) {}
`,
			);
		});

		test('keeps the parentheses in class Derived extends (Base || Object)<string> implements Contract {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base || Object)<string> implements Contract {}`,
				`class Derived extends (Base || Object)<string> implements Contract {}
`,
			);
		});

		test('keeps the parentheses with semi: false', async () => {
			await expectPrettierFormat(
				`class Derived extends (Base ?? Object) {}`,
				`class Derived extends (Base ?? Object) {}
`,
				{ semi: false },
			);
		});

		test('keeps the parentheses around await and yield superclasses', async () => {
			await expectPrettierFormat(
				`async function load() {
  class Derived extends (await Base) {}
}`,
				`async function load() {
  class Derived extends (await Base) {}
}
`,
			);
			await expectPrettierFormat(
				`function* load() {
  class Derived extends (yield Base) {}
}`,
				`function* load() {
  class Derived extends (yield Base) {}
}
`,
			);
		});

		test('keeps the parentheses around a decorated class expression', async () => {
			await expectPrettierFormat(
				`class Derived extends (
  @sealed
  class {}
) {}`,
				`class Derived extends (
  @sealed
  class {}
) {}
`,
			);
		});

		test('hugs the parentheses when the superclass breaks', async () => {
			await expectPrettierFormat(
				`class Derived extends (SomeVeryLongBaseClassName ||
  AnotherVeryLongFallbackClassName ||
  Object) {}`,
				`class Derived extends (SomeVeryLongBaseClassName ||
  AnotherVeryLongFallbackClassName ||
  Object) {}
`,
			);
		});

		test('does not add parentheses in class Derived extends Base.Mixin {}', async () => {
			await expectPrettierFormat(
				`class Derived extends Base.Mixin {}`,
				`class Derived extends Base.Mixin {}
`,
			);
		});

		test('does not add parentheses in class Derived extends Mixin(Base) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends Mixin(Base) {}`,
				`class Derived extends Mixin(Base) {}
`,
			);
		});

		test('does not add parentheses in class Derived extends class {} {}', async () => {
			await expectPrettierFormat(
				`class Derived extends class {} {}`,
				`class Derived extends class {} {}
`,
			);
		});

		test('does not add parentheses in class Derived extends Base! {}', async () => {
			await expectPrettierFormat(
				`class Derived extends Base! {}`,
				`class Derived extends Base! {}
`,
			);
		});

		test('keeps the parentheses around the element in class Derived extends (<div />) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (<div />) {}`,
				`class Derived extends (<div />) {}
`,
			);
		});

		test('keeps the parentheses around the element in class Derived extends (<></>) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (<></>) {}`,
				`class Derived extends (<></>) {}
`,
			);
		});

		test('keeps the parentheses around the element in class Derived extends (<style>{css}</style>) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (<style>{css}</style>) {}`,
				`class Derived extends (<style>{css}</style>) {}
`,
			);
		});

		test('keeps the parentheses around the element in class Derived extends (<div />)<T> {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (<div />)<T> {}`,
				`class Derived extends (<div />)<T> {}
`,
			);
		});

		test('keeps the parentheses around the element in class Derived extends (<div />) implements Contract {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (<div />) implements Contract {}`,
				`class Derived extends (<div />) implements Contract {}
`,
			);
		});

		test('keeps the parentheses around the element in const Derived = class extends (<div />) {};', async () => {
			await expectPrettierFormat(
				`const Derived = class extends (<div />) {};`,
				`const Derived = class extends (<div />) {};
`,
			);
		});

		test('keeps the parentheses around the element in export default class extends (<></>) {}', async () => {
			await expectPrettierFormat(
				`export default class extends (<></>) {}`,
				`export default class extends (<></>) {}
`,
			);
		});

		test('keeps the parentheses around the element in class Derived extends (<div />).Base {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (<div />).Base {}`,
				`class Derived extends (<div />).Base {}
`,
			);
		});

		test('adds the parentheses around the element in class Derived extends <div /> {}', async () => {
			await expectFormat(
				`class Derived extends <div /> {}`,
				`class Derived extends (<div />) {}
`,
			);
		});

		test('adds the parentheses around the element in class Derived extends <></> {}', async () => {
			await expectFormat(
				`class Derived extends <></> {}`,
				`class Derived extends (<></>) {}
`,
			);
		});

		test('breaks the element inside the parentheses in "class Derived extends (\\n  <div\\n    className=\\"aaaaaaaaaaaaaaaaaaaaaaaa\\"\\n    id=\\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\"\\n  />\\n) {}"', async () => {
			await expectPrettierFormat(
				`class Derived extends (
  <div
    className="aaaaaaaaaaaaaaaaaaaaaaaa"
    id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  />
) {}`,
				`class Derived extends (
  <div
    className="aaaaaaaaaaaaaaaaaaaaaaaa"
    id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  />
) {}
`,
			);
		});

		test('breaks the element inside the parentheses in "class Derived extends (\\n  <div>\\n    <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>\\n    <span>bbbbbbbbbbbbbbbbbbbbbbbbbb</span>\\n  </div>\\n) {}"', async () => {
			await expectPrettierFormat(
				`class Derived extends (
  <div>
    <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
    <span>bbbbbbbbbbbbbbbbbbbbbbbbbb</span>
  </div>
) {}`,
				`class Derived extends (
  <div>
    <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>
    <span>bbbbbbbbbbbbbbbbbbbbbbbbbb</span>
  </div>
) {}
`,
			);
		});

		test('breaks the element inside the parentheses in "x = class extends (\\n  (\\n    <div\\n      className=\\"aaaaaaaaaaaaaaaaaaaaaaaa\\"\\n      id=\\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\\"\\n    />\\n  )\\n) {};"', async () => {
			await expectPrettierFormat(
				`x = class extends (
  (
    <div
      className="aaaaaaaaaaaaaaaaaaaaaaaa"
      id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    />
  )
) {};`,
				`x = class extends (
  (
    <div
      className="aaaaaaaaaaaaaaaaaaaaaaaa"
      id="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    />
  )
) {};
`,
			);
		});

		test('adds no parentheses around the cast in class Store extends /** @type {Base} */ (new Base()) {}', async () => {
			await expectPrettierFormat(
				`class Store extends /** @type {Base} */ (new Base()) {}`,
				`class Store extends /** @type {Base} */ (new Base()) {}
`,
			);
		});

		test('adds no parentheses around the cast in class Derived extends /** @type {Constructor} */ (Base || Object) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends /** @type {Constructor} */ (Base || Object) {}`,
				`class Derived extends /** @type {Constructor} */ (Base || Object) {}
`,
			);
		});

		test('adds no parentheses around the cast in class Derived extends /* note */ /** @type {Constructor} */ (Base || Object) {}', async () => {
			await expectPrettierFormat(
				`class Derived extends /* note */ /** @type {Constructor} */ (Base || Object) {}`,
				`class Derived extends /* note */ /** @type {Constructor} */ (Base || Object) {}
`,
			);
		});

		test('drops parentheses around a cast', async () => {
			await expectPrettierFormat(
				`class Derived extends (/** @type {C} */ (Base || Object)) {}`,
				`class Derived extends /** @type {C} */ (Base || Object) {}
`,
			);
		});
	});

	describe('class and interface headings break like Prettier', () => {
		test('puts each class heritage clause on its own line and { on the next', async () => {
			await expectPrettierFormat(
				`export class BrowserPerformanceClient extends PerformanceClient implements IPerformanceClient, IDisposable {
  x = 1;
}`,
				`export class BrowserPerformanceClient
  extends PerformanceClient
  implements IPerformanceClient, IDisposable
{
  x = 1;
}
`,
			);
		});

		test('keeps { on the heading line of a class with an empty body', async () => {
			await expectPrettierFormat(
				`export class VeryLongClassNameForTestingPurposesOnlyHereAbc extends Base implements One {}`,
				`export class VeryLongClassNameForTestingPurposesOnlyHereAbc
  extends Base
  implements One {}
`,
			);
		});

		test('breaks a heading with one qualified heritage name', async () => {
			await expectPrettierFormat(
				`export class VeryLongClassNameForTestingPurposesOnlyHere
  extends SomeNamespace.BaseClass
{
  x = 1;
}`,
				`export class VeryLongClassNameForTestingPurposesOnlyHere
  extends SomeNamespace.BaseClass
{
  x = 1;
}
`,
			);
			await expectPrettierFormat(
				`export class VeryLongClassNameForTesting
  implements SomeNamespace.SomeInterfaceName.Deep
{
  x = 1;
}`,
				`export class VeryLongClassNameForTesting
  implements SomeNamespace.SomeInterfaceName.Deep
{
  x = 1;
}
`,
			);
			await expectPrettierFormat(
				`export interface VeryLongInterfaceNameForTestingPurposes
  extends SomeNamespace.BaseInterface {
  x: 1;
}`,
				`export interface VeryLongInterfaceNameForTestingPurposes
  extends SomeNamespace.BaseInterface {
  x: 1;
}
`,
			);
		});

		test('breaks a dotted interface extends or class implements name before a dot', async () => {
			await expectPrettierFormat(
				`interface ReadableStream<R = any> extends Bun.__internal.LibEmptyOrNodeReadableStream<R> {}
class WritableStream<W = any> implements Bun.__internal.LibEmptyOrNodeWritableStream<W> {}
const Stream = class<W = any> implements Bun.__internal.LibEmptyOrNodeWritableStream<W> {};
interface A extends a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.aa.bb.cc.dd.ee.ff.gg.hh {}`,
				`interface ReadableStream<R = any> extends Bun.__internal
  .LibEmptyOrNodeReadableStream<R> {}
class WritableStream<W = any> implements Bun.__internal
  .LibEmptyOrNodeWritableStream<W> {}
const Stream = class<W = any> implements Bun.__internal
  .LibEmptyOrNodeWritableStream<W> {};
interface A
  extends a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t.u.v.w.x.y.z.aa.bb.cc.dd.ee.ff
    .gg.hh {}
`,
			);
		});

		test('keeps a qualified name that Prettier keeps together: interface ReadableStream<\n  R = any,\n> extends Bun.LibEmptyOrNodeReadableStreamLongNameForThisTestOnly<R> {}', async () => {
			await expectPrettierFormat(
				`interface ReadableStream<
  R = any,
> extends Bun.LibEmptyOrNodeReadableStreamLongNameForThisTestOnly<R> {}`,
				`interface ReadableStream<
  R = any,
> extends Bun.LibEmptyOrNodeReadableStreamLongNameForThisTestOnly<R> {}
`,
			);
		});

		test('keeps a qualified name that Prettier keeps together: type T =\n  | Bun.__internal.LibEmptyOrNodeReadableStream<R>\n  | Bun.__internal.LibEmptyOrNodeReadableStream<R>;', async () => {
			await expectPrettierFormat(
				`type T =
  | Bun.__internal.LibEmptyOrNodeReadableStream<R>
  | Bun.__internal.LibEmptyOrNodeReadableStream<R>;`,
				`type T =
  | Bun.__internal.LibEmptyOrNodeReadableStream<R>
  | Bun.__internal.LibEmptyOrNodeReadableStream<R>;
`,
			);
		});

		test('moves a long superclass of an assigned class expression into parentheses', async () => {
			await expectPrettierFormat(
				`Foo = class extends SomeNamespace.VeryLongBaseClassNameForTestingPurposesOnlyAbc.Def {
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
};`,
				`Foo = class extends (
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
};
`,
			);
		});

		test('keeps the superclass of Foo = class extends Base {}; as it is', async () => {
			await expectPrettierFormat(
				`Foo = class extends Base {};`,
				`Foo = class extends Base {};
`,
			);
		});

		test('keeps the superclass of Foo = class extends (Base || Object) {}; as it is', async () => {
			await expectPrettierFormat(
				`Foo = class extends (Base || Object) {};`,
				`Foo = class extends (Base || Object) {};
`,
			);
		});

		test('keeps the superclass of const Foo = class extends SomeVeryLongBaseClassNameThatIsReallyLongForTestingAbcdef {\n  x = 1;\n}; as it is', async () => {
			await expectPrettierFormat(
				`const Foo = class extends SomeVeryLongBaseClassNameThatIsReallyLongForTestingAbcdef {
  x = 1;
};`,
				`const Foo = class extends SomeVeryLongBaseClassNameThatIsReallyLongForTestingAbcdef {
  x = 1;
};
`,
			);
		});

		test('breaks the heading of a class expression', async () => {
			await expectPrettierFormat(
				`const Foo = class VeryLongClassNameForTestingPurposesOnly extends Base implements IFoo, IBar {
  x = 1;
};`,
				`const Foo = class VeryLongClassNameForTestingPurposesOnly
  extends Base
  implements IFoo, IBar
{
  x = 1;
};
`,
			);
		});

		test('keeps declare and abstract on the heading line', async () => {
			await expectPrettierFormat(
				`declare abstract class VeryLongClassNameForTestingPurposesOnly extends Base implements One {
  x: 1;
}`,
				`declare abstract class VeryLongClassNameForTestingPurposesOnly
  extends Base
  implements One
{
  x: 1;
}
`,
			);
		});

		test('puts interface extends on its own line and each type on its own line when they do not fit', async () => {
			await expectPrettierFormat(
				`interface AbortSignal extends EventTarget, InternalEventTargetEventProperties<AbortSignalEventMap> {
  readonly aborted: boolean;
}
export interface SectionProps<T> extends Omit<SharedSectionProps<T>, "children" | "title">, StyleProps, GlobalDOMAttributes<HTMLElement> {
  id?: Key;
}`,
				`interface AbortSignal
  extends EventTarget, InternalEventTargetEventProperties<AbortSignalEventMap> {
  readonly aborted: boolean;
}
export interface SectionProps<T>
  extends
    Omit<SharedSectionProps<T>, "children" | "title">,
    StyleProps,
    GlobalDOMAttributes<HTMLElement> {
  id?: Key;
}
`,
			);
		});

		test('keeps a heading that fits or has one simple clause: class A extends B implements C, D {}', async () => {
			await expectPrettierFormat(
				`class A extends B implements C, D {}`,
				`class A extends B implements C, D {}
`,
			);
		});

		test('keeps a heading that fits or has one simple clause: interface I extends J, K {}', async () => {
			await expectPrettierFormat(
				`interface I extends J, K {}`,
				`interface I extends J, K {}
`,
			);
		});

		test('keeps a heading that fits or has one simple clause: const X = class extends B implements C, D {};', async () => {
			await expectPrettierFormat(
				`const X = class extends B implements C, D {};`,
				`const X = class extends B implements C, D {};
`,
			);
		});

		test('keeps a heading that fits or has one simple clause: export class VeryLongClassNameForTestingPurposesOnlyHere extends SomeBaseClassNameThatIsLong {\n  x = 1;\n}', async () => {
			await expectPrettierFormat(
				`export class VeryLongClassNameForTestingPurposesOnlyHere extends SomeBaseClassNameThatIsLong {
  x = 1;
}`,
				`export class VeryLongClassNameForTestingPurposesOnlyHere extends SomeBaseClassNameThatIsLong {
  x = 1;
}
`,
			);
		});

		test('keeps a heading that fits or has one simple clause: class Foo extends aVeryLongFunctionCallThatReturnsAClass(\n  withSomeArguments,\n  andMore,\n  andMoreArgs,\n) {\n  x = 1;\n}', async () => {
			await expectPrettierFormat(
				`class Foo extends aVeryLongFunctionCallThatReturnsAClass(
  withSomeArguments,
  andMore,
  andMoreArgs,
) {
  x = 1;
}`,
				`class Foo extends aVeryLongFunctionCallThatReturnsAClass(
  withSomeArguments,
  andMore,
  andMoreArgs,
) {
  x = 1;
}
`,
			);
		});

		test('keeps a heading that fits or has one simple clause: export class VeryLongClassNameForTestingPurposesOnly<\n  TypeParameterOne,\n  TypeParameterTwo,\n> extends Base<TypeParameterOne> {\n  x = 1;\n}', async () => {
			await expectPrettierFormat(
				`export class VeryLongClassNameForTestingPurposesOnly<
  TypeParameterOne,
  TypeParameterTwo,
> extends Base<TypeParameterOne> {
  x = 1;
}`,
				`export class VeryLongClassNameForTestingPurposesOnly<
  TypeParameterOne,
  TypeParameterTwo,
> extends Base<TypeParameterOne> {
  x = 1;
}
`,
			);
		});
	});

	describe('expression parentheses follow Prettier', () => {
		test('keeps the parentheses around a logical or binary callee in const result = (primary || fallback)();', async () => {
			await expectPrettierFormat(
				`const result = (primary || fallback)();`,
				`const result = (primary || fallback)();
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = (primary ?? fallback)();', async () => {
			await expectPrettierFormat(
				`const result = (primary ?? fallback)();`,
				`const result = (primary ?? fallback)();
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = (primary && fallback)?.();', async () => {
			await expectPrettierFormat(
				`const result = (primary && fallback)?.();`,
				`const result = (primary && fallback)?.();
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = (left + right)(1, 2)();', async () => {
			await expectPrettierFormat(
				`const result = (left + right)(1, 2)();`,
				`const result = (left + right)(1, 2)();
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = new (primary || fallback)();', async () => {
			await expectPrettierFormat(
				`const result = new (primary || fallback)();`,
				`const result = new (primary || fallback)();
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = (primary || fallback)`template`;', async () => {
			await expectPrettierFormat(
				`const result = (primary || fallback)\`template\`;`,
				`const result = (primary || fallback)\`template\`;
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = (primary || fallback)!;', async () => {
			await expectPrettierFormat(
				`const result = (primary || fallback)!;`,
				`const result = (primary || fallback)!;
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in const result = (primary || fallback).name;', async () => {
			await expectPrettierFormat(
				`const result = (primary || fallback).name;`,
				`const result = (primary || fallback).name;
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in class Derived extends (primary || fallback)() {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (primary || fallback)() {}`,
				`class Derived extends (primary || fallback)() {}
`,
			);
		});

		test('keeps the parentheses around a logical or binary callee in class Derived extends (primary ?? fallback)().Mixin {}', async () => {
			await expectPrettierFormat(
				`class Derived extends (primary ?? fallback)().Mixin {}`,
				`class Derived extends (primary ?? fallback)().Mixin {}
`,
			);
		});

		test('keeps the parentheses around await and yield in async function run() {\n  return (await Promise.resolve(() => 42))();\n}', async () => {
			await expectPrettierFormat(
				`async function run() {
  return (await Promise.resolve(() => 42))();
}`,
				`async function run() {
  return (await Promise.resolve(() => 42))();
}
`,
			);
		});

		test('keeps the parentheses around await and yield in async function run() {\n  return new (await load())();\n}', async () => {
			await expectPrettierFormat(
				`async function run() {
  return new (await load())();
}`,
				`async function run() {
  return new (await load())();
}
`,
			);
		});

		test('keeps the parentheses around await and yield in async function run() {\n  return (await load())`template`;\n}', async () => {
			await expectPrettierFormat(
				`async function run() {
  return (await load())\`template\`;
}`,
				`async function run() {
  return (await load())\`template\`;
}
`,
			);
		});

		test('keeps the parentheses around await and yield in async function run() {\n  return (await load()) ** 2;\n}', async () => {
			await expectPrettierFormat(
				`async function run() {
  return (await load()) ** 2;
}`,
				`async function run() {
  return (await load()) ** 2;
}
`,
			);
		});

		test('keeps the parentheses around await and yield in async function run() {\n  return !(await load());\n}', async () => {
			await expectPrettierFormat(
				`async function run() {
  return !(await load());
}`,
				`async function run() {
  return !(await load());
}
`,
			);
		});

		test('keeps the parentheses around await and yield in function* run() {\n  return (yield 2) + 1;\n}', async () => {
			await expectPrettierFormat(
				`function* run() {
  return (yield 2) + 1;
}`,
				`function* run() {
  return (yield 2) + 1;
}
`,
			);
		});

		test('keeps the parentheses around await and yield in function* run() {\n  return (yield 2) ? left : right;\n}', async () => {
			await expectPrettierFormat(
				`function* run() {
  return (yield 2) ? left : right;
}`,
				`function* run() {
  return (yield 2) ? left : right;
}
`,
			);
		});

		test('keeps the parentheses around await and yield in function* run() {\n  return (yield 2).value;\n}', async () => {
			await expectPrettierFormat(
				`function* run() {
  return (yield 2).value;
}`,
				`function* run() {
  return (yield 2).value;
}
`,
			);
		});

		test('keeps the parentheses around await and yield in function* run() {\n  return (yield 2)!;\n}', async () => {
			await expectPrettierFormat(
				`function* run() {
  return (yield 2)!;
}`,
				`function* run() {
  return (yield 2)!;
}
`,
			);
		});

		test('keeps the parentheses around await and yield in function* run() {\n  return (yield 2) as number;\n}', async () => {
			await expectPrettierFormat(
				`function* run() {
  return (yield 2) as number;
}`,
				`function* run() {
  return (yield 2) as number;
}
`,
			);
		});

		test('parenthesizes the element operand in async function f() {\n  await <div />;\n}', async () => {
			await expectPrettierFormat(
				`async function f() {
  await <div />;
}`,
				`async function f() {
  await (<div />);
}
`,
			);
		});

		test('parenthesizes the element operand in x = !<div />;', async () => {
			await expectPrettierFormat(
				`x = !<div />;`,
				`x = !(<div />);
`,
			);
		});

		test('parenthesizes the element operand in x = typeof <div />;', async () => {
			await expectPrettierFormat(
				`x = typeof <div />;`,
				`x = typeof (<div />);
`,
			);
		});

		test('parenthesizes the element operand in x = -<b />;', async () => {
			await expectPrettierFormat(
				`x = -<b />;`,
				`x = -(<b />);
`,
			);
		});

		test('parenthesizes the element operand in x = void <></>;', async () => {
			await expectPrettierFormat(
				`x = void <></>;`,
				`x = void (<></>);
`,
			);
		});

		test('parenthesizes the element operand in x = <b /> as any;', async () => {
			await expectPrettierFormat(
				`x = <b /> as any;`,
				`x = (<b />) as any;
`,
			);
		});

		test('parenthesizes the element operand in x = <b /> satisfies T;', async () => {
			await expectPrettierFormat(
				`x = <b /> satisfies T;`,
				`x = (<b />) satisfies T;
`,
			);
		});

		test('parenthesizes the element operand in x = [...<b />];', async () => {
			await expectPrettierFormat(
				`x = [...<b />];`,
				`x = [...(<b />)];
`,
			);
		});

		test('parenthesizes the element operand in x = { ...<b /> };', async () => {
			await expectPrettierFormat(
				`x = { ...<b /> };`,
				`x = { ...(<b />) };
`,
			);
		});

		test('parenthesizes the element operand in x = <div {...<b />} />;', async () => {
			await expectPrettierFormat(
				`x = <div {...<b />} />;`,
				`x = <div {...(<b />)} />;
`,
			);
		});

		test('parenthesizes the element operand in x = `${<b />}`;', async () => {
			await expectPrettierFormat(
				`x = \`\${<b />}\`;`,
				`x = \`\${(<b />)}\`;
`,
			);
		});

		test('parenthesizes the element operand in x = a[<b />];', async () => {
			await expectPrettierFormat(
				`x = a[<b />];`,
				`x = a[(<b />)];
`,
			);
		});

		test('parenthesizes the element operand in x = (a, <b />);', async () => {
			await expectPrettierFormat(
				`x = (a, <b />);`,
				`x = (a, (<b />));
`,
			);
		});

		test('parenthesizes the element operand in x = import(<b />);', async () => {
			await expectPrettierFormat(
				`x = import(<b />);`,
				`x = import((<b />));
`,
			);
		});

		test('parenthesizes the element operand in class A {\n  p = <b />;\n}', async () => {
			await expectPrettierFormat(
				`class A {
  p = <b />;
}`,
				`class A {
  p = (<b />);
}
`,
			);
		});

		test('parenthesizes the element operand in for (const x of <b />) {\n}', async () => {
			await expectPrettierFormat(
				`for (const x of <b />) {
}`,
				`for (const x of (<b />)) {
}
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = <div />;', async () => {
			await expectPrettierFormat(
				`x = <div />;`,
				`x = <div />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = [<b />, <i />];', async () => {
			await expectPrettierFormat(
				`x = [<b />, <i />];`,
				`x = [<b />, <i />];
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = () => <b />;', async () => {
			await expectPrettierFormat(
				`x = () => <b />;`,
				`x = () => <b />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = a ?? <b />;', async () => {
			await expectPrettierFormat(
				`x = a ?? <b />;`,
				`x = a ?? <b />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = <b /> + 1;', async () => {
			await expectPrettierFormat(
				`x = <b /> + 1;`,
				`x = <b /> + 1;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = cond ? <b /> : <i />;', async () => {
			await expectPrettierFormat(
				`x = cond ? <b /> : <i />;`,
				`x = cond ? <b /> : <i />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = { a: <b />, [<i />]: 1 };', async () => {
			await expectPrettierFormat(
				`x = { a: <b />, [<i />]: 1 };`,
				`x = { a: <b />, [<i />]: 1 };
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in f(<a />, new F(<b />));', async () => {
			await expectPrettierFormat(
				`f(<a />, new F(<b />));`,
				`f(<a />, new F(<b />));
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in let y = <b />;', async () => {
			await expectPrettierFormat(
				`let y = <b />;`,
				`let y = <b />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in function f(a = <b />) {\n  return <b />;\n}', async () => {
			await expectPrettierFormat(
				`function f(a = <b />) {
  return <b />;
}`,
				`function f(a = <b />) {
  return <b />;
}
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in export default <div />;', async () => {
			await expectPrettierFormat(
				`export default <div />;`,
				`export default <div />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = <div c={<d />} />;', async () => {
			await expectPrettierFormat(
				`x = <div c={<d />} />;`,
				`x = <div c={<d />} />;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in async function f() {\n  await (<div />);\n}', async () => {
			await expectPrettierFormat(
				`async function f() {
  await (<div />);
}`,
				`async function f() {
  await (<div />);
}
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = (<b />).props;', async () => {
			await expectPrettierFormat(
				`x = (<b />).props;`,
				`x = (<b />).props;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = (<b />)!;', async () => {
			await expectPrettierFormat(
				`x = (<b />)!;`,
				`x = (<b />)!;
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in x = new (<b />)();', async () => {
			await expectPrettierFormat(
				`x = new (<b />)();`,
				`x = new (<b />)();
`,
			);
		});

		test('keeps the element bare or parenthesized as Prettier does in function* g() {\n  yield <div />;\n}', async () => {
			await expectPrettierFormat(
				`function* g() {
  yield <div />;
}`,
				`function* g() {
  yield <div />;
}
`,
			);
		});

		test('keeps the parentheses around the element statement in "function f() {\\n  (<div />);\\n}"', async () => {
			await expectFormat(
				`function f() {
  (<div />);
}`,
				`function f() {
  (<div />);
}
`,
			);
		});

		test('starts a statement at a `(`, `[`, or template literal on the line after an element', async () => {
			await expectPrettierFormat(
				`const a = <b>x</b>
(foo)
const c = <b />
[1].map(f)
const d = <b />
\`t\`
`,
				`const a = <b>x</b>;
foo;
const c = <b />;
[1].map(f);
const d = <b />;
\`t\`;
`,
			);
		});

		test('keeps the parentheses around an element before a subscript in const a = (<b>x</b>)(foo);', async () => {
			await expectPrettierFormat(
				`const a = (<b>x</b>)(foo);`,
				`const a = (<b>x</b>)(foo);
`,
			);
		});

		test('keeps the parentheses around an element before a subscript in const c = (<b />)[1].map(f);', async () => {
			await expectPrettierFormat(
				`const c = (<b />)[1].map(f);`,
				`const c = (<b />)[1].map(f);
`,
			);
		});

		test('keeps the parentheses around an element before a subscript in const d = (<b />)`t`;', async () => {
			await expectPrettierFormat(
				`const d = (<b />)\`t\`;`,
				`const d = (<b />)\`t\`;
`,
			);
		});

		test('keeps the parentheses around an element before a subscript in const e = (<b />)?.foo;', async () => {
			await expectPrettierFormat(
				`const e = (<b />)?.foo;`,
				`const e = (<b />)?.foo;
`,
			);
		});

		test('keeps the parentheses around an element before a subscript in (<b />)(x);', async () => {
			await expectPrettierFormat(
				`(<b />)(x);`,
				`(<b />)(x);
`,
			);
		});

		test('keeps the parentheses around an element before a subscript in const a = (<div>\n  <b>x</b>\n</div>)(foo);', async () => {
			await expectPrettierFormat(
				`const a = (<div>
  <b>x</b>
</div>)(foo);`,
				`const a = (<div>
  <b>x</b>
</div>)(foo);
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = new (a?.b)();', async () => {
			await expectPrettierFormat(
				`const result = new (a?.b)();`,
				`const result = new (a?.b)();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)`x`;', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)\`x\`;`,
				`const result = (a?.b)\`x\`;
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)();', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)();`,
				`const result = (a?.b)();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)!();', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)!();`,
				`const result = (a?.b)!();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)!.c;', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)!.c;`,
				`const result = (a?.b)!.c;
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)<T>();', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)<T>();`,
				`const result = (a?.b)<T>();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b.c)();', async () => {
			await expectPrettierFormat(
				`const result = (a?.b.c)();`,
				`const result = (a?.b.c)();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.[k])();', async () => {
			await expectPrettierFormat(
				`const result = (a?.[k])();`,
				`const result = (a?.[k])();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.())();', async () => {
			await expectPrettierFormat(
				`const result = (a?.())();`,
				`const result = (a?.())();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)(1, 2);', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)(1, 2);`,
				`const result = (a?.b)(1, 2);
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)()();', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)()();`,
				`const result = (a?.b)()();
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b).c;', async () => {
			await expectPrettierFormat(
				`const result = (a?.b).c;`,
				`const result = (a?.b).c;
`,
			);
		});

		test('keeps the parentheses that end an optional chain in const result = (a?.b)[0];', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)[0];`,
				`const result = (a?.b)[0];
`,
			);
		});

		test('drops the parentheses before an optional continuation of a chain', async () => {
			await expectPrettierFormat(
				`const result = (a?.b)?.();
const next = (a?.b)?.c;`,
				`const result = a?.b?.();
const next = a?.b?.c;
`,
			);
		});

		test('drops redundant parentheses: const x = (a);', async () => {
			await expectPrettierFormat(
				`const x = (a);`,
				`const x = a;
`,
			);
		});

		test('drops redundant parentheses: const y = (a.b);', async () => {
			await expectPrettierFormat(
				`const y = (a.b);`,
				`const y = a.b;
`,
			);
		});

		test('drops redundant parentheses: const z = (f());', async () => {
			await expectPrettierFormat(
				`const z = (f());`,
				`const z = f();
`,
			);
		});

		test('drops redundant parentheses: foo((a));', async () => {
			await expectPrettierFormat(
				`foo((a));`,
				`foo(a);
`,
			);
		});

		test('drops redundant parentheses: const v = (a) + 1;', async () => {
			await expectPrettierFormat(
				`const v = (a) + 1;`,
				`const v = a + 1;
`,
			);
		});

		test('drops redundant parentheses: const w = (a.b)();', async () => {
			await expectPrettierFormat(
				`const w = (a.b)();`,
				`const w = a.b();
`,
			);
		});

		test('drops redundant parentheses: const u = !(a);', async () => {
			await expectPrettierFormat(
				`const u = !(a);`,
				`const u = !a;
`,
			);
		});

		test('drops redundant parentheses: const t = (a ? b : c);', async () => {
			await expectPrettierFormat(
				`const t = (a ? b : c);`,
				`const t = a ? b : c;
`,
			);
		});

		test('drops redundant parentheses: const s = <div class={(a)}>{(b)}</div>;', async () => {
			await expectPrettierFormat(
				`const s = <div class={(a)}>{(b)}</div>;`,
				`const s = <div class={a}>{b}</div>;
`,
			);
		});

		test('drops redundant parentheses: class D extends (Base) {}', async () => {
			await expectPrettierFormat(
				`class D extends (Base) {}`,
				`class D extends Base {}
`,
			);
		});

		test('drops redundant parentheses: class D extends (Mixin(Base)) {}', async () => {
			await expectPrettierFormat(
				`class D extends (Mixin(Base)) {}`,
				`class D extends Mixin(Base) {}
`,
			);
		});

		test('drops redundant parentheses: const fn = function () {}.call(null);', async () => {
			await expectPrettierFormat(
				`const fn = function () {}.call(null);`,
				`const fn = function () {}.call(null);
`,
			);
		});

		test('drops redundant parentheses: const seq = ((a, b)).c;', async () => {
			await expectPrettierFormat(
				`const seq = ((a, b)).c;`,
				`const seq = (a, b).c;
`,
			);
		});

		test('drops redundant parentheses: const body = () => (a, b);', async () => {
			await expectPrettierFormat(
				`const body = () => (a, b);`,
				`const body = () => (a, b);
`,
			);
		});

		test('drops redundant parentheses: for (i = 0, j = 0; i < 1; i++, j++) {}', async () => {
			await expectPrettierFormat(
				`for (i = 0, j = 0; i < 1; i++, j++) {}`,
				`for (i = 0, j = 0; i < 1; i++, j++) {}
`,
			);
		});

		test('adds the parentheses Prettier adds: class D extends new Base() {}', async () => {
			await expectPrettierFormat(
				`class D extends new Base() {}`,
				`class D extends (new Base()) {}
`,
			);
		});

		test('adds the parentheses Prettier adds: class D extends {} {}', async () => {
			await expectPrettierFormat(
				`class D extends {} {}`,
				`class D extends ({}) {}
`,
			);
		});

		test('adds the parentheses Prettier adds: class D extends tag`x` {}', async () => {
			await expectPrettierFormat(
				`class D extends tag\`x\` {}`,
				`class D extends (tag\`x\`) {}
`,
			);
		});

		test('adds the parentheses Prettier adds: const a = x + y as string;', async () => {
			await expectPrettierFormat(
				`const a = x + y as string;`,
				`const a = (x + y) as string;
`,
			);
		});

		test('adds the parentheses Prettier adds: const b = a * b / c;', async () => {
			await expectPrettierFormat(
				`const b = a * b / c;`,
				`const b = (a * b) / c;
`,
			);
		});

		test('adds the parentheses Prettier adds: const c = a & b | c;', async () => {
			await expectPrettierFormat(
				`const c = a & b | c;`,
				`const c = (a & b) | c;
`,
			);
		});

		test('adds the parentheses Prettier adds: const d = a + b << c;', async () => {
			await expectPrettierFormat(
				`const d = a + b << c;`,
				`const d = (a + b) << c;
`,
			);
		});

		test('adds the parentheses Prettier adds: e = a ?? b ? c : d;', async () => {
			await expectPrettierFormat(
				`e = a ?? b ? c : d;`,
				`e = (a ?? b) ? c : d;
`,
			);
		});

		test('adds the parentheses Prettier adds: const f = -(-a);', async () => {
			await expectPrettierFormat(
				`const f = -(-a);`,
				`const f = -(-a);
`,
			);
		});

		test('adds the parentheses Prettier adds: const g = - -a;', async () => {
			await expectPrettierFormat(
				`const g = - -a;`,
				`const g = -(-a);
`,
			);
		});

		test('adds the parentheses Prettier adds: f(a = 1);', async () => {
			await expectPrettierFormat(
				`f(a = 1);`,
				`f((a = 1));
`,
			);
		});

		test('adds the parentheses Prettier adds: const h = [...a ?? []];', async () => {
			await expectPrettierFormat(
				`const h = [...a ?? []];`,
				`const h = [...(a ?? [])];
`,
			);
		});

		test('adds the parentheses Prettier adds: const i = <div {...a && b} />;', async () => {
			await expectPrettierFormat(
				`const i = <div {...a && b} />;`,
				`const i = <div {...(a && b)} />;
`,
			);
		});

		test('keeps the parentheses the grammar requires in (function () {}).call(this);', async () => {
			await expectPrettierFormat(
				`(function () {}).call(this);`,
				`(function () {}).call(this);
`,
			);
		});

		test('keeps the parentheses the grammar requires in (class {}).name;', async () => {
			await expectPrettierFormat(
				`(class {}).name;`,
				`(class {}).name;
`,
			);
		});

		test('keeps the parentheses the grammar requires in ({}).toString.call(value);', async () => {
			await expectPrettierFormat(
				`({}).toString.call(value);`,
				`({}).toString.call(value);
`,
			);
		});

		test('keeps the parentheses the grammar requires in ({ a } = source);', async () => {
			await expectPrettierFormat(
				`({ a } = source);`,
				`({ a } = source);
`,
			);
		});

		test('keeps the parentheses the grammar requires in const head = () => ({}).toString();', async () => {
			await expectPrettierFormat(
				`const head = () => ({}).toString();`,
				`const head = () => ({}).toString();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const created = new (factory())();', async () => {
			await expectPrettierFormat(
				`const created = new (factory())();`,
				`const created = new (factory())();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const created = new (factory().Widget)();', async () => {
			await expectPrettierFormat(
				`const created = new (factory().Widget)();`,
				`const created = new (factory().Widget)();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const created = new (class {})();', async () => {
			await expectPrettierFormat(
				`const created = new (class {})();`,
				`const created = new (class {})();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const called = (function () {})();', async () => {
			await expectPrettierFormat(
				`const called = (function () {})();`,
				`const called = (function () {})();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const called = (() => {})();', async () => {
			await expectPrettierFormat(
				`const called = (() => {})();`,
				`const called = (() => {})();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const called = (async () => {})();', async () => {
			await expectPrettierFormat(
				`const called = (async () => {})();`,
				`const called = (async () => {})();
`,
			);
		});

		test('keeps the parentheses the grammar requires in const tagged = (() => {})`x`;', async () => {
			await expectPrettierFormat(
				`const tagged = (() => {})\`x\`;`,
				`const tagged = (() => {})\`x\`;
`,
			);
		});

		test('keeps the parentheses the grammar requires in const fallback = a || (() => 1);', async () => {
			await expectPrettierFormat(
				`const fallback = a || (() => 1);`,
				`const fallback = a || (() => 1);
`,
			);
		});

		test('keeps the parentheses the grammar requires in const power = (-a) ** 2;', async () => {
			await expectPrettierFormat(
				`const power = (-a) ** 2;`,
				`const power = (-a) ** 2;
`,
			);
		});

		test('keeps the parentheses the grammar requires in const typed = (!a) in b;', async () => {
			await expectPrettierFormat(
				`const typed = (!a) in b;`,
				`const typed = (!a) in b;
`,
			);
		});

		test('keeps the parentheses the grammar requires in const text = (1).toString();', async () => {
			await expectPrettierFormat(
				`const text = (1).toString();`,
				`const text = (1).toString();
`,
			);
		});

		test('keeps the parentheses the grammar requires in for (i = ("key" in store) ? 1 : 0; i < 1; i++) {}', async () => {
			await expectPrettierFormat(
				`for (i = ("key" in store) ? 1 : 0; i < 1; i++) {}`,
				`for (i = ("key" in store) ? 1 : 0; i < 1; i++) {}
`,
			);
		});

		test('keeps the parentheses the grammar requires in const mixed = (a ?? b) || c;', async () => {
			await expectPrettierFormat(
				`const mixed = (a ?? b) || c;`,
				`const mixed = (a ?? b) || c;
`,
			);
		});

		test('keeps the parentheses the grammar requires in const other = a ?? (b || c);', async () => {
			await expectPrettierFormat(
				`const other = a ?? (b || c);`,
				`const other = a ?? (b || c);
`,
			);
		});

		test('keeps the parentheses the grammar requires in const regrouped = a - (b - c);', async () => {
			await expectPrettierFormat(
				`const regrouped = a - (b - c);`,
				`const regrouped = a - (b - c);
`,
			);
		});

		test('keeps the parentheses the grammar requires in (a as any) = 1;', async () => {
			await expectPrettierFormat(
				`(a as any) = 1;`,
				`(a as any) = 1;
`,
			);
		});

		test('drops the parentheses around a class or function at the start of a superclass', async () => {
			await expectPrettierFormat(
				`class A extends (class {}).Base {}
class B extends (function () {}).Base {}`,
				`class A extends class {}.Base {}
class B extends function () {}.Base {}
`,
			);
		});

		test('keeps the parentheses around an instantiation expression in const f = (make<T>).value;', async () => {
			await expectPrettierFormat(
				`const f = (make<T>).value;`,
				`const f = (make<T>).value;
`,
			);
		});

		test('drops the parentheses around an instantiation expression that is called', async () => {
			await expectPrettierFormat(
				`const a = (make<T>)();`,
				`const a = make<T>();
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: foo(/* prettier-ignore */ (a  +  b));', async () => {
			await expectPrettierFormat(
				`foo(/* prettier-ignore */ (a  +  b));`,
				`foo(/* prettier-ignore */ a  +  b);
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: const w = [\n  // prettier-ignore\n  (b  ?  c : d),\n];', async () => {
			await expectPrettierFormat(
				`const w = [
  // prettier-ignore
  (b  ?  c : d),
];`,
				`const w = [
  // prettier-ignore
  b  ?  c : d,
];
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: const t = /* prettier-ignore */ ((a  +  b));', async () => {
			await expectPrettierFormat(
				`const t = /* prettier-ignore */ ((a  +  b));`,
				`const t = /* prettier-ignore */ a  +  b;
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: !(/* prettier-ignore */ a  &&  b);', async () => {
			await expectPrettierFormat(
				`!(/* prettier-ignore */ a  &&  b);`,
				`!(/* prettier-ignore */ a  &&  b);
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: (/* prettier-ignore */ a  =  b);', async () => {
			await expectPrettierFormat(
				`(/* prettier-ignore */ a  =  b);`,
				`/* prettier-ignore */ a  =  b;
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: ({ a } = /* prettier-ignore */ (b  ||  c));', async () => {
			await expectPrettierFormat(
				`({ a } = /* prettier-ignore */ (b  ||  c));`,
				`({ a } = /* prettier-ignore */ b  ||  c);
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: a ? /* prettier-ignore */ (b  ?  c : d) : e;', async () => {
			await expectPrettierFormat(
				`a ? /* prettier-ignore */ (b  ?  c : d) : e;`,
				`a ? (/* prettier-ignore */ b  ?  c : d) : e;
`,
			);
		});

		test('drops the parentheses a prettier-ignored node does not need: type A = /* prettier-ignore */ (B   |   C);', async () => {
			await expectPrettierFormat(
				`type A = /* prettier-ignore */ (B   |   C);`,
				`type A = /* prettier-ignore */ B   |   C;
`,
			);
		});

		test('adds the parentheses a prettier-ignored node needs', async () => {
			await expectPrettierFormat(
				`let x = 1
// prettier-ignore
[1,  2].forEach(f)`,
				`let x = (1)[
  // prettier-ignore
  (1,  2)
].forEach(f);
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: f(/* prettier-ignore */ (a,  b));', async () => {
			await expectPrettierFormat(
				`f(/* prettier-ignore */ (a,  b));`,
				`f(/* prettier-ignore */ (a,  b));
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: const y = /* prettier-ignore */ (a,  b);', async () => {
			await expectPrettierFormat(
				`const y = /* prettier-ignore */ (a,  b);`,
				`const y = /* prettier-ignore */ (a,  b);
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: x = /* prettier-ignore */ (a  +  b) * c;', async () => {
			await expectPrettierFormat(
				`x = /* prettier-ignore */ (a  +  b) * c;`,
				`x = /* prettier-ignore */ (a  +  b) * c;
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: const z = /* prettier-ignore */ (a  ??  b) || c;', async () => {
			await expectPrettierFormat(
				`const z = /* prettier-ignore */ (a  ??  b) || c;`,
				`const z = /* prettier-ignore */ (a  ??  b) || c;
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: let v = /* prettier-ignore */ (a  as  B).c;', async () => {
			await expectPrettierFormat(
				`let v = /* prettier-ignore */ (a  as  B).c;`,
				`let v = /* prettier-ignore */ (a  as  B).c;
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: const g = () => /* prettier-ignore */ ({a:  1});', async () => {
			await expectPrettierFormat(
				`const g = () => /* prettier-ignore */ ({a:  1});`,
				`const g = () => /* prettier-ignore */ ({a:  1});
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: const h = () => /* prettier-ignore */ (a,  b);', async () => {
			await expectPrettierFormat(
				`const h = () => /* prettier-ignore */ (a,  b);`,
				`const h = () => /* prettier-ignore */ (a,  b);
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: export default /* prettier-ignore */ (a,  b);', async () => {
			await expectPrettierFormat(
				`export default /* prettier-ignore */ (a,  b);`,
				`export default /* prettier-ignore */ (a,  b);
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: x = a[/* prettier-ignore */ (b,  c)];', async () => {
			await expectPrettierFormat(
				`x = a[/* prettier-ignore */ (b,  c)];`,
				`x = a[/* prettier-ignore */ (b,  c)];
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: for (/* prettier-ignore */ i = 0,  j = 0; ;) {}', async () => {
			await expectPrettierFormat(
				`for (/* prettier-ignore */ i = 0,  j = 0; ;) {}`,
				`for (/* prettier-ignore */ i = 0,  j = 0; ;) {}
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: async function k() {\n  await /* prettier-ignore */ (a  ||  b);\n}', async () => {
			await expectPrettierFormat(
				`async function k() {
  await /* prettier-ignore */ (a  ||  b);
}`,
				`async function k() {
  await /* prettier-ignore */ (a  ||  b);
}
`,
			);
		});

		test('keeps the parentheses a prettier-ignored node needs: function r() {\n  return /* prettier-ignore */ (a,  b);\n}', async () => {
			await expectPrettierFormat(
				`function r() {
  return /* prettier-ignore */ (a,  b);
}`,
				`function r() {
  return /* prettier-ignore */ (a,  b);
}
`,
			);
		});

		test('parenthesizes a nested ternary consequent, not an alternate, like Prettier', async () => {
			await expectPrettierFormat(
				`x = a ? (b ? c : d) : e;
y = a ? b : (c ? d : e);`,
				`x = a ? (b ? c : d) : e;
y = a ? b : c ? d : e;
`,
			);
		});

		test('preserves execution when formatting parenthesized operands', async () => {
			await expectPrettierFormat(
				`(a || b)();`,
				`(a || b)();
`,
			);
			await expectPrettierFormat(
				`(a ?? b)();`,
				`(a ?? b)();
`,
			);
			await expectPrettierFormat(
				`(a + b)();`,
				`(a + b)();
`,
			);
			await expectPrettierFormat(
				`(a ? b : c)();`,
				`(a ? b : c)();
`,
			);
			await expectPrettierFormat(
				`(a = b)();`,
				`(a = b)();
`,
			);
			await expectPrettierFormat(
				`(-a)();`,
				`(-a)();
`,
			);
			await expectPrettierFormat(
				`(typeof a)();`,
				`(typeof a)();
`,
			);
			await expectPrettierFormat(
				`(a++)();`,
				`(a++)();
`,
			);
			await expectPrettierFormat(
				`(x => x)();`,
				`((x) => x)();
`,
			);
			await expectPrettierFormat(
				`(function () {})();`,
				`(function () {})();
`,
			);
			await expectPrettierFormat(
				`(class {})();`,
				`(class {})();
`,
			);
			await expectPrettierFormat(
				`(a as F)();`,
				`(a as F)();
`,
			);
			await expectPrettierFormat(
				`(a?.b)();`,
				`(a?.b)();
`,
			);
			await expectPrettierFormat(
				`(a?.())();`,
				`(a?.())();
`,
			);
			await expectPrettierFormat(
				`(new a())();`,
				`new a()();
`,
			);
			await expectPrettierFormat(
				`(a())();`,
				`a()();
`,
			);
			await expectPrettierFormat(
				`({})();`,
				`({})();
`,
			);
			await expectPrettierFormat(
				`new (a || b)();`,
				`new (a || b)();
`,
			);
			await expectPrettierFormat(
				`new (a ?? b)();`,
				`new (a ?? b)();
`,
			);
			await expectPrettierFormat(
				`new (a + b)();`,
				`new (a + b)();
`,
			);
			await expectPrettierFormat(
				`new (a ? b : c)();`,
				`new (a ? b : c)();
`,
			);
			await expectPrettierFormat(
				`new (a = b)();`,
				`new (a = b)();
`,
			);
			await expectPrettierFormat(
				`new (-a)();`,
				`new (-a)();
`,
			);
			await expectPrettierFormat(
				`new (typeof a)();`,
				`new (typeof a)();
`,
			);
			await expectPrettierFormat(
				`new (a++)();`,
				`new (a++)();
`,
			);
			await expectPrettierFormat(
				`new (x => x)();`,
				`new ((x) => x)();
`,
			);
			await expectPrettierFormat(
				`new (function () {})();`,
				`new (function () {})();
`,
			);
			await expectPrettierFormat(
				`new (class {})();`,
				`new (class {})();
`,
			);
			await expectPrettierFormat(
				`new (a as F)();`,
				`new (a as F)();
`,
			);
			await expectPrettierFormat(
				`new (a?.b)();`,
				`new (a?.b)();
`,
			);
			await expectPrettierFormat(
				`new (a?.())();`,
				`new (a?.())();
`,
			);
			await expectPrettierFormat(
				`new (new a())();`,
				`new new a()();
`,
			);
			await expectPrettierFormat(
				`new (a())();`,
				`new (a())();
`,
			);
			await expectPrettierFormat(
				`new ({})();`,
				`new {}();
`,
			);
			await expectPrettierFormat(
				`(a || b)\`t\`;`,
				`(a || b)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a ?? b)\`t\`;`,
				`(a ?? b)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a + b)\`t\`;`,
				`(a + b)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a ? b : c)\`t\`;`,
				`(a ? b : c)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a = b)\`t\`;`,
				`(a = b)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(-a)\`t\`;`,
				`(-a)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(typeof a)\`t\`;`,
				`(typeof a)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a++)\`t\`;`,
				`(a++)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(x => x)\`t\`;`,
				`((x) => x)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(function () {})\`t\`;`,
				`(function () {})\`t\`;
`,
			);
			await expectPrettierFormat(
				`(class {})\`t\`;`,
				`(class {})\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a as F)\`t\`;`,
				`(a as F)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a?.b)\`t\`;`,
				`(a?.b)\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a?.())\`t\`;`,
				`(a?.())\`t\`;
`,
			);
			await expectPrettierFormat(
				`(new a())\`t\`;`,
				`new a()\`t\`;
`,
			);
			await expectPrettierFormat(
				`(a())\`t\`;`,
				`a()\`t\`;
`,
			);
			await expectPrettierFormat(
				`({})\`t\`;`,
				`({})\`t\`;
`,
			);
			await expectPrettierFormat(
				`x = (a || b).p;`,
				`x = (a || b).p;
`,
			);
			await expectPrettierFormat(
				`x = (a ?? b).p;`,
				`x = (a ?? b).p;
`,
			);
			await expectPrettierFormat(
				`x = (a + b).p;`,
				`x = (a + b).p;
`,
			);
			await expectPrettierFormat(
				`x = (a ? b : c).p;`,
				`x = (a ? b : c).p;
`,
			);
			await expectPrettierFormat(
				`x = (a = b).p;`,
				`x = (a = b).p;
`,
			);
			await expectPrettierFormat(
				`x = (-a).p;`,
				`x = (-a).p;
`,
			);
			await expectPrettierFormat(
				`x = (typeof a).p;`,
				`x = (typeof a).p;
`,
			);
			await expectPrettierFormat(
				`x = (a++).p;`,
				`x = (a++).p;
`,
			);
			await expectPrettierFormat(
				`x = (x => x).p;`,
				`x = ((x) => x).p;
`,
			);
			await expectPrettierFormat(
				`x = (function () {}).p;`,
				`x = function () {}.p;
`,
			);
			await expectPrettierFormat(
				`x = (class {}).p;`,
				`x = class {}.p;
`,
			);
			await expectPrettierFormat(
				`x = (a as F).p;`,
				`x = (a as F).p;
`,
			);
			await expectPrettierFormat(
				`x = (a?.b).p;`,
				`x = (a?.b).p;
`,
			);
			await expectPrettierFormat(
				`x = (a?.()).p;`,
				`x = (a?.()).p;
`,
			);
			await expectPrettierFormat(
				`x = (new a()).p;`,
				`x = new a().p;
`,
			);
			await expectPrettierFormat(
				`x = (a()).p;`,
				`x = a().p;
`,
			);
			await expectPrettierFormat(
				`x = ({}).p;`,
				`x = {}.p;
`,
			);
			await expectPrettierFormat(
				`x = (a || b)!;`,
				`x = (a || b)!;
`,
			);
			await expectPrettierFormat(
				`x = (a ?? b)!;`,
				`x = (a ?? b)!;
`,
			);
			await expectPrettierFormat(
				`x = (a + b)!;`,
				`x = (a + b)!;
`,
			);
			await expectPrettierFormat(
				`x = (a ? b : c)!;`,
				`x = (a ? b : c)!;
`,
			);
			await expectPrettierFormat(
				`x = (a = b)!;`,
				`x = (a = b)!;
`,
			);
			await expectPrettierFormat(
				`x = (-a)!;`,
				`x = (-a)!;
`,
			);
			await expectPrettierFormat(
				`x = (typeof a)!;`,
				`x = (typeof a)!;
`,
			);
			await expectPrettierFormat(
				`x = (a++)!;`,
				`x = (a++)!;
`,
			);
			await expectPrettierFormat(
				`x = (x => x)!;`,
				`x = ((x) => x)!;
`,
			);
			await expectPrettierFormat(
				`x = (function () {})!;`,
				`x = function () {}!;
`,
			);
			await expectPrettierFormat(
				`x = (class {})!;`,
				`x = class {}!;
`,
			);
			await expectPrettierFormat(
				`x = (a as F)!;`,
				`x = (a as F)!;
`,
			);
			await expectPrettierFormat(
				`x = (a?.b)!;`,
				`x = (a?.b)!;
`,
			);
			await expectPrettierFormat(
				`x = (a?.())!;`,
				`x = (a?.())!;
`,
			);
			await expectPrettierFormat(
				`x = (new a())!;`,
				`x = new a()!;
`,
			);
			await expectPrettierFormat(
				`x = (a())!;`,
				`x = a()!;
`,
			);
			await expectPrettierFormat(
				`x = ({})!;`,
				`x = {}!;
`,
			);
			await expectPrettierFormat(
				`x = (a || b) * 2;`,
				`x = (a || b) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a ?? b) * 2;`,
				`x = (a ?? b) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a + b) * 2;`,
				`x = (a + b) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a ? b : c) * 2;`,
				`x = (a ? b : c) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a = b) * 2;`,
				`x = (a = b) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (-a) * 2;`,
				`x = -a * 2;
`,
			);
			await expectPrettierFormat(
				`x = (typeof a) * 2;`,
				`x = typeof a * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a++) * 2;`,
				`x = a++ * 2;
`,
			);
			await expectPrettierFormat(
				`x = (x => x) * 2;`,
				`x = ((x) => x) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (function () {}) * 2;`,
				`x = function () {} * 2;
`,
			);
			await expectPrettierFormat(
				`x = (class {}) * 2;`,
				`x = class {} * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a as F) * 2;`,
				`x = (a as F) * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a?.b) * 2;`,
				`x = a?.b * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a?.()) * 2;`,
				`x = a?.() * 2;
`,
			);
			await expectPrettierFormat(
				`x = (new a()) * 2;`,
				`x = new a() * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a()) * 2;`,
				`x = a() * 2;
`,
			);
			await expectPrettierFormat(
				`x = ({}) * 2;`,
				`x = {} * 2;
`,
			);
			await expectPrettierFormat(
				`x = (a || b) ? 1 : 2;`,
				`x = a || b ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a ?? b) ? 1 : 2;`,
				`x = (a ?? b) ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a + b) ? 1 : 2;`,
				`x = a + b ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a ? b : c) ? 1 : 2;`,
				`x = (a ? b : c) ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a = b) ? 1 : 2;`,
				`x = (a = b) ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (-a) ? 1 : 2;`,
				`x = -a ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (typeof a) ? 1 : 2;`,
				`x = typeof a ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a++) ? 1 : 2;`,
				`x = a++ ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (x => x) ? 1 : 2;`,
				`x = ((x) => x) ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (function () {}) ? 1 : 2;`,
				`x = function () {} ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (class {}) ? 1 : 2;`,
				`x = class {} ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a as F) ? 1 : 2;`,
				`x = (a as F) ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a?.b) ? 1 : 2;`,
				`x = a?.b ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a?.()) ? 1 : 2;`,
				`x = a?.() ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (new a()) ? 1 : 2;`,
				`x = new a() ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = (a()) ? 1 : 2;`,
				`x = a() ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = ({}) ? 1 : 2;`,
				`x = {} ? 1 : 2;
`,
			);
			await expectPrettierFormat(
				`x = !(a || b);`,
				`x = !(a || b);
`,
			);
			await expectPrettierFormat(
				`x = !(a ?? b);`,
				`x = !(a ?? b);
`,
			);
			await expectPrettierFormat(
				`x = !(a + b);`,
				`x = !(a + b);
`,
			);
			await expectPrettierFormat(
				`x = !(a ? b : c);`,
				`x = !(a ? b : c);
`,
			);
			await expectPrettierFormat(
				`x = !(a = b);`,
				`x = !(a = b);
`,
			);
			await expectPrettierFormat(
				`x = !(-a);`,
				`x = !-a;
`,
			);
			await expectPrettierFormat(
				`x = !(typeof a);`,
				`x = !typeof a;
`,
			);
			await expectPrettierFormat(
				`x = !(a++);`,
				`x = !a++;
`,
			);
			await expectPrettierFormat(
				`x = !(x => x);`,
				`x = !((x) => x);
`,
			);
			await expectPrettierFormat(
				`x = !(function () {});`,
				`x = !function () {};
`,
			);
			await expectPrettierFormat(
				`x = !(class {});`,
				`x = !class {};
`,
			);
			await expectPrettierFormat(
				`x = !(a as F);`,
				`x = !(a as F);
`,
			);
			await expectPrettierFormat(
				`x = !(a?.b);`,
				`x = !a?.b;
`,
			);
			await expectPrettierFormat(
				`x = !(a?.());`,
				`x = !a?.();
`,
			);
			await expectPrettierFormat(
				`x = !(new a());`,
				`x = !new a();
`,
			);
			await expectPrettierFormat(
				`x = !(a());`,
				`x = !a();
`,
			);
			await expectPrettierFormat(
				`x = !({});`,
				`x = !{};
`,
			);
			await expectPrettierFormat(
				`x = [...(a || b)];`,
				`x = [...(a || b)];
`,
			);
			await expectPrettierFormat(
				`x = [...(a ?? b)];`,
				`x = [...(a ?? b)];
`,
			);
			await expectPrettierFormat(
				`x = [...(a + b)];`,
				`x = [...(a + b)];
`,
			);
			await expectPrettierFormat(
				`x = [...(a ? b : c)];`,
				`x = [...(a ? b : c)];
`,
			);
			await expectPrettierFormat(
				`x = [...(a = b)];`,
				`x = [...(a = b)];
`,
			);
			await expectPrettierFormat(
				`x = [...(-a)];`,
				`x = [...-a];
`,
			);
			await expectPrettierFormat(
				`x = [...(typeof a)];`,
				`x = [...typeof a];
`,
			);
			await expectPrettierFormat(
				`x = [...(a++)];`,
				`x = [...a++];
`,
			);
			await expectPrettierFormat(
				`x = [...(x => x)];`,
				`x = [...(x) => x];
`,
			);
			await expectPrettierFormat(
				`x = [...(function () {})];`,
				`x = [...function () {}];
`,
			);
			await expectPrettierFormat(
				`x = [...(class {})];`,
				`x = [...class {}];
`,
			);
			await expectPrettierFormat(
				`x = [...(a as F)];`,
				`x = [...(a as F)];
`,
			);
			await expectPrettierFormat(
				`x = [...(a?.b)];`,
				`x = [...a?.b];
`,
			);
			await expectPrettierFormat(
				`x = [...(a?.())];`,
				`x = [...a?.()];
`,
			);
			await expectPrettierFormat(
				`x = [...(new a())];`,
				`x = [...new a()];
`,
			);
			await expectPrettierFormat(
				`x = [...(a())];`,
				`x = [...a()];
`,
			);
			await expectPrettierFormat(
				`x = [...({})];`,
				`x = [...{}];
`,
			);
			await expectPrettierFormat(
				`x = () => (a || b);`,
				`x = () => a || b;
`,
			);
			await expectPrettierFormat(
				`x = () => (a ?? b);`,
				`x = () => a ?? b;
`,
			);
			await expectPrettierFormat(
				`x = () => (a + b);`,
				`x = () => a + b;
`,
			);
			await expectPrettierFormat(
				`x = () => (a ? b : c);`,
				`x = () => (a ? b : c);
`,
			);
			await expectPrettierFormat(
				`x = () => (a = b);`,
				`x = () => (a = b);
`,
			);
			await expectPrettierFormat(
				`x = () => (-a);`,
				`x = () => -a;
`,
			);
			await expectPrettierFormat(
				`x = () => (typeof a);`,
				`x = () => typeof a;
`,
			);
			await expectPrettierFormat(
				`x = () => (a++);`,
				`x = () => a++;
`,
			);
			await expectPrettierFormat(
				`x = () => (x => x);`,
				`x = () => (x) => x;
`,
			);
			await expectPrettierFormat(
				`x = () => (function () {});`,
				`x = () => function () {};
`,
			);
			await expectPrettierFormat(
				`x = () => (class {});`,
				`x = () => class {};
`,
			);
			await expectPrettierFormat(
				`x = () => (a as F);`,
				`x = () => a as F;
`,
			);
			await expectPrettierFormat(
				`x = () => (a?.b);`,
				`x = () => a?.b;
`,
			);
			await expectPrettierFormat(
				`x = () => (a?.());`,
				`x = () => a?.();
`,
			);
			await expectPrettierFormat(
				`x = () => (new a());`,
				`x = () => new a();
`,
			);
			await expectPrettierFormat(
				`x = () => (a());`,
				`x = () => a();
`,
			);
			await expectPrettierFormat(
				`x = () => ({});`,
				`x = () => ({});
`,
			);
		});
	});

	describe('binary and logical expressions lay out like Prettier', () => {
		test('keeps the comments of "const total =\\n  first + // the base\\n  second;\\nconst ok =\\n  isReady || // cached\\n  isLoading;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`const total =
  first + // the base
  second;
const ok =
  isReady || // cached
  isLoading;`,
				`const total =
  first + // the base
  second;
const ok =
  isReady || // cached
  isLoading;
`,
			);
		});

		test('keeps the comments of "function f() {\\n  return (\\n    a + // x\\n    b + // y\\n    c\\n  );\\n}" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return (
    a + // x
    b + // y
    c
  );
}`,
				`function f() {
  return (
    a + // x
    b + // y
    c
  );
}
`,
			);
		});

		test('keeps the comments of "if (\\n  a || // first\\n  b\\n) {\\n  run();\\n}" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`if (
  a || // first
  b
) {
  run();
}`,
				`if (
  a || // first
  b
) {
  run();
}
`,
			);
		});

		test('keeps the comments of "foo(\\n  first + // the base\\n    second,\\n);" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`foo(
  first + // the base
    second,
);`,
				`foo(
  first + // the base
    second,
);
`,
			);
		});

		test('keeps the comments of "x = !(\\n  cond1 || // foo\\n  cond2 || // bar\\n  cond3 // baz\\n);" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`x = !(
  cond1 || // foo
  cond2 || // bar
  cond3 // baz
);`,
				`x = !(
  cond1 || // foo
  cond2 || // bar
  cond3 // baz
);
`,
			);
		});

		test('keeps the comments of "const total =\\n  first +\\n  // own line\\n  second;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`const total =
  first +
  // own line
  second;`,
				`const total =
  first +
  // own line
  second;
`,
			);
		});

		test('keeps the comments of "const total = first + /* inline */ second;" where they are, like Prettier', async () => {
			await expectPrettierFormat(
				`const total = first + /* inline */ second;`,
				`const total = first + /* inline */ second;
`,
			);
		});

		test('keeps a comment that ends the line of an operator after it in "const ok = a && // first\\n  b && // second\\n  c;"', async () => {
			await expectPrettierFormat(
				`const ok = a && // first
  b && // second
  c;`,
				`const ok =
  a && // first
  b && // second
  c;
`,
			);
		});

		test('keeps a comment that ends the line of an operator after it in "const x = a + /* c */\\n  b;"', async () => {
			await expectPrettierFormat(
				`const x = a + /* c */
  b;`,
				`const x = a /* c */ + b;
`,
			);
		});

		test('keeps a comment that ends the line of an operator after it in "x = a ?? // fallback\\n  b;"', async () => {
			await expectPrettierFormat(
				`x = a ?? // fallback
  b;`,
				`x =
  a ?? // fallback
  b;
`,
			);
		});

		test('keeps a comment that ends the line of an operator after it in "const x = (a + // c\\n  b) * c;"', async () => {
			await expectPrettierFormat(
				`const x = (a + // c
  b) * c;`,
				`const x =
  (a + // c
    b) *
  c;
`,
			);
		});

		test('parenthesizes a logical operand of another logical operator', async () => {
			await expectPrettierFormat(
				`const z = a && b || c;
const y = a || b && c;
const q = aaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb || cccccccccccccccccccccccccc && ddddddddddddddd;`,
				`const z = (a && b) || c;
const y = a || (b && c);
const q =
  (aaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) ||
  (cccccccccccccccccccccccccc && ddddddddddddddd);
`,
			);
		});

		test('breaks before every operand of a same-precedence chain in const ok = isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession && isOnline;', async () => {
			await expectPrettierFormat(
				`const ok = isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession && isOnline;`,
				`const ok =
  isEnabledForTheCurrentUser &&
  hasPermissionToEdit &&
  !isLockedByAnotherSession &&
  isOnline;
`,
			);
		});

		test('breaks before every operand of a same-precedence chain in const total = firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName;', async () => {
			await expectPrettierFormat(
				`const total = firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName;`,
				`const total =
  firstOperandWithALongName +
  secondOperandWithALongName +
  thirdOperandWithALongName;
`,
			);
		});

		test('breaks before every operand of a same-precedence chain in const value = firstFallbackWithALongName ?? secondFallbackWithALongName ?? thirdFallbackWithALongName;', async () => {
			await expectPrettierFormat(
				`const value = firstFallbackWithALongName ?? secondFallbackWithALongName ?? thirdFallbackWithALongName;`,
				`const value =
  firstFallbackWithALongName ??
  secondFallbackWithALongName ??
  thirdFallbackWithALongName;
`,
			);
		});

		test('breaks before every operand of a same-precedence chain in const flags = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | ccccccccccccccccccccccccccccc;', async () => {
			await expectPrettierFormat(
				`const flags = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa | bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb | ccccccccccccccccccccccccccccc;`,
				`const flags =
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb |
  ccccccccccccccccccccccccccccc;
`,
			);
		});

		test('breaks before every operand of a same-precedence chain in foo(firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName, other);', async () => {
			await expectPrettierFormat(
				`foo(firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName, other);`,
				`foo(
  firstOperandWithALongName +
    secondOperandWithALongName +
    thirdOperandWithALongName,
  other,
);
`,
			);
		});

		test('breaks a mixed-precedence chain only at its loosest operator', async () => {
			await expectPrettierFormat(
				`const short = a + b * c - d;
const mixed = aaaaaaaaaaaaaaaaaaaaaaa * bbbbbbbbbbbbbbbbbbbbbbbbbbb + ccccccccccccccccccccccc * dddddddddddddddd;`,
				`const short = a + b * c - d;
const mixed =
  aaaaaaaaaaaaaaaaaaaaaaa * bbbbbbbbbbbbbbbbbbbbbbbbbbb +
  ccccccccccccccccccccccc * dddddddddddddddd;
`,
			);
		});

		test('lines up the operands where Prettier does not indent them in const f = (resolve) => aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;', async () => {
			await expectPrettierFormat(
				`const f = (resolve) => aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;`,
				`const f = (resolve) =>
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;
`,
			);
		});

		test('lines up the operands where Prettier does not indent them in const x = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;', async () => {
			await expectPrettierFormat(
				`const x = aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;`,
				`const x =
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;
`,
			);
		});

		test('lines up the operands where Prettier does not indent them in if (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) {\n  run();\n}', async () => {
			await expectPrettierFormat(
				`if (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) {
  run();
}`,
				`if (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
) {
  run();
}
`,
			);
		});

		test('lines up the operands where Prettier does not indent them in const b = Boolean(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);', async () => {
			await expectPrettierFormat(
				`const b = Boolean(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`const b = Boolean(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
);
`,
			);
		});

		test('lines up the operands of an assigned value after the operator breaks', async () => {
			await expectPrettierFormat(
				`total = firstOperandWithALongName + secondOperandWithALongName + thirdOperandWithALongName;
const options = { enabled: isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession };
class Session { ready = isEnabledForTheCurrentUser && hasPermissionToEdit && !isLockedByAnotherSession; }`,
				`total =
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
}
`,
			);
		});

		test('breaks after the opening parenthesis in const b = !!(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);', async () => {
			await expectPrettierFormat(
				`const b = !!(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`const b = !!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);
`,
			);
		});

		test('breaks after the opening parenthesis in const b = typeof (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);', async () => {
			await expectPrettierFormat(
				`const b = typeof (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`const b = typeof (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);
`,
			);
		});

		test('breaks after the opening parenthesis in const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb).length;', async () => {
			await expectPrettierFormat(
				`const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb).length;`,
				`const b = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
).length;
`,
			);
		});

		test('breaks after the opening parenthesis in const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)();', async () => {
			await expectPrettierFormat(
				`const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa || bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)();`,
				`const b = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)();
`,
			);
		});

		test('indents the operands of a call argument and a computed member object', async () => {
			await expectPrettierFormat(
				`foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  c,
);
const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)[0];`,
				`foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  c,
);
const b = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)[0];
`,
			);
		});

		test('wraps a return or throw argument in parentheses only when it breaks in function g() {\n  return aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;\n}', async () => {
			await expectPrettierFormat(
				`function g() {
  return aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;
}`,
				`function g() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}
`,
			);
		});

		test('wraps a return or throw argument in parentheses only when it breaks in function g() {\n  throw aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;\n}', async () => {
			await expectPrettierFormat(
				`function g() {
  throw aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa + bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;
}`,
				`function g() {
  throw (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}
`,
			);
		});

		test('wraps a return or throw argument in parentheses only when it breaks in function g() {\n  return (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa instanceof bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);\n}', async () => {
			await expectPrettierFormat(
				`function g() {
  return (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa instanceof bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
}`,
				`function g() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa instanceof
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}
`,
			);
		});

		test('wraps a return or throw argument in parentheses only when it breaks in function g() {\n  return (first ?? second);\n}', async () => {
			await expectPrettierFormat(
				`function g() {
  return (first ?? second);
}`,
				`function g() {
  return first ?? second;
}
`,
			);
		});

		test('keeps "x = aaaaaaaaaaaaaaaaaaaaaa && {\\n  aaaaaaaaaaaa: 1,\\n  bbbbbbbbbbbbbbbbbbbbb: 2,\\n  ccccccccccccccc: 3,\\n};"', async () => {
			await expectPrettierFormat(
				`x = aaaaaaaaaaaaaaaaaaaaaa && {
  aaaaaaaaaaaa: 1,
  bbbbbbbbbbbbbbbbbbbbb: 2,
  ccccccccccccccc: 3,
};`,
				`x = aaaaaaaaaaaaaaaaaaaaaa && {
  aaaaaaaaaaaa: 1,
  bbbbbbbbbbbbbbbbbbbbb: 2,
  ccccccccccccccc: 3,
};
`,
			);
		});

		test('keeps "x =\\n  /** @type {T} */ (a && b) || // c\\n  d;" like Prettier', async () => {
			await expectPrettierFormat(
				`x =
  /** @type {T} */ (a && b) || // c
  d;`,
				`x =
  /** @type {T} */ (a && b) || // c
  d;
`,
			);
		});

		test('keeps "x =\\n  a &&\\n  (b || c) && // c\\n  d;" like Prettier', async () => {
			await expectPrettierFormat(
				`x =
  a &&
  (b || c) && // c
  d;`,
				`x =
  a &&
  (b || c) && // c
  d;
`,
			);
		});

		test('keeps "x =\\n  (a || b) + // c\\n  d;" like Prettier', async () => {
			await expectPrettierFormat(
				`x =
  (a || b) + // c
  d;`,
				`x =
  (a || b) + // c
  d;
`,
			);
		});

		test('keeps "x =\\n  f(\\n    a, // c\\n  ) + d;" like Prettier', async () => {
			await expectPrettierFormat(
				`x =
  f(
    a, // c
  ) + d;`,
				`x =
  f(
    a, // c
  ) + d;
`,
			);
		});

		test('keeps "x = 30 * (month - 1) /* c */ + day;" like Prettier', async () => {
			await expectPrettierFormat(
				`x = 30 * (month - 1) /* c */ + day;`,
				`x = 30 * (month - 1) /* c */ + day;
`,
			);
		});

		test('keeps "x = a || b /* c */ || d;" like Prettier', async () => {
			await expectPrettierFormat(
				`x = a || b /* c */ || d;`,
				`x = a || b /* c */ || d;
`,
			);
		});

		test('keeps "x = f(a && b /* c */, x);" like Prettier', async () => {
			await expectPrettierFormat(
				`x = f(a && b /* c */, x);`,
				`x = f(a && b /* c */, x);
`,
			);
		});

		test('keeps "x =\\n  a && (\\n    <Note /> // note\\n  ) &&\\n  b;" like Prettier', async () => {
			await expectPrettierFormat(
				`x =
  a && (
    <Note /> // note
  ) &&
  b;`,
				`x =
  a && (
    <Note /> // note
  ) &&
  b;
`,
			);
		});
	});

	describe('statement conditions lay out like Prettier', () => {
		test('moves a long condition onto its own lines in while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb) {
  step();
}`,
				`while (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
) {
  step();
}
`,
			);
		});

		test('moves a long condition onto its own lines in do {\n  step();\n} while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);', async () => {
			await expectPrettierFormat(
				`do {
  step();
} while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`do {
  step();
} while (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);
`,
			);
		});

		test('moves a long condition onto its own lines in while (someObject.someMethodWithAVeryLongName(argumentNumberOne, argumentNumberTwo, three)) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`while (someObject.someMethodWithAVeryLongName(argumentNumberOne, argumentNumberTwo, three)) {
  step();
}`,
				`while (
  someObject.someMethodWithAVeryLongName(
    argumentNumberOne,
    argumentNumberTwo,
    three,
  )
) {
  step();
}
`,
			);
		});

		test('moves a long condition onto its own lines in while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`while (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) {
  step();
}`,
				`while (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
) {
  step();
}
`,
			);
		});

		test('keeps only a negated logical condition on the keyword line in if (!(\n  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n)) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`if (!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)) {
  step();
}`,
				`if (!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa &&
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)) {
  step();
}
`,
			);
		});

		test('keeps only a negated logical condition on the keyword line in while (!!(\n  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n)) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`while (!!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)) {
  step();
}`,
				`while (!!(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
)) {
  step();
}
`,
			);
		});

		test('keeps only a negated logical condition on the keyword line in if (\n  !(\n    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +\n    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n  )\n) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`if (
  !(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  )
) {
  step();
}`,
				`if (
  !(
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  )
) {
  step();
}
`,
			);
		});

		test('keeps only a negated logical condition on the keyword line in while (ready && count < limit) {\n  step();\n}', async () => {
			await expectPrettierFormat(
				`while (ready && count < limit) {
  step();
}`,
				`while (ready && count < limit) {
  step();
}
`,
			);
		});
	});

	describe('sequence expressions lay out like Prettier', () => {
		test('breaks after the commas in const f = (a) => (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);', async () => {
			await expectPrettierFormat(
				`const f = (a) => (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`const f = (a) => (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
);
`,
			);
		});

		test('breaks after the commas in function g() {\n  return (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);\n}', async () => {
			await expectPrettierFormat(
				`function g() {
  return (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
}`,
				`function g() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}
`,
			);
		});

		test('breaks after the commas in function g() {\n  throw (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);\n}', async () => {
			await expectPrettierFormat(
				`function g() {
  throw (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
}`,
				`function g() {
  throw (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  );
}
`,
			);
		});

		test('breaks after the commas in firstVariableWithLongName = computeSomething(), secondVariableWithLongName = computeOther();', async () => {
			await expectPrettierFormat(
				`firstVariableWithLongName = computeSomething(), secondVariableWithLongName = computeOther();`,
				`((firstVariableWithLongName = computeSomething()),
  (secondVariableWithLongName = computeOther()));
`,
			);
		});

		test('breaks after the commas in foo((aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));', async () => {
			await expectPrettierFormat(
				`foo((aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));`,
				`foo(
  (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb),
);
`,
			);
		});

		test('keeps a sequence that fits on one line', async () => {
			await expectPrettierFormat(
				`(a, b);
const f = (a) => (a, b);
for (i = 0, j = 1; i < 10; i++, j++) {
  step();
}`,
				`(a, b);
const f = (a) => (a, b);
for (i = 0, j = 1; i < 10; i++, j++) {
  step();
}
`,
			);
		});
	});

	describe('conditional types lay out like Prettier', () => {
		test('breaks every conditional type of a chain together', async () => {
			await expectPrettierFormat(
				`type C<T> = T extends string ? "a" : T extends number ? "b" : T extends boolean ? "c" : T extends undefined ? "dddddddddd" : never;
type TypeEquality<T, E> = [T] extends [E] ? ([E] extends [T] ? true : false) : false;
type IsUnion<T, U = T> = (T extends any ? ([U] extends [T] ? false : true) : never) extends infer Result ? Result : never;`,
				`type C<T> = T extends string
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
  : never;
`,
			);
		});

		test('breaks a chain of conditional types with tabs', async () => {
			await expectPrettierFormat(
				`type C<T> = T extends string ? "a" : T extends number ? "b" : T extends boolean ? "c" : never;
type E<T, E> = [T] extends [E] ? ([E] extends [T] ? true : false) : false;`,
				`type C<T> = T extends string
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
	: false;
`,
				{ useTabs: true, printWidth: 40 },
			);
		});

		test('breaks a conditional extends type inside its parentheses', async () => {
			await expectPrettierFormat(
				`type P<T> = T extends (T extends any ? ([T] extends [any] ? true : false) : never) ? "aaaaaaaaaaaaaaaaaa" : "b";`,
				`type P<T> = T extends (
  T extends any ? ([T] extends [any] ? true : false) : never
)
  ? "aaaaaaaaaaaaaaaaaa"
  : "b";
`,
			);
		});

		test('breaks a chain of conditional types in a return type and a mapped type', async () => {
			await expectPrettierFormat(
				`function f<T>(x: T): T extends string ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : T extends number ? "bbbbbbbbbbbbb" : never {}
type N<T> = { [K in keyof T]: T[K] extends Function ? K : T[K] extends object ? NNNNNNNNNNN<T[K]> : never }[keyof T];`,
				`function f<T>(
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
}[keyof T];
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type A<T> = T extends (infer U extends string ? U : never) ? T : never;', async () => {
			await expectPrettierFormat(
				`type A<T> = T extends (infer U extends string ? U : never) ? T : never;`,
				`type A<T> = T extends (infer U extends string ? U : never) ? T : never;
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type Y<T> = (T extends string ? "a" : "b")[];', async () => {
			await expectPrettierFormat(
				`type Y<T> = (T extends string ? "a" : "b")[];`,
				`type Y<T> = (T extends string ? "a" : "b")[];
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type Z<T> = Foo<\n  T extends string\n    ? "aaaaaaaaaaaaaaaaaaaaaaaaaaa"\n    : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",\n  T\n>;', async () => {
			await expectPrettierFormat(
				`type Z<T> = Foo<
  T extends string
    ? "aaaaaaaaaaaaaaaaaaaaaaaaaaa"
    : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  T
>;`,
				`type Z<T> = Foo<
  T extends string
    ? "aaaaaaaaaaaaaaaaaaaaaaaaaaa"
    : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  T
>;
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type M<T> = keyof (T extends string\n  ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaa"\n  : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");', async () => {
			await expectPrettierFormat(
				`type M<T> = keyof (T extends string
  ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");`,
				`type M<T> = keyof (T extends string
  ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type O<T> =\n  | A\n  | (T extends string\n      ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"\n      : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");', async () => {
			await expectPrettierFormat(
				`type O<T> =
  | A
  | (T extends string
      ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");`,
				`type O<T> =
  | A
  | (T extends string
      ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type K<T> = T extends string\n  ? // comment\n    "a"\n  : "b";', async () => {
			await expectPrettierFormat(
				`type K<T> = T extends string
  ? // comment
    "a"
  : "b";`,
				`type K<T> = T extends string
  ? // comment
    "a"
  : "b";
`,
			);
		});

		test('keeps a conditional type laid out like Prettier: type L<T> = T extends string ? "a" : /* c */ T extends number ? "b" : "c";', async () => {
			await expectPrettierFormat(
				`type L<T> = T extends string ? "a" : /* c */ T extends number ? "b" : "c";`,
				`type L<T> = T extends string ? "a" : /* c */ T extends number ? "b" : "c";
`,
			);
		});
	});

	describe('conditional expressions lay out like Prettier', () => {
		test('keeps a nested conditional that fits on one line after return, throw, and export default', async () => {
			await expectPrettierFormat(
				`function pick() {
  return a ? b : c ? d : e;
}
function fail() {
  throw a ? b : c ? d : e;
}
a ? b() : c ? d() : e();
export default a ? b : c ? d : e;`,
				`function pick() {
  return a ? b : c ? d : e;
}
function fail() {
  throw a ? b : c ? d : e;
}
a ? b() : c ? d() : e();
export default a ? b : c ? d : e;
`,
			);
		});

		test('breaks every branch of a chain that does not fit', async () => {
			await expectPrettierFormat(
				`const animal = isBird
  ? "bird"
  : isCat
    ? "cat"
    : isDog
      ? "dog"
      : isFish
        ? "fish"
        : "unknown animal type";`,
				`const animal = isBird
  ? "bird"
  : isCat
    ? "cat"
    : isDog
      ? "dog"
      : isFish
        ? "fish"
        : "unknown animal type";
`,
			);
		});

		test('parenthesizes a nested consequent only on one line', async () => {
			await expectPrettierFormat(
				`const value = aaaaaaaaaaaaaaaaaaaaaaaa ? (bbbbbbbbbbbbbbbbbbbbbbbbbbbb ? ccccccccccccccccccccc : ddddddddddddd) : eeeee;`,
				`const value = aaaaaaaaaaaaaaaaaaaaaaaa
  ? bbbbbbbbbbbbbbbbbbbbbbbbbbbb
    ? ccccccccccccccccccccc
    : ddddddddddddd
  : eeeee;
`,
			);
		});

		test('breaks inside the parentheses of a conditional test', async () => {
			await expectPrettierFormat(
				`const value = (aaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbb : ccccccccccccccccccccccccccc) ? d : e;`,
				`const value = (
  aaaaaaaaaaaaaaaaaaaaaaaaaa
    ? bbbbbbbbbbbbbbbbbbbbbbbbbbb
    : ccccccccccccccccccccccccccc
)
  ? d
  : e;
`,
			);
		});

		test('breaks before the closing parenthesis of a member object in const x = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc).prop;', async () => {
			await expectPrettierFormat(
				`const x = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc).prop;`,
				`const x = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    : cccccccccccccccccccccccccc
).prop;
`,
			);
		});

		test('breaks before the closing parenthesis of a member object in const x = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc).prop.call();', async () => {
			await expectPrettierFormat(
				`const x = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc).prop.call();`,
				`const x = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
    : cccccccccccccccccccccccccc
).prop.call();
`,
			);
		});

		test('aligns a broken branch with the text after `? `', async () => {
			await expectPrettierFormat(
				`const value = test
  ? aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  : c;`,
				`const value = test
  ? aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  : c;
`,
			);
			await expectPrettierFormat(
				`function f() {
	const value = test
		? aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
			bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
		: c;
}`,
				`function f() {
	const value = test
		? aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa +
			bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
		: c;
}
`,
				{ useTabs: true },
			);
		});

		test('breaks the branches of a conditional with an element inside parentheses', async () => {
			await expectPrettierFormat(
				`const a = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaa</span> : <span>bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb</span>;
const b = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : null;
const c = cond ? undefined : <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span>;
const d = cond ? <span>aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</span> : "";
const animal = isBird ? "bird" : isCat ? "cat" : <span className="warning">Unknown animal type</span>;
const shape = isA ? <b>A</b> : isB ? <b>BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB</b> : null;`,
				`const a = cond ? (
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
) : null;
`,
			);
		});

		test('breaks a conditional with an element in JSX mode in children, attributes, returns, arrows, arguments, and member objects', async () => {
			await expectPrettierFormat(
				`function List({ items, filter }) {
  return <ul title={filter ? <span>filtered by {filter.name} and {filter.value}</span> : <span>all</span>}>{items.length ? items.map((item) => <li>{item}</li>) : <li className="empty">Nothing to show here yet</li>}</ul>;
}
function F() {
  return cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaa</div> : <div className="b">bbbbbbbbb</div>;
}
const G = () => cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaa</div> : <div className="b">bb</div>;
foo(cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaaaaaaa</div> : <div className="b">bbbbbbbbbbbbb</div>);
const props = (cond ? <div className="aaaaaaaaaaaaaaaaaaaa">aaaaaaaaaaaaa</div> : <div className="b">bbb</div>).props;`,
				`function List({ items, filter }) {
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
).props;
`,
			);
		});

		test('keeps comments after the ? of a conditional in JSX mode like Prettier', async () => {
			await expectPrettierFormat(
				`const x = cond ? // why
  <div /> : null;
const y = cond ?
  // own line
  <div /> : <span />;`,
				`const x = cond ? ( // why
  <div />
) : null;
const y = cond ? (
  // own line
  <div />
) : (
  <span />
);
`,
			);
		});

		test('breaks a conditional without an element in normal mode in children and attributes', async () => {
			await expectPrettierFormat(
				`function F({ cond, items }) {
  return (
    <div className={cond ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}>
      {cond ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" : "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
      {items.map((item) => (item.done ? <li className="done">{item.label}</li> : null))}
    </div>
  );
}`,
				`function F({ cond, items }) {
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
}
`,
			);
		});

		test('keeps a conditional with an element that fits on one line', async () => {
			await expectPrettierFormat(
				`const a = cond ? <span>a</span> : null;
const b = cond ? <b /> : isOther ? <i /> : undefined;
const c = <div>{cond ? <span>a</span> : <span>b</span>}</div>;`,
				`const a = cond ? <span>a</span> : null;
const b = cond ? <b /> : isOther ? <i /> : undefined;
const c = <div>{cond ? <span>a</span> : <span>b</span>}</div>;
`,
			);
		});
	});

	describe('comments after the ? or : of a conditional', () => {
		test('formats "const x = cond ? // why\\n  a : b;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = cond ? // why
  a : b;`,
				`const x = cond // why
  ? a
  : b;
`,
			);
		});

		test('formats "const x = cond\\n  ? a : // why\\n  b;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = cond
  ? a : // why
  b;`,
				`const x = cond
  ? a // why
  : b;
`,
			);
		});

		test('formats "type X = A extends B ? // why\\n  C : D;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X = A extends B ? // why
  C : D;`,
				`type X = A extends B // why
  ? C
  : D;
`,
			);
		});

		test('formats "type X = A extends B\\n  ? C : // why\\n  D;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X = A extends B
  ? C : // why
  D;`,
				`type X = A extends B
  ? C // why
  : D;
`,
			);
		});

		test('formats "foo(cond ? // why\\n  a : b);" like Prettier', async () => {
			await expectPrettierFormat(
				`foo(cond ? // why
  a : b);`,
				`foo(
  cond // why
    ? a
    : b,
);
`,
			);
		});

		test('formats "function f() {\\n  return cond ? // why\\n    a : b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return cond ? // why
    a : b;
}`,
				`function f() {
  return cond // why
    ? a
    : b;
}
`,
			);
		});

		test('formats "const x = cond ? // why\\n  a : c2 ? // two\\n  b : d;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = cond ? // why
  a : c2 ? // two
  b : d;`,
				`const x = cond // why
  ? a
  : c2 // two
    ? b
    : d;
`,
			);
		});

		test('formats "type X<T> = T extends string ? // str\\n  \\"a\\" : T extends number ? // num\\n  \\"b\\" : never;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X<T> = T extends string ? // str
  "a" : T extends number ? // num
  "b" : never;`,
				`type X<T> = T extends string // str
  ? "a"
  : T extends number // num
    ? "b"
    : never;
`,
			);
		});

		test('formats "const x = cond ?\\n  // own line\\n  a : b;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = cond ?
  // own line
  a : b;`,
				`const x = cond
  ? // own line
    a
  : b;
`,
			);
		});

		test('formats "const x = cond ? a :\\n  // own line\\n  b;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = cond ? a :
  // own line
  b;`,
				`const x = cond
  ? a
  : // own line
    b;
`,
			);
		});

		test('keeps "const x = cond // why\\n  ? a\\n  : b;"', async () => {
			await expectPrettierFormat(
				`const x = cond // why
  ? a
  : b;`,
				`const x = cond // why
  ? a
  : b;
`,
			);
		});

		test('keeps "const x = cond\\n  ? a // why\\n  : b;"', async () => {
			await expectPrettierFormat(
				`const x = cond
  ? a // why
  : b;`,
				`const x = cond
  ? a // why
  : b;
`,
			);
		});

		test('keeps "const x = cond\\n  ? // why\\n    a\\n  : b;"', async () => {
			await expectPrettierFormat(
				`const x = cond
  ? // why
    a
  : b;`,
				`const x = cond
  ? // why
    a
  : b;
`,
			);
		});

		test('keeps "const x = cond\\n  ? a\\n  : // why\\n    b;"', async () => {
			await expectPrettierFormat(
				`const x = cond
  ? a
  : // why
    b;`,
				`const x = cond
  ? a
  : // why
    b;
`,
			);
		});

		test('keeps "const x = cond ? /* c */ a : b;"', async () => {
			await expectPrettierFormat(
				`const x = cond ? /* c */ a : b;`,
				`const x = cond ? /* c */ a : b;
`,
			);
		});

		test('keeps "const x = cond ? a /* c */ : b;"', async () => {
			await expectPrettierFormat(
				`const x = cond ? a /* c */ : b;`,
				`const x = cond ? a /* c */ : b;
`,
			);
		});

		test('keeps "const x = cond ? a : /* c */ b;"', async () => {
			await expectPrettierFormat(
				`const x = cond ? a : /* c */ b;`,
				`const x = cond ? a : /* c */ b;
`,
			);
		});
	});

	describe('template literal expressions stay as written', () => {
		test('keeps an expression written on one line on one line in const message = `Projects: ${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.`;', async () => {
			await expectPrettierFormat(
				`const message = \`Projects: \${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.\`;`,
				`const message = \`Projects: \${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.\`;
`,
			);
		});

		test('keeps an expression written on one line on one line in throw new Error(\n  `Projects select multiple platforms for ${integration}: ${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.`,\n);', async () => {
			await expectPrettierFormat(
				`throw new Error(
  \`Projects select multiple platforms for \${integration}: \${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.\`,
);`,
				`throw new Error(
  \`Projects select multiple platforms for \${integration}: \${[...configured].map((platform) => JSON.stringify(platform)).join(", ")}. Select one.\`,
);
`,
			);
		});

		test('keeps an expression written on one line on one line in const s = `${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc}`;', async () => {
			await expectPrettierFormat(
				`const s = \`\${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc}\`;`,
				`const s = \`\${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ? bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb : cccccccccccccccccccccccccc}\`;
`,
			);
		});

		test('keeps an expression written on one line on one line in function f() {\n  const q = `\n    select * from ${table}\n    where ${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}\n  `;\n}', async () => {
			await expectPrettierFormat(
				`function f() {
  const q = \`
    select * from \${table}
    where \${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}
  \`;
}`,
				`function f() {
  const q = \`
    select * from \${table}
    where \${aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa && bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}
  \`;
}
`,
			);
		});

		test('keeps the line breaks of an expression written across lines', async () => {
			await expectPrettierFormat(
				`const s = \`\${
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
} and \${bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}\`;`,
				`const s = \`\${
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
} and \${bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb}\`;
`,
			);
		});

		test('keeps a comment on its own line after the expression in its ${…}', async () => {
			await expectPrettierFormat(
				`x = \`\${
  foo
  /* comment */
}\`;
y = \`a \${
  foo
  // comment
} b \${bar}\`;`,
				`x = \`\${
  foo
  /* comment */
}\`;
y = \`a \${
  foo
  // comment
} b \${bar}\`;
`,
			);
		});

		test('keeps a comment beside the expression or on its own line before it', async () => {
			await expectPrettierFormat(
				`z = \`\${foo /* c */} and \${
  // lead
  bar
}\`;`,
				`z = \`\${foo /* c */} and \${
  // lead
  bar
}\`;
`,
			);
		});

		test('keeps comments in the ${…} of CSS and GraphQL templates', async () => {
			await expectPrettierFormat(
				`const Box = styled.div\`
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
\`;`,
				`const Box = styled.div\`
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
\`;
`,
			);
		});

		test('moves a comment on its own line to the next type of a template literal type', async () => {
			await expectPrettierFormat(
				`type A = \`\${
  B
  // b
}x\${C}\${
  D
  // d
}\`;`,
				`type A = \`\${B}x\${
  // b
  C
}\${
  D
  // d
}\`;
`,
			);
		});

		test('indents a breaking expression from the template line it starts on', async () => {
			await expectPrettierFormat(
				`const s = \`a \${foo(() => {
  return 1;
})} b\`;
function f() {
  const q = \`
    list:
    \${items.map((item) => {
      return item.name;
    })}
  \`;
}`,
				`const s = \`a \${foo(() => {
  return 1;
})} b\`;
function f() {
  const q = \`
    list:
    \${items.map((item) => {
      return item.name;
    })}
  \`;
}
`,
			);
		});
	});

	describe('multi-line template literals break the lists around them', () => {
		test('breaks the call arguments and array around a template over several lines', async () => {
			await expectPrettierFormat(
				`foo(\`line one
line two \${x}\`, second);
const values = [\`first
second\`, other];`,
				`foo(
  \`line one
line two \${x}\`,
  second,
);
const values = [
  \`first
second\`,
  other,
];
`,
			);
		});

		test('breaks around the template in x = { a: `a\nb`, b: 1 };', async () => {
			await expectPrettierFormat(
				`x = { a: \`a
b\`, b: 1 };`,
				`x = {
  a: \`a
b\`,
  b: 1,
};
`,
			);
		});

		test('breaks around the template in foo(tag`a\nb ${c}`, d);', async () => {
			await expectPrettierFormat(
				`foo(tag\`a
b \${c}\`, d);`,
				`foo(
  tag\`a
b \${c}\`,
  d,
);
`,
			);
		});

		test('breaks around the template in foo(\n  `first\nsecond`);', async () => {
			await expectPrettierFormat(
				`foo(
  \`first
second\`);`,
				`foo(
  \`first
second\`,
);
`,
			);
		});

		test('breaks around the template in const s = cond ? `first\nsecond` : other;', async () => {
			await expectPrettierFormat(
				`const s = cond ? \`first
second\` : other;`,
				`const s = cond
  ? \`first
second\`
  : other;
`,
			);
		});

		test('breaks around the template in const a = b || `x\ny`;', async () => {
			await expectPrettierFormat(
				`const a = b || \`x
y\`;`,
				`const a =
  b ||
  \`x
y\`;
`,
			);
		});

		test('breaks around the template in function f() {\n  return `a\nb` + c;\n}', async () => {
			await expectPrettierFormat(
				`function f() {
  return \`a
b\` + c;
}`,
				`function f() {
  return (
    \`a
b\` + c
  );
}
`,
			);
		});

		test('breaks around the template in if (x) throw new Error(`line one\nline two ${value}`);', async () => {
			await expectPrettierFormat(
				`if (x) throw new Error(\`line one
line two \${value}\`);`,
				`if (x)
  throw new Error(\`line one
line two \${value}\`);
`,
			);
		});

		test('breaks around the template in f(`a ${b(`c\nd`)} e`);', async () => {
			await expectPrettierFormat(
				`f(\`a \${b(\`c
d\`)} e\`);`,
				`f(
  \`a \${b(\`c
d\`)} e\`,
);
`,
			);
		});

		test('breaks around the template in foo.bar(`a\nb`).baz(1);', async () => {
			await expectPrettierFormat(
				`foo.bar(\`a
b\`).baz(1);`,
				`foo
  .bar(
    \`a
b\`,
  )
  .baz(1);
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in run(`first\nsecond`);', async () => {
			await expectPrettierFormat(
				`run(\`first
second\`);`,
				`run(\`first
second\`);
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in const s = `first\nsecond`;', async () => {
			await expectPrettierFormat(
				`const s = \`first
second\`;`,
				`const s = \`first
second\`;
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in const fn = () => `a\nb`;', async () => {
			await expectPrettierFormat(
				`const fn = () => \`a
b\`;`,
				`const fn = () => \`a
b\`;
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in const x = tag`a\nb ${c}`;', async () => {
			await expectPrettierFormat(
				`const x = tag\`a
b \${c}\`;`,
				`const x = tag\`a
b \${c}\`;
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in describe(`a\nb`, () => {});', async () => {
			await expectPrettierFormat(
				`describe(\`a
b\`, () => {});`,
				`describe(\`a
b\`, () => {});
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in foo(`a\nb`)(c);', async () => {
			await expectPrettierFormat(
				`foo(\`a
b\`)(c);`,
				`foo(\`a
b\`)(c);
`,
			);
		});

		test('keeps a template that starts on the line of the code before it there in type T = `a\n${B}`;', async () => {
			await expectPrettierFormat(
				`type T = \`a
\${B}\`;`,
				`type T = \`a
\${B}\`;
`,
			);
		});
	});

	describe('code embedded in template literals formats like Prettier', () => {
		test('formats CSS in styled-components and GraphQL in gql templates', async () => {
			await expectPrettierFormat(
				`const Button = styled.button\`
color:red;padding:0 4px;
\`;
const query = gql\`
  query { user(id: 1) { name } }
\`;`,
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
\`;
`,
			);
		});

		test('formats CSS in styled(Component), .attrs(), and typed tags', async () => {
			await expectPrettierFormat(
				`const Link = styled(Anchor)\`color:\${(props) => props.color};\`;
const Input = styled.input.attrs({ type: "text" })\`border:0;\`;
const Title = styled.h1<Props>\`color: red;\`;`,
				`const Link = styled(Anchor)\`
  color: \${(props) => props.color};
\`;
const Input = styled.input.attrs({ type: "text" })\`
  border: 0;
\`;
const Title = styled.h1<Props>\`
  color: red;
\`;
`,
			);
		});

		test('formats CSS with placeholders, comments, and a nested css template', async () => {
			await expectPrettierFormat(
				`const Box = styled.div\`
  \${Child}:hover & { color:red }
  margin:\${(props) => props.gap}px 0;
  /* a comment */
  \${(props) => props.active && css\`font-weight:bold;\`}
\`;`,
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
\`;
`,
			);
		});

		test('formats CSS in styled-jsx css.global', async () => {
			await expectPrettierFormat(
				`const global = css.global\`body{margin:0}\`;`,
				`const global = css.global\`
  body {
    margin: 0;
  }
\`;
`,
			);
		});

		test('formats GraphQL in graphql(), and marked with a comment', async () => {
			await expectPrettierFormat(
				`const query = graphql(schema, \`{ user { ...UserParts } }\`);
const other = /* GraphQL */ \`
  query Q { user { ...UserParts } }
  \${fragment}
\`;`,
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
\`;
`,
			);
		});

		test('formats HTML in html templates and marked with a comment', async () => {
			await expectPrettierFormat(
				`const view = html\`<div><p>\${message}</p><span>hello</span></div>\`;
const marked = /* HTML */ \`<ul><li>one</li><li>two</li></ul>\`;`,
				`const view = html\`<div>
  <p>\${message}</p>
  <span>hello</span>
</div>\`;
const marked = /* HTML */ \`<ul>
  <li>one</li>
  <li>two</li>
</ul>\`;
`,
			);
		});

		test('formats Markdown in markdown templates', async () => {
			await expectPrettierFormat(
				`const doc = markdown\`
  # Title
  Some *text*   here.
\`;`,
				`const doc = markdown\`
  # Title

  Some _text_ here.
\`;
`,
			);
		});

		test('formats a whitespace-only CSS template', async () => {
			await expectPrettierFormat(
				`const empty = css\`   \`;`,
				`const empty = css\`\`;
`,
			);
		});

		test('formats a template after a line comment on its tag', async () => {
			await expectPrettierFormat(
				`const t = styled.div // comment
\`color:red;\`;`,
				`const t = styled.div // comment
\`
  color: red;
\`;
`,
			);
		});

		test('lays out embedded code like Prettier: an arrow body stays on the arrow line', async () => {
			await expectPrettierFormat(
				`const f = () => css\`color:red;\`;`,
				`const f = () => css\`
  color: red;
\`;
`,
			);
		});

		test('lays out embedded code like Prettier: a lone argument hugs the parentheses', async () => {
			await expectPrettierFormat(
				`foo(css\`color:red;\`);
foo.bar(gql\`query { a }\`);`,
				`foo(css\`
  color: red;
\`);
foo.bar(gql\`
  query {
    a
  }
\`);
`,
			);
		});

		test('lays out embedded code like Prettier: a call with a lone template on its line prints in its member chain', async () => {
			await expectPrettierFormat(
				`wrapper.find('SomeSelector').first().props().style(css\`
  color: red;
\`);`,
				`wrapper
  .find("SomeSelector")
  .first()
  .props()
  .style(css\`
    color: red;
  \`);
`,
			);
		});

		test('lays out embedded code like Prettier: HTML without whitespace at its ends does not hug', async () => {
			await expectPrettierFormat(
				`render(html\`<div>\${a}</div><span>\${b}</span>\`);
render(html\` <div>\${a}</div><span>\${b}</span> \`);`,
				`render(
  html\`<div>\${a}</div>
    <span>\${b}</span>\`,
);
render(html\`
  <div>\${a}</div>
  <span>\${b}</span>
\`);
`,
			);
		});

		test('lays out embedded code like Prettier: an HTML arrow body without whitespace at its ends breaks after the arrow', async () => {
			await expectPrettierFormat(
				`const view = (items) => html\`<ul>\${items.map((item) => html\`<li>\${item}</li>\`)}</ul><p>\${footer}</p>\`;`,
				`const view = (items) =>
  html\`<ul>
      \${items.map((item) => html\`<li>\${item}</li>\`)}
    </ul>
    <p>\${footer}</p>\`;
`,
			);
		});

		test('keeps CSS that does not parse as written', async () => {
			await expectPrettierFormat(
				`const stays = css\`color:red;\${x}{color:blue\`;`,
				`const stays = css\`color:red;\${x}{color:blue\`;
`,
			);
		});

		test('keeps a template with an invalid escape as written', async () => {
			await expectPrettierFormat(
				`const bad = css\`color: \\u{zz};\`;`,
				`const bad = css\`color: \\u{zz};\`;
`,
			);
		});

		test('keeps createGlobalStyle and keyframes, which Prettier 3.9.6 does not format as written', async () => {
			await expectPrettierFormat(
				`const G = createGlobalStyle\`body{margin:0}\`;
const fade = keyframes\`from{opacity:0}to{opacity:1}\`;`,
				`const G = createGlobalStyle\`body{margin:0}\`;
const fade = keyframes\`from{opacity:0}to{opacity:1}\`;
`,
			);
		});

		test('keeps templates kept by prettier-ignore as written', async () => {
			await expectPrettierFormat(
				`foo(/* prettier-ignore */ css\`color:red;\`);
// prettier-ignore
const kept = gql\`query { a }\`;`,
				`foo(/* prettier-ignore */ css\`color:red;\`);
// prettier-ignore
const kept = gql\`query { a }\`;
`,
			);
		});

		test('keeps a plain template in a call as written', async () => {
			await expectPrettierFormat(
				`foo(\`
color:red;
\`);`,
				`foo(\`
color:red;
\`);
`,
			);
		});

		test('keeps templates as written when embedded formatting is disabled', async () => {
			await expectPrettierFormat(
				`const Button = styled.button\`
color:red;padding:0 4px;
\`;
const f = () => css\`color:red;\`;
foo(gql\`query { a }\`);`,
				`const Button = styled.button\`
color:red;padding:0 4px;
\`;
const f = () => css\`color:red;\`;
foo(gql\`query { a }\`);
`,
				{ embeddedLanguageFormatting: 'off' },
			);
		});
	});

	describe('member chains break like Prettier', () => {
		test('keeps the comments of "item\\n  // explain the call\\n  .foo()\\n  .bar();\\nconst x = item\\n  /* note */ .foo()\\n  .bar();" before their lookups', async () => {
			await expectPrettierFormat(
				`item
  // explain the call
  .foo()
  .bar();
const x = item
  /* note */ .foo()
  .bar();`,
				`item
  // explain the call
  .foo()
  .bar();
const x = item
  /* note */ .foo()
  .bar();
`,
			);
		});

		test('keeps the comments of "const x = item\\n  // one\\n  .foo()\\n  // two\\n  .bar();" before their lookups', async () => {
			await expectPrettierFormat(
				`const x = item
  // one
  .foo()
  // two
  .bar();`,
				`const x = item
  // one
  .foo()
  // two
  .bar();
`,
			);
		});

		test('keeps the comments of "promise\\n  .then((result) => result.value)\\n  // handle errors\\n  .catch((error) => console.error(error));" before their lookups', async () => {
			await expectPrettierFormat(
				`promise
  .then((result) => result.value)
  // handle errors
  .catch((error) => console.error(error));`,
				`promise
  .then((result) => result.value)
  // handle errors
  .catch((error) => console.error(error));
`,
			);
		});

		test('keeps the comments of "x = this\\n  // c\\n  .foo();" before their lookups', async () => {
			await expectPrettierFormat(
				`x = this
  // c
  .foo();`,
				`x = this
  // c
  .foo();
`,
			);
		});

		test('keeps the comments of "obj = {\\n  key: item\\n    // c\\n    .foo(),\\n};" before their lookups', async () => {
			await expectPrettierFormat(
				`obj = {
  key: item
    // c
    .foo(),
};`,
				`obj = {
  key: item
    // c
    .foo(),
};
`,
			);
		});

		test('keeps the comments of "function f() {\\n  return (\\n    this\\n      // c\\n      .foo()\\n  );\\n}" before their lookups', async () => {
			await expectPrettierFormat(
				`function f() {
  return (
    this
      // c
      .foo()
  );
}`,
				`function f() {
  return (
    this
      // c
      .foo()
  );
}
`,
			);
		});

		test('keeps the comments of "export default item\\n  // c\\n  .foo();" before their lookups', async () => {
			await expectPrettierFormat(
				`export default item
  // c
  .foo();`,
				`export default item
  // c
  .foo();
`,
			);
		});

		test('keeps the comments of "z.object({ a: 1 })\\n  // c\\n  .strict();" before their lookups', async () => {
			await expectPrettierFormat(
				`z.object({ a: 1 })
  // c
  .strict();`,
				`z.object({ a: 1 })
  // c
  .strict();
`,
			);
		});

		test('keeps the comments of "x = item // c\\n  .foo()\\n  .bar();" before their lookups', async () => {
			await expectPrettierFormat(
				`x = item // c
  .foo()
  .bar();`,
				`x = item // c
  .foo()
  .bar();
`,
			);
		});

		test('prints the comment of "x = item.\\n  // c\\n  foo();" before its lookup, like Prettier', async () => {
			await expectPrettierFormat(
				`x = item.
  // c
  foo();`,
				`x = item
  // c
  .foo();
`,
			);
		});

		test('prints the comment of "const x = item\\n  // why\\n  .foo;" before its lookup, like Prettier', async () => {
			await expectPrettierFormat(
				`const x = item
  // why
  .foo;`,
				`const x =
  // why
  item.foo;
`,
			);
		});

		test('prints the comment of "x = a[\\n  // c\\n  b\\n];" before its lookup, like Prettier', async () => {
			await expectPrettierFormat(
				`x = a[
  // c
  b
];`,
				`x =
  // c
  a[b];
`,
			);
		});

		test("prints the comment of \"wrapper.find('SomeSelector')\\n  // assert the prop\\n  .prop('children')(1);\" before its lookup, like Prettier", async () => {
			await expectPrettierFormat(
				`wrapper.find('SomeSelector')
  // assert the prop
  .prop('children')(1);`,
				`wrapper
  .find("SomeSelector")
  // assert the prop
  .prop("children")(1);
`,
			);
		});

		test('puts each call of a long chain on its own line in promise.then((result) => result.value).catch((error) => console.error(error)).finally(() => done());', async () => {
			await expectPrettierFormat(
				`promise.then((result) => result.value).catch((error) => console.error(error)).finally(() => done());`,
				`promise
  .then((result) => result.value)
  .catch((error) => console.error(error))
  .finally(() => done());
`,
			);
		});

		test('puts each call of a long chain on its own line in const names = users.filter((user) => user.isActive).map((user) => user.name).join(", ");', async () => {
			await expectPrettierFormat(
				`const names = users.filter((user) => user.isActive).map((user) => user.name).join(", ");`,
				`const names = users
  .filter((user) => user.isActive)
  .map((user) => user.name)
  .join(", ");
`,
			);
		});

		test('puts each call of a long chain on its own line in function load() {\n  return fetch(url).then((response) => response.json()).then((data) => data.items);\n}', async () => {
			await expectPrettierFormat(
				`function load() {
  return fetch(url).then((response) => response.json()).then((data) => data.items);
}`,
				`function load() {
  return fetch(url)
    .then((response) => response.json())
    .then((data) => data.items);
}
`,
			);
		});

		test('puts each call of a long chain on its own line in async function load() {\n  const data = await fetch(url).then((response) => response.json()).then((data) => data.items);\n}', async () => {
			await expectPrettierFormat(
				`async function load() {
  const data = await fetch(url).then((response) => response.json()).then((data) => data.items);
}`,
				`async function load() {
  const data = await fetch(url)
    .then((response) => response.json())
    .then((data) => data.items);
}
`,
			);
		});

		test('puts each call of a long chain on its own line in array.map((element) => element * 2).filter(Boolean)[0].toString().padStart(someWidth, "0");', async () => {
			await expectPrettierFormat(
				`array.map((element) => element * 2).filter(Boolean)[0].toString().padStart(someWidth, "0");`,
				`array
  .map((element) => element * 2)
  .filter(Boolean)[0]
  .toString()
  .padStart(someWidth, "0");
`,
			);
		});

		test('puts each call of a long chain on its own line in const handler = event.target.closest("[data-some-attribute]")?.getAttribute("data-some-attribute");', async () => {
			await expectPrettierFormat(
				`const handler = event.target.closest("[data-some-attribute]")?.getAttribute("data-some-attribute");`,
				`const handler = event.target
  .closest("[data-some-attribute]")
  ?.getAttribute("data-some-attribute");
`,
			);
		});

		test('keeps a factory or short head on the first line only where Prettier does in const schema = z.object({ name: z.string(), email: z.string().email(), age: z.number().int().positive() }).strict().optional();', async () => {
			await expectPrettierFormat(
				`const schema = z.object({ name: z.string(), email: z.string().email(), age: z.number().int().positive() }).strict().optional();`,
				`const schema = z
  .object({
    name: z.string(),
    email: z.string().email(),
    age: z.number().int().positive(),
  })
  .strict()
  .optional();
`,
			);
		});

		test('keeps a factory or short head on the first line only where Prettier does in const result = Object.keys(someObjectWithALongName).filter((key) => key.startsWith("a")).map((key) => key.toUpperCase());', async () => {
			await expectPrettierFormat(
				`const result = Object.keys(someObjectWithALongName).filter((key) => key.startsWith("a")).map((key) => key.toUpperCase());`,
				`const result = Object.keys(someObjectWithALongName)
  .filter((key) => key.startsWith("a"))
  .map((key) => key.toUpperCase());
`,
			);
		});

		test('keeps a factory or short head on the first line only where Prettier does in d3.scaleLinear().domain([0, 100]).range([0, width]).clamp(true).nice().ticks(someTickCount);', async () => {
			await expectPrettierFormat(
				`d3.scaleLinear().domain([0, 100]).range([0, width]).clamp(true).nice().ticks(someTickCount);`,
				`d3.scaleLinear()
  .domain([0, 100])
  .range([0, width])
  .clamp(true)
  .nice()
  .ticks(someTickCount);
`,
			);
		});

		test('keeps a factory or short head on the first line only where Prettier does in this.server.listen(port).on("error", (error) => handleTheError(error)).on("close", () => cleanup());', async () => {
			await expectPrettierFormat(
				`this.server.listen(port).on("error", (error) => handleTheError(error)).on("close", () => cleanup());`,
				`this.server
  .listen(port)
  .on("error", (error) => handleTheError(error))
  .on("close", () => cleanup());
`,
			);
		});

		test('keeps the head of a chain on the = line and breaks after = before a chain of lookups', async () => {
			await expectPrettierFormat(
				`const x = aaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccc().dddddddddddddddddd().eeeeeee();
const value = someObject.someMethod().someProperty.someOtherProperty.yetAnotherProperty;`,
				`const x = aaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbb
  .cccccccccccccccccc()
  .dddddddddddddddddd()
  .eeeeeee();
const value =
  someObject.someMethod().someProperty.someOtherProperty.yetAnotherProperty;
`,
			);
		});

		test('keeps test and require calls on a member out of the member chain', async () => {
			await expectPrettierFormat(
				`describe.only("does something really interesting with the value that it receives", () => {
  run();
});
const policy =
  require.resolve("./policies/a/very/long/path/to/some/module/decompressResponsePolicy.js");`,
				`describe.only("does something really interesting with the value that it receives", () => {
  run();
});
const policy =
  require.resolve("./policies/a/very/long/path/to/some/module/decompressResponsePolicy.js");
`,
			);
		});

		test('breaks at non-null lookups but not at non-null callees, like Prettier', async () => {
			await expectPrettierFormat(
				`foo.bar!(firstArgumentWithALongName).baz!(secondArgumentWithALongName).qux!(
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
x.y!.z();`,
				`foo.bar!(firstArgumentWithALongName).baz!(secondArgumentWithALongName).qux!(
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
x.y!.z();
`,
			);
		});

		test('keeps short chains and chains that break inside a call on one line', async () => {
			await expectPrettierFormat(
				`const x = a.b().c().d();
wrapper.find("SomeSelector").prop("children")(defaultValue).toBe(1);
object.foo.bar.baz.qux();
expect(
  screen.getByRole("button", { name: "Submit the form now please" }),
).toBeInTheDocument();`,
				`const x = a.b().c().d();
wrapper.find("SomeSelector").prop("children")(defaultValue).toBe(1);
object.foo.bar.baz.qux();
expect(
  screen.getByRole("button", { name: "Submit the form now please" }),
).toBeInTheDocument();
`,
			);
		});

		test('keeps each line comment of a chain after its own call', async () => {
			await expectPrettierFormat(
				`const b = value.replace(a, '-') // first
  .replace(b, '_') // second
  .replace(c, '');
const c = value // first
  .trim() // second
  .toLowerCase();`,
				`const b = value
  .replace(a, "-") // first
  .replace(b, "_") // second
  .replace(c, "");
const c = value // first
  .trim() // second
  .toLowerCase();
`,
			);
		});

		test('keeps a blank line and a trailing comment inside a chain', async () => {
			await expectPrettierFormat(
				`app
  .use(express.json())

  .use(cors());
item
  .foo() // trailing
  .bar()
  .baz();`,
				`app
  .use(express.json())

  .use(cors());
item
  .foo() // trailing
  .bar()
  .baz();
`,
			);
		});

		test('breaks a long chain of property lookups before its last lookup', async () => {
			await expectPrettierFormat(
				`foo(someObject.someProperty.someOtherProperty.yetAnotherProperty.finalProperty.last);`,
				`foo(
  someObject.someProperty.someOtherProperty.yetAnotherProperty.finalProperty
    .last,
);
`,
			);
		});
	});

	describe('unary operands with comments print in their own parentheses', () => {
		test('prints x = !/* c */ a; like Prettier', async () => {
			await expectPrettierFormat(
				`x = !/* c */ a;`,
				`x = !(/* c */ a);
`,
			);
		});

		test('prints x = !(a || b /* c */); like Prettier', async () => {
			await expectPrettierFormat(
				`x = !(a || b /* c */);`,
				`x = !(a || b /* c */);
`,
			);
		});

		test('prints x = typeof (/* c */ a + b); like Prettier', async () => {
			await expectPrettierFormat(
				`x = typeof (/* c */ a + b);`,
				`x = typeof (/* c */ a + b);
`,
			);
		});

		test('prints x = !(/* c */ a ? b : c); like Prettier', async () => {
			await expectPrettierFormat(
				`x = !(/* c */ a ? b : c);`,
				`x = !(/* c */ (a ? b : c));
`,
			);
		});

		test('prints x = -(/* c */ (a = b)); like Prettier', async () => {
			await expectPrettierFormat(
				`x = -(/* c */ (a = b));`,
				`x = -(/* c */ (a = b));
`,
			);
		});

		test('prints async function f() {\n  x = !/* c */ (await x);\n} like Prettier', async () => {
			await expectPrettierFormat(
				`async function f() {
  x = !/* c */ (await x);
}`,
				`async function f() {
  x = !(/* c */ (await x));
}
`,
			);
		});

		test('prints function* g() {\n  x = !(/* c */ yield y);\n} like Prettier', async () => {
			await expectPrettierFormat(
				`function* g() {
  x = !(/* c */ yield y);
}`,
				`function* g() {
  x = !(/* c */ (yield y));
}
`,
			);
		});

		test('keeps the comment inside the parentheses of "x = !(\\n  (\\n    ready ||\\n    waiting\\n  ) // why\\n);"', async () => {
			await expectPrettierFormat(
				`x = !(
  (
    ready ||
    waiting
  ) // why
);`,
				`x = !(
  ready || waiting // why
);
`,
			);
		});

		test('keeps the comment inside the parentheses of "x = -(\\n  a\\n  // c\\n);"', async () => {
			await expectPrettierFormat(
				`x = -(
  a
  // c
);`,
				`x = -(
  a
  // c
);
`,
			);
		});

		test('keeps the comment inside the parentheses of "a = [\\n  !(\\n    b\\n    // c\\n  ),\\n];"', async () => {
			await expectPrettierFormat(
				`a = [
  !(
    b
    // c
  ),
];`,
				`a = [
  !(
    b
    // c
  ),
];
`,
			);
		});

		test('keeps the comment inside the parentheses of "x = {\\n  a: !(\\n    b\\n    // c\\n  ),\\n};"', async () => {
			await expectPrettierFormat(
				`x = {
  a: !(
    b
    // c
  ),
};`,
				`x = {
  a: !(
    b
    // c
  ),
};
`,
			);
		});

		test('keeps the comment inside the parentheses of "foo(\\n  !(\\n    (\\n      ready ||\\n      waiting\\n    ) // why\\n  ),\\n);"', async () => {
			await expectPrettierFormat(
				`foo(
  !(
    (
      ready ||
      waiting
    ) // why
  ),
);`,
				`foo(
  !(
    ready || waiting // why
  ),
);
`,
			);
		});

		test('breaks the parentheses around a long commented operand', async () => {
			await expectPrettierFormat(
				`function f() {
  return !(
    (before >= 48 /* 0 */ && before <= 57) ||
    (before >= 65 /* A */ && before <= 90) ||
    before === 36 /* $ */ ||
    before === 95 /* _ */
  );
}`,
				`function f() {
  return !(
    (before >= 48 /* 0 */ && before <= 57) ||
    (before >= 65 /* A */ && before <= 90) ||
    before === 36 /* $ */ ||
    before === 95 /* _ */
  );
}
`,
			);
		});
	});

	describe('empty statement bodies keep their semicolon', () => {
		test('keeps the empty body of if (a);\ncount++;', async () => {
			await expectPrettierFormat(
				`if (a);
count++;`,
				`if (a);
count++;
`,
			);
		});

		test('keeps the empty body of while (next());\ncount++;', async () => {
			await expectPrettierFormat(
				`while (next());
count++;`,
				`while (next());
count++;
`,
			);
		});

		test('keeps the empty body of for (const k of list);\ncount++;', async () => {
			await expectPrettierFormat(
				`for (const k of list);
count++;`,
				`for (const k of list);
count++;
`,
			);
		});

		test('keeps the empty body of for (const k in obj);\ncount++;', async () => {
			await expectPrettierFormat(
				`for (const k in obj);
count++;`,
				`for (const k in obj);
count++;
`,
			);
		});

		test('keeps the empty body of for (;;);', async () => {
			await expectPrettierFormat(
				`for (;;);`,
				`for (;;);
`,
			);
		});

		test('keeps the empty body of for (let i = 0; i < n; i++);\ncount++;', async () => {
			await expectPrettierFormat(
				`for (let i = 0; i < n; i++);
count++;`,
				`for (let i = 0; i < n; i++);
count++;
`,
			);
		});

		test('keeps the empty body of do;\nwhile (next());', async () => {
			await expectPrettierFormat(
				`do;
while (next());`,
				`do;
while (next());
`,
			);
		});

		test('keeps the empty body of if (a) b();\nelse;', async () => {
			await expectPrettierFormat(
				`if (a) b();
else;`,
				`if (a) b();
else;
`,
			);
		});

		test('keeps the empty body of if (a);\nelse if (b);\nelse c();', async () => {
			await expectPrettierFormat(
				`if (a);
else if (b);
else c();`,
				`if (a);
else if (b);
else c();
`,
			);
		});

		test('keeps the empty body with semi: false', async () => {
			await expectPrettierFormat(
				`if (a);
count++
while (next());
do;
while (next())`,
				`if (a);
count++
while (next());
do;
while (next())
`,
				{ semi: false },
			);
		});

		test('puts while on its own line after a non-block do body', async () => {
			await expectPrettierFormat(
				`do count++; while (next());`,
				`do count++;
while (next());
`,
			);
		});

		test('keeps the comments of the empty body in "if (x) ; /* c */ else y();"', async () => {
			await expectPrettierFormat(
				`if (x) ; /* c */ else y();`,
				`if (x); /* c */
else y();
`,
			);
		});

		test('keeps the comments of the empty body in "do ; /* c */ while (x);"', async () => {
			await expectPrettierFormat(
				`do ; /* c */ while (x);`,
				`do; /* c */
while (x);
`,
			);
		});

		test('keeps the comments of the empty body in "while (x) ; /* c */"', async () => {
			await expectPrettierFormat(
				`while (x) ; /* c */`,
				`while (x); /* c */
`,
			);
		});

		test('keeps the comments of the empty body in "for (;;) ; /* c */"', async () => {
			await expectPrettierFormat(
				`for (;;) ; /* c */`,
				`for (;;); /* c */
`,
			);
		});

		test('keeps the comments of the empty body in "if (x) ; // c"', async () => {
			await expectPrettierFormat(
				`if (x) ; // c`,
				`if (x); // c
`,
			);
		});

		test('keeps the comments of the empty body in "if (x) /* c */ ;"', async () => {
			await expectPrettierFormat(
				`if (x) /* c */ ;`,
				`if (x) /* c */ ;
`,
			);
		});

		test('keeps the comments of the empty body in "for (;;) /* c */ ;"', async () => {
			await expectPrettierFormat(
				`for (;;) /* c */ ;`,
				`for (;;) /* c */ ;
`,
			);
		});

		test('keeps the comments of the empty body in "label: /* c */ ;"', async () => {
			await expectPrettierFormat(
				`label: /* c */ ;`,
				`label: /* c */ ;
`,
			);
		});
	});

	describe('unbraced bodies lay out like Prettier', () => {
		test('keeps "if (a) b();\\nelse c();" on one line', async () => {
			await expectPrettierFormat(
				`if (a) b();
else c();`,
				`if (a) b();
else c();
`,
			);
		});

		test('keeps "if (a) if (b) c();" on one line', async () => {
			await expectPrettierFormat(
				`if (a) if (b) c();`,
				`if (a) if (b) c();
`,
			);
		});

		test('keeps "if (a) b();\\nelse if (c) d();\\nelse e();" on one line', async () => {
			await expectPrettierFormat(
				`if (a) b();
else if (c) d();
else e();`,
				`if (a) b();
else if (c) d();
else e();
`,
			);
		});

		test('keeps "while (a) b();" on one line', async () => {
			await expectPrettierFormat(
				`while (a) b();`,
				`while (a) b();
`,
			);
		});

		test('keeps "for (const x of xs) b(x);" on one line', async () => {
			await expectPrettierFormat(
				`for (const x of xs) b(x);`,
				`for (const x of xs) b(x);
`,
			);
		});

		test('keeps "for (const k in obj) b(k);" on one line', async () => {
			await expectPrettierFormat(
				`for (const k in obj) b(k);`,
				`for (const k in obj) b(k);
`,
			);
		});

		test('keeps "for (let i = 0; i < n; i++) b(i);" on one line', async () => {
			await expectPrettierFormat(
				`for (let i = 0; i < n; i++) b(i);`,
				`for (let i = 0; i < n; i++) b(i);
`,
			);
		});

		test('keeps "do b();\\nwhile (a);" on one line', async () => {
			await expectPrettierFormat(
				`do b();
while (a);`,
				`do b();
while (a);
`,
			);
		});

		test('keeps "if (a) /* note */ b();" on one line', async () => {
			await expectPrettierFormat(
				`if (a) /* note */ b();`,
				`if (a) /* note */ b();
`,
			);
		});

		test('moves the body of "if (a) foo(() => { x(); });" to its own line when it breaks', async () => {
			await expectPrettierFormat(
				`if (a) foo(() => { x(); });`,
				`if (a)
  foo(() => {
    x();
  });
`,
			);
		});

		test('moves the body of "while (a) someVeryLongFunctionCallName(argument1, argument2, argument3, argument4, arg5);" to its own line when it breaks', async () => {
			await expectPrettierFormat(
				`while (a) someVeryLongFunctionCallName(argument1, argument2, argument3, argument4, arg5);`,
				`while (a)
  someVeryLongFunctionCallName(
    argument1,
    argument2,
    argument3,
    argument4,
    arg5,
  );
`,
			);
		});

		test('moves the body of "for (const item of items) process(function () { return item; });" to its own line when it breaks', async () => {
			await expectPrettierFormat(
				`for (const item of items) process(function () { return item; });`,
				`for (const item of items)
  process(function () {
    return item;
  });
`,
			);
		});

		test('moves the body of "if (a) b();\\nelse foo(() => { x(); });" to its own line when it breaks', async () => {
			await expectPrettierFormat(
				`if (a) b();
else foo(() => { x(); });`,
				`if (a) b();
else
  foo(() => {
    x();
  });
`,
			);
		});

		test('moves the body of "do foo(() => { x(); });\\nwhile (a);" to its own line when it breaks', async () => {
			await expectPrettierFormat(
				`do foo(() => { x(); });
while (a);`,
				`do
  foo(() => {
    x();
  });
while (a);
`,
			);
		});

		test('indents the body under a comment that starts it: "if (a) // note\\n  b();"', async () => {
			await expectPrettierFormat(
				`if (a) // note
  b();`,
				`if (a)
  // note
  b();
`,
			);
		});

		test('indents the body under a comment that starts it: "if (a)\\n  // note\\n  b();"', async () => {
			await expectPrettierFormat(
				`if (a)
  // note
  b();`,
				`if (a)
  // note
  b();
`,
			);
		});

		test('indents the body under a comment that starts it: "if (a)\\n  /* note */\\n  b();"', async () => {
			await expectPrettierFormat(
				`if (a)
  /* note */
  b();`,
				`if (a)
  /* note */
  b();
`,
			);
		});

		test('indents the body under a comment that starts it: "if (a) b();\\nelse // note\\n  c();"', async () => {
			await expectPrettierFormat(
				`if (a) b();
else // note
  c();`,
				`if (a) b();
else
  // note
  c();
`,
			);
		});

		test('indents the body under a comment that starts it: "while (a) // note\\n  b();"', async () => {
			await expectPrettierFormat(
				`while (a) // note
  b();`,
				`while (a)
  // note
  b();
`,
			);
		});

		test('indents the body under a comment that starts it: "for (const x of xs) // note\\n  b(x);"', async () => {
			await expectPrettierFormat(
				`for (const x of xs) // note
  b(x);`,
				`for (const x of xs)
  // note
  b(x);
`,
			);
		});

		test('indents the body under a comment that starts it: "if (a)\\n// note\\n{\\n  b();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a)
// note
{
  b();
}`,
				`if (a)
// note
{
  b();
}
`,
			);
		});

		test('indents the body under a comment that starts it: "if (a) // note\\n{\\n  b();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) // note
{
  b();
}`,
				`if (a) // note
{
  b();
}
`,
			);
		});
	});

	describe('comments in if, loop, and switch headers stay inside the parentheses', () => {
		test('keeps "if (/* note */ ready) run();"', async () => {
			await expectPrettierFormat(
				`if (/* note */ ready) run();`,
				`if (/* note */ ready) run();
`,
			);
		});

		test('keeps "if (ready /* note */) run();"', async () => {
			await expectPrettierFormat(
				`if (ready /* note */) run();`,
				`if (ready /* note */) run();
`,
			);
		});

		test('keeps "if (a /* one */ && /* two */ b) run();"', async () => {
			await expectPrettierFormat(
				`if (a /* one */ && /* two */ b) run();`,
				`if (a /* one */ && /* two */ b) run();
`,
			);
		});

		test('keeps "do {\\n  step();\\n} while (/* note */ ready);"', async () => {
			await expectPrettierFormat(
				`do {
  step();
} while (/* note */ ready);`,
				`do {
  step();
} while (/* note */ ready);
`,
			);
		});

		test('keeps "if (\\n  // note\\n  ready\\n) {\\n  run();\\n}"', async () => {
			await expectPrettierFormat(
				`if (
  // note
  ready
) {
  run();
}`,
				`if (
  // note
  ready
) {
  run();
}
`,
			);
		});

		test('keeps "switch (\\n  // note\\n  kind\\n) {\\n  case 1:\\n    break;\\n}"', async () => {
			await expectPrettierFormat(
				`switch (
  // note
  kind
) {
  case 1:
    break;
}`,
				`switch (
  // note
  kind
) {
  case 1:
    break;
}
`,
			);
		});

		test('keeps "while (\\n  // note\\n  ready\\n) {\\n  run();\\n}"', async () => {
			await expectPrettierFormat(
				`while (
  // note
  ready
) {
  run();
}`,
				`while (
  // note
  ready
) {
  run();
}
`,
			);
		});

		test('keeps "do {\\n  run();\\n} while (\\n  // note\\n  ready\\n);"', async () => {
			await expectPrettierFormat(
				`do {
  run();
} while (
  // note
  ready
);`,
				`do {
  run();
} while (
  // note
  ready
);
`,
			);
		});

		test('keeps the comment before the ) of "if (\\n  ready\\n  // why\\n) {\\n  run();\\n}" inside the parentheses', async () => {
			await expectPrettierFormat(
				`if (
  ready
  // why
) {
  run();
}`,
				`if (
  ready
  // why
) {
  run();
}
`,
			);
		});

		test('keeps the comment before the ) of "while (\\n  ready\\n  // why\\n) {\\n  run();\\n}" inside the parentheses', async () => {
			await expectPrettierFormat(
				`while (
  ready
  // why
) {
  run();
}`,
				`while (
  ready
  // why
) {
  run();
}
`,
			);
		});

		test('keeps the comment before the ) of "if (\\n  !(\\n    ready // why\\n  )\\n) {\\n  run();\\n}" inside the parentheses', async () => {
			await expectPrettierFormat(
				`if (
  !(
    ready // why
  )
) {
  run();
}`,
				`if (
  !(
    ready // why
  )
) {
  run();
}
`,
			);
		});

		test('keeps a comment after the parenthesized operand of a condition inside it', async () => {
			await expectPrettierFormat(
				`if (
  !(
    (
      ready ||
      waiting
    ) // why
  )
) {
  run();
}`,
				`if (!(
  ready || waiting // why
)) {
  run();
}
`,
			);
		});

		test('moves a comment between the keyword and ( inside the parentheses', async () => {
			await expectPrettierFormat(
				`if /* note */ (ready) run();`,
				`if (/* note */ ready) run();
`,
			);
		});

		test('keeps a comment after the header of "if (a) /* note */ b();" in the body', async () => {
			await expectPrettierFormat(
				`if (a) /* note */ b();`,
				`if (a) /* note */ b();
`,
			);
		});

		test('keeps a comment after the header of "if (x) /* note */ {\\n  y();\\n}" in the body', async () => {
			await expectPrettierFormat(
				`if (x) /* note */ {
  y();
}`,
				`if (x) /* note */ {
  y();
}
`,
			);
		});

		test('keeps a comment after the header of "while (x) /* note */ {\\n  y();\\n}" in the body', async () => {
			await expectPrettierFormat(
				`while (x) /* note */ {
  y();
}`,
				`while (x) /* note */ {
  y();
}
`,
			);
		});

		test('keeps a comment after the header of "for (const v of vs) /* note */ {\\n  y();\\n}" in the body', async () => {
			await expectPrettierFormat(
				`for (const v of vs) /* note */ {
  y();
}`,
				`for (const v of vs) /* note */ {
  y();
}
`,
			);
		});

		test('keeps a comment after the header of "try {\\n  x();\\n} catch (error) /* note */ {\\n  y();\\n}" in the body', async () => {
			await expectPrettierFormat(
				`try {
  x();
} catch (error) /* note */ {
  y();
}`,
				`try {
  x();
} catch (error) /* note */ {
  y();
}
`,
			);
		});

		test('keeps a comment inside the parentheses of the condition', async () => {
			await expectPrettierFormat(
				`if ((a) /* note */) b();`,
				`if (a /* note */) b();
`,
			);
		});

		test('keeps a comment after the ) of a do…while test after the statement', async () => {
			await expectPrettierFormat(
				`do x(); while (a) /* note */`,
				`do x();
while (a); /* note */
`,
			);
		});

		test('keeps a comment between a switch test and { inside the parentheses, like Prettier', async () => {
			await expectPrettierFormat(
				`switch (a) /* note */ {
  case 1:
    break;
}`,
				`switch (a /* note */) {
  case 1:
    break;
}
`,
			);
		});

		test('keeps a comment at the end of the line after a ; of a for header after it', async () => {
			await expectPrettierFormat(
				`for (let i = 0; // start
  i < 1; // bound
  i++) {}
for (let j = // c
  0; j < 1; j++) {}`,
				`for (
  let i = 0; // start
  i < 1; // bound
  i++
) {}
for (
  let j = 0; // c
  j < 1;
  j++
) {}
`,
			);
		});

		test('keeps "for (\\n  // c\\n  let i = 0;\\n  i < 1;\\n  i++\\n) {}"', async () => {
			await expectPrettierFormat(
				`for (
  // c
  let i = 0;
  i < 1;
  i++
) {}`,
				`for (
  // c
  let i = 0;
  i < 1;
  i++
) {}
`,
			);
		});

		test('keeps "for (\\n  let i = 0;\\n  // c\\n  i < 1;\\n  i++\\n) {}"', async () => {
			await expectPrettierFormat(
				`for (
  let i = 0;
  // c
  i < 1;
  i++
) {}`,
				`for (
  let i = 0;
  // c
  i < 1;
  i++
) {}
`,
			);
		});

		test('keeps "for (let i = 0; i < 1; i++)\\n  // c\\n  foo();"', async () => {
			await expectPrettierFormat(
				`for (let i = 0; i < 1; i++)
  // c
  foo();`,
				`for (let i = 0; i < 1; i++)
  // c
  foo();
`,
			);
		});
	});

	describe('comments before else stay before it', () => {
		test('keeps "if (a) {\\n  b();\\n} // c\\nelse {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
} // c
else {
  d();
}`,
				`if (a) {
  b();
} // c
else {
  d();
}
`,
			);
		});

		test('keeps "if (a) {\\n  b();\\n}\\n// c\\nelse {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
}
// c
else {
  d();
}`,
				`if (a) {
  b();
}
// c
else {
  d();
}
`,
			);
		});

		test('keeps "if (a) {\\n  b();\\n}\\n\\n// c\\nelse {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
}

// c
else {
  d();
}`,
				`if (a) {
  b();
}

// c
else {
  d();
}
`,
			);
		});

		test('keeps "if (a) {\\n  b();\\n} /* c */ else {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
} /* c */ else {
  d();
}`,
				`if (a) {
  b();
} /* c */ else {
  d();
}
`,
			);
		});

		test('keeps "if (a) b();\\n// c\\nelse d();"', async () => {
			await expectPrettierFormat(
				`if (a) b();
// c
else d();`,
				`if (a) b();
// c
else d();
`,
			);
		});

		test('keeps "if (a) b(); /* c */\\nelse d();"', async () => {
			await expectPrettierFormat(
				`if (a) b(); /* c */
else d();`,
				`if (a) b(); /* c */
else d();
`,
			);
		});

		test('keeps "if (a) {\\n  b();\\n} else if (c) {\\n  d();\\n}\\n// e\\nelse {\\n  f();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
} else if (c) {
  d();
}
// e
else {
  f();
}`,
				`if (a) {
  b();
} else if (c) {
  d();
}
// e
else {
  f();
}
`,
			);
		});

		test('keeps "if (a) {\\n  b();\\n} else /* c */ {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
} else /* c */ {
  d();
}`,
				`if (a) {
  b();
} else /* c */ {
  d();
}
`,
			);
		});

		test('formats "if (a) b(); // c\\nelse d();" like Prettier', async () => {
			await expectPrettierFormat(
				`if (a) b(); // c
else d();`,
				`if (a)
  b(); // c
else d();
`,
			);
		});

		test('formats "if (a) {\\n  b();\\n} /* c */\\nelse {\\n  d();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
} /* c */
else {
  d();
}`,
				`if (a) {
  b();
} /* c */
else {
  d();
}
`,
			);
		});
	});

	describe('comments between the blocks of a try statement', () => {
		test('formats "try {\\n  a();\\n}\\n// c\\ncatch (e) {\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
}
// c
catch (e) {
  b();
}`,
				`try {
  a();
} catch (e) {
  // c
  b();
}
`,
			);
		});

		test('formats "try {\\n  a();\\n} // c\\ncatch (e) {\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
} // c
catch (e) {
  b();
}`,
				`try {
  a();
} catch (e) {
  // c
  b();
}
`,
			);
		});

		test('formats "try {\\n  a();\\n}\\n// c\\n// d\\ncatch {\\n  ;b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
}
// c
// d
catch {
  ;b();
}`,
				`try {
  a();
} catch {
  // c
  // d
  b();
}
`,
			);
		});

		test('formats "try {\\n  a();\\n} // c\\ncatch {\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
} // c
catch {
}`,
				`try {
  a();
} catch {
  // c
}
`,
			);
		});

		test('formats "try {\\n  a();\\n} catch (e) {\\n  b();\\n} // c\\nfinally {\\n  d();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (e) {
  b();
} // c
finally {
  d();
}`,
				`try {
  a();
} catch (e) {
  b();
} finally {
  // c
  d();
}
`,
			);
		});

		test('formats "try {\\n  a();\\n}\\n// c\\nfinally {\\n  d();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
}
// c
finally {
  d();
}`,
				`try {
  a();
} finally {
  // c
  d();
}
`,
			);
		});

		test('formats "try // c\\n{\\n  a();\\n} catch {}" like Prettier', async () => {
			await expectPrettierFormat(
				`try // c
{
  a();
} catch {}`,
				`try {
  // c
  a();
} catch {}
`,
			);
		});

		test('formats "try\\n/* c */\\n{\\n  a();\\n} catch {}" like Prettier', async () => {
			await expectPrettierFormat(
				`try
/* c */
{
  a();
} catch {}`,
				`try {
  /* c */
  a();
} catch {}
`,
			);
		});

		test('formats "try {\\n  a();\\n} catch (e) // c\\n{\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (e) // c
{
  b();
}`,
				`try {
  a();
} catch (
  e // c
) {
  b();
}
`,
			);
		});

		test('formats "try {\\n  a();\\n} catch (e)\\n// c\\n{\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (e)
// c
{
  b();
}`,
				`try {
  a();
} catch (
  e
  // c
) {
  b();
}
`,
			);
		});

		test('formats "try {\\n  a();\\n} catch\\n// c\\n(e) {\\n  b();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch
// c
(e) {
  b();
}`,
				`try {
  a();
} catch (
  // c
  e
) {
  b();
}
`,
			);
		});

		test('keeps "try /* c */ {\\n  a();\\n} catch {}"', async () => {
			await expectPrettierFormat(
				`try /* c */ {
  a();
} catch {}`,
				`try /* c */ {
  a();
} catch {}
`,
			);
		});

		test('keeps "try {\\n  a();\\n} /* c */ catch (e) {\\n  b();\\n}"', async () => {
			await expectPrettierFormat(
				`try {
  a();
} /* c */ catch (e) {
  b();
}`,
				`try {
  a();
} /* c */ catch (e) {
  b();
}
`,
			);
		});

		test('keeps "try {\\n  a();\\n} catch (/* c */ e) {\\n  b();\\n}"', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (/* c */ e) {
  b();
}`,
				`try {
  a();
} catch (/* c */ e) {
  b();
}
`,
			);
		});

		test('keeps "try {\\n  a();\\n} catch (e /* c */) {\\n  b();\\n}"', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (e /* c */) {
  b();
}`,
				`try {
  a();
} catch (e /* c */) {
  b();
}
`,
			);
		});

		test('keeps "try {\\n  a();\\n} catch (e) {\\n  b();\\n} /* c */ finally {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (e) {
  b();
} /* c */ finally {
  d();
}`,
				`try {
  a();
} catch (e) {
  b();
} /* c */ finally {
  d();
}
`,
			);
		});

		test('keeps "try {\\n  a();\\n} finally /* c */ {\\n  d();\\n}"', async () => {
			await expectPrettierFormat(
				`try {
  a();
} finally /* c */ {
  d();
}`,
				`try {
  a();
} finally /* c */ {
  d();
}
`,
			);
		});

		test('keeps "try {\\n  a();\\n} catch (e) {\\n  b();\\n} // c"', async () => {
			await expectPrettierFormat(
				`try {
  a();
} catch (e) {
  b();
} // c`,
				`try {
  a();
} catch (e) {
  b();
} // c
`,
			);
		});
	});

	describe('comments in function bodies stay in the body', () => {
		test('keeps "function named() {\\n  check(value /* kept */);\\n}"', async () => {
			await expectPrettierFormat(
				`function named() {
  check(value /* kept */);
}`,
				`function named() {
  check(value /* kept */);
}
`,
			);
		});

		test('keeps "function withParams(a, b) {\\n  check(value /* kept */);\\n}"', async () => {
			await expectPrettierFormat(
				`function withParams(a, b) {
  check(value /* kept */);
}`,
				`function withParams(a, b) {
  check(value /* kept */);
}
`,
			);
		});

		test('keeps "const anonymous = function () {\\n  check(value /* kept */);\\n};"', async () => {
			await expectPrettierFormat(
				`const anonymous = function () {
  check(value /* kept */);
};`,
				`const anonymous = function () {
  check(value /* kept */);
};
`,
			);
		});

		test('keeps "const arrow = (a) => {\\n  check(value /* kept */);\\n};"', async () => {
			await expectPrettierFormat(
				`const arrow = (a) => {
  check(value /* kept */);
};`,
				`const arrow = (a) => {
  check(value /* kept */);
};
`,
			);
		});

		test('keeps "class A {\\n  method(a) {\\n    check(value /* kept */);\\n  }\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  method(a) {
    check(value /* kept */);
  }
}`,
				`class A {
  method(a) {
    check(value /* kept */);
  }
}
`,
			);
		});

		test('keeps "function generic<T>() {\\n  check(value /* kept */);\\n}"', async () => {
			await expectPrettierFormat(
				`function generic<T>() {
  check(value /* kept */);
}`,
				`function generic<T>() {
  check(value /* kept */);
}
`,
			);
		});

		test('keeps "function deep(a) {\\n  for (const x of xs) {\\n    if (x) {\\n      check(x /* kept */);\\n    }\\n  }\\n}"', async () => {
			await expectPrettierFormat(
				`function deep(a) {
  for (const x of xs) {
    if (x) {
      check(x /* kept */);
    }
  }
}`,
				`function deep(a) {
  for (const x of xs) {
    if (x) {
      check(x /* kept */);
    }
  }
}
`,
			);
		});

		test('keeps "function f(a /* param */) {}"', async () => {
			await expectPrettierFormat(
				`function f(a /* param */) {}`,
				`function f(a /* param */) {}
`,
			);
		});

		test('keeps "function f(a /* one */, b /* two */) {}"', async () => {
			await expectPrettierFormat(
				`function f(a /* one */, b /* two */) {}`,
				`function f(a /* one */, b /* two */) {}
`,
			);
		});

		test('keeps "function f(a: string /* typed */) {}"', async () => {
			await expectPrettierFormat(
				`function f(a: string /* typed */) {}`,
				`function f(a: string /* typed */) {}
`,
			);
		});

		test('keeps "function f(\\n  a, // first\\n  b, // second\\n) {}"', async () => {
			await expectPrettierFormat(
				`function f(
  a, // first
  b, // second
) {}`,
				`function f(
  a, // first
  b, // second
) {}
`,
			);
		});

		test('keeps body comments out of an unparenthesized arrow parameter with arrowParens: always', async () => {
			await expectPrettierFormat(
				`const f = x => check(value /* c */);`,
				`const f = (x) => check(value /* c */);
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`const f = x => {
  check(value /* c */);
};`,
				`const f = (x) => {
  check(value /* c */);
};
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`const f = async x => {
  check(value /* c */);
};`,
				`const f = async (x) => {
  check(value /* c */);
};
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`foo(x => check(value /* c */));`,
				`foo((x) => check(value /* c */));
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`const f = x =>
  check(
    value, // c
  );`,
				`const f = (x) =>
  check(
    value, // c
  );
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`const f = x => /* c */ x;`,
				`const f = (x) => /* c */ x;
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`const f = x =>
  // c
  x;`,
				`const f = (x) =>
  // c
  x;
`,
				{ arrowParens: 'always' },
			);
			await expectPrettierFormat(
				`const f = async x => {
  /* c */
};`,
				`const f = async (x) => {
  /* c */
};
`,
				{ arrowParens: 'always' },
			);
		});

		test('keeps body comments out of an unparenthesized arrow parameter with arrowParens: avoid', async () => {
			await expectPrettierFormat(
				`const f = x => check(value /* c */);`,
				`const f = x => check(value /* c */);
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`const f = x => {
  check(value /* c */);
};`,
				`const f = x => {
  check(value /* c */);
};
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`const f = async x => {
  check(value /* c */);
};`,
				`const f = async x => {
  check(value /* c */);
};
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`foo(x => check(value /* c */));`,
				`foo(x => check(value /* c */));
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`const f = x =>
  check(
    value, // c
  );`,
				`const f = x =>
  check(
    value, // c
  );
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`const f = x => /* c */ x;`,
				`const f = x => /* c */ x;
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`const f = x =>
  // c
  x;`,
				`const f = x =>
  // c
  x;
`,
				{ arrowParens: 'avoid' },
			);
			await expectPrettierFormat(
				`const f = async x => {
  /* c */
};`,
				`const f = async x => {
  /* c */
};
`,
				{ arrowParens: 'avoid' },
			);
		});

		test('keeps the parentheses of a parameter with a comment before =>', async () => {
			await expectPrettierFormat(
				`const f = x /* c */ => x;`,
				`const f = (x) /* c */ => x;
`,
				{ arrowParens: 'avoid' },
			);
		});

		test('rejects "const f = (a) // c\\n  => a;", which has a line break before =>', async () => {
			await expect(
				format(`const f = (a) // c
  => a;`),
			).rejects.toThrow('Unexpected token');
		});

		test('rejects "const f = () // c\\n  => a;", which has a line break before =>', async () => {
			await expect(
				format(`const f = () // c
  => a;`),
			).rejects.toThrow('Unexpected token');
		});

		test('rejects "const f = (a) /* c\\n */ => a;", which has a line break before =>', async () => {
			await expect(
				format(`const f = (a) /* c
 */ => a;`),
			).rejects.toThrow('Unexpected token');
		});

		test('keeps the comment of "foo(/* none */);" where it is, like Prettier', async () => {
			await expectPrettierFormat(
				`foo(/* none */);`,
				`foo(/* none */);
`,
			);
		});

		test('keeps the comment of "new Foo(/* none */);" where it is, like Prettier', async () => {
			await expectPrettierFormat(
				`new Foo(/* none */);`,
				`new Foo(/* none */);
`,
			);
		});

		test('keeps the comment of "foo(\\n  // none\\n);" where it is, like Prettier', async () => {
			await expectPrettierFormat(
				`foo(
  // none
);`,
				`foo(
  // none
);
`,
			);
		});

		test('keeps the comment of "foo /* callee */();" where it is, like Prettier', async () => {
			await expectPrettierFormat(
				`foo /* callee */();`,
				`foo /* callee */();
`,
			);
		});

		test('keeps the comment of "foo(a, b /* last */);" where it is, like Prettier', async () => {
			await expectPrettierFormat(
				`foo(a, b /* last */);`,
				`foo(a, b /* last */);
`,
			);
		});
	});

	describe('comments after declaration names', () => {
		test('keeps "function f /* note */() {}"', async () => {
			await expectPrettierFormat(
				`function f /* note */() {}`,
				`function f /* note */() {}
`,
			);
		});

		test('keeps "const g = function h /* note */() {};"', async () => {
			await expectPrettierFormat(
				`const g = function h /* note */() {};`,
				`const g = function h /* note */() {};
`,
			);
		});

		test('keeps "function /* note */ f() {}"', async () => {
			await expectPrettierFormat(
				`function /* note */ f() {}`,
				`function /* note */ f() {}
`,
			);
		});

		test('keeps "declare function f /* note */(): void;"', async () => {
			await expectPrettierFormat(
				`declare function f /* note */(): void;`,
				`declare function f /* note */(): void;
`,
			);
		});

		test('keeps "class C /* note */ extends B {}"', async () => {
			await expectPrettierFormat(
				`class C /* note */ extends B {}`,
				`class C /* note */ extends B {}
`,
			);
		});

		test('keeps "class C /* note */ {}"', async () => {
			await expectPrettierFormat(
				`class C /* note */ {}`,
				`class C /* note */ {}
`,
			);
		});

		test('keeps "abstract class C /* note */ {}"', async () => {
			await expectPrettierFormat(
				`abstract class C /* note */ {}`,
				`abstract class C /* note */ {}
`,
			);
		});

		test('keeps "const e = class C /* note */ {};"', async () => {
			await expectPrettierFormat(
				`const e = class C /* note */ {};`,
				`const e = class C /* note */ {};
`,
			);
		});

		test('keeps "class /* note */ C {}"', async () => {
			await expectPrettierFormat(
				`class /* note */ C {}`,
				`class /* note */ C {}
`,
			);
		});

		test('keeps "enum E /* note */ {\\n  A,\\n}"', async () => {
			await expectPrettierFormat(
				`enum E /* note */ {
  A,
}`,
				`enum E /* note */ {
  A,
}
`,
			);
		});

		test('keeps "enum E {\\n  A /* note */ = 1,\\n  B,\\n}"', async () => {
			await expectPrettierFormat(
				`enum E {
  A /* note */ = 1,
  B,
}`,
				`enum E {
  A /* note */ = 1,
  B,
}
`,
			);
		});

		test('keeps "interface I /* note */ {\\n  a: 1;\\n}"', async () => {
			await expectPrettierFormat(
				`interface I /* note */ {
  a: 1;
}`,
				`interface I /* note */ {
  a: 1;
}
`,
			);
		});

		test('keeps "interface I /* note */ extends J {\\n  a: 1;\\n}"', async () => {
			await expectPrettierFormat(
				`interface I /* note */ extends J {
  a: 1;
}`,
				`interface I /* note */ extends J {
  a: 1;
}
`,
			);
		});

		test('keeps "interface /* note */ I {\\n  a: 1;\\n}"', async () => {
			await expectPrettierFormat(
				`interface /* note */ I {
  a: 1;
}`,
				`interface /* note */ I {
  a: 1;
}
`,
			);
		});

		test('keeps "type T /* note */ = { a: 1 };"', async () => {
			await expectPrettierFormat(
				`type T /* note */ = { a: 1 };`,
				`type T /* note */ = { a: 1 };
`,
			);
		});

		test('keeps "type T<U> /* note */ = { a: U };"', async () => {
			await expectPrettierFormat(
				`type T<U> /* note */ = { a: U };`,
				`type T<U> /* note */ = { a: U };
`,
			);
		});

		test('moves a comment between a function name and ( against the (, like Prettier', async () => {
			await expectPrettierFormat(
				`function f /* note */ (a) {}`,
				`function f /* note */(a) {}
`,
			);
		});
	});

	describe('comments before the colon of a type annotation', () => {
		test('keeps "let x /* c */ : T = 1;"', async () => {
			await expectPrettierFormat(
				`let x /* c */ : T = 1;`,
				`let x /* c */ : T = 1;
`,
			);
		});

		test('keeps "function f(a /* c */ : T) {}"', async () => {
			await expectPrettierFormat(
				`function f(a /* c */ : T) {}`,
				`function f(a /* c */ : T) {}
`,
			);
		});

		test('keeps "function f(a) /* c */ : T {}"', async () => {
			await expectPrettierFormat(
				`function f(a) /* c */ : T {}`,
				`function f(a) /* c */ : T {}
`,
			);
		});

		test('keeps "const f = (a) /* c */ : T => a;"', async () => {
			await expectPrettierFormat(
				`const f = (a) /* c */ : T => a;`,
				`const f = (a) /* c */ : T => a;
`,
			);
		});

		test('keeps "const f = <T,>(a: T) /* c */ : T => a;"', async () => {
			await expectPrettierFormat(
				`const f = <T,>(a: T) /* c */ : T => a;`,
				`const f = <T,>(a: T) /* c */ : T => a;
`,
			);
		});

		test('keeps "const f = function (a) /* c */ : T {};"', async () => {
			await expectPrettierFormat(
				`const f = function (a) /* c */ : T {};`,
				`const f = function (a) /* c */ : T {};
`,
			);
		});

		test('keeps "class A {\\n  m() /* c */ : T {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m() /* c */ : T {}
}`,
				`class A {
  m() /* c */ : T {}
}
`,
			);
		});

		test('keeps "const o = { m() /* c */ : T {} };"', async () => {
			await expectPrettierFormat(
				`const o = { m() /* c */ : T {} };`,
				`const o = { m() /* c */ : T {} };
`,
			);
		});

		test('keeps "interface I {\\n  m() /* c */ : T;\\n}"', async () => {
			await expectPrettierFormat(
				`interface I {
  m() /* c */ : T;
}`,
				`interface I {
  m() /* c */ : T;
}
`,
			);
		});

		test('keeps "declare function f() /* c */ : T;"', async () => {
			await expectPrettierFormat(
				`declare function f() /* c */ : T;`,
				`declare function f() /* c */ : T;
`,
			);
		});

		test('keeps "type F = (a /* c */ : T) => void;"', async () => {
			await expectPrettierFormat(
				`type F = (a /* c */ : T) => void;`,
				`type F = (a /* c */ : T) => void;
`,
			);
		});

		test('keeps "function f(a? /* c */ : T) {}"', async () => {
			await expectPrettierFormat(
				`function f(a? /* c */ : T) {}`,
				`function f(a? /* c */ : T) {}
`,
			);
		});

		test('keeps "function f(a) /* c */ : asserts a is T {}"', async () => {
			await expectPrettierFormat(
				`function f(a) /* c */ : asserts a is T {}`,
				`function f(a) /* c */ : asserts a is T {}
`,
			);
		});

		test('keeps "class A {\\n  constructor(private a /* c */ : T) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(private a /* c */ : T) {}
}`,
				`class A {
  constructor(private a /* c */ : T) {}
}
`,
			);
		});

		test('keeps "const { a } /* c */ : T = o;"', async () => {
			await expectPrettierFormat(
				`const { a } /* c */ : T = o;`,
				`const { a } /* c */ : T = o;
`,
			);
		});

		test('keeps "function f({ a } /* c */ : T) {}"', async () => {
			await expectPrettierFormat(
				`function f({ a } /* c */ : T) {}`,
				`function f({ a } /* c */ : T) {}
`,
			);
		});

		test('keeps "const [a] /* c */ : T = o;"', async () => {
			await expectPrettierFormat(
				`const [a] /* c */ : T = o;`,
				`const [a] /* c */ : T = o;
`,
			);
		});

		test('keeps "let x: /* c */ T = 1;"', async () => {
			await expectPrettierFormat(
				`let x: /* c */ T = 1;`,
				`let x: /* c */ T = 1;
`,
			);
		});

		test('keeps "function f(a): /* c */ T {}"', async () => {
			await expectPrettierFormat(
				`function f(a): /* c */ T {}`,
				`function f(a): /* c */ T {}
`,
			);
		});

		test('keeps "const { a /* c */ }: T = o;"', async () => {
			await expectPrettierFormat(
				`const { a /* c */ }: T = o;`,
				`const { a /* c */ }: T = o;
`,
			);
		});

		test('keeps "interface I {\\n  x /* c */: T;\\n}"', async () => {
			await expectPrettierFormat(
				`interface I {
  x /* c */: T;
}`,
				`interface I {
  x /* c */: T;
}
`,
			);
		});

		test('keeps a line comment before the colon on its line, like Prettier', async () => {
			await expectPrettierFormat(
				`let x // c
  : T = 1;`,
				`let x // c
: T = 1;
`,
			);
		});

		test('keeps "class A {\\n  x /* c */ : T;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  x /* c */ : T;
}`,
				`class A {
  x /* c */ : T;
}
`,
			);
		});

		test('keeps "function f(...x /* c */ : T) {}"', async () => {
			await expectPrettierFormat(
				`function f(...x /* c */ : T) {}`,
				`function f(...x /* c */ : T) {}
`,
			);
		});

		test('keeps "type F = (a: T) /* c */ => void;"', async () => {
			await expectPrettierFormat(
				`type F = (a: T) /* c */ => void;`,
				`type F = (a: T) /* c */ => void;
`,
			);
		});

		test('keeps "type G = new (a: T) /* c */ => void;"', async () => {
			await expectPrettierFormat(
				`type G = new (a: T) /* c */ => void;`,
				`type G = new (a: T) /* c */ => void;
`,
			);
		});

		test('keeps "interface I {\\n  (a: T) /* c */ : void;\\n  new (a: T) /* c */ : X;\\n  m(a: T) /* c */ : void;\\n}"', async () => {
			await expectPrettierFormat(
				`interface I {
  (a: T) /* c */ : void;
  new (a: T) /* c */ : X;
  m(a: T) /* c */ : void;
}`,
				`interface I {
  (a: T) /* c */ : void;
  new (a: T) /* c */ : X;
  m(a: T) /* c */ : void;
}
`,
			);
		});

		test('keeps "declare function f(a: T) /* c */ : void;"', async () => {
			await expectPrettierFormat(
				`declare function f(a: T) /* c */ : void;`,
				`declare function f(a: T) /* c */ : void;
`,
			);
		});

		test('keeps the comment of "const [a, ...rest /* c */] = y;" before its closing bracket or colon', async () => {
			await expectPrettierFormat(
				`const [a, ...rest /* c */] = y;`,
				`const [a, ...rest /* c */] = y;
`,
			);
		});

		test('keeps the comment of "type F = (a: T /* c */) => void;" before its closing bracket or colon', async () => {
			await expectPrettierFormat(
				`type F = (a: T /* c */) => void;`,
				`type F = (a: T /* c */) => void;
`,
			);
		});

		test('keeps the comment of "interface I {\\n  x /* c */: T;\\n}" before its closing bracket or colon', async () => {
			await expectPrettierFormat(
				`interface I {
  x /* c */: T;
}`,
				`interface I {
  x /* c */: T;
}
`,
			);
		});

		test('moves the comment at the end of the line in "function f(a) // c\\n  : T {}" before the return type', async () => {
			await expectPrettierFormat(
				`function f(a) // c
  : T {}`,
				`function f(
  a, // c
): T {}
`,
			);
		});

		test('moves the comment at the end of the line in "const f = (a) // c\\n  : T => a;" before the return type', async () => {
			await expectPrettierFormat(
				`const f = (a) // c
  : T => a;`,
				`const f = (
  a, // c
): T => a;
`,
			);
		});

		test('moves the comment at the end of the line in "class A {\\n  m(a) // c\\n  : T {}\\n}" before the return type', async () => {
			await expectPrettierFormat(
				`class A {
  m(a) // c
  : T {}
}`,
				`class A {
  m(
    a, // c
  ): T {}
}
`,
			);
		});

		test('moves the comment at the end of the line in "function f() // c\\n  : T {}" before the return type', async () => {
			await expectPrettierFormat(
				`function f() // c
  : T {}`,
				`function f(): T {} // c
`,
			);
		});

		test('moves the comment at the end of the line in "function f(a) /* c */\\n  : T {}" before the return type', async () => {
			await expectPrettierFormat(
				`function f(a) /* c */
  : T {}`,
				`function f(a /* c */): T {}
`,
			);
		});

		test('moves the comment at the end of the line in "type F = (a: T) // c\\n  => void;" before the return type', async () => {
			await expectPrettierFormat(
				`type F = (a: T) // c
  => void;`,
				`type F = (
  a: T, // c
) => void;
`,
			);
		});

		test('keeps the comments after the last parameter of a function type before the )', async () => {
			await expectPrettierFormat(
				`type F = (a: T) /* c */ // d
  => void;`,
				`type F = (
  a: T /* c */, // d
) => void;
`,
			);
			await expectPrettierFormat(
				`type F = (
  a: T /* c */, // d
) => void;`,
				`type F = (
  a: T /* c */, // d
) => void;
`,
			);
		});
	});

	describe('block comments on their own line before a type after a keyword or colon', () => {
		test('keeps "let x: keyof /* c */\\nVeryLongTypeNameThatKeepsGoingAndGoingAndGoingAndGoingAndGoingAndGoingAndGoing;" like Prettier', async () => {
			await expectPrettierFormat(
				`let x: keyof /* c */
VeryLongTypeNameThatKeepsGoingAndGoingAndGoingAndGoingAndGoingAndGoingAndGoing;`,
				`let x: keyof /* c */
VeryLongTypeNameThatKeepsGoingAndGoingAndGoingAndGoingAndGoingAndGoingAndGoing;
`,
			);
		});

		test('keeps "type X = keyof /* c */\\n\\nT;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X = keyof /* c */

T;`,
				`type X = keyof /* c */

T;
`,
			);
		});

		test('keeps "type X = keyof // c\\nT;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X = keyof // c
T;`,
				`type X = keyof // c
T;
`,
			);
		});

		test('keeps "type X = keyof /* c */ T;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X = keyof /* c */ T;`,
				`type X = keyof /* c */ T;
`,
			);
		});

		test('keeps "type X =\\n  /* c */\\n  T;" like Prettier', async () => {
			await expectPrettierFormat(
				`type X =
  /* c */
  T;`,
				`type X =
  /* c */
  T;
`,
			);
		});

		test('keeps "type T = A &\\n  /* c */\\n  B;" like Prettier', async () => {
			await expectPrettierFormat(
				`type T = A &
  /* c */
  B;`,
				`type T = A &
  /* c */
  B;
`,
			);
		});
	});

	describe('block comments on their own line before an expression after a keyword or operator', () => {
		test('keeps "const x = {\\n  .../* c */\\n  a,\\n};" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = {
  .../* c */
  a,
};`,
				`const x = {
  .../* c */
  a,
};
`,
			);
		});

		test('keeps "const x = {\\n  b,\\n  .../* c */\\n  a,\\n};" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = {
  b,
  .../* c */
  a,
};`,
				`const x = {
  b,
  .../* c */
  a,
};
`,
			);
		});

		test('keeps "const x = new /* c */\\nFoo(\\n  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,\\n  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,\\n  ccccccccccccc,\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = new /* c */
Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccc,
);`,
				`const x = new /* c */
Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccc,
);
`,
			);
		});

		test('keeps "const x = new // c\\nFoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = new // c
Foo();`,
				`const x = new // c
Foo();
`,
			);
		});

		test('keeps "const x = a ? (\\n  /* c */\\n  <div />\\n) : null;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = a ? (
  /* c */
  <div />
) : null;`,
				`const x = a ? (
  /* c */
  <div />
) : null;
`,
			);
		});

		test('keeps "const x = a ? (\\n  <div />\\n) : (\\n  /* c */\\n  foo()\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = a ? (
  <div />
) : (
  /* c */
  foo()
);`,
				`const x = a ? (
  <div />
) : (
  /* c */
  foo()
);
`,
			);
		});

		test('keeps "const x = a ? (\\n  /* c */\\n  b\\n) : (\\n  <div />\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = a ? (
  /* c */
  b
) : (
  <div />
);`,
				`const x = a ? (
  /* c */
  b
) : (
  <div />
);
`,
			);
		});
	});

	describe('comments in class and interface headings', () => {
		test('moves the comment of "class A extends B // extends B\\n{\\n  x = 1;\\n}\\ninterface I extends J // extends J\\n{\\n  x: 1;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends B // extends B
{
  x = 1;
}
interface I extends J // extends J
{
  x: 1;
}`,
				`class A extends B {
  // extends B
  x = 1;
}
interface I extends J {
  // extends J
  x: 1;
}
`,
			);
		});

		test('moves the comment of "class A extends B\\n// c\\n{\\n  x = 1;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends B
// c
{
  x = 1;
}`,
				`class A extends B {
  // c
  x = 1;
}
`,
			);
		});

		test('moves the comment of "class A\\n// c\\n{}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A
// c
{}`,
				`class A {
  // c
}
`,
			);
		});

		test('moves the comment of "interface I\\n// c\\n{}" like Prettier', async () => {
			await expectPrettierFormat(
				`interface I
// c
{}`,
				`interface I {
  // c
}
`,
			);
		});

		test('moves the comment of "export class A extends B // c\\n{}" like Prettier', async () => {
			await expectPrettierFormat(
				`export class A extends B // c
{}`,
				`export class A extends B {
  // c
}
`,
			);
		});

		test('moves the comment of "export default class extends B // c\\n{}" like Prettier', async () => {
			await expectPrettierFormat(
				`export default class extends B // c
{}`,
				`export default class extends B {
  // c
}
`,
			);
		});

		test('moves the comment of "const X = class extends B // c\\n{\\n  y() {}\\n};" like Prettier', async () => {
			await expectPrettierFormat(
				`const X = class extends B // c
{
  y() {}
};`,
				`const X = class extends B {
  // c
  y() {}
};
`,
			);
		});

		test('moves the comment of "class A extends B // one\\n// two\\n{\\n  x = 1;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends B // one
// two
{
  x = 1;
}`,
				`class A extends B {
  // one
  // two
  x = 1;
}
`,
			);
		});

		test('moves the comment of "@dec\\nclass A extends B // c\\n{}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec
class A extends B // c
{}`,
				`@dec // c
class A extends B {}
`,
			);
		});

		test('keeps the comment of "class A extends B /* c */ {}" where it is', async () => {
			await expectPrettierFormat(
				`class A extends B /* c */ {}`,
				`class A extends B /* c */ {}
`,
			);
		});

		test('keeps the comment of "class A /* c */ extends B {}" where it is', async () => {
			await expectPrettierFormat(
				`class A /* c */ extends B {}`,
				`class A /* c */ extends B {}
`,
			);
		});

		test('keeps the comment of "@dec\\nclass A /* c */ extends B {}" where it is', async () => {
			await expectPrettierFormat(
				`@dec
class A /* c */ extends B {}`,
				`@dec
class A /* c */ extends B {}
`,
			);
		});

		test('keeps the comment of "@dec\\n// c\\nclass A extends B {}" where it is', async () => {
			await expectPrettierFormat(
				`@dec
// c
class A extends B {}`,
				`@dec
// c
class A extends B {}
`,
			);
		});

		test('keeps the comment of "class A extends B {\\n  // c\\n}" where it is', async () => {
			await expectPrettierFormat(
				`class A extends B {
  // c
}`,
				`class A extends B {
  // c
}
`,
			);
		});

		test('keeps the comment of "class A implements B /* c */, C {}" where it is', async () => {
			await expectPrettierFormat(
				`class A implements B /* c */, C {}`,
				`class A implements B /* c */, C {}
`,
			);
		});

		test('prints the comment of the superclass in "class A extends (/* c */ a || b) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends (/* c */ a || b) {}`,
				`class A extends /* c */ (a || b) {}
`,
			);
		});

		test('prints the comment of the superclass in "class D extends (a || b /* c */) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class D extends (a || b /* c */) {}`,
				`class D extends (a || b) /* c */ {}
`,
			);
		});

		test('prints the comment of the superclass in "class J extends (/* c */ a || b)<T> {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class J extends (/* c */ a || b)<T> {}`,
				`class J extends /* c */ (a || b)<T> {}
`,
			);
		});

		test('prints the comment of the superclass in "class J extends (a || b /* c */)<T> {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class J extends (a || b /* c */)<T> {}`,
				`class J extends (a || b)<T> /* c */ {}
`,
			);
		});

		test('prints the comment of the superclass in "class L extends (/* c */ a || b) implements X {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class L extends (/* c */ a || b) implements X {}`,
				`class L extends /* c */ (a || b) implements X {}
`,
			);
		});

		test('prints the comment of the superclass in "x = class extends (/* c */ a || b) {};" like Prettier', async () => {
			await expectPrettierFormat(
				`x = class extends (/* c */ a || b) {};`,
				`x = class extends /* c */ (a || b) {};
`,
			);
		});

		test('prints the comment of the superclass in "class A extends (/* c */ (/* d */ a || b)) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends (/* c */ (/* d */ a || b)) {}`,
				`class A extends /* c */ /* d */ (a || b) {}
`,
			);
		});

		test('prints the comment of the superclass in "class K extends (/* c */ @dec class {}) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class K extends (/* c */ @dec class {}) {}`,
				`class K
  extends /* c */ (
    @dec
    class {}
  ) {}
`,
			);
		});

		test('prints the comment of the superclass in "x = class extends /* c */ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc {};" like Prettier', async () => {
			await expectPrettierFormat(
				`x = class extends /* c */ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc {};`,
				`x = class
  extends /* c */ (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      .bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc
  ) {};
`,
			);
		});

		test('prints the comment of the superclass in "x = class extends aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc /* c */ {};" like Prettier', async () => {
			await expectPrettierFormat(
				`x = class extends aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc /* c */ {};`,
				`x = class extends (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    .bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.cccccccc
) /* c */ {};
`,
			);
		});

		test('prints the comment of the superclass in "class A extends (/* prettier-ignore */ a   ||   b) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends (/* prettier-ignore */ a   ||   b) {}`,
				`class A extends /* prettier-ignore */ (a   ||   b) {}
`,
			);
		});

		test('keeps the comment of the superclass in "class B extends /* c */ (a || b) {}"', async () => {
			await expectPrettierFormat(
				`class B extends /* c */ (a || b) {}`,
				`class B extends /* c */ (a || b) {}
`,
			);
		});

		test('keeps the comment of the superclass in "class G extends (a || b) /* c */ {}"', async () => {
			await expectPrettierFormat(
				`class G extends (a || b) /* c */ {}`,
				`class G extends (a || b) /* c */ {}
`,
			);
		});

		test('keeps the comment of the superclass in "class L extends (a || b) /* c */ implements X {}"', async () => {
			await expectPrettierFormat(
				`class L extends (a || b) /* c */ implements X {}`,
				`class L extends (a || b) /* c */ implements X {}
`,
			);
		});

		test('keeps the comment of the superclass in "class E extends /* c */ a {}"', async () => {
			await expectPrettierFormat(
				`class E extends /* c */ a {}`,
				`class E extends /* c */ a {}
`,
			);
		});

		test('keeps the comment of the superclass in "class F extends a /* c */ {}"', async () => {
			await expectPrettierFormat(
				`class F extends a /* c */ {}`,
				`class F extends a /* c */ {}
`,
			);
		});

		test('keeps the comment of the superclass in "class H\\n  // c\\n  extends (a || b) {}"', async () => {
			await expectPrettierFormat(
				`class H
  // c
  extends (a || b) {}`,
				`class H
  // c
  extends (a || b) {}
`,
			);
		});

		test('moves the line comment after the superclass in "class A extends B<T> // c\\n{}" into the body', async () => {
			await expectPrettierFormat(
				`class A extends B<T> // c
{}`,
				`class A extends B<T> {
  // c
}
`,
			);
		});

		test('moves the line comment after the superclass in "class A extends (B) // c\\n{\\n  x = 1;\\n}" into the body', async () => {
			await expectPrettierFormat(
				`class A extends (B) // c
{
  x = 1;
}`,
				`class A extends B {
  // c
  x = 1;
}
`,
			);
		});

		test('moves the comment of "class C implements\\n  // the interfaces\\n  D, E {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class C implements
  // the interfaces
  D, E {}`,
				`class C
  // the interfaces
  implements D, E {}
`,
			);
		});

		test('moves the comment of "class C implements\\n  // the interface\\n  D {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class C implements
  // the interface
  D {}`,
				`class C
  // the interface
  implements D {}
`,
			);
		});

		test('moves the comment of "class A extends B // c\\n  implements C {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class A extends B // c
  implements C {}`,
				`class A
  extends B // c
  implements C {}
`,
			);
		});

		test('moves the comment of "class A extends B<T>\\n  // c\\n  implements C {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class A extends B<T>
  // c
  implements C {}`,
				`class A
  extends B<T>
  // c
  implements C {}
`,
			);
		});

		test('moves the comment of "interface I extends\\n  // c\\n  J, K {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`interface I extends
  // c
  J, K {}`,
				`interface I
  // c
  extends J, K {}
`,
			);
		});

		test('keeps the comment of "class A\\n  // c\\n  extends B {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class A
  // c
  extends B {}`,
				`class A
  // c
  extends B {}
`,
			);
		});

		test('keeps the comment of "class A<T>\\n  // c\\n  extends B {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class A<T>
  // c
  extends B {}`,
				`class A<T>
  // c
  extends B {}
`,
			);
		});

		test('keeps the comment of "class A // c\\n  extends B {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`class A // c
  extends B {}`,
				`class A // c
  extends B {}
`,
			);
		});

		test('keeps the comment of "interface I\\n  // c\\n  extends J {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`interface I
  // c
  extends J {}`,
				`interface I
  // c
  extends J {}
`,
			);
		});

		test('keeps the comment of "interface I<T> // c\\n  extends J {}" before the heritage clause', async () => {
			await expectPrettierFormat(
				`interface I<T> // c
  extends J {}`,
				`interface I<T> // c
  extends J {}
`,
			);
		});

		test('keeps the comment of "const X = class\\n  // c\\n  implements D, E {};" before the heritage clause', async () => {
			await expectPrettierFormat(
				`const X = class
  // c
  implements D, E {};`,
				`const X = class
  // c
  implements D, E {};
`,
			);
		});

		test('keeps the comment of "const X = class\\n  /* c */\\n  implements D, E {};" before the heritage clause', async () => {
			await expectPrettierFormat(
				`const X = class
  /* c */
  implements D, E {};`,
				`const X = class
  /* c */
  implements D, E {};
`,
			);
		});

		test('keeps the comment of "const X = class\\n  // c\\n  // d\\n  implements D, E\\n{\\n  x = 1;\\n};" before the heritage clause', async () => {
			await expectPrettierFormat(
				`const X = class
  // c
  // d
  implements D, E
{
  x = 1;
};`,
				`const X = class
  // c
  // d
  implements D, E
{
  x = 1;
};
`,
			);
		});

		test('keeps the comment of "const X = class\\n  // c\\n  implements\\n    VeryLongInterfaceNameNumberOne,\\n    VeryLongInterfaceNameNumberTwo,\\n    VeryLongInterfaceNameNumberThree {};" before the heritage clause', async () => {
			await expectPrettierFormat(
				`const X = class
  // c
  implements
    VeryLongInterfaceNameNumberOne,
    VeryLongInterfaceNameNumberTwo,
    VeryLongInterfaceNameNumberThree {};`,
				`const X = class
  // c
  implements
    VeryLongInterfaceNameNumberOne,
    VeryLongInterfaceNameNumberTwo,
    VeryLongInterfaceNameNumberThree {};
`,
			);
		});
	});

	describe('comments between the decorators of an exported class and the class keyword', () => {
		test('formats "@dec export /* c */ class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec export /* c */ class A {}`,
				`@dec /* c */
export class A {}
`,
			);
		});

		test('formats "@dec\\nexport\\n// c\\nclass B {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec
export
// c
class B {}`,
				`@dec
// c
export class B {}
`,
			);
		});

		test('formats "@dec\\nexport // c\\nclass B {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec
export // c
class B {}`,
				`@dec // c
export class B {}
`,
			);
		});

		test('formats "@dec export default /* c */ class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec export default /* c */ class A {}`,
				`@dec /* c */
export default class A {}
`,
			);
		});

		test('formats "@dec export default /* c */ class {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec export default /* c */ class {}`,
				`@dec /* c */
export default class {}
`,
			);
		});

		test('formats "@dec /* c */ export class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec /* c */ export class A {}`,
				`@dec /* c */
export class A {}
`,
			);
		});

		test('formats "@a @b export /* c */ class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@a @b export /* c */ class A {}`,
				`@a
@b /* c */
export class A {}
`,
			);
		});

		test('formats "@dec\\nexport\\n/** doc */\\nabstract class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`@dec
export
/** doc */
abstract class A {}`,
				`@dec
/** doc */
export abstract class A {}
`,
			);
		});

		test('keeps "@dec\\n// c\\nexport class A {}"', async () => {
			await expectPrettierFormat(
				`@dec
// c
export class A {}`,
				`@dec
// c
export class A {}
`,
			);
		});

		test('keeps "@dec\\n/** doc */\\nexport class A {}"', async () => {
			await expectPrettierFormat(
				`@dec
/** doc */
export class A {}`,
				`@dec
/** doc */
export class A {}
`,
			);
		});

		test('keeps "// c\\n@dec\\nexport class A {}"', async () => {
			await expectPrettierFormat(
				`// c
@dec
export class A {}`,
				`// c
@dec
export class A {}
`,
			);
		});

		test('keeps "foo();\\n@dec // c\\nexport class A {}"', async () => {
			await expectPrettierFormat(
				`foo();
@dec // c
export class A {}`,
				`foo();
@dec // c
export class A {}
`,
			);
		});

		test('keeps "@a // c\\n@b\\nexport class A {}"', async () => {
			await expectPrettierFormat(
				`@a // c
@b
export class A {}`,
				`@a // c
@b
export class A {}
`,
			);
		});

		test('keeps "@dec\\nexport class /* c */ A {}"', async () => {
			await expectPrettierFormat(
				`@dec
export class /* c */ A {}`,
				`@dec
export class /* c */ A {}
`,
			);
		});

		test('keeps "export /* c */ class A {}"', async () => {
			await expectPrettierFormat(
				`export /* c */ class A {}`,
				`export /* c */ class A {}
`,
			);
		});
	});

	describe('comments between decorators and the modifiers of a class member or parameter', () => {
		test('keeps "class A {\\n  @dec()\\n  // comment\\n  static b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  static b;
}`,
				`class A {
  @dec()
  // comment
  static b;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  /* comment */\\n  static b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  /* comment */
  static b;
}`,
				`class A {
  @dec()
  /* comment */
  static b;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  readonly b: number;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  readonly b: number;
}`,
				`class A {
  @dec()
  // comment
  readonly b: number;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  public static m() {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  public static m() {}
}`,
				`class A {
  @dec()
  // comment
  public static m() {}
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  static async *m() {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  static async *m() {}
}`,
				`class A {
  @dec()
  // comment
  static async *m() {}
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  get x() {\\n    return 1;\\n  }\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  get x() {
    return 1;
  }
}`,
				`class A {
  @dec()
  // comment
  get x() {
    return 1;
  }
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  [computed] = 1;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  [computed] = 1;
}`,
				`class A {
  @dec()
  // comment
  [computed] = 1;
}
`,
			);
		});

		test('keeps "class A {\\n  // lead\\n  @dec()\\n  // comment\\n  static b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  // lead
  @dec()
  // comment
  static b;
}`,
				`class A {
  // lead
  @dec()
  // comment
  static b;
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(\\n    @inject(Bar)\\n    // c\\n    private readonly bar: IBar,\\n  ) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(
    @inject(Bar)
    // c
    private readonly bar: IBar,
  ) {}
}`,
				`class A {
  constructor(
    @inject(Bar)
    // c
    private readonly bar: IBar,
  ) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(\\n    @a\\n    /* c */\\n    private x = 1,\\n  ) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(
    @a
    /* c */
    private x = 1,
  ) {}
}`,
				`class A {
  constructor(
    @a
    /* c */
    private x = 1,
  ) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(\\n    @a // c\\n    private x: T,\\n  ) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(
    @a // c
    private x: T,
  ) {}
}`,
				`class A {
  constructor(
    @a // c
    private x: T,
  ) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(@a /* c */ private x: T) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@a /* c */ private x: T) {}
}`,
				`class A {
  constructor(@a /* c */ private x: T) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(@inject(/* c */ Bar) private bar: IBar) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@inject(/* c */ Bar) private bar: IBar) {}
}`,
				`class A {
  constructor(@inject(/* c */ Bar) private bar: IBar) {}
}
`,
			);
		});

		test('keeps "class A {\\n  m(@a /* c */ @b x: T) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(@a /* c */ @b x: T) {}
}`,
				`class A {
  m(@a /* c */ @b x: T) {}
}
`,
			);
		});

		test('keeps "class A {\\n  m(\\n    @a // c\\n    x: T,\\n  ) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(
    @a // c
    x: T,
  ) {}
}`,
				`class A {
  m(
    @a // c
    x: T,
  ) {}
}
`,
			);
		});

		test('keeps "class A {\\n  m(\\n    @a\\n    // c\\n    x,\\n  ) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(
    @a
    // c
    x,
  ) {}
}`,
				`class A {
  m(
    @a
    // c
    x,
  ) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(@dec private /* c */ x: T) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@dec private /* c */ x: T) {}
}`,
				`class A {
  constructor(@dec private /* c */ x: T) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(@a /* a */ @b /* b */ private /* c */ x) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@a /* a */ @b /* b */ private /* c */ x) {}
}`,
				`class A {
  constructor(@a /* a */ @b /* b */ private /* c */ x) {}
}
`,
			);
		});

		test('keeps "class A {\\n  constructor(@dec private /* c */ x = 1) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@dec private /* c */ x = 1) {}
}`,
				`class A {
  constructor(@dec private /* c */ x = 1) {}
}
`,
			);
		});

		test('formats "class A {\\n  @dec()\\n  /* c */ static b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  /* c */ static b;
}`,
				`class A {
  @dec()
  /* c */
  static b;
}
`,
			);
		});

		test('formats "class A {\\n  @dec()\\n\\n  // comment\\n\\n  static b;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()

  // comment

  static b;
}`,
				`class A {
  @dec()

  // comment
  static b;
}
`,
			);
		});

		test('formats "class A {\\n  constructor(@dec /* a */ private /* b */ readonly /* c */ x: T) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@dec /* a */ private /* b */ readonly /* c */ x: T) {}
}`,
				`class A {
  constructor(@dec /* a */ /* b */ private readonly /* c */ x: T) {}
}
`,
			);
		});

		test('keeps "class A {\\n  @dec() // comment\\n  static b;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @dec() // comment
  static b;
}`,
				`class A {
  @dec() // comment
  static b;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec() /* comment */ static b;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @dec() /* comment */ static b;
}`,
				`class A {
  @dec() /* comment */ static b;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec() /* a */ /* b */ static x;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @dec() /* a */ /* b */ static x;
}`,
				`class A {
  @dec() /* a */ /* b */ static x;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec() static /* c */ b;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @dec() static /* c */ b;
}`,
				`class A {
  @dec() static /* c */ b;
}
`,
			);
		});

		test('keeps "class A {\\n  @a\\n  // c\\n  @b\\n  static x;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @a
  // c
  @b
  static x;
}`,
				`class A {
  @a
  // c
  @b
  static x;
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  m() {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  m() {}
}`,
				`class A {
  @dec()
  // comment
  m() {}
}
`,
			);
		});

		test('keeps "class A {\\n  @dec()\\n  // comment\\n  #priv = 1;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  #priv = 1;
}`,
				`class A {
  @dec()
  // comment
  #priv = 1;
}
`,
			);
		});

		test('keeps a static field static on every pass', async () => {
			await expectPrettierFormat(
				`class A {
  @dec()
  // comment
  static b;
  @dec() /* c */ static c;
}`,
				`class A {
  @dec()
  // comment
  static b;
  @dec() /* c */ static c;
}
`,
			);
		});
	});

	describe('comments between function parameters and bodies', () => {
		test('keeps "function f(/* none */) {}"', async () => {
			await expectPrettierFormat(
				`function f(/* none */) {}`,
				`function f(/* none */) {}
`,
			);
		});

		test('keeps "function f(\\n  // none\\n) {}"', async () => {
			await expectPrettierFormat(
				`function f(
  // none
) {}`,
				`function f(
  // none
) {}
`,
			);
		});

		test('keeps "async function f(/* none */) {}"', async () => {
			await expectPrettierFormat(
				`async function f(/* none */) {}`,
				`async function f(/* none */) {}
`,
			);
		});

		test('keeps "const g = (/* none */) => {};"', async () => {
			await expectPrettierFormat(
				`const g = (/* none */) => {};`,
				`const g = (/* none */) => {};
`,
			);
		});

		test('keeps "const g = async (/* none */) => {};"', async () => {
			await expectPrettierFormat(
				`const g = async (/* none */) => {};`,
				`const g = async (/* none */) => {};
`,
			);
		});

		test('keeps "const o = {\\n  m(/* none */) {},\\n};"', async () => {
			await expectPrettierFormat(
				`const o = {
  m(/* none */) {},
};`,
				`const o = {
  m(/* none */) {},
};
`,
			);
		});

		test('keeps "function f(a) /* body */ {}"', async () => {
			await expectPrettierFormat(
				`function f(a) /* body */ {}`,
				`function f(a) /* body */ {}
`,
			);
		});

		test('keeps "function f(a): T /* body */ {}"', async () => {
			await expectPrettierFormat(
				`function f(a): T /* body */ {}`,
				`function f(a): T /* body */ {}
`,
			);
		});

		test('keeps "function f<T> /* params */() {}"', async () => {
			await expectPrettierFormat(
				`function f<T> /* params */() {}`,
				`function f<T> /* params */() {}
`,
			);
		});

		test('keeps "const g = (a) /* arrow */ => {};"', async () => {
			await expectPrettierFormat(
				`const g = (a) /* arrow */ => {};`,
				`const g = (a) /* arrow */ => {};
`,
			);
		});

		test('keeps "const g = () /* arrow */ => {};"', async () => {
			await expectPrettierFormat(
				`const g = () /* arrow */ => {};`,
				`const g = () /* arrow */ => {};
`,
			);
		});

		test('keeps "const g = (a): T /* arrow */ => {};"', async () => {
			await expectPrettierFormat(
				`const g = (a): T /* arrow */ => {};`,
				`const g = (a): T /* arrow */ => {};
`,
			);
		});

		test('keeps "const g = (a) /* arrow */ => a;"', async () => {
			await expectPrettierFormat(
				`const g = (a) /* arrow */ => a;`,
				`const g = (a) /* arrow */ => a;
`,
			);
		});

		test('keeps "const g = (a) => /* body */ {};"', async () => {
			await expectPrettierFormat(
				`const g = (a) => /* body */ {};`,
				`const g = (a) => /* body */ {};
`,
			);
		});

		test('keeps the comment in the empty parameter list of a class method', async () => {
			await expectPrettierFormat(
				`class A {
  m(/* none */) {
    run();
  }
}`,
				`class A {
  m(/* none */) {
    run();
  }
}
`,
			);
		});

		test('moves a line comment before the body of "function f(a) // body\\n{\\n  x();\\n}" into it', async () => {
			await expectPrettierFormat(
				`function f(a) // body
{
  x();
}`,
				`function f(a) {
  // body
  x();
}
`,
			);
		});

		test('moves a line comment before the body of "function f() // body\\n{}" into it', async () => {
			await expectPrettierFormat(
				`function f() // body
{}`,
				`function f() {
  // body
}
`,
			);
		});

		test('keeps "function f(/* none */): T {}"', async () => {
			await expectPrettierFormat(
				`function f(/* none */): T {}`,
				`function f(/* none */): T {}
`,
			);
		});

		test('keeps "const g = (/* none */): T => a;"', async () => {
			await expectPrettierFormat(
				`const g = (/* none */): T => a;`,
				`const g = (/* none */): T => a;
`,
			);
		});

		test('keeps "class A {\\n  m(/* none */): T {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m(/* none */): T {}
}`,
				`class A {
  m(/* none */): T {}
}
`,
			);
		});

		test('keeps "type F = (/* none */) => void;"', async () => {
			await expectPrettierFormat(
				`type F = (/* none */) => void;`,
				`type F = (/* none */) => void;
`,
			);
		});

		test('keeps "type G = new (/* none */) => void;"', async () => {
			await expectPrettierFormat(
				`type G = new (/* none */) => void;`,
				`type G = new (/* none */) => void;
`,
			);
		});

		test('keeps "interface I {\\n  (/* none */): void;\\n  new (/* none */): X;\\n  m(/* none */): void;\\n  n(/* none */);\\n}"', async () => {
			await expectPrettierFormat(
				`interface I {
  (/* none */): void;
  new (/* none */): X;
  m(/* none */): void;
  n(/* none */);
}`,
				`interface I {
  (/* none */): void;
  new (/* none */): X;
  m(/* none */): void;
  n(/* none */);
}
`,
			);
		});

		test('keeps "declare function f(/* none */): void;"', async () => {
			await expectPrettierFormat(
				`declare function f(/* none */): void;`,
				`declare function f(/* none */): void;
`,
			);
		});

		test('keeps "type F = (\\n  // none\\n) => void;"', async () => {
			await expectPrettierFormat(
				`type F = (
  // none
) => void;`,
				`type F = (
  // none
) => void;
`,
			);
		});
	});

	describe('comments after a stray semicolon in a class body', () => {
		test('formats "class A {\\n  a = 1; ; // c\\n  b = 2;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1; ; // c
  b = 2;
}`,
				`class A {
  a = 1; // c
  b = 2;
}
`,
			);
		});

		test('formats "class A {\\n  a = 1;;; // c\\n  b = 2;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1;;; // c
  b = 2;
}`,
				`class A {
  a = 1; // c
  b = 2;
}
`,
			);
		});

		test('formats "class A {\\n  m() {}; // c\\n  b = 2;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m() {}; // c
  b = 2;
}`,
				`class A {
  m() {} // c
  b = 2;
}
`,
			);
		});

		test('formats "class A {\\n  a = 1;\\n  ; // c\\n  b = 2;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1;
  ; // c
  b = 2;
}`,
				`class A {
  a = 1; // c
  b = 2;
}
`,
			);
		});

		test('formats "class A {\\n  a = 1; ; // c\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1; ; // c
}`,
				`class A {
  a = 1; // c
}
`,
			);
		});

		test('keeps "class A {\\n  a = 1;\\n  // c\\n  b = 2;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1;
  // c
  b = 2;
}`,
				`class A {
  a = 1;
  // c
  b = 2;
}
`,
			);
		});

		test('keeps "class A {\\n  a = 1;\\n\\n  // c\\n  b = 2;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1;

  // c
  b = 2;
}`,
				`class A {
  a = 1;

  // c
  b = 2;
}
`,
			);
		});

		test('keeps "class A {\\n  // c\\n  b = 2;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  // c
  b = 2;
}`,
				`class A {
  // c
  b = 2;
}
`,
			);
		});
	});

	describe('comments in JSX opening tags and children stay there', () => {
		test('keeps "const el = <div title={/* a */ title}>{/* b */ label}</div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div title={/* a */ title}>{/* b */ label}</div>;`,
				`const el = <div title={/* a */ title}>{/* b */ label}</div>;
`,
			);
		});

		test('keeps "const el = <div title={title /* a */}>{label /* b */}</div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div title={title /* a */}>{label /* b */}</div>;`,
				`const el = <div title={title /* a */}>{label /* b */}</div>;
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <div a=\\"1\\" /* c */ b=\\"2\\">\\n      test\\n    </div>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div a="1" /* c */ b="2">
      test
    </div>
  );
}`,
				`function App() {
  return (
    <div a="1" /* c */ b="2">
      test
    </div>
  );
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <div {...props} /* c */ a=\\"1\\">\\n      test\\n    </div>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div {...props} /* c */ a="1">
      test
    </div>
  );
}`,
				`function App() {
  return (
    <div {...props} /* c */ a="1">
      test
    </div>
  );
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <div\\n      a=\\"1\\"\\n      // c\\n    >\\n      test\\n    </div>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div
      a="1"
      // c
    >
      test
    </div>
  );
}`,
				`function App() {
  return (
    <div
      a="1"
      // c
    >
      test
    </div>
  );
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <div // c\\n      a=\\"1\\"\\n    >\\n      test\\n    </div>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div // c
      a="1"
    >
      test
    </div>
  );
}`,
				`function App() {
  return (
    <div // c
      a="1"
    >
      test
    </div>
  );
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <div\\n      something=\\"test\\" // after\\n    >\\n      test\\n    </div>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div
      something="test" // after
    >
      test
    </div>
  );
}`,
				`function App() {
  return (
    <div
      something="test" // after
    >
      test
    </div>
  );
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <div\\n      a=\\"1\\"\\n      // c\\n    />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <div
      a="1"
      // c
    />
  );
}`,
				`function App() {
  return (
    <div
      a="1"
      // c
    />
  );
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return </* c */ div>test</div>;\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return </* c */ div>test</div>;
}`,
				`function App() {
  return </* c */ div>test</div>;
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return </* a */ /* b */ div a=\\"1\\" />;\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return </* a */ /* b */ div a="1" />;
}`,
				`function App() {
  return </* a */ /* b */ div a="1" />;
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return </* c */>test</>;\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return </* c */>test</>;
}`,
				`function App() {
  return </* c */>test</>;
}
`,
			);
		});

		test('keeps the comment in the opening tag of "function App() {\\n  return (\\n    <\\n      // c\\n    >\\n      test\\n    </>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <
      // c
    >
      test
    </>
  );
}`,
				`function App() {
  return (
    <
      // c
    >
      test
    </>
  );
}
`,
			);
		});

		test('keeps the comment after the `<` of "function App() {\\n  return <\\n    /* c */ div\\n  >test</div>;\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return <
    /* c */ div
  >test</div>;
}`,
				`function App() {
  return </* c */ div>test</div>;
}
`,
			);
		});

		test('keeps the comment after the `<` of "const a = <\\n  // c\\n>\\n  x\\n</>;"', async () => {
			await expectPrettierFormat(
				`const a = <
  // c
>
  x
</>;`,
				`const a = (
  <
    // c
  >
    x
  </>
);
`,
			);
		});

		test('starts a line comment before the tag name of "function App() {\\n  return (\\n    <\\n      // c\\n      div\\n      a=\\"1\\"\\n    >\\n      test\\n    </div>\\n  );\\n}" on its own line', async () => {
			await expectFormat(
				`function App() {
  return (
    <
      // c
      div
      a="1"
    >
      test
    </div>
  );
}`,
				`function App() {
  return (
    <
      // c
      div
      a="1"
    >
      test
    </div>
  );
}
`,
			);
		});

		test('starts a line comment before the tag name of "function App() {\\n  return (\\n    <\\n      // c\\n      // d\\n      Foo.Bar\\n    />\\n  );\\n}" on its own line', async () => {
			await expectFormat(
				`function App() {
  return (
    <
      // c
      // d
      Foo.Bar
    />
  );
}`,
				`function App() {
  return (
    <
      // c
      // d
      Foo.Bar
    />
  );
}
`,
			);
		});

		test('starts a line comment before the tag name of "function App() {\\n  return (\\n    <\\n      // c\\n      Foo<T>\\n    />\\n  );\\n}" on its own line', async () => {
			await expectFormat(
				`function App() {
  return (
    <
      // c
      Foo<T>
    />
  );
}`,
				`function App() {
  return (
    <
      // c
      Foo<T>
    />
  );
}
`,
			);
		});

		test('moves a line comment after the `<` of "const a = <// c\\ndiv id=\\"x\\" title=\\"y\\" />;" to its own line', async () => {
			await expectFormat(
				`const a = <// c
div id="x" title="y" />;`,
				`const a = (
  <
    // c
    div
    id="x"
    title="y"
  />
);
`,
			);
		});

		test('moves a line comment after the `<` of "const a = < // c\\n  Foo>x</Foo>;" to its own line', async () => {
			await expectFormat(
				`const a = < // c
  Foo>x</Foo>;`,
				`const a = (
  <
    // c
    Foo
  >
    x
  </Foo>
);
`,
			);
		});

		test('keeps the comment next to a child of "const el = (\\n  <div>\\n    text\\n    {/* c */}\\n    more\\n  </div>\\n);"', async () => {
			await expectPrettierFormat(
				`const el = (
  <div>
    text
    {/* c */}
    more
  </div>
);`,
				`const el = (
  <div>
    text
    {/* c */}
    more
  </div>
);
`,
			);
		});

		test('keeps the spaces around the comment after a child of "const a = <div>{x /* c */}</div>;"', async () => {
			await expectPrettierFormat(
				`const a = <div>{x /* c */}</div>;`,
				`const a = <div>{x /* c */}</div>;
`,
			);
		});

		test('keeps the comment in the closing tag of "const el = <div>x</div /* c */>;"', async () => {
			await expectPrettierFormat(
				`const el = <div>x</div /* c */>;`,
				`const el = <div>x</div /* c */>;
`,
			);
		});

		test('keeps the comment in the closing tag of "const el = <div>x</ /* c */ div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div>x</ /* c */ div>;`,
				`const el = <div>x</ /* c */ div>;
`,
			);
		});

		test('keeps the comment in the closing tag of "const el = <>x</ /* c */>;\\nfoo();"', async () => {
			await expectPrettierFormat(
				`const el = <>x</ /* c */>;
foo();`,
				`const el = <>x</ /* c */>;
foo();
`,
			);
		});

		test('formats the comment in the closing tag of "const el = <div>x</div // c\\n>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const el = <div>x</div // c
>;`,
				`const el = <div>x</div>; // c
`,
			);
		});

		test('formats the comment in the closing tag of "const el = (\\n  <>\\n    x\\n  </\\n    // c\\n  >\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const el = (
  <>
    x
  </
    // c
  >
);`,
				`const el = <>x</
    // c
  >;
`,
			);
		});

		test('formats the comment in the closing tag of "const el = (\\n  <div>\\n    x\\n  </\\n    // c\\n    div\\n  >\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const el = (
  <div>
    x
  </
    // c
    div
  >
);`,
				`const el = <div>x</
    // c
    div
  >;
`,
			);
		});

		test('keeps the comment before the value of "const el = <div attr=/* comment */\\"foo\\" b=/* c */{x}></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr=/* comment */"foo" b=/* c */{x}></div>;`,
				`const el = <div attr=/* comment */ "foo" b=/* c */ {x}></div>;
`,
			);
		});

		test('keeps the comments around the value of "const el = <div attr=/* a */ <i /> c=/* d */ <></>></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr=/* a */ <i /> c=/* d */ <></>></div>;`,
				`const el = <div attr=/* a */ <i /> c=/* d */ <></>></div>;
`,
			);
		});

		test('keeps the comments around the value of "const el = <div attr=\\"foo\\" /* c */ b=\\"2\\"></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr="foo" /* c */ b="2"></div>;`,
				`const el = <div attr="foo" /* c */ b="2"></div>;
`,
			);
		});

		test('formats the line comment before the value of "const el = <div attr= // comment\\n\\"foo\\" b=\\"2\\"></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr= // comment
"foo" b="2"></div>;`,
				`const el = (
  <div
    attr="foo" // comment
    b="2"
  ></div>
);
`,
			);
		});

		test('formats the line comment before the value of "const el = <div attr= // c\\n<i />></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr= // c
<i />></div>;`,
				`const el = (
  <div
    attr=<i /> // c
  ></div>
);
`,
			);
		});

		test('keeps the comment after the name of "const el = <div attr /* a */=\\"x\\"></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr /* a */="x"></div>;`,
				`const el = <div attr /* a */="x"></div>;
`,
			);
		});

		test('keeps the comment after the name of "const el = <div attr /* a */=\\"x\\" b /* c */></div>;"', async () => {
			await expectPrettierFormat(
				`const el = <div attr /* a */="x" b /* c */></div>;`,
				`const el = <div attr /* a */="x" b /* c */></div>;
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div {.../* note */b}/>;"', async () => {
			await expectPrettierFormat(
				`a = <div {.../* note */b}/>;`,
				`a = <div {/* note */ ...b} />;
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div {/* note */...b}/>;"', async () => {
			await expectPrettierFormat(
				`a = <div {/* note */...b}/>;`,
				`a = <div {/* note */ ...b} />;
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div {.../* prettier-ignore */b}/>;"', async () => {
			await expectPrettierFormat(
				`a = <div {.../* prettier-ignore */b}/>;`,
				`a = <div {/* prettier-ignore */ ...b} />;
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div {... /* note */ b} c=\\"1\\"/>;"', async () => {
			await expectPrettierFormat(
				`a = <div {... /* note */ b} c="1"/>;`,
				`a = <div {/* note */ ...b} c="1" />;
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div c=\\"1\\" {.../* note */b} d />;"', async () => {
			await expectPrettierFormat(
				`a = <div c="1" {.../* note */b} d />;`,
				`a = <div c="1" {/* note */ ...b} d />;
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div {...// note\\nb}/>;"', async () => {
			await expectPrettierFormat(
				`a = <div {...// note
b}/>;`,
				`a = (
  <div
    {
      // note
      ...b
    }
  />
);
`,
			);
		});

		test('keeps the comment before the argument of the spread in "a = <div {...\\n  // prettier-ignore\\n  b}/>;"', async () => {
			await expectPrettierFormat(
				`a = <div {...
  // prettier-ignore
  b}/>;`,
				`a = (
  <div
    {
      // prettier-ignore
      ...b
    }
  />
);
`,
			);
		});

		test('keeps the comment after the argument of the spread in "c = <div {...a\\n// e\\n} b=\\"1\\" />;"', async () => {
			await expectPrettierFormat(
				`c = <div {...a
// e
} b="1" />;`,
				`c = (
  <div
    {
      ...a
      // e
    }
    b="1"
  />
);
`,
			);
		});

		test('keeps the comment after the argument of the spread in "d = <div {...a\\n// f\\n} />;"', async () => {
			await expectPrettierFormat(
				`d = <div {...a
// f
} />;`,
				`d = (
  <div
    {
      ...a
      // f
    }
  />
);
`,
			);
		});

		test('keeps the comment after the argument of the spread in "const el = <div {...a // s\\n} />;"', async () => {
			await expectPrettierFormat(
				`const el = <div {...a // s
} />;`,
				`const el = (
  <div
    {
      ...a // s
    }
  />
);
`,
			);
		});

		test('keeps the comment after the argument of the spread in "const el = <div {...a /* s */} bbbbbbbbbbbbbb=\\"1\\" ccccccccccccccccc=\\"2\\" dddddddddddddddddddd=\\"3\\" />;"', async () => {
			await expectPrettierFormat(
				`const el = <div {...a /* s */} bbbbbbbbbbbbbb="1" ccccccccccccccccc="2" dddddddddddddddddddd="3" />;`,
				`const el = (
  <div
    {
      ...a /* s */
    }
    bbbbbbbbbbbbbb="1"
    ccccccccccccccccc="2"
    dddddddddddddddddddd="3"
  />
);
`,
			);
		});

		test('keeps the comment after the argument of the spread in "function HelloWorld() {\\n  return (\\n    <div\\n      {...{} /*\\n      // @ts-ignore */ /* prettier-ignore */}\\n      invalidProp=\\"HelloWorld\\"\\n    >\\n      test\\n    </div>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function HelloWorld() {
  return (
    <div
      {...{} /*
      // @ts-ignore */ /* prettier-ignore */}
      invalidProp="HelloWorld"
    >
      test
    </div>
  );
}`,
				`function HelloWorld() {
  return (
    <div
      {
        ...{} /*
      // @ts-ignore */ /* prettier-ignore */
      }
      invalidProp="HelloWorld"
    >
      test
    </div>
  );
}
`,
			);
		});

		test('keeps the spread attribute of "const el = <div {...a /* s */} b=\\"1\\" />;"', async () => {
			await expectPrettierFormat(
				`const el = <div {...a /* s */} b="1" />;`,
				`const el = <div {...a /* s */} b="1" />;
`,
			);
		});

		test('keeps the spread attribute of "const el = <div {...a} b=\\"1\\" />;"', async () => {
			await expectPrettierFormat(
				`const el = <div {...a} b="1" />;`,
				`const el = <div {...a} b="1" />;
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div>{a\\n// g\\n}</div>;"', async () => {
			await expectPrettierFormat(
				`e = <div>{a
// g
}</div>;`,
				`e = (
  <div>
    {
      a
      // g
    }
  </div>
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "f = <div b={a\\n// g\\n} c=\\"1\\" />;"', async () => {
			await expectPrettierFormat(
				`f = <div b={a
// g
} c="1" />;`,
				`f = (
  <div
    b={
      a
      // g
    }
    c="1"
  />
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div>{a\\n/* g */\\n}</div>;"', async () => {
			await expectPrettierFormat(
				`e = <div>{a
/* g */
}</div>;`,
				`e = (
  <div>
    {
      a
      /* g */
    }
  </div>
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div b={a\\n/* g */\\n} />;"', async () => {
			await expectPrettierFormat(
				`e = <div b={a
/* g */
} />;`,
				`e = (
  <div
    b={
      a
      /* g */
    }
  />
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div>{a\\n// g\\n// h\\n}</div>;"', async () => {
			await expectPrettierFormat(
				`e = <div>{a
// g
// h
}</div>;`,
				`e = (
  <div>
    {
      a
      // g
      // h
    }
  </div>
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div>text {a\\n// g\\n} more</div>;"', async () => {
			await expectPrettierFormat(
				`e = <div>text {a
// g
} more</div>;`,
				`e = (
  <div>
    text{" "}
    {
      a
      // g
    }{" "}
    more
  </div>
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div a={<b />\\n// c\\n} />;"', async () => {
			await expectPrettierFormat(
				`e = <div a={<b />
// c
} />;`,
				`e = (
  <div
    a={
      <b />
      // c
    }
  />
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div>{f(a)\\n// g\\n}</div>;"', async () => {
			await expectPrettierFormat(
				`e = <div>{f(a)
// g
}</div>;`,
				`e = (
  <div>
    {
      f(a)
      // g
    }
  </div>
);
`,
			);
		});

		test('keeps the comment after the expression of the braces in "e = <div>{\\" \\"\\n// c\\n}text</div>;"', async () => {
			await expectPrettierFormat(
				`e = <div>{" "
// c
}text</div>;`,
				`e = (
  <div>
    {
      " "
      // c
    }
    text
  </div>
);
`,
			);
		});

		test('formats the comment after the expression of "e = <div>{a // g\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`e = <div>{a // g
}</div>;`,
				`e = (
  <div>
    {
      a // g
    }
  </div>
);
`,
			);
		});

		test('formats the comment after the expression of "e = <div b={a // g\\n} />;" like Prettier', async () => {
			await expectPrettierFormat(
				`e = <div b={a // g
} />;`,
				`e = (
  <div
    b={
      a // g
    }
  />
);
`,
			);
		});

		test('formats the comments alone in the braces of "const c = <div>{\\n// only\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const c = <div>{
// only
}</div>;`,
				`const c = (
  <div>
    {
      // only
    }
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const d = <div a={\\n// only\\n} />;" like Prettier', async () => {
			await expectPrettierFormat(
				`const d = <div a={
// only
} />;`,
				`const d = (
  <div
    a={
      // only
    }
  />
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <div a={// a\\n} b=\\"1\\">x</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <div a={// a
} b="1">x</div>;`,
				`const a = (
  <div
    a={
      // a
    }
    b="1"
  >
    x
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <div>{/* a */ // b\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <div>{/* a */ // b
}</div>;`,
				`const a = (
  <div>
    {
      /* a */
      // b
    }
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <div>{\\n// a\\n// b\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <div>{
// a
// b
}</div>;`,
				`const a = (
  <div>
    {
      // a
      // b
    }
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <div>text {// a\\n} more</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <div>text {// a
} more</div>;`,
				`const a = (
  <div>
    text{" "}
    {
      // a
    }{" "}
    more
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <>{// a\\n}</>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <>{// a
}</>;`,
				`const a = (
  <>
    {
      // a
    }
  </>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <div>{/* a */ /* b */}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <div>{/* a */ /* b */}</div>;`,
				`const a = (
  <div>
    {/* a */
    /* b */}
  </div>
);
`,
			);
		});

		test('formats the comments alone in the braces of "const a = <div>{\\n/* a */\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const a = <div>{
/* a */
}</div>;`,
				`const a = <div>{/* a */}</div>;
`,
			);
		});

		test('keeps the block comment alone in the braces of "const a = <div>{/* a */}</div>;"', async () => {
			await expectPrettierFormat(
				`const a = <div>{/* a */}</div>;`,
				`const a = <div>{/* a */}</div>;
`,
			);
		});

		test('keeps the block comment alone in the braces of "const a = <div a={/* a */} />;"', async () => {
			await expectPrettierFormat(
				`const a = <div a={/* a */} />;`,
				`const a = <div a={/* a */} />;
`,
			);
		});

		test('joins an operator on the next line to the element it continues, like Prettier', async () => {
			await expectPrettierFormat(
				`<div />
+ 1;

function f() {
  <div />
  > 5;
}`,
				`<div /> + 1;

function f() {
  <div /> > 5;
}
`,
			);
			await expectPrettierFormat(
				`<div />
+ 1;

function f() {
  <div />
  > 5;
}`,
				`;<div /> + 1

function f() {
  ;<div /> > 5
}
`,
				{ semi: false },
			);
		});
	});

	describe('JSX spread children', () => {
		test('keeps "const x = <div>{...a}</div>;"', async () => {
			await expectPrettierFormat(
				`const x = <div>{...a}</div>;`,
				`const x = <div>{...a}</div>;
`,
			);
		});

		test('keeps "function f() {\\n  return <div>{...children}</div>;\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  return <div>{...children}</div>;
}`,
				`function f() {
  return <div>{...children}</div>;
}
`,
			);
		});

		test('keeps "const x = <div>text {...a} more</div>;"', async () => {
			await expectPrettierFormat(
				`const x = <div>text {...a} more</div>;`,
				`const x = <div>text {...a} more</div>;
`,
			);
		});

		test('keeps "const x = <>{...a}</>;"', async () => {
			await expectPrettierFormat(
				`const x = <>{...a}</>;`,
				`const x = <>{...a}</>;
`,
			);
		});

		test('keeps "const x = <div>{/* c */ ...a}</div>;"', async () => {
			await expectPrettierFormat(
				`const x = <div>{/* c */ ...a}</div>;`,
				`const x = <div>{/* c */ ...a}</div>;
`,
			);
		});

		test('keeps "const x = <div>{...a /* c */}</div>;"', async () => {
			await expectPrettierFormat(
				`const x = <div>{...a /* c */}</div>;`,
				`const x = <div>{...a /* c */}</div>;
`,
			);
		});

		test('formats "const x = <div>{... /* c */ a}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = <div>{... /* c */ a}</div>;`,
				`const x = <div>{/* c */ ...a}</div>;
`,
			);
		});

		test('formats "const x = <div>{// c\\n...a}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = <div>{// c
...a}</div>;`,
				`const x = (
  <div>
    {
      // c
      ...a
    }
  </div>
);
`,
			);
		});

		test('formats "const x = <div>{...a // c\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = <div>{...a // c
}</div>;`,
				`const x = (
  <div>
    {
      ...a // c
    }
  </div>
);
`,
			);
		});

		test('formats "const x = <div>{...a\\n// c\\n}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = <div>{...a
// c
}</div>;`,
				`const x = (
  <div>
    {
      ...a
      // c
    }
  </div>
);
`,
			);
		});

		test('formats "const x = <div>{...a}{...b}</div>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = <div>{...a}{...b}</div>;`,
				`const x = (
  <div>
    {...a}
    {...b}
  </div>
);
`,
			);
		});
	});

	describe('block comments that share a line', () => {
		test('keeps "/* a */ /* b */ run();"', async () => {
			await expectPrettierFormat(
				`/* a */ /* b */ run();`,
				`/* a */ /* b */ run();
`,
			);
		});

		test('keeps "const v = /* a */ /* b */ x;"', async () => {
			await expectPrettierFormat(
				`const v = /* a */ /* b */ x;`,
				`const v = /* a */ /* b */ x;
`,
			);
		});

		test('keeps "function f() {\\n  return /* a */ /* b */ x;\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  return /* a */ /* b */ x;
}`,
				`function f() {
  return /* a */ /* b */ x;
}
`,
			);
		});

		test('keeps "function f() {\\n  throw /* a */ /* b */ new Error();\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  throw /* a */ /* b */ new Error();
}`,
				`function f() {
  throw /* a */ /* b */ new Error();
}
`,
			);
		});

		test('keeps "const a = [/* a */ /* b */ 1, 2];"', async () => {
			await expectPrettierFormat(
				`const a = [/* a */ /* b */ 1, 2];`,
				`const a = [/* a */ /* b */ 1, 2];
`,
			);
		});

		test('keeps "call(/* a */ /* b */ x);"', async () => {
			await expectPrettierFormat(
				`call(/* a */ /* b */ x);`,
				`call(/* a */ /* b */ x);
`,
			);
		});

		test('keeps "/* a */ /* b */\\nrun();"', async () => {
			await expectPrettierFormat(
				`/* a */ /* b */
run();`,
				`/* a */ /* b */
run();
`,
			);
		});

		test('keeps "/* a */\\n/* b */ run();"', async () => {
			await expectPrettierFormat(
				`/* a */
/* b */ run();`,
				`/* a */
/* b */ run();
`,
			);
		});

		test('keeps "/* a */\\n\\n/* b */ run();"', async () => {
			await expectPrettierFormat(
				`/* a */

/* b */ run();`,
				`/* a */

/* b */ run();
`,
			);
		});

		test('joins a value to a comment that ends the line after = when it fits', async () => {
			await expectPrettierFormat(
				`const x = /* c */
  5;`,
				`const x = /* c */ 5;
`,
			);
		});

		test('keeps the touching JSDoc comments of "/**\\n * @param {A} a\\n *//**\\n * @param {B} b\\n */\\nfunction f(a) {}" together', async () => {
			await expectPrettierFormat(
				`/**
 * @param {A} a
 *//**
 * @param {B} b
 */
function f(a) {}`,
				`/**
 * @param {A} a
 *//**
 * @param {B} b
 */
function f(a) {}
`,
			);
		});

		test('keeps the touching JSDoc comments of "function f() {}\\n\\n/** Trailing nestled comment 1\\n *//** Trailing nestled comment 2\\n *//** Trailing nestled comment 3\\n */" together', async () => {
			await expectPrettierFormat(
				`function f() {}

/** Trailing nestled comment 1
 *//** Trailing nestled comment 2
 *//** Trailing nestled comment 3
 */`,
				`function f() {}

/** Trailing nestled comment 1
 *//** Trailing nestled comment 2
 *//** Trailing nestled comment 3
 */
`,
			);
		});

		test('keeps the touching JSDoc comments of "{{\\no={\\n  /**\\n   * A\\n   *//**\\n   * B\\n   */\\n\\n}\\n}}" together', async () => {
			await expectPrettierFormat(
				`{{
o={
  /**
   * A
   *//**
   * B
   */

}
}}`,
				`{
  {
    o = {
      /**
       * A
       *//**
       * B
       */
    };
  }
}
`,
			);
		});

		test('keeps the touching JSDoc comments of "class A {\\n    /**\\n     * x\\n     *//**\\n     * y\\n     */\\n  m() {}\\n}" together', async () => {
			await expectPrettierFormat(
				`class A {
    /**
     * x
     *//**
     * y
     */
  m() {}
}`,
				`class A {
  /**
   * x
   *//**
   * y
   */
  m() {}
}
`,
			);
		});

		test('keeps the touching JSDoc comments of "f(a, /**\\n * x\\n *//**\\n * y\\n */ b);" together', async () => {
			await expectPrettierFormat(
				`f(a, /**
 * x
 *//**
 * y
 */ b);`,
				`f(
  a,
  /**
   * x
   *//**
   * y
   */ b,
);
`,
			);
		});

		test('keeps the touching JSDoc comments of "a; /**\\n * x\\n *//**\\n * y\\n */\\nb;" together', async () => {
			await expectPrettierFormat(
				`a; /**
 * x
 *//**
 * y
 */
b;`,
				`a; /**
 * x
 *//**
 * y
 */
b;
`,
			);
		});

		test('keeps the touching JSDoc comments of "const o = {\\n  a: 1, /**\\n   * x\\n   *//**\\n   * y\\n   */\\n  b: 2,\\n};" together', async () => {
			await expectPrettierFormat(
				`const o = {
  a: 1, /**
   * x
   *//**
   * y
   */
  b: 2,
};`,
				`const o = {
  a: 1 /**
   * x
   *//**
   * y
   */,
  b: 2,
};
`,
			);
		});

		test('keeps the touching JSDoc comments of "if (a) {\\n  b();\\n} /**\\n * x\\n *//**\\n * y\\n */\\nelse {\\n  c();\\n}" together', async () => {
			await expectPrettierFormat(
				`if (a) {
  b();
} /**
 * x
 *//**
 * y
 */
else {
  c();
}`,
				`if (a) {
  b();
} /**
 * x
 *//**
 * y
 */
else {
  c();
}
`,
			);
		});

		test('prints a space between the touching comments of "/** a *//**\\n * b\\n */\\nx;"', async () => {
			await expectPrettierFormat(
				`/** a *//**
 * b
 */
x;`,
				`/** a */ /**
 * b
 */
x;
`,
			);
		});

		test('prints a space between the touching comments of "/**\\n * a\\n *//* b *//**\\n * c\\n */\\nx;"', async () => {
			await expectPrettierFormat(
				`/**
 * a
 *//* b *//**
 * c
 */
x;`,
				`/**
 * a
 */ /* b */ /**
 * c
 */
x;
`,
			);
		});

		test('prints a space between the touching comments of "/**\\n * a\\n *//*\\n b\\n*//**\\n * c\\n */\\nx;"', async () => {
			await expectPrettierFormat(
				`/**
 * a
 *//*
 b
*//**
 * c
 */
x;`,
				`/**
 * a
 */ /*
 b
*/ /**
 * c
 */
x;
`,
			);
		});

		test('keeps every comment after "{\\n  a(); /* c */ /* d */\\n  b();\\n}" on its line', async () => {
			await expectPrettierFormat(
				`{
  a(); /* c */ /* d */
  b();
}`,
				`{
  a(); /* c */ /* d */
  b();
}
`,
			);
		});

		test('keeps every comment after "const x = 1; /* c */ /* d */\\nconst y = 2;" on its line', async () => {
			await expectPrettierFormat(
				`const x = 1; /* c */ /* d */
const y = 2;`,
				`const x = 1; /* c */ /* d */
const y = 2;
`,
			);
		});

		test('keeps every comment after "a(); /* c */ // d\\nb();" on its line', async () => {
			await expectPrettierFormat(
				`a(); /* c */ // d
b();`,
				`a(); /* c */ // d
b();
`,
			);
		});

		test('prints a space before the comment in "tag/* c */`x`;"', async () => {
			await expectPrettierFormat(
				`tag/* c */\`x\`;`,
				`tag /* c */ \`x\`;
`,
			);
		});

		test('prints a space before the comment in "tag<T>/* c */`x`;"', async () => {
			await expectPrettierFormat(
				`tag<T>/* c */\`x\`;`,
				`tag<T> /* c */ \`x\`;
`,
			);
		});

		test('prints a space before the comment in "tag /* c */ /* d */ `x`;"', async () => {
			await expectPrettierFormat(
				`tag /* c */ /* d */ \`x\`;`,
				`tag /* c */ /* d */ \`x\`;
`,
			);
		});

		test('prints a space before the comment in "tag\\n/* c */ `x`;"', async () => {
			await expectPrettierFormat(
				`tag
/* c */ \`x\`;`,
				`tag
/* c */ \`x\`;
`,
			);
		});

		test('keeps "a /* a */ + /* b */ b;"', async () => {
			await expectPrettierFormat(
				`a /* a */ + /* b */ b;`,
				`a /* a */ + /* b */ b;
`,
			);
		});

		test('keeps "function f /* c */(a) {}"', async () => {
			await expectPrettierFormat(
				`function f /* c */(a) {}`,
				`function f /* c */(a) {}
`,
			);
		});

		test('keeps "const o = { m /* c */(a) {} };"', async () => {
			await expectPrettierFormat(
				`const o = { m /* c */(a) {} };`,
				`const o = { m /* c */(a) {} };
`,
			);
		});

		test('moves the comment in "interface I {\\n  m /* c */ (a): void;\\n}" into the parentheses', async () => {
			await expectPrettierFormat(
				`interface I {
  m /* c */ (a): void;
}`,
				`interface I {
  m(/* c */ a): void;
}
`,
			);
		});

		test('moves the comment in "foo /* c */ (a);" into the parentheses', async () => {
			await expectPrettierFormat(
				`foo /* c */ (a);`,
				`foo(/* c */ a);
`,
			);
		});

		test('moves the comment in "declare function f /* c */ (a): void;" into the parentheses', async () => {
			await expectPrettierFormat(
				`declare function f /* c */ (a): void;`,
				`declare function f(/* c */ a): void;
`,
			);
		});
	});

	describe("comments before a statement's semicolon", () => {
		test('formats "const x = 1 /* c */;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = 1 /* c */;`,
				`const x = 1; /* c */
`,
			);
		});

		test('formats "foo() /* c */;" like Prettier', async () => {
			await expectPrettierFormat(
				`foo() /* c */;`,
				`foo(); /* c */
`,
			);
		});

		test('formats "function f() {\\n  return x /* c */;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return x /* c */;
}`,
				`function f() {
  return x; /* c */
}
`,
			);
		});

		test('formats "let x = 1 // c\\n;" like Prettier', async () => {
			await expectPrettierFormat(
				`let x = 1 // c
;`,
				`let x = 1; // c
`,
			);
		});

		test('formats "if (a) return -1 // c\\n;\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`if (a) return -1 // c
;
b();`,
				`if (a) return -1; // c
b();
`,
			);
		});

		test('formats "while (a) foo() // c\\n;" like Prettier', async () => {
			await expectPrettierFormat(
				`while (a) foo() // c
;`,
				`while (a) foo(); // c
`,
			);
		});

		test('formats "function f() {\\n  return x // a\\n  // b\\n  ;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return x // a
  // b
  ;
}`,
				`function f() {
  return x; // a
  // b
}
`,
			);
		});

		test('keeps "f(() => a /* c */);"', async () => {
			await expectPrettierFormat(
				`f(() => a /* c */);`,
				`f(() => a /* c */);
`,
			);
		});

		test('keeps "const f = () => a /* x */ + 1;"', async () => {
			await expectPrettierFormat(
				`const f = () => a /* x */ + 1;`,
				`const f = () => a /* x */ + 1;
`,
			);
		});

		test('keeps "const f = () => (a ? b : c /* c */);"', async () => {
			await expectPrettierFormat(
				`const f = () => (a ? b : c /* c */);`,
				`const f = () => (a ? b : c /* c */);
`,
			);
		});

		test('keeps "const f = () => (\\n  <div /> // c\\n);"', async () => {
			await expectPrettierFormat(
				`const f = () => (
  <div /> // c
);`,
				`const f = () => (
  <div /> // c
);
`,
			);
		});

		test('keeps "import /* a */ Alias /* b */ = /* c */ Foo /* d */;"', async () => {
			await expectPrettierFormat(
				`import /* a */ Alias /* b */ = /* c */ Foo /* d */;`,
				`import /* a */ Alias /* b */ = /* c */ Foo /* d */;
`,
			);
		});

		test('keeps "if (x) /* c */ ;"', async () => {
			await expectPrettierFormat(
				`if (x) /* c */ ;`,
				`if (x) /* c */ ;
`,
			);
		});

		test('keeps "class A {\\n  a = 1; // c\\n  b = 2;\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  a = 1; // c
  b = 2;
}`,
				`class A {
  a = 1; // c
  b = 2;
}
`,
			);
		});

		test('keeps "foo(a /* c */);"', async () => {
			await expectPrettierFormat(
				`foo(a /* c */);`,
				`foo(a /* c */);
`,
			);
		});

		test('keeps "x = foo(a /* c */);"', async () => {
			await expectPrettierFormat(
				`x = foo(a /* c */);`,
				`x = foo(a /* c */);
`,
			);
		});

		test('keeps "do x();\\nwhile (a /* c */);"', async () => {
			await expectPrettierFormat(
				`do x();
while (a /* c */);`,
				`do x();
while (a /* c */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "const f = () => (a = b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => (a = b /* note */);`,
				`const f = () => (a = b /* note */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "const f = () => (a, b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => (a, b /* note */);`,
				`const f = () => (a, b /* note */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "const x = (a, b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = (a, b /* note */);`,
				`const x = (a, b /* note */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "const x = (a = b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = (a = b /* note */);`,
				`const x = (a = b /* note */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "function f() {\\n  return (a, b /* note */);\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return (a, b /* note */);
}`,
				`function f() {
  return (a, b /* note */);
}
`,
			);
		});

		test('keeps the comment inside the parentheses of "function f() {\\n  return (a = b /* note */);\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return (a = b /* note */);
}`,
				`function f() {
  return (a = b /* note */);
}
`,
			);
		});

		test('keeps the comment inside the parentheses of "x = (a, b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`x = (a, b /* note */);`,
				`x = (a, b /* note */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "x = y = (z, w /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`x = y = (z, w /* note */);`,
				`x = y = (z, w /* note */);
`,
			);
		});

		test('keeps the comment inside the parentheses of "f(() => (a, b /* note */));" like Prettier', async () => {
			await expectPrettierFormat(
				`f(() => (a, b /* note */));`,
				`f(() => (a, b /* note */));
`,
			);
		});

		test('keeps the comment inside the parentheses of "const x = (a, b /* note */),\\n  y = 1;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = (a, b /* note */),
  y = 1;`,
				`const x = (a, b /* note */),
  y = 1;
`,
			);
		});

		test('keeps the comment inside the parentheses of "for (let i = (a, b /* note */); ;) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`for (let i = (a, b /* note */); ;) {}`,
				`for (let i = (a, b /* note */); ;) {}
`,
			);
		});

		test('keeps the comment inside the parentheses of "function f() {\\n  return (\\n    a,\\n    b // note\\n  );\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return (
    a,
    b // note
  );
}`,
				`function f() {
  return (
    a,
    b // note
  );
}
`,
			);
		});

		test('keeps the comment inside the parentheses of "f(\\n  () => (\\n    a,\\n    b // note\\n  ),\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`f(
  () => (
    a,
    b // note
  ),
);`,
				`f(
  () => (
    a,
    b // note
  ),
);
`,
			);
		});

		test('formats "(a, b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`(a, b /* note */);`,
				`(a, b); /* note */
`,
			);
		});

		test('formats "(a + b /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`(a + b /* note */);`,
				`a + b; /* note */
`,
			);
		});

		test('formats "(function () {} /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`(function () {} /* note */);`,
				`(function () {}); /* note */
`,
			);
		});

		test('formats "if (a) (b, c /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`if (a) (b, c /* note */);`,
				`if (a) (b, c); /* note */
`,
			);
		});

		test('formats "(() => (a, b /* note */));" like Prettier', async () => {
			await expectPrettierFormat(
				`(() => (a, b /* note */));`,
				`() => (a, b /* note */);
`,
			);
		});

		test('formats "(() => a /* note */);" like Prettier', async () => {
			await expectPrettierFormat(
				`(() => a /* note */);`,
				`() => a; /* note */
`,
			);
		});

		test('formats "const v = f((a, b /* note */));" like Prettier', async () => {
			await expectPrettierFormat(
				`const v = f((a, b /* note */));`,
				`const v = f((a, b) /* note */);
`,
			);
		});

		test('formats "x = (a, (b /* note */));" like Prettier', async () => {
			await expectPrettierFormat(
				`x = (a, (b /* note */));`,
				`x = (a, b /* note */);
`,
			);
		});

		test('formats "x = (y = (a, b /* note */));" like Prettier', async () => {
			await expectPrettierFormat(
				`x = (y = (a, b /* note */));`,
				`x = y = (a, b /* note */);
`,
			);
		});

		test('formats "function f() {\\n  return (a, b // note\\n  );\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return (a, b // note
  );
}`,
				`function f() {
  return (
    a,
    b // note
  );
}
`,
			);
		});

		test('formats "f(() => (a, b // note\\n));" like Prettier', async () => {
			await expectPrettierFormat(
				`f(() => (a, b // note
));`,
				`f(
  () => (
    a,
    b // note
  ),
);
`,
			);
		});

		test('keeps "function f() {\\n  return !(a && b /* note */);\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  return !(a && b /* note */);
}`,
				`function f() {
  return !(a && b /* note */);
}
`,
			);
		});

		test('keeps "function f() {\\n  return (a, b); /* note */\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  return (a, b); /* note */
}`,
				`function f() {
  return (a, b); /* note */
}
`,
			);
		});

		test('keeps "function f() {\\n  throw (a, b); // note\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  throw (a, b); // note
}`,
				`function f() {
  throw (a, b); // note
}
`,
			);
		});

		test('keeps "const x = (a = b); // note"', async () => {
			await expectPrettierFormat(
				`const x = (a = b); // note`,
				`const x = (a = b); // note
`,
			);
		});

		test('keeps "const f = () => (a = b); // note"', async () => {
			await expectPrettierFormat(
				`const f = () => (a = b); // note`,
				`const f = () => (a = b); // note
`,
			);
		});

		test('keeps "x = a = b; /* note */"', async () => {
			await expectPrettierFormat(
				`x = a = b; /* note */`,
				`x = a = b; /* note */
`,
			);
		});

		test('keeps "function is_WS_OR_EOL(c) {\\n  return (\\n    c === 0x09 /* Tab */ ||\\n    c === 0x20 /* Space */ ||\\n    c === 0x0a /* LF */ ||\\n    c === 0x0d /* CR */\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function is_WS_OR_EOL(c) {
  return (
    c === 0x09 /* Tab */ ||
    c === 0x20 /* Space */ ||
    c === 0x0a /* LF */ ||
    c === 0x0d /* CR */
  );
}`,
				`function is_WS_OR_EOL(c) {
  return (
    c === 0x09 /* Tab */ ||
    c === 0x20 /* Space */ ||
    c === 0x0a /* LF */ ||
    c === 0x0d /* CR */
  );
}
`,
			);
		});

		test('keeps "function f() {\\n  return (\\n    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||\\n    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */\\n  ); /* d */\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */
  ); /* d */
}`,
				`function f() {
  return (
    aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ||
    bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb /* c */
  ); /* d */
}
`,
			);
		});

		test('keeps "x = a * (b + c) /* c */ + d;"', async () => {
			await expectPrettierFormat(
				`x = a * (b + c) /* c */ + d;`,
				`x = a * (b + c) /* c */ + d;
`,
			);
		});

		test('keeps "x = !(a || b /* c */);"', async () => {
			await expectPrettierFormat(
				`x = !(a || b /* c */);`,
				`x = !(a || b /* c */);
`,
			);
		});

		test('keeps "const x = (a = b /* c */); // d" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = (a = b /* c */); // d`,
				`const x = (a = b /* c */); // d
`,
			);
		});

		test('keeps "(a, b); /* c */ // d" like Prettier', async () => {
			await expectPrettierFormat(
				`(a, b); /* c */ // d`,
				`(a, b); /* c */ // d
`,
			);
		});

		test('keeps "const f = () => (\\n  a,\\n  b /* c */ // d\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => (
  a,
  b /* c */ // d
);`,
				`const f = () => (
  a,
  b /* c */ // d
);
`,
			);
		});

		test('keeps "function f() {\\n  return (\\n    a,\\n    b /* c */ // d\\n  );\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return (
    a,
    b /* c */ // d
  );
}`,
				`function f() {
  return (
    a,
    b /* c */ // d
  );
}
`,
			);
		});

		test('formats "const f = () => a ? b : (c /* c */);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => a ? b : (c /* c */);`,
				`const f = () => (a ? b : c /* c */);
`,
			);
		});

		test('formats "const f = () => a ? b : (c /* c */) // d\\n;" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => a ? b : (c /* c */) // d
;`,
				`const f = () => (a ? b : c /* c */); // d
`,
			);
		});

		test('formats "const f = () => (a ? b : c /* c */) // d\\n;" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => (a ? b : c /* c */) // d
;`,
				`const f = () => (a ? b : c /* c */); // d
`,
			);
		});

		test('formats "const f = (() => a ? b : (c /* c */) // d\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = (() => a ? b : (c /* c */) // d
);`,
				`const f = () => (a ? b : c /* c */); // d
`,
			);
		});

		test('formats "const f = () => a ? b : (c /* c */)\\n// d\\n;" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => a ? b : (c /* c */)
// d
;`,
				`const f = () => (a ? b : c /* c */);
// d
`,
			);
		});

		test('formats "const x = a ? <div /> : (<span /> // c\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = a ? <div /> : (<span /> // c
);`,
				`const x = a ? (
  <div />
) : (
  <span /> // c
);
`,
			);
		});

		test('formats "const x = a ? <div /> : (c // c\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = a ? <div /> : (c // c
);`,
				`const x = a ? (
  <div />
) : (
  c // c
);
`,
			);
		});

		test('formats "let x = a ? b : (c /* c */), y = 1;" like Prettier', async () => {
			await expectPrettierFormat(
				`let x = a ? b : (c /* c */), y = 1;`,
				`let x = a ? b : c /* c */,
  y = 1;
`,
			);
		});

		test('formats "const x = a ? (b /* c */) : c;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = a ? (b /* c */) : c;`,
				`const x = a ? b /* c */ : c;
`,
			);
		});

		test('formats "x = !(a ? b : c /* c */);" like Prettier', async () => {
			await expectPrettierFormat(
				`x = !(a ? b : c /* c */);`,
				`x = !((a ? b : c) /* c */);
`,
			);
		});

		test('formats "x = f(a ? b : (c /* c */));" like Prettier', async () => {
			await expectPrettierFormat(
				`x = f(a ? b : (c /* c */));`,
				`x = f(a ? b : c /* c */);
`,
			);
		});

		test('keeps "const f = () => (a ? b : c /* c */ /* d */);"', async () => {
			await expectPrettierFormat(
				`const f = () => (a ? b : c /* c */ /* d */);`,
				`const f = () => (a ? b : c /* c */ /* d */);
`,
			);
		});

		test('formats "const x = (b\\n/* c */);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (b
/* c */);`,
				`const x = b;
/* c */
`,
			);
		});

		test('formats "const x = (foo(a, b)\\n/* c */);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (foo(a, b)
/* c */);`,
				`const x = foo(a, b);
/* c */
`,
			);
		});

		test('formats "function f() {\\n  return (b\\n  // c\\n  );\\n}" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`function f() {
  return (b
  // c
  );
}`,
				`function f() {
  return b;
  // c
}
`,
			);
		});

		test('formats "(a, b\\n// c\\n);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`(a, b
// c
);`,
				`(a, b);
// c
`,
			);
		});

		test('formats "const x = a || b\\n// c\\n;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = a || b
// c
;`,
				`const x = a || b;
// c
`,
			);
		});

		test('formats "x = !(a\\n// c\\n);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`x = !(a
// c
);`,
				`x = !(
  a
  // c
);
`,
			);
		});

		test('formats "x = f(a\\n// c\\n);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`x = f(a
// c
);`,
				`x = f(
  a,
  // c
);
`,
			);
		});

		test('formats "const x = (<div />\\n// c\\n);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (<div />
// c
);`,
				`const x = (
  <div />
  // c
);
`,
			);
		});

		test('formats "x = a && (<Note />\\n// c\\n);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`x = a && (<Note />
// c
);`,
				`x = a && (
  <Note />
  // c
);
`,
			);
		});

		test('formats "const x = a ? <div /> : (c\\n// c\\n);" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = a ? <div /> : (c
// c
);`,
				`const x = a ? (
  <div />
) : (
  c
  // c
);
`,
			);
		});

		test('formats "const x = (a, b /* c */), y = 1;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (a, b /* c */), y = 1;`,
				`const x = (a, b /* c */),
  y = 1;
`,
			);
		});

		test('formats "const x = a || (b /* c */), y = 1;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = a || (b /* c */), y = 1;`,
				`const x = a || b /* c */,
  y = 1;
`,
			);
		});

		test('formats "const x = (b // d\\n), y = 1;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (b // d
), y = 1;`,
				`const x = b, // d
  y = 1;
`,
			);
		});

		test('formats "const x = (a = b // d\\n), y = 1;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (a = b // d
), y = 1;`,
				`const x = (a = b), // d
  y = 1;
`,
			);
		});

		test('formats "const x = (a, b) // d\\n, y = 1;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = (a, b) // d
, y = 1;`,
				`const x = (a, b), // d
  y = 1;
`,
			);
		});

		test('formats "const x = () => (a, b // d\\n), y = 1;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`const x = () => (a, b // d
), y = 1;`,
				`const x = () => (
    a,
    b // d
  ),
  y = 1;
`,
			);
		});

		test('formats "let x = f(1 // c\\n), y = 2;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`let x = f(1 // c
), y = 2;`,
				`let x = f(
    1, // c
  ),
  y = 2;
`,
			);
		});

		test('keeps the blank line after "let x = 1 // c\\n;\\n\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`let x = 1 // c
;

b();`,
				`let x = 1; // c

b();
`,
			);
		});

		test('keeps the blank line after "(foo() /* c */\\n);\\n\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`(foo() /* c */
);

b();`,
				`foo(); /* c */

b();
`,
			);
		});

		test('keeps the blank line after "({ a } = c /* c */\\n);\\n\\nb();" like Prettier', async () => {
			await expectPrettierFormat(
				`({ a } = c /* c */
);

b();`,
				`({ a } = c); /* c */

b();
`,
			);
		});

		test('formats "for (;;) continue // comment\\n;\\nfoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`for (;;) continue // comment
;
foo();`,
				`for (;;) continue; // comment
foo();
`,
			);
		});

		test('formats "while (a) break /* comment */\\n;\\nfoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`while (a) break /* comment */
;
foo();`,
				`while (a) break; /* comment */
foo();
`,
			);
		});

		test('formats "for (;;) continue // comment\\n;\\nfoo() // x" like Prettier', async () => {
			await expectPrettierFormat(
				`for (;;) continue // comment
;
foo() // x`,
				`for (;;) continue; // comment
foo(); // x
`,
			);
		});

		test('formats "for (;;) {\\n  continue // comment\\n  ;\\n  foo();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`for (;;) {
  continue // comment
  ;
  foo();
}`,
				`for (;;) {
  continue; // comment
  foo();
}
`,
			);
		});

		test('formats "function f() {\\n  return // c\\n  ;\\n  foo();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return // c
  ;
  foo();
}`,
				`function f() {
  return; // c
  foo();
}
`,
			);
		});

		test('formats "debugger /* c */ /* d */\\n;\\nfoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`debugger /* c */ /* d */
;
foo();`,
				`debugger; /* c */ /* d */
foo();
`,
			);
		});

		test('formats "for (;;) continue /* c */;\\nfoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`for (;;) continue /* c */;
foo();`,
				`for (;;) continue; /* c */
foo();
`,
			);
		});

		test('formats "switch (a) {\\n  case 1:\\n    break // c\\n    ;\\n  case 2:\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`switch (a) {
  case 1:
    break // c
    ;
  case 2:
}`,
				`switch (a) {
  case 1:
    break; // c
  case 2:
}
`,
			);
		});

		test('formats "while (a) break /* comment */\\n  /* d */ ;\\nfoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`while (a) break /* comment */
  /* d */ ;
foo();`,
				`while (a) break; /* comment */
/* d */ foo();
`,
			);
		});

		test('formats "do continue // c\\n; while (a);" like Prettier', async () => {
			await expectPrettierFormat(
				`do continue // c
; while (a);`,
				`do
  continue; // c
while (a);
`,
			);
		});

		test('formats "for (;;) continue // comment\\n;" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`for (;;) continue // comment
;`,
				`for (;;) continue; // comment
`,
			);
		});

		test('formats "a: for (;;) break a // c\\n;\\nfoo();" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`a: for (;;) break a // c
;
foo();`,
				`a: for (;;) break a; // c
foo();
`,
			);
		});

		test('formats "while (a) break\\n  /* comment */\\n  ;\\nfoo();" like Prettier, as before', async () => {
			await expectPrettierFormat(
				`while (a) break
  /* comment */
  ;
foo();`,
				`while (a) break;
/* comment */
foo();
`,
			);
		});

		test('formats "foo() // a\\n; // b\\nbar();" like Prettier', async () => {
			await expectPrettierFormat(
				`foo() // a
; // b
bar();`,
				`foo(); // a
// b
bar();
`,
			);
		});

		test('formats "function f() {\\n  return x // a\\n  ; // b\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f() {
  return x // a
  ; // b
}`,
				`function f() {
  return x; // a
  // b
}
`,
			);
		});

		test('formats "let x = 1 // a\\n; /* b */" like Prettier', async () => {
			await expectPrettierFormat(
				`let x = 1 // a
; /* b */`,
				`let x = 1; // a
/* b */
`,
			);
		});

		test('formats "for (;;) continue // a\\n; // b\\nfoo();" like Prettier', async () => {
			await expectPrettierFormat(
				`for (;;) continue // a
; // b
foo();`,
				`for (;;) continue; // a
// b
foo();
`,
			);
		});

		test('keeps the comments of "const o = {\\n  a: 1\\n  /** b *//**\\n  * c\\n  */\\n};" in order', async () => {
			await expectPrettierFormat(
				`const o = {
  a: 1
  /** b *//**
  * c
  */
};`,
				`const o = {
  a: 1,
  /** b */ /**
   * c
   */
};
`,
			);
		});

		test('keeps the comments of "function f() {}\\n/** a\\n *//** b\\n */" in order', async () => {
			await expectPrettierFormat(
				`function f() {}
/** a
 *//** b
 */`,
				`function f() {}
/** a
 *//** b
 */
`,
			);
		});

		test('keeps the comments of "const o = {\\n  a: 1,\\n  /** b *//** c */\\n};" in order', async () => {
			await expectPrettierFormat(
				`const o = {
  a: 1,
  /** b *//** c */
};`,
				`const o = {
  a: 1,
  /** b */ /** c */
};
`,
			);
		});

		test('keeps the comments of "let x = 1 /* a */ // b\\n;" on their lines like Prettier', async () => {
			await expectPrettierFormat(
				`let x = 1 /* a */ // b
;`,
				`let x = 1; /* a */ // b
`,
			);
		});

		test('keeps the comments of "foo() /* a */ /* b */;" on their lines like Prettier', async () => {
			await expectPrettierFormat(
				`foo() /* a */ /* b */;`,
				`foo(); /* a */ /* b */
`,
			);
		});

		test('keeps the comments of "foo(); // a\\n// b" on their lines like Prettier', async () => {
			await expectPrettierFormat(
				`foo(); // a
// b`,
				`foo(); // a
// b
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "const x = 1\\n// c\\n;"', async () => {
			await expectPrettierFormat(
				`const x = 1
// c
;`,
				`const x = 1;
// c
`,
			);
			await expectPrettierFormat(
				`const x = 1
// c
;
`,
				`const x = 1;
// c
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "foo()\\n// c\\n;"', async () => {
			await expectPrettierFormat(
				`foo()
// c
;`,
				`foo();
// c
`,
			);
			await expectPrettierFormat(
				`foo()
// c
;
`,
				`foo();
// c
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "const maps = {\\n}\\n// c\\n;"', async () => {
			await expectPrettierFormat(
				`const maps = {
}
// c
;`,
				`const maps = {};
// c
`,
			);
			await expectPrettierFormat(
				`const maps = {
}
// c
;
`,
				`const maps = {};
// c
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "const x = 1\\n/* c */\\n;"', async () => {
			await expectPrettierFormat(
				`const x = 1
/* c */
;`,
				`const x = 1;
/* c */
`,
			);
			await expectPrettierFormat(
				`const x = 1
/* c */
;
`,
				`const x = 1;
/* c */
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "const x = 1\\n// prettier-ignore\\n;"', async () => {
			await expectPrettierFormat(
				`const x = 1
// prettier-ignore
;`,
				`const x = 1;
// prettier-ignore
`,
			);
			await expectPrettierFormat(
				`const x = 1
// prettier-ignore
;
`,
				`const x = 1;
// prettier-ignore
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "if (a) b()\\n// c\\n;"', async () => {
			await expectPrettierFormat(
				`if (a) b()
// c
;`,
				`if (a) b();
// c
`,
			);
			await expectPrettierFormat(
				`if (a) b()
// c
;
`,
				`if (a) b();
// c
`,
			);
		});

		test('keeps the comment before the ; that ends the file in "export default foo\\n// c\\n;"', async () => {
			await expectPrettierFormat(
				`export default foo
// c
;`,
				`export default foo;
// c
`,
			);
			await expectPrettierFormat(
				`export default foo
// c
;
`,
				`export default foo;
// c
`,
			);
		});
	});

	describe('multi-line block comments keep their indentation', () => {
		test('keeps "function save() {\\n  if (dirty) {\\n    /*\\n     * Flush before closing.\\n     */\\n    flush();\\n  }\\n}"', async () => {
			await expectPrettierFormat(
				`function save() {
  if (dirty) {
    /*
     * Flush before closing.
     */
    flush();
  }
}`,
				`function save() {
  if (dirty) {
    /*
     * Flush before closing.
     */
    flush();
  }
}
`,
			);
		});

		test('keeps "class A {\\n  /**\\n   * Doc.\\n   * @param {string} a\\n   */\\n  m(a) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  /**
   * Doc.
   * @param {string} a
   */
  m(a) {}
}`,
				`class A {
  /**
   * Doc.
   * @param {string} a
   */
  m(a) {}
}
`,
			);
		});

		test('keeps "const o = {\\n  /**\\n   * Doc.\\n   */\\n  a: 1,\\n};"', async () => {
			await expectPrettierFormat(
				`const o = {
  /**
   * Doc.
   */
  a: 1,
};`,
				`const o = {
  /**
   * Doc.
   */
  a: 1,
};
`,
			);
		});

		test('keeps "function f() {\\n  const x = 1; /*\\n   * trailing\\n   */\\n  return x;\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  const x = 1; /*
   * trailing
   */
  return x;
}`,
				`function f() {
  const x = 1; /*
   * trailing
   */
  return x;
}
`,
			);
		});

		test('keeps "function save() {\\n  if (dirty) {\\n    /* not\\n       indentable\\n         at all */\\n    flush();\\n  }\\n}"', async () => {
			await expectPrettierFormat(
				`function save() {
  if (dirty) {
    /* not
       indentable
         at all */
    flush();
  }
}`,
				`function save() {
  if (dirty) {
    /* not
       indentable
         at all */
    flush();
  }
}
`,
			);
		});

		test('keeps "function f() {\\n  /**\\n   * Markdown break  \\n   * next line\\n   */\\n  x();\\n}"', async () => {
			await expectPrettierFormat(
				`function f() {
  /**
   * Markdown break  
   * next line
   */
  x();
}`,
				`function f() {
  /**
   * Markdown break  
   * next line
   */
  x();
}
`,
			);
		});

		test('lines up a misaligned comment under its first line', async () => {
			await expectPrettierFormat(
				`function save() {
  if (dirty) {
      /*
         * Misaligned.
             */
    flush();
  }
}`,
				`function save() {
  if (dirty) {
    /*
     * Misaligned.
     */
    flush();
  }
}
`,
			);
		});
	});

	describe('comments in a switch with no cases', () => {
		test('keeps "switch (x) {\\n  // a\\n}"', async () => {
			await expectPrettierFormat(
				`switch (x) {
  // a
}`,
				`switch (x) {
  // a
}
`,
			);
		});

		test('keeps "switch (x) {\\n  /* a */\\n}"', async () => {
			await expectPrettierFormat(
				`switch (x) {
  /* a */
}`,
				`switch (x) {
  /* a */
}
`,
			);
		});

		test('keeps "switch (x) {\\n  // a\\n  // b\\n}"', async () => {
			await expectPrettierFormat(
				`switch (x) {
  // a
  // b
}`,
				`switch (x) {
  // a
  // b
}
`,
			);
		});

		test('keeps a comment between ) and { inside the parentheses, like Prettier', async () => {
			await expectPrettierFormat(
				`switch (x) /* c */ {
}`,
				`switch (x /* c */) {
}
`,
			);
		});
	});

	describe('return, throw, and yield arguments that start with a comment over several lines', () => {
		test('prints "function h() {\\n  return (\\n    /**\\n     * doc\\n     */ \\"result\\"\\n  );\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function h() {
  return (
    /**
     * doc
     */ "result"
  );
}`,
				`function h() {
  return (
    /**
     * doc
     */ "result"
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  return /* a b */ foo;\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return /* a b */ foo;
}`,
				`function g() {
  return /* a b */ foo;
}
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    /* a\\n    b */ foo + bar\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    /* a
    b */ foo + bar
  );
}`,
				`function g() {
  return (
    /* a
    b */ foo + bar
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    /* a\\n    b */ <div />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    /* a
    b */ <div />
  );
}`,
				`function g() {
  return (
    /* a
    b */ <div />
  );
}
`,
			);
		});

		test('keeps "function* g() {\\n  yield* /* a\\n    b */ foo;\\n}"', async () => {
			await expectPrettierFormat(
				`function* g() {
  yield* /* a
    b */ foo;
}`,
				`function* g() {
  yield* /* a
    b */ foo;
}
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    /* a\\n    b */ function () {}\\n  )();\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    /* a
    b */ function () {}
  )();
}`,
				`function g() {
  return (
    /* a
    b */ function () {}
  )();
}
`,
			);
		});

		test('keeps "function* g() {\\n  yield (\\n    /* a\\n    b */ function () {}\\n  )();\\n}"', async () => {
			await expectPrettierFormat(
				`function* g() {
  yield (
    /* a
    b */ function () {}
  )();
}`,
				`function* g() {
  yield (
    /* a
    b */ function () {}
  )();
}
`,
			);
		});
	});

	describe('yield arguments that start with a comment', () => {
		test('prints "function* values() {\\n  yield /* inline */ 42;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function* values() {
  yield /* inline */ 42;
}`,
				`function* values() {
  yield /* inline */ 42;
}
`,
			);
		});

		test('prints "function* values() {\\n  yield* // delegate\\n  other();\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`function* values() {
  yield* // delegate
  other();
}`,
				`function* values() {
  yield* // delegate
  other();
}
`,
			);
		});
	});

	describe('elements print comments that break the line inside their parentheses', () => {
		test('keeps "function g() {\\n  return (\\n    // note\\n    <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    // note
    <Note />
  );
}`,
				`function g() {
  return (
    // note
    <Note />
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  throw (\\n    // note\\n    <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  throw (
    // note
    <Note />
  );
}`,
				`function g() {
  throw (
    // note
    <Note />
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    /* note */\\n    <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    /* note */
    <Note />
  );
}`,
				`function g() {
  return (
    /* note */
    <Note />
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    // note\\n    <>\\n      <a />\\n    </>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    // note
    <>
      <a />
    </>
  );
}`,
				`function g() {
  return (
    // note
    <>
      <a />
    </>
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  throw (\\n    /* note */\\n    <>\\n      <a />\\n    </>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  throw (
    /* note */
    <>
      <a />
    </>
  );
}`,
				`function g() {
  throw (
    /* note */
    <>
      <a />
    </>
  );
}
`,
			);
		});

		test('keeps "function* g() {\\n  yield (\\n    // note\\n    <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function* g() {
  yield (
    // note
    <Note />
  );
}`,
				`function* g() {
  yield (
    // note
    <Note />
  );
}
`,
			);
		});

		test('keeps "async function g() {\\n  await (\\n    // note\\n    <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`async function g() {
  await (
    // note
    <Note />
  );
}`,
				`async function g() {
  await (
    // note
    <Note />
  );
}
`,
			);
		});

		test('keeps "export default (\\n  // note\\n  <Note />\\n);"', async () => {
			await expectPrettierFormat(
				`export default (
  // note
  <Note />
);`,
				`export default (
  // note
  <Note />
);
`,
			);
		});

		test('keeps "x = a && (\\n  // note\\n  <Note />\\n);"', async () => {
			await expectPrettierFormat(
				`x = a && (
  // note
  <Note />
);`,
				`x = a && (
  // note
  <Note />
);
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    // note\\n    <Note />\\n  ).props;\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    // note
    <Note />
  ).props;
}`,
				`function g() {
  return (
    // note
    <Note />
  ).props;
}
`,
			);
		});

		test('keeps "function g() {\\n  return (// note\\n  <Note />)();\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (// note
  <Note />)();
}`,
				`function g() {
  return (// note
  <Note />)();
}
`,
			);
		});

		test('keeps "function g() {\\n  return (\\n    /**\\n     * note\\n     */ <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  return (
    /**
     * note
     */ <Note />
  );
}`,
				`function g() {
  return (
    /**
     * note
     */ <Note />
  );
}
`,
			);
		});

		test('keeps "function g() {\\n  throw (\\n    /* note\\n    more */ <Note />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function g() {
  throw (
    /* note
    more */ <Note />
  );
}`,
				`function g() {
  throw (
    /* note
    more */ <Note />
  );
}
`,
			);
		});

		test('keeps "function* g() {\\n  yield (\\n    /**\\n     * note\\n     */ <></>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function* g() {
  yield (
    /**
     * note
     */ <></>
  );
}`,
				`function* g() {
  yield (
    /**
     * note
     */ <></>
  );
}
`,
			);
		});

		test('keeps the trailing comment inside the parentheses in "const x = (\\n  <Note />\\n  // note\\n);"', async () => {
			await expectPrettierFormat(
				`const x = (
  <Note />
  // note
);`,
				`const x = (
  <Note />
  // note
);
`,
			);
		});

		test('keeps the trailing comment inside the parentheses in "const x = (\\n  <Note />\\n  /* note */\\n);"', async () => {
			await expectPrettierFormat(
				`const x = (
  <Note />
  /* note */
);`,
				`const x = (
  <Note />
  /* note */
);
`,
			);
		});

		test('keeps the trailing comment inside the parentheses in "x = a && (\\n  <Note /> // note\\n);"', async () => {
			await expectPrettierFormat(
				`x = a && (
  <Note /> // note
);`,
				`x = a && (
  <Note /> // note
);
`,
			);
		});

		test('keeps the trailing comment inside the parentheses in "x = a && (\\n  <Note /> /* note\\n  more */\\n);"', async () => {
			await expectPrettierFormat(
				`x = a && (
  <Note /> /* note
  more */
);`,
				`x = a && (
  <Note /> /* note
  more */
);
`,
			);
		});

		test('keeps the trailing comment inside the parentheses in "const f = () => (\\n  <Note /> // note\\n);"', async () => {
			await expectPrettierFormat(
				`const f = () => (
  <Note /> // note
);`,
				`const f = () => (
  <Note /> // note
);
`,
			);
		});

		test('keeps the comment after the arrow body inside the parentheses in "const f = () => (\\n  <Note />\\n  // note\\n);"', async () => {
			await expectPrettierFormat(
				`const f = () => (
  <Note />
  // note
);`,
				`const f = () => (
  <Note />
  // note
);
`,
			);
		});

		test('keeps the comment after the arrow body inside the parentheses in "const f = () => (\\n  <>\\n    <Note />\\n  </>\\n  /* note */\\n);"', async () => {
			await expectPrettierFormat(
				`const f = () => (
  <>
    <Note />
  </>
  /* note */
);`,
				`const f = () => (
  <>
    <Note />
  </>
  /* note */
);
`,
			);
		});

		test('keeps the comment after the arrow body inside the parentheses in "foo(() => (\\n  <Note />\\n  // note\\n));"', async () => {
			await expectPrettierFormat(
				`foo(() => (
  <Note />
  // note
));`,
				`foo(() => (
  <Note />
  // note
));
`,
			);
		});

		test('keeps the comment after the arrow body inside the parentheses in "function App() {\\n  return (\\n    <ul>\\n      {items.map((item) => (\\n        <li>{item}</li>\\n        // note\\n      ))}\\n    </ul>\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <ul>
      {items.map((item) => (
        <li>{item}</li>
        // note
      ))}
    </ul>
  );
}`,
				`function App() {
  return (
    <ul>
      {items.map((item) => (
        <li>{item}</li>
        // note
      ))}
    </ul>
  );
}
`,
			);
		});

		test('keeps the comment after the arrow body inside the parentheses in "function App() {\\n  return (\\n    <Button\\n      onClick={() => (\\n        <a />\\n        // note\\n      )}\\n    />\\n  );\\n}"', async () => {
			await expectPrettierFormat(
				`function App() {
  return (
    <Button
      onClick={() => (
        <a />
        // note
      )}
    />
  );
}`,
				`function App() {
  return (
    <Button
      onClick={() => (
        <a />
        // note
      )}
    />
  );
}
`,
			);
		});

		test('prints "const f = () =>\\n  // note\\n  <Note />;" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () =>
  // note
  <Note />;`,
				`const f = () => (
  // note
  <Note />
);
`,
			);
		});

		test('prints "const f = (a) => (b) =>\\n  // note\\n  <Note />;" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = (a) => (b) =>
  // note
  <Note />;`,
				`const f = (a) => (b) => (
  // note
  <Note />
);
`,
			);
		});

		test('prints "const x =\\n  // note\\n  <Note />;" like Prettier', async () => {
			await expectPrettierFormat(
				`const x =
  // note
  <Note />;`,
				`const x = (
  // note
  <Note />
);
`,
			);
		});

		test('prints "class A {\\n  x =\\n    // note\\n    <Note />;\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  x =
    // note
    <Note />;
}`,
				`class A {
  x = (
    // note
    <Note />
  );
}
`,
			);
		});

		test('prints "const f = () => (/**\\n * note\\n */ <Note />);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = () => (/**
 * note
 */ <Note />);`,
				`const f = () => (
  /**
   * note
   */ <Note />
);
`,
			);
		});

		test('prints "function g() {\\n  return /* note */ <Note />;\\n}" without parentheses of its own', async () => {
			await expectPrettierFormat(
				`function g() {
  return /* note */ <Note />;
}`,
				`function g() {
  return /* note */ <Note />;
}
`,
			);
		});

		test('prints "foo(\\n  // note\\n  <Note />,\\n);" without parentheses of its own', async () => {
			await expectPrettierFormat(
				`foo(
  // note
  <Note />,
);`,
				`foo(
  // note
  <Note />,
);
`,
			);
		});

		test('prints "const x = [\\n  // note\\n  <Note />,\\n];" without parentheses of its own', async () => {
			await expectPrettierFormat(
				`const x = [
  // note
  <Note />,
];`,
				`const x = [
  // note
  <Note />,
];
`,
			);
		});

		test('prints "x = a && <Note />; // note" without parentheses of its own', async () => {
			await expectPrettierFormat(
				`x = a && <Note />; // note`,
				`x = a && <Note />; // note
`,
			);
		});

		test('prints "const x = <Note />; /* note */" without parentheses of its own', async () => {
			await expectPrettierFormat(
				`const x = <Note />; /* note */`,
				`const x = <Note />; /* note */
`,
			);
		});
	});

	describe('labeled statements', () => {
		test('keeps labeled loops and blocks', async () => {
			await expectPrettierFormat(
				`outer: for (const row of rows) {
  for (const cell of row) {
    if (cell) continue outer;
  }
}
block: {
  break block;
}
label:;`,
				`outer: for (const row of rows) {
  for (const cell of row) {
    if (cell) continue outer;
  }
}
block: {
  break block;
}
label:;
`,
			);
		});

		test('keeps the labeled statement a: b: while (true) break a;', async () => {
			await expectPrettierFormat(
				`a: b: while (true) break a;`,
				`a: b: while (true) break a;
`,
			);
		});

		test('keeps the labeled statement loop: do {\n  continue loop;\n} while (next());', async () => {
			await expectPrettierFormat(
				`loop: do {
  continue loop;
} while (next());`,
				`loop: do {
  continue loop;
} while (next());
`,
			);
		});

		test('keeps the labeled statement check: if (a) {\n  break check;\n}', async () => {
			await expectPrettierFormat(
				`check: if (a) {
  break check;
}`,
				`check: if (a) {
  break check;
}
`,
			);
		});

		test('keeps the labeled statement attempt: try {\n  break attempt;\n} finally {\n  done();\n}', async () => {
			await expectPrettierFormat(
				`attempt: try {
  break attempt;
} finally {
  done();
}`,
				`attempt: try {
  break attempt;
} finally {
  done();
}
`,
			);
		});

		test('keeps the labeled statement count: n++;', async () => {
			await expectPrettierFormat(
				`count: n++;`,
				`count: n++;
`,
			);
		});

		test('keeps the labeled statement switch (x) {\n  case 1:\n    inner: for (;;) break inner;\n}', async () => {
			await expectPrettierFormat(
				`switch (x) {
  case 1:
    inner: for (;;) break inner;
}`,
				`switch (x) {
  case 1:
    inner: for (;;) break inner;
}
`,
			);
		});

		test('keeps labels with semi: false', async () => {
			await expectPrettierFormat(
				`outer: for (;;) {
  continue outer
}
label:;`,
				`outer: for (;;) {
  continue outer
}
label:;
`,
				{ semi: false },
			);
		});

		test('expands an empty labeled block like Prettier', async () => {
			await expectPrettierFormat(
				`empty: {}`,
				`empty: {
}
`,
			);
		});

		test('moves a comment that starts or ends its line above the label', async () => {
			await expectPrettierFormat(
				`a: // empty
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
}`,
				`// empty
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
}
`,
			);
		});

		test('keeps an inline comment on its side of the colon', async () => {
			await expectPrettierFormat(
				`a /* before */: for (;;) {
  break a;
}
b: /* after */ run();
c: /* empty */ ;`,
				`a /* before */: for (;;) {
  break a;
}
b: /* after */ run();
c: /* empty */ ;
`,
			);
		});

		test('keeps an own-line block comment on the label line when the body follows it', async () => {
			await expectPrettierFormat(
				`a:
/* call */ run();`,
				`/* call */ a: run();
`,
			);
		});

		test('keeps the source of a statement whose label is followed by prettier-ignore', async () => {
			await expectPrettierFormat(
				`a: // prettier-ignore
for (  ;; ) {  break a }
b:   for (;;) {  break b }`,
				`a: // prettier-ignore
for (  ;; ) {  break a }
b: for (;;) {
  break b;
}
`,
			);
		});
	});

	describe('variable initializer layouts follow Prettier', () => {
		test('keeps the short conditional initializer const g = a || b ? c : d; on one line', async () => {
			await expectPrettierFormat(
				`const g = a || b ? c : d;`,
				`const g = a || b ? c : d;
`,
			);
		});

		test('keeps the short conditional initializer const x = a ? (b ? c : d) : e; on one line', async () => {
			await expectPrettierFormat(
				`const x = a ? (b ? c : d) : e;`,
				`const x = a ? (b ? c : d) : e;
`,
			);
		});

		test('keeps the short conditional initializer const y = a ? b : c ? d : e; on one line', async () => {
			await expectPrettierFormat(
				`const y = a ? b : c ? d : e;`,
				`const y = a ? b : c ? d : e;
`,
			);
		});

		test('keeps the short conditional initializer const w = cond ? call(argumentOne, argumentTwo) : other; on one line', async () => {
			await expectPrettierFormat(
				`const w = cond ? call(argumentOne, argumentTwo) : other;`,
				`const w = cond ? call(argumentOne, argumentTwo) : other;
`,
			);
		});

		test('breaks after = before a conditional with a binary test', async () => {
			await expectPrettierFormat(
				`const z =
  isSomethingVeryLong || otherCondition
    ? someVeryLongValueNameHere
    : anotherLongValue;`,
				`const z =
  isSomethingVeryLong || otherCondition
    ? someVeryLongValueNameHere
    : anotherLongValue;
`,
			);
		});

		test('keeps any other conditional test on the = line', async () => {
			await expectPrettierFormat(
				`const v = cond
  ? call(argumentOne, argumentTwo, argumentThree, argumentFour)
  : otherValueHere;
const u = cond
  ? () => {
      run();
    }
  : null;`,
				`const v = cond
  ? call(argumentOne, argumentTwo, argumentThree, argumentFour)
  : otherValueHere;
const u = cond
  ? () => {
      run();
    }
  : null;
`,
			);
		});
	});

	describe('variable initializer layouts follow Prettier > keeps the short conditional initializer const i = a', () => {
		test('1 ? b : c; on one line', async () => {
			await expectPrettierFormat(
				`const i = a > 1 ? b : c;`,
				`const i = a > 1 ? b : c;
`,
			);
		});
	});

	describe('declarations with several declarators', () => {
		test('puts each declarator on its own line once one has a value', async () => {
			await expectPrettierFormat(
				`const a = 1, b = 2, c = 3;
var g = 1, h;
export const i = 1, j = 2;
let x = {
  a: 1,
}, y = [1, 2];`,
				`const a = 1,
  b = 2,
  c = 3;
var g = 1,
  h;
export const i = 1,
  j = 2;
let x = {
    a: 1,
  },
  y = [1, 2];
`,
			);
		});

		test('breaks declarators without values only when they do not fit', async () => {
			await expectPrettierFormat(
				`let d, e, f;
declare const k: string, l: number;
let aaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccccc;`,
				`let d, e, f;
declare const k: string, l: number;
let aaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccccc;
`,
			);
		});

		test('keeps a line comment after a declarator in place', async () => {
			await expectPrettierFormat(
				`const first = 1, // one
  second = 2;`,
				`const first = 1, // one
  second = 2;
`,
			);
		});

		test('keeps a declaration with a trailing prettier-ignore comment as written', async () => {
			await expectPrettierFormat(
				`function g(a, x) {
  const Xl = msg[x], Xh = msg[x + 1]; // prettier-ignore
  let Al = BBUF[2 * a],   Ah = BBUF[2 * a + 1]; // prettier-ignore
}
export const b = 1,   c = 2; // prettier-ignore
let   q = [1,2,
  3]; // prettier-ignore`,
				`function g(a, x) {
  const Xl = msg[x], Xh = msg[x + 1]; // prettier-ignore
  let Al = BBUF[2 * a],   Ah = BBUF[2 * a + 1]; // prettier-ignore
}
export const b = 1,   c = 2; // prettier-ignore
let   q = [1,2,
  3]; // prettier-ignore
`,
			);
		});

		test('keeps the comments between declarators in order', async () => {
			await expectPrettierFormat(
				`var a, // first
  // second
  b;
var c = 1, // first
  // second
  d = 2;`,
				`var a, // first
  // second
  b;
var c = 1, // first
  // second
  d = 2;
`,
			);
		});

		test('keeps the declarators of a for head on one line while they fit', async () => {
			await expectPrettierFormat(
				`for (let i = 0, j = 10; i < j; i++) {
  run(i, j);
}`,
				`for (let i = 0, j = 10; i < j; i++) {
  run(i, j);
}
`,
			);
		});
	});

	describe('assignment layouts follow Prettier', () => {
		test('breaks after = before a string or a member chain that does not fit', async () => {
			await expectPrettierFormat(
				`const message = "a long string value that does not fit on one line with the declaration";
class A {
  static message = "a long string value that does not fit on one line with the field";
}
const value = someObject.someProperty.anotherProperty.yetAnotherProperty.finalProp;
message = "a long string value that does not fit on one line with the assignment exp";`,
				`const message =
  "a long string value that does not fit on one line with the declaration";
class A {
  static message =
    "a long string value that does not fit on one line with the field";
}
const value =
  someObject.someProperty.anotherProperty.yetAnotherProperty.finalProp;
message =
  "a long string value that does not fit on one line with the assignment exp";
`,
			);
		});

		test('breaks after = before an awaited, negated, or short-argument call chain', async () => {
			await expectPrettierFormat(
				`const entries = await someObject.someProperty.anotherProperty.collectAllEntries();
const negated = !someObject.someProperty.anotherProperty.yetAnotherProperty.flag;
const count = someObject.someProperty.anotherProperty.yetAnotherProperty.count(id);`,
				`const entries =
  await someObject.someProperty.anotherProperty.collectAllEntries();
const negated =
  !someObject.someProperty.anotherProperty.yetAnotherProperty.flag;
const count =
  someObject.someProperty.anotherProperty.yetAnotherProperty.count(id);
`,
			);
		});

		test('breaks after : or = before a binary value without indenting it twice', async () => {
			await expectPrettierFormat(
				`const options = {
  description: someVeryLongVariableNameNumberOne + someVeryLongVariableNameNumberTwoooooooo,
};
class A {
  description = someVeryLongVariableNameNumberOne + someVeryLongVariableNameNumberTwoooooooo;
}`,
				`const options = {
  description:
    someVeryLongVariableNameNumberOne +
    someVeryLongVariableNameNumberTwoooooooo,
};
class A {
  description =
    someVeryLongVariableNameNumberOne +
    someVeryLongVariableNameNumberTwoooooooo;
}
`,
			);
		});

		test('breaks after : or = before a logical value without indenting it twice', async () => {
			await expectPrettierFormat(
				`class A {
  enabled = someVeryLongVariableNameNumberOne && someVeryLongVariableNameNumberTwoooooooo;
}
const options = {
  enabled: someVeryLongVariableNameNumberOne || someVeryLongVariableNameNumberTwoooooooo,
};
options.enabled = someVeryLongVariableNameNumberOne ?? someVeryLongVariableNameNumberTwoooooooooo;
const enabled = someVeryLongVariableNameNumberOne && someVeryLongVariableNameNumberTwoooooooooooo;`,
				`class A {
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
  someVeryLongVariableNameNumberTwoooooooooooo;
`,
			);
		});

		test('keeps a value that can break by itself on the operator line', async () => {
			await expectPrettierFormat(
				`const result = someFunction(
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
} = someObject.withSomeProperty;`,
				`const result = someFunction(
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
} = someObject.withSomeProperty;
`,
			);
		});

		test('measures a short key by its width', async () => {
			await expectPrettierFormat(
				`const o = {
  古今: "https://prettier.io/docs/en/rationale.html#what-prettier-is-concerned-about",
  古体诗:
    "https://prettier.io/docs/en/rationale.html#what-prettier-is-concerned-about",
};`,
				`const o = {
  古今: "https://prettier.io/docs/en/rationale.html#what-prettier-is-concerned-about",
  古体诗:
    "https://prettier.io/docs/en/rationale.html#what-prettier-is-concerned-about",
};
`,
			);
		});

		test('lays out a chain of three or more assignments', async () => {
			await expectPrettierFormat(
				`window.aaaaaaaaaaaaaaaaaa = window.bbbbbbbbbbbbbbbbbbbbbbbb = window.cccccccccccccccccccc = someValue;
a = b = c;`,
				`window.aaaaaaaaaaaaaaaaaa =
  window.bbbbbbbbbbbbbbbbbbbbbbbb =
  window.cccccccccccccccccccc =
    someValue;
a = b = c;
`,
			);
		});

		test('breaks a type alias inside its type when the type can break', async () => {
			await expectPrettierFormat(
				`type T = Foo<aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc>;
type Pair<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccccccccccccc> = Foo<Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa>;
type Props = BaseProps & { children: string; onClick: () => void; className: string };`,
				`type T = Foo<
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
};
`,
			);
		});

		test('breaks a type alias after = before a union or a generic conditional type', async () => {
			await expectPrettierFormat(
				`type Choice = "aaaaaaaaaaaaaaaaaaaa" | "bbbbbbbbbbbbbbbbbbbbbbbb" | "cccccccccccccccccccccccccc";
type Unwrapped<T> = T extends Promise<infer U> ? UnwrapTheValueOfThisPromise<U> : NotAPromise<T>;
type Checked<T> = T extends string ? SomeVeryLongTypeNameForStrings<T> : SomeOtherVeryLongType<T>;`,
				`type Choice =
  | "aaaaaaaaaaaaaaaaaaaa"
  | "bbbbbbbbbbbbbbbbbbbbbbbb"
  | "cccccccccccccccccccccccccc";
type Unwrapped<T> =
  T extends Promise<infer U> ? UnwrapTheValueOfThisPromise<U> : NotAPromise<T>;
type Checked<T> = T extends string
  ? SomeVeryLongTypeNameForStrings<T>
  : SomeOtherVeryLongType<T>;
`,
			);
		});

		test('keeps "const fooooba3 =\\n  fooobaarbazzItemsssssssssssssssssssssssssssssssss || fooooooooooooo\\n    ? foo\\n    : bar;"', async () => {
			await expectPrettierFormat(
				`const fooooba3 =
  fooobaarbazzItemsssssssssssssssssssssssssssssssss || fooooooooooooo
    ? foo
    : bar;`,
				`const fooooba3 =
  fooobaarbazzItemsssssssssssssssssssssssssssssssss || fooooooooooooo
    ? foo
    : bar;
`,
			);
		});

		test('keeps declare on type aliases and interfaces', async () => {
			await expectPrettierFormat(
				`declare type A = string;
export declare type B = number;
declare interface I { a: string }`,
				`declare type A = string;
export declare type B = number;
declare interface I {
  a: string;
}
`,
			);
		});
	});

	describe('arrow function chains and bodies follow Prettier', () => {
		test('moves an arrow chain that does not fit below the operator', async () => {
			await expectPrettierFormat(
				`export const parseWithLongName = (_Err) => (schema, value, _ctx, _params, other, more, evenMore) => { return run(schema); };
export const _parse: (_Err: $ZodErrorClass) => $Parse = (_Err) => (schema, value, _ctx, _params) => { return run(schema, value); };
obj.parse = (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => { return run(schema); };
class Parser {
  parse = (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => { return run(schema); };
}`,
				`export const parseWithLongName =
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
}
`,
			);
		});

		test('gives each arrow of a chain its own line outside an assignment', async () => {
			await expectPrettierFormat(
				`export default (_Err) => (schema, value, _ctx, _params, other, more, evenMore, andMore) => { return run(schema); };
compose((aaaaaaaaaaaaaaaaa) => (bbbbbbbbbbbbbbbbbbbbbbbb) => (cccccccccccccccccccccc) => { return 1; });
function curry() {
  return (aaaaaaaaaaaaaaaaaaaaaa) => (bbbbbbbbbbbbbbbbbbbbbbbbbb) => (ccccccccccccccccccccc) => 1;
}`,
				`export default (_Err) =>
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
}
`,
			);
		});

		test('always breaks a chain with a return type or a pattern parameter', async () => {
			await expectPrettierFormat(
				`const typed = (a) => (b): string => a + b;
const destructured = ({ a }) => (b) => a + b;`,
				`const typed =
  (a) =>
  (b): string =>
    a + b;
const destructured =
  ({ a }) =>
  (b) =>
    a + b;
`,
			);
		});

		test('keeps a chain that fits and prints the comments inside it', async () => {
			await expectPrettierFormat(
				`const middleware = (store) => (next) => (action) => { return next(action); };
export const parseExpression = (_Err) => (schema, value, _ctx, _params) => run(schema, value, _ctx);
const curried = (a) =>
  // explain the inner function
  (b) => a + b;`,
				`const middleware = (store) => (next) => (action) => {
  return next(action);
};
export const parseExpression = (_Err) => (schema, value, _ctx, _params) =>
  run(schema, value, _ctx);
const curried =
  (a) =>
  // explain the inner function
  (b) =>
    a + b;
`,
			);
		});

		test('breaks after => before an expression body that does not fit', async () => {
			await expectPrettierFormat(
				`const create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
kmac.create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
const api = { create: (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key) };
const handler = async (resolve) => await setTimeout(resolve, 1000000000000000000000000000000000000000);
const check = (value) => !isValidValueForThisParticularCheck(value, someOtherArgument, more);
function make() {
  return (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) => makeKmac(blockLen, chooseLen(opts, outputLen), xof, key);
}`,
				`const create = (key: TArg<Uint8Array>, opts: TArg<cShakeOpts> = {}) =>
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
}
`,
			);
		});

		test('breaks inside the body after => when it does not fit on its own line either', async () => {
			await expectPrettierFormat(
				`const build = (value) => someFunctionWithALongName(value, anotherArgument, yetAnotherArgument, more, andMore);
foo((a) => setTimeout(aaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb), b);`,
				`const build = (value) =>
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
);
`,
			);
		});

		test('keeps an object, array, or member body on its line after =>', async () => {
			await expectPrettierFormat(
				`const pick = (item) => item.someProperty.anotherProperty.yetAnotherProperty.finalProperty;
const make = (item) => ({ id: item.id, label: item.label, description: item.description });
const list = (item) => [item.id, item.label, item.description, item.somethingElse, item.more];`,
				`const pick = (item) =>
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
];
`,
			);
		});

		test('parenthesizes a conditional body only while it fits', async () => {
			await expectPrettierFormat(
				`const f = (a) => a ? b : c;
const g = (a) => (a ? b : c);
const h = (resolve) => (condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) : rejectIt(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb));
const i = (resolve) => condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) : rejectIt(bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb);
foo((resolve) => (condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa) : rejectIt(bbbbbbbbbbbb)), b);`,
				`const f = (a) => (a ? b : c);
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
);
`,
			);
		});

		test('adds no parentheses around a conditional body that starts with an object', async () => {
			await expectPrettierFormat(
				`const h = (a) => ({ x: 1 }).x ? b : c;`,
				`const h = (a) => ({ x: 1 }).x ? b : c;
`,
			);
		});
	});

	describe('comments that start an assigned value', () => {
		test('prints an own-line comment below the = with the value indented', async () => {
			await expectPrettierFormat(
				`const value = (
  // pick the cached entry
  cache.entry
);
const block = (
  /* pick the cached entry */
  cache.entry
);`,
				`const value =
  // pick the cached entry
  cache.entry;
const block =
  /* pick the cached entry */
  cache.entry;
`,
			);
		});

		test('keeps a comment on the = line and indents the value below it', async () => {
			await expectPrettierFormat(
				`const value = // pick the cached entry
  cache.entry;
const call = // compute it
  compute(a);`,
				`const value = // pick the cached entry
  cache.entry;
const call = // compute it
  compute(a);
`,
			);
		});

		test('indents the value in assignments, class fields, and object properties', async () => {
			await expectPrettierFormat(
				`value =
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
};`,
				`value =
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
};
`,
			);
		});

		test('breaks after the operator before a block comment that ends its line in "const test = /* some comment here */\\n  goog.partial(NewThing.onTemplateChange, rationaleField, typeField);"', async () => {
			await expectPrettierFormat(
				`const test = /* some comment here */
  goog.partial(NewThing.onTemplateChange, rationaleField, typeField);`,
				`const test =
  /* some comment here */
  goog.partial(NewThing.onTemplateChange, rationaleField, typeField);
`,
			);
		});

		test('breaks after the operator before a block comment that ends its line in "test = /* some comment here */\\n  someCondition ? someValueeeeeeeeeeeeeeeeeee : someOtherValueeeeeeeeeeeeeeeeeeeeee;"', async () => {
			await expectPrettierFormat(
				`test = /* some comment here */
  someCondition ? someValueeeeeeeeeeeeeeeeeee : someOtherValueeeeeeeeeeeeeeeeeeeeee;`,
				`test =
  /* some comment here */
  someCondition
    ? someValueeeeeeeeeeeeeeeeeee
    : someOtherValueeeeeeeeeeeeeeeeeeeeee;
`,
			);
		});

		test('breaks after the operator before a block comment that ends its line in "type A = /* some comment here */\\n  Foooooooooooooooooooooooooo<Barrrrrrrrrrrrrrrrr, Bazzzzzzzzzzzzzzzzzzzz>;"', async () => {
			await expectPrettierFormat(
				`type A = /* some comment here */
  Foooooooooooooooooooooooooo<Barrrrrrrrrrrrrrrrr, Bazzzzzzzzzzzzzzzzzzzz>;`,
				`type A =
  /* some comment here */
  Foooooooooooooooooooooooooo<Barrrrrrrrrrrrrrrrr, Bazzzzzzzzzzzzzzzzzzzz>;
`,
			);
		});

		test('breaks after the operator before a block comment that ends its line in "const test = /* some comment here */\\n  goog;"', async () => {
			await expectPrettierFormat(
				`const test = /* some comment here */
  goog;`,
				`const test = /* some comment here */ goog;
`,
			);
		});

		test('prints a comment after the = of a chain link in "a = b = c = /* note */\\n  compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);"', async () => {
			await expectPrettierFormat(
				`a = b = c = /* note */
  compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`a =
  b =
  c =
    /* note */
    compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);
`,
			);
		});

		test('prints a comment after the = of a chain link in "a = b = /* note */\\n  c = compute(aaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccc);"', async () => {
			await expectPrettierFormat(
				`a = b = /* note */
  c = compute(aaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccc);`,
				`a =
  b =
  /* note */
  c =
    compute(aaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccc);
`,
			);
		});

		test('prints a comment after the = of a chain link in "a = b = c = // note\\n  compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);"', async () => {
			await expectPrettierFormat(
				`a = b = c = // note
  compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);`,
				`a =
  b =
  c = // note
    compute(aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbb);
`,
			);
		});

		test('prints a comment after the = of a chain link in "a = b = c = /* note */\\n  goog;"', async () => {
			await expectPrettierFormat(
				`a = b = c = /* note */
  goog;`,
				`a = b = c = /* note */ goog;
`,
			);
		});

		test('keeps a return or throw argument whose leftmost operand has an own-line comment', async () => {
			await expectPrettierFormat(
				`function run() {
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
}`,
				`function run() {
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
}
`,
			);
		});

		test('moves an own-line comment in a default value before the parameter or property', async () => {
			await expectPrettierFormat(
				`function f(
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
] = x;`,
				`function f(
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
] = x;
`,
			);
		});

		test('keeps a comment at the end of the line after the = of a default value on that line', async () => {
			await expectPrettierFormat(
				`function f(
  a = // c
  1,
) {}`,
				`function f(
  a = 1, // c
) {}
`,
			);
		});

		test('keeps "function f(a = /* c */ 1, b /* c */ = 2) {}"', async () => {
			await expectPrettierFormat(
				`function f(a = /* c */ 1, b /* c */ = 2) {}`,
				`function f(a = /* c */ 1, b /* c */ = 2) {}
`,
			);
		});

		test('keeps "function f(\\n  // c\\n  a = 1,\\n) {}"', async () => {
			await expectPrettierFormat(
				`function f(
  // c
  a = 1,
) {}`,
				`function f(
  // c
  a = 1,
) {}
`,
			);
		});

		test('moves a comment at the end of the = line below it in "type A = // Comment\\n  B | C;"', async () => {
			await expectPrettierFormat(
				`type A = // Comment
  B | C;`,
				`type A =
  // Comment
  B | C;
`,
			);
		});

		test('moves a comment at the end of the = line below it in "const a = // Comment\\n  { a: 1 };"', async () => {
			await expectPrettierFormat(
				`const a = // Comment
  { a: 1 };`,
				`const a =
  // Comment
  { a: 1 };
`,
			);
		});

		test('moves a comment at the end of the = line below it in "b = // Comment\\n  [1, 2];"', async () => {
			await expectPrettierFormat(
				`b = // Comment
  [1, 2];`,
				`b =
  // Comment
  [1, 2];
`,
			);
		});

		test('moves a comment at the end of the = line below it in "a.b += // c\\n  `x`;"', async () => {
			await expectPrettierFormat(
				`a.b += // c
  \`x\`;`,
				`a.b +=
  // c
  \`x\`;
`,
			);
		});

		test('moves a comment at the end of the = line below it in "const t = // c\\n  tag`x`;"', async () => {
			await expectPrettierFormat(
				`const t = // c
  tag\`x\`;`,
				`const t =
  // c
  tag\`x\`;
`,
			);
		});

		test('moves a comment at the end of the = line below it in "let c: T = // c\\n  { a: 1 };"', async () => {
			await expectPrettierFormat(
				`let c: T = // c
  { a: 1 };`,
				`let c: T =
  // c
  { a: 1 };
`,
			);
		});

		test('moves a comment at the end of the = line below it in "type D<T> = // c\\n  { a: T };"', async () => {
			await expectPrettierFormat(
				`type D<T> = // c
  { a: T };`,
				`type D<T> =
  // c
  { a: T };
`,
			);
		});

		test('moves a comment at the end of the = line below it in "const e = /* a */ // b\\n  { a: 1 };"', async () => {
			await expectPrettierFormat(
				`const e = /* a */ // b
  { a: 1 };`,
				`const e =
  /* a */ // b
  { a: 1 };
`,
			);
		});

		test('moves a comment at the end of the = line below it in "type F = /* a */ // b\\n  B | C;"', async () => {
			await expectPrettierFormat(
				`type F = /* a */ // b
  B | C;`,
				`type F =
  /* a */ // b
  B | C;
`,
			);
		});

		test('moves a comment at the end of the = line below it in "let obj // Comment\\n= { a: 1 };"', async () => {
			await expectPrettierFormat(
				`let obj // Comment
= { a: 1 };`,
				`let obj =
  // Comment
  { a: 1 };
`,
			);
		});

		test('moves a comment at the end of the = line below it in "x // c\\n= [1];"', async () => {
			await expectPrettierFormat(
				`x // c
= [1];`,
				`x =
  // c
  [1];
`,
			);
		});

		test('keeps "type A = /* c */ B;"', async () => {
			await expectPrettierFormat(
				`type A = /* c */ B;`,
				`type A = /* c */ B;
`,
			);
		});

		test('keeps "let obj =\\n  // c\\n  { a: 1 };"', async () => {
			await expectPrettierFormat(
				`let obj =
  // c
  { a: 1 };`,
				`let obj =
  // c
  { a: 1 };
`,
			);
		});

		test('trails the left side with a line comment after the = in "const a = // Comment\\n  b || c;"', async () => {
			await expectPrettierFormat(
				`const a = // Comment
  b || c;`,
				`const a = b || c; // Comment
`,
			);
		});

		test('trails the left side with a line comment after the = in "const a = // c\\n  \\"str\\";"', async () => {
			await expectPrettierFormat(
				`const a = // c
  "str";`,
				`const a = "str"; // c
`,
			);
		});

		test('trails the left side with a line comment after the = in "a = // c\\n  b || c;"', async () => {
			await expectPrettierFormat(
				`a = // c
  b || c;`,
				`a = b || c; // c
`,
			);
		});

		test('trails the left side with a line comment after the = in "const test = /* a */ // b\\n  value;"', async () => {
			await expectPrettierFormat(
				`const test = /* a */ // b
  value;`,
				`const test = // b
  /* a */ value;
`,
			);
		});

		test('trails the left side with a line comment after the = in "let a: number = // c\\n  1, b = 2;"', async () => {
			await expectPrettierFormat(
				`let a: number = // c
  1, b = 2;`,
				`let a: number = 1, // c
  b = 2;
`,
			);
		});

		test('trails the left side with a line comment after the = in "const h = // c\\n  class {};"', async () => {
			await expectPrettierFormat(
				`const h = // c
  class {};`,
				`const h = class {}; // c
`,
			);
		});

		test('keeps "const f = // c\\n  () => {};"', async () => {
			await expectPrettierFormat(
				`const f = // c
  () => {};`,
				`const f = // c
  () => {};
`,
			);
		});

		test('keeps "const g = // c\\n  function () {};"', async () => {
			await expectPrettierFormat(
				`const g = // c
  function () {};`,
				`const g = // c
  function () {};
`,
			);
		});

		test('keeps "const n = // c\\n  new Foo(a);"', async () => {
			await expectPrettierFormat(
				`const n = // c
  new Foo(a);`,
				`const n = // c
  new Foo(a);
`,
			);
		});

		test('keeps "let obj = // c\\n  foo();"', async () => {
			await expectPrettierFormat(
				`let obj = // c
  foo();`,
				`let obj = // c
  foo();
`,
			);
		});

		test('keeps the comments in object properties and class fields that Prettier keeps', async () => {
			await expectPrettierFormat(
				`const o = {
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
}`,
				`const o = {
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
}
`,
			);
		});

		test('keeps a line comment on the = line before an element', async () => {
			await expectPrettierFormat(
				`function App() {
  const el = // c
    (
      <div>
        <span />
      </div>
    );
  const e2 = // c
    <div />;
  return el;
}`,
				`function App() {
  const el = // c
    (
      <div>
        <span />
      </div>
    );
  const e2 = // c
    <div />;
  return el;
}
`,
			);
		});

		test('keeps the line comment after the callee in "foo // c\\n(a);"', async () => {
			await expectPrettierFormat(
				`foo // c
(a);`,
				`foo // c
(a);
`,
			);
		});

		test('keeps the line comment after the callee in "const x = require // c\\n(\\"x\\");"', async () => {
			await expectPrettierFormat(
				`const x = require // c
("x");`,
				`const x = require // c
("x");
`,
			);
		});

		test('keeps the line comment after the callee in "new Foo<T> // c\\n(a);"', async () => {
			await expectPrettierFormat(
				`new Foo<T> // c
(a);`,
				`new Foo<T> // c
(a);
`,
			);
		});

		test('keeps the line comment after the callee in "foo<T> // c\\n(a);"', async () => {
			await expectPrettierFormat(
				`foo<T> // c
(a);`,
				`foo<T> // c
(a);
`,
			);
		});

		test('keeps the line comment after the callee in "export default foo // c\\n(a);"', async () => {
			await expectPrettierFormat(
				`export default foo // c
(a);`,
				`export default foo // c
(a);
`,
			);
		});

		test('keeps the line comment after the callee in "const x =\\n  foo<T> // c\\n  (a);"', async () => {
			await expectPrettierFormat(
				`const x =
  foo<T> // c
  (a);`,
				`const x =
  foo<T> // c
  (a);
`,
			);
		});
	});

	describe('comments in static blocks, namespaces, and code blocks', () => {
		test('keeps comments after the last statement inside the block', async () => {
			await expectPrettierFormat(
				`class C {
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
}`,
				`class C {
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
}
`,
			);
		});

		test('keeps the comments of an empty static block or namespace inside it', async () => {
			await expectPrettierFormat(
				`class C {
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
}`,
				`class C {
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
}
`,
			);
		});

		test('keeps blank lines between the statements of a static block', async () => {
			await expectPrettierFormat(
				`class C {
  static {
    a;

    // b

    b;
  }
}`,
				`class C {
  static {
    a;

    // b

    b;
  }
}
`,
			);
		});
	});

	describe('comments in interfaces, enums, and type literals', () => {
		test('keeps a JSDoc comment with the member it starts', async () => {
			await expectPrettierFormat(
				`interface I { a: 1; /** @deprecated */ b: 2; }
enum E { A, /** @deprecated */ B }
type T = { a: 1; /** @deprecated */ b: 2 };`,
				`interface I {
  a: 1;
  /** @deprecated */ b: 2;
}
enum E {
  A,
  /** @deprecated */ B,
}
type T = { a: 1; /** @deprecated */ b: 2 };
`,
			);
		});

		test('keeps comments after the last member inside the body', async () => {
			await expectPrettierFormat(
				`interface I {
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
};`,
				`interface I {
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
};
`,
			);
		});

		test('keeps the comments of an empty interface, enum, or type literal inside it', async () => {
			await expectPrettierFormat(
				`interface I {
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
type U = { /* type */ };`,
				`interface I {
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
type U = {/* type */};
`,
			);
		});
	});

	describe('interface, enum, and type literal members lay out like Prettier', () => {
		test('keeps one blank line between members where the source has one', async () => {
			await expectPrettierFormat(
				`interface I {
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
} = null;`,
				`interface I {
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
} = null;
`,
			);
		});

		test('prints a trailing comment after the semicolon of an interface or type literal member', async () => {
			await expectPrettierFormat(
				`interface I {
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
}`,
				`interface I {
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
}
`,
			);
		});

		test('prints the member semicolons of interfaces and type literals like Prettier without semicolons', async () => {
			await expectPrettierFormat(
				`interface I {
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
function f({ a, b }: { a: string; b: number }) {}`,
				`interface I {
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
function f({ a, b }: { a: string; b: number }) {}
`,
				{ semi: false },
			);
		});
	});

	describe('TypeScript module declarations survive formatting', () => {
		test('keeps import Alias = Foo;', async () => {
			await expectPrettierFormat(
				`import Alias = Foo;`,
				`import Alias = Foo;
`,
			);
		});

		test('keeps import Alias = Foo.Bar.Baz;', async () => {
			await expectPrettierFormat(
				`import Alias = Foo.Bar.Baz;`,
				`import Alias = Foo.Bar.Baz;
`,
			);
		});

		test('keeps import fs = require("fs");', async () => {
			await expectPrettierFormat(
				`import fs = require("fs");`,
				`import fs = require("fs");
`,
			);
		});

		test('keeps import type Types = require("./types");', async () => {
			await expectPrettierFormat(
				`import type Types = require("./types");`,
				`import type Types = require("./types");
`,
			);
		});

		test('keeps export import Alias = Foo.Bar;', async () => {
			await expectPrettierFormat(
				`export import Alias = Foo.Bar;`,
				`export import Alias = Foo.Bar;
`,
			);
		});

		test('keeps export import type Types = require("./types");', async () => {
			await expectPrettierFormat(
				`export import type Types = require("./types");`,
				`export import type Types = require("./types");
`,
			);
		});

		test('keeps export = value;', async () => {
			await expectPrettierFormat(
				`export = value;`,
				`export = value;
`,
			);
		});

		test('keeps export as namespace Library;', async () => {
			await expectPrettierFormat(
				`export as namespace Library;`,
				`export as namespace Library;
`,
			);
		});

		test('keeps import aliases and export assignments inside namespaces and modules', async () => {
			await expectPrettierFormat(
				`namespace Outer {
  export import Alias = Foo;
  import fs = require("fs");
}`,
				`namespace Outer {
  export import Alias = Foo;
  import fs = require("fs");
}
`,
			);
			await expectPrettierFormat(
				`declare module "library" {
  const value: number;
  export = value;
}`,
				`declare module "library" {
  const value: number;
  export = value;
}
`,
			);
		});

		test('keeps the import alias a module reads from', async () => {
			await expectPrettierFormat(
				`namespace Foo { export const answer = 1; }
import Alias = Foo;
export const x = Alias.answer;`,
				`namespace Foo {
  export const answer = 1;
}
import Alias = Foo;
export const x = Alias.answer;
`,
			);
		});

		test('keeps comments inside import aliases', async () => {
			await expectPrettierFormat(
				`import /* a */ Alias /* b */ = /* c */ Foo /* d */;`,
				`import /* a */ Alias /* b */ = /* c */ Foo /* d */;
`,
			);
			await expectPrettierFormat(
				`import fs = require(/* why */ "fs");`,
				`import fs = require(/* why */ "fs");
`,
			);
		});

		test('breaks the parentheses of a require around a comment like call arguments', async () => {
			await expectPrettierFormat(
				`import A = require(
  /* c */
  "a");
import B = require(
  "b" // c
);`,
				`import A = require(
  /* c */
  "a"
);
import B = require(
  "b" // c
);
`,
			);
			await expectPrettierFormat(
				`import C = require("./long/long/long/long/long/long/long/long/long/long/long/path/to/module");`,
				`import C = require("./long/long/long/long/long/long/long/long/long/long/long/path/to/module");
`,
			);
		});

		test('follows quote and semicolon options', async () => {
			await expectPrettierFormat(
				`import fs = require("fs");
export = fs;`,
				`import fs = require('fs')
export = fs
`,
				{ singleQuote: true, semi: false },
			);
		});

		test('keeps dotted namespace names: namespace A.B {\n  export const value = 1;\n}', async () => {
			await expectPrettierFormat(
				`namespace A.B {
  export const value = 1;
}`,
				`namespace A.B {
  export const value = 1;
}
`,
			);
		});

		test('keeps dotted namespace names: declare namespace A.B.C {\n  const value: number;\n}', async () => {
			await expectPrettierFormat(
				`declare namespace A.B.C {
  const value: number;
}`,
				`declare namespace A.B.C {
  const value: number;
}
`,
			);
		});

		test('keeps dotted namespace names: export namespace A.B {}', async () => {
			await expectPrettierFormat(
				`export namespace A.B {}`,
				`export namespace A.B {}
`,
			);
		});

		test('keeps dotted namespace names: export declare namespace A.B {}', async () => {
			await expectPrettierFormat(
				`export declare namespace A.B {}`,
				`export declare namespace A.B {}
`,
			);
		});

		test('keeps dotted namespace names: module A.B {}', async () => {
			await expectPrettierFormat(
				`module A.B {}`,
				`module A.B {}
`,
			);
		});

		test('keeps dotted namespace names: namespace A./* between */ B {}', async () => {
			await expectPrettierFormat(
				`namespace A./* between */ B {}`,
				`namespace A./* between */ B {}
`,
			);
		});

		test('formats the body of a dotted namespace', async () => {
			await expectPrettierFormat(
				`namespace A.B { export const value = 1; }`,
				`namespace A.B {
  export const value = 1;
}
`,
			);
		});

		test('keeps the semicolon on shorthand ambient modules', async () => {
			await expectPrettierFormat(
				`declare module "untyped-a";
declare module "untyped-b";`,
				`declare module "untyped-a";
declare module "untyped-b";
`,
			);
			await expectPrettierFormat(
				`declare module "untyped";`,
				`declare module "untyped"
`,
				{ semi: false },
			);
		});
	});

	describe('export clauses survive formatting', () => {
		test('keeps export {};', async () => {
			await expectPrettierFormat(
				`export {};`,
				`export {};
`,
			);
		});

		test('keeps export type {};', async () => {
			await expectPrettierFormat(
				`export type {};`,
				`export type {};
`,
			);
		});

		test('keeps export {} from "./side-effect";', async () => {
			await expectPrettierFormat(
				`export {} from "./side-effect";`,
				`export {} from "./side-effect";
`,
			);
		});

		test('keeps export type {} from "./types";', async () => {
			await expectPrettierFormat(
				`export type {} from "./types";`,
				`export type {} from "./types";
`,
			);
		});

		test('keeps export * from "./module";', async () => {
			await expectPrettierFormat(
				`export * from "./module";`,
				`export * from "./module";
`,
			);
		});

		test('keeps export * as ns from "./module";', async () => {
			await expectPrettierFormat(
				`export * as ns from "./module";`,
				`export * as ns from "./module";
`,
			);
		});

		test('keeps export type * from "./types";', async () => {
			await expectPrettierFormat(
				`export type * from "./types";`,
				`export type * from "./types";
`,
			);
		});

		test('keeps export type * as Types from "./types";', async () => {
			await expectPrettierFormat(
				`export type * as Types from "./types";`,
				`export type * as Types from "./types";
`,
			);
		});

		test('keeps export { a } from "./data.json" with { type: "json" };', async () => {
			await expectPrettierFormat(
				`export { a } from "./data.json" with { type: "json" };`,
				`export { a } from "./data.json" with { type: "json" };
`,
			);
		});

		test('keeps export * from "./data.json" with { type: "json" };', async () => {
			await expectPrettierFormat(
				`export * from "./data.json" with { type: "json" };`,
				`export * from "./data.json" with { type: "json" };
`,
			);
		});

		test('keeps export { "a-b" as ab, c as "c-d" } from "./module";', async () => {
			await expectPrettierFormat(
				`export { "a-b" as ab, c as "c-d" } from "./module";`,
				`export { "a-b" as ab, c as "c-d" } from "./module";
`,
			);
		});

		test('keeps export { "a-b" } from "./module";', async () => {
			await expectPrettierFormat(
				`export { "a-b" } from "./module";`,
				`export { "a-b" } from "./module";
`,
			);
		});

		test('keeps export * as "a-b" from "./module";', async () => {
			await expectPrettierFormat(
				`export * as "a-b" from "./module";`,
				`export * as "a-b" from "./module";
`,
			);
		});

		test('keeps import { "a-b" as ab } from "./module";', async () => {
			await expectPrettierFormat(
				`import { "a-b" as ab } from "./module";`,
				`import { "a-b" as ab } from "./module";
`,
			);
		});

		test('keeps the declaration after an empty export local', async () => {
			await expectPrettierFormat(
				`export {};
const internal = 42;`,
				`export {};
const internal = 42;
`,
			);
			await expectPrettierFormat(
				`export {};
declare global {
  interface Window {
    value: number;
  }
}`,
				`export {};
declare global {
  interface Window {
    value: number;
  }
}
`,
			);
		});

		test('follows quote and semicolon options', async () => {
			await expectPrettierFormat(
				`export {};
export {} from "a";
export * as ns from "b";`,
				`export {}
export {} from 'a'
export * as ns from 'b'
`,
				{ singleQuote: true, semi: false },
			);
		});
	});

	describe('import and export specifier lists lay out like Prettier', () => {
		test('breaks a long export list one specifier per line', async () => {
			await expectPrettierFormat(
				`export { aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccc } from 'mod';
export type { aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccc } from 'mod';`,
				`export {
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccc,
} from "mod";
export type {
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccc,
} from "mod";
`,
			);
			await expectPrettierFormat(
				`const aaaaaaaaaaaaaaaaaaaaaa = 1;
const bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb = 2;
const cccccccccccccccccccccccccc = 3;
export { aaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccccccccccccc };`,
				`const aaaaaaaaaaaaaaaaaaaaaa = 1;
const bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb = 2;
const cccccccccccccccccccccccccc = 3;
export {
  aaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccccccccccccccccc,
};
`,
			);
		});

		test('keeps a lone named import on the line with a long source', async () => {
			await expectPrettierFormat(
				`import { a } from "./a-module-with-a-long-name/that-lives/in-a-deeply-nested/folder-structure";`,
				`import { a } from "./a-module-with-a-long-name/that-lives/in-a-deeply-nested/folder-structure";
`,
			);
			await expectPrettierFormat(
				`import type { A } from "./a-module-with-a-long-name/that-lives/in-a-deeply-nested/folder-structure";`,
				`import type { A } from "./a-module-with-a-long-name/that-lives/in-a-deeply-nested/folder-structure";
`,
			);
		});

		test('breaks the braces of a default import with named imports', async () => {
			await expectPrettierFormat(
				`import aaaaaaaaaaaaaaaaaaaaaaaaaaaaa, { bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccccccccccc } from 'mod';`,
				`import aaaaaaaaaaaaaaaaaaaaaaaaaaaaa, {
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccccccccccccc,
} from "mod";
`,
			);
		});

		test('follows bracketSpacing in import and export lists', async () => {
			await expectPrettierFormat(
				`import {a} from "mod";
import b, {c, d} from "mod";`,
				`import {a} from "mod";
import b, {c, d} from "mod";
`,
				{ bracketSpacing: false },
			);
			await expectPrettierFormat(
				`const a = 1;
export {a};
export {b as c, d} from "mod";`,
				`const a = 1;
export {a};
export {b as c, d} from "mod";
`,
				{ bracketSpacing: false },
			);
		});

		test('follows bracketSpacing in import attributes', async () => {
			await expectPrettierFormat(
				`export * from './b.json' with { type: 'json' };
export { x } from './x.json' with { type: 'json', other: 'x' };
import a from './a.json' with { type: 'json' };`,
				`export * from "./b.json" with {type: "json"};
export {x} from "./x.json" with {type: "json", other: "x"};
import a from "./a.json" with {type: "json"};
`,
				{ bracketSpacing: false },
			);
		});

		test('breaks long import attributes like an object, but never a lone type attribute', async () => {
			await expectPrettierFormat(
				`import data from './data.json' with { type: 'json', integrity: 'sha384-0123456789abcdef' };
import e from './eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.json' with { type: 'json' };
import c from './c' with {
  type: 'json' };`,
				`import data from "./data.json" with {
  type: "json",
  integrity: "sha384-0123456789abcdef",
};
import e from "./eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.json" with { type: "json" };
import c from "./c" with { type: "json" };
`,
			);
		});

		test('keeps import attributes expanded when a line break follows their {', async () => {
			await expectPrettierFormat(
				`import d from './d' with {
  type: 'json', other: 'x' };`,
				`import d from "./d" with {
  type: "json",
  other: "x",
};
`,
			);
			await expectPrettierFormat(
				`import d from './d' with {
  type: 'json', other: 'x' };`,
				`import d from "./d" with { type: "json", other: "x" };
`,
				{ objectWrap: 'collapse' },
			);
		});

		test('keeps the assert keyword and an empty attribute list', async () => {
			await expectPrettierFormat(
				`import a from "./a.json" assert { type: "json" };
import b from "./b" with {};
import f from "./f" /* c */ with { type: "json" };`,
				`import a from "./a.json" assert { type: "json" };
import b from "./b" with {};
import f from "./f" /* c */ with { type: "json" };
`,
			);
		});

		test('moves the comments between an import attribute key and its value like Prettier', async () => {
			await expectPrettierFormat(
				`import a from "./a.json" with {
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
};`,
				`import a from "./a.json" with {
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
};
`,
			);
		});

		test('keeps a comment between an import attribute key and its value on their line', async () => {
			await expectPrettierFormat(
				`import a from "./a.json" with { type: /* c */ "json" };
import b from "./b.json" with { type /* c */: "json" };`,
				`import a from "./a.json" with { type: /* c */ "json" };
import b from "./b.json" with { type /* c */: "json" };
`,
			);
		});

		test('keeps an alias that repeats the name', async () => {
			await expectPrettierFormat(
				`import { a as a } from "mod";`,
				`import { a as a } from "mod";
`,
			);
			await expectPrettierFormat(
				`const b = 1;
export { b as b };`,
				`const b = 1;
export { b as b };
`,
			);
		});

		test('keeps import {} from "mod";', async () => {
			await expectPrettierFormat(
				`import {} from "mod";`,
				`import {} from "mod";
`,
			);
		});

		test('keeps import type {} from "mod";', async () => {
			await expectPrettierFormat(
				`import type {} from "mod";`,
				`import type {} from "mod";
`,
			);
		});

		test('keeps import {} from "./a.json" with { type: "json" };', async () => {
			await expectPrettierFormat(
				`import {} from "./a.json" with { type: "json" };`,
				`import {} from "./a.json" with { type: "json" };
`,
			);
		});

		test('keeps import "side-effect";', async () => {
			await expectPrettierFormat(
				`import "side-effect";`,
				`import "side-effect";
`,
			);
		});

		test('keeps a trailing line comment', async () => {
			await expectPrettierFormat(
				`import {
  a, // first
  b,
} from "mod";`,
				`import {
  a, // first
  b,
} from "mod";
`,
			);
		});

		test('keeps an own-line comment', async () => {
			await expectPrettierFormat(
				`export {
  a,
  // own line
  b,
} from "mod";`,
				`export {
  a,
  // own line
  b,
} from "mod";
`,
			);
		});

		test('keeps a comment after the last specifier', async () => {
			await expectPrettierFormat(
				`import {
  a,
  b,
  // after b
} from "mod";`,
				`import {
  a,
  b,
  // after b
} from "mod";
`,
			);
		});

		test('keeps block comments', async () => {
			await expectPrettierFormat(
				`import { /* x */ a, b /* y */ } from "mod";`,
				`import { /* x */ a, b /* y */ } from "mod";
`,
			);
		});

		test('keeps comments on default and namespace imports', async () => {
			await expectPrettierFormat(
				`import /* d */ a, * as /* ns */ b from "mod";`,
				`import /* d */ a, * as /* ns */ b from "mod";
`,
			);
		});

		test('keeps a comment before a comma', async () => {
			await expectPrettierFormat(
				`import def /* d */, { a } from "mod";`,
				`import def /* d */, { a } from "mod";
`,
			);
		});

		test('keeps a line comment after the brace of the named imports', async () => {
			await expectPrettierFormat(
				`import d, { // first
  // second
  a,
} from "mod";`,
				`import d, { // first
  // second
  a,
} from "mod";
`,
			);
		});

		test('keeps line comments after the brace and after a named import', async () => {
			await expectPrettierFormat(
				`import d, { // first
  a, // second
  b,
} from "mod";`,
				`import d, { // first
  a, // second
  b,
} from "mod";
`,
			);
		});

		test('keeps a comment before from', async () => {
			await expectPrettierFormat(
				`import a /* c */ from "mod";`,
				`import a /* c */ from "mod";
`,
			);
		});

		test('keeps a comment on an alias', async () => {
			await expectPrettierFormat(
				`export { a as /* c */ b } from "mod";`,
				`export { a as /* c */ b } from "mod";
`,
			);
		});

		test('keeps a comment on a namespace re-export', async () => {
			await expectPrettierFormat(
				`export * as ns /* c */ from "mod";`,
				`export * as ns /* c */ from "mod";
`,
			);
		});

		test('keeps a comment before the source', async () => {
			await expectPrettierFormat(
				`import {} from /* nothing */ "mod";`,
				`import {} from /* nothing */ "mod";
`,
			);
		});

		test('keeps a block comment on an attribute', async () => {
			await expectPrettierFormat(
				`import a from "./a.json" with { /* c */ type: "json" };`,
				`import a from "./a.json" with { /* c */ type: "json" };
`,
			);
		});

		test('keeps a line comment on an attribute', async () => {
			await expectPrettierFormat(
				`import a from "./a.json" with {
  // c
  type: "json",
};`,
				`import a from "./a.json" with {
  // c
  type: "json",
};
`,
			);
		});

		test('prints the comments of "import d, // first\\n// second\\n{ a } from \\"mod\\";" where Prettier does', async () => {
			await expectPrettierFormat(
				`import d, // first
// second
{ a } from "mod";`,
				`import d, { // first
  // second
  a,
} from "mod";
`,
			);
		});

		test('prints the comments of "import d, { // first\\n  a,\\n} from \\"mod\\";" where Prettier does', async () => {
			await expectPrettierFormat(
				`import d, { // first
  a,
} from "mod";`,
				`import d, { a } from "mod"; // first
`,
			);
		});

		test('moves a comment after the braces inside them', async () => {
			await expectPrettierFormat(
				`import { a } /* after */ from 'mod';`,
				`import { a /* after */ } from "mod";
`,
			);
		});

		test('keeps a comment after the module source', async () => {
			await expectPrettierFormat(
				`import a from /* c */ "mod" /* d */;`,
				`import a from /* c */ "mod"; /* d */
`,
			);
		});
	});

	describe('comments on either side of a comma stay there', () => {
		test('keeps const x = [a /* c */, b];', async () => {
			await expectPrettierFormat(
				`const x = [a /* c */, b];`,
				`const x = [a /* c */, b];
`,
			);
		});

		test('keeps foo(a /* c */, b);', async () => {
			await expectPrettierFormat(
				`foo(a /* c */, b);`,
				`foo(a /* c */, b);
`,
			);
		});

		test('keeps new Foo(a /* c */, b);', async () => {
			await expectPrettierFormat(
				`new Foo(a /* c */, b);`,
				`new Foo(a /* c */, b);
`,
			);
		});

		test('keeps const o = { a: 1 /* c */, b: 2 };', async () => {
			await expectPrettierFormat(
				`const o = { a: 1 /* c */, b: 2 };`,
				`const o = { a: 1 /* c */, b: 2 };
`,
			);
		});

		test('keeps function f(a /* c */, b) {}', async () => {
			await expectPrettierFormat(
				`function f(a /* c */, b) {}`,
				`function f(a /* c */, b) {}
`,
			);
		});

		test('keeps const { a /* c */, b } = o;', async () => {
			await expectPrettierFormat(
				`const { a /* c */, b } = o;`,
				`const { a /* c */, b } = o;
`,
			);
		});

		test('keeps import a /* c */, { b } from "mod";', async () => {
			await expectPrettierFormat(
				`import a /* c */, { b } from "mod";`,
				`import a /* c */, { b } from "mod";
`,
			);
		});

		test('keeps const x = [a /* c */ /* d */, b];', async () => {
			await expectPrettierFormat(
				`const x = [a /* c */ /* d */, b];`,
				`const x = [a /* c */ /* d */, b];
`,
			);
		});

		test('keeps const x = [a, /* c */ b];', async () => {
			await expectPrettierFormat(
				`const x = [a, /* c */ b];`,
				`const x = [a, /* c */ b];
`,
			);
		});

		test('keeps x = (a /* c */, b);', async () => {
			await expectPrettierFormat(
				`x = (a /* c */, b);`,
				`x = (a /* c */, b);
`,
			);
		});

		test('keeps x = (a, /* c */ b);', async () => {
			await expectPrettierFormat(
				`x = (a, /* c */ b);`,
				`x = (a, /* c */ b);
`,
			);
		});

		test('keeps const { a /* c */ = 1 } = x;', async () => {
			await expectPrettierFormat(
				`const { a /* c */ = 1 } = x;`,
				`const { a /* c */ = 1 } = x;
`,
			);
		});

		test('keeps function f({ a /* c */ = 1 }) {}', async () => {
			await expectPrettierFormat(
				`function f({ a /* c */ = 1 }) {}`,
				`function f({ a /* c */ = 1 }) {}
`,
			);
		});

		test('keeps the cast after the comma in "x = [1, /** not a cast */ (\\n  foo\\n)];"', async () => {
			await expectPrettierFormat(
				`x = [1, /** not a cast */ (
  foo
)];`,
				`x = [1, /** not a cast */ foo];
`,
			);
		});

		test('keeps a comment before the { of the named imports with the default import', async () => {
			await expectPrettierFormat(
				`import d, /* c */ { a } from "mod";`,
				`import d /* c */, { a } from "mod";
`,
			);
		});

		test('keeps a comment before the comma in an enum', async () => {
			await expectPrettierFormat(
				`enum E { A /* c */, B }`,
				`enum E {
  A /* c */,
  B,
}
`,
			);
		});

		test('keeps a comment before the comma when the list collapses', async () => {
			await expectPrettierFormat(
				`const y = [
  a /* c */,
  b,
];`,
				`const y = [a /* c */, b];
`,
			);
		});

		test('keeps the comment on its side of the comma in type F = Foo<A, /* y */ B>;', async () => {
			await expectPrettierFormat(
				`type F = Foo<A, /* y */ B>;`,
				`type F = Foo<A, /* y */ B>;
`,
			);
		});

		test('keeps the comment on its side of the comma in let v: Map<A, /* y */ B>;', async () => {
			await expectPrettierFormat(
				`let v: Map<A, /* y */ B>;`,
				`let v: Map<A, /* y */ B>;
`,
			);
		});

		test('keeps the comment on its side of the comma in new Map<A, /* y */ B>();', async () => {
			await expectPrettierFormat(
				`new Map<A, /* y */ B>();`,
				`new Map<A, /* y */ B>();
`,
			);
		});

		test('keeps the comment on its side of the comma in f<A, /* y */ B>();', async () => {
			await expectPrettierFormat(
				`f<A, /* y */ B>();`,
				`f<A, /* y */ B>();
`,
			);
		});

		test('keeps the comment on its side of the comma in class C<A, /* y */ B> {}', async () => {
			await expectPrettierFormat(
				`class C<A, /* y */ B> {}`,
				`class C<A, /* y */ B> {}
`,
			);
		});

		test('keeps the comment on its side of the comma in interface I<A, /* y */ B> {}', async () => {
			await expectPrettierFormat(
				`interface I<A, /* y */ B> {}`,
				`interface I<A, /* y */ B> {}
`,
			);
		});

		test('keeps the comment on its side of the comma in function f<A, /* y */ B>() {}', async () => {
			await expectPrettierFormat(
				`function f<A, /* y */ B>() {}`,
				`function f<A, /* y */ B>() {}
`,
			);
		});

		test('keeps the comment on its side of the comma in type T = [A, /* y */ B];', async () => {
			await expectPrettierFormat(
				`type T = [A, /* y */ B];`,
				`type T = [A, /* y */ B];
`,
			);
		});

		test('keeps the comment on its side of the comma in type T = [a: A, /* y */ b: B];', async () => {
			await expectPrettierFormat(
				`type T = [a: A, /* y */ b: B];`,
				`type T = [a: A, /* y */ b: B];
`,
			);
		});

		test('keeps the comment on its side of the comma in type T = [A, /* y */ ...B];', async () => {
			await expectPrettierFormat(
				`type T = [A, /* y */ ...B];`,
				`type T = [A, /* y */ ...B];
`,
			);
		});

		test('keeps the comment on its side of the comma in type F = Foo<A, /* y */ B>[];', async () => {
			await expectPrettierFormat(
				`type F = Foo<A, /* y */ B>[];`,
				`type F = Foo<A, /* y */ B>[];
`,
			);
		});

		test('keeps the comment on its side of the comma in type F = Foo<A /* y */, B>;', async () => {
			await expectPrettierFormat(
				`type F = Foo<A /* y */, B>;`,
				`type F = Foo<A /* y */, B>;
`,
			);
		});

		test('keeps the comment on its side of the comma in type T = [A /* a */ /* b */, /* c */ B];', async () => {
			await expectPrettierFormat(
				`type T = [A /* a */ /* b */, /* c */ B];`,
				`type T = [A /* a */ /* b */, /* c */ B];
`,
			);
		});

		test('keeps the comment on its side of the comma in type F = Foo<A, B /* y */>;', async () => {
			await expectPrettierFormat(
				`type F = Foo<A, B /* y */>;`,
				`type F = Foo<A, B /* y */>;
`,
			);
		});

		test('keeps the comment on its side of the comma in type T = [A, B /* y */];', async () => {
			await expectPrettierFormat(
				`type T = [A, B /* y */];`,
				`type T = [A, B /* y */];
`,
			);
		});

		test('keeps the comment on its side of the comma in function f<A /* a */, B /* b */>() {}', async () => {
			await expectPrettierFormat(
				`function f<A /* a */, B /* b */>() {}`,
				`function f<A /* a */, B /* b */>() {}
`,
			);
		});

		test('keeps a comment after the comma next to a type written in parentheses', async () => {
			await expectPrettierFormat(
				`type F = Foo<(A), /* y */ B>;
type G = Foo<A, /* y */ (B)>;
let v: Map<(A), /* y */ B>;
type T = [(A), /* y */ B];`,
				`type F = Foo<A, /* y */ B>;
type G = Foo<A, /* y */ B>;
let v: Map<A, /* y */ B>;
type T = [A, /* y */ B];
`,
			);
		});

		test('keeps the line comments of a broken type list: type F = Foo<\n  A, // a\n  B // b\n>;', async () => {
			await expectPrettierFormat(
				`type F = Foo<
  A, // a
  B // b
>;`,
				`type F = Foo<
  A, // a
  B // b
>;
`,
			);
		});

		test('keeps the line comments of a broken type list: type T = [\n  A, // a\n  B, // b\n];', async () => {
			await expectPrettierFormat(
				`type T = [
  A, // a
  B, // b
];`,
				`type T = [
  A, // a
  B, // b
];
`,
			);
		});

		test('keeps the line comments of a broken type list: type T = [\n  A,\n  // own line\n  B,\n];', async () => {
			await expectPrettierFormat(
				`type T = [
  A,
  // own line
  B,
];`,
				`type T = [
  A,
  // own line
  B,
];
`,
			);
		});

		test('keeps the line comments of a broken type list: function f<\n  A, // a\n  B, // b\n>() {}', async () => {
			await expectPrettierFormat(
				`function f<
  A, // a
  B, // b
>() {}`,
				`function f<
  A, // a
  B, // b
>() {}
`,
			);
		});

		test('formats "function f(\\n  a,\\n  b /* c */,\\n) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f(
  a,
  b /* c */,
) {}`,
				`function f(a, b /* c */) {}
`,
			);
		});

		test('formats "const f = (\\n  a,\\n  b /* c */,\\n) => {};" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = (
  a,
  b /* c */,
) => {};`,
				`const f = (a, b /* c */) => {};
`,
			);
		});

		test('formats "class A {\\n  m(\\n    a,\\n    b /* c */,\\n  ) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(
    a,
    b /* c */,
  ) {}
}`,
				`class A {
  m(a, b /* c */) {}
}
`,
			);
		});

		test('formats "function f(\\n  a,\\n  b /* c */,\\n): void {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f(
  a,
  b /* c */,
): void {}`,
				`function f(a, b /* c */): void {}
`,
			);
		});

		test('formats "function f<T>(\\n  a,\\n  b = 1 /* c */,\\n) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f<T>(
  a,
  b = 1 /* c */,
) {}`,
				`function f<T>(a, b = 1 /* c */) {}
`,
			);
		});

		test('formats "function f(\\n  a,\\n  b /* c */, /* d */\\n) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f(
  a,
  b /* c */, /* d */
) {}`,
				`function f(a, b /* c */ /* d */) {}
`,
			);
		});

		test('formats "function f(\\n  a,\\n  b /* c */, // d\\n) {}" like Prettier', async () => {
			await expectPrettierFormat(
				`function f(
  a,
  b /* c */, // d
) {}`,
				`function f(
  a,
  b /* c */, // d
) {}
`,
			);
		});

		test('formats "const x = run(\\n  a,\\n  b /* c */,\\n);" like Prettier', async () => {
			await expectPrettierFormat(
				`const x = run(
  a,
  b /* c */,
);`,
				`const x = run(a, b /* c */);
`,
			);
		});

		test('keeps "function f(a, b /* c */ /* d */) {}"', async () => {
			await expectPrettierFormat(
				`function f(a, b /* c */ /* d */) {}`,
				`function f(a, b /* c */ /* d */) {}
`,
			);
		});

		test('keeps "const f = (a /* c */ /* d */) => a;"', async () => {
			await expectPrettierFormat(
				`const f = (a /* c */ /* d */) => a;`,
				`const f = (a /* c */ /* d */) => a;
`,
			);
		});

		test('keeps "run(a, b /* c */ /* d */);"', async () => {
			await expectPrettierFormat(
				`run(a, b /* c */ /* d */);`,
				`run(a, b /* c */ /* d */);
`,
			);
		});

		test('keeps "function f(\\n  a,\\n  b, // c\\n) {}"', async () => {
			await expectPrettierFormat(
				`function f(
  a,
  b, // c
) {}`,
				`function f(
  a,
  b, // c
) {}
`,
			);
		});

		test('keeps "function f(\\n  a,\\n  b,\\n  // c\\n) {}"', async () => {
			await expectPrettierFormat(
				`function f(
  a,
  b,
  // c
) {}`,
				`function f(
  a,
  b,
  // c
) {}
`,
			);
		});

		test('keeps "function f(a, ...b /* c */) {}"', async () => {
			await expectPrettierFormat(
				`function f(a, ...b /* c */) {}`,
				`function f(a, ...b /* c */) {}
`,
			);
		});
	});

	describe('export default parentheses survive formatting', () => {
		test('keeps parens around a named class expression', async () => {
			await expectPrettierFormat(
				`export default (class Named {});`,
				`export default (class Named {});
`,
			);
		});

		test('keeps parens around an anonymous class expression', async () => {
			await expectPrettierFormat(
				`export default (class {});`,
				`export default (class {});
`,
			);
		});

		test('keeps parens around a class expression with a superclass', async () => {
			await expectPrettierFormat(
				`export default (class Named extends Base {});`,
				`export default (class Named extends Base {});
`,
			);
		});

		test('keeps parens around a named function expression', async () => {
			await expectPrettierFormat(
				`export default (function foo() {});`,
				`export default (function foo() {});
`,
			);
		});

		test('keeps parens around an anonymous function expression', async () => {
			await expectPrettierFormat(
				`export default (function () {});`,
				`export default (function () {});
`,
			);
		});

		test('does not leak the class expression name into module scope', async () => {
			await expectPrettierFormat(
				`export default (class Named {});
export const alias = Named;`,
				`export default (class Named {});
export const alias = Named;
`,
			);
		});

		test('collapses redundant parens down to one pair', async () => {
			await expectPrettierFormat(
				`export default ((class Named {}));`,
				`export default (class Named {});
`,
			);
		});

		test('collapses a multiline parenthesized class expression', async () => {
			await expectPrettierFormat(
				`export default (
  class Named {}
);`,
				`export default (class Named {});
`,
			);
		});

		test('omits the terminator when semi is disabled', async () => {
			await expectPrettierFormat(
				`export default (class Named {});`,
				`export default (class Named {})
`,
				{ semi: false },
			);
		});

		test('leaves an unparenthesized class declaration alone', async () => {
			await expectPrettierFormat(
				`export default class Named {}`,
				`export default class Named {}
`,
			);
		});

		test('leaves an unparenthesized function declaration alone', async () => {
			await expectPrettierFormat(
				`export default function foo() {}`,
				`export default function foo() {}
`,
			);
		});

		test('does not invent parens around other default exports', async () => {
			await expectPrettierFormat(
				`export default (0);`,
				`export default 0;
`,
			);
		});

		test('wraps the whole expression that starts with a function or class', async () => {
			await expectPrettierFormat(
				`export default (class {}).getInstance();
export default (function () {}).toString();
export default (function log() {}) as typeof console.log;
export default (class {})[1] = 1;
export default (async function () {}) ? a : b;
export default (function () {}).call(thisIsAVeryLongArgumentNameNumberOne, thisIsAVeryLongArgumentNameNumberTwo);`,
				`export default (class {}.getInstance());
export default (function () {}.toString());
export default (function log() {} as typeof console.log);
export default (class {}[1] = 1);
export default (async function () {} ? a : b);
export default (function () {}.call(
  thisIsAVeryLongArgumentNameNumberOne,
  thisIsAVeryLongArgumentNameNumberTwo,
));
`,
			);
		});

		test('keeps the parentheses of a function or class that prints its own: export default (function () {} + foo)``;', async () => {
			await expectPrettierFormat(
				`export default (function () {} + foo)\`\`;`,
				`export default (function () {} + foo)\`\`;
`,
			);
		});

		test('keeps the parentheses of a function or class that prints its own: export default new (class {})();', async () => {
			await expectPrettierFormat(
				`export default new (class {})();`,
				`export default new (class {})();
`,
			);
		});

		test('keeps the parentheses of a function or class that prints its own: export default (function () {}, b);', async () => {
			await expectPrettierFormat(
				`export default (function () {}, b);`,
				`export default (function () {}, b);
`,
			);
		});
	});

	describe('export default terminators', () => {
		test('terminates an identifier export', async () => {
			await expectPrettierFormat(
				`export default foo;`,
				`export default foo;
`,
			);
		});

		test('terminates an object export', async () => {
			await expectPrettierFormat(
				`export default { a: 1 };`,
				`export default { a: 1 };
`,
			);
		});

		test('terminates an array export', async () => {
			await expectPrettierFormat(
				`export default [1, 2];`,
				`export default [1, 2];
`,
			);
		});

		test('terminates a numeric literal export', async () => {
			await expectPrettierFormat(
				`export default 42;`,
				`export default 42;
`,
			);
		});

		test('terminates an arrow function export', async () => {
			await expectPrettierFormat(
				`export default (a, b) => a + b;`,
				`export default (a, b) => a + b;
`,
			);
		});

		test('terminates a call expression export', async () => {
			await expectPrettierFormat(
				`export default createStore();`,
				`export default createStore();
`,
			);
		});

		test('terminates an `as` expression export', async () => {
			await expectPrettierFormat(
				`export default foo as Bar;`,
				`export default foo as Bar;
`,
			);
		});

		test('does not let a following paren line join the exported expression', async () => {
			await expectPrettierFormat(
				`export default foo;
(function () {})();`,
				`export default foo;
(function () {})();
`,
			);
		});

		test('does not let a following bracket line join the exported expression', async () => {
			await expectPrettierFormat(
				`export default foo;
[1, 2].forEach(log);`,
				`export default foo;
[1, 2].forEach(log);
`,
			);
		});

		test('does not let a following template line join the exported expression', async () => {
			await expectPrettierFormat(
				`export default foo;
\`side effect\`;`,
				`export default foo;
\`side effect\`;
`,
			);
		});

		test('omits the terminator when semi is disabled', async () => {
			await expectPrettierFormat(
				`export default foo;`,
				`export default foo
`,
				{ semi: false },
			);
		});

		test('leaves a class declaration unterminated', async () => {
			await expectPrettierFormat(
				`export default class Named {}`,
				`export default class Named {}
`,
			);
		});

		test('leaves an abstract class declaration unterminated', async () => {
			await expectPrettierFormat(
				`export default abstract class A {}`,
				`export default abstract class A {}
`,
			);
		});

		test('leaves a function declaration unterminated', async () => {
			await expectPrettierFormat(
				`export default function foo() {}`,
				`export default function foo() {}
`,
			);
		});

		test('leaves an interface declaration unterminated', async () => {
			await expectPrettierFormat(
				`export default interface Foo {}`,
				`export default interface Foo {}
`,
			);
		});

		test('leaves a decorated class declaration unterminated', async () => {
			await expectPrettierFormat(
				`export default @dec class Named {}`,
				`export default
@dec
class Named {}
`,
			);
		});
	});

	describe('anonymous default-exported function declarations', () => {
		test('prints an anonymous function declaration', async () => {
			await expectPrettierFormat(
				`export default function () {}`,
				`export default function () {}
`,
			);
		});

		test('prints an anonymous async function declaration', async () => {
			await expectPrettierFormat(
				`export default async function () {}`,
				`export default async function () {}
`,
			);
		});

		test('prints an anonymous generator declaration', async () => {
			await expectPrettierFormat(
				`export default function* () {}`,
				`export default function* () {}
`,
			);
		});

		test('prints an anonymous function declaration with parameters', async () => {
			await expectPrettierFormat(
				`export default function (a, b) {
  return a + b;
}`,
				`export default function (a, b) {
  return a + b;
}
`,
			);
		});
	});

	describe('decorators survive formatting', () => {
		test('keeps decorators in every position', async () => {
			await expectPrettierFormat(
				`@sealed
class A {
  @log
  method() {}
  @inject accessor x = 1;
  m(@param() a: number) {}
}`,
				`@sealed
class A {
  @log
  method() {}
  @inject accessor x = 1;
  m(@param() a: number) {}
}
`,
			);
		});

		test('keeps a decorator on a class declaration', async () => {
			await expectPrettierFormat(
				`@sealed
class Widget {
  render() {
    return 1;
  }
}`,
				`@sealed
class Widget {
  render() {
    return 1;
  }
}
`,
			);
		});

		test('gives each class decorator its own line', async () => {
			await expectPrettierFormat(
				`@first @second class Widget {}`,
				`@first
@second
class Widget {}
`,
			);
		});

		test('keeps a class member decorator on its own line', async () => {
			await expectPrettierFormat(
				`class Store {
  @observable
  count = 0;

  @action
  increment() {
    this.count++;
  }
}`,
				`class Store {
  @observable
  count = 0;

  @action
  increment() {
    this.count++;
  }
}
`,
			);
		});

		test('keeps a class member decorator inline when it was written inline', async () => {
			await expectPrettierFormat(
				`class Store {
  @observable count = 0;
  @inject accessor service = null;

  @action increment() {
    this.count++;
  }
}`,
				`class Store {
  @observable count = 0;
  @inject accessor service = null;

  @action increment() {
    this.count++;
  }
}
`,
			);
		});

		test('keeps several inline decorators on one member', async () => {
			await expectPrettierFormat(
				`class Store {
  @first @second count = 0;

  ping() {
    return 1;
  }
}`,
				`class Store {
  @first @second count = 0;

  ping() {
    return 1;
  }
}
`,
			);
		});

		test('moves an inline decorator too long for the line onto its own line', async () => {
			await expectPrettierFormat(
				`class Store {
  @veryLongDecoratorNameHere({ option: 1, another: 2, third: 3, fourth: 4 }) method() {
    return 1;
  }
}`,
				`class Store {
  @veryLongDecoratorNameHere({ option: 1, another: 2, third: 3, fourth: 4 })
  method() {
    return 1;
  }
}
`,
			);
		});

		test('keeps decorators alongside other member modifiers', async () => {
			await expectPrettierFormat(
				`class Store {
  @dec static base = 1;
  @dec declare readonly id: number;

  @dec
  @other
  private static async *walk() {
    yield 1;
  }
}`,
				`class Store {
  @dec static base = 1;
  @dec declare readonly id: number;

  @dec
  @other
  private static async *walk() {
    yield 1;
  }
}
`,
			);
		});

		test('keeps decorators on accessors and computed keys', async () => {
			await expectPrettierFormat(
				`class Store {
  @dec ["computed"] = 1;

  @dec
  @other()
  get value() {
    return 1;
  }

  @dec set value(next) {
    this.inner = next;
  }
}`,
				`class Store {
  @dec ["computed"] = 1;

  @dec
  @other()
  get value() {
    return 1;
  }

  @dec set value(next) {
    this.inner = next;
  }
}
`,
			);
		});

		test('keeps decorators built from member and call expressions', async () => {
			await expectPrettierFormat(
				`@dec.nested.deep({ a: 1 })
class Widget {}`,
				`@dec.nested.deep({ a: 1 })
class Widget {}
`,
			);
		});

		test('keeps parameter decorators inline', async () => {
			await expectPrettierFormat(
				`class Store {
  handle(@inject() service: Service, @body() payload: Payload) {
    return service;
  }
}`,
				`class Store {
  handle(@inject() service: Service, @body() payload: Payload) {
    return service;
  }
}
`,
			);
		});

		test('keeps parameter decorators before parameter property modifiers', async () => {
			await expectPrettierFormat(
				`class Store {
  constructor(@inject private readonly service: Service) {
    this.ready = true;
  }
}`,
				`class Store {
  constructor(@inject private readonly service: Service) {
    this.ready = true;
  }
}
`,
			);
		});

		test('breaks the parameter decorators of "class A {\\n  m(@inject({ aaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbb: 2, cccccccccccccc: 3 }) bar: IBar) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(@inject({ aaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbb: 2, cccccccccccccc: 3 }) bar: IBar) {}
}`,
				`class A {
  m(
    @inject({
      aaaaaaaaaaaaaaaaaaa: 1,
      bbbbbbbbbbbbbbbbbbbbbb: 2,
      cccccccccccccc: 3,
    })
    bar: IBar,
  ) {}
}
`,
			);
		});

		test('breaks the parameter decorators of "class A {\\n  constructor(@Inject(forwardRef(() => SomeVeryLongServiceNameHereToForceBreak)) private readonly service: SomeService) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(@Inject(forwardRef(() => SomeVeryLongServiceNameHereToForceBreak)) private readonly service: SomeService) {}
}`,
				`class A {
  constructor(
    @Inject(forwardRef(() => SomeVeryLongServiceNameHereToForceBreak))
    private readonly service: SomeService,
  ) {}
}
`,
			);
		});

		test('breaks the parameter decorators of "class A {\\n  m(@a\\n    @b x) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(@a
    @b x) {}
}`,
				`class A {
  m(
    @a
    @b
    x,
  ) {}
}
`,
			);
		});

		test('breaks the parameter decorators of "class A {\\n  m(@a\\n  x: T, y) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(@a
  x: T, y) {}
}`,
				`class A {
  m(
    @a
    x: T,
    y,
  ) {}
}
`,
			);
		});

		test('breaks the parameter decorators of "class A {\\n  m(@a() { bbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccccccccccccccc, ddddddddddddddddddd }: T) {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A {
  m(@a() { bbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccccccccccccccccc, ddddddddddddddddddd }: T) {}
}`,
				`class A {
  m(
    @a()
    {
      bbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
      ccccccccccccccccccccccccccccc,
      ddddddddddddddddddd,
    }: T,
  ) {}
}
`,
			);
		});

		test('keeps the parameter decorators of "class A {\\n  constructor(\\n    @inject(Bar)\\n    private readonly bar: IBar,\\n  ) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  constructor(
    @inject(Bar)
    private readonly bar: IBar,
  ) {}
}`,
				`class A {
  constructor(
    @inject(Bar)
    private readonly bar: IBar,
  ) {}
}
`,
			);
		});

		test('keeps the parameter decorators of "class Foo {\\n  constructor(\\n    @inject(Bar)\\n    private readonly bar: IBar,\\n\\n    @inject(MyProcessor)\\n    private readonly myProcessor: IMyProcessor,\\n  ) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class Foo {
  constructor(
    @inject(Bar)
    private readonly bar: IBar,

    @inject(MyProcessor)
    private readonly myProcessor: IMyProcessor,
  ) {}
}`,
				`class Foo {
  constructor(
    @inject(Bar)
    private readonly bar: IBar,

    @inject(MyProcessor)
    private readonly myProcessor: IMyProcessor,
  ) {}
}
`,
			);
		});

		test('keeps the parameter decorators of "class A {\\n  m(\\n    @a\\n    @b()\\n    x: T,\\n  ) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m(
    @a
    @b()
    x: T,
  ) {}
}`,
				`class A {
  m(
    @a
    @b()
    x: T,
  ) {}
}
`,
			);
		});

		test('keeps the parameter decorators of "class A {\\n  m(@a @b x, @c y) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m(@a @b x, @c y) {}
}`,
				`class A {
  m(@a @b x, @c y) {}
}
`,
			);
		});

		test('keeps the parameter decorators of "class A {\\n  m(@a({ b: 1 }) { c }: T) {}\\n}"', async () => {
			await expectPrettierFormat(
				`class A {
  m(@a({ b: 1 }) { c }: T) {}
}`,
				`class A {
  m(@a({ b: 1 }) { c }: T) {}
}
`,
			);
		});

		test('keeps decorators above the export keyword', async () => {
			await expectPrettierFormat(
				`@sealed
export class Widget {}`,
				`@sealed
export class Widget {}
`,
			);
		});

		test('keeps the decorators of "export @sealed class Widget {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @sealed class Widget {}`,
				`export
@sealed
class Widget {}
`,
			);
		});

		test('keeps the decorators of "export default @sealed class Widget {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export default @sealed class Widget {}`,
				`export default
@sealed
class Widget {}
`,
			);
		});

		test('keeps the decorators of "export default @sealed class {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export default @sealed class {}`,
				`export default
@sealed
class {}
`,
			);
		});

		test('keeps the decorators of "export @a @b() @c.d(1, 2) class A {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @a @b() @c.d(1, 2) class A {}`,
				`export
@a
@b()
@c.d(1, 2)
class A {}
`,
			);
		});

		test('keeps the decorators of "export @dec abstract class A {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @dec abstract class A {}`,
				`export
@dec
abstract class A {}
`,
			);
		});

		test('keeps the decorators of "export @dec @dec2\\nclass A {\\n  x = 1;\\n}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @dec @dec2
class A {
  x = 1;
}`,
				`export
@dec
@dec2
class A {
  x = 1;
}
`,
			);
		});

		test('keeps the decorators of "export @dec() @withLongArguments({ a: 1, bbbbbbbbbbbbbbbb: 2, cccccccccccccccccccc: 3, ddddddddddd: 4 }) class A {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @dec() @withLongArguments({ a: 1, bbbbbbbbbbbbbbbb: 2, cccccccccccccccccccc: 3, ddddddddddd: 4 }) class A {}`,
				`export
@dec()
@withLongArguments({
  a: 1,
  bbbbbbbbbbbbbbbb: 2,
  cccccccccccccccccccc: 3,
  ddddddddddd: 4,
})
class A {}
`,
			);
		});

		test('keeps the decorators of "export @dec /* c */ class A {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @dec /* c */ class A {}`,
				`export
@dec /* c */
class A {}
`,
			);
		});

		test('keeps the decorators of "export @dec // c\\nclass A {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`export @dec // c
class A {}`,
				`export
@dec // c
class A {}
`,
			);
		});

		test('keeps the decorators of "/* x */ export @dec class A {}" after export like Prettier', async () => {
			await expectPrettierFormat(
				`/* x */ export @dec class A {}`,
				`/* x */ export
@dec
class A {}
`,
			);
		});

		test('keeps "// prettier-ignore\\nexport @dec   class A   {}"', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
export @dec   class A   {}`,
				`// prettier-ignore
export @dec   class A   {}
`,
			);
		});

		test('keeps "// prettier-ignore\\n@dec   export class A   {}"', async () => {
			await expectPrettierFormat(
				`// prettier-ignore
@dec   export class A   {}`,
				`// prettier-ignore
@dec   export class A   {}
`,
			);
		});

		test('keeps "export // prettier-ignore\\n@dec   class A   {}"', async () => {
			await expectPrettierFormat(
				`export // prettier-ignore
@dec   class A   {}`,
				`export // prettier-ignore
@dec   class A   {}
`,
			);
		});

		test('keeps "@dec\\nexport class A {}\\n@dec\\nexport default class B {}"', async () => {
			await expectPrettierFormat(
				`@dec
export class A {}
@dec
export default class B {}`,
				`@dec
export class A {}
@dec
export default class B {}
`,
			);
		});

		test('keeps decorators on a default-exported class', async () => {
			await expectPrettierFormat(
				`@sealed
export default class Widget {}`,
				`@sealed
export default class Widget {}
`,
			);
		});

		test('keeps decorators on a class expression', async () => {
			await expectPrettierFormat(
				`const Widget =
  @sealed
  class {};`,
				`const Widget =
  @sealed
  class {};
`,
			);
		});

		test('formats "(@deco class Foo {});" like Prettier', async () => {
			await expectPrettierFormat(
				`(@deco class Foo {});`,
				`(
  @deco
  class Foo {}
);
`,
			);
		});

		test('formats "(@deco class {}).name;" like Prettier', async () => {
			await expectPrettierFormat(
				`(@deco class {}).name;`,
				`(
  @deco
  class {}
).name;
`,
			);
		});

		test('formats "new (@dec class {})();" like Prettier', async () => {
			await expectPrettierFormat(
				`new (@dec class {})();`,
				`new (
  @dec
  class {}
)();
`,
			);
		});

		test('formats "(@dec class {})();" like Prettier', async () => {
			await expectPrettierFormat(
				`(@dec class {})();`,
				`(
  @dec
  class {}
)();
`,
			);
		});

		test('breaks inside the parentheses of a decorated class expression with semi: false', async () => {
			await expectPrettierFormat(
				`(@deco class Foo {}).name`,
				`;(
  @deco
  class Foo {}
).name
`,
				{ semi: false },
			);
		});

		test('keeps "class A extends (\\n  @dec\\n  class {}\\n) {}"', async () => {
			await expectPrettierFormat(
				`class A extends (
  @dec
  class {}
) {}`,
				`class A extends (
  @dec
  class {}
) {}
`,
			);
		});

		test('keeps "foo(\\n  @dec\\n  class {},\\n);"', async () => {
			await expectPrettierFormat(
				`foo(
  @dec
  class {},
);`,
				`foo(
  @dec
  class {},
);
`,
			);
		});

		test('keeps decorators alongside leading comments', async () => {
			await expectPrettierFormat(
				`// widget entry point
@sealed
class Widget {
  // the counter
  @observable
  count = 0;

  ping() {
    return 1;
  }
}`,
				`// widget entry point
@sealed
class Widget {
  // the counter
  @observable
  count = 0;

  ping() {
    return 1;
  }
}
`,
			);
		});

		test('keeps blank lines between decorated classes', async () => {
			await expectPrettierFormat(
				`@first
class A {}

@second
class B {}`,
				`@first
class A {}

@second
class B {}
`,
			);
		});
	});

	describe('call arguments hug like Prettier', () => {
		test('breaks after => in a last-argument arrow with an expression body', async () => {
			await expectPrettierFormat(
				`const p2 = makePromise<void>((resolve) => setTimeout(resolve, 1000000000000000000000000000000000000000));
const p6 = runLater(firstArgument, secondArgument, (resolve) => setTimeout(resolve, 100000000000000000000));
const p3 = makePromise<void>((resolve) => resolve?.(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbb));
const p4 = makePromise<void>((resolve) => setTimeout(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbb)!);
const p5 = makePromise<void>((resolve) => (condition ? resolve(aaaaaaaaaaaaaaaaaaaaaaaaaa) : reject(bbbbbbbbbbbb)));
const p9 = new Promise((resolve) => setTimeout(resolve, 100000000000000000000000000000000000000000));`,
				`const p2 = makePromise<void>((resolve) =>
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
);
`,
			);
		});

		test('keeps the opening of an object or array body on the call line', async () => {
			await expectPrettierFormat(
				`const p7 = items.map((item) => ({ id: item.id, label: item.label, description: item.description, x: 1 }));
const p8 = items.map((item) => [item.id, item.label, item.description, item.somethingElse, item.more]);`,
				`const p7 = items.map((item) => ({
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
]);
`,
			);
		});

		test('breaks every argument when a last-argument function would break its parameters', async () => {
			await expectPrettierFormat(
				`const p10 = items.map((item) => item.someProperty.anotherProperty.yetAnotherProperty.finalProperty);
template = template.replace(/\\{([^\\{\\}]+)\\}|([^\\{\\}]+)/g, function (_, expression, literal) {
  return 1;
});
const runConfig = makeWeakCache(function* runConfigWithAVeryLongName(options, cache) {
  return 1;
});`,
				`const p10 = items.map(
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
);
`,
			);
		});

		test('breaks every argument around a leading function unless one short argument follows', async () => {
			await expectPrettierFormat(
				`const obs = makeObserver((entries) => { for (const entry of entries) console.log(entry); }, { threshold: 0.5 });
foo(() => { doSomething(); }, a, b);
foo(a, () => { doSomething(); }, { x: 1 });
useCallback((event) => { handle(event); }, [a, b]);
foo(() => { doSomething(); }, cond ? a : b);
foo(() => { doSomething(); }, bar(a, b));`,
				`const obs = makeObserver(
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
);
`,
			);
		});

		test('breaks every argument rather than breaking the parameter type of a hugged callback', async () => {
			await expectPrettierFormat(
				`cluster.on('open', (tunnel: { destroy: () => void; once: (event: string, handler: () => void) => void }) => {
  count++;
});
emitter.on("change", (value: { a: string; b: number }) => {
  count++;
});`,
				`cluster.on(
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
});
`,
			);
		});

		test('hugs a leading function followed by one short argument', async () => {
			await expectPrettierFormat(
				`setTimeout(() => {
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
}, 500);`,
				`setTimeout(() => {
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
}, 500);
`,
			);
		});

		test('lets the dependency array of a React hook break by itself', async () => {
			await expectPrettierFormat(
				`useEffect(() => { doSomething(); }, [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]);
useImperativeHandle(ref, () => { return api; }, [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]);
useMemo(async () => { await doSomething(); }, [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb]);
useEffect(() => { doSomething(); }, [a, b]);`,
				`useEffect(() => {
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
}, [a, b]);
`,
			);
		});

		test('breaks every argument of function compositions', async () => {
			await expectPrettierFormat(
				`source.pipe(map((x) => x + x), filter((x) => x % 2 === 0));`,
				`source.pipe(
  map((x) => x + x),
  filter((x) => x % 2 === 0),
);
`,
			);
		});

		test('breaks every argument instead of hugging a function after a broken object', async () => {
			await expectPrettierFormat(
				`function plugin() {
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
});`,
				`function plugin() {
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
);
`,
			);
		});

		test('hugs a function after a short object', async () => {
			await expectPrettierFormat(
				`build.onLoad({ filter: PATTERN }, async (args) => {
  return readFile(args.path, "utf-8");
});`,
				`build.onLoad({ filter: PATTERN }, async (args) => {
  return readFile(args.path, "utf-8");
});
`,
			);
		});

		test('keeps the arguments of test calls, require calls, and AMD definitions on one line', async () => {
			await expectPrettierFormat(
				`it("does something really interesting with the value that it receives", async () => {
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
});`,
				`it("does something really interesting with the value that it receives", async () => {
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
});
`,
			);
		});

		test('breaks between the source and options of an import() like call arguments', async () => {
			await expectPrettierFormat(
				`await import("./long/long/long/long/long/long/long/long/long/path/to/module.js", options);
const m = import.defer("./long/long/long/long/long/long/long/long/long/path/to/module.js", options);
const n = import(/* webpackChunkName: "fooooooooooooooooooooo" */ "./long/long/long/path.js");
const o = import(someVeryLongVariableNameeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
const p = import(
  // comment
  "./foo"
);`,
				`await import(
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
);
`,
			);
			await expectPrettierFormat(
				`await import("./long/long/long/long/long/long/long/long/long/path/to/module.js", options);
const m = import.defer("./long/long/long/long/long/long/long/long/long/path/to/module.js", options);
const n = import(/* webpackChunkName: "fooooooooooooooooooooo" */ "./long/long/long/path.js");
const o = import(someVeryLongVariableNameeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee);
const p = import(
  // comment
  "./foo"
);`,
				`await import(
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
);
`,
				{ trailingComma: 'all' },
			);
		});

		test('breaks an import() with a long source and import attributes like Prettier', async () => {
			await expectPrettierFormat(
				`const data = import("./long/long/long/long/long/long/long/long/long/path/to/data.json", { with: { type: "json" } });`,
				`const data = import(
  "./long/long/long/long/long/long/long/long/long/path/to/data.json",
  { with: { type: "json" } }
);
`,
				{ trailingComma: 'all' },
			);
		});

		test('keeps "const data = import(\\"./data.json\\", { with: { type: \\"json\\" } });"', async () => {
			await expectPrettierFormat(
				`const data = import("./data.json", { with: { type: "json" } });`,
				`const data = import("./data.json", { with: { type: "json" } });
`,
			);
		});

		test('keeps "const data = import(\\"./data.json\\", {\\n  with: { type: \\"json\\", integrity: \\"sha384-abcdefghijk\\" },\\n});"', async () => {
			await expectPrettierFormat(
				`const data = import("./data.json", {
  with: { type: "json", integrity: "sha384-abcdefghijk" },
});`,
				`const data = import("./data.json", {
  with: { type: "json", integrity: "sha384-abcdefghijk" },
});
`,
			);
		});

		test('keeps "const m =\\n  import(\\"./long/long/long/long/long/long/long/long/long/long/long/long/path.js\\");"', async () => {
			await expectPrettierFormat(
				`const m =
  import("./long/long/long/long/long/long/long/long/long/long/long/long/path.js");`,
				`const m =
  import("./long/long/long/long/long/long/long/long/long/long/long/long/path.js");
`,
			);
		});

		test('keeps "const m = import(/* webpackChunkName: \\"foo\\" */ \\"./foo\\");"', async () => {
			await expectPrettierFormat(
				`const m = import(/* webpackChunkName: "foo" */ "./foo");`,
				`const m = import(/* webpackChunkName: "foo" */ "./foo");
`,
			);
		});

		test('breaks the arguments of a long curried call before the call on it', async () => {
			await expectPrettierFormat(
				`export default connect(mapStateToPropsWithAVeryLongName, mapDispatchToPropsWithALongName)(Component);`,
				`export default connect(
  mapStateToPropsWithAVeryLongName,
  mapDispatchToPropsWithALongName,
)(Component);
`,
			);
		});
	});

	describe('new expression arguments break like call arguments', () => {
		test('puts each argument on its own line when they do not fit', async () => {
			await expectPrettierFormat(
				`const x = new Foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);`,
				`const x = new Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
);
`,
			);
		});

		test('breaks a lone argument that cannot break by itself', async () => {
			await expectPrettierFormat(
				`throw new Error(\`Something went terribly wrong with the value \${value} and \${otherValue}\`);`,
				`throw new Error(
  \`Something went terribly wrong with the value \${value} and \${otherValue}\`,
);
`,
			);
		});

		test('keeps a blank line between arguments', async () => {
			await expectPrettierFormat(
				`const x = new Foo(
  a,

  b,
);`,
				`const x = new Foo(
  a,

  b,
);
`,
			);
		});

		test('expands a last object argument and hugs a lone callback', async () => {
			await expectPrettierFormat(
				`const formatter = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" });
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module", name: "background" });
const promise = new Promise<void>((resolve) => { setTimeout(resolve, 1000); });
const set = new Set([aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc]);`,
				`const formatter = new Intl.DateTimeFormat("en-US", {
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
]);
`,
			);
		});

		test('keeps short argument lists on one line', async () => {
			await expectPrettierFormat(
				`const a = new Foo();
const b = new Foo(first, second);
const c = new (getClass())(first, second);`,
				`const a = new Foo();
const b = new Foo(first, second);
const c = new (getClass())(first, second);
`,
			);
		});

		test('expands a last object or array argument through an as or satisfies cast', async () => {
			await expectPrettierFormat(
				`throw new MalformedNodeError({ type: NodeType.IndexedValue, index: id, other: somethingElse } as SerovalNode);
report({ type: NodeType.IndexedValue, index: id, other: somethingElseHere, more: 1 } satisfies Report);
const pair = new Pair(first, [aaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccccccc] as const);`,
				`throw new MalformedNodeError({
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
] as const);
`,
			);
		});

		test('parenthesizes an optional chain only as the callee', async () => {
			await expectPrettierFormat(
				`const client = new HttpClient(system?.proxyUrl, options?.agent);
const widget = new (registry?.Widget)();`,
				`const client = new HttpClient(system?.proxyUrl, options?.agent);
const widget = new (registry?.Widget)();
`,
			);
		});
	});

	describe('trailing commas follow the trailingComma option', () => {
		test('with trailingComma all', async () => {
			await expectPrettierFormat(
				`foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
new Foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
function bar(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc) {}
const baz = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccc) => {};
interface Triple<Aaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccccccccccccc> {}
const values = [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc];
const object = { aaaaaaaaaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2, cccccc: 3 };`,
				`foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
);
new Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
);
function bar(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
) {}
const baz = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccc,
) => {};
interface Triple<
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccccccccccccc,
> {}
const values = [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
];
const object = {
  aaaaaaaaaaaaaaaaaaaaaaaaaa: 1,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2,
  cccccc: 3,
};
`,
				{ trailingComma: 'all' },
			);
		});

		test('with trailingComma es5', async () => {
			await expectPrettierFormat(
				`foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
new Foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
function bar(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc) {}
const baz = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccc) => {};
interface Triple<Aaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccccccccccccc> {}
const values = [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc];
const object = { aaaaaaaaaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2, cccccc: 3 };`,
				`foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
);
new Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
);
function bar(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
) {}
const baz = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccc
) => {};
interface Triple<
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccccccccccccc,
> {}
const values = [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc,
];
const object = {
  aaaaaaaaaaaaaaaaaaaaaaaaaa: 1,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2,
  cccccc: 3,
};
`,
				{ trailingComma: 'es5' },
			);
		});

		test('with trailingComma none', async () => {
			await expectPrettierFormat(
				`foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
new Foo(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc);
function bar(aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc) {}
const baz = (aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, cccccccccccc) => {};
interface Triple<Aaaaaaaaaaaaaaaaaaaaaaaaaaaa, Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, Cccccccccccccc> {}
const values = [aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, ccccccccccccccc];
const object = { aaaaaaaaaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2, cccccc: 3 };`,
				`foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
);
new Foo(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
);
function bar(
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
) {}
const baz = (
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  cccccccccccc
) => {};
interface Triple<
  Aaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  Cccccccccccccc
> {}
const values = [
  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb,
  ccccccccccccccc
];
const object = {
  aaaaaaaaaaaaaaaaaaaaaaaaaa: 1,
  bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: 2,
  cccccc: 3
};
`,
				{ trailingComma: 'none' },
			);
		});
	});

	describe('`abstract` before a line break after `export default`', () => {
		test('formats "export default abstract\\nclass A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`export default abstract
class A {}`,
				`export default abstract;
class A {}
`,
			);
		});

		test('formats "declare module \\"m\\" {\\n  export default abstract\\n  class A {}\\n}" like Prettier', async () => {
			await expectPrettierFormat(
				`declare module "m" {
  export default abstract
  class A {}
}`,
				`declare module "m" {
  export default abstract;
  class A {}
}
`,
			);
		});

		test('refuses "export abstract function f() {}"', async () => {
			await expect(format(`export abstract function f() {}`)).rejects.toThrow(
				"'abstract' modifier can only appear on a class, method, or property declaration.",
			);
		});

		test('refuses "export abstract const x = 1;"', async () => {
			await expect(format(`export abstract const x = 1;`)).rejects.toThrow(
				"'abstract' modifier can only appear on a class, method, or property declaration.",
			);
		});
	});

	describe('declarations after TypeScript keywords', () => {
		test('formats "abstract declare class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`abstract declare class A {}`,
				`declare abstract class A {}
`,
			);
		});

		test('formats "export abstract declare class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`export abstract declare class A {}`,
				`export declare abstract class A {}
`,
			);
		});

		test('formats "export default interface\\nI {}" like Prettier', async () => {
			await expectPrettierFormat(
				`export default interface
I {}`,
				`export default interface I {}
`,
			);
		});

		test('formats "type as = 1;" like Prettier', async () => {
			await expectPrettierFormat(
				`type as = 1;`,
				`type as = 1;
`,
			);
		});

		test('formats "type satisfies<T> = T;" like Prettier', async () => {
			await expectPrettierFormat(
				`type satisfies<T> = T;`,
				`type satisfies<T> = T;
`,
			);
		});

		test('formats "let x: import(\\"m\\", { with: { \\"resolution-mode\\": \\"import\\" } }).X;" like Prettier', async () => {
			await expectPrettierFormat(
				`let x: import("m", { with: { "resolution-mode": "import" } }).X;`,
				`let x: import("m", { with: { "resolution-mode": "import" } }).X;
`,
			);
		});

		test('formats "import \\\\u0074ype { a } from \\"m\\";" like Prettier', async () => {
			await expectPrettierFormat(
				`import \\u0074ype { a } from "m";`,
				`import type { a } from "m";
`,
			);
		});

		test('formats "export { \\\\u0074ype a } from \\"m\\";" like Prettier', async () => {
			await expectPrettierFormat(
				`export { \\u0074ype a } from "m";`,
				`export { type a } from "m";
`,
			);
		});

		test('formats "export default @dec declare class A {}" like Prettier', async () => {
			await expectPrettierFormat(
				`export default @dec declare class A {}`,
				`export default
@dec
declare class A {}
`,
			);
		});

		test('refuses "export abstract interface I {}"', async () => {
			await expect(format(`export abstract interface I {}`)).rejects.toThrow(
				"'abstract' modifier can only appear on a class, method, or property declaration.",
			);
		});

		test('refuses "abstract function f() {}"', async () => {
			await expect(format(`abstract function f() {}`)).rejects.toThrow(
				"'abstract' modifier can only appear on a class, method, or property declaration.",
			);
		});

		test('refuses "public class A {}"', async () => {
			await expect(format(`public class A {}`)).rejects.toThrow(
				"'public' modifier cannot appear on a module or namespace element.",
			);
		});

		test('refuses "abstract export class A {}"', async () => {
			await expect(format(`abstract export class A {}`)).rejects.toThrow(
				"'export' modifier must precede 'abstract' modifier.",
			);
		});

		test('refuses "export declare async function f(): void;"', async () => {
			await expect(format(`export declare async function f(): void;`)).rejects.toThrow(
				"'async' modifier cannot be used in an ambient context.",
			);
		});
	});

	describe('type arguments and parameters the parser used to reject', () => {
		test('formats "class A extends B\\n<T> {}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends B
<T> {}`,
				`class A extends B<T> {}
`,
			);
		});

		test('formats "class A extends B.C\\n  <T, U>\\n  implements I\\n{}" like Prettier', async () => {
			await expectPrettierFormat(
				`class A extends B.C
  <T, U>
  implements I
{}`,
				`class A extends B.C<T, U> implements I {}
`,
			);
		});

		test('formats "((class<T> { x?: T })<string>).name" like Prettier', async () => {
			await expectPrettierFormat(
				`((class<T> { x?: T })<string>).name`,
				`(class<T> {
  x?: T;
}<string>).name;
`,
			);
		});

		test('formats "const A = class<T> { x?: T }<string>;" like Prettier', async () => {
			await expectPrettierFormat(
				`const A = class<T> { x?: T }<string>;`,
				`const A = class<T> {
  x?: T;
}<string>;
`,
			);
		});

		test('formats "const f = function <T>(x: T) { return x; }<string>(1);" like Prettier', async () => {
			await expectPrettierFormat(
				`const f = function <T>(x: T) { return x; }<string>(1);`,
				`const f = (function <T>(x: T) {
  return x;
})<string>(1);
`,
			);
		});

		test('formats "const v = new class<T> {}<string>();" like Prettier', async () => {
			await expectPrettierFormat(
				`const v = new class<T> {}<string>();`,
				`const v = new (class<T> {})<string>();
`,
			);
		});

		test('formats "const o = { m<const T>(x: T) { return x; } };" like Prettier', async () => {
			await expectPrettierFormat(
				`const o = { m<const T>(x: T) { return x; } };`,
				`const o = {
  m<const T>(x: T) {
    return x;
  },
};
`,
			);
		});
	});
});
