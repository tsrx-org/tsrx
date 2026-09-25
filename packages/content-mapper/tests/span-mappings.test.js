import { describe, expect, it } from 'vitest';
import { SpanMapFeature, SpanMapKind } from '../src/protocol.js';
import { features_from_mapping_data, to_span_mappings } from '../src/span-mappings.js';

const all = {
	verification: true,
	completion: true,
	semantic: true,
	navigation: true,
	structure: true,
	format: false,
	customData: {},
};
const verify_only = { verification: true, customData: {} };

/**
 * @param {number} source
 * @param {number} generated
 * @param {number} length
 * @param {object} [extra]
 */
function m(source, generated, length, extra = {}) {
	return {
		sourceOffsets: [source],
		generatedOffsets: [generated],
		lengths: [length],
		generatedLengths: [length],
		data: all,
		...extra,
	};
}

describe('features_from_mapping_data', () => {
	it('maps the full mapping data to every feature except Formatting', () => {
		expect(features_from_mapping_data(all)).toBe(SpanMapFeature.All & ~SpanMapFeature.Formatting);
	});

	it('gives verification-only spans no feature bits', () => {
		expect(features_from_mapping_data(verify_only)).toBe(SpanMapFeature.None);
	});

	it('maps completion-only spans to Completion and AutoInsert', () => {
		expect(features_from_mapping_data({ completion: true, customData: {} })).toBe(
			SpanMapFeature.Completion | SpanMapFeature.AutoInsert,
		);
	});

	it('drops SemanticTokens for string-literal spans', () => {
		const features = features_from_mapping_data({
			...all,
			completion: false,
			semantic: { shouldHighlight: () => false },
		});
		expect(features & SpanMapFeature.SemanticTokens).toBe(0);
		expect(features & SpanMapFeature.Hover).toBe(SpanMapFeature.Hover);
		expect(features & SpanMapFeature.Completion).toBe(0);
	});

	it('leaves Hover and Definition off for CSS class spans', () => {
		const features = features_from_mapping_data({
			...all,
			customData: {
				hover: 'css',
				definition: { location: { embeddedId: 'style_0', start: 0, end: 1 } },
			},
		});
		expect(features & SpanMapFeature.Hover).toBe(0);
		expect(features & SpanMapFeature.Definition).toBe(0);
		expect(features & SpanMapFeature.References).toBe(SpanMapFeature.References);
	});
});

