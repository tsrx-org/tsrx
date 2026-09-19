/**
 * TSRX compile errors reach VS Code from two possible sources, and a file must
 * show them once:
 *
 * - `@tsrx/content-mapper`, when TypeScript 7 serves the workspace: TypeScript
 *   reports them with the mapper's diagnostic source (`protocol.js` in that
 *   package).
 * - The TSRX language server's compile-error plugin, which VS Code's tsserver
 *   cannot replace when TypeScript 5.9 or 6 serves the workspace through
 *   `@tsrx/typescript-plugin`.
 *
 * The server always reports them, and the extension drops its copy for a file
 * that already carries the mapper's. Nothing else has to know which TypeScript
 * VS Code runs.
 */

/** `DIAGNOSTIC_SOURCE` of `@tsrx/content-mapper/src/protocol.js`. */
export const MAPPER_DIAGNOSTIC_SOURCE = 'tsrx';
/** `source` of `@tsrx/language-server`'s compile-error diagnostics. */
export const SERVER_COMPILE_ERROR_SOURCE = 'TSRX';

/**
 * @param {readonly { source?: string }[]} diagnostics Every diagnostic VS Code holds for a file.
 * @returns {boolean}
 */
export function has_mapper_diagnostics(diagnostics) {
	return diagnostics.some((diagnostic) => diagnostic.source === MAPPER_DIAGNOSTIC_SOURCE);
}

/**
 * The server's diagnostics for a file, minus its compile errors when the
 * mapper already reports them for that file.
 * @template {{ source?: string }} T
 * @param {readonly T[]} server_diagnostics
 * @param {readonly { source?: string }[]} all_diagnostics Every diagnostic VS Code holds for the file.
 * @returns {T[]}
 */
export function without_duplicate_compile_errors(server_diagnostics, all_diagnostics) {
	if (!has_mapper_diagnostics(all_diagnostics)) {
		return [...server_diagnostics];
	}
	return server_diagnostics.filter(
		(diagnostic) => diagnostic.source !== SERVER_COMPILE_ERROR_SOURCE,
	);
}
