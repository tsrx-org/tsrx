/** @import {CompilerOptions} from 'typescript' */

import { createLogging } from './utils.js';
import {
	createConnection,
	createServer,
	createSimpleProject,
	createTypeScriptProject,
} from '@volar/language-server/node';
import { resolve_typescript_backend } from './backend.js';
import { createServicePlugins } from './servicePlugins.js';
import {
	getTsrxLanguagePlugin,
	invalidateCompilerResolutionCaches,
	invalidateTypeDefinitionCaches,
	resolveConfig,
} from '@tsrx/typescript-plugin/src/language.js';
import { unsupported_typescript_message } from '@tsrx/typescript-plugin/src/typescript-version.js';
import { NODE_CONFIG_HOST } from '@tsrx/typescript-plugin/src/config-host.js';
import {
	handleWorkspaceChanges,
	trackTypeScriptConfigDependencies,
	WORKSPACE_FILE_PATTERNS,
} from './workspaceState.js';

const { log, logError } = createLogging('[TSRX Language Server]');

/**
 * @param {{ argv?: readonly string[] }} [options] `argv` defaults to the process
 *   arguments; it carries the `--typescript-backend=<classic|native>` flag.
 */
export function createTsrxLanguageServer(options = {}) {
	const argv = options.argv ?? process.argv.slice(2);
	const connection = createConnection();
	const server = createServer(connection);

	connection.listen();

	/** @type {WeakSet<Function>} */
	const wrappedFunctions = new WeakSet();
	/** @type {Set<string>} */
	const trackedTypeScriptConfigFiles = new Set();
	/** @type {Set<Set<string>>} */
	const compilerResolutionDependencySets = new Set();
	let restartScheduled = false;

	/** Restart the process so Node drops the complete ESM compiler graph. */
	function restartLanguageServer() {
		if (restartScheduled) {
			return;
		}
		restartScheduled = true;
		log('Restarting after package state changed.');
		setTimeout(() => process.exit(0), 50);
	}

	/**
	 * Ensure TypeScript hosts always see TSRX compiler defaults.
	 * @param {unknown} target
	 * @param {string} method
	 */
	function wrapCompilerOptionsProvider(target, method) {
		if (!target) {
			return;
		}

		const host = /** @type {{ [key: string]: unknown }} */ (target);
		const original = host[method];
		if (typeof original !== 'function' || wrappedFunctions.has(original)) {
			return;
		}

		/** @type {CompilerOptions | undefined} */
		let cachedInput;
		/** @type {CompilerOptions | undefined} */
		let cachedOutput;

		const wrapped = () => {
			/** @type {CompilerOptions} */
			const input = original.call(host);
			if (cachedInput !== input) {
				cachedInput = input;
				cachedOutput = resolveConfig({ options: input }).options;
			}
			return cachedOutput;
		};

		wrappedFunctions.add(original);
		wrappedFunctions.add(wrapped);
		host[method] = wrapped;
	}

	connection.onInitialize(async (params) => {
		try {
			log('Initializing TSRX language server...');
			log('Initialization options:', JSON.stringify(params.initializationOptions, null, 2));

			const selection = resolve_typescript_backend({
				argv,
				initializationOptions: params.initializationOptions,
			});
			if (selection.invalid !== undefined) {
				logError(
					`Unknown TypeScript backend ${JSON.stringify(selection.invalid)}; using "${selection.backend}".`,
				);
			}
			log(`TypeScript backend: ${selection.backend} (from ${selection.source})`);

			if (selection.backend === 'native') {
				// TypeScript 7 owns every TypeScript feature for `.tsrx` files. The
				// TSRX plugin only needs the compiler per file, which it resolves from
				// the nearest tsconfig.json itself, so no TypeScript module is loaded
				// (the native compiler's package has none) and no TypeScript project
				// host is created.
				const compilerResolutionDependencies = new Set();
				compilerResolutionDependencySets.add(compilerResolutionDependencies);
				const languagePlugin = getTsrxLanguagePlugin({
					configHost: NODE_CONFIG_HOST,
					dependencies: compilerResolutionDependencies,
				});
				const initResult = server.initialize(
					params,
					createSimpleProject([languagePlugin]),
					createServicePlugins(selection.backend),
				);
				log('Server initialization complete (native backend, no TypeScript loaded)');
				return initResult;
			}

			const ts = require('typescript');
			const unsupported_typescript = unsupported_typescript_message(ts, 'language-server');
			if (unsupported_typescript) {
				throw new Error(unsupported_typescript);
			}

			const initResult = server.initialize(
				params,
				createTypeScriptProject(ts, undefined, ({ configFileName, projectHost, sys }) => {
					wrapCompilerOptionsProvider(projectHost, 'getCompilationSettings');
					const compilerResolutionDependencies = new Set();
					const languagePlugin = getTsrxLanguagePlugin({
						ts,
						configFileName,
						configHost: sys,
						dependencies: compilerResolutionDependencies,
					});
					compilerResolutionDependencySets.add(compilerResolutionDependencies);

					return {
						// Keep language-plugin identity aligned with Volar's project
						// lifecycle. Nested tsconfigs are separate configured projects.
						languagePlugins: [languagePlugin],
						setup({ project }) {
							wrapCompilerOptionsProvider(
								project?.typescript?.languageServiceHost,
								'getCompilationSettings',
							);
							trackTypeScriptConfigDependencies(trackedTypeScriptConfigFiles, {
								configFileName,
								compilerOptions: projectHost.getCompilationSettings(),
								projectReferences: projectHost.getProjectReferences?.(),
							});
						},
					};
				}),
				createServicePlugins(selection.backend, ts),
			);

			log('Server initialization complete');
			return initResult;
		} catch (initError) {
			logError('Server initialization failed:', initError);
			throw initError;
		}
	});

	connection.onInitialized(async () => {
		log('Server initialized.');
		server.initialized();

		server.fileWatcher.onDidChangeWatchedFiles(({ changes }) => {
			for (const configDependencies of compilerResolutionDependencySets) {
				trackTypeScriptConfigDependencies(trackedTypeScriptConfigFiles, { configDependencies });
			}
			const effects = handleWorkspaceChanges(
				changes,
				{
					restartLanguageServer,
					invalidateCompilerResolutionCaches,
					invalidateTypeDefinitions: invalidateTypeDefinitionCaches,
					reloadProjects: () => {
						// Volar recreates disposed projects lazily, so retain the
						// previously discovered dependency paths until process restart.
						// New project setups extend this set with their current paths.
						server.project.reload();
					},
					requestRefresh: (clearDiagnostics) =>
						server.languageFeatures.requestRefresh(clearDiagnostics),
				},
				trackedTypeScriptConfigFiles,
			);

			if (effects.reloadProjects) {
				log('Reloaded TypeScript projects after workspace configuration changed.');
			}
		});

		// Register file watchers for source files, nested/shared TypeScript
		// configs, and package state that affects compiler selection.
		try {
			await server.fileWatcher.watchFiles(WORKSPACE_FILE_PATTERNS);
			log('Workspace file watchers registered.');
		} catch (err) {
			logError('Failed to register file watchers:', err);
		}
	});

	process.on('uncaughtException', (err) => {
		logError('Uncaught exception:', err);
	});

	process.on('unhandledRejection', (reason, promise) => {
		logError('Unhandled rejection at:', promise, 'reason:', reason);
	});

	return { connection, server };
}
