import vscode from 'vscode';
import { activateAutoInsertion } from '@volar/vscode';
import { USE_TSGO_SETTINGS, typescript_7_on } from './typescript-7.js';

/**
 * Whether TypeScript 7 closes JSX tags in `.tsrx` files well enough to leave them to it.
 * The TypeScript 7 extension asks `tsc --lsp` for them since 1.0.2
 * (microsoft/TypeScript#64564), but `tsc --lsp` answers only in a file the content mapper
 * covers and can parse, and not in every position of one. Until that changes, TSRX keeps
 * its own closing tags (tsrx-org/tsrx#989).
 */
const TYPESCRIPT_7_CLOSES_TAGS = false;

/**
 * Close JSX tags in `.tsrx` files while TypeScript 7 is on, whichever compiler serves them.
 * VS Code's own TypeScript closes them through `@tsrx/typescript-plugin`
 * (`js/ts.autoClosingTags.enabled`), so the TSRX language server's closing tags
 * (`tsrx.autoClosingTags.enabled`) run only while TypeScript 7 is on: with both, two
 * providers would race to insert the same closing tag. From
 * extension 1.0.2 that race exists on TypeScript 7 too, wherever `tsc --lsp` answers.
 * @param {import('vscode').ExtensionContext} context
 * @param {import('vscode-languageclient/node').BaseLanguageClient} client
 */
export function activate_closing_tags(context, client) {
	/** @type {import('vscode').Disposable | undefined} */
	let auto_insertion;

	function update() {
		const wanted = !TYPESCRIPT_7_CLOSES_TAGS && typescript_7_on();
		if (wanted && !auto_insertion) {
			auto_insertion = activateAutoInsertion([{ language: 'tsrx' }], client);
		} else if (!wanted && auto_insertion) {
			auto_insertion.dispose();
			auto_insertion = undefined;
		}
	}

	update();
	context.subscriptions.push(
		{ dispose: () => auto_insertion?.dispose() },
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (USE_TSGO_SETTINGS.some((setting) => event.affectsConfiguration(setting))) {
				update();
			}
		}),
		vscode.extensions.onDidChange(update),
	);
}
