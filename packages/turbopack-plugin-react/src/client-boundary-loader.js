import path from 'node:path';
import { parse } from '@tsrx/react';

const CLIENT_QUERY = '?tsrx-client&lang.tsx';

/**
 * @typedef {{
 * 	resourcePath: string,
 * 	async: () => (err: unknown, output?: string | null) => void,
 * }} LoaderContext
 */

/** @typedef {ReturnType<typeof parse>} Program */

/**
 * @param {{ type: string, name?: string, value?: unknown }} node
 * @returns {unknown}
 */
function export_name(node) {
	return node.type === 'Identifier' ? node.name : node.value;
}

/**
 * @param {any} pattern
 * @param {Set<string>} names
 */
function add_pattern_names(pattern, names) {
	switch (pattern?.type) {
		case 'Identifier':
			names.add(pattern.name);
			break;
		case 'ObjectPattern':
			for (const property of pattern.properties) {
				add_pattern_names(property.type === 'RestElement' ? property : property.value, names);
			}
			break;
		case 'ArrayPattern':
			for (const element of pattern.elements) add_pattern_names(element, names);
			break;
		case 'AssignmentPattern':
			add_pattern_names(pattern.left, names);
			break;
		case 'RestElement':
			add_pattern_names(pattern.argument, names);
			break;
	}
}

/**
 * Top-level names that only name a type, which TypeScript erases along with
 * an export of them.
 *
 * @param {Program} ast
 * @returns {Set<string>}
 */
function get_type_only_names(ast) {
	/** @type {Set<string>} */
	const types = new Set();
	/** @type {Set<string>} */
	const values = new Set();
	for (const statement of ast.body) {
		const node = /** @type {any} */ (
			statement.type === 'ExportNamedDeclaration' && statement.declaration
				? statement.declaration
				: statement
		);
		switch (node.type) {
			case 'TSInterfaceDeclaration':
			case 'TSTypeAliasDeclaration':
				types.add(node.id.name);
				break;
			case 'ImportDeclaration':
				for (const specifier of node.specifiers) {
					const names =
						node.importKind === 'type' || specifier.importKind === 'type' ? types : values;
					names.add(specifier.local.name);
				}
				break;
			case 'VariableDeclaration':
				for (const declarator of node.declarations) add_pattern_names(declarator.id, values);
				break;
			case 'FunctionDeclaration':
			case 'ClassDeclaration':
			case 'TSEnumDeclaration':
			case 'TSModuleDeclaration':
				if (node.id?.type === 'Identifier') values.add(node.id.name);
				break;
		}
	}
	for (const name of values) types.delete(name);
	return types;
}

/**
 * Whether the module has a runtime default export, which `export *` does not
 * re-export.
 *
 * @param {Program} ast
 * @returns {boolean}
 */
function has_default_export(ast) {
	const type_only = get_type_only_names(ast);
	return ast.body.some((node) => {
		const export_kind = /** @type {any} */ (node).exportKind;
		if (export_kind === 'type') return false;
		switch (node.type) {
			case 'ExportDefaultDeclaration': {
				const declaration = /** @type {any} */ (node.declaration);
				if (declaration.type === 'Identifier') return !type_only.has(declaration.name);
				return (
					declaration.type !== 'TSInterfaceDeclaration' && declaration.type !== 'TSDeclareFunction'
				);
			}
			case 'ExportAllDeclaration':
				return node.exported != null && export_name(node.exported) === 'default';
			case 'ExportNamedDeclaration':
				return node.specifiers.some(
					(specifier) =>
						/** @type {any} */ (specifier).exportKind !== 'type' &&
						export_name(specifier.exported) === 'default' &&
						(node.source != null || !type_only.has(String(export_name(specifier.local)))),
				);
			default:
				return false;
		}
	});
}

/**
 * Emits the module that a `'use client'` `.tsrx` file is imported as: the
 * directive and a re-export of the compiled module, which the Turbopack config
 * helper compiles for the client query.
 *
 * @this {LoaderContext}
 * @param {string} source
 * @returns {void}
 */
export default function tsrx_react_turbopack_client_boundary_loader(source) {
	const callback = this.async();

	try {
		const ast = parse(source, this.resourcePath);
		const specifier = JSON.stringify(`./${path.basename(this.resourcePath)}${CLIENT_QUERY}`);
		let output = '';
		for (const node of ast.body) {
			const directive = 'directive' in node && node.directive;
			if (!directive) break;
			if (directive === 'use client') output += `'use client';\n`;
		}
		output += `export * from ${specifier};\n`;
		if (has_default_export(ast)) output += `export { default } from ${specifier};\n`;
		callback(null, output);
	} catch (/** @type {any} */ err) {
		callback(err);
	}
}
