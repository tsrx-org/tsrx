import type { Rule } from 'eslint';
import { get_core_rule, with_report, wrapper_meta } from '../utils/core-rule.js';

const core = get_core_rule('no-unused-vars');

/**
 * Core `no-unused-vars`. Its suggestion for an unused `@for` index deleted
 * only the name, which left `index )`: here it deletes the `; index i` clause.
 */
const rule: Rule.RuleModule = {
	meta: wrapper_meta(
		core,
		'Disallow unused variables, with a suggestion that removes an unused `@for` index clause',
	),
	create(context) {
		return core.create(
			with_report(context, (descriptor) => {
				const node = (descriptor as { node?: Rule.Node }).node;
				const parent = node?.parent as (Rule.Node & { index?: unknown }) | undefined;
				if (!node || parent?.type !== ('JSXForExpression' as string) || parent.index !== node) {
					context.report(descriptor);
					return;
				}
				context.report({
					...descriptor,
					suggest: descriptor.suggest?.map((suggestion) => ({
						...suggestion,
						fix: (fixer) => remove_index_clause(context.sourceCode, fixer, node),
					})),
				});
			}),
		);
	},
};

/**
 * Removes `; index i`, from the `;` before `index` to the end of the name.
 */
function remove_index_clause(
	source_code: Rule.RuleContext['sourceCode'],
	fixer: Rule.RuleFixer,
	index: Rule.Node,
): Rule.Fix | null {
	const keyword = source_code.getTokenBefore(index);
	const semicolon = keyword && source_code.getTokenBefore(keyword);
	if (keyword?.value !== 'index' || semicolon?.value !== ';') {
		return null;
	}
	return fixer.removeRange([semicolon.range[0], index.range![1]]);
}

export default rule;
