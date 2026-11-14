import path from 'node:path';
import { TS_ERRORS } from '@tsrx/core/diagnostics';
import * as react from '@tsrx/react';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TSRXVirtualCode, TSRX_EXTENSIONS } from '../src/language.js';
import { report_tsrx_diagnostics } from '../src/tsc-diagnostics.js';

/**
 * `tsrx-tsc` prints the collected and thrown diagnostics of each `.tsrx` file
 * in a program through `report_tsrx_diagnostics`. These tests pin the line
 * shape, tsc's `file(line,col): error TS2339: message` with the path relative
 * to the current directory, because problem matchers and agents read it, and
 * the diagnostic code is what they grep for. Warning-severity entries must not
 * masquerade as errors, and a mistake TypeScript reports itself prints once.
 */

const RESULT = /** @type {import('@tsrx/core/types').VolarMappingsResult} */ (
	/** @type {unknown} */ ({
		code: 'export default null;',
		mappings: [],
		cssMappings: [],
		scriptMappings: [],
		sourceAst: null,
	})
);

/**
 * @param {unknown[]} errors partial CompileError entries — the plugin only
 *   reads `message`, `code`, `severity`, `pos`, `end`, `loc`, and `type`.
 * @returns {import('../src/language.js').TSRXCompilerModule}
 */
function compiler_collecting(errors) {
	return {
		compile_to_volar_mappings() {
			return {
				...RESULT,
				errors: /** @type {import('@tsrx/core/types').CompileError[]} */ (
					/** @type {unknown} */ (errors)
				),
			};
		},
	};
}

/**
 * @param {unknown} thrown
 * @returns {import('../src/language.js').TSRXCompilerModule}
 */
function compiler_throwing(thrown) {
	return {
		compile_to_volar_mappings() {
			throw thrown;
		},
	};
}

const FILE_NAME = path.resolve('src', 'App.tsrx');

/**
 * Compile `source` as `src/App.tsrx` under the current directory and report it
 * as `tsrx-tsc` does, with `typescript` as TypeScript's own diagnostics for the
 * file.
 * @param {import('../src/language.js').TSRXCompilerModule} compiler
 * @param {string} [source]
 * @param {Array<{ code: number, start: number, semantic?: boolean }>} [typescript]
 *   TypeScript's syntactic diagnostics for the file, and its semantic ones.
 * @param {{
 * 	listFilesOnly?: boolean,
 * 	syntax_error_elsewhere?: boolean,
 * 	options_error?: boolean,
 * 	global_error?: boolean,
 * }} [options]
 */
function report(
	compiler,
	source = 'export default <div>Hello</div>;',
	typescript = [],
	options = {},
) {
	const virtual_code = new TSRXVirtualCode(
		FILE_NAME,
		ts.ScriptSnapshot.fromString(source),
		compiler,
	);
	const source_file = { fileName: FILE_NAME };
	const language = /** @type {import('@volar/language-core').Language<string>} */ (
		/** @type {unknown} */ ({
			scripts: {
				get: (/** @type {string} */ id) =>
					id === FILE_NAME ? { generated: { root: virtual_code } } : undefined,
			},
		})
	);
	const of_kind = (/** @type {boolean} */ semantic) =>
		typescript
			.filter((diagnostic) => !!diagnostic.semantic === semantic)
			.map(({ code, start }) => ({ file: source_file, code, start }));
	const syntactic = of_kind(false);
	const elsewhere = { file: { fileName: path.resolve('other.ts') }, code: 1005, start: 0 };
	const global = { code: 2318, messageText: "Cannot find global type 'Array'." };
	const program = /** @type {import('typescript').Program} */ (
		/** @type {unknown} */ ({
			getSourceFiles: () => [{ fileName: path.resolve('lib.d.ts') }, source_file],
			getCompilerOptions: () => ({ listFilesOnly: options.listFilesOnly }),
			getSyntacticDiagnostics: (/** @type {unknown} */ file) =>
				file || !options.syntax_error_elsewhere ? syntactic : [...syntactic, elsewhere],
			getOptionsDiagnostics: () => (options.options_error ? [global] : []),
			getGlobalDiagnostics: () => (options.global_error ? [global] : []),
			getSemanticDiagnostics: () => of_kind(true),
		})
	);
	/** @type {string[]} */
	const lines = [];
	const printed_error = report_tsrx_diagnostics(language, program, TSRX_EXTENSIONS, (line) =>
		lines.push(line),
	);
	return { lines, printed_error };
}

