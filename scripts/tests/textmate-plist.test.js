import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toPlist, withoutCapturePatterns } from '../textmate-plist.js';

const repository_dir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const grammar = JSON.parse(
	readFileSync(resolve(repository_dir, 'grammars/textmate/tsrx.tmLanguage.json'), 'utf8'),
);

/**
 * The path of every capture that has `patterns`, such as
 * `repository/jsx-tag-dynamic/endCaptures/9`.
 * @param {unknown} node
 * @param {string} [at]
 * @returns {string[]}
 */
function captures_with_patterns(node, at = '') {
	if (Array.isArray(node)) {
		return node.flatMap((child, index) => captures_with_patterns(child, `${at}/${index}`));
	}
	if (!node || typeof node !== 'object') return [];
	return Object.entries(node).flatMap(([key, value]) => {
		const own = ['captures', 'beginCaptures', 'endCaptures', 'whileCaptures'].includes(key)
			? Object.entries(value)
					.filter(([, capture]) => 'patterns' in capture)
					.map(([group]) => `${at}/${key}/${group}`.slice(1))
			: [];
		return [...own, ...captures_with_patterns(value, `${at}/${key}`)];
	});
}

describe('the .tmLanguage plist (TextMate, Sublime Text)', () => {
	it('has no capture with patterns, which Sublime Text rejects (#1021)', () => {
		// The JSON grammar that VS Code and JetBrains IDEs read keeps them.
		expect(captures_with_patterns(grammar)).toEqual(['repository/jsx-tag-dynamic/endCaptures/9']);
		expect(captures_with_patterns(withoutCapturePatterns(grammar))).toEqual([]);
	});

	it('keeps the scope name of a capture that had patterns', () => {
		const plist_grammar = /** @type {typeof grammar} */ (withoutCapturePatterns(grammar));
		expect(plist_grammar.repository['jsx-tag-dynamic'].endCaptures['9']).toEqual({
			name: 'meta.embedded.expression.js source.js.embedded.tsrx',
		});
		expect(grammar.repository['jsx-tag-dynamic'].endCaptures['9'].patterns).toEqual([
			{ include: '#expression' },
		]);
	});

	it('is checked in as `pnpm regenerate-textmate` writes it', () => {
		const asset = readFileSync(
			resolve(repository_dir, 'assets/TSRX.tmbundle/Syntaxes/tsrx.tmLanguage'),
			'utf8',
		);
		expect(asset).toBe(toPlist(withoutCapturePatterns(grammar)));
	});
});
