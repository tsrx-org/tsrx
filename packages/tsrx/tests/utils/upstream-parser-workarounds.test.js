/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */
/** @import { DetailedParseOutcome } from '../shared/parse-in-worker.js' */

import { describe, expect, it } from 'vitest';
import { acorn, createJsxTransform, parseModule } from '../../src/index.js';
import { as_type, assert_type } from '../shared/node-types.js';
import { parse_in_worker, parse_in_worker_with_ast } from '../shared/parse-in-worker.js';

/**
 * Bugs in @sveltejs/acorn-typescript, and one in acorn, that the TSRX parser
 * works around by overriding one method each in `TSRXPlugin`. Each override is
 * marked `UPSTREAM(sveltejs/acorn-typescript#<n>)` or `UPSTREAM(acornjs/acorn#<n>)`
 * in `src/plugin.js`; when a release includes the upstream fix, the override
 * goes and these tests stay.
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

	it('accepts it in a function type and a type member, in every mode', async () => {
		// `tsParseBindingListForSignature` reads these, in every mode since #705.
		const types = [
			'type F = ({ a }?: { a: number }) => void;',
			'type G = new ([a]?: number[]) => object;',
			`interface I {
	m({ a }?: { a: number }): void;
	([a]?: number[]): void;
	new ({ a }?: { a: number }): I;
}`,
		];
		const modes = [undefined, { collect: true, preserveParens: true }, { loose: true }];
		const outcomes = await parse_in_worker_with_ast(
			types.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const source = types[Math.floor(index / modes.length)];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			expect(outcome.errors ?? [], source).toEqual([]);
			const text = JSON.stringify(outcome.ast);
			const patterns = text.match(/"type":"(?:Object|Array)Pattern"/g);
			expect(patterns?.length, source).toBe(source.split('?').length - 1);
			expect(text.match(/"optional":true/g)?.length, source).toBe(patterns?.length);
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
			// An arrow function always has a body.
			'const f = ({ a }?: { a: number }) => a;',
			'const f = async (x, [a]?: number[]) => a;',
			'export const App = ({ a }?: { a: number }) => @{ <div /> };',
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
			// An arrow function's parameters are read as expressions.
			'const f = (...a?: number[]) => a;',
			'const f = (x, ...[a] /* rest */ ?) => a;',
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

describe('a parameter property modifier outside a constructor (sveltejs/acorn-typescript#136)', () => {
	// TypeScript's parser reads the modifiers before any parameter, and its
	// checker reports TS2369 outside a constructor. acorn-typescript reads a
	// function's or a signature's parameters without them, and acorn reads an
	// arrow function's as expressions, so `public` failed as a reserved word and
	// the name after `readonly` was unexpected. acorn-typescript's own error for
	// them is raised at the modifier's column. When collecting, it's recorded at
	// the first modifier.
	const message = 'A parameter property is only allowed in a constructor implementation.';
	/** @type {Array<[source: string, modifiers: string[]]>} */
	const cases = [
		['function f(public x: number) {}', ['public x']],
		['function f(a: number, protected override b: number) {}', ['protected']],
		[
			'const g = function (\n\tprivate x: number,\n\treadonly y: number,\n) {};',
			['private', 'readonly'],
		],
		['declare function h(public x?: number): void;', ['public']],
		['function f(@dec readonly x: number) {}', ['readonly']],
		// A signature's parameters (#664), which `tsParseBindingListForSignature`
		// reads.
		['type F = (a: string, public x: number) => void;', ['public']],
		['type C = new (readonly x: number) => object;', ['readonly']],
		[
			'interface I {\n\tm(private x: number): void;\n\tnew (\n\t\toverride y: number,\n\t): I;\n}',
			['private', 'override'],
		],
		// An arrow function's parameters (#663), which acorn reads as expressions.
		['const f = (a, protected override b: number) => a;', ['protected']],
		[
			'const g = async (\n\tprivate x: number,\n\treadonly y: number,\n) => x;',
			['private', 'readonly'],
		],
		['const h = async <T,>(public x: T) => x;', ['public']],
	];

	it('records it at the first modifier when collecting', async () => {
		const outcomes = await parse_in_worker_with_ast(
			cases.map(([source]) => ({ source, options: { collect: true } })),
		);

		expect(outcomes.map((outcome) => (outcome.ok ? outcome.errors : outcome.message))).toEqual(
			cases.map(([source, modifiers]) =>
				modifiers.map((modifier) => {
					const pos = source.indexOf(modifier);
					return { message, pos, end: pos + 1 };
				}),
			),
		);
	});

	it("leaves a method's parameters alone", async () => {
		// acorn-typescript reads modifiers there and reports nothing, leaving TS2369
		// to TypeScript.
		const sources = [
			'class A { m(public x: number) {} }',
			'const o = { m(readonly x: number) {} };',
			'class A { constructor(private x: number) {} }',
		];
		const outcomes = await parse_in_worker(
			sources.map((source) => ({ source, options: { collect: true } })),
		);

		expect(outcomes).toEqual(sources.map(() => ({ ok: true, errors: [] })));
	});
});

