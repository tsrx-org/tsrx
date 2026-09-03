import fs from 'node:fs';
import path from 'node:path';
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
	it('fills in bare default lib names when `lib` is omitted', () => {
		const { options } = resolveConfig({ options: { target: ts.ScriptTarget.ESNext } });

		expect(options.lib).toEqual(['lib.esnext.full.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts']);
	});

	it('derives the default lib from the configured target', () => {
		const { options } = resolveConfig({ options: { target: ts.ScriptTarget.ES2020 } });

		expect(options.lib?.[0]).toBe('lib.es2020.full.d.ts');
	});

	it('never emits absolute paths or re-cased names as lib entries', () => {
		const { options } = resolveConfig({ options: {} });
		const lib_directory = path.dirname(ts.getDefaultLibFilePath(options));

		for (const lib of options.lib ?? []) {
			expect(path.isAbsolute(lib)).toBe(false);
			expect(fs.existsSync(path.join(lib_directory, lib))).toBe(true);
		}
	});

	it('keeps explicitly configured libs untouched', () => {
		const { options } = resolveConfig({ options: { lib: ['lib.es2022.d.ts', 'DOM'] } });

		expect(options.lib).toEqual(['lib.es2022.d.ts', 'lib.dom.d.ts']);
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
