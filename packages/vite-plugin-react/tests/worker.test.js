import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveWorkerFixture } from '@tsrx/core/test-harness/worker';
import { tsrxReact } from '../src/index.js';

const fixtures_dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** @param {string} message */
const worker = (message) => `const message: string = ${JSON.stringify(message)};
self.postMessage(message);
`;

describe('@tsrx/vite-plugin-react web workers', () => {
	it('compiles a dev worker entry under its file path', async () => {
		const plugin = tsrxReact();
		const source = `export function App() @{
			<>
			<div className="div">{'Hello world'}</div>
			<style>
				.div {
					color: red;
				}
			</style>
			</>
		}`;

		const transformed = await plugin.transform(
			source,
			'/virtual/Worker.tsrx?worker_file&type=module',
		);

		expect(/** @type {any} */ (transformed.map).sources).toEqual(['/virtual/Worker.tsrx']);
		expect(transformed.code).toContain('"/virtual/Worker.tsrx?tsrx-css&lang.css"');
		expect(plugin.load('/virtual/Worker.tsrx?tsrx-css&lang.css')).toContain('color: red;');
	});

	it('leaves other query-suffixed ids to vite', async () => {
		const plugin = tsrxReact();

		for (const id of [
			'/virtual/Worker.tsrx?worker',
			'/virtual/Worker.tsrx?worker&url',
			'/virtual/App.tsrx?raw',
			'/virtual/App.tsrx?url',
		]) {
			expect(await plugin.transform('export default "";', id)).toBeNull();
		}
	});

	it('serves a compiled .tsrx worker entry from the dev server', async () => {
		const { initial, updated } = await serveWorkerFixture({
			root: join(fixtures_dir, 'worker'),
			files: { 'Worker.tsrx': worker('hello') },
			entry: 'Worker.tsrx',
			plugins: [tsrxReact()],
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
