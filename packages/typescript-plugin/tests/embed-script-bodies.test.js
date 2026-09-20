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

	it('blanks export syntax in place (nothing can import an inline script) and keeps await', () => {
		const body = [
			"export { helper } from './helper.js';",
			'export const value = 1;',
			'export default value;',
			'export { value as alias };',
			'const r = await Promise.resolve(value);',
		].join('\n');
		const blanked = blank_export_syntax(body);
		expect(blanked).toHaveLength(body.length);
		expect(blanked.split('\n')).toEqual([
			' '.repeat("export { helper } from './helper.js';".length),
			'       const value = 1;',
			'               value;',
			'       { value as alias };',
			'const r = await Promise.resolve(value);',
		]);
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
