// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { expectStaticContainers } from '@tsrx/core/test-harness/runtime/static-containers';
import { tsrxHono } from '../src/index.js';

const require = createRequire(import.meta.url);
const FIXTURE =
	require.resolve('@tsrx/core/test-harness/runtime/static-containers-components.tsrx');

// Hono server output hoists each static element that an expression container
// renders (#81). Every render, and both instances in one render, must still
// show it.
describe('[hono] static JSX in expression containers in server HTML (#81)', () => {
	it('renders each static in both instances, on every render', async () => {
		const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-static-'));
		/** @type {import('vite').ViteDevServer | undefined} */
		let server;
		try {
			writeFileSync(join(dir, 'App.tsrx'), readFileSync(FIXTURE, 'utf8'));
			server = await createServer({
				root: dir,
				configFile: false,
				cacheDir: join(dir, '.vite'),
				logLevel: 'silent',
				plugins: [tsrxHono({ mode: 'server' })],
				optimizeDeps: { noDiscovery: true, include: [] },
				server: { middlewareMode: true, hmr: false, watch: null },
			});
			const { StaticContainersPair } = await server.ssrLoadModule('/App.tsrx');
			/** @param {{ on: boolean, count: number }} props */
			const render = async (props) => String(await (await StaticContainersPair(props)).toString());

			for (const props of [
				{ on: false, count: 0 },
				{ on: true, count: 1 },
				{ on: false, count: 2 },
			]) {
				const html = await render(props);
				expect(await render(props)).toBe(html);
				globalThis.container = document.createElement('div');
				globalThis.container.innerHTML = html;
				expectStaticContainers(props, 2);
			}
		} finally {
			await server?.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
