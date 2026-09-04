/**
 * Table-driven parser spec for the RFC "sibling-scoped `<style>` blocks,
 * `$class`, `apply`" syntax. It is replayed by `tests/utils/parser.test.js`
 * against the acorn parser and doubles as the porting spec for the Rust parser
 * (`oxc-tsrx`), so it is deliberately dependency-free: every case is plain
 * data plus a tiny `locate(ast)` function that walks from the `Program` to the
 * node whose shape is described.
 *
 * Shape vocabulary (all plain objects, matched structurally by the test):
 *
 * - `{ type: 'JSXStyleElement', selfClosing, attributes, apply?, children, css,
 *    hasScopeHash, closingElement }`
 *   - `attributes`: attribute names on `openingElement.attributes`, in order.
 *   - `apply`: the node type of the `apply={…}` expression, when present.
 *   - `children`: `[]` for a self-closed block, `['StyleSheet']` for a body.
 *   - `css`: the raw CSS text (`''` when self-closed).
 *   - `hasScopeHash`: whether `metadata.styleScopeHash` is set.
 *   - `closingElement`: whether `closingElement` is present.
 * - `{ type: 'JSXElement', name, children? }` / `{ type: 'JSXFragment', children }`
 *   - `children`, when given, lists the element's children in order. A
 *     `<style>` whose first non-whitespace child character is `{` is an
 *     ordinary `JSXElement` named `style` with expression-container children
 *     (plain-TSX `<style>{css}</style>`), never a `JSXStyleElement`.
 * - `{ type: 'JSXCodeBlock', body, render }` where `body` lists the setup
 *   statements in source order and `render` is the single output node or
 *   `null`. A `<style>` block is an output node: beside another output it is
 *   the multiple-outputs error, and the valid placement is inside a fragment
 *   or element.
 * - `{ type: 'JSXIfExpression', consequent, alternate }`,
 *   `{ type: 'JSXForExpression', body, empty }`,
 *   `{ type: 'JSXSwitchExpression', cases: [{ test, consequent }] }`,
 *   `{ type: 'JSXTryExpression', block, pending, handler, finalizer }`
 *   where each clause is the statement list of its block (`null` when absent).
 * - Any other `{ type }` matches on `type` alone (e.g. a setup statement or a
 *   `JSXExpressionContainer` child).
 *
 * Negative cases carry `error: { message, start, end }` instead of `expected`
 * (or alongside it, when the recovered tree is also specified): `start`/`end`
 * are the offsets of the reported range in `source`.
 *
 * @typedef {{
 *   type: 'JSXStyleElement',
 *   selfClosing: boolean,
 *   attributes: string[],
 *   apply?: string,
 *   children: string[],
 *   css: string,
 *   hasScopeHash: boolean,
 *   closingElement: boolean,
 * }} StyleShape
 * @typedef {{ type: 'JSXElement', name: string, children?: Shape[] }} ElementShape
 * @typedef {{ type: 'JSXFragment', children: Shape[] }} FragmentShape
 * @typedef {{ type: 'JSXCodeBlock', body: Shape[], render: Shape | null }} CodeBlockShape
 * @typedef {{ type: 'JSXIfExpression', consequent: Shape[], alternate: Shape[] | null }} IfShape
 * @typedef {{ type: 'JSXForExpression', body: Shape[], empty: Shape[] | null }} ForShape
 * @typedef {{ test: string | null, consequent: Shape[] }} SwitchCaseShape
 * @typedef {{ type: 'JSXSwitchExpression', cases: SwitchCaseShape[] }} SwitchShape
 * @typedef {{
 *   type: 'JSXTryExpression',
 *   block: Shape[],
 *   pending: Shape[] | null,
 *   handler: Shape[] | null,
 *   finalizer?: Shape[] | null,
 * }} TryShape
 * @typedef {{ type: 'VariableDeclaration' | 'ExpressionStatement' | 'JSXExpressionContainer' }} StatementShape
 * @typedef {StyleShape
 *   | ElementShape
 *   | FragmentShape
 *   | CodeBlockShape
 *   | IfShape
 *   | ForShape
 *   | SwitchShape
 *   | TryShape
 *   | StatementShape} Shape
 *
 * The parsed `Program` is walked untyped on purpose: the table must not depend
 * on the JS parser's AST typings so it can be lifted verbatim into an issue.
 * @typedef {(ast: any) => unknown} Locate
 * @typedef {{ message: string, start?: number, end?: number }} ExpectedError
 * @typedef {{ name: string, source: string, locate: Locate, expected: Shape, error?: undefined }} PositiveCase
 * @typedef {{ name: string, source: string, locate: Locate, error: ExpectedError, expected?: Shape }} NegativeCase
 * @typedef {PositiveCase | NegativeCase} StyleSyntaxCase
 */

