/** @import { LanguageServicePlugin } from '@volar/language-server' */
/** @import { TypeScriptBackend } from './backend.js' */

import { create as createCssService } from 'volar-service-css';
import { createAutoInsertPlugin } from './autoInsertPlugin.js';
import { createCompileErrorDiagnosticPlugin } from './compileErrorDiagnosticPlugin.js';
import { createCompletionPlugin } from './completionPlugin.js';
import { createDefinitionPlugin } from './definitionPlugin.js';
import { createDocumentHighlightPlugin } from './documentHighlightPlugin.js';
import { createDocumentSymbolPlugin } from './documentSymbolPlugin.js';
import { createHoverPlugin } from './hoverPlugin.js';
import { createTypeScriptDiagnosticFilterPlugin } from './typescriptDiagnosticPlugin.js';
import { createTypeScriptServices } from './typescriptService.js';

/**
 * Strip the formatting capabilities from a Volar service plugin, on-type
 * formatting included.
 *
 * The bundled TypeScript (`typescript-syntactic`) and CSS services advertise a
 * `documentFormattingProvider`. Because they run against the virtual TS/CSS code
 * rather than the `.tsrx` source, their edits don't map back and formatting is a
 * no-op. The server formats `.tsrx` sources itself, with the project's Prettier
 * (`formattingHandler.js`): a plugin that offered formatting would make Volar
 * register its own `textDocument/formatting` handler, which would replace that one,
 * and the language client would list a second formatter that does nothing
 * (removed first by Ripple-TS/ripple#1318). TypeScript 7 registers a formatter for
 * `.tsrx` files that returns no edits (`native-lsp.test.js` pins it), so the VS Code
 * extension makes TSRX the `[tsrx]` default formatter.
 *
 * On-type formatting is the same: TypeScript's `;`, `}` and newline triggers
 * return nothing for `.tsrx` files (their mappings turn formatting off), and the
 * server answers `>` itself with the closing tag (`closingTagsHandler.js`).
 *
 * @template {{ capabilities?: Record<string, unknown> }} T
 * @param {T} plugin
 * @returns {T}
 */
export function stripFormatting(plugin) {
	const {
		documentFormattingProvider: _fmt,
		documentRangeFormattingProvider: _rangeFmt,
		documentOnTypeFormattingProvider: _onTypeFmt,
		...capabilities
	} = plugin.capabilities ?? {};
	return { ...plugin, capabilities };
}

/**
 * The Volar service plugins for a backend, in registration order.
 *
 * Classic: the TypeScript services run in this process and the TSRX
 * diagnostic filter, hover and document-highlight plugins are registered after
 * them so they can intercept `typescript-semantic`.
 *
 * Native: TypeScript 7 serves every TypeScript feature for `.tsrx` files
 * itself (through `@tsrx/content-mapper`), including the TSRX compile errors
 * the mapper reports as `tsrx` diagnostics, so neither the TypeScript
 * services nor the plugins that wrap or duplicate them are loaded, and
 * `volar-service-typescript` is never required (see `typescriptService.js`).
 *
 * Plugin: the editor's tsserver serves every TypeScript feature through
 * `@tsrx/typescript-plugin`; the same slim set as native, plus the TSRX
 * compile-error diagnostics, because a tsserver plugin has no way to report
 * them.
 * @param {TypeScriptBackend} backend
 * @param {typeof import('typescript')} [ts] The classic backend's TypeScript; the native backend has none.
 * @returns {LanguageServicePlugin[]}
 */
export function createServicePlugins(backend, ts) {
	const shared_first = [createAutoInsertPlugin(), createCompletionPlugin()];
	const shared_last = [
		createDefinitionPlugin(),
		createDocumentSymbolPlugin(),
		stripFormatting(createCssService()),
	];
	if (backend === 'native' || backend === 'plugin') {
		return [
			...shared_first,
			...(backend === 'plugin' ? [createCompileErrorDiagnosticPlugin()] : []),
			...shared_last,
			createHoverPlugin({ typescriptBackend: backend }),
			createDocumentHighlightPlugin({ typescriptBackend: backend }),
		];
	}
	if (!ts) {
		throw new Error('The classic TypeScript backend needs a TypeScript module.');
	}
	return [
		...shared_first,
		createCompileErrorDiagnosticPlugin(),
		...shared_last,
		...createTypeScriptServices(ts).map(stripFormatting),
		// !IMPORTANT 'createTypeScriptDiagnosticFilterPlugin', 'createHoverPlugin',
		// and 'createDocumentHighlightPlugin' must come after TypeScript services
		// to intercept volar's and vscode default providers
		createTypeScriptDiagnosticFilterPlugin(),
		createHoverPlugin({ typescriptBackend: backend }),
		createDocumentHighlightPlugin({ typescriptBackend: backend }),
	];
}
