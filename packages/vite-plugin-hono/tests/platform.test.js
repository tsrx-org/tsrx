import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	buildWithoutPlatformFixture,
	servePlatformChangeFixture,
} from '@tsrx/core/test-harness/platform';
import { tsrxHono } from '../src/index.js';

const fixtures_dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('@tsrx/vite-plugin-hono platform flags', () => {
	it('applies a tsconfig platform change without a manual restart', async () => {
		const { before, after } = await servePlatformChangeFixture({
			root: join(fixtures_dir, 'platform-change'),
			plugins: [tsrxHono({ mode: 'server' })],
		});

		expect(before).toEqual({ module: 'web', tsrx: 'web' });
		expect(after).toEqual({ module: 'ios', tsrx: 'ios' });
	}, 60_000);

	it('rejects a flag in an ordinary module when no platform is configured', async () => {
		const result = await buildWithoutPlatformFixture({
			root: join(fixtures_dir, 'platform-unconfigured'),
			plugins: [tsrxHono({ mode: 'server' })],
			source: "export const selected = import.meta.env.platform.web ? 'web' : 'native';",
		});

		expect(result).toEqual({
			error: expect.stringContaining('Platform flag usage requires a configured TSRX platform'),
		});
	}, 60_000);

	it('builds flag text in a string when no platform is configured', async () => {
		const result = await buildWithoutPlatformFixture({
			root: join(fixtures_dir, 'platform-unconfigured-string'),
			plugins: [tsrxHono({ mode: 'server' })],
			source: 'export const docs = "import.meta.env.platform.web";',
		});

		expect(result).toEqual({ code: expect.stringContaining('"import.meta.env.platform.web"') });
	}, 60_000);
});
