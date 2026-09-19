/**
 * TSRX Syntax for VS Code
 *
 * This extension provides language support for TSRX files (.tsrx) by:
 * 1. Starting a Volar-based language server (language-server) for TSRX syntax and semantics
 * 2. Giving `.tsrx` files TypeScript features through one of two backends (see `backend.js`):
 *    - classic: patching the built-in TypeScript extension to recognize TSRX files while the
 *      language server hosts TypeScript 5 itself
 *    - native: leaving them to TypeScript 7, which runs `@tsrx/content-mapper` for the `.tsrx`
 *      files a project declares under `contentMappers` in tsconfig.json, and running the
 *      language server slimmed down. The extension never talks to the TypeScript 7 extension.
 * 3. Setting VSCode context variables to expose TypeScript commands for TSRX files
 *
 * Architecture: VS Code's TypeScript owns `.tsrx` files
 * -----------------------------------------------------
 * The extension never loads TypeScript and never patches another extension. TypeScript
 * features for `.tsrx` files come from the TypeScript VS Code itself runs:
 *
 * - TypeScript 7 off (classic): VS Code's built-in TypeScript extension runs its tsserver with
 *   `@tsrx/typescript-plugin`, contributed through the `typescriptServerPlugins` point of
 *   package.json and shipped inside this extension. `languages: ["tsrx"]` makes VS Code manage
 *   `.tsrx` documents like `.ts` ones, so its own commands and menus (Find All File References,
 *   Sort Imports, ...) work on them and `.ts` importers resolve `.tsrx` modules, whichever
 *   TypeScript version VS Code runs (its own copy or the workspace's).
 * - TypeScript 7 on (native): the TypeScript 7 extension runs `@tsrx/content-mapper` for the
 *   `.tsrx` files each tsconfig.json declares under `contentMappers`.
 *
 * The TSRX language server (language-server, Volar based) runs beside it in a slim mode and
 * serves only what TypeScript does not: TSRX snippets, CSS in `<style>`, document symbols,
 * auto-closing tags, CSS-class hover and definition, keyword highlights, and, when VS Code's
 * tsserver is the TypeScript (`typescriptBackend: "plugin"`), the TSRX compile errors that the
 * content mapper reports itself on TypeScript 7. Only one TypeScript ever serves a file.
 */

import vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import protocol from '@volar/language-server/protocol';
import * as lsp from 'vscode-languageclient/node';
import { activateAutoInsertion, createLabsInfo } from '@volar/vscode';
import {
	TYPESCRIPT_7_SETTING_KEY,
	TYPESCRIPT_7_SETTING_SECTIONS,
	resolve_backend,
} from './backend.js';

/** @import { Backend } from './backend.js' */

const TSRX_FILE_SELECTORS = ['**/*.tsrx'];
const RESTART_EXTENSIONS_ACTION = 'Restart Extensions';

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

	const backend = select_backend();
	active_backend = backend;
	console.log(`[TSRX] TypeScript backend: ${backend}`);
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (event) => {
			if (is_typescript_7_configuration_change(event)) {
				await prompt_restart_if_backend_changed();
			}
		}),
	);

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
		// VS Code's TypeScript owns every TypeScript feature for .tsrx files on both backends
		// (its tsserver through the contributed @tsrx/typescript-plugin, or TypeScript 7 through
		// @tsrx/content-mapper), so the server never loads TypeScript and never serves TypeScript
		// features here. `typescriptBackend` tells it which one reports TSRX compile errors.
		initializationOptions: { typescriptBackend: backend === 'native' ? 'native' : 'plugin' },
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

		// The menus in package.json reuse the built-in TypeScript extension's commands on .tsrx
		// files. VS Code manages .tsrx documents itself (the contributed plugin declares the
		// language), so it maintains `typescript.isManagedFile`, `editorLangId`, `resourceLangId`
		// and `supportedCodeAction` for them; only the two capability contexts are set here. On
		// the native backend the built-in extension is off, so only this extension's own
		// `tsrx.goToSourceDefinition` stays available.
		vscode.commands.executeCommand('setContext', 'tsSupportsSourceDefinition', true);
		vscode.commands.executeCommand('setContext', 'tsSupportsFileReferences', backend === 'classic');

		addCustomCommands(context);
		console.log('[TSRX] Registered custom commands');

		console.log('[TSRX] Extension activated successfully');
		return { ...volar_labs.extensionExports, tsrx: { backend } };
	} catch (error) {
		console.error('Failed to start language client:', error);
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to start TSRX language server: ${message}`);
	}
}

/**
 * The backend that matches VS Code's TypeScript 7 switch: native when it is on, classic
 * otherwise. Nothing else is consulted, in particular no other extension.
 * @returns {Backend}
 */
function select_backend() {
	return resolve_backend(is_typescript_7_setting_enabled());
}

/**
 * The backend is fixed for the life of the extension host (the classic path patches the
 * built-in TypeScript extension before it activates), so a setting change that would flip it
 * needs a restart.
 */
async function prompt_restart_if_backend_changed() {
	const next = select_backend();
	if (next === active_backend) {
		return;
	}
	const selected = await vscode.window.showInformationMessage(
		`TypeScript 7 was ${next === 'native' ? 'enabled' : 'disabled'} for this workspace. Restart extensions so the TSRX extension follows it.`,
		RESTART_EXTENSIONS_ACTION,
	);
	if (selected === RESTART_EXTENSIONS_ACTION) {
		await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
	}
}

/**
 * Whether VS Code's TypeScript 7 switch is on in any configuration scope
 * (`js/ts.experimental.useTsgo` or its deprecated `typescript.` spelling).
 * @returns {boolean}
 */
function is_typescript_7_setting_enabled() {
	return TYPESCRIPT_7_SETTING_SECTIONS.some(
		(section) => vscode.workspace.getConfiguration(section).get(TYPESCRIPT_7_SETTING_KEY) === true,
	);
}

/**
 * @param {import('vscode').ConfigurationChangeEvent} event
 * @returns {boolean}
 */
function is_typescript_7_configuration_change(event) {
	return TYPESCRIPT_7_SETTING_SECTIONS.some((section) =>
		event.affectsConfiguration(`${section}.${TYPESCRIPT_7_SETTING_KEY}`),
	);
}

/**
 * The extension's own commands.
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
