/**
 * TSRX Syntax for VS Code
 *
 * This extension provides language support for TSRX files (.tsrx) by:
 * 1. Starting a Volar-based language server (language-server) for TSRX syntax and semantics
 * 2. Leaving TypeScript features for `.tsrx` files to VS Code's own TypeScript:
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
 * the TSRX compile errors (`typescriptBackend: "plugin"`); `diagnostics.js` drops that copy for
 * a file the content mapper already reports on under TypeScript 7. The extension never asks
 * which TypeScript VS Code runs: no setting, no other extension. Only one TypeScript ever
 * serves a file.
 */

import vscode from 'vscode';
import path from 'node:path';
import fs from 'node:fs';
import protocol from '@volar/language-server/protocol';
import * as lsp from 'vscode-languageclient/node';
import { activateAutoInsertion, createLabsInfo } from '@volar/vscode';
import { CompileErrorDedupe, has_server_compile_errors } from './diagnostics.js';

const TSRX_FILE_SELECTORS = ['**/*.tsrx'];
const RESTART_EXTENSIONS_ACTION = 'Restart Extensions';

/**
 * @param {string} file_path
 * @returns {boolean}
 */
function is_tsrx_file_path(file_path) {
	return file_path.endsWith('.tsrx');
}

/**
 * Re-apply the compile-error filter to the language server's diagnostics for a file:
 * directly for pushed diagnostics, and by asking VS Code to pull them again for pulled ones.
 * @param {import('vscode').Uri} uri
 */
function refresh_server_diagnostics(uri) {
	if (!client) {
		return;
	}
	const pushed = client.diagnostics?.get(uri);
	if (pushed?.length) {
		client.diagnostics?.set(uri, dedupe.filter(pushed, vscode.languages.getDiagnostics(uri)));
		return;
	}
	const document = vscode.workspace.textDocuments.find(
		(candidate) => candidate.uri.toString() === uri.toString(),
	);
	if (document) {
		client
			.getFeature(lsp.DocumentDiagnosticRequest.method)
			?.getProvider(document)
			?.onDidChangeDiagnosticsEmitter.fire();
	}
}

/** @type {import('vscode-languageclient/node').LanguageClient | undefined} */
let client;
/** Whether TypeScript 7's content mapper has been seen reporting in this session. */
const dedupe = new CompileErrorDedupe();

/** Language ids VS Code's TypeScript extensions activate on. */
const JS_TS_LANGUAGES = new Set(['typescript', 'typescriptreact', 'javascript', 'javascriptreact']);
const JS_TS_GLOB = '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
/** Directories for which a JavaScript or TypeScript file was opened to wake VS Code's TypeScript. */
const woken_directories = new Set();
/** The file written next to a `.tsrx` file when its project has no `.ts` or `.js` file at all. */
const WAKE_UP_FILE_NAME = 'tsrx-wake-up.ts';
const WAKE_UP_FILE_CONTENT = `// DO NOT CLOSE THIS FILE. IT CLOSES AND DELETES ITSELF IN A MOMENT.
//
// The TSRX extension created it because this project has no TypeScript or
// JavaScript file. VS Code's TypeScript starts, and loads a project, only when
// one of the project's .ts or .js files is opened (microsoft/TypeScript#64355);
// without one, .tsrx files would get no TypeScript features at all.
//
// As soon as TypeScript is running for this project, this tab is closed and the
// file is removed. If the file is still here later, delete it.
export {};
function tsrxWakeUp() {
	const unused = 1;
}
`;
/** How long to keep the wake-up file at most before closing and removing it anyway. */
const WAKE_UP_TIMEOUT_MS = 30_000;

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
		// VS Code's own TypeScript serves every TypeScript feature for .tsrx files (its tsserver
		// through the contributed @tsrx/typescript-plugin, or TypeScript 7 through
		// @tsrx/content-mapper), so the server never loads TypeScript and never serves TypeScript
		// features here. It always reports TSRX compile errors; the middleware below drops that
		// copy once TypeScript 7's content mapper has been seen reporting in this session, so
		// the extension never has to know which TypeScript VS Code runs.
		initializationOptions: { typescriptBackend: 'plugin' },
		middleware: {
			handleDiagnostics(uri, diagnostics, next) {
				next(uri, dedupe.filter(diagnostics, vscode.languages.getDiagnostics(uri)));
			},
			async provideDiagnostics(document, previousResultId, token, next) {
				const report = await next(document, previousResultId, token);
				if (report && 'items' in report) {
					const uri = document instanceof vscode.Uri ? document : document.uri;
					report.items = dedupe.filter(report.items, vscode.languages.getDiagnostics(uri));
				}
				return report;
			},
		},
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
		// language) and maintains every context key those menus use, `typescript.isManagedFile`,
		// `tsSupportsFileReferences`, `supportedCodeAction`; with TypeScript 7 on, the built-in
		// extension is off and those entries stay hidden by themselves.

		// The mapper's compile errors can arrive after the server's copy is already shown. On the
		// first sighting of the mapper, and whenever a .tsrx file still shows the server's copy
		// afterwards, refresh the server's diagnostics so the middleware filters them.
		context.subscriptions.push(
			vscode.languages.onDidChangeDiagnostics((event) => {
				for (const uri of event.uris) {
					if (!is_tsrx_file_path(uri.fsPath)) {
						continue;
					}
					const all = vscode.languages.getDiagnostics(uri);
					if (dedupe.observe(all)) {
						for (const document of vscode.workspace.textDocuments) {
							if (document.languageId === 'tsrx') {
								refresh_server_diagnostics(document.uri);
							}
						}
					} else if (dedupe.mapper_seen && has_server_compile_errors(all)) {
						refresh_server_diagnostics(uri);
					}
				}
			}),
		);

		// VS Code's TypeScript extensions activate only on JavaScript and TypeScript documents,
		// and TypeScript 7 learns about `.tsrx` files only once a project that declares the
		// mapper has loaded, which also takes a file of that project being opened. A workspace
		// where only `.tsrx` files are opened would therefore get no TypeScript features at
		// all (microsoft/TypeScript#64355). Until that is fixed upstream, open the nearest
		// TypeScript or JavaScript file of the project once, hidden: no editor, nothing
		// written, nothing to close.
		context.subscriptions.push(
			vscode.workspace.onDidOpenTextDocument((document) => {
				if (document.languageId === 'tsrx') {
					void wake_typescript_for(document);
				}
			}),
		);
		for (const document of vscode.workspace.textDocuments) {
			if (document.languageId === 'tsrx') {
				void wake_typescript_for(document);
			}
		}

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
 * Open, without showing it, the JavaScript or TypeScript file nearest to a `.tsrx` document
 * (same directory first, then up to the workspace folder, then anywhere in it outside
 * node_modules), so VS Code's TypeScript activates and loads the project the `.tsrx` file
 * belongs to. Done once per directory; skipped while any such file is already open.
 * @param {import('vscode').TextDocument} document
 */
