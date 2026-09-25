/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
	analyzeTsrx,
	createJsxTransform,
	createVolarMappingsResult,
	parseModule,
} from '../../src/index.js';

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'type-only-jsx-analysis-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
		refProp: 'test-platform/ref',
	},
	jsx: {
		rewriteClassAttr: false,
		classAttrName: 'class',
		multiRefStrategy: 'array',
	},
	validation: { requireUseServerForAwait: false },
};

/**
 * Binds host spreads beside a ref in place, as React, Preact, and Hono do.
 * @type {JsxPlatform}
 */
const IN_PLACE_PLATFORM = {
	...PLATFORM,
	jsx: { ...PLATFORM.jsx, hostSpreadRefBinding: 'in-place' },
};

/**
 * Mirrors a target package's public compiler pipeline.
 * @param {string} source
 * @param {boolean} [type_only]
 * @param {JsxPlatform} [platform]
 */
function compile_source(source, type_only = true, platform = PLATFORM) {
	/** @type {CompileError[]} */
	const errors = [];
	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	const filename = 'App.tsrx';
	const ast = parseModule(source, filename, {
		collect: true,
		loose: true,
		preserveParens: true,
		keywordTokens: true,
		errors,
		comments,
	});
	analyzeTsrx(ast, filename, {
		collect: true,
		loose: true,
		typeOnly: type_only,
		errors,
		comments,
	});
	const transformed = createJsxTransform(platform)(ast, source, filename, {
		collect: true,
		loose: true,
		typeOnly: type_only,
		errors,
		comments,
	});
	const result = createVolarMappingsResult({
		ast: transformed.ast,
		ast_from_source: ast,
		source,
		generated_code: transformed.code,
		source_map: transformed.map,
		errors,
	});
	return { ...transformed, ...result, errors };
}

// Raw CSS in `<style>` is TSRX template syntax, so the blocks sit in a `@{ … }`
// body; both are items of the same fragment children list and share one scope.
const SPLIT_STYLE_SOURCE =
	'export function Split(props: { active: boolean }) @{\n' +
	'\t<>\n' +
	"\t\t<section class={['mailbox', { active: props.active }]}>{'hi'}</section>\n" +
	'\t\t<style>\n' +
	'\t\t\t.mailbox { color: rgb(10, 20, 30); }\n' +
	'\t\t</style>\n' +
	'\t\t<style>\n' +
	'\t\t\t.active { background-color: rgb(40, 50, 60); }\n' +
	'\t\t</style>\n' +
	'\t</>\n' +
	'}\n';

const SPLIT_STYLE_DEFINITION_SOURCE =
	'export function Split() @{\n' +
	'\t<>\n' +
	'\t\t<section class="mailbox">one</section>\n' +
	'\t\t<aside class="active">two</aside>\n' +
	'\t\t<style>.mailbox { color: red; }</style>\n' +
	'\t\t<style>.active { color: blue; }</style>\n' +
	'\t</>\n' +
	'}\n';

const REF_SPREAD_PROPS_TYPE =
	'type Props = {\n' +
	'\tnodeRef: (node: SVGTextElement | null) => void;\n' +
	'\trest: { x?: number };\n' +
	'\tmore: { y?: number };\n' +
	'\trows: number[];\n' +
	'\tshow: boolean;\n' +
	'};\n\n';

/** @type {Array<[string, string]>} */
const REF_SPREAD_POSITIONS = [
	['return statement', 'return <text ref={props.nodeRef} {...props.rest} />;'],
	[
		'nested in a returned element',
		'return <svg><text ref={props.nodeRef} {...props.rest} /></svg>;',
	],
	[
		'declarator init',
		'const label = <text ref={props.nodeRef} {...props.rest} />;\n\treturn <svg>{label}</svg>;',
	],
	[
		'ternary arm of a return',
		'return props.show ? <text ref={props.nodeRef} {...props.rest} /> : null;',
	],
	[
		'ternary arm inside a JSX hole',
		'return <svg>{props.show ? <text ref={props.nodeRef} {...props.rest} /> : null}</svg>;',
	],
	[
		'logical operand inside a JSX hole',
		'return <svg>{props.show && <text ref={props.nodeRef} {...props.rest} />}</svg>;',
	],
	[
		'callback body',
		'return <svg>{props.rows.map((row: number) => <text key={row} ref={props.nodeRef} {...props.rest} />)}</svg>;',
	],
	['JSX expression value', 'return <svg>{<text ref={props.nodeRef} {...props.rest} />}</svg>;'],
	['array literal element', 'return <svg>{[<text ref={props.nodeRef} {...props.rest} />]}</svg>;'],
	[
		'element with two spreads',
		'return <svg>{props.show ? <text ref={props.nodeRef} {...props.rest} {...props.more} /> : null}</svg>;',
	],
];

