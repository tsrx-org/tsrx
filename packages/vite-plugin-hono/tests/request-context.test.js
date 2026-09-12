import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tsrxHono } from '../src/index.js';

function deferred() {
	let resolve;
	const promise = new Promise((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function create_plugin_context() {
	return { environment: {} };
}

describe('Hono request context integration', () => {
	it('isolates useRequestContext across concurrent TSRX renders', async () => {
		const plugin = tsrxHono();
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-request-context-'),
		);

		try {
			const source_id = path.join(directory, 'RequestPage.tsrx');
			const output_id = path.join(directory, 'RequestPage.js');
			const transformed = await plugin.transform.call(
				create_plugin_context(),
				`import { useRequestContext } from 'hono/jsx-renderer';

				export async function RequestPage({ wait, entered }) @{
					entered();
					await wait;
					const context = useRequestContext();
					<p>{context.req.path}</p>
				}`,
				source_id,
			);
			await writeFile(output_id, transformed.code);

			const [{ RequestPage }, { Hono }, { jsx }, { jsxRenderer }] = await Promise.all([
				import(`${pathToFileURL(output_id).href}?test=${Date.now()}`),
				import('hono'),
				import('hono/jsx'),
				import('hono/jsx-renderer'),
			]);

			const waits = {
				'/first': deferred(),
				'/second': deferred(),
			};
			const entered = {
				'/first': deferred(),
				'/second': deferred(),
			};
			const app = new Hono();
			app.use('*', jsxRenderer());
			for (const requestPath of ['/first', '/second']) {
				app.get(requestPath, (c) =>
					c.render(
						jsx(RequestPage, {
							wait: waits[requestPath].promise,
							entered: entered[requestPath].resolve,
						}),
					),
				);
			}

			const firstText = app.request('/first').then((response) => response.text());
			const secondText = app.request('/second').then((response) => response.text());
			await Promise.all([entered['/first'].promise, entered['/second'].promise]);
			waits['/first'].resolve();
			waits['/second'].resolve();

			const [firstHtml, secondHtml] = await Promise.all([firstText, secondText]);
			expect(firstHtml).toContain('<p>/first</p>');
			expect(secondHtml).toContain('<p>/second</p>');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('preserves useRequestContext through streamed Suspense output', async () => {
		const plugin = tsrxHono();
		const directory = await mkdtemp(
			path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp-hono-stream-request-context-'),
		);

		try {
			const source_id = path.join(directory, 'StreamingRequestPage.tsrx');
			const output_id = path.join(directory, 'StreamingRequestPage.js');
			const transformed = await plugin.transform.call(
				create_plugin_context(),
				`import { useRequestContext } from 'hono/jsx-renderer';
				import { Suspense } from 'hono/jsx/streaming';

				async function AsyncRequestPath({ wait }) {
					await wait;
					const context = useRequestContext();
					return <span>{context.req.path}</span>;
				}

				export function StreamingRequestPage({ wait }) @{
					<Suspense fallback={<span>{'loading'}</span>}>
						<AsyncRequestPath wait={wait} />
					</Suspense>
				}`,
				source_id,
			);
			await writeFile(output_id, transformed.code);

			const [{ StreamingRequestPage }, { Hono }, { jsx }, { jsxRenderer }] = await Promise.all([
				import(`${pathToFileURL(output_id).href}?test=${Date.now()}`),
				import('hono'),
				import('hono/jsx'),
				import('hono/jsx-renderer'),
			]);

			const wait = deferred();
			const app = new Hono();
			app.use(
				'/stream/*',
				jsxRenderer(({ children }) => jsx('main', null, children), { stream: true }),
			);
			app.get('/stream/info', (c) => c.render(jsx(StreamingRequestPage, { wait: wait.promise })));

			const response = await app.request('/stream/info');
			wait.resolve();
			const html = await response.text();
			expect(html).toContain('<span>/stream/info</span>');
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
