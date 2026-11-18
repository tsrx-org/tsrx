import { describe, expect, it } from 'vitest';
import {
	ArrayRefApp,
	ArrayRefSpreadApp,
	ArrayRefSpreadRefApp,
	EmptyArrayRefApp,
	FalsyArrayRefApp,
	NestedArrayRefApp,
	ObjectArrayRefApp,
	SingleArrayRefApp,
	SpreadArrayRefApp,
	array_ref_log,
	array_ref_object,
	array_ref_value,
} from './array-ref-components.tsrx';

/**
 * Shared runtime suite for a ref list written on the element, `ref={[a, b]}`.
 * The element calls every ref in the list, on its own and beside a spread.
 *
 * Solid applies a ref list itself and is left as it was: it takes only
 * callback refs, has no use for a falsy entry, and calls a spread's ref twice
 * beside the element's own ref (#236), so it turns off `refObjects`,
 * `falsyEntries` and `spreadRef`.
 *
 * @param {{ refObjects?: boolean, falsyEntries?: boolean, spreadRef?: boolean }} [options]
 */
export function runArrayRefRuntimeTests({
	refObjects = true,
	falsyEntries = true,
	spreadRef = true,
} = {}) {
	/** @param {unknown} Component */
	async function mount(Component) {
		array_ref_log.length = 0;
		array_ref_object.current = null;
		array_ref_value.value = null;
		await globalThis.render(Component, {});
		await globalThis.flush?.();
	}

	/** @type {Array<[string, unknown, string, string | null, string[]]>} */
	const cases = [
		['a list of two', ArrayRefApp, '.array-ref', null, ['first', 'second']],
		['a nested list', NestedArrayRefApp, '.nested-array-ref', null, ['first', 'second', 'third']],
		['a list of one', SingleArrayRefApp, '.single-array-ref', null, ['first']],
		['an empty list', EmptyArrayRefApp, '.empty-array-ref', null, []],
		['before a spread', ArrayRefSpreadApp, '.array-ref-spread', 'bag', ['first', 'second']],
		['after a spread', SpreadArrayRefApp, '.spread-array-ref', 'bag', ['first', 'second']],
	];
	if (falsyEntries) {
		cases.push([
			'with falsy entries',
			FalsyArrayRefApp,
			'.falsy-array-ref',
			null,
			['first', 'third'],
		]);
	}
	if (spreadRef) {
		cases.push([
			"beside a spread's ref",
			ArrayRefSpreadRefApp,
			'.array-ref-spread-ref',
			'bag',
			['first', 'second', 'third'],
		]);
	}

	describe('ref lists written on the element', () => {
		for (const [label, Component, selector, title, calls] of cases) {
			it(`calls every ref in the list: ${label}`, async () => {
				await mount(Component);

				const element = globalThis.container.querySelector(selector);
				expect(element).toBeInstanceOf(HTMLInputElement);
				expect(element?.getAttribute('title')).toBe(title);
				expect(array_ref_log).toEqual(calls);
			});
		}

		if (refObjects) {
			it('calls every ref in the list: with ref objects', async () => {
				await mount(ObjectArrayRefApp);

				const container = globalThis.container;
				expect(array_ref_log).toEqual(['first']);
				expect(array_ref_object.current).toBe(container.querySelector('.object-array-ref'));
				expect(array_ref_value.value).toBe(container.querySelector('.lone-value-array-ref'));
			});
		}
	});
}
