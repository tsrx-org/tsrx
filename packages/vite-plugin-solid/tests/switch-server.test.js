import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import solid from 'vite-plugin-solid';
import { describe, expect, it } from 'vitest';
import { tsrxSolid } from '../src/index.js';

const APP = `export const queue = ['ready', 'loading'];

export function App() @{
	@switch (queue.shift()) {
		@case 'loading': {
			<p>Loading</p>
		}
		@case 'ready': {
			<p>Ready</p>
		}
		@default: {
			<p>Unknown</p>
		}
	}
}
`;

const RENDER = `import { createComponent, renderToString } from '@solidjs/web';
export const render = (App) => renderToString(() => createComponent(App, {}));`;

describe('[solid] @switch in server HTML', () => {
	it('compares every case with one read of the discriminant', async () => {
		const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-switch-server-'));
		/** @type {import('vite').ViteDevServer | undefined} */
		let server;
		try {
			writeFileSync(join(dir, 'App.tsrx'), APP);
			writeFileSync(join(dir, 'render.js'), RENDER);
			server = await createServer({
				root: dir,
				configFile: false,
				cacheDir: join(dir, '.vite'),
				logLevel: 'silent',
				plugins: [tsrxSolid(), solid({ ssr: true, solid: { hydratable: false } })],
				optimizeDeps: { noDiscovery: true, include: [] },
				server: { middlewareMode: true, hmr: false, watch: null },
			});
			const renderer = await server.ssrLoadModule('/render.js');
			const app = await server.ssrLoadModule('/App.tsrx');

			expect(renderer.render(app.App)).toBe('<p>Ready</p>');
			expect(app.queue).toEqual(['loading']);
		} finally {
			await server?.close();
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
