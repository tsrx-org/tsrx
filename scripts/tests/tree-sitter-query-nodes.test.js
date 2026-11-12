import { describe, expect, it } from 'vitest';
import { query_node_types } from '../tree-sitter-query-nodes.js';

describe('query_node_types', () => {
	it('collects named nodes and anonymous tokens', () => {
		const { named, anonymous } = query_node_types(
			['[', '  "let"', '  "using"', '] @keyword.storage', '(as_expression "as" @keyword)'].join(
				'\n',
			),
		);

		expect([...named]).toEqual(['as_expression']);
		expect([...anonymous]).toEqual(['let', 'using', 'as']);
	});

	it('skips comments, predicate arguments and the `_` wildcard', () => {
		const { named, anonymous } = query_node_types(
			[
				'; (comment_node) "commented"',
				'((identifier) @tag (#match? @tag "^[A-Z]"))',
				'((raw_text) @injection.content (#set! injection.language "css"))',
				'(_) @any',
			].join('\n'),
		);

		expect([...named]).toEqual(['identifier', 'raw_text']);
		expect([...anonymous]).toEqual([]);
	});

	it('reads a semicolon in a string as the token, not a comment', () => {
		const { named, anonymous } = query_node_types('";" @punctuation.delimiter\n(program)');

		expect([...anonymous]).toEqual([';']);
		expect([...named]).toEqual(['program']);
	});

	it('unescapes quotes and backslashes in a token', () => {
		const { anonymous } = query_node_types('"\\"" @string "\\\\" @escape');

		expect([...anonymous]).toEqual(['"', '\\']);
	});
});
