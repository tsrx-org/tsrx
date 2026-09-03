import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/index.js';
import { evaluate_expression, value_to_node } from '../../src/optimize/evaluate.js';
import { optimize_tsrx } from '../../src/optimize/index.js';

/** @import * as AST from 'estree' */

/**
 * Parse a module, run the pass over it, and hand back the optimized program.
 *
 * @param {string} source
 * @returns {AST.Program}
 */
function optimized(source) {
	return optimize_tsrx(parseModule(source, 'App.tsrx'), 'App.tsrx').ast;
}

/**
 * The single expression of `const <name> = …` anywhere in a program.
 *
 * @param {AST.Program} ast
 * @param {string} name
 * @returns {AST.Node | null}
 */
function initializer(ast, name) {
	/** @type {AST.Node | null} */
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
	return evaluate_expression(/** @type {AST.Expression} */ (initializer(ast, 'value')), () => null);
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

	it('reads the intrinsic globals', () => {
		const ast = optimized(`export const flag = undefined === undefined;`);
		expect(/** @type {any} */ (initializer(ast, 'flag')).value).toBe(true);
	});
});

describe('value materialization', () => {
	it('builds a literal for every representable value', () => {
		expect(value_to_node('text')).toMatchObject({ type: 'Literal', value: 'text' });
		expect(value_to_node(true)).toMatchObject({ type: 'Literal', value: true });
		expect(value_to_node(null)).toMatchObject({ type: 'Literal', value: null });
		expect(value_to_node(-3)).toMatchObject({ type: 'UnaryExpression', operator: '-' });
		expect(value_to_node(undefined)).toMatchObject({ type: 'UnaryExpression', operator: 'void' });
	});

	it('refuses values with no literal form', () => {
		expect(value_to_node(NaN)).toBeNull();
		expect(value_to_node(Infinity)).toBeNull();
		expect(value_to_node(-0)).toBeNull();
	});
});

describe('optimize pass', () => {
	it('propagates a constant through a chain of constants', () => {
		const ast = optimized(`
			const base = 2;
			const doubled = base * 2;
			export const total = doubled + 1;
		`);

		expect(/** @type {any} */ (initializer(ast, 'total')).value).toBe(5);
	});

	it('leaves a reassigned binding alone', () => {
		const ast = optimized(`
			let count = 1;
			count = 2;
			export const total = count + 1;
		`);

		expect(/** @type {any} */ (initializer(ast, 'total')).type).toBe('BinaryExpression');
	});

	it('leaves a mutated binding alone', () => {
		const ast = optimized(`
			const config = { on: true };
			config.on = false;
			export const state = config;
		`);

		expect(/** @type {any} */ (initializer(ast, 'state')).type).toBe('Identifier');
	});

	it('does not fold a shadowing declaration in an inner scope', () => {
		const ast = optimized(`
			const size = 1;
			export function read(size) {
				return size + 1;
			}
			export const outer = size + 1;
		`);

		expect(/** @type {any} */ (initializer(ast, 'outer')).value).toBe(2);

		const read = /** @type {any} */ (
			ast.body.find((statement) => /** @type {any} */ (statement).declaration?.id?.name === 'read')
		);
		expect(read.declaration.body.body[0].argument.type).toBe('BinaryExpression');
	});

	it('keeps a shorthand property intact', () => {
		const ast = optimized(`
			const x = 1;
			export const wrapper = { x };
		`);

		const property = /** @type {any} */ (initializer(ast, 'wrapper')).properties[0];
		expect(property.shorthand).toBe(true);
		expect(property.key.type).toBe('Identifier');
	});

	it('does not fold a non-computed member property', () => {
		const ast = optimized(`
			const key = 1;
			export const read = source.key;
		`);

		expect(/** @type {any} */ (initializer(ast, 'read')).property.type).toBe('Identifier');
	});

	it('settles even when a fold exposes another one', () => {
		const ast = optimized(`
			const a = 1;
			const b = a + 1;
			const c = b + 1;
			const d = c + 1;
			export const total = d + 1;
		`);

		expect(/** @type {any} */ (initializer(ast, 'total')).value).toBe(5);
	});
});
