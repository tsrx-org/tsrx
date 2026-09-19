/** @import { LanguageServicePlugin } from '@volar/language-server' */
/** @import { LanguageServicePluginInstance } from '@volar/language-server' */

import { getVirtualCode, getWordFromPosition, createLogging } from './utils.js';
const { log } = createLogging('[TSRX Document Highlight Plugin]');

/**
 * Document Highlight plugin for TSRX.
 * Provides word highlighting (grey background) for custom TSRX keywords that carry
 * `wordHighlight` mapping metadata.
 *
 * Classic backend: wraps `typescript-semantic`'s highlights and only adds keyword
 * highlights when TypeScript returned none.
 *
 * Native backend: TypeScript 7 serves its own highlights. VS Code asks document
 * highlight providers in score order and uses the first non-empty result
 * (`first(..., isNonEmptyArray)` in `wordHighlighter.ts`), so this provider is
 * consulted exactly when TypeScript has nothing for the span, which is the case
 * for keyword spans (the mapper leaves their DocumentHighlights feature bit off).
 * With several `.tsrx` editors visible at once VS Code switches to the
 * multi-document providers that only the TypeScript 7 extension registers, and
 * keyword highlights are not shown; that limitation is documented.
 * @param {{ typescriptBackend?: import('./backend.js').TypeScriptBackend }} [options]
 * @returns {LanguageServicePlugin}
 */
export function createDocumentHighlightPlugin(options = {}) {
	const standalone = options.typescriptBackend === 'native';
	return {
		name: 'tsrx-document-highlight',
		capabilities: {
			documentHighlightProvider: true,
		},
		create(context) {
			/** @type {LanguageServicePluginInstance['provideDocumentHighlights']} */
			let originalProvideDocumentHighlights;
			/** @type {LanguageServicePluginInstance} */
			let originalInstance;

			if (!standalone) {
				// Get TypeScript's document highlights provider
				for (const [plugin, instance] of context.plugins) {
					if (plugin.name === 'typescript-semantic' && instance.provideDocumentHighlights) {
						originalInstance = instance;
						originalProvideDocumentHighlights = instance.provideDocumentHighlights;
						instance.provideDocumentHighlights = undefined;
						break;
					}
				}

				if (!originalProvideDocumentHighlights) {
					log(
						"'typescript-semantic plugin' was not found or has no 'provideDocumentHighlights'. \
						Document highlights will be limited to custom TSRX keywords only.",
					);
				}
			}

			return {
				async provideDocumentHighlights(document, position, token) {
					/** @type {import('@volar/language-server').DocumentHighlight[] | null | undefined} */
					let tsHighlights = null;
					if (originalProvideDocumentHighlights) {
						tsHighlights = await originalProvideDocumentHighlights.call(
							originalInstance,
							document,
							position,
							token,
						);

						if (!tsHighlights || tsHighlights.length > 0) {
							// If TypeScript recognized tokens and provided highlights, return them
							return tsHighlights;
						}
					}

					const { virtualCode } = getVirtualCode(document, context);

					if (virtualCode.languageId !== 'tsrx') {
						log(`Skipping highlight processing in the '${virtualCode.languageId}' context`);
						return tsHighlights;
					}

					// Check if we're on a custom TSRX keyword.
					const offset = document.offsetAt(position);
					const text = document.getText();

					// Find word boundaries
					const { word } = getWordFromPosition(text, offset);

					if (!/^[\w$]+$/.test(word)) {
						// Not a keyword-shaped word (empty, or a CSS/TSRX token with `-` or `#`).
						return tsHighlights;
					}

					// If the word is a TSRX keyword, find all occurrences in the document.

					const regex = new RegExp(`\\b${word.replace(/\$/g, '\\$')}\\b`, 'g');
					let match;

					while ((match = regex.exec(text)) !== null) {
						const start = match.index;
						const end = match.index + word.length;
						const mapping = virtualCode.findMappingByGeneratedRange(start, end);

						if (!mapping) {
							// If no mapping, skip all others as well
							// This shouldn't happen as TS handles only mapped ranges
							return tsHighlights;
						}

						if (!mapping.data.customData?.wordHighlight?.kind) {
							// Skip if we didn't define word highlighting in segments
							continue;
						}

						if (!tsHighlights) {
							tsHighlights = [];
						}

						tsHighlights.push({
							range: {
								start: document.positionAt(start),
								end: document.positionAt(end),
							},

							kind: mapping.data.customData.wordHighlight.kind,
						});
					}

					if (!tsHighlights) {
						// No keyword occurrence: let the next provider (TypeScript) answer.
						return null;
					}

					log(`Found ${tsHighlights.length} occurrences of '${word}'`);
					return [...tsHighlights];
				},
			};
		},
	};
}
