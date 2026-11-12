/** @import * as AST from 'estree' */
/** @import * as ESRap from 'esrap' */

import tsx from 'esrap/languages/tsx';
import {
	format_comment,
	get_line_comments_after,
	is_file_level_pragma,
	is_jsx_child_tooling_comment,
	should_preserve_comment,
	should_preserve_jsx_tooling_comment,
} from '../../comment-utils.js';
import { has_location, is_organized_import } from '../../utils/ast.js';
import { with_deferred_imports } from '../imports.js';

/**
 * Zimmerframe provides `path` as the ancestor chain. A native template node in
 * the children list of any JSX element/fragment renders as a JSX child;
 * anywhere else it renders as a standalone expression (e.g. a return value).
 * The parent may be a parsed native template node or a synthetic fragment the
 * transform built around render children — either way a bare expression in a
 * child slot would print as JSX text.
 *
 * @param {AST.Node[]} path
 * @returns {boolean}
 */
export function in_jsx_child_context(path) {
	const parent = path[path.length - 1];
	return !!parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment');
}

/** @type {Record<string, string>} */
const JSX_TEXT_ESCAPES = { '<': '&lt;', '>': '&gt;' };

/** The characters that `escape_jsx_text` writes as character references. */
export const regex_jsx_text_escaped = /[<>]/g;

/**
 * JSX text as the output writes it. A `JSXText` node's `raw` is its text as
 * written, character references included (`&amp;`), and JSX reads it the same
 * way; `value` is what it renders, with the references decoded. TSRX text can
 * also hold characters that JSX text can't: a `<` or `>` in template text
 * (`<span><3</span>`, `a > b`). The target's JSX toolchain rejects a bare `<`
 * or `>` (esbuild, oxc, TypeScript) or gives no output (vue-jsx-vapor), so each
 * is written as a character reference, which JSX decodes back to the same
 * character. The references already in the text stay as written. A raw-text
 * `<script>` body is never JSX text (see `create_script_body`).
 *
 * @param {string} raw
 * @returns {string}
 */