describe('a parameter property with a pattern and a default (sveltejs/acorn-typescript#138)', () => {
	// acorn-typescript rejects a parameter property with a binding pattern
	// (TS1187), but not one with a default, whose output then keeps the pattern
	// after the modifier. TypeScript's checker reports both.
	const message = 'A parameter property may not be declared using a binding pattern.';
	const sources = [
		'class A { constructor(public [a] = [1]) {} }',
		'class A { constructor(readonly { a } = { a: 1 }) {} }',
		'class A { constructor(private [a]: number[] = [1]) {} }',
		'class A { constructor(@dec protected { a }: { a: number } = { a: 1 }) {} }',
		// acorn-typescript reads the modifiers on a method's parameters too.
		'class A { m(override [a] = [1]) {} }',
	];
	const modifier = /public|readonly|private|protected|override/;

	it('throws it at the modifier', async () => {
		const outcomes = await parse_in_worker(sources.map((source) => ({ source })));

		expect(outcomes).toEqual(
			sources.map((source) => {
				const pos = source.search(modifier);
				return { ok: false, message: `${message} (1:${pos})`, pos };
			}),
		);
	});

	it('records it at the modifier when collecting, and keeps the default', async () => {
		const outcomes = await parse_in_worker_with_ast(
			sources.map((source) => ({ source, options: { collect: true } })),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const source = sources[index];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			const pos = source.search(modifier);
			expect(outcome.errors, source).toEqual([{ message, pos, end: pos + 1 }]);
			const method = as_type(
				as_type(outcome.ast.body[0], 'ClassDeclaration').body.body[0],
				'MethodDefinition',
			);
			expect(method.value.params[0], source).toMatchObject({
				type: 'TSParameterProperty',
				parameter: { type: 'AssignmentPattern', left: { type: /^(?:Array|Object)Pattern$/ } },
			});
		}
	});

	it('still accepts a default after a name', async () => {
		const valid = ['class A { constructor(public x = 1, readonly y: number[] = [1]) {} }'];
		const outcomes = await parse_in_worker(valid.map((source) => ({ source })));

		expect(outcomes).toEqual(valid.map(() => ({ ok: true, errors: undefined })));
	});
});

describe("a parameter property modifier before a function type's first parameter (sveltejs/acorn-typescript#139)", () => {
	// TypeScript's lookahead for a function type skips modifiers before the
	// first parameter; acorn-typescript's took the token after the modifier for
	// the one after the parameter's name, and read a parenthesized type. When
	// collecting, the type is a function type, and TS2369 is recorded (#136).
	const message = 'A parameter property is only allowed in a constructor implementation.';
	const sources = [
		'type F = (public x: number) => void;',
		'type F = (readonly [a]: number[]) => void;',
		'type F = (private readonly x?) => void;',
		'let f: (override { a }: { a: number }, b: string) => void;',
	];

	it('reads a function type when collecting', async () => {
		const outcomes = await parse_in_worker_with_ast(
			sources.map((source) => ({ source, options: { collect: true } })),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const source = sources[index];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			const pos = source.indexOf('(') + 1;
			expect(outcome.errors?.[0], source).toEqual({ message, pos, end: pos + 1 });
			expect(JSON.stringify(outcome.ast), source).toContain('"type":"TSFunctionType"');
		}
	});

	it('still fails after the modifier without collecting', async () => {
		const outcomes = await parse_in_worker([{ source: sources[0] }]);

		expect(outcomes).toEqual([{ ok: false, message: 'Unexpected token (1:17)', pos: 17 }]);
	});

	it('still reads a parenthesized type', async () => {
		const valid = [
			'type P = (readonly [string]);',
			'type Q = (readonly string[]) | (readonly [a: number]);',
			'type R = (readonly: number) => void;',
		];
		const outcomes = await parse_in_worker_with_ast(
			valid.map((source) => ({ source, options: { collect: true } })),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const source = valid[index];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			expect(outcome.errors, source).toEqual([]);
			const text = JSON.stringify(outcome.ast);
			if (index < 2) expect(text, source).not.toContain('TSFunctionType');
			expect(text, source).not.toContain('TSParameterProperty');
		}
	});
});

/**
 * acorn's `line:column` for a position in `source`.
 * @param {string} source
 * @param {number} pos
 */
function line_column(source, pos) {
	const lines = source.slice(0, pos).split('\n');
	return `${lines.length}:${lines[lines.length - 1].length}`;
}

/**
 * The parameters of the first arrow function in `node`.
 * @param {unknown} node
 * @returns {unknown[] | undefined}
 */
function first_arrow_parameters(node) {
	if (!node || typeof node !== 'object') return undefined;
	const object = /** @type {{ type?: unknown, params?: unknown[] }} */ (node);
	if (object.type === 'ArrowFunctionExpression') return object.params;
	for (const [key, value] of Object.entries(object)) {
		if (key === 'metadata' || key === 'loc') continue;
		const params = first_arrow_parameters(value);
		if (params) return params;
	}
	return undefined;
}

describe("an async arrow function's optional rest parameter (sveltejs/acorn-typescript#140)", () => {
	// acorn reads an async arrow function's parameters as the arguments of
	// `async (…)`. acorn-typescript read a type annotation after a spread there,
	// but not a `?`, so the parameter failed to parse in every mode. TypeScript's
	// parser reads it, and its checker reports TS1047 at the `?`, as for any
	// other rest parameter.
	const message = 'A rest parameter cannot be optional.';
	const sources = [
		'const f = async (...a?: number[]) => a;',
		'const g = async (x, ...rest?) => x;',
		`const h = async (
	x: number,
	...rest?: string[]
): Promise<number> => x;`,
		`export function App() @{
	const k = async (...a?: string[]) => a;
	<div>{String(k)}</div>
}`,
	];

	it('records TS1047 at the `?` when collecting, and keeps the parameter', async () => {
		const outcomes = await parse_in_worker_with_ast(
			sources.flatMap((source) =>
				[{ collect: true, preserveParens: true }, { loose: true }].map((options) => ({
					source,
					options,
				})),
			),
		);

		for (const [index, outcome] of outcomes.entries()) {
			const source = sources[Math.floor(index / 2)];
			if (!outcome.ok) throw new Error(`${JSON.stringify(source)} threw ${outcome.message}`);
			const pos = source.indexOf('?');
			expect(outcome.errors, source).toEqual([{ message, pos, end: pos + 1 }]);
			expect(first_arrow_parameters(outcome.ast)?.at(-1), source).toMatchObject({
				type: 'RestElement',
				argument: { type: 'Identifier' },
				optional: true,
			});
		}
	});

	it('throws it without collecting', async () => {
		const outcomes = await parse_in_worker(sources.map((source) => ({ source })));

		expect(outcomes).toEqual(
			sources.map((source) => {
				const pos = source.indexOf('?');
				return { ok: false, message: `${message} (${line_column(source, pos)})`, pos };
			}),
		);
	});

	it('still fails at a `?` after a spread where no `=>` follows', async () => {
		const failing = [
			'async(...a?);',
			'async(...a?: number[]);',
			'f(...a?);',
			'async(x, ...a?)\n=> x;',
			// Only the arguments of `async (…)` themselves.
			'async(f(...b?)) => 1;',
			'async([...b?]) => 1;',
		];
		const modes = [undefined, { collect: true, preserveParens: true }, { loose: true }];
		const outcomes = await parse_in_worker(
			failing.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			failing.flatMap((source) =>
				modes.map(() => {
					const pos = source.indexOf('?');
					return { ok: false, message: `Unexpected token (1:${pos})`, pos };
				}),
			),
		);
	});
});

