import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const consumer_fixture_dir = fileURLToPath(new URL('./fixtures/consumer/', import.meta.url));

/**
 * @typedef {{
 * 	file: string,
 * 	line: number,
 * 	column: number,
 * 	code: string,
 * 	message: string,
 * }} ExpectedDiagnostic
 */

/**
 * The parity reference shared by the classic (`tsrx-tsc`) and native
 * (`tsc --runExternalCode`) checks of the consumer fixture.
 * @returns {{ exitCode: number, diagnostics: ExpectedDiagnostic[] }}
 */
export function read_expected_diagnostics() {
	return JSON.parse(
		fs.readFileSync(path.join(consumer_fixture_dir, 'expected-diagnostics.json'), 'utf8'),
	);
}

/**
 * Parse `tsc --pretty false` output into comparable records. Continuation
 * lines (indented message detail) are folded into the preceding diagnostic.
 * @param {string} output
 * @returns {ExpectedDiagnostic[]}
 */
export function parse_tsc_output(output) {
	/** @type {ExpectedDiagnostic[]} */
	const diagnostics = [];
	for (const line of output.split(/\r?\n/)) {
		const match = /^(.+?)\((\d+),(\d+)\): error (TS\d+|[\w-]+\(\d+\)): (.*)$/.exec(line);
		if (match) {
			diagnostics.push({
				file: match[1].replace(/\\/g, '/'),
				line: Number(match[2]),
				column: Number(match[3]),
				code: match[4],
				message: match[5],
			});
		} else if (diagnostics.length > 0 && /^\s+\S/.test(line)) {
			diagnostics[diagnostics.length - 1].message += '\n' + line.trim();
		}
	}
	return diagnostics;
}
