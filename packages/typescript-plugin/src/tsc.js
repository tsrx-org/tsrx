#!/usr/bin/env node

import fs from 'node:fs';
import node_module, { createRequire } from 'node:module';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { strip_platform_globals_from_declaration_output } from './declaration-output.js';
import { TSRX_EXTENSIONS, getTsrxLanguagePlugin } from './language.js';
import { with_tsrx_module_format_on_host } from './module-format.js';
import { run_native_tsc } from './native-tsc.js';
import { report_tsrx_diagnostics } from './tsc-diagnostics.js';
import {
	is_native_typescript_package,
	unsupported_typescript_message,
} from './typescript-version.js';

const require = createRequire(import.meta.url);
// `typescript` is an optional peer dependency: npm and pnpm do not install one.
/** @type {string} */
let typescript_package_json_path;
try {
	typescript_package_json_path = require.resolve('typescript/package.json');
} catch {
	console.error(
		'tsrx-tsc needs the typescript package installed next to @tsrx/typescript-plugin. In the project: npm install -D typescript, or pnpm add -D typescript.',
	);
	process.exit(1);
}
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

// Volar decorates each program tsc creates so that its diagnostics point at the
// `.tsrx` source. Print the TSRX compile errors and warnings of the program's
// `.tsrx` files then, before tsc reports its own diagnostics.
const decorate_program_module =
	/** @type {typeof import('@volar/typescript/lib/node/decorateProgram.js')} */ (
		require('@volar/typescript/lib/node/decorateProgram.js')
	);
const decorate_program = decorate_program_module.decorateProgram;
let printed_tsrx_error = false;
decorate_program_module.decorateProgram = (language, program) => {
	decorate_program(language, program);
	// tsc writes to standard output, with the platform's line break.
	const printed_error = report_tsrx_diagnostics(language, program, TSRX_EXTENSIONS, (line) =>
		process.stdout.write(`${line}${os.EOL}`),
	);
	printed_tsrx_error ||= printed_error;
};

// TypeScript knows nothing of the TSRX errors, so a run where they are the only
// errors would exit 0. Exit 2 then, as tsc does when it reports an error and
// emits; a nonzero code of tsc's own stays. A warning doesn't change the exit
// code. tsc exits through `sys.exit`, which calls `process.exit`; in watch mode
// it doesn't exit.
const exit = process.exit;
process.exit = (code) =>
	exit.call(process, printed_tsrx_error && (code === undefined || code === 0) ? 2 : code);

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
			if (create_program_options.host) {
				with_tsrx_module_format_on_host(ts, create_program_options.host, compiler_options);
			}
			strip_platform_globals_from_declaration_output(ts);
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
