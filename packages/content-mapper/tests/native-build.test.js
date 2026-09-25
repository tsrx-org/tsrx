import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
	parse_tsc_output,
	run_native_tsc,
} from './fixture-utils.js';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const classic_tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * @param {Record<string, string>} files
 * @param {Parameters<typeof create_native_workspace>[1]} [options]
 */
function workspace(files, options) {
	const created = create_native_workspace(files, options);
	cleanups.push(created.cleanup);
	return created.dir;
}

/** The consumer fixture without its intentional error, as a passing baseline. */
function passing_consumer_files() {
	const files = consumer_fixture_files();
	files['main.ts'] = files['main.ts'].replace(/\/\/ Intentional[^\n]*\n[^\n]*\n/, '');
	return files;
}

/**
 * @param {Record<string, string>} files
 * @param {Record<string, unknown>} compiler_options
 */
function with_native_options(files, compiler_options) {
	const config = JSON.parse(files['tsconfig.native.json']);
	config.compilerOptions = { ...config.compilerOptions, ...compiler_options };
	files['tsconfig.native.json'] = JSON.stringify(config, null, '\t');
	return files;
}

const emit_options = {
	noEmit: false,
	declaration: true,
	declarationMap: true,
	emitDeclarationOnly: true,
	outDir: 'dist',
};

describe('native tsc declaration emit', () => {
	it('emits Component.d.tsrx.ts declarations with maps; <script> bodies add no declaration files', () => {
		const dir = workspace(with_native_options(passing_consumer_files(), emit_options));
		const result = run_native_tsc(dir, [
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
			'--listEmittedFiles',
		]);
		expect(result.output).not.toContain('error');
		expect(result.status).toBe(0);

		const emitted = fs.readdirSync(path.join(dir, 'dist')).sort();
		expect(emitted).toEqual([
			'Button.d.tsrx.ts',
			'Button.d.tsrx.ts.map',
			'Panel.d.tsrx.ts',
			'Panel.d.tsrx.ts.map',
			'main.d.ts',
			'main.d.ts.map',
		]);

		const panel = fs.readFileSync(path.join(dir, 'dist', 'Panel.d.tsrx.ts'), 'utf8');
		expect(panel).toContain('export interface PanelProps');
		expect(panel).toContain(
			'export default function Panel({ title, count }: PanelProps): import("react/jsx-runtime").JSX.Element;',
		);
		// The <script> body is a block in the generated TSX: nothing of it leaks into
		// the declaration output.
		expect(panel).not.toContain('analyticsEnabled');

		const button = fs.readFileSync(path.join(dir, 'dist', 'Button.d.tsrx.ts'), 'utf8');
		// Specifiers keep pointing at the .tsrx module (TS#64120 tracks `outputExtension`).
		expect(button).toContain("from './Panel.tsrx'");

		const map = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'Panel.d.tsrx.ts.map'), 'utf8'));
		expect(map.sources).toEqual(['../Panel.tsrx']);
		expect(map.file).toBe('Panel.d.tsrx.ts');
	});

	it('keeps generics and lets a separate project consume the declarations as plain TypeScript', () => {
		const files = with_native_options(passing_consumer_files(), emit_options);
		files['List.tsrx'] = `export interface ListProps<T> {
	items: T[];
	render: (item: T) => string;
}

export function List<T>({ items, render }: ListProps<T>) @{
	<ul>
		@for (const item of items) {
			<li>{render(item)}</li>
		}
	</ul>
}
`;
		files['main.ts'] += "export { List } from './List.tsrx';\n";
		const dir = workspace(files);
		const build = run_native_tsc(dir, ['-p', 'tsconfig.native.json', '--pretty', 'false']);
		expect(build.output).toBe('');
		expect(build.status).toBe(0);
		const list = fs.readFileSync(path.join(dir, 'dist', 'List.d.tsrx.ts'), 'utf8');
		expect(list).toMatch(/export declare function List<T>\(\{ items, render \}: ListProps<T>\)/);

		// A downstream project with `allowArbitraryExtensions` resolves
		// `./Panel.tsrx` to `Panel.d.tsrx.ts` and needs no mapper at all.
		const consumer = path.join(dir, 'consumer');
		fs.mkdirSync(consumer);
		fs.writeFileSync(
			path.join(consumer, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					module: 'ESNext',
					moduleResolution: 'Bundler',
					allowArbitraryExtensions: true,
					allowImportingTsExtensions: true,
					jsx: 'react-jsx',
					jsxImportSource: 'react',
					strict: true,
					skipLibCheck: true,
					noEmit: true,
					types: [],
				},
				include: ['use.ts'],
			}),
		);
		fs.writeFileSync(
			path.join(consumer, 'use.ts'),
			`import Panel from '../dist/Panel.tsrx';
import { List } from '../dist/List.tsrx';
export const ok = Panel({ title: 'x', count: 1 });
export const list = List<number>({ items: [1], render: (n) => String(n) });
export const bad = Panel({ title: 'x', count: 'one' });
export const badList = List<number>({ items: ['a'], render: (n) => String(n) });
`,
		);
		for (const [label, run] of /** @type {const} */ ([
			[
				'classic TypeScript 5',
				() =>
					spawnSync(process.execPath, [classic_tsc, '-p', 'tsconfig.json', '--pretty', 'false'], {
						cwd: consumer,
						encoding: 'utf8',
					}),
			],
			[
				'native TypeScript 7 without the mapper',
				() => run_native_tsc(consumer, ['-p', 'tsconfig.json', '--pretty', 'false']),
			],
		])) {
			const result = run();
			const output =
				typeof result.output === 'string'
					? result.output
					: String(result.stdout) + String(result.stderr);
			expect(label).toBeTruthy();
			const diagnostics = parse_tsc_output(output);
			expect(diagnostics.map((d) => [d.file, d.line, d.code])).toEqual([
				['use.ts', 5, 'TS2322'],
				['use.ts', 6, 'TS2322'],
			]);
			expect(result.status).toBe(2);
		}
	});
});

