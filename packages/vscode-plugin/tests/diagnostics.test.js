import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTIC_SOURCE, TS_ERRORS, TSRX_ERRORS } from '@tsrx/core/diagnostics';
import {
	CompileErrorDedupe,
	has_mapper_diagnostics,
	has_server_compile_errors,
	reported_by_typescript,
} from '../src/diagnostics.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const compile_error = { source: 'TSRX', code: 'tsrx-compile-error', message: 'Unexpected token' };
const css = { source: 'css', message: 'unknown property' };
const mapper = { source: 'TSRX', code: 111012, message: 'Unexpected token [TS1012]' };
const ts = { source: 'ts', message: 'Type error' };

describe('TSRX compile errors are shown once', () => {
	it("tells the mapper's errors from the server's by their codes, under the source both emit", () => {
		const mapper_source = readFileSync(
			resolve(__dirname, '../../content-mapper/src/mapper.js'),
			'utf8',
		);
		expect(mapper_source).toContain('diagnosticSource: DIAGNOSTIC_SOURCE');
		const plugin = readFileSync(
			resolve(__dirname, '../../language-server/src/compileErrorDiagnosticPlugin.js'),
			'utf8',
		);
		expect(plugin).toContain('source: DIAGNOSTIC_SOURCE');
		expect(has_mapper_diagnostics([ts, compile_error])).toBe(false);
		// The server's copy of a mistake with a TypeScript code keeps it as a string.
		expect(has_mapper_diagnostics([{ ...compile_error, code: 'TS1186' }])).toBe(false);
		expect(has_mapper_diagnostics([ts, mapper])).toBe(true);
		// VS Code can hold a code with a documentation link as `{ value, target }`.
		expect(has_mapper_diagnostics([{ ...mapper, code: { value: mapper.code } }])).toBe(true);
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

	it("keeps the server's warnings once the mapper has reported, as the mapper sends errors only", () => {
		const { code, message } = TSRX_ERRORS.CODE_BLOCK_EXPRESSION_CHILD;
		// VS Code's `DiagnosticSeverity`: 0 is an error, 1 a warning.
		const warning = { source: 'TSRX', code, message, severity: 1 };
		const error = { ...compile_error, severity: 0 };
		const dedupe = new CompileErrorDedupe();
		expect(dedupe.filter([warning, error], [warning, error, mapper])).toEqual([warning]);
		expect(dedupe.mapper_seen).toBe(true);
		expect(dedupe.filter([warning, error], [warning, error])).toEqual([warning]);
	});
});

/**
 * @param {number} line
 * @param {number} character
 */
function at(line, character) {
	return { start: { line, character }, end: { line, character: character + 1 } };
}

describe('a mistake tsserver also reports is shown once (TypeScript 5.9 or 6)', () => {
	const rest_default = TS_ERRORS.REST_ELEMENT_INITIALIZER;
	// The server's copy of a mistake the parser collects, and tsserver's.
	const collected = {
		source: 'TSRX',
		code: rest_default.code,
		message: rest_default.message,
		range: at(1, 12),
	};
	const typescript = {
		source: 'ts',
		code: Number(rest_default.code.slice(2)),
		message: rest_default.message,
		range: at(1, 12),
	};

	it("drops the server's copy while tsserver shows the same code at the same place", () => {
		expect(reported_by_typescript(collected, [collected, typescript])).toBe(true);
		// VS Code can hold a code with a documentation link as `{ value, target }`.
		expect(
			reported_by_typescript(collected, [{ ...typescript, code: { value: typescript.code } }]),
		).toBe(true);
		const dedupe = new CompileErrorDedupe();
		expect(dedupe.filter([collected, css], [collected, css, typescript])).toEqual([css]);
		expect(dedupe.mapper_seen).toBe(false);
	});

	it('keeps it for another code, another place, a TSRX code, or another source', () => {
		const other_code = { ...typescript, code: 2451 };
		const other_place = { ...typescript, range: at(1, 13) };
		expect(reported_by_typescript(collected, [other_code, other_place])).toBe(false);
		const tsrx_only = {
			...collected,
			code: TSRX_ERRORS.UNEXPECTED_CLOSING_TAG.code,
			message: TSRX_ERRORS.UNEXPECTED_CLOSING_TAG.message,
		};
		expect(reported_by_typescript(tsrx_only, [{ ...typescript, code: 1003 }])).toBe(false);
		expect(reported_by_typescript(collected, [{ ...typescript, source: DIAGNOSTIC_SOURCE }])).toBe(
			false,
		);
		expect(reported_by_typescript(compile_error, [typescript])).toBe(false);
	});

	it("refreshes when tsserver's copy arrives or goes, and settles after", () => {
		const uri = 'file:///App.tsrx';
		const dedupe = new CompileErrorDedupe();
		// The server reports first: nothing from tsserver yet, so its copy shows.
		expect(dedupe.receive(uri, [collected], [], false)).toEqual([collected]);
		expect(dedupe.needs_refresh(uri, [collected])).toBe(false);
		// tsserver's copy arrives: the server's goes.
		expect(dedupe.needs_refresh(uri, [collected, typescript])).toBe(true);
		expect(dedupe.receive(uri, [collected], [collected, typescript], false)).toEqual([]);
		expect(dedupe.needs_refresh(uri, [typescript])).toBe(false);
		// tsserver's copy goes while the server still reports the mistake: it comes back.
		expect(dedupe.needs_refresh(uri, [])).toBe(true);
		expect(dedupe.filter(dedupe.received.get(uri)?.diagnostics ?? [], [])).toEqual([collected]);
		expect(dedupe.needs_refresh(uri, [collected])).toBe(false);
	});

	it("refreshes a file that shows the server's copy once the mapper has reported", () => {
		const dedupe = new CompileErrorDedupe();
		dedupe.observe([mapper]);
		// No diagnostics received for this file: the ones VS Code shows stand in.
		expect(dedupe.needs_refresh('file:///Other.tsrx', [compile_error, css])).toBe(true);
		expect(dedupe.needs_refresh('file:///Other.tsrx', [css])).toBe(false);
	});
});
