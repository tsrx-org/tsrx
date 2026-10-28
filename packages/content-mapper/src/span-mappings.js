/** @import {CodeMapping} from '@tsrx/core/types' */
/** @import {SpanMapping} from './protocol.js' */

import { SpanMapFeature, SpanMapKind } from './protocol.js';

const semantic_features =
	SpanMapFeature.Hover |
	SpanMapFeature.SignatureHelp |
	SpanMapFeature.InlayHints |
	SpanMapFeature.SemanticTokens;
const completion_features = SpanMapFeature.Completion | SpanMapFeature.AutoInsert;
const navigation_features =
	SpanMapFeature.Definition |
	SpanMapFeature.TypeDefinition |
	SpanMapFeature.Implementation |
	SpanMapFeature.References |
	SpanMapFeature.DocumentHighlights |
	SpanMapFeature.Rename |
	SpanMapFeature.CallHierarchy |
	SpanMapFeature.CodeActions |
	SpanMapFeature.LinkedEditing;
const structure_features =
	SpanMapFeature.FoldingRanges |
	SpanMapFeature.SelectionRanges |
	SpanMapFeature.DocumentSymbols |
	SpanMapFeature.CodeLens;

const identifier_pattern = /^[\p{ID_Start}_$][\p{ID_Continue}$‌‍]*$/u;

/**
 * @typedef {object} Candidate
 * @property {number} generatedStart
 * @property {number} generatedEnd
 * @property {number} originalStart
 * @property {number} originalEnd
 * @property {0 | 1 | 2} kind
 * @property {number} features
 * @property {boolean} [positionOnly] From a mapping with no Volar feature, not even
 *   `verification`: it only places diagnostics, so coalescing may join it to
 *   its neighbours like an unmapped gap.
 */

/**
 * Translate a Volar `CodeMapping['data']` into content-mapper feature bits.
 *
 * `verification` has no bit: diagnostics always apply. Spans that carry CSS
 * class hover/definition metadata (`customData.hover` / `customData.definition`)
 * leave Hover and Definition off so the TSRX language server owns those
 * features. `semantic.shouldHighlight()` returning `false` (string-literal
 * spans) drops SemanticTokens.
 * @param {CodeMapping['data'] | undefined} data
 * @returns {number}
 */
export function features_from_mapping_data(data) {
	if (!data || typeof data !== 'object') return SpanMapFeature.None;
	let features = SpanMapFeature.None;
	if (data.semantic) {
		features |= semantic_features;
		if (typeof data.semantic === 'object' && data.semantic.shouldHighlight?.() === false) {
			features &= ~SpanMapFeature.SemanticTokens;
		}
	}
	if (data.completion) {
		features |= completion_features;
	}
	if (data.navigation) {
		features |= navigation_features;
		if (typeof data.navigation === 'object') {
			if (data.navigation.shouldHighlight?.() === false) {
				features &= ~SpanMapFeature.DocumentHighlights;
			}
			if (data.navigation.shouldRename?.() === false) {
				features &= ~SpanMapFeature.Rename;
			}
		}
	}
	if (data.structure) {
		features |= structure_features;
	}
	if (data.format) {
		features |= SpanMapFeature.Formatting;
	}
	const custom = data.customData;
	if (custom && (custom.hover !== undefined || custom.definition !== undefined)) {
		features &= ~(SpanMapFeature.Hover | SpanMapFeature.Definition);
	}
	return features;
}

/**
 * Convert the type-only transform's Volar mappings into a content-mapper span
 * map: an ordered, disjoint (in generated space) list of
 * `[generatedStart, generatedLength, originalStart, originalLength, kind, features]`.
 *
 * - Equal length and identical text → `Verbatim` (the only edit-safe kind).
 * - An identifier whose generated spelling differs (obfuscated `_$_` names,
 *   renamed or capitalized identifiers) → `Alias`, so diagnostics that cover
 *   the span exactly show the authored name.
 * - Anything else → `Atom`.
 *
 * The transform emits container spans (statements, control-flow bodies) that
 * enclose token spans. TypeScript requires generated spans to be disjoint, so
 * candidates are ranked Verbatim first, then shorter before longer, and a
 * candidate that overlaps an already selected span in generated space is
 * dropped. Overlap in original space is allowed by the protocol (one source
 * range may be projected several times) and is kept.
 *
 * Neighbouring Verbatim spans with equal feature bits whose gap is the same
 * text in both files are then coalesced into one span (see
 * {@link coalesce_verbatim_spans}), so a statement such as
 * `import { a } from './x';` is one edit-safe span rather than four tokens
 * with unmapped punctuation between them. TypeScript only applies text edits
 * (auto-import, rename, code actions) that fit inside a single Verbatim span.
 * Last, a dropped candidate keeps its uncovered edges (see
 * {@link map_dropped_edges}), so a diagnostic over a whole container starts and
 * ends where the container does in the original.
 * @param {readonly CodeMapping[]} mappings
 * @param {string} generated_text
 * @param {string} original_text
 * @param {{ languageFeatures?: boolean }} [options] `languageFeatures: false` clears every feature bit (CLI-only projects).
 * @returns {SpanMapping[]}
 */
