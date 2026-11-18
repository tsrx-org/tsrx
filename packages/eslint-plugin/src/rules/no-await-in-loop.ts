import type { Rule } from 'eslint';
import { get_core_rule, merge_listeners, with_report, wrapper_meta } from '../utils/core-rule.js';

const core = get_core_rule('no-await-in-loop');

const FUNCTION_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
]);

/**
 * Core `no-await-in-loop`, which also reports an `await` in a `@for` key: the
 * key runs once per item, as the body does.
 */
const rule: Rule.RuleModule = {
	meta: wrapper_meta(core, 'Disallow `await` inside of loops, including the key of a `@for` loop'),
	create(context) {
		const reported = new Set<unknown>();
		const listeners = core.create(
			with_report(context, (descriptor) => {
				reported.add((descriptor as { node?: Rule.Node }).node);
				context.report(descriptor);
			}),
		);
		return merge_listeners(listeners, {
			AwaitExpression(node: Rule.Node) {
				if (!reported.has(node) && is_in_for_key(node)) {
					context.report({ node, messageId: 'unexpectedAwait' });
				}
			},
		});
	},
};

function is_in_for_key(node: Rule.Node): boolean {
	for (
		let child = node, parent = node.parent;
		parent && !FUNCTION_TYPES.has(parent.type);
		child = parent, parent = parent.parent
	) {
		if (parent.type === ('JSXForExpression' as string) && (parent as any).key === child) {
			return true;
		}
	}
	return false;
}

export default rule;
