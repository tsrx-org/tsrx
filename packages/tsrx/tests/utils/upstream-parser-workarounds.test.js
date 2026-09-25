/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { createJsxTransform, parseModule } from '../../src/index.js';
import { as_type, assert_type } from '../shared/node-types.js';
import { parse_in_worker, parse_in_worker_with_ast } from '../shared/parse-in-worker.js';

/**
 * Bugs in @sveltejs/acorn-typescript that the TSRX parser works around by
 * overriding one method each in `TSRXPlugin`. Each override is marked
 * `UPSTREAM(sveltejs/acorn-typescript#<n>)` in `src/plugin.js`; when a release
 * includes the upstream fix, the override goes and these tests stay.
 */

/**
 * Parse with the options the formatter uses, keeping collected errors.
 * @param {string} source
 */
function parse(source) {
	/** @type {CompileError[]} */
	const errors = [];
	const ast = parseModule(source, 'App.tsrx', {
		collect: true,
		errors,
		comments: [],
		preserveParens: true,
	});
	return { ast, errors };
}

/**
 * @param {AST.Expression | AST.PrivateIdentifier} key
 */
function keyName(key) {
	if (key.type === 'PrivateIdentifier') return `#${key.name}`;
	if (key.type === 'Identifier') return key.name;
	if (key.type === 'Literal') return String(key.value);
	return key.type;
}

/**
 * The members of the only class in `source`, written like `static count`,
 * `static create()`, or `static get size()`.
 * @param {string} source
 */
function classMembers(source) {
	const { ast, errors } = parse(source);
	expect(errors).toEqual([]);
	const [declaration] = ast.body;
	assert_type(declaration, 'ClassDeclaration');
	return declaration.body.body.map((node) => {
		if (node.type === 'StaticBlock') return 'static {}';
		const member = /** @type {AST.MethodDefinition | AST.PropertyDefinition} */ (node);
		const method = member.type === 'MethodDefinition';
		const kind =
			method && (member.kind === 'get' || member.kind === 'set') ? `${member.kind} ` : '';
		const name = member.computed ? `[${keyName(member.key)}]` : keyName(member.key);
		return `${member.static ? 'static ' : ''}${kind}${name}${method ? '()' : ''}`;
	});
}

