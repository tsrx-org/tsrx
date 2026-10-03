// Types only: Volar's server and the LSP types it re-exports from vscode-languageserver.
/** @import { Connection, DocumentOnTypeFormattingParams, InitializeParams, LanguageServer, ServerCapabilities, TextEdit } from '@volar/language-server' */

import { URI } from 'vscode-uri';
import { is_tsrx_document } from './utils.js';

/**
 * The on-type formatting the server offers: closing tags on `>`, and nothing else.
 * @type {NonNullable<ServerCapabilities['documentOnTypeFormattingProvider']>}
 */
export const CLOSING_TAGS_ON_TYPE = { firstTriggerCharacter: '>' };

/**
 * Whether the client gets its closing tags through `textDocument/onTypeFormatting`.
 * A client that closes tags another way sets the `closeTagsOnType` initialization
 * option to `false`: the VS Code extension, where VS Code's TypeScript closes them,
 * or the extension asks for them with Volar's `volar/client/autoInsert` request.
 * @param {InitializeParams} params
 */
export function closes_tags_on_type(params) {
	return params.initializationOptions?.closeTagsOnType !== false;
}

/**
 * Close tags in every editor: answer `textDocument/onTypeFormatting` for `>` with
 * an edit that inserts the closing tag at the cursor. Only the VS Code extension
 * sends Volar's `volar/client/autoInsert` request. This handler asks the same
 * plugin (`provideAutoInsertSnippet` in `autoInsertPlugin.js`) and drops the
 * snippet's `$0`. No Volar service plugin offers on-type formatting
 * (`stripFormatting` in `servicePlugins.js`), so Volar registers no handler that
 * would replace this one.
 *
 * A text edit cannot place the cursor. Editors that leave the cursor before text
 * inserted at the cursor (Zed 1.17 and newer, Neovim in Insert mode) keep it
 * between the tags. `tsrx.autoClosingTags.enabled: false` turns it off.
 * @param {Connection} connection
 * @param {LanguageServer} server
 */
export function register_closing_tags(connection, server) {
	connection.onDocumentOnTypeFormatting(
		/**
		 * @param {DocumentOnTypeFormattingParams} params
		 * @returns {Promise<TextEdit[] | null>}
		 */
		async (params, token) => {
			if (params.ch !== '>' || !is_tsrx_document(params.textDocument.uri)) return null;
			const uri = URI.parse(params.textDocument.uri);
			const document = server.documents.get(uri);
			if (!document) return null;
			const offset = document.offsetAt(params.position);
			if (document.getText().charAt(offset - 1) !== '>') return null;
			if (!(await closing_tags_enabled(connection, params.textDocument.uri))) return null;

			const language_service = await server.project.getLanguageService(uri);
			const snippet = await language_service.getAutoInsertSnippet(
				uri,
				params.position,
				{ rangeOffset: offset - 1, rangeLength: 0, text: '>' },
				token,
			);
			if (token.isCancellationRequested || !snippet?.startsWith('$0')) return null;
			return [
				{ range: { start: params.position, end: params.position }, newText: snippet.slice(2) },
			];
		},
	);
}

/**
 * `tsrx.autoClosingTags.enabled`, which defaults to true. A client that does not
 * answer `workspace/configuration` leaves closing tags on.
 * @param {Connection} connection
 * @param {string} uri
 */
async function closing_tags_enabled(connection, uri) {
	try {
		const enabled = await connection.workspace.getConfiguration({
			scopeUri: uri,
			section: 'tsrx.autoClosingTags.enabled',
		});
		return enabled !== false;
	} catch {
		return true;
	}
}
