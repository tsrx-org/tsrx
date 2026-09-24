import { describe, expect, it } from 'vitest';
import {
	CallbackSpreadRefApp,
	DeclaratorSpreadRefApp,
	TemplateCallbackSpreadRefApp,
	TernarySpreadRefApp,
	expression_spread_ref_nodes,
} from './expression-spread-ref-components.tsrx';

/**
 * Shared runtime suite for host spreads beside a `ref` in plain-JS expression
 * positions: a ternary arm, a declarator init, and a `.map()` callback in a
 * plain function or a native template. Each element spreads its bag and
 * attaches its ref, as in native JSX.
 */
export function runExpressionSpreadRefRuntimeTests() {
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
		expression_spread_ref_nodes.length = 0;
		await globalThis.render(Component, props);
		await settle();
	}

	/** @param {string} selector */
	function query_all(selector) {
		return Array.from(globalThis.container.querySelectorAll(selector));
	}

	const bag = { id: 'first', title: 'First' };
	const bags = [bag, { id: 'second', title: 'Second' }];

	describe('host spreads beside a ref in expression position', () => {
		for (const [label, Component, props, selector, rendered] of /** @type {const} */ ([
			[
				'a ternary arm',
				TernarySpreadRefApp,
				{ enabled: true, bag },
				'.expression-spread-ref-ternary',
				[bag],
			],
			[
				'a declarator init',
				DeclaratorSpreadRefApp,
				{ bag },
				'.expression-spread-ref-declarator',
				[bag],
			],
			[
				'a callback in a plain function',
				CallbackSpreadRefApp,
				{ bags },
				'.expression-spread-ref-callback',
				bags,
			],
			[
				'a callback in a native template',
				TemplateCallbackSpreadRefApp,
				{ bags },
				'.expression-spread-ref-template-callback',
				bags,
			],
		])) {
			it(`spreads the bag and attaches the ref in ${label}`, async () => {
				await mount(Component, props);

				const elements = query_all(selector);
				expect(elements.map((element) => [element.id, element.getAttribute('title')])).toEqual(
					rendered.map((item) => [item.id, item.title]),
				);
				expect(expression_spread_ref_nodes).toEqual(elements);
			});
		}

		it('renders nothing for the other ternary arm', async () => {
			await mount(TernarySpreadRefApp, { enabled: false, bag });

			expect(query_all('.expression-spread-ref-ternary')).toEqual([]);
			expect(expression_spread_ref_nodes).toEqual([]);
		});
	});
}
