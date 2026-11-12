import { decode, encode } from '@jridgewell/sourcemap-codec';
import { describe, expect, it } from 'vitest';
import {
	createJsxTransform,
	createPlatformDefinitions,
	createVolarMappingsResult,
	mergePlatformDefinitions,
	parseModule,
	replacePlatformFlags,
	specializePlatform,
	withPlatformTypes,
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

	describe('module marker of the platform types', () => {
		/** @type {import('../../types/index').JsxPlatform} */
		const platform = {
			name: 'marker',
			imports: { fragment: 'p', suspense: 'p', dynamic: 'p/d', errorBoundary: 'p/e' },
			jsx: { rewriteClassAttr: false, classAttrName: 'class' },
			validation: { requireUseServerForAwait: false },
		};

		/**
		 * The platform types appended to the type-only output of `source`.
		 * @param {string} source
		 * @param {import('../../types/index').JsxPlatform} [target]
		 */
		const types = (source, target = platform) => {
			/** @type {any[]} */
			const errors = [];
			/** @type {any[]} */
			const comments = [];
			let ast = parseModule(source, 'App.tsrx', { loose: true, errors, comments });
			ast = specializePlatform(ast, 'web', 'App.tsrx', { errors, comments });
			const transformed = createJsxTransform(target)(ast, source, 'App.tsrx', {
				collect: true,
				loose: true,
				typeOnly: true,
				errors,
				comments,
			});
			const result = createVolarMappingsResult({
				ast: transformed.ast,
				ast_from_source: ast,
				source,
				generated_code: transformed.code,
				source_map: transformed.map,
				errors,
			});
			const code = withPlatformTypes(result, 'web', transformed.ast).code;
			return code.slice(transformed.code.length);
		};
		const flag = 'const web = import.meta.env.platform.web;\n';

		it('is added to a module without imports or exports', () => {
			expect(types(flag)).toMatch(/^\nexport \{\};\ndeclare global \{/);
		});

		it.each([
			"import { a } from './a';",
			"import './side-effect';",
			'export const value = 1;',
			'export default function App() {}',
			"export * from './a';",
			'export {};',
		])('is left out after %s', (statement) => {
			expect(types(`${statement}\n${flag}`)).toMatch(/^\ndeclare global \{/);
		});

		it('is added when the transform lowers the only import to an import alias', () => {
			// `serverModule` turns `import { value } from 'server'` into
			// `import value = server.value`, which does not make a file a module.
			const source = `module server {\n\texport const value = 1;\n}\nimport { value } from 'server';\nfunction f() {\n\tif (import.meta.env.platform.web) {\n\t\treturn value;\n\t}\n\treturn 0;\n}\n`;
			expect(
				types(source, {
					...platform,
					serverModule: { blockName: 'server', importSpecifier: 'server' },
				}),
			).toMatch(/^\nexport \{\};\ndeclare global \{/);
		});

		it('is added without the generated program', () => {
			const result = withPlatformTypes(
				{
					code: '',
					mappings: [],
					cssMappings: [],
					scriptMappings: [],
					errors: [],
					sourceAst: parseModule(`import { a } from './a';\n${flag}`, 'App.tsrx'),
				},
				'web',
			);
			expect(result.code).toMatch(/^\nexport \{\};\ndeclare global \{/);
		});
	});

	it('creates exactly one true boolean definition', () => {
		expect(createPlatformDefinitions('android')).toEqual({
			'import.meta.env.platform.web': false,
			'import.meta.env.platform.ios': false,
			'import.meta.env.platform.android': true,
		});
	});

	it.each(['{}', JSON.stringify({ STORYBOOK: '"true"' })])(
		'preserves JSON environment defaults while merging exact platform flags: %s',
		(environment) => {
			const definitions = {
				'import.meta.env': environment,
				'import.meta.env.STORYBOOK': '"true"',
			};

			expect(mergePlatformDefinitions(definitions, 'web')).toEqual({
				...definitions,
				'import.meta.env': JSON.stringify({
					...JSON.parse(environment),
					platform: { web: true, ios: false, android: false },
				}),
				'import.meta.env.platform': JSON.stringify({ web: true, ios: false, android: false }),
				...createPlatformDefinitions('web'),
			});
			expect(Object.keys(definitions)).toHaveLength(2);
		},
	);

	it.each(['web', 'ios', 'android'])(
		'keeps compatible environment composition idempotent for %s',
		(platform) => {
			const merged = mergePlatformDefinitions(
				{
					'import.meta.env': JSON.stringify({
						STORYBOOK: '"true"',
						unrelated: { nested: ['value'] },
					}),
				},
				platform,
				{ serialize: true },
			);

			const environment = merged['import.meta.env'];
			if (typeof environment !== 'string') throw new Error('expected serialized environment');
			expect(JSON.parse(environment)).toEqual({
				STORYBOOK: '"true"',
				unrelated: { nested: ['value'] },
				platform: {
					web: platform === 'web',
					ios: platform === 'ios',
					android: platform === 'android',
				},
			});
			expect(mergePlatformDefinitions(merged, platform, { serialize: true })).toEqual(merged);
		},
	);

	it.each([false, true])('preserves unrelated fields within platform defaults (%s)', (separate) => {
		const platform = { web: true, ios: false, android: false, unrelated: { nested: ['value'] } };
		const definitions = {
			'import.meta.env': JSON.stringify({ STORYBOOK: '"true"', platform }),
			...(separate ? { 'import.meta.env.platform': JSON.stringify(platform) } : {}),
		};
		const merged = mergePlatformDefinitions(definitions, 'web');
		expect(merged['import.meta.env']).toBe(definitions['import.meta.env']);
		expect(merged['import.meta.env.platform']).toBe(JSON.stringify(platform));
	});

	it('does not add platform flags without a selected platform', () => {
		const definitions = { CUSTOM: 'true' };
		expect(mergePlatformDefinitions(definitions, undefined)).toEqual(definitions);
	});

	it.each([
		['import.meta', '{}'],
		['import.meta.env.platform', '{}'],
		['import.meta.env.platform', JSON.stringify({ web: true, ios: false, android: false })],
		['import.meta.env', 'environmentDefaults'],
		['import.meta.env', '({})'],
		['import.meta.env', 'null'],
		['import.meta.env', 'false'],
		['import.meta.env', '[]'],
		['import.meta.env', JSON.stringify({ platform: {} })],
		['import.meta.env', JSON.stringify({ platform: { web: false } })],
		['import.meta.env', JSON.stringify({ platform: { web: 'true', ios: false, android: false } })],
		['import.meta.env', JSON.stringify({ platform: null })],
	])('still rejects a reserved or unverifiable parent definition: %s = %s', (key, value) => {
		expect(() => mergePlatformDefinitions({ [key]: value }, 'web')).toThrow(
			/Conflicting build integration definition/,
		);
	});

	it.each(['{}', 'dynamicPlatform', JSON.stringify({ web: false, ios: false, android: false })])(
		'rejects an incomplete or conflicting namespace alongside environment defaults: %s',
		(namespace) => {
			expect(() =>
				mergePlatformDefinitions(
					{ 'import.meta.env': '{}', 'import.meta.env.platform': namespace },
					'web',
				),
			).toThrow(/Conflicting build integration definition/);
		},
	);

	it('still rejects conflicting exact flags alongside compatible environment defaults', () => {
		expect(() =>
			mergePlatformDefinitions(
				{ 'import.meta.env': '{}', 'import.meta.env.platform.web': false },
				'web',
			),
		).toThrow(/expected true/);
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

	it('replaces flags in a module with a hashbang and syntax newer than ES2022', () => {
		const source = `#!/usr/bin/env node
using handle = open();
const letters = /[\\p{L}--[a-z]]/v;
const active = import.meta.env.platform.web;`;
		const result = replacePlatformFlags(source, 'cli.ts', 'web');

		expect(result.code).toBe(source.replace('import.meta.env.platform.web', 'true'));
	});

	// Turbopack's platform loader runs on every .ts, .mts, and .cts module, which
	// TypeScript reads without JSX (#183).
	it('replaces flags in a TypeScript module with operators, generics, and type assertions', () => {
		const shared = `type Flags = { readonly [key: string]: boolean };
export const isWeb = import.meta.env.platform.web;
export function clamp(value: number, min: number, max: number): number {
	let result = value <= min ? min : value;
	if (result >= max && import.meta.env.platform.ios) result = max;
	return result < 0 ? 0 : result;
}
export function bits(n: number): number {
	let mask = 1 << n;
	mask <<= 1;
	mask >>= 1;
	mask |= n << 2 <= 8 ? 1 : 0;
	for (let i = 0; i < 10 && i <= n; i++) mask ^= i;
	return mask >>> 0;
}
export const pick = <T extends object, K extends keyof T>(value: T, key: K): T[K] => value[key];
export const first = <T,>(items: readonly T[]): T | undefined => items[0];
export const flags = new Map<string, boolean>([['web', import.meta.env.platform.web]]);
`;
		const sources = {
			// A `.ts` file also has the forms a `.mts` or `.cts` file reserves.
			'utils.ts': `${shared}export const identity = <T>(x: T): T => x;
export const label = <string>(<unknown>import.meta.env.platform.android);
`,
			'utils.mts': `${shared}export const label = import.meta.env.platform.android as unknown as string;\n`,
			'utils.cts': `${shared}export const label = import.meta.env.platform.android as unknown as string;\n`,
		};
		for (const [filename, source] of Object.entries(sources)) {
			const result = replacePlatformFlags(source, filename, 'web');
			expect(result.code, filename).toBe(
				source
					.replaceAll('import.meta.env.platform.web', 'true')
					.replaceAll('import.meta.env.platform.ios', 'false')
					.replaceAll('import.meta.env.platform.android', 'false'),
			);
		}
	});

	it('reads comment-like JSX text in ordinary JSX and TSX as text', () => {
		const jsx = 'export default function Page() { return <main><pre>/*</pre></main>; }';
		const tsx = 'export default function Page() { return <main><pre>// docs</pre></main>; }';

		for (const filename of ['page.jsx', 'page.js', 'page.mjs', 'page.cjs']) {
			expect(replacePlatformFlags(jsx, filename, 'web').code).toBe(jsx);
		}
		expect(replacePlatformFlags(tsx, 'page.tsx', 'web').code).toBe(tsx);
	});

	it('replaces a flag in an expression container between comment-like JSX text', () => {
		const source = 'export const Note = () => <pre>/* {import.meta.env.platform.web} */ @if</pre>;';
		const result = replacePlatformFlags(source, 'Note.tsx', 'web');

		expect(result.code).toBe('export const Note = () => <pre>/* {true} */ @if</pre>;');
	});

	it('reads a constrained or defaulted generic arrow function in TSX', () => {
		const constrained = `const pick = <T extends object>(o: T) => o;
export const Note = () => <pre>/* {import.meta.env.platform.web} */</pre>;`;
		const defaulted = `const pick = <T = string>(o: T) => o;
export const Note = () => <pre>// docs</pre>;`;

		expect(replacePlatformFlags(constrained, 'Note.tsx', 'web').code).toBe(
			constrained.replace('import.meta.env.platform.web', 'true'),
		);
		expect(replacePlatformFlags(defaulted, 'Note.tsx', 'web').code).toBe(defaulted);
	});

	it('reports a syntax error after a constrained generic arrow function where it is', () => {
		const source = `const pick = <T extends object>(o: T) => o;
const = 1;`;

		expect(() => replacePlatformFlags(source, 'pick.tsx', 'web')).toThrow('Unexpected token (2:6)');
	});

	it('reports the TSX syntax error when neither parser reads the module', () => {
		const source = `export const Note = () => <pre>/*</pre>;
const = 1;`;

		expect(() => replacePlatformFlags(source, 'page.tsx', 'web')).toThrow('Unexpected token (2:6)');
	});

	it('reads angle-bracket type assertions in TypeScript modules without JSX', () => {
		const source = `const count = <number>(value as unknown);
const active = import.meta.env.platform.web;`;

		for (const filename of ['count.ts', 'count.mts', 'count.cts']) {
			const result = replacePlatformFlags(source, filename, 'web');
			expect(result.code).toBe(source.replace('import.meta.env.platform.web', 'true'));
		}
	});

	it('replaces flags in a module that uses syntax only the TSRX parser reads', () => {
		const source = `import defer * as feature from './feature.js';
const lazy = import('./lazy.js',);
const active = import.meta.env.platform.ios;`;
		const result = replacePlatformFlags(source, 'feature.ts', 'ios');

		expect(result.code).toBe(source.replace('import.meta.env.platform.ios', 'true'));
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
