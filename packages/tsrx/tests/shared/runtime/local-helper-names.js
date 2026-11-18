import { expect, it } from 'vitest';
import { EnclosingHelperNameApp } from './local-helper-names-components.tsrx';

/**
 * Shared runtime suite for the helper components the compiler declares inside
 * a component that is itself inside another function. A helper must not
 * shadow a binding of the enclosing function.
 */
export function runLocalHelperNamesRuntimeTests() {
	it('reads an enclosing binding named like the catch helper of a component inside a function', async () => {
		await globalThis.render(EnclosingHelperNameApp, {});
		await globalThis.flush?.();

		expect(globalThis.container.querySelector('.local-helper-caught')?.textContent).toBe(
			'outer: pending catch boom',
		);
		expect(globalThis.container.querySelector('.local-helper-pending')).toBeNull();
	});
}
