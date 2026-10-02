#!/usr/bin/env node

/**
 * Manual editor tests for the VS Code extension: each scenario in
 * `scenarios.js` starts a fresh, isolated VS Code instance (its own user data
 * and extensions directories, so your own VS Code and settings are never
 * touched), opens a copy of `fixtures/react`, and checks which TypeScript
 * serves its `.tsrx` file (hover, definition, and a type error typed into the
 * unsaved buffer) and, where one does, that `.ts` and `.tsrx` files import each
 * other. Run from the repository root after building the VSIX:
 *
 *   pnpm --filter @tsrx/vscode-plugin build-and-package
 *   pnpm --filter @tsrx/vscode-plugin test:editor [-- --scenario <name>] [--verbose] [--keep]
 *
 * Options: `--scenario <name>` (repeatable), `--list`, `--build` (runs
 * build-and-package first), `--vsix <path>`, `--verbose`, `--keep` (keep the
 * temporary directory), `--foreground` (show each instance; on macOS they
 * otherwise stay hidden, and a helper compiled with `swiftc` hides each one the
 * moment VS Code brings it to the front).
 * Environment: `TSRX_VSCODE_APP` (the VS Code executable) and `TSRX_VSCODE_CLI`
 * (its `code` command), which default to the macOS app. Installing the
 * TypeScript 7 extensions needs network access.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { SCENARIOS } from './scenarios.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const package_dir = path.dirname(here);
const repo_root = path.resolve(package_dir, '..', '..');

// `pnpm test:editor -- --flag` passes the `--` through.
const argv = process.argv.slice(2);
const { values: options } = parseArgs({
	args: argv[0] === '--' ? argv.slice(1) : argv,
	options: {
		scenario: { type: 'string', multiple: true },
		list: { type: 'boolean' },
		build: { type: 'boolean' },
		vsix: { type: 'string' },
		verbose: { type: 'boolean' },
		keep: { type: 'boolean' },
		foreground: { type: 'boolean' },
	},
});

if (options.list) {
	for (const scenario of SCENARIOS) {
		console.log(
			`${scenario.name.padEnd(30)} ${scenario.expect.padEnd(18)} ${scenario.description}`,
		);
	}
	process.exit(0);
}

const MAC_APP = '/Applications/Visual Studio Code.app';
const vscode_app =
	process.env.TSRX_VSCODE_APP ??
	(process.platform === 'darwin' ? `${MAC_APP}/Contents/MacOS/Code` : 'code');
const vscode_cli =
	process.env.TSRX_VSCODE_CLI ??
	(process.platform === 'darwin' ? `${MAC_APP}/Contents/Resources/app/bin/code` : 'code');
// On macOS, `open` can start the app hidden and in the background; that needs the
// `.app` bundle the executable is in.
const vscode_bundle =
	process.platform === 'darwin' && !options.foreground
		? /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(vscode_app)?.[1]
		: undefined;

const SCENARIO_TIMEOUT_MS = 240_000;
const HOVER_TIMEOUT_MS = 60_000;
const DIAGNOSTIC_TIMEOUT_MS = 30_000;
const AUTO_INSERT_WAIT_MS = 3000;
const ACTION_WAIT_MS = 5000;

/** @type {Record<string, string>} */
const EXTENSION_SOURCES = {
	ts7: 'TypeScriptTeam.native-preview',
	'ts7-nightly': 'TypeScriptTeam.vscode-typescript-nightly',
};

/**
 * The environment for VS Code without the variables of the VS Code (or
 * terminal) this script runs in: `ELECTRON_RUN_AS_NODE` makes the executable
 * run as Node and reject `--user-data-dir`.
 * @returns {NodeJS.ProcessEnv}
 */
function clean_env() {
	return Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !/^(ELECTRON|VSCODE)_/.test(key)),
	);
}

const selected = options.scenario?.length
	? options.scenario.map((name) => {
			const scenario = SCENARIOS.find((candidate) => candidate.name === name);
			if (!scenario) {
				console.error(`Unknown scenario "${name}". Use --list to see them.`);
				process.exit(1);
			}
			return scenario;
		})
	: SCENARIOS;

if (options.build) {
	const build = spawnSync('pnpm', ['run', 'build-and-package'], {
		cwd: package_dir,
		stdio: 'inherit',
	});
	if (build.status !== 0) process.exit(build.status ?? 1);
}

