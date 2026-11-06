/** @import * as AST from 'estree' */
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
 * Elements whose body is raw text, each with a pattern for its opening tag. The
 * body ends at the next `</style>` or `</script>`, wherever it is later in the
 * file, so that closing tag can belong to a later element (see `isUnclosed`).
 */
const RAW_TEXT_OPENING_TAGS = new Map([
	['style', /<style[\s/>]/],
	['script', /<script[\s/>]/],
]);

/**
 * Auto-insert plugin for TSRX.
 * Handles auto-closing tags when typing '>' after a tag name. The VS Code extension
 * asks for them with Volar's `volar/client/autoInsert` request; other editors get
 * them through `textDocument/onTypeFormatting` (`closingTagsHandler.js`).
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

					// Check if the element already has its closing tag. Look at the source, not the
					// generated document: loose-mode recovery synthesizes the missing `</tag>` for an
					// unclosed element, which would make the closing tag look already present. The
					// parsed source also knows about a closing tag further down (`<div>` retyped
					// above its children); without it, only a closing tag right after the cursor
					// counts.
					const closingTag = `</${tagName}>`;
					const element = virtualCode.isDotCompletionMode
						? null
						: findElement(virtualCode.sourceAst, sourceOffset + 1);
					if (
						element
							? !isUnclosed(element, sourceCode)
							: sourceCode.startsWith(closingTag, sourceOffset + 1)
					) {
						log('Closing tag already exists, skipping');
						return null;
					}

					// Insert the closing tag
					log('Inserting closing tag:', closingTag);

					// Return a snippet with $0 to place cursor between the tags
					return `$0${escapeSnippetText(closingTag)}`;
				},
			};
		},
	};
}

/**
 * An element of the parsed source and, when the element is one of its children,
 * the element that holds it.
 * @typedef {{ element: AST.TSRXJSXElement; parent: ElementPath | null }} ElementPath
 */

/**
 * Find the element whose opening tag ends at `end` in the parsed source.
 * @param {unknown} node
 * @param {number} end - The offset right after the opening tag's `>`
 * @param {ElementPath | null} [parent] - The element whose `children` hold `node`
 * @returns {ElementPath | null}
 */
function findElement(node, end, parent = null) {
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findElement(child, end, parent);
			if (found) return found;
		}
		return null;
	}
	if (!node || typeof node !== 'object') {
		return null;
	}

	const element = /** @type {AST.TSRXJSXElement} */ (node);
	const path = element.openingElement ? { element, parent } : null;
	if (path?.element.openingElement.end === end) {
		return path;
	}

	for (const [key, value] of Object.entries(node)) {
		// `metadata` holds analysis results, such as scopes, not source nodes.
		if (key === 'loc' || key === 'metadata') continue;
		const found = findElement(value, end, key === 'children' ? path : null);
		if (found) return found;
	}
	return null;
}

/**
 * Whether the element still needs its closing tag, decided like TypeScript's
 * `isUnclosedTag`: the element is unclosed, or it took the closing tag of a parent
 * with the same name (`<div>` typed as the first child of a `<div>`), which is then
 * the unclosed one. Loose-mode recovery marks an element without its closing tag
 * `unclosed`.
 *
 * A `<style>` or `<script>` body ends at the next closing tag with its name, which
 * can belong to a later element: a new `<style>` typed in one component takes the
 * `</style>` of the style block in the next component. That element's opening tag
 * is then in the body, so the new element still needs its own closing tag.
 * @param {ElementPath} path
 * @param {string} sourceCode
 * @returns {boolean}
 */
function isUnclosed(path, sourceCode) {
	/** @param {AST.TSRXJSXElement} element */
	const name = (element) => {
		const { start, end } = /** @type {AST.NodeWithLocation} */ (element.openingElement.name);
		return sourceCode.slice(start, end);
	};

	const { element } = path;
	const rawTextOpeningTag = RAW_TEXT_OPENING_TAGS.get(name(element));
	if (rawTextOpeningTag) {
		if (element.unclosed || !element.closingElement) return true;
		const bodyEnd = /** @type {AST.NodeWithLocation} */ (element.closingElement).start;
		return rawTextOpeningTag.test(sourceCode.slice(element.openingElement.end, bodyEnd));
	}

	for (let current = path; ; current = current.parent) {
		if (current.element.unclosed) return true;
		if (!current.parent || name(current.parent.element) !== name(current.element)) return false;
	}
}

/**
 * Escape `text` so that a snippet inserts it as written. `\`, `$` and `}` are snippet
 * syntax: unescaped, the `$Foo` in `</$Foo>` is a variable, which VS Code replaces
 * with nothing.
 * @param {string} text
 * @returns {string}
 */
export function escapeSnippetText(text) {
	return text.replace(/[\\$}]/g, '\\$&');
}

/**
 * The text that a snippet made by `escapeSnippetText` inserts: `</\$Foo>` inserts `</$Foo>`.
 * @param {string} snippet
 * @returns {string}
 */
export function unescapeSnippetText(snippet) {
	return snippet.replace(/\\([\\$}])/g, '$1');
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
 * A name is made of JavaScript identifier characters, `.` and `-`, so `$` and non-ASCII
 * letters can appear anywhere in it (`<ui.$Item>`, `<Café>`).
 *
 * @param {string} text - Source text from the tag's `<` up to and including the typed `>`
 * @returns {string | null}
 */
export function matchOpeningTag(text) {
	const nameMatch = text.match(/^<([@$_\p{ID_Start}][$\p{ID_Continue}\u200C\u200D.-]*)/u);
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
