import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tsrxHono } from '../src/index.js';
import type { TsrxHonoMode } from '../types/index.js';

test.each(['server', 'dom'] as const)(
	'builds %s JavaScript, CSS, and source maps with Bun',
	async (mode: TsrxHonoMode) => {
		const dir = await mkdtemp(join(import.meta.dir, '.native-'));
		try {
			const entry = join(dir, 'App.tsrx');
			await writeFile(
				entry,
				`export function App() @{ <><style>.message { color: red; }</style><p class="message">{'hello'}</p></> }`,
			);

			const result = await Bun.build({
				entrypoints: [entry],
				target: mode === 'dom' ? 'browser' : 'bun',
				external: ['hono/*', '@tsrx/*'],
				plugins: [tsrxHono({ mode })],
				sourcemap: 'external',
			});

			expect(result.success).toBe(true);
			expect(result.logs).toHaveLength(0);
			const js_output = result.outputs.find((output) => output.path.endsWith('.js'));
			const css_output = result.outputs.find((output) => output.path.endsWith('.css'));
			const map_output = result.outputs.find((output) => output.path.endsWith('.js.map'));
			expect(js_output).toBeDefined();
			expect(css_output).toBeDefined();
			expect(map_output).toBeDefined();

			const js = await js_output!.text();
			const css = await css_output!.text();
			const map = JSON.parse(await map_output!.text()) as {
				sources: string[];
				mappings: string;
			};
			const expected_runtime =
				mode === 'dom'
					? /from "hono\/jsx\/dom\/jsx(?:-dev)?-runtime"/
					: /from "hono\/jsx\/jsx(?:-dev)?-runtime"/;
			const unexpected_runtime =
				mode === 'dom'
					? /from "hono\/jsx\/jsx(?:-dev)?-runtime"/
					: /from "hono\/jsx\/dom\/jsx(?:-dev)?-runtime"/;

			expect(js).toMatch(expected_runtime);
			expect(js).not.toMatch(unexpected_runtime);
			expect(js).not.toContain('react/jsx-runtime');
			expect(css).toContain('color: red');
			expect(css).toMatch(/\.message\.tsrx-/);
			expect(map.sources.some((source) => source.endsWith('App.tsrx'))).toBe(true);
			expect(map.mappings.length).toBeGreaterThan(0);

			if (mode === 'server') {
				const output = join(dir, 'App.js');
				await writeFile(output, js);
				const { App } = await import(output);
				expect(await App().toString()).toMatch(/<p class="message tsrx-[^"]+">hello<\/p>/);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	},
);
