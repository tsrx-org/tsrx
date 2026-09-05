/**
 * Loader for the scoped-style conformance fixtures (RFC tsrx-org/RFCs#1) so
 * consumer compilers run them straight from `@tsrx/core` instead of vendoring
 * copies: `import { load_scoped_styles_fixtures } from
 * '@tsrx/core/test-harness/scoped-styles-fixtures'`. The parser spec table is
 * exposed beside it as `@tsrx/core/test-harness/style-syntax`.
 *
 * See `../fixtures/scoped-styles/README.md` for the expectation schema.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCOPED_STYLES_FIXTURES_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	'../fixtures/scoped-styles',
);

/**
 * @typedef {{
 *   name: string,
 *   path: string,
 *   source: string,
 *   expected: {
 *     elements: Record<string, string[]>,
 *     cssOrder: string[],
 *     pruned: string[],
 *     classMaps: Record<string, string[]>,
 *     knownFailure?: string,
 *   },
 * }} ScopedStylesFixture
 */

/**
 * Every `<name>.tsrx` under the fixture directory (recursively) with its
 * sibling `<name>.expected.json`, sorted by relative path.
 *
 * @param {string} [dir]
 * @returns {ScopedStylesFixture[]}
 */
export function load_scoped_styles_fixtures(dir = SCOPED_STYLES_FIXTURES_DIR) {
	/** @type {ScopedStylesFixture[]} */
	const fixtures = [];
	/** @param {string} directory */
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				visit(path);
				continue;
			}
			if (!entry.name.endsWith('.tsrx')) continue;
			const expected_path = path.replace(/\.tsrx$/, '.expected.json');
			fixtures.push({
				name: relative(dir, path).replace(/\.tsrx$/, ''),
				path,
				source: readFileSync(path, 'utf8'),
				expected: JSON.parse(readFileSync(expected_path, 'utf8')),
			});
		}
	};
	visit(dir);
	return fixtures;
}
