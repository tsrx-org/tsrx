import { isCompletionEnabled } from '@volar/language-core';
import { toGeneratedOffset } from '@volar/typescript/lib/node/transform.js';
import { getServiceScript } from '@volar/typescript/lib/node/utils.js';
import { findElement, isUnclosed } from './unclosed-element.js';

/**
 * VS Code's TypeScript closes a JSX tag by asking tsserver for
 * `getJsxClosingTagAtPosition` right after `>` is typed. Volar's
 * language-service proxy maps most position-based methods into the generated
 * code but not this one, so for a `.tsrx` file tsserver would read the source
 * position against the generated TSX. Map it the way Volar maps linked editing
 * ranges, through completion-enabled mappings (the typed `>` keeps one). The
 * answer is the closing text only, inserted at the source position, so it needs
 * no mapping back. The type-only output closes a tag that loose recovery found
 * unclosed (#978), so where TypeScript finds no unclosed tag, the parsed source
 * decides, as for the TSRX language server's auto-insert.
 * @template {object} T
 * @param {T} languageService
 * @param {() => import('@volar/language-core').Language<string> | undefined} get_language
 * @returns {T}
 */
export function with_jsx_closing_tags(languageService, get_language) {
	return new Proxy(languageService, {
		get(target, property, receiver) {
			if (property !== 'getJsxClosingTagAtPosition') {
				return Reflect.get(target, property, receiver);
			}
			const original = /** @type {(fileName: string, position: number) => unknown} */ (
				Reflect.get(target, property, receiver)
			);
			return (/** @type {string} */ file_path, /** @type {number} */ position) => {
				const language = get_language();
				if (language) {
					const file_name = file_path.replace(/\\/g, '/');
					const [service_script, target_script, source_script] = getServiceScript(
						language,
						file_name,
					);
					if (service_script && target_script && source_script) {
						if (target_script.associatedOnly) {
							return undefined;
						}
						const generated = toGeneratedOffset(
							language,
							service_script,
							source_script,
							position,
							isCompletionEnabled,
						);
						if (generated === undefined) return undefined;
						return (
							original.call(target, target_script.id, generated) ??
							closing_tag_from_source(source_script, position)
						);
					}
				}
				return original.call(target, file_path, position);
			};
		},
	});
}

/**
 * The closing tag the element whose opening tag ends at `position` still needs,
 * read from the parsed source, or `undefined`.
 * @param {import('@volar/language-core').SourceScript<string>} source_script
 * @param {number} position
 * @returns {{ newText: string } | undefined}
 */
function closing_tag_from_source(source_script, position) {
	const root = /** @type {{ sourceAst?: unknown, isDotCompletionMode?: boolean } | undefined} */ (
		source_script.generated?.root
	);
	if (!root?.sourceAst || root.isDotCompletionMode) return undefined;
	const path = findElement(root.sourceAst, position);
	if (!path) return undefined;
	const source = source_script.snapshot.getText(0, source_script.snapshot.getLength());
	if (!isUnclosed(path, source)) return undefined;
	const name = /** @type {{ start: number, end: number }} */ (
		/** @type {unknown} */ (path.element.openingElement.name)
	);
	return { newText: `</${source.slice(name.start, name.end)}>` };
}
