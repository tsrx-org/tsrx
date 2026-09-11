import { decode, encode } from '@jridgewell/sourcemap-codec';
import { describe, expect, it } from 'vitest';
import {
	createPlatformDefinitions,
	parseModule,
	replacePlatformFlags,
	specializePlatform,
} from '../../src/index.js';

describe('platform specialization', () => {
	it('is copy-on-write and retains the selected original statement', () => {
		const ast = parseModule(
			`if (import.meta.env.platform.web) {
				const selected = 'web';
			} else {
				const selected = 'native';
			}`,
			'App.tsrx',
		);
		const original_if = ast.body[0];
		if (original_if.type !== 'IfStatement') throw new Error('expected IfStatement');

		const specialized = specializePlatform(ast, 'web', 'App.tsrx');

		expect(specialized).not.toBe(ast);
		expect(specialized.body[0]).toBe(original_if.consequent);
		expect(ast.body[0]).toBe(original_if);
		expect(ast.body[0].type).toBe('IfStatement');
	});

	it('returns an unguarded program unchanged', () => {
		const ast = parseModule('if (ready) consume();', 'App.tsrx');
		expect(specializePlatform(ast, 'web', 'App.tsrx')).toBe(ast);
	});

	it('recognizes only exact, non-computed property paths', () => {
		const ast = parseModule(
			`if (import.meta.env.platform['web']) consume('computed');
			if (!import.meta.env.platform.web) consume('negated');`,
			'App.tsrx',
		);
		const specialized = specializePlatform(ast, 'web', 'App.tsrx');

		expect(specialized).toBe(ast);
	});

	it('creates exactly one true boolean definition', () => {
		expect(createPlatformDefinitions('android')).toEqual({
			'import.meta.env.platform.web': false,
			'import.meta.env.platform.ios': false,
			'import.meta.env.platform.android': true,
		});
	});

	it('replaces exact flags without touching strings or comments', () => {
		const source = `// import.meta.env.platform.web
			const label = 'import.meta.env.platform.ios';
			const active = import.meta.env.platform.android;`;
		const result = replacePlatformFlags(source, 'flags.ts', 'android');

		expect(result.code).toContain('// import.meta.env.platform.web');
		expect(result.code).toContain("'import.meta.env.platform.ios'");
		expect(result.code).toContain('const active = true;');
		expect(result.map.sources).toEqual(['flags.ts']);
		expect(result.map.sourcesContent?.[0]).toBe(source);
	});

	it('preserves an incoming map when there is nothing to rewrite', () => {
		const source = 'export const ready = true;';
		const incoming = {
			version: 3,
			file: 'App.js',
			sources: ['App.tsrx'],
			sourcesContent: ['export function App() @{ true }'],
			names: [],
			mappings: 'AAAA',
		};

		const result = replacePlatformFlags(source, 'App.tsrx', 'web', incoming);

		expect(result.code).toBe(source);
		expect(result.map).toBe(incoming);
	});

	it('composes rewritten output through an incoming compile map', () => {
		const intermediate = 'const active = import.meta.env.platform.android;\n';
		const original = 'const active = PLATFORM_FLAG;\n';
		const incoming = {
			version: 3,
			file: 'App.js',
			sources: ['App.tsrx'],
			sourcesContent: [original],
			names: [],
			mappings: encode([[[0, 0, 3, 5]]]),
		};

		const result = replacePlatformFlags(intermediate, 'App.tsrx', 'android', incoming);

		expect(result.code).toContain('const active = true;');
		expect(result.map.sources).toEqual(['App.tsrx']);
		expect(result.map.sourcesContent).toEqual([original]);
		expect(
			decode(result.map.mappings)
				.flat()
				.some((segment) => segment.length >= 4 && segment[2] === 3 && segment[3] === 5),
		).toBe(true);
	});
});
