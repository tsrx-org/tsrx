#!/usr/bin/env node

/**
 * Run the native TypeScript 7 compiler with the given arguments (`pnpm typecheck`).
 *
 * The regular path comes first: when the `typescript` package resolved from the
 * repository root is TypeScript 7, its own launcher (`bin/tsc`) runs, exactly as
 * `npx tsc` would. Today that package must stay on the 5.x line because the
 * tooling packages need its JavaScript API, so the fallback runs the binary of
 * the platform package pinned as a root optional dependency
 * (`@typescript/typescript-<os>-<arch>`, the same package the launcher resolves
 * its binary from). Once the root `typescript` is 7.x, the pin and this fallback
 * can go.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** @returns {{ command: string, args: string[], label: string }} */
function resolve_compiler() {
	/** @type {string | undefined} */
	let typescript_package_json;
	try {
		typescript_package_json = require.resolve('typescript/package.json');
	} catch {
		// No typescript package at the root: fall through to the platform package.
	}
	if (typescript_package_json) {
		/** @type {{ version: string, bin?: Record<string, string> }} */
		const pkg = require(typescript_package_json);
		const major = Number.parseInt(pkg.version, 10);
		if (major >= 7 && pkg.bin?.tsc) {
			return {
				command: process.execPath,
				args: [path.join(path.dirname(typescript_package_json), pkg.bin.tsc)],
				label: `typescript@${pkg.version} (launcher)`,
			};
		}
	}

	const platform_package = `@typescript/typescript-${process.platform}-${process.arch}`;
	/** @type {string} */
	let platform_package_json;
	try {
		platform_package_json = require.resolve(`${platform_package}/package.json`);
	} catch {
		console.error(
			`native-tsc: the root typescript package is not TypeScript 7 and ${platform_package} is not installed. Run pnpm install with optional dependencies enabled, or check that TypeScript 7 supports this platform.`,
		);
		process.exit(1);
	}
	const binary = path.join(
		path.dirname(platform_package_json),
		'lib',
		process.platform === 'win32' ? 'tsc.exe' : 'tsc',
	);
	return {
		command: binary,
		args: [],
		label: `${platform_package}@${require(platform_package_json).version} (pinned binary)`,
	};
}

const compiler = resolve_compiler();
if (process.env.TSRX_NATIVE_TSC_DEBUG) {
	console.error(`native-tsc: ${compiler.label}`);
}
const result = spawnSync(compiler.command, [...compiler.args, ...process.argv.slice(2)], {
	stdio: 'inherit',
});
if (result.error) {
	console.error(`native-tsc: ${result.error.message}`);
	process.exit(1);
}
process.exit(result.status ?? 1);
