/**
 * TSRX Syntax for VS Code
 *
 * This extension provides language support for TSRX files (.tsrx) by:
 * 1. Starting a Volar-based language server (language-server) for TSRX syntax and semantics
 * 2. Giving `.tsrx` files TypeScript features through one of two backends (see `backend.js`):
 *    - classic: patching the built-in TypeScript extension to recognize TSRX files while the
 *      language server hosts TypeScript 5 itself
 *    - native: registering the bundled `@tsrx/content-mapper` with the TypeScript 7 extension
 *      (`registerContentMappers`, for inferred projects; configured projects declare the mapper
 *      in tsconfig.json) and running the language server slimmed down
 * 3. Setting VSCode context variables to expose TypeScript commands for TSRX files
 *
 * Architecture: Language Server vs TypeScript Plugin
 * --------------------------------------------------
 * language-server: A Language Server Protocol (LSP) server built on Volar that provides
 * language features for TSRX files including diagnostics, IntelliSense, go-to-definition, etc.
 * It uses typescript-plugin internally to transform TSRX syntax into TypeScript virtual
 * files for type checking and IntelliSense.
 *
 * typescript-plugin: A Volar-based TypeScript plugin that transforms TSRX component files into
 * TypeScript virtual code. This plugin enables TypeScript's language service to understand TSRX
 * syntax. It's already loaded and used by language-server, so we don't need to configure
 * it separately.
 *
 * IMPORTANT: DO NOT use "typescriptServerPlugins" in package.json
 * ----------------------------------------------------------------
 * The "typescriptServerPlugins" contribution point would tell VSCode's TypeScript extension to
 * load typescript-plugin into its own tsserver instance. However:
 * 1. We already run language-server which uses typescript-plugin internally
 * 2. Loading it twice (once in our LSP, once in TS extension) creates conflicts and duplication
 * 3. Our language server provides more features than just the TypeScript plugin alone
 * 4. We use runtime patching instead to make the TS extension recognize TSRX files
 *
 * IMPORTANT: TypeScript Command Integration
 * ----------------------------------------
 * We DO NOT register TypeScript commands (like typescript.goToSourceDefinition,
 * typescript.findAllFileReferences, etc.) ourselves, as this would conflict with
 * the built-in TypeScript extension which already owns these commands.
 *
 * Instead, we:
 * 1. Patch the TypeScript extension to treat TSRX files as TypeScript-like files
 * 2. Set context variables (via setupDynamicContexts) that the TypeScript extension uses
 * 3. Declare menu contributions in package.json that reference the existing TypeScript commands
 *
 * The package.json "menus" section controls WHERE and WHEN TypeScript commands appear in the UI.
 * This extension's code sets the context variable VALUES that the menu "when" clauses check.
 *
 * Example flow:
 * - package.json declares: Show "typescript.goToSourceDefinition" when "resourceLangId == tsrx"
 * - This code sets: resourceLangId = 'tsrx' when editing a supported TSRX component file
 * - Result: The TypeScript command appears in the context menu for TSRX files
 */

import vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import protocol from '@volar/language-server/protocol';
import * as lsp from 'vscode-languageclient/node';
import { activateAutoInsertion, createLabsInfo } from '@volar/vscode';
import {
	BACKEND_SETTING,
	CONTRIBUTOR_ID,
	NATIVE_TYPESCRIPT_EXTENSION_IDS,
	USE_TSGO_SECTIONS,
	create_content_mapper_contribution,
	resolve_backend,
} from './backend.js';
import {
	MINIMUM_NATIVE_TYPESCRIPT_VERSION,
	TYPESCRIPT_7_SUPPORT_NOTE,
	TYPESCRIPT_7_TRACKING_ISSUE_URL,
} from '@tsrx/typescript-plugin/src/typescript-version.js';

/** @import { Backend, BackendReason, NativeExtensionState } from './backend.js' */

const require = createRequire(import.meta.url);
/** @type {{ version: string }} */
const content_mapper_package = require('@tsrx/content-mapper/package.json');

