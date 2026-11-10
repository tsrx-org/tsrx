import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import solid from 'vite-plugin-solid';
import { tsrxSolid } from '../src/index.js';

// #1291: a real Vite pipeline, `@tsrx/vite-plugin-solid` then
// vite-plugin-solid, transforming #1291's shape for the client and the
// server environment.

const root = fileURLToPath(new URL('./fixtures/ssr/', import.meta.url));

/**
 * @param {import('vite').PluginOption[]} plugins
 * @param {'client' | 'ssr'} environment
 */
async function transform(plugins, environment) {
	const server = await createServer({
		root,
		cacheDir: mkdtempSync(join(tmpdir(), 'tsrx-solid-ssr-cache-')),
		configFile: false,
		logLevel: 'silent',
		plugins,
		appType: 'custom',
		server: { middlewareMode: true, hmr: false, ws: false },
		optimizeDeps: { noDiscovery: true, include: [] },
	});
	try {
		return await server.environments[environment].transformRequest('/Field.tsrx');
	} finally {
		await server.close();
	}
}

describe("a Vite server build of #1291's shape", () => {
	it('keeps the DOM output rules with `ssr` off, as in a Vitest `node` environment', async () => {
		const result = await transform([tsrxSolid(), solid()], 'ssr');
		expect(result?.code).toContain('yield 1');
	});

	it('reports TSRX2034 with `ssr` on, as vite-plugin-solid compiles the SSR output', async () => {
		await expect(
			transform([tsrxSolid({ ssr: true }), solid({ ssr: true })], 'ssr'),
		).rejects.toThrow(/does not support `yield` in this part of the template/);
	});

	it('builds the client with `ssr` on', async () => {
		const result = await transform([tsrxSolid({ ssr: true }), solid({ ssr: true })], 'client');
		expect(result?.code).toContain('yield 1');
	});
});
