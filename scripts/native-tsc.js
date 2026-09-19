#!/usr/bin/env node

/**
 * Run the native TypeScript 7 compiler with the given arguments.
 *
 * The root `typescript` stays on the 5.x line because the tooling packages need
 * its JavaScript API, so the `tsc` bin in `node_modules/.bin` is TypeScript 5.
 * The TypeScript 7 platform packages (`@typescript/typescript-<os>-<arch>`, the
 * same packages the `typescript@7` launcher resolves its binary from) are pinned
 * as root optional dependencies; this script locates the one for the current
 * platform and runs its `lib/tsc`. `pnpm typecheck` uses it.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const platform_package = `@typescript/typescript-${process.platform}-${process.arch}`;

/** @type {string} */
let platform_package_json;
try {
	platform_package_json = require.resolve(`${platform_package}/package.json`);
} catch {
	console.error(
		`native-tsc: ${platform_package} is not installed. Run pnpm install with optional dependencies enabled, or check that TypeScript 7 supports this platform.`,
	);
	process.exit(1);
}

const binary = path.join(
	path.dirname(platform_package_json),
	'lib',
	process.platform === 'win32' ? 'tsc.exe' : 'tsc',
);
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
	console.error(`native-tsc: ${result.error.message}`);
	process.exit(1);
}
process.exit(result.status ?? 1);