const TSRX_FILE_SELECTORS = ['**/*.tsrx'];
const TSRX_FILE_EXCLUDE_GLOB = '**/{node_modules,dist,build,.git}/**';
const TSGO_CONFIGURATION_SECTIONS = USE_TSGO_SECTIONS;
const TSGO_WARNING_STATE_KEY = 'tsrx.hasWarnedLocalTsgoUnsupported';
/** What the native backend needs from the TypeScript 7 extension, for user-facing messages. */
const NATIVE_REQUIREMENTS = `a TypeScript 7 extension build that exposes the content-mapper API (registerContentMappers) and runs TypeScript ${MINIMUM_NATIVE_TYPESCRIPT_VERSION} or newer`;
const TSGO_UNSUPPORTED_MESSAGE = `TypeScript 7 is enabled in this workspace (js/ts.experimental.useTsgo), but the TSRX extension is running the classic TypeScript backend for .tsrx files, so their TypeScript features are limited. TypeScript 7 support for .tsrx files is not complete yet: it needs ${NATIVE_REQUIREMENTS}, with "tsrx.typescript.backend" set to "auto" or "native". ${TYPESCRIPT_7_SUPPORT_NOTE} To keep full TypeScript features for .tsrx files today, disable "js/ts.experimental.useTsgo" for this workspace.`;
const RESTART_EXTENSIONS_ACTION = 'Restart Extensions';
const OPEN_TRACKING_ISSUE_ACTION = 'Open Tracking Issue';

/**
 * @typedef {object} NativeTypeScriptExtension
 * @property {NativeExtensionState} state
 * @property {import('vscode').Extension<unknown>} [extension]
 * @property {{ registerContentMappers: (contributorId: string, contributions: unknown[]) => import('vscode').Disposable }} [api]
 */

/**
 * @typedef {object} BackendSelection
 * @property {Backend} backend
 * @property {BackendReason} reason
 * @property {NativeTypeScriptExtension} native
 */

/**
 * @param {string} file_path
 * @returns {boolean}
 */
function is_tsrx_file_path(file_path) {
	return file_path.endsWith('.tsrx');
}

/** @type {import('vscode-languageclient/node').LanguageClient | undefined} */
let client;
/** The backend this extension host session runs; changing it needs an extension restart. */
/** @type {Backend | undefined} */
let active_backend;

/**
 * @param {import('vscode').ExtensionContext} context
 */
