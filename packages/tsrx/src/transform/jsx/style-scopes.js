/**
 * Style scope pre-pass: the one place that decides which `<style>` blocks
 * belong to which template scope, in what order their CSS is emitted, and
 * which classes every element carries.
 *
 * A scope is a statement list plus the template it renders: the body of a
 * `@{ … }` block, the body of an `@if`/`@for`/`@switch`/`@try` branch, or a
 * native element/fragment in expression position (assigned templates,
 * returned fragments). A scope owns the standalone blocks written directly in
 * its list and inside its own native element subtree; nested scopes own their
 * own blocks. Every block of a scope shares the scope hash (the first bodied
 * block's position-derived hash), and every element in the scope's subtree —
 * nested scopes included — carries the hashes of all its enclosing scopes,
 * outer first, followed by the classes of every applied theme.
 *
 * CSS is emitted in lexical pre-order: a scope's sheets form one contiguous
 * group placed where its first block sits, before the sheets of the scopes
 * and assigned blocks nested in it, after the assigned blocks declared before
 * it in the same list. Running once, before the target walker, makes this
 * order an invariant rather than a property of the walker's traversal.
 *
 * The pass is copy-on-write over the parsed AST: nodes it does not change are
 * returned as-is, and node metadata is shared with the parser nodes so later
 * passes (and the editor mappings) see the same annotations.
 *
 * @import * as AST from 'estree'
 * @import * as ESTreeJSX from 'estree-jsx'
 * @import { CompileError, JsxTransformContext as TransformContext } from '../../../types/index'
 */

import { analyze_css } from '../../analyze/css-analyze.js';
import { prune_css } from '../../analyze/prune.js';
import { DIAGNOSTIC_CODES } from '../../diagnostics.js';
import { error } from '../../errors.js';
import * as b from '../../utils/builders.js';
import {
	child_nodes,
	has_location,
	is_ast_node,
	is_function_node,
	is_style_element,
	is_template_directive,
	node_children,
} from '../../utils/ast.js';
import {
	add_scope_classes,
	is_composite_jsx_element,
	prepare_stylesheet_for_render,
} from '../scoping.js';
import {
	collect_style_ref_attributes,
	create_style_class_map,
	create_style_ref_setup_statements,
	get_style_element_stylesheet,
} from '../style-ref.js';
import { clone_ast_node, create_generated_identifier } from './ast-builders.js';
import { set_node_path_metadata } from './helpers.js';

/**
 * @typedef {'statement' | 'expression'} DescendMode
 * @typedef {{
 *   ctx: TransformContext,
 *   class_attr_name: 'class' | 'className',
 *   static_classes: Map<AST.JSXStyleElement, string | null>,
 * }} StyleScopeState
 * @typedef {{ hash: string | null, applied: Array<string | AST.Expression>, ref_statements: AST.Statement[] }} ScopeStyles
 */

/**
 * Run the pre-pass over a program. Returns the rewritten program (the same
 * object when nothing changed) and fills `ctx.stylesheets` in emission order.
 *
 * @param {AST.Program} program
 * @param {TransformContext} ctx
 * @returns {AST.Program}
 */
export function prepare_style_scopes(program, ctx) {
	/** @type {StyleScopeState} */
	const state = {
		ctx,
		class_attr_name:
			ctx.platform.jsx.classAttrName ?? (ctx.platform.jsx.rewriteClassAttr ? 'className' : 'class'),
		static_classes: new Map(),
	};
	// Module scope is not a template scope: a standalone block here is an
	// analyzer error, and its statements are only searched for scopes.
	const body = map_list(program.body, (statement) => descend(statement, state, 'statement'));
	return body === program.body ? program : { ...program, body };
}

/**
 * @template {AST.Node} T
 * @param {T[]} list
 * @param {(item: T) => T} map
 * @returns {T[]}
 */
