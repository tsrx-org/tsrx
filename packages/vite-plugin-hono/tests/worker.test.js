import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { serveWorkerFixture } from '@tsrx/core/test-harness/worker';
import { tsrxHono } from '../src/index.js';

const tests_dir = path.dirname(fileURLToPath(import.meta.url));

function create_context() {
	return {
		environment: {
			moduleGraph: {
				getModuleById() {
					return undefined;
				},
				invalidateModule() {},
			},
		},
	};
}

/** @param {string} message */
const worker = (message) => `const message: string = ${JSON.stringify(message)};
self.postMessage(message);
`;

describe('@tsrx/vite-plugin-hono web workers', () => {
	it('compiles a dev worker entry under its file path', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const context = create_context();
		const source = `export function App() @{
			<>
			<div class="div">{'Hello world'}</div>
			<style>
				.div {
					color: red;
				}
			</style>
			</>
		}`;

		const transformed = await plugin.transform.call(
			context,
			source,
			'/virtual/Worker.tsrx?worker_file&type=module',
		);

		expect(transformed.map.sources).toEqual(['/virtual/Worker.tsrx']);
		expect(transformed.code).toContain('"/virtual/Worker.tsrx?tsrx-css&lang.css"');
		expect(plugin.load.call(context, '/virtual/Worker.tsrx?tsrx-css&lang.css')).toContain(
			'color: red;',
		);
	});

	it('leaves other query-suffixed ids to vite', async () => {
		const plugin = tsrxHono({ mode: 'dom' });
		const context = create_context();

		for (const id of [
			'/virtual/Worker.tsrx?worker',
			'/virtual/Worker.tsrx?worker&url',
			'/virtual/App.tsrx?raw',
			'/virtual/App.tsrx?url',
		]) {
			expect(await plugin.transform.call(context, 'export default "";', id)).toBeNull();
		}
	});

	it('serves a compiled .tsrx worker entry from the dev server', async () => {
		const { initial, updated } = await serveWorkerFixture({
			root: path.join(tests_dir, '.tmp-hono-worker'),
			files: { 'Worker.tsrx': worker('hello') },
			entry: 'Worker.tsrx',
			plugins: [tsrxHono({ mode: 'dom' })],
			update: worker('updated'),
		});

		expect(initial.status).toBe(200);
		expect(initial.contentType).toMatch(/^text\/javascript/);
		expect(initial.code).toContain('const message = "hello";');
		// Vite's worker plugin only prepares the entry when its id keeps the
		// worker query.
		expect(initial.code).toMatch(/import ".*\/env\.mjs"/);
		expect(updated?.code).toContain('const message = "updated";');
	}, 60_000);
});