export async function activate(context) {
	console.log('TSRX extension starting...');

	if (!vscode.workspace.isTrusted) {
		// `capabilities.untrustedWorkspaces.supported` is false in package.json, so VS Code does
		// not activate this extension in Restricted Mode; this is the defensive twin. The TSRX
		// compilers and the content mapper execute code from the workspace.
		console.warn('[TSRX] Workspace is not trusted; TSRX language features stay off.');
		return;
	}

	const selection = await select_backend();
	active_backend = selection.backend;
	console.log(`[TSRX] TypeScript backend: ${selection.backend} (${selection.reason})`);
	await report_backend_fallback(context, selection);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (event) => {
			if (event.affectsConfiguration(BACKEND_SETTING) || is_tsgo_configuration_change(event)) {
				await prompt_restart_if_backend_changed();
			}
		}),
	);

	if (selection.backend === 'native') {
		register_native_content_mapper(context, selection.native);
	} else {
		await activate_classic_backend(context);
	}

	const serverModule = path.join(__dirname, 'server.js');

	if (!fs.existsSync(serverModule)) {
		const message = `Server module not found at: ${serverModule}`;
		console.error(message);
		vscode.window.showErrorMessage(message);
		return;
	}

	const runOptions = {
		execArgv: [],
		env: {
			...process.env,
			TSRX_DEBUG: process.env.TSRX_DEBUG === 'false' ? 'false' : 'true',
		},
	};

	const debugOptions = {
		execArgv: ['--nolazy', '--inspect'],
		env: {
			...process.env,
			TSRX_DEBUG: process.env.TSRX_DEBUG === 'false' ? 'false' : 'true',
		},
	};

	const serverOptions = {
		run: {
			module: serverModule,
			transport: lsp.TransportKind.stdio,
			options: runOptions,
		},
		debug: {
			module: serverModule,
			transport: lsp.TransportKind.stdio,
			options: debugOptions,
		},
	};

	/** @type {import('vscode-languageclient/node').LanguageClientOptions} */
	const clientOptions = {
		documentSelector: [{ language: 'tsrx' }],
		// The server drops its TypeScript services on the native backend (TypeScript 7 owns them).
		initializationOptions: { typescriptBackend: selection.backend },
		errorHandler: {
			error: (
				/** @type {Error} */ error,
				/** @type {import('vscode-languageclient/node').Message | undefined} */ message,
				/** @type {number | undefined} */ count,
			) => {
				console.error('Language server error:', error, message, count);
				return { action: lsp.ErrorAction.Continue };
			},
			closed: () => {
				console.log('Language server connection closed');
				return { action: lsp.CloseAction.Restart };
			},
		},
		outputChannel: vscode.window.createOutputChannel('TSRX Language Server'),
		traceOutputChannel: vscode.window.createOutputChannel('TSRX Language Server Trace'),
	};

	try {
		client = new lsp.LanguageClient('tsrx', 'TSRX Language Server', serverOptions, clientOptions);

		console.log('Starting language client...');
		await client.start();
		console.log('Language client started successfully');

		const volar_labs = createLabsInfo(protocol);
		volar_labs.addLanguageClient(client);

		context.subscriptions.push(activateAutoInsertion([{ language: 'tsrx' }], client));
		console.log('[TSRX] Auto-insertion activated');

		// Configure Prettier to handle .tsrx files. This sets Prettier as the default
		// formatter for `[tsrx]`, so "Format Document" routes to it directly. We deliberately
		// do not register our own DocumentFormattingEditProvider: it would show up as a second,
		// redundant "TSRX Syntax for VS Code" entry in "Format Document With…" alongside the one the
		// language client already contributes (volar-service-typescript / -css), and it broke
		// whenever the Prettier extension's format command was unavailable.
		await configurePrettier();

		// Configure TypeScript command visibility for TSRX files
		//
		// The built-in TypeScript extension provides many useful commands (Go to Definition, Find
		// References, etc.) but its menus only show for .ts/.js files by default. On the classic
		// backend, to make these commands available for TSRX files, we need to:
		//
		// 1. Set static capability contexts (features that don't change):
		//    - tsSupportsSourceDefinition: Enables "Go to Source Definition" command
		//    - tsSupportsFileReferences: Enables "Find All File References" command
		//
		// 2. Set dynamic contexts that change based on the active editor (via setupDynamicContexts):
		//    - editorLangId: Current editor's language (used in Command Palette "when" clauses)
		//    - resourceLangId: Current resource's language (used in context menu "when" clauses)
		//    - typescript.isManagedFile: Whether TypeScript extension manages this file
		//    - supportedCodeAction: Available code actions (for "Sort Imports", etc.)
		//
		// These context values are then checked by the "when" clauses in package.json's "menus" section.
		// For example: "when": "resourceLangId == tsrx" will show a menu item only for TSRX files.
		//
		// On the native backend the built-in TypeScript extension is disabled, so only the
		// contexts behind this extension's own command (`tsrx.goToSourceDefinition`) are set.
		vscode.commands.executeCommand('setContext', 'tsSupportsSourceDefinition', true);
		vscode.commands.executeCommand(
			'setContext',
			'tsSupportsFileReferences',
			selection.backend === 'classic',
		);

		setupDynamicContexts(context, selection.backend);
		console.log('[TSRX] Set up dynamic VSCode menu contexts');

		addCustomCommands(context);
		console.log('[TSRX] Registered custom commands');

		console.log('[TSRX] Extension activated successfully');
		return volar_labs.extensionExports;
	} catch (error) {
		console.error('Failed to start language client:', error);
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to start TSRX language server: ${message}`);
	}
}

/**
 * Read `tsrx.typescript.backend`, look for the TypeScript 7 extension and decide the backend.
 * The TypeScript 7 extension is only activated when native is the outcome (activating it has
 * side effects: its own onboarding may enable TypeScript 7); if its API turns out to lack
 * `registerContentMappers`, the decision is re-made as classic.
 * @returns {Promise<BackendSelection>}
 */
async function select_backend() {
	const setting = vscode.workspace.getConfiguration().get(BACKEND_SETTING);
	const useTsgo = is_tsgo_enabled();
	/** @type {NativeTypeScriptExtension} */
	let native = find_native_typescript_extension();
	let decision = resolve_backend({ setting, nativeExtension: native.state, useTsgo });
	if (decision.backend === 'native') {
		native = await activate_native_typescript_extension(native);
		decision = resolve_backend({ setting, nativeExtension: native.state, useTsgo });
	}
	return { ...decision, native };
}

/**
 * Every installed TypeScript 7 extension, in lookup order.
 * @returns {import('vscode').Extension<unknown>[]}
 */
function find_native_typescript_extensions() {
	/** @type {import('vscode').Extension<unknown>[]} */
	const extensions = [];
	for (const id of NATIVE_TYPESCRIPT_EXTENSION_IDS) {
		const extension = vscode.extensions.getExtension(id);
		if (extension) {
			extensions.push(extension);
		}
	}
	return extensions;
}

/**
 * @returns {NativeTypeScriptExtension}
 */
function find_native_typescript_extension() {
	const [extension] = find_native_typescript_extensions();
	return extension ? { state: 'installed', extension } : { state: 'missing' };
}

/**
 * Activate the installed TypeScript 7 extensions until one exposes
 * `registerContentMappers`. The nightly channel is a compiler-only companion
 * without an API when it is installed beside the extension that has one, and
 * a released build may predate the API.
 * @param {NativeTypeScriptExtension} native
 * @returns {Promise<NativeTypeScriptExtension>}
 */
async function activate_native_typescript_extension(native) {
	if (!native.extension) {
		return native;
	}
	for (const extension of find_native_typescript_extensions()) {
		try {
			const api = /** @type {NativeTypeScriptExtension['api'] | undefined} */ (
				await extension.activate()
			);
			if (api && typeof api.registerContentMappers === 'function') {
				return { state: 'available', extension, api };
			}
			console.warn(
				`[TSRX] ${extension.id} ${extension.packageJSON?.version ?? ''} has no registerContentMappers API; the native backend needs ${NATIVE_REQUIREMENTS}.`,
			);
		} catch (error) {
			console.error(`[TSRX] Failed to activate ${extension.id}:`, error);
		}
	}
	return { state: 'no-api', extension: native.extension };
}

/**
 * Tell the user once per session when the requested backend could not be used.
 * @param {import('vscode').ExtensionContext} context
 * @param {BackendSelection} selection
 */
async function report_backend_fallback(context, selection) {
	/** @type {string | undefined} */
	let message;
	if (selection.reason === 'native-extension-missing') {
		message = `"tsrx.typescript.backend" is set to "native", but the TypeScript 7 extension (${NATIVE_TYPESCRIPT_EXTENSION_IDS.join(', ')}) is not installed. Using the classic backend for .tsrx files. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
	} else if (selection.reason === 'native-api-missing') {
		message = `"tsrx.typescript.backend" is set to "native", but the installed TypeScript 7 extension (${selection.native.extension?.id ?? 'unknown'} ${selection.native.extension?.packageJSON?.version ?? ''}) does not expose the content-mapper API. The native backend needs ${NATIVE_REQUIREMENTS}. Using the classic backend for .tsrx files. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
	} else if (selection.reason === 'setting-native' && !is_tsgo_enabled()) {
		message = `"tsrx.typescript.backend" is set to "native", but TypeScript 7 is not enabled ("js/ts.experimental.useTsgo"). .tsrx files get no TypeScript features until it is enabled. ${TYPESCRIPT_7_SUPPORT_NOTE}`;
	}
	if (!message) {
		return;
	}
	await show_typescript_7_warning(message, `@id:${BACKEND_SETTING} @id:js/ts.experimental.useTsgo`);
	void context;
}

/**
 * Show a warning about TypeScript 7 support with the actions every such message
 * shares: open the tracking issue, or open the settings that decide the backend.
 * @param {string} message
 * @param {string} settings_query
 */
async function show_typescript_7_warning(message, settings_query) {
	const open_settings_action = 'Open Settings';
	const selected = await vscode.window.showWarningMessage(
		message,
		OPEN_TRACKING_ISSUE_ACTION,
		open_settings_action,
	);
	if (selected === OPEN_TRACKING_ISSUE_ACTION) {
		await vscode.env.openExternal(vscode.Uri.parse(TYPESCRIPT_7_TRACKING_ISSUE_URL));
	} else if (selected === open_settings_action) {
		await vscode.commands.executeCommand('workbench.action.openSettings', settings_query);
	}
}

/**
 * The backend is fixed for the life of the extension host (the classic path patches the
 * built-in TypeScript extension before it activates), so a setting change that would flip it
 * needs a restart.
 */
async function prompt_restart_if_backend_changed() {
	const next = resolve_backend({
		setting: vscode.workspace.getConfiguration().get(BACKEND_SETTING),
		nativeExtension: find_native_typescript_extension().state,
		useTsgo: is_tsgo_enabled(),
	});
	if (next.backend === active_backend) {
		return;
	}
	const selected = await vscode.window.showInformationMessage(
		`The TSRX TypeScript backend changed to "${next.backend}". Restart extensions to apply it.`,
		RESTART_EXTENSIONS_ACTION,
	);
	if (selected === RESTART_EXTENSIONS_ACTION) {
		await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
	}
}

/**
 * Native backend: hand the bundled content mapper to the TypeScript 7 extension so `.tsrx`
 * files in inferred projects are mapped. The registration is disposed with the extension and
 * re-made when the TypeScript 7 extension is reloaded (its API instance changes).
 * @param {import('vscode').ExtensionContext} context
 * @param {NativeTypeScriptExtension} native
 */
function register_native_content_mapper(context, native) {
	const serverPath = path.join(__dirname, 'content-mapper.js');
	if (!fs.existsSync(serverPath)) {
		const message = `Content mapper module not found at: ${serverPath}`;
		console.error(message);
		vscode.window.showErrorMessage(message);
		return;
	}
	const contribution = create_content_mapper_contribution({
		serverPath,
		cwd: context.extensionUri,
		version: content_mapper_package.version,
		execPath: process.execPath,
	});

	/** @type {import('vscode').Disposable | undefined} */
	let registration;
	/** @type {import('vscode').Extension<unknown> | undefined} */
	let registered_with = native.extension;

	/** @param {NativeTypeScriptExtension} target */
	function register(target) {
		if (!target.api) {
			return;
		}
		try {
			registration = target.api.registerContentMappers(CONTRIBUTOR_ID, [contribution]);
			registered_with = target.extension;
			console.log(`[TSRX] Registered the content mapper with ${target.extension?.id}`);
		} catch (error) {
			console.error('[TSRX] registerContentMappers failed:', error);
		}
	}

	function unregister() {
		registration?.dispose();
		registration = undefined;
	}

	register(native);
	context.subscriptions.push({ dispose: unregister });
	context.subscriptions.push(
		vscode.extensions.onDidChange(async () => {
			const current = find_native_typescript_extension();
			if (
				registration &&
				registered_with &&
				find_native_typescript_extensions().includes(registered_with)
			) {
				return;
			}
			unregister();
			if (current.extension) {
				register(await activate_native_typescript_extension(current));
			}
		}),
	);
}

/**
 * Classic backend: warn when TypeScript 7 is on (the built-in extension this path patches is
 * then off), and patch the built-in TypeScript extension before it activates.
 * @param {import('vscode').ExtensionContext} context
 */
async function activate_classic_backend(context) {
	await warn_about_local_tsgo_usage(context);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (event) => {
			if (!is_tsgo_configuration_change(event)) {
				return;
			}

			await warn_about_local_tsgo_usage(context);
		}),
	);

	const patchResult = await patchTypeScriptExtension();
	if (!patchResult.success) {
		switch (patchResult.reason) {
			case 'missing':
				console.warn('[TSRX] TypeScript extension not found; TSRX commands will be limited.');
				break;
			case 'alreadyActive':
				console.warn('[TSRX] TypeScript extension already active - patch skipped');
				// Check if we've already prompted for reload in this session
				const hasPromptedReload = context.globalState.get('tsrx.hasPromptedReload', false);
				if (!hasPromptedReload) {
					// Mark that we've prompted to avoid repeated prompts
					await context.globalState.update('tsrx.hasPromptedReload', true);
					// Prompt user to restart extension host for full TypeScript integration
					vscode.window
						.showInformationMessage(
							'TSRX extension needs to restart extensions to enable full TypeScript integration.',
							'Restart Extensions',
							'Later',
						)
						.then((selection) => {
							if (selection === 'Restart Extensions') {
								vscode.commands.executeCommand('workbench.action.restartExtensionHost');
							}
						});
				}
				break;
			case 'patternMismatch':
				console.warn(
					'[TSRX] Patch patterns did not match - TypeScript extension internals may have changed.',
				);
				break;
		}
	} else if (patchResult.reason === 'alreadyPatched') {
		console.log('[TSRX] TypeScript extension already supports TSRX files.');
	} else {
		console.log('[TSRX] Successfully patched TypeScript extension to recognize TSRX files.');
	}
}

/**
 * @param {import('vscode').ExtensionContext} context
 * @returns {Promise<void>}
 */
async function warn_about_local_tsgo_usage(context) {
	if (!(await workspace_has_tsrx_files())) {
		await context.workspaceState.update(TSGO_WARNING_STATE_KEY, false);
		return;
	}

	const local_tsgo_sections = get_local_tsgo_sections();

	if (local_tsgo_sections.length === 0) {
		await context.workspaceState.update(TSGO_WARNING_STATE_KEY, false);
		return;
	}

	if (context.workspaceState.get(TSGO_WARNING_STATE_KEY, false)) {
		return;
	}

	await context.workspaceState.update(TSGO_WARNING_STATE_KEY, true);

	await show_typescript_7_warning(
		TSGO_UNSUPPORTED_MESSAGE,
		`@id:${BACKEND_SETTING} @id:js/ts.experimental.useTsgo @id:typescript.experimental.useTsgo`,
	);
	void local_tsgo_sections;
}

/**
 * @returns {Promise<boolean>}
 */
async function workspace_has_tsrx_files() {
	if (!vscode.workspace.workspaceFolders?.length) {
		return false;
	}

	const tsrx_files = await vscode.workspace.findFiles(
		TSRX_FILE_SELECTORS[0],
		TSRX_FILE_EXCLUDE_GLOB,
		1,
	);

	return tsrx_files.length > 0;
}

/**
 * Whether TypeScript 7 is enabled in any configuration scope (`js/ts.experimental.useTsgo` or
 * its legacy `typescript.` spelling). Mirrors what the TypeScript 7 extension checks before it
 * starts its server.
 * @returns {boolean}
 */
function is_tsgo_enabled() {
	return TSGO_CONFIGURATION_SECTIONS.some(
		(section) => vscode.workspace.getConfiguration(section).get('experimental.useTsgo') === true,
	);
}

/**
 * @returns {string[]}
 */
function get_local_tsgo_sections() {
	return TSGO_CONFIGURATION_SECTIONS.filter((section) => {
		const inspected = vscode.workspace.getConfiguration(section).inspect('experimental.useTsgo');
		return inspected?.workspaceValue === true || inspected?.workspaceFolderValue === true;
	});
}

/**
 * @param {import('vscode').ConfigurationChangeEvent} event
 * @returns {boolean}
 */
function is_tsgo_configuration_change(event) {
	return TSGO_CONFIGURATION_SECTIONS.some((section) =>
		event.affectsConfiguration(`${section}.experimental.useTsgo`),
	);
}

/**
 * Sets up dynamic context variables that control when TypeScript commands appear in menus.
 *
 * Context Variables vs Menu Contributions:
 * ----------------------------------------
 * VSCode's menu system is declarative (defined in package.json) but uses context variables
 * for conditional visibility. This function bridges the gap by setting those context values.
 *
 * How it works:
 * 1. package.json defines WHERE commands appear and WHEN (using "when" clauses)
 *    Example: { "command": "typescript.goToSourceDefinition", "when": "resourceLangId == tsrx" }
 *
 * 2. This function sets the VALUES of context variables that the "when" clauses check
 *    Example: setContext('resourceLangId', 'tsrx') makes the above menu item visible
 *
 * 3. We update these contexts dynamically as the user switches between files
 *
 * Context Variables Set:
 * - editorLangId: Language ID of the active editor (for Command Palette menus)
 * - resourceLangId: Language ID of the current resource (for context menus)
 * - typescript.isManagedFile: Whether this file should be treated as a TypeScript-managed file
 * - supportedCodeAction: Space-separated list of available code action kinds
 *
 * Why Dynamic?
 * These contexts must update as the user switches files. A context set for a .tsrx file
 * should not persist when switching to a .txt file, otherwise TypeScript commands would
 * inappropriately appear for non-TSRX files.
 *
 * Package.json Requirement:
 * This function is USELESS without corresponding "menus" entries in package.json that
 * reference these context variables in their "when" clauses. The contexts set here are
 * checked by those "when" clauses to determine menu visibility.
 */
/**
 * @param {import('vscode').ExtensionContext} context
 * @param {Backend} backend
 */
function setupDynamicContexts(context, backend) {
	// The contexts below `resourceLangId` gate commands of the built-in TypeScript extension,
	// which is only patched (and active) on the classic backend.
	const builtin_typescript = backend === 'classic';

	// Update contexts based on active editor
	function updateContexts() {
		const editor = vscode.window.activeTextEditor;
		const is_tsrx = editor?.document.languageId === 'tsrx';

		// Set editorLangId context (used in commandPalette "when" clauses)
		// Example usage in package.json: "when": "editorLangId == tsrx"
		vscode.commands.executeCommand('setContext', 'editorLangId', is_tsrx ? 'tsrx' : undefined);

		// Set resourceLangId context (used in editor/context and explorer/context "when" clauses)
		// Example usage in package.json: "when": "resourceLangId == tsrx"
		vscode.commands.executeCommand('setContext', 'resourceLangId', is_tsrx ? 'tsrx' : undefined);

		// Set typescript.isManagedFile (used in commandPalette "when" clauses)
		// This mimics the TypeScript extension's own context to indicate TSRX files
		// are managed by TypeScript-like tooling
		vscode.commands.executeCommand(
			'setContext',
			'typescript.isManagedFile',
			is_tsrx && builtin_typescript,
		);

		// Set supportedCodeAction context based on available code actions
		// This enables commands like "Sort Imports" and "Remove Unused Imports"
		// which check for specific code action support via regex in their "when" clauses
		if (is_tsrx && editor && builtin_typescript) {
			// Query available code actions for the current file
			vscode.commands
				.executeCommand('vscode.executeCodeActionProvider', editor.document.uri, editor.selection)
				.then((actions) => {
					if (Array.isArray(actions) && actions.length > 0) {
						const kinds = actions
							.map(
								(/** @type {{ kind?: { value?: string } }} */ action) => action.kind?.value || '',
							)
							.join(' ');
						vscode.commands.executeCommand('setContext', 'supportedCodeAction', kinds);
					} else {
						vscode.commands.executeCommand('setContext', 'supportedCodeAction', undefined);
					}
				});
		} else {
			vscode.commands.executeCommand('setContext', 'supportedCodeAction', undefined);
		}
	}

	// Update on activation
	updateContexts();

	// Update when active editor changes
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => updateContexts()));

	// Update when text document changes (code actions may change)
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document === vscode.window.activeTextEditor?.document) {
				updateContexts();
			}
		}),
	);
}

/**
 * @param {import('vscode').ExtensionContext} context
 */
function addCustomCommands(context) {
	context.subscriptions.push(
		vscode.commands.registerCommand('tsrx.goToSourceDefinition', async () => {
			try {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					console.log('[TSRX] No active editor');
					return;
				}

				const position = editor.selection.active;
				console.log('[TSRX] Getting definitions at position:', position);

				// Use VS Code's definition provider API
				const definitions = await vscode.commands.executeCommand(
					'vscode.executeDefinitionProvider',
					editor.document.uri,
					position,
				);

				console.log('[TSRX] Definitions result:', definitions);

				if (!definitions || !Array.isArray(definitions) || definitions.length === 0) {
					vscode.window.showInformationMessage('No definition found');
					return;
				}

				// Filter for .tsrx files (prefer source over .d.ts)
				// Definition objects can have either `uri` or `targetUri`
				const tsrxDefinition = definitions.find((d) => {
					const uri = d?.uri || d?.targetUri;
					if (!uri) {
						console.warn('[TSRX] Definition has no uri:', d);
						return false;
					}
					const is_tsrx = is_tsrx_file_path(uri.path);
					console.log('[TSRX] Checking definition:', uri.path, 'isTSRX:', is_tsrx);
					return is_tsrx;
				});

				if (tsrxDefinition) {
					const uri = tsrxDefinition.uri || tsrxDefinition.targetUri;
					const range = tsrxDefinition.range || tsrxDefinition.targetRange;
					console.log('[TSRX] Found tsrx definition:', uri.path);
					await vscode.window.showTextDocument(uri, {
						selection: range,
					});
				} else {
					// If no .tsrx file found, just go to the first definition (might be .d.ts)
					const firstDef = definitions[0];
					const uri = firstDef?.uri || firstDef?.targetUri;
					const range = firstDef?.range || firstDef?.targetRange;
					console.log('[TSRX] No .tsrx definition, using first result:', uri?.path);
					if (uri) {
						await vscode.window.showTextDocument(uri, {
							selection: range,
						});
					}
				}
			} catch (error) {
				console.error('[TSRX] Error in goToSourceDefinition:', error);
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Go to Source Definition failed: ${message}`);
			}
		}),
	);
}

