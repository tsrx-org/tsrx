/**
 * TSRX compile errors reach VS Code from two possible sources, and a file must
 * show them once:
 *
 * - `@tsrx/content-mapper`, when TypeScript 7 serves the workspace: TypeScript
 *   reports them with the mapper's diagnostic source and a number as their
 *   code.
 * - The TSRX language server's compile-error plugin, which VS Code's tsserver
 *   cannot replace when TypeScript 5.9 or 6 serves the workspace through
 *   `@tsrx/typescript-plugin`. Its codes are strings.
 *
 * Both have the source `TSRX`, so the type of the code tells them apart.
 *
 * The server always reports them and the extension drops its copy once the
 * mapper has been seen reporting in this session: from then on TypeScript 7
 * serves the workspace (VS Code restarts the extension host when TypeScript 7
 * is switched on or off, which resets this). Nothing else has to know which
 * TypeScript VS Code runs, and no setting is read. The mapper sends errors only
 * (TypeScript 7 would show a warning as an error), so the server's warnings,
 * such as TSRX2035, stay.
 *
 * A mistake can also reach VS Code twice on TypeScript 5.9 or 6: the parser
 * collects some mistakes that TypeScript's parser accepts (a rest element's
 * default, a redeclared `let`), and where the generated code keeps the code the
 * mistake is in, tsserver reports it too. The extension drops the server's copy
 * of such an error, one with a TypeScript code, while tsserver shows the same
 * code at the same place, as the language server itself does when it hosts
 * TypeScript (`compileErrorDiagnosticPlugin.js`). TypeScript's copy has its
 * quick fixes.
 */

import { DIAGNOSTIC_SOURCE } from '@tsrx/core/diagnostics';

/**
 * The parts of a VS Code diagnostic this module reads.
 * @typedef {object} DiagnosticLike
 * @property {string} [source]
 * @property {string | number | { value: string | number }} [code]
 * @property {string} [message]
 * @property {{ start: { line: number, character: number } }} [range]
 * @property {number} [severity] VS Code's `DiagnosticSeverity`, where `0` is an error
 */

/** `vscode.DiagnosticSeverity.Error`: VS Code numbers severities from 0, LSP from 1. */
const ERROR_SEVERITY = 0;

/** `source` of the diagnostics VS Code's own TypeScript reports. */
export const TYPESCRIPT_DIAGNOSTIC_SOURCE = 'ts';

/**
 * @param {readonly DiagnosticLike[]} diagnostics
 * @returns {boolean}
 */
export function has_mapper_diagnostics(diagnostics) {
	return diagnostics.some(
		(diagnostic) =>
			diagnostic.source === DIAGNOSTIC_SOURCE && typeof code_value(diagnostic.code) === 'number',
	);
}

/**
 * @param {readonly DiagnosticLike[]} diagnostics
 * @returns {boolean}
 */
export function has_server_compile_errors(diagnostics) {
	return diagnostics.some(is_server_compile_error);
}

/**
 * @param {DiagnosticLike} diagnostic
 * @returns {boolean}
 */
function is_server_compile_error(diagnostic) {
	return diagnostic.source === DIAGNOSTIC_SOURCE && typeof code_value(diagnostic.code) !== 'number';
}

/**
 * A diagnostic without a severity is an error, as VS Code makes one.
 * @param {DiagnosticLike} diagnostic
 * @returns {boolean}
 */
function is_error(diagnostic) {
	return (diagnostic.severity ?? ERROR_SEVERITY) === ERROR_SEVERITY;
}

/**
 * @param {DiagnosticLike['code']} code
 * @returns {string | number | undefined}
 */
function code_value(code) {
	return typeof code === 'object' ? code.value : code;
}

/**
 * Whether VS Code's TypeScript shows the mistake of `diagnostic`, a server
 * compile error, itself: `diagnostic` has a TypeScript code (`TS1186`) and
 * TypeScript has a diagnostic with that code (`1186`) that starts at the same
 * place.
 * @param {DiagnosticLike} diagnostic
 * @param {readonly DiagnosticLike[]} all_diagnostics Every diagnostic VS Code holds for the file.
 * @returns {boolean}
 */
