/**
 * @import {Diagnostic, Range, LanguageServicePlugin, LanguageServiceContext, Position, Mapper, CancellationToken, CodeInformation} from '@volar/language-server';
 * @import {TextDocument} from 'vscode-languageserver-textdocument';
 * @import {TSRXVirtualCodeInstance} from '@tsrx/typescript-plugin/src/language.js';
 */
/** @import {CompileError} from '@tsrx/core/types'; */

import { getVirtualCode, createLogging } from './utils.js';

const { log } = createLogging('[TSRX Compile Error Diagnostic Plugin]');
import { DiagnosticSeverity } from '@volar/language-server';

/**
 * @returns {LanguageServicePlugin}
 */
export function createCompileErrorDiagnosticPlugin() {
	log('Creating TSRX diagnostic plugin...');

	return {
		name: 'tsrx-diagnostics',
		capabilities: {
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
		},
		create(/** @type {LanguageServiceContext} */ context) {
			return {
				async provideDiagnostics(document, token) {
					log('Providing TSRX diagnostics for:', document.uri);

					/** @type {Diagnostic[]} */
					const diagnostics = [];
					const { virtualCode, sourceMap } = getVirtualCode(document, context);

					if (!virtualCode || virtualCode.languageId !== 'tsrx') {
						// skip if it's like embedded css
						return diagnostics;
					}

					if (!virtualCode.fatalErrors.length && !virtualCode.usageErrors.length) {
						return diagnostics;
					}

					/** @type {Set<string> | undefined} */
					let typescript_diagnostics;

					for (const error of [...virtualCode.fatalErrors, ...virtualCode.usageErrors]) {
						const diagnostic = parseCompilationErrorWithDocument(
							error,
							virtualCode,
							sourceMap,
							document,
						);

						// A usage error with a TypeScript code is a mistake the parser
						// collects where TypeScript's parser goes on (#415). When the
						// virtual code keeps the code the mistake is in, TypeScript reports
						// it too, so leave it to TypeScript, whose diagnostic has its quick
						// fixes, when it shows the same code at the same place.
						if (error.type !== 'fatal' && error.code?.startsWith('TS') && sourceMap) {
							typescript_diagnostics ??= await get_typescript_diagnostics(
								context,
								document,
								sourceMap,
								token,
							);
							const place = shown_at(diagnostic, error.code, document, sourceMap);
							if (place && typescript_diagnostics.has(place)) {
								log('Leaving', error.code, 'to TypeScript:', error.message);
								continue;
							}
						}

						diagnostics.push(diagnostic);
					}

					log('Generated', diagnostics.length, 'diagnostics');
					return diagnostics;
				},
			};
		},
	};
}

/**
 * Where the editor shows each diagnostic TypeScript reports for the virtual
 * code, as `shown_at` gives it. They come from the `typescript-semantic` plugin,
 * so they are the ones the editor gets: `createTypeScriptDiagnosticFilterPlugin`
 * has already left out the suppressed ones, and none come back when TypeScript
 * validation is off or the plugin is disabled. TypeScript caches a program's
 * syntactic and semantic diagnostics, so the plugin reuses them when Volar asks
 * it next.
 * @param {LanguageServiceContext} context
 * @param {TextDocument} document
 * @param {Mapper} sourceMap
 * @param {CancellationToken} token
 * @returns {Promise<Set<string>>}
 */
async function get_typescript_diagnostics(context, document, sourceMap, token) {
	/** @type {Set<string>} */
	const places = new Set();
	const typescript = context.plugins.find(
		([plugin, instance]) =>
			plugin.name === 'typescript-semantic' && !context.disabledServicePlugins.has(instance),
	)?.[1];
	const diagnostics = (await typescript?.provideDiagnostics?.(document, token)) ?? [];

	for (const diagnostic of diagnostics) {
		if (typeof diagnostic.code !== 'number') continue;
		const place = shown_at(diagnostic, `TS${diagnostic.code}`, document, sourceMap);
		if (place) places.add(place);
	}

	return places;
}

/**
 * The code of `diagnostic` and the source offset the editor shows it at, or
 * `null` when the editor leaves it out. Volar maps a diagnostic's range back to
 * the source through the mappings that report diagnostics, and leaves out a
 * diagnostic whose range doesn't map, such as one that ends in text the
 * mappings don't cover (`transformDiagnostic` in `@volar/language-service`).
 * @param {Diagnostic} diagnostic
 * @param {string} code
 * @param {TextDocument} document
 * @param {Mapper} sourceMap
 * @returns {string | null}
 */
