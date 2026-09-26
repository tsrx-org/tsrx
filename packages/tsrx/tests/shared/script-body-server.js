import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { describe, expect, it } from 'vitest';

const FIXTURE_URL = new URL('./runtime/script-body-components.tsrx', import.meta.url);

/**
 * The text of each `<script>` in server HTML, read as an HTML parser reads it:
 * everything up to the next `</script`.
 * @param {string} html
 * @returns {string[]}
 */
function script_texts(html) {
	return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script/giu)].map((match) => match[1]);
}

/**
 * Shared server-output suite for raw-text `<script>` bodies (#708): server HTML
 * gives each script the text of its body as written, so a browser reads it
 * back exactly, and runs it. Renders the shared runtime fixture through a Vite
 * SSR server with the target's plugins.
 *
 * @param {{
 *   name: string,
 *   root: string,
 *   plugins: () => import('vite').PluginOption[],
 *   render: string,
 * }} options `root` is a directory in the target package, so the fixture
 * resolves the target's dependencies; `render` is the source of a module
 * that exports `render(App): Promise<string>`.
 */
export function runScriptBodyServerTests({ name, root, plugins, render }) {
	describe(`[${name}] raw-text script bodies in server HTML`, () => {
		it('renders each body as written', async () => {
			const dir = mkdtempSync(join(root, '.tmp-script-body-server-'));
			/** @type {import('vite').ViteDevServer | undefined} */
			let server;
			try {
				writeFileSync(join(dir, 'App.tsrx'), readFileSync(FIXTURE_URL, 'utf8'));
				writeFileSync(join(dir, 'render.js'), render);
				server = await createServer({
					root: dir,
					configFile: false,
					cacheDir: join(dir, '.vite'),
					logLevel: 'silent',
					plugins: plugins(),
					optimizeDeps: { noDiscovery: true, include: [] },
					server: { middlewareMode: true, hmr: false, watch: null },
				});
				const renderer = await server.ssrLoadModule('/render.js');
				const fixture = await server.ssrLoadModule('/App.tsrx');
				const html = [
					await renderer.render(fixture.ScriptBodyApp),
					await renderer.render(fixture.ScriptBracesApp),
				].join('');

				/** @type {Array<[string, string, string]>} */
				const cases = fixture.script_body_cases;
				expect(script_texts(html)).toEqual(cases.map(([, , text]) => text));
			} finally {
				await server?.close();
				rmSync(dir, { recursive: true, force: true });
			}
		});
	});
}
