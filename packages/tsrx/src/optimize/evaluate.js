/** @import * as AST from 'estree' */
/** @import { StaticValue, StaticValueResult, ResolveStaticIdentifier } from '../../types/index' */

import { is_transparent_expression_wrapper } from '../utils/ast.js';
import * as b from '../utils/builders.js';

/**
 * Compile-time evaluation of expressions with no side effects.
 * An expression is evaluated only when every operand is already known.
 * That way folding never reorders evaluation or drops a side effect.
 * Anything else returns `null`, which callers read as "leave this node alone".
 */

/**
 * Values the optimizer will carry through a fold.
 * Objects, arrays, functions and symbols are excluded.
 * They have identity, so reusing one across two references would show up.
 *
 * @param {unknown} value
 * @returns {value is StaticValue}
 */
export function is_static_value(value) {
	if (value === null || value === undefined) return true;
	const type = typeof value;
	return type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint';
}

/**
 * Strips parenthesis and type-only wrappers.
 * This lets folding see through `(x)`, `x as const`, and `x!`.
 *
 * @param {AST.Node} node
 * @returns {AST.Node}
 */
export function unwrap_expression(node) {
	let current = node;

	while (true) {
		const inner = /** @type {{ expression?: AST.Node }} */ (current).expression;
		if (inner && is_transparent_expression_wrapper(current, inner)) {
			current = inner;
			continue;
		}
		return current;
	}
}

/**
 * @param {string} operator
 * @param {StaticValue} value
 * @returns {StaticValueResult}
 */
function evaluate_unary(operator, value) {
	switch (operator) {
		case '!':
			return { value: !value };
		case '-':
			return { value: /** @type {never} */ (-(/** @type {number} */ (value))) };
		case '+':
			// `+1n` throws at runtime.
			// Folding it would turn a TypeError into a value.
			return typeof value === 'bigint' ? null : { value: +(/** @type {number} */ (value)) };
		case '~':
			return { value: /** @type {never} */ (~(/** @type {number} */ (value))) };
		case 'typeof':
			return { value: typeof value };
		case 'void':
			return { value: undefined };
		default:
			// `delete` is a side effect, so it is never folded.
			return null;
	}
}

/**
 * @param {string} operator
 * @param {any} left
 * @param {any} right
 * @returns {StaticValueResult}
 */
function evaluate_binary(operator, left, right) {
	switch (operator) {
		case '+':
			return { value: left + right };
		case '-':
			return { value: left - right };
		case '*':
			return { value: left * right };
		case '/':
			return { value: left / right };
		case '%':
			return { value: left % right };
		case '**':
			return { value: left ** right };
		case '==':
			return { value: left == right };
		case '!=':
			return { value: left != right };
		case '===':
			return { value: left === right };
		case '!==':
			return { value: left !== right };
		case '<':
			return { value: left < right };
		case '<=':
			return { value: left <= right };
		case '>':
			return { value: left > right };
		case '>=':
			return { value: left >= right };
		case '&':
			return { value: left & right };
		case '|':
			return { value: left | right };
		case '^':
			return { value: left ^ right };
		case '<<':
			return { value: left << right };
		case '>>':
			return { value: left >> right };
		case '>>>':
			return { value: left >>> right };
		default:
			// `in` and `instanceof` need a real object on the right at runtime.
			return null;
	}
}

/**
 * Evaluates an expression at compile time.
 * Returns `null` when the value cannot be known.
 *
 * @param {AST.Node | null | undefined} node
 * @param {ResolveStaticIdentifier} resolve
 * @returns {StaticValueResult}
 */
