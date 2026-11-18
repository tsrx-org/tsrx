import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	create_native_workspace,
	parse_tsc_output,
	repo_root,
	run_classic_tsc,
	run_native_tsc,
} from './fixture-utils.js';

/**
 * A ref list written on an element, `ref={[a, b]}`, type-checks on every
 * target, as the editor and `tsrx-tsc` see it. Solid takes a ref list itself,
 * with callback refs only, so its source leaves out ref objects and falsy
 * entries.
 */

const CALLBACK_REFS = `const a = (node: HTMLInputElement | null) => {};
const b = (node: Element | null) => () => {};

export function Direct() @{
	<input ref={[a, b]} />
}

export function Nested() @{
	<input ref={[a, [b]]} />
}

export function BeforeSpread(props: { title?: string }) @{
	<input ref={[a, b]} {...props} />
}

export function AfterSpread(props: { title?: string }) @{
	<input {...props} ref={[a, b]} />
}
`;

const ALL_REFS = `${CALLBACK_REFS}
const object: { current: HTMLInputElement | null } = { current: null };
const show = false as boolean;
const count = 0 as number;
const label = '' as string;

export function Falsy() @{
	<input ref={[a, show && b, count && b, label && b, null, undefined]} />
}

export function Objects() @{
	<input ref={[a, [object]]} />
}
`;

/**
 * `native: false` for Vue: TypeScript 7 reports Vue's `VNodeRef` mismatch on
 * every merged ref, including the one a spread beside a `ref` already gets
 * (#234); #1127 types Vue's `mergeRefs` for it.
 * @type {Record<string, { compiler: string, jsx: string, jsxImportSource: string, dependencies?: Array<string | [string, string]>, source: string, native: boolean }>}
 */
const targets = {
	react: {
		compiler: '@tsrx/react',
		jsx: 'react-jsx',
		jsxImportSource: 'react',
		source: ALL_REFS,
		native: true,
	},
	preact: {
		compiler: '@tsrx/preact',
		jsx: 'react-jsx',
		jsxImportSource: 'preact',
		dependencies: ['@tsrx/preact', 'preact'],
		source: ALL_REFS,
		native: true,
	},
	solid: {
		compiler: '@tsrx/solid',
		jsx: 'preserve',
		jsxImportSource: '@solidjs/web',
		dependencies: ['@tsrx/solid', 'solid-js', '@solidjs/web'],
		source: CALLBACK_REFS,
		native: true,
	},
	vue: {
		compiler: '@tsrx/vue',
		jsx: 'preserve',
		jsxImportSource: 'vue-jsx-vapor',
		dependencies: [
			'@tsrx/vue',
			'vue',
			['vue-jsx-vapor', path.join(repo_root, 'packages', 'vite-plugin-vue')],
		],
		source: ALL_REFS,
		native: false,
	},
};

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * A workspace that checks `source` as `Refs.tsrx` for one target.
 * @param {typeof targets[string]} target
 * @param {string} source
 * @returns {string}
 */
function workspace(target, source) {
	const created = create_native_workspace(
		{
			'Refs.tsrx': source,
			'main.ts': "export * from './Refs.tsrx';\n",
			'tsconfig.json': JSON.stringify({
				tsrx: { compiler: target.compiler },
				compilerOptions: {
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: target.jsx,
					jsxImportSource: target.jsxImportSource,
					allowImportingTsExtensions: true,
					target: 'ES2022',
					lib: ['ES2022', 'DOM'],
					strict: true,
					skipLibCheck: true,
					types: [],
					noEmit: true,
				},
				include: ['main.ts'],
			}),
			'tsconfig.native.json': JSON.stringify({
				extends: './tsconfig.json',
				contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }],
			}),
		},
		target.dependencies ? { dependencies: target.dependencies } : {},
	);
	cleanups.push(created.cleanup);
	return created.dir;
}

/** @param {string} tsconfig */
const tsc_args = (tsconfig) => ['--noEmit', '-p', tsconfig, '--pretty', 'false'];

describe.each(Object.keys(targets))('%s target', (name) => {
	const target = targets[name];

	it('accepts a ref list written on an element under classic tsrx-tsc', () => {
		const result = run_classic_tsc(workspace(target, target.source), tsc_args('tsconfig.json'));
		expect(parse_tsc_output(result.output)).toEqual([]);
		expect(result.status).toBe(0);
	}, 60_000);

	it.runIf(target.native)(
		'accepts a ref list written on an element under native tsc',
		() => {
			const result = run_native_tsc(
				workspace(target, target.source),
				tsc_args('tsconfig.native.json'),
			);
			expect(parse_tsc_output(result.output)).toEqual([]);
			expect(result.status).toBe(0);
		},
		60_000,
	);
});

it('reports a list entry that is not a ref at that entry', () => {
	const dir = workspace(
		targets.react,
		`const a = (node: HTMLInputElement | null) => {};

export function Bad() @{
	<input ref={[a, 'oops']} />
}
`,
	);
	const expected = [
		expect.objectContaining({ file: 'Refs.tsrx', line: 4, column: 18, code: 'TS2322' }),
	];
	expect(parse_tsc_output(run_classic_tsc(dir, tsc_args('tsconfig.json')).output)).toEqual(
		expected,
	);
	expect(parse_tsc_output(run_native_tsc(dir, tsc_args('tsconfig.native.json')).output)).toEqual(
		expected,
	);
}, 60_000);