function map_list(list, map) {
	let out = list;
	for (let i = 0; i < list.length; i += 1) {
		const item = list[i];
		const next = is_ast_node(item) ? map(item) : item;
		if (next !== item) {
			if (out === list) out = list.slice();
			out[i] = next;
		}
	}
	return out;
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.TSRXJSXElement | AST.TSRXJSXFragment}
 */
function is_native_template_node(node) {
	return (
		(node?.type === 'JSXElement' || node?.type === 'JSXFragment') && !!node.metadata?.native_tsrx
	);
}

/**
 * A list item that renders: it is stamped with the scope's classes and may
 * host nested scopes. Setup statements are neither.
 *
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_render_item(node) {
	return (
		is_native_template_node(node) || node.type === 'JSXCodeBlock' || is_template_directive(node)
	);
}

/**
 * Copy-on-write search for nested scopes and assigned blocks below a node
 * that is not itself template content of the current scope.
 *
 * @template {AST.Node} T
 * @param {T} node
 * @param {StyleScopeState} state
 * @param {DescendMode} mode whether `node` sits in a statement slot or holds a value
 * @returns {T}
 */
function descend(node, state, mode) {
	if (!is_ast_node(node)) return node;

	if (is_style_element(node)) {
		// A block holding a value is an assigned block. A block in a statement
		// slot outside any template scope was reported by the analyzer; it is
		// left alone so editor output stays analyzable.
		if (mode === 'expression') prepare_assigned_style(node, state);
		return node;
	}

	if (node.type === 'JSXCodeBlock') {
		return /** @type {T} */ (process_code_block(node, state));
	}

	if (is_template_directive(node)) {
		return /** @type {T} */ (process_directive(node, state));
	}

	if (is_native_template_node(node)) {
		// A native template in expression or statement position roots a scope of
		// its own (an assigned template, a returned fragment, a branch value).
		return /** @type {T} */ (process_root(node, state));
	}

	if (node.type === 'ExpressionStatement') {
		const expression = descend(node.expression, state, 'statement');
		return expression === node.expression ? node : { ...node, expression };
	}

	return rewrite_children(node, state, (child, key) =>
		descend(child, state, is_statement_list_key(node, key) ? 'statement' : 'expression'),
	);
}

/**
 * @param {AST.Node} node
 * @param {string} key
 * @returns {boolean}
 */
function is_statement_list_key(node, key) {
	if (key === 'body') return node.type === 'BlockStatement' || node.type === 'Program';
	if (key === 'consequent') return node.type === 'SwitchCase';
	return false;
}

/**
 * Copy-on-write map over a node's child properties.
 *
 * @template {AST.Node} T
 * @param {T} node
 * @param {StyleScopeState} state
 * @param {(child: AST.Node, key: string) => AST.Node} map
 * @returns {T}
 */
function rewrite_children(node, state, map) {
	/** @type {Record<string, unknown>} */
	const source = /** @type {Record<string, unknown>} */ (node);
	let out = source;
	for (const key of Object.keys(source)) {
		if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata' || key === 'css') {
			continue;
		}
		const value = source[key];
		if (Array.isArray(value)) {
			const next = map_list(/** @type {AST.Node[]} */ (value), (child) => map(child, key));
			if (next !== value) {
				if (out === source) out = { ...source };
				out[key] = next;
			}
		} else if (is_ast_node(value)) {
			const next = map(value, key);
			if (next !== value) {
				if (out === source) out = { ...source };
				out[key] = next;
			}
		}
	}
	return /** @type {T} */ (out);
}

/**
 * Template children of a native element that already belongs to a scope:
 * they are not new roots, but expression containers and attribute values
 * inside them are.
 *
 * @template {AST.TSRXJSXElement | AST.TSRXJSXFragment} T
 * @param {T} node
 * @param {StyleScopeState} state
 * @returns {T}
 */
function descend_template_children(node, state) {
	return rewrite_children(node, state, (child, key) => {
		if (key === 'children') {
			if (is_native_template_node(child)) return descend_template_children(child, state);
			if (is_style_element(child)) return child;
			return descend(child, state, 'statement');
		}
		return descend(child, state, 'expression');
	});
}

