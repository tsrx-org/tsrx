/**
 * The built TSRX language server closing tags over stdio, as editors other than
 * VS Code ask for them: `textDocument/onTypeFormatting` for `>` (#1004).
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_native_workspace, repo_root } from '../../content-mapper/tests/fixture-utils.js';
import { NativeLspClient } from '../../content-mapper/tests/lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// CI builds before testing; locally: `pnpm --filter @tsrx/language-server build`.
const server_path = fileURLToPath(new URL('../dist/language-server.js', import.meta.url));

const TYPED_DIV = `export function App() @{
	<div>
}
`;

const TYPED_DOLLAR = `function $Foo(props) @{
	<div>{props.children}</div>
}

export function App() @{
	<$Foo>
}
`;

const VOID_AND_CLOSED = `export function App() @{
	<>
		<br>
		<p></p>
	</>
}
`;

const CLOSED_ON_LATER_LINE = `export function App() @{
	<div class="card">
		<span />
	</div>
}
`;

/** @type {Array<() => Promise<void>>} */
const cleanups = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * The server on `backend` with `App.tsrx` open as `text`. The `classic` backend
 * gets the repository's TypeScript in the workspace.
 * @param {{
 * 	backend: 'classic' | 'native' | 'plugin',
 * 	text: string,
 * 	configuration?: Record<string, unknown>,
 * 	initializationOptions?: Record<string, unknown>,
 * }} options
 */
async function session({ backend, text, configuration, initializationOptions }) {
	if (!fs.existsSync(server_path)) {
		throw new Error(`Built language server not found at ${server_path}.`);
	}
	const workspace = create_native_workspace(
		{
			'App.tsrx': text,
			'package.json': '{ "name": "closing-tags-test", "private": true }',
			'tsconfig.json': JSON.stringify({
				compilerOptions: { jsx: 'react-jsx' },
				tsrx: { compiler: '@tsrx/react' },
			}),
		},
		{
			dependencies: [
				'@tsrx/react',
				'react',
				'@types/react',
				...(backend === 'classic'
					? [/** @type {[string, string]} */ (['typescript', repo_root])]
					: []),
			],
		},
	);
	const client = new NativeLspClient(workspace.dir, {
		command: process.execPath,
		args: [server_path, '--stdio', `--typescript-backend=${backend}`],
	});
	cleanups.push(async () => {
		await client.shutdown();
		workspace.cleanup();
	});
	const initialized = await client.initialize({
		configuration,
		initializationOptions,
		textDocumentCapabilities: { onTypeFormatting: { dynamicRegistration: false } },
	});
	client.open('App.tsrx', text);
	/**
	 * `textDocument/onTypeFormatting` for the `>` that ends `typed`, the first match in `text`.
	 * @param {string} typed
	 * @returns {Promise<Array<{ range: unknown, newText: string }> | null>}
	 */
	const type_gt = (typed) => {
		const offset = text.indexOf(typed) + typed.length;
		const lines = text.slice(0, offset).split('\n');
		const position = { line: lines.length - 1, character: lines[lines.length - 1].length };
		return client.request('textDocument/onTypeFormatting', {
			textDocument: { uri: client.uri('App.tsrx') },
			position,
			ch: '>',
			options: { tabSize: 2, insertSpaces: false },
		});
	};
	return { capabilities: initialized.capabilities, type_gt };
}

describe('TSRX language server: closing tags on `>`', () => {
	it.each(/** @type {const} */ (['classic', 'native', 'plugin']))(
		'inserts the closing tag at the cursor on the %s backend',
		async (backend) => {
			const { capabilities, type_gt } = await session({
				backend,
				text: TYPED_DIV,
			});
			expect(capabilities.documentOnTypeFormattingProvider).toEqual({ firstTriggerCharacter: '>' });
			expect(await type_gt('<div>')).toEqual([
				{
					range: { start: { line: 1, character: 6 }, end: { line: 1, character: 6 } },
					newText: '</div>',
				},
			]);
		},
	);

	it('inserts a tag name with `$` as written, without snippet escapes', async () => {
		const { type_gt } = await session({
			backend: 'plugin',
			text: TYPED_DOLLAR,
		});
		expect(await type_gt('<$Foo>')).toEqual([
			{
				range: { start: { line: 5, character: 7 }, end: { line: 5, character: 7 } },
				newText: '</$Foo>',
			},
		]);
	});

	it('inserts nothing after a void element or an already closed tag', async () => {
		const { type_gt } = await session({
			backend: 'plugin',
			text: VOID_AND_CLOSED,
		});
		expect(await type_gt('<br>')).toBeNull();
		expect(await type_gt('<p>')).toBeNull();
	});

	it('inserts nothing when the closing tag is on a later line', async () => {
		const { type_gt } = await session({
			backend: 'plugin',
			text: CLOSED_ON_LATER_LINE,
		});
		expect(await type_gt('<div class="card">')).toBeNull();
	});

	it('does nothing with tsrx.autoClosingTags.enabled off', async () => {
		const { capabilities, type_gt } = await session({
			backend: 'plugin',
			text: TYPED_DIV,
			configuration: { 'tsrx.autoClosingTags.enabled': false },
		});
		expect(capabilities.documentOnTypeFormattingProvider).toEqual({ firstTriggerCharacter: '>' });
		expect(await type_gt('<div>')).toBeNull();
	});

	it('offers no on-type formatting to a client that closes tags itself', async () => {
		// The VS Code extension: TypeScript, or Volar's `volar/client/autoInsert` request.
		const { capabilities } = await session({
			backend: 'plugin',
			text: TYPED_DIV,
			initializationOptions: { closeTagsOnType: false },
		});
		expect(capabilities.documentOnTypeFormattingProvider).toBeUndefined();
		expect(capabilities.experimental?.autoInsertionProvider).toEqual({
			triggerCharacters: ['>'],
			configurationSections: [['tsrx.autoClosingTags.enabled']],
		});
	});
});