describe('`static` followed by a line break (sveltejs/acorn-typescript#119)', () => {
	it('keeps the member after `static` and a line break static', () => {
		expect(classMembers('class C {\n  static\n  count = 0;\n  static\n  create() {}\n}')).toEqual([
			'static count',
			'static create()',
		]);
	});

	it('takes `static` as a modifier before every token that can follow one', () => {
		for (const [member, expected] of [
			['count = 0', 'static count'],
			['[key] = 1', 'static [key]'],
			['*items() {}', 'static items()'],
			['#secret = 1', 'static #secret'],
			["'quoted' = 1", 'static quoted'],
			['1 = 1', 'static 1'],
			['get size() {}', 'static get size()'],
			['static() {}', 'static static()'],
		]) {
			expect(classMembers(`class C {\n  static\n  ${member}\n}`), member).toEqual([expected]);
		}
	});

	it('reads `static` as a name before a token that cannot follow a modifier', () => {
		for (const [member, expected] of [
			['(){}', 'static()'],
			['= 1', 'static'],
			[';', 'static'],
			['', 'static'],
			['?: number', 'static'],
			[': number', 'static'],
		]) {
			expect(classMembers(`class C {\n  static\n  ${member}\n}`), member).toEqual([expected]);
		}
	});

	it('reads a second `static` as a name, as TypeScript does', () => {
		expect(classMembers('class C {\n  static\n  static\n  a() {}\n}')).toEqual([
			'static static',
			'a()',
		]);
		expect(classMembers('class C {\n  static\n  static\n  static\n  a() {}\n}')).toEqual([
			'static static',
			'static a()',
		]);
		expect(classMembers('class C {\n  static static\n  a() {}\n}')).toEqual([
			'static static',
			'a()',
		]);
		expect(classMembers('class C {\n  static readonly static\n  a() {}\n}')).toEqual([
			'static static',
			'a()',
		]);
	});

	it('still reads a static block after `static` and a line break', () => {
		expect(classMembers('class C {\n  static\n  {}\n}')).toEqual(['static {}']);
	});

	it('keeps the same-line rule for the other modifiers', () => {
		for (const modifier of ['readonly', 'public', 'declare', 'accessor', 'override', 'async']) {
			expect(classMembers(`class C {\n  ${modifier}\n  x = 1\n}`), modifier).toEqual([
				modifier,
				'x',
			]);
		}
		expect(classMembers('class C {\n  static\n  readonly\n  x = 1\n}')).toEqual([
			'static readonly',
			'x',
		]);
	});

	it('reports `static` before a line break on a type member, like `static` on its line', async () => {
		const sources = [
			'interface I {\n  static\n  x: number\n}',
			'interface I {\n  static x: number\n}',
		];
		const message = "'static' modifier cannot appear on a type member.";

		const outcomes = await parse_in_worker_with_ast(
			sources.flatMap((source) => [{ source }, { source, options: { collect: true } }]),
		);

		expect(
			outcomes.map((outcome) =>
				outcome.ok ? outcome.errors?.map(({ message, pos }) => [message, pos]) : outcome.message,
			),
		).toEqual(sources.flatMap(() => [`${message} (2:2)`, [[message, 16]]]));
	});

	it('compiles the members after `static` and a line break as static members', () => {
		/** @type {JsxPlatform} */
		const platform = {
			name: 'upstream-workaround-test',
			imports: {
				fragment: 'test-platform',
				suspense: 'test-platform',
				dynamic: 'test-platform/dynamic',
				errorBoundary: 'test-platform/error-boundary',
			},
			jsx: { rewriteClassAttr: false, classAttrName: 'class' },
			validation: { requireUseServerForAwait: false },
		};
		const source = `export class Counter {
	static
	count = 0;
	static
	create() {
		return new Counter();
	}
}
`;
		const { code } = createJsxTransform(platform)(
			parseModule(source, 'App.tsrx'),
			source,
			'App.tsrx',
		);
		expect(code).toContain('static count = 0;');
		expect(code).toContain('static create() {');
		expect(code).not.toContain('static;');
	});
});

describe('generic call signature first in an interface (sveltejs/acorn-typescript#120)', () => {
	/**
	 * @param {string} source
	 */
	function interfaceMembers(source) {
		const { ast, errors } = parse(source);
		expect(errors).toEqual([]);
		const [statement] = ast.body;
		const declaration = as_type(
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement,
			'TSInterfaceDeclaration',
		);
		return declaration.body.body.map((member) => member.type);
	}

	it('parses a generic call signature as the first member', () => {
		for (const source of [
			'interface I { <T>(): void }',
			'interface I {\n  <T>(x: T): T;\n}',
			'interface I extends J { <T>(x: T): T }',
			'interface I {\n  <\n    A // comment\n  >(arg): any;\n}',
			'export interface I { <T>(x: T): T }',
		]) {
			expect(interfaceMembers(source), source).toEqual(['TSCallSignatureDeclaration']);
		}

		const source = 'interface I { <T>(x: T): T }';
		const declaration = as_type(parse(source).ast.body[0], 'TSInterfaceDeclaration');
		const [signature] = declaration.body.body;
		assert_type(signature, 'TSCallSignatureDeclaration');
		const params = signature.typeParameters?.params ?? [];
		expect(params.map((param) => source.slice(param.start, param.end))).toEqual(['T']);
	});

	it('parses the call and construct signatures that already worked', () => {
		expect(interfaceMembers('interface I { a: string; <T>(): void }')).toEqual([
			'TSPropertySignature',
			'TSCallSignatureDeclaration',
		]);
		expect(interfaceMembers('interface I { new <T>(): I }')).toEqual([
			'TSConstructSignatureDeclaration',
		]);
		expect(interfaceMembers('interface I { (x: number): string }')).toEqual([
			'TSCallSignatureDeclaration',
		]);
	});

	it('reads the code after the interface outside the type', () => {
		const decorated = parse('interface I { <T>(x: T): T }\n@dec class C {}').ast.body;
		expect(decorated.map((node) => node.type)).toEqual([
			'TSInterfaceDeclaration',
			'ClassDeclaration',
		]);

		const element = parse('interface I { <T>(x: T): T }\nconst a = <div>{1}</div>;').ast.body;
		const [, statement] = element;
		assert_type(statement, 'VariableDeclaration');
		expect(statement.declarations[0].init?.type).toBe('JSXElement');

		expect(parse('interface I {}\n<div />').ast.body.map((node) => node.type)).toEqual([
			'TSInterfaceDeclaration',
			'JSXElement',
		]);
	});
});

