import { describe, expect, it } from 'vitest';
import {
	NestedSpreadRefOrderApp,
	SpreadRefOrderApp,
	SpreadsRefOrderApp,
	spread_ref_order_nodes,
} from './spread-ref-order-components.tsrx';

/**
 * Shared runtime suite for host spreads beside a `ref`. A spread's props bag is
 * evaluated between the attributes around it, as in native JSX, so adding a
 * ref does not reorder attribute side effects. Only targets whose JSX
 * evaluates attributes left to right run it; Solid and Vue compile JSX into
 * setup and effect code with their own evaluation order.
 */
export function runSpreadRefOrderRuntimeTests() {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/** @param {unknown} Component */
	async function mount(Component) {
		spread_ref_order_nodes.length = 0;
		await globalThis.render(Component, {});
		await settle();
	}

	describe('host spread attribute order', () => {
		for (const [label, Component, selector, ref_calls] of /** @type {const} */ ([
			['a spread between attributes', SpreadRefOrderApp, '.spread-ref-order', 1],
			['a spread on a nested element', NestedSpreadRefOrderApp, '.nested-spread-ref-order', 1],
			['two spreads, one carrying a ref', SpreadsRefOrderApp, '.spreads-ref-order', 2],
		])) {
			it(`keeps authored attribute order beside a ref: ${label}`, async () => {
				await mount(Component);

				const element = globalThis.container.querySelector(selector);
				const values = ['data-first', 'data-second', 'data-third'].map(
					(name) => element?.closest(`[${name}]`)?.getAttribute(name) ?? null,
				);
				expect(values).toEqual(['1', '2', '3']);
				expect(spread_ref_order_nodes).toEqual(Array(ref_calls).fill(element));
			});
		}
	});
}
