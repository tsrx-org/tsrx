import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
	MINIMUM_NATIVE_TYPESCRIPT_VERSION,
	SUPPORTED_TYPESCRIPT_RANGE,
	TYPESCRIPT_7_TRACKING_ISSUE_URL,
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
			expect(unsupported_typescript_message(version, 'language-server')).toBeUndefined();
		}
		expect(typescript_major('6.0.3')).toBe(6);
	});

	it('declares the range the package manifests use', () => {
		expect(SUPPORTED_TYPESCRIPT_RANGE).toBe('^5.9.3 || ^6.0.0');
		expect(MINIMUM_NATIVE_TYPESCRIPT_VERSION).toMatch(/^7\.\d+\.\d+(-dev\.\d{8}\.\d+)?$/);
		expect(TYPESCRIPT_7_TRACKING_ISSUE_URL).toMatch(
			/^https:\/\/github\.com\/tsrx-org\/tsrx\/issues\/\d+$/,
		);
	});

	it('recognises the native TypeScript package, stable or nightly, by major version', () => {
		for (const version of ['7.0.2', '7.0.1-rc', '7.1.0-dev.20260918.1', '8.0.0']) {
			expect(is_native_typescript_package(version)).toBe(true);
		}
	});

	it('explains what each tool needs when the native package is resolved', () => {
		const stub = { version: '7.0.2', versionMajorMinor: '7.0' };
		const tsc = unsupported_typescript_message(stub, 'tsrx-tsc');
		expect(tsc).toContain('tsrx-tsc resolved typescript@7.0.2');
		expect(tsc).toContain(SUPPORTED_TYPESCRIPT_RANGE);
		expect(tsc).toContain('tsc --runExternalCode');
		expect(tsc).toContain(MINIMUM_NATIVE_TYPESCRIPT_VERSION);
		expect(tsc).toContain(TYPESCRIPT_7_TRACKING_ISSUE_URL);

		const server = unsupported_typescript_message('7.1.0-dev.20260918.1', 'language-server');
		expect(server).toContain('The TSRX language server resolved typescript@7.1.0-dev.20260918.1');
		expect(server).toContain('on both backends');
		expect(server).toContain(TYPESCRIPT_7_TRACKING_ISSUE_URL);

		const mapper = unsupported_typescript_message(stub, 'content-mapper');
		expect(mapper).toContain('@tsrx/content-mapper resolved typescript@7.0.2');
		expect(mapper).toContain('its own dependency');
		expect(mapper).toContain(TYPESCRIPT_7_TRACKING_ISSUE_URL);
	});

	it('stays silent without a version to judge', () => {
		expect(unsupported_typescript_message(undefined, 'tsrx-tsc')).toBeUndefined();
		expect(unsupported_typescript_message({}, 'content-mapper')).toBeUndefined();
	});
});