/**
 * `@{ … }`: the body statements and the render slot form one scope, in source
 * order (a `<style>` sibling may follow the output node).
 *
 * @param {AST.JSXCodeBlock} node
 * @param {StyleScopeState} state
 * @returns {AST.JSXCodeBlock}
 */
function process_code_block(node, state) {
	const items = insert_in_source_order(node.body, node.render);
	const { nodes, render } = process_list(items, state, node.render);
	if (nodes === items && render === node.render) return node;
	return {
		...node,
		body: /** @type {AST.Statement[]} */ (nodes.filter((item) => item !== render)),
		render,
	};
}

/**
 * @param {AST.Node[]} body
 * @param {AST.Node | null} render
 * @returns {AST.Node[]}
 */
function insert_in_source_order(body, render) {
	if (!render) return body;
	const render_start = render.start;
	if (render_start === undefined) return [...body, render];
	const index = body.findIndex((item) => item.start !== undefined && item.start > render_start);
	if (index === -1) return [...body, render];
	return [...body.slice(0, index), render, ...body.slice(index)];
}

/**
 * Each branch body of a directive is a scope.
 *
 * @param {AST.JSXTemplateDirective} node
 * @param {StyleScopeState} state
 * @returns {AST.JSXTemplateDirective}
 */
function process_directive(node, state) {
	return rewrite_children(node, state, (child, key) => {
		if (child.type === 'BlockStatement') return process_block_body(child, state);
		if (child.type === 'CatchClause') {
			const body = process_block_body(child.body, state);
			return body === child.body ? child : { ...child, body };
		}
		if (child.type === 'SwitchCase') {
			const consequent = process_list(child.consequent, state, null).nodes;
			return consequent === child.consequent
				? child
				: { ...child, consequent: /** @type {AST.Statement[]} */ (consequent) };
		}
		if (key === 'alternate' && is_template_directive(child)) return process_directive(child, state);
		return descend(child, state, 'expression');
	});
}

/**
 * @param {AST.BlockStatement} block
 * @param {StyleScopeState} state
 * @returns {AST.BlockStatement}
 */
function process_block_body(block, state) {
	const body = process_list(block.body, state, null).nodes;
	return body === block.body ? block : { ...block, body: /** @type {AST.Statement[]} */ (body) };
}

/**
 * A native element/fragment rooting a scope of its own.
 *
 * @template {AST.TSRXJSXElement | AST.TSRXJSXFragment} T
 * @param {T} node
 * @param {StyleScopeState} state
 * @returns {T}
 */
function process_root(node, state) {
	const own = collect_own_blocks([node]);
	if (own.length === 0) return descend_template_children(node, state);

	const scope = prepare_scope(own, [node], node, state);
	let out = /** @type {T} */ (stamp(node, scope, state));
	out = /** @type {T} */ (strip(out, own, state));
	if (scope.ref_statements.length > 0) {
		// Expression-position roots have no statement slot of their own; the
		// lowering that turns the root into statements picks these up.
		out.metadata.tsrx_style_ref_statements = scope.ref_statements;
	}
	return descend_template_children(out, state);
}

/**
 * One statement-list scope.
 *
 * @param {AST.Node[]} nodes source-ordered items: setup statements, style siblings, render items
 * @param {StyleScopeState} state
 * @param {AST.Node | null} render_item the code block's render slot, tracked through the rewrite
 * @returns {{ nodes: AST.Node[], render: AST.Node | null }}
 */
