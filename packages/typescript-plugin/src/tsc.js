#!/usr/bin/env node

import fs from 'node:fs';
import node_module, { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getTsrxLanguagePlugin } from './language.js';

const require = createRequire(import.meta.url);
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