describe('class named after a TypeScript contextual keyword (sveltejs/acorn-typescript#110)', () => {
	const words = [
		'global',
		'abstract',
		'declare',
		'type',
		'namespace',
		'module',
		'readonly',
		'keyof',
		'unique',
		'assert',
		'asserts',
	];

	it('parses class declarations and expressions named after each word', () => {
		for (const word of words) {
			const [declaration] = parse(`class ${word} {}`).ast.body;
			assert_type(declaration, 'ClassDeclaration');
			expect(declaration.id?.name).toBe(word);

			const [statement] = parse(`const C = class ${word} {};`).ast.body;
			assert_type(statement, 'VariableDeclaration');
			const expression = as_type(statement.declarations[0].init, 'ClassExpression');
			expect(expression.id?.name).toBe(word);
		}
	});

	it('parses the name in every class position', () => {
		for (const source of [
			'function f() {\n  class global {}\n}',
			'export class global {}',
			'export default class type {}',
			'abstract class abstract {}',
			'declare class declare {}',
			'@dec class type {}',
		]) {
			expect(parse(source).errors, source).toEqual([]);
		}
	});

	it('keeps type parameters and heritage clauses after the name', () => {
		const source = 'class type<T> extends Base<T> implements I {}';
		const [declaration] = parse(source).ast.body;
		assert_type(declaration, 'ClassDeclaration');
		expect(declaration.id?.name).toBe('type');
		const params = declaration.typeParameters?.params ?? [];
		expect(params.map((param) => source.slice(param.start, param.end))).toEqual(['T']);
		expect(as_type(declaration.superClass, 'Identifier').name).toBe('Base');
		expect(declaration.implements?.length).toBe(1);
	});

	it('binds the class name like any other', () => {
		const { errors } = parse('class global {}\nlet global = 1;');
		expect(errors.map((error) => error.message)).toEqual([
			"Identifier 'global' has already been declared",
		]);
	});

	it('still rejects reserved words as class names', () => {
		expect(() => parse('class interface {}')).toThrow("The keyword 'interface' is reserved");
		expect(() => parse('class enum {}')).toThrow("The keyword 'enum' is reserved");
		expect(() => parse('class implements {}')).toThrow("The keyword 'implements' is reserved");
	});

	it('keeps anonymous classes anonymous', () => {
		const [exported] = parse('export default class {}').ast.body;
		assert_type(exported, 'ExportDefaultDeclaration');
		expect(as_type(exported.declaration, 'ClassDeclaration').id).toBeNull();

		const [statement] = parse('const X = class implements I {};').ast.body;
		assert_type(statement, 'VariableDeclaration');
		const expression = as_type(statement.declarations[0].init, 'ClassExpression');
		expect(expression.id ?? null).toBeNull();
		expect(expression.implements?.length).toBe(1);
	});
});

