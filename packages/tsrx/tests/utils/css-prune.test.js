import { describe, expect, it } from 'vitest';
import { analyzeCss, parseModule, parseStyle, pruneCss } from '../../src/index.js';

/** @param {string} source */
function parse_element(source) {
	const [statement] = parseModule(`const element = ${source};`, 'prune-css.tsrx').body;
	if (statement.type !== 'VariableDeclaration') throw new Error('Expected a variable declaration');

	const element = statement.declarations[0].init;
	if (element?.type !== 'JSXElement') throw new Error('Expected a JSX element');

	element.metadata.path = [];
	return element;
}

describe('pruneCss', () => {
	it('preserves the exported single-element pruning contract', () => {
		const css = parseStyle(
			'.card { color: red; }',
			{ filename: 'prune-css.tsrx', line: 1, column: 1 },
			{},
		);
		const element = parse_element('<div class="card" />');
		const top_scoped_classes = new Map();

		analyzeCss(css);
		pruneCss(css, element, new Map(), top_scoped_classes);

		const rule = css.children[0];
		if (rule.type !== 'Rule') throw new Error('Expected a CSS rule');
		const selector = rule.prelude.children[0];

		expect(selector.metadata.used).toBe(true);
		expect(element.metadata.scoped).toBe(true);
		const css_metadata = element.metadata.css;
		expect(css_metadata).toBeDefined();
		if (!css_metadata) throw new Error('Expected scoped CSS metadata');
		expect(css_metadata.hash).toBe(css.hash);
		expect([...css_metadata.scopedClasses.keys()]).toEqual(['card']);
		expect(top_scoped_classes.get('card')).toMatchObject({
			start: 0,
			end: 5,
			regionHash: css.hash,
		});
	});
});
