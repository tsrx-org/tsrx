#!/usr/bin/env node

/**
 * Local editor tests for the Zed extension, not part of `pnpm test` or CI. Each scenario
 * starts a separate Zed instance (its own user data directory, with a copy of the
 * installed TSRX extension) on a temporary project whose package.json declares
 * `@tsrx/language-server`, so the extension starts the project's server. That server is
 * this repository's, packed and installed outside the repository as an editor installs
 * it (so no `typescript` next to it), behind a recorder that writes every message
 * between Zed and the server to a file. The test checks which TypeScript the server runs
 * and the warning it sends when it finds none it can run (#1008). Zed shows its window
 * while a scenario runs.
 *
 *   pnpm --filter @tsrx/zed-plugin test:editor [-- --keep]
 *
 * Zed: TSRX_ZED_CLI, else /Applications/Zed.app/Contents/MacOS/cli. The extension:
 * TSRX_ZED_EXTENSION, else the one installed in Zed. Packing the server and installing
 * its dependencies needs network access.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	create_test_project,
	install_packed_language_server,
} from '../../../scripts/editor-test-language-server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const keep = process.argv.includes('--keep');

const zed_cli = process.env.TSRX_ZED_CLI ?? '/Applications/Zed.app/Contents/MacOS/cli';
const extension_dir =
	process.env.TSRX_ZED_EXTENSION ??
	path.join(os.homedir(), 'Library/Application Support/Zed/extensions/installed/tsrx');
if (!fs.existsSync(zed_cli) || !fs.existsSync(extension_dir)) {
	console.log(`Zed or its TSRX extension not found (${zed_cli}, ${extension_dir}). Skipping.`);
	process.exit(0);
}

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-zed-')));
console.log(`Zed: ${zed_cli}`);
console.log(`TSRX extension: ${extension_dir}`);
console.log(`Temporary directory: ${root}\n`);

const { bin: server_bin, typescript_next_to_server } = install_packed_language_server(root);

/**
 * @typedef {{
 * 	name: string,
 * 	description: string,
 * 	typescript?: 'repository' | { version: string },
 * 	expect: { typescript_features: boolean, warning?: RegExp },
 * }} Scenario
 */

/** @type {Scenario[]} */
const SCENARIOS = [
	{
		name: 'no-typescript',
		description: 'no typescript in the project or next to the server',
		expect: {
			typescript_features: false,
			warning: /found no typescript package in .*, its parent folders, or next to the server/,
		},
	},
	{
		name: 'typescript-7',
		description: 'TypeScript 7 in the project',
		typescript: { version: '7.1.0-dev.20261002.1' },
		expect: {
			typescript_features: false,
			warning: /found typescript 7\.1\.0-dev\.20261002\.1 at .*node_modules\/typescript/,
		},
	},
	{
		name: 'typescript-5.9',
		description: 'TypeScript 5.9 in the project',
		typescript: 'repository',
		expect: { typescript_features: true },
	},
];

/**
 * @param {Scenario} scenario
 * @returns {Promise<Array<{ from: 'zed' | 'server', message: any }>>}
 */
