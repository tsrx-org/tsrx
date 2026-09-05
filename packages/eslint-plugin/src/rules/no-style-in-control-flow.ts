import type { Rule } from 'eslint';
import type * as AST from '@tsrx/core/types/estree';

type AnyNode = AST.Node & Record<string, any>;

const CONTROL_FLOW_TYPES = new Set([
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);

const BOUNDARY_TYPES = new Set([
	'FunctionDeclaration',
	'FunctionExpression',
	'ArrowFunctionExpression',
	'ClassDeclaration',
	'ClassExpression',
	'MethodDefinition',
	'PropertyDefinition',
]);

function is_directive_branch_body(directive: AnyNode, child: AnyNode): boolean {
	switch (directive.type) {
		case 'JSXIfExpression':
			return child === directive.consequent || child === directive.alternate;
		case 'JSXForExpression':
			return child === directive.body || child === directive.empty;
		case 'JSXSwitchExpression':
			return Array.isArray(directive.cases) && directive.cases.includes(child);
		case 'JSXTryExpression':
			return (
				child === directive.block ||
				child === directive.handler ||
				child === directive.finalizer ||
				child === directive.pending
			);
		default:
			return false;
	}
}

function is_inside_control_flow_branch(node: AnyNode): boolean {
	let child: AnyNode = node;
	let parent: AnyNode | undefined = node.parent;

	while (parent) {
		if (BOUNDARY_TYPES.has(parent.type)) {
			return false;
		}

		if (CONTROL_FLOW_TYPES.has(parent.type) && is_directive_branch_body(parent, child)) {
			return true;
		}

		child = parent;
		parent = parent.parent;
	}

	return false;
}

function style_authors_css(node: AnyNode): boolean {
	if (node.openingElement?.selfClosing && (!node.children || node.children.length === 0)) {
		return false;
	}

	return true;
}

const rule: Rule.RuleModule = {
	meta: {
		type: 'suggestion',
		docs: {
			description:
				'Forbid <style> blocks that author CSS inside @if, @for, @switch, or @try bodies.',
			recommended: false,
		},
		messages: {
			styleInControlFlow:
				'Do not put a <style> block inside an @if, @for, @switch, or @try body. CSS is emitted unconditionally; only class stamping follows the branch. Move the block outside the branch, or apply an assigned theme with <style apply={theme} />.',
		},
		schema: [],
	},
	create(context) {
		return {
			JSXStyleElement(node: AST.Node) {
				const style = node as AnyNode;
				if (!style_authors_css(style)) {
					return;
				}

				if (!is_inside_control_flow_branch(style)) {
					return;
				}

				context.report({
					node,
					messageId: 'styleInControlFlow',
				});
			},
		};
	},
};

export default rule;