/**
 * A self-closed `<style … />`: no CSS body, no scope hash.
 *
 * @param {string[]} [attributes]
 * @param {string} [apply]
 * @returns {StyleShape}
 */
const style_self = (attributes = [], apply = undefined) => ({
	type: 'JSXStyleElement',
	selfClosing: true,
	attributes,
	...(apply ? { apply } : {}),
	children: [],
	css: '',
	hasScopeHash: false,
	closingElement: false,
});

/**
 * A bodied `<style>…</style>`: parsed sheet, raw CSS, scope hash.
 *
 * @param {string} css
 * @param {string[]} [attributes]
 * @param {string} [apply]
 * @returns {StyleShape}
 */
const style_body = (css, attributes = [], apply = undefined) => ({
	type: 'JSXStyleElement',
	selfClosing: false,
	attributes,
	...(apply ? { apply } : {}),
	children: ['StyleSheet'],
	css,
	hasScopeHash: true,
	closingElement: true,
});

/**
 * @param {string} name
 * @param {Shape[]} [children]
 * @returns {ElementShape}
 */
const element = (name, children = undefined) => ({
	type: 'JSXElement',
	name,
	...(children ? { children } : {}),
});

/**
 * The ordinary TSX `<style>{css}</style>`: a `JSXElement` named `style` whose
 * children are the listed expression containers.
 *
 * @param {number} [containers]
 * @returns {ElementShape}
 */
const style_host = (containers = 1) =>
	element(
		'style',
		Array.from({ length: containers }, () => ({ type: 'JSXExpressionContainer' })),
	);

/**
 * @param {Shape[]} body
 * @param {Shape | null} render
 * @returns {CodeBlockShape}
 */
const code_block = (body, render) => ({ type: 'JSXCodeBlock', body, render });

// ---------------------------------------------------------------------------
// Locators: walk from the parsed `Program` to the node under test.
// ---------------------------------------------------------------------------

/**
 * The `JSXCodeBlock` body of `function App() @{ … }` (the first statement).
 * @type {(ast: any) => any}
 */
const component_block = (ast) => ast.body[0].body;

/**
 * The argument of `return` in `function App() { return …; }`.
 * @type {(ast: any) => any}
 */
const returned = (ast) => ast.body[0].body.body[0].argument;

/**
 * The initializer of `export const x = …;` (the first statement).
 * @type {Locate}
 */
const exported_init = (ast) => ast.body[0].declaration.declarations[0].init;

/**
 * The program's first statement.
 * @type {Locate}
 */
const first_statement = (ast) => ast.body[0];

const CSS = '.a { color: red; }';

