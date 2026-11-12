// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { describe, it } from 'vitest';
import { expectAssignedImportMember } from '@tsrx/core/test-harness/runtime/assigned-import-member';
import { tsrxHono } from '../src/index.js';

const require = createRequire(import.meta.url);
const FIXTURE =
	require.resolve('@tsrx/core/test-harness/runtime/assigned-import-member-components.tsrx');
const UI = join(dirname(FIXTURE), 'assigned-import-member-ui.js');

// Hono server output hoists static JSX to module level, which would read a
// member tag on an import before the module assigns its property (#1292).
describe('[hono] member tag on an import the module assigns a property of in server HTML (#1292)', () => {
	it('renders the replacement', async () => {
		const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-assigned-'));
		/** @type {import('vite').ViteDevServer | undefined} */
		let server;
		try {
			writeFileSync(join(dir, 'App.tsrx'), readFileSync(FIXTURE, 'utf8'));
			writeFileSync(join(dir, 'assigned-import-member-ui.js'), readFileSync(UI, 'utf8'));
			server = await createServer({
				root: dir,
				configFile: false,
				cacheDir: join(dir, '.vite'),
				logLevel: 'silent',
				plugins: [tsrxHono({ mode: 'server' })],
				optimizeDeps: { noDiscovery: true, include: [] },
				server: { middlewareMode: true, hmr: false, watch: null },
			});
			const { AssignedImportMember } = await server.ssrLoadModule('/App.tsrx');
			globalThis.container = document.createElement('div');
			globalThis.container.innerHTML = String(await (await AssignedImportMember({})).toString());
			expectAssignedImportMember();
		} finally {
			await server?.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