describe("a disallowed modifier's error (sveltejs/acorn-typescript#123)", () => {
	// acorn-typescript raises these with the error template itself, so the
	// message was the template function's source, at the token after the
	// modifier. TypeScript reports them from its checker (TS1070, TS1273,
	// TS1274), at the modifier.

	/** @param {string} modifier */
	const variance_message = (modifier) =>
		`'${modifier}' modifier can only appear on a type parameter of a class, interface or type alias.`;

	const cases = [
		[
			'interface I { private x: number }',
			'private',
			"'private' modifier cannot appear on a type member.",
		],
		[
			'type T = { static x: number };',
			'static',
			"'static' modifier cannot appear on a type member.",
		],
		[
			'interface I { declare m(): void }',
			'declare',
			"'declare' modifier cannot appear on a type member.",
		],
		['interface I<public T> {}', 'public', "'public' modifier cannot appear on a type parameter."],
		[
			'class C<readonly T> {}',
			'readonly',
			"'readonly' modifier cannot appear on a type parameter.",
		],
		['function f<in T>() {}', 'in', variance_message('in')],
		['type F = <out T>() => T;', 'out', variance_message('out')],
		['class C { in x = 1; }', 'in', variance_message('in')],
	];

	it("throws the modifier's message at the modifier", async () => {
		const outcomes = await parse_in_worker(cases.map(([source]) => ({ source })));

		expect(outcomes).toEqual(
			cases.map(([source, modifier, message]) => {
				const pos = source.indexOf(`${modifier} `);
				return { ok: false, message: `${message} (1:${pos})`, pos };
			}),
		);
	});

	it('records it at the modifier when collecting, and keeps the modifier', async () => {
		const outcomes = await parse_in_worker_with_ast(
			cases.map(([source]) => ({ source, options: { collect: true } })),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const [source, modifier, message] = cases[index];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			expect(outcome.errors, source).toEqual([
				{
					message,
					pos: source.indexOf(`${modifier} `),
					end: source.indexOf(`${modifier} `) + 1,
				},
			]);
		}
	});

	it('leaves the modifiers that are allowed alone', async () => {
		const sources = [
			'interface I { readonly x: number }',
			'class C<in out T> {}',
			'interface I<in T> {}',
			'type T<out U> = () => U;',
			'function f<const T>() {}',
		];
		const outcomes = await parse_in_worker(sources.map((source) => ({ source })));

		expect(outcomes).toEqual(sources.map(() => ({ ok: true, errors: undefined })));
	});
});

