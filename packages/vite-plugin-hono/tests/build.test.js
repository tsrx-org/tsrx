import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { resolveHonoTarget } from '@tsrx/hono/target';
import { tsrxHono } from '../src/index.js';

const tests_dir = dirname(fileURLToPath(import.meta.url));

async function build_fixture(mode) {
	const target = resolveHonoTarget(mode);
	const root = await mkdtemp(join(tests_dir, `.tmp-${mode}-`));
	try {
		await writeFile(join(root, 'main.js'), `export { App } from './App.tsrx';\n`);
		await writeFile(
			join(root, 'App.tsrx'),
			`export function App({ show }) @{
				<>
					@if (show) { <main class="message">{'Hello'}</main> }
					<style>.message { color: rebeccapurple; }</style>
				</>
			}`,
		);

		const result = await build({
			root,
			logLevel: 'silent',
			plugins: [tsrxHono({ mode })],
			build: {
				write: false,
				sourcemap: true,
				lib: { entry: 'main.js', formats: ['es'] },
				rollupOptions: {
					external: [target.jsxImportSource + '/jsx-runtime'],
				},
			},
		});

		return Array.isArray(result)
			? result.flatMap((build_result) => build_result.output)
			: result.output;
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('@tsrx/vite-plugin-hono production builds', () => {
	it.each(['server', 'dom'])(
		'builds %s mode with CSS and source maps',
		async (mode) => {
			const target = resolveHonoTarget(mode);
			const output = await build_fixture(mode);
			const chunk = output.find((entry) => entry.type === 'chunk');
			const css = output.find((entry) => entry.type === 'asset' && entry.fileName.endsWith('.css'));

			expect(chunk.code).toContain(target.jsxImportSource + '/jsx-runtime');
			expect(chunk.map.sources.some((source) => source.endsWith('App.tsrx'))).toBe(true);
			expect(String(css.source)).toMatch(/color:(?:rebeccapurple|#639)/);

			const other = resolveHonoTarget(mode === 'dom' ? 'server' : 'dom');
			expect(chunk.code).not.toContain(other.jsxImportSource + '/jsx-runtime');
		},
		30_000,
	);
});
