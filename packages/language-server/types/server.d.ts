export interface TsrxLanguageServer {
	connection: unknown;
	server: unknown;
}

export interface TsrxLanguageServerOptions {
	/**
	 * Command-line arguments to read the `--typescript-backend=<classic|native>`
	 * flag from. Defaults to `process.argv.slice(2)`.
	 */
	argv?: readonly string[];
}

export function createTsrxLanguageServer(options?: TsrxLanguageServerOptions): TsrxLanguageServer;

/**
 * The notification the server sends to ask for a restart, to a client that set
 * the `restartNotification` initialization option.
 */
export const RESTART_NOTIFICATION: 'tsrx/restartServer';
