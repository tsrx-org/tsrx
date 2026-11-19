/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import {
	analyzeTsrx,
	createJsxTransform,
	createVolarMappingsResult,
	parseModule,
} from '../../src/index.js';

/**
 * A platform's AST pass can wrap an expression in a call that has the
 * expression's own location, so that hover and diagnostics on the call land on
 * the authored text. Octane wraps template reads in a type-only helper before
 * handing the AST to `createJsxTransform` (#1392). The wrapped expression's
 * editor mapping must start where its own text is printed, not at the
 * wrapper's callee.
 */

/** @type {JsxPlatform} */
const PLATFORM = {
	name: 'wrapped-expression-test',
	imports: {
		fragment: 'test-platform',
		suspense: 'test-platform',
		dynamic: 'test-platform/dynamic',
		errorBoundary: 'test-platform/error-boundary',
		forOfIterableHelper: 'test-platform/iterable',
	},
	jsx: { rewriteClassAttr: false, classAttrName: 'class' },
	validation: { requireUseServerForAwait: false },
};

const WRAPPED_TYPES = new Set([
	'MemberExpression',
	'CallExpression',
	'ChainExpression',
	'TSNonNullExpression',
]);

/**
 * Compile for the editor, as the targets' `compile_to_volar_mappings` does,
 * after wrapping each expression container's member expression or call in
 * `read(…)` with the expression's location.
 * @param {string} source
 * @param {string} [wrapper] the wrapping call's callee, a name or a dotted path
 * @param {boolean} [nested] also wrap each member expression's object that is
 * a member expression, from the innermost out
 */
function compile_wrapped(source, wrapper = 'read', nested = false) {
	/** @type {CompileError[]} */
	const errors = [];
	/** @type {AST.CommentWithLocation[]} */
	const comments = [];
	const ast = parseModule(source, 'App.tsrx', {
		collect: true,
		loose: true,
		preserveParens: true,
		keywordTokens: true,
		errors,
		comments,
	});
	analyzeTsrx(ast, 'App.tsrx', { collect: true, loose: true, typeOnly: true, errors, comments });
	/**
	 * A call to the wrapper with `inner`'s location.
	 * @param {any} inner
	 */
	const wrap_call = (inner) => ({
		type: 'CallExpression',
		callee: wrapper
			.split('.')
			.map((name) => /** @type {any} */ ({ type: 'Identifier', name, metadata: { path: [] } }))
			.reduce((object, property) => ({
				type: 'MemberExpression',
				object,
				property,
				computed: false,
				optional: false,
				metadata: { path: [] },
			})),
		arguments: [inner],
		optional: false,
		start: inner.start,
		end: inner.end,
		loc: inner.loc,
		metadata: { path: [] },
	});
	/** @param {any} expression */
	const wrap_objects = (expression) => {
		if (expression.type === 'MemberExpression' && expression.object.type === 'MemberExpression') {
			expression.object = wrap_call(wrap_objects(expression.object));
		}
		return expression;
	};
	/** @param {any} node */
	const wrap = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			node.forEach(wrap);
			return;
		}
		if (node.type === 'JSXExpressionContainer' && WRAPPED_TYPES.has(node.expression?.type)) {
			node.expression = wrap_call(nested ? wrap_objects(node.expression) : node.expression);
		}
		for (const key of Object.keys(node)) {
			if (key !== 'loc' && key !== 'metadata') wrap(node[key]);
		}
	};
	wrap(ast);
	const transformed = createJsxTransform(PLATFORM)(ast, source, 'App.tsrx', {
		collect: true,
		loose: true,
		typeOnly: true,
		errors,
		comments,
	});
	const { mappings } = createVolarMappingsResult({
		ast: transformed.ast,
		ast_from_source: ast,
		source,
		generated_code: transformed.code,
		source_map: transformed.map,
		errors,
	});
	return { code: transformed.code, mappings };
}

/**
 * The generated text of each mapping of exactly the last `text` in the source.
 * @param {string} source
 * @param {string} text
 * @param {string} [wrapper]
 * @param {boolean} [nested]
 */
function mapped_texts(source, text, wrapper, nested) {
	const { code, mappings } = compile_wrapped(source, wrapper, nested);
	const start = source.lastIndexOf(text);
	return mappings
		.filter((mapping) => mapping.sourceOffsets[0] === start && mapping.lengths[0] === text.length)
		.map((mapping) => {
			const generated = mapping.generatedOffsets[0];
			return code.slice(generated, generated + (mapping.generatedLengths ?? mapping.lengths)[0]);
		});
}

