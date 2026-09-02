/**
 * Fixture-driven conformance cases for lexically scoped `<style>` blocks,
 * `$class`, and `apply` (RFC tsrx-org/RFCs#1). Every `.tsrx` file under
 * `tests/fixtures/scoped-styles/` compiles on every target that lowers
 * through `createJsxTransform`, and its sibling `.expected.json` states the
 * classes each element must carry, the sheet emission order, the pruned
 * selectors, and the `$class` composition of assigned blocks — all in terms
 * of labels that resolve to hashes at test time. The fixture README documents
 * the schema; other repositories vendor the directory as-is.
 *
 * @import { CompileHarness } from '../../types/index'
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FIXTURE_DIR = fileURLToPath(new URL('../fixtures/scoped-styles/', import.meta.url));
const HASH = 'tsrx-[0-9a-f]+';
const RUNTIME_PREFIX = 'import:';

/**
 * @typedef {object} Expected
 * @property {Record<string, string[]>} elements authored class attribute
 *   value (or `{expression}`) → labels the element must carry, in order
 * @property {string[]} cssOrder labels of the sheet markers in emission order
 * @property {string[]} pruned selectors expected inside `(unused)` comments
 * @property {Record<string, string[]>} classMaps assigned-block variable →
 *   `$class` composition as labels (`own` stands for the variable's label)
 * @property {string} [knownFailure] present when the fixture pins a compiler
 *   defect; the case runs under `it.fails` until the discrepancy is fixed
 */

/**
 * @typedef {object} Fixture
 * @property {string} id path relative to the fixture directory, no extension
 * @property {string} filename basename handed to `compile`
 * @property {string} source
 * @property {Expected} expected
 */

/** @returns {Fixture[]} */
function load_fixtures() {
	return readdirSync(FIXTURE_DIR, { recursive: true, encoding: 'utf8' })
		.filter((entry) => entry.endsWith('.tsrx'))
		.sort()
		.map((entry) => {
			const path = join(FIXTURE_DIR, entry);
			const expected_path = path.replace(/\.tsrx$/, '.expected.json');
			return {
				id: entry.replace(/\.tsrx$/, ''),
				filename: basename(entry),
				source: readFileSync(path, 'utf8'),
				expected: JSON.parse(readFileSync(expected_path, 'utf8')),
			};
		});
}

/**
 * @param {string} text
 * @returns {string}
 */
function escape_regexp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} label
 * @returns {boolean}
 */
function is_runtime(label) {
	return label.startsWith(RUNTIME_PREFIX);
}

/**
 * Every static label a fixture refers to, so marker rules can be told apart
 * from ordinary class selectors of the same sheet.
 *
 * @param {Expected} expected
 * @returns {Set<string>}
 */
function collect_labels(expected) {
	const labels = new Set(expected.cssOrder);
	for (const chain of Object.values(expected.elements)) {
		for (const label of chain) if (!is_runtime(label)) labels.add(label);
	}
	for (const [name, chain] of Object.entries(expected.classMaps)) {
		for (const label of chain) {
			if (is_runtime(label)) continue;
			labels.add(label === 'own' ? name : label);
		}
	}
	return labels;
}

/**
 * Resolve each label to the hash its marker selector `.label.<hash>` was
 * scoped with, asserting every occurrence agrees.
 *
 * @param {string} css
 * @param {Set<string>} labels
 * @returns {Map<string, string>}
 */
function resolve_labels(css, labels) {
	/** @type {Map<string, string>} */
	const hashes = new Map();
	for (const label of labels) {
		const matches = [...css.matchAll(new RegExp(`\\.${escape_regexp(label)}\\.(${HASH})`, 'g'))];
		if (matches.length === 0) {
			throw new Error(`no scoped marker selector for label "${label}" in:\n${css}`);
		}
		const [first] = matches;
		for (const match of matches) expect(match[1]).toBe(first[1]);
		hashes.set(label, first[1]);
	}
	return hashes;
}

/**
 * The labels of the marker rules in the CSS, in emission order. Each block a
 * fixture writes starts with its label's marker rule, so this is the sheet
 * order.
 *
 * @param {string} css
 * @param {Set<string>} labels
 * @returns {string[]}
 */
function emitted_markers(css, labels) {
	return [...css.matchAll(new RegExp(`\\.([A-Za-z_][\\w-]*)\\.${HASH}`, 'g'))]
		.map((match) => match[1])
		.filter((label) => labels.has(label));
}

/**
 * Selector texts of every `(unused)` comment, in order.
 *
 * @param {string} css
 * @returns {string[]}
 */
