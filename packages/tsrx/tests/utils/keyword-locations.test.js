import { decode } from '@jridgewell/sourcemap-codec';
import { print } from 'esrap';
import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';
import { tsx_with_ts_locations } from '../../src/transform/jsx/helpers.js';

/**
 * A `return` the compiler builds with the location of other code maps no
 * keyword end (#1391). The printer reads the source at the node's location,
 * so this holds for a node without `start` (a platform's own nodes), and for a
 * name that only begins with `return`.
 */
describe('a printed `return` with the location of other code (#1391)', () => {
	const source = 'returnValue;\nreturn𐐀;\nreturn\\u0056alue;\n<a />;\n';
	// The names, and the element, whose locations the `return`s take.
	const donors = parseModule(source, 'App.tsrx')
		.body.filter((statement) => statement.type !== 'EmptyStatement')
		.map((statement) =>
			statement.type === 'ExpressionStatement'
				? statement.expression
				: /** @type {any} */ (statement),
		);

	/**
	 * The source positions the printed map has, as `line:column`.
	 * @param {boolean} with_start
	 */
	const mapped_positions = (with_start) => {
		/** @type {any} */
		const program = {
			type: 'Program',
			sourceType: 'module',
			body: donors.map((donor) => ({
				type: 'FunctionDeclaration',
				id: { type: 'Identifier', name: 'f' },
				params: [],
				body: {
					type: 'BlockStatement',
					body: [
						{
							type: 'ReturnStatement',
							argument: { type: 'Identifier', name: 'x' },
							loc: donor.loc,
							...(with_start ? { start: donor.start, end: donor.end } : {}),
						},
					],
				},
			})),
		};
		const { map } = print(program, tsx_with_ts_locations(false, undefined, null, source), {
			sourceMapSource: 'App.tsrx',
			sourceMapContent: source,
		});
		return new Set(
			decode(map.mappings).flatMap((segments) =>
				segments.flatMap((segment) =>
					segment.length === 1 ? [] : [`${segment[2] + 1}:${segment[3]}`],
				),
			),
		);
	};

	it.each([
		['with', true],
		['without', false],
	])('maps no keyword end into the code it has the location of, %s `start`', (_, with_start) => {
		const positions = mapped_positions(with_start);
		for (const donor of donors) {
			const { line, column } = donor.loc.start;
			expect(positions.has(`${line}:${column}`), source.slice(donor.start, donor.end)).toBe(true);
			expect(positions.has(`${line}:${column + 'return'.length}`), donor.type).toBe(false);
		}
	});
});
