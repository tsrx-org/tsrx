import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '@tsrx/react';
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

/** @param {import('vite').Plugin} plugin @param {import('vite').UserConfig} [config] */
function call_vite_config(plugin, config = {}) {
	const hook = typeof plugin.config === 'function' ? plugin.config : plugin.config?.handler;
	if (!hook) throw new Error(`${plugin.name} has no config hook`);
	return hook.call(/** @type {any} */ ({}), config, {
		command: 'build',
		mode: 'production',
		isSsrBuild: false,
		isPreview: false,
	});
}

/** @param {ReturnType<typeof viteVue>} plugins */
function get_vue_vite_plugin(plugins) {
	const plugin = plugins.find((entry) => entry.name === '@tsrx/vite-plugin-vue');
	if (!plugin) throw new Error('missing Vue TSRX plugin');
	return plugin;
}

/** @param {{ apply(compiler: any): void }} plugin @param {{ root?: string, tsconfig?: string }} [config] */
function apply_rspack_plugin(plugin, config = {}) {
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
		context: config.root,
		webpack: { DefinePlugin },
		options: {
			mode: 'development',
			plugins: [],
			module: { rules: [] },
			resolve: {
				extensions: [],
				...(config.tsconfig ? { tsConfig: config.tsconfig } : {}),
			},
			experiments: {},
		},
	};
	plugin.apply(compiler);
	return { compiler, applied_definitions };
}