/** @type {Array<[string, string]>} */
const NATIVE_TEMPLATE_POSITIONS = [
	[
		'native @if directive',
		'<svg>@if (props.show) { <text ref={props.nodeRef} {...props.rest} /> }</svg>',
	],
	[
		'plain-JS callback inside a native template',
		'<svg>{props.rows.map((row: number) => <text key={row} ref={props.nodeRef} {...props.rest} />)}</svg>',
	],
];

/** @returns {Array<[string, string]>} */
function ref_spread_modules() {
	return [
		...REF_SPREAD_POSITIONS.map(
			([name, body]) =>
				/** @type {[string, string]} */ ([
					name,
					`${REF_SPREAD_PROPS_TYPE}export function Chart(props: Props) {\n\t${body}\n}\n`,
				]),
		),
		[
			'concise arrow body',
			REF_SPREAD_PROPS_TYPE +
				'export const Chart = (props: Props) => <text ref={props.nodeRef} {...props.rest} />;\n',
		],
		...NATIVE_TEMPLATE_POSITIONS.map(
			([name, body]) =>
				/** @type {[string, string]} */ ([
					name,
					`${REF_SPREAD_PROPS_TYPE}export function Chart(props: Props) @{\n\t${body}\n}\n`,
				]),
		),
	];
}

/**
 * The runtime output lowers host ref/spreads like the type-only print, except
 * that an in-place platform declares the binding without an initializer.
 * @type {Array<[string, boolean, JsxPlatform]>}
 */
const REF_SPREAD_OUTPUTS = [
	['type-only', true, PLATFORM],
	['runtime', false, PLATFORM],
	['runtime, bound in place', false, IN_PLACE_PLATFORM],
];

/**
 * Generator positions whose lowering wraps an authored `yield` in a generated
 * closure: a host ref/spread's setup binding, or a directive's IIFE.
 * @type {Array<[string, string]>}
 */
const GENERATOR_POSITIONS = [
	[
		'ternary arm of a return',
		'return props.show ? <text ref={props.nodeRef} {...props.rest} data-label={yield 1} /> : null;',
	],
	[
		'logical operand of a return',
		'return props.show || <text ref={props.nodeRef} {...props.rest} data-label={yield 1} />;',
	],
	[
		'declarator init',
		'const label = <text ref={props.nodeRef} {...props.rest} data-label={yield 1} />;\n\treturn label;',
	],
	[
		'@switch case',
		'return <svg>{@switch (props.rows.length) { @case 1: { <text data-label={yield 1} /> } }}</svg>;',
	],
	[
		'@if branch with setup statements',
		'return <svg>{@if (props.show) { const label: string = yield 1; <text data-label={label} /> }}</svg>;',
	],
	[
		'host ref/spread inside a @switch case',
		'return <svg>{@switch (props.rows.length) { @case 1: { <g>{props.show ? <text ref={props.nodeRef} {...props.rest} data-label={yield 1} /> : null}</g> } }}</svg>;',
	],
];

/**
 * @param {string} body
 * @returns {string}
 */
function generator_module(body) {
	return (
		REF_SPREAD_PROPS_TYPE +
		`export function* chart(props: Props): Generator<number, unknown, string> {\n\t${body}\n}\n`
	);
}

/**
 * @param {string} code
 * @returns {ts.SourceFile}
 */