async function configurePrettier() {
	try {
		const config = vscode.workspace.getConfiguration();

		// Tell Prettier extension to enable formatting for tsrx language
		await config.update(
			'prettier.documentSelectors',
			TSRX_FILE_SELECTORS,
			vscode.ConfigurationTarget.Global,
		);

		// Set Prettier as default formatter for .tsrx files
		await config.update(
			'[tsrx]',
			{
				'editor.defaultFormatter': 'esbenp.prettier-vscode',
			},
			vscode.ConfigurationTarget.Global,
		);

		console.log('Prettier configuration updated for TSRX files');
	} catch (error) {
		console.error('Failed to configure Prettier:', error);
	}
}

export async function deactivate() {
	console.log('Deactivating TSRX extension...');
	if (client) {
		try {
			await client.stop();
			console.log('Language client stopped');
		} catch (error) {
			console.error('Error stopping language client:', error);
		}
	}
}

/**
 * Patches the built-in TypeScript extension to recognize TSRX files.
 *
 * The built-in TypeScript extension (vscode.typescript-language-features) provides rich
 * language features for TypeScript and JavaScript files. To make these features work for
 * TSRX files, we need to patch the extension's internal language mode list.
 *
 * This patch modifies the TypeScript extension's code at runtime to add 'tsrx' to:
 * 1. jsTsLanguageModes - The list of supported language IDs
 * 2. isSupportedLanguageMode - The function that checks if a file should be handled
 *
 * Why patching instead of typescriptServerPlugins?
 * -------------------------------------------------
 * The typescriptServerPlugins contribution point would load typescript-plugin into
 * the TypeScript extension's tsserver. However, we already run our own language server
 * (language-server) which uses typescript-plugin internally. Loading the
 * plugin twice would create conflicts and duplicate processing.
 *
 * By patching directly instead, we:
 * 1. Avoid double-loading typescript-plugin (it's already in our language server)
 * 2. Get deeper integration with the TypeScript extension's UI (menus, commands)
 * 3. Enable TypeScript commands for TSRX files without running duplicate language services
 * 4. Keep language intelligence in language-server while exposing TS UI features
 *
 * Combined with the context variables set by setupDynamicContexts(), this patch enables
 * the full suite of TypeScript commands and features to work seamlessly with TSRX files.
 */
