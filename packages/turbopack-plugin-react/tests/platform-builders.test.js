import { describe, expect, it } from 'vitest';
import { tsrxReact as viteReact } from '../../vite-plugin-react/src/index.js';
import { tsrxPreact as vitePreact } from '../../vite-plugin-preact/src/index.js';
import { tsrxSolid as viteSolid } from '../../vite-plugin-solid/src/index.js';
import { tsrxVue as viteVue } from '../../vite-plugin-vue/src/index.js';
import { TsrxReactRspackPlugin } from '../../rspack-plugin-react/src/index.js';
import { TsrxPreactRspackPlugin } from '../../rspack-plugin-preact/src/index.js';
import { TsrxSolidRspackPlugin } from '../../rspack-plugin-solid/src/index.js';
import { TsrxVueRspackPlugin } from '../../rspack-plugin-vue/src/index.js';
import { tsrxReact as bunReact } from '../../bun-plugin-react/src/index.js';
import { tsrxPreact as bunPreact } from '../../bun-plugin-preact/src/index.js';
import { tsrxSolid as bunSolid } from '../../bun-plugin-solid/src/index.js';
import { tsrxVue as bunVue } from '../../bun-plugin-vue/src/index.js';
import { create_tsrx_react_turbopack_rule, tsrxReactTurbopack } from '../src/index.js';
import turbopackPlatformLoader from '../src/platform-loader.js';

const IOS_DEFINITIONS = {
	'import.meta.env.platform.web': false,
	'import.meta.env.platform.ios': true,
	'import.meta.env.platform.android': false,
};

/** @param {import('vite').Plugin} plugin */
function call_vite_config(plugin) {
	const hook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
	if (!hook) throw new Error(`${plugin.name} has no config hook`);
	return hook.call(
		/** @type {any} */ ({}),
		{},
		{ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false },
	);
}

/** @param {ReturnType<typeof viteVue>} plugins */
function get_vue_vite_plugin(plugins) {
	const plugin = plugins.find((entry) => entry.name === '@tsrx/vite-plugin-vue');
	if (!plugin) throw new Error('missing Vue TSRX plugin');
	return plugin;
}

/** @param {{ apply(compiler: any): void }} plugin */
function apply_rspack_plugin(plugin) {
	const applied_definitions = [];
	class DefinePlugin {
		/** @param {Record<string, boolean>} definitions */
		constructor(definitions) {
			this.definitions = definitions;
		}
		/** @param {unknown} _compiler */
		apply(_compiler) {
			applied_definitions.push(this.definitions);
		}
	}
	const compiler = {
		webpack: { DefinePlugin },
		options: {
			mode: 'development',
			plugins: [],
			module: { rules: [] },
			resolve: { extensions: [] },
			experiments: {},
		},
	};
	plugin.apply(compiler);
	return { compiler, applied_definitions };
}

/** @param {import('bun').BunPlugin} plugin @param {Record<string, string>} [define] */
function setup_bun_plugin(plugin, define) {
	const build = {
		config: { entrypoints: [], plugins: [], define },
		onResolve() {
			return build;
		},
		onLoad() {
			return build;
		},
	};
	plugin.setup(/** @type {any} */ (build));
	return build.config;
}

describe('platform options across build integrations', () => {
	it.each([
		['React', () => viteReact({ platform: 'ios' })],
		['Preact', () => vitePreact({ platform: 'ios' })],
		['Solid', () => viteSolid({ platform: 'ios' })],
		['Vue', () => get_vue_vite_plugin(viteVue({ platform: 'ios' }))],
	])('configures all three Vite definitions for %s', (_, create_plugin) => {
		expect(call_vite_config(create_plugin())?.define).toEqual(IOS_DEFINITIONS);
	});

	it('reports conflicting Vite definitions', () => {
		const plugin = viteReact({ platform: 'ios' });
		const hook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
		expect(() =>
			hook?.call(
				/** @type {any} */ ({}),
				{ define: { 'import.meta.env.platform.ios': false } },
				{ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false },
			),
		).toThrow(/Conflicting Vite definition/);
	});

	it.each([
		['React', () => new TsrxReactRspackPlugin({ platform: 'ios' }), 0],
		['Preact', () => new TsrxPreactRspackPlugin({ platform: 'ios' }), 0],
		['Solid', () => new TsrxSolidRspackPlugin({ platform: 'ios' }), 0],
		['Vue', () => new TsrxVueRspackPlugin({ platform: 'ios' }), 1],
	])('configures definitions and loader options for Rspack %s', (_, create_plugin, rule_index) => {
		const { compiler, applied_definitions } = apply_rspack_plugin(create_plugin());
		expect(applied_definitions).toEqual([IOS_DEFINITIONS]);
		expect(compiler.options.module.rules[rule_index].use.at(-1).options.platform).toBe('ios');
	});

	it('reports conflicting Rspack definitions', () => {
		const plugin = new TsrxReactRspackPlugin({ platform: 'ios' });
		const conflict = {
			name: 'DefinePlugin',
			_args: [{ 'import.meta.env.platform.web': true }],
		};
		const compiler = {
			options: {
				plugins: [conflict],
				module: { rules: [] },
				resolve: { extensions: [] },
				experiments: {},
			},
		};
		expect(() => plugin.apply(/** @type {any} */ (compiler))).toThrow(
			/Conflicting Rspack definition/,
		);
	});

	it.each([
		['React', () => bunReact({ platform: 'ios' })],
		['Preact', () => bunPreact({ platform: 'ios' })],
		['Solid', () => bunSolid({ platform: 'ios' })],
		['Vue', () => bunVue({ platform: 'ios' })],
	])('configures all three Bun definitions for %s', (_, create_plugin) => {
		expect(setup_bun_plugin(create_plugin()).define).toEqual({
			'import.meta.env.platform.web': 'false',
			'import.meta.env.platform.ios': 'true',
			'import.meta.env.platform.android': 'false',
		});
	});

	it('reports conflicting Bun definitions', () => {
		expect(() =>
			setup_bun_plugin(bunReact({ platform: 'ios' }), {
				'import.meta.env.platform.ios': 'false',
			}),
		).toThrow(/Conflicting Bun definition/);
	});

	it('passes the platform through TSRX and ordinary-module Turbopack rules', () => {
		const tsrx_rule = create_tsrx_react_turbopack_rule({ platform: 'ios' });
		const config = tsrxReactTurbopack({}, { platform: 'ios' });

		expect(tsrx_rule.loaders).toHaveLength(2);
		expect(tsrx_rule.loaders[0]).toMatchObject({ options: { platform: 'ios' } });
		expect(tsrx_rule.loaders[1]).toMatchObject({ options: { platform: 'ios' } });
		for (const glob of ['*.js', '*.jsx', '*.mjs', '*.cjs', '*.ts', '*.tsx', '*.mts', '*.cts']) {
			expect(config.turbopack.rules[glob]).toMatchObject({
				loaders: [expect.objectContaining({ options: { platform: 'ios' } })],
			});
		}
	});

	it('replaces exact flags in Turbopack ordinary modules', async () => {
		const transformed = await new Promise((resolve) => {
			turbopackPlatformLoader.call(
				{
					resourcePath: '/virtual/example.ts',
					getOptions: () => ({ platform: 'ios' }),
					async: () => (error, output, map) => resolve({ error, output, map }),
				},
				'export const flags = [import.meta.env.platform.web, import.meta.env.platform.ios];',
			);
		});

		expect(transformed).toMatchObject({ error: null });
		expect(transformed.output).toContain('[false, true]');
		expect(transformed.map).toBeTruthy();
	});
});
