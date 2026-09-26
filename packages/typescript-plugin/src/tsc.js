#!/usr/bin/env node

import fs from 'node:fs';
import node_module, { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getTsrxLanguagePlugin, loggedErrorDiagnostic } from './language.js';

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

// tsc exits through sys.exit → process.exit. A fatal .tsrx compile failure is
// mirrored to stderr via logTSRXErrors but produces no TypeScript diagnostic —
// the file compiles to a stub — so a clean tsc run must not exit 0 over it.
// Error-severity only: warning diagnostics are allowed to print without
// failing the gate.
const realExit = process.exit;
process.exit = (code) =>
	realExit(loggedErrorDiagnostic() && (code === undefined || code === 0) ? 1 : code);

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

// Reached only when tsc returns without exiting (e.g. watch mode teardown).
if (loggedErrorDiagnostic()) {
	process.exitCode = 1;
}
