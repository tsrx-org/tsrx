import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createServicePlugins } from '../src/servicePlugins.js';

describe('Volar service plugins', () => {
	it('offer no formatter on any backend, so the server has exactly one', () => {
		// The server formats .tsrx sources itself (`formattingHandler.js`). A plugin
		// that offers formatting would make Volar register its own handler, which
		// replaces that one and formats only the generated code, which does nothing.
		for (const backend of /** @type {const} */ (['native', 'plugin', 'classic'])) {
			const formatters = createServicePlugins(backend, ts)
				.filter(
					(plugin) =>
						plugin.capabilities.documentFormattingProvider ||
						plugin.capabilities.documentRangeFormattingProvider,
				)
				.map((plugin) => plugin.name);
			expect(formatters, backend).toEqual([]);
		}
	});

	it('offer no on-type formatting on any backend, so the server closes tags on `>`', () => {
		// The server answers `textDocument/onTypeFormatting` itself (`closingTagsHandler.js`).
		// A plugin that offers on-type formatting would make Volar register its own
		// handler, which replaces that one.
		for (const backend of /** @type {const} */ (['native', 'plugin', 'classic'])) {
			const on_type_formatters = createServicePlugins(backend, ts)
				.filter((plugin) => plugin.capabilities.documentOnTypeFormattingProvider)
				.map((plugin) => plugin.name);
			expect(on_type_formatters, backend).toEqual([]);
		}
	});
});