const vsix = path.resolve(options.vsix ?? path.join(package_dir, 'vscode-plugin.vsix'));
if (!fs.existsSync(vsix)) {
	console.error(
		`No VSIX at ${vsix}. Build it first: pnpm --filter @tsrx/vscode-plugin build-and-package (or pass --build).`,
	);
	process.exit(1);
}
for (const required of [vscode_app, vscode_cli]) {
	if (required.includes(path.sep) && !fs.existsSync(required)) {
		console.error(`VS Code not found at ${required}; set TSRX_VSCODE_APP / TSRX_VSCODE_CLI.`);
		process.exit(1);
	}
}
const mapper_server = path.join(repo_root, 'packages', 'content-mapper', 'dist', 'server.js');
if (!fs.existsSync(mapper_server)) {
	console.error(`${mapper_server} is missing; build-and-package builds it.`);
	process.exit(1);
}

// VS Code's IPC socket lives in the user data directory and its path must stay
// short (about 100 characters on macOS), so the whole run lives in one short
// temporary directory.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-vsc-'));
if (path.join(root, `u${SCENARIOS.length}`, '1.140-main.sock').length > 103) {
	console.error(
		`The temporary directory ${root} is too long for VS Code's socket; set TMPDIR to a shorter path.`,
	);
	process.exit(1);
}

/**
 * On macOS, a helper that hides each test instance the moment it takes the front
 * (`hide-test-windows.swift`). Without `swiftc`, the runner polls instead
 * (`hide_if_in_front`), which leaves the instance in front for up to a few seconds.
 */
const hider = vscode_bundle ? start_hider(root) : undefined;
if (vscode_bundle && !hider) {
	console.warn('swiftc not found: test windows may flash in front until they are hidden.');
}

/**
 * @param {string} marker
 * @returns {import('node:child_process').ChildProcess | undefined}
 */
function start_hider(marker) {
	const binary = path.join(marker, 'hide-test-windows');
	const compiled = spawnSync(
		'swiftc',
		['-O', '-o', binary, path.join(here, 'hide-test-windows.swift')],
		{ stdio: 'ignore' },
	);
	if (compiled.status !== 0) return undefined;
	const child = spawn(binary, [marker], { stdio: 'ignore' });
	process.once('exit', () => child.kill());
	return child;
}

/** @type {Map<string, { dir: string, installed: string[] }>} */
const extension_dirs = new Map();

/**
 * One extensions directory per extension combination, installed once per run.
 * @param {string[]} names
 */
function extensions_for(names) {
	const key = names.join('+');
	const cached = extension_dirs.get(key);
	if (cached) return cached;
	const dir = path.join(root, `ext-${extension_dirs.size + 1}`);
	fs.mkdirSync(dir, { recursive: true });
	for (const name of names) {
		const source = name === 'tsrx' ? vsix : EXTENSION_SOURCES[name];
		const install = spawnSync(
			vscode_cli,
			['--extensions-dir', dir, '--install-extension', source],
			{
				env: clean_env(),
				encoding: 'utf8',
			},
		);
		if (install.status !== 0 || !/successfully installed/i.test(install.stdout + install.stderr)) {
			throw new Error(`Could not install ${source}:\n${install.stdout}${install.stderr}`);
		}
	}
	const installed = fs
		.readdirSync(dir)
		.filter((entry) => !entry.endsWith('.json') && !entry.startsWith('.'))
		.sort();
	const entry = { dir, installed };
	extension_dirs.set(key, entry);
	return entry;
}

/**
 * @param {string} from The package whose dependency this is.
 * @param {string} name
 */
function installed_package_dir(from, name) {
	const require = createRequire(path.join(from, 'package.json'));
	return fs.realpathSync(path.dirname(require.resolve(`${name}/package.json`)));
}

const tsrx_react = path.join(repo_root, 'packages', 'tsrx-react');
const project_typescript = installed_package_dir(repo_root, 'typescript');
// TypeScript 5.9 or 6, as a project on the classic backend installs it.
const classic_typescript = installed_package_dir(
	path.join(repo_root, 'packages', 'typescript-plugin'),
	'typescript',
);
const project_typescript_version = JSON.parse(
	fs.readFileSync(path.join(project_typescript, 'package.json'), 'utf8'),
).version;

