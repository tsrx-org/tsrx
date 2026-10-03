import { isCodeActionsEnabled } from '@volar/language-core';
import { transformFileTextChanges } from '@volar/typescript/lib/node/transform.js';

/**
 * Organize Imports (and Sort Imports, Remove Unused Imports) returns several
 * edits for one import block: the first one writes the whole sorted block and
 * the others delete the old imports. Volar's proxy maps each edit back to the
 * `.tsrx` source on its own and drops one it cannot map, such as an import with
 * a comment after it. Some of the edits are worse than none: a dropped deletion
 * leaves a duplicate import. Map the edits the way the proxy does, but keep the
 * edits of a file only when all of them map, as TypeScript 7 does with a
 * content mapper's edits.
 * @template {object} T
 * @param {T} languageService the language service Volar's proxy returns
 * @param {() => import('typescript').LanguageService | undefined} get_original the language service the proxy wraps
 * @param {() => import('@volar/language-core').Language<string> | undefined} get_language
 * @returns {T}
 */
export function with_whole_file_import_edits(languageService, get_original, get_language) {
	return new Proxy(languageService, {
		get(target, property, receiver) {
			if (property !== 'organizeImports') {
				return Reflect.get(target, property, receiver);
			}
			const organize_imports =
				/** @type {import('typescript').LanguageService['organizeImports']} */ (
					Reflect.get(target, property, receiver)
				);
			return (
				/** @type {import('typescript').OrganizeImportsArgs} */ args,
				/** @type {import('typescript').FormatCodeSettings} */ format_options,
				/** @type {import('typescript').UserPreferences | undefined} */ preferences,
			) => {
				const original = get_original();
				const language = get_language();
				if (!original || !language) {
					return organize_imports.call(target, args, format_options, preferences);
				}
				return original
					.organizeImports(args, format_options, preferences)
					.flatMap((file_changes) => {
						const mapped = transformFileTextChanges(
							language,
							[file_changes],
							false,
							isCodeActionsEnabled,
						);
						const count = mapped.reduce((sum, changes) => sum + changes.textChanges.length, 0);
						return count === file_changes.textChanges.length ? mapped : [];
					});
			};
		},
	});
}
