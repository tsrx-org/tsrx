// Runs with the workspace Prettier and with 3.6.0, whose ESTree printer reads
// TSImportType.argument instead of TSImportType.source.
import * as prettier from 'prettier';
import * as standalone from 'prettier/standalone';
import { describe, expect, test } from 'vitest';
import plugin from '../src/index.js';

describe.each([
	['qualified import', 'type T = import("pkg").Value;'],
	['typeof import', 'type T = typeof import("pkg");'],
	['nested import', 'type T = import("pkg").Value<import("other").Inner>;'],
	['import attributes', 'type T = import("pkg", { with: { type: "json" } });'],
	['block comments', 'type T = import(/* before */ "pkg" /* after */).Value;'],
	['line comment', 'type T = import(\n// before\n"pkg").Value;'],
])('import types: %s', (_, input) => {
	const options = { parser: 'tsrx', plugins: [plugin], filepath: 'Fixture.tsx' };

	test('matches Prettier and is stable on a second format', async () => {
		const expected = await prettier.format(input, { parser: 'typescript' });
		const actual = await prettier.format(input, options);
		expect(actual).toBe(expected);
		expect(await prettier.format(actual, options)).toBe(actual);
	});

	test('formats in standalone with only the TSRX plugin', async () => {
		const expected = await prettier.format(input, { parser: 'typescript' });
		expect(await standalone.format(input, options)).toBe(expected);
	});

	test('keeps the cursor in the module name', async () => {
		const cursorOffset = input.indexOf('pkg') + 1;
		const expected = await prettier.formatWithCursor(input, {
			parser: 'typescript',
			cursorOffset,
		});
		const actual = await prettier.formatWithCursor(input, { ...options, cursorOffset });
		expect(actual.formatted).toBe(expected.formatted);
		expect(actual.cursorOffset).toBe(expected.cursorOffset);
	});

	test('formats a selection inside the import type', async () => {
		const text = `const   before = 1;\n${input}\nconst   after = 2;`;
		const rangeStart = text.indexOf('pkg');
		const range = { rangeStart, rangeEnd: rangeStart + 3 };
		const expected = await prettier.format(text, { parser: 'typescript', ...range });
		expect(await prettier.format(text, { ...options, ...range })).toBe(expected);
	});
});