/**
 * A fresh copy of the fixture with its dependencies linked from the workspace.
 * @param {import('./scenarios.js').Scenario} scenario
 */
function create_project(scenario) {
	const project = path.join(root, `project-${scenario.name}`);
	fs.cpSync(path.join(here, 'fixtures', 'react'), project, { recursive: true });
	/** @type {Record<string, string>} */
	const links = {
		'@tsrx/react': tsrx_react,
		'@tsrx/content-mapper': path.join(repo_root, 'packages', 'content-mapper'),
		react: installed_package_dir(tsrx_react, 'react'),
		'@types/react': installed_package_dir(tsrx_react, '@types/react'),
		// The TSRX language server formats with the project's Prettier and plugin.
		prettier: installed_package_dir(repo_root, 'prettier'),
		'@tsrx/prettier-plugin': path.join(repo_root, 'packages', 'prettier-plugin'),
	};
	if (scenario.projectTypeScript) {
		links.typescript =
			scenario.projectTypeScript === 'classic' ? classic_typescript : project_typescript;
	}
	for (const [name, target] of Object.entries(links)) {
		const link = path.join(project, 'node_modules', name);
		fs.mkdirSync(path.dirname(link), { recursive: true });
		fs.symlinkSync(target, link, 'junction');
	}
	return project;
}

/**
 * @param {import('./scenarios.js').Scenario} scenario
 * @param {number} index
 * @returns {Promise<{ result: Record<string, any> | undefined, installed: string[], log: string }>}
 */
async function run_scenario(scenario, index) {
	const project = create_project(scenario);
	const extensions = extensions_for(scenario.extensions);
	// Short on purpose: VS Code's IPC socket is created in it.
	const user_data = path.join(root, `u${index + 1}`);
	fs.mkdirSync(path.join(user_data, 'User'), { recursive: true });
	// VS Code's own TypeScript logs which tsserver it starts and the plugins it loads.
	const settings = JSON.parse(
		JSON.stringify({ 'js/ts.tsserver.log': 'normal', ...scenario.settings }).replaceAll(
			'${project}',
			project,
		),
	);
	fs.writeFileSync(
		path.join(user_data, 'User', 'settings.json'),
		JSON.stringify(settings, null, 2),
	);

	const harness = path.join(root, `harness-${scenario.name}`);
	fs.cpSync(path.join(here, 'harness'), harness, { recursive: true });
	const out = path.join(root, `result-${scenario.name}.json`);
	fs.writeFileSync(
		path.join(harness, 'config.json'),
		JSON.stringify({
			scenario: scenario.name,
			file: path.join(project, 'src', 'App.tsrx'),
			out,
			hoverTimeoutMs: HOVER_TIMEOUT_MS,
			diagnosticTimeoutMs: DIAGNOSTIC_TIMEOUT_MS,
			autoInsertWaitMs: AUTO_INSERT_WAIT_MS,
			action: scenario.action,
			command: scenario.command,
			packageChange: scenario.packageChange,
			actionWaitMs: ACTION_WAIT_MS,
		}),
	);

	const log = path.join(root, `vscode-${scenario.name}.log`);
	const vscode_args = [
		'--user-data-dir',
		user_data,
		'--extensions-dir',
		extensions.dir,
		'--disable-workspace-trust',
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-telemetry',
		`--extensionDevelopmentPath=${harness}`,
		`--extensionTestsPath=${path.join(harness, 'checks.cjs')}`,
		project,
	];
	const log_fd = fs.openSync(log, 'w');
	// `open -n -g -j -W`: a new instance, not brought to the foreground, hidden, and
	// waited for. `open` hands the app its own environment, so it gets the cleaned
	// one, and `PATH` explicitly: the content mapper runs `node`.
	const child = vscode_bundle
		? spawn(
				'open',
				[
					'-n',
					'-g',
					'-j',
					'-W',
					'--stdout',
					log,
					'--stderr',
					log,
					'--env',
					`PATH=${process.env.PATH ?? ''}`,
					'-a',
					vscode_bundle,
					'--args',
					...vscode_args,
				],
				{ env: clean_env(), stdio: 'ignore' },
			)
		: spawn(vscode_app, vscode_args, { env: clean_env(), stdio: ['ignore', log_fd, log_fd] });
	const exited = new Promise((resolve) => child.once('exit', resolve));
	const deadline = Date.now() + SCENARIO_TIMEOUT_MS;
	while (!fs.existsSync(out) && Date.now() < deadline && child.exitCode === null) {
		if (vscode_bundle && !hider) hide_if_in_front(user_data);
		await new Promise((resolve) => setTimeout(resolve, vscode_bundle ? 100 : 500));
	}
	// VS Code closes itself once the checks finish; make sure it is gone either way.
	if (child.exitCode === null) {
		stop_instance(child, user_data, 'SIGTERM');
		const stopped = await Promise.race([
			exited.then(() => true),
			new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
		]);
		if (!stopped) stop_instance(child, user_data, 'SIGKILL');
	}
	await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
	fs.closeSync(log_fd);
	const result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : undefined;
	if (result) {
		result.tsserver = tsserver_logs(user_data);
		result.serverOutput = server_output(user_data);
	}
	return { result, installed: extensions.installed, log };
}

