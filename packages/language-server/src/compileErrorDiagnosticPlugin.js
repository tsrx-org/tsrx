/**
 * @import {Diagnostic, Range, LanguageServicePlugin, LanguageServiceContext, Position, Mapper, CancellationToken, CodeInformation} from '@volar/language-server';
 * @import {TextDocument} from 'vscode-languageserver-textdocument';
 * @import {TSRXVirtualCodeInstance} from '@tsrx/typescript-plugin/src/language.js';
 */
/** @import {CompileError} from '@tsrx/core/types'; */

import { getVirtualCode, createLogging } from './utils.js';

const { log } = createLogging('[TSRX Compile Error Diagnostic Plugin]');
import { DiagnosticSeverity } from '@volar/language-server';
import { DIAGNOSTIC_SOURCE } from '@tsrx/core/diagnostics';

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
					const { virtualCode, sourceMap, sourceScript } = getVirtualCode(document, context);

					if (virtualCode?.languageId === 'css') {
						// The type-only code has nothing in a `<style>` body to show an
						// error on, but the body's embedded CSS maps it whole.
						const root = /** @type {TSRXVirtualCodeInstance | undefined} */ (
							sourceScript?.generated?.root
						);
						return root?.languageId === 'tsrx' && has_own_id(virtualCode, root)
							? css_region_diagnostics(root, virtualCode, document)
							: [];
					}

					if (!virtualCode || virtualCode.languageId !== 'tsrx') {
						return diagnostics;
					}

					if (!virtualCode.fatalErrors.length && !virtualCode.usageErrors.length) {
						return diagnostics;
					}

					/** @type {Set<string> | undefined} */
					let typescript_diagnostics;

					for (const error of [...virtualCode.fatalErrors, ...virtualCode.usageErrors]) {
						// Shown in the embedded CSS of the `<style>` body it is in.
						const css = error.type === 'fatal' ? null : css_region_of(error, virtualCode);
						if (css && has_own_id(css, virtualCode)) continue;

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
 * The embedded CSS code (a `<style>` body) that holds all of `error`'s range,
 * if one does.
 * @param {CompileError} error
 * @param {TSRXVirtualCodeInstance} root
 * @returns {import('@volar/language-server').VirtualCode | null}
 */
function css_region_of(error, root) {
	if (error.pos === undefined) return null;
	const end = get_end_offset_from_error(error, error.pos);
	for (const code of root.embeddedCodes ?? []) {
		if (code.languageId !== 'css') continue;
		const region = css_region_range(code);
		if (region && region[0] <= error.pos && end <= region[1]) return code;
	}
	return null;
}

/**
 * Whether `code` is the only embedded code of `root` with its id. Volar keeps
 * one code of an id and gives every document of that id that code, so an error
 * in a code whose id another shares stays on the TSRX document.
 * @param {import('@volar/language-server').VirtualCode} code
 * @param {TSRXVirtualCodeInstance} root
 * @returns {boolean}
 */
function has_own_id(code, root) {
	return (root.embeddedCodes ?? []).filter((other) => other.id === code.id).length === 1;
}

/**
 * @param {import('@volar/language-server').VirtualCode} code
 * @returns {[start: number, end: number] | null}
 */
function css_region_range(code) {
	const mapping = code.mappings[0];
	if (!mapping) return null;
	const start = mapping.sourceOffsets[0];
	return [start, start + mapping.lengths[0]];
}

/**
 * The usage errors of `root` in the `<style>` body `css` is the embedded code
 * of, on `document`, the embedded CSS, whose offsets are the body's.
 * @param {TSRXVirtualCodeInstance} root
 * @param {import('@volar/language-server').VirtualCode} css
 * @param {TextDocument} document
 * @returns {Diagnostic[]}
 */
function css_region_diagnostics(root, css, document) {
	const region = css_region_range(css);
	if (!region) return [];
	/** @type {Diagnostic[]} */
	const diagnostics = [];
	for (const error of root.usageErrors) {
		if (css_region_of(error, root) !== css) continue;
		const start = /** @type {number} */ (error.pos) - region[0];
		const end = get_end_offset_from_error(error, /** @type {number} */ (error.pos)) - region[0];
		diagnostics.push({
			severity:
				error.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
			range: { start: document.positionAt(start), end: document.positionAt(end) },
			message: error.message,
			source: DIAGNOSTIC_SOURCE,
			code: error.code ?? 'tsrx-usage-error',
		});
	}
	return diagnostics;
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
 * The source range the editor shows a diagnostic on the generated `range` at,
 * with the mappings of its ends, or `undefined` when it leaves it out. Volar
 * maps the diagnostic's range, as positions, back through the mappings that
 * report it (`transformDiagnostic` in `@volar/language-service`), and a
 * position can't fall between a `\r` and its `\n`.
 * @param {[number, number]} range
 * @param {(data: CodeInformation) => boolean} reports Whether a mapping reports the diagnostic
 * @param {TextDocument} document
 * @param {Mapper} sourceMap
 */
function shown_range(range, reports, document, sourceMap) {
	const start = document.offsetAt(document.positionAt(range[0]));
	const end = document.offsetAt(document.positionAt(range[1]));
	return sourceMap.toSourceRange(start, end, true, reports).next().value;
}

/**
 * Whether a mapping reports `diagnostic`, as Volar's `shouldReportDiagnostics`
 * decides it.
 * @param {CodeInformation} data
 * @param {Pick<Diagnostic, 'source' | 'code'>} diagnostic
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
			source: DIAGNOSTIC_SOURCE,
			code: 'tsrx-compile-error',
		};
	}

	/** @type {Position | null} */
	let start = null;
	/** @type {Position | null} */
	let end = null;

	if (error.pos !== undefined) {
		const start_offset = get_start_offset_from_error(error);
		const end_offset = get_end_offset_from_error(error, start_offset);
		const diagnostic_id = { source: DIAGNOSTIC_SOURCE, code: error.code ?? 'tsrx-usage-error' };
		/** @param {CodeInformation} data */
		const reports = (data) => reports_diagnostic(data, diagnostic_id);

		// try to find exact mapping
		// TODO: perhaps it's best to just switch to sourceMap entirely?
		const mapping = virtualCode.findMappingBySourceRange(start_offset, end_offset);
		/** @type {[number, number] | null | undefined} */
		let generated;

		if (mapping) {
			generated = [
				mapping.generatedOffsets[0],
				mapping.generatedOffsets[0] + mapping.generatedLengths[0],
			];
		} else {
			// No single mapping spans the whole range: statements and elements are
			// only covered by granular token mappings (e.g. `const test = 5;` maps
			// as `const `, `test`, ` = `, `5`, `;`, with keywords often dropped), so
			// an exact range lookup never matches them. Span the generated range
			// from the tokens that overlap the range so the diagnostic lands on its
			// source range instead of collapsing to the start of the file.
			generated = virtualCode.findGeneratedRangeBySourceRange(start_offset, end_offset);

			if (!generated && sourceMap) {
				// try to find the match even across multiple mappings
				generated = sourceMap.toGeneratedRange(start_offset, end_offset, true).next().value;
			}
		}

		if (!generated) {
			// No mapping covers the error, such as a repeated modifier the
			// editor's code leaves out (`public public`), or a `<>` left open,
			// which has none in a template. The editor shows a diagnostic only
			// where the generated code maps back, so show it on the code the error
			// reaches, such as a `<>`'s first child, or else the nearest code before
			// it that does, not at the start of the file.
			generated = nearest_reported_range(
				virtualCode,
				(data) => !!data.verification,
				start_offset,
				error.raisedAt,
			);
		}

		if (generated && sourceMap && !shown_range(generated, reports, document, sourceMap)) {
			// The editor would leave the error out: its range is on code whose
			// mappings don't report it, such as an `@switch`'s own mapping over a
			// `break` right in a case, which the editor's code leaves out, or over
			// the whole directive used as a statement outside a template. Show it
			// on the tokens in the range that report it, or on its ends mapped
			// through the mappings that do, where the editor shows that within the
			// range, or else on the nearest code that reports it, such as the
			// case's test: the first the editor shows on some code, not only
			// whitespace. With none, the range stays, as before.
			const map = sourceMap;
			// Another error's anchor is that error's place (see
			// `findGeneratedRangeBySourceRange`), so not this one's, neither to
			// look for a place through nor for the editor to show it through.
			const reaches = (/** @type {CodeInformation} */ data) =>
				reports(data) && !(/** @type {any} */ (data).customData?.diagnosticAnchor);
			/** @param {[number, number] | null | undefined} range */
			const shown_on_code = (range) => {
				const shown = range && shown_range(range, reports, document, map);
				return shown &&
					reaches(shown[2].data) &&
					reaches(shown[3].data) &&
					/\S/.test(virtualCode.originalCode.slice(shown[0], shown[1]))
					? shown
					: null;
			};
			const in_range = (function* () {
				if (mapping) yield virtualCode.findGeneratedRangeBySourceRange(start_offset, end_offset);
				// Every pair of places the ends map to, as `toGeneratedRange` stops
				// at the first end for each start.
				for (const [from] of map.toGeneratedLocation(start_offset, reaches)) {
					for (const [to] of map.toGeneratedLocation(end_offset, reaches)) {
						if (to >= from) yield /** @type {[number, number]} */ ([from, to]);
					}
				}
			})();
			/** @type {[number, number] | null | undefined} */
			let found;
			for (const range of in_range) {
				// These are for the error's own range, so where the editor shows them
				// on code outside it, they aren't.
				const shown = shown_on_code(range);
				if (shown && shown[0] >= start_offset && shown[1] <= end_offset) {
					found = range;
					break;
				}
			}
			found ??= nearest_reported_range(
				virtualCode,
				reaches,
				start_offset,
				error.raisedAt,
				// On the token itself, not on code another mapping of the same
				// generated code (another error's anchor) maps it to.
				(range, token) => {
					const shown = shown_on_code(range);
					return !!shown && shown[0] >= token[0] && shown[1] <= token[1];
				},
			);
			if (found) generated = found;
		}

		if (generated) {
			start = document.positionAt(generated[0]);
			end = document.positionAt(generated[1]);
		}
	}

	if (!start || !end) {
		start = { line: 0, character: 0 };
		end = { line: 0, character: 1 };
	}

	return {
		// Collected diagnostics may declare `severity: 'warning'` (consumer
		// compilers push warnings into `errors` alongside errors); surface those
		// as real editor warnings instead of silently upgrading them.
		severity: error.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
		range: { start, end },
		message: error.message,
		source: DIAGNOSTIC_SOURCE,
		// Coded usage errors (`DIAGNOSTIC_CODES` in @tsrx/core, e.g. `TSRX3002`)
		// keep their code so editors and tooling can tell them apart; uncoded ones fall back
		// to the generic marker.
		code: error.code ?? 'tsrx-usage-error',
	};
}

/**
 * The generated range of the source token that reports the error and starts
 * nearest after `offset`, when it starts before `reach`. Otherwise the one that
 * ends nearest before `offset`, or starts nearest after it when none ends
 * before it. Of tokens the same distance away, the shortest. A mapping over
 * whitespace only, such as the indentation before a template's output, is not
 * code to show the error on, and neither is a token whose ranges `shows`
 * rejects: the next one in that order is.
 * @param {TSRXVirtualCodeInstance} virtualCode
 * @param {(data: CodeInformation) => boolean} reports Whether a mapping reports the error
 * @param {number} offset
 * @param {number} [reach] Where the error's parser stopped, such as the token that ended a template
 * @param {(range: [number, number], token: [number, number]) => boolean} [shows] Whether the editor shows the error on a token's generated `range` and where its source `token` is
 * @returns {[number, number] | null}
 */
function nearest_reported_range(virtualCode, reports, offset, reach = offset, shows = () => true) {
	/** @type {{ range: [number, number], token: [number, number], distance: number, length: number, rank: number }[]} */
	const tokens = [];
	for (const mapping of virtualCode.mappings ?? []) {
		if (!mapping.data || !reports(mapping.data)) continue;
		for (let i = 0; i < mapping.sourceOffsets.length; i++) {
			const source_start = mapping.sourceOffsets[i];
			const length = mapping.lengths[i];
			const generated_length = mapping.generatedLengths?.[i] ?? length;
			// A hoisted sibling can leave a token a mapping that runs backwards in
			// the generated code, and Volar drops a diagnostic on such a range.
			if (length === 0 || generated_length <= 0) continue;
			if (!/\S/.test(virtualCode.originalCode.slice(source_start, source_start + length))) {
				continue;
			}
			const generated_start = mapping.generatedOffsets[i];
			const ends_before = source_start + length <= offset;
			if (!ends_before && source_start < offset) continue;
			tokens.push({
				range: [generated_start, generated_start + generated_length],
				token: [source_start, source_start + length],
				distance: ends_before ? offset - (source_start + length) : source_start - offset,
				length,
				// A token after the offset that starts before `reach` first, then
				// the tokens before it, then the others after it.
				rank: ends_before ? 1 : source_start < reach ? 0 : 2,
			});
		}
	}
	// A stable sort keeps the first of tokens alike.
	tokens.sort((a, b) => a.rank - b.rank || a.distance - b.distance || a.length - b.length);
	return tokens.find((token) => shows(token.range, token.token))?.range ?? null;
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
