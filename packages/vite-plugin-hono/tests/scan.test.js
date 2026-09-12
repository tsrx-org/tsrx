import { describe, expect, it } from 'vitest';
import { resolveHonoTarget } from '@tsrx/hono/target';
import { tsrxHono } from '../src/index.js';

const APP = `export function App() @{ <main>{'Hello'}</main> }`;
const MALFORMED = `export function Broken() @{ <main>{ <<< }</main> }`;

function get_environment_config(plugin, name = 'client', options = {}) {
	const config = plugin.configEnvironment(name, options);
	if (!config) throw new Error(`Missing dependency scan config for ${name}`);
	return config;
}

describe('@tsrx/vite-plugin-hono dependency scanning', () => {
	it.each([
		['server', undefined],
		['dom', 'dom'],
	])('registers only the %s JSX runtime', async (_name, mode) => {
		const target = resolveHonoTarget(mode);
		const plugin = tsrxHono(mode === undefined ? undefined : { mode });
		const config = get_environment_config(plugin);

		expect(config.optimizeDeps.extensions).toEqual(['.tsrx']);
		expect(config.optimizeDeps.rolldownOptions.transform).toEqual({
			jsx: { importSource: target.jsxImportSource },
		});

		const [scan_plugin] = config.optimizeDeps.rolldownOptions.plugins;
		expect(scan_plugin.name).toBe('@tsrx/vite-plugin-hono:dep-scan');
		const result = await scan_plugin.transform.handler(APP, '/virtual/App.tsrx');
		expect(result.moduleType).toBe('tsx');
		expect(result.code).toContain(`import "${target.jsxImportSource}/jsx-runtime"`);
		const other = resolveHonoTarget(mode === 'dom' ? 'server' : 'dom');
		expect(result.code).not.toContain(`import "${other.jsxImportSource}/jsx-runtime"`);
	});

	it('enables scanning for client and opt-in SSR environments', () => {
		const plugin = tsrxHono();

		expect(get_environment_config(plugin, 'client').optimizeDeps).toBeDefined();
		expect(
			get_environment_config(plugin, 'ssr', { optimizeDeps: { noDiscovery: false } }).optimizeDeps,
		).toBeDefined();
	});

	it('does not enable scanning for SSR environments with discovery disabled', () => {
		const plugin = tsrxHono();

		expect(plugin.configEnvironment('ssr', {})).toBeUndefined();
		expect(
			plugin.configEnvironment('ssr', { optimizeDeps: { noDiscovery: true } }),
		).toBeUndefined();
	});

	it('recovers from malformed source without aborting the dependency scan', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const [scan_plugin] = get_environment_config(plugin).optimizeDeps.rolldownOptions.plugins;

		expect(await scan_plugin.transform.handler(MALFORMED, '/virtual/Broken.tsrx')).toEqual({
			code: '',
			moduleType: 'tsx',
		});
	});
});
