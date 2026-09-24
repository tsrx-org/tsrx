import { describe, expect, it } from 'vitest';
import {
	GeneratorSpreadRefApp,
	generator_spread_ref_nodes,
} from './generator-spread-ref-components.tsrx';

/**
 * Shared runtime suite for a host spread beside a `ref` in a ternary arm of a
 * generator helper that yields from the element's attributes. The element
 * takes the value the generator resumes with, spreads its bag, and attaches its
 * ref.
 */
export function runGeneratorSpreadRefRuntimeTests() {
	/** @param {Record<string, unknown>} props */
	async function mount(props) {
		generator_spread_ref_nodes.length = 0;
		await globalThis.render(GeneratorSpreadRefApp, props);
		await globalThis.flush?.();
	}

	function query_all() {
		return Array.from(globalThis.container.querySelectorAll('.generator-spread-ref'));
	}

	const bag = { id: 'first', title: 'First' };

	describe('host spreads beside a ref in a generator that yields', () => {
		it('resumes into the attribute, spreads the bag, and attaches the ref', async () => {
			await mount({ enabled: true, bag });

			const elements = query_all();
			expect(elements.map((element) => [element.id, element.getAttribute('title')])).toEqual([
				[bag.id, `${bag.title} (resumed)`],
			]);
			expect(generator_spread_ref_nodes).toEqual(elements);
		});

		it('renders nothing for the other ternary arm', async () => {
			await mount({ enabled: false, bag });

			expect(query_all()).toEqual([]);
			expect(generator_spread_ref_nodes).toEqual([]);
		});
	});
}