export function reported_by_typescript(diagnostic, all_diagnostics) {
	const code = code_value(diagnostic.code);
	const start = diagnostic.range?.start;
	if (typeof code !== 'string' || !/^TS\d+$/.test(code) || !start) {
		return false;
	}
	const number = Number(code.slice(2));
	return all_diagnostics.some(
		(other) =>
			other.source === TYPESCRIPT_DIAGNOSTIC_SOURCE &&
			Number(code_value(other.code)) === number &&
			other.range?.start.line === start.line &&
			other.range.start.character === start.character,
	);
}

/**
 * @param {DiagnosticLike} diagnostic
 * @returns {string}
 */
function diagnostic_key(diagnostic) {
	const start = diagnostic.range?.start;
	return `${code_value(diagnostic.code)}\0${diagnostic.message}\0${start?.line}:${start?.character}`;
}

/**
 * Session-wide memory of whether TypeScript 7's content mapper reports for this
 * workspace, learned from the diagnostics VS Code holds, and of the server's
 * diagnostics for each file before filtering, so a compile error dropped while
 * TypeScript showed the same mistake comes back when TypeScript stops.
 */
export class CompileErrorDedupe {
	/** True once the mapper has reported for any `.tsrx` file in this session. */
	mapper_seen = false;

	/**
	 * The server's diagnostics for each file (by URI) as it last reported them,
	 * before filtering, and whether it pushed them or VS Code pulled them.
	 * @type {Map<string, { diagnostics: readonly DiagnosticLike[], pushed: boolean }>}
	 */
	received = new Map();

	/**
	 * Learn from the diagnostics VS Code holds for a file.
	 * @param {readonly DiagnosticLike[]} all_diagnostics
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
	 * Remember the server's diagnostics for a file, and filter them.
	 * @template {DiagnosticLike} T
	 * @param {string} uri
	 * @param {readonly T[]} server_diagnostics
	 * @param {readonly DiagnosticLike[]} all_diagnostics Every diagnostic VS Code holds for the file.
	 * @param {boolean} pushed Whether the server pushed them, rather than VS Code pulling them.
	 * @returns {T[]}
	 */
	receive(uri, server_diagnostics, all_diagnostics, pushed) {
		this.received.set(uri, { diagnostics: [...server_diagnostics], pushed });
		return this.filter(server_diagnostics, all_diagnostics);
	}

	/**
	 * The server's diagnostics for a file, minus its compile errors while the
	 * mapper serves the workspace (or already reports for this very file), and
	 * minus each compile error that VS Code's TypeScript shows itself
	 * ({@link reported_by_typescript}). A warning stays while the mapper serves
	 * the workspace, as the mapper doesn't send one.
	 * @template {DiagnosticLike} T
	 * @param {readonly T[]} server_diagnostics
	 * @param {readonly DiagnosticLike[]} all_diagnostics Every diagnostic VS Code holds for the file.
	 * @returns {T[]}
	 */
	filter(server_diagnostics, all_diagnostics) {
		this.observe(all_diagnostics);
		return server_diagnostics.filter(
			(diagnostic) =>
				!is_server_compile_error(diagnostic) ||
				((!this.mapper_seen || !is_error(diagnostic)) &&
					!reported_by_typescript(diagnostic, all_diagnostics)),
		);
	}

	/**
	 * Whether the server's compile errors VS Code shows for a file differ from
	 * what {@link filter} gives now for the server's last diagnostics, as when
	 * TypeScript's diagnostics for the file have changed since. Refreshing the
	 * server's diagnostics for the file settles it, so this is false again after.
	 * Without the server's last diagnostics, the ones VS Code shows stand in.
	 * @param {string} uri
	 * @param {readonly DiagnosticLike[]} all_diagnostics Every diagnostic VS Code holds for the file.
	 * @returns {boolean}
	 */
	needs_refresh(uri, all_diagnostics) {
		const shown = all_diagnostics.filter(is_server_compile_error);
		const received = this.received.get(uri)?.diagnostics ?? shown;
		const wanted = this.filter(received, all_diagnostics).filter(is_server_compile_error);
		const shown_keys = shown.map(diagnostic_key).sort();
		const wanted_keys = wanted.map(diagnostic_key).sort();
		return (
			shown_keys.length !== wanted_keys.length ||
			shown_keys.some((key, index) => key !== wanted_keys[index])
		);
	}
}
