import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { TSRXVirtualCode } from '../src/language.js';
import { embed_script_bodies_in_service_script } from '../src/transform.js';

/** @param {string} source */
function create_snapshot(source) {
	return ts.ScriptSnapshot.fromString(source);
}

/**
 * @param {string} generated
 * @param {Array<{ start: number, content: string }>} scripts
 */
function fake_compiler(generated, scripts) {
	return {
		/**
		 * @param {string} _code
		 */
		compile_to_volar_mappings(_code) {
			return {
				code: generated,
				mappings: [],
				cssMappings: [],
				scriptMappings: scripts.map((script, index) => ({
					sourceOffsets: [script.start],
					generatedOffsets: [0],
					lengths: [script.content.length],
					generatedLengths: [script.content.length],
					data: {
						customData: { embeddedId: `script_${index}`, content: script.content },
					},
				})),
				errors: [],
				sourceAst: null,
			};
		},
	};
}

describe('embed_script_bodies_in_service_script', () => {
	it('appends each body as an isolated function and maps it back to the source', () => {
		const first = 'const a: number = 1 < 2;';
		const second = 'const b = "ok";';
		/** @type {import('@tsrx/core/types').CodeMapping[]} */
		const mappings = [];
		const text = embed_script_bodies_in_service_script(
			'export default <script></script>;',
			mappings,
			[
				{ id: 'script_0', start: 10, length: first.length, content: first },
				{ id: 'script_1', start: 40, length: second.length, content: second },
			],
		);

		expect(text).toContain(first);
		expect(text).toContain(second);
		expect(text).toMatch(/;void function\(\) \{\nconst a: number = 1 < 2;\n\};/);
		expect(mappings).toHaveLength(2);
		expect(
			text.slice(mappings[0].generatedOffsets[0], mappings[0].generatedOffsets[0] + first.length),
		).toBe(first);
		expect(mappings[0].sourceOffsets[0]).toBe(10);
		expect(mappings[1].sourceOffsets[0]).toBe(40);
		expect(mappings[0].data.verification).toBe(true);
		expect(mappings[0].data.completion).toBe(true);
	});

	it('skips empty bodies and does not change the text when there are none', () => {
		/** @type {import('@tsrx/core/types').CodeMapping[]} */
		const mappings = [];
		const text = 'export default <div />;\n';
		expect(
			embed_script_bodies_in_service_script(text, mappings, [
				{ id: 'script_0', start: 0, length: 0, content: '' },
			]),
		).toBe(text);
		expect(mappings).toEqual([]);
	});
});

describe('TSRXVirtualCode script-body service script', () => {
	const source = '<script>const n: number = 1 < 2;</script>';
	const body = 'const n: number = 1 < 2;';
	const generated = 'export default <script></script>;';
	const compiler = fake_compiler(generated, [{ start: source.indexOf(body), content: body }]);

	it('leaves script bodies out of the generated TSX by default (language-server extra scripts)', () => {
		const virtual_code = new TSRXVirtualCode(
			'/virtual/App.tsrx',
			create_snapshot(source),
			compiler,
		);
		expect(virtual_code.generatedCode).toBe(generated);
		expect(virtual_code.generatedCode).not.toContain(body);
	});

	it('embeds script bodies in the service script when the tsserver plugin asks for it', () => {
		const virtual_code = new TSRXVirtualCode(
			'/virtual/App.tsrx',
			create_snapshot(source),
			compiler,
			undefined,
			{ embedScriptBodiesInServiceScript: true },
		);
		expect(virtual_code.generatedCode).toContain(body);
		expect(virtual_code.generatedCode.startsWith(generated)).toBe(true);
		const mapping = virtual_code.mappings.find(
			(entry) => entry.sourceOffsets[0] === source.indexOf(body),
		);
		expect(mapping).toBeDefined();
		expect(
			virtual_code.generatedCode.slice(
				/** @type {import('@tsrx/core/types').CodeMapping} */ (mapping).generatedOffsets[0],
				/** @type {import('@tsrx/core/types').CodeMapping} */ (mapping).generatedOffsets[0] +
					body.length,
			),
		).toBe(body);
	});
});