describe('a syntax error in a generic arrow function (sveltejs/acorn-typescript#141)', () => {
	// acorn-typescript reads an expression that starts with `<` as an element,
	// then as a generic arrow function, and when both failed it threw the
	// element's error. It reads `async <T,>(…) => …` in a `tsTryParseAndCatch`
	// that took any error to mean "not an arrow function". So an error in the
	// arrow function's parameters or body was reported as `Unexpected token` at
	// its type parameters, or after them. Once the arrow function is read past
	// its `=>`, its own error is reported, where TypeScript reports it.
	/** @type {Array<[source: string, message: string, at: string]>} */
	const syntax_errors = [
		['const f = <T,>(x: T) => { x = ; };', 'Unexpected token', '; }'],
		['const g = async <T,>(x: T) => { x = ; };', 'Unexpected token', '; }'],
		[
			`export function App() @{
	const h = <T,>(x: T) => x +;
	<div />
}`,
			'Unexpected token',
			';\n',
		],
		['const i = <T,>() => <U,>(y: U) => { y = ; };', 'Unexpected token', '; }'],
		['const j = async <T,>() => async <U,>(y: U) => { await ; };', 'Unexpected token', '; }'],
		['const k = <div>{<T,>(x: T) => { x = ; }}</div>;', 'Unexpected token', '; }'],
		// A type assertion in its parameters (sveltejs/acorn-typescript#142).
		['const l = <T,>(x as T) => x;', 'Unexpected type cast in parameter position.', 'x as'],
	];

	it("throws the arrow function's syntax error in every mode", async () => {
		const modes = [undefined, { collect: true, preserveParens: true }, { loose: true }];
		const outcomes = await parse_in_worker(
			syntax_errors.flatMap(([source]) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			syntax_errors.flatMap(([source, message, at]) =>
				modes.map(() => {
					const pos = source.indexOf(at);
					return { ok: false, message: `${message} (${line_column(source, pos)})`, pos };
				}),
			),
		);
	});

	it('throws the checker errors it reports on the parameters without collecting', async () => {
		/** @type {Array<[source: string, message: string, at: string]>} */
		const checker_errors = [
			[
				'const a = <T,>({ a }?: T) => a;',
				'A binding pattern parameter cannot be optional in an implementation signature.',
				'{ a }',
			],
			['const b = <T,>(...a?: T[]) => a;', 'A rest parameter cannot be optional.', '?:'],
			[
				'const c = async <T,>([a]?: T[]) => a;',
				'A binding pattern parameter cannot be optional in an implementation signature.',
				'[a]',
			],
			['const d = async <T,>(x, ...a?: T[]) => a;', 'A rest parameter cannot be optional.', '?:'],
		];
		const outcomes = await parse_in_worker([
			...checker_errors.map(([source]) => ({ source })),
			...checker_errors.map(([source]) => ({ source, options: { collect: true } })),
		]);

		expect(outcomes).toEqual([
			...checker_errors.map(([source, message, at]) => {
				const pos = source.indexOf(at);
				return { ok: false, message: `${message} (1:${pos})`, pos };
			}),
			...checker_errors.map(([, message]) => ({ ok: true, errors: [message] })),
		]);
	});

	it('still reads generic arrow functions, elements, and comparisons', async () => {
		const valid = [
			'const f = <T,>(x: T) => x;',
			'const g = async <T,>(x: T): Promise<T> => x;',
			'const h = <T extends object>(x: T) => x;',
			'const i = <const T,>(x: T) => x;',
			'const j = <div>{(x: number) => x}</div>;',
			'const k = async<T>(x);',
			'const l = a < b > c;',
		];
		const outcomes = await parse_in_worker(valid.map((source) => ({ source })));

		expect(outcomes).toEqual(valid.map(() => ({ ok: true, errors: undefined })));
	});
});

describe("a type assertion in an arrow function's parameters (sveltejs/acorn-typescript#142)", () => {
	// TypeScript's parser doesn't read a type assertion as an arrow function's
	// parameter, and fails (TS1005). acorn reads the parameters as expressions,
	// and acorn-typescript's `toAssignable` accepted an assertion in them, so the
	// parameter kept it, and the output did too. It's @babel/parser's
	// `Unexpected type cast in parameter position.` now, in every mode.
	const message = 'Unexpected type cast in parameter position.';
	/** @type {Array<[source: string, at: string]>} */
	const cases = [
		['export const f = (x as number) => x;', 'x as'],
		['export const g = (x!) => x;', 'x!'],
		['export const h = async ([a satisfies number]) => a;', 'a satisfies'],
		['export const i = async (x!) => x;', 'x!'],
		['export const j = ({ a: b as string }) => b;', 'b as'],
		// A pattern that a default made a pattern already.
		['export const k = ([b as string] = []) => b;', 'b as'],
		['export const l = (x!: number) => x;', 'x!'],
		[
			`export const App = (
	props as { name: string },
) => @{
	<div>{props.name}</div>
};`,
			'props as',
		],
	];

	it('throws it at the assertion in every mode', async () => {
		const modes = [undefined, { collect: true, preserveParens: true }, { loose: true }];
		const outcomes = await parse_in_worker(
			cases.flatMap(([source]) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			cases.flatMap(([source, at]) =>
				modes.map(() => {
					const pos = source.indexOf(at);
					return { ok: false, message: `${message} (${line_column(source, pos)})`, pos };
				}),
			),
		);
	});

	it('still reads a type assertion in an assignment target or an expression', async () => {
		const valid = [
			'let x; (x as number) = 1;',
			'let a, b; [a as number, b!] = [1, 2];',
			'let o; [{ a: o } as { a: unknown }] = [];',
			'let b; ({ a: b! } = { a: 1 });',
			'export const f = (x = 1 as number) => x;',
			'export const g = ({ [String(1) as string]: v }) => v;',
			'export const h = (x as number);',
		];
		const modes = [undefined, { collect: true, preserveParens: true }];
		const outcomes = await parse_in_worker(
			valid.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			valid.flatMap(() => [
				{ ok: true, errors: undefined },
				{ ok: true, errors: [] },
			]),
		);
	});
});

describe('a call after `async (…)` followed by `=>` (acornjs/acorn#1460)', () => {
	// acorn's `parseSubscripts` works out once, for the `async` identifier,
	// whether a call can be an async arrow function's head, and passed that to
	// every subscript. So `async(a)(b) => 1` was an async arrow function with
	// `b` for its parameter, and `async (b) => 1` was its output. Only the call
	// right after `async` can be one, as in TypeScript, which fails at the `=>`.
	const failing = [
		'export const k = async(a)(b) => 1;',
		'export const m = async(a)[0](b) => 1;',
		'export const n = async(a)`t`(b) => 1;',
		'export const o = async!(a) => 1;',
		'export const p = async<T>(a)(b) => 1;',
	];

	it('throws at the `=>` in every mode', async () => {
		const modes = [undefined, { collect: true, preserveParens: true }, { loose: true }];
		const outcomes = await parse_in_worker(
			failing.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			failing.flatMap((source) =>
				modes.map(() => {
					const pos = source.indexOf('=>');
					return { ok: false, message: `Unexpected token (1:${pos})`, pos };
				}),
			),
		);
	});

	it('still reads async arrow functions and calls of `async`', async () => {
		const outcomes = await parse_in_worker_with_ast(
			[
				'export const f = async(a) => 1;',
				'export const g = async (a, ...b) => 1;',
				'export const h = async(a)(b)((c) => 1);',
			].map((source) => ({ source })),
		);

		const inits = outcomes.map((outcome) => {
			if (!outcome.ok) throw new Error(outcome.message);
			const declaration = as_type(outcome.ast.body[0], 'ExportNamedDeclaration').declaration;
			return as_type(/** @type {AST.Node} */ (declaration), 'VariableDeclaration').declarations[0]
				.init;
		});
		expect(inits).toMatchObject([
			{ type: 'ArrowFunctionExpression', async: true, params: [{ name: 'a' }] },
			{
				type: 'ArrowFunctionExpression',
				async: true,
				params: [{ name: 'a' }, { type: 'RestElement' }],
			},
			{
				type: 'CallExpression',
				callee: {
					type: 'CallExpression',
					callee: { type: 'CallExpression', callee: { name: 'async' }, arguments: [{ name: 'a' }] },
					arguments: [{ name: 'b' }],
				},
				arguments: [{ type: 'ArrowFunctionExpression', async: false }],
			},
		]);
	});
});

describe('decorators on an object literal member (sveltejs/acorn-typescript#135)', () => {
	// TypeScript's parser expects a property at the `@` (TS1136), as acorn does
	// in an object pattern. acorn-typescript took the decorators and hung them
	// off the property, which the output left out.
	const sources = [
		'const o = { @dec m() {} };',
		'const o = { a: 1, @dec b: 2 };',
		'const o = { @dec get x() { return 1; } };',
		'const o = { @a @b() [c]: 1 };',
		'f({ @dec a });',
		// acorn-typescript failed at the `...`, after the decorators.
		'const o = { @dec ...s };',
		'const { @dec a } = b;',
	];
	const modes = [undefined, { collect: true }, { loose: true }];

	it('throws at the `@` in every mode', async () => {
		const outcomes = await parse_in_worker(
			[...sources, 'const o = {\n\ta: 1,\n\t@dec b() {},\n};'].flatMap((source) =>
				modes.map((options) => ({ source, options })),
			),
		);

		expect(outcomes).toEqual([
			...sources.flatMap((source) => {
				const pos = source.indexOf('@');
				return modes.map(() => ({ ok: false, message: `Unexpected token (1:${pos})`, pos }));
			}),
			...modes.map(() => ({ ok: false, message: 'Unexpected token (3:1)', pos: 20 })),
		]);
	});

	it('still takes decorators on a class member and on a class that is a value', async () => {
		const valid = ['class A { @dec m() {} }', 'const o = { A: @dec class {} };'];
		const outcomes = await parse_in_worker(
			valid.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes.map((outcome) => outcome.ok)).toEqual(
			valid.flatMap(() => modes.map(() => true)),
		);
	});
});

describe('a closing tag where an expression starts (sveltejs/acorn-typescript#134)', () => {
	// When the element attempt fails, `parseMaybeAssign` drops the two contexts
	// the tag start pushed and tries a generic arrow from the same `<`. That
	// attempt reads the `/` again, and `updateContext` dropped the two contexts a
	// second time, below the start of the stack at the top of a statement, so a
	// `RangeError: Invalid array length` replaced the syntax error. TypeScript
	// expects an expression at the `<` (TS1109).
	const sources = [
		'x = </>;',
		'x = </a>;',
		'export default </>;',
		'const a = </>;',
		'a = </>',
		'[</>];',
		'x = y ? </> : 1;',
		'x = (</>);',
		'f(</>);',
	];
	const modes = [undefined, { collect: true }, { loose: true }];

	it('reports a syntax error at the `<` in every mode', async () => {
		const outcomes = await parse_in_worker(
			sources.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			sources.flatMap((source) => {
				const pos = source.indexOf('<');
				return modes.map(() => ({ ok: false, message: `Unexpected token (1:${pos})`, pos }));
			}),
		);
	});

	it('still reads a generic arrow and an element where an expression starts', async () => {
		const valid = [
			'x = <T,>() => 1;',
			'x = <T extends U>(a: T) => a;',
			'x = <a></a>;',
			'x = <>a</>;',
		];
		const outcomes = await parse_in_worker(
			valid.flatMap((source) => modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			valid.flatMap(() => modes.map((options) => ({ ok: true, errors: options && [] }))),
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
		const message = 'Leading decorators must be attached to a class declaration.';
		// When collecting, TypeScript's checker error before another declaration
		// is recorded at the decorators instead (TS1206).
		const declarations = [
			'export default @dec function f() {}',
			'export default @dec interface I {}',
		];
		const expression = 'export default @dec 1;';
		const outcomes = await parseBothModes([...declarations, expression]);
		for (const { source, strict } of outcomes) {
			expect(strict, source).toMatchObject({ ok: false, message: `${message} (1:20)` });
		}
		for (const { source, collect } of outcomes.slice(0, declarations.length)) {
			expect(collect, source).toMatchObject({ ok: true, errors: [{ message, pos: 15 }] });
			const declaration = defaultExported(parsed(collect, source).ast);
			expect(decoratorTexts(declaration, source), source).toEqual([]);
		}
		expect(outcomes.at(-1)?.collect, expression).toMatchObject({
			ok: false,
			message: `${message} (1:20)`,
		});
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

	it('rejects them before any other export, at the exported declaration, or records them when collecting', async () => {
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
		const message = 'Leading decorators must be attached to a class declaration.';
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, [source, declaration]] of cases.entries()) {
			const { strict, collect } = outcomes[index];
			const column = source.indexOf(declaration);
			const thrown = { ok: false, message: `${message} (1:${column})`, pos: column };
			expect(strict, source).toMatchObject(thrown);
			// When collecting, the error before an export is recorded at the
			// decorators instead, as TypeScript reports it from its checker
			// (TS1206), and no class takes them. An at-sign construct is no
			// declaration, so the error is still thrown there.
			if (/@if|@\{/.test(declaration)) {
				expect(collect, source).toMatchObject(thrown);
			} else {
				const { ast, errors } = parsed(collect, source);
				expect(errors[0], source).toBe(message);
				expect(JSON.stringify(ast), source).not.toContain('"Decorator"');
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

describe('decorators in an array pattern (sveltejs/acorn-typescript#133)', () => {
	it('rejects them at the `@`, as in an object pattern', async () => {
		/** @type {Array<[source: string, decorator: string]>} */
		const cases = [
			['const [@a x] = y;', '@a'],
			['const [@a x = 1] = y;', '@a'],
			['const [@a [x]] = y;', '@a'],
			['const [a, @b c] = d;', '@b'],
			['const [[@a x]] = y;', '@a'],
			['const [@a ...x] = y;', '@a'],
			['function f([@a x]) {}', '@a'],
			['function f([@a ...x]) {}', '@a'],
			['function f({ a: [@b c] }) {}', '@b'],
			['for (const [@a x] of y) {}', '@a'],
			['try {} catch ([@a x]) {}', '@a'],
			['class A {\n\tconstructor(@a [@b x]: T) {}\n}', '@b'],
			['const { a: @d b } = c;', '@d'],
		];
		const outcomes = await parse_in_worker(in_every_mode(cases.map(([source]) => source)));
		expect(outcomes).toEqual(
			cases.flatMap(([source, decorator]) => {
				const pos = source.indexOf(decorator);
				const { line, column } = acorn.getLineInfo(source, pos);
				return PARSE_MODES.map(() => ({
					ok: false,
					message: `Unexpected token (${line}:${column})`,
					pos,
				}));
			}),
		);
	});

	it('keeps the decorators of parameters, and of a function parameter in a pattern', async () => {
		const method = 'class A {\n\tm(@a x, @b [y], @c { z }, @d ...rest: unknown[]) {}\n}';
		const nested = 'function f([a = function (@e x) {}]) {}';
		const [first, second] = await parseBothModes([method, nested]);
		for (const outcome of [first.strict, first.collect]) {
			const { ast, errors } = parsed(outcome, method);
			expect(errors).toEqual([]);
			const [declaration] = ast.body;
			assert_type(declaration, 'ClassDeclaration');
			const { params } = as_type(declaration.body.body[0], 'MethodDefinition').value;
			expect(params.map((param) => decoratorTexts(param, method))).toEqual([
				['@a'],
				['@b'],
				['@c'],
				['@d'],
			]);
		}
		for (const outcome of [second.strict, second.collect]) {
			const { ast, errors } = parsed(outcome, nested);
			expect(errors).toEqual([]);
			const [declaration] = ast.body;
			assert_type(declaration, 'FunctionDeclaration');
			const [pattern] = declaration.params;
			assert_type(pattern, 'ArrayPattern');
			const element = as_type(pattern.elements[0], 'AssignmentPattern');
			const inner = as_type(element.right, 'FunctionExpression');
			expect(decoratorTexts(inner.params[0], nested)).toEqual(['@e']);
		}
	});
});

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

describe("a superclass's type arguments before a line break (sveltejs/acorn-typescript#131)", () => {
	/**
	 * The heading of the class that `source` declares or assigns first, as
	 * source text: the superclass with its type, its type arguments, and the
	 * interfaces it implements.
	 * @param {AST.Program} ast
	 * @param {string} source
	 */
	function heading(ast, source) {
		const [statement] = ast.body;
		const node =
			statement.type === 'VariableDeclaration' ? statement.declarations[0].init : statement;
		const declaration = /** @type {AST.ClassDeclaration | AST.ClassExpression} */ (node);
		/** @param {unknown} value */
		const text = (value) => {
			const { start, end } = /** @type {{ start: number, end: number }} */ (value);
			return source.slice(start, end);
		};
		const superClass = /** @type {AST.Node} */ (declaration.superClass);
		const typeArguments = declaration.superTypeParameters;
		return {
			superClass: [superClass.type, text(superClass)],
			typeArguments: typeArguments ? text(typeArguments) : null,
			implements: (declaration.implements ?? []).map(text),
		};
	}

	it('keeps them on the class, as on one line', async () => {
		/** @type {Array<[source: string, expected: ReturnType<typeof heading>]>} */
		const cases = [
			[
				'class D<T> extends Base<T>\n{\n  x = 1;\n}',
				{ superClass: ['Identifier', 'Base'], typeArguments: '<T>', implements: [] },
			],
			[
				'class E<T> extends Base<T>\n  implements I {}',
				{ superClass: ['Identifier', 'Base'], typeArguments: '<T>', implements: ['I'] },
			],
			[
				'class A\n  extends React.Component<P, S>\n  implements I, J\n{}',
				{
					superClass: ['MemberExpression', 'React.Component'],
					typeArguments: '<P, S>',
					implements: ['I', 'J'],
				},
			],
			[
				'declare class A<T> // 1\nextends B<T> // 2\n{}',
				{ superClass: ['Identifier', 'B'], typeArguments: '<T>', implements: [] },
			],
			[
				'const X = class extends B<T>\n{};',
				{ superClass: ['Identifier', 'B'], typeArguments: '<T>', implements: [] },
			],
		];
		const sources = cases.map(([source]) => source);
		// The same headings on one line.
		const oneLine = sources.map((source) => source.replace(/\s*(\/\/[^\n]*)?\n\s*/g, ' '));
		const outcomes = await parseBothModes([...sources, ...oneLine]);
		for (const [index, { source, strict, collect }] of outcomes.entries()) {
			const expected = cases[index % cases.length][1];
			for (const outcome of [strict, collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				expect(heading(ast, source), source).toEqual(expected);
			}
		}
	});

	it('keeps a parenthesized instantiation expression as the superclass', async () => {
		const source = 'class A extends (B<T>)\n{}';
		const [{ strict, collect }] = await parseBothModes([source]);
		const declaration = as_type(parsed(strict, source).ast.body[0], 'ClassDeclaration');
		expect(declaration.superClass?.type).toBe('TSInstantiationExpression');
		expect(declaration.superTypeParameters).toBeUndefined();
		const preserved = as_type(parsed(collect, source).ast.body[0], 'ClassDeclaration');
		const parenthesized = as_type(preserved.superClass, 'ParenthesizedExpression');
		expect(parenthesized.expression.type).toBe('TSInstantiationExpression');
		expect(preserved.superTypeParameters).toBeUndefined();
	});
});

/**
 * The outcome of a parse that throws `message` at `pos` in `source`, in each of
 * `PARSE_MODES`.
 * @param {string} source
 * @param {number} pos
 * @param {string} message
 */
function thrown_in_every_mode(source, pos, message) {
	const { line, column } = acorn.getLineInfo(source, pos);
	return PARSE_MODES.map(() => ({ ok: false, message: `${message} (${line}:${column})`, pos }));
}

describe('`abstract`, `module`, `namespace` or `type` after `export` that starts no declaration (sveltejs/acorn-typescript#132)', () => {
	it('reports TS1128 at `export` instead of crashing', async () => {
		// TypeScript's parser reports TS1128 `Declaration or statement expected.`
		// at `export` for each.
		const sources = [
			'export abstract\nclass A {}',
			'export abstract\ninterface I {}',
			'export abstract;',
			'export abstract 1',
			'export abstract',
			'export abstract /* c\n */ class A {}',
			'export type\nFoo = 1;',
			'export namespace\nN {}',
			'export module\nM {}',
			'export declare abstract\nclass A {}',
			'export declare namespace\nN {}',
			'declare module "m" {\n\texport abstract\n\tclass A {}\n}',
		];
		const outcomes = await parse_in_worker(in_every_mode(sources));
		expect(outcomes).toEqual(
			sources.flatMap((source) =>
				thrown_in_every_mode(
					source,
					source.indexOf('export'),
					'Declaration or statement expected.',
				),
			),
		);
	});

	it('still exports the declarations they start', async () => {
		/** @type {Array<[source: string, type: string]>} */
		const cases = [
			['export abstract class A {}', 'ClassDeclaration'],
			['export type Foo = 1;', 'TSTypeAliasDeclaration'],
			['export namespace N {}', 'TSModuleDeclaration'],
			['export module M {}', 'TSModuleDeclaration'],
			['export module "m" {}', 'TSModuleDeclaration'],
			['export declare abstract class A {}', 'ClassDeclaration'],
			['export declare type Foo = 1;', 'TSTypeAliasDeclaration'],
			['declare module "m" {\n\texport abstract class A {}\n}', 'TSModuleDeclaration'],
		];
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, { source, strict, collect }] of outcomes.entries()) {
			for (const outcome of [strict, collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				const [statement] = ast.body;
				const declaration =
					statement.type === 'ExportNamedDeclaration' ||
					statement.type === 'ExportDefaultDeclaration'
						? statement.declaration
						: statement;
				expect(declaration?.type, source).toBe(cases[index][1]);
			}
		}
	});

	// #651: the word was read, then the declaration after it parsed without it.
	it('reports the word before a declaration it does not start, as TypeScript does', async () => {
		/** @type {Array<[source: string, at: string, message: string]>} */
		const cases = [
			// TS1128 at `export`: the word starts no declaration.
			['export type const x = 1;', 'export', 'Declaration or statement expected.'],
			['export type function f() {}', 'export', 'Declaration or statement expected.'],
			['export type class A {}', 'export', 'Declaration or statement expected.'],
			['export type var x = 1;', 'export', 'Declaration or statement expected.'],
			['export type const enum E {}', 'export', 'Declaration or statement expected.'],
			['export type import x = y;', 'export', 'Declaration or statement expected.'],
			['export type export class A {}', 'export', 'Declaration or statement expected.'],
			['export type 1;', 'export', 'Declaration or statement expected.'],
			['export namespace function f() {}', 'export', 'Declaration or statement expected.'],
			['export namespace class A {}', 'export', 'Declaration or statement expected.'],
			['export namespace @dec class A {}', 'export', 'Declaration or statement expected.'],
			['export module const x = 1;', 'export', 'Declaration or statement expected.'],
			['export module default class {}', 'export', 'Declaration or statement expected.'],
			[
				'export declare namespace function f(): void;',
				'export',
				'Declaration or statement expected.',
			],
			['export declare module class A {}', 'export', 'Declaration or statement expected.'],
			['export abstract @dec class A {}', 'export', 'Declaration or statement expected.'],
			['export declare abstract @dec class A {}', 'export', 'Declaration or statement expected.'],
			['export abstract export class A {}', 'export', 'Declaration or statement expected.'],
			['export abstract default class {}', 'export', 'Declaration or statement expected.'],
			['export abstract * from "m";', 'export', 'Declaration or statement expected.'],
			['export abstract {}', 'export', 'Declaration or statement expected.'],
			['export abstract import("m");', 'export', 'Declaration or statement expected.'],
			[
				'declare module "m" {\n\texport type const x: number;\n}',
				'export',
				'Declaration or statement expected.',
			],
			// A type alias or namespace whose name is missing: TypeScript reads one
			// after `declare type`, and after `export type` before `default` or `@`.
			['export type @dec class A {}', '@dec', 'Identifier expected.'],
			[
				'export type default class {}',
				'default',
				"Identifier expected. 'default' is a reserved word that cannot be used here.",
			],
			[
				'export declare type const x: number;',
				'const',
				"Identifier expected. 'const' is a reserved word that cannot be used here.",
			],
			[
				'export declare type function f(): void;',
				'function',
				"Identifier expected. 'function' is a reserved word that cannot be used here.",
			],
			['export declare type @dec class A {}', '@dec', 'Identifier expected.'],
			['export declare type = 1;', '=', 'Identifier expected.'],
			['export namespace "m" {}', '"m"', 'Identifier expected.'],
			// The braces of `export type { … }`.
			['export type = 1;', '=', "'{' expected."],
			['export type\n= 1;', '=', "'{' expected."],
			// TypeScript reads these type aliases across a line break too.
			['export declare type\nFoo = 1;', 'Foo', 'Line break not permitted here.'],
			['export type\ndefault class {}', 'default', 'Line break not permitted here.'],
			['export type\n@dec class A {}', '@dec', 'Line break not permitted here.'],
			// An escaped modifier (TS1260), which `abstract` before a function is.
			[
				'export \\u0061bstract function f() {}',
				'\\u0061bstract',
				'Keywords cannot contain escape characters.',
			],
		];
		const sources = cases.map(([source]) => source);
		const outcomes = await parse_in_worker(in_every_mode(sources));
		expect(outcomes).toEqual(
			cases.flatMap(([source, at, message]) =>
				thrown_in_every_mode(source, source.indexOf(at), message),
			),
		);
	});

	it('records `abstract` before a function, variable or import declaration, which TypeScript reports from its checker (TS1242)', async () => {
		const message =
			"'abstract' modifier can only appear on a class, method, or property declaration.";
		/** @type {Array<[source: string, type: string]>} */
		const cases = [
			['export abstract function f() {}', 'FunctionDeclaration'],
			['export abstract function* g() {}', 'FunctionDeclaration'],
			['export abstract const x = 1;', 'VariableDeclaration'],
			['export abstract var x = 1;', 'VariableDeclaration'],
			['export abstract const enum E {}', 'TSEnumDeclaration'],
			['export declare abstract function f(): void;', 'TSDeclareFunction'],
			['export declare abstract const x: number;', 'VariableDeclaration'],
			['export abstract import x = y;', 'TSImportEqualsDeclaration'],
		];
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, { source, strict, collect }] of outcomes.entries()) {
			const pos = source.indexOf('abstract');
			expect(strict, source).toEqual({
				ok: false,
				message: `${message} (1:${pos})`,
				pos,
			});
			if (!collect.ok) throw new Error(`${JSON.stringify(source)} threw ${collect.message}`);
			// The declaration, without `abstract`, which the formatter refuses.
			expect(collect.errors?.[0], source).toEqual({ message, pos, end: pos + 1 });
			const [statement] = collect.ast.body;
			assert_type(statement, 'ExportNamedDeclaration');
			expect(statement.declaration?.type, source).toBe(cases[index][1]);
		}
	});

	it('still throws when the declaration after `abstract` is no export', async () => {
		// TypeScript reports TS1242 from its checker for these, but an import
		// declaration after `export` has no place in the tree.
		const sources = ['export abstract import { a } from "m";', 'export abstract import "m";'];
		const outcomes = await parse_in_worker(
			sources.map((source) => ({ source, options: PARSE_MODES[1] })),
		);
		expect(outcomes).toEqual(
			sources.map(() => ({
				ok: false,
				message: 'Declaration or statement expected. (1:0)',
				pos: 0,
			})),
		);
	});
});

// #608
describe('`abstract` or `declare` followed by a line break (sveltejs/acorn-typescript#137)', () => {
	it('exports the value of `abstract` after `export default`, and declares the class on its own', async () => {
		const sources = [
			'export default abstract\nclass A {}',
			'export default abstract // c\nclass A {}',
			'export default abstract /* c\n */ class A {}',
			'declare module "m" {\n\texport default abstract\n\tclass A {}\n}',
		];
		const outcomes = await parseBothModes(sources);
		for (const { source, strict, collect } of outcomes) {
			for (const outcome of [strict, collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				// The module's statements in the last case.
				const first = /** @type {{ type: string, body?: { body?: AST.Statement[] } }} */ (
					ast.body[0]
				);
				const body = first.type === 'TSModuleDeclaration' ? (first.body?.body ?? []) : ast.body;
				const [exported, declared] = body;
				assert_type(exported, 'ExportDefaultDeclaration');
				expect(exported.declaration, source).toMatchObject({
					type: 'Identifier',
					name: 'abstract',
				});
				assert_type(declared, 'ClassDeclaration');
				expect(declared.id?.name, source).toBe('A');
				expect(/** @type {{ abstract?: boolean }} */ (declared).abstract, source).toBeFalsy();
			}
		}
	});

	it('reports TS1128 at `export` for `export declare` before a line break', async () => {
		const sources = [
			'export declare\nclass A {}',
			'export declare\nabstract class A {}',
			'export declare\nfunction f(): void;',
			'export declare\nconst x: number;',
			'export declare\nenum E {}',
			'export declare\nnamespace N {}',
			"export declare\nmodule 'm' {}",
			'export declare\ninterface I {}',
			'export declare\ntype T = 1;',
			'export declare\nglobal {}',
			'export declare // c\nclass A {}',
			'export declare /* c\n */ class A {}',
			'declare namespace N {\n\texport declare\n\tclass A {}\n}',
		];
		const outcomes = await parse_in_worker(in_every_mode(sources));
		expect(outcomes).toEqual(
			sources.flatMap((source) =>
				thrown_in_every_mode(
					source,
					source.indexOf('export'),
					'Declaration or statement expected.',
				),
			),
		);
	});

	it('rejects decorators before `abstract` or `declare` and a line break', async () => {
		// TypeScript's parser expects a declaration after the decorators (TS1146).
		/** @type {Array<[source: string, at: string]>} */
		const cases = [
			['export default @dec abstract\nclass A {}', 'abstract'],
			['export default @dec declare\nclass A {}', 'declare'],
			['export @dec abstract\nclass A {}', 'abstract'],
			['export @dec declare\nclass A {}', 'declare'],
			['@dec abstract\nclass A {}', 'abstract'],
			['@dec declare\nclass A {}', 'declare'],
			['@dec declare\nabstract class A {}', 'declare'],
		];
		const outcomes = await parse_in_worker(in_every_mode(cases.map(([source]) => source)));
		expect(outcomes).toEqual(
			cases.flatMap(([source, at]) =>
				thrown_in_every_mode(
					source,
					source.indexOf(at),
					'Leading decorators must be attached to a class declaration.',
				),
			),
		);
	});

	it('reports decorators before `export`, `abstract` or `declare` and a line break', async () => {
		/** @type {Array<[source: string, at: string]>} */
		const cases = [
			['@dec export abstract\nclass A {}', 'abstract'],
			['@dec export declare\nclass A {}', 'declare'],
			['@dec export declare abstract\nclass A {}', 'declare'],
		];
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, { source, strict, collect }] of outcomes.entries()) {
			const pos = source.indexOf(cases[index][1]);
			expect(strict, source).toEqual({
				ok: false,
				message: `Leading decorators must be attached to a class declaration. (1:${pos})`,
				pos,
			});
			// When collecting, the decorators are recorded (TS1206), and what follows
			// `export` starts no declaration (TS1128).
			expect(collect, source).toEqual({
				ok: false,
				message: 'Declaration or statement expected. (1:5)',
				pos: 5,
			});
		}

		// The value of `abstract` is the default export, which the decorators
		// can't decorate. TypeScript reports them from its checker (TS1206).
		const source = '@dec export default abstract\nclass A {}';
		const [{ strict, collect }] = await parseBothModes([source]);
		expect(strict).toEqual({
			ok: false,
			message: 'Leading decorators must be attached to a class declaration. (1:20)',
			pos: 20,
		});
		const { ast, errors } = parsed(collect, source);
		expect(errors).toEqual(['Leading decorators must be attached to a class declaration.']);
		const [exported, declared] = ast.body;
		assert_type(exported, 'ExportDefaultDeclaration');
		expect(exported.declaration).toMatchObject({ type: 'Identifier', name: 'abstract' });
		assert_type(declared, 'ClassDeclaration');
		expect(decoratorTexts(declared, source)).toEqual([]);
	});

	it('still reads them as modifiers before a token on the same line', async () => {
		/** @type {Array<[source: string, modifiers: { abstract?: boolean, declare?: boolean }, decorators: string[]]>} */
		const cases = [
			['export default abstract class A {}', { abstract: true }, []],
			['export default abstract /* c */ class A {}', { abstract: true }, []],
			['export declare /* c */ class A {}', { declare: true }, []],
			['export declare abstract /* c */ class A {}', { abstract: true, declare: true }, []],
			['export default @dec abstract class A {}', { abstract: true }, ['@dec']],
			['@dec export default abstract class A {}', { abstract: true }, ['@dec']],
			['@dec export default\nabstract class A {}', { abstract: true }, ['@dec']],
			['@dec export declare abstract class A {}', { abstract: true, declare: true }, ['@dec']],
			['@dec abstract class A {}', { abstract: true }, ['@dec']],
			['@dec declare class A {}', { declare: true }, ['@dec']],
			['@dec declare abstract class A {}', { abstract: true, declare: true }, ['@dec']],
		];
		const outcomes = await parseBothModes(cases.map(([source]) => source));
		for (const [index, { source, strict, collect }] of outcomes.entries()) {
			const [, modifiers, decorators] = cases[index];
			for (const outcome of [strict, collect]) {
				const { ast, errors } = parsed(outcome, source);
				expect(errors, source).toEqual([]);
				expect(ast.body, source).toHaveLength(1);
				const [statement] = ast.body;
				const declaration =
					statement.type === 'ExportNamedDeclaration' ||
					statement.type === 'ExportDefaultDeclaration'
						? statement.declaration
						: statement;
				assert_type(declaration, 'ClassDeclaration');
				const { abstract, declare } = /** @type {{ abstract?: boolean, declare?: boolean }} */ (
					declaration
				);
				expect({ abstract, declare }, source).toEqual({
					abstract: modifiers.abstract,
					declare: modifiers.declare,
				});
				expect(decoratorTexts(declaration, source), source).toEqual(decorators);
			}
		}
	});
});
