import type { Rule } from 'eslint';
// `builtinRules` is marked deprecated, but it is the only way to reach a core
// rule; typescript-eslint loads the rules its extension rules wrap the same way.
import { builtinRules } from 'eslint/use-at-your-own-risk';

/**
 * An ESLint core rule, for a TSRX rule that wraps it.
 */
export function get_core_rule(name: string): Rule.RuleModule {
	const rule = builtinRules.get(name);
	if (!rule) {
		throw new Error(`ESLint has no core rule named '${name}'.`);
	}
	return rule;
}

/**
 * The core rule's meta, with the TSRX rule's description. No wrapper is in the
 * `recommended` configuration: `tsrx.configs.js` swaps them in.
 */
export function wrapper_meta(core: Rule.RuleModule, description: string): Rule.RuleMetaData {
	return { ...core.meta, docs: { ...core.meta?.docs, description, recommended: false } };
}

/**
 * The rule context, with its `report` replaced.
 */
export function with_report(
	context: Rule.RuleContext,
	report: (descriptor: Rule.ReportDescriptor) => void,
): Rule.RuleContext {
	return Object.create(context, { report: { value: report } });
}

/**
 * Both rules' listeners, the first's running first where both listen to an
 * event.
 */
export function merge_listeners(
	first: Rule.RuleListener,
	second: Record<string, (...args: any[]) => void>,
): Rule.RuleListener {
	const merged: Record<string, any> = { ...first };
	for (const [key, listener] of Object.entries(second)) {
		const existing = (first as Record<string, any>)[key];
		merged[key] = existing
			? (...args: any[]) => {
					existing(...args);
					listener(...args);
				}
			: listener;
	}
	return merged;
}
