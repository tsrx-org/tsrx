import { describe, expect, it } from 'vitest';
import {
	ArraySecondSpreadRefApp,
	ArraySpreadOwnRefApp,
	ArraySpreadRefApp,
	ArraySpreadRefPropsApp,
	LoneObjectArraySpreadRefApp,
	NestedArraySpreadRefApp,
	ObjectArraySpreadRefApp,
	SingleArraySpreadRefApp,
	array_spread_ref_log,
	array_spread_ref_object,
	array_spread_ref_value,
} from './array-spread-ref-components.tsrx';

/**
 * Shared runtime suite for a host spread whose bag's `ref` is a ref list. The
 * element calls every ref in the list, including when the list is the bag's
 * only ref.
 *
 * Solid takes only callback refs, and calls a spread's ref twice beside the
 * element's own ref (#236), so it turns off `refObjects` and `ownRef`.
 *
 * @param {{ refObjects?: boolean, ownRef?: boolean }} [options]
 */
export function runArraySpreadRefRuntimeTests({ refObjects = true, ownRef = true } = {}) {
	/** @param {unknown} Component */
	async function mount(Component) {
		array_spread_ref_log.length = 0;
		array_spread_ref_object.current = null;
		array_spread_ref_value.value = null;
		await globalThis.render(Component, {});
		await globalThis.flush?.();
	}

	/** @type {Array<[string, unknown, string, string | null, string[]]>} */
	const cases = [
		["the bag's only ref", ArraySpreadRefApp, '.array-spread-ref', null, ['first', 'second']],
		[
			'beside other props',
			ArraySpreadRefPropsApp,
			'.array-spread-ref-props',
			'bag',
			['first', 'second'],
		],
		[
			'in a second spread',
			ArraySecondSpreadRefApp,
			'.array-second-spread-ref',
			'bag',
			['first', 'second'],
		],
		[
			'nested in a list',
			NestedArraySpreadRefApp,
			'.nested-array-spread-ref',
			null,
			['first', 'second'],
		],
		['of one ref', SingleArraySpreadRefApp, '.single-array-spread-ref', null, ['first']],
	];
	if (ownRef) {
		cases.push([
			"beside the element's own ref",
			ArraySpreadOwnRefApp,
			'.array-spread-own-ref',
			null,
			['own', 'first', 'second'],
		]);
	}

	describe('host spreads whose ref is a list', () => {
		for (const [label, Component, selector, title, calls] of cases) {
			it(`calls every ref in the list: ${label}`, async () => {
				await mount(Component);

				const element = globalThis.container.querySelector(selector);
				expect(element).toBeInstanceOf(HTMLInputElement);
				expect(element?.getAttribute('title')).toBe(title);
				expect(array_spread_ref_log).toEqual(calls);
			});
		}

		if (refObjects) {
			it('calls every ref in the list: with a ref object', async () => {
				await mount(ObjectArraySpreadRefApp);

				const element = globalThis.container.querySelector('.object-array-spread-ref');
				expect(element).toBeInstanceOf(HTMLInputElement);
				expect(array_spread_ref_log).toEqual(['first']);
				expect(array_spread_ref_object.current).toBe(element);
			});

			it('calls every ref in the list: a lone ref object', async () => {
				await mount(LoneObjectArraySpreadRefApp);

				const container = globalThis.container;
				expect(array_spread_ref_object.current).toBe(
					container.querySelector('.lone-current-array-spread-ref'),
				);
				expect(array_spread_ref_value.value).toBe(
					container.querySelector('.lone-value-array-spread-ref'),
				);
			});
		}
	});
}