/**
 * What the TSRX Language Server output says in an instance, from the file VS Code
 * keeps for each output channel: the server's own lines, and the language client's
 * (`[Error - 1:12:18 PM] ...`), without the plugins' debug lines.
 * @param {string} user_data
 * @returns {string[]}
 */
function server_output(user_data) {
	const logs = path.join(user_data, 'logs');
	if (!fs.existsSync(logs)) return [];
	return fs
		.readdirSync(logs, { recursive: true, encoding: 'utf8' })
		.filter((file) => /^\d+-TSRX Language Server\.log$/.test(path.basename(file)))
		.flatMap((file) => fs.readFileSync(path.join(logs, file), 'utf8').split('\n'))
		.filter((line) => /^\[(TSRX Language Server\]|Info |Warn |Error )/.test(line));
}

/**
 * The tsservers VS Code's own TypeScript started in an instance: the version each
 * one logged, and whether it loaded `@tsrx/typescript-plugin`.
 * @param {string} user_data
 */
function tsserver_logs(user_data) {
	const logs = path.join(user_data, 'logs');
	if (!fs.existsSync(logs)) return [];
	return fs
		.readdirSync(logs, { recursive: true, encoding: 'utf8' })
		.filter((file) => path.basename(file) === 'tsserver.log')
		.map((file) => {
			const text = fs.readFileSync(path.join(logs, file), 'utf8');
			return {
				version: /Version: (\S+)/.exec(text)?.[1],
				plugin: /Plugin validation succeeded/.test(text)
					? 'loaded'
					: /@tsrx\/typescript-plugin/.test(text)
						? 'not loaded'
						: 'not requested',
			};
		});
}

/**
 * Where TypeScript serves the `.tsrx` file, imports between `.ts` and `.tsrx` files
 * resolve both ways, with no `plugins` entry in the fixture's tsconfig.json.
 * @param {Record<string, any>} result
 */
function imports_problem(result) {
	if (!/label: string/.test(result.tsImportHover ?? '')) {
		return `expected App.tsrx to resolve ./label, got the hover ${JSON.stringify(result.tsImportHover)}`;
	}
	if (!/function App/.test(result.tsrxImport?.hover ?? '')) {
		return `expected main.ts to resolve ./App.tsrx, got the hover ${JSON.stringify(result.tsrxImport?.hover)} and the diagnostics ${JSON.stringify(result.tsrxImport?.diagnostics)}`;
	}
	return undefined;
}

/**
 * TSRX's Go to Source Definition on `useState`: React's JavaScript where VS Code's
 * own TypeScript serves the file, the `.d.ts` definition on TypeScript 7 (which has
 * no way to run it in `.tsrx` files yet, microsoft/TypeScript#64576).
 * @param {import('./scenarios.js').Scenario} scenario
 * @param {Record<string, any>} result
 */
function source_definition_problem(scenario, result) {
	const expected =
		scenario.expect === 'vscode-typescript'
			? /^react\/cjs\/react\.\w+\.js$/
			: /^@types\/react\/index\.d\.ts$/;
	return expected.test(result.sourceDefinition ?? '')
		? undefined
		: `expected Go to Source Definition to open ${expected}, got ${JSON.stringify(result.sourceDefinition)}`;
}