describe('native tsc incremental builds', () => {
	it('is a no-op on the second run and reacts to file, config and compiler changes', () => {
		const dir = workspace(
			with_native_options(passing_consumer_files(), {
				...emit_options,
				incremental: true,
				tsBuildInfoFile: 'dist/tsbuildinfo',
			}),
		);
		const args = ['-p', 'tsconfig.native.json', '--pretty', 'false', '--listEmittedFiles'];

		const first = run_native_tsc(dir, args);
		expect(first.status).toBe(0);
		expect(first.output).toContain('Panel.d.tsrx.ts');

		const second = run_native_tsc(dir, args);
		expect(second.status).toBe(0);
		expect(second.output).toBe('');

		// Editing a .tsrx file re-checks it and its importers.
		const button_path = path.join(dir, 'Button.tsrx');
		const button = fs.readFileSync(button_path, 'utf8');
		fs.writeFileSync(button_path, button + 'export const oops: number = "x";\n');
		const broken = run_native_tsc(dir, args);
		expect(parse_tsc_output(broken.output).map((d) => [d.file, d.code])).toEqual([
			['Button.tsrx', 'TS2322'],
		]);
		expect(broken.status).toBe(2);
		fs.writeFileSync(button_path, button);
		expect(run_native_tsc(dir, args).status).toBe(0);

		// Changing the tsconfig chain changes the mapper's config identity: a
		// bogus compiler declaration must surface even though no source changed.
		const config_path = path.join(dir, 'tsconfig.json');
		const config = fs.readFileSync(config_path, 'utf8');
		fs.writeFileSync(config_path, config.replace('"@tsrx/react"', '"@tsrx/does-not-exist"'));
		const misconfigured = run_native_tsc(dir, args);
		expect(parse_tsc_output(misconfigured.output).map((d) => [d.file, d.code])).toEqual([
			['Button.tsrx', 'tsrx1002'],
			['Panel.tsrx', 'tsrx1002'],
		]);
		expect(misconfigured.status).not.toBe(0);
		fs.writeFileSync(config_path, config);
		expect(run_native_tsc(dir, args).status).toBe(0);

		// Adding, deleting and renaming .tsrx files.
		fs.writeFileSync(path.join(dir, 'Extra.tsrx'), 'export const extra: string = 1;\n');
		const main_path = path.join(dir, 'main.ts');
		const main = fs.readFileSync(main_path, 'utf8');
		fs.writeFileSync(main_path, main + "export { extra } from './Extra.tsrx';\n");
		expect(parse_tsc_output(run_native_tsc(dir, args).output).map((d) => [d.file, d.code])).toEqual(
			[['Extra.tsrx', 'TS2322']],
		);
		fs.rmSync(path.join(dir, 'Extra.tsrx'));
		expect(parse_tsc_output(run_native_tsc(dir, args).output).map((d) => [d.file, d.code])).toEqual(
			[['main.ts', 'TS2307']],
		);
		fs.writeFileSync(main_path, main);
		fs.renameSync(button_path, path.join(dir, 'Btn.tsrx'));
		const renamed = parse_tsc_output(run_native_tsc(dir, args).output);
		expect(renamed.map((d) => d.code)).toContain('TS2307');
		fs.renameSync(path.join(dir, 'Btn.tsrx'), button_path);
		expect(run_native_tsc(dir, args).status).toBe(0);
	}, 60_000);
});

