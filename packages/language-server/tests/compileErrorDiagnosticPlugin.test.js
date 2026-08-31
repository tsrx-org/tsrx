import { describe, expect, it, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { createCompileErrorDiagnosticPlugin } from '../src/compileErrorDiagnosticPlugin.js';

describe('compile error diagnostic plugin', () => {
	it('preserves exact, overlapping, and unmapped usage-error ranges', () => {
		const document = TextDocument.create('file:///App.tsrx', 'tsrx', 1, 'x'.repeat(100));
		const source_uri = URI.parse(document.uri);
		const find_exact = vi.fn((start, end) =>
			start === 10 && end === 12 ? { generatedOffsets: [50], generatedLengths: [3] } : null,
		);
		const find_overlapping = vi.fn((start, end) => (start === 20 && end === 24 ? [70, 76] : null));
		const virtual_code = {
			languageId: 'tsrx',
			fatalErrors: [],
			usageErrors: [
				{ type: 'usage', message: 'exact', pos: 10, end: 12 },
				{ type: 'usage', message: 'overlap', pos: 20, end: 24 },
				{ type: 'usage', message: 'unmapped', pos: 30, end: 34 },
			],
			findMappingBySourceRange: find_exact,
			findGeneratedRangeBySourceRange: find_overlapping,
		};
		const source_script = {
			generated: { embeddedCodes: { get: () => virtual_code } },
		};
		const context = /** @type {any} */ ({
			decodeEmbeddedDocumentUri: () => [source_uri, 'root'],
			language: {
				scripts: { get: () => source_script },
				maps: { get: () => undefined },
			},
		});
		const provider = createCompileErrorDiagnosticPlugin().create(context);

		const diagnostics = provider.provideDiagnostics(document, /** @type {any} */ (undefined));

		expect(diagnostics.map((diagnostic) => diagnostic.range)).toEqual([
			{ start: { line: 0, character: 50 }, end: { line: 0, character: 53 } },
			{ start: { line: 0, character: 70 }, end: { line: 0, character: 76 } },
			{ start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
		]);
		expect(find_exact).toHaveBeenCalledTimes(3);
		expect(find_overlapping).toHaveBeenCalledTimes(2);
	});
});
