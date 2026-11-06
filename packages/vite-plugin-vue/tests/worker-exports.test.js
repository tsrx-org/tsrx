import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveWorkerFixture } from '@tsrx/core/test-harness/worker';
import { tsrxVue } from '../src/index.js';

const fixtures_dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('@tsrx/vite-plugin-vue web workers that export functions', () => {
	it('registers an exported function for hot updates only where Vue has loaded', async () => {
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

		// A worker that doesn't import Vue never defines this global, so a
		// registration outside a check throws as the worker loads.
		const first_use = initial.code.indexOf('__VUE_HMR_RUNTIME__');
		expect(initial.code).toContain('self.postMessage(greet("hello"))');
		expect(initial.code.slice(first_use - 'typeof '.length, first_use)).toBe('typeof ');
		expect(initial.code).not.toMatch(/^__VUE_HMR_RUNTIME__/m);
	}, 60_000);
});
