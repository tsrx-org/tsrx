import { describe, expect, it } from 'vitest';
import {
	NestedSpreadRefOrderApp,
	RefBeforeAttributeApp,
	RefBeforeSpreadApp,
	SpreadClearsRefApp,
	SpreadGetterApp,
	SpreadGetterOwnRefApp,
	SpreadGetterRefApp,
	SpreadRefOrderApp,
	SpreadsRefOrderApp,
	spread_ref_order_nodes,
} from './spread-ref-order-components.tsrx';

/**
 * Shared runtime suite for host spreads beside a `ref`. A spread's props bag is
 * evaluated between the attributes around it, as in native JSX, so adding a
 * ref does not reorder attribute side effects. Its getters are read once, and
 * a `ref` expression is evaluated where it is written. Only targets whose JSX
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

	describe('host spread evaluation', () => {
		for (const [label, Component, selector, ref_calls] of /** @type {const} */ ([
			['without a ref', SpreadGetterApp, '.spread-getter', 0],
			['beside a ref', SpreadGetterRefApp, '.spread-getter-ref', 1],
			['whose bag carries a ref', SpreadGetterOwnRefApp, '.spread-getter-own-ref', 1],
		])) {
			it(`reads a spread getter once ${label}`, async () => {
				await mount(Component);

				const element = globalThis.container.querySelector(selector);
				expect(element?.getAttribute('title')).toBe('1');
				expect(element?.getAttribute('data-reads')).toBe('1');
				expect(spread_ref_order_nodes).toEqual(Array(ref_calls).fill(element));
			});
		}

		it("lets a later spread's `ref: undefined` clear an earlier spread's ref", async () => {
			await mount(SpreadClearsRefApp);

			expect(globalThis.container.querySelector('.spread-clears-ref')).not.toBeNull();
			expect(spread_ref_order_nodes).toEqual([]);
		});

		for (const [label, Component, selector, ref_calls] of /** @type {const} */ ([
			['a spread', RefBeforeSpreadApp, '.ref-before-spread', 2],
			['a later attribute', RefBeforeAttributeApp, '.ref-before-attribute', 1],
		])) {
			it(`evaluates a ref before ${label} in authored order`, async () => {
				await mount(Component);

				const element = globalThis.container.querySelector(selector);
				expect(element?.getAttribute('data-ready')).toBe('true');
				expect(spread_ref_order_nodes).toEqual(Array(ref_calls).fill(element));
			});
		}
	});
}