export function escape_jsx_text(raw) {
	return raw.replace(regex_jsx_text_escaped, (ch) => JSX_TEXT_ESCAPES[ch]);
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {boolean}
 */
export function is_empty_jsx_fragment(node) {
	return (
		node?.type === 'JSXFragment' &&
		!(node.children || []).some(
			(child) => child && (child.type !== 'JSXText' || child.raw.trim() !== ''),
		)
	);
}

/**
 * Maintain TSRX transform path metadata: every node seen by the walker
 * carries its current ancestor path for downstream CSS pruning and mapping
 * helpers.
 *
 * @param {AST.Node} node
 * @param {AST.Node[]} path
 * @returns {void}
 */
export function set_node_path_metadata(node, path) {
	if (!node.metadata) {
		node.metadata = { path: [...path] };
	} else {
		node.metadata.path = [...path];
	}
}

/**
 * Wrap esrap's `tsx()` printer with TSRX's printing fixes and comment handling.
 *
 * Shared across all JSX-producing targets (React, Preact, Solid).
 *
 * @param {boolean} [type_only] A typeOnly/volar print, whose comments
 * stay with their owners; build prints stay sparse.
 * @param {AST.CommentWithLocation[]} [comments] Source comments. In type-only
 * output, file-wide pragmas lead the program while documentation and scoped
 * annotations stay with their declarations, members, or statements. A sparse
 * print with explicitly supplied comments retains its existing leading-pragma
 * behavior. Ordinary build callers supply no comments.
 * @param {string | null} [hashbang] The source's hashbang line (`#!…`, see
 * `get_hashbang`), printed as the output's first line. The parser also reports
 * it as the `Line` comment at offset 0, which is then never printed as `//…`.
 * @param {string} [source] The source text. In type-only output, the comments
 * and spaces after an import or a re-export on its line print after it as
 * written.
 */
export function tsx_with_ts_locations(
	type_only = false,
	comments = undefined,
	hashbang = null,
	source = undefined,
) {
	const base = with_deferred_imports(/** @type {ESRap.Visitors<AST.Node>} */ (tsx({})));
	const { _: base_visitor, ...base_visitors } = base;
	const preserve_comments = comments !== undefined;
	const preserve_owner_comments = type_only && preserve_comments;
	/** @type {Set<string> | null} */
	const emitted_comments = preserve_comments ? new Set() : null;

	/**
	 * @param {AST.CommentWithLocation} comment
	 * @param {ESRap.Context} context
	 */
	const write_preserved_comment = (comment, context) => {
		if (
			!emitted_comments ||
			(hashbang !== null && comment.start === 0) ||
			!(preserve_owner_comments
				? should_preserve_jsx_tooling_comment(comment)
				: should_preserve_comment(comment))
		) {
			return;
		}
		const key = `${comment.start}:${comment.end}:${comment.type}:${comment.value}`;
		if (emitted_comments.has(key)) return;
		emitted_comments.add(key);
		if (comment.loc) context.location(comment.loc.start.line, comment.loc.start.column);
		context.write(format_comment(comment));
		if (comment.loc) context.location(comment.loc.end.line, comment.loc.end.column);
		context.newline();
	};

	/**
	 * Write the rest of the line after an import or a re-export as written, when
	 * it has only comments and spaces. TypeScript then keeps a comment with its
	 * import when Organize Imports moves the import. The line is then the same
	 * text up to the next line in both files, which TypeScript 7 needs to apply
	 * an edit (see also `add_line_point` in `segments.js`).
	 * @param {AST.Node} node
	 * @param {ESRap.Context} context
	 */
	const write_rest_of_line = (node, context) => {
		if (!emitted_comments || source === undefined || !is_organized_import(node)) return;
		let end = /** @type {number} */ (node.end);
		for (const comment of get_line_comments_after(node, source)) {
			emitted_comments.add(`${comment.start}:${comment.end}:${comment.type}:${comment.value}`);
			context.write(source.slice(end, comment.start));
			context.location(comment.loc.start.line, comment.loc.start.column);
			context.write(source.slice(comment.start, comment.end));
			context.location(comment.loc.end.line, comment.loc.end.column);
			end = comment.end;
		}
		let spaces_end = end;
		while (source[spaces_end] === ' ' || source[spaces_end] === '\t') spaces_end++;
		if (
			spaces_end === source.length ||
			source[spaces_end] === '\n' ||
			source[spaces_end] === '\r'
		) {
			context.write(source.slice(end, spaces_end));
		}
	};

	/**
	 * @param {AST.Node} node
	 * @param {ESRap.Context} context
	 */
	const write_leading_comments = (node, context) => {
		if (!node.leadingComments || !is_comment_owner(node)) return;
		for (const comment of node.leadingComments) {
			if (has_location(comment)) write_preserved_comment(comment, context);
		}
	};

	const leading_preserved = (/** @type {AST.Program} */ program) => {
		if (!preserve_comments || !comments?.length) return [];
		// Injected statements (dynamic-import/try-import prepends) carry no
		// loc; anchor "leading" on the first statement that maps to source,
		// else every preserved comment in the file would hoist to the top.
		const first = program.body.find((node) => node.loc);
		return comments.filter(
			(comment) =>
				(preserve_owner_comments
					? is_file_level_pragma(comment)
					: should_preserve_comment(comment)) &&
				(first?.loc == null ||
					(comment.loc &&
						(comment.loc.end.line < first.loc.start.line ||
							(comment.loc.end.line === first.loc.start.line &&
								comment.loc.end.column <= first.loc.start.column)))),
		);
	};

	/** @type {ESRap.Visitors<AST.Node>} */
	const wrappers = {
		Program: (node, context) => {
			// A hashbang is only valid as the very first line of a module.
			if (hashbang !== null) {
				context.location(1, 0);
				context.write(hashbang);
				context.newline();
			}
			for (const comment of leading_preserved(node)) {
				write_preserved_comment(comment, context);
			}
			/** @type {NonNullable<typeof base.Program>} */ (base.Program)(node, context);
		},
		// esrap's tsx printer writes `<T,>` for every one-parameter list, but
		// only an arrow needs it: TSX reads `<T>(…) => …` as a JSX tag. Other
		// lists print as written.
		ArrowFunctionExpression: (node, context) => {
			if (node.typeParameters?.params.length === 1) {
				arrow_type_parameters.add(node.typeParameters);
			}
			/** @type {NonNullable<typeof base.ArrowFunctionExpression>} */ (
				base.ArrowFunctionExpression
			)(node, context);
		},
		TSTypeParameterDeclaration: (node, context) => {
			if (arrow_type_parameters.has(node)) {
				/** @type {NonNullable<typeof base.TSTypeParameterDeclaration>} */ (
					base.TSTypeParameterDeclaration
				)(node, context);
				return;
			}
			context.write('<');
			for (let i = 0; i < node.params.length; i++) {
				if (i > 0) context.write(', ');
				context.visit(node.params[i]);
			}
			context.write('>');
		},
		// esrap writes an interface's `{` and `}` around the body it visits, so the
		// body's end, after the `}` in the source, would map before the generated
		// `}`. Without the body's location the braces map through their tokens.
		TSInterfaceDeclaration: (node, context) => {
			/** @type {NonNullable<typeof base.TSInterfaceDeclaration>} */ (base.TSInterfaceDeclaration)(
				{ ...node, body: { ...node.body, loc: undefined } },
				context,
			);
		},
		TSNamedTupleMember: (node, context) => {
			context.visit(node.label);
			if (node.optional) {
				context.write('?');
			}
			context.write(': ');
			context.visit(node.elementType);
		},
		// esrap's Property printer for method shorthand (`{ foo<T>() {} }`)
		// does not visit `value.typeParameters`, so the `<T>` is dropped from
		// the output and segments.js can't resolve the TSTypeParameterDeclaration's
		// source position. Override only the actual method-shorthand branch —
		// `{ foo: function() {} }` (`node.method === false`) and getters/setters
		// must fall through to base.Property to preserve their printed form.
		Property: (node, context) => {
			if (!node.method || node.value.type !== 'FunctionExpression') {
				/** @type {NonNullable<typeof base.Property>} */ (base.Property)(node, context);
				return;
			}
			const value = node.value;
			if (value.async) context.write('async ');
			if (value.generator) context.write('*');
			if (node.computed) context.write('[');
			context.visit(node.key);
			if (node.computed) context.write(']');
			if (value.typeParameters) {
				context.visit(value.typeParameters);
			}
			context.write('(');
			for (let i = 0; i < value.params.length; i++) {
				if (i > 0) context.write(', ');
				context.visit(value.params[i]);
			}
			context.write(')');
			if (value.returnType) context.visit(value.returnType);
			context.write(' ');
			context.visit(value.body);
		},

		// A comment between children is in an empty `{}` (see `#addTemplateText`
		// in `plugin.js`). In the editor's TypeScript, a tooling comment there
		// prints inside it in block form, `{/* @ts-expect-error */}`, which
		// TypeScript applies to the next line, as in TSX.
		JSXEmptyExpression: (node, context) => {
			if (!emitted_comments || !preserve_owner_comments) return;
			for (const comment of /** @type {AST.CommentWithLocation[]} */ (node.innerComments ?? [])) {
				if (!is_jsx_child_tooling_comment(comment) || comment.value.includes('*/')) continue;
				const key = `${comment.start}:${comment.end}:${comment.type}:${comment.value}`;
				if (emitted_comments.has(key)) continue;
				emitted_comments.add(key);
				if (comment.loc) context.location(comment.loc.start.line, comment.loc.start.column);
				context.write(
					comment.type === 'Line' ? `/* ${comment.value.trim()} */` : `/*${comment.value}*/`,
				);
				if (comment.loc) context.location(comment.loc.end.line, comment.loc.end.column);
			}
		},

		// Text prints from `raw`, as JSX printers do: `value` has its character
		// references decoded, so `&#123;x&#125;` would print as the expression
		// `{x}`.
		JSXText: (node, context) => {
			context.write(escape_jsx_text(node.raw), node);
		},

		// esrap's JSXOpeningElement printer doesn't emit `typeArguments`, so generic
		// component tags like `<RenderProp<User>>` lose the `<User>` in the output.
		JSXOpeningElement: (node, context) => {
			// A generated name (a lowered `<{tag}>`) follows no source token, so a
			// lone `<` would map the end of the source `<` to the generated name.
			if (node.name.type === 'JSXIdentifier' && !has_location(node.name)) {
				context.write(`<${node.name.name}`);
			} else {
				context.write('<');
				context.visit(node.name);
			}
			if (node.typeArguments) {
				context.visit(node.typeArguments);
			}
			for (const attribute of node.attributes) {
				context.write(' ');
				context.visit(attribute);
			}
			if (node.selfClosing) {
				context.write(' /');
			}
			context.write('>');
		},
		// esrap's TSExpressionWithTypeArguments printer only emits `expression`,
		// dropping interface heritage arguments such as the `<T>` in
		// `interface Foo<T> extends Bar<T> {}`. Besides changing the declaration's
		// semantics, that leaves segments.js unable to map the omitted node.
		TSExpressionWithTypeArguments: (node, context) => {
			context.visit(node.expression);
			if (node.typeParameters) {
				context.visit(node.typeParameters);
			}
		},
		// esrap's TSImportType printer drops `options`, the import attributes in
		// `import('./data.json', { with: { type: 'json' } })`, which TypeScript
		// reads, for instance to pick the module's `resolution-mode`
		// (sveltejs/esrap#231). Remove this once esrap prints them.
		TSImportType: (node, context) => {
			if (!node.options) {
				/** @type {NonNullable<typeof base.TSImportType>} */ (base.TSImportType)(node, context);
				return;
			}
			context.write('import(');
			context.visit(node.argument);
			context.write(', ');
			context.visit(node.options);
			context.write(')');
			if (node.qualifier) {
				context.write('.');
				context.visit(node.qualifier);
			}
			if (node.typeArguments) {
				context.visit(node.typeArguments);
			}
		},
		// acorn-typescript marks `export import A = B` with `isExport` instead of
		// wrapping it in an ExportNamedDeclaration, and esrap's printer ignores
		// the flag, so the compiled module silently lost the alias's export.
		// Tooling prints mark both ends, as for an ExportNamedDeclaration, so
		// the whole exported statement maps back to its source.
		TSImportEqualsDeclaration: (node, context) => {
			const print = /** @type {NonNullable<typeof base.TSImportEqualsDeclaration>} */ (
				base.TSImportEqualsDeclaration
			);
			if (!node.isExport) {
				print(node, context);
				return;
			}
			const loc = type_only ? node.loc : undefined;
			if (loc) context.location(loc.start.line, loc.start.column);
			context.write('export ');
			print(node, context);
			if (loc) context.location(loc.end.line, loc.end.column);
		},
		TSModuleDeclaration: (node, context) => {
			// `declare global` is represented as a TSModuleDeclaration whose id is
			// `global`; adding `module` changes it into an unrelated named module.
			// Ambient `declare module '…' { … }` must still keep its `declare` —
			// the typeOnly/volar output is real TS and `module '…' { … }` alone is
			// a syntax error (TS1035).
			if (node.declare) context.write('declare ');
			if (node.kind !== 'global') {
				context.write(node.kind);
				context.write(' ');
			}
			context.visit(node.id);
			// A dotted name (`namespace A.B { … }`) parses as nested declarations
			// whose body is the next name part; print one qualified name instead
			// of repeating the keyword (`namespace Anamespace B`).
			let body = node.body;
			while (body?.type === 'TSModuleDeclaration') {
				context.write('.');
				context.visit(body.id);
				body = body.body;
			}
			if (body) {
				context.visit(body);
			} else {
				// Shorthand ambient module: `declare module '…';`
				context.write(';');
			}
		},
		_(node, context, visit) {
			if (preserve_owner_comments) write_leading_comments(node, context);
			// esrap's `_` maps the start and end of every located node. A program's
			// start would map the source's first character to an import a target
			// adds before the first statement.
			if (base_visitor && node.type !== 'Program') {
				base_visitor(node, context, visit);
			} else {
				visit(node);
			}
			if (preserve_owner_comments) write_rest_of_line(node, context);
		},
	};

	return { ...base_visitors, ...wrappers };
}

/**
 * A newline is safe before a statement/declaration or a member, but not before
 * an arbitrary expression: `return /** @type {number} *\/ 1` must not become a
 * bare return, and `throw` forbids a line terminator before its argument.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_comment_owner(node) {
	return (
		node.type.endsWith('Declaration') ||
		node.type.endsWith('Statement') ||
		COMMENT_OWNER_NODE_TYPES.has(node.type)
	);
}

const COMMENT_OWNER_NODE_TYPES = new Set([
	'VariableDeclarator',
	'Property',
	'PropertyDefinition',
	'AccessorProperty',
	'MethodDefinition',
	'TSAbstractPropertyDefinition',
	'TSAbstractAccessorProperty',
	'TSAbstractMethodDefinition',
	'TSPropertySignature',
	'TSMethodSignature',
	'TSIndexSignature',
	'TSEnumMember',
	'TSExportAssignment',
]);

/** @type {WeakSet<AST.Node>} */
const arrow_type_parameters = new WeakSet();

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.JSXIfExpression | (AST.IfStatement & { statementType: 'IfStatement' })}
 */
