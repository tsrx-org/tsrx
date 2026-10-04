/** @import * as AST from 'estree' */
/** @import * as ESRap from 'esrap' */

/**
 * Add TSRX import-phase support to an esrap TS/TSX visitor set. esrap
 * understands the rest of ImportDeclaration but does not print its Stage 3
 * `phase` field yet, so delegating would silently turn a deferred import into
 * an eager one, and a source phase import into an ordinary default import.
 * UPSTREAM(sveltejs/esrap#249): remove once a release prints `phase`
 *
 * @template {ESRap.Visitors} T
 * @param {T} visitors
 * @returns {T}
 */
export function with_deferred_imports(visitors) {
	const print_import_declaration = visitors.ImportDeclaration;
	const print_import_expression = visitors.ImportExpression;
	if (
		typeof print_import_declaration !== 'function' ||
		typeof print_import_expression !== 'function'
	) {
		throw new TypeError('Deferred imports require a complete esrap TS or TSX visitor set.');
	}

	return /** @type {T} */ ({
		...visitors,
		/**
		 * @param {AST.ImportDeclaration} node
		 * @param {ESRap.Context} context
		 */
		ImportDeclaration(node, context) {
			const phase = import_phase(node);
			if (phase === null) {
				print_import_declaration(node, context);
				return;
			}

			const [specifier] = node.specifiers;
			if (phase === 'defer') {
				if (node.specifiers.length !== 1 || specifier.type !== 'ImportNamespaceSpecifier') {
					throw new Error('`import defer` only supports a namespace import.');
				}
			} else if (node.specifiers.length !== 1 || specifier.type !== 'ImportDefaultSpecifier') {
				throw new Error('`import source` only supports a default import.');
			}

			if (node.loc) context.location(node.loc.start.line, node.loc.start.column);
			context.write(`import ${phase} `);
			if (specifier.loc) {
				context.location(specifier.loc.start.line, specifier.loc.start.column);
			}
			if (phase === 'defer') context.write('* as ');
			context.visit(specifier.local);
			context.write(' from ');
			context.visit(node.source);

			const attributes = node.attributes ?? node.assertions ?? [];
			if (attributes.length > 0) {
				context.write(' with { ');
				for (let index = 0; index < attributes.length; index++) {
					context.visit(attributes[index].key);
					context.write(': ');
					context.visit(attributes[index].value);
					if (index + 1 !== attributes.length) context.write(', ');
				}
				context.write(' }');
			}

			context.write(';');
			if (node.loc) context.location(node.loc.end.line, node.loc.end.column);
		},
		/**
		 * @param {AST.ImportExpression} node
		 * @param {ESRap.Context} context
		 */
		ImportExpression(node, context) {
			const phase = import_phase(node);
			if (phase === null) {
				print_import_expression(node, context);
				return;
			}

			if (node.loc) context.location(node.loc.start.line, node.loc.start.column);
			context.write(`import.${phase}(`);
			context.visit(node.source);

			if (node.options) {
				context.write(', ');
				context.visit(node.options);
			}

			context.write(')');
			if (node.loc) context.location(node.loc.end.line, node.loc.end.column);
		},
	});
}

/**
 * The phase an import prints with, or `null` for an ordinary import, which
 * esrap prints. An unknown phase throws: esrap would print it as an ordinary
 * import, which loads a different thing.
 *
 * @param {AST.ImportDeclaration | AST.ImportExpression} node
 * @returns {'defer' | 'source' | null}
 */
function import_phase(node) {
	const phase = /** @type {{ phase?: unknown }} */ (node).phase;
	if (phase == null) return null;
	if (phase === 'defer' || phase === 'source') return phase;
	throw new Error(`Unsupported import phase \`${String(phase)}\`.`);
}
