import { describe, expect, it } from 'vitest';
import {
	NullishSpreadApp,
	NullishSpreadRefApp,
	NullishSpreadRefInIfApp,
	nullish_spread_ref_nodes,
} from './nullish-spread-ref-components.tsrx';

/**
 * Shared runtime suite for host spreads of an omitted or `null` props bag.
 * A spread of a nullish bag renders nothing, as in native JSX, including when
 * the element also carries a `ref`.
 */
export function runNullishSpreadRefRuntimeTests() {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/**
	 * @param {unknown} Component
	 * @param {Record<string, unknown>} props
	 */
	async function mount(Component, props) {
		nullish_spread_ref_nodes.length = 0;
		await globalThis.render(Component, props);
		await settle();
	}

	/** @param {string} selector */
	function query(selector) {
		return globalThis.container.querySelector(selector);
	}

	describe('nullish host spreads', () => {
		for (const [label, props] of /** @type {const} */ ([
			['an omitted bag', {}],
			['an undefined bag', { bag: undefined }],
			['a null bag', { bag: null }],
		])) {
			it(`spreads ${label} beside an explicit ref`, async () => {
				await mount(NullishSpreadRefApp, props);

				const input = query('.nullish-spread-ref');
				expect(input).toBeInstanceOf(HTMLInputElement);
				expect(input?.hasAttribute('id')).toBe(false);
				expect(nullish_spread_ref_nodes).toEqual([input]);
			});

			it(`spreads ${label} beside an explicit ref inside @if`, async () => {
				await mount(NullishSpreadRefInIfApp, props);

				const input = query('.nullish-spread-ref-if');
				expect(input).toBeInstanceOf(HTMLInputElement);
				expect(nullish_spread_ref_nodes).toEqual([input]);
			});

			it(`spreads ${label} without a ref`, async () => {
				await mount(NullishSpreadApp, props);

				expect(query('.nullish-spread')).toBeInstanceOf(HTMLInputElement);
			});
		}

		it('still spreads an object bag beside an explicit ref', async () => {
			await mount(NullishSpreadRefApp, { bag: { id: 'ok' } });

			const input = query('.nullish-spread-ref');
			expect(input?.id).toBe('ok');
			expect(nullish_spread_ref_nodes).toEqual([input]);
		});
	});
}
