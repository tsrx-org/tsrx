/**
 * Find File References for `.tsrx` files on TypeScript 5.9 and 6.
 *
 * VS Code's own command (`typescript.findAllFileReferences`) only runs in TypeScript
 * and JavaScript files, and its `typescript.tsserverRequest` command forwards only a
 * few requests plus any request whose name starts with `_`. So the TSRX extension
 * sends `FILE_REFERENCES_COMMAND`, which runs the session's own `fileReferences`.
 * Volar's proxy maps the references in `.tsrx` importers back to their source.
 */

export const FILE_REFERENCES_COMMAND = '_tsrx:fileReferences';

/** @type {WeakSet<object>} */
const sessions = new WeakSet();

/**
 * Register `FILE_REFERENCES_COMMAND` once per session.
 * @param {import('typescript').server.Session | undefined} session
 */
export function register_file_references_command(session) {
	const get_file_references = /** @type {any} */ (session)?.getFileReferences;
	if (!session || sessions.has(session) || typeof get_file_references !== 'function') return;
	sessions.add(session);
	try {
		session.addProtocolHandler(FILE_REFERENCES_COMMAND, (request) => ({
			// `true`: the protocol's line and offset, as tsserver's own `fileReferences` answers.
			response: get_file_references.call(session, request.arguments, true),
			responseRequired: true,
		}));
	} catch {
		// Another copy of this plugin (a tsconfig `plugins` entry beside VS Code's
		// global plugin) registered it first.
	}
}