export function to_span_mappings(mappings, generated_text, original_text, options = {}) {
	const language_features = options.languageFeatures !== false;
	/** @type {Candidate[]} */
	const candidates = [];

	for (const mapping of mappings) {
		const count = Math.min(mapping.sourceOffsets.length, mapping.generatedOffsets.length);
		for (let index = 0; index < count; index++) {
			const original_start = mapping.sourceOffsets[index];
			const generated_start = mapping.generatedOffsets[index];
			const original_length = mapping.lengths[index] ?? mapping.lengths[0];
			const generated_length =
				mapping.generatedLengths?.[index] ?? mapping.generatedLengths?.[0] ?? original_length;
			if (
				!Number.isInteger(original_start) ||
				!Number.isInteger(generated_start) ||
				!Number.isInteger(original_length) ||
				!Number.isInteger(generated_length) ||
				original_start < 0 ||
				generated_start < 0 ||
				original_length <= 0 ||
				generated_length <= 0
			) {
				continue;
			}
			const generated_end = generated_start + generated_length;
			const original_end = original_start + original_length;
			if (generated_end > generated_text.length || original_end > original_text.length) {
				continue;
			}
			const generated_slice = generated_text.slice(generated_start, generated_end);
			const original_slice = original_text.slice(original_start, original_end);
			/** @type {0 | 1 | 2} */
			let kind;
			if (generated_length === original_length && generated_slice === original_slice) {
				kind = SpanMapKind.Verbatim;
			} else if (
				is_whole_identifier(generated_text, generated_start, generated_end) &&
				is_whole_token(original_text, original_start, original_end)
			) {
				kind = SpanMapKind.Alias;
			} else if (is_partial_identifier(original_text, original_start, original_end)) {
				// A fragment of an identifier (the transform's one-character file-start
				// anchor, `e` of `export` → `c` of a hoisted `const`) is not an entity.
				// Volar needed the anchor; under the content-mapper protocol it would
				// only make TypeScript project requests at the file start into
				// synthesized code.
				continue;
			} else {
				kind = SpanMapKind.Atom;
			}
			candidates.push({
				generatedStart: generated_start,
				generatedEnd: generated_end,
				originalStart: original_start,
				originalEnd: original_end,
				kind,
				features: language_features
					? features_from_mapping_data(mapping.data)
					: SpanMapFeature.None,
				positionOnly: is_position_only(mapping.data),
			});
		}
	}

	candidates.sort(
		(left, right) =>
			Number(left.kind !== SpanMapKind.Verbatim) - Number(right.kind !== SpanMapKind.Verbatim) ||
			left.generatedEnd - left.generatedStart - (right.generatedEnd - right.generatedStart) ||
			left.generatedStart - right.generatedStart ||
			left.originalStart - right.originalStart,
	);

	/** @type {Candidate[]} */
	const selected = [];
	/** @type {Candidate[]} */
	const dropped = [];
	const occupied = new IntervalSet();
	for (const candidate of candidates) {
		if (occupied.add(candidate.generatedStart, candidate.generatedEnd)) {
			selected.push(candidate);
		} else {
			dropped.push(candidate);
		}
	}

	selected.sort((left, right) => left.generatedStart - right.generatedStart);
	return map_dropped_edges(
		extend_verbatim_spans_over_whitespace(
			coalesce_verbatim_spans(selected, generated_text, original_text),
			generated_text,
			original_text,
		),
		dropped,
		generated_text,
		original_text,
	).map((candidate) => [
		candidate.generatedStart,
		candidate.generatedEnd - candidate.generatedStart,
		candidate.originalStart,
		candidate.originalEnd - candidate.originalStart,
		candidate.kind,
		candidate.features,
	]);
}

/**
 * Whether a mapping has no Volar feature at all, not even `verification`. The
 * transform emits such mappings only to give TypeScript 7 a place for
 * diagnostics (the brackets of a respaced literal); Volar ignores them.
 * @param {CodeMapping['data'] | undefined} data
 * @returns {boolean}
 */