/**
 * Linked editing (both tag names of <button>, from TypeScript) and TSRX's commands
 * that come from TypeScript or the file system, where TypeScript serves the file:
 * Go to Project Configuration opens the project's tsconfig.json, and
 * Remove Unused Imports removes the two unused imports on TypeScript 7. VS Code's own
 * TypeScript (5.9 or 6) returns no edits for them yet (tsrx-org/tsrx#994).
 * @param {import('./scenarios.js').Scenario} scenario
 * @param {Record<string, any>} result
 */
function command_problem(scenario, result) {
	if (JSON.stringify(result.linkedEditing) !== JSON.stringify(['button', 'button'])) {
		return `expected linked editing on <button> to cover both tag names, got ${JSON.stringify(result.linkedEditing)}`;
	}
	if (result.projectConfig !== 'tsconfig.json') {
		return `expected Go to Project Configuration to open tsconfig.json, got ${JSON.stringify(result.projectConfig)}`;
	}
	const expected =
		scenario.expect === 'typescript-7'
			? ["import { useState } from 'react';"]
			: [
					"import { useState } from 'react';",
					"import { label } from './label';",
					"import { App } from './App.tsrx';",
				];
	return JSON.stringify(result.removeUnusedImports) === JSON.stringify(expected)
		? undefined
		: `expected Remove Unused Imports to leave ${JSON.stringify(expected)}, got ${JSON.stringify(result.removeUnusedImports)}`;
}

/** What the harness's messy `Format.tsrx` must become. */
const FORMATTED = `import { useState } from "react";

export function Format() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{count}</button>
}
`;

/** What Format Selection on its `<button>` line must make of it: that line only. */
const FORMATTED_RANGE = `import { useState } from "react";

export function Format() @{
      const [count,setCount]=useState(0);
  <button onClick={() => setCount(count + 1)}>{count}</button>
}
`;

/**
 * In every setup, the TSRX language server formats `.tsrx` files with the project's
 * Prettier and `@tsrx/prettier-plugin` (no Prettier extension installed), and it is the
 * default `.tsrx` formatter.
 * @param {Record<string, any>} result
 */
function formatting_problem(result) {
	if (result.formatting?.defaultFormatter !== 'TSRX.tsrx-vscode-plugin') {
		return `expected TSRX to be the default .tsrx formatter, got ${JSON.stringify(result.formatting?.defaultFormatter)}`;
	}
	if (result.formatting?.text !== FORMATTED) {
		return `expected Format Document to give ${JSON.stringify(FORMATTED)}, got ${JSON.stringify(result.formatting?.text)}`;
	}
	return result.formatting?.rangeText === FORMATTED_RANGE
		? undefined
		: `expected Format Selection to give ${JSON.stringify(FORMATTED_RANGE)}, got ${JSON.stringify(result.formatting?.rangeText)}`;
}

/**
 * The fallback for `hide-test-windows.swift`: VS Code brings its first window to the
 * front even when `open` starts it hidden in the background. When the instance is in
 * front, hide it: macOS then gives the front back to the app that had it. Hiding
 * another app needs no permission, unlike activating one.
 * @param {string} user_data
 */
function hide_if_in_front(user_data) {
	const asn = spawnSync('lsappinfo', ['front'], { encoding: 'utf8' }).stdout.trim();
	if (!asn) return;
	const front = spawnSync('lsappinfo', ['info', '-only', 'pid', asn], { encoding: 'utf8' }).stdout;
	const pid = /"pid"=(\d+)/.exec(front)?.[1];
	if (!pid) return;
	const command = spawnSync('ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' }).stdout;
	if (!command.includes(`--user-data-dir ${user_data} `)) return;
	spawnSync('osascript', [
		'-l',
		'JavaScript',
		'-e',
		`ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${pid}).hide`,
	]);
}

/**
 * Stop a VS Code instance. Started through `open`, the child is `open` itself, so
 * the instance's processes are found by the user data directory only it uses.
 * @param {import('node:child_process').ChildProcess} child
 * @param {string} user_data
 * @param {NodeJS.Signals} signal
 */
