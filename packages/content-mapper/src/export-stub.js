/** @import * as AST from 'estree' */

/**
 * Build a TypeScript stub that preserves a module's export surface while the
 * file cannot be compiled.
 *
 * The native content-mapper protocol offers no way to suppress TypeScript's
 * own diagnostics, so feeding raw TSRX (or the last good TSX, which may carry
 * type errors of its own) to the checker would produce noise. Instead every
 * export from the last successful transform's source AST is re-declared as
 * `any` (both as a value and as a type, so `new X()`, `X.y` and `let v: X` all
 * keep resolving), re-exports from other modules are kept as written (including
 * their `type` modifiers, so `isolatedModules` and `verbatimModuleSyntax` do
 * not reject the stub), and the compile error is reported through the mapper's
 * own diagnostics. Importers keep resolving; the author sees one error at the
 * right place.
 * @param {AST.Program | null | undefined} program The last successfully parsed source AST, if any.
 * @returns {string}
 */
export function build_export_stub(program) {
	/** @type {string[]} */
	const lines = [];
	/** @type {Set<string>} */
	const names = new Set();
	let has_default = false;

	for (const statement of program?.body ?? []) {
		switch (statement.type) {
			case 'ExportAllDeclaration': {
				const exported = statement.exported ? ` as ${export_name(statement.exported)}` : '';
				lines.push(
					`export ${type_modifier(statement)}*${exported} from ${JSON.stringify(String(statement.source.value))};`,
				);
				break;
			}
			case 'ExportDefaultDeclaration':
				has_default = true;
				break;
			case 'ExportNamedDeclaration': {
				if (statement.source) {
					const statement_is_type = type_modifier(statement) !== '';
					const specifiers = statement.specifiers.map((specifier) => {
						const local = export_name(specifier.local);
						const exported = export_name(specifier.exported);
						// `export type { A }` marks the statement; `export { type A }`
						// marks the specifier. Never write both.
						const modifier = statement_is_type ? '' : type_modifier(specifier);
						return `${modifier}${local === exported ? local : `${local} as ${exported}`}`;
					});
					lines.push(
						`export ${type_modifier(statement)}{ ${specifiers.join(', ')} } from ${JSON.stringify(String(statement.source.value))};`,
					);
					break;
				}
				for (const specifier of statement.specifiers) {
					const exported = export_name(specifier.exported);
					if (exported === 'default') has_default = true;
					else names.add(exported);
				}
				if (statement.declaration) {
					for (const name of declaration_names(statement.declaration)) {
						names.add(name);
					}
				}
				break;
			}
			default:
				break;
		}
	}

	for (const name of names) {
		if (!/^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u.test(name)) continue;
		lines.push(`export declare const ${name}: any;`);
		lines.push(`export type ${name} = any;`);
	}
	if (has_default) {
		lines.push('declare const _default: any;');
		lines.push('export default _default;');
	}
	if (lines.length === 0) {
		lines.push('export {};');
	}
	return lines.join('\n') + '\n';
}

/**
 * `type ` for a type-only export statement or specifier (the ESTree-TS
 * `exportKind` field), else the empty string.
 * @param {AST.Node} node
 * @returns {'type ' | ''}
 */
function type_modifier(node) {
	return /** @type {{ exportKind?: string }} */ (node).exportKind === 'type' ? 'type ' : '';
}

/**
 * @param {AST.Identifier | AST.Literal | AST.Expression} node
 * @returns {string}
 */
function export_name(node) {
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'Literal') return String(node.value);
	return '';
}

/**
 * @param {AST.Declaration | AST.Node} declaration
 * @returns {string[]}
 */
function declaration_names(declaration) {
	switch (declaration.type) {
		case 'VariableDeclaration':
			return declaration.declarations.flatMap((declarator) => pattern_names(declarator.id));
		case 'FunctionDeclaration':
		case 'ClassDeclaration':
			return declaration.id ? [declaration.id.name] : [];
		default: {
			// TypeScript declarations (interface, type alias, enum, module) all
			// carry an `id` identifier in the ESTree-TS shape.
			const id = /** @type {{ id?: AST.Node }} */ (declaration).id;
			return id && id.type === 'Identifier' ? [/** @type {AST.Identifier} */ (id).name] : [];
		}
	}
}

/**
 * @param {AST.Pattern} pattern
 * @returns {string[]}
 */
function pattern_names(pattern) {
	switch (pattern.type) {
		case 'Identifier':
			return [pattern.name];
		case 'ObjectPattern':
			return pattern.properties.flatMap((property) =>
				property.type === 'RestElement'
					? pattern_names(property.argument)
					: pattern_names(property.value),
			);
		case 'ArrayPattern':
			return pattern.elements.flatMap((element) => (element ? pattern_names(element) : []));
		case 'RestElement':
			return pattern_names(pattern.argument);
		case 'AssignmentPattern':
			return pattern_names(pattern.left);
		default:
			return [];
	}
}