function process_list(nodes, state, render_item) {
	const own = collect_own_blocks(nodes);
	const render_index = render_item ? nodes.indexOf(render_item) : -1;

	if (own.length === 0) {
		const out = map_list(nodes, (item) => descend_list_item(item, state));
		return { nodes: out, render: render_index === -1 ? null : out[render_index] };
	}

	const first_block_start = /** @type {number} */ (own[0].start);
	const render_items = nodes.filter(is_render_item);
	const holder = render_items[0] ?? own[0];
	/** @type {AST.Node[][]} */
	const out = nodes.map((item) => [item]);

	// Setup statements ahead of the scope's first block emit first: an assigned
	// theme declared there is applied by this scope and must precede its CSS.
	for (let i = 0; i < nodes.length; i += 1) {
		const item = nodes[i];
		if (!is_render_item(item) && !is_style_element(item) && precedes(item, first_block_start)) {
			out[i] = [descend(item, state, 'statement')];
		}
	}

	const scope = prepare_scope(own, render_items, holder, state);

	let ref_statements = scope.ref_statements;
	for (let i = 0; i < nodes.length; i += 1) {
		const item = nodes[i];
		if (is_style_element(item)) {
			out[i] = own.includes(item) ? (state.ctx.typeOnly ? [type_only_style(item)] : []) : [item];
			continue;
		}
		if (is_render_item(item)) {
			const stamped = strip(stamp(item, scope, state), own, state);
			const processed = descend_list_item(stamped, state);
			out[i] = ref_statements.length > 0 ? [...ref_statements, processed] : [processed];
			ref_statements = [];
			continue;
		}
		if (!precedes(item, first_block_start)) {
			out[i] = [descend(item, state, 'statement')];
		}
	}
	if (ref_statements.length > 0) {
		// A scope with `ref` blocks and nothing rendered still exposes its map.
		out.push(ref_statements);
	}

	const render = render_index === -1 ? null : (out[render_index].at(-1) ?? null);
	return { nodes: out.flat(), render };
}

/**
 * @param {AST.Node} item
 * @param {number} position
 * @returns {boolean}
 */
function precedes(item, position) {
	return item.end !== undefined && item.end <= position;
}

/**
 * @param {AST.Node} item
 * @param {StyleScopeState} state
 * @returns {AST.Node}
 */
function descend_list_item(item, state) {
	if (is_native_template_node(item)) return descend_template_children(item, state);
	if (is_style_element(item)) return item;
	return descend(item, state, 'statement');
}

/**
 * The standalone blocks a scope owns: style items of its list and blocks
 * inside its native element subtrees. Nested scopes (code blocks, directive
 * bodies, expression containers, functions) keep their own.
 *
 * @param {AST.Node[]} nodes
 * @param {AST.JSXStyleElement[]} [blocks]
 * @returns {AST.JSXStyleElement[]}
 */
export function collect_own_blocks(nodes, blocks = []) {
	for (const node of nodes) {
		if (is_style_element(node)) {
			blocks.push(node);
		} else if (is_native_template_node(node)) {
			collect_own_blocks(node_children(node), blocks);
		}
	}
	return blocks.sort((a, b) => /** @type {number} */ (a.start) - /** @type {number} */ (b.start));
}

/**
 * Render a scope's sheets and compute what its elements carry.
 *
 * @param {AST.JSXStyleElement[]} own
 * @param {AST.Node[]} render_items
 * @param {AST.Node} holder the node whose metadata accumulates the scope's class map
 * @param {StyleScopeState} state
 * @returns {ScopeStyles}
 */
