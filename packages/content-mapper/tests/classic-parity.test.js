import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	consumer_fixture_dir,
	parse_tsc_output,
	read_expected_diagnostics,
} from './fixture-utils.js';

const classic_cli = fileURLToPath(new URL('../../typescript-plugin/src/tsc.js', import.meta.url));

describe('classic tsrx-tsc parity reference', () => {
	it('reports exactly the expected diagnostics for the consumer fixture', () => {
		const result = spawnSync(
			process.execPath,
			[classic_cli, '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
			{ cwd: consumer_fixture_dir, encoding: 'utf8', timeout: 120_000 },
		);
		expect(result.error).toBeUndefined();
		const expected = read_expected_diagnostics();
		expect(parse_tsc_output(result.stdout + result.stderr)).toEqual(expected.diagnostics);
		expect(result.status).toBe(expected.exitCode);
	});
});
