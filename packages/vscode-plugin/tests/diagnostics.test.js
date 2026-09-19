import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	MAPPER_DIAGNOSTIC_SOURCE,
	SERVER_COMPILE_ERROR_SOURCE,
	has_mapper_diagnostics,
	without_duplicate_compile_errors,
} from '../src/diagnostics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('TSRX compile errors are shown once', () => {
	it('uses the diagnostic sources the mapper and the language server actually emit', () => {
		const protocol = readFileSync(
			resolve(__dirname, '../../content-mapper/src/protocol.js'),
			'utf8',
		);
		expect(protocol).toContain(`DIAGNOSTIC_SOURCE = '${MAPPER_DIAGNOSTIC_SOURCE}'`);
		const plugin = readFileSync(
			resolve(__dirname, '../../language-server/src/compileErrorDiagnosticPlugin.js'),
			'utf8',
		);
		expect(plugin).toContain(`source: '${SERVER_COMPILE_ERROR_SOURCE}'`);
	});

	it("drops the server's compile errors only when the mapper reports for the file", () => {
		const compile_error = { source: 'TSRX', message: 'Unexpected token' };
		const css = { source: 'css', message: 'unknown property' };
		const mapper = { source: 'tsrx', message: 'Unexpected token' };
		const ts = { source: 'ts', message: 'Type error' };
		expect(has_mapper_diagnostics([ts, compile_error])).toBe(false);
		expect(has_mapper_diagnostics([ts, mapper])).toBe(true);
		// TypeScript 5.9 or 6 through the tsserver plugin: nobody else reports compile errors.
		expect(
			without_duplicate_compile_errors([compile_error, css], [compile_error, css, ts]),
		).toEqual([compile_error, css]);
		// TypeScript 7 through the mapper: the mapper's copy wins, everything else stays.
		expect(
			without_duplicate_compile_errors([compile_error, css], [compile_error, css, mapper, ts]),
		).toEqual([css]);
	});
});
