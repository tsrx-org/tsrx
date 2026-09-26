import { describe, expect, it } from 'vitest';
import { error } from '../../src/errors.js';

/**
 * `error()` is the collected-diagnostics channel every analyzer reports
 * through, and the factory consumer compilers (e.g. octane) use to attach
 * their own diagnostics. These tests pin the `severity` passthrough: a
 * collected diagnostic marked `'warning'` keeps that marking so the language
 * server and `tsrx-tsc` can surface it as a warning rather than an error.
 */
describe('error()', () => {
	/** @type {Parameters<typeof error>[2]} */
	const node = /** @type {never} */ ({ start: 5, end: 10 });

	it('collects a diagnostic carrying a warning severity', () => {
		/** @type {import('../../types/index').CompileError[]} */
		const errors = [];
		error(
			"'.a' is never referenced",
			'App.tsrx',
			node,
			errors,
			undefined,
			'octane-style-unused-selector',
			'warning',
		);

		expect(errors).toHaveLength(1);
		expect(errors[0].message).toBe("'.a' is never referenced");
		expect(errors[0].code).toBe('octane-style-unused-selector');
		expect(errors[0].severity).toBe('warning');
		expect(errors[0].type).toBe('usage');
		expect(errors[0].pos).toBe(5);
		expect(errors[0].end).toBe(10);
	});

	it('leaves severity unset on ordinary collected errors', () => {
		/** @type {import('../../types/index').CompileError[]} */
		const errors = [];
		error('bad', 'App.tsrx', node, errors, undefined, 'tsrx-style-apply-target');

		expect(errors[0].severity).toBeUndefined();
	});

	it('still throws a fatal error when no collection array is given', () => {
		expect(() => error('bad', 'App.tsrx', node)).toThrowError('bad');
	});
});
