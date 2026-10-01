import vscode from 'vscode';
import { SOURCE_DEFINITION_COMMAND } from '@tsrx/typescript-plugin/src/plugin-source-definition.js';
import { TYPESCRIPT_7_TRACKING_URL } from '@tsrx/typescript-plugin/src/typescript-version.js';
import { typescript_7_on } from './typescript-7.js';

export const GO_TO_SOURCE_DEFINITION_COMMAND = 'tsrx.goToSourceDefinition';

/**
 * Whether the TypeScript 7 extension's Go to Source Definition runs in `.tsrx` files.
 * `tsc --lsp` answers its request (`custom/textDocument/sourceDefinition`) for them
 * through the content mapper, but the command only runs in TypeScript and JavaScript
 * files (microsoft/TypeScript#64576), and no other extension can send the request
 * (microsoft/TypeScript#64580).
 * Set this to true once a fixed extension ships (tsrx-org/tsrx#992).
 */
const TYPESCRIPT_7_SOURCE_DEFINITION = false;

const NO_SOURCE_DEFINITIONS = 'No source definitions found.';

/**
 * **Go to Source Definition** in `.tsrx` files: like Go to Definition, but it goes
 * past a `.d.ts` file to the JavaScript behind it. VS Code's own command and the
 * TypeScript 7 extension's only run in TypeScript and JavaScript files.
 *
 * - VS Code's own TypeScript (5.9 or 6): `typescript.tsserverRequest` sends
 *   `@tsrx/typescript-plugin`'s `SOURCE_DEFINITION_COMMAND`, which runs tsserver's
 *   `findSourceDefinition`. That command forwards only requests whose name starts
 *   with `_`, besides a few built-in ones.
 * - TypeScript 7: Go to Definition, until `TYPESCRIPT_7_SOURCE_DEFINITION`. The first
 *   time in a session, a message says why.
 * @returns {import('vscode').Disposable}
 */
export function register_source_definition_command() {
	let explained = false;
	return vscode.commands.registerCommand(GO_TO_SOURCE_DEFINITION_COMMAND, async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;
		const { document } = editor;
		const position = editor.selection.active;

		/** @type {import('vscode').Location[] | undefined} */
		let locations;
		let not_found = NO_SOURCE_DEFINITIONS;
		if (typescript_7_on()) {
			if (TYPESCRIPT_7_SOURCE_DEFINITION) {
				return vscode.commands.executeCommand('typescript.native-preview.goToSourceDefinition');
			}
			if (!explained) {
				explained = true;
				void vscode.window
					.showInformationMessage(
						'Go to Source Definition does not work in .tsrx files with TypeScript 7 yet. TSRX opened the definition instead.',
						'Learn More',
					)
					.then((choice) => {
						if (choice) void vscode.env.openExternal(vscode.Uri.parse(TYPESCRIPT_7_TRACKING_URL));
					});
			}
			locations = await definitions(document.uri, position);
			not_found = 'No definition found.';
		} else {
			locations = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Window, title: 'Finding source definitions' },
				() => source_definitions(document.uri, position),
			);
			if (!locations) return;
		}
		// The editor and position are explicit, so this works without the editor focus.
		await vscode.commands.executeCommand(
			'editor.action.goToLocations',
			document.uri,
			position,
			locations,
			'goto',
			not_found,
		);
	});
}

/**
 * tsserver's source definitions, through `@tsrx/typescript-plugin`'s request.
 * @param {import('vscode').Uri} uri
 * @param {import('vscode').Position} position
 * @returns {Promise<import('vscode').Location[] | undefined>} `undefined` when the request
 *   failed (after saying so) or was cancelled.
 */
async function source_definitions(uri, position) {
	/** @type {{ type?: string, body?: Array<{ file: string, start: TsserverPosition, end: TsserverPosition }> } | undefined} */
	let response;
	try {
		response = await vscode.commands.executeCommand(
			'typescript.tsserverRequest',
			SOURCE_DEFINITION_COMMAND,
			{ file: uri, line: position.line + 1, offset: position.character + 1 },
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Go to Source Definition failed: ${message}`);
		return undefined;
	}
	if (response?.type === 'cancelled') return undefined;
	return (response?.body ?? []).map(
		(span) =>
			new vscode.Location(
				vscode.Uri.file(span.file),
				new vscode.Range(
					span.start.line - 1,
					span.start.offset - 1,
					span.end.line - 1,
					span.end.offset - 1,
				),
			),
	);
}

/**
 * Go to Definition's locations, from whichever TypeScript serves the file.
 * @param {import('vscode').Uri} uri
 * @param {import('vscode').Position} position
 * @returns {Promise<import('vscode').Location[]>}
 */
async function definitions(uri, position) {
	/** @type {Array<import('vscode').Location | import('vscode').LocationLink> | undefined} */
	const found = await vscode.commands.executeCommand(
		'vscode.executeDefinitionProvider',
		uri,
		position,
	);
	return (found ?? []).map((definition) =>
		'targetUri' in definition
			? new vscode.Location(
					definition.targetUri,
					definition.targetSelectionRange ?? definition.targetRange,
				)
			: definition,
	);
}

/** @typedef {{ line: number, offset: number }} TsserverPosition One-based, as tsserver counts. */
