import { SourceMap } from '@volar/source-map';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/diagnostics.js';
import { compile, compile_to_volar_mappings } from '../../../tsrx-react/src/index.js';

/**
 * Lexically scoped `<style>` blocks lower to plain object literals whose first
 * property is `$class`, and a scoped `<style apply={theme} />` survives in the
 * type-only (editor) output as `<style data-tsrx-apply={theme.$class} />`.
 * These run the TypeScript checker over that generated code — the same thing
 * the language server does — so a regression in the emitted shape shows up as
 * a lost `string` type on `$class`, a missing error on a non-style `apply`
 * target, or a diagnostic that no longer maps back to the authored source.
 */

/** @type {ts.CompilerOptions} */
const OPTIONS = {
	strict: true,
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	jsx: ts.JsxEmit.Preserve,
	lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
	skipLibCheck: true,
	noEmit: true,
};

// The generated code keeps JSX (`<style …/>` anchors and elements). Without a
// `JSX` namespace every element reports TS7026, which would drown the
// diagnostics under test, so declare a permissive one.
const JSX_DECLARATIONS =
	'declare namespace JSX { interface IntrinsicElements { [name: string]: any } }';

// A directory that does not exist on disk but sits under `packages/tsrx`, so
// module resolution for `./base.js` walks a real ancestor chain.
const VIRTUAL_ROOT = path.resolve('packages/tsrx/__style-class-probe__');

// Parsing lib.dom.d.ts dominates the cost of a program; the libs never change
// between snippets, so keep them across programs.
/** @type {Map<string, ts.SourceFile | undefined>} */
const source_file_cache = new Map();

/**
 * @typedef {{ file: string, code: number, start: number, end: number, message: string }} Diagnostic
 */

/**
 * Type-checks a set of generated `.tsx` modules as one program.
 * @param {Record<string, string>} files virtual file name → generated code
 * @returns {{ diagnostics: Diagnostic[], types: Record<string, string> }}
 */
function check_generated(files) {
	/** @type {Map<string, string>} */
	const virtual = new Map();
	for (const [name, code] of Object.entries(files)) {
		virtual.set(path.join(VIRTUAL_ROOT, name), code);
	}
	virtual.set(path.join(VIRTUAL_ROOT, 'jsx.d.ts'), JSX_DECLARATIONS);

	const host = ts.createCompilerHost(OPTIONS);
	const read_file = host.readFile.bind(host);
	const file_exists = host.fileExists.bind(host);
	const directory_exists = host.directoryExists?.bind(host);
	const get_source_file = host.getSourceFile.bind(host);

	host.readFile = (name) => (virtual.has(name) ? virtual.get(name) : read_file(name));
	host.fileExists = (name) => virtual.has(name) || file_exists(name);
	host.directoryExists = (name) =>
		name === VIRTUAL_ROOT || (directory_exists ? directory_exists(name) : false);
	host.getSourceFile = (name, language_version, on_error, should_create_new) => {
		if (virtual.has(name)) {
			return ts.createSourceFile(
				name,
				/** @type {string} */ (virtual.get(name)),
				language_version,
				true,
			);
		}
		if (!source_file_cache.has(name)) {
			source_file_cache.set(
				name,
				get_source_file(name, language_version, on_error, should_create_new),
			);
		}
		return source_file_cache.get(name);
	};

	const program = ts.createProgram([...virtual.keys()], OPTIONS, host);
	const checker = program.getTypeChecker();

	const diagnostics = ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.file && virtual.has(diagnostic.file.fileName))
		.map((diagnostic) => {
			const start = /** @type {number} */ (diagnostic.start);
			return {
				file: path.basename(/** @type {ts.SourceFile} */ (diagnostic.file).fileName),
				code: diagnostic.code,
				start,
				end: start + /** @type {number} */ (diagnostic.length),
				message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
			};
		});

	/** @type {Record<string, string>} */
	const types = {};
	for (const name of virtual.keys()) {
		const file = program.getSourceFile(name);
		ts.forEachChild(/** @type {ts.SourceFile} */ (file), (node) => {
			if (!ts.isVariableStatement(node)) return;
			for (const declaration of node.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) continue;
				types[declaration.name.text] = checker.typeToString(
					checker.getTypeAtLocation(declaration.name),
				);
			}
		});
	}

	return { diagnostics, types };
}

/**
 * Compiles a single `.tsrx` module with the react target and type-checks it.
 * @param {(source: string, filename: 'App.tsrx', options: { loose: true, collect: true }) => { code: string, errors: import('../../types/index').CompileError[], mappings?: import('../../types/index').VolarMappingsResult['mappings'] }} compiler
 * @param {string} source
 */
function check_source(compiler, source) {
	const result = compiler(source, 'App.tsrx', { loose: true, collect: true });
	return { ...result, ...check_generated({ 'App.tsx': result.code }) };
}

/**
 * Source range of the `n`th occurrence of `needle`.
 * @param {string} source
 * @param {string} needle
 * @param {number} [occurrence]
 * @returns {[number, number]}
 */
