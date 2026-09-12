import { describe, expect, it } from 'vitest';
import { Suspense, createContext, createElement } from 'hono/jsx';
import { renderToReadableStream as renderHonoStream } from 'hono/jsx/streaming';
import {
	renderToReadableStream as renderDomStream,
	renderToString,
} from 'hono/jsx/dom/server';
import { TsrxErrorBoundary } from '../src/error-boundary.js';

const unsafe_html = '<img src=x onerror=globalThis.pwned=true>';
const escaped_html = '&lt;img src=x onerror=globalThis.pwned=true&gt;';

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
});
