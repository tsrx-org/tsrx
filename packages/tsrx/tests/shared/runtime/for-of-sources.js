import { describe, expect, it } from 'vitest';
import {
	ForOfSourceApp,
	ForOfSourceEmptyApp,
	for_of_source_cases,
} from './for-of-sources-components.tsrx';

/**
 * Shared runtime suite for `@for` sources across the JSX targets: the loop
 * walks any iterable the way `for...of` does, and `@empty` renders only when
 * the walk yields no items.
 *
 * `skipItems` skips the non-empty render of those case labels. Vue still
 * renders three of them through `<VaporFor>`, which does not follow a custom
 * iterator (#1147); their `@empty` cases stay in the suite.
 *
 * @param {{ skipItems?: string[] }} [options]
 */
export function runForOfSourcesRuntimeTests(options = {}) {
	const skip_items = new Set(options.skipItems ?? []);
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/**
	 * @param {unknown} App
	 * @param {string} selector
	 * @param {Iterable<string>} items
	 * @returns {Promise<string[]>}
	 */
	async function render_rows(App, selector, items) {
		await globalThis.render(App, { items });
		await settle();
		const list = globalThis.container.querySelector(selector);
		return Array.from(list?.querySelectorAll('li') ?? [], (li) => li.textContent ?? '');
	}

	describe('@for sources at runtime', () => {
		for (const [label, make, rows] of for_of_source_cases) {
			const render_items = skip_items.has(label) ? it.skip : it;
			render_items(`renders the items of ${label}`, async () => {
				expect(await render_rows(ForOfSourceApp, '.for-of-source', make())).toEqual(rows);
			});

			it(`renders ${label} with @empty`, async () => {
				expect(await render_rows(ForOfSourceEmptyApp, '.for-of-source-empty', make())).toEqual(
					rows.length > 0 ? rows : ['empty'],
				);
			});
		}
	});
}
