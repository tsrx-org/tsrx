#!/usr/bin/env node

/**
 * Local editor tests for the Sublime Text package, not part of `pnpm test` or CI. Sublime
 * Text on macOS has no option for a separate profile, so a run uses the profile in
 * ~/Library/Application Support/Sublime Text and puts back every file of it that the run
 * changes. Without the LSP package there, the run first installs Package Control and lets
 * it install LSP, which stay installed.
 *
 * The scenario builds this repository's package (`TSRX.sublime-package`, as `pnpm build`
 * does) and installs it, then opens a `.tsrx` file in a temporary project whose
 * `node_modules/.bin/tsrx-language-server` starts a packed build of this repository's
 * `@tsrx/language-server`. It checks that the TSRX syntax loads (#1021), that the TSRX
 * language server starts, that the expression in a dynamic closing tag such as
 * `</{props.as}>` is scoped as JavaScript, and that typing `<div>` closes the tag with the
 * caret between the tags (#1004; the run turns `format_on_type` on). Sublime Text shows
 * its window while the scenario runs; quit Sublime Text before the run. The run stops
 * only the Sublime Text it started.
 *
 *   pnpm --filter @tsrx/sublime-text-plugin test:editor [-- --keep]
 *
 * Sublime Text: TSRX_SUBLIME, else /Applications/Sublime Text.app/Contents/MacOS/sublime_text.
 * It must be the `sublime_text` executable, not `subl`: the run reads the console from
 * that process and stops it by its process ID.
 * Installing Package Control, LSP and the server's dependencies needs network access.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
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

const sublime =
	process.env.TSRX_SUBLIME ?? '/Applications/Sublime Text.app/Contents/MacOS/sublime_text';
if (!fs.existsSync(sublime)) {
	console.log(`Sublime Text not found (${sublime}). Skipping.`);
	process.exit(0);
}
/** Whether a Sublime Text runs, from any folder: its executable's exact process name. */
function sublime_runs() {
	const name = path.basename(sublime).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return spawnSync('pgrep', ['-x', name]).status === 0;
}
if (sublime_runs()) {
	console.log('Sublime Text is running. Quit it, then run the test again.');
	process.exit(1);
}

const profile = path.join(os.homedir(), 'Library/Application Support/Sublime Text');
const installed_packages = path.join(profile, 'Installed Packages');
const user = path.join(profile, 'Packages', 'User');
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tsrx-sublime-')));
console.log(`Sublime Text: ${sublime}`);
console.log(`Profile: ${profile}`);
console.log(`Temporary directory: ${root}\n`);

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stop a Sublime Text that this run started, and its plugin hosts, which are its child
 * processes. Its crash handler exits with it.
 * @param {import('node:child_process').ChildProcess} child
 */
async function stop_sublime(child) {
	const pid = /** @type {number} */ (child.pid);
	const children = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
		.stdout.split('\n')
		.filter(Boolean)
		.map(Number);
	const exited =
		child.exitCode !== null || child.signalCode !== null
			? Promise.resolve()
			: new Promise((resolve) => child.once('exit', resolve));
	for (const signal of /** @type {const} */ (['SIGTERM', 'SIGKILL'])) {
		for (const target of [pid, ...children]) {
			try {
				process.kill(target, signal);
			} catch {
				// Already gone.
			}
		}
		await Promise.race([exited, sleep(3000)]);
	}
	if (sublime_runs()) console.log(`A Sublime Text process is still running after the test.`);
}

/**
 * Install the LSP package with Package Control when the profile does not have it.
 * Package Control installs LSP and its libraries on its first start.
 */
async function ensure_lsp_package() {
	if (fs.existsSync(path.join(installed_packages, 'LSP.sublime-package'))) return;
	const settings = path.join(user, 'Package Control.sublime-settings');
	if (fs.existsSync(settings)) {
		console.log('The profile has Package Control but no LSP package. Install LSP with it first.');
		process.exit(1);
	}
	console.log('Installing Package Control and the LSP package …');
	fs.mkdirSync(installed_packages, { recursive: true });
	fs.mkdirSync(user, { recursive: true });
	const response = await fetch(
		'https://github.com/wbond/package_control/releases/latest/download/Package.Control.sublime-package',
	);
	if (!response.ok) throw new Error(`Downloading Package Control failed: ${response.status}`);
	fs.writeFileSync(
		path.join(installed_packages, 'Package Control.sublime-package'),
		Buffer.from(await response.arrayBuffer()),
	);
	fs.writeFileSync(
		settings,
		JSON.stringify({ installed_packages: ['LSP', 'Package Control'] }, null, '\t'),
	);
	const child = spawn(sublime, [], { stdio: 'ignore' });
	const deadline = Date.now() + 180_000;
	while (
		Date.now() < deadline &&
		!fs.existsSync(path.join(installed_packages, 'LSP.sublime-package'))
	) {
		await sleep(2000);
	}
	// Then the libraries LSP needs.
	await sleep(15_000);
	await stop_sublime(child);
	if (!fs.existsSync(path.join(installed_packages, 'LSP.sublime-package'))) {
		throw new Error('Package Control did not install the LSP package.');
	}
}

/**
 * Move `target` aside until `restore` runs. A missing target is removed again.
 * @param {string} target
 * @param {Array<() => void>} restores
 */
function set_aside(target, restores) {
	const backup = path.join(root, 'backup', String(restores.length));
	if (fs.existsSync(target)) {
		fs.mkdirSync(path.dirname(backup), { recursive: true });
		fs.cpSync(target, backup, { recursive: true });
		fs.rmSync(target, { recursive: true, force: true });
	}
	restores.push(() => {
		fs.rmSync(target, { recursive: true, force: true });
		if (fs.existsSync(backup)) fs.cpSync(backup, target, { recursive: true });
	});
}

