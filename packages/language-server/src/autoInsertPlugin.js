/** @import { LanguageServicePlugin } from '@volar/language-server' */

import { getVirtualCode, createLogging, is_tsrx_document } from './utils.js';

const { log } = createLogging('[TSRX Auto-Insert Plugin]');

/**
 * List of HTML void/self-closing elements that don't need closing tags
 * https://developer.mozilla.org/en-US/docs/Glossary/Void_element
 */
const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'command',
	'embed',
	'hr',
	'img',
	'input',
	'keygen',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

/**
 * Auto-insert plugin for TSRX.
 * Handles auto-closing tags when typing '>' after a tag name
 * @returns {LanguageServicePlugin}
 */
export function createAutoInsertPlugin() {
	return {
		name: 'tsrx-auto-insert',
		capabilities: {
			autoInsertionProvider: {
				triggerCharacters: ['>'],
				configurationSections: ['tsrx.autoClosingTags.enabled'],
			},
			documentOnTypeFormattingProvider: {
				triggerCharacters: ['>'],
			},
		},
		// leaving context for future use
		create(context) {
			return {
				/**
				 * @param {import('vscode-languageserver-textdocument').TextDocument} document
				 * @param {import('@volar/language-server').Position} position
				 * @param {{ rangeOffset: number; rangeLength: number; text: string }} lastChange
				 * @param {import('@volar/language-server').CancellationToken} _token
				 * @returns {Promise<string | null>}
				 */
				async provideAutoInsertSnippet(document, position, lastChange, _token) {
					if (!is_tsrx_document(document.uri)) {
						return null;
					}

					// Only checking for '>' insertions
					if (!lastChange.text.endsWith('>')) {
						return null;
					}

					const { virtualCode } = getVirtualCode(document, context);

					if (virtualCode.languageId !== 'tsrx') {
						log(`Skipping auto-insert processing in the '${virtualCode.languageId}' context`);
						return null;
					}

					// Map position back to source. The selection sits right after the typed
					// `>`, and Volar maps it through completion-enabled mappings only, which
					// the `>` token mapping is. `lastChange.rangeOffset` is instead mapped
					// through the first mapping covering it, which for a style block can be
					// the verify-only element mapping whose generated text differs from the
					// source (`<style apply={…}>` prints as `<style data-tsrx-apply={…}>`),
					// landing the change offset off the `>` token. Key the lookup on the
					// selection.
					const offset = document.offsetAt(position);
					const mapping = virtualCode.findMappingByGeneratedRange(offset - 1, offset);

					/** @type {number} */
					let sourceOffset;
					/** @type {boolean} */
					let isFallback = false;

					if (mapping) {
						sourceOffset = mapping.sourceOffsets[0];
					} else if (
						virtualCode.fatalErrors.length > 0 &&
						virtualCode.generatedCode === virtualCode.originalCode
					) {
						// Fatal-compile fallback: the raw source is served as the generated code under a
						// single whole-file mapping, so offsets coincide. Loose-mode recovery keeps token
						// mappings for in-progress markup (an unclosed `<style>` included), but a file
						// can still fail to parse mid-edit, and that is often exactly when a closing tag
						// needs inserting, so keep going without token mappings.
						sourceOffset = offset - 1;
						isFallback = true;
					} else {
						return null;
					}

					// search backwards from sourceOffset to find the line tag
					const sourceCode = virtualCode.originalCode;
					if (sourceCode[sourceOffset - 1] === '/') {
						// self-closing tag '/>'
						return null;
					}

					/** @type {string | null} */
					let tagName = null;
					/** @type {string} */
					let line = '';
					let attempts = 0;
					for (let i = sourceOffset - 1; i >= 0 && attempts < 3; i--) {
						if (sourceCode[i] !== '<') {
							continue;
						}
						attempts++;

						line = sourceCode.slice(i, sourceOffset + 1);
						// Check if we just typed '>' after a tag name
						// Match patterns like: <div> or <Component> but not <div /> or <Component/>
						const candidate = matchOpeningTag(line);
						if (!candidate) {
							continue;
						}

						// Confirm that it's definitely the start of a tag and not a `<` inside an
						// expression: the compiler maps a tag's `<` and its name as tokens (for a
						// still-unclosed element recovered in loose mode only the name is mapped). The
						// fallback has no token mappings, so the tag matcher alone decides.
						if (
							isFallback ||
							virtualCode.findMappingBySourceRange(i, i + 1) ||
							virtualCode.findMappingBySourceRange(i + 1, i + 1 + candidate.length)
						) {
							tagName = candidate;
							break;
						}
					}

					log('Auto-insert triggered at:', {
						selection: `${position.line}:${position.character}`,
						line,
						change: lastChange,
						sourceOffset,
						isFallback,
					});

					if (!tagName) {
						log('No tag match found');
						return null;
					}

					log('Tag matched:', tagName);

					// Don't auto-close void elements (self-closing HTML tags)
					if (VOID_ELEMENTS.has(tagName.toLowerCase())) {
						log('Void element, skipping auto-close:', tagName);
						return null;
					}

					// Check if there's already a closing tag ahead. Look at the source, not the
					// generated document: loose-mode recovery synthesizes the missing `</tag>` for an
					// unclosed element, which would make the closing tag look already present.
					const closingTag = `</${tagName}>`;
					if (sourceCode.startsWith(closingTag, sourceOffset + 1)) {
						log('Closing tag already exists, skipping');
						return null;
					}

					// Insert the closing tag
					log('Inserting closing tag:', closingTag);

					// Return a snippet with $0 to place cursor between the tags
					return `$0${closingTag}`;
				},
			};
		},
	};
}

/**
 * Match an opening tag `<name …>` that ends exactly at the end of `text` and return its name.
 *
 * Attribute expressions may themselves contain `>` (`<style apply={x > y ? a : b}>`,
 * `<div hidden={a > b}>`) and quoted values may contain anything, so the attribute region is
 * walked with brace depth and quote tracking instead of a `[^>]*` regex. Returns null when
 * `text` is not a single opening tag: the trailing `>` sits inside `{…}` (the user is typing an
 * expression, not closing the tag), an earlier `>` already closed the tag, or the tag is
 * self-closing (`<style apply={theme} />`).
 *
 * @param {string} text - Source text from the tag's `<` up to and including the typed `>`
 * @returns {string | null}
 */
export function matchOpeningTag(text) {
	const nameMatch = text.match(/^<([@$\w][\w.-]*)/);
	if (!nameMatch) {
		return null;
	}

	let depth = 0;
	/** @type {string | null} */
	let quote = null;

	for (let i = nameMatch[0].length; i < text.length; i++) {
		const char = text[i];

		if (quote) {
			if (char === '\\' && depth > 0) {
				// Escaped character inside a JS string literal
				i++;
			} else if (char === quote) {
				quote = null;
			}
			continue;
		}

		if (char === '"' || char === "'" || (depth > 0 && char === '`')) {
			quote = char;
		} else if (char === '{') {
			depth++;
		} else if (char === '}') {
			depth = Math.max(0, depth - 1);
		} else if (char === '>' && depth === 0) {
			// Only the final `>` closes this tag; `/>` is self-closing and needs no closing tag.
			return i === text.length - 1 && text[i - 1] !== '/' ? nameMatch[1] : null;
		}
	}

	return null;
}
