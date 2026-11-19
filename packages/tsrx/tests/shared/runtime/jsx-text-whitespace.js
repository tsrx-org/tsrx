import { describe, expect, it } from 'vitest';
import {
	JsxTextCharactersApp,
	JsxTextEdgeApp,
	JsxTextOnlyApp,
	JsxTextWhitespaceApp,
	jsx_text_braced_value_cases,
	jsx_text_character_cases,
	jsx_text_edge_cases,
	jsx_text_edge_places,
	jsx_text_nbsp_cases,
	jsx_text_whitespace_cases,
} from './jsx-text-whitespace-components.tsrx';

/**
 * Shared runtime suite for JSX whitespace and characters in template text
 * across the JSX targets: each case renders what the same TSX renders.
 *
 * @param {{ nbsp: 'kept' | 'trimmed', anchors?: 'empty comments', children?: 'slots', references?: 'html' }} options -
 *   `nbsp` is what the target's JSX compiler does with a non-breaking space at
 *   the edge of a line, `anchors` names a marker the target's runtime leaves
 *   in the DOM, which isn't part of what these cases compare, `children` is
 *   `'slots'` where a component reads its children as slots, never as a
 *   string, and `references` is `'html'` where the target's compiler writes
 *   JSX text into an HTML template, which reads HTML's named references
 */
export function runJsxTextWhitespaceRuntimeTests({ nbsp, anchors, children, references }) {
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
		const html = globalThis.container.querySelector(selector)?.innerHTML;
		return anchors === 'empty comments' ? html?.replaceAll('<!---->', '') : html;
	}

	/** @param {string} selector */
	async function render_text(selector) {
		await globalThis.render(JsxTextCharactersApp);
		await settle();
		return globalThis.container.querySelector(selector)?.textContent;
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

	describe('characters in template text at runtime', () => {
		for (const [label, selector, text] of jsx_text_character_cases) {
			it(`renders ${label} like TSX`, async () => {
				expect(await render_text(selector)).toBe(text);
			});
		}
	});

	describe('edge whitespace in JSX in an expression container at runtime (#1351)', () => {
		for (const [label, name, text] of jsx_text_edge_cases) {
			for (const [place, suffix] of jsx_text_edge_places) {
				it(`renders ${label} at the edges of ${place} as written`, async () => {
					await globalThis.render(JsxTextEdgeApp);
					await settle();
					expect(globalThis.container.querySelector(`.${name}-${suffix}`)?.textContent).toBe(text);
				});
			}
		}
	});

	describe("an element's only text at runtime (#1368)", () => {
		it('gives a `<textarea>` its edge whitespace as one child', async () => {
			await globalThis.render(JsxTextOnlyApp);
			await settle();
			expect(
				/** @type {HTMLTextAreaElement | null} */ (
					globalThis.container.querySelector('.only-text-textarea')
				)?.value,
			).toBe(' a ');
		});

		// The parser doesn't decode `&check;`, so the text keeps the split, and
		// each target reads it as it reads such a text anywhere else
		it("reads a name the parser doesn't decode as the target's compiler does", async () => {
			await globalThis.render(JsxTextOnlyApp);
			await settle();
			expect(globalThis.container.querySelector('.only-text-html-name')?.textContent).toBe(
				references === 'html' ? ' \u2713 ' : ' &check; ',
			);
		});

		it('reads its character references as TypeScript does', async () => {
			await globalThis.render(JsxTextOnlyApp);
			await settle();
			expect(globalThis.container.querySelector('.only-text-references')?.textContent).toBe(
				' \u2329\n ',
			);
		});

		it.skipIf(children === 'slots')(
			'gives a component its edge whitespace as one string',
			async () => {
				await globalThis.render(JsxTextOnlyApp);
				await settle();
				expect(globalThis.container.querySelector('.only-text-component')?.textContent).toBe(' A ');
			},
		);
	});
}
