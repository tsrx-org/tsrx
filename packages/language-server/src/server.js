/** @import {CompilerOptions} from 'typescript' */

import { createLogging } from './utils.js';
import {
	createConnection,
	createServer,
	createSimpleProject,
	createTypeScriptProject,
} from '@volar/language-server/node';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve_typescript_backend, resolve_typescript_tsdk } from './backend.js';
import {
	find_typescript,
	is_usable_typescript,
	tsdk_notice,
	typescript_notice,
} from './find-typescript.js';
import { createServicePlugins } from './servicePlugins.js';
import { register_formatting } from './formattingHandler.js';
import {
	CLOSING_TAGS_ON_TYPE,
	closes_tags_on_type,
	register_closing_tags,
} from './closingTagsHandler.js';
import { URI } from 'vscode-uri';
import {
	getTsrxLanguagePlugin,
	invalidateCompilerResolutionCaches,
	invalidateTypeDefinitionCaches,
	resolveConfig,
} from '@tsrx/typescript-plugin/src/language.js';
import { NODE_CONFIG_HOST } from '@tsrx/typescript-plugin/src/config-host.js';
import {
	handleWorkspaceChanges,
	trackTypeScriptConfigDependencies,
	WORKSPACE_FILE_PATTERNS,
} from './workspaceState.js';

const { log, logError } = createLogging('[TSRX Language Server]');

/** The server's own folder, where the search for a `typescript` package ends. */
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Where a `typescript` package came from, for the log. */
const TYPESCRIPT_SOURCES = {
	tsdk: 'typescript.tsdk initialization option',
	workspace: 'the project',
	server: 'next to the server',
};

/**
 * Sent to a client that set the `restartNotification` initialization option
 * when the server must restart; the client then restarts the server itself.
 */
export const RESTART_NOTIFICATION = 'tsrx/restartServer';

/**
 * @param {{ argv?: readonly string[] }} [options] `argv` defaults to the process
 *   arguments; it carries the `--typescript-backend=<classic|native>` flag.
 */