function shown_at(diagnostic, code, document, sourceMap) {
	const range = sourceMap
		.toSourceRange(
			document.offsetAt(diagnostic.range.start),
			document.offsetAt(diagnostic.range.end),
			true,
			(data) => reports_diagnostic(data, diagnostic),
		)
		.next().value;
	return range ? `${code}@${range[0]}` : null;
}

/**
 * Whether a mapping reports `diagnostic`, as Volar's `shouldReportDiagnostics`
 * decides it.
 * @param {CodeInformation} data
 * @param {Diagnostic} diagnostic
 * @returns {boolean}
 */
function reports_diagnostic(data, diagnostic) {
	return typeof data.verification === 'object'
		? (data.verification.shouldReport?.(diagnostic.source, diagnostic.code) ?? true)
		: !!data.verification;
}

/**
 * @param {CompileError} error
 * @param {TSRXVirtualCodeInstance} virtualCode
 * @param {Mapper | undefined} sourceMap
 * @param {TextDocument} document
 * @returns {Diagnostic}
 */
function parseCompilationErrorWithDocument(error, virtualCode, sourceMap, document) {
	if (error.type === 'fatal') {
		return {
			severity: DiagnosticSeverity.Error,
			range: get_error_range_from_source(error, document),
			message: error.message,
			source: 'TSRX',
			code: 'tsrx-compile-error',
		};
	}

	/** @type {Position | null} */
	let start = null;
	/** @type {Position | null} */
	let end = null;

	if (error.pos) {
		const start_offset = get_start_offset_from_error(error);
		const end_offset = get_end_offset_from_error(error, start_offset);
		// try to find exact mapping
		// TODO: perhaps it's best to just switch to sourceMap entirely?
		const mapping = virtualCode.findMappingBySourceRange(start_offset, end_offset);

		if (mapping) {
			start = document.positionAt(mapping.generatedOffsets[0]);
			end = document.positionAt(mapping.generatedOffsets[0] + mapping.generatedLengths[0]);
		} else {
			// No single mapping spans the whole range: statements and elements are
			// only covered by granular token mappings (e.g. `const test = 5;` maps
			// as `const `, `test`, ` = `, `5`, `;`, with keywords often dropped), so
			// an exact range lookup never matches them. Span the generated range
			// from the tokens that overlap the range so the diagnostic lands on its
			// source range instead of collapsing to the start of the file.
			const generated = virtualCode.findGeneratedRangeBySourceRange(start_offset, end_offset);

			if (generated) {
				start = document.positionAt(generated[0]);
				end = document.positionAt(generated[1]);
			} else if (sourceMap) {
				// try to find the match even across multiple mappings
				const result = sourceMap.toGeneratedRange(start_offset, end_offset, true).next().value;

				if (result) {
					const [gen_start_offset, gen_end_offset] = result;
					start = document.positionAt(gen_start_offset);
					end = document.positionAt(gen_end_offset);
				}
			}
		}
	}

	if (!start || !end) {
		start = { line: 0, character: 0 };
		end = { line: 0, character: 1 };
	}

	return {
		severity: DiagnosticSeverity.Error,
		range: { start, end },
		message: error.message,
		source: 'TSRX',
		// Coded usage errors (`DIAGNOSTIC_CODES` in @tsrx/core, e.g. `TSRX3002`)
		// keep their code so editors and tooling can tell them apart; uncoded ones fall back
		// to the generic marker.
		code: error.code ?? 'tsrx-usage-error',
	};
}

/**
 * @param {CompileError} error
 * @param {TextDocument} document
 * @returns {Range}
 */
function get_error_range_from_source(error, document) {
	const start_offset = get_start_offset_from_error(error);
	return {
		start: document.positionAt(start_offset),
		end: document.positionAt(get_end_offset_from_error(error, start_offset)),
	};
}

/**
 * @param {CompileError} error
 * @param {number} [start_offset]
 * @returns {number}
 */
function get_end_offset_from_error(error, start_offset) {
	start_offset = start_offset ?? get_start_offset_from_error(error);
	return error.end
		? error.end
		: error.raisedAt && (error.raisedAt ?? 0) > start_offset
			? error.raisedAt
			: start_offset + 1;
}

/**
 * @param {CompileError} error
 * @returns {number}
 */
function get_start_offset_from_error(error) {
	return error.pos ?? 0;
}