describe('native tsc --build with project references', () => {
	/**
	 * @param {Record<string, string>} lib_sources
	 * @param {string} lib_index
	 */
	function references_workspace(lib_sources, lib_index) {
		return workspace({
			'lib/tsconfig.json': JSON.stringify({
				tsrx: { compiler: '@tsrx/react' },
				contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }],
				compilerOptions: {
					composite: true,
					declaration: true,
					emitDeclarationOnly: true,
					outDir: 'dist',
					rootDir: '.',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'react-jsx',
					jsxImportSource: 'react',
					allowImportingTsExtensions: true,
					strict: true,
					skipLibCheck: true,
					types: [],
				},
				include: ['index.ts', '*.tsrx'],
			}),
			'lib/index.ts': lib_index,
			...lib_sources,
			// A project that references a .tsrx library declares the mapper too:
			// that is what lets TypeScript treat `lib/Button.tsrx` as a known
			// input and redirect it to `lib/dist/Button.d.tsrx.ts`. Without it the
			// `./Button.tsrx` specifier in the library's index.d.ts fails to
			// resolve and, under skipLibCheck, the export silently becomes `any`.
			'app/tsconfig.json': JSON.stringify({
				tsrx: { compiler: '@tsrx/react' },
				contentMappers: [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }],
				compilerOptions: {
					composite: true,
					noEmit: true,
					module: 'ESNext',
					moduleResolution: 'Bundler',
					jsx: 'react-jsx',
					jsxImportSource: 'react',
					strict: true,
					skipLibCheck: true,
					types: [],
				},
				references: [{ path: '../lib' }],
				include: ['app.ts'],
			}),
			'app/app.ts': `import { Panel } from '../lib/index';
export const ok = Panel({ title: 'x', count: 1 });
`,
		});
	}

	it('builds a referenced .tsrx library and checks the app against its declarations', () => {
		const files = consumer_fixture_files();
		// The library keeps its <script> body: it is a block in the generated TSX, so a
		// composite project has no extra input to list.
		const panel = files['Panel.tsrx'];
		expect(panel).toContain('<script');
		const dir = references_workspace(
			{ 'lib/Panel.tsrx': panel, 'lib/Button.tsrx': files['Button.tsrx'] },
			`export { default as Panel } from './Panel.tsrx';
export { default as Button } from './Button.tsrx';
`,
		);
		const good = run_native_tsc(dir, ['--build', 'app', '--pretty', 'false']);
		expect(good.output).toBe('');
		expect(good.status).toBe(0);
		expect(fs.existsSync(path.join(dir, 'lib', 'dist', 'Panel.d.tsrx.ts'))).toBe(true);
		expect(fs.existsSync(path.join(dir, 'lib', 'dist', 'index.d.ts'))).toBe(true);

		fs.appendFileSync(
			path.join(dir, 'app', 'app.ts'),
			"export const bad = Panel({ title: 'x', count: 'one' });\n",
		);
		const bad = run_native_tsc(dir, ['--build', 'app', '--pretty', 'false']);
		expect(parse_tsc_output(bad.output).map((d) => [d.file, d.line, d.code])).toEqual([
			['app/app.ts', 3, 'TS2322'],
		]);
		expect(bad.status).not.toBe(0);
	}, 30_000);

	it('type-checks a <script> body inside a referenced composite library', () => {
		// Before script bodies were embedded as blocks, the compiler-named supplemental
		// file could not be listed in a composite project (TS6307,
		// microsoft/TypeScript#64350); now the body is part of Panel.tsrx itself.
		const files = consumer_fixture_files();
		const panel = files['Panel.tsrx'].replace(
			'const analyticsEnabled: boolean = 1 < 2;',
			'const analyticsEnabled: boolean = "no";',
		);
		const dir = references_workspace(
			{ 'lib/Panel.tsrx': panel, 'lib/Button.tsrx': files['Button.tsrx'] },
			"export { default as Panel } from './Panel.tsrx';\n",
		);
		const result = run_native_tsc(dir, ['--build', 'app', '--pretty', 'false']);
		expect(result.output).not.toContain('TS6307');
		const diagnostics = parse_tsc_output(result.output);
		expect(diagnostics.map((d) => [d.file, d.code])).toEqual([['lib/Panel.tsrx', 'TS2322']]);
		expect(result.status).not.toBe(0);
	}, 30_000);
});