describe('optional binding pattern parameter in a signature (sveltejs/acorn-typescript#110)', () => {
	// TypeScript's parser accepts `?` after any parameter; its checker reports
	// an optional binding pattern (TS2463) only in a function with a body.
	// acorn-typescript raised it while reading the parameter, so overload
	// signatures got it too.
	const signatures = [
		'function f({ a }?: { a: number }): void;\nfunction f(options?: { a: number }) {}',
		'function f([a]?: number[]): void\nfunction f(values?: number[]) {}',
		'export function f({ a }?: { a: number }): void;\nexport function f() {}',
		'class A {\n\tm([a]?: number[]): void;\n\tm(values?: number[]) {}\n}',
		'class A {\n\tconstructor({ a }?: { a: number });\n\tconstructor(options?: { a: number }) {}\n}',
		'abstract class A {\n\tabstract m({ a }?: { a: number }): void;\n}',
	];

	/**
	 * The first parameter of the first function or method in `program`.
	 * @param {AST.Program} program
	 */
	function first_parameter(program) {
		let [node] = /** @type {AST.Node[]} */ (program.body);
		if (node.type === 'ExportNamedDeclaration') node = /** @type {AST.Node} */ (node.declaration);
		if (node.type === 'ClassDeclaration') {
			node = as_type(node.body.body[0], 'MethodDefinition').value;
		}
		return /** @type {AST.Function} */ (node).params[0];
	}

	it('accepts it in a signature without a body, with the same node as in a type', async () => {
		const outcomes = await parse_in_worker_with_ast([
			...signatures.map((source) => ({ source })),
			...signatures.map((source) => ({ source, options: { collect: true } })),
		]);

		for (const [index, outcome] of outcomes.entries()) {
			const source = signatures[index % signatures.length];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			expect(outcome.errors ?? [], source).toEqual([]);
			expect(first_parameter(outcome.ast), source).toMatchObject({
				type: source.includes('[a]') ? 'ArrayPattern' : 'ObjectPattern',
				optional: true,
				typeAnnotation: { type: 'TSTypeAnnotation' },
			});
		}
	});

	it('still reports it in a function with a body, and not in an ambient one', async () => {
		const message =
			'A binding pattern parameter cannot be optional in an implementation signature.';
		const sources = [
			'function f({ a }?: { a: number }) {}',
			'function f({ a }?: { a: number }): void {}',
			'const f = function ([a]?: number[]) {};',
			'class A { m({ a }?: { a: number }) {} }',
			'const o = { set x({ a }: { a: number }) {}, m({ a }?: { a: number }) {} };',
			'export function App({ a }?: { a: number }) @{ <div /> }',
		];
		const outcomes = await parse_in_worker([
			...sources.map((source) => ({ source })),
			{ source: 'declare class A { m({ a }?: { a: number }) {} }' },
		]);

		expect(outcomes).toEqual([
			...sources.map((source) => {
				const pos = source.search(/(?:\{ a \}|\[a\])\?/);
				return { ok: false, message: `${message} (1:${pos})`, pos };
			}),
			{ ok: true, errors: undefined },
		]);
	});

	it("reports an optional rest parameter as TypeScript's TS1047, at the `?`", async () => {
		// TypeScript's checker reports it in a type and an ambient context too;
		// acorn-typescript didn't, and neither does this.
		const reported = [
			'function f(...a?: number[]) {}',
			'function f(...a?: number[]): void;',
			'class A { m(...a?: number[]): void; }',
		];
		const unreported = [
			'declare function f(...a?: number[]): void;',
			'type F = (...a?: number[]) => void;',
			'interface I { m(...a?: number[]): void }',
		];
		const outcomes = await parse_in_worker([
			...reported.map((source) => ({ source })),
			...reported.map((source) => ({ source, options: { collect: true } })),
			...unreported.map((source) => ({ source })),
		]);

		const message = 'A rest parameter cannot be optional.';
		expect(outcomes).toEqual([
			...reported.map((source) => ({
				ok: false,
				message: `${message} (1:${source.indexOf('?')})`,
				pos: source.indexOf('?'),
			})),
			...reported.map(() => ({ ok: true, errors: [message] })),
			...unreported.map(() => ({ ok: true, errors: undefined })),
		]);
	});
});

describe('`?` after an element of an array pattern (sveltejs/acorn-typescript#130)', () => {
	// Only a parameter can be optional. TypeScript's parser expects a `,` after
	// an array pattern's element; acorn-typescript took the `?` and reported
	// TS2463, a checker error about parameters, for a pattern or rest element,
	// and nothing for a name.
	const sources = [
		'const [a?] = b;',
		'const [{ a }?] = b;',
		'const [...a?] = b;',
		'function f([a?]: number[]) {}',
		'declare function f([a?]: number[]): void;',
		'function f([{ a }?]?: T): void;',
		'for (const [a, b?] of c) {}',
	];

	it('rejects it at the `?` in every mode', async () => {
		const modes = [undefined, { collect: true }, { loose: true }];
		const outcomes = await parse_in_worker(
			sources.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			sources.flatMap((source) => {
				const pos = source.search(/[a-z}]\?[\],]/) + 1;
				return modes.map(() => ({ ok: false, message: `Unexpected token (1:${pos})`, pos }));
			}),
		);
	});

	it('still accepts a `?` after a parameter and in a tuple type', async () => {
		const valid = [
			'function f(a?: number, [b]?: number[]): void;',
			'function f([a, b]: number[], c?: number) {}',
			'type T = [a?: number, b?];',
			'const [a = 1, , ...b] = c;',
		];
		const outcomes = await parse_in_worker(valid.map((source) => ({ source })));

		expect(outcomes).toEqual(valid.map(() => ({ ok: true, errors: undefined })));
	});
});

