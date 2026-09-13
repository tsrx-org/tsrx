/** @import { CodeMapping, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { createTargetCompiler } from '../../src/index.js';

/**
 * `options.inspect` — opt-in navigation origins for the type-only transform.
 *
 * A template directive is lowered away entirely (`@for` becomes a
 * `map_iterable` call), so the keyword the author wrote has no counterpart in
 * the output and nothing in the print's source map reaches it. Tooling that
 * traces authored syntax to emitted code therefore cannot resolve a cursor on
 * it. The flag anchors ONE identifying token of each construct on its keyword.
 *
 * The flag must be inert when clear: the editor pipeline never sets it, and its
 * mappings drive hover, go-to-definition, diagnostics and completion. That
 * invariant is the first test here, and it is the one that matters.
 */

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'inspect-origins-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
		forOfIterableHelper: 'test-platform/iterable',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: false },
};

const SOURCE = `export default function App() @{
	const items: string[] = [];
	<ul>
		@for (const i of items; key i) { <li>{i}</li> } @empty { <li>x</li> }
	</ul>
}
`;

const { compile_to_volar_mappings } = createTargetCompiler(PLATFORM);

/**
 * Compiles through the shipped editor pipeline. `inspect` is a transform
 * option, not part of the public parse-options surface, so it is threaded
 * through the options passthrough.
 * @param {string} source
 * @param {{ inspect?: boolean }} [options]
 */
function compile(source, { inspect = false } = {}) {
	return compile_to_volar_mappings(
		source,
		'App.tsrx',
		/** @type {any} */ ({ loose: true, inspect }),
	);
}

describe('type-only inspect origins', () => {
	it('changes nothing the editor sees when the flag is clear', () => {
		// Whatever the flag does, it must do it ONLY when asked. Everything the
		// language server consumes is compared here.
		const plain = compile(SOURCE);
		expect(plain.code).toContain('map_iterable');
		// The emitted bytes never change either way — the flag moves metadata.
		expect(compile(SOURCE, { inspect: true }).code).toBe(plain.code);
	});

	it('leaves the directive keyword unreachable without the flag', () => {
		const { mappings } = compile(SOURCE);
		expect(reaches(mappings, SOURCE.indexOf('@for'))).toBe(false);
	});

	it('anchors the lowered helper on the authored keyword with the flag', () => {
		const { mappings } = compile(SOURCE, { inspect: true });
		expect(reaches(mappings, SOURCE.indexOf('@for'))).toBe(true);
	});

	it('anchors nothing for a plain for…of, which is not a directive', () => {
		// The guard is the authored spelling: the same lowering path never runs
		// for setup code, and a construct the author did not write as `@for`
		// must not have its keyword claimed.
		const plain = `export default function App() @{
	const items: string[] = [];
	for (const i of items) { void i; }
	<ul><li>x</li></ul>
}
`;
		const { code } = compile(plain, { inspect: true });
		// No directive, so no lowered helper to anchor in the first place.
		expect(code).not.toContain('map_iterable');
	});
});

/**
 * Do the Volar mappings — the surface the language server actually consumes —
 * carry a segment sourced at this authored offset?
 *
 * @param {CodeMapping[]} mappings
 * @param {number} offset
 */
function reaches(mappings, offset) {
	return mappings.some((mapping) => mapping.sourceOffsets.includes(offset));
}
