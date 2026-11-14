import { encode } from '@jridgewell/sourcemap-codec';
import { describe, expect, it } from 'vitest';
import {
	build_line_offsets,
	build_src_to_gen_map,
	get_mapping_from_node,
} from '../../src/source-map-utils.js';

/** @param {number[][][]} decoded_mappings */
function source_map(decoded_mappings) {
	return {
		version: 3,
		file: 'generated.js',
		sources: ['source.tsrx'],
		names: [],
		mappings: encode(
			/** @type {Parameters<typeof encode>[0]} */ (/** @type {unknown} */ (decoded_mappings)),
		),
	};
}

describe('source map lookup construction', () => {
	it('keeps ordered forward and source-line lookups without dead payloads', () => {
		const generated_code = 'abc def\nghi';
		const [source_to_generated, generated_to_source, source_line_generated] = build_src_to_gen_map(
			source_map([
				[
					[0, 0, 0, 0],
					[4, 0, 0, 0],
				],
				[[0, 0, 1, 2]],
			]),
			new Map(),
			build_line_offsets(generated_code),
			generated_code,
			true,
		);

		expect(source_to_generated.get('1:0')).toEqual([
			{ line: 1, column: 0 },
			{ line: 1, column: 4 },
		]);
		expect(source_to_generated.get('2:2')).toEqual([{ line: 2, column: 0 }]);
		expect(generated_to_source).toBeNull();
		expect(
			Array.from(source_line_generated?.entries() ?? [], ([line, positions]) => [
				line,
				positions.map(({ column, position }) => [column, position.line, position.column]),
			]),
		).toEqual([
			[
				1,
				[
					[0, 1, 0],
					[0, 1, 4],
				],
			],
			[2, [[2, 2, 0]]],
		]);
	});

	it.each([
		{
			name: 'positive',
			generated_code: 'Xabc def',
			mappings: [
				[
					[0, 0, 0, 0],
					[4, 0, 0, 1],
				],
			],
			change: { offset: 0, delta: 1 },
			expected: [
				{ line: 1, column: 1 },
				{ line: 1, column: 5 },
			],
		},
		{
			name: 'negative',
			generated_code: 'abc def',
			mappings: [
				[
					[1, 0, 0, 0],
					[5, 0, 0, 1],
				],
			],
			change: { offset: 0, delta: -1 },
			expected: [
				{ line: 1, column: 0 },
				{ line: 1, column: 4 },
			],
		},
	])('applies $name post-processing adjustments at segment boundaries', (fixture) => {
		const [source_to_generated] = build_src_to_gen_map(
			source_map(fixture.mappings),
			new Map([[1, fixture.change]]),
			build_line_offsets(fixture.generated_code),
			fixture.generated_code,
		);

		expect([
			...(source_to_generated.get('1:0') ?? []),
			...(source_to_generated.get('1:1') ?? []),
		]).toEqual(fixture.expected);
	});

	it('ignores empty mappings and generated-only segments', () => {
		const [source_to_generated, generated_to_source, source_line_generated] = build_src_to_gen_map(
			source_map([[[0]], []]),
			new Map(),
			build_line_offsets('generated\n'),
			'generated\n',
		);

		expect(source_to_generated.size).toBe(0);
		expect(generated_to_source).toBeNull();
		expect(source_line_generated).toBeNull();
	});
});

describe('the generated start of a node (#1321)', () => {
	// esrap records the position right after a block's `{` before the line break
	// and indent it prints, so a statement that starts right after the `{` in the
	// source has two generated positions: `{|` and `\t|user`.
	const generated_code = '{\n\tuser;\n}';
	const [source_to_generated] = build_src_to_gen_map(
		source_map([
			[[1, 0, 0, 1]],
			[
				[1, 0, 0, 1],
				[5, 0, 0, 5],
			],
		]),
		new Map(),
		build_line_offsets(generated_code),
		generated_code,
	);
	const line_offsets = build_line_offsets(generated_code);

	it('is where its text starts, not the end of the line before it', () => {
		const node = /** @type {Parameters<typeof get_mapping_from_node>[0]} */ (
			/** @type {unknown} */ ({
				type: 'Identifier',
				name: 'user',
				start: 1,
				end: 5,
				loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 5 } },
			})
		);
		const mapping = get_mapping_from_node(node, source_to_generated, line_offsets);
		expect(mapping.generatedOffsets).toEqual([3]);
		expect(mapping.generatedLengths).toEqual([4]);
	});

	it('gives an empty node there an empty range, not a negative one', () => {
		const node = /** @type {Parameters<typeof get_mapping_from_node>[0]} */ (
			/** @type {unknown} */ ({
				type: 'Identifier',
				name: '',
				start: 1,
				end: 1,
				loc: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
			})
		);
		const mapping = get_mapping_from_node(node, source_to_generated, line_offsets);
		expect(mapping.generatedOffsets).toEqual([3]);
		expect(mapping.generatedLengths).toEqual([0]);
	});
});
