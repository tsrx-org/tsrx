/**
 * The built TSRX language server on the classic backend reports TypeScript's
 * diagnostics for `.tsrx` files with the module format a `.ts` file at the same
 * path would have under NodeNext: ESM in a `"type": "module"` package, CommonJS
 * in a `"type": "commonjs"` one (#163).
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

/** The TypeScript 5.9 this package develops against. */
const tsdk = fs.realpathSync(
	path.join(repo_root, 'packages/language-server/node_modules/typescript/lib'),
);

/**
 * A `.tsrx` file without imports, so TypeScript resolves nothing for it, with a
 * type error that shows the project has loaded.
 */
const META = "export const url = import.meta.url;\nexport const count: number = 'one';\n";

/** @type {Array<() => Promise<void>>} */
const cleanups = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * The sorted diagnostic codes the server reports for `Meta.tsrx` in a package
 * whose `package.json` has `type`.
 * @param {string} type
 */
async function meta_diagnostic_codes(type) {
	if (!fs.existsSync(server_path)) {
		throw new Error(`Built language server not found at ${server_path}.`);
	}
	const workspace = create_native_workspace(
		{
			'package.json': JSON.stringify({ type }),
			'tsconfig.json': JSON.stringify({
				tsrx: { compiler: '@tsrx/react' },
				compilerOptions: {
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
					jsx: 'preserve',
					noEmit: true,
					target: 'ESNext',
					types: [],
				},
				include: ['*.tsrx'],
			}),
			'Meta.tsrx': META,
		},
		{ dependencies: ['@tsrx/react'] },
	);
	const client = new NativeLspClient(workspace.dir, {
		command: process.execPath,
		args: [server_path, '--stdio'],
	});
	cleanups.push(async () => {
		await Promise.race([client.exited, client.shutdown()]);
		workspace.cleanup();
	});
	await client.initialize({ initializationOptions: { typescript: { tsdk } } });
	client.open('Meta.tsrx', META);
	// The first pull can come before the project has loaded.
	const deadline = Date.now() + 20_000;
	let diagnostics = await client.diagnostics('Meta.tsrx');
	while (diagnostics.length === 0 && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 200));
		diagnostics = await client.diagnostics('Meta.tsrx');
	}
	return diagnostics
		.map((/** @type {{ code: number }} */ diagnostic) => diagnostic.code)
		.sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
}

describe('TSRX language server: module format of .tsrx files under NodeNext', () => {
	it('treats them as ESM in a "type": "module" package', async () => {
		expect(await meta_diagnostic_codes('module')).toEqual([2322]);
	});

	it('keeps them CommonJS in a "type": "commonjs" package', async () => {
		expect(await meta_diagnostic_codes('commonjs')).toEqual([1470, 2322]);
	});
});
