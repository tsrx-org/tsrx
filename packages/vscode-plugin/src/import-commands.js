import vscode from 'vscode';

export const SORT_IMPORTS_COMMAND = 'tsrx.sortImports';
export const REMOVE_UNUSED_IMPORTS_COMMAND = 'tsrx.removeUnusedImports';

/**
 * **TSRX: Sort Imports** and **TSRX: Remove Unused Imports** apply TypeScript's source
 * action of that kind to the current `.tsrx` file. VS Code's own commands
 * (`typescript.sortImports`) and the TypeScript 7 extension's only run in TypeScript
 * and JavaScript files. The actions come from whichever TypeScript serves the file:
 * TypeScript 7, or TypeScript 5.9 and 6 through `@tsrx/typescript-plugin`.
 *
 * The action is fetched and applied through the API rather than
 * `editor.action.sourceAction`, which acts on the focused editor only.
 * @returns {import('vscode').Disposable}
 */
export function register_import_commands() {
	return vscode.Disposable.from(
		vscode.commands.registerCommand(SORT_IMPORTS_COMMAND, () =>
			apply_source_action('source.sortImports', 'Sort Imports'),
		),
		vscode.commands.registerCommand(REMOVE_UNUSED_IMPORTS_COMMAND, () =>
			apply_source_action('source.removeUnusedImports', 'Remove Unused Imports'),
		),
	);
}

/**
 * Apply the first source action of `kind` that TypeScript offers for the active file.
 * @param {string} kind
 * @param {string} title
 */
async function apply_source_action(kind, title) {
	const document = vscode.window.activeTextEditor?.document;
	if (!document) return;
	/** @type {import('vscode').CodeAction[] | undefined} */
	const actions = await vscode.commands.executeCommand(
		'vscode.executeCodeActionProvider',
		document.uri,
		new vscode.Range(0, 0, document.lineCount, 0),
		kind,
		// Resolve the first action: VS Code's TypeScript computes its edit only then.
		1,
	);
	const action = actions?.find((candidate) => !candidate.disabled);
	if (!action) {
		vscode.window.showInformationMessage(`TypeScript offers no ${title} for this file.`);
		return;
	}
	if (action.edit) await vscode.workspace.applyEdit(action.edit);
	if (action.command) {
		await vscode.commands.executeCommand(
			action.command.command,
			...(action.command.arguments ?? []),
		);
	}
}
