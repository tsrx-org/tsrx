import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import solid from 'vite-plugin-solid';
import { describe, expect, it } from 'vitest';
import { tsrxSolid } from '../src/index.js';

// `@{ }` blocks that are a whole control-flow body. The `@if`, `@else if` and
// `@case` blocks count their setup runs and read `k()`, so a block that
// re-runs when `k` changes shows up.
const APP = `import { createSignal } from 'solid-js';

export const runs = { if: 0, elseIf: 0, case: 0 };
let set_k = (_value) => {};
export const bump = (value) => set_k(value);

export function App() @{
	const [k, setK] = createSignal(0);
	set_k = setK;
	const [on] = createSignal(true);
	const [off] = createSignal(false);
	const kind = 'a';
	const other = 'z';
	<div>
		@if (on()) {
			@{
				const value = (runs.if++, k());
				<i id="if">{'if ' + value}</i>
			}
		}
		@if (off()) {
			<b />
		} @else if (on()) {
			@{
				const value = (runs.elseIf++, k());
				<i id="else-if">{'else-if ' + value}</i>
			}
		}
		@switch (kind) {
			@case 'a': {
				@{
					const value = (runs.case++, k());
					<i id="case">{'case ' + value}</i>
				}
			}
		}
		@switch (other) {
			@case 'a': {
				<b />
			}
			@default: {
				@{
					const value = 'default';
					<i id="default">{value}</i>
				}
			}
		}
	</div>
}
`;

const SERVER = `import { renderToString, generateHydrationScript, createComponent } from '@solidjs/web';
import * as app from './App.tsrx';
export { app };
export const html = () => renderToString(() => createComponent(app.App, {}));
export const script = () => generateHydrationScript();`;

const CLIENT = `import { hydrate, createComponent } from '@solidjs/web';
import * as app from './App.tsrx';
export { app };
export const run = (element) => hydrate(() => createComponent(app.App, {}), element);`;

const DOM_GLOBALS = ['window', 'document', 'Node', 'HTMLElement', 'Element', 'Text', 'Comment'];

async function flush() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('[solid] whole-body @{ } blocks in server HTML and hydration', () => {
	it('renders each block on the server, hydrates it, and runs its setup once', async () => {
		const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.tmp-hydration-'));
		/** @type {Record<string, unknown>} */
		const saved_globals = {};
		/** @type {(() => void) | undefined} */
		let dispose;
		try {
			writeFileSync(join(dir, 'App.tsrx'), APP);
			writeFileSync(join(dir, 'server.js'), SERVER);
			writeFileSync(join(dir, 'client.js'), CLIENT);
			const common = { configFile: false, root: dir, logLevel: /** @type {const} */ ('silent') };
			await build({
				...common,
				plugins: [tsrxSolid(), solid({ ssr: true })],
				build: {
					ssr: join(dir, 'server.js'),
					outDir: join(dir, 'server'),
					minify: false,
					rollupOptions: { output: { entryFileNames: 'server.mjs' } },
				},
			});
			await build({
				...common,
				plugins: [tsrxSolid(), solid({ ssr: true })],
				build: {
					outDir: join(dir, 'client'),
					minify: false,
					lib: { entry: join(dir, 'client.js'), formats: ['es'], fileName: () => 'client.mjs' },
				},
			});

			const server = await import(pathToFileURL(join(dir, 'server', 'server.mjs')).href);
			const html = server.html();
			for (const [id, text] of [
				['if', 'if 0'],
				['else-if', 'else-if 0'],
				['case', 'case 0'],
				['default', 'default'],
			]) {
				expect(html).toMatch(new RegExp(`<i[^>]* id="${id}">${text}</i>`));
			}

			const dom = new JSDOM(
				`<!doctype html><html><head>${server.script()}</head><body><div id="app">${html}</div></body></html>`,
				{ runScripts: 'dangerously' },
			);
			for (const name of [...DOM_GLOBALS, '_$HY']) {
				saved_globals[name] = Reflect.get(globalThis, name);
				Reflect.set(
					globalThis,
					name,
					name === 'window' ? dom.window : Reflect.get(dom.window, name),
				);
			}
			const element = /** @type {HTMLElement} */ (dom.window.document.getElementById('app'));
			const server_markup = element.innerHTML;
			const server_nodes = [...element.querySelectorAll('i')];

			const client = await import(pathToFileURL(join(dir, 'client', 'client.mjs')).href);
			dispose = client.run(element);
			await flush();
			expect(element.innerHTML).toBe(server_markup);
			expect(client.app.runs).toEqual({ if: 1, elseIf: 1, case: 1 });

			client.app.bump(1);
			await flush();
			client.app.bump(2);
			await flush();
			// A block's setup reads `k()`, but it runs untracked, like a body
			// without the `@{ }`: changing `k` neither re-runs it nor replaces its
			// output.
			expect(client.app.runs).toEqual({ if: 1, elseIf: 1, case: 1 });
			expect([...element.querySelectorAll('i')]).toEqual(server_nodes);
		} finally {
			dispose?.();
			for (const [name, value] of Object.entries(saved_globals)) {
				Reflect.set(globalThis, name, value);
			}
			rmSync(dir, { recursive: true, force: true });
		}
	}, 120_000);
});
