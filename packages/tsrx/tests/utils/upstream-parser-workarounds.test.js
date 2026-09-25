/** @import * as AST from 'estree' */
/** @import { CompileError, JsxPlatform } from '../../types/index' */

import { describe, expect, it } from 'vitest';
import { createJsxTransform, parseModule } from '../../src/index.js';
import { as_type, assert_type } from '../shared/node-types.js';

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

	it('rejects `static` before a line break on a type member, like `static` on its line', () => {
		expect(() => parse('interface I {\n  static\n  x: number\n}')).toThrow();
		expect(() => parse('interface I {\n  static x: number\n}')).toThrow();
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