function range_of(source, needle, occurrence = 0) {
	let index = -1;
	for (let i = 0; i <= occurrence; i++) {
		index = source.indexOf(needle, index + 1);
		if (index < 0) throw new Error(`Missing ${JSON.stringify(needle)} in source`);
	}
	return [index, index + needle.length];
}

/**
 * Source range of the identifier inside `apply={name}`.
 * @param {string} source
 * @param {string} name
 * @returns {[number, number]}
 */
function apply_target_range(source, name) {
	const [start] = range_of(source, `apply={${name}}`);
	const identifier_start = start + 'apply={'.length;
	return [identifier_start, identifier_start + name.length];
}

/**
 * Line/column of an offset, in the analyzer's `loc` convention (1-based line,
 * 0-based column).
 * @param {string} source
 * @param {number} offset
 */
function line_column(source, offset) {
	const before = source.slice(0, offset);
	const line = before.split('\n').length;
	const column = offset - (before.lastIndexOf('\n') + 1);
	return { line, column };
}

/**
 * Translates a generated diagnostic range to source ranges through the Volar
 * mappings, the way the language server positions squiggles.
 * @param {import('../../types/index').VolarMappingsResult['mappings'] | undefined} mappings
 * @param {Diagnostic} diagnostic
 * @returns {Array<[number, number]>}
 */
function to_source_ranges(mappings, diagnostic) {
	if (!mappings) throw new Error('type-only output expected');
	const map = new SourceMap(mappings);
	return [...map.toSourceRange(diagnostic.start, diagnostic.end, true)].map(([start, end]) => [
		start,
		end,
	]);
}

/** @param {{ errors: Array<{ code?: string }> }} result */
function error_codes(result) {
	return result.errors.map((error) => error.code);
}

const OUTPUTS = /** @type {const} */ ([
	['runtime', compile],
	['type-only', compile_to_volar_mappings],
]);

