import { describe, expect, it } from 'vitest';
import { getLineCommentsAfter, isOrganizedImport, parseModule } from '../../src/index.js';

/**
 * The source text of the comments after the first statement on its line.
 * @param {string} source
 */
function line_comments(source) {
	const [statement] = parseModule(source, 'App.tsrx').body;
	return getLineCommentsAfter(statement, source).map((comment) =>
		source.slice(comment.start, comment.end),
	);
}

describe('getLineCommentsAfter', () => {
	it.each([
		["import a from './a'; // why\nimport b from './b';\n", ['// why']],
		["import a from './a' // why\n", ['// why']],
		["import a from './a';\t/* first */  // second  \r\n", ['/* first */', '// second  ']],
		["import a from './a'; /* why */   \n", ['/* why */']],
		["import a from './a'; // why", ['// why']],
	])('returns the comments after the statement on its line in %j', (source, expected) => {
		expect(line_comments(source)).toEqual(expected);
	});

	it.each([
		["import a from './a';\n// next line\nimport b from './b';\n"],
		["import a from './a'; /* first\nsecond */\n"],
		["import a from './a'; /* why */ a;\n"],
		["import a from './a';\n"],
	])('returns no comments for %j', (source) => {
		expect(line_comments(source)).toEqual([]);
	});
});

describe('isOrganizedImport', () => {
	it.each([
		["import a from './a';", true],
		["export * from './a';", true],
		["export { a } from './a';", true],
		['const a = 1;\nexport { a };', false],
		['export const b = 1;', false],
	])('%j: %s', (source, expected) => {
		const statements = parseModule(source, 'App.tsrx').body;
		expect(isOrganizedImport(statements[statements.length - 1])).toBe(expected);
	});
});
