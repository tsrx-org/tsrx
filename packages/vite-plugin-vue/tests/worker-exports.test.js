import { runInNewContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moduleRunnerTransform } from 'vite';
import { serveWorkerFixture } from '@tsrx/core/test-harness/worker';
import { tsrxVue } from '../src/index.js';

const fixtures_dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * Run a served module with what a worker that doesn't import Vue has: `self`,
 * and none of the globals Vue's dev runtime defines. Its imports are stubbed.
 *
 * @param {string} code
 * @returns {Promise<unknown[]>} The messages the module posted
 */
async function run_in_worker_scope(code) {
	const transformed = await moduleRunnerTransform(code, null, '/Worker.tsrx', code);
	if (transformed === null) throw new Error('The served module did not transform');

	/** @type {unknown[]} */
	const messages = [];
	await runInNewContext(`(async () => {${transformed.code}\n})()`, {
		self: {
			/** @param {unknown} message */
			postMessage: (message) => messages.push(message),
		},
		__vite_ssr_exportName__() {},
		__vite_ssr_import__: async () => ({ createHotContext: () => ({ accept() {} }) }),
		__vite_ssr_import_meta__: {},
	});
	return messages;
}

describe('@tsrx/vite-plugin-vue web workers that export functions', () => {
	it('loads a worker that exports a function without Vue on the page', async () => {
		const { initial } = await serveWorkerFixture({
			root: join(fixtures_dir, 'worker-exports'),
			files: {
				'Worker.tsrx': `export function greet(value: string): string { return value; }
self.postMessage(greet('hello'));
`,
			},
			entry: 'Worker.tsrx',
			plugins: [tsrxVue()],
		});

		expect(await run_in_worker_scope(initial.code)).toEqual(['hello']);
	}, 60_000);
});
