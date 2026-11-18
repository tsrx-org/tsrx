import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experiments, rspack } from '@rspack/core';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { TsrxVueRspackPlugin } from '../src/index.js';

const require = createRequire(import.meta.url);
// Vue's Node build has no Vapor, so the bundle takes its browser build.
const vue_browser_build = path.join(
	path.dirname(require.resolve('vue/package.json')),
	'dist/vue.runtime-with-vapor.esm-browser.js',
);

/**
 * @param {Record<string, string>} modules
 * @param {string} output_path
 * @param {{ rules?: object[], cache?: object }} [config]
 * @returns {Promise<void>}
 */
function build(modules, output_path, config = {}) {
	const package_root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	return new Promise((resolve, reject) => {
		rspack(
			{
				context: package_root,
				mode: 'development',
				target: 'web',
				entry: `./${Object.keys(modules)[0]}`,
				devtool: false,
				optimization: { minimize: false },
				resolve: { alias: { vue$: vue_browser_build } },
				module: { rules: config.rules ?? [] },
				cache: config.cache,
				output: { path: output_path, filename: 'main.cjs', library: { type: 'commonjs2' } },
				plugins: [new experiments.VirtualModulesPlugin(modules), new TsrxVueRspackPlugin()],
			},
			(error, stats) => {
				if (error) {
					reject(error);
				} else if (stats?.hasErrors()) {
					reject(new Error(stats.toString({ all: false, errors: true })));
				} else {
					resolve(undefined);
				}
			},
		);
	});
}

const DOM_GLOBALS = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Text', 'Comment'];

/**
 * Loads the bundle in jsdom and mounts each of its components there, returning
 * their HTML. Rspack runs outside jsdom, which breaks its loaders, so only the
 * bundle gets the DOM globals.
 *
 * @param {string} bundle
 * @param {Array<[string, Record<string, unknown>]>} mounts export names and props
 * @returns {string[]}
 */
function render(bundle, mounts) {
	const { window } = new JSDOM('<!doctype html><body></body>');
	const scope = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
	for (const key of DOM_GLOBALS) scope[key] = Reflect.get(window, key);
	try {
		const exports = require(bundle);
		return mounts.map(([name, props]) => {
			const host = window.document.createElement('div');
			const app = exports.createVaporApp(exports[name], props);
			app.mount(host);
			const html = host.innerHTML;
			app.unmount();
			return html;
		});
	} finally {
		for (const key of DOM_GLOBALS) delete scope[key];
		window.close();
	}
}

/**
 * Bundles `modules` (the first is the entry) and renders the mounts.
 *
 * @param {Record<string, string>} modules
 * @param {Array<[string, Record<string, unknown>]>} mounts
 * @param {{ rules?: object[], cache?: object }} [config]
 * @returns {Promise<{ html: string[], css: string }>}
 */
async function build_and_render(modules, mounts, config) {
	const output_path = mkdtempSync(path.join(tmpdir(), 'tsrx-rspack-vue-macros-'));
	try {
		await build(modules, output_path, config);
		const css_path = path.join(output_path, 'main.css');
		return {
			html: render(path.join(output_path, 'main.cjs'), mounts),
			css: existsSync(css_path) ? readFileSync(css_path, 'utf8') : '',
		};
	} finally {
		rmSync(output_path, { recursive: true, force: true });
	}
}