describe('style class types', () => {
	describe('$class on an assigned style block', () => {
		const SOURCE = `const theme = <style>.dark { color: red; }</style>;
const x: string = theme.$class;
export function App() @{ <div class={theme.dark} /> }`;

		it.each(OUTPUTS)('is typed string in %s output', (_name, compiler) => {
			const { errors, diagnostics, types } = check_source(compiler, SOURCE);

			expect(errors).toEqual([]);
			expect(diagnostics).toEqual([]);
			expect(types.theme).toBe('{ $class: string; dark: string; }');
			expect(types.x).toBe('string');
		});

		it('rejects assigning $class to a number and maps the error to the authored binding', () => {
			const source = SOURCE.replace('const x: string', 'const y: number');
			const { diagnostics, mappings } = check_source(compile_to_volar_mappings, source);

			expect(diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
				{ code: 2322, message: "Type 'string' is not assignable to type 'number'." },
			]);
			const [binding_start] = range_of(source, 'y: number');
			expect(to_source_ranges(mappings, diagnostics[0])).toContainEqual([
				binding_start,
				binding_start + 1,
			]);
		});

		it('rejects an unknown $-property and maps the error to the authored access', () => {
			const source = SOURCE.replace('theme.$class', 'theme.$nope');
			const { diagnostics, mappings } = check_source(compile_to_volar_mappings, source);

			expect(diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
				{
					code: 2339,
					message: "Property '$nope' does not exist on type '{ $class: string; dark: string; }'.",
				},
			]);
			expect(to_source_ranges(mappings, diagnostics[0])).toContainEqual(range_of(source, '$nope'));
		});

		it('types a body-less apply bundle as a $class-only object', () => {
			const { errors, diagnostics, types } = check_source(
				compile_to_volar_mappings,
				`const a = <style>.a { color: red; }</style>;
const b = <style>.b { color: blue; }</style>;
export const bundle = <style apply={[a, b]} />;
const x: string = bundle.$class;`,
			);

			expect(errors).toEqual([]);
			expect(diagnostics).toEqual([]);
			expect(types.bundle).toBe('{ $class: string; }');
			expect(types.x).toBe('string');
		});
	});

	describe('scoped apply targets', () => {
		it('keeps the apply target as a checked data-tsrx-apply value in type-only output', () => {
			const single = check_source(
				compile_to_volar_mappings,
				`const theme = <style>.dark { color: red; }</style>;
export function App() @{ <><style apply={theme} /><div /></> }`,
			);
			const array = check_source(
				compile_to_volar_mappings,
				`const a = <style>.a { color: red; }</style>;
const b = <style>.b { color: blue; }</style>;
export function App() @{ <><style apply={[a, b]} /><div /></> }`,
			);

			expect(single.errors).toEqual([]);
			expect(single.code).toContain('<style data-tsrx-apply={theme.$class} />');
			expect(single.diagnostics).toEqual([]);
			expect(array.errors).toEqual([]);
			expect(array.code).toContain('<style data-tsrx-apply={[a.$class, b.$class]} />');
			expect(array.diagnostics).toEqual([]);
		});

		it.each([
			['a number', 'const theme = 1;', "'1'"],
			['an object without $class', "const theme = { dark: 'x' };", "'{ dark: string; }'"],
		])(
			'reports a same-module apply target that is %s inside the apply value',
			(_name, declaration, type_text) => {
				const source = `${declaration}
export function App() @{ <><style apply={theme} /><div /></> }`;
				const { errors, diagnostics, mappings } = check_source(compile_to_volar_mappings, source);
				const target = apply_target_range(source, 'theme');

				// The analyzer rejects the target on the authored identifier…
				expect(error_codes({ errors })).toEqual([DIAGNOSTIC_CODES.STYLE_APPLY_TARGET]);
				expect([errors[0].pos, errors[0].end]).toEqual(target);

				// …and the type-only output lets TypeScript reject it too, on the
				// synthesized `$class` read.
				expect(diagnostics.map(({ code, message }) => ({ code, message }))).toEqual([
					{ code: 2339, message: `Property '$class' does not exist on type ${type_text}.` },
				]);

				// The synthesized `.$class` has no authored counterpart, so the
				// diagnostic is positioned through the `{theme}` → `{theme.$class}`
				// container mapping. Volar clamps the longer generated side to the
				// source length, which keeps the squiggle inside the braces of
				// `apply={theme}` (today at its closing brace).
				const [brace_start, brace_end] = range_of(source, '{theme}');
				const ranges = to_source_ranges(mappings, diagnostics[0]);
				expect(ranges.length).toBeGreaterThan(0);
				for (const [start, end] of ranges) {
					expect(start).toBeGreaterThanOrEqual(brace_start);
					expect(end).toBeLessThanOrEqual(brace_end);
					expect(end).toBeGreaterThanOrEqual(target[0]);
				}
			},
		);
	});

	describe('composition with an imported style module', () => {
		const BASE_SOURCE = 'export const base = <style>.b { color: blue; }</style>;';
		const APP_SOURCE = `import { base } from './base.js';
export const theme = <style apply={base}>.x { color: red; }</style>;
const x: string = theme.$class;
export function App() @{ <><style apply={theme} /><div class={theme.x} /></> }`;

		it.each(OUTPUTS)(
			'types theme.$class as string across modules in %s output',
			(_name, compiler) => {
				const base = compiler(BASE_SOURCE, 'base.tsrx', { loose: true, collect: true });
				const app = compiler(APP_SOURCE, 'App.tsrx', { loose: true, collect: true });

				expect(base.errors).toEqual([]);
				expect(app.errors).toEqual([]);
				// The import is composed at runtime, since its hash is not known here.
				expect(app.code).toContain("'$class': base.$class + ' tsrx-");

				const { diagnostics, types } = check_generated({
					'base.tsx': base.code,
					'App.tsx': app.code,
				});

				expect(diagnostics).toEqual([]);
				expect(types.base).toBe('{ $class: string; b: string; }');
				expect(types.theme).toBe('{ $class: string; x: string; }');
				expect(types.x).toBe('string');
			},
		);
	});

	describe('apply before declaration', () => {
		it('reports the same identifier TypeScript flags as used before its declaration', () => {
			const source =
				'function App() @{ const view = <><style apply={theme} /><div /></>; const theme = <style>div{}</style>; <main>{view}</main> }';
			const target = apply_target_range(source, 'theme');
			const { errors, diagnostics, mappings } = check_source(compile_to_volar_mappings, source);

			expect(error_codes({ errors })).toEqual([DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION]);
			expect([errors[0].pos, errors[0].end]).toEqual(target);
			expect(errors[0].loc?.start).toEqual(line_column(source, target[0]));
			expect(errors[0].loc?.end).toEqual(line_column(source, target[1]));

			const used_before_declaration = diagnostics.filter((diagnostic) => diagnostic.code === 2448);
			expect(used_before_declaration.map(({ message }) => message)).toEqual([
				"Block-scoped variable 'theme' used before its declaration.",
			]);
			expect(to_source_ranges(mappings, used_before_declaration[0])).toContainEqual(target);

			// The runtime compiler reports the same position.
			const runtime = compile(source, 'App.tsrx', { collect: true });
			expect(error_codes(runtime)).toEqual([DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION]);
			expect([runtime.errors[0].pos, runtime.errors[0].end]).toEqual(target);
		});

		it('still reports a later module-scope block that TypeScript cannot see across the function boundary', () => {
			const source = `function App() @{ <><style apply={theme} /><div /></> }
const theme = <style>div{}</style>;`;
			const target = apply_target_range(source, 'theme');
			const { errors, diagnostics } = check_source(compile_to_volar_mappings, source);

			expect(diagnostics).toEqual([]);
			expect(error_codes({ errors })).toEqual([DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION]);
			expect([errors[0].pos, errors[0].end]).toEqual(target);
			expect(errors[0].loc?.start).toEqual(line_column(source, target[0]));
		});
	});
});