describe("a repeated modifier's error (sveltejs/acorn-typescript#129)", () => {
	// acorn-typescript raises these at the token after the repeated modifier.
	// TypeScript reports them from its checker (TS1028, TS1030), at the modifier.
	const cases = [
		['class A { private private x = 1; }', 'private x', 'Accessibility modifier already seen.'],
		['class A { public protected x = 1; }', 'protected', 'Accessibility modifier already seen.'],
		['class A { readonly readonly x = 1; }', 'readonly x', "Duplicate modifier: 'readonly'."],
		[
			'class A { constructor(readonly readonly x: number) {} }',
			'readonly x',
			"Duplicate modifier: 'readonly'.",
		],
		['class A { accessor accessor x = 1; }', 'accessor x', "Duplicate modifier: 'accessor'."],
		['type T<in in U> = U;', 'in U', "Duplicate modifier: 'in'."],
		['function f<const const T>() {}', 'const T', "Duplicate modifier: 'const'."],
	];

	it('throws it at the modifier', async () => {
		const outcomes = await parse_in_worker([
			...cases.map(([source]) => ({ source })),
			{ source: 'class A {\n\tpublic readonly readonly x = 1;\n}' },
		]);

		expect(outcomes).toEqual([
			...cases.map(([source, modifier, message]) => {
				const pos = source.indexOf(modifier);
				return { ok: false, message: `${message} (1:${pos})`, pos };
			}),
			{ ok: false, message: "Duplicate modifier: 'readonly'. (2:17)", pos: 27 },
		]);
	});

	it('records it at the modifier when collecting, and keeps the first one', async () => {
		const outcomes = await parse_in_worker_with_ast(
			cases.map(([source]) => ({ source, options: { collect: true } })),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const [source, modifier, message] = cases[index];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			const pos = source.indexOf(modifier);
			expect(outcome.errors, source).toEqual([{ message, pos, end: pos + 1 }]);
		}
		const public_protected = outcomes[1];
		if (!public_protected.ok) throw new Error('public protected threw');
		expect(public_protected.ast.body[0]).toMatchObject({
			body: { body: [{ accessibility: 'public', key: { name: 'x' } }] },
		});
	});
});

describe('`assert` on the line after an import (sveltejs/acorn-typescript#121)', () => {
	/**
	 * @param {AST.Node} node
	 */
	function describeNode(node) {
		if (node.type === 'ExpressionStatement') {
			const call = as_type(node.expression, 'CallExpression');
			return `call ${as_type(call.callee, 'Identifier').name}`;
		}
		const attributes = /** @type {{ attributes?: unknown[] }} */ (node).attributes;
		return attributes?.length ? `${node.type} with ${attributes.length} attribute` : node.type;
	}

	it('reads `assert (…)` after a line break as a call', () => {
		for (const [source, expected] of /** @type {Array<[string, string[]]>} */ ([
			['import "x"\nassert ({ type: "json" });', ['ImportDeclaration', 'call assert']],
			['import a from "x"\nassert(a);', ['ImportDeclaration', 'call assert']],
			['import a from "x" // note\nassert(a);', ['ImportDeclaration', 'call assert']],
			['export * from "x"\nassert(1);', ['ExportAllDeclaration', 'call assert']],
			['export { a } from "x"\nassert(1);', ['ExportNamedDeclaration', 'call assert']],
		])) {
			const { ast, errors } = parse(source);
			expect(errors, source).toEqual([]);
			expect(ast.body.map(describeNode), source).toEqual(expected);
		}
	});

	it('keeps the forms that already parsed', () => {
		for (const [source, expected] of /** @type {Array<[string, string[]]>} */ ([
			['import "x";\nassert ({ type: "json" });', ['ImportDeclaration', 'call assert']],
			['import "x" assert { type: "json" };', ['ImportDeclaration with 1 attribute']],
			['import "x" /* c */ assert { type: "json" };', ['ImportDeclaration with 1 attribute']],
			['import "x" with { type: "json" };', ['ImportDeclaration with 1 attribute']],
			['import "x"\nwith { type: "json" };', ['ImportDeclaration with 1 attribute']],
			[
				'import json from "./a.json" assert { type: "json" }\nassert(json);',
				['ImportDeclaration with 1 attribute', 'call assert'],
			],
			['export * from "x" assert { type: "json" };', ['ExportAllDeclaration with 1 attribute']],
		])) {
			const { ast, errors } = parse(source);
			expect(errors, source).toEqual([]);
			expect(ast.body.map(describeNode), source).toEqual(expected);
		}
	});

	it('rejects `assert { … }` after a line break, as TypeScript does', () => {
		expect(() => parse('import "x"\nassert { type: "json" };')).toThrow('Unexpected token');
	});
});

