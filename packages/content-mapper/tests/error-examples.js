/** @import { Diagnostic, DiagnosticWithValues, UpstreamError } from '@tsrx/core/diagnostics' */

import { TS_ERRORS, TSRX_ERRORS, UPSTREAM_ERRORS } from '@tsrx/core/diagnostics';

/**
 * An entry of `@tsrx/core/diagnostics`: one of `TSRX_ERRORS`, `TS_ERRORS` or
 * `UPSTREAM_ERRORS`.
 * @typedef {Diagnostic | DiagnosticWithValues | UpstreamError} ErrorEntry
 */

/**
 * A source that makes a TSRX compiler report one entry's error, in the
 * collecting (`loose`) compile that `@tsrx/content-mapper` runs.
 * @typedef {object} ErrorExample
 * @property {ErrorEntry} error
 * @property {string} source
 * @property {string} [compiler] The compiler package, for an error only some targets report (default `@tsrx/react`).
 * @property {ErrorEntry[]} [also] Other entries the source reports too, for the reason its record in {@link KNOWN_PROBLEMS} gives.
 */

/**
 * An example of each error TSRX's compilers can report, so that every error is
 * checked to reach the user through TypeScript 7: `error-examples.test.js`
 * compiles each, and runs each through the content mapper on the native
 * TypeScript language server, where it has to show once, with no TypeScript
 * error on top of it. Every entry of `@tsrx/core/diagnostics` needs an example
 * here or a reason in {@link WITHOUT_EXAMPLE}, so a new error can't be added
 * without one.
 * @type {ErrorExample[]}
 */
