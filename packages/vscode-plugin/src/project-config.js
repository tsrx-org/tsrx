import fs from 'node:fs';
import path from 'node:path';
import vscode from 'vscode';

export const GO_TO_PROJECT_CONFIG_COMMAND = 'tsrx.goToProjectConfig';

/**
 * **TSRX: Go to Project Configuration** opens the `tsconfig.json` that applies to the
 * current `.tsrx` file: the nearest one above it, where TSRX reads its settings
 * (`tsrx.compiler`, `tsrx.platform`), as `@tsrx/typescript-plugin` finds it. VS Code's
 * own command (`typescript.goToProjectConfig`) only runs in TypeScript and
 * JavaScript files, and the TypeScript 7 extension has none.
 * @returns {import('vscode').Disposable}
 */
export function register_project_config_command() {
	return vscode.commands.registerCommand(GO_TO_PROJECT_CONFIG_COMMAND, async () => {
		const document = vscode.window.activeTextEditor?.document;
		if (!document || document.uri.scheme !== 'file') return;
		const config = nearest_tsconfig(path.dirname(document.uri.fsPath));
		if (!config) {
			vscode.window.showInformationMessage(
				'TSRX found no tsconfig.json for this file. TSRX reads its settings from the nearest tsconfig.json above the file.',
			);
			return;
		}
		await vscode.window.showTextDocument(vscode.Uri.file(config));
	});
}

/**
 * The nearest `tsconfig.json` from `directory` up.
 * @param {string} directory
 * @returns {string | undefined}
 */
export function nearest_tsconfig(directory) {
	for (let current = directory; ; current = path.dirname(current)) {
		const candidate = path.join(current, 'tsconfig.json');
		if (fs.existsSync(candidate)) return candidate;
		if (path.dirname(current) === current) return undefined;
	}
}