function is_position_only(data) {
	return (
		!!data &&
		typeof data === 'object' &&
		!data.verification &&
		!data.completion &&
		!data.semantic &&
		!data.navigation &&
		!data.structure &&
		!data.format
	);
}

/**
 * Merge runs of Verbatim spans, sorted by generated start, when the two spans
 * carry the same feature bits and the text between them is identical (and of
 * equal length) in the generated and the original file. The merged span is
 * Verbatim by construction: every position inside it maps with the same
 * offset and the same text. A position-only span joins a neighbour whatever
 * its features, and takes them, as the unmapped text it covers would.
 * @param {Candidate[]} spans
 * @param {string} generated_text
 * @param {string} original_text
 * @returns {Candidate[]}
 */
export function coalesce_verbatim_spans(spans, generated_text, original_text) {
	/** @type {Candidate[]} */
	const merged = [];
	for (const span of spans) {
		const previous = merged[merged.length - 1];
		if (
			previous &&
			previous.kind === SpanMapKind.Verbatim &&
			span.kind === SpanMapKind.Verbatim &&
			(previous.features === span.features || previous.positionOnly || span.positionOnly) &&
			span.originalStart >= previous.originalEnd &&
			span.generatedStart - previous.generatedEnd === span.originalStart - previous.originalEnd &&
			generated_text.slice(previous.generatedEnd, span.generatedStart) ===
				original_text.slice(previous.originalEnd, span.originalStart)
		) {
			previous.generatedEnd = span.generatedEnd;
			previous.originalEnd = span.originalEnd;
			if (previous.positionOnly && !span.positionOnly) {
				previous.features = span.features;
				previous.positionOnly = false;
			}
			continue;
		}
		merged.push({ ...span });
	}
	return merged;
}

/**
 * Extend every Verbatim span forward over whitespace that is identical in the
 * generated and the original file, up to the next span in either file.
 *
 * TypeScript's edits routinely end at the start of the line after a statement
 * (an organize-imports edit for the import block ends after the last import's
 * newline), and TypeScript 7 discards a whole edit when any of its ranges does
 * not map. A span that stops at a statement's last character therefore made
 * "Organize Imports" a no-op on `.tsrx` files; covering the newline that follows
 * fixes that at no cost, since identical whitespace maps verbatim.
 * @param {Candidate[]} spans Sorted by generated start, non-overlapping.
 * @param {string} generated_text
 * @param {string} original_text
 * @returns {Candidate[]}
 */
export function extend_verbatim_spans_over_whitespace(spans, generated_text, original_text) {
	for (let index = 0; index < spans.length; index++) {
		const span = spans[index];
		if (span.kind !== SpanMapKind.Verbatim) continue;
		const next = spans[index + 1];
		const generated_limit = next ? next.generatedStart : generated_text.length;
		const original_limit = next ? next.originalStart : original_text.length;
		while (
			span.generatedEnd < generated_limit &&
			span.originalEnd < original_limit &&
			generated_text[span.generatedEnd] === original_text[span.originalEnd] &&
			/[ \t\r\n]/.test(generated_text[span.generatedEnd])
		) {
			span.generatedEnd++;
			span.originalEnd++;
		}
	}
	return spans;
}

/**
 * Map the uncovered edges of each candidate that lost to the spans it
 * overlaps: the part before its first span and the part after its last.
 *
 * A container (a whole import type, a statement) encloses the token spans that
 * beat it, and TypeScript reports some diagnostics over the whole container.
 * When the printed text differs from the source (`import(  './x'  )` printed
 * as `import('./x')`), the container's start lies in unmapped text, and
 * TypeScript would report the diagnostic at the nearest earlier mapped
 * position instead. An edge runs from the container's boundary to the
 * neighbouring span, in both files, so it maps only when that span's original
 * range starts (or ends) inside the container's. Each edge is split by
 * {@link split_edge} so that a node inside it without a span of its own keeps
 * its position. Edges carry no feature bits: they place diagnostics and change
 * no editor feature. Gaps between a container's spans stay unmapped.
 * Candidates are visited shortest first, so a nested container's edge bounds
 * the edge of the one around it.
 * @param {Candidate[]} spans Sorted by generated start, non-overlapping.
 * @param {readonly Candidate[]} dropped
 * @param {string} generated_text
 * @param {string} original_text
 * @returns {Candidate[]}
 */