await ensure_lsp_package();

// This repository's server, packed and installed as an editor installs it, behind a
// launcher that runs it with this Node.js: Sublime Text's PATH may not have one.
const { bin: server_bin } = install_packed_language_server(root);
const launcher = path.join(root, 'tsrx-language-server.sh');
fs.writeFileSync(launcher, `#!/bin/sh\nexec '${process.execPath}' '${server_bin}' "$@"\n`);
fs.chmodSync(launcher, 0o755);
const { app, file } = create_test_project({
	dir: path.join(root, 'project'),
	server_bin: launcher,
	typescript: 'repository',
	package_json: { name: 'tsrx-sublime-test', private: true },
});
// A dynamic closing tag, whose expression Sublime Text must scope as JavaScript.
const scope_file = path.join(app, 'Dynamic.tsrx');
fs.writeFileSync(
	scope_file,
	['export function Dynamic(props) @{', '\t<{props.as}>text</{props.as}>', '}', ''].join('\n'),
);
// `props` in the closing tag.
const scope_at = '</{props';
const scope_offset = 3;
// An empty line in a template, where the test types `<div>` (#1004).
const closing_file = path.join(app, 'Closing.tsrx');
fs.writeFileSync(closing_file, ['export function Closing() @{', '\t', '}', ''].join('\n'));

// This repository's package, built as `pnpm build` builds it.
execFileSync(process.execPath, ['scripts/build.js'], { cwd: package_dir, stdio: 'ignore' });

/** @type {Array<() => void>} */
const restores = [];
const out = path.join(root, 'result.json');
const console_log = path.join(root, 'console.log');
/** @type {Record<string, any> | undefined} */
let result;
try {
	set_aside(path.join(installed_packages, 'TSRX.sublime-package'), restores);
	// An unpacked `Packages/TSRX` would override the built package's files.
	set_aside(path.join(profile, 'Packages', 'TSRX'), restores);
	set_aside(path.join(user, 'tsrx_editor_test.py'), restores);
	set_aside(path.join(user, 'tsrx_editor_test.json'), restores);
	// The LSP package asks for on-type formatting, which closes tags, only with it on.
	set_aside(path.join(user, 'LSP.sublime-settings'), restores);
	fs.writeFileSync(
		path.join(user, 'LSP.sublime-settings'),
		JSON.stringify({ format_on_type: true }, null, '\t'),
	);
	fs.copyFileSync(
		path.join(package_dir, 'TSRX.sublime-package'),
		path.join(installed_packages, 'TSRX.sublime-package'),
	);
	fs.writeFileSync(
		path.join(user, 'tsrx_editor_test.json'),
		JSON.stringify({ file, out, scope_file, scope_at, scope_offset, closing_file }),
	);
	fs.copyFileSync(path.join(here, 'check.py'), path.join(user, 'tsrx_editor_test.py'));

	process.stdout.write(
		'▶ sublime-text: the TSRX syntax loads, the server starts, `</{expr}>` is JS, tags close … ',
	);
	// `--debug` writes the console to stdout, where syntax errors show.
	const log = fs.openSync(console_log, 'w');
	const child = spawn(sublime, ['--debug', app], { stdio: ['ignore', log, log] });
	const deadline = Date.now() + 120_000;
	while (Date.now() < deadline && !fs.existsSync(out)) await sleep(1000);
	await sleep(1000);
	await stop_sublime(child);
	fs.closeSync(log);
	result = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : undefined;
} finally {
	for (const restore of restores.reverse()) restore();
}

const console_lines = fs.readFileSync(console_log, 'utf8').split('\n');
const syntax_errors = console_lines.filter((line) => /error.*Packages\/TSRX\//i.test(line));

/** @returns {string | undefined} */
function problem() {
	if (syntax_errors.length > 0) return `Sublime Text did not load the syntax: ${syntax_errors[0]}`;
	if (!result) return 'Sublime Text wrote no result';
	if (result.syntax?.scope !== 'source.tsrx') {
		return `the file opened as ${result.syntax?.name ?? 'no syntax'}, not TSRX`;
	}
	if (!result.attached) return 'the TSRX language server did not start';
	const scope = String(result.scope ?? '');
	if (!/meta\.embedded\.expression\.js.*variable\.other\.object\.js/.test(scope)) {
		return `\`props\` in \`</{props.as}>\` has the scope ${JSON.stringify(result.scope)}`;
	}
	// The closing tag, with the caret between the tags: typing goes inside the element.
	const { after_gt, after_hi } = result.closing ?? {};
	if (after_gt?.line !== '\t<div></div>' || after_gt?.col !== '\t<div>'.length) {
		return `typing <div> gave ${JSON.stringify(after_gt)}, not "\\t<div></div>" with the caret after <div>`;
	}
	if (after_hi?.line !== '\t<div>hi</div>') {
		return `typing hi after <div> gave ${JSON.stringify(after_hi?.line)}`;
	}
	return undefined;
}

const failed = problem();
console.log(failed ? `FAIL (${failed})` : 'ok');
if (result) {
	console.log(`  Sublime Text ${result.sublime}, LSP ${result.lsp}, waited ${result.waited_ms} ms`);
	console.log(`  \`props\` in \`</{props.as}>\`: ${result.scope}`);
	console.log(`  after typing <div>: ${JSON.stringify(result.closing?.after_gt)}`);
}

if (!keep) fs.rmSync(root, { recursive: true, force: true });
else console.log(`Kept ${root}`);
process.exit(failed ? 1 : 0);
