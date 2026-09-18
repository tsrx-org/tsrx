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
			[0, 5, 0, 5, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
			[6, 1, 6, 1, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
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

	it('does not alias a partial token such as the file-start anchor', () => {
		const spans = to_span_mappings([m(0, 0, 1)], 'const x = 1;', 'export x;');
		expect(spans[0][4]).toBe(SpanMapKind.Atom);
	});

	it('keeps adjacent spans and exact boundaries', () => {
		const text = 'ab';
		const spans = to_span_mappings([m(0, 0, 1), m(1, 1, 1)], text, text);
		expect(spans.map((span) => [span[0], span[1]])).toEqual([
			[0, 1],
			[1, 1],
		]);
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
		expect(spans.map((span) => [span[0], span[1]])).toEqual([
			[4, 1],
			[9, 1],
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
		expect(spans).toEqual([
			[6, 1, 6, 1, SpanMapKind.Verbatim, SpanMapFeature.All & ~SpanMapFeature.Formatting],
			[
				name_offset,
				1,
				name_offset,
				1,
				SpanMapKind.Verbatim,
				SpanMapFeature.All & ~SpanMapFeature.Formatting,
			],
		]);
		// Offsets are UTF-16 code units: the emoji occupies two.
		expect(original.indexOf('\r\n')).toBe(15);
		expect(name_offset).toBe(23);
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
		expect(spans).toHaveLength(2);
	});
});