async function wake_typescript_for(document) {
	if (document.uri.scheme !== 'file') {
		return;
	}
	const folder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (!folder) {
		return;
	}
	const directory = path.dirname(document.uri.fsPath);
	if (woken_directories.has(directory)) {
		return;
	}
	if (
		vscode.workspace.textDocuments.some(
			(open) => open.uri.scheme === 'file' && JS_TS_LANGUAGES.has(open.languageId),
		)
	) {
		woken_directories.add(directory);
		return;
	}
	woken_directories.add(directory);
	const root = folder.uri.fsPath;
	/** @type {import('vscode').Uri | undefined} */
	let candidate;
	for (let current = directory; ; current = path.dirname(current)) {
		[candidate] = await vscode.workspace.findFiles(
			new vscode.RelativePattern(current, JS_TS_GLOB),
			null,
			1,
		);
		if (candidate || current === root || !current.startsWith(root)) {
			break;
		}
	}
	if (!candidate) {
		[candidate] = await vscode.workspace.findFiles(
			new vscode.RelativePattern(folder, `**/${JS_TS_GLOB}`),
			'**/node_modules/**',
			1,
		);
	}
	if (!candidate) {
		console.log(
			`[TSRX] No TypeScript or JavaScript file near ${document.uri.fsPath}; writing ${WAKE_UP_FILE_NAME} to wake VS Code's TypeScript`,
		);
		await wake_typescript_with_a_file(vscode.Uri.file(path.join(directory, WAKE_UP_FILE_NAME)));
		return;
	}
	try {
		await vscode.workspace.openTextDocument(candidate);
		console.log(
			`[TSRX] Opened ${candidate.fsPath} (hidden) so VS Code's TypeScript serves ${path.basename(document.uri.fsPath)}`,
		);
	} catch (error) {
		console.warn("[TSRX] Could not open a TypeScript file to wake VS Code's TypeScript:", error);
	}
}

/**
 * The project has no `.ts` or `.js` file to open: write one that explains itself, open it
 * as an inactive tab next to the `.tsrx` file, and, as soon as TypeScript reports its unused-local hint on it
 * (proof that TypeScript is running and has loaded this project; the file is a module with
 * an unused local, since unused globals of a script are never reported), or after a timeout,
 * close its tab and delete it. If the user closes the tab first, the file is deleted right
 * away.
 * @param {import('vscode').Uri} uri
 */
async function wake_typescript_with_a_file(uri) {
	try {
		await vscode.workspace.fs.writeFile(uri, Buffer.from(WAKE_UP_FILE_CONTENT, 'utf8'));
		await vscode.workspace.openTextDocument(uri);
		// `vscode.open` (unlike `showTextDocument`) honours `background`: the tab is added next
		// to the `.tsrx` tab without becoming the active one, so the `.tsrx` file stays in view.
		await vscode.commands.executeCommand('vscode.open', uri, {
			background: true,
			preview: true,
			preserveFocus: true,
		});
	} catch (error) {
		console.warn(`[TSRX] Could not write or open ${uri.fsPath}:`, error);
		return;
	}
	let done = false;
	/** @type {import('vscode').Disposable[]} */
	const subscriptions = [];
	const finish = async () => {
		if (done) {
			return;
		}
		done = true;
		for (const subscription of subscriptions) {
			subscription.dispose();
		}
		const tabs = vscode.window.tabGroups.all.flatMap((group) =>
			group.tabs.filter(
				(tab) =>
					tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === uri.toString(),
			),
		);
		try {
			if (tabs.length > 0) {
				await vscode.window.tabGroups.close(tabs, true);
			}
			await vscode.workspace.fs.delete(uri);
			console.log(`[TSRX] Removed ${uri.fsPath}`);
		} catch (error) {
			console.warn(`[TSRX] Could not remove ${uri.fsPath}:`, error);
		}
	};
	subscriptions.push(
		vscode.languages.onDidChangeDiagnostics((event) => {
			if (
				event.uris.some((changed) => changed.toString() === uri.toString()) &&
				vscode.languages.getDiagnostics(uri).length > 0
			) {
				void finish();
			}
		}),
		vscode.workspace.onDidCloseTextDocument((closed) => {
			if (closed.uri.toString() === uri.toString()) {
				void finish();
			}
		}),
	);
	if (vscode.languages.getDiagnostics(uri).length > 0) {
		void finish();
	} else {
		setTimeout(() => void finish(), WAKE_UP_TIMEOUT_MS);
	}
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
