/**
 * How the extension starts the TSRX language server: `server_module` as a Node module,
 * with `TSRX_DEBUG` on unless the extension host has it set to `false`.
 *
 * `options` is a getter, so every start (the first one, a restart, and a restart after
 * a crash) gets new options. vscode-languageclient 9 writes its environment into the
 * options it gets, and the `fork` of VS Code's Electron then replaces `env` with an
 * object that only inherits those variables. The next start copied only that object's
 * own variables: the restarted server had no `TSRX_DEBUG` and wrote nothing to the
 * output (#997). vscode-languageclient 10 copies the options before it changes them.
 * @param {string} server_module
 * @param {import('vscode-languageclient/node').TransportKind} transport
 */
export function create_server_options(server_module, transport) {
	/** @param {string[]} execArgv */
	const server = (execArgv) => ({
		module: server_module,
		transport,
		get options() {
			return {
				execArgv: [...execArgv],
				env: {
					...process.env,
					TSRX_DEBUG: process.env.TSRX_DEBUG === 'false' ? 'false' : 'true',
				},
			};
		},
	});
	return { run: server([]), debug: server(['--nolazy', '--inspect']) };
}
