import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';
import { evaluate_expression, evaluate_truthiness } from '../../src/optimize/evaluate.js';
import { create_constant_resolver } from '../../src/optimize/constants.js';
import { optimize_tsrx } from '../../src/optimize/index.js';

/** @import * as AST from 'estree' */

/**
 * The initializer of `const <name> = …` anywhere in a program.
 *
 * @param {AST.Node} ast
 * @param {string} name
 * @returns {any}
 */
function initializer(ast, name) {
	/** @type {any} */
	let found = null;

	/** @param {any} node */
	function visit(node) {
		if (!node || typeof node !== 'object' || found) return;

		if (
			node.type === 'VariableDeclarator' &&
			node.id?.type === 'Identifier' &&
			node.id.name === name
		) {
			found = node.init ?? null;
			return;
		}

		for (const key of Object.keys(node)) {
			const child = node[key];
			if (Array.isArray(child)) child.forEach(visit);
			else if (child && typeof child === 'object') visit(child);
		}
	}

	visit(ast);
	return found;
}

/**
 * Evaluate a standalone expression with no bindings in play.
 *
 * @param {string} source
 * @returns {{ value: unknown } | null}
 */
function evaluate(source) {
	const ast = parseModule(`const value = ${source};`, 'App.tsrx');
	return evaluate_expression(initializer(ast, 'value'), () => null);
}

/**
 * Read the truthiness of a standalone expression.
 *
 * @param {string} source
 * @returns {{ truthy: boolean, nullish: boolean, pure: boolean } | null}
 */
function truthiness(source) {
	const ast = parseModule(`const value = ${source};`, 'App.tsrx');
	return evaluate_truthiness(initializer(ast, 'value'), () => null);
}

/**
 * Resolve a named constant the way the pass does when deciding a test.
 *
 * @param {string} source
 * @param {string} name
 * @returns {{ value: unknown } | null}
 */
function resolved(source, name) {
	const ast = parseModule(source, 'App.tsrx');
	const resolve = create_constant_resolver(ast, 'App.tsrx');

	/** @type {any} */
	let reference = null;

	/** @param {any} node */
	function visit(node) {
		if (!node || typeof node !== 'object' || reference) return;

		if (node.type === 'JSXExpressionContainer' && node.expression?.name === name) {
			reference = node.expression;
			return;
		}

		for (const key of Object.keys(node)) {
			const child = node[key];
			if (Array.isArray(child)) child.forEach(visit);
			else if (child && typeof child === 'object') visit(child);
		}
	}

	visit(ast);
	return reference ? resolve(reference) : null;
}

/**
 * Parse a module, run the pass over it, and hand back the optimized program.
 *
 * @param {string} source
 * @returns {AST.Program}
 */
function optimized(source) {
	return optimize_tsrx(parseModule(source, 'App.tsrx'), 'App.tsrx').ast;
}

describe('static evaluation', () => {
	it('evaluates arithmetic, comparison and logical operators', () => {
		expect(evaluate('2 + 3 * 4')).toEqual({ value: 14 });
		expect(evaluate('10 % 4')).toEqual({ value: 2 });
		expect(evaluate('2 ** 10')).toEqual({ value: 1024 });
		expect(evaluate("'a' === 'a'")).toEqual({ value: true });
		expect(evaluate('1 < 2 && 3 > 4')).toEqual({ value: false });
		expect(evaluate("null ?? 'fallback'")).toEqual({ value: 'fallback' });
		expect(evaluate('false || 7')).toEqual({ value: 7 });
	});

	it('evaluates unary operators', () => {
		expect(evaluate('!0')).toEqual({ value: true });
		expect(evaluate('-(2 + 3)')).toEqual({ value: -5 });
		expect(evaluate("typeof 'text'")).toEqual({ value: 'string' });
		expect(evaluate('~5')).toEqual({ value: -6 });
	});

	it('evaluates a template literal with static holes', () => {
		expect(evaluate('`a${1 + 1}b`')).toEqual({ value: 'a2b' });
	});

	it('short-circuits before reading an unknown operand', () => {
		expect(evaluate('false && missing')).toEqual({ value: false });
		expect(evaluate('true || missing')).toEqual({ value: true });
		expect(evaluate('true && missing')).toBeNull();
	});

	it('refuses values it cannot prove', () => {
		expect(evaluate('missing')).toBeNull();
		expect(evaluate('compute()')).toBeNull();
		expect(evaluate('{ a: 1 }.a')).toBeNull();
		expect(evaluate('[1, 2]')).toBeNull();
		expect(evaluate('/re/')).toBeNull();
		expect(evaluate("'text' in object")).toBeNull();
	});

	it('refuses an operation that would throw at runtime', () => {
		expect(evaluate('1n + 1')).toBeNull();
	});
});

