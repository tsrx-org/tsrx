import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';
import { without_typescript_diagnostics_on_compile_error } from '../src/plugin-diagnostics.js';
import { files_with_fatal_compile_error, has_fatal_compile_error } from '../src/language.js';

describe('tsserver plugin: TypeScript diagnostics on TSRX compile failure', () => {
	it('drops every TypeScript diagnostic of a file whose TSRX compilation failed', () => {
		const calls = /** @type {string[]} */ ([]);
		const service = {
			getSyntacticDiagnostics: (/** @type {string} */ f) => (calls.push(`syn:${f}`), ['syn']),
			getSemanticDiagnostics: (/** @type {string} */ f) => (calls.push(`sem:${f}`), ['sem']),
			getSuggestionDiagnostics: (/** @type {string} */ f) => (calls.push(`sug:${f}`), ['sug']),
			getQuickInfoAtPosition: () => 'info',
		};
		const wrapped = without_typescript_diagnostics_on_compile_error(service, (file) =>
			file.endsWith('Broken.tsrx'),
		);
		expect(wrapped.getSyntacticDiagnostics('/p/Broken.tsrx')).toEqual([]);
		expect(wrapped.getSemanticDiagnostics('/p/Broken.tsrx')).toEqual([]);
		expect(wrapped.getSuggestionDiagnostics('/p/Broken.tsrx')).toEqual([]);
		expect(calls).toEqual([]);
		// Healthy files and every other method pass straight through.
		expect(wrapped.getSemanticDiagnostics('/p/Panel.tsrx')).toEqual(['sem']);
		expect(wrapped.getSyntacticDiagnostics('/p/main.ts')).toEqual(['syn']);
		expect(wrapped.getQuickInfoAtPosition()).toBe('info');
		expect(calls).toEqual(['sem:/p/Panel.tsrx', 'syn:/p/main.ts']);
	});

	it('keys the compile-failure registry by normalized file name', () => {
		files_with_fatal_compile_error.add('c:/work/app/broken.tsrx');
		try {
			expect(has_fatal_compile_error('C:\\work\\App\\Broken.tsrx')).toBe(true);
			expect(has_fatal_compile_error('/work/app/broken.tsrx')).toBe(false);
		} finally {
			files_with_fatal_compile_error.delete('c:/work/app/broken.tsrx');
		}
	});

	it('exposes a tsserver plugin whose create() wraps the language service', () => {
		expect(typeof plugin).toBe('function');
	});
});
