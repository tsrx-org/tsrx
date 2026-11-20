import vscode from 'vscode';

/**
 * Between TSRX's commands and VS Code's tsserver (TypeScript 5.9 or 6), which they reach
 * through `typescript.tsserverRequest`: which documents tsserver has, and the locations it
 * answers with.
 */

/**
 * The schemes of the documents VS Code's TypeScript never gives tsserver (`disabledSchemes`
 * in its `fileSchemes.ts`), such as a `git:` tab.
 */
const UNSERVED_SCHEMES = new Set([
	'git',
	'vsls',
	'github',
	'azurerepos',
	'chat-editing-text-model',
]);

/**
 * Whether VS Code's TypeScript gives tsserver this document. For one it doesn't,
 * `typescript.tsserverRequest` sends no `file` and tsserver fails with "Cannot read
 * properties of undefined"; VS Code's own commands say "Unknown file type." there.
 * @param {import('vscode').Uri} uri
 * @returns {boolean}
 */
export function served_by_tsserver(uri) {
	return !UNSERVED_SCHEMES.has(uri.scheme);
}

/** What VS Code names a missing authority in the file names it gives tsserver. */
const NUL_AUTHORITY = 'ts-nul-authority';

/**
 * The URI of a file tsserver names. VS Code gives tsserver a document that is not on disk,
 * such as an unsaved one, as `^/<scheme>/<authority>/<path>`, so such a name is matched
 * against the open documents, as VS Code's own commands do.
 * @param {string} file
 * @returns {import('vscode').Uri}
 */
export function tsserver_uri(file) {
	if (!file.startsWith('^/')) return vscode.Uri.file(file);
	const open = vscode.workspace.textDocuments.find(({ uri }) => in_memory_name(uri) === file);
	if (open) return open.uri;
	const [, scheme, authority, path] = /^\^\/([^/]+)\/([^/]*)\/(.+)$/.exec(file) ?? [];
	if (!scheme) return vscode.Uri.file(file);
	return vscode.Uri.parse(`${scheme}://${authority === NUL_AUTHORITY ? '' : authority}/${path}`);
}

/**
 * The name VS Code gives tsserver for a document that is not on disk.
 * @param {import('vscode').Uri} uri
 */
function in_memory_name(uri) {
	const path = uri.path.startsWith('/') ? uri.path : `/${uri.path}`;
	const fragment = uri.fragment ? `#${uri.fragment}` : '';
	return `^/${uri.scheme}/${uri.authority || NUL_AUTHORITY}${path}${fragment}`;
}

/**
 * A span tsserver answers with, as a VS Code location.
 * @param {TsserverSpan} span
 * @returns {import('vscode').Location}
 */
export function tsserver_location(span) {
	return new vscode.Location(
		tsserver_uri(span.file),
		new vscode.Range(
			span.start.line - 1,
			span.start.offset - 1,
			span.end.line - 1,
			span.end.offset - 1,
		),
	);
}

/** @typedef {{ line: number, offset: number }} TsserverPosition One-based, as tsserver counts. */
/** @typedef {{ file: string, start: TsserverPosition, end: TsserverPosition }} TsserverSpan */