export function evaluate_expression(node, resolve) {
	if (!node || typeof node !== 'object') return null;

	const expression = unwrap_expression(node);

	switch (expression.type) {
		case 'Literal': {
			const value = expression.value;
			// A regex literal is an object with identity, so it is never folded.
			// Some parsers also keep regex payloads outside `value`.
			if (/** @type {{ regex?: unknown }} */ (expression).regex) return null;
			if (!is_static_value(value)) return null;
			return { value: /** @type {StaticValue} */ (value) };
		}

		case 'Identifier':
			return resolve(expression);

		case 'TemplateLiteral': {
			let result = '';
			for (let i = 0; i < expression.quasis.length; i += 1) {
				const cooked = expression.quasis[i]?.value.cooked;
				// An invalid escape sequence has no cooked value.
				// It is only legal in a tagged template and has no static form.
				if (cooked == null) return null;
				result += cooked;
				const value = expression.expressions[i];
				if (!value) continue;
				const evaluated = evaluate_expression(value, resolve);
				if (!evaluated) return null;
				try {
					result += `${evaluated.value}`;
				} catch {
					return null;
				}
			}
			return { value: result };
		}

		case 'UnaryExpression': {
			// `typeof unbound` stays untouched.
			// `resolve` returns `null` for a name it cannot prove constant.
			// The operand then fails to evaluate and the expression is kept.
			const argument = evaluate_expression(expression.argument, resolve);
			if (!argument) return null;
			try {
				return evaluate_unary(expression.operator, argument.value);
			} catch {
				return null;
			}
		}

		case 'BinaryExpression': {
			if (expression.left.type === 'PrivateIdentifier') return null;
			const left = evaluate_expression(expression.left, resolve);
			if (!left) return null;
			const right = evaluate_expression(expression.right, resolve);
			if (!right) return null;
			try {
				const result = evaluate_binary(expression.operator, left.value, right.value);
				return result && is_static_value(result.value) ? result : null;
			} catch {
				// Mixing `bigint` with `number` throws.
				// So does `2n ** -1n`.
				return null;
			}
		}

		case 'LogicalExpression': {
			const left = evaluate_expression(expression.left, resolve);
			if (!left) return null;

			// The right operand is read only when the left one does not decide.
			// This matches how short-circuiting works at runtime.
			switch (expression.operator) {
				case '&&':
					return left.value ? evaluate_expression(expression.right, resolve) : left;
				case '||':
					return left.value ? left : evaluate_expression(expression.right, resolve);
				case '??':
					return left.value == null ? evaluate_expression(expression.right, resolve) : left;
				default:
					return null;
			}
		}

		case 'ConditionalExpression': {
			const test = evaluate_expression(expression.test, resolve);
			if (!test) return null;
			return evaluate_expression(
				test.value ? expression.consequent : expression.alternate,
				resolve,
			);
		}

		case 'SequenceExpression': {
			// This folds only when every element is pure.
			// Otherwise the discarded expressions would lose their side effects.
			let last = null;
			for (const element of expression.expressions) {
				last = evaluate_expression(element, resolve);
				if (!last) return null;
			}
			return last;
		}

		default:
			return null;
	}
}

/**
 * Builds the smallest expression node that reproduces `value`.
 * Returns `null` when the value has no literal form.
 * `NaN` and `Infinity` would need a global reference.
 * `-0` is a signed zero the printer cannot round-trip.
 *
 * @param {StaticValue} value
 * @param {AST.NodeWithLocation} [loc_info]
 * @returns {AST.Expression | null}
 */
export function value_to_node(value, loc_info) {
	if (value === undefined) {
		return b.set_location(b.unary('void', b.literal(0, '0')), loc_info);
	}

	if (value === null) return b.literal(null, 'null', loc_info);

	switch (typeof value) {
		case 'boolean':
			return b.literal(value, String(value), loc_info);

		case 'string':
			return b.literal(value, JSON.stringify(value), loc_info);

		case 'bigint':
			return value < 0n
				? b.set_location(b.unary('-', b.literal(-value, `${-value}n`)), loc_info)
				: b.literal(value, `${value}n`, loc_info);

		case 'number': {
			if (!Number.isFinite(value) || Object.is(value, -0)) return null;
			return value < 0
				? b.set_location(b.unary('-', b.literal(-value, String(-value))), loc_info)
				: b.literal(value, String(value), loc_info);
		}

		default:
			return null;
	}
}

/**
 * Reports whether `node` already spells `value` in its shortest form.
 * Replacing such a node would churn the AST without changing the output.
 *
 * @param {AST.Node} node
 * @param {StaticValue} value
 * @returns {boolean}
 */
export function is_already_folded(node, value) {
	if (node.type === 'Literal') {
		return Object.is(node.value, value) && !(/** @type {{ regex?: unknown }} */ (node).regex);
	}

	if (
		node.type === 'UnaryExpression' &&
		node.operator === '-' &&
		node.argument.type === 'Literal' &&
		(typeof node.argument.value === 'number' || typeof node.argument.value === 'bigint')
	) {
		return Object.is(-node.argument.value, value);
	}

	if (
		node.type === 'UnaryExpression' &&
		node.operator === 'void' &&
		node.argument.type === 'Literal' &&
		node.argument.value === 0
	) {
		return value === undefined;
	}

	return false;
}