/** @type {StyleSyntaxCase[]} */
export const STYLE_SYNTAX_CASES = [
	// -- self-closing forms ---------------------------------------------------
	{
		name: 'self-closing <style /> without apply',
		source: `function App() @{ <><style /><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_self(),
	},
	{
		name: 'self-closing <style apply={theme} />',
		source: `function App() @{ <><style apply={theme} /><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_self(['apply'], 'Identifier'),
	},
	{
		name: 'self-closing <style apply={[a, b]} />',
		source: `function App() @{ <><style apply={[a, b]} /><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_self(['apply'], 'ArrayExpression'),
	},
	{
		name: 'self-closing <style apply={ns.dark} />',
		source: `function App() @{ <><style apply={ns.dark} /><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_self(['apply'], 'MemberExpression'),
	},
	{
		name: 'self-closing <style ref={r} apply={theme} /> keeps every attribute in order',
		source: `function App() @{ <><style ref={r} apply={theme} /><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_self(['ref', 'apply'], 'Identifier'),
	},

	// -- bodied forms -----------------------------------------------------------
	{
		name: 'bodied <style apply={t}>…</style> keeps its sheet, css, scope hash and apply',
		source: `function App() @{ <><style apply={t}>${CSS}</style><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_body(CSS, ['apply'], 'Identifier'),
	},
	{
		name: 'bodied <style>…</style> without attributes',
		source: `function App() { return <style>${CSS}</style>; }`,
		locate: returned,
		expected: style_body(CSS),
	},

	// -- `@{ … }` code-block bodies ---------------------------------------------
	// A `@{ … }` body holds setup statements and exactly ONE output node, and a
	// `<style>` block is an output node like any other: beside another output
	// it is the ordinary multiple-outputs error (reported on the later node),
	// and as the lone output it parses but the analyzer reports
	// `tsrx-style-standalone-needs-fragment`. The valid placement is inside a
	// fragment or element (see the fragment forms below).
	{
		name: 'style before the output node in a @{} body is the multiple-outputs error',
		//        0         1         2         3         4         5
		//        0123456789012345678901234567890123456789012345678901234567
		source: `function App() @{ const x = 1; <style apply={a} /> <div /> }`,
		locate: component_block,
		error: {
			message:
				"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
			start: 51,
			end: 58,
		},
		// Recovery: the last output node becomes `render`; the block stays in
		// `body` in source order.
		expected: code_block(
			[{ type: 'VariableDeclaration' }, style_self(['apply'], 'Identifier')],
			element('div'),
		),
	},
	{
		name: 'style after the output node in a @{} body is the multiple-outputs error',
		//        0         1         2         3         4         5
		//        0123456789012345678901234567890123456789012345678901234567890
		source: `function App() @{ <div /> <style>${CSS}</style> }`,
		locate: component_block,
		error: {
			message:
				"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
			start: 26,
			end: 59,
		},
		expected: code_block([element('div')], style_body(CSS)),
	},
	{
		name: 'only a style and no output node in a @{} body parses (the analyzer rejects it)',
		source: `function App() @{ <style>${CSS}</style> }`,
		locate: component_block,
		expected: code_block([], style_body(CSS)),
	},
	{
		name: 'a fragment holding the style and the output node is the valid @{} form',
		source: `function App() @{ const x = 1; <><style apply={a} /><div /></> }`,
		locate: component_block,
		expected: code_block([{ type: 'VariableDeclaration' }], {
			type: 'JSXFragment',
			children: [style_self(['apply'], 'Identifier'), element('div')],
		}),
	},
	{
		name: 'nested @{} with its own style inside a fragment',
		source: `function App() @{ <><style apply={a} /><div>@{ <><style apply={b} /><span /></> }</div></> }`,
		locate: (ast) => component_block(ast).render.children[1].children[0],
		expected: code_block([], {
			type: 'JSXFragment',
			children: [style_self(['apply'], 'Identifier'), element('span')],
		}),
	},

	{
		name: 'assigned @{} block: a theme in its setup and an applying fragment output',
		source: `const something = @{
	const theme = <style>${CSS}</style>;
	<>
		<style apply={theme}>${CSS}</style>
		<div />
	</>
};`,
		locate: (ast) => ast.body[0].declarations[0].init,
		expected: code_block([{ type: 'VariableDeclaration' }], {
			type: 'JSXFragment',
			children: [style_body(CSS, ['apply'], 'Identifier'), element('div')],
		}),
	},

	// -- directive bodies -------------------------------------------------------
	// Every control-flow body renders one output node too: a block beside it
	// is the multiple-outputs error, and the valid form wraps both in a
	// fragment. (`@switch` case bodies do not report multiple outputs today,
	// so only their fragment form is listed.)
	{
		name: 'style beside the output node in an @if consequent is the multiple-outputs error',
		//        0         1         2         3         4         5
		//        012345678901234567890123456789012345678901234567890123456
		source: `function App() @{ @if (ok) { <style apply={a} /> <b /> } }`,
		locate: (ast) => component_block(ast).render,
		error: {
			message:
				"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
			start: 49,
			end: 54,
		},
		expected: {
			type: 'JSXIfExpression',
			consequent: [style_self(['apply'], 'Identifier'), element('b')],
			alternate: null,
		},
	},
	{
		name: 'only a style inside an @if consequent parses (the analyzer rejects it)',
		source: `function App() @{ @if (ok) { <style apply={a} /> } }`,
		locate: (ast) => component_block(ast).render,
		expected: {
			type: 'JSXIfExpression',
			consequent: [style_self(['apply'], 'Identifier')],
			alternate: null,
		},
	},
	{
		name: 'fragments holding style and output inside @if consequent and @else',
		source: `function App() @{ @if (ok) { <><style apply={a} /><b /></> } @else { <><i /><style apply={c} /></> } }`,
		locate: (ast) => component_block(ast).render,
		expected: {
			type: 'JSXIfExpression',
			consequent: [
				{ type: 'JSXFragment', children: [style_self(['apply'], 'Identifier'), element('b')] },
			],
			alternate: [
				{ type: 'JSXFragment', children: [element('i'), style_self(['apply'], 'Identifier')] },
			],
		},
	},
	{
		name: 'style beside the output node in a @for body is the multiple-outputs error',
		//        0         1         2         3         4         5         6         7
		//        012345678901234567890123456789012345678901234567890123456789012345678901
		source: `function App() @{ @for (const x of xs) { <style apply={a} /> <b>{x}</b> } }`,
		locate: (ast) => component_block(ast).render,
		error: {
			message:
				"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
			start: 61,
			end: 71,
		},
		expected: {
			type: 'JSXForExpression',
			body: [style_self(['apply'], 'Identifier'), element('b')],
			empty: null,
		},
	},
	{
		name: 'fragments holding style and output inside @for body and @empty',
		source: `function App() @{ @for (const x of xs) { <><style apply={a} /><b>{x}</b></> } @empty { <><i /><style apply={c} /></> } }`,
		locate: (ast) => component_block(ast).render,
		expected: {
			type: 'JSXForExpression',
			body: [
				{ type: 'JSXFragment', children: [style_self(['apply'], 'Identifier'), element('b')] },
			],
			empty: [
				{ type: 'JSXFragment', children: [element('i'), style_self(['apply'], 'Identifier')] },
			],
		},
	},
	{
		name: 'fragments holding style and output inside @switch case and default',
		source: `function App() @{ @switch (k) { @case 1: { <><style apply={a} /><b /></> } @default: { <><i /><style apply={c} /></> } } }`,
		locate: (ast) => component_block(ast).render,
		expected: {
			type: 'JSXSwitchExpression',
			cases: [
				{
					test: 'Literal',
					consequent: [
						{
							type: 'JSXFragment',
							children: [style_self(['apply'], 'Identifier'), element('b')],
						},
					],
				},
				{
					test: null,
					consequent: [
						{
							type: 'JSXFragment',
							children: [element('i'), style_self(['apply'], 'Identifier')],
						},
					],
				},
			],
		},
	},
	{
		name: 'style beside the output node in a @try block is the multiple-outputs error',
		//        0         1         2         3         4         5
		//        0123456789012345678901234567890123456789012345678901
		source: `function App() @{ @try { <style apply={a} /> <b /> } @catch (e) { <i /> } }`,
		locate: (ast) => component_block(ast).render,
		error: {
			message:
				"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
			start: 45,
			end: 50,
		},
		expected: {
			type: 'JSXTryExpression',
			block: [style_self(['apply'], 'Identifier'), element('b')],
			pending: null,
			handler: [element('i')],
		},
	},
	{
		name: 'fragments holding style and output inside @try, @pending and @catch',
		source: `function App() @{ @try { <><style apply={a} /><b /></> } @pending { <><style apply={p} /><u /></> } @catch (e) { <><i /><style apply={c} /></> } }`,
		locate: (ast) => component_block(ast).render,
		expected: {
			type: 'JSXTryExpression',
			block: [
				{ type: 'JSXFragment', children: [style_self(['apply'], 'Identifier'), element('b')] },
			],
			pending: [
				{ type: 'JSXFragment', children: [style_self(['apply'], 'Identifier'), element('u')] },
			],
			handler: [
				{ type: 'JSXFragment', children: [element('i'), style_self(['apply'], 'Identifier')] },
			],
		},
	},
	{
		name: 'fragments holding style and output inside @try, @catch and @finally',
		source: `function App() @{ @try { <><style apply={a} /><b /></> } @catch (e) { <><i /><style apply={c} /></> } @finally { <><style apply={f} /><em /></> } }`,
		locate: (ast) => component_block(ast).render,
		expected: {
			type: 'JSXTryExpression',
			block: [
				{ type: 'JSXFragment', children: [style_self(['apply'], 'Identifier'), element('b')] },
			],
			pending: null,
			handler: [
				{ type: 'JSXFragment', children: [element('i'), style_self(['apply'], 'Identifier')] },
			],
			finalizer: [
				{ type: 'JSXFragment', children: [style_self(['apply'], 'Identifier'), element('em')] },
			],
		},
	},

	// -- fragments --------------------------------------------------------------
	{
		name: 'multiple sibling style blocks inside one fragment',
		source: `function App() { return <><style apply={a} /><style>${CSS}</style><div /></>; }`,
		locate: returned,
		expected: {
			type: 'JSXFragment',
			children: [style_self(['apply'], 'Identifier'), style_body(CSS), element('div')],
		},
	},

	// -- expression-child <style> (plain TSX) -----------------------------------
	{
		name: '<style>{css}</style> is an ordinary JSXElement in a plain-TSX return',
		source: `function App() { return <style>{css}</style>; }`,
		locate: returned,
		expected: style_host(),
	},
	{
		name: '<style>{css}</style> stays an ordinary JSXElement inside a @{} body',
		source: `function App() @{ <section><style>{css}</style><div /></section> }`,
		locate: (ast) => component_block(ast).render,
		expected: element('section', [style_host(), element('div')]),
	},
	{
		name: '<style> with whitespace before its first { child is an ordinary JSXElement',
		source: `function App() { return <section><style>\n\t{css}\n</style></section>; }`,
		locate: (ast) => returned(ast).children[0],
		expected: style_host(),
	},
	{
		name: '<style> with two expression children is an ordinary JSXElement',
		source: `function App() { return <style>{reset}{theme}</style>; }`,
		locate: returned,
		expected: style_host(2),
	},
	{
		name: 'a { inside CSS text after other text still parses as a bodied block',
		source: `function App() @{ <><style>.a{color:red}</style><div /></> }`,
		locate: (ast) => component_block(ast).render.children[0],
		expected: style_body('.a{color:red}'),
	},

	// -- module scope -----------------------------------------------------------
	{
		name: 'module-scope assigned self-closed block',
		source: `export const theme = <style apply={[a, b]} />;`,
		locate: exported_init,
		expected: style_self(['apply'], 'ArrayExpression'),
	},
	{
		name: 'module-scope bare <style> still parses without a parser error',
		source: `<style>${CSS}</style>;\nexport function App() { return <div />; }`,
		locate: first_statement,
		expected: style_body(CSS),
	},

	// -- <head> -----------------------------------------------------------------
	{
		name: 'head <style> has no scope hash',
		source: `function App() { return <head><style>body { margin: 0; }</style></head>; }`,
		locate: (ast) => returned(ast).children[0],
		expected: { ...style_body('body { margin: 0; }'), hasScopeHash: false },
	},
];
