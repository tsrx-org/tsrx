import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TSRXVirtualCode, _reset_for_test } from '../src/language.js';

/**
 * `tsrx-tsc` sets `TSRX_TSC` before loading this module; the virtual code then
 * mirrors collected compiler diagnostics to stderr through `logTSRXErrors`.
 * These tests pin the line shape — `[tsrx-tsc] <file>(<line>,<col>):
 * <severity> [<code>]: <message>` in tsc's `file(line,col): error TS2339:`
 * convention — because the diagnostic code is what agents and tooling grep
 * for, and warning-severity entries must not masquerade as errors.
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

/**
 * @param {string} file_name
 * @param {import('../src/language.js').TSRXCompilerModule} compiler
 */
function compile(file_name, compiler) {
	return new TSRXVirtualCode(
		file_name,
		ts.ScriptSnapshot.fromString('export default <div>Hello</div>;'),
		compiler,
	);
}

describe('tsrx-tsc diagnostic logging', () => {
	beforeEach(() => {
		_reset_for_test();
		vi.stubEnv('TSRX_TSC', 'true');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('prints a collected diagnostic with its code in tsc convention', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		compile(
			'App.tsrx',
			compiler_collecting([
				{
					message: "'missing' is not a style block",
					code: 'tsrx-style-apply-target',
					type: 'usage',
				},
			]),
		);
		expect(spy).toHaveBeenCalledWith(
			"[tsrx-tsc] App.tsrx: error tsrx-style-apply-target: 'missing' is not a style block",
		);
	});

	it('labels a warning-severity diagnostic as a warning, not an error', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		compile(
			'App.tsrx',
			compiler_collecting([
				{
					message: "'.a' is never referenced",
					code: 'octane-style-unused-selector',
					severity: 'warning',
					type: 'usage',
				},
			]),
		);
		expect(spy).toHaveBeenCalledWith(
			"[tsrx-tsc] App.tsrx: warning octane-style-unused-selector: '.a' is never referenced",
		);
	});

	it('prints a thrown fatal diagnostic with its code and position', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const thrown = Object.assign(new Error('expected a closing tag'), {
			code: 'tsrx-unclosed-tag',
			// `loc` columns are 0-based; the printed position is 1-based like tsc.
			loc: { start: { line: 3, column: 1 }, end: { line: 3, column: 5 } },
		});
		compile('App.tsrx', compiler_throwing(thrown));
		expect(spy).toHaveBeenCalledWith(
			'[tsrx-tsc] App.tsrx(3,2): error tsrx-unclosed-tag: expected a closing tag',
		);
	});

	it('keeps the bare severity label when a diagnostic has no code', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		compile('App.tsrx', compiler_throwing(new Error('parse blew up')));
		expect(spy).toHaveBeenCalledWith('[tsrx-tsc] App.tsrx: error: parse blew up');
	});

	it('dedupes identical diagnostics but not identical messages with different codes', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const compiler = compiler_collecting([
			{ message: 'same message', code: 'tsrx-a', type: 'usage' },
			{ message: 'same message', code: 'tsrx-b', type: 'usage' },
		]);
		compile('App.tsrx', compiler);
		// A second compile of the same file repeats the diagnostics; both must
		// still be deduped against the first pass.
		compile('App.tsrx', compiler);
		expect(spy).toHaveBeenCalledTimes(2);
		expect(spy).toHaveBeenCalledWith('[tsrx-tsc] App.tsrx: error tsrx-a: same message');
		expect(spy).toHaveBeenCalledWith('[tsrx-tsc] App.tsrx: error tsrx-b: same message');
	});
});
