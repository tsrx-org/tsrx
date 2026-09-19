import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
	native_tsc_path,
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

describe('native tsc --watch', () => {
	// TypeScript 7.1.0-dev.20260918.1 never recompiles after a file edit on
	// macOS (microsoft/TypeScript#64351, a nightly regression since
	// 7.1.0-dev.20260811.1 that reproduces without a content mapper and with
	// every `--watchFile` strategy), so only the initial watch-mode compilation
	// is asserted here. Extend this test once a nightly reacts to edits.
	it('runs the mapper for the initial compilation in watch mode', async () => {
		const files = consumer_fixture_files();
		files['Panel.tsrx'] = files['Panel.tsrx'].replace('{label}', '{{{label}');
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
		expect(log.output).toMatch(/Panel\.tsrx\(\d+,\d+\): error tsrx1000: Unexpected token/);
		expect(log.output).not.toContain('TS2322');
		expect(log.output).toMatch(/Found 1 error\. Watching for file changes/);
		expect(fs.existsSync(path.join(created.dir, 'Panel.tsrx'))).toBe(true);

		child.kill();
	}, 60_000);
});