/**
 * A strict parse, and the two modes that collect errors and keep parsing.
 * @type {Array<import('../../types/index').ParseOptions | undefined>}
 */
const PARSE_MODES = [
	undefined,
	{ collect: true, comments: [], preserveParens: true },
	{ loose: true, comments: [] },
];

/**
 * Each source in each of `PARSE_MODES`.
 * @param {string[]} sources
 */
function in_every_mode(sources) {
	return sources.flatMap((source) => PARSE_MODES.map((options) => ({ source, options })));
}

describe('quoted import attribute keys (sveltejs/acorn-typescript#116)', () => {
	/**
	 * The keys of the first statement's import attributes, as written.
	 * @param {AST.Program} program
	 */
	function attribute_keys(program) {
		const [declaration] = program.body;
		const { attributes } = /** @type {{ attributes: AST.ImportAttribute[] }} */ (
			/** @type {unknown} */ (declaration)
		);
		return attributes.map(({ key }) =>
			key.type === 'Literal' ? `'${key.value}'` : as_type(key, 'Identifier').name,
		);
	}

	it('parses attributes with more than one quoted key', async () => {
		/** @type {Array<[string, string[]]>} */
		const cases = [
			["import a from './a' with { 'a': 'x', 'b': 'y' };", ["'a'", "'b'"]],
			["import './a' with { 'a': 'x', b: 'y', 'c': 'z' };", ["'a'", 'b', "'c'"]],
			["export * from './a' with { 'a': 'x', 'b': 'y' };", ["'a'", "'b'"]],
			["export { a } from './a' with { 'a': 'x', 'b': 'y' };", ["'a'", "'b'"]],
			["import a from './a' assert { 'a': 'x', 'b': 'y' };", ["'a'", "'b'"]],
		];
		const inputs = in_every_mode(cases.map(([source]) => source));

		const outcomes = await parse_in_worker_with_ast(inputs);

		for (const [index, outcome] of outcomes.entries()) {
			const label = JSON.stringify(inputs[index]);
			if (!outcome.ok) throw new Error(`${label} threw ${outcome.message}`);
			expect(outcome.errors ?? [], label).toEqual([]);
			expect(attribute_keys(outcome.ast), label).toEqual(
				cases[Math.floor(index / PARSE_MODES.length)][1],
			);
		}
	});

	it('reports a key written once quoted and once as a name as a duplicate', async () => {
		/** @type {Array<[string, string]>} */
		const cases = [
			[
				"import a from './a' with { type: 'a', 'type': 'b' };",
				'Duplicated key in attributes (1:49)',
			],
			[
				"import a from './a' with { 'type': 'a', type: 'b' };",
				'Duplicated key in attributes (1:49)',
			],
			[
				"import a from './a' with { 'typ\\u0065': 'a', type: 'b' };",
				'Duplicated key in attributes (1:54)',
			],
			["import a from './a' with { 'a': 'x', 'a': 'y' };", 'Duplicated key in attributes (1:45)'],
			["import a from './a' with { type: 'a', type: 'b' };", 'Duplicated key in attributes (1:47)'],
		];
		const inputs = in_every_mode(cases.map(([source]) => source));

		const outcomes = await parse_in_worker(inputs);

		expect(outcomes).toEqual(
			cases.flatMap(([, message]) => [
				{ ok: false, message, pos: expect.any(Number) },
				{ ok: true, errors: ['Duplicated key in attributes'] },
				{ ok: true, errors: ['Duplicated key in attributes'] },
			]),
		);
	});
});

