import vscode from 'vscode';
import { typescript_7_on } from './typescript-7.js';

export const RESTART_COMMAND = 'tsrx.restartServer';

/**
 * What the TSRX language server sends to ask for a restart (`RESTART_NOTIFICATION` in
 * `@tsrx/language-server`), because the client set the `restartNotification`
 * initialization option.
 */
export const RESTART_NOTIFICATION = 'tsrx/restartServer';

/**
 * The server asks for a restart when a package.json or a lockfile changes, to load the
 * TSRX compiler again. The client restarts it, so it stops sending before the server
 * exits. A server that exited by itself made VS Code show "Cannot call write after a
 * stream was destroyed" for the next message.
 * @param {import('vscode-languageclient/node').LanguageClient} client
 * @returns {import('vscode').Disposable}
 */
export function restart_on_request(client) {
	return client.onNotification(RESTART_NOTIFICATION, () => {
		client.restart().catch((error) => {
			client.error('Restarting the TSRX language server failed.', error, false);
		});
	});
}

/**
 * **TSRX: Restart Language Server** restarts everything that serves `.tsrx` files: the
 * TSRX language server, and the TypeScript server, which is VS Code's own tsserver
 * (hosting `@tsrx/typescript-plugin`) or TypeScript 7 (running `@tsrx/content-mapper`).
 * Nobody has to know which TypeScript serves the file to restart it.
 * @param {() => import('vscode-languageclient/node').LanguageClient | undefined} get_client
 * @returns {import('vscode').Disposable}
 */
export function register_restart_command(get_client) {
	return vscode.commands.registerCommand(RESTART_COMMAND, async () => {
		const typescript_restart = typescript_7_on()
			? 'typescript.native-preview.restart'
			: 'typescript.restartTsServer';
		// Missing while no TypeScript server runs, such as TypeScript 7 on with only the
		// TypeScript 7 Nightly extension installed.
		const commands = await vscode.commands.getCommands(true);
		try {
			await Promise.all([
				get_client()?.restart(),
				commands.includes(typescript_restart)
					? vscode.commands.executeCommand(typescript_restart)
					: undefined,
			]);
			vscode.window.setStatusBarMessage('TSRX: Restarted the language server.', 3000);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`TSRX could not restart the language server: ${message}`);
		}
	});
}
