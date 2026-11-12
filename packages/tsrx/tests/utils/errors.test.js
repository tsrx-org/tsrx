import { describe, expect, it } from 'vitest';
import { TSRX_ERRORS } from '../../src/diagnostics.js';
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

	it("keeps an error entry's code alongside a warning severity", () => {
		/** @type {import('../../types/index').CompileError[]} */
		const errors = [];
		const entry = TSRX_ERRORS.UNCLOSED_TAG('div');
		error(entry, 'App.tsrx', node, errors, undefined, undefined, 'warning');

		expect(errors[0]).toMatchObject({
			message: entry.message,
			code: entry.code,
			severity: 'warning',
		});
	});

	it('still throws a fatal error when no collection array is given', () => {
		expect(() => error('bad', 'App.tsrx', node)).toThrowError('bad');
	});

	it('does not throw a warning when no collection array is given', () => {
		// A compile that doesn't collect, such as a Vite build, passes no
		// `errors`. Throwing there would fail the build on a warning.
		expect(() =>
			error(
				"'.a' is never referenced",
				'App.tsrx',
				node,
				undefined,
				undefined,
				'octane-style-unused-selector',
				'warning',
			),
		).not.toThrow();
	});
});
