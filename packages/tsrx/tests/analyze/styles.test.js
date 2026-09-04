/** @import * as AST from 'estree' */
/** @import { CompileError, TSRXAnalysisOptions } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { analyzeCss, analyzeTsrx, DIAGNOSTIC_CODES, parseModule } from '../../src/index.js';
import {
	TSRX_CSS_GLOBAL_MIDDLE_PLACEMENT_ERROR,
	TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR,
	TSRX_STYLE_APPLY_DUPLICATE_ERROR,
	TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR,
	TSRX_STYLE_APPLY_VALUE_ERROR,
	TSRX_STYLE_RESERVED_CLASS_KEY_ERROR,
	TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR,
	TSRX_STYLE_STANDALONE_NEEDS_FRAGMENT_ERROR,
	TSRX_STYLE_STANDALONE_OUTSIDE_TEMPLATE_ERROR,
	tsrx_style_apply_before_declaration_error,
	tsrx_style_apply_target_error,
	tsrx_style_unknown_attribute_error,
} from '../../src/analyze/validation.js';

const filename = 'App.tsrx';

/**
 * Parse and run the target-neutral analysis in diagnostic-collection mode, the
 * same way editors and type-only callers do.
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

/**
 * Style diagnostics only, so unrelated analysis output never leaks into the
 * assertions of this file.
 *
 * @param {ReturnType<typeof analyze>} result
 */
function style_errors(result) {
	return result.errors.filter((error) => error.code?.startsWith('tsrx-style-'));
}

/**
 * @param {ReturnType<typeof analyze>} result
 * @param {string} code
 */
function errors_with_code(result, code) {
	return result.errors.filter((error) => error.code === code);
}

/**
 * 1-based line and 0-based column of the `occurrence`-th `needle` in `source`,
 * matching the acorn location convention used by `CompileError.loc`.
 *
 * @param {string} source
 * @param {string} needle
 * @param {number} [occurrence]
 */
function loc_of(source, needle, occurrence = 0) {
	let index = -1;
	for (let i = 0; i <= occurrence; i += 1) {
		index = source.indexOf(needle, index + 1);
	}

	expect(index, `${JSON.stringify(needle)} in source`).toBeGreaterThanOrEqual(0);

	const before = source.slice(0, index);
	return {
		line: before.split('\n').length,
		column: index - (before.lastIndexOf('\n') + 1),
	};
}

/**
 * Location of the identifier inside `apply={name…}`.
 *
 * @param {string} source
 * @param {string} name
 */
function apply_target_loc(source, name) {
	const prefix = 'apply={';
	const { line, column } = loc_of(source, `${prefix}${name}`);
	return { line, column: column + prefix.length };
}

/**
 * @param {ReturnType<typeof analyze>} result
 * @param {string} code
 * @param {string} message
 * @param {{ line: number, column: number }} [start]
 */
function expect_single_error(result, code, message, start) {
	const errors = style_errors(result);

	expect(errors).toHaveLength(1);
	expect(errors[0].code).toBe(code);
	expect(errors[0].message).toBe(message);
	expect(errors[0].type).toBe('usage');
	if (start) {
		expect(errors[0].loc?.start).toEqual(start);
	}

	return errors[0];
}

/** @param {ReturnType<typeof analyze>} result */
function first_apply(result) {
	const [style] = result.styles.standalone;
	expect(style).toBeDefined();
	return style.metadata.styleApplies ?? [];
}

const theme = 'const t = <style>.a { color: red; }</style>;';

