/**
 * The built TSRX language server restarting over stdio after a package.json or
 * a lockfile changed, to load the TSRX compiler again. A client that set the
 * `restartNotification` initialization option (the VS Code extension) gets a
 * `tsrx/restartServer` notification and restarts the server itself. For any
 * other client, the server exits by itself and the client starts it again.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create_native_workspace } from '../../content-mapper/tests/fixture-utils.js';
import { NativeLspClient } from '../../content-mapper/tests/lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// CI builds before testing; locally: `pnpm --filter @tsrx/language-server build`.
const server_path = fileURLToPath(new URL('../dist/language-server.js', import.meta.url));

const APP = `export function App() @{
	<p>{'hello'}</p>
}
`;

/** @type {Array<() => Promise<void>>} */
const cleanups = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * A workspace with `App.tsrx` and a package.json, served on the plugin backend,
 * once the server watches the workspace files.
 * @param {Record<string, unknown>} initializationOptions
 */
async function session(initializationOptions) {
	if (!fs.existsSync(server_path)) {
		throw new Error(`Built language server not found at ${server_path}.`);
	}
	const workspace = create_native_workspace(
		{ 'App.tsrx': APP, 'package.json': '{ "name": "restart-test", "private": true }' },
		{ dependencies: [] },
	);
	const client = new NativeLspClient(workspace.dir, {
		command: process.execPath,
		args: [server_path, '--stdio', '--typescript-backend=plugin'],
	});
	cleanups.push(async () => {
		// A server that exited never answers `shutdown`.
		await Promise.race([client.exited, client.shutdown()]);
		workspace.cleanup();
	});
	await client.initialize({ initializationOptions });
	client.open('App.tsrx', APP);
	const deadline = Date.now() + 30_000;
	while (
		!client.registrations.some(
			(registration) =>
				registration.method === 'workspace/didChangeWatchedFiles' &&
				registration.registerOptions.watchers.some(
					(/** @type {{ globPattern: string }} */ watcher) =>
						watcher.globPattern === '**/pnpm-lock.yaml',
				),
		)
	) {
		if (Date.now() > deadline) throw new Error('The server never watched the workspace files.');
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	return client;
}

describe('TSRX language server: restart after package state changed', () => {
	it('asks a client that restarts it, once, and keeps serving until the client stops it', async () => {
		const client = await session({ restartNotification: true });
		const restart = client.wait_for_notification('tsrx/restartServer');
		client.watched_files_changed([['package.json', 'changed']]);
		await restart;

		// More package changes before the client restarts it: no second request,
		// and the server does not exit by itself meanwhile.
		const again = client.wait_for_notification('tsrx/restartServer', undefined, 1000);
		client.watched_files_changed([['pnpm-lock.yaml', 'changed']]);
		await expect(again).rejects.toThrow(/Timed out/);
		const symbols = await client.request('textDocument/documentSymbol', {
			textDocument: { uri: client.uri('App.tsrx') },
		});
		expect(symbols.map((/** @type {{ name: string }} */ symbol) => symbol.name)).toContain('App');

		// The client's restart: `shutdown`, then `exit`.
		await client.request('shutdown');
		client.notify('exit');
		expect(await client.exited).toBe(0);
	});

	it('exits by itself for other clients', async () => {
		const client = await session({});
		client.watched_files_changed([['package.json', 'changed']]);
		expect(await client.exited).toBe(0);
	});
});