describe('native tsc --build with a chain of mapper-backed projects', () => {
	const shared_options = {
		composite: true,
		declaration: true,
		emitDeclarationOnly: true,
		outDir: 'dist',
		rootDir: '.',
		module: 'ESNext',
		moduleResolution: 'Bundler',
		jsx: 'react-jsx',
		jsxImportSource: 'react',
		allowImportingTsExtensions: true,
		strict: true,
		skipLibCheck: true,
		types: [],
	};
	const mapper = [{ package: '@tsrx/content-mapper', extensions: ['.tsrx'] }];

	it('builds lib-a → lib-b → app where both libraries contain .tsrx files', () => {
		// No `<script>` bodies: composite projects reject their supplemental
		// outputs (microsoft/TypeScript#64350, pinned above).
		const dir = workspace({
			'lib-a/tsconfig.json': JSON.stringify({
				tsrx: { compiler: '@tsrx/react' },
				contentMappers: mapper,
				compilerOptions: shared_options,
				include: ['index.ts', '*.tsrx'],
			}),
			'lib-a/index.ts': "export { default as Button } from './Button.tsrx';\n",
			'lib-a/Button.tsrx': `export interface ButtonProps {
	label: string;
	onPress?: () => void;
}

export default function Button({ label, onPress }: ButtonProps) @{
	<button type="button" onClick={onPress}>{label}</button>
}
`,
			'lib-b/tsconfig.json': JSON.stringify({
				tsrx: { compiler: '@tsrx/react' },
				contentMappers: mapper,
				compilerOptions: shared_options,
				references: [{ path: '../lib-a' }],
				include: ['index.ts', '*.tsrx'],
			}),
			'lib-b/index.ts': "export { default as Panel } from './Panel.tsrx';\n",
			// A .tsrx file in one project importing a .tsrx component from the
			// referenced project's declarations.
			'lib-b/Panel.tsrx': `import { Button } from '../lib-a/index';

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
`,
			'app/tsconfig.json': JSON.stringify({
				tsrx: { compiler: '@tsrx/react' },
				contentMappers: mapper,
				compilerOptions: {
					...shared_options,
					declaration: undefined,
					emitDeclarationOnly: undefined,
					outDir: undefined,
					rootDir: undefined,
					noEmit: true,
				},
				references: [{ path: '../lib-b' }],
				include: ['app.ts'],
			}),
			'app/app.ts': `import { Panel } from '../lib-b/index';
export const ok = Panel({ title: 'x', count: 1 });
`,
		});
		const good = run_native_tsc(dir, ['--build', 'app', '--pretty', 'false']);
		expect(good.output).toBe('');
		expect(good.status).toBe(0);
		for (const emitted of [
			'lib-a/dist/Button.d.tsrx.ts',
			'lib-a/dist/index.d.ts',
			'lib-b/dist/Panel.d.tsrx.ts',
			'lib-b/dist/index.d.ts',
		]) {
			expect(fs.existsSync(path.join(dir, emitted)), emitted).toBe(true);
		}

		// A prop error in the app against lib-b's declarations, and one inside
		// lib-b's .tsrx against lib-a's declarations, are both reported by the
		// build at their authored positions.
		fs.appendFileSync(
			path.join(dir, 'app', 'app.ts'),
			"export const bad = Panel({ title: 'x', count: 'one' });\n",
		);
		fs.writeFileSync(
			path.join(dir, 'lib-b', 'Panel.tsrx'),
			fs
				.readFileSync(path.join(dir, 'lib-b', 'Panel.tsrx'), 'utf8')
				.replace('label={String(count)}', 'label={count}'),
		);
		const bad = run_native_tsc(dir, ['--build', 'app', '--pretty', 'false']);
		// Declarations are still emitted for the failing library (no `noEmitOnError`),
		// so the build goes on to the app and reports both.
		expect(parse_tsc_output(bad.output).map((d) => [d.file, d.line, d.column, d.code])).toEqual([
			['lib-b/Panel.tsrx', 11, 11, 'TS2322'],
			['app/app.ts', 3, 40, 'TS2322'],
		]);
		expect(bad.status).not.toBe(0);
		fs.writeFileSync(
			path.join(dir, 'lib-b', 'Panel.tsrx'),
			fs
				.readFileSync(path.join(dir, 'lib-b', 'Panel.tsrx'), 'utf8')
				.replace('label={count}', 'label={String(count)}'),
		);
		const app_bad = run_native_tsc(dir, ['--build', 'app', '--pretty', 'false']);
		expect(parse_tsc_output(app_bad.output).map((d) => [d.file, d.line, d.column, d.code])).toEqual(
			[['app/app.ts', 3, 40, 'TS2322']],
		);
	}, 60_000);
});
