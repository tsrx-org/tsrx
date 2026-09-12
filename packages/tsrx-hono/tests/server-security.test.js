import { describe, expect, it } from 'vitest';
import { Suspense, createContext, createElement } from 'hono/jsx';
import { renderToReadableStream as renderHonoStream } from 'hono/jsx/streaming';
import { renderToReadableStream as renderDomStream, renderToString } from 'hono/jsx/dom/server';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { compile } from '../src/index.js';
import { TsrxErrorBoundary } from '../src/error-boundary.js';

const unsafe_html = '<img src=x onerror=globalThis.pwned=true>';
const escaped_html = '&lt;img src=x onerror=globalThis.pwned=true&gt;';
const test_dir = path.dirname(fileURLToPath(import.meta.url));

/** @param {ReadableStream<Uint8Array>} stream */
async function drain(stream) {
	const decoder = new TextDecoder();
	let html = '';
	for await (const chunk of stream) html += decoder.decode(chunk, { stream: true });
	return html + decoder.decode();
}

describe('@tsrx/hono minimum-version escaping', () => {
	it('escapes plain Suspense children and fallbacks in server streams', async () => {
		const Async = async () => createElement('span', null, 'done');
		const child = createElement(
			Suspense,
			{ fallback: 'loading' },
			unsafe_html,
			createElement(Async),
		);
		const fallback = createElement(
			Suspense,
			{ fallback: unsafe_html },
			createElement(async () => {
				await Promise.resolve();
				return createElement('span', null, 'done');
			}),
		);

		const child_html = await drain(renderHonoStream(child));
		const fallback_html = await drain(renderHonoStream(fallback));
		expect(child_html).toContain(escaped_html);
		expect(child_html).not.toContain(unsafe_html);
		expect(fallback_html).toContain(escaped_html);
		expect(fallback_html).not.toContain(unsafe_html);
	});

	it('escapes boundary children with async siblings and target fallbacks', async () => {
		const Async = async () => createElement('span', null, 'done');
		const Broken = () => {
			throw new Error(unsafe_html);
		};
		const children = createElement(
			TsrxErrorBoundary,
			{ fallback: 'error' },
			unsafe_html,
			createElement(Async),
		);
		const fallback = createElement(
			TsrxErrorBoundary,
			{ fallbackRender: (/** @type {Error} */ error) => error.message },
			createElement(Broken),
		);

		for (const node of [children, fallback]) {
			const html = await drain(renderHonoStream(node));
			expect(html).toContain(escaped_html);
			expect(html).not.toContain(unsafe_html);
		}
	});

	it('escapes a single plain Context.Provider child', async () => {
		const Context = createContext('default');
		const node = createElement(Context.Provider, { value: 'provided' }, unsafe_html);
		const html = String(await node.toString());

		expect(html).toBe(escaped_html);
	});

	it('escapes plain hono/jsx/dom/server roots', async () => {
		expect(renderToString(unsafe_html)).toBe(escaped_html);
		expect(await drain(await renderDomStream(unsafe_html))).toBe(escaped_html);
	});

	it('keeps compiled TSRX children, attributes, and control-flow fallbacks untrusted', async () => {
		const source = `
			function Broken({ value }) { throw new Error(value); }
			async function Pending({ value }) {
				await Promise.resolve();
				return <span>{value}</span>;
			}

			export function App({ value }) @{
				<>
					<div title={value}>{value}</div>
					@if (true) { <p>{value}</p> }
					@for (const item of [value]) { <p>{item}</p> }
					@try { <Pending value={value} /> } @pending { <p>{value}</p> }
					@try { <Broken value={value} /> } @catch (error) { <p>{error.message}</p> }
				</>
			}
		`;
		const compiled = compile(source, 'CompiledSecurity.tsrx');
		const javascript = ts.transpileModule(compiled.code, {
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				jsxImportSource: 'hono/jsx',
				module: ts.ModuleKind.ESNext,
				target: ts.ScriptTarget.ES2022,
			},
			fileName: 'CompiledSecurity.tsx',
		}).outputText;
		const module_dir = await mkdtemp(path.join(test_dir, '.compiled-security-'));
		try {
			const module_path = path.join(module_dir, 'fixture.mjs');
			await writeFile(module_path, javascript);
			const { App } = await import(pathToFileURL(module_path).href);
			const html = await drain(renderHonoStream(App({ value: unsafe_html })));

			expect(html).toContain(escaped_html);
			expect(html).not.toContain(unsafe_html);
			expect(html.match(new RegExp(escaped_html, 'g'))?.length).toBeGreaterThanOrEqual(6);
		} finally {
			await rm(module_dir, { recursive: true, force: true });
		}
	});
});
