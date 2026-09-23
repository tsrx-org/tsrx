import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	consumer_fixture_files,
	create_native_workspace,
	parse_tsc_output,
	read_expected_diagnostics,
	run_native_tsc,
} from './fixture-utils.js';

/** @type {Array<() => void>} */
const cleanups = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * @param {Record<string, string>} files
 * @param {Parameters<typeof create_native_workspace>[1]} [options]
 */
function workspace(files, options) {
	const created = create_native_workspace(files, options);
	cleanups.push(created.cleanup);
	return created.dir;
}

describe('native tsc --runExternalCode', () => {
	it('checks the consumer fixture with the same diagnostics as classic tsrx-tsc', () => {
		const dir = workspace(consumer_fixture_files());
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		const expected = read_expected_diagnostics();
		expect(parse_tsc_output(result.output)).toEqual(expected.diagnostics);
		expect(result.status).toBe(expected.exitCode);
	});

	it('passes a fixture without the intentional error', () => {
		const files = consumer_fixture_files();
		files['main.ts'] = files['main.ts'].replace(/\/\/ Intentional[^\n]*\n[^\n]*\n/, '');
		const dir = workspace(files);
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		expect(result.output).toBe('');
		expect(result.status).toBe(0);
	});

	it('reports a TSRX compile error at its source position and keeps importers resolving', () => {
		const files = consumer_fixture_files();
		// A parse error the loose parser cannot recover from: the compiler
		// throws, the mapper answers with an export stub and one diagnostic in
		// original coordinates.
		const broken = files['Panel.tsrx'].replace('{label}', '{{{label}');
		files['Panel.tsrx'] = broken;
		const offset = broken.indexOf('{{{');
		const line = broken.slice(0, offset).split('\n').length;
		const column = offset - broken.lastIndexOf('\n', offset - 1);
		const dir = workspace(files);
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		const diagnostics = parse_tsc_output(result.output);
		const tsrx_errors = diagnostics.filter((d) => d.code.startsWith('tsrx'));
		expect(tsrx_errors).toHaveLength(1);
		expect(tsrx_errors[0].file).toBe('Panel.tsrx');
		expect(tsrx_errors[0].line).toBe(line);
		expect(tsrx_errors[0].column).toBeGreaterThanOrEqual(column);
		expect(tsrx_errors[0].column).toBeLessThanOrEqual(column + 3);
		// The export stub keeps main.ts resolving `./Panel.tsrx` and, since its
		// exports are typed `any`, main.ts reports nothing else.
		expect(diagnostics.filter((d) => !d.code.startsWith('tsrx'))).toEqual([]);
		expect(result.status).not.toBe(0);
	});

	it('honors the mapper entry compiler option over the tsconfig declaration', () => {
		const files = consumer_fixture_files({ compiler: '@tsrx/does-not-exist' });
		const dir = workspace(files);
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		expect(result.output).toContain('does-not-exist');
		expect(result.status).not.toBe(0);
	});

	it('type-checks embedded <script> bodies as supplemental outputs', () => {
		const files = consumer_fixture_files();
		const edited = files['Panel.tsrx'].replace(
			'const analyticsEnabled: boolean = 1 < 2;',
			'const analyticsEnabled: boolean = "no";',
		);
		files['Panel.tsrx'] = edited;
		// TypeScript reports TS2322 on the declaration name, not the initializer.
		const offset = edited.indexOf('analyticsEnabled: boolean = "no"');
		const line = edited.slice(0, offset).split('\n').length;
		const column = offset - edited.lastIndexOf('\n', offset - 1);
		const dir = workspace(files);
		const result = run_native_tsc(dir, [
			'--noEmit',
			'-p',
			'tsconfig.native.json',
			'--pretty',
			'false',
		]);
		const diagnostics = parse_tsc_output(result.output);
		const script_error = diagnostics.find((d) => d.code === 'TS2322' && d.file !== 'main.ts');
		expect(script_error).toBeDefined();
		// The supplemental output is named by the compiler (`Panel.tsrx.0.ts`)
		// but the diagnostic maps back into the .tsrx source through its span.
		expect(script_error?.file).toBe('Panel.tsrx');
		expect(script_error?.line).toBe(line);
		expect(script_error?.column).toBe(column);
		// A supplemental parse must not shadow the physical file.
		expect(fs.existsSync(path.join(dir, 'Panel.tsrx'))).toBe(true);
	});
});
