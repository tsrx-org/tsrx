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
 * Strip whole-document formatting capabilities from a Volar service plugin.
 *
 * The bundled TypeScript (`typescript-syntactic`) and CSS services advertise a
 * `documentFormattingProvider`. Because they run against the virtual TS/CSS code
 * rather than the `.tsrx` source, their edits don't map back and formatting is a
 * no-op — yet the capability still makes the language client contribute a
 * "TSRX Syntax for VS Code" entry to "Format Document With…" that silently does nothing.
 * Formatting for `.tsrx` is owned by Prettier + @tsrx/prettier-plugin (configured
 * as the default `[tsrx]` formatter in the VS Code extension), so we drop these
 * capabilities to keep Prettier as the single, working formatter. On-type
 * formatting is left intact.
 *
 * @template {{ capabilities?: Record<string, unknown> }} T
 * @param {T} plugin
 * @returns {T}
 */
export function stripDocumentFormatting(plugin) {
	const {
		documentFormattingProvider: _fmt,
		documentRangeFormattingProvider: _rangeFmt,
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
 * @param {TypeScriptBackend} backend
 * @param {typeof import('typescript')} ts
 * @returns {LanguageServicePlugin[]}
 */
export function createServicePlugins(backend, ts) {
	const shared_first = [createAutoInsertPlugin(), createCompletionPlugin()];
	const shared_last = [
		createDefinitionPlugin(),
		createDocumentSymbolPlugin(),
		stripDocumentFormatting(createCssService()),
	];
	if (backend === 'native') {
		return [
			...shared_first,
			...shared_last,
			createHoverPlugin({ typescriptBackend: backend }),
			createDocumentHighlightPlugin({ typescriptBackend: backend }),
		];
	}
	return [
		...shared_first,
		createCompileErrorDiagnosticPlugin(),
		...shared_last,
		...createTypeScriptServices(ts).map(stripDocumentFormatting),
		// !IMPORTANT 'createTypeScriptDiagnosticFilterPlugin', 'createHoverPlugin',
		// and 'createDocumentHighlightPlugin' must come after TypeScript services
		// to intercept volar's and vscode default providers
		createTypeScriptDiagnosticFilterPlugin(),
		createHoverPlugin({ typescriptBackend: backend }),
		createDocumentHighlightPlugin({ typescriptBackend: backend }),
	];
}
