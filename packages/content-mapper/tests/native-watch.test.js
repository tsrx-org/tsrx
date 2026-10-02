import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TS_ERRORS } from '@tsrx/core/diagnostics';
import {
	consumer_fixture_files,
	create_native_workspace,
	native_tsc_path,
	typescript_mapper_code,
} from './fixture-utils.js';

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ output: string }} log
 * @param {(output: string) => boolean} predicate
 * @param {number} [timeout]
 */
function wait_for(child, log, predicate, timeout = 30_000) {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		const check = () => {
			if (predicate(log.output)) {
				child.stdout?.off('data', check);
				resolve(undefined);
			} else if (Date.now() - started > timeout) {
				child.stdout?.off('data', check);
				reject(new Error(`Timed out waiting for watch output. Output so far:\n${log.output}`));
			}
		};
		child.stdout?.on('data', check);
		const timer = setInterval(() => {
			check();
			if (predicate(log.output) || Date.now() - started > timeout) clearInterval(timer);
		}, 200);
	});
}

/**
 * The compilations watch mode finished after `offset` in its output, each
 * ending with "Watching for file changes". One edit can start more than one.
 * @param {string} output
 * @param {number} offset
 */
function watch_passes_since(output, offset) {
	return output.slice(offset).split('Watching for file changes').slice(0, -1);
}

describe('native tsc --watch', () => {
	// From 7.1.0-dev.20260811.1 until 7.1.0-dev.20260923.1 (the minimum the
	// mapper supports), watch mode never recompiled after an edit on macOS
	// (microsoft/TypeScript#64351, with or without a content mapper).
	it('runs the mapper for the initial compilation and again after each edit', async () => {
		const files = consumer_fixture_files();
		const panel = files['Panel.tsrx'];
		files['Panel.tsrx'] = panel.replace('{label}', '{{{label}');
		const created = create_native_workspace(files);
		cleanups.push(created.cleanup);

		const child = spawn(
			native_tsc_path(),
			[
				'--runExternalCode',
				'-p',
				'tsconfig.native.json',
				'--watch',
				'--noEmit',
				'--pretty',
				'false',
			],
			{ cwd: created.dir, stdio: ['ignore', 'pipe', 'pipe'] },
		);
		cleanups.push(() => child.kill());
		const log = { output: '' };
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			log.output += chunk;
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk) => {
			log.output += chunk;
		});

		await wait_for(child, log, (output) => /Watching for file changes/.test(output));
		expect(log.output).toContain('Starting compilation in watch mode');
		// The mapper's compile error surfaces in the first watch pass. Its export
		// stub types Panel's exports as `any`, so main.ts's cross-file error is
		// intentionally absent while Panel.tsrx is broken.
		const { code } = TS_ERRORS.UNEXPECTED_TOKEN;
		expect(log.output).toMatch(
			new RegExp(
				`Panel\\.tsrx\\(\\d+,\\d+\\): error TSRX${typescript_mapper_code(code)}: Unexpected token`,
			),
		);
		expect(log.output).not.toContain('TS2322');
		expect(log.output).toMatch(/Found 1 error\. Watching for file changes/);

		// Fixing the .tsrx file brings back main.ts's cross-file error. A write
		// empties the file before it fills it, and watch mode can compile in
		// between ("Panel.tsrx is not a module"), so check the pass that saw the
		// new text.
		let offset = log.output.length;
		fs.writeFileSync(path.join(created.dir, 'Panel.tsrx'), panel);
		const cross_file_error = /main\.ts\(7,47\): error TS2322:/;
		await wait_for(child, log, (output) =>
			watch_passes_since(output, offset).some((pass) => cross_file_error.test(pass)),
		);
		const fixed = watch_passes_since(log.output, offset).find((pass) =>
			cross_file_error.test(pass),
		);
		expect(fixed).not.toMatch(/error TSRX/);
		expect(fixed).toContain('Found 1 error.');

		// Fixing the .ts importer leaves no errors.
		offset = log.output.length;
		const main = path.join(created.dir, 'main.ts');
		fs.writeFileSync(main, fs.readFileSync(main, 'utf8').replace("count: 'one'", 'count: 2'));
		await wait_for(child, log, (output) =>
			watch_passes_since(output, offset).some((pass) => pass.includes('Found 0 errors.')),
		);

		child.kill();
	}, 60_000);
});
