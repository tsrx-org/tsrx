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

	it('declares every var an inactive branch hoists, without locations', () => {
		const ast = parseModule(
			`function read(o, xs) {
				if (import.meta.env.platform.web) {
					for (var i = 0; i < 1; i++) { var in_for; }
					for (var key in o) {}
					for (var { x, y: [z = 1, ...rest] } of xs) {}
					while (o) { var in_while; }
					do { var in_do; } while (o);
					label: { var in_label; }
					try { var in_try; } catch (e) { var in_catch; } finally { var in_finally; }
					switch (o) { case 1: var in_case; default: { var in_default; } }
					if (o) var in_if; else var in_else;
					let not_let;
					const not_const = 1;
					function not_function() { var in_function; }
					class NotClass { static { var in_static; } method() { var in_method; } }
					const not_arrow = () => { var in_arrow; };
				}
			}`,
			'App.tsrx',
		);

		const specialized = specializePlatform(ast, 'ios', 'App.tsrx');
		const read = specialized.body[0];
		if (read.type !== 'FunctionDeclaration') throw new Error('expected FunctionDeclaration');
		const [declaration] = read.body.body;
		if (declaration.type !== 'VariableDeclaration') throw new Error('expected VariableDeclaration');

		expect(read.body.body).toHaveLength(1);
		expect(declaration.kind).toBe('var');
		expect(declaration.loc).toBeUndefined();
		expect(
			declaration.declarations.map((declarator) => {
				expect(declarator.init).toBeUndefined();
				expect(declarator.id.loc).toBeUndefined();
				return declarator.id.type === 'Identifier' ? declarator.id.name : null;
			}),
		).toEqual([
			'i',
			'in_for',
			'key',
			'x',
			'z',
			'rest',
			'in_while',
			'in_do',
			'in_label',
			'in_try',
			'in_catch',
			'in_finally',
			'in_case',
			'in_default',
			'in_if',
			'in_else',
		]);
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
