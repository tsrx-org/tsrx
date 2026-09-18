import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	create_native_workspace,
	fixture_files_with_native_config,
	parse_tsc_output,
	run_classic_tsc,
	run_native_tsc,
} from './fixture-utils.js';

const targets_dir = fileURLToPath(new URL('./fixtures/targets/', import.meta.url));

/** Runtime and compiler packages each target fixture resolves from its workspace. */
const target_dependencies = {
	preact: ['@tsrx/preact', 'preact'],
	solid: ['@tsrx/solid', 'solid-js', '@solidjs/web'],
	vue: ['@tsrx/vue', 'vue', 'vue-jsx-vapor'],
	ripple: ['@tsrx/ripple', 'ripple'],
};

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

describe.each(Object.keys(target_dependencies))('%s target', (target) => {
	it('produces the same diagnostics under native tsc as under classic tsrx-tsc', () => {
		const files = fixture_files_with_native_config(path.join(targets_dir, target));
		const created = create_native_workspace(files, {
			dependencies: target_dependencies[/** @type {keyof typeof target_dependencies} */ (target)],
		});
		cleanups.push(created.cleanup);

		const classic = run_classic_tsc(created.dir, [
			'--noEmit',
			'-p',
			'tsconfig.json',
			'--pretty',
			'false',
		]);
		const native = run_native_tsc(created.dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);

		const classic_diagnostics = parse_tsc_output(classic.output);
		const native_diagnostics = parse_tsc_output(native.output);
		// The fixture's only error is the intentional cross-file prop-type error.
		expect(classic_diagnostics).toEqual([
			expect.objectContaining({ file: 'main.ts', line: 5, code: 'TS2322' }),
		]);
		expect(native_diagnostics).toEqual(classic_diagnostics);
		expect(native.status).toBe(classic.status);
		expect(native.status).toBe(2);
	});
});
