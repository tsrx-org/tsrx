import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSync } from 'vite';
import { DIAGNOSTIC_CODES } from '../../src/diagnostics.js';
import { findUnconfiguredPlatformFlag, restartOnPlatformChange } from '../../src/vite/platform.js';

describe('findUnconfiguredPlatformFlag', () => {
	it('finds a recognized flag in ordinary modules', () => {
		const code = "export const answer = 1 > 0 && import.meta.env.platform.web ? 'web' : 'native';";
		for (const id of [
			'/app/helper.ts',
			'/app/helper.tsx',
			'/app/helper.mjs',
			'/app/worker.ts?worker_file&type=module',
			'/app/helper.ts?v=1234',
		]) {
			expect(findUnconfiguredPlatformFlag(code, id, parseSync)).toEqual({
				message: expect.stringContaining('Platform flag usage requires a configured TSRX platform'),
				code: DIAGNOSTIC_CODES.PLATFORM_REQUIRED,
				pos: code.indexOf('import.meta'),
			});
		}
	});

	it('ignores flag text that is not a recognized flag', () => {
		for (const code of [
			'export const docs = "import.meta.env.platform.web";',
			'// import.meta.env.platform.web\nexport {};',
			'export const all = import.meta.env.platform;',
			'export const web = import.meta.env.platform?.web;',
			"export const web = import.meta.env.platform['web'];",
			'export const broken = import.meta.env.platform.web +;',
		]) {
			expect(findUnconfiguredPlatformFlag(code, '/app/helper.ts', parseSync)).toBeNull();
		}
	});

	it('parses TypeScript and JSX by extension', () => {
		const ts = 'export const web = <boolean>import.meta.env.platform.web;';
		const tsx = 'export const web = <b>{import.meta.env.platform.web}</b>;';
		expect(findUnconfiguredPlatformFlag(ts, '/app/helper.ts', parseSync)?.pos).toBe(28);
		expect(findUnconfiguredPlatformFlag(tsx, '/app/View.tsx', parseSync)?.pos).toBe(23);
	});

	it('leaves .tsrx modules, styles and raw source strings alone', () => {
		const code = 'export const web = import.meta.env.platform.web;';
		for (const id of ['/app/App.tsrx', '/app/style.css', '/app/style.css?inline']) {
			expect(findUnconfiguredPlatformFlag(code, id, parseSync)).toBeNull();
		}
		expect(
			findUnconfiguredPlatformFlag(
				`export default ${JSON.stringify(code)};`,
				'/app/helper.ts?raw',
				parseSync,
			),
		).toBeNull();
	});
});

describe('restartOnPlatformChange', () => {
	/** @type {string} */
	let directory;

	beforeEach(() => {
		directory = realpathSync(mkdtempSync(join(tmpdir(), 'tsrx-vite-platform-')));
		mkdirSync(join(directory, 'app'));
		writeFileSync(
			join(directory, 'app', 'tsconfig.json'),
			'{ "extends": "../tsconfig.base.json" }',
		);
		writeFileSync(join(directory, 'tsconfig.base.json'), '{ "tsrx": { "platform": "web" } }');
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	function watch() {
		const watcher = Object.assign(new EventEmitter(), {
			/** @type {string[]} */
			watched: [],
			/** @param {string[]} paths */
			add(paths) {
				watcher.watched.push(...paths);
			},
		});
		let restarts = 0;
		restartOnPlatformChange(
			{
				watcher,
				restart: async () => {
					restarts++;
				},
			},
			{ root: join(directory, 'app') },
			() => 'web',
		);
		return { watcher, restarts: () => restarts };
	}

	it('watches the tsconfig and an extends target outside the root', () => {
		const { watcher } = watch();

		expect(watcher.watched).toEqual([
			join(directory, 'app', 'tsconfig.json'),
			join(directory, 'tsconfig.base.json'),
		]);
	});

	it('restarts when a json change selects another platform', () => {
		const { watcher, restarts } = watch();
		const base = join(directory, 'tsconfig.base.json');

		watcher.emit('change', base);
		expect(restarts()).toBe(0);

		writeFileSync(base, '{ "tsrx": { "platform": "ios" } }');
		watcher.emit('change', join(directory, 'app', 'App.tsrx'));
		expect(restarts()).toBe(0);
		watcher.emit('change', base);
		expect(restarts()).toBe(1);
	});

	it('restarts when the configuration no longer resolves', () => {
		const { watcher, restarts } = watch();
		const base = join(directory, 'tsconfig.base.json');

		writeFileSync(base, '{ "tsrx": { "platform": "mac" } }');
		watcher.emit('change', base);
		expect(restarts()).toBe(1);
	});
});
