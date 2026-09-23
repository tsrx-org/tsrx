import { has_fatal_compile_error } from './language.js';

const DIAGNOSTIC_METHODS = /** @type {const} */ ([
	'getSyntacticDiagnostics',
	'getSemanticDiagnostics',
	'getSuggestionDiagnostics',
]);

/**
 * While a `.tsrx` file has a fatal TSRX compile error its generated code is the
 * raw source, so TypeScript's diagnostics on it are noise: drop them, exactly
 * as the classic language server's diagnostic filter does. The compile error
 * itself is reported by the TSRX language server (or by `@tsrx/content-mapper`
 * on TypeScript 7).
 * @template {object} T
 * @param {T} languageService
 * @param {(fileName: string) => boolean} [is_broken]
 * @returns {T}
 */
export function without_typescript_diagnostics_on_compile_error(
	languageService,
	is_broken = has_fatal_compile_error,
) {
	/** @type {Record<string, (fileName: string, ...rest: unknown[]) => unknown[]>} */
	const overrides = {};
	for (const method of DIAGNOSTIC_METHODS) {
		overrides[method] = (fileName, ...rest) =>
			is_broken(fileName)
				? []
				: /** @type {(...args: unknown[]) => unknown[]} */ (
						/** @type {Record<string, unknown>} */ (languageService)[method]
					).call(languageService, fileName, ...rest);
	}
	return new Proxy(languageService, {
		get(target, property, receiver) {
			if (typeof property === 'string' && property in overrides) {
				return overrides[property];
			}
			return Reflect.get(target, property, receiver);
		},
	});
}
