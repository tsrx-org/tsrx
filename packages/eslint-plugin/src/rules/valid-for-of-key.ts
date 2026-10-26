import type { Rule } from 'eslint';
import type * as AST from '@tsrx/core/types/estree';

const rule: Rule.RuleModule = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Ensure variables used in for..of key expression are defined',
			recommended: true,
		},
		messages: {
			undefinedVariable: "Variable '{{name}}' is not defined.",
		},
		schema: [],
	},
	create(context) {
		const checkForOfKey = (node: AST.ForOfStatement | AST.JSXForExpression) => {
			const key = node.key;
			if (!key) {
				return;
			}

			const [start, end] = key.range!;
			for (const reference of context.sourceCode.getScope(node).through) {
				const identifier = reference.identifier as Rule.Node & AST.Identifier;
				const [identifier_start, identifier_end] = identifier.range!;
				if (reference.resolved || identifier_start < start || identifier_end > end) {
					continue;
				}

				// ESLint's scope analysis does not know the loop's `index` binding.
				if (identifier.name === node.index?.name) {
					continue;
				}

				if (is_type_name(identifier, node)) {
					continue;
				}

				context.report({
					node: identifier,
					messageId: 'undefinedVariable',
					data: {
						name: identifier.name,
					},
				});
			}
		};

		// `@for (... ; key X)` loops parse to `JSXForExpression`, while the bare
		// `for (... ; key X)` form parses to `ForOfStatement`. Both carry the same
		// `key` shape, so validate either node type.
		return {
			ForOfStatement: checkForOfKey,
			JSXForExpression: checkForOfKey,
		};
	},
};

// TypeScript nodes that hold a value; every other TypeScript node is a type.
const TS_EXPRESSIONS = new Set([
	'TSAsExpression',
	'TSSatisfiesExpression',
	'TSNonNullExpression',
	'TSInstantiationExpression',
]);

/**
 * Whether the identifier names a type, as `Foo` does in `key item as Foo`.
 * ESLint's scope analysis reports a type declared in the file as unresolved.
 */
function is_type_name(identifier: Rule.Node, loop: AST.Node): boolean {
	for (let node = identifier.parent; node && node !== loop; node = node.parent) {
		if (node.type.startsWith('TS') && !TS_EXPRESSIONS.has(node.type)) {
			return true;
		}
	}
	return false;
}

export default rule;