function prepare_scope(own, render_items, holder, state) {
	const { ctx } = state;
	/** @type {Array<[AST.JSXStyleElement, AST.CSS.StyleSheet]>} */
	const sheets = [];
	for (const block of own) {
		const sheet = get_style_element_stylesheet(block);
		if (sheet) sheets.push([block, sheet]);
	}
	const hash = sheets.length > 0 ? sheets[0][1].hash : null;
	const refs = collect_style_ref_attributes(own);
	const elements = collect_css_prunable_elements(render_items, [], ctx);

	/** @type {AST.CSS.StyleSheet | null} */
	let first_sheet = null;
	for (const [block, sheet] of sheets) {
		const region_hash = sheet.hash;
		sheet.hash = /** @type {string} */ (hash);
		if (!analyze_scope_css(block, sheet, state)) continue;
		apply_css_definition_metadata(holder, sheet, elements, refs.length > 0, region_hash);
		ctx.stylesheets.push(sheet);
		first_sheet ??= sheet;
	}

	const applied = applies_of(own, state);

	/** @type {AST.Statement[]} */
	let ref_statements = [];
	if (refs.length > 0) {
		ref_statements = create_style_ref_setup_statements(
			refs,
			create_style_class_map(holder, first_sheet, { applied, hash }),
			{
				allowMutableRefTarget: ctx.platform.jsx.multiRefStrategy === 'array',
				createTempIdentifier: () => create_generated_identifier(create_style_ref_temp_name(ctx)),
			},
		);
	}

	return { hash, applied, ref_statements };
}

/**
 * @param {AST.JSXStyleElement[]} blocks
 * @param {StyleScopeState} state
 * @returns {Array<string | AST.Expression>}
 */
function applies_of(blocks, state) {
	return blocks.flatMap((block) => resolve_style_applies(block, state));
}

/**
 * @param {TransformContext} ctx
 * @returns {string}
 */
function create_style_ref_temp_name(ctx) {
	ctx.local_statement_component_index += 1;
	return `_tsrx_style_ref_${ctx.local_statement_component_index}`;
}

/**
 * `analyze_css` reports `:global` placement through a coded fatal error with
 * CSS-relative positions; re-anchor it on the block so editors can place it,
 * and keep going in collect mode.
 *
 * @param {AST.JSXStyleElement} block
 * @param {AST.CSS.StyleSheet} sheet
 * @param {StyleScopeState} state
 * @returns {boolean} whether the sheet is usable
 */
function analyze_scope_css(block, sheet, state) {
	try {
		analyze_css(sheet);
		return true;
	} catch (thrown) {
		const compile_error = /** @type {CompileError} */ (thrown);
		if (compile_error?.code !== DIAGNOSTIC_CODES.CSS_GLOBAL_PLACEMENT) throw thrown;
		error(
			compile_error.message,
			state.ctx.filename,
			block,
			state.ctx.collect ? state.ctx.errors : undefined,
			state.ctx.comments,
			compile_error.code,
		);
		return false;
	}
}

/**
 * Prune the sheet against the scope's elements and record the class map the
 * scope exposes (through `ref`) on the holder's metadata.
 *
 * @param {AST.Node} holder
 * @param {AST.CSS.StyleSheet} css
 * @param {AST.TSRXJSXElement[]} elements
 * @param {boolean} export_top_scoped_classes
 * @param {string} region_hash
 * @returns {void}
 */
export function apply_css_definition_metadata(
	holder,
	css,
	elements,
	export_top_scoped_classes,
	region_hash = css.hash,
) {
	const metadata = holder.metadata || (holder.metadata = { path: [] });
	const style_classes = metadata.styleClasses || (metadata.styleClasses = new Map());
	const top_scoped_classes = metadata.topScopedClasses || new Map();

	const prune = () => {
		for (const element of elements) {
			prune_css(css, element, style_classes, top_scoped_classes, region_hash);
		}
	};

	prune();

	if (export_top_scoped_classes) {
		for (const [class_name, class_info] of top_scoped_classes) {
			style_classes.set(class_name, class_info.selector ?? class_info);
		}
		prune();
	}

	if (top_scoped_classes.size > 0) {
		metadata.topScopedClasses = top_scoped_classes;
	}
}

/**
 * Pruning runs before the walker stamps paths onto template nodes, so each
 * collected element gets its ancestor chain (`metadata.path`) here —
 * descendant/sibling selector matching in `prune_css` reads it. The scope's
 * own elements and those of nested scopes are collected; a component
 * boundary stops the walk.
 *
 * @param {AST.Node | AST.Node[]} value
 * @param {AST.TSRXJSXElement[]} [elements]
 * @param {TransformContext | null} [transform_context]
 * @param {AST.Node[]} [path]
 * @returns {AST.TSRXJSXElement[]}
 */
