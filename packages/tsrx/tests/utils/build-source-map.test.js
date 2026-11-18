/** @import * as AST from 'estree' */
/** @import { JsxPlatform } from '../../types/index' */

import { decode } from '@jridgewell/sourcemap-codec';
import { describe, expect, it } from 'vitest';
import { walk } from 'zimmerframe';
import { createJsxTransform, parseModule } from '../../src/index.js';

/**
 * The build print maps the start and end of statements, classes and JSX tags
 * through esrap's root visitor, with no marker of TSRX's own. A later esrap
 * that stopped writing those markers would leave build source maps (stack
 * traces, debugger breakpoints) pointing at the wrong place with nothing else
 * failing.
 */

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'build-source-map-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: false },
};

const source = `export class Store {
	value = 1;
}

export function double(n: number) {
	if (n > 1) {
		for (const x of [n]) {}
	}
	return n * 2;
}

export function App(props: { name: string }) {
	return <div class="greeting">{props.name}</div>;
}
`;

const ast = parseModule(source, 'App.tsrx');
const { code, map } = createJsxTransform(PLATFORM)(ast, source, 'App.tsrx', {});
const generated_lines = code.split('\n');
const segments = decode(map.mappings).flatMap((line, generated_line) =>
	line.map((segment) => ({ generated_line, segment })),
);

/**
 * The first authored node of `type`.
 * @param {string} type
 * @returns {AST.Node & { loc: AST.SourceLocation }}
 */
function first(type) {
	/** @type {any} */
	let found;
	walk(/** @type {AST.Node} */ (ast), null, {
		_(node, { next }) {
			if (!found && node.type === type) found = node;
			next();
		},
	});
	return found;
}

/**
 * The generated text at each segment that maps to `position` in the source.
 * @param {AST.Position} position
 */
function generated_text_at(position) {
	return segments
		.filter(
			({ segment }) =>
				segment.length >= 4 && segment[2] === position.line - 1 && segment[3] === position.column,
		)
		.map(({ generated_line, segment }) => generated_lines[generated_line].slice(segment[0]));
}

describe('build source map', () => {
	it.each([
		['ClassDeclaration', 'class'],
		['IfStatement', 'if'],
		['ForOfStatement', 'for'],
		['ReturnStatement', 'return'],
		['JSXOpeningElement', '<div'],
		['JSXClosingElement', '</div>'],
	])('maps the start and end of a %s', (type, start_text) => {
		const { loc } = first(type);

		expect(generated_text_at(loc.start).some((text) => text.startsWith(start_text))).toBe(true);
		expect(generated_text_at(loc.end).length).toBeGreaterThan(0);
	});
});
