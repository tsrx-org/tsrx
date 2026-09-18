import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { create_native_workspace, parse_tsc_output, run_native_tsc } from './fixture-utils.js';

/**
 * A minimal third-party TSRX compiler: it treats the file as TSX and rewrites
 * `#name` identifiers to `_$__u0023_name`, the way TSRX obfuscates sigil
 * identifiers, emitting one mapping per token so the renamed spans become
 * `Alias` spans.
 */
const stub_compiler = `
const data = { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: false, customData: {} };
exports.compile_to_volar_mappings = function compile_to_volar_mappings(source, filename) {
	let code = '';
	const mappings = [];
	let last = 0;
	const pattern = /#([A-Za-z_$][\\w$]*)/g;
	let match;
	const push = (source_start, source_length, generated_start, generated_length) => {
		if (source_length === 0 || generated_length === 0) return;
		mappings.push({
			sourceOffsets: [source_start],
			generatedOffsets: [generated_start],
			lengths: [source_length],
			generatedLengths: [generated_length],
			data,
		});
	};
	while ((match = pattern.exec(source)) !== null) {
		push(last, match.index - last, code.length, match.index - last);
		code += source.slice(last, match.index);
		const generated = '_$__u0023_' + match[1];
		push(match.index, match[0].length, code.length, generated.length);
		code += generated;
		last = match.index + match[0].length;
	}
	push(last, source.length - last, code.length, source.length - last);
	code += source.slice(last);
	return { code, mappings, cssMappings: [], scriptMappings: [], errors: [], sourceAst: { type: 'Program', body: [], sourceType: 'module' } };
};
`;

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * @param {Record<string, string>} files
 */
function workspace(files) {
	const created = create_native_workspace(files, { dependencies: [] });
	cleanups.push(created.cleanup);
	const stub_dir = path.join(created.dir, 'node_modules', 'tsrx-stub-compiler');
	fs.mkdirSync(stub_dir, { recursive: true });
	fs.writeFileSync(
		path.join(stub_dir, 'package.json'),
		JSON.stringify({ name: 'tsrx-stub-compiler', version: '1.0.0', main: 'index.cjs' }),
	);
	fs.writeFileSync(path.join(stub_dir, 'index.cjs'), stub_compiler);
	return created.dir;
}

const tsconfig = JSON.stringify({
	compilerOptions: {
		module: 'ESNext',
		moduleResolution: 'Bundler',
		allowImportingTsExtensions: true,
		target: 'ES2022',
		lib: ['ES2022'],
		strict: true,
		skipLibCheck: true,
		types: [],
		noEmit: true,
	},
	include: ['main.ts'],
});

describe('third-party compiler', () => {
	it('is selected through the mapper entry options and its Alias spans surface authored names', () => {
		const dir = workspace({
			'tsconfig.json': tsconfig,
			'tsconfig.native.json': JSON.stringify({
				extends: './tsconfig.json',
				contentMappers: [
					{
						package: '@tsrx/content-mapper',
						extensions: ['.tsrx'],
						options: { compiler: 'tsrx-stub-compiler' },
					},
				],
			}),
			'Thing.tsrx':
				'export const #value = 1;\nexport const copy = #value;\nexport const missing = #nope;\n',
			'main.ts': "import { copy } from './Thing.tsrx';\nexport const n: string = copy;\n",
		});
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		const diagnostics = parse_tsc_output(result.output);
		expect(diagnostics).toEqual([
			{
				file: 'Thing.tsrx',
				line: 3,
				column: 24,
				code: 'TS2304',
				message: "Cannot find name '#nope'.",
			},
			{
				file: 'main.ts',
				line: 2,
				column: 14,
				code: 'TS2322',
				message: "Type 'number' is not assignable to type 'string'.",
			},
		]);
		expect(result.status).toBe(2);
	});

	it('is selected through the tsconfig tsrx.compiler field when the mapper entry has no options', () => {
		const dir = workspace({
			'tsconfig.json': tsconfig.replace('{', '{"tsrx":{"compiler":"tsrx-stub-compiler"},'),
			'tsconfig.native.json': JSON.stringify({
				extends: './tsconfig.json',
				contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }],
			}),
			'Thing.tsrx': 'export const value: number = 1;\n',
			'main.ts': "import { value } from './Thing.tsrx';\nexport const n: number = value;\n",
		});
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		expect(result.output).toBe('');
		expect(result.status).toBe(0);
	});
});