describe('tsrx-tsc diagnostic lines', () => {
	it('prints a collected diagnostic with its code in tsc convention', () => {
		const result = report(
			compiler_collecting([
				{
					message: "'missing' is not a style block",
					code: 'tsrx-style-apply-target',
					type: 'usage',
				},
			]),
		);
		expect(result).toEqual({
			lines: ["src/App.tsrx: error tsrx-style-apply-target: 'missing' is not a style block"],
			printed_error: true,
		});
	});

	it('labels a warning-severity diagnostic as a warning, not an error', () => {
		const result = report(
			compiler_collecting([
				{
					message: "'.a' is never referenced",
					code: 'octane-style-unused-selector',
					severity: 'warning',
					type: 'usage',
				},
			]),
		);
		expect(result).toEqual({
			lines: ["src/App.tsrx: warning octane-style-unused-selector: '.a' is never referenced"],
			printed_error: false,
		});
	});

	it('prints a thrown fatal diagnostic with its code and position', () => {
		const thrown = Object.assign(new Error('expected a closing tag'), {
			code: 'tsrx-unclosed-tag',
			// `loc` columns are 0-based; the printed position is 1-based like tsc.
			loc: { start: { line: 3, column: 1 }, end: { line: 3, column: 5 } },
		});
		expect(report(compiler_throwing(thrown)).lines).toEqual([
			'src/App.tsrx(3,2): error tsrx-unclosed-tag: expected a closing tag',
		]);
	});

	it("prints a parse error's position, which acorn gives as `loc` itself", () => {
		// The parser throws `'}' expected.` at `b` with acorn's `loc`, a position
		// (`{ line: 3, column: 5 }`) instead of a range.
		const { code, message } = TS_ERRORS.TOKEN_EXPECTED('}');
		expect(
			report(react, 'export function Panel() @{\n\t<div>\n\t\t{a b}\n\t</div>\n}\n').lines,
		).toEqual([`src/App.tsrx(3,6): error ${code}: ${message} (3:5)`]);
	});

	it('prints the position of a diagnostic that has only `pos`', () => {
		// A consumer compiler may give only `pos` and `end`, as the language
		// server, which places a diagnostic by `pos`, allows.
		const source = 'const a = 1;\r\nexport default <div>{a}</div>;\n';
		const pos = source.indexOf('<div>');
		const result = report(
			compiler_collecting([
				{
					message: "'.a' is never referenced",
					code: 'octane-style-unused-selector',
					severity: 'warning',
					pos,
					end: pos + '<div>'.length,
					type: 'usage',
				},
			]),
			source,
		);
		expect(result.lines).toEqual([
			"src/App.tsrx(2,16): warning octane-style-unused-selector: '.a' is never referenced",
		]);
	});

	it('prints a thrown diagnostic as an error even when it is marked a warning', () => {
		// A thrown error stops the compile, so the language server shows it as an
		// error whatever its severity.
		const thrown = Object.assign(new Error('unsupported'), {
			code: 'octane-unsupported',
			severity: 'warning',
		});
		expect(report(compiler_throwing(thrown))).toEqual({
			lines: ['src/App.tsrx: error octane-unsupported: unsupported'],
			printed_error: true,
		});
	});

	it('keeps the bare severity label when a diagnostic has no code', () => {
		expect(report(compiler_throwing(new Error('parse blew up'))).lines).toEqual([
			'src/App.tsrx: error: parse blew up',
		]);
	});

	it('prints each mistake the parser collects at its own position, with its code', () => {
		// The same mistake twice in one file: tsrx-tsc printed it once, without
		// a position or code (#957).
		const { code, message } = TS_ERRORS.REST_ELEMENT_INITIALIZER;
		expect(
			report(
				react,
				'const b = [1];\nconst [...a = [1]] = b;\nconst [...c = [2]] = b;\nexport { a, c };\n',
			).lines,
		).toEqual([
			`src/App.tsrx(2,13): error ${code}: ${message}`,
			`src/App.tsrx(3,13): error ${code}: ${message}`,
		]);
	});

	it('leaves a mistake to TypeScript when it reports the same code at the same place', () => {
		// TypeScript reports TS1186 at the first `= [1]`, and another code at the
		// second, so tsc prints the first and tsrx-tsc only the second (#957).
		const source =
			'const b = [1];\nconst [...a = [1]] = b;\nconst [...c = [2]] = b;\nexport { a, c };\n';
		const { code, message } = TS_ERRORS.REST_ELEMENT_INITIALIZER;
		const first = source.indexOf('= [1]]');
		const second = source.indexOf('= [2]]');
		const result = report(react, source, [
			{ code: 1186, start: first, semantic: true },
			{ code: 2322, start: second, semantic: true },
		]);
		expect(result).toEqual({
			lines: [`src/App.tsrx(3,13): error ${code}: ${message}`],
			printed_error: true,
		});
		// With TypeScript reporting both, tsrx-tsc prints neither and leaves the
		// exit code to tsc.
		expect(
			report(react, source, [
				{ code: 1186, start: first, semantic: true },
				{ code: 1186, start: second, semantic: true },
			]),
		).toEqual({ lines: [], printed_error: false });
	});

	it('leaves nothing to semantic diagnostics that tsc does not report', () => {
		// tsc reports no semantic diagnostic with `--listFilesOnly`, or when a file
		// has a syntax error or the options or globals have errors, so tsrx-tsc's
		// line is then the only one.
		const source = 'const a = 1;\nconst a = 2;\nexport { a };\n';
		const second = source.lastIndexOf('a =');
		const compiler = compiler_collecting([
			{ message: "Cannot redeclare block-scoped variable 'a'.", code: 'TS2451', pos: second },
		]);
		const typescript = [{ code: 2451, start: second, semantic: true }];
		const line = "src/App.tsrx(2,7): error TS2451: Cannot redeclare block-scoped variable 'a'.";
		expect(report(compiler, source, typescript).lines).toEqual([]);
		for (const gate of [
			'listFilesOnly',
			'syntax_error_elsewhere',
			'options_error',
			'global_error',
		]) {
			expect(report(compiler, source, typescript, { [gate]: true }).lines, gate).toEqual([line]);
		}
	});

	it("doesn't leave a TSRX code to TypeScript", () => {
		const result = report(
			compiler_collecting([{ message: 'unclosed', code: 'TSRX1001', pos: 15, type: 'usage' }]),
			undefined,
			[{ code: 1001, start: 15 }],
		);
		expect(result.lines).toEqual(['src/App.tsrx(1,16): error TSRX1001: unclosed']);
	});

	it('prints identical diagnostics once, but not identical messages with different codes', () => {
		const result = report(
			compiler_collecting([
				{ message: 'same message', code: 'tsrx-a', type: 'usage' },
				{ message: 'same message', code: 'tsrx-a', type: 'usage' },
				{ message: 'same message', code: 'tsrx-b', type: 'usage' },
			]),
		);
		expect(result.lines).toEqual([
			'src/App.tsrx: error tsrx-a: same message',
			'src/App.tsrx: error tsrx-b: same message',
		]);
	});
});
