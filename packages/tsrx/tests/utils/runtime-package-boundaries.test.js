import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { map_iterable as map_iterable_from_core } from '@tsrx/core/runtime/iterable';
import {
	create_ref_prop as create_ref_prop_from_core,
	normalize_spread_props_for_ref_attr as normalize_spread_props_for_ref_attr_from_core,
} from '@tsrx/core/runtime/ref';
import { map_iterable } from '@tsrx/runtime/iterable';
import { create_ref_prop, normalize_spread_props_for_ref_attr } from '@tsrx/runtime/ref';

const runtime_packages = [
	'tsrx-runtime',
	'tsrx-react-runtime',
	'tsrx-preact-runtime',
	'tsrx-solid-runtime',
	'tsrx-vue-runtime',
];

/**
 * Resolve a target runtime from the compiler package that publicly depends on it.
 * pnpm intentionally does not expose those target packages to @tsrx/core's tests.
 *
 * @param {string} compiler_directory
 * @param {string} specifier
 */
async function import_target_runtime(compiler_directory, specifier) {
	const require = createRequire(
		new URL(`../../../${compiler_directory}/package.json`, import.meta.url),
	);
	return import(pathToFileURL(require.resolve(specifier)).href);
}

describe('runtime package boundaries', () => {
	it('keeps compatibility exports wired to the shared runtime implementation', async () => {
		const [react_ref, preact_ref, solid_ref, vue_ref] = await Promise.all([
			import_target_runtime('tsrx-react', '@tsrx/react-runtime/ref'),
			import_target_runtime('tsrx-preact', '@tsrx/preact-runtime/ref'),
			import_target_runtime('tsrx-solid', '@tsrx/solid-runtime/ref'),
			import_target_runtime('tsrx-vue', '@tsrx/vue-runtime/ref'),
		]);

		expect(map_iterable_from_core).toBe(map_iterable);
		expect(create_ref_prop_from_core).toBe(create_ref_prop);
		expect(normalize_spread_props_for_ref_attr_from_core).toBe(normalize_spread_props_for_ref_attr);
		expect(react_ref.normalize_spread_props_for_ref_attr).toBe(normalize_spread_props_for_ref_attr);
		expect(preact_ref.normalize_spread_props_for_ref_attr).toBe(
			normalize_spread_props_for_ref_attr,
		);
		expect(solid_ref.normalize_spread_props_for_ref_attr).toBe(normalize_spread_props_for_ref_attr);
		expect(vue_ref.normalize_spread_props_for_ref_attr).toBe(normalize_spread_props_for_ref_attr);
		expect(map_iterable(new Set(['a', 'b']), (value) => value.toUpperCase())).toEqual(['A', 'B']);
	});

	it.each(runtime_packages)('%s has no compiler dependency', async (directory) => {
		const package_json = JSON.parse(
			await readFile(new URL(`../../../${directory}/package.json`, import.meta.url), 'utf8'),
		);
		const dependencies = {
			...package_json.dependencies,
			...package_json.optionalDependencies,
		};

		expect(dependencies).not.toHaveProperty('@tsrx/core');
		expect(Object.keys(dependencies)).not.toContainEqual(
			expect.stringMatching(/^@tsrx\/(react|preact|solid|vue)$/),
		);
	});
});