async function run_scenario(scenario) {
	const project = path.join(root, scenario.name);
	const record = path.join(root, `messages-${scenario.name}.jsonl`);
	const launcher = path.join(root, `launcher-${scenario.name}.sh`);
	fs.writeFileSync(
		launcher,
		`#!/bin/sh\nTSRX_ZED_SERVER='${server_bin}' TSRX_ZED_RECORD='${record}' exec '${process.execPath}' '${path.join(here, 'recorder.mjs')}' "$@"\n`,
	);
	fs.chmodSync(launcher, 0o755);
	const { file } = create_test_project({
		dir: project,
		server_bin: launcher,
		typescript: scenario.typescript,
		// The extension starts the project's server when package.json names it.
		package_json: {
			name: `tsrx-zed-${scenario.name}`,
			private: true,
			devDependencies: { '@tsrx/language-server': '*' },
		},
	});

	// A Zed of its own: user data (settings, extensions, logs) in the temporary directory.
	const user_data = path.join(root, `zed-${scenario.name}`);
	fs.cpSync(extension_dir, path.join(user_data, 'extensions', 'installed', 'tsrx'), {
		recursive: true,
		filter: (source) => !source.includes(`${path.sep}target${path.sep}`),
	});
	// Trust every folder in this instance only, so Zed asks nothing about the project.
	fs.mkdirSync(path.join(user_data, 'config'), { recursive: true });
	fs.writeFileSync(
		path.join(user_data, 'config', 'settings.json'),
		JSON.stringify({ session: { trust_all_worktrees: true } }, null, 2),
	);
	const log = fs.openSync(path.join(root, `zed-${scenario.name}.log`), 'w');
	const zed = spawn(zed_cli, ['--user-data-dir', user_data, '--foreground', project, file], {
		stdio: ['ignore', log, log],
	});

	/** @returns {Array<{ from: 'zed' | 'server', message: any }>} */
	const messages = () =>
		fs.existsSync(record)
			? fs
					.readFileSync(record, 'utf8')
					.split('\n')
					.filter(Boolean)
					.map((line) => JSON.parse(line))
			: [];
	// Until the server answered `initialize`, then a few seconds for the warning.
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline && !messages().some((entry) => entry.message.result?.capabilities)) {
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	await new Promise((resolve) => setTimeout(resolve, 4000));

	zed.kill('SIGTERM');
	spawnSync('pkill', ['-f', '--', user_data]);
	await new Promise((resolve) => setTimeout(resolve, 1000));
	spawnSync('pkill', ['-9', '-f', '--', user_data]);
	fs.closeSync(log);
	return messages();
}

/**
 * @param {Scenario} scenario
 * @param {Array<{ from: 'zed' | 'server', message: any }>} messages
 * @returns {string | undefined}
 */
function problem(scenario, messages) {
	const initialize = messages.find((entry) => entry.message.method === 'initialize');
	if (!initialize) return 'Zed did not start the project server';
	const result = messages.find((entry) => entry.message.result?.capabilities);
	if (!result) return 'the server did not answer initialize';
	const typescript_features = 'signatureHelpProvider' in result.message.result.capabilities;
	if (typescript_features !== scenario.expect.typescript_features) {
		return `expected TypeScript features ${scenario.expect.typescript_features}, got ${typescript_features}`;
	}
	const warnings = messages
		.filter((entry) => entry.from === 'server' && entry.message.method === 'window/showMessage')
		.map((entry) => entry.message.params.message);
	const { warning } = scenario.expect;
	if (!warning) {
		return warnings.length === 0
			? undefined
			: `expected no warning, got ${JSON.stringify(warnings)}`;
	}
	return warnings.length === 1 && warning.test(warnings[0])
		? undefined
		: `expected one warning matching ${warning}, the server sent ${JSON.stringify(warnings)}`;
}

console.log(
	`typescript next to the installed server: ${typescript_next_to_server ? 'yes (unexpected)' : 'none'}`,
);
let failures = typescript_next_to_server ? 1 : 0;
for (const scenario of SCENARIOS) {
	process.stdout.write(`▶ ${scenario.name}: ${scenario.description} … `);
	const messages = await run_scenario(scenario);
	const failed = problem(scenario, messages);
	if (failed) failures++;
	console.log(failed ? `FAIL (${failed})` : 'ok');
	const initialize = messages.find((entry) => entry.message.method === 'initialize');
	if (initialize) {
		const params = initialize.message.params;
		console.log(
			`  Zed sent: workspace folders ${JSON.stringify(params.workspaceFolders?.map((folder) => folder.uri))}, initialization options ${JSON.stringify(params.initializationOptions)}`,
		);
	}
}

spawnSync('pkill', ['-9', '-f', '--', root]);
if (!keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Kept ${root}`);
process.exit(failures === 0 ? 0 : 1);
