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
 */
export function runForOfSourcesRuntimeTests() {
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
			it(`renders the items of ${label}`, async () => {
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