/**
 * @typedef {object} PatchResult
 * @property {boolean} success Whether the patch ran without issues.
 * @property {"patched" | "alreadyPatched" | "missing" | "alreadyActive" | "patternMismatch"} reason
 */

/**
 * Ensures the built-in TypeScript extension recognizes TSRX files before it activates.
 * @returns {Promise<PatchResult>}
 */
async function patchTypeScriptExtension() {
	console.log('[TSRX] Starting TypeScript extension patch...');

	const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
	if (!tsExtension) {
		console.warn('[TSRX] TypeScript extension not found');
		return { success: false, reason: 'missing' };
	}

	if (tsExtension.isActive) {
		return { success: false, reason: 'alreadyActive' };
	}

	const originalReadFileSync = fs.readFileSync;
	const extensionJsPath = path.join(tsExtension.extensionPath, 'dist', 'extension.js');

	/**
	 * @param {import('node:fs').PathOrFileDescriptor} path
	 * @param {(import('node:fs').ObjectEncodingOptions & { flag?: string }) | BufferEncoding | null} [options]
	 * @returns {string | Buffer}
	 */
	function patchedReadFileSync(path, options) {
		const hasOptions = typeof options !== 'undefined' && options !== null;
		const result = hasOptions
			? originalReadFileSync.call(fs, path, options)
			: originalReadFileSync.call(fs, path);
		if (path === extensionJsPath) {
			console.log('[TSRX] Intercepted read of TypeScript extension.js, applying patch...');
			const text = typeof result === 'string' ? result : result.toString('utf8');

			// Patch the TypeScript extension to recognize tsrx files
			let patched = text
				.replace(
					't.jsTsLanguageModes=[t.javascript,t.javascriptreact,t.typescript,t.typescriptreact]',
					(s) => s + '.concat("tsrx")',
				)
				.replace(
					'.languages.match([t.typescript,t.typescriptreact,t.javascript,t.javascriptreact]',
					(s) => s + '.concat("tsrx")',
				);

			if (patched !== text) {
				console.log('[TSRX] Successfully patched TypeScript extension');
				return typeof result === 'string' ? patched : Buffer.from(patched, 'utf8');
			} else {
				console.warn(
					'[TSRX] TypeScript extension patterns did not match - may already be patched or structure changed',
				);
			}
		}
		return result;
	}

	try {
		console.log('[TSRX] Installing fs.readFileSync hook and activating TypeScript extension...');
		fs.readFileSync = /** @type {typeof fs.readFileSync} */ (patchedReadFileSync);
		await tsExtension.activate();
		console.log('[TSRX] TypeScript extension activated');
	} catch (error) {
		console.error('[TSRX] Failed to activate TypeScript extension:', error);
	} finally {
		fs.readFileSync = originalReadFileSync;
		console.log('[TSRX] fs.readFileSync hook removed');
	}

	return { success: true, reason: 'patched' };
}