describe('trailing commas in `import()` (sveltejs/acorn-typescript#110)', () => {
	/**
	 * The dynamic import in the first statement, and the source text of its options.
	 * @param {AST.Program} program
	 * @param {string} source
	 */
	function dynamic_import(program, source) {
		const [statement] = program.body;
		const expression = as_type(
			as_type(statement, 'ExpressionStatement').expression,
			'ImportExpression',
		);
		const { options } = expression;
		return {
			expression,
			options: options && source.slice(/** @type {number} */ (options.start), options.end),
		};
	}

	it('allows a trailing comma after the specifier and after the options', async () => {
		/** @type {Array<[string, string | null]>} */
		const cases = [
			["import('./a.js',);", null],
			["import('./a.js', { with: { type: 'json' } },);", "{ with: { type: 'json' } }"],
			["import(\n\t'./a.js',\n\toptions,\n);", 'options'],
			["import.defer('./a.js',);", null],
			["import.defer('./a.js', options,);", 'options'],
			// The forms that already parsed.
			["import('./a.js');", null],
			["import('./a.js', { with: { type: 'json' } });", "{ with: { type: 'json' } }"],
		];
		const inputs = in_every_mode(cases.map(([source]) => source));

		const outcomes = await parse_in_worker_with_ast(inputs);

		for (const [index, outcome] of outcomes.entries()) {
			const { source } = inputs[index];
			const label = JSON.stringify(inputs[index]);
			if (!outcome.ok) throw new Error(`${label} threw ${outcome.message}`);
			expect(outcome.errors ?? [], label).toEqual([]);
			const { expression, options } = dynamic_import(outcome.ast, source);
			expect(options, label).toBe(cases[Math.floor(index / PARSE_MODES.length)][1]);
			expect(as_type(expression.source, 'Literal').value, label).toBe('./a.js');
			expect(expression.phase, label).toBe(source.startsWith('import.defer') ? 'defer' : undefined);
			// The options are only on `options`, as acorn puts them.
			expect(expression, label).not.toHaveProperty('arguments');
		}
	});

	it('rejects a third argument, as acorn does', async () => {
		const sources = [
			"import('./a.js', b, c);",
			"import('./a.js', b, c,);",
			"import.defer('./a.js', b, c);",
			"import('./a.js',,);",
		];

		const outcomes = await parse_in_worker(in_every_mode(sources));

		for (const [index, outcome] of outcomes.entries()) {
			expect(outcome.ok, JSON.stringify(in_every_mode(sources)[index])).toBe(false);
		}
	});

	it('prints the options once', () => {
		/** @type {JsxPlatform} */
		const platform = {
			name: 'upstream-workaround-test',
			imports: {
				fragment: 'test-platform',
				suspense: 'test-platform',
				dynamic: 'test-platform/dynamic',
				errorBoundary: 'test-platform/error-boundary',
			},
			jsx: { rewriteClassAttr: false, classAttrName: 'class' },
			validation: { requireUseServerForAwait: false },
		};
		const source = `export const data = import('./data.json', { with: { type: 'json' } },);
export const bare = import('./a.js',);
export const lazy = import.defer('./lazy.js', { with: { type: 'json' } },);
`;
		const { code } = createJsxTransform(platform)(
			parseModule(source, 'App.tsrx'),
			source,
			'App.tsrx',
		);
		expect(code).toContain(
			"export const data = import('./data.json', { with: { type: 'json' } });",
		);
		expect(code).toContain("export const bare = import('./a.js');");
		expect(code).toContain(
			"export const lazy = import.defer('./lazy.js', { with: { type: 'json' } });",
		);
	});
});