describe('truthiness evaluation', () => {
	it('reads object-like literals as truthy', () => {
		expect(truthiness('[]')).toEqual({ truthy: true, nullish: false, pure: true });
		expect(truthiness('[compute()]')).toEqual({ truthy: true, nullish: false, pure: false });
		expect(truthiness('{}')).toEqual({ truthy: true, nullish: false, pure: true });
		expect(truthiness('() => 1')).toEqual({ truthy: true, nullish: false, pure: true });
		expect(truthiness('/re/')).toEqual({ truthy: true, nullish: false, pure: true });
	});

	it('reads values it can evaluate outright', () => {
		expect(truthiness('0')).toEqual({ truthy: false, nullish: false, pure: true });
		expect(truthiness('null')).toEqual({ truthy: false, nullish: true, pure: true });
	});

	it('refuses expressions whose truthiness is unknown', () => {
		expect(truthiness('compute()')).toBeNull();
		expect(truthiness('source.value')).toBeNull();
	});
});

describe('constant resolution', () => {
	it('resolves a chain of constants', () => {
		const value = resolved(
			`const base = 2;
			const doubled = base * 2;
			const total = doubled + 1;
			export function App() @{
				<span class="x">{total}</span>
			}`,
			'total',
		);

		expect(value).toEqual({ value: 5 });
	});

	it('refuses a reassigned binding', () => {
		const value = resolved(
			`let count = 1;
			count = 2;
			export function App() @{
				<span class="x">{count}</span>
			}`,
			'count',
		);

		expect(value).toBeNull();
	});

	it('refuses a mutated binding', () => {
		const value = resolved(
			`const config = { on: true };
			config.on = false;
			export function App() @{
				<span class="x">{config}</span>
			}`,
			'config',
		);

		expect(value).toBeNull();
	});

	it('refuses a name shadowed by an inner binding', () => {
		const value = resolved(
			`const size = 1;
			export function App({ size }) @{
				<span class="x">{size}</span>
			}`,
			'size',
		);

		expect(value).toBeNull();
	});

	it('reads the intrinsic globals', () => {
		const value = resolved(
			`export function App() @{
				<span class="x">{undefined}</span>
			}`,
			'undefined',
		);

		expect(value).toEqual({ value: undefined });
	});
});

describe('optimize pass', () => {
	it('leaves setup statements and plain JavaScript alone', () => {
		const ast = optimized(`
			const outside = 2 + 3;
			export function App() @{
				const inside = 2 + 3;
				<span class="x">{inside}</span>
			}
		`);

		expect(initializer(ast, 'outside').type).toBe('BinaryExpression');
		expect(initializer(ast, 'inside').type).toBe('BinaryExpression');
	});

	it('settles when a collapse exposes another one', () => {
		const ast = optimized(`
			export function App({ label }) @{
				@if (false) {
					<b class="dead">{label}</b>
				} @else {
					@if (true) {
						<i class="live">{label}</i>
					}
				}
			}
		`);

		const render = /** @type {any} */ (ast.body[0]).declaration.body.render;
		expect(render.type).toBe('JSXElement');
		expect(render.openingElement.name.name).toBe('i');
	});
});