/** @param {import('bun').BunPlugin} plugin @param {{ root?: string, tsconfig?: string, define?: Record<string, string> }} [config] */
function setup_bun_plugin(plugin, config = {}) {
	const build = {
		config: { entrypoints: [], plugins: [], ...config },
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
	it('infers an inherited platform from a referenced app config in every builder', () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'tsrx-platform-builders-'));
		try {
			writeFileSync(
				path.join(root, 'base.json'),
				JSON.stringify({ tsrx: { compiler: '@tsrx/react', platform: 'ios' } }),
			);
			writeFileSync(
				path.join(root, 'tsconfig.app.json'),
				JSON.stringify({ extends: './base.json', tsrx: { compiler: '@tsrx/react' } }),
			);
			writeFileSync(
				path.join(root, 'tsconfig.node.json'),
				JSON.stringify({ compilerOptions: { types: ['node'] } }),
			);
			writeFileSync(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					files: [],
					references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
				}),
			);

			for (const create_plugin of [
				() => viteReact(),
				() => vitePreact(),
				() => viteSolid(),
				() => get_vue_vite_plugin(viteVue()),
			]) {
				expect(call_vite_config(create_plugin(), { root })?.define).toEqual(IOS_DEFINITIONS);
			}

			for (const [create_plugin, rule_index] of [
				[() => new TsrxReactRspackPlugin(), 0],
				[() => new TsrxPreactRspackPlugin(), 0],
				[() => new TsrxSolidRspackPlugin(), 0],
				[() => new TsrxVueRspackPlugin(), 1],
			]) {
				const { compiler, applied_definitions } = apply_rspack_plugin(create_plugin(), { root });
				expect(applied_definitions).toEqual([IOS_DEFINITIONS]);
				expect(compiler.options.module.rules[rule_index].use.at(-1).options.platform).toBe('ios');
			}

			for (const create_plugin of [
				() => bunReact(),
				() => bunPreact(),
				() => bunSolid(),
				() => bunVue(),
			]) {
				expect(setup_bun_plugin(create_plugin(), { root }).define).toEqual({
					'import.meta.env.platform.web': 'false',
					'import.meta.env.platform.ios': 'true',
					'import.meta.env.platform.android': 'false',
				});
			}

			const turbopack = tsrxReactTurbopack({ turbopack: { root } });
			expect(turbopack.turbopack.rules['*.tsrx'][0].loaders[0]).toMatchObject({
				options: { platform: 'ios' },
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("honors each builder's selected tsconfig path", () => {
		const root = mkdtempSync(path.join(os.tmpdir(), 'tsrx-platform-config-paths-'));
		try {
			writeFileSync(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({ tsrx: { platform: 'web' } }),
			);
			writeFileSync(
				path.join(root, 'tsconfig.native.json'),
				JSON.stringify({ tsrx: { platform: 'ios' } }),
			);

			expect(
				call_vite_config(viteReact({ tsconfig: 'tsconfig.native.json' }), { root })?.define,
			).toEqual(IOS_DEFINITIONS);
			expect(
				apply_rspack_plugin(new TsrxReactRspackPlugin(), {
					root,
					tsconfig: 'tsconfig.native.json',
				}).applied_definitions,
			).toEqual([IOS_DEFINITIONS]);
			expect(
				setup_bun_plugin(bunReact(), { root, tsconfig: 'tsconfig.native.json' }).define,
			).toEqual({
				'import.meta.env.platform.web': 'false',
				'import.meta.env.platform.ios': 'true',
				'import.meta.env.platform.android': 'false',
			});
			const next_config = tsrxReactTurbopack({
				turbopack: { root },
				typescript: { tsconfigPath: 'tsconfig.native.json' },
			});
			expect(next_config.turbopack.rules['*.tsrx'][0].loaders[0]).toMatchObject({
				options: { platform: 'ios' },
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

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

	it.each([
		['Rspack _args', { name: 'DefinePlugin', _args: [{ 'import.meta.env.platform.web': true }] }],
		[
			'webpack definitions',
			{ name: 'DefinePlugin', definitions: { 'import.meta.env.platform.web': true } },
		],
		['plugin options', { name: 'DefinePlugin', options: { 'import.meta.env.platform.web': true } }],
		[
			'constructor name',
			new (class DefinePlugin {
				definitions = { 'import.meta.env.platform.web': true };
			})(),
		],
	])('reports conflicting Rspack definitions from %s', (_, conflict) => {
		const plugin = new TsrxReactRspackPlugin({ platform: 'ios' });
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
				define: { 'import.meta.env.platform.ios': 'false' },
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
		const input_map = {
			version: 3,
			sources: ['/original/example.ts'],
			sourcesContent: ['export const flags = ORIGINAL;'],
			names: [],
			mappings: 'AAAA',
		};
		const transformed = await new Promise((resolve) => {
			turbopackPlatformLoader.call(
				{
					resourcePath: '/virtual/example.ts',
					getOptions: () => ({ platform: 'ios' }),
					async: () => (error, output, map) => resolve({ error, output, map }),
				},
				'export const flags = [import.meta.env.platform.web, import.meta.env.platform.ios];',
				input_map,
			);
		});

		expect(transformed).toMatchObject({ error: null });
		expect(transformed.output).toContain('[false, true]');
		expect(transformed.map).toBeTruthy();
		expect(transformed.map.sources).toEqual(['/original/example.ts']);
		expect(transformed.map.sourcesContent).toEqual(['export const flags = ORIGINAL;']);
	});

	it('preserves the TSRX compile map when no runtime flags remain', async () => {
		const source = `export function App() @{
			<div>{'Hello world'}</div>
		}`;
		const compiled = compile(source, '/virtual/App.tsrx', { platform: 'ios' });
		const transformed = await new Promise((resolve) => {
			turbopackPlatformLoader.call(
				{
					resourcePath: '/virtual/App.tsrx',
					getOptions: () => ({ platform: 'ios' }),
					async: () => (error, output, map) => resolve({ error, output, map }),
				},
				compiled.code,
				compiled.map,
			);
		});

		expect(transformed.error).toBeNull();
		expect(transformed.output).toBe(compiled.code);
		expect(transformed.map).toBe(compiled.map);
		expect(transformed.map.sourcesContent?.[0]).toBe(source);
	});

	it('composes the TSRX compile map when runtime flags are rewritten', async () => {
		const source = `export function App() @{
			<div>{import.meta.env.platform.ios ? 'ios' : 'other'}</div>
		}`;
		const compiled = compile(source, '/virtual/App.tsrx', { platform: 'ios' });
		const transformed = await new Promise((resolve) => {
			turbopackPlatformLoader.call(
				{
					resourcePath: '/virtual/App.tsrx',
					getOptions: () => ({ platform: 'ios' }),
					async: () => (error, output, map) => resolve({ error, output, map }),
				},
				compiled.code,
				compiled.map,
			);
		});

		expect(transformed.error).toBeNull();
		expect(transformed.output).toContain("true ? 'ios' : 'other'");
		expect(transformed.map.sourcesContent?.[0]).toBe(source);
		expect(transformed.map.sourcesContent?.[0]).not.toBe(compiled.code);
	});
});
