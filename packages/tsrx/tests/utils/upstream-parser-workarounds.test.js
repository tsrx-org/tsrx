/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */
/** @import { DetailedParseOutcome } from '../shared/parse-in-worker.js' */

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

	it('keeps the error on an element of an array pattern and on a rest parameter', async () => {
		const message =
			'A binding pattern parameter cannot be optional in an implementation signature.';
		const sources = [
			'const [{ a }?] = b;',
			'function f([{ a }?]?: T): void;',
			'function f(...a?: number[]): void;',
		];
		const outcomes = await parse_in_worker(sources.map((source) => ({ source })));

		expect(outcomes.map((outcome) => (outcome.ok ? 'parsed' : outcome.message))).toEqual(
			sources.map((source) => {
				const pos = source.search(/\{ a \}\?|\.\.\./);
				return `${message} (1:${pos})`;
			}),
		);
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
 * Parse each source strictly and when collecting, in a worker that a parse
 * that never returns can't stall.
 * @param {string[]} sources
 */
async function parseBothModes(sources) {
	const outcomes = await parse_in_worker_with_ast(
		sources.flatMap((source) => [
			{ source },
			{ source, options: { collect: true, errors: [], comments: [], preserveParens: true } },
		]),
	);
	return sources.map((source, index) => ({
		source,
		strict: outcomes[2 * index],
		collect: outcomes[2 * index + 1],
	}));
}

/**
 * The program of a parse that returned, with its collected errors' messages.
 * @param {DetailedParseOutcome} outcome
 * @param {string} source
 */
function parsed(outcome, source) {
	if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
	return { ast: outcome.ast, errors: (outcome.errors ?? []).map((error) => error.message) };
}

/**
 * The source text of each of a node's decorators.
 * @param {unknown} node
 * @param {string} source
 */
function decoratorTexts(node, source) {
	const { decorators } = /** @type {{ decorators?: AST.Decorator[] }} */ (node);
	return (decorators ?? []).map((decorator) =>
		source.slice(/** @type {number} */ (decorator.start), /** @type {number} */ (decorator.end)),
	);
}

/**
 * The declaration of the default export that ends `source`.
 * @param {AST.Program} ast
 */
function defaultExported(ast) {
	const exported = ast.body.at(-1);
	assert_type(exported, 'ExportDefaultDeclaration');
	return exported.declaration;
}

describe('anonymous default-exported class with `implements` or `abstract` (sveltejs/acorn-typescript#113)', () => {
	it('parses the class as a declaration without a name', async () => {
		const sources = [
			'export default class implements I {}',
			'export default abstract class {}',
			'export default abstract class implements I {}',
			'export default abstract class extends B {}',
			'export default abstract class<T> {}',
		];
		for (const { source, strict, collect } of await parseBothModes(sources)) {
			for (const outcome of [strict, collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				const declaration = as_type(defaultExported(ast), 'ClassDeclaration');
				expect(declaration.id, source).toBeNull();
				expect(declaration.abstract, source).toBe(source.includes('abstract') || undefined);
				expect(declaration.start, source).toBe('export default '.length);
			}
		}
	});

	it('keeps the type parameters and heritage clauses', async () => {
		const source =
			'export default abstract class<T> extends B implements I, J {\n\tabstract m(): T;\n}';
		const [{ strict }] = await parseBothModes([source]);
		const declaration = as_type(defaultExported(parsed(strict, source).ast), 'ClassDeclaration');
		const params = declaration.typeParameters?.params ?? [];
		expect(params.map((param) => source.slice(param.start, param.end))).toEqual(['T']);
		expect(as_type(declaration.superClass, 'Identifier').name).toBe('B');
		expect(declaration.implements?.length).toBe(2);
		expect(as_type(declaration.body.body[0], 'MethodDefinition').abstract).toBe(true);
	});

	it('still binds the name of a named one', async () => {
		const source = 'export default abstract class A implements I {}\nlet A;';
		const [{ strict, collect }] = await parseBothModes([source]);
		expect(strict.ok).toBe(false);
		const { ast, errors } = parsed(collect, source);
		expect(as_type(ast.body[0], 'ExportDefaultDeclaration').declaration).toMatchObject({
			type: 'ClassDeclaration',
			id: { name: 'A' },
		});
		expect(errors).toEqual(["Identifier 'A' has already been declared"]);
	});

	it('gives a class expression that starts with `implements` a null name', async () => {
		const source = 'const X = class implements I {};';
		const [{ strict }] = await parseBothModes([source]);
		const [statement] = parsed(strict, source).ast.body;
		assert_type(statement, 'VariableDeclaration');
		expect(statement.declarations[0].init).toHaveProperty('id', null);
	});

	it('still rejects `implements` as the name of a class statement', async () => {
		const [{ strict, collect }] = await parseBothModes(['class implements I {}']);
		for (const outcome of [strict, collect]) {
			expect(outcome).toMatchObject({
				ok: false,
				message: "The keyword 'implements' is reserved (1:6)",
			});
		}
	});
});

describe('decorated default-exported class (sveltejs/acorn-typescript#124)', () => {
	it('parses the class as a declaration that starts at its first decorator', async () => {
		const cases = /** @type {Array<[string, string | null, boolean, string[]]>} */ ([
			['export default @dec class B {}', 'B', false, ['@dec']],
			['export default @dec class {}', null, false, ['@dec']],
			['export default @dec abstract class B {}', 'B', true, ['@dec']],
			['export default @dec abstract class {}', null, true, ['@dec']],
			['export default @a @b.c() class implements I {}', null, false, ['@a', '@b.c()']],
			['export default\n@dec\nabstract class<T> extends B {}', null, true, ['@dec']],
		]);
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, [source, name, abstract, decorators]] of cases.entries()) {
			for (const outcome of [outcomes[index].strict, outcomes[index].collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				const declaration = as_type(defaultExported(ast), 'ClassDeclaration');
				expect(declaration.id?.name ?? null, source).toBe(name);
				expect(declaration.abstract ?? false, source).toBe(abstract);
				expect(decoratorTexts(declaration, source), source).toEqual(decorators);
				expect(declaration.start, source).toBe(source.indexOf('@'));
				expect(declaration.end, source).toBe(source.length);
			}
		}
	});

	it('binds the class name and ends the statement, like an undecorated class', async () => {
		const redeclared = 'export default @dec class B {}\nlet B;';
		const followed = 'export default @dec class {}\n(foo)';
		const [binding, statement] = await parseBothModes([redeclared, followed]);
		expect(binding.strict).toMatchObject({ ok: false });
		expect(parsed(binding.collect, redeclared).errors).toEqual([
			"Identifier 'B' has already been declared",
		]);
		expect(parsed(statement.strict, followed).ast.body.map((node) => node.type)).toEqual([
			'ExportDefaultDeclaration',
			'ExpressionStatement',
		]);
	});

	it('keeps a parenthesized class and the at-sign constructs expressions', async () => {
		const cases = [
			['export default (@dec class {});', 'ClassExpression'],
			['export default @if (a) { <div /> };', 'JSXIfExpression'],
			['export default @{ <div /> };', 'JSXCodeBlock'],
			['export default @for (const x of y) { <div /> };', 'JSXForExpression'],
		];
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, [source, type]] of cases.entries()) {
			expect(defaultExported(parsed(outcomes[index].strict, source).ast).type, source).toBe(type);
		}
	});

	it('still rejects decorators before anything but a class', async () => {
		const sources = [
			'export default @dec function f() {}',
			'export default @dec interface I {}',
			'export default @dec 1;',
		];
		for (const { source, strict, collect } of await parseBothModes(sources)) {
			for (const outcome of [strict, collect]) {
				expect(outcome, source).toMatchObject({
					ok: false,
					message: 'Leading decorators must be attached to a class declaration. (1:20)',
				});
			}
		}
	});
});

