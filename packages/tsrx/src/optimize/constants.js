/** @import * as AST from 'estree' */
/** @import { Binding, ScopeInterface, StaticValue, StaticValueResult } from '../../types/index' */

import { create_scopes, ScopeRoot } from '../scope.js';
import { evaluate_expression } from './evaluate.js';

/**
 * Globals whose value is fixed by the language.
 * They resolve only when the name is genuinely unbound.
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
 * Collects every scope in a module.
 * `create_scopes` returns the top-level scope apart from its node map.
 *
 * @param {AST.Program} ast
 * @param {string | null} filename
 * @returns {Set<ScopeInterface>}
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

	return new Set([scope, ...scopes.values()]);
}

/**
 * Reports whether a binding always holds the value of its initializer.
 *
 * @param {Binding} binding
 * @param {AST.VariableDeclarator} declarator
 * @returns {boolean}
 */
function is_constant_binding(binding, declarator) {
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
 * Builds the identifier resolver the directive tests are evaluated against.
 * Nothing here rewrites the module. The constants are only read, so that a
 * directive test written as `@if (flag)` can be decided.
 * Resolution repeats because one constant can unlock another.
 * `const b = a + 1` only becomes constant once `a` does.
 *
 * @param {AST.Program} ast
 * @param {string | null} filename
 * @returns {(node: AST.Identifier) => StaticValueResult}
 */
export function create_constant_resolver(ast, filename) {
	/**
	 * Identifier nodes that read a binding, mapped to that binding.
	 * @type {Map<AST.Identifier, Binding>}
	 */
	const references = new Map();
	/** @type {Array<{ binding: Binding, declarator: AST.VariableDeclarator }>} */
	const candidates = [];

	for (const scope of collect_scopes(ast, filename)) {
		for (const binding of scope.declarations.values()) {
			for (const reference of binding.references) {
				references.set(reference.node, binding);
			}
		}

		for (const [declarator, bindings] of scope.declarators) {
			const binding = bindings.length === 1 ? bindings[0] : undefined;
			if (binding && is_constant_binding(binding, declarator)) {
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

	return resolve;
}