export function collect_css_prunable_elements(
	value,
	elements = [],
	transform_context = null,
	path = [],
) {
	if (Array.isArray(value)) {
		for (const child of value) {
			collect_css_prunable_elements(child, elements, transform_context, path);
		}
		return elements;
	}

	if (is_function_node(value) && value.metadata?.tsrx_dynamic_wrapper !== true) {
		return elements;
	}

	if (value.type === 'JSXElement' && value.metadata?.native_tsrx) {
		if (!is_style_element(value)) {
			set_node_path_metadata(value, path);
			elements.push(value);
		}
	}

	const child_path = [...path, value];

	for (const child of child_nodes(value, 'css')) {
		collect_css_prunable_elements(child, elements, transform_context, child_path);
	}

	return elements;
}

/**
 * The class parts a block's `apply` contributes: a literal for a same-module
 * theme whose class is statically known, otherwise a runtime `<target>.$class`
 * read. Memoized on the block's metadata for the assigned-block lowering.
 *
 * @param {AST.JSXStyleElement} block
 * @param {StyleScopeState} state
 * @returns {Array<string | AST.Expression>}
 */
export function resolve_style_applies(block, state) {
	if (block.metadata.tsrx_style_class_parts) return block.metadata.tsrx_style_class_parts;
	/** @type {Array<string | AST.Expression>} */
	const parts = [];
	for (const resolution of block.metadata.styleApplies ?? []) {
		const static_class = resolution.target ? static_style_class(resolution.target, state) : null;
		if (static_class !== null) {
			if (static_class !== '') parts.push(static_class);
			continue;
		}
		parts.push(
			b.member(clone_ast_node(resolution.expression, !state.ctx.typeOnly), b.id('$class')),
		);
	}
	block.metadata.tsrx_style_class_parts = parts;
	return parts;
}

/**
 * The `$class` value of an assigned block when every applied theme in its
 * chain is a same-module block: applied classes first, own hash last (D6).
 *
 * @param {AST.JSXStyleElement} block
 * @param {StyleScopeState} state
 * @returns {string | null}
 */
export function static_style_class(block, state) {
	const cached = state.static_classes.get(block);
	if (cached !== undefined) return cached;
	/** @type {string[]} */
	const parts = [];
	/** @type {string | null} */
	let result = '';
	for (const resolution of block.metadata.styleApplies ?? []) {
		const applied = resolution.target ? static_style_class(resolution.target, state) : null;
		if (applied === null) {
			result = null;
			break;
		}
		if (applied !== '') parts.push(applied);
	}
	if (result !== null) {
		const sheet = get_style_element_stylesheet(block);
		if (sheet) parts.push(sheet.hash);
		result = parts.join(' ');
	}
	state.static_classes.set(block, result);
	return result;
}

/**
 * Render an assigned block's sheet at its declaration position so it lands
 * in lexical order with the scopes around it; the walker's visitor builds the
 * class map object later from the same sheet.
 *
 * @param {AST.JSXStyleElement} node
 * @param {StyleScopeState} state
 * @returns {void}
 */
function prepare_assigned_style(node, state) {
	if (node.metadata.tsrx_style_prepared) return;
	node.metadata.tsrx_style_prepared = true;
	resolve_style_applies(node, state);
	const sheet = get_style_element_stylesheet(node);
	if (!sheet) return;
	if (!analyze_scope_css(node, sheet, state)) return;
	state.ctx.stylesheets.push(
		prepare_stylesheet_for_render(
			sheet,
			node.metadata.styleKind === 'theme' ? 'theme' : 'class-map',
		),
	);
}

/**
 * Stamp the scope's classes on every element in the subtree, through nested
 * scopes (they append their own later) but not through function boundaries.
 *
 * @template {AST.Node} T
 * @param {T} node
 * @param {ScopeStyles} scope
 * @param {StyleScopeState} state
 * @returns {T}
 */