export function is_template_if_node(node) {
	return (
		node?.type === 'JSXIfExpression' ||
		(node?.type === 'IfStatement' && node?.statementType === 'IfStatement')
	);
}

/**
 * A `@for … of …` directive, in either the expression or the retyped statement
 * form. `JSXForExpression` also covers `@for … in …` and plain `@for (;;)`, so
 * both arms must check `statementType` — callers read for-of-only fields such
 * as `await` off the result.
 *
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.JSXForOfExpression | (AST.ForOfStatement & { statementType: 'ForOfStatement' })}
 */
export function is_template_for_of_node(node) {
	return (
		(node?.type === 'JSXForExpression' || node?.type === 'ForOfStatement') &&
		node.statementType === 'ForOfStatement'
	);
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.JSXSwitchExpression | (AST.SwitchStatement & { statementType: 'SwitchStatement' })}
 */
export function is_template_switch_node(node) {
	return (
		node?.type === 'JSXSwitchExpression' ||
		(node?.type === 'SwitchStatement' && node?.statementType === 'SwitchStatement')
	);
}

/**
 * @param {AST.Node | null | undefined} node
 * @returns {node is AST.JSXTryExpression | (AST.TryStatement & { statementType: 'TryStatement' })}
 */
export function is_template_try_node(node) {
	return (
		node?.type === 'JSXTryExpression' ||
		(node?.type === 'TryStatement' && node?.statementType === 'TryStatement')
	);
}
