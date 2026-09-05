/**
 * Module-level analysis of `<style>` blocks: which blocks are standalone
 * (scoped to the template scope they sit in) and which are assigned
 * (`const theme = <style>…</style>`), what every `apply` attribute resolves to,
 * and whether an assigned block is a theme (exported or applied, D5) or a
 * class map. Results are stamped on the style nodes' `metadata` so the target
 * transforms — which clone nodes but share metadata — read one shape, and are
 * summarized on `program.metadata.styles` for consumer compilers.
 *
 * Declared-before-use (D13 layer 1) is enforced here by source position and
 * lexical visibility: same-module CSS is emitted in lexical order, so a theme
 * declared after its applier would win the cascade instead of losing it.
 *
 * @import * as AST from 'estree'
 * @import * as ESTreeJSX from 'estree-jsx'
 * @import { Binding, ScopeInterface, StyleApplyResolution, StyleAnalysis, TSRXAnalysisState, Visitors } from '../../types/index'
 */

import { walk } from 'zimmerframe';
import { DIAGNOSTIC_CODES } from '../diagnostics.js';
import { get_style_class_map_names, get_style_element_stylesheet } from '../transform/style-ref.js';
import {
	is_function_node,
	is_function_or_class_node,
	is_template_directive,
} from '../utils/ast.js';
import {
	TSRX_STYLE_APPLY_DUPLICATE_ERROR,
	TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR,
	TSRX_STYLE_APPLY_VALUE_ERROR,
	TSRX_STYLE_IN_CONTROL_FLOW_ERROR,
	TSRX_STYLE_RESERVED_CLASS_KEY_ERROR,
	TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR,
	TSRX_STYLE_STANDALONE_NEEDS_FRAGMENT_ERROR,
	TSRX_STYLE_STANDALONE_OUTSIDE_TEMPLATE_ERROR,
	tsrx_style_apply_before_declaration_error,
	tsrx_style_apply_target_error,
	tsrx_style_unknown_attribute_error,
	validate_style,
} from './validation.js';

/**
 * `container_depth` counts the enclosing TSRX containers — `@{ … }` bodies
 * and control-flow directives — where raw CSS in a standalone block is
 * template syntax; native elements only bump `template_depth`.
 *
 * @typedef {{ function_depth: number, template_depth: number, container_depth: number }} StyleWalkState
 */

/**
 * Whether `child` is the body of an `@if`/`@for`/`@switch`/`@try` branch
 * (including `@else`, `@empty`, `@case`, `@catch`, `@pending`, and `@finally`).
 *
 * @param {AST.Node} directive
 * @param {AST.Node} child
 * @returns {boolean}
 */
