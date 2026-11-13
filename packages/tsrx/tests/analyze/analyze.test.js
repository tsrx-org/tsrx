/** @import * as AST from 'estree' */
/** @import { CompileError, TSRXAnalysisOptions } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { analyzeTsrx, DIAGNOSTIC_CODES, parseModule, TSRX_ERRORS } from '../../src/index.js';
import {
	TSRX_FORGOTTEN_STATEMENT_CONTAINER_ERROR,
	TSRX_JSX_SPREAD_CHILD_ERROR,
} from '../../src/analyze/validation.js';

const filename = 'App.tsrx';

/**
 * Parse and run the target-neutral analysis in diagnostic-collection mode.
 * Keeping this below the target compilers ensures the semantic rules are
 * exercised once rather than repeated by every lowering target.
 *
 * @param {string} source
 * @param {TSRXAnalysisOptions} [options]
 */
function analyze(source, options = { collect: true }) {
	/** @type {CompileError[]} */
	const parse_errors = [];
	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, filename, {
		collect: true,
		errors: parse_errors,
		comments,
	});

	expect(parse_errors).toEqual([]);

	return analyzeTsrx(ast, filename, { ...options, comments });
}

/** @param {ReturnType<typeof analyze>} result */
function forgotten_output_errors(result) {
	return result.errors.filter(
		(error) => error.code === DIAGNOSTIC_CODES.FORGOTTEN_STATEMENT_CONTAINER,
	);
}

