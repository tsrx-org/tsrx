import { describe, expect, it } from 'vitest';
import { parseStyle } from '../../src/index.js';

const LOCATION = { filename: 'App.tsrx', line: 1, column: 0 };

describe('parseStyle loose recovery', function () {
	it('does not throw on leftover markup after an unclosed style body', function () {
		expect(function () {
			parseStyle('\n\t\t<div />\n\t</>\n}', LOCATION, { loose: true });
		}).not.toThrow();
	});

	it('does not throw on a partial rule', function () {
		const sheet = parseStyle('.foo', LOCATION, { loose: true });

		expect(sheet.type).toBe('StyleSheet');
		expect(sheet.source).toBe('.foo');
	});

	it('still throws on partial input when loose is off', function () {
		expect(function () {
			parseStyle('\n\t\t<div />\n\t</>\n}', LOCATION, { loose: false });
		}).toThrow('Expected identifier');
	});

	it('still parses a balanced rule', function () {
		const sheet = parseStyle('.foo { color: red; }', LOCATION, { loose: false });

		expect(sheet.children).toHaveLength(1);
		expect(sheet.children[0].type).toBe('Rule');
	});
});