function stamp(node, scope, state) {
	if (scope.hash === null && scope.applied.length === 0) return node;
	return /** @type {T} */ (stamp_node(node, scope, state));
}

/**
 * @param {AST.Node} node
 * @param {ScopeStyles} scope
 * @param {StyleScopeState} state
 * @returns {AST.Node}
 */
function stamp_node(node, scope, state) {
	if (!is_ast_node(node)) return node;
	if (is_function_node(node) && node.metadata?.tsrx_dynamic_wrapper !== true) return node;
	if (is_style_element(node)) return node;

	// Composite components get no hash (their host elements belong to their own
	// scope); parser-native dynamic tags (`<{expr}>`) render host elements.
	/** @type {AST.Node} */
	const out =
		node.type === 'JSXElement' && (!is_composite_jsx_element(node) || node.metadata?.dynamicElement)
			? add_scope_classes(
					/** @type {AST.TSRXJSXElement} */ (node),
					scope.hash ? [scope.hash] : [],
					scope.applied,
					state.class_attr_name,
				)
			: node;
	return rewrite_children(out, state, (child) => stamp_node(child, scope, state));
}

/**
 * Remove the scope's own blocks from its native element subtrees. Type-only
 * output keeps them, emptied, so the editor can map the tag and its
 * attributes.
 *
 * @template {AST.Node} T
 * @param {T} node
 * @param {AST.JSXStyleElement[]} own
 * @param {StyleScopeState} state
 * @returns {T}
 */
function strip(node, own, state) {
	if (!is_native_template_node(node)) return node;
	/** @type {AST.Node[]} */
	const children = [];
	let changed = false;
	for (const child of node_children(node)) {
		if (is_style_element(child) && own.includes(child)) {
			changed = true;
			if (state.ctx.typeOnly) children.push(type_only_style(child));
			continue;
		}
		const next = strip(child, own, state);
		if (next !== child) changed = true;
		children.push(next);
	}
	return changed ? /** @type {T} */ ({ ...node, children }) : node;
}

/**
 * The synthesized `$class` read of a type-only `apply` target borrows the
 * target's position, so a TypeScript error on it (the target is not a style
 * object) lands on the authored identifier rather than on the closing brace.
 *
 * @param {AST.Node} target
 * @returns {AST.NodeWithLocation | undefined}
 */
function type_only_apply_loc(target) {
	return has_location(target) ? target : undefined;
}

/**
 * The type-only stand-in for a scoped block: no CSS body, and `apply`
 * rewritten to a `data-` attribute reading `$class` of each target so
 * TypeScript checks the target is a style object while the tag keeps its
 * source position.
 *
 * @param {AST.JSXStyleElement} block
 * @returns {AST.JSXStyleElement}
 */
export function type_only_style(block) {
	const attributes = block.openingElement.attributes.map((attr) => {
		if (
			attr.type !== 'JSXAttribute' ||
			attr.name.type !== 'JSXIdentifier' ||
			attr.name.name !== 'apply' ||
			attr.value?.type !== 'JSXExpressionContainer' ||
			attr.value.expression.type === 'JSXEmptyExpression'
		) {
			return attr;
		}
		const expression = attr.value.expression;
		const value =
			expression.type === 'ArrayExpression'
				? b.array(
						expression.elements.map((element) =>
							element && element.type !== 'SpreadElement'
								? b.member(clone_ast_node(element), b.id('$class', type_only_apply_loc(element)))
								: element,
						),
					)
				: b.member(clone_ast_node(expression), b.id('$class', type_only_apply_loc(expression)));
		return {
			...attr,
			name: { ...attr.name, name: 'data-tsrx-apply' },
			value: { ...attr.value, expression: value },
		};
	});
	return {
		...block,
		children: [],
		openingElement: { ...block.openingElement, attributes },
	};
}
