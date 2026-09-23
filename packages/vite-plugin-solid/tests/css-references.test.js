import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import {
	buildCssReferenceFixture,
	serveCssReferenceFixture,
} from '@tsrx/core/test-harness/css-references';
import { tsrxSolid } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'css-references');

describe('@tsrx/vite-plugin-solid style references', () => {
	it('resolves a relative url() from the component in builds', async () => {
		const css = await buildCssReferenceFixture({ root, plugins: [tsrxSolid(), solid()] });

		expect(css).toContain('data:image/svg+xml');
		expect(css).not.toContain('./asset.svg');
	}, 60_000);

	it('resolves a relative url() from the component in dev', async () => {
		const { url, css } = await serveCssReferenceFixture({ root, plugins: [tsrxSolid(), solid()] });

		expect(url).toBe('/components/Styled.tsrx?tsrx-solid-css&lang.css');
		expect(css).toContain('data:image/svg+xml');
		expect(css).not.toContain('./asset.svg');
	}, 60_000);
});
