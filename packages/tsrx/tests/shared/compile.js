import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES, TS_ERRORS, TSRX_ERRORS } from '../../src/diagnostics.js';
import { parseModule } from '../../src/index.js';
import { find_exact_mapping } from '../../src/source-map-utils.js';
import { error_with } from './errors.js';
import { runSharedScopedStyleTests } from './scoped-styles.js';
import { runSharedScopedStyleConformanceTests } from './scoped-styles-conformance.js';

/** @import { CodeMapping, CompileDiagnosticsHarness, CompileHarness } from '../../types/index' */

/**
 * Each first-party target's `jsx.classValue`.
 *
 * @type {Record<string, 'text' | 'text-true' | 'text-both' | 'list'>}
 */
const CLASS_VALUE_KINDS = {
	react: 'text',
	preact: 'text-true',
	// The shared tests compile Hono for its server renderer.
	hono: 'text-both',
	solid: 'list',
	vue: 'list',
};

/**
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function count_substring(haystack, needle) {
	return haystack.split(needle).length - 1;
}

/**
 * @param {{ errors: Array<{ code?: string }> }} result
 * @returns {Array<string | undefined>}
 */
function diagnostic_codes(result) {
	return result.errors.map((error) => error.code);
}

/** A class with static, static readonly and instance index signatures. */
const STATIC_INDEX_SIGNATURES = `export class Registry {
	static [key: string]: number;
	static readonly [index: number]: string;
	[symbol: symbol]: boolean;
}
`;

/**
 * esrap writes `readonly` but not `static` before an index signature (#1253).
 * @param {string} code
 */
function expect_static_index_signatures(code) {
	expect(code).toContain('static [key: string]: number');
	expect(code).toContain('static readonly [index: number]: string');
	expect(code).not.toContain('static [symbol: symbol]');
	expect(code).not.toMatch(/static\s+static/);
	expect(virtual_parse_diagnostics(code)).toEqual([]);
}

/**
 * Markup a loose compile recovers and reports (#978): its label, the source,
 * the error, and the closing tag the editor's code adds.
 * @type {Array<[label: string, source: string, error: { code: string }, closing: string]>}
 */
const BROKEN_MARKUP = [
	['an unclosed tag', 'function App() @{\n\t<div>hi\n}', TSRX_ERRORS.UNCLOSED_TAG, '</div>'],
	[
		'a mismatched closing tag',
		'function App() @{\n\t<div><span></div>\n}',
		TSRX_ERRORS.MISMATCHED_CLOSING_TAG,
		'</span>',
	],
	[
		'an unclosed returned tag',
		'function App() {\n\treturn <div>;\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</div>',
	],
	// In an expression container, where a static element is hoisted out of the
	// walk that closes the tag (#1304, #1307).
	[
		'an unclosed tag in braces',
		'function App() {\n\treturn <div>{<b>}</div>;\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</b>',
	],
	[
		'an unclosed tag in braces in a template',
		'function App() @{\n\t<div>{<b>}</div>\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</b>',
	],
	[
		'an unclosed fragment in braces',
		'function App() {\n\treturn <div>{<>}</div>;\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</>',
	],
	[
		'an unclosed fragment in braces in a template',
		'function App() @{\n\t<div>{<>}</div>\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</>',
	],
	[
		'an unclosed tag in an attribute value',
		'function App() {\n\treturn <div title={<b>}></div>;\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</b>',
	],
	[
		'an unclosed fragment in an attribute value',
		'function App() {\n\treturn <div title={<>}></div>;\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</>',
	],
	[
		'an unclosed dynamic tag in braces',
		'function App({ Tag }) @{\n\t<div>{<{Tag}>}</div>\n}',
		TSRX_ERRORS.UNCLOSED_TAG,
		'</TsrxDynamic>',
	],
];

/**
 * Parse generated target output as TSX and return syntax diagnostics. Target
 * compilers intentionally leave TypeScript and JSX for downstream tooling, so
 * this checks the same grammar boundary their virtual modules must satisfy.
 *
 * @param {string} code
 * @returns {readonly ts.Diagnostic[]}
 */