describe('scoped style analysis', () => {
	describe('apply value', () => {
		it('reports a string apply value', () => {
			const source = `${theme}\nfunction App() @{ <><style apply="t">.b {}</style><div /></> }`;

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_APPLY_VALUE,
				TSRX_STYLE_APPLY_VALUE_ERROR,
				loc_of(source, 'apply="t"'),
			);
		});

		it('reports a bare apply attribute', () => {
			const source = `${theme}\nfunction App() @{ <><style apply>.b {}</style><div /></> }`;
			const result = analyze(source);

			expect_single_error(
				result,
				DIAGNOSTIC_CODES.STYLE_APPLY_VALUE,
				TSRX_STYLE_APPLY_VALUE_ERROR,
				loc_of(source, 'apply>'),
			);
			expect(first_apply(result)).toEqual([]);
			expect(result.styles.assigned[0].metadata.styleKind).toBe('class-map');
		});

		it('accepts an expression value', () => {
			const result = analyze(`${theme}\nfunction App() @{ <><style apply={t} /><div /></> }`);

			expect(style_errors(result)).toEqual([]);
			expect(first_apply(result)).toHaveLength(1);
		});
	});

	describe('apply target', () => {
		it('reports an unresolved name', () => {
			const source = 'function App() @{ <><style apply={missing} /><div /></> }';

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
				tsrx_style_apply_target_error('missing'),
				apply_target_loc(source, 'missing'),
			);
		});

		it('reports bindings that do not hold a style block', () => {
			for (const [source, name] of [
				['const t = 1;\nfunction App() @{ <><style apply={t} /><div /></> }', 't'],
				['function App(t) @{ <><style apply={t} /><div /></> }', 't'],
				['const t = <div />;\nfunction App() @{ <><style apply={t} /><div /></> }', 't'],
				['function t() {}\nfunction App() @{ <><style apply={t} /><div /></> }', 't'],
			]) {
				expect_single_error(
					analyze(source),
					DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
					tsrx_style_apply_target_error(name),
					apply_target_loc(source, name),
				);
			}
		});

		it('reports spread elements and holes in an apply array', () => {
			const spread = `${theme}\nfunction App() @{ <><style apply={[t, ...rest]} /><div /></> }`;
			const spread_result = analyze(spread);
			expect_single_error(
				spread_result,
				DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
				tsrx_style_apply_target_error('apply entry'),
				loc_of(spread, '...rest'),
			);
			// The valid entry still resolves.
			expect(first_apply(spread_result)).toHaveLength(1);

			const hole = `${theme}\nfunction App() @{ <><style apply={[t, , t]} /><div /></> }`;
			const hole_result = analyze(hole);
			expect_single_error(
				hole_result,
				DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
				tsrx_style_apply_target_error('apply entry'),
				loc_of(hole, '[t, , t]'),
			);
			expect(first_apply(hole_result)).toHaveLength(2);
		});

		it('reports members that do not name a style block of a local object', () => {
			for (const [source, name] of [
				[
					'const themes = { dark: <style>.a {}</style> };\nfunction App() @{ <><style apply={themes.light} /><div /></> }',
					'themes.light',
				],
				['const t = 1;\nfunction App() @{ <><style apply={t.x} /><div /></> }', 't.x'],
				[
					'const t = <style>.a {}</style>;\nfunction App() @{ <><style apply={t.x} /><div /></> }',
					't.x',
				],
				['function App(props) @{ <><style apply={props.theme} /><div /></> }', 'props.theme'],
			]) {
				expect_single_error(
					analyze(source),
					DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
					tsrx_style_apply_target_error(name),
					apply_target_loc(source, name),
				);
			}
		});

		it('reports entries that are neither identifiers nor member chains', () => {
			for (const [source, needle] of [
				[`${theme}\nfunction App() @{ <><style apply={t()} /><div /></> }`, 't()'],
				[
					"const themes = { dark: <style>.a {}</style> };\nfunction App() @{ <><style apply={themes['dark']} /><div /></> }",
					"themes['dark']",
				],
				[`${theme}\nfunction App() @{ <><style apply={'t'} /><div /></> }`, "'t'"],
			]) {
				expect_single_error(
					analyze(source),
					DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
					tsrx_style_apply_target_error('apply target'),
					loc_of(source, needle),
				);
			}
		});

		it('accepts local blocks, object property blocks, and imports', () => {
			for (const source of [
				`${theme}\nfunction App() @{ <><style apply={t} /><div /></> }`,
				'const themes = { dark: <style>.a {}</style> };\nfunction App() @{ <><style apply={themes.dark} /><div /></> }',
				"const themes = { 'dark': <style>.a {}</style> };\nfunction App() @{ <><style apply={themes.dark} /><div /></> }",
				"import { t } from './theme.tsrx';\nfunction App() @{ <><style apply={t} /><div /></> }",
				"import * as ns from './themes.tsrx';\nfunction App() @{ <><style apply={ns.dark} /><div /></> }",
			]) {
				const result = analyze(source);

				expect(style_errors(result), source).toEqual([]);
				expect(first_apply(result), source).toHaveLength(1);
			}
		});
	});

	describe('apply before declaration', () => {
		it('reports a block applied before its declaration at the identifier', () => {
			const source = `function App() @{\n\t<>\n\t\t<style apply={later} />\n\t\t<div />\n\t</>\n}\nconst later = <style>.a {}</style>;`;
			const result = analyze(source);

			expect_single_error(
				result,
				DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
				tsrx_style_apply_before_declaration_error('later'),
				{ line: 3, column: 16 },
			);
			expect(first_apply(result)).toEqual([]);
			// The unresolved entry does not mark the block as applied.
			expect(result.styles.assigned[0].metadata.styleKind).toBe('class-map');
		});

		it('reports a member applied before its object declaration', () => {
			const source = `function App() @{ <><style apply={themes.dark} /><div /></> }\nconst themes = { dark: <style>.a {}</style> };`;

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
				tsrx_style_apply_before_declaration_error('themes.dark'),
				apply_target_loc(source, 'themes.dark'),
			);
		});

		it('accepts a block declared earlier in source order', () => {
			const result = analyze(`${theme}\nfunction App() @{ <><style apply={t} /><div /></> }`);

			expect(style_errors(result)).toEqual([]);
		});
	});

	describe('duplicate apply', () => {
		it('reports the second apply attribute and keeps the first', () => {
			const source = `${theme}\nfunction App() @{ <><style apply={t} apply={t} /><div /></> }`;
			const result = analyze(source);

			expect_single_error(
				result,
				DIAGNOSTIC_CODES.STYLE_APPLY_DUPLICATE,
				TSRX_STYLE_APPLY_DUPLICATE_ERROR,
				loc_of(source, 'apply={t}', 1),
			);
			expect(first_apply(result)).toHaveLength(1);
		});

		it('accepts several themes as one array', () => {
			const result = analyze(
				'const a = <style>.a {}</style>;\nconst b = <style>.b {}</style>;\nfunction App() @{ <><style apply={[a, b]} /><div /></> }',
			);

			expect(style_errors(result)).toEqual([]);
			expect(first_apply(result).map((entry) => entry.target)).toEqual(result.styles.assigned);
		});
	});

	describe('unsupported apply host', () => {
		it('reports apply inside <head>', () => {
			const source = `${theme}\nfunction App() @{ <head><style apply={t}>.b {}</style></head> }`;
			const result = analyze(source);

			expect_single_error(
				result,
				DIAGNOSTIC_CODES.STYLE_APPLY_UNSUPPORTED_HOST,
				TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR,
				loc_of(source, 'apply={t}'),
			);
			// Head styles are neither standalone nor assigned.
			expect(result.styles.standalone).toEqual([]);
			expect(result.styles.assigned[0].metadata.styleKind).toBe('class-map');
		});

		it('reports apply on a resource style', () => {
			const source = `${theme}\nfunction App() @{ <><style href="theme.css" apply={t} /><div /></> }`;

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_APPLY_UNSUPPORTED_HOST,
				TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR,
				loc_of(source, 'apply={t}'),
			);
		});

		it('accepts apply on a scoped block next to a head style', () => {
			const result = analyze(
				`${theme}\nfunction App() @{ <><head><style>.b {}</style></head><style apply={t} /><div /></> }`,
			);

			expect(style_errors(result)).toEqual([]);
			expect(result.styles.standalone).toHaveLength(1);
		});
	});

	describe('reserved class key', () => {
		it('reports an assigned block that authors .$class', () => {
			const source = 'const t = <style>.\\$class { color: red; }</style>;';

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_RESERVED_CLASS_KEY,
				TSRX_STYLE_RESERVED_CLASS_KEY_ERROR,
				loc_of(source, '<style>'),
			);
		});

		it('reports every assigned position', () => {
			for (const source of [
				'export default <style>.\\$class {}</style>;',
				'const themes = { dark: <style>.\\$class {}</style> };',
				'const t = <style>.b, .\\$class {}</style>;',
			]) {
				const errors = errors_with_code(analyze(source), DIAGNOSTIC_CODES.STYLE_RESERVED_CLASS_KEY);

				expect(errors, source).toHaveLength(1);
				expect(errors[0].message, source).toBe(TSRX_STYLE_RESERVED_CLASS_KEY_ERROR);
			}
		});

		it('does not report standalone blocks or other class names', () => {
			for (const source of [
				'function App() @{ <><style>.\\$class { color: red; }</style><div /></> }',
				'const t = <style>.a { color: red; }</style>;',
				'const t = <style>.class { color: red; }</style>;',
			]) {
				expect(style_errors(analyze(source)), source).toEqual([]);
			}
		});
	});

	describe('standalone block at module scope', () => {
		it('reports a bare module-level block', () => {
			const source = '<style>.a { color: red; }</style>;';
			const result = analyze(source);

			expect_single_error(
				result,
				DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE,
				TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR,
				{ line: 1, column: 0 },
			);
			expect(result.styles.standalone).toHaveLength(1);
			expect(result.styles.assigned).toEqual([]);
		});

		it('reports a block in a module-level block statement', () => {
			expect_single_error(
				analyze('{ <style>.a {}</style>; }'),
				DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE,
				TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR,
			);
		});

		it('accepts template-scope, assigned, head, and resource blocks', () => {
			for (const source of [
				'function App() @{ <><style>.a {}</style><div /></> }',
				'function App() @{ <div><style>.a {}</style><span /></div> }',
				'const t = <style>.a {}</style>;',
				'<head><style>.a {}</style></head>;',
				'<style href="theme.css" />;',
			]) {
				expect(style_errors(analyze(source)), source).toEqual([]);
			}
		});
	});

	describe('standalone block outside a template container', () => {
		// Raw CSS in `<style>` is TSRX template syntax: a bodied standalone block
		// needs an enclosing `@{ … }` body or a control-flow body, at any depth of
		// native elements, fragments, expression containers, or callbacks. Plain
		// TSX keeps the TSX rule (`<style>{css}</style>` is an ordinary element),
		// and the bare module-level statement keeps its own code.
		const CSS = '.a { color: red; }';

		/** @type {Array<[string, string]>} */
		const rejected = [
			[
				'plain-TSX return',
				`function C() { return <section><style>${CSS}</style><div class="a" /></section>; }`,
			],
			[
				'module-scope assigned element',
				`export const card = <div><style>${CSS}</style><p /></div>;`,
			],
			[
				'assigned element in a plain function body',
				`function C() { const card = <div><style>${CSS}</style><p /></div>; return card; }`,
			],
			['module-scope assigned fragment', `const view = <><style>${CSS}</style><div /></>;`],
			[
				'concise arrow body',
				`const C = () => <section><style>${CSS}</style><div class="a" /></section>;`,
			],
			[
				'nested fragment in a plain-TSX return',
				`function C() { return <><div /><><style>${CSS}</style><p /></></>; }`,
			],
		];

		it.each(rejected)('reports %s at the block', (_name, source) => {
			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE,
				TSRX_STYLE_STANDALONE_OUTSIDE_TEMPLATE_ERROR,
				loc_of(source, '<style>'),
			);
		});

		it('keeps the module-scope code for a bare statement', () => {
			expect_single_error(
				analyze(`<style>${CSS}</style>;`),
				DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE,
				TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR,
			);
		});

		/** @type {Array<[string, string]>} */
		const accepted = [
			['@{} body', `function C() @{ <><style>${CSS}</style><div /></> }`],
			[
				'assigned element inside a @{} body',
				`function C() @{ const card = <div><style>${CSS}</style><p /></div>; <>{card}</> }`,
			],
			[
				'@if body inside a plain-TSX return',
				`function C(x) { return <section>@if (x) { <><style>${CSS}</style><p /></> }</section>; }`,
			],
			[
				'@else if body inside a plain-TSX return',
				`function C(x) { return <div>@if (x) { <b /> } @else if (!x) { <><style>${CSS}</style><i /></> }</div>; }`,
			],
			[
				'@catch body inside a plain-TSX return',
				`function C() { return <div>@try { <b /> } @catch (e) { <><style>${CSS}</style><i /></> }</div>; }`,
			],
			[
				'@for body inside a plain-TSX return',
				`function C(xs) { return <ul>@for (const x of xs) { <><style>${CSS}</style><li>{x}</li></> }</ul>; }`,
			],
			[
				'@switch case inside a plain-TSX return',
				`function C(k) { return <div>@switch (k) { @case 1: { <><style>${CSS}</style><b /></> } }</div>; }`,
			],
			[
				'callback element lexically inside a @{} body',
				`function C(items) @{ <ul>{items.map((i) => <li><style>${CSS}</style><b /></li>)}</ul> }`,
			],
			[
				'nested element children inside a @{} body',
				`function C() @{ <section><div><style>${CSS}</style><p /></div></section> }`,
			],
			['head style anywhere', `function C() { return <head><style>${CSS}</style></head>; }`],
			[
				'resource style anywhere',
				`function C() { return <><style href="a.css" precedence="default" /><div /></>; }`,
			],
			[
				'assigned block in a plain function',
				`function C() { const theme = <style>${CSS}</style>; return theme; }`,
			],
			[
				'self-closing apply block in plain TSX (no CSS text)',
				`const t = <style>${CSS}</style>;\nfunction C() { return <><style apply={t} /><div /></>; }`,
			],
			[
				'expression-child style element in plain TSX',
				`function C(css) { return <section><style>{css}</style><div /></section>; }`,
			],
		];

		it.each(accepted)('accepts %s', (_name, source) => {
			expect(style_errors(analyze(source))).toEqual([]);
		});

		it('treats <style>{css}</style> as an ordinary element, not a style block', () => {
			const result = analyze('function C(css) @{ <section><style>{css}</style><div /></section> }');

			expect(result.errors).toEqual([]);
			expect(result.styles.standalone).toEqual([]);
			expect(result.styles.assigned).toEqual([]);
		});
	});

	describe('standalone block in a statement slot', () => {
		// A `<style>` block is an output node: as the lone output of a `@{ … }`
		// body or a control-flow body, or as a statement, it styles nothing.
		// (Beside another output node it is already the parser's multiple-outputs
		// error.) The valid placement is inside a fragment or element.
		const CSS = '.a { color: red; }';

		/** @type {Array<[string, string]>} */
		const rejected = [
			['lone output of a @{} body', `function C() @{ <style>${CSS}</style> }`],
			[
				'lone self-closing apply output of a @{} body',
				`${theme}\nfunction C() @{ <style apply={t} /> }`,
			],
			['lone output of an @if body', `function C(x) @{ @if (x) { <style>${CSS}</style> } }`],
			[
				'lone output of an @else body',
				`function C(x) @{ @if (x) { <b /> } @else { <style>${CSS}</style> } }`,
			],
			[
				'lone output of a @for body',
				`function C(xs) @{ @for (const x of xs) { <style>${CSS}</style> } }`,
			],
			[
				'lone output of a @switch case',
				`function C(k) @{ @switch (k) { @case 1: { <style>${CSS}</style> } } }`,
			],
			[
				'lone output of a @catch body',
				`function C() @{ @try { <b /> } @catch (e) { <style>${CSS}</style> } }`,
			],
			[
				'lone output of a @finally body',
				`function C() @{ @try { <b /> } @catch (e) { <i /> } @finally { <style>${CSS}</style> } }`,
			],
			[
				'statement in a plain function body',
				`function C() { <style>${CSS}</style>; return null; }`,
			],
			['statement in a nested block', `function C() @{ { <style>${CSS}</style>; } <div /> }`],
		];

		it.each(rejected)('reports the %s at the block', (_name, source) => {
			const result = analyze(source);
			const errors = errors_with_code(result, DIAGNOSTIC_CODES.STYLE_STANDALONE_NEEDS_FRAGMENT);

			expect(errors).toHaveLength(1);
			expect(errors[0].message).toBe(TSRX_STYLE_STANDALONE_NEEDS_FRAGMENT_ERROR);
			// The reported block is the standalone one (a source may declare a theme first).
			expect(errors[0].loc?.start).toEqual(
				loc_of(source, '<style', source.startsWith('const t') ? 1 : 0),
			);
			// One diagnostic per block: the outside-template rule does not stack.
			expect(errors_with_code(result, DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE)).toEqual(
				[],
			);
		});

		it('accepts the same blocks wrapped in a fragment with their output', () => {
			const result = analyze(
				`function App(ready, items, value) @{
					<>
						<style>.a {}</style>
						@if (ready) {
							<><style>.b {}</style><div /></>
						} @else {
							<><style>.c {}</style><span /></>
						}
					</>
				}
				function List(items) @{
					@for (const item of items) {
						<><style>.d {}</style><li>{item}</li></>
					}
				}
				function Pick(value) @{
					@switch (value) { @case 1: { <><style>.e {}</style><div /></> } @default: { <span /> } }
				}
				function Safe() @{
					@try {
						<><style>.f {}</style><div /></>
					} @catch (error) {
						<><style>.g {}</style><span /></>
					}
				}
				function Nested() @{
					<div>@{
						<><style>.h {}</style><span /></>
					}</div>
				}`,
			);

			expect(result.errors).toEqual([]);
			expect(result.styles.standalone).toHaveLength(8);
		});
	});

	describe('unknown attributes', () => {
		it('reports attributes other than ref and apply', () => {
			const source = 'function App() @{ <><style data-x="1" ref={r}>.a {}</style><div /></> }';

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE,
				tsrx_style_unknown_attribute_error('data-x'),
				loc_of(source, 'data-x'),
			);
		});

		it('names namespaced attributes in full', () => {
			const source = 'function App() @{ <><style xml:lang="en">.a {}</style><div /></> }';

			expect_single_error(
				analyze(source),
				DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE,
				tsrx_style_unknown_attribute_error('xml:lang'),
				loc_of(source, 'xml:lang'),
			);
		});

		it('reports each unknown attribute once', () => {
			const result = analyze(
				'function App() @{ <><style media="print" title="x">.a {}</style><div /></> }',
			);
			const errors = errors_with_code(result, DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE);

			expect(errors.map((error) => error.message)).toEqual([
				tsrx_style_unknown_attribute_error('media'),
				tsrx_style_unknown_attribute_error('title'),
			]);
		});

		it('accepts ref and apply, and any attribute on head or resource styles', () => {
			for (const source of [
				`${theme}\nfunction App() @{ <><style ref={r} apply={t}>.b {}</style><div /></> }`,
				'function App() @{ <head><style media="print">.a {}</style></head> }',
				'function App() @{ <><style href="theme.css" media="print" /><div /></> }',
			]) {
				expect(style_errors(analyze(source)), source).toEqual([]);
			}
		});
	});

	describe(':global placement', () => {
		/** @param {string} css */
		function parse_stylesheet(css) {
			const ast = parseModule(`const t = <style>${css}</style>;`, filename);
			const declaration = /** @type {AST.VariableDeclaration} */ (ast.body[0]);
			const style = /** @type {AST.JSXStyleElement} */ (declaration.declarations[0].init);
			return style.children[0];
		}

		it('reports misplaced :global with a coded error', () => {
			for (const [css, message] of [
				['.a :global(.b) .c { color: red; }', TSRX_CSS_GLOBAL_MIDDLE_PLACEMENT_ERROR],
				[':not(:global) { color: red; }', TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR],
				[':is(:global .a) { color: red; }', TSRX_CSS_GLOBAL_NESTED_IN_PSEUDOCLASS_ERROR],
			]) {
				let thrown = /** @type {CompileError | null} */ (null);
				try {
					analyzeCss(parse_stylesheet(css));
				} catch (error) {
					thrown = /** @type {CompileError} */ (error);
				}

				expect(thrown?.code, css).toBe(DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT);
				expect(thrown?.message, css).toBe(message);
			}
		});

		it('accepts :global(...) at the start or end of a selector', () => {
			for (const css of [
				':global(.a) .b { color: red; }',
				'.a :global(.b) { color: red; }',
				'.a :global(.b) :global(.c) { color: red; }',
				'.a:not(:global(.b)) { color: red; }',
			]) {
				expect(() => analyzeCss(parse_stylesheet(css)), css).not.toThrow();
			}
		});
	});

	describe('theme and class-map classification', () => {
		it('marks a block exported through every export form as a theme', () => {
			for (const source of [
				'export const t = <style>.a {}</style>;',
				'export let t = <style>.a {}</style>;',
				'const t = <style>.a {}</style>;\nexport { t };',
				'const t = <style>.a {}</style>;\nexport { t as theme };',
				'const t = <style>.a {}</style>;\nexport default t;',
				'export default <style>.a {}</style>;',
				'export const themes = { dark: <style>.a {}</style> };',
			]) {
				const result = analyze(source);
				const [block] = result.styles.assigned;

				expect(style_errors(result), source).toEqual([]);
				expect(block.metadata.styleKind, source).toBe('theme');
				expect(block.metadata.styleExported, source).toBe(true);
				expect(block.metadata.styleApplied, source).toBeFalsy();
			}
		});

		it('marks a locally applied block as a theme', () => {
			const result = analyze(`${theme}\nfunction App() @{ <><style apply={t} /><div /></> }`);
			const [block] = result.styles.assigned;

			expect(block.metadata.styleKind).toBe('theme');
			expect(block.metadata.styleExported).toBe(false);
			expect(block.metadata.styleApplied).toBe(true);
		});

		it('marks every block applied through an array as a theme', () => {
			const result = analyze(
				'const a = <style>.a {}</style>;\nconst b = <style>.b {}</style>;\nconst c = <style>.c {}</style>;\nfunction App() @{ <><style apply={[a, b]} /><div /></> }',
			);
			const [a, b, c] = result.styles.assigned;

			expect([a, b].map((block) => block.metadata.styleKind)).toEqual(['theme', 'theme']);
			expect([a, b].map((block) => block.metadata.styleApplied)).toEqual([true, true]);
			expect(c.metadata.styleKind).toBe('class-map');
		});

		it('marks an exported and applied block as a theme once', () => {
			const result = analyze(
				'export const t = <style>.a {}</style>;\nfunction App() @{ <><style apply={t} /><div /></> }',
			);
			const [block] = result.styles.assigned;

			expect(block.metadata.styleKind).toBe('theme');
			expect(block.metadata.styleExported).toBe(true);
			expect(block.metadata.styleApplied).toBe(true);
		});

		it('marks an unexported, unapplied block as a class map', () => {
			for (const source of [
				'const t = <style>.a {}</style>;',
				'function App() @{ const t = <style>.a {}</style>; <div class={t.a} /> }',
				'use({ theme: <style>.a {}</style> });',
				`${theme}\nfunction App() @{ <div class={t.a} /> }`,
			]) {
				const result = analyze(source);
				const [block] = result.styles.assigned;

				expect(block.metadata.styleKind, source).toBe('class-map');
				expect(block.metadata.styleExported, source).toBe(false);
				expect(block.metadata.styleApplied, source).toBeFalsy();
			}
		});

		it('classifies object literal property blocks individually', () => {
			const result = analyze(
				"const themes = { dark: <style>.a {}</style>, 'light': <style>.b {}</style> };\nfunction App() @{ <><style apply={themes.light} /><div /></> }",
			);
			const [dark, light] = result.styles.assigned;

			expect(dark.metadata.styleKind).toBe('class-map');
			expect(light.metadata.styleKind).toBe('theme');
			expect(first_apply(result)[0].target).toBe(light);
		});

		it('does not classify standalone blocks', () => {
			const result = analyze(
				`${theme}\nfunction App() @{ <><style apply={t}>.b {}</style><div /></> }`,
			);
			const [standalone] = result.styles.standalone;

			expect(standalone.metadata.styleKind).toBeUndefined();
			expect(standalone.metadata.styleExported).toBeUndefined();
			expect(standalone.metadata.styleApplied).toBeUndefined();
		});
	});

	describe('apply resolution across scopes', () => {
		const t = '<style>.a { color: red; }</style>';

		/**
		 * Declaration placement × apply site. `target` is the index into
		 * `styles.assigned` the entry must resolve to (`null` for imports);
		 * `code` is the expected diagnostic instead.
		 *
		 * | placement           | site                | outcome                        |
		 * | ------------------- | ------------------- | ------------------------------ |
		 * | module scope        | same scope          | resolves                       |
		 * | module scope        | nested scope        | resolves                       |
		 * | module scope        | nested @{} scope    | resolves                       |
		 * | module scope        | before declaration  | STYLE_APPLY_BEFORE_DECLARATION |
		 * | module scope        | shadowed (value)    | STYLE_APPLY_TARGET             |
		 * | module scope        | shadowed (style)    | resolves to the inner block    |
		 * | component body      | same scope          | resolves                       |
		 * | component body      | nested @{} scope    | resolves                       |
		 * | component body      | nested function     | resolves                       |
		 * | component body      | sibling scope       | STYLE_APPLY_TARGET             |
		 * | component body      | enclosing scope     | STYLE_APPLY_TARGET             |
		 * | component body      | before declaration  | STYLE_APPLY_BEFORE_DECLARATION |
		 * | component body      | shadowed (value)    | STYLE_APPLY_TARGET             |
		 * | nested @{}          | same scope          | resolves                       |
		 * | nested @{}          | nested scope        | resolves                       |
		 * | nested @{}          | sibling @{} scope   | STYLE_APPLY_TARGET             |
		 * | nested @{}          | sibling function    | STYLE_APPLY_TARGET             |
		 * | plain function body | same scope          | resolves                       |
		 * | plain function body | nested scope        | resolves                       |
		 * | plain function body | sibling scope       | STYLE_APPLY_TARGET             |
		 * | plain function body | before declaration  | STYLE_APPLY_BEFORE_DECLARATION |
		 * | block statement     | same scope          | resolves                       |
		 * | block statement     | nested scope        | resolves                       |
		 * | block statement     | sibling scope       | STYLE_APPLY_TARGET             |
		 * | block statement     | before declaration  | STYLE_APPLY_BEFORE_DECLARATION |
		 * | exported            | nested scope        | resolves                       |
		 * | exported            | before declaration  | STYLE_APPLY_BEFORE_DECLARATION |
		 * | re-exported         | nested scope        | resolves                       |
		 * | re-exported         | before declaration  | STYLE_APPLY_BEFORE_DECLARATION |
		 * | imported namespace  | nested scope        | resolves (null target)         |
		 * | imported namespace  | before import       | resolves (imports hoist)       |
		 * | imported namespace  | shadowed (value)    | STYLE_APPLY_TARGET             |
		 *
		 * @type {Array<{ placement: string, site: string, source: string, target?: number | null, code?: string, name?: string }>}
		 */
		const matrix = [
			{
				placement: 'module scope',
				site: 'same scope',
				source: `const t = ${t};\nconst view = <><style apply={t} /><div /></>;`,
				target: 0,
			},
			{
				placement: 'module scope',
				site: 'nested scope',
				source: `const t = ${t};\nfunction App() @{ <><style apply={t} /><div /></> }`,
				target: 0,
			},
			{
				placement: 'module scope',
				site: 'nested @{} scope',
				source: `const t = ${t};\nfunction App() @{ <div>@{ <><style apply={t} /><span /></> }</div> }`,
				target: 0,
			},
			{
				placement: 'module scope',
				site: 'before declaration',
				source: `function App() @{ <><style apply={t} /><div /></> }\nconst t = ${t};`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
			},
			{
				placement: 'module scope',
				site: 'shadowed (value)',
				source: `const t = ${t};\nfunction App() @{ const t = 1; <><style apply={t} /><div /></> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'module scope',
				site: 'shadowed (style)',
				source: `const t = ${t};\nfunction App() @{ const t = <style>.b {}</style>; <><style apply={t} /><div /></> }`,
				target: 1,
			},
			{
				placement: 'component body',
				site: 'same scope',
				source: `function App() @{ const t = ${t}; <><style apply={t} /><div /></> }`,
				target: 0,
			},
			{
				placement: 'component body',
				site: 'nested @{} scope',
				source: `function App() @{ const t = ${t}; <div>@{ <><style apply={t} /><span /></> }</div> }`,
				target: 0,
			},
			{
				placement: 'component body',
				site: 'nested function',
				source: `function App() @{ const t = ${t}; const Inner = () => @{ <><style apply={t} /><span /></> }; <div>{Inner()}</div> }`,
				target: 0,
			},
			{
				placement: 'component body',
				site: 'sibling scope',
				source: `function A() @{ const t = ${t}; <div /> }\nfunction B() @{ <><style apply={t} /><div /></> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'component body',
				site: 'enclosing scope',
				source: `function A() @{ const t = ${t}; <div /> }\nconst view = <><style apply={t} /><div /></>;`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'component body',
				site: 'before declaration',
				source: `function App() @{ const view = <><style apply={t} /><div /></>; const t = ${t}; <main>{view}</main> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
			},
			{
				placement: 'component body',
				site: 'shadowed (value)',
				source: `function App() @{ const t = ${t}; const Inner = () => @{ const t = 1; <><style apply={t} /><span /></> }; <div>{Inner()}</div> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'nested @{}',
				site: 'same scope',
				source: `function App() @{ <div>@{ const t = ${t}; <><style apply={t} /><span /></> }</div> }`,
				target: 0,
			},
			{
				placement: 'nested @{}',
				site: 'nested scope',
				source: `function App() @{ <div>@{ const t = ${t}; <section>@{ <><style apply={t} /><span /></> }</section> }</div> }`,
				target: 0,
			},
			{
				placement: 'nested @{}',
				site: 'sibling @{} scope',
				source: `function App() @{ <div>@{ const t = ${t}; <span /> }@{ <><style apply={t} /><em /></> }</div> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'nested @{}',
				site: 'sibling function',
				source: `function A() @{ <div>@{ const t = ${t}; <span /> }</div> }\nfunction B() @{ <><style apply={t} /><div /></> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'plain function body',
				site: 'same scope',
				source: `function App() { const t = ${t}; return <><style apply={t} /><div /></>; }`,
				target: 0,
			},
			{
				placement: 'plain function body',
				site: 'nested scope',
				source: `function App() { const t = ${t}; const Inner = () => @{ <><style apply={t} /><div /></> }; return Inner; }`,
				target: 0,
			},
			{
				placement: 'plain function body',
				site: 'sibling scope',
				source: `function A() { const t = ${t}; return t; }\nfunction B() @{ <><style apply={t} /><div /></> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'plain function body',
				site: 'before declaration',
				source: `function App() {\n\tconst view = <><style apply={t} /><div /></>;\n\tconst t = ${t};\n\treturn view;\n}`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
			},
			{
				placement: 'block statement',
				site: 'same scope',
				source: `{ const t = ${t}; const view = <><style apply={t} /><div /></>; }`,
				target: 0,
			},
			{
				placement: 'block statement',
				site: 'nested scope',
				source: `{ const t = ${t}; function App() @{ <><style apply={t} /><div /></> } }`,
				target: 0,
			},
			{
				placement: 'block statement',
				site: 'sibling scope',
				source: `{ const t = ${t}; }\nfunction App() @{ <><style apply={t} /><div /></> }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			},
			{
				placement: 'block statement',
				site: 'before declaration',
				source: `{ const view = <><style apply={t} /><div /></>; const t = ${t}; }`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
			},
			{
				placement: 'exported',
				site: 'nested scope',
				source: `export const t = ${t};\nfunction App() @{ <><style apply={t} /><div /></> }`,
				target: 0,
			},
			{
				placement: 'exported',
				site: 'before declaration',
				source: `function App() @{ <><style apply={t} /><div /></> }\nexport const t = ${t};`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
			},
			{
				placement: 're-exported',
				site: 'nested scope',
				source: `const t = ${t};\nexport { t };\nfunction App() @{ <><style apply={t} /><div /></> }`,
				target: 0,
			},
			{
				placement: 're-exported',
				site: 'before declaration',
				source: `export { t };\nfunction App() @{ <><style apply={t} /><div /></> }\nconst t = ${t};`,
				code: DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
			},
			{
				placement: 'imported namespace',
				site: 'nested scope',
				source:
					"import * as ns from './themes.tsrx';\nfunction App() @{ <><style apply={ns.dark} /><div /></> }",
				target: null,
				name: 'ns.dark',
			},
			{
				placement: 'imported namespace',
				site: 'before import',
				source:
					"function App() @{ <><style apply={ns.dark} /><div /></> }\nimport * as ns from './themes.tsrx';",
				target: null,
				name: 'ns.dark',
			},
			{
				placement: 'imported namespace',
				site: 'shadowed (value)',
				source:
					"import * as ns from './themes.tsrx';\nfunction App() @{ const ns = {}; <><style apply={ns.dark} /><div /></> }",
				code: DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
				name: 'ns.dark',
			},
		];

		it.each(matrix)(
			'$placement block applied from $site',
			({ source, target, code, name = 't' }) => {
				const result = analyze(source);
				const errors = style_errors(result);

				if (code) {
					expect(errors).toHaveLength(1);
					expect(errors[0].code).toBe(code);
					expect(errors[0].message).toBe(
						code === DIAGNOSTIC_CODES.STYLE_APPLY_TARGET
							? tsrx_style_apply_target_error(name)
							: tsrx_style_apply_before_declaration_error(name),
					);
					expect(errors[0].loc?.start).toEqual(apply_target_loc(source, name));
					expect(first_apply(result)).toEqual([]);
					for (const block of result.styles.assigned) {
						expect(block.metadata.styleApplied).toBeFalsy();
					}
					return;
				}

				expect(errors).toEqual([]);
				const applies = first_apply(result);
				expect(applies).toHaveLength(1);

				if (target === null) {
					expect(applies[0].target).toBeNull();
					expect(applies[0].kind).toBe('import');
					expect(result.styles.assigned).toEqual([]);
					return;
				}

				const block = result.styles.assigned[/** @type {number} */ (target)];
				expect(applies[0].target).toBe(block);
				expect(applies[0].kind).toBe('local');
				expect(block.metadata.styleKind).toBe('theme');
				expect(block.metadata.styleApplied).toBe(true);
				for (const other of result.styles.assigned) {
					if (other !== block) expect(other.metadata.styleKind).toBe('class-map');
				}
			},
		);
	});

	describe('imported targets', () => {
		it('resolves named, default, and namespace imports to a null target', () => {
			for (const [source, type] of [
				[
					"import { t } from './theme.tsrx';\nfunction App() @{ <><style apply={t} /><div /></> }",
					'Identifier',
				],
				[
					"import t from './theme.tsrx';\nfunction App() @{ <><style apply={t} /><div /></> }",
					'Identifier',
				],
				[
					"import * as ns from './themes.tsrx';\nfunction App() @{ <><style apply={ns.dark} /><div /></> }",
					'MemberExpression',
				],
				[
					"import * as ns from './themes.tsrx';\nfunction App() @{ <><style apply={ns.themes.dark} /><div /></> }",
					'MemberExpression',
				],
			]) {
				const result = analyze(source);
				const [entry] = first_apply(result);

				expect(style_errors(result), source).toEqual([]);
				expect(entry.expression.type, source).toBe(type);
				expect(entry.target, source).toBeNull();
				expect(entry.kind, source).toBe('import');
				const root = entry.expression.type === 'Identifier' ? entry.expression : null;
				if (root) expect(result.scope.get(root.name)?.declaration_kind, source).toBe('import');
			}
		});

		it('mixes local and imported entries in one array in source order', () => {
			const result = analyze(
				"import { remote } from './theme.tsrx';\nconst a = <style>.a {}</style>;\nconst b = <style>.b {}</style>;\nfunction App() @{ <><style apply={[a, remote, b]} /><div /></> }",
			);
			const [a, b] = result.styles.assigned;
			const applies = first_apply(result);

			expect(applies.map((entry) => entry.target)).toEqual([a, null, b]);
			expect(applies.map((entry) => entry.kind)).toEqual(['local', 'import', 'local']);
		});
	});

	describe('analysis result', () => {
		it('lists assigned and standalone blocks in source order on program metadata', () => {
			const result = analyze(
				'const a = <style>.a {}</style>;\nfunction App() @{ <><style>.s1 {}</style><div><style>.s2 {}</style><span /></div></> }\nconst b = { dark: <style>.b {}</style> };\nexport default <style>.c {}</style>;',
			);
			const { assigned, standalone } = result.styles;

			expect(assigned.map((block) => block.children[0].source.trim())).toEqual([
				'.a {}',
				'.b {}',
				'.c {}',
			]);
			expect(standalone.map((block) => block.children[0].source.trim())).toEqual([
				'.s1 {}',
				'.s2 {}',
			]);
			expect(/** @type {{ metadata?: { styles?: unknown } }} */ (result.ast).metadata?.styles).toBe(
				result.styles,
			);
		});

		it('exposes the module scope and scope map', () => {
			const result = analyze(`${theme}\nfunction App() @{ <><style apply={t} /><div /></> }`);

			expect(result.scopes).toBeInstanceOf(Map);
			expect(result.scopes.get(result.ast)).toBe(result.scope);
			expect(result.scope.get('t')?.initial).toBe(first_apply(result)[0].target);
		});

		it('stamps styleApplies on every style block', () => {
			const result = analyze(
				`${theme}\nfunction App() @{ <><style>.s {}</style><div /></> }\nconst view = <><style apply={t} /><div /></>;`,
			);

			for (const block of [...result.styles.assigned, ...result.styles.standalone]) {
				expect(Array.isArray(block.metadata.styleApplies)).toBe(true);
			}
			expect(result.styles.standalone[0].metadata.styleApplies).toEqual([]);
			expect(result.styles.standalone[1].metadata.styleApplies).toHaveLength(1);
		});
	});

	describe('strict analysis', () => {
		it('throws a coded CompileError for every style diagnostic', () => {
			for (const [source, code] of [
				[
					'function App() @{ <><style apply={missing} /><div /></> }',
					DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
				],
				[
					'function App() @{ <><style apply={t} /><div /></> }\nconst t = <style>.a {}</style>;',
					DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
				],
				[
					'function App() @{ <><style apply>.a {}</style><div /></> }',
					DIAGNOSTIC_CODES.STYLE_APPLY_VALUE,
				],
				[
					`${theme}\nfunction App() @{ <><style apply={t} apply={t} /><div /></> }`,
					DIAGNOSTIC_CODES.STYLE_APPLY_DUPLICATE,
				],
				[
					`${theme}\nfunction App() @{ <head><style apply={t}>.b {}</style></head> }`,
					DIAGNOSTIC_CODES.STYLE_APPLY_UNSUPPORTED_HOST,
				],
				['const t = <style>.\\$class {}</style>;', DIAGNOSTIC_CODES.STYLE_RESERVED_CLASS_KEY],
				['<style>.a {}</style>;', DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE],
				[
					'function App() { return <><style>.a {}</style><div /></>; }',
					DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE,
				],
				[
					'function App() @{ <style>.a {}</style> }',
					DIAGNOSTIC_CODES.STYLE_STANDALONE_NEEDS_FRAGMENT,
				],
				[
					'function App() @{ <><style media="print">.a {}</style><div /></> }',
					DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE,
				],
			]) {
				const ast = parseModule(source, filename);
				let thrown = /** @type {CompileError | null} */ (null);
				try {
					analyzeTsrx(ast, filename);
				} catch (error) {
					thrown = /** @type {CompileError} */ (error);
				}

				expect(thrown, source).toBeInstanceOf(Error);
				expect(thrown?.code, source).toBe(code);
				expect(thrown?.type, source).toBe('fatal');
				expect(thrown?.fileName, source).toBe(filename);
			}
		});

		it('collects in editor and type-only analysis modes', () => {
			const source = 'function App() @{ <><style apply={missing} /><div /></> }';

			for (const options of [
				{ collect: true },
				{ loose: true },
				{ typeOnly: true },
				{ to_ts: true },
			]) {
				const errors = errors_with_code(
					analyze(source, options),
					DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
				);

				expect(errors, JSON.stringify(options)).toHaveLength(1);
			}
		});
	});

	describe('$class reads', () => {
		it('classifies a local block whose $class is read as a theme', () => {
			const result = analyze(
				`function App() @{
					const theme = <style>div {} .card {}</style>;
					<><div class={theme.$class} /><Child cls={theme['$class']} /></>
				}`,
			);
			const [theme] = result.styles.assigned;
			expect(theme.metadata.styleClassRead).toBe(true);
			expect(theme.metadata.styleKind).toBe('theme');
		});

		it('keeps a local block a class map when only class entries are read', () => {
			const result = analyze(
				`function App() @{
					const styles = <style>div {} .card {}</style>;
					<div class={styles.card} />
				}`,
			);
			const [styles] = result.styles.assigned;
			expect(styles.metadata.styleClassRead).toBe(false);
			expect(styles.metadata.styleKind).toBe('class-map');
		});
	});

	describe('assigned @{} blocks', () => {
		it('resolves a theme declared in the setup of an assigned code block', () => {
			const result = analyze(
				`const something = @{
					const theme = <style>.dark {}</style>;
					<>
						<style apply={theme}>.card {}</style>
						<div class="card" />
					</>
				};`,
			);

			expect(style_errors(result)).toEqual([]);
			const [theme] = result.styles.assigned;
			const [applier] = result.styles.standalone;
			expect(theme.metadata.styleKind).toBe('theme');
			expect(applier.metadata.styleApplies?.[0].target).toBe(theme);
			expect(applier.metadata.styleApplies?.[0].kind).toBe('local');
		});

		it('keeps a theme of an assigned block invisible to a sibling assigned block', () => {
			const result = analyze(
				`const first = @{ const theme = <style>.a {}</style>; <div /> };
				const second = @{ <><style apply={theme} /><div /></> };`,
			);

			expect(style_errors(result).map((error) => error.code)).toEqual([
				DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
			]);
		});
	});

	describe('@tsrx-ignore', () => {
		it('suppresses a style diagnostic on the next line', () => {
			const result = analyze(
				'function App() @{\n\t<>\n\t\t// @tsrx-ignore\n\t\t<style apply={missing} />\n\t\t<div />\n\t</>\n}',
			);

			expect(result.errors).toEqual([]);
			expect(first_apply(result)).toEqual([]);
		});

		it('suppresses with @tsrx-expect-error and reports elsewhere', () => {
			const result = analyze(
				'function App() @{\n\t<>\n\t\t// @tsrx-expect-error\n\t\t<style apply={missing} />\n\t\t<style apply={other} />\n\t\t<div />\n\t</>\n}',
			);
			const errors = style_errors(result);

			expect(errors).toHaveLength(1);
			expect(errors[0].message).toBe(tsrx_style_apply_target_error('other'));
		});

		it('does not suppress from a comment that is not directly above', () => {
			const result = analyze(
				'function App() @{\n\t<>\n\t\t// @tsrx-ignore\n\n\t\t<style apply={missing} />\n\t\t<div />\n\t</>\n}',
			);

			expect(style_errors(result)).toHaveLength(1);
		});
	});
});