export function map_dropped_edges(spans, dropped, generated_text, original_text) {
	const result = spans.slice();
	/**
	 * @param {Candidate | null} edge
	 * @param {boolean} trailing
	 */
	const add = (edge, trailing) => {
		if (!edge) return;
		for (const span of split_edge(edge, generated_text, original_text, trailing)) {
			if (
				span.kind === SpanMapKind.Atom &&
				is_partial_identifier(original_text, span.originalStart, span.originalEnd)
			) {
				continue;
			}
			result.splice(last_span_at_or_before(result, span.generatedStart) + 1, 0, span);
		}
	};
	for (const candidate of dropped) {
		add(leading_edge(result, candidate), false);
		add(trailing_edge(result, candidate), true);
	}
	return result;
}

/**
 * @param {readonly Candidate[]} spans
 * @param {Candidate} candidate
 * @returns {Candidate | null}
 */
function leading_edge(spans, candidate) {
	const index = last_span_at_or_before(spans, candidate.generatedStart);
	if (index >= 0 && spans[index].generatedEnd > candidate.generatedStart) return null;
	const next = spans[index + 1];
	if (
		!next ||
		next.generatedStart >= candidate.generatedEnd ||
		next.originalStart <= candidate.originalStart ||
		next.originalStart > candidate.originalEnd
	) {
		return null;
	}
	return edge(
		candidate.generatedStart,
		next.generatedStart,
		candidate.originalStart,
		next.originalStart,
		SpanMapKind.Atom,
	);
}

/**
 * @param {readonly Candidate[]} spans
 * @param {Candidate} candidate
 * @returns {Candidate | null}
 */
function trailing_edge(spans, candidate) {
	const previous = spans[last_span_at_or_before(spans, candidate.generatedEnd - 1)];
	if (
		!previous ||
		previous.generatedEnd >= candidate.generatedEnd ||
		previous.generatedEnd <= candidate.generatedStart ||
		previous.originalEnd < candidate.originalStart ||
		previous.originalEnd >= candidate.originalEnd
	) {
		return null;
	}
	return edge(
		previous.generatedEnd,
		candidate.generatedEnd,
		previous.originalEnd,
		candidate.originalEnd,
		SpanMapKind.Atom,
	);
}

/**
 * Split an edge into `Verbatim` runs of the text it shares with the source,
 * matched from the container's boundary (the start of a leading edge, the end
 * of a trailing one) with whitespace that only one side has skipped, and one
 * `Atom` for whatever follows the first other difference. The printer mostly
 * changes spacing: in `Record< {}, 1 >`, printed `Record<{  }, 1>`, the `{` of
 * the `{}` that has no span of its own then maps to itself instead of to the
 * container's `<`. An edge whose boundary character differs stays one `Atom`,
 * and no run starts or ends inside an identifier.
 * @param {Candidate} whole
 * @param {string} generated_text
 * @param {string} original_text
 * @param {boolean} from_end
 * @returns {Candidate[]}
 */
function split_edge(whole, generated_text, original_text, from_end) {
	const generated = generated_text.slice(whole.generatedStart, whole.generatedEnd);
	const original = original_text.slice(whole.originalStart, whole.originalEnd);
	/**
	 * The character `index` steps from the boundary.
	 * @param {string} text
	 * @param {number} index
	 */
	const at = (text, index) => text[from_end ? text.length - 1 - index : index];
	if (at(generated, 0) !== at(original, 0)) return [whole];

	/** Runs as `[generated step, original step, length]`, in steps from the boundary. */
	/** @type {Array<[number, number, number]>} */
	const runs = [];
	let i = 0;
	let j = 0;
	while (i < generated.length && j < original.length) {
		const g = at(generated, i);
		const o = at(original, j);
		if (g === o) {
			const run = runs.at(-1);
			if (run && run[0] + run[2] === i && run[1] + run[2] === j) run[2]++;
			else runs.push([i, j, 1]);
			i++;
			j++;
		} else if (/\s/.test(g)) {
			i++;
		} else if (/\s/.test(o)) {
			j++;
		} else {
			break;
		}
	}
	// Runs keep to identifier boundaries in both texts: skipped whitespace can
	// join or split identifiers. The runs from the first one that starts inside
	// an identifier, or the part of a run after its last boundary, go to the Atom.
	/** @param {string} text @param {number} index */
	const splits = (text, index) =>
		identifier_part.test(at(text, index - 1) ?? '') && identifier_part.test(at(text, index) ?? '');
	/** @type {Array<[number, number, number]>} */
	const kept = [];
	for (const [g, o, length] of runs) {
		if (splits(generated, g) || splits(original, o)) break;
		let end = length;
		while (end > 0 && (splits(generated, g + end) || splits(original, o + end))) end--;
		if (end > 0) kept.push([g, o, end]);
		if (end < length) break;
	}
	const last = kept.at(-1);
	if (!last) return [whole];
	// The Atom starts where the last run ends.
	i = last[0] + last[2];
	j = last[1] + last[2];

	/** @type {Candidate[]} */
	const spans = kept.map(([g, o, length]) =>
		from_end
			? edge_span(whole.generatedEnd - g - length, whole.originalEnd - o - length, length)
			: edge_span(whole.generatedStart + g, whole.originalStart + o, length),
	);
	if (i < generated.length && j < original.length) {
		spans.push(
			from_end
				? edge(
						whole.generatedStart,
						whole.generatedEnd - i,
						whole.originalStart,
						whole.originalEnd - j,
						SpanMapKind.Atom,
					)
				: edge(
						whole.generatedStart + i,
						whole.generatedEnd,
						whole.originalStart + j,
						whole.originalEnd,
						SpanMapKind.Atom,
					),
		);
	}
	return spans;
}

