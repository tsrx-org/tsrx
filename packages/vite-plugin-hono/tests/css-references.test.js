import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	buildCssReferenceFixture,
	serveCssReferenceFixture,
} from '@tsrx/core/test-harness/css-references';
import { tsrxHono } from '../src/index.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-css-references');

describe('@tsrx/vite-plugin-hono style references', () => {
	for (const mode of /** @type {const} */ (['server', 'dom'])) {
		it(`resolves a relative url() from the component in ${mode} builds`, async () => {
			const css = await buildCssReferenceFixture({ root, plugins: [tsrxHono({ mode })] });

			expect(css).toContain('data:image/svg+xml');
			expect(css).not.toContain('./asset.svg');
		}, 60_000);
	}

	it('resolves a relative url() from the component in dev', async () => {
		const { url, css } = await serveCssReferenceFixture({
			root,
			plugins: [tsrxHono({ mode: 'dom' })],
		});

		expect(url).toBe('/components/Styled.tsrx?tsrx-css&lang.css');
		expect(css).toContain('data:image/svg+xml');
		expect(css).not.toContain('./asset.svg');
	}, 60_000);
});
