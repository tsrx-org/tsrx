import vscode from 'vscode';
import { FILE_REFERENCES_COMMAND } from '@tsrx/typescript-plugin/src/plugin-file-references.js';
import { TYPESCRIPT_7_TRACKING_URL } from '@tsrx/typescript-plugin/src/typescript-version.js';
import { served_by_tsserver, tsserver_location } from './tsserver-files.js';
import { typescript_7_on } from './typescript-7.js';

export const FIND_FILE_REFERENCES_COMMAND = 'tsrx.findAllFileReferences';

/**
 * The end of the last run's `show_in_references_view`.
 * @type {Promise<unknown>}
 */
let settings_turn = Promise.resolve();

/**
 * **Find File References** for `.tsrx` files: every file that imports the file. VS Code's
 * own command (`typescript.findAllFileReferences`) refuses any file that is not
 * TypeScript or JavaScript.
 *
 * - VS Code's own TypeScript (5.9 or 6): `typescript.tsserverRequest` sends
 *   `@tsrx/typescript-plugin`'s `FILE_REFERENCES_COMMAND`, which runs tsserver's
 *   `fileReferences`. That command forwards only requests whose name starts with `_`,
 *   besides a few built-in ones.
 * - TypeScript 7: a message, because TypeScript 7 cannot find file references yet
 *   (microsoft/TypeScript#63806, tsrx-org/tsrx#993).
 *
 * The Explorer and the editor tab menus pass the file; the Command Palette passes nothing,
 * so the command takes the active editor's file.
 * @returns {import('vscode').Disposable}
 */
export function register_file_references_command() {
	return vscode.commands.registerCommand(
		FIND_FILE_REFERENCES_COMMAND,
		async (/** @type {import('vscode').Uri | undefined} */ resource) => {
			const uri = resource ?? vscode.window.activeTextEditor?.document.uri;
			if (!uri) return;
			if (typescript_7_on()) {
				void vscode.window
					.showInformationMessage(
						'Find File References does not work in .tsrx files with TypeScript 7 yet.',
						'Learn More',
					)
					.then((choice) => {
						if (choice) void vscode.env.openExternal(vscode.Uri.parse(TYPESCRIPT_7_TRACKING_URL));
					});
				return;
			}
			if (!served_by_tsserver(uri)) {
				vscode.window.showErrorMessage('Find File References failed: Unknown file type.');
				return;
			}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Window, title: 'Finding file references' },
				async () => {
					const locations = await file_references(uri);
					if (!locations) return;
					// One run at a time changes the setting: a run that started while another
					// one's change was still being written could otherwise show after that
					// change was taken back.
					const shown = settings_turn.then(() => show_in_references_view(uri, locations));
					settings_turn = shown.catch(() => {});
					await shown;
				},
			);
		},
	);
}

/**
 * tsserver's file references, through `@tsrx/typescript-plugin`'s request.
 * @param {import('vscode').Uri} uri
 * @returns {Promise<import('vscode').Location[] | undefined>} `undefined` when the request
 *   failed (after saying so), was cancelled or got no answer, as when no server runs.
 */
async function file_references(uri) {
	/** @type {{ type?: string, body?: { refs: import('./tsserver-files.js').TsserverSpan[] } } | undefined} */
	let response;
	try {
		// Opened first, as VS Code's own command does: a file chosen in the Explorer may not be
		// open, and VS Code hands tsserver only the files that are.
		const document = await vscode.workspace.openTextDocument(uri);
		response = await vscode.commands.executeCommand(
			'typescript.tsserverRequest',
			FILE_REFERENCES_COMMAND,
			{ file: document.uri },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Find File References failed: ${message}`);
		return undefined;
	}
	// As VS Code's own command: `cancelled`, `noContent` and `noServer` show nothing.
	if (response?.type !== 'response' || !response.body) return undefined;
	return response.body.refs.map(tsserver_location);
}

/**
 * Show `locations` in the References view, as VS Code's own command does: the References
 * view takes over `editor.action.showReferences` while `references.preferredLocation` is
 * `view`, so the setting is `view` in the workspace settings for the call. Where those
 * settings cannot be written (no folder is open), the references show where the setting
 * says.
 * @param {import('vscode').Uri} uri
 * @param {import('vscode').Location[]} locations
 */
async function show_in_references_view(uri, locations) {
	const show = () =>
		vscode.commands.executeCommand(
			'editor.action.showReferences',
			uri,
			new vscode.Position(0, 0),
			locations,
		);
	const config = vscode.workspace.getConfiguration('references');
	if (config.get('preferredLocation') === 'view') return show();
	const workspace_value = config.inspect('preferredLocation')?.workspaceValue;
	try {
		await config.update('preferredLocation', 'view', vscode.ConfigurationTarget.Workspace);
	} catch {
		return show();
	}
	try {
		return await show();
	} finally {
		await config.update('preferredLocation', workspace_value, vscode.ConfigurationTarget.Workspace);
	}
}
