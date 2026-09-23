#!/usr/bin/env node

import fs from 'node:fs';
import node_module, { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getTsrxLanguagePlugin } from './language.js';
import { run_native_tsc } from './native-tsc.js';
import {
	is_native_typescript_package,
	unsupported_typescript_message,
} from './typescript-version.js';

const require = createRequire(import.meta.url);
const typescript_package_json_path = require.resolve('typescript/package.json');
const typescript_version = /** @type {{ version: string }} */ (
	require(typescript_package_json_path)
).version;

// The TypeScript 7 package is a launcher for the native binary without
// `lib/tsc.js` or any other JavaScript entry. A build with the content-mapper
// protocol is run natively with `--runExternalCode`; an older one (the stable
// 7.0 releases, earlier nightlies) is explained instead of failing on the
// export map.
const unsupported_typescript = unsupported_typescript_message(typescript_version, 'tsrx-tsc');
if (unsupported_typescript) {
	console.error(unsupported_typescript);
	process.exit(1);
}
if (is_native_typescript_package(typescript_version)) {
	process.exit(run_native_tsc({ typescript_package_json_path, args: process.argv.slice(2) }));
}

const { runTsc } = /** @type {typeof import('@volar/typescript/lib/quickstart/runTsc.js')} */ (
	require('@volar/typescript/lib/quickstart/runTsc.js')
);
const tscPath = require.resolve('typescript/lib/tsc.js');

process.env.TSRX_TSC = 'true';

// Deno's CommonJS loader bypasses Volar's fs.readFileSync patch. Read the CLI
// through that patch explicitly, keeping Volar responsible for transforming it.
// Older Node versions without registerHooks retain Volar's default loader.
const tsc_url = pathToFileURL(tscPath).href;
const hook = node_module.registerHooks?.({
	load(url, context, nextLoad) {
		if (url !== tsc_url) {
			return nextLoad(url, context);
		}
		const source = fs.readFileSync(tscPath, 'utf8');
		// Only the CLI entry needs interception. Restore normal loading before
		// it resolves the consumer's compiler and its dependencies.
		hook?.deregister();
		return { format: 'commonjs', source, shortCircuit: true };
	},
});

try {
	runTsc(
		tscPath,
		{
			extraSupportedExtensions: ['.tsrx'],
			extraExtensionsToRemove: ['.tsrx'],
		},
		(ts, create_program_options) => {
			const compiler_options =
				/** @type {import('typescript').CompilerOptions & {
				 *  configFile?: import('typescript').TsConfigSourceFile,
				 *  configFilePath?: string,
				 * }} */ (create_program_options.options);
			return [
				getTsrxLanguagePlugin({
					ts,
					configFileName: compiler_options.configFile?.fileName ?? compiler_options.configFilePath,
					configHost: ts.sys,
				}),
			];
		},
	);
} finally {
	hook?.deregister();
}
