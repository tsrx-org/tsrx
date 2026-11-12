/** @import { RuntimeImportMode } from '@tsrx/react' */

import { describe, expect, it } from 'vitest';
import tsrx_react_turbopack_client_boundary_loader from '../src/client-boundary-loader.js';
import tsrx_react_turbopack_css_loader from '../src/css-loader.js';
import tsrx_react_turbopack_loader from '../src/loader.js';
import {
	create_tsrx_react_turbopack_client_rule,
	create_tsrx_react_turbopack_css_rule,
	create_tsrx_react_turbopack_rule,
	tsrxReactTurbopack,
} from '../src/index.js';

/**
 * @param {string} resourcePath
 * @param {{ runtimeImports?: RuntimeImportMode }} [options]
 * @returns {{ context: object, promise: Promise<{ err: unknown, output: string | null, map: unknown }> }}
 */
function create_loader_context(resourcePath, options = {}) {
	/** @type {(value: { err: unknown, output: string | null, map: unknown }) => void} */
	let resolve;
	const promise = new Promise((r) => {
		resolve = r;
	});
	const context = {
		resourcePath,
		getOptions() {
			return options;
		},
		async() {
			return (
				/** @type {unknown} */ err,
				/** @type {string | null} */ output,
				/** @type {unknown} */ map,
			) => {
				resolve({ err, output, map });
			};
		},
	};
	return { context, promise };
}

describe('@tsrx/turbopack-plugin-react loader', () => {
	it('compiles tsrx source to TSX with a source map', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_loader.call(
			context,
			`export function App() @{
				<div>{'Hello world'}</div>
			}`,
		);

		const { err, output, map } = await promise;

		expect(err).toBeNull();
		expect(output).toContain('export function App()');
		expect(output).toContain("{'Hello world'}");
		expect(map).toBeTruthy();
	});

	it('preserves deferred imports in the loader output', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_loader.call(
			context,
			`import defer * as feature from './feature.js';
			const lazy = import.defer('./lazy.js');

			export function App() @{
				<div>{feature.value}</div>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output).toContain("import defer * as feature from './feature.js';");
		expect(output).toContain("import.defer('./lazy.js')");
	});

	it('preserves top-level directives at the start of the output', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_loader.call(
			context,
			`'use client';

			export function App() @{
				<div>{'Hello world'}</div>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output.startsWith("'use client';")).toBe(true);
	});

	it('injects a relative sibling CSS import for component-local style blocks', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_loader.call(
			context,
			`export function App() @{
				<>
				<div>{'Hello world'}</div>

				<style>
					div {
						color: red;
					}
				</style>
				</>
			}`,
		);

		const { err, output, map } = await promise;

		expect(err).toBeNull();
		// Turbopack rejects server-relative (absolute) import specifiers.
		expect(output).toContain('import "./App.tsrx?tsrx-css&lang.css";');
		expect(output).not.toContain('/virtual/App.tsrx?tsrx-css');
		expect(output).toContain('export function App()');
		expect(map).toBeTruthy();
	});

	it('places the injected CSS import after the module imports', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_loader.call(
			context,
			`import './reset.css';

			export function App() @{
				<>
				<div>{'Hello world'}</div>

				<style>
					div {
						color: red;
					}
				</style>
				</>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output.indexOf('./reset.css')).toBeGreaterThan(-1);
		expect(output.indexOf('./reset.css')).toBeLessThan(
			output.indexOf('import "./App.tsrx?tsrx-css&lang.css";'),
		);
	});

	it('keeps top-level directives ahead of injected CSS imports', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_loader.call(
			context,
			`'use client';

			export function App() @{
				<>
				<div>{'Hello world'}</div>

				<style>
					div {
						color: red;
					}
				</style>
				</>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output.startsWith("'use client';")).toBe(true);
		expect(output.indexOf("'use client';")).toBeLessThan(
			output.indexOf('import "./App.tsrx?tsrx-css&lang.css";'),
		);
	});

	it('forwards direct runtime imports to the compiler', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx', {
			runtimeImports: 'direct',
		});

		tsrx_react_turbopack_loader.call(
			context,
			`export function App(props) @{
				<input {...props} />
			}`,
		);

		const { err, output } = await promise;
		expect(err).toBeNull();
		expect(output).toContain("from '@tsrx/react-runtime/ref'");
	});
});

