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
	const occupied = new IntervalSet();
	for (const candidate of candidates) {
		if (!occupied.add(candidate.generatedStart, candidate.generatedEnd)) {
			continue;
		}
		selected.push(candidate);
	}

	selected.sort((left, right) => left.generatedStart - right.generatedStart);
	return coalesce_verbatim_spans(selected, generated_text, original_text).map((candidate) => [
		candidate.generatedStart,
		candidate.generatedEnd - candidate.generatedStart,
		candidate.originalStart,
		candidate.originalEnd - candidate.originalStart,
		candidate.kind,
		candidate.features,
	]);
}

/**
 * Merge runs of Verbatim spans, sorted by generated start, when the two spans
 * carry the same feature bits and the text between them is identical (and of
 * equal length) in the generated and the original file. The merged span is
 * Verbatim by construction: every position inside it maps with the same
 * offset and the same text.
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
			previous.features === span.features &&
			span.originalStart >= previous.originalEnd &&
			span.generatedStart - previous.generatedEnd === span.originalStart - previous.originalEnd &&
			generated_text.slice(previous.generatedEnd, span.generatedStart) ===
				original_text.slice(previous.originalEnd, span.originalStart)
		) {
			previous.generatedEnd = span.generatedEnd;
			previous.originalEnd = span.originalEnd;
			continue;
		}
		merged.push({ ...span });
	}
	return merged;
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
