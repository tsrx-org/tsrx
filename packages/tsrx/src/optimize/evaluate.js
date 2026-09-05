/** @import * as AST from 'estree' */
/** @import { StaticValue, StaticValueResult, ResolveStaticIdentifier } from '../../types/index' */

import { is_transparent_expression_wrapper } from '../utils/ast.js';
import * as b from '../utils/builders.js';

/**
 * Compile-time evaluation of expressions with no side effects.
 * The optimizer reads values with this to decide a TSRX directive test.
 * Nothing here rewrites code.
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
 * Reports what a test position can tell about an expression the pass cannot
 * evaluate to a value.
 * An array, object, function, or regex literal is always truthy and non-nullish.
 * `pure` says whether evaluating the expression can be skipped.
 * An impure test still has to run, so callers keep it in a sequence.
 * Returns `null` when truthiness is not decidable.
 *
 * @param {AST.Node | null | undefined} node
 * @param {ResolveStaticIdentifier} resolve
 * @returns {{ truthy: boolean, nullish: boolean, pure: boolean } | null}
 */
export function evaluate_truthiness(node, resolve) {
	if (!node || typeof node !== 'object') return null;

	const evaluated = evaluate_expression(node, resolve);
	if (evaluated) {
		return {
			truthy: !!evaluated.value,
			nullish: evaluated.value == null,
			pure: true,
		};
	}

	const expression = unwrap_expression(node);

	switch (expression.type) {
		case 'ArrayExpression':
			return { truthy: true, nullish: false, pure: expression.elements.length === 0 };
		case 'ObjectExpression':
			return { truthy: true, nullish: false, pure: expression.properties.length === 0 };
		case 'FunctionExpression':
		case 'ArrowFunctionExpression':
			return { truthy: true, nullish: false, pure: true };
		case 'Literal':
			// A regex literal is the one literal `evaluate_expression` refuses.
			// It is an object, so it is always truthy.
			return /** @type {{ regex?: unknown }} */ (expression).regex
				? { truthy: true, nullish: false, pure: true }
				: null;
		default:
			return null;
	}
}