describe("@tsrx/rspack-plugin-vue vue-jsx-vapor's macros", () => {
	it('gives components their props and serves the helper modules in a Rspack 2 bundle', async () => {
		const { html } = await build_and_render(
			{
				'tests/virtual-macros/entry.js': `
					export { Greeting } from './Greeting.tsrx';
					export { Named } from './Named.tsrx';
					export { createVaporApp } from 'vue';
				`,
				'tests/virtual-macros/Greeting.tsrx': `
					export function Greeting({ name, greeting = 'Hello' }: { name: string; greeting?: string }) @{
						<p class="greeting">{greeting}{', '}{name}</p>
					}
				`,
				'tests/virtual-macros/Named.tsrx': `
					export function Named(props: { name: string }) @{
						<p class="named">{'Hi, '}{props.name}</p>
					}
				`,
			},
			[
				['Greeting', { name: 'Ada' }],
				['Greeting', { name: 'Ada', greeting: 'Hi' }],
				['Named', { name: 'Lin' }],
			],
		);

		expect(html).toEqual([
			'<p class="greeting">Hello, Ada</p>',
			'<p class="greeting">Hi, Ada</p>',
			'<p class="named">Hi, Lin</p>',
		]);
	});

	// A project rule for `.css` files must not turn the scoped sheet into a CSS module.
	it('compiles defineStyle stylesheets in a Rspack 2 bundle', async () => {
		const { html, css } = await build_and_render(
			{
				'tests/virtual-define-style/entry.js': `
					export { Box } from './Box.tsrx';
					export { createVaporApp } from 'vue';
				`,
				'tests/virtual-define-style/Box.tsrx': `
					export function Box({ label }: { label: string }) @{
						defineStyle(\`.box { --tsrx-define-style-mark: box; }\`);
						<div class="box">{label}</div>
					}
				`,
			},
			[['Box', { label: 'Styled' }]],
			{ rules: [{ test: /\.css$/, type: 'css/module' }] },
		);

		const [, scope] = /data-v-(\w+)/.exec(html[0]) ?? [];
		expect(html).toEqual([`<div data-v-${scope}="" class="box">Styled</div>`]);
		expect(css).toContain(`.box[data-v-${scope}]`);
		expect(css).toContain('--tsrx-define-style-mark: box;');
	});

	it('compiles an assigned defineStyle as a CSS module in a Rspack 2 bundle', async () => {
		const { html, css } = await build_and_render(
			{
				'tests/virtual-define-style-module/entry.js': `
					export { Card } from './Card.tsrx';
					export { createVaporApp } from 'vue';
				`,
				'tests/virtual-define-style-module/Card.tsrx': `
					export function Card({ label }: { label: string }) @{
						const styles = defineStyle(\`.title { font-weight: 700; }\`);
						<p class={styles.title}>{label}</p>
					}
				`,
			},
			[['Card', { label: 'Styled' }]],
		);

		const [, scope, title] = /data-v-(\w+)="" class="([^"]+)"/.exec(html[0]) ?? [];
		expect(title).not.toBe('title');
		expect(html).toEqual([`<p data-v-${scope}="" class="${title}">Styled</p>`]);
		// The class name has the escaped package name in the stylesheet.
		expect(css.replaceAll('\\', '')).toContain(`.${title}[data-v-${scope}]`);
		expect(css).toContain('font-weight: 700;');
	});

	it('keeps the helper modules on warm builds from a persistent cache', async () => {
		const cache_path = mkdtempSync(path.join(tmpdir(), 'tsrx-rspack-vue-cache-'));
		const modules = {
			'tests/virtual-define-style-cache/entry.js': `
				export { Box } from './Box.tsrx';
				export { Named } from './Named.tsrx';
				export { createVaporApp } from 'vue';
			`,
			'tests/virtual-define-style-cache/Named.tsrx': `
				export function Named(props: { name: string }) @{
					<p class="named">{'Hi, '}{props.name}</p>
				}
			`,
			'tests/virtual-define-style-cache/Box.tsrx': `
				export function Box({ label }: { label: string }) @{
					defineStyle(\`.box { --tsrx-define-style-mark: cached; }\`);
					<div class="box">{label}</div>
				}
			`,
		};
		const cache = { type: 'persistent', storage: { type: 'filesystem', directory: cache_path } };
		try {
			for (let run = 0; run < 3; run++) {
				const { html, css } = await build_and_render(
					modules,
					[
						['Box', { label: 'Cached' }],
						['Named', { name: 'Lin' }],
					],
					{ cache },
				);
				const [, scope] = /data-v-(\w+)/.exec(html[0]) ?? [];
				expect(html).toEqual([
					`<div data-v-${scope}="" class="box">Cached</div>`,
					'<p class="named">Hi, Lin</p>',
				]);
				expect(css).toContain(`.box[data-v-${scope}]`);
			}
		} finally {
			rmSync(cache_path, { recursive: true, force: true });
		}
	});

	it("reports defineStyle stylesheets in a language the plugin can't compile", async () => {
		const output_path = mkdtempSync(path.join(tmpdir(), 'tsrx-rspack-vue-macros-'));
		try {
			await expect(
				build(
					{
						'tests/virtual-define-style-scss/entry.js': `export { Box } from './Box.tsrx';`,
						'tests/virtual-define-style-scss/Box.tsrx': `
							export function Box() @{
								defineStyle.scss(\`.box { .inner { color: red; } }\`);
								<div class="box">{'box'}</div>
							}
						`,
					},
					output_path,
				),
			).rejects.toThrow("@tsrx/rspack-plugin-vue can't compile a defineStyle.scss stylesheet");
		} finally {
			rmSync(output_path, { recursive: true, force: true });
		}
	});
});
