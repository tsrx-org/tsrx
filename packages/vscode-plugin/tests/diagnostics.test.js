import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CompileErrorDedupe,
	MAPPER_DIAGNOSTIC_SOURCE,
	SERVER_COMPILE_ERROR_SOURCE,
	has_mapper_diagnostics,
	has_server_compile_errors,
} from '../src/diagnostics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compile_error = { source: 'TSRX', message: 'Unexpected token' };
const css = { source: 'css', message: 'unknown property' };
const mapper = { source: 'tsrx', message: 'Unexpected token' };
const ts = { source: 'ts', message: 'Type error' };

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
		expect(has_mapper_diagnostics([ts, compile_error])).toBe(false);
		expect(has_mapper_diagnostics([ts, mapper])).toBe(true);
		expect(has_server_compile_errors([ts, compile_error])).toBe(true);
		expect(has_server_compile_errors([ts, mapper])).toBe(false);
	});

	it("keeps the server's compile errors while the mapper has never reported (TypeScript 5.9 or 6)", () => {
		const dedupe = new CompileErrorDedupe();
		expect(dedupe.filter([compile_error, css], [compile_error, css, ts])).toEqual([
			compile_error,
			css,
		]);
		expect(dedupe.mapper_seen).toBe(false);
	});

	it("drops the server's compile errors for the whole session once the mapper has reported (TypeScript 7)", () => {
		const dedupe = new CompileErrorDedupe();
		// First sighting, on some file: reported as such so open files can be refreshed.
		expect(dedupe.observe([ts, mapper])).toBe(true);
		expect(dedupe.observe([ts, mapper])).toBe(false);
		// The file the mapper reports on, and every other file from now on.
		expect(dedupe.filter([compile_error, css], [compile_error, css, mapper, ts])).toEqual([css]);
		expect(dedupe.filter([compile_error, css], [compile_error, css])).toEqual([css]);
		// Filtering itself learns too.
		const fresh = new CompileErrorDedupe();
		expect(fresh.filter([compile_error], [compile_error, mapper])).toEqual([]);
		expect(fresh.mapper_seen).toBe(true);
	});
});