/**
 * @param {number} generated_start
 * @param {number} original_start
 * @param {number} length
 * @returns {Candidate}
 */
function edge_span(generated_start, original_start, length) {
	return edge(
		generated_start,
		generated_start + length,
		original_start,
		original_start + length,
		SpanMapKind.Verbatim,
	);
}

/**
 * @param {number} generated_start
 * @param {number} generated_end
 * @param {number} original_start
 * @param {number} original_end
 * @param {0 | 1 | 2} kind
 * @returns {Candidate}
 */
function edge(generated_start, generated_end, original_start, original_end, kind) {
	return {
		generatedStart: generated_start,
		generatedEnd: generated_end,
		originalStart: original_start,
		originalEnd: original_end,
		kind,
		features: SpanMapFeature.None,
	};
}

/**
 * The index of the last span that starts at or before `position`, or -1.
 * @param {readonly Candidate[]} spans Sorted by generated start.
 * @param {number} position
 */
function last_span_at_or_before(spans, position) {
	let low = 0;
	let high = spans.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (spans[middle].generatedStart <= position) low = middle + 1;
		else high = middle;
	}
	return low - 1;
}

const identifier_part = /[\p{ID_Continue}$\u200c\u200d]/u;
const token_part = /[\p{ID_Continue}$#@\u200c\u200d]/u;

/**
 * Whether `[start, end)` is a complete identifier in `text`: identifier
 * syntax inside and no identifier character touching either edge.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function is_whole_identifier(text, start, end) {
	return (
		identifier_pattern.test(text.slice(start, end)) &&
		(start === 0 || !identifier_part.test(text[start - 1])) &&
		(end === text.length || !identifier_part.test(text[end]))
	);
}

/**
 * Whether `[start, end)` is a piece of a longer identifier in `text`:
 * identifier characters inside and an identifier character touching an edge.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function is_partial_identifier(text, start, end) {
	const slice = text.slice(start, end);
	return (
		slice.length > 0 &&
		[...slice].every((character) => identifier_part.test(character)) &&
		((start > 0 && identifier_part.test(text[start - 1])) ||
			(end < text.length && identifier_part.test(text[end])))
	);
}

/**
 * Whether `[start, end)` is a complete authored token: no whitespace inside
 * and no token character (identifier characters plus the TSRX `#`/`@`
 * sigils) touching either edge.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 */
function is_whole_token(text, start, end) {
	const slice = text.slice(start, end);
	return (
		slice.length > 0 &&
		!/\s/.test(slice) &&
		(start === 0 || !token_part.test(text[start - 1])) &&
		(end === text.length || !token_part.test(text[end]))
	);
}

/**
 * Sorted set of half-open intervals supporting an "add if disjoint" query.
 * Intervals are kept sorted by start in a plain array; a binary search finds
 * the neighbours to test, so adding is O(n) in the worst case, which is fine
 * for the few thousand spans a file produces.
 */
class IntervalSet {
	/** @type {number[]} */
	#starts = [];
	/** @type {number[]} */
	#ends = [];

	/**
	 * @param {number} start
	 * @param {number} end
	 * @returns {boolean} Whether the interval was added (it overlapped nothing).
	 */
	add(start, end) {
		const starts = this.#starts;
		let low = 0;
		let high = starts.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (starts[middle] < start) low = middle + 1;
			else high = middle;
		}
		// `low` is the first interval starting at or after `start`.
		if (low < starts.length && starts[low] < end) return false;
		if (low > 0 && this.#ends[low - 1] > start) return false;
		starts.splice(low, 0, start);
		this.#ends.splice(low, 0, end);
		return true;
	}
}