describe('decorators before `export` (sveltejs/acorn-typescript#125)', () => {
	it('accepts them before an exported class, which takes them', async () => {
		const sources = [
			'@dec export class A {}',
			'@dec export default class {}',
			'@dec export abstract class A {}',
			'@dec export default abstract class {}',
			'@dec export declare class A {}',
			'@dec export declare abstract class A {}',
		];
		for (const { source, strict, collect } of await parseBothModes(sources)) {
			for (const outcome of [strict, collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				const [exported] = ast.body;
				const declaration = /** @type {AST.ExportNamedDeclaration} */ (exported).declaration;
				expect(declaration?.type, source).toBe('ClassDeclaration');
				expect(decoratorTexts(declaration, source), source).toEqual(['@dec']);
			}
		}
	});

	it('gives the class the decorators on both sides of `export default`', async () => {
		const sources = [
			'@a export default @b class {}',
			'@a @c export default @b abstract class B {}',
		];
		for (const { source, strict, collect } of await parseBothModes(sources)) {
			for (const outcome of [strict, collect]) {
				const declaration = defaultExported(parsed(outcome, source).ast);
				expect(declaration.type, source).toBe('ClassDeclaration');
				expect(decoratorTexts(declaration, source), source).toEqual(
					source.startsWith('@a @c') ? ['@a', '@c', '@b'] : ['@a', '@b'],
				);
				expect(declaration.start, source).toBe(0);
			}
		}
	});

	it('keeps the range of a class decorated before `export`', async () => {
		const source = '@dec export default class {}';
		const [{ strict }] = await parseBothModes([source]);
		const [exported] = parsed(strict, source).ast.body;
		assert_type(exported, 'ExportDefaultDeclaration');
		expect([exported.start, exported.declaration.start]).toEqual([5, 0]);
	});

	it('rejects them before any other export, at the exported declaration', async () => {
		const cases = /** @type {Array<[string, string]>} */ ([
			['@dec export default (class {});', '(class'],
			['@dec export const A = class {};', 'const'],
			['@dec export function f() {}', 'function'],
			['@dec export default function f() {}', 'function'],
			['@dec export default 1;', '1'],
			['@dec export interface I {}', 'interface'],
			['@dec export { a };', '{ a }'],
			['@dec export default abstract;', 'abstract'],
			// At-sign constructs aren't decorators, so they don't take the ones
			// before `export` either (a class after them would).
			['@dec export default @if (a) { <div /> };\nclass A {}', '@if'],
			['@dec export default @{ <div /> };\nclass A {}', '@{'],
			['@dec export @if (a) { <div /> };', '@if'],
		]);
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, [source, declaration]] of cases.entries()) {
			const column = source.indexOf(declaration);
			for (const outcome of [outcomes[index].strict, outcomes[index].collect]) {
				expect(outcome, source).toMatchObject({
					ok: false,
					message: `Leading decorators must be attached to a class declaration. (1:${column})`,
					pos: column,
				});
			}
		}
	});
});