function is_directive_branch_body(directive, child) {
	switch (directive.type) {
		case 'JSXIfExpression':
			return child === directive.consequent || child === directive.alternate;
		case 'JSXForExpression':
			return child === directive.body || child === directive.empty;
		case 'JSXSwitchExpression':
			return directive.cases.includes(child);
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

/**
 * A `<style>` whose nearest function/class boundary still has a control-flow
 * directive ancestor, reached through that directive's branch body.
 *
 * @param {AST.Node[]} path ancestors, nearest last (zimmerframe)
 * @param {AST.JSXStyleElement} node
 * @returns {boolean}
 */
function is_style_in_control_flow_branch(path, node) {
	let child = /** @type {AST.Node} */ (node);
	for (let i = path.length - 1; i >= 0; i -= 1) {
		const ancestor = path[i];
		if (is_function_or_class_node(ancestor)) return false;
		if (is_template_directive(ancestor) && is_directive_branch_body(ancestor, child)) {
			return true;
		}
		child = ancestor;
	}
	return false;
}

/**
 * A bodied `<style>` authors CSS. A self-closing `<style apply={…} />` only
 * stamps classes.
 *
 * @param {AST.JSXStyleElement} node
 * @returns {boolean}
 */
function style_authors_css(node) {
	return !node.openingElement.selfClosing || node.children.length > 0;
}

/**
 * `apply` sites resolve against ordinary JavaScript scoping, so the analyzer
 * looks the target up from the nearest enclosing scope of the style block.
 *
 * @param {AST.Node[]} path
 * @param {Map<AST.Node, ScopeInterface>} scopes
 * @returns {ScopeInterface | null}
 */
function nearest_scope(path, scopes) {
	for (let i = path.length - 1; i >= 0; i -= 1) {
		const scope = scopes.get(path[i]);
		if (scope) return scope;
	}
	return null;
}

/**
 * Names exported through `export { a, b as c }` and `export default a`.
 *
 * @param {AST.Program} ast
 * @returns {Set<string>}
 */
function collect_exported_names(ast) {
	/** @type {Set<string>} */
	const names = new Set();
	for (const statement of ast.body) {
		if (statement.type === 'ExportNamedDeclaration' && !statement.declaration) {
			for (const specifier of statement.specifiers) {
				if (specifier.local.type === 'Identifier') names.add(specifier.local.name);
			}
		} else if (
			statement.type === 'ExportDefaultDeclaration' &&
			statement.declaration.type === 'Identifier'
		) {
			names.add(statement.declaration.name);
		}
	}
	return names;
}

/**
 * A style block is standalone when it is template content rather than a value:
 * a child of a native element/fragment, the render output of a `@{ … }` body
 * or a control-flow body, or a bare statement. Only the first placement is
 * valid; the others are reported (5.1).
 *
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
export function is_standalone_style_position(path) {
	const parent = path.at(-1);
	if (!parent) return true;
	switch (parent.type) {
		case 'JSXElement':
		case 'JSXFragment':
			return !!parent.metadata?.native_tsrx;
		case 'JSXCodeBlock':
		case 'BlockStatement':
		case 'SwitchCase':
		case 'Program':
		case 'ExpressionStatement':
			return true;
		default:
			return false;
	}
}

/**
 * @param {ESTreeJSX.JSXAttributeNode} attr
 * @param {string} name
 * @returns {boolean}
 */
function is_named_attribute(attr, name) {
	return (
		attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === name
	);
}

/**
 * @param {ESTreeJSX.JSXAttribute} attr
 * @returns {AST.Expression | null}
 */
function attribute_expression(attr) {
	const value = attr.value;
	if (!value || value.type !== 'JSXExpressionContainer') return null;
	return value.expression.type === 'JSXEmptyExpression' ? null : value.expression;
}

/**
 * @param {AST.Expression} expression
 * @returns {string}
 */
function describe_target(expression) {
	if (expression.type === 'Identifier') return expression.name;
	if (
		expression.type === 'MemberExpression' &&
		!expression.computed &&
		expression.property.type === 'Identifier'
	) {
		return `${describe_target(/** @type {AST.Expression} */ (expression.object))}.${expression.property.name}`;
	}
	return 'apply target';
}

/**
 * @param {AST.Expression} expression
 * @returns {AST.Identifier | null}
 */
function member_root(expression) {
	let current = expression;
	while (current.type === 'MemberExpression' && !current.computed) {
		current = /** @type {AST.Expression} */ (current.object);
	}
	return current.type === 'Identifier' ? current : null;
}

/**
 * @param {Binding} binding
 * @param {AST.Expression} expression the `apply` entry for the member chain
 * @returns {AST.JSXStyleElement | null | undefined} `undefined` when the
 *   member does not name a style block of a module-local object
 */
function resolve_local_member(binding, expression) {
	if (expression.type !== 'MemberExpression' || expression.computed) return undefined;
	if (expression.object.type !== 'Identifier' || expression.property.type !== 'Identifier') {
		return undefined;
	}
	const object = binding.initial;
	if (object?.type !== 'ObjectExpression') return undefined;
	const name = expression.property.name;
	for (const property of object.properties) {
		if (
			property.type === 'Property' &&
			!property.computed &&
			((property.key.type === 'Identifier' && property.key.name === name) ||
				(property.key.type === 'Literal' && property.key.value === name)) &&
			property.value.type === 'JSXStyleElement'
		) {
			return property.value;
		}
	}
	return undefined;
}

/**
 * Whether any reference to the binding reads its `$class` property.
 *
 * @param {Binding | null} binding
 * @returns {boolean}
 */
function is_class_read(binding) {
	if (!binding) return false;
	return binding.references.some(({ node, path }) => {
		const parent = path.at(-1);
		if (parent?.type !== 'MemberExpression' || parent.object !== node) return false;
		if (parent.computed) {
			return parent.property.type === 'Literal' && parent.property.value === '$class';
		}
		return parent.property.type === 'Identifier' && parent.property.name === '$class';
	});
}

/**
 * Run the module-level style analysis. `scopes` comes from `create_scopes`
 * over the same program so target resolution uses real bindings.
 *
 * @param {AST.Program} ast
 * @param {Map<AST.Node, ScopeInterface>} scopes
 * @param {TSRXAnalysisState} state
 * @returns {StyleAnalysis}
 */
export function analyze_styles(ast, scopes, state) {
	const exported_names = collect_exported_names(ast);
	const errors = state.collect ? state.errors : undefined;
	/** @type {AST.JSXStyleElement[]} */
	const assigned = [];
	/** @type {AST.JSXStyleElement[]} */
	const standalone = [];

	/**
	 * @param {string} message
	 * @param {string} code
	 * @param {AST.Node} node
	 */
	const report = (message, code, node) => {
		validate_style(message, code, node, state.filename, errors, state.comments);
	};

	/**
	 * @param {AST.Expression} expression
	 * @param {ScopeInterface | null} scope
	 * @param {StyleApplyResolution[]} resolutions
	 */
	const resolve_apply_entry = (expression, scope, resolutions) => {
		if (expression.type === 'ArrayExpression') {
			for (const element of expression.elements) {
				if (!element || element.type === 'SpreadElement') {
					report(
						tsrx_style_apply_target_error('apply entry'),
						DIAGNOSTIC_CODES.STYLE_APPLY_TARGET,
						element ?? expression,
					);
					continue;
				}
				resolve_apply_entry(element, scope, resolutions);
			}
			return;
		}

		const root = member_root(expression);
		const name = describe_target(expression);
		const binding = root && scope ? scope.get(root.name) : null;
		if (!root || !binding) {
			report(tsrx_style_apply_target_error(name), DIAGNOSTIC_CODES.STYLE_APPLY_TARGET, expression);
			return;
		}

		if (binding.declaration_kind === 'import') {
			resolutions.push({ expression, target: null, kind: 'import' });
			return;
		}

		/** @type {AST.JSXStyleElement | null | undefined} */
		let target;
		if (expression.type === 'Identifier') {
			target = binding.initial?.type === 'JSXStyleElement' ? binding.initial : undefined;
		} else {
			target = resolve_local_member(binding, expression);
		}

		if (!target) {
			report(tsrx_style_apply_target_error(name), DIAGNOSTIC_CODES.STYLE_APPLY_TARGET, expression);
			return;
		}

		if (/** @type {number} */ (binding.node.start) > /** @type {number} */ (root.start)) {
			report(
				tsrx_style_apply_before_declaration_error(name),
				DIAGNOSTIC_CODES.STYLE_APPLY_BEFORE_DECLARATION,
				root,
			);
			return;
		}

		target.metadata.styleApplied = true;
		resolutions.push({ expression, target, kind: 'local' });
	};

	walk(
		/** @type {AST.Node} */ (ast),
		/** @type {StyleWalkState} */ ({ function_depth: 0, template_depth: 0, container_depth: 0 }),
		/** @type {Visitors<AST.Node, StyleWalkState>} */ ({
			_(node, { state: walk_state, next }) {
				if (is_function_node(node)) {
					next({ ...walk_state, function_depth: walk_state.function_depth + 1 });
					return;
				}
				if (node.type === 'JSXCodeBlock' || is_template_directive(node)) {
					// `@else if` chains and `@catch` clauses are children of the
					// directive node, so one bump covers every branch body.
					next({
						...walk_state,
						template_depth: walk_state.template_depth + 1,
						container_depth: walk_state.container_depth + 1,
					});
					return;
				}
				if (
					(node.type === 'JSXElement' || node.type === 'JSXFragment') &&
					node.metadata?.native_tsrx
				) {
					next({ ...walk_state, template_depth: walk_state.template_depth + 1 });
					return;
				}
				next();
			},

			JSXStyleElement(node, { path, state: walk_state, next }) {
				const is_standalone = is_standalone_style_position(path);
				const inside_head = path.some(
					(ancestor) =>
						ancestor.type === 'JSXElement' &&
						ancestor.openingElement.name.type === 'JSXIdentifier' &&
						ancestor.openingElement.name.name === 'head',
				);
				const attributes = node.openingElement.attributes;
				const is_resource = attributes.some((attr) => is_named_attribute(attr, 'href'));

				/** @type {ESTreeJSX.JSXAttribute | null} */
				let apply_attr = null;
				for (const attr of attributes) {
					if (attr.type !== 'JSXAttribute') continue;
					if (is_named_attribute(attr, 'apply')) {
						if (apply_attr) {
							report(
								TSRX_STYLE_APPLY_DUPLICATE_ERROR,
								DIAGNOSTIC_CODES.STYLE_APPLY_DUPLICATE,
								attr,
							);
							continue;
						}
						apply_attr = attr;
						continue;
					}
					if (is_named_attribute(attr, 'ref') || inside_head || is_resource) continue;
					const attr_name =
						attr.name.type === 'JSXIdentifier'
							? attr.name.name
							: `${attr.name.namespace.name}:${attr.name.name.name}`;
					report(
						tsrx_style_unknown_attribute_error(attr_name),
						DIAGNOSTIC_CODES.STYLE_UNKNOWN_ATTRIBUTE,
						attr,
					);
				}

				/** @type {StyleApplyResolution[]} */
				const resolutions = [];
				if (apply_attr) {
					const expression = attribute_expression(apply_attr);
					if (!expression) {
						report(TSRX_STYLE_APPLY_VALUE_ERROR, DIAGNOSTIC_CODES.STYLE_APPLY_VALUE, apply_attr);
					} else if (inside_head || is_resource) {
						report(
							TSRX_STYLE_APPLY_UNSUPPORTED_HOST_ERROR,
							DIAGNOSTIC_CODES.STYLE_APPLY_UNSUPPORTED_HOST,
							apply_attr,
						);
					} else {
						resolve_apply_entry(expression, nearest_scope(path, scopes), resolutions);
					}
				}
				node.metadata.styleApplies = resolutions;

				if (is_standalone) {
					if (!inside_head && !is_resource) {
						const parent = path.at(-1);
						const in_children_list =
							parent?.type === 'JSXElement' || parent?.type === 'JSXFragment';
						if (walk_state.function_depth === 0 && walk_state.template_depth === 0) {
							report(
								TSRX_STYLE_STANDALONE_AT_MODULE_SCOPE_ERROR,
								DIAGNOSTIC_CODES.STYLE_STANDALONE_AT_MODULE_SCOPE,
								node,
							);
						} else if (!in_children_list) {
							// A block is an output node: as the lone output of a `@{ … }` or
							// control-flow body, or as a statement, it styles nothing. Beside
							// another output it is already the parser's multiple-outputs error.
							report(
								TSRX_STYLE_STANDALONE_NEEDS_FRAGMENT_ERROR,
								DIAGNOSTIC_CODES.STYLE_STANDALONE_NEEDS_FRAGMENT,
								node,
							);
						} else if (walk_state.container_depth === 0 && !node.openingElement.selfClosing) {
							// Raw CSS in `<style>` is TSRX template syntax: outside every
							// `@{ … }` and control-flow body the file is plain TSX, where a
							// `<style>` takes an expression child instead. A self-closing
							// `<style apply={…} />` holds no CSS text and is ordinary JSX.
							report(
								TSRX_STYLE_STANDALONE_OUTSIDE_TEMPLATE_ERROR,
								DIAGNOSTIC_CODES.STYLE_STANDALONE_OUTSIDE_TEMPLATE,
								node,
							);
						}
						standalone.push(node);
					}
				} else {
					assigned.push(node);
					const parent = path.at(-1);
					const grandparent = path.at(-2);
					/** @type {AST.VariableDeclarator | null} */
					let declarator = null;
					if (parent?.type === 'VariableDeclarator') {
						declarator = parent;
					} else if (parent?.type === 'Property' && grandparent?.type === 'ObjectExpression') {
						const holder = path.at(-3);
						if (holder?.type === 'VariableDeclarator') declarator = holder;
					}
					const declared_name = declarator?.id.type === 'Identifier' ? declarator.id.name : null;
					const declaration_index = declarator ? path.indexOf(declarator) : -1;
					const export_parent = declaration_index > 0 ? path[declaration_index - 2] : null;
					node.metadata.styleExported =
						parent?.type === 'ExportDefaultDeclaration' ||
						export_parent?.type === 'ExportNamedDeclaration' ||
						(declared_name !== null && exported_names.has(declared_name));
					// Reading `theme.$class` opts an element (or a child component's
					// element, through a prop) into the block's whole stylesheet, so
					// such a block is a theme: every selector stays, like `apply`.
					node.metadata.styleClassRead =
						declared_name !== null &&
						is_class_read(nearest_scope(path, scopes)?.get(declared_name) ?? null);

					const stylesheet = get_style_element_stylesheet(node);
					if (stylesheet && get_style_class_map_names(stylesheet).includes('$class')) {
						report(
							TSRX_STYLE_RESERVED_CLASS_KEY_ERROR,
							DIAGNOSTIC_CODES.STYLE_RESERVED_CLASS_KEY,
							node,
						);
					}
				}

				if (
					state.forbidStyleInControlFlow &&
					style_authors_css(node) &&
					!inside_head &&
					!is_resource &&
					is_style_in_control_flow_branch(path, node)
				) {
					report(TSRX_STYLE_IN_CONTROL_FLOW_ERROR, DIAGNOSTIC_CODES.STYLE_IN_CONTROL_FLOW, node);
				}

				next();
			},
		}),
	);

	for (const node of assigned) {
		node.metadata.styleKind =
			node.metadata.styleExported || node.metadata.styleApplied || node.metadata.styleClassRead
				? 'theme'
				: 'class-map';
	}

	/** @type {StyleAnalysis} */
	const styles = { assigned, standalone };
	/** @type {{ metadata?: { styles?: StyleAnalysis } }} */ (ast).metadata = {
		.../** @type {{ metadata?: object }} */ (ast).metadata,
		styles,
	};
	return styles;
}
