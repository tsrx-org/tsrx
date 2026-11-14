import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { for_of_head_scope_cases } from './for-of-head-scope-components.tsrx';

/**
 * Shared runtime suite for the scopes of an `@for` head and body across the
 * JSX targets: the body can declare the item's or the index's name again
 * (#1325), and a default in the item's pattern can read the index (#1312).
 * A key the head gives reads the head's names, so the rows' keys stay
 * distinct where the target reports a repeated key.
 */
export function runForOfHeadScopeRuntimeTests() {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	describe('@for head and body scopes at runtime', () => {
		/** @type {import('vitest').MockInstance | undefined} */
		let console_error;

		beforeEach(() => {
			console_error = vi.spyOn(console, 'error');
		});

		afterEach(() => {
			console_error?.mockRestore();
		});

		for (const [label, App, list, rows, expected] of for_of_head_scope_cases) {
			it(`renders ${label}`, async () => {
				await globalThis.render(App, { rows });
				await settle();
				const items = globalThis.container.querySelectorAll(`.${list} li`);
				expect(Array.from(items, (li) => li.textContent)).toEqual(expected);
				// React reports rows that share a key.
				const repeated_keys = console_error?.mock.calls.filter((args) =>
					String(args[0]).includes('same key'),
				);
				expect(repeated_keys).toEqual([]);
			});
		}
	});
}