function stop_instance(child, user_data, signal) {
	if (vscode_bundle) {
		spawnSync('pkill', [
			`-${signal.replace(/^SIG/, '')}`,
			'-f',
			'--',
			`--user-data-dir ${user_data}( |$)`,
		]);
	}
	child.kill(signal);
}

/**
 * @param {Record<string, any> | undefined} result
 * @returns {string}
 */
function served_by(result) {
	if (!result) return 'no result';
	if (result.error) return 'error';
	const type_error = (result.diagnostics ?? []).find(
		(/** @type {{ code: string }} */ diagnostic) => diagnostic.code === '2322',
	);
	const hover = /number/.test(result.hover ?? '');
	if (!hover && !type_error && (result.definitions ?? []).length === 0) return 'nothing';
	if (!hover || !type_error) return 'partial';
	if (type_error.source === 'ts') return 'typescript-7';
	if (type_error.source === 'ts-plugin') return 'vscode-typescript';
	return `unknown (${type_error.source})`;
}

console.log(`VSIX: ${vsix}`);
console.log(`Project TypeScript (projectTypeScript scenarios): ${project_typescript_version}`);
console.log(`Temporary directory: ${root}\n`);

let failures = 0;
/** @type {Array<Record<string, string>>} */
const rows = [];
for (const scenario of selected) {
	process.stdout.write(`▶ ${scenario.name}: ${scenario.description} … `);
	const { result, installed, log } = await run_scenario(scenario, selected.indexOf(scenario));
	const observed = served_by(result);
	const closing_tag = result?.closingTag ?? '';
	const status = result?.typescriptStatus?.kind ?? 'none';
	const notices =
		(result?.notices ?? []).map((/** @type {{ id: string }} */ notice) => notice.id).join(', ') ||
		'none';
	const imports = scenario.expect === 'nothing' ? undefined : imports_problem(result ?? {});
	const source_definition =
		scenario.expect === 'nothing' ? undefined : source_definition_problem(scenario, result ?? {});
	const unsaved = result?.unsavedDocuments?.length
		? `expected no unsaved documents at the end (VS Code would ask to save them and come to the front), got ${JSON.stringify(result.unsavedDocuments)}`
		: undefined;
	const commands =
		scenario.expect === 'nothing' ? undefined : command_problem(scenario, result ?? {});
	const feature =
		imports ?? source_definition ?? formatting_problem(result ?? {}) ?? commands ?? unsaved;
	const problem =
		observed !== scenario.expect
			? `expected ${scenario.expect}, got ${observed}`
			: feature
				? feature
				: scenario.closingTag !== undefined && closing_tag !== scenario.closingTag
					? `expected ${JSON.stringify(scenario.closingTag)} after typing <b>, got ${JSON.stringify(closing_tag)}`
					: status !== scenario.typescript
						? `expected the TypeScript status ${scenario.typescript}, got ${status}`
						: notices !== (scenario.notice ?? 'none')
							? `expected the notices ${scenario.notice ?? 'none'}, got ${notices}`
							: scenario.check?.(result ?? {});
	if (problem) failures++;
	console.log(problem ? `FAIL (${problem})` : 'ok');
	rows.push({
		scenario: scenario.name,
		expected: scenario.expect,
		observed,
		imports: scenario.expect === 'nothing' ? '-' : imports ? 'FAIL' : 'ok',
		'source definition': result?.sourceDefinition?.split('/').pop() ?? '-',
		formatting: formatting_problem(result ?? {}) ? 'FAIL' : 'ok',
		'after typing <b>': closing_tag,
		'TypeScript status': [status, result?.typescriptStatus?.version].filter(Boolean).join(' '),
		notices,
		result: problem ? 'FAIL' : 'ok',
	});
	if (problem || options.verbose) {
		console.log(`  extensions: ${installed.join(', ')}`);
		console.log(
			`  ${JSON.stringify(result ?? { error: `no result; VS Code log: ${log}` }, null, 2).replaceAll('\n', '\n  ')}`,
		);
	}
	if (!problem && scenario.gap) console.log(`  gap: ${scenario.gap}`);
}

console.log('');
console.table(rows);
hider?.kill();
// An instance can still be writing into its data directory while it exits.
spawnSync('pkill', ['-f', '--', root]);
if (!options.keep) {
	fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
} else console.log(`Kept ${root}`);
process.exit(failures === 0 ? 0 : 1);
