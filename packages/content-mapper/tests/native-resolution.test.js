/**
 * Module resolution into and out of `.tsrx` files on the native path, checked
 * against the classic `tsrx-tsc` on the same workspace: `paths` aliases, a
 * `.tsx` importer, and a workspace package reached through a `node_modules`
 * symlink (the monorepo layout).
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
	parse_tsc_output,
	run_classic_tsc,
	run_native_tsc,
} from './fixture-utils.js';

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * The consumer fixture's compiler options plus `contentMappers` (ignored by
 * TypeScript 5, so the same file serves both paths).
 * @param {Record<string, unknown>} overrides
 * @param {string[]} include
 */
function tsconfig(overrides, include) {
	const base = JSON.parse(consumer_fixture_files()['tsconfig.json']);
	return JSON.stringify(
		{
			tsrx: base.tsrx,
			contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }],
			compilerOptions: { ...base.compilerOptions, ...overrides },
			include,
		},
		null,
		'\t',
	);
}

/**
 * Run both paths and return their diagnostics as comparable records.
 * @param {string} dir
 */
function check_both(dir) {
	const args = ['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'];
	const native = run_native_tsc(dir, args);
	const classic = run_classic_tsc(dir, args);
	/** @param {string} output */
	const summarize = (output) =>
		parse_tsc_output(output).map((d) => [d.file, d.line, d.column, d.code, d.message]);
	return {
		native: { status: native.status, diagnostics: summarize(native.output), output: native.output },
		classic: { status: classic.status, diagnostics: summarize(classic.output) },
	};
}

const BUTTON_TSRX = `export interface ButtonProps {
	label: string;
	onPress?: () => void;
}

export default function Button({ label, onPress }: ButtonProps) @{
	<button type="button" onClick={onPress}>{label}</button>
}
`;

/** @param {string} button_specifier */
function panel_tsrx(button_specifier) {
	return `import Button from '${button_specifier}';

export interface PanelProps {
	title: string;
	count: number;
}

export default function Panel({ title, count }: PanelProps) @{
	<section>
		<h2>{title}</h2>
		<Button label={String(count)} />
	</section>
}
`;
}

describe('resolution into .tsrx modules', () => {
	it('follows paths aliases from .ts and .tsrx importers', () => {
		const created = create_native_workspace({
			'tsconfig.json': tsconfig({ paths: { '@ui/*': ['./ui/*'] } }, ['main.ts']),
			'ui/Button.tsrx': BUTTON_TSRX,
			'ui/Panel.tsrx': panel_tsrx('@ui/Button.tsrx'),
			'main.ts': `import Panel from '@ui/Panel.tsrx';
import Button from '@ui/Button.tsrx';

export const ok = [Panel({ title: 'Hello', count: 1 }), Button({ label: 'Go' })];
export const bad = Panel({ title: 'Hello', count: 'one' });
`,
		});
		cleanups.push(created.cleanup);
		const { native, classic } = check_both(created.dir);
		expect(native.diagnostics).toEqual([
			['main.ts', 5, 44, 'TS2322', "Type 'string' is not assignable to type 'number'."],
		]);
		expect(classic.diagnostics).toEqual(native.diagnostics);
		expect(native.status).toBe(2);
		expect(classic.status).toBe(2);
	});

	it('checks JSX usage of a .tsrx component from a .tsx importer', () => {
		const created = create_native_workspace({
			'tsconfig.json': tsconfig({}, ['App.tsx']),
			'Button.tsrx': BUTTON_TSRX,
			'Panel.tsrx': panel_tsrx('./Button.tsrx'),
			'App.tsx': `import Panel from './Panel.tsrx';

export const ok = <Panel title="Hello" count={1} />;
export const bad = <Panel title="Hello" count="one" />;
export const missing = <Panel title="Hello" />;
`,
		});
		cleanups.push(created.cleanup);
		const { native, classic } = check_both(created.dir);
		expect(native.diagnostics.map((d) => d.slice(0, 4))).toEqual([
			['App.tsx', 4, 41, 'TS2322'],
			['App.tsx', 5, 25, 'TS2741'],
		]);
		expect(native.diagnostics[1][4]).toContain("Property 'count' is missing");
		expect(classic.diagnostics).toEqual(native.diagnostics);
	});

	it('resolves a workspace package through a node_modules symlink (monorepo layout)', () => {
		const created = create_native_workspace({
			'tsconfig.json': tsconfig({}, ['app/main.ts']),
			'packages/ui/package.json': JSON.stringify({
				name: '@acme/ui',
				version: '0.0.0',
				type: 'module',
				exports: { '.': './index.ts' },
			}),
			'packages/ui/index.ts': `export { default as Panel } from './Panel.tsrx';
export { default as Button } from './Button.tsrx';
`,
			'packages/ui/Button.tsrx': BUTTON_TSRX,
			'packages/ui/Panel.tsrx': panel_tsrx('./Button.tsrx'),
			'app/main.ts': `import { Button, Panel } from '@acme/ui';

export const ok = [Panel({ title: 'Hello', count: 1 }), Button({ label: 'Go' })];
export const bad = Panel({ title: 'Hello', count: 'one' });
`,
		});
		cleanups.push(created.cleanup);
		// What a package manager's workspace link looks like.
		fs.mkdirSync(path.join(created.dir, 'node_modules', '@acme'), { recursive: true });
		fs.symlinkSync(
			path.join(created.dir, 'packages', 'ui'),
			path.join(created.dir, 'node_modules', '@acme', 'ui'),
			'junction',
		);
		const { native, classic } = check_both(created.dir);
		expect(native.diagnostics).toEqual([
			['app/main.ts', 4, 44, 'TS2322', "Type 'string' is not assignable to type 'number'."],
		]);
		expect(classic.diagnostics).toEqual(native.diagnostics);
	});
});
