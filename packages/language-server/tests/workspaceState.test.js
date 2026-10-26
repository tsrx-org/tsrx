import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { URI } from 'vscode-uri';
import {
	classifyWorkspaceChanges,
	createRestartScheduler,
	getWorkspaceFilePatterns,
	handleWorkspaceChanges,
	isPackageStateFile,
	isTypeDefinitionFile,
	isTypeScriptConfigFile,
	trackTypeScriptConfigDependencies,
	WORKSPACE_FILE_PATTERNS,
} from '../src/workspaceState.js';

const CHANGED = 2;

/** @param {string} file_name */
function change(file_name) {
	return {
		uri: URI.file(file_name).toString(),
		type: CHANGED,
	};
}

describe('language-server workspace state', () => {
	it('recognizes nested, shared, and named TypeScript configs', () => {
		expect(isTypeScriptConfigFile('/workspace/tsconfig.json')).toBe(true);
		expect(isTypeScriptConfigFile('/workspace/packages/app/tsconfig.json')).toBe(true);
		expect(isTypeScriptConfigFile('/workspace/tsconfig.base.json')).toBe(true);
		expect(isTypeScriptConfigFile('/workspace/configs/browser.tsconfig.json')).toBe(true);
		expect(isTypeScriptConfigFile('/workspace/jsconfig.test.json')).toBe(true);
		expect(isTypeScriptConfigFile('/workspace/package.json')).toBe(false);
	});

	it('watches TSRX sources, config variants, and package state', () => {
		// Closed or externally changed TSRX files need the same Volar filesystem
		// refresh as TypeScript and JavaScript source files.
		expect(WORKSPACE_FILE_PATTERNS).toContain('**/*.tsrx');

		// All JSON files are observed because TypeScript permits arbitrary names
		// for extended and project-reference configs. The handler filters them
		// against the config dependency graph before reloading.
		expect(WORKSPACE_FILE_PATTERNS).toContain('**/*.json');
		expect(WORKSPACE_FILE_PATTERNS).toContain('**/pnpm-lock.yaml');
	});

	it('watches only TSRX sources, configs and package state beside the editor TypeScript', () => {
		expect(getWorkspaceFilePatterns('classic')).toEqual(WORKSPACE_FILE_PATTERNS);
		for (const backend of /** @type {const} */ (['plugin', 'native'])) {
			const patterns = getWorkspaceFilePatterns(backend);
			expect(patterns).toContain('**/*.tsrx');
			expect(patterns).toContain('**/*.json');
			expect(patterns).toContain('**/pnpm-lock.yaml');
			expect(patterns).toContain('**/node_modules/.modules.yaml');
			expect(patterns).not.toContain('**/*.js');
			expect(patterns).not.toContain('**/*.ts');
		}
	});

	it('restarts nothing for package files that installs, dev servers and builds write', () => {
		for (const file_name of [
			'/workspace/node_modules/.vite/deps/package.json',
			'/workspace/apps/web/node_modules/.vite/deps_temp_1a2b/package.json',
			'/workspace/node_modules/.pnpm/react@19.0.0/node_modules/react/package.json',
			'/workspace/node_modules/react/node_modules/scheduler/package.json',
			'/workspace/node_modules/.cache/tool/package.json',
			'/workspace/apps/site/.next/package.json',
			'/workspace/apps/shop/.output/server/package.json',
			'C:\\workspace\\node_modules\\.vite\\deps\\package.json',
		]) {
			expect(classifyWorkspaceChanges([change(file_name)])).toEqual({
				restartLanguageServer: false,
				reloadProjects: false,
				changedTypeDefinitions: [],
			});
		}
		expect(
			classifyWorkspaceChanges([change('/workspace/apps/web/package.json')]).restartLanguageServer,
		).toBe(true);
	});

	it('restarts when an install finishes, also when the lockfile changed before it', () => {
		// `git pull` changes the lockfile first, and the server restarts with the old
		// compiler still in node_modules; the install after it changes only node_modules.
		// A fresh clone opened before the install has no compiler to load yet.
		for (const file_name of [
			'/repo/node_modules/.modules.yaml',
			'/repo/node_modules/.package-lock.json',
			'/repo/node_modules/.yarn-state.yml',
			'/repo/node_modules/.yarn-integrity',
			'/repo/app/node_modules/@tsrx/react/package.json',
			'/repo/node_modules/typescript/package.json',
		]) {
			expect(classifyWorkspaceChanges([change(file_name)]).restartLanguageServer, file_name).toBe(
				true,
			);
		}
	});

	it('reads paths relative to the workspace folder', () => {
		const lockfile = '/home/me/node_modules/my-app/pnpm-lock.yaml';
		expect(classifyWorkspaceChanges([change(lockfile)]).restartLanguageServer).toBe(false);
		expect(
			classifyWorkspaceChanges([change(lockfile)], new Set(), ['/home/me/node_modules/my-app'])
				.restartLanguageServer,
		).toBe(true);
		expect(
			classifyWorkspaceChanges(
				[change('/home/me/node_modules/my-app/node_modules/.vite/deps/package.json')],
				new Set(),
				['/home/me/node_modules/my-app'],
			).restartLanguageServer,
		).toBe(false);
	});

	it('restarts once a burst of changes ends, or ten seconds after the first change', () => {
		vi.useFakeTimers();
		try {
			const restart = vi.fn();
			const schedule = createRestartScheduler(restart);
			schedule();
			vi.advanceTimersByTime(900);
			schedule();
			vi.advanceTimersByTime(900);
			expect(restart).not.toHaveBeenCalled();
			vi.advanceTimersByTime(100);
			expect(restart).toHaveBeenCalledOnce();

			const steady = vi.fn();
			const schedule_steady = createRestartScheduler(steady);
			for (let elapsed = 0; elapsed < 9_600; elapsed += 400) {
				schedule_steady();
				vi.advanceTimersByTime(400);
			}
			expect(steady).not.toHaveBeenCalled();
			schedule_steady();
			vi.advanceTimersByTime(400);
			expect(steady).toHaveBeenCalledOnce();
			schedule_steady();
			vi.advanceTimersByTime(2_000);
			expect(steady).toHaveBeenCalledOnce();
		} finally {
			vi.useRealTimers();
		}
	});

	it('reloads projects for a generated config only when a project loaded it', () => {
		expect(
			classifyWorkspaceChanges([change('/workspace/node_modules/some-lib/tsconfig.json')])
				.reloadProjects,
		).toBe(false);

		const tracked_config_files = new Set();
		trackTypeScriptConfigDependencies(tracked_config_files, {
			configFileName: '/workspace/tsconfig.json',
			compilerOptions: {
				configFile: {
					extendedSourceFiles: ['/workspace/.nuxt/tsconfig.json'],
				},
			},
		});
		expect(
			classifyWorkspaceChanges([change('/workspace/.nuxt/tsconfig.json')], tracked_config_files)
				.reloadProjects,
		).toBe(true);
	});

	it('classifies definition and package files independently', () => {
		expect(isTypeDefinitionFile('/workspace/types/runtime.d.ts')).toBe(true);
		expect(isTypeDefinitionFile('/workspace/types/runtime.d.mts')).toBe(true);
		expect(isTypeDefinitionFile('/workspace/types/runtime.d.cts')).toBe(true);
		expect(isTypeDefinitionFile('/workspace/src/runtime.ts')).toBe(false);
		expect(isPackageStateFile('/workspace/package.json')).toBe(true);
		expect(isPackageStateFile('/workspace/pnpm-lock.yaml')).toBe(true);
		expect(isPackageStateFile('/workspace/data.json')).toBe(false);
	});

	it('reloads all Volar projects for any nested or shared config change', () => {
		const effects = classifyWorkspaceChanges([
			change('/workspace/tsconfig.base.json'),
			change('/workspace/packages/a/tsconfig.json'),
			change('/workspace/packages/b/browser.tsconfig.json'),
		]);

		expect(effects).toEqual({
			restartLanguageServer: false,
			reloadProjects: true,
			changedTypeDefinitions: [],
		});
	});

	it('tracks arbitrary extended and project-reference config names', () => {
		const tracked_config_files = new Set();
		trackTypeScriptConfigDependencies(tracked_config_files, {
			configFileName: '/workspace/tsconfig.json',
			compilerOptions: {
				configFile: {
					extendedSourceFiles: ['/workspace/configs/shared-options.json'],
				},
			},
			projectReferences: [{ path: '/workspace/packages/lib/browser-project.json' }],
		});

		expect(tracked_config_files).toEqual(
			new Set([
				path.resolve('/workspace/tsconfig.json'),
				path.resolve('/workspace/configs/shared-options.json'),
				path.resolve('/workspace/packages/lib/browser-project.json'),
			]),
		);
		expect(
			classifyWorkspaceChanges(
				[change('/workspace/configs/shared-options.json')],
				tracked_config_files,
			).reloadProjects,
		).toBe(true);
		expect(
			classifyWorkspaceChanges([change('/workspace/data/unrelated.json')], tracked_config_files)
				.reloadProjects,
		).toBe(false);
	});

	it('retains prior config dependencies while projects are lazily recreated', () => {
		const tracked_config_files = new Set();
		trackTypeScriptConfigDependencies(tracked_config_files, {
			configFileName: '/workspace/tsconfig.json',
			compilerOptions: {
				configFile: {
					extendedSourceFiles: ['/workspace/configs/previous-options.json'],
				},
			},
		});

		trackTypeScriptConfigDependencies(tracked_config_files, {
			configFileName: '/workspace/tsconfig.json',
			compilerOptions: {
				configFile: {
					extendedSourceFiles: ['/workspace/configs/current-options.json'],
				},
			},
		});

		expect(tracked_config_files).toEqual(
			new Set([
				path.resolve('/workspace/tsconfig.json'),
				path.resolve('/workspace/configs/previous-options.json'),
				path.resolve('/workspace/configs/current-options.json'),
			]),
		);
	});

	it('matches Windows config dependencies regardless of path casing', () => {
		const tracked_config_files = new Set();
		trackTypeScriptConfigDependencies(tracked_config_files, {
			configFileName: 'C:\\Workspace\\tsconfig.json',
			compilerOptions: {
				configFile: {
					extendedSourceFiles: ['C:\\Workspace\\Configs\\shared-options.json'],
				},
			},
		});

		const effects = classifyWorkspaceChanges(
			[
				{
					uri: 'file:///c:/workspace/configs/shared-options.json',
					type: CHANGED,
				},
			],
			tracked_config_files,
		);

		expect(effects.reloadProjects).toBe(true);
	});

	it('normalizes compiler resolver dependencies before matching workspace changes', () => {
		const tracked_config_files = new Set();
		trackTypeScriptConfigDependencies(tracked_config_files, {
			configDependencies: new Set(['C:\\Workspace\\Configs\\base.json']),
		});

		const effects = classifyWorkspaceChanges(
			[
				{
					uri: 'file:///c:/workspace/configs/base.json',
					type: CHANGED,
				},
			],
			tracked_config_files,
		);

		expect(effects.reloadProjects).toBe(true);
	});

	it('restarts the language server when package state changes', () => {
		const calls = [];
		const hooks = {
			restartLanguageServer: vi.fn(() => calls.push('restart')),
			invalidateTypeDefinitions: vi.fn((file_name) =>
				calls.push(file_name ? `types:${file_name}` : 'types:all'),
			),
			reloadProjects: vi.fn(() => calls.push('reload')),
			requestRefresh: vi.fn(() => calls.push('refresh')),
		};

		const effects = handleWorkspaceChanges(
			[
				change('/workspace/package.json'),
				change('/workspace/types/runtime.d.ts'),
				change('/workspace/tsconfig.base.json'),
			],
			hooks,
		);

		expect(effects).toEqual({
			restartLanguageServer: true,
			reloadProjects: false,
			changedTypeDefinitions: [],
		});
		expect(calls).toEqual(['restart']);
	});

	it('invalidates only changed definition files without rebuilding projects', () => {
		const hooks = {
			restartLanguageServer: vi.fn(),
			invalidateTypeDefinitions: vi.fn(),
			reloadProjects: vi.fn(),
			requestRefresh: vi.fn(),
		};

		handleWorkspaceChanges(
			[
				change('/workspace/types/a.d.ts'),
				change('/workspace/types/b.d.mts'),
				change('/workspace/src/app.ts'),
			],
			hooks,
		);

		expect(hooks.invalidateTypeDefinitions.mock.calls).toEqual([
			['/workspace/types/a.d.ts'],
			['/workspace/types/b.d.mts'],
		]);
		expect(hooks.restartLanguageServer).not.toHaveBeenCalled();
		expect(hooks.reloadProjects).not.toHaveBeenCalled();
		expect(hooks.requestRefresh).not.toHaveBeenCalled();
	});

	it('invalidates compiler resolution caches before reloading a tracked config', () => {
		const calls = [];
		const hooks = {
			restartLanguageServer: vi.fn(),
			invalidateCompilerResolutionCaches: vi.fn(() => calls.push('invalidate compiler')),
			invalidateTypeDefinitions: vi.fn(),
			reloadProjects: vi.fn(() => calls.push('reload')),
			requestRefresh: vi.fn(() => calls.push('refresh')),
		};
		const tracked_config_files = new Set();
		trackTypeScriptConfigDependencies(tracked_config_files, {
			configFileName: '/workspace/tsconfig.json',
			compilerOptions: {
				configFile: {
					extendedSourceFiles: ['/workspace/configs/compiler-options.json'],
				},
			},
		});

		handleWorkspaceChanges(
			[change('/workspace/configs/compiler-options.json')],
			hooks,
			tracked_config_files,
		);

		expect(calls).toEqual(['invalidate compiler', 'reload', 'refresh']);
	});
});
