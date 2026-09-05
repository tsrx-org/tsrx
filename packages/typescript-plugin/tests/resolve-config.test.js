import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/language.js';

/**
 * Type-check `source` under `options` and return the global type names that
 * failed to resolve. An empty array means the standard library is intact.
 * @param {ts.CompilerOptions} options
 * @param {string} source
 */
function unresolved_global_types(options, source) {
	const file_name = '/virtual/probe.ts';
	const host = ts.createCompilerHost(options, true);
	const original_get_source_file = host.getSourceFile.bind(host);
	host.getSourceFile = (name, language_version, on_error, should_create) =>
		name === file_name
			? ts.createSourceFile(name, source, language_version, true)
			: original_get_source_file(name, language_version, on_error, should_create);
	host.fileExists = (name) => name === file_name || ts.sys.fileExists(name);
	host.readFile = (name) => (name === file_name ? source : ts.sys.readFile(name));

	const program = ts.createProgram({ rootNames: [file_name], options, host });
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.code === 2304 || diagnostic.code === 2318)
		.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
}

describe('resolveConfig', () => {
	it('defaults the target while leaving lib selection to TypeScript', () => {
		const { options } = resolveConfig({ options: { types: [] } });

		expect(options.target).toBe(ts.ScriptTarget.ESNext);
		expect(options.lib).toBeUndefined();
		expect(ts.getDefaultLibFileName(options)).toBe('lib.esnext.full.d.ts');
	});

	it('preserves explicitly configured libs', () => {
		const libs = ['lib.es2022.d.ts', 'lib.dom.d.ts'];
		const { options } = resolveConfig({ options: { lib: libs, types: [] } });

		expect(options.lib).toEqual(libs);
	});

	it('preserves an explicitly empty lib list', () => {
		const { options } = resolveConfig({ options: { lib: [], types: [] } });

		expect(options.lib).toEqual([]);
	});

	it('does not synthesize lib when noLib is enabled', () => {
		const { options } = resolveConfig({ options: { noLib: true, types: [] } });

		expect(options.noLib).toBe(true);
		expect(options.lib).toBeUndefined();
	});

	it('allows TypeScript to load its valid ES5 default', () => {
		const { options } = resolveConfig({
			options: { target: ts.ScriptTarget.ES5, noEmit: true, types: [] },
		});

		expect(options.lib).toBeUndefined();
		expect(
			unresolved_global_types(
				options,
				[
					'declare const a: Array<number>;',
					'declare const f: Function;',
					'declare const el: HTMLButtonElement;',
					'export {};',
				].join('\n'),
			),
		).toEqual([]);
	});

	it('leaves the ES standard library available to the checker', () => {
		const { options } = resolveConfig({
			options: { target: ts.ScriptTarget.ESNext, strict: true, noEmit: true, types: [] },
		});

		const unresolved = unresolved_global_types(
			options,
			[
				'declare const a: Array<number>;',
				'declare const p: Promise<void>;',
				'declare const f: Function;',
				'declare const e: Exclude<1 | 2, 2>;',
				'declare const k: Pick<{ a: 1 }, "a">;',
				'declare const el: HTMLButtonElement;',
				'export {};',
			].join('\n'),
		);

		expect(unresolved).toEqual([]);
	});
});