function virtual_parse_diagnostics(code) {
	const source_file = ts.createSourceFile(
		'virtual.tsx',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	return /** @type {ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }} */ (source_file)
		.parseDiagnostics;
}

/**
 * The syntax tree TypeScript reads from TSX code, as nested node kinds with
 * their names and text, leaving out parentheses and imports. Code with the
 * same shape as its source has the same meaning.
 *
 * @param {string} code
 * @returns {string}
 */
function tsx_shape(code) {
	const source_file = ts.createSourceFile(
		'shape.tsx',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	/**
	 * @param {ts.Node} node
	 * @returns {string}
	 */
	const shape = (node) => {
		if (ts.isParenthesizedExpression(node)) return shape(node.expression);
		/** @type {string[]} */
		const children = [];
		ts.forEachChild(node, (child) => {
			children.push(shape(child));
		});
		const text = 'text' in node && typeof node.text === 'string' ? ` ${node.text}` : '';
		return `${ts.SyntaxKind[node.kind]}${text}(${children.join(' ')})`;
	};
	return source_file.statements
		.filter((statement) => !ts.isImportDeclaration(statement))
		.map(shape)
		.join('\n');
}

/**
 * An element or fragment in each position where TSX needs it in parentheses.
 * TSX reads an element only as a unary operand, not as the object of a
 * member, call, tagged-template, `!` or type-argument suffix, a `new` callee
 * or a superclass. And it reads a `<` right after an element as the start of
 * another element, so an element that ends the left operand of `<` needs
 * them too.
 * @type {Array<[string, string]>}
 */
const ELEMENT_OPERAND_CASES = [
	[
		'a member access',
		'export function f(x: unknown) {\n\treturn (<b>ok</b>).type === x ? 1 : 2;\n}',
	],
	['a fragment member access', 'export const value = (<></>).props;'],
	['an optional member access', 'export const value = (<b />)?.props;'],
	['an index', 'export const value = (<b />)[0];'],
	['a call', 'export const value = (<b />)();'],
	['an optional call', 'export const value = (<b />)?.();'],
	['a `new` callee', 'export const value = new (<b />)();'],
	['a tagged template', 'export const value = (<b />)`t`;'],
	['a non-null assertion', 'export const value = (<b />)!;'],
	['an instantiation expression', 'export const value = (<b />)<string>;'],
	['a superclass', 'export class A extends (<div />) {}'],
	['a class expression superclass', 'export const B = class extends (<></>) {};'],
	['the left operand of `<`', 'export const value = (<b />) < x;'],
	['a fragment as the left operand of `<`', 'export const value = (<></>) < x;'],
	['the end of the left operand of `<`', 'export const value = x + (<b />) < y;'],
	['the end of a nested left operand of `<`', 'export const value = x < y * (<b />) < z;'],
	['the end of an exponent before `<`', 'export const value = x ** y ** (<b />) < z;'],
];

/**
 * @param {string} code
 * @param {ts.CompilerOptions} [extra_options]
 * @returns {readonly ts.Diagnostic[]}
 */
function virtual_semantic_diagnostics(code, extra_options = {}) {
	const file_name = '/virtual-platform.tsx';
	const options = {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		noEmit: true,
		noLib: true,
		...extra_options,
	};
	const source_file = ts.createSourceFile(
		file_name,
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const base_host = ts.createCompilerHost(options);
	const host = {
		...base_host,
		fileExists: (/** @type {string} */ name) => name === file_name,
		readFile: (/** @type {string} */ name) => (name === file_name ? code : undefined),
		getSourceFile: (/** @type {string} */ name) => (name === file_name ? source_file : undefined),
		getCurrentDirectory: () => '/',
	};
	const program = ts.createProgram([file_name], options, host);
	return program.getSemanticDiagnostics(source_file);
}

/**
 * Shared compile/editor diagnostics. These do not assert source-map structure;
 * they only verify that editor-facing compile entry points collect diagnostics.
 *
 * @param {CompileDiagnosticsHarness} harness
 */
export function runSharedCompileDiagnosticsTests({ compile_to_volar_mappings, name }) {
	describe(`[${name}] class index signatures in virtual code`, () => {
		it('keeps static on a class index signature', () => {
			expect_static_index_signatures(
				compile_to_volar_mappings(STATIC_INDEX_SIGNATURES, 'App.tsrx', { loose: true }).code,
			);
		});
	});

	describe(`[${name}] control flow followed by another output node`, () => {
		// A code block renders one node. The parser reports the second output node and
		// keeps the control flow before it among the setup statements, which the loose
		// compile used to print unlowered: it threw instead of reporting the error (#197).
		it.each([
			['@for', '@for (const item of items) {\n\t\t<li>{item}</li>\n\t}'],
			['@if', '@if (items.length) {\n\t\t<li>{items[0]}</li>\n\t}'],
			[
				'@switch',
				'@switch (items.length) {\n\t\t@case 1: {\n\t\t\t<li>{items[0]}</li>\n\t\t}\n\t}',
			],
			['@try', '@try {\n\t\t<li>{items[0]}</li>\n\t} @catch (error) {\n\t\t<b />\n\t}'],
		])('reports the fragment error after %s and keeps its body', (_directive, control_flow) => {
			for (const source of [
				`export function List({ items }: { items: string[] }) @{\n\t${control_flow}\n\t<p>done</p>\n}\n`,
				`export const List = ({ items }: { items: string[] }) => @{\n\t${control_flow}\n\t<p>done</p>\n};\n`,
				`export function List({ items }: { items: string[] }) @{\n\t<ul>@{\n\t${control_flow}\n\t<p>done</p>\n\t}</ul>\n}\n`,
			]) {
				const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx', {
					loose: true,
				});

				expect(
					errors.map((error) => [error.code, error.pos]),
					source,
				).toContainEqual([TSRX_ERRORS.CODE_BLOCK_SINGLE_OUTPUT.code, source.indexOf('<p>done')]);
				expect(errors.filter((error) => error.type === 'fatal')).toEqual([]);
				expect(virtual_parse_diagnostics(code), code).toEqual([]);
				const li = source.indexOf('li>');
				expect(mappings.some((mapping) => mapping.sourceOffsets[0] === li)).toBe(true);
			}
		});
	});

	describe(`[${name}] virtual code for syntax newer than ES2022`, () => {
		it('keeps a hashbang as the first line and maps the code after it', () => {
			const source = `#!/usr/bin/env node
/** Docs */
export function App() @{
	using handle: Disposable = open();
	<div>{handle.name}</div>
}
`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(code.startsWith('#!/usr/bin/env node\n')).toBe(true);
			expect(count_substring(code, '/usr/bin/env node')).toBe(1);
			expect(code).toContain('using handle: Disposable = open();');
			expect(virtual_parse_diagnostics(code)).toEqual([]);

			const handle = source.indexOf('handle');
			const mapping = mappings.find((candidate) => candidate.sourceOffsets[0] === handle);
			expect(mapping).toBeDefined();
			const generated = /** @type {NonNullable<typeof mapping>} */ (mapping).generatedOffsets[0];
			expect(code.slice(generated, generated + 'handle'.length)).toBe('handle');
		});

		it('keeps and maps the import attributes of import types', () => {
			const source = `type Data = import('./data.json', { with: { type: 'json' } }).Data;
export function App() @{
	const mode: import('pkg', { with: { 'resolution-mode': 'require' } }).Mode = load();
	<div>{String(mode)}</div>
}
`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(code).toContain("import('./data.json', { with: { type: 'json' } }).Data");
			expect(code).toContain("import('pkg', { with: { 'resolution-mode': 'require' } }).Mode");
			expect(virtual_parse_diagnostics(code)).toEqual([]);

			const attributes = source.indexOf('{ with');
			// The options object maps its start and its end as the points of one
			// mapping, which hold the object's whole printed text between them.
			const options = "{ with: { type: 'json' } }";
			const whole = mappings.find(
				(candidate) =>
					candidate.sourceOffsets[0] === attributes &&
					candidate.sourceOffsets[1] === attributes + options.length,
			);
			expect(whole, options).toBeDefined();
			const [from, to] = /** @type {NonNullable<typeof whole>} */ (whole).generatedOffsets;
			expect(code.slice(from, to)).toBe(options);
			for (const text of ['with', 'type', "'json'", "'resolution-mode'", "'require'"]) {
				const start = source.indexOf(text, attributes);
				const mapping = mappings.find((candidate) => candidate.sourceOffsets[0] === start);
				expect(mapping, text).toBeDefined();
				const { generatedOffsets, generatedLengths, lengths } =
					/** @type {NonNullable<typeof mapping>} */ (mapping);
				const length = generatedLengths?.[0] ?? lengths[0];
				expect(code.slice(generatedOffsets[0], generatedOffsets[0] + length)).toBe(text);
			}
		});
	});

	describe(`[${name}] comments in virtual code`, () => {
		/**
		 * Whether a verification mapping covers exactly `text`, which starts at
		 * `offset` in the source, and maps it to the same generated text.
		 * @param {{ code: string, mappings: CodeMapping[] }} result
		 * @param {number} offset
		 * @param {string} text
		 */
		const is_mapped = (result, offset, text) =>
			result.mappings.some(
				(mapping) =>
					mapping.sourceOffsets[0] === offset &&
					mapping.lengths[0] === text.length &&
					mapping.data.verification &&
					result.code.slice(
						mapping.generatedOffsets[0],
						mapping.generatedOffsets[0] + (mapping.generatedLengths?.[0] ?? mapping.lengths[0]),
					) === text,
			);

		it.each(['/** */', '/** Docs. */', '/**\n * Docs.\n * @param a The value.\n */'])(
			'prints the JSDoc comment %j as written',
			(comment) => {
				const source = `${comment}\nexport function A({ a }: { a: number }) @{\n\t<p>{a}</p>\n}\n`;
				const result = compile_to_volar_mappings(source, 'App.tsrx');

				expect(result.errors).toEqual([]);
				expect(result.code).toContain(`${comment}\nexport `);
				expect(is_mapped(result, 0, comment)).toBe(true);
			},
		);

		it('keeps a block TypeScript directive on the line before its statement', () => {
			const source = `/* @ts-expect-error */
export const a: number = 'bad';
/*@ts-ignore*/
export const b: number = 'bad';
export class K {
	/* @ts-ignore */
	v: number = 'bad';
}
/* plain */
export const c = 1;
`;
			const result = compile_to_volar_mappings(source, 'App.tsrx');

			expect(result.errors).toEqual([]);
			expect(result.code).toContain("/* @ts-expect-error */\nexport const a: number = 'bad';");
			expect(result.code).toContain("/*@ts-ignore*/\nexport const b: number = 'bad';");
			expect(result.code).toMatch(/\/\* @ts-ignore \*\/\n\s*v: number = 'bad';/);
			expect(result.code).not.toContain('plain');
			for (const comment of ['/* @ts-expect-error */', '/*@ts-ignore*/', '/* @ts-ignore */']) {
				expect(is_mapped(result, source.indexOf(comment), comment), comment).toBe(true);
			}
		});

		it('keeps the comments around a directive on the lines where they are written', () => {
			// TypeScript applies a directive to the first line after it that is not
			// blank or a line comment, so a block comment after one ends its reach.
			const source = `declare const bad: string;
/* @ts-expect-error */
/* plain */
export const a: number = bad;
// @ts-expect-error
/* plain */
export const b: number = bad;
/* @ts-expect-error */ /** docs */
export const c: number = bad;
/* explanation
@ts-expect-error */
export const d: number = bad;
/** Docs. */ export const e = 1;
`;
			const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(code).toContain('/* @ts-expect-error */\n/* plain */\nexport const a');
			expect(code).toContain('// @ts-expect-error\n/* plain */\nexport const b');
			expect(code).toContain('/* @ts-expect-error */ /** docs */\nexport const c');
			expect(code).toContain('/* explanation\n@ts-expect-error */\nexport const d');
			expect(code).toContain('/** Docs. */ export const e = 1;');
		});

		it('keeps a block directive whose last line starts with a star', () => {
			// TypeScript trims the start of a block comment's last line before it
			// looks for the directive there, so ` * @ts-expect-error` is one.
			const source = `declare const bad: string;
/*
 * @ts-expect-error */
export const a: number = bad;
export function A() @{
	<div>
		{/*
		  * @ts-ignore */}
		<span title={1 as string} />
	</div>
}
`;
			const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(code).toContain('/*\n * @ts-expect-error */\nexport const a');
			expect(code).toMatch(/\{\/\*\n\s*\* @ts-ignore \*\/\}/);
		});

		it('leaves out a directive on the line where its statement starts', () => {
			// It covers the source line after it, which the printed statement does
			// not keep: here the printer splits the statement over several lines.
			const source = `export function f(x: number) {
	/* @ts-ignore */ if (x) { const y: number = 'bad'; return y; }
	return 0;
}
/* @ts-expect-error */ export const o = { a: missing, b: 'a long string to make the printer wrap', c: 'and another long string' };
`;
			const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(code).not.toContain('@ts-ignore');
			expect(code).not.toContain('@ts-expect-error');
		});

		/**
		 * The diagnostics TypeScript reports on the virtual code for names,
		 * assignments and unused directives, with the text each one covers.
		 * @param {string} code
		 * @returns {Array<[number, string]>}
		 */
		const suppression_diagnostics = (code) =>
			virtual_semantic_diagnostics(code)
				.filter((diagnostic) => [2304, 2322, 2578].includes(diagnostic.code))
				.map((diagnostic) => [
					diagnostic.code,
					code.slice(diagnostic.start, (diagnostic.start ?? 0) + (diagnostic.length ?? 0)),
				]);

		it('keeps the later lines of a statement off the line a directive covers', () => {
			// TypeScript applies a directive to the line after it, so that line must
			// hold the code of the source line after it and no more (#1144).
			const source = `declare function foo(a: number, b?: number): void;
// @ts-expect-error
foo(
	1,
	missingA
);
/* @ts-expect-error */
foo(1,
	missingB);
// @ts-expect-error
foo(missingC,
	1);
// @ts-expect-error
export const o = { a: missingD, b: 'a long string to make the printer wrap', c: 'and another long string' };
export function App() @{
	// @ts-expect-error
	const x: number = foo(
		1,
		missingE,
	);
	<div>{x}</div>
}
`;
			const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
			expect(suppression_diagnostics(code)).toEqual([
				[2578, '// @ts-expect-error'],
				[2304, 'missingA'],
				[2578, '/* @ts-expect-error */'],
				[2304, 'missingB'],
				[2304, 'missingE'],
			]);
		});

		it('breaks the line a directive covers only where the code reads the same', () => {
			// The break goes where the source breaks the line between the same two
			// tokens, or after code that must go on. The TSRX parser reads import
			// attributes across a line break, which TypeScript does not, so those
			// lines stay joined. A parenthesis the printer adds maps to the next `(`
			// of the source, which is on a later line.
			const source = `declare const bad: string;
export function f(a: number) {
	// @ts-expect-error
	return (
		a + missingA
	);
}
// @ts-expect-error
export const b = (bad
) as unknown as number;
// @ts-expect-error
import 'x'
with { type: 'json' };
// @ts-expect-error
export const c = \`\${bad}
\${missingC}\`;
// @ts-expect-error
export const p = 1
(bad)();
`;
			const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
			expect(code).toContain('return (\n\t\ta + missingA);');
			expect(code).toContain('(bad\n\t) as unknown as number;');
			expect(code).toContain("import 'x' with {");
			expect(code).toContain('export const p = (1)(\n');
			expect(suppression_diagnostics(code)).toEqual([
				[2578, '// @ts-expect-error'],
				[2304, 'missingA'],
				[2578, '// @ts-expect-error'],
				[2578, '// @ts-expect-error'],
				[2578, '// @ts-expect-error'],
				[2304, 'missingC'],
				[2578, '// @ts-expect-error'],
			]);
		});

		it('maps an object literal getter or setter with type parameters', () => {
			const source = 'export const o = { get g<T>() { return 1; }, set s<T>(v: T) {} };';
			const result = compile_to_volar_mappings(source, 'App.tsrx');

			expect(result.code).toContain('get g<T>() {');
			expect(result.code).toContain('set s<T>(v: T) {}');
		});
	});

	describe(`[${name}] parentheses around an element operand in virtual code`, () => {
		// The editor parse keeps parentheses as nodes, so the virtual code
		// prints them as the build output does.
		it.each(ELEMENT_OPERAND_CASES)(
			'keeps the parentheses around an element in %s',
			(_label, source) => {
				const { code } = compile_to_volar_mappings(source, 'App.tsrx');

				expect(virtual_parse_diagnostics(code)).toEqual([]);
				expect(tsx_shape(code)).toBe(tsx_shape(source));
			},
		);
	});

	describe(`[${name}] JSX spread children in virtual code`, () => {
		// Analysis reports spread children, but the editor still gets typed
		// code that keeps the spread and maps its expression.
		it('reports each spread child and keeps it in the virtual code', () => {
			const source = `export function App({ items }: { items: any[] }) @{
	<div>
		{...items}
		<>{...items}</>
	</div>
}`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			const first = source.indexOf('{...items}');
			const second = source.indexOf('{...items}', first + 1);
			expect(errors.map((error) => [error.code, error.pos, error.end])).toEqual([
				[DIAGNOSTIC_CODES.JSX_SPREAD_CHILD, first, first + '{...items}'.length],
				[DIAGNOSTIC_CODES.JSX_SPREAD_CHILD, second, second + '{...items}'.length],
			]);
			expect(code).toContain('<div>{...items}<>{...items}</></div>');
			expect(virtual_parse_diagnostics(code), code).toEqual([]);

			for (const spread of [first, second]) {
				const items = source.indexOf('items', spread);
				const mapping = mappings.find((candidate) => candidate.sourceOffsets[0] === items);
				expect(mapping).toBeDefined();
				const generated = /** @type {NonNullable<typeof mapping>} */ (mapping).generatedOffsets[0];
				expect(code.slice(generated, generated + 'items'.length)).toBe('items');
			}
		});
	});

	describe(`[${name}] reported dynamic tags in virtual code`, () => {
		// The parser reports a dynamic tag expression other than an identifier, a
		// member access, or a string literal (#737), once for each element, and
		// the editor still gets virtual code that keeps and maps the expression.
		it('reports each dynamic tag and keeps it in the virtual code', () => {
			const source = `export function App({ c, A, B, getTag }: any) @{
	<main>
		<{c ? A : B}>
			<p>{c}</p>
		</{c ? A : B}>
		<{getTag()} />
		<{c ? <b>&#123;x&#125; &amp;lt; &gt;</b> : 'i'} />
	</main>
}`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			const tags = ['c ? A : B', 'getTag()', "c ? <b>&#123;x&#125; &amp;lt; &gt;</b> : 'i'"];
			expect(errors.map((error) => [error.code, source.slice(error.pos, error.end)])).toEqual(
				tags.map((tag) => [DIAGNOSTIC_CODES.DYNAMIC_TAG_EXPRESSION, tag]),
			);
			expect(virtual_parse_diagnostics(code), code).toEqual([]);
			// Text keeps its character references (#693).
			expect(code).toContain('<b>&#123;x&#125; &amp;lt; &gt;</b>');

			const call = source.indexOf('getTag');
			const mapping = mappings.find((candidate) => candidate.sourceOffsets[0] === call);
			expect(mapping).toBeDefined();
			const generated = /** @type {NonNullable<typeof mapping>} */ (mapping).generatedOffsets[0];
			expect(code.slice(generated, generated + 'getTag'.length)).toBe('getTag');
		});

		it('maps the generated name of a dynamic tag to its expression', () => {
			// TypeScript reports a component's missing or unknown props (TS2769) on
			// the generated name of the lowered tag.
			const source = `export function App({ C }: any) @{
	<{C} title="x">child</{C}>
}`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			const tag = source.indexOf('{C}');
			const names = mappings
				.filter(
					(mapping) =>
						mapping.sourceOffsets[0] === tag &&
						mapping.lengths[0] === '{C}'.length &&
						mapping.data.verification,
				)
				.map((mapping) =>
					code.slice(
						mapping.generatedOffsets[0],
						mapping.generatedOffsets[0] + (mapping.generatedLengths?.[0] ?? mapping.lengths[0]),
					),
				);
			expect(names).toContain('TsrxDynamic');
		});
	});

	describe(`[${name}] unclosed and mismatched tags in the editor (#978)`, () => {
		// The editor's compile is loose: it recovers the markup, so the editor
		// keeps working, and reports the mistake where a collecting parse does.
		it.each(BROKEN_MARKUP)('reports %s', (_label, source, error) => {
			const { errors } = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			/** @type {Array<{ code?: string, pos?: number, end?: number }>} */
			const collected = [];
			parseModule(source, 'App.tsrx', { collect: true, errors: /** @type {any} */ (collected) });

			expect(errors.map((reported) => [reported.code, reported.pos, reported.end])).toEqual(
				collected.map((reported) => [reported.code, reported.pos, reported.end]),
			);
			expect(errors.map((reported) => reported.code)).toEqual([error.code]);
		});

		// The missing closing tag is added with no mapping of its own, so the code
		// is valid TSX and TypeScript reports nothing more. A verification span of
		// the parent's closing tag can cover it.
		it.each(BROKEN_MARKUP)(
			'adds the closing tag of %s with no mapping',
			(_label, source, _error, closing) => {
				const { code, mappings } = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(virtual_parse_diagnostics(code), code).toEqual([]);
				const start = code.indexOf(closing);
				expect(start, code).toBeGreaterThan(-1);
				expect(code.indexOf(closing, start + 1), code).toBe(-1);
				const end = start + closing.length;
				expect(
					mappings.filter(
						(mapping) =>
							mapping.generatedOffsets.some(
								(offset, index) =>
									offset < end &&
									offset + (mapping.generatedLengths?.[index] ?? mapping.lengths[index]) > start,
							) &&
							(mapping.data.completion ||
								mapping.data.semantic ||
								mapping.data.navigation ||
								mapping.data.structure),
					),
				).toEqual([]);
			},
		);

		// The error of an unclosed `<>` has an anchor on the `<>`, wherever
		// esrap's source map records the `<>` or not (#1322).
		it.each([
			['export const a = <><div>;', '<>'],
			['export function C() @{\n\t<><div>\n}', '<>'],
			['export function A() @{\n\t<>\n}\nexport function B() @{\n\t<div />\n}', '<>'],
			['export const a = <>;', '<>'],
			['export const a = </* a */><div>;', '</* a */>'],
		])('anchors the error of the unclosed `<>` of %j on it', (source, fragment) => {
			const { errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const start = source.indexOf(fragment);

			expect(
				errors.filter((error) => error.pos === start).map((error) => [error.code, error.end]),
			).toEqual([[TSRX_ERRORS.UNCLOSED_TAG.code, start + fragment.length]]);
			expect(
				mappings.filter(
					(mapping) =>
						mapping.data.customData?.diagnosticAnchor &&
						mapping.sourceOffsets[0] === start &&
						mapping.lengths[0] === fragment.length,
				),
			).toHaveLength(1);
		});

		// Each of two in a row, though esrap records the inner one's position
		// where the editor's code prints no `<>`.
		it.each(['export function C() @{\n\t<><><div>\n}', 'export const a = <><><div>;'])(
			'anchors the error of each unclosed `<>` of %j on it',
			(source) => {
				const { mappings } = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const outer = source.indexOf('<>');

				for (const start of [outer, outer + '<>'.length]) {
					expect(
						mappings.filter(
							(mapping) =>
								mapping.data.customData?.diagnosticAnchor &&
								mapping.sourceOffsets[0] === start &&
								mapping.lengths[0] === '<>'.length,
						),
						String(start),
					).toHaveLength(1);
				}
			},
		);
	});

	describe(`[${name}] type arguments on a tag in virtual code (#1260)`, () => {
		it('keeps and maps type arguments other than a single name', () => {
			const source = `export function App({ List, xs }: any) @{
	<div>
		<List<string | number, [1]> items={xs} />
	</div>
}`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(errors).toEqual([]);
			expect(virtual_parse_diagnostics(code), code).toEqual([]);
			expect(code).toContain('<List<string | number, [1]> items={xs} />');
			const number = source.indexOf('number');
			const mapping = mappings.find((candidate) => candidate.sourceOffsets[0] === number);
			expect(mapping).toBeDefined();
			const generated = /** @type {NonNullable<typeof mapping>} */ (mapping).generatedOffsets[0];
			expect(code.slice(generated, generated + 'number'.length)).toBe('number');
		});
	});

	describe(`[${name}] type arguments after a dynamic tag in virtual code (#1243)`, () => {
		// The editor reports them and still gets virtual code, which leaves them
		// out: on the helper the tag lowers to, they would type the tag, not its
		// props.
		it('reports them, leaves them out, and keeps mapping the element', () => {
			const source = `export function App({ Tag, title }: any) @{
	<{Tag}<string> title={title}>
		<p>{title}</p>
	</{Tag}>
}`;
			const { code, errors, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			const start = source.indexOf('<string>');
			expect(errors.map((error) => [error.code, error.pos, error.end])).toEqual([
				[DIAGNOSTIC_CODES.DYNAMIC_TAG_TYPE_ARGUMENTS, start, start + '<string>'.length],
			]);
			expect(virtual_parse_diagnostics(code), code).toEqual([]);
			expect(code).not.toContain('<string>');

			const value = source.indexOf('{title}') + 1;
			const mapping = mappings.find((candidate) => candidate.sourceOffsets[0] === value);
			expect(mapping).toBeDefined();
			const generated = /** @type {NonNullable<typeof mapping>} */ (mapping).generatedOffsets[0];
			expect(code.slice(generated, generated + 'title'.length)).toBe('title');
		});
	});

	describe(`[${name}] platform flag virtual types`, () => {
		it('types every retained flag with the selected boolean literal', () => {
			const result = compile_to_volar_mappings(
				`export const web: false = import.meta.env.platform.web;
				export const ios: true = import.meta.env.platform.ios;
				export const android: false = import.meta.env.platform.android;`,
				'App.tsrx',
				{ platform: 'ios' },
			);

			expect(result.errors).toEqual([]);
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
			expect(virtual_semantic_diagnostics(result.code)).toEqual([]);
		});

		it('keeps var bindings hoisted from an inactive branch', () => {
			const result = compile_to_volar_mappings(
				`if (import.meta.env.platform.web) { var value = 'web'; }
				export { value };`,
				'App.tsrx',
				{ platform: 'ios' },
			);

			expect(result.errors).toEqual([]);
			expect(virtual_semantic_diagnostics(result.code)).toEqual([]);
		});
	});

	describe(`[${name}] type-only style stand-ins`, () => {
		it('keeps consecutive <style> siblings parseable as TSX', () => {
			// Each stand-in is its own `void` expression statement; two adjacent
			// JSX expression statements would otherwise parse as one (TS2657).
			const { code, errors } = compile_to_volar_mappings(
				`function App() @{
					<style apply={theme} />
					<style>.a { color: red; }</style>
					<style>.b { color: blue; }</style>
					<div class="a b" />
				}
				const theme = <style>.t {}</style>;`,
				'App.tsrx',
				{ loose: true },
			);

			expect(errors.filter((error) => error.type === 'fatal')).toEqual([]);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
			expect(code).toContain('void <style data-tsrx-apply={theme.$class} />');
			expect(code).toContain('void <style></style>');
		});

		it('reports a theme that applies itself instead of overflowing the stack', () => {
			for (const options of [undefined, { loose: true }]) {
				const { code, errors } = compile_to_volar_mappings(
					'export const theme = <style apply={theme} />;',
					'App.tsrx',
					options,
				);

				expect(errors.map((error) => error.code)).toEqual([
					DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
				]);
				expect(virtual_parse_diagnostics(code)).toEqual([]);
			}
		});

		it('recovers an unclosed <style> in loose type-only compile without losing mappings', function () {
			// While typing `<style>` there is no `</style>` yet. The raw-text path
			// used to feed the rest of the file to the CSS parser, which threw
			// `Expected identifier` and collapsed every token mapping to a
			// whole-file 1:1 fallback. An unclosed `<span>` already recovered.
			const source = `export function App() @{
	<>
		<style>
		<div />
	</>
}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

			expect(
				result.errors.filter(function (error) {
					return error.type === 'fatal';
				}),
			).toEqual([]);
			expect(
				result.errors.map(function (error) {
					return error.code;
				}),
			).not.toContain(DIAGNOSTIC_CODES.CSS_SYNTAX);
			expect(result.mappings.length).toBeGreaterThan(1);

			const whole_file = result.mappings.find(function (mapping) {
				return mapping.sourceOffsets[0] === 0 && mapping.lengths[0] === source.length;
			});
			expect(whole_file).toBeUndefined();

			/** @param {string} token */
			function is_mapped(token) {
				const offset = source.indexOf(token);
				return result.mappings.some(function (mapping) {
					const start = mapping.sourceOffsets[0];
					return offset >= start && offset < start + mapping.lengths[0];
				});
			}

			expect(is_mapped('App')).toBe(true);
			expect(is_mapped('div')).toBe(true);
			expect(result.code).toContain('<style></style>');
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
		});

		it('keeps partial CSS after an unclosed <style> out of the template in loose type-only compile', function () {
			// Without auto-insert the CSS gets typed before the closing tag exists.
			// The body up to the next tag start is the style's CSS, so it never
			// tokenizes as JSX, and the sibling after it keeps its mapping.
			const source = `export function App() @{
	<>
		<style>
			.foo { color: red; }
			.bar {
		<div />
	</>
}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

			expect(
				result.errors.filter(function (error) {
					return error.type === 'fatal';
				}),
			).toEqual([]);

			/** @param {string} token */
			function is_mapped(token) {
				const offset = source.indexOf(token);
				return result.mappings.some(function (mapping) {
					const start = mapping.sourceOffsets[0];
					return offset >= start && offset < start + mapping.lengths[0];
				});
			}

			expect(is_mapped('App')).toBe(true);
			expect(is_mapped('div')).toBe(true);
			expect(result.code).not.toContain('.foo');
			expect(result.code).toContain('<style></style>');
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
		});

		// At the CSS that fails, and the rest of the file compiles (#1306).
		it('reports a CSS syntax error in a loose type-only compile', function () {
			const source = `export function App() @{
	<div>
		<style>
			.a { color: red; }
			}
		</style>
		<p class="a">x</p>
	</div>
}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const pos = source.indexOf('}\n\t\t</style>');

			expect(
				result.errors.map((error) => [error.code, error.message, error.pos, error.end]),
			).toEqual([[DIAGNOSTIC_CODES.CSS_SYNTAX, 'Expected identifier', pos, pos + 1]]);
			expect(virtual_parse_diagnostics(result.code)).toEqual([]);
		});
	});

	describe(`[${name}] compile diagnostics`, () => {
		it('reports a pending block on a plain try, and keeps and maps its code (#1303)', () => {
			for (const source of [
				'export function f() {\n\ttry {\n\t\ta();\n\t} pending {\n\t\tb();\n\t}\n}\n',
				'export function f() {\n\ttry { a(); } pending { b(); } catch (e) { c(); } finally { d(); }\n}\n',
				'export function App() @{\n\ttry { a(); } pending { b(); }\n\t<div />\n}\n',
			]) {
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(
					result.errors.map((error) => [error.code, error.pos]),
					source,
				).toEqual([[TS_ERRORS.CATCH_OR_FINALLY_EXPECTED.code, source.indexOf('pending')]]);
				const b = source.indexOf('b()');
				const generated_b = result.code.indexOf('b()');
				expect(generated_b, result.code).toBeGreaterThan(-1);
				expect(
					result.mappings.some(
						(mapping) =>
							mapping.sourceOffsets[0] === b && mapping.generatedOffsets[0] === generated_b,
					),
					result.code,
				).toBe(true);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('keeps nested loop-target defaults in type-only output', () => {
			const result = compile_to_volar_mappings(
				`export function read(items, fallback) {
					for (const { pair: [value] = fallback } of items) consume(value);
					for (let { pair: [other] = fallback } = items[0]; false;) consume(other);
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('pair: [value] = fallback');
			expect(result.code).toContain('pair: [other] = fallback');
			expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
		});

		it('gives a `@for` loop with an empty declaration list no parameter', () => {
			// Loose mode parses `const` with no name (TS1123), as while it is typed.
			const result = compile_to_volar_mappings(
				`export function App({ items }: { items: string[] }) @{
					<ul>
						@for (const of items) {
							<li />
						}
					</ul>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors.map((error) => error.code)).toEqual([
				TS_ERRORS.VARIABLE_DECLARATION_LIST_EMPTY.code,
			]);
			expect(result.code).toContain('() =>');
			expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
		});

		it('reports an `@for` head that assigns instead of declaring (#267)', () => {
			for (const [head, setup] of [
				['state.item', 'const state = { item: 0 };'],
				['item', 'let item = 0;'],
				['{ item }', 'let item = 0;'],
				['[state.item]', 'const state = { item: 0 };'],
			]) {
				const source = `export function App({ items }: { items: any[] }) @{
					${setup}
					<ul>
						@for (${head} of items; index i) {
							<li>{i}</li>
						}
					</ul>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const start = source.indexOf(`(${head} of`) + 1;

				expect(
					result.errors.map((error) => [error.code, error.pos, error.end]),
					head,
				).toEqual([[TSRX_ERRORS.FOR_HEAD_ASSIGNMENT.code, start, start + head.length]]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('reports an `@for` head that declares its item with `using` (#453)', () => {
			for (const kind of ['using', 'await using']) {
				const source = `export async function App({ items }: { items: Disposable[] }) @{
					<ul>
						@for (${kind} item of items) {
							<li>{String(item)}</li>
						}
					</ul>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(
					result.errors.map((error) => [error.code, error.message]),
					kind,
				).toEqual([[TSRX_ERRORS.FOR_HEAD_USING.code, TSRX_ERRORS.FOR_HEAD_USING(kind).message]]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('reports an `@for` head that declares its item with `var` (#1158)', () => {
			for (const head of ['var item', 'var { item }']) {
				const source = `export function App({ items }: { items: any[] }) @{
					<>
						<ul>
							@for (${head} of items) {
								<li>{String(item)}</li>
							}
						</ul>
						<p>{String(item)}</p>
					</>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const start = source.indexOf(`(${head} of`) + 1;

				expect(
					result.errors.map((error) => [error.code, error.message, error.pos, error.end]),
					head,
				).toEqual([
					[
						TSRX_ERRORS.FOR_HEAD_VAR.code,
						TSRX_ERRORS.FOR_HEAD_VAR.message,
						start,
						start + head.length,
					],
				]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('reports an invalid `@for` head wherever the loop is nested', () => {
			/** @type {Record<string, (loop: string) => string>} */
			const positions = {
				'@if': (loop) => `@if (c) { ${loop} }`,
				'@for': (loop) => `@for (const g of groups) { ${loop} }`,
				'@switch': (loop) => `@switch (c) { @case 1: { ${loop} } }`,
				'@try': (loop) => `@try { ${loop} } @catch (e) { <p /> }`,
				'a JSX value': (loop) => `{<b>${loop}</b>}`,
			};
			for (const [head, code] of [
				['state.item of items', TSRX_ERRORS.FOR_HEAD_ASSIGNMENT.code],
				['using item of items', TSRX_ERRORS.FOR_HEAD_USING.code],
				['var item of items', TSRX_ERRORS.FOR_HEAD_VAR.code],
			]) {
				for (const [label, wrap] of Object.entries(positions)) {
					const source = `export async function App({ items, groups, c }: any) @{
						const state = { item: 0 };
						<ul>
							${wrap(`@for (${head}) { <li /> }`)}
						</ul>
					}`;
					const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
					const start = source.indexOf(`(${head}`) + 1;

					expect(
						result.errors.map((error) => [error.code, error.pos]),
						`${head} in ${label}`,
					).toEqual([[code, start]]);
					expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
				}
			}
		});

		it('keeps type-only output valid for a keyed `@for` head that assigns', () => {
			for (const clauses of ['key item', 'index i; key item']) {
				const source = `export function App({ items }: { items: string[] }) @{
					let item = '';
					<ul>
						@for (item of items; ${clauses}) {
							<li>{item}</li>
						}
					</ul>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(
					result.errors.map((error) => error.code),
					clauses,
				).toEqual([TSRX_ERRORS.FOR_HEAD_ASSIGNMENT.code]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('lets an `@for` body declare the head’s names again in virtual code (#1325)', () => {
			for (const [head, body] of [
				['const { id } of rows', 'const { id } = other; <li>{id}</li>'],
				['const row of rows', "const row = 'body'; <li>{row}</li>"],
				['const { id } of rows; index i', "const i = '!'; <li>{id + i}</li>"],
				['const { id, name } of rows; key id', 'const { id } = other; <li>{name + id}</li>'],
				['const { id } of rows; index i; key id', 'const { id } = other; <li>{id + i}</li>'],
				['const row of rows; index i', 'function i() { return 1; } <li>{row.id + i()}</li>'],
				['const row of rows; key row.id', 'class row {} <li>{String(row)}</li>'],
			]) {
				const source = `export function App({ rows, other }: { rows: { id: string; name: string }[]; other: { id: string } }) @{
					<ul>
						@for (${head}) {
							${body}
						}
					</ul>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(result.errors, head).toEqual([]);
				expect(
					virtual_semantic_diagnostics(result.code)
						.filter((diagnostic) => [2300, 2451].includes(diagnostic.code))
						.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
					result.code,
				).toEqual([]);
			}
		});

		it('lets a default in an `@for` item pattern read the index in virtual code (#1312)', () => {
			for (const [head, body] of [
				["const [a = 'r' + i, b] of rows; index i", '<li>{a + b}</li>'],
				["const [a = 'r' + i, b] of rows; index i; key b", '<li>{a + b}</li>'],
				["const { 0: a = 'r' + i, 1: b } of rows; index i", '<li>{a + b}</li>'],
				["const { [i]: a = 'r', 1: b } of rows; index i; key b", '<li>{a + b}</li>'],
				["const [a = 'r' + i, b] of rows; index i; key b", '@if (b) { <li>{a + b}</li> }'],
				["const [a = 'r' + i, b] of rows; index i; key b", "const b = 'body'; <li>{a + b}</li>"],
				["let [a = 'r' + i, b] of rows; index i; key (a += b)", '<li>{a + b}</li>'],
			]) {
				const source = `export function App({ rows }: { rows: [string | undefined, string][] }) @{
					<ul>
						@for (${head}) {
							${body}
						}
					</ul>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(result.errors, head).toEqual([]);
				expect(
					virtual_semantic_diagnostics(result.code)
						.filter((diagnostic) => [2300, 2373, 2448, 2451, 2588].includes(diagnostic.code))
						.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
					result.code,
				).toEqual([]);
			}
		});

		it('reports a `var` declared in a directive body, at its keyword (#1208)', () => {
			/** @type {Record<string, (body: string) => string>} */
			const bodies = {
				'@if': (body) => `@if (c) { ${body} }`,
				'@else if': (body) => `@if (c) { <p /> } @else if (d) { ${body} }`,
				'@else': (body) => `@if (c) { <p /> } @else { ${body} }`,
				'@for': (body) => `@for (const item of items) { ${body} }`,
				'@empty': (body) => `@for (const item of items) { <p /> } @empty { ${body} }`,
				'@case': (body) => `@switch (c) { @case 1: { ${body} } }`,
				'@default': (body) => `@switch (c) { @case 1: { <p /> } @default: { ${body} } }`,
				'@try': (body) => `@try { ${body} } @catch (e) { <p /> }`,
				'@pending': (body) => `@try { <p /> } @pending { ${body} }`,
				'@catch': (body) => `@try { <p /> } @catch (e) { ${body} }`,
			};
			for (const [label, wrap] of Object.entries(bodies)) {
				const source = `export function App({ items, c, d }: any) @{
					<div>
						${wrap('var value = 1; <p>{value}</p>')}
					</div>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const start = source.indexOf('var value');

				expect(
					result.errors.map((error) => [error.code, error.message, error.pos, error.end]),
					label,
				).toEqual([
					[
						TSRX_ERRORS.DIRECTIVE_BODY_VAR.code,
						TSRX_ERRORS.DIRECTIVE_BODY_VAR.message,
						start,
						start + 'var'.length,
					],
				]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('reports a `var` in a plain block nested in a directive body (#1208)', () => {
			for (const statement of [
				'{ var value = 1; }',
				'if (c) { var value = 1; }',
				'if (c) {} else { var value = 1; }',
				'for (var value = 0; value < 1; value++) {}',
				'for (var value of items) {}',
				'for (var value in c) {}',
				'while (c) { var value = 1; }',
				'switch (c) { case 1: var value = 1; }',
				'try { var value = 1; } catch {}',
				'try {} catch { var value = 1; }',
				'try {} finally { var value = 1; }',
				'block: { var value = 1; }',
			]) {
				const source = `export function App({ items, c }: any) @{
					<ul>
						@for (const item of items) {
							${statement}
							<li>{item}</li>
						}
					</ul>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const start = source.indexOf('var value');

				expect(
					result.errors.map((error) => [error.code, error.pos, error.end]),
					statement,
				).toEqual([[TSRX_ERRORS.DIRECTIVE_BODY_VAR.code, start, start + 'var'.length]]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('reports a `var` declared in a nested `@{ … }` block, at its keyword (#1208)', () => {
			/** @type {Record<string, { setup?: string, output: string, module?: string }>} */
			const positions = {
				child: { output: '<div>@{ var value = 1; <p>{value}</p> }</div>' },
				'setup value': {
					setup: 'const view = @{ var value = 1; <p>{value}</p> };',
					output: '<div>{view}</div>',
				},
				'attribute value': { output: '<div title={@{ var value = 1; <p>{value}</p> }} />' },
				'return value': {
					setup: 'function view() { return @{ var value = 1; <p>{value}</p> }; }',
					output: '<div>{view()}</div>',
				},
				'module value': {
					module: 'const view = @{ var value = 1; <p>{value}</p> };',
					output: '<div>{view}</div>',
				},
				'directive body': {
					output: '<div>@if (c) { <p>@{ var value = 1; <b>{value}</b> }</p> }</div>',
				},
			};
			for (const [label, { setup = '', output, module = '' }] of Object.entries(positions)) {
				const source = `${module}
				export function App({ c }: any) @{
					${setup}
					${output}
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const start = source.indexOf('var value');

				expect(
					result.errors.map((error) => [error.code, error.pos, error.end]),
					label,
				).toEqual([[TSRX_ERRORS.DIRECTIVE_BODY_VAR.code, start, start + 'var'.length]]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it("accepts a `var` in a function's own `@{ … }` body or in a function or class in a block (#1208)", () => {
			for (const statement of [
				'const read = () => { var value = 1; return value; };',
				'function read() { var value = 1; return value; }',
				'const read = function () { var value = 1; return value; };',
				'const model = { read() { var value = 1; return value; } };',
				'class Model { static { var value = 1; } read() { var value = 1; return value; } }',
				'const Row = () => @{ var value = 1; <b>{value}</b> };',
				'const model = { render() @{ var value = 1; <b>{value}</b> } };',
				'const view = @{ const read = () => { var value = 1; return value; }; <b>{read()}</b> };',
			]) {
				const source = `export function App({ c }: any) @{
					var outer = 1;
					function helper() { var local = 1; return local; }
					<div>
						@if (c) {
							${statement}
							<p>{outer}{helper()}</p>
						}
					</div>
				}`;
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(result.errors, statement).toEqual([]);
				expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
			}
		});

		it('reports each `var` in nested directive bodies once, beside a `var` head (#1208)', () => {
			const source = `export function App({ items, c }: any) @{
				<ul>
					@for (var item of items) {
						var outer = item;
						const row = () => @if (c) {
							var inner = outer;
							<b>{inner}</b>
						};
						@switch (c) {
							@case 1: {
								var deep = 1;
								<li>{row()}{deep}</li>
							}
						}
					}
				</ul>
			}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const at = (/** @type {string} */ text) => source.indexOf(text);

			expect(result.errors.map((error) => [error.code, error.pos])).toEqual([
				[TSRX_ERRORS.FOR_HEAD_VAR.code, at('var item')],
				[TSRX_ERRORS.DIRECTIVE_BODY_VAR.code, at('var outer')],
				[TSRX_ERRORS.DIRECTIVE_BODY_VAR.code, at('var inner')],
				[TSRX_ERRORS.DIRECTIVE_BODY_VAR.code, at('var deep')],
			]);
			expect(virtual_parse_diagnostics(result.code), result.code).toEqual([]);
		});

		it('reports `var`s in nested bodies in source order (#1208)', () => {
			const source = `export function App({ items, c }: any) @{
				<div title={@if (c) { var first = 1; <b>{first}</b> }}>
					@for (const item of items) {
						var second = item;
						<p>{second}</p>
					}
					@{
						var third = 1;
						<i>{third}</i>
					}
				</div>
			}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

			expect(result.errors.map((error) => [error.code, error.pos])).toEqual(
				['var first', 'var second', 'var third'].map((text) => [
					TSRX_ERRORS.DIRECTIVE_BODY_VAR.code,
					source.indexOf(text),
				]),
			);
		});

		it('preserves deferred imports in type-only output', () => {
			const result = compile_to_volar_mappings(
				`import defer * as feature from './feature.js';
				const lazy = import.defer('./lazy.js', { with: { type: 'json' } });

				export function App() {
					return <div>{feature.value}</div>;
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain("import defer * as feature from './feature.js';");
			expect(result.code).toContain("import.defer('./lazy.js', { with: { type: 'json' } })");
		});

		it('preserves source phase imports in type-only output', () => {
			const result = compile_to_volar_mappings(
				`import source module from './module.wasm';
				const later = import.source('./later.wasm', { with: { type: 'wasm' } });

				export function App() {
					return <div>{String(module)}</div>;
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain("import source module from './module.wasm';");
			expect(result.code).toContain("import.source('./later.wasm', { with: { type: 'wasm' } })");
		});

		it('reports wrong source phase bindings in type-only output, and keeps the import', () => {
			for (const [source, code] of [
				["import source { module } from './module.wasm';", 'TS18112'],
				["import source './module.wasm';", 'TS18111'],
			]) {
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });

				expect(
					result.errors.map((error) => error.code),
					source,
				).toEqual([code]);
				expect(result.code, source).toContain(source);
			}
		});

		it('keeps fragment expression children inside containers in type-only output', () => {
			const result = compile_to_volar_mappings(
				`function StatusBadge() @{
					const a = 1;
					<>{<>{a} <>{<>{a}</>}</> </>}</>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(count_substring(result.code, '{a}')).toBeGreaterThanOrEqual(2);
			expect(result.code).not.toContain('<>{a}a</>');
		});

		it('keeps a single text child faithful instead of promoting it to a string literal', () => {
			const result = compile_to_volar_mappings(
				`export function App() @{
					<>@</>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			// `@` is valid text content and must stay as-is, not be mangled into `{'@'}`.
			expect(result.code).toContain('<>@</>');
			expect(result.code).not.toContain("{'@'}");
		});

		it('does not promote ordinary single-text output into a string literal', () => {
			const result = compile_to_volar_mappings(
				`export function App() @{
					<>Hello</>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('<>Hello</>');
			expect(result.code).not.toContain("{'Hello'}");
		});

		// A `@` on its own line inside a fragment/element is an in-progress `@if`/`@for`/…
		// directive recovered as text; it compiles fine, so no compile-error fallback covers
		// it. It must get a completion mapping so the editor offers directive completions —
		// and that mapping must be WELL-FORMED: equal source and generated lengths. A
		// mismatched-length mapping (which happened when a whitespace-padded text node was
		// trimmed but kept its wide location) makes the completion's textEdit range fail to
		// map back to source, so VS Code silently drops every item (the plugin fires but
		// nothing shows). These cases exercise the shapes that broke.
		for (const { name, source } of [
			{
				name: 'a bare `@` on its own line',
				source: 'export function App() {\n\t<>\n\t\t@\n\t</>\n}',
			},
			{
				name: 'a `@`-leading child in an element',
				source: 'export function App() {\n\t<div>@</div>\n}',
			},
			{
				name: 'a partially typed `@if`',
				source: 'export function App() {\n\t<>\n\t\t@if\n\t</>\n}',
			},
			// The output writes a `>` or `<` in text as a character reference
			{
				name: 'a `@`-leading child with a `>`',
				source: `export function App() {
	<div>@if > x</div>
}`,
			},
			{
				name: 'a `@`-leading child with a `<`',
				source: `export function App() {
	<div>@if < x</div>
}`,
			},
		]) {
			it(`emits a well-formed completion-only mapping for ${name}`, () => {
				const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
				const cursor = source.indexOf('@') + 1;

				// Completion mappings covering the cursor right after the `@`.
				const covering = result.mappings.filter(
					(m) =>
						m.data?.completion &&
						cursor >= m.sourceOffsets[0] &&
						cursor <= m.sourceOffsets[0] + m.lengths[0],
				);

				// A completion must be offered at the `@`…
				expect(covering.length).toBeGreaterThan(0);
				for (const m of covering) {
					// …with equal source/generated lengths so the textEdit round-trips (the bug
					// produced a 9-char source -> 1-char generated mapping here)…
					expect(m.lengths[0]).toBe(m.generatedLengths[0]);
					// …and completion only — the `@` text must not be type-checked.
					expect(m.data?.verification).toBeFalsy();
				}
			});
		}

		it('maps a `@`-leading child with a `>` after an `@switch` to its own text', () => {
			// The text's start also maps into the `@switch`'s output, so the mapping is
			// found by its text, which stops before the `>` that the output escapes.
			const source = `export function App() {
	<div>
		@switch (k) {
			@case 1: {
				<b />
			}
		}
		@if > x
	</div>
}`;
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const cursor = source.indexOf('@if') + 1;

			const covering = result.mappings.filter(
				(m) =>
					m.data?.completion &&
					cursor >= m.sourceOffsets[0] &&
					cursor <= m.sourceOffsets[0] + m.lengths[0],
			);

			expect(covering.length).toBeGreaterThan(0);
			for (const m of covering) {
				const mapped = source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0]);
				expect(
					result.code.slice(m.generatedOffsets[0], m.generatedOffsets[0] + m.generatedLengths[0]),
				).toBe(mapped);
				expect(mapped.trim()).toBe('@if');
			}
		});

		it('does not map ordinary template text (no stray completions in plain text)', () => {
			const source = 'export function App() {\n\t<div>hello world</div>\n}';
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const cursor = source.indexOf('hello') + 1;

			const mapping = result.mappings.find((m) => {
				const start = m.sourceOffsets[0];
				return cursor >= start && cursor < start + m.lengths[0] && m.data?.completion;
			});

			expect(mapping).toBeUndefined();
		});

		it('does not treat a mid-text `@` (e.g. an email) as a directive', () => {
			// `a@b.com` — the `@` is not the first non-whitespace char, so it stays plain text
			// and must not get a completion mapping (no spurious directive completions).
			const source = 'export function App() {\n\t<div>a@b.com</div>\n}';
			const result = compile_to_volar_mappings(source, 'App.tsrx', { loose: true });
			const at = source.indexOf('@');

			const mapping = result.mappings.find(
				(m) =>
					m.data?.completion && at >= m.sourceOffsets[0] && at < m.sourceOffsets[0] + m.lengths[0],
			);

			expect(mapping).toBeUndefined();
		});

		it('keeps callback returns around JSX values clean in type-only output', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					<Page
						params={{
							menuAlt: (isAdmin) => {
								if (isAdmin) {
									return [<>Delete</>, <>Edit</>];
								}
							},
							bySwitch: (role) => {
								switch (role) {
									case 'admin':
										return [<>Edit</>];
									default:
										return [<>View</>];
								}
							},
						}}
					/>
				}`,
				'App.tsrx',
				{ loose: true },
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('return [<>Delete</>, <>Edit</>];');
			expect(result.code).toContain('return [<>View</>];');
			expect(result.code).toContain('bySwitch: (role) => {');
		});

		it('allows return statements in localized setup before a template fence', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					if (ready) {
						return;
					}

					<div>{'ready'}</div>
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('allows return statements in arrow function statement-container bodies', () => {
			const result = compile_to_volar_mappings(
				`const Test = () => @{
					if (ready) {
						return <div>{'early'}</div>;
					}

					<div>{'ready'}</div>
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('rejects return statements in expression-position statement containers', () => {
			for (const source of [
				`function Test() {
					return @{
						if (ready) {
							return <div>{'early'}</div>;
						}

						<div>{'ready'}</div>
					};
				}`,
				`function Test() @{
					const content = @{
						if (ready) {
							return <div>{'early'}</div>;
						}

						<div>{'ready'}</div>
					};

					<section>{content}</section>
				}`,
				`function Test() @{
					<section>@{
						if (ready) {
							return <div>{'early'}</div>;
						}

						<div>{'ready'}</div>
					}</section>
				}`,
			]) {
				const result = compile_to_volar_mappings(source, 'App.tsrx');

				expect(result.errors.map((error) => error.code)).toContain(
					TSRX_ERRORS.TEMPLATE_RETURN_STATEMENT.code,
				);
			}
		});

		it('rejects return statements inside @try/@catch/@pending blocks', () => {
			for (const source of [
				`function Test() @{
					@try {
						return <div>{'ok'}</div>;
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
				`function Test() @{
					@try {
						<div>{'ok'}</div>
					} @catch (e) {
						return <div>{'err'}</div>;
					}
				}`,
				`function Test() @{
					@try {
						<div>{'ok'}</div>
					} @pending {
						return <div>{'loading'}</div>;
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
				`function Test() @{
					@try {
						return;
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
			]) {
				const result = compile_to_volar_mappings(source, 'App.tsrx');

				expect(result.errors.map((error) => error.code)).toContain(
					TSRX_ERRORS.TEMPLATE_RETURN_STATEMENT.code,
				);
			}
		});

		it('allows @try/@catch/@pending blocks without return statements', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					@try {
						<div>{'ok'}</div>
					} @pending {
						<div>{'loading'}</div>
					} @catch (e) {
						<div>{'err'}</div>
					}
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('allows return statements inside nested ordinary functions in statement containers', () => {
			const result = compile_to_volar_mappings(
				`function Test() @{
					<section>@{
						function render() {
							return <div>{'nested'}</div>;
						}

						<div>{render()}</div>
					}</section>
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
		});

		it('parses JSX callback returns in JSX props without semicolons', () => {
			const result = compile_to_volar_mappings(
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</>
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('item.name');
		});

		it('reports semicolon-terminated template expression containers', () => {
			const result = compile_to_volar_mappings(
				`function App() @{
					<div>{
						renderThing();
					}</div>
				}`,
				'App.tsrx',
			);

			expect(diagnostic_codes(result)).toContain(
				DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
			);
			const diagnostic = result.errors.find(
				(error) => error.code === DIAGNOSTIC_CODES.TEMPLATE_EXPRESSION_TRAILING_SEMICOLON,
			);
			expect(diagnostic?.loc?.start).toEqual({ line: 3, column: 19 });
			expect(diagnostic?.loc?.end).toEqual({ line: 3, column: 20 });
			expect(result.code).toContain('renderThing()');
		});

		it('allows html identifiers as ordinary attribute values', () => {
			const result = compile_to_volar_mappings(
				`function Child(_: { body: string }) { return null; }
				function App() @{
					const html = '<strong>safe</strong>';

					<Child body={html} />
				}`,
				'App.tsrx',
			);

			expect(result.errors).toEqual([]);
			expect(result.code).toContain('body={html}');
		});
	});
}

/**
 * @param {CompileHarness} harness
 */
export function runSharedTsxExpressionTsrxTests({ compile, name, classAttrName }) {
	describe(`[${name}] JSX fragments inside expression values`, () => {
		it('preserves nested JSX fragments inside regular function TSX props', () => {
			const { code } = compile(
				`function App3() @{
						<PlainTextPlugin
							ErrorBoundary={LexicalErrorBoundary}
							contentEditable={<>
								<ContentEditable
									aria-placeholder={placeholder}
									class={classes.contentEditable}
									placeholder={<>
										<div class={classes.placeholder}>{placeholder}</div>
									</>}
								/>
							</>}
							placeholder={<>
								<div class={classes.placeholder}>{placeholder}</div>
							</>}
						/>
					}`,
				'App.tsrx',
			);
			expect(code).toContain('contentEditable={<>');
			expect(code).toContain('<ContentEditable');
			expect(code).toContain(` ${classAttrName}={classes.contentEditable}`);
			expect(code).toContain(`placeholder={<>`);
			expect(code).toContain(`<div ${classAttrName}={classes.placeholder}>`);
		});

		it('allows shorthand attributes in JSX fragment values', () => {
			const { code } = compile(
				`export function Test(props) @{
						<List
							items={props.items}
							renderItem={(item) =>
								<>
									<ItemView {item} onSelect={props.onSelect}>
										Selected
									</ItemView>
								</>
							}
						/>
					}`,
				'App.tsrx',
			);
			expect(code).toContain('item={item}');
			expect(code).toContain('onSelect={props.onSelect}');
			expect(code).toContain('Selected');
		});

		it('preserves JSX-style returns in regular functions declared inside TSRX bodies', () => {
			const { code } = compile(
				`function App() @{
					function renderChild() @{
							<span class="nested-return">{'ok'}</span>
						}

					<>
						{renderChild()}
					</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function renderChild()');
			expect(code).toContain('nested-return');
			expect(code).not.toContain('return;\n');
		});
	});

	describe(`[${name}] control flow in expression position`, () => {
		it('lowers a directive inside an element-valued attribute', () => {
			const { code } = compile(
				`function Child(props) { return null; }

					export function App() @{
						<Child prop={<h1>@if (true) { <div>1</div> } @else { <div>2</div> }</h1>} />
					}`,
				'App.tsrx',
			);
			expect(code).toContain('prop={<h1>');
			expect(code).toContain('<div>1</div>');
			expect(code).toContain('<div>2</div>');
			expect(code).not.toContain('@if');
		});

		it('lowers @switch assigned to a variable', () => {
			const { code } = compile(
				`function App({ status }: { status: string }) {
						const view = @switch (status) {
							@case 'loading': { <p>Loading...</p> }
							@default: { <p>Unknown status.</p> }
						};
						return view;
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @switch in an expression-bodied arrow output', () => {
			const { code } = compile(
				`const StatusMessage = ({ status }: { status: string }) => @switch (status) {
						@case 'loading': { <p>Loading...</p> }
						@case 'success': { <p>Done!</p> }
						@default: { <p>Unknown status.</p> }
					};`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Done!');
			expect(code).toContain('Unknown status.');
			expect(code).toContain(`'loading'`);
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @switch in a return statement output', () => {
			const { code } = compile(
				`function StatusMessage({ status }: { status: string }) {
						return @switch (status) {
							@case 'loading': { <p>Loading...</p> }
							@default: { <p>Unknown status.</p> }
						};
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @if in an expression-bodied arrow output', () => {
			const { code } = compile(
				`const Banner = ({ ok }: { ok: boolean }) => @if (ok) {
						<p>All good</p>
					} @else {
						<p>Something broke</p>
					};`,
				'App.tsrx',
			);
			expect(code).toContain('All good');
			expect(code).toContain('Something broke');
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});

		it('lowers @for in an expression-bodied arrow output', () => {
			const { code } = compile(
				`const List = ({ items }: { items: string[] }) => @for (const item of items) {
						<li>{item}</li>
					};`,
				'App.tsrx',
			);
			expect(code).toContain('<li>');
			expect(code).not.toContain('@for');
			expect(code).not.toContain('JSXForExpression');
		});

		it('lowers @if passed as a call argument', () => {
			const { code } = compile(
				`function StatusBadge({ status }: { status: string }) {
						func(@if (status === 'active') {
							<span class="badge active">Online</span>
						} @else if (status === 'idle') {
							<span class="badge idle">Away</span>
						} @else {
							<span class="badge">Offline</span>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Online');
			expect(code).toContain('Away');
			expect(code).toContain('Offline');
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});

		it('lowers @for passed as a call argument', () => {
			const { code } = compile(
				`function List({ items }: { items: string[] }) {
						render(@for (const item of items) {
							<li>{item}</li>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('<li>');
			expect(code).not.toContain('@for');
			expect(code).not.toContain('JSXForExpression');
		});

		it('lowers @switch passed as a call argument', () => {
			const { code } = compile(
				`function App({ status }: { status: string }) {
						render(@switch (status) {
							@case 'loading': { <p>Loading...</p> }
							@default: { <p>Unknown status.</p> }
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @try passed as a call argument', () => {
			const { code } = compile(
				`function App() {
						render(@try {
							<p>Loaded</p>
						} @catch (error) {
							<p>Failed</p>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loaded');
			expect(code).toContain('Failed');
			expect(code).not.toContain('@try');
			expect(code).not.toContain('@catch');
			expect(code).not.toContain('JSXTryExpression');
		});

		it('lowers a @{ … } code block passed as a call argument', () => {
			const { code } = compile(
				`function App() {
							render(@{
							const count = 2;
							<span>{count}</span>
						});
					}`,
				'App.tsrx',
			);
			expect(code).toContain('const count = 2;');
			expect(code).toContain('<span>{count}</span>');
			expect(code).not.toContain('JSXCodeBlock');
		});

		it('lowers @if as the left operand of a logical expression', () => {
			const { code } = compile(
				`function App() {
						let c = (@if (true) { <>{1}</> }) || 'default';
						return <div>{c}</div>;
					}`,
				'App.tsrx',
			);
			expect(code).toContain(`|| 'default'`);
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});

		it('lowers @switch as an operand of a logical expression', () => {
			const { code } = compile(
				`function App({ status }: { status: string }) {
						const view =
							fallback ||
							@switch (status) {
								@case 'loading': { <p>Loading...</p> }
								@default: { <p>Unknown status.</p> }
							};
						return <div>{view}</div>;
					}`,
				'App.tsrx',
			);
			expect(code).toContain('Loading...');
			expect(code).toContain('Unknown status.');
			expect(code).not.toContain('@switch');
			expect(code).not.toContain('JSXSwitchExpression');
		});

		it('lowers @if as a conditional (ternary) branch', () => {
			const { code } = compile(
				`function App({ ok }: { ok: boolean }) {
						const view = ok
							? @if (ok) { <p>All good</p> } @else { <p>Broke</p> }
							: <span>n/a</span>;
						return <div>{view}</div>;
					}`,
				'App.tsrx',
			);
			expect(code).toContain('All good');
			expect(code).toContain('Broke');
			expect(code).toContain('n/a');
			expect(code).not.toContain('@if');
			expect(code).not.toContain('JSXIfExpression');
		});
	});
}

/**
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedFragmentExpressionRenderTests({ compile, name }) {
	describe(`[${name}] fragment expression render bodies`, () => {
		it('renders a component-body fragment shorthand with a lone expression child', () => {
			const { code } = compile(
				`export default function A() @{
					<>{"Hello"}</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('return <>{"Hello"}</>;');
		});

		it('renders lone expression fragment shorthand inside conditional render bodies', () => {
			const { code } = compile(
				`export function A() @{
					@if (show) {
						<>{"Hello"}</>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('"Hello"');
			expect(code).not.toMatch(/^[\t ]*"Hello";?\n\s*return null;/m);
		});

		it('renders lone expression fragment shorthand inside loop render bodies', () => {
			const { code } = compile(
				`export function A() @{
					@for (const value of values) {
						<>{value}</>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('value');
			expect(code).not.toMatch(/^[\t ]*value;?\n\s*return null;/m);
		});

		it('renders lone expression fragment shorthand inside switch case bodies', () => {
			const { code } = compile(
				`export function A() @{
					@switch (state) {
						@case "ready": {
							<>{"Ready"}</>
						}
						@default: {
							<>{"Waiting"}</>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('"Ready"');
			expect(code).toContain('"Waiting"');
			expect(code).not.toMatch(/^[\t ]*"Ready";?\n\s*break;/m);
			expect(code).not.toMatch(/^[\t ]*"Waiting";?\n\s*return null;/m);
		});
	});
}

/**
 * Shared switch coverage. JSX `@switch` cases are isolated template branches:
 * they do not fall through and they do not use `break` or `return`.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedSwitchFallthroughTests({ compile, name }) {
	describe(`[${name}] switch case isolation`, () => {
		it.runIf(['react', 'preact', 'vue'].includes(name))(
			'keeps each case body independent without helper chaining',
			() => {
				const { code } = compile(
					`export function StatusBadge({ status }: { status: string }) @{
						@switch (status) {
							@case "idle": {
								<span>{'Online'}</span>
							}
							@case "active": {
								<span>{'Away'}</span>
							}
							@case "offline": {
								<span>{'Offline'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(count_substring(code, "'Online'")).toBe(1);
				expect(count_substring(code, "'Away'")).toBe(1);
				expect(count_substring(code, "'Offline'")).toBe(1);
				expect(code).not.toContain('StatementBodyHook');
			},
		);

		it('renders each explicit case block once', () => {
			const { code } = compile(
				`export function App({ kind }: { kind: string }) @{
					@switch (kind) {
						@case "a": {
							<span>{'A'}</span>
						}
						@case "b": {
							<span>{'B'}</span>
						}
						@default: {
							<span>{'Other'}</span>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(count_substring(code, "'A'")).toBe(1);
			expect(count_substring(code, "'B'")).toBe(1);
			expect(count_substring(code, "'Other'")).toBe(1);
			if (['react', 'preact', 'vue'].includes(name)) {
				expect(code).not.toContain('StatementBodyHook');
			}
		});

		it('keeps setup locals with the same name in separate case blocks', () => {
			const { code } = compile(
				`export function App({ kind }: { kind: string }) @{
					@switch (kind) {
						@case "a": {
							const label = 'A';
							<span>{label}</span>
						}
						@case "b": {
							const label = 'B';
							<span>{label}</span>
						}
						@default: {
							const label = 'Other';
							<span>{label}</span>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(count_substring(code, 'const label')).toBe(3);
			const redeclarations = virtual_semantic_diagnostics(code)
				.filter((diagnostic) => diagnostic.code === 2451)
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
			expect(redeclarations).toEqual([]);
		});

		it.runIf(['react', 'preact', 'vue'].includes(name))(
			'treats stacked case labels as separate isolated cases',
			() => {
				const { code } = compile(
					`export function App({ n }: { n: number }) @{
						@switch (n) {
							@case 1: {
							}
							@case 2: {
								<span>{'one or two'}</span>
							}
							@default: {
								<span>{'other'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(count_substring(code, "'one or two'")).toBe(1);
				expect(count_substring(code, "'other'")).toBe(1);
				expect(code).not.toContain('StatementBodyHook');
			},
		);

		it.runIf(name === 'solid')(
			'treats stacked case labels as separate isolated <Match> arms',
			() => {
				const { code } = compile(
					`export function App({ n }: { n: number }) @{
						@switch (n) {
							@case 1: {
							}
							@case 2: {
								<span>{'one or two'}</span>
							}
							@default: {
								<span>{'other'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(count_substring(code, "'one or two'")).toBe(1);
				expect(count_substring(code, "'other'")).toBe(1);
				expect(code).not.toContain('StatementBodyHook');
			},
		);

		it.runIf(['react', 'preact', 'vue'].includes(name))(
			'does not lift downstream case bodies into earlier case blocks',
			() => {
				const { code } = compile(
					`export function App({ status }: { status: string }) @{
						@switch (status) {
							@case "idle": {
								<span>{'Online'}</span>
							}
							@case "active": {
								<span>{'Away'}</span>
							}
							@case "offline": {
								<span>{'Offline'}</span>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(code).toContain('switch (status)');
				expect(code).not.toContain('StatementBodyHook');
				expect(count_substring(code, "'Online'")).toBe(1);
				expect(count_substring(code, "'Away'")).toBe(1);
				expect(count_substring(code, "'Offline'")).toBe(1);
			},
		);

		it.runIf(name === 'solid')('lowers isolated cases to independent <Match> arms', () => {
			const { code } = compile(
				`export function App({ status }: { status: string }) @{
						@switch (status) {
							@case "idle": {
								<span>{'Online'}</span>
							}
							@case "active": {
								<span>{'Away'}</span>
							}
							@case "offline": {
								<span>{'Offline'}</span>
							}
						}
					}`,
				'App.tsrx',
			);

			expect(code).toContain('<__Switch');
			expect(code).toMatch(/<__Match when=\{status === "idle"\}>/);
			expect(code).toMatch(/<__Match when=\{status === "active"\}>/);
			expect(code).toMatch(/<__Match when=\{status === "offline"\}>/);
			expect(count_substring(code, "'Offline'")).toBe(1);
			expect(count_substring(code, "'Away'")).toBe(1);
			expect(count_substring(code, "'Online'")).toBe(1);
			expect(code).not.toContain('StatementBodyHook');
		});

		it.runIf(name === 'solid')('routes default cases to <Switch fallback>', () => {
			const { code } = compile(
				`export function App({ kind }: { kind: string }) @{
					@switch (kind) {
						@case "a": {
							<span>{'A'}</span>
						}
						@default: {
							<span>{'D'}</span>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<__Switch fallback=');
			expect(code).toMatch(/<__Match when=\{kind === "a"\}>/);
			expect(count_substring(code, "'D'")).toBe(1);
		});
	});
}

/**
 * Hooks in template control-flow bodies stay where they are written: no target
 * lifts a hook-bearing `@if`, `@for`, `@switch`, or `@try` body into a
 * generated helper component, in the client or the type-only transform.
 * Following the Rules of Hooks is up to the author.
 *
 * @param {{
 *   compile: CompileHarness['compile'],
 *   compile_to_volar_mappings: CompileDiagnosticsHarness['compile_to_volar_mappings'],
 *   name: string,
 * }} harness
 */
export function runSharedHookBodyTests({ compile, compile_to_volar_mappings, name }) {
	describe(`[${name}] hooks in control-flow bodies`, () => {
		const source = `import { useMemo } from 'x';

export function App({ status, items }: { status: string; items: string[] }) @{
	<>
		@if (status === 'idle') {
			const idle_label = useMemo(() => 'Online', [status]);
			<span>{idle_label}</span>
		}
		@for (const item of items; key item) {
			const item_label = useMemo(() => item, [item]);
			<li>{item_label}</li>
		}
		@switch (status) {
			@case 'active': {
				const active_label = useMemo(() => 'Away', [status]);
				<span>{active_label}</span>
			}
			@default: {
				<span>{'Offline'}</span>
			}
		}
		@try {
			const try_label = useMemo(() => 'Loaded', []);
			<span>{try_label}</span>
		} @pending {
			<span>{'Loading'}</span>
		}
	</>
}`;

		it('keeps hook-bearing bodies inline in the client transform', () => {
			const { code } = compile(source, 'App.tsrx');

			expect(code).not.toContain('StatementBodyHook');
			expect(count_substring(code, 'useMemo(')).toBe(4);
		});

		it('keeps hook-bearing bodies inline in the typeOnly transform', () => {
			const { code } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(code).not.toContain('StatementBodyHook');
			expect(count_substring(code, 'useMemo(')).toBe(4);
		});

		it('declares no untyped module variable in the typeOnly transform', () => {
			const { code } = compile_to_volar_mappings(source, 'App.tsrx');
			const implicit_any = virtual_semantic_diagnostics(code, { noImplicitAny: true })
				.filter((diagnostic) => diagnostic.code === 7005 || diagnostic.code === 7034)
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));

			expect(implicit_any).toEqual([]);
		});
	});
}

/**
 * Shared component-loop regressions. Runs as part of `runSharedCompileTests`;
 * exported separately so harnesses that only cover component-body validation
 * can run it on its own.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedComponentLoopControlFlowTests({ compile, name }) {
	runSharedFragmentExpressionRenderTests({ compile, name });
	runSharedSwitchFallthroughTests({ compile, name });

	describe(`[${name}] component loop control flow`, () => {
		it('renders for...of loops inside fragment outputs with JSX siblings', () => {
			const { code } = compile(
				`export function App({ items }: { items: string[] }) @{
					<>
						<h3>head</h3>
						<p>text</p>
						@for (const item of items) {
							<div>{item}</div>
						}
					</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<h3>head</h3>');
			expect(code).toContain('<p>text</p>');
			expect(code).toContain('<div>{item}</div>');
		});

		it('renders an empty fallback for for...of loops', () => {
			const { code } = compile(
				`export function App({ items }: { items: string[] }) @{
					@for (const item of items) {
						<div>{item}</div>
					} @empty {
						<p>{'No items'}</p>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<div>{item}</div>');
			expect(code).toContain('No items');
		});

		it('rejects direct loop exits inside for...of template loops', () => {
			for (const [statement, error] of [
				['continue', TSRX_ERRORS.FOR_CONTINUE_STATEMENT],
				['break', TSRX_ERRORS.FOR_BREAK_STATEMENT],
				['return null', TSRX_ERRORS.FOR_RETURN_STATEMENT],
			]) {
				expect(() =>
					compile(
						`export function App({ items }: { items: string[] }) @{
							@for (const item of items) {
								${statement}
								<div>{item}</div>
							}
						}`,
						'App.tsrx',
					),
				).toThrow(error_with(error));
			}
		});

		it('rejects direct returns inside @if template blocks', () => {
			expect(() =>
				compile(
					`export function App({ ready }: { ready: boolean }) @{
						@if (ready) {
							return null
							<div>{'Ready'}</div>
						}
					}`,
					'App.tsrx',
				),
			).toThrow(error_with(TSRX_ERRORS.IF_RETURN_STATEMENT));
		});

		it('rejects nested exits inside @if template blocks', () => {
			for (const [statement, expected] of [
				['return null', TSRX_ERRORS.IF_RETURN_STATEMENT],
				['break', TSRX_ERRORS.IF_BREAK_STATEMENT],
				['continue', TSRX_ERRORS.IF_CONTINUE_STATEMENT],
			]) {
				expect(() =>
					compile(
						`export function App({ ready, items }: { ready: boolean; items: string[] }) @{
							@if (ready) {
								for (const item of items) {
									${statement}
								}
								<div>{'Ready'}</div>
							}
						}`,
						'App.tsrx',
					),
				).toThrow(error_with(expected));
			}
		});

		it('rejects a `var` declared in a directive body or a nested `@{ … }` block, strictly and when collecting (#1208)', () => {
			const source = `export function App({ items }: { items: string[] }) @{
				<>
					<ul title={@{ var count = items.length; <b>{count}</b> }}>
						@for (const item of items) {
							var last = item;
							<li>{item}</li>
						}
					</ul>
					<p>{last}</p>
				</>
			}`;
			const [count, last] = ['var count', 'var last'].map((text) => {
				const start = source.indexOf(text);
				return expect.objectContaining({
					code: TSRX_ERRORS.DIRECTIVE_BODY_VAR.code,
					pos: start,
					end: start + 'var'.length,
				});
			});

			expect(() => compile(source, 'App.tsrx')).toThrow(count);
			expect(compile(source, 'App.tsrx', { collect: true }).errors).toEqual([count, last]);
		});

		it('reports a `var` head and body `var`s in source order, strictly and when collecting (#1208)', () => {
			for (const [loops, order] of /** @type {Array<[string, string[]]>} */ ([
				[
					'@for (var item of items) { var label = item; <li>{label}</li> }',
					['var item', 'var label'],
				],
				[
					'@for (const item of items) { var label = item; <li>{label}</li> } @for (var other of items) { <li /> }',
					['var label', 'var other'],
				],
			])) {
				const source = `export function App({ items }: { items: string[] }) @{
					<ul>
						${loops}
					</ul>
				}`;
				const expected = order.map((text) => {
					const start = source.indexOf(text);
					return expect.objectContaining({
						code: (text === 'var label' ? TSRX_ERRORS.DIRECTIVE_BODY_VAR : TSRX_ERRORS.FOR_HEAD_VAR)
							.code,
						pos: start,
					});
				});

				expect(() => compile(source, 'App.tsrx'), loops).toThrow(expected[0]);
				expect(compile(source, 'App.tsrx', { collect: true }).errors, loops).toEqual(expected);
			}
		});

		it('allows ordinary guard returns inside statement containers', () => {
			const { code } = compile(
				`export function App({ ready }: { ready: boolean }) @{
					if (ready) {
						return <span>{'Ready'}</span>
					}
					<div>{'Fallback'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Ready');
			expect(code).toContain('Fallback');
		});

		it.runIf(['react', 'preact'].includes(name))(
			'keeps explicit loop keys on otherwise static children',
			() => {
				const { code } = compile(
					`export function App() @{
						@for (const item of items; index i; key i) {
							<div>{'test'}</div>
						}
					}`,
					'App.tsrx',
				);

				expect(code).toContain("<div key={i}>{'test'}</div>");
				expect(code).not.toContain('__static');
			},
		);

		it.runIf(['react', 'preact'].includes(name))(
			'keeps implicit loop keys on multi-child static loop bodies',
			() => {
				const { code } = compile(
					`export function App() @{
						@for (const item of items; index i) {
							<>
								<div>{'one'}</div>
								<div>{'two'}</div>
							</>
						}
					}`,
					'App.tsrx',
				);

				const fragment_source = name === 'react' ? 'react' : 'preact';
				expect(code).toContain(`import { Fragment as __Fragment } from '${fragment_source}';`);
				expect(code).toContain('<__Fragment key={i}>');
				expect(code).toContain('</__Fragment>');
			},
		);

		// Targets that identify loop rows by the JSX `key` prop.
		const keys_rows_by_prop = ['react', 'preact', 'hono', 'hono-dom'].includes(name);

		it.runIf(keys_rows_by_prop)('keys each @if branch a keyed loop renders', () => {
			const { code } = compile(
				`export function App({ items }: { items: { id: string; kind: string }[] }) @{
					@for (const item of items; key item.id) {
						@if (item.kind === 'text') {
							<p>{'static'}</p>
						} @else if (item.kind === 'pair') {
							<>
								<b>{item.id}</b>
								<i>{item.id}</i>
							</>
						} @else {
							<Row />
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain("<p key={item.id}>{'static'}</p>");
			expect(code).toContain('<__Fragment key={item.id}>');
			expect(code).toContain('<Row key={item.id} />');
			// A keyed branch element is per-row, so it is never hoisted as a static.
			expect(code).not.toContain('__static');
		});

		it.runIf(keys_rows_by_prop)('keys each @switch case a keyed loop renders', () => {
			const { code } = compile(
				`export function App({ items }: { items: { id: string; kind: string }[] }) @{
					@for (const item of items; key item.id) {
						@switch (item.kind) {
							@case 'text': {
								const label = item.id.toUpperCase();
								<p>{label}</p>
							}
							@default: {
								@if (item.id) {
									<span>{'nested'}</span>
								}
							}
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<p key={item.id}>{label}</p>');
			expect(code).toContain("<span key={item.id}>{'nested'}</span>");
		});

		it.runIf(keys_rows_by_prop)('keys a nested @for a keyed loop renders (#181)', () => {
			const { code } = compile(
				`export function App({ groups }: { groups: { id: string; open: boolean; children: string[] }[] }) @{
					<ul>
						@for (const group of groups; key group.id) {
							@for (const child of group.children; index i) {
								<li>{child}</li>
							}
						}
						@for (const group of groups; key group.id) {
							@if (group.open) {
								@for (const child of group.children) {
									<li>{child}</li>
								}
							}
						}
					</ul>
				}`,
				'App.tsrx',
			);

			expect(code).toMatch(
				/return <__Fragment key=\{group\.id\}>\{__map_iterable\(group\.children, \(child, i\) =>/,
			);
			expect(code).toMatch(
				/group\.open\s*\? <__Fragment key=\{group\.id\}>\{__map_iterable\(group\.children, \(child\) =>/,
			);
			expect(code).toContain('<li key={i}>{child}</li>');
		});

		it.runIf(keys_rows_by_prop)(
			'keeps a key written inside a loop branch and keys the other branches',
			() => {
				const { code } = compile(
					`export function App({ items }: { items: { id: string }[] }) @{
						@for (const item of items; index i) {
							@if (item.id) {
								<li key={item.id}>{item.id}</li>
							} @else {
								<li>{i}</li>
							}
						}
					}`,
					'App.tsrx',
				);

				expect(code).toContain('<li key={item.id}>{item.id}</li>');
				expect(code).toContain('<li key={i}>{i}</li>');
			},
		);

		it.runIf(name === 'vue')('leaves keyed loop branches to the VaporFor row key', () => {
			const { code } = compile(
				`export function App({ items }: { items: { id: string; visible: boolean }[] }) @{
					@for (const item of items; key item.id) {
						@if (item.visible) {
							<li>{item.id}</li>
						} @else {
							<li>{'hidden'}</li>
						}
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('getKey={(item) => item.id}');
			expect(code).not.toContain('key={');
		});

		it('allows ordinary function control flow inside for...of loops', () => {
			const { code } = compile(
				`export function App({ items }: { items: string[] }) @{
					@for (const item of items) {
						function label(value: string) {
							for (let i = 0; i < 1; i++) {
								while (i < 0) {
									break
								}
								if (!value) return 'missing'
							}
							return value
						}
						<div>{label(item)}</div>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function label');
			expect(code).toContain('label(item)');
		});
	});
}

/**
 * Shared anonymous function component regressions. These cover parser support
 * for ordinary function expressions and arrow functions that return JSX.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
export function runSharedAnonymousComponentTests({ compile, name }) {
	describe(`[${name}] anonymous function components`, () => {
		it('parses arrow function components that return JSX', () => {
			const { code } = compile(
				`const Inline = (props: { x: string }) => <div>{props.x}</div>;`,
				'App.tsrx',
			);

			expect(code).toContain(
				name === 'vue'
					? 'const Inline = defineVaporComponent((props: { x: string }) => <div>{props.x}</div>);'
					: 'const Inline = (props: { x: string }) => <div>{props.x}</div>;',
			);
			expect(code).not.toContain('function Inline');
		});

		it('parses function expression components that return JSX', () => {
			const { code } = compile(
				`const Inline = function (props: { x: string }) {
					return <div>{props.x}</div>;
				};`,
				'App.tsrx',
			);

			expect(code).toContain(
				name === 'vue'
					? 'const Inline = defineVaporComponent(function (props: { x: string })'
					: 'const Inline = function (props: { x: string })',
			);
			expect(code).toContain('<div>{props.x}</div>');
			expect(code).not.toContain('function Inline');
		});

		it('lowers function component props inside JSX attribute objects', () => {
			const { code } = compile(
				`export function App() @{
					<Page
						params={{
							menuAlt2: ({ isAdmin, children }: { isAdmin: boolean, children: (items: string[]) => JSX.Element }) => {
								const items: string[] = [];
								if (isAdmin) {
									items.push('Delete', 'Edit');
								} else {
									items.push('View');
								}
								return <>{children(items)}</>;
							},
						}}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('menuAlt2');
			expect(code).toContain('items.push');
			expect(code).toContain('return <>{children(items)}</>;');
		});

		it('lowers expression-bodied function component props', () => {
			const { code } = compile(
				`export function App() @{
					<Child
						children={({ items }: { items: JSX.Element[] }) => <ul>
							@for (const item of items; index i) {
								<li key={i}>{item}</li>
							}
						</ul>}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('children={({ items }: { items: JSX.Element[] }) => <ul>');
			expect(code).toContain(
				name === 'solid'
					? '<__For each={__for_items(items)} keyed={false}>'
					: name === 'vue'
						? '<__VaporFor in={items}'
						: '__map_iterable(items, (item, i)',
			);
			expect(code).toContain(name === 'vue' ? '<li>{item.value}</li>' : '<li key={i}>{item}</li>');
		});

		it('parses semicolon-terminated template expression containers', () => {
			const { code } = compile(
				`export function App() @{
					<Child
						children={({ items }: { items: JSX.Element[] }) => {
							return <ul>
								@for (const item of items; index i) {
									<li key={i}>{item}</li>
								}
							</ul>;
						}}
					/>
				}

				function Child({ children }: { children: (props: { items: JSX.Element[] }) => JSX.Element }) @{
					{
						children({ items: [<span>Item 1</span>, <span>Item 2</span>, <span>Item 3</span>] });
					}
				}`,
				'App.tsrx',
			);

			// Vue reads `children` from the default slot first, then the prop.
			expect(code).toContain(
				name === 'vue' ? '(_$_Child_slots.default?.() ?? children)({' : 'children({',
			);
			expect(code).toContain('Item 3');
		});
	});
}

/**
 * Shared validation that function components behave like ordinary TypeScript
 * functions. TSRX no longer has a special component parameter syntax, so the
 * compiler should not reject additional function parameters.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'> & Pick<CompileDiagnosticsHarness, 'compile_to_volar_mappings'>} harness
 */
export function runSharedComponentParamsTests({ compile, compile_to_volar_mappings, name }) {
	const removed_message = 'TSRX functions accept ordinary TypeScript parameters.';

	describe(`[${name}] function component params`, () => {
		it('accepts a single props parameter', () => {
			expect(() =>
				compile(
					`export function App(props) @{
						<div>{props.value}</div>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('accepts multiple parameters on ordinary functions that return TSRX', () => {
			expect(() =>
				compile(
					`export function App(a, b, c) @{
						<div>{a}{b}{c}</div>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('does not surface removed props-parameter diagnostics via Volar mappings', () => {
			const result = compile_to_volar_mappings(
				`export function App(a, b, c) @{
					<div>{a}{b}{c}</div>
				}`,
				'App.tsrx',
			);

			expect(
				result.errors.some((error) =>
					/** @type {{ message?: string }} */ (error).message?.includes(removed_message),
				),
			).toBe(false);
		});

		it('accepts multiple parameters on class field function components', () => {
			const source = `export class App {
				Inline = (a, b) => <div>{a}{b}</div>;
				static Other = (a, b) => <span>{a}{b}</span>;
			}`;

			expect(() => compile(source, 'App.tsrx')).not.toThrow();

			const result = compile_to_volar_mappings(source, 'App.tsrx');
			expect(
				result.errors.some((error) =>
					/** @type {{ message?: string }} */ (error).message?.includes(removed_message),
				),
			).toBe(false);
		});
	});
}

/**
 * Shared validation that a ref list written on an element, `ref={[a, b]}`,
 * reaches a runtime that takes a single ref as one merged ref. `merge` names
 * the helper the build output merges it with; `null` for a target whose
 * runtime applies a ref list itself (Solid), which keeps the list as written.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'> & Pick<CompileDiagnosticsHarness, 'compile_to_volar_mappings'> & { merge: string | null }} harness
 */
export function runSharedArrayRefTests({ compile, compile_to_volar_mappings, name, merge }) {
	const source = `export function App({ a, b, show }) @{
	<>
		<input ref={[a, [b, show && a]]} />
		<input ref={a} />
	</>
}`;

	describe(`[${name}] ref lists written on an element`, () => {
		it(merge ? 'merges the list into one ref' : 'keeps the list as written', () => {
			const { code } = compile(source, 'App.tsrx');
			const { code: type_only, mappings } = compile_to_volar_mappings(source, 'App.tsrx');

			expect(code).toContain('<input ref={a} />');
			expect(type_only).toContain('<input ref={a} />');
			if (merge === null) {
				expect(code).toContain('<input ref={[a, [b, show && a]]} />');
				expect(code).not.toContain('__mergeRefs');
				expect(type_only).toContain('<input ref={[a, [b, show && a]]} />');
				return;
			}

			expect(code).toContain(`${merge} as __mergeRefs`);
			expect(code).toContain('<input ref={__mergeRefs([a, [b, show && a]])} />');
			// The editor checks the list against the public \`mergeRefs\`, whose
			// type takes ref lists.
			expect(type_only).toContain('mergeRefs as __mergeRefs');
			expect(type_only).toContain('<input ref={__mergeRefs([a, [b, show && a]])} />');

			// The \`ref\` name and the refs in the list keep their source positions.
			for (const [source_text, generated_text, length] of /** @type {const} */ ([
				['ref={[a', 'ref={__mergeRefs([a', 'ref'.length],
				['b, show', 'b, show', 'b'.length],
			])) {
				expect(
					find_exact_mapping(
						mappings,
						source.indexOf(source_text),
						type_only.indexOf(generated_text),
						length,
					),
				).toBeDefined();
			}
		});
	});
}

/**
 * Shared validation that class members returning TSRX behave like ordinary
 * TypeScript class members. Arrow properties, static arrow properties, methods,
 * and function expression properties are all valid shapes.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'> & Pick<CompileDiagnosticsHarness, 'compile_to_volar_mappings'>} harness
 */
export function runSharedClassFunctionComponentTests({ compile, compile_to_volar_mappings, name }) {
	describe(`[${name}] class function components`, () => {
		it('allows an arrow function component as a class property', () => {
			expect(() =>
				compile(
					`export class App {
						Inline = () => <div>{'hi'}</div>;
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('allows an arrow function component as a static class property', () => {
			expect(() =>
				compile(
					`export class App {
						static Inline = () => <div>{'hi'}</div>;
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('allows a class method that returns JSX', () => {
			expect(() =>
				compile(
					`export class App {
						Inline() {
							return <div>{'hi'}</div>;
						}
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('allows a function expression class property that returns JSX', () => {
			expect(() =>
				compile(
					`export class App {
						Inline = function () {
							return <div>{'hi'}</div>;
						};
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('does not flag class members returning TSRX via Volar mappings', () => {
			const result = compile_to_volar_mappings(
				`export class App {
					Inline = () => <div>{'hi'}</div>;
					static Other = () => <span>{'hello'}</span>;
					Method() {
						return <p>{'method'}</p>;
					}
				}`,
				'App.tsrx',
			);

			expect(
				result.errors.some((error) =>
					/** @type {{ message?: string }} */ (error).message?.includes(
						'arrow function class property',
					),
				),
			).toBe(false);
		});
	});
}

/**
 * How each target outputs a raw-text `<script>` body: the form that renders it
 * exactly on the client and from server HTML.
 * @type {Record<string, 'children' | 'dangerouslySetInnerHTML' | 'innerHTML' | 'v-html'>}
 */
const SCRIPT_BODY_FORMS = {
	react: 'children',
	preact: 'dangerouslySetInnerHTML',
	hono: 'dangerouslySetInnerHTML',
	solid: 'innerHTML',
	vue: 'v-html',
};

/**
 * The `<script>` elements of compiled TSX, each with the form its body takes
 * and the string it holds.
 * @param {string} code
 * @returns {Array<{ form: string | null, body: string | null, children: number }>}
 */
function compiled_scripts(code) {
	const source_file = ts.createSourceFile(
		'compiled.tsx',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	/** @type {Array<{ form: string | null, body: string | null, children: number }>} */
	const scripts = [];
	/** @param {ts.Expression | undefined} expression */
	const string_of = (expression) =>
		expression && ts.isStringLiteralLike(expression) ? expression.text : null;
	/** @param {ts.Node} node */
	const visit = (node) => {
		const opening = ts.isJsxElement(node)
			? node.openingElement
			: ts.isJsxSelfClosingElement(node)
				? node
				: null;
		if (opening && opening.tagName.getText(source_file) === 'script') {
			const children = ts.isJsxElement(node)
				? node.children.filter((child) => !ts.isJsxText(child) || child.text.trim() !== '')
				: [];
			/** @type {{ form: string | null, body: string | null, children: number }} */
			const script = { form: null, body: null, children: children.length };
			const only = children[0];
			if (children.length === 1 && ts.isJsxExpression(only)) {
				script.form = 'children';
				script.body = string_of(only.expression);
			}
			for (const attribute of opening.attributes.properties) {
				if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
				const attribute_name = attribute.name.getText(source_file);
				const value = ts.isJsxExpression(attribute.initializer)
					? attribute.initializer.expression
					: undefined;
				if (attribute_name === 'innerHTML' || attribute_name === 'v-html') {
					script.form = attribute_name;
					script.body = string_of(value);
				} else if (
					attribute_name === 'dangerouslySetInnerHTML' &&
					value &&
					ts.isObjectLiteralExpression(value)
				) {
					const html = value.properties.find(
						(property) =>
							ts.isPropertyAssignment(property) && property.name.getText(source_file) === '__html',
					);
					script.form = 'dangerouslySetInnerHTML';
					script.body = html && ts.isPropertyAssignment(html) ? string_of(html.initializer) : null;
				}
			}
			scripts.push(script);
		}
		ts.forEachChild(node, visit);
	};
	visit(source_file);
	return scripts;
}

/**
 * A `<script>` element is raw text: its body is `content`, as written, with no
 * comments, no character references, and no `{…}` expressions, and its line
 * breaks stay. Each target outputs it in the form that renders it exactly
 * (#708).
 * @param {{ compile: CompileHarness['compile'], name: string }} options
 */
function runSharedScriptBodyTests({ compile, name }) {
	const form = SCRIPT_BODY_FORMS[name];

	describe(`[${name}] raw-text script bodies`, () => {
		const code_body = `
			// c
			run();
			if (a < b && b > c) x = "&amp;";
			items.forEach((i) => { log(i); });
		`;

		/** @type {Array<[string, string, string]>} */
		const cases = [
			[
				'a template',
				`export function App() @{
	<div>
		<script>${code_body}</script>
	</div>
}`,
				code_body,
			],
			[
				'plain JSX',
				`export function App() {
	return <div><script>${code_body}</script></div>;
}`,
				code_body,
			],
			[
				'a JSON body',
				`export function App() @{
	<script type="application/json" id="data">{"a": 1, "b": "<b>&amp;</b>"}</script>
}`,
				'{"a": 1, "b": "<b>&amp;</b>"}',
			],
			[
				'an import map',
				`export function App() @{
	<script type="importmap">
		{ "imports": { "x": "./x.js" } }
	</script>
}`,
				`
		{ "imports": { "x": "./x.js" } }
	`,
			],
			[
				'braces, as text',
				`export function App() {
	const code = 'window.__ran = 1;';
	return <div><script>{code}</script></div>;
}`,
				'{code}',
			],
			[
				'a closing tag with whitespace',
				`export function App() @{
	<div><script>a = 1;</script
	></div>
}`,
				'a = 1;',
			],
			[
				'an escaped end tag',
				`export function App() @{
	<script>const tag = "<\\/script>";</script>
}`,
				'const tag = "<\\/script>";',
			],
		];

		it.each(cases)(`outputs the body in %s as written, as \`${form}\``, (_label, source, body) => {
			const { code } = compile(source, 'App.tsrx');

			expect(compiled_scripts(code)).toEqual([
				{ form, body, children: form === 'children' ? 1 : 0 },
			]);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
		});

		it('never reads braces in a body as an expression', () => {
			const { code } = compile(
				`export function App() {
	return <div><script>{code}</script></div>;
}`,
				'App.tsrx',
			);

			expect(code).not.toMatch(/\{code\}(?!['"])/);
		});

		it('outputs a body of only whitespace as an empty script, as the formatter prints it', () => {
			const { code } = compile(
				`export function App() @{
	<script src="/a.js">
	</script>
}`,
				'App.tsrx',
			);

			expect(compiled_scripts(code)).toEqual([{ form: null, body: null, children: 0 }]);
		});

		it("keeps a self-closing script with the target's prop for a dynamic body", () => {
			const dynamic =
				form === 'innerHTML' || form === 'v-html' ? 'innerHTML' : 'dangerouslySetInnerHTML';
			const { code } = compile(
				`export function App() @{
	const code = 'window.__ran = 1;';
	<script type="module" ${dynamic}={${dynamic === 'dangerouslySetInnerHTML' ? '{ __html: code }' : 'code'}} />
}`,
				'App.tsrx',
			);

			expect(compiled_scripts(code)).toEqual([{ form: dynamic, body: null, children: 0 }]);
			expect(code).toContain('type="module"');
		});
	});
}

/**
 * Shared compile-output regressions. These assert observable properties of
 * the generated code (not source-map structure) that every JSX target should
 * satisfy across whatever `transformElement` hook the platform wires in.
 * Target-specific shapes (Vue's `defineVaporComponent` export wrapper and
 * Suspense slot fallbacks) are guarded inline with `it.runIf`.
 *
 * @param {CompileHarness} harness
 */
export function runSharedCompileTests({
	compile,
	name,
	classAttrName,
	generatedClassAttrName = classAttrName,
	classJoin = CLASS_VALUE_KINDS[name] ?? null,
	// Solid and Vue compile an authored `className` to `class`.
	classNameAttr = name === 'solid' || name === 'vue' ? 'class' : 'className',
}) {
	const componentClassAttrName = name === 'react' ? 'className' : 'class';
	const componentClassParam =
		componentClassAttrName === 'className'
			? '{ className }: { className?: string }'
			: '{ class: className }: { class?: string }';
	// Solid and Vue Vapor JSX evaluates to a DOM node, so these targets leave
	// static JSX in place rather than hoist one node that every use would
	// share (#1236, #1240).
	const hoistsStaticJsx = !['solid', 'vue'].includes(name);

	runSharedPlatformTests({ compile, name });

	runSharedComponentLoopControlFlowTests({ compile, name });
	runSharedScopedStyleTests({
		compile,
		name,
		classAttrName,
		generatedClassAttrName,
		classJoin,
		classNameAttr,
	});
	runSharedScopedStyleConformanceTests({
		compile,
		name,
		classAttrName,
		generatedClassAttrName,
		classJoin,
	});

	describe(`[${name}] directive prologue`, () => {
		// Each construct below makes the target inject at least one import.
		const body = `import { label } from './label';

			export function App({ rows, tag }: { rows: string[]; tag: string }) @{
				<div>
					@try {
						<ul>@for (const row of rows; key row) { <><li>{row}</li><li>{label}</li></> }</ul>
					} @pending {
						<p>{'loading'}</p>
					} @catch (error) {
						<p>{'failed'}</p>
					}
					<{tag} />
				</div>
			}`;

		/**
		 * @param {string} code
		 * @returns {string[]}
		 */
		function leading_statements(code) {
			const source_file = ts.createSourceFile(
				'out.tsx',
				code,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			);
			return source_file.statements.map((statement) => statement.getText(source_file));
		}

		it.each([
			{ label: "'use client'", directives: [`'use client';`] },
			{ label: "'use server'", directives: [`'use server';`] },
			{ label: "'use client' and 'use strict'", directives: [`'use client';`, `'use strict';`] },
		])('keeps $label first ahead of generated imports', ({ directives }) => {
			for (const options of [undefined, { collect: true }]) {
				const { code } = compile(`${directives.join('\n')}\n\n${body}`, 'App.tsrx', options);
				const statements = leading_statements(code);

				expect(statements.slice(0, directives.length)).toEqual(directives);
				expect(statements[directives.length]).toMatch(/^import /);
				expect(
					statements.slice(directives.length).filter((s) => s.startsWith('import ')).length,
				).toBeGreaterThan(1);
			}
		});
	});

	describe(`[${name}] import phases`, () => {
		it('preserves deferred imports in compiled output', () => {
			const { code } = compile(
				`import defer * as feature from './feature.js';
				const lazy = import.defer('./lazy.js', { with: { type: 'json' } });

				export function App() {
					return <div>{feature.value}</div>;
				}`,
				'App.tsrx',
			);

			expect(code).toContain("import defer * as feature from './feature.js';");
			expect(code).toContain("import.defer('./lazy.js', { with: { type: 'json' } })");
		});

		it('preserves source phase imports in compiled output', () => {
			const { code } = compile(
				`import source module from './module.wasm';
				export const later = import.source('./later.wasm');

				export function App() @{
					const render = import.source('./render.wasm');
					<p>{String([module, render])}</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain("import source module from './module.wasm';");
			expect(code).toContain("import.source('./later.wasm')");
			expect(code).toContain("import.source('./render.wasm')");
		});
	});

	describe(`[${name}] syntax newer than ES2022`, () => {
		// The parser reports a hashbang as the `Line` comment at offset 0; the
		// output keeps it as written, once, and ahead of any injected import.
		it('keeps a hashbang as the first line', () => {
			const source = `#!/usr/bin/env node
// A comment after the hashbang
import { value } from './value.js';

export function App() @{
	<div>{value}</div>
}
`;

			for (const options of [undefined, { collect: true }]) {
				const { code } = compile(source, 'App.tsrx', options);

				expect(code.startsWith('#!/usr/bin/env node\n')).toBe(true);
				expect(count_substring(code, '/usr/bin/env node')).toBe(1);
				expect(virtual_parse_diagnostics(code)).toEqual([]);
			}
		});

		it('keeps the hashbang of a file without statements', () => {
			expect(compile('#!/usr/bin/env node\n', 'App.tsrx').code).toBe('#!/usr/bin/env node');
		});

		it('prints using and await using declarations unchanged', () => {
			const { code } = compile(
				`using module_handle = open();

				export function App() @{
					using handle: Disposable = open();
					<div>{handle.name}</div>
				}

				export async function load(items: Iterable<Disposable>, stream: AsyncIterable<AsyncDisposable>) {
					await using connection = await connect(), other = open();
					for (using item of items) {}
					for await (await using item of stream) {}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('using module_handle = open();');
			expect(code).toContain('using handle: Disposable = open();');
			expect(code).toMatch(/await using connection = await connect\(\),\s+other = open\(\);/);
			expect(code).toContain('for (using item of items) {}');
			expect(code).toContain('for await (await using item of stream) {}');
			expect(virtual_parse_diagnostics(code)).toEqual([]);
		});

		it('keeps regular expressions with the v flag and modifiers', () => {
			const { code } = compile(
				`export const set = /[\\p{L}--[a-z]]/v;
				export const modified = /(?i:a)b/;`,
				'App.tsrx',
			);

			expect(code).toContain('/[\\p{L}--[a-z]]/v');
			expect(code).toContain('/(?i:a)b/');
		});
	});

	describe(`[${name}] literal \`<\` in text`, () => {
		// The TSRX parser reads a `<` that cannot start a tag as literal text
		// (`<span><3</span>`), but the compiled output is re-parsed by a JSX
		// toolchain (esbuild, Babel, SWC) that forbids a bare `<` in text, so the
		// printer must emit it as `&lt;` — which decodes back to the same string.
		it('escapes a literal `<` in text as `&lt;`', () => {
			const { code } = compile(
				`export function App() { return <span><3 and a < b</span>; }`,
				'App.tsrx',
			);

			expect(code).toContain('<span>&lt;3 and a &lt; b</span>');
		});
	});

	runSharedScriptBodyTests({ compile, name });

	describe(`[${name}] characters that JSX text can't hold`, () => {
		/**
		 * @param {string} body
		 * @param {string} [before]
		 */
		const component = (body, before = '') => `export function App() @{
	${before}<main>${body}</main>
}`;

		// A `>` is text in a template, as a `<` that can't start a tag is. JSX
		// rejects both in text (TS1382), so each is written as a character
		// reference. In a `{…}` container, the text before a `>` was dropped
		// when it followed a tag, and after a child container the `>` failed
		// (#694).
		/** @type {Array<[string, string, string]>} */
		const greater_than = [
			['a template', component('<b>a > b</b>'), '<b>a &gt; b</b>'],
			['a template after a tag', component('<b><i />a > b</b>'), '<i />a &gt; b</b>'],
			['a container', component('{c && <b>a > b</b>}'), '<b>a &gt; b</b>'],
			['a container, first', component('{c && <b>> b</b>}'), '<b>&gt; b</b>'],
			['a container, an arrow', component('{c && <b>a => b</b>}'), '<b>a =&gt; b</b>'],
			['a container after a tag', component('{c && <b><i />a > b</b>}'), '<i />a &gt; b</b>'],
			[
				'a container after a child container',
				component('{c && <b>{y} a > b</b>}'),
				'{y} a &gt; b</b>',
			],
			['an attribute value', component('<div title={<b>a > b</b>} />'), '<b>a &gt; b</b>'],
			['an unbraced attribute value', component('<div title=<b>a > b</b> />'), '<b>a &gt; b</b>'],
			[
				'an unbraced attribute value, first',
				component('<div title=<b>> b</b> />'),
				'<b>&gt; b</b>',
			],
			[
				'an unbraced attribute value in a container',
				component('{c && <div title=<b>a > b</b> />}'),
				'<b>a &gt; b</b>',
			],
			[
				"a spread attribute's argument",
				component('<div {...{ title: <b>a > b</b> }} />'),
				'<b>a &gt; b</b>',
			],
			['an @if body', component('@if (c) { <b>a > b</b> }'), '<b>a &gt; b</b>'],
			[
				'an @if body in a container',
				component('{c && <p>@if (d) { <b>a > b</b> }</p>}'),
				'<b>a &gt; b</b>',
			],
			[
				'an @switch body',
				component('@switch (c) { @case 1: { <b>a > b</b> } }'),
				'<b>a &gt; b</b>',
			],
			['an @for body', component('@for (const i of c) { <b>a > b</b> }'), '<b>a &gt; b</b>'],
			[
				'a setup statement',
				component(
					'{v}',
					`const v = <b>{y} a > b</b>;
	`,
				),
				'{y} a &gt; b</b>',
			],
			[
				'a function',
				`export function App() {
	return <main>{c && <b>a > b</b>}</main>;
}`,
				'<b>a &gt; b</b>',
			],
		];

		it.each(greater_than)('writes a `>` in text in %s as `&gt;`', (_label, source, expected) => {
			const { code } = compile(source, 'App.tsrx');

			expect(code).toContain(expected);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
		});

		// Text is written as it is in the source, its `raw`, character references
		// included. In an element that acorn-typescript's JSX parser read, in a
		// spread attribute's argument or an unbraced attribute value in a
		// container, the output printed the decoded `value`, so `&#123;x&#125;`
		// compiled to the expression `{x}`, and `&gt;` to a bare `>` (#693).
		// Since #656 those are template text, and that parser reads only an
		// element in a dynamic tag name, which is reported (#737): see the virtual
		// code of reported dynamic tags.
		/** @type {Array<[string, string, string]>} */
		const references = [
			[
				'a spread argument',
				component('<div {...{ title: <b>&#123;x&#125; &amp;lt; &gt;</b> }} />'),
				'<b>&#123;x&#125; &amp;lt; &gt;</b>',
			],
			[
				'an unbraced attribute value in a container',
				component('{c && <div title=<b>&#123;x&#125; &amp;lt; &gt;</b> />}'),
				'<b>&#123;x&#125; &amp;lt; &gt;</b>',
			],
			[
				'a template',
				component('<b>&#123;x&#125; &amp;lt; &gt;</b>'),
				'<b>&#123;x&#125; &amp;lt; &gt;</b>',
			],
			[
				'an attribute value',
				component('<div title={<b>&#123;x&#125; &amp;lt; &gt;</b>} />'),
				'<b>&#123;x&#125; &amp;lt; &gt;</b>',
			],
		];

		it.each(references)(
			'keeps the character references in text in %s',
			(_label, source, expected) => {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain(expected);
				expect(virtual_parse_diagnostics(code)).toEqual([]);
			},
		);
	});

	describe(`[${name}] parentheses around an element operand`, () => {
		// The output dropped the parentheses: TypeScript read
		// `return <b>ok</b>.type …` as `return <b>ok</b>;` and a separate
		// statement (#1166), and rejected `class A extends <div /> {}` (#745).
		it.each(ELEMENT_OPERAND_CASES)(
			'keeps the parentheses around an element in %s',
			(_label, source) => {
				const { code } = compile(source, 'App.tsrx');

				expect(virtual_parse_diagnostics(code)).toEqual([]);
				expect(tsx_shape(code)).toBe(tsx_shape(source));
			},
		);

		it('applies the member access to the element when the output runs', () => {
			const { code } = compile(ELEMENT_OPERAND_CASES[0][1], 'App.tsrx');
			const module = { exports: /** @type {Record<string, any>} */ ({}) };
			const commonjs = ts.transpileModule(code, {
				compilerOptions: {
					jsx: ts.JsxEmit.React,
					jsxFactory: 'h',
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ES2022,
				},
			}).outputText;
			new Function('module', 'exports', 'h', commonjs)(
				module,
				module.exports,
				(/** @type {string} */ type) => ({ type }),
			);

			expect(module.exports.f('b')).toBe(1);
			expect(module.exports.f('i')).toBe(2);
		});

		// A template in a callee position compiles to a fragment around it.
		it('parenthesizes an element that the transform creates', () => {
			const { code } = compile('export const value = (@{ <b /> })(x);', 'App.tsrx');
			const source_file = ts.createSourceFile(
				'virtual.tsx',
				code,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TSX,
			);
			const statement = source_file.statements.find(ts.isVariableStatement);
			const call = statement?.declarationList.declarations[0].initializer;

			expect(virtual_parse_diagnostics(code)).toEqual([]);
			expect(call && ts.isCallExpression(call)).toBe(true);
			const callee = /** @type {ts.CallExpression} */ (call).expression;
			expect(ts.isParenthesizedExpression(callee)).toBe(true);
			expect(ts.isJsxFragment(/** @type {ts.ParenthesizedExpression} */ (callee).expression)).toBe(
				true,
			);
		});

		it('adds no parentheses around an element that is an operand of an operator', () => {
			const source = `export function f(x: any, y: any) {
	return [
		!<b />,
		typeof <b />,
		<b /> as unknown,
		<b /> satisfies unknown,
		x ?? <b />,
		() => <b />,
		<b /> <= x,
		<b /> > x,
		<b /> << x,
		x < <b />,
		!<b /> < x,
		x + -<b /> < y,
		(x == <b />) < y,
		x ** (y * <b />) < x,
	];
}`;
			const { code } = compile(source, 'App.tsrx');

			expect(code).not.toContain('(<');
			expect(virtual_parse_diagnostics(code)).toEqual([]);
			expect(tsx_shape(code)).toBe(tsx_shape(source));
		});
	});

	describe(`[${name}] fragment expression children`, () => {
		// A bare expression placed directly as a JSX child reads as JSX text
		// (`<>{a}b</>` renders the letter "b"), so every expression that ends up
		// in a fragment children list must keep its `{ … }` container.

		it('keeps a sibling nested-fragment expression in a container', () => {
			const { code } = compile(
				`function App() @{
					const a = 1, b = 2;
					<>{a} <>{<>{b}</>}</></>
				}`,
				'App.tsrx',
			);

			// The inline space between the two expressions is interior, so it stays
			// bare; only fragment-edge whitespace becomes `{' '}`.
			expect(code).toContain('<>{a} {b}</>');
			expect(code).not.toContain('<>{a}b</>');
		});

		it('keeps expressions at every level of nested fragments in expression position', () => {
			const { code } = compile(
				`function StatusBadge() @{
					const a = 1;
					<>{<>{a} <>{<>{a}</>}</> </>}</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('{a} {a}');
			expect(code).not.toContain('<>{a}a</>');
			expect(code).not.toContain('<>aa</>');
		});

		// Regression: an empty fragment as a container's expression must stay
		// `{<></>}`, not be lowered to the bare `{null}` of expression position.
		it('keeps an empty fragment inside a container as a fragment', () => {
			const { code } = compile(
				`function App() @{
					<b>{<></>}</b>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<b>{<></>}</b>');
			expect(code).not.toContain('{null}');
		});

		it('keeps an empty fragment in expression position as a fragment', () => {
			const { code } = compile(
				`function App() @{
					let b = <></>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let b = <></>;');
			expect(code).not.toContain('let b = null;');
		});

		it('keeps the outer fragment of a nested empty fragment in expression position', () => {
			const { code } = compile(
				`function App() @{
					let c = <><></></>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let c = <><></></>;');
		});

		it('keeps an empty expression container fragment as a fragment in expression position', () => {
			const { code } = compile(
				`function App() @{
					let c = <>{}</>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let c = <></>;');
			expect(code).not.toMatch(/let c = ;/);
		});

		it('keeps a comment-only container fragment as a fragment in expression position', () => {
			const { code } = compile(
				`function App() @{
					let c = <>{/* note */}</>;
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('let c = <></>;');
			expect(code).not.toMatch(/let c = ;/);
		});
	});

	describe(`[${name}] JSX spread children`, () => {
		// Spread children parse, but analysis reports them on every target: a
		// normal compile throws, and collect mode records the diagnostic and
		// still produces code.
		const cases = [
			[
				'a template child',
				`export function App({ items }: { items: any[] }) @{
	<div>
		{...items}
		<span />
	</div>
}`,
			],
			[
				'the only child of a fragment',
				`export function App({ items }: { items: any[] }) @{\n\t<>{...items}</>\n}`,
			],
			[
				'a child in plain TSX',
				`export function List({ items }: { items: any[] }) {\n\treturn <ul>{...items}</ul>;\n}`,
			],
			[
				'a child of an element in an attribute value',
				`export function App({ items }: { items: any[] }) @{\n\t<Card content={<i>{...items}</i>} />\n}`,
			],
		];

		for (const [label, source] of cases) {
			const start = source.indexOf('{...items}');
			const end = start + '{...items}'.length;

			it(`throws for ${label}`, () => {
				expect(() => compile(source, 'App.tsrx')).toThrow(
					expect.objectContaining({
						code: TSRX_ERRORS.JSX_SPREAD_CHILD.code,
						pos: start,
						end,
					}),
				);
			});

			it(`records ${label} in collect mode`, () => {
				const { code, errors } = compile(source, 'App.tsrx', { collect: true });

				expect(errors.map((error) => [error.code, error.pos, error.end])).toEqual([
					[TSRX_ERRORS.JSX_SPREAD_CHILD.code, start, end],
				]);
				expect(virtual_parse_diagnostics(code), code).toEqual([]);
			});
		}
	});

	describe(`[${name}] dynamic tag expressions (#737)`, () => {
		// A dynamic tag expression is an identifier, a member access, or a string
		// literal. The parser reports anything else on every target: a normal
		// compile throws, and collect mode records the diagnostic, once for the
		// opening and closing tag, and still produces code.
		/** @type {Array<[string, string]>} */
		const reported = [
			['a conditional', 'c ? A : B'],
			['a call', 'getTag()'],
			['a concatenation', "'h' + level"],
			['an arrow function', '() => <b>x</b>'],
			['an element', "c ? <b>&#123;x&#125; &amp;lt; &gt;</b> : 'i'"],
			['a parenthesized identifier', '(tag)'],
			['a type assertion', 'tag as any'],
		];

		for (const [label, tag] of reported) {
			const source = `export function App({ c, A, B, getTag, level, tag }: any) @{
	<main>
		<{${tag}} title="t">
			<p>{c}</p>
		</{${tag}}>
	</main>
}`;
			const start = source.indexOf(tag);
			const end = start + tag.length;

			it(`throws for ${label}`, () => {
				expect(() => compile(source, 'App.tsrx')).toThrow(
					expect.objectContaining({
						code: TSRX_ERRORS.DYNAMIC_TAG_EXPRESSION.code,
						pos: start,
						end,
					}),
				);
			});

			it(`records ${label} in collect mode`, () => {
				const { code, errors } = compile(source, 'App.tsrx', { collect: true });

				expect(errors.map((error) => [error.code, error.pos, error.end])).toEqual([
					[TSRX_ERRORS.DYNAMIC_TAG_EXPRESSION.code, start, end],
				]);
				expect(virtual_parse_diagnostics(code), code).toEqual([]);
			});
		}

		it('compiles an identifier, a member access, and a string literal', () => {
			const { code } = compile(
				`export function App({ tag, props, registry, items, kind }: any) @{
	<main>
		<{tag} />
		<{props.as}>x</{props.as}>
		<{registry[kind].tag} />
		<{items[0]} />
		<{'section'} />
	</main>
}`,
				'App.tsrx',
			);

			expect(virtual_parse_diagnostics(code), code).toEqual([]);
		});
	});

	describe(`[${name}] type arguments after a dynamic tag (#1243)`, () => {
		// They would type the helper the tag lowers to, not the tag, so the parser
		// reports them on every target.
		const source = `export function App({ Tag, title }: any) @{
	<main>
		<{Tag}<string> title={title}>
			<p>{title}</p>
		</{Tag}>
	</main>
}`;
		const start = source.indexOf('<string>');
		const end = start + '<string>'.length;

		it('throws', () => {
			expect(() => compile(source, 'App.tsrx')).toThrow(
				expect.objectContaining({
					code: TSRX_ERRORS.DYNAMIC_TAG_TYPE_ARGUMENTS.code,
					pos: start,
					end,
				}),
			);
		});

		it('records them in collect mode, and leaves them out of the code', () => {
			const { code, errors } = compile(source, 'App.tsrx', { collect: true });

			expect(errors.map((error) => [error.code, error.pos, error.end])).toEqual([
				[TSRX_ERRORS.DYNAMIC_TAG_TYPE_ARGUMENTS.code, start, end],
			]);
			expect(virtual_parse_diagnostics(code), code).toEqual([]);
			expect(code).not.toContain('<string>');
		});
	});

	describe(`[${name}] component export shapes`, () => {
		// Export prefix preservation should stay stable per target. Vue wraps
		// every component in `defineVaporComponent(...)`; the other targets
		// keep the authored function declaration. Any future change that
		// double-exports, strips a default, or otherwise changes the
		// declaration wrapper fails here first.

		it('keeps plain components local unless explicitly exported', () => {
			const { code } = compile(
				`function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function App() {');
			expect(code).toContain("{'Hello world'}");
			expect(code).not.toContain('export function App');
			expect(code).not.toContain('export default function App');
		});

		it.runIf(name !== 'vue')('preserves named component exports without double-exporting', () => {
			const { code } = compile(
				`export function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export function App()');
			expect(code).toContain("{'Hello world'}");
			expect(code).not.toContain('export export function App()');
		});

		it.runIf(name === 'vue')(
			'wraps named component exports in defineVaporComponent without double-exporting',
			() => {
				const { code } = compile(
					`export function App() @{
						<div>{'Hello world'}</div>
					}`,
					'App.tsrx',
				);

				expect(code).toContain('export const App = defineVaporComponent(function App()');
				expect(code).toContain("{'Hello world'}");
				expect(code).not.toContain('export function App');
			},
		);

		it.runIf(name !== 'vue')('preserves default component exports', () => {
			const { code } = compile(
				`export default function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export default function App()');
			expect(code).toContain("{'Hello world'}");
		});

		it.runIf(name === 'vue')('wraps default component exports in defineVaporComponent', () => {
			const { code } = compile(
				`export default function App() @{
					<div>{'Hello world'}</div>
				}`,
				'App.tsrx',
			);

			// `export default function App` also binds `App` in the module.
			expect(code).toContain('const App = defineVaporComponent(function App()');
			expect(code).toContain('export default App;');
			expect(code).toContain("{'Hello world'}");
		});

		it('preserves component type parameters on the emitted function', () => {
			const { code } = compile(
				`type Props<Item> = {
					items: readonly Item[];
				}

				export function MyComponent<Item>(props: Props<Item>) @{
					<div />
				}`,
				'App.tsrx',
			);

			expect(code).toContain(
				name === 'vue'
					? 'export const MyComponent = defineVaporComponent(function MyComponent<Item>(props: Props<Item>)'
					: 'export function MyComponent<Item>(props: Props<Item>)',
			);
		});

		it('preserves generic type arguments on JSX component tags', () => {
			const { code } = compile(
				`type User = { name: string };

				function RenderProp<Item>(props: { children: (item: Item) => any }) { return null; }

				export function App() @{
					<RenderProp<User>>
						{(item) => item.name}
					</RenderProp>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<RenderProp<User>>');
		});

		it('preserves generic type arguments on self-closing JSX component tags', () => {
			const { code } = compile(
				`function Box<T>({ value }: { value: T }) @{
					<div>{String(value)}</div>
				}

				export function App() @{
					<Box<string> value="hi" />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<Box<string>');
		});
	});

	describe(`[${name}] component try pending fallbacks`, () => {
		// Vue lowers `@pending` to a Suspense slot object, the other targets to
		// a `fallback={...}` prop — an empty block must not emit a fallback slot
		// or a fallback prop respectively.
		it('allows empty pending blocks as null fallbacks', () => {
			const { code } = compile(
				`export function App() @{
					@try {
						<div>{'content'}</div>
					} @pending {}
				}`,
				'App.tsrx',
			);

			expect(code).toContain("{'content'}");
			if (name === 'vue') {
				expect(code).toContain('Suspense');
				expect(code).toContain('v-slots=');
				expect(code).toContain('default: () =>');
				expect(code).not.toContain('fallback: () =>');
				expect(code).not.toContain('fallback={');
			} else {
				expect(code).toContain('fallback={null}');
			}
		});
	});

	// The parser reads a `pending` block, and a reset parameter after a `catch`
	// parameter, on a plain `try` (not `@try`) for `@tsrx/ripple`. These targets
	// report each where TypeScript does (#1303).
	describe(`[${name}] a plain try with a pending block or a reset parameter (#1303)`, () => {
		/** @type {Array<[source: string, code: string, at: string]>} */
		const cases = [
			[
				'export function f() {\n\ttry {\n\t\ta();\n\t} pending {\n\t\tb();\n\t}\n}\n',
				TS_ERRORS.CATCH_OR_FINALLY_EXPECTED.code,
				'pending',
			],
			[
				'export function f() {\n\ttry {\n\t\ta();\n\t} pending {\n\t\tb();\n\t} catch (e) {\n\t\tc();\n\t}\n}\n',
				TS_ERRORS.CATCH_OR_FINALLY_EXPECTED.code,
				'pending',
			],
			[
				'export function App() @{\n\ttry { a(); } /* p */ pending { b(); } finally { d(); }\n\t<div />\n}\n',
				TS_ERRORS.CATCH_OR_FINALLY_EXPECTED.code,
				'pending',
			],
			// A `return` of an element in the `try`, which rebuilds it (Bugbot on #1335)
			[
				'export function App() @{\n\ttry { return <a />; } pending { b(); }\n\t<div />\n}\n',
				TS_ERRORS.CATCH_OR_FINALLY_EXPECTED.code,
				'pending',
			],
			[
				'export function f() {\n\ttry { a(); } catch (e /* x, y */, reset) { reset(); }\n}\n',
				TS_ERRORS.TOKEN_EXPECTED.code,
				', reset',
			],
			// A line comment that a carriage return or a line separator ends
			...['\r', '\u2028'].map(
				(/** @type {string} */ terminator) =>
					/** @type {[string, string, string]} */ ([
						`export function f() {\n\ttry { a(); } catch (e // x, y${terminator}, reset) { reset(); }\n}\n`,
						TS_ERRORS.TOKEN_EXPECTED.code,
						', reset',
					]),
			),
		];

		it('throws the error at `pending` or at the comma', () => {
			for (const [source, code, at] of cases) {
				expect(() => compile(source, 'App.tsrx'), source).toThrow(
					expect.objectContaining({ code, pos: source.indexOf(at) }),
				);
			}
		});

		it.each([{ collect: true }, { loose: true }])(
			'records it and keeps the pending block in the output (%o)',
			(options) => {
				for (const [source, code, at] of cases) {
					const result = compile(source, 'App.tsrx', options);
					expect(
						result.errors.map((error) => [error.code, error.pos]),
						source,
					).toEqual([[code, source.indexOf(at)]]);
					if (source.includes('pending')) {
						expect(result.code, source).toMatch(/finally \{\s*(\{\s*)?b\(\);/);
						expect(result.code, source).not.toContain('pending');
					}
				}
			},
		);

		it('leaves `@try … @pending` alone', () => {
			const { code } = compile(
				`export function App() @{\n\t@try { <p>{'ready'}</p> } @pending { <p>{'loading'}</p> }\n}`,
				'App.tsrx',
			);
			expect(code).toContain("{'loading'}");
			expect(code).not.toContain('finally');
		});
	});

	// The components each target imports itself, and the sources it imports
	// them from. React, Preact and Hono share the core import injector; Solid
	// and Vue have their own. Vue's `defineVaporComponent` keeps its public
	// name: vue-jsx-vapor finds components by that callee name.
	const generated_import_sources = /** @type {Record<string, Record<string, string>>} */ ({
		react: {
			Suspense: 'react',
			Fragment: 'react',
			TsrxErrorBoundary: '@tsrx/react/error-boundary',
		},
		preact: {
			Suspense: 'preact/compat',
			Fragment: 'preact',
			TsrxErrorBoundary: '@tsrx/preact/error-boundary',
		},
		hono: {
			Suspense: 'hono/jsx',
			Fragment: 'hono/jsx',
			TsrxErrorBoundary: '@tsrx/hono/error-boundary',
		},
		solid: {
			Show: 'solid-js',
			For: 'solid-js',
			Switch: 'solid-js',
			Match: 'solid-js',
			Errored: 'solid-js',
			Loading: 'solid-js',
		},
		vue: {
			VaporFor: 'vue-jsx-vapor',
		},
	})[name];

	if (generated_import_sources) {
		const sources = generated_import_sources;

		describe(`[${name}] generated imports beside authored bindings`, () => {
			/** @type {Record<string, string>} */
			const templates = {
				Suspense: `<div>@try { <p>{'ready'}</p> } @pending { <p>{'loading'}</p> }</div>`,
				TsrxErrorBoundary: `<div>@try { <p>{'ready'}</p> } @catch (error) { <p>{'failed'}</p> }</div>`,
				Fragment: `<ul>@for (const row of rows; key row) { <><li>{row}</li><li>{'end'}</li></> }</ul>`,
				Show: `<div>@if (rows.length > 0) { <p>{'some'}</p> }</div>`,
				For: `<ul>@for (const row of rows) { <li>{row}</li> }</ul>`,
				Switch: `<div>@switch (rows[0]) { @case 'a': { <p>{'a'}</p> } @default: { <p>{'other'}</p> } }</div>`,
				Match: `<div>@switch (rows[0]) { @case 'a': { <p>{'a'}</p> } @default: { <p>{'other'}</p> } }</div>`,
				Errored: `<div>@try { <p>{'ready'}</p> } @catch (error) { <p>{'failed'}</p> }</div>`,
				Loading: `<div>@try { <p>{'ready'}</p> } @pending { <p>{'loading'}</p> }</div>`,
				VaporFor: `<ul>@for (const row of rows; key row) { <li>{row}</li> }</ul>`,
			};

			/**
			 * @param {string} generated
			 * @param {string} module_scope
			 * @param {string} [setup]
			 * @param {string} [template]
			 */
			function compile_beside(generated, module_scope, setup = '', template) {
				return compile(
					`${module_scope}

					export function App({ rows }: { rows: string[] }) @{
						${setup}
						${template ?? templates[generated]}
					}`,
					'App.tsrx',
				).code;
			}

			/**
			 * @param {string} code
			 * @param {string} generated
			 */
			function expect_private_generated_binding(code, generated) {
				const redeclarations = virtual_semantic_diagnostics(code)
					.filter((diagnostic) => [2300, 2440, 2451].includes(diagnostic.code))
					.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
				expect(redeclarations).toEqual([]);
				// A target can import several generated names from one source in a
				// single declaration, which the printer may wrap over several lines.
				const import_line = [...code.matchAll(/^import \{([^}]*)\} from '([^']+)';$/gm)].find(
					(match) =>
						match[2] === sources[generated] &&
						match[1]
							.split(',')
							.some((specifier) => specifier.trim() === `${generated} as __${generated}`),
				);
				expect(import_line, `a value import of ${generated} as __${generated}`).toBeDefined();
				expect(code).toContain(`<__${generated} `);
				expect(code).not.toMatch(new RegExp(`<${generated}[\\s>]`));
			}

			for (const generated of Object.keys(sources)) {
				const source = sources[generated];

				it.each([
					`import { ${generated} } from '${source}';`,
					`import type { ${generated} } from '${source}';`,
					`import { type ${generated} } from '${source}';`,
					`import ${generated} from './authored';`,
					`import * as ${generated} from './authored';`,
					`import { ${generated} } from './authored';`,
					`const ${generated} = 'authored';`,
				])(`imports a generated ${generated} beside \`%s\``, (module_scope) => {
					expect_private_generated_binding(compile_beside(generated, module_scope), generated);
				});

				it(`keeps a generated ${generated} when setup declares a local of that name`, () => {
					const code = compile_beside(
						generated,
						'',
						`const ${generated} = (props: { children?: unknown }) => <section>{props.children}</section>;`,
					);

					expect_private_generated_binding(code, generated);
					expect(code).toContain(`const ${generated} = `);
				});
			}

			it.runIf('Fragment' in sources)(
				'keys a fragment row with the generated Fragment when the loop variable is named Fragment',
				() => {
					const code = compile_beside(
						'Fragment',
						'',
						'',
						`<ul>@for (const Fragment of rows; key Fragment) { <><li>{Fragment}</li><li>{'end'}</li></> }</ul>`,
					);

					expect_private_generated_binding(code, 'Fragment');
					expect(code).toContain('<__Fragment key={Fragment}>');
				},
			);

			it.runIf(name === 'solid')(
				'switches through the generated Match when the loop variable is named Match',
				() => {
					const code = compile_beside(
						'Match',
						'',
						'',
						`<ul>@for (const Match of rows) { @switch (Match) { @case 'a': { <li>{'a'}</li> } @default: { <li>{'b'}</li> } } }</ul>`,
					);

					expect_private_generated_binding(code, 'Match');
					expect_private_generated_binding(code, 'For');
					expect(code).toContain('{(Match) => <__Switch');
					expect(code).toContain(`<__Match when={Match === 'a'}>`);
				},
			);
		});
	}

	describe(`[${name}] TypeScript output`, () => {
		it('keeps static on a class index signature', () => {
			expect_static_index_signatures(compile(STATIC_INDEX_SIGNATURES, 'App.tsrx').code);
		});

		it('collects unclosed tag diagnostics without loose recovery silence', () => {
			const result = compile(
				`function App() @{
					<div>hi
				}`,
				'App.tsrx',
				{ collect: true },
			);

			expect(diagnostic_codes(result)).toContain(TSRX_ERRORS.UNCLOSED_TAG.code);
		});

		// A loose compile, the editor's, recovers the markup and reports the
		// mistake, as a collecting compile does (#978).
		it.each(BROKEN_MARKUP)(
			'reports %s in a loose compile, as when collecting',
			(_label, source, error) => {
				const loose = compile(source, 'App.tsrx', { loose: true });
				const collected = compile(source, 'App.tsrx', { collect: true });

				/** @param {{ errors: Array<{ code?: string, pos?: number, end?: number }> }} result */
				const reported = (result) =>
					result.errors.map((error) => [error.code, error.pos, error.end]);
				expect(diagnostic_codes(loose)).toEqual([error.code]);
				expect(reported(loose)).toEqual(reported(collected));
				expect(virtual_parse_diagnostics(loose.code), loose.code).toEqual([]);
			},
		);

		it('accepts adjacent JSX text and expression children', () => {
			const { code } = compile(
				`export function App({ count }: { count: number }) @{
						<p>clicked {count} times</p>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('clicked');
			expect(code).toContain('{count}');
			expect(code).toContain('times');
		});

		it('accepts indented JSX text children', () => {
			const { code } = compile(
				`export default function App() @{
						<div>
							Hello
						</div>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('Hello');
			expect(code).not.toContain('"Hello";');
			expect(code).not.toContain('return null;');
		});

		it('accepts JSX text at the start of template bodies', () => {
			const { code } = compile(
				`export function App() @{
						<>hello</>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('hello');
			expect(code).not.toContain('hello;');
			expect(code).not.toContain('return null;');
		});

		it('accepts JSX text in if-else branches', () => {
			const { code } = compile(
				`export function App() @{
						@if (false) {
							<>Hello first branch</>
					} @else {
						<>Hello React</>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Hello first branch');
			expect(code).toContain('Hello React');
			expect(code).not.toContain('return null;');
		});

		it('keeps plain if blocks in component bodies as setup control flow', () => {
			const { code } = compile(
				`export function App(disabled: boolean) @{
						if (disabled) {
							return <span>disabled</span>;
						}

						<span>enabled</span>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('if (disabled)');
			expect(code).toContain('<span>disabled</span>');
			expect(code).toContain('enabled');
			expect(code).not.toContain('<Show');
		});

		it('keeps nested plain if blocks in @if bodies as setup control flow', () => {
			const { code } = compile(
				`function StatusBadge(status: string, more: boolean) {
						let a = @if (status === 'active') {
							if (more) {
								<b>111</b>
							} else {
								<b>222</b>
							}
						};
					}`,
				'App.tsrx',
			);

			expect(code).toContain('if (more)');
			expect(code).toContain('<b>111</b>');
			expect(code).toContain('<b>222</b>');
			expect(code).toContain('return null;');
			expect(code).not.toContain('more ?');
		});

		it('preserves entities in JSX text children for JSX runtime decoding', () => {
			const { code } = compile(
				`export function App() @{
						<p>a&amp;b&quot;c</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('a&amp;b&quot;c');
		});

		// A text's `value` has its character references decoded (#710), so the
		// `value` of a text that is only `&nbsp;` or `&#10;` is whitespace. The
		// text as written isn't, and the output keeps it.
		it('keeps text that is only a character reference', () => {
			const { code } = compile(
				`export function Only() @{
					<>&nbsp;</>
				}

				export function Branch(props: { show: boolean }) @{
					<div>
						@if (props.show) {
							<>&#32;</>
						}
					</div>
				}

				export function Line() @{
					<p>
						<b />&#10;<i />
					</p>
				}

				export function Plain() {
					return <>&nbsp;</>;
				}`,
				'App.tsrx',
			);

			expect(code.match(/<>&nbsp;<\/>/g)).toHaveLength(2);
			expect(code).toContain('<>&#32;</>');
			expect(code).toContain('<b />&#10;<i />');
		});

		it('treats backslashes in JSX text children as literal text', () => {
			const { code } = compile(
				`export function App() @{
					<p>line\\nbreak</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('line\\nbreak');
		});

		it('keeps the space after a closing tag whose body ends in a line break', () => {
			const { code } = compile(
				'export function App() @{\n\t<div>\n\t\t<span>\n\t\t\t<b>1</b>\n\t\t</span> 2\n\t</div>\n}',
				'App.tsrx',
			);

			expect(code).toContain('</span> 2');
		});

		it('keeps a non-breaking space next to a line break as text for the JSX compiler', () => {
			// JSX whitespace is ASCII, so the character is text. The JSX compiler
			// decides whether it renders at the edge of a line, as it does for TSX.
			const { code } = compile(
				'export function App() @{\n\t<div>\n\t\t\u00a0<b>x</b>\n\t</div>\n}',
				'App.tsrx',
			);

			expect(code).toContain('\u00a0<b>x</b>');
		});

		it('keeps the space after a closing tag in an element in a container', () => {
			const { code } = compile(
				'export function App() @{\n\t<main>\n\t\t{show && <div><b>1</b> 2</div>}\n\t\t<p slot={<div><i>3</i> 4</div>} />\n\t</main>\n}',
				'App.tsrx',
			);

			expect(code).toContain('</b> 2');
			expect(code).toContain('</i> 4');
		});

		it('keeps the text of an element in an @switch case', () => {
			const { code } = compile(
				'export function App() @{\n\t@switch (kind) {\n\t\t@case 1: {\n\t\t\t<div><b>3</b> 4<i />\u00a05</div>\n\t\t}\n\t}\n}',
				'App.tsrx',
			);

			expect(code).toContain('</b> 4<i');
			expect(code).toContain('\u00a05');
		});

		it('keeps the text of an element in a setup statement', () => {
			const { code } = compile(
				'export function App() @{\n\tconst a = <div>Hello<b /> 2<i />\u00a03</div>;\n\t<main>{a}</main>\n}',
				'App.tsrx',
			);

			expect(code).toContain('Hello<b');
			expect(code).toContain('/> 2<i');
			expect(code).toContain('\u00a03');
		});

		it("keeps the text of an element in a spread attribute's argument and in an attribute value without braces", () => {
			const { code } = compile(
				'export function App() @{\n\t<main>\n\t\t<p {...{ k: <div><b>1</b> /* c */ 2</div> }} />\n\t\t<p k=<div><i>3</i> /* c */ 4</div> />\n\t\t<p {...(x ? <div>@if (y) { <s>5</s> } 6</div> : {})} />\n\t</main>\n}',
				'App.tsrx',
			);

			expect(code).toContain('</b> {} 2');
			expect(code).toContain('</i> {} 4');
			expect(code).toContain('5</s>');
			expect(code).not.toContain('/* c */');
			expect(code).not.toContain('@if');
		});

		it('keeps double-quoted strings inside expression containers as JavaScript strings', () => {
			const { code } = compile(
				`export function App() @{
					<p>{"line\\nbreak"} {"&amp;"}</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('"line\\nbreak"');
			expect(code).toContain('"&amp;"');
		});

		it('rejects literal newlines in double-quoted strings inside expression containers', () => {
			expect(() =>
				compile(
					`export function App() @{
						<p>{"line
break"}</p>
					}`,
					'App.tsrx',
				),
			).toThrow(error_with('TS1002'));
		});

		it('keeps compact string comparisons in expression containers parseable', () => {
			const { code } = compile(
				`export function App({ value }: { value: string }) @{
					<p>{a<value}</p>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('{a < value}');
		});

		it('preserves regular function type parameters', () => {
			const { code } = compile(
				`type Props<Item> = {
					items: readonly Item[];
				}

				export function getItems<Item>(props: Props<Item>) {
					return props.items;
				}`,
				'App.tsrx',
			);

			expect(code).toContain('export function getItems<Item>(props: Props<Item>)');
		});

		it('keeps the comma of a generic arrow with one type parameter, so the output reparses', () => {
			const { code } = compile(
				`export const f = <T,>(x: T) => x;
				export const first = <const T,>(items: T[]) => items[0];
				export const pair = <A, B>(a: A, b: B) => [a, b];`,
				'App.tsrx',
			);

			expect(code).toContain('export const f = <T,>(x: T) => x;');
			expect(code).toContain('export const first = <const T,>(items: T[]) => items[0];');
			expect(code).toContain('export const pair = <A, B>(a: A, b: B) => [a, b];');
			expect(virtual_parse_diagnostics(code), code).toEqual([]);
		});

		it('keeps parameter decorators before parameter property modifiers', () => {
			const { code } = compile(
				`class Service {
					constructor(@Inject() private readonly dep: Dep) {}
					find(@Param() id: string) {}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('constructor(@Inject() private readonly dep: Dep) {}');
			expect(code).toContain('find(@Param() id: string) {}');
		});

		it('keeps the type arguments of a tagged template', () => {
			const { code } = compile('export const query = sql<Row>`select 1`;', 'App.tsrx');

			expect(code).toContain('export const query = sql<Row>`select 1`;');
		});

		it('keeps the ? of an optional binding pattern parameter', () => {
			const { code } = compile(
				`declare function f({ a }?: { a: number }): void;
				type F = ([a]?: number[]) => void;
				interface I { m({ a }?: { a: number }): void }
				declare function g([a]?): void;`,
				'App.tsrx',
			);

			expect(code).toContain('declare function f({ a }?: { a: number }): void;');
			expect(code).toContain('type F = ([a]?: number[]) => void;');
			expect(code).toContain('interface I { m({ a }?: { a: number }): void }');
			expect(code).toContain('declare function g([a]?): void;');
		});

		it('prints the type annotation of a binding pattern parameter once', () => {
			const { code } = compile(
				'function f([a]: A, { b }: B, [c]: C = [], ...[d]: D) {}',
				'App.tsrx',
			);

			expect(code).toContain('function f([a]: A, { b }: B, [c]: C = [], ...[d]: D) {}');
		});

		it('keeps the parentheses that keep a string statement from being a directive', () => {
			const { code } = compile(
				`'';
				'use client';
				export function run(value = 1) {
					('use strict');
					return value;
				}
				export function strict() {
					'use strict';
					'also';
					run();
					'later';
				}`,
				'App.tsrx',
			);

			expect(code).toContain("'';\n'use client';");
			expect(code).toMatch(/run\(value = 1\) \{\n\t\('use strict'\);/);
			expect(code).toMatch(/strict\(\) \{\n\t'use strict';\n\t'also';\n\trun\(\);\n\t\('later'\);/);
		});

		it('keeps the type parameters of an object literal getter or setter', () => {
			const { code } = compile(
				'export const o = { get g<T>() { return 1; }, set s<T>(v: T) {} };',
				'App.tsrx',
			);

			expect(code).toContain('get g<T>() {');
			expect(code).toContain('set s<T>(v: T) {}');
		});

		it('preserves optional markers in tuple members and function parameters', () => {
			const { code } = compile(
				`export type OptionalTuple = [bar: string, baz?: string];
export type OptionalFn = (bar: string, baz?: string) => void;
export interface OptionalInterfaceFn {
	(bar: string, baz?: string): void;
}
export function optionalFn(bar: string, baz?: string) {
	todo(bar, baz);
}`,
				'App.tsrx',
			);

			expect(code).toContain('export type OptionalTuple = [bar: string, baz?: string];');
			expect(code).toContain('export type OptionalFn = (bar: string, baz?: string) => void;');
			expect(code).toContain('(bar: string, baz?: string): void');
			expect(code).toContain('export function optionalFn(bar: string, baz?: string)');
		});

		// acorn-typescript flags `export import` on the declaration itself, and
		// the printer ignored the flag, so the module lost the alias's export.
		it('keeps the export on import-equals aliases', () => {
			const { code } = compile(
				`namespace Shapes {
	export const sides = 4;
}
export import Square = Shapes;
import Local = Shapes;
export namespace Outer {
	export import Inner = Shapes;
}
export import path = require('node:path');`,
				'App.tsrx',
			);

			expect(code).toContain('export import Square = Shapes');
			expect(code).toMatch(/^import Local = Shapes$/m);
			expect(code).toContain('export import Inner = Shapes');
			expect(code).toContain("export import path = require('node:path');");

			const module = { exports: /** @type {Record<string, any>} */ ({}) };
			const commonjs = ts.transpileModule(code, {
				compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
			}).outputText;
			new Function('module', 'exports', 'require', commonjs)(module, module.exports, () => ({
				sep: '/',
			}));
			expect(module.exports.Square).toEqual({ sides: 4 });
			expect(module.exports.Outer.Inner).toEqual({ sides: 4 });
			expect(module.exports.path).toEqual({ sep: '/' });
		});

		// esrap's import type printer drops the import attributes (#422).
		it('keeps the import attributes of import types', () => {
			const { code } = compile(
				`type Data = import('./data.json', { with: { type: 'json' } });
export type Mode = import('pkg', { with: { 'resolution-mode': 'require' } }).ns.Mode<string>;
export function App() @{
	const loaded: typeof import('./data.json', { with: { type: 'json' } }).default = load();
	<div>{String(loaded)}</div>
}`,
				'App.tsrx',
			);

			expect(code).toContain("type Data = import('./data.json', { with: { type: 'json' } });");
			expect(code).toContain(
				"export type Mode = import('pkg', { with: { 'resolution-mode': 'require' } }).ns.Mode<string>;",
			);
			expect(code).toContain(
				"const loaded: typeof import('./data.json', { with: { type: 'json' } }).default = load();",
			);
			expect(virtual_parse_diagnostics(code)).toEqual([]);
		});

		it('keeps JavaScript block scopes inside component-local callables', () => {
			const { code } = compile(
				`export function BlockScopeCheck() @{
					function fromDeclaration() {
						let result = 0;
						{
							const result = 41;
							return result + 1;
						}
					}

					const fromArrow = () => {
						{
							const token = 'arrow-block';
							return token.toUpperCase();
						}
					};

					class Reader {
						value() {
							{
								const amount = 7;
								return amount * 6;
							}
						}
					}

					const reader = new Reader();

					<output>{fromDeclaration()}{fromArrow()}{reader.value()}</output>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('function fromDeclaration()');
			expect(code).toContain('const result = 41');
			expect(code).toContain("const token = 'arrow-block'");
			expect(code).toContain('class Reader');
			expect(code).toContain('const amount = 7');
			expect(code).toContain('{fromDeclaration()}');
			expect(code).toContain('{fromArrow()}');
			expect(code).toContain('{reader.value()}');
		});

		it('still treats component-level braces as template expressions', () => {
			const { code } = compile(
				`export function ExpressionContainerCheck() @{
					function ignore() {
						{
							const hidden = 'not rendered';
							return hidden;
						}
					}

					const visible = 'render me';
					<>{visible}</>
				}`,
				'App.tsrx',
			);

			expect(code).toContain("const visible = 'render me'");
			expect(code).toContain('return <>{visible}</>;');
			expect(code).not.toMatch(/\{\n\s+visible;\n\s+\}/);
		});

		it('keeps generic-looking arrow expressions parseable after inner blocks in functions', () => {
			const { code } = compile(
				`export function GenericAfterBlockCheck() @{
					const make = () => {
						if (true) {
							const local = 1;
							console.log(local);
						}

						<T,>(value: T) => value;
					};

					<div>{make}</div>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('(value: T) => value');
			expect(code).toContain('{make}');
		});
	});

	describe(`[${name}] @for item defaults that read the index (#1312)`, () => {
		it('compiles a default that writes the index to an assignable index', () => {
			const { code } = compile(
				`export function App({ rows }: { rows: [string | undefined, string][] }) @{
					<ul>
						@for (const [a = 'r' + i++, b] of rows; index i; key b) {
							<li>{a + b}</li>
						}
					</ul>
				}`,
				'App.tsrx',
			);

			expect(virtual_parse_diagnostics(code), code).toEqual([]);
			// TS2357: `i++` on something other than a variable or a property.
			expect(
				virtual_semantic_diagnostics(code)
					.filter((diagnostic) => diagnostic.code === 2357)
					.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
				code,
			).toEqual([]);
		});
	});

	describe(`[${name}] diagnostic codes`, () => {
		it('collects mismatched closing tag diagnostic codes', () => {
			expect(() =>
				compile(
					`function App() @{
						<div></span>
					}`,
					'App.tsrx',
					{ collect: true },
				),
			).toThrow(error_with(TSRX_ERRORS.UNEXPECTED_CLOSING_TAG));
		});
	});

	describe(`[${name}] component return validation`, () => {
		it('allows return values inside functions and classes nested in components', () => {
			expect(() =>
				compile(
					`export function App() @{
						function getLabel() {
							return 'label';
						}

						const getCount = () => {
							return 1;
						};

						class Model {
							getValue() {
								return getCount();
							}
						}

						const model = new Model();
						<div>{getLabel()}{model.getValue()}</div>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('rejects return statements inside template @if branches', () => {
			expect(() =>
				compile(
					`export function App() @{
						<>
							@if (x) {
								return <div>hello world</div>;
							}

							<div>hello world 2</div>
						</>
					}`,
					'App.tsrx',
				),
			).toThrow(error_with(TSRX_ERRORS.IF_RETURN_STATEMENT));
		});
	});

	describe(`[${name}] removed style directive syntax`, () => {
		it('does not parse {style} inside element child expressions', () => {
			expect(() =>
				compile(
					`export function App() @{
						<div>{style 'root'}</div>
						<style>
							.root { color: blue; }
						</style>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});

		it('does not parse {style} in attributes', () => {
			expect(() =>
				compile(
					`export function App() @{
						<div class={style 'root'}>{'hi'}</div>
						<style>
							.root { color: blue; }
						</style>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});

		it('does not parse the removed #style syntax', () => {
			expect(() =>
				compile(
					`export function App() @{
						<Child cls={#style.root} />
						<style>
							.root { color: blue; }
						</style>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});
	});

	describe(`[${name}] <> and fragment unwrapping`, () => {
		// Expression-position JSX fragments unwrap when they only contain a
		// single render expression and wrap when they need to preserve siblings.
		it('unwraps a JSX fragment with a single element child', () => {
			const { code } = compile(`class Foo { bar() { return <><div>hi</div></>; } }`, 'App.tsrx');
			expect(code).toContain('hi');
			expect(code).not.toContain('<tsx');
		});

		it('preserves component spread attributes inside JSX fragments', () => {
			const { code } = compile(
				`class Foo { bar() { const props = {}; return <><Bar {...props} /></>; } }`,
				'App.tsrx',
			);
			expect(code).toContain('return <><Bar {...props} /></>;');
			expect(code).not.toContain('<tsx');
		});

		it('unwraps a JSX fragment containing a single expression to the expression', () => {
			// Regression: previously `<>{'Hello'}</>` was compiled to
			// `return {'Hello'};`, which is a JS syntax error because `{`
			// opens a block/object literal. The JSXExpressionContainer must
			// be unwrapped to its inner expression in expression position.
			const { code } = compile(`class Foo { bar() { return <>{'Hello'}</>; } }`, 'App.tsrx');
			expect(code).toContain("return <>{'Hello'}</>;");
			expect(code).not.toContain("return {'Hello'}");
		});

		it('unwraps a JSX fragment containing a single identifier expression', () => {
			const { code } = compile(`class Foo { bar() { const x = 1; return <>{x}</>; } }`, 'App.tsrx');
			expect(code).toContain('return <>{x}</>;');
			expect(code).not.toContain('return {x}');
		});

		it('unwraps text-only JSX fragments to strings', () => {
			const { code } = compile(`class Foo { bar() { return <>plain text</>; } }`, 'App.tsrx');
			expect(code).toContain('plain text');
			expect(code).not.toContain('return null;');
		});

		it('keeps an empty authored fragment as render output (not null)', () => {
			const { code } = compile(`class Foo { bar() { return <></>; } }`, 'App.tsrx');
			expect(code).toContain('return <></>;');
			expect(code).not.toContain('return null;');
		});

		it('keeps a single text child faithful at runtime instead of a string-literal expression', () => {
			const { code } = compile(`export function App() {\n\t<>@</>\n}`, 'App.tsrx', { loose: true });
			// `@` is valid text; keep it as-is rather than promoting it to `{'@'}` / `{"@"}`.
			expect(code).toContain('<>@</>');
			expect(code).not.toContain("{'@'}");
			expect(code).not.toContain('{"@"}');
		});

		it('renders nothing for a whitespace-only render output at runtime', () => {
			const { code } = compile(`export function App() {\n\t<>\n\t</>\n}`, 'App.tsrx', {
				loose: true,
			});
			// A nullish/whitespace-only output should be nothing, not a stray `{''}` / `{""}`.
			expect(code).toContain('<></>');
			expect(code).not.toContain("{''}");
			expect(code).not.toContain('{""}');
		});

		it('parses text-only fragment initializers before template expression children', () => {
			const { code } = compile(
				`export function Button() @{
					const x = <>Hello world</>;
					<>{x}</>
				}`,
				'App.tsrx',
			);

			// An authored `<>…</>` is kept verbatim in value position (var-init): the text
			// stays faithful to the source rather than being promoted to a `{"Hello world"}`
			// string-literal expression.
			expect(code).toContain('const x = <>Hello world</>;');
			expect(code).toContain('return <>{x}</>;');
		});

		it('parses backtick text inside fragments as JSX text', () => {
			const { code } = compile(
				`function a() {
					return <>
						\`333\`
					</>;
				}`,
				'App.tsrx',
			);

			expect(code).toContain('`333`');
		});

		it('parses backtick text around JSX elements inside fragments', () => {
			const { code } = compile(
				`function a() {
					return <>
						\`
						<b></b>
						\`
					</>;
				}`,
				'App.tsrx',
			);

			expect(code).toContain('`');
			expect(code).toContain('<b></b>');
		});

		it('wraps multiple JSX fragment children in a fragment', () => {
			const { code } = compile(
				`class Foo { bar() { return <><div>a</div><div>b</div></>; } }`,
				'App.tsrx',
			);
			expect(code).toContain('a');
			expect(code).toContain('b');
		});

		it('unwraps a JSX fragment whose single child is already a fragment', () => {
			const { code } = compile(`class Foo { bar() { return <><>{'x'}</></>; } }`, 'App.tsrx');
			expect(code).toContain("return <>{'x'}</>;");
		});

		it('unwraps an explicit JSX fragment with a single expression', () => {
			const { code } = compile(`class Foo { bar() { return <>{'Hello'}</>; } }`, 'App.tsrx');
			expect(code).toContain("return <>{'Hello'}</>;");
		});

		it('unwraps an explicit JSX fragment with a single element', () => {
			const { code } = compile(`class Foo { bar() { return <><div>hi</div></>; } }`, 'App.tsrx');
			expect(code).toContain('hi');
		});

		// A fragment is always a truthy element, but its single child may be falsy.
		// In a render-output slot the collapse is invisible (covered above), but when
		// the fragment is COMBINED into an expression the collapse flips meaning:
		// `<>{0}</> || 'd'` renders `0`, while `0 || 'd'` renders `'d'`. Keep the
		// fragment in those positions instead of unwrapping it.
		it('keeps a fragment combined into an expression as a fragment', () => {
			const operand = compile(
				`function App() { let c = <>{0}</> || 'd'; return <div>{c}</div>; }`,
				'App.tsrx',
			);
			expect(operand.code).toContain('<>');
			expect(operand.code).toContain('</>');
			expect(operand.code).not.toMatch(/let c = 0 \|\|/);

			const ternary = compile(
				`function App({ o }: { o: boolean }) { let c = o ? <>{1}</> : <>{2}</>; return <div>{c}</div>; }`,
				'App.tsrx',
			);
			expect(ternary.code).toContain('<>');
			expect(ternary.code).not.toMatch(/\?\s*1\s*:\s*2/);
		});

		// An AUTHORED `<>…</>` is kept verbatim in a JS value position (a variable
		// initializer, an assignment) — it must not unwrap to its single child, which
		// turns the author's JSX into a plain value.
		it('keeps an authored fragment in value position', () => {
			const expr = compile(
				`function App() { const v = <>{1}</>; return <div>{v}</div>; }`,
				'App.tsrx',
			);
			expect(expr.code).toContain('<>');
			expect(expr.code).toContain('</>');
			expect(expr.code).not.toMatch(/const v = 1;/);

			const element = compile(
				`function App() { const v = <><span>x</span></>; return <div>{v}</div>; }`,
				'App.tsrx',
			);
			expect(element.code).toContain('<>');
			expect(element.code).toContain('<span>x</span>');
		});

		// The branches of an `@if` (`@for`/`@switch`) keep their authored fragments:
		// `c ? <>{a}</> : <>{b}</>`, not the unwrapped `c ? a : b`. (The compiler's
		// own wrapper around the directive still collapses it to the conditional.)
		it('keeps authored fragments in control-flow branches', () => {
			const { code } = compile(
				`function App() { const xyz = @if (cond()) { <>{[1, 2, 3]}</> } @else { <>{[3, 4, 5]}</> }; return <div>{xyz}</div>; }`,
				'App.tsrx',
			);
			expect(code).toContain('<>');
			expect(code).toContain('</>');
			expect(code).not.toMatch(/\?\s*\[1, 2, 3\]\s*:/);
			expect(code).not.toContain('@if');
		});

		// A compiler-generated wrapper (around `@switch` used as a sole value) is NOT
		// authored, so it still collapses to its rendered value rather than being kept.
		it('still collapses a generated wrapper around a directive', () => {
			const { code } = compile(
				`function App({ s }: { s: string }) { const v = @switch (s) { @case 'a': { <p>A</p> } @default: { <p>D</p> } }; return <div>{v}</div>; }`,
				'App.tsrx',
			);
			expect(code).toContain('A');
			expect(code).toContain('D');
			expect(code).not.toContain('@switch');
		});

		it('keeps an explicit JSX fragment with multiple children', () => {
			const { code } = compile(
				`class Foo { bar() { return <><div>a</div><div>b</div></>; } }`,
				'App.tsrx',
			);
			expect(code).toContain('a');
			expect(code).toContain('b');
		});

		it('keeps special fragment returns inside component-local functions', () => {
			const { code } = compile(
				`export function App() @{
							function FragmentReturn() {
								return <><div>fragment</div></>;
							}
							function TsxReturn() {
							return <><div>tsx</div></>;
						}
							function TsrxReturn() {
								return <><div>tsrx</div></>;
							}

							<div>App</div>
					}`,
				'App.tsrx',
			);

			expect(code).not.toContain('return;');
			if (hoistsStaticJsx) {
				expect(code).toMatch(/function FragmentReturn\(\) {\s+return <>{App__static\d+}<\/>;/);
				expect(code).toMatch(/function TsxReturn\(\) {\s+return <>{App__static\d+}<\/>;/);
				expect(code).toMatch(/const App__static\d+ = <div[^>]*>tsrx<\/div>;/);
				expect(code).toMatch(/function TsrxReturn\(\) {\s+return <>{App__static\d+}<\/>;/);
			} else {
				expect(code).not.toContain('__static');
				expect(code).toMatch(/function FragmentReturn\(\) {\s+return <><div>fragment<\/div><\/>;/);
				expect(code).toMatch(/function TsxReturn\(\) {\s+return <><div>tsx<\/div><\/>;/);
				expect(code).toMatch(/function TsrxReturn\(\) {\s+return <><div>tsrx<\/div><\/>;/);
			}
		});

		it('keeps special fragment returns inside component prop arrow functions', () => {
			const { code } = compile(
				`function Child(props) { return null; }

					export function App() @{
						<Child
							fragment={() => {
								return <><div>fragment</div></>;
							}}
							tsx={() => {
								return <><div>tsx</div></>;
							}}
						tsrx={() => {
							return <><div>tsrx</div></>;
						}}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).not.toContain('return;');
			if (hoistsStaticJsx) {
				expect(code).toMatch(/const App__static\d+ = <div[^>]*>fragment<\/div>;/);
				expect(code).toMatch(/const App__static\d+ = <div[^>]*>tsx<\/div>;/);
				expect(code).toMatch(/const App__static\d+ = <div[^>]*>tsrx<\/div>;/);
				expect(code).toMatch(/fragment={\(\) => {\s+return <>{App__static\d+}<\/>;/);
				expect(code).toMatch(/tsx={\(\) => {\s+return <>{App__static\d+}<\/>;/);
				expect(code).toMatch(/tsrx={\(\) => {\s+return <>{App__static\d+}<\/>;/);
			} else {
				expect(code).not.toContain('__static');
				expect(code).toMatch(/fragment={\(\) => {\s+return <><div>fragment<\/div><\/>;/);
				expect(code).toMatch(/tsx={\(\) => {\s+return <><div>tsx<\/div><\/>;/);
				expect(code).toMatch(/tsrx={\(\) => {\s+return <><div>tsrx<\/div><\/>;/);
			}
		});

		it('parses semicolon-less JSX returns in component prop arrow functions', () => {
			const { code } = compile(
				`function Card(props) { return null; }

				function App() @{
					<Card
						children={() => {
							return <>
								<div>Hello, World!</div>
							</>
						}}
					/>
				}`,
				'App.tsrx',
			);
			expect(code).toContain('Hello, World!');
		});

		it('keeps expression child arrays in fragment and JSX callback props', () => {
			const { code } = compile(
				`function Child(props) { return null; }

					export function App() @{
						<Child
							fragment={() => <>{[<>Delete</>, <>Edit</>]}</>}
							native={() => <>{[<>Delete</>, <>Edit</>]}</>}
						/>
					}`,
				'App.tsrx',
			);

			expect(code).toMatch(/fragment={\(\) => {\s+return <>{\[<>Delete<\/>, <>Edit<\/>\]}<\/>;/);
			expect(code).toMatch(/native={\(\) => {\s+return <>{\[<>Delete<\/>, <>Edit<\/>\]}<\/>;/);
		});
	});

	describe(`[${name}] JSX fragment values`, () => {
		it('preserves JSX template text in expression position', () => {
			const { code } = compile(`class Foo { bar() { return <><div>Hello</div></>; } }`, 'App.tsrx');

			expect(code).toContain('Hello');
		});

		it('parses compact JSX templates before a trailing newline at EOF', () => {
			const { code } = compile(
				[
					`export function App() @{`,
					`\tconst title = <><h1>Hello There</h1>{Test(1, 2)}</>;`,
					`\t<>{title}</>`,
					`}`,
					``,
					`function Test(p1, p2) {`,
					`\treturn <><div>Hello</div><div>{p1}</div><div>{p2}</div></>;`,
					`}`,
					``,
				].join('\n'),
				'App.tsrx',
			);

			expect(code).toContain('Hello');
		});

		it('preserves statements before template output', () => {
			const { code } = compile(
				`class Foo { bar() { return <>
					const label = 'Hi';
					<div>{label}</div>
				</>; } }`,
				'App.tsrx',
			);

			expect(code).toContain("const label = 'Hi';");
			expect(code).toContain('{label}');
		});

		it('supports control flow inside JSX template fragments', () => {
			const { code } = compile(
				`class Foo { bar() { return <>@if (true) { <div>yes</div> }</>; } }`,
				'App.tsrx',
			);

			expect(code).toContain('true');
			expect(code).toContain('yes');
		});

		it('preserves JSX template fragments in component JSX attribute values', () => {
			const { code } = compile(
				`function App() @{ <Card content={<><span>Title</span></>} /> }`,
				'App.tsrx',
			);

			expect(code).toContain('Title');
		});

		it('preserves statement-bodied JSX templates in self-closing component attributes', () => {
			const { code } = compile(
				`function App() @{
					<Card
						content={
							@if (foo) {
								<div>
									@if (foo) {}
								</div>
							}
						}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('foo');
			expect(code).toContain('<Card');
		});

		it('preserves JSX template fragments in JSX attribute values', () => {
			const { code } = compile(
				`class Foo { bar() { return <Card content={<><span>Title</span></>} />; } }`,
				'App.tsrx',
			);

			expect(code).toContain('Title');
		});

		it('preserves JSX template fragments in object property JSX attribute values', () => {
			const { code } = compile(
				`class Foo { bar() { return <Card content={{ child: <><span>Title</span></> }} />; } }`,
				'App.tsrx',
			);

			expect(code).toContain('Title');
		});

		it('preserves JSX template fragments returned from render callback props', () => {
			const { code } = compile(
				`class Foo { bar() { return <List render={() => { return <><span>Item</span></>; }} />; } }`,
				'App.tsrx',
			);

			expect(code).toContain('Item');
		});

		it('preserves JSX template fragments returned from callback props without semicolons', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</>
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('item.name');
		});

		it('preserves JSX template fragments in returned object props without semicolons', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return {
									child: <>
										<span>{item.name}</span>
									</>
								}
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('item.name');
		});

		it('preserves JSX template fragments in nested render props without trailing commas', () => {
			const cases = [
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: () => <>
										<div>nested</div>
									</>
								}
							}}
						/>
					}
				}`,
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: () => <>
										<div>nested trailing comma</div>
									</>,
								},
							}}
						/>
					}
				}`,
			];

			for (const source of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain('nested');
			}
		});

		it('preserves JSX template fragments in top-level render props', () => {
			const cases = [
				[
					`class Foo {
					bar() {
						return <Page
							params={{
								render: () => <>
									<div>top</div>
								</>,
							}}
						/>
					}
				}`,
					'top',
				],
				[
					`class Foo {
					bar() {
						return <Page
							params={{
								render: (icon: () => JSX.Element) => <>
									<div>typed top</div>
								</>,
							}}
						/>
					}
				}`,
					'typed top',
				],
				[
					`class Foo {
					bar() {
						return <Page
							params={{
									render: () => {
										return [<>View</>];
									},
							}}
						/>
					}
				}`,
					'View',
				],
			];

			for (const [source, expected] of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain(expected);
			}
		});

		it('preserves JSX parser state across comments after semicolon-free TSRX returns', () => {
			const cases = [
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</> /* block comment */
							}}
						/>
					}
				}`,
				`class Foo {
					bar() {
						return <List
							render={(item) => {
								return <>
									<span>{item.name}</span>
								</> // line comment
							}}
						/>
					}
				}`,
			];

			for (const source of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain('item.name');
			}
		});

		it('preserves JSX template fragments from typed nested render props', () => {
			const cases = [
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: (icon: () => JSX.Element) => <>
										<div>typed</div>
									</>,
								},
							}}
						/>
					}
				}`,
				`class Foo {
					bar() {
						return <Page
							params={{
								details: {
									render: (tag: string, className: string, icon: () => JSX.Element) => <>
										<div>typed trailing comma</div>
									</>,
								},
							}}
						/>
					}
				}`,
			];

			for (const source of cases) {
				const { code } = compile(source, 'App.tsrx');

				expect(code).toContain('typed');
			}
		});

		it('preserves JSX templates in complex nested params objects', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <Page
								params={{
									title: 'Welcome',
									header: {
										class: 'foo',
										children: <><h1>Big things are coming!</h1></>,
									},
									content: <><p>Lorem ipsum...</p></>,
									menuItems: [
										<><span>Copy</span></>,
										<><span>Cut</span></>,
										<><span>Delete</span></>,
									],
								menuAlt: (isAdmin) => {
									if (isAdmin) {
										return [<>Delete</>, <>Edit</>];
									}
									return [<>View</>];
								},
									details: {
										label: {
											class: 'custom',
											children: [<>Shipping & returns</>],
										},
										leadingIcon: { children: <>icon</> },
									},
								details2: {
									render: (tag: string, className: string, icon: () => JSX.Element) =>
										@{ <span class={\`\${className}\${icon ? 'has-icon' : ''}\`}>
											{icon ? icon() : null}
										</span> },
								},
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Welcome');
			expect(code).toContain('isAdmin');
			expect(code).toContain(`${classAttrName}={`);
			expect(code).toContain('has-icon');
		});

		it('parses fragment arrays as object property values inside JSX attribute objects', () => {
			const { code } = compile(
				`class Foo {
					bar() {
						return <Page
							params={{
									menuItems: [
										<><span>Copy</span></>,
										<><span>Cut</span></>,
										<><span>Delete</span></>,
									],
									details: {
										label: {
											children: [<>Shipping & returns</>],
										},
								},
							}}
						/>
					}
				}`,
				'App.tsrx',
			);

			expect(code).toContain('Copy');
			expect(code).toContain('Cut');
			expect(code).toContain('Delete');
			expect(code).toContain('Shipping');
		});

		it('expression statement inside a JS function body nested in a JSX attribute', () => {
			const { code } = compile(
				`function App() @{
					<Page params={{
						f: () => @{
							<div>
								<div>x</div>
							</div>
						},
					}} />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('<div');
			expect(code).toContain('x');
			expect(code).not.toContain('return null;');
		});

		it('parses statements before later JS statements in JSX attribute callbacks', () => {
			const { code } = compile(
				`function App() @{
					<Page params={{
						menuAlt: (isAdmin) => {
							const items = [];
							if (isAdmin) {
								items.push('Delete', 'Edit');
							} else {
								items.push('View');
							}
							return items;
						},
					}} />
				}`,
				'App.tsrx',
			);

			expect(code).toContain('isAdmin');
			expect(code).toContain('return items');
			expect(code).toContain('Delete');
			expect(code).toContain('View');
		});

		it('keeps regular callback returns with JSX values intact', () => {
			const { code } = compile(
				`function Test() @{
					<Page
						params={{
							menuAlt: (isAdmin) => {
								if (isAdmin) {
									return [<>Delete</>, <>Edit</>];
								}
								return [<>View</>];
							},
							direct: () => {
								return [<>View</>];
							},
							bySwitch: (role) => {
								switch (role) {
									case 'admin':
										return [<>Edit</>];
									default:
										return [<>View</>];
								}
							},
							byForOf: (items) => {
								for (const item of items) {
									if (item.active) {
										return [<>{item.label}</>];
									}
								}

								return [<>Empty</>];
							},
							byTry: (load) => {
								try {
									return [<>{load()}</>];
								} catch (error) {
									return [<>Error</>];
								}
							},
						}}
					/>
				}`,
				'App.tsrx',
			);

			expect(code).toContain('return [<>Delete</>, <>Edit</>];');
			expect(code).toContain('return [<>View</>];');
			expect(code).toContain('bySwitch: (role) => {');
			expect(code).toContain('switch (role)');
			expect(code).toContain('byForOf: (items) => {');
			expect(code).toContain('for (const item of items)');
			expect(code).toContain('return [<>Empty</>];');
			expect(code).toContain('byTry: (load) => {');
			expect(code).toContain('return [<>Error</>];');
		});
	});

	describe(`[${name}] fenced setup statements and JSX children`, () => {
		it('keeps element setup statements before rendered children', () => {
			const { code } = compile(
				`function Card() @{
					<div class="card">@{
						let a = "one"
						a = "two"
						<>
							<b>{"hello" + a}</b>
							<b>{"hello" + a}</b>
						</>
					}</div>
				}`,
				'Card.tsrx',
			);
			const assign_two = code.indexOf('a = "two"');
			const first_child = code.indexOf('<b>{"hello" + a}</b>');
			expect(assign_two).toBeGreaterThan(-1);
			expect(first_child).toBeGreaterThan(assign_two);
			expect(code).not.toContain('_tsrx_child_');
		});

		it('keeps component setup statements before rendered children with hook calls', () => {
			const { code } = compile(
				`function Card() @{
					var a = "one"
					a = "two"
					const x = useState(0)
					<>
						<b>{"hello" + a}</b>
						<b>{"hello" + a}</b>
						<div>{x}</div>
					</>
				}`,
				'Card.tsrx',
			);
			const assign_two = code.indexOf('a = "two"');
			const first_child = code.indexOf('<b>{"hello" + a}</b>');
			expect(assign_two).toBeGreaterThan(-1);
			expect(first_child).toBeGreaterThan(assign_two);
			expect(code).not.toContain('_tsrx_child_');
		});

		it('does not capture JSX into temporaries when all statements precede JSX', () => {
			const { code } = compile(
				`function Card() @{
					<div>
						const a = "one"
						const b = "two"
						<span>{a}</span>
						<span>{b}</span>
					</div>
				}`,
				'Card.tsrx',
			);
			// No interleaving, so no capture temporaries should be introduced.
			expect(code).not.toContain('_tsrx_child_');
		});

		it('keeps component setup statements before rendered children', () => {
			const { code } = compile(
				`function Card() @{
					var a = "one"
					a = "two"
					<>
						<b>{"hello" + a}</b>
						<b>{"hello" + a}</b>
					</>
				}`,
				'Card.tsrx',
			);
			const assign_two = code.indexOf('a = "two"');
			const first_child = code.indexOf('<b>{"hello" + a}</b>');
			expect(assign_two).toBeGreaterThan(-1);
			expect(first_child).toBeGreaterThan(assign_two);
			expect(code).not.toContain('_tsrx_child_');
		});
	});

	describe(`[${name}] text children`, () => {
		it('skips the null-coerce ternary for direct JSX text children', () => {
			// `hello` is statically known to be a non-null string, so the
			// text coercion wrapper is dead weight.
			const { code } = compile(
				`export function App() @{
					<b>hello</b>
				}`,
				'App.tsrx',
			);
			expect(code).not.toContain('== null');
			expect(code).not.toContain("+ ''");
		});

		it('treats text as an ordinary identifier in expression containers', () => {
			const { code } = compile(
				`export function App() @{
					const text = 'hello';
					<b>{text}</b>
				}`,
				'App.tsrx',
			);
			expect(code).toContain('{text}');
		});

		it('rejects the removed {text expr} modifier syntax', () => {
			expect(() =>
				compile(
					`export function App() @{
						<b>{text name}</b>
					}`,
					'App.tsrx',
				),
			).toThrow();
		});

		it.runIf(['react', 'preact'].includes(name))(
			`[${name}] hoists direct JSX text and static expression sibling combo to a static`,
			() => {
				// React/Preact hoist child-free static JSX to a module-level
				// constant so the element identity is stable across renders.
				const { code } = compile(
					`export function App() @{
						<b>hello {'hello'}</b>
					}`,
					'App.tsrx',
				);
				expect(code).toContain('const App__static1 = <b>');
				expect(code).toContain('hello');
				expect(code).toContain("{'hello'}");
				expect(code).toContain('return App__static1');
				expect(code).not.toContain('== null');
			},
		);

		it.runIf(name === 'solid')(
			`[${name}] leaves direct JSX text and static expression sibling combo in place`,
			() => {
				const { code } = compile(
					`export function App() @{
						<b>hello {'hello'}</b>
					}`,
					'App.tsrx',
				);
				expect(code).toContain("return <b>hello {'hello'}</b>;");
				expect(code).not.toContain('__static');
				expect(code).not.toContain('== null');
			},
		);
	});

	describe(`[${name}] static JSX hoisting`, () => {
		/**
		 * Runs compiled output with JSX elements as `{ type, props }` objects
		 * and returns what its `result` export returns. An import is a string
		 * that names it when it is capitalized, and otherwise a function that
		 * returns its argument; a default import is a module of the same kind.
		 * `modules` replaces the modules it names.
		 * @param {string} code
		 * @param {Record<string, object>} [modules]
		 * @returns {unknown}
		 */
		function run_result(code, modules = {}) {
			const { outputText } = ts.transpileModule(code, {
				fileName: 'App.tsx',
				compilerOptions: {
					jsx: ts.JsxEmit.React,
					jsxFactory: 'h',
					jsxFragmentFactory: 'Fragment',
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ES2022,
				},
			});
			/** @param {unknown} type @param {object | null} props @param {unknown[]} children */
			const h = (type, props, ...children) => ({
				type,
				props: { ...props, ...(children.length ? { children } : {}) },
			});
			/**
			 * @param {string} specifier
			 * @returns {object}
			 */
			const require = (specifier) =>
				modules[specifier] ??
				new Proxy(
					{},
					{
						get: (_, key) =>
							key === '__esModule'
								? true
								: key === 'default'
									? require(`${specifier}.default`)
									: typeof key === 'string' && /^[A-Z]/.test(key)
										? `${specifier}.${key}`
										: (/** @type {unknown} */ value) => value,
					},
				);
			const module = { exports: /** @type {Record<string, any>} */ ({}) };
			new Function('h', 'Fragment', 'require', 'module', 'exports', outputText)(
				h,
				'Fragment',
				require,
				module,
				module.exports,
			);
			return module.exports.result();
		}

		it.each([
			[
				'the class it is in (#204)',
				"class Screen {\n\tstatic Tag = 'div';\n\trender() {\n\t\treturn <Screen.Tag>hello</Screen.Tag>;\n\t}\n}\nexport const result = () => new Screen().render().type;",
				'div',
			],
			[
				'the class expression it is in',
				"const C = class Screen {\n\tstatic Tag = 'nce';\n\trender() {\n\t\treturn <Screen.Tag>hello</Screen.Tag>;\n\t}\n};\nexport const result = () => new C().render().type;",
				'nce',
			],
			[
				'this',
				"class Screen {\n\tTag = 'span';\n\trender() {\n\t\treturn <this.Tag>hello</this.Tag>;\n\t}\n}\nexport const result = () => new Screen().render().type;",
				'span',
			],
			[
				'super',
				"const base = { Tag: 'sup' };\nconst screen = {\n\t__proto__: base,\n\trender() {\n\t\treturn <super.Tag>hello</super.Tag>;\n\t},\n};\nexport const result = () => screen.render().type;",
				'sup',
			],
			[
				'a const declared after it',
				"function App() {\n\treturn <div><Late>hello</Late></div>;\n}\nconst Late = 'late';\nexport const result = () => App().props.children[0].type;",
				'late',
			],
			[
				'a binding of the static block it is in',
				"let made: any;\nclass Holder {\n\tstatic {\n\t\tconst Tag = 'sb';\n\t\tfunction App() {\n\t\t\treturn <Tag>hello</Tag>;\n\t\t}\n\t\tmade = App;\n\t}\n}\nexport const result = () => made().type;",
				'sb',
			],
			[
				'a var assigned after it',
				"var Tag: any;\nfunction App() {\n\treturn <Tag>hello</Tag>;\n}\nTag = 'va';\nexport const result = () => App().type;",
				'va',
			],
			[
				'a let reassigned after it',
				"let Tag: any = 'first';\nfunction App() {\n\treturn <Tag>hello</Tag>;\n}\nTag = 'second';\nexport const result = () => App().type;",
				'second',
			],
			[
				'a property assigned to a function declaration after it',
				"function App() {\n\treturn <Menu.Item>hello</Menu.Item>;\n}\nfunction Menu() {}\nMenu.Item = 'mi';\nexport const result = () => App().type;",
				'mi',
			],
			[
				'a property assigned to a const declared before it',
				"const Menu = (props: any) => props;\nfunction App() {\n\treturn <div><Menu.Item>hello</Menu.Item></div>;\n}\n(Menu as any).Item = 'ci';\nexport const result = () => App().props.children[0].type;",
				'ci',
			],
			[
				'a property that Object.assign gives a const declared before it',
				"function MenuRoot(props: any) {\n\treturn props;\n}\nconst Menu = Object.assign(MenuRoot, {});\nfunction App() {\n\treturn <div><Menu.Item>hello</Menu.Item></div>;\n}\nObject.assign(Menu, { Item: 'oa' });\nexport const result = () => App().props.children[0].type;",
				'oa',
			],
			[
				'a property assigned to a class declared before it',
				"class Menu {}\nfunction App() {\n\treturn <Menu.Item>hello</Menu.Item>;\n}\n(Menu as any).Item = 'cp';\nexport const result = () => App().type;",
				'cp',
			],
			[
				'an import alias declared after it',
				"namespace N {\n\texport const Tag = 'ie';\n}\nfunction App() {\n\treturn <Tag>hello</Tag>;\n}\nimport Tag = N.Tag;\nexport const result = () => App().type;",
				'ie',
			],
			[
				'a const of an earlier case in its switch (#1160)',
				"const Tag: any = 'outer';\nfunction make(k: number): any {\n\tswitch (k) {\n\t\tcase 1:\n\t\t\tconst Tag: any = 'case';\n\t\tcase 2:\n\t\t\treturn <Tag>ok</Tag>;\n\t}\n}\nexport const result = () => make(1).type;",
				'case',
			],
			[
				'the inner name of its dotted namespace (#1160)',
				"const Foo = 'outer';\nnamespace Outer {\n\texport function Foo() {\n\t\treturn null;\n\t}\n}\nnamespace Outer.Foo {\n\texport function App() {\n\t\treturn <Foo>ok</Foo>;\n\t}\n}\nexport const result = () => Outer.Foo.App().type === Outer.Foo;",
				true,
			],
			[
				'an export of another declaration of its namespace',
				"const Foo = 'outer';\nnamespace Outer {\n\texport function Foo() {\n\t\treturn null;\n\t}\n}\nnamespace Outer {\n\texport function App() {\n\t\treturn <Foo>ok</Foo>;\n\t}\n}\nexport const result = () => Outer.App().type === Outer.Foo;",
				true,
			],
			[
				'a middle name of its dotted namespace',
				"const Foo = 'outer';\nnamespace Outer {\n\texport function Foo() {\n\t\treturn null;\n\t}\n}\nnamespace Outer.Foo.Bar {\n\texport function App() {\n\t\treturn <Foo>ok</Foo>;\n\t}\n}\nexport const result = () => Outer.Foo.Bar.App().type === Outer.Foo;",
				true,
			],
			[
				'a function declaration the module assigns',
				'function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nTag = Replacement;\nexport const result = () => App().props.children[0].type === Replacement;',
				true,
			],
			[
				'a function declaration that another function assigns',
				'function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nexport function swap() {\n\tTag = Replacement;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nexport const result = () => {\n\tswap();\n\treturn App().props.children[0].type === Replacement;\n};',
				true,
			],
			[
				'a class declaration the module assigns by destructuring',
				'class Box {}\nclass Other {}\nfunction App() {\n\treturn <div><Box>hello</Box></div>;\n}\n[Box] = [Other];\nexport const result = () => App().props.children[0].type === Other;',
				true,
			],
			[
				'a function declaration assigned through a typed destructuring target',
				'function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\n[Tag as any] = [Replacement];\nexport const result = () => App().props.children[0].type === Replacement;',
				true,
			],
			[
				// Any assignment of the name counts, even to a local that shadows it
				'a function declaration whose name another function assigns as a local',
				'function Tag() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nexport function other() {\n\tlet Tag = 1;\n\tTag = 2;\n\treturn Tag;\n}\nexport const result = () => App().props.children[0].type === Tag;',
				true,
			],
			[
				'a function declaration a for…of head assigns',
				'function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nfor (Tag of [Replacement]);\nexport const result = () => App().props.children[0].type === Replacement;',
				true,
			],
			[
				'a function declaration a for…in head assigns',
				'function Tag() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nfor (Tag in { replacement: 1 });\nexport const result = () => App().props.children[0].type;',
				'replacement',
			],
			[
				'a function declaration another function updates',
				'function Tag() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nexport function bump() {\n\tTag++;\n}\nexport const result = () => {\n\tbump();\n\treturn Number.isNaN(App().props.children[0].type);\n};',
				true,
			],
			[
				'a function declaration assigned by object destructuring with a default',
				'function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\n({ Tag = Replacement } = {});\nexport const result = () => App().props.children[0].type === Replacement;',
				true,
			],
			[
				// The style pass moves a `ref` of a `<style>` in a nested root out of the tree
				'a function declaration a style ref assigns',
				'function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nexport function App() @{\n\tconst content = <><style ref={() => { Tag = Replacement; }} /><span>content</span></>;\n\t<>{content}<div><Tag>hello</Tag></div></>\n}\nexport const result = () => App().props.children[1].props.children[0].type === Replacement;',
				true,
			],
			[
				'a function declaration a direct eval can assign',
				"function Tag() {\n\treturn null;\n}\nfunction Replacement() {\n\treturn null;\n}\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\n(eval)('Tag = Replacement');\nexport const result = () => App().props.children[0].type === Replacement;",
				true,
			],
		])(
			'leaves JSX whose tag reads %s in place, reading it at render time',
			(_case, source, expected) => {
				const { code } = compile(source, 'App.tsrx');
				expect(code).not.toContain('__static');
				expect(run_result(code)).toBe(expected);
			},
		);

		it.each([
			[
				'a default import the module assigns a property of (#1292)',
				"import ui from './ui';\nfunction Replacement() {\n\treturn null;\n}\nexport function App() @{\n\t<div><ui.Button>hello</ui.Button></div>\n}\nui.Button = Replacement;\nexport const result = () => App().props.children[0].type === Replacement;",
				true,
			],
			[
				'a named import another function assigns a property of (#1292)',
				"import { Menu } from './menu';\nfunction Replacement() {\n\treturn null;\n}\nexport function patch() {\n\tMenu.Item = Replacement;\n}\nexport function App() @{\n\t<div><Menu.Item /></div>\n}\nexport const result = () => {\n\tpatch();\n\treturn App().props.children[0].type === Replacement;\n};",
				true,
			],
			[
				'a property path under an import the module assigns',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Menu.Item>hello</ui.Menu.Item></div>;\n}\nui.Menu.Item = 'deep';\nexport const result = () => App().props.children[0].type;",
				'deep',
			],
			[
				'an import property the module assigns by a computed key',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nui['Button'] = 'computed';\nexport const result = () => App().props.children[0].type;",
				'computed',
			],
			[
				'an import property the module assigns with a compound operator',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nui.Button += '!';\nexport const result = () => App().props.children[0].type;",
				'original!',
			],
			[
				'an import property the module assigns with a logical operator',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nui.Button &&= 'logical';\nexport const result = () => App().props.children[0].type;",
				'logical',
			],
			[
				'an import property another function updates',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nexport function bump() {\n\tui.Button++;\n}\nexport const result = () => {\n\tbump();\n\treturn Number.isNaN(App().props.children[0].type);\n};",
				true,
			],
			[
				'an import property the module deletes',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\ndelete ui.Button;\nexport const result = () => App().props.children[0].type === undefined;",
				true,
			],
			[
				'an import property the module deletes through optional chaining',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\ndelete ui?.Button;\nexport const result = () => App().props.children[0].type === undefined;",
				true,
			],
			[
				'an import property the module assigns by array destructuring',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n[ui.Button] = ['array'];\nexport const result = () => App().props.children[0].type;",
				'array',
			],
			[
				'an import property the module assigns by object destructuring',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n({ x: ui.Button } = { x: 'object' });\nexport const result = () => App().props.children[0].type;",
				'object',
			],
			[
				'an import property a for…of head assigns',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nfor (ui.Button of ['of']);\nexport const result = () => App().props.children[0].type;",
				'of',
			],
			[
				'an import property a for…in head assigns',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nfor (ui.Button in { key: 1 });\nexport const result = () => App().props.children[0].type;",
				'key',
			],
			[
				'an import property a class static block assigns',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nclass Patch {\n\tstatic {\n\t\tui.Button = 'class';\n\t}\n}\nexport const result = () => App().props.children[0].type;",
				'class',
			],
			[
				'an import property its component body assigns',
				"import ui from './ui';\nexport function App() @{\n\tui.Button = 'render';\n\t<div><ui.Button>hello</ui.Button></div>\n}\nexport const result = () => App().props.children[0].type;",
				'render',
			],
			[
				'an import property the module assigns through a type assertion',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(ui as any).Button = 'typed';\nexport const result = () => App().props.children[0].type;",
				'typed',
			],
			[
				'an import property the module assigns through a sequence',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(0, ui).Button = 'sequence';\nexport const result = () => App().props.children[0].type;",
				'sequence',
			],
			[
				'an import property the module assigns through a conditional',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(true ? ui : ({} as any)).Button = 'conditional';\nexport const result = () => App().props.children[0].type;",
				'conditional',
			],
			[
				"an import property the module assigns through a conditional's alternate",
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(false ? ({} as any) : ui).Button = 'alternate';\nexport const result = () => App().props.children[0].type;",
				'alternate',
			],
			[
				'an import property the module assigns through a logical expression',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(ui || ({} as any)).Button = 'either';\nexport const result = () => App().props.children[0].type;",
				'either',
			],
			[
				"an import property the module assigns through a logical expression's right operand",
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(({} as any) && ui).Button = 'right';\nexport const result = () => App().props.children[0].type;",
				'right',
			],
			[
				'an import property the module assigns through an assignment',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nlet alias: any;\n(alias = ui).Button = 'alias';\nexport const result = () => App().props.children[0].type;",
				'alias',
			],
			[
				'an import property the module assigns through await',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nexport async function patch() {\n\t(await ui).Button = 'awaited';\n}\nexport const result = async () => {\n\tawait patch();\n\treturn App().props.children[0].type;\n};",
				'awaited',
			],
			[
				'an import property the module assigns through type arguments',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\n(ui<any>).Button = 'instantiated';\nexport const result = () => App().props.children[0].type;",
				'instantiated',
			],
			[
				'an import property Object.assign gives',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nObject.assign(ui, { Button: 'assigned' });\nexport const result = () => App().props.children[0].type;",
				'assigned',
			],
			[
				'an import property Object.defineProperty defines',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nObject.defineProperty(ui, 'Button', { value: 'defined' });\nexport const result = () => App().props.children[0].type;",
				'defined',
			],
			[
				'a property path under an import that Object.assign gives',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Menu.Item>hello</ui.Menu.Item></div>;\n}\nObject.assign(ui.Menu, { Item: 'merged' });\nexport const result = () => App().props.children[0].type;",
				'merged',
			],
			[
				'an import property a constructor given the import writes',
				"import ui from './ui';\nclass Patch {\n\tconstructor(target: any) {\n\t\ttarget.Button = 'constructed';\n\t}\n}\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nnew Patch(ui);\nexport const result = () => App().props.children[0].type;",
				'constructed',
			],
			[
				// A namespace object's own properties are read-only, but not the
				// properties of the objects it exports
				'a property path under a namespace import the module assigns',
				"import * as lib from './lib';\nfunction App() {\n\treturn <div><lib.Menu.Item>hello</lib.Menu.Item></div>;\n}\nlib.Menu.Item = 'deep';\nexport const result = () => App().props.children[0].type;",
				'deep',
			],
			[
				// Any property write under the name counts, even under a local that
				// shadows it
				'an import whose name another function writes a property of as a local',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nexport function other(ui: any) {\n\tui.Button = 'local';\n}\nexport const result = () => App().props.children[0].type;",
				'original',
			],
		])(
			'leaves JSX whose member tag reads %s in place, reading it at render time',
			async (_case, source, expected) => {
				const { code } = compile(source, 'App.tsrx');
				expect(code).not.toContain('__static');
				expect(
					await run_result(code, {
						'./ui': { default: { Button: 'original', Menu: { Item: 'original' } } },
						'./menu': { Menu: { Item: 'original' } },
						'./lib': { Menu: { Item: 'original' } },
					}),
				).toBe(expected);
			},
		);

		it('leaves JSX whose member tag reads an import a directive body assigns a property of in place', () => {
			const { code } = compile(
				"import ui from './ui';\nexport function App() @{\n\t<>\n\t\t@if (true) {\n\t\t\tui.Button = 'branch';\n\t\t\t<b>branch</b>\n\t\t}\n\t\t<div><ui.Button>hello</ui.Button></div>\n\t</>\n}",
				'App.tsrx',
			);
			expect(code).toContain('<div><ui.Button>hello</ui.Button></div></>');
			expect(code).not.toMatch(/__static\d+ = <div>/);
		});

		it('leaves the static JSX of a component inside another function in place', () => {
			// Its statics would go to module level, which only the components a
			// top-level statement holds outside any other function reach
			const { code } = compile(
				'function outer() {\n\tfunction App() {\n\t\treturn <div>hi</div>;\n\t}\n\treturn App();\n}\nexport const result = () => outer().type;',
				'App.tsrx',
			);
			expect(code).not.toContain('__static');
			expect(run_result(code)).toBe('div');
		});

		it('leaves the static JSX of a component in a namespace in place', () => {
			// Inside a namespace body, a name can read an export of any declaration
			// of the namespace, which module level can't see
			const { code } = compile(
				'namespace N {\n\texport function App() {\n\t\treturn <div>hi</div>;\n\t}\n}\nexport const result = () => N.App().type;',
				'App.tsrx',
			);
			expect(code).not.toContain('__static');
			expect(run_result(code)).toBe('div');
		});

		it.each(['_tsrx_spread_props_1', 'App__spread_props1'])(
			'names the spread temporary of a component inside a method apart from a %s the author wrote',
			(user_name) => {
				const { code } = compile(
					'export class Holder {\n' +
						'\tmake() {\n' +
						'\t\tfunction App(props: any) {\n' +
						`\t\t\tconst ${user_name} = 'mine';\n` +
						`\t\t\treturn <div {...props.rest} ref={props.r} title={${user_name}} />;\n` +
						'\t\t}\n' +
						'\t\treturn App;\n' +
						'\t}\n' +
						'}\n' +
						'export const result = () => {\n' +
						"\tconst element = new Holder().make()({ rest: { id: 'spread' }, r: null });\n" +
						'\treturn [element.props.id, element.props.title];\n' +
						'};',
					'App.tsrx',
				);
				expect(run_result(code)).toEqual(['spread', 'mine']);
			},
		);

		it.each([
			[
				'a const declared before it',
				"const Tag = 'section';\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nexport const result = () => App().props.children[0].type;",
				'section',
			],
			[
				'a member of an import',
				"import * as ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nexport const result = () => App().props.children[0].type;",
				'./ui.Button',
			],
			[
				'a member of a default import',
				"import ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nexport const result = () => App().props.children[0].type;",
				'./ui.default.Button',
			],
			[
				// A namespace object's own properties are read-only
				'a member of a namespace import whose property the module assigns',
				"import * as ui from './ui';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nexport function patch() {\n\t(ui as any).Button = 'patched';\n\tObject.assign(ui, { Button: 'patched' });\n}\nexport const result = () => App().props.children[0].type;",
				'./ui.Button',
			],
			[
				'an import whose property the module assigns',
				"import { Tag } from './tag';\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nexport function patch() {\n\t(Tag as any).displayName = 'T';\n}\nexport const result = () => App().props.children[0].type;",
				'./tag.Tag',
			],
			[
				'a member of an import beside one whose property the module assigns',
				"import ui from './ui';\nimport other from './other';\nfunction App() {\n\treturn <div><ui.Button>hello</ui.Button></div>;\n}\nother.Button = 'other';\nexport const result = () => App().props.children[0].type;",
				'./ui.default.Button',
			],
			[
				'a function declared after it',
				'function App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nfunction Tag() {\n\treturn null;\n}\nexport const result = () => App().props.children[0].type === Tag;',
				true,
			],
			[
				'a class declared before it',
				'class Box {}\nfunction App() {\n\treturn <div><Box>hello</Box></div>;\n}\nexport const result = () => App().props.children[0].type === Box;',
				true,
			],
			[
				'a re-exported import',
				"import { Tag } from './tag';\nexport { Tag };\nfunction App() {\n\treturn <div><Tag>hello</Tag></div>;\n}\nexport const result = () => App().props.children[0].type;",
				'./tag.Tag',
			],
		])('hoists JSX whose tag reads %s', (_case, source, expected) => {
			const { code } = compile(source, 'App.tsrx');
			// Solid and Vue never hoist
			if (hoistsStaticJsx) {
				expect(code).toContain('const App__static1 = <div>');
			}
			expect(run_result(code)).toBe(expected);
		});

		it.each([
			[
				'in the component and at module level',
				"const App__static1 = 'module';\nexport function App() {\n\tconst App__static2 = 'local';\n\treturn <>{<div>static</div>}<b>bare</b>{App__static1}{App__static2}</>;\n}\nexport const result = () => App().props.children.map((child: any) => (typeof child === 'object' ? child.type : child));",
				['App__static3', 'App__static4'],
				['div', 'b', 'module', 'local'],
			],
			[
				'with a $ in its name',
				"export function $App() {\n\tconst $App__static1 = 'local';\n\treturn <>{<div>static</div>}{$App__static1}</>;\n}\nexport const result = () => $App().props.children.map((child: any) => (typeof child === 'object' ? child.type : child));",
				['$App__static2'],
				['div', 'local'],
			],
		])(
			'names a static apart from an authored static name %s',
			(_case, source, statics, expected) => {
				const { code } = compile(source, 'App.tsrx');
				expect(
					[...code.matchAll(/^const (\S+__static\d+) = </gm)].map((match) => match[1]),
				).toEqual(hoistsStaticJsx ? statics : []);
				expect(run_result(code)).toEqual(expected);
			},
		);

		it('hoists an intrinsic tag that shares its name with a later binding', () => {
			const { code } = compile(
				'function App() {\n\treturn <div>hello</div>;\n}\nconst div = 1;\nexport const result = () => App().type;',
				'App.tsrx',
			);
			if (hoistsStaticJsx) {
				expect(code).toContain('const App__static1 = <div>hello</div>;');
			}
			expect(run_result(code)).toBe('div');
		});

		it.each([
			[
				'an expression container',
				'export function App() @{\n\t<div>{<script type="application/json">{"a":1}</script>}</div>\n}',
			],
			[
				'a component prop',
				'function Slot({ content }: { content: unknown }) {\n\treturn content;\n}\nexport function App() @{\n\t<Slot content={<script type="application/json">{"a":1}</script>} />\n}',
			],
		])('keeps the body of a raw script in %s of static JSX (#845)', (_case, source) => {
			const { code } = compile(source, 'App.tsrx');
			expect(code).toContain(`'{"a":1}'`);
		});

		describe('in expression containers (#81)', () => {
			/** @param {string} code */
			const static_count = (code) => code.match(/^const App__static\d+ = /gm)?.length ?? 0;

			it('hoists a static element in a container like the bare one beside it', () => {
				const { code } = compile(
					'export function App() {\n\treturn <>{<b>a</b>}<b>b</b></>;\n}\n' +
						'export const result = () => {\n' +
						'\tconst [first, second] = [App(), App()];\n' +
						'\treturn [first.props.children.length, ...first.props.children.map((child: unknown, i: number) => child === second.props.children[i])];\n' +
						'};',
					'App.tsrx',
				);
				if (hoistsStaticJsx) {
					expect(code).toContain('const App__static1 = <b>a</b>;');
					expect(code).toContain('const App__static2 = <b>b</b>;');
					expect(code).toContain('return <>{App__static1}{App__static2}</>;');
					expect(run_result(code)).toEqual([2, true, true]);
				} else {
					expect(code).not.toContain('__static');
					expect(run_result(code)).toEqual([2, false, false]);
				}
			});

			it('hoists through children, attribute values, branches, nested containers and fragments', () => {
				const { code } = compile(
					`function Card(props: { header: unknown; n: number; children?: unknown }) {
	return null;
}
export function App(props: { on: boolean; n: number; label?: string }) {
	return (
		<div title={String(props.n)}>
			{<b>child</b>}
			<Card header={<h1>header</h1>} n={props.n}>
				{<i>card child</i>}
			</Card>
			{props.on ? <span>on</span> : <span>off</span>}
			{props.on && <em>and</em>}
			{props.label ?? <s>fallback</s>}
			{<p title={String(props.n)}>{<u>nested</u>}</p>}
			{<><a>one</a><a>two</a></>}
		</div>
	);
}
const strip = (node: any): any =>
	node && typeof node === 'object'
		? { type: typeof node.type === 'function' ? node.type.name : node.type, props: Object.fromEntries(Object.entries(node.props).map(([k, v]) => [k, Array.isArray(v) ? v.map(strip) : strip(v)])) }
		: node;
export const result = () => [App({ on: true, n: 1 }), App({ on: false, n: 2, label: 'x' })].map(strip);`,
					'App.tsrx',
				);
				if (hoistsStaticJsx) {
					expect(static_count(code)).toBe(10);
					expect(code).toContain(
						'return <div title={String(props.n)}>{App__static1}<Card header={App__static2} n={props.n}>{App__static3}</Card>{props.on ? App__static4 : App__static5}{props.on && App__static6}{props.label ?? App__static7}{<p title={String(props.n)}>{App__static8}</p>}{<>{App__static9}{App__static10}</>}</div>;',
					);
				} else {
					expect(code).not.toContain('__static');
				}
				/** @param {string} type @param {Record<string, unknown>} [props] */
				const el = (type, props = {}) => ({ type, props });
				/** @param {boolean} on @param {number} n @param {unknown} fallback */
				const tree = (on, n, fallback) =>
					el('div', {
						title: String(n),
						children: [
							el('b', { children: ['child'] }),
							el('Card', {
								header: el('h1', { children: ['header'] }),
								n,
								children: [el('i', { children: ['card child'] })],
							}),
							el('span', { children: [on ? 'on' : 'off'] }),
							on && el('em', { children: ['and'] }),
							fallback,
							el('p', { title: String(n), children: [el('u', { children: ['nested'] })] }),
							el('Fragment', {
								children: [el('a', { children: ['one'] }), el('a', { children: ['two'] })],
							}),
						],
					});
				expect(run_result(code)).toEqual([
					tree(true, 1, el('s', { children: ['fallback'] })),
					tree(false, 2, 'x'),
				]);
			});

			it('hoists a static element in a nested container of a component body', () => {
				const { code } = compile(
					`export function App(props: { n: number }) @{
	const label = String(props.n);
	<section title={label}>
		{<div title={label}>{<span>nested</span>}</div>}
	</section>
}`,
					'App.tsrx',
				);
				if (hoistsStaticJsx) {
					expect(code).toContain('const App__static1 = <span>nested</span>;');
					expect(code).toContain(
						'return <section title={label}>{<div title={label}>{App__static1}</div>}</section>;',
					);
				} else {
					expect(code).not.toContain('__static');
				}
			});

			it('hoists only host elements in a conditional container', () => {
				// A static reads its tags when the module loads; a component the
				// render may never reach can be uninitialized then (a cyclic import)
				const { code } = compile(
					`import * as ui from './ui';
function Icon(props: { size: number }) {
	return null;
}
export function App(props: { on: boolean; n: number; label?: string }) {
	return <div title={String(props.n)}>
		{props.on && <ui.Button x="x" />}
		{props.on ? <Icon size={1} /> : <span>off</span>}
		{props.label ?? <b><Icon size={2} /></b>}
		{props.on || <i>host</i>}
		{props.on && <p title={String(props.n)}>{<Icon size={3} />}{<em>nested host</em>}</p>}
	</div>;
}`,
					'App.tsrx',
				);
				if (hoistsStaticJsx) {
					expect(code.match(/^const App__static\d+ = .*$/gm)).toEqual([
						'const App__static1 = <span>off</span>;',
						'const App__static2 = <i>host</i>;',
						'const App__static3 = <em>nested host</em>;',
					]);
					expect(code).toContain('{props.on && <ui.Button x="x" />}');
					expect(code).toContain('{props.on ? <Icon size={1} /> : App__static1}');
					expect(code).toContain('{props.label ?? <b><Icon size={2} /></b>}');
					expect(code).toContain('{<Icon size={3} />}{App__static3}');
				} else {
					expect(code).not.toContain('__static');
				}
			});

			it('does not read a component in a conditional container when the module loads', () => {
				const { code } = compile(
					"import * as ui from './ui';\n" +
						'export function App(props: { on: boolean }) {\n' +
						'\treturn <>{props.on && <ui.Button x="x" />}</>;\n' +
						'}\n' +
						'export const result = () => App({ on: false }).props.children;',
					'App.tsrx',
				);
				const ui = {
					get Button() {
						throw new Error('ui.Button read');
					},
				};
				expect(run_result(code, { './ui': ui })).toEqual([false]);
			});

			it('hoists a component in an unconditional container, as it does a bare one', () => {
				const { code } = compile(
					`import * as ui from './ui';
function Icon(props: { size: number }) {
	return null;
}
export function App(props: { n: number }) {
	return <div title={String(props.n)}>
		{<ui.Button x="x" />}
		<ui.Button x={<Icon size={1} />} y={String(props.n)} />
	</div>;
}`,
					'App.tsrx',
				);
				if (hoistsStaticJsx) {
					expect(code.match(/^const App__static\d+ = .*$/gm)).toEqual([
						'const App__static1 = <ui.Button x="x" />;',
						'const App__static2 = <Icon size={1} />;',
					]);
				} else {
					expect(code).not.toContain('__static');
				}
			});

			it('hoists each of two static containers on its own instead of merging them', () => {
				const { code } = compile(
					'export function App() {\n\treturn <>{<b>a</b>}{<b>b</b>}</>;\n}',
					'App.tsrx',
				);
				if (hoistsStaticJsx) {
					expect(static_count(code)).toBe(2);
					expect(code).toContain('return <>{App__static1}{App__static2}</>;');
				} else {
					expect(code).not.toContain('__static');
				}
			});

			it('leaves keyed elements, binding reads, bare children and other expressions in place', () => {
				const { code } = compile(
					`function Card(props: { n?: number }) {
	return null;
}
function Helper() {
	return null;
}
export function App(props: { on: boolean; n: number; items: string[] }) {
	return (
		<div title={String(props.n)}>
			<p>bare child</p>
			{<b key="k">keyed</b>}
			{props.on ? <i key="on">on</i> : <i key="off">off</i>}
			{<b>{props.n}</b>}
			{<Card n={props.n} />}
			{<Helper />}
			{props.items.map((item) => <li>row</li>)}
			{[<u key="a">a</u>]}
		</div>
	);
}`,
					'App.tsrx',
				);
				expect(code).not.toContain('__static');
			});

			it('hoists the statics of the shared runtime fixture', () => {
				const source = readFileSync(
					new URL('./runtime/static-containers-components.tsrx', import.meta.url),
					'utf8',
				);
				const { code } = compile(source, 'StaticContainers.tsrx');
				expect(code.match(/^const StaticContainers__static\d+ = /gm)?.length ?? 0).toBe(
					hoistsStaticJsx ? 10 : 0,
				);
			});
		});
	});

	describe(`[${name}] native raw HTML props`, () => {
		it('uses the target framework raw HTML prop directly', () => {
			const html_attribute =
				name === 'react' || name === 'preact'
					? 'dangerouslySetInnerHTML={{ __html: markup }}'
					: 'innerHTML={markup}';
			const { code } = compile(
				`export function App({ markup }: { markup: string }) @{
						<article ${html_attribute} />
					}`,
				'App.tsrx',
			);

			expect(code).toContain(html_attribute);
		});

		it('treats html as an ordinary expression identifier', () => {
			const { code } = compile(
				`export function App() @{
						const html = '<strong>escaped</strong>';
						<article>{html}</article>
					}`,
				'App.tsrx',
			);

			expect(code).toContain('html');
			expect(code).not.toContain('{html ');
		});
	});

	describe(`[${name}] JSX fragment shorthand in element context`, () => {
		// Distinct from the `<> and fragment unwrapping` block — those
		// cases put `<>` / `<>` in an *expression* position (return value).
		// These put `<>` inside another element, as a prop value, or inside
		// a `<>` block at a JSX-child position.

		it('collapses a single-child fragment inside an element', () => {
			const { code } = compile(
				`export function App() @{
					<b><>{111}</></b>
				}`,
				'App.tsrx',
			);
			expect(code).toContain('<b>{111}</b>');
			expect(code).not.toContain('<>');
		});

		it('allows JSX fragments inside tsx blocks without throwing', () => {
			expect(() =>
				compile(
					`export function App() @{
						<><>{111}</></>
					}`,
					'App.tsrx',
				),
			).not.toThrow();
		});

		it('supports fragment shorthand passed as a component prop', () => {
			const { code } = compile(
				`function Child(props) @{
					<div>{props.content}</div>
				}

				export function App() @{
					<Child content={<><span>{'hello'}</span></>} />
				}`,
				'App.tsrx',
			);
			expect(code).toContain('<Child content={');
			expect(code).toContain("<span>{'hello'}</span>");
			expect(code).not.toContain('<tsx>');
		});
	});

	describe(`[${name}] scoped CSS`, () => {
		it('applies the scope hash to host elements and emits the hashed stylesheet', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
					<>
						<div ${generatedClassAttrName}="div">{'Hello world'}</div>

						<style>
							.div { color: red; }
						</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(code).toContain("{'Hello world'}");
			expect(code).toContain(`${generatedClassAttrName}="div ${cssHash}"`);
			expect(css).toContain(`.div.${cssHash}`);
			expect(css).toContain('color: red;');
		});

		it('applies the scope hash inside a <> block', () => {
			const { code, css, cssHash } = compile(
				`function Card() @{
					<>
						<>
							<div ${generatedClassAttrName}="card">
								<h2>{'Scoped title'}</h2>
								<p>{'Styles here do not leak out.'}</p>
							</div>
						</>

						<div ${generatedClassAttrName}="card">
							<h2>{'Scoped title'}</h2>
							<p>{'Styles here do not leak out.'}</p>
						</div>

						<style>
							.card {
								padding: 1.5rem;
								border: 1px solid #ddd;
							}

							h2 {
								color: #333;
							}
						</style>
					</>
				}`,
				'Card.tsrx',
			);

			expect(css).not.toBe('');
			expect(count_substring(code, `${generatedClassAttrName}="card ${cssHash}"`)).toBe(2);
		});

		it('applies the scope hash inside fragment shorthand', () => {
			const { code, css, cssHash } = compile(
				`function Card() @{
					<>
						<>
							<div ${generatedClassAttrName}="card">
								<h2>{'Scoped title'}</h2>
								<p>{'Styles here do not leak out.'}</p>
							</div>
						</>

						<div ${generatedClassAttrName}="card">
							<h2>{'Scoped title'}</h2>
							<p>{'Styles here do not leak out.'}</p>
						</div>

						<style>
							.card {
								padding: 1.5rem;
								border: 1px solid #ddd;
							}

							h2 {
								color: #333;
							}
						</style>
					</>
				}`,
				'Card.tsrx',
			);

			expect(css).not.toBe('');
			expect(count_substring(code, `${generatedClassAttrName}="card ${cssHash}"`)).toBe(2);
		});

		it('does not apply scoped css hashes to composite components', () => {
			const { code, css, cssHash } = compile(
				`function Child() @{
					<div>{'Hello world'}</div>
				}

				export function App() @{
					<>
						<Child />
						<div>{'Styled content'}</div>

						<style>
							.div { color: red; }
						</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(code).toContain(
				`<div ${generatedClassAttrName}="${cssHash}">{'Styled content'}</div>`,
			);
			expect(code).not.toMatch(/<Child\s+class(Name)?="/);
		});

		it('passes style expression classes through a composite component prop', () => {
			const { code, css, cssHash } = compile(
				`function Badge(${componentClassParam}) @{
					<>
						<span class={['badge', className ?? '']}>{'New'}</span>

						<style>
							.badge { padding: 0.25rem 0.5rem; }
						</style>
					</>
				}

					export function App() @{
						const styles = <style>
							.highlight { background: green; }
						</style>;
						<Badge ${componentClassAttrName}={styles.highlight} />
					}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(cssHash).not.toBeNull();
			const app_hash = cssHash?.split(' ').find((h) => code.includes(`${h} highlight`));
			expect(app_hash).toBeTruthy();
			expect(code).toContain(`${app_hash} highlight`);
			expect(code).toContain(`${componentClassAttrName}={styles.highlight}`);
		});

		it('passes style expression classes through a composite component prop when the element has children', () => {
			const { code, css, cssHash } = compile(
				`function Child(${componentClassParam}) @{
							<span class={className}>hello world</span>
					}

						export function App() @{
							const styles = <style>
								.container { color: red; }
							</style>;
								<Child ${componentClassAttrName}={styles.container}>hello world</Child>
						}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(cssHash).not.toBeNull();
			const app_hash = cssHash?.split(' ').find((h) => code.includes(`${h} container`));
			expect(app_hash).toBeTruthy();
			expect(code).toContain(`${app_hash} container`);
			expect(code).toContain(`${componentClassAttrName}={styles.container}`);
		});

		it('passes hyphenated style expression class names through a composite component prop', () => {
			const { code, css, cssHash } = compile(
				`export function App() @{
						const styles = <style>
							.accent-tone { color: red; }
						</style>;
						<Child cls={styles['accent-tone']} />
					}`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(code).toContain('accent-tone');
		});

		it('lowers style expressions inside an expression-position code block', () => {
			const { code, css, cssHash } = compile(
				`const Test = @{
						const styles = <style>
							.card { margin: 5px; }
						</style>;
						<div class={styles.card} />
					};`,
				'App.tsrx',
			);

			expect(css).not.toBe('');
			expect(cssHash).not.toBeNull();
			const hash = cssHash?.split(' ').find((h) => code.includes(`${h} card`));
			expect(hash).toBeTruthy();
			expect(css).toContain(`.card.${hash}`);
			expect(code).toContain(`${classAttrName}={styles.card}`);
			expect(code).not.toContain('JSXStyleElement');
		});

		it('lowers a style expression that is the only content of an expression-position code block', () => {
			const { code, css } = compile(
				`const Test = @{
						const styles = <style>
							.card { margin: 5px; }
						</style>
					};`,
				'App.tsrx',
			);

			expect(css).toContain('margin: 5px;');
			expect(code).toContain('card');
		});

		it('keeps every selector of a style expression that only class entries read', () => {
			const { css, cssHash } = compile(
				`export function App() @{
						const styles = <style>
							div { color: red; }
							.parent .card { font-weight: bold; }
							.card {
								color: green;
								&:hover { color: blue; }
							}
							:global(.badge) { padding: 0; }
							:global(body) { margin: 0; }
						</style>;
						<div class={styles.card} />
					}`,
				'App.tsrx',
			);

			// An assigned block is a theme: `$class` can reach any element, so
			// element, descendant, and global selectors all stay.
			expect(css).not.toContain('(unused)');
			expect(css).toContain(`div.${cssHash} { color: red; }`);
			expect(css).toContain(`.parent.${cssHash} .card:where(.${cssHash}) { font-weight: bold; }`);
			expect(css).toContain(`.card.${cssHash}`);
			expect(css).toContain('&:hover { color: blue; }');
			expect(css).toContain('.badge { padding: 0; }');
			expect(css).not.toContain(`.badge.${cssHash}`);
			expect(css).toContain('body { margin: 0; }');
		});

		it('matches free-standing selectors for both class and className attributes', () => {
			const { css, cssHash } = compile(
				`export function App() @{
						<>
							<div class="a">{'a'}</div>
							<span className="b">{'b'}</span>

							<style>
								.a { color: red; }
								.b { color: blue; }
							</style>
						</>
					}`,
				'App.tsrx',
			);

			expect(css).toContain(`.a.${cssHash}`);
			expect(css).toContain(`.b.${cssHash}`);
			expect(css).not.toContain('(unused)');
		});

		it('prunes free-standing selectors that match no element', () => {
			const { css, cssHash } = compile(
				`export function App() @{
						<>
							<div ${generatedClassAttrName}="card">{'Foo'}</div>

							<style>
								div { color: red; }
								.card { color: green; }
								span { color: gray; }
								:global(.test) { color: black; }
							</style>
						</>
					}`,
				'App.tsrx',
			);

			expect(css).toContain(`div.${cssHash}`);
			expect(css).toContain(`.card.${cssHash}`);
			expect(css).toContain('/* (unused) span { color: gray; }*/');
			expect(css).toContain('.test { color: black; }');
		});

		it('keeps descendant selectors that match across nesting and control flow', () => {
			// Combinator selectors (`.card h2`) match through each element's
			// ancestor chain. Pruning runs before the transform walker stamps
			// paths onto template nodes, so element collection has to record the
			// chain itself — regression: every combinator selector was marked
			// unused in the shared JSX targets.
			const { css, cssHash } = compile(
				`export function App({ ready }: { ready: boolean }) @{
					<>
						<section ${generatedClassAttrName}="card">
							<h2>{'title'}</h2>

							@if (ready) {
								<ul>
									<li>{'item'}</li>
								</ul>
							}
						</section>

						<style>
							.card {
								padding: 1rem;
							}
							.card h2 {
								margin: 0;
							}
							.card ul {
								margin: 0;
							}
							.card ol {
								margin: 0;
							}
						</style>
					</>
				}`,
				'App.tsrx',
			);

			expect(css).toContain(`.card.${cssHash}`);
			expect(css).toContain(`.card.${cssHash} h2:where(.${cssHash})`);
			expect(css).toContain(`.card.${cssHash} ul:where(.${cssHash})`);
			expect(css).toContain('/* (unused) .card ol');
		});
	});

	describe.runIf(['react', 'preact'].includes(name))(
		`[${name}] conditional hooks are not extracted`,
		() => {
			it('leaves hooks inside authored template control flow', () => {
				const { code } = compile(
					`export function App({ show }: { show: boolean }) @{
							@if (show) {
								const [count] = useState(0);
								<div>{count}</div>
							}
						}`,
					'App.tsrx',
				);

				expect(code).toContain('useState(0)');
				expect(code).toContain('return show');
				expect(code).not.toContain('StatementBodyHook');
			});

			it('keeps guard returns and later hooks in the component body', () => {
				const { code } = compile(
					`import { useEffect } from '${name === 'preact' ? 'preact/hooks' : 'react'}';

						export function App({ ready }: { ready: boolean }) @{
							if (!ready) {
								return null;
							}

							useEffect(() => {});

							<div />
						}`,
					'App.tsrx',
				);

				expect(code).toContain('if (!ready) {');
				expect(code).toContain('useEffect(() => {});');
				expect(code).toContain('<div />');
				expect(code).not.toContain('StatementBodyHook');
			});
		},
	);
}

/**
 * Compile-time platform specialization shared by every built-in JSX target.
 *
 * @param {Pick<CompileHarness, 'compile' | 'name'>} harness
 */
function runSharedPlatformTests({ compile, name }) {
	describe(`[${name}] compile-time platform flags`, () => {
		it.each([
			['web', 'selected_web'],
			['ios', 'selected_ios'],
			['android', 'selected_android'],
		])('selects the %s branch before target lowering', (platform, selected) => {
			const { code } = compile(
				`if (import.meta.env.platform.web) {
					const selected_web = 'selected_web';
				} else if (import.meta.env.platform.ios) {
					const selected_ios = 'selected_ios';
				} else {
					const selected_android = 'selected_android';
				}`,
				'App.tsrx',
				{ platform: /** @type {import('../../types/index').Platform} */ (platform) },
			);

			expect(code).toContain(selected);
			for (const discarded of ['selected_web', 'selected_ios', 'selected_android']) {
				if (discarded !== selected) expect(code).not.toContain(discarded);
			}
			expect(code).not.toContain('import.meta.env.platform');
		});

		it('specializes nested guards and retains selected lexical blocks', () => {
			const { code } = compile(
				`if (import.meta.env.platform.ios) {
					const outer = 'ios_outer';
					if (import.meta.env.platform.ios) {
						const inner = outer;
						consume(inner);
					}
				} else {
					consume('not_ios');
				}`,
				'App.tsrx',
				{ platform: 'ios' },
			);

			expect(code).toContain("const outer = 'ios_outer'");
			expect(code).toContain('const inner = outer');
			expect(code).toMatch(/\{[\s\S]*const outer[\s\S]*\{[\s\S]*const inner/);
			expect(code).not.toContain('not_ios');
		});

		it('keeps var bindings hoisted from an inactive branch', () => {
			const { code } = compile(
				`if (import.meta.env.platform.web) { var value = 'web_value'; }
				export { value };
				export function read() {
					if (import.meta.env.platform.web) { var local = 'web_local'; }
					return local;
				}`,
				'App.tsrx',
				{ platform: 'ios' },
			);

			expect(code).toMatch(/var value;[\s\S]*export \{ value \}/);
			expect(code).toMatch(/function read\(\) \{\s*var local;\s*return local;/);
			expect(code).not.toContain('web_value');
			expect(code).not.toContain('web_local');
		});

		it('declares only discarded var bindings the selected branch lacks', () => {
			const { code } = compile(
				`if (import.meta.env.platform.web) {
					var shared = 'web_shared';
					var web_only = 'web_only';
				} else {
					var shared = 'native_shared';
				}
				export { shared, web_only };`,
				'App.tsrx',
				{ platform: 'android' },
			);

			expect(code).toMatch(/var web_only;[\s\S]*var shared = 'native_shared'/);
			expect(code).not.toContain('var shared;');
			expect(code).not.toContain('web_shared');
		});

		it('drops inactive imports and scoped CSS before dependency/style analysis', () => {
			const { code, css } = compile(
				`if (import.meta.env.platform.web) {
					import('./missing-web-only');
					function PlatformView() @{ <>
						<style>.web-only { color: red; }</style>
						<div class="web-only" />
					</> }
				} else {
					function PlatformView() @{ <>
						<style>.native-only { color: blue; }</style>
						<div class="native-only" />
					</> }
				}`,
				'App.tsrx',
				{ platform: 'android' },
			);

			expect(code).not.toContain('missing-web-only');
			expect(code).not.toContain('web-only');
			expect(code).toContain('native-only');
			expect(css).not.toContain('web-only');
			expect(css).toContain('native-only');
		});

		it('does not semantically analyze an inactive TSRX branch', () => {
			expect(() =>
				compile(
					`if (import.meta.env.platform.web) {
						function InvalidOnlyOnWeb() @{
							<style>.invalid-lone-output { color: red; }</style>
						}
					} else {
						const selected_native = true;
					}`,
					'App.tsrx',
					{ platform: 'android' },
				),
			).not.toThrow();
		});

		it('keeps @if as runtime template control flow', () => {
			const { code } = compile(
				`function App() @{
					@if (import.meta.env.platform.web) {
						<div>{'web'}</div>
					} @else {
						<div>{'native'}</div>
					}
				}`,
				'App.tsrx',
				{ platform: 'web' },
			);

			expect(code).toContain('import.meta.env.platform.web');
			expect(code).toContain('web');
			expect(code).toContain('native');
		});

		it('requires configuration when a recognized flag is used', () => {
			expect(() => compile('if (import.meta.env.platform.web) { consume(); }', 'App.tsrx')).toThrow(
				error_with(TSRX_ERRORS.PLATFORM_REQUIRED),
			);

			const result = compile('if (import.meta.env.platform.web) { consume(); }', 'App.tsrx', {
				collect: true,
			});
			expect(diagnostic_codes(result)).toContain(DIAGNOSTIC_CODES.PLATFORM_REQUIRED);
		});

		it.each(['windows', null, true, 1, [], {}])(
			'rejects invalid platform option %j',
			(platform) => {
				expect(() =>
					compile('const value = 1;', 'App.tsrx', {
						platform: /** @type {any} */ (platform),
					}),
				).toThrow(/Invalid TSRX platform/);
			},
		);
	});
}

/**
 * `@{ … }` code blocks in template children position: each block is its own
 * lexical scope, and the lowering pays only for what the block uses —
 * template-only blocks merge statically into the parent, code-only blocks
 * become a plain `{ … }` statement block, and blocks with both setup code and
 * render output become a scoped IIFE child. Nested chains (`@{ @{ … } }`)
 * fold into a single closure with nested plain blocks, so shadowed
 * declarations stay scoped per level.
 *
 * @param {{ compile: CompileHarness['compile'], name: string }} harness
 */
export function runSharedCodeBlockChildrenTests({ compile, name }) {
	describe(`[${name}] code blocks in template children position`, () => {
		it('compiles empty nested code blocks to nothing at any depth', () => {
			for (const block of ['@{}', '@{@{}}', '@{@{@{}}}']) {
				const { code, errors } = compile(
					`function StatusBadge() @{
						<>
							<>{a}</>
							<>{b}</>
							${block}
						</>
					}`,
					'App.tsrx',
				);
				expect(errors ?? []).toEqual([]);
				expect(code).toContain('{a}');
				expect(code).toContain('{b}');
				expect(code).not.toContain('_tsrx_child_');
				expect(code).not.toContain('(() => {');
			}
		});

		it('merges a template-only block statically into its parent', () => {
			for (const block of [
				`@{<span class="x">{'x'}</span>}`,
				`@{@{@{<span class="x">{'x'}</span>}}}`,
			]) {
				const { code } = compile(
					`function App() @{
						<>
							<span class="a">{'a'}</span>
							${block}
						</>
					}`,
					'App.tsrx',
				);
				expect(code).toContain('<span class="x">');
				expect(code).not.toContain('(() => {');
				expect(code).not.toContain('_tsrx_child_');
			}
		});

		it('lowers a code-only block to a scoped statement block in source order', () => {
			const { code } = compile(
				`function App() @{
					const items: number[] = [];
					<>
						@{
							const scoped = 1;
							items.push(scoped);
						}
						<span class="len">{items.length}</span>
					</>
				}`,
				'App.tsrx',
			);
			// The statements run in source order inside a real `{ … }` block —
			// no inline IIFE needed.
			expect(code).toMatch(/\{\s*const scoped = 1;/);
			expect(code.indexOf('items.length')).toBeGreaterThan(code.indexOf('const scoped = 1;'));
			expect(code).not.toContain('(() => {');
		});

		it('lowers a block with setup code and render output to a scoped IIFE child', () => {
			const { code } = compile(
				`function App() @{
					<>
						<span class="a">{'a'}</span>
						@{
							const x = 1;
							<span class="x">{x}</span>
						}
					</>
				}`,
				'App.tsrx',
			);
			expect(code).toMatch(/\(\(\) => \{\s*const x = 1;/);
			expect(code).toContain('return <span class="x">{x}</span>');
		});

		it('gives each nested code block its own lexical scope in one closure', () => {
			const { code } = compile(
				`function App() @{
					const y = 10;
					<>
						<span class="a">{'a'}</span>
						@{
							const x = 1;
							@{
								const x = 2;
								@{
									<span class="sum">{x + y}</span>
								}
							}
						}
					</>
				}`,
				'App.tsrx',
			);
			// Shadowed declarations survive: each chain level is its own scope,
			// folded into a single closure with nested plain blocks.
			expect(code).toContain('const x = 1;');
			expect(code).toContain('const x = 2;');
			expect(code).toContain('<span class="sum">{x + y}</span>');
			expect(count_substring(code, '(() => {')).toBe(1);
		});
	});
}

/**
 * The `@catch` binding is the thrown value, which need not be an `Error`, so the
 * type-only output must type it `unknown`, as a `catch (error)` clause is under
 * `strict`. Checks the output against the real declarations the target package
 * resolves.
 *
 * @param {CompileDiagnosticsHarness & {
 *   package_dir: string,
 *   jsx_import_source: string,
 * }} harness
 */
export function runSharedCatchErrorTypeTests({
	compile_to_volar_mappings,
	name,
	package_dir,
	jsx_import_source,
}) {
	/** @type {ts.CompilerOptions} */
	const options = {
		strict: true,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		jsx: ts.JsxEmit.Preserve,
		jsxImportSource: jsx_import_source,
		lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
		types: [],
		skipLibCheck: true,
		noEmit: true,
	};
	// Not on disk, but inside the package, so its dependencies and its own
	// `exports` resolve as they do for an app.
	const file_name = path.join(package_dir, '__catch-type-probe__', 'App.tsx');

	/**
	 * @param {string} source
	 * @returns {string[]}
	 */
	function diagnostics(source) {
		const { code, errors } = compile_to_volar_mappings(source, 'App.tsrx');
		expect(errors).toEqual([]);

		const host = ts.createCompilerHost(options);
		const read_file = host.readFile.bind(host);
		const file_exists = host.fileExists.bind(host);
		const get_source_file = host.getSourceFile.bind(host);
		host.readFile = (name) => (name === file_name ? code : read_file(name));
		host.fileExists = (name) => name === file_name || file_exists(name);
		host.getSourceFile = (name, language_version, on_error, should_create_new) =>
			name === file_name
				? ts.createSourceFile(name, code, language_version, true)
				: get_source_file(name, language_version, on_error, should_create_new);

		return ts
			.getPreEmitDiagnostics(ts.createProgram([file_name], options, host))
			.filter((diagnostic) => diagnostic.file?.fileName === file_name)
			.map(
				(diagnostic) =>
					`TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
			);
	}

	describe(`${name} @catch error type`, () => {
		// Building a program with the DOM lib takes seconds, so one program
		// checks both forms.
		it('types the error as unknown until it is narrowed', () => {
			const source = `export function Unchecked() @{
				@try {
					<p>{'ok'}</p>
				} @catch (error) {
					<p>{error.message}</p>
				}
			}

			export function Narrowed() @{
				@try {
					<p>{'ok'}</p>
				} @catch (error) {
					<p>{error instanceof Error ? error.message : String(error)}</p>
				}
			}`;
			expect(diagnostics(source)).toEqual(["TS18046: 'error' is of type 'unknown'."]);
		}, 60_000);
	});
}