describe('decorators on a rest parameter (sveltejs/acorn-typescript#126)', () => {
	/**
	 * The parameters of the only function or class method in `ast`.
	 * @param {AST.Program} ast
	 */
	function parameters(ast) {
		const [statement] = ast.body;
		if (statement.type === 'ClassDeclaration') {
			return as_type(statement.body.body[0], 'MethodDefinition').value.params;
		}
		return /** @type {AST.FunctionDeclaration} */ (statement).params;
	}

	it('hangs them off the rest element, which starts at `...`', async () => {
		const cases = /** @type {Array<[string, string[]]>} */ ([
			['class A {\n\tm(@a ...rest: unknown[]) {}\n}', ['@a']],
			['class A {\n\tconstructor(@a @b.c() ...[x, y]: unknown[]) {}\n}', ['@a', '@b.c()']],
			['declare class A {\n\tm(@a ...rest: unknown[]): void;\n}', ['@a']],
			['function f(@a ...rest: unknown[]) {}', ['@a']],
		]);
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, [source, decorators]] of cases.entries()) {
			for (const outcome of [outcomes[index].strict, outcomes[index].collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				const rest = as_type(parameters(ast).at(-1), 'RestElement');
				expect(decoratorTexts(rest, source), source).toEqual(decorators);
				expect(rest.start, source).toBe(source.indexOf('...'));
				expect(source.slice(rest.start, rest.end), source).toMatch(/: unknown\[\]$/);
			}
		}
	});

	it('keeps the decorators of the other parameters where they were', async () => {
		const source =
			'class A {\n\tconstructor(@a x: number, @b private y = 1, @c ...rest: unknown[]) {}\n}';
		const [{ strict }] = await parseBothModes([source]);
		const [x, y, rest] = parameters(parsed(strict, source).ast);
		expect(decoratorTexts(x, source)).toEqual(['@a']);
		const property = as_type(y, 'TSParameterProperty');
		expect(decoratorTexts(property.parameter, source)).toEqual(['@b']);
		expect(decoratorTexts(rest, source)).toEqual(['@c']);
	});

	it('reports a comma after it like one after an undecorated rest parameter', async () => {
		const decorated = 'function f(@a ...rest, b) {}';
		const plain = 'function f(...rest, b) {}';
		const ambient = 'declare function f(@a ...rest: number[],): void;';
		const [withDecorator, without, trailing] = await parseBothModes([decorated, plain, ambient]);
		for (const [{ source, strict, collect }, comma] of /** @type {const} */ ([
			[withDecorator, decorated.indexOf(', b')],
			[without, plain.indexOf(', b')],
		])) {
			expect(strict, source).toMatchObject({
				ok: false,
				message: `Comma is not permitted after the rest element (1:${comma})`,
			});
			const { ast, errors } = parsed(collect, source);
			expect(errors, source).toEqual(['Comma is not permitted after the rest element']);
			expect(
				parameters(ast).map((param) => param.type),
				source,
			).toEqual(['RestElement', 'Identifier']);
		}
		for (const outcome of [trailing.strict, trailing.collect]) {
			expect(parsed(outcome, ambient).errors).toEqual([]);
		}
	});

	it('reports the errors inside it where it reports them without the decorator', async () => {
		// Each pair differs only by `@a `, so the errors move by its length.
		const pairs = [
			['class A {\n\tm(@a ...rest?: any[]) {}\n}', 'class A {\n\tm(...rest?: any[]) {}\n}'],
			['class A {\n\tm(@a ...[b, b]: any[]) {}\n}', 'class A {\n\tm(...[b, b]: any[]) {}\n}'],
			['class A {\n\tm(@a ...rest = []) {}\n}', 'class A {\n\tm(...rest = []) {}\n}'],
		];
		const outcomes = await parseBothModes(pairs.flat());
		/**
		 * @param {DetailedParseOutcome} outcome
		 * @param {number} shift
		 */
		const errorsOf = (outcome, shift) =>
			outcome.ok
				? (outcome.errors ?? []).map((error) => [error.message, (error.pos ?? 0) - shift])
				: [outcome.message.replace(/ \(\d+:\d+\)$/, ''), (outcome.pos ?? 0) - shift];
		for (const [index, [decorated, plain]] of pairs.entries()) {
			const [withDecorator, without] = [outcomes[2 * index], outcomes[2 * index + 1]];
			for (const mode of /** @type {const} */ (['strict', 'collect'])) {
				expect(errorsOf(withDecorator[mode], '@a '.length), `${decorated} (${mode})`).toEqual(
					errorsOf(without[mode], 0),
				);
			}
			expect(errorsOf(without.collect, 0), plain).not.toEqual([]);
		}
	});

	it('still rejects `...` after decorators in an array pattern', async () => {
		for (const { source, strict, collect } of await parseBothModes([
			'const [@a ...x] = y;',
			'function f([@a ...x]) {}',
		])) {
			for (const outcome of [strict, collect]) {
				expect(outcome, source).toMatchObject({ ok: false, pos: source.indexOf('...') });
			}
		}
	});

	it('keeps an optional decorated pattern parameter in an overload', async () => {
		const source = 'class A {\n\tm(@a { b }?: T): void;\n\tm() {}\n}';
		const [{ strict, collect }] = await parseBothModes([source]);
		for (const outcome of [strict, collect]) {
			const { ast, errors } = parsed(outcome, source);
			expect(errors).toEqual([]);
			const [pattern] = parameters(ast);
			expect(pattern).toMatchObject({ type: 'ObjectPattern', optional: true });
			expect(decoratorTexts(pattern, source)).toEqual(['@a']);
		}
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

describe('`@` after `yield` (sveltejs/acorn-typescript#128)', () => {
	/**
	 * The first `yield` in `value`, depth first.
	 * @param {unknown} value
	 * @returns {AST.YieldExpression | undefined}
	 */
	function find_yield(value) {
		if (!value || typeof value !== 'object') return undefined;
		const node = /** @type {Record<string, unknown>} */ (value);
		if (node.type === 'YieldExpression') return /** @type {AST.YieldExpression} */ (value);
		for (const [key, child] of Object.entries(node)) {
			if (key === 'loc' || key === 'metadata') continue;
			const found = Array.isArray(child) ? child.map(find_yield).find(Boolean) : find_yield(child);
			if (found) return found;
		}
		return undefined;
	}

	it('takes a decorated class as the argument of `yield`', () => {
		/** @type {Array<[source: string, name: string | null]>} */
		const cases = [
			['function* g() { yield @dec class {}; }', null],
			['function* g() { f(yield @dec class {}); }', null],
			['function* g() { yield /* c */ @dec class A {} }', 'A'],
		];
		for (const [source, name] of cases) {
			const { ast, errors } = parse(source);
			expect(errors).toEqual([]);
			const yielded = as_type(find_yield(ast), 'YieldExpression');
			expect(yielded.delegate).toBe(false);
			const argument = as_type(yielded.argument, 'ClassExpression');
			expect(argument.id?.name ?? null).toBe(name);
			expect(
				/** @type {{ decorators: Array<{ expression: AST.Identifier }> }} */ (
					/** @type {unknown} */ (argument)
				).decorators.map((decorator) => decorator.expression.name),
			).toEqual(['dec']);
		}
	});

	it('ends `yield` at a line break before the `@`', () => {
		const { ast, errors } = parse('function* g() {\n  yield\n  @dec class A {}\n}');
		expect(errors).toEqual([]);
		const body = as_type(as_type(ast.body[0], 'FunctionDeclaration').body, 'BlockStatement').body;
		expect(body.map((statement) => statement.type)).toEqual([
			'ExpressionStatement',
			'ClassDeclaration',
		]);
		const yielded = as_type(as_type(body[0], 'ExpressionStatement').expression, 'YieldExpression');
		expect(yielded.argument).toBe(null);
	});
});
