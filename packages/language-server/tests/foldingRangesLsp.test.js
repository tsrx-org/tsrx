/**
 * The built TSRX language server answering `textDocument/foldingRange` over stdio for
 * `.tsrx` files (#1267), the way VS Code (beside its TypeScript, plugin backend) and other
 * editors ask for folds.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_native_workspace, repo_root } from '../../content-mapper/tests/fixture-utils.js';
import { NativeLspClient } from '../../content-mapper/tests/lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// CI builds before testing; locally: `pnpm --filter @tsrx/language-server build`.
const server_path = fileURLToPath(new URL('../dist/language-server.js', import.meta.url));

const APP = `// #region components
function label(n: number) {
	return \`\${n} items\`;
}

export function App(props: { items: string[] }) @{
	<div class="list">
		<style>
			.list {
				color: red;
			}
		</style>
		@if (props.items.length > 0) {
			<ul>
				<li>{label(props.items.length)}</li>
			</ul>
		} @else {
			<p>{'none'}</p>
		}
	</div>
}
// #endregion
`;

/** @type {Array<() => Promise<void>>} */
const cleanups = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * The server on `backend` with `App.tsrx` open. The `classic` backend gets the TypeScript 5
 * the server is built with in the workspace, so it hosts TypeScript (the repository root's
 * TypeScript 7 would leave it on the slim plugin set).
 * @param {'classic' | 'native' | 'plugin'} backend
 */
async function session(backend) {
	if (!fs.existsSync(server_path)) {
		throw new Error(`Built language server not found at ${server_path}.`);
	}
	const workspace = create_native_workspace(
		{
			'App.tsrx': APP,
			'package.json': '{ "name": "folding-test", "private": true }',
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
					? [
							/** @type {[string, string]} */ ([
								'typescript',
								path.join(repo_root, 'packages/language-server'),
							]),
						]
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
		textDocumentCapabilities: { foldingRange: { lineFoldingOnly: true } },
	});
	client.open('App.tsrx', APP);
	/** @type {Array<{ startLine: number, endLine: number, kind?: string }>} */
	const ranges = await client.request('textDocument/foldingRange', {
		textDocument: { uri: client.uri('App.tsrx') },
	});
	return { capabilities: initialized.capabilities, ranges };
}

describe('TSRX language server: folding ranges', () => {
	it.each(/** @type {const} */ (['classic', 'native', 'plugin']))(
		'folds the source and the CSS in `<style>` on the %s backend',
		async (backend) => {
			const { capabilities, ranges } = await session(backend);
			expect(capabilities.foldingRangeProvider).toBe(true);
			const lines = APP.split('\n');
			// Lines numbered from 1, as an editor shows them.
			expect(
				ranges.map(
					({ startLine, endLine, kind }) =>
						`${startLine + 1}-${endLine + 1}${kind ? ` ${kind}` : ''} | ${lines[startLine].trim()}`,
				),
			).toEqual([
				'1-22 region | // #region components',
				'2-3 | function label(n: number) {',
				'6-20 | export function App(props: { items: string[] }) @{',
				'7-19 | <div class="list">',
				'8-11 | <style>',
				// The CSS rule, from the CSS service on the embedded stylesheet.
				'9-10 | .list {',
				'13-16 | @if (props.items.length > 0) {',
				'14-15 | <ul>',
				'17-18 | } @else {',
			]);
		},
	);
});
