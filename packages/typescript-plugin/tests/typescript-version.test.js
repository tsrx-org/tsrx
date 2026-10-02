import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
	MINIMUM_NATIVE_TYPESCRIPT_VERSION,
	SUPPORTED_TYPESCRIPT_RANGE,
	TYPESCRIPT_7_TRACKING_URL,
	compare_typescript_versions,
	has_content_mapper_protocol,
	is_native_typescript_package,
	typescript_major,
	unsupported_typescript_message,
} from '../src/typescript-version.js';

const require = createRequire(import.meta.url);

describe('TypeScript version support', () => {
	it('accepts the installed TypeScript and every 5.9 / 6 release', () => {
		const installed = /** @type {{ version: string }} */ (require('typescript/package.json'));
		expect(unsupported_typescript_message(installed, 'tsrx-tsc')).toBeUndefined();
		for (const version of ['5.9.3', '5.9.4', '6.0.0', '6.0.3', '6.1.0-beta']) {
			expect(is_native_typescript_package(version)).toBe(false);
			expect(has_content_mapper_protocol(version)).toBe(false);
		}
		expect(typescript_major('6.0.3')).toBe(6);
	});

	it('declares the ranges the workspace uses', () => {
		expect(SUPPORTED_TYPESCRIPT_RANGE).toBe('^5.9.3 || ^6.0.0');
		const workspace = fs.readFileSync(
			new URL('../../../pnpm-workspace.yaml', import.meta.url),
			'utf8',
		);
		const anchor = (/** @type {string} */ name) =>
			new RegExp(`^${name}: &${name} (.+)$`, 'm').exec(workspace)?.[1];
		// The peer range: the JavaScript API range plus the native builds.
		expect(anchor('ts_supported')).toBe(
			`${SUPPORTED_TYPESCRIPT_RANGE} || ^${MINIMUM_NATIVE_TYPESCRIPT_VERSION}`,
		);
		// The nightly the repository runs, released after the release-age policy.
		const native = anchor('ts_native') ?? '';
		expect(has_content_mapper_protocol(native)).toBe(true);
		expect(workspace).toContain(`  - typescript@${native}\n`);
		expect(workspace).toContain(
			`@typescript/typescript-${process.platform}-${process.arch}@${native}'`,
		);
		expect(MINIMUM_NATIVE_TYPESCRIPT_VERSION).toMatch(/^7\.\d+\.\d+(-dev\.\d{8}\.\d+)?$/);
		expect(TYPESCRIPT_7_TRACKING_URL).toMatch(
			/^https:\/\/github\.com\/tsrx-org\/tsrx\/issues\/\d+$/,
		);
	});

	it('recognises the native TypeScript package, stable or nightly, by major version', () => {
		for (const version of ['7.0.2', '7.0.1-rc', '7.1.0-dev.20260918.1', '8.0.0']) {
			expect(is_native_typescript_package(version)).toBe(true);
		}
	});

	it('orders TypeScript versions with nightlies below the betas and releases they precede', () => {
		/** @type {Array<[string, string]>} Each pair is older, newer. */
		const ordered = [
			['5.9.3', '6.0.0'],
			['7.0.2', '7.1.0-dev.20260822.1'],
			['7.1.0-dev.20260821.1', '7.1.0-dev.20260822.1'],
			['7.1.0-dev.20260822.1', '7.1.0-dev.20260822.2'],
			['7.1.0-dev.20260822.2', '7.1.0-dev.20260918.1'],
			['7.1.0-dev.20260918.1', '7.1.0-beta'],
			['7.1.0-beta', '7.1.0-rc'],
			['7.1.0-rc', '7.1.0'],
			['7.1.0', '7.1.1-dev.20261001.1'],
			['7.1.1', '7.2.0-dev.20261101.1'],
		];
		for (const [older, newer] of ordered) {
			expect(compare_typescript_versions(older, newer), `${older} < ${newer}`).toBeLessThan(0);
			expect(compare_typescript_versions(newer, older), `${newer} > ${older}`).toBeGreaterThan(0);
		}
		expect(compare_typescript_versions('7.1.0-dev.20260918.1', '7.1.0-dev.20260918.1')).toBe(0);
	});

	it('knows which native builds speak the content-mapper protocol', () => {
		expect(has_content_mapper_protocol('7.0.2')).toBe(false);
		expect(has_content_mapper_protocol('7.1.0-dev.20260821.1')).toBe(false);
		// Speaks the protocol, but its `tsc --watch` never recompiles (microsoft/TypeScript#64351).
		expect(has_content_mapper_protocol('7.1.0-dev.20260922.1')).toBe(false);
		expect(has_content_mapper_protocol(MINIMUM_NATIVE_TYPESCRIPT_VERSION)).toBe(true);
		expect(has_content_mapper_protocol('7.1.0-dev.20260930.4')).toBe(true);
		expect(has_content_mapper_protocol('7.1.0')).toBe(true);
		expect(has_content_mapper_protocol('8.0.0')).toBe(true);
	});

	it('lets tsrx-tsc run a native build with the content-mapper protocol', () => {
		expect(unsupported_typescript_message(MINIMUM_NATIVE_TYPESCRIPT_VERSION, 'tsrx-tsc')).toBe(
			undefined,
		);
		expect(unsupported_typescript_message({ version: '7.1.0-dev.20260930.4' }, 'tsrx-tsc')).toBe(
			undefined,
		);
	});

	it('explains what each tool needs when an unusable native package is resolved', () => {
		const stub = { version: '7.0.2', versionMajorMinor: '7.0' };
		const tsc = unsupported_typescript_message(stub, 'tsrx-tsc');
		expect(tsc).toContain('tsrx-tsc resolved typescript@7.0.2');
		expect(tsc).toContain(SUPPORTED_TYPESCRIPT_RANGE);
		expect(tsc).toContain('tsc --runExternalCode');
		expect(tsc).toContain(MINIMUM_NATIVE_TYPESCRIPT_VERSION);
		expect(tsc).toContain('typescript@next');
		expect(tsc).toContain(TYPESCRIPT_7_TRACKING_URL);
		expect(unsupported_typescript_message('7.1.0-dev.20260821.1', 'tsrx-tsc')).toContain(
			'tsrx-tsc resolved typescript@7.1.0-dev.20260821.1',
		);
	});

	it('stays silent without a version to judge', () => {
		expect(unsupported_typescript_message(undefined, 'tsrx-tsc')).toBeUndefined();
		expect(unsupported_typescript_message({}, 'tsrx-tsc')).toBeUndefined();
	});
});