describe('to_span_mappings', () => {
	it('emits Verbatim for identical text and Atom for changed text', () => {
		const original = 'const a = 1;';
		const generated = 'const a = 1 as const;';
		const spans = to_span_mappings(
			[m(0, 0, 5), m(6, 6, 1), { ...m(10, 10, 1), generatedLengths: [10] }],
			generated,
			original,
		);
		expect(spans).toEqual([
			// `const` and `a` coalesce across the identical ` ` gap and extend over the
			// identical ` ` that follows; the Atom stays apart.
			[0, 8, 0, 8, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
			[10, 10, 10, 1, SpanMapKind.Atom, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
	});

	it('emits Alias for a renamed identifier so diagnostics show the authored name', () => {
		const original = 'let #count = 1;';
		const generated = 'let _$__u0023_count = 1;';
		const spans = to_span_mappings(
			[{ ...m(4, 4, 6), generatedLengths: ['_$__u0023_count'.length] }],
			generated,
			original,
		);
		expect(spans[0][4]).toBe(SpanMapKind.Alias);
		expect(spans[0]).toEqual([
			4,
			15,
			4,
			6,
			SpanMapKind.Alias,
			SpanMapFeature.All & ~SpanMapFeature.Formatting,
		]);
	});

	it('drops a partial-identifier Atom such as the file-start anchor', () => {
		expect(to_span_mappings([m(0, 0, 1)], 'const x = 1;', 'export x;')).toEqual([]);
		// A whole token that changed spelling and length is still an Atom.
		expect(to_span_mappings([{ ...m(0, 0, 2), generatedLengths: [3] }], '/>;', '/>')).toEqual([
			[0, 3, 0, 2, SpanMapKind.Atom, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
	});

	it('coalesces adjacent Verbatim spans with equal features, keeps others apart', () => {
		const text = 'ab';
		expect(
			to_span_mappings([m(0, 0, 1), m(1, 1, 1)], text, text).map((span) => [span[0], span[1]]),
		).toEqual([[0, 2]]);
		expect(
			to_span_mappings([m(0, 0, 1), m(1, 1, 1, { data: verify_only })], text, text).map((span) => [
				span[0],
				span[1],
			]),
		).toEqual([
			[0, 1],
			[1, 1],
		]);
	});

	it('extends a Verbatim span over the identical whitespace that follows it', () => {
		// TypeScript's organize-imports edit ends after the last import's newline;
		// TypeScript 7 drops the whole edit when that position does not map.
		const original = `import a from './a';
import b from './b';

export function C() @{ <a /> }
`;
		const generated = `import a from './a';
import b from './b';

const C__static = <a />;
`;
		const imports = `import a from './a';
import b from './b';`;
		const spans = to_span_mappings(
			[
				{
					sourceOffsets: [0, original.indexOf('<a />')],
					generatedOffsets: [0, generated.indexOf('<a />')],
					lengths: [imports.length, 5],
					generatedLengths: [imports.length, 5],
					data: {
						verification: true,
						completion: true,
						semantic: true,
						navigation: true,
						customData: {},
					},
				},
			],
			generated,
			original,
		);
		// The import span now covers the two newlines after it (the third character,
		// `c` versus `e`, differs), and stops well before the next span.
		expect(spans[0].slice(0, 4)).toEqual([0, imports.length + 2, 0, imports.length + 2]);
		expect(spans[0][4]).toBe(SpanMapKind.Verbatim);
		// A span followed by non-whitespace, or by the next span, is left alone.
		expect(spans[1].slice(0, 4)).toEqual([
			generated.indexOf('<a />'),
			5,
			original.indexOf('<a />'),
			5,
		]);
	});

	it('coalesces token spans of a statement across identical unmapped gaps', () => {
		// The transform maps `import`, `helperA`, `'./lib'` and `;` but not the punctuation
		// between them. Auto-import edits inside the statement are only applied by TypeScript
		// when they fit into one Verbatim span, so the run becomes a single span.
		const text = "import { helperA } from './lib';";
		const spans = to_span_mappings(
			[m(0, 0, 6), m(9, 9, 7), m(24, 24, 7), m(31, 31, 1)],
			text,
			text,
		);
		expect(spans).toEqual([
			[0, 32, 0, 32, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
	});

	it('does not coalesce across gaps whose text differs or whose lengths differ', () => {
		const original = 'a + b';
		const generated = 'a - b';
		expect(to_span_mappings([m(0, 0, 1), m(4, 4, 1)], generated, original)).toHaveLength(2);
		expect(to_span_mappings([m(0, 0, 1), m(4, 3, 1)], 'a +b', original)).toHaveLength(2);
		// Original ranges may be projected twice; a second projection never merges backwards.
		expect(to_span_mappings([m(0, 0, 1), m(0, 2, 1)], 'a a', 'a')).toHaveLength(2);
	});

	it('drops zero-length spans and spans outside either text', () => {
		const text = 'abc';
		const spans = to_span_mappings(
			[m(0, 0, 0), m(5, 0, 1), m(0, 5, 1), { ...m(0, 0, 1), generatedLengths: [0] }, m(1, 1, 1)],
			text,
			text,
		);
		expect(spans).toEqual([
			[1, 1, 1, 1, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
	});

	it('prefers narrow token spans over the container spans that enclose them', () => {
		const original = 'if (x) { y }';
		const generated = 'if (x) { y }';
		const spans = to_span_mappings(
			[
				{ ...m(0, 0, generated.length), data: verify_only },
				m(4, 4, 1),
				{ ...m(7, 7, 5), data: verify_only },
				m(9, 9, 1),
			],
			generated,
			original,
		);
		// The verify-only containers lose to the tokens they enclose; the two tokens then
		// coalesce across the identical `) { ` gap into one span carrying the token features.
		expect(spans).toEqual([
			[4, 7, 4, 7, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
	});

	it('keeps container-only regions unmapped when tokens have different features', () => {
		const text = 'if (x) { y }';
		const spans = to_span_mappings(
			[
				{ ...m(0, 0, text.length), data: verify_only },
				m(4, 4, 1),
				m(9, 9, 1, { data: verify_only }),
			],
			text,
			text,
		);
		expect(spans.map((span) => [span[0], span[1], span[5]])).toEqual([
			[4, 1, SpanMapFeature.All & ~SpanMapFeature.Formatting],
			[9, 2, SpanMapFeature.None],
		]);
		for (let index = 1; index < spans.length; index++) {
			expect(spans[index][0]).toBeGreaterThanOrEqual(spans[index - 1][0] + spans[index - 1][1]);
		}
	});

	it('allows one original range to be projected several times', () => {
		const original = 'x';
		const generated = 'x + x';
		const spans = to_span_mappings([m(0, 0, 1), m(0, 4, 1)], generated, original);
		expect(spans).toHaveLength(2);
		expect(spans[0][2]).toBe(0);
		expect(spans[1][2]).toBe(0);
	});

	it('works with CRLF line endings, astral characters and non-ASCII text before a span', () => {
		const original = 'const é = "😀";\r\nconst 名 = é;';
		const generated = original;
		const name_offset = original.indexOf('名');
		const spans = to_span_mappings(
			[m(name_offset, name_offset, 1), m(6, 6, 1)],
			generated,
			original,
		);
		// Identical text on both sides, so the two tokens coalesce over the CRLF and the emoji;
		// offsets are UTF-16 code units (the emoji occupies two).
		expect(original.indexOf('\r\n')).toBe(15);
		expect(name_offset).toBe(23);
		expect(spans).toEqual([
			[6, 19, 6, 19, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
		const apart = to_span_mappings(
			[m(name_offset, name_offset, 1), m(6, 6, 1, { data: verify_only })],
			generated,
			original,
		);
		// Each token still extends over the identical space that follows it.
		expect(apart.map((span) => [span[0], span[1]])).toEqual([
			[6, 2],
			[name_offset, 2],
		]);
	});

	it('clears every feature bit when language features are disabled', () => {
		const spans = to_span_mappings([m(0, 0, 1)], 'a', 'a', { languageFeatures: false });
		expect(spans[0][5]).toBe(SpanMapFeature.None);
	});

	it('handles multi-offset Volar mappings', () => {
		const text = 'ab';
		const spans = to_span_mappings(
			[
				{
					sourceOffsets: [0, 1],
					generatedOffsets: [0, 1],
					lengths: [1, 1],
					generatedLengths: [1, 1],
					data: all,
				},
			],
			text,
			text,
		);
		expect(spans).toEqual([
			[0, 2, 0, 2, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
		]);
	});
});
