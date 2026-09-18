/**
 @import {
	LanguageServicePlugin,
	LanguageServicePluginInstance,
	LanguageServiceContext,
	Diagnostic,
} from '@volar/language-server';
@import {TextDocument} from 'vscode-languageserver-textdocument';
 */

import { getVirtualCode, createLogging, deobfuscateIdentifiers } from './utils.js';

const { log, logError } = createLogging('[TSRX TypeScript Diagnostic Plugin]');

/**
 * @param {Diagnostic} diagnostic
 * @param {Diagnostic[]} items
 */
function process(diagnostic, items) {
	diagnostic.message = deobfuscateIdentifiers(diagnostic.message);
	items.push(diagnostic);
}

/**
 * Post-process TypeScript diagnostics for a TSRX document: drop every TS
 * diagnostic while the file has a fatal compile error (the raw source is fed
 * to TS in that state, so its diagnostics would be noise) and deobfuscate
 * generated identifiers in the remaining messages.
 * @param {TextDocument} document
 * @param {LanguageServiceContext} context
 * @param {Diagnostic[]} diagnostics
 * @returns {Diagnostic[]}
 */
function processDiagnostics(document, context, diagnostics) {
	if (!diagnostics || diagnostics.length === 0) {
		return diagnostics;
	}

	log(`Filtering ${diagnostics.length} TypeScript diagnostics for ${document.uri}`);

	const { virtualCode } = getVirtualCode(document, context);

	if (!virtualCode || virtualCode.languageId !== 'tsrx') {
		return diagnostics;
	}

	/** @type {Diagnostic[]} */
	const result = [];

	for (const diagnostic of diagnostics) {
		if (virtualCode.fatalErrors.length > 0 && diagnostic.code !== 'tsrx-compile-error') {
			// skip all TS diagnostics since we're dealing directly with the source code
			continue;
		}

		process(diagnostic, result);
	}

	log(`Filtered from ${diagnostics.length} to ${result.length} diagnostics`);
	return result;
}

/**
 * Creates a plugin that wraps typescript-semantic's provideDiagnostics
 * to post-process its diagnostics while maintaining the original
 * plugin association. This is crucial for code actions (like "Add import")
 * to work correctly, as volar matches diagnostics by pluginIndex.
 * @returns {LanguageServicePlugin}
 */
export function createTypeScriptDiagnosticFilterPlugin() {
	log('Creating TypeScript diagnostic filter plugin...');

	return {
		name: 'tsrx-typescript-diagnostic-filter',
		// No capabilities - this plugin only wraps typescript-semantic
		capabilities: {},
		create(context) {
			/** @type {LanguageServicePluginInstance['provideDiagnostics'] | undefined} */
			let originalProvider;
			/** @type {LanguageServicePluginInstance | undefined} */
			let originalInstance;

			for (const [plugin, instance] of context.plugins) {
				if (plugin.name === 'typescript-semantic') {
					originalInstance = instance;
					originalProvider = instance.provideDiagnostics;

					// Wrap the original function to filter diagnostics
					// This maintains the plugin association for code actions
					instance.provideDiagnostics = async function (document, token) {
						const diagnostics = await originalProvider?.call(originalInstance, document, token);
						return processDiagnostics(document, context, diagnostics ?? []);
					};

					log('Successfully wrapped typescript-semantic provideDiagnostics');

					break;
				}
			}

			if (!originalProvider) {
				logError(
					"'typescript-semantic plugin' was not found or has no 'provideDiagnostics'. \
					This plugin must be loaded after Volar's typescript-semantic plugin.",
				);
			}

			// This plugin doesn't provide any functionality itself,
			// it only wraps typescript-semantic
			return {};
		},
	};
}