describe('target-neutral TSRX analysis', () => {
	describe('unused template output', () => {
		it('reports free-floating output in every ordinary function form', () => {
			const result = analyze(
				`function Declaration() { <div /> }
				const Arrow = () => { <div /> };
				const Expression = function () { <div /> };
				consume(function () { <div /> });
				const object = { render() { <div /> } };
				class Component { render() { <div /> } }`,
				{ collect: true },
			);
			const errors = forgotten_output_errors(result);

			expect(errors).toHaveLength(6);
			expect(
				errors.every((error) => error.message === TSRX_FORGOTTEN_STATEMENT_CONTAINER_ERROR),
			).toBe(true);
		});

		it('leaves the output a second output or a statement displaces in `@{ … }` to the parser (#981)', () => {
			for (const [source, code] of [
				[
					'export function C() @{\n\t<a />\n\t<b />\n\t<c />\n}',
					DIAGNOSTIC_CODES.CODE_BLOCK_SINGLE_OUTPUT,
				],
				[
					'export function C() @{\n\t<a />\n\tconsole.log(1);\n}',
					DIAGNOSTIC_CODES.CODE_BLOCK_STATEMENT_AFTER_OUTPUT,
				],
				[
					'export function C() @{\n\t@if (x) {\n\t\t<a />\n\t\t<b />\n\t}\n}',
					DIAGNOSTIC_CODES.CODE_BLOCK_SINGLE_OUTPUT,
				],
			]) {
				/** @type {CompileError[]} */
				const errors = [];
				/** @type {AST.CommentWithLocation[]} */
				const comments = [];
				const ast = parseModule(source, filename, { collect: true, errors, comments });
				const result = analyzeTsrx(ast, filename, { collect: true, comments });
				expect(
					[...errors, ...result.errors].map((error) => error.code),
					source,
				).toEqual(errors.map(() => code));
				expect(errors.length, source).toBeGreaterThan(0);
			}
		});

		it('reports every free-floating TSRX output shape once', () => {
			const result = analyze(
				`function Test(ok, items, value) {
					<div />;
					<><div /></>;
					<style>div { color: red; }</style>;
					@if (ok) { <div /> } @else { <span /> };
					@for (const item of items) { <div>{item}</div> };
					@switch (value) { @case 1: { <div /> } @default: { <span /> } };
					@try { <div /> } @catch (error) { <span /> };
					@{ <div /> };
				}`,
				{ collect: true },
			);

			expect(forgotten_output_errors(result)).toHaveLength(8);
		});

		it('reports output nested in ordinary JavaScript blocks and output followed by setup', () => {
			const result = analyze(`function Test() {
				if (ready) {
					<div />
				}

				<span />;
				const value = 1;
				console.log(value);
			}`);

			expect(forgotten_output_errors(result)).toHaveLength(2);
		});

		it('reports free-floating output in the setup portion of a function @{...} body', () => {
			const result = analyze(
				`function Test(enabled, ready, items, value) @{
					if (enabled) {
						<div />;
						<><div /></>;
						<style>div { color: red; }</style>;
						@if (ready) { <div /> } @else { <span /> };
						@for (const item of items) { <div>{item}</div> };
						@switch (value) { @case 1: { <div /> } @default: { <span /> } };
						@try { <div /> } @catch (error) { <span /> };
						@{ <div /> };
					}

					<main />
				}`,
				{ collect: true },
			);

			expect(forgotten_output_errors(result)).toHaveLength(8);
		});

		it('reports free-floating output in ordinary setup loops', () => {
			const result = analyze(`function Test() @{
				const items = [1, 2, 3];
				for (const item of items) {
					<div>{item}</div>
				}

				<main />
			}`);

			expect(forgotten_output_errors(result)).toHaveLength(1);
		});

		it('reports every braceless statement-position template', () => {
			const result = analyze(
				`function Test(a, b, object, items, ready) @{
					if (a) <div />;
					if (b) run(); else <span />;
					for (;;) <p />;
					for (const key in object) <section />;
					for (const item of items) <article />;
					while (ready) <aside />;
					output: <footer />;

					<main />
				}`,
				{ collect: true },
			);

			expect(forgotten_output_errors(result)).toHaveLength(7);
		});

		it('reports free-floating setup output in retained and nested @{...} expressions', () => {
			const result = analyze(
				`function Retained(enabled) {
					const content = @{
						if (enabled) {
							<aside />
						}

						<main />
					};

					return content;
				}

				function Nested(enabled) {
					return <section>
						@{
							if (enabled) {
								<aside />
							}

							<main />
						}
					</section>;
				}`,
				{ collect: true },
			);

			expect(forgotten_output_errors(result)).toHaveLength(2);
		});

		it('looks through value-transparent expression wrappers', () => {
			const result = analyze(`function Test() {
				(<div />);
				(<span /> as JSX.Element);
			}`);

			expect(forgotten_output_errors(result)).toHaveLength(2);
		});

		it('throws during strict analysis', () => {
			const ast = parseModule('function Test() { <div /> }', filename);

			expect(() => analyzeTsrx(ast, filename)).toThrow(TSRX_FORGOTTEN_STATEMENT_CONTAINER_ERROR);
		});

		it('collects and continues for editor and type-only analysis modes', () => {
			for (const options of [
				{ collect: true },
				{ loose: true },
				{ typeOnly: true },
				{ to_ts: true },
			]) {
				const result = analyze('function Test() { <div /> }', options);

				expect(forgotten_output_errors(result), JSON.stringify(options)).toHaveLength(1);
			}
		});
	});

	describe('rendered or retained template output', () => {
		it('allows every function form to use a direct @{...} body', () => {
			for (const source of [
				'function Test() @{ <div /> }',
				'const Test = () => @{ <div /> };',
				'const Test = function () @{ <div /> };',
				'consume(function () @{ <div /> });',
				'const object = { render() @{ <div /> } };',
				'class Test { render() @{ <div /> } }',
			]) {
				expect(forgotten_output_errors(analyze(source)), source).toEqual([]);
			}
		});

		it('still checks ordinary nested functions inside a function @{...} body', () => {
			const result = analyze(`function App() @{
				const render = function () {
					<span />
				};

				<div>{render()}</div>
			}`);

			expect(forgotten_output_errors(result)).toHaveLength(1);
		});

		it('allows returned, retained, passed, and expression-bodied output', () => {
			for (const source of [
				'function Test() { return <div />; }',
				'function Test() { const view = <div />; return view; }',
				'function Test() { render(<div />); }',
				'function Test() { return ready && <div />; }',
				'const Test = () => <div />;',
				'function Test() { const view = @if (ready) { <div /> }; return view; }',
				'function Test() { const view = @{ <div /> }; return view; }',
			]) {
				expect(forgotten_output_errors(analyze(source)), source).toEqual([]);
			}
		});

		it('allows retained setup output before the rendered value of a function @{...} body', () => {
			const result = analyze(`function Test(enabled) @{
				let content = null;
				if (enabled) {
					content = <aside /> as JSX.Element;
					renderPreview(<small />);
				}

				@if (content) {
					<main>{content}</main>
				} @else {
					<main />
				}
			}`);

			expect(forgotten_output_errors(result)).toEqual([]);
		});

		it('allows templates used as ordinary control-flow values', () => {
			const result = analyze(`function Test() {
				if (<Condition />) run();
				for (; <Condition />; ) run();
				while (<Condition />) run();
			}`);

			expect(forgotten_output_errors(result)).toEqual([]);
		});

		it('does not report nested output that belongs to another template', () => {
			const result = analyze(`function Test() {
				return <section>
					@if (ready) { <div /> } @else { <span /> }
				</section>;
			}`);

			expect(forgotten_output_errors(result)).toEqual([]);
		});

		it('does not apply function-body semantics at module scope', () => {
			expect(forgotten_output_errors(analyze('<div />'))).toEqual([]);
		});
	});

	describe('JSX spread children', () => {
		// They parse, as in TypeScript, but no target supports them.
		const source = `function App({ items }) @{
	<div>
		{...items}
		<>{...items}</>
		<Card content={<i>{...items}</i>} />
		@if (items.length) {
			<b>{...items}</b>
		}
	</div>
}
function List({ items }) {
	return <ul>{...items}</ul>;
}`;

		/** @returns {number[]} */
		function spread_starts() {
			/** @type {number[]} */
			const starts = [];
			for (
				let at = source.indexOf('{...items}');
				at !== -1;
				at = source.indexOf('{...items}', at + 1)
			) {
				starts.push(at);
			}
			return starts;
		}

		it('reports every spread child at its braces', () => {
			const result = analyze(source);

			expect(
				result.errors.map((error) => [error.code, error.message, error.pos, error.end]),
			).toEqual(
				spread_starts().map((start) => [
					DIAGNOSTIC_CODES.JSX_SPREAD_CHILD,
					TSRX_JSX_SPREAD_CHILD_ERROR,
					start,
					start + '{...items}'.length,
				]),
			);
			expect(result.errors[0].loc).toEqual({
				start: { line: 3, column: 2 },
				end: { line: 3, column: 12 },
			});
		});

		it('throws during strict analysis', () => {
			const ast = parseModule(source, filename);

			expect(() => analyzeTsrx(ast, filename)).toThrow(
				expect.objectContaining({
					message: TSRX_JSX_SPREAD_CHILD_ERROR,
					code: DIAGNOSTIC_CODES.JSX_SPREAD_CHILD,
					pos: spread_starts()[0],
				}),
			);
		});

		it('collects for editor and type-only analysis modes', () => {
			for (const options of [{ loose: true }, { typeOnly: true }, { to_ts: true }]) {
				expect(analyze(source, options).errors, JSON.stringify(options)).toHaveLength(5);
			}
		});
	});

	describe('a code block whose only statement is an expression', () => {
		const { CODE_BLOCK_EXPRESSION_CHILD, CODE_BLOCK_EXPRESSION_ONLY } = TSRX_ERRORS;

		/**
		 * The warnings `source` gets, each with its message's entry and the
		 * source it covers.
		 * @param {string} source
		 * @param {TSRXAnalysisOptions} [options]
		 */
		function warnings(source, options) {
			return analyze(source, options).errors.map((error) => ({
				entry:
					error.message === CODE_BLOCK_EXPRESSION_CHILD.message
						? 'child'
						: error.message === CODE_BLOCK_EXPRESSION_ONLY.message
							? 'only'
							: error.message,
				code: error.code,
				severity: error.severity,
				text: source.slice(error.pos, error.end),
			}));
		}

		/**
		 * @param {'child' | 'only'} entry
		 * @param {string} text
		 */
		function warning(entry, text) {
			return {
				entry,
				code: DIAGNOSTIC_CODES.CODE_BLOCK_EXPRESSION_ONLY,
				severity: 'warning',
				text,
			};
		}

		it("warns in a child list, where the '@' may be text", () => {
			expect(
				warnings(`function Plain({ user }) {
	return <p>@{user.name}</p>;
}
function Template({ user }) @{
	<p>Hi @{user.name}!</p>
}
const fragment = <>@{user.name}</>;
const mail = <a>name@{domain}</a>;`),
			).toEqual([
				warning('child', '@{user.name}'),
				warning('child', '@{user.name}'),
				warning('child', '@{user.name}'),
				warning('child', '@{domain}'),
			]);
		});

		it('warns wherever else a code block can be', () => {
			expect(
				warnings(`function Body({ user }) @{ user.name }
const Arrow = ({ user }) => @{ user.name };
class Card { render() @{ this.props } }
const value = @{ x };
function Returned() { return @{ x }; }
const attribute = <A title={@{ x }} />;
const argument = f(@{ x });
function Nested() @{
	@{ x }
}
function Directives({ c, items, k }) @{
	<>
		@if (c) { @{ c } }
		@for (const item of items) { @{ item } }
		@switch (k) { @case 1: { @{ k } } }
		@try { @{ c } } @catch (e) { @{ e } }
	</>
}`),
			).toEqual([
				warning('only', '@{ user.name }'),
				warning('only', '@{ user.name }'),
				warning('only', '@{ this.props }'),
				warning('only', '@{ x }'),
				warning('only', '@{ x }'),
				warning('only', '@{ x }'),
				warning('only', '@{ x }'),
				warning('only', '@{ x }'),
				warning('only', '@{ c }'),
				warning('only', '@{ item }'),
				warning('only', '@{ k }'),
				warning('only', '@{ c }'),
				warning('only', '@{ e }'),
			]);
		});

		it('warns for every expression whose value is all it makes', () => {
			const expressions = [
				'name',
				'"text"',
				'1',
				'`@${name}`',
				'`${format(name)}`',
				"'@' + name",
				'user.name',
				'user?.name',
				'users[0]',
				'!ok',
				'typeof x',
				'ok ? a : b',
				'ok && name',
				'ok ?? <b />',
				'ok && <style>.x { color: red; }</style>',
				'ok ? @{ <b /> } : null',
				'ok && @if (c) { <b /> }',
				'ok || @for (const item of items) { <b /> }',
				'ok ?? @switch (k) { @case 1: { <b /> } }',
				'ok && @try { <b /> } @catch (e) { <i /> }',
				'(name)',
				'name as string',
				'name!',
				'name satisfies string',
				'[a, b]',
				'({ a })',
				'() => name',
				'a, b',
				'this',
				'import.meta',
			];
			for (const expression of expressions) {
				expect(warnings(`const e = <p>@{${expression}}</p>;`), expression).toEqual([
					warning('child', `@{${expression}}`),
				]);
			}
		});

		it('leaves alone an expression that may be there for its effect', () => {
			const expressions = [
				'log(user)',
				'user.save()',
				'user?.save()',
				'new Thing()',
				'x = 1',
				'x += 1',
				'count++',
				'--count',
				'delete cache[key]',
				'void track()',
				'ok && save()',
				'ok ? save() : null',
				'tag`text`',
				'import("./a.js")',
				'log(), name',
				'ok && @{ log(user) }',
				'ok ? @{ log(user); <b /> } : null',
				'ok && @if (c) { log(user) }',
				'ok && @if (c) { <b /> } @else { @{ log(user) } }',
				'ok || @for (const item of items) { log(item); <b /> }',
				'ok && @for (const item of items) { <b /> } @empty { log(user) }',
				'ok ?? @switch (k) { @case 1: { log(user); <b /> } }',
				'ok && @try { <b /> } @catch (e) { log(e); <i /> }',
			];
			for (const expression of expressions) {
				expect(warnings(`async function* A() @{ <p>@{${expression}}</p> }`), expression).toEqual(
					[],
				);
			}
			expect(warnings('async function A() @{ <p>@{await load()}</p> }')).toEqual([]);
			expect(warnings('function* A() @{ <p>@{yield x}</p> }')).toEqual([]);
		});

		it('leaves alone a block with output, more statements, or no expression statement', () => {
			expect(
				warnings(`function A({ user }) @{
	<>
		<p>@{const name = user.name; <b>{name}</b>}</p>
		<p>@{log(user); user.name}</p>
		<p>@{const name = user.name}</p>
		<p>@{if (user) log(user)}</p>
		<p>@{ }</p>
		<p>{\`@\${user.name}\`}</p>
		<p>&#64;{user.name}</p>
	</>
}`),
			).toEqual([]);
		});

		it("leaves alone a function body's directive, but not the same string as a child", () => {
			expect(
				warnings(`export async function action() @{ 'use server' }
const Client = () => @{ 'use client' };
const text = <p>@{'use server'}</p>;`),
			).toEqual([warning('child', "@{'use server'}")]);
		});

		it("leaves JSX to the unused-output error, and a directive's own body alone", () => {
			const result = analyze(`function A({ ok }) @{
	<>
		<p>@{(<b />)}</p>
		@if (ok) { ok }
	</>
}`);

			expect(result.errors.map((error) => error.code)).toEqual([
				DIAGNOSTIC_CODES.FORGOTTEN_STATEMENT_CONTAINER,
			]);
		});

		it('is dropped by a compile that does not collect, and does not throw', () => {
			const ast = parseModule('const e = <p>@{user.name}</p>;', filename);

			expect(analyzeTsrx(ast, filename).errors).toEqual([]);
		});

		it('collects for editor and type-only analysis modes', () => {
			for (const options of [{ loose: true }, { typeOnly: true }, { to_ts: true }]) {
				expect(
					warnings('const e = <p>@{user.name}</p>;', options),
					JSON.stringify(options),
				).toEqual([warning('child', '@{user.name}')]);
			}
		});

		it('is suppressed by @tsrx-ignore on the line before', () => {
			expect(
				warnings(`function A({ user }) @{
	<p>
		// @tsrx-ignore
		@{user.name}
	</p>
}`),
			).toEqual([]);
		});
	});

	describe('@switch arm scopes', () => {
		it('resolves a case test in the enclosing scope, not in the arm it opens', () => {
			const source = `function App({ value }) @{
	const label = 'outer';
	@switch (value) {
		@case label: {
			const label = 'inner';
			<p>{label}</p>
		}
	}
}`;
			const { scopes } = analyze(source);
			const [outer, inner] = [...new Set(scopes.values())]
				.map((scope) => scope.declarations.get('label'))
				.filter((binding) => binding !== undefined)
				.sort(
					(a, b) => /** @type {number} */ (a.node.start) - /** @type {number} */ (b.node.start),
				);
			const starts = (/** @type {typeof outer} */ binding) =>
				binding.references
					.filter((reference) => reference.node !== binding.node)
					.map((reference) => reference.node.start);

			expect(starts(outer)).toEqual([source.indexOf('@case label') + '@case '.length]);
			expect(starts(inner)).toEqual([source.indexOf('{label}') + 1]);
		});
	});
});
