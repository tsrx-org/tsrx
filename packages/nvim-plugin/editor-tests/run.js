#!/usr/bin/env node

/**
 * Local editor tests for the Neovim plugin, not part of `pnpm test` or CI. Each scenario
 * starts headless Neovim in a temporary project with this repository's plugin and a
 * packed build of this repository's `@tsrx/language-server`, installed outside the
 * repository with npm as an editor installs it (so no `typescript` next to it). It opens
 * a `.tsrx` file in the project's `app/` folder and checks which TypeScript the server
 * runs, the warning Neovim shows when it finds none it can run (#1008), and, on Neovim
 * 0.12 or newer, that typing `<p>` in Insert mode closes the tag with the cursor between
 * the tags (#1004).
 *
 *   pnpm --filter @tsrx/nvim-plugin test:editor [-- --keep]
 *
 * Neovim: TSRX_NVIM, else `nvim` on PATH, else ~/.local/opt/nvim-*\/bin/nvim. Packing the
 * server and installing its dependencies needs network access.
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
const package_dir = path.dirname(here);
const keep = process.argv.includes('--keep');

/** @returns {string | undefined} */
function find_nvim() {
	if (process.env.TSRX_NVIM) return process.env.TSRX_NVIM;
	const which = spawnSync('which', ['nvim'], { encoding: 'utf8' });
	if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
	const opt = path.join(os.homedir(), '.local', 'opt');
	if (!fs.existsSync(opt)) return undefined;
	for (const entry of fs.readdirSync(opt)) {
		const candidate = path.join(opt, entry, 'bin', 'nvim');
		if (entry.startsWith('nvim') && fs.existsSync(candidate)) return candidate;
	}
	return undefined;
}

const nvim = find_nvim();
if (!nvim) {
	console.log('Neovim not found: set TSRX_NVIM or put nvim on PATH. Skipping.');
	process.exit(0);
}

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-nvim-')));
console.log(`Neovim: ${nvim}`);
console.log(`Temporary directory: ${root}\n`);

// This repository's server, packed and installed as an editor installs it.
const { bin: server_bin, typescript_next_to_server } = install_packed_language_server(root);

/**
 * @typedef {{
 * 	name: string,
 * 	description: string,
 * 	typescript?: 'repository' | { version: string },
 * 	no_root_marker?: boolean,
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
			warning:
				/The TSRX language server did not find TypeScript in .*, in the server installation, or in their parent folders\./,
		},
	},
	{
		name: 'typescript-7',
		description: 'TypeScript 7 in the parent folder of the open folder',
		typescript: { version: '7.1.0-dev.20261002.1' },
		expect: {
			typescript_features: false,
			warning:
				/The TSRX language server found TypeScript 7\.1\.0-dev\.20261002\.1 in .*node_modules\/typescript\./,
		},
	},
	{
		name: 'typescript-5.9',
		description: 'TypeScript 5.9 in the parent folder of the open folder',
		typescript: 'repository',
		expect: { typescript_features: true },
	},
	{
		name: 'typescript-5.9-no-root-marker',
		description:
			'TypeScript 5.9, no package.json or .git: Neovim names no folder, the server searches from where it started',
		typescript: 'repository',
		no_root_marker: true,
		expect: { typescript_features: true },
	},
];

/** @param {Scenario} scenario */
function create_project(scenario) {
	return create_test_project({
		dir: path.join(root, scenario.name),
		server_bin,
		typescript: scenario.typescript,
		// The plugin's root marker, so Neovim sends the project as the workspace folder.
		package_json: scenario.no_root_marker
			? undefined
			: { name: `tsrx-nvim-${scenario.name}`, private: true },
	}).app;
}

/**
 * @param {Scenario} scenario
 * @returns {Promise<Record<string, any> | undefined>}
 */
async function run_scenario(scenario) {
	const app = create_project(scenario);
	const out = path.join(root, `result-${scenario.name}.json`);
	const child = spawn(nvim, ['--headless', '--clean', '-u', path.join(here, 'check.lua')], {
		cwd: app,
		env: {
			...process.env,
			TSRX_NVIM_PLUGIN: package_dir,
			TSRX_NVIM_FILE: path.join(app, 'Panel.tsrx'),
			TSRX_NVIM_OUT: out,
		},
		stdio: 'ignore',
	});
	const exited = new Promise((resolve) => child.once('exit', resolve));
	const timer = setTimeout(() => child.kill('SIGKILL'), 90_000);
	await exited;
	clearTimeout(timer);
	return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : undefined;
}

/**
 * @param {Scenario} scenario
 * @param {Record<string, any> | undefined} result
 * @returns {string | undefined}
 */
function problem(scenario, result) {
	if (!result) return 'Neovim wrote no result';
	if (!result.attached) return 'the TSRX language server did not attach';
	if (result.typescript_features !== scenario.expect.typescript_features) {
		return `expected TypeScript features ${scenario.expect.typescript_features}, got ${result.typescript_features}`;
	}
	if (!(result.symbols > 0)) return 'expected document symbols';
	/** @type {{ line: string, column: number, mode: string } | undefined} */
	const closing_tag = result.closing_tag;
	if (
		result.on_type_formatting &&
		!(
			closing_tag &&
			closing_tag.line.endsWith('<p></p>') &&
			closing_tag.column === closing_tag.line.length - '</p>'.length + 1 &&
			closing_tag.mode === 'i'
		)
	) {
		return `expected <p></p> with the cursor between the tags, got ${JSON.stringify(closing_tag)}`;
	}
	/** @type {Array<{ message: string }>} */
	const sent = result.warnings_sent ?? [];
	/** @type {Array<{ message: string }>} */
	const shown = result.notifications ?? [];
	const { warning } = scenario.expect;
	if (!warning) {
		return sent.length === 0 ? undefined : `expected no warning, got ${JSON.stringify(sent)}`;
	}
	if (sent.length !== 1 || !warning.test(sent[0].message)) {
		return `expected one warning matching ${warning}, the server sent ${JSON.stringify(sent)}`;
	}
	if (!shown.some((notification) => warning.test(notification.message))) {
		return `expected Neovim to show the warning, it showed ${JSON.stringify(shown)}`;
	}
	return undefined;
}

console.log(
	`typescript next to the installed server: ${typescript_next_to_server ? 'yes (unexpected)' : 'none'}`,
);
let failures = typescript_next_to_server ? 1 : 0;
for (const scenario of SCENARIOS) {
	process.stdout.write(`▶ ${scenario.name}: ${scenario.description} … `);
	const result = await run_scenario(scenario);
	const failed = problem(scenario, result);
	if (failed) failures++;
	console.log(failed ? `FAIL (${failed})` : 'ok');
	if (failed) console.log(`  ${JSON.stringify(result, null, 2).replaceAll('\n', '\n  ')}`);
	else if (result?.notifications?.length) {
		console.log(`  Neovim showed: ${result.notifications[0].message.trim()}`);
	}
}

spawnSync('pkill', ['-f', '--', root]);
if (!keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Kept ${root}`);
process.exit(failures === 0 ? 0 : 1);
