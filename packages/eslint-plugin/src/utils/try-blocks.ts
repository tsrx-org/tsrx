import type { Rule } from 'eslint';

const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);

/**
 * Whether code awaits or yields outside a function, as the compiler checks a
 * `@try` body and `@pending`: a block that does runs inline in the function
 * that holds the `@try`, instead of in a callback of the `@try`'s boundaries.
 */
export function suspension_check(context: Rule.RuleContext): (node: any) => boolean {
	const visitor_keys = context.sourceCode.visitorKeys as Record<string, readonly string[]>;
	const suspends = (node: any): boolean => {
		if (!node || typeof node.type !== 'string' || FUNCTION_TYPES.has(node.type)) return false;
		if (
			node.type === 'AwaitExpression' ||
			node.type === 'YieldExpression' ||
			(node.type === 'ForOfStatement' && node.await) ||
			(node.type === 'VariableDeclaration' && node.kind === 'await using')
		) {
			return true;
		}
		// ESLint's traversal reads the keys of a type the parser doesn't list.
		const keys =
			visitor_keys[node.type] ??
			Object.keys(node).filter(
				(key) =>
					key !== 'parent' &&
					key !== 'leadingComments' &&
					key !== 'trailingComments' &&
					!key.startsWith('_'),
			);
		return keys.some((key) => {
			const value = node[key];
			return Array.isArray(value) ? value.some(suspends) : suspends(value);
		});
	};
	return suspends;
}
