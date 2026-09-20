import { describe, expect, it } from 'vitest';
import {
	blank_export_syntax,
	embed_script_bodies,
	find_import_declarations,
} from '../src/transform.js';

/** @param {string} content */
const region = (content, start = 100) => ({
	id: 'script_0',
	start,
	length: content.length,
	content,
});

describe('<script> bodies embedded as blocks', () => {
	it('appends the body as a block mapped one to one', () => {
		const body = 'const n: number = 1 < 2 ? 3 : 4;';
		const { text, mappings } = embed_script_bodies('const x = 1;', [], [region(body)]);
		expect(text).toBe('const x = 1;\n;{\n' + body + '\n}\n');
		expect(mappings).toHaveLength(1);
		const [mapping] = mappings;
		expect(mapping.sourceOffsets).toEqual([100]);
		expect(mapping.lengths).toEqual([body.length]);
		expect(text.slice(mapping.generatedOffsets[0], mapping.generatedOffsets[0] + body.length)).toBe(
			body,
		);
		expect(mapping.data.customData?.embeddedId).toBe('script_0');
	});

	it('hoists import declarations to module level in front of the block, each mapped', () => {
		const body = [
			"import a from './a.js';",
			"import { b, c as d } from 'https://cdn.example/x.js';",
			"import type { T } from './t';",
			'const n: number = a + b;',
		].join('\n');
		expect(find_import_declarations(body).map(({ start, end }) => body.slice(start, end))).toEqual([
			"import a from './a.js';",
			"import { b, c as d } from 'https://cdn.example/x.js';",
			"import type { T } from './t';",
		]);
		const { text, mappings } = embed_script_bodies('', [], [region(body)]);
		const block = text.indexOf(';{\n');
		for (const statement of [
			"import a from './a.js';",
			"import { b, c as d } from 'https://cdn.example/x.js';",
			"import type { T } from './t';",
		]) {
			const at = text.indexOf(statement);
			expect(at).toBeGreaterThan(-1);
			expect(at).toBeLessThan(block);
			// Each hoisted import is one mapped segment.
			const index = mappings[0].generatedOffsets.indexOf(at);
			expect(index).toBeGreaterThanOrEqual(0);
			expect(body.slice(mappings[0].sourceOffsets[index] - 100).startsWith(statement)).toBe(true);
		}
		// Their place inside the block is blanked; the last statement keeps its column.
		expect(text.slice(block)).toContain('\nconst n: number = a + b;\n}\n');
		expect(text.slice(block)).not.toContain('import');
	});

	it('turns export syntax into valid, same-length code (nothing can import an inline script) and keeps await', () => {
		const body = [
			"export { helper } from './helper.js';",
			"export * as ns from './ns.js';",
			'export const value = 1;',
			'export async function run() {}',
			'export default function () {}',
			'export default class {}',
			'export default function Foo() {}',
			'export default async function Bar() {}',
			'export default class Baz {}',
			'export default abstract class Qux {}',
			'export default class extends Base {}',
			'export default value;',
			'export { value as alias };',
			'export type { T };',
			'const r = await Promise.resolve(value);',
			'const foo = Foo;',
			'const baz: Baz = new Baz();',
		].join('\n');
		const blanked = blank_export_syntax(body);
		expect(blanked).toHaveLength(body.length);
		for (const [original, expected] of [
			[
				"export { helper } from './helper.js';",
				' '.repeat("export { helper } from './helper.js';".length),
			],
			["export * as ns from './ns.js';", ' '.repeat("export * as ns from './ns.js';".length)],
			['export const value = 1;', '       const value = 1;'],
			['export async function run() {}', '       async function run() {}'],
			['export default function () {}', 'const _default=function () {}'],
			['export default class {}', 'const _default=class {}'],
			['export default function Foo() {}', '               function Foo() {}'],
			['export default async function Bar() {}', '               async function Bar() {}'],
			['export default class Baz {}', '               class Baz {}'],
			['export default abstract class Qux {}', '               abstract class Qux {}'],
			['export default class extends Base {}', 'const _default=class extends Base {}'],
			['export default value;', 'const _default=value;'],
			['export { value as alias };', ' '.repeat('export { value as alias };'.length)],
			['export type { T };', ' '.repeat('export type { T };'.length)],
			['const r = await Promise.resolve(value);', 'const r = await Promise.resolve(value);'],
			['const foo = Foo;', 'const foo = Foo;'],
			['const baz: Baz = new Baz();', 'const baz: Baz = new Baz();'],
		]) {
			expect(blanked.split('\n')).toContain(expected);
			expect(original.length).toBe(expected.length);
		}
		// Extra whitespace in the keywords is absorbed by the binding name.
		expect(blank_export_syntax('export   default   x;')).toBe('const _default____=x;');
		// Named default declarations keep their binding when the keywords grow.
		expect(blank_export_syntax('export   default   function Foo() {}')).toBe(
			'                   function Foo() {}',
		);
		const { text } = embed_script_bodies('', [], [region(body)]);
		expect(text).not.toContain('export');
		expect(text).toContain('const r = await Promise.resolve(value);');
	});

	it('skips empty bodies and bodies whose content and length disagree', () => {
		expect(embed_script_bodies('x', [], [region('')]).text).toBe('x');
		expect(
			embed_script_bodies('x', [], [{ id: 'script_0', start: 0, length: 3, content: 'abcd' }]).text,
		).toBe('x');
	});
});
