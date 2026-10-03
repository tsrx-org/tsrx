/**
 * The built TSRX language server started as other editors start it (`--stdio`,
 * no backend chosen, so the classic backend), in a project whose workspace folder
 * is `app/` and whose `node_modules` is in the parent folder:
 *
 * - with TypeScript 7 there, it starts without TypeScript features and shows one
 *   warning that names the version and where it was found;
 * - with the `typescript.tsdk` initialization option (the `lib` folder or the
 *   package folder), it runs that TypeScript;
 * - when the folder in that option does not contain TypeScript, it warns and
 *   runs the TypeScript it finds without it;
 * - with TypeScript 5.9 there, it runs it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
	repo_root,
} from '../../content-mapper/tests/fixture-utils.js';
import { NativeLspClient } from '../../content-mapper/tests/lsp-client.js';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

// CI builds before testing; locally: `pnpm --filter @tsrx/language-server build`.
const server_path = fileURLToPath(new URL('../dist/language-server.js', import.meta.url));

/** The TypeScript 5.9 this package develops against, and its `lib` folder. */
const typescript_dir = fs.realpathSync(
	path.join(repo_root, 'packages/language-server/node_modules/typescript'),
);

/** The version of that TypeScript. */
const typescript_version = JSON.parse(
	fs.readFileSync(path.join(typescript_dir, 'package.json'), 'utf8'),
).version;

/** The TypeScript 7 nightly npm installs today for `^7.1.0-dev...` (only its manifest). */
const TYPESCRIPT_7 = JSON.stringify({ name: 'typescript', version: '7.1.0-dev.20261002.1' });

/** @type {Array<() => Promise<void>>} */
const cleanups = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * The consumer fixture in `app/`, its compiler dependencies and `extra_files` in the
 * parent folder, served with `app/` as the workspace folder.
 * @param {{
 * 	extra_files?: Record<string, string>,
 * 	dependencies?: Array<string | [string, string]>,
 * 	initializationOptions?: Record<string, unknown>,
 * }} options
 */
async function session({ extra_files = {}, dependencies = [], initializationOptions }) {
	if (!fs.existsSync(server_path)) {
		throw new Error(`Built language server not found at ${server_path}.`);
	}
	const files = Object.fromEntries(
		Object.entries(consumer_fixture_files()).map(([name, text]) => [`app/${name}`, text]),
	);
	const workspace = create_native_workspace(
		{ ...files, ...extra_files },
		{ dependencies: ['@tsrx/react', 'react', '@types/react', ...dependencies] },
	);
	const app = path.join(workspace.dir, 'app');
	const client = new NativeLspClient(app, {
		command: process.execPath,
		args: [server_path, '--stdio'],
	});
	cleanups.push(async () => {
		await Promise.race([client.exited, client.shutdown()]);
		workspace.cleanup();
	});
	// Listen before initializing: the warnings come right after `initialized`.
	// Every waiter sees every notification, so each one takes the warning at its
	// own place in the order they arrive.
	/** @type {unknown[]} */
	const shown = [];
	const [warning, second_warning] = [0, 1].map((place) => {
		const wait = client.wait_for_notification(
			'window/showMessage',
			(params) => {
				if (!shown.includes(params)) shown.push(params);
				return shown.indexOf(params) === place;
			},
			5000,
		);
		wait.catch(() => {});
		return wait;
	});
	const { capabilities } = await client.initialize({ initializationOptions });
	client.open('Panel.tsrx', files['app/Panel.tsrx']);
	return {
		client,
		capabilities,
		warning,
		second_warning,
		workspace_dir: fs.realpathSync(workspace.dir),
	};
}

/**
 * Whether the server serves TypeScript features itself (only the classic backend
 * with a TypeScript it runs advertises signature help).
 * @param {Record<string, unknown>} capabilities
 */
const serves_typescript = (capabilities) => 'signatureHelpProvider' in capabilities;

