import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SourceMapConsumer } from 'source-map';
import { tsrxHono } from '../src/index.js';
import type { TsrxHonoMode } from '../types/index.js';

const source = `export function App({ message }: { message: string }) @{
	<><style>.message { color: red; }</style><p class="message">{message}</p></>
}`;

test.each(['server', 'dom'] as const)(
	'builds %s JavaScript, CSS, and source maps with Bun',
	async (mode: TsrxHonoMode) => {
		const dir = await mkdtemp(join(import.meta.dir, '.native-'));
		try {
			const entry = join(dir, 'App.tsrx');
			await writeFile(entry, source);

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
				sourcesContent: Array<string | null>;
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
			const authored_source_index = map.sources.findIndex((source) => source.endsWith('App.tsrx'));
			expect(map.sourcesContent[authored_source_index]).toBe(source);
			const generated_offset = js.indexOf('message');
			const generated_prefix = js.slice(0, generated_offset);
			const generated_line = generated_prefix.split('\n').length;
			const generated_column = generated_prefix.length - generated_prefix.lastIndexOf('\n') - 1;
			await SourceMapConsumer.with(map, null, (consumer) => {
				const original = consumer.originalPositionFor({
					line: generated_line,
					column: generated_column,
				});
				expect(original.source).toMatch(/App\.tsrx$/);
				expect(original.line).toBe(2);
				expect(source.split('\n')[original.line! - 1].slice(original.column!)).toMatch(
					/^"message"/,
				);
			});

			if (mode === 'server') {
				const output = join(dir, 'App.js');
				await writeFile(output, js);
				const { App } = await import(output);
				expect(await App({ message: 'hello' }).toString()).toMatch(
					/<p class="message tsrx-[^"]+">hello<\/p>/,
				);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	},
);

test('rewrites external source maps emitted to an outdir', async () => {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		const entry = join(dir, 'App.tsrx');
		const outdir = join(dir, 'dist');
		await writeFile(entry, source);

		const result = await Bun.build({
			entrypoints: [entry],
			outdir,
			target: 'bun',
			external: ['hono/*', '@tsrx/*'],
			plugins: [tsrxHono()],
			sourcemap: 'external',
		});

		expect(result.success).toBe(true);
		const returned_map = result.outputs.find((output) => output.path.endsWith('.js.map'));
		expect(returned_map).toBeDefined();
		const returned = JSON.parse(await returned_map!.text()) as {
			sources: string[];
			sourcesContent: Array<string | null>;
		};
		const written = JSON.parse(
			await readFile(join(outdir, 'App.js.map'), 'utf8'),
		) as typeof returned;
		for (const map of [returned, written]) {
			const authored_source_index = map.sources.findIndex((item) => item.endsWith('App.tsrx'));
			expect(authored_source_index).toBeGreaterThanOrEqual(0);
			expect(map.sourcesContent[authored_source_index]).toBe(source);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('composes inline source maps back to authored TSRX', async () => {
	const dir = await mkdtemp(join(import.meta.dir, '.native-'));
	try {
		const entry = join(dir, 'App.tsrx');
		await writeFile(entry, source);

		const result = await Bun.build({
			entrypoints: [entry],
			target: 'bun',
			external: ['hono/*', '@tsrx/*'],
			plugins: [tsrxHono()],
			sourcemap: 'inline',
		});

		expect(result.success).toBe(true);
		const js_output = result.outputs.find((output) => output.path.endsWith('.js'));
		expect(js_output).toBeDefined();
		const match = (await js_output!.text()).match(
			/sourceMappingURL=data:application\/json(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=]+)/,
		);
		expect(match).not.toBeNull();
		const map = JSON.parse(Buffer.from(match![1], 'base64').toString('utf8')) as {
			sources: string[];
			sourcesContent: Array<string | null>;
		};
		const authored_source_index = map.sources.findIndex((item) => item.endsWith('App.tsrx'));
		expect(authored_source_index).toBeGreaterThanOrEqual(0);
		expect(map.sourcesContent[authored_source_index]).toBe(source);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
