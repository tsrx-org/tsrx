/**
 * Tests name an error by its entry in `diagnostics.js` (`TS_ERRORS`,
 * `TSRX_ERRORS`, `UPSTREAM_ERRORS`), or by its code for an acorn or
 * acorn-typescript message that has no entry, and check its code and position,
 * not its message. A test in `error-codes.test.js` checks the wording of each
 * entry once.
 * @typedef {{ code: string } | string} ErrorKind
 */

import * as acorn from 'acorn';
import { expect } from 'vitest';

/**
 * @param {ErrorKind} error
 * @returns {string}
 */
export function code_of(error) {
	return typeof error === 'string' ? error : error.code;
}

/**
 * A matcher for a thrown error of the kind `error`, and at `at`, `line:column`,
 * when given, as acorn gives a thrown error's position.
 * @param {ErrorKind} error
 * @param {string} [at]
 */
export function error_with(error, at) {
	if (at === undefined) return expect.objectContaining({ code: code_of(error) });
	const [line, column] = at.split(':').map(Number);
	return expect.objectContaining({
		code: code_of(error),
		loc: expect.objectContaining({ line, column }),
	});
}

/**
 * The `line:column` of `pos` in `source`, as acorn gives a thrown error's
 * position.
 * @param {string} source
 * @param {number | undefined} pos
 */
export function line_column(source, pos) {
	const { line, column } = acorn.getLineInfo(source, pos ?? 0);
	return `${line}:${column}`;
}

/**
 * The outcome of a parse in a worker (see `parse-in-worker.js`) that throws an
 * error of the kind `error` at `pos`.
 * @param {ErrorKind} error
 * @param {number} pos
 */
export function thrown(error, pos) {
	return { ok: false, code: code_of(error), pos, message: expect.any(String) };
}
