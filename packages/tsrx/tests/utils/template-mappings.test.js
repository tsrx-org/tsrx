import { print } from 'esrap';
import { expect, it } from 'vitest';
import { createVolarMappingsResult, parseModule } from '../../src/index.js';
import { tsx_with_ts_locations } from '../../src/transform/jsx/helpers.js';
import * as b from '../../src/utils/builders.js';

it('maps every projection of a template even when parent and token markers coincide', () => {
	const source = 'css`before ${x+y} after`;';
	const original = parseModule(source, 'App.tsrx', { keywordTokens: true, preserveParens: true });
	const ast = { ...original, body: [...original.body, ...original.body] };
	const output = print(ast, tsx_with_ts_locations(true, undefined, null, source), {
		sourceMapSource: 'App.tsrx',
		sourceMapContent: source,
	});
	const result = createVolarMappingsResult({
		ast,
		ast_from_source: original,
		source,
		generated_code: output.code,
		source_map: output.map,
	});
	for (const text of ['`before ${', '} after`', 'x', 'y']) {
		const first = result.code.indexOf(text);
		const second = result.code.indexOf(text, first + text.length);
		expect(first).toBeGreaterThanOrEqual(0);
		expect(second).toBeGreaterThan(first);
		expect(
			result.mappings
				.filter(
					(mapping) =>
						mapping.sourceOffsets[0] === source.indexOf(text) &&
						mapping.lengths[0] === text.length &&
						mapping.generatedLengths[0] === text.length,
				)
				.map((mapping) => mapping.generatedOffsets[0]),
		).toEqual([first, second]);
	}
});

it('preserves authored template spelling while leaving replacement text unmapped', () => {
	const source = 'css`before\r\n${x+y} after`;';
	const original = parseModule(source, 'App.tsrx', { keywordTokens: true, preserveParens: true });
	const statement = original.body[0];
	if (
		statement.type !== 'ExpressionStatement' ||
		statement.expression.type !== 'TaggedTemplateExpression'
	) {
		throw new Error('Expected a tagged template');
	}
	const tagged = statement.expression;
	const ast = {
		...original,
		body: [
			{
				...statement,
				expression: {
					...tagged,
					quasi: {
						...tagged.quasi,
						quasis: [tagged.quasi.quasis[0], b.quasi(' replacement', true)],
					},
				},
			},
		],
	};
	const output = print(ast, tsx_with_ts_locations(true, undefined, null, source), {
		sourceMapSource: 'App.tsrx',
		sourceMapContent: source,
	});
	const result = createVolarMappingsResult({
		ast,
		ast_from_source: original,
		source,
		generated_code: output.code,
		source_map: output.map,
	});
	expect(result.code).toBe('css`before\r\n${x + y} replacement`;');
	const head = '`before\r\n${';
	expect(result.mappings).toContainEqual(
		expect.objectContaining({
			sourceOffsets: [source.indexOf(head)],
			generatedOffsets: [result.code.indexOf(head)],
			lengths: [head.length],
			generatedLengths: [head.length],
		}),
	);
	const tail = result.code.indexOf('} replacement`');
	expect(
		result.mappings.filter(
			(mapping) =>
				mapping.generatedOffsets[0] >= tail &&
				mapping.generatedOffsets[0] < tail + '} replacement`'.length,
		),
	).toEqual([]);
});
