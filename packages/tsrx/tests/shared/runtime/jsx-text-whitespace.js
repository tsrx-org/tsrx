import { describe, expect, it } from 'vitest';
import {
	JsxTextWhitespaceApp,
	jsx_text_braced_value_cases,
	jsx_text_nbsp_cases,
	jsx_text_whitespace_cases,
} from './jsx-text-whitespace-components.tsrx';

/**
 * Shared runtime suite for JSX whitespace in template text across the JSX
 * targets: each case renders what the same TSX renders.
 *
 * @param {{ nbsp: 'kept' | 'trimmed' }} options - What the target's JSX
 *   compiler does with a non-breaking space at the edge of a line
 */
export function runJsxTextWhitespaceRuntimeTests({ nbsp }) {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/** @param {string} selector */
	async function render(selector) {
		await globalThis.render(JsxTextWhitespaceApp);
		await settle();
		return globalThis.container.querySelector(selector)?.innerHTML;
	}

	describe('JSX whitespace in template text at runtime', () => {
		for (const [label, selector, html] of jsx_text_whitespace_cases) {
			it(`renders ${label} like TSX`, async () => {
				expect(await render(selector)).toBe(html);
			});
		}

		for (const [label, selector, kept, trimmed] of jsx_text_nbsp_cases) {
			it(`renders ${label} like TSX`, async () => {
				expect(await render(selector)).toBe(nbsp === 'kept' ? kept : trimmed);
			});
		}

		for (const [label, selector, braced] of jsx_text_braced_value_cases) {
			it(`renders ${label} like the same markup in a braced value`, async () => {
				const html = await render(selector);
				expect(html).toBeTypeOf('string');
				expect(html).toBe(globalThis.container.querySelector(braced)?.innerHTML);
			});
		}
	});
}