const DECLARATIONS = `declare const a: any;
declare const b: number;
declare function f(): { x: number };
declare const re: { x: number };
declare const read: { x: number };
`;

describe('an expression a platform wraps in a call with its own location (#1392)', () => {
	it('maps the issue example from the member expression, not from `read(`', () => {
		const source = `const value = { list: ["a"] };
export function App() @{ <p>{value.list[0]}</p> }
`;
		expect(mapped_texts(source, 'value.list[0]')).toEqual(['value.list[0]']);
		expect(mapped_texts(source, 'value.list')).toEqual(['value.list']);
	});

	it.each([
		['a.b.c.d', ['a.b.c.d', 'a.b.c', 'a.b']],
		['a?.b?.c', ['a?.b?.c', 'a?.b']],
		['a[b].c', ['a[b].c', 'a[b]']],
		['f().x', ['f().x', 'f()']],
		['a!.z', ['a!.z']],
		['(a as { k: number }).k', ['(a as { k: number }).k', '(a as { k: number })']],
		['`t`.length', ['`t`.length']],
		// The wrapper's callee is the same name.
		['read.x', ['read.x']],
	])('maps each member expression and call in `%s` from its own text', (expression, texts) => {
		const source = `${DECLARATIONS}export function App() @{ <p>{${expression}}</p> }\n`;
		for (const text of texts) expect(mapped_texts(source, text), text).toEqual([text]);
	});

	it('maps `this .y` and `super .x`, printed without the space, from their own text', () => {
		const source = `class Base { get x() { return 1; } }
export class C extends Base {
	y = 2;
	m() {
		return <p>{this .y}{super .x}</p>;
	}
}
`;
		expect(mapped_texts(source, 'this .y')).toEqual(['this.y']);
		expect(mapped_texts(source, 'super .x')).toEqual(['super.x']);
	});

	it.each([
		// The wrapper's callee, `read`, starts with `re`.
		['re .x', 're.x', 'read'],
		// The wrapper's callee is the same name.
		['read .x', 'read.x', 'read'],
		// The wrapper's callee is `re` and a character outside the BMP.
		['re .x', 're.x', 're𐐀'],
		['(a as {k:number}).k', '(a as { k: number }).k', 'read'],
		['`t` .length', '`t`.length', 'read'],
		['read /* c */ .x', 'read.x', 'read'],
		['read // c\n.x', 'read.x', 'read'],
		// The printer writes the escaped name as `a`, so only the name matches.
		['\\u0061.z', 'a.z', 'read'],
		['\\u0061.z', 'a.z', 'a'],
		// The wrapper's callee starts with the whole member expression.
		['a.re', 'a.re', 'a.read'],
		['a.b', 'a.b', 'a.b.read'],
		['a.b', 'a.b', 'a.b'],
		['a.𐐀', 'a.𐐀', 'a.𐐀more'],
	])(
		'maps `%s`, printed `%s`, from its own text in a `%s(…)` call',
		(expression, printed, wrapper) => {
			const source = `${DECLARATIONS}export function App() @{ <p>{${expression}}</p> }\n`;
			expect(mapped_texts(source, expression, wrapper)).toEqual([printed]);
		},
	);

	it('maps a member expression whose object a pass also wrapped from its own text, or keeps its mapping', () => {
		// `a.b.c.d` with each member wrapped prints `read(read(read(a.b).c).d)`.
		// `a.b` maps from its own text. `a.b.c.d` prints differently from its
		// source and starts with no authored name, so it keeps its mapping rather
		// than taking a wrapper inside it.
		const source = `${DECLARATIONS}export function App() @{ <p>{a.b.c.d}</p> }\n`;
		expect(mapped_texts(source, 'a.b', 'read', true)).toEqual(['a.b']);
		expect(mapped_texts(source, 'a.b.c.d', 'read', true)).toEqual(['read(read(read(a.b).c).d']);
	});

	const long_string = JSON.stringify('a'.repeat(300));
	it.each([
		['/x/.test', '(/x/).test'],
		// A `//` or `/*` in a literal, and a text longer than any limit on the
		// comparison, don't make a later position look like the start.
		['"http://x"()', '("http://x")'],
		['/a[/*]b/()', '(/a[/*]b/)'],
		[`${long_string}()`, `(${long_string})`],
	])('keeps the parentheses the printer puts around the start of `%s`', (expression, printed) => {
		const source = `${DECLARATIONS}export function App() @{\n\tconst r = ${expression};\n\t<p>{r}</p>\n}\n`;
		expect(mapped_texts(source, expression)).toEqual([printed]);
	});
});