function pruned_selectors(css) {
	return [...css.matchAll(/\/\* \(unused\) ([\s\S]*?)\*\//g)].map((match) =>
		match[1].split('{')[0].trim(),
	);
}

/**
 * @param {string} label
 * @param {Map<string, string>} hashes
 * @returns {string}
 */
function hash_of(label, hashes) {
	const hash = hashes.get(label);
	if (!hash) throw new Error(`label "${label}" was not resolved`);
	return hash;
}

/**
 * The class attribute the compiler must give an element, as it appears in the
 * generated code. Static hashes fold into the authored literal; a runtime
 * theme or an expression-valued authored class turns it into a template
 * literal with `${…}` parts.
 *
 * @param {string} key
 * @param {string[]} chain
 * @param {Map<string, string>} hashes
 * @returns {string} the text after `class=` / `className=`
 */
function expected_class_attribute(key, chain, hashes) {
	const is_expression = key.startsWith('{') && key.endsWith('}');
	const has_runtime = chain.some(is_runtime);
	const parts = chain.map((label) =>
		is_runtime(label) ? `\${${label.slice(RUNTIME_PREFIX.length)}.$class}` : hash_of(label, hashes),
	);
	if (!is_expression) {
		const value = [key, ...parts].join(' ');
		return has_runtime ? `{\`${value}\`}` : `"${value}"`;
	}
	const expression = key.slice(1, -1);
	if (parts.length === 0) return `{${expression}}`;
	return `{\`\${${expression}} ${parts.join(' ')}\`}`;
}

/**
 * The `$class` value the compiler must give an assigned block: adjacent
 * static hashes share one string literal, runtime reads are `x.$class`, and
 * the separating spaces live in the literals (`'a ' + x.$class + ' b'`).
 *
 * @param {string} name
 * @param {string[]} chain
 * @param {Map<string, string>} hashes
 * @returns {string}
 */
function expected_class_expression(name, chain, hashes) {
	/** @type {string[]} */
	const out = [];
	/** @type {string | null} */
	let literal = null;
	let previous_runtime = false;
	for (const label of chain) {
		if (is_runtime(label)) {
			if (literal !== null) {
				out.push(`'${literal} '`);
				literal = null;
			} else if (previous_runtime) {
				out.push(`' '`);
			}
			out.push(`${label.slice(RUNTIME_PREFIX.length)}.$class`);
			previous_runtime = true;
		} else {
			const hash = hash_of(label === 'own' ? name : label, hashes);
			literal = literal === null ? (previous_runtime ? ` ${hash}` : hash) : `${literal} ${hash}`;
			previous_runtime = false;
		}
	}
	if (literal !== null) out.push(`'${literal}'`);
	return out.join(' + ');
}

/**
 * @param {CompileHarness} harness
 */
export function runSharedScopedStyleConformanceTests({ compile, name }) {
	const fixtures = load_fixtures();
	const passing = fixtures.filter((fixture) => !fixture.expected.knownFailure);
	const failing = fixtures.filter((fixture) => fixture.expected.knownFailure);

	/** @param {Fixture} fixture */
	function check(fixture) {
		const { expected } = fixture;
		const { code, css, cssHash } = compile(fixture.source, fixture.filename);

		const labels = collect_labels(expected);
		const hashes = resolve_labels(css, labels);

		// No style element survives lowering.
		expect(code).not.toContain('<style');

		// Sheets emit in lexical pre-order and cssHash lists each scope once.
		expect(emitted_markers(css, labels)).toEqual(expected.cssOrder);
		const scope_hashes = [...new Set(expected.cssOrder.map((label) => hash_of(label, hashes)))];
		expect(cssHash ? cssHash.split(' ') : []).toEqual(scope_hashes);

		// Unmatched selectors of standalone and local blocks are commented out.
		expect(pruned_selectors(css)).toEqual(expected.pruned);

		// Every element carries its scope chain outer → inner, then the themes.
		for (const [key, chain] of Object.entries(expected.elements)) {
			const attribute = expected_class_attribute(key, chain, hashes);
			expect(code).toMatch(new RegExp(`class(?:Name)?=${escape_regexp(attribute)}`));
		}

		// Assigned blocks expose the composed $class and their own class entries.
		for (const [variable, chain] of Object.entries(expected.classMaps)) {
			const composition = expected_class_expression(variable, chain, hashes);
			expect(code).toMatch(
				new RegExp(
					`\\b${escape_regexp(variable)} = \\{\\s*'\\$class': ${escape_regexp(composition)}\\s*(?:,|\\})`,
				),
			);
			if (chain.includes(variable) || chain.includes('own')) {
				expect(code).toContain(`'${variable}': '${hash_of(variable, hashes)} ${variable}'`);
			}
		}
	}

	describe(`[${name}] scoped style conformance fixtures`, () => {
		it('finds the shared fixture directory', () => {
			expect(fixtures.length).toBeGreaterThan(0);
		});

		it.each(passing.map((fixture) => [fixture.id, fixture]))('%s', (_id, fixture) => {
			check(fixture);
		});

		if (failing.length > 0) {
			it.fails.each(failing.map((fixture) => [fixture.id, fixture]))(
				'%s (known failure)',
				(_id, fixture) => {
					check(fixture);
				},
			);
		}
	});
}