function parse_generated(code) {
	return ts.createSourceFile('Chart.tsx', code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
}

describe('type-only JSX analysis', () => {
	it('keeps multiple scoped style blocks analyzable and compiles them as one scope', () => {
		const result = compile_source(SPLIT_STYLE_SOURCE);
		expect(result.errors).toEqual([]);
		expect(result.cssMappings).toHaveLength(2);
		expect(result.code).toContain('Split');
		expect(result.code).not.toContain('rgb(10, 20, 30)');
		expect(result.code).not.toContain('rgb(40, 50, 60)');

		// Several blocks in one scope share the scope hash (RFC: multiple
		// blocks per scope); the former "one style tag" error is gone.
		const runtime = compile_source(SPLIT_STYLE_SOURCE, false);
		expect(runtime.errors).toEqual([]);
		expect(runtime.cssHash?.split(' ')).toHaveLength(1);
	});

	it('maps classes to the split style block that defines them', () => {
		const result = compile_source(SPLIT_STYLE_DEFINITION_SOURCE);
		const css_mapping_ids = result.cssMappings.map(
			(mapping) => mapping.data.customData?.embeddedId,
		);
		const active_offset =
			SPLIT_STYLE_DEFINITION_SOURCE.indexOf('class="active"') + 'class="'.length;
		const active_mapping = result.mappings.find(
			(mapping) =>
				mapping.sourceOffsets[0] === active_offset && mapping.data.customData?.definition,
		);
		const active_definition = active_mapping?.data.customData?.definition;

		expect(css_mapping_ids).toHaveLength(2);
		expect(
			typeof active_definition === 'object' ? active_definition.location?.embeddedId : undefined,
		).toBe(css_mapping_ids[1]);
	});

	it('maps a class containing a no-break space as one class token', () => {
		const source =
			'export function Card() @{\n' +
			'\t<>\n' +
			'\t\t<div class="a\u00a0b c">one</div>\n' +
			'\t\t<style>.a\\a0 b { color: red; } .c { color: blue; }</style>\n' +
			'\t</>\n' +
			'}\n';
		const result = compile_source(source);
		const class_start = source.indexOf('class="') + 'class="'.length;
		const class_end = source.indexOf('"', class_start);
		const class_definitions = result.mappings
			.filter(
				(mapping) =>
					mapping.data.customData?.definition &&
					mapping.sourceOffsets[0] >= class_start &&
					mapping.sourceOffsets[0] < class_end,
			)
			.map((mapping) => [mapping.sourceOffsets[0] - class_start, mapping.lengths[0]]);

		expect(class_definitions).toEqual([
			[0, 3],
			[4, 1],
		]);
	});

	it.each(REF_SPREAD_OUTPUTS)(
		'declares generated host ref/spread bindings in every element position (%s)',
		(_output, type_only, platform) => {
			const root = mkdtempSync(join(tmpdir(), 'tsrx-ref-spread-'));
			try {
				const files = ref_spread_modules().map(([name, source], index) => {
					const compiled = compile_source(source, type_only, platform);
					expect(compiled.errors).toEqual([]);
					const file = join(root, `Chart${index}.tsx`);
					writeFileSync(file, compiled.code);
					return { name, file };
				});

				const program = ts.createProgram({
					rootNames: files.map(({ file }) => file),
					options: {
						jsx: ts.JsxEmit.Preserve,
						module: ts.ModuleKind.ESNext,
						moduleResolution: ts.ModuleResolutionKind.Bundler,
						noEmit: true,
						skipLibCheck: true,
						strict: true,
						target: ts.ScriptTarget.ESNext,
					},
				});
				const undefined_names = ts
					.getPreEmitDiagnostics(program)
					.filter((diagnostic) => diagnostic.code === 2304)
					.map((diagnostic) => {
						const position = files.find(({ file }) => file === diagnostic.file?.fileName);
						return `${position?.name ?? diagnostic.file?.fileName}: ${ts.flattenDiagnosticMessageText(
							diagnostic.messageText,
							' ',
						)}`;
					});
				expect(undefined_names).toEqual([]);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	it.each(REF_SPREAD_OUTPUTS)(
		'lowers each host ref/spread exactly once (%s)',
		(_output, type_only, platform) => {
			for (const [name, source] of ref_spread_modules()) {
				const compiled = compile_source(source, type_only, platform);
				const generated = ts.createSourceFile(
					'Chart.tsx',
					compiled.code,
					ts.ScriptTarget.ESNext,
					true,
					ts.ScriptKind.TSX,
				);
				/** @type {ts.ArrayLiteralExpression[]} */
				const ref_arrays = [];
				/** @type {ts.CallExpression[]} */
				const normalize_calls = [];
				/** @param {ts.Node} node */
				const visit = (node) => {
					if (
						ts.isJsxAttribute(node) &&
						ts.isIdentifier(node.name) &&
						node.name.text === 'ref' &&
						node.initializer &&
						ts.isJsxExpression(node.initializer) &&
						node.initializer.expression &&
						ts.isArrayLiteralExpression(node.initializer.expression)
					) {
						ref_arrays.push(node.initializer.expression);
					}
					if (
						ts.isCallExpression(node) &&
						ts.isIdentifier(node.expression) &&
						node.expression.text === '__normalize_spread_props_for_ref_attr'
					) {
						normalize_calls.push(node);
					}
					ts.forEachChild(node, visit);
				};
				visit(generated);

				expect(ref_arrays, name).toHaveLength(1);
				expect(
					ref_arrays[0].elements.filter((element) => ts.isArrayLiteralExpression(element)),
					name,
				).toEqual([]);
				const authored_spreads = source.match(/{\.\.\./g)?.length ?? 0;
				expect(normalize_calls, name).toHaveLength(authored_spreads);
			}
		},
	);

	it.each(REF_SPREAD_OUTPUTS)(
		'declares the binding of a host inside a spread argument within its callback (%s)',
		(_output, type_only, platform) => {
			// A host in a callback in a spread argument: its binding must stay in
			// the callback that declares `row`.
			const svg =
				'<svg {...{ children: props.rows.map((row: number) => <text key={row} ref={props.nodeRef} {...props.rest} />) }} />';
			for (const [name, source] of [
				[
					'concise arrow body',
					`${REF_SPREAD_PROPS_TYPE}export const Chart = (props: Props) => ${svg};\n`,
				],
				[
					'declarator init',
					`${REF_SPREAD_PROPS_TYPE}export function Chart(props: Props) {\n\tconst chart = ${svg};\n\treturn chart;\n}\n`,
				],
			]) {
				const compiled = compile_source(source, type_only, platform);
				expect(compiled.errors, name).toEqual([]);
				const generated = ts.createSourceFile(
					'Chart.tsx',
					compiled.code,
					ts.ScriptTarget.ESNext,
					true,
					ts.ScriptKind.TSX,
				);
				/** @type {ts.VariableDeclaration[]} */
				const bindings = [];
				/** @param {ts.Node} node */
				const visit = (node) => {
					if (
						ts.isVariableDeclaration(node) &&
						ts.isIdentifier(node.name) &&
						node.name.text.includes('spread_props')
					) {
						bindings.push(node);
					}
					ts.forEachChild(node, visit);
				};
				visit(generated);

				expect(bindings, name).toHaveLength(1);
				/** @type {ts.Node | undefined} */
				let scope = bindings[0];
				while (
					scope &&
					!(
						ts.isArrowFunction(scope) &&
						scope.parameters.some((parameter) => parameter.name.getText() === 'row')
					)
				) {
					scope = scope.parent;
				}
				expect(scope, name).toBeDefined();
			}
		},
	);

	describe('generated closures in a generator (#246)', () => {
		it.each(REF_SPREAD_OUTPUTS)(
			'keeps an authored yield inside a generator in every position (%s)',
			(_output, type_only, platform) => {
				const root = mkdtempSync(join(tmpdir(), 'tsrx-generator-'));
				try {
					const files = GENERATOR_POSITIONS.map(([name, body], index) => {
						const compiled = compile_source(generator_module(body), type_only, platform);
						expect(compiled.errors, name).toEqual([]);
						expect(compiled.code, name).toContain('yield* (function* () {');
						const file = join(root, `Chart${index}.tsx`);
						writeFileSync(file, compiled.code);
						return { name, file };
					});

					const program = ts.createProgram({
						rootNames: files.map(({ file }) => file),
						options: {
							jsx: ts.JsxEmit.Preserve,
							module: ts.ModuleKind.ESNext,
							moduleResolution: ts.ModuleResolutionKind.Bundler,
							noEmit: true,
							skipLibCheck: true,
							strict: true,
							target: ts.ScriptTarget.ESNext,
						},
					});
					// TS1163: a `yield` outside a generator body. TS7057: a `yield`
					// result that the annotated generator's `next` type no longer
					// reaches.
					const yield_errors = ts
						.getPreEmitDiagnostics(program)
						.filter((diagnostic) => diagnostic.code === 1163 || diagnostic.code === 7057)
						.map((diagnostic) => {
							const position = files.find(({ file }) => file === diagnostic.file?.fileName);
							return `${position?.name}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
						});
					expect(yield_errors).toEqual([]);
				} finally {
					rmSync(root, { recursive: true, force: true });
				}
			},
		);

		it.each(REF_SPREAD_OUTPUTS)(
			'passes this and arguments on to the generated generator (%s)',
			(_output, type_only, platform) => {
				const element = '<text ref={props.nodeRef} {...props.rest} data-label={yield VALUE} />';
				const this_source =
					REF_SPREAD_PROPS_TYPE +
					'export class Chart {\n' +
					'\tlabel = 1;\n' +
					`\t*render(props: Props) {\n\t\treturn props.show ? ${element.replace('VALUE', 'this.label')} : null;\n\t}\n` +
					'}\n';
				const arguments_source = generator_module(
					`return props.show ? ${element.replace('VALUE', 'arguments.length')} : null;`,
				);

				const with_this = compile_source(this_source, type_only, platform);
				const with_arguments = compile_source(arguments_source, type_only, platform);
				expect(with_this.errors).toEqual([]);
				expect(with_arguments.errors).toEqual([]);
				// The type-only print keeps the direct call, which TypeScript types the
				// delegated `yield` results from; nothing runs it.
				expect(with_this.code).toMatch(type_only ? /\}\)\(\)/ : /\}\)\.call\(this\)/);
				expect(with_arguments.code).toMatch(
					type_only ? /\}\)\(\)/ : /\}\)\.apply\(this, arguments\)/,
				);
			},
		);

		it('delegates to a closure made both async and a generator without awaiting it', () => {
			const source = generator_module(
				'return props.show ? <text ref={props.nodeRef} {...props.rest} data-label={yield await props.rows[0]} /> : null;',
			)
				.replace('export function* chart', 'export async function* chart')
				.replace('Generator<', 'AsyncGenerator<');
			const compiled = compile_source(source, false, IN_PLACE_PLATFORM);
			expect(compiled.errors).toEqual([]);
			expect(compiled.code).toContain('? yield* (async function* () {');
			expect(compiled.code).not.toContain('await (');
		});

		it('reports super in a closure that becomes a generator at the authored super', () => {
			const source =
				REF_SPREAD_PROPS_TYPE +
				'class Base { get label() { return 1; } }\n' +
				'export class Chart extends Base {\n' +
				'\t*render(props: Props) {\n' +
				'\t\treturn props.show ? <text ref={props.nodeRef} {...props.rest} data-label={yield super.label} /> : null;\n' +
				'\t}\n' +
				'}\n';
			const compiled = compile_source(source, true);
			expect(compiled.errors.map((error) => [error.message, error.pos])).toEqual([
				[expect.stringContaining('does not support `super` here'), source.indexOf('super.label')],
			]);
		});

		it('reports a yield in a @for body at the authored yield', () => {
			const source = generator_module(
				'return <svg>{@for (const row of props.rows) { <text data-label={yield row} /> }}</svg>;',
			);
			const compiled = compile_source(source, true);
			expect(compiled.errors.map((error) => [error.message, error.pos])).toEqual([
				[expect.stringContaining('does not support `yield` here'), source.indexOf('yield row')],
			]);
		});
	});
});
