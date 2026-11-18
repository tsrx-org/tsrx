import { describe, expect, it } from 'vitest';

/**
 * Checks each `StaticContainers` instance (`static-containers-components.tsrx`)
 * in the container against its props.
 *
 * @param {{ on: boolean, count: number }} props
 * @param {number} instances
 */
export function expectStaticContainers({ on, count }, instances) {
	const roots = globalThis.container.querySelectorAll('.static-containers');
	expect(roots.length).toBe(instances);
	for (const root of roots) {
		/** @param {string} selector */
		const texts = (selector) =>
			Array.from(root.querySelectorAll(selector), (node) => node.textContent?.trim());
		expect(root.getAttribute('data-count')).toBe(String(count));
		expect(texts('.child')).toEqual(['child']);
		expect(texts('.card > .card-header > .header')).toEqual(['header']);
		expect(texts('.card > .card-child')).toEqual(['card child']);
		expect(texts('.on')).toEqual(on ? ['on'] : []);
		expect(texts('.off')).toEqual(on ? [] : ['off']);
		expect(texts('.and')).toEqual(on ? ['and'] : []);
		expect(texts('.or')).toEqual(on ? [] : ['or']);
		expect(root.querySelector('.nested')?.getAttribute('data-count')).toBe(String(count));
		expect(texts('.nested > .nested-static')).toEqual(['nested']);
		expect(texts('.fragment-child')).toEqual(['one', 'two']);
		expect(texts('.keyed')).toEqual([on ? 'keyed on' : 'keyed off']);
		expect(texts('.count')).toEqual([String(count)]);
		expect(texts('.whole-static')).toEqual(['one', 'two', 'three']);
		expect(texts('.mixed-static')).toEqual(['one', 'two', 'three']);
		expect(texts('.mixed-count')).toEqual([String(count)]);
	}
}

/**
 * Shared runtime suite for static JSX in expression containers (#81). `Host`
 * renders two `StaticContainers` (`static-containers-components.tsrx`) from its
 * state, plus a `.static-containers-toggle` button that flips `on` and a
 * `.static-containers-inc` button that adds one to `count`; both start at
 * `false` and `0`. `click` clicks a button and waits for the update. `counted`
 * is the fixture's `counted` export.
 *
 * @param {{ Host: unknown, click: (selector: string) => Promise<void>, counted: { label: string, renders: number } }} options
 */
export function runStaticContainersRuntimeTests({ Host, click, counted }) {
	describe('static JSX in expression containers at runtime (#81)', () => {
		it('renders a component in a fragment again with the component around it (#1352)', async () => {
			// Each `StaticContainers` renders `Counted` in three fragments that
			// no static holds, so hoisting none of them lets the renderer skip it
			counted.label = 'before';
			await globalThis.render(Host);
			await globalThis.flush?.();
			/** @returns {(string | null)[]} */
			const labels = () =>
				Array.from(globalThis.container.querySelectorAll('.counted'), (node) => node.textContent);
			expect(labels()).toEqual(Array(6).fill('before'));

			const renders = counted.renders;
			counted.label = 'after';
			await click('.static-containers-inc');
			expect(counted.renders - renders).toBe(6);
			expect(labels()).toEqual(Array(6).fill('after'));
			counted.label = 'before';
		});

		it('sets the literal value of an input in no static again on each render (#1352)', async () => {
			await globalThis.render(Host);
			await globalThis.flush?.();
			/** @returns {HTMLInputElement[]} */
			const inputs = () => Array.from(globalThis.container.querySelectorAll('.literal-input'));
			for (const input of inputs()) input.value = 'typed';
			await click('.static-containers-inc');
			expect(inputs().map((input) => input.value)).toEqual(['v', 'v']);
		});

		it('renders each static in both instances, and keeps it across updates', async () => {
			await globalThis.render(Host);
			await globalThis.flush?.();
			expectStaticContainers({ on: false, count: 0 }, 2);

			await click('.static-containers-toggle');
			expectStaticContainers({ on: true, count: 0 }, 2);

			await click('.static-containers-inc');
			expectStaticContainers({ on: true, count: 1 }, 2);

			await click('.static-containers-toggle');
			expectStaticContainers({ on: false, count: 1 }, 2);

			await click('.static-containers-inc');
			expectStaticContainers({ on: false, count: 2 }, 2);
		});
	});
}