export function createTsrxLanguageServer(options = {}) {
	const argv = options.argv ?? process.argv.slice(2);
	const connection = createConnection();
	const server = createServer(connection);
	// Prettier formats `.tsrx` sources on every backend (`formattingHandler.js`).
	register_formatting(connection, (uri) => server.documents.get(URI.parse(uri)));
	// Closing tags on `>` for every editor (`closingTagsHandler.js`).
	register_closing_tags(connection, server);

	connection.listen();

	/** @type {WeakSet<Function>} */
	const wrappedFunctions = new WeakSet();
	/** @type {Set<string>} */
	const trackedTypeScriptConfigFiles = new Set();
	/** @type {Set<Set<string>>} */
	const compilerResolutionDependencySets = new Set();
	let restartScheduled = false;
	let clientRestarts = false;
	/**
	 * Shown once the client is initialized, each as its own warning: the classic
	 * backend skipped the `typescript.tsdk` option, or did not find a `typescript`
	 * it can run and the server started without TypeScript features.
	 * @type {string[]}
	 */
	const typescriptNotices = [];

	/**
	 * Restart the process so Node drops the complete ESM compiler graph. A
	 * client that restarts the server itself stops sending first. When the
	 * server exits by itself, the client's next message fails (VS Code showed
	 * "Cannot call write after a stream was destroyed").
	 */
	function restartLanguageServer() {
		if (restartScheduled) {
			return;
		}
		restartScheduled = true;
		if (clientRestarts) {
			log('Asking the client to restart the server after package state changed.');
			void connection.sendNotification(RESTART_NOTIFICATION);
			return;
		}
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

	/**
	 * Load the TypeScript the classic backend hosts (`find_typescript`). Every
	 * later `require('typescript')` in this process (the shared transform's option
	 * defaults, Volar's TypeScript service) resolves to the same module, so one
	 * TypeScript runs.
	 * @param {import('./find-typescript.js').FoundTypeScript} found
	 * @returns {typeof import('typescript')}
	 */
	function load_typescript(found) {
		const typescript_js = path.join(found.lib, 'typescript.js');
		const module_loader = /** @type {{ _resolveFilename: (...args: unknown[]) => string }} */ (
			/** @type {unknown} */ (Module)
		);
		const original_resolve = module_loader._resolveFilename;
		module_loader._resolveFilename = function (request, ...rest) {
			return request === 'typescript'
				? typescript_js
				: original_resolve.call(this, request, ...rest);
		};
		const loaded = require(typescript_js);
		log(`TypeScript ${loaded.version} from ${found.dir} (${TYPESCRIPT_SOURCES[found.source]})`);
		return loaded;
	}

	connection.onInitialize(async (params) => {
		try {
			log('Initializing TSRX language server...');
			log('Initialization options:', JSON.stringify(params.initializationOptions, null, 2));
			clientRestarts = params.initializationOptions?.restartNotification === true;

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

			let backend = selection.backend;
			/** @type {typeof import('typescript') | undefined} */
			let ts;
			if (backend === 'classic') {
				const workspace_dirs = workspace_folder_paths(params);
				const tsdk = resolve_typescript_tsdk(params.initializationOptions);
				const found = find_typescript({ tsdk, workspace_dirs, server_dir: SERVER_DIR });
				if (tsdk !== undefined && found?.source !== 'tsdk') {
					// The editor's choice names no TypeScript install: say so, or the
					// user sees no effect and does not know why.
					typescriptNotices.push(tsdk_notice(tsdk, found));
				}
				if (found && is_usable_typescript(found.version)) {
					ts = load_typescript(found);
				} else {
					// No TypeScript it can run: start anyway with what needs none, as on
					// the plugin backend (TSRX compile errors included), and tell the user.
					typescriptNotices.push(typescript_notice(found, workspace_dirs));
					backend = 'plugin';
				}
				for (const notice of typescriptNotices) {
					logError(notice);
				}
			}

			if (ts === undefined) {
				// The editor's TypeScript (TypeScript 7 through the content mapper, or
				// its tsserver through the tsserver plugin) owns every TypeScript
				// feature for `.tsrx` files, or none does. The TSRX plugin only needs
				// the compiler per file, which it resolves from the nearest
				// tsconfig.json itself, so no TypeScript module is loaded (the native
				// compiler's package has none) and no TypeScript project host is created.
				const compilerResolutionDependencies = new Set();
				compilerResolutionDependencySets.add(compilerResolutionDependencies);
				const languagePlugin = getTsrxLanguagePlugin({
					configHost: NODE_CONFIG_HOST,
					dependencies: compilerResolutionDependencies,
				});
				const initResult = server.initialize(
					params,
					createSimpleProject([languagePlugin]),
					createServicePlugins(backend),
				);
				log('Server initialization complete');
				return with_own_handlers(initResult, params);
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
				createServicePlugins(backend, ts),
			);

			log('Server initialization complete');
			return with_own_handlers(initResult, params);
		} catch (initError) {
			logError('Server initialization failed:', initError);
			throw initError;
		}
	});

	connection.onInitialized(async () => {
		log('Server initialized.');
		server.initialized();
		for (const message of typescriptNotices) {
			// The `window/showMessage` notification (type 2: warning), which editors show
			// to the user; `connection.window.showWarningMessage` sends the request form,
			// which waits for the user to pick an action.
			void connection.sendNotification('window/showMessage', { type: 2, message });
		}

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

/**
 * Advertise what the server's own handlers serve: the formatters `register_formatting`
 * serves (whole document and range), and the closing tags `register_closing_tags`
 * serves on `>`, unless the client closes tags another way (`closes_tags_on_type`).
 * No Volar service plugin advertises either (`stripFormatting`).
 * @template {import('@volar/language-server/node').InitializeResult} T
 * @param {T} initResult
 * @param {import('@volar/language-server/node').InitializeParams} params
 * @returns {T}
 */
function with_own_handlers(initResult, params) {
	initResult.capabilities.documentFormattingProvider = true;
	initResult.capabilities.documentRangeFormattingProvider = true;
	if (closes_tags_on_type(params)) {
		initResult.capabilities.documentOnTypeFormattingProvider = CLOSING_TAGS_ON_TYPE;
	}
	return initResult;
}

/**
 * The paths of the open workspace folders (`file:` URIs only), or of the root
 * the client sent instead. A client that names no folder (Neovim when it finds no
 * root marker, for a single file) starts the server in the file's project, so the
 * server's working directory stands in.
 * @param {import('@volar/language-server/node').InitializeParams} params
 * @returns {string[]}
 */
function workspace_folder_paths(params) {
	const uris =
		params.workspaceFolders?.map((folder) => folder.uri) ??
		(params.rootUri ? [params.rootUri] : []);
	const paths = uris
		.map((uri) => URI.parse(uri))
		.filter((uri) => uri.scheme === 'file')
		.map((uri) => uri.fsPath);
	if (paths.length === 0 && params.rootPath) {
		paths.push(params.rootPath);
	}
	if (paths.length === 0) {
		paths.push(process.cwd());
	}
	return paths;
}
