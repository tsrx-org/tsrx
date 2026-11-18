import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	create_native_workspace,
	fixture_files_with_native_config,
	parse_tsc_output,
	repo_root,
	run_classic_tsc,
	run_native_tsc,
} from './fixture-utils.js';

const targets_dir = fileURLToPath(new URL('./fixtures/targets/', import.meta.url));

/**
 * Runtime and compiler packages each target fixture resolves from its
 * workspace. `vue-jsx-vapor` is borrowed from the Vite Vue plugin's install so
 * this package does not pull a second `vite` instance into the lockfile.
 * @type {Record<string, Array<string | [string, string]>>}
 */
const target_dependencies = {
	preact: ['@tsrx/preact', 'preact'],
	solid: ['@tsrx/solid', 'solid-js', '@solidjs/web'],
	vue: ['@tsrx/vue', 'vue', ['vue-jsx-vapor', path.join(repo_root, 'packages', 'vite-plugin-vue')]],
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
			dependencies: target_dependencies[target],
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

// Solid and Vue compile an authored `className` on a host element to `class`,
// and so does the type-only output, which neither target's JSX types would
// otherwise accept. A component's `className` prop stays as written, also
// through a dynamic tag, and `class` and `className` around a spread don't
// report two `class` attributes.
/** @param {string} target */
const class_name_source = (target) => `export function Inner(props: { className: string }) @{
	<span class={props.className} />
}

export function Classes(props: { c?: string; bag?: { id?: string } }) @{
	const Tag = Inner;
	<>
		<div className="x" />
		<div className={props.c} />
		<div class="a" className={props.c} />
		<div class="a" {...props.bag} className={props.c} />
		<Inner className="kept" />
		<{Tag} className="dynamic" />${target === 'solid' ? "\n\t\t<p className={Symbol('no')} />" : ''}
	</>
}
`;

describe.each(['solid', 'vue'])('%s target', (target) => {
	it('type-checks an authored className on a host element as class', () => {
		const files = fixture_files_with_native_config(path.join(targets_dir, target));
		files['Classes.tsrx'] = class_name_source(target);
		files['main.ts'] =
			"import { Classes } from './Classes.tsrx';\n\nexport const classes = Classes;\n";
		const created = create_native_workspace(files, {
			dependencies: target_dependencies[target],
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
		// Solid's `class` takes no symbol: the error lands on the authored
		// `className`. Vue's `class` takes any value.
		expect(classic_diagnostics).toEqual(
			target === 'solid'
				? [expect.objectContaining({ file: 'Classes.tsrx', line: 14, column: 6, code: 'TS2322' })]
				: [],
		);
		// TypeScript 7 orders the union in the message differently.
		/** @param {Array<{ file: string, line: number, column: number, code: string }>} list */
		const positions = (list) =>
			list.map(({ file, line, column, code }) => ({ file, line, column, code }));
		expect(positions(parse_tsc_output(native.output))).toEqual(positions(classic_diagnostics));
	});
});
