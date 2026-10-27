/** @import * as AST from 'estree' */
/** @import * as ESRap from 'esrap' */

import tsx from 'esrap/languages/tsx';
import {
	format_comment,
	get_line_comments_after,
	is_file_level_pragma,
	is_ts_suppression_directive,
	should_preserve_comment,
	should_preserve_jsx_tooling_comment,
} from '../../comment-utils.js';
import { has_location, is_organized_import } from '../../utils/ast.js';
import { with_deferred_imports } from '../imports.js';
import { get_directive_line, print_on_directive_line } from './directive-line.js';

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
	 * The statements that the editor output ends without a `;`, as the source
	 * does. TypeScript writes the code of an edit with or without `;` as most
	 * statements of the file do, and TypeScript 7 offers a completion at the end
	 * of a name only inside text that is the same in both files (#1064). A `;`
	 * stays where the next line could continue the statement.
	 * @type {WeakSet<AST.Node>}
	 */
	const semicolon_free = new WeakSet();

	/**
	 * Find the statements of `node`'s statement list that end without `;`.
	 * @param {AST.Node} node
	 */
	const mark_semicolon_free = (node) => {
		if (!type_only || source === undefined) return;
		const statements =
			node.type === 'SwitchCase'
				? node.consequent
				: STATEMENT_LISTS.has(node.type)
					? /** @type {AST.Program | AST.BlockStatement} */ (node).body
					: null;
		if (!Array.isArray(statements)) return;
		/** @type {AST.Node | null} */
		let next = null;
		for (let index = statements.length - 1; index >= 0; index--) {
			const statement = statements[index];
			const owner = semicolon_free_statement(statement, source);
			// A statement the compiler prints in two places is decided for each.
			if (owner && (!next || starts_with_word(next))) semicolon_free.add(owner);
			else if (owner) semicolon_free.delete(owner);
			// The printer leaves out empty statements.
			if (statement.type !== 'EmptyStatement') next = statement;
		}
	};

	/**
	 * @param {AST.CommentWithLocation} comment
	 * @param {ESRap.Context} context
	 * @param {boolean} [inline] Follow the comment with a space, not a line break.
	 * @param {boolean} [kept] The caller keeps a comment the policy would drop.
	 */
	const write_preserved_comment = (comment, context, inline = false, kept = false) => {
		if (
			!emitted_comments ||
			(hashbang !== null && comment.start === 0) ||
			!(
				kept ||
				(preserve_owner_comments
					? should_preserve_jsx_tooling_comment(comment)
					: should_preserve_comment(comment))
			)
		) {
			return;
		}
		const key = `${comment.start}:${comment.end}:${comment.type}:${comment.value}`;
		if (emitted_comments.has(key)) return;
		emitted_comments.add(key);
		if (comment.loc) context.location(comment.loc.start.line, comment.loc.start.column);
		context.write(format_comment(comment));
		if (comment.loc) context.location(comment.loc.end.line, comment.loc.end.column);
		if (inline) {
			context.write(' ');
		} else {
			context.newline();
		}
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
	 * Write the leading comments the type view keeps so that each TypeScript
	 * directive covers the same code as in the source. TypeScript applies a
	 * directive to the first line after the one where it ends that is neither
	 * blank nor a line comment. So comments that share a line stay on one line,
	 * a block comment after a directive stays, since it ends the directive's
	 * reach, and a directive on the line where the node starts is left out: it
	 * covers the source line after it, which the printer may split or join.
	 * @param {AST.Node} node
	 * @param {ESRap.Context} context
	 * @returns {boolean} Whether a directive written here covers the line where
	 * the node starts.
	 */
	const write_leading_comments = (node, context) => {
		if (!node.leadingComments || !is_comment_owner(node) || !node.loc) return false;
		const start_line = node.loc.start.line;
		/** @type {Array<{ comment: AST.CommentWithLocation, kept: boolean }>} */
		const written = [];
		let after_directive = false;
		for (const comment of node.leadingComments) {
			if (!has_location(comment)) continue;
			const directive = is_ts_suppression_directive(comment);
			if (directive && comment.loc.end.line === start_line) continue;
			const kept = after_directive && comment.type === 'Block';
			if (kept || should_preserve_jsx_tooling_comment(comment)) written.push({ comment, kept });
			after_directive ||= directive;
		}
		let covers_node = false;
		for (let i = 0; i < written.length; i++) {
			const { comment, kept } = written[i];
			const next_line = written[i + 1]?.comment.loc.start.line ?? start_line;
			write_preserved_comment(comment, context, comment.loc.end.line === next_line, kept);
			covers_node ||=
				source !== undefined &&
				is_ts_suppression_directive(comment) &&
				get_directive_line(comment, source) === start_line;
		}
		return covers_node;
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
		// The editor output writes an import as it is in the source: TypeScript 7
		// applies an Organize Imports edit only to text that is the same in both
		// files. An import the compiler changed prints in esrap's layout.
		ImportDeclaration: (node, context) => {
			const names =
				type_only && source !== undefined ? import_names_as_written(node, source) : null;
			if (!names || source === undefined) {
				/** @type {NonNullable<typeof base.ImportDeclaration>} */ (base.ImportDeclaration)(
					node,
					context,
				);
				return;
			}
			let offset = /** @type {number} */ (node.start);
			for (const name of names) {
				write_source_text(source.slice(offset, name.start), context);
				context.visit(name);
				offset = name.end;
			}
			write_source_text(source.slice(offset, node.end), context);
		},
		ArrayPattern: (node, context) => {
			print_binding_pattern(
				/** @type {NonNullable<typeof base.ArrayPattern>} */ (base.ArrayPattern),
				node,
				context,
			);
		},
		ObjectPattern: (node, context) => {
			print_binding_pattern(
				/** @type {NonNullable<typeof base.ObjectPattern>} */ (base.ObjectPattern),
				node,
				context,
			);
		},
		// esrap prints a string statement that is not a directive without its
		// parentheses, so `('use strict');` became a directive.
		// UPSTREAM(sveltejs/esrap#246): remove once a release includes the fix
		ExpressionStatement: (node, context) => {
			if (semicolon_free.has(node)) {
				context.visit(node.expression);
				return;
			}
			const expression = node.expression;
			if (
				!('directive' in node && typeof node.directive === 'string') &&
				expression.type === 'Literal' &&
				typeof expression.value === 'string'
			) {
				context.write('(');
				context.visit(expression);
				context.write(');');
				return;
			}
			/** @type {NonNullable<typeof base.ExpressionStatement>} */ (base.ExpressionStatement)(
				node,
				context,
			);
		},
		// esrap's printers of these statements end them with `;`.
		VariableDeclaration: (node, context) => {
			if (!semicolon_free.has(node)) {
				/** @type {NonNullable<typeof base.VariableDeclaration>} */ (base.VariableDeclaration)(
					node,
					context,
				);
				return;
			}
			if (node.declare) {
				write_keyword('declare', node, context);
				context.write(' ');
				context.write(node.kind);
			} else {
				write_keyword(node.kind, node, context);
			}
			context.write(' ');
			context.visit(node.declarations[0]);
		},
		ReturnStatement: (node, context) => {
			if (!semicolon_free.has(node)) {
				/** @type {NonNullable<typeof base.ReturnStatement>} */ (base.ReturnStatement)(
					node,
					context,
				);
				return;
			}
			write_keyword('return', node, context);
			if (node.argument) {
				context.write(' ');
				context.visit(node.argument);
			}
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
				if (!should_preserve_jsx_tooling_comment(comment) || comment.value.includes('*/')) continue;
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
			mark_semicolon_free(node);
			const covered = preserve_owner_comments && write_leading_comments(node, context);
			// esrap's `_` maps the start and end of every located node. A program's
			// start would map the source's first character to an import a target
			// adds before the first statement.
			if (covered && base_visitor && source !== undefined && node.loc) {
				print_on_directive_line(node, context, node.loc.start.line, source, visitors, base_visitor);
			} else if (base_visitor && node.type !== 'Program') {
				base_visitor(node, context, visit);
			} else {
				visit(node);
			}
			if (preserve_owner_comments) write_rest_of_line(node, context);
		},
	};

	/** @type {ESRap.Visitors<AST.Node>} */
	const visitors = { ...base_visitors, ...wrappers };
	return visitors;
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

const STATEMENT_LISTS = new Set(['Program', 'BlockStatement', 'StaticBlock', 'TSModuleBlock']);

/**
 * Statements that print starting with a keyword or a name, which no statement
 * before them continues into across a line break. Not a block: TypeScript
 * reads `(c)` and a `{` on the next line as an arrow function without `=>`.
 */
const WORD_STATEMENTS = new Set([
	'BreakStatement',
	'ClassDeclaration',
	'ContinueStatement',
	'DebuggerStatement',
	'DoWhileStatement',
	'ExportAllDeclaration',
	'ExportDefaultDeclaration',
	'ExportNamedDeclaration',
	'ForInStatement',
	'ForOfStatement',
	'ForStatement',
	'FunctionDeclaration',
	'IfStatement',
	'ImportDeclaration',
	'LabeledStatement',
	'ReturnStatement',
	'SwitchStatement',
	'ThrowStatement',
	'TryStatement',
	'TSDeclareFunction',
	'TSEnumDeclaration',
	'TSExportAssignment',
	'TSImportEqualsDeclaration',
	'TSInterfaceDeclaration',
	'TSModuleDeclaration',
	'TSNamespaceExportDeclaration',
	'TSTypeAliasDeclaration',
	'VariableDeclaration',
	'WhileStatement',
]);

/**
 * The node whose printer writes the `;` of `statement`, when the source ends
 * the statement without one: a statement whose source ends with its last
 * expression or declarator, or the `return` the compiler adds around a
 * template's output. An expression statement keeps its `;` unless it starts
 * with a name or keyword, which the printer never wraps in parentheses.
 * @param {AST.Node} statement
 * @param {string} source
 * @returns {AST.Node | null}
 */
function semicolon_free_statement(statement, source) {
	if (statement.type === 'ReturnStatement') {
		if (has_location(statement) && source.startsWith('return', statement.start)) {
			const end = statement.argument ? statement.argument.end : statement.start + 'return'.length;
			return statement.end === end ? statement : null;
		}
		return has_location(statement) || has_location(statement.argument) ? statement : null;
	}
	if (!has_location(statement)) return null;
	switch (statement.type) {
		case 'ExpressionStatement':
			return has_location(statement.expression) &&
				statement.end === statement.expression.end &&
				expression_starts_with_word(statement.expression)
				? statement
				: null;
		case 'VariableDeclaration':
			return ends_with_declarator(statement, source) ? statement : null;
		case 'ExportNamedDeclaration':
			return statement.declaration?.type === 'VariableDeclaration' &&
				ends_with_declarator(statement.declaration, source)
				? statement.declaration
				: null;
	}
	return null;
}

/**
 * Whether an authored declaration of one variable ends with its declarator.
 * A declaration the compiler adds can carry the location of other code.
 * @param {AST.VariableDeclaration} node
 * @param {string} source
 * @returns {boolean}
 */
function ends_with_declarator(node, source) {
	const [declarator] = node.declarations;
	return (
		node.declarations.length === 1 &&
		has_location(node) &&
		has_location(declarator) &&
		node.end === declarator.end &&
		source.startsWith(node.declare ? 'declare' : node.kind, node.start)
	);
}

/**
 * @param {AST.Node} node a statement
 * @returns {boolean}
 */
function starts_with_word(node) {
	if (node.type === 'ExpressionStatement') {
		return (
			typeof (/** @type {{ directive?: unknown }} */ (node).directive) !== 'string' &&
			expression_starts_with_word(node.expression)
		);
	}
	return WORD_STATEMENTS.has(node.type);
}

/**
 * Whether the printed expression starts with a keyword or a name: `new`,
 * `await`, `typeof`, `true`, or a chain of member accesses and calls on a
 * name, also as the left operand of an operator.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function expression_starts_with_word(node) {
	switch (node.type) {
		case 'NewExpression':
		case 'AwaitExpression':
		case 'YieldExpression':
			return true;
		case 'UnaryExpression':
			return /^[a-z]/.test(node.operator);
		case 'AssignmentExpression':
		case 'BinaryExpression':
		case 'LogicalExpression':
			return is_name_chain(node.left);
		case 'ConditionalExpression':
			return is_name_chain(node.test);
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
			return is_name_chain(node.expression);
		case 'UpdateExpression':
			return !node.prefix && is_name_chain(node.argument);
		case 'ChainExpression':
		case 'TSInstantiationExpression':
			return is_name_chain(node.expression);
		case 'Literal':
			return /^(?:true|false|null)$/.test(node.raw ?? '');
	}
	return is_name_chain(node);
}

/**
 * A name, `this`, `super`, `import(…)` or `import.meta`, or member accesses
 * and calls on one: the printer never wraps them in parentheses.
 * @param {AST.Node} node
 * @returns {boolean}
 */
function is_name_chain(node) {
	while (true) {
		switch (node.type) {
			case 'Identifier':
			case 'ThisExpression':
			case 'Super':
			case 'ImportExpression':
			case 'MetaProperty':
				return true;
			case 'MemberExpression':
				node = node.object;
				break;
			case 'CallExpression':
				node = node.callee;
				break;
			case 'TaggedTemplateExpression':
				node = node.tag;
				break;
			case 'TSNonNullExpression':
				node = node.expression;
				break;
			default:
				return false;
		}
	}
}

/**
 * Write a keyword the way esrap's `token` does: mapped to the source token
 * when there is one, with the end of the keyword after it.
 * @param {string} keyword
 * @param {AST.Node} node
 * @param {ESRap.Context} context
 */
function write_keyword(keyword, node, context) {
	context.write(keyword);
	if (node.loc) context.location(node.loc.start.line, node.loc.start.column + keyword.length);
}

/**
 * The text of an import around its names: spaces, comments, and the keywords
 * and punctuation of the import syntax.
 */
const regex_import_text_token =
	/\s+|\/\/[^\n\r\u2028\u2029]*|\/\*[\s\S]*?\*\/|[{},*:;]|[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*|[^]/gu;
const regex_spaces_or_comment = /^(?:\s|\/\/|\/\*)/;
const regex_line_break = /[\n\r\u2028\u2029]/;
const IMPORT_SYNTAX = new Set([
	'{',
	'}',
	',',
	'*',
	':',
	';',
	'import',
	'defer',
	'source',
	'type',
	'typeof',
	'as',
	'from',
	'with',
	'assert',
]);

/**
 * The names, module string and attribute keys and values of an import that
 * the compiler did not change, in source order, or `null` when it changed the
 * import: a name has no location or another spelling, or the text between two
 * names holds more than the import syntax, as after a removed name.
 * @param {AST.ImportDeclaration | AST.TSRXImportDeclaration} node
 * @param {string} source
 * @returns {Array<AST.Node & AST.NodeWithLocation> | null}
 */
function import_names_as_written(node, source) {
	if (!has_location(node)) return null;
	/** @type {AST.Node[]} */
	const nodes = [];
	for (const specifier of node.specifiers) {
		if (!has_location(specifier)) return null;
		if (specifier.type === 'ImportSpecifier') nodes.push(specifier.imported);
		nodes.push(specifier.local);
	}
	nodes.push(node.source);
	for (const attribute of node.attributes ?? []) nodes.push(attribute.key, attribute.value);

	/** @type {Array<AST.Node & AST.NodeWithLocation>} */
	const names = [];
	for (const name of nodes) {
		if (!has_location(name)) return null;
		const text = source.slice(name.start, name.end);
		const printed =
			name.type === 'Identifier' ? name.name : name.type === 'Literal' ? name.raw : undefined;
		if (printed !== text) return null;
		// A name written once (`{ a }`) is both the imported and the local name.
		if (!names.some((other) => other.start === name.start)) names.push(name);
	}
	names.sort((a, b) => a.start - b.start);

	let offset = /** @type {number} */ (node.start);
	for (const name of [...names, null]) {
		const end = name ? name.start : /** @type {number} */ (node.end);
		if (end < offset) return null;
		let line_break = false;
		for (const [token] of source.slice(offset, end).matchAll(regex_import_text_token)) {
			if (!IMPORT_SYNTAX.has(token) && !regex_spaces_or_comment.test(token)) return null;
			// TypeScript reads `with` or `assert` after a line break as a new
			// statement.
			if ((token === 'with' || token === 'assert') && line_break) return null;
			line_break ||= regex_line_break.test(token);
		}
		if (name) offset = name.end;
	}
	return names;
}

/**
 * Write source text one token at a time, so that each keyword and punctuation
 * maps to its source token.
 * @param {string} text
 * @param {ESRap.Context} context
 */
function write_source_text(text, context) {
	for (const [token] of text.matchAll(regex_import_text_token)) {
		context.write(token);
	}
}

/**
 * esrap prints a binding pattern's type annotation but not the `?` of an
 * optional one, `{ a }?: T` in a declared function or a signature, which then
 * became a required parameter.
 * UPSTREAM(sveltejs/esrap#245): remove once a release includes the fix
 * @template {AST.ArrayPattern | AST.ObjectPattern} T
 * @param {(node: T, context: ESRap.Context) => void} print
 * @param {T} node
 * @param {ESRap.Context} context
 */
function print_binding_pattern(print, node, context) {
	if (!node.optional) {
		print(node, context);
		return;
	}
	print({ ...node, typeAnnotation: undefined }, context);
	context.write('?');
	if (node.typeAnnotation) context.visit(node.typeAnnotation);
}

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
