/** @import * as AST from 'estree' */
/** @import { Binding, ScopeInterface, StaticValue, StaticValueResult } from '../../types/index' */

import { walk } from 'zimmerframe';
import { create_scopes, ScopeRoot } from '../scope.js';
import { evaluate_expression } from './evaluate.js';

/**
 * Globals whose value is fixed by the language.
 * They fold only when the name is genuinely unbound.
 * A local `const undefined = 1` creates a binding, which takes priority.
 *
 * @type {Map<string, StaticValue>}
 */
const INTRINSIC_GLOBALS = new Map([
	['undefined', undefined],
	['NaN', NaN],
	['Infinity', Infinity],
]);

/**
 * Names that must survive even when nothing appears to use them.
 * Scope analysis skips TypeScript nodes.
 * So `typeof x` in a type position never registers as a reference.
 * Neither does `export { x }`.
 * Removing such a declaration would compile but break the emitted types.
 * Every name in either position is therefore pinned by name.
 * The check is coarse on purpose, since a false positive only keeps a declaration.
 *
 * @param {AST.Program} ast
 * @returns {Set<string>}
 */
function collect_protected_names(ast) {
	/** @type {Set<string>} */
	const names = new Set();

	walk(/** @type {AST.Node} */ (ast), /** @type {{ in_type: boolean }} */ ({ in_type: false }), {
		_(node, { next, state }) {
			// Everything below a TypeScript node is a type position.
			// That includes the type annotations hanging off ordinary nodes.
			const in_type = state?.in_type || node.type.startsWith('TS');

			if (in_type || node.type === 'ExportSpecifier') {
				if (node.type === 'Identifier') names.add(node.name);
			}

			next({ in_type: in_type || node.type === 'ExportSpecifier' });
		},
	});

	return names;
}

/**
 * Collects every scope in a module.
 * `create_scopes` returns the top-level scope apart from its node map.
 *
 * @param {AST.Program} ast
 * @param {string | null} filename
 * @returns {{ scopes: Set<ScopeInterface> }}
 */
function collect_scopes(ast, filename) {
	const { scope, scopes } = create_scopes(ast, new ScopeRoot(), null, {
		// Analysis has already reported any real problems by this point.
		// Collecting into a throwaway array stops a duplicate declaration
		// from aborting the build a second time.
		collect: true,
		errors: [],
		filename: filename ?? '',
	});

	return { scopes: new Set([scope, ...scopes.values()]) };
}

/**
 * Reports whether a binding can be replaced at its use sites by its value.
 *
 * @param {Binding} binding
 * @param {AST.VariableDeclarator} declarator
 * @returns {boolean}
 */
function is_foldable_binding(binding, declarator) {
	return (
		binding.kind === 'normal' &&
		binding.declaration_kind === 'const' &&
		// `updated` covers both reassignment and property mutation.
		!binding.updated &&
		// A destructuring pattern binds part of the initializer, not all of it.
		// `binding.initial` would be the wrong value there.
		declarator.id.type === 'Identifier' &&
		declarator.id === binding.node &&
		!!binding.initial
	);
}

/**
 * Resolves every constant binding in a module.
 * The result is indexed by the identifier nodes that read each binding.
 * Resolution repeats because one constant can unlock another.
 * `const b = a + 1` only becomes constant once `a` does.
 * Candidates are rechecked until a full sweep adds nothing.
 *
 * @param {AST.Program} ast
 * @param {string | null} filename
 * @returns {{
 *   values: Map<AST.Identifier, StaticValue>,
 *   declarations: Map<AST.Identifier, Binding>,
 *   unused: Set<Binding>,
 *   resolve: (node: AST.Identifier) => StaticValueResult,
 * }}
 */
export function analyze_constants(ast, filename) {
	const { scopes } = collect_scopes(ast, filename);
	const protected_names = collect_protected_names(ast);

	/**
	 * Identifier nodes that read a binding, mapped to that binding.
	 * @type {Map<AST.Identifier, Binding>}
	 */
	const references = new Map();
	/**
	 * Identifier nodes that declare a binding.
	 * @type {Map<AST.Identifier, Binding>}
	 */
	const declarations = new Map();
	/** @type {Array<{ binding: Binding, declarator: AST.VariableDeclarator }>} */
	const candidates = [];
	/** @type {Set<Binding>} */
	const unused = new Set();

	for (const scope of scopes) {
		for (const binding of scope.declarations.values()) {
			declarations.set(binding.node, binding);
			for (const reference of binding.references) {
				references.set(reference.node, binding);
			}

			// Scope analysis counts the declaring identifier as a reference.
			// So a name nothing reads still reports one reference.
			const reads = binding.references.filter((reference) => reference.node !== binding.node);

			if (reads.length === 0 && !binding.updated && !protected_names.has(binding.node.name)) {
				unused.add(binding);
			}
		}

		for (const [declarator, bindings] of scope.declarators) {
			const binding = bindings.length === 1 ? bindings[0] : undefined;
			if (binding && is_foldable_binding(binding, declarator)) {
				candidates.push({ binding, declarator });
			}
		}
	}

	/** @type {Map<Binding, StaticValue>} */
	const constants = new Map();

	/**
	 * @param {AST.Identifier} node
	 * @returns {StaticValueResult}
	 */
	function resolve(node) {
		const binding = references.get(node);

		if (!binding) {
			return INTRINSIC_GLOBALS.has(node.name) ? { value: INTRINSIC_GLOBALS.get(node.name) } : null;
		}

		return constants.has(binding) ? { value: constants.get(binding) } : null;
	}

	let progressed = true;
	while (progressed) {
		progressed = false;

		for (const { binding } of candidates) {
			if (constants.has(binding)) continue;

			const evaluated = evaluate_expression(
				/** @type {AST.Expression} */ (binding.initial),
				resolve,
			);
			if (!evaluated) continue;

			constants.set(binding, evaluated.value);
			progressed = true;
		}
	}

	/** @type {Map<AST.Identifier, StaticValue>} */
	const values = new Map();
	for (const [node, binding] of references) {
		if (constants.has(binding)) values.set(node, constants.get(binding));
	}

	return { values, declarations, unused, resolve };
}
