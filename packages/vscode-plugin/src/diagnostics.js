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
 * The server always reports them and the extension drops its copy once the
 * mapper has been seen reporting in this session: from then on TypeScript 7
 * serves the workspace (VS Code restarts the extension host when TypeScript 7
 * is switched on or off, which resets this). Nothing else has to know which
 * TypeScript VS Code runs, and no setting is read.
 */

/** `DIAGNOSTIC_SOURCE` of `@tsrx/content-mapper/src/protocol.js`. */
export const MAPPER_DIAGNOSTIC_SOURCE = 'tsrx';
/** `source` of `@tsrx/language-server`'s compile-error diagnostics. */
export const SERVER_COMPILE_ERROR_SOURCE = 'TSRX';

/**
 * @param {readonly { source?: string }[]} diagnostics
 * @returns {boolean}
 */
export function has_mapper_diagnostics(diagnostics) {
	return diagnostics.some((diagnostic) => diagnostic.source === MAPPER_DIAGNOSTIC_SOURCE);
}

/**
 * @param {readonly { source?: string }[]} diagnostics
 * @returns {boolean}
 */
export function has_server_compile_errors(diagnostics) {
	return diagnostics.some((diagnostic) => diagnostic.source === SERVER_COMPILE_ERROR_SOURCE);
}

/**
 * Session-wide memory of whether TypeScript 7's content mapper reports for this
 * workspace, learned from the diagnostics VS Code holds.
 */
export class CompileErrorDedupe {
	/** True once the mapper has reported for any `.tsrx` file in this session. */
	mapper_seen = false;

	/**
	 * Learn from the diagnostics VS Code holds for a file.
	 * @param {readonly { source?: string }[]} all_diagnostics
	 * @returns {boolean} Whether this call is the first sighting of the mapper.
	 */
	observe(all_diagnostics) {
		if (this.mapper_seen || !has_mapper_diagnostics(all_diagnostics)) {
			return false;
		}
		this.mapper_seen = true;
		return true;
	}

	/**
	 * The server's diagnostics for a file, minus its compile errors while the
	 * mapper serves the workspace (or already reports for this very file).
	 * @template {{ source?: string }} T
	 * @param {readonly T[]} server_diagnostics
	 * @param {readonly { source?: string }[]} all_diagnostics Every diagnostic VS Code holds for the file.
	 * @returns {T[]}
	 */
	filter(server_diagnostics, all_diagnostics) {
		this.observe(all_diagnostics);
		if (!this.mapper_seen) {
			return [...server_diagnostics];
		}
		return server_diagnostics.filter(
			(diagnostic) => diagnostic.source !== SERVER_COMPILE_ERROR_SOURCE,
		);
	}
}
