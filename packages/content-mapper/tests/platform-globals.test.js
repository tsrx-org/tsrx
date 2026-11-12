import fs from 'node:fs';
import { withPlatformTypes } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { share_platform_globals } from '../src/platform-globals.js';

const code = 'export const web = import.meta.env.platform.web;\n';
/** @type {import('@tsrx/core/types').CodeMapping[]} */
const mappings = [
	{
		sourceOffsets: [7],
		generatedOffsets: [13],
		lengths: [3],
		generatedLengths: [3],
		data: { verification: true, customData: {} },
	},
];

/** @param {unknown} platform */
function generated(platform) {
	return withPlatformTypes(
		{
			code,
			mappings: [],
			cssMappings: [],
			scriptMappings: [],
			errors: [],
			sourceAst: /** @type {any} */ (null),
		},
		platform,
	).code;
}

describe('share_platform_globals', () => {
	it('blanks the copy and references the shared file for each platform', () => {
		for (const [platform, name] of [
			['web', 'web'],
			['ios', 'ios'],
			['android', 'android'],
			[undefined, 'unconfigured'],
		]) {
			const text = generated(platform);
			const shared = share_platform_globals(text, mappings);
			const match = /^\/\/\/ <reference path="(.+)" \/>\n/.exec(shared.text);
			expect(match?.[1]).toMatch(new RegExp(`/platform-globals/${name}\\.d\\.cts$`));
			const shift = /** @type {RegExpExecArray} */ (match)[0].length;
			// Only the block turns into spaces; every generated offset moves by the
			// directive's length.
			const blanked = shared.text.slice(shift);
			expect(blanked.length).toBe(text.length);
			expect(blanked.split('\n').length).toBe(text.split('\n').length);
			expect(blanked.replace(/ +\n/g, '\n').replace(/\n+/g, '\n')).toBe(`${code}export {};\n`);
			expect(shared.mappings).toEqual([{ ...mappings[0], generatedOffsets: [13 + shift] }]);
			// The shared file declares the copy it replaces.
			const declaration = fs.readFileSync(/** @type {string} */ (match?.[1]), 'utf8');
			const copy = text.slice(text.indexOf('declare global'));
			expect(declaration.replace(/\s+/g, '')).toContain(copy.replace(/\s+/g, ''));
		}
	});

	it('leaves text without the exact copy, or with a hashbang, unchanged', () => {
		const text = generated('web');
		for (const other of [
			code,
			text.replace('readonly ios: false', 'readonly ios: true'),
			text.replace('readonly [key:', 'readonly url: string;\n\t\treadonly [key:'),
			`#!/usr/bin/env node\n${text}`,
		]) {
			const shared = share_platform_globals(other, mappings);
			expect(shared.text).toBe(other);
			expect(shared.mappings).toBe(mappings);
		}
	});
});