export const ERROR_EXAMPLES = [
	{
		error: TSRX_ERRORS.UNCLOSED_TAG,
		source: `export function C() @{
	<div>
}
`,
	},
	{
		error: TSRX_ERRORS.MISMATCHED_CLOSING_TAG,
		source: `export function C() @{
	<div><span></div>
}
`,
	},
	{
		error: TSRX_ERRORS.UNEXPECTED_CLOSING_TAG,
		source: `export function C() @{
	<>
		<div></div></span>
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.SCRIPT_END_TAG_IN_BODY,
		source: `export function C() @{
	<script>const a = '</script x';</script>
}
`,
	},
	{
		error: TSRX_ERRORS.NAMESPACED_ELEMENT,
		source: `export function C() @{
	<svg:rect />
}
`,
	},
	{
		error: TSRX_ERRORS.ATTRIBUTE_VALUE_SPREAD,
		source: `export function C(props: any) @{
	<div a={...props} />
}
`,
	},
	{
		error: TSRX_ERRORS.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
		source: `export function C() @{
	<div>{1;}</div>
}
`,
	},
	{
		error: TSRX_ERRORS.DIRECTIVE_BODY_EXPECTED,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	@if (props.a) <div />
}
`,
	},
	{
		error: TSRX_ERRORS.DIRECTIVE_BRANCH_EXPECTED,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	@if (props.a) {
		<div />
	} else {
		<span />
	}
}
`,
	},
	{
		error: TSRX_ERRORS.TRY_HANDLER_MISSING,
		source: `export function C() @{
	@try {
		<div />
	}
}
`,
	},
	{
		error: TSRX_ERRORS.FOR_INDEX_NAME_EXPECTED,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<ul>
		@for (const item of props.items; index i + 1) {
			<li>{item}</li>
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.FOR_INDEX_AFTER_KEY,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<ul>
		@for (const item of props.items; key item index i) {
			<li>{item}</li>
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.TEMPLATE_RETURN_STATEMENT,
		source: `export function C() @{
	<div>
		@{
			return;
		}
	</div>
}
`,
	},
	{
		error: TSRX_ERRORS.IF_RETURN_STATEMENT,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<div>
		@if (props.a) {
			return;
		}
	</div>
}
`,
	},
	{
		error: TSRX_ERRORS.IF_BREAK_STATEMENT,
		source: `export function f(items: string[], a: boolean) {
	for (const item of items) {
		const element = <div>
			@if (a) {
				break;
			}
		</div>;
	}
}
`,
	},
	{
		error: TSRX_ERRORS.IF_CONTINUE_STATEMENT,
		source: `export function f(items: string[], a: boolean) {
	for (const item of items) {
		const element = <div>
			@if (a) {
				continue;
			}
		</div>;
	}
}
`,
	},
	{
		error: TSRX_ERRORS.FOR_RETURN_STATEMENT,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<ul>
		@for (const item of props.items) {
			return;
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.FOR_BREAK_STATEMENT,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<ul>
		@for (const item of props.items) {
			break;
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.FOR_CONTINUE_STATEMENT,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<ul>
		@for (const item of props.items) {
			continue;
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.SWITCH_CASE_BREAK_STATEMENT,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	@switch (props.n) {
		@case 1: {
			break;
		}
	}
}
`,
	},
	{
		error: TSRX_ERRORS.SWITCH_CASE_RETURN_STATEMENT,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	@switch (props.n) {
		@case 1: {
			return;
		}
	}
}
`,
	},
	{
		error: TSRX_ERRORS.FORGOTTEN_STATEMENT_CONTAINER,
		source: `export function f() {
	<div />;
	return 1;
}
`,
	},
	{
		error: TSRX_ERRORS.CODE_BLOCK_SINGLE_OUTPUT,
		source: `export function C() @{
	<div />
	<span />
}
`,
		also: [TSRX_ERRORS.FORGOTTEN_STATEMENT_CONTAINER],
	},
	{
		error: TSRX_ERRORS.CODE_BLOCK_STATEMENT_AFTER_OUTPUT,
		source: `export function C() @{
	<div />
	console.log(1);
}
`,
		also: [TSRX_ERRORS.FORGOTTEN_STATEMENT_CONTAINER],
	},
	{
		error: TSRX_ERRORS.JSX_SPREAD_CHILD,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<div>{...props.items}</div>
}
`,
	},
	{
		error: TSRX_ERRORS.DYNAMIC_TAG_EXPRESSION,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<{props.a ? 'div' : 'span'} />
}
`,
	},
	{
		error: TSRX_ERRORS.FOR_OF_ONLY,
		source: `export function C(props: { a: boolean; items: string[]; n: number }) @{
	<ul>
		@for (const k in props) {
			<li>{k}</li>
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.MULTIPLE_REFS,
		source: `export function C(props: any) @{
	<div ref={props.a} ref={props.b} />
}
`,
	},
	{
		error: TSRX_ERRORS.TARGET_AWAIT_UNSUPPORTED,
		source: `export async function C(props: { items: Promise<string>[] }) @{
	<ul>
		@for (const item of props.items) {
			<li>{await item}</li>
		}
	</ul>
}
`,
		compiler: '@tsrx/solid',
	},
	{
		error: TSRX_ERRORS.TARGET_YIELD_UNSUPPORTED,
		source: `export function* C(props: { items: string[] }) @{
	<ul>
		@for (const item of props.items) {
			<li>{yield item}</li>
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.TARGET_SUPER_UNSUPPORTED,
		source: `class B {
	m() {
		return 1;
	}
}
export class A extends B {
	*render(props: { n: number }) @{
		<div>
			@switch (props.n) {
				@case 1: {
					<span>{super.m()}{yield 1}</span>
				}
			}
		</div>
	}
}
`,
	},
	{
		error: TSRX_ERRORS.TARGET_FOR_AWAIT_UNSUPPORTED,
		source: `export async function C(props: { items: AsyncIterable<string> }) @{
	<ul>
		@for await (const item of props.items) {
			<li>{item}</li>
		}
	</ul>
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_APPLY_VALUE,
		source: `export function C() @{
	<>
		<style apply />
		<div />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_APPLY_TARGET,
		source: `const x = 1;
export function C() @{
	<>
		<style apply={x} />
		<div />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_APPLY_BEFORE_DECLARATION,
		source: `export function C() @{
	<>
		<style apply={theme} />
		<div />
	</>
}
const theme = <style>
	.a {
		color: red;
	}
</style>;
`,
	},
	{
		error: TSRX_ERRORS.STYLE_APPLY_DUPLICATE,
		source: `const a = <style>
	.a {
		color: red;
	}
</style>;
export function C() @{
	<>
		<style apply={a} apply={a} />
		<div />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_APPLY_UNSUPPORTED_HOST,
		source: `const a = <style>
	.a {
		color: red;
	}
</style>;
export function C() @{
	<html>
		<head>
			<style apply={a} />
		</head>
	</html>
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_RESERVED_CLASS_KEY,
		source: `export const theme = <style>
	.\\$class {
		color: red;
	}
</style>;
`,
	},
	{
		error: TSRX_ERRORS.STYLE_STANDALONE_AT_MODULE_SCOPE,
		source: `<style>
	.a {
		color: red;
	}
</style>;
export {};
`,
	},
	{
		error: TSRX_ERRORS.STYLE_STANDALONE_OUTSIDE_TEMPLATE,
		source: `export function C() {
	return (
		<div>
			<style>
				.a {
					color: red;
				}
			</style>
		</div>
	);
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_STANDALONE_NEEDS_FRAGMENT,
		source: `export function C() @{
	<style>
		.a {
			color: red;
		}
	</style>
}
`,
	},
	{
		error: TSRX_ERRORS.STYLE_UNKNOWN_ATTRIBUTE,
		source: `export function C() @{
	<>
		<style foo="x">
			.a {
				color: red;
			}
		</style>
		<div class="a" />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.CSS_GLOBAL_IN_PSEUDOCLASS,
		source: `export function C() @{
	<>
		<style>
			.a:is(:global .b) {
				color: red;
			}
		</style>
		<div class="a" />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.CSS_GLOBAL_IN_MIDDLE,
		source: `export function C() @{
	<>
		<style>
			.a :global(.b) .c {
				color: red;
			}
		</style>
		<div class="a" />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.CSS_IMPORT,
		source: `export function C() @{
	<>
		<style>
			@import 'x.css';
		</style>
		<div />
	</>
}
`,
	},
	{
		error: TSRX_ERRORS.PLATFORM_REQUIRED,
		source: `if (import.meta.env.platform.web) {
	console.log(1);
}
export {};
`,
	},
	{
		error: TSRX_ERRORS.DUPLICATED_ATTRIBUTE_KEY,
		source: `import data from './data.json' with { type: 'json', type: 'json' };
export { data };
`,
	},
	{ error: TS_ERRORS.TOKEN_EXPECTED, source: `if (a) {` },
	{ error: TS_ERRORS.IDENTIFIER_EXPECTED, source: `export declare type = 1;` },
	{ error: TS_ERRORS.RESERVED_WORD_AS_IDENTIFIER, source: `export type default class {}` },
	{
		error: TS_ERRORS.IDENTIFIER_OR_STRING_EXPECTED,
		source: `let x: import("m", { with: { [a]: 1 } });`,
	},
	{ error: TS_ERRORS.DECLARATION_EXPECTED, source: `static static class A {}` },
	{ error: TS_ERRORS.DECLARATION_OR_STATEMENT_EXPECTED, source: `export type const x = 1;` },
	{
		error: TS_ERRORS.LINE_BREAK_NOT_PERMITTED,
		source: `export declare type
Foo = 1;`,
	},
	{ error: TS_ERRORS.KEYWORD_ESCAPE, source: `export \\u0061bstract function f() {}` },
	{ error: TS_ERRORS.PRIVATE_IDENTIFIER_OUTSIDE_CLASS, source: `const x = this.#y;` },
	{ error: TS_ERRORS.MODIFIER_ALREADY_SEEN, source: `declare declare class A {}` },
	{
		error: TS_ERRORS.MODIFIER_MUST_PRECEDE,
		source: `class A {
	static public a = 1;
}`,
	},
	{
		error: TS_ERRORS.MODIFIER_CANNOT_BE_USED_WITH,
		source: `abstract class A {
	static abstract x: number;
}`,
	},
	{ error: TS_ERRORS.MODIFIER_IN_AMBIENT_CONTEXT, source: `declare async function f(): void;` },
	{ error: TS_ERRORS.MODIFIER_CANNOT_BE_USED_HERE, source: `async class A {}` },
	{ error: TS_ERRORS.MODIFIER_ON_MODULE_ELEMENT, source: `public const a = 1;` },
	{ error: TS_ERRORS.MODIFIER_ON_USING, source: `declare using x = y;` },
	{ error: TS_ERRORS.MODIFIER_ON_AWAIT_USING, source: `declare await using x = y;` },
	{
		error: TS_ERRORS.MODIFIERS_CANNOT_APPEAR_HERE,
		source: `function f() {
	export const a = 1;
}`,
	},
	{
		error: TS_ERRORS.ACCESSIBILITY_MODIFIER_ALREADY_SEEN,
		source: `class A {
	public private a = 1;
}`,
	},
	{ error: TS_ERRORS.READONLY_MODIFIER_NOT_ALLOWED, source: `readonly function f() {}` },
	{ error: TS_ERRORS.ACCESSOR_MODIFIER_NOT_ALLOWED, source: `accessor class A {}` },
	{ error: TS_ERRORS.ABSTRACT_MODIFIER_NOT_ALLOWED, source: `abstract function f() {}` },
	{ error: TS_ERRORS.MODIFIER_ON_IMPORT, source: `declare import a from "a";` },
	{ error: TS_ERRORS.EXPORT_MODIFIER_ON_AUGMENTATION, source: `export declare global {}` },
	{ error: TS_ERRORS.READONLY_TYPE_MODIFIER, source: `type A = readonly string;` },
	{
		error: TS_ERRORS.NESTED_IMPORT,
		source: `function f() {
	import a from "a";
}`,
	},
	{
		error: TS_ERRORS.NESTED_EXPORT,
		source: `function f() {
	export { f };
}`,
	},
	{
		error: TS_ERRORS.NESTED_EXPORT_ASSIGNMENT,
		source: `function f() {
	export = f;
}`,
	},
	{
		error: TS_ERRORS.NESTED_DEFAULT_EXPORT,
		source: `function f() {
	export default 1;
}`,
	},
	{
		error: TS_ERRORS.NESTED_NAMESPACE,
		source: `function f() {
	export declare namespace N {}
}`,
	},
	{
		error: TS_ERRORS.NESTED_GLOBAL_EXPORT,
		source: `function f() {
	export as namespace A;
}`,
	},
	{
		error: TS_ERRORS.AWAIT_EXPRESSION_NOT_ALLOWED,
		source: `namespace N {
	await 1;
}`,
	},
	{
		error: TS_ERRORS.FOR_AWAIT_NOT_ALLOWED,
		source: `namespace N {
	for await (const a of []) {}
}`,
	},
	{
		error: TS_ERRORS.AWAIT_USING_NOT_ALLOWED,
		source: `namespace N {
	await using a = b;
}`,
	},
	{ error: TS_ERRORS.IMPORT_DEFER_NAMESPACE, source: `import defer "a";` },
	{ error: TS_ERRORS.IMPORT_DEFER_DEFAULT, source: `import defer a from "a";` },
	{ error: TS_ERRORS.IMPORT_DEFER_NAMED, source: `import defer { a } from "a";` },
	{ error: TS_ERRORS.EXPRESSION_EXPECTED, source: `import { a } from;` },
	{ error: TS_ERRORS.IMPORT_SOURCE_BINDING, source: `import source "./a.wasm";` },
	{ error: TS_ERRORS.IMPORT_SOURCE_NAMED, source: `import source { a } from "./a.wasm";` },
	{ error: TS_ERRORS.STRING_LITERAL_EXPECTED, source: `import source a from server;` },
	{ error: TS_ERRORS.VARIABLE_DECLARATION_LIST_EMPTY, source: `const;` },
	{ error: TS_ERRORS.DECLARATION_NOT_INITIALIZED, source: `const x: number;` },
	{ error: TS_ERRORS.FOR_IN_USING, source: `for (using a in b) {}` },
	{ error: TS_ERRORS.FOR_IN_AWAIT_USING, source: `for (await using a in b) {}` },
	{
		error: TS_ERRORS.BLOCK_SCOPED_VARIABLE_REDECLARED,
		source: `let a = 1;
let a = 2;`,
	},
	{
		error: TS_ERRORS.OUTER_SCOPED_VARIABLE_INITIALIZED,
		source: `{
	let a;
	var a;
}`,
	},
	{
		error: TS_ERRORS.CATCH_PARAMETER_REDECLARED,
		source: `try {
} catch (e) {
	let e;
}`,
	},
	{
		error: TS_ERRORS.ENUM_REDECLARED,
		source: `enum E {}
let E;`,
	},
	{ error: TS_ERRORS.SIGNATURE_PARAMETER_INITIALIZER, source: `type F = (a = 1) => void;` },
	{
		error: TS_ERRORS.PATTERN_PARAMETER_PROPERTY,
		source: `class A {
	constructor(private { a }) {}
}`,
	},
	{
		error: TS_ERRORS.REST_PARAMETER_PROPERTY,
		source: `class A {
	constructor(private ...a) {}
}`,
	},
	{ error: TS_ERRORS.PARAMETER_PROPERTY_OUTSIDE_CONSTRUCTOR, source: `function f(private a) {}` },
	{ error: TS_ERRORS.REST_PARAMETER_INITIALIZER, source: `function f(...a = []) {}` },
	{ error: TS_ERRORS.REST_ELEMENT_INITIALIZER, source: `const [...a = [1]] = [1];` },
	{ error: TS_ERRORS.OPTIONAL_REST_PARAMETER, source: `function f(...a?) {}` },
	{ error: TS_ERRORS.OPTIONAL_BINDING_PATTERN_PARAMETER, source: `function f({ a }?) {}` },
	{ error: TS_ERRORS.UNEXPECTED_TOKEN, source: `let x = );` },
	{ error: TS_ERRORS.REST_ELEMENT_TRAILING_COMMA, source: `const [...a,] = [1];` },
	{ error: TS_ERRORS.ARGUMENT_NAME_CLASH, source: `function f(a, a) {}` },
	{ error: TS_ERRORS.KEYWORD_ESCAPE_SEQUENCE, source: `const m = \\u0069mport.defer("a");` },
	{
		error: TS_ERRORS.AWAIT_USING_OUTSIDE_ASYNC,
		source: `function f() {
	await using a = b;
}`,
	},
	{ error: TS_ERRORS.FOR_OF_LET, source: `for (let.a of b) {}` },
	{ error: TS_ERRORS.FOR_IN_INITIALIZER, source: `for (var a = 1 in b) {}` },
	{ error: TS_ERRORS.FOR_OF_INITIALIZER, source: `for (let a = 1 of b) {}` },
	{ error: TS_ERRORS.MISSING_CATCH_OR_FINALLY, source: `try {}` },
	{
		error: TS_ERRORS.MULTIPLE_DEFAULT_CLAUSES,
		source: `switch (a) {
	default:
	default:
}`,
	},
	{
		error: TS_ERRORS.USE_STRICT_NON_SIMPLE_PARAMETERS,
		source: `export function C(a = 1) @{
	'use strict';
	<div>{a}</div>
}
`,
	},
	{ error: TS_ERRORS.JSX_ATTRIBUTE_VALUE, source: `const a = <div a=1 />;` },
	{ error: TS_ERRORS.ONLY_STRING_ATTRIBUTE_VALUE, source: `import a from "a" with { type: 1 };` },
	{ error: TS_ERRORS.TYPE_IMPORT_ARGUMENT, source: `type A = import(a);` },
	{ error: TS_ERRORS.UNEXPECTED_LEADING_DECORATOR, source: `@dec function f() {}` },
	{ error: TS_ERRORS.TYPE_CAST_IN_PARAMETER, source: `const f = (x as number) => x;` },
	{ error: TS_ERRORS.UNEXPECTED_TYPE_ANNOTATION, source: `f(a: number);` },
	{ error: TS_ERRORS.RESERVED_ARROW_TYPE_PARAMETER, source: `const f = <T>() => 1;` },
	{
		error: UPSTREAM_ERRORS.REDECLARED,
		source: `var a = 1;
let a = 2;`,
	},
	{ error: UPSTREAM_ERRORS.EXPORT_NOT_DEFINED, source: `export { missing };` },
	{ error: UPSTREAM_ERRORS.OPTIONAL_CHAIN_ASSIGNMENT, source: `a?.b = 1;` },
	{ error: UPSTREAM_ERRORS.IMPORT_META_PROPERTY, source: `import.foo;` },
	{ error: UPSTREAM_ERRORS.NEW_TARGET_OUTSIDE_FUNCTION, source: `new.target;` },
	{
		error: UPSTREAM_ERRORS.SUPER_OUTSIDE_METHOD,
		source: `function f() {
	super.x;
}`,
	},
	{
		error: UPSTREAM_ERRORS.SUPER_CALL_OUTSIDE_CONSTRUCTOR,
		source: `class A {
	m() {
		super();
	}
}`,
	},
	{ error: UPSTREAM_ERRORS.LET_RESERVED, source: `const let = 1;` },
	{
		error: UPSTREAM_ERRORS.ABSTRACT_METHOD_IN_CLASS,
		source: `class A {
	abstract m(): void;
}`,
	},
	{ error: UPSTREAM_ERRORS.AMBIENT_INITIALIZER, source: `declare let a: number = 1;` },
	{
		error: UPSTREAM_ERRORS.DUPLICATE_MODIFIER,
		source: `class A {
	readonly readonly a = 1;
}`,
	},
	{
		error: UPSTREAM_ERRORS.TYPE_MEMBER_MODIFIER,
		source: `interface A {
	public a: number;
}`,
	},
	{ error: UPSTREAM_ERRORS.TYPE_PARAMETER_MODIFIER, source: `interface I<public T> {}` },
	{ error: UPSTREAM_ERRORS.VARIANCE_MODIFIER, source: `function f<in T>() {}` },
	{
		error: UPSTREAM_ERRORS.PRIVATE_ELEMENT_ACCESSIBILITY,
		source: `class A {
	public #a = 1;
}`,
	},
	{
		error: UPSTREAM_ERRORS.PRIVATE_ELEMENT_ABSTRACT,
		source: `abstract class A {
	abstract #a: number;
}`,
	},
	{
		error: UPSTREAM_ERRORS.DECORATED_CONSTRUCTOR,
		source: `class A {
	@dec constructor() {}
}`,
	},
];

/**
 * The entries no source can make this repository's compilers report, each with
 * the reason. The content mapper sends such an error like any other when a
 * compiler reports it, as `third-party-compiler.test.js` checks for a compiler
 * it doesn't know.
 * @type {Map<ErrorEntry, string>}
 */
export const WITHOUT_EXAMPLE = new Map(
	/** @type {Array<[ErrorEntry, string]>} */ ([
		[
			TSRX_ERRORS.FOR_STATEMENT,
			"Raised only through core helpers that targets outside this repository call (Ripple, Octane); none of this repository's targets reaches it.",
		],
		[
			TSRX_ERRORS.FOR_IN_STATEMENT,
			"Raised only through core helpers that targets outside this repository call (Ripple, Octane); none of this repository's targets reaches it.",
		],
		[
			TSRX_ERRORS.WHILE_STATEMENT,
			"Raised only through core helpers that targets outside this repository call (Ripple, Octane); none of this repository's targets reaches it.",
		],
		[
			TSRX_ERRORS.DO_WHILE_STATEMENT,
			"Raised only through core helpers that targets outside this repository call (Ripple, Octane); none of this repository's targets reaches it.",
		],
		[
			TSRX_ERRORS.INVALID_HTML_NESTING,
			"Raised only through core helpers that targets outside this repository call (Ripple, Octane); none of this repository's targets reaches it.",
		],
		[
			TSRX_ERRORS.TEMPLATE_TRY_FINALLY,
			'The parser rejects `finally` after an `@try` block (TS1012) first.',
		],
		[
			TSRX_ERRORS.TEMPLATE_TRY_HANDLER,
			'The parser reports an `@try` without `@catch` or `@pending` (TSRX1010) first.',
		],
		[
			TSRX_ERRORS.TOP_LEVEL_AWAIT_USE_SERVER,
			'Only for a target that sets `requireUseServerForAwait` without an `await` validator of its own; Solid, Vue and Hono DOM report their own error first (#887).',
		],
		[
			TSRX_ERRORS.RESERVED_IDENTIFIER_PREFIX,
			"Raised only through core helpers that targets outside this repository call (Ripple, Octane); none of this repository's targets reaches it.",
		],
		[TS_ERRORS.DECLARE_MODIFIER_IN_AMBIENT_CONTEXT, 'No source found (#961).'],
		[
			TS_ERRORS.DECLARED_IN_SCOPE,
			'No source found: the parser rejects a name declared twice in one scope first (#964).',
		],
		[TS_ERRORS.UNTERMINATED_JSX_CONTENTS, 'No source found (#964).'],
		[TS_ERRORS.JSX_UNESCAPED_GREATER_THAN, 'No source found: a `>` in JSX text is text (#964).'],
		[TS_ERRORS.JSX_UNESCAPED_CLOSING_BRACE, 'No source found (#964).'],
		[TS_ERRORS.SIGNATURE_PARAMETER_NAME, 'No source found (#964).'],
		[
			UPSTREAM_ERRORS.LET_BINDING,
			"`let` as a name gives `The keyword 'let' is reserved` (TS1212) at the same place first (#962).",
		],
	]),
);

/**
 * An example that doesn't show its error exactly once yet:
 *
 * - `lost`: the loose compile the mapper runs reports nothing.
 * - `typescript`: TypeScript reports the mistake too, where the mapper's
 *   directive can't hide it.
 * - `twice`: the compiler reports the mistake twice itself, or reports
 *   another error with it (the example's `also`).
 * @typedef {object} KnownProblem
 * @property {'lost' | 'typescript' | 'twice'} problem
 * @property {number} issue The issue that tracks it.
 */

/**
 * The examples that don't show their error exactly once, until their issue is
 * fixed. `error-examples.test.js` checks that each still has its problem, so a
 * fix fails the test until the record here is removed.
 * @type {Map<ErrorEntry, KnownProblem>}
 */
export const KNOWN_PROBLEMS = new Map(
	/** @type {Array<[ErrorEntry, KnownProblem]>} */ ([
		[TSRX_ERRORS.UNCLOSED_TAG, { problem: 'lost', issue: 978 }],
		[TSRX_ERRORS.MISMATCHED_CLOSING_TAG, { problem: 'lost', issue: 978 }],
		[TSRX_ERRORS.CODE_BLOCK_SINGLE_OUTPUT, { problem: 'twice', issue: 981 }],
		[TSRX_ERRORS.CODE_BLOCK_STATEMENT_AFTER_OUTPUT, { problem: 'twice', issue: 981 }],
		[TSRX_ERRORS.TARGET_AWAIT_UNSUPPORTED, { problem: 'twice', issue: 980 }],
		// The statement's keywords have no mapping, so the directive covers only `A`.
		[TS_ERRORS.NESTED_GLOBAL_EXPORT, { problem: 'typescript', issue: 979 }],
		// Printed as `<T>() => 1`, which TypeScript reads as JSX in the generated TSX:
		// its syntax errors there are beyond a directive's reach.
		[TS_ERRORS.RESERVED_ARROW_TYPE_PARAMETER, { problem: 'typescript', issue: 707 }],
	]),
);