describe('TSRX language server: which typescript other editors get', () => {
	it('starts without TypeScript features and warns once when the project has TypeScript 7', async () => {
		const { client, capabilities, warning, workspace_dir } = await session({
			extra_files: { 'node_modules/typescript/package.json': TYPESCRIPT_7 },
		});
		expect(serves_typescript(capabilities)).toBe(false);
		const message = await warning;
		expect(message.type).toBe(2);
		expect(message.message).toContain(
			`The server found TypeScript 7.1.0-dev.20261002.1 in ${path.join(workspace_dir, 'node_modules', 'typescript')}.`,
		);

		// No second warning, and what needs no TypeScript still works.
		await expect(
			client.wait_for_notification('window/showMessage', undefined, 1000),
		).rejects.toThrow(/Timed out/);
		const symbols = await client.request('textDocument/documentSymbol', {
			textDocument: { uri: client.uri('Panel.tsrx') },
		});
		expect(symbols.length).toBeGreaterThan(0);
	});

	it('runs the typescript.tsdk TypeScript over the project one', async () => {
		const { capabilities, warning } = await session({
			extra_files: { 'node_modules/typescript/package.json': TYPESCRIPT_7 },
			initializationOptions: { typescript: { tsdk: path.join(typescript_dir, 'lib') } },
		});
		expect(serves_typescript(capabilities)).toBe(true);
		await expect(warning).rejects.toThrow(/Timed out/);
	});

	it('runs the typescript.tsdk TypeScript when the option names the package folder', async () => {
		const { capabilities, warning } = await session({
			extra_files: { 'node_modules/typescript/package.json': TYPESCRIPT_7 },
			initializationOptions: { typescript: { tsdk: typescript_dir } },
		});
		expect(serves_typescript(capabilities)).toBe(true);
		await expect(warning).rejects.toThrow(/Timed out/);
	});

	it("warns when the typescript.tsdk folder does not contain TypeScript, and runs the project's TypeScript", async () => {
		const tsdk = path.join(repo_root, 'no-such-folder/lib');
		const { capabilities, warning, second_warning } = await session({
			dependencies: [['typescript', path.join(repo_root, 'packages/language-server')]],
			initializationOptions: { typescript: { tsdk } },
		});
		expect(serves_typescript(capabilities)).toBe(true);
		const message = await warning;
		expect(message.type).toBe(2);
		expect(message.message).toBe(
			`The TSRX language server does not use the typescript.tsdk startup option. ` +
				`The folder in this option does not contain TypeScript: ${tsdk}. ` +
				`The server uses TypeScript ${typescript_version} from the project instead: ${typescript_dir}. ` +
				`Set this option to the lib folder of a TypeScript installation, for example /path/to/node_modules/typescript/lib.`,
		);
		await expect(second_warning).rejects.toThrow(/Timed out/);
	});

	it('warns about a typescript.tsdk folder that does not contain TypeScript, then about TypeScript 7', async () => {
		const tsdk = path.join(repo_root, 'no-such-folder/lib');
		const { capabilities, warning, second_warning } = await session({
			extra_files: { 'node_modules/typescript/package.json': TYPESCRIPT_7 },
			initializationOptions: { typescript: { tsdk } },
		});
		expect(serves_typescript(capabilities)).toBe(false);
		const first = await warning;
		expect(first.message).toContain(
			`The folder in this option does not contain TypeScript: ${tsdk}.`,
		);
		expect(first.message).not.toContain('The server uses');
		const second = await second_warning;
		expect(second.message).toContain('The server found TypeScript 7.1.0-dev.20261002.1 in ');
	});

	it("runs the project's TypeScript 5.9 from the parent folder", async () => {
		const { capabilities, warning } = await session({
			dependencies: [['typescript', path.join(repo_root, 'packages/language-server')]],
		});
		expect(serves_typescript(capabilities)).toBe(true);
		await expect(warning).rejects.toThrow(/Timed out/);
	});
});
