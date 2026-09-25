import { describe, expect, it } from 'vitest';
import {
	ExpressionChildrenInterleavedApp,
	SpreadChildrenApp,
	SpreadChildrenComponentApp,
	SpreadChildrenFragmentApp,
	SpreadChildrenInterleavedApp,
} from './spread-children-components.tsrx';

/**
 * Shared runtime suite for JSX spread children (`{...children}`): the spread
 * items render in place, between the siblings around them. Vue reports spread
 * children at compile time, so it does not run this suite.
 */
export function runSpreadChildrenRuntimeTests() {
	async function settle() {
		const flush = globalThis.flush;
		if (flush) {
			await flush();
		}
	}

	/**
	 * @param {unknown} Component
	 * @param {{ items: string[] }} props
	 */
	async function mount(Component, props) {
		await globalThis.render(Component, props);
		await settle();
	}

	/** @param {string} selector */
	function texts(selector) {
		return Array.from(globalThis.container.querySelectorAll(selector), (node) => node.textContent);
	}

	describe('JSX spread children', () => {
		it('renders spread children between their siblings', async () => {
			await mount(SpreadChildrenApp, { items: ['a', 'b'] });
			expect(texts('.spread-children > li')).toEqual(['first', 'a', 'b', 'last']);
		});

		it('renders nothing for an empty spread', async () => {
			await mount(SpreadChildrenApp, { items: [] });
			expect(texts('.spread-children > li')).toEqual(['first', 'last']);
		});

		it('renders a spread that is the only child of a fragment', async () => {
			await mount(SpreadChildrenFragmentApp, { items: ['a', 'b'] });
			expect(texts('.spread-children-fragment > b')).toEqual(['a', 'b']);
		});

		it('passes spread children to a component', async () => {
			await mount(SpreadChildrenComponentApp, { items: ['a', 'b'] });
			expect(texts('.spread-children-box > i')).toEqual(['a', 'b', 'end']);
		});

		it('renders a spread child at its source position before a later setup statement', async () => {
			await mount(ExpressionChildrenInterleavedApp, { items: ['a', 'b'] });
			expect(texts('.expression-children-interleaved > li')).toEqual(['a', 'b', '3']);

			await mount(SpreadChildrenInterleavedApp, { items: ['a', 'b'] });
			expect(texts('.spread-children-interleaved > li')).toEqual(['a', 'b', '3']);
		});
	});
}