describe('@tsrx/turbopack-plugin-react client boundary loader', () => {
	it("re-exports a 'use client' module from its compiled module", async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_client_boundary_loader.call(
			context,
			`// App
			'use client';
			import { useState } from 'react';

			export type Theme = 'light' | 'dark';
			export function App() @{
				const [count] = useState(0);
				<div>{count}</div>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output).toBe(`'use client';\nexport * from "./App.tsrx?tsrx-client&lang.tsx";\n`);
	});

	it('re-exports the default export, which `export *` leaves out', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_client_boundary_loader.call(
			context,
			`'use client';
			export default function App() @{
				<div>{'Hello world'}</div>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output).toBe(
			`'use client';\nexport * from "./App.tsrx?tsrx-client&lang.tsx";\nexport { default } from "./App.tsrx?tsrx-client&lang.tsx";\n`,
		);
	});

	it('counts named and namespace default exports but not type-only ones', async () => {
		/** @param {string} source */
		const run = async (source) => {
			const { context, promise } = create_loader_context('/virtual/App.tsrx');
			tsrx_react_turbopack_client_boundary_loader.call(context, `'use client';\n${source}`);
			const { err, output } = await promise;
			expect(err).toBeNull();
			return /** @type {string} */ (output).includes('export { default }');
		};

		expect(await run(`function App() @{ <div /> }\nexport { App as default };`)).toBe(true);
		expect(await run(`export * as default from './other.tsrx';`)).toBe(true);
		expect(await run(`export default interface Props {}`)).toBe(false);
		expect(await run(`export type { Props as default } from './types';`)).toBe(false);
		expect(await run(`type Props = {};\nexport { type Props as default };`)).toBe(false);
	});

	// TypeScript erases these, so the compiled module has no default export.
	it('does not re-export a default that names only a type', async () => {
		/** @param {string} source */
		const run = async (source) => {
			const { context, promise } = create_loader_context('/virtual/App.tsrx');
			tsrx_react_turbopack_client_boundary_loader.call(context, `'use client';\n${source}`);
			const { err, output } = await promise;
			expect(err).toBeNull();
			return /** @type {string} */ (output).includes('export { default }');
		};

		expect(await run(`interface Props {}\nexport { Props as default };`)).toBe(false);
		expect(await run(`type Props = {};\nexport default Props;`)).toBe(false);
		expect(await run(`import type { Props } from './types';\nexport { Props as default };`)).toBe(
			false,
		);
		expect(await run(`import { type Props } from './types';\nexport { Props as default };`)).toBe(
			false,
		);
		expect(await run(`export default function App(): void;`)).toBe(false);
		// A value with the same name keeps the export.
		expect(await run(`interface Props {}\nconst Props = {};\nexport { Props as default };`)).toBe(
			true,
		);
		expect(
			await run(`export default function App(): void;\nexport default function App() {}`),
		).toBe(true);
		expect(await run(`import { Props } from './types';\nexport { Props as default };`)).toBe(true);
	});

	it('keeps the module a server module when the directive is not in the prologue', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_client_boundary_loader.call(
			context,
			`export const note = 'use client';
			export function App() @{
				<div>{note}</div>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output).toBe(`export * from "./App.tsrx?tsrx-client&lang.tsx";\n`);
	});

	it('reports parse errors', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_client_boundary_loader.call(context, `'use client';\nexport function (`);

		const { err } = await promise;

		expect(err).toBeInstanceOf(Error);
	});
});

describe('@tsrx/turbopack-plugin-react css loader', () => {
	it('extracts component-local css for the sibling query import', async () => {
		const { context, promise } = create_loader_context('/virtual/App.tsrx');

		tsrx_react_turbopack_css_loader.call(
			context,
			`export function App() @{
				<>
				<div class="card">{'Hello world'}</div>

				<style>
					.card {
						color: red;
					}
				</style>
				</>
			}`,
		);

		const { err, output } = await promise;

		expect(err).toBeNull();
		expect(output).toContain('.card.');
		expect(output).toContain('color: red;');
	});
});

describe('@tsrx/turbopack-plugin-react config helper', () => {
	it('creates the default tsrx turbopack rule', () => {
		const rule = create_tsrx_react_turbopack_rule();

		expect(rule.condition).toEqual({
			all: [{ not: 'foreign' }, { not: { query: '?tsrx-css&lang.css' } }],
		});
		expect(rule.as).toBe('*.tsx');
		expect(rule.loaders).toHaveLength(1);
		expect(rule.loaders[0]).toContain('packages/turbopack-plugin-react/src/loader.js');
	});

	it('creates the sibling css rule for style query imports', () => {
		const rule = create_tsrx_react_turbopack_css_rule();

		expect(rule.condition).toEqual({
			all: [{ not: 'foreign' }, { query: '?tsrx-css&lang.css' }],
		});
		// Next only gives server components' CSS a stylesheet link for `*.css` modules.
		expect(rule.as).toBe('*.css');
		expect(rule).not.toHaveProperty('type');
		expect(rule.loaders).toHaveLength(1);
		expect(rule.loaders[0]).toContain('packages/turbopack-plugin-react/src/css-loader.js');
	});

	it("creates the client boundary rule for 'use client' modules", () => {
		const rule = create_tsrx_react_turbopack_client_rule();
		const [foreign, css_query, client_query, directive] = rule.condition.all;

		expect(foreign).toEqual({ not: 'foreign' });
		expect(css_query).toEqual({ not: { query: '?tsrx-css&lang.css' } });
		expect(client_query).toEqual({ not: { query: '?tsrx-client&lang.tsx' } });
		// Next's client reference imports the module by its renamed file name,
		// so the rename has to resolve back to the source with the query.
		expect(rule.as).toBe('*?tsrx-client&lang.tsx');
		expect(rule.loaders).toHaveLength(1);
		expect(rule.loaders[0]).toContain(
			'packages/turbopack-plugin-react/src/client-boundary-loader.js',
		);

		const content = directive.content;
		expect(content).toBeInstanceOf(RegExp);
		expect(content.test(`'use client';\nexport function App() @{ <div /> }`)).toBe(true);
		expect(content.test(`"use client"\nexport function App() @{ <div /> }`)).toBe(true);
		expect(content.test(`// App\n/* a\nb */\n'use strict';\n'use client';`)).toBe(true);
		expect(content.test(`export function App() @{ <div /> }`)).toBe(false);
		expect(content.test(`import 'x';\n'use client';`)).toBe(false);
		expect(content.test(`'use server';`)).toBe(false);
		// A line comment runs to the end of its line.
		expect(
			content.test(`// 'use client' is not needed here\nexport function App() @{ <div /> }`),
		).toBe(false);
		// Comments may sit between a directive and its semicolon, and directive
		// strings may contain escapes.
		expect(content.test(`'use strict' /* c */;\n'use client';`)).toBe(true);
		expect(content.test(`'use strict' // c\n;\n'use client';`)).toBe(true);
		expect(content.test(`'it\\'s';\n'use client';`)).toBe(true);
		expect(content.test(`"say \\"hi\\"";\n"use client";`)).toBe(true);
	});

	it('merges turbopack config without dropping existing settings', () => {
		const config = tsrxReactTurbopack({
			reactStrictMode: true,
			turbopack: {
				debugIds: true,
				resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
				rules: {
					'*.svg': {
						loaders: ['@svgr/webpack'],
						as: '*.js',
					},
				},
			},
		});

		expect(config.reactStrictMode).toBe(true);
		expect(config.turbopack.debugIds).toBe(true);
		expect(config.turbopack.rules['*.svg']).toEqual({
			loaders: ['@svgr/webpack'],
			as: '*.js',
		});
		expect(config.turbopack.resolveExtensions[0]).toBe('.tsrx');
		expect(Array.isArray(config.turbopack.rules['*.tsrx'])).toBe(true);
		// The client boundary rule renames the module, so it has to run first.
		expect(config.turbopack.rules['*.tsrx'][0]).toMatchObject({
			as: '*?tsrx-client&lang.tsx',
		});
		expect(config.turbopack.rules['*.tsrx'][1]).toMatchObject({
			condition: {
				all: [{ not: 'foreign' }, { not: { query: '?tsrx-css&lang.css' } }],
			},
			as: '*.tsx',
		});
		expect(config.turbopack.rules['*.tsrx'][2]).toMatchObject({
			condition: {
				all: [{ not: 'foreign' }, { query: '?tsrx-css&lang.css' }],
			},
			as: '*.css',
		});
	});

	it('passes runtime import options to both loaders', () => {
		const config = tsrxReactTurbopack({}, { runtimeImports: 'direct' });
		const rules = config.turbopack.rules['*.tsrx'];

		expect(rules[1].loaders[0].options).toEqual({ runtimeImports: 'direct' });
		expect(rules[2].loaders[0].options).toEqual({ runtimeImports: 'direct' });
	});

	it('prepends the tsrx rule when a user already configured one', () => {
		const config = tsrxReactTurbopack({
			turbopack: {
				rules: {
					'*.tsrx': {
						loaders: ['custom-loader'],
						as: '*.js',
					},
				},
			},
		});

		expect(Array.isArray(config.turbopack.rules['*.tsrx'])).toBe(true);
		expect(config.turbopack.rules['*.tsrx'][0]).toMatchObject({
			as: '*?tsrx-client&lang.tsx',
		});
		expect(config.turbopack.rules['*.tsrx'][1]).toMatchObject({
			condition: {
				all: [{ not: 'foreign' }, { not: { query: '?tsrx-css&lang.css' } }],
			},
			as: '*.tsx',
		});
		expect(config.turbopack.rules['*.tsrx'][2]).toMatchObject({
			condition: {
				all: [{ not: 'foreign' }, { query: '?tsrx-css&lang.css' }],
			},
			as: '*.css',
		});
		expect(config.turbopack.rules['*.tsrx'][3]).toEqual({
			loaders: ['custom-loader'],
			as: '*.js',
		});
	});
});
