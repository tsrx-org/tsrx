/** @import * as AST from 'estree' */
/** @import { TSESTree } from '@typescript-eslint/types' */
/** @import { CompileError, NodeOfType, NodeTypeName, ParseOptions } from '../../types/index' */
/** @import * as ESTreeJSX from 'estree-jsx' */

import { describe, expect, it } from 'vitest';
import { acorn, parseModule } from '../../src/index.js';
import { node_children } from '../../src/utils/ast.js';
import { as_type, assert_type } from '../shared/node-types.js';
import { parse_in_worker, parse_in_worker_with_ast } from '../shared/parse-in-worker.js';
import { STYLE_SYNTAX_CASES } from './fixtures/style-syntax.js';

/**
 * Walk every node reachable from `value`, stopping at the first one `match`
 * accepts.
 *
 * @param {unknown} value
 * @param {(node: AST.Node) => boolean} match
 * @returns {AST.Node | undefined}
 */
function find_first(value, match) {
	if (!value || typeof value !== 'object') return undefined;

	if (Array.isArray(value)) {
		for (const item of value) {
			const found = find_first(item, match);
			if (found) return found;
		}
		return undefined;
	}

	const node = /** @type {AST.Node & Record<string, unknown>} */ (value);
	if (typeof node.type === 'string' && match(node)) return node;

	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'start' || key === 'end') continue;
		const found = find_first(node[key], match);
		if (found) return found;
	}

	return undefined;
}

/**
 * What a component returns, asserted to be JSX — the common case in these
 * tests. Use {@link getReturnedExpression} when the return value is something
 * else (a ternary, an array, a call).
 *
 * @param {string} source
 * @returns {AST.TSRXJSXElement | AST.TSRXJSXFragment | AST.JSXStyleElement | AST.JSXCodeBlock}
 */
function getReturned(source) {
	const returned = getReturnedExpression(source);
	if (
		returned.type !== 'JSXElement' &&
		returned.type !== 'JSXFragment' &&
		returned.type !== 'JSXStyleElement' &&
		returned.type !== 'JSXCodeBlock'
	) {
		throw new Error(`Expected the component to return JSX, got ${returned.type}`);
	}
	return returned;
}

/**
 * What a component returns, asserted to be a `@{ … }` code block.
 *
 * @param {string} source
 * @returns {AST.JSXCodeBlock}
 */
function getReturnedCodeBlock(source) {
	const returned = getReturnedExpression(source);
	assert_type(returned, 'JSXCodeBlock');
	return returned;
}

/**
 * What a component returns: the first statement of a top-level function when it
 * is a `return`, or — for components nested inside another function — the first
 * JSX-returning `return` anywhere in the tree.
 *
 * @param {string} source
 * @returns {AST.Expression}
 */
function getReturnedExpression(source) {
	const ast = parseModule(source, 'App.tsrx');
	const first = ast.body[0];
	if (first?.type === 'FunctionDeclaration') {
		const statement = first.body.body[0];
		if (statement?.type === 'ReturnStatement' && statement.argument) {
			return statement.argument;
		}
	}

	const found = find_first(
		ast,
		(node) => node.type === 'ReturnStatement' && is_jsx_output(node.argument),
	);
	const argument = found?.type === 'ReturnStatement' ? found.argument : null;
	if (!argument) {
		throw new Error('No `return` statement with a value found in source');
	}
	return argument;
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.TSRXJSXElement | AST.TSRXJSXFragment}
 */
function is_jsx_output(node) {
	return node?.type === 'JSXFragment' || node?.type === 'JSXElement';
}

/**
 * Find the first node of `type` anywhere in the parsed tree.
 *
 * @template {NodeTypeName} T
 * @param {string} source
 * @param {T} type
 * @returns {NodeOfType<T>}
 */
function findNode(source, type) {
	const ast = parseModule(source, 'App.tsrx');
	const found = find_first(ast, (node) => node.type === type);
	if (!found) throw new Error(`No ${type} node found in source`);
	return /** @type {NodeOfType<T>} */ (found);
}

/**
 * Find the first JSXElement with the given tag name anywhere in the parsed tree.
 *
 * @param {string} source
 * @param {string} tagName
 * @returns {AST.TSRXJSXElement}
 */
function findElement(source, tagName) {
	const ast = parseModule(source, 'App.tsrx');
	const found = find_first(ast, (node) => {
		if (node.type !== 'JSXElement') return false;
		const name = /** @type {AST.TSRXJSXElement} */ (node).openingElement?.name;
		return (name?.type === 'JSXIdentifier' || name?.type === 'Identifier') && name.name === tagName;
	});
	if (!found) throw new Error(`No <${tagName}> element found in source`);
	return /** @type {AST.TSRXJSXElement} */ (found);
}

/**
 * The statements of the program's first top-level function declaration.
 *
 * @param {AST.Program} ast
 * @returns {AST.Statement[]}
 */
function functionBody(ast) {
	const [first] = ast.body;
	assert_type(first, 'FunctionDeclaration');
	return first.body.body;
}

/**
 * An element's tag name, asserted to be a plain JSX identifier.
 *
 * @param {AST.TSRXJSXElement | AST.JSXStyleElement} element
 * @returns {ESTreeJSX.JSXIdentifier}
 */
function openingName(element) {
	return as_type(element.openingElement.name, 'JSXIdentifier');
}

/**
 * The node's child at `index`, asserted to be `type`.
 *
 * @template {NodeTypeName} T
 * @param {AST.Node} node
 * @param {number} index
 * @param {T} type
 * @returns {NodeOfType<T>}
 */
function child(node, index, type) {
	return as_type(node_children(node)[index], type);
}

/**
 * The initializer of a variable declaration's first declarator.
 *
 * @param {AST.Node | null | undefined} statement
 * @returns {AST.Expression}
 */
function declaratorInit(statement) {
	const init = as_type(statement, 'VariableDeclaration').declarations[0]?.init;
	if (!init) throw new Error('variable declaration has no initializer');
	return init;
}

/**
 * The expression inside a JSX attribute's `{ … }` value.
 *
 * @param {AST.Node | null | undefined} attribute
 * @returns {AST.Expression}
 */
function attributeExpression(attribute) {
	const value = as_type(attribute, 'JSXAttribute').value;
	const expression = as_type(value, 'JSXExpressionContainer').expression;
	if (expression.type === 'JSXEmptyExpression') {
		throw new Error('attribute value container is empty');
	}
	return expression;
}

/**
 * The statements of a block.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {AST.Statement[]}
 */
function blockBody(node) {
	return as_type(node, 'BlockStatement').body;
}

/**
 * The `{ … }` expression a dynamic tag name (`<{Tag} />`) holds.
 *
 * @param {AST.TSRXJSXElement} element
 * @returns {AST.Expression}
 */
function dynamicName(element) {
	const container = as_type(element.openingElement.name, 'JSXExpressionContainer');
	const expression = container.expression;
	if (expression.type === 'JSXEmptyExpression') {
		throw new Error('dynamic tag name container is empty');
	}
	return expression;
}

/**
 * The setup statements and render output of a `@{ … }` code block.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {AST.JSXCodeBlock}
 */
function codeBlock(node) {
	return as_type(node, 'JSXCodeBlock');
}

/**
 * A code block's render output, asserted to be present.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {AST.Node}
 */
function codeBlockRender(node) {
	const render = codeBlock(node).render;
	if (!render) throw new Error('code block has no render output');
	return render;
}

/** The elements of an array expression, with holes rejected.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {AST.Expression[]}
 */
function arrayElements(node) {
	return as_type(node, 'ArrayExpression').elements.map((element) => {
		if (!element || element.type === 'SpreadElement') {
			throw new Error('array element is a hole or a spread');
		}
		return element;
	});
}

/**
 * The program's first statement, asserted to be `type`.
 *
 * @template {NodeTypeName} T
 * @param {AST.Program} ast
 * @param {T} type
 * @returns {NodeOfType<T>}
 */
function firstStatement(ast, type) {
	return as_type(ast.body[0], type);
}

/**
 * The declaration an `export` statement carries.
 *
 * @param {AST.Program} ast
 * @returns {AST.Node}
 */
function exportedDeclaration(ast) {
	const declaration = firstStatement(ast, 'ExportNamedDeclaration').declaration;
	if (!declaration) throw new Error('export statement has no declaration');
	return declaration;
}

/**
 * The value of an optional lookup, asserted to exist.
 *
 * @template T
 * @param {T | null | undefined} value
 * @returns {T}
 */
function found(value) {
	assert_found(value);
	return /** @type {T} */ (value);
}

/**
 * Assert that an optional lookup found something, narrowing out `undefined`.
 *
 * @param {unknown} value
 * @returns {asserts value}
 */
function assert_found(value) {
	expect(value).toBeDefined();
	expect(value).not.toBeNull();
}

/**
 * The `regex` payload of a regular-expression literal.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {AST.RegExpLiteral['regex']}
 */
function regexLiteral(node) {
	const literal = as_type(node, 'Literal');
	if (!('regex' in literal) || !literal.regex) throw new Error('not a regular expression literal');
	return literal.regex;
}

/**
 * Every node reachable from `value`, in walk order.
 *
 * @param {unknown} value
 * @returns {AST.Node[]}
 */
function allNodes(value) {
	/** @type {AST.Node[]} */
	const nodes = [];
	find_first(value, (node) => {
		nodes.push(node);
		return false;
	});
	return nodes;
}

describe('TSRX parser', () => {
	describe('deferred imports', () => {
		it('parses a deferred namespace import with its phase and source', () => {
			const [declaration] = parseModule(
				"import defer * as feature from './feature.js';",
				'App.tsrx',
			).body;

			assert_type(declaration, 'ImportDeclaration');
			expect(declaration.phase).toBe('defer');
			expect(declaration.specifiers).toHaveLength(1);
			expect(declaration.specifiers[0].type).toBe('ImportNamespaceSpecifier');
			expect(declaration.specifiers[0].local.name).toBe('feature');
			expect(declaration.source.value).toBe('./feature.js');
		});

		it('parses import attributes on a deferred namespace import', () => {
			const [declaration] = parseModule(
				"import defer * as feature from './feature.json' with { type: 'json' };",
				'App.tsrx',
			).body;

			expect(as_type(declaration, 'ImportDeclaration').phase).toBe('defer');
			expect(as_type(declaration, 'ImportDeclaration').attributes).toHaveLength(1);
			expect(
				as_type(as_type(declaration, 'ImportDeclaration').attributes[0].key, 'Identifier').name,
			).toBe('type');
			expect(as_type(declaration, 'ImportDeclaration').attributes[0].value.value).toBe('json');
		});

		it('parses a dynamic deferred import with options and trailing commas', () => {
			const expression = findNode(
				"const feature = import.defer('./feature.json', { with: { type: 'json' } },);",
				'ImportExpression',
			);

			expect(expression.phase).toBe('defer');
			expect(as_type(expression.source, 'Literal').value).toBe('./feature.json');
			expect(expression.options?.type).toBe('ObjectExpression');

			const trailing = findNode(
				"const feature = import.defer('./feature.js',);",
				'ImportExpression',
			);
			expect(trailing.phase).toBe('defer');
			expect(trailing.options).toBeNull();
		});

		it('keeps defer as a normal default import binding when followed by from', () => {
			const [declaration] = parseModule("import defer from './feature.js';", 'App.tsrx').body;

			expect(as_type(declaration, 'ImportDeclaration').phase).toBeUndefined();
			expect(as_type(declaration, 'ImportDeclaration').specifiers).toHaveLength(1);
			expect(as_type(declaration, 'ImportDeclaration').specifiers[0].type).toBe(
				'ImportDefaultSpecifier',
			);
			expect(as_type(declaration, 'ImportDeclaration').specifiers[0].local.name).toBe('defer');
		});

		it('gives an ordinary dynamic import the same `options` shape', () => {
			const expression = findNode(
				"const feature = import('./feature.json', { with: { type: 'json' } });",
				'ImportExpression',
			);

			expect(expression.phase).toBeUndefined();
			expect(expression.options?.type).toBe('ObjectExpression');
			expect(expression).not.toHaveProperty('arguments');
		});

		it('rejects deferred default, named, and bare imports', () => {
			for (const source of [
				"import defer feature from './feature.js';",
				"import defer { feature } from './feature.js';",
				"import defer './feature.js';",
			]) {
				expect(() => parseModule(source, 'App.tsrx')).toThrow(
					'`import defer` only supports a namespace import from a string literal.',
				);
			}
		});
	});

	// The parser accepts everything the installed acorn supports, not only ES2022.
	describe('syntax newer than ES2022', () => {
		/** @type {Array<[string, () => ParseOptions | undefined]>} */
		const option_sets = [
			['without options', () => undefined],
			['with the formatter options', () => ({ collect: true, comments: [] })],
			['in loose mode', () => ({ loose: true, errors: [], comments: [] })],
		];

		/**
		 * Every node of `type` in the parsed source, in source order.
		 *
		 * @template {NodeTypeName} T
		 * @param {string} source
		 * @param {T} type
		 * @param {ParseOptions} [options]
		 * @returns {NodeOfType<T>[]}
		 */
		function find_all(source, type, options) {
			/** @type {NodeOfType<T>[]} */
			const found = [];
			find_first(parseModule(source, 'App.tsrx', options), (node) => {
				if (node.type === type) found.push(/** @type {NodeOfType<T>} */ (node));
				return false;
			});
			return found;
		}

		describe.each(option_sets)('%s', (_, options) => {
			it('parses using and await using declarations with type annotations', () => {
				const declarations = find_all(
					`{
						using handle: Disposable = open();
					}
					async function load() {
						await using connection: AsyncDisposable = await connect(), other = g();
					}`,
					'VariableDeclaration',
					options(),
				);

				expect(declarations.map((declaration) => declaration.kind)).toEqual([
					'using',
					'await using',
				]);
				const handle = as_type(declarations[0].declarations[0].id, 'Identifier');
				expect(handle.name).toBe('handle');
				expect(handle.typeAnnotation?.typeAnnotation.type).toBe('TSTypeReference');
				expect(declarations[1].declarations).toHaveLength(2);
			});

			it('parses using and await using declarations in for...of heads', () => {
				const loops = find_all(
					`async function load(items, stream) {
						for (using item of items) {}
						for await (await using item of stream) {}
					}`,
					'ForOfStatement',
					options(),
				);

				expect(
					loops.map((loop) => [as_type(loop.left, 'VariableDeclaration').kind, loop.await]),
				).toEqual([
					['using', false],
					['await using', true],
				]);
			});

			it('parses using declarations in a component body', () => {
				const declarations = find_all(
					`function App() @{
						using handle = open();
						<div>{handle.name}</div>
					}`,
					'VariableDeclaration',
					options(),
				);

				expect(declarations.map((declaration) => declaration.kind)).toEqual(['using']);
			});

			it('parses a hashbang as the line comment at offset 0', () => {
				const parse_options = options();
				const ast = parseModule(
					'#!/usr/bin/env node\nconsole.log(1);\n',
					'App.tsrx',
					parse_options,
				);
				const hashbang = { type: 'Line', value: '/usr/bin/env node', start: 0, end: 19 };

				expect(ast.body.map((node) => node.type)).toEqual(['ExpressionStatement']);
				expect(ast.body[0].leadingComments).toEqual([expect.objectContaining(hashbang)]);
				if (parse_options?.comments) {
					expect(parse_options.comments).toEqual([expect.objectContaining(hashbang)]);
				}
			});

			it('parses the regex v flag and modifiers', () => {
				const literals = find_all(
					'const set = /[\\p{L}--[a-z]]/v;\nconst modified = /(?i:a)b/;',
					'Literal',
					options(),
				);

				expect(literals.map((literal) => 'regex' in literal && literal.regex)).toEqual([
					{ pattern: '[\\p{L}--[a-z]]', flags: 'v' },
					{ pattern: '(?i:a)b', flags: '' },
				]);
			});
		});

		it('rejects a hashbang that does not start the file', () => {
			for (const source of ['\n#!/usr/bin/env node\n', 'foo();\n#!/usr/bin/env node\n']) {
				expect(() => parseModule(source, 'App.tsrx')).toThrow();
			}
		});

		it('rejects a using declaration in a for...in head, like acorn', () => {
			for (const source of [
				'for (using item in items) {}',
				'async function f() { for (await using item in items) {} }',
			]) {
				expect(() => parseModule(source, 'App.tsrx')).toThrow(
					'Using declaration is not allowed in for-in loops',
				);
			}
		});
	});

	it('parses returned tags as JSXElement nodes', () => {
		const returned = getReturned('function MyApp() { return <div />; }');

		assert_type(returned, 'JSXElement');
		expect(openingName(returned).name).toBe('div');
		expect(as_type(returned, 'JSXElement').openingElement.selfClosing).toBe(true);
	});

	it('parses returned tags after comments as JSXElement return arguments', () => {
		const returned = getReturned('function MyApp() { return /* comment */ <div />; }');

		assert_type(returned, 'JSXElement');
		expect(openingName(returned).name).toBe('div');
	});

	it('parses self-closing dynamic element tags', () => {
		const source = 'function MyApp() { return <{Tag} class="card" />; }';
		const returned = getReturned(source);

		assert_type(returned, 'JSXElement');
		expect(as_type(returned, 'JSXElement').isDynamic).toBe(true);
		expect(as_type(returned, 'JSXElement').openingElement.isDynamic).toBe(true);
		expect(as_type(returned, 'JSXElement').openingElement.selfClosing).toBe(true);
		expect(as_type(returned, 'JSXElement').closingElement).toBeNull();
		expect(as_type(returned, 'JSXElement').openingElement.name.type).toBe('JSXExpressionContainer');
		expect(
			as_type(as_type(returned, 'JSXElement').openingElement.name, 'JSXExpressionContainer')
				.isDynamic,
		).toBe(true);
		expect(dynamicName(as_type(returned, 'JSXElement')).type).toBe('Identifier');
		expect(as_type(dynamicName(as_type(returned, 'JSXElement')), 'Identifier').name).toBe('Tag');
		expect(
			source.slice(
				dynamicName(as_type(returned, 'JSXElement')).start,
				dynamicName(as_type(returned, 'JSXElement')).end,
			),
		).toBe('Tag');
	});

	it('parses dynamic element tags with matching closing tags', () => {
		const source = `function MyApp() {
			return <{Child} class="card"><div>Hello</div></{Child}>;
		}`;
		const returned = getReturned(source);

		assert_type(returned, 'JSXElement');
		expect(as_type(returned, 'JSXElement').isDynamic).toBe(true);
		expect(as_type(dynamicName(as_type(returned, 'JSXElement')), 'Identifier').name).toBe('Child');
		expect(as_type(returned, 'JSXElement').closingElement?.isDynamic).toBe(true);
		expect(as_type(returned, 'JSXElement').closingElement?.name.type).toBe(
			'JSXExpressionContainer',
		);
		expect(
			as_type(
				as_type(as_type(returned, 'JSXElement').closingElement?.name, 'JSXExpressionContainer')
					.expression,
				'Identifier',
			).name,
		).toBe('Child');
		expect(returned.children.map((child) => child.type)).toEqual(['JSXElement']);
	});

	it('parses supported dynamic element name expressions', () => {
		const cases = [
			['<{Tag} />', 'Identifier', 'Tag'],
			['<{something.prop} />', 'MemberExpression', 'something.prop'],
			['<{arr[0]} />', 'MemberExpression', 'arr[0]'],
			["<{'div'} />", 'Literal', "'div'"],
			['<{`div`} />', 'TemplateLiteral', '`div`'],
		];

		for (const [tag, expressionType, expressionSource] of cases) {
			const source = `function MyApp() { return ${tag}; }`;
			const returned = getReturned(source);
			const expression = dynamicName(as_type(returned, 'JSXElement'));
			expect(as_type(returned, 'JSXElement').isDynamic).toBe(true);
			expect(expression.type).toBe(expressionType);
			expect(source.slice(expression.start, expression.end)).toBe(expressionSource);
		}
	});

	it('rejects static non-string dynamic element names', () => {
		for (const tag of [
			'<{null} />',
			'<{undefined} />',
			'<{true} />',
			'<{1} />',
			'<{{}} />',
			'<{[]} />',
		]) {
			expect(() => parseModule(`function MyApp() { return ${tag}; }`, 'App.tsrx')).toThrow(
				'Dynamic element names must be',
			);
		}
	});

	it('rejects dynamic element call expressions, spreads, and string interpolation', () => {
		for (const tag of [
			'<{tagName()} />',
			'<{condition ? tagName() : Tag} />',
			'<{new TagName()} />',
			'<{({ ...tags }).tag} />',
			'<{({ tag }).tag} />',
			'<{[Tag][0]} />',
			"<{'hello' + 'by'} />",
			'<{`d${kind}`} />',
			'<{tag`div`} />',
		]) {
			expect(() => parseModule(`function MyApp() { return ${tag}; }`, 'App.tsrx')).toThrow(
				'Dynamic element names must be',
			);
		}
	});

	it('parses a return after a fragment variable initializer without an explicit semicolon', () => {
		const ast = parseModule(
			`function MyComponent() {
  const mySpan = <>
  </>

  return <>{mySpan}</>
}`,
			'App.tsrx',
		);

		const [declaration, statement] = functionBody(ast);
		expect(declaratorInit(declaration).type).toBe('JSXFragment');
		assert_type(statement, 'ReturnStatement');
		expect(statement.argument?.type).toBe('JSXFragment');
	});

	it('parses a return after a fragment initializer with style children without an explicit semicolon', () => {
		const ast = parseModule(
			`function MyComponent() {
  const mySpan = <>
    <span />
    <style>
      span { color: black; }
    </style>
  </>

  return <>{mySpan}</>
}`,
			'App.tsrx',
		);

		const [declaration, statement] = functionBody(ast);
		const fragment = declaratorInit(declaration);
		assert_type(fragment, 'JSXFragment');
		expect(fragment.children.some((child) => child.type === 'JSXStyleElement')).toBe(true);
		assert_type(statement, 'ReturnStatement');
		expect(statement.argument?.type).toBe('JSXFragment');
	});

	it('parses a return or throw of an element after a semicolon-less element with children', () => {
		for (const [previous, next] of [
			['const a = <span>x</span>', 'return <div />'],
			['const a = <span>{x}</span>', 'return <div />'],
			['a = <span>x</span>', 'return <div />'],
			['const a = <span>x</span>', 'return <div>{a}</div>'],
			['const a = <span>x</span>', 'throw <div />'],
		]) {
			for (const close of ['\n}', ' }']) {
				const ast = parseModule(
					`function MyComponent() {\n  ${previous}\n  ${next}${close}`,
					'App.tsrx',
				);
				const [first, statement] = functionBody(ast);
				expect(first.type).toBe(
					previous.startsWith('const') ? 'VariableDeclaration' : 'ExpressionStatement',
				);
				const argument =
					statement.type === 'ThrowStatement'
						? statement.argument
						: as_type(statement, 'ReturnStatement').argument;
				expect(argument?.type).toBe('JSXElement');
			}
		}
	});

	it('reads an element after an expression keyword that follows a semicolon-less element', () => {
		const ast = parseModule(
			`function* items(kind) {
  let a = <span>x</span>
  yield <li />
  switch (kind) {
    case 1: a = <span>y</span>
    case <li />: break
  }
  if (kind) a = <span>z</span>
  else <li />
}`,
			'App.tsrx',
		);

		const [, yielded, switched, branch] = functionBody(ast);
		const yield_expression = as_type(
			as_type(yielded, 'ExpressionStatement').expression,
			'YieldExpression',
		);
		expect(yield_expression.argument?.type).toBe('JSXElement');
		expect(as_type(switched, 'SwitchStatement').cases[1].test?.type).toBe('JSXElement');
		expect(as_type(branch, 'IfStatement').alternate?.type).toBe('JSXElement');
	});

	it('honors ASI for returned tags after a newline', () => {
		const ast = parseModule(
			`function MyApp() {
				return
				<div />;
			}`,
			'App.tsrx',
		);

		const body = functionBody(ast);
		expect(body[0].type).toBe('ReturnStatement');
		expect(as_type(body[0], 'ReturnStatement').argument).toBeNull();
		expect(body[1].type).toBe('JSXElement');
		expect(as_type(as_type(body[1], 'JSXElement').openingElement.name, 'JSXIdentifier').name).toBe(
			'div',
		);
	});

	it('starts an element after comments on the line after a semicolon-less statement', () => {
		for (const comment of [
			'/* render */',
			'/* a */ /* b */',
			'/* a /* b */',
			'// note\n  /* render */',
		]) {
			const block = findNode(
				`export function App() @{\n  const x = a\n  ${comment} <div />\n}`,
				'JSXCodeBlock',
			);
			expect(block.body.map((node) => node.type)).toEqual(['VariableDeclaration']);
			expect(declaratorInit(block.body[0]).type).toBe('Identifier');
			expect(codeBlockRender(block).type).toBe('JSXElement');

			const body = functionBody(
				parseModule(`function f() {\n  const x = a\n  ${comment} <div />\n}`, 'App.tsrx'),
			);
			expect(body.map((node) => node.type)).toEqual(['VariableDeclaration', 'JSXElement']);

			const program = parseModule(`a\n${comment} <div />\n`, 'App.tsrx');
			expect(program.body.map((node) => node.type)).toEqual(['ExpressionStatement', 'JSXElement']);
		}

		// A comment that spans lines separates the statements like a line break.
		const block = findNode(
			'export function App() @{\n  const x = a /* a\n  b */ <div />\n}',
			'JSXCodeBlock',
		);
		expect(codeBlockRender(block).type).toBe('JSXElement');
	});

	it('keeps a `<` after a comment on the same line as the previous value a comparison', () => {
		for (const source of ['x = a /* note */ < b', 'x = a\n/* note */ < b']) {
			const statement = firstStatement(parseModule(source, 'App.tsrx'), 'ExpressionStatement');
			const assignment = as_type(statement.expression, 'AssignmentExpression');
			expect(as_type(assignment.right, 'BinaryExpression').operator).toBe('<');
		}
		expect(() =>
			parseModule('export function App() @{\n  const x = a /* note */ <div />\n}', 'App.tsrx'),
		).toThrow();
	});

	it('reads an element with attributes after a semicolon-less element with children', () => {
		for (const previous of [
			'const render = (item) => <><Item /></>',
			'const render = <b>x</b>',
			'const render = <b>{x}</b>',
		]) {
			const body = functionBody(
				parseModule(
					`function Test(props) {\n  ${previous}\n  <List renderItem={render} key="a" />\n}`,
					'App.tsrx',
				),
			);
			const program = parseModule(
				`${previous}\n<List renderItem={render} key="a" />\n`,
				'App.tsrx',
			);
			for (const statements of [body, program.body]) {
				expect(statements.map((node) => node.type)).toEqual(['VariableDeclaration', 'JSXElement']);
				const list = as_type(statements[1], 'JSXElement');
				expect(
					list.openingElement.attributes.map(
						(attribute) => as_type(as_type(attribute, 'JSXAttribute').name, 'JSXIdentifier').name,
					),
				).toEqual(['renderItem', 'key']);
			}
		}
	});

	it('ends the statement at an element before a template literal on the next line', () => {
		for (const [element, type] of [
			['<b>x</b>', 'JSXElement'],
			['<>x</>', 'JSXFragment'],
			['<b />', 'JSXElement'],
		]) {
			const source = `const a = ${element}\n\`t\${a}\``;
			for (const ast of [
				parseModule(`function f() {\n  ${source}\n}`, 'App.tsrx'),
				parseModule(`${source}\n`, 'App.tsrx'),
			]) {
				const [declaration, statement] =
					ast.body[0].type === 'FunctionDeclaration' ? functionBody(ast) : ast.body;
				// An element isn't a left-hand-side expression, as in TypeScript, so
				// the template literal isn't a tagged template on it and starts the
				// next statement (#426). Babel reads a tagged template here.
				expect(declaratorInit(declaration).type).toBe(type);
				const template = as_type(
					as_type(statement, 'ExpressionStatement').expression,
					'TemplateLiteral',
				);
				expect(template.quasis.map((quasi) => quasi.value.raw)).toEqual(['t', '']);
				expect(template.expressions.map((node) => node.type)).toEqual(['Identifier']);
			}
		}
	});

	it('divides after an element outside a template', () => {
		for (const [element, type] of [
			['<span />', 'JSXElement'],
			['<span>x</span>', 'JSXElement'],
			['<>x</>', 'JSXFragment'],
			['<{tag}>\n  <b>x</b>\n</{tag}>', 'JSXElement'],
		]) {
			const declaration = firstStatement(
				parseModule(`const half = ${element} / 2\n`, 'App.tsrx'),
				'VariableDeclaration',
			);
			const [returned] = functionBody(
				parseModule(`function f() {\n  return ${element} / 2\n}`, 'App.tsrx'),
			);
			for (const expression of [
				declaratorInit(declaration),
				found(as_type(returned, 'ReturnStatement').argument),
			]) {
				const division = as_type(expression, 'BinaryExpression');
				expect(division.operator).toBe('/');
				expect(division.left.type).toBe(type);
				expect(as_type(division.right, 'Literal').value).toBe(2);
			}
		}

		// A regular expression on the next line divides too, as in TypeScript.
		const declaration = firstStatement(
			parseModule('const b = <b>x</b>\n/re/g\n', 'App.tsrx'),
			'VariableDeclaration',
		);
		const outer = as_type(declaratorInit(declaration), 'BinaryExpression');
		const inner = as_type(outer.left, 'BinaryExpression');
		expect([inner.left.type, inner.operator, outer.operator]).toEqual(['JSXElement', '/', '/']);
		expect(as_type(outer.right, 'Identifier').name).toBe('g');

		// Inside a template, a `/` after an element is still text.
		const container = firstStatement(
			parseModule('<div><span /> / 2<b>x</b>/3</div>\n', 'App.tsrx'),
			'JSXElement',
		);
		expect(
			container.children.map((node) =>
				node.type === 'JSXText' ? node.value : openingName(as_type(node, 'JSXElement')).name,
			),
		).toEqual(['span', ' / 2', 'b', '/3']);

		// The `}` after a code block's rendered dynamic element closes the block.
		const block = findNode(
			'export function Panel() @{\n  <{tag} class="panel">\n    <h2>{title}</h2>\n  </{tag}>\n}',
			'JSXCodeBlock',
		);
		expect(dynamicName(as_type(codeBlockRender(block), 'JSXElement')).type).toBe('Identifier');
	});

	it('reads an element after await as the awaited value', () => {
		const [declaration, statement] = functionBody(
			parseModule(
				'async function load() {\n  const view = await <div>a</div>\n  await <div />\n}',
				'App.tsrx',
			),
		);
		const top_level = firstStatement(
			parseModule('await <></>\n', 'App.tsrx'),
			'ExpressionStatement',
		);
		for (const [expression, type] of [
			[declaratorInit(declaration), 'JSXElement'],
			[as_type(statement, 'ExpressionStatement').expression, 'JSXElement'],
			[top_level.expression, 'JSXFragment'],
		]) {
			expect(as_type(expression, 'AwaitExpression').argument.type).toBe(type);
		}

		// Where `await` is a name, `<` after it still compares.
		const [returned] = functionBody(
			parseModule('async function f() {\n  return x.await < y\n}', 'App.tsrx'),
		);
		const comparison = as_type(
			found(as_type(returned, 'ReturnStatement').argument),
			'BinaryExpression',
		);
		expect(comparison.operator).toBe('<');
	});

	it('divides after the first token of a code block setup statement', () => {
		for (const statement of ['total / count > 1 && log();', 'a / b;', '(a) / b;']) {
			for (const setup of [[statement], ['const q = 1;', statement]]) {
				const block = findNode(
					`export function App() @{\n  ${setup.join('\n  ')}\n  <span />\n}`,
					'JSXCodeBlock',
				);
				const directive = findNode(
					`export function App() @{\n  <>\n    @if (x) {\n      ${setup.join('\n      ')}\n      <span />\n    }\n  </>\n}`,
					'JSXIfExpression',
				);
				const directive_body = blockBody(directive.consequent);
				expect(directive_body.at(-1)?.type).toBe('JSXElement');
				for (const body of [block.body, directive_body.slice(0, -1)]) {
					const division = find_first(
						as_type(body.at(-1), 'ExpressionStatement').expression,
						(node) => node.type === 'BinaryExpression' && node.operator === '/',
					);
					expect(as_type(division, 'BinaryExpression').left.type).toBe('Identifier');
				}
				expect(codeBlockRender(block).type).toBe('JSXElement');
			}
		}

		// A statement that starts with a regular expression still reads it.
		const block = findNode(
			'export function App() @{\n  /a/.test(s);\n  <span />\n}',
			'JSXCodeBlock',
		);
		const call = as_type(
			as_type(block.body[0], 'ExpressionStatement').expression,
			'CallExpression',
		);
		expect(regexLiteral(as_type(call.callee, 'MemberExpression').object).pattern).toBe('a');

		// A `/` after a name on the next line divides, as in a function body, so
		// `a / b / .test(s)` is a syntax error.
		expect(() =>
			parseModule('export function App() @{\n  a\n  /b/.test(s)\n  <span />\n}', 'App.tsrx'),
		).toThrow();

		// A code block used as a value divides after its `}`, with or without
		// setup statements before its render node.
		for (const setup of ['', 'const q = 1; ']) {
			const declaration = firstStatement(
				parseModule(`const a = @{ ${setup}<b /> } / 2\n`, 'App.tsrx'),
				'VariableDeclaration',
			);
			const division = as_type(declaratorInit(declaration), 'BinaryExpression');
			expect([division.left.type, division.operator]).toEqual(['JSXCodeBlock', '/']);
		}
	});

	it('starts an element after a semicolon-less statement that ends with a type', () => {
		for (const [statement, type] of [
			['const x = y as Foo', 'VariableDeclaration'],
			['const x = y satisfies Foo', 'VariableDeclaration'],
			['const x = y as Map<A, B>', 'VariableDeclaration'],
			['const x = y as () => void', 'VariableDeclaration'],
			['let x: Foo', 'VariableDeclaration'],
			['let x: Foo[]', 'VariableDeclaration'],
			['type T = Foo', 'TSTypeAliasDeclaration'],
		]) {
			const block = findNode(
				`export function App() @{\n  ${statement}\n  <Bar a={1} />\n}`,
				'JSXCodeBlock',
			);
			expect(block.body.map((node) => node.type)).toEqual([type]);
			expect(codeBlockRender(block).type).toBe('JSXElement');

			const body = functionBody(
				parseModule(`function f() {\n  ${statement}\n  <Bar a={1} />\n}`, 'App.tsrx'),
			);
			const program = parseModule(`${statement}\n/* note */ <Bar a={1} />\n`, 'App.tsrx');
			for (const statements of [body, program.body]) {
				expect(statements.map((node) => node.type)).toEqual([type, 'JSXElement']);
			}
		}
	});

	it('keeps a `<` that starts a line inside a type, or that a type can end at, a type operator', () => {
		const alias = firstStatement(
			parseModule('type F =\n  <T>(x: T) => T\n', 'App.tsrx'),
			'TSTypeAliasDeclaration',
		);
		expect(as_type(alias.typeAnnotation, 'TSFunctionType').typeParameters?.params).toHaveLength(1);

		const signatures = [
			firstStatement(
				parseModule('interface I {\n  a: Foo\n  <T>(x: T): void\n}\n', 'App.tsrx'),
				'TSInterfaceDeclaration',
			).body.body,
			as_type(
				firstStatement(
					parseModule('type L = {\n  a: Foo\n  <T>(x: T): void\n}\n', 'App.tsrx'),
					'TSTypeAliasDeclaration',
				).typeAnnotation,
				'TSTypeLiteral',
			).members,
		];
		for (const members of signatures) {
			expect(members.map((node) => node.type)).toEqual([
				'TSPropertySignature',
				'TSCallSignatureDeclaration',
			]);
		}

		const comparison = firstStatement(
			parseModule('const b = x as number\n< y\n', 'App.tsrx'),
			'VariableDeclaration',
		);
		expect(as_type(declaratorInit(comparison), 'BinaryExpression').operator).toBe('<');

		const program = parseModule('let x: Foo\n<T,>(a: T) => a\n', 'App.tsrx');
		const arrow = as_type(
			as_type(program.body[1], 'ExpressionStatement').expression,
			'ArrowFunctionExpression',
		);
		expect(arrow.typeParameters?.params).toHaveLength(1);
	});

	it('continues an expression after an element that starts a statement', () => {
		/** @type {Array<[string, NodeTypeName, string | null]>} */
		const cases = [
			['<div /> > 5;', 'BinaryExpression', '>'],
			['<div></div> >= 5;', 'BinaryExpression', '>='],
			['<div /> + 1;', 'BinaryExpression', '+'],
			['<div /> - 1;', 'BinaryExpression', '-'],
			['<div /> / 2;', 'BinaryExpression', '/'],
			['<div /> ** 2;', 'BinaryExpression', '**'],
			['<div /> === b;', 'BinaryExpression', '==='],
			['<div /> && b;', 'LogicalExpression', '&&'],
			['<></> ?? b;', 'LogicalExpression', '??'],
			['<div /> ? a : "b";', 'ConditionalExpression', null],
			['<div />, b;', 'SequenceExpression', null],
			['<div /> as any;', 'TSAsExpression', null],
		];
		for (const [source, type, operator] of cases) {
			for (const options of [undefined, { collect: true, comments: [] }]) {
				const program = parseModule(source, 'App.tsrx', options);
				const wrapped = `function f() {\n  ${source}\n}`;
				const body = functionBody(parseModule(wrapped, 'App.tsrx', options));
				for (const [statements, start] of /** @type {const} */ ([
					[program.body, 0],
					[body, wrapped.indexOf(source)],
				])) {
					expect(statements).toHaveLength(1);
					const statement = as_type(statements[0], 'ExpressionStatement');
					expect([statement.start, statement.end]).toEqual([start, start + source.length]);
					const expression = as_type(statement.expression, type);
					if (operator !== null) {
						expect(/** @type {AST.BinaryExpression} */ (expression).operator).toBe(operator);
					}
					// The element is the leftmost operand.
					const element = find_first(
						expression,
						(node) => node.type === 'JSXElement' || node.type === 'JSXFragment',
					);
					expect(element?.start).toBe(statement.start);
				}
			}
		}

		// The element is an operand like any other: operators bind by precedence.
		const [statement] = parseModule('<div /> > 5 && <b>x</b>;', 'App.tsrx').body;
		const logical = as_type(
			as_type(statement, 'ExpressionStatement').expression,
			'LogicalExpression',
		);
		expect(as_type(logical.left, 'BinaryExpression').left.type).toBe('JSXElement');
		expect(logical.right.type).toBe('JSXElement');

		// Without a semicolon, an element on the next line starts the next statement.
		expect(
			parseModule('<div /> > 5\n<span />\n', 'App.tsrx').body.map((node) => node.type),
		).toEqual(['ExpressionStatement', 'JSXElement']);
	});

	it('continues an expression after an element across a line break, as TSX does', () => {
		/** @type {Array<[string, NodeTypeName, string | null]>} */
		const cases = [
			['<div />\n> 5;', 'BinaryExpression', '>'],
			['<div></div>\n>= 5;', 'BinaryExpression', '>='],
			['<div />\n+ 1;', 'BinaryExpression', '+'],
			['<div />\n- -1;', 'BinaryExpression', '-'],
			['<div />\n/ 2;', 'BinaryExpression', '/'],
			['<div />\n** 2;', 'BinaryExpression', '**'],
			['<div />\n=== b;', 'BinaryExpression', '==='],
			['<div />\n<= 5;', 'BinaryExpression', '<='],
			['<div />\n<< 2;', 'BinaryExpression', '<<'],
			['<div />\ninstanceof X;', 'BinaryExpression', 'instanceof'],
			['<div />\n&& b;', 'LogicalExpression', '&&'],
			['<></>\n?? b;', 'LogicalExpression', '??'],
			['<div />\n? a : "b";', 'ConditionalExpression', null],
			['<div />\n, b;', 'SequenceExpression', null],
			['<div /> // note\n> 5;', 'BinaryExpression', '>'],
		];
		for (const [source, type, operator] of cases) {
			for (const options of [undefined, { collect: true, comments: [] }]) {
				const program = parseModule(source, 'App.tsrx', options);
				const wrapped = `function f() {\n  ${source}\n}`;
				const body = functionBody(parseModule(wrapped, 'App.tsrx', options));
				for (const [statements, start] of /** @type {const} */ ([
					[program.body, 0],
					[body, wrapped.indexOf(source)],
				])) {
					expect(statements).toHaveLength(1);
					const statement = as_type(statements[0], 'ExpressionStatement');
					expect([statement.start, statement.end]).toEqual([start, start + source.length]);
					const expression = as_type(statement.expression, type);
					if (operator !== null) {
						expect(/** @type {AST.BinaryExpression} */ (expression).operator).toBe(operator);
					}
					const element = find_first(
						expression,
						(node) => node.type === 'JSXElement' || node.type === 'JSXFragment',
					);
					expect(element?.start).toBe(statement.start);
				}
			}
		}

		// The statement before the element still ends where it did.
		const [declaration, statement] = parseModule('const a = 1;\n<div />\n=== x;', 'App.tsrx').body;
		expect(declaration.type).toBe('VariableDeclaration');
		expect(as_type(statement, 'ExpressionStatement').expression.type).toBe('BinaryExpression');
	});

	it('ends an element statement before `as` on the next line, a tag start, or a code block render node', () => {
		/** @param {string} source */
		const statementTypes = (source) =>
			parseModule(source, 'App.tsrx').body.map((node) =>
				node.type === 'ExpressionStatement' ? node.expression.type : node.type,
			);
		// TypeScript reads `as` and `satisfies` as operators only on the element's line.
		expect(() => parseModule('<div />\nas any;', 'App.tsrx')).toThrow('Unexpected token');
		expect(() => parseModule('<div />\nsatisfies any;', 'App.tsrx')).toThrow('Unexpected token');
		// A tag start is the next element, not a comparison, and so is any `<`
		// that starts the next line.
		expect(statementTypes('<div /> <span />\n')).toEqual(['JSXElement', 'JSXElement']);
		expect(statementTypes('<div />\n<span />\n')).toEqual(['JSXElement', 'JSXElement']);
		expect(statementTypes('<div />\n<T,>(x: T) => x;\n')).toEqual([
			'JSXElement',
			'ArrowFunctionExpression',
		]);
		// Parentheses and `!` start the next statement, as in TypeScript.
		expect(statementTypes('<div />\n(a);\n')).toEqual(['JSXElement', 'Identifier']);
		expect(statementTypes('<div />\n!a;\n')).toEqual(['JSXElement', 'UnaryExpression']);

		// A code block's render node is an element, never an operand, on its line
		// or the next one.
		for (const source of [
			'export function App() @{ <div /> > 5 }',
			'export function App() @{\n  <div />\n  > 5\n}',
			'export function App() @{\n  @if (x) {\n    <div />\n    > 5\n  }\n}',
			'export function App() @{\n  @switch (x) {\n    @case 1: {\n      <div />\n      > 5\n    }\n  }\n}',
		]) {
			expect(() => parseModule(source, 'App.tsrx'), source).toThrow('Unexpected token');
		}
		for (const source of [
			'export function App() @{\n  const a = 1\n  <div /> + 1\n}',
			'export function App() @{\n  const a = 1\n  <div />\n  + 1\n}',
		]) {
			expect(() => parseModule(source, 'App.tsrx')).toThrow(
				'statements cannot follow the rendered output',
			);
			/** @type {CompileError[]} */
			const errors = [];
			const program = parseModule(source, 'App.tsrx', { loose: true, errors });
			const loose_block = codeBlock(
				as_type(
					as_type(
						firstStatement(program, 'ExportNamedDeclaration').declaration,
						'FunctionDeclaration',
					).body,
					'JSXCodeBlock',
				),
			);
			expect(loose_block.body.map((node) => node.type)).toEqual([
				'VariableDeclaration',
				'JSXElement',
				'ExpressionStatement',
			]);
			expect(errors.map((error) => error.message)).toEqual([
				"Code must be at the top of '@{ }'; statements cannot follow the rendered output.",
			]);
		}

		// A plain block in a setup statement holds statements, as a function body does.
		const setup = codeBlock(
			as_type(
				as_type(
					firstStatement(
						parseModule(
							'export function App() @{\n  if (x) {\n    <div />\n    > 5\n  }\n  <span />\n}',
							'App.tsrx',
						),
						'ExportNamedDeclaration',
					).declaration,
					'FunctionDeclaration',
				).body,
				'JSXCodeBlock',
			),
		);
		const [inner] = blockBody(as_type(setup.body[0], 'IfStatement').consequent);
		expect(as_type(inner, 'ExpressionStatement').expression.type).toBe('BinaryExpression');

		// Inside a template, what follows an element is text.
		for (const source of ['<div><span /> > 5</div>', '<div>\n  <span />\n  > 5\n</div>']) {
			const container = firstStatement(parseModule(source, 'App.tsrx'), 'JSXElement');
			expect(container.children.map((node) => node.type)).toEqual(['JSXElement', 'JSXText']);
		}
	});

	it('starts an element or fragment at its `<` when whitespace or a comment follows it', () => {
		const elements = [
			'< div>x</div>',
			'<  >x</>',
			'<\n  // note\n>\n  x\n</>',
			'</* note */div id="a" />',
			'<\n  /* note */\n  div\n>\n  x\n</div>',
		];
		/** @type {Array<(element: string) => string>} */
		const positions = [
			(element) => `const a = ${element};`,
			(element) => `${element};`,
			(element) => `function f() {\n  return ${element};\n}`,
			(element) => `function f() {\n  ${element}\n  > 5;\n}`,
			(element) => `export function App() @{\n  ${element}\n}`,
			(element) => `export function App() @{\n  @if (x) {\n    ${element}\n  }\n}`,
		];
		for (const element of elements) {
			for (const position of positions) {
				const source = position(element);
				const start = source.indexOf(element);
				for (const options of [undefined, { collect: true, comments: [] }]) {
					const node = find_first(
						parseModule(source, 'App.tsrx', options),
						(node) => node.type === 'JSXElement' || node.type === 'JSXFragment',
					);
					if (node?.type !== 'JSXElement' && node?.type !== 'JSXFragment') {
						throw new Error(`No element in ${JSON.stringify(source)}`);
					}
					const opening = node.type === 'JSXElement' ? node.openingElement : node.openingFragment;
					for (const located of [node, opening]) {
						expect(located.start, source).toBe(start);
						expect(located.loc?.start, source).toEqual(acorn.getLineInfo(source, start));
					}
				}
			}
		}
	});

	it('reads type parameters on the line after a declaration name', () => {
		/**
		 * @param {AST.Node} node
		 * @returns {unknown}
		 */
		const typeParameters = (node) =>
			/** @type {{ typeParameters?: { params: unknown[] } }} */ (node).typeParameters?.params;
		/** @type {Array<[string, (program: AST.Program) => AST.Node]>} */
		const cases = [
			['class G\n<T> {}', (program) => program.body[0]],
			['class G // comment\n<T> implements I<T> {}', (program) => program.body[0]],
			['const C = class\n<T> {};', (program) => declaratorInit(program.body[0])],
			['interface I\n<T> {}', (program) => program.body[0]],
			['type A\n<T> = T;', (program) => program.body[0]],
			['function f\n<T>() {}', (program) => program.body[0]],
			['const f = function\n<T>() {};', (program) => declaratorInit(program.body[0])],
			[
				'class A {\n  m\n  <T>() {}\n}',
				(program) => firstStatement(program, 'ClassDeclaration').body.body[0],
			],
			[
				'const o = {\n  m\n  <T>() {}\n};',
				(program) =>
					as_type(
						as_type(declaratorInit(program.body[0]), 'ObjectExpression').properties[0],
						'Property',
					).value,
			],
		];
		for (const [source, declaration] of cases) {
			for (const options of [undefined, { collect: true, comments: [] }]) {
				const program = parseModule(source, 'App.tsrx', options);
				expect(program.body).toHaveLength(1);
				expect(typeParameters(declaration(program))).toHaveLength(1);
			}
		}

		// After a declaration's body, an element on the next line starts a new statement.
		for (const source of ['class G {}\n<div />\n', 'function f() {}\n<div />\n']) {
			expect(parseModule(source, 'App.tsrx').body.map((node) => node.type)).toEqual([
				source.startsWith('class') ? 'ClassDeclaration' : 'FunctionDeclaration',
				'JSXElement',
			]);
		}
	});

	it('parses mixed scalar and JSX return branches', () => {
		const ast = parseModule(
			`function MyApp() {
				if (ready) {
					return "Ready";
				}
				if (empty) {
					return null;
				}
				return <div />;
			}`,
			'App.tsrx',
		);

		const [ready, empty, fallback] = functionBody(ast);
		expect(
			as_type(
				as_type(blockBody(as_type(ready, 'IfStatement').consequent)[0], 'ReturnStatement').argument,
				'Literal',
			).value,
		).toBe('Ready');
		expect(
			as_type(
				as_type(blockBody(as_type(empty, 'IfStatement').consequent)[0], 'ReturnStatement').argument,
				'Literal',
			).value,
		).toBeNull();
		expect(found(as_type(fallback, 'ReturnStatement').argument).type).toBe('JSXElement');
	});

	it('parses fragments as JSXFragment nodes', () => {
		const ast = parseModule('const x = <><div /></>;', 'App.tsrx');

		const value = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(value, 'JSXFragment');
		expect(value.openingFragment.type).toBe('JSXOpeningFragment');
		expect(value.closingFragment.type).toBe('JSXClosingFragment');
		expect(value.children.map((child) => child.type)).toEqual(['JSXElement']);
	});

	it('treats fragment text as JSXText', () => {
		const ast = parseModule(
			`export const FeatureCard = () => <>
				hello world
			</>;`,
			'App.tsrx',
		);

		const value = as_type(declaratorInit(exportedDeclaration(ast)), 'ArrowFunctionExpression').body;
		assert_type(value, 'JSXFragment');
		expect(value.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(value, 0, 'JSXText').value).toContain('hello world');
	});

	it('preserves JSX text whitespace around expression children', () => {
		const returned = getReturned(
			`function App() {
				return <div>{name} is visible</div>;
			}`,
		);

		expect(node_children(returned).map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
		]);
		expect(child(returned, 1, 'JSXText').value).toBe(' is visible');
	});

	it('preserves same-line JSX whitespace text between expression children', () => {
		const returned = getReturned(
			`function App() {
				return <div>{first} {last}</div>;
			}`,
		);

		expect(node_children(returned).map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(returned, 1, 'JSXText').value).toBe(' ');
	});

	// Regression: JSX text inside a `{ … }` expression container used to lose its
	// leading whitespace. A JSX element is parsed two different ways depending on
	// position — as native template raw text when it is a bare template child, and
	// through the JSX-expression reader when it is wrapped in `{ … }`. The latter
	// skipped leading whitespace before anchoring the JSXText token, so
	// `{<textarea>   a</textarea>}` came back as `a` while the bare
	// `<textarea>   a</textarea>` kept `   a`. Both paths must capture text identically.

	it('preserves leading whitespace in element text inside an expression container', () => {
		const returned = getReturned(
			`function App() {
				return <>{<textarea>   a</textarea>}</>;
			}`,
		);

		const textarea = child(returned, 0, 'JSXExpressionContainer').expression;
		assert_type(textarea, 'JSXElement');
		expect(textarea.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(textarea, 0, 'JSXText').value).toBe('   a');
	});

	it('captures element text identically for bare and expression-container elements', () => {
		const bare = findElement(`function App() { <textarea>   a</textarea> }`, 'textarea');
		const wrapped = findElement(
			`function App() { return <>{<textarea>   a</textarea>}</>; }`,
			'textarea',
		);

		expect(child(bare, 0, 'JSXText').value).toBe('   a');
		expect(child(wrapped, 0, 'JSXText').value).toBe(child(bare, 0, 'JSXText').value);
	});

	it('preserves leading newline-indented element text inside an expression container', () => {
		const textarea = findElement(
			`function App() {
				return <>{<textarea>
    C
abc
</textarea>}</>;
			}`,
			'textarea',
		);

		expect(textarea.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(textarea, 0, 'JSXText').value).toBe('\n    C\nabc\n');
	});

	it('preserves trailing and interior whitespace in expression-container element text', () => {
		const div = findElement(`function App() { return <>{<div>a   b   </div>}</>; }`, 'div');

		expect(div.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(div, 0, 'JSXText').value).toBe('a   b   ');
	});

	// The same preservation must hold for elements authored with TSRX template
	// syntax (`function … @{ … }`), both as bare native-template children and when
	// nested inside a `{ … }` expression container within the template body.

	it('preserves bare element text whitespace inside a TSRX template body', () => {
		const div = findElement(`function App() @{ <div>   a</div> }`, 'div');

		expect(div.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(div, 0, 'JSXText').value).toBe('   a');
	});

	it('preserves expression-container element text whitespace inside a TSRX template body', () => {
		const span = findElement(`function App() @{ <div>{<span>   x</span>}</div> }`, 'span');

		expect(span.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(span, 0, 'JSXText').value).toBe('   x');
	});

	it('preserves element text whitespace inside a TSRX @if block', () => {
		const textarea = findElement(
			`function App() @{
				@if (ok) {
					<textarea>   a</textarea>
				}
			}`,
			'textarea',
		);

		expect(textarea.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(textarea, 0, 'JSXText').value).toBe('   a');
	});

	it('preserves leading element text whitespace inside a TSRX @for block', () => {
		const li = findElement(
			`function App() @{
				@for (const item of items) {
					<li>   {item}</li>
				}
			}`,
			'li',
		);

		expect(li.children.map((child) => child.type)).toEqual(['JSXText', 'JSXExpressionContainer']);
		expect(child(li, 0, 'JSXText').value).toBe('   ');
	});

	it('treats backslashes in expression-container element text as literal text', () => {
		const bare = findElement(`function App() { <div>a\\nb</div> }`, 'div');
		const wrapped = findElement(`function App() { return <>{<div>a\\nb</div>}</>; }`, 'div');

		expect(bare.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(bare, 0, 'JSXText').value).toBe('a\\nb');
		expect(child(wrapped, 0, 'JSXText').value).toBe(child(bare, 0, 'JSXText').value);
	});

	// A `/` in element text must stay literal text — never the start of a regular
	// expression — including when the element is nested inside a `{ … }`
	// expression container.

	it('treats a slash in element text as literal text for bare and expression-container elements', () => {
		const bare = findElement(`function App() { return <a>x/y</a>; }`, 'a');
		const wrapped = findElement(`function App(p) { return <div>{p.c && <a>x/y</a>}</div>; }`, 'a');

		expect(bare.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(bare, 0, 'JSXText').value).toBe('x/y');
		expect(wrapped.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(wrapped, 0, 'JSXText').value).toBe('x/y');
	});

	it('treats a slash in element text inside a parenthesized expression container as literal text', () => {
		const a = findElement(`export function A(p) { return <div>{p.c && (<a>x/y</a>)}</div>; }`, 'a');

		expect(a.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(a, 0, 'JSXText').value).toBe('x/y');
	});

	it('parses a slash between adjacent expression children at the top level', () => {
		const span = findElement(`export function C(p) { return <span>{p.x}/{p.y}</span>; }`, 'span');

		expect(span.children.map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(span, 1, 'JSXText').value).toBe('/');
	});

	it('parses a slash between adjacent expression children in a nested element', () => {
		const span = findElement(
			`export function B(p) { return <div><span>{p.x}/{p.y}</span></div>; }`,
			'span',
		);

		expect(span.children.map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(span, 1, 'JSXText').value).toBe('/');
	});

	it('parses a slash between adjacent expression children inside an expression container', () => {
		const span = findElement(
			`export function B(p) { return <div>{p.c && <span>{p.x}/{p.y}</span>}</div>; }`,
			'span',
		);

		expect(span.children.map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(span, 1, 'JSXText').value).toBe('/');
	});

	it('parses a slash between adjacent expression children in a parenthesized expression container', () => {
		const b = findElement(
			`export function E(p) { return <div>{p.a && (<b>{p.x}/{p.y}</b>)}</div>; }`,
			'b',
		);

		expect(b.children.map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(b, 1, 'JSXText').value).toBe('/');
	});

	it('parses slashes in element text at deeper expression-container nesting', () => {
		const em = findElement(
			`export function F(p) {
				return <div>{p.a && (<section>{p.b ? (<em>{p.x}/{p.y} m/s</em>) : null}</section>)}</div>;
			}`,
			'em',
		);

		expect(em.children.map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXExpressionContainer',
			'JSXText',
		]);
		expect(child(em, 1, 'JSXText').value).toBe('/');
		expect(child(em, 3, 'JSXText').value).toBe(' m/s');
	});

	it('still parses division inside an expression container after a nested element', () => {
		const container = findNode(
			`export function G(p) { return <div>{p.c ? (<a>x</a>) : p.a / p.b}</div>; }`,
			'ConditionalExpression',
		);

		expect(container.alternate.type).toBe('BinaryExpression');
		expect(as_type(container.alternate, 'BinaryExpression').operator).toBe('/');
	});

	/** @param {string} body */
	const inExpressionContainer = (body) => `function App() {
			return <>{<div>${body}</div>}</>;
		}`;

	it('parses an @{ } code block inside an element nested in an expression container', () => {
		const block = findNode(
			inExpressionContainer(`@{ const value = 1; <span>{value}</span> }`),
			'JSXCodeBlock',
		);

		expect(block?.type).toBe('JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('preserves significant whitespace before a code block in a fragment', () => {
		const fragment = findNode('let a = <>   @{<b>123</b>}   </>;', 'JSXFragment');

		expect(fragment.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXCodeBlock',
			'JSXText',
		]);
		expect(child(fragment, 0, 'JSXText').value).toBe('   ');
		expect(child(fragment, 2, 'JSXText').value).toBe('   ');
	});

	it('drops layout whitespace before a code block in a fragment', () => {
		const fragment = findNode('let a = <>\n   @{<b>123</b>}\n</>;', 'JSXFragment');

		expect(fragment.children.map((child) => child.type)).toEqual(['JSXCodeBlock']);
	});

	it('parses an @if directive inside an element nested in an expression container', () => {
		const directive = findNode(
			inExpressionContainer(`@if (ok) { <span>x</span> }`),
			'JSXIfExpression',
		);

		expect(directive?.type).toBe('JSXIfExpression');
		expect(blockBody(directive.consequent).map((child) => child.type)).toEqual(['JSXElement']);
	});

	it('parses an @if/@else directive inside an element nested in an expression container', () => {
		const directive = findNode(
			inExpressionContainer(`@if (ok) { <span>a</span> } @else { <span>b</span> }`),
			'JSXIfExpression',
		);

		expect(directive?.type).toBe('JSXIfExpression');
		expect(directive.alternate?.type).toBe('BlockStatement');
	});

	it('spans a directive clause that follows the block, for every directive', () => {
		// A directive's range has to cover its trailing clause: consumers slice
		// source by it (editor position mappings, formatters, diagnostics), and a
		// range that stops at the first block truncates the statement.
		// `@else`/`@pending`/`@catch` come for free because the statement parse
		// consumes them; `@empty` is attached after the node is finished.
		const cases = [
			['JSXIfExpression', `@if (ok) { <b>a</b> } @else { <i>b</i> }`, '@else'],
			['JSXForExpression', `@for (const x of xs) { <b>{x}</b> } @empty { <i>none</i> }`, '@empty'],
			[
				'JSXTryExpression',
				`@try { <b>a</b> } @pending { <i>l</i> } @catch (e) { <u>e</u> }`,
				'@catch',
			],
		];
		for (const [type, template, clause] of /** @type {Array<[NodeTypeName, string, string]>} */ (
			cases
		)) {
			const source = `export default function App() @{\n\t<div>\n\t\t${template}\n\t</div>\n}\n`;
			const directive = findNode(source, type);
			expect(directive, type).toBeDefined();
			expect(source.slice(directive.start, directive.end), type).toContain(clause);
			expect(source.slice(directive.start, directive.end), type).toBe(template);
		}
	});

	it('parses an @for directive inside an element nested in an expression container', () => {
		const directive = findNode(
			inExpressionContainer(`@for (const item of items) { <li>{item}</li> }`),
			'JSXForExpression',
		);

		expect(directive?.type).toBe('JSXForExpression');
		expect(directive.statementType).toBe('ForOfStatement');
	});

	it('parses an @switch directive inside an element nested in an expression container', () => {
		const directive = findNode(
			inExpressionContainer(
				`@switch (k) { @case 1: { <span>a</span> } @default: { <span>b</span> } }`,
			),
			'JSXSwitchExpression',
		);

		expect(directive?.type).toBe('JSXSwitchExpression');
	});

	it('parses an @try/@catch directive inside an element nested in an expression container', () => {
		const directive = findNode(
			inExpressionContainer(`@try { <span>a</span> } @catch (e) { <span>b</span> }`),
			'JSXTryExpression',
		);

		expect(directive?.type).toBe('JSXTryExpression');
		expect(directive.handler?.type).toBe('CatchClause');
	});

	it('parses a directive attribute value on an element with children', () => {
		// The directive's block parse restores a context-stack snapshot taken
		// inside the attribute's `{ }` container; the stale entries it leaves
		// made the `>` that finishes the opening tag lex as a relational
		// operator (self-closing parents were unaffected because `/>` has its
		// own tokenizer repair).
		const element = findElement(
			`export function FeatureCard() @{
				<ElementA prop={ @if (ok) { <div /> } }><ElementB /></ElementA>
			}`,
			'ElementA',
		);

		const [attribute] = element.openingElement.attributes;
		assert_type(attribute, 'JSXAttribute');
		expect(attribute.value?.type).toBe('JSXExpressionContainer');
		expect(attributeExpression(attribute).type).toBe('JSXIfExpression');
		expect(element.children.map((child) => child.type)).toEqual(['JSXElement']);
		expect(as_type(child(element, 0, 'JSXElement').openingElement.name, 'JSXIdentifier').name).toBe(
			'ElementB',
		);
	});

	it('parses a directive attribute value on a self-closing element', () => {
		// The self-closing form predates the container-baseline repair (the `/>`
		// tokenizer fix-up made it work); keep it covered so both tag endings
		// stay in sync, including a sibling after the tag, where stale contexts
		// would surface.
		const element = findElement(
			`export function FeatureCard() @{
				<><ElementA prop={ @if (ok) { <div /> } } /><ElementB /></>
			}`,
			'ElementA',
		);

		expect(element.openingElement.selfClosing).toBe(true);
		expect(element.closingElement).toBe(null);
		const [attribute] = element.openingElement.attributes;
		assert_type(attribute, 'JSXAttribute');
		expect(attributeExpression(attribute).type).toBe('JSXIfExpression');
		expect(element.children).toEqual([]);
	});

	it('parses a fragment-wrapped directive attribute value on an element with children', () => {
		// Unlike the bare-directive case, the container's first token here is the
		// fragment's `<`, whose tag contexts must not count toward the depth the
		// stack unwinds to when the container closes — otherwise the `>` after
		// `}` lexes as template text.
		const element = findElement(
			`export function FeatureCard() @{
				<ElementA prop={<>@if (ok) { <div>1</div> } @else { <div>2</div> }</>}></ElementA>
			}`,
			'ElementA',
		);

		const [attribute] = element.openingElement.attributes;
		assert_type(attribute, 'JSXAttribute');
		expect(attribute.value?.type).toBe('JSXExpressionContainer');
		expect(attributeExpression(attribute).type).toBe('JSXFragment');
		const [directive] = node_children(attributeExpression(attribute));
		assert_type(directive, 'JSXIfExpression');
		expect(directive.alternate?.type).toBe('BlockStatement');
	});

	it('parses an element-wrapped directive attribute value', () => {
		// The host element's `templateMode` is still `'script'` while its opening
		// tag parses, which routed the attribute value's element to the vanilla
		// JSX parser — turning the directive into literal text. An inline template
		// value must parse the same as one assigned to a variable first.
		const element = findElement(
			`export function FeatureCard() @{
				<ElementA prop={<h1>
					@if (ok) { <div>1</div> } @else { <div>2</div> }
				</h1>} />
			}`,
			'ElementA',
		);

		const [attribute] = element.openingElement.attributes;
		assert_type(attribute, 'JSXAttribute');
		expect(attribute.value?.type).toBe('JSXExpressionContainer');
		expect(attributeExpression(attribute).type).toBe('JSXElement');
		const directive = node_children(attributeExpression(attribute)).find(
			(child) => child.type === 'JSXIfExpression',
		);
		assert_type(directive, 'JSXIfExpression');
		expect(directive.alternate?.type).toBe('BlockStatement');
	});

	it('parses an element-wrapped directive attribute value with no whitespace around the directive', () => {
		// With no gap after `<h1>`, the vanilla-parsed text token began exactly at
		// the `@`, so the at-sign expression intercept re-parsed it as a directive
		// inside an otherwise untransformed subtree — crashing the printer.
		// Whether `@if` is a directive must not depend on leading whitespace.
		const element = findElement(
			`export function FeatureCard() @{
				<ElementA prop={<h1>@if (ok) { <div>1</div> } @else { <div>2</div> }</h1>} />
			}`,
			'ElementA',
		);

		const [attribute] = element.openingElement.attributes;
		assert_type(attribute, 'JSXAttribute');
		expect(attributeExpression(attribute).type).toBe('JSXElement');
		const [directive] = node_children(attributeExpression(attribute));
		assert_type(directive, 'JSXIfExpression');
		expect(directive.alternate?.type).toBe('BlockStatement');
	});

	it('keeps text before and after a directive in an element-wrapped attribute value', () => {
		// The tokenizer's raw-text loop used to re-anchor at the directive's `@`
		// (and at `=`), silently dropping the text it had already accumulated —
		// container-nested elements lost everything before the directive.
		const element = findElement(
			`export function FeatureCard() @{
				<ElementA prop={<h1>before @if (ok) { <div>1</div> } @else { <div>2</div> } after</h1>} />
			}`,
			'ElementA',
		);

		const [attribute] = element.openingElement.attributes;
		assert_type(attribute, 'JSXAttribute');
		expect(node_children(attributeExpression(attribute)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXIfExpression',
			'JSXText',
		]);
		const [before, , after] = node_children(attributeExpression(attribute));
		expect(as_type(before, 'JSXText').value).toBe('before ');
		expect(as_type(after, 'JSXText').value).toBe(' after');
	});

	it('keeps text before and after a directive in an element nested in an expression container', () => {
		const element = findElement(
			`export function FeatureCard() @{
				<div>{<h1>before @if (ok) { <div>1</div> } @else { <div>2</div> } after</h1>}</div>
			}`,
			'h1',
		);

		expect(element.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXIfExpression',
			'JSXText',
		]);
		const [before, , after] = element.children;
		expect(as_type(before, 'JSXText').value).toBe('before ');
		expect(as_type(after, 'JSXText').value).toBe(' after');
	});

	it('keeps a significant inline space between a sibling element and a directive in every position', () => {
		// Sibling whitespace is rendered by the browser (`<a></a> <li>` shows a
		// space), so it must not depend on which construct the template sits in.
		// The tokenizer used to drop it at the directive's `@` in container and
		// attribute positions, inside `@switch` bodies (JS switch label bail),
		// and inside value-position directives (template-script depth bail).
		const host = `<h1><a /> @if (ok) { <li>x</li> }</h1>`;
		const positions = [
			['template child', `function App({ ok }) @{ <div>${host}</div> }`],
			['directive render body', `function App({ ok }) @{ @if (ok) { ${host} } }`],
			[
				'directive value',
				`function App({ ok }) @{ const v = @if (ok) { ${host} }; <div>{v}</div> }`,
			],
			['@switch case body', `function App({ ok, c }) @{ @switch (c) { @case 1: { ${host} } } }`],
			['attribute value', `function App({ ok }) @{ <ElementA prop={${host}} /> }`],
			['expression container child', `function App({ ok }) @{ <div>{${host}}</div> }`],
		];

		for (const [position, source] of positions) {
			const element = findElement(source, 'h1');
			expect(
				element.children.map((child) => child.type),
				position,
			).toEqual(['JSXElement', 'JSXText', 'JSXIfExpression']);
			expect(child(element, 1, 'JSXText').value, position).toBe(' ');
		}
	});

	it('still drops layout indentation before a directive', () => {
		// Whitespace containing a newline is layout, not content — the JSX
		// significant-whitespace rule removes it in every position.
		const element = findElement(
			`function App({ ok, c }) @{
				const v = @switch (c) { @case 1: { <h1><a />
					@if (ok) { <li>x</li> }
				</h1> } };
				<div>{v}</div>
			}`,
			'h1',
		);

		expect(element.children.map((child) => child.type)).toEqual(['JSXElement', 'JSXIfExpression']);
	});

	it('keeps text around `=` inside a container-nested element', () => {
		// `=` is a raw-text bail boundary like `@`; the accumulated run before it
		// used to be discarded in expression-container positions.
		for (const [position, source] of [
			['expression container child', `function App() @{ <div>{<h1>a = b</h1>}</div> }`],
			['attribute value', `function App() @{ <ElementA prop={<h1>a = b</h1>} /> }`],
		]) {
			const element = findElement(source, 'h1');
			expect(
				element.children.map((child) => child.type),
				position,
			).toEqual(['JSXText']);
			expect(child(element, 0, 'JSXText').value, position).toBe('a = b');
		}
	});

	it('parses an attribute that follows a directive attribute value', () => {
		const element = findElement(
			`export function FeatureCard() @{
				<ElementA a={ @if (ok) { <div /> } } b="x">text</ElementA>
			}`,
			'ElementA',
		);

		const [a, b] = element.openingElement.attributes;
		expect(attributeExpression(a).type).toBe('JSXIfExpression');
		expect(as_type(b, 'JSXAttribute').name.name).toBe('b');
		expect(as_type(as_type(b, 'JSXAttribute').value, 'Literal').value).toBe('x');
	});

	it('preserves element-text whitespace inside a directive in an expression container', () => {
		const span = findElement(inExpressionContainer(`@if (ok) { <span>   keep</span> }`), 'span');

		expect(span.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(span, 0, 'JSXText').value).toBe('   keep');
	});

	it('parses a multiline parenthesized self-closing element in an expression', () => {
		const ast = parseModule(
			`const value = (
				<Item />
			);
			const after = true;`,
			'App.tsrx',
		);

		const [valueDeclaration, afterDeclaration] = ast.body;
		const value = declaratorInit(valueDeclaration);
		assert_type(value, 'JSXElement');
		expect(openingName(value).name).toBe('Item');
		expect(as_type(declaratorInit(afterDeclaration), 'Literal').value).toBe(true);
	});

	it('parses a return ternary from a self-closing element to a fragment', () => {
		const returned = getReturnedExpression(
			`function App(condition) {
				return condition ? (
					<Item />
				) : (
					<>
						<Item />
					</>
				);
			}`,
		);

		assert_type(returned, 'ConditionalExpression');
		expect(returned.consequent.type).toBe('JSXElement');
		expect(returned.alternate.type).toBe('JSXFragment');
		expect(node_children(returned.alternate).map((child) => child.type)).toEqual(['JSXElement']);
	});

	it('parses a return ternary from a self-closing element to an array', () => {
		const returned = getReturnedExpression(
			`function App(condition) {
				return condition ? (
					<Item />
				) : (
					[<Item />]
				);
			}`,
		);

		assert_type(returned, 'ConditionalExpression');
		expect(returned.consequent.type).toBe('JSXElement');
		expect(returned.alternate.type).toBe('ArrayExpression');
		expect(arrayElements(returned.alternate).map((element) => element.type)).toEqual([
			'JSXElement',
		]);
	});

	it('parses same-line JSX elements in an array expression', () => {
		const ast = parseModule(
			'const fruits = [<Item key="apple">Apple</Item>, <Item key="banana">Banana</Item>];',
			'App.tsx',
		);

		const fruits = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(fruits, 'ArrayExpression');
		expect(arrayElements(fruits).map((element) => element.type)).toEqual([
			'JSXElement',
			'JSXElement',
		]);
		expect(arrayElements(fruits).map((element) => child(element, 0, 'JSXText').value)).toEqual([
			'Apple',
			'Banana',
		]);
	});

	it('parses a same-line JSX array inside an expression child', () => {
		const returned = getReturned(
			`function App() {
				return <Item title="Root">{[<Item key="c1">A</Item>, <Item key="c2">B</Item>] as any}</Item>;
			}`,
		);

		const array = as_type(
			child(returned, 0, 'JSXExpressionContainer').expression,
			'TSAsExpression',
		).expression;
		assert_type(array, 'ArrayExpression');
		expect(arrayElements(array).map((element) => element.type)).toEqual([
			'JSXElement',
			'JSXElement',
		]);
		expect(arrayElements(array).map((element) => child(element, 0, 'JSXText').value)).toEqual([
			'A',
			'B',
		]);
	});

	it('preserves template text after a self-closing child', () => {
		const returned = getReturned(
			`function App() {
				return <div>
					<Item />
					tail
				</div>;
			}`,
		);

		expect(node_children(returned).map((child) => child.type)).toEqual(['JSXElement', 'JSXText']);
		expect(child(returned, 1, 'JSXText').value).toContain('tail');
	});

	it('parses a ternary with JSX element branches inside an expression container', () => {
		const returned = getReturned(
			`function App() {
				return <>{cond ? <div>yes</div> : <span>no</span>}</>;
			}`,
		);

		const expression = child(returned, 0, 'JSXExpressionContainer').expression;
		assert_type(expression, 'ConditionalExpression');
		expect(expression.consequent.type).toBe('JSXElement');
		expect(expression.alternate.type).toBe('JSXElement');
	});

	it('parses a ternary with JSX fragment branches inside an expression container', () => {
		const returned = getReturned(
			`function App() {
				return <>{cond ? <>yes</> : <>no</>}</>;
			}`,
		);

		const expression = child(returned, 0, 'JSXExpressionContainer').expression;
		assert_type(expression, 'ConditionalExpression');
		expect(expression.consequent.type).toBe('JSXFragment');
		expect(expression.alternate.type).toBe('JSXFragment');
	});

	it('parses a nested ternary with JSX element branches inside an expression container', () => {
		const returned = getReturned(
			`function App() {
				return <>{a ? <div>1</div> : b ? <div>2</div> : <div>3</div>}</>;
			}`,
		);

		const outer = child(returned, 0, 'JSXExpressionContainer').expression;
		assert_type(outer, 'ConditionalExpression');
		expect(outer.consequent.type).toBe('JSXElement');
		expect(outer.alternate.type).toBe('ConditionalExpression');
		expect(as_type(outer.alternate, 'ConditionalExpression').consequent.type).toBe('JSXElement');
		expect(as_type(outer.alternate, 'ConditionalExpression').alternate.type).toBe('JSXElement');
	});

	it('parses a parenthesized multiline element with nested children in a ternary branch', () => {
		const returned = getReturned(
			`function App({ cond }) {
				return <div>
					{cond
						? (<Outer>
								<Inner>hi</Inner>
							</Outer>)
						: null}
				</div>;
			}`,
		);

		const expression = as_type(
			found(node_children(returned).find((child) => child.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		).expression;
		assert_type(expression, 'ConditionalExpression');
		expect(expression.consequent.type).toBe('JSXElement');
		expect(openingName(as_type(expression.consequent, 'JSXElement')).name).toBe('Outer');
		const inner = node_children(expression.consequent).find((child) => child.type === 'JSXElement');
		expect(openingName(as_type(inner, 'JSXElement')).name).toBe('Inner');
		expect(child(found(inner), 0, 'JSXText').value).toBe('hi');
		expect(expression.alternate.type).toBe('Literal');
		expect(as_type(expression.alternate, 'Literal').value).toBeNull();
	});

	it('preserves element-text whitespace in ternary branches inside an expression container', () => {
		const span = findElement(
			`function App() {
				return <>{cond ? <div>a</div> : <span>   keep</span>}</>;
			}`,
			'span',
		);

		expect(span.children.map((child) => child.type)).toEqual(['JSXText']);
		expect(child(span, 0, 'JSXText').value).toBe('   keep');
	});

	it('keeps line comments out of plain JSX fragment output', () => {
		const ast = parseModule(
			`export const FeatureCard = () => <>
				// This is a JS comment, not text.
				<div />
			</>;`,
			'App.tsrx',
		);

		const value = as_type(declaratorInit(exportedDeclaration(ast)), 'ArrowFunctionExpression').body;
		expect(node_children(value).map((child) => child.type)).toEqual(['JSXElement']);
		expect(as_type(child(value, 0, 'JSXElement').openingElement.name, 'JSXIdentifier').name).toBe(
			'div',
		);
	});

	it('treats JS-looking fragment content as JSXText', () => {
		const ast = parseModule(
			`export const FeatureCard = () => <>
				const x = 1
			</>;`,
			'App.tsrx',
		);

		const value = as_type(declaratorInit(exportedDeclaration(ast)), 'ArrowFunctionExpression').body;
		expect(node_children(value).map((child) => child.type)).toEqual(['JSXText']);
		expect(child(value, 0, 'JSXText').value).toContain('const x = 1');
	});

	// Collect every JSXText value in the tree, and parse with `collect` so the
	// recorded comments can be asserted alongside the text they were removed from.
	/** @param {string} source */
	function parseTemplateTextsAndComments(source) {
		/** @type {import('estree').Comment[]} */
		/** @type {AST.CommentWithLocation[]} */
		const comments = [];
		const ast = parseModule(source, 'App.tsrx', { collect: true, comments });
		/** @type {string[]} */
		const texts = [];
		for (const node of allNodes(ast)) {
			if (node.type === 'JSXText') texts.push(node.value);
		}
		comments.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
		return { texts, comments };
	}

	it('strips block and line comments from template text and records them as comments', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function TodoList() @{
  <>
    /* world 0 */
    // hello
    /* world 1 */
    <ul>
    // hello
    /* world 2 */

    </ul>

    <ul>
    // hello
    /* world 3 */
    // hello
    </ul>
    /* world 4 */
  </>
  }`);

		for (const text of texts) {
			expect(text).not.toMatch(/world|hello|\/\*|\/\//);
		}
		expect(comments.filter((comment) => comment.type === 'Block').map((c) => c.value)).toEqual([
			' world 0 ',
			' world 1 ',
			' world 2 ',
			' world 3 ',
			' world 4 ',
		]);
		expect(comments.filter((comment) => comment.type === 'Line').map((c) => c.value)).toEqual([
			' hello',
			' hello',
			' hello',
			' hello',
		]);
	});

	it('strips a block comment between words of template text', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
	<div>hello /* note */ world</div>
}`);

		expect(texts).toEqual(['hello  world']);
		expect(comments.map((comment) => comment.value)).toEqual([' note ']);
	});

	it('strips a block comment that is the only element content', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
	<div>/* note */</div>
}`);

		expect(texts).toEqual([]);
		expect(comments.map((comment) => comment.value)).toEqual([' note ']);
	});

	it('records a block comment before a closing fragment exactly once', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
<>
<ul></ul>
/* z */
</>
}`);

		for (const text of texts) {
			expect(text).not.toContain('z');
		}
		expect(comments.map((comment) => comment.type + ':' + comment.value)).toEqual(['Block: z ']);
	});

	it('keeps // inside template text when it is not at line start', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
	<div>visit https://x.com please</div>
}`);

		expect(texts).toEqual(['visit https://x.com please']);
		expect(comments).toEqual([]);
	});

	it('keeps // after text on the same line as literal text', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
	<div>hi // note</div>
}`);

		expect(texts).toEqual(['hi // note']);
		expect(comments).toEqual([]);
	});

	it('parses a trailing line comment after a `@{ }` code block on the same line', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function StatusBadge0() @{
	<>
		@{@{@{<>hello @{222}</>}}}  // <-- depth 4
	</>
}`);

		expect(texts).toEqual(['hello ']);
		expect(comments.map((comment) => comment.type + ':' + comment.value)).toEqual([
			'Line: <-- depth 4',
		]);
	});

	it('parses a trailing line comment after an element on the same line', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
	<div><b>z</b> // note
	tail</div>
}`);

		// The text starts at the closing tag, as after a self-closing tag, and
		// leaves the comment out
		expect(texts).toEqual(['z', ' \n\ttail']);
		expect(comments.map((comment) => comment.type + ':' + comment.value)).toEqual(['Line: note']);
	});

	it('parses a trailing line comment after an expression container on the same line', () => {
		const { texts, comments } = parseTemplateTextsAndComments(`function App() @{
	<div>{x} // note
	tail</div>
}`);

		expect(texts).toEqual([' \n\ttail']);
		expect(comments.map((comment) => comment.type + ':' + comment.value)).toEqual(['Line: note']);
	});

	it('keeps ordinary tag names as JSX identifiers', () => {
		const ast = parseModule('const wrapper = <tsrx><div /></tsrx>;', 'App.tsrx');

		const value = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(value, 'JSXElement');
		expect(openingName(value).name).toBe('tsrx');
		expect(value.children[0].type).toBe('JSXElement');
	});

	it('parses style blocks as JSXStyleElement nodes', () => {
		const returned = getReturned(`function App() { return <style>
			.root {
				color: red;
			}
		</style>; }`);

		assert_type(returned, 'JSXStyleElement');
		expect(openingName(returned).name).toBe('style');
		expect(returned.children.map((child) => child.type)).toEqual(['StyleSheet']);
		expect(returned.css).toContain('color: red');
		expect(returned.metadata.styleScopeHash).toBe(returned.children[0].hash);
	});

	it('parses empty style blocks inside fragments', () => {
		const returned = getReturned('function App() { return <><style></style></>; }');

		assert_type(returned, 'JSXFragment');
		expect(returned.children.map((child) => child.type)).toEqual(['JSXStyleElement']);
		expect(child(returned, 0, 'JSXStyleElement').css).toBe('');
		expect(node_children(returned.children[0]).map((child) => child.type)).toEqual(['StyleSheet']);
	});

	it('recovers an unclosed style in loose mode and keeps later siblings', function () {
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(
			`export function App() @{
				<>
					<style>
					<div />
				</>
			}`,
			'App.tsrx',
			{ loose: true, collect: true, errors },
		);

		assert_type(ast, 'Program');
		expect(
			errors
				.map(function (error) {
					return error.message;
				})
				.join('\n'),
		).not.toContain('Expected identifier');

		const fragment = find_first(ast, function (node) {
			return node.type === 'JSXFragment';
		});
		assert_type(fragment, 'JSXFragment');
		expect(
			fragment.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXStyleElement', 'JSXElement']);
		const style = child(fragment, 0, 'JSXStyleElement');
		expect(style.css?.trim()).toBe('');
		expect(style.unclosed).toBe(true);
		expect(style.closingElement).toBeNull();
		expect(openingName(child(fragment, 1, 'JSXElement')).name).toBe('div');
	});

	it('captures partial CSS after an unclosed style up to the next sibling', function () {
		const source = `export function App() @{
	<>
		<style>
			.foo { color: red; }
			.bar {
		<div />
	</>
}`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(errors).toEqual([]);

		const fragment = find_first(ast, function (node) {
			return node.type === 'JSXFragment';
		});
		assert_type(fragment, 'JSXFragment');
		expect(
			fragment.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXStyleElement', 'JSXElement']);

		const style = child(fragment, 0, 'JSXStyleElement');
		expect(style.unclosed).toBe(true);
		expect(style.css).toBe('\n\t\t\t.foo { color: red; }\n\t\t\t.bar {\n\t\t');
		expect(style.end).toBe(source.indexOf('<div />'));
		expect(style.loc?.end.line).toBe(6);
		expect(style.loc?.end.column).toBe(2);
		const sheet = /** @type {{ type: string; children: Array<{ type: string }> }} */ (
			style.children[0]
		);
		expect(sheet.type).toBe('StyleSheet');
		expect(sheet.children.map((rule) => rule.type)).toEqual(['Rule']);

		const div = child(fragment, 1, 'JSXElement');
		expect(openingName(div).name).toBe('div');
		expect(div.loc?.start.line).toBe(6);
		expect(div.loc?.start.column).toBe(2);
	});

	it('stops the unclosed style body at a dynamic tag start', function () {
		const source = `const Tag = 'b';
export function App() @{
	<>
		<style>
			.foo { color: red; }
		<{Tag} />
	</>
}`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(errors).toEqual([]);

		const fragment = find_first(ast, function (node) {
			return node.type === 'JSXFragment';
		});
		assert_type(fragment, 'JSXFragment');
		expect(
			fragment.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXStyleElement', 'JSXElement']);
		expect(child(fragment, 0, 'JSXStyleElement').css).toBe('\n\t\t\t.foo { color: red; }\n\t\t');
		expect(child(fragment, 1, 'JSXElement').isDynamic).toBe(true);
	});

	it('keeps a `<` inside CSS text in the unclosed style body', function () {
		const source = `export function App() @{
	<>
		<style>
			.foo::before { content: "<"; }
			/* < is not a tag */
		<div />
	</>
}`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(errors).toEqual([]);

		const fragment = find_first(ast, function (node) {
			return node.type === 'JSXFragment';
		});
		assert_type(fragment, 'JSXFragment');
		expect(
			fragment.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXStyleElement', 'JSXElement']);
		const style = child(fragment, 0, 'JSXStyleElement');
		expect(style.css).toContain('content: "<";');
		expect(style.css).toContain('/* < is not a tag */');
		expect(style.end).toBe(source.indexOf('<div />'));
		expect(openingName(child(fragment, 1, 'JSXElement')).name).toBe('div');
	});

	it('captures the rest of the file after an unclosed module-scope style', function () {
		const source = `const theme = <style>
	.card { color: red; }
export function App() @{ <div /> }`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(errors).toEqual([]);
		expect(ast.body.map((statement) => statement.type)).toEqual(['VariableDeclaration']);

		const style = find_first(ast, function (node) {
			return node.type === 'JSXStyleElement';
		});
		assert_type(style, 'JSXStyleElement');
		expect(style.unclosed).toBe(true);
		expect(style.css).toBe(source.slice(source.indexOf('>') + 1));
		expect(style.end).toBe(source.length);
	});

	it('recovers an unclosed script in loose mode and keeps later siblings', function () {
		const source = `export function App() @{
	<>
		<script>
			console.log(1);
		<div />
	</>
}`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(errors).toEqual([]);

		const fragment = find_first(ast, function (node) {
			return node.type === 'JSXFragment';
		});
		assert_type(fragment, 'JSXFragment');
		expect(
			fragment.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXElement', 'JSXElement']);

		const script = child(fragment, 0, 'JSXElement');
		expect(openingName(script).name).toBe('script');
		expect(script.unclosed).toBe(true);
		expect(script.content).toBe('\n\t\t\tconsole.log(1);\n\t\t');
		expect(script.end).toBe(source.indexOf('<div />'));
		expect(openingName(child(fragment, 1, 'JSXElement')).name).toBe('div');
	});

	it('keeps an unclosed style inside an element so later siblings stay JSX children', function () {
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(
			`export function App() @{
				<section>
					<style>
					<span />
				</section>
			}`,
			'App.tsrx',
			{ loose: true, collect: true, errors },
		);

		assert_type(ast, 'Program');
		expect(
			errors
				.map(function (error) {
					return error.message;
				})
				.join('\n'),
		).not.toContain('Expected identifier');

		const section = find_first(ast, function (node) {
			return (
				node.type === 'JSXElement' &&
				node.openingElement?.name?.type === 'JSXIdentifier' &&
				node.openingElement.name.name === 'section'
			);
		});
		assert_type(section, 'JSXElement');
		expect(
			section.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXStyleElement', 'JSXElement']);
		expect(child(section, 0, 'JSXStyleElement').unclosed).toBe(true);
		expect(openingName(child(section, 1, 'JSXElement')).name).toBe('span');
		expect(section.unclosed).toBeFalsy();
	});

	it('keeps same-line siblings after an unclosed style on the opening-tag line', function () {
		const source = `export function App() @{ <><style><span /></>
}`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(
			errors
				.map(function (error) {
					return error.message;
				})
				.join('\n'),
		).not.toContain('Expected identifier');

		const fragment = find_first(ast, function (node) {
			return node.type === 'JSXFragment';
		});
		assert_type(fragment, 'JSXFragment');
		const style = child(fragment, 0, 'JSXStyleElement');
		const span = child(fragment, 1, 'JSXElement');
		expect(style.unclosed).toBe(true);
		expect(openingName(span).name).toBe('span');
		expect(span.loc?.start.line).toBe(style.loc?.end.line);
		expect(span.loc?.start.column).toBeGreaterThanOrEqual(0);
		expect(span.loc?.start.column).toBe(style.loc?.end.column);
	});

	it('recovers when an unclosed style is immediately followed by a parent close', function () {
		// `<style>` then `</div>` with no body: expect('>') has already
		// tokenized the parent `</` and pushed its tag contexts. Recovery
		// must not pop those frames (that used to read `/` as a regexp).
		const source = 'export function App() @{ <div><style></div> }';
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { loose: true, collect: true, errors });

		assert_type(ast, 'Program');
		expect(
			errors
				.map(function (error) {
					return error.message;
				})
				.join('\n'),
		).not.toContain('Expected identifier');
		expect(
			errors
				.map(function (error) {
					return error.message;
				})
				.join('\n'),
		).not.toContain('Unterminated regular expression');

		const div = find_first(ast, function (node) {
			return (
				node.type === 'JSXElement' &&
				node.openingElement?.name?.type === 'JSXIdentifier' &&
				node.openingElement.name.name === 'div'
			);
		});
		assert_type(div, 'JSXElement');
		expect(
			div.children.map(function (child) {
				return child.type;
			}),
		).toEqual(['JSXStyleElement']);
		expect(child(div, 0, 'JSXStyleElement').unclosed).toBe(true);
		expect(div.unclosed).toBeFalsy();
		expect(div.closingElement).toBeTruthy();
	});

	it('parses module-scope style expressions followed by JavaScript statements', () => {
		const source = `const styles = <style>
			.card {
				color: red;
			}
		</style>;

		describe('card', () => {});
		export function App() {
			return <div class={styles.card} />;
		}`;
		const ast = parseModule(source, 'App.tsrx');
		const style = declaratorInit(firstStatement(ast, 'VariableDeclaration'));

		expect(ast.body.map((node) => node.type)).toEqual([
			'VariableDeclaration',
			'ExpressionStatement',
			'ExportNamedDeclaration',
		]);
		assert_type(style, 'JSXStyleElement');
		expect(style.end).toBe(source.indexOf('</style>') + '</style>'.length);
		expect(style.css).toContain('.card');
	});

	it('ends an assigned style block declarator after the closing tag', () => {
		for (const terminator of ['', ';']) {
			const source = `const theme = <style>\n  .card {\n    color: red;\n  }\n</style>${terminator}\nexport { theme }\n`;
			const ast = parseModule(source, 'App.tsrx');
			const declaration = firstStatement(ast, 'VariableDeclaration');
			const [declarator] = declaration.declarations;
			const style = as_type(declarator.init, 'JSXStyleElement');
			const style_end = source.indexOf('</style>') + '</style>'.length;

			expect(style.end).toBe(style_end);
			expect(declarator.end).toBe(style_end);
			expect(found(declarator.loc).end).toEqual(found(style.loc).end);
			expect(declaration.end).toBe(style_end + terminator.length);
			expect(found(declaration.loc).end).toEqual({ line: 5, column: 8 + terminator.length });
		}

		const object = findNode(
			'const themes = {\n  card: <style>\n    .card { color: red; }\n  </style>,\n};',
			'Property',
		);
		expect(object.end).toBe(as_type(object.value, 'JSXStyleElement').end);
	});

	it('parses top-level markup holding a style or script block before a final newline', () => {
		for (const [tag, type] of [
			['style', 'JSXStyleElement'],
			['script', 'JSXElement'],
		]) {
			for (const body of ['p { color: red; }', '']) {
				for (const sibling of ['', '\n  <span>x</span>']) {
					const ast = parseModule(
						`<div>\n  <${tag}>${body}</${tag}>${sibling}\n</div>\n`,
						'App.tsrx',
					);
					const element = firstStatement(ast, 'JSXElement');
					expect(ast.body).toHaveLength(1);
					expect(
						element.children.filter((node) => node.type !== 'JSXText').map((node) => node.type),
					).toEqual(sibling ? [type, 'JSXElement'] : [type]);
				}
			}
		}
	});

	it('does not add component style scope metadata to head styles', () => {
		const returned = getReturned(`function App() { return <head>
			<style>
				body {
					margin: 0;
				}
			</style>
		</head>; }`);

		const style = node_children(returned).find((child) => child.type === 'JSXStyleElement');
		assert_found(style);
		expect(style.children.map((child) => child.type)).toEqual(['StyleSheet']);
		expect(style.metadata.styleScopeHash).toBeUndefined();
	});

	describe('style syntax spec table', () => {
		// Replays `tests/utils/fixtures/style-syntax.js`, the dependency-free table
		// that doubles as the porting spec for the Rust parser (`oxc-tsrx`). Each
		// case is plain data: a `locate(ast)` walk plus a structural `expected`
		// shape (see the fixture header for the shape vocabulary) or an `error`.

		/** @typedef {import('./fixtures/style-syntax.js').Shape} Shape */

		/**
		 * @param {unknown} node
		 * @param {Shape} shape
		 */
		function assert_shape(node, shape) {
			assert_found(node);
			const actual = /** @type {AST.Node} */ (node);
			expect(actual.type).toBe(shape.type);
			switch (shape.type) {
				case 'JSXStyleElement':
					assert_style_shape(as_type(actual, 'JSXStyleElement'), shape);
					break;
				case 'JSXElement': {
					const element = as_type(actual, 'JSXElement');
					expect(openingName(element).name).toBe(shape.name);
					if (shape.children) {
						assert_shapes(
							element.children.filter(
								(child) => child.type !== 'JSXText' || child.value.trim() !== '',
							),
							shape.children,
						);
					}
					break;
				}
				case 'JSXFragment':
					assert_shapes(as_type(actual, 'JSXFragment').children, shape.children);
					break;
				case 'JSXCodeBlock': {
					const block = codeBlock(actual);
					assert_shapes(block.body, shape.body);
					if (shape.render === null) expect(block.render).toBeNull();
					else assert_shape(block.render, shape.render);
					break;
				}
				case 'JSXIfExpression': {
					const directive = as_type(actual, 'JSXIfExpression');
					assert_clause(directive.consequent, shape.consequent);
					assert_clause(directive.alternate, shape.alternate);
					break;
				}
				case 'JSXForExpression': {
					const directive = as_type(actual, 'JSXForExpression');
					assert_clause(directive.body, shape.body);
					assert_clause(directive.empty, shape.empty);
					break;
				}
				case 'JSXSwitchExpression': {
					const directive = as_type(actual, 'JSXSwitchExpression');
					expect(directive.cases.length).toBe(shape.cases.length);
					directive.cases.forEach((switch_case, index) => {
						const expected_case = shape.cases[index];
						expect(switch_case.test?.type ?? null).toBe(expected_case.test);
						assert_shapes(switch_case.consequent, expected_case.consequent);
					});
					break;
				}
				case 'JSXTryExpression': {
					const directive = as_type(actual, 'JSXTryExpression');
					assert_clause(directive.block, shape.block);
					assert_clause(directive.pending, shape.pending);
					assert_clause(directive.handler?.body, shape.handler);
					break;
				}
				default:
					// Any other statement (setup code) is matched on `type` alone.
					break;
			}
		}

		/**
		 * @param {AST.JSXStyleElement} style
		 * @param {Extract<Shape, { type: 'JSXStyleElement' }>} shape
		 */
		function assert_style_shape(style, shape) {
			expect(openingName(style).name).toBe('style');
			expect(style.openingElement.selfClosing).toBe(shape.selfClosing);
			expect(
				style.openingElement.attributes.map((attribute) =>
					attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier'
						? attribute.name.name
						: attribute.type,
				),
			).toEqual(shape.attributes);
			if ('apply' in shape) {
				const apply = style.openingElement.attributes.find(
					(attribute) =>
						attribute.type === 'JSXAttribute' &&
						attribute.name.type === 'JSXIdentifier' &&
						attribute.name.name === 'apply',
				);
				expect(attributeExpression(apply).type).toBe(shape.apply);
			}
			expect(style.children.map((child) => child.type)).toEqual(shape.children);
			expect(style.css).toBe(shape.css);
			expect(style.metadata.styleScopeHash !== undefined).toBe(shape.hasScopeHash);
			if (shape.hasScopeHash) {
				expect(style.metadata.styleScopeHash).toBe(style.children[0]?.hash);
			}
			expect(style.closingElement !== null && style.closingElement !== undefined).toBe(
				shape.closingElement,
			);
		}

		/**
		 * A directive clause: `null` when the shape says it is absent, otherwise a
		 * block whose statements match the listed shapes in source order.
		 *
		 * @param {AST.Node | null | undefined} block
		 * @param {Shape[] | null} shapes
		 */
		function assert_clause(block, shapes) {
			if (shapes === null) {
				expect(block ?? null).toBeNull();
				return;
			}
			assert_shapes(blockBody(block), shapes);
		}

		/**
		 * @param {AST.Node[]} nodes
		 * @param {Shape[]} shapes
		 */
		function assert_shapes(nodes, shapes) {
			expect(nodes.map((node) => node.type)).toEqual(shapes.map((shape) => shape.type));
			nodes.forEach((node, index) => assert_shape(node, shapes[index]));
		}

		for (const spec of STYLE_SYNTAX_CASES) {
			it(spec.name, () => {
				/** @type {CompileError[]} */
				const errors = [];
				const ast = parseModule(spec.source, 'App.tsrx', { collect: true, errors, comments: [] });

				if ('error' in spec && spec.error) {
					expect(errors.map((error) => error.message)).toEqual([spec.error.message]);
					if (spec.error.start !== undefined) expect(errors[0].pos).toBe(spec.error.start);
					if (spec.error.end !== undefined) expect(errors[0].end).toBe(spec.error.end);
				} else {
					expect(errors).toEqual([]);
				}

				if ('expected' in spec && spec.expected) {
					assert_shape(spec.locate(ast), spec.expected);
				}
			});
		}
	});

	it('parses multiline self-closing meta tags inside head', () => {
		const returned = getReturned(`function App() { return <>
			<head>
				<title>Home</title>
				<meta
					name="description"
					content="Page description"
				/>
			</head>
		</>; }`);

		const head = node_children(returned).find(
			(child) => child.type === 'JSXElement' && openingName(child).name === 'head',
		);
		const meta = node_children(found(head)).find(
			(child) => child.type === 'JSXElement' && openingName(child).name === 'meta',
		);
		expect(as_type(meta, 'JSXElement').openingElement.selfClosing).toBe(true);
		expect(as_type(meta, 'JSXElement').closingElement).toBeNull();
	});

	it('splits setup code and render output with a `@{ }` code block', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = 1;
			<>Hello {x}</>
		}</div>; }`);

		expect(node_children(returned).map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXFragment');
		expect(node_children(codeBlockRender(block)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(codeBlockRender(block), 0, 'JSXText').value).toContain('Hello');
	});

	it('allows a code-only `@{ }` block with no render output', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = 1;
			effect(() => log(x));
		}</div>; }`);

		expect(node_children(returned).map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'ExpressionStatement',
		]);
		expect(codeBlock(block).render).toBeNull();
	});

	it('allows a `@{ }` block whose body is only a render node', () => {
		const returned = getReturned(`function App() { return <div>@{
			<span>{count}</span>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		assert_type(block, 'JSXCodeBlock');
		expect(block.body).toEqual([]);
		expect(codeBlockRender(block).type).toBe('JSXElement');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('wraps multiple render nodes and text in a fragment', () => {
		const returned = getReturned(`function App() { return <div>@{
			const a = 5;
			<>
				for switching to if, continue and break
				<div>Hello</div>
			</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXFragment');
		expect(node_children(codeBlockRender(block)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXElement',
		]);
		expect(child(codeBlockRender(block), 0, 'JSXText').value).toContain('for switching to if');
	});

	it('parses a nested element that earns its own `@{ }` block', () => {
		const returned = getReturned(`function App() { return <div>
			<div>@{
				const a = 5;
				<span>{a}</span>
			}</div>
		</div>; }`);

		const inner = node_children(returned).find((child) => child.type === 'JSXElement');
		assert_found(inner);
		expect(openingName(inner).name).toBe('div');
		expect(inner.children.map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = inner.children[0];
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('parses a `@{ }` block as a fragment body', () => {
		const returned = getReturned(`function App() { return <>@{
			const a = 5;
			<div>{a}</div>
		}</>; }`);

		assert_type(returned, 'JSXFragment');
		expect(returned.children.map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = returned.children[0];
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('div');
	});

	it('parses a `@{ }` block preceded by text as a code block, not text plus expression container', () => {
		const ast = parseModule(
			`function Foo(props) @{
				<>
					Hello @{props.username}
				</>
			}`,
			'App.tsrx',
		);
		const fragment = codeBlockRender(firstStatement(ast, 'FunctionDeclaration').body);

		expect(node_children(found(fragment)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXCodeBlock',
		]);
		expect(child(found(fragment), 0, 'JSXText').value).toContain('Hello ');
		const block = node_children(found(fragment))[1];
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['ExpressionStatement']);
		expect(
			as_type(
				as_type(
					as_type(as_type(block, 'JSXCodeBlock').body[0], 'ExpressionStatement').expression,
					'MemberExpression',
				).property,
				'Identifier',
			).name,
		).toBe('username');
		expect(codeBlock(block).render).toBeNull();
	});

	it('parses inline `@{ }` blocks between text siblings and keeps the surrounding spaces', () => {
		const returned = getReturned(`function App() { return <div>a @{x} b @{y} c</div>; }`);

		expect(node_children(returned).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXCodeBlock',
			'JSXText',
			'JSXCodeBlock',
			'JSXText',
		]);
		expect(child(returned, 0, 'JSXText').value).toBe('a ');
		expect(child(returned, 2, 'JSXText').value).toBe(' b ');
		expect(child(returned, 4, 'JSXText').value).toBe(' c');
	});

	it('parses a `@{ }` block preceded by text inside an element nested in an expression container', () => {
		const span = findElement(
			`function App() { return <div>{cond ? <span>p @{q}</span> : null}</div>; }`,
			'span',
		);

		expect(span.children.map((child) => child.type)).toEqual(['JSXText', 'JSXCodeBlock']);
		expect(child(span, 0, 'JSXText').value).toBe('p ');
	});

	it('keeps a lone `@` followed by a spaced expression container as text', () => {
		const returned = getReturned(`function App() { return <div>at @ {x}</div>; }`);

		expect(node_children(returned).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXExpressionContainer',
		]);
		expect(child(returned, 0, 'JSXText').value).toBe('at @ ');
	});

	it('keeps locations aligned for plain JSX expression children', () => {
		const source = `function App() {
	return <>
		<pre>
			{x}
		</pre>
	</>;
}
foo();`;
		const ast = parseModule(source, 'App.tsrx');
		const returned = as_type(functionBody(ast)[0], 'ReturnStatement').argument;
		const pre = node_children(found(returned)).find((child) => child.type === 'JSXElement');
		assert_found(pre);
		const container = node_children(pre).find((child) => child.type === 'JSXExpressionContainer');
		assert_found(container);
		const expression = as_type(container, 'JSXExpressionContainer').expression;

		expect(expression.start).toBe(source.indexOf('x}'));
		expect(ast.body[1].start).toBe(source.indexOf('foo()'));
	});

	it('parses switch cases with JSX children', () => {
		const switchExpression = findNode(
			`function App() { return <>@{
				const iconNodes = [['path', { d: 'x' }], ['circle', { cx: '1' }]];
				<svg>
					@for (const [tag, attrs] of iconNodes) {
						@switch (tag) {
							@case 'path': {
								<path {...attrs} />
							}
							@case 'circle': {
								<circle {...attrs} />
							}
						}
					}
				</svg>
			}</>; }`,
			'JSXSwitchExpression',
		);

		expect(switchExpression.cases).toHaveLength(2);
		const spread = as_type(switchExpression.cases[0].consequent[0], 'JSXElement').openingElement
			.attributes[0];
		expect(as_type(spread, 'JSXSpreadAttribute').argument.type).toBe('Identifier');
		expect(as_type(as_type(spread, 'JSXSpreadAttribute').argument, 'Identifier').name).toBe(
			'attrs',
		);
		expect(switchExpression.cases[0].consequent.map((node) => node.type)).toEqual(['JSXElement']);
		expect(switchExpression.cases[1].consequent.map((node) => node.type)).toEqual(['JSXElement']);
	});

	it('rejects break statements inside JSX switch cases', () => {
		expect(() =>
			parseModule(
				`function App() { return @switch (tag) {
					@case 'path': {
						<path />
						break;
					}
				}; }`,
				'App.tsrx',
			),
		).toThrow('`break` is invalid inside `@switch` cases.');
	});

	it('rejects return statements inside JSX switch cases', () => {
		expect(() =>
			parseModule(
				`function App() { return @switch (tag) {
					@case 'path': {
						return;
					}
				}; }`,
				'App.tsrx',
			),
		).toThrow('`return` is invalid inside `@switch` cases.');
		expect(() =>
			parseModule(
				`function App() { return @switch (tag) {
					@case 'path': {
						return <path />;
					}
				}; }`,
				'App.tsrx',
			),
		).toThrow('`return` is invalid inside `@switch` cases.');
	});

	it('scopes switch case setup locals to their own case block', () => {
		expect(() =>
			parseModule(
				`function App({ tag }) @{
					const label = 'outer';
					@switch (tag) {
						@case 'a': {
							const label = 'A';
							<p>{label}</p>
						}
						@case 'b': {
							const label = 'B';
							<p>{label}</p>
						}
						@default: {
							const label = 'Other';
							<p>{label}</p>
						}
					}
				}`,
				'App.tsrx',
			),
		).not.toThrow();
		expect(() =>
			parseModule(
				`function App({ tag }) @{
					@switch (tag) {
						@case 'a': {
							const label = 'A';
							const label = 'B';
							<p>{label}</p>
						}
					}
				}`,
				'App.tsrx',
			),
		).toThrow("Identifier 'label' has already been declared");
	});

	it('parses regex, division, template literal, and parenthesized statements in case bodies', () => {
		const switchExpression = findNode(
			`export function App() @{
  <>
    @switch (x) {
      @case 1: {
        /a/.test(s);
        const half = total / 2;
        \`x\`;
        (a || b).run();
        <span />
      }
      @default: {
        \`y\${s}\`.trim();
        /b/g.test(s);
        <i />
      }
    }
  </>
}`,
			'JSXSwitchExpression',
		);

		const [first, fallback] = switchExpression.cases;
		expect(first.consequent.map((node) => node.type)).toEqual([
			'ExpressionStatement',
			'VariableDeclaration',
			'ExpressionStatement',
			'ExpressionStatement',
			'JSXElement',
		]);
		const [regexTest, half, template] = first.consequent;
		const regexCall = as_type(
			as_type(regexTest, 'ExpressionStatement').expression,
			'CallExpression',
		);
		expect(regexLiteral(as_type(regexCall.callee, 'MemberExpression').object).pattern).toBe('a');
		expect(as_type(declaratorInit(half), 'BinaryExpression').operator).toBe('/');
		expect(
			as_type(as_type(template, 'ExpressionStatement').expression, 'TemplateLiteral').quasis[0]
				.value.raw,
		).toBe('x');

		expect(fallback.consequent.map((node) => node.type)).toEqual([
			'ExpressionStatement',
			'ExpressionStatement',
			'JSXElement',
		]);
		const trimCall = as_type(
			as_type(fallback.consequent[0], 'ExpressionStatement').expression,
			'CallExpression',
		);
		const trimmed = as_type(as_type(trimCall.callee, 'MemberExpression').object, 'TemplateLiteral');
		expect(trimmed.expressions.map((node) => node.type)).toEqual(['Identifier']);
	});

	it('requires switch case and default bodies to be blocks', () => {
		expect(() =>
			parseModule(
				`function App() { return @switch (tag) {
					@case 'path':
						<path />
				}; }`,
				'App.tsrx',
			),
		).toThrow();
		expect(() =>
			parseModule(
				`function App() { return @switch (tag) {
					@default:
						<path />
				}; }`,
				'App.tsrx',
			),
		).toThrow();
	});

	describe('input that ends inside an @switch arm', () => {
		// Parsed in a worker, so a parse that never returns fails the test instead
		// of stalling the run.
		/** @type {Array<ParseOptions | undefined>} */
		const modes = [undefined, { collect: true }, { loose: true }];

		it('reports the missing `}` at the end of the input in every parse mode', async () => {
			const sources = [
				'function App({ mode }) @{\n  @switch (mode) {\n    @case 1: {',
				'function App({ mode }) @{\n  @switch (mode) {\n    @default: {',
				"function App({ mode }) @{\n  @switch (mode) {\n    @case 1: {\n      const label = 'one';",
				'function App({ mode }) @{\n  @switch (mode) {\n    @case 1: {\n      <b>one</b>',
				'function App({ mode }) @{\n  @switch (mode) {\n    @case 1: {\n      <b>one</b>\n    }\n    @default: {\n      ',
				'function App({ mode }) @{\n  const node = @switch (mode) { @case 1: {',
				'function App({ mode }) { return <div>@switch (mode) { @case 1: {',
			];
			const inputs = sources.flatMap((source) => modes.map((options) => ({ source, options })));

			const outcomes = await parse_in_worker(inputs);

			expect(outcomes).toEqual(
				inputs.map(({ source }) => {
					const { line, column } = acorn.getLineInfo(source, source.length);
					return {
						ok: false,
						message: `'}' expected. (${line}:${column})`,
						pos: source.length,
					};
				}),
			);
		});

		it('reports an unclosed element before the missing `}`', async () => {
			const sources = [
				'function App({ mode }) @{\n  @switch (mode) {\n    @case 1: {\n      <section>',
				'function App({ mode }) @{\n  @switch (mode) {\n    @default: {\n      <section>',
			];
			const inputs = sources.flatMap((source) => modes.map((options) => ({ source, options })));

			const outcomes = await parse_in_worker(inputs);

			// As in an `@if` body: the default mode throws the unclosed tag, and
			// collect and loose mode, which keep parsing past it, then stop at the
			// missing `}` at the end of the input.
			expect(outcomes).toEqual(
				inputs.map(({ source, options }) => ({
					ok: false,
					message: options
						? "'}' expected. (4:15)"
						: "Unclosed tag '<section>'. Expected '</section>' before end of template. (4:15)",
					pos: source.length,
				})),
			);
		});

		it('returns for every prefix of a template with @switch arms', async () => {
			const source = `function App({ mode, items }) @{
	const label = @switch (mode) { @case 'a': { <b>a</b> } @default: { <i>b</i> } };
	<div>
		@switch (mode) {
			@case 'list': {
				const first = items[0];
				<ul>
					@for (const item of items) {
						<li>{item}</li>
					}
				</ul>
			}
			@case 'one': {
				@if (items[0]) { <p>{items[0]}</p> }
			}
			@default: {
				doThing();
				<>{label} none</>
			}
		}
	</div>
}`;
			/** @type {Array<{ source: string, options: ParseOptions | undefined }>} */
			const inputs = [];
			for (let end = 0; end <= source.length; end++) {
				for (const options of modes) {
					inputs.push({ source: source.slice(0, end), options });
				}
			}

			const outcomes = await parse_in_worker(inputs);

			expect(outcomes).toHaveLength(inputs.length);
			expect(outcomes.slice(-modes.length)).toEqual([
				{ ok: true, errors: undefined },
				{ ok: true, errors: [] },
				{ ok: true, errors: [] },
			]);
		});
	});

	it('treats keyword and symbol-looking element children as JSXText', () => {
		const returned = getReturned(`function App() { return <div>
			<code>const</code>
			<code>@if</code>
			<code>@tsrx/react</code>
			<code>/mcp</code>
			<a>#1177</a>
		</div>; }`);

		const elements = node_children(returned).filter((child) => child.type === 'JSXElement');
		expect(elements[0].children[0].type).toBe('JSXText');
		expect(as_type(elements[0].children[0], 'JSXText').value).toBe('const');
		expect(elements[1].children[0].type).toBe('JSXText');
		expect(as_type(elements[1].children[0], 'JSXText').value).toBe('@if');
		expect(elements[2].children[0].type).toBe('JSXText');
		expect(as_type(elements[2].children[0], 'JSXText').value).toBe('@tsrx/react');
		expect(elements[3].children[0].type).toBe('JSXText');
		expect(as_type(elements[3].children[0], 'JSXText').value).toBe('/mcp');
		expect(elements[4].children[0].type).toBe('JSXText');
		expect(as_type(elements[4].children[0], 'JSXText').value).toBe('#1177');
	});

	it('allows a JSX value in the setup section of a code block', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = <div />
			<>
				<div />
				{x}
			</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(declaratorInit(block.body[0]).type).toBe('JSXElement');
		expect(node_children(codeBlockRender(block)).map((child) => child.type)).toEqual([
			'JSXElement',
			'JSXExpressionContainer',
		]);
	});

	it('allows JSX text children in a setup-section JSX value', () => {
		const returned = getReturned(`function App() { return <>@{
			const x = <div>hello</div>
			<>{x}</>
		}</>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(node_children(declaratorInit(block.body[0]))[0].type).toBe('JSXText');
		expect(child(declaratorInit(block.body[0]), 0, 'JSXText').value).toBe('hello');
	});

	it('does not treat closing-tag text inside setup strings as markup', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = "</div><div>"
			<>Hello</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(as_type(declaratorInit(block.body[0]), 'Literal').value).toBe('</div><div>');
		expect(codeBlockRender(block).type).toBe('JSXFragment');
	});

	it('parses string and regex literals in the setup section as ordinary TS', () => {
		const returned = getReturned(`function App() { return <div>@{
			const s = "---"
			const r = /---/
			<>Hello</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'VariableDeclaration',
		]);
		expect(as_type(declaratorInit(block.body[0]), 'Literal').value).toBe('---');
		expect(declaratorInit(block.body[1]).type).toBe('Literal');
		expect(regexLiteral(declaratorInit(block.body[1])).pattern).toBe('---');
	});

	it('parses a template literal as the sole content of a `@{ }` code block', () => {
		const block = findNode('let c = @{ `a${x}b` };', 'JSXCodeBlock');

		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).render).toBeNull();
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['ExpressionStatement']);
		const template = as_type(block.body[0], 'ExpressionStatement').expression;
		assert_type(template, 'TemplateLiteral');
		expect(template.quasis.map((quasi) => quasi.value.raw)).toEqual(['a', 'b']);
		expect(
			template.expressions.map((expression) => as_type(expression, 'Identifier').name),
		).toEqual(['x']);
	});

	it('parses a template literal after another statement in a `@{ }` code block', () => {
		const block = findNode('let i = @{ const a = 1; `t${a}` };', 'JSXCodeBlock');

		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'ExpressionStatement',
		]);
		const template = as_type(block.body[1], 'ExpressionStatement').expression;
		assert_type(template, 'TemplateLiteral');
		expect(template.quasis.map((quasi) => quasi.value.raw)).toEqual(['t', '']);
		expect(
			template.expressions.map((expression) => as_type(expression, 'Identifier').name),
		).toEqual(['a']);
	});

	it('does not treat tag-looking text inside setup regex literals as markup', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = /<span>/
			<>{x}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(declaratorInit(block.body[0]).type).toBe('Literal');
		expect(regexLiteral(declaratorInit(block.body[0])).pattern).toBe('<span>');
	});

	it('reads `<value> < /…/` in the setup section as a less-than against a regex', () => {
		// Without the space, `</` starts a closing tag, as in TSX (#586).
		const returned = getReturned(`function App() { return <div>@{
			const x = 3 < /div>/
			<>{x}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		const init = declaratorInit(block.body[0]);
		assert_type(init, 'BinaryExpression');
		expect(init.operator).toBe('<');
		expect(as_type(init.left, 'Literal').value).toBe(3);
		expect(regexLiteral(init.right).pattern).toBe('div>');
	});

	it('reads a line-leading `<` against a number in the setup section as a comparison, not a tag', () => {
		const ast = parseModule(
			`const foo = @{
				const x =
					123
					< 456;
				<div/>
			};`,
			'App.tsrx',
		);

		const block = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		const init = declaratorInit(block.body[0]);
		assert_type(init, 'BinaryExpression');
		expect(init.operator).toBe('<');
		expect(as_type(init.left, 'Literal').value).toBe(123);
		expect(as_type(init.right, 'Literal').value).toBe(456);
		expect(codeBlockRender(block).type).toBe('JSXElement');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('div');
	});

	it('parses array of objects in the setup section', () => {
		const returned = getReturned(`
			something(() => {
				function App() {
					return <>@{
						const items = [
							{ x: '10', y: '10', width: '20', height: '20' },
							{ x: '40', y: '40', width: '20', height: '20' },
						];
					}</>;
				}
			});`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		const init = declaratorInit(block.body[0]);
		assert_type(init, 'ArrayExpression');
		expect(init.elements).toHaveLength(2);
		expect(found(init.elements[0]).type).toBe('ObjectExpression');
		expect(as_type(init.elements[0], 'ObjectExpression').properties).toHaveLength(4);
	});

	it('parses functions returning fragments in the setup section', () => {
		const returned = getReturned(`
			function App() {
				return <>@{
					function Basic() {
						return <><div>{'Basic Component'}</div></>;
					}
					<Basic />
				}</>;
			}`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['FunctionDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXElement');
		const declaration = block.body[0];
		expect(as_type(declaration, 'FunctionDeclaration').body.body[0].type).toBe('ReturnStatement');
		expect(
			found(
				as_type(as_type(declaration, 'FunctionDeclaration').body.body[0], 'ReturnStatement')
					.argument,
			).type,
		).toBe('JSXFragment');
	});

	it('parses native control flow in a component nested below the top level', () => {
		const returned = getReturned(`
			something(() => {
				function App() {
					return <>@{
						const items = ['a', '', 'c'];
						@for (const item of items) {
							if (!item) continue;
							<li>{item}</li>
						}
					}</>;
				}
			});`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXForExpression');
		const directive = codeBlockRender(block);
		assert_found(directive);
		expect(as_type(directive, 'JSXForExpression').statementType).toBe('ForOfStatement');
		expect(
			blockBody(as_type(directive, 'JSXForExpression').body).map((child) => child.type),
		).toEqual(['IfStatement', 'JSXElement']);
		expect(
			as_type(as_type(directive, 'JSXForExpression').body.body[0], 'IfStatement').consequent.type,
		).toBe('ContinueStatement');
	});

	it('parses a TSRX template returned from a `.map()` callback as a native template', () => {
		const tr = findElement(
			`export function App({ rows }) {
				return <table>
					{rows.map((row) => <tr>@{
						const cells = row.cells;
						@for (const cell of cells) { <td>{cell}</td> }
					}</tr>)}
				</table>;
			}`,
			'tr',
		);

		expect(tr.metadata.native_tsrx).toBe(true);
		expect(tr.children.map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = tr.children[0];
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXForExpression');
		expect(as_type(codeBlockRender(block), 'JSXForExpression').statementType).toBe(
			'ForOfStatement',
		);
	});

	it('parses a TSRX element in a conditional expression as a native template', () => {
		const div = findElement(
			`export function App({ show }) {
				return <section>
					{show ? <div>@{
						const label = 'hi';
						<>{label}</>
					}</div> : null}
				</section>;
			}`,
			'div',
		);

		expect(div.metadata.native_tsrx).toBe(true);
		expect(div.children.map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = div.children[0];
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(node_children(codeBlockRender(block)).map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
		]);
	});

	it('treats a generic call in the setup section as script, not markup', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = foo<T>(bar)
			<>{x}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(declaratorInit(block.body[0]).type).toBe('CallExpression');
		expect(
			as_type(as_type(declaratorInit(block.body[0]), 'CallExpression').callee, 'Identifier').name,
		).toBe('foo');
	});

	it('treats a generic arrow function in the setup section as script', () => {
		const returned = getReturned(`function App() { return <div>@{
			const id = <T>(x: T) => x
			<>{id}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(declaratorInit(block.body[0]).type).toBe('ArrowFunctionExpression');
	});

	it('treats generic function expressions in the setup section as script', () => {
		const returned = getReturned(`function App() { return <div>@{
			function getBuilder() {
				return {
					build: function <T>() {
						return 'test';
					},
				};
			}
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['FunctionDeclaration']);
		const object = as_type(
			as_type(block.body[0], 'FunctionDeclaration').body.body[0],
			'ReturnStatement',
		).argument;
		expect(as_type(as_type(object, 'ObjectExpression').properties[0], 'Property').value.type).toBe(
			'FunctionExpression',
		);
		expect(
			as_type(
				as_type(as_type(object, 'ObjectExpression').properties[0], 'Property').value,
				'FunctionExpression',
			).typeParameters?.type,
		).toBe('TSTypeParameterDeclaration');
	});

	it('treats class methods and member calls with type arguments as script', () => {
		const returned = getReturned(`function App() { return <div>@{
			class List<T> {
				items: T[];
			}
			class Containers {
				static List<T>() {
					return new List<T>();
				}
			}
			const c = Containers.List<string>();
			<>{c}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'ClassDeclaration',
			'ClassDeclaration',
			'VariableDeclaration',
		]);
		const method = as_type(
			as_type(block.body[1], 'ClassDeclaration').body.body[0],
			'MethodDefinition',
		);
		expect(method.typeParameters?.type).toBe('TSTypeParameterDeclaration');
		const call = declaratorInit(block.body[2]);
		assert_type(call, 'CallExpression');
		expect(call.typeArguments?.type).toBe('TSTypeParameterInstantiation');
	});

	it('keeps whitespace-separated relational expressions out of the type-argument path', () => {
		const returned = getReturned(`function App() { return <div>@{
			const result = value < limit > floor;
			<>{result}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		const init = declaratorInit(block.body[0]);
		assert_type(init, 'BinaryExpression');
		expect(init.operator).toBe('>');
	});

	it('parses generic function expressions before render output', () => {
		const returned = getReturned(`function App() { return <div>@{
			const label = 'value';
			const builder = function <T>() {
				return label as T;
			};
			<T>{builder<string>()}</T>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'VariableDeclaration',
		]);
		const builder = declaratorInit(block.body[1]);
		assert_type(builder, 'FunctionExpression');
		expect(builder.typeParameters?.type).toBe('TSTypeParameterDeclaration');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('T');
	});

	it('parses template text touching a following element as text, not a type-argument list', () => {
		const block = getReturnedCodeBlock(
			`function App() { return @{ <>hello<span>{a}</span></> }; }`,
		);

		const fragment = codeBlockRender(block);
		expect(node_children(found(fragment)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXElement',
		]);
		expect(child(found(fragment), 0, 'JSXText').value).toBe('hello');
		expect(
			as_type(child(found(fragment), 1, 'JSXElement').openingElement.name, 'JSXIdentifier').name,
		).toBe('span');
	});

	it('parses template text touching a following fragment as text, not a type-argument list', () => {
		const block = getReturnedCodeBlock(`function App() { return @{ <>hello<>{a}</></> }; }`);

		const fragment = codeBlockRender(block);
		expect(node_children(found(fragment)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXFragment',
		]);
		expect(child(found(fragment), 0, 'JSXText').value).toBe('hello');
		expect(node_children(node_children(found(fragment))[1]).map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
		]);
	});

	it('keeps expressions as containers between touching text inside an expression container', () => {
		const block = getReturnedCodeBlock(
			`function App() { return @{ <>{<>x{a}y<>{b}</>z</>}</> }; }`,
		);

		const inner = child(codeBlockRender(block), 0, 'JSXExpressionContainer').expression;
		assert_type(inner, 'JSXFragment');
		expect(inner.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXExpressionContainer',
			'JSXText',
			'JSXFragment',
			'JSXText',
		]);
		expect(as_type(child(inner, 1, 'JSXExpressionContainer').expression, 'Identifier').name).toBe(
			'a',
		);
		expect(
			as_type(
				as_type(node_children(inner.children[3])[0], 'JSXExpressionContainer').expression,
				'Identifier',
			).name,
		).toBe('b');
	});

	it('parses expression containers at every level of nested fragments in expression position', () => {
		const ast = parseModule(
			`function StatusBadge() @{
				<>{<>{a} <>{<>{a}</>}</> </>}</>
			}`,
			'App.tsrx',
		);

		const outer = codeBlockRender(firstStatement(ast, 'FunctionDeclaration').body);
		assert_type(outer, 'JSXFragment');
		expect(outer.children.map((child) => child.type)).toEqual(['JSXExpressionContainer']);

		const level2 = child(outer, 0, 'JSXExpressionContainer').expression;
		assert_type(level2, 'JSXFragment');
		expect(level2.children.map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
			'JSXText',
			'JSXFragment',
			'JSXText',
		]);
		expect(as_type(child(level2, 0, 'JSXExpressionContainer').expression, 'Identifier').name).toBe(
			'a',
		);

		const level3 = level2.children[2];
		expect(node_children(level3).map((child) => child.type)).toEqual(['JSXExpressionContainer']);

		const level4 = child(level3, 0, 'JSXExpressionContainer').expression;
		assert_type(level4, 'JSXFragment');
		expect(level4.children.map((child) => child.type)).toEqual(['JSXExpressionContainer']);
		expect(as_type(child(level4, 0, 'JSXExpressionContainer').expression, 'Identifier').name).toBe(
			'a',
		);
	});

	it('parses sibling fragments separated by template text', () => {
		const withText = findNode('let a = <> <>123</> 2 <>456</> </>', 'JSXFragment');
		expect(withText.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXFragment',
			'JSXText',
			'JSXFragment',
			'JSXText',
		]);
		expect(child(withText, 0, 'JSXText').value).toBe(' ');
		expect(child(withText, 2, 'JSXText').value).toBe(' 2 ');
		expect(child(withText, 4, 'JSXText').value).toBe(' ');

		const emptySiblings = findNode('let b = <> <></> 2 <></> </>', 'JSXFragment');
		expect(emptySiblings.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXFragment',
			'JSXText',
			'JSXFragment',
			'JSXText',
		]);
		expect(child(withText, 0, 'JSXText').value).toBe(' ');
		expect(child(withText, 2, 'JSXText').value).toBe(' 2 ');
		expect(child(withText, 4, 'JSXText').value).toBe(' ');
	});

	it('keeps an inline space between adjacent sibling fragments', () => {
		const fragment = findNode('let c = <> <></>  <></>something </>', 'JSXFragment');
		expect(fragment.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXFragment',
			'JSXText',
			'JSXFragment',
			'JSXText',
		]);
		expect(child(fragment, 2, 'JSXText').value).toBe('  ');
		expect(child(fragment, 4, 'JSXText').value).toBe('something ');
	});

	it('keeps inline spaces around and between sibling elements', () => {
		const pre = findElement('const a = <pre> <b>1</b> <b>2</b> </pre>;', 'pre');
		expect(pre.children.map((child) => child.type)).toEqual([
			'JSXText',
			'JSXElement',
			'JSXText',
			'JSXElement',
			'JSXText',
		]);
		expect(child(pre, 0, 'JSXText').value).toBe(' ');
		expect(child(pre, 2, 'JSXText').value).toBe(' ');
		expect(child(pre, 4, 'JSXText').value).toBe(' ');
	});

	it('parses a text-then-element sibling after newline-separated elements', () => {
		const pre = findElement('let a = <pre><b>2</b>\n<b>3</b>1<b>4</b></pre>;', 'pre');
		expect(pre.children.map((child) => child.type)).toEqual([
			'JSXElement',
			'JSXElement',
			'JSXText',
			'JSXElement',
		]);
		expect(child(pre, 2, 'JSXText').value).toBe('1');
	});

	it('parses indented multi-line markup with a text-then-element sibling', () => {
		const source =
			'let a  = <pre> \n\n    <b>2</b>   \n    <b>3</b> \n    \n    1<b>4</b>\n</pre>;';
		const pre = findElement(source, 'pre');
		expect(pre.children.filter((child) => child.type === 'JSXElement')).toHaveLength(3);
		const text = pre.children.find(
			(child) => child.type === 'JSXText' && child.value.includes('1'),
		);
		// The text keeps the whitespace after the closing tag before it, which
		// JSX trims as layout
		expect(as_type(text, 'JSXText').value).toBe(' \n    \n    1');
	});

	it('parses parenthesized conditional JSX spread attributes in render output', () => {
		const returned = getReturned(`function App() { return <div>@{
			let [enabled] = track(true);
			<button {...(enabled ? { onClick: fn } : { title: 'disabled' })}>target</button>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		const spread = as_type(codeBlockRender(block), 'JSXElement').openingElement.attributes[0];
		assert_type(spread, 'JSXSpreadAttribute');
		expect(spread.argument.type).toBe('ConditionalExpression');
		expect(as_type(as_type(spread.argument, 'ConditionalExpression').test, 'Identifier').name).toBe(
			'enabled',
		);
	});

	it('parses parenthesized conditional spreads that swap ref-shaped props', () => {
		const returned = getReturned(`function App() { return <div>@{
			let [as_ref] = track(true);
			const props = { ref: input };
			<input {...(as_ref ? { ref: props.ref } : { input_ref: 'regular prop' })} />
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'VariableDeclaration',
		]);
		const spread = as_type(codeBlockRender(block), 'JSXElement').openingElement.attributes[0];
		assert_type(spread, 'JSXSpreadAttribute');
		expect(spread.argument.type).toBe('ConditionalExpression');
		expect(
			as_type(
				as_type(
					as_type(as_type(spread.argument, 'ConditionalExpression').consequent, 'ObjectExpression')
						.properties[0],
					'Property',
				).key,
				'Identifier',
			).name,
		).toBe('ref');
		expect(
			as_type(
				as_type(
					as_type(as_type(spread.argument, 'ConditionalExpression').alternate, 'ObjectExpression')
						.properties[0],
					'Property',
				).key,
				'Identifier',
			).name,
		).toBe('input_ref');
	});

	it('does not let a relational `>` inside an attribute break tag scanning', () => {
		// The `>` in `value={foo > bar}` must not be mistaken for the end of the
		// `<Comp ...>` opening tag while parsing a JSX value in setup.
		const returned = getReturned(`function App() { return <div>@{
			const x = <Comp value={foo > bar} />
			<>{x}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(declaratorInit(block.body[0]).type).toBe('JSXElement');
		expect(openingName(as_type(declaratorInit(block.body[0]), 'JSXElement')).name).toBe('Comp');
	});

	it('parses template literals in the setup section', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = \`</div>
<div>\`
			<>Hello</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(declaratorInit(block.body[0]).type).toBe('TemplateLiteral');
	});

	it('parses line and block comments in the setup section', () => {
		const returned = getReturned(`function App() { return <div>@{
			// a line comment
			/* a block comment */
			const x = 1
			<>Hello</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
	});

	it('does not let a setup JSX value close the outer template', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = <section>
				<div>Script JSX</div>
			</section>
			<>{x}</>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		const scriptJsx = declaratorInit(block.body[0]);
		assert_type(scriptJsx, 'JSXElement');
		expect(openingName(scriptJsx).name).toBe('section');
		expect(
			as_type(
				as_type(
					scriptJsx.children.find((child) => child.type === 'JSXElement'),
					'JSXElement',
				).openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('div');
	});

	it('parses style expressions in the setup section of a code block', () => {
		const returned = getReturned(`function App() { return <section>@{
			const styles = <style>
				.card {
					color: red;
				}
			</style>
			<div class={styles.card} />
		}</section>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		const style = declaratorInit(block.body[0]);
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXElement');
		assert_type(style, 'JSXStyleElement');
		expect(style.children[0].type).toBe('StyleSheet');
		expect(style.css).toContain('.card');
	});

	it('keeps markup-looking text inside style content as CSS source', () => {
		const returned = getReturned(`function App() { return <style>
			.root::before {
				content: "--- </div><div>";
			}
		</style>; }`);

		assert_type(returned, 'JSXStyleElement');
		expect(returned.css).toContain('--- </div><div>');
		expect(returned.children[0].source).toContain('--- </div><div>');
	});

	it('allows nested elements to have their own code block', () => {
		const returned = getReturned(`function App() { return <section>
			<Component>@{
				const label = 'Save'
				<button>{label}</button>
			}</Component>
		</section>; }`);

		const component = node_children(returned).find((child) => child.type === 'JSXElement');
		assert_found(component);
		expect(openingName(component).name).toBe('Component');
		expect(component.children.map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = component.children[0];
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('button');
	});

	it('parses @if as a JSXIfExpression', () => {
		const returned = getReturned(`function App() { return <div>
			@if (ready) {
				<>Ready</>
			} @else {
				<>Waiting</>
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_type(directive, 'JSXIfExpression');
		expect(directive.statementType).toBe('IfStatement');
		expect(as_type(directive.test, 'Identifier').name).toBe('ready');
		expect(blockBody(directive.consequent)[0].type).toBe('JSXFragment');
		expect(
			as_type(node_children(blockBody(directive.consequent)[0])[0], 'JSXText').value,
		).toContain('Ready');
		expect(as_type(node_children(blockBody(directive.alternate)[0])[0], 'JSXText').value).toContain(
			'Waiting',
		);
	});

	it('parses a nested @for whose body contains an @if/@else, both nested inside an outer @if', () => {
		// Regression test: an `@if` directly containing an `@for`, whose own
		// body contains another control-flow directive (`@if`, `@if`/`@else`,
		// or a nested `@for`), previously fell through to plain statement
		// parsing for the `@for`'s body instead of the TSRX-aware control-flow
		// block parser. The inner directive was misparsed as a bare
		// `ExpressionStatement` wrapping a synthetic JSXFragment rather than a
		// proper `JSXIfExpression` — printers with no `JSXFragment` visitor
		// (such as esrap's `ts` language, used by SSR-target output) then fail
		// with "Not implemented: JSXFragment" when serializing that node.
		const returned = getReturned(`function App() { return <div>
			@if (a) {
				@for (const item of items) {
					@if (item.ok) {
						<span>{item.name}</span>
					} @else {
						<span>skip</span>
					}
				}
			} @else {
				<span>empty</span>
			}
		</div>; }`);

		const outerIf = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(outerIf);

		const forExpr = blockBody(outerIf.consequent).find(
			(child) => /** @type {AST.Node} */ (child).type === 'JSXForExpression',
		);
		assert_found(forExpr);
		const forDirective = as_type(forExpr, 'JSXForExpression');
		expect(forDirective.statementType).toBe('ForOfStatement');

		const innerIf = blockBody(forDirective.body).find(
			(child) => /** @type {AST.Node} */ (child).type === 'JSXIfExpression',
		);
		assert_found(innerIf);
		const innerIfDirective = as_type(innerIf, 'JSXIfExpression');
		expect(blockBody(innerIfDirective.consequent)[0]?.type).toBe('JSXElement');
		expect(blockBody(innerIfDirective.alternate)[0]?.type).toBe('JSXElement');
	});

	it('keeps a plain JS for loop inside an @if body as an ordinary statement', () => {
		// Guards the invariant `parseBlock` relies on when redirecting on
		// `#templateControlFlowBlockDepth` alone: the counter is set only for
		// `@for`, so a plain `for` loop in a directive body must fall through
		// to ordinary statement parsing, not become a directive or have its
		// body treated as a template control-flow block.
		const returned = getReturned(`function App() { return <div>
			@if (a) {
				let total = 0;
				for (const n of nums) { total += n; }
				<span>{total}</span>
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(directive);
		const body = blockBody(as_type(directive, 'JSXIfExpression').consequent);
		const loop = as_type(
			body.find((child) => /** @type {AST.Node} */ (child).type === 'ForOfStatement'),
			'ForOfStatement',
		);
		const loopBody = as_type(loop.body, 'BlockStatement');
		expect(loopBody.metadata?.native_tsrx_template_block).toBeUndefined();
		expect(loopBody.body[0]?.type).toBe('ExpressionStatement');
	});

	it('parses a function body inside an @for header nested in an @if as plain code', () => {
		// `#templateControlFlowBlockDepth` is held for the whole `@for`
		// statement, header included, so an arrow body in the header reaches
		// `parseBlock` while the counter is positive and takes the
		// template-control-flow redirect. That routing must stay tolerable:
		// the arrow's body parses as ordinary statements and the `@for` still
		// gets its right-hand side and body.
		const returned = getReturned(`function App() { return <div>
			@if (show) {
				@for (const item of items.filter((x) => { return x.keep; })) {
					<span>{item.name}</span>
				}
			}
		</div>; }`);

		const outerIf = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(outerIf);
		const forExpr = blockBody(as_type(outerIf, 'JSXIfExpression').consequent).find(
			(child) => /** @type {AST.Node} */ (child).type === 'JSXForExpression',
		);
		const forDirective = as_type(forExpr, 'JSXForExpression');
		expect(forDirective.statementType).toBe('ForOfStatement');

		const arrow = find_first(forDirective, (node) => node.type === 'ArrowFunctionExpression');
		assert_found(arrow);
		const arrowBody = as_type(
			/** @type {AST.ArrowFunctionExpression} */ (arrow).body,
			'BlockStatement',
		);
		expect(arrowBody.body.map((child) => child.type)).toEqual(['ReturnStatement']);

		expect(blockBody(forDirective.body)[0]?.type).toBe('JSXElement');
	});

	it('parses a directive inside an @empty clause of an @for nested in an @if', () => {
		// The `@empty` clause redirects through a second, independent
		// `#templateControlFlowBlockDepth` increment (separate from the one
		// around the `@for` header+body), so it needs its own regression
		// coverage for the nested-in-@if shape.
		const returned = getReturned(`function App() { return <div>
			@if (show) {
				@for (const item of items) {
					<span>{item}</span>
				} @empty {
					@if (fallback) {
						<b>none</b>
					}
				}
			}
		</div>; }`);

		const outerIf = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(outerIf);
		const forExpr = blockBody(as_type(outerIf, 'JSXIfExpression').consequent).find(
			(child) => /** @type {AST.Node} */ (child).type === 'JSXForExpression',
		);
		const forDirective = as_type(forExpr, 'JSXForExpression');

		const emptyIf = blockBody(forDirective.empty).find(
			(child) => /** @type {AST.Node} */ (child).type === 'JSXIfExpression',
		);
		assert_found(emptyIf);
		expect(blockBody(as_type(emptyIf, 'JSXIfExpression').consequent)[0]?.type).toBe('JSXElement');
	});

	it('parses @else if as a chained JSXIfExpression alternate', () => {
		const returned = getReturned(`function App() { return <div>
				@if (status === 'loading') {
					<>Loading</>
			} @else if (status === 'success') {
				<>Success</>
			} @else {
				<>Failed</>
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(directive);
		expect(directive.alternate?.type).toBe('IfStatement');
		expect(
			as_type(
				as_type(as_type(directive.alternate, 'IfStatement').test, 'BinaryExpression').right,
				'Literal',
			).value,
		).toBe('success');
		expect(
			as_type(
				node_children(blockBody(as_type(directive.alternate, 'IfStatement').consequent)[0])[0],
				'JSXText',
			).value,
		).toContain('Success');
		expect(
			as_type(
				node_children(blockBody(as_type(directive.alternate, 'IfStatement').alternate)[0])[0],
				'JSXText',
			).value,
		).toContain('Failed');
	});

	it('parses bare else text after an @if directive', () => {
		const returned = getReturned(`function App() { return <>
				@if (ready) {
					<b>123</b>
				} else
			</>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		const text = node_children(returned).find(
			(child) => child.type === 'JSXText' && child.value.includes('else'),
		);

		assert_type(directive, 'JSXIfExpression');
		expect(directive.alternate).toBe(null);
		expect(as_type(text, 'JSXText').value).toMatch(/^ else/);
	});

	it('keeps the whitespace before bare else text in a @{ ... } block', () => {
		const fragment = findNode(
			`function Test() @{
<>
@if(a){<b>123</b>} else
</>
}`,
			'JSXFragment',
		);

		const directive = fragment.children.find((child) => child.type === 'JSXIfExpression');
		const text = fragment.children.find((child) => child.type === 'JSXText');

		assert_type(directive, 'JSXIfExpression');
		expect(directive.alternate).toBe(null);
		expect(as_type(text, 'JSXText').value).toBe(' else\n');
	});

	it('parses same-line trailing text after an @if block closed by a tag', () => {
		// Regression: the closing `</>` arrives as a relational `<` token because the
		// control-flow block left the tokenizer in JS mode. The manual closing-tag
		// re-entry used to underflow the tokenizer context stack (`context.length -=
		// 2`), throwing "Invalid array length". Trailing text directly before the
		// closing tag (no intervening element) is the trigger.
		const returned = getReturned(`function App() { return <>@if (a) {<b />} done</>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		const text = node_children(returned).find((child) => child.type === 'JSXText');
		assert_found(text);

		assert_type(directive, 'JSXIfExpression');
		expect(text.value).toBe(' done');
	});

	it('parses same-line trailing text after an @for block closed by a tag', () => {
		const returned = getReturned(
			`function App() { return <>@for (const x of xs) {<b />} done</>; }`,
		);

		const directive = node_children(returned).find((child) => child.type === 'JSXForExpression');
		const text = node_children(returned).find((child) => child.type === 'JSXText');
		assert_found(text);

		assert_type(directive, 'JSXForExpression');
		expect(text.value).toBe(' done');
	});

	it('parses same-line trailing text after an @if block inside a named element', () => {
		const element = findElement(
			`function App() { return <div>@if (a) {<b />} done</div>; }`,
			'div',
		);

		const directive = element.children.find((child) => child.type === 'JSXIfExpression');
		const text = element.children.find((child) => child.type === 'JSXText');
		assert_found(text);

		assert_type(directive, 'JSXIfExpression');
		expect(text.value).toBe(' done');
	});

	it('rejects braceless @if JSX output', () => {
		expect(() =>
			getReturned(`function App() { return <div>
					@if (visible) <div class="status">Visible: {String(visible)}</div>
			</div>; }`),
		).toThrow(/Expected `\{` after JSX control-flow directive/);
	});

	it('rejects unprefixed template continuation clauses', () => {
		expect(() =>
			getReturned(`function App() { return <div>
				@if (ready) {
					<>Ready</>
				} else {
					<>Waiting</>
				}
			</div>; }`),
		).toThrow(/Expected `@else` after `@if` block/);

		expect(() =>
			getReturned(`function App() { return <ul>
				@for (const item of items) {
					<li>{item}</li>
				} empty {
					<li>Empty</li>
				}
			</ul>; }`),
		).toThrow(/Expected `@empty` after `@for` block/);

		expect(() =>
			getReturned(`function App() { return <div>
				@switch (value) {
					case 'a': {
						<>A</>
					}
					default: {
						<>B</>
					}
				}
			</div>; }`),
		).toThrow(/Unexpected token/);

		expect(() =>
			getReturned(`function App() { return <div>
				@try {
					<AsyncThing />
				} pending {
					<>Loading</>
				}
			</div>; }`),
		).toThrow(/Expected `@pending` after `@try` block/);

		expect(() =>
			getReturned(`function App() { return <div>
				@try {
					<AsyncThing />
				} @pending {
					<>Loading</>
				} catch (error) {
					<>Failed</>
				}
			</div>; }`),
		).toThrow(/Expected `@catch` after `@try` block/);
	});

	it('parses code-only @if bodies', () => {
		const returned = getReturned(`function App() { return <div>
			@if (ready) {
				calls++;
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(directive);
		expect(blockBody(directive.consequent).map((child) => child.type)).toEqual([
			'ExpressionStatement',
		]);
		expect(
			as_type(
				as_type(blockBody(directive.consequent)[0], 'ExpressionStatement').expression,
				'UpdateExpression',
			).operator,
		).toBe('++');
	});

	it('parses assignment-only @if body content as a statement', () => {
		const returned = getReturned(`function App() { return <div>
			@if (ready) {
				x = 123
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(directive);
		expect(blockBody(directive.consequent).map((child) => child.type)).toEqual([
			'ExpressionStatement',
		]);
		expect(as_type(blockBody(directive.consequent)[0], 'ExpressionStatement').expression.type).toBe(
			'AssignmentExpression',
		);
	});

	it('does not treat closing-tag text inside directive setup strings as markup', () => {
		const returned = getReturned(`function App() { return <div>
			@if (ready) {
				const x = "</div><div>"
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		expect(blockBody(directive?.consequent).map((child) => child.type)).toEqual([
			'VariableDeclaration',
		]);
		expect(as_type(declaratorInit(blockBody(directive?.consequent)[0]), 'Literal').value).toBe(
			'</div><div>',
		);
	});

	it('parses @for as a JSXForExpression', () => {
		const returned = getReturned(`function App() { return <ul>
			@for (const item of items; key item.id) {
				<li>{item.label}</li>
			}
		</ul>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXForExpression');
		assert_type(directive, 'JSXForExpression');
		expect(directive.statementType).toBe('ForOfStatement');
		if (directive.statementType !== 'ForOfStatement') throw new Error('expected a `for … of`');
		expect(
			as_type(as_type(directive.left, 'VariableDeclaration').declarations[0].id, 'Identifier').name,
		).toBe('item');
		expect(as_type(directive.right, 'Identifier').name).toBe('items');
		expect(as_type(as_type(directive.key, 'MemberExpression').property, 'Identifier').name).toBe(
			'id',
		);
		expect(directive.body.body[0].type).toBe('JSXElement');
		expect(directive.empty).toBeNull();
	});

	it('parses @for inside a statement-container fragment output with JSX siblings', () => {
		const ast = parseModule(
			`export function App({ items }: { items: string[] }) @{
				<>
					<h3>head</h3>
					<p>text</p>
					@for (const item of items) {
						<div>{item}</div>
					}
				</>
			}`,
			'App.tsrx',
		);

		const block = as_type(
			found(as_type(ast.body[0], 'ExportNamedDeclaration').declaration),
			'FunctionDeclaration',
		).body;
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlockRender(block).type).toBe('JSXFragment');
		expect(node_children(codeBlockRender(block)).map((child) => child.type)).toEqual([
			'JSXElement',
			'JSXElement',
			'JSXForExpression',
		]);
		expect(
			as_type(node_children(codeBlockRender(block))[2], 'JSXForExpression').body.body[0].type,
		).toBe('JSXElement');
	});

	it('parses @for empty fallbacks as template blocks', () => {
		const returned = getReturned(`function App() { return <ul>
			@for (const item of items; key item.id) {
				<li>{item.label}</li>
			} @empty {
				const message = 'No items';
				<li>{message}</li>
			}
		</ul>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXForExpression');
		assert_type(directive, 'JSXForExpression');
		expect(directive.empty?.type).toBe('BlockStatement');
		expect(blockBody(directive.empty).map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'JSXElement',
		]);
		expect(
			as_type(
				as_type(blockBody(directive.empty)[1], 'JSXElement').openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('li');
	});

	it('rejects braceless @for empty fallbacks', () => {
		expect(() =>
			getReturned(`function App() { return <ul>
				@for (const item of items) {
					<li>{item.label}</li>
				} @empty <li>No items</li>
			</ul>; }`),
		).toThrow(/Expected `\{` after JSX control-flow directive/);
	});

	it('parses code-only @for bodies', () => {
		const returned = getReturned(`function App() { return <ul>
			@for (const item of items) {
				calls++;
			}
		</ul>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXForExpression');
		expect(blockBody(directive?.body).map((child) => child.type)).toEqual(['ExpressionStatement']);
	});

	it('parses @switch as a JSXSwitchExpression with fragment case bodies', () => {
		const returned = getReturned(`function App() { return <div>
			@switch (value) {
				@case 'a': {
					<>Case A</>
				}
				@case 'b': {
					<>Case B</>
				}
				@default: {
					<>Fallback</>
				}
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXSwitchExpression');
		assert_type(directive, 'JSXSwitchExpression');
		expect(directive.statementType).toBe('SwitchStatement');
		expect(as_type(directive.discriminant, 'Identifier').name).toBe('value');
		expect(directive.cases).toHaveLength(3);
		expect(as_type(directive.cases[0].test, 'Literal').value).toBe('a');
		expect(directive.cases[0].consequent[0].type).toBe('JSXFragment');
		expect(as_type(node_children(directive.cases[0].consequent[0])[0], 'JSXText').value).toContain(
			'Case A',
		);
		expect(directive.cases[2].test).toBeNull();
		expect(as_type(node_children(directive.cases[2].consequent[0])[0], 'JSXText').value).toContain(
			'Fallback',
		);
	});

	it('parses @try as a JSXTryExpression', () => {
		const returned = getReturned(`function App() { return <div>
			@try {
				<ComponentThatSuspends />
			} @pending {
				<>Loading</>
			} @catch (error, reset) {
				<>Failed</>
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXTryExpression');
		assert_type(directive, 'JSXTryExpression');
		expect(directive.statementType).toBe('TryStatement');
		expect(directive.block.body[0].type).toBe('JSXElement');
		expect(blockBody(directive.pending)[0].type).toBe('JSXFragment');
		expect(as_type(node_children(blockBody(directive.pending)[0])[0], 'JSXText').value).toContain(
			'Loading',
		);
		expect(as_type(found(found(directive.handler).param), 'Identifier').name).toBe('error');
		expect(as_type(found(found(directive.handler).resetParam), 'Identifier').name).toBe('reset');
		expect(
			as_type(node_children(blockBody(directive.handler?.body)[0])[0], 'JSXText').value,
		).toContain('Failed');
	});

	it('parses code-only @try bodies', () => {
		const returned = getReturned(`function App() { return <div>
			@try {
				calls++;
			} @pending {
				<>Loading</>
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXTryExpression');
		expect(blockBody(directive?.block).map((child) => child.type)).toEqual(['ExpressionStatement']);
		expect(blockBody(directive?.pending)[0].type).toBe('JSXFragment');
	});

	it('parses a `@{ }` block returned directly from an arrow body', () => {
		const ast = parseModule(
			`const G = () => @{
				const a = 5;
				<div>{a}</div>
			};`,
			'App.tsrx',
		);
		const block = as_type(
			declaratorInit(firstStatement(ast, 'VariableDeclaration')),
			'ArrowFunctionExpression',
		).body;
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('div');
	});

	it('parses a `@{ }` block assigned to a variable', () => {
		const ast = parseModule(
			`const x = @{
				const a = 5;
				<div>{a}</div>
			};`,
			'App.tsrx',
		);
		const block = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(block, 'JSXCodeBlock');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('div');
	});

	it('parses an @if directive returned from a `.map()` callback', () => {
		const directive = findNode(
			`const H = items.map((i) => @if (i.ok) { <li>{i.name}</li> });`,
			'JSXIfExpression',
		);
		assert_type(directive, 'JSXIfExpression');
		expect(blockBody(directive.consequent)[0].type).toBe('JSXElement');
		expect(
			as_type(
				as_type(blockBody(directive.consequent)[0], 'JSXElement').openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('li');
	});

	it('parses an arrow component whose whole body is a `@{ }` block', () => {
		const ast = parseModule(
			`const Something = () => @{
				const a = 5;
				<div>a: {a}</div>
			};`,
			'App.tsrx',
		);
		const block = as_type(
			declaratorInit(firstStatement(ast, 'VariableDeclaration')),
			'ArrowFunctionExpression',
		).body;
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('div');
		expect(node_children(found(block.render)).map((child) => child.type)).toEqual([
			'JSXText',
			'JSXExpressionContainer',
		]);
	});

	it('parses a function declaration whose whole body is a `@{ }` block', () => {
		const ast = parseModule(
			`function Something() @{
				const a = 5;
				<div>a: {a}</div>
			}`,
			'App.tsrx',
		);
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
		expect(codeBlock(fn.body).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(fn.body), 'JSXElement')).name).toBe('div');
	});

	it('parses an empty `@{}` function declaration body', () => {
		const ast = parseModule(`function Something() @{}`, 'App.tsrx');
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
		expect(codeBlock(fn.body).body).toEqual([]);
		expect(codeBlock(fn.body).render).toBeNull();
	});

	it('parses a `@{ }` block as an object property arrow body', () => {
		const ast = parseModule(`const obj = { Prop: () => @{ <div/> } };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		assert_type(value, 'ArrowFunctionExpression');
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(openingName(as_type(codeBlockRender(value.body), 'JSXElement')).name).toBe('div');
	});

	it('parses an empty `@{}` object property arrow body', () => {
		const ast = parseModule(`const obj = { Prop: () => @{} };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		expect(as_type(value, 'ArrowFunctionExpression').body.type).toBe('JSXCodeBlock');
		expect(as_type(as_type(value, 'ArrowFunctionExpression').body, 'JSXCodeBlock').body).toEqual(
			[],
		);
		expect(
			as_type(as_type(value, 'ArrowFunctionExpression').body, 'JSXCodeBlock').render,
		).toBeNull();
	});

	it('parses a `@{ }` block as a method shorthand body', () => {
		const ast = parseModule(`const obj = { Render() @{ <div/> } };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		assert_type(value, 'FunctionExpression');
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(openingName(as_type(codeBlockRender(value.body), 'JSXElement')).name).toBe('div');
	});

	it('parses a `@{ }` block as a function body following a return type', () => {
		const ast = parseModule(`function App(): JSX.Element @{}`, 'App.tsrx');
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
		expect(codeBlock(fn.body).body).toEqual([]);
		expect(codeBlock(fn.body).render).toBeNull();
		expect(found(fn.returnType).type).toBe('TSTypeAnnotation');
		expect(found(fn.returnType).typeAnnotation.type).toBe('TSTypeReference');
	});

	it('splits setup and render in a `@{ }` body after a return type', () => {
		const ast = parseModule(
			`function App(): JSX.Element @{
				const a = 5;
				<div>a: {a}</div>
			}`,
			'App.tsrx',
		);
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(found(as_type(fn, 'FunctionDeclaration').returnType).typeAnnotation.type).toBe(
			'TSTypeReference',
		);
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
		expect(codeBlock(fn.body).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(fn.body), 'JSXElement')).name).toBe('div');
	});

	it('parses a `@{ }` block as an arrow concise body after a return type', () => {
		const ast = parseModule(`const App = (): JSX.Element => @{ <div/> };`, 'App.tsrx');
		const value = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(value, 'ArrowFunctionExpression');
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(value.returnType?.typeAnnotation.type).toBe('TSTypeReference');
		expect(openingName(as_type(codeBlockRender(value.body), 'JSXElement')).name).toBe('div');
	});

	it('parses a `@{ }` block as an anonymous function-expression body', () => {
		const ast = parseModule(`const obj = { render: function() @{} };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		assert_type(value, 'FunctionExpression');
		expect(value.id).toBeNull();
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(value.body.body).toEqual([]);
		expect(codeBlock(value.body).render).toBeNull();
	});

	it('parses a `@{ }` anonymous function-expression body after a return type', () => {
		const ast = parseModule(`const obj = { render: function(): JSX.Element @{} };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		assert_type(value, 'FunctionExpression');
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(value.returnType?.typeAnnotation.type).toBe('TSTypeReference');
	});

	it('parses a `@{ }` method shorthand body after a return type', () => {
		const ast = parseModule(`const obj = { Render(): JSX.Element @{ <div/> } };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		assert_type(value, 'FunctionExpression');
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(value.returnType?.typeAnnotation.type).toBe('TSTypeReference');
		expect(openingName(as_type(codeBlockRender(value.body), 'JSXElement')).name).toBe('div');
	});

	it('parses a `@{ }` body on a generic function with a return type', () => {
		const ast = parseModule(`function Test<T>(value: T): T @{}`, 'App.tsrx');
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(found(fn.typeParameters).params.map((p) => p.name)).toEqual(['T']);
		expect(found(fn.returnType).typeAnnotation.type).toBe('TSTypeReference');
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
	});

	it('parses a `@{ }` body with multiple type parameters and a tuple return type', () => {
		const ast = parseModule(`function Test<T, U>(first: T, second: U): [T, U] @{}`, 'App.tsrx');
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(found(as_type(fn, 'FunctionDeclaration').typeParameters).params).toHaveLength(2);
		expect(found(as_type(fn, 'FunctionDeclaration').returnType).typeAnnotation.type).toBe(
			'TSTupleType',
		);
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
	});

	it('parses a `@{ }` body with a constrained type parameter', () => {
		const ast = parseModule(
			`function Test<T extends { id: string }>(item: T): string @{}`,
			'App.tsrx',
		);
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(
			found(found(as_type(fn, 'FunctionDeclaration').typeParameters).params[0].constraint).type,
		).toBe('TSTypeLiteral');
		expect(found(as_type(fn, 'FunctionDeclaration').returnType).typeAnnotation.type).toBe(
			'TSStringKeyword',
		);
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
	});

	it('parses a `@{ }` body with a defaulted type parameter', () => {
		const ast = parseModule(`function Test<T = string>(value: T): T @{}`, 'App.tsrx');
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(
			found(found(as_type(fn, 'FunctionDeclaration').typeParameters).params[0].default).type,
		).toBe('TSStringKeyword');
		expect(found(as_type(fn, 'FunctionDeclaration').returnType).typeAnnotation.type).toBe(
			'TSTypeReference',
		);
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
	});

	it('parses a `@{ }` body on a generic function with a union return type', () => {
		const ast = parseModule(`function Test<T>(items: T[]): T | undefined @{}`, 'App.tsrx');
		const fn = firstStatement(ast, 'FunctionDeclaration');
		expect(
			found(as_type(fn, 'FunctionDeclaration').typeParameters).params.map((p) => p.name),
		).toEqual(['T']);
		const union = found(as_type(fn, 'FunctionDeclaration').returnType).typeAnnotation;
		assert_type(union, 'TSUnionType');
		expect(
			union.types.map((t) =>
				t.type === 'TSTypeReference' ? as_type(t.typeName, 'Identifier').name : t.type,
			),
		).toEqual(['T', 'TSUndefinedKeyword']);
		expect(codeBlock(fn.body).type).toBe('JSXCodeBlock');
	});

	it('rejects an arrow token between a function return type and a `@{ }` body', () => {
		expect(() => parseModule(`function App(): JSX.Element => @{}`, 'App.tsrx')).toThrow(
			/Unexpected token/,
		);
	});

	it('parses a typed arrow property whose concise body is a `@{ }` block', () => {
		const ast = parseModule(`const obj = { Render: (): JSX.Element => @{ <div/> } };`, 'App.tsrx');
		const value = as_type(
			as_type(declaratorInit(firstStatement(ast, 'VariableDeclaration')), 'ObjectExpression')
				.properties[0],
			'Property',
		).value;
		assert_type(value, 'ArrowFunctionExpression');
		expect(value.returnType?.typeAnnotation.type).toBe('TSTypeReference');
		expect(value.body.type).toBe('JSXCodeBlock');
		expect(openingName(as_type(codeBlockRender(value.body), 'JSXElement')).name).toBe('div');
	});

	it('rejects duplicate params in a `@{ }` function body after a return type', () => {
		expect(() => parseModule(`function App(a, a): JSX.Element @{}`, 'App.tsrx')).toThrow(
			/Argument name clash/,
		);
	});

	it('rejects non-code-block directives as function bodies after a return type', () => {
		expect(() =>
			parseModule(`function App(): JSX.Element @if (show) { <div/> }`, 'App.tsrx'),
		).toThrow(/Unexpected token/);
	});

	it('assigns each @-control directive directly to a variable', () => {
		const cases = [
			['const x = @if (c) { <a/> };', 'JSXIfExpression'],
			['const x = @for (const i of items) { <li>{i}</li> };', 'JSXForExpression'],
			["const x = @switch (v) { @case 'a': { <a/> } };", 'JSXSwitchExpression'],
			['const x = @try { <a/> } @catch (e) { <b/> };', 'JSXTryExpression'],
		];
		for (const [source, type] of cases) {
			const init = declaratorInit(parseModule(source, 'App.tsrx').body[0]);
			expect(init.type, source).toBe(type);
		}
	});

	it('returns a `@{ }` block and each @-control directive directly', () => {
		const cases = [
			['function App() { return @{ const a = 5; <div>{a}</div> }; }', 'JSXCodeBlock'],
			['function App() { return @if (c) { <a/> }; }', 'JSXIfExpression'],
			['function App() { return @for (const i of xs) { <li>{i}</li> }; }', 'JSXForExpression'],
			["function App() { return @switch (v) { @case 'a': { <a/> } }; }", 'JSXSwitchExpression'],
			['function App() { return @try { <a/> } @catch (e) { <b/> }; }', 'JSXTryExpression'],
		];
		for (const [source, type] of cases) {
			const statement = as_type(parseModule(source, 'App.tsrx').body[0], 'FunctionDeclaration').body
				.body[0];
			expect(statement.type, source).toBe('ReturnStatement');
			expect(as_type(statement, 'ReturnStatement').argument?.type, source).toBe(type);
		}
	});

	it('parses a `@{ }` block and each @-control directive as expression statements', () => {
		const cases = [
			['function App() { @{ const a = 5; <div>{a}</div> }; }', 'JSXCodeBlock'],
			['function App() { @if (c) { <a/> }; }', 'JSXIfExpression'],
			['function App() { @for (const i of xs) { <li>{i}</li> }; }', 'JSXForExpression'],
			["function App() { @switch (v) { @case 'a': { <a/> } }; }", 'JSXSwitchExpression'],
			['function App() { @try { <a/> } @catch (e) { <b/> }; }', 'JSXTryExpression'],
		];
		for (const [source, type] of cases) {
			const statement = as_type(parseModule(source, 'App.tsrx').body[0], 'FunctionDeclaration').body
				.body[0];
			expect(statement.type, source).toBe('ExpressionStatement');
			expect(as_type(statement, 'ExpressionStatement').expression.type, source).toBe(type);
		}
	});

	it('keeps a decorated class expression parsing as a decorator, not a code block', () => {
		const ast = parseModule(`const X = @dec class {};`, 'App.tsrx');
		const init = declaratorInit(firstStatement(ast, 'VariableDeclaration'));
		assert_type(init, 'ClassExpression');
		expect(as_type(init.decorators[0].expression, 'Identifier').name).toBe('dec');
	});

	it('gives every class and class member an ESTree decorators array', () => {
		const ast = parseModule(
			`class Plain { method() {} field = 1; accessor stored = 1; }
			const Expression = class { method() {} };
			@dec class Decorated { @member method() {} field = 1; }`,
			'App.tsrx',
		);
		/** @param {AST.ClassDeclaration | AST.ClassExpression} node */
		const decorator_names = (node) =>
			[node, ...node.body.body].map((part) =>
				'decorators' in part
					? part.decorators.map((decorator) => as_type(decorator.expression, 'Identifier').name)
					: null,
			);

		expect(decorator_names(as_type(ast.body[0], 'ClassDeclaration'))).toEqual([[], [], [], []]);
		expect(
			decorator_names(
				as_type(declaratorInit(as_type(ast.body[1], 'VariableDeclaration')), 'ClassExpression'),
			),
		).toEqual([[], []]);
		expect(decorator_names(as_type(ast.body[2], 'ClassDeclaration'))).toEqual([
			['dec'],
			['member'],
			[],
		]);
	});

	it('reports an error for two bare render nodes in a code block', () => {
		expect(() =>
			parseModule(
				`function App() { return <div>@{ const a = 5; <span/> <b/> }</div>; }`,
				'App.tsrx',
			),
		).toThrow(/single node/);
	});

	it('reports an error for a statement after the render node', () => {
		expect(() =>
			parseModule(
				`function App() { return <div>@{ const a = 5; <span/> doThing(); }</div>; }`,
				'App.tsrx',
			),
		).toThrow(/statements cannot follow/);
	});

	it('reports an error for bare text inside a code block', () => {
		expect(() =>
			parseModule(`function App() { return <div>@{ hello world }</div>; }`, 'App.tsrx'),
		).toThrow();
	});

	it('leaves forgotten statement-container validation to semantic analysis', () => {
		const source = `export function UserBadge({ user }: UserBadgeProps): JSX.Element {
			const initials = user.name.slice(0, 2).toUpperCase();

			<button title={user.name}>{initials}</button>
		}`;

		expect(() => parseModule(source, 'App.tsrx')).not.toThrow();

		/** @type {CompileError[]} */
		const errors = [];
		parseModule(source, 'App.tsrx', { collect: true, errors });
		expect(errors).toEqual([]);
	});

	it('keeps node locations in sync after re-reading a setup statement mis-read as JSX text', () => {
		// A setup statement following a render node can be mis-tokenized as JSX text
		// that swallows the following blank line(s). Re-reading it must rewind the
		// line counter along with `pos`, otherwise every node from there on (and the
		// code block's own end, which lands past the file when there is no trailing
		// newline) gets a `loc` inflated by the swallowed newlines — crashing
		// downstream source-map mapping. No trailing newline reproduces the worst case.
		const source =
			`export function App() @{\n` +
			`\tfunction children() @{\n` +
			`\t\t<p>{'x'}</p>\n` +
			`\t}\n` +
			`\n` +
			`\t<Card {children} />\n` +
			`\n` +
			`\tconst test = 5;\n` +
			`\n` +
			`\t<div>{test}</div>\n` +
			`}`;
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(source, 'App.tsrx', { collect: true, errors });
		const total_lines = source.split('\n').length;

		// Every node's reported line must match the line its byte offset actually sits on.
		/** @param {number} offset */
		const line_of = (offset) => source.slice(0, offset).split('\n').length;
		for (const node of allNodes(ast)) {
			if (!node.loc || typeof node.start !== 'number') continue;
			expect(node.loc.start.line, `${node.type} start`).toBe(line_of(node.start));
			expect(node.loc.end.line, `${node.type} end`).toBe(line_of(found(node.end)));
			expect(node.loc.end.line).toBeLessThanOrEqual(total_lines);
		}

		// Both authoring-rule diagnostics still land on the correct source lines.
		const messages = errors.map((e) => `${e.loc?.start?.line}:${e.message}`);
		expect(messages.some((m) => m.startsWith('8:') && /statements cannot follow/.test(m))).toBe(
			true,
		);
		expect(messages.some((m) => m.startsWith('10:') && /single node/.test(m))).toBe(true);
	});

	it('keeps shorthand attribute locations aligned across every JavaScript line terminator', () => {
		const source =
			'export function App() @{\r\n' +
			'\tconst first = 1;\r' +
			'\tconst second = 2;\u2028' +
			'\tconst total = first + second;\u2029' +
			'\t<main {total} />\n' +
			'}';
		const ast = parseModule(source, 'App.tsrx');
		const shorthand = find_first(
			ast,
			(node) => node.type === 'JSXAttribute' && node.shorthand === true,
		);
		assert_type(shorthand, 'JSXAttribute');
		const located = [
			shorthand,
			shorthand.name,
			as_type(shorthand.value, 'JSXExpressionContainer'),
			as_type(as_type(shorthand.value, 'JSXExpressionContainer').expression, 'Identifier'),
		];
		for (const node of located) {
			expect(node.loc?.start, `${node.type} start`).toEqual(
				acorn.getLineInfo(source, found(node.start)),
			);
			expect(node.loc?.end, `${node.type} end`).toEqual(acorn.getLineInfo(source, found(node.end)));
		}
	});

	it.each([
		['LF', '\n'],
		['CRLF', '\r\n'],
	])('keeps every node location aligned around multiline spread attributes (%s)', (_, eol) => {
		// A spread whose `...` is read from raw template text rewinds `pos` before
		// tokenizing the argument. The lexer line state must rewind with it,
		// otherwise the line breaks inside the spread are counted twice and every
		// node from the argument onward reports an inflated line.
		const source = [
			'function Demo(props, extra) @{',
			'\tconst id = props.id;',
			'\t<div {...',
			'\t\tprops',
			'\t} {...extra} {...merge(',
			'\t\tprops,',
			'\t\textra,',
			'\t)} id={id}>',
			'\t\t<span {...',
			'\t\t\textra',
			'\t\t} />',
			'\t</div>',
			'}',
		].join(eol);
		const ast = parseModule(source, 'App.tsrx');
		const total_lines = source.split(eol).length;

		for (const node of allNodes(ast)) {
			if (!node.loc || typeof node.start !== 'number') continue;
			expect(node.loc.start, `${node.type} start`).toEqual(
				acorn.getLineInfo(source, found(node.start)),
			);
			expect(node.loc.end, `${node.type} end`).toEqual(acorn.getLineInfo(source, found(node.end)));
			expect(node.loc.end.line).toBeLessThanOrEqual(total_lines);
		}

		const element = as_type(as_type(ast.body[0], 'FunctionDeclaration').body, 'JSXCodeBlock');
		const opening = as_type(codeBlock(element).render, 'JSXElement').openingElement;
		const [first, second, third, id] = opening.attributes;
		assert_type(first, 'JSXSpreadAttribute');
		assert_type(second, 'JSXSpreadAttribute');
		assert_type(third, 'JSXSpreadAttribute');
		assert_type(id, 'JSXAttribute');
		expect(source.slice(found(first.argument.start), found(first.argument.end))).toBe('props');
		expect(first.argument.loc?.start).toEqual({ line: 4, column: 2 });
		expect(first.argument.loc?.end).toEqual({ line: 4, column: 7 });
		expect(first.loc?.start).toEqual({ line: 3, column: 6 });
		expect(first.loc?.end).toEqual({ line: 5, column: 2 });
		expect(second.argument.loc?.start).toEqual({ line: 5, column: 7 });
		expect(third.argument.loc?.start).toEqual({ line: 5, column: 18 });
		expect(third.argument.loc?.end).toEqual({ line: 8, column: 2 });
		expect(id.loc?.start).toEqual({ line: 8, column: 4 });
		expect(id.loc?.end).toEqual({ line: 8, column: 11 });
	});

	it('keeps single-line spread attribute locations unchanged', () => {
		const source = 'function Demo(props) @{\n\t<div {...props} id={props.id} />\n}';
		const ast = parseModule(source, 'App.tsrx');
		const spread = find_first(ast, (node) => node.type === 'JSXSpreadAttribute');
		assert_type(spread, 'JSXSpreadAttribute');
		expect(spread.argument.start).toBe(source.indexOf('props}'));
		expect(spread.argument.loc?.start).toEqual({ line: 2, column: 10 });
		expect(spread.argument.loc?.end).toEqual({ line: 2, column: 15 });
		expect(spread.loc?.end).toEqual({ line: 2, column: 16 });
	});

	it.each([
		['a block comment', 'function Demo(props) @{\n\t<div {/* c */ ...props} id={props.id} />\n}'],
		[
			'a multiline block comment',
			'function Demo(props) @{\n\t<div {/* c\n\t*/ ...props} id={props.id} />\n}',
		],
		[
			'a line comment',
			'function Demo(props) @{\n\t<div {// c\n\t\t...props\n\t} id={props.id} />\n}',
		],
		['a non-ASCII space', 'function Demo(props) @{\n\t<div {\u00a0...props} id={props.id} />\n}'],
		[
			'a block comment in plain TSX',
			'function Demo(props) {\n\treturn <div {/* c */ ...props} id={props.id} />;\n}',
		],
	])('parses a spread attribute with %s before the ellipsis', (_, source) => {
		// Only ASCII whitespace is peeked past before deciding how to tokenize the
		// brace; comments and Unicode whitespace are left to acorn's `skipSpace`,
		// so the token after `{` must never be read as raw template text.
		const ast = parseModule(source, 'App.tsrx');
		const spread = find_first(ast, (node) => node.type === 'JSXSpreadAttribute');
		assert_type(spread, 'JSXSpreadAttribute');
		const argument_start = source.indexOf('...') + '...'.length;
		expect(spread.argument.start).toBe(argument_start);
		expect(spread.argument.end).toBe(argument_start + 'props'.length);
		expect(spread.argument.loc).toEqual({
			start: acorn.getLineInfo(source, argument_start),
			end: acorn.getLineInfo(source, argument_start + 'props'.length),
		});
		expect(spread.end).toBe(source.indexOf('}', argument_start) + 1);
		const id = find_first(
			ast,
			(node) =>
				node.type === 'JSXAttribute' &&
				/** @type {ESTreeJSX.JSXAttribute} */ (node).name.name === 'id',
		);
		assert_type(id, 'JSXAttribute');
		expect(id.loc?.start).toEqual(acorn.getLineInfo(source, found(id.start)));
		for (const node of allNodes(ast)) {
			if (!node.loc || typeof node.start !== 'number') continue;
			expect(node.loc.start, `${node.type} start`).toEqual(
				acorn.getLineInfo(source, found(node.start)),
			);
			expect(node.loc.end, `${node.type} end`).toEqual(acorn.getLineInfo(source, found(node.end)));
		}
	});

	it.each([
		['a block comment', 'function Demo(id) @{\n\t<div {/* c */ id} />\n}'],
		['a non-ASCII space', 'function Demo(id) @{\n\t<div {\u00a0id} />\n}'],
	])('parses a shorthand attribute with %s before the name', (_, source) => {
		const ast = parseModule(source, 'App.tsrx');
		const attribute = find_first(ast, (node) => node.type === 'JSXAttribute');
		assert_type(attribute, 'JSXAttribute');
		expect(attribute.shorthand).toBe(true);
		expect(attribute.name.name).toBe('id');
		expect(attribute.end).toBe(source.indexOf('id}') + 'id}'.length);
		expect(attribute.loc?.end).toEqual(acorn.getLineInfo(source, found(attribute.end)));
	});

	it('parses a code-only `@{ }` block (no render) as a function body', () => {
		const ast = parseModule(
			`function App() @{
				const a = 5;
				const b = 6;
			}`,
			'App.tsrx',
		);

		const block = as_type(ast.body[0], 'FunctionDeclaration').body;
		expect(ast.body[0].type).toBe('FunctionDeclaration');
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'VariableDeclaration',
		]);
		expect(codeBlock(block).render).toBeNull();
	});

	it('parses two sibling `@{ }` blocks as separate element children', () => {
		const returned = getReturned(`function App() {
			return <main>
				@{
					const foo = props.foo();
					<span>{foo}</span>
				}
				@{
					const bar = props.bar();
					<span>{bar}</span>
				}
			</main>;
		}`);

		expect(node_children(returned).map((child) => child.type)).toEqual([
			'JSXCodeBlock',
			'JSXCodeBlock',
		]);
		const [first, second] = node_children(returned);
		expect(codeBlock(first).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(first), 'JSXElement')).name).toBe('span');
		expect(codeBlock(second).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(openingName(as_type(codeBlockRender(second), 'JSXElement')).name).toBe('span');
	});

	it('parses two sibling `@if` directives as separate element children', () => {
		const returned = getReturned(`function App() {
			return <main>
				@if (props.foo()) {
					<span>{props.foo()}</span>
				}
				@if (props.bar()) {
					<span>{props.bar()}</span>
				}
			</main>;
		}`);

		const directives = node_children(returned).filter((child) => child.type === 'JSXIfExpression');
		expect(directives).toHaveLength(2);
		expect(
			as_type(
				as_type(as_type(directives[0].test, 'CallExpression').callee, 'MemberExpression').object,
				'Identifier',
			).name,
		).toBe('props');
		expect(
			as_type(
				as_type(as_type(directives[0].test, 'CallExpression').callee, 'MemberExpression').property,
				'Identifier',
			).name,
		).toBe('foo');
		expect(
			as_type(
				as_type(blockBody(directives[0].consequent)[0], 'JSXElement').openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('span');
		expect(
			as_type(
				as_type(as_type(directives[1].test, 'CallExpression').callee, 'MemberExpression').property,
				'Identifier',
			).name,
		).toBe('bar');
		expect(
			as_type(
				as_type(blockBody(directives[1].consequent)[0], 'JSXElement').openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('span');
	});

	it('reports an error for setup plus two render nodes in an `@if` body', () => {
		expect(() =>
			parseModule(
				`function App() {
					return <main>
						@if (props.foo()) {
							const a = 5;
							<span>{props.foo()} {a}</span>

							@if (props.bar()) {
								const b = 6;
								<span>{props.bar()} {b}</span>
							}
						}
					</main>;
				}`,
				'App.tsrx',
			),
		).toThrow(/single node/);
	});

	it('reports an error for a nested `@{ }` block following a render node', () => {
		expect(() =>
			parseModule(
				`function App() {
					return <main>
						@{
							const a = 5;
							<span>{a}</span>

							@{
								const b = 6;
								<span>{b}</span>
							}
						}
					</main>;
				}`,
				'App.tsrx',
			),
		).toThrow(/single node/);
	});

	it('parses a nested `@if` with its own setup when siblings are wrapped in a fragment', () => {
		const returned = getReturned(`function App() {
			return <main>
				@if (props.foo()) {
					const a = 5;
					<>
						<span>{props.foo()} {a}</span>
						@if (props.bar()) {
							const b = 6;
							<span>{props.bar()} {b}</span>
						}
					</>
				}
			</main>;
		}`);

		const outer = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		assert_found(outer);
		expect(blockBody(outer.consequent).map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'JSXFragment',
		]);
		const fragment = blockBody(outer.consequent).find(
			(child) => /** @type {AST.Node} */ (child).type === 'JSXFragment',
		);
		assert_found(fragment);
		expect(node_children(fragment).map((child) => child.type)).toEqual([
			'JSXElement',
			'JSXIfExpression',
		]);
		const inner = node_children(fragment).find((child) => child.type === 'JSXIfExpression');
		expect(blockBody(inner?.consequent).map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'JSXElement',
		]);
		expect(
			as_type(
				as_type(blockBody(inner?.consequent)[1], 'JSXElement').openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('span');
	});

	it('reports an error for nested `@{ }` blocks directly inside a code block body', () => {
		expect(() =>
			parseModule(
				`function App() {
					return <main>@{
						const hey = 10;
						@{
							const foo = props.foo();
							<span>{foo} {hey}</span>
						}
						@{
							const bar = props.bar();
							<span>{bar} {hey}</span>
						}
					}</main>;
				}`,
				'App.tsrx',
			),
		).toThrow(/single node/);
	});

	it('parses a single nested `@{ }` block as a code block render output', () => {
		const returned = getReturned(`function App() {
			return <main>@{
				const hey = 10;
				@{
					const foo = props.foo();
					<span>{foo} {hey}</span>
				}
			}</main>;
		}`);

		const block = child(returned, 0, 'JSXCodeBlock');
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXCodeBlock');
		expect(openingName(as_type(codeBlockRender(codeBlockRender(block)), 'JSXElement')).name).toBe(
			'span',
		);
	});

	it('reports the one-child violation recoverably in loose mode', () => {
		/** @type {CompileError[]} */
		const errors = [];
		const ast = parseModule(
			`function App() {
				return <main>@{
					const hey = 10;
					@{ const foo = props.foo(); <span>{foo} {hey}</span> }
					@{ const bar = props.bar(); <span>{bar} {hey}</span> }
				}</main>;
			}`,
			'App.tsrx',
			{ loose: true, errors },
		);

		// Non-fatal: parsing still produces an AST.
		assert_type(ast, 'Program');
		expect(errors.map((error) => error.message)).toEqual([expect.stringMatching(/single node/)]);
	});

	it('parses nested `@{ }` blocks when wrapped in a fragment render output', () => {
		const returned = getReturned(`function App() {
			return <main>@{
				const hey = 10;
				<>
					@{
						const foo = props.foo();
						<span>{foo} {hey}</span>
					}
					@{
						const bar = props.bar();
						<span>{bar} {hey}</span>
					}
				</>
			}</main>;
		}`);

		const block = child(returned, 0, 'JSXCodeBlock');
		assert_type(block, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXFragment');
		expect(node_children(found(block.render)).map((child) => child.type)).toEqual([
			'JSXCodeBlock',
			'JSXCodeBlock',
		]);
		const [first, second] = node_children(found(block.render));
		expect(openingName(as_type(codeBlockRender(first), 'JSXElement')).name).toBe('span');
		expect(openingName(as_type(codeBlockRender(second), 'JSXElement')).name).toBe('span');
	});

	it('parses a code-only `@{ }` block (no render) as an element body', () => {
		const returned = getReturned(`function App() {
			return <div>@{
				const a = 5
				const b = 6
			}</div>;
		}`);

		expect(node_children(returned).map((child) => child.type)).toEqual(['JSXCodeBlock']);
		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'VariableDeclaration',
		]);
		expect(codeBlock(block).render).toBeNull();
	});

	// The boundary between a block's setup section and its single render node hinges
	// on where the render node's `<` sits. A `<tag` that begins a new line (or follows
	// a statement separator that opens an expression position) starts the render
	// output; a `<` that merely continues a value on the same line stays a relational
	// operator. This keeps badly spaced comparisons such as `aaa <b` from being
	// mistaken for a `<b>` tag.
	it('starts the render node when a bare `<tag` begins a new line after a value', () => {
		const returned = getReturned(`function App() { return <div>@{
			const x = aaa
			<b>hi</b>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(declaratorInit(block.body[0]).type).toBe('Identifier');
		expect(codeBlockRender(block).type).toBe('JSXElement');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('b');
	});

	it('keeps a same-line `value < tag-like` as a comparison, with render on the next line', () => {
		const returned = getReturned(`function App() { return <div>@{
			const r = aaa < b
			<span>{r}</span>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		const init = declaratorInit(block.body[0]);
		assert_type(init, 'BinaryExpression');
		expect(init.operator).toBe('<');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('keeps a no-space same-line `aaa <b` as a comparison, not a `<b>` tag', () => {
		const returned = getReturned(`function App() { return <div>@{
			const r = aaa <b
			<span>{r}</span>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		const init = declaratorInit(block.body[0]);
		assert_type(init, 'BinaryExpression');
		expect(init.operator).toBe('<');
		expect(as_type(init.left, 'Identifier').name).toBe('aaa');
		expect(as_type(init.right, 'Identifier').name).toBe('b');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('treats a trailing `aaa <b` with no following node as a comparison, never a render node', () => {
		const returned = getReturned(`function App() { return <div>@{
			const r = aaa <b
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).render).toBeNull();
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(as_type(declaratorInit(block.body[0]), 'BinaryExpression').operator).toBe('<');
	});

	it('still starts the render node when a `<tag` follows a `;` on the same line', () => {
		const returned = getReturned(`function App() { return <div>@{
			const a = 5; <span/>
		}</div>; }`);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXElement');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('parses a one-line `@{ }` block whose render follows the setup `;` (fragment)', () => {
		const returned = getReturned(
			`function App() { return <div>@{ const foo = 123; <>{foo}</> }</div>; }`,
		);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(as_type(declaratorInit(block.body[0]), 'Literal').value).toBe(123);
		expect(codeBlockRender(block).type).toBe('JSXFragment');
		expect(node_children(codeBlockRender(block)).map((child) => child.type)).toEqual([
			'JSXExpressionContainer',
		]);
	});

	it('parses a one-line `@{ }` block whose render follows the setup `;` (element)', () => {
		const returned = getReturned(
			`function App() { return <div>@{ const foo = 123; <span>{foo}</span> }</div>; }`,
		);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXElement');
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('parses a one-line `@{ }` block with multiple `;`-separated setup statements before the render', () => {
		const returned = getReturned(
			`function App() { return <div>@{ const a = 1; const b = 2; <span>{a}{b}</span> }</div>; }`,
		);

		const block = child(returned, 0, 'JSXCodeBlock');
		expect(codeBlock(block).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'VariableDeclaration',
		]);
		expect(openingName(as_type(codeBlockRender(block), 'JSXElement')).name).toBe('span');
	});

	it('parses a one-line `@{ }` block returned directly', () => {
		const ast = parseModule(
			`function App() { return @{ const foo = 123; <>{foo}</> }; }`,
			'App.tsrx',
		);
		const statement = functionBody(ast)[0];

		assert_type(statement, 'ReturnStatement');
		expect(statement.argument?.type).toBe('JSXCodeBlock');
		expect(codeBlock(statement.argument).body.map((child) => child.type)).toEqual([
			'VariableDeclaration',
		]);
		expect(codeBlockRender(statement.argument).type).toBe('JSXFragment');
	});

	it('applies the setup-to-render `<` disambiguation inside an `@if` consequent', () => {
		const returned = getReturned(`function App() { return <div>
			@if (ready) {
				const r = aaa <b
				<span>{r}</span>
			}
		</div>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXIfExpression');
		expect(blockBody(directive?.consequent).map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'JSXElement',
		]);
		const init = declaratorInit(blockBody(directive?.consequent)[0]);
		assert_type(init, 'BinaryExpression');
		expect(init.operator).toBe('<');
		expect(
			as_type(
				as_type(blockBody(directive?.consequent)[1], 'JSXElement').openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('span');
	});

	it('applies the setup-to-render `<` disambiguation inside an `@for` body', () => {
		const returned = getReturned(`function App() { return <ul>
			@for (const item of items) {
				const r = item <count
				<li>{r}</li>
			}
		</ul>; }`);

		const directive = node_children(returned).find((child) => child.type === 'JSXForExpression');
		expect(blockBody(directive?.body).map((child) => child.type)).toEqual([
			'VariableDeclaration',
			'JSXElement',
		]);
		expect(as_type(declaratorInit(directive?.body.body[0]), 'BinaryExpression').operator).toBe('<');
		expect(
			as_type(as_type(directive?.body.body[1], 'JSXElement').openingElement.name, 'JSXIdentifier')
				.name,
		).toBe('li');
	});

	// The render node of a one-line block can be an `@if`/`@for`/`@switch`/`@try`
	// directive, not just a `<tag`. Directive bodies are implicit statement
	// containers, so they must use `{ }`.
	it('rejects a braceless `@if` render after the setup `;`', () => {
		expect(() =>
			getReturned(`function App() { return @{ const foo = 123; @if (foo) <div>{foo}</div> }; }`),
		).toThrow(/Expected `\{` after JSX control-flow directive/);
	});

	it('rejects a braceless `@if` render whose consequent begins on the next line', () => {
		expect(() =>
			getReturned(`function App() { return @{ const foo = 123; @if (foo)
				<div>{foo}</div> }; }`),
		).toThrow(/Expected `\{` after JSX control-flow directive/);
	});

	it('parses a braced `@if` render after the setup `;` on the same line', () => {
		const block = getReturnedCodeBlock(
			`function App() { return @{ const foo = 123; @if (foo) { <div>{foo}</div> } }; }`,
		);

		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXIfExpression');
		expect(as_type(codeBlockRender(block), 'JSXIfExpression').consequent.type).toBe(
			'BlockStatement',
		);
		expect(
			blockBody(as_type(codeBlockRender(block), 'JSXIfExpression').consequent).map(
				(child) => child.type,
			),
		).toEqual(['JSXElement']);
		expect(
			as_type(
				as_type(
					blockBody(as_type(codeBlockRender(block), 'JSXIfExpression').consequent)[0],
					'JSXElement',
				).openingElement.name,
				'JSXIdentifier',
			).name,
		).toBe('div');
	});

	it('parses a braced `@if` render whose body begins on the next line', () => {
		const block = getReturnedCodeBlock(`function App() { return @{ const foo = 123; @if (foo) {
			<div>{foo}</div>} }; }`);

		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXIfExpression');
		expect(
			blockBody(as_type(codeBlockRender(block), 'JSXIfExpression').consequent).map(
				(child) => child.type,
			),
		).toEqual(['JSXElement']);
	});

	it('parses a braced `@for` render after the setup `;` on the same line', () => {
		const block = getReturnedCodeBlock(
			`function App() { return @{ const xs = [1, 2]; @for (const x of xs) { <li>{x}</li> } }; }`,
		);

		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXForExpression');
		const loop = as_type(codeBlockRender(block), 'JSXForExpression');
		expect(blockBody(loop.body).map((child) => child.type)).toEqual(['JSXElement']);
		expect(openingName(as_type(blockBody(loop.body)[0], 'JSXElement')).name).toBe('li');
	});

	it('rejects a braceless `@for` render after the setup `;`', () => {
		expect(() =>
			getReturned(
				`function App() { return @{ const xs = [1, 2]; @for (const x of xs) <li>{x}</li> }; }`,
			),
		).toThrow(/Expected `\{` after JSX control-flow directive/);
	});

	it('rejects a braceless `@try` render after the setup `;`', () => {
		expect(() =>
			getReturned(
				`function App() { return @{ const foo = 123; @try <div>{foo}</div> catch (e) { <span /> } }; }`,
			),
		).toThrow(/Unexpected keyword 'try'|Expected token `\{/);
	});

	it('allows and ignores a trailing `;` after a render node', () => {
		const block = getReturnedCodeBlock(
			`function App() { return @{ const foo = 123; @if (foo) { <div>{foo}</div> }; }; }`,
		);

		// The stray `;` is a meaningless empty statement; it is skipped rather than
		// captured as a body statement, so the render node still parses cleanly.
		expect(codeBlock(block).body.map((child) => child.type)).toEqual(['VariableDeclaration']);
		expect(codeBlockRender(block).type).toBe('JSXIfExpression');
	});

	it('allows and ignores a trailing `;` after a fragment render node', () => {
		const block = getReturnedCodeBlock(`function App() { return @{ <><div>{'hi'}</div></>; }; }`);

		expect(block.body).toEqual([]);
		expect(codeBlockRender(block).type).toBe('JSXFragment');
	});
});

describe('division and private fields in template JS positions', () => {
	// `/` and `#` in template TEXT are literal characters, which the tokenizer
	// special-cases. That special case must not swallow the JS positions that sit
	// under a template element on the node path: expression containers (attribute
	// and child) and control-flow directive headers, where `/` is division and
	// `#` is a private-field access.

	it('parses `/` as division in a NESTED element attribute expression', () => {
		const rect = findElement(
			`function App(p) { return @{ <g id={p.id}><rect x={p.left - p.dotSize / 2} /></g> }; }`,
			'rect',
		);
		const x = attributeExpression(rect.openingElement.attributes[0]);
		assert_type(x, 'BinaryExpression');
		expect(x.operator).toBe('-');
		expect(x.right.type).toBe('BinaryExpression');
		expect(as_type(x.right, 'BinaryExpression').operator).toBe('/');
	});

	it('parses `/` as division in a child expression container', () => {
		const g = findElement(`function App(p) { return @{ <g>{p.a / 2}</g> }; }`, 'g');
		const expr = as_type(
			found(node_children(g).find((c) => c.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		).expression;
		assert_type(expr, 'BinaryExpression');
		expect(expr.operator).toBe('/');
	});

	it('parses `#` as a private-field access in a child expression container', () => {
		const g = findElement(`class C { #x = 1; m() { return @{ <g>{this.#x}</g> }; } }`, 'g');
		const expr = as_type(
			found(node_children(g).find((c) => c.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		).expression;
		assert_type(expr, 'MemberExpression');
		expect(expr.property.type).toBe('PrivateIdentifier');
		expect(as_type(expr.property, 'PrivateIdentifier').name).toBe('x');
	});

	it('parses `/` as division in a directive header nested inside an element', () => {
		const node = findNode(
			`function App(p) { return @{ <g>@if (p.a / 2 > 1) { <rect /> }</g> }; }`,
			'JSXIfExpression',
		);
		expect(node.test.type).toBe('BinaryExpression');
		expect(as_type(node.test, 'BinaryExpression').operator).toBe('>');
		expect(as_type(node.test, 'BinaryExpression').left.type).toBe('BinaryExpression');
		expect(as_type(as_type(node.test, 'BinaryExpression').left, 'BinaryExpression').operator).toBe(
			'/',
		);
	});

	it('parses a regex literal inside a nested element attribute expression', () => {
		const rect = findElement(
			`function App(p) { return @{ <g><rect x={String(p.a).replace(/x/g, String(2 / p.b))} /></g> }; }`,
			'rect',
		);
		const x = attributeExpression(rect.openingElement.attributes[0]);
		assert_type(x, 'CallExpression');
		expect(x.arguments[0].type).toBe('Literal');
		expect(regexLiteral(x.arguments[0])).toEqual({ pattern: 'x', flags: 'g' });
	});

	it('still reads a literal `/` and `#` in template text as text', () => {
		const div = findElement(
			`function App(p) { return @{ <div>5/2 #tag {p.a}/{p.b}</div> }; }`,
			'div',
		);
		const text = div.children
			.filter((c) => c.type === 'JSXText')
			.map((c) => c.value)
			.join('|');
		expect(text).toContain('5/2 #tag ');
		expect(text).toContain('/');
	});
});

describe('raw-text <script> elements', () => {
	it('captures the body verbatim as `content` and mirrors it as a single JSXText child', () => {
		const script = findElement(
			`function App() @{ <head><script>const x = 1; foo();</script></head> }`,
			'script',
		);
		assert_type(script, 'JSXElement');
		expect(script.content).toBe('const x = 1; foo();');
		// The body is mirrored as one JSXText child (like JSXStyleElement's css +
		// parsed children) so generic element consumers emit it verbatim.
		expect(script.children).toHaveLength(1);
		expect(script.children[0].type).toBe('JSXText');
		expect(child(script, 0, 'JSXText').value).toBe('const x = 1; foo();');
	});

	it('reads JS with markup-significant characters (`<`, `{`, `}`) that would otherwise break parsing', () => {
		const script = findElement(
			`function App() @{ <head><script>if (a < b) { arr.map(x => x < 2); }</script></head> }`,
			'script',
		);
		expect(script.content).toBe('if (a < b) { arr.map(x => x < 2); }');
	});

	it('preserves TypeScript syntax and the `type` attribute', () => {
		const script = findElement(
			`function App() @{ <head><script type="text/typescript">const n: number = 1;</script></head> }`,
			'script',
		);
		expect(script.content).toBe('const n: number = 1;');
		const typeAttr = script.openingElement.attributes.find(
			(a) => as_type(a, 'JSXAttribute').name?.name === 'type',
		);
		expect(as_type(found(as_type(found(typeAttr), 'JSXAttribute').value), 'Literal').value).toBe(
			'text/typescript',
		);
	});

	it('exposes body offsets that match `content` (opening tag end -> closing tag start)', () => {
		const source = `function App() @{ <head><script>const y = 2;</script></head> }`;
		const script = findElement(source, 'script');
		const start = script.openingElement.end;
		const end = script.closingElement?.start;
		expect(source.slice(start, end)).toBe(script.content);
	});

	it('leaves self-closing `<script src=... />` as an ordinary element with no raw content', () => {
		const script = findElement(`function App() @{ <head><script src={url} /></head> }`, 'script');
		expect(script.openingElement.selfClosing).toBe(true);
		expect(script.content).toBeUndefined();
	});

	it('keeps a multi-line body verbatim including newlines', () => {
		const script = findElement(
			`function App() @{ <head><script>\nconst a = 1;\nconst b = a < 2;\n</script></head> }`,
			'script',
		);
		expect(script.content).toBe('\nconst a = 1;\nconst b = a < 2;\n');
	});
});

describe('acorn-typescript ≥1.0.11 constructs parse through the TSRX parser', () => {
	// Pins for upstream fixes the tsrx parser inherits (the plugin overrides
	// parseForStatement for indexed for-of, but paren/expression parsing is
	// inherited, so these verify the fixes actually reach us).

	it('allows the `in` operator inside a parenthesized `for` initializer', () => {
		const ast = parseModule(`for ((('a' in {}) ? 1 : 2);;) break;`, 'App.ts');
		const [statement] = ast.body;
		assert_type(statement, 'ForStatement');
		expect(statement.init?.type).toBe('ConditionalExpression');
	});

	it('allows a const initializer in an ambient context', () => {
		const ast = parseModule(`declare const VERSION = '1.0';`, 'App.ts');
		const [statement] = ast.body;
		assert_type(statement, 'VariableDeclaration');
		expect(statement.declare).toBe(true);
		expect(as_type(declaratorInit(statement), 'Literal').value).toBe('1.0');
	});

	it('collects each comment exactly once', () => {
		/** @type {AST.CommentWithLocation[]} */
		const comments = [];
		parseModule(
			`// leading
interface Point {
	// inside
	x: number;
}
const p: Point = { x: 1 }; // trailing`,
			'App.ts',
			{ collect: true, comments },
		);
		const starts = comments.map((comment) => comment.start);
		expect(new Set(starts).size).toBe(starts.length);
		expect(comments.length).toBe(3);
	});

	it('attaches parameter comments according to their parser locations', () => {
		const ast = parseModule(
			`function f(
	a /* a */,
	b,
	/* before c */ c /* c */
) {}`,
			'App.ts',
		);
		const [declaration] = ast.body;
		assert_type(declaration, 'FunctionDeclaration');
		const [a, b, c] = declaration.params;

		expect(a.trailingComments?.map((comment) => comment.value)).toEqual([' a ']);
		expect(b.leadingComments).toBeUndefined();
		expect(b.trailingComments).toBeUndefined();
		expect(c.leadingComments?.map((comment) => comment.value)).toEqual([' before c ']);
		expect(c.trailingComments?.map((comment) => comment.value)).toEqual([' c ']);
	});
});

// The import attributes of an import type go on `options`, as acorn's
// `ImportExpression` and typescript-estree store them, and as
// sveltejs/acorn-typescript#110 does upstream (#422).
describe('import attributes in import types', () => {
	/** @type {Array<[string, () => ParseOptions | undefined]>} */
	const option_sets = [
		['without options', () => undefined],
		[
			'with the formatter options',
			() => ({ collect: true, errors: [], comments: [], preserveParens: true }),
		],
		['in loose mode', () => ({ loose: true, errors: [], comments: [] })],
	];

	/**
	 * Every import type in the parsed source, in source order, with the source
	 * text of its import attributes.
	 *
	 * @param {string} source
	 * @param {ParseOptions} [options]
	 */
	function import_types(source, options) {
		/** @type {AST.TSImportType[]} */
		const found = [];
		find_first(parseModule(source, 'App.tsrx', options), (node) => {
			if (node.type === 'TSImportType') found.push(/** @type {AST.TSImportType} */ (node));
			return false;
		});
		return found.map((node) => ({
			node,
			options:
				node.options &&
				source.slice(
					/** @type {number} */ (node.options.start),
					/** @type {number} */ (node.options.end),
				),
		}));
	}

	describe.each(option_sets)('%s', (_, options) => {
		it('parses import attributes as an object expression on `options`', () => {
			const [a, b, c] = import_types(
				`type A = import("foo", { with: { type: "json" } });
type B = import("foo", { with: { "resolution-mode": "import" } }).Bar;
let c: typeof import("foo", { with: { type: "json" } });`,
				options(),
			);

			expect(a.options).toBe('{ with: { type: "json" } }');
			expect(as_type(a.node.argument, 'Literal').value).toBe('foo');
			const attributes = as_type(a.node.options, 'ObjectExpression');
			const with_property = as_type(attributes.properties[0], 'Property');
			expect(as_type(with_property.key, 'Identifier').name).toBe('with');
			const type_property = as_type(
				as_type(with_property.value, 'ObjectExpression').properties[0],
				'Property',
			);
			expect(as_type(type_property.key, 'Identifier').name).toBe('type');
			expect(as_type(type_property.value, 'Literal').value).toBe('json');
			expect(a.node.qualifier).toBeUndefined();

			expect(b.options).toBe('{ with: { "resolution-mode": "import" } }');
			const resolution_mode = as_type(
				as_type(
					as_type(as_type(b.node.options, 'ObjectExpression').properties[0], 'Property').value,
					'ObjectExpression',
				).properties[0],
				'Property',
			);
			expect(as_type(resolution_mode.key, 'Literal').value).toBe('resolution-mode');
			expect(as_type(b.node.qualifier, 'Identifier').name).toBe('Bar');

			expect(c.options).toBe('{ with: { type: "json" } }');
		});

		it('parses import attributes with trailing commas and line breaks inside them', () => {
			const [single, multiple] = import_types(
				`type A = import("foo", { with: { type: "json", }, });
type B = import("foo", {
  with: {
    type: "json",
  },
});`,
				options(),
			);

			expect(single.options).toBe('{ with: { type: "json", }, }');
			expect(multiple.options).toBe('{\n  with: {\n    type: "json",\n  },\n}');
		});

		it('parses a qualifier and type arguments after the import attributes', () => {
			const [qualified, query] = import_types(
				`type A = import("foo", { with: { "resolution-mode": "require" } }).ns.Bar<string, number>;
type B = typeof import("foo", { with: { type: "json" } }).value;`,
				options(),
			);

			expect(qualified.options).toBe('{ with: { "resolution-mode": "require" } }');
			const qualifier = as_type(qualified.node.qualifier, 'TSQualifiedName');
			expect(as_type(qualifier.left, 'Identifier').name).toBe('ns');
			expect(as_type(qualifier.right, 'Identifier').name).toBe('Bar');
			expect(qualified.node.typeArguments?.params.map((param) => param.type)).toEqual([
				'TSStringKeyword',
				'TSNumberKeyword',
			]);

			expect(query.options).toBe('{ with: { type: "json" } }');
			expect(as_type(query.node.qualifier, 'Identifier').name).toBe('value');
		});

		it('parses import attributes in a template body', () => {
			const [data] = import_types(
				`export function App() @{
	const data: import("./data.json", { with: { type: "json" } }).Data = load();
	<div>{data.name}</div>
}`,
				options(),
			);

			expect(data.options).toBe('{ with: { type: "json" } }');
		});

		it('gives an import type without import attributes `options: null`', () => {
			const [plain, qualified] = import_types(
				`type A = import("foo");
type B = import("foo").Bar<string>;`,
				options(),
			);

			expect(plain.node.options).toBeNull();
			expect(plain.node.qualifier).toBeUndefined();
			expect(qualified.node.options).toBeNull();
			expect(as_type(qualified.node.qualifier, 'Identifier').name).toBe('Bar');
			expect(qualified.node.typeArguments?.params.map((param) => param.type)).toEqual([
				'TSStringKeyword',
			]);
		});

		// Like TypeScript (microsoft/TypeScript#61489), unlike `import()`.
		it.each([
			'type A = import("foo",);',
			'type A = import("foo", { with: { type: "json" } },);',
			'type A = import("foo", attributes);',
		])('rejects what TypeScript rejects: %s', (source) => {
			expect(() => parseModule(source, 'App.tsrx', options())).toThrow('Unexpected token');
		});
	});
});

describe('comments in statement lists', () => {
	// A block comment on the next statement's line leads that statement, so a
	// JSDoc cast stays with the parentheses it casts. The semicolon-less form
	// is what the formatter prints with `semi: false`.
	it.each([
		['a function body', 'function f() { a; /** @type {Foo} */ (x).y(); }'],
		['a static block', 'class C { static { a; /** @type {Foo} */ (x).y(); } }'],
		['a namespace', 'namespace N { a; /** @type {Foo} */ (x).y(); }'],
		['a code block', 'function App() @{ const a = 1; /** @type {Foo} */ (x).y(); <div /> }'],
		['a semicolon-less static block', 'class C { static { a\n;/** @type {Foo} */ (x).y() } }'],
		['a semicolon-less namespace', 'namespace N { a\n;/** @type {Foo} */ (x).y() }'],
		[
			'a semicolon-less code block',
			'function App() @{ const a = 1\n;/** @type {Foo} */ (x).y()\n<div /> }',
		],
	])('leads the next statement with a block comment on its line in %s', (_, source) => {
		const ast = parseModule(source, 'App.tsrx');
		const block = /** @type {AST.Node & { body: AST.Node[] }} */ (
			find_first(
				ast,
				(node) =>
					node.type === 'BlockStatement' ||
					node.type === 'StaticBlock' ||
					node.type === 'TSModuleBlock' ||
					node.type === 'JSXCodeBlock',
			)
		);
		const [previous, cast] = block.body;

		expect(source.slice(cast.start, cast.end)).toMatch(/^\(x\)\.y\(\);?$/);
		expect(previous.trailingComments).toBeUndefined();
		expect(cast.leadingComments?.map((comment) => comment.value)).toEqual(['* @type {Foo} ']);
	});

	it('leads the render output of a code block with a block comment on its line', () => {
		const ast = parseModule('function App() @{ const a = 1; /* output */ <div /> }', 'App.tsrx');
		const block = find_first(ast, (node) => node.type === 'JSXCodeBlock');
		assert_type(block, 'JSXCodeBlock');

		expect(block.body[0].trailingComments).toBeUndefined();
		expect(block.render?.leadingComments?.map((comment) => comment.value)).toEqual([' output ']);
	});

	it('keeps comments after the last statement inside a static block or namespace', () => {
		const ast = parseModule(
			`class C {
	static {
		a; // a
		// after a
	}
}
namespace N {
	a; // a
	// after a
}`,
			'App.ts',
		);
		const staticBlock = find_first(ast, (node) => node.type === 'StaticBlock');
		const moduleBlock = find_first(ast, (node) => node.type === 'TSModuleBlock');
		assert_type(staticBlock, 'StaticBlock');
		assert_type(moduleBlock, 'TSModuleBlock');

		for (const block of [staticBlock, moduleBlock]) {
			expect(block.body[0].trailingComments?.map((comment) => comment.value)).toEqual([
				' a',
				' after a',
			]);
		}
	});

	it('keeps the comments of an empty static block or namespace as inner comments', () => {
		const ast = parseModule(
			`class C {
	static {
		// static
	}
	x = 1;
}
namespace N {
	// namespace
}`,
			'App.ts',
		);
		const staticBlock = find_first(ast, (node) => node.type === 'StaticBlock');
		const moduleBlock = find_first(ast, (node) => node.type === 'TSModuleBlock');

		expect(staticBlock?.innerComments?.map((comment) => comment.value)).toEqual([' static']);
		expect(moduleBlock?.innerComments?.map((comment) => comment.value)).toEqual([' namespace']);
	});
});

describe('comments in member lists', () => {
	/**
	 * @param {AST.Node | undefined} node
	 * @returns {AST.Node[]}
	 */
	function members(node) {
		if (node?.type === 'TSInterfaceDeclaration') return node.body.body;
		if (node?.type === 'TSEnumDeclaration') return node.members;
		if (node?.type === 'TSTypeAliasDeclaration') {
			return as_type(node.typeAnnotation, 'TSTypeLiteral').members;
		}
		throw new Error(`No member list in ${node?.type}`);
	}

	// A JSDoc tag on the next member's line documents that member, not the one
	// before it.
	it.each([
		['an interface', 'interface I { a: 1; /** @deprecated */ b: 2; }'],
		['an enum', 'enum E { A, /** @deprecated */ B }'],
		['a type literal', 'type T = { a: 1; /** @deprecated */ b: 2; };'],
	])('leads the next member with a block comment on its line in %s', (_, source) => {
		const [previous, next] = members(parseModule(source, 'App.ts').body[0]);

		expect(previous.trailingComments).toBeUndefined();
		expect(next.leadingComments?.map((comment) => comment.value)).toEqual(['* @deprecated ']);
	});

	it.each([
		['an interface', 'interface I {\n\ta: 1; // a\n\t// after a\n}'],
		['an enum', 'enum E {\n\tA, // a\n\t// after a\n}'],
		['a type literal', 'type T = {\n\ta: 1; // a\n\t// after a\n};'],
	])('keeps comments after the last member inside %s', (_, source) => {
		const [last] = members(parseModule(source, 'App.ts').body[0]);

		expect(last.trailingComments?.map((comment) => comment.value)).toEqual([' a', ' after a']);
	});

	it('keeps the comments of an empty interface, enum, or type literal as inner comments', () => {
		const ast = parseModule(
			`interface I {
	// interface
}
enum E {
	// enum
}
type T = {
	// type
};`,
			'App.ts',
		);
		const iface = as_type(ast.body[0], 'TSInterfaceDeclaration');
		const enumeration = as_type(ast.body[1], 'TSEnumDeclaration');
		const alias = as_type(ast.body[2], 'TSTypeAliasDeclaration');

		expect(iface.body.innerComments?.map((comment) => comment.value)).toEqual([' interface']);
		// The enum's name is not a member, so it doesn't take the body's comments.
		expect(enumeration.id.trailingComments).toBeUndefined();
		expect(enumeration.innerComments?.map((comment) => comment.value)).toEqual([' enum']);
		expect(alias.typeAnnotation.innerComments?.map((comment) => comment.value)).toEqual([' type']);
	});
});

describe('comments after the `<` of an element or fragment', () => {
	it('keeps them inside the opening tag, as Prettier attaches them', () => {
		for (const source of [
			'</* note */>x</>;',
			'</* note */></>;',
			'const a = <\n  // note\n>\n  x\n</>;',
			'function f() {\n  return </* note */>\n    <b />\n  </>;\n}',
		]) {
			const fragment = find_first(
				parseModule(source, 'App.tsrx'),
				(node) => node.type === 'JSXFragment',
			);
			assert_type(fragment, 'JSXFragment');
			expect(fragment.leadingComments, source).toBeUndefined();
			// Between the `<` and the `>`, they dangle on the opening fragment.
			expect(
				fragment.openingFragment.innerComments?.map((comment) => comment.value.trim()),
				source,
			).toEqual(['note']);
		}

		const element = find_first(
			parseModule('</* a */ /* b */div id="a" />;', 'App.tsrx'),
			(node) => node.type === 'JSXElement',
		);
		assert_type(element, 'JSXElement');
		expect(element.leadingComments).toBeUndefined();
		// Before the tag name, they lead it.
		expect(element.openingElement.name.leadingComments?.map((comment) => comment.value)).toEqual([
			' a ',
			' b ',
		]);
	});
});

describe('comments in element bodies and closing tags', () => {
	/**
	 * @param {unknown} node
	 * @returns {{ leading?: string[], trailing?: string[], inner?: string[] }}
	 */
	function commentsOf(node) {
		const withComments = /** @type {AST.NodeWithMaybeComments | undefined} */ (node);
		/** @param {AST.Comment[] | undefined} list */
		const values = (list) => list?.map((comment) => comment.value);
		return {
			leading: values(withComments?.leadingComments),
			trailing: values(withComments?.trailingComments),
			inner: values(withComments?.innerComments),
		};
	}

	/**
	 * @param {string} source
	 * @returns {any}
	 */
	function firstTemplate(source) {
		return find_first(
			parseModule(source, 'App.tsrx'),
			(node) => node.type === 'JSXElement' || node.type === 'JSXFragment',
		);
	}

	it('gives a comment right after an opening tag to the body, not the tag', () => {
		for (const source of ['<div>/* note */x</div>;', '<>/* note */ x</>;']) {
			const element = firstTemplate(source);
			expect(commentsOf(element.openingElement ?? element.openingFragment), source).toEqual({});
			// The text starts at the `>`, so the comment is in it
			expect(commentsOf(element.children[0]).inner, source).toEqual([' note ']);
		}

		const element = firstTemplate('const a = <p>/* note */{name}</p>;');
		expect(commentsOf(element.openingElement)).toEqual({});
		expect(commentsOf(element.children[0]).leading).toEqual([' note ']);
	});

	it('keeps a comment in JSX text on the text, not the closing tag', () => {
		for (const source of [
			'const a = <div>\n  /* note */\n  text\n</div>;',
			'const a = <div>\n  text\n  // note\n  more\n</div>;',
			'const a = <div>text /* note */ more</div>;',
		]) {
			const element = firstTemplate(source);
			expect(commentsOf(element.closingElement), source).toEqual({});
			expect(
				commentsOf(element.children[0]).inner?.map((value) => value.trim()),
				source,
			).toEqual(['note']);
		}
	});

	it("gives a comment in the text after a child to the text, even on the child's line", () => {
		for (const source of [
			'const a = <div>{a} /* note */ text</div>;',
			'const a = <div><b />/* note */text</div>;',
		]) {
			const element = firstTemplate(source);
			expect(commentsOf(element.children[0]), source).toEqual({});
			expect(commentsOf(element.children[1]).inner, source).toEqual([' note ']);
		}

		// A `prettier-ignore` after the text's last word leads the next child,
		// which it keeps as written
		const element = firstTemplate(
			'const a = <div>\n  text\n  // prettier-ignore\n  <b />\n</div>;',
		);
		expect(commentsOf(element.children[0])).toEqual({});
		expect(commentsOf(element.children[1]).leading).toEqual([' prettier-ignore']);

		// A `{" "}` keeps it, and so does a child before text of only whitespace
		for (const source of [
			'const a = <div>x{" "}/* note */ y</div>;',
			'const a = <div><b /> /* note */ <i /></div>;',
		]) {
			const element = firstTemplate(source);
			const child = element.children.find(
				(/** @type {AST.Node} */ node) => node.type !== 'JSXText',
			);
			expect(commentsOf(child).trailing, source).toEqual([' note ']);
		}
	});

	it("keeps a comment between a closing fragment's `</` and `>` on it, as Prettier does", () => {
		const program = parseModule('<>x</ /* note */>;\nfoo();', 'App.tsrx');
		const fragment = find_first(program, (node) => node.type === 'JSXFragment');
		assert_type(fragment, 'JSXFragment');
		expect(commentsOf(fragment.closingFragment).inner).toEqual([' note ']);
		expect(commentsOf(program.body.at(-1))).toEqual({});
	});
});

describe('comments in empty arrays and objects', () => {
	it('keeps the comments of an empty array or object as inner comments', () => {
		const ast = parseModule(
			`const a = [
	// array
];
const o = {/* object */};
const [/* pattern */] = a;
foo({
	// argument
});`,
			'App.ts',
		);
		const [array, object, pattern, argument] = [
			find_first(ast, (node) => node.type === 'ArrayExpression'),
			find_first(ast, (node) => node.type === 'ObjectExpression'),
			find_first(ast, (node) => node.type === 'ArrayPattern'),
			find_first(ast, (node) => node.type === 'CallExpression'),
		];

		expect(array?.innerComments?.map((comment) => comment.value)).toEqual([' array']);
		expect(object?.innerComments?.map((comment) => comment.value)).toEqual([' object ']);
		expect(pattern?.innerComments?.map((comment) => comment.value)).toEqual([' pattern ']);
		const [objectArgument] = as_type(argument, 'CallExpression').arguments;
		expect(objectArgument.innerComments?.map((comment) => comment.value)).toEqual([' argument']);
	});

	it('leaves a comment before an empty array in a template child to its attribute', () => {
		const ast = parseModule(
			`export function App() @{
	<div title={/* title */ title}>{[]}</div>
}`,
			'App.tsrx',
		);
		const array = find_first(ast, (node) => node.type === 'ArrayExpression');

		expect(array?.innerComments).toBeUndefined();
	});
});

describe('comments in import and export specifier lists', () => {
	/**
	 * @param {string} source
	 * @returns {AST.ImportDeclaration | AST.ExportNamedDeclaration}
	 */
	function lastDeclaration(source) {
		const declaration = parseModule(source, 'App.ts').body.at(-1);
		if (
			declaration?.type !== 'ImportDeclaration' &&
			declaration?.type !== 'ExportNamedDeclaration'
		) {
			throw new Error(`Expected an import or export, got ${declaration?.type}`);
		}
		return declaration;
	}

	// Like the last element of an array or object, the last specifier keeps the
	// comments before `}`, so the formatter prints them inside the braces.
	it.each([
		['an import', "import {\n\ta,\n\tb,\n\t// after b\n} from 'mod';"],
		['a re-export', "export {\n\ta,\n\tb,\n\t// after b\n} from 'mod';"],
		['a local export list', 'const a = 1;\nconst b = 2;\nexport {\n\ta,\n\tb,\n\t// after b\n};'],
	])('keeps a comment after the last specifier of %s with that specifier', (_, source) => {
		const declaration = lastDeclaration(source);
		const [first, last] = declaration.specifiers;

		expect(first.trailingComments).toBeUndefined();
		expect(last.trailingComments?.map((comment) => comment.value)).toEqual([' after b']);
		expect(declaration.source?.leadingComments).toBeUndefined();
	});

	it('keeps a comment before `from` with the last specifier and one after it with the source', () => {
		const declaration = lastDeclaration("import def, { a } /* before */ from /* after */ 'mod';");

		expect(declaration.specifiers[1].trailingComments?.map((comment) => comment.value)).toEqual([
			' before ',
		]);
		expect(declaration.source?.leadingComments?.map((comment) => comment.value)).toEqual([
			' after ',
		]);
	});

	// Like Prettier, which trails the node before a comment at the end of a
	// line, a comment after the `{` of the named imports trails the default one
	it('trails the default import with a line comment after the brace of the named ones', () => {
		const declaration = lastDeclaration("import d, { // first\n\t// second\n\ta,\n} from 'mod';");

		expect(declaration.specifiers[0].trailingComments?.map((comment) => comment.value)).toEqual([
			' first',
		]);
		expect(declaration.specifiers[1].leadingComments?.map((comment) => comment.value)).toEqual([
			' second',
		]);
	});

	it('leaves a block comment before a comma with the specifier before it', () => {
		const declaration = lastDeclaration("import def /* d */, { a } from 'mod';");

		expect(declaration.specifiers[0].trailingComments?.map((comment) => comment.value)).toEqual([
			' d ',
		]);
		expect(declaration.specifiers[1].leadingComments).toBeUndefined();
	});

	// Like Prettier, which ends the declaration before its `;`
	it('gives the comments after the module source to the declaration', () => {
		const declaration = lastDeclaration("import { a } from 'mod' /* source */; // declaration");

		expect(declaration.specifiers[0].trailingComments).toBeUndefined();
		expect(declaration.source?.trailingComments).toBeUndefined();
		expect(declaration.trailingComments?.map((comment) => comment.value)).toEqual([
			' source ',
			' declaration',
		]);
	});
});

describe('comments around the commas of a list', () => {
	/**
	 * @param {string} source
	 * @returns {any}
	 */
	function firstStatement(source) {
		return parseModule(source, 'App.ts').body[0];
	}

	/** @type {Array<[string, string, (statement: any) => AST.Node[]]>} */
	const lists = [
		['an array', 'x = [a /* c */, b];', (statement) => statement.expression.right.elements],
		['call arguments', 'foo(a /* c */, b);', (statement) => statement.expression.arguments],
		['new arguments', 'new Foo(a /* c */, b);', (statement) => statement.expression.arguments],
		[
			'an object',
			'x = { a: 1 /* c */, b: 2 };',
			(statement) => statement.expression.right.properties,
		],
		['parameters', 'function f(a /* c */, b) {}', (statement) => statement.params],
		[
			'an object pattern',
			'const { a /* c */, b } = o;',
			(statement) => statement.declarations[0].id.properties,
		],
		['an enum', 'enum E { A /* c */, B }', (statement) => statement.members],
		[
			'import specifiers',
			"import { a /* c */, b } from 'mod';",
			(statement) => statement.specifiers,
		],
		[
			'type arguments',
			'type X = Foo<A /* c */, B>;',
			(statement) => statement.typeAnnotation.typeArguments.params,
		],
		[
			'type parameters',
			'function f<A /* c */, B>() {}',
			(statement) => statement.typeParameters.params,
		],
		[
			'a tuple type',
			'type X = [A /* c */, B];',
			(statement) => statement.typeAnnotation.elementTypes,
		],
		[
			'a tuple type with a type in parentheses',
			'type X = [(A) /* c */, B];',
			(statement) => statement.typeAnnotation.elementTypes,
		],
	];

	it.each(lists)(
		'keeps a comment before the comma with the element before it in %s',
		(_, source, list) => {
			const [first, second] = list(firstStatement(source));

			expect(first.trailingComments?.map((comment) => comment.value)).toEqual([' c ']);
			expect(second.leadingComments).toBeUndefined();
		},
	);

	it.each(lists)(
		'leads the next element with a comment after the comma in %s',
		(_, source, list) => {
			const [first, second] = list(firstStatement(source.replace(' /* c */,', ', /* c */')));

			expect(first.trailingComments).toBeUndefined();
			expect(second.leadingComments?.map((comment) => comment.value)).toEqual([' c ']);
		},
	);

	it('keeps every comment before the comma with the element before it', () => {
		/** @type {AST.Node[]} */
		const [first, second] = firstStatement('x = [a /* c */ /* d */, b];').expression.right.elements;

		expect(first.trailingComments?.map((comment) => comment.value)).toEqual([' c ', ' d ']);
		expect(second.leadingComments).toBeUndefined();
	});

	// A callee or a function's name isn't in the argument or parameter list, so
	// a comment before the first element stays with that element.
	it('leads the first argument or parameter with a comment before it', () => {
		/** @type {AST.CallExpression} */
		const call = firstStatement('foo(/** @type {T} */ (x), y);').expression;
		expect(call.callee.trailingComments).toBeUndefined();
		expect(call.arguments[0].leadingComments?.map((comment) => comment.value)).toEqual([
			'* @type {T} ',
		]);

		/** @type {AST.FunctionDeclaration} */
		const fn = firstStatement('function f(\n\t// first\n\ta,\n) {}');
		expect(fn.id.trailingComments).toBeUndefined();
		expect(fn.params[0].leadingComments?.map((comment) => comment.value)).toEqual([' first']);
	});

	// The cast's `(` is on the comment's line, but the element it casts starts
	// on the next one. The comment used to trail the element before the comma
	// (#579).
	/** @type {Array<[string, string, (statement: any) => AST.Node[]]>} */
	const castLists = [
		[
			'an array',
			'x = [a, /** @type {T} */ (\n\tb\n)];',
			(statement) => statement.expression.right.elements,
		],
		[
			'call arguments',
			'foo(a, /** @type {T} */ (\n\tb\n));',
			(statement) => statement.expression.arguments,
		],
	];

	it.each(castLists)(
		'leads the next element with a JSDoc cast whose parentheses break in %s',
		(_, source, list) => {
			const [first, second] = list(firstStatement(source));

			expect(first.trailingComments).toBeUndefined();
			expect(second.leadingComments?.map((comment) => comment.value)).toEqual(['* @type {T} ']);
		},
	);
});

// Ports of Prettier's comment handlers (`handle-comments.js`)
describe('comments placed like Prettier', () => {
	/**
	 * @param {AST.Node | undefined} node
	 * @returns {{ leading?: string[], trailing?: string[], inner?: string[] }}
	 */
	function commentsOf(node) {
		const withComments = /** @type {AST.NodeWithMaybeComments | undefined} */ (node);
		/** @param {AST.Comment[] | undefined} list */
		const values = (list) => list?.map((comment) => comment.value);
		return {
			leading: values(withComments?.leadingComments),
			trailing: values(withComments?.trailingComments),
			inner: values(withComments?.innerComments),
		};
	}

	/**
	 * @param {string} source
	 * @returns {any}
	 */
	function firstStatement(source) {
		return parseModule(source, 'App.ts').body[0];
	}

	it('trails the operand before a comment at the end of an operator line', () => {
		const { init } = firstStatement('const x =\n  a || // c\n  b;').declarations[0];

		expect(commentsOf(init.left).trailing).toEqual([' c']);
		expect(commentsOf(init.right).leading).toBeUndefined();
	});

	it('trails the last operand with a comment below it in the parentheses of a unary', () => {
		const statement = firstStatement('x = !(\n  (\n    a ||\n    b\n  ) // c\n);');

		expect(commentsOf(statement.expression.right.argument).trailing).toEqual([' c']);
		expect(commentsOf(statement).trailing).toBeUndefined();
	});

	it('trails the condition with a comment before the ) of an if statement', () => {
		const statement = firstStatement('if (\n  a\n  // c\n) {\n  b();\n}');

		expect(commentsOf(statement.test).trailing).toEqual([' c']);
		expect(commentsOf(statement.consequent).leading).toBeUndefined();
	});

	/**
	 * Parse each source in a worker, and fail on any that throws
	 * @param {string[]} sources
	 * @returns {Promise<any[]>} Each source's AST
	 */
	async function parseAllInWorker(sources) {
		const outcomes = await parse_in_worker_with_ast(sources.map((source) => ({ source })));
		return outcomes.map((outcome, index) => {
			if (!outcome.ok) {
				throw new Error(`${JSON.stringify(sources[index])} threw ${outcome.message}`);
			}
			return outcome.ast;
		});
	}

	// Like typescript-estree, the function starts at the type parameters. It
	// started at its `(`, so the comment trailed the key or led the function
	// (#458).
	it('starts an object method at its type parameters, which keep the comments in them', async () => {
		const sources = [
			'const o = { m</* c */ T>(b: T) {} };',
			'const o = { async m</* c */ T>(b: T) {} };',
			'const o = { *m</* c */ T>(b: T) {} };',
			'const o = { get m</* c */ T>() {} };',
			'const o = { set m</* c */ T>(v: T) {} };',
			'const o = { m<\n  // c\n  T,\n>(b: T) {} };',
			'const o = { m\n  <T /* c */>(b: T) {} };',
		];
		const asts = await parseAllInWorker(sources);

		for (const [index, ast] of asts.entries()) {
			const property = ast.body[0].declarations[0].init.properties[0];
			const { value } = property;
			const { typeParameters } = value;
			const [parameter] = typeParameters.params;
			const label = sources[index];
			expect(value.start, label).toBe(typeParameters.start);
			expect(value.loc.start, label).toEqual(typeParameters.loc.start);
			expect(value.end, label).toBe(sources[index].indexOf('{} }') + '{}'.length);
			expect(
				[...(parameter.leadingComments ?? []), ...(parameter.trailingComments ?? [])].map(
					(/** @type {AST.Comment} */ comment) => comment.value.trim(),
				),
				label,
			).toEqual(['c']);
			expect(commentsOf(property.key).trailing, label).toBeUndefined();
			expect(commentsOf(value).leading, label).toBeUndefined();
		}
	});

	it('keeps a method function that has no type parameters, and a class method, where they start', async () => {
		const [object, classDeclaration] = await parseAllInWorker([
			'const o = { m(b) {}, async n(b) {}, get g() { return 1; } };',
			'class A { m<T>(a: T) {} }',
		]);
		const source = 'const o = { m(b) {}, async n(b) {}, get g() { return 1; } };';

		expect(
			object.body[0].declarations[0].init.properties.map(
				(/** @type {any} */ property) => property.value.start,
			),
		).toEqual([source.indexOf('(b)'), source.lastIndexOf('(b)'), source.indexOf('()')]);
		const [method] = classDeclaration.body[0].body.body;
		expect(method.value.start).toBe('class A { m<T>'.length);
		expect(method.typeParameters.start).toBe('class A { m'.length);
	});

	// With no line break after the `;` that ends the file, the program ends at
	// the `;`, and neither it nor the statement took the comment (#488)
	it('trails the last statement with a comment before the ; that ends the file', async () => {
		const sources = [
			'const x = 1\n// c\n;',
			'foo()\n// c\n;',
			'if (a) b()\n// c\n;',
			'a();\nconst x = 1\n/* c */\n;',
		];
		const asts = await parseAllInWorker([...sources, ...sources.map((source) => `${source}\n`)]);

		for (const [index, source] of sources.entries()) {
			const ast = asts[index];
			const statement = ast.body.at(-1);
			expect(
				commentsOf(statement).trailing?.map((/** @type {string} */ value) => value.trim()),
				JSON.stringify(source),
			).toEqual(['c']);
			expect(commentsOf(ast).inner, JSON.stringify(source)).toBeUndefined();
			// As when a line break follows the `;`
			expect(commentsOf(asts[index + sources.length].body.at(-1))).toEqual(commentsOf(statement));
		}
	});

	// Like Prettier, the comment leads the argument, which the spread prints
	// before its `...`. It trailed the spread, or led the next attribute (#489).
	it('leads the argument of a spread attribute with a comment in its braces before it', async () => {
		const sources = [
			'x = <div {.../* c */b} />;',
			'x = <div {/* c */ ...b} />;',
			'x = <div {... /* c */ b} d="1" />;',
			'x = <div {...\n  // c\n  b} />;',
			'function App(b) @{\n  <div {.../* c */b} d="1" />\n}',
		];
		const asts = await parseAllInWorker(sources);

		for (const [index, ast] of asts.entries()) {
			const statement = ast.body[0];
			const { attributes } = (
				statement.type === 'FunctionDeclaration'
					? statement.body.render
					: statement.expression.right
			).openingElement;
			const label = sources[index];
			expect(
				commentsOf(attributes[0].argument).leading?.map((/** @type {string} */ value) =>
					value.trim(),
				),
				label,
			).toEqual(['c']);
			expect(commentsOf(attributes[0]).trailing, label).toBeUndefined();
			expect(commentsOf(attributes[1]?.name).leading, label).toBeUndefined();
		}
	});

	// The next attribute's name took it, and the printer dropped it (#517)
	it('trails the argument of a spread with a comment on its own line before its }', () => {
		/** @param {string} source */
		const element = (source) =>
			/** @type {any} */ (parseModule(source, 'App.tsrx').body[0]).expression.right;
		const { openingElement } = element('x = <div {...a\n  // c\n} b="1" />;');
		const { children, closingElement } = element('x = <div>{...a\n  // c\n}</div>;');

		expect(commentsOf(openingElement.attributes[0].argument).trailing).toEqual([' c']);
		expect(commentsOf(openingElement.attributes[0]).trailing).toBeUndefined();
		expect(commentsOf(openingElement.attributes[1].name).leading).toBeUndefined();
		expect(commentsOf(children[0].expression).trailing).toEqual([' c']);
		expect(commentsOf(closingElement).leading).toBeUndefined();
	});

	// The next child or attribute took it, and the printer moved it out of the
	// braces (#574)
	it('trails the expression of a {…} with a comment on its own line before its }', () => {
		/** @param {string} source */
		const element = (source) =>
			/** @type {any} */ (parseModule(source, 'App.tsrx').body[0]).expression.right;
		const { openingElement } = element('x = <div b={a\n  // c\n} d="1" />;');
		const { children } = element('x = <div>{a\n  // c\n}text</div>;');
		const dynamic = element('x = <{A\n  // c\n}>text</{A\n  // d\n}>;');

		expect(commentsOf(openingElement.attributes[0].value.expression).trailing).toEqual([' c']);
		expect(commentsOf(openingElement.attributes[1].name).leading).toBeUndefined();
		expect(commentsOf(children[0].expression).trailing).toEqual([' c']);
		expect(commentsOf(children[1]).leading).toBeUndefined();
		expect(commentsOf(dynamic.openingElement.name.expression).trailing).toEqual([' c']);
		expect(commentsOf(dynamic.children[0]).leading).toBeUndefined();
		expect(commentsOf(dynamic.closingElement.name.expression).trailing).toEqual([' d']);
	});

	// Prettier's `canAttachComment` rejects a template element, and its
	// `findExpressionIndexForComment` keeps a comment in its `${…}`
	it('trails the expression with a comment after it in the ${…} of a template literal', () => {
		const { expression } = firstStatement('x = `a ${\n  b\n  // c\n  /* d */\n} e ${f}`;');
		const template = expression.right;

		expect(commentsOf(template.expressions[0]).trailing).toEqual([' c', ' d ']);
		expect(commentsOf(template.expressions[1]).leading).toBeUndefined();
		expect(template.quasis.map(/** @param {any} quasi */ (quasi) => commentsOf(quasi))).toEqual([
			{},
			{},
			{},
		]);
	});

	it('leads the next type with a comment on its own line in a template literal type', () => {
		const { literal } = firstStatement(
			'type A = `${\n  B // b\n  // c\n}x${C}${\n  D\n  // d\n}`;',
		).typeAnnotation;

		expect(commentsOf(literal.expressions[0]).trailing).toEqual([' b']);
		expect(commentsOf(literal.expressions[1]).leading).toEqual([' c']);
		expect(commentsOf(literal.expressions[2]).trailing).toEqual([' d']);
	});

	it('leads the lookup with a comment on its own line before its name', () => {
		const statement = firstStatement('item\n  // c\n  .foo();');
		const member = statement.expression.callee;

		expect(commentsOf(member).leading).toEqual([' c']);
		expect(commentsOf(member.property).leading).toBeUndefined();
	});

	it('trails the union member before a comment on its own line', () => {
		const union = firstStatement('type K =\n  | A\n  // c\n  | B;').typeAnnotation;

		expect(commentsOf(union.types[0]).trailing).toEqual([' c']);
		expect(commentsOf(union.types[1]).leading).toBeUndefined();
	});

	it('marks the union member after a prettier-ignore comment on its own line', () => {
		const union = firstStatement('type K =\n  | A\n  // prettier-ignore\n  | B;').typeAnnotation;
		const [comment] = /** @type {any[]} */ (union.types[0].trailingComments);

		expect(comment.value).toBe(' prettier-ignore');
		expect(comment.unignore).toBe(true);
		expect(union.types[0].metadata?.prettierIgnore).toBeUndefined();
		expect(union.types[1].metadata.prettierIgnore).toBe(true);
	});

	it('marks the first member of a union after a prettier-ignore comment on its own line', () => {
		const union = firstStatement('type K =\n  // prettier-ignore\n  | A\n  | B;').typeAnnotation;

		expect(commentsOf(union).leading).toEqual([' prettier-ignore']);
		expect(union.types[0].metadata.prettierIgnore).toBe(true);
		expect(union.types[1].metadata?.prettierIgnore).toBeUndefined();
	});

	// Prettier's parsers keep no node for a type's parentheses
	it('marks the first member of a union in parentheses after a prettier-ignore comment on its own line', () => {
		const type = firstStatement('type K =\n  // prettier-ignore\n  ((A | B));').typeAnnotation;
		const union = type.typeAnnotation.typeAnnotation;

		expect(type.leadingComments[0].unignore).toBe(true);
		expect(union.types[0].metadata.prettierIgnore).toBe(true);
		expect(union.types[1].metadata?.prettierIgnore).toBeUndefined();
	});

	it('leaves a prettier-ignore comment that ends a union member on that member', () => {
		const union = firstStatement('type K =\n  | A // prettier-ignore\n  | B;').typeAnnotation;
		const [comment] = /** @type {any[]} */ (union.types[0].trailingComments);

		expect(comment.unignore).toBeUndefined();
		expect(union.types[1].metadata?.prettierIgnore).toBeUndefined();
	});

	it('leads the first member of a union with a block comment right before it', () => {
		const union = firstStatement('type K = /* c */ A | B;').typeAnnotation;

		expect(commentsOf(union.types[0]).leading).toEqual([' c ']);
		expect(commentsOf(union).leading).toBeUndefined();
	});

	it('moves a comment between a class heading and its body into the body', () => {
		const withMember = firstStatement('class A extends B // c\n{\n  x = 1;\n}');
		const empty = firstStatement('interface I extends J // c\n{}');

		expect(commentsOf(withMember.superClass).trailing).toBeUndefined();
		expect(commentsOf(withMember.body.body[0]).leading).toEqual([' c']);
		expect(commentsOf(empty.extends[0]).trailing).toBeUndefined();
		expect(commentsOf(empty.body).inner).toEqual([' c']);
	});

	it('trails the class name with a comment before the first implements type', () => {
		const declaration = firstStatement('class C implements\n  // c\n  D, E {}');

		expect(commentsOf(declaration.id).trailing).toEqual([' c']);
		expect(commentsOf(declaration.implements[0]).leading).toBeUndefined();
	});

	// Prettier's dangling comment marked `implements`
	it('keeps a comment before implements in a class with no name on the class', () => {
		const { init } = firstStatement('const X = class\n  // c\n  implements D, E {};')
			.declarations[0];

		expect(commentsOf(init).inner).toEqual([' c']);
		expect(commentsOf(init.implements[0]).leading).toBeUndefined();
	});

	// Without a `;`, the declaration ends at the `)`, and the parenthesized
	// value ends before it
	it('trails the declaration with a comment after the ) that ends it', () => {
		const [first, second] = /** @type {any[]} */ (
			parseModule('const x = a | (b >> 6) // c\nconst y = (a >> 6) // d\n', 'App.ts').body
		);

		expect(commentsOf(first).trailing).toEqual([' c']);
		expect(commentsOf(first.declarations[0].init.right).trailing).toBeUndefined();
		expect(commentsOf(second).trailing).toEqual([' d']);
		expect(commentsOf(second.declarations[0].init).trailing).toBeUndefined();
	});

	// Like Prettier's `getSortedChildNodes`, the walker visits a node's
	// children in source order, whatever order the parser adds their keys in
	it.each([
		['the type arguments of a call', 'f<\n  // c\n  A\n>(1);', 'expression.typeArguments.params.0'],
		[
			'the type arguments of a tagged template',
			'tag</* c */ T>`x`;',
			'expression.typeArguments.params.0',
		],
		['the test of a switch case', 'switch (x) {\n  case /* c */ 1:\n    y;\n}', 'cases.0.test'],
		[
			'the type parameters of an arrow function',
			'const f = </* c */ T,>(a: T): T => a;',
			'declarations.0.init.typeParameters.params.0',
		],
		[
			'the parameters of a generic arrow function',
			'const f = <T,>(/* c */ a: T): T => a;',
			'declarations.0.init.params.0',
		],
	])('leads the node after a comment in %s', (_, source, path) => {
		const statement = firstStatement(source);
		const node = path.split('.').reduce((parent, key) => parent[key], statement);

		expect(commentsOf(node).leading).toEqual([source.includes('//') ? ' c' : ' c ']);
	});

	it('keeps a comment in the type arguments of a call off its arguments', () => {
		const { expression } = firstStatement('dual<\n  /** a */\n  A,\n  /** b */\n  B\n>(2, f);');

		expect(commentsOf(expression.typeArguments.params[0]).leading).toEqual(['* a ']);
		expect(commentsOf(expression.typeArguments.params[1]).leading).toEqual(['* b ']);
		expect(commentsOf(expression.arguments[0]).leading).toBeUndefined();
	});

	// Prettier's `handleTryStatementComments`
	it('moves a comment between the blocks of a try statement into the next block', () => {
		const statement = firstStatement(
			'try {\n  a();\n} // c\ncatch (e) {\n  b();\n}\n// d\nfinally {}',
		);

		expect(commentsOf(statement.block).trailing).toBeUndefined();
		expect(commentsOf(statement.handler).leading).toBeUndefined();
		expect(commentsOf(statement.handler.body.body[0]).leading).toEqual([' c']);
		expect(commentsOf(statement.finalizer).inner).toEqual([' d']);
	});

	it('trails the catch parameter with a comment before the catch body', () => {
		const statement = firstStatement('try {\n  a();\n} catch (e) // c\n{\n  b();\n}');

		expect(commentsOf(statement.handler.param).trailing).toEqual([' c']);
		expect(commentsOf(statement.handler.body.body[0]).leading).toBeUndefined();
	});

	it('moves a comment before a template @pending block into it', () => {
		const [fn] = /** @type {any[]} */ (
			parseModule(
				'function A() @{\n  @try {\n    <B />\n  } // c\n  @pending {\n    <p />\n  }\n}',
				'App.tsrx',
			).body
		);
		const directive = fn.body.render;

		expect(commentsOf(directive.block).trailing).toBeUndefined();
		expect(commentsOf(directive.pending.body[0]).leading).toEqual([' c']);
	});

	it('trails the last parameter with the comments before a trailing comma', () => {
		const [fn] = /** @type {any[]} */ (
			parseModule('function f(\n  a,\n  b /* c */, /* d */\n) {}', 'App.ts').body
		);

		expect(commentsOf(fn.params[1]).trailing).toEqual([' c ', ' d ']);
		expect(commentsOf(fn).inner).toBeUndefined();
	});

	// Prettier's `handleConditionalExpressionComments` and its default for a
	// comment at the end of a line
	it('trails the node before a comment at the end of the line of a ? or :', () => {
		const { init } = firstStatement('const x = cond ? // a\n  b : // c\n  d;').declarations[0];
		const type = firstStatement('type X = A extends B ? // a\n  C : D;').typeAnnotation;

		expect(commentsOf(init.test).trailing).toEqual([' a']);
		expect(commentsOf(init.consequent).trailing).toEqual([' c']);
		expect(commentsOf(init.consequent).leading).toBeUndefined();
		expect(commentsOf(type.extendsType).trailing).toEqual([' a']);
	});

	it('leads the branch after a comment on its own line in a conditional', () => {
		const { init } = firstStatement('const x = cond ?\n  // a\n  b : c;').declarations[0];

		expect(commentsOf(init.consequent).leading).toEqual([' a']);
	});

	// Prettier's export starts at the decorators written before it
	it('trails the last decorator with a comment before the class keyword of an export', () => {
		const [named, other] = /** @type {any[]} */ (
			parseModule('@dec export /* c */ class A {}\n@dec\n// d\nexport class B {}', 'App.ts').body
		);

		expect(commentsOf(named.declaration.decorators[0]).trailing).toEqual([' c ']);
		expect(commentsOf(named.declaration.id).leading).toBeUndefined();
		expect(commentsOf(other.declaration.decorators[0]).trailing).toEqual([' d']);
		expect(commentsOf(other).leading).toBeUndefined();
	});

	// Prettier's `handleMethodNameComments`
	it('trails the decorator of a class member with a comment before its modifiers', () => {
		const [field, accessor, method, inline] = firstStatement(
			'class A {\n  @a\n  // b\n  static b;\n  @c\n  /* d */\n  accessor d;\n  @e // f\n  public static f() {}\n  @g /* h */ static h;\n}',
		).body.body;

		expect(commentsOf(field.decorators[0]).trailing).toEqual([' b']);
		expect(commentsOf(field.key).leading).toBeUndefined();
		expect(commentsOf(accessor.decorators[0]).trailing).toEqual([' d ']);
		expect(commentsOf(method.decorators[0]).trailing).toEqual([' f']);
		// A comment with code on both sides trails the decorator by the tie-break
		expect(commentsOf(inline.decorators[0]).trailing).toEqual([' h ']);
		expect(commentsOf(inline.key).leading).toBeUndefined();
	});

	it('leads the key of a class member with a comment between its modifiers and the key', () => {
		const [field] = firstStatement('class A {\n  @a static /* b */ b;\n}').body.body;

		expect(commentsOf(field.decorators[0]).trailing).toBeUndefined();
		expect(commentsOf(field.key).leading).toEqual([' b ']);
	});

	// Prettier's `locStart` starts a node at its first decorator, which the
	// parser keeps outside a parameter's span
	it('keeps the comments after a parameter decorator in the parameter', () => {
		const [method, ctor] = firstStatement(
			'class A {\n  m(@a(/* a */ x) /* b */ y) {}\n  constructor(\n    @c\n    // c\n    private c: T,\n    @d /* d */ readonly d = 1,\n  ) {}\n}',
		).body.body;
		const [parameter] = method.value.params;
		const [property, withDefault] = ctor.value.params;

		expect(commentsOf(parameter.decorators[0].expression.arguments[0]).leading).toEqual([' a ']);
		expect(commentsOf(parameter.decorators[0]).trailing).toEqual([' b ']);
		expect(commentsOf(parameter).leading).toBeUndefined();
		expect(commentsOf(property.parameter.decorators[0]).trailing).toEqual([' c']);
		expect(commentsOf(property).leading).toBeUndefined();
		expect(commentsOf(withDefault.parameter.decorators[0]).trailing).toEqual([' d ']);
		expect(commentsOf(withDefault).leading).toBeUndefined();
	});

	// Prettier's tie-break, with the name after the comment
	it('leads the parameter of a parameter property with a comment between its modifiers and name', () => {
		const [ctor] = firstStatement(
			'class A {\n  constructor(@a /* a */ private /* b */ readonly /* c */ x: T, @d private /* d */ y) {}\n}',
		).body.body;
		const [first, second] = ctor.value.params;

		expect(commentsOf(first.parameter.decorators[0]).trailing).toEqual([' a ', ' b ']);
		expect(commentsOf(first.parameter).leading).toEqual([' c ']);
		expect(commentsOf(second.parameter.decorators[0]).trailing).toBeUndefined();
		expect(commentsOf(second.parameter).leading).toEqual([' d ']);
	});

	it('leads the type annotation of an object pattern with a comment before its colon', () => {
		const { id } = firstStatement('const { a } /* c */ : T = o;').declarations[0];

		expect(commentsOf(id.typeAnnotation).leading).toEqual([' c ']);
		expect(commentsOf(id.properties[0]).trailing).toBeUndefined();
	});

	// Prettier's `breakTies`: a comment with code on both sides leads the node
	// after it when only whitespace or `(` sits between them, and trails the
	// node before it otherwise
	it('leads the node after a comment with only whitespace between them', () => {
		const tagged = firstStatement('tag<T>/* c */`x`;').expression;
		const sequence = firstStatement('x = (a, /* c */ b);').expression.right;
		const property = firstStatement('class A {\n  x /* c */ : T;\n}').body.body[0];
		const rest = firstStatement('function f(...x /* c */ : T) {}').params[0];
		const signature = firstStatement('type F = (a: T) /* c */ => void;').typeAnnotation;

		expect(commentsOf(tagged.quasi).leading).toEqual([' c ']);
		expect(commentsOf(tagged.typeArguments).trailing).toBeUndefined();
		expect(commentsOf(sequence.expressions[1]).leading).toEqual([' c ']);
		expect(commentsOf(sequence.expressions[0]).trailing).toBeUndefined();
		expect(commentsOf(property.typeAnnotation).leading).toEqual([' c ']);
		expect(commentsOf(rest.typeAnnotation).leading).toEqual([' c ']);
		expect(commentsOf(signature.typeAnnotation).leading).toEqual([' c ']);
		expect(commentsOf(signature.parameters[0]).trailing).toBeUndefined();
	});

	it('trails the node before a comment with other code between it and the next node', () => {
		const [def, named] = firstStatement("import def, /* c */ { b } from 'mod';").specifiers;
		const { expression } = firstStatement('a /* a */ + /* b */ b;');
		const property = firstStatement('interface I {\n  x /* c */ : T;\n}').body.body[0];

		expect(commentsOf(def).trailing).toEqual([' c ']);
		expect(commentsOf(named).leading).toBeUndefined();
		expect(commentsOf(expression.left).trailing).toEqual([' a ']);
		expect(commentsOf(expression.right).leading).toEqual([' b ']);
		// Like Prettier's `canAttachComment`, the type annotation of a property
		// signature takes no comments, so the next node is its type
		expect(commentsOf(property.key).trailing).toEqual([' c ']);
	});

	// Like Prettier, whose `printCommentsForFunction` prints the comment inside
	// the parentheses of a function called right away or used as a tag
	it('trails a function called right away or used as a tag with a comment before its )', () => {
		const arrow = firstStatement('(m => m /* c */)(x);').expression;
		const fn = firstStatement('(function () {} /* a */ /* b */)(x);').expression;
		const tag = firstStatement('(m => m /* c */)`x`;').expression;
		const plain = firstStatement('(a /* c */)(x);').expression;

		expect(commentsOf(arrow.callee).trailing).toEqual([' c ']);
		expect(commentsOf(arrow.arguments[0]).leading).toBeUndefined();
		expect(commentsOf(fn.callee).trailing).toEqual([' a ', ' b ']);
		expect(commentsOf(tag.tag).trailing).toEqual([' c ']);
		expect(commentsOf(tag.quasi).leading).toBeUndefined();
		// Any other callee keeps the comment's place (see `breakTies`)
		expect(commentsOf(plain.arguments[0]).leading).toEqual([' c ']);
	});

	it('trails the name of a function or method with a comment before its (', () => {
		const fn = firstStatement('function f /* c */ (a) {}');
		const { init } = firstStatement('const o = { m /* c */ (a) {} };').declarations[0];

		expect(commentsOf(fn.id).trailing).toEqual([' c ']);
		expect(commentsOf(fn.params[0]).leading).toBeUndefined();
		expect(commentsOf(init.properties[0].key).trailing).toEqual([' c ']);
	});

	// Prettier's `handleAssignmentPatternComments` and its default for a
	// comment at the end of a line
	it('leads a default value pattern with a comment on its own line in it', () => {
		const fn = firstStatement(
			'function f(\n  a = (\n    // c\n    1\n  ),\n  b = // d\n  2,\n) {}',
		);
		const [first, second] = fn.params;

		expect(commentsOf(first).leading).toEqual([' c']);
		expect(commentsOf(first.right).leading).toBeUndefined();
		expect(commentsOf(second.left).trailing).toEqual([' d']);
		expect(commentsOf(second.right).leading).toBeUndefined();
	});

	it('leads a parameter property with a comment on its own line in its default value', () => {
		const constructor = firstStatement(
			'class A {\n  constructor(\n    private a = (\n      // c\n      1\n    ),\n  ) {}\n}',
		).body.body[0];
		const [param] = constructor.value.params;

		expect(commentsOf(param).leading).toEqual([' c']);
		expect(commentsOf(param.parameter).leading).toBeUndefined();
	});

	it('leaves the comments around the key of a shorthand property with a default value to the default', () => {
		const { id } = firstStatement('const { a /* c */ = 1 } = x;').declarations[0];
		const [property] = id.properties;

		expect(commentsOf(property.key).trailing).toBeUndefined();
		expect(commentsOf(property.value.left).trailing).toEqual([' c ']);
	});

	it('trails an arrow function body that is an element with a comment below it', () => {
		const element = firstStatement('const f = () => (\n  <Note />\n  // c\n);').declarations[0];
		const other = firstStatement('const f = () => (\n  a\n  // c\n);\n');

		expect(commentsOf(element.init.body).trailing).toEqual([' c']);
		expect(commentsOf(other.declarations[0].init.body).trailing).toBeUndefined();
		expect(commentsOf(other).trailing).toEqual([' c']);
	});

	// Prettier's default for a comment at the end of a line
	it('trails the last parameter with a comment at the end of the line after its )', () => {
		const fn = firstStatement('function f(a) // c\n  : T {}');
		const signature = firstStatement('interface I {\n  m(a: T) // c\n  : void;\n}').body.body[0];
		const noParams = firstStatement('function f() // c\n  : T {}');

		expect(commentsOf(fn.params[0]).trailing).toEqual([' c']);
		expect(commentsOf(fn.returnType).leading).toBeUndefined();
		expect(commentsOf(signature.parameters[0]).trailing).toEqual([' c']);
		expect(commentsOf(noParams.id).trailing).toEqual([' c']);
	});

	// Prettier's `babel` parser keeps a JSDoc cast's parentheses as a
	// `ParenthesizedExpression`, and the comments after its expression inside
	// it trail that expression
	it('trails the cast value with the comments inside the parentheses of its cast', () => {
		const declaration = firstStatement('const a = /** @type {X} */ (foo /* c */) /* d */;');
		const stacked = firstStatement(
			'x = /** @type {A} */ (/** @type {B} */ (foo /* b */) /* a */);',
		);
		const awaited = firstStatement('x = /** @type {X} */ (await foo // c\n);');
		const superClass = firstStatement('class A extends /** @type {X} */ (B // c\n) {}');

		expect(commentsOf(declaration.declarations[0].init).trailing).toEqual([' c ']);
		expect(commentsOf(declaration).trailing).toEqual([' d ']);
		expect(commentsOf(stacked.expression.right).trailing).toEqual([' b ', ' a ']);
		expect(commentsOf(awaited.expression.right).trailing).toEqual([' c']);
		expect(commentsOf(awaited.expression.right.argument).trailing).toBeUndefined();
		expect(commentsOf(awaited).trailing).toBeUndefined();
		expect(commentsOf(superClass.superClass).trailing).toEqual([' c']);
		expect(commentsOf(superClass.body).inner).toBeUndefined();
	});

	// Prettier's `handleCommentInEmptyParens`
	it('keeps a comment in empty parameter parentheses on the function or signature', () => {
		const fn = firstStatement('function f(/* c */): T {}');
		const type = firstStatement('type F = (/* c */) => void;').typeAnnotation;
		const signature = firstStatement('interface I {\n  m(/* c */);\n}').body.body[0];

		expect(commentsOf(fn).inner).toEqual([' c ']);
		expect(commentsOf(fn.returnType).leading).toBeUndefined();
		expect(commentsOf(type).inner).toEqual([' c ']);
		expect(commentsOf(signature).inner).toEqual([' c ']);
		expect(commentsOf(signature.key).trailing).toBeUndefined();
	});

	it('trails the type parameter of a mapped type with a comment after the type its key ranges over', () => {
		const type = firstStatement('type M = { [K in keyof T /* c */]: T[K] };').typeAnnotation;
		const endOfLine = firstStatement('type M = {\n  [K in T] // c\n  : T[K];\n};').typeAnnotation;

		expect(commentsOf(type.typeParameter).trailing).toEqual([' c ']);
		const ownLine = firstStatement('type M = {\n  [K in T\n  // c\n  ]: T[K];\n};').typeAnnotation;

		expect(commentsOf(endOfLine.typeParameter).trailing).toEqual([' c']);
		expect(commentsOf(endOfLine.typeAnnotation).leading).toBeUndefined();
		expect(commentsOf(ownLine.typeParameter).trailing).toEqual([' c']);
	});

	// Prettier's parsers keep a type parameter's name as a node, which takes
	// the comments around it; this parser keeps it as a string
	it('keeps the comments around the name of a type parameter on the type parameter', () => {
		const [constrained, defaulted] = firstStatement(
			'function f<const /* a */ T /* b */ extends /* c */ U, K // d\n  = V>() {}',
		).typeParameters.params;
		const [modifier] = firstStatement('type A<in out /* a */ T> = T;').typeParameters.params;
		const mapped = firstStatement('type M = { [K /* a */ in /* b */ T]: T[K] };').typeAnnotation;

		expect(commentsOf(constrained).inner).toEqual([' a ', ' b ']);
		expect(commentsOf(constrained.constraint).leading).toEqual([' c ']);
		expect(commentsOf(defaulted).inner).toEqual([' d']);
		expect(commentsOf(defaulted.default).leading).toBeUndefined();
		expect(commentsOf(modifier).inner).toEqual([' a ']);
		expect(commentsOf(modifier).trailing).toBeUndefined();
		expect(commentsOf(mapped.typeParameter).inner).toEqual([' a ']);
		expect(commentsOf(mapped.typeParameter.constraint).leading).toEqual([' b ']);
	});

	it('leads the constraint with a block comment on its own line before the extends of a type parameter', () => {
		const [parameter] = firstStatement('function f<\n  T\n  /* a */ extends U,\n>() {}')
			.typeParameters.params;
		const [lineComment] = firstStatement('function f<\n  T\n  // a\n  extends U,\n>() {}')
			.typeParameters.params;

		expect(commentsOf(parameter).inner).toBeUndefined();
		expect(commentsOf(parameter.constraint).leading).toEqual([' a ']);
		// Prettier moves a line comment there after the name on its next pass
		expect(commentsOf(lineComment).inner).toEqual([' a']);
		expect(commentsOf(lineComment.constraint).leading).toBeUndefined();
	});

	// Prettier prints the arrow function's body without its parentheses, and
	// the comment after it before the `;`, where its next pass moves it after
	it('trails the statement with a comment after a parenthesized arrow function body', () => {
		const statement = firstStatement('const f = () => (\n  a /* c */\n);');
		const conditional = firstStatement('const f = () => (a ? b : c /* c */);');

		expect(commentsOf(statement).trailing).toEqual([' c ']);
		expect(commentsOf(statement.declarations[0].init.body).trailing).toBeUndefined();
		expect(commentsOf(conditional).trailing).toBeUndefined();
	});
});

describe('keywordTokens parse option', () => {
	it('collects async/function keyword tokens from the lexer', () => {
		const source = `async function load() {}\nfunction plain() {}`;
		const ast = parseModule(source, 'App.ts', { keywordTokens: true });
		const tokens = ast.tsrx_keyword_tokens;
		assert_found(tokens);
		expect(tokens.map((t) => [t.value, t.start])).toEqual([
			['async', source.indexOf('async')],
			['function', source.indexOf('function')],
			['function', source.lastIndexOf('function')],
		]);
	});

	it('is immune to comments and irregular spacing between keywords', () => {
		// Offset arithmetic assumed one space; text search would match the
		// keyword inside the comment. The lexer sees through both.
		const source = `async /* function */   function load() {}`;
		const ast = parseModule(source, 'App.ts', { keywordTokens: true });
		const tokens = ast.tsrx_keyword_tokens;
		assert_found(tokens);
		expect(tokens.map((t) => [t.value, t.start])).toEqual([
			['async', 0],
			['function', source.lastIndexOf('function')],
		]);
	});

	it('does not collect tokens without the option', () => {
		const ast = parseModule(`function f() {}`, 'App.ts');
		expect(ast.tsrx_keyword_tokens).toBeUndefined();
	});
});

describe('multi-line JSX elements as attribute values', () => {
	// A paired element with element children spread over multiple lines inside an
	// attribute's `{ … }` container used to unbalance the tokenizer context stack:
	// the stale-text fixup before its closing tag popped the element's own
	// children context, so the token after the container's `}` (the tag's `>`,
	// `/>`, or a following attribute) tokenized as template text and failed.

	/**
	 * The `prop` attribute's value, asserted to be a `<div>` wrapping a `<span>`.
	 *
	 * @param {AST.TSRXJSXElement} element
	 */
	function expectDivSpanValue(element) {
		const value = as_type(attributeExpression(element.openingElement.attributes[0]), 'JSXElement');
		expect(openingName(value).name).toBe('div');
		expect(node_children(value).some((c) => c.type === 'JSXElement')).toBe(true);
	}

	it('parses one before other attributes of a self-closing tag', () => {
		const element = findElement(
			`export function App() @{
	<Child
		prop={<div>
			<span>x</span>
		</div>}
		other={1}
	/>
}`,
			'Child',
		);
		expectDivSpanValue(element);
		const other = as_type(attributeExpression(element.openingElement.attributes[1]), 'Literal');
		expect(other.value).toBe(1);
	});

	it('parses one as the sole attribute of a self-closing tag', () => {
		const element = findElement(
			`export function App() @{
	<Child
		prop={<div>
			<span>x</span>
		</div>}
	/>
}`,
			'Child',
		);
		expectDivSpanValue(element);
		expect(as_type(element.openingElement, 'JSXOpeningElement').selfClosing).toBe(true);
	});

	it('parses one on a paired tag with children', () => {
		const element = findElement(
			`export function App() @{
	<Child
		prop={<div id="a">
			<span>x</span>
		</div>}
	>
		<i>child</i>
	</Child>
}`,
			'Child',
		);
		expectDivSpanValue(element);
		const child_element = as_type(
			found(node_children(element).find((c) => c.type === 'JSXElement')),
			'JSXElement',
		);
		expect(as_type(child_element.openingElement.name, 'JSXIdentifier').name).toBe('i');
	});

	// The stale-text fixup must keep one `tc_expr` context per element still open
	// inside the container — not a fixed count. Two levels of paired nesting and
	// a sibling element after a nested close each caught a wrong quota.

	it('parses two levels of paired nesting before another attribute', () => {
		const element = findElement(
			`export function App() @{
	<Child
		prop={<div>
			<section>
				<span>x</span>
			</section>
		</div>}
		other={1}
	/>
}`,
			'Child',
		);
		expectDivSpanValue(element);
		const other = as_type(attributeExpression(element.openingElement.attributes[1]), 'Literal');
		expect(other.value).toBe(1);
	});

	it('parses two levels of paired nesting on a paired tag with children', () => {
		const element = findElement(
			`export function App() @{
	<Child
		prop={<div>
			<section>
				<span>x</span>
			</section>
		</div>}
	>
		<i>child</i>
	</Child>
}`,
			'Child',
		);
		expectDivSpanValue(element);
		const child_element = as_type(
			found(node_children(element).find((c) => c.type === 'JSXElement')),
			'JSXElement',
		);
		expect(as_type(child_element.openingElement.name, 'JSXIdentifier').name).toBe('i');
	});

	it('parses a sibling element after a nested close inside the value', () => {
		const element = findElement(
			`export function App() @{
	<Child
		prop={<div>
			<span>x</span>
			<b>y</b>
		</div>}
		other={1}
	/>
}`,
			'Child',
		);
		const value = as_type(attributeExpression(element.openingElement.attributes[0]), 'JSXElement');
		const tags = node_children(value)
			.filter((c) => c.type === 'JSXElement')
			.map((c) => as_type(as_type(c, 'JSXElement').openingElement.name, 'JSXIdentifier').name);
		expect(tags).toEqual(['span', 'b']);
		const other = as_type(attributeExpression(element.openingElement.attributes[1]), 'Literal');
		expect(other.value).toBe(1);
	});
});

describe('casts around JSX in attribute values', () => {
	// A balanced element inside nested parens leaves the token-context stack
	// already unwound below the enclosing expression's depth, so the
	// after-element fixup must not pop the still-open outer `(` — doing so made
	// the outer `)` pop the attribute container's brace instead, and the `as`
	// that followed tokenized as a JSX name, never reaching the cast parse.

	/**
	 * The attribute value's `… as any` cast, asserted and unwrapped.
	 *
	 * @param {AST.TSRXJSXElement} element
	 * @param {number} index
	 * @returns {AST.Expression}
	 */
	function attributeCastExpression(element, index) {
		const cast = as_type(
			attributeExpression(element.openingElement.attributes[index]),
			'TSAsExpression',
		);
		return cast.expression;
	}

	it('parses a cast parenthesized arrow returning parenthesized JSX', () => {
		const element = findElement(
			`export function App() {
	return <Host prop={((c: any) => (<Col id={c.id} />)) as any} />;
}`,
			'Host',
		);
		const arrow = as_type(attributeCastExpression(element, 0), 'ArrowFunctionExpression');
		const body = as_type(arrow.body, 'JSXElement');
		expect(as_type(body.openingElement.name, 'JSXIdentifier').name).toBe('Col');
	});

	it('parses a cast arrow returning a paired element with an expression child', () => {
		const element = findElement(
			`export function App() {
	return <Host prop={((c: any) => (<Col a={c.a}>{c.name}</Col>)) as any} />;
}`,
			'Host',
		);
		const arrow = as_type(attributeCastExpression(element, 0), 'ArrowFunctionExpression');
		const body = as_type(arrow.body, 'JSXElement');
		const container = as_type(
			found(node_children(body).find((c) => c.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		);
		assert_type(container.expression, 'MemberExpression');
	});

	it('parses a cast call whose argument is an arrow returning JSX', () => {
		const element = findElement(
			`export function App() {
	return <Host prop={fn((c: any) => (<Col id={c.id} />)) as any} />;
}`,
			'Host',
		);
		const call = as_type(attributeCastExpression(element, 0), 'CallExpression');
		const arrow = as_type(call.arguments[0], 'ArrowFunctionExpression');
		assert_type(arrow.body, 'JSXElement');
	});

	it('parses a cast around doubly parenthesized JSX', () => {
		const element = findElement(
			`export function App() {
	return <Host prop={((<Col id={c.id} />)) as any} />;
}`,
			'Host',
		);
		const value = as_type(attributeCastExpression(element, 0), 'JSXElement');
		expect(as_type(value.openingElement.name, 'JSXIdentifier').name).toBe('Col');
	});

	it('parses a multi-line cast arrow inside a cast element array', () => {
		const element = findElement(
			`export function Table() {
	const state = useTableState({
		children: [
			<TableHeader
				key="head"
				columns={columns}
				children={
					((c: any) => (
						<Column key={c.id} isRowHeader={c.isRowHeader}>
							{c.name}
						</Column>
					)) as any
				}
			/>,
		] as any,
		selectionMode: 'multiple',
	});
	return <div>{state.collection.size}</div>;
}`,
			'TableHeader',
		);
		const arrow = as_type(attributeCastExpression(element, 2), 'ArrowFunctionExpression');
		const body = as_type(arrow.body, 'JSXElement');
		expect(as_type(body.openingElement.name, 'JSXIdentifier').name).toBe('Column');
		const container = as_type(
			found(node_children(body).find((c) => c.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		);
		assert_type(container.expression, 'MemberExpression');
	});
});

describe('expression-container children inside JSX attribute values', () => {
	// After an element parsed inside a child `{ … }` container of a JSX-valued
	// attribute, the container's closing `}` has already popped its own brace
	// context, leaving the tail [tc_oTag, b_expr, tc_expr] — the same shape a
	// statement-bodied attribute leaks when the attribute's own container
	// closes. The after-element fixup treated it as that leak and stripped the
	// attribute container's brace plus the outer element's children context, so
	// the `=` of the following attribute tokenized as template text and failed.
	// In the child-container case the stack sits below the enclosing
	// expression's depth, which now gates the strip.

	/**
	 * Name of a `JSXElement`'s opening tag.
	 *
	 * @param {AST.Node} node
	 * @returns {string}
	 */
	function elementName(node) {
		return as_type(as_type(node, 'JSXElement').openingElement.name, 'JSXIdentifier').name;
	}

	it('parses a ternary of elements in the value before another attribute', () => {
		const element = findElement(
			`export function App({ ok }: any) {
	return (
		<Host
			slot={
				<button>
					{ok ? <X /> : <Y />}
				</button>
			}
			onChange={(d: any) => go(d)}
		/>
	);
}`,
			'Host',
		);
		const value = as_type(attributeExpression(element.openingElement.attributes[0]), 'JSXElement');
		expect(openingName(value).name).toBe('button');
		const container = as_type(
			found(node_children(value).find((c) => c.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		);
		const conditional = as_type(container.expression, 'ConditionalExpression');
		expect(elementName(conditional.consequent)).toBe('X');
		expect(elementName(conditional.alternate)).toBe('Y');
		const handler = as_type(
			attributeExpression(element.openingElement.attributes[1]),
			'ArrowFunctionExpression',
		);
		expect(handler.params).toHaveLength(1);
	});

	it('parses a lone element in a child container before another attribute', () => {
		const element = findElement(
			`export function App() {
	return <Host slot={<button>{<X />}</button>} onChange={(d: any) => go(d)} />;
}`,
			'Host',
		);
		const value = as_type(attributeExpression(element.openingElement.attributes[0]), 'JSXElement');
		expect(openingName(value).name).toBe('button');
		const container = as_type(
			found(node_children(value).find((c) => c.type === 'JSXExpressionContainer')),
			'JSXExpressionContainer',
		);
		expect(elementName(container.expression)).toBe('X');
		assert_type(
			attributeExpression(element.openingElement.attributes[1]),
			'ArrowFunctionExpression',
		);
	});

	it('still strips the leak for a directive-bodied attribute value', () => {
		const element = findElement(
			`export function App() {
	return <Card
		content={
			<div>
				@if (foo) {
					<span />
				}
			</div>
		}
	/>;
}`,
			'Card',
		);
		const value = as_type(attributeExpression(element.openingElement.attributes[0]), 'JSXElement');
		expect(openingName(value).name).toBe('div');
		expect(as_type(element.openingElement, 'JSXOpeningElement').selfClosing).toBe(true);
	});
});

describe('JSX spread children', () => {
	/** @type {Array<ParseOptions | undefined>} */
	const parse_options = [undefined, { collect: true, comments: [] }];

	/**
	 * Every `JSXSpreadChild` in the parsed tree, in source order.
	 *
	 * @param {string} source
	 * @param {ParseOptions} [options]
	 * @returns {ESTreeJSX.JSXSpreadChild[]}
	 */
	function spreadChildren(source, options) {
		const ast = parseModule(source, 'App.tsrx', options);
		return allNodes(ast)
			.filter((node) => node.type === 'JSXSpreadChild')
			.map((node) => as_type(node, 'JSXSpreadChild'));
	}

	it.each(parse_options)(
		'parses a spread child in statement, initializer, and return position (%o)',
		(options) => {
			for (const [source, text] of [
				['<div>{...a}</div>;', '{...a}'],
				['const x = <div>{...a}</div>;', '{...a}'],
				['function f() {\n  return <div>{...children}</div>;\n}', '{...children}'],
			]) {
				const [spread, ...rest] = spreadChildren(source, options);
				expect(rest, source).toEqual([]);
				expect(source.slice(spread.start, spread.end), source).toBe(text);
				const expression = as_type(spread.expression, 'Identifier');
				expect(source.slice(expression.start, expression.end)).toBe(text.slice(4, -1));
			}
		},
	);

	it.each(parse_options)(
		'parses spread children in template bodies next to other children (%o)',
		(options) => {
			const source = `export function App({ items, more }: { items: any[]; more: any[] }) @{
	<div>
		{...items}
		text
		{...more.map((item) => <b>{item}</b>)}
		<span />
	</div>
}`;
			const [first, second] = spreadChildren(source, options);
			expect(source.slice(first.start, first.end)).toBe('{...items}');
			expect(source.slice(second.start, second.end)).toBe('{...more.map((item) => <b>{item}</b>)}');
			assert_type(second.expression, 'CallExpression');

			const div = findElement(source, 'div');
			expect(
				node_children(div)
					.filter((node) => node.type !== 'JSXText' || node.value.trim())
					.map((node) => node.type),
			).toEqual(['JSXSpreadChild', 'JSXText', 'JSXSpreadChild', 'JSXElement']);
		},
	);

	it('parses spread children in fragments, nested containers, and attribute-value elements', () => {
		for (const source of [
			'function App({ items }: any) @{\n\t<>{...items}</>\n}',
			'function App({ items }: any) @{\n\t<div>{<span>{...items}</span>}</div>\n}',
			'function App({ items }: any) @{\n\t<Card content={<i>{...items}</i>} />\n}',
			'const x = <ul>{...items}{...items}</ul>;',
		]) {
			const spreads = spreadChildren(source);
			expect(spreads.length, source).toBeGreaterThan(0);
			for (const spread of spreads) {
				expect(source.slice(spread.start, spread.end), source).toBe('{...items}');
			}
		}
	});

	it('keeps a comment inside the braces on the spread expression', () => {
		const source = 'const x = <div>{... /* c */ a}</div>;';
		const [spread] = spreadChildren(source);
		const expression = as_type(spread.expression, 'Identifier');
		expect(expression.leadingComments?.map((comment) => comment.value)).toEqual([' c ']);
	});

	it.each(parse_options)('rejects a spread without an argument (%o)', (options) => {
		expect(() => parseModule('const x = <div>{...}</div>;', 'App.tsrx', options)).toThrow(
			'Unexpected token (1:19)',
		);
	});

	it.each(parse_options)('rejects a spread as an attribute value (%o)', (options) => {
		for (const [source, position] of [
			['const x = <a b={...c} />;', '1:15'],
			['function App() @{\n\t<a b={...c} />\n}', '2:6'],
		]) {
			expect(() => parseModule(source, 'App.tsrx', options), source).toThrow(
				`Attribute values cannot be spread. Use a spread attribute (\`{...props}\`) instead. (${position})`,
			);
		}
	});

	it.each(parse_options)('rejects a spread as a dynamic tag name (%o)', (options) => {
		expect(() => parseModule('const x = <{...a} />;', 'App.tsrx', options)).toThrow(
			/^Dynamic element names must be .* \(1:11\)$/,
		);
	});
});

// A `<` in markup child position only opens a tag when the next character can
// begin one. Anything else — a digit, an operator, an emoji, whitespace — is a
// literal `<` in the text, the same rule the HTML tokenizer uses. Every case
// below throws `Unexpected token` before this rule.
describe('literal `<` in markup text', () => {
	it('reads a `<` that cannot start a tag as text', () => {
		for (const [label, source, text] of [
			['digit', `function App() { return <span><3</span>; }`, '<3'],
			['operator', `function App() { return <span><= arrow</span>; }`, '<= arrow'],
			['non-ASCII', `function App() { return <span><\u{1F600}</span>; }`, '<\u{1F600}'],
			['surrounding spaces', `function App() { return <span>a < b</span>; }`, 'a < b'],
			['template body', `function App() @{ <span><3</span> }`, '<3'],
		]) {
			const span = findElement(source, 'span');

			expect(
				span.children.map((child) => child.type),
				label,
			).toEqual(['JSXText']);
			expect(child(span, 0, 'JSXText').value, label).toBe(text);
		}
	});

	it('keeps a literal `<` as text when a real tag follows it', () => {
		const div = findElement(`function App() { return <div><3<span>x</span></div>; }`, 'div');

		expect(div.children.map((child) => child.type)).toEqual(['JSXText', 'JSXElement']);
		expect(child(div, 0, 'JSXText').value).toBe('<3');
		expect(openingName(child(div, 1, 'JSXElement')).name).toBe('span');
	});

	// An element nested in a `{ … }` expression container reads its children
	// through `jsx_readToken` rather than the raw-text token path, so the rule
	// has to hold there too.
	it('reads a `<` that cannot start a tag as text inside an expression container', () => {
		for (const [label, source, text] of [
			['digit', `function App() @{ <div>{<span><3</span>}</div> }`, '<3'],
			['operator', `function App() @{ <div>{<span><= x</span>}</div> }`, '<= x'],
			['surrounding spaces', `function App() @{ <div>{<span>a < b</span>}</div> }`, 'a < b'],
			['JSX return', `function App() { return <div>{<span><3</span>}</div>; }`, '<3'],
		]) {
			const span = findElement(source, 'span');

			expect(
				span.children.map((child) => child.type),
				label,
			).toEqual(['JSXText']);
			expect(child(span, 0, 'JSXText').value, label).toBe(text);
		}
	});
});

describe('function types in JSX attribute values', () => {
	// Deciding whether `(` opens a function type scans ahead, and that scan is
	// only supposed to be a query. Its state snapshot aliased the tokenizer's
	// context stack, so for an EMPTY parameter list — where the scan consumes
	// `(` and returns the moment it sees `)` — the context that `(` pushed was
	// never popped. Every later token then sat one frame out of phase, and the
	// `>` closing the element's opening tag was tokenized as JSX text:
	// "Unexpected token `>`. Did you mean `&gt;`?".
	//
	// A non-empty list (`(n: number) => void`) scans far enough to balance, so
	// only the empty-parens spellings below ever broke.

	it('parses a callback prop whose parameter is a no-argument function type', () => {
		const element = findElement(
			`export function App(props: { failed: boolean }) @{
	<Boundary fallback={(reset: () => void) => <button onClick={() => reset()}>{'retry'}</button>}>
		<Child failed={props.failed} />
	</Boundary>
}`,
			'Boundary',
		);
		const arrow = as_type(
			attributeExpression(element.openingElement.attributes[0]),
			'ArrowFunctionExpression',
		);
		expect(as_type(arrow.params[0], 'Identifier').name).toBe('reset');
		// The element's own children still parse — the stale context used to
		// swallow the opening tag's `>` and everything after it.
		expect(as_type(element.children[0], 'JSXElement')).toBeTruthy();
	});

	it('parses the no-argument function type in every spelling that leaked a context', () => {
		for (const [label, type] of [
			['bare', '() => void'],
			['returning a value', '() => string'],
			['returning a generic', '() => Promise<void>'],
			['as an object member', '{ go: () => void }'],
		]) {
			const element = findElement(
				`export function App() @{ <Host on={(cb: ${type}) => 'x'}>{'c'}</Host> }`,
				'Host',
			);
			const arrow = as_type(
				attributeExpression(element.openingElement.attributes[0]),
				'ArrowFunctionExpression',
			);
			expect(as_type(arrow.params[0], 'Identifier').name, label).toBe('cb');
		}
	});

	it('keeps a following attribute and a sibling element in the same tag', () => {
		// The leak was positional, so what comes AFTER the offending attribute is
		// what a narrower fix could still get wrong.
		const element = findElement(
			`export function App() @{
	<Host on={(cb: () => void) => 'x'} id="after">
		<Sibling />
	</Host>
}`,
			'Host',
		);
		const [, id] = element.openingElement.attributes;
		expect(as_type(as_type(id, 'JSXAttribute').name, 'JSXIdentifier').name).toBe('id');
		expect(
			as_type(as_type(element.children[0], 'JSXElement').openingElement.name, 'JSXIdentifier').name,
		).toBe('Sibling');
	});
});

describe('`<` operators beside type-argument lookahead', () => {
	// The tokenizer splits a lone `<` off when the source after it looks like
	// type parameters or arguments. It must leave `<=`, `<<`, and `<<=` whole,
	// both when the operator is compact (`value<=1`) and when a later arrow
	// gives the generic-arrow lookahead a `<...>() =>` shape to pair with.

	/**
	 * @param {string} source
	 * @returns {{ type: string, operator: string | undefined }}
	 */
	function ifTest(source) {
		const test = findNode(source, 'IfStatement').test;
		return { type: test.type, operator: 'operator' in test ? test.operator : undefined };
	}

	/**
	 * Binary operators in source order.
	 *
	 * @param {string} source
	 * @returns {string[]}
	 */
	function binaryOperators(source) {
		/** @type {AST.BinaryExpression[]} */
		const binaries = [];
		find_first(parseModule(source, 'App.tsrx'), (node) => {
			if (node.type === 'BinaryExpression') binaries.push(node);
			return false;
		});
		return binaries
			.sort((a, b) => /** @type {number} */ (a.start) - /** @type {number} */ (b.start))
			.map((node) => node.operator);
	}

	it('keeps comparison and shift operators whole', () => {
		for (const [operator, type] of [
			['<', 'BinaryExpression'],
			['<=', 'BinaryExpression'],
			['<<', 'BinaryExpression'],
			['<<=', 'AssignmentExpression'],
			['>=', 'BinaryExpression'],
			['>>', 'BinaryExpression'],
			['>>>', 'BinaryExpression'],
		]) {
			for (const operand of ['0', 'n']) {
				for (const expression of [
					`value ${operator} ${operand}`,
					`value${operator}${operand}`,
					`value ${operator}${operand}`,
					`value${operator} ${operand}`,
				]) {
					for (const rest of ['', ' const release = () => () => value; return release;']) {
						const source = `function compare(value: number, n: number) { if (${expression}) return;${rest} }`;
						expect(ifTest(source), source).toEqual({ type, operator });
					}
				}
			}
		}
	});

	it('keeps a compact shift whole after any operand', () => {
		for (const expression of ['1<<n', 'value<<n', '(value)<<1', 'value[0]<<1']) {
			const source = `function shift(value: number[], n: number) { if (${expression}) return; }`;
			expect(ifTest(source), source).toEqual({ type: 'BinaryExpression', operator: '<<' });
		}
	});

	it('keeps `<=` whole in loop headers and beside JSX', () => {
		for (const source of [
			'for (let i = 0; i<=n; i++) {}',
			'for (let i = 0; i <= n; i++) { const f = () => (y) => y; }',
		]) {
			expect(binaryOperators(source), source).toEqual(['<=']);
		}

		const conditional = findNode('const a = b<=c ? <div /> : null;', 'ConditionalExpression');
		expect(as_type(conditional.test, 'BinaryExpression').operator).toBe('<=');
		expect(conditional.consequent.type).toBe('JSXElement');
	});

	it('keeps `<=` and `<<` whole in template bodies, headers, and attributes', () => {
		/** @type {Array<[source: string, operators: string[]]>} */
		const cases = [
			[
				`function App({ n }: { n: number }) @{
	@if (n<=1) {
		<button disabled={n<=0} onClick={() => () => n}>{n<<1}</button>
	}
}`,
				['<=', '<=', '<<'],
			],
			[
				`function App({ n }: { n: number }) @{
	const flags = 1<<n;
	<>{flags <= 4 && <b />}</>
}`,
				['<<', '<='],
			],
		];
		for (const [source, operators] of cases) {
			expect(binaryOperators(source), source).toEqual(operators);
		}
	});

	it('still reads type arguments, including a generic function type after `<<`', () => {
		/** @type {Array<[source: string, params: string[]]>} */
		const cases = [
			['const result = f<T>(1);', ['TSTypeReference']],
			['const result = x<y>(z);', ['TSTypeReference']],
			['const result = f<<T,>(x: T) => T>(g);', ['TSFunctionType']],
			['const result = f<<T extends () => void>() => T>(g);', ['TSFunctionType']],
			['const result = f < <T,>(x: T) => T > (g);', ['TSFunctionType']],
		];
		for (const [source, params] of cases) {
			const call = findNode(source, 'CallExpression');
			expect(
				call.typeArguments?.params.map((param) => param.type),
				source,
			).toEqual(params);
		}

		for (const source of [
			'type List = Array<<T>() => T>;',
			'let list: Array<<T>(x: T) => T> = [];',
		]) {
			expect(findNode(source, 'TSFunctionType').typeParameters?.params, source).toHaveLength(1);
		}
	});

	it('still recognizes generic arrows and generic function expressions', () => {
		for (const source of [
			'const id = <T,>(x: T) => x;',
			'const id = < T,>(x: T) => x;',
			'const id = <T extends object = {}>(x: T): T => x;',
			'const run = <T extends () => void>(task: T) => task;',
		]) {
			expect(
				findNode(source, 'ArrowFunctionExpression').typeParameters?.params,
				source,
			).toHaveLength(1);
		}

		expect(
			findNode('const id = function <T>(x: T) { return x; };', 'FunctionExpression').typeParameters
				?.params,
		).toHaveLength(1);

		const source = 'const a = x < y; const id = <T,>(x: T) => x;';
		expect(binaryOperators(source)).toEqual(['<']);
		expect(findNode(source, 'ArrowFunctionExpression').typeParameters?.params).toHaveLength(1);
	});

	it('keeps a tag with an arrow attribute and arrow-shaped text as JSX', () => {
		for (const source of [
			'const a = <div onClick={() => a}>(b) => c</div>;',
			'function App() @{ <Foo cb={(x) => x}>(b) => c</Foo> }',
		]) {
			expect(findNode(source, 'JSXElement').openingElement.attributes, source).toHaveLength(1);
		}
	});

	it('reads type parameters inside types instead of a JSX tag', () => {
		expect(
			findNode('type C = { new <T>(x: T): T };', 'TSConstructSignatureDeclaration').typeParameters
				?.params,
		).toHaveLength(1);
		expect(
			findNode('interface A { f?<T>(x: T): T; }', 'TSMethodSignature').typeParameters?.params,
		).toHaveLength(1);
		expect(
			findNode('type F = new <T>(x: T) => T;', 'TSConstructorType').typeParameters?.params,
		).toHaveLength(1);
	});

	it('keeps a tag whose generic arrow prop has a function-type constraint as JSX (#164)', () => {
		for (const source of [
			'const node = <Box fn={<T extends () => void,>(x: T) => x} />;',
			'const node = <Box fn={<T extends () => void>(x: T) => x} />;',
			'const node = <Box fn={<T extends (a: T) => T = () => void,>(x: T) => x} />;',
			'const node = <Box fn={<T,>(x: T) => x}>(b) => c</Box>;',
			'const node = <Box fn={<T,>(x: T) => x}>(b): T => c</Box>;',
			'function App() @{ <Box fn={<T extends () => void,>(x: T) => x}>{1}</Box> }',
		]) {
			const attributes = findNode(source, 'JSXElement').openingElement.attributes;
			expect(attributes, source).toHaveLength(1);
			const value = as_type(attributes[0], 'JSXAttribute').value;
			const arrow = as_type(
				as_type(value, 'JSXExpressionContainer').expression,
				'ArrowFunctionExpression',
			);
			expect(arrow.typeParameters?.params, source).toHaveLength(1);
		}
	});

	it('recognizes generic arrows whose type parameters hold arrows, defaults, modifiers, and comments', () => {
		for (const source of [
			'const run = <T extends () => void,>(task: T) => task;',
			'const run = <T extends (x: number) => void = () => void>(task: T) => task;',
			'const run = <const T extends readonly unknown[]>(x: T) => x;',
			'const run = <T, U extends Map<string, Array<T>>>(x: T, y: U) => x;',
			'const run = <T /* first */, U // second\n>(x: T, y: U) => x;',
			'const run = <T extends { fn(): void; key: "a" | \'b\' }>(x: T) => x;',
			'const run = <T,>(x: T): { value: T } => ({ value: x });',
			'const run = <T,>(x: T): (y: T) => T => (y) => y;',
		]) {
			const arrow = findNode(source, 'ArrowFunctionExpression');
			expect(arrow.typeParameters?.params.length, source).toBeGreaterThan(0);
			expect(arrow.params, source).not.toHaveLength(0);
		}
	});

	it('recognizes generic arrows whose parameters hold comments, regex literals, and division (#175)', () => {
		for (const [source, param_count] of /** @type {[string, number][]} */ ([
			['const fn = <T extends object>(x: T /* ) */) => x;', 1],
			['const fn = <T extends object>(x: T // )\n) => x;', 1],
			['const fn = <T extends object>(x: T, re = /[)]/) => x;', 2],
			['const fn = <T extends object>(x: T, re = /\\)/gu, y = 1) => x;', 3],
			['const fn = <T extends object>(x: T, y = (1) / 2, z = a / b) => x;', 3],
			['const fn = <T extends object>(x: T, y = "(", z = `)`) => x;', 3],
			['const fn = <T,>(x: T /* ) */): T /* ) */ => x;', 1],
			['const fn = <T extends object>(x: T, y = a! / 2, z = b!.c / 3) => x;', 3],
			['const fn = <T extends object>(x: T, y = i++ / 2, z = --j / 3) => x;', 3],
			['const fn = <T extends object>(x: T, y = 1. / 2, z = .5 / 3) => x;', 3],
			['const fn = <T extends object>(x: T, y = typeof /[)]/, z = !/[)]/.test("")) => x;', 3],
			['const fn = <T extends object>(x: T, y = c ? /[)]/ : /\\)/) => x;', 2],
			[
				'const fn = <T extends object>(x: T, y = a.in / 2, z = b.typeof / 3, w = c?.d / 4) => x;',
				4,
			],
			['const fn = <T extends object>(x: T, of = 1, y = of / 2) => x;', 3],
			['const fn = <T extends object>(x: T, y = [...typeof /[)]/.source, ...void /\\)/]) => x;', 2],
			['const fn = <T extends object>(x: T, ...rest: [y?: RegExp]) => rest[0] ?? /[)]/;', 2],
			[
				'const fn = <T extends object>(x: T, y = (s) => { for (const c of /[)]/.exec(s) ?? []) c; }) => x;',
				2,
			],
		])) {
			const arrow = findNode(source, 'ArrowFunctionExpression');
			expect(arrow.typeParameters?.params, source).toHaveLength(1);
			expect(arrow.params, source).toHaveLength(param_count);
		}
	});

	it('keeps a tag whose generic arrow prop has parentheses in comments or regex literals as JSX (#175)', () => {
		for (const source of [
			'const node = <Box fn={<T extends () => void,>(x: T /* ) */) => x} />;',
			'const node = <Box fn={<T,>(x: T, re = /[)]/) => x}>(b) => c</Box>;',
		]) {
			const attributes = findNode(source, 'JSXElement').openingElement.attributes;
			expect(attributes, source).toHaveLength(1);
			const value = as_type(attributes[0], 'JSXAttribute').value;
			const arrow = as_type(
				as_type(value, 'JSXExpressionContainer').expression,
				'ArrowFunctionExpression',
			);
			expect(arrow.typeParameters?.params, source).toHaveLength(1);
		}
	});

	it('reads type parameters after an optional class member name', () => {
		for (const source of [
			'abstract class A { abstract m?<T>(x: T): T; }',
			'class A { m?<T>(x: T): T { return x; } }',
			'class A { m? <T>(x: T): T; }',
		]) {
			const method = findNode(source, 'MethodDefinition');
			expect(method.optional, source).toBe(true);
			expect(method.typeParameters?.params, source).toHaveLength(1);
		}
	});
});

describe('lazy destructuring is not supported', () => {
	it('rejects `&{ ... }` and `&[ ... ]` binding patterns as parse errors', () => {
		for (const source of [
			'function f(&{ a }) {}',
			'const &[x] = y;',
			'let &{ a } = b;',
			'for (const &{ v } of items) {}',
			'&[x] = expr;',
			'(&{ a }) => a;',
		]) {
			expect(() => parseModule(source, 'App.tsrx'), source).toThrow();
		}
	});

	it('still parses `&` followed by an object or array literal as a bitwise AND', () => {
		const object_ast = parseModule('a & { b: 1 };', 'App.tsrx');
		const object_and = as_type(
			firstStatement(object_ast, 'ExpressionStatement').expression,
			'BinaryExpression',
		);
		expect(object_and.operator).toBe('&');
		expect(object_and.left.type).toBe('Identifier');
		expect(object_and.right.type).toBe('ObjectExpression');

		const array_ast = parseModule('x & [1];', 'App.tsrx');
		const array_and = as_type(
			firstStatement(array_ast, 'ExpressionStatement').expression,
			'BinaryExpression',
		);
		expect(array_and.operator).toBe('&');
		expect(array_and.right.type).toBe('ArrayExpression');
	});
});

describe('wrapped destructuring assignment targets', () => {
	// acorn-typescript only unwraps `as` / `!` / `satisfies` wrappers around
	// simple targets; the TSRX parser's `checkLValPattern` override extends
	// that to nested patterns so they take the pattern lane instead of
	// failing with "Assigning to rvalue".
	it('accepts TypeScript wrappers around nested destructuring patterns', () => {
		for (const source of [
			'[{ a } as T] = arr;',
			'[[b]!] = arr;',
			'[{ a } satisfies T] = arr;',
			'[b as any] = arr;',
		]) {
			expect(() => parseModule(source, 'App.tsrx'), source).not.toThrow();
		}

		const ast = parseModule('[{ a } as T] = arr;', 'App.tsrx');
		const assignment = as_type(
			firstStatement(ast, 'ExpressionStatement').expression,
			'AssignmentExpression',
		);
		expect(assignment.left.type).toBe('ArrayPattern');
	});
});

describe('`var` redeclaring a catch parameter', () => {
	// Annex B lets `var` in a catch block redeclare a catch parameter that is a
	// plain name, as acorn and TypeScript allow. Parsed in a worker, so a parse
	// that never returns fails the test instead of stalling the run.
	const modes = [
		undefined,
		{ collect: true, comments: [], preserveParens: true },
		{ loose: true, comments: [] },
	];
	/** @param {string[]} sources */
	const in_every_mode = (sources) =>
		sources.flatMap((source) => modes.map((options) => ({ source, options })));

	it('lets `var` redeclare a catch parameter that is a plain name', async () => {
		const sources = [
			'export function read() {\n\ttry { throw 1; }\n\tcatch (error) { var error = 2; return error; }\n}',
			'try {} catch (e: unknown) { var e; }',
			'try {} catch (e) { for (var e of []) {} }',
			'try {} catch (e) { { var e; } }',
			'try {} catch (e) { try {} catch (e) { var e; } }',
			'function App() @{ @try { <div /> } @catch (e) { var e = 1; <span>{e}</span> } }',
			'function App() { return @try { <div /> } @catch (e) { var e = 1; <span>{e}</span> }; }',
		];

		const outcomes = await parse_in_worker(in_every_mode(sources));

		expect(outcomes).toEqual(
			sources.flatMap(() => [
				{ ok: true, errors: undefined },
				{ ok: true, errors: [] },
				{ ok: true, errors: [] },
			]),
		);
	});

	it('still rejects the redeclarations Annex B does not allow', async () => {
		// A destructured parameter and a function declaration are ECMAScript early
		// errors that TypeScript doesn't report; `let` conflicts in TypeScript too.
		const sources = [
			['try {} catch ({ e }) { var e; }', 'e'],
			['try {} catch ([e]) { var e; }', 'e'],
			['try {} catch (e) { let e; }', 'e'],
			['try {} catch (e) { function e() {} }', 'e'],
			['function App() @{ @try { <div /> } @catch (e, reset) { var reset; <span /> } }', 'reset'],
		];

		const outcomes = await parse_in_worker(in_every_mode(sources.map(([source]) => source)));

		expect(outcomes).toEqual(
			sources.flatMap(([, name]) => {
				const message = `Identifier '${name}' has already been declared`;
				return [
					{ ok: false, message, pos: expect.any(Number) },
					{ ok: true, errors: [message] },
					{ ok: true, errors: [message] },
				];
			}),
		);
	});
});

describe('comments around empty statements', () => {
	/**
	 * @param {AST.Comment[] | undefined} comments
	 * @returns {string[] | undefined}
	 */
	const values = (comments) => comments?.map((comment) => comment.value);

	// Like Prettier, a `;` in a statement list prints as nothing, so the
	// statements around it take its comments.
	it('gives a comment after an empty statement to the statement before it', () => {
		const ast = parseModule('a; ; // c\nb;', 'App.tsrx');
		const [a, empty, b] = ast.body;
		assert_type(empty, 'EmptyStatement');

		expect(values(a.trailingComments)).toEqual([' c']);
		expect(empty.leadingComments).toBeUndefined();
		expect(empty.trailingComments).toBeUndefined();
		expect(b.leadingComments).toBeUndefined();
	});

	it('gives a comment on its own line before an empty statement to the next statement', () => {
		const ast = parseModule('a;\n// c\n;\nb;', 'App.tsrx');
		const [a, empty, b] = ast.body;
		assert_type(empty, 'EmptyStatement');

		expect(a.trailingComments).toBeUndefined();
		expect(empty.leadingComments).toBeUndefined();
		expect(values(b.leadingComments)).toEqual([' c']);
	});

	it('gives the last statement the comments after the empty statements that end a list', () => {
		const ast = parseModule('function f() {\n\ta; ; // c\n\t;\n\t// d\n}', 'App.tsrx');
		const declaration = firstStatement(ast, 'FunctionDeclaration');
		const [a] = declaration.body.body;

		expect(values(a.trailingComments)).toEqual([' c', ' d']);
	});

	it('keeps the comments of a list with only empty statements in its container', () => {
		const block_ast = parseModule('function f() {\n\t; // c\n}\nb;', 'App.tsrx');
		const declaration = firstStatement(block_ast, 'FunctionDeclaration');
		const [, b] = block_ast.body;

		expect(values(declaration.body.innerComments)).toEqual([' c']);
		expect(b.leadingComments).toBeUndefined();

		const program_ast = parseModule('; // c\n;', 'App.tsrx');
		expect(values(program_ast.innerComments)).toEqual([' c']);
	});

	it('keeps the comments of an empty statement body', () => {
		const ast = parseModule('if (x) ; // c\nelse y;', 'App.tsrx');
		const statement = firstStatement(ast, 'IfStatement');
		assert_type(statement.consequent, 'EmptyStatement');

		expect(values(statement.consequent.trailingComments)).toEqual([' c']);
	});

	// Static blocks and namespace bodies are statement lists like a function
	// body (#286), so their empty statements take no comments either.
	it('gives the comments of empty statements in static blocks and namespaces to their neighbors', () => {
		const class_ast = parseModule(
			'class A {\n\tstatic {\n\t\ta; ; // c\n\t}\n\tstatic {\n\t\t; // d\n\t}\n\tb() {}\n}',
			'App.tsrx',
		);
		const [static_block, empty_block, method] = firstStatement(class_ast, 'ClassDeclaration').body
			.body;
		assert_type(static_block, 'StaticBlock');
		assert_type(empty_block, 'StaticBlock');
		const [a, empty] = static_block.body;

		expect(values(a.trailingComments)).toEqual([' c']);
		expect(empty.trailingComments).toBeUndefined();
		expect(values(empty_block.innerComments)).toEqual([' d']);
		expect(empty_block.body[0].trailingComments).toBeUndefined();
		expect(method.leadingComments).toBeUndefined();

		const namespace_ast = parseModule(
			'namespace N {\n\ta; ; // c\n}\nnamespace M {\n\t; // d\n}\nb;',
			'App.tsrx',
		);
		const namespace = as_type(namespace_ast.body[0], 'TSModuleDeclaration');
		const empty_namespace = as_type(namespace_ast.body[1], 'TSModuleDeclaration');
		const block = as_type(namespace.body, 'TSModuleBlock');

		expect(values(block.body[0].trailingComments)).toEqual([' c']);
		expect(block.body[1].trailingComments).toBeUndefined();
		expect(values(as_type(empty_namespace.body, 'TSModuleBlock').innerComments)).toEqual([' d']);
		expect(namespace_ast.body[2].leadingComments).toBeUndefined();
	});
});

describe('parenthesized expression metadata', () => {
	/**
	 * @param {string} source
	 * @param {string} name
	 * @returns {AST.Identifier & { metadata?: { paren_start?: number } }}
	 */
	function findIdentifier(source, name) {
		const ast = parseModule(source, 'App.tsrx');
		const found = find_first(ast, (node) => node.type === 'Identifier' && node.name === name);
		if (!found) throw new Error(`No identifier ${name} found in source`);
		return /** @type {AST.Identifier & { metadata?: { paren_start?: number } }} */ (found);
	}

	// The formatter finds a node's own parentheses from here, one pair per
	// stacked JSDoc cast.
	it('records the outermost grouping paren of a parenthesized expression', () => {
		const source = 'x = /** @type {A} */ ((/** @type {B} */ (n)));';
		expect(findIdentifier(source, 'n').metadata?.paren_start).toBe(source.indexOf('(('));
	});

	it('leaves out the parens of a call or statement around the expression', () => {
		for (const source of ['foo /** @type {A} */ ((n));', 'if ((n)) {}', 'while ((n)) {}']) {
			expect(findIdentifier(source, 'n').metadata?.paren_start, source).toBe(
				source.indexOf('((') + 1,
			);
		}
		expect(findIdentifier('foo(n);', 'n').metadata?.paren_start).toBeUndefined();
	});
});

describe('mistakes that TypeScript reports only from its checker', () => {
	// TypeScript's parser accepts these and reports them as checker diagnostics.
	// `collect` and `loose` mode record them and keep parsing; a strict parse
	// throws them. Parsed in a worker, so a parse that never returns fails the
	// test instead of stalling the run.

	/**
	 * @typedef {{
	 *   source: string,
	 *   errors: Array<[message: string, at: string]>,
	 *   throws: string,
	 *   valid?: string,
	 *   pick?: (program: AST.Program) => unknown,
	 *   pickValid?: (program: AST.Program) => unknown,
	 *   match?: Record<string, unknown>,
	 * }} CheckerLevelCase
	 * `errors` pairs each collected message with the source text at its position.
	 * The node that `pick` takes from the AST is the node that `pickValid` (or
	 * `pick`) takes from the AST of the `valid` source, apart from locations, or
	 * matches `match`.
	 */

	/** @param {AST.Program} program */
	const first = (program) => program.body[0];
	/** @param {AST.Program} program */
	const last = (program) => program.body[program.body.length - 1];
	/** @param {AST.Program} program */
	const first_member = (program) =>
		as_type(/** @type {AST.Node} */ (first(program)), 'ClassDeclaration').body.body[0];
	/** @param {AST.Program} program */
	const first_parameter = (program) => {
		const fn = /** @type {AST.Node} */ (first(program));
		if (fn.type !== 'FunctionDeclaration' && fn.type !== 'TSDeclareFunction') {
			throw new Error(`Expected a function, got ${fn.type}`);
		}
		return fn.params[0];
	};
	/** @param {AST.Program} program */
	const constructor_parameter = (program) =>
		as_type(/** @type {AST.Node} */ (first_member(program)), 'MethodDefinition').value.params[0];
	/** @param {AST.Program} program */
	const namespace_statement = (program) =>
		as_type(
			as_type(/** @type {AST.Node} */ (first(program)), 'TSModuleDeclaration').body,
			'TSModuleBlock',
		).body[0];
	/** @param {AST.Program} program */
	const class_method_statement = (program) =>
		as_type(
			/** @type {AST.Node} */ (
				as_type(/** @type {AST.Node} */ (first(program)), 'ClassDeclaration').body.body.at(-1)
			),
			'MethodDefinition',
		).value.body?.body[0];
	/** @param {AST.Program} program */
	const function_statements = (program) =>
		as_type(/** @type {AST.Node} */ (first(program)), 'FunctionDeclaration').body.body;
	/** @param {AST.Program} program */
	const function_statement = (program) => function_statements(program)[0];
	/** @param {AST.Program} program */
	const interface_member = (program) =>
		as_type(/** @type {AST.Node} */ (first(program)), 'TSInterfaceDeclaration').body.body[0];
	/** @param {AST.Program} program */
	const first_type_parameter = (program) => {
		const declaration = /** @type {AST.Node & { typeParameters?: { params: unknown[] } }} */ (
			first(program)
		);
		return declaration.typeParameters?.params[0];
	};

	/** @type {CheckerLevelCase[]} */
	const cases = [
		{
			source: 'type T = 1;\ntype T = 2;',
			errors: [["type 'T' has already been declared.", 'T = 2']],
			throws: "type 'T' has already been declared. (2:5)",
			valid: 'type U = 1;\ntype T = 2;',
			pick: last,
		},
		{
			source: "import a from 'a';\nimport a from 'b';",
			errors: [["Identifier 'a' has already been declared", "a from 'b'"]],
			throws: "Identifier 'a' has already been declared",
			valid: "import b from 'a';\nimport a from 'b';",
			pick: last,
		},
		{
			source: 'class A { abstract m(): void; }',
			errors: [['Abstract methods can only appear within an abstract class.', 'abstract m']],
			throws: 'Abstract methods can only appear within an abstract class. (1:10)',
			valid: 'abstract class A { abstract m(): void; }',
			pick: first_member,
		},
		{
			source: 'declare class A { x = 1; }',
			errors: [['Initializers are not allowed in ambient contexts.', '= 1']],
			throws: 'Initializers are not allowed in ambient contexts. (1:20)',
			valid: 'class A { x = 1; }',
			pick: first_member,
		},
		{
			source: 'declare let x = 1;',
			errors: [['Initializers are not allowed in ambient contexts.', '1;']],
			throws: 'Initializers are not allowed in ambient contexts. (1:16)',
			valid: 'let x = 1;',
			pick: (program) =>
				as_type(/** @type {AST.Node} */ (first(program)), 'VariableDeclaration').declarations,
		},
		{
			source: 'abstract class A { static abstract x: number; }',
			errors: [["'static' modifier cannot be used with 'abstract' modifier.", 'abstract x']],
			throws: "'static' modifier cannot be used with 'abstract' modifier. (1:26)",
			pick: first_member,
			match: { static: true, abstract: true, key: { name: 'x' } },
		},
		{
			source: 'class A {\n\tconstructor(readonly public x: number) {}\n}',
			errors: [["'public' modifier must precede 'readonly' modifier.", 'public x']],
			// acorn-typescript throws it at the modifier's column (sveltejs/acorn-typescript#122).
			throws: "'public' modifier must precede 'readonly' modifier. (2:12)",
			valid: 'class A {\n\tconstructor(public readonly x: number) {}\n}',
			pick: constructor_parameter,
		},
		{
			source: 'class A { constructor(readonly readonly x: number) {} }',
			errors: [["Duplicate modifier: 'readonly'.", 'x: number']],
			throws: "Duplicate modifier: 'readonly'. (1:40)",
			valid: 'class A { constructor(readonly x: number) {} }',
			pick: constructor_parameter,
		},
		{
			source: 'class A { private #x = 1; }',
			errors: [["Private elements cannot have an accessibility modifier ('private').", 'private']],
			throws: "Private elements cannot have an accessibility modifier ('private'). (1:10)",
			pick: first_member,
			match: { type: 'PropertyDefinition', accessibility: 'private', key: { name: 'x' } },
		},
		{
			source: 'abstract class A { abstract #x: number; }',
			errors: [["Private elements cannot have the 'abstract' modifier.", 'abstract #x']],
			throws: "Private elements cannot have the 'abstract' modifier. (1:19)",
			pick: first_member,
			match: { abstract: true, key: { type: 'PrivateIdentifier', name: 'x' } },
		},
		{
			source: 'interface I { private x: number }',
			errors: [["'private' modifier cannot appear on a type member.", 'private x']],
			throws: "'private' modifier cannot appear on a type member. (1:14)",
			pick: interface_member,
			match: { type: 'TSPropertySignature', accessibility: 'private', key: { name: 'x' } },
		},
		{
			source: 'type T = { static m(): void };',
			errors: [["'static' modifier cannot appear on a type member.", 'static m']],
			throws: "'static' modifier cannot appear on a type member. (1:11)",
			pick: (program) =>
				as_type(
					as_type(/** @type {AST.Node} */ (first(program)), 'TSTypeAliasDeclaration')
						.typeAnnotation,
					'TSTypeLiteral',
				).members[0],
			match: { type: 'TSMethodSignature', static: true, key: { name: 'm' } },
		},
		{
			source: 'interface I {\n\tstatic\n\tx: number;\n}',
			errors: [["'static' modifier cannot appear on a type member.", 'static\n']],
			throws: "'static' modifier cannot appear on a type member. (2:1)",
			pick: interface_member,
			match: { type: 'TSPropertySignature', static: true, key: { name: 'x' } },
		},
		{
			source: 'interface I<public T> {}',
			errors: [["'public' modifier cannot appear on a type parameter.", 'public T']],
			throws: "'public' modifier cannot appear on a type parameter. (1:12)",
			pick: first_type_parameter,
			match: { type: 'TSTypeParameter', accessibility: 'public', name: 'T' },
		},
		{
			source: 'function f<in T>() {}',
			errors: [
				[
					"'in' modifier can only appear on a type parameter of a class, interface or type alias.",
					'in T',
				],
			],
			throws:
				"'in' modifier can only appear on a type parameter of a class, interface or type alias. (1:11)",
			valid: 'interface I<in T> {}',
			pick: first_type_parameter,
		},
		{
			source: 'class A { out x = 1; }',
			errors: [
				[
					"'out' modifier can only appear on a type parameter of a class, interface or type alias.",
					'out x',
				],
			],
			throws:
				"'out' modifier can only appear on a type parameter of a class, interface or type alias. (1:10)",
			pick: first_member,
			match: { type: 'PropertyDefinition', out: true, key: { name: 'x' } },
		},
		{
			source: 'function f({ a }?: { a: number }) {}',
			errors: [
				[
					'A binding pattern parameter cannot be optional in an implementation signature.',
					'{ a }?',
				],
			],
			throws:
				'A binding pattern parameter cannot be optional in an implementation signature. (1:11)',
			valid: 'declare function f({ a }?: { a: number }): void;',
			pick: first_parameter,
		},
		{
			source: 'const o = { m([a]?: number[]) {} };',
			errors: [
				['A binding pattern parameter cannot be optional in an implementation signature.', '[a]?'],
			],
			throws:
				'A binding pattern parameter cannot be optional in an implementation signature. (1:14)',
			valid: 'declare function m([a]?: number[]): void;',
			pick: (program) =>
				as_type(
					/** @type {AST.Property} */ (
						as_type(
							as_type(/** @type {AST.Node} */ (first(program)), 'VariableDeclaration')
								.declarations[0].init,
							'ObjectExpression',
						).properties[0]
					).value,
					'FunctionExpression',
				).params[0],
			pickValid: first_parameter,
		},
		{
			source: 'export function App({ a }?: { a: number }) @{\n\t<div />\n}',
			errors: [
				[
					'A binding pattern parameter cannot be optional in an implementation signature.',
					'{ a }?',
				],
			],
			throws:
				'A binding pattern parameter cannot be optional in an implementation signature. (1:20)',
			pick: (program) =>
				as_type(
					as_type(/** @type {AST.Node} */ (first(program)), 'ExportNamedDeclaration').declaration,
					'FunctionDeclaration',
				).params[0],
			match: { type: 'ObjectPattern', optional: true },
		},
		{
			source: 'function f(...a: number[],) {}',
			errors: [['Comma is not permitted after the rest element', ',)']],
			throws: 'Comma is not permitted after the rest element (1:25)',
			valid: 'function f(...a: number[]) {}',
			pick: first,
		},
		{
			source: 'function f(...a: number[], b: string) {}',
			errors: [['Comma is not permitted after the rest element', ', b']],
			throws: 'Comma is not permitted after the rest element (1:25)',
			pick: first,
			match: { params: [{ type: 'RestElement' }, { type: 'Identifier', name: 'b' }] },
		},
		{
			source: 'const [...a, b] = c;',
			errors: [['Comma is not permitted after the rest element', ', b']],
			throws: 'Comma is not permitted after the rest element (1:11)',
			pick: first,
			match: {
				declarations: [
					{ id: { elements: [{ type: 'RestElement' }, { type: 'Identifier', name: 'b' }] } },
				],
			},
		},
		{
			source: 'function f(...a: number[], /* last */\n) {}',
			errors: [['Comma is not permitted after the rest element', ', /*']],
			throws: 'Comma is not permitted after the rest element (1:25)',
			valid: 'function f(...a: number[] /* last */\n) {}',
			pick: first,
		},
		{
			source: 'const f = (...a: number[],) => a;',
			errors: [['Comma is not permitted after the rest element', ',)']],
			throws: 'Comma is not permitted after the rest element (1:25)',
			valid: 'const f = (...a: number[]) => a;',
			pick: first,
		},
		{
			source: "import j from './a.json' with { type: 'json', type: 'x' };",
			// acorn-typescript reports it after the repeated attribute's value.
			errors: [['Duplicated key in attributes', ' };']],
			throws: 'Duplicated key in attributes (1:55)',
			pick: first,
			match: { attributes: [{ value: { value: 'json' } }, { value: { value: 'x' } }] },
		},
		{
			source: 'export { missing };',
			errors: [["Export 'missing' is not defined", 'missing }']],
			throws: "Export 'missing' is not defined (1:9)",
			valid: 'const missing = 1;\nexport { missing };',
			pick: last,
		},
		{
			source: 'a?.b = c;',
			errors: [['Optional chaining cannot appear in left-hand side', 'a?.b']],
			throws: 'Optional chaining cannot appear in left-hand side (1:0)',
			pick: first,
			match: {
				expression: { type: 'AssignmentExpression', left: { type: 'ChainExpression' } },
			},
		},
		{
			source: 'a?.b += c;',
			errors: [['Optional chaining cannot appear in left-hand side', 'a?.b']],
			throws: 'Optional chaining cannot appear in left-hand side (1:0)',
			pick: first,
			match: {
				expression: {
					type: 'AssignmentExpression',
					operator: '+=',
					left: { type: 'ChainExpression' },
				},
			},
		},
		{
			source: "import.source('x');",
			errors: [["The only valid meta property for import is 'import.meta'", "source('x')"]],
			throws: "The only valid meta property for import is 'import.meta' (1:7)",
			pick: first,
			match: {
				expression: {
					type: 'CallExpression',
					callee: { type: 'MetaProperty', meta: { name: 'import' }, property: { name: 'source' } },
				},
			},
		},
		{
			source: 'const x = new.target;',
			errors: [["'new.target' can only be used in functions and class static block", 'new.target']],
			throws: "'new.target' can only be used in functions and class static block (1:10)",
			valid: 'function f() {\n\tconst x = new.target;\n}',
			pick: first,
			pickValid: (program) =>
				as_type(/** @type {AST.Node} */ (first(program)), 'FunctionDeclaration').body.body[0],
		},
		{
			source: 'super();',
			errors: [
				["'super' keyword outside a method", 'super'],
				['super() call outside constructor of a subclass', 'super'],
			],
			throws: "'super' keyword outside a method (1:0)",
			valid: 'class A extends B {\n\tconstructor() {\n\t\tsuper();\n\t}\n}',
			pick: first,
			pickValid: (program) =>
				as_type(/** @type {AST.Node} */ (first_member(program)), 'MethodDefinition').value.body
					?.body[0],
		},
		{
			source: 'class A {\n\tconstructor() {\n\t\tsuper();\n\t}\n}',
			errors: [['super() call outside constructor of a subclass', 'super']],
			throws: 'super() call outside constructor of a subclass (3:2)',
			valid: 'class A extends B {\n\tconstructor() {\n\t\tsuper();\n\t}\n}',
			pick: class_method_statement,
		},
		{
			source: 'namespace N {\n\tconst x = await 42;\n}',
			errors: [
				[
					"'await' expressions are only allowed within async functions and at the top levels of modules.",
					'await 42',
				],
			],
			throws: 'Cannot use await in class static initialization block (2:11)',
			valid: 'const x = await 42;',
			pick: namespace_statement,
			pickValid: first,
		},
		{
			source: 'namespace N {\n\tfor await (const x of y) {}\n}',
			errors: [
				[
					"'for await' loops are only allowed within async functions and at the top levels of modules.",
					'await (',
				],
			],
			throws: 'Unexpected token (2:5)',
			valid: 'for await (const x of y) {}',
			pick: namespace_statement,
			pickValid: first,
		},
		{
			source: 'namespace N {\n\tawait using x = y;\n}',
			errors: [
				[
					"'await using' statements are only allowed within async functions and at the top levels of modules.",
					'await using',
				],
			],
			throws: 'Await using cannot appear outside of async function (2:1)',
			valid: 'await using x = y;',
			pick: namespace_statement,
			pickValid: first,
		},
		{
			source: '#x in obj;',
			errors: [["Private field '#x' must be declared in an enclosing class", '#x in']],
			throws: 'Unexpected token (1:0)',
			valid: 'class A {\n\t#x;\n\tm() {\n\t\t#x in obj;\n\t}\n}',
			pick: first,
			pickValid: class_method_statement,
		},
		{
			source: 'obj.#x;',
			errors: [["Private field '#x' must be declared in an enclosing class", '#x;']],
			throws: "Private field '#x' must be declared in an enclosing class (1:4)",
			valid: 'class A {\n\t#x;\n\tm() {\n\t\tobj.#x;\n\t}\n}',
			pick: first,
			pickValid: class_method_statement,
		},
		{
			source: 'export const v: string;',
			errors: [["'const' declarations must be initialized.", 'v: string']],
			throws: 'Unexpected token (1:22)',
			valid: 'export declare const v: string;',
			pick: (program) =>
				as_type(
					as_type(/** @type {AST.Node} */ (first(program)), 'ExportNamedDeclaration').declaration,
					'VariableDeclaration',
				).declarations,
		},
		{
			source: 'const a = 1,\n\tb: number;',
			errors: [["'const' declarations must be initialized.", 'b: number']],
			throws: 'Unexpected token (2:10)',
			valid: 'declare const a = 1,\n\tb: number;',
			pick: (program) =>
				as_type(/** @type {AST.Node} */ (first(program)), 'VariableDeclaration').declarations,
		},
		{
			source: 'function f() {\n\texport const a = 1;\n}',
			errors: [["'import' and 'export' may only appear at the top level", 'export const']],
			throws: "'import' and 'export' may only appear at the top level (2:1)",
			valid: 'export const a = 1;',
			pick: function_statement,
			pickValid: first,
		},
		{
			source: 'function f() {\n\texport default 1;\n}',
			errors: [["'import' and 'export' may only appear at the top level", 'export default']],
			throws: "'import' and 'export' may only appear at the top level (2:1)",
			valid: 'export default 1;',
			pick: function_statement,
			pickValid: first,
		},
		{
			source: "{\n\timport a from 'a';\n}",
			errors: [["'import' and 'export' may only appear at the top level", 'import a']],
			throws: "'import' and 'export' may only appear at the top level (2:1)",
			valid: "import a from 'a';",
			pick: (program) =>
				as_type(/** @type {AST.Node} */ (first(program)), 'BlockStatement').body[0],
			pickValid: first,
		},
		{
			source: "function f() {\n\timport x = require('a');\n}",
			errors: [["'import' and 'export' may only appear at the top level", 'import x']],
			throws: "'import' and 'export' may only appear at the top level (2:1)",
			valid: "import x = require('a');",
			pick: function_statement,
			pickValid: first,
		},
		{
			source: "export function App() @{\n\timport a from 'a';\n\t<div>{a}</div>\n}",
			errors: [["'import' and 'export' may only appear at the top level", 'import a']],
			throws: "'import' and 'export' may only appear at the top level (2:1)",
		},
		{
			source: 'function f() {\n\tconst\n}',
			// Right after `const`, as TypeScript reports it.
			errors: [['Variable declaration list cannot be empty.', '\n}']],
			throws: 'Unexpected token (3:0)',
			pick: function_statement,
			match: { type: 'VariableDeclaration', kind: 'const', declarations: [] },
		},
		{
			source: 'var;',
			errors: [['Variable declaration list cannot be empty.', ';']],
			throws: 'Unexpected token (1:3)',
			pick: first,
			match: { type: 'VariableDeclaration', kind: 'var', declarations: [] },
		},
		{
			source: 'function f() {\n\tconst\n\treturn 1;\n}',
			errors: [['Variable declaration list cannot be empty.', '\n\treturn']],
			throws: "Unexpected keyword 'return' (3:1)",
			pick: (program) => ({ statements: function_statements(program) }),
			match: {
				statements: [
					{ type: 'VariableDeclaration', kind: 'const', declarations: [] },
					{ type: 'ReturnStatement' },
				],
			},
		},
		{
			source: 'export function App() @{\n\tconst\n\t<div />\n}',
			errors: [['Variable declaration list cannot be empty.', '\n\t<div']],
			throws: 'Unexpected token (3:1)',
		},
		{
			source: 'function f() {\n\tlet\n}',
			errors: [["The keyword 'let' is reserved", 'let']],
			throws: "The keyword 'let' is reserved (2:1)",
			pick: function_statement,
			match: { type: 'ExpressionStatement', expression: { type: 'Identifier', name: 'let' } },
		},
	];

	/** @type {Array<ParseOptions>} */
	const collect_modes = [{ collect: true, preserveParens: true }, { loose: true }];

	/**
	 * A node without its locations.
	 * @param {unknown} node
	 */
	function without_locations(node) {
		return JSON.parse(
			JSON.stringify(node, (key, value) =>
				key === 'start' ||
				key === 'end' ||
				key === 'loc' ||
				key === 'range' ||
				key === 'metadata' ||
				key === 'extra'
					? undefined
					: typeof value === 'bigint'
						? `${value}n`
						: value,
			),
		);
	}

	it('records them and keeps parsing in collect and loose mode', async () => {
		const inputs = cases.flatMap(({ source }) =>
			collect_modes.map((options) => ({ source, options })),
		);
		const valid_inputs = cases.flatMap(({ valid }) =>
			valid ? collect_modes.map((options) => ({ source: valid, options })) : [],
		);
		const outcomes = await parse_in_worker_with_ast([...inputs, ...valid_inputs]);
		const valid_outcomes = outcomes.slice(inputs.length);

		for (const [index, { source, options }] of inputs.entries()) {
			const test_case = cases[Math.floor(index / collect_modes.length)];
			const outcome = outcomes[index];
			const label = `${JSON.stringify(source)} with ${JSON.stringify(options)}`;
			if (!outcome.ok) throw new Error(`${label} threw ${outcome.message}`);
			expect(
				outcome.errors?.map(({ message, pos }, i) => [
					message,
					source.slice(pos, (pos ?? 0) + (test_case.errors[i]?.[1].length ?? 0)),
				]),
				label,
			).toEqual(test_case.errors);

			const node = test_case.pick?.(outcome.ast);
			if (test_case.match) {
				expect(node, label).toMatchObject(test_case.match);
			}
			if (test_case.valid) {
				const valid_outcome = valid_outcomes.shift();
				if (!valid_outcome?.ok) throw new Error(`${JSON.stringify(test_case.valid)} threw`);
				const valid_node = (test_case.pickValid ?? test_case.pick)?.(valid_outcome.ast);
				expect(valid_node, label).toBeDefined();
				expect(without_locations(node), label).toEqual(without_locations(valid_node));
			}
		}
	});

	it('still throws them without collecting', async () => {
		const outcomes = await parse_in_worker(cases.map(({ source }) => ({ source })));

		expect(outcomes.map((outcome) => (outcome.ok ? 'parsed' : outcome.message))).toEqual(
			cases.map(({ throws }) => throws),
		);
	});

	it('compares them with valid code', async () => {
		const sources = cases.flatMap(({ valid }) => (valid ? [valid] : []));
		const outcomes = await parse_in_worker(sources.map((source) => ({ source })));

		expect(outcomes).toEqual(sources.map(() => ({ ok: true, errors: undefined })));
	});

	it('still throws input that only TypeScript error recovery accepts', async () => {
		const sources = [
			'type B = {\n\t[a: string, b: string]: string;\n};',
			'let a: *;',
			'function b(x: ?) {}',
			'let c: ?string;',
			'let d: string?;',
			'let f: !string;',
			'let g: string!;',
			// TypeScript's parser reads a declarator here, or expects one.
			'const 1;',
			'const if (a) {}',
			'var\n#x;',
			'export function App() @{ const <div /> }',
		];
		const modes = [undefined, ...collect_modes];
		const inputs = sources.flatMap((source) => modes.map((options) => ({ source, options })));

		const outcomes = await parse_in_worker(inputs);

		for (const [index, outcome] of outcomes.entries()) {
			expect(outcome.ok, JSON.stringify(inputs[index])).toBe(false);
		}
	});

	it('records no error where TypeScript reports none', async () => {
		const sources = [
			// A rest parameter may have a trailing comma in an ambient context.
			'declare function f(...a: number[],): void;',
			'declare function g(...a: number[],\n\t// last\n): void;',
			'declare const v: string;',
			'for (const x of y) {}',
			'class A {\n\t#x;\n\tm() {\n\t\treturn #x in this;\n\t}\n}',
			'async function f() {\n\tnamespace N {}\n\tawait g();\n}',
			// A declarator on the line after `const`.
			'const\n\t[a] = b;',
			// An overload signature may have an optional binding pattern.
			'function f({ a }?: { a: number }): void;\nfunction f(options?: { a: number }) {}',
			'namespace N {\n\texport const a = 1;\n}',
		];
		const outcomes = await parse_in_worker(
			sources.flatMap((source) => collect_modes.map((options) => ({ source, options }))),
		);

		expect(outcomes).toEqual(
			sources.flatMap(() => collect_modes.map(() => ({ ok: true, errors: [] }))),
		);
	});

	it('records an empty declaration list with no width, right after its keyword', async () => {
		/** @type {Array<[source: string, keyword_end: number]>} */
		const cases = [
			['function f() {\n\tconst\n}', 21],
			['var /* none */;', 3],
			['const', 5],
		];
		const outcomes = await parse_in_worker_with_ast(
			cases.map(([source]) => ({ source, options: collect_modes[0] })),
		);

		expect(outcomes.map((outcome) => (outcome.ok ? outcome.errors : outcome.message))).toEqual(
			cases.map(([, keyword_end]) => [
				{
					message: 'Variable declaration list cannot be empty.',
					pos: keyword_end,
					end: keyword_end,
				},
			]),
		);
	});

	it('still throws a const pattern without an initializer', async () => {
		const outcomes = await parse_in_worker(
			[undefined, ...collect_modes].map((options) => ({ source: 'const { a };', options })),
		);

		expect(outcomes).toEqual(
			[undefined, ...collect_modes].map(() => ({
				ok: false,
				message: 'Unexpected token (1:11)',
				pos: 11,
			})),
		);
	});
});

describe('JSX whitespace in template text', () => {
	const modes = [undefined, { collect: true, preserveParens: true }, { loose: true }];

	/**
	 * The children of the first `<div>` or fragment: each text by its value,
	 * each element by its tag.
	 *
	 * @param {unknown} ast
	 * @returns {string[]}
	 */
	function children(ast) {
		const container = find_first(
			ast,
			(node) =>
				node.type === 'JSXFragment' ||
				(node.type === 'JSXElement' &&
					/** @type {AST.TSRXJSXElement} */ (node).openingElement.name.type === 'JSXIdentifier' &&
					/** @type {{ name: string }} */ (
						/** @type {AST.TSRXJSXElement} */ (node).openingElement.name
					).name === 'div'),
		);
		return node_children(/** @type {AST.Node} */ (container)).map((child) =>
			child.type === 'JSXText'
				? child.value
				: child.type === 'JSXElement'
					? `<${/** @type {{ name: string }} */ (child.openingElement.name).name}>`
					: child.type,
		);
	}

	/** @type {Array<[string, string, string[]]>} */
	const cases = [
		// The text after a closing tag starts at the tag, so a space there stays
		// in it whatever the closed element's body ends with (#442)
		[
			'a space after a closing tag whose body ends in a line break',
			'export function App() @{\n\t<div>\n\t\t<span>\n\t\t\t<b>1</b>\n\t\t</span> 2\n\t</div>\n}',
			['<span>', ' 2\n\t'],
		],
		[
			'the same in a fragment',
			'export function App() @{\n\t<>\n\t\t<span>\n\t\t\t<b>1</b>\n\t\t</span> 2\n\t</>\n}',
			['<span>', ' 2\n\t'],
		],
		// As after a self-closing tag, the text keeps the line break that JSX
		// trims as layout
		[
			'text on the line after a closing tag',
			'<div>\n\t<b>1</b>\n\ttwo\n</div>;',
			['<b>', '\n\ttwo\n'],
		],
		[
			'text on the line after a self-closing tag',
			'<div>\n\t<b />\n\ttwo\n</div>;',
			['<b>', '\n\ttwo\n'],
		],
		// A comment adds nothing to the text: the whitespace on its two sides is
		// one run, layout when it has a line break (#540)
		[
			'a block comment on the line after a closing tag',
			'<div>\n\t<b>t</b>\n\t/* c */ <i />\n</div>;',
			['<b>', '<i>'],
		],
		[
			'a block comment on the line after a self-closing tag',
			'<div>\n\t<b />\n\t/* c */ <i />\n</div>;',
			['<b>', '<i>'],
		],
		[
			'a line comment after a closing tag',
			'<div>\n\t<b>t</b> // c\n\t<i />\n</div>;',
			['<b>', '<i>'],
		],
		[
			'a block comment between children on one line',
			'<div><b>t</b> /* c */ <i /></div>;',
			['<b>', '  ', '<i>'],
		],
		// JSX whitespace is ASCII: a non-breaking space is text (#444)
		[
			'a non-breaking space at the start of a line',
			'<div>\n\t\u00a0<b>x</b>\n</div>;',
			['\n\t\u00a0', '<b>'],
		],
		[
			'a non-breaking space on its own line',
			'<div>\n\t<b>x</b>\n\t\u00a0\n</div>;',
			['<b>', '\n\t\u00a0\n'],
		],
		[
			'a non-breaking space between children',
			'<div><b>x</b>\u00a0<i /></div>;',
			['<b>', '\u00a0', '<i>'],
		],
		['a tab on its own line', '<div>\n\t<b>x</b>\n\t\t\n</div>;', ['<b>']],
	];

	it.each(cases)('reads %s like JSX', async (_label, source, expected) => {
		const outcomes = await parse_in_worker_with_ast(modes.map((options) => ({ source, options })));

		for (const [index, outcome] of outcomes.entries()) {
			const label = `${JSON.stringify(source)} with ${JSON.stringify(modes[index])}`;
			if (!outcome.ok) throw new Error(`${label} threw ${outcome.message}`);
			expect(outcome.errors ?? [], label).toEqual([]);
			expect(children(outcome.ast), label).toEqual(expected);
		}
	});
});

describe('an at-sign construct after `export` (#607)', () => {
	/** @type {Array<ParseOptions | undefined>} */
	const modes = [undefined, { collect: true }, { loose: true }];

	// acorn-typescript takes every `@` after `export` for decorators, and the
	// construct was parsed as a statement whose `id` the parser then read.
	it('reports it like another token that starts no declaration, instead of crashing', async () => {
		/** @type {Array<[source: string, message: string, at: string]>} */
		const cases = [
			['export @if (a) { <div /> };', 'Unexpected token', '@'],
			['export @{ <div /> };', 'Unexpected token', '@'],
			['export @for (const a of b) { <div /> }', 'Unexpected token', '@'],
			['export @switch (a) { @case 1: { <div /> } }', 'Unexpected token', '@'],
			['export @try { <div /> } @catch (e) { <b /> }', 'Unexpected token', '@'],
			['export foo;', 'Unexpected token', 'foo'],
			[
				'export declare @if (a) { <div /> }',
				"'export declare' must be followed by an ambient declaration.",
				'@',
			],
		];
		const outcomes = await parse_in_worker(
			cases.flatMap(([source]) => modes.map((options) => ({ source, options }))),
		);
		expect(outcomes).toEqual(
			cases.flatMap(([source, message, at]) => {
				const pos = source.indexOf(at);
				const { line, column } = acorn.getLineInfo(source, pos);
				return modes.map(() => ({ ok: false, message: `${message} (${line}:${column})`, pos }));
			}),
		);
	});

	it('still exports a decorated class, and a default at-sign construct', async () => {
		const sources = ['export @dec class A {}', 'export default @if (a) { <div /> };'];
		const outcomes = await parse_in_worker_with_ast(
			sources.flatMap((source) => modes.map((options) => ({ source, options }))),
		);
		expect(
			outcomes.map((outcome) => {
				if (!outcome.ok) return outcome.message;
				const [statement] = outcome.ast.body;
				return [
					...(outcome.errors ?? []).map((error) => error.message),
					/** @type {any} */ (statement).declaration.type,
				];
			}),
		).toEqual(
			[['ClassDeclaration'], ['JSXIfExpression']].flatMap((expected) => modes.map(() => expected)),
		);
	});
});

describe('`const` type parameters on an object method (#631)', () => {
	/** @type {Array<ParseOptions | undefined>} */
	const modes = [undefined, { collect: true }, { loose: true }];

	it('reads them like those of an async method, a class method, or a function', async () => {
		const sources = [
			'const o = { m<const T>(x: T) { return x; } };',
			'const o = { m<T, const U extends readonly unknown[]>(x: T, y: U) {} };',
			'const o = { m\n  <const T>(x: T) {} };',
			'const o = { async m<const T>(x: T) { return x; } };',
			'class A { m<const T>(x: T) { return x; } }',
		];
		const outcomes = await parse_in_worker_with_ast(
			sources.flatMap((source) => modes.map((options) => ({ source, options }))),
		);
		expect(
			outcomes.map((outcome) => {
				if (!outcome.ok) return outcome.message;
				const parameters = /** @type {any} */ (
					find_first(outcome.ast, (node) => node.type === 'TSTypeParameterDeclaration')
				).params;
				return [
					...(outcome.errors ?? []).map((error) => error.message),
					parameters.map((/** @type {any} */ parameter) => Boolean(parameter.const)),
				];
			}),
		).toEqual(
			[[[true]], [[false, true]], [[true]], [[true]], [[true]]].flatMap((expected) =>
				modes.map(() => expected),
			),
		);
	});

	it('still reports `in` and `out` there, as for a function', async () => {
		const source = 'const o = { m<in T>(x: T) {} };';
		const message =
			"'in' modifier can only appear on a type parameter of a class, interface or type alias.";
		const outcomes = await parse_in_worker(modes.map((options) => ({ source, options })));
		expect(outcomes).toEqual([
			{ ok: false, message: `${message} (1:14)`, pos: 14 },
			{ ok: true, errors: [message] },
			{ ok: true, errors: [message] },
		]);
	});
});
