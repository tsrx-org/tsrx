// Types only: the LSP types `@volar/language-server` re-exports from vscode-languageserver.
/** @import { Connection, DocumentFormattingParams, DocumentRangeFormattingParams, TextEdit } from '@volar/language-server/node' */
/** @import { FormatResult } from './formatting.js' */

import fs from 'node:fs';
import path from 'node:path';
import { URI } from 'vscode-uri';
import { MINIMUM_PRETTIER_VERSION, PRETTIER_PLUGIN, find_up, format_tsrx } from './formatting.js';

/**
 * Answer `textDocument/formatting` and `textDocument/rangeFormatting` (Format
 * Selection, format on paste) for `.tsrx` files with `format_tsrx`, on the
 * plain LSP connection: Volar only formats generated code, never the `.tsrx`
 * source, and its TypeScript and CSS formatters stay off (`stripFormatting`
 * in `servicePlugins.js`), so this is the server's only formatter.
 *
 * When the project lacks `prettier` or `@tsrx/prettier-plugin`, or has a Prettier
 * that is too old, the request returns no edits and the editor shows a message
 * once per project (`window/showMessage`): an error response would report a
 * failure on every save. A file Prettier cannot parse, which is common while
 * typing, is only logged. `tsrx.format.enable: false` turns formatting off.
 * @param {Connection} connection
 * @param {(uri: string) => {
 * 	getText(): string,
 * 	positionAt(offset: number): { line: number, character: number },
 * 	offsetAt(position: { line: number, character: number }): number,
 * } | undefined} get_document
 */
export function register_formatting(connection, get_document) {
	/** Projects that were already told what formatting needs. */
	const told = new Set();

	/**
	 * @param {DocumentFormattingParams | DocumentRangeFormattingParams} params
	 * @returns {Promise<TextEdit[] | null>}
	 */
	async function format(params) {
		const document = get_document(params.textDocument.uri);
		const uri = URI.parse(params.textDocument.uri);
		if (!document || uri.scheme !== 'file') return null;
		if (!(await formatting_enabled(connection, params.textDocument.uri))) return null;

		const range =
			'range' in params
				? { start: document.offsetAt(params.range.start), end: document.offsetAt(params.range.end) }
				: undefined;
		const text = document.getText();
		const result = await format_tsrx({
			file_path: uri.fsPath,
			text,
			tab_size: params.options.tabSize,
			insert_spaces: params.options.insertSpaces,
			range,
		});
		if (result.status === 'formatted') {
			/** @type {TextEdit[]} */
			const edits = [
				{
					range: { start: { line: 0, character: 0 }, end: document.positionAt(text.length) },
					newText: result.text,
				},
			];
			return edits;
		}
		if (result.status === 'failed') {
			const message = result.error instanceof Error ? result.error.message : String(result.error);
			connection.console.log(`Prettier could not format ${uri.fsPath}:\n${message}`);
			return null;
		}
		const advice = setup_message(result, add_dev_command(uri.fsPath));
		if (advice) {
			const project = path.dirname(find_up(path.dirname(uri.fsPath), 'package.json') ?? uri.fsPath);
			connection.console.warn(`${advice} (for ${uri.fsPath})`);
			if (!told.has(project)) {
				told.add(project);
				// A notification (MessageType.Warning = 2): showWarningMessage would send
				// window/showMessageRequest and wait for an answer nobody needs.
				void connection.sendNotification('window/showMessage', { type: 2, message: advice });
			}
		}
		return result.status === 'unchanged' || result.status === 'ignored' ? [] : null;
	}

	connection.onDocumentFormatting(format);
	// Format Selection and format on paste.
	connection.onDocumentRangeFormatting(format);
}

/**
 * What the project needs before TSRX can format its `.tsrx` files, if anything.
 * @param {FormatResult} result
 * @param {string} [add_dev] The command that adds dev dependencies (`add_dev_command`).
 * @returns {string | undefined}
 */
export function setup_message(result, add_dev = 'npm install -D') {
	if (result.status === 'missing') {
		const names = result.packages.join(' and ');
		return `To format .tsrx files, TSRX needs ${names} in this project. To install ${result.packages.length > 1 ? 'them' : 'it'}, run: ${add_dev} ${result.packages.join(' ')}`;
	}
	if (result.status === 'unsupported') {
		return `To format .tsrx files, TSRX needs Prettier ${MINIMUM_PRETTIER_VERSION} or newer for ${PRETTIER_PLUGIN}. This project has Prettier ${result.version}.`;
	}
	return undefined;
}

/** Lockfiles and the command that adds dev dependencies with their package manager. */
const PACKAGE_MANAGERS = /** @type {const} */ ([
	['pnpm-lock.yaml', 'pnpm add -D'],
	['yarn.lock', 'yarn add -D'],
	['bun.lock', 'bun add -d'],
	['bun.lockb', 'bun add -d'],
	['package-lock.json', 'npm install -D'],
]);

/**
 * The command that adds dev dependencies with the package manager of the project
 * that holds `file_path`: the nearest lockfile above it decides, and npm without one.
 * @param {string} file_path
 */
export function add_dev_command(file_path) {
	for (let directory = path.dirname(file_path); ; directory = path.dirname(directory)) {
		for (const [lockfile, command] of PACKAGE_MANAGERS) {
			if (fs.existsSync(path.join(directory, lockfile))) return command;
		}
		if (path.dirname(directory) === directory) return 'npm install -D';
	}
}

/**
 * `tsrx.format.enable`, which defaults to true. A client that does not answer
 * `workspace/configuration` leaves formatting on.
 * @param {Connection} connection
 * @param {string} uri
 */
async function formatting_enabled(connection, uri) {
	try {
		const enabled = await connection.workspace.getConfiguration({
			scopeUri: uri,
			section: 'tsrx.format.enable',
		});
		return enabled !== false;
	} catch {
		return true;
	}
}
